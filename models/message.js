const db = require('../config/db');

async function create({ name, email = null, phone = null, subject = null, body, ipAddress = null }) {
  const res = db.run(
    `INSERT INTO messages (name, email, phone, subject, body, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, email || null, phone || null, subject || null, body, ipAddress]
  );
  return res.insertId;
}

async function list({ unreadOnly = false, limit } = {}) {
  const where = unreadOnly ? 'WHERE is_read = 0' : '';
  const limitSql = Number(limit) > 0 ? `LIMIT ${Math.min(Number(limit), 500)}` : '';
  return db.query(`SELECT * FROM messages ${where} ORDER BY created_at DESC, id DESC ${limitSql}`);
}

async function findById(id) {
  return db.queryOne('SELECT * FROM messages WHERE id = ? LIMIT 1', [id]);
}

async function markRead(id, isRead = true) {
  db.run('UPDATE messages SET is_read = ? WHERE id = ?', [isRead ? 1 : 0, id]);
}

async function remove(id) {
  return db.run('DELETE FROM messages WHERE id = ?', [id]).changes > 0;
}

async function unreadCount() {
  const row = db.queryOne('SELECT COUNT(*) AS n FROM messages WHERE is_read = 0');
  return row ? row.n : 0;
}

module.exports = { create, list, findById, markRead, remove, unreadCount };
