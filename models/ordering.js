const db = require('../config/db');

/**
 * Listelerde yukarı/aşağı taşıma.
 *
 * sort_order başlangıçta hep 0 olabileceği için önce görünen sıraya göre
 * 1..n olarak tekilleştirilir (sıra değişmez), sonra iki komşunun değerleri
 * takas edilir. Yalnızca gerçekten değişen satırlar yazılır; aksi halde
 * her taşımada tüm kayıtların updated_at'i tazelenirdi.
 *
 * `table` ve `orderBy` yalnızca kod içinden gelen sabitlerdir, kullanıcı girdisi değildir.
 */
function normalize(table, orderBy) {
  const rows = db.query(`SELECT id, sort_order FROM ${table} ORDER BY ${orderBy}`);
  rows.forEach((r, i) => {
    if (r.sort_order !== i + 1) {
      db.run(`UPDATE ${table} SET sort_order = ? WHERE id = ?`, [i + 1, r.id]);
    }
  });
}

/**
 * move({ table, orderBy, id, direction, scopeIds })
 *
 * scopeIds verilirse taşıma yalnızca o kümedeki komşuyla yapılır; panelde
 * kategoriye göre filtrelenmiş listede "yukarı" tuşu ekranda görünen bir
 * üstteki satırla yer değiştirsin diye.
 *
 * Döner: 'ok' | 'edge' (zaten uçta) | 'missing'
 */
function move({ table, orderBy, id, direction, scopeIds = null }) {
  const tx = db.transaction(() => {
    normalize(table, orderBy);

    let rows = db.query(`SELECT id, sort_order FROM ${table} ORDER BY ${orderBy}`);
    if (scopeIds) {
      const allowed = new Set(scopeIds.map(Number));
      rows = rows.filter((r) => allowed.has(r.id));
    }

    const idx = rows.findIndex((r) => r.id === Number(id));
    if (idx < 0) return 'missing';

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= rows.length) return 'edge';

    const a = rows[idx];
    const b = rows[targetIdx];
    db.run(`UPDATE ${table} SET sort_order = ? WHERE id = ?`, [b.sort_order, a.id]);
    db.run(`UPDATE ${table} SET sort_order = ? WHERE id = ?`, [a.sort_order, b.id]);
    return 'ok';
  });

  return tx();
}

module.exports = { normalize, move };
