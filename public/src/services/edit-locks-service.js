// public/src/services/edit-locks-service.js
//
// Generic edit-locking primitive per master prompt §13. Used wherever two
// staff members editing the same record concurrently could lose each other's
// changes — kids, subscriptions, catalog items.
//
// Design pattern: caller calls acquireLock(...) to start an edit session.
// On success, gets back a LockSession object that owns:
//   - the heartbeat timer (debounced activity → Firestore write)
//   - the inactivity timer (fires the warning modal)
//   - the warning countdown timer (fires the auto-release)
//   - the warning modal DOM (rendered by THIS service, not the caller)
//   - the release path (save / cancel / auto-exit)
//
// The caller's only responsibilities:
//   1. Call session.recordActivity() on every input event in their form.
//      It's safe to call this 100x per second — internally debounced.
//   2. Call session.release() when the user saves or cancels.
//   3. Provide an onAutoExit callback that runs when the warning countdown
//      finishes — typically discards unsaved changes and navigates away.
//   4. (Optional) provide an onLockChanged callback if the form needs to
//      know when a remote write changes the lock state (e.g. another tab
//      stole the lock — should never happen normally).
//
// To watch a lock WITHOUT acquiring it (for the "locked by other" banner),
// use subscribeToLock(lockKey, callback). Returns an unsubscribe fn.
//
// Lock document schema per §7 / §13:
//   editLocks/{lockKey}
//   {
//     KidID: lockKey (legacy field name from §7; we keep it for compatibility
//            even when locking non-kid records — semantically "the locked
//            record's ID", whatever it is)
//     LockedBy: uid
//     LockedByName: displayName/email
//     LockedAt: serverTimestamp
//     LastActivityAt: serverTimestamp
//     ExpiresAt: Timestamp (LastActivityAt + inactivitySeconds; client-computed)
//   }
//
// Public API:
//   acquireLock({ lockKey, profile, timeouts?, onAutoExit, onLockChanged? })
//     → Promise<{ ok: true, session: LockSession }
//             | { ok: false, errorKey: "lockedByOther" | ..., heldBy?: { name, since } }>
//
//   subscribeToLock(lockKey, callback)
//     → unsubscribe()
//     callback receives { exists, isExpired, lock | null }
//
//   DEFAULT_TIMEOUTS — exported constants for callers that want to display them.

import {
  doc,
  getDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import { db } from "../firebase-init.js";
import { TENANT_ID } from "../config.js";
import { strings } from "../strings/en.js";
import { logError } from "./errors-service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Defaults & constants
// ─────────────────────────────────────────────────────────────────────────────

// §13: default inactivity 60s, warning 15s. Read from settings/general in
// the future via getLockTimeouts(); these are fallbacks when the field is
// missing. Decision §39.11(1)(a): no migration, defaults live here.
export const DEFAULT_TIMEOUTS = Object.freeze({
  inactivitySeconds: 60,
  warningSeconds:    15
});

// Heartbeat: at most one Firestore write every HEARTBEAT_DEBOUNCE_MS.
// 2000ms per §13 ("debounced to once per 2 seconds").
const HEARTBEAT_DEBOUNCE_MS = 2000;

// Countdown UI tick rate. 100ms is smooth without being wasteful.
const COUNTDOWN_TICK_MS = 100;

// ─────────────────────────────────────────────────────────────────────────────
// acquireLock
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Object}  args
 * @param {string}  args.lockKey       Document ID under editLocks/. Usually a kidId.
 * @param {Object}  args.profile       Signed-in user profile { uid, email, username, ... }
 * @param {Object}  [args.timeouts]    { inactivitySeconds, warningSeconds }. Falls back to defaults.
 * @param {Function} args.onAutoExit   () => void. Called when warning countdown finishes.
 * @param {Function} [args.onLockChanged] (lockState) => void. Called on any remote write to the lock doc.
 *
 * @returns {Promise<{ ok: true, session: LockSession }
 *                 | { ok: false, errorKey: string, heldBy?: { name, since } }>}
 */
