const settingModel = require('../models/setting');
const helpers = require('../utils/helpers');
const { uploadUrl } = require('../config/paths');

/**
 * Her istekte ayarları ve yardımcıları res.locals'a koyar,
 * böylece tüm şablonlar `settings`, `formatPrice`, `waLink` vb. kullanabilir.
 *
 * ÖNEMLİ: Önce güvenli varsayılanlar yazılır, sonra veritabanından gelen
 * gerçek değerlerle üzerine yazılır. Sebebi: ayarlar okunamazsa (veritabanı
 * kilitli, tablo yok, vb.) res.locals boş kalır, hata sayfası site layout'unu
 * render ederken header'daki ilk değişkende ReferenceError atar ve ASIL hata
 * kaybolur. Varsayılanlar sayesinde hata sayfası her koşulda çizilebiliyor.
 */
function applyDefaults(req, res) {
  res.locals.settings = {};
  res.locals.currentUser = (req.session && req.session.user) || null;
  res.locals.currentPath = req.path || '/';
  res.locals.uploadUrl = uploadUrl;

  res.locals.imageSrc = (value) => helpers.imageUrl(value) || helpers.PLACEHOLDER_IMG;
  res.locals.hasImage = (value) => Boolean(helpers.imageUrl(value));

  res.locals.showPrices = false;
  res.locals.logoSrc = null;
  res.locals.flash = null;

  Object.assign(res.locals, helpers);

  res.locals.waLink = (message) => helpers.whatsappLink(null, message);
}

module.exports = async function locals(req, res, next) {
  applyDefaults(req, res);

  try {
    const settings = await settingModel.getMap();
    res.locals.settings = settings;

    // Fiyatlar sitede gösterilsin mi? (Ayarlar > Genel > Fiyatları sitede göster)
    res.locals.showPrices = settings.show_prices === '1';
    // Logo: panelden yüklenmiş ya da public/img'den seçilmiş görsel
    res.locals.logoSrc = helpers.imageUrl(settings.logo);

    // Sipariş butonları için hazır WhatsApp linki
    res.locals.waLink = (message) =>
      helpers.whatsappLink(settings.whatsapp_intl || settings.whatsapp, message);

    // Tek kullanımlık bildirimler (flash)
    res.locals.flash = (req.session && req.session.flash) || null;
    if (req.session) delete req.session.flash;

    next();
  } catch (err) {
    // Varsayılanlar yerinde olduğu için hata sayfası düzgün çizilir
    // ve buradaki gerçek hata görünür kalır.
    next(err);
  }
};

/** Rotalardan kullanım: setFlash(req, 'success', 'Kaydedildi.') */
module.exports.setFlash = function setFlash(req, type, message) {
  if (req.session) req.session.flash = { type, message };
};
