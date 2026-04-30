// public/src/admin/errors-viewer-view.js
//
// SuperAdmin errors viewer (§39.15). Reads /tenants/{tid}/errors via
// errors-viewer-service. Filters: source + date range. Pagination: cursor-
// based "Load more" button. Click a row to expand and see Stack + Context.
//
// Public API:
//   renderErrorsViewerView(container, profile, deps)
//     - container: DOM element to render into
//     - profile:   signed-in user profile (gate: SuperAdmin only — caller
//                  should not even route here for non-SuperAdmins, but we
//                  re-check defensively)
//     - deps:      { onBack() }   — called when the user clicks the back btn
//   Returns a cleanup function.

import { strings } from "../strings/en.js";
import { showToast } from "../ui/toast.js";
import { isSuperAdmin } from "../auth/permissions.js";
import { listErrors } from "./errors-viewer-service.js";

const PAGE_SIZE = 25;

const RANGE_OPTIONS = [
  { key: "24h",  label: "Last 24 hours", millis: 24 * 60 * 60 * 1000 },
  { key: "7d",   label: "Last 7 days",   millis: 7  * 24 * 60 * 60 * 1000 },
  { key: "30d",  label: "Last 30 days",  millis: 30 * 24 * 60 * 60 * 1000 },
  { key: "all",  label: "All time",      millis: null }
];
const SOURCE_OPTIONS = [
  { key: "all",            label: "All sources" },
  { key: "frontend",       label: "Frontend" },
  { key: "cloud_function", label: "Cloud function" }
];

