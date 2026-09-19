const bcrypt = require('bcryptjs');
const db = require('../config/db');

const ROUNDS = 12;

async function findByUsername(username) {
  return db.queryOne('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
}

async function findById(id) {
  return db.queryOne(
    'SELECT id, username, full_name, email, role, is_active, last_login_at FROM users WHERE id = ? LIMIT 1',
    [id]
  );
}

async function create({ username, fullName = null, email = null, password, role = 'admin' }) {
  const hash = await bcrypt.hash(password, ROUNDS);
  const res = db.run(
    `INSERT INTO users (username, full_name, email, password_hash, role)
     VALUES (?, ?, ?, ?, ?)`,
    [username, fullName, email || null, hash, role]
  );
  return res.insertId;
}

async function verifyPassword(user, password) {
  if (!user || !user.password_hash) return false;
  return bcrypt.compare(password, user.password_hash);
}

async function updatePassword(id, password) {
  const hash = await bcrypt.hash(password, ROUNDS);
  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
}

async function touchLogin(id) {
  db.run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", [id]);
}

async function count() {
  const row = db.queryOne('SELECT COUNT(*) AS n FROM users');
  return row ? row.n : 0;
}

module.exports = { findByUsername, findById, create, verifyPassword, updatePassword, touchLogin, count };
