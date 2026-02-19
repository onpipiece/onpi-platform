const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const crypto = require('crypto');

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  console.log('Supabase configured:', process.env.SUPABASE_URL);
}

let mongoConnected = false;
let User = null;
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
      mongoConnected = true;
      console.log('MongoDB connected');
    })
    .catch(err => console.error('MongoDB connection error', err));

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

  User = mongoose.models.User || mongoose.model('User', userSchema);
}

const app = express();
app.use(cors());
app.use(express.json());

const DATA_PATH = path.join(__dirname, 'data.json');
function readData(){
  try { return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8') || '{}'); }
  catch(e){ return { users: [] }; }
}
function writeData(data){ fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2)); }

async function findUserByCont(cont){
  if (mongoConnected && User) {
    try { return await User.findOne({ cont }).lean().exec(); }
    catch(e){ console.error('Mongo findUserByCont error', e); }
  }
  if (supabase) {
    const { data, error } = await supabase.from('users').select('*').eq('cont', cont).limit(1);
    if (error) return null;
    return (data && data[0]) || null;
  }
  const d = readData(); return d.users.find(u => u.cont === cont);
}

async function findUserByToken(token){
  if (mongoConnected && User) {
    try { return await User.findOne({ token }).lean().exec(); }
    catch(e){ console.error('Mongo findUserByToken error', e); }
  }
  if (supabase) {
    const { data, error } = await supabase.from('users').select('*').eq('token', token).limit(1);
    if (error) return null;
    return (data && data[0]) || null;
  }
  const d = readData(); return d.users.find(u => u.token === token);
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, msg: 'api running' });
});

app.post('/api/register', async (req, res) => {
  const { cont, parola, nume, email, telegram, telefon } = req.body;
  if (!cont || !parola || !email || !telefon || !nume) return res.status(400).json({ ok: false, err: 'missing_fields' });
  if (typeof nume !== 'string' || nume.trim().length < 3) return res.status(400).json({ ok: false, err: 'invalid_name' });
  if (typeof email !== 'string' || !email.includes('@')) return res.status(400).json({ ok: false, err: 'invalid_email' });
  if (typeof telefon !== 'string' || telefon.trim().length < 7) return res.status(400).json({ ok: false, err: 'invalid_phone' });
  if (await findUserByCont(cont)) return res.status(409).json({ ok: false, err: 'user_exists' });

  const parola_hash = await bcrypt.hash(parola, 10);
  const newUser = {
    cont,
    parola_hash,
    nume: nume || '',
    email: email || '',
    telegram: telegram || '',
    telefon: telefon || '',
    createdAt: new Date(),
    token: crypto.randomUUID(),
    purchased_packages: [],
    active_package: '0'
  };

  if (mongoConnected && User) {
    try {
      const created = await User.create(newUser);
      return res.json({ ok: true, token: created.token, user: { id: created._id, cont: created.cont, nume: created.nume, email: created.email } });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ ok: false, err: 'user_exists' });
      console.error('Mongo register error', e);
      return res.status(500).json({ ok: false, err: 'mongo_error' });
    }
  }

  if (supabase) {
    const insert = { ...newUser, createdAt: newUser.createdAt.toISOString(), purchased_packages: JSON.stringify(newUser.purchased_packages) };
    const { data, error } = await supabase.from('users').insert(insert).select();
    if (error) return res.status(500).json({ ok: false, err: 'supabase_error', detail: error.message });
    const created = data && data[0] ? data[0] : newUser;
    return res.json({ ok: true, token: created.token, user: { id: created.id, cont: created.cont, nume: created.nume, email: created.email } });
  }

  const data = readData();
  data.users.push(Object.assign({ id: Date.now(), createdAt: newUser.createdAt.toISOString() }, newUser));
  writeData(data);
  res.json({ ok: true, token: newUser.token, user: { id: data.users[data.users.length-1].id, cont: newUser.cont, nume: newUser.nume, email: newUser.email } });
});

