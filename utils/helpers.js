// EJS şablonlarında res.locals üzerinden kullanılan yardımcılar.
const fs = require('fs');
const path = require('path');

const { uploadUrl } = require('../config/paths');

const PUBLIC_IMG_DIR = path.join(__dirname, '..', 'public', 'img');
const PLACEHOLDER_IMG = '/img/placeholder.svg';
const PLACEHOLDER_BG = '/img/placeholder-bg.svg'; // yazısız; başlık arka planları için

/**
 * Görsel değerleri iki kaynaktan gelebilir:
 *   'foo.jpg'      -> panelden yüklenmiş, UPLOAD_DIR içinde (deploy'dan etkilenmez)
 *   'img/foo.jpg'  -> repodaki public/img klasöründen seçilmiş
 * Ayrım bu önekle yapılır; eski kayıtlar öneksiz olduğu için yükleme sayılır.
 */
const GALLERY_PREFIX = 'img/';
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const isGalleryImage = (value) => typeof value === 'string' && value.startsWith(GALLERY_PREFIX);

/** public/img içindeki seçilebilir görselleri listeler (placeholder'lar hariç). */
function galleryImages() {
  try {
    return fs.readdirSync(PUBLIC_IMG_DIR)
      .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
      .filter((f) => !f.startsWith('placeholder'))
      .sort((a, b) => a.localeCompare(b, 'tr'));
  } catch (err) {
    return [];
  }
}

/** Dosya adını okunur etikete çevirir: 'patlican-salatasi.jpg' -> 'Patlican salatasi' */
function prettyFileName(file) {
  const base = String(file || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  return base ? base.charAt(0).toLocaleUpperCase('tr') + base.slice(1) : '';
}

/** Veritabanındaki görsel değerini URL'e çevirir; dosya yoksa null döner. */
function imageUrl(value) {
  if (!value) return null;
  if (isGalleryImage(value)) {
    const safe = path.basename(value);
    return fs.existsSync(path.join(PUBLIC_IMG_DIR, safe)) ? `/img/${safe}` : null;
  }
  return uploadUrl(value);
}

function formatPrice(value, unit) {
  if (value === null || value === undefined || value === '') return 'Fiyat için arayınız';
  const n = Number(value);
  if (Number.isNaN(n)) return 'Fiyat için arayınız';
  const formatted = n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return unit ? `${formatted} ₺ / ${unit}` : `${formatted} ₺`;
}

function formatDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Telefon numarasını tel: linki için sadeleştirir
function telLink(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('90') ? `+${digits}` : `+90${digits.replace(/^0/, '')}`;
}

/**
 * WhatsApp sipariş linki. Online satış yok; tüm sipariş butonları buraya gider.
 * number: "905424787605" formatında (settings.whatsapp_intl)
 */
function whatsappLink(number, message) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return '#';
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

function excerpt(text, length = 140) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length <= length ? s : `${s.slice(0, length).trimEnd()}…`;
}

// Çok satırlı metni boş satırlardan paragraflara böler (şablonda <p> ile basılır).
function paragraphs(text) {
  return String(text || '')
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Panelden girilen Google Harita embed kodundan sadece iframe src'sini alır.
 * Ham HTML sayfaya basılmaz; yalnızca google.com/maps adresleri kabul edilir.
 */
function mapEmbedSrc(code) {
  const s = String(code || '').trim();
  const m = s.match(/src\s*=\s*["']([^"']+)["']/i);
  const src = (m ? m[1] : s).replace(/&amp;/g, '&');
  return /^https:\/\/(www\.)?google\.[a-z.]+\/maps\/embed/i.test(src) ? src : null;
}

/**
 * Tasarımdaki sabit görseller (public/img). Dosya henüz konmadıysa placeholder döner;
 * aynı adla gerçek fotoğraf yüklenince kod değişmeden görünür.
 */
function siteImage(name, { background = false } = {}) {
  const fallback = background ? PLACEHOLDER_BG : PLACEHOLDER_IMG;
  if (!name) return fallback;
  const safe = path.basename(String(name));
  return fs.existsSync(path.join(PUBLIC_IMG_DIR, safe)) ? `/img/${safe}` : fallback;
}

module.exports = {
  PLACEHOLDER_IMG,
  GALLERY_PREFIX, isGalleryImage, galleryImages, prettyFileName, imageUrl,
  formatPrice, formatDate, telLink, whatsappLink, excerpt, paragraphs, mapEmbedSrc, siteImage,
};
