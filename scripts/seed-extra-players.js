/**
 * Inserts extra player documents (collection: players)
 * and attaches them to "[Demo] City Lions" (create that team first: npm run seed:demo).
 *
 * Usage: npm run seed:players
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Team = require('../src/models/Team');
const Player = require('../src/models/Player');

const TARGET_TEAM = '[Demo] City Lions';

const EXTRA_PLAYERS = [
  'Rishabh Khanna',
  'Irfan Qureshi',
  'Tarun Bhatt',
  'Mohit Chauhan',
  'Sanjay Krishnan',
  'Faizal Ahmed',
  'Gaurav Sinha',
  'Deepak Thakur',
];

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cricnic';
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);

  const team = await Team.findOne({ name: TARGET_TEAM });
  if (!team) {
    console.error(
      `Team "${TARGET_TEAM}" not found. Run: npm run seed:demo\n` +
        'Or create a team in the app and set TARGET_TEAM in scripts/seed-extra-players.js'
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  let added = 0;
  for (const name of EXTRA_PLAYERS) {
    const exists = await Player.findOne({ teamId: team._id, name });
    if (exists) {
      console.log(`Skip (already exists): ${name}`);
      continue;
    }
    const p = await Player.create({
      name,
      teamId: team._id,
      stats: { runs: 0, balls: 0, wickets: 0, runsConceded: 0, ballsBowled: 0 },
    });
    team.players.push(p._id);
    added += 1;
    console.log(`Added: ${name}`);
  }
  if (added) await team.save();

  console.log(`Done. Added ${added} player(s) to "${TARGET_TEAM}".`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
