/**
 * Sets each Team.players[] to all Player _ids where player.teamId matches the team.
 * Fixes teams created before players existed or manual DB edits.
 *
 * Usage: npm run sync:team-refs
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Team = require('../src/models/Team');
const Player = require('../src/models/Player');

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cricnic';
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  const teams = await Team.find();
  let updated = 0;
  for (const team of teams) {
    const plist = await Player.find({ teamId: team._id }).sort({ _id: 1 });
    const ids = plist.map((p) => p._id);
    team.players = ids;
    await team.save();
    updated += 1;
    console.log(`Team "${team.name}": ${ids.length} player ref(s)`);
  }
  console.log(`Synced ${updated} team(s).`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
