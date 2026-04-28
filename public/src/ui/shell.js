// public/src/ui/shell.js
//
// The orchestrator. Decides what's on screen based on auth state + URL hash.
// Owns the header when a user is signed in.
//
// Routes (signed-in only):
//   #/dashboard          (default)
//   #/kids               kids list page (with optional ?filter query string)
//   #/kids/new           registration form
//   #/kids/{kidId}       profile view
//
// Hash query-string handling:
//   The kids list serializes its filters into the hash as a query string,
//   e.g. #/kids?status=blocked&q=khoury. routeFromHash() splits the path off
//   the query string before matching routes. The query-string parsing happens
//   inside the list view itself (via its own URLSearchParams call) — the shell
//   doesn't care what the keys are.
//
// Cleanup model:
//   - currentViewCleanup: cleanup for the OUTER view (login, wizard, layout,
//     setup-incomplete). Lives across page navigations within a signed-in
//     session. Cleared on auth-state changes.
//   - currentPageCleanup: cleanup for the INNER routed page (dashboard,
//     register-view, profile-view, list-view). Cleared on every hash navigation.

import {
  onAuthChange,
  signOut,
  getCurrentUserProfile
} from "../auth/auth-service.js";
import { renderLoginView } from "../auth/login-view.js";
import { renderWizardView } from "../setup/wizard-view.js";
import { isSetupComplete } from "../setup/setup-status.js";
import { renderRegisterKidView } from "../kids/register-view.js";
import { renderKidProfileView } from "../kids/profile-view.js";
import { renderKidsListView } from "../kids/kids-list-view.js";
import { renderDevToolsSection } from "../dev/dev-tools-section.js";
import { strings } from "../strings/en.js";
import { showToast } from "./toast.js";

let currentViewCleanup = null;
let currentPageCleanup = null;
let rootEl = null;
let signedInProfile = null;
let pageMount = null;
let hashChangeHandler = null;
// We track the last-routed PATH (not the full hash with query string) so a
// query-string-only change (e.g. typing in the search box, which calls
// history.replaceState to update filter state in the URL) does NOT cause
// the list view to be torn down and re-mounted on every keystroke.
let lastRoutedPath = null;

// ─────────────────────────────────────────────────────────────────────────────
// Mount
// ─────────────────────────────────────────────────────────────────────────────

