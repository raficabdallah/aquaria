// src/auth/auth-service.js
//
// All authentication logic lives here. UI files call into this module —
// they never touch Firebase Auth or the users/ collection directly.
//
// Today (Option 3 from build plan): role is read from
// /tenants/{TENANT_ID}/users/{uid} on the Firestore document itself.
// Future (when we move to Blaze + Cloud Functions): role will come from
// a custom claim on the auth token. The signature of getCurrentUserProfile()
// stays the same; only the implementation changes.

import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import { auth, db } from "../firebase-init.js";
import { TENANT_ID } from "../config.js";

// ─────────────────────────────────────────────────────────────────────────────
// Sign in
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attempts to sign in with email + password.
 * Returns { ok: true } on success, or { ok: false, errorKey } on failure.
 * errorKey is a key into strings.errors so the caller can show a localized message.
 */
export async function signIn(email, password) {
  // Basic field validation. The UI should have caught these, but we double-check.
  if (!email || !email.trim()) {
    return { ok: false, errorKey: "emailRequired" };
  }
  if (!password) {
    return { ok: false, errorKey: "passwordRequired" };
  }

  try {
    await signInWithEmailAndPassword(auth, email.trim(), password);
    // Auth succeeded. The shell will pick up the change via onAuthChange()
    // and load the user profile. We don't need to do that here.
    return { ok: true };
  } catch (error) {
    return { ok: false, errorKey: mapAuthErrorToStringKey(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sign out
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Signs the current user out. Clears the auth state.
 */
export async function signOut() {
  await firebaseSignOut(auth);
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth state subscription
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscribes to auth state changes. The callback receives the Firebase user
 * object (or null when signed out). Returns an unsubscribe function.
 *
 * Use this in the shell to react when someone logs in or out.
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Returns the currently signed-in Firebase user, or null.
 * Synchronous — only useful AFTER auth state has settled.
 */
export function getCurrentAuthUser() {
  return auth.currentUser;
}

// ─────────────────────────────────────────────────────────────────────────────
// User profile + role lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Looks up the signed-in user's profile document in
 *   /tenants/{TENANT_ID}/users/{uid}
 * and returns the role + active status.
 *
 * Returns:
 *   { ok: true, profile: { uid, email, username, role, active } }
 *   { ok: false, errorKey: "profileNotFound" | "profileInactive" }
 *
 * The profile document is the source of truth for roles today.
 * Per master prompt §6 + §7 (Staff Users data model).
 */
export async function getCurrentUserProfile() {
  const user = auth.currentUser;
  if (!user) {
    // Caller shouldn't have asked. This is a programming error, not a user error.
    throw new Error("getCurrentUserProfile() called with no signed-in user.");
  }

  const userDocRef = doc(db, "tenants", TENANT_ID, "users", user.uid);
  const snapshot = await getDoc(userDocRef);

  if (!snapshot.exists()) {
    // The user authenticated successfully but has no profile in this tenant.
    // Could be: a stray Auth user, a future tenant-scoping issue, or a missing seed.
    return { ok: false, errorKey: "profileNotFound" };
  }

  const data = snapshot.data();

  if (data.Active === false) {
    // Per §6 — accounts are deactivated, never deleted. Inactive accounts can
    // still authenticate but should not be allowed into the app.
    return { ok: false, errorKey: "profileInactive" };
  }

  return {
    ok: true,
    profile: {
      uid: user.uid,
      email: user.email,
      username: data.Username || user.email,
      role: data.Role,
      active: data.Active !== false  // default true if missing
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Error mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps Firebase Auth error codes to our string keys.
 * Anything we don't recognize falls through to "unexpected".
 */
function mapAuthErrorToStringKey(error) {
  const code = error?.code || "";

  switch (code) {
    case "auth/invalid-email":
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":  // newer SDKs return this generic code instead of the two above
      return "invalidCredentials";

    case "auth/user-disabled":
      return "accountDisabled";

    case "auth/too-many-requests":
      return "tooManyAttempts";

    case "auth/network-request-failed":
      return "networkProblem";

    default:
      // Log so we can investigate; user gets a generic message.
      console.error("[auth-service] Unrecognized Firebase Auth error:", error);
      return "unexpected";
  }
}