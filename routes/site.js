const express = require('express');
const router = express.Router();

const productModel = require('../models/product');
const categoryModel = require('../models/category');
const campaignModel = require('../models/campaign');
const branchModel = require('../models/branch');
const messageModel = require('../models/message');
const csrf = require('../middleware/csrf');
const { setFlash } = require('../middleware/locals');
const { excerpt, siteImage, imageUrl } = require('../utils/helpers');

// Tabak/kutu ürünleri bu slug'daki kategoriden okunur (panelden açılabilir).
const PLATTER_CATEGORY = 'tabaklar';

// Ana sayfadaki kategori kartlarında görsel yüklenmemişse kullanılacak sabit görsel
const CATEGORY_DEFAULTS = {
  meze: { image: 'meze-tabagi.jpg' },
  peynir: { image: 'peynir-kutusu.jpg' },
  sarkuteri: { image: 'sarkuteri-tabagi.jpg' },
};

// Panelde öne çıkarılmış ürün yokken "Mutfağımızdan" şeridinde gösterilen tasarım içeriği
const KITCHEN_FALLBACK = [
  ['Patlıcan Salatası', 'patlican-salatasi.jpg'],
  ['Havuç Tarator', 'havuc-tarator.jpg'],
  ['Mücver', 'mucver.jpg'],
  ['Çiğ Köfte', 'cig-kofte.jpg'],
  ['Zeytinyağlı Yeşillik', 'yesillik-mezesi.jpg'],
  ['Salam Salatası', 'salam-salatasi.jpg'],
];

// ---- Ana sayfa ----
router.get('/', async (req, res, next) => {
  try {
    const [categories, featured, branches] = await Promise.all([
      categoryModel.all({ activeOnly: true }),
      productModel.list({ activeOnly: true, featured: true, limit: 10 }),
      branchModel.all({ activeOnly: true }),
    ]);

    const mainCategories = categories
      .filter((c) => c.slug !== PLATTER_CATEGORY)
      .map((c) => {
        const d = CATEGORY_DEFAULTS[c.slug] || {};
        return { ...c, imageSrc: imageUrl(c.image) || siteImage(d.image) };
      });

    const kitchen = featured.length
      ? featured.map((p) => ({
          name: p.name,
          href: `/urun/${p.slug}`,
          image: imageUrl(p.image) || siteImage(null),
          tag: p.category_name || '',
        }))
      : KITCHEN_FALLBACK.map(([name, image]) => ({ name, href: '/urunler/meze', image: siteImage(image), tag: 'Meze' }));

    res.render('pages/home', { title: null, categories: mainCategories, kitchen, branches });
  } catch (err) { next(err); }
});

// ---- Hakkımızda (sabit içerik) ----
router.get('/hakkimizda', (req, res) => {
  res.render('pages/about', { title: 'Hakkımızda' });
});

// ---- Ürünler: tüm ürünler + arama ----
router.get('/urunler', async (req, res, next) => {
  try {
    const search = String(req.query.ara || '').trim().slice(0, 100);
    const [categories, products] = await Promise.all([
      categoryModel.all({ activeOnly: true }),
      productModel.list({ activeOnly: true, search: search || undefined }),
    ]);

    res.render('pages/products', {
      title: search ? `"${search}" araması` : 'Ürünler',
      categories,
      category: null,
      products,
      search,
    });
  } catch (err) { next(err); }
});

// ---- Ürünler: kategori ----
router.get('/urunler/:kategori', async (req, res, next) => {
  try {
    const category = await categoryModel.findBySlug(req.params.kategori);
    if (!category || !category.is_active) return next(); // 404

    const [categories, products] = await Promise.all([
      categoryModel.all({ activeOnly: true }),
      productModel.list({ activeOnly: true, categoryId: category.id }),
    ]);

    res.render('pages/products', {
      title: category.name,
      description: category.description || undefined,
      categories,
      category,
      products,
      search: '',
    });
  } catch (err) { next(err); }
});

