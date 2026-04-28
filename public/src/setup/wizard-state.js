// public/src/setup/wizard-state.js
//
// In-memory state for the onboarding wizard (§29).
// Holds form data across the 7 steps without writing to Firestore until the
// user clicks Finish on Step 7. Closing the browser mid-wizard means starting
// over from Step 1 — acceptable for a one-time setup flow.
//
// On finalize: a single batched write commits all settings docs + catalog docs
// + setupComplete flag atomically.

import {
  doc,
  collection,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import { db } from "../firebase-init.js";
import { TENANT_ID } from "../config.js";
import { DEFAULT_COUNTRY_ISO, getCountryByIso } from "../data/countries.js";

// ─────────────────────────────────────────────────────────────────────────────
// Initial state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a fresh wizard state. Defaults match §5 of the master prompt
 * (countryCode "+961" via Lebanon default, language "en", timezone "Asia/Beirut").
 */
export function createInitialState() {
  const defaultCountry = getCountryByIso(DEFAULT_COUNTRY_ISO);

  return {
    // Step 1 — identity
    playgroundName: "",
    countryDialCode: defaultCountry ? defaultCountry.dialCode : "+961",

    // Step 2 — operating settings
    // currency is hardcoded "USD" at v6.2; not in state.
    language: "en",
    timezone: "Asia/Beirut",

    // Step 3 — first session type (REQUIRED)
    firstSessionType: {
      name: "",
      durationMinutes: 0,
      priceMinor: 0   // integer minor units (cents)
    },

    // Step 4 — first subscription model (OPTIONAL)
    firstSubscriptionModel: null,
    // shape when set:
    // { name, durationMonths, visitsPerWeek, minutesPerVisit, priceMinor }

    // Step 5 — first bundle (OPTIONAL)
    firstBundle: null,
    // shape when set:
    // { name, totalVisits, validityMonths, minutesPerVisit, priceMinor }

    // Step 6 — SuperAdmin account (existing)
    // We display the profile read-only and allow optional Username edit.
    superAdminUsername: ""   // pre-filled from profile.username when wizard opens
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Finalize — single batched write
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Commit the wizard state to Firestore in one atomic batch.
 *
 * @param {Object} state    The wizard state object built across 7 steps.
 * @param {Object} profile  Authenticated user profile (provides uid for audit fields).
 * @returns {Promise<{ ok: true }>} on success.
 *          Throws on failure — caller catches and shows a toast.
 */
export async function finalizeWizard(state, profile) {
  const batch = writeBatch(db);

  // Common audit fields written on every doc this wizard creates.
  const audit = {
    CreatedAt: serverTimestamp(),
    UpdatedAt: serverTimestamp(),
    CreatedBy: profile.uid,
    UpdatedBy: profile.uid
  };

  // Helper to write a settings doc with the { value, ...audit } shape.
  function writeSetting(key, value) {
    const ref = doc(db, "tenants", TENANT_ID, "settings", key);
    batch.set(ref, { value, ...audit });
  }

  // ── Settings docs ─────────────────────────────────────────────────────────
  // From Step 1
  writeSetting("playgroundName", state.playgroundName.trim());
  writeSetting("countryCode", state.countryDialCode);

  // From Step 2 (plus v6.2-locked currency settings per §5)
  writeSetting("currency", "USD");
  writeSetting("currencyMinorUnits", 100);
  writeSetting("language", state.language);
  writeSetting("timezone", state.timezone);

  // ── Catalog docs ──────────────────────────────────────────────────────────
  // Step 3 — first session type (always present, validated by step UI).
  // Schema per §8: SessionTypeID, Name, DurationMinutes, Price, Active, DisplayOrder.
  // Plus common fields per §3.
  const sessionTypeRef = doc(collection(db, "tenants", TENANT_ID, "sessionTypes"));
  batch.set(sessionTypeRef, {
    Name: state.firstSessionType.name.trim(),
    DurationMinutes: state.firstSessionType.durationMinutes,
    Price: state.firstSessionType.priceMinor,
    Active: true,
    DisplayOrder: 1,
    TenantID: TENANT_ID,
    Deleted: false,
    DeletedAt: null,
    DeletedBy: null,
    ...audit
  });

  // Step 4 — first subscription model (optional).
  // Schema per §8.
  if (state.firstSubscriptionModel) {
    const m = state.firstSubscriptionModel;
    const subModelRef = doc(collection(db, "tenants", TENANT_ID, "subscriptionModels"));
    batch.set(subModelRef, {
      Name: m.name.trim(),
      DurationMonths: m.durationMonths,
      VisitsPerWeek: m.visitsPerWeek,
      MinutesPerVisit: m.minutesPerVisit,
      Price: m.priceMinor,
      Active: true,
      DisplayOrder: 1,
      TenantID: TENANT_ID,
      Deleted: false,
      DeletedAt: null,
      DeletedBy: null,
      ...audit
    });
  }

  // Step 5 — first bundle (optional).
  // Schema per §8.
  if (state.firstBundle) {
    const b = state.firstBundle;
    const bundleRef = doc(collection(db, "tenants", TENANT_ID, "bundles"));
    batch.set(bundleRef, {
      Name: b.name.trim(),
      TotalVisits: b.totalVisits,
      ValidityMonths: b.validityMonths,
      MinutesPerVisit: b.minutesPerVisit,
      Price: b.priceMinor,
      Active: true,
      DisplayOrder: 1,
      TenantID: TENANT_ID,
      Deleted: false,
      DeletedAt: null,
      DeletedBy: null,
      ...audit
    });
  }

  // ── Step 6 — optional username update on the SuperAdmin's profile ─────────
  const trimmedUsername = (state.superAdminUsername || "").trim();
  if (trimmedUsername && trimmedUsername !== profile.username) {
    const userRef = doc(db, "tenants", TENANT_ID, "users", profile.uid);
    // updateDoc-equivalent in batch is batch.update(); only changes specified fields.
    batch.update(userRef, {
      Username: trimmedUsername,
      UpdatedAt: serverTimestamp(),
      UpdatedBy: profile.uid
    });
  }

  // ── Step 7 — terminal setup ──────────────────────────────────────────────
  // No writes per project decision. Configured later in Admin Panel post-Blaze.

  // ── Setup complete flag ───────────────────────────────────────────────────
  // Written LAST so the wizard is only marked complete if everything else
  // commits in the same batch (atomic — all or nothing).
  writeSetting("setupComplete", true);

  // Commit the entire batch atomically.
  await batch.commit();

  return { ok: true };
}