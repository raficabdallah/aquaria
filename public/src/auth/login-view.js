// public/src/auth/login-view.js
//
// The login form. Renders into a target element, handles submit, calls auth-service,
// shows toasts on failure. Does NOT decide what happens after login —
// the shell listens for auth state changes and swaps views.
//
// Public API:
//   renderLoginView(container) — renders the form into the given DOM element.
//                                Returns a cleanup function to detach listeners.

import { signIn } from "./auth-service.js";
import { strings } from "../strings/en.js";
import { showToast } from "../ui/toast.js";

/**
 * Render the login form into `container`.
 * @param {HTMLElement} container  Element to render into. Its existing children are replaced.
 * @returns {Function} cleanup     Call to remove event listeners (used on view swap).
 */
export function renderLoginView(container) {
  ensureStyles();

  container.innerHTML = `
    <div class="aq-login">
      <div class="aq-login__card">
        <h1 class="aq-login__title">${strings.app.name}</h1>
        <p class="aq-login__tagline">${strings.app.tagline}</p>

        <form class="aq-login__form" id="aq-login-form" novalidate>
          <label class="aq-field">
            <span class="aq-field__label">${strings.login.emailLabel}</span>
            <input
              type="email"
              name="email"
              autocomplete="email"
              autocapitalize="none"
              spellcheck="false"
              placeholder="${strings.login.emailPlaceholder}"
              class="aq-field__input"
              required
            />
          </label>

          <label class="aq-field">
            <span class="aq-field__label">${strings.login.passwordLabel}</span>
            <input
              type="password"
              name="password"
              autocomplete="current-password"
              placeholder="${strings.login.passwordPlaceholder}"
              class="aq-field__input"
              required
            />
          </label>

          <button type="submit" class="aq-button aq-button--primary" id="aq-login-submit">
            ${strings.login.submitButton}
          </button>
        </form>
      </div>
    </div>
  `;

  const form = container.querySelector("#aq-login-form");
  const submitBtn = container.querySelector("#aq-login-submit");

  async function handleSubmit(event) {
    event.preventDefault();

    const formData = new FormData(form);
    const email = (formData.get("email") || "").toString();
    const password = (formData.get("password") || "").toString();

    // Lock the button so a double-click doesn't fire two requests.
    setSubmitting(true);

    const result = await signIn(email, password);

    if (result.ok) {
      // Don't swap the view from here — the shell's onAuthChange handler does that.
      // We just relax the button in case the shell takes a moment.
      setSubmitting(false);
      return;
    }

    // Failure: show the right localized message.
    const messageKey = result.errorKey || "unexpected";
    const message = strings.errors[messageKey] || strings.errors.unexpected;
    showToast(message, "error");
    setSubmitting(false);
  }

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtn.textContent = isSubmitting
      ? strings.login.submittingButton
      : strings.login.submitButton;
  }

  form.addEventListener("submit", handleSubmit);

  // Cleanup function — detaches listeners. The shell will call this when
  // it tears down the login view to render the dashboard.
  return function cleanup() {
    form.removeEventListener("submit", handleSubmit);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — scoped via class prefixes, injected once
// ─────────────────────────────────────────────────────────────────────────────

let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    .aq-login {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: var(--bg, #f8fafc);
    }

    .aq-login__card {
      width: 100%;
      max-width: 380px;
      background: var(--card, #ffffff);
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 16px;
      padding: 32px 28px;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
    }

    .aq-login__title {
      margin: 0 0 4px 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 28px;
      font-weight: 700;
      color: var(--ink, #0f172a);
      letter-spacing: -0.02em;
    }

    .aq-login__tagline {
      margin: 0 0 28px 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      color: var(--mute, #64748b);
    }

    .aq-login__form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .aq-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .aq-field__label {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 500;
      color: var(--ink-2, #334155);
    }

    .aq-field__input {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 15px;
      padding: 11px 14px;
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 10px;
      background: white;
      color: var(--ink, #0f172a);
      outline: none;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }

    .aq-field__input:focus {
      border-color: var(--accent, #0ea5e9);
      box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
    }

    .aq-button {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 15px;
      font-weight: 600;
      padding: 12px 16px;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      transition: background-color 120ms ease, opacity 120ms ease;
      margin-top: 8px;
    }

    .aq-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .aq-button--primary {
      background: var(--accent, #0ea5e9);
      color: white;
    }

    .aq-button--primary:hover:not(:disabled) {
      background: #0284c7;
    }
  `;
  document.head.appendChild(style);
}