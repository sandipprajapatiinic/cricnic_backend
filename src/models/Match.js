const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema(
  {
    teamA: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    teamB: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
    battingOrder: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
    dismissedPlayers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
    totalOvers: { type: Number, required: true, min: 1 },
    score: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    extras: {
      wides: { type: Number, default: 0 },
      noBalls: { type: Number, default: 0 },
      byes: { type: Number, default: 0 },
      legByes: { type: Number, default: 0 },
    },
    overs: {
      completed: { type: Number, default: 0 },
      balls: { type: Number, default: 0 },
    },
    striker: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    nonStriker: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    bowler: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    /** Snapshot at first delivery (for replay / undo). */
    openingLineup: {
      striker: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
      nonStriker: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
      bowler: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    },
    /** After 6 legal balls, scorer must pick next bowler before continuing. */
    awaitingBowlerSelection: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['scheduled', 'live', 'completed'],
      default: 'scheduled',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Match', matchSchema);
