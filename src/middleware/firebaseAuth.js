const { initFirebase, getAdmin } = require('../config/firebase');
const User = require('../models/User');

/** Exact GET paths without Bearer (this project default). */
const PUBLIC_GET_PATHS = new Set(['/api/players', '/api/teams', '/api/matches']);

const MONGO_ID_HEX = /^[a-fA-F0-9]{24}$/i;

function normalizedRequestPath(req) {
  const raw = (req.originalUrl || req.url || '').split('?')[0];
  const p = raw.replace(/\/+$/, '') || '/';
  if (PUBLIC_GET_PATHS.has(p)) return p;
  const base = (req.baseUrl || '').replace(/\/+$/, '');
  const sub = req.path && req.path !== '/' ? req.path.replace(/\/+$/, '') : '';
  const joined = `${base}${sub}`.replace(/\/+/g, '/').replace(/\/+$/, '') || '/';
  return joined;
}

/** GET /api/matches/:id only (list is in PUBLIC_GET_PATHS). */
function isPublicMatchByIdPath(p) {
  if (!p.startsWith('/api/matches/')) return false;
  const rest = p.slice('/api/matches/'.length);
  if (rest.includes('/')) return false;
  return MONGO_ID_HEX.test(rest);
}

/**
 * Unauthenticated GET for dashboard + live/score views: players, teams, matches list, match by id.
 * Set REQUIRE_AUTH_EVERYWHERE=true to require Firebase for all of these.
 * POST/PATCH and /api/matches/:id/balls etc. still require Bearer.
 */
function allowUnauthenticatedPublicRead(req) {
  if (process.env.REQUIRE_AUTH_EVERYWHERE === 'true') return false;
  if (process.env.PUBLIC_API_READ === 'false') return false;
  if (req.method !== 'GET') return false;
  const p = normalizedRequestPath(req);
  if (PUBLIC_GET_PATHS.has(p)) return true;
  return isPublicMatchByIdPath(p);
}

async function firebaseAuth(req, res, next) {
  if (allowUnauthenticatedPublicRead(req)) {
    return next();
  }

  if (process.env.DEV_SKIP_AUTH === 'true') {
    req.user = { uid: 'dev-user', email: 'dev@cricnic.local', name: 'Dev User' };
    req.dbUser = await User.findOneAndUpdate(
      { firebaseUid: 'dev-user' },
      {
        $setOnInsert: {
          firebaseUid: 'dev-user',
          name: 'Dev User',
          email: 'dev@cricnic.local',
          role: 'scorer',
        },
      },
      { upsert: true, new: true }
    );
    return next();
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({
      error: 'Missing Bearer token',
      hint:
        'This route requires Firebase auth. Use the app after sign-in, or call with header Authorization: Bearer <ID token>. Public check: GET /health',
    });
  }

  try {
    initFirebase();
    const adminSdk = getAdmin();
    const decoded = await adminSdk.auth().verifyIdToken(token);
    req.user = decoded;

    const name =
      decoded.name ||
      decoded.phone_number ||
      decoded.email?.split('@')[0] ||
      'User';
    const email = decoded.email || `${decoded.uid}@firebase.local`;

    req.dbUser = await User.findOneAndUpdate(
      { firebaseUid: decoded.uid },
      {
        $set: { name, email },
        $setOnInsert: { firebaseUid: decoded.uid, role: 'user' },
      },
      { upsert: true, new: true }
    );

    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token', detail: err.message });
  }
}

module.exports = { firebaseAuth };
