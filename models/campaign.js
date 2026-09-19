const db = require('../config/db');
const { uniqueSlug } = require('../utils/slugify');

// Yayında + tarih aralığı bugünü kapsıyor (NULL = sınır yok).
// Tarihler 'YYYY-MM-DD' metni olduğu için düz karşılaştırma doğru sonuç verir.
const ACTIVE_WINDOW = `
  is_published = 1
  AND (starts_at IS NULL OR starts_at <= date('now','localtime'))
  AND (ends_at   IS NULL OR ends_at   >= date('now','localtime'))
`;

function slugExists(slug, exceptId = null) {
  const row = exceptId
    ? db.queryOne('SELECT id FROM campaigns WHERE slug = ? AND id <> ? LIMIT 1', [slug, exceptId])
    : db.queryOne('SELECT id FROM campaigns WHERE slug = ? LIMIT 1', [slug]);
  return Boolean(row);
}

/** Site tarafı: sadece yayındaki ve tarihi geçerli kampanyalar. */
async function listActive({ limit } = {}) {
  const limitSql = Number(limit) > 0 ? `LIMIT ${Math.min(Number(limit), 100)}` : '';
  return db.query(
    `SELECT * FROM campaigns WHERE ${ACTIVE_WINDOW} ORDER BY sort_order, starts_at DESC, id DESC ${limitSql}`
  );
}

/** Panel: hepsi. */
async function listAll() {
  return db.query('SELECT * FROM campaigns ORDER BY sort_order, id DESC');
}

async function findById(id) {
  return db.queryOne('SELECT * FROM campaigns WHERE id = ? LIMIT 1', [id]);
}

async function findBySlug(slug) {
  return db.queryOne('SELECT * FROM campaigns WHERE slug = ? LIMIT 1', [slug]);
}

/** Site tarafı: slug ile, sadece yayındaysa ve tarihi geçerliyse. */
async function findActiveBySlug(slug) {
  return db.queryOne(`SELECT * FROM campaigns WHERE slug = ? AND ${ACTIVE_WINDOW} LIMIT 1`, [slug]);
}

const emptyToNull = (v) => (v === undefined || v === null || v === '' ? null : v);

async function create(data) {
  const slug = await uniqueSlug(data.title, (s) => slugExists(s));
  const res = db.run(
    `INSERT INTO campaigns
       (title, slug, short_desc, description, image, starts_at, ends_at, is_published, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.title,
      slug,
      data.shortDesc || null,
      data.description || null,
      data.image || null,
      emptyToNull(data.startsAt),
      emptyToNull(data.endsAt),
      data.isPublished ? 1 : 0,
      Number(data.sortOrder) || 0,
    ]
  );
  return res.insertId;
}

async function update(id, data) {
  const current = await findById(id);
  if (!current) return false;

  const slug = current.title === data.title
    ? current.slug
    : await uniqueSlug(data.title, (s) => slugExists(s, id));

  db.run(
    `UPDATE campaigns
        SET title = ?, slug = ?, short_desc = ?, description = ?, image = ?,
            starts_at = ?, ends_at = ?, is_published = ?, sort_order = ?
      WHERE id = ?`,
    [
      data.title,
      slug,
      data.shortDesc || null,
      data.description || null,
      data.image === undefined ? current.image : data.image,
      emptyToNull(data.startsAt),
      emptyToNull(data.endsAt),
      data.isPublished ? 1 : 0,
      Number(data.sortOrder) || 0,
      id,
    ]
  );
  return true;
}

async function remove(id) {
  return db.run('DELETE FROM campaigns WHERE id = ?', [id]).changes > 0;
}

async function countActive() {
  const row = db.queryOne(`SELECT COUNT(*) AS n FROM campaigns WHERE ${ACTIVE_WINDOW}`);
  return row ? row.n : 0;
}

module.exports = { listActive, listAll, findById, findBySlug, findActiveBySlug, create, update, remove, countActive };
