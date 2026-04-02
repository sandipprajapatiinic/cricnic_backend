const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    stats: {
      runs: { type: Number, default: 0 },
      balls: { type: Number, default: 0 },
      wickets: { type: Number, default: 0 },
      runsConceded: { type: Number, default: 0 },
      ballsBowled: { type: Number, default: 0 },
    },
  },
  { timestamps: true, collection: 'players' }
);

module.exports = mongoose.model('Player', playerSchema);
