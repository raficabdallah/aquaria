// public/src/setup/setup-status.js
// Determines whether the onboarding wizard has been completed for this tenant.
// Reads /tenants/{TENANT_ID}/settings/setupComplete.
// Missing document or value !== true → setup not complete.

import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { db } from '../firebase-init.js';
import { TENANT_ID } from '../config.js';

/**
 * Check whether the tenant has completed the onboarding wizard.
 * @returns {Promise<boolean>} true if setupComplete setting exists and value === true
 */
export async function isSetupComplete() {
  try {
    const ref = doc(db, 'tenants', TENANT_ID, 'settings', 'setupComplete');
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    return snap.data().value === true;
  } catch (err) {
    console.error('[setup-status] Failed to read setupComplete:', err);
    // On error, fail safe: assume NOT complete so SuperAdmin can re-run wizard.
    // (Operator/Admin will be blocked by the shell anyway.)
    return false;
  }
}