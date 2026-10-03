/**
 * foto-eslestirme.csv -> fotoğrafları ürünlere ve galerilere bağlar.
 *   npm run import:fotolar                 -> kökteki foto-eslestirme.csv
 *   npm run import:fotolar -- dosya.csv    -> başka bir dosya
 *   npm run import:fotolar -- --dry-run    -> hiçbir şey yazmaz, sadece raporlar
 *
 * CSV sütunları: dosya, kullanim, hedef, guven, not
 *   `not` ve `guven` yalnızca raporlama içindir; veritabanına yazılmazlar.
 *
 *   kullanim=urun     -> hedef = ürün adı. İlk fotoğraf ürünün ana görseli
 *                        (products.image), kalanlar ürün galerisine girer.
 *   kullanim=tabak    -> hedef = Tabaklar sayfasındaki galeri grubu
 *   kullanim=sandvic  -> hedef = Dükkânda Yiyin şeridi
 *
 * Fotoğraflar public/img/ içinden 'img/<dosya>' biçiminde bağlanır; bu biçim
 * panelin "hazır fotoğraflardan seç" listesiyle aynıdır, yani her bağlantı
 * panelden değiştirilebilir kalır.
 *
 * Tekrar çalıştırmak güvenlidir: galeri kayıtları (galeri, dosya) çiftine göre
 * eşleştirilir, ürünün ana görseli yalnızca boşsa ya da CSV'deki ilk fotoğraftan
 * farklıysa yazılır. Panelden elle yapılan değişiklikleri ezmemek için
 * --force verilmedikçe dolu bir ana görsel KORUNUR.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const migrations = require('../db/migrations');
const galleryModel = require('../models/gallery');
const { GALLERY_PREFIX } = require('../utils/helpers');

const REQUIRED_COLUMNS = ['dosya', 'kullanim', 'hedef'];
const PUBLIC_IMG_DIR = path.join(__dirname, '..', 'public', 'img');
const SHAKY = new Set(['orta', 'düşük']);

/** Alıntılı (""-kaçışlı) alanları destekleyen CSV ayrıştırıcı. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else { field += ch; }
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function toRecords(rows, file) {
  if (!rows.length) throw new Error(`${file} boş görünüyor`);

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`${file} içinde eksik sütun(lar): ${missing.join(', ')}`);

  const at = (cells, name) => {
    const i = header.indexOf(name);
    return i < 0 ? '' : (cells[i] || '').trim();
  };

  return rows.slice(1).map((cells, i) => ({
    line: i + 2,
    dosya: at(cells, 'dosya'),
    kullanim: at(cells, 'kullanim').toLowerCase(),
    hedef: at(cells, 'hedef'),
    guven: at(cells, 'guven').toLowerCase(),
    not: at(cells, 'not'),
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const fileArg = args.find((a) => !a.startsWith('--'));
  const file = path.resolve(fileArg || path.join(__dirname, '..', 'foto-eslestirme.csv'));

  if (!fs.existsSync(file)) throw new Error(`Dosya bulunamadı: ${file}`);

  const records = toRecords(parseCsv(fs.readFileSync(file, 'utf8')), path.basename(file));
  console.log(`${path.basename(file)}: ${records.length} satır okundu${dryRun ? ' (DENEME, yazma yok)' : ''}`);

  const applied = migrations.run(db);
  if (applied.length) console.log(`✓ ${applied.length} göç uygulandı: ${applied.join(', ')}`);

  const stats = {
    mainSet: 0, mainKept: [], galleryAdded: 0, galleryUpdated: 0, galleryUnchanged: 0,
    skipped: [], shaky: [],
  };

  // Ürün adı -> kayıt (Türkçe büyük/küçük harf duyarsız)
  const products = new Map(
    db.query('SELECT id, name, slug, image FROM products')
      .map((p) => [p.name.toLocaleLowerCase('tr'), p])
  );

  // Aynı ürüne düşen fotoğrafların kaçıncısı olduğunu saymak için
  const seenPerProduct = new Map();
  const seenFiles = new Set();

  for (const r of records) {
    const where = `${r.line}: ${r.dosya || '(dosya yok)'}`;

    if (!r.dosya) { stats.skipped.push(`${r.line}: dosya adı boş`); continue; }
    if (path.basename(r.dosya) !== r.dosya) {
      stats.skipped.push(`${where} - dosya adı klasör içermemeli`);
      continue;
    }
    if (!fs.existsSync(path.join(PUBLIC_IMG_DIR, r.dosya))) {
      stats.skipped.push(`${where} - public/img/ içinde böyle bir dosya yok`);
      continue;
    }
    if (!galleryModel.isGallery(r.kullanim)) {
      stats.skipped.push(`${where} - bilinmeyen kullanım: "${r.kullanim}"`);
      continue;
    }
    if (!r.hedef) { stats.skipped.push(`${where} - hedef boş`); continue; }

    const key = `${r.kullanim}|${r.dosya}`;
    if (seenFiles.has(key)) { stats.skipped.push(`${where} - CSV içinde tekrar ediyor`); continue; }
    seenFiles.add(key);

    if (SHAKY.has(r.guven)) {
      stats.shaky.push(`${r.dosya} → ${r.hedef} (${r.guven}${r.not ? `, ${r.not}` : ''})`);
    }

    const image = GALLERY_PREFIX + r.dosya;   // 'img/IMG-....jpg'

    // ---- Ürün fotoğrafları ----
    if (r.kullanim === 'urun') {
      const product = products.get(r.hedef.toLocaleLowerCase('tr'));
      if (!product) {
        stats.skipped.push(`${where} - "${r.hedef}" adlı ürün yok`);
        continue;
      }

      const nth = (seenPerProduct.get(product.id) || 0) + 1;
      seenPerProduct.set(product.id, nth);

      // CSV'deki ilk fotoğraf ana görsel olur.
      if (nth === 1) {
        const current = product.image;
        if (current && current !== image && !force) {
          stats.mainKept.push(`${product.name}: panelde "${current}" var, "${image}" atlandı`);
        } else if (current !== image) {
          if (!dryRun) db.run('UPDATE products SET image = ? WHERE id = ?', [image, product.id]);
          stats.mainSet += 1;
        }
        continue;
      }

      // Kalanlar ürün galerisine.
      await upsertPhoto({
        gallery: 'urun', productId: product.id, groupName: null,
        image, dryRun, stats,
      });
      continue;
    }

    // ---- Tabak / sandviç galerileri ----
    await upsertPhoto({
      gallery: r.kullanim, productId: null, groupName: r.hedef,
      image, dryRun, stats,
    });
  }

  report(stats, dryRun);
}

/**
 * Galeri kaydını (galeri, dosya) çiftine göre ekler ya da günceller.
 *
 * CSV'deki `not` sütununa bilerek DOKUNULMAZ: o sütun eşleştirmeyi yapanın
 * kendi çalışma notu ("ikinci kare", "kontrol et"), sitede gösterilecek bir
 * açıklama değil. Fotoğrafın altındaki yazı (caption) yalnızca panelden girilir.
 */