app.post('/api/login', async (req, res) => {
  const { cont, parola } = req.body;
  const user = await findUserByCont(cont);
  if (!user) return res.status(401).json({ ok: false, err: 'invalid_credentials' });
  const storedHash = user.parola_hash || user.parola || null;
  if (!storedHash) return res.status(401).json({ ok: false, err: 'invalid_credentials' });
  const match = await bcrypt.compare(parola, storedHash);
  if (!match) return res.status(401).json({ ok: false, err: 'invalid_credentials' });
  res.json({ ok: true, token: user.token, user: { id: user.id, cont: user.cont, nume: user.nume, email: user.email } });
});

// Forgot password: generate a temporary reset token, persist it and send email if SMTP configured
app.post('/api/forgot-password', async (req, res) => {
  const { identifier } = req.body || {};
  if (!identifier) return res.status(400).json({ ok: false, err: 'missing_identifier' });

  const id = (identifier || '').toString().trim();
  let user = await findUserByCont(id);

  // If not found by cont, try by email (Mongo -> Supabase -> local)
  if (!user) {
    const escapeRegex = s => s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    if (mongoConnected && User) {
      try {
        const re = new RegExp('^' + escapeRegex(id) + '$', 'i');
        user = await User.findOne({ email: re }).lean().exec();
      } catch (e) { console.error('Mongo email lookup error', e); }
    }
    if (!user && supabase) {
      try {
        const { data, error } = await supabase.from('users').select('*').ilike('email', id).limit(1);
        if (error) return res.status(500).json({ ok: false, err: 'supabase_error', detail: error.message });
        user = (data && data[0]) || null;
      } catch (e) {
        return res.status(500).json({ ok: false, err: 'supabase_error', detail: e.message });
      }
    }
    if (!user) {
      const d = readData();
      user = (d.users || []).find(u => (u.email || '').toLowerCase() === id.toLowerCase()) || null;
    }
  }

  // Always respond OK to avoid user enumeration
  if (!user) return res.json({ ok: true, message: 'If an account exists, instructions will be sent.' });

  // generate token
  const token = crypto.randomBytes(24).toString('hex');
  const expires = Date.now() + 60 * 60 * 1000; // 1 hour

  // persist token
  try {
    if (mongoConnected && User) {
      try {
        await User.updateOne({ cont: user.cont }, { $set: { reset_token: token, reset_expires: new Date(expires) } });
      } catch (e) { console.error('Mongo persist reset token error', e); return res.status(500).json({ ok: false, err: 'mongo_error' }); }
    } else if (supabase) {
      const updates = { reset_token: token, reset_expires: new Date(expires).toISOString() };
      const { error } = await supabase.from('users').update(updates).eq('cont', user.cont);
      if (error) return res.status(500).json({ ok: false, err: 'supabase_error', detail: error.message });
    } else {
      const d = readData();
      const idx = (d.users || []).findIndex(u => u.cont === user.cont);
      if (idx >= 0) {
        d.users[idx].reset_token = token;
        d.users[idx].reset_expires = new Date(expires).toISOString();
        writeData(d);
      }
    }
  } catch (e) {
    console.error('Error persisting reset token', e);
    return res.status(500).json({ ok: false, err: 'persist_error' });
  }

  // send email if SMTP config exists
  if (process.env.SMTP_HOST && process.env.SMTP_USER && user.email) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === '1' || false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });

      const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
      const resetUrl = `${appUrl.replace(/\/$/, '')}/reset-password?token=${token}`;

      const mail = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: user.email,
        subject: 'ONPI - Resetare parolă',
        text: `Ai solicitat resetarea parolei. Accesează linkul pentru a reseta parola (valabil 1h): ${resetUrl}`,
        html: `<p>Ai solicitat resetarea parolei.</p><p>Accesează linkul pentru a reseta parola (valabil 1h):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
      };

      await transporter.sendMail(mail);
      return res.json({ ok: true, message: 'Email trimis cu instrucțiuni dacă contul există.' });
    } catch (e) {
      console.error('Error sending reset email', e);
      // fall through to debug response below
    }
  }

  // In non-production or when DEBUG_PASSWORD_RESET=1 return token for development convenience
  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_PASSWORD_RESET === '1') {
    return res.json({ ok: true, debug: true, token, message: 'Token returned for debugging (not sent by email).' });
  }

  return res.json({ ok: true, message: 'If an account exists, instructions will be sent.' });
});

// Reset password: verify token and set new password
app.post('/api/reset-password', async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) return res.status(400).json({ ok: false, err: 'missing_fields' });
  if (typeof newPassword !== 'string' || newPassword.length < 6) return res.status(400).json({ ok: false, err: 'password_too_short' });

  // find user by token
  let user = null;
  try {
    if (mongoConnected && User) {
      try { user = await User.findOne({ reset_token: token }).lean().exec(); }
      catch(e) { console.error('Mongo find by reset token', e); }
    } else if (supabase) {
      const { data, error } = await supabase.from('users').select('*').eq('reset_token', token).limit(1);
      if (error) return res.status(500).json({ ok: false, err: 'supabase_error', detail: error.message });
      user = (data && data[0]) || null;
    } else {
      const d = readData();
      user = (d.users || []).find(u => u.reset_token === token) || null;
    }
  } catch (e) {
    console.error('Error finding user by reset token', e);
    return res.status(500).json({ ok: false, err: 'lookup_error' });
  }

  if (!user) return res.status(400).json({ ok: false, err: 'invalid_or_expired_token' });

  const expires = user.reset_expires ? Date.parse(user.reset_expires) : 0;
  if (!expires || Date.now() > expires) return res.status(400).json({ ok: false, err: 'invalid_or_expired_token' });

  // hash new password
  try {
    const newHash = await bcrypt.hash(newPassword, 10);

    if (mongoConnected && User) {
      try {
        await User.updateOne({ cont: user.cont }, { $set: { parola_hash: newHash, reset_token: null, reset_expires: null } });
      } catch (e) { console.error('Mongo update password error', e); return res.status(500).json({ ok: false, err: 'mongo_error' }); }
    } else if (supabase) {
      const updates = { parola_hash: newHash, reset_token: null, reset_expires: null };
      const { error } = await supabase.from('users').update(updates).eq('cont', user.cont);
      if (error) return res.status(500).json({ ok: false, err: 'supabase_error', detail: error.message });
    } else {
      const d = readData();
      const idx = (d.users || []).findIndex(u => u.cont === user.cont);
      if (idx === -1) return res.status(404).json({ ok: false, err: 'not_found' });
      d.users[idx].parola_hash = newHash;
      d.users[idx].reset_token = null;
      d.users[idx].reset_expires = null;
      writeData(d);
    }

    return res.json({ ok: true, message: 'Password updated' });
  } catch (e) {
    console.error('Error updating password', e);
    return res.status(500).json({ ok: false, err: 'update_error' });
  }
});

// Change password endpoint (requires Bearer token)
app.post('/api/change-password', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  const user = await findUserByToken(token);
  if (!user) return res.status(401).json({ ok: false, err: 'unauthorized' });
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ ok: false, err: 'missing_fields' });
  const storedHash = user.parola_hash || user.parola || null;
  const match = storedHash ? await bcrypt.compare(oldPassword, storedHash) : false;
  if (!match) return res.status(403).json({ ok: false, err: 'wrong_password' });
  const newHash = await bcrypt.hash(newPassword, 10);
  // Update in Supabase or local data.json
  if (mongoConnected && User) {
    try { await User.updateOne({ cont: user.cont }, { $set: { parola_hash: newHash } }); }
    catch (e) { console.error('Mongo change-password error', e); return res.status(500).json({ ok: false, err: 'mongo_error' }); }
  } else if (supabase) {
    const { error } = await supabase.from('users').update({ parola_hash: newHash }).eq('cont', user.cont);
    if (error) return res.status(500).json({ ok: false, err: 'supabase_error', detail: error.message });
  } else {
    const data = readData();
    const idx = data.users.findIndex(u => u.cont === user.cont);
    if (idx >= 0) { data.users[idx].parola_hash = newHash; writeData(data); }
  }
  res.json({ ok: true });
});

app.get('/api/profile', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  const user = await findUserByToken(token);
  if (!user) return res.status(401).json({ ok: false, err: 'unauthorized' });
  const id = user._id || user.id;
  const purchased_packages = typeof user.purchased_packages === 'string' ? JSON.parse(user.purchased_packages || '[]') : (user.purchased_packages || []);
  res.json({ ok: true, user: { id, cont: user.cont, nume: user.nume, email: user.email, telegram: user.telegram, telefon: user.telefon, createdAt: user.createdAt, purchased_packages, active_package: user.active_package } });
});

// List users (admin/overview) - returns limited fields
app.get('/api/users', async (req, res) => {
  if (mongoConnected && User) {
    try {
      const data = await User.find().lean().exec();
      const users = (data || []).map(u => ({ id: u._id || u.id, cont: u.cont, nume: u.nume, email: u.email, balance: u.balance || 0, purchased_packages: u.purchased_packages || [], active_package: u.active_package || '0', withdrawals: u.withdrawals || [] }));
      return res.json({ ok: true, users });
    } catch (e) { console.error('Mongo users error', e); return res.status(500).json({ ok: false, err: 'mongo_error' }); }
  }
  if (supabase) {
    const { data, error } = await supabase.from('users').select('*');
    if (error) return res.status(500).json({ ok: false, err: 'supabase_error', detail: error.message });
    const users = (data || []).map(u => {
      const purchased = typeof u.purchased_packages === 'string' ? JSON.parse(u.purchased_packages || '[]') : (u.purchased_packages || []);
      return {
        id: u.id, cont: u.cont, nume: u.nume, email: u.email,
        balance: u.balance || 0,
        purchased_packages: purchased,
        active_package: u.active_package || '0',
        withdrawals: u.withdrawals || []
      };
    });
    return res.json({ ok: true, users });
  }
  const d = readData();
  const users = (d.users || []).map(u => ({ id: u.id, cont: u.cont, nume: u.nume, email: u.email, balance: u.balance || 0, purchased_packages: u.purchased_packages || [], active_package: u.active_package || '0', withdrawals: u.withdrawals || [] }));
  res.json({ ok: true, users });
});

// Get user by cont (public-ish, returns limited fields)
app.get('/api/user/:cont', async (req, res) => {
  const cont = req.params.cont;
  const user = await findUserByCont(cont);
  if (!user) return res.status(404).json({ ok: false, err: 'not_found' });
  const id = user._id || user.id;
  const purchased_packages = typeof user.purchased_packages === 'string' ? JSON.parse(user.purchased_packages || '[]') : (user.purchased_packages || []);
  res.json({ ok: true, user: { id, cont: user.cont, nume: user.nume, email: user.email, telegram: user.telegram, telefon: user.telefon, createdAt: user.createdAt, purchased_packages, active_package: user.active_package, wallet: user.wallet, balance: user.balance, stake: user.stake } });
});

// Update current user (authenticated)
app.post('/api/user/update', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  const user = await findUserByToken(token);
  if (!user) return res.status(401).json({ ok: false, err: 'unauthorized' });
  const updates = req.body.updates || {};
  // ensure not overwriting token/id/cont unintentionally
  delete updates.id; delete updates.token; delete updates.cont;

  if (mongoConnected && User) {
    try {
      if (updates.purchased_packages && Array.isArray(updates.purchased_packages)) {
        // keep as array
      }
      await User.updateOne({ cont: user.cont }, { $set: updates });
      const updated = await User.findOne({ cont: user.cont }).lean().exec();
      return res.json({ ok: true, user: updated });
    } catch (e) { console.error('Mongo update user error', e); return res.status(500).json({ ok: false, err: 'mongo_error' }); }
  }

  if (supabase) {
    // stringify purchased_packages if array
    if (updates.purchased_packages && Array.isArray(updates.purchased_packages)) updates.purchased_packages = JSON.stringify(updates.purchased_packages);
    const { data, error } = await supabase.from('users').update(updates).eq('cont', user.cont).select();
    if (error) return res.status(500).json({ ok: false, err: 'supabase_error', detail: error.message });
    const updated = data && data[0] ? data[0] : null;
    return res.json({ ok: true, user: updated });
  }

  // local fallback
  const d = readData();
  const idx = d.users.findIndex(u => u.cont === user.cont);
  if (idx === -1) return res.status(404).json({ ok: false, err: 'not_found' });
  d.users[idx] = Object.assign({}, d.users[idx], updates);
  writeData(d);
  return res.json({ ok: true, user: d.users[idx] });
});

// Serve static files (the existing index.html)
app.use(express.static(__dirname));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('API listening on', port));
