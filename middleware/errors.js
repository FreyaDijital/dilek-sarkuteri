const multer = require('multer');

function notFound(req, res) {
  res.status(404);
  const isAdmin = req.path.startsWith('/admin');
  res.render('404', {
    title: 'Sayfa bulunamadı',
    layout: isAdmin ? 'layouts/admin' : 'layouts/site',
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Multer hataları kullanıcıya anlaşılır şekilde dönsün
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Dosya çok büyük.'
      : err.field || 'Dosya yüklenemedi.';
    if (req.session) req.session.flash = { type: 'error', message };
    return res.redirect(req.get('Referer') || '/admin');
  }

  const status = err.status || 500;
  if (status >= 500) console.error(err);

  res.status(status);
  const isAdmin = req.path.startsWith('/admin');
  res.render('500', {
    title: status >= 500 ? 'Bir hata oluştu' : 'İşlem tamamlanamadı',
    layout: isAdmin ? 'layouts/admin' : 'layouts/site',
    // 4xx kullanıcı hatasıdır, mesajı göstermek güvenli; 5xx detayı sadece geliştirmede
    message: status < 500 ? err.message : null,
    detail: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
}

module.exports = { notFound, errorHandler };
