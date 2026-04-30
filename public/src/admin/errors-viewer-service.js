// public/src/admin/errors-viewer-service.js
//
// Data layer for the SuperAdmin errors viewer (§39.15). Owns the read path
// for /tenants/{tid}/errors. The writer is errors-service.js (§39.8) — that
// hasn't moved.
//
// Public API:
//   listErrors({ source, sinceMillis, before, pageSize }) ->
//     Promise<{ ok, items, lastSnap } | { ok:false, errorKey }>
//
// Pagination model: cursor-based via lastSnap. Caller passes `before` (a
// DocumentSnapshot) to fetch the next page. No "jump to page N" — newest-
// first paginated table only.
//
// Filter parameters:
//   source:      "frontend" | "cloud_function" | "all"   (default "all")
//   sinceMillis: epoch milliseconds, or null for no lower bound
//   before:      DocumentSnapshot from prior page, or null for first page
//   pageSize:    integer, default 25, capped at 100
//
// Sort: orderBy(Timestamp, "desc") — newest first.

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import { db } from "../firebase-init.js";
import { TENANT_ID } from "../config.js";
import { logError } from "../services/errors-service.js";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export async function listErrors({ source, sinceMillis, before, pageSize } = {}) {
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize || DEFAULT_PAGE_SIZE));

  try {
    const errorsCol = collection(db, "tenants", TENANT_ID, "errors");
    const constraints = [];

    if (source && source !== "all") {
      constraints.push(where("Source", "==", source));
    }

    if (sinceMillis && Number.isFinite(sinceMillis)) {
      constraints.push(where("Timestamp", ">=", Timestamp.fromMillis(sinceMillis)));
    }

    constraints.push(orderBy("Timestamp", "desc"));

    if (before) {
      constraints.push(startAfter(before));
    }

    constraints.push(limit(size));

    const q = query(errorsCol, ...constraints);
    const snap = await getDocs(q);

    const items = [];
    snap.forEach((d) => {
      const data = d.data();
      items.push({
        id: d.id,
        Timestamp: data.Timestamp || null,
        Source: data.Source || "(unknown)",
        Page: data.Page || "(unknown)",
        UserID: data.UserID || null,
        Action: data.Action || "(unknown)",
        Message: data.Message || "",
        Stack: data.Stack || "",
        Context: data.Context || ""
      });
    });

    const lastSnap = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;

    return { ok: true, items, lastSnap };
  } catch (err) {
    // Don't infinite-loop: if the errors viewer's own query fails, log
    // the failure but make sure the caller gets a clear errorKey.
    await logError({
      source: "frontend",
      page: "admin/errors",
      action: "listErrors",
      error: err,
      context: { source, sinceMillis }
    });
    return { ok: false, errorKey: "errorsListLoadFailed" };
  }
}