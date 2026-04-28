// public/src/kids/kids-list-view.js
//
// The kids list page. Rendered at #/kids. Filters serialize to the URL hash
// query string so refreshes preserve state and links are shareable across
// tablets. Real-time listener via kids-list-service.
//
// Layout:
//   ┌─────────────────────────────────────────────────────────────────┐
//   │  Kids                                       [+ Register kid]    │
//   │  Showing 1–9 of 9 active kids                                   │
//   │                                                                 │
//   │  [search box................................]                  │
//   │  [Status: All|Active|Blocked]  [School ▾]  [Sort ▾]  [Show del] │
//   │                                                                 │
//   │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                            │
//   │  │ card │ │ card │ │ card │ │ card │   ← card grid              │
//   │  └──────┘ └──────┘ └──────┘ └──────┘                            │
//   │                                                                 │
//   │             [ Load 50 more ]   ← only if isLastPageReached=false│
//   └─────────────────────────────────────────────────────────────────┘
//
// State model (single source of truth in `state` object):
//   filters: see kids-list-service.js for shape
//   pages: Map<pageIndex, kidsArray>
//   schools: Set<string> — populated as kids stream in, used for school dropdown
//   ui: { searchInput, lastError, isFirstLoad, hasMorePages }
//
// Cleanup: unsubscribeAll() on the service + remove all DOM listeners + remove
// the hashchange listener that watches for filter URL updates.

import { strings } from "../strings/en.js";
import { showToast } from "../ui/toast.js";
import { logError } from "../services/errors-service.js";
import { subscribeToKidsList, KIDS_PAGE_SIZE } from "./kids-list-service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public render function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {HTMLElement} mount   Where to render. Will be cleared.
 * @param {Object}      profile Signed-in user profile (for SuperAdmin gates).
 * @param {Object}      deps    { onOpenKid(kidId), onRegisterKid() }
 * @returns {Function}          cleanup()
 */
