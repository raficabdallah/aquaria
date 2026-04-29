// public/src/kids/edit-view.js
//
// Kid edit form. Page chrome + photo section at top + the shared kid-form
// module for the actual fields. Wires edit-locks for concurrent-editor
// safety. Photo section supports replace + remove in §39.13 (was read-only
// in §39.12).
//
// Public API:
//   renderEditKidView(container, kidId, profile, deps)
//     deps: { onCancel(), onSaved(kidId), onRetry() }
//   Returns a cleanup function that detaches listeners AND releases the lock.

import { strings } from "../strings/en.js";
import { showToast } from "../ui/toast.js";
import { logError } from "../services/errors-service.js";
import {
  getKid,
  updateKid,
  replaceKidPhoto,
  removeKidPhoto
} from "./kids-service.js";
import { acquireLock, subscribeToLock } from "../services/edit-locks-service.js";
import { renderKidForm } from "./kid-form.js";
import { canReplaceKidPhoto } from "../auth/permissions.js";
import { confirm } from "../ui/confirm.js";

const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export function renderEditKidView(container, kidId, profile, deps) {
  ensureEditStyles();

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

  let cancelled = false;
  let session = null;
  let unsubLockBanner = null;
  let formCleanup = null;
  let photoHandlers = [];

  function detachPhotoHandlers() {
    for (const [el, evt, fn] of photoHandlers) {
      try { el.removeEventListener(evt, fn); } catch (_) {}
    }
    photoHandlers = [];
  }

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
      onAutoExit: () => {
        if (cancelled) return;
        showToast(strings.editLocks.autoExitedToast, "info");
        deps.onCancel();
      },
      onLockChanged: (() => {
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

    unsubLockBanner = subscribeToLock(kidId, (state) => {
      if (cancelled) return;
      if (!state.exists || state.isExpired) {
        statusEl.textContent = strings.kids.edit.lockedNowAvailable;
        retryBtn.disabled = false;
      }
    });
  }

  function renderForm(kid, lockSession) {
    const allowPhotoEdit = canReplaceKidPhoto(profile);
    const photoUrl = kid.PhotoThumbnailURL || kid.PhotoURL || "";

    const photoHtml = photoUrl
      ? `<img class="aq-edit-photo__img" id="aq-edit-photo-img" src="${escapeAttr(photoUrl)}" alt="" />`
      : `<div class="aq-edit-photo__initials" id="aq-edit-photo-initials">${escapeHtml(initials(kid.FirstName, kid.LastName))}</div>`;

    const photoControlsHtml = allowPhotoEdit ? `
      <div class="aq-edit-photo__controls">
        <label class="aq-button aq-button--ghost aq-edit-photo__file-button">
          ${photoUrl ? strings.kids.edit.photoReplaceButton : strings.kids.edit.photoAddButton}
          <input type="file" id="aq-edit-photo-input" accept="image/*" hidden />
        </label>
        ${photoUrl ? `<button type="button" class="aq-button aq-button--ghost" id="aq-edit-photo-remove">${strings.kids.edit.photoRemoveButton}</button>` : ""}
        <span class="aq-edit-photo__error" id="aq-edit-photo-error" hidden></span>
        <span class="aq-edit-photo__status" id="aq-edit-photo-status" hidden></span>
      </div>
    ` : `
      <p class="aq-edit-photo__caption">${strings.kids.edit.photoCaptionReadOnly}</p>
    `;

    mount.innerHTML = `
      <p class="aq-kid-form__subtitle">${strings.kids.edit.pageSubtitle}</p>

      <div class="aq-edit-photo">
        <div class="aq-edit-photo__frame">${photoHtml}</div>
        ${photoControlsHtml}
      </div>

      <div id="aq-edit-form-mount"></div>
    `;

    // Wire photo controls (admin+ only).
    if (allowPhotoEdit) {
      const photoInput  = mount.querySelector("#aq-edit-photo-input");
      const photoRemove = mount.querySelector("#aq-edit-photo-remove");
      const photoError  = mount.querySelector("#aq-edit-photo-error");
      const photoStatus = mount.querySelector("#aq-edit-photo-status");

      function showPhotoError(msg) {
        photoError.textContent = msg;
        photoError.hidden = false;
        photoStatus.hidden = true;
      }
      function hidePhotoError() {
        photoError.textContent = "";
        photoError.hidden = true;
      }
      function showPhotoStatus(msg) {
        photoStatus.textContent = msg;
        photoStatus.hidden = false;
        photoError.hidden = true;
      }
      function hidePhotoStatus() {
        photoStatus.textContent = "";
        photoStatus.hidden = true;
      }

      async function handlePhotoChange() {
        const file = photoInput.files && photoInput.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
          showPhotoError(strings.kids.register.photoNotImage);
          photoInput.value = "";
          return;
        }
        if (file.size > PHOTO_MAX_BYTES) {
          showPhotoError(strings.kids.register.photoTooLarge);
          photoInput.value = "";
          return;
        }
        hidePhotoError();
        showPhotoStatus(strings.kids.edit.photoReplacing);

        // Refresh lock activity since we're doing work.
        if (lockSession) lockSession.recordActivity();

        const res = await replaceKidPhoto(kidId, file, profile);
        photoInput.value = "";
        if (!res.ok) {
          hidePhotoStatus();
          showPhotoError(strings.errors[res.errorKey] || strings.errors.unexpected);
          return;
        }

        // Refresh the displayed photo. Re-fetch the kid to get the new URL.
        const refreshed = await getKid(kidId);
        if (refreshed.ok) {
          const newUrl = refreshed.kid.PhotoThumbnailURL || refreshed.kid.PhotoURL || "";
          const frame = mount.querySelector(".aq-edit-photo__frame");
          if (frame && newUrl) {
            frame.innerHTML = `<img class="aq-edit-photo__img" src="${escapeAttr(newUrl)}" alt="" />`;
          }
        }
        hidePhotoStatus();
        showToast(strings.toast.photoReplaced, "success");
      }

      async function handlePhotoRemove() {
        const res = await confirm({
          title:        strings.kids.edit.confirmRemovePhotoTitle,
          body:         strings.kids.edit.confirmRemovePhotoBody.replace("{name}", `${kid.FirstName} ${kid.LastName}`.trim()),
          confirmLabel: strings.kids.edit.confirmRemovePhotoConfirm,
          cancelLabel:  strings.kids.edit.confirmRemovePhotoCancel,
          danger:       true
        });
        if (!res.confirmed) return;

        if (lockSession) lockSession.recordActivity();
        showPhotoStatus(strings.kids.edit.photoRemoving);

        const result = await removeKidPhoto(kidId, profile);
        if (!result.ok) {
          hidePhotoStatus();
          showPhotoError(strings.errors[result.errorKey] || strings.errors.unexpected);
          return;
        }
        hidePhotoStatus();
        showToast(strings.toast.photoRemoved, "success");

        // Replace frame with initials.
        const frame = mount.querySelector(".aq-edit-photo__frame");
        if (frame) {
          frame.innerHTML = `<div class="aq-edit-photo__initials">${escapeHtml(initials(kid.FirstName, kid.LastName))}</div>`;
        }
        // Hide the Remove button (no photo to remove now). Update label of replace.
        const removeBtn = mount.querySelector("#aq-edit-photo-remove");
        if (removeBtn) removeBtn.style.display = "none";
        const fileBtn = mount.querySelector(".aq-edit-photo__file-button");
        if (fileBtn) fileBtn.firstChild.nodeValue = "\n          " + strings.kids.edit.photoAddButton + "\n          ";
      }

      photoInput.addEventListener("change", handlePhotoChange);
      photoHandlers.push([photoInput, "change", handlePhotoChange]);
      if (photoRemove) {
        photoRemove.addEventListener("click", handlePhotoRemove);
        photoHandlers.push([photoRemove, "click", handlePhotoRemove]);
      }
    }

    const formMount = mount.querySelector("#aq-edit-form-mount");

    const initialData = {
      firstName:        kid.FirstName,
      lastName:         kid.LastName,
      dateOfBirth:      kid.DateOfBirth,
      gender:           kid.Gender,
      schoolType:       kid.SchoolType,
      school:           kid.School,
      grade:            kid.Grade,
      parentName:       kid.ParentName,
      phone:            kid.Phone,
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

  return function cleanup() {
    cancelled = true;
    cancelTopBtn.removeEventListener("click", handleCancelTop);
    detachPhotoHandlers();
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
      gap: 12px;
      padding: 20px;
      background: var(--card, #ffffff);
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 14px;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
    }
    .aq-edit-photo__frame {
      width: 96px;
      height: 96px;
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
      font-size: 32px;
      font-weight: 600;
      color: var(--mute, #64748b);
    }
    .aq-edit-photo__caption {
      margin: 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      color: var(--mute, #64748b);
    }
    .aq-edit-photo__controls {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .aq-edit-photo__file-button {
      cursor: pointer;
    }
    .aq-edit-photo__error {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      color: var(--danger, #ef4444);
    }
    .aq-edit-photo__status {
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