export async function acquireLock({
  lockKey,
  profile,
  timeouts,
  onAutoExit,
  onLockChanged
}) {
  if (!lockKey || typeof lockKey !== "string") {
    return { ok: false, errorKey: "lockKeyMissing" };
  }
  if (!profile || !profile.uid) {
    return { ok: false, errorKey: "notSignedIn" };
  }
  if (typeof onAutoExit !== "function") {
    // Programming error — make it loud, not silent.
    throw new Error("acquireLock requires onAutoExit callback");
  }

  const t = normalizeTimeouts(timeouts);
  const lockRef = doc(db, "tenants", TENANT_ID, "editLocks", lockKey);

  // ── Transaction: acquire-or-fail ──
  // We compute ExpiresAt client-side from a JS Date because Firestore
  // serverTimestamp() can't be read inside the same transaction that writes
  // it. The slight client/server clock drift is acceptable here — the lock
  // is a UX construct, not a security boundary.
  let result;
  try {
    result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(lockRef);
      const now = Date.now();

      if (snap.exists()) {
        const data = snap.data();
        const expiresAtMs = data.ExpiresAt?.toMillis?.() ?? 0;

        if (expiresAtMs > now && data.LockedBy !== profile.uid) {
          // Held by someone else and not yet expired → caller can't have it.
          return {
            acquired: false,
            heldBy: {
              name: data.LockedByName || strings.editLocks.unknownHolder,
              uid:  data.LockedBy,
              since: data.LockedAt
            }
          };
        }
        // Either expired, OR same user re-acquiring (page reload, route bounce).
        // Both cases: overwrite cleanly below.
      }

      const expiresAt = Timestamp.fromMillis(now + t.inactivitySeconds * 1000);
      tx.set(lockRef, {
        KidID: lockKey,
        LockedBy: profile.uid,
        LockedByName: profile.username || profile.email || strings.editLocks.unknownHolder,
        LockedAt: serverTimestamp(),
        LastActivityAt: serverTimestamp(),
        ExpiresAt: expiresAt
      });

      return { acquired: true };
    });
  } catch (err) {
    await logError({
      source: "frontend",
      page: "edit-locks",
      action: "acquireLock:transaction",
      error: err,
      context: { lockKey }
    });
    return { ok: false, errorKey: "lockAcquireFailed" };
  }

  if (!result.acquired) {
    return {
      ok: false,
      errorKey: "lockedByOther",
      heldBy: {
        name: result.heldBy.name,
        since: result.heldBy.since
      }
    };
  }

  // ── Build the session object that owns all the runtime state ──
  const session = createLockSession({
    lockKey,
    profile,
    timeouts: t,
    onAutoExit,
    onLockChanged
  });

  return { ok: true, session };
}

// ─────────────────────────────────────────────────────────────────────────────
// LockSession factory (no class — closure over private state)
// ─────────────────────────────────────────────────────────────────────────────

