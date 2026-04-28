// public/src/kids/kids-service.js
//
// The kids module's gateway. UI files (register-view, profile-view) call
// in here; they never touch Firestore or Storage directly.
//
// Public API:
//   createKid(formData, profile)   -> Promise<{ ok, kidId } | { ok: false, errorKey }>
//   getKid(kidId)                  -> Promise<{ ok, kid } | { ok: false, errorKey }>
//   buildSearchKey(firstName, lastName) -> string  (exported for seed-tool reuse)
//
// formData shape (matches what register-view collects, all post-validation):
//   {
//     firstName, lastName, dateOfBirth,         // dateOfBirth: JS Date
//     gender,                                    // "Male" | "Female"
//     schoolType, school, grade,                // schoolType: "local" | "out_of_country"
//     parentName, phone, emergencyContact,      // phone strings already E.164
//     city, address, notes,
//     photoFile                                 // File | null
//   }
//
// Photo flow (when photoFile is present):
//   1. Resize client-side via photo-resize.js (main 800x800 + thumb 200x200).
//   2. Create the kid doc FIRST so we have a kidId.
//   3. Upload main + thumb to Storage at /tenants/{tid}/kids/{kidId}/.
//   4. Update the kid doc with PhotoURL / PhotoStoragePath / PhotoThumbnailURL.
//
// If a photo upload fails after the kid doc is written, the kid still exists
// (text fields intact) but without photo URLs. Operator can re-upload via
// edit-kid in a future session. logError() captures the failure.
//
// SearchKey:
//   A denormalized lowercased+normalized version of the kid's full name,
//   used by the kids list page for prefix-match search via Firestore range
//   queries. Computed on every write. The shape is intentionally a string
//   (not an array of tokens) — v1 supports prefix match only. If we ever
//   need substring/diacritic matching we change the normalization in
//   buildSearchKey() and run a backfill; the field name doesn't change.

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

// One Storage instance for the module.
const storage = getStorage(app);

// ─────────────────────────────────────────────────────────────────────────────
// createKid
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register a new kid. Writes the Firestore doc and (optionally) uploads photos.
 * Caller is responsible for validating formData before calling — this function
 * trusts what it gets and only does shape-coercion (trim, etc.).
 *
 * @param {Object} formData  Validated form data (see file header)
 * @param {Object} profile   { uid, ... } from auth-service
 * @returns {Promise<{ ok: true, kidId: string } | { ok: false, errorKey: string }>}
 */
export async function createKid(formData, profile) {
  if (!profile || !profile.uid) {
    return { ok: false, errorKey: "notSignedIn" };
  }

  // Reserve a Firestore-generated ID up front so photos can be uploaded under
  // a path that includes the final kidId. doc(collection(...)) creates a
  // reference with an auto-generated ID without writing anything yet.
  const kidsCol = collection(db, "tenants", TENANT_ID, "kids");
  const kidRef  = doc(kidsCol);
  const kidId   = kidRef.id;

  // Build the document payload. Common fields per §3 + Kid schema per §7
  // + amendments (SchoolType, City) per §39.8.
  const firstName = formData.firstName.trim();
  const lastName  = formData.lastName.trim();
  const fullName  = `${firstName} ${lastName}`.trim();
  const searchKey = buildSearchKey(firstName, lastName);

  const doc1 = {
    // Identity
    FirstName: firstName,
    LastName: lastName,
    FullName: fullName,
    SearchKey: searchKey,
    DateOfBirth: Timestamp.fromDate(formData.dateOfBirth),
    Gender: formData.gender,

    // School (amendment: SchoolType field)
    SchoolType: formData.schoolType,
    School: (formData.school || "").trim(),
    Grade: (formData.grade || "").trim(),

    // Parent / contacts
    ParentName: formData.parentName.trim(),
    Phone: formData.phone,
    EmergencyContact: (formData.emergencyContact || "").trim(),

    // Location (amendment: City required, Address optional)
    City: formData.city.trim(),
    Address: (formData.address || "").trim(),

    Notes: (formData.notes || "").trim(),

    // Status / blocking
    Status: "Active",
    PermanentBlock: false,
    BlockHistory: [],

    // Loyalty / visit denormalized counters
    LoyaltyPoints: 0,
    LoyaltyLevel: "Bronze",
    TotalVisits: 0,
    VisitsThisMonth: 0,
    LastVisit: null,
    StreakDays: 0,

    // Family
    FamilyID: null,

    // Display / privacy
    DisplayOnPublicScreen: "first_only",

    // Common fields per §3
    TenantID: TENANT_ID,
    CreatedAt: serverTimestamp(),
    UpdatedAt: serverTimestamp(),
    CreatedBy: profile.uid,
    UpdatedBy: profile.uid,
    Deleted: false,
    DeletedAt: null,
    DeletedBy: null
  };

  // ── Step 1: write the kid document ──
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

  // ── Step 2: handle the photo if one was provided ──
  if (formData.photoFile) {
    try {
      const { main, thumb } = await resizePhoto(formData.photoFile);

      const mainPath  = `tenants/${TENANT_ID}/kids/${kidId}/photo.jpg`;
      const thumbPath = `tenants/${TENANT_ID}/kids/${kidId}/photo_thumb.jpg`;

      const mainRef  = storageRef(storage, mainPath);
      const thumbRef = storageRef(storage, thumbPath);

      // Uploads run in parallel; both must succeed.
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
      // Kid doc is already written. Photo failed — log it and keep going.
      // The caller still gets ok:true; the registration succeeded, just
      // without the photo. Operator can re-upload from edit-kid later.
      await logError({
        source: "frontend",
        page: "kids/new",
        action: "createKid:photoUpload",
        error: err,
        context: { kidId }
      });
      // Surface a non-fatal flag so the UI can show a softer toast.
      return { ok: true, kidId, photoUploadFailed: true };
    }
  }

  return { ok: true, kidId };
}

// ─────────────────────────────────────────────────────────────────────────────
// getKid
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch one kid by ID. Returns { ok, kid } where kid includes all doc fields
 * plus a synthetic .KidID string for callers that need it.
 *
 * @param {string} kidId
 * @returns {Promise<{ ok: true, kid: Object } | { ok: false, errorKey: string }>}
 */
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
      // Treat soft-deleted kids as not found from the public API.
      // SuperAdmin tooling can read them via a dedicated path later.
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

/**
 * Build a normalized search key from a kid's first and last name.
 * Lowercased, trimmed, internal whitespace collapsed to single spaces.
 *
 * Used by the kids list for Firestore prefix-match queries
 * (orderBy("SearchKey") + startAt(prefix) + endAt(prefix + "\uf8ff")).
 *
 * Why a separate field instead of querying FullName:
 *   - Firestore range queries are case-sensitive. "maya" wouldn't match "Maya".
 *   - Centralizing normalization here means one rule, one place to change.
 *
 * Future: if we ever want diacritic-insensitive matching ("Francois" matches
 * "François"), we add .normalize("NFD").replace(/\p{Diacritic}/gu, "") here
 * and run the backfill helper. The field NAME stays the same.
 */
export function buildSearchKey(firstName, lastName) {
  const first = String(firstName || "").trim();
  const last  = String(lastName  || "").trim();
  return `${first} ${last}`
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
