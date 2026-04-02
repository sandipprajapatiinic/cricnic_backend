/**
 * Seeds demo teams + players into MongoDB (collection: players).
 * Re-run safely: removes only teams whose names start with "[Demo] ".
 *
 * Usage: npm run seed:demo
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Team = require('../src/models/Team');
const Player = require('../src/models/Player');

const DEMO_PREFIX = '[Demo] ';

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SQUADS = [
  {
    shortName: 'City Lions',
    players: [
      'Arjun Mehta',
      'Vikram Singh',
      'Rohan Iyer',
      'Karan Desai',
      'Neel Patel',
      'Siddharth Rao',
      'Dev Malhotra',
      'Yash Kulkarni',
      'Aman Verma',
      'Harsh Shah',
      'Kabir Nair',
    ],
  },
  {
    shortName: 'Valley Vipers',
    players: [
      'Rahul Kapoor',
      'Aditya Joshi',
      'Ishaan Reddy',
      'Varun Menon',
      'Pranav Gupta',
      'Nikhil Bose',
      'Sameer Khan',
      'Kunal Agarwal',
      'Manish Tiwari',
      'Suresh Pillai',
      'Ankit Saxena',
    ],
  },
];

async function removeOldDemo() {
  const re = new RegExp(`^${escapeRegex(DEMO_PREFIX)}`);
  const oldTeams = await Team.find({ name: re });
  const oldIds = oldTeams.map((t) => t._id);
  if (oldIds.length) {
    await Player.deleteMany({ teamId: { $in: oldIds } });
    await Team.deleteMany({ _id: { $in: oldIds } });
    console.log(`Removed ${oldIds.length} previous demo team(s) and their players.`);
  }
}

async function seed() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cricnic';
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  await removeOldDemo();

  for (const squad of SQUADS) {
    const teamName = `${DEMO_PREFIX}${squad.shortName}`;
    const team = await Team.create({ name: teamName, players: [] });
    const playerIds = [];
    for (const playerName of squad.players) {
      const p = await Player.create({
        name: playerName,
        teamId: team._id,
        stats: { runs: 0, balls: 0, wickets: 0, runsConceded: 0, ballsBowled: 0 },
      });
      playerIds.push(p._id);
    }
    team.players = playerIds;
    await team.save();
    console.log(`Created team "${teamName}" with ${playerIds.length} players.`);
  }

  await mongoose.disconnect();
  console.log('Demo seed finished.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
