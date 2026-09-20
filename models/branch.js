const db = require('../config/db');
const ordering = require('./ordering');

const ORDER_BY = 'sort_order, name';

/** Site tarafı: sadece aktif şubeler. Panel: hepsi. */
async function all({ activeOnly = false } = {}) {
  const where = activeOnly ? 'WHERE is_active = 1' : '';
  return db.query(`SELECT * FROM branches ${where} ORDER BY ${ORDER_BY}`);
}

async function findById(id) {
  return db.queryOne('SELECT * FROM branches WHERE id = ? LIMIT 1', [id]);
}

const emptyToNull = (v) => {
  const s = v === undefined || v === null ? '' : String(v).trim();
  return s || null;
};

async function create({ name, address, phone, hours, mapUrl, note, sortOrder = 0, isActive = 1 }) {
  const res = db.run(
    `INSERT INTO branches (name, address, phone, hours, map_url, note, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      emptyToNull(address),
      emptyToNull(phone),
      emptyToNull(hours),
      emptyToNull(mapUrl),
      emptyToNull(note),
      Number(sortOrder) || 0,
      isActive ? 1 : 0,
    ]
  );
  return res.insertId;
}

async function update(id, { name, address, phone, hours, mapUrl, note, sortOrder = 0, isActive = 1 }) {
  const current = await findById(id);
  if (!current) return false;

  db.run(
    `UPDATE branches
        SET name = ?, address = ?, phone = ?, hours = ?, map_url = ?, note = ?,
            sort_order = ?, is_active = ?
      WHERE id = ?`,
    [
      name,
      emptyToNull(address),
      emptyToNull(phone),
      emptyToNull(hours),
      emptyToNull(mapUrl),
      emptyToNull(note),
      Number(sortOrder) || 0,
      isActive ? 1 : 0,
      id,
    ]
  );
  return true;
}

async function remove(id) {
  return db.run('DELETE FROM branches WHERE id = ?', [id]).changes > 0;
}

/** is_active alanını tersine çevirir, yeni değeri döner. */
async function toggle(id) {
  const row = db.queryOne('SELECT is_active AS value FROM branches WHERE id = ?', [id]);
  if (!row) return null;
  const next = row.value ? 0 : 1;
  db.run('UPDATE branches SET is_active = ? WHERE id = ?', [next, id]);
  return next;
}

/** Listede yukarı/aşağı taşır. */
async function move(id, direction) {
  return ordering.move({ table: 'branches', orderBy: ORDER_BY, id, direction });
}

async function count({ activeOnly = false } = {}) {
  const row = db.queryOne(
    `SELECT COUNT(*) AS n FROM branches ${activeOnly ? 'WHERE is_active = 1' : ''}`
  );
  return row ? row.n : 0;
}

module.exports = { all, findById, create, update, remove, toggle, move, count };
