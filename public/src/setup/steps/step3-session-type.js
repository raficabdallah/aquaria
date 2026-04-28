// public/src/setup/steps/step3-session-type.js
//
// Wizard Step 3 — First session type (§29 step 3, §8).
// Collects: name, durationMinutes, priceMinor (integer cents).
// REQUIRED: at least one session type must exist before the playground can run.
// The Next button stays disabled until all three fields are valid.
//
// Writes nothing to Firestore — it only mutates the in-memory wizard state.
// The actual write happens later, in wizard-state.js's finalize batch, which
// already expects state.firstSessionType.{name, durationMinutes, priceMinor}.
//
// Public API:
//   renderStep3SessionType(container, state, onValidChange)
//     - container:     element to render the step into. Existing children replaced.
//     - state:         the wizard state object (mutated as the user types/picks).
//                      We read state.firstSessionType so navigating Back to
//                      this step preserves prior input.
//     - onValidChange: called with (true|false) whenever validity flips.
//                      Pre-filled defaults are valid, so this fires `true`
//                      on initial render.
//   Returns: a cleanup function that detaches the step's listeners.

import { strings } from "../../strings/en.js";

// Allowed duration choices for the dropdown. Order = display order.
// Default selection is 120.
const DURATION_OPTIONS = [
  { value: 30,  labelKey: "durationOption30"  },
  { value: 45,  labelKey: "durationOption45"  },
  { value: 60,  labelKey: "durationOption60"  },
  { value: 90,  labelKey: "durationOption90"  },
  { value: 120, labelKey: "durationOption120" }
];
const DEFAULT_DURATION = 120;

// Sanity caps on the name and price.
const NAME_MIN = 2;
const NAME_MAX = 60;
const PRICE_MAX_MINOR = 999999; // $9,999.99 — anything more is almost certainly a typo

// Defaults the spec example proposes.
const DEFAULT_NAME = "Standard 2-hour";
const DEFAULT_PRICE_MINOR = 500; // $5.00

