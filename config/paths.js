require('dotenv').config();
const fs = require('fs');
const path = require('path');

/**
 * Görsellerin yazılacağı klasör.
 * Hostinger'da her deploy'da uygulama klasörü silindiği için bu yol
 * uygulamanın DIŞINDA olmalı ve .env içinden okunur.
 */
const UPLOAD_DIR = path.resolve(
  process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads')
);

// Görsellerin web'de sunulacağı yol (örn. /uploads)
const UPLOAD_URL_PATH = (process.env.UPLOAD_URL_PATH || '/uploads').replace(/\/+$/, '') || '/uploads';

const UPLOAD_MAX_SIZE = Number(process.env.UPLOAD_MAX_SIZE) || 5 * 1024 * 1024;

/** Klasör yoksa oluşturur, yazılabilir değilse anlaşılır bir hata verir. */
function ensureUploadDir() {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.accessSync(UPLOAD_DIR, fs.constants.W_OK);
  } catch (err) {
    throw new Error(
      `UPLOAD_DIR kullanılamıyor: ${UPLOAD_DIR}\n` +
      `  ${err.message}\n` +
      `  .env içindeki UPLOAD_DIR değerini kontrol edin; klasör uygulama dışında ve yazılabilir olmalı.`
    );
  }
  return UPLOAD_DIR;
}

/** Dosya adından public URL üretir. */
function uploadUrl(filename) {
  if (!filename) return null;
  return `${UPLOAD_URL_PATH}/${filename}`;
}

/**
 * Yüklenmiş bir görseli diskten siler.
 * Dosya adı dışında bir şey (yol ayracı, ..) kabul edilmez; böylece
 * veritabanındaki bozuk bir değer UPLOAD_DIR dışına çıkamaz.
 * Dosya yoksa sessizce geçer - kayıt silme işlemini bloklamamalı.
 */
function removeUpload(filename) {
  if (!filename) return false;
  const safe = path.basename(String(filename));
  if (!safe || safe === '.' || safe === '..' || safe !== filename) return false;
  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, safe));
    return true;
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Görsel silinemedi:', safe, err.message);
    return false;
  }
}

module.exports = {
  UPLOAD_DIR,
  UPLOAD_URL_PATH,
  UPLOAD_MAX_SIZE,
  ensureUploadDir,
  uploadUrl,
  removeUpload,
};
