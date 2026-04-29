// public/src/kids/kids-service.js
//
// The kids module's gateway. UI files (register-view, edit-view, profile-view,
// kids-list-view) call in here; they never touch Firestore or Storage directly.
//
// Public API:
//   createKid(formData, profile)        -> Promise<{ ok, kidId } | { ok:false, errorKey }>
//   updateKid(kidId, formData, profile) -> Promise<{ ok } | { ok:false, errorKey }>
//   getKid(kidId)                       -> Promise<{ ok, kid } | { ok:false, errorKey }>
//   buildSearchKey(firstName, lastName) -> string
//
//   §39.13 destructive actions:
//   blockKid(kidId, { reason, permanent }, profile)
//   unblockKid(kidId, profile)
//   softDeleteKid(kidId, profile)
//   restoreKid(kidId, profile)
//   replaceKidPhoto(kidId, photoFile, profile)
//   removeKidPhoto(kidId, profile)
//
// Field-set discipline (per §39.13 design):
//   updateKid       -> editable text fields + Updated*
//   blockKid        -> Status + PermanentBlock + BlockHistory + Updated*
//   unblockKid      -> Status + PermanentBlock + BlockHistory (last entry's
//                       UnblockedAt+UnblockedBy) + Updated*
//   softDeleteKid   -> Deleted + DeletedAt + DeletedBy
//   restoreKid      -> Deleted + DeletedAt + DeletedBy + Updated*
//   replaceKidPhoto -> Photo* fields + Updated*
//   removeKidPhoto  -> Photo* fields + Updated*
//
// These field sets are deliberately disjoint so concurrent writes from
// different actors (e.g. one admin editing text fields, another blocking
// the kid) don't corrupt each other.

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  serverTimestamp,
  Timestamp,
  runTransaction,
  deleteField
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

import { app, db } from "../firebase-init.js";
import { TENANT_ID } from "../config.js";
import { resizePhoto } from "./photo-resize.js";
import { logError } from "../services/errors-service.js";

const storage = getStorage(app);

// ─────────────────────────────────────────────────────────────────────────────
// createKid (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export async function createKid(formData, profile) {
  if (!profile || !profile.uid) {
    return { ok: false, errorKey: "notSignedIn" };
  }

  const kidsCol = collection(db, "tenants", TENANT_ID, "kids");
  const kidRef  = doc(kidsCol);
  const kidId   = kidRef.id;

  const firstName = formData.firstName.trim();
  const lastName  = formData.lastName.trim();
  const fullName  = `${firstName} ${lastName}`.trim();
  const searchKey = buildSearchKey(firstName, lastName);

  const doc1 = {
    FirstName: firstName,
    LastName: lastName,
    FullName: fullName,
    SearchKey: searchKey,
    DateOfBirth: Timestamp.fromDate(formData.dateOfBirth),
    Gender: formData.gender,

    SchoolType: formData.schoolType,
    School: (formData.school || "").trim(),
    Grade: (formData.grade || "").trim(),

    ParentName: formData.parentName.trim(),
    Phone: formData.phone,
    EmergencyContact: (formData.emergencyContact || "").trim(),

    City: formData.city.trim(),
    Address: (formData.address || "").trim(),

    Notes: (formData.notes || "").trim(),

    Status: "Active",
    PermanentBlock: false,
    BlockHistory: [],

    LoyaltyPoints: 0,
    LoyaltyLevel: "Bronze",
    TotalVisits: 0,
    VisitsThisMonth: 0,
    LastVisit: null,
    StreakDays: 0,

    FamilyID: null,
    DisplayOnPublicScreen: "first_only",

    TenantID: TENANT_ID,
    CreatedAt: serverTimestamp(),
    UpdatedAt: serverTimestamp(),
    CreatedBy: profile.uid,
    UpdatedBy: profile.uid,
    Deleted: false,
    DeletedAt: null,
    DeletedBy: null
  };

  try {
    await setDoc(kidRef, doc1);
  } catch (err) {
    await logError({
      source: "frontend",
      page: "kids/new",
      action: "createKid:setDoc",
      error: err,
      context: { kidId, firstName, lastName }
    });
    return { ok: false, errorKey: "kidWriteFailed" };
  }

  if (formData.photoFile) {
    try {
      const { main, thumb } = await resizePhoto(formData.photoFile);

      const mainPath  = `tenants/${TENANT_ID}/kids/${kidId}/photo.jpg`;
      const thumbPath = `tenants/${TENANT_ID}/kids/${kidId}/photo_thumb.jpg`;

      const mainRef  = storageRef(storage, mainPath);
      const thumbRef = storageRef(storage, thumbPath);

      await Promise.all([
        uploadBytes(mainRef,  main,  { contentType: "image/jpeg" }),
        uploadBytes(thumbRef, thumb, { contentType: "image/jpeg" })
      ]);

      const [photoURL, thumbURL] = await Promise.all([
        getDownloadURL(mainRef),
        getDownloadURL(thumbRef)
      ]);

      await updateDoc(kidRef, {
        PhotoURL: photoURL,
        PhotoStoragePath: mainPath,
        PhotoThumbnailURL: thumbURL,
        UpdatedAt: serverTimestamp(),
        UpdatedBy: profile.uid
      });
    } catch (err) {
      await logError({
        source: "frontend",
        page: "kids/new",
        action: "createKid:photoUpload",
        error: err,
        context: { kidId }
      });
      return { ok: true, kidId, photoUploadFailed: true };
    }
  }

  return { ok: true, kidId };
}

