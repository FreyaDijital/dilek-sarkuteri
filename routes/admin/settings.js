const express = require('express');
const router = express.Router();

const settingModel = require('../../models/setting');
const { uploadSingle } = require('../../middleware/upload');
const { removeUpload } = require('../../config/paths');
const { setFlash } = require('../../middleware/locals');
const csrf = require('../../middleware/csrf');
const { videoEmbed } = require('../../utils/helpers');

const LAYOUT = 'layouts/admin';

// Logo yüklendiği için form multipart; CSRF doğrulaması multer'dan SONRA.
const withLogo = [uploadSingle('logo_file'), csrf.verify];

const GROUP_LABELS = {
  genel: 'Genel',
  iletisim: 'İletişim Bilgileri',
  saatler: 'Çalışma Saatleri',
  sosyal: 'Sosyal Medya',
  subeler: 'Ana Sayfa · Şubeler',
  dukkanda: 'Ana Sayfa · Dükkânda Yiyin',
  organizasyon: 'Ana Sayfa · Organizasyonlar',
  video: 'Ana Sayfa · Tanıtım Videosu',
};

// Kendi panel sayfası olan gruplar: burada ikinci kez düzenlenmesinler.
// (Pop-up görseli dosya yüklemesi istiyor, bu form tek dosya alanı taşıyor.)
const OWN_PAGE_GROUPS = new Set(['popup']);

/**
 * Ayarlar formunu çizer. `submitted` verilirse (doğrulama hatasından sonra)
 * kullanıcının yazdığı değerler forma geri konur, girdisi kaybolmaz.
 */
async function renderSettings(res, { status = 200, errors = [], submitted = null } = {}) {
  const grouped = await settingModel.getGrouped();
  const groups = {};

  for (const [key, rows] of Object.entries(grouped)) {
    if (OWN_PAGE_GROUPS.has(key)) continue;
    groups[key] = submitted
      ? rows.map((r) => (Object.prototype.hasOwnProperty.call(submitted, r.setting_key)
        ? { ...r, setting_value: submitted[r.setting_key] }
        : r))
      : rows;
  }

  return res.status(status).render('admin/settings', {
    title: 'Ayarlar',
    layout: LAYOUT,
    groups,
    // Gruplar alfabetik değil, GROUP_LABELS'taki mantıklı sırayla çizilir;
    // etiketi tanımsız bir grup varsa listenin sonuna eklenir.
    groupOrder: [
      ...Object.keys(GROUP_LABELS).filter((k) => groups[k]),
      ...Object.keys(groups).filter((k) => !GROUP_LABELS[k]),
    ],
    groupLabels: GROUP_LABELS,
    errors,
  });
}

router.get('/', async (req, res, next) => {
  try {
    await renderSettings(res);
  } catch (err) { next(err); }
});

router.post('/', withLogo, async (req, res, next) => {
  try {
    const all = Object.values(await settingModel.getGrouped())
      .flat()
      .filter((s) => !OWN_PAGE_GROUPS.has(s.setting_group));
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

    // Tanıtım videosu: tanınmayan adres iframe'e basılmaz, bu yüzden
    // sessizce kaybolmasın diye kaydetmeden önce burada uyarılır.
    if (values.video_url && !videoEmbed(values.video_url)) {
      if (req.file) removeUpload(req.file.filename);
      return renderSettings(res, {
        status: 400,
        errors: ['Tanıtım videosu linki tanınmadı. Sadece YouTube ve Vimeo adresleri kullanılabilir.'],
        submitted: values,
      });
    }

    const n = await settingModel.updateMany(values);
    if (oldLogo) removeUpload(oldLogo);

    setFlash(req, 'success', `${n} ayar güncellendi.`);
    return res.redirect('/admin/ayarlar');
  } catch (err) { next(err); }
});

module.exports = router;
