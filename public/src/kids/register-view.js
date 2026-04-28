// public/src/kids/register-view.js
//
// Kid registration form. Single screen, all 12 fields per the v1 design.
// Renders into a container, validates as the user types, calls kids-service
// on submit, navigates to the new kid's profile on success.
//
// Public API:
//   renderRegisterKidView(container, profile, deps)
//     - container: DOM element to render into
//     - profile:   signed-in user profile (uid, role, etc.)
//     - deps:      { onCancel(), onRegistered(kidId) } navigation hooks
//   Returns a cleanup function.

import { strings } from "../strings/en.js";
import { showToast } from "../ui/toast.js";
import { logError } from "../services/errors-service.js";
import { createKid } from "./kids-service.js";
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
// Constants
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
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

// Age sanity bounds (per the design — not business rules).
const AGE_MIN_YEARS = 1;
const AGE_MAX_YEARS = 18;

// ─────────────────────────────────────────────────────────────────────────────
// Public render function
// ─────────────────────────────────────────────────────────────────────────────

export function renderRegisterKidView(container, profile, deps) {
  ensureStyles();

  // Mutable form state. Updated on every input event.
  const state = {
    photoFile: null,
    firstName: "",
    lastName: "",
    dateOfBirth: "",     // string YYYY-MM-DD from <input type="date">
    gender: "",
    schoolType: "local",
    school: "",
    grade: "",
    parentName: "",
    phoneCountryDial: "+961",         // overwritten from tenant setting on mount
    phoneLocal: "",
    emergencyCountryDial: "+961",     // overwritten from tenant setting on mount
    emergencyLocal: "",
    city: "",
    address: "",
    notes: "",

    // UI-only flags
    submitting: false,
    photoProcessing: false
  };

  // Suggestions for school + grade autocomplete (populated async).
  const suggestions = { schools: [], grades: [] };

  // Build the country dropdown HTML once. Reused for both phone and emergency.
  const countryOptions = countries.map(c => {
    return `<option value="${escapeAttr(c.dialCode)}">${c.flag} ${escapeHtml(c.name)} (${escapeHtml(c.dialCode)})</option>`;
  }).join("");

  container.innerHTML = `
    <div class="aq-page">
      <header class="aq-page__header">
        <h1 class="aq-page__title">${strings.kids.register.pageTitle}</h1>
        <button type="button" class="aq-button aq-button--ghost" id="aq-kid-cancel">
          ${strings.kids.register.cancelButton}
        </button>
      </header>

      <main class="aq-page__main">
        <form class="aq-kid-form" id="aq-kid-form" novalidate>
          <p class="aq-kid-form__subtitle">${strings.kids.register.pageSubtitle}</p>

          <!-- Photo -->
          <div class="aq-kid-form__photo">
            <div class="aq-kid-form__photo-preview" id="aq-kid-photo-preview" aria-hidden="true">
              <span class="aq-kid-form__photo-placeholder">📷</span>
            </div>
            <div class="aq-kid-form__photo-controls">
              <span class="aq-field__label">${strings.kids.register.photoLabel}</span>
              <div class="aq-kid-form__photo-buttons">
                <label class="aq-button aq-button--ghost aq-kid-form__file-button">
                  ${strings.kids.register.photoPick}
                  <input type="file" id="aq-kid-photo-input" accept="image/*" hidden />
                </label>
                <label class="aq-button aq-button--ghost aq-kid-form__file-button">
                  ${strings.kids.register.photoTake}
                  <input type="file" id="aq-kid-photo-camera" accept="image/*" capture="environment" hidden />
                </label>
                <button type="button" class="aq-button aq-button--ghost" id="aq-kid-photo-remove" hidden>
                  ${strings.kids.register.photoRemove}
                </button>
              </div>
              <span class="aq-field__help">${strings.kids.register.photoHelp}</span>
              <span class="aq-field__error" id="aq-kid-photo-error" hidden></span>
            </div>
          </div>

          <!-- Child section -->
          <fieldset class="aq-kid-form__section">
            <legend>${strings.kids.register.sectionChild}</legend>

            <div class="aq-kid-form__row aq-kid-form__row--2">
              ${textField("firstName", strings.kids.register.firstNameLabel, strings.kids.register.firstNamePlaceholder, true, NAME_MAX)}
              ${textField("lastName",  strings.kids.register.lastNameLabel,  strings.kids.register.lastNamePlaceholder,  true, NAME_MAX)}
            </div>

            <label class="aq-field">
              <span class="aq-field__label">${strings.kids.register.dobLabel} <span class="aq-field__req">*</span></span>
              <input type="date" id="aq-kid-dateOfBirth" class="aq-field__input" required />
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

          <!-- School section -->
          <fieldset class="aq-kid-form__section">
            <legend>${strings.kids.register.sectionSchool}</legend>

            <fieldset class="aq-field aq-kid-form__radio-group">
              <legend class="aq-field__label">${strings.kids.register.schoolTypeLabel} <span class="aq-field__req">*</span></legend>
              <label class="aq-kid-form__radio">
                <input type="radio" name="aq-kid-schoolType" value="local" checked />
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
                placeholder="${escapeAttr(strings.kids.register.gradePlaceholder)}"
                autocomplete="off"
              />
              <datalist id="aq-kid-grade-list"></datalist>
              <span class="aq-field__help">${strings.kids.register.gradeHelp}</span>
              <span class="aq-field__error" id="aq-kid-grade-error" hidden></span>
            </label>
          </fieldset>

          <!-- Parent section -->
          <fieldset class="aq-kid-form__section">
            <legend>${strings.kids.register.sectionParent}</legend>

            ${textField("parentName", strings.kids.register.parentNameLabel, strings.kids.register.parentNamePlaceholder, true, PARENT_NAME_MAX)}

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
                  placeholder="${escapeAttr(strings.kids.register.emergencyPlaceholder)}"
                  autocomplete="off"
                  inputmode="tel"
                />
              </div>
              <span class="aq-field__help">${strings.kids.register.emergencyHelp}</span>
              <span class="aq-field__error" id="aq-kid-emergency-error" hidden></span>
            </label>
          </fieldset>

          <!-- Location section -->
          <fieldset class="aq-kid-form__section">
            <legend>${strings.kids.register.sectionLocation}</legend>
            ${textField("city",    strings.kids.register.cityLabel,    strings.kids.register.cityPlaceholder,    true,  CITY_MAX)}
            ${textField("address", strings.kids.register.addressLabel, strings.kids.register.addressPlaceholder, false, ADDRESS_MAX)}
          </fieldset>

          <!-- Notes section -->
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
              ></textarea>
              <span class="aq-field__help">${strings.kids.register.notesHelp}</span>
              <span class="aq-field__error" id="aq-kid-notes-error" hidden></span>
            </label>
          </fieldset>

          <div class="aq-kid-form__actions">
            <button type="button" class="aq-button aq-button--ghost" id="aq-kid-cancel-2">
              ${strings.kids.register.cancelButton}
            </button>
            <button type="submit" class="aq-button aq-button--primary" id="aq-kid-submit">
              ${strings.kids.register.submitButton}
            </button>
          </div>
        </form>
      </main>
    </div>
  `;

  // ── Cache DOM refs ──
  const form              = container.querySelector("#aq-kid-form");
  const photoPreview      = container.querySelector("#aq-kid-photo-preview");
  const photoInput        = container.querySelector("#aq-kid-photo-input");
  const photoCamera       = container.querySelector("#aq-kid-photo-camera");
  const photoRemoveBtn    = container.querySelector("#aq-kid-photo-remove");
  const photoError        = container.querySelector("#aq-kid-photo-error");
  const firstNameInput    = container.querySelector("#aq-kid-firstName");
  const lastNameInput     = container.querySelector("#aq-kid-lastName");
  const dobInput          = container.querySelector("#aq-kid-dateOfBirth");
  const dobError          = container.querySelector("#aq-kid-dateOfBirth-error");
  const genderRadios      = container.querySelectorAll('input[name="aq-kid-gender"]');
  const genderError       = container.querySelector("#aq-kid-gender-error");
  const schoolTypeRadios  = container.querySelectorAll('input[name="aq-kid-schoolType"]');
  const schoolInput       = container.querySelector("#aq-kid-school");
  const schoolList        = container.querySelector("#aq-kid-school-list");
  const schoolReq         = container.querySelector("#aq-kid-school-req");
  const schoolHelp        = container.querySelector("#aq-kid-school-help");
  const schoolError       = container.querySelector("#aq-kid-school-error");
  const gradeInput        = container.querySelector("#aq-kid-grade");
  const gradeList         = container.querySelector("#aq-kid-grade-list");
  const gradeError        = container.querySelector("#aq-kid-grade-error");
  const parentNameInput   = container.querySelector("#aq-kid-parentName");
  const phoneCountrySel   = container.querySelector("#aq-kid-phone-country");
  const phoneLocalInput   = container.querySelector("#aq-kid-phone-local");
  const phoneError        = container.querySelector("#aq-kid-phone-error");
  const emergencyCountrySel = container.querySelector("#aq-kid-emergency-country");
  const emergencyLocalInput = container.querySelector("#aq-kid-emergency-local");
  const emergencyError    = container.querySelector("#aq-kid-emergency-error");
  const cityInput         = container.querySelector("#aq-kid-city");
  const addressInput      = container.querySelector("#aq-kid-address");
  const notesInput        = container.querySelector("#aq-kid-notes");
  const submitBtn         = container.querySelector("#aq-kid-submit");
  const cancelBtn         = container.querySelector("#aq-kid-cancel");
  const cancelBtn2        = container.querySelector("#aq-kid-cancel-2");

  // Set DOB input bounds for browser-level constraint.
  const dobBounds = computeDobBounds();
  dobInput.min = dobBounds.minISO;
  dobInput.max = dobBounds.maxISO;

  // ── Async setup: tenant default country code + autocomplete data ──
  loadTenantDefaults().then(applyTenantDefaults).catch((err) => {
    logError({
      source: "frontend",
      page: "kids/new",
      action: "loadTenantDefaults",
      error: err
    });
    // Fall back to the hardcoded "+961" defaults already in state. Form still works.
  });

  loadSuggestions().then(applySuggestions).catch((err) => {
    logError({
      source: "frontend",
      page: "kids/new",
      action: "loadSuggestions",
      error: err
    });
    // Form still works without autocomplete.
  });

  // ── Event handlers ──
  function onTextInput(field, el) {
    return () => {
      state[field] = el.value;
      validateAndUpdate();
    };
  }

  const handlers = [
    [firstNameInput,   "input",  onTextInput("firstName",  firstNameInput)],
    [lastNameInput,    "input",  onTextInput("lastName",   lastNameInput)],
    [dobInput,         "input",  () => { state.dateOfBirth = dobInput.value; validateAndUpdate(); }],
    [schoolInput,      "input",  onTextInput("school",     schoolInput)],
    [gradeInput,       "input",  onTextInput("grade",      gradeInput)],
    [parentNameInput,  "input",  onTextInput("parentName", parentNameInput)],
    [phoneLocalInput,  "input",  () => { state.phoneLocal = phoneLocalInput.value; validateAndUpdate(); }],
    [emergencyLocalInput, "input", () => { state.emergencyLocal = emergencyLocalInput.value; validateAndUpdate(); }],
    [cityInput,        "input",  onTextInput("city",       cityInput)],
    [addressInput,     "input",  onTextInput("address",    addressInput)],
    [notesInput,       "input",  onTextInput("notes",      notesInput)],
    [phoneCountrySel,  "change", () => { state.phoneCountryDial = phoneCountrySel.value; }],
    [emergencyCountrySel, "change", () => { state.emergencyCountryDial = emergencyCountrySel.value; }]
  ];

  genderRadios.forEach((radio) => {
    handlers.push([radio, "change", () => {
      if (radio.checked) state.gender = radio.value;
      validateAndUpdate();
    }]);
  });

  schoolTypeRadios.forEach((radio) => {
    handlers.push([radio, "change", () => {
      if (radio.checked) {
        state.schoolType = radio.value;
        applySchoolTypeUI();
        validateAndUpdate();
      }
    }]);
  });

  function handlePhotoChange(input) {
    return () => {
      const file = input.files && input.files[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        showPhotoError(strings.kids.register.photoNotImage);
        input.value = "";
        return;
      }
      if (file.size > PHOTO_MAX_BYTES) {
        showPhotoError(strings.kids.register.photoTooLarge);
        input.value = "";
        return;
      }
      hidePhotoError();
      state.photoFile = file;
      previewPhoto(file);
      photoRemoveBtn.hidden = false;
    };
  }

  handlers.push([photoInput,  "change", handlePhotoChange(photoInput)]);
  handlers.push([photoCamera, "change", handlePhotoChange(photoCamera)]);

  function handlePhotoRemove() {
    state.photoFile = null;
    photoInput.value = "";
    photoCamera.value = "";
    photoPreview.innerHTML = `<span class="aq-kid-form__photo-placeholder">📷</span>`;
    photoRemoveBtn.hidden = true;
    hidePhotoError();
  }
  handlers.push([photoRemoveBtn, "click", handlePhotoRemove]);

  function handleCancel() {
    if (state.submitting) return;
    deps.onCancel();
  }
  handlers.push([cancelBtn,  "click", handleCancel]);
  handlers.push([cancelBtn2, "click", handleCancel]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (state.submitting) return;

    // Final validation before submit. validateAndUpdate handles UI + returns the result.
    const result = validateAndUpdate();
    if (!result.valid) return;

    setSubmitting(true);
    try {
      const built = buildFormData(state);
      const res = await createKid(built, profile);

      if (!res.ok) {
        showToast(strings.errors[res.errorKey] || strings.errors.unexpected, "error");
        setSubmitting(false);
        return;
      }

      if (res.photoUploadFailed) {
        showToast(strings.errors.photoUploadPartial, "warning");
      } else {
        const name = built.firstName + " " + built.lastName;
        showToast(strings.toast.kidRegistered.replace("{name}", name.trim()), "success");
      }

      // Hand off to the shell, which will route to the new profile.
      deps.onRegistered(res.kidId);
    } catch (err) {
      await logError({
        source: "frontend",
        page: "kids/new",
        action: "handleSubmit",
        error: err
      });
      showToast(strings.errors.unexpected, "error");
      setSubmitting(false);
    }
  }
  handlers.push([form, "submit", handleSubmit]);

  // Attach all listeners.
  for (const [el, evt, fn] of handlers) el.addEventListener(evt, fn);

  // Initial validation pass — disables Submit until required fields filled.
  validateAndUpdate();

  // First render shows local-school UI.
  applySchoolTypeUI();

  // Focus first field for fast operator entry.
  firstNameInput.focus();

  // ─────────────────────────────────────────────────────────────────────────
  // Inner functions
  // ─────────────────────────────────────────────────────────────────────────

  async function loadTenantDefaults() {
    const ref = doc(db, "tenants", TENANT_ID, "settings", "countryCode");
    const snap = await getDoc(ref);
    if (snap.exists() && typeof snap.data().value === "string") {
      return { dialCode: snap.data().value };
    }
    return null;
  }

  function applyTenantDefaults(defaults) {
    if (!defaults) return;
    const country = getCountryByDialCode(defaults.dialCode);
    if (!country) return;
    state.phoneCountryDial = country.dialCode;
    state.emergencyCountryDial = country.dialCode;
    phoneCountrySel.value = country.dialCode;
    emergencyCountrySel.value = country.dialCode;
  }

  async function loadSuggestions() {
    // One-shot fetch of up to 200 active kids; build dedup'd lists of their
    // school names and grades. For Aquaria scale this is well under the
    // free-tier budget. When the kids list grows large we'll cache in a
    // separate aggregate doc.
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

  function applySuggestions(s) {
    suggestions.schools = s.schools;
    suggestions.grades  = s.grades;
    schoolList.innerHTML = s.schools.map((v) => `<option value="${escapeAttr(v)}"></option>`).join("");
    gradeList.innerHTML  = s.grades.map((v) =>  `<option value="${escapeAttr(v)}"></option>`).join("");
  }

  function applySchoolTypeUI() {
    if (state.schoolType === "local") {
      schoolReq.hidden = false;
      schoolInput.placeholder = strings.kids.register.schoolNameLocalPlaceholder;
      schoolHelp.textContent = strings.kids.register.schoolNameLocalHelp;
      schoolInput.setAttribute("list", "aq-kid-school-list");
    } else {
      schoolReq.hidden = true;
      schoolInput.placeholder = strings.kids.register.schoolNameOocPlaceholder;
      schoolHelp.textContent = strings.kids.register.schoolNameOocHelp;
      schoolInput.removeAttribute("list");  // suggestions are local-only
    }
  }

  function previewPhoto(file) {
    const url = URL.createObjectURL(file);
    photoPreview.innerHTML = `<img src="${url}" alt="" />`;
    // Revoke when the img loads (frees the blob URL once it's been decoded).
    const img = photoPreview.querySelector("img");
    if (img) img.onload = () => URL.revokeObjectURL(url);
  }

  function showPhotoError(msg) {
    photoError.textContent = msg;
    photoError.hidden = false;
  }
  function hidePhotoError() {
    photoError.textContent = "";
    photoError.hidden = true;
  }

  function setSubmitting(flag) {
    state.submitting = flag;
    submitBtn.disabled = flag;
    submitBtn.textContent = flag
      ? strings.kids.register.submittingButton
      : strings.kids.register.submitButton;
    cancelBtn.disabled  = flag;
    cancelBtn2.disabled = flag;
  }

  function validateAndUpdate() {
    const errors = validateForm(state);
    paintErrors(errors, {
      dobError, genderError, schoolError, gradeError,
      phoneError, emergencyError,
      firstNameInput, lastNameInput, parentNameInput, cityInput, addressInput, notesInput
    });
    const valid = Object.keys(errors).length === 0;
    submitBtn.disabled = !valid || state.submitting;
    return { valid, errors };
  }

  // ── Cleanup ──
  return function cleanup() {
    for (const [el, evt, fn] of handlers) el.removeEventListener(evt, fn);
  };
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
    if (!d) {
      e.dateOfBirth = "dobInvalid";
    } else if (!isDobInRange(d)) {
      e.dateOfBirth = "dobOutOfRange";
    }
  }

  if (state.gender !== "Male" && state.gender !== "Female") {
    e.gender = "requiredField";
  }

  // School: name required only when type is "local"
  if (state.schoolType === "local") {
    const s = state.school.trim();
    if (s.length < 1) e.school = "schoolNameRequiredLocal";
    else if (s.length > SCHOOL_MAX) e.school = "schoolNameTooLong";
  } else {
    // Out-of-country: name optional, but if present it must fit
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
  // Per-field error text
  setError(els.dobError,       errors.dateOfBirth);
  setError(els.genderError,    errors.gender);
  setError(els.schoolError,    errors.school);
  setError(els.gradeError,     errors.grade);
  setError(els.phoneError,     errors.phone);
  setError(els.emergencyError, errors.emergency);

  // Inline highlight on text inputs
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
// Build final formData for kids-service
// ─────────────────────────────────────────────────────────────────────────────

function buildFormData(state) {
  const dob = parseDate(state.dateOfBirth);
  const phone     = state.phoneCountryDial     + stripPhoneDigits(state.phoneLocal);
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
    notes: state.notes.trim(),
    photoFile: state.photoFile
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function stripPhoneDigits(input) {
  if (!input) return "";
  // Remove everything that isn't a digit. Strip a single leading zero
  // (E.164 phone prefixes don't include the local trunk zero).
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
  const min = new Date(today);
  min.setFullYear(today.getFullYear() - AGE_MAX_YEARS);
  const max = new Date(today);
  max.setFullYear(today.getFullYear() - AGE_MIN_YEARS);
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

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(str) { return escapeHtml(str); }

function textField(name, label, placeholder, required, maxLen) {
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
        placeholder="${escapeAttr(placeholder)}"
        autocomplete="off"
      />
      <span class="aq-field__error" id="${errId}" hidden></span>
    </label>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    .aq-page {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background: var(--bg, #f8fafc);
    }
    .aq-page__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 20px;
      background: var(--card, #ffffff);
      border-bottom: 1px solid var(--line, #e2e8f0);
    }
    .aq-page__title {
      margin: 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 20px;
      font-weight: 700;
      color: var(--ink, #0f172a);
      letter-spacing: -0.02em;
    }
    .aq-page__main {
      flex: 1;
      display: flex;
      justify-content: center;
      padding: 32px 20px;
    }

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
    .aq-kid-form__subtitle {
      margin: 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      color: var(--mute, #64748b);
      line-height: 1.5;
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
    .aq-field__error {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      color: var(--danger, #ef4444);
      margin-top: 2px;
    }
    .aq-field__input--invalid {
      border-color: var(--danger, #ef4444);
    }

    .aq-kid-form__photo {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }
    .aq-kid-form__photo-preview {
      width: 100px;
      height: 100px;
      border-radius: 12px;
      background: var(--bg, #f8fafc);
      border: 1px dashed var(--line, #e2e8f0);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
    }
    .aq-kid-form__photo-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .aq-kid-form__photo-placeholder {
      font-size: 28px;
      opacity: 0.5;
    }
    .aq-kid-form__photo-controls {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1;
    }
    .aq-kid-form__photo-buttons {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .aq-kid-form__file-button {
      cursor: pointer;
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