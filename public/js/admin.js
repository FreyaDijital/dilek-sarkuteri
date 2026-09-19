// Panel için küçük yardımcılar. JavaScript kapalıyken form yine çalışır;
// buradaki her şey sadece önizleme kolaylığı sağlar.
(function () {
  'use strict';

  /** data-preview-for="ad" olan dosya inputları, data-preview-target="ad" öğesini günceller. */
  function bindFilePreview(input) {
    const name = input.getAttribute('data-preview-for');
    const target = document.querySelector('[data-preview-target="' + name + '"]');
    if (!target) return;

    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      if (!file) return;
      showPreview(target, URL.createObjectURL(file), file.name);

      // Yeni dosya seçilince galeri seçimi ve "kaldır" işareti anlamsız kalır
      const form = input.form;
      if (!form) return;
      const gallery = form.querySelector('[data-gallery-for="' + name + '"]');
      if (gallery) gallery.value = '';
      const remove = form.querySelector('[data-remove-for="' + name + '"]');
      if (remove) remove.checked = false;
    });
  }

  /** public/img listesinden seçim yapılınca önizlemeyi değiştirir. */
  function bindGalleryPreview(select) {
    const name = select.getAttribute('data-gallery-for');
    const target = document.querySelector('[data-preview-target="' + name + '"]');

    select.addEventListener('change', function () {
      const option = select.options[select.selectedIndex];
      const url = option ? option.getAttribute('data-src') : null;
      if (target && url) showPreview(target, url, option.textContent);

      // Galeriden seçim, bekleyen dosya yüklemesinin yerini alır
      const form = select.form;
      if (!form) return;
      const file = form.querySelector('[data-preview-for="' + name + '"]');
      if (file && select.value) file.value = '';
      const remove = form.querySelector('[data-remove-for="' + name + '"]');
      if (remove && select.value) remove.checked = false;
    });
  }

  /** Boş kutu (span) ise <img> ile değiştirir, zaten img ise src'sini günceller. */
  function showPreview(target, url, alt) {
    if (target.tagName === 'IMG') {
      target.src = url;
      target.alt = alt || '';
      return;
    }
    const img = document.createElement('img');
    img.className = 'image-field__preview';
    img.src = url;
    img.alt = alt || '';
    img.setAttribute('data-preview-target', target.getAttribute('data-preview-target'));
    target.replaceWith(img);
  }

  document.querySelectorAll('[data-preview-for]').forEach(bindFilePreview);
  document.querySelectorAll('[data-gallery-for]').forEach(bindGalleryPreview);
})();
