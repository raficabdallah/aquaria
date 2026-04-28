// public/src/kids/kids-list-service.js
//
// Real-time data layer for the kids list page. The list-view module subscribes
// here; it never builds Firestore queries directly.
//
// Why a listener instead of one-shot fetch (per master prompt §3): the kids
// list is an OPERATIONAL view, not a report. Staff stay on it through the day
// across two tablets. When a kid is registered or blocked on Tablet A, Tablet
// B's open list should update without a manual refresh.
//
// The listener is scoped to ONE page (50 kids by default). Pagination uses
// Firestore's startAfter() cursor model. When the user clicks "Load 50 more"
// the existing listener stays attached; we attach a SECOND listener for the
// next page that appends to the in-memory list. When filters change, ALL
// listeners detach and a fresh first-page listener attaches.
//
// Public API:
//   subscribeToKidsList(filters, callbacks) -> { unsubscribeAll, loadMore, getState }
//
// filters shape:
//   {
//     searchPrefix: string,         // lowercased prefix (already normalized)
//     statusFilter: "all" | "active" | "blocked",
//     schoolFilter: string | null,  // exact School value, or null for any
//     schoolTypeFilter: "out_of_country" | null,  // null = any
//     showDeleted: boolean,         // SuperAdmin only — UI must enforce
//     sort: "name" | "newest" | "oldest"
//   }
//
// callbacks shape:
//   {
//     onPage(page) — called when each page's data arrives or updates.
//                    page = { pageIndex, kids: [...], firstSnap, lastSnap }
//                    kids array contains plain objects with KidID + all fields.
//     onError(err) — listener-level error (permission denied, missing index)
//   }
//
// The returned object:
//   unsubscribeAll() — detach every active listener. MUST be called on view
//                      teardown to prevent memory leaks and orphan listeners.
//   loadMore() — attach a new listener for the next page, after the last
//                document of the current final page. Returns boolean (true if
//                a new listener was attached, false if we're already loading
//                or there's no last-snap to anchor from).
//   getState() — debug-only inspection of how many pages are attached.

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAt,
  endAt,
  startAfter,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import { db } from "../firebase-init.js";
import { TENANT_ID } from "../config.js";

const PAGE_SIZE = 50;

// ─────────────────────────────────────────────────────────────────────────────
// subscribeToKidsList
// ─────────────────────────────────────────────────────────────────────────────

export function subscribeToKidsList(filters, callbacks) {
  // Each entry tracks one paginated listener:
  //   { pageIndex, unsubscribe, lastSnap, firstSnap }
  // We keep them in order so loadMore() always anchors off the LAST page's
  // lastSnap, and unsubscribeAll() can detach them all.
  const pages = [];
  let isLoadingMore = false;

  // Attach the first page's listener.
  attachPage(0, null);

  function attachPage(pageIndex, anchorSnap) {
    const q = buildQuery(filters, anchorSnap);

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const kids = snap.docs.map(docToKid);

        // Update or insert this page's record.
        const existing = pages.find((p) => p.pageIndex === pageIndex);
        if (existing) {
          existing.lastSnap  = snap.docs[snap.docs.length - 1] || null;
          existing.firstSnap = snap.docs[0] || null;
        } else {
          pages.push({
            pageIndex,
            unsubscribe,
            lastSnap:  snap.docs[snap.docs.length - 1] || null,
            firstSnap: snap.docs[0] || null
          });
          // Keep pages sorted by index so loadMore anchors correctly.
          pages.sort((a, b) => a.pageIndex - b.pageIndex);
        }

        callbacks.onPage({
          pageIndex,
          kids,
          firstSnap: snap.docs[0] || null,
          lastSnap:  snap.docs[snap.docs.length - 1] || null,
          isLastPageReached: snap.docs.length < PAGE_SIZE
        });

        // If we just attached this page, clear the loading flag so the
        // user can request another page next.
        if (isLoadingMore && pageIndex === Math.max(...pages.map((p) => p.pageIndex))) {
          isLoadingMore = false;
        }
      },
      (err) => {
        // Common case here: missing composite index. Firestore puts the
        // creation URL in err.message. We surface to the UI which will
        // log it via errors-service.
        callbacks.onError(err);
        if (isLoadingMore) isLoadingMore = false;
      }
    );

    // For the very first page we need to record the unsubscribe immediately,
    // even before the first snapshot arrives, so unsubscribeAll() during a
    // fast nav-away still cleans up correctly.
    if (!pages.find((p) => p.pageIndex === pageIndex)) {
      pages.push({
        pageIndex,
        unsubscribe,
        lastSnap: null,
        firstSnap: null
      });
      pages.sort((a, b) => a.pageIndex - b.pageIndex);
    }
  }

  function loadMore() {
    if (isLoadingMore) return false;

    const last = pages[pages.length - 1];
    if (!last || !last.lastSnap) return false;

    isLoadingMore = true;
    attachPage(last.pageIndex + 1, last.lastSnap);
    return true;
  }

  function unsubscribeAll() {
    for (const p of pages) {
      try { p.unsubscribe(); } catch (_) { /* swallow — listener already gone */ }
    }
    pages.length = 0;
  }

  function getState() {
    return {
      pageCount: pages.length,
      pageIndices: pages.map((p) => p.pageIndex)
    };
  }

  return { unsubscribeAll, loadMore, getState };
}

