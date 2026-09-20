const express = require('express');
const router = express.Router();

const branchModel = require('../../models/branch');
const { setFlash } = require('../../middleware/locals');

const LAYOUT = 'layouts/admin';

const EMPTY_BRANCH = {
  name: '', address: '', phone: '', hours: '', map_url: '', note: '',
  sort_order: 0, is_active: 1,
};

function readForm(body) {
  return {
    name: String(body.name || '').trim(),
    address: String(body.address || '').trim(),
    phone: String(body.phone || '').trim(),
    hours: String(body.hours || '').trim(),
    mapUrl: String(body.map_url || '').trim(),
    note: String(body.note || '').trim(),
    sortOrder: Number(body.sort_order) || 0,
    isActive: body.is_active ? 1 : 0,
  };
}

function validate(data) {
  const errors = [];
  if (!data.name) errors.push('Şube adı zorunludur.');
  if (data.name.length > 100) errors.push('Şube adı en fazla 100 karakter olabilir.');
  if (data.mapUrl && !/^https?:\/\//i.test(data.mapUrl)) {
    errors.push('Harita bağlantısı http:// veya https:// ile başlamalıdır.');
  }
  return errors;
}

// ---- Liste ----
router.get('/', async (req, res, next) => {
  try {
    res.render('admin/branches/index', {
      title: 'Şubeler',
      layout: LAYOUT,
      branches: await branchModel.all(),
    });
  } catch (err) { next(err); }
});

// ---- Yeni ----
router.get('/yeni', (req, res) => {
  res.render('admin/branches/form', {
    title: 'Yeni Şube',
    layout: LAYOUT,
    branch: { ...EMPTY_BRANCH },
    errors: [],
    isNew: true,
  });
});

router.post('/', async (req, res, next) => {
  try {
    const data = readForm(req.body);
    const errors = validate(data);

    if (errors.length) {
      return res.status(400).render('admin/branches/form', {
        title: 'Yeni Şube',
        layout: LAYOUT,
        branch: { ...EMPTY_BRANCH, ...req.body },
        errors,
        isNew: true,
      });
    }

    await branchModel.create(data);
    setFlash(req, 'success', `"${data.name}" şubesi eklendi.`);
    return res.redirect('/admin/subeler');
  } catch (err) { next(err); }
});

// ---- Düzenle ----
router.get('/:id/duzenle', async (req, res, next) => {
  try {
    const branch = await branchModel.findById(req.params.id);
    if (!branch) return next();

    res.render('admin/branches/form', {
      title: `Şube: ${branch.name}`,
      layout: LAYOUT,
      branch,
      errors: [],
      isNew: false,
    });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const current = await branchModel.findById(req.params.id);
    if (!current) return next();

    const data = readForm(req.body);
    const errors = validate(data);

    if (errors.length) {
      return res.status(400).render('admin/branches/form', {
        title: `Şube: ${current.name}`,
        layout: LAYOUT,
        branch: { ...current, ...req.body },
        errors,
        isNew: false,
      });
    }

    await branchModel.update(current.id, data);
    setFlash(req, 'success', `"${data.name}" şubesi güncellendi.`);
    return res.redirect('/admin/subeler');
  } catch (err) { next(err); }
});

// ---- Hızlı işlem: yayın durumu ----
router.post('/:id/durum', async (req, res, next) => {
  try {
    const branch = await branchModel.findById(req.params.id);
    if (!branch) return next();

    const next_ = await branchModel.toggle(branch.id);
    setFlash(req, 'success', next_
      ? `"${branch.name}" ana sayfada yayına alındı.`
      : `"${branch.name}" ana sayfadan gizlendi.`);
    return res.redirect('/admin/subeler');
  } catch (err) { next(err); }
});

// ---- Sıralama ----
router.post('/:id/tasi', async (req, res, next) => {
  try {
    const direction = req.body.yon === 'up' ? 'up' : 'down';
    const branch = await branchModel.findById(req.params.id);
    if (!branch) return next();

    const result = await branchModel.move(branch.id, direction);
    if (result === 'edge') {
      setFlash(req, 'error', `"${branch.name}" zaten listenin ${direction === 'up' ? 'başında' : 'sonunda'}.`);
    }
    return res.redirect('/admin/subeler');
  } catch (err) { next(err); }
});

// ---- Sil ----
router.delete('/:id', async (req, res, next) => {
  try {
    const branch = await branchModel.findById(req.params.id);
    if (!branch) return next();

    await branchModel.remove(branch.id);
    setFlash(req, 'success', `"${branch.name}" şubesi silindi.`);
    return res.redirect('/admin/subeler');
  } catch (err) { next(err); }
});

module.exports = router;
