const TR_MAP = { ç:'c', ğ:'g', ı:'i', İ:'i', ö:'o', ş:'s', ü:'u', Ç:'c', Ğ:'g', Ö:'o', Ş:'s', Ü:'u' };

function slugify(text) {
  return String(text || '')
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (ch) => TR_MAP[ch] || ch)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

/**
 * Aynı slug varsa sonuna -2, -3 ... ekler.
 * exists: async (slug) => boolean
 */
async function uniqueSlug(text, exists) {
  const base = slugify(text) || 'kayit';
  let slug = base;
  let n = 2;
  while (await exists(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

module.exports = { slugify, uniqueSlug };
