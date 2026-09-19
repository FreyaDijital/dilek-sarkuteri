require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

/**
 * Veritabanı dosyasının yolu .env içindeki DB_PATH'ten okunur.
 * Varsayılan: ./data/dilek.db
 */
const DB_PATH = path.resolve(
  process.env.DB_PATH || path.join(__dirname, '..', 'data', 'dilek.db')
);

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');   // eşzamanlı okuma/yazma
db.pragma('foreign_keys = ON');    // FK kısıtları SQLite'ta varsayılan olarak kapalı
db.pragma('busy_timeout = 5000');  // kilitli tabloda 5 sn bekle

/**
 * better-sqlite3 undefined bağlamayı reddeder, boolean kabul etmez.
 * Parametreleri güvenli tiplere çevirir.
 */
function normalize(params) {
  return (params || []).map((v) => {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
    return v;
  });
}

/** SELECT — tüm satırlar */
function query(sql, params = []) {
  return db.prepare(sql).all(...normalize(params));
}

/** SELECT — tek satır, yoksa null */
function queryOne(sql, params = []) {
  return db.prepare(sql).get(...normalize(params)) || null;
}

/** INSERT / UPDATE / DELETE — { insertId, changes } */
function run(sql, params = []) {
  const res = db.prepare(sql).run(...normalize(params));
  return { insertId: Number(res.lastInsertRowid), changes: res.changes };
}

/** Çok ifadeli SQL (şema kurulumu) */
function exec(sql) {
  db.exec(sql);
}

/** Fonksiyonu tek bir işlem (transaction) içinde çalıştırır. */
function transaction(fn) {
  return db.transaction(fn);
}

function close() {
  db.close();
}

module.exports = { db, DB_PATH, query, queryOne, run, exec, transaction, close };
