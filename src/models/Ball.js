const mongoose = require('mongoose');

const extrasSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['none', 'wide', 'noball', 'bye', 'legbye'], default: 'none' },
    count: { type: Number, default: 0 },
    /** Additional runs on wide (beyond 1) or bat runs on no-ball */
    extraRuns: { type: Number, default: 0 },
  },
  { _id: false }
);

const ballSchema = new mongoose.Schema(
  {
    matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true, index: true },
    sequence: { type: Number, required: true },
    over: { type: Number, required: true },
    ball: { type: Number, required: true },
    runs: { type: Number, default: 0 },
    extras: { type: extrasSchema, default: () => ({}) },
    wicket: { type: Boolean, default: false },
    strikerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
    bowlerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
    eventType: {
      type: String,
      enum: ['run', 'wicket', 'wide', 'noball', 'bye', 'legbye'],
      required: true,
    },
    legalDelivery: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ballSchema.index({ matchId: 1, sequence: 1 }, { unique: true });

module.exports = mongoose.model('Ball', ballSchema);
