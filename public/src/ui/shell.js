// public/src/ui/shell.js
//
// The orchestrator. Decides what's on screen based on auth state.
// Owns the header when a user is signed in.
//
// Lifecycle:
//   1. mountShell(rootEl) is called once, from index.html.
//   2. Shell renders a "loading" splash while Firebase Auth resolves.
//   3. onAuthChange() fires:
//        - user = null     -> render login view
//        - user present    -> look up profile, then render dashboard
//   4. On profile failure (not found / inactive): sign out + show toast.
//
// The shell is the only file that calls renderLoginView() and the only file
// that calls signOut(). Everyone else just lives inside whatever view the
// shell has rendered.

import {
  onAuthChange,
  signOut,
  getCurrentUserProfile
} from "../auth/auth-service.js";
import { renderLoginView } from "../auth/login-view.js";
import { renderWizardView } from "../setup/wizard-view.js";
import { isSetupComplete } from "../setup/setup-status.js";
import { strings } from "../strings/en.js";
import { showToast } from "./toast.js";
// Reference to the cleanup function returned by the currently-mounted view.
// We call this before swapping views so listeners don't leak.
let currentViewCleanup = null;

// The DOM element the shell renders into. Set on mount.
let rootEl = null;

/**
 * Mount the shell into the given root element.
 * Called once from index.html. After this, the shell drives everything.
 */
export function mountShell(targetEl) {
  ensureShellStyles();
  rootEl = targetEl;

  renderLoading();

  // Subscribe to auth state. The callback fires:
  //   - immediately, with the current state (null if signed out, user if remembered)
  //   - again on every sign-in / sign-out
  onAuthChange(async (user) => {
    if (!user) {
      swapView(renderLoginView);
      return;
    }

    // User is authenticated. Look up their profile + role.
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
      // Profile missing or inactive. Show the message, sign out, end up at login.
      const message = strings.errors[result.errorKey] || strings.errors.unexpected;
      showToast(message, "error");
      await signOut();
      return;
    }

    // Profile loaded. Now check whether onboarding has been completed.
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
      // Onboarding not finished. Only SuperAdmin can run the wizard.
      // Other roles see a "setup not finished" screen with a sign-out button.
      if (result.profile.role === "SuperAdmin") {
        swapView((container) =>
          renderWizardView(container, result.profile, () => {
            // Wizard finished. Re-render: setup is now complete, dashboard appears.
            renderSignedInLayout(result.profile);
          })
        );
      } else {
        renderSetupIncomplete(result.profile);
      }
      return;
    }

    // All good — render dashboard with header.
    renderSignedInLayout(result.profile);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// View rendering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tear down the current view (if any), then render a new one.
 * `renderFn` is a function that takes a container element and returns a cleanup function.
 */
function swapView(renderFn) {
  if (currentViewCleanup) {
    try { currentViewCleanup(); } catch (e) { console.error("[shell] cleanup threw:", e); }
    currentViewCleanup = null;
  }
  rootEl.innerHTML = "";
  currentViewCleanup = renderFn(rootEl) || null;
}

function renderLoading() {
  rootEl.innerHTML = `
    <div class="aq-loading">
      <div class="aq-loading__pulse"></div>
    </div>
  `;
  currentViewCleanup = null;
}

/**
 * Render the signed-in layout: header + dashboard placeholder.
 * Today the dashboard is just a card showing email + role. Real dashboard later.
 */
function renderSignedInLayout(profile) {
  // Tear down whatever was there.
  if (currentViewCleanup) {
    try { currentViewCleanup(); } catch (e) { console.error("[shell] cleanup threw:", e); }
    currentViewCleanup = null;
  }

  const loggedInAs = strings.shell.loggedInAs.replace("{email}", profile.email);
  const roleLine   = strings.shell.role.replace("{role}", profile.role || "—");

  rootEl.innerHTML = `
    <div class="aq-app">
      <header class="aq-header">
        <div class="aq-header__brand">${strings.app.name}</div>
        <div class="aq-header__user">
          <div class="aq-header__user-line">${escapeHtml(loggedInAs)}</div>
          <div class="aq-header__user-role">${escapeHtml(roleLine)}</div>
        </div>
        <button class="aq-button aq-button--ghost" id="aq-logout-btn">
          ${strings.shell.logoutButton}
        </button>
      </header>

      <main class="aq-main">
        <div class="aq-card">
          <h2 class="aq-card__title">${strings.dashboard.placeholderTitle}</h2>
          <p class="aq-card__body">${strings.dashboard.placeholderBody}</p>
        </div>
      </main>
    </div>
  `;

  const logoutBtn = rootEl.querySelector("#aq-logout-btn");
  async function handleLogout() {
    logoutBtn.disabled = true;
    try {
      await signOut();
      showToast(strings.toast.signedOut, "info");
      // onAuthChange will fire and swap us back to the login view.
    } catch (err) {
      console.error("[shell] signOut failed:", err);
      showToast(strings.errors.unexpected, "error");
      logoutBtn.disabled = false;
    }
  }
  logoutBtn.addEventListener("click", handleLogout);

  // Set the cleanup so a future view swap detaches the listener.
  currentViewCleanup = function cleanup() {
    logoutBtn.removeEventListener("click", handleLogout);
  };
}

/**
 * Render the "setup not finished" screen for non-SuperAdmin users when
 * the onboarding wizard hasn't been completed yet.
 * They get a friendly message and a sign-out button — that's it.
 */
function renderSetupIncomplete(profile) {
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escape user-controlled strings before inserting into innerHTML.
 * Email comes from Firebase Auth (already validated as an email shape) but
 * we escape anyway — defense in depth, costs nothing.
 */
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