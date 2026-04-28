// public/src/dev/seed-tool.js
//
// Developer-only data seeding helpers. Used by the dev-tools section on the
// dashboard to populate the kids collection with a varied test set, and to
// backfill SearchKey on any older kid docs that pre-date the field.
//
// This file deliberately mirrors the kid schema from kids-service.js rather
// than calling createKid(). Reasons:
//   - The seed set needs pre-set fields createKid() doesn't accept (Status =
//     "Blocked", BlockHistory entries, FamilyID for siblings).
//   - Going through createKid() and then patching would mean two writes per
//     seeded kid for no benefit.
//   - The seed helper is dev-only and never ships to production end-users
//     (it's gated by projectId === "aquaria-dev-66eec" at the call site).
//
// All seeded kids are written with CreatedBy = the SuperAdmin's uid, so the
// audit trail is clean — the writes are attributable, not anonymous.
//
// Public API:
//   seedFakeKids(profile)        -> Promise<{ ok, created } | { ok:false, errorKey }>
//   backfillSearchKeys(profile)  -> Promise<{ ok, scanned, updated } | { ok:false, errorKey }>

import {
  doc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import { db } from "../firebase-init.js";
import { TENANT_ID } from "../config.js";
import { buildSearchKey } from "../kids/kids-service.js";
import { logError } from "../services/errors-service.js";

// ─────────────────────────────────────────────────────────────────────────────
// seedFakeKids
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write 5 deliberately-varied kid docs to /tenants/{tid}/kids/.
 * Designed to exercise the kids list UI: photo present/absent, blocked status,
 * out-of-country school, sibling pairing via FamilyID.
 *
 * Kids are written with their CreatedAt back-dated so they show up in a
 * realistic order on the list (oldest first ~3 weeks ago, newest yesterday).
 *
 * Returns { ok: true, created: <count> } even if some writes fail — partial
 * success is acceptable here since this is a dev tool. Errors are logged.
 */
export async function seedFakeKids(profile) {
  if (!profile || !profile.uid) {
    return { ok: false, errorKey: "notSignedIn" };
  }

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  // Two siblings share this FamilyID (auto-generated client-side using a
  // random string; no Firestore round-trip needed for FamilyID itself).
  const sharedFamilyId = `fam_seed_${Math.random().toString(36).slice(2, 10)}`;

  const seeds = [
    // 1. Local-school girl, has been around a few weeks, sibling of #2.
    {
      firstName: "Maya",
      lastName: "Khoury",
      dob: yearsAgo(7),
      gender: "Female",
      schoolType: "local",
      school: "American International School",
      grade: "Grade 2",
      parentName: "Sarah Khoury",
      phone: "+96170123456",
      emergencyContact: "+96171234567",
      city: "Beirut",
      address: "Hamra, Bliss Street",
      notes: "Allergic to peanuts.",
      familyId: sharedFamilyId,
      status: "Active",
      blockHistory: [],
      createdAt: new Date(now - 21 * day)
    },
    // 2. Sibling of #1 — younger, same family, same school.
    {
      firstName: "Karim",
      lastName: "Khoury",
      dob: yearsAgo(5),
      gender: "Male",
      schoolType: "local",
      school: "American International School",
      grade: "KG2",
      parentName: "Sarah Khoury",
      phone: "+96170123456",
      emergencyContact: "+96171234567",
      city: "Beirut",
      address: "Hamra, Bliss Street",
      notes: "",
      familyId: sharedFamilyId,
      status: "Active",
      blockHistory: [],
      createdAt: new Date(now - 21 * day)
    },
    // 3. Out-of-country school. Tests that filter.
    {
      firstName: "Lara",
      lastName: "Hadad",
      dob: yearsAgo(9),
      gender: "Female",
      schoolType: "out_of_country",
      school: "Lycée Français de Dubai",
      grade: "CM1",
      parentName: "Rami Hadad",
      phone: "+97150999888",
      emergencyContact: "",
      city: "Beirut",
      address: "Achrafieh",
      notes: "Visiting from UAE — usually here in summer.",
      familyId: null,
      status: "Active",
      blockHistory: [],
      createdAt: new Date(now - 14 * day)
    },
    // 4. Currently blocked. Tests Blocked filter + badge + history rendering.
    {
      firstName: "Omar",
      lastName: "Saad",
      dob: yearsAgo(11),
      gender: "Male",
      schoolType: "local",
      school: "International College",
      grade: "Grade 6",
      parentName: "Nour Saad",
      phone: "+96176555444",
      emergencyContact: "+96171555444",
      city: "Jounieh",
      address: "",
      notes: "",
      familyId: null,
      status: "Blocked",
      blockHistory: [
        {
          BlockedAt: Timestamp.fromDate(new Date(now - 3 * day)),
          BlockedBy: profile.uid,
          Reason: "Repeated rough play with younger kids — parent informed.",
          Permanent: false,
          UnblockedAt: null,
          UnblockedBy: null
        }
      ],
      createdAt: new Date(now - 30 * day)
    },
    // 5. Newest kid, registered "yesterday". No photo, minimal data.
    {
      firstName: "Yara",
      lastName: "Mansour",
      dob: yearsAgo(4),
      gender: "Female",
      schoolType: "local",
      school: "Eastwood College",
      grade: "KG1",
      parentName: "Hiba Mansour",
      phone: "+96103222111",
      emergencyContact: "",
      city: "Mansourieh",
      address: "",
      notes: "",
      familyId: null,
      status: "Active",
      blockHistory: [],
      createdAt: new Date(now - 1 * day)
    }
  ];

  let created = 0;
  for (const seed of seeds) {
    try {
      await writeOneSeedKid(seed, profile);
      created++;
    } catch (err) {
      await logError({
        source: "frontend",
        page: "dev/seed",
        action: "seedFakeKids:writeOne",
        error: err,
        context: { name: `${seed.firstName} ${seed.lastName}` }
      });
      // Continue — other kids may still write successfully.
    }
  }

  if (created === 0) {
    return { ok: false, errorKey: "seedFailed" };
  }
  return { ok: true, created };
}

/**
 * Internal: write a single seeded kid. Throws on failure (caller handles).
 * Schema must stay in sync with createKid() in kids-service.js.
 */
async function writeOneSeedKid(seed, profile) {
  const kidsCol = collection(db, "tenants", TENANT_ID, "kids");
  const kidRef  = doc(kidsCol);

  const fullName  = `${seed.firstName} ${seed.lastName}`.trim();
  const searchKey = buildSearchKey(seed.firstName, seed.lastName);

  const docPayload = {
    // Identity
    FirstName: seed.firstName,
    LastName:  seed.lastName,
    FullName:  fullName,
    SearchKey: searchKey,
    DateOfBirth: Timestamp.fromDate(seed.dob),
    Gender: seed.gender,

    // School
    SchoolType: seed.schoolType,
    School: seed.school,
    Grade: seed.grade,

    // Parent / contacts
    ParentName: seed.parentName,
    Phone: seed.phone,
    EmergencyContact: seed.emergencyContact,

    // Location
    City: seed.city,
    Address: seed.address,

    Notes: seed.notes,

    // Status / blocking — varies per seed
    Status: seed.status,
    PermanentBlock: false,
    BlockHistory: seed.blockHistory,

    // Loyalty / visit denormalized counters
    LoyaltyPoints: 0,
    LoyaltyLevel: "Bronze",
    TotalVisits: 0,
    VisitsThisMonth: 0,
    LastVisit: null,
    StreakDays: 0,

    // Family — varies per seed (siblings share)
    FamilyID: seed.familyId,

    // Display / privacy
    DisplayOnPublicScreen: "first_only",

    // Common fields per §3 — note CreatedAt is back-dated to a real Timestamp
    // so the seed kids appear in a realistic chronological order on the list.
    // UpdatedAt uses serverTimestamp() because it represents "now".
    TenantID: TENANT_ID,
    CreatedAt: Timestamp.fromDate(seed.createdAt),
    UpdatedAt: serverTimestamp(),
    CreatedBy: profile.uid,
    UpdatedBy: profile.uid,
    Deleted: false,
    DeletedAt: null,
    DeletedBy: null
  };

  await setDoc(kidRef, docPayload);
}

// ─────────────────────────────────────────────────────────────────────────────
// backfillSearchKeys
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scan all kid docs in the tenant and add SearchKey to any that don't have it.
 * Idempotent — re-running is safe and a no-op for already-backfilled kids.
 *
 * Why this exists: kids registered before §39.9 don't have SearchKey, which
 * means the kids list won't find them via prefix search. This one-shot
 * action gets them caught up.
 *
 * Returns { ok, scanned, updated } so the UI can show a precise toast.
 */
export async function backfillSearchKeys(profile) {
  if (!profile || !profile.uid) {
    return { ok: false, errorKey: "notSignedIn" };
  }

  let snap;
  try {
    const kidsCol = collection(db, "tenants", TENANT_ID, "kids");
    snap = await getDocs(kidsCol);
  } catch (err) {
    await logError({
      source: "frontend",
      page: "dev/seed",
      action: "backfillSearchKeys:getDocs",
      error: err
    });
    return { ok: false, errorKey: "backfillReadFailed" };
  }

  let scanned = 0;
  let updated = 0;
  for (const kidSnap of snap.docs) {
    scanned++;
    const data = kidSnap.data();
    if (typeof data.SearchKey === "string" && data.SearchKey.length > 0) {
      continue; // already has it
    }

    const newKey = buildSearchKey(data.FirstName, data.LastName);
    if (!newKey) {
      // No name to derive from — skip rather than write empty string.
      continue;
    }

    try {
      await updateDoc(kidSnap.ref, {
        SearchKey: newKey,
        UpdatedAt: serverTimestamp(),
        UpdatedBy: profile.uid
      });
      updated++;
    } catch (err) {
      await logError({
        source: "frontend",
        page: "dev/seed",
        action: "backfillSearchKeys:updateOne",
        error: err,
        context: { kidId: kidSnap.id }
      });
      // Continue — other kids may still update successfully.
    }
  }

  return { ok: true, scanned, updated };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a Date roughly N years ago from today. Good enough for seed DOBs;
 * we don't care about leap-year precision for fake test data.
 */
function yearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d;
}
