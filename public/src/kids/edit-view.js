// public/src/kids/edit-view.js
//
// Kid edit form. Page chrome + read-only photo at top + the shared
// kid-form module for the actual fields. Wires edit-locks for concurrent-
// editor safety.
//
// Refactored in §39.12 Phase 2: form rendering, validation, and event
// wiring moved into kid-form.js, consumed identically by register-view.
// This file now owns:
//   - The page chrome (header / title / cancel button reuses the
//     .aq-page* styles from register-view).
//   - Loading the kid via getKid() and rendering the read-only photo.
//   - Acquiring the edit-lock; rendering the "locked by other" banner;
//     subscribing to lock changes for the "now available" flip.
//   - Calling updateKid() on submit.
//   - Releasing the lock on save / cancel / auto-exit.
//
// Public API:
//   renderEditKidView(container, kidId, profile, deps)
//     deps: { onCancel(), onSaved(kidId), onRetry() }
//   Returns a cleanup function that detaches listeners AND releases the lock.

import { strings } from "../strings/en.js";
import { showToast } from "../ui/toast.js";
import { logError } from "../services/errors-service.js";
import { getKid, updateKid } from "./kids-service.js";
import { acquireLock, subscribeToLock } from "../services/edit-locks-service.js";
import { renderKidForm } from "./kid-form.js";

