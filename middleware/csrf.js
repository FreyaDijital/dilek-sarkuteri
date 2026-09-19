const crypto = require('crypto');
const { removeUpload } = require('../config/paths');

/**
 * Senkronize token (synchronizer token) yöntemiyle CSRF koruması.
 * Panelde silme/güncelleme işlemleri form POST'u ile yapıldığı için,
 * başka bir sitenin kullanıcının oturumuyla istek göndermesini engeller.
 *
 * Token oturumda tutulur, formlara gizli `_csrf` alanı olarak basılır.
 */

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

function tokensMatch(sent, expected) {
  const a = Buffer.from(String(sent || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function reject(req, next) {
  // multer doğrulamadan önce çalıştıysa diske yazılmış dosyayı temizle
  if (req.file) removeUpload(req.file.filename);

  const err = new Error('Oturum doğrulaması başarısız. Sayfayı yenileyip tekrar deneyin.');
  err.status = 403;
  return next(err);
}

/**
 * Token üretir, şablonlara `csrfToken` olarak verir ve yazma isteklerini doğrular.
 *
 * multipart/form-data isteklerinde gövde henüz multer tarafından
 * ayrıştırılmadığı için doğrulama ATLANIR; bu rotalarda multer'dan SONRA
 * `csrf.verify` çalıştırılmalıdır.
 */
function csrf(req, res, next) {
  if (!req.session) return next();

  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (SAFE_METHODS.includes(req.method)) return next();
  if (req.is('multipart/form-data')) return next(); // multer sonrası csrf.verify doğrular

  return tokensMatch(req.body && req.body._csrf, req.session.csrfToken)
    ? next()
    : reject(req, next);
}

/** multipart rotalarında multer'dan SONRA kullanılır. */
csrf.verify = function verify(req, res, next) {
  if (!req.session) return next();
  return tokensMatch(req.body && req.body._csrf, req.session.csrfToken)
    ? next()
    : reject(req, next);
};

module.exports = csrf;
