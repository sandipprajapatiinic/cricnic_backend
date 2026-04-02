const Match = require('../models/Match');
const Ball = require('../models/Ball');
const {
  resolveOpeningTriplet,
  resetMatchInningsFromOpening,
  replayDeliveriesOnMatch,
} = require('./matchReplayService');

/**
 * Rebuild Match document from the balls collection (source of truth).
 * Replay order is chronological by `sequence` (monotonic per match).
 *
 * @param {string} matchId
 * @returns {Promise<import('mongoose').Document>}
 */
async function recalculateMatchState(matchId) {
  const match = await Match.findById(matchId);
  if (!match) {
    throw new Error('Match not found');
  }

  const remaining = await Ball.find({ matchId: match._id }).sort({ sequence: 1 }).lean();
  const firstBall = remaining.length ? remaining[0] : null;
  const triplet = resolveOpeningTriplet(match, firstBall);
  match.openingLineup = triplet;

  resetMatchInningsFromOpening(match, triplet);

  let lastRotateForNewOver = false;
  if (remaining.length > 0) {
    const { lastRotateForNewOver: lr } = replayDeliveriesOnMatch(match, remaining);
    lastRotateForNewOver = lr;
  }

  match.awaitingBowlerSelection = !!(lastRotateForNewOver && match.status !== 'completed');
  await match.save();
  return match;
}

module.exports = { recalculateMatchState };
