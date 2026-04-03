const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    firebaseUid: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: false, trim: true, lowercase: true },
    role: {
      type: String,
      enum: ['user', 'scorer', 'admin'],
      default: 'user',
    },
    isProfileComplete: { type: Boolean, default: false },
    dateOfBirth: { type: String },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    profileImageUrl: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
