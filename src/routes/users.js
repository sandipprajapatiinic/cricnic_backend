const express = require('express');
const { firebaseAuth } = require('../middleware/firebaseAuth');
const User = require('../models/User');

const router = express.Router();

router.get('/me', firebaseAuth, (req, res) => {
  res.json(req.dbUser);
});

router.put('/me', firebaseAuth, async (req, res) => {
  try {
    const updates = req.body;
    const updatePayload = {};
    const allowedFields = ['name', 'fullName', 'dateOfBirth', 'gender', 'profileImageUrl'];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        // Map fullName (frontend) to name (backend model)
        if (field === 'fullName') {
          updatePayload.name = updates[field];
        } else {
          updatePayload[field] = updates[field];
        }
      }
    });

    if (Object.keys(updatePayload).length > 0) {
      updatePayload.isProfileComplete = true; // Mark as complete upon updating
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.dbUser._id,
      { $set: updatePayload },
      { new: true }
    );

    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