export function renderEditKidView(container, kidId, profile, deps) {
  ensureEditStyles();

  // Initial loading state. Two things happen concurrently: kid fetch +
  // lock acquire. Both must succeed before we render the form.
  container.innerHTML = `
    <div class="aq-page">
      <header class="aq-page__header">
        <h1 class="aq-page__title">${strings.kids.edit.pageTitle}</h1>
        <button type="button" class="aq-button aq-button--ghost" id="aq-edit-cancel-top">
          ${strings.kids.edit.cancelButton}
        </button>
      </header>
      <main class="aq-page__main">
        <div class="aq-edit-stack" id="aq-edit-mount">
          <div class="aq-kid-profile__loading">
            <div class="aq-loading__pulse"></div>
          </div>
        </div>
      </main>
    </div>
  `;

  const cancelTopBtn = container.querySelector("#aq-edit-cancel-top");
  const mount        = container.querySelector("#aq-edit-mount");

  let cancelled = false;       // set true if cleanup runs before async finishes
  let session = null;          // active LockSession
  let unsubLockBanner = null;  // listener active while in "locked by other" state
  let formCleanup = null;      // cleanup returned by renderKidForm

  function handleCancelTop() {
    if (cancelled) return;
    if (session) {
      session.release().catch(() => {});
      session = null;
    }
    deps.onCancel();
  }
  cancelTopBtn.addEventListener("click", handleCancelTop);

  // ── Load kid + acquire lock ──
  (async () => {
    let kidRes;
    try {
      kidRes = await getKid(kidId);
    } catch (err) {
      if (cancelled) return;
      logError({
        source: "frontend",
        page: "kids/edit",
        action: "getKid",
        error: err,
        context: { kidId }
      });
      showToast(strings.errors.unexpected, "error");
      deps.onCancel();
      return;
    }

    if (cancelled) return;

    if (!kidRes.ok) {
      const msg = strings.errors[kidRes.errorKey] || strings.errors.unexpected;
      showToast(msg, "error");
      deps.onCancel();
      return;
    }

    const lockRes = await acquireLock({
      lockKey: kidId,
      profile,
      // Use defaults — full 60s/15s. Production-realistic.
      onAutoExit: () => {
        if (cancelled) return;
        showToast(strings.editLocks.autoExitedToast, "info");
        deps.onCancel();
      },
      onLockChanged: (() => {
        // The service fires this on the listener's first snapshot AND on
        // every remote change. The first snapshot can arrive with
        // state.exists === false if there's a race between our acquire
        // transaction and the initial subscription sync — see §39.12 bug
        // fix. We only treat "exists became false" as a force-release if
        // we'd previously confirmed the lock existed.
        let seenExisting = false;
        return (state) => {
          if (cancelled) return;
          if (state.exists) { seenExisting = true; return; }
          if (seenExisting && session) {
            showToast(strings.editLocks.lockLostToast, "warning");
            deps.onCancel();
          }
        };
      })()
    });

    if (cancelled) {
      if (lockRes.ok && lockRes.session) {
        lockRes.session.release().catch(() => {});
      }
      return;
    }

    if (!lockRes.ok) {
      if (lockRes.errorKey === "lockedByOther") {
        renderLockedBanner(kidRes.kid, lockRes.heldBy);
        return;
      }
      const msg = strings.errors[lockRes.errorKey] || strings.errors.unexpected;
      showToast(msg, "error");
      deps.onCancel();
      return;
    }

    session = lockRes.session;
    renderForm(kidRes.kid, session);
  })().catch((err) => {
    if (cancelled) return;
    logError({
      source: "frontend",
      page: "kids/edit",
      action: "loadAndAcquire",
      error: err,
      context: { kidId }
    });
    showToast(strings.errors.unexpected, "error");
    deps.onCancel();
  });

  // ── Locked-by-other banner ──
  function renderLockedBanner(kid, heldBy) {
    const name = heldBy?.name || strings.editLocks.unknownHolder;
    mount.innerHTML = `
      <div class="aq-card aq-edit-locked">
        <h2 class="aq-card__title">${strings.kids.edit.lockedTitle}</h2>
        <p class="aq-card__body">${strings.kids.edit.lockedBody.replace("{name}", escapeHtml(name))}</p>
        <p class="aq-card__body" id="aq-edit-locked-status">${strings.kids.edit.lockedWaiting}</p>
        <div class="aq-edit-locked__actions">
          <button type="button" class="aq-button aq-button--ghost" id="aq-edit-locked-back">
            ${strings.kids.edit.lockedBack}
          </button>
          <button type="button" class="aq-button aq-button--primary" id="aq-edit-locked-retry" disabled>
            ${strings.kids.edit.lockedRetry}
          </button>
        </div>
      </div>
    `;

    const backBtn  = mount.querySelector("#aq-edit-locked-back");
    const retryBtn = mount.querySelector("#aq-edit-locked-retry");
    const statusEl = mount.querySelector("#aq-edit-locked-status");

    function handleBack()  { deps.onCancel(); }
    function handleRetry() { deps.onRetry(); }

    backBtn.addEventListener("click", handleBack);
    retryBtn.addEventListener("click", handleRetry);

    // Watch the lock; flip to "now available" when it goes away.
    unsubLockBanner = subscribeToLock(kidId, (state) => {
      if (cancelled) return;
      if (!state.exists || state.isExpired) {
        statusEl.textContent = strings.kids.edit.lockedNowAvailable;
        retryBtn.disabled = false;
      }
    });
  }

  // ── Lock acquired: render the form ──
  function renderForm(kid, lockSession) {
    const photoUrl = kid.PhotoThumbnailURL || kid.PhotoURL || "";
    const photoHtml = photoUrl
      ? `<img class="aq-edit-photo__img" src="${escapeAttr(photoUrl)}" alt="" />`
      : `<div class="aq-edit-photo__initials">${escapeHtml(initials(kid.FirstName, kid.LastName))}</div>`;

    mount.innerHTML = `
      <p class="aq-kid-form__subtitle">${strings.kids.edit.pageSubtitle}</p>

      <div class="aq-edit-photo">
        <div class="aq-edit-photo__frame">${photoHtml}</div>
        <p class="aq-edit-photo__caption">${strings.kids.edit.photoCaption}</p>
      </div>

      <div id="aq-edit-form-mount"></div>
    `;

    const formMount = mount.querySelector("#aq-edit-form-mount");

    // The shared form needs initialData in flat-field shape. Pull it from
    // the kid doc (with PascalCase fields) into camelCase that kid-form
    // expects.
    const initialData = {
      firstName:        kid.FirstName,
      lastName:         kid.LastName,
      dateOfBirth:      kid.DateOfBirth,    // Firestore Timestamp; kid-form handles
      gender:           kid.Gender,
      schoolType:       kid.SchoolType,
      school:           kid.School,
      grade:            kid.Grade,
      parentName:       kid.ParentName,
      phone:            kid.Phone,           // E.164; kid-form splits into dial+local
      emergencyContact: kid.EmergencyContact,
      city:             kid.City,
      address:          kid.Address,
      notes:            kid.Notes
    };

    formCleanup = renderKidForm(formMount, {
      mode: "edit",
      initialData,
      submitButtonLabel:     strings.kids.edit.saveButton,
      submittingButtonLabel: strings.kids.edit.savingButton,
      cancelButtonLabel:     strings.kids.edit.cancelButton,
      onActivity: () => {
        if (lockSession) lockSession.recordActivity();
      },
      onCancel: async () => {
        // Release the lock before navigating away.
        if (lockSession) {
          await lockSession.release().catch(() => {});
          lockSession = null;
          session = null;
        }
        deps.onCancel();
      },
      onSubmit: async (formData) => {
        const res = await updateKid(kidId, formData, profile);
        if (!res.ok) return { ok: false, errorKey: res.errorKey };

        const name = (formData.firstName + " " + formData.lastName).trim();
        showToast(strings.toast.kidUpdated.replace("{name}", name), "success");

        // Release the lock, then hand off to the shell.
        if (lockSession) {
          await lockSession.release().catch(() => {});
          lockSession = null;
          session = null;
        }
        deps.onSaved(kidId);
        return { ok: true };
      }
    });
  }

  // ── Cleanup ──
  return function cleanup() {
    cancelled = true;
    cancelTopBtn.removeEventListener("click", handleCancelTop);
    if (formCleanup) {
      try { formCleanup(); } catch (_) {}
      formCleanup = null;
    }
    if (unsubLockBanner) {
      try { unsubLockBanner(); } catch (_) {}
      unsubLockBanner = null;
    }
    if (session) {
      session.release().catch(() => {});
      session = null;
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function initials(first, last) {
  const a = (first || "").trim().charAt(0).toUpperCase();
  const b = (last  || "").trim().charAt(0).toUpperCase();
  return (a + b) || "?";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(str) { return escapeHtml(str); }

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

let editStylesInjected = false;
function ensureEditStyles() {
  if (editStylesInjected) return;
  editStylesInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    .aq-edit-stack {
      width: 100%;
      max-width: 640px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .aq-edit-photo {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 20px;
      background: var(--card, #ffffff);
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 14px;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
    }
    .aq-edit-photo__frame {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      overflow: hidden;
      background: var(--bg, #f8fafc);
      border: 1px solid var(--line, #e2e8f0);
    }
    .aq-edit-photo__img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .aq-edit-photo__initials {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 28px;
      font-weight: 600;
      color: var(--mute, #64748b);
    }
    .aq-edit-photo__caption {
      margin: 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      color: var(--mute, #64748b);
    }

    .aq-edit-locked {
      width: 100%;
      max-width: 480px;
      text-align: center;
    }
    .aq-edit-locked__actions {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-top: 16px;
    }
  `;
  document.head.appendChild(style);
}