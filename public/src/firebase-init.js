// src/firebase-init.js
//
// Initializes Firebase ONCE, exports the services other modules need.
// Every file that needs Firestore or Auth imports from this file —
// no other file calls initializeApp().
//
// SDK loaded from Google's CDN as ES modules (no build step).
// Versions pinned to a known-good release; bump deliberately, never blindly.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import { firebaseConfig } from "./config.js";

// 1. Initialize the Firebase app.
const app = initializeApp(firebaseConfig);

// 2. Initialize Firestore with offline persistence enabled.
//    - persistentLocalCache: writes data to IndexedDB so the app keeps working offline.
//    - persistentMultipleTabManager: lets multiple tabs share the cache safely
//      (relevant when staff has the dashboard open on more than one tab).
//    Per master prompt §2: offline support is critical for Lebanese internet reliability.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// 3. Initialize Auth.
const auth = getAuth(app);

// 4. Export the services. Other modules import { auth, db } from this file.
export { app, auth, db };