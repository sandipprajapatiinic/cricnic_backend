const mongoose = require('mongoose');
const Team = require('../models/Team');
const Player = require('../models/Player');
const Match = require('../models/Match');
const Ball = require('../models/Ball');
const { hydrateTeam, hydrateTeams } = require('../services/teamPlayers');

async function createTeam(req, res) {
  try {
    const { name, playerIds } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    const team = await Team.create({
      name: name.trim(),
      players: Array.isArray(playerIds) ? playerIds : [],
      createdBy: req.dbUser._id,
    });
    const out = await hydrateTeam(team);
    return res.status(201).json(out);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function listTeams(req, res) {
  try {
    const teams = await Team.find().sort({ updatedAt: -1 });
    const out = await hydrateTeams(teams);
    return res.json(out);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Removes the team, its players, and any matches (plus balls) that reference this team as teamA or teamB.
 */
async function deleteTeam(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid team id' });
    }
    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }
    const matches = await Match.find({
      $or: [{ teamA: team._id }, { teamB: team._id }],
    }).select('_id');
    const matchIds = matches.map((m) => m._id);
    if (matchIds.length) {
      await Ball.deleteMany({ matchId: { $in: matchIds } });
      await Match.deleteMany({ _id: { $in: matchIds } });
    }
    await Player.deleteMany({ teamId: team._id });
    await Team.deleteOne({ _id: team._id });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { createTeam, listTeams, deleteTeam };
