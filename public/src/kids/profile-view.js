// public/src/kids/profile-view.js
//
// Read-only kid profile page. Loads one kid by ID, renders all v1 fields.
// Includes nav back to the dashboard and a "Register another kid" button.
// Editing comes in a future session (will need edit locks per §13).
//
// Public API:
//   renderKidProfileView(container, kidId, deps)
//     - container: DOM element to render into
//     - kidId:     the kid document ID from the URL hash
//     - deps:      { onBack(), onRegisterAnother() } navigation hooks
//   Returns a cleanup function.

import { strings } from "../strings/en.js";
import { showToast } from "../ui/toast.js";
import { getKid } from "./kids-service.js";
import { getCountryByDialCode } from "../data/countries.js";

export function renderKidProfileView(container, kidId, deps) {
  ensureStyles();

  // Initial loading state.
  container.innerHTML = `
    <div class="aq-page">
      <header class="aq-page__header">
        <h1 class="aq-page__title">${strings.kids.profile.pageTitle}</h1>
        <button type="button" class="aq-button aq-button--ghost" id="aq-kid-profile-back">
          ${strings.kids.profile.backToDashboard}
        </button>
      </header>
      <main class="aq-page__main">
        <div class="aq-kid-profile" id="aq-kid-profile-body">
          <div class="aq-kid-profile__loading">
            <div class="aq-loading__pulse"></div>
          </div>
        </div>
      </main>
    </div>
  `;

  const backBtn = container.querySelector("#aq-kid-profile-back");
  const body    = container.querySelector("#aq-kid-profile-body");

  function handleBack() { deps.onBack(); }
  backBtn.addEventListener("click", handleBack);

  // Listeners attached after async load — captured here so cleanup detaches them.
  let registerAnotherBtn = null;
  function handleRegisterAnother() { deps.onRegisterAnother(); }

  // Load the kid.
  let cancelled = false;
  (async () => {
    const res = await getKid(kidId);
    if (cancelled) return;

    if (!res.ok) {
      if (res.errorKey === "kidNotFound") {
        renderNotFound(body);
      } else {
        showToast(strings.errors[res.errorKey] || strings.errors.unexpected, "error");
        renderNotFound(body);
      }
      return;
    }

    renderProfile(body, res.kid);
    registerAnotherBtn = body.querySelector("#aq-kid-register-another");
    if (registerAnotherBtn) {
      registerAnotherBtn.addEventListener("click", handleRegisterAnother);
    }
  })();

  return function cleanup() {
    cancelled = true;
    backBtn.removeEventListener("click", handleBack);
    if (registerAnotherBtn) {
      registerAnotherBtn.removeEventListener("click", handleRegisterAnother);
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderers
// ─────────────────────────────────────────────────────────────────────────────

function renderNotFound(body) {
  body.innerHTML = `
    <div class="aq-kid-profile__notfound">
      <h2 class="aq-card__title">${strings.kids.profile.notFoundTitle}</h2>
      <p class="aq-card__body">${strings.kids.profile.notFoundBody}</p>
    </div>
  `;
}

function renderProfile(body, kid) {
  const photoUrl  = kid.PhotoURL || "";
  const fullName  = kid.FullName || `${kid.FirstName || ""} ${kid.LastName || ""}`.trim();
  const dob       = formatDob(kid.DateOfBirth);
  const age       = formatAge(kid.DateOfBirth);
  const gender    = kid.Gender || strings.kids.profile.none;
  const schoolType = kid.SchoolType === "out_of_country"
    ? strings.kids.profile.schoolTypeOoc
    : strings.kids.profile.schoolTypeLocal;
  const school    = kid.School || strings.kids.profile.none;
  const grade     = kid.Grade || strings.kids.profile.none;
  const parent    = kid.ParentName || strings.kids.profile.none;
  const phone     = formatPhone(kid.Phone);
  const emergency = formatPhone(kid.EmergencyContact) || strings.kids.profile.none;
  const city      = kid.City || strings.kids.profile.none;
  const address   = kid.Address || strings.kids.profile.none;
  const notes     = kid.Notes || strings.kids.profile.none;
  const status    = kid.Status === "Blocked"
    ? strings.kids.profile.statusBlocked
    : strings.kids.profile.statusActive;
  const loyaltyLine = strings.kids.profile.loyaltyLine
    .replace("{points}", String(kid.LoyaltyPoints || 0))
    .replace("{level}", kid.LoyaltyLevel || "Bronze");
  const registered = formatTimestamp(kid.CreatedAt);

  const photoHtml = photoUrl
    ? `<img src="${escapeAttr(photoUrl)}" alt="" class="aq-kid-profile__photo-img" />`
    : `<div class="aq-kid-profile__photo-placeholder">👤</div>`;

  body.innerHTML = `
    <div class="aq-kid-profile__hero">
      <div class="aq-kid-profile__photo">${photoHtml}</div>
      <div class="aq-kid-profile__hero-text">
        <h2 class="aq-kid-profile__name">${escapeHtml(fullName)}</h2>
        <div class="aq-kid-profile__sub">
          <span class="aq-kid-profile__pill aq-kid-profile__pill--${kid.Gender === "Female" ? "f" : "m"}">${escapeHtml(gender)}</span>
          <span class="aq-kid-profile__sub-text">${escapeHtml(age)} · ${escapeHtml(dob)}</span>
        </div>
        <div class="aq-kid-profile__sub">
          <span class="aq-kid-profile__sub-text">${escapeHtml(loyaltyLine)} · ${escapeHtml(status)}</span>
        </div>
      </div>
    </div>

    ${section(strings.kids.profile.sectionSchool, [
      [strings.kids.profile.labelSchoolType, schoolType],
      [strings.kids.profile.labelSchool,     school],
      [strings.kids.profile.labelGrade,      grade]
    ])}

    ${section(strings.kids.profile.sectionParent, [
      [strings.kids.profile.labelParentName, parent],
      [strings.kids.profile.labelPhone,      phone],
      [strings.kids.profile.labelEmergency,  emergency]
    ])}

    ${section(strings.kids.profile.sectionLocation, [
      [strings.kids.profile.labelCity,    city],
      [strings.kids.profile.labelAddress, address]
    ])}

    ${section(strings.kids.profile.sectionNotes, [
      [strings.kids.profile.labelNotes,        notes],
      [strings.kids.profile.labelRegisteredOn, registered]
    ])}

    <div class="aq-kid-profile__actions">
      <button type="button" class="aq-button aq-button--primary" id="aq-kid-register-another">
        ${strings.kids.profile.registerAnother}
      </button>
    </div>
  `;
}

function section(title, rows) {
  const items = rows.map(([label, value]) => `
    <div class="aq-kid-profile__row">
      <div class="aq-kid-profile__label">${escapeHtml(label)}</div>
      <div class="aq-kid-profile__value">${escapeHtml(value || strings.kids.profile.none)}</div>
    </div>
  `).join("");
  return `
    <section class="aq-kid-profile__section">
      <h3 class="aq-kid-profile__section-title">${escapeHtml(title)}</h3>
      <div class="aq-kid-profile__rows">${items}</div>
    </section>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

function formatDob(ts) {
  const d = toDate(ts);
  if (!d) return strings.kids.profile.none;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatAge(ts) {
  const d = toDate(ts);
  if (!d) return "";
  const now = new Date();
  let years = now.getFullYear() - d.getUTCFullYear();
  const m = now.getMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getUTCDate())) years--;
  if (years <= 0) return "";
  if (years === 1) return strings.kids.profile.ageOneYear;
  return strings.kids.profile.ageYears.replace("{years}", String(years));
}

function formatTimestamp(ts) {
  const d = toDate(ts);
  if (!d) return strings.kids.profile.none;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatPhone(stored) {
  if (!stored) return "";
  // Try to split into "+CC local" by matching the longest dial code from the country list.
  const country = matchCountryDial(stored);
  if (!country) return stored;
  const local = stored.slice(country.dialCode.length);
  return `${country.dialCode} ${local}`;
}

function matchCountryDial(phone) {
  // Try progressively shorter prefixes (max 5 chars including the +).
  for (let len = 5; len >= 2; len--) {
    const prefix = phone.slice(0, len);
    const c = getCountryByDialCode(prefix);
    if (c) return c;
  }
  return null;
}

/**
 * Coerce Firestore Timestamp / Date / number / null to a JS Date or null.
 */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML escaping
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "<br>");
}
function escapeAttr(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
    .aq-kid-profile {
      width: 100%;
      max-width: 720px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .aq-kid-profile__loading {
      min-height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .aq-kid-profile__notfound {
      width: 100%;
      max-width: 480px;
      background: var(--card, #ffffff);
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 14px;
      padding: 28px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
    }

    .aq-kid-profile__hero {
      display: flex;
      gap: 18px;
      align-items: center;
      background: var(--card, #ffffff);
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 14px;
      padding: 20px;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
    }

    .aq-kid-profile__photo {
      width: 96px;
      height: 96px;
      border-radius: 50%;
      overflow: hidden;
      flex-shrink: 0;
      background: var(--bg, #f8fafc);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .aq-kid-profile__photo-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .aq-kid-profile__photo-placeholder {
      font-size: 36px;
      opacity: 0.5;
    }

    .aq-kid-profile__hero-text {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .aq-kid-profile__name {
      margin: 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 22px;
      font-weight: 700;
      color: var(--ink, #0f172a);
      letter-spacing: -0.01em;
    }
    .aq-kid-profile__sub {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .aq-kid-profile__sub-text {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      color: var(--mute, #64748b);
    }
    .aq-kid-profile__pill {
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      border-radius: 999px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      font-weight: 600;
      color: white;
    }
    .aq-kid-profile__pill--m { background: #3b82f6; }
    .aq-kid-profile__pill--f { background: #ec4899; }

    .aq-kid-profile__section {
      background: var(--card, #ffffff);
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 14px;
      padding: 18px 20px;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
    }
    .aq-kid-profile__section-title {
      margin: 0 0 12px 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 600;
      color: var(--ink-2, #334155);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .aq-kid-profile__rows {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .aq-kid-profile__row {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 12px;
      align-items: baseline;
    }
    @media (max-width: 540px) {
      .aq-kid-profile__row {
        grid-template-columns: 1fr;
        gap: 2px;
      }
    }
    .aq-kid-profile__label {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      color: var(--mute, #64748b);
    }
    .aq-kid-profile__value {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      color: var(--ink, #0f172a);
      line-height: 1.5;
      word-break: break-word;
    }

    .aq-kid-profile__actions {
      display: flex;
      justify-content: flex-end;
    }
  `;
  document.head.appendChild(style);
}