// public/src/ui/confirm.js
//
// Generic confirmation modal. Returns a Promise so callers can await the
// user's decision. Used for any destructive or otherwise-irreversible
// action — block kid, soft-delete, permanent block, restore, etc.
//
// Public API:
//   confirm(options) → Promise<{ confirmed: boolean, reason?: string, permanent?: boolean }>
//
// options:
//   {
//     title:           string,    // bold modal heading
//     body:            string,    // paragraph below the heading
//     confirmLabel:    string,    // primary button text (e.g. "Block kid")
//     cancelLabel:     string,    // secondary button text (e.g. "Cancel")
//     danger:          boolean,   // primary button styled red instead of blue
//     reasonField?:    {          // optional: render a reason textarea
//       label, placeholder, required, minLen, maxLen, errorRequired, errorTooShort
//     },
//     permanentField?: {          // optional: render a "make permanent" checkbox
//       label, helpText
//     }
//   }
//
// Resolution:
//   { confirmed: false }  if cancelled (button click, Esc key, backdrop click)
//   { confirmed: true, reason?, permanent? }  if confirmed
//
// Keyboard:
//   Esc cancels. Enter confirms IF no required reason field is empty.
//
// Only one confirm modal can be open at a time. Calling confirm() while
// another is open dismisses the previous one as cancelled and shows the
// new one. (Edge case; shouldn't happen in normal use.)

let activeModal = null;

