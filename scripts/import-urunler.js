/**
 * urunler.csv -> veritabanı içe aktarımı.
 *   npm run import:urunler                 -> kökteki urunler.csv
 *   npm run import:urunler -- dosya.csv    -> başka bir dosya
 *   npm run import:urunler -- --dry-run    -> hiçbir şey yazmaz, sadece raporlar
 *
 * CSV sütunları: kategori, ad, birim, fiyat, plu, marka
 *
 * Tekrar çalıştırmak güvenlidir: ürünler ADINA göre eşleştirilir, varsa
 * güncellenir, yoksa eklenir. Görsel alanına hiç dokunulmaz (sonra panelden
 * doldurulacak), panelde elle girilmiş sıra (sort_order) da korunur.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const migrations = require('../db/migrations');
const { uniqueSlug } = require('../utils/slugify');

const REQUIRED_COLUMNS = ['kategori', 'ad', 'birim', 'fiyat', 'plu', 'marka'];

/** Alıntılı (""-kaçışlı) alanları ve alan içindeki satır sonlarını destekleyen CSV ayrıştırıcı. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  // BOM, CRLF
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  // Tamamen boş satırları at
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function toRecords(rows, file) {
  if (!rows.length) throw new Error(`${file} boş görünüyor`);

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) {
    throw new Error(`${file} içinde eksik sütun(lar): ${missing.join(', ')}`);
  }

  const idx = Object.fromEntries(REQUIRED_COLUMNS.map((c) => [c, header.indexOf(c)]));

  return rows.slice(1).map((cells, i) => ({
    line: i + 2,                                   // başlık satırı 1
    kategori: (cells[idx.kategori] || '').trim(),
    ad: (cells[idx.ad] || '').trim(),
    birim: (cells[idx.birim] || '').trim(),
    fiyat: (cells[idx.fiyat] || '').trim(),
    plu: (cells[idx.plu] || '').trim(),
    marka: (cells[idx.marka] || '').trim(),
  }));
}

function parsePrice(raw) {
  if (!raw) return null;
  // "1.450,50" / "1450,50" / "1450.50" -> 1450.5
  const cleaned = raw.replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Kategori adını id'ye çevirir; yoksa oluşturur. */
async function categoryIdFor(name, cache, stats, dryRun) {
  const key = name.toLocaleLowerCase('tr');
  if (cache.has(key)) return cache.get(key);

  const slugExists = (s) =>
    Boolean(db.queryOne('SELECT id FROM categories WHERE slug = ? LIMIT 1', [s]));
  const slug = await uniqueSlug(name, slugExists);

  let id = null;
  if (!dryRun) {
    const { n } = db.queryOne('SELECT COALESCE(MAX(sort_order), 0) AS n FROM categories');
    id = db.run(
      'INSERT INTO categories (name, slug, sort_order, is_active) VALUES (?, ?, ?, 1)',
      [name, slug, n + 1]
    ).insertId;
  }
  cache.set(key, id);
  stats.categoriesCreated.push(name);
  return id;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileArg = args.find((a) => !a.startsWith('--'));
  const file = path.resolve(fileArg || path.join(__dirname, '..', 'urunler.csv'));

  if (!fs.existsSync(file)) throw new Error(`Dosya bulunamadı: ${file}`);

  const records = toRecords(parseCsv(fs.readFileSync(file, 'utf8')), path.basename(file));
  console.log(`${path.basename(file)}: ${records.length} satır okundu${dryRun ? ' (DENEME, yazma yok)' : ''}`);

  // plu/brand sütunları hazır olsun
  const applied = migrations.run(db);
  if (applied.length) console.log(`✓ ${applied.length} göç uygulandı: ${applied.join(', ')}`);

  const stats = { inserted: 0, updated: 0, unchanged: 0, categoriesCreated: [], skipped: [] };

  // Mevcut kategoriler (ad -> id)
  const cache = new Map(
    db.query('SELECT id, name FROM categories').map((c) => [c.name.toLocaleLowerCase('tr'), c.id])
  );

  // Ad -> mevcut ürün (eşleştirme anahtarı; kopya oluşmasını engeller)
  const existing = new Map(
    db.query('SELECT id, name, category_id, price, unit, plu, brand FROM products')
      .map((p) => [p.name.toLocaleLowerCase('tr'), p])
  );

  const seen = new Set();
  const productSlugExists = (s) =>
    Boolean(db.queryOne('SELECT id FROM products WHERE slug = ? LIMIT 1', [s]));

  for (const r of records) {
    if (!r.ad) { stats.skipped.push(`${r.line}: ürün adı boş`); continue; }
    if (!r.kategori) { stats.skipped.push(`${r.line}: ${r.ad} - kategori boş`); continue; }

    const key = r.ad.toLocaleLowerCase('tr');
    if (seen.has(key)) { stats.skipped.push(`${r.line}: ${r.ad} - CSV içinde tekrar ediyor`); continue; }
    seen.add(key);

    const categoryId = await categoryIdFor(r.kategori, cache, stats, dryRun);
    const price = parsePrice(r.fiyat);
    const unit = r.birim || 'kg';
    const plu = r.plu || null;
    const brand = r.marka || null;

    const current = existing.get(key);

    if (current) {
      const same = current.category_id === categoryId
        && current.price === price
        && current.unit === unit
        && (current.plu || null) === plu
        && (current.brand || null) === brand;

      if (same) { stats.unchanged += 1; continue; }

      // image ve sort_order bilinçli olarak dışarıda: panelde girilen veri korunur.
      if (!dryRun) {
        db.run(
          `UPDATE products SET category_id = ?, price = ?, unit = ?, plu = ?, brand = ?
            WHERE id = ?`,
          [categoryId, price, unit, plu, brand, current.id]
        );
      }
      stats.updated += 1;
      continue;
    }

    if (!dryRun) {
      const slug = await uniqueSlug(r.ad, productSlugExists);
      const { n } = db.queryOne('SELECT COALESCE(MAX(sort_order), 0) AS n FROM products');
      db.run(
        `INSERT INTO products (category_id, name, slug, price, unit, plu, brand, image, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, ?)`,
        [categoryId, r.ad, slug, price, unit, plu, brand, n + 1]
      );
    }
    stats.inserted += 1;
  }

  console.log('');
  if (stats.categoriesCreated.length) {
    console.log(`✓ Yeni kategori (${stats.categoriesCreated.length}): ${stats.categoriesCreated.join(', ')}`);
  }
  console.log(`✓ Eklenen ürün      : ${stats.inserted}`);
  console.log(`✓ Güncellenen ürün  : ${stats.updated}`);
  console.log(`· Değişmeyen ürün   : ${stats.unchanged}`);
  if (stats.skipped.length) {
    console.log(`\n! Atlanan ${stats.skipped.length} satır:`);
    stats.skipped.forEach((s) => console.log(`  - ${s}`));
  }
  console.log(`\nToplam ürün: ${db.queryOne('SELECT COUNT(*) AS n FROM products').n}`);
  console.log('Görseller boş bırakıldı; panelden yüklenebilir.');
}

main()
  .catch((err) => {
    console.error('Hata:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
