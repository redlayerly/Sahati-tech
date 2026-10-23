/* سَحاتِك — site behaviour (no dependencies) */
(function () {
  var root = document.documentElement;
  var T = {};
  try { T = JSON.parse(document.getElementById('sahatiT').textContent); } catch (e) {}

  /* ---- skins: ivory / dark / purple ---- */
  var KEY = 'sahati-skin';
  function effective() {
    var s = root.getAttribute('data-skin'); if (s) return s;
    var t = root.getAttribute('data-theme'); if (t) return t === 'dark' ? 'dark' : 'ivory';
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'ivory';
  }
  function markSkin() {
    var e = effective();
    document.querySelectorAll('.skins button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.skin === e ? 'true' : 'false'); });
  }
  var skins = document.querySelector('.skins');
  if (skins) skins.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    root.setAttribute('data-skin', b.dataset.skin);
    try { localStorage.setItem(KEY, b.dataset.skin); } catch (err) {}
    markSkin();
  });
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', markSkin); } catch (e) {}
  markSkin();

  /* ---- mobile drawer ---- */
  var mb = document.getElementById('menuBtn'), dr = document.getElementById('drawer');
  if (mb && dr) {
    var closeDrawer = function (refocus) { if (dr.hidden) return; dr.hidden = true; mb.setAttribute('aria-expanded', 'false'); if (refocus) mb.focus(); };
    mb.addEventListener('click', function () { var open = dr.hidden; dr.hidden = !open; mb.setAttribute('aria-expanded', open ? 'true' : 'false'); });
    dr.addEventListener('click', function (e) { if (e.target.closest('a')) closeDrawer(false); });
    /* disclosure pattern: Escape closes and returns focus to the toggle (no focus trap, the drawer is not modal) */
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dr.hidden) closeDrawer(dr.contains(document.activeElement) || document.activeElement === mb); });
  }

  /* ---- header fit: the CSS breakpoints suit the site's own fonts; if the links still don't fit (a fallback
     font, a larger text size, a machine-translated page) step down to the compact header, then to the menu
     button, rather than overflowing the screen ---- */
  var hw = document.querySelector('.hdr .wrap'), hn = hw && hw.querySelector('nav');
  if (hw && hn) {
    var hd = hw.parentNode;
    var over = function () { return hw.scrollWidth > hw.clientWidth + 1; };
    var fit = function () {
      hd.classList.remove('fit-1', 'fit-2');
      if (getComputedStyle(hn).display !== 'none' && over()) {
        hd.classList.add('fit-1');
        if (over()) { hd.classList.remove('fit-1'); hd.classList.add('fit-2'); }
      }
      /* the menu button went away while the drawer was open: close it so it doesn't reappear later by surprise */
      if (mb && dr && !dr.hidden && getComputedStyle(mb).display === 'none') { dr.hidden = true; mb.setAttribute('aria-expanded', 'false'); }
    };
    var queued = 0;
    var refit = function () { if (!queued) queued = requestAnimationFrame(function () { queued = 0; fit(); }); };
    fit();
    window.addEventListener('resize', refit);
    /* a page translated in the browser swaps the link texts without any resize */
    if (window.MutationObserver) new MutationObserver(refit).observe(hn, { childList: true, characterData: true, subtree: true });
    if (document.fonts) {
      if (document.fonts.ready) document.fonts.ready.then(refit);
      if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', refit);
    }
  }

  /* ---- home feed filter ---- */
  var pills = document.getElementById('pills'), feed = document.getElementById('feedList');
  if (pills && feed) {
    var cards = feed.querySelectorAll('.post'), shown = document.getElementById('shown'), empty = document.getElementById('feedEmpty');
    var apply = function (k) {
      var n = 0;
      cards.forEach(function (c) { var on = k === 'all' || c.dataset.kind === k; c.hidden = !on; if (on) n++; });
      if (shown) shown.textContent = n + ' / ' + cards.length;
      if (empty) empty.hidden = n > 0;
    };
    pills.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      pills.querySelectorAll('button').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      apply(b.dataset.k);
    });
    apply('all');
  }

  /* ---- newsletter (connect a provider later; see README) ---- */
  var nf = document.getElementById('nlForm');
  if (nf) nf.addEventListener('submit', function (e) {
    var action = nf.getAttribute('data-endpoint');
    var v = document.getElementById('nlEmail').value.trim(), m = document.getElementById('nlMsg');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { e.preventDefault(); m.textContent = T.nl_invalid || ''; return; }
    if (!action) { e.preventDefault(); m.textContent = T.nl_soon || ''; }
  });

  /* ---- article: reading progress + TOC highlight ---- */
  var prose = document.querySelector('.prose');
  var bar = document.querySelector('.progress span');
  if (prose && bar) {
    var tick = function () {
      var r = prose.getBoundingClientRect(), h = r.height - window.innerHeight * 0.6;
      var p = Math.min(1, Math.max(0, -r.top / (h > 0 ? h : 1)));
      bar.style.transform = 'scaleX(' + p + ')';
    };
    window.addEventListener('scroll', tick, { passive: true }); window.addEventListener('resize', tick); tick();
  }
  var tocLinks = document.querySelectorAll('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var map = {}; tocLinks.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { tocLinks.forEach(function (a) { a.classList.remove('on'); }); var a = map[en.target.id]; if (a) a.classList.add('on'); }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    document.querySelectorAll('.prose h2[id]').forEach(function (h) { io.observe(h); });
  }
  var toc = document.querySelector('.toc');
  if (toc && window.matchMedia && matchMedia('(min-width:1080px)').matches) toc.open = true;

  /* ---- copy link ---- */
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var url = btn.getAttribute('data-copy') || location.href, msg = btn.closest('.share').querySelector('.msg');
      var done = function (t) { if (msg) { msg.textContent = t; setTimeout(function () { msg.textContent = ''; }, 2000); } };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { done(T.copied || 'OK'); }, function () { done(url); });
      else done(url);
    });
  });
})();

/* close language menu when clicking outside */
document.addEventListener('click', function (e) {
  document.querySelectorAll('details.langs[open]').forEach(function (d) { if (!d.contains(e.target)) d.open = false; });
});