// ─────────────────────────────────────────────────────────────────────────────
// Query construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a Firestore Query for the given filters and optional pagination anchor.
 *
 * Decisions:
 * - Status filter "all" omits the where clause, "active"/"blocked" adds one.
 * - Deleted filter: when showDeleted=false (default), we always add
 *   where("Deleted", "==", false). When showDeleted=true, we omit it.
 * - SchoolFilter and SchoolTypeFilter add equality where clauses.
 * - Search prefix uses orderBy("SearchKey") + startAt(prefix) + endAt(prefix + "\uf8ff").
 *   That last char is the highest Unicode code point in the BMP — matches anything
 *   that begins with the prefix. Standard Firestore prefix-search trick.
 * - When searchPrefix is set, sort is FORCED to "name" (alphabetical by SearchKey),
 *   because Firestore requires the orderBy field to match the range field.
 *   The UI must hide the sort dropdown when a search is active, OR ignore it.
 *   We enforce here so the data layer is correct regardless of UI state.
 * - When searchPrefix is empty, sort dictates orderBy:
 *     name   -> orderBy("SearchKey", "asc")
 *     newest -> orderBy("CreatedAt", "desc")
 *     oldest -> orderBy("CreatedAt", "asc")
 */
function buildQuery(filters, anchorSnap) {
  const kidsCol = collection(db, "tenants", TENANT_ID, "kids");
  const constraints = [];

  // Soft-delete filter (default: hide deleted). When showDeleted is on, we
  // still need to skip deleted=false explicitly to include both. Firestore
  // can't query "either true or false" without an `in` clause, but since
  // every doc has Deleted as a boolean, omitting the clause naturally
  // returns both values.
  if (!filters.showDeleted) {
    constraints.push(where("Deleted", "==", false));
  }

  // Status filter
  if (filters.statusFilter === "active") {
    constraints.push(where("Status", "==", "Active"));
  } else if (filters.statusFilter === "blocked") {
    constraints.push(where("Status", "==", "Blocked"));
  }

  // School filter (exact match)
  if (filters.schoolFilter) {
    constraints.push(where("School", "==", filters.schoolFilter));
  }

  // SchoolType filter (currently only "out_of_country" surfaces in the UI)
  if (filters.schoolTypeFilter) {
    constraints.push(where("SchoolType", "==", filters.schoolTypeFilter));
  }

  // Search prefix vs. sort: mutually exclusive ordering field.
  const hasSearch = !!(filters.searchPrefix && filters.searchPrefix.length > 0);

  if (hasSearch) {
    constraints.push(orderBy("SearchKey", "asc"));
    constraints.push(startAt(filters.searchPrefix));
    constraints.push(endAt(filters.searchPrefix + "\uf8ff"));
  } else {
    if (filters.sort === "newest") {
      constraints.push(orderBy("CreatedAt", "desc"));
    } else if (filters.sort === "oldest") {
      constraints.push(orderBy("CreatedAt", "asc"));
    } else {
      // default + "name"
      constraints.push(orderBy("SearchKey", "asc"));
    }
  }

  // Pagination anchor — must come AFTER orderBy clauses.
  if (anchorSnap) {
    constraints.push(startAfter(anchorSnap));
  }

  constraints.push(limit(PAGE_SIZE));

  return query(kidsCol, ...constraints);
}

// ─────────────────────────────────────────────────────────────────────────────
// Document mapping
// ─────────────────────────────────────────────────────────────────────────────

function docToKid(snap) {
  const data = snap.data();
  return {
    KidID: snap.id,
    ...data
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants exported for the view layer
// ─────────────────────────────────────────────────────────────────────────────

export const KIDS_PAGE_SIZE = PAGE_SIZE;