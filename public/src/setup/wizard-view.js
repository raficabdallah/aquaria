// public/src/setup/wizard-view.js
//
// Onboarding wizard (§29). The 7-step setup flow that runs the first time
// a SuperAdmin signs in to a fresh tenant.
//
// CURRENT STATE: shell + Step 1 + Step 2 + Step 3 (each in its own file).
// Steps 4-6 are placeholders. Step 7 is intentionally a display-only
// "configure later" screen (see §39.4).
// The Finalize logic in wizard-state.js gracefully handles missing optional
// data (Steps 4 and 5 stay null, Step 6 username is empty so no-op).
//
// Public API:
//   renderWizardView(container, profile, onComplete)
//     - container:  element to render into. Existing children replaced.
//     - profile:    { uid, email, username, role, active } from auth-service.
//     - onComplete: callback fired when the wizard finishes successfully.
//                   The shell uses this to re-route to the dashboard.
//   Returns a cleanup function (detaches listeners).

import { signOut } from "../auth/auth-service.js";
import { strings } from "../strings/en.js";
import { showToast } from "../ui/toast.js";
import { createInitialState, finalizeWizard } from "./wizard-state.js";
import { renderStep1Identity } from "./steps/step1-identity.js";
import { renderStep2Operating } from "./steps/step2-operating.js";
import { renderStep3SessionType } from "./steps/step3-session-type.js";

const TOTAL_STEPS = 7;

/**
 * Render the wizard.
 */
