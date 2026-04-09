const express = require('express');
const { firebaseAuth } = require('../middleware/firebaseAuth');
const teamController = require('../controllers/teamController');

const router = express.Router();
router.use(firebaseAuth);

router.get('/', teamController.listTeams);
router.post('/', teamController.createTeam);
router.delete('/:id', teamController.deleteTeam);

module.exports = router;
