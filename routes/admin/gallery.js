const path = require('path');
const express = require('express');
const router = express.Router();

const galleryModel = require('../../models/gallery');
const productModel = require('../../models/product');
const { uploadSingle } = require('../../middleware/upload');
const { removeUpload } = require('../../config/paths');
const { setFlash } = require('../../middleware/locals');
const { galleryImages, prettyFileName, GALLERY_PREFIX, isGalleryImage } = require('../../utils/helpers');
const csrf = require('../../middleware/csrf');

const LAYOUT = 'layouts/admin';
const withImage = [uploadSingle('image'), csrf.verify];

const { GALLERIES } = galleryModel;
const DEFAULT_GALLERY = 'tabak';

/** URL'den gelen galeri anahtarını doğrular. */
function galleryKey(value, fallback = DEFAULT_GALLERY) {
  const key = String(value || '').trim();
  return galleryModel.isGallery(key) ? key : fallback;
}

function readForm(body) {
  return {
    gallery: galleryKey(body.gallery),
    productId: body.product_id ? Number(body.product_id) : null,
    groupName: String(body.group_name || '').trim(),
    caption: String(body.caption || '').trim(),
    sortOrder: Number(body.sort_order) || 0,
    isActive: body.is_active ? 1 : 0,
  };
}

function validate(data, image) {
  const errors = [];
  if (!image) errors.push('Bir fotoğraf yükleyin ya da hazır fotoğraflardan seçin.');
  if (data.gallery === 'urun' && !data.productId) {
    errors.push('Ürün galerisine eklenen fotoğraf için ürün seçmelisiniz.');
  }
  if (data.gallery !== 'urun' && !data.groupName) {
    errors.push('Galeri grubu adı zorunludur (örn. "Peynir Tabağı").');
  }
  if (data.groupName.length > 100) errors.push('Grup adı en fazla 100 karakter olabilir.');
  if (data.caption.length > 200) errors.push('Not en fazla 200 karakter olabilir.');
  return errors;
}

/**
 * Görsel ya yeni yüklemeden ya public/img seçiminden gelir.
 * Galeri seçimi gerçek dosya listesine karşı doğrulanır; uydurma değer kabul edilmez.
 * Döner: { value, changed } — changed=false ise mevcut görsele dokunulmaz.
 */
function pickImage(req) {
  if (req.file) return { value: req.file.filename, changed: true };

  const chosen = String(req.body.gallery_image || '').trim();
  if (chosen) {
    const safe = path.basename(chosen.replace(new RegExp(`^${GALLERY_PREFIX}`), ''));
    if (galleryImages().includes(safe)) return { value: GALLERY_PREFIX + safe, changed: true };
  }
  return { value: undefined, changed: false };
}

/** Yükleme başarısız olup form hatayla dönerse diske yazılan dosyayı bırakmayalım. */
function discardUpload(req) {
  if (req.file) removeUpload(req.file.filename);
}

async function formContext(extra) {
  const photo = extra.photo || {};
  const gallery = galleryImages().map((file) => ({
    file,
    value: GALLERY_PREFIX + file,
    label: prettyFileName(file),
  }));

  return {
    layout: LAYOUT,
    galleries: GALLERIES,
    gallery,
    suggested: null,
    products: await productModel.list(),
    groupNames: await galleryModel.groupNames(photo.gallery || DEFAULT_GALLERY),
    ...extra,
  };
}

const EMPTY_PHOTO = {
  gallery: DEFAULT_GALLERY, product_id: null, group_name: '', image: null,
  caption: '', sort_order: 0, is_active: 1,
};

const listUrl = (key) => `/admin/galeri?galeri=${encodeURIComponent(key)}`;

// ---- Liste ----
router.get('/', async (req, res, next) => {
  try {
    const active = galleryKey(req.query.galeri);

    res.render('admin/gallery/index', {
      title: 'Galeriler',
      layout: LAYOUT,
      galleries: GALLERIES,
      activeGallery: active,
      photos: await galleryModel.list({ gallery: active }),
      counts: await galleryModel.counts(),
    });
  } catch (err) { next(err); }
});

// ---- Yeni ----
router.get('/yeni', async (req, res, next) => {
  try {
    const key = galleryKey(req.query.galeri);
    res.render('admin/gallery/form', await formContext({
      title: 'Yeni fotoğraf',
      photo: { ...EMPTY_PHOTO, gallery: key },
      errors: [],
      isNew: true,
    }));
  } catch (err) { next(err); }
});

