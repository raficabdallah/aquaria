// public/src/kids/register-view.js
//
// Kid registration form. Single screen with photo upload + the shared
// kid-form module for the rest of the fields.
//
// Refactored in §39.12 Phase 2: form rendering, validation, and event
// wiring moved into kid-form.js, consumed identically by edit-view.
// This file now owns:
//   - The page chrome (.aq-page wrapper, header with title & top-cancel
//     button — and the .aq-page* styles that profile-view, edit-view
//     piggy-back on).
//   - The photo upload UI (file picker + camera button + preview + remove).
//     Edit-view does NOT have photo upload; it shows a read-only photo.
//   - Calling createKid() on submit.
//   - Navigation hand-off to the shell.
//
// Public API:
//   renderRegisterKidView(container, profile, deps)
//     - container: DOM element to render into
//     - profile:   signed-in user profile (uid, role, etc.)
//     - deps:      { onCancel(), onRegistered(kidId) }
//   Returns a cleanup function.

import { strings } from "../strings/en.js";
import { showToast } from "../ui/toast.js";
import { logError } from "../services/errors-service.js";
import { createKid } from "./kids-service.js";
import { renderKidForm } from "./kid-form.js";

// Photo size limit (file-picker side; the actual resize step further
// shrinks the image before upload).
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export function renderRegisterKidView(container, profile, deps) {
  ensurePageStyles();

  // Photo state — owned by this view only.
  let photoFile = null;

  // Page chrome.
  container.innerHTML = `
    <div class="aq-page">
      <header class="aq-page__header">
        <h1 class="aq-page__title">${strings.kids.register.pageTitle}</h1>
        <button type="button" class="aq-button aq-button--ghost" id="aq-kid-cancel">
          ${strings.kids.register.cancelButton}
        </button>
      </header>

      <main class="aq-page__main">
        <div class="aq-register-stack">
          <p class="aq-kid-form__subtitle">${strings.kids.register.pageSubtitle}</p>

          <div class="aq-kid-form__photo">
            <div class="aq-kid-form__photo-preview" id="aq-kid-photo-preview" aria-hidden="true">
              <span class="aq-kid-form__photo-placeholder">📷</span>
            </div>
            <div class="aq-kid-form__photo-controls">
              <span class="aq-field__label">${strings.kids.register.photoLabel}</span>
              <div class="aq-kid-form__photo-buttons">
                <label class="aq-button aq-button--ghost aq-kid-form__file-button">
                  ${strings.kids.register.photoPick}
                  <input type="file" id="aq-kid-photo-input" accept="image/*" hidden />
                </label>
                <label class="aq-button aq-button--ghost aq-kid-form__file-button">
                  ${strings.kids.register.photoTake}
                  <input type="file" id="aq-kid-photo-camera" accept="image/*" capture="environment" hidden />
                </label>
                <button type="button" class="aq-button aq-button--ghost" id="aq-kid-photo-remove" hidden>
                  ${strings.kids.register.photoRemove}
                </button>
              </div>
              <span class="aq-field__help">${strings.kids.register.photoHelp}</span>
              <span class="aq-field__error" id="aq-kid-photo-error" hidden></span>
            </div>
          </div>

          <div id="aq-kid-form-mount"></div>
        </div>
      </main>
    </div>
  `;

  const cancelTopBtn   = container.querySelector("#aq-kid-cancel");
  const photoPreview   = container.querySelector("#aq-kid-photo-preview");
  const photoInput     = container.querySelector("#aq-kid-photo-input");
  const photoCamera    = container.querySelector("#aq-kid-photo-camera");
  const photoRemoveBtn = container.querySelector("#aq-kid-photo-remove");
  const photoError     = container.querySelector("#aq-kid-photo-error");
  const formMount      = container.querySelector("#aq-kid-form-mount");

  // ── Photo handlers ──
  function handlePhotoChange(input) {
    return () => {
      const file = input.files && input.files[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        showPhotoError(strings.kids.register.photoNotImage);
        input.value = "";
        return;
      }
      if (file.size > PHOTO_MAX_BYTES) {
        showPhotoError(strings.kids.register.photoTooLarge);
        input.value = "";
        return;
      }
      hidePhotoError();
      photoFile = file;
      previewPhoto(file);
      photoRemoveBtn.hidden = false;
    };
  }

  function handlePhotoRemove() {
    photoFile = null;
    photoInput.value = "";
    photoCamera.value = "";
    photoPreview.innerHTML = `<span class="aq-kid-form__photo-placeholder">📷</span>`;
    photoRemoveBtn.hidden = true;
    hidePhotoError();
  }

  function previewPhoto(file) {
    const url = URL.createObjectURL(file);
    photoPreview.innerHTML = `<img src="${url}" alt="" />`;
    const img = photoPreview.querySelector("img");
    if (img) img.onload = () => URL.revokeObjectURL(url);
  }

  function showPhotoError(msg) {
    photoError.textContent = msg;
    photoError.hidden = false;
  }
  function hidePhotoError() {
    photoError.textContent = "";
    photoError.hidden = true;
  }

  function handleCancel() {
    deps.onCancel();
  }

  photoInput.addEventListener("change", handlePhotoChange(photoInput));
  photoCamera.addEventListener("change", handlePhotoChange(photoCamera));
  photoRemoveBtn.addEventListener("click", handlePhotoRemove);
  cancelTopBtn.addEventListener("click", handleCancel);

  // ── Mount the shared form ──
  const formCleanup = renderKidForm(formMount, {
    mode: "create",
    submitButtonLabel:     strings.kids.register.submitButton,
    submittingButtonLabel: strings.kids.register.submittingButton,
    cancelButtonLabel:     strings.kids.register.cancelButton,
    onCancel: () => deps.onCancel(),
    onSubmit: async (formData) => {
      // Inject the photo file (which the shared form doesn't know about).
      const built = { ...formData, photoFile };
      const res = await createKid(built, profile);
      if (!res.ok) return { ok: false, errorKey: res.errorKey };

      if (res.photoUploadFailed) {
        showToast(strings.errors.photoUploadPartial, "warning");
      } else {
        const name = (built.firstName + " " + built.lastName).trim();
        showToast(strings.toast.kidRegistered.replace("{name}", name), "success");
      }
      deps.onRegistered(res.kidId);
      return { ok: true };
    }
  });

  // ── Cleanup ──
  return function cleanup() {
    cancelTopBtn.removeEventListener("click", handleCancel);
    photoInput.removeEventListener("change", handlePhotoChange(photoInput));
    photoCamera.removeEventListener("change", handlePhotoChange(photoCamera));
    photoRemoveBtn.removeEventListener("click", handlePhotoRemove);
    if (formCleanup) formCleanup();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
//
// Owns:
//   - .aq-page* (the page-chrome scaffold used by profile-view, edit-view,
//     and register-view itself). This is the historical owner per §39.8.
//   - .aq-page__header-actions (added §39.12 for the profile's Edit button).
//   - .aq-kid-form__subtitle (small text under the page title)
//   - .aq-kid-form__photo* (photo upload UI — register-only)
//   - .aq-register-stack (vertical stacking of the photo + form within main)
//
// Form-internal styles live in kid-form.js. Field-accessory styles
// (.aq-field__help, .aq-field__error, .aq-field__input--invalid) also live
// in kid-form.js since they belong with the form.
// ─────────────────────────────────────────────────────────────────────────────

let pageStylesInjected = false;
function ensurePageStyles() {
  if (pageStylesInjected) return;
  pageStylesInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    .aq-page {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background: var(--bg, #f8fafc);
    }
    .aq-page__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 20px;
      background: var(--card, #ffffff);
      border-bottom: 1px solid var(--line, #e2e8f0);
    }
    .aq-page__header-actions {
      display: flex;
      gap: 8px;
    }
    .aq-page__title {
      margin: 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 20px;
      font-weight: 700;
      color: var(--ink, #0f172a);
      letter-spacing: -0.02em;
    }
    .aq-page__main {
      flex: 1;
      display: flex;
      justify-content: center;
      padding: 32px 20px;
    }

    .aq-register-stack {
      width: 100%;
      max-width: 640px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .aq-kid-form__subtitle {
      margin: 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      color: var(--mute, #64748b);
      line-height: 1.5;
    }

    .aq-kid-form__photo {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      padding: 20px;
      background: var(--card, #ffffff);
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 14px;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
    }
    .aq-kid-form__photo-preview {
      width: 100px;
      height: 100px;
      border-radius: 12px;
      background: var(--bg, #f8fafc);
      border: 1px dashed var(--line, #e2e8f0);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
    }
    .aq-kid-form__photo-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .aq-kid-form__photo-placeholder {
      font-size: 28px;
      opacity: 0.5;
    }
    .aq-kid-form__photo-controls {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1;
    }
    .aq-kid-form__photo-buttons {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .aq-kid-form__file-button {
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}