const express = require('express');
const router = express.Router();

const messageModel = require('../../models/message');
const { setFlash } = require('../../middleware/locals');

const LAYOUT = 'layouts/admin';

router.get('/', async (req, res, next) => {
  try {
    const unreadOnly = req.query.filtre === 'okunmamis';
    res.render('admin/messages/index', {
      title: 'Mesajlar',
      layout: LAYOUT,
      messages: await messageModel.list({ unreadOnly }),
      unreadCount: await messageModel.unreadCount(),
      unreadOnly,
    });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const message = await messageModel.findById(req.params.id);
    if (!message) return next();

    // Görüntülenince okundu sayılır
    if (!message.is_read) await messageModel.markRead(message.id);

    res.render('admin/messages/show', {
      title: `Mesaj: ${message.name}`,
      layout: LAYOUT,
      message: { ...message, is_read: 1 },
    });
  } catch (err) { next(err); }
});

router.post('/:id/okunmadi', async (req, res, next) => {
  try {
    const message = await messageModel.findById(req.params.id);
    if (!message) return next();

    await messageModel.markRead(message.id, false);
    setFlash(req, 'success', 'Mesaj okunmadı olarak işaretlendi.');
    return res.redirect('/admin/mesajlar');
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const message = await messageModel.findById(req.params.id);
    if (!message) return next();

    await messageModel.remove(message.id);
    setFlash(req, 'success', `${message.name} adlı kişinin mesajı silindi.`);
    return res.redirect('/admin/mesajlar');
  } catch (err) { next(err); }
});

module.exports = router;
