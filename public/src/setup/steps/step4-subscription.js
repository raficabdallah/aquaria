// public/src/setup/steps/step4-subscription.js
//
// Wizard Step 4 — First subscription model (§29 step 4, §8). OPTIONAL.
// Skip is allowed via the wizard footer. Leaving Name and Price both blank
// is treated as an in-step Skip (state.firstSubscriptionModel stays null,
// no subscription doc is written by finalize).
//
// Five fields: Name, DurationMonths, VisitsPerWeek, MinutesPerVisit, Price.
// VisitsPerWeek = 7 is the sentinel for "Unlimited" per §8.
// Price is typed as dollars and stored as integer minor units (cents) per §3.
//
// Validity rules:
// - Both Name and Price empty  -> "skip" state, Next enabled, state = null.
// - Both Name and Price filled validly -> "create" state, Next enabled,
//   state populated with the full object.
// - Exactly one filled         -> "partial" state, Next disabled,
//   inline error tells user to fill both or blank both.
// - Either filled invalidly    -> "invalid" state, Next disabled,
//   inline field-specific error.
//
// Public API:
//   renderStep4Subscription(container, state, onValidChange, profile)
//     - container:     element to render into. Existing children replaced.
//     - state:         the wizard state object (mutated as the user types).
//     - onValidChange: called with (true|false) whenever validity flips.
//     - profile:       unused on this step; kept for signature consistency.
//   Returns: a cleanup function that detaches the step's listeners.

import { strings } from "../../strings/en.js";

const NAME_MIN = 2;
const NAME_MAX = 60;
const PRICE_MAX_MINOR = 999999; // $9,999.99 ceiling

// Length-of-subscription options (months).
const DURATION_MONTHS_OPTIONS = [
  { value: 1,  labelKey: "durationMonthsOption1"  },
  { value: 3,  labelKey: "durationMonthsOption3"  },
  { value: 6,  labelKey: "durationMonthsOption6"  },
  { value: 12, labelKey: "durationMonthsOption12" }
];
const DEFAULT_DURATION_MONTHS = 1;

// Visits per week. The sentinel value 7 means "Unlimited" per §8.
const VISITS_PER_WEEK_OPTIONS = [
  { value: 1, labelKey: "visitsPerWeekOption1" },
  { value: 2, labelKey: "visitsPerWeekOption2" },
  { value: 3, labelKey: "visitsPerWeekOption3" },
  { value: 4, labelKey: "visitsPerWeekOption4" },
  { value: 5, labelKey: "visitsPerWeekOption5" },
  { value: 6, labelKey: "visitsPerWeekOption6" },
  { value: 7, labelKey: "visitsPerWeekOptionUnlimited" }
];
const DEFAULT_VISITS_PER_WEEK = 7;

// Minutes-per-visit options. Same shape and labels as Step 3's durations.
// We reuse the strings.wizard.step3.durationOption* keys for consistency.
const MINUTES_PER_VISIT_OPTIONS = [
  { value: 30,  labelKey: "durationOption30"  },
  { value: 45,  labelKey: "durationOption45"  },
  { value: 60,  labelKey: "durationOption60"  },
  { value: 90,  labelKey: "durationOption90"  },
  { value: 120, labelKey: "durationOption120" }
];
const DEFAULT_MINUTES_PER_VISIT = 60;