router.post('/', withImage, async (req, res, next) => {
  try {
    const data = readForm(req.body);
    const picked = pickImage(req);
    const errors = validate(data, picked.value);

    if (errors.length) {
      discardUpload(req);
      return res.status(400).render('admin/gallery/form', await formContext({
        title: 'Yeni fotoğraf',
        photo: { ...EMPTY_PHOTO, ...req.body },
        errors,
        isNew: true,
      }));
    }

    // Aynı dosya aynı galeride zaten varsa UNIQUE kısıtı hata verir; anlaşılır mesaj verelim.
    const clash = await galleryModel.findByImage(data.gallery, picked.value);
    if (clash) {
      discardUpload(req);
      return res.status(400).render('admin/gallery/form', await formContext({
        title: 'Yeni fotoğraf',
        photo: { ...EMPTY_PHOTO, ...req.body },
        errors: ['Bu fotoğraf bu galeride zaten var.'],
        isNew: true,
      }));
    }

    await galleryModel.create({ ...data, image: picked.value });
    setFlash(req, 'success', 'Fotoğraf galeriye eklendi.');
    return res.redirect(listUrl(data.gallery));
  } catch (err) { next(err); }
});

// ---- Düzenle ----
router.get('/:id/duzenle', async (req, res, next) => {
  try {
    const photo = await galleryModel.findById(req.params.id);
    if (!photo) return next();

    res.render('admin/gallery/form', await formContext({
      title: 'Fotoğrafı düzenle',
      photo,
      errors: [],
      isNew: false,
    }));
  } catch (err) { next(err); }
});

router.put('/:id', withImage, async (req, res, next) => {
  try {
    const current = await galleryModel.findById(req.params.id);
    if (!current) { discardUpload(req); return next(); }

    const data = readForm(req.body);
    const picked = pickImage(req);
    const image = picked.changed ? picked.value : current.image;
    const errors = validate(data, image);

    if (errors.length) {
      discardUpload(req);
      return res.status(400).render('admin/gallery/form', await formContext({
        title: 'Fotoğrafı düzenle',
        photo: { ...current, ...req.body },
        errors,
        isNew: false,
      }));
    }

    await galleryModel.update(current.id, { ...data, image });

    // Görsel değiştiyse panelden yüklenmiş eski dosya sunucuda çöp kalmasın.
    // public/img'den seçilmiş dosyalar repoya ait, onlara dokunulmaz.
    if (picked.changed && current.image !== image && !isGalleryImage(current.image)) {
      removeUpload(current.image);
    }

    setFlash(req, 'success', 'Fotoğraf güncellendi.');
    return res.redirect(listUrl(data.gallery));
  } catch (err) { next(err); }
});

// ---- Hızlı işlem: yayın durumu ----
router.post('/:id/durum', async (req, res, next) => {
  try {
    const photo = await galleryModel.findById(req.params.id);
    if (!photo) return next();

    const next_ = await galleryModel.toggle(photo.id);
    setFlash(req, 'success', next_ ? 'Fotoğraf yayına alındı.' : 'Fotoğraf gizlendi.');
    return res.redirect(listUrl(photo.gallery));
  } catch (err) { next(err); }
});

// ---- Sıralama ----
router.post('/:id/tasi', async (req, res, next) => {
  try {
    const direction = req.body.yon === 'up' ? 'up' : 'down';
    const photo = await galleryModel.findById(req.params.id);
    if (!photo) return next();

    const result = await galleryModel.move(photo.id, direction);
    if (result === 'edge') {
      setFlash(req, 'error', `Fotoğraf zaten galerinin ${direction === 'up' ? 'başında' : 'sonunda'}.`);
    }
    return res.redirect(listUrl(photo.gallery));
  } catch (err) { next(err); }
});

// ---- Sil ----
router.delete('/:id', async (req, res, next) => {
  try {
    const photo = await galleryModel.findById(req.params.id);
    if (!photo) return next();

    await galleryModel.remove(photo.id);
    if (!isGalleryImage(photo.image)) removeUpload(photo.image);

    setFlash(req, 'success', 'Fotoğraf galeriden kaldırıldı.');
    return res.redirect(listUrl(photo.gallery));
  } catch (err) { next(err); }
});

module.exports = router;
