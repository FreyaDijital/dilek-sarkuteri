// EJS şablonlarında res.locals üzerinden kullanılan yardımcılar.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { uploadUrl, UPLOAD_DIR } = require('../config/paths');

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
  // Yüklenen dosya diskte yoksa (UPLOAD_DIR yanlış ya da deploy'da silinmiş)
  // bozuk görsel kutusu yerine placeholder görünsün diye null döneriz.
  const upload = path.basename(String(value));
  return fs.existsSync(path.join(UPLOAD_DIR, upload)) ? uploadUrl(upload) : null;
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

/**
 * Kampanya kartları için kısa tarih: "12 Ekim". Yıl, içinde bulunduğumuz
 * yıldan farklıysa eklenir ("12 Ekim 2027") ki gelecek sezon kampanyaları
 * bu yılınmış gibi okunmasın.
 */
function formatDateShort(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const opts = { day: 'numeric', month: 'long' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('tr-TR', opts);
}

/** "12 Ekim – 30 Ekim". Uçlardan biri boşsa tek taraflı metin döner. */
function formatDateRange(startsAt, endsAt) {
  const start = formatDateShort(startsAt);
  const end = formatDateShort(endsAt);
  if (start && end) return `${start} – ${end}`;
  if (end) return `Son gün: ${end}`;
  if (start) return `${start}'den itibaren`;
  return '';
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
 * Panelden çok satırlı girilen alanları (şube saatleri, madde listeleri)
 * satırlara böler. Boş satırlar atılır.
 */
function lines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
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
 * Panelden girilen YouTube/Vimeo adresini gömülebilir (iframe) adrese çevirir.
 * Tanınmayan ya da boş adreste null döner; bölüm o zaman hiç çizilmez.
 * Yalnızca bu iki sağlayıcı kabul edilir, rastgele bir adres iframe'e basılmaz.
 */
function videoEmbed(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch (err) {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const parts = parsed.pathname.split('/').filter(Boolean);

  // YouTube: watch?v=ID, youtu.be/ID, embed/ID, shorts/ID, live/ID
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
    let id = null;
    if (host === 'youtu.be') id = parts[0];
    else if (parts[0] === 'watch') id = parsed.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) id = parts[1];

    if (!/^[\w-]{6,20}$/.test(String(id || ''))) return null;
    return { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
  }

  // Vimeo: vimeo.com/ID, vimeo.com/channels/x/ID, player.vimeo.com/video/ID
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = [...parts].reverse().find((seg) => /^\d{6,12}$/.test(seg));
    if (!id) return null;
    return { provider: 'vimeo', src: `https://player.vimeo.com/video/${id}` };
  }

  return null;
}

/**
 * Pop-up duyurunun içerik sürümü. Ziyaretçi duyuruyu kapattığında bu değer
 * tarayıcısına yazılır; metin/görsel değişmediği sürece pop-up bir daha
 * açılmaz, duyuru güncellenince sürüm değiştiği için yeniden gösterilir.
 */
function popupVersion(settings) {
  const s = settings || {};
  const parts = [
    s.popup_title, s.popup_text, s.popup_image,
    s.popup_button_text, s.popup_button_url,
  ].map((v) => String(v || '')).join('\u0000');
  return crypto.createHash('sha1').update(parts).digest('hex').slice(0, 12);
}

/**
 * Sayfada gösterilecek harita adresi. Öncelik panelden girilen embed kodunda;
 * o boşsa dükkân adresinden anahtarsız Google Haritalar embed'i üretilir.
 * Böylece harita, panelde tek bir alan doldurulmadan da görünür.
 */
function mapSrc(embedCode, address) {
  const fromCode = mapEmbedSrc(embedCode);
  if (fromCode) return fromCode;
  const addr = String(address || '').trim();
  if (!addr) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(addr)}&output=embed`;
}

/** Adresi Google Haritalar'da açan yol tarifi bağlantısı. */
function mapDirectionsUrl(address) {
  const addr = String(address || '').trim();
  if (!addr) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
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
  formatPrice, formatDate, formatDateShort, formatDateRange, telLink, whatsappLink,
  excerpt, paragraphs, lines, mapEmbedSrc, mapSrc, mapDirectionsUrl, siteImage,
  videoEmbed, popupVersion,
};
