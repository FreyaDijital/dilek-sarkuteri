(function () {
  if (window.__dsSiteInit) return;
  window.__dsSiteInit = 1;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.style.opacity = '1';
        e.target.style.transform = 'none';
        e.target.style.clipPath = 'inset(0 0 0 0)';
        io.unobserve(e.target);
      }
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });

  function prep(el) {
    if (el.__p) return;
    el.__p = 1;
    if (reduce) return;
    var d = parseInt(el.getAttribute('data-reveal-delay') || '0', 10);
    var kind = el.getAttribute('data-reveal');
    el.style.transition = 'opacity .95s cubic-bezier(.22,.61,.36,1) ' + d + 'ms, transform 1.05s cubic-bezier(.22,.61,.36,1) ' + d + 'ms, clip-path 1.15s cubic-bezier(.22,.61,.36,1) ' + d + 'ms';
    el.style.opacity = '0';
    if (kind === 'wipe') { el.style.clipPath = 'inset(0 0 100% 0)'; el.style.opacity = '1'; }
    else if (kind === 'left') { el.style.transform = 'translateX(-26px)'; }
    else if (kind === 'scale') { el.style.transform = 'scale(.95)'; }
    else { el.style.transform = 'translateY(28px)'; }
    io.observe(el);
  }

  var parallax = [];
  var cio = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target; cio.unobserve(el);
      var target = parseFloat(el.getAttribute('data-count'));
      var suffix = el.getAttribute('data-count-suffix') || '';
      var t0 = performance.now();
      (function step(t) {
        var k = Math.min(1, (t - t0) / 1400);
        el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))) + suffix;
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    });
  }, { threshold: 0.4 });

  function scan() {
    document.querySelectorAll('[data-reveal]').forEach(prep);
    parallax = [].slice.call(document.querySelectorAll('[data-parallax]'));
    document.querySelectorAll('[data-count]').forEach(function (c) {
      if (c.__c) return; c.__c = 1; cio.observe(c);
    });
  }
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') scan(); else document.addEventListener('DOMContentLoaded', scan);

  var raf = null;
  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = null;
      var y = window.scrollY || 0;
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var bar = document.getElementById('ds-progress');
      if (bar) bar.style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + '%';

      var nav = document.getElementById('ds-nav');
      if (nav) {
        var overlay = nav.getAttribute('data-overlay') === '1';
        var solid = !overlay || y > 70;
        nav.style.background = solid ? 'rgba(247,242,232,.94)' : 'transparent';
        nav.style.borderBottomColor = solid ? 'rgba(23,18,15,.11)' : 'transparent';
        nav.style.backdropFilter = solid ? 'saturate(1.25) blur(14px)' : 'none';
        nav.style.webkitBackdropFilter = solid ? 'saturate(1.25) blur(14px)' : 'none';
        nav.style.paddingTop = solid ? '13px' : '22px';
        nav.style.paddingBottom = solid ? '13px' : '22px';
        var ink = solid ? '#17120F' : '#F7F2E8';
        var lk = nav.querySelectorAll('[data-navink]');
        for (var i = 0; i < lk.length; i++) {
          lk[i].style.color = lk[i].getAttribute('data-current') === '1' ? '#A3182B' : ink;
        }
        var mk = nav.querySelector('[data-navmark]');
        if (mk) {
          mk.style.background = solid ? '#A3182B' : 'rgba(247,242,232,.15)';
          mk.style.borderColor = solid ? '#A3182B' : 'rgba(247,242,232,.5)';
          mk.style.color = '#F7F2E8';
        }
      }

      if (reduce) return;
      for (var p = 0; p < parallax.length; p++) {
        var el = parallax[p];
        var r = el.getBoundingClientRect();
        var mid = r.top + r.height / 2 - window.innerHeight / 2;
        el.style.transform = 'translate3d(0,' + (-mid * parseFloat(el.getAttribute('data-parallax'))).toFixed(2) + 'px,0) scale(1.09)';
      }
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  setTimeout(onScroll, 50);
  setTimeout(onScroll, 500);
})();
