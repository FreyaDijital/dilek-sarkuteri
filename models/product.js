const db = require('../config/db');
const { slugify, uniqueSlug } = require('../utils/slugify');
const ordering = require('./ordering');

const ORDER_BY = 'sort_order, name';

const SELECT_BASE = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
`;

function slugExists(slug, exceptId = null) {
  const row = exceptId
    ? db.queryOne('SELECT id FROM products WHERE slug = ? AND id <> ? LIMIT 1', [slug, exceptId])
    : db.queryOne('SELECT id FROM products WHERE slug = ? LIMIT 1', [slug]);
  return Boolean(row);
}

/**
 * list({ categorySlug, categoryId, activeOnly, featured, search, limit })
 * limit doğrudan SQL'e gömülür; bu yüzden tam sayıya zorlanır.
 */
async function list(opts = {}) {
  const { categorySlug, categoryId, activeOnly = false, featured = false, search, limit } = opts;
  const where = [];
  const params = [];

  if (activeOnly) where.push('p.is_active = 1');
  if (featured) where.push('p.is_featured = 1');
  if (categoryId) { where.push('p.category_id = ?'); params.push(categoryId); }
  if (categorySlug) { where.push('c.slug = ?'); params.push(categorySlug); }
  if (search) { where.push('(p.name LIKE ? OR p.short_desc LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limitSql = Number.isInteger(Number(limit)) && Number(limit) > 0
    ? `LIMIT ${Math.min(Number(limit), 500)}`
    : '';

  return db.query(
    `${SELECT_BASE} ${whereSql} ORDER BY p.sort_order, p.name ${limitSql}`,
    params
  );
}

async function findById(id) {
  return db.queryOne(`${SELECT_BASE} WHERE p.id = ? LIMIT 1`, [id]);
}

async function findBySlug(slug) {
  return db.queryOne(`${SELECT_BASE} WHERE p.slug = ? LIMIT 1`, [slug]);
}

/**
 * Adres (slug) artık panelden elle girilebilir.
 *  - Alan doluysa o kullanılır (çakışırsa -2, -3 eklenir)
 *  - Boş bırakılırsa üründen üretilir
 * Kayıtlı slug korunduğu için ürün adını değiştirmek linkleri kırmaz.
 */
async function resolveSlug({ desired, name, currentSlug = null, exceptId = null }) {
  const wanted = slugify(desired || '');
  if (wanted && wanted === currentSlug) return currentSlug;
  const base = wanted || name;
  return uniqueSlug(base, (candidate) => slugExists(candidate, exceptId));
}

function normalizePrice(price) {
  if (price === undefined || price === null || price === '') return null;
  const n = Number(String(price).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

async function create(data) {
  const slug = await resolveSlug({ desired: data.slug, name: data.name });
  const res = db.run(
    `INSERT INTO products
       (category_id, name, slug, short_desc, description, origin, price, unit, image, is_featured, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.categoryId || null,
      data.name,
      slug,
      data.shortDesc || null,
      data.description || null,
      data.origin || null,
      normalizePrice(data.price),
      data.unit || 'kg',
      data.image || null,
      data.isFeatured ? 1 : 0,
      data.isActive ? 1 : 0,
      Number(data.sortOrder) || 0,
    ]
  );
  return res.insertId;
}

async function update(id, data) {
  const current = await findById(id);
  if (!current) return false;

  const slug = await resolveSlug({
    desired: data.slug,
    name: data.name,
    currentSlug: current.slug,
    exceptId: id,
  });

  db.run(
    `UPDATE products
        SET category_id = ?, name = ?, slug = ?, short_desc = ?, description = ?, origin = ?,
            price = ?, unit = ?, image = ?, is_featured = ?, is_active = ?, sort_order = ?
      WHERE id = ?`,
    [
      data.categoryId || null,
      data.name,
      slug,
      data.shortDesc || null,
      data.description || null,
      data.origin || null,
      normalizePrice(data.price),
      data.unit || 'kg',
      data.image === undefined ? current.image : data.image,
      data.isFeatured ? 1 : 0,
      data.isActive ? 1 : 0,
      Number(data.sortOrder) || 0,
      id,
    ]
  );
  return true;
}

async function remove(id) {
  return db.run('DELETE FROM products WHERE id = ?', [id]).changes > 0;
}

async function count({ activeOnly = false } = {}) {
  const row = db.queryOne(
    `SELECT COUNT(*) AS n FROM products ${activeOnly ? 'WHERE is_active = 1' : ''}`
  );
  return row ? row.n : 0;
}

/** is_featured / is_active alanını tersine çevirir, yeni değeri döner. */
async function toggle(id, field) {
  if (!['is_featured', 'is_active'].includes(field)) throw new Error(`Geçersiz alan: ${field}`);
  const row = db.queryOne(`SELECT ${field} AS value FROM products WHERE id = ?`, [id]);
  if (!row) return null;
  const next = row.value ? 0 : 1;
  db.run(`UPDATE products SET ${field} = ? WHERE id = ?`, [next, id]);
  return next;
}

/** Listede yukarı/aşağı taşır. scopeIds verilirse o küme içinde komşuyla takas eder. */
async function move(id, direction, scopeIds = null) {
  return ordering.move({ table: 'products', orderBy: ORDER_BY, id, direction, scopeIds });
}

module.exports = { list, findById, findBySlug, create, update, remove, count, toggle, move };