export function renderWizardView(container, profile, onComplete) {
  ensureStyles();

  // Build the in-memory state object. Pre-fill the SuperAdmin username from
  // the profile so Step 6 (when we get there) shows the current value.
  const state = createInitialState();
  state.superAdminUsername = profile.username || "";

  // Shell-level mutable state — kept inside this closure, not on the DOM.
  let currentStep = 1;
  let stepCleanup = null;       // cleanup fn returned by the current step
  let stepIsValid = false;      // whether Next should be enabled
  let isFinishing = false;      // true while finalizeWizard() is in flight

  // Build the static frame once. Step content gets swapped inside .aq-wizard__body.
  container.innerHTML = `
    <div class="aq-wizard">
      <header class="aq-wizard__header">
        <div class="aq-wizard__brand">${strings.wizard.headerTitle}</div>
        <button class="aq-button aq-button--ghost" id="aq-wizard-signout">
          ${strings.shell.logoutButton}
        </button>
      </header>

      <div class="aq-wizard__progress">
        <div class="aq-wizard__progress-bar">
          <div class="aq-wizard__progress-fill" id="aq-wizard-progress-fill"></div>
        </div>
        <div class="aq-wizard__progress-text" id="aq-wizard-progress-text"></div>
      </div>

      <main class="aq-wizard__main">
        <div class="aq-wizard__body" id="aq-wizard-body"></div>
      </main>

      <footer class="aq-wizard__footer">
        <button class="aq-button aq-button--ghost" id="aq-wizard-back">
          ${strings.wizard.backButton}
        </button>
        <div class="aq-wizard__footer-spacer"></div>
        <button class="aq-button aq-button--ghost" id="aq-wizard-skip" hidden>
          ${strings.wizard.skipButton}
        </button>
        <button class="aq-button aq-button--primary" id="aq-wizard-next">
          ${strings.wizard.nextButton}
        </button>
      </footer>
    </div>
  `;

  // Cache element references.
  const bodyEl       = container.querySelector("#aq-wizard-body");
  const progressFill = container.querySelector("#aq-wizard-progress-fill");
  const progressText = container.querySelector("#aq-wizard-progress-text");
  const backBtn      = container.querySelector("#aq-wizard-back");
  const skipBtn      = container.querySelector("#aq-wizard-skip");
  const nextBtn      = container.querySelector("#aq-wizard-next");
  const signOutBtn   = container.querySelector("#aq-wizard-signout");

  // ── Step rendering ────────────────────────────────────────────────────────

  function renderCurrentStep() {
    // Tear down the previous step.
    if (stepCleanup) {
      try { stepCleanup(); } catch (e) { console.error("[wizard] step cleanup threw:", e); }
      stepCleanup = null;
    }

    // Reset validity. Each step decides what valid means.
    stepIsValid = false;

    // Render the step into the body.
    bodyEl.innerHTML = "";
    switch (currentStep) {
      case 1:
        stepCleanup = renderStep1Identity(bodyEl, state, handleValidChange);
        break;
      case 2:
        stepCleanup = renderStep2Operating(bodyEl, state, handleValidChange);
        break;
      case 3:
        stepCleanup = renderStep3SessionType(bodyEl, state, handleValidChange);
        break;
      case 4:
      case 5:
      case 6:
        stepCleanup = renderPlaceholderStep(bodyEl, currentStep);
        // Placeholders are always "valid" so Next is enabled.
        stepIsValid = true;
        break;
      case 7:
        stepCleanup = renderStep7TerminalPlaceholder(bodyEl);
        stepIsValid = true;   // finish is always allowed on Step 7
        break;
      default:
        console.error("[wizard] Unknown step:", currentStep);
    }

    updateProgress();
    updateNavigation();
  }

  function handleValidChange(isValid) {
    stepIsValid = !!isValid;
    updateNavigation();
  }

  // ── Progress bar + nav button state ───────────────────────────────────────

  function updateProgress() {
    const percent = Math.round(((currentStep - 1) / TOTAL_STEPS) * 100);
    progressFill.style.width = percent + "%";
    progressText.textContent = strings.wizard.stepLabel
      .replace("{current}", currentStep)
      .replace("{total}", TOTAL_STEPS);
  }

  function updateNavigation() {
    // Back button: hidden on Step 1, visible elsewhere.
    backBtn.hidden = currentStep === 1;

    // Skip button: visible on Step 4 and Step 5 (the optional steps).
    skipBtn.hidden = !(currentStep === 4 || currentStep === 5);

    // Next button: label is "Finish setup" on Step 7, "Next" otherwise.
    if (currentStep === TOTAL_STEPS) {
      nextBtn.textContent = isFinishing
        ? strings.wizard.finishingButton
        : strings.wizard.finishButton;
    } else {
      nextBtn.textContent = strings.wizard.nextButton;
    }

    // Disabled state.
    nextBtn.disabled = isFinishing || !stepIsValid;
    backBtn.disabled = isFinishing;
    skipBtn.disabled = isFinishing;
    signOutBtn.disabled = isFinishing;
  }

  // ── Navigation handlers ───────────────────────────────────────────────────

  async function handleNext() {
    if (!stepIsValid || isFinishing) return;

    if (currentStep < TOTAL_STEPS) {
      currentStep += 1;
      renderCurrentStep();
      return;
    }

    // Step 7 — Finish.
    isFinishing = true;
    updateNavigation();

    try {
      await finalizeWizard(state, profile);
      showToast(strings.toast.setupComplete, "success");
      // Hand control back to the shell, which will route to the dashboard.
      onComplete();
    } catch (err) {
      console.error("[wizard] finalizeWizard failed:", err);
      showToast(strings.errors.setupSaveFailed, "error");
      isFinishing = false;
      updateNavigation();
    }
  }

  function handleBack() {
    if (currentStep <= 1 || isFinishing) return;
    currentStep -= 1;
    renderCurrentStep();
  }

  function handleSkip() {
    if (isFinishing) return;
    // Step 4 — clear any subscription model state.
    if (currentStep === 4) {
      state.firstSubscriptionModel = null;
    }
    // Step 5 — clear any bundle state.
    if (currentStep === 5) {
      state.firstBundle = null;
    }
    if (currentStep < TOTAL_STEPS) {
      currentStep += 1;
      renderCurrentStep();
    }
  }

  async function handleSignOut() {
    if (isFinishing) return;
    signOutBtn.disabled = true;
    try {
      await signOut();
      showToast(strings.toast.signedOut, "info");
    } catch (err) {
      console.error("[wizard] signOut failed:", err);
      showToast(strings.errors.unexpected, "error");
      signOutBtn.disabled = false;
    }
  }

  // Wire up the persistent footer/header listeners.
  nextBtn.addEventListener("click", handleNext);
  backBtn.addEventListener("click", handleBack);
  skipBtn.addEventListener("click", handleSkip);
  signOutBtn.addEventListener("click", handleSignOut);

  // First render.
  renderCurrentStep();

  // Cleanup function — called by the shell when swapping views.
  return function cleanup() {
    if (stepCleanup) {
      try { stepCleanup(); } catch (e) { console.error("[wizard] cleanup threw:", e); }
      stepCleanup = null;
    }
    nextBtn.removeEventListener("click", handleNext);
    backBtn.removeEventListener("click", handleBack);
    skipBtn.removeEventListener("click", handleSkip);
    signOutBtn.removeEventListener("click", handleSignOut);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Placeholder steps (will be replaced by real step files)
// ─────────────────────────────────────────────────────────────────────────────

const STEP_NAMES = {
  4: "First subscription model",
  5: "First bundle",
  6: "Confirm your account"
};

function renderPlaceholderStep(container, stepNumber) {
  const stepName = STEP_NAMES[stepNumber] || "Coming next";
  const title = strings.wizard.placeholderStepTitle
    .replace("{n}", stepNumber)
    .replace("{name}", stepName);

  container.innerHTML = `
    <div class="aq-wizard__step">
      <h2 class="aq-wizard__step-title">${escapeHtml(title)}</h2>
      <p class="aq-wizard__step-placeholder">${strings.wizard.placeholderStepBody}</p>
    </div>
  `;

  // No listeners to clean up.
  return function cleanup() {};
}

function renderStep7TerminalPlaceholder(container) {
  // Step 7 is intentionally write-nothing — see §39.4 of the master prompt.
  container.innerHTML = `
    <div class="aq-wizard__step">
      <h2 class="aq-wizard__step-title">Step 7: Face terminal setup</h2>
      <p class="aq-wizard__step-placeholder">
        The Akuvox face terminal will be configured later, after Cloud Functions are enabled.
        For now, you can finish setup and the playground will run in manual check-in mode
        until the terminal is connected.
      </p>
      <p class="aq-wizard__step-placeholder">
        Click <strong>Finish setup</strong> to save your settings and go to the dashboard.
      </p>
    </div>
  `;

  return function cleanup() {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
    .aq-wizard {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background: var(--bg, #f8fafc);
    }

    .aq-wizard__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 20px;
      background: var(--card, #ffffff);
      border-bottom: 1px solid var(--line, #e2e8f0);
    }

    .aq-wizard__brand {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 20px;
      font-weight: 700;
      color: var(--ink, #0f172a);
      letter-spacing: -0.02em;
    }

    .aq-wizard__progress {
      padding: 16px 20px 0 20px;
      background: var(--card, #ffffff);
    }

    .aq-wizard__progress-bar {
      width: 100%;
      height: 6px;
      background: var(--line, #e2e8f0);
      border-radius: 999px;
      overflow: hidden;
    }

    .aq-wizard__progress-fill {
      height: 100%;
      background: var(--accent, #0ea5e9);
      border-radius: 999px;
      transition: width 250ms ease;
      width: 0%;
    }

    .aq-wizard__progress-text {
      margin-top: 8px;
      font-family: 'DM Mono', ui-monospace, monospace;
      font-size: 11px;
      color: var(--mute, #64748b);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      text-align: right;
    }

    .aq-wizard__main {
      flex: 1;
      display: flex;
      justify-content: center;
      padding: 32px 20px;
    }

    .aq-wizard__body {
      width: 100%;
      max-width: 560px;
    }

    .aq-wizard__step {
      background: var(--card, #ffffff);
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 14px;
      padding: 32px 28px;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
    }

    .aq-wizard__step-title {
      margin: 0 0 8px 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 22px;
      font-weight: 600;
      color: var(--ink, #0f172a);
    }

    .aq-wizard__step-subtitle {
      margin: 0 0 24px 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      color: var(--mute, #64748b);
      line-height: 1.5;
    }

    .aq-wizard__step-placeholder {
      margin: 12px 0 0 0;
      padding: 16px 18px;
      background: var(--bg, #f8fafc);
      border-radius: 8px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      color: var(--ink-2, #334155);
      line-height: 1.5;
    }

    .aq-wizard__form {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .aq-field__help {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      color: var(--mute, #64748b);
      line-height: 1.4;
    }

    .aq-field__select {
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%228%22%20viewBox%3D%220%200%2012%208%22%3E%3Cpath%20fill%3D%22%2364748b%22%20d%3D%22M6%208L0%200h12z%22%2F%3E%3C%2Fsvg%3E");
      background-repeat: no-repeat;
      background-position: right 14px center;
      background-size: 12px 8px;
      padding-right: 40px;
    }

    .aq-wizard__footer {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      background: var(--card, #ffffff);
      border-top: 1px solid var(--line, #e2e8f0);
    }

    .aq-wizard__footer-spacer {
      flex: 1;
    }

    .aq-button--primary {
      background: var(--accent, #0ea5e9);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 120ms ease, opacity 120ms ease;
    }

    .aq-button--primary:hover:not(:disabled) {
      background: #0284c7;
    }

    .aq-button--primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(style);
}