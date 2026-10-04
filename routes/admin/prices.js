const express = require('express');
const router = express.Router();

const settingModel = require('../../models/setting');
const productModel = require('../../models/product');
const { setFlash } = require('../../middleware/locals');

const LAYOUT = 'layouts/admin';

/**
 * Fiyat Ayarları: sitedeki tüm fiyatları tek anahtarla açıp kapatır.
 *
 * Değer `settings.show_prices` içinde tutulur ('1' açık, '0' kapalı) ve
 * middleware/locals.js bunu her istekte `showPrices` olarak şablonlara verir.
 * Fiyat basan iki şablon (partials/product-card.ejs ve pages/product.ejs)
 * yalnızca bu bayrağa bakar, yani liste, kategori, tabaklar ve detay
 * sayfalarının hepsi aynı anahtardan etkilenir.
 */
async function render(res, { status = 200, value = null } = {}) {
  const settings = await settingModel.getMap();
  const showPrices = value === null ? settings.show_prices === '1' : value;

  // Fiyatı girilmemiş ürün sayısı: anahtar açılmadan önce uyarmak için.
  const products = await productModel.list();
  const missingPrice = products.filter((p) => p.price === null || p.price === '').length;

  return res.status(status).render('admin/prices', {
    title: 'Fiyat Ayarları',
    layout: LAYOUT,
    showPricesSetting: showPrices,
    productCount: products.length,
    missingPrice,
  });
}

router.get('/', async (req, res, next) => {
  try {
    await render(res);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    // İşaretsiz kutu hiç gönderilmez; bu yüzden her zaman açıkça yazılır.
    const enabled = req.body.show_prices ? '1' : '0';
    await settingModel.updateMany({ show_prices: enabled });

    setFlash(req, 'success', enabled === '1'
      ? 'Fiyatlar artık sitede görünüyor.'
      : 'Fiyatlar sitede gizlendi.');
    return res.redirect('/admin/fiyatlar');
  } catch (err) { next(err); }
});

module.exports = router;