// ---- Ürün detayı ----
router.get('/urun/:slug', async (req, res, next) => {
  try {
    const product = await productModel.findBySlug(req.params.slug);
    if (!product || !product.is_active) return next();

    const related = product.category_id
      ? (await productModel.list({ activeOnly: true, categoryId: product.category_id, limit: 5 }))
          .filter((p) => p.id !== product.id)
          .slice(0, 4)
      : [];

    res.render('pages/product', {
      title: product.name,
      description: product.short_desc || excerpt(product.description, 160) || undefined,
      product,
      related,
    });
  } catch (err) { next(err); }
});

// ---- Tabaklar & kampanyalar ----
router.get('/tabaklar', async (req, res, next) => {
  try {
    const category = await categoryModel.findBySlug(PLATTER_CATEGORY);
    const [platters, campaigns] = await Promise.all([
      category && category.is_active
        ? productModel.list({ activeOnly: true, categoryId: category.id })
        : [],
      campaignModel.listActive(),
    ]);

    res.render('pages/platters', {
      title: 'Tabaklar & kampanyalar',
      description: 'Peynir tahtası, şarküteri tabağı, meze tabağı ve hediye peynir kutuları.',
      platters,
      campaigns,
    });
  } catch (err) { next(err); }
});

// Kampanyalar artık Tabaklar sayfasında listeleniyor; detay adresi aynı kaldı.
router.get('/kampanyalar', (req, res) => res.redirect(301, '/tabaklar#kampanyalar'));

router.get('/kampanyalar/:slug', async (req, res, next) => {
  try {
    // Yayından kalkmış veya süresi geçmiş kampanya 404 döner
    const campaign = await campaignModel.findActiveBySlug(req.params.slug);
    if (!campaign) return next();

    res.render('pages/campaign', {
      title: campaign.title,
      description: campaign.short_desc || excerpt(campaign.description, 160) || undefined,
      campaign,
    });
  } catch (err) { next(err); }
});

// ---- İletişim ----
// CSRF sadece bu rotada: tüm sitede kullanılsa her ziyaretçiye oturum açılırdı.

const MIN_SECONDS_BETWEEN_MESSAGES = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readContactForm(body) {
  const field = (name, max) => String(body[name] || '').trim().slice(0, max);
  return {
    name: field('name', 100),
    email: field('email', 150),
    phone: field('phone', 30),
    subject: field('subject', 150),
    body: field('body', 5000),
  };
}

function validateContact(data) {
  const errors = [];
  if (!data.name) errors.push('Adınızı yazın.');
  if (!data.body) errors.push('Mesajınızı yazın.');
  if (!data.email && !data.phone) errors.push('Size ulaşabilmemiz için telefon veya e-posta yazın.');
  if (data.email && !EMAIL_RE.test(data.email)) errors.push('E-posta adresi geçerli görünmüyor.');
  if (data.phone && data.phone.replace(/\D/g, '').length < 10) errors.push('Telefon numarası eksik görünüyor.');
  return errors;
}

function renderContact(res, extra = {}) {
  res.render('pages/contact', {
    title: 'İletişim',
    form: { name: '', email: '', phone: '', subject: '', body: '' },
    errors: [],
    ...extra,
  });
}

router.get('/iletisim', csrf, (req, res) => {
  renderContact(res);
});

router.post('/iletisim', csrf, async (req, res, next) => {
  try {
    // Bot tuzağı: gerçek kullanıcı bu gizli alanı görmez, doldurmaz.
    // Bota başarılı gibi görünsün diye aynı yönlendirme yapılır.
    if (req.body.website) {
      setFlash(req, 'success', 'Mesajınız alındı, en kısa sürede dönüş yapacağız.');
      return res.redirect('/iletisim');
    }

    const form = readContactForm(req.body);
    const errors = validateContact(form);

    const last = req.session.lastMessageAt || 0;
    if (!errors.length && Date.now() - last < MIN_SECONDS_BETWEEN_MESSAGES * 1000) {
      errors.push('Az önce bir mesaj gönderdiniz. Lütfen biraz bekleyip tekrar deneyin.');
    }

    if (errors.length) {
      res.status(400);
      return renderContact(res, { form, errors });
    }

    await messageModel.create({ ...form, ipAddress: req.ip });
    req.session.lastMessageAt = Date.now();

    setFlash(req, 'success', 'Mesajınız alındı, en kısa sürede dönüş yapacağız.');
    return res.redirect('/iletisim');
  } catch (err) { next(err); }
});

module.exports = router;
