/**
 * Şema göçleri (migration).
 *
 * schema.sql yalnızca CREATE TABLE IF NOT EXISTS içerir; mevcut bir
 * veritabanındaki tabloyu değiştirmez. Sütun/kısıt değişiklikleri buraya
 * yazılır ve `migrations` tablosunda tutularak bir kez uygulanır.
 *
 * Yeni göç eklerken: listenin SONUNA ekleyin, adını asla değiştirmeyin.
 */

const MIGRATIONS = [
  {
    name: '001-settings-input-type-checkbox-image',
    // SQLite'ta CHECK kısıtı ALTER ile değiştirilemez; tablo yeniden kurulur.
    // Amaç: input_type'a 'checkbox' (fiyat toggle) ve 'image' (logo) eklemek.
    up(db) {
      const hasNewTypes = db
        .queryOne("SELECT sql FROM sqlite_master WHERE type='table' AND name='settings'");
      if (hasNewTypes && hasNewTypes.sql.includes("'checkbox'")) return;

      db.exec(`
        CREATE TABLE settings_new (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          setting_key    TEXT    NOT NULL UNIQUE,
          setting_value  TEXT,
          setting_group  TEXT    NOT NULL DEFAULT 'genel',
          label          TEXT,
          input_type     TEXT    NOT NULL DEFAULT 'text'
                                 CHECK (input_type IN ('text','textarea','tel','email','url','checkbox','image')),
          sort_order     INTEGER NOT NULL DEFAULT 0,
          updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        INSERT INTO settings_new (id, setting_key, setting_value, setting_group, label, input_type, sort_order, updated_at)
          SELECT id, setting_key, setting_value, setting_group, label, input_type, sort_order, updated_at FROM settings;

        DROP TABLE settings;
        ALTER TABLE settings_new RENAME TO settings;

        CREATE INDEX IF NOT EXISTS ix_settings_group ON settings (setting_group, sort_order);

        CREATE TRIGGER IF NOT EXISTS trg_settings_updated
        AFTER UPDATE ON settings FOR EACH ROW
        BEGIN
          UPDATE settings SET updated_at = datetime('now') WHERE id = OLD.id;
        END;
      `);
    },
  },

  {
    name: '002-products-origin',
    // Ürünün yöresi/menşei - "peynirin nereden geldiğini biliyoruz" vaadi için.
    up(db) {
      const cols = db.query('PRAGMA table_info(products)').map((c) => c.name);
      if (!cols.includes('origin')) {
        db.exec('ALTER TABLE products ADD COLUMN origin TEXT');
      }
    },
  },
];

function ensureTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name        TEXT NOT NULL PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

/** Uygulanmamış göçleri sırayla çalıştırır. Uygulanan göç adlarını döndürür. */
function run(db) {
  ensureTable(db);
  const applied = new Set(db.query('SELECT name FROM migrations').map((r) => r.name));
  const done = [];

  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) continue;
    m.up(db);
    db.run('INSERT INTO migrations (name) VALUES (?)', [m.name]);
    done.push(m.name);
  }

  return done;
}

module.exports = { MIGRATIONS, run };
