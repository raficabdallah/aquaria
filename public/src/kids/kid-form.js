// public/src/kids/kid-form.js
//
// Shared kid-form rendering, validation, and event wiring. Consumed by
// register-view (mode: "create") and edit-view (mode: "edit"). Extracted
// per §39.12 Phase 2 to eliminate the ~600-line duplication that existed
// between those two views.
//
// What this module owns:
//   - The <form> element and all field markup (Child / School / Parent /
//     Location / Notes sections).
//   - Validation (per-field rules, paint-errors, submit-disabled gating).
//   - Autocomplete suggestions for school and grade (loaded once on mount).
//   - Country-dial dropdowns + tenant default loading.
//   - Phone parsing from E.164 → (dial, local) on edit-init.
//   - Date-of-birth bounds and parsing.
//
// What this module does NOT own:
//   - Page chrome (the .aq-page wrapper + header + title + top-cancel
//     button). Each view renders its own page chrome and mounts the form
//     inside it.
//   - The photo affordance. Register-view has an upload picker; edit-view
//     shows a read-only photo. Neither lives here.
//   - Kid persistence. The view passes an onSubmit callback that returns
//     { ok, errorKey? }; this module just calls it. Locking, navigation,
//     toast messaging — view concerns.
//
// Public API:
//   renderKidForm(mount, options) → cleanup()
//
// options shape:
//   {
//     mode:                   "create" | "edit",
//     initialData?:           Object,   // pre-fill values; only used in edit mode
//     onSubmit:               async (formData) => { ok: boolean, errorKey?: string },
//     onCancel:               () => void,
//     onActivity?:            () => void,   // called on every input event;
//                                            // edit-view passes lockSession.recordActivity
//     submitButtonLabel:      string,
//     submittingButtonLabel:  string,
//     cancelButtonLabel:      string
//   }
//
// initialData shape (when mode = "edit"):
//   {
//     firstName, lastName,
//     dateOfBirth: Firestore Timestamp,
//     gender, schoolType, school, grade,
//     parentName,
//     phone, emergencyContact,    // E.164 strings — split into dial+local internally
//     city, address, notes
//   }
//
// onSubmit contract:
//   Receives a buildFormData() result with shape:
//     {
//       firstName, lastName, dateOfBirth (Date),
//       gender, schoolType, school, grade,
//       parentName, phone (E.164), emergencyContact (E.164 or ""),
//       city, address, notes
//     }
//   Returns { ok: true } on success — caller is responsible for navigation.
//   Returns { ok: false, errorKey } on failure — this module shows a toast
//   from strings.errors[errorKey] || strings.errors.unexpected.

import { strings } from "../strings/en.js";
import { showToast } from "../ui/toast.js";
import { logError } from "../services/errors-service.js";
import { countries, getCountryByDialCode } from "../data/countries.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "../firebase-init.js";
import { TENANT_ID } from "../config.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants — must mirror exactly what register-view.js used pre-refactor.
// ─────────────────────────────────────────────────────────────────────────────

const NAME_MIN  = 1;
const NAME_MAX  = 40;
const PARENT_NAME_MAX = 60;
const SCHOOL_MAX = 80;
const GRADE_MAX = 40;
const CITY_MAX = 60;
const ADDRESS_MAX = 120;
const NOTES_MAX = 500;
const PHONE_MIN_DIGITS = 6;
const PHONE_MAX_DIGITS = 14;

const AGE_MIN_YEARS = 1;
const AGE_MAX_YEARS = 18;

// ─────────────────────────────────────────────────────────────────────────────
// Public render function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {HTMLElement} mount    Where to render the form.
 * @param {Object}      options  See file header for shape.
 * @returns {Function}           cleanup()
 */
