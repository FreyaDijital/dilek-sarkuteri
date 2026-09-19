const express = require('express');
const router = express.Router();

const userModel = require('../../models/user');
const { redirectIfAuthed } = require('../../middleware/auth');

const LAYOUT = 'layouts/admin-blank';

router.get('/giris', redirectIfAuthed, (req, res) => {
  res.render('admin/login', {
    title: 'Yönetim Girişi',
    layout: LAYOUT,
    error: null,
    username: '',
    next: req.query.next || '',
  });
});

router.post('/giris', redirectIfAuthed, async (req, res, next) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const nextUrl = String(req.body.next || '');

  const fail = (message) =>
    res.status(401).render('admin/login', {
      title: 'Yönetim Girişi',
      layout: LAYOUT,
      error: message,
      username,
      next: nextUrl,
    });

  try {
    if (!username || !password) return fail('Kullanıcı adı ve şifre gerekli.');

    const user = await userModel.findByUsername(username);
    const ok = await userModel.verifyPassword(user, password);

    // Kullanıcı yok / şifre yanlış / hesap pasif → aynı mesaj (bilgi sızdırmamak için)
    if (!user || !ok || !user.is_active) return fail('Kullanıcı adı veya şifre hatalı.');

    // Oturum sabitleme (session fixation) saldırısına karşı oturumu yenile
    req.session.regenerate(async (err) => {
      if (err) return next(err);

      req.session.user = {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
      };

      try {
        await userModel.touchLogin(user.id);
      } catch (_) { /* giriş kaydı başarısız olsa da devam */ }

      // Sadece site içi göreli adrese dön (açık yönlendirme açığını kapatır)
      const safeNext = /^\/admin(\/|$)/.test(nextUrl) ? nextUrl : '/admin';
      req.session.save(() => res.redirect(safeNext));
    });
  } catch (err) {
    next(err);
  }
});

router.post('/cikis', (req, res) => {
  if (!req.session) return res.redirect('/admin/giris');
  req.session.destroy(() => {
    res.clearCookie('dilek.sid');
    res.redirect('/admin/giris');
  });
});

module.exports = router;