export function mountShell(targetEl) {
  ensureShellStyles();
  rootEl = targetEl;

  renderLoading();

  onAuthChange(async (user) => {
    detachHashChange();
    signedInProfile = null;
    lastRoutedPath = null;

    if (!user) {
      swapView(renderLoginView);
      return;
    }

    let result;
    try {
      result = await getCurrentUserProfile();
    } catch (err) {
      console.error("[shell] Profile lookup threw:", err);
      showToast(strings.errors.unexpected, "error");
      await signOut();
      return;
    }

    if (!result.ok) {
      const message = strings.errors[result.errorKey] || strings.errors.unexpected;
      showToast(message, "error");
      await signOut();
      return;
    }

    let setupDone;
    try {
      setupDone = await isSetupComplete();
    } catch (err) {
      console.error("[shell] isSetupComplete threw:", err);
      showToast(strings.errors.setupCheckFailed, "error");
      await signOut();
      return;
    }

    if (!setupDone) {
      if (result.profile.role === "SuperAdmin") {
        swapView((container) =>
          renderWizardView(container, result.profile, () => {
            signedInProfile = result.profile;
            renderSignedInLayout();
            attachHashChange();
            navigateTo(currentRouteOrDefault());
          })
        );
      } else {
        renderSetupIncomplete(result.profile);
      }
      return;
    }

    signedInProfile = result.profile;
    renderSignedInLayout();
    attachHashChange();
    navigateTo(currentRouteOrDefault());
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Routing
// ─────────────────────────────────────────────────────────────────────────────

function currentRouteOrDefault() {
  const hash = window.location.hash || "";
  if (hash.startsWith("#/")) return hash;
  return "#/dashboard";
}

function navigateTo(hash) {
  if (window.location.hash !== hash) {
    window.location.hash = hash;
    return;
  }
  routeFromHash();
}

function attachHashChange() {
  if (hashChangeHandler) return;
  hashChangeHandler = () => routeFromHash();
  window.addEventListener("hashchange", hashChangeHandler);
}

function detachHashChange() {
  if (!hashChangeHandler) return;
  window.removeEventListener("hashchange", hashChangeHandler);
  hashChangeHandler = null;
}

/**
 * Split a hash into its path and query-string parts.
 *   "#/kids?status=blocked"  -> { path: "#/kids", query: "status=blocked" }
 *   "#/dashboard"            -> { path: "#/dashboard", query: "" }
 */
function splitHash(hash) {
  const qIdx = hash.indexOf("?");
  if (qIdx === -1) return { path: hash, query: "" };
  return { path: hash.slice(0, qIdx), query: hash.slice(qIdx + 1) };
}

function routeFromHash() {
  if (!signedInProfile) return;
  if (!pageMount) {
    // Layout not in place (race during sign-in transitions). Re-mount.
    renderSignedInLayout();
    if (!pageMount) return;
  }

  const fullHash = window.location.hash || "#/dashboard";
  const { path } = splitHash(fullHash);

  // If only the query string changed, the page is already correct — don't
  // re-mount it. The page itself listens to hashchange to react to filter
  // changes from Back/Forward navigation.
  if (path === lastRoutedPath) return;
  lastRoutedPath = path;

  // Tear down the inner page only — NOT the layout.
  if (currentPageCleanup) {
    try { currentPageCleanup(); } catch (e) { console.error("[shell] page cleanup threw:", e); }
    currentPageCleanup = null;
  }
  pageMount.innerHTML = "";

  if (path === "#/kids/new") {
    setActiveNav("kids");
    currentPageCleanup = renderRegisterKidView(pageMount, signedInProfile, {
      onCancel: () => navigateTo("#/kids"),
      onRegistered: (kidId) => navigateTo(`#/kids/${encodeURIComponent(kidId)}`)
    });
    return;
  }

  if (path === "#/kids") {
    setActiveNav("kids");
    currentPageCleanup = renderKidsListView(pageMount, signedInProfile, {
      onOpenKid: (kidId) => navigateTo(`#/kids/${encodeURIComponent(kidId)}`),
      onRegisterKid: () => navigateTo("#/kids/new")
    });
    return;
  }

  const kidMatch = path.match(/^#\/kids\/([^\/]+)$/);
  if (kidMatch) {
    setActiveNav("kids");
    const kidId = decodeURIComponent(kidMatch[1]);
    currentPageCleanup = renderKidProfileView(pageMount, kidId, {
      onBack: () => navigateTo("#/kids"),
      onRegisterAnother: () => navigateTo("#/kids/new")
    });
    return;
  }

  setActiveNav(null);
  renderDashboardPlaceholder(pageMount);
}

function setActiveNav(key) {
  if (!rootEl) return;
  const buttons = rootEl.querySelectorAll("[data-nav-key]");
  buttons.forEach((btn) => {
    if (btn.getAttribute("data-nav-key") === key) {
      btn.classList.add("aq-nav__btn--active");
    } else {
      btn.classList.remove("aq-nav__btn--active");
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// View rendering
// ─────────────────────────────────────────────────────────────────────────────

function swapView(renderFn) {
  if (currentPageCleanup) {
    try { currentPageCleanup(); } catch (e) { console.error("[shell] page cleanup threw:", e); }
    currentPageCleanup = null;
  }
  if (currentViewCleanup) {
    try { currentViewCleanup(); } catch (e) { console.error("[shell] cleanup threw:", e); }
    currentViewCleanup = null;
  }
  rootEl.innerHTML = "";
  pageMount = null;
  lastRoutedPath = null;
  currentViewCleanup = renderFn(rootEl) || null;
}

function renderLoading() {
  rootEl.innerHTML = `
    <div class="aq-loading">
      <div class="aq-loading__pulse"></div>
    </div>
  `;
  currentViewCleanup = null;
  currentPageCleanup = null;
  pageMount = null;
  lastRoutedPath = null;
}

function renderSignedInLayout() {
  if (currentPageCleanup) {
    try { currentPageCleanup(); } catch (e) { console.error("[shell] page cleanup threw:", e); }
    currentPageCleanup = null;
  }
  if (currentViewCleanup) {
    try { currentViewCleanup(); } catch (e) { console.error("[shell] cleanup threw:", e); }
    currentViewCleanup = null;
  }

  const profile = signedInProfile;
  const loggedInAs = strings.shell.loggedInAs.replace("{email}", profile.email);
  const roleLine   = strings.shell.role.replace("{role}", profile.role || "—");

  rootEl.innerHTML = `
    <div class="aq-app">
      <header class="aq-header">
        <a class="aq-header__brand" href="#/dashboard">${strings.app.name}</a>

        <nav class="aq-nav">
          <a class="aq-nav__btn" data-nav-key="kids" href="#/kids">
            ${strings.shell.navKids}
          </a>
        </nav>

        <div class="aq-header__user">
          <div class="aq-header__user-line">${escapeHtml(loggedInAs)}</div>
          <div class="aq-header__user-role">${escapeHtml(roleLine)}</div>
        </div>
        <button class="aq-button aq-button--ghost" id="aq-logout-btn">
          ${strings.shell.logoutButton}
        </button>
      </header>

      <main class="aq-main" id="aq-page-mount"></main>
    </div>
  `;

  pageMount = rootEl.querySelector("#aq-page-mount");
  lastRoutedPath = null;

  const logoutBtn = rootEl.querySelector("#aq-logout-btn");
  async function handleLogout() {
    logoutBtn.disabled = true;
    try {
      await signOut();
      showToast(strings.toast.signedOut, "info");
    } catch (err) {
      console.error("[shell] signOut failed:", err);
      showToast(strings.errors.unexpected, "error");
      logoutBtn.disabled = false;
    }
  }
  logoutBtn.addEventListener("click", handleLogout);

  currentViewCleanup = function cleanup() {
    if (currentPageCleanup) {
      try { currentPageCleanup(); } catch (e) { console.error("[shell] page cleanup threw:", e); }
      currentPageCleanup = null;
    }
    logoutBtn.removeEventListener("click", handleLogout);
    detachHashChange();
    pageMount = null;
    lastRoutedPath = null;
  };
}

function renderDashboardPlaceholder(mount) {
  mount.innerHTML = `
    <div class="aq-dashboard-stack">
      <div class="aq-card">
        <h2 class="aq-card__title">${strings.dashboard.placeholderTitle}</h2>
        <p class="aq-card__body">${strings.dashboard.placeholderBody}</p>
      </div>
      <div id="aq-dashboard-dev-mount"></div>
    </div>
  `;

  const devMount = mount.querySelector("#aq-dashboard-dev-mount");
  const devCleanup = renderDevToolsSection(devMount, signedInProfile);

  currentPageCleanup = function cleanup() {
    if (devCleanup) {
      try { devCleanup(); } catch (e) { console.error("[shell] dev cleanup threw:", e); }
    }
  };
}

function renderSetupIncomplete(profile) {
  if (currentPageCleanup) {
    try { currentPageCleanup(); } catch (e) { console.error("[shell] page cleanup threw:", e); }
    currentPageCleanup = null;
  }
  if (currentViewCleanup) {
    try { currentViewCleanup(); } catch (e) { console.error("[shell] cleanup threw:", e); }
    currentViewCleanup = null;
  }

  const greeting = strings.setupIncomplete.greeting
    .replace("{email}", profile.email)
    .replace("{role}", profile.role || "—");

  rootEl.innerHTML = `
    <div class="aq-app">
      <main class="aq-main">
        <div class="aq-card aq-card--centered">
          <h2 class="aq-card__title">${strings.setupIncomplete.title}</h2>
          <p class="aq-card__body">${escapeHtml(greeting)}</p>
          <p class="aq-card__body">${strings.setupIncomplete.body}</p>
          <div class="aq-card__actions">
            <button class="aq-button aq-button--ghost" id="aq-setup-incomplete-signout">
              ${strings.shell.logoutButton}
            </button>
          </div>
        </div>
      </main>
    </div>
  `;

  const signOutBtn = rootEl.querySelector("#aq-setup-incomplete-signout");
  async function handleLogout() {
    signOutBtn.disabled = true;
    try {
      await signOut();
      showToast(strings.toast.signedOut, "info");
    } catch (err) {
      console.error("[shell] signOut failed:", err);
      showToast(strings.errors.unexpected, "error");
      signOutBtn.disabled = false;
    }
  }
  signOutBtn.addEventListener("click", handleLogout);

  currentViewCleanup = function cleanup() {
    signOutBtn.removeEventListener("click", handleLogout);
  };
  pageMount = null;
  lastRoutedPath = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

let shellStylesInjected = false;

function ensureShellStyles() {
  if (shellStylesInjected) return;
  shellStylesInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    .aq-app {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background: var(--bg, #f8fafc);
    }

    .aq-header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 20px;
      background: var(--card, #ffffff);
      border-bottom: 1px solid var(--line, #e2e8f0);
    }

    .aq-header__brand {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 20px;
      font-weight: 700;
      color: var(--ink, #0f172a);
      letter-spacing: -0.02em;
      text-decoration: none;
    }

    .aq-nav {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: 8px;
    }

    .aq-nav__btn {
      padding: 8px 14px;
      border-radius: 8px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 500;
      color: var(--ink-2, #334155);
      text-decoration: none;
      transition: background-color 120ms ease, color 120ms ease;
    }
    .aq-nav__btn:hover {
      background: var(--bg, #f8fafc);
    }
    .aq-nav__btn--active {
      background: var(--accent, #0ea5e9);
      color: white;
    }
    .aq-nav__btn--active:hover {
      background: #0284c7;
    }

    .aq-header__user {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      line-height: 1.3;
    }

    .aq-header__user-line {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      color: var(--ink-2, #334155);
    }

    .aq-header__user-role {
      font-family: 'DM Mono', ui-monospace, monospace;
      font-size: 11px;
      color: var(--mute, #64748b);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .aq-button--ghost {
      background: transparent;
      color: var(--ink-2, #334155);
      border: 1px solid var(--line, #e2e8f0);
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 120ms ease;
    }

    .aq-button--ghost:hover:not(:disabled) {
      background: var(--bg, #f8fafc);
    }

    .aq-main {
      flex: 1;
      padding: 32px 20px;
      display: flex;
      justify-content: center;
    }

    .aq-card {
      width: 100%;
      max-width: 560px;
      background: var(--card, #ffffff);
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 14px;
      padding: 24px;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
    }

    .aq-card__title {
      margin: 0 0 8px 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 18px;
      font-weight: 600;
      color: var(--ink, #0f172a);
    }

    .aq-card__body {
      margin: 0 0 12px 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--ink-2, #334155);
    }

    .aq-card__body:last-child {
      margin-bottom: 0;
    }

    .aq-card--centered {
      text-align: center;
    }

    .aq-card__actions {
      margin-top: 20px;
      display: flex;
      justify-content: center;
    }

    .aq-dashboard-stack {
      width: 100%;
      max-width: 560px;
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }

    .aq-loading {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg, #f8fafc);
    }

    .aq-loading__pulse {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--accent, #0ea5e9);
      opacity: 0.5;
      animation: aq-pulse 1.2s ease-in-out infinite;
    }

    @keyframes aq-pulse {
      0%, 100% { transform: scale(0.85); opacity: 0.5; }
      50%      { transform: scale(1);    opacity: 1;   }
    }
  `;
  document.head.appendChild(style);
}