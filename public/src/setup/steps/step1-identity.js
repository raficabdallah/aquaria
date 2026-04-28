// public/src/setup/steps/step1-identity.js
//
// Wizard Step 1 — Identity (§29 step 1).
// Collects: playground name, default country code.
// Writes nothing to Firestore — it only mutates the in-memory wizard state
// object. The actual write happens later, in wizard-state.js's finalize batch.
//
// Public API:
//   renderStep1Identity(container, state, onValidChange)
//     - container:     element to render the step into. Existing children replaced.
//     - state:         the wizard state object (mutated as the user types).
//                      We read state.playgroundName and state.countryDialCode
//                      so that navigating Back to this step preserves input.
//     - onValidChange: called with (true|false) whenever validity flips.
//                      The wizard shell uses this to enable/disable Next.
//   Returns: a cleanup function that detaches the step's listeners.

import { strings } from "../../strings/en.js";
import { countries } from "../../data/countries.js";

export function renderStep1Identity(container, state, onValidChange) {
  // Build the country dropdown options. The state holds a dial code
  // (e.g. "+961"). We mark whichever option matches as selected, so coming
  // back to this step shows the user's previous choice.
  //
  // Note: a few dial codes are shared by multiple countries (e.g. "+1" is
  // both US and Canada). The first match in alphabetical order wins. For
  // Lebanon ("+961") this is unique, so the default behavior is fine.
  const countryOptions = countries.map(c => {
    const selected = c.dialCode === state.countryDialCode ? " selected" : "";
    return `<option value="${c.dialCode}"${selected}>${c.flag} ${escapeHtml(c.name)} (${c.dialCode})</option>`;
  }).join("");

  container.innerHTML = `
    <div class="aq-wizard__step">
      <h2 class="aq-wizard__step-title">${strings.wizard.step1.title}</h2>
      <p class="aq-wizard__step-subtitle">${strings.wizard.step1.subtitle}</p>

      <div class="aq-wizard__form">
        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step1.playgroundNameLabel}</span>
          <input
            type="text"
            id="aq-wizard-step1-name"
            class="aq-field__input"
            placeholder="${strings.wizard.step1.playgroundNamePlaceholder}"
            value="${escapeHtml(state.playgroundName)}"
            maxlength="60"
            autocomplete="off"
          />
          <span class="aq-field__help">${strings.wizard.step1.playgroundNameHelp}</span>
        </label>

        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step1.countryCodeLabel}</span>
          <select id="aq-wizard-step1-country" class="aq-field__input aq-field__select">
            ${countryOptions}
          </select>
          <span class="aq-field__help">${strings.wizard.step1.countryCodeHelp}</span>
        </label>
      </div>
    </div>
  `;

  const nameInput     = container.querySelector("#aq-wizard-step1-name");
  const countrySelect = container.querySelector("#aq-wizard-step1-country");

  function recomputeValidity() {
    const name = nameInput.value.trim();
    const isValid = name.length >= 2 && name.length <= 60;
    onValidChange(isValid);
  }

  function handleNameInput() {
    state.playgroundName = nameInput.value;
    recomputeValidity();
  }

  function handleCountryChange() {
    state.countryDialCode = countrySelect.value;
    // Country selection doesn't affect validity — name is the only required field.
  }

  nameInput.addEventListener("input", handleNameInput);
  countrySelect.addEventListener("change", handleCountryChange);

  // Initial validity check, in case the user navigated back with data already filled.
  recomputeValidity();

  // Focus the name field so the user can type immediately.
  nameInput.focus();

  return function cleanup() {
    nameInput.removeEventListener("input", handleNameInput);
    countrySelect.removeEventListener("change", handleCountryChange);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Local helper. Kept private to this file for now; if a third step file needs
// this, we'll lift it to /public/src/ui/escape-html.js.
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}