export function renderKidForm(mount, options) {
  ensureFormStyles();

  const {
    mode,
    initialData,
    onSubmit,
    onCancel,
    onActivity,
    submitButtonLabel,
    submittingButtonLabel,
    cancelButtonLabel
  } = options;

  // Build initial form state (defaults for create; pre-filled for edit).
  const state = buildInitialState(mode, initialData);

  const suggestions = { schools: [], grades: [] };

  const countryOptions = countries.map(c =>
    `<option value="${escapeAttr(c.dialCode)}">${c.flag} ${escapeHtml(c.name)} (${escapeHtml(c.dialCode)})</option>`
  ).join("");

  mount.innerHTML = renderFormHTML({ state, countryOptions, submitButtonLabel, cancelButtonLabel });

  const els = cacheDomRefs(mount);

  // Set DOB input bounds for browser-level constraint.
  const dobBounds = computeDobBounds();
  els.dobInput.min = dobBounds.minISO;
  els.dobInput.max = dobBounds.maxISO;

  // Pre-fill non-text controls (radios, country selects). Text inputs read
  // their value from the rendered HTML's `value` attribute.
  applyInitialControlValues(els, state);

  // ── Async setup: tenant default country code + autocomplete data ──
  // Edit mode pre-fills the country from the existing phone, so we don't
  // overwrite that. Create mode wants the tenant default.
  if (mode === "create") {
    loadTenantDefaults().then(applyTenantDefaults).catch((err) => {
      logError({
        source: "frontend",
        page: pageName(mode),
        action: "loadTenantDefaults",
        error: err
      });
    });
  }

  loadSuggestions().then(applySuggestions).catch((err) => {
    logError({
      source: "frontend",
      page: pageName(mode),
      action: "loadSuggestions",
      error: err
    });
  });

  // ── Event handlers ──
  // withActivity wraps every input handler so the caller's onActivity
  // callback fires on real input events. Edit-view uses this to feed the
  // lock-session heartbeat.
  function withActivity(fn) {
    return (...args) => {
      if (typeof onActivity === "function") {
        try { onActivity(); } catch (e) { console.error("[kid-form] onActivity threw:", e); }
      }
      return fn(...args);
    };
  }

  function onTextInput(field, el) {
    return () => {
      state[field] = el.value;
      validateAndUpdate();
    };
  }

  const handlers = [
    [els.firstNameInput,    "input",  withActivity(onTextInput("firstName",  els.firstNameInput))],
    [els.lastNameInput,     "input",  withActivity(onTextInput("lastName",   els.lastNameInput))],
    [els.dobInput,          "input",  withActivity(() => { state.dateOfBirth = els.dobInput.value; validateAndUpdate(); })],
    [els.schoolInput,       "input",  withActivity(onTextInput("school",     els.schoolInput))],
    [els.gradeInput,        "input",  withActivity(onTextInput("grade",      els.gradeInput))],
    [els.parentNameInput,   "input",  withActivity(onTextInput("parentName", els.parentNameInput))],
    [els.phoneLocalInput,   "input",  withActivity(() => { state.phoneLocal = els.phoneLocalInput.value; validateAndUpdate(); })],
    [els.emergencyLocalInput, "input", withActivity(() => { state.emergencyLocal = els.emergencyLocalInput.value; validateAndUpdate(); })],
    [els.cityInput,         "input",  withActivity(onTextInput("city",       els.cityInput))],
    [els.addressInput,      "input",  withActivity(onTextInput("address",    els.addressInput))],
    [els.notesInput,        "input",  withActivity(onTextInput("notes",      els.notesInput))],
    [els.phoneCountrySel,   "change", withActivity(() => { state.phoneCountryDial = els.phoneCountrySel.value; })],
    [els.emergencyCountrySel, "change", withActivity(() => { state.emergencyCountryDial = els.emergencyCountrySel.value; })]
  ];

  els.genderRadios.forEach((radio) => {
    handlers.push([radio, "change", withActivity(() => {
      if (radio.checked) state.gender = radio.value;
      validateAndUpdate();
    })]);
  });

  els.schoolTypeRadios.forEach((radio) => {
    handlers.push([radio, "change", withActivity(() => {
      if (radio.checked) {
        state.schoolType = radio.value;
        applySchoolTypeUI();
        validateAndUpdate();
      }
    })]);
  });

  function handleCancel() {
    if (state.submitting) return;
    onCancel();
  }
  handlers.push([els.cancelBtn, "click", handleCancel]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (state.submitting) return;

    const result = validateAndUpdate();
    if (!result.valid) return;

    setSubmitting(true);
    try {
      const built = buildFormData(state);
      const res = await onSubmit(built);

      if (!res || !res.ok) {
        const key = (res && res.errorKey) || "unexpected";
        showToast(strings.errors[key] || strings.errors.unexpected, "error");
        setSubmitting(false);
        return;
      }
      // Success: caller handles navigation. Form stays in submitting state
      // until the view tears it down.
    } catch (err) {
      await logError({
        source: "frontend",
        page: pageName(mode),
        action: "handleSubmit",
        error: err
      });
      showToast(strings.errors.unexpected, "error");
      setSubmitting(false);
    }
  }
  handlers.push([els.form, "submit", handleSubmit]);

  // Attach all listeners.
  for (const [el, evt, fn] of handlers) el.addEventListener(evt, fn);

  // Initial passes.
  validateAndUpdate();
  applySchoolTypeUI();

  // Focus first field for fast operator entry. Skip in edit mode — fields
  // already have data and the user picks where to type.
  if (mode === "create") {
    els.firstNameInput.focus();
  }

  // ── Inner functions ──

  function applySuggestions(s) {
    suggestions.schools = s.schools;
    suggestions.grades  = s.grades;
    els.schoolList.innerHTML = s.schools.map((v) => `<option value="${escapeAttr(v)}"></option>`).join("");
    els.gradeList.innerHTML  = s.grades.map((v)  => `<option value="${escapeAttr(v)}"></option>`).join("");
  }

  function applyTenantDefaults(defaults) {
    if (!defaults) return;
    const country = getCountryByDialCode(defaults.dialCode);
    if (!country) return;
    state.phoneCountryDial = country.dialCode;
    state.emergencyCountryDial = country.dialCode;
    els.phoneCountrySel.value = country.dialCode;
    els.emergencyCountrySel.value = country.dialCode;
  }

  function applySchoolTypeUI() {
    if (state.schoolType === "local") {
      els.schoolReq.hidden = false;
      els.schoolInput.placeholder = strings.kids.register.schoolNameLocalPlaceholder;
      els.schoolHelp.textContent = strings.kids.register.schoolNameLocalHelp;
      els.schoolInput.setAttribute("list", "aq-kid-school-list");
    } else {
      els.schoolReq.hidden = true;
      els.schoolInput.placeholder = strings.kids.register.schoolNameOocPlaceholder;
      els.schoolHelp.textContent = strings.kids.register.schoolNameOocHelp;
      els.schoolInput.removeAttribute("list");
    }
  }

  function setSubmitting(flag) {
    state.submitting = flag;
    els.submitBtn.disabled = flag;
    els.submitBtn.textContent = flag ? submittingButtonLabel : submitButtonLabel;
    els.cancelBtn.disabled = flag;
  }

  function validateAndUpdate() {
    const errors = validateForm(state);
    paintErrors(errors, els);
    const valid = Object.keys(errors).length === 0;
    els.submitBtn.disabled = !valid || state.submitting;
    return { valid, errors };
  }

  return function cleanup() {
    for (const [el, evt, fn] of handlers) {
      try { el.removeEventListener(evt, fn); } catch (_) {}
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Initial state construction
// ─────────────────────────────────────────────────────────────────────────────

function buildInitialState(mode, initialData) {
  const empty = {
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",
    schoolType: "local",
    school: "",
    grade: "",
    parentName: "",
    phoneCountryDial: "+961",
    phoneLocal: "",
    emergencyCountryDial: "+961",
    emergencyLocal: "",
    city: "",
    address: "",
    notes: "",

    // UI-only flag
    submitting: false
  };

  if (mode !== "edit" || !initialData) return empty;

  // Edit mode: pre-fill from initialData. The view passes a kid-doc-shaped
  // object with E.164 phone strings, which we split into dial+local.
  const phoneSplit     = splitE164(initialData.phone || "");
  const emergencySplit = splitE164(initialData.emergencyContact || "");
  const dobISO         = initialData.dateOfBirth
    ? toISODate(initialData.dateOfBirth.toDate ? initialData.dateOfBirth.toDate() : initialData.dateOfBirth)
    : "";

  return {
    ...empty,
    firstName: initialData.firstName || "",
    lastName: initialData.lastName || "",
    dateOfBirth: dobISO,
    gender: initialData.gender || "",
    schoolType: initialData.schoolType || "local",
    school: initialData.school || "",
    grade: initialData.grade || "",
    parentName: initialData.parentName || "",
    phoneCountryDial: phoneSplit.dial || "+961",
    phoneLocal: phoneSplit.local || "",
    emergencyCountryDial: emergencySplit.dial || phoneSplit.dial || "+961",
    emergencyLocal: emergencySplit.local || "",
    city: initialData.city || "",
    address: initialData.address || "",
    notes: initialData.notes || ""
  };
}

function applyInitialControlValues(els, state) {
  // Radios and selects need explicit programmatic init (HTML `value` attr
  // on text inputs is enough, but radios/selects don't work that way).

  els.genderRadios.forEach((r) => {
    r.checked = (r.value === state.gender);
  });

  els.schoolTypeRadios.forEach((r) => {
    r.checked = (r.value === state.schoolType);
  });

  els.phoneCountrySel.value = state.phoneCountryDial;
  els.emergencyCountrySel.value = state.emergencyCountryDial;
  // Defensive fallback if a stored dial code isn't in our list.
  if (!els.phoneCountrySel.value) {
    els.phoneCountrySel.value = "+961";
    state.phoneCountryDial = "+961";
  }
  if (!els.emergencyCountrySel.value) {
    els.emergencyCountrySel.value = "+961";
    state.emergencyCountryDial = "+961";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Form HTML
// ─────────────────────────────────────────────────────────────────────────────

function renderFormHTML({ state, countryOptions, submitButtonLabel, cancelButtonLabel }) {
  return `
    <form class="aq-kid-form" id="aq-kid-form" novalidate>

      <fieldset class="aq-kid-form__section">
        <legend>${strings.kids.register.sectionChild}</legend>

        <div class="aq-kid-form__row aq-kid-form__row--2">
          ${textField("firstName", strings.kids.register.firstNameLabel, strings.kids.register.firstNamePlaceholder, true, NAME_MAX, state.firstName)}
          ${textField("lastName",  strings.kids.register.lastNameLabel,  strings.kids.register.lastNamePlaceholder,  true, NAME_MAX, state.lastName)}
        </div>

        <label class="aq-field">
          <span class="aq-field__label">${strings.kids.register.dobLabel} <span class="aq-field__req">*</span></span>
          <input type="date" id="aq-kid-dateOfBirth" class="aq-field__input" value="${escapeAttr(state.dateOfBirth)}" required />
          <span class="aq-field__help">${strings.kids.register.dobHelp}</span>
          <span class="aq-field__error" id="aq-kid-dateOfBirth-error" hidden></span>
        </label>

        <fieldset class="aq-field aq-kid-form__radio-group">
          <legend class="aq-field__label">${strings.kids.register.genderLabel} <span class="aq-field__req">*</span></legend>
          <label class="aq-kid-form__radio">
            <input type="radio" name="aq-kid-gender" value="Male" />
            <span>${strings.kids.register.genderMale}</span>
          </label>
          <label class="aq-kid-form__radio">
            <input type="radio" name="aq-kid-gender" value="Female" />
            <span>${strings.kids.register.genderFemale}</span>
          </label>
          <span class="aq-field__error" id="aq-kid-gender-error" hidden></span>
        </fieldset>
      </fieldset>

      <fieldset class="aq-kid-form__section">
        <legend>${strings.kids.register.sectionSchool}</legend>

        <fieldset class="aq-field aq-kid-form__radio-group">
          <legend class="aq-field__label">${strings.kids.register.schoolTypeLabel} <span class="aq-field__req">*</span></legend>
          <label class="aq-kid-form__radio">
            <input type="radio" name="aq-kid-schoolType" value="local" />
            <span>${strings.kids.register.schoolTypeLocal}</span>
          </label>
          <label class="aq-kid-form__radio">
            <input type="radio" name="aq-kid-schoolType" value="out_of_country" />
            <span>${strings.kids.register.schoolTypeOoc}</span>
          </label>
        </fieldset>

        <label class="aq-field">
          <span class="aq-field__label" id="aq-kid-school-label">
            ${strings.kids.register.schoolNameLabel} <span class="aq-field__req" id="aq-kid-school-req">*</span>
          </span>
          <input
            type="text"
            id="aq-kid-school"
            class="aq-field__input"
            list="aq-kid-school-list"
            maxlength="${SCHOOL_MAX}"
            value="${escapeAttr(state.school)}"
            placeholder="${escapeAttr(strings.kids.register.schoolNameLocalPlaceholder)}"
            autocomplete="off"
          />
          <datalist id="aq-kid-school-list"></datalist>
          <span class="aq-field__help" id="aq-kid-school-help">${strings.kids.register.schoolNameLocalHelp}</span>
          <span class="aq-field__error" id="aq-kid-school-error" hidden></span>
        </label>

        <label class="aq-field">
          <span class="aq-field__label">${strings.kids.register.gradeLabel} <span class="aq-field__req">*</span></span>
          <input
            type="text"
            id="aq-kid-grade"
            class="aq-field__input"
            list="aq-kid-grade-list"
            maxlength="${GRADE_MAX}"
            value="${escapeAttr(state.grade)}"
            placeholder="${escapeAttr(strings.kids.register.gradePlaceholder)}"
            autocomplete="off"
          />
          <datalist id="aq-kid-grade-list"></datalist>
          <span class="aq-field__help">${strings.kids.register.gradeHelp}</span>
          <span class="aq-field__error" id="aq-kid-grade-error" hidden></span>
        </label>
      </fieldset>

      <fieldset class="aq-kid-form__section">
        <legend>${strings.kids.register.sectionParent}</legend>

        ${textField("parentName", strings.kids.register.parentNameLabel, strings.kids.register.parentNamePlaceholder, true, PARENT_NAME_MAX, state.parentName)}

        <label class="aq-field">
          <span class="aq-field__label">${strings.kids.register.phoneLabel} <span class="aq-field__req">*</span></span>
          <div class="aq-kid-form__phone">
            <select id="aq-kid-phone-country" class="aq-field__input aq-field__select aq-kid-form__phone-country">
              ${countryOptions}
            </select>
            <input
              type="tel"
              id="aq-kid-phone-local"
              class="aq-field__input aq-kid-form__phone-local"
              value="${escapeAttr(state.phoneLocal)}"
              placeholder="${escapeAttr(strings.kids.register.phonePlaceholder)}"
              autocomplete="off"
              inputmode="tel"
            />
          </div>
          <span class="aq-field__help">${strings.kids.register.phoneHelp}</span>
          <span class="aq-field__error" id="aq-kid-phone-error" hidden></span>
        </label>

        <label class="aq-field">
          <span class="aq-field__label">${strings.kids.register.emergencyLabel}</span>
          <div class="aq-kid-form__phone">
            <select id="aq-kid-emergency-country" class="aq-field__input aq-field__select aq-kid-form__phone-country">
              ${countryOptions}
            </select>
            <input
              type="tel"
              id="aq-kid-emergency-local"
              class="aq-field__input aq-kid-form__phone-local"
              value="${escapeAttr(state.emergencyLocal)}"
              placeholder="${escapeAttr(strings.kids.register.emergencyPlaceholder)}"
              autocomplete="off"
              inputmode="tel"
            />
          </div>
          <span class="aq-field__help">${strings.kids.register.emergencyHelp}</span>
          <span class="aq-field__error" id="aq-kid-emergency-error" hidden></span>
        </label>
      </fieldset>

      <fieldset class="aq-kid-form__section">
        <legend>${strings.kids.register.sectionLocation}</legend>
        ${textField("city",    strings.kids.register.cityLabel,    strings.kids.register.cityPlaceholder,    true,  CITY_MAX,    state.city)}
        ${textField("address", strings.kids.register.addressLabel, strings.kids.register.addressPlaceholder, false, ADDRESS_MAX, state.address)}
      </fieldset>

      <fieldset class="aq-kid-form__section">
        <legend>${strings.kids.register.sectionNotes}</legend>
        <label class="aq-field">
          <span class="aq-field__label">${strings.kids.register.notesLabel}</span>
          <textarea
            id="aq-kid-notes"
            class="aq-field__input aq-kid-form__textarea"
            maxlength="${NOTES_MAX}"
            rows="4"
            placeholder="${escapeAttr(strings.kids.register.notesPlaceholder)}"
          >${escapeHtml(state.notes)}</textarea>
          <span class="aq-field__help">${strings.kids.register.notesHelp}</span>
          <span class="aq-field__error" id="aq-kid-notes-error" hidden></span>
        </label>
      </fieldset>

      <div class="aq-kid-form__actions">
        <button type="button" class="aq-button aq-button--ghost" id="aq-kid-cancel-bottom">
          ${cancelButtonLabel}
        </button>
        <button type="submit" class="aq-button aq-button--primary" id="aq-kid-submit">
          ${submitButtonLabel}
        </button>
      </div>
    </form>
  `;
}

function cacheDomRefs(mount) {
  return {
    form:                mount.querySelector("#aq-kid-form"),
    firstNameInput:      mount.querySelector("#aq-kid-firstName"),
    lastNameInput:       mount.querySelector("#aq-kid-lastName"),
    dobInput:            mount.querySelector("#aq-kid-dateOfBirth"),
    dobError:            mount.querySelector("#aq-kid-dateOfBirth-error"),
    genderRadios:        mount.querySelectorAll('input[name="aq-kid-gender"]'),
    genderError:         mount.querySelector("#aq-kid-gender-error"),
    schoolTypeRadios:    mount.querySelectorAll('input[name="aq-kid-schoolType"]'),
    schoolInput:         mount.querySelector("#aq-kid-school"),
    schoolList:          mount.querySelector("#aq-kid-school-list"),
    schoolReq:           mount.querySelector("#aq-kid-school-req"),
    schoolHelp:          mount.querySelector("#aq-kid-school-help"),
    schoolError:         mount.querySelector("#aq-kid-school-error"),
    gradeInput:          mount.querySelector("#aq-kid-grade"),
    gradeList:           mount.querySelector("#aq-kid-grade-list"),
    gradeError:          mount.querySelector("#aq-kid-grade-error"),
    parentNameInput:     mount.querySelector("#aq-kid-parentName"),
    phoneCountrySel:     mount.querySelector("#aq-kid-phone-country"),
    phoneLocalInput:     mount.querySelector("#aq-kid-phone-local"),
    phoneError:          mount.querySelector("#aq-kid-phone-error"),
    emergencyCountrySel: mount.querySelector("#aq-kid-emergency-country"),
    emergencyLocalInput: mount.querySelector("#aq-kid-emergency-local"),
    emergencyError:      mount.querySelector("#aq-kid-emergency-error"),
    cityInput:           mount.querySelector("#aq-kid-city"),
    addressInput:        mount.querySelector("#aq-kid-address"),
    notesInput:          mount.querySelector("#aq-kid-notes"),
    submitBtn:           mount.querySelector("#aq-kid-submit"),
    cancelBtn:           mount.querySelector("#aq-kid-cancel-bottom")
  };
}

function textField(name, label, placeholder, required, maxLen, value) {
  const id = `aq-kid-${name}`;
  const req = required ? '<span class="aq-field__req">*</span>' : "";
  const errId = `${id}-error`;
  return `
    <label class="aq-field">
      <span class="aq-field__label">${escapeHtml(label)} ${req}</span>
      <input
        type="text"
        id="${id}"
        class="aq-field__input"
        maxlength="${maxLen}"
        value="${escapeAttr(value || "")}"
        placeholder="${escapeAttr(placeholder)}"
        autocomplete="off"
      />
      <span class="aq-field__error" id="${errId}" hidden></span>
    </label>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateForm(state) {
  const e = {};

  const fn = state.firstName.trim();
  if (fn.length < NAME_MIN) e.firstName = "requiredField";
  else if (fn.length > NAME_MAX) e.firstName = "firstNameTooLong";

  const ln = state.lastName.trim();
  if (ln.length < NAME_MIN) e.lastName = "requiredField";
  else if (ln.length > NAME_MAX) e.lastName = "lastNameTooLong";

  if (!state.dateOfBirth) {
    e.dateOfBirth = "requiredField";
  } else {
    const d = parseDate(state.dateOfBirth);
    if (!d) e.dateOfBirth = "dobInvalid";
    else if (!isDobInRange(d)) e.dateOfBirth = "dobOutOfRange";
  }

  if (state.gender !== "Male" && state.gender !== "Female") {
    e.gender = "requiredField";
  }

  if (state.schoolType === "local") {
    const s = state.school.trim();
    if (s.length < 1) e.school = "schoolNameRequiredLocal";
    else if (s.length > SCHOOL_MAX) e.school = "schoolNameTooLong";
  } else {
    if (state.school.trim().length > SCHOOL_MAX) e.school = "schoolNameTooLong";
  }

  const grade = state.grade.trim();
  if (grade.length < 1) e.grade = "requiredField";
  else if (grade.length > GRADE_MAX) e.grade = "gradeTooLong";

  const pn = state.parentName.trim();
  if (pn.length < NAME_MIN) e.parentName = "requiredField";
  else if (pn.length > PARENT_NAME_MAX) e.parentName = "parentNameTooLong";

  const phoneDigits = stripPhoneDigits(state.phoneLocal);
  if (phoneDigits.length === 0) {
    e.phone = "requiredField";
  } else if (phoneDigits.length < PHONE_MIN_DIGITS || phoneDigits.length > PHONE_MAX_DIGITS) {
    e.phone = "phoneInvalid";
  }

  const emergencyDigits = stripPhoneDigits(state.emergencyLocal);
  if (emergencyDigits.length > 0 &&
      (emergencyDigits.length < PHONE_MIN_DIGITS || emergencyDigits.length > PHONE_MAX_DIGITS)) {
    e.emergency = "emergencyInvalid";
  }

  const city = state.city.trim();
  if (city.length < 1) e.city = "requiredField";
  else if (city.length > CITY_MAX) e.city = "cityTooLong";

  if (state.address.trim().length > ADDRESS_MAX) e.address = "addressTooLong";
  if (state.notes.trim().length > NOTES_MAX) e.notes = "notesTooLong";

  return e;
}

function paintErrors(errors, els) {
  setError(els.dobError,       errors.dateOfBirth);
  setError(els.genderError,    errors.gender);
  setError(els.schoolError,    errors.school);
  setError(els.gradeError,     errors.grade);
  setError(els.phoneError,     errors.phone);
  setError(els.emergencyError, errors.emergency);

  toggleInvalid(els.firstNameInput,  errors.firstName);
  toggleInvalid(els.lastNameInput,   errors.lastName);
  toggleInvalid(els.parentNameInput, errors.parentName);
  toggleInvalid(els.cityInput,       errors.city);
  toggleInvalid(els.addressInput,    errors.address);
  toggleInvalid(els.notesInput,      errors.notes);
}

function setError(el, key) {
  if (!el) return;
  if (key) {
    el.textContent = strings.kids.register[key] || strings.errors[key] || "";
    el.hidden = false;
  } else {
    el.textContent = "";
    el.hidden = true;
  }
}

function toggleInvalid(el, hasError) {
  if (!el) return;
  if (hasError) el.classList.add("aq-field__input--invalid");
  else el.classList.remove("aq-field__input--invalid");
}

// ─────────────────────────────────────────────────────────────────────────────
// Build formData out of state
// ─────────────────────────────────────────────────────────────────────────────

function buildFormData(state) {
  const dob = parseDate(state.dateOfBirth);
  const phone = state.phoneCountryDial + stripPhoneDigits(state.phoneLocal);
  const emergencyDigits = stripPhoneDigits(state.emergencyLocal);
  const emergency = emergencyDigits.length > 0
    ? state.emergencyCountryDial + emergencyDigits
    : "";

  return {
    firstName: state.firstName.trim(),
    lastName:  state.lastName.trim(),
    dateOfBirth: dob,
    gender: state.gender,
    schoolType: state.schoolType,
    school: state.school.trim(),
    grade: state.grade.trim(),
    parentName: state.parentName.trim(),
    phone,
    emergencyContact: emergency,
    city: state.city.trim(),
    address: state.address.trim(),
    notes: state.notes.trim()
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Async data
// ─────────────────────────────────────────────────────────────────────────────

async function loadTenantDefaults() {
  const ref = doc(db, "tenants", TENANT_ID, "settings", "countryCode");
  const snap = await getDoc(ref);
  if (snap.exists() && typeof snap.data().value === "string") {
    return { dialCode: snap.data().value };
  }
  return null;
}

async function loadSuggestions() {
  const q = query(
    collection(db, "tenants", TENANT_ID, "kids"),
    where("Deleted", "==", false),
    limit(200)
  );
  const snap = await getDocs(q);
  const schools = new Set();
  const grades = new Set();
  snap.forEach((d) => {
    const data = d.data();
    if (data.School && data.SchoolType !== "out_of_country") schools.add(data.School);
    if (data.Grade) grades.add(data.Grade);
  });
  return {
    schools: Array.from(schools).sort(),
    grades:  Array.from(grades).sort()
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function pageName(mode) {
  return mode === "edit" ? "kids/edit" : "kids/new";
}

function stripPhoneDigits(input) {
  if (!input) return "";
  let digits = String(input).replace(/\D+/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

function parseDate(yyyy_mm_dd) {
  if (!yyyy_mm_dd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyy_mm_dd)) return null;
  const [y, m, d] = yyyy_mm_dd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(dt.getTime())) return null;
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function computeDobBounds() {
  const today = new Date();
  const min = new Date(today); min.setFullYear(today.getFullYear() - AGE_MAX_YEARS);
  const max = new Date(today); max.setFullYear(today.getFullYear() - AGE_MIN_YEARS);
  return {
    minISO: toISODate(min),
    maxISO: toISODate(max)
  };
}

function isDobInRange(date) {
  const today = new Date();
  const min = new Date(today); min.setFullYear(today.getFullYear() - AGE_MAX_YEARS);
  const max = new Date(today); max.setFullYear(today.getFullYear() - AGE_MIN_YEARS);
  return date >= min && date <= max;
}

function toISODate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Split an E.164 phone string ("+96170123456") into its dial code and
 * local digits. Falls back to ("", whole-number-without-plus) if no
 * known country dial code matches the prefix.
 */
function splitE164(phone) {
  if (!phone || typeof phone !== "string") return { dial: "", local: "" };
  if (!phone.startsWith("+")) return { dial: "", local: phone };
  // Try longest match first — some dial codes are prefixes of others.
  const sorted = [...countries].sort((a, b) => b.dialCode.length - a.dialCode.length);
  for (const c of sorted) {
    if (phone.startsWith(c.dialCode)) {
      return { dial: c.dialCode, local: phone.slice(c.dialCode.length) };
    }
  }
  return { dial: "", local: phone };
}

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
//
// Owns the styles for the inner form (.aq-kid-form*). Page chrome
// (.aq-page, .aq-page__header) lives in register-view's style block —
// see §39.8. Profile-view, edit-view, and this module piggy-back on
// those page-chrome styles.
// ─────────────────────────────────────────────────────────────────────────────

let formStylesInjected = false;
function ensureFormStyles() {
  if (formStylesInjected) return;
  formStylesInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    .aq-kid-form {
      width: 100%;
      max-width: 640px;
      background: var(--card, #ffffff);
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 14px;
      padding: 28px;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .aq-kid-form__section {
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 10px;
      padding: 16px;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .aq-kid-form__section legend {
      padding: 0 6px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 600;
      color: var(--ink-2, #334155);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .aq-kid-form__row {
      display: grid;
      gap: 14px;
    }
    .aq-kid-form__row--2 {
      grid-template-columns: 1fr 1fr;
    }
    @media (max-width: 540px) {
      .aq-kid-form__row--2 { grid-template-columns: 1fr; }
    }

    .aq-kid-form__radio-group {
      border: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .aq-kid-form__radio-group .aq-field__label {
      padding: 0;
    }
    .aq-kid-form__radio {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      color: var(--ink-2, #334155);
      margin-right: 16px;
    }

    .aq-field__req {
      color: var(--danger, #ef4444);
      margin-left: 2px;
    }

    .aq-field__help {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      color: var(--mute, #64748b);
      line-height: 1.4;
    }
    .aq-field__error {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      color: var(--danger, #ef4444);
      margin-top: 2px;
    }
    .aq-field__input--invalid {
      border-color: var(--danger, #ef4444);
    }

    .aq-kid-form__phone {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 8px;
    }
    @media (max-width: 540px) {
      .aq-kid-form__phone { grid-template-columns: 1fr; }
    }

    .aq-kid-form__textarea {
      resize: vertical;
      min-height: 80px;
      font-family: 'DM Sans', system-ui, sans-serif;
    }

    .aq-kid-form__actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 8px;
    }
  `;
  document.head.appendChild(style);
}