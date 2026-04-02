const express = require('express');
const { firebaseAuth } = require('../middleware/firebaseAuth');
const playerController = require('../controllers/playerController');

const router = express.Router();
router.use(firebaseAuth);

router.get('/', playerController.listPlayers);
router.post('/', playerController.createPlayer);

module.exports = router;
