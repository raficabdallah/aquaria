// public/src/setup/steps/step5-bundle.js
//
// Wizard Step 5 — First bundle (§29 step 5, §8). OPTIONAL.
// Skip is allowed via the wizard footer. Leaving Name and Price both blank
// is treated as an in-step Skip (state.firstBundle stays null, no bundle
// doc is written by finalize).
//
// Five fields: Name, TotalVisits, ValidityMonths, MinutesPerVisit, Price.
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
//   renderStep5Bundle(container, state, onValidChange, profile)
//     - container:     element to render into. Existing children replaced.
//     - state:         the wizard state object (mutated as the user types).
//     - onValidChange: called with (true|false) whenever validity flips.
//     - profile:       unused on this step; kept for signature consistency.
//   Returns: a cleanup function that detaches the step's listeners.

import { strings } from "../../strings/en.js";

const NAME_MIN = 2;
const NAME_MAX = 60;
const PRICE_MAX_MINOR = 999999; // $9,999.99 ceiling

const TOTAL_VISITS_OPTIONS = [
  { value: 5,  labelKey: "totalVisitsOption5"  },
  { value: 10, labelKey: "totalVisitsOption10" },
  { value: 15, labelKey: "totalVisitsOption15" },
  { value: 20, labelKey: "totalVisitsOption20" },
  { value: 25, labelKey: "totalVisitsOption25" }
];
const DEFAULT_TOTAL_VISITS = 10;

const VALIDITY_MONTHS_OPTIONS = [
  { value: 1,  labelKey: "validityMonthsOption1"  },
  { value: 3,  labelKey: "validityMonthsOption3"  },
  { value: 6,  labelKey: "validityMonthsOption6"  },
  { value: 12, labelKey: "validityMonthsOption12" }
];
const DEFAULT_VALIDITY_MONTHS = 6;

// Minutes-per-visit options. Same shape and labels as Step 3's durations.
// Reuses strings.wizard.step3.durationOption* keys.
const MINUTES_PER_VISIT_OPTIONS = [
  { value: 30,  labelKey: "durationOption30"  },
  { value: 45,  labelKey: "durationOption45"  },
  { value: 60,  labelKey: "durationOption60"  },
  { value: 90,  labelKey: "durationOption90"  },
  { value: 120, labelKey: "durationOption120" }
];
const DEFAULT_MINUTES_PER_VISIT = 120;

