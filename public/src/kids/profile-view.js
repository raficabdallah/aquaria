// public/src/kids/profile-view.js
//
// Read-only kid profile page. Loads one kid by ID, renders all v1 fields,
// and surfaces destructive actions (Edit / Block / Unblock / Delete) gated
// by role per §39.13.
//
// Public API:
//   renderKidProfileView(container, kidId, profile, deps)
//     - container: DOM element to render into
//     - kidId:     the kid document ID from the URL hash
//     - profile:   signed-in user profile (used for role-based gates)
//     - deps:      { onBack(), onEdit(), onRegisterAnother() }
//   Returns a cleanup function.

import { strings } from "../strings/en.js";
import { showToast } from "../ui/toast.js";
import {
  getKid,
  blockKid,
  unblockKid,
  softDeleteKid
} from "./kids-service.js";
import {
  canEditKids,
  canBlockKids,
  canSoftDeleteKids
} from "../auth/permissions.js";
import { confirm } from "../ui/confirm.js";
import { onSnapshot, doc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "../firebase-init.js";
import { TENANT_ID } from "../config.js";

export function renderKidProfileView(container, kidId, profile, deps) {
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

  // Track all currently-attached action button handlers so cleanup can
  // detach them. They get re-attached on each renderProfile() call.
  let actionHandlers = [];
  let currentKid = null;
  let unsubscribeKid = null;
  let cancelled = false;

  function detachActionHandlers() {
    for (const [el, evt, fn] of actionHandlers) {
      try { el.removeEventListener(evt, fn); } catch (_) {}
    }
    actionHandlers = [];
  }

  // ── Subscribe to the kid doc so destructive actions taken elsewhere
  //    (or by us) reflect immediately on this page. ──
  function subscribeKid() {
    const kidRef = doc(db, "tenants", TENANT_ID, "kids", kidId);
    unsubscribeKid = onSnapshot(
      kidRef,
      (snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          renderNotFound();
          return;
        }
        const data = snap.data();
        if (data.Deleted === true) {
          // Profile shouldn't show deleted kids — bounce back. We can't
          // just call onBack here because that would happen on initial
          // snapshot when the doc legitimately is deleted (someone hit
          // restore from list view). Show a notFound state instead.
          renderNotFound();
          return;
        }
        currentKid = { KidID: snap.id, ...data };
        renderProfile(currentKid);
      },
      (err) => {
        if (cancelled) return;
        console.error("[profile-view] kid subscription error:", err);
        showToast(strings.errors.unexpected, "error");
      }
    );
  }

  // First-load fetch (separate from subscription so we can show the
  // notFound state before the listener has a chance to fire).
  (async () => {
    const res = await getKid(kidId);
    if (cancelled) return;
    if (!res.ok) {
      if (res.errorKey === "kidNotFound") renderNotFound();
      else {
        showToast(strings.errors[res.errorKey] || strings.errors.unexpected, "error");
        renderNotFound();
      }
      return;
    }
    currentKid = res.kid;
    renderProfile(currentKid);
    subscribeKid();
  })();

  // ── Renderers ──
  function renderNotFound() {
    detachActionHandlers();
    body.innerHTML = `
      <div class="aq-kid-profile__notfound">
        <h2 class="aq-card__title">${strings.kids.profile.notFoundTitle}</h2>
        <p class="aq-card__body">${strings.kids.profile.notFoundBody}</p>
      </div>
    `;
  }

  function renderProfile(kid) {
    detachActionHandlers();

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
    const isBlocked = kid.Status === "Blocked";
    const status    = isBlocked
      ? strings.kids.profile.statusBlocked
      : strings.kids.profile.statusActive;
    const loyaltyLine = strings.kids.profile.loyaltyLine
      .replace("{points}", String(kid.LoyaltyPoints || 0))
      .replace("{level}", kid.LoyaltyLevel || "Bronze");
    const registered = formatTimestamp(kid.CreatedAt);

    const photoHtml = photoUrl
      ? `<img src="${escapeAttr(photoUrl)}" alt="" class="aq-kid-profile__photo-img" />`
      : `<div class="aq-kid-profile__photo-placeholder">👤</div>`;

    // Destructive-action buttons. Gated by role.
    const showEdit  = canEditKids(profile);
    const showBlock = canBlockKids(profile);
    const showDel   = canSoftDeleteKids(profile);

    const actionsHtml = (showEdit || showBlock || showDel)
      ? `
        <div class="aq-kid-profile__action-bar">
          ${showEdit ? `<button type="button" class="aq-button aq-button--ghost" id="aq-kid-edit">${strings.kids.profile.editButton}</button>` : ""}
          ${showBlock ? (isBlocked
            ? `<button type="button" class="aq-button aq-button--ghost" id="aq-kid-unblock">${strings.kids.profile.unblockButton}</button>`
            : `<button type="button" class="aq-button aq-button--ghost" id="aq-kid-block">${strings.kids.profile.blockButton}</button>`
          ) : ""}
          ${showDel ? `<button type="button" class="aq-button aq-button--danger" id="aq-kid-delete">${strings.kids.profile.deleteButton}</button>` : ""}
        </div>
      `
      : "";

    // BlockHistory section. Hidden if empty.
    const blockHistoryHtml = renderBlockHistory(kid.BlockHistory);

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
            <span class="aq-kid-profile__sub-text">${escapeHtml(loyaltyLine)} · </span>
            <span class="aq-kid-profile__status aq-kid-profile__status--${isBlocked ? 'blocked' : 'active'}">${escapeHtml(status)}</span>
          </div>
        </div>
      </div>

      ${actionsHtml}

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

      ${blockHistoryHtml}

      <div class="aq-kid-profile__actions">
        <button type="button" class="aq-button aq-button--primary" id="aq-kid-register-another">
          ${strings.kids.profile.registerAnother}
        </button>
      </div>
    `;

    // Wire action handlers.
    const editBtn       = body.querySelector("#aq-kid-edit");
    const blockBtn      = body.querySelector("#aq-kid-block");
    const unblockBtn    = body.querySelector("#aq-kid-unblock");
    const deleteBtn     = body.querySelector("#aq-kid-delete");
    const registerBtn   = body.querySelector("#aq-kid-register-another");

    if (editBtn)     bind(editBtn,    "click", () => deps.onEdit());
    if (blockBtn)    bind(blockBtn,   "click", () => handleBlock(kid));
    if (unblockBtn)  bind(unblockBtn, "click", () => handleUnblock(kid));
    if (deleteBtn)   bind(deleteBtn,  "click", () => handleDelete(kid));
    if (registerBtn) bind(registerBtn,"click", () => deps.onRegisterAnother());
  }

  function bind(el, evt, fn) {
    el.addEventListener(evt, fn);
    actionHandlers.push([el, evt, fn]);
  }

  // ── Action handlers ──

  async function handleBlock(kid) {
    const res = await confirm({
      title:        strings.kids.profile.confirmBlockTitle,
      body:         strings.kids.profile.confirmBlockBody.replace("{name}", kid.FullName || ""),
      confirmLabel: strings.kids.profile.confirmBlockConfirm,
      cancelLabel:  strings.kids.profile.confirmCancel,
      danger:       true,
      reasonField: {
        label:         strings.kids.profile.blockReasonLabel,
        placeholder:   strings.kids.profile.blockReasonPlaceholder,
        required:      true,
        minLen:        1,
        maxLen:        500,
        errorRequired: strings.kids.profile.blockReasonRequired
      },
      permanentField: {
        label:    strings.kids.profile.permanentBlockLabel,
        helpText: strings.kids.profile.permanentBlockHelp
      }
    });
    if (!res.confirmed) return;

    const result = await blockKid(kidId, { reason: res.reason, permanent: res.permanent }, profile);
    if (!result.ok) {
      showToast(strings.errors[result.errorKey] || strings.errors.unexpected, "error");
      return;
    }
    showToast(strings.toast.kidBlocked.replace("{name}", kid.FullName || ""), "success");
    // Subscription will pick up the change and re-render.
  }

  async function handleUnblock(kid) {
    const res = await confirm({
      title:        strings.kids.profile.confirmUnblockTitle,
      body:         strings.kids.profile.confirmUnblockBody.replace("{name}", kid.FullName || ""),
      confirmLabel: strings.kids.profile.confirmUnblockConfirm,
      cancelLabel:  strings.kids.profile.confirmCancel,
      danger:       false
    });
    if (!res.confirmed) return;

    const result = await unblockKid(kidId, profile);
    if (!result.ok) {
      showToast(strings.errors[result.errorKey] || strings.errors.unexpected, "error");
      return;
    }
    showToast(strings.toast.kidUnblocked.replace("{name}", kid.FullName || ""), "success");
  }

  async function handleDelete(kid) {
    const res = await confirm({
      title:        strings.kids.profile.confirmDeleteTitle,
      body:         strings.kids.profile.confirmDeleteBody.replace("{name}", kid.FullName || ""),
      confirmLabel: strings.kids.profile.confirmDeleteConfirm,
      cancelLabel:  strings.kids.profile.confirmCancel,
      danger:       true
    });
    if (!res.confirmed) return;

    const result = await softDeleteKid(kidId, profile);
    if (!result.ok) {
      showToast(strings.errors[result.errorKey] || strings.errors.unexpected, "error");
      return;
    }
    showToast(strings.toast.kidDeleted.replace("{name}", kid.FullName || ""), "success");
    // Subscription will fire with Deleted=true; renderNotFound will run.
    // Nicer UX is to navigate away. Wait a beat so the toast is visible.
    setTimeout(() => { if (!cancelled) deps.onBack(); }, 600);
  }

  // ── Cleanup ──
  return function cleanup() {
    cancelled = true;
    backBtn.removeEventListener("click", handleBack);
    detachActionHandlers();
    if (unsubscribeKid) {
      try { unsubscribeKid(); } catch (_) {}
      unsubscribeKid = null;
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BlockHistory rendering
// ─────────────────────────────────────────────────────────────────────────────

function renderBlockHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return "";

  // Newest first.
  const sorted = [...history].sort((a, b) => {
    const ta = a.BlockedAt?.toMillis?.() || 0;
    const tb = b.BlockedAt?.toMillis?.() || 0;
    return tb - ta;
  });

  const items = sorted.map((entry) => {
    const blockedAt   = formatTimestamp(entry.BlockedAt);
    const reason      = entry.Reason || strings.kids.profile.none;
    const permanent   = entry.Permanent === true;
    const unblockedAt = entry.UnblockedAt ? formatTimestamp(entry.UnblockedAt) : null;
    const isCurrent   = !unblockedAt;

    const pill = isCurrent
      ? `<span class="aq-block-history__pill aq-block-history__pill--current">${strings.kids.profile.blockHistoryCurrent}</span>`
      : `<span class="aq-block-history__pill aq-block-history__pill--past">${strings.kids.profile.blockHistoryPast}</span>`;
    const permPill = permanent
      ? `<span class="aq-block-history__pill aq-block-history__pill--permanent">${strings.kids.profile.blockHistoryPermanent}</span>`
      : "";

    return `
      <div class="aq-block-history__entry">
        <div class="aq-block-history__head">
          <span class="aq-block-history__when">${escapeHtml(blockedAt)}</span>
          ${pill}
          ${permPill}
        </div>
        <div class="aq-block-history__reason">${escapeHtml(reason)}</div>
        ${unblockedAt
          ? `<div class="aq-block-history__resolved">${strings.kids.profile.blockHistoryResolvedOn.replace("{date}", escapeHtml(unblockedAt))}</div>`
          : ""}
      </div>
    `;
  }).join("");

  return `
    <section class="aq-kid-profile__section">
      <h3 class="aq-kid-profile__section-title">${strings.kids.profile.blockHistorySection}</h3>
      <div class="aq-block-history">${items}</div>
    </section>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section renderer (read-only key/value pairs)
// ─────────────────────────────────────────────────────────────────────────────

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
  return d.toISOString().slice(0, 10);
}

function formatAge(ts) {
  const d = toDate(ts);
  if (!d) return "";
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const mD = now.getMonth() - d.getMonth();
  if (mD < 0 || (mD === 0 && now.getDate() < d.getDate())) years--;
  if (years <= 0) return "";
  if (years === 1) return strings.kids.profile.ageOneYear;
  return strings.kids.profile.ageYears.replace("{years}", String(years));
}

function formatPhone(s) {
  if (!s) return "";
  // Trivial: leading + then digits. We display as-is (E.164).
  return s;
}

function formatTimestamp(ts) {
  const d = toDate(ts);
  if (!d) return "";
  // YYYY-MM-DD HH:MM
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${dd} ${hh}:${mm}`;
}

function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") {
    const d = ts.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  if (ts instanceof Date) {
    return isNaN(ts.getTime()) ? null : ts;
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
    }
    .aq-kid-profile__photo-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .aq-kid-profile__photo-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      opacity: 0.5;
    }
    .aq-kid-profile__hero-text {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .aq-kid-profile__name {
      margin: 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 22px;
      font-weight: 600;
      color: var(--ink, #0f172a);
    }
    .aq-kid-profile__sub {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .aq-kid-profile__sub-text {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      color: var(--mute, #64748b);
    }
    .aq-kid-profile__pill {
      padding: 2px 8px;
      border-radius: 999px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .aq-kid-profile__pill--m {
      background: rgba(14, 165, 233, 0.12);
      color: #0369a1;
    }
    .aq-kid-profile__pill--f {
      background: rgba(236, 72, 153, 0.12);
      color: #be185d;
    }
    .aq-kid-profile__status {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 600;
    }
    .aq-kid-profile__status--active  { color: var(--success, #10b981); }
    .aq-kid-profile__status--blocked { color: var(--danger, #ef4444); }

    .aq-kid-profile__action-bar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .aq-kid-profile__section {
      background: var(--card, #ffffff);
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 14px;
      padding: 16px 20px;
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
      gap: 8px;
    }
    .aq-kid-profile__row {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 12px;
      padding: 4px 0;
    }
    @media (max-width: 540px) {
      .aq-kid-profile__row { grid-template-columns: 1fr; gap: 2px; }
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
    }

    .aq-kid-profile__actions {
      display: flex;
      justify-content: center;
      padding: 8px 0;
    }

    .aq-block-history {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .aq-block-history__entry {
      padding: 12px;
      background: var(--bg, #f8fafc);
      border-radius: 10px;
      border: 1px solid var(--line, #e2e8f0);
    }
    .aq-block-history__head {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 6px;
    }
    .aq-block-history__when {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 500;
      color: var(--ink, #0f172a);
    }
    .aq-block-history__pill {
      padding: 2px 8px;
      border-radius: 999px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .aq-block-history__pill--current {
      background: rgba(239, 68, 68, 0.12);
      color: #b91c1c;
    }
    .aq-block-history__pill--past {
      background: rgba(100, 116, 139, 0.15);
      color: #475569;
    }
    .aq-block-history__pill--permanent {
      background: rgba(139, 92, 246, 0.15);
      color: #6d28d9;
    }
    .aq-block-history__reason {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      color: var(--ink-2, #334155);
      line-height: 1.4;
    }
    .aq-block-history__resolved {
      margin-top: 6px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      color: var(--mute, #64748b);
    }
  `;
  document.head.appendChild(style);
}