export function renderStep4Subscription(container, state, onValidChange /*, profile */) {
  // ── Restore prior input on Back ───────────────────────────────────────────
  // If the user filled this step, navigated forward, then Back, state.firstSubscriptionModel
  // holds their values. Otherwise it's null. Prepare current values to seed the form.
  const existing = state.firstSubscriptionModel;
  const initialName             = existing ? existing.name             : "";
  const initialDurationMonths   = existing ? existing.durationMonths   : DEFAULT_DURATION_MONTHS;
  const initialVisitsPerWeek    = existing ? existing.visitsPerWeek    : DEFAULT_VISITS_PER_WEEK;
  const initialMinutesPerVisit  = existing ? existing.minutesPerVisit  : DEFAULT_MINUTES_PER_VISIT;
  const initialPriceMinor       = existing ? existing.priceMinor       : 0;
  const initialPriceText        = initialPriceMinor > 0
    ? formatMinorAsDollarString(initialPriceMinor)
    : "";

  // ── Build dropdown options ────────────────────────────────────────────────
  const durationMonthsHtml = DURATION_MONTHS_OPTIONS.map(opt => {
    const sel = opt.value === initialDurationMonths ? " selected" : "";
    const label = strings.wizard.step4[opt.labelKey];
    return `<option value="${opt.value}"${sel}>${escapeHtml(label)}</option>`;
  }).join("");

  const visitsPerWeekHtml = VISITS_PER_WEEK_OPTIONS.map(opt => {
    const sel = opt.value === initialVisitsPerWeek ? " selected" : "";
    const label = strings.wizard.step4[opt.labelKey];
    return `<option value="${opt.value}"${sel}>${escapeHtml(label)}</option>`;
  }).join("");

  const minutesPerVisitHtml = MINUTES_PER_VISIT_OPTIONS.map(opt => {
    const sel = opt.value === initialMinutesPerVisit ? " selected" : "";
    // Reuse Step 3's labels for the minute options.
    const label = strings.wizard.step3[opt.labelKey];
    return `<option value="${opt.value}"${sel}>${escapeHtml(label)}</option>`;
  }).join("");

  // ── Render the form ───────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="aq-wizard__step">
      <h2 class="aq-wizard__step-title">${strings.wizard.step4.title}</h2>
      <p class="aq-wizard__step-subtitle">${strings.wizard.step4.subtitle}</p>

      <div class="aq-wizard__form">

        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step4.nameLabel}</span>
          <input
            type="text"
            id="aq-wizard-step4-name"
            class="aq-field__input"
            placeholder="${strings.wizard.step4.namePlaceholder}"
            value="${escapeHtml(initialName)}"
            maxlength="${NAME_MAX}"
            autocomplete="off"
          />
          <span class="aq-field__help">${strings.wizard.step4.nameHelp}</span>
          <span class="aq-field__error" id="aq-wizard-step4-name-error" hidden></span>
        </label>

        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step4.durationMonthsLabel}</span>
          <select id="aq-wizard-step4-duration-months" class="aq-field__input aq-field__select">
            ${durationMonthsHtml}
          </select>
          <span class="aq-field__help">${strings.wizard.step4.durationMonthsHelp}</span>
        </label>

        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step4.visitsPerWeekLabel}</span>
          <select id="aq-wizard-step4-visits-per-week" class="aq-field__input aq-field__select">
            ${visitsPerWeekHtml}
          </select>
          <span class="aq-field__help">${strings.wizard.step4.visitsPerWeekHelp}</span>
        </label>

        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step4.minutesPerVisitLabel}</span>
          <select id="aq-wizard-step4-minutes-per-visit" class="aq-field__input aq-field__select">
            ${minutesPerVisitHtml}
          </select>
          <span class="aq-field__help">${strings.wizard.step4.minutesPerVisitHelp}</span>
        </label>

        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step4.priceLabel}</span>
          <div class="aq-field__price-row">
            <input
              type="text"
              inputmode="decimal"
              id="aq-wizard-step4-price"
              class="aq-field__input aq-field__input--price"
              placeholder="${strings.wizard.step4.pricePlaceholder}"
              value="${escapeHtml(initialPriceText)}"
              autocomplete="off"
            />
            <span class="aq-field__price-suffix">${strings.wizard.step4.priceSuffix}</span>
          </div>
          <span class="aq-field__help">${strings.wizard.step4.priceHelp}</span>
          <span class="aq-field__error" id="aq-wizard-step4-price-error" hidden></span>
        </label>

        <span class="aq-field__error" id="aq-wizard-step4-partial-error" hidden></span>

      </div>
    </div>
  `;

  ensureStep4Styles();

  const nameInput              = container.querySelector("#aq-wizard-step4-name");
  const durationMonthsSelect   = container.querySelector("#aq-wizard-step4-duration-months");
  const visitsPerWeekSelect    = container.querySelector("#aq-wizard-step4-visits-per-week");
  const minutesPerVisitSelect  = container.querySelector("#aq-wizard-step4-minutes-per-visit");
  const priceInput             = container.querySelector("#aq-wizard-step4-price");
  const nameError              = container.querySelector("#aq-wizard-step4-name-error");
  const priceError             = container.querySelector("#aq-wizard-step4-price-error");
  const partialError           = container.querySelector("#aq-wizard-step4-partial-error");

  // ── Validators ────────────────────────────────────────────────────────────
  // Each name/price validator returns null on success, or a result describing
  // the issue. They're called only when the field has content — empty is
  // handled by the empty/filled/partial logic below.

  function validateNameContent(raw) {
    const name = raw.trim();
    if (name.length < NAME_MIN) return strings.errors.subscriptionNameTooShort;
    if (name.length > NAME_MAX) return strings.errors.subscriptionNameTooLong;
    return null;
  }

  function validatePriceContent(raw) {
    const text = raw.trim();
    const numericPattern = /^[0-9]+(\.[0-9]*)?$|^\.[0-9]+$/;
    if (!numericPattern.test(text)) {
      if (text.startsWith("-")) return { error: strings.errors.subscriptionPriceNegative };
      return { error: strings.errors.subscriptionPriceInvalid };
    }
    const [whole, fractional = ""] = text.split(".");
    if (fractional.length > 2) {
      return { error: strings.errors.subscriptionPriceTooManyDecimals };
    }
    const wholeNorm = whole === "" ? "0" : whole;
    const fracPadded = (fractional + "00").slice(0, 2);
    const minor = parseInt(wholeNorm + fracPadded, 10);
    if (!Number.isFinite(minor) || minor < 0) {
      return { error: strings.errors.subscriptionPriceInvalid };
    }
    if (minor > PRICE_MAX_MINOR) {
      return { error: strings.errors.subscriptionPriceTooHigh };
    }
    return { minor };
  }

  // ── Recompute everything on every change ──────────────────────────────────

  function recomputeValidity() {
    const nameRaw  = nameInput.value;
    const priceRaw = priceInput.value;
    const nameTrimmed  = nameRaw.trim();
    const priceTrimmed = priceRaw.trim();

    const nameFilled  = nameTrimmed.length > 0;
    const priceFilled = priceTrimmed.length > 0;

    // Always-enabled values from the dropdowns.
    const durationMonths  = parseInt(durationMonthsSelect.value, 10);
    const visitsPerWeek   = parseInt(visitsPerWeekSelect.value, 10);
    const minutesPerVisit = parseInt(minutesPerVisitSelect.value, 10);

    // Reset all error displays before recomputing.
    hideError(nameError);
    hideError(priceError);
    hideError(partialError);

    // ── Case 1: both empty -> "skip" state ──────────────────────────────────
    if (!nameFilled && !priceFilled) {
      state.firstSubscriptionModel = null;
      onValidChange(true);
      return;
    }

    // ── Case 2: partial fill -> invalid ─────────────────────────────────────
    if (nameFilled !== priceFilled) {
      // Show partial-fill error only — don't surface field-specific errors yet,
      // because the user hasn't actually entered bad data, just incomplete data.
      showError(partialError, strings.errors.subscriptionPartialFill);
      // We do NOT clobber state.firstSubscriptionModel here — leaving the prior
      // value (whether null or a partial object) doesn't matter, because the
      // next valid recompute will set it correctly. But to be clean and keep
      // the finalize batch deterministic, set it to null until the user resolves.
      state.firstSubscriptionModel = null;
      onValidChange(false);
      return;
    }

    // ── Case 3: both filled -> validate each ────────────────────────────────
    let allValid = true;

    const nameErrMsg = validateNameContent(nameRaw);
    if (nameErrMsg) {
      showError(nameError, nameErrMsg);
      allValid = false;
    }

    const priceResult = validatePriceContent(priceRaw);
    if (priceResult.error) {
      showError(priceError, priceResult.error);
      allValid = false;
    }

    if (!allValid) {
      // Either name or price is filled but invalid. Clear any prior good value
      // so finalize doesn't write stale data.
      state.firstSubscriptionModel = null;
      onValidChange(false);
      return;
    }

    // ── Case 4: both filled and valid -> snapshot to state ──────────────────
    state.firstSubscriptionModel = {
      name: nameTrimmed,
      durationMonths,
      visitsPerWeek,
      minutesPerVisit,
      priceMinor: priceResult.minor
    };
    onValidChange(true);
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.hidden = false;
  }

  function hideError(el) {
    el.textContent = "";
    el.hidden = true;
  }

  // ── Listeners ─────────────────────────────────────────────────────────────

  function onChange() { recomputeValidity(); }

  nameInput.addEventListener("input", onChange);
  durationMonthsSelect.addEventListener("change", onChange);
  visitsPerWeekSelect.addEventListener("change", onChange);
  minutesPerVisitSelect.addEventListener("change", onChange);
  priceInput.addEventListener("input", onChange);

  // Initial validity check. With blank Name and Price defaults, this lands
  // in Case 1 (skip state) and reports valid.
  recomputeValidity();

  // Focus name field for immediate input.
  nameInput.focus();

  return function cleanup() {
    nameInput.removeEventListener("input", onChange);
    durationMonthsSelect.removeEventListener("change", onChange);
    visitsPerWeekSelect.removeEventListener("change", onChange);
    minutesPerVisitSelect.removeEventListener("change", onChange);
    priceInput.removeEventListener("input", onChange);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Local helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert an integer minor-unit price (cents) to a "50.00" style display string.
 */
function formatMinorAsDollarString(minor) {
  const safe = Number.isFinite(minor) && minor >= 0 ? Math.floor(minor) : 0;
  const whole = Math.floor(safe / 100);
  const frac  = safe % 100;
  const fracStr = frac.toString().padStart(2, "0");
  return `${whole}.${fracStr}`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─────────────────────────────────────────────────────────────────────────────
// Step-specific styles. The price-row layout and inline error styling were
// already injected by Step 3, but in case Step 4 is reached without visiting
// Step 3 (theoretically possible if a future flow lets the user jump steps),
// we re-inject. Idempotent via the flag.
// ─────────────────────────────────────────────────────────────────────────────

let step4StylesInjected = false;
function ensureStep4Styles() {
  if (step4StylesInjected) return;
  step4StylesInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    .aq-field__price-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .aq-field__input--price {
      flex: 1;
      font-family: 'DM Mono', ui-monospace, monospace;
    }

    .aq-field__price-suffix {
      font-family: 'DM Mono', ui-monospace, monospace;
      font-size: 13px;
      color: var(--mute, #64748b);
      letter-spacing: 0.05em;
    }

    .aq-field__error {
      display: block;
      margin-top: 6px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      color: var(--danger, #ef4444);
      line-height: 1.4;
    }
  `;
  document.head.appendChild(style);
}