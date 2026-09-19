/**
 * Veritabanı kurulum script'i (SQLite).
 *   npm run db:init           -> sadece şema
 *   npm run db:init -- --seed -> şema + başlangıç verileri
 *
 * Tekrar çalıştırmak güvenlidir: tüm ifadeler IF NOT EXISTS / ON CONFLICT ile yazılmıştır.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const migrations = require('../db/migrations');

function main() {
  const withSeed = process.argv.includes('--seed');
  const files = ['schema.sql', ...(withSeed ? ['seed.sql'] : [])];

  // Sıra önemli: önce tablolar, sonra şema göçleri, en son veriler.
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  db.exec(schema);
  console.log('✓ schema.sql çalıştırıldı');

  const applied = migrations.run(db);
  console.log(applied.length
    ? `✓ ${applied.length} göç uygulandı: ${applied.join(', ')}`
    : '✓ göçler güncel');

  for (const file of files.filter((f) => f !== 'schema.sql')) {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'db', file), 'utf8');
    db.exec(sql);
    console.log(`✓ ${file} çalıştırıldı`);
  }

  console.log(`\nVeritabanı: ${db.DB_PATH}`);
  console.log('Admin kullanıcısı için: npm run admin:create');
}

try {
  main();
} catch (err) {
  console.error('Hata:', err.message);
  process.exitCode = 1;
} finally {
  db.close();
}
