const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { UPLOAD_DIR, UPLOAD_MAX_SIZE } = require('../config/paths');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const storage = multer.diskStorage({
  // Hedef klasör .env'deki UPLOAD_DIR - uygulama klasörünün dışında.
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const stamp = Date.now();
    const rand = crypto.randomBytes(6).toString('hex');
    cb(null, `${stamp}-${rand}${ALLOWED_EXT.has(ext) ? ext : '.jpg'}`);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Sadece JPG, PNG, WEBP veya GIF yükleyebilirsiniz.'));
  }
  return cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: UPLOAD_MAX_SIZE, files: 1 },
});

/** Tek görsel alanı için kısayol: uploadSingle('image') */
const uploadSingle = (field) => upload.single(field);

module.exports = { upload, uploadSingle };