export function renderStep5Bundle(container, state, onValidChange /*, profile */) {
  // ── Restore prior input on Back ───────────────────────────────────────────
  const existing = state.firstBundle;
  const initialName            = existing ? existing.name            : "";
  const initialTotalVisits     = existing ? existing.totalVisits     : DEFAULT_TOTAL_VISITS;
  const initialValidityMonths  = existing ? existing.validityMonths  : DEFAULT_VALIDITY_MONTHS;
  const initialMinutesPerVisit = existing ? existing.minutesPerVisit : DEFAULT_MINUTES_PER_VISIT;
  const initialPriceMinor      = existing ? existing.priceMinor      : 0;
  const initialPriceText       = initialPriceMinor > 0
    ? formatMinorAsDollarString(initialPriceMinor)
    : "";

  // ── Build dropdown options ────────────────────────────────────────────────
  const totalVisitsHtml = TOTAL_VISITS_OPTIONS.map(opt => {
    const sel = opt.value === initialTotalVisits ? " selected" : "";
    const label = strings.wizard.step5[opt.labelKey];
    return `<option value="${opt.value}"${sel}>${escapeHtml(label)}</option>`;
  }).join("");

  const validityMonthsHtml = VALIDITY_MONTHS_OPTIONS.map(opt => {
    const sel = opt.value === initialValidityMonths ? " selected" : "";
    const label = strings.wizard.step5[opt.labelKey];
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
      <h2 class="aq-wizard__step-title">${strings.wizard.step5.title}</h2>
      <p class="aq-wizard__step-subtitle">${strings.wizard.step5.subtitle}</p>

      <div class="aq-wizard__form">

        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step5.nameLabel}</span>
          <input
            type="text"
            id="aq-wizard-step5-name"
            class="aq-field__input"
            placeholder="${strings.wizard.step5.namePlaceholder}"
            value="${escapeHtml(initialName)}"
            maxlength="${NAME_MAX}"
            autocomplete="off"
          />
          <span class="aq-field__help">${strings.wizard.step5.nameHelp}</span>
          <span class="aq-field__error" id="aq-wizard-step5-name-error" hidden></span>
        </label>

        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step5.totalVisitsLabel}</span>
          <select id="aq-wizard-step5-total-visits" class="aq-field__input aq-field__select">
            ${totalVisitsHtml}
          </select>
          <span class="aq-field__help">${strings.wizard.step5.totalVisitsHelp}</span>
        </label>

        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step5.validityMonthsLabel}</span>
          <select id="aq-wizard-step5-validity-months" class="aq-field__input aq-field__select">
            ${validityMonthsHtml}
          </select>
          <span class="aq-field__help">${strings.wizard.step5.validityMonthsHelp}</span>
        </label>

        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step5.minutesPerVisitLabel}</span>
          <select id="aq-wizard-step5-minutes-per-visit" class="aq-field__input aq-field__select">
            ${minutesPerVisitHtml}
          </select>
          <span class="aq-field__help">${strings.wizard.step5.minutesPerVisitHelp}</span>
        </label>

        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step5.priceLabel}</span>
          <div class="aq-field__price-row">
            <input
              type="text"
              inputmode="decimal"
              id="aq-wizard-step5-price"
              class="aq-field__input aq-field__input--price"
              placeholder="${strings.wizard.step5.pricePlaceholder}"
              value="${escapeHtml(initialPriceText)}"
              autocomplete="off"
            />
            <span class="aq-field__price-suffix">${strings.wizard.step5.priceSuffix}</span>
          </div>
          <span class="aq-field__help">${strings.wizard.step5.priceHelp}</span>
          <span class="aq-field__error" id="aq-wizard-step5-price-error" hidden></span>
        </label>

        <span class="aq-field__error" id="aq-wizard-step5-partial-error" hidden></span>

      </div>
    </div>
  `;

  ensureStep5Styles();

  const nameInput              = container.querySelector("#aq-wizard-step5-name");
  const totalVisitsSelect      = container.querySelector("#aq-wizard-step5-total-visits");
  const validityMonthsSelect   = container.querySelector("#aq-wizard-step5-validity-months");
  const minutesPerVisitSelect  = container.querySelector("#aq-wizard-step5-minutes-per-visit");
  const priceInput             = container.querySelector("#aq-wizard-step5-price");
  const nameError              = container.querySelector("#aq-wizard-step5-name-error");
  const priceError             = container.querySelector("#aq-wizard-step5-price-error");
  const partialError           = container.querySelector("#aq-wizard-step5-partial-error");

  // ── Validators ────────────────────────────────────────────────────────────

  function validateNameContent(raw) {
    const name = raw.trim();
    if (name.length < NAME_MIN) return strings.errors.bundleNameTooShort;
    if (name.length > NAME_MAX) return strings.errors.bundleNameTooLong;
    return null;
  }

  function validatePriceContent(raw) {
    const text = raw.trim();
    const numericPattern = /^[0-9]+(\.[0-9]*)?$|^\.[0-9]+$/;
    if (!numericPattern.test(text)) {
      if (text.startsWith("-")) return { error: strings.errors.bundlePriceNegative };
      return { error: strings.errors.bundlePriceInvalid };
    }
    const [whole, fractional = ""] = text.split(".");
    if (fractional.length > 2) {
      return { error: strings.errors.bundlePriceTooManyDecimals };
    }
    const wholeNorm = whole === "" ? "0" : whole;
    const fracPadded = (fractional + "00").slice(0, 2);
    const minor = parseInt(wholeNorm + fracPadded, 10);
    if (!Number.isFinite(minor) || minor < 0) {
      return { error: strings.errors.bundlePriceInvalid };
    }
    if (minor > PRICE_MAX_MINOR) {
      return { error: strings.errors.bundlePriceTooHigh };
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

    const totalVisits     = parseInt(totalVisitsSelect.value, 10);
    const validityMonths  = parseInt(validityMonthsSelect.value, 10);
    const minutesPerVisit = parseInt(minutesPerVisitSelect.value, 10);

    hideError(nameError);
    hideError(priceError);
    hideError(partialError);

    // Case 1: both empty -> "skip" state.
    if (!nameFilled && !priceFilled) {
      state.firstBundle = null;
      onValidChange(true);
      return;
    }

    // Case 2: partial fill -> invalid.
    if (nameFilled !== priceFilled) {
      showError(partialError, strings.errors.bundlePartialFill);
      state.firstBundle = null;
      onValidChange(false);
      return;
    }

    // Case 3: both filled -> validate each.
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
      state.firstBundle = null;
      onValidChange(false);
      return;
    }

    // Case 4: both filled and valid -> snapshot to state.
    state.firstBundle = {
      name: nameTrimmed,
      totalVisits,
      validityMonths,
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
  totalVisitsSelect.addEventListener("change", onChange);
  validityMonthsSelect.addEventListener("change", onChange);
  minutesPerVisitSelect.addEventListener("change", onChange);
  priceInput.addEventListener("input", onChange);

  // Initial validity check. With blank Name and Price defaults, this lands
  // in Case 1 (skip state) and reports valid.
  recomputeValidity();

  // Focus name field for immediate input.
  nameInput.focus();

  return function cleanup() {
    nameInput.removeEventListener("input", onChange);
    totalVisitsSelect.removeEventListener("change", onChange);
    validityMonthsSelect.removeEventListener("change", onChange);
    minutesPerVisitSelect.removeEventListener("change", onChange);
    priceInput.removeEventListener("input", onChange);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Local helpers
// ─────────────────────────────────────────────────────────────────────────────

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
// Step-specific styles. Same as Steps 3 and 4 — re-injected idempotently.
// ─────────────────────────────────────────────────────────────────────────────

let step5StylesInjected = false;
function ensureStep5Styles() {
  if (step5StylesInjected) return;
  step5StylesInjected = true;

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