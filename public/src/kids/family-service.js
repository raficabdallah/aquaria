// public/src/kids/family-service.js
//
// Family / sibling linking. Per §9.7 of the master prompt, two kids are
// "siblings" when they share a FamilyID. This service owns the read and
// write paths for that field.
//
// Public API:
//   getSiblings(kidId)                   -> Promise<{ ok, siblings } | { ok:false, errorKey }>
//   linkSibling(kidIdA, kidIdB, profile) -> Promise<{ ok, familyId } | { ok:false, errorKey }>
//   unlinkSibling(kidId, profile)        -> Promise<{ ok } | { ok:false, errorKey }>
//   searchKidsByName(prefix, excludeIds) -> Promise<{ ok, results } | { ok:false, errorKey }>
//
// Field-set discipline (per §39.13 design): linkSibling and unlinkSibling
// touch ONLY FamilyID + UpdatedAt + UpdatedBy. Disjoint from updateKid's
// editable text fields, blockKid's status fields, etc.
//
// Linking semantics:
//   - If neither kid has a FamilyID: a new FamilyID is generated and assigned to both.
//   - If exactly one kid has a FamilyID: the other kid joins that family.
//   - If both kids have the SAME FamilyID: no-op (already linked).
//   - If both kids have DIFFERENT FamilyIDs: REJECTED. Merging two existing
//     families is dangerous (could affect 4+ kids silently). The user must
//     unlink one side first. Surfaces errorKey "siblingFamiliesConflict".

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  startAt,
  endAt,
  limit,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import { db } from "../firebase-init.js";
import { TENANT_ID } from "../config.js";
import { logError } from "../services/errors-service.js";
import { buildSearchKey } from "./kids-service.js";

// ─────────────────────────────────────────────────────────────────────────────
// getSiblings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all kids who share the given kid's FamilyID, EXCLUDING the kid itself.
 * Returns an empty array if the kid has no FamilyID or has no siblings.
 */
