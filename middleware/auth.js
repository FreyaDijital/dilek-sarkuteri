/** Oturum yoksa giriş sayfasına yönlendirir; istenen adresi ?next ile taşır. */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  const next_ = encodeURIComponent(req.originalUrl || '/admin');
  return res.redirect(`/admin/giris?next=${next_}`);
}

/** Giriş yapmış kullanıcı giriş sayfasını görmesin. */
function redirectIfAuthed(req, res, next) {
  if (req.session && req.session.user) return res.redirect('/admin');
  return next();
}

module.exports = { requireAuth, redirectIfAuthed };
