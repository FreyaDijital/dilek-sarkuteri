const express = require('express');
const router = express.Router();

const { requireAuth } = require('../../middleware/auth');
const csrf = require('../../middleware/csrf');
const productModel = require('../../models/product');
const categoryModel = require('../../models/category');
const campaignModel = require('../../models/campaign');
const messageModel = require('../../models/message');

// CSRF token'ı giriş formunda da gerekli olduğu için en başta
router.use(csrf);

// Giriş / çıkış (oturum gerektirmez)
router.use('/', require('./auth'));

// Buradan sonrası korumalı
router.use(requireAuth);

// Kenar menüdeki okunmamış mesaj rozeti için
router.use(async (req, res, next) => {
  try {
    res.locals.unreadMessages = await messageModel.unreadCount();
    next();
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const [productCount, categories, campaignCount, unread, latestMessages] = await Promise.all([
      productModel.count(),
      categoryModel.all(),
      campaignModel.countActive(),
      messageModel.unreadCount(),
      messageModel.list({ limit: 5 }),
    ]);

    res.render('admin/dashboard', {
      title: 'Panel',
      layout: 'layouts/admin',
      stats: {
        products: productCount,
        categories: categories.length,
        activeCampaigns: campaignCount,
        unreadMessages: unread,
      },
      latestMessages,
    });
  } catch (err) {
    next(err);
  }
});

router.use('/urunler', require('./products'));
router.use('/kategoriler', require('./categories'));
router.use('/kampanyalar', require('./campaigns'));
router.use('/subeler', require('./branches'));
router.use('/duyuru', require('./popup'));
router.use('/ayarlar', require('./settings'));
router.use('/mesajlar', require('./messages'));

module.exports = router;