export function renderErrorsViewerView(container, profile, deps) {
  ensureStyles();

  // Defensive re-check. The shell should have gated us out, but if a
  // non-SuperAdmin somehow reaches this path, we render a small
  // forbidden state instead of crashing.
  if (!isSuperAdmin(profile)) {
    container.innerHTML = `
      <div class="aq-page">
        <header class="aq-page__header">
          <h1 class="aq-page__title">${strings.errorsViewer.pageTitle}</h1>
          <button type="button" class="aq-button aq-button--ghost" id="aq-errv-back">
            ${strings.errorsViewer.backButton}
          </button>
        </header>
        <main class="aq-page__main">
          <div class="aq-card aq-card--centered">
            <h2 class="aq-card__title">${strings.errorsViewer.forbiddenTitle}</h2>
            <p class="aq-card__body">${strings.errorsViewer.forbiddenBody}</p>
          </div>
        </main>
      </div>
    `;
    const back = container.querySelector("#aq-errv-back");
    const handleBack = () => deps.onBack();
    back.addEventListener("click", handleBack);
    return () => back.removeEventListener("click", handleBack);
  }

  // ── Page chrome + filter row ───────────────────────────────────────────
  container.innerHTML = `
    <div class="aq-page">
      <header class="aq-page__header">
        <h1 class="aq-page__title">${strings.errorsViewer.pageTitle}</h1>
        <button type="button" class="aq-button aq-button--ghost" id="aq-errv-back">
          ${strings.errorsViewer.backButton}
        </button>
      </header>

      <main class="aq-page__main">
        <div class="aq-errv">
          <div class="aq-errv__filters">
            <label class="aq-errv__filter">
              <span>${strings.errorsViewer.filterSource}</span>
              <select class="aq-field__select aq-errv__select" id="aq-errv-source">
                ${SOURCE_OPTIONS.map((o) => `<option value="${o.key}">${escapeHtml(o.label)}</option>`).join("")}
              </select>
            </label>
            <label class="aq-errv__filter">
              <span>${strings.errorsViewer.filterRange}</span>
              <select class="aq-field__select aq-errv__select" id="aq-errv-range">
                ${RANGE_OPTIONS.map((o) => `<option value="${o.key}"${o.key === "24h" ? " selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
              </select>
            </label>
            <button type="button" class="aq-button aq-button--ghost" id="aq-errv-refresh">
              ${strings.errorsViewer.refreshButton}
            </button>
          </div>

          <div class="aq-errv__count" id="aq-errv-count"></div>

          <div class="aq-errv__list" id="aq-errv-list">
            <div class="aq-errv__loading">${strings.errorsViewer.loading}</div>
          </div>

          <div class="aq-errv__footer" id="aq-errv-footer"></div>
        </div>
      </main>
    </div>
  `;

  const els = {
    back:     container.querySelector("#aq-errv-back"),
    source:   container.querySelector("#aq-errv-source"),
    range:    container.querySelector("#aq-errv-range"),
    refresh:  container.querySelector("#aq-errv-refresh"),
    count:    container.querySelector("#aq-errv-count"),
    list:     container.querySelector("#aq-errv-list"),
    footer:   container.querySelector("#aq-errv-footer")
  };

  let cancelled = false;
  let isLoading = false;
  let lastSnap = null;
  let allItems = [];
  let expandedIds = new Set();

  function currentFilters() {
    const sourceKey = els.source.value;
    const rangeKey  = els.range.value;
    const range     = RANGE_OPTIONS.find((o) => o.key === rangeKey) || RANGE_OPTIONS[0];
    const sinceMillis = range.millis ? Date.now() - range.millis : null;
    return { source: sourceKey, sinceMillis };
  }

  async function loadFirstPage() {
    if (cancelled) return;
    isLoading = true;
    lastSnap = null;
    allItems = [];
    expandedIds = new Set();
    els.list.innerHTML = `<div class="aq-errv__loading">${strings.errorsViewer.loading}</div>`;
    els.footer.innerHTML = "";
    els.count.textContent = "";

    const { source, sinceMillis } = currentFilters();
    const res = await listErrors({ source, sinceMillis, before: null, pageSize: PAGE_SIZE });
    if (cancelled) return;

    isLoading = false;

    if (!res.ok) {
      const msg = strings.errors[res.errorKey] || strings.errors.unexpected;
      els.list.innerHTML = `<div class="aq-errv__error">${escapeHtml(msg)}</div>`;
      return;
    }

    allItems = res.items;
    lastSnap = res.lastSnap;
    renderList();
  }

  async function loadMore() {
    if (cancelled || isLoading || !lastSnap) return;
    isLoading = true;
    setLoadMoreButton(true);

    const { source, sinceMillis } = currentFilters();
    const res = await listErrors({ source, sinceMillis, before: lastSnap, pageSize: PAGE_SIZE });
    if (cancelled) return;

    isLoading = false;

    if (!res.ok) {
      showToast(strings.errors[res.errorKey] || strings.errors.unexpected, "error");
      setLoadMoreButton(false);
      return;
    }

    allItems = allItems.concat(res.items);
    lastSnap = res.lastSnap;
    renderList();
  }

  function renderList() {
    if (allItems.length === 0) {
      els.count.textContent = "";
      els.list.innerHTML = `<div class="aq-errv__empty">${strings.errorsViewer.empty}</div>`;
      els.footer.innerHTML = "";
      return;
    }

    els.count.textContent = strings.errorsViewer.countLine.replace("{count}", String(allItems.length));

    els.list.innerHTML = allItems.map((it) => renderRow(it)).join("");

    // Wire row click handlers (expand/collapse).
    els.list.querySelectorAll(".aq-errv__row").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-id");
        if (!id) return;
        if (expandedIds.has(id)) expandedIds.delete(id); else expandedIds.add(id);
        renderList();
      });
    });

    // Footer: show "Load more" if there might be more.
    if (lastSnap && allItems.length > 0 && allItems.length % PAGE_SIZE === 0) {
      els.footer.innerHTML = `
        <button type="button" class="aq-button aq-button--ghost" id="aq-errv-load-more">
          ${strings.errorsViewer.loadMore}
        </button>
      `;
      const lm = container.querySelector("#aq-errv-load-more");
      lm.addEventListener("click", loadMore);
    } else {
      els.footer.innerHTML = `<div class="aq-errv__end">${strings.errorsViewer.endOfList}</div>`;
    }
  }

  function setLoadMoreButton(busy) {
    const lm = container.querySelector("#aq-errv-load-more");
    if (!lm) return;
    lm.disabled = busy;
    lm.textContent = busy ? strings.errorsViewer.loadingMore : strings.errorsViewer.loadMore;
  }

  function renderRow(item) {
    const expanded = expandedIds.has(item.id);
    const ts       = formatTimestamp(item.Timestamp);
    const message  = (item.Message || "").slice(0, 240);
    const stack    = item.Stack || strings.errorsViewer.none;
    const context  = item.Context || strings.errorsViewer.none;

    const sourceLabel = item.Source === "frontend"
      ? strings.errorsViewer.sourceFrontend
      : item.Source === "cloud_function"
        ? strings.errorsViewer.sourceCloudFunction
        : escapeHtml(item.Source || "—");

    return `
      <div class="aq-errv__row ${expanded ? "aq-errv__row--expanded" : ""}" data-id="${escapeAttr(item.id)}">
        <div class="aq-errv__row-head">
          <div class="aq-errv__row-meta">
            <span class="aq-errv__time">${escapeHtml(ts)}</span>
            <span class="aq-errv__chip aq-errv__chip--${item.Source === "frontend" ? "front" : "cloud"}">${sourceLabel}</span>
            <span class="aq-errv__page">${escapeHtml(item.Page)}</span>
          </div>
          <div class="aq-errv__row-action">${escapeHtml(item.Action)}</div>
        </div>
        <div class="aq-errv__row-msg">${escapeHtml(message)}</div>
        ${expanded ? `
          <div class="aq-errv__row-detail">
            <div class="aq-errv__detail-block">
              <div class="aq-errv__detail-label">${strings.errorsViewer.detailUser}</div>
              <div class="aq-errv__detail-value aq-errv__detail-value--mono">${escapeHtml(item.UserID || strings.errorsViewer.none)}</div>
            </div>
            <div class="aq-errv__detail-block">
              <div class="aq-errv__detail-label">${strings.errorsViewer.detailStack}</div>
              <pre class="aq-errv__detail-pre">${escapeHtml(stack)}</pre>
            </div>
            <div class="aq-errv__detail-block">
              <div class="aq-errv__detail-label">${strings.errorsViewer.detailContext}</div>
              <pre class="aq-errv__detail-pre">${escapeHtml(context)}</pre>
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }

  // ── Wiring ─────────────────────────────────────────────────────────────
  function handleBack()           { deps.onBack(); }
  function handleSourceChanged()  { loadFirstPage(); }
  function handleRangeChanged()   { loadFirstPage(); }
  function handleRefreshClicked() { loadFirstPage(); }

  els.back.addEventListener("click", handleBack);
  els.source.addEventListener("change", handleSourceChanged);
  els.range.addEventListener("change", handleRangeChanged);
  els.refresh.addEventListener("click", handleRefreshClicked);

  loadFirstPage();

  return function cleanup() {
    cancelled = true;
    els.back.removeEventListener("click", handleBack);
    els.source.removeEventListener("change", handleSourceChanged);
    els.range.removeEventListener("change", handleRangeChanged);
    els.refresh.removeEventListener("click", handleRefreshClicked);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatTimestamp(ts) {
  if (!ts) return "—";
  const d = typeof ts.toDate === "function" ? ts.toDate() : (ts instanceof Date ? ts : null);
  if (!d || isNaN(d.getTime())) return "—";
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${dd} ${hh}:${mm}:${ss}`;
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
// ─────────────────────────────────────────────────────────────────────────────

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    .aq-errv {
      width: 100%;
      max-width: 1000px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .aq-errv__filters {
      display: flex;
      align-items: end;
      gap: 12px;
      flex-wrap: wrap;
    }
    .aq-errv__filter {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      color: var(--mute, #64748b);
    }
    .aq-errv__select {
      padding: 8px 10px;
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 8px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      color: var(--ink, #0f172a);
      background: var(--card, #ffffff);
      min-width: 160px;
      cursor: pointer;
    }
    .aq-errv__count {
      font-family: 'DM Mono', ui-monospace, monospace;
      font-size: 11px;
      color: var(--mute, #64748b);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .aq-errv__list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .aq-errv__loading,
    .aq-errv__empty,
    .aq-errv__error,
    .aq-errv__end {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      color: var(--mute, #64748b);
      text-align: center;
      padding: 24px 0;
    }
    .aq-errv__error {
      color: var(--danger, #ef4444);
    }

    .aq-errv__row {
      background: var(--card, #ffffff);
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 10px;
      padding: 12px 14px;
      cursor: pointer;
      transition: border-color 120ms ease, background-color 120ms ease;
    }
    .aq-errv__row:hover {
      border-color: var(--accent, #0ea5e9);
      background: rgba(14, 165, 233, 0.03);
    }
    .aq-errv__row--expanded {
      border-color: var(--accent, #0ea5e9);
    }

    .aq-errv__row-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 6px;
    }
    .aq-errv__row-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .aq-errv__time {
      font-family: 'DM Mono', ui-monospace, monospace;
      font-size: 12px;
      color: var(--ink-2, #334155);
    }
    .aq-errv__chip {
      font-family: 'DM Mono', ui-monospace, monospace;
      font-size: 10px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .aq-errv__chip--front { background: rgba(14,165,233,0.12); color: var(--accent, #0ea5e9); }
    .aq-errv__chip--cloud { background: rgba(139, 92, 246, 0.12); color: var(--purple, #8b5cf6); }
    .aq-errv__page {
      font-family: 'DM Mono', ui-monospace, monospace;
      font-size: 12px;
      color: var(--mute, #64748b);
    }
    .aq-errv__row-action {
      font-family: 'DM Mono', ui-monospace, monospace;
      font-size: 12px;
      color: var(--ink-2, #334155);
    }
    .aq-errv__row-msg {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      color: var(--ink, #0f172a);
      line-height: 1.4;
      word-break: break-word;
    }

    .aq-errv__row-detail {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--line, #e2e8f0);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .aq-errv__detail-block {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .aq-errv__detail-label {
      font-family: 'DM Mono', ui-monospace, monospace;
      font-size: 10px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--mute, #64748b);
    }
    .aq-errv__detail-value {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      color: var(--ink-2, #334155);
    }
    .aq-errv__detail-value--mono {
      font-family: 'DM Mono', ui-monospace, monospace;
      font-size: 12px;
    }
    .aq-errv__detail-pre {
      margin: 0;
      padding: 10px 12px;
      background: var(--bg, #f8fafc);
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 8px;
      font-family: 'DM Mono', ui-monospace, monospace;
      font-size: 12px;
      color: var(--ink-2, #334155);
      max-height: 240px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .aq-errv__footer {
      display: flex;
      justify-content: center;
      padding: 8px 0 24px 0;
    }
  `;
  document.head.appendChild(style);
}