export function renderStep3SessionType(container, state, onValidChange) {
  // ── Apply pre-fill if the state is still in its initial empty shape ───────
  // wizard-state.js initializes firstSessionType as { name: "", durationMinutes: 0, priceMinor: 0 }.
  // If the user is hitting this step for the first time, we plant the spec's
  // example values. If they've already typed something and navigated Back +
  // Next, we keep their input.
  if (!state.firstSessionType.name) {
    state.firstSessionType.name = DEFAULT_NAME;
  }
  if (!state.firstSessionType.durationMinutes) {
    state.firstSessionType.durationMinutes = DEFAULT_DURATION;
  }
  if (!state.firstSessionType.priceMinor) {
    state.firstSessionType.priceMinor = DEFAULT_PRICE_MINOR;
  }

  // ── Build duration options ────────────────────────────────────────────────
  const durationOptionsHtml = DURATION_OPTIONS.map(opt => {
    const sel = opt.value === state.firstSessionType.durationMinutes ? " selected" : "";
    return `<option value="${opt.value}"${sel}>${escapeHtml(strings.wizard.step3[opt.labelKey])}</option>`;
  }).join("");

  // Format the pre-filled priceMinor back to a "5.00" string for the input.
  const initialPriceText = formatMinorAsDollarString(state.firstSessionType.priceMinor);

  // ── Render the form ───────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="aq-wizard__step">
      <h2 class="aq-wizard__step-title">${strings.wizard.step3.title}</h2>
      <p class="aq-wizard__step-subtitle">${strings.wizard.step3.subtitle}</p>

      <div class="aq-wizard__form">

        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step3.nameLabel}</span>
          <input
            type="text"
            id="aq-wizard-step3-name"
            class="aq-field__input"
            placeholder="${strings.wizard.step3.namePlaceholder}"
            value="${escapeHtml(state.firstSessionType.name)}"
            maxlength="${NAME_MAX}"
            autocomplete="off"
          />
          <span class="aq-field__help">${strings.wizard.step3.nameHelp}</span>
          <span class="aq-field__error" id="aq-wizard-step3-name-error" hidden></span>
        </label>

        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step3.durationLabel}</span>
          <select id="aq-wizard-step3-duration" class="aq-field__input aq-field__select">
            ${durationOptionsHtml}
          </select>
          <span class="aq-field__help">${strings.wizard.step3.durationHelp}</span>
        </label>

        <label class="aq-field">
          <span class="aq-field__label">${strings.wizard.step3.priceLabel}</span>
          <div class="aq-field__price-row">
            <input
              type="text"
              inputmode="decimal"
              id="aq-wizard-step3-price"
              class="aq-field__input aq-field__input--price"
              placeholder="${strings.wizard.step3.pricePlaceholder}"
              value="${escapeHtml(initialPriceText)}"
              autocomplete="off"
            />
            <span class="aq-field__price-suffix">${strings.wizard.step3.priceSuffix}</span>
          </div>
          <span class="aq-field__help">${strings.wizard.step3.priceHelp}</span>
          <span class="aq-field__error" id="aq-wizard-step3-price-error" hidden></span>
        </label>

      </div>
    </div>
  `;

  ensureStep3Styles();

  const nameInput     = container.querySelector("#aq-wizard-step3-name");
  const durationSelect = container.querySelector("#aq-wizard-step3-duration");
  const priceInput    = container.querySelector("#aq-wizard-step3-price");
  const nameError     = container.querySelector("#aq-wizard-step3-name-error");
  const priceError    = container.querySelector("#aq-wizard-step3-price-error");

  // ── Validation ────────────────────────────────────────────────────────────
  // Each validator returns null on success or a string error message.
  // The shell's Next button reflects the AND of all three.

  function validateName(raw) {
    const name = (raw || "").trim();
    if (name.length === 0) return strings.errors.sessionTypeNameRequired;
    if (name.length < NAME_MIN) return strings.errors.sessionTypeNameTooShort;
    if (name.length > NAME_MAX) return strings.errors.sessionTypeNameTooLong;
    return null;
  }

  function validatePrice(raw) {
    const text = (raw || "").trim();
    if (text.length === 0) return { error: strings.errors.sessionTypePriceRequired };

    // Match: optional digits, optional dot with up to N decimals.
    // We hand-validate decimal count separately for a clearer error.
    const numericPattern = /^[0-9]+(\.[0-9]*)?$|^\.[0-9]+$/;
    if (!numericPattern.test(text)) {
      // Catch leading "-" too — negative prices are not allowed.
      if (text.startsWith("-")) return { error: strings.errors.sessionTypePriceNegative };
      return { error: strings.errors.sessionTypePriceInvalid };
    }

    // Split on the decimal point and reassemble as integer cents.
    const [whole, fractional = ""] = text.split(".");
    if (fractional.length > 2) {
      return { error: strings.errors.sessionTypePriceTooManyDecimals };
    }

    // Pad the fractional part to exactly 2 digits, then concatenate.
    // "5"     -> whole="5",  frac=""    -> "5"   + "00" = "500"
    // "5.5"   -> whole="5",  frac="5"   -> "5"   + "50" = "550"
    // "5.50"  -> whole="5",  frac="50"  -> "5"   + "50" = "550"
    // "12.34" -> whole="12", frac="34"  -> "12"  + "34" = "1234"
    // ".5"    -> whole="",   frac="5"   -> ""    + "50" = "50"      (=$0.50)
    const wholeNorm = whole === "" ? "0" : whole;
    const fracPadded = (fractional + "00").slice(0, 2);
    const minorStr = wholeNorm + fracPadded;
    const minor = parseInt(minorStr, 10);

    if (!Number.isFinite(minor) || minor < 0) {
      return { error: strings.errors.sessionTypePriceInvalid };
    }
    if (minor > PRICE_MAX_MINOR) {
      return { error: strings.errors.sessionTypePriceTooHigh };
    }

    return { minor };
  }

  // ── Recompute validity and update error UI ────────────────────────────────

  function recomputeValidity() {
    let allValid = true;

    // Name
    const nameErrorMsg = validateName(nameInput.value);
    if (nameErrorMsg) {
      showError(nameError, nameErrorMsg);
      allValid = false;
    } else {
      hideError(nameError);
    }

    // Price
    const priceResult = validatePrice(priceInput.value);
    if (priceResult.error) {
      showError(priceError, priceResult.error);
      allValid = false;
    } else {
      hideError(priceError);
    }

    onValidChange(allValid);
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.hidden = false;
  }

  function hideError(el) {
    el.textContent = "";
    el.hidden = true;
  }

  // ── State sync handlers ───────────────────────────────────────────────────

  function handleNameInput() {
    state.firstSessionType.name = nameInput.value;
    recomputeValidity();
  }

  function handleDurationChange() {
    const v = parseInt(durationSelect.value, 10);
    if (Number.isFinite(v)) {
      state.firstSessionType.durationMinutes = v;
    }
    // Duration always valid — no validity recompute needed for this field.
  }

  function handlePriceInput() {
    const result = validatePrice(priceInput.value);
    if (!result.error) {
      state.firstSessionType.priceMinor = result.minor;
    }
    // We always recompute validity, even on bad input, so the error message
    // shows immediately and Next stays disabled.
    recomputeValidity();
  }

  nameInput.addEventListener("input", handleNameInput);
  durationSelect.addEventListener("change", handleDurationChange);
  priceInput.addEventListener("input", handlePriceInput);

  // Initial validity check. Pre-filled defaults are valid, so this fires `true`.
  // Errors stay hidden because the values do pass validation.
  recomputeValidity();

  // Focus the name field so the user can immediately edit if they want to.
  // (Selecting the existing text makes overwriting frictionless.)
  nameInput.focus();
  nameInput.select();

  return function cleanup() {
    nameInput.removeEventListener("input", handleNameInput);
    durationSelect.removeEventListener("change", handleDurationChange);
    priceInput.removeEventListener("input", handlePriceInput);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Local helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert an integer minor-unit price (cents) to a "5.00" style display string.
 * Used to seed the price input from state when the user navigates back to this step.
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
// Step-specific styles. Most styles come from the wizard frame and login view,
// but the price row needs a small layout (input + USD suffix on the same line),
// and inline error messages need their own treatment.
// ─────────────────────────────────────────────────────────────────────────────

let step3StylesInjected = false;
function ensureStep3Styles() {
  if (step3StylesInjected) return;
  step3StylesInjected = true;

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