// ─────────────────────────────────────────────────────────────────────────────
// updateKid (unchanged from §39.12)
// ─────────────────────────────────────────────────────────────────────────────

export async function updateKid(kidId, formData, profile) {
  if (!profile || !profile.uid) {
    return { ok: false, errorKey: "notSignedIn" };
  }
  if (!kidId || typeof kidId !== "string") {
    return { ok: false, errorKey: "kidIdMissing" };
  }

  const firstName = formData.firstName.trim();
  const lastName  = formData.lastName.trim();
  const fullName  = `${firstName} ${lastName}`.trim();
  const searchKey = buildSearchKey(firstName, lastName);

  const update = {
    FirstName: firstName,
    LastName: lastName,
    FullName: fullName,
    SearchKey: searchKey,
    DateOfBirth: Timestamp.fromDate(formData.dateOfBirth),
    Gender: formData.gender,

    SchoolType: formData.schoolType,
    School: (formData.school || "").trim(),
    Grade: (formData.grade || "").trim(),

    ParentName: formData.parentName.trim(),
    Phone: formData.phone,
    EmergencyContact: (formData.emergencyContact || "").trim(),

    City: formData.city.trim(),
    Address: (formData.address || "").trim(),

    Notes: (formData.notes || "").trim(),

    UpdatedAt: serverTimestamp(),
    UpdatedBy: profile.uid
  };

  try {
    const kidRef = doc(db, "tenants", TENANT_ID, "kids", kidId);
    await updateDoc(kidRef, update);
    return { ok: true };
  } catch (err) {
    await logError({
      source: "frontend",
      page: "kids/edit",
      action: "updateKid:updateDoc",
      error: err,
      context: { kidId }
    });
    return { ok: false, errorKey: "kidWriteFailed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// blockKid (NEW in §39.13)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Block a kid. Sets Status="Blocked", appends a new BlockHistory entry.
 *
 * @param {string} kidId
 * @param {Object} args      { reason: string (required, 1-500), permanent: boolean }
 * @param {Object} profile
 * @returns {Promise<{ ok } | { ok:false, errorKey }>}
 */
export async function blockKid(kidId, args, profile) {
  if (!profile || !profile.uid) {
    return { ok: false, errorKey: "notSignedIn" };
  }
  if (!kidId || typeof kidId !== "string") {
    return { ok: false, errorKey: "kidIdMissing" };
  }
  const reason = String(args?.reason || "").trim();
  if (reason.length === 0) {
    return { ok: false, errorKey: "blockReasonRequired" };
  }
  if (reason.length > 500) {
    return { ok: false, errorKey: "blockReasonTooLong" };
  }
  const permanent = !!args?.permanent;

  // Read-modify-write the BlockHistory array. We use a transaction so a
  // concurrent block from another admin can't corrupt the array.
  try {
    const kidRef = doc(db, "tenants", TENANT_ID, "kids", kidId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(kidRef);
      if (!snap.exists()) throw new Error("kidNotFound");
      const data = snap.data();
      if (data.Deleted === true) throw new Error("kidNotFound");

      const history = Array.isArray(data.BlockHistory) ? [...data.BlockHistory] : [];
      // Append. We use Timestamp.now() instead of serverTimestamp() because
      // serverTimestamp sentinels are not allowed inside arrays.
      history.push({
        BlockedAt: Timestamp.now(),
        BlockedBy: profile.uid,
        Reason: reason,
        Permanent: permanent,
        UnblockedAt: null,
        UnblockedBy: null
      });

      tx.update(kidRef, {
        Status: "Blocked",
        PermanentBlock: permanent,
        BlockHistory: history,
        UpdatedAt: serverTimestamp(),
        UpdatedBy: profile.uid
      });
    });
    return { ok: true };
  } catch (err) {
    if (err.message === "kidNotFound") {
      return { ok: false, errorKey: "kidNotFound" };
    }
    await logError({
      source: "frontend",
      page: "kids/profile",
      action: "blockKid",
      error: err,
      context: { kidId }
    });
    return { ok: false, errorKey: "kidBlockFailed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// unblockKid (NEW in §39.13)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unblock a kid. Sets Status="Active", PermanentBlock=false, and updates
 * the LAST BlockHistory entry's UnblockedAt + UnblockedBy fields.
 *
 * No-op if the kid is already Active. Returns ok in that case.
 */
export async function unblockKid(kidId, profile) {
  if (!profile || !profile.uid) {
    return { ok: false, errorKey: "notSignedIn" };
  }
  if (!kidId || typeof kidId !== "string") {
    return { ok: false, errorKey: "kidIdMissing" };
  }

  try {
    const kidRef = doc(db, "tenants", TENANT_ID, "kids", kidId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(kidRef);
      if (!snap.exists()) throw new Error("kidNotFound");
      const data = snap.data();
      if (data.Deleted === true) throw new Error("kidNotFound");

      // Idempotent: if already Active, just return without changes.
      if (data.Status !== "Blocked") return;

      const history = Array.isArray(data.BlockHistory) ? [...data.BlockHistory] : [];
      // Find the last entry that hasn't yet been unblocked (UnblockedAt null).
      // In normal flow that's the very last entry, but be defensive.
      for (let i = history.length - 1; i >= 0; i--) {
        if (!history[i].UnblockedAt) {
          history[i] = {
            ...history[i],
            UnblockedAt: Timestamp.now(),
            UnblockedBy: profile.uid
          };
          break;
        }
      }

      tx.update(kidRef, {
        Status: "Active",
        PermanentBlock: false,
        BlockHistory: history,
        UpdatedAt: serverTimestamp(),
        UpdatedBy: profile.uid
      });
    });
    return { ok: true };
  } catch (err) {
    if (err.message === "kidNotFound") {
      return { ok: false, errorKey: "kidNotFound" };
    }
    await logError({
      source: "frontend",
      page: "kids/profile",
      action: "unblockKid",
      error: err,
      context: { kidId }
    });
    return { ok: false, errorKey: "kidUnblockFailed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// softDeleteKid (NEW in §39.13)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Soft-delete a kid. The doc is preserved; only the Deleted/DeletedAt/DeletedBy
 * fields change. SuperAdmin only (enforced both in UI and Firestore rules).
 *
 * Photos and storage objects are NOT removed — restore must be possible.
 */
export async function softDeleteKid(kidId, profile) {
  if (!profile || !profile.uid) {
    return { ok: false, errorKey: "notSignedIn" };
  }
  if (!kidId || typeof kidId !== "string") {
    return { ok: false, errorKey: "kidIdMissing" };
  }

  try {
    const kidRef = doc(db, "tenants", TENANT_ID, "kids", kidId);
    await updateDoc(kidRef, {
      Deleted: true,
      DeletedAt: serverTimestamp(),
      DeletedBy: profile.uid
    });
    return { ok: true };
  } catch (err) {
    await logError({
      source: "frontend",
      page: "kids/profile",
      action: "softDeleteKid",
      error: err,
      context: { kidId }
    });
    return { ok: false, errorKey: "kidDeleteFailed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// restoreKid (NEW in §39.13)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Restore a soft-deleted kid. Clears Deleted/DeletedAt/DeletedBy.
 * SuperAdmin only.
 */
export async function restoreKid(kidId, profile) {
  if (!profile || !profile.uid) {
    return { ok: false, errorKey: "notSignedIn" };
  }
  if (!kidId || typeof kidId !== "string") {
    return { ok: false, errorKey: "kidIdMissing" };
  }

  try {
    const kidRef = doc(db, "tenants", TENANT_ID, "kids", kidId);
    await updateDoc(kidRef, {
      Deleted: false,
      DeletedAt: null,
      DeletedBy: null,
      UpdatedAt: serverTimestamp(),
      UpdatedBy: profile.uid
    });
    return { ok: true };
  } catch (err) {
    await logError({
      source: "frontend",
      page: "kids/list",
      action: "restoreKid",
      error: err,
      context: { kidId }
    });
    return { ok: false, errorKey: "kidRestoreFailed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// replaceKidPhoto (NEW in §39.13)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replace the kid's photo. Resizes the new file to main+thumb, uploads
 * both, then updates the kid doc's Photo* fields. The previous photo
 * file at the same path is overwritten by the upload (Firebase Storage
 * default behavior for same-path uploads).
 *
 * @param {File} photoFile  Browser File object (image/*)
 */
export async function replaceKidPhoto(kidId, photoFile, profile) {
  if (!profile || !profile.uid) {
    return { ok: false, errorKey: "notSignedIn" };
  }
  if (!kidId || typeof kidId !== "string") {
    return { ok: false, errorKey: "kidIdMissing" };
  }
  if (!photoFile) {
    return { ok: false, errorKey: "photoMissing" };
  }

  try {
    const { main, thumb } = await resizePhoto(photoFile);

    const mainPath  = `tenants/${TENANT_ID}/kids/${kidId}/photo.jpg`;
    const thumbPath = `tenants/${TENANT_ID}/kids/${kidId}/photo_thumb.jpg`;

    const mainRef  = storageRef(storage, mainPath);
    const thumbRef = storageRef(storage, thumbPath);

    await Promise.all([
      uploadBytes(mainRef,  main,  { contentType: "image/jpeg" }),
      uploadBytes(thumbRef, thumb, { contentType: "image/jpeg" })
    ]);

    const [photoURL, thumbURL] = await Promise.all([
      getDownloadURL(mainRef),
      getDownloadURL(thumbRef)
    ]);

    const kidRef = doc(db, "tenants", TENANT_ID, "kids", kidId);
    await updateDoc(kidRef, {
      PhotoURL: photoURL,
      PhotoStoragePath: mainPath,
      PhotoThumbnailURL: thumbURL,
      UpdatedAt: serverTimestamp(),
      UpdatedBy: profile.uid
    });
    return { ok: true };
  } catch (err) {
    await logError({
      source: "frontend",
      page: "kids/edit",
      action: "replaceKidPhoto",
      error: err,
      context: { kidId }
    });
    return { ok: false, errorKey: "photoReplaceFailed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// removeKidPhoto (NEW in §39.13)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove the kid's photo. Deletes both the main and thumb storage objects,
 * clears the Photo* fields on the kid doc.
 *
 * Storage delete failures are tolerated — if the file doesn't exist or
 * was already removed, we still want the doc fields cleared. We log
 * such failures but proceed.
 */
export async function removeKidPhoto(kidId, profile) {
  if (!profile || !profile.uid) {
    return { ok: false, errorKey: "notSignedIn" };
  }
  if (!kidId || typeof kidId !== "string") {
    return { ok: false, errorKey: "kidIdMissing" };
  }

  // Try to delete the storage objects. Non-fatal — proceed even on failure.
  const mainPath  = `tenants/${TENANT_ID}/kids/${kidId}/photo.jpg`;
  const thumbPath = `tenants/${TENANT_ID}/kids/${kidId}/photo_thumb.jpg`;
  try {
    await Promise.allSettled([
      deleteObject(storageRef(storage, mainPath)),
      deleteObject(storageRef(storage, thumbPath))
    ]);
  } catch (err) {
    // allSettled doesn't throw, so this catch is paranoid; if it fires
    // something is unusual.
    await logError({
      source: "frontend",
      page: "kids/edit",
      action: "removeKidPhoto:storage",
      error: err,
      context: { kidId }
    });
  }

  // Clear the doc fields. Use deleteField() so the fields disappear from
  // the doc rather than being set to null — keeps the schema clean.
  try {
    const kidRef = doc(db, "tenants", TENANT_ID, "kids", kidId);
    await updateDoc(kidRef, {
      PhotoURL: deleteField(),
      PhotoStoragePath: deleteField(),
      PhotoThumbnailURL: deleteField(),
      UpdatedAt: serverTimestamp(),
      UpdatedBy: profile.uid
    });
    return { ok: true };
  } catch (err) {
    await logError({
      source: "frontend",
      page: "kids/edit",
      action: "removeKidPhoto:updateDoc",
      error: err,
      context: { kidId }
    });
    return { ok: false, errorKey: "photoRemoveFailed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getKid (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export async function getKid(kidId) {
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
    if (data.Deleted === true) {
      return { ok: false, errorKey: "kidNotFound" };
    }

    return {
      ok: true,
      kid: {
        KidID: snap.id,
        ...data
      }
    };
  } catch (err) {
    await logError({
      source: "frontend",
      page: "kids/profile",
      action: "getKid",
      error: err,
      context: { kidId }
    });
    return { ok: false, errorKey: "kidReadFailed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SearchKey
// ─────────────────────────────────────────────────────────────────────────────

export function buildSearchKey(firstName, lastName) {
  const first = String(firstName || "").trim();
  const last  = String(lastName  || "").trim();
  return `${first} ${last}`
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}