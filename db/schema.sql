-- ============================================================
--  Dilek Şarküteri - Veritabanı Şeması (SQLite / better-sqlite3)
--
--  Notlar:
--   - SQLite'ta ENUM yok        -> TEXT + CHECK kısıtı
--   - AUTO_INCREMENT yok        -> INTEGER PRIMARY KEY AUTOINCREMENT
--   - ON UPDATE CURRENT_TIMESTAMP yok -> updated_at için trigger
--   - Tarihler TEXT olarak tutulur: 'YYYY-MM-DD' / 'YYYY-MM-DD HH:MM:SS'
--   - sessions tablosunu better-sqlite3-session-store kendi oluşturur
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- users : Admin paneli kullanıcıları
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT    NOT NULL UNIQUE,
  full_name      TEXT,
  email          TEXT    UNIQUE,
  password_hash  TEXT    NOT NULL,                      -- bcrypt hash
  role           TEXT    NOT NULL DEFAULT 'admin'
                         CHECK (role IN ('admin','editor')),
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  last_login_at  TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS trg_users_updated
AFTER UPDATE ON users FOR EACH ROW
BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- ------------------------------------------------------------
-- categories : Ürün kategorileri (Meze, Peynir, Şarküteri)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  slug         TEXT    NOT NULL UNIQUE,                 -- URL: /urunler/meze
  description  TEXT,
  image        TEXT,                                    -- UPLOAD_DIR içindeki dosya adı
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_categories_active_order
  ON categories (is_active, sort_order);

CREATE TRIGGER IF NOT EXISTS trg_categories_updated
AFTER UPDATE ON categories FOR EACH ROW
BEGIN
  UPDATE categories SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- ------------------------------------------------------------
-- products : Ürünler
--   Online satış yok; price sadece vitrin amaçlı, NULL bırakılabilir.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id   INTEGER REFERENCES categories (id) ON DELETE SET NULL ON UPDATE CASCADE,
  name          TEXT    NOT NULL,
  slug          TEXT    NOT NULL UNIQUE,
  short_desc    TEXT,                                   -- kart üzerindeki kısa açıklama
  description   TEXT,
  origin        TEXT,                                   -- yöre / menşe, örn. 'Ezine, Çanakkale'
  price         REAL,                                   -- NULL ise "Fiyat için arayınız"
  unit          TEXT    NOT NULL DEFAULT 'kg',          -- kg / adet / porsiyon
  image         TEXT,
  is_featured   INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0,1)),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_products_category     ON products (category_id);
CREATE INDEX IF NOT EXISTS ix_products_active_order ON products (is_active, sort_order);
CREATE INDEX IF NOT EXISTS ix_products_featured     ON products (is_featured, is_active);

CREATE TRIGGER IF NOT EXISTS trg_products_updated
AFTER UPDATE ON products FOR EACH ROW
BEGIN
  UPDATE products SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- ------------------------------------------------------------
-- campaigns : Kampanyalar
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT    NOT NULL,
  slug          TEXT    NOT NULL UNIQUE,
  short_desc    TEXT,
  description   TEXT,
  image         TEXT,
  starts_at     TEXT,                                   -- 'YYYY-MM-DD', NULL = sınır yok
  ends_at       TEXT,                                   -- 'YYYY-MM-DD', NULL = sınır yok
  is_published  INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0,1)),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_campaigns_published
  ON campaigns (is_published, starts_at, ends_at);

CREATE TRIGGER IF NOT EXISTS trg_campaigns_updated
AFTER UPDATE ON campaigns FOR EACH ROW
BEGIN
  UPDATE campaigns SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- ------------------------------------------------------------
-- branches : Şubeler (ana sayfadaki şube kartları)
--   Adres/telefon/saat alanları boş bırakılabilir; kartta yalnızca
--   dolu olanlar çizilir. map_url boşsa adresten yol tarifi linki üretilir.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  address     TEXT,
  phone       TEXT,
  hours       TEXT,                                    -- satır başına bir aralık
  map_url     TEXT,                                    -- Google Haritalar bağlantısı
  note        TEXT,                                    -- "Açılış hazırlıkları sürüyor" gibi
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

-- ------------------------------------------------------------
-- settings : İletişim bilgileri, çalışma saatleri, sosyal medya
--   Anahtar/değer deposu - panelden düzenlenir.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key    TEXT    NOT NULL UNIQUE,
  setting_value  TEXT,
  setting_group  TEXT    NOT NULL DEFAULT 'genel',      -- genel / iletisim / saatler / sosyal
  label          TEXT,                                  -- panelde form etiketi
  input_type     TEXT    NOT NULL DEFAULT 'text'
                         CHECK (input_type IN ('text','textarea','tel','email','url','checkbox','image')),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_settings_group
  ON settings (setting_group, sort_order);

CREATE TRIGGER IF NOT EXISTS trg_settings_updated
AFTER UPDATE ON settings FOR EACH ROW
BEGIN
  UPDATE settings SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- ------------------------------------------------------------
-- messages : İletişim formundan gelen mesajlar
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  email       TEXT,
  phone       TEXT,
  subject     TEXT,
  body        TEXT    NOT NULL,
  ip_address  TEXT,
  is_read     INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_messages_read_created
  ON messages (is_read, created_at);
