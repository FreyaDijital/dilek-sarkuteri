const db = require('../config/db');
const { uniqueSlug } = require('../utils/slugify');
const ordering = require('./ordering');

const ORDER_BY = 'sort_order, name';

function slugExists(slug, exceptId = null) {
  const row = exceptId
    ? db.queryOne('SELECT id FROM categories WHERE slug = ? AND id <> ? LIMIT 1', [slug, exceptId])
    : db.queryOne('SELECT id FROM categories WHERE slug = ? LIMIT 1', [slug]);
  return Boolean(row);
}

/** Site tarafı: sadece aktif kategoriler. Panel: hepsi. */
async function all({ activeOnly = false } = {}) {
  const where = activeOnly ? 'WHERE c.is_active = 1' : '';
  return db.query(
    `SELECT c.*,
            (SELECT COUNT(*) FROM products p
              WHERE p.category_id = c.id AND p.is_active = 1) AS product_count
       FROM categories c
       ${where}
      ORDER BY c.sort_order, c.name`
  );
}

async function findById(id) {
  return db.queryOne('SELECT * FROM categories WHERE id = ? LIMIT 1', [id]);
}

async function findBySlug(slug) {
  return db.queryOne('SELECT * FROM categories WHERE slug = ? LIMIT 1', [slug]);
}

async function create({ name, description = null, image = null, sortOrder = 0, isActive = 1 }) {
  const slug = await uniqueSlug(name, (s) => slugExists(s));
  const res = db.run(
    `INSERT INTO categories (name, slug, description, image, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, slug, description || null, image, Number(sortOrder) || 0, isActive ? 1 : 0]
  );
  return res.insertId;
}

async function update(id, { name, description = null, image, sortOrder = 0, isActive = 1 }) {
  const current = await findById(id);
  if (!current) return false;

  // Ad değiştiyse slug'ı yenile (eski slug'a gelen linkler kırılır, bilerek yapılıyor).
  const slug = current.name === name
    ? current.slug
    : await uniqueSlug(name, (s) => slugExists(s, id));

  db.run(
    `UPDATE categories
        SET name = ?, slug = ?, description = ?, image = ?, sort_order = ?, is_active = ?
      WHERE id = ?`,
    [
      name,
      slug,
      description || null,
      image === undefined ? current.image : image,
      Number(sortOrder) || 0,
      isActive ? 1 : 0,
      id,
    ]
  );
  return true;
}

/** Kategori silinince ürünler silinmez, category_id NULL olur (FK: ON DELETE SET NULL). */
async function remove(id) {
  return db.run('DELETE FROM categories WHERE id = ?', [id]).changes > 0;
}

/** is_active alanını tersine çevirir, yeni değeri döner. */
async function toggle(id) {
  const row = db.queryOne('SELECT is_active AS value FROM categories WHERE id = ?', [id]);
  if (!row) return null;
  const next = row.value ? 0 : 1;
  db.run('UPDATE categories SET is_active = ? WHERE id = ?', [next, id]);
  return next;
}

/** Listede yukarı/aşağı taşır. */
async function move(id, direction) {
  return ordering.move({ table: 'categories', orderBy: ORDER_BY, id, direction });
}

module.exports = { all, findById, findBySlug, create, update, remove, toggle, move };
