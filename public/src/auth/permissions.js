// public/src/auth/permissions.js
//
// Role-based capability checks. Used by view code to hide or disable UI
// affordances. Server-side enforcement is via Firestore rules (see
// firestore.rules); these helpers exist so the UI matches the rules
// and so we have ONE place to change policy.
//
// Role hierarchy (per §6 + §39.13):
//   Operator   — desk staff. Registers kids, runs check-in/out.
//                Cannot edit, block, or delete kid records.
//   Admin      — manager. Can edit, block/unblock, replace photos.
//                Cannot delete or restore (those are SuperAdmin-only).
//   SuperAdmin — owner. Can do anything.
//
// All helpers accept a profile object and return a boolean. Profile shape:
//   { uid, email, role, ... }
// where role is one of: "Operator" | "Admin" | "SuperAdmin"
//
// If profile is null/undefined or has no role, ALL helpers return false.

export function isAdmin(profile) {
  return !!profile && (profile.role === "Admin" || profile.role === "SuperAdmin");
}

export function isSuperAdmin(profile) {
  return !!profile && profile.role === "SuperAdmin";
}

// Kid-record capabilities

export function canRegisterKids(profile) {
  // Any signed-in tenant member can register.
  return !!profile && !!profile.role;
}

export function canEditKids(profile) {
  // Admin+ only. Operators can register a new kid but not modify existing ones.
  return isAdmin(profile);
}

export function canReplaceKidPhoto(profile) {
  // Same gate as edit — photo replace is part of the edit flow.
  return isAdmin(profile);
}

export function canBlockKids(profile) {
  // Admin+ — operational decision based on behavior/safety incidents.
  return isAdmin(profile);
}

export function canSoftDeleteKids(profile) {
  // SuperAdmin only — irreversible-feeling action even though soft-delete
  // IS technically reversible. Conservative default.
  return isSuperAdmin(profile);
}

export function canRestoreKids(profile) {
  // Same gate as soft-delete: undoing a destructive action requires the
  // same authority as performing it.
  return isSuperAdmin(profile);
}

export function canViewDeletedKids(profile) {
  // SuperAdmin sees the "Show deleted" toggle on the kids list.
  return isSuperAdmin(profile);
}