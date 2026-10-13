/**
 * foto-eslestirme.csv -> fotoğrafları ürünlere ve galerilere bağlar.
 *   npm run import:fotolar                 -> kökteki foto-eslestirme.csv
 *   npm run import:fotolar -- dosya.csv    -> başka bir dosya
 *   npm run import:fotolar -- --dry-run    -> hiçbir şey yazmaz, sadece raporlar
 *   npm run import:fotolar -- --auto       -> CSV yerine public/img/ içindeki dosya
 *                                             adlarını ürün adlarıyla eşleştirir
 *                                             (--dry-run ve --force ile birlikte de çalışır)
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
 * --auto eşleştirmesi:
 *   - Türkçe karakter, büyük/küçük harf, boşluk ve tire farkı yok sayılır
 *     ("GiritKabağı.jpg" = "Girit Kabağı"), sondaki numara da ("Atom 2.jpg",
 *     "Köpoğlu(1).jpg"). Birebir tutmayan adlar AUTO_ALIASES'ta eşlenir.
 *   - Aynı ürüne düşen dosyalardan ilki (numarasız, sonra küçük numara) ana
 *     görsel, kalanlar ürün galerisi olur.
 *   - Tabak/kutu/sandviç fotoğrafları AUTO_GROUPS'taki galerilere gider.
 *   - IMG-...-WA ile başlayan eski fotoğraflara ve sitenin kendi görsellerine
 *     (küçük harf-tireli adlar: meze-tabagi.jpg, logo.png) dokunulmaz.
 *
 * Tekrar çalıştırmak güvenlidir: galeri kayıtları (galeri, dosya) çiftine göre
 * eşleştirilir, ürünün ana görseli yalnızca boşsa ya da CSV'deki ilk fotoğraftan
 * farklıysa yazılır. Panelden elle yapılan değişiklikleri ezmemek için
 * --force verilmedikçe dolu bir ana görsel KORUNUR. Tek istisna: ana görsel
 * eski bir WhatsApp fotoğrafıysa (IMG-...-WA) isimli fotoğraf onun yerini alır.
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

const OLD_PHOTO = /^IMG-\d{8}-WA/i;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
// Sitenin kendi görselleri (siteImage ile kullanılır): küçük harf, tire, rakam.
const SITE_ASSET = /^[a-z0-9-]+\.[a-z]+$/;

// Dosya adı ürün adıyla birebir tutmuyorsa: normalize dosya adı -> ürün adı
const AUTO_ALIASES = {
  acilikurudomates: 'Acılı Yoğurtlu Kuru Domates Salatası',
  amerikansalata: 'Amerikan Salatası',
  biberliyesilzeytin: 'Yeşil Zeytin Biberli Kokteyl',
  bombaypilaki: 'Bombay Fasulye Pilaki',
  dublesiyahzeytin: 'Siyah İri Duble Zeytin',
  giritezme: 'Fesleğenli Girit Ezme',
  mercimekkoftesi: 'Mercimek Köfte',
  saksuka: 'Şakşuka (soslu Patlıcan)',
  visnelisarma: 'Zeytinyağlı Vişneli Yaprak Sarma',
  yesildomatzeytin: 'Yeşil Zeytin İri Domat',
  zeytinyaglibademlipazi: 'Bademli Pazı Kavurma',
  zeytinyaglienginar: 'Zeytinyağlı Enginar Çanak',
};

// Ürün olmayan fotoğraflar: normalize dosya adı -> [galeri, grup adı]
const AUTO_GROUPS = {
  peynirtabagi: ['tabak', 'Peynir Tabağı'],
  sarkuteritabagi: ['tabak', 'Şarküteri Tabağı'],
  bolmelimezetabagi: ['tabak', 'Meze Tabağı'],
  peynirkutusu: ['tabak', 'Peynir Kutusu'],
  sarkuterikutusu: ['tabak', 'Şarküteri Kutusu'],
  sandvic: ['sandvic', 'Dükkanda Yiyin / Sandviç'],
};

const TR_ASCII = { ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' };
const TRAILING_NUMBER = /[\s_-]*(?:\((\d+)\)|(\d+))$/;

/** "Çerkez Tavuğu" ve "ÇerkezTavuğu" -> "cerkeztavugu" */
function nameKey(text) {
  return String(text).normalize('NFC').toLocaleLowerCase('tr')
    .replace(/[ışğüöçâîû]/g, (c) => TR_ASCII[c])
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** "Paçanga Böreği 3.jpg" -> { key: 'pacangaboregi', n: 3 } */
function parseFileName(file) {
  const base = file.replace(/\.[^.]+$/, '');
  const m = base.match(TRAILING_NUMBER);
  return {
    key: nameKey(m ? base.slice(0, m.index) : base),
    n: m ? Number(m[1] || m[2]) : 0,
  };
}

/**
 * public/img/ dosyalarından CSV ile aynı biçimde kayıt üretir. Her hedefin
 * dosyaları numaraya göre sıralanır; böylece ilk kayıt ana görsel olur.
 */
function autoRecords(products) {
  const byKey = new Map(products.map((p) => [nameKey(p.name), p.name]));
  const targets = new Map();   // 'kullanim|hedef' -> [{ dosya, n }]
  const unmatched = [];
  const ignored = [];

  const files = fs.readdirSync(PUBLIC_IMG_DIR, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name.normalize('NFC'));

  for (const dosya of files) {
    if (OLD_PHOTO.test(dosya) || !IMAGE_EXT.test(dosya)) continue;
    if (SITE_ASSET.test(dosya)) { ignored.push(dosya); continue; }

    const { key, n } = parseFileName(dosya);
    const productName = byKey.get(key) || AUTO_ALIASES[key];
    const group = AUTO_GROUPS[key];
    let target = null;
    if (productName) target = `urun|${productName}`;
    else if (group) target = group.join('|');

    if (!target) { unmatched.push(dosya); continue; }
    if (!targets.has(target)) targets.set(target, []);
    targets.get(target).push({ dosya, n });
  }

  const records = [];
  for (const [target, list] of targets) {
    const [kullanim, hedef] = target.split('|');
    list.sort((a, b) => a.n - b.n || (a.dosya < b.dosya ? -1 : 1));
    list.forEach(({ dosya }) => records.push({
      line: dosya, dosya, kullanim, hedef, guven: '', not: '',
    }));
  }
  return { records, unmatched, ignored };
}

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

  // macOS dosya adlarını ayrışık (NFD) Unicode verir; git ve Linux sunucu ise
  // birleşik (NFC) tutar. NFD yazılan 'Mücver.jpg' sunucuda bulunamaz.
  return rows.slice(1).map((cells, i) => ({
    line: i + 2,
    dosya: at(cells, 'dosya').normalize('NFC'),
    kullanim: at(cells, 'kullanim').toLowerCase(),
    hedef: at(cells, 'hedef').normalize('NFC'),
    guven: at(cells, 'guven').toLowerCase(),
    not: at(cells, 'not'),
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const auto = args.includes('--auto');
  const fileArg = args.find((a) => !a.startsWith('--'));
  const file = path.resolve(fileArg || path.join(__dirname, '..', 'foto-eslestirme.csv'));
  const dryNote = dryRun ? ' (DENEME, yazma yok)' : '';

  const applied = migrations.run(db);
  if (applied.length) console.log(`✓ ${applied.length} göç uygulandı: ${applied.join(', ')}`);

  let records;
  let autoResult = null;
  if (auto) {
    autoResult = autoRecords(db.query('SELECT name FROM products'));
    records = autoResult.records;
    console.log(`public/img/: ${records.length} dosya eşleşti${dryNote}`);
  } else {
    if (!fs.existsSync(file)) throw new Error(`Dosya bulunamadı: ${file}`);
    records = toRecords(parseCsv(fs.readFileSync(file, 'utf8')), path.basename(file));
    console.log(`${path.basename(file)}: ${records.length} satır okundu${dryNote}`);
  }

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
        const replaceable = !current
          || (OLD_PHOTO.test(path.basename(current)) && !OLD_PHOTO.test(r.dosya));
        if (current !== image && !replaceable && !force) {
          stats.mainKept.push(`${product.name}: panelde "${current}" var, "${image}" atlandı`);
        } else if (current !== image) {
          if (!dryRun) db.run('UPDATE products SET image = ? WHERE id = ?', [image, product.id]);
          product.image = image;
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
  if (autoResult) reportAuto(autoResult, records, products);
}

/** --auto özeti: görsel alan ürünler, hâlâ görselsizler, eşleşmeyen dosyalar. */
function reportAuto({ unmatched, ignored }, records, products) {
  const matched = new Set(records.filter((r) => r.kullanim === 'urun').map((r) => r.hedef));
  const groups = new Map();
  records.filter((r) => r.kullanim !== 'urun')
    .forEach((r) => groups.set(r.hedef, (groups.get(r.hedef) || 0) + 1));
  const withoutImage = [...products.values()].filter((p) => !p.image)
    .map((p) => p.name).sort((a, b) => a.localeCompare(b, 'tr'));

  console.log(`\n=== Otomatik eşleştirme ===`);
  console.log(`1. Fotoğrafı eşleşen ürün: ${matched.size}`);
  groups.forEach((n, name) => console.log(`   + ${name}: ${n} fotoğraf (galeri)`));
  console.log(`\n2. Hâlâ görselsiz ${withoutImage.length} ürün:`);
  withoutImage.forEach((n) => console.log(`  - ${n}`));
  console.log(`\n3. Hiçbir ürünle eşleşmeyen ${unmatched.length} dosya:`);
  unmatched.forEach((f) => console.log(`  - ${f}`));
  if (ignored.length) console.log(`\n· Site görseli olduğu için atlanan ${ignored.length} dosya: ${ignored.join(', ')}`);
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
