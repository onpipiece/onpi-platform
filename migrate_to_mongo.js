/*
  migrate_to_mongo.js
  Usage:
    - create a `.env` with `MONGO_URI` or set env var directly
    - run: `node migrate_to_mongo.js`

  This script upserts users from `data.json` into the `users` collection.
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI not set. Set it in .env or environment variables.');
  process.exit(1);
}

const DATA_PATH = path.join(__dirname, 'data.json');
let raw = {};
try { raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8') || '{}'); } catch (e) { console.error('Failed to read data.json', e); process.exit(1); }
const users = raw.users || [];

const userSchema = new mongoose.Schema({
  cont: { type: String, unique: true, index: true },
  parola_hash: String,
  nume: String,
  email: String,
  telegram: String,
  telefon: String,
  createdAt: Date,
  token: String,
  purchased_packages: { type: Array, default: [] },
  active_package: { type: String, default: '0' },
  reset_token: String,
  reset_expires: Date,
  balance: { type: Number, default: 0 },
  withdrawals: { type: Array, default: [] },
  wallet: mongoose.Schema.Types.Mixed,
  stake: mongoose.Schema.Types.Mixed
}, { collection: 'users' });

const User = mongoose.models.User || mongoose.model('User', userSchema);

async function run() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  let inserted = 0, updated = 0, errored = 0, skipped = 0;

  for (const u of users) {
    if (!u || !u.cont) { skipped++; continue; }

    try {
      // Determine password hash
      let pass = u.parola_hash || u.parola || null;
      let parola_hash = pass;
      if (pass && !pass.startsWith('$2')) {
        parola_hash = await bcrypt.hash(String(pass), 10);
      }

      // purchased_packages could be stringified
      let purchased = [];
      try {
        if (typeof u.purchased_packages === 'string') purchased = JSON.parse(u.purchased_packages || '[]');
        else if (Array.isArray(u.purchased_packages)) purchased = u.purchased_packages;
      } catch (e) { purchased = []; }

      const doc = {
        cont: u.cont,
        parola_hash,
        nume: u.nume || u.name || '',
        email: u.email || '',
        telegram: u.telegram || '',
        telefon: u.telefon || u.phone || '',
        createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
        token: u.token || crypto.randomUUID(),
        purchased_packages: purchased,
        active_package: u.active_package || '0',
        reset_token: u.reset_token || null,
        reset_expires: u.reset_expires ? new Date(u.reset_expires) : null,
        balance: u.balance || 0,
        withdrawals: u.withdrawals || [],
        wallet: u.wallet || null,
        stake: u.stake || null
      };

      const res = await User.updateOne({ cont: doc.cont }, { $set: doc }, { upsert: true });
      if (res.upserted) inserted++; else updated++;
    } catch (e) {
      console.error('Error migrating user', u && u.cont, e && e.message);
      errored++;
    }
  }

  console.log(`Migration complete — inserted: ${inserted}, updated: ${updated}, skipped: ${skipped}, errors: ${errored}`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => { console.error('Migration failed', err); process.exit(1); });
