// public/src/kids/link-sibling-modal.js
//
// Modal that lets the user search for an existing kid by name and pick one
// to link as a sibling. Returns a Promise resolving to the picked kid
// (or null if cancelled).
//
// Public API:
//   openLinkSiblingModal({ excludeIds, anchorKidId }) → Promise<picked|null>
//
// Where `picked` is { KidID, FullName, PhotoThumbnailURL, FamilyID, Grade }
// from family-service.js's searchKidsByName().
//
// Behavior:
//   - On open: shows the 20 most-recent active kids (alphabetically by SearchKey).
//   - As the user types, the list refines via SearchKey prefix match.
//   - If the picked candidate already has a different FamilyID than the
//     anchor, we still allow the pick — the service will reject with
//     "siblingFamiliesConflict" and the caller will surface a toast. We
//     don't pre-block here because it requires another lookup; the service
//     is the source of truth.
//
// Keyboard:
//   - Esc closes (resolves null).
//   - Backdrop click closes.
//   - Click on a row picks that kid.

import { strings } from "../strings/en.js";
import { searchKidsByName } from "./family-service.js";

const SEARCH_DEBOUNCE_MS = 220;

let activeModal = null;

export function openLinkSiblingModal({ excludeIds, anchorKidId }) {
  if (activeModal) {
    // Dismiss whatever was open as cancelled.
    activeModal.dismiss(null);
    activeModal = null;
  }

  ensureStyles();

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "aq-linksib__overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="aq-linksib__card">
        <div class="aq-linksib__head">
          <h3 class="aq-linksib__title">${strings.kids.profile.linkModalTitle}</h3>
          <button type="button" class="aq-linksib__close" aria-label="${strings.kids.profile.linkModalCancel}">×</button>
        </div>
        <p class="aq-linksib__body">${strings.kids.profile.linkModalBody}</p>
        <input
          type="text"
          class="aq-linksib__search"
          placeholder="${escapeAttr(strings.kids.profile.linkModalSearchPlaceholder)}"
          autocomplete="off"
        />
        <div class="aq-linksib__results" id="aq-linksib-results">
          <div class="aq-linksib__loading">${strings.kids.profile.linkModalLoading}</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const searchInput = overlay.querySelector(".aq-linksib__search");
    const closeBtn    = overlay.querySelector(".aq-linksib__close");
    const resultsEl   = overlay.querySelector("#aq-linksib-results");

    let searchTimer = null;
    let lastQueryToken = 0;

    function dismiss(value) {
      if (!overlay.parentNode) return;
      overlay.remove();
      document.removeEventListener("keydown", handleKeydown);
      activeModal = null;
      resolve(value);
    }

    function handleKeydown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss(null);
      }
    }

    function handleBackdrop(e) {
      if (e.target === overlay) dismiss(null);
    }

    async function runSearch(prefix) {
      const myToken = ++lastQueryToken;
      resultsEl.innerHTML = `<div class="aq-linksib__loading">${strings.kids.profile.linkModalLoading}</div>`;
      const res = await searchKidsByName(prefix || "", excludeIds || [anchorKidId]);
      if (myToken !== lastQueryToken) return;   // stale response

      if (!res.ok) {
        resultsEl.innerHTML = `<div class="aq-linksib__empty">${strings.errors[res.errorKey] || strings.errors.unexpected}</div>`;
        return;
      }
      if (res.results.length === 0) {
        resultsEl.innerHTML = `<div class="aq-linksib__empty">${strings.kids.profile.linkModalNoResults}</div>`;
        return;
      }

      resultsEl.innerHTML = res.results.map((k) => `
        <button type="button" class="aq-linksib__row" data-kid-id="${escapeAttr(k.KidID)}">
          ${k.PhotoThumbnailURL
            ? `<img src="${escapeAttr(k.PhotoThumbnailURL)}" alt="" class="aq-linksib__thumb" />`
            : `<div class="aq-linksib__thumb aq-linksib__thumb--placeholder">👤</div>`}
          <div class="aq-linksib__row-text">
            <div class="aq-linksib__row-name">${escapeHtml(k.FullName)}</div>
            <div class="aq-linksib__row-meta">${escapeHtml(k.Grade || "")}${k.FamilyID ? ` · ${strings.kids.profile.linkModalAlreadyInFamily}` : ""}</div>
          </div>
        </button>
      `).join("");

      resultsEl.querySelectorAll(".aq-linksib__row").forEach((row) => {
        row.addEventListener("click", () => {
          const id = row.getAttribute("data-kid-id");
          const picked = res.results.find((r) => r.KidID === id);
          if (picked) dismiss(picked);
        });
      });
    }

    function handleInput() {
      if (searchTimer) clearTimeout(searchTimer);
      const v = searchInput.value;
      searchTimer = setTimeout(() => runSearch(v), SEARCH_DEBOUNCE_MS);
    }

    closeBtn.addEventListener("click", () => dismiss(null));
    overlay.addEventListener("click", handleBackdrop);
    searchInput.addEventListener("input", handleInput);
    document.addEventListener("keydown", handleKeydown);

    // Focus + initial load.
    setTimeout(() => searchInput.focus(), 0);
    runSearch("");

    activeModal = { dismiss };
  });
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
    .aq-linksib__overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.55);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      z-index: 9100;
      padding: 60px 20px 20px;
      animation: aq-linksib-fade 150ms ease-out;
    }
    @keyframes aq-linksib-fade {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    .aq-linksib__card {
      background: var(--card, #ffffff);
      border-radius: 14px;
      padding: 22px;
      width: 100%;
      max-width: 520px;
      box-shadow: 0 16px 48px rgba(15, 23, 42, 0.28);
      display: flex;
      flex-direction: column;
      max-height: calc(100vh - 80px);
    }
    .aq-linksib__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 6px;
    }
    .aq-linksib__title {
      margin: 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 18px;
      font-weight: 600;
      color: var(--ink, #0f172a);
    }
    .aq-linksib__close {
      background: transparent;
      border: none;
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
      color: var(--mute, #64748b);
      padding: 4px 10px;
      border-radius: 6px;
    }
    .aq-linksib__close:hover {
      background: var(--bg, #f8fafc);
    }
    .aq-linksib__body {
      margin: 0 0 14px 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      color: var(--ink-2, #334155);
    }
    .aq-linksib__search {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 10px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      color: var(--ink, #0f172a);
      outline: none;
      transition: border-color 150ms ease, box-shadow 150ms ease;
      margin-bottom: 12px;
    }
    .aq-linksib__search:focus {
      border-color: var(--accent, #0ea5e9);
      box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
    }
    .aq-linksib__results {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-height: 200px;
    }
    .aq-linksib__loading,
    .aq-linksib__empty {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      color: var(--mute, #64748b);
      text-align: center;
      padding: 24px 0;
    }
    .aq-linksib__row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px;
      border: 1px solid var(--line, #e2e8f0);
      background: var(--card, #ffffff);
      border-radius: 10px;
      cursor: pointer;
      text-align: left;
      transition: background-color 120ms ease, border-color 120ms ease;
      font-family: 'DM Sans', system-ui, sans-serif;
    }
    .aq-linksib__row:hover {
      background: rgba(14, 165, 233, 0.06);
      border-color: var(--accent, #0ea5e9);
    }
    .aq-linksib__thumb {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      background: var(--line, #e2e8f0);
    }
    .aq-linksib__thumb--placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      color: var(--mute, #64748b);
    }
    .aq-linksib__row-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .aq-linksib__row-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--ink, #0f172a);
    }
    .aq-linksib__row-meta {
      font-size: 12px;
      color: var(--mute, #64748b);
    }
  `;
  document.head.appendChild(style);
}