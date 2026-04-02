const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

let initialized = false;

function initFirebase() {
  if (initialized) return admin;

  const jsonRaw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const credPathRaw = (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();

  if (jsonRaw) {
    const parsed = JSON.parse(jsonRaw);
    admin.initializeApp({ credential: admin.credential.cert(parsed) });
  } else if (credPathRaw) {
    const backendRoot = path.join(__dirname, '..', '..');
    const resolved = path.isAbsolute(credPathRaw)
      ? credPathRaw
      : path.resolve(backendRoot, credPathRaw);
    if (!fs.existsSync(resolved)) {
      throw new Error(
        `Service account file not found: ${resolved}\n` +
          'Download it from Firebase Console → Project settings → Service accounts → Generate new private key, ' +
          'save as that filename in the backend folder, or set DEV_SKIP_AUTH=true for local dev only.'
      );
    }
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const serviceAccount = require(resolved);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    throw new Error(
      'Firebase Admin not configured. Add cricnicfirebase-service-account.json to the backend folder and set ' +
        'GOOGLE_APPLICATION_CREDENTIALS=./cricnicfirebase-service-account.json in .env, or set DEV_SKIP_AUTH=true for local dev only.'
    );
  }

  initialized = true;
  return admin;
}

module.exports = { initFirebase, getAdmin: () => admin };
