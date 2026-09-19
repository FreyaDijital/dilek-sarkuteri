require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');

const { db, DB_PATH, close: closeDb } = require('./config/db');
const { UPLOAD_DIR, UPLOAD_URL_PATH, ensureUploadDir } = require('./config/paths');
const locals = require('./middleware/locals');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Hostinger uygulamayı ters vekil arkasında çalıştırır; secure cookie için gerekli.
app.set('trust proxy', 1);

// ---- Görünümler ----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/site');
app.set('layout extractScripts', true);
// CSS/JS 7 gün önbelleklenir; her açılışta değişen sürüm eski dosyanın kalmasını önler.
app.locals.assetVersion = Date.now().toString(36);

// ---- İstek gövdesi ----
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(methodOverride('_method')); // formlardan PUT/DELETE

// ---- Statik dosyalar ----
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

// Yüklenen görseller uygulama klasörünün DIŞINDAN sunulur (UPLOAD_DIR).
ensureUploadDir();
app.use(
  UPLOAD_URL_PATH,
  express.static(UPLOAD_DIR, { maxAge: '30d', fallthrough: true, index: false })
);

// ---- Oturum ----
// `sessions` tablosunu store kendisi oluşturur, şemada tanımlı değildir.
const sessionStore = new SqliteStore({
  client: db,
  expired: { clear: true, intervalMs: 15 * 60 * 1000 },
});

app.use(
  session({
    name: 'dilek.sid',
    secret: process.env.SESSION_SECRET || 'gelistirme-icin-gecici-anahtar',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.SESSION_SECURE === 'true',
      maxAge: Number(process.env.SESSION_MAX_AGE) || 8 * 60 * 60 * 1000,
    },
  })
);

// ---- Şablon değişkenleri (ayarlar, yardımcılar, flash) ----
app.use(locals);

// ---- Rotalar ----
app.use('/admin', require('./routes/admin'));
app.use('/', require('./routes/site'));

// ---- 404 / hata ----
app.use(notFound);
app.use(errorHandler);

// ---- Başlat ----
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`Dilek Şarküteri  →  http://localhost:${PORT}`);
    console.log(`Veritabanı       →  ${DB_PATH}`);
    console.log(`Görsel klasörü   →  ${UPLOAD_DIR}`);
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} alındı, kapatılıyor...`);
    server.close(() => {
      try { closeDb(); } catch (_) { /* yoksay */ }
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
