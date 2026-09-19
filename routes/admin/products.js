const path = require('path');
const express = require('express');
const router = express.Router();

const productModel = require('../../models/product');
const categoryModel = require('../../models/category');
const { uploadSingle } = require('../../middleware/upload');
const { removeUpload } = require('../../config/paths');
const { setFlash } = require('../../middleware/locals');
const { galleryImages, prettyFileName, GALLERY_PREFIX } = require('../../utils/helpers');
const { slugify } = require('../../utils/slugify');
const csrf = require('../../middleware/csrf');

const LAYOUT = 'layouts/admin';
const withImage = [uploadSingle('image'), csrf.verify];

const UNITS = ['kg', 'adet', 'porsiyon', 'paket', 'litre'];

function readForm(body) {
  return {
    categoryId: body.category_id ? Number(body.category_id) : null,
    name: String(body.name || '').trim(),
    slug: String(body.slug || '').trim(),
    shortDesc: String(body.short_desc || '').trim() || null,
    description: String(body.description || '').trim() || null,
    origin: String(body.origin || '').trim() || null,
    price: String(body.price || '').trim(),
    unit: UNITS.includes(body.unit) ? body.unit : 'kg',
    isFeatured: body.is_featured ? 1 : 0,
    isActive: body.is_active ? 1 : 0,
    sortOrder: Number(body.sort_order) || 0,
  };
}

function validate(data) {
  const errors = [];
  if (!data.name) errors.push('Ürün adı zorunludur.');
  if (data.name.length > 150) errors.push('Ürün adı en fazla 150 karakter olabilir.');
  if (data.shortDesc && data.shortDesc.length > 300) errors.push('Kısa açıklama en fazla 300 karakter olabilir.');
  if (data.origin && data.origin.length > 120) errors.push('Yöre bilgisi en fazla 120 karakter olabilir.');
  if (data.slug && !slugify(data.slug)) errors.push('Adres yalnızca harf, rakam ve tire içerebilir.');
  if (data.price !== '') {
    const n = Number(data.price.replace(',', '.'));
    if (Number.isNaN(n)) errors.push('Fiyat sayı olmalıdır (örn. 145,50).');
    else if (n < 0) errors.push('Fiyat negatif olamaz.');
  }
  return errors;
}

/**
 * Görsel üç yoldan gelebilir: yeni yükleme, public/img'den seçim, veya kaldırma.
 * Döner: { value, changed } — changed=false ise mevcut görsele dokunulmaz.
 * Galeri seçimi gerçek dosya listesine karşı doğrulanır; uydurma değer kabul edilmez.
 */
function pickImage(req) {
  if (req.file) return { value: req.file.filename, changed: true };

  const chosen = String(req.body.gallery_image || '').trim();
  if (chosen) {
    const safe = path.basename(chosen.replace(new RegExp(`^${GALLERY_PREFIX}`), ''));
    if (galleryImages().includes(safe)) return { value: GALLERY_PREFIX + safe, changed: true };
    return { value: undefined, changed: false }; // bilinmeyen dosya: yok say
  }

  if (req.body.remove_image) return { value: null, changed: true };
  return { value: undefined, changed: false };
}

/** Filtre korunarak listeye dönüş adresi. */
function listUrl(req) {
  const params = new URLSearchParams();
  if (req.query.kategori) params.set('kategori', String(req.query.kategori));
  if (req.query.ara) params.set('ara', String(req.query.ara));
  const qs = params.toString();
  return qs ? `/admin/urunler?${qs}` : '/admin/urunler';
}

async function formContext(extra) {
  const product = extra.product || {};
  const gallery = galleryImages().map((file) => ({
    file,
    value: GALLERY_PREFIX + file,
    label: prettyFileName(file),
  }));

  // Müşteri fotoğrafları [urun-adi].jpg olarak atacak; slug ile eşleşeni öne çıkar.
  const slug = product.slug || slugify(product.name || '');
  const suggested = slug
    ? gallery.find((g) => g.file.replace(/\.[^.]+$/, '').toLowerCase() === slug.toLowerCase())
    : null;

  return {
    layout: LAYOUT,
    units: UNITS,
    categories: await categoryModel.all(),
    gallery,
    suggested: suggested || null,
    ...extra,
  };
}

const EMPTY_PRODUCT = {
  category_id: null, name: '', slug: '', short_desc: '', description: '', origin: '',
  price: '', unit: 'kg', image: null, is_featured: 0, is_active: 1, sort_order: 0,
};

// ---- Liste ----
router.get('/', async (req, res, next) => {
  try {
    const categorySlug = req.query.kategori || undefined;
    const search = req.query.ara || undefined;
    const products = await productModel.list({ categorySlug, search });

    res.render('admin/products/index', {
      title: 'Ürünler',
      layout: LAYOUT,
      products,
      categories: await categoryModel.all(),
      filter: { categorySlug: categorySlug || '', search: search || '' },
      listQuery: listUrl(req).replace('/admin/urunler', ''), // form action'larına eklenir
    });
  } catch (err) { next(err); }
});

