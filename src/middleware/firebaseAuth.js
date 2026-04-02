const { initFirebase, getAdmin } = require('../config/firebase');
const User = require('../models/User');

/** GET list endpoints that work without a Bearer token (this project default). */
const PUBLIC_GET_PATHS = new Set(['/api/players', '/api/teams']);

function normalizedRequestPath(req) {
  const raw = (req.originalUrl || req.url || '').split('?')[0];
  const p = raw.replace(/\/+$/, '') || '/';
  if (PUBLIC_GET_PATHS.has(p)) return p;
  const base = (req.baseUrl || '').replace(/\/+$/, '');
  const sub = req.path && req.path !== '/' ? req.path.replace(/\/+$/, '') : '';
  const joined = `${base}${sub}`.replace(/\/+/g, '/').replace(/\/+$/, '') || '/';
  return joined;
}

/**
 * Unauthenticated GET /api/players and /api/teams — no env vars needed.
 * Set REQUIRE_AUTH_EVERYWHERE=true (e.g. on Render) to require Firebase for those too.
 * POST/PUT/PATCH/DELETE and /api/matches/* still require a valid Bearer token.
 */
function allowUnauthenticatedPublicRead(req) {
  if (process.env.REQUIRE_AUTH_EVERYWHERE === 'true') return false;
  if (process.env.PUBLIC_API_READ === 'false') return false;
  if (req.method !== 'GET') return false;
  const p = normalizedRequestPath(req);
  return PUBLIC_GET_PATHS.has(p);
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
