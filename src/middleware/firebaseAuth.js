const { initFirebase, getAdmin } = require('../config/firebase');
const User = require('../models/User');

async function firebaseAuth(req, res, next) {
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
    return res.status(401).json({ error: 'Missing Bearer token' });
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
