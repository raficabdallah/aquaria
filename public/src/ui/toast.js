// public/src/ui/toast.js
//
// Small toast notification helper. Self-contained — first call creates
// its own DOM container, no setup required in index.html.
//
// Usage:
//   import { showToast } from "./toast.js";
//   showToast("Welcome back", "success");
//   showToast("Invalid credentials", "error");
//   showToast("You have been signed out", "info");
//
// Per master prompt §31 (UI/UX standards): uses the project color tokens
// (--success, --danger, --accent) so theming flows from CSS variables.

const CONTAINER_ID = "aq-toast-container";

const DURATION_MS = {
  success: 2500,
  info:    3000,
  error:   4500   // longer so users have time to read the problem
};

/**
 * Show a toast at the bottom of the screen.
 * @param {string} message  Text to display. Already-localized — no translation here.
 * @param {"success"|"error"|"info"} type  Visual style.
 */
export function showToast(message, type = "info") {
  const container = ensureContainer();

  const toast = document.createElement("div");
  toast.className = `aq-toast aq-toast--${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;

  container.appendChild(toast);

  // Trigger CSS transition by adding the visible class on the next frame.
  // (If we add it in the same frame, the browser may collapse the state
  // change and skip the transition.)
  requestAnimationFrame(() => {
    toast.classList.add("aq-toast--visible");
  });

  const duration = DURATION_MS[type] ?? DURATION_MS.info;

  setTimeout(() => {
    toast.classList.remove("aq-toast--visible");
    // Wait for the fade-out transition before removing the node.
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: container + styles
// ─────────────────────────────────────────────────────────────────────────────

function ensureContainer() {
  let container = document.getElementById(CONTAINER_ID);
  if (container) return container;

  container = document.createElement("div");
  container.id = CONTAINER_ID;
  document.body.appendChild(container);

  injectStyles();
  return container;
}

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    #${CONTAINER_ID} {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      z-index: 9999;
      pointer-events: none;
    }

    .aq-toast {
      pointer-events: auto;
      min-width: 240px;
      max-width: 90vw;
      padding: 12px 18px;
      border-radius: 10px;
      font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 500;
      color: white;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 200ms ease, transform 200ms ease;
    }

    .aq-toast--visible {
      opacity: 1;
      transform: translateY(0);
    }

    .aq-toast--success { background: var(--success, #10b981); }
    .aq-toast--error   { background: var(--danger,  #ef4444); }
    .aq-toast--info    { background: var(--accent,  #0ea5e9); }
  `;
  document.head.appendChild(style);
}