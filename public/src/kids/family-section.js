// public/src/kids/family-section.js
//
// Renders the "Family" section on a kid's profile page. This is a self-
// contained module so profile-view stays small: it just calls
// renderFamilySection(mount, kidId, profile).
//
// What this section shows:
//   - List of linked siblings (FullName + thumb + status pill).
//   - "Link sibling" button (any signed-in tenant member can link, per §39.14).
//   - "Unlink" button on each sibling row (Admin+ per §39.14).
//
// Behavior:
//   - Loads siblings on mount.
//   - Re-loads after every successful link/unlink.
//   - Clicking a sibling navigates to that sibling's profile (uses location.hash).
//
// Public API:
//   renderFamilySection(mount, kidId, profile) -> cleanup()

import { strings } from "../strings/en.js";
import { showToast } from "../ui/toast.js";
import {
  getSiblings,
  linkSibling,
  unlinkSibling
} from "./family-service.js";
import { confirm } from "../ui/confirm.js";
import { openLinkSiblingModal } from "./link-sibling-modal.js";
import { canEditKids } from "../auth/permissions.js";

export function renderFamilySection(mount, kidId, profile) {
  ensureStyles();

  // Wrapper that we'll re-fill on every render.
  const wrap = document.createElement("section");
  wrap.className = "aq-kid-profile__section aq-family";
  mount.appendChild(wrap);

  let cancelled = false;
  const handlers = [];   // [el, evt, fn] tuples for cleanup

  function attach(el, evt, fn) {
    el.addEventListener(evt, fn);
    handlers.push([el, evt, fn]);
  }
  function detachAll() {
    while (handlers.length) {
      const [el, evt, fn] = handlers.pop();
      try { el.removeEventListener(evt, fn); } catch (_) {}
    }
  }

  async function refresh() {
    if (cancelled) return;
    detachAll();
    wrap.innerHTML = `
      <h3 class="aq-kid-profile__section-title">${strings.kids.profile.familySectionTitle}</h3>
      <div class="aq-family__loading">${strings.kids.profile.familyLoading}</div>
    `;

    const res = await getSiblings(kidId);
    if (cancelled) return;
    if (!res.ok) {
      wrap.innerHTML = `
        <h3 class="aq-kid-profile__section-title">${strings.kids.profile.familySectionTitle}</h3>
        <div class="aq-family__empty">${strings.errors[res.errorKey] || strings.errors.unexpected}</div>
      `;
      return;
    }

    const siblings = res.siblings;
    const canUnlink = canEditKids(profile);   // Admin+ per §39.14

    const itemsHtml = siblings.length === 0
      ? `<div class="aq-family__empty">${strings.kids.profile.familyEmpty}</div>`
      : siblings.map((s) => `
        <div class="aq-family__row" data-kid-id="${escapeAttr(s.KidID)}">
          <button type="button" class="aq-family__row-main" data-action="open" data-kid-id="${escapeAttr(s.KidID)}">
            ${s.PhotoThumbnailURL
              ? `<img src="${escapeAttr(s.PhotoThumbnailURL)}" alt="" class="aq-family__thumb" />`
              : `<div class="aq-family__thumb aq-family__thumb--placeholder">👤</div>`}
            <div class="aq-family__row-text">
              <div class="aq-family__row-name">${escapeHtml(s.FullName)}</div>
              <div class="aq-family__row-status aq-family__row-status--${s.Status === "Blocked" ? "blocked" : "active"}">
                ${escapeHtml(s.Status === "Blocked" ? strings.kids.profile.statusBlocked : strings.kids.profile.statusActive)}
              </div>
            </div>
          </button>
          ${canUnlink
            ? `<button type="button" class="aq-button aq-button--ghost aq-family__unlink" data-action="unlink" data-kid-id="${escapeAttr(s.KidID)}">${strings.kids.profile.familyUnlinkButton}</button>`
            : ""}
        </div>
      `).join("");

    wrap.innerHTML = `
      <div class="aq-family__head">
        <h3 class="aq-kid-profile__section-title">${strings.kids.profile.familySectionTitle}</h3>
        <button type="button" class="aq-button aq-button--ghost" data-action="link">
          ${strings.kids.profile.familyLinkButton}
        </button>
      </div>
      <div class="aq-family__list">${itemsHtml}</div>
    `;

    // Wire handlers.
    const linkBtn = wrap.querySelector('[data-action="link"]');
    if (linkBtn) attach(linkBtn, "click", handleLinkClick);

    wrap.querySelectorAll('[data-action="open"]').forEach((btn) => {
      attach(btn, "click", () => {
        const sibId = btn.getAttribute("data-kid-id");
        if (sibId) window.location.hash = `#/kids/${encodeURIComponent(sibId)}`;
      });
    });

    wrap.querySelectorAll('[data-action="unlink"]').forEach((btn) => {
      attach(btn, "click", async (e) => {
        e.stopPropagation();
        const sibId = btn.getAttribute("data-kid-id");
        const sib = siblings.find((s) => s.KidID === sibId);
        if (!sib) return;
        await handleUnlinkClick(sib);
      });
    });
  }

  async function handleLinkClick() {
    const excludeIds = await collectExcludeIds();
    if (cancelled) return;
    const picked = await openLinkSiblingModal({ excludeIds, anchorKidId: kidId });
    if (cancelled) return;
    if (!picked) return;   // user cancelled

    const res = await linkSibling(kidId, picked.KidID, profile);
    if (cancelled) return;
    if (!res.ok) {
      const key = res.errorKey;
      const msg = strings.errors[key] || strings.errors.unexpected;
      showToast(msg, "error");
      return;
    }
    showToast(
      strings.toast.siblingLinked.replace("{name}", picked.FullName),
      "success"
    );
    refresh();
  }

  async function handleUnlinkClick(sibling) {
    const res = await confirm({
      title:        strings.kids.profile.confirmUnlinkTitle,
      body:         strings.kids.profile.confirmUnlinkBody.replace("{name}", sibling.FullName),
      confirmLabel: strings.kids.profile.confirmUnlinkConfirm,
      cancelLabel:  strings.kids.profile.confirmCancel,
      danger:       false
    });
    if (!res.confirmed) return;

    // Unlink the SIBLING (not the anchor kid), so the rest of the family
    // stays intact for the kid we're viewing. If unlinking would leave
    // the anchor as a family of one, the service auto-detaches them too.
    const result = await unlinkSibling(sibling.KidID, profile);
    if (cancelled) return;
    if (!result.ok) {
      showToast(strings.errors[result.errorKey] || strings.errors.unexpected, "error");
      return;
    }
    showToast(
      strings.toast.siblingUnlinked.replace("{name}", sibling.FullName),
      "success"
    );
    refresh();
  }

  // For the search picker: exclude self + already-linked siblings so they
  // don't show up as candidates.
  async function collectExcludeIds() {
    const sibsRes = await getSiblings(kidId);
    const sibs = sibsRes.ok ? sibsRes.siblings : [];
    return [kidId, ...sibs.map((s) => s.KidID)];
  }

  // Initial render.
  refresh();

  return function cleanup() {
    cancelled = true;
    detachAll();
    if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
  };
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
    .replace(/'/g, "&#39;");
}
function escapeAttr(str) { return escapeHtml(str); }

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    .aq-family__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }
    .aq-family__head .aq-kid-profile__section-title {
      margin: 0;
    }
    .aq-family__list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .aq-family__loading,
    .aq-family__empty {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      color: var(--mute, #64748b);
      padding: 6px 0;
    }
    .aq-family__row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px;
      border-radius: 10px;
      background: var(--bg, #f8fafc);
      border: 1px solid var(--line, #e2e8f0);
    }
    .aq-family__row-main {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 12px;
      background: transparent;
      border: none;
      padding: 4px;
      border-radius: 8px;
      cursor: pointer;
      text-align: left;
      font-family: 'DM Sans', system-ui, sans-serif;
      transition: background-color 120ms ease;
    }
    .aq-family__row-main:hover {
      background: rgba(14, 165, 233, 0.06);
    }
    .aq-family__thumb {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      background: var(--line, #e2e8f0);
    }
    .aq-family__thumb--placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      color: var(--mute, #64748b);
    }
    .aq-family__row-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .aq-family__row-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--ink, #0f172a);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .aq-family__row-status {
      font-family: 'DM Mono', ui-monospace, monospace;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .aq-family__row-status--active  { color: var(--success, #10b981); }
    .aq-family__row-status--blocked { color: var(--danger,  #ef4444); }

    .aq-family__unlink {
      flex-shrink: 0;
    }
  `;
  document.head.appendChild(style);
}