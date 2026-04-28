// public/src/dev/dev-tools-section.js
//
// Renders a "Developer tools" section on the dashboard, but ONLY when both:
//   1. The Firebase project is the dev project (aquaria-dev-66eec), AND
//   2. The signed-in user is a SuperAdmin.
//
// In production (aquaria-prod-... or whatever the prod project ends up being)
// this component renders nothing and returns null. That's the production-safe
// gate — code path can't be triggered even if a user crafts a hash route.
//
// Even in dev, non-SuperAdmins (Admin / Operator) don't see this section.
// Firestore rules also enforce role boundaries; this is just UI hygiene.
//
// Two cards stack here:
//   1. Seed/Backfill card (kid registration test data)        — §39.9
//   2. Edit-locks playground card                             — §39.11
//
// Public API:
//   renderDevToolsSection(mount, profile) -> cleanup() | null
//
// The cleanup function detaches event listeners and tears down all child
// dev-tool cards. Returns null (no section rendered) when the gate fails.

import { firebaseConfig } from "../config.js";
import { strings } from "../strings/en.js";
import { showToast } from "../ui/toast.js";
import { seedFakeKids, backfillSearchKeys } from "./seed-tool.js";
import { renderEditLocksPlayground } from "./edit-locks-playground.js";

const DEV_PROJECT_IDS = ["aquaria-dev-66eec"];

/**
 * @param {HTMLElement} mount     Element to append the section into.
 * @param {Object}      profile   Signed-in user profile from auth-service.
 * @returns {Function|null}       cleanup() if rendered, null if gated out.
 */
export function renderDevToolsSection(mount, profile) {
  // ── Gate ──
  if (!isDevProject()) return null;
  if (!profile || profile.role !== "SuperAdmin") return null;

  ensureStyles();

  const t = strings.devTools;

  // ── Seed/Backfill card ──
  const card = document.createElement("div");
  card.className = "aq-card aq-dev-card";
  card.innerHTML = `
    <div class="aq-dev-card__head">
      <span class="aq-dev-card__badge">${t.badge}</span>
      <h2 class="aq-card__title">${t.title}</h2>
    </div>
    <p class="aq-card__body">${t.subtitle}</p>

    <div class="aq-dev-card__actions">
      <button type="button" class="aq-button aq-button--ghost" data-action="seed">
        ${t.seedButton}
      </button>
      <button type="button" class="aq-button aq-button--ghost" data-action="backfill">
        ${t.backfillButton}
      </button>
    </div>
  `;
  mount.appendChild(card);

  const seedBtn     = card.querySelector('[data-action="seed"]');
  const backfillBtn = card.querySelector('[data-action="backfill"]');

  async function handleSeed() {
    setBusy(seedBtn, t.seedRunning);
    try {
      const res = await seedFakeKids(profile);
      if (res.ok) {
        showToast(t.seedSuccess.replace("{count}", String(res.created)), "success");
      } else {
        const msg = strings.errors[res.errorKey] || strings.errors.unexpected;
        showToast(msg, "error");
      }
    } catch (err) {
      console.error("[dev-tools] seed threw:", err);
      showToast(strings.errors.unexpected, "error");
    } finally {
      setIdle(seedBtn, t.seedButton);
    }
  }

  async function handleBackfill() {
    setBusy(backfillBtn, t.backfillRunning);
    try {
      const res = await backfillSearchKeys(profile);
      if (res.ok) {
        const msg = t.backfillSuccess
          .replace("{updated}", String(res.updated))
          .replace("{scanned}", String(res.scanned));
        showToast(msg, "success");
      } else {
        const msg = strings.errors[res.errorKey] || strings.errors.unexpected;
        showToast(msg, "error");
      }
    } catch (err) {
      console.error("[dev-tools] backfill threw:", err);
      showToast(strings.errors.unexpected, "error");
    } finally {
      setIdle(backfillBtn, t.backfillButton);
    }
  }

  seedBtn.addEventListener("click", handleSeed);
  backfillBtn.addEventListener("click", handleBackfill);

  // ── Edit-locks playground card ──
  // Rendered as a SEPARATE card under the seed card so each tool stays
  // visually self-contained.
  const playgroundCleanup = renderEditLocksPlayground(mount, profile);

  return function cleanup() {
    seedBtn.removeEventListener("click", handleSeed);
    backfillBtn.removeEventListener("click", handleBackfill);
    if (playgroundCleanup) {
      try { playgroundCleanup(); } catch (e) { console.error("[dev-tools] playground cleanup threw:", e); }
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isDevProject() {
  return DEV_PROJECT_IDS.includes(firebaseConfig.projectId);
}

function setBusy(btn, label) {
  btn.disabled = true;
  btn.textContent = label;
}

function setIdle(btn, label) {
  btn.disabled = false;
  btn.textContent = label;
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
    .aq-dev-card {
      max-width: 560px;
      margin-top: 16px;
      border-color: #f59e0b;     /* amber line so it reads as developer-only */
      background: #fffbeb;
    }

    .aq-dev-card__head {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }

    .aq-dev-card__badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      background: #f59e0b;
      color: white;
      font-family: 'DM Mono', ui-monospace, monospace;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .aq-dev-card__head .aq-card__title {
      margin: 0;
    }

    .aq-dev-card__actions {
      margin-top: 16px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .aq-dev-card .aq-button--ghost:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(style);
}