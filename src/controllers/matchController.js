const mongoose = require('mongoose');
const Match = require('../models/Match');
const Ball = require('../models/Ball');
const Player = require('../models/Player');
const Team = require('../models/Team');
const { applyDelivery, parseRunValue } = require('../services/scoringService');
const { applyDeliveryPlayerStats, reverseDeliveryPlayerStats } = require('../services/ballStatsService');
const { hydrateMatchTeams } = require('../services/teamPlayers');
const { recalculateMatchState } = require('../services/matchStateService');

const matchPopulate = [
  { path: 'teamA', populate: { path: 'players' } },
  { path: 'teamB', populate: { path: 'players' } },
  { path: 'players' },
  { path: 'battingOrder' },
  { path: 'striker' },
  { path: 'nonStriker' },
  { path: 'bowler' },
];

function numExtraRuns(v, max = 6) {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number.parseInt(String(v).trim(), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.trunc(n)));
}

function normalizeBallBody(body) {
  const type = body.type ?? body.eventType;
  if (type === 'wide') {
    const er = numExtraRuns(body.extraRuns ?? body.runs, 6);
    return { eventType: 'wide', runs: er };
  }
  if (type === 'no-ball' || type === 'noball') {
    const er = numExtraRuns(body.extraRuns ?? body.runs, 6);
    return { eventType: 'noball', runs: er };
  }
  if (type === 'run') {
    return { eventType: 'run', runs: parseRunValue(body.runs, 6) };
  }
  if (type === 'wicket') {
    return { eventType: 'wicket', runs: 0 };
  }
  if (type === 'bye') {
    return { eventType: 'bye', runs: parseRunValue(body.runs ?? body.extraRuns, 6) };
  }
  if (type === 'leg-bye' || type === 'legbye') {
    return { eventType: 'legbye', runs: parseRunValue(body.runs ?? body.extraRuns, 6) };
  }
  if (['run', 'wicket', 'wide', 'noball', 'bye', 'legbye'].includes(body.eventType)) {
    return { eventType: body.eventType, runs: body.runs ?? 0 };
  }
  return null;
}

async function emitMatchUpdate(io, matchId) {
  if (!io || typeof io.to !== 'function' || matchId == null) return;
  const populated = await Match.findById(matchId).populate(matchPopulate);
  const hydrated = await hydrateMatchTeams(populated);
  io.to(`match:${String(matchId)}`).emit('match:update', hydrated);
}