function createLockSession({
  lockKey,
  profile,
  timeouts,
  onAutoExit,
  onLockChanged
}) {
  const lockRef = doc(db, "tenants", TENANT_ID, "editLocks", lockKey);

  // Heartbeat debounce
  let lastHeartbeatWriteMs = Date.now();
  let pendingHeartbeatTimer = null;

  // Inactivity → warning
  let inactivityTimer = null;

  // Warning countdown
  let warningModal = null;            // DOM element while showing
  let countdownTimer = null;
  let warningStartedAtMs = null;

  // Remote subscription (lets caller know if their own lock disappears
  // unexpectedly — e.g. another admin force-released it).
  let unsubRemote = null;

  // Lifecycle flags
  let released = false;
  let autoExited = false;

  // ── Inactivity timer ──
  function armInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(showWarning, timeouts.inactivitySeconds * 1000);
  }

  // ── Heartbeat ──
  function recordActivity() {
    if (released) return;

    // If the warning is showing, recordActivity dismisses it. The user is
    // back; reset everything.
    if (warningModal) dismissWarning();

    armInactivityTimer();

    const now = Date.now();
    const elapsed = now - lastHeartbeatWriteMs;
    if (elapsed >= HEARTBEAT_DEBOUNCE_MS) {
      writeHeartbeat();
    } else if (!pendingHeartbeatTimer) {
      pendingHeartbeatTimer = setTimeout(() => {
        pendingHeartbeatTimer = null;
        writeHeartbeat();
      }, HEARTBEAT_DEBOUNCE_MS - elapsed);
    }
    // else: heartbeat already pending, will fire soon. Skip.
  }

  async function writeHeartbeat() {
    if (released) return;
    lastHeartbeatWriteMs = Date.now();
    const newExpiresAt = Timestamp.fromMillis(Date.now() + timeouts.inactivitySeconds * 1000);

    try {
      // updateDoc would be ideal but transactions guarantee atomicity if we
      // ever later add cross-doc writes. For now plain set with merge is fine
      // and simpler. Use the same path the transaction wrote to.
      // We use serverTimestamp for LastActivityAt so server-side queries
      // remain truthful, and a client-computed ExpiresAt because
      // serverTimestamp can't participate in arithmetic.
      const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
      await updateDoc(lockRef, {
        LastActivityAt: serverTimestamp(),
        ExpiresAt: newExpiresAt
      });
    } catch (err) {
      // Failure modes:
      //  - permission-denied: lock was force-released by a SuperAdmin or
      //    Auth session expired. Either way, caller's session is over.
      //  - network error: transient; we'll retry on next activity.
      // Log either way; don't bring down the form.
      await logError({
        source: "frontend",
        page: "edit-locks",
        action: "writeHeartbeat",
        error: err,
        context: { lockKey }
      });
    }
  }

  // ── Warning modal ──
  function showWarning() {
    if (released) return;
    if (warningModal) return; // already showing

    warningStartedAtMs = Date.now();
    warningModal = renderWarningModal({
      totalSeconds: timeouts.warningSeconds,
      onContinue: () => recordActivity(),     // user clicked "Keep editing"
      onLeave:    () => triggerAutoExit()     // user clicked "Discard"
    });

    // Tick the countdown every 100ms; trigger auto-exit when it hits zero.
    countdownTimer = setInterval(() => {
      if (released || !warningModal) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        return;
      }
      const elapsed = Date.now() - warningStartedAtMs;
      const remaining = timeouts.warningSeconds * 1000 - elapsed;
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        triggerAutoExit();
      } else {
        updateWarningModalCountdown(warningModal, remaining);
      }
    }, COUNTDOWN_TICK_MS);
  }

  function dismissWarning() {
    if (warningModal) {
      warningModal.remove();
      warningModal = null;
    }
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    warningStartedAtMs = null;
  }

  function triggerAutoExit() {
    if (autoExited || released) return;
    autoExited = true;
    dismissWarning();
    // Release lock and notify caller. Order matters: release first so the
    // caller's onAutoExit can navigate away without being blocked.
    releaseInternal({ silent: false }).catch(() => {/* logged inside */});
    try { onAutoExit(); } catch (e) { console.error("[edit-locks] onAutoExit threw:", e); }
  }

  // ── Release ──
  async function release() {
    return releaseInternal({ silent: false });
  }

  async function releaseInternal({ silent }) {
    if (released) return;
    released = true;

    // Stop all timers immediately to avoid stray callbacks.
    if (inactivityTimer)        clearTimeout(inactivityTimer);
    if (pendingHeartbeatTimer)  clearTimeout(pendingHeartbeatTimer);
    if (countdownTimer)         clearInterval(countdownTimer);
    inactivityTimer = pendingHeartbeatTimer = countdownTimer = null;

    dismissWarning();
    if (unsubRemote) { try { unsubRemote(); } catch (_) {} unsubRemote = null; }

    try {
      await deleteDoc(lockRef);
    } catch (err) {
      // Best-effort. The lock will expire on its own anyway.
      if (!silent) {
        await logError({
          source: "frontend",
          page: "edit-locks",
          action: "release:deleteDoc",
          error: err,
          context: { lockKey }
        });
      }
    }
  }

  // ── Remote subscription ──
  // Watch the lock doc for surprising changes. If the doc disappears while
  // we still think we hold it, something else released it (force-release
  // by a SuperAdmin in a future session, or manual Firestore console
  // intervention). Tell the caller via onLockChanged.
  unsubRemote = onSnapshot(
    lockRef,
    (snap) => {
      if (released) return;
      const lock = snap.exists() ? { ...snap.data(), id: snap.id } : null;
      if (typeof onLockChanged === "function") {
        try {
          onLockChanged({
            exists: snap.exists(),
            heldByCurrentUser: snap.exists() && snap.data().LockedBy === profile.uid,
            lock
          });
        } catch (e) {
          console.error("[edit-locks] onLockChanged threw:", e);
        }
      }
    },
    (err) => {
      // Listener errors are usually transient. Log; don't crash.
      logError({
        source: "frontend",
        page: "edit-locks",
        action: "remoteSubscription",
        error: err,
        context: { lockKey }
      }).catch(() => {});
    }
  );

  // ── First activity priming ──
  // Treat acquisition itself as activity so the inactivity timer is armed.
  armInactivityTimer();

  // ── Public session API ──
  return {
    lockKey,
    recordActivity,
    release,
    // Accessors useful for the playground / debug UIs.
    getState() {
      return {
        released,
        autoExited,
        warningShowing: !!warningModal,
        timeouts
      };
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// subscribeToLock — watch a lock without holding it
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Watch a lock's state. Used by the "locked by other" banner so it can flip
 * to "lock now available" the moment the holder releases.
 *
 * @param {string} lockKey
 * @param {Function} callback Receives { exists, isExpired, lock | null }
 * @returns {Function} unsubscribe
 */
export function subscribeToLock(lockKey, callback) {
  const lockRef = doc(db, "tenants", TENANT_ID, "editLocks", lockKey);

  return onSnapshot(
    lockRef,
    (snap) => {
      if (!snap.exists()) {
        callback({ exists: false, isExpired: false, lock: null });
        return;
      }
      const data = snap.data();
      const expiresAtMs = data.ExpiresAt?.toMillis?.() ?? 0;
      const isExpired = expiresAtMs <= Date.now();
      callback({
        exists: true,
        isExpired,
        lock: { id: snap.id, ...data }
      });
    },
    (err) => {
      logError({
        source: "frontend",
        page: "edit-locks",
        action: "subscribeToLock",
        error: err,
        context: { lockKey }
      }).catch(() => {});
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeTimeouts(t) {
  const inactivity = numberOrDefault(t?.inactivitySeconds, DEFAULT_TIMEOUTS.inactivitySeconds);
  const warning    = numberOrDefault(t?.warningSeconds,    DEFAULT_TIMEOUTS.warningSeconds);
  // Sanity floors so a buggy caller can't disable the lock entirely.
  return {
    inactivitySeconds: Math.max(2, inactivity),
    warningSeconds:    Math.max(1, warning)
  };
}

function numberOrDefault(n, fallback) {
  if (typeof n === "number" && isFinite(n) && n > 0) return n;
  return fallback;
}

/**
 * Convenience for callers/tests: peek at the current lock state without
 * acquiring or subscribing. Useful for the playground "Refresh" button.
 */
export async function peekLock(lockKey) {
  const lockRef = doc(db, "tenants", TENANT_ID, "editLocks", lockKey);
  const snap = await getDoc(lockRef);
  if (!snap.exists()) return { exists: false, isExpired: false, lock: null };
  const data = snap.data();
  const expiresAtMs = data.ExpiresAt?.toMillis?.() ?? 0;
  return {
    exists: true,
    isExpired: expiresAtMs <= Date.now(),
    lock: { id: snap.id, ...data }
  };
}

/**
 * Force-release a lock. Used by the playground; will eventually be a
 * SuperAdmin-only action in the real app (e.g. to recover from a tablet
 * that crashed mid-edit). The Firestore rules enforce who can delete.
 */
export async function forceReleaseLock(lockKey) {
  const lockRef = doc(db, "tenants", TENANT_ID, "editLocks", lockKey);
  try {
    await deleteDoc(lockRef);
    return { ok: true };
  } catch (err) {
    await logError({
      source: "frontend",
      page: "edit-locks",
      action: "forceReleaseLock",
      error: err,
      context: { lockKey }
    });
    return { ok: false, errorKey: "lockReleaseFailed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Warning modal DOM (rendered by the service per §39.11 Decision 3a)
// ─────────────────────────────────────────────────────────────────────────────

function renderWarningModal({ totalSeconds, onContinue, onLeave }) {
  ensureWarningStyles();

  const overlay = document.createElement("div");
  overlay.className = "aq-lock-warn__overlay";
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "aq-lock-warn__title");

  overlay.innerHTML = `
    <div class="aq-lock-warn__card">
      <h3 id="aq-lock-warn__title" class="aq-lock-warn__title">${strings.editLocks.warningTitle}</h3>
      <p class="aq-lock-warn__body">${strings.editLocks.warningBody}</p>
      <div class="aq-lock-warn__countdown" data-countdown>${formatCountdown(totalSeconds * 1000)}</div>
      <div class="aq-lock-warn__actions">
        <button type="button" class="aq-button aq-button--ghost"   data-action="leave">
          ${strings.editLocks.warningLeave}
        </button>
        <button type="button" class="aq-button aq-button--primary" data-action="continue">
          ${strings.editLocks.warningContinue}
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Focus the primary action so keyboard users can hit Enter to continue.
  const continueBtn = overlay.querySelector('[data-action="continue"]');
  const leaveBtn    = overlay.querySelector('[data-action="leave"]');
  continueBtn.addEventListener("click", onContinue);
  leaveBtn.addEventListener("click", onLeave);
  setTimeout(() => continueBtn.focus(), 0);

  return overlay;
}

function updateWarningModalCountdown(modal, remainingMs) {
  const el = modal.querySelector("[data-countdown]");
  if (el) el.textContent = formatCountdown(remainingMs);
}

function formatCountdown(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return strings.editLocks.warningCountdown.replace("{n}", String(seconds));
}

let warningStylesInjected = false;
function ensureWarningStyles() {
  if (warningStylesInjected) return;
  warningStylesInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    .aq-lock-warn__overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 20px;
      animation: aq-lock-warn-fade 150ms ease-out;
    }

    @keyframes aq-lock-warn-fade {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .aq-lock-warn__card {
      background: var(--card, #ffffff);
      border-radius: 14px;
      padding: 24px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 16px 48px rgba(15, 23, 42, 0.28);
      text-align: center;
    }

    .aq-lock-warn__title {
      margin: 0 0 8px 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 18px;
      font-weight: 600;
      color: var(--ink, #0f172a);
    }

    .aq-lock-warn__body {
      margin: 0 0 16px 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--ink-2, #334155);
    }

    .aq-lock-warn__countdown {
      margin: 0 0 20px 0;
      font-family: 'DM Mono', ui-monospace, monospace;
      font-size: 28px;
      font-weight: 700;
      color: var(--danger, #ef4444);
      letter-spacing: -0.02em;
    }

    .aq-lock-warn__actions {
      display: flex;
      gap: 8px;
      justify-content: center;
    }
  `;
  document.head.appendChild(style);
}