// public/src/config.js
//
// App-wide constants. Single source of truth.
// Per master prompt §4 (Configuration Constants).

export const APP_VERSION = '6.2.0';
export const SCHEMA_VERSION = 1;
export const TENANT_ID = 'aquaria';
export const STAFF_LOGIN_HOURS = 8;

// Public Firebase config for aquaria-dev-66eec (development environment).
// These values are PUBLIC — they're meant to live in client-side code.
// Security comes from Firestore Rules + Auth, not from hiding the config.
export const firebaseConfig = {
  apiKey: "AIzaSyCVwMZLFfju-mI8tHZ1TvE5_bIVaaxvuB4",
  authDomain: "aquaria-dev-66eec.firebaseapp.com",
  projectId: "aquaria-dev-66eec",
  storageBucket: "aquaria-dev-66eec.firebasestorage.app",
  messagingSenderId: "12121688935",
  appId: "1:12121688935:web:cdc85ffaa726c802157dc2"
};