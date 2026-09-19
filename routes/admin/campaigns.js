const express = require('express');
const router = express.Router();

const campaignModel = require('../../models/campaign');
const { uploadSingle } = require('../../middleware/upload');
const { removeUpload } = require('../../config/paths');
const { setFlash } = require('../../middleware/locals');
const csrf = require('../../middleware/csrf');

const LAYOUT = 'layouts/admin';
const withImage = [uploadSingle('image'), csrf.verify];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readForm(body) {
  return {
    title: String(body.title || '').trim(),
    shortDesc: String(body.short_desc || '').trim() || null,
    description: String(body.description || '').trim() || null,
    startsAt: String(body.starts_at || '').trim(),
    endsAt: String(body.ends_at || '').trim(),
    isPublished: body.is_published ? 1 : 0,
    sortOrder: Number(body.sort_order) || 0,
  };
}

function validate(data) {
  const errors = [];
  if (!data.title) errors.push('Kampanya başlığı zorunludur.');
  if (data.title.length > 180) errors.push('Başlık en fazla 180 karakter olabilir.');
  if (data.startsAt && !DATE_RE.test(data.startsAt)) errors.push('Başlangıç tarihi geçersiz.');
  if (data.endsAt && !DATE_RE.test(data.endsAt)) errors.push('Bitiş tarihi geçersiz.');
  if (data.startsAt && data.endsAt && data.startsAt > data.endsAt) {
    errors.push('Bitiş tarihi başlangıç tarihinden önce olamaz.');
  }
  return errors;
}

/** Yayında ama tarihi geçmiş kampanyalar sitede görünmez; panelde uyaralım. */
function publishState(c) {
  if (!c.is_published) return 'Taslak';
  const today = new Date().toISOString().slice(0, 10);
  if (c.starts_at && c.starts_at > today) return 'Henüz başlamadı';
  if (c.ends_at && c.ends_at < today) return 'Süresi doldu';
  return 'Yayında';
}

// ---- Liste ----
router.get('/', async (req, res, next) => {
  try {
    const campaigns = await campaignModel.listAll();
    res.render('admin/campaigns/index', {
      title: 'Kampanyalar',
      layout: LAYOUT,
      campaigns: campaigns.map((c) => ({ ...c, state: publishState(c) })),
    });
  } catch (err) { next(err); }
});

// ---- Yeni ----
router.get('/yeni', (req, res) => {
  res.render('admin/campaigns/form', {
    title: 'Yeni Kampanya',
    layout: LAYOUT,
    campaign: {
      title: '', short_desc: '', description: '', image: null,
      starts_at: '', ends_at: '', is_published: 0, sort_order: 0,
    },
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
      return res.status(400).render('admin/campaigns/form', {
        title: 'Yeni Kampanya',
        layout: LAYOUT,
        campaign: { ...req.body, image: null },
        errors,
        isNew: true,
      });
    }

    await campaignModel.create({ ...data, image: req.file ? req.file.filename : null });
    setFlash(req, 'success', `"${data.title}" kampanyası eklendi.`);
    return res.redirect('/admin/kampanyalar');
  } catch (err) { next(err); }
});

// ---- Düzenle ----
router.get('/:id/duzenle', async (req, res, next) => {
  try {
    const campaign = await campaignModel.findById(req.params.id);
    if (!campaign) return next();

    res.render('admin/campaigns/form', {
      title: `Kampanya: ${campaign.title}`,
      layout: LAYOUT,
      campaign,
      errors: [],
      isNew: false,
    });
  } catch (err) { next(err); }
});

router.put('/:id', withImage, async (req, res, next) => {
  try {
    const current = await campaignModel.findById(req.params.id);
    if (!current) {
      if (req.file) removeUpload(req.file.filename);
      return next();
    }

    const data = readForm(req.body);
    const errors = validate(data);

    if (errors.length) {
      if (req.file) removeUpload(req.file.filename);
      return res.status(400).render('admin/campaigns/form', {
        title: `Kampanya: ${current.title}`,
        layout: LAYOUT,
        campaign: { ...current, ...req.body },
        errors,
        isNew: false,
      });
    }

    let image = undefined;
    if (req.file) image = req.file.filename;
    else if (req.body.remove_image) image = null;

    await campaignModel.update(current.id, { ...data, image });

    if (image !== undefined && current.image) removeUpload(current.image);

    setFlash(req, 'success', `"${data.title}" kampanyası güncellendi.`);
    return res.redirect('/admin/kampanyalar');
  } catch (err) { next(err); }
});

// ---- Yayına al / yayından kaldır ----
router.post('/:id/yayin', async (req, res, next) => {
  try {
    const campaign = await campaignModel.findById(req.params.id);
    if (!campaign) return next();

    const next_ = campaign.is_published ? 0 : 1;
    await campaignModel.update(campaign.id, {
      title: campaign.title,
      shortDesc: campaign.short_desc,
      description: campaign.description,
      image: campaign.image,
      startsAt: campaign.starts_at,
      endsAt: campaign.ends_at,
      isPublished: next_,
      sortOrder: campaign.sort_order,
    });

    setFlash(req, 'success', next_
      ? `"${campaign.title}" yayına alındı.`
      : `"${campaign.title}" yayından kaldırıldı.`);
    return res.redirect('/admin/kampanyalar');
  } catch (err) { next(err); }
});

// ---- Sil ----
router.delete('/:id', async (req, res, next) => {
  try {
    const campaign = await campaignModel.findById(req.params.id);
    if (!campaign) return next();

    await campaignModel.remove(campaign.id);
    if (campaign.image) removeUpload(campaign.image);

    setFlash(req, 'success', `"${campaign.title}" kampanyası silindi.`);
    return res.redirect('/admin/kampanyalar');
  } catch (err) { next(err); }
});

module.exports = router;
