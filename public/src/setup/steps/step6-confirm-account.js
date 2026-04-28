// public/src/setup/steps/step6-confirm-account.js
//
// Wizard Step 6 — Confirm SuperAdmin account (§29 step 6, amended by §39.3).
// Shows the existing SuperAdmin's email and role as read-only,
// and offers an optional Username (display name) edit.
//
// No new account is ever created here. Per §39.3, the SuperAdmin's Firebase
// Auth user and /tenants/{tenantId}/users/{uid} profile are created BEFORE the
// wizard runs. This step just confirms them and writes one optional update.
//
// State behavior:
// - Reads profile.email, profile.role, profile.username for display.
// - Writes state.superAdminUsername as the user types.
// - The shell pre-fills state.superAdminUsername with profile.username when
//   the wizard is first opened, so initial value is preserved across Back/Next.
// - Empty input means "no change" — the finalize batch in wizard-state.js
//   only writes to the user doc when the trimmed value differs from
//   profile.username. So leaving the field as-is or clearing it both result in
//   no write.
//
// Public API:
//   renderStep6ConfirmAccount(container, state, onValidChange, profile)
//     - container:     element to render into. Existing children replaced.
//     - state:         the wizard state object (mutated as the user types).
//     - onValidChange: called with (true|false) whenever validity flips.
//                      Step 6 has no required input — this fires once with `true`.
//     - profile:       { uid, email, username, role, active } from auth-service.
//   Returns: a cleanup function that detaches the step's listeners.

import { strings } from "../../strings/en.js";

const USERNAME_MAX = 60;

export function renderStep6ConfirmAccount(container, state, onValidChange, profile) {
  // Defensive: profile should always be present, but if for some reason it
  // isn't, render a fallback empty display rather than crashing.
  const email    = (profile && profile.email)    || "";
  const role     = (profile && profile.role)     || "";
  const username = state.superAdminUsername || "";

  // Look up the friendly role label. If the stored role isn't in the map
  // (shouldn't happen, but be defensive), fall back to the raw value.
  const roleLabel = (strings.roles && strings.roles[role]) || role;

  container.innerHTML = `
    <div class="aq-wizard__step">
      <h2 class="aq-wizard__step-title">${strings.wizard.step6.title}</h2>
      <p class="aq-wizard__step-subtitle">${strings.wizard.step6.subtitle}</p>

      <div class="aq-wizard__form">

        <div class="aq-field">
          <span class="aq-field__label">${strings.wizard.step6.emailLabel}</span>
          <div class="aq-field__readonly">${escapeHtml(email)}</div>
          <span class="aq-field__help">${strings.wizard.step6.emailHelp}</span>
        </div>

        <div class="aq-field">
          <span class="aq-field__label">${strings.wizard.step6.roleLabel}</span>
          <div class="aq-field__readonly">${escapeHtml(roleLabel)}</div>
          <span class="aq-field__help">${strings.wizard.step6.roleHelp}</span>
        </div>

        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step6.usernameLabel}</span>
          <input
            type="text"
            id="aq-wizard-step6-username"
            class="aq-field__input"
            placeholder="${strings.wizard.step6.usernamePlaceholder}"
            value="${escapeHtml(username)}"
            maxlength="${USERNAME_MAX}"
            autocomplete="off"
          />
          <span class="aq-field__help">${strings.wizard.step6.usernameHelp}</span>
        </label>

      </div>
    </div>
  `;

  // The .aq-field__readonly style was injected by Step 2. Step 6 reuses it.
  // If a user lands on Step 6 without ever visiting Step 2 (theoretically
  // impossible — they had to walk through it — but defensive), the style
  // would be missing. So we re-inject it here, idempotent via a flag.
  ensureStep6Styles();

  const usernameInput = container.querySelector("#aq-wizard-step6-username");

  function handleUsernameInput() {
    state.superAdminUsername = usernameInput.value;
  }

  usernameInput.addEventListener("input", handleUsernameInput);

  // No required input — Next is always enabled on this step.
  onValidChange(true);

  return function cleanup() {
    usernameInput.removeEventListener("input", handleUsernameInput);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Local helpers
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Re-injects the .aq-field__readonly style. Idempotent — safe to call repeatedly.
// Step 2 also injects this style; if both run, the second injection is skipped
// because of its own flag, and ours is skipped on subsequent renders here.
let step6StylesInjected = false;
function ensureStep6Styles() {
  if (step6StylesInjected) return;
  step6StylesInjected = true;

  // If Step 2 already ran in this session, .aq-field__readonly is already in
  // the document. Adding it a second time produces identical CSS — harmless.
  const style = document.createElement("style");
  style.textContent = `
    .aq-field__readonly {
      padding: 10px 12px;
      background: var(--bg, #f8fafc);
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 8px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      color: var(--ink-2, #334155);
    }
  `;
  document.head.appendChild(style);
}