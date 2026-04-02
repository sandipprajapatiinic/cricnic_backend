const Player = require('../models/Player');
const Team = require('../models/Team');

async function createPlayer(req, res) {
  try {
    const { name, teamId } = req.body;
    if (!name || !teamId) {
      return res.status(400).json({ error: 'name and teamId are required' });
    }
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }
    const player = await Player.create({
      name: String(name).trim(),
      teamId,
      stats: { runs: 0, balls: 0, wickets: 0, runsConceded: 0, ballsBowled: 0 },
    });
    team.players.push(player._id);
    await team.save();
    return res.status(201).json(player);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function listPlayers(req, res) {
  try {
    const { teamId } = req.query;
    const q = teamId ? { teamId } : {};
    const players = await Player.find(q).populate('teamId', 'name').sort({ name: 1 });
    return res.json(players);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { createPlayer, listPlayers };
