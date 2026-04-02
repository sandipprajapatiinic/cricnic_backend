const mongoose = require('mongoose');

async function connectDb() {
  //const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cricnic';
  const uri = process.env.MONGODB_URI || 'mongodb+srv://cricnic:GEqbyQ2GujOVZoC8@cluster0.obq2pwg.mongodb.net/cricnic_db';
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  return mongoose.connection;
}

module.exports = { connectDb };
