const db = require('../config/db');

/** Tüm ayarları { key: value } nesnesi olarak döndürür. */
async function getMap() {
  const rows = db.query('SELECT setting_key, setting_value FROM settings');
  return rows.reduce((acc, r) => {
    acc[r.setting_key] = r.setting_value;
    return acc;
  }, {});
}

/** Panelde form üretmek için gruplanmış tam kayıtlar. */
async function getGrouped() {
  const rows = db.query('SELECT * FROM settings ORDER BY setting_group, sort_order, id');
  return rows.reduce((acc, r) => {
    (acc[r.setting_group] = acc[r.setting_group] || []).push(r);
    return acc;
  }, {});
}

async function get(key) {
  const row = db.queryOne('SELECT setting_value FROM settings WHERE setting_key = ?', [key]);
  return row ? row.setting_value : null;
}

// Tek bir işlemde (transaction) toplu güncelleme - ya hepsi ya hiçbiri.
const updateAll = db.transaction((entries) => {
  for (const [key, value] of entries) {
    db.run('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [
      value === undefined || value === null ? '' : String(value),
      key,
    ]);
  }
});

/** { key: value } nesnesindeki mevcut ayarları toplu günceller. */
async function updateMany(values) {
  const entries = Object.entries(values || {});
  if (!entries.length) return 0;
  updateAll(entries);
  return entries.length;
}

module.exports = { getMap, getGrouped, get, updateMany };