async function createMatch(req, res) {
  try {
    const {
      teamA,
      teamB,
      playerIds,
      battingOrder,
      totalOvers,
      striker,
      nonStriker,
      bowler,
    } = req.body;

    if (!teamA || !teamB || !totalOvers) {
      return res.status(400).json({ error: 'teamA, teamB, and totalOvers are required' });
    }

    const [ta, tb] = await Promise.all([Team.findById(teamA), Team.findById(teamB)]);
    if (!ta || !tb) {
      return res.status(404).json({ error: 'One or both teams not found' });
    }

    let ids = Array.isArray(playerIds) ? playerIds : [];
    if (!ids.length && ta._id) {
      const fromDb = await Player.find({ teamId: ta._id }).sort({ _id: 1 }).select('_id');
      ids = fromDb.map((p) => p._id);
    }
    let order = Array.isArray(battingOrder) && battingOrder.length ? battingOrder : ids;

    if (order.length < 2) {
      return res.status(400).json({
        error: 'At least 2 players are required for Team A (add players in Squads or pick batting order).',
      });
    }

    let bowlerId = bowler;
    if (!bowlerId && tb._id) {
      const firstFielder = await Player.findOne({ teamId: tb._id }).sort({ _id: 1 });
      if (firstFielder) bowlerId = firstFielder._id;
    }

    const strikerId = striker || order[0];
    const nonStrikerId = nonStriker || order[1];

    const match = await Match.create({
      teamA,
      teamB,
      players: ids.length ? ids : order,
      battingOrder: order,
      dismissedPlayers: [],
      totalOvers: Number(totalOvers),
      score: 0,
      wickets: 0,
      extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0 },
      overs: { completed: 0, balls: 0 },
      striker: strikerId,
      nonStriker: nonStrikerId,
      bowler: bowlerId,
      openingLineup: {
        striker: strikerId,
        nonStriker: nonStrikerId,
        bowler: bowlerId,
      },
      awaitingBowlerSelection: false,
      status: 'scheduled',
      createdBy: req.dbUser._id,
    });

    const populated = await Match.findById(match._id).populate(matchPopulate);
    const hydrated = await hydrateMatchTeams(populated);
    return res.status(201).json(hydrated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getMatchById(req, res) {
  try {
    const m = await Match.findById(req.params.id).populate(matchPopulate);
    if (!m) {
      return res.status(404).json({ error: 'Match not found' });
    }
    const hydrated = await hydrateMatchTeams(m);
    return res.json(hydrated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function listMatches(req, res) {
  try {
    const list = await Match.find().populate(matchPopulate).sort({ updatedAt: -1 }).limit(50);
    const hydrated = await Promise.all(list.map((doc) => hydrateMatchTeams(doc)));
    return res.json(hydrated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function changeBowler(req, res) {
  const io = req.app.get('io');
  try {
    const { bowlerId } = req.body;
    if (!bowlerId) {
      return res.status(400).json({ error: 'bowlerId is required' });
    }
    const match = await Match.findById(req.params.id);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    if (match.status === 'completed') {
      return res.status(400).json({ error: 'Match is completed' });
    }

    const bowlerPlayer = await Player.findOne({
      _id: bowlerId,
      teamId: match.teamB,
    });
    if (!bowlerPlayer) {
      return res.status(400).json({ error: 'Bowler must be a player on Team B (fielding side)' });
    }

    match.bowler = bowlerId;
    match.awaitingBowlerSelection = false;
    await match.save();

    await emitMatchUpdate(io, match._id);

    const populated = await Match.findById(match._id).populate(matchPopulate);
    const hydrated = await hydrateMatchTeams(populated);
    return res.json(hydrated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function addBall(req, res) {
  const io = req.app.get('io');
  try {
    const match = await Match.findById(req.params.id);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    if (match.awaitingBowlerSelection) {
      return res.status(400).json({ error: 'Select the next bowler before scoring' });
    }

    const normalized = normalizeBallBody(req.body);
    if (!normalized) {
      return res.status(400).json({
        error:
          'Invalid payload. Use type "run"|"wicket"|"wide"|"no-ball"|"bye"|"leg-bye" with runs or extraRuns as needed.',
      });
    }

    let ballLog;
    try {
      ballLog = applyDelivery(match, normalized);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const lastBall = await Ball.findOne({ matchId: match._id }).sort({ sequence: -1 });
    const sequence = (lastBall?.sequence || 0) + 1;

    await Ball.create({
      matchId: match._id,
      sequence,
      over: ballLog.over,
      ball: ballLog.ball,
      runs: ballLog.runs,
      extras: ballLog.extras,
      wicket: ballLog.wicket,
      strikerId: ballLog.strikerId,
      bowlerId: ballLog.bowlerId,
      eventType: ballLog.eventType,
      legalDelivery: ballLog.legalDelivery,
    });

    match.awaitingBowlerSelection = !!(ballLog.rotateForNewOver && match.status !== 'completed');
    await match.save();

    await applyDeliveryPlayerStats({
      eventType: ballLog.eventType,
      legalDelivery: ballLog.legalDelivery,
      totalRunsOnDelivery: ballLog.runs,
      batRunsCreditedToStriker: ballLog.batRunsCreditedToStriker,
      strikerBefore: ballLog.strikerId,
      bowlerBefore: ballLog.bowlerId,
    });

    const populated = await Match.findById(match._id).populate(matchPopulate);
    const hydrated = await hydrateMatchTeams(populated);

    if (io && typeof io.to === 'function' && match._id != null) {
      io.to(`match:${String(match._id)}`).emit('match:update', hydrated);
    }

    return res.json(hydrated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * LIFO undo: remove last ball (by over, ball, then sequence), reverse its player stats,
 * recalculate match from remaining balls.
 */
async function undoBall(req, res) {
  const io = req.app.get('io');
  try {
    const match = await Match.findById(req.params.id);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const lastBall = await Ball.findOne({ matchId: match._id }).sort({
      over: -1,
      ball: -1,
      sequence: -1,
    });

    if (!lastBall) {
      return res.status(400).json({ error: 'No ball to undo' });
    }

    await reverseDeliveryPlayerStats(lastBall);
    await Ball.deleteOne({ _id: lastBall._id });

    await recalculateMatchState(match._id);

    await emitMatchUpdate(io, match._id);

    const populated = await Match.findById(match._id).populate(matchPopulate);
    const hydrated = await hydrateMatchTeams(populated);
    return res.json(hydrated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  createMatch,
  getMatchById,
  listMatches,
  addBall,
  changeBowler,
  undoBall,
};
