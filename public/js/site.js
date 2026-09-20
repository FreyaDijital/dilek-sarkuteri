// Dilek Şarküteri — site etkileşimleri: menü, okuma çubuğu, görünme animasyonları,
// paralaks ve sayaçlar. Kütüphane kullanmaz.
(function () {
  'use strict';

  window.dsReady = true; // layout'taki yedek: bu çalışmazsa gizlenen içerik geri açılır

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Menü: kaydırınca dolu zemin, mobilde aç/kapa ----
  const nav = document.querySelector('[data-nav]');
  const toggle = document.querySelector('[data-nav-toggle]');

  function setMenu(open) {
    if (!nav || !toggle) return;
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.sr-only').textContent = open ? 'Menüyü kapat' : 'Menüyü aç';
  }

  if (toggle) {
    toggle.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        setMenu(false);
        toggle.focus();
      }
    });
    document.addEventListener('click', (e) => {
      if (nav.classList.contains('is-open') && !nav.contains(e.target)) setMenu(false);
    });
  }

  // ---- Kaydırma: menü, okuma çubuğu, paralaks ----
  const bar = document.querySelector('[data-progress]');
  const parallax = reduceMotion ? [] : Array.from(document.querySelectorAll('[data-parallax]'));
  let ticking = false;

  function onScroll() {
    const y = window.scrollY;
    const vh = window.innerHeight;

    if (nav) nav.classList.toggle('is-scrolled', y > 24);

    if (bar) {
      const max = root.scrollHeight - vh;
      bar.style.width = (max > 0 ? Math.min(100, (y / max) * 100) : 0) + '%';
    }

    parallax.forEach((el) => {
      const rect = el.parentElement.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > vh) return;
      const shift = -rect.top * parseFloat(el.dataset.parallax || 0);
      el.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
    });

    ticking = false;
  }

  function requestTick() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(onScroll);
    }
  }

  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', requestTick);
  onScroll();

  // ---- Sayaçlar ----
  function runCounter(el) {
    const target = parseInt(el.dataset.count, 10);
    const suffix = el.dataset.countSuffix || '';
    if (Number.isNaN(target)) return;

    const duration = 1400;
    let start = null;
    function step(t) {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  // ---- Görünme animasyonları ----
  const revealEls = document.querySelectorAll('[data-reveal]');
  const counters = document.querySelectorAll('[data-count]');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('is-in'));
    return;
  }

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const delay = parseInt(el.dataset.revealDelay, 10) || 0;
      if (delay) {
        el.style.transitionDelay = delay + 'ms';
        // Gecikme sonraki hover geçişlerini yavaşlatmasın
        setTimeout(() => { el.style.transitionDelay = ''; }, delay + 1300);
      }
      el.classList.add('is-in');
      revealObserver.unobserve(el);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

  revealEls.forEach((el) => revealObserver.observe(el));

  const countObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      runCounter(entry.target);
      countObserver.unobserve(entry.target);
    });
  }, { threshold: 0.6 });

  counters.forEach((el) => countObserver.observe(el));
})();

// ---- Pop-up duyuru ----
// Ayrı bir IIFE: yukarıdaki blok "hareketi azalt" modunda erken return ediyor,
// duyurunun ondan etkilenmemesi gerekiyor.
(function () {
  'use strict';

  const popup = document.querySelector('[data-popup]');
  if (!popup) return;

  const STORE_KEY = 'ds-popup-seen';
  const version = popup.getAttribute('data-popup-version') || '';

  // Gizli sekme / çerez kapalı tarayıcıda localStorage erişimi hata atabilir;
  // bu durumda duyuru her ziyarette açılır, site çalışmaya devam eder.
  function seen() {
    try {
      return window.localStorage.getItem(STORE_KEY) === version;
    } catch (err) {
      return false;
    }
  }

  function remember() {
    try {
      window.localStorage.setItem(STORE_KEY, version);
    } catch (err) { /* yoksayılır */ }
  }

  if (seen()) return;

  let lastFocused = null;

  function close() {
    if (popup.hidden) return;
    popup.hidden = true;
    document.body.classList.remove('has-popup');
    remember();
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function open() {
    lastFocused = document.activeElement;
    popup.hidden = false;
    document.body.classList.add('has-popup');
    const first = popup.querySelector('.popup__close');
    if (first) first.focus();
  }

  popup.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-popup-close]');
    if (!trigger) return;
    // Buton bir bağlantıysa tıklama kendi işini yapsın; duyuru yine kapanır.
    close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // Sayfa yerleşene kadar kısa bir gecikme: içerik zıplamasın.
  window.setTimeout(open, 900);
})();
