const mongoose = require('mongoose');
const Ball = require('../models/Ball');
const { applyDelivery } = require('./scoringService');

/**
 * Normalize any BSON / driver / string shape to mongoose ObjectId.
 * Handles legacy docs and ObjectId-like objects where `instanceof` fails.
 */
function toObjectId(ref) {
  if (ref == null) return null;
  if (ref instanceof mongoose.Types.ObjectId) return ref;

  if (typeof ref === 'string') {
    const s = ref.trim();
    if (s.length === 24 && mongoose.Types.ObjectId.isValid(s)) {
      try {
        return new mongoose.Types.ObjectId(s);
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  if (Buffer.isBuffer(ref) && ref.length === 12) {
    try {
      return new mongoose.Types.ObjectId(ref);
    } catch (_) {
      return null;
    }
  }

  if (typeof ref === 'object') {
    if (ref._id != null) return toObjectId(ref._id);
    if (typeof ref.toHexString === 'function') {
      try {
        const h = ref.toHexString();
        if (h && h.length === 24) return new mongoose.Types.ObjectId(h);
      } catch (_) {
        /* fall through */
      }
    }
    if (typeof ref.toString === 'function') {
      const s = String(ref.toString());
      if (s.length === 24 && mongoose.Types.ObjectId.isValid(s)) {
        try {
          return new mongoose.Types.ObjectId(s);
        } catch (_) {
          return null;
        }
      }
    }
  }

  return null;
}

function idStr(v) {
  if (v == null) return '';
  return v.toString ? v.toString() : String(v);
}

function ballDocumentToDeliveryInput(b) {
  const et = b.eventType;
  if (et === 'run') return { eventType: 'run', runs: b.runs };
  if (et === 'wicket') return { eventType: 'wicket', runs: 0 };
  if (et === 'wide') return { eventType: 'wide', runs: b.extras?.extraRuns ?? 0 };
  if (et === 'noball') return { eventType: 'noball', runs: b.extras?.extraRuns ?? 0 };
  if (et === 'bye') return { eventType: 'bye', runs: b.runs ?? 0 };
  if (et === 'legbye') return { eventType: 'legbye', runs: b.runs ?? 0 };
  throw new Error(`Unsupported ball eventType: ${et}`);
}

/**
 * Resolve opening striker, non-striker, bowler as ObjectIds.
 * @param {import('mongoose').Document} matchDoc
 * @param {object|null} firstBallLean — first ball by sequence, or null if none
 */
function resolveOpeningTriplet(matchDoc, firstBallLean) {
  const sub = matchDoc.openingLineup || {};

  let striker =
    toObjectId(firstBallLean?.strikerId) || toObjectId(sub.striker) || toObjectId(matchDoc.striker);
  let bowler =
    toObjectId(firstBallLean?.bowlerId) || toObjectId(sub.bowler) || toObjectId(matchDoc.bowler);
  let nonStriker = toObjectId(sub.nonStriker) || toObjectId(matchDoc.nonStriker);

  const order = (matchDoc.battingOrder || []).map((p) => toObjectId(p)).filter(Boolean);
  const sStr = striker ? idStr(striker) : '';

  if (!nonStriker || (striker && idStr(nonStriker) === sStr)) {
    nonStriker = order.find((id) => idStr(id) !== sStr) || null;
  }

  if (!striker && order.length) striker = order[0];
  if (!nonStriker && order.length >= 2) {
    nonStriker = idStr(order[0]) === sStr ? order[1] : order[0];
  }

  if (!striker || !nonStriker || !bowler) {
    throw new Error(
      'Cannot resolve opening lineup (need striker, non-striker, bowler). Check batting order and roles on the match.'
    );
  }
  if (idStr(striker) === idStr(nonStriker)) {
    throw new Error('Opening striker and non-striker must be two different players');
  }

  return { striker, nonStriker, bowler };
}

/**
 * Persist openingLineup on the match (for replay / reset).
 */
async function ensureOpeningLineup(matchDoc) {
  const first = await Ball.findOne({ matchId: matchDoc._id }).sort({ sequence: 1 }).lean();
  const triplet = resolveOpeningTriplet(matchDoc, first);
  matchDoc.openingLineup = triplet;
  await matchDoc.save();
  return triplet;
}

function resetMatchInningsFromOpening(match, opening) {
  match.score = 0;
  match.wickets = 0;
  match.extras.wides = 0;
  match.extras.noBalls = 0;
  match.extras.byes = 0;
  match.extras.legByes = 0;
  match.overs.completed = 0;
  match.overs.balls = 0;
  match.dismissedPlayers = [];
  const s = toObjectId(opening.striker);
  const ns = toObjectId(opening.nonStriker);
  const bw = toObjectId(opening.bowler);
  match.striker = s;
  match.nonStriker = ns;
  match.bowler = bw;
  match.status = 'scheduled';
  match.awaitingBowlerSelection = false;
}

/**
 * Align striker / non-striker / bowler with this ball's snapshot before applyDelivery.
 * Fixes replay after a wicket left striker null, and keeps roles consistent with the Ball log.
 */
function syncMatchRolesBeforeDelivery(match, ballLean) {
  let striker =
    toObjectId(ballLean.strikerId) ||
    toObjectId(ballLean.striker) ||
    toObjectId(match.striker);
  let bowler =
    toObjectId(ballLean.bowlerId) ||
    toObjectId(ballLean.bowler) ||
    toObjectId(match.bowler);
  if (!striker || !bowler) {
    const seq = ballLean.sequence ?? '?';
    throw new Error(
      `Ball #${seq} has no usable striker/bowler (strikerId/bowlerId). Re-score or fix the ball document in the database.`
    );
  }

  const dismissed = new Set(
    (match.dismissedPlayers || [])
      .filter(Boolean)
      .map((id) => idStr(toObjectId(id)))
  );
  const order = (match.battingOrder || []).map((p) => toObjectId(p)).filter(Boolean);
  const sStr = idStr(striker);

  let nonStriker = toObjectId(match.nonStriker);
  if (!nonStriker || idStr(nonStriker) === sStr || dismissed.has(idStr(nonStriker))) {
    nonStriker =
      order.find((id) => {
        const t = idStr(id);
        return t && t !== sStr && !dismissed.has(t);
      }) || null;
  }

  if (!nonStriker) {
    throw new Error(
      'Cannot replay match: non-striker could not be resolved for a delivery. Ensure batting order lists all batters.'
    );
  }

  match.striker = striker;
  match.nonStriker = nonStriker;
  match.bowler = bowler;
}

/**
 * Rebuild scorecard fields from stored balls (no Player stat updates).
 */
function replayDeliveriesOnMatch(match, ballsLean) {
  let lastRotateForNewOver = false;
  for (const b of ballsLean) {
    syncMatchRolesBeforeDelivery(match, b);
    const log = applyDelivery(match, ballDocumentToDeliveryInput(b));
    lastRotateForNewOver = !!log.rotateForNewOver;
  }
  return { lastRotateForNewOver };
}

module.exports = {
  ballDocumentToDeliveryInput,
  ensureOpeningLineup,
  resetMatchInningsFromOpening,
  replayDeliveriesOnMatch,
  resolveOpeningTriplet,
  syncMatchRolesBeforeDelivery,
  toObjectId,
};
