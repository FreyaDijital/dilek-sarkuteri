const fs = require('fs');
const path = require('path');
const migrations = require('./migrations');

/**
 * Veritabanını kullanıma hazır hale getirir: tablolar + şema göçleri.
 *
 * Uygulama her açılışta bunu çağırır (app.js), böylece sunucuda elle
 * `npm run db:init` çalıştırmak gerekmez. Tüm adımlar tekrar çalıştırmaya
 * karşı güvenlidir: schema.sql yalnızca CREATE ... IF NOT EXISTS içerir,
 * göçler ise `migrations` tablosunda tutulup bir kez uygulanır.
 *
 * seed.sql AYRI tutulur ve varsayılan olarak yalnızca ilk kurulumda çalışır:
 * içindeki ON CONFLICT ... DO UPDATE kategorilerin adını ve açıklamasını
 * tazelediği için, her açılışta çalıştırmak panelden yapılan düzenlemeleri
 * geri alırdı.
 *
 * @param {object} db   config/db modülü (exec/queryOne/run sağlayan sarmalayıcı)
 * @param {'auto'|true|false} [opts.seed]  'auto': yalnızca boş veritabanında
 * @returns {{ applied: string[], seeded: boolean, fresh: boolean }}
 */
function bootstrap(db, { seed = 'auto' } = {}) {
  const sql = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');

  // 1) Tablolar. Mevcut bir veritabanında hiçbir şeyi değiştirmez.
  db.exec(sql('schema.sql'));

  // 2) "İlk kurulum mu?" sorusu göçlerden ÖNCE sorulur: bazı göçler
  //    (örn. 003) settings tablosuna kayıt ekler ve sorulduğu anı kaçırırsak
  //    sıfırdan kurulan veritabanı dolu görünüp seed hiç çalışmazdı.
  const fresh = !db.queryOne('SELECT 1 FROM settings LIMIT 1');

  // 3) Şema göçleri.
  const applied = migrations.run(db);

  // 4) Başlangıç verileri.
  const seeded = seed === true || (seed === 'auto' && fresh);
  if (seeded) db.exec(sql('seed.sql'));

  return { applied, seeded, fresh };
}

module.exports = bootstrap;
