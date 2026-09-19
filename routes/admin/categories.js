const express = require('express');
const router = express.Router();

const categoryModel = require('../../models/category');
const productModel = require('../../models/product');
const { uploadSingle } = require('../../middleware/upload');
const { removeUpload } = require('../../config/paths');
const { setFlash } = require('../../middleware/locals');
const csrf = require('../../middleware/csrf');

const LAYOUT = 'layouts/admin';
// Görsel yüklenen rotalarda CSRF doğrulaması multer'dan SONRA çalışmalı.
const withImage = [uploadSingle('image'), csrf.verify];

function readForm(body) {
  return {
    name: String(body.name || '').trim(),
    description: String(body.description || '').trim() || null,
    sortOrder: Number(body.sort_order) || 0,
    isActive: body.is_active ? 1 : 0,
  };
}

function validate(data) {
  const errors = [];
  if (!data.name) errors.push('Kategori adı zorunludur.');
  if (data.name.length > 100) errors.push('Kategori adı en fazla 100 karakter olabilir.');
  return errors;
}

// ---- Liste ----
router.get('/', async (req, res, next) => {
  try {
    res.render('admin/categories/index', {
      title: 'Kategoriler',
      layout: LAYOUT,
      categories: await categoryModel.all(),
    });
  } catch (err) { next(err); }
});

// ---- Yeni ----
router.get('/yeni', (req, res) => {
  res.render('admin/categories/form', {
    title: 'Yeni Kategori',
    layout: LAYOUT,
    category: { name: '', description: '', sort_order: 0, is_active: 1, image: null },
    errors: [],
    isNew: true,
  });
});

router.post('/', withImage, async (req, res, next) => {
  try {
    const data = readForm(req.body);
    const errors = validate(data);

    if (errors.length) {
      if (req.file) removeUpload(req.file.filename);
      return res.status(400).render('admin/categories/form', {
        title: 'Yeni Kategori',
        layout: LAYOUT,
        category: { ...req.body, image: null },
        errors,
        isNew: true,
      });
    }

    await categoryModel.create({ ...data, image: req.file ? req.file.filename : null });
    setFlash(req, 'success', `"${data.name}" kategorisi eklendi.`);
    return res.redirect('/admin/kategoriler');
  } catch (err) { next(err); }
});

// ---- Düzenle ----
router.get('/:id/duzenle', async (req, res, next) => {
  try {
    const category = await categoryModel.findById(req.params.id);
    if (!category) return next();

    res.render('admin/categories/form', {
      title: `Kategori: ${category.name}`,
      layout: LAYOUT,
      category,
      errors: [],
      isNew: false,
    });
  } catch (err) { next(err); }
});

router.put('/:id', withImage, async (req, res, next) => {
  try {
    const current = await categoryModel.findById(req.params.id);
    if (!current) {
      if (req.file) removeUpload(req.file.filename);
      return next();
    }

    const data = readForm(req.body);
    const errors = validate(data);

    if (errors.length) {
      if (req.file) removeUpload(req.file.filename);
      return res.status(400).render('admin/categories/form', {
        title: `Kategori: ${current.name}`,
        layout: LAYOUT,
        category: { ...current, ...req.body },
        errors,
        isNew: false,
      });
    }

    // Görsel: yeni yüklendiyse değiştir, "kaldır" işaretliyse sil, yoksa dokunma
    let image = undefined;
    if (req.file) image = req.file.filename;
    else if (req.body.remove_image) image = null;

    await categoryModel.update(current.id, { ...data, image });

    if (image !== undefined && current.image) removeUpload(current.image);

    setFlash(req, 'success', `"${data.name}" kategorisi güncellendi.`);
    return res.redirect('/admin/kategoriler');
  } catch (err) { next(err); }
});

// ---- Hızlı işlem: yayın durumu ----
router.post('/:id/durum', async (req, res, next) => {
  try {
    const category = await categoryModel.findById(req.params.id);
    if (!category) return next();

    const next_ = await categoryModel.toggle(category.id);
    setFlash(req, 'success', next_
      ? `"${category.name}" sitede yayına alındı.`
      : `"${category.name}" siteden gizlendi.`);
    return res.redirect('/admin/kategoriler');
  } catch (err) { next(err); }
});

// ---- Sıralama ----
router.post('/:id/tasi', async (req, res, next) => {
  try {
    const direction = req.body.yon === 'up' ? 'up' : 'down';
    const category = await categoryModel.findById(req.params.id);
    if (!category) return next();

    const result = await categoryModel.move(category.id, direction);
    if (result === 'edge') {
      setFlash(req, 'error', `"${category.name}" zaten listenin ${direction === 'up' ? 'başında' : 'sonunda'}.`);
    }
    return res.redirect('/admin/kategoriler');
  } catch (err) { next(err); }
});

// ---- Sil ----
router.delete('/:id', async (req, res, next) => {
  try {
    const category = await categoryModel.findById(req.params.id);
    if (!category) return next();

    // Ürünler silinmez; FK ON DELETE SET NULL ile kategorisiz kalırlar.
    const affected = await productModel.list({ categoryId: category.id });
    await categoryModel.remove(category.id);
    if (category.image) removeUpload(category.image);

    const note = affected.length
      ? ` ${affected.length} ürün kategorisiz kaldı, yeni kategori atamayı unutmayın.`
      : '';
    setFlash(req, 'success', `"${category.name}" kategorisi silindi.${note}`);
    return res.redirect('/admin/kategoriler');
  } catch (err) { next(err); }
});

module.exports = router;