export async function getSiblings(kidId) {
  if (!kidId || typeof kidId !== "string") {
    return { ok: false, errorKey: "kidIdMissing" };
  }

  try {
    const kidRef = doc(db, "tenants", TENANT_ID, "kids", kidId);
    const snap = await getDoc(kidRef);
    if (!snap.exists()) {
      return { ok: false, errorKey: "kidNotFound" };
    }
    const data = snap.data();
    const familyId = data.FamilyID;
    if (!familyId) {
      return { ok: true, siblings: [] };
    }

    const kidsCol = collection(db, "tenants", TENANT_ID, "kids");
    const q = query(
      kidsCol,
      where("FamilyID", "==", familyId),
      where("Deleted", "==", false)
    );
    const results = await getDocs(q);

    const siblings = [];
    results.forEach((d) => {
      if (d.id === kidId) return;  // exclude self
      const sd = d.data();
      siblings.push({
        KidID: d.id,
        FullName: sd.FullName || `${sd.FirstName || ""} ${sd.LastName || ""}`.trim(),
        PhotoThumbnailURL: sd.PhotoThumbnailURL || null,
        Status: sd.Status || "Active",
        Deleted: sd.Deleted === true
      });
    });

    siblings.sort((a, b) => a.FullName.localeCompare(b.FullName));

    return { ok: true, siblings };
  } catch (err) {
    await logError({
      source: "frontend",
      page: "kids/profile",
      action: "getSiblings",
      error: err,
      context: { kidId }
    });
    return { ok: false, errorKey: "siblingsReadFailed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// linkSibling
// ─────────────────────────────────────────────────────────────────────────────

export async function linkSibling(kidIdA, kidIdB, profile) {
  if (!profile || !profile.uid) {
    return { ok: false, errorKey: "notSignedIn" };
  }
  if (!kidIdA || !kidIdB || typeof kidIdA !== "string" || typeof kidIdB !== "string") {
    return { ok: false, errorKey: "kidIdMissing" };
  }
  if (kidIdA === kidIdB) {
    return { ok: false, errorKey: "siblingSameKid" };
  }

  const refA = doc(db, "tenants", TENANT_ID, "kids", kidIdA);
  const refB = doc(db, "tenants", TENANT_ID, "kids", kidIdB);

  try {
    const familyId = await runTransaction(db, async (tx) => {
      const [snapA, snapB] = await Promise.all([tx.get(refA), tx.get(refB)]);
      if (!snapA.exists() || !snapB.exists()) {
        throw new Error("kidNotFound");
      }
      const a = snapA.data();
      const b = snapB.data();
      if (a.Deleted === true || b.Deleted === true) {
        throw new Error("kidNotFound");
      }

      const famA = a.FamilyID || null;
      const famB = b.FamilyID || null;

      if (famA && famB && famA === famB) {
        return famA;
      }
      if (famA && famB && famA !== famB) {
        throw new Error("siblingFamiliesConflict");
      }

      const sharedId = famA || famB || generateFamilyId();

      const auditPatch = {
        FamilyID: sharedId,
        UpdatedAt: serverTimestamp(),
        UpdatedBy: profile.uid
      };

      if (famA !== sharedId) tx.update(refA, auditPatch);
      if (famB !== sharedId) tx.update(refB, auditPatch);

      return sharedId;
    });

    return { ok: true, familyId };
  } catch (err) {
    if (err.message === "kidNotFound") {
      return { ok: false, errorKey: "kidNotFound" };
    }
    if (err.message === "siblingFamiliesConflict") {
      return { ok: false, errorKey: "siblingFamiliesConflict" };
    }
    await logError({
      source: "frontend",
      page: "kids/profile",
      action: "linkSibling",
      error: err,
      context: { kidIdA, kidIdB }
    });
    return { ok: false, errorKey: "siblingLinkFailed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// unlinkSibling
// ─────────────────────────────────────────────────────────────────────────────

export async function unlinkSibling(kidId, profile) {
  if (!profile || !profile.uid) {
    return { ok: false, errorKey: "notSignedIn" };
  }
  if (!kidId || typeof kidId !== "string") {
    return { ok: false, errorKey: "kidIdMissing" };
  }

  const kidRef = doc(db, "tenants", TENANT_ID, "kids", kidId);

  try {
    const snap = await getDoc(kidRef);
    if (!snap.exists()) {
      return { ok: false, errorKey: "kidNotFound" };
    }
    const familyId = snap.data().FamilyID;
    if (!familyId) {
      return { ok: false, errorKey: "siblingNotLinked" };
    }

    const kidsCol = collection(db, "tenants", TENANT_ID, "kids");
    const famQuery = query(
      kidsCol,
      where("FamilyID", "==", familyId),
      where("Deleted", "==", false)
    );
    const famSnap = await getDocs(famQuery);
    const otherIds = [];
    famSnap.forEach((d) => {
      if (d.id !== kidId) otherIds.push(d.id);
    });

    // If detaching this kid would leave exactly one other in the family,
    // detach that one too — a family of one isn't a family.
    const idsToDetach = otherIds.length === 1 ? [kidId, otherIds[0]] : [kidId];

    await runTransaction(db, async (tx) => {
      const refs = idsToDetach.map((id) => doc(db, "tenants", TENANT_ID, "kids", id));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      snaps.forEach((s, i) => {
        if (!s.exists() || s.data().Deleted === true) return;
        tx.update(refs[i], {
          FamilyID: null,
          UpdatedAt: serverTimestamp(),
          UpdatedBy: profile.uid
        });
      });
    });

    return { ok: true };
  } catch (err) {
    await logError({
      source: "frontend",
      page: "kids/profile",
      action: "unlinkSibling",
      error: err,
      context: { kidId }
    });
    return { ok: false, errorKey: "siblingUnlinkFailed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// searchKidsByName
// ─────────────────────────────────────────────────────────────────────────────

export async function searchKidsByName(prefix, excludeIds) {
  const exclude = new Set(Array.isArray(excludeIds) ? excludeIds : []);
  const normalized = buildSearchKey(prefix || "", "");
  const trimmed = normalized.trim();

  try {
    const kidsCol = collection(db, "tenants", TENANT_ID, "kids");

    let q;
    if (trimmed.length === 0) {
      q = query(
        kidsCol,
        where("Deleted", "==", false),
        orderBy("SearchKey"),
        limit(20)
      );
    } else {
      q = query(
        kidsCol,
        where("Deleted", "==", false),
        orderBy("SearchKey"),
        startAt(trimmed),
        endAt(trimmed + "\uf8ff"),
        limit(20)
      );
    }

    const snap = await getDocs(q);
    const results = [];
    snap.forEach((d) => {
      if (exclude.has(d.id)) return;
      const data = d.data();
      results.push({
        KidID: d.id,
        FullName: data.FullName || `${data.FirstName || ""} ${data.LastName || ""}`.trim(),
        PhotoThumbnailURL: data.PhotoThumbnailURL || null,
        FamilyID: data.FamilyID || null,
        Grade: data.Grade || ""
      });
    });

    return { ok: true, results };
  } catch (err) {
    await logError({
      source: "frontend",
      page: "kids/profile",
      action: "searchKidsByName",
      error: err,
      context: { prefix }
    });
    return { ok: false, errorKey: "siblingsReadFailed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateFamilyId() {
  return `fam_${Math.random().toString(36).slice(2, 12)}`;
}