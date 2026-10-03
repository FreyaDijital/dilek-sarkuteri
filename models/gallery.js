const db = require('../config/db');
const ordering = require('./ordering');

const ORDER_BY = 'sort_order, id';

/**
 * Fotoğraf galerileri (gallery_photos).
 *
 * Üç galeri aynı tabloda durur:
 *   'urun'    -> ürün detayındaki ek fotoğraflar (product_id dolu, ana görsel
 *                products.image'de kalır)
 *   'tabak'   -> Tabaklar sayfası; group_name her galerinin başlığı olur
 *   'sandvic' -> Ana sayfa "Dükkânda Yiyin" şeridi (tek grup)
 */
const GALLERIES = {
  urun:    { label: 'Ürün fotoğrafları', grouped: false },
  tabak:   { label: 'Tabaklar sayfası',  grouped: true },
  sandvic: { label: 'Dükkânda Yiyin',    grouped: true },
};

const isGallery = (key) => Object.prototype.hasOwnProperty.call(GALLERIES, key);

const emptyToNull = (v) => {
  const s = v === undefined || v === null ? '' : String(v).trim();
  return s || null;
};

/** list({ gallery, productId, activeOnly }) — ürün adıyla birlikte döner. */
async function list({ gallery, productId, activeOnly = false } = {}) {
  const where = [];
  const params = [];

  if (gallery) { where.push('g.gallery = ?'); params.push(gallery); }
  if (productId) { where.push('g.product_id = ?'); params.push(productId); }
  if (activeOnly) where.push('g.is_active = 1');

  return db.query(
    `SELECT g.*, p.name AS product_name, p.slug AS product_slug
       FROM gallery_photos g
       LEFT JOIN products p ON p.id = g.product_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY g.group_name, g.sort_order, g.id`,
    params
  );
}

/**
 * Bir galeriyi group_name'e göre kümelenmiş döndürür:
 *   [{ name: 'Peynir Tabağı', photos: [...] }, ...]
 * Grup sırası, grubun en küçük sort_order'ına göredir; böylece panelde
 * fotoğrafı yukarı taşımak grubu da yukarı taşır.
 */
async function groups(gallery, { activeOnly = true } = {}) {
  const photos = await list({ gallery, activeOnly });
  const out = new Map();

  for (const photo of photos) {
    const name = photo.group_name || '';
    if (!out.has(name)) out.set(name, { name, photos: [] });
    out.get(name).photos.push(photo);
  }

  return [...out.values()]
    .map((g) => ({ ...g, order: Math.min(...g.photos.map((p) => p.sort_order)) }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'tr'));
}

async function findById(id) {
  return db.queryOne(
    `SELECT g.*, p.name AS product_name, p.slug AS product_slug
       FROM gallery_photos g
       LEFT JOIN products p ON p.id = g.product_id
      WHERE g.id = ? LIMIT 1`,
    [id]
  );
}

/** Aynı dosya aynı galeride zaten var mı? İçe aktarımı tekrar çalıştırmak için. */
async function findByImage(gallery, image) {
  return db.queryOne(
    'SELECT * FROM gallery_photos WHERE gallery = ? AND image = ? LIMIT 1',
    [gallery, image]
  );
}

/**
 * Yeni fotoğraf listenin sonuna eklensin diye tablodaki en büyük sort_order + 1.
 * Galeri başına değil tablo genelinde bakılır: ordering.normalize() sıra
 * numaralarını tüm tablo için 1..n olarak tekilleştirdiğinden, galeri bazlı bir
 * MAX yeni kaydı başka bir galerinin aralığına, yani listenin ortasına düşürürdü.
 */
function nextSortOrder() {
  const row = db.queryOne('SELECT COALESCE(MAX(sort_order), 0) AS n FROM gallery_photos');
  return (row ? row.n : 0) + 1;
}

async function create(data) {
  if (!isGallery(data.gallery)) throw new Error(`Geçersiz galeri: ${data.gallery}`);
  if (!data.image) throw new Error('Görsel zorunludur.');

  const res = db.run(
    `INSERT INTO gallery_photos (gallery, product_id, group_name, image, caption, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.gallery,
      data.productId || null,
      emptyToNull(data.groupName),
      data.image,
      emptyToNull(data.caption),
      Number(data.sortOrder) || nextSortOrder(),
      data.isActive ? 1 : 0,
    ]
  );
  return res.insertId;
}

async function update(id, data) {
  const current = await findById(id);
  if (!current) return false;

  db.run(
    `UPDATE gallery_photos
        SET gallery = ?, product_id = ?, group_name = ?, image = ?, caption = ?,
            sort_order = ?, is_active = ?
      WHERE id = ?`,
    [
      isGallery(data.gallery) ? data.gallery : current.gallery,
      data.productId || null,
      emptyToNull(data.groupName),
      // image boş gelirse mevcut görsel korunur (formda dosya seçilmemiş demektir)
      data.image || current.image,
      emptyToNull(data.caption),
      Number(data.sortOrder) || current.sort_order,
      data.isActive ? 1 : 0,
      id,
    ]
  );
  return true;
}

async function remove(id) {
  return db.run('DELETE FROM gallery_photos WHERE id = ?', [id]).changes > 0;
}

/** is_active alanını tersine çevirir, yeni değeri döner. */
async function toggle(id) {
  const row = db.queryOne('SELECT is_active AS value FROM gallery_photos WHERE id = ?', [id]);
  if (!row) return null;
  const next = row.value ? 0 : 1;
  db.run('UPDATE gallery_photos SET is_active = ? WHERE id = ?', [next, id]);
  return next;
}

/**
 * Listede yukarı/aşağı taşır. Taşıma yalnızca aynı galeri içinde yapılır,
 * yoksa "yukarı" tuşu fotoğrafı başka bir galerinin arasına sokardı.
 */
async function move(id, direction) {
  const row = await findById(id);
  if (!row) return 'missing';

  const scopeIds = db
    .query('SELECT id FROM gallery_photos WHERE gallery = ?', [row.gallery])
    .map((r) => r.id);

  return ordering.move({ table: 'gallery_photos', orderBy: ORDER_BY, id, direction, scopeIds });
}

/** Panelde galeri başlıklarının yanındaki sayılar. */
async function counts() {
  const rows = db.query(
    `SELECT gallery,
            COUNT(*) AS total,
            SUM(is_active) AS active
       FROM gallery_photos GROUP BY gallery`
  );
  return Object.fromEntries(rows.map((r) => [r.gallery, r]));
}

/** Panelde grup adı için hazır öneriler (daha önce kullanılmış adlar). */
async function groupNames(gallery) {
  return db
    .query(
      `SELECT DISTINCT group_name FROM gallery_photos
        WHERE gallery = ? AND group_name IS NOT NULL
        ORDER BY group_name`,
      [gallery]
    )
    .map((r) => r.group_name);
}

module.exports = {
  GALLERIES, isGallery,
  list, groups, findById, findByImage, create, update, remove, toggle, move, counts, groupNames,
};
