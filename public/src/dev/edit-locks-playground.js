// public/src/dev/edit-locks-playground.js
//
// Developer-only playground for the edit-locks service. Lets you exercise
// every code path of edit-locks-service.js without needing the real edit-kid
// view to exist yet.
//
// What it does:
//   - Targets a hardcoded fake lockKey so it never collides with real kid IDs.
//   - Lets you set inactivity / warning timeouts for THIS session (default 5/3
//     so you don't have to wait a full minute every test).
//   - "Acquire" attempts a real Firestore transaction.
//   - "Simulate activity" calls session.recordActivity() — proves the
//     debounce + heartbeat + inactivity-reset chain.
//   - "Force expire" sets the lock's ExpiresAt to the past so you can test
//     the "expired lock can be reclaimed" path.
//   - Live readout of the lock document (fields refresh via subscribeToLock).
//   - Open in two browser windows as different users to exercise the
//     "locked by other" code path.
//
// Surfaces in the dashboard's developer-tools section, beneath the
// existing Seed/Backfill buttons. Same gate: dev project + SuperAdmin.

import { strings } from "../strings/en.js";
import { showToast } from "../ui/toast.js";
import {
  acquireLock,
  subscribeToLock,
  peekLock,
  forceReleaseLock,
  DEFAULT_TIMEOUTS
} from "../services/edit-locks-service.js";
import {
  doc,
  updateDoc,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "../firebase-init.js";
import { TENANT_ID } from "../config.js";

// Hardcoded lock key. Prefix with "__" so it can never collide with a real
// kidId (Firestore auto-IDs don't start with underscores).
// NOTE: Firestore reserves IDs that start OR end with "__" (double underscore)
// for its internal pseudo-fields like __name__. Picking such an ID here
// caused the SDK to reject the request client-side before the rules engine
// ever saw it. Use a distinctive but valid ID instead.
const PLAYGROUND_LOCK_KEY = "playground_editlock_test";

// Test-friendly defaults. The user can change these in the inputs.
const TEST_DEFAULTS = {
  inactivitySeconds: 5,
  warningSeconds: 3
};

/**
 * @param {HTMLElement} mount    Container to render into (no gating here —
 *                                the caller decides whether to mount).
 * @param {Object}      profile  Signed-in user profile.
 * @returns {Function}           cleanup()
 */
export function renderEditLocksPlayground(mount, profile) {
  ensureStyles();

  const t = strings.editLocks.playground;

  // ── DOM scaffold ────────────────────────────────────────────────────
  const card = document.createElement("div");
  card.className = "aq-card aq-dev-card aq-locks-playground";
  card.innerHTML = `
    <div class="aq-dev-card__head">
      <span class="aq-dev-card__badge">${strings.devTools.badge}</span>
      <h2 class="aq-card__title">${t.title}</h2>
    </div>
    <p class="aq-card__body">${t.subtitle}</p>

    <div class="aq-locks-playground__row">
      <label class="aq-locks-playground__field">
        <span>${t.inactivityLabel}</span>
        <input type="number" min="2" max="600" step="1" id="aq-lp-inactivity"
               value="${TEST_DEFAULTS.inactivitySeconds}" />
      </label>
      <label class="aq-locks-playground__field">
        <span>${t.warningLabel}</span>
        <input type="number" min="1" max="300" step="1" id="aq-lp-warning"
               value="${TEST_DEFAULTS.warningSeconds}" />
      </label>
    </div>

    <div class="aq-locks-playground__actions">
      <button type="button" class="aq-button aq-button--primary" data-action="acquire">
        ${t.acquireButton}
      </button>
      <button type="button" class="aq-button aq-button--ghost" data-action="activity" disabled>
        ${t.activityButton}
      </button>
      <button type="button" class="aq-button aq-button--ghost" data-action="release" disabled>
        ${t.releaseButton}
      </button>
      <button type="button" class="aq-button aq-button--ghost" data-action="forceExpire">
        ${t.forceExpireButton}
      </button>
      <button type="button" class="aq-button aq-button--ghost" data-action="forceRelease">
        ${t.forceReleaseButton}
      </button>
    </div>

    <div class="aq-locks-playground__readout" id="aq-lp-readout">
      <div class="aq-locks-playground__readout-title">${t.readoutTitle}</div>
      <pre class="aq-locks-playground__readout-body" id="aq-lp-readout-body">${t.readoutLoading}</pre>
    </div>
  `;
  mount.appendChild(card);

  // ── Element refs ───────────────────────────────────────────────────
  const inputInactivity = card.querySelector("#aq-lp-inactivity");
  const inputWarning    = card.querySelector("#aq-lp-warning");
  const btnAcquire      = card.querySelector('[data-action="acquire"]');
  const btnActivity     = card.querySelector('[data-action="activity"]');
  const btnRelease      = card.querySelector('[data-action="release"]');
  const btnForceExpire  = card.querySelector('[data-action="forceExpire"]');
  const btnForceRelease = card.querySelector('[data-action="forceRelease"]');
  const readoutBody     = card.querySelector("#aq-lp-readout-body");

  // ── State ──────────────────────────────────────────────────────────
  let session = null;       // active LockSession when we hold the lock
  let unsubReadout = null;  // remote subscription for the readout panel
  // Always show whatever's in the doc — even when we don't hold the lock —
  // so two-window testing is clear.
  attachReadoutSubscription();

  // ── Handlers ───────────────────────────────────────────────────────
  async function handleAcquire() {
    if (session) {
      showToast(t.alreadyHeld, "info");
      return;
    }

    const timeouts = readTimeoutInputs();
    setBusy(btnAcquire, t.acquiring);

    try {
      const res = await acquireLock({
        lockKey: PLAYGROUND_LOCK_KEY,
        profile,
        timeouts,
        onAutoExit: () => {
          // Service auto-released; sync UI.
          session = null;
          syncButtons();
          showToast(t.autoExited, "info");
        },
        onLockChanged: (state) => {
          // Useful for debugging two-window scenarios. We don't act on this
          // here other than refreshing the readout (which is also covered
          // by attachReadoutSubscription).
        }
      });

      if (!res.ok) {
        if (res.errorKey === "lockedByOther") {
          const heldByName = res.heldBy?.name || strings.editLocks.unknownHolder;
          showToast(t.heldByOther.replace("{name}", heldByName), "error");
        } else {
          const msg = strings.errors[res.errorKey] || strings.errors.unexpected;
          showToast(msg, "error");
        }
        return;
      }

      session = res.session;
      showToast(t.acquired, "success");
      syncButtons();
    } finally {
      setIdle(btnAcquire, t.acquireButton);
    }
  }

  async function handleActivity() {
    if (!session) return;
    session.recordActivity();
    // Visual confirmation. The actual heartbeat write may be debounced.
    showToast(t.activityRecorded, "success");
  }

  async function handleRelease() {
    if (!session) return;
    setBusy(btnRelease, t.releasing);
    try {
      await session.release();
      session = null;
      showToast(t.released, "info");
      syncButtons();
    } finally {
      setIdle(btnRelease, t.releaseButton);
    }
  }

  async function handleForceExpire() {
    // Reach into the lock doc and set ExpiresAt to the past. Useful for
    // testing the "stale lock can be reclaimed" path without waiting.
    const lockRef = doc(db, "tenants", TENANT_ID, "editLocks", PLAYGROUND_LOCK_KEY);
    try {
      await updateDoc(lockRef, {
        ExpiresAt: Timestamp.fromMillis(Date.now() - 1000)
      });
      showToast(t.forcedExpire, "info");
    } catch (err) {
      // Most likely the doc doesn't exist. Surface it; don't crash.
      console.error("[locks-playground] forceExpire:", err);
      showToast(t.forceExpireFailed, "error");
    }
  }

  async function handleForceRelease() {
    setBusy(btnForceRelease, t.releasing);
    try {
      const res = await forceReleaseLock(PLAYGROUND_LOCK_KEY);
      if (res.ok) {
        // If WE held the session, mirror state.
        if (session) {
          session = null;
          syncButtons();
        }
        showToast(t.forceReleased, "info");
      } else {
        const msg = strings.errors[res.errorKey] || strings.errors.unexpected;
        showToast(msg, "error");
      }
    } finally {
      setIdle(btnForceRelease, t.forceReleaseButton);
    }
  }

  // ── Wiring ─────────────────────────────────────────────────────────
  btnAcquire.addEventListener("click", handleAcquire);
  btnActivity.addEventListener("click", handleActivity);
  btnRelease.addEventListener("click", handleRelease);
  btnForceExpire.addEventListener("click", handleForceExpire);
  btnForceRelease.addEventListener("click", handleForceRelease);

  // ── Helpers ────────────────────────────────────────────────────────
  function readTimeoutInputs() {
    const i = parseInt(inputInactivity.value, 10);
    const w = parseInt(inputWarning.value, 10);
    return {
      inactivitySeconds: isFinite(i) && i > 0 ? i : DEFAULT_TIMEOUTS.inactivitySeconds,
      warningSeconds:    isFinite(w) && w > 0 ? w : DEFAULT_TIMEOUTS.warningSeconds
    };
  }

  function syncButtons() {
    btnActivity.disabled = !session;
    btnRelease.disabled  = !session;
    btnAcquire.disabled  = !!session;
  }

  function attachReadoutSubscription() {
    unsubReadout = subscribeToLock(PLAYGROUND_LOCK_KEY, (state) => {
      readoutBody.textContent = formatReadout(state, profile);
    });
    // Also do an immediate peek to avoid the brief "Loading…" flash.
    peekLock(PLAYGROUND_LOCK_KEY).then((state) => {
      readoutBody.textContent = formatReadout(state, profile);
    }).catch(() => {});
  }

  // ── Cleanup ────────────────────────────────────────────────────────
  return function cleanup() {
    btnAcquire.removeEventListener("click", handleAcquire);
    btnActivity.removeEventListener("click", handleActivity);
    btnRelease.removeEventListener("click", handleRelease);
    btnForceExpire.removeEventListener("click", handleForceExpire);
    btnForceRelease.removeEventListener("click", handleForceRelease);

    if (unsubReadout) { try { unsubReadout(); } catch (_) {} }

    // If we hold the lock and the user navigates away, release. Best-effort
    // — if it fails, the passive expiry will catch it.
    if (session) {
      session.release().catch(() => {});
      session = null;
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Readout formatting
// ─────────────────────────────────────────────────────────────────────────────

function formatReadout(state, profile) {
  if (!state.exists) {
    return "No lock currently held.\n\nLock key: " + summaryLine();
  }
  const l = state.lock;
  const heldBySelf = l.LockedBy === profile.uid;
  const expMs = l.ExpiresAt?.toMillis?.() ?? 0;
  const lockedAtMs = l.LockedAt?.toMillis?.() ?? 0;
  const lastActMs  = l.LastActivityAt?.toMillis?.() ?? 0;

  const lines = [
    `Status: ${state.isExpired ? "EXPIRED" : "ACTIVE"}${heldBySelf ? "  (held by you)" : ""}`,
    `LockedBy: ${l.LockedBy}`,
    `LockedByName: ${l.LockedByName || "(none)"}`,
    `LockedAt: ${formatTime(lockedAtMs)}`,
    `LastActivityAt: ${formatTime(lastActMs)}`,
    `ExpiresAt: ${formatTime(expMs)}${state.isExpired ? "  (in the past)" : "  (in " + Math.round((expMs - Date.now()) / 1000) + "s)"}`,
    "",
    "Lock key: " + summaryLine()
  ];
  return lines.join("\n");
}

function summaryLine() {
  return PLAYGROUND_LOCK_KEY;
}

function formatTime(ms) {
  if (!ms) return "(none)";
  const d = new Date(ms);
  return d.toLocaleTimeString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function setBusy(btn, label) {
  btn.disabled = true;
  btn.dataset.originalLabel = btn.textContent;
  btn.textContent = label;
}

function setIdle(btn, label) {
  btn.disabled = false;
  btn.textContent = label;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    .aq-locks-playground {
      margin-top: 16px;
    }

    .aq-locks-playground__row {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .aq-locks-playground__field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      color: var(--ink-2, #334155);
    }

    .aq-locks-playground__field input {
      width: 80px;
      padding: 6px 8px;
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 6px;
      font-family: 'DM Mono', ui-monospace, monospace;
      font-size: 13px;
      background: white;
    }

    .aq-locks-playground__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
    }

    .aq-locks-playground__readout {
      background: #1e293b;
      color: #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      font-family: 'DM Mono', ui-monospace, monospace;
      font-size: 12px;
    }

    .aq-locks-playground__readout-title {
      font-weight: 600;
      margin-bottom: 6px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 10px;
    }

    .aq-locks-playground__readout-body {
      margin: 0;
      white-space: pre-wrap;
      line-height: 1.5;
      color: #e2e8f0;
    }
  `;
  document.head.appendChild(style);
}