const express = require('express');

function buildApiRouter() {
  const router = express.Router();
  router.get('/health', (req, res) => res.json({ ok: true }));
  router.use('/teams', require('./teams'));
  router.use('/players', require('./players'));
  router.use('/matches', require('./matches'));
  return router;
}

module.exports = { buildApiRouter };
