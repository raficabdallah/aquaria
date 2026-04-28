// public/src/setup/steps/step2-operating.js
//
// Wizard Step 2 — Operating settings (§29 step 2).
// Collects: language, timezone. Currency is locked to USD at v6.2 (display-only).
// Writes nothing to Firestore — it only mutates the in-memory wizard state.
// The actual write happens later, in wizard-state.js's finalize batch.
//
// Public API:
//   renderStep2Operating(container, state, onValidChange)
//     - container:     element to render the step into. Existing children replaced.
//     - state:         the wizard state object (mutated as the user picks).
//                      We read state.language and state.timezone so navigating Back
//                      to this step preserves choices.
//     - onValidChange: called with (true|false) whenever validity flips.
//                      Step 2 has no required input — every field has a sensible
//                      default — so this is called once with `true` on render.
//   Returns: a cleanup function that detaches the step's listeners.

import { strings } from "../../strings/en.js";
import { timezones, DEFAULT_TIMEZONE_ID } from "../../data/timezones.js";

export function renderStep2Operating(container, state, onValidChange) {
  // ── Build the language options ─────────────────────────────────────────────
  // Only English is selectable today. Arabic and French are shown but disabled,
  // so the SuperAdmin can see they're planned without being able to pick a
  // language whose strings file doesn't exist yet. When ar.js / fr.js are added,
  // we just remove the `disabled` flags here and update the labels.
  const languageOptions = [
    { value: "en", label: strings.wizard.step2.languageOptionEnglish, disabled: false },
    { value: "ar", label: strings.wizard.step2.languageOptionArabic,  disabled: true },
    { value: "fr", label: strings.wizard.step2.languageOptionFrench,  disabled: true }
  ].map(opt => {
    const selected = opt.value === state.language && !opt.disabled ? " selected" : "";
    const disabled = opt.disabled ? " disabled" : "";
    return `<option value="${opt.value}"${selected}${disabled}>${escapeHtml(opt.label)}</option>`;
  }).join("");

  // ── Build the timezone options, grouped by region ─────────────────────────
  // Use <optgroup> so the dropdown groups timezones visually (Middle East,
  // Europe, etc.). Region labels themselves come from the strings file.
  const regionLabelMap = {
    "Middle East":     strings.wizard.step2.timezoneRegionMiddleEast,
    "Africa":          strings.wizard.step2.timezoneRegionAfrica,
    "Europe":          strings.wizard.step2.timezoneRegionEurope,
    "Americas":        strings.wizard.step2.timezoneRegionAmericas,
    "Asia & Oceania":  strings.wizard.step2.timezoneRegionAsiaOceania
  };

  // Preserve the order in which regions first appear in the timezones array.
  const regionOrder = [];
  for (const tz of timezones) {
    if (!regionOrder.includes(tz.region)) regionOrder.push(tz.region);
  }

  // If the current state.timezone is not in our curated list (defensive — should
  // not happen in practice), fall back to the default so the dropdown still has
  // a selected option.
  const knownIds = new Set(timezones.map(t => t.id));
  const selectedTz = knownIds.has(state.timezone) ? state.timezone : DEFAULT_TIMEZONE_ID;

  const timezoneOptions = regionOrder.map(region => {
    const groupLabel = regionLabelMap[region] || region;
    const optionsHtml = timezones
      .filter(tz => tz.region === region)
      .map(tz => {
        const sel = tz.id === selectedTz ? " selected" : "";
        return `<option value="${tz.id}"${sel}>${escapeHtml(tz.label)} (${tz.offsetLabel})</option>`;
      })
      .join("");
    return `<optgroup label="${escapeHtml(groupLabel)}">${optionsHtml}</optgroup>`;
  }).join("");

  // If we had to fall back to the default, write it back to state so what's
  // shown matches what's stored.
  if (state.timezone !== selectedTz) {
    state.timezone = selectedTz;
  }

  // ── Render the form ───────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="aq-wizard__step">
      <h2 class="aq-wizard__step-title">${strings.wizard.step2.title}</h2>
      <p class="aq-wizard__step-subtitle">${strings.wizard.step2.subtitle}</p>

      <div class="aq-wizard__form">

        <div class="aq-field">
          <span class="aq-field__label">${strings.wizard.step2.currencyLabel}</span>
          <div class="aq-field__readonly">${strings.wizard.step2.currencyValue}</div>
          <span class="aq-field__help">${strings.wizard.step2.currencyHelp}</span>
        </div>

        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step2.languageLabel}</span>
          <select id="aq-wizard-step2-language" class="aq-field__input aq-field__select">
            ${languageOptions}
          </select>
          <span class="aq-field__help">${strings.wizard.step2.languageHelp}</span>
        </label>

        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step2.timezoneLabel}</span>
          <select id="aq-wizard-step2-timezone" class="aq-field__input aq-field__select">
            ${timezoneOptions}
          </select>
          <span class="aq-field__help">${strings.wizard.step2.timezoneHelp}</span>
        </label>

      </div>
    </div>
  `;

  // Inject the read-only field style once. (Step 1 doesn't need this; only
  // Step 2's currency row uses it. Kept here so it travels with the step.)
  ensureStep2Styles();

  const languageSelect = container.querySelector("#aq-wizard-step2-language");
  const timezoneSelect = container.querySelector("#aq-wizard-step2-timezone");

  function handleLanguageChange() {
    state.language = languageSelect.value;
  }

  function handleTimezoneChange() {
    state.timezone = timezoneSelect.value;
  }

  languageSelect.addEventListener("change", handleLanguageChange);
  timezoneSelect.addEventListener("change", handleTimezoneChange);

  // No required input — Next is always enabled on this step.
  onValidChange(true);

  return function cleanup() {
    languageSelect.removeEventListener("change", handleLanguageChange);
    timezoneSelect.removeEventListener("change", handleTimezoneChange);
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

// Step-specific style: the currency row is a static text display, not an input.
// It needs to look like a read-only field — a soft background, padding to match
// the height of an input, no focus state.
let step2StylesInjected = false;
function ensureStep2Styles() {
  if (step2StylesInjected) return;
  step2StylesInjected = true;

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