export function renderKidsListView(mount, profile, deps) {
  ensureStyles();

  // ── State ──────────────────────────────────────────────────────────────
  const state = {
    filters: parseFiltersFromHash(),
    pages: new Map(),         // pageIndex -> kids[]
    schools: new Set(),       // accumulated school names for the dropdown
    isFirstLoad: true,
    hasMorePages: false,      // becomes true if a page returns full PAGE_SIZE
    searchDebounceTimer: null
  };

  // ── DOM scaffold ───────────────────────────────────────────────────────
  mount.innerHTML = `
    <div class="aq-list">
      <div class="aq-list__header">
        <div class="aq-list__title-row">
          <h1 class="aq-list__title">${strings.kidsList.title}</h1>
          <button type="button" class="aq-button aq-button--primary" id="aq-list-register-btn">
            ${strings.kidsList.registerButton}
          </button>
        </div>
        <p class="aq-list__count" id="aq-list-count">${strings.kidsList.loading}</p>
      </div>

      <div class="aq-list__filters">
        <input
          type="search"
          id="aq-list-search"
          class="aq-list__search"
          placeholder="${strings.kidsList.searchPlaceholder}"
          autocomplete="off"
        />

        <div class="aq-list__filter-row">
          <div class="aq-segmented" role="tablist" aria-label="${strings.kidsList.statusLabel}">
            <button type="button" class="aq-segmented__btn" data-status="all">${strings.kidsList.statusAll}</button>
            <button type="button" class="aq-segmented__btn" data-status="active">${strings.kidsList.statusActive}</button>
            <button type="button" class="aq-segmented__btn" data-status="blocked">${strings.kidsList.statusBlocked}</button>
          </div>

          <select class="aq-select" id="aq-list-school" aria-label="${strings.kidsList.schoolLabel}">
            <option value="">${strings.kidsList.schoolAny}</option>
            <option value="__ooc__">${strings.kidsList.schoolOoc}</option>
          </select>

          <select class="aq-select" id="aq-list-sort" aria-label="${strings.kidsList.sortLabel}">
            <option value="name">${strings.kidsList.sortName}</option>
            <option value="newest">${strings.kidsList.sortNewest}</option>
            <option value="oldest">${strings.kidsList.sortOldest}</option>
          </select>

          ${profile.role === "SuperAdmin" ? `
            <label class="aq-checkbox">
              <input type="checkbox" id="aq-list-show-deleted" />
              <span>${strings.kidsList.showDeleted}</span>
            </label>
          ` : ""}
        </div>
      </div>

      <div class="aq-list__grid" id="aq-list-grid"></div>

      <div class="aq-list__footer" id="aq-list-footer"></div>
    </div>
  `;

  const els = {
    register:    mount.querySelector("#aq-list-register-btn"),
    count:       mount.querySelector("#aq-list-count"),
    search:      mount.querySelector("#aq-list-search"),
    statusBtns:  mount.querySelectorAll("[data-status]"),
    schoolSel:   mount.querySelector("#aq-list-school"),
    sortSel:     mount.querySelector("#aq-list-sort"),
    showDelChk:  mount.querySelector("#aq-list-show-deleted"),
    grid:        mount.querySelector("#aq-list-grid"),
    footer:      mount.querySelector("#aq-list-footer")
  };

  // ── Initialize controls from current state.filters ─────────────────────
  els.search.value = state.filters.searchPrefix || "";
  els.sortSel.value = state.filters.sort;
  if (state.filters.schoolTypeFilter === "out_of_country") {
    els.schoolSel.value = "__ooc__";
  } else if (state.filters.schoolFilter) {
    // The school's option may not exist yet; we'll add it when streaming
    // returns matching kids. Until then, prepend a temporary option so
    // the select shows the user's filter rather than reverting to "Any".
    const opt = document.createElement("option");
    opt.value = state.filters.schoolFilter;
    opt.textContent = state.filters.schoolFilter;
    opt.dataset.fromState = "1";
    els.schoolSel.appendChild(opt);
    els.schoolSel.value = state.filters.schoolFilter;
  }
  if (els.showDelChk) {
    els.showDelChk.checked = !!state.filters.showDeleted;
  }
  updateStatusSegmented();

  // ── Event wiring ───────────────────────────────────────────────────────
  function handleRegister()        { deps.onRegisterKid(); }
  function handleSearchInput()     { onSearchChanged(els.search.value); }
  function handleSchoolChange()    { onSchoolChanged(els.schoolSel.value); }
  function handleSortChange()      { onSortChanged(els.sortSel.value); }
  function handleShowDelChange()   { onShowDeletedChanged(els.showDelChk.checked); }
  function handleStatusClick(e)    { onStatusChanged(e.currentTarget.getAttribute("data-status")); }
  function handleGridClick(e) {
    const card = e.target.closest("[data-kid-id]");
    if (!card) return;
    deps.onOpenKid(card.getAttribute("data-kid-id"));
  }
  function handleHashChange() {
    // Filters in URL changed (likely via Back/Forward). Re-parse and re-attach.
    const newFilters = parseFiltersFromHash();
    if (filtersEqual(newFilters, state.filters)) return;
    state.filters = newFilters;
    syncControlsFromState();
    refreshSubscription();
  }

  els.register.addEventListener("click", handleRegister);
  els.search.addEventListener("input", handleSearchInput);
  els.schoolSel.addEventListener("change", handleSchoolChange);
  els.sortSel.addEventListener("change", handleSortChange);
  if (els.showDelChk) els.showDelChk.addEventListener("change", handleShowDelChange);
  els.statusBtns.forEach((btn) => btn.addEventListener("click", handleStatusClick));
  els.grid.addEventListener("click", handleGridClick);
  window.addEventListener("hashchange", handleHashChange);

  // ── Subscription management ────────────────────────────────────────────
  let subscription = null;

  function refreshSubscription() {
    if (subscription) {
      subscription.unsubscribeAll();
      subscription = null;
    }
    state.pages.clear();
    state.isFirstLoad = true;
    state.hasMorePages = false;
    renderGrid();
    renderCount();
    renderFooter();

    subscription = subscribeToKidsList(state.filters, {
      onPage: (page) => {
        state.pages.set(page.pageIndex, page.kids);
        // Track schools as kids stream in, so the dropdown stays up to date
        // for the user. We deliberately accumulate across pages and never
        // clear, so deselecting a school filter still shows the option.
        for (const k of page.kids) {
          if (k.School && k.SchoolType !== "out_of_country") {
            state.schools.add(k.School);
          }
        }
        // The "more pages exist" signal: ANY currently-attached page that
        // returned a full PAGE_SIZE means more might exist beyond it.
        // We use the highest-indexed page's signal as the source of truth
        // for the "Load more" button.
        const highestPageIndex = Math.max(...state.pages.keys());
        if (page.pageIndex === highestPageIndex) {
          state.hasMorePages = !page.isLastPageReached;
        }
        state.isFirstLoad = false;
        renderSchoolOptions();
        renderGrid();
        renderCount();
        renderFooter();
      },
      onError: (err) => {
        // Most common: missing composite index. Firestore puts a creation
        // URL in err.message — we surface it via console + audit log.
        logError({
          source: "frontend",
          page: "kids/list",
          action: "listenerError",
          error: err,
          context: { filters: state.filters }
        });
        renderError(err);
      }
    });
  }

  refreshSubscription();

  // ── Filter change handlers ─────────────────────────────────────────────
  function onSearchChanged(raw) {
    if (state.searchDebounceTimer) clearTimeout(state.searchDebounceTimer);
    state.searchDebounceTimer = setTimeout(() => {
      state.searchDebounceTimer = null;
      const next = normalizeSearch(raw);
      if (next === state.filters.searchPrefix) return;
      state.filters = { ...state.filters, searchPrefix: next };
      writeFiltersToHash(state.filters);
      refreshSubscription();
    }, 250);
  }

  function onStatusChanged(value) {
    if (value === state.filters.statusFilter) return;
    state.filters = { ...state.filters, statusFilter: value };
    writeFiltersToHash(state.filters);
    updateStatusSegmented();
    refreshSubscription();
  }

  function onSchoolChanged(value) {
    let nextSchool = null;
    let nextType = null;
    if (value === "__ooc__") {
      nextType = "out_of_country";
    } else if (value) {
      nextSchool = value;
    }
    if (nextSchool === state.filters.schoolFilter && nextType === state.filters.schoolTypeFilter) return;
    state.filters = {
      ...state.filters,
      schoolFilter: nextSchool,
      schoolTypeFilter: nextType
    };
    writeFiltersToHash(state.filters);
    refreshSubscription();
  }

  function onSortChanged(value) {
    if (value === state.filters.sort) return;
    state.filters = { ...state.filters, sort: value };
    writeFiltersToHash(state.filters);
    refreshSubscription();
  }

  function onShowDeletedChanged(checked) {
    if (checked === state.filters.showDeleted) return;
    state.filters = { ...state.filters, showDeleted: checked };
    writeFiltersToHash(state.filters);
    refreshSubscription();
  }

  function syncControlsFromState() {
    els.search.value = state.filters.searchPrefix || "";
    els.sortSel.value = state.filters.sort;
    if (state.filters.schoolTypeFilter === "out_of_country") {
      els.schoolSel.value = "__ooc__";
    } else if (state.filters.schoolFilter) {
      els.schoolSel.value = state.filters.schoolFilter;
    } else {
      els.schoolSel.value = "";
    }
    if (els.showDelChk) els.showDelChk.checked = !!state.filters.showDeleted;
    updateStatusSegmented();
  }

  function updateStatusSegmented() {
    els.statusBtns.forEach((btn) => {
      const v = btn.getAttribute("data-status");
      if (v === state.filters.statusFilter) {
        btn.classList.add("aq-segmented__btn--active");
      } else {
        btn.classList.remove("aq-segmented__btn--active");
      }
    });
  }

  // ── Rendering ──────────────────────────────────────────────────────────
  function renderGrid() {
    const allKids = collectAllKids();

    if (state.isFirstLoad) {
      els.grid.innerHTML = `<div class="aq-list__loading">${strings.kidsList.loading}</div>`;
      return;
    }

    if (allKids.length === 0) {
      els.grid.innerHTML = renderEmptyState();
      // Wire the "register first kid" CTA if present.
      const cta = els.grid.querySelector("[data-cta='register-first']");
      if (cta) cta.addEventListener("click", handleRegister);
      // Wire the "clear filters" CTA if present.
      const clear = els.grid.querySelector("[data-cta='clear-filters']");
      if (clear) clear.addEventListener("click", () => {
        state.filters = defaultFilters();
        writeFiltersToHash(state.filters);
        syncControlsFromState();
        refreshSubscription();
      });
      return;
    }

    els.grid.innerHTML = allKids.map(renderCard).join("");
  }

  function renderEmptyState() {
    if (filtersAreDefault(state.filters)) {
      // Truly empty database
      return `
        <div class="aq-list__empty">
          <h3 class="aq-list__empty-title">${strings.kidsList.emptyTitle}</h3>
          <p class="aq-list__empty-body">${strings.kidsList.emptyBody}</p>
          <button type="button" class="aq-button aq-button--primary" data-cta="register-first">
            ${strings.kidsList.emptyCta}
          </button>
        </div>
      `;
    }
    // Filters returned no results
    return `
      <div class="aq-list__empty">
        <h3 class="aq-list__empty-title">${strings.kidsList.noMatchTitle}</h3>
        <p class="aq-list__empty-body">${strings.kidsList.noMatchBody}</p>
        <button type="button" class="aq-button aq-button--ghost" data-cta="clear-filters">
          ${strings.kidsList.clearFilters}
        </button>
      </div>
    `;
  }

  function renderCard(kid) {
    const photoUrl = kid.PhotoThumbnailURL || kid.PhotoURL || "";
    const initials = computeInitials(kid.FirstName, kid.LastName);
    const ageText  = formatAge(kid.DateOfBirth);
    const isBlocked = kid.Status === "Blocked";
    const isDeleted = kid.Deleted === true;

    const badge = isDeleted
      ? `<span class="aq-badge aq-badge--muted">${strings.kidsList.badgeDeleted}</span>`
      : isBlocked
        ? `<span class="aq-badge aq-badge--danger">${strings.kidsList.badgeBlocked}</span>`
        : "";

    const photoBlock = photoUrl
      ? `<img class="aq-card__photo" src="${escapeAttr(photoUrl)}" alt="" loading="lazy" />`
      : `<div class="aq-card__photo aq-card__photo--initials">${escapeHtml(initials)}</div>`;

    return `
      <button type="button" class="aq-kid-card" data-kid-id="${escapeAttr(kid.KidID)}">
        ${badge}
        ${photoBlock}
        <div class="aq-card__name">${escapeHtml(kid.FullName || "")}</div>
        <div class="aq-card__age">${escapeHtml(ageText)}</div>
      </button>
    `;
  }

  function renderCount() {
    if (state.isFirstLoad) {
      els.count.textContent = strings.kidsList.loading;
      return;
    }
    const total = collectAllKids().length;
    const verb  = describeFilterVerb(state.filters);
    if (total === 0) {
      els.count.textContent = strings.kidsList.countZero.replace("{verb}", verb);
      return;
    }
    if (state.hasMorePages) {
      els.count.textContent = strings.kidsList.countMany.replace("{n}", String(total)).replace("{verb}", verb);
    } else {
      els.count.textContent = strings.kidsList.countExact.replace("{n}", String(total)).replace("{verb}", verb);
    }
  }

  function renderFooter() {
    if (state.isFirstLoad || !state.hasMorePages) {
      els.footer.innerHTML = "";
      return;
    }
    els.footer.innerHTML = `
      <button type="button" class="aq-button aq-button--ghost" id="aq-list-load-more">
        ${strings.kidsList.loadMore.replace("{n}", String(KIDS_PAGE_SIZE))}
      </button>
    `;
    const btn = els.footer.querySelector("#aq-list-load-more");
    btn.addEventListener("click", () => {
      btn.disabled = true;
      btn.textContent = strings.kidsList.loadingMore;
      const ok = subscription && subscription.loadMore();
      if (!ok) {
        btn.disabled = false;
        btn.textContent = strings.kidsList.loadMore.replace("{n}", String(KIDS_PAGE_SIZE));
      }
    });
  }

  function renderSchoolOptions() {
    // Preserve the current selected value so we don't accidentally reset the dropdown.
    const currentValue = els.schoolSel.value;

    // Drop all real school options (keep the two static ones at the top
    // — "" any, "__ooc__" out-of-country).
    const toRemove = [];
    for (const opt of Array.from(els.schoolSel.options)) {
      if (opt.value !== "" && opt.value !== "__ooc__") {
        toRemove.push(opt);
      }
    }
    toRemove.forEach((o) => o.remove());

    // Add fresh sorted school list.
    const sorted = [...state.schools].sort((a, b) => a.localeCompare(b));
    for (const school of sorted) {
      const opt = document.createElement("option");
      opt.value = school;
      opt.textContent = school;
      els.schoolSel.appendChild(opt);
    }

    // Restore selection if still valid.
    const optionStillExists = Array.from(els.schoolSel.options).some((o) => o.value === currentValue);
    els.schoolSel.value = optionStillExists ? currentValue : "";
  }

  function renderError(err) {
    state.isFirstLoad = false;
    els.grid.innerHTML = `
      <div class="aq-list__empty">
        <h3 class="aq-list__empty-title">${strings.kidsList.errorTitle}</h3>
        <p class="aq-list__empty-body">${escapeHtml(err.message || strings.errors.unexpected)}</p>
      </div>
    `;
    els.count.textContent = "";
    showToast(strings.errors.kidsListLoadFailed, "error");
  }

  function collectAllKids() {
    // Concatenate pages in pageIndex order.
    const keys = [...state.pages.keys()].sort((a, b) => a - b);
    const out = [];
    for (const k of keys) out.push(...state.pages.get(k));
    return out;
  }

  // ── Cleanup ────────────────────────────────────────────────────────────
  return function cleanup() {
    if (state.searchDebounceTimer) clearTimeout(state.searchDebounceTimer);
    if (subscription) subscription.unsubscribeAll();

    els.register.removeEventListener("click", handleRegister);
    els.search.removeEventListener("input", handleSearchInput);
    els.schoolSel.removeEventListener("change", handleSchoolChange);
    els.sortSel.removeEventListener("change", handleSortChange);
    if (els.showDelChk) els.showDelChk.removeEventListener("change", handleShowDelChange);
    els.statusBtns.forEach((btn) => btn.removeEventListener("click", handleStatusClick));
    els.grid.removeEventListener("click", handleGridClick);
    window.removeEventListener("hashchange", handleHashChange);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter URL serialization
// ─────────────────────────────────────────────────────────────────────────────

export function defaultFilters() {
  return {
    searchPrefix: "",
    statusFilter: "active",
    schoolFilter: null,
    schoolTypeFilter: null,
    showDeleted: false,
    sort: "name"
  };
}

function filtersAreDefault(f) {
  return filtersEqual(f, defaultFilters());
}

function filtersEqual(a, b) {
  return a.searchPrefix === b.searchPrefix
      && a.statusFilter === b.statusFilter
      && a.schoolFilter === b.schoolFilter
      && a.schoolTypeFilter === b.schoolTypeFilter
      && a.showDeleted === b.showDeleted
      && a.sort === b.sort;
}

/**
 * Parse filters out of window.location.hash. The hash format is:
 *   #/kids?q=khoury&status=blocked&school=AIS&sort=newest&showDeleted=1
 * Unknown keys are ignored. Missing keys fall back to defaults.
 */
function parseFiltersFromHash() {
  const f = defaultFilters();
  const hash = window.location.hash || "";
  const qIdx = hash.indexOf("?");
  if (qIdx === -1) return f;

  const params = new URLSearchParams(hash.slice(qIdx + 1));

  if (params.has("q"))           f.searchPrefix     = normalizeSearch(params.get("q") || "");
  if (params.has("status"))      f.statusFilter     = ["all", "active", "blocked"].includes(params.get("status")) ? params.get("status") : "active";
  if (params.has("school"))      f.schoolFilter     = params.get("school") || null;
  if (params.has("schoolType"))  f.schoolTypeFilter = params.get("schoolType") === "out_of_country" ? "out_of_country" : null;
  if (params.has("sort"))        f.sort             = ["name", "newest", "oldest"].includes(params.get("sort")) ? params.get("sort") : "name";
  if (params.has("showDeleted")) f.showDeleted      = params.get("showDeleted") === "1";

  return f;
}

/**
 * Write filter state into the hash. Only non-default values are serialized,
 * keeping the default URL clean (`#/kids` with no query string).
 */
function writeFiltersToHash(filters) {
  const def = defaultFilters();
  const params = new URLSearchParams();

  if (filters.searchPrefix && filters.searchPrefix !== def.searchPrefix)
    params.set("q", filters.searchPrefix);
  if (filters.statusFilter !== def.statusFilter)
    params.set("status", filters.statusFilter);
  if (filters.schoolFilter)
    params.set("school", filters.schoolFilter);
  if (filters.schoolTypeFilter)
    params.set("schoolType", filters.schoolTypeFilter);
  if (filters.sort !== def.sort)
    params.set("sort", filters.sort);
  if (filters.showDeleted)
    params.set("showDeleted", "1");

  const qs = params.toString();
  const newHash = qs ? `#/kids?${qs}` : "#/kids";

  // history.replaceState avoids polluting browser history with every keystroke.
  // (The list is one logical "page" — filter changes shouldn't add Back-button entries.)
  if (window.location.hash !== newHash) {
    history.replaceState(null, "", newHash);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeSearch(raw) {
  return String(raw || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function computeInitials(first, last) {
  const a = (first || "").trim().charAt(0).toUpperCase();
  const b = (last  || "").trim().charAt(0).toUpperCase();
  return (a + b) || "?";
}

/**
 * Format age from a Firestore Timestamp (DateOfBirth field). Returns:
 *   "X years" for 2+ years
 *   "1 year"  for exactly 1 year
 *   "X months" for under 1 year (rare — would be a registration error
 *               since min DOB is 1 year ago, but we handle it defensively)
 */
function formatAge(dobTimestamp) {
  if (!dobTimestamp || !dobTimestamp.toDate) return "";
  const dob = dobTimestamp.toDate();
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  // Adjust if birthday hasn't happened yet this year.
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    years--;
  }
  if (years >= 2) return strings.kids.profile.ageYears.replace("{years}", String(years));
  if (years === 1) return strings.kids.profile.ageOneYear;
  // Under a year — fallback (shouldn't happen with current validation).
  return strings.kids.profile.ageOneYear;
}

function describeFilterVerb(f) {
  if (f.statusFilter === "blocked") return strings.kidsList.verbBlocked;
  if (f.statusFilter === "all")     return strings.kidsList.verbAll;
  return strings.kidsList.verbActive;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(str) {
  return escapeHtml(str);
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
    .aq-list {
      width: 100%;
      max-width: 1100px;
    }

    .aq-list__header {
      margin-bottom: 20px;
    }

    .aq-list__title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 4px;
    }

    .aq-list__title {
      margin: 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 24px;
      font-weight: 700;
      color: var(--ink, #0f172a);
      letter-spacing: -0.02em;
    }

    .aq-list__count {
      margin: 0;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      color: var(--mute, #64748b);
    }

    .aq-button--primary {
      padding: 9px 16px;
      border-radius: 8px;
      background: var(--accent, #0ea5e9);
      color: white;
      border: none;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 120ms ease;
    }

    .aq-button--primary:hover:not(:disabled) {
      background: #0284c7;
    }

    .aq-list__filters {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 20px;
    }

    .aq-list__search {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 10px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      color: var(--ink, #0f172a);
      background: var(--card, #ffffff);
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    .aq-list__search:focus {
      outline: none;
      border-color: var(--accent, #0ea5e9);
      box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
    }

    .aq-list__filter-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
    }

    .aq-segmented {
      display: inline-flex;
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 8px;
      overflow: hidden;
      background: var(--card, #ffffff);
    }

    .aq-segmented__btn {
      padding: 7px 12px;
      background: transparent;
      border: none;
      border-right: 1px solid var(--line, #e2e8f0);
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      color: var(--ink-2, #334155);
      cursor: pointer;
      transition: background-color 120ms ease, color 120ms ease;
    }
    .aq-segmented__btn:last-child { border-right: none; }
    .aq-segmented__btn:hover { background: var(--bg, #f8fafc); }
    .aq-segmented__btn--active {
      background: var(--accent, #0ea5e9);
      color: white;
    }
    .aq-segmented__btn--active:hover { background: #0284c7; }

    .aq-select {
      padding: 7px 28px 7px 12px;
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 8px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      color: var(--ink-2, #334155);
      background: var(--card, #ffffff);
      cursor: pointer;
    }

    .aq-checkbox {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      color: var(--ink-2, #334155);
      cursor: pointer;
      user-select: none;
    }

    .aq-list__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }

    .aq-kid-card {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 18px 12px 14px;
      background: var(--card, #ffffff);
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 12px;
      cursor: pointer;
      text-align: center;
      transition: border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
      font-family: inherit;
    }
    .aq-kid-card:hover {
      border-color: var(--accent, #0ea5e9);
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
      transform: translateY(-1px);
    }
    .aq-kid-card:focus-visible {
      outline: 3px solid rgba(14, 165, 233, 0.35);
      outline-offset: 2px;
    }

    .aq-card__photo {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      object-fit: cover;
      background: var(--bg, #f8fafc);
    }

    .aq-card__photo--initials {
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 24px;
      font-weight: 600;
      color: var(--mute, #64748b);
      background: var(--bg, #f8fafc);
      border: 1px solid var(--line, #e2e8f0);
    }

    .aq-card__name {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 14px;
      font-weight: 600;
      color: var(--ink, #0f172a);
      line-height: 1.3;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .aq-card__age {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      color: var(--mute, #64748b);
    }

    .aq-badge {
      position: absolute;
      top: 8px;
      right: 8px;
      padding: 2px 7px;
      border-radius: 4px;
      font-family: 'DM Mono', ui-monospace, monospace;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: white;
    }
    .aq-badge--danger { background: var(--danger, #ef4444); }
    .aq-badge--muted  { background: var(--mute,   #64748b); }

    .aq-list__loading,
    .aq-list__empty {
      grid-column: 1 / -1;
      padding: 40px 20px;
      text-align: center;
      color: var(--ink-2, #334155);
      font-family: 'DM Sans', system-ui, sans-serif;
    }
    .aq-list__empty-title {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--ink, #0f172a);
    }
    .aq-list__empty-body {
      margin: 0 0 16px 0;
      font-size: 14px;
      color: var(--ink-2, #334155);
    }

    .aq-list__footer {
      display: flex;
      justify-content: center;
      margin-top: 24px;
    }
  `;
  document.head.appendChild(style);
}