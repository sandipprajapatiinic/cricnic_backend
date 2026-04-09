const express = require('express');
const { firebaseAuth } = require('../middleware/firebaseAuth');
const matchController = require('../controllers/matchController');

const router = express.Router();
router.use(firebaseAuth);

router.get('/', matchController.listMatches);
router.post('/', matchController.createMatch);
router.get('/:id', matchController.getMatchById);
router.delete('/:id', matchController.deleteMatch);
router.patch('/:id/bowler', matchController.changeBowler);
router.post('/:id/undo-ball', matchController.undoBall);
router.post('/:id/balls', matchController.addBall);

module.exports = router;
