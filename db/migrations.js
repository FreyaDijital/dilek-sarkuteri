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
  {
    name: '003-branches-and-home-sections',
    // Ana sayfadaki üç yeni bölüm: Şubeler (tablo) + Dükkânda Yiyin ve
    // Organizasyonlar (metinleri settings'ten gelir, panelden düzenlenir).
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS branches (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT    NOT NULL,
          address     TEXT,
          phone       TEXT,
          hours       TEXT,
          map_url     TEXT,
          note        TEXT,
          sort_order  INTEGER NOT NULL DEFAULT 0,
          is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
          created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS ix_branches_active_order
          ON branches (is_active, sort_order);

        CREATE TRIGGER IF NOT EXISTS trg_branches_updated
        AFTER UPDATE ON branches FOR EACH ROW
        BEGIN
          UPDATE branches SET updated_at = datetime('now') WHERE id = OLD.id;
        END;
      `);

      // MEVCUT kurulumlarda merkez şube, panelde zaten girili iletişim
      // bilgilerinden doldurulur; ikinci kart adı dışında boş bırakılır ki
      // panelde doldurulmadan siteye uydurma adres/telefon çıkmasın.
      //
      // Sıfırdan kurulumda bu göç seed.sql'den ÖNCE çalışır, yani ayarlar
      // henüz yoktur: o durumda tablo boş bırakılır ve şubeleri seed.sql kurar.
      const get = (key) => {
        const row = db.queryOne('SELECT setting_value FROM settings WHERE setting_key = ?', [key]);
        return row ? row.setting_value : null;
      };
      const { n } = db.queryOne('SELECT COUNT(*) AS n FROM branches');
      if (n === 0 && get('address')) {
        const hours = [get('hours_weekday'), get('hours_sunday')].filter(Boolean).join('\n');

        db.run(
          `INSERT INTO branches (name, address, phone, hours, sort_order, is_active)
           VALUES (?, ?, ?, ?, 1, 1)`,
          ['Suadiye (Merkez)', get('address'), get('phone') || null, hours || null]
        );
        db.run(
          `INSERT INTO branches (name, note, sort_order, is_active)
           VALUES (?, ?, 2, 1)`,
          ['Şaşkınbakkal', 'Açılış hazırlıkları sürüyor. Adres ve telefon panelden girilebilir.']
        );
      }

      // Yeni bölümlerin metinleri. Mevcut kurulumlarda da görünsün diye
      // seed.sql'in yanı sıra burada da eklenir (değer varsa korunur).
      db.exec(`
        INSERT INTO settings (setting_key, setting_value, setting_group, label, input_type, sort_order) VALUES
          ('branches_enabled', '1', 'subeler', 'Şubeler bölümünü ana sayfada göster', 'checkbox', 1),
          ('branches_eyebrow', 'Şubelerimiz', 'subeler', 'Üst Yazı', 'text', 2),
          ('branches_title',   'İki tezgâh, aynı ciddiyet', 'subeler', 'Başlık', 'text', 3),
          ('branches_text',    '', 'subeler', 'Açıklama', 'textarea', 4),

          ('dine_in_enabled', '1', 'dukkanda', 'Dükkânda Yiyin bölümünü ana sayfada göster', 'checkbox', 1),
          ('dine_in_eyebrow', 'Dükkânda yiyin', 'dukkanda', 'Üst Yazı', 'text', 2),
          ('dine_in_title',   'Tezgâhın başında bir tabak', 'dukkanda', 'Başlık', 'text', 3),
          ('dine_in_text',
           'Aldığınızı paket yaptırmak zorunda değilsiniz. Dükkânda oturup günün mezelerinden bir tabak, serpme kahvaltı ya da tezgâhta hazırlanan sandviçlerden birini yiyebilirsiniz.',
           'dukkanda', 'Açıklama', 'textarea', 4),
          ('dine_in_items', 'Meze tabağı\nKahvaltı\nSandviç', 'dukkanda', 'Maddeler (her satır bir madde)', 'textarea', 5),

          ('events_enabled', '1', 'organizasyon', 'Organizasyonlar bölümünü ana sayfada göster', 'checkbox', 1),
          ('events_eyebrow', 'Organizasyonlar', 'organizasyon', 'Üst Yazı', 'text', 2),
          ('events_title',   'Kalabalık bir sofra mı kuruyorsunuz?', 'organizasyon', 'Başlık', 'text', 3),
          ('events_text',
           'Toplu meze siparişi, davet ve organizasyonlar için tezgâh sizin adınıza çalışır. Kişi sayısını ve tarihi söyleyin, menüyü birlikte çıkaralım.',
           'organizasyon', 'Açıklama', 'textarea', 4),
          ('events_items', 'Toplu meze siparişi\nDavet ve kutlamalar\nKurumsal ikramlar', 'organizasyon', 'Maddeler (her satır bir madde)', 'textarea', 5),
          ('events_cta',      'WhatsApp''tan teklif alın', 'organizasyon', 'Buton Yazısı', 'text', 6),
          ('events_wa_message', 'Merhaba, organizasyon için toplu sipariş hakkında bilgi almak istiyorum.', 'organizasyon', 'WhatsApp Mesajı', 'text', 7)
        ON CONFLICT (setting_key) DO UPDATE SET
          setting_group = excluded.setting_group,
          label         = excluded.label,
          input_type    = excluded.input_type,
          sort_order    = excluded.sort_order;
      `);
    },
  },
  {
    name: '004-popup-and-video',
    // Pop-up duyuru ve tanıtım videosu. İkisi de settings'te tutulur ama
    // panelde kendi sayfalarından yönetilir (Ayarlar sayfasında görünmezler).
    up(db) {
      db.exec(`
        INSERT INTO settings (setting_key, setting_value, setting_group, label, input_type, sort_order) VALUES
          ('popup_enabled',     '0', 'popup', 'Pop-up duyuruyu sitede göster', 'checkbox', 1),
          ('popup_title',       '',  'popup', 'Başlık',      'text',     2),
          ('popup_text',        '',  'popup', 'Metin',       'textarea', 3),
          ('popup_image',       '',  'popup', 'Görsel',      'image',    4),
          ('popup_button_text', '',  'popup', 'Buton Yazısı','text',     5),
          ('popup_button_url',  '',  'popup', 'Buton Linki', 'url',      6),

          ('video_url',     '', 'video', 'YouTube veya Vimeo Linki', 'url',      1),
          ('video_eyebrow', 'Tanıtım', 'video', 'Üst Yazı',  'text',     2),
          ('video_title',   'Tezgâhın arkasında bir gün', 'video', 'Başlık', 'text', 3),
          ('video_text',    '',  'video', 'Açıklama',    'textarea', 4)
        ON CONFLICT (setting_key) DO UPDATE SET
          setting_group = excluded.setting_group,
          label         = excluded.label,
          input_type    = excluded.input_type,
          sort_order    = excluded.sort_order;
      `);
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