async function upsertPhoto({ gallery, productId, groupName, image, dryRun, stats }) {
  const existing = await galleryModel.findByImage(gallery, image);

  if (!existing) {
    if (!dryRun) {
      await galleryModel.create({
        gallery, productId, groupName, image, isActive: 1,
      });
    }
    stats.galleryAdded += 1;
    return;
  }

  const same = (existing.product_id || null) === (productId || null)
    && (existing.group_name || null) === (groupName || null);

  if (same) { stats.galleryUnchanged += 1; return; }

  // caption, is_active ve sort_order bilinçli olarak dışarıda: panelde girilen
  // yazı, gizleme ve sıralama içe aktarımı tekrarlayınca bozulmasın.
  if (!dryRun) {
    db.run(
      'UPDATE gallery_photos SET product_id = ?, group_name = ? WHERE id = ?',
      [productId || null, groupName || null, existing.id]
    );
  }
  stats.galleryUpdated += 1;
}

function report(stats, dryRun) {
  console.log('');
  console.log(`✓ Ana görseli ayarlanan ürün : ${stats.mainSet}`);
  console.log(`✓ Galeriye eklenen fotoğraf  : ${stats.galleryAdded}`);
  console.log(`✓ Güncellenen galeri kaydı   : ${stats.galleryUpdated}`);
  console.log(`· Değişmeyen galeri kaydı    : ${stats.galleryUnchanged}`);

  if (stats.mainKept.length) {
    console.log(`\n· Panelde zaten görsel olduğu için dokunulmayan ${stats.mainKept.length} ürün:`);
    stats.mainKept.forEach((s) => console.log(`  - ${s}`));
    console.log('  (üzerine yazmak için: npm run import:fotolar -- --force)');
  }

  if (stats.shaky.length) {
    console.log(`\n! Güveni düşük/orta ${stats.shaky.length} eşleştirme - panelden kontrol edin:`);
    stats.shaky.forEach((s) => console.log(`  - ${s}`));
  }

  if (stats.skipped.length) {
    console.log(`\n! Atlanan ${stats.skipped.length} satır:`);
    stats.skipped.forEach((s) => console.log(`  - ${s}`));
  }

  if (!dryRun) {
    const rows = db.query(
      `SELECT gallery, COUNT(*) AS n FROM gallery_photos GROUP BY gallery ORDER BY gallery`
    );
    console.log('\nGaleri durumu:');
    rows.forEach((r) => console.log(`  ${r.gallery.padEnd(8)} ${r.n} fotoğraf`));
    const withImage = db.queryOne('SELECT COUNT(*) AS n FROM products WHERE image IS NOT NULL').n;
    console.log(`  görseli olan ürün: ${withImage}`);
  }
  console.log('\nHepsi panelden değiştirilebilir: Ürünler > Düzenle ve Galeriler sayfaları.');
}

main()
  .catch((err) => {
    console.error('Hata:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
