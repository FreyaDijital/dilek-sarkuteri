/**
 * Veritabanı kurulum script'i (SQLite).
 *   npm run db:init           -> şema + göçler (+ veritabanı boşsa başlangıç verileri)
 *   npm run db:init -- --seed -> başlangıç verilerini her durumda yeniden uygula
 *
 * Uygulama artık açılışta aynı işi kendi yapıyor (bkz. db/bootstrap.js), bu yüzden
 * canlı sunucuda bu script'i elle çalıştırmak gerekmez. Yerelde veritabanını
 * sıfırdan kurmak ya da --seed ile başlangıç metinlerini tazelemek için durur.
 *
 * Tekrar çalıştırmak güvenlidir.
 */
require('dotenv').config();
const db = require('../config/db');
const bootstrap = require('../db/bootstrap');

function main() {
  // --seed: seed.sql'i veritabanı dolu olsa da uygula.
  const seed = process.argv.includes('--seed') ? true : 'auto';
  const { applied, seeded, fresh } = bootstrap(db, { seed });

  console.log('✓ schema.sql çalıştırıldı');
  console.log(applied.length
    ? `✓ ${applied.length} göç uygulandı: ${applied.join(', ')}`
    : '✓ göçler güncel');
  if (seeded) {
    console.log(fresh
      ? '✓ seed.sql çalıştırıldı (ilk kurulum)'
      : '✓ seed.sql çalıştırıldı (--seed)');
  } else {
    console.log('· seed.sql atlandı (veritabanı zaten dolu, --seed ile zorlayabilirsiniz)');
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
