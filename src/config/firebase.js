const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');

// Mirrors the same Firebase Admin bootstrap already proven out in the
// DM Bhatt Classes backend: a service-account JSON dropped at
// src/config/firebase-service-account.json (never committed — see
// .gitignore), with an env-var fallback for hosts where dropping a file in
// is awkward (e.g. pasting the whole JSON into a platform's secret
// manager).
//
// Push is a nice-to-have, not core to the app working — every call site
// that sends one goes through pushNotifications.js's own isFirebaseReady()
// guard, so a server with no Firebase credentials configured yet (or with
// PUSH_ENABLED=false) simply skips sending rather than crashing requests.
let attempted = false;

function initFirebase() {
  if (attempted) return; // only ever attempt this once per process
  attempted = true;

  if (admin.apps.length > 0) return; // already initialized elsewhere (e.g. tests)

  if (process.env.PUSH_ENABLED === 'false') {
    console.log('[firebase] PUSH_ENABLED=false — push notifications disabled');
    return;
  }

  try {
    const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const filePath = path.join(__dirname, 'firebase-service-account.json');

    let credentialSource = null;
    if (jsonEnv && jsonEnv.trim()) {
      credentialSource = JSON.parse(jsonEnv);
    } else if (fs.existsSync(filePath)) {
      credentialSource = require(filePath);
    }

    if (!credentialSource) {
      console.warn(
        '[firebase] No service account configured (set FIREBASE_SERVICE_ACCOUNT_JSON or ' +
          'drop a file at src/config/firebase-service-account.json) — push notifications are disabled.'
      );
      return;
    }

    admin.initializeApp({ credential: admin.credential.cert(credentialSource) });
    console.log('[firebase] Admin SDK initialized — push notifications enabled');
  } catch (err) {
    console.error('[firebase] Initialization failed:', err.message);
  }
}

const isFirebaseReady = () => admin.apps.length > 0;

module.exports = { admin, initFirebase, isFirebaseReady };