export function confirm(options) {
  // Dismiss any pre-existing confirm modal as cancelled.
  if (activeModal) {
    activeModal.dismiss({ confirmed: false });
    activeModal = null;
  }

  ensureStyles();

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "aq-confirm__overlay";
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "aq-confirm__title");

    const reasonHTML = options.reasonField ? `
      <div class="aq-confirm__field">
        <label class="aq-confirm__label" for="aq-confirm__reason">${escapeHtml(options.reasonField.label)}${options.reasonField.required ? ' <span class="aq-confirm__req">*</span>' : ''}</label>
        <textarea
          id="aq-confirm__reason"
          class="aq-confirm__textarea"
          rows="3"
          maxlength="${options.reasonField.maxLen || 500}"
          placeholder="${escapeAttr(options.reasonField.placeholder || '')}"
        ></textarea>
        <div class="aq-confirm__error" id="aq-confirm__reason-error" hidden></div>
      </div>
    ` : '';

    const permanentHTML = options.permanentField ? `
      <label class="aq-confirm__checkbox">
        <input type="checkbox" id="aq-confirm__permanent" />
        <div>
          <div class="aq-confirm__checkbox-label">${escapeHtml(options.permanentField.label)}</div>
          ${options.permanentField.helpText ? `<div class="aq-confirm__checkbox-help">${escapeHtml(options.permanentField.helpText)}</div>` : ''}
        </div>
      </label>
    ` : '';

    overlay.innerHTML = `
      <div class="aq-confirm__card">
        <h3 id="aq-confirm__title" class="aq-confirm__title">${escapeHtml(options.title)}</h3>
        <p class="aq-confirm__body">${escapeHtml(options.body)}</p>
        ${reasonHTML}
        ${permanentHTML}
        <div class="aq-confirm__actions">
          <button type="button" class="aq-button aq-button--ghost" data-action="cancel">
            ${escapeHtml(options.cancelLabel)}
          </button>
          <button type="button" class="aq-button ${options.danger ? 'aq-button--danger' : 'aq-button--primary'}" data-action="confirm">
            ${escapeHtml(options.confirmLabel)}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const reasonInput = overlay.querySelector("#aq-confirm__reason");
    const reasonError = overlay.querySelector("#aq-confirm__reason-error");
    const permanentInput = overlay.querySelector("#aq-confirm__permanent");
    const cancelBtn = overlay.querySelector('[data-action="cancel"]');
    const confirmBtn = overlay.querySelector('[data-action="confirm"]');

    function dismiss(result) {
      if (!overlay.parentNode) return; // already dismissed
      overlay.remove();
      document.removeEventListener("keydown", handleKeydown);
      activeModal = null;
      resolve(result);
    }

    function handleConfirm() {
      // Validate reason if required.
      if (options.reasonField) {
        const raw = (reasonInput.value || "").trim();
        const minLen = options.reasonField.minLen || 0;
        const required = !!options.reasonField.required;

        if (required && raw.length === 0) {
          showReasonError(options.reasonField.errorRequired || "Reason is required.");
          reasonInput.focus();
          return;
        }
        if (raw.length > 0 && raw.length < minLen) {
          showReasonError(options.reasonField.errorTooShort || "Reason is too short.");
          reasonInput.focus();
          return;
        }
        clearReasonError();
      }

      const result = { confirmed: true };
      if (options.reasonField) result.reason = (reasonInput.value || "").trim();
      if (options.permanentField) result.permanent = !!permanentInput.checked;
      dismiss(result);
    }

    function handleCancel() { dismiss({ confirmed: false }); }

    function handleKeydown(e) {
      if (e.key === "Escape") { e.preventDefault(); handleCancel(); return; }
      if (e.key === "Enter" && !e.shiftKey) {
        // Don't intercept Enter inside the textarea — Shift+Enter is allowed
        // as newline, but plain Enter could submit. Easier rule: Enter only
        // confirms when focus is NOT on the textarea.
        if (document.activeElement === reasonInput) return;
        e.preventDefault();
        handleConfirm();
      }
    }

    function showReasonError(msg) {
      if (!reasonError) return;
      reasonError.textContent = msg;
      reasonError.hidden = false;
    }
    function clearReasonError() {
      if (!reasonError) return;
      reasonError.textContent = "";
      reasonError.hidden = true;
    }

    confirmBtn.addEventListener("click", handleConfirm);
    cancelBtn.addEventListener("click", handleCancel);
    overlay.addEventListener("click", (e) => {
      // Backdrop click cancels. Click on the inner card does not.
      if (e.target === overlay) handleCancel();
    });
    document.addEventListener("keydown", handleKeydown);

    // Focus management: focus the cancel button by default for destructive
    // actions (so accidental Enter doesn't confirm-by-default), or focus
    // the reason field if there's one (more natural starting point).
    setTimeout(() => {
      if (reasonInput) reasonInput.focus();
      else if (options.danger) cancelBtn.focus();
      else confirmBtn.focus();
    }, 0);

    activeModal = { dismiss };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    .aq-confirm__overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9000;
      padding: 20px;
      animation: aq-confirm-fade 150ms ease-out;
    }

    @keyframes aq-confirm-fade {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .aq-confirm__card {
      background: var(--card, #ffffff);
      border-radius: 14px;
      padding: 24px;
      width: 100%;
      max-width: 460px;
      box-shadow: 0 16px 48px rgba(15, 23, 42, 0.28);
    }

    .aq-confirm__title {
      margin: 0 0 8px 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 18px;
      font-weight: 600;
      color: var(--ink, #0f172a);
    }

    .aq-confirm__body {
      margin: 0 0 16px 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--ink-2, #334155);
    }

    .aq-confirm__field {
      margin-bottom: 16px;
    }

    .aq-confirm__label {
      display: block;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 500;
      color: var(--ink-2, #334155);
      margin-bottom: 6px;
    }
    .aq-confirm__req {
      color: var(--danger, #ef4444);
    }

    .aq-confirm__textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 10px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      color: var(--ink, #0f172a);
      background: white;
      resize: vertical;
      min-height: 70px;
      outline: none;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }
    .aq-confirm__textarea:focus {
      border-color: var(--accent, #0ea5e9);
      box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
    }

    .aq-confirm__error {
      margin-top: 6px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      color: var(--danger, #ef4444);
    }

    .aq-confirm__checkbox {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 16px;
      cursor: pointer;
      user-select: none;
    }
    .aq-confirm__checkbox input {
      margin-top: 3px;
    }
    .aq-confirm__checkbox-label {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      font-weight: 500;
      color: var(--ink-2, #334155);
    }
    .aq-confirm__checkbox-help {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      color: var(--mute, #64748b);
      margin-top: 2px;
      line-height: 1.4;
    }

    .aq-confirm__actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .aq-button--danger {
      background: var(--danger, #ef4444);
      color: white;
      border: none;
      padding: 10px 16px;
      border-radius: 8px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 120ms ease;
    }
    .aq-button--danger:hover:not(:disabled) {
      background: #dc2626;
    }
  `;
  document.head.appendChild(style);
}