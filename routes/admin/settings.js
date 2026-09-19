const express = require('express');
const router = express.Router();

const settingModel = require('../../models/setting');
const { uploadSingle } = require('../../middleware/upload');
const { removeUpload } = require('../../config/paths');
const { setFlash } = require('../../middleware/locals');
const csrf = require('../../middleware/csrf');

const LAYOUT = 'layouts/admin';

// Logo yüklendiği için form multipart; CSRF doğrulaması multer'dan SONRA.
const withLogo = [uploadSingle('logo_file'), csrf.verify];

const GROUP_LABELS = {
  genel: 'Genel',
  iletisim: 'İletişim Bilgileri',
  saatler: 'Çalışma Saatleri',
  sosyal: 'Sosyal Medya',
};

router.get('/', async (req, res, next) => {
  try {
    res.render('admin/settings', {
      title: 'Ayarlar',
      layout: LAYOUT,
      groups: await settingModel.getGrouped(),
      groupLabels: GROUP_LABELS,
    });
  } catch (err) { next(err); }
});

router.post('/', withLogo, async (req, res, next) => {
  try {
    const all = Object.values(await settingModel.getGrouped()).flat();
    // Sadece veritabanında TANIMLI anahtarlar güncellenir; _csrf gibi
    // beklenmedik form alanları yok sayılır.
    const values = {};
    let oldLogo = null;

    for (const setting of all) {
      const key = setting.setting_key;

      if (setting.input_type === 'checkbox') {
        // İşaretsiz kutu hiç gönderilmez; bu yüzden her zaman açıkça yazılır.
        values[key] = req.body[key] ? '1' : '0';
        continue;
      }

      if (setting.input_type === 'image') {
        if (req.file) {
          oldLogo = setting.setting_value || null;
          values[key] = req.file.filename;
        } else if (req.body[`${key}_remove`]) {
          oldLogo = setting.setting_value || null;
          values[key] = '';
        }
        // dosya seçilmediyse mevcut değere dokunulmaz
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        values[key] = String(req.body[key]).trim();
      }
    }

    const n = await settingModel.updateMany(values);
    if (oldLogo) removeUpload(oldLogo);

    setFlash(req, 'success', `${n} ayar güncellendi.`);
    return res.redirect('/admin/ayarlar');
  } catch (err) { next(err); }
});

module.exports = router;
