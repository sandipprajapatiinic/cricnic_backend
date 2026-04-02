const mongoose = require('mongoose');
const Player = require('../models/Player');
const Ball = require('../models/Ball');

function refToIdString(ref) {
  if (ref == null) return null;
  if (typeof ref === 'object' && ref._id != null) return String(ref._id);
  return String(ref);
}

function playerKey(p) {
  if (!p || p._id == null) return null;
  return String(p._id);
}

async function playersByTeamId(teamId) {
  if (!teamId) return [];
  return Player.find({ teamId }).sort({ name: 1 }).lean();
}

/** Current over number being bowled (1-based), same logic as scoring display. */
function currentOverNumber(overs) {
  const c = overs?.completed ?? 0;
  return c + 1;
}

async function bowlingFiguresThisOver(matchId, overNum) {
  if (matchId == null) return new Map();
  const mid =
    matchId instanceof mongoose.Types.ObjectId ? matchId : new mongoose.Types.ObjectId(String(matchId));
  const rows = await Ball.aggregate([
    { $match: { matchId: mid, over: overNum } },
    {
      $group: {
        _id: '$bowlerId',
        balls: { $sum: { $cond: ['$legalDelivery', 1, 0] } },
        runs: { $sum: '$runs' },
      },
    },
  ]);
  const map = new Map();
  for (const r of rows) {
    if (r._id == null) continue;
    map.set(String(r._id), { balls: r.balls, runs: r.runs });
  }
  return map;
}

async function hydrateTeam(teamDoc) {
  const t = teamDoc.toObject ? teamDoc.toObject() : { ...teamDoc };
  t.players = await playersByTeamId(t._id);
  return t;
}

async function hydrateTeams(teamDocs) {
  return Promise.all(teamDocs.map((doc) => hydrateTeam(doc)));
}

function formatLastDelivery(b) {
  if (!b) return '';
  const et = b.eventType;
  const er = b.extras?.extraRuns ?? 0;
  const runs = b.runs ?? 0;
  switch (et) {
    case 'run':
      return String(runs);
    case 'wicket':
      return 'OUT';
    case 'wide':
      return er ? `WD+${er}` : 'WD';
    case 'noball':
      return er ? `NB+${er}` : 'NB';
    case 'bye':
      return runs ? `B+${runs}` : 'BYE';
    case 'legbye':
      return runs ? `LB+${runs}` : 'LB';
    default:
      return '—';
  }
}

/**
 * Full team squads + striker/non-striker/bowler aligned to latest Player docs (stats),
 * plus per-bowler balls/runs in the current over.
 */
async function hydrateMatchTeams(matchDoc) {
  const m = matchDoc.toObject ? matchDoc.toObject() : { ...matchDoc };

  if (m.teamA && m.teamA._id) {
    const batting = await playersByTeamId(m.teamA._id);
    const batMap = new Map(
      batting.map((p) => [playerKey(p), p]).filter((e) => e[0] != null)
    );
    m.teamA = { ...m.teamA, players: batting };

    const sid = refToIdString(m.striker);
    if (sid && batMap.has(sid)) m.striker = batMap.get(sid);
    const nid = refToIdString(m.nonStriker);
    if (nid && batMap.has(nid)) m.nonStriker = batMap.get(nid);
  }

  if (m.teamB && m.teamB._id) {
    const overNum = currentOverNumber(m.overs);
    const figMap = await bowlingFiguresThisOver(m._id, overNum);

    const fielding = await playersByTeamId(m.teamB._id);
    const fieldWithFigs = fielding.map((p) => ({
      ...p,
      figuresThisOver: figMap.get(playerKey(p) ?? '') || { balls: 0, runs: 0 },
    }));
    const fieldMap = new Map(
      fieldWithFigs.map((p) => [playerKey(p), p]).filter((e) => e[0] != null)
    );
    m.teamB = { ...m.teamB, players: fieldWithFigs };

    const bid = refToIdString(m.bowler);
    if (bid && fieldMap.has(bid)) m.bowler = fieldMap.get(bid);
  }

  const mid = m._id instanceof mongoose.Types.ObjectId ? m._id : new mongoose.Types.ObjectId(String(m._id));
  m.deliveryCount = await Ball.countDocuments({ matchId: mid });

  const lastBall = await Ball.findOne({ matchId: mid }).sort({ sequence: -1 }).lean();
  m.lastDeliveryLabel = lastBall ? formatLastDelivery(lastBall) : '—';

  return m;
}

module.exports = {
  playersByTeamId,
  hydrateTeam,
  hydrateTeams,
  hydrateMatchTeams,
};
