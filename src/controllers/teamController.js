const Team = require('../models/Team');
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

module.exports = { createTeam, listTeams };
