const express = require('express');
const router = express.Router();

const settingModel = require('../../models/setting');
const { uploadSingle } = require('../../middleware/upload');
const { removeUpload } = require('../../config/paths');
const { setFlash } = require('../../middleware/locals');
const csrf = require('../../middleware/csrf');

const LAYOUT = 'layouts/admin';

// Görsel yüklendiği için form multipart; CSRF doğrulaması multer'dan SONRA.
const withImage = [uploadSingle('popup_image_file'), csrf.verify];

const TEXT_KEYS = ['popup_title', 'popup_text', 'popup_button_text', 'popup_button_url'];

function validate(values) {
  const errors = [];
  if (values.popup_title.length > 120) errors.push('Başlık en fazla 120 karakter olabilir.');
  if (values.popup_button_url && !/^(https?:\/\/|\/|mailto:|tel:)/i.test(values.popup_button_url)) {
    errors.push('Buton linki http:// veya https:// ile ya da / ile başlamalıdır.');
  }
  if (values.popup_button_text && !values.popup_button_url) {
    errors.push('Buton yazısı girdiyseniz buton linkini de doldurun.');
  }
  return errors;
}

router.get('/', async (req, res, next) => {
  try {
    res.render('admin/popup', {
      title: 'Pop-up Duyuru',
      layout: LAYOUT,
      popup: await settingModel.getMap(),
      errors: [],
    });
  } catch (err) { next(err); }
});

router.post('/', withImage, async (req, res, next) => {
  try {
    const current = await settingModel.getMap();

    const values = {};
    for (const key of TEXT_KEYS) values[key] = String(req.body[key] || '').trim();
    // İşaretsiz kutu hiç gönderilmez; bu yüzden her zaman açıkça yazılır.
    values.popup_enabled = req.body.popup_enabled ? '1' : '0';

    const errors = validate(values);
    if (errors.length) {
      if (req.file) removeUpload(req.file.filename);
      return res.status(400).render('admin/popup', {
        title: 'Pop-up Duyuru',
        layout: LAYOUT,
        popup: { ...current, ...values },
        errors,
      });
    }

    // Görsel: yeni yüklendiyse değiştir, "kaldır" işaretliyse sil, yoksa dokunma
    let oldImage = null;
    if (req.file) {
      oldImage = current.popup_image || null;
      values.popup_image = req.file.filename;
    } else if (req.body.popup_image_remove) {
      oldImage = current.popup_image || null;
      values.popup_image = '';
    }

    await settingModel.updateMany(values);
    if (oldImage) removeUpload(oldImage);

    setFlash(req, 'success', values.popup_enabled === '1'
      ? 'Pop-up duyuru kaydedildi ve sitede yayında.'
      : 'Pop-up duyuru kaydedildi (şu an kapalı).');
    return res.redirect('/admin/duyuru');
  } catch (err) { next(err); }
});

module.exports = router;