// ---- Yeni ----
router.get('/yeni', async (req, res, next) => {
  try {
    res.render('admin/products/form', await formContext({
      title: 'Yeni Ürün',
      product: { ...EMPTY_PRODUCT },
      errors: [],
      isNew: true,
    }));
  } catch (err) { next(err); }
});

router.post('/', withImage, async (req, res, next) => {
  try {
    const data = readForm(req.body);
    const errors = validate(data);
    const image = pickImage(req);

    if (errors.length) {
      if (req.file) removeUpload(req.file.filename);
      return res.status(400).render('admin/products/form', await formContext({
        title: 'Yeni Ürün',
        product: { ...EMPTY_PRODUCT, ...req.body, image: null },
        errors,
        isNew: true,
      }));
    }

    await productModel.create({ ...data, image: image.changed ? image.value : null });
    setFlash(req, 'success', `"${data.name}" ürünü eklendi.`);
    return res.redirect('/admin/urunler');
  } catch (err) { next(err); }
});

// ---- Düzenle ----
router.get('/:id/duzenle', async (req, res, next) => {
  try {
    const product = await productModel.findById(req.params.id);
    if (!product) return next();

    res.render('admin/products/form', await formContext({
      title: `Ürün: ${product.name}`,
      product,
      errors: [],
      isNew: false,
    }));
  } catch (err) { next(err); }
});

router.put('/:id', withImage, async (req, res, next) => {
  try {
    const current = await productModel.findById(req.params.id);
    if (!current) {
      if (req.file) removeUpload(req.file.filename);
      return next();
    }

    const data = readForm(req.body);
    const errors = validate(data);

    if (errors.length) {
      if (req.file) removeUpload(req.file.filename);
      return res.status(400).render('admin/products/form', await formContext({
        title: `Ürün: ${current.name}`,
        product: { ...current, ...req.body },
        errors,
        isNew: false,
      }));
    }

    const image = pickImage(req);
    await productModel.update(current.id, { ...data, image: image.changed ? image.value : undefined });

    // Eski dosya yalnızca yüklenmişse silinir; public/img'deki paylaşılan
    // görseller başka ürünlerde de kullanılabileceği için silinmez.
    if (image.changed && current.image) removeUpload(current.image);

    setFlash(req, 'success', `"${data.name}" ürünü güncellendi.`);
    return res.redirect('/admin/urunler');
  } catch (err) { next(err); }
});

// ---- Hızlı işlemler: öne çıkar / yayın durumu ----
router.post('/:id/one-cikar', async (req, res, next) => {
  try {
    const product = await productModel.findById(req.params.id);
    if (!product) return next();

    const next_ = await productModel.toggle(product.id, 'is_featured');
    setFlash(req, 'success', next_
      ? `"${product.name}" ana sayfada öne çıkarıldı.`
      : `"${product.name}" öne çıkanlardan kaldırıldı.`);
    return res.redirect(listUrl(req));
  } catch (err) { next(err); }
});

router.post('/:id/durum', async (req, res, next) => {
  try {
    const product = await productModel.findById(req.params.id);
    if (!product) return next();

    const next_ = await productModel.toggle(product.id, 'is_active');
    setFlash(req, 'success', next_
      ? `"${product.name}" sitede yayına alındı.`
      : `"${product.name}" siteden gizlendi.`);
    return res.redirect(listUrl(req));
  } catch (err) { next(err); }
});

// ---- Sıralama ----
router.post('/:id/tasi', async (req, res, next) => {
  try {
    const direction = req.body.yon === 'up' ? 'up' : 'down';
    const product = await productModel.findById(req.params.id);
    if (!product) return next();

    // Ekranda görünen (filtrelenmiş) liste içinde komşuyla yer değiştirsin
    const scope = await productModel.list({
      categorySlug: req.query.kategori || undefined,
      search: req.query.ara || undefined,
    });

    const result = await productModel.move(product.id, direction, scope.map((p) => p.id));
    if (result === 'edge') {
      setFlash(req, 'error', `"${product.name}" zaten listenin ${direction === 'up' ? 'başında' : 'sonunda'}.`);
    }
    return res.redirect(listUrl(req));
  } catch (err) { next(err); }
});

// ---- Sil ----
router.delete('/:id', async (req, res, next) => {
  try {
    const product = await productModel.findById(req.params.id);
    if (!product) return next();

    await productModel.remove(product.id);
    if (product.image) removeUpload(product.image);

    setFlash(req, 'success', `"${product.name}" ürünü silindi.`);
    return res.redirect(listUrl(req));
  } catch (err) { next(err); }
});

module.exports = router;
