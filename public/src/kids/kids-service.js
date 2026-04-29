// public/src/kids/kids-service.js
//
// The kids module's gateway. UI files (register-view, edit-view, profile-view)
// call in here; they never touch Firestore or Storage directly.
//
// Public API:
//   createKid(formData, profile)      -> Promise<{ ok, kidId } | { ok: false, errorKey }>
//   updateKid(kidId, formData, profile) -> Promise<{ ok } | { ok: false, errorKey }>
//   getKid(kidId)                     -> Promise<{ ok, kid } | { ok: false, errorKey }>
//   buildSearchKey(firstName, lastName) -> string
//
// formData shape (matches what register-view / edit-view collect, post-validation):
//   {
//     firstName, lastName, dateOfBirth,         // dateOfBirth: JS Date
//     gender,                                    // "Male" | "Female"
//     schoolType, school, grade,                // schoolType: "local" | "out_of_country"
//     parentName, phone, emergencyContact,      // phone strings already E.164
//     city, address, notes,
//     photoFile                                 // File | null  (only used by createKid)
//   }
//
// updateKid does NOT touch the photo at all in §39.12 — photo replacement
// is deferred to §39.13. Existing PhotoURL / PhotoStoragePath /
// PhotoThumbnailURL fields on the doc are preserved through the update.

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

import { app, db } from "../firebase-init.js";
import { TENANT_ID } from "../config.js";
import { resizePhoto } from "./photo-resize.js";
import { logError } from "../services/errors-service.js";

const storage = getStorage(app);

// ─────────────────────────────────────────────────────────────────────────────
// createKid (unchanged from §39.9; included here as the canonical version)
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
// updateKid (NEW in §39.12)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update an existing kid's editable fields. Caller is responsible for
 * holding the edit-lock and validating formData.
 *
 * Updates ONLY the editable fields. Does NOT touch:
 *   - photo fields (PhotoURL, PhotoStoragePath, PhotoThumbnailURL) —
 *     deferred to §39.13
 *   - status/blocking fields (Status, PermanentBlock, BlockHistory) —
 *     deferred to §39.13
 *   - loyalty/visit counters
 *   - FamilyID
 *   - audit fields except UpdatedAt + UpdatedBy
 *   - Deleted / DeletedAt / DeletedBy
 *
 * Recomputes FullName and SearchKey from the new first/last name so the
 * list page's prefix search keeps working after a name edit.
 *
 * @param {string} kidId
 * @param {Object} formData    Same shape as createKid's formData (photoFile ignored)
 * @param {Object} profile     { uid, ... }
 * @returns {Promise<{ ok: true } | { ok: false, errorKey: string }>}
 */
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
// SearchKey (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export function buildSearchKey(firstName, lastName) {
  const first = String(firstName || "").trim();
  const last  = String(lastName  || "").trim();
  return `${first} ${last}`
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}