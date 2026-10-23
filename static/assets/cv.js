/* سَحاتِك — CV builder.
   Everything runs in this browser tab: nothing is uploaded or sent anywhere (the site CSP also blocks
   connections to other origins). The draft is kept only in this browser's localStorage under KEY,
   until the visitor presses "Clear everything". The PDF is made by the browser's own print engine
   (perfect Arabic shaping, selectable text); the .docx is assembled here by hand (OOXML + a tiny zip). */
(function () {
  "use strict";
  var T = {};
  try { T = JSON.parse(document.getElementById('cvT').textContent); } catch (e) {}
  function t(k) { return T[k] || k; }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var root = document.documentElement;
  var UI = (root.getAttribute('lang') || 'ar').slice(0, 2) === 'ar' ? 'ar' : 'en';
  var KEY = 'sahati-cv';

  /* CV headings follow the language of the CV, not the language of the page */
  var H = {
    ar: { summary: 'نبذة مهنية', exp: 'الخبرات العملية', edu: 'التعليم', skills: 'المهارات', langs: 'اللغات',
          certs: 'الشهادات والدورات', contact: 'التواصل', present: 'حتى الآن',
          empty: 'اكتب اسمك في النموذج لتظهر سيرتك هنا.' },
    en: { summary: 'Profile', exp: 'Experience', edu: 'Education', skills: 'Skills', langs: 'Languages',
          certs: 'Certifications & Courses', contact: 'Contact', present: 'Present',
          empty: 'Type your name in the form to see your CV here.' }
  };
  var ACC = { bronze: '7A5C3F', charcoal: '26282B', teal: '2F6A6E', navy: '2F4B7C' };
  var TPLS = ['classic', 'modern', 'ats'];
  var FIELDS = ['name', 'title', 'email', 'phone', 'location', 'link1', 'link2', 'summary', 'skills'];
  var LISTS = {
    exp:   [['role', 'cv_f_role', 100], ['org', 'cv_f_org', 100], ['place', 'cv_f_place', 80], ['start', 'cv_f_start', 30], ['end', 'cv_f_end', 30], ['current', 'cv_f_current'], ['desc', 'cv_f_desc', 2000]],
    edu:   [['degree', 'cv_f_degree', 120], ['school', 'cv_f_school', 120], ['place', 'cv_f_place', 80], ['start', 'cv_f_start', 30], ['end', 'cv_f_end', 30], ['desc', 'cv_f_details', 800]],
    langs: [['name', 'cv_f_lang', 60], ['level', 'cv_f_level', 40]],
    certs: [['name', 'cv_f_cert', 140], ['issuer', 'cv_f_issuer', 100], ['year', 'cv_f_year', 12]]
  };
  var MAX_ITEMS = 12;

  function blank() {
    return { v: 1, tpl: 'classic', lang: UI, accent: 'bronze', photo: '', name: '', title: '', email: '', phone: '', location: '',
             link1: '', link2: '', summary: '', skills: '', exp: [], edu: [], langs: [], certs: [] };
  }
  function newItem(list) { var o = {}; LISTS[list].forEach(function (f) { o[f[0]] = f[0] === 'current' ? false : ''; }); return o; }

  /* anything read back from storage is untrusted: keep only known keys, plain strings, sane lengths */
  function str(v, n) { return typeof v === 'string' ? v.slice(0, n || 2000) : ''; }
  function clean(o) {
    var s = blank();
    if (!o || typeof o !== 'object') return s;
    if (TPLS.indexOf(o.tpl) >= 0) s.tpl = o.tpl;
    if (o.lang === 'ar' || o.lang === 'en') s.lang = o.lang;
    if (ACC.hasOwnProperty(o.accent)) s.accent = o.accent;
    FIELDS.forEach(function (k) { s[k] = str(o[k], k === 'summary' ? 1200 : k === 'skills' ? 1500 : 200); });
    if (typeof o.photo === 'string' && o.photo.length < 1500000 && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(o.photo)) s.photo = o.photo;
    Object.keys(LISTS).forEach(function (l) {
      if (!Array.isArray(o[l])) return;
      s[l] = o[l].slice(0, MAX_ITEMS).map(function (it) {
        var n = newItem(l);
        LISTS[l].forEach(function (f) { n[f[0]] = f[0] === 'current' ? !!(it && it.current) : str(it && it[f[0]], f[2]); });
        return n;
      });
    });
    return s;
  }

  var S = blank(), canSave = true, savedOnce = false;
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) { S = clean(JSON.parse(raw)); status(t('cv_restored')); }
  } catch (e) { canSave = false; }

  /* ---------------- status line ---------------- */
  var stT = 0;
  function status(msg) {
    var el = $('#cvStatus'); if (!el) return;
    el.textContent = msg; clearTimeout(stT);
    stT = setTimeout(function () { el.textContent = ''; }, 6000);
  }

  /* ---------------- saving (this browser only) ---------------- */
  var saveT = 0;
  function save() {
    if (!canSave) return;
    try { localStorage.setItem(KEY, JSON.stringify(S)); if (!savedOnce) { savedOnce = true; status(t('cv_saved')); } }
    catch (e) {
      if (S.photo) {
        try { var c = JSON.parse(JSON.stringify(S)); c.photo = ''; localStorage.setItem(KEY, JSON.stringify(c)); status(t('cv_quota')); return; } catch (e2) {}
      }
      canSave = false; status(t('cv_nosave'));
    }
  }
  var rq = 0;
  function changed() {
    if (!rq) rq = requestAnimationFrame(function () { rq = 0; render(); });
    clearTimeout(saveT); saveT = setTimeout(save, 450);
  }

  /* ---------------- form <-> state ---------------- */
  var form = $('#cvForm');
  function fillForm() {
    $$('[data-k]', form).forEach(function (i) { i.value = S[i.getAttribute('data-k')] || ''; });
    $$('input[name="tpl"]', form).forEach(function (r) { r.checked = r.value === S.tpl; });
    $$('input[name="accent"]', form).forEach(function (r) { r.checked = r.value === S.accent; });
    $('#cvLang').value = S.lang;
    $('#cvAtsHint').hidden = S.tpl !== 'ats';
    showPhoto();
    Object.keys(LISTS).forEach(renderList);
  }
  form.addEventListener('input', function (e) {
    var x = e.target, k = x.getAttribute('data-k');
    if (k) { S[k] = x.value; changed(); return; }
    var li = x.getAttribute('data-li');
    if (li) {
      var p = li.split('.'), it = S[p[0]] && S[p[0]][+p[1]]; if (!it) return;
      if (p[2] === 'current') { it.current = x.checked; var end = form.querySelector('[data-li="' + p[0] + '.' + p[1] + '.end"]'); if (end) end.disabled = x.checked; }
      else it[p[2]] = x.value;
      var hd = form.querySelector('[data-ih="' + p[0] + '.' + p[1] + '"]'); if (hd) hd.textContent = itemTitle(p[0], it, +p[1]);
      changed();
    }
  });
  form.addEventListener('change', function (e) {
    var x = e.target;
    if (x.name === 'tpl') { S.tpl = x.value; $('#cvAtsHint').hidden = S.tpl !== 'ats'; photoNote(); changed(); }
    else if (x.name === 'accent') { S.accent = x.value; changed(); }
    else if (x.id === 'cvLang') { S.lang = x.value === 'en' ? 'en' : 'ar'; changed(); }
    else if (x.getAttribute('data-li') && x.type === 'checkbox') { /* handled by input */ }
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); });

  /* ---------------- repeatable sections ---------------- */
  function itemTitle(list, it, i) {
    var v = list === 'exp' ? (it.role || it.org) : list === 'edu' ? (it.degree || it.school) : it.name;
    return (v && v.trim()) || (t('cv_item') + ' ' + (i + 1));
  }
  var ICON = {
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  function ibtn(act, label, svg, disabled) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'cvx-ibtn';
    b.setAttribute('data-act', act); b.setAttribute('aria-label', label); b.title = label;
    b.innerHTML = svg;  /* static icon markup, no user data */
    b.disabled = !!disabled; return b;
  }
  function renderList(list) {
    var box = form.querySelector('[data-list="' + list + '"]'); if (!box) return;
    box.textContent = '';
    S[list].forEach(function (it, i) {
      var w = document.createElement('div'); w.className = 'cvx-item'; w.setAttribute('data-item', list + '.' + i);
      var h = document.createElement('div'); h.className = 'cvx-item-h';
      var ttl = document.createElement('strong'); ttl.setAttribute('data-ih', list + '.' + i); ttl.textContent = itemTitle(list, it, i);
      h.appendChild(ttl);
      var nm = itemTitle(list, it, i);
      h.appendChild(ibtn('up', t('cv_up') + ': ' + nm, ICON.up, i === 0));
      h.appendChild(ibtn('down', t('cv_down') + ': ' + nm, ICON.down, i === S[list].length - 1));
      h.appendChild(ibtn('del', t('cv_remove') + ': ' + nm, ICON.del));
      w.appendChild(h);
      var g = document.createElement('div'); g.className = 'cvx-fields';
      LISTS[list].forEach(function (f) {
        var id = 'cv-' + list + '-' + i + '-' + f[0], key = list + '.' + i + '.' + f[0];
        if (f[0] === 'current') {
          var lb = document.createElement('label'); lb.className = 'cvx-check';
          var cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = id; cb.checked = !!it.current; cb.setAttribute('data-li', key);
          var sp = document.createElement('span'); sp.textContent = t(f[1]);
          lb.appendChild(cb); lb.appendChild(sp); g.appendChild(lb); return;
        }
        var l = document.createElement('label'); l.className = 'cvx-f' + (f[0] === 'desc' ? ' wide' : '');
        var s = document.createElement('span'); s.textContent = t(f[1]); l.appendChild(s);
        var inp = document.createElement(f[0] === 'desc' ? 'textarea' : 'input');
        if (f[0] === 'desc') inp.rows = 3; else inp.type = 'text';
        inp.id = id; inp.maxLength = f[2]; inp.value = it[f[0]] || ''; inp.setAttribute('data-li', key);
        if (f[0] === 'end' && it.current) inp.disabled = true;
        if (f[0] === 'start' || f[0] === 'end' || f[0] === 'year') inp.setAttribute('inputmode', 'text');
        l.appendChild(inp); g.appendChild(l);
      });
      w.appendChild(g); box.appendChild(w);
    });
    var add = form.querySelector('[data-add="' + list + '"]'); if (add) add.disabled = S[list].length >= MAX_ITEMS;
  }
  form.addEventListener('click', function (e) {
    var add = e.target.closest('[data-add]');
    if (add) {
      var l = add.getAttribute('data-add'); if (S[l].length >= MAX_ITEMS) return;
      S[l].push(newItem(l)); renderList(l); changed();
      var first = form.querySelector('[data-item="' + l + '.' + (S[l].length - 1) + '"] input, [data-item="' + l + '.' + (S[l].length - 1) + '"] textarea');
      if (first) first.focus();
      return;
    }
    var b = e.target.closest('[data-act]'); if (!b) return;
    var w = b.closest('[data-item]'), p = w.getAttribute('data-item').split('.'), list = p[0], i = +p[1], arr = S[list], act = b.getAttribute('data-act'), to = i;
    if (act === 'del') { arr.splice(i, 1); to = Math.min(i, arr.length - 1); }
    else if (act === 'up' && i > 0) { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); to = i - 1; }
    else if (act === 'down' && i < arr.length - 1) { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); to = i + 1; }
    renderList(list); changed();
    /* keep keyboard focus somewhere sensible after the list was rebuilt */
    var target = to >= 0 ? form.querySelector('[data-item="' + list + '.' + to + '"] [data-act="' + (act === 'del' ? 'del' : act) + '"]:not(:disabled)') ||
                 form.querySelector('[data-item="' + list + '.' + to + '"] input') : null;
    (target || form.querySelector('[data-add="' + list + '"]')).focus();
  });

  /* ---------------- photo: decoded and re-encoded locally (drops EXIF incl. GPS) ---------------- */
  function showPhoto() {
    var im = $('#cvPhotoPrev');
    if (S.photo) { im.src = S.photo; im.hidden = false; $('#cvPhotoDel').hidden = false; }
    else { im.removeAttribute('src'); im.hidden = true; $('#cvPhotoDel').hidden = true; }
    photoNote();
  }
  function photoError() { var e = $('#cvPhotoErr'); e.textContent = t('cv_photo_err'); e.hidden = false; $('#cvPhoto').value = ''; }
  /* the ATS template leaves the photo out on purpose: say so next to the photo, not only in the design box */
  function photoNote() { $('#cvPhotoAts').hidden = !(S.photo && S.tpl === 'ats'); }
  $('#cvPhoto').addEventListener('change', function () {
    var input = this, f = input.files && input.files[0];
    $('#cvPhotoErr').hidden = true;
    if (!f) return;
    /* the type is not trusted (Windows may report image/pjpeg, image/x-png or nothing at all):
       anything the browser can decode as an image is accepted, the rest fails in img.onerror */
    if ((f.type && !/^image\//.test(f.type)) || f.size > 15 * 1024 * 1024) { photoError(); input.value = ''; return; }
    var rd = new FileReader();
    rd.onerror = photoError;
    rd.onload = function () {
      var img = new Image();
      img.onerror = photoError;
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h), D = Math.min(480, side);
        if (!side) { photoError(); return; }
        var c = document.createElement('canvas'); c.width = c.height = D;
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, D, D);
        x.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, D, D);
        S.photo = c.toDataURL('image/jpeg', 0.86);
        input.value = '';            /* the original file is not kept anywhere */
        showPhoto(); changed();
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  });
  $('#cvPhotoDel').addEventListener('click', function () { S.photo = ''; showPhoto(); changed(); $('#cvPhoto').focus(); });

  /* ---------------- helpers for the CV ---------------- */
  /* English inside an Arabic CV (or Arabic inside an English one) is isolated so trailing signs stay put: "CompTIA Security+" */
  function foreign(text) { return S.lang === 'ar' ? /[A-Za-z]/.test(text) && !/^[\s\d\W]*[\u0600-\u06FF]/.test(text) : /[\u0600-\u06FF]/.test(text) && !/^[^\u0600-\u06FF]*[A-Za-z]/.test(text); }
  function el(tag, cls, text) {
    var e = document.createElement(tag); if (cls) e.className = cls;
    if (text != null && text !== '') {
      if (foreign(String(text))) { var i = document.createElement('bdi'); i.textContent = text; e.appendChild(i); } else e.textContent = text;
    }
    return e;
  }
  function lines(s) { return String(s || '').split(/\r?\n/).map(function (x) { return x.replace(/^\s*[-•*·▪]\s*/, '').trim(); }).filter(Boolean); }
  function skillList(s) { return String(s || '').split(/[,،؛;\n]+/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 40); }
  function range(a, b, cur, L) { a = (a || '').trim(); b = cur ? H[L].present : (b || '').trim(); return a && b ? a + ' – ' + b : (a || b); }
  function webHref(u) {
    u = (u || '').trim(); if (!u || /\s|["'<>]/.test(u)) return null;
    if (!/^https?:\/\//i.test(u)) { if (!/^[\w.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(u)) return null; u = 'https://' + u; }
    try { var x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : null; } catch (e) { return null; }
  }
  function mailHref(m) { m = (m || '').trim(); return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(m) ? 'mailto:' + m : null; }
  function telHref(p) { var d = (p || '').replace(/[^\d+]/g, ''); return d.length >= 6 ? 'tel:' + d : null; }
  function linkText(u) { return (u || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, ''); }
  function contactItems() {
    var out = [];
    if (S.location.trim()) out.push({ text: S.location.trim() });
    if (S.phone.trim()) out.push({ text: S.phone.trim(), href: telHref(S.phone), ltr: true });
    if (S.email.trim()) out.push({ text: S.email.trim(), href: mailHref(S.email), ltr: true });
    [S.link1, S.link2].forEach(function (l) { if (l && l.trim()) out.push({ text: linkText(l), href: webHref(l), ltr: true }); });
    return out;
  }
  function contactNode(c, tag) {
    var n;
    if (c.href) { n = el('a', null, c.text); n.href = c.href; if (/^https?:/.test(c.href)) { n.target = '_blank'; n.rel = 'noopener noreferrer'; } }
    else n = el('span', null, c.text);
    if (c.ltr) n.dir = 'ltr';
    if (tag) { var w = el(tag); w.appendChild(n); return w; }
    return n;
  }
  function section(key, L, body) { var s = el('section', 'cv-sec'); s.appendChild(el('h2', null, H[L][key])); s.appendChild(body); return s; }
  function itemNode(title, sub, dates, desc) {
    var d = el('div', 'cv-item'), h = el('div', 'cv-item-h');
    h.appendChild(el('b', null, title));
    if (dates) h.appendChild(el('span', 'cv-dates', dates));
    d.appendChild(h);
    if (sub) d.appendChild(el('div', 'cv-sub', sub));
    var ls = lines(desc);
    if (ls.length) { var ul = el('ul'); ls.forEach(function (x) { ul.appendChild(el('li', null, x)); }); d.appendChild(ul); }
    return d;
  }
  function joinNonEmpty(a, sep) { return a.map(function (x) { return (x || '').trim(); }).filter(Boolean).join(sep || ' · '); }
  function expNodes(L) {
    var f = document.createDocumentFragment();
    S.exp.forEach(function (x) {
      var title = (x.role || '').trim() || (x.org || '').trim(); if (!title && !x.desc.trim()) return;
      var sub = (x.role || '').trim() ? joinNonEmpty([x.org, x.place]) : joinNonEmpty([x.place]);
      f.appendChild(itemNode(title, sub, range(x.start, x.end, x.current, L), x.desc));
    });
    return f;
  }
  function eduNodes(L) {
    var f = document.createDocumentFragment();
    S.edu.forEach(function (x) {
      var title = (x.degree || '').trim() || (x.school || '').trim(); if (!title) return;
      var sub = (x.degree || '').trim() ? joinNonEmpty([x.school, x.place]) : joinNonEmpty([x.place]);
      f.appendChild(itemNode(title, sub, range(x.start, x.end, false, L), x.desc));
    });
    return f;
  }
  function certNodes() {
    var f = document.createDocumentFragment();
    S.certs.forEach(function (x) { if ((x.name || '').trim()) f.appendChild(itemNode(x.name.trim(), (x.issuer || '').trim(), (x.year || '').trim(), '')); });
    return f;
  }
  function skillsNode() { var ul = el('ul', 'cv-skills'); skillList(S.skills).forEach(function (s) { ul.appendChild(el('li', null, s)); }); return ul; }
  function langsNode(asList) {
    var ul = el('ul', asList ? null : 'cv-langs');
    S.langs.forEach(function (x) {
      if (!(x.name || '').trim()) return;
      var li = el('li'); li.appendChild(el('b', null, x.name.trim()));
      if ((x.level || '').trim()) li.appendChild(document.createTextNode(' — ' + x.level.trim()));
      ul.appendChild(li);
    });
    return ul;
  }
  function headNode(withPhoto, withContact) {
    var h = el('header', 'cv-head');
    if (withPhoto && S.photo) { var im = el('img', 'cv-photo'); im.src = S.photo; im.alt = ''; h.appendChild(im); }
    var id = el('div', 'cv-id');
    id.appendChild(el('h1', null, S.name.trim()));
    if (S.title.trim()) id.appendChild(el('p', 'cv-title', S.title.trim()));
    if (withContact) {
      var cs = contactItems();
      if (cs.length) {
        var c = el('div', 'cv-contact');
        cs.forEach(function (x, i) {
          if (S.tpl === 'ats' && i) c.appendChild(el('span', null, '|'));
          c.appendChild(contactNode(x));
        });
        id.appendChild(c);
      }
    }
    h.appendChild(id); return h;
  }
  function hasContent(nodeOrFrag) { return nodeOrFrag && nodeOrFrag.childNodes && nodeOrFrag.childNodes.length > 0; }

  /* ---------------- preview ---------------- */
  var paper = $('#cvPaper');
  function render() {
    var L = S.lang;
    paper.setAttribute('dir', L === 'ar' ? 'rtl' : 'ltr');
    paper.setAttribute('lang', L);
    paper.setAttribute('data-accent', S.accent);
    paper.textContent = '';
    if (!S.name.trim()) { paper.className = 'cv-paper cv-blank'; paper.appendChild(el('p', 'cv-empty', H[L].empty)); fit(); return; }
    paper.className = 'cv-paper cv-' + S.tpl;

    var summary = S.summary.trim() ? el('p', null, S.summary.trim()) : null;
    var exp = expNodes(L), edu = eduNodes(L), certs = certNodes(), skills = skillsNode(), langs = langsNode(S.tpl === 'modern');

    if (S.tpl === 'modern') {
      var aside = el('aside', 'cv-aside'), main = el('div', 'cv-main');
      if (S.photo) { var im = el('img', 'cv-photo'); im.src = S.photo; im.alt = ''; aside.appendChild(im); }
      var cs = contactItems();
      if (cs.length) { var ul = el('ul'); cs.forEach(function (x) { ul.appendChild(contactNode(x, 'li')); }); aside.appendChild(section('contact', L, ul)); }
      if (hasContent(skills)) aside.appendChild(section('skills', L, skills));
      if (hasContent(langs)) aside.appendChild(section('langs', L, langs));
      main.appendChild(headNode(false, false));
      if (summary) main.appendChild(section('summary', L, summary));
      if (hasContent(exp)) main.appendChild(section('exp', L, exp));
      if (hasContent(edu)) main.appendChild(section('edu', L, edu));
      if (hasContent(certs)) main.appendChild(section('certs', L, certs));
      paper.appendChild(aside); paper.appendChild(main);
    } else {
      paper.appendChild(headNode(S.tpl === 'classic', true));
      if (summary) paper.appendChild(section('summary', L, summary));
      if (hasContent(exp)) paper.appendChild(section('exp', L, exp));
      if (hasContent(edu)) paper.appendChild(section('edu', L, edu));
      if (hasContent(skills)) paper.appendChild(section('skills', L, skills));
      if (hasContent(langs)) paper.appendChild(section('langs', L, langs));
      if (hasContent(certs)) paper.appendChild(section('certs', L, certs));
    }
    fit();
  }

  /* scale the real-size A4 paper down to the preview column */
  var stage = $('#cvStage'), scaler = $('#cvScale');
  var fitBox = document.createElement('div'); fitBox.className = 'cvx-fit';
  stage.insertBefore(fitBox, scaler); fitBox.appendChild(scaler);
  function fit() {
    var avail = stage.clientWidth - parseFloat(getComputedStyle(stage).paddingLeft) - parseFloat(getComputedStyle(stage).paddingRight);
    var pw = paper.offsetWidth; if (!pw || avail <= 0) return;
    var s = Math.min(1, avail / pw);
    scaler.style.transform = 'scale(' + s.toFixed(4) + ')';
    fitBox.style.height = Math.ceil(paper.offsetHeight * s) + 'px';
  }
  if ('ResizeObserver' in window) new ResizeObserver(function () { fit(); }).observe(stage);
  window.addEventListener('resize', fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);

  /* ---------------- tabs (phones / tablets) ---------------- */
  var cvx = $('#cvx'), tabs = [$('#cvTabEdit'), $('#cvTabPrev')];
  function selectTab(i, focus) {
    tabs.forEach(function (b, j) { b.setAttribute('aria-selected', String(i === j)); b.tabIndex = i === j ? 0 : -1; });
    cvx.setAttribute('data-tab', i ? 'preview' : 'edit');
    if (focus) tabs[i].focus();
    if (i) fit();
  }
  tabs.forEach(function (b, i) {
    b.addEventListener('click', function () { selectTab(i); });
    b.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') { e.preventDefault(); selectTab(i ? 0 : 1, true); }
    });
  });
  selectTab(0);

  /* ---------------- two-step buttons (no blocking dialogs) ---------------- */
  function armed(btn, labelKey, run) {
    var timer = 0, label = btn.textContent;
    btn.addEventListener('click', function () {
      if (btn.getAttribute('data-armed') === '1' || !needsConfirm(btn)) {
        clearTimeout(timer); btn.removeAttribute('data-armed'); btn.classList.remove('arm'); btn.textContent = label; run(); return;
      }
      btn.setAttribute('data-armed', '1'); btn.classList.add('arm'); btn.textContent = t('cv_clear_confirm');
      timer = setTimeout(function () { btn.removeAttribute('data-armed'); btn.classList.remove('arm'); btn.textContent = label; }, 4000);
    });
  }
  function isEmpty() {
    return !S.photo && FIELDS.every(function (k) { return !S[k].trim(); }) && Object.keys(LISTS).every(function (l) { return !S[l].length; });
  }
  function needsConfirm(btn) { return btn.id === 'cvClear' || !isEmpty(); }

  armed($('#cvClear'), 'cv_clear', function () {
    var keep = { lang: S.lang, tpl: S.tpl, accent: S.accent };
    S = blank(); S.lang = keep.lang; S.tpl = keep.tpl; S.accent = keep.accent;
    try { localStorage.removeItem(KEY); } catch (e) {}
    savedOnce = false; $('#cvPhoto').value = ''; $('#cvPhotoErr').hidden = true;
    clearTimeout(saveT); fillForm(); render(); status(t('cv_cleared'));
  });

  var SAMPLE = {
    ar: { name: 'سارة محمود', title: 'محللة أمن معلومات', email: 'sara@example.com', phone: '+218 91 000 0000', location: 'بنغازي، ليبيا',
          link1: 'linkedin.com/in/example', link2: '',
          summary: 'محللة أمن معلومات بخبرة خمس سنوات في مراقبة التهديدات والاستجابة للحوادث وتوعية الموظفين. أركّز على بناء دفاعات عملية تناسب المؤسسات المتوسطة.',
          skills: 'الاستجابة للحوادث، تحليل السجلات، أمن الشبكات، Linux، Python، التوعية الأمنية',
          exp: [{ role: 'محللة أمن معلومات أولى', org: 'شركة نموذجية للاتصالات', place: 'طرابلس', start: '2022', end: '', current: true,
                  desc: 'قيادة الاستجابة لأكثر من 40 حادثة أمنية سنوياً\nتصميم برنامج توعية خفّض نقرات التصيّد بنسبة 60%\nأتمتة تقارير المراقبة اليومية' },
                { role: 'أخصائية دعم فني', org: 'مؤسسة تعليمية', place: 'بنغازي', start: '2019', end: '2022', current: false,
                  desc: 'إدارة حسابات أكثر من 300 مستخدم\nتفعيل المصادقة الثنائية على الأنظمة الداخلية' }],
          edu: [{ degree: 'بكالوريوس تقنية المعلومات', school: 'جامعة نموذجية', place: 'بنغازي', start: '2015', end: '2019', desc: 'مشروع التخرج: نظام لكشف رسائل التصيّد' }],
          langs: [{ name: 'العربية', level: 'اللغة الأم' }, { name: 'الإنجليزية', level: 'متقدم' }],
          certs: [{ name: 'CompTIA Security+', issuer: 'CompTIA', year: '2021' }] },
    en: { name: 'Sara Mahmoud', title: 'Information Security Analyst', email: 'sara@example.com', phone: '+218 91 000 0000', location: 'Benghazi, Libya',
          link1: 'linkedin.com/in/example', link2: '',
          summary: 'Information security analyst with five years of experience in threat monitoring, incident response and staff awareness. I focus on practical defences that fit mid-sized organisations.',
          skills: 'Incident response, Log analysis, Network security, Linux, Python, Security awareness',
          exp: [{ role: 'Senior Information Security Analyst', org: 'Example Telecom Co.', place: 'Tripoli', start: '2022', end: '', current: true,
                  desc: 'Led the response to 40+ security incidents a year\nDesigned an awareness programme that cut phishing clicks by 60%\nAutomated the daily monitoring reports' },
                { role: 'IT Support Specialist', org: 'Example Education Institute', place: 'Benghazi', start: '2019', end: '2022', current: false,
                  desc: 'Managed accounts for 300+ users\nRolled out two-factor authentication on internal systems' }],
          edu: [{ degree: 'BSc in Information Technology', school: 'Example University', place: 'Benghazi', start: '2015', end: '2019', desc: 'Graduation project: a phishing e-mail detector' }],
          langs: [{ name: 'Arabic', level: 'Native' }, { name: 'English', level: 'Advanced' }],
          certs: [{ name: 'CompTIA Security+', issuer: 'CompTIA', year: '2021' }] }
  };
  armed($('#cvSample'), 'cv_sample', function () {
    var keep = { lang: S.lang, tpl: S.tpl, accent: S.accent, photo: S.photo };
    S = clean(JSON.parse(JSON.stringify(SAMPLE[S.lang])));
    S.lang = keep.lang; S.tpl = keep.tpl; S.accent = keep.accent; S.photo = keep.photo;
    fillForm(); changed();
  });

  /* ---------------- PDF: the browser's own print engine ---------------- */
  function baseName() { var n = S.name.trim().replace(/[\\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); return n || 'CV'; }
  function needName() {
    if (S.name.trim()) return false;
    status(t('cv_need_name')); selectTab(0);
    var n = form.querySelector('[data-k="name"]'); if (n) n.focus();
    return true;
  }
  $('#cvPdf').addEventListener('click', function () {
    if (needName()) return;
    var old = document.title, done = false;
    function restore() { if (done) return; done = true; document.title = old; window.removeEventListener('afterprint', restore); }
    document.title = baseName() + ' - CV';      /* most browsers use the title as the PDF file name */
    window.addEventListener('afterprint', restore);
    window.print();
    setTimeout(restore, 3000);
  });

  /* ---------------- Word (.docx): OOXML written here, packed in a stored zip ---------------- */
  function xesc(s) {
    return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; });
  }
  function buildDocx() {
    var L = S.lang, rtl = L === 'ar', F = rtl ? 'Arial' : 'Calibri', acc = S.tpl === 'ats' ? '1F2124' : ACC[S.accent], X = [];
    function run(text, o) {
      o = o || {}; var sz = o.sz || 21;
      /* Latin-only runs (and phone/e-mail/links) stay left-to-right inside an Arabic paragraph */
      var rr = rtl && !o.ltr && !(/[A-Za-z]/.test(text) && !/[\u0600-\u06FF]/.test(text));
      /* phone numbers, e-mails, links and any Latin-only text (e.g. "CompTIA Security+") get an explicit LTR
         embedding, so their parts never reorder and they don't pull the neighbouring dates into their direction */
      if (rtl && (o.ltr || !rr) && text.trim() && !/[\u0600-\u06FF]/.test(text)) text = '\u202A' + text + '\u202C';
      return '<w:r><w:rPr><w:rFonts w:ascii="' + F + '" w:hAnsi="' + F + '" w:cs="' + F + '"/>' + (o.b ? '<w:b/><w:bCs/>' : '') +
        (o.color ? '<w:color w:val="' + o.color + '"/>' : '') + '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/>' +
        (rr ? '<w:rtl/><w:lang w:bidi="ar-LY"/>' : '') + '</w:rPr><w:t xml:space="preserve">' + xesc(text) + '</w:t></w:r>';
    }
    /* child order inside w:pPr follows the OOXML schema: keepNext, pBdr, bidi, spacing, jc */
    function para(runs, o) {
      o = o || {};
      return '<w:p><w:pPr>' + (o.keep ? '<w:keepNext/>' : '') +
        (o.border ? '<w:pBdr><w:bottom w:val="single" w:sz="' + (o.bsz || 6) + '" w:space="3" w:color="' + o.border + '"/></w:pBdr>' : '') +
        (rtl ? '<w:bidi/>' : '') + '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after == null ? 60 : o.after) + '"/>' +
        (o.jc ? '<w:jc w:val="' + o.jc + '"/>' : '') + '</w:pPr>' + runs + '</w:p>';
    }
    function heading(key) { X.push(para(run(H[L][key], { b: 1, color: acc, sz: 24 }), { before: 260, after: 100, border: 'D9D4CA', keep: 1 })); }
    function entry(title, sub, dates, desc) {
      X.push(para(run(title, { b: 1, sz: 22 }) + (dates ? run((rtl ? '\u200F   |   ' : '   |   ') + dates, { color: '55524D', sz: 19 }) : ''), { after: sub ? 0 : 40, keep: 1 }));
      if (sub) X.push(para(run(sub, { color: '55524D', sz: 20 }), { after: 40 }));
      /* the bullet is its own run, so a Latin-only line keeps its bullet at the start of an Arabic line */
      lines(desc).forEach(function (l) { X.push(para(run('•  ', { sz: 20 }) + run(l, { sz: 20 }), { after: 20 })); });
      X.push(para('', { after: 60 }));
    }
    var hasPhoto = !!S.photo && S.tpl !== 'ats', E = 1080000;   /* 3 cm in EMU */
    if (hasPhoto) {
      X.push('<w:p><w:pPr>' + (rtl ? '<w:bidi/>' : '') + '<w:spacing w:after="120"/></w:pPr><w:r><w:drawing>' +
        '<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + E + '" cy="' + E + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
        '<wp:docPr id="1" name="Photo"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
        '<pic:nvPicPr><pic:cNvPr id="0" name="photo.jpeg"/><pic:cNvPicPr/></pic:nvPicPr>' +
        '<pic:blipFill><a:blip r:embed="rIdPhoto"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + E + '" cy="' + E + '"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom></pic:spPr>' +
        '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>');
    }
    X.push(para(run(S.name.trim(), { b: 1, sz: 40 }), { after: 20 }));
    if (S.title.trim()) X.push(para(run(S.title.trim(), { b: 1, color: acc, sz: 25 }), { after: 60 }));
    var cs = contactItems();
    /* in Arabic the separators carry RIGHT-TO-LEFT MARKs so left-to-right items keep their order */
    var SEP = rtl ? '\u200F   |   \u200F' : '   |   ';
    X.push(para(cs.map(function (c, i) { return (i ? run(SEP, { color: '55524D', sz: 19 }) : '') + run(c.text, { color: '55524D', sz: 19, ltr: !!c.ltr }); }).join(''),
      { after: 120, border: acc, bsz: 12 }));
    if (S.summary.trim()) { heading('summary'); S.summary.trim().split(/\r?\n/).forEach(function (l) { if (l.trim()) X.push(para(run(l.trim(), { sz: 21 }), { after: 60 })); }); }
    var any = S.exp.some(function (x) { return (x.role || x.org || '').trim(); });
    if (any) { heading('exp'); S.exp.forEach(function (x) { var ttl = (x.role || '').trim() || (x.org || '').trim(); if (!ttl) return;
      entry(ttl, (x.role || '').trim() ? joinNonEmpty([x.org, x.place], '  ·  ') : joinNonEmpty([x.place]), range(x.start, x.end, x.current, L), x.desc); }); }
    any = S.edu.some(function (x) { return (x.degree || x.school || '').trim(); });
    if (any) { heading('edu'); S.edu.forEach(function (x) { var ttl = (x.degree || '').trim() || (x.school || '').trim(); if (!ttl) return;
      entry(ttl, (x.degree || '').trim() ? joinNonEmpty([x.school, x.place], '  ·  ') : joinNonEmpty([x.place]), range(x.start, x.end, false, L), x.desc); }); }
    var sk = skillList(S.skills);
    if (sk.length) { heading('skills'); X.push(para(run(sk.join(rtl ? '\u200F  ،  \u200F' : '  ·  '), { sz: 21 }), { after: 60 })); }
    var lg = S.langs.filter(function (x) { return (x.name || '').trim(); });
    if (lg.length) { heading('langs'); lg.forEach(function (x) { X.push(para(run(x.name.trim(), { b: 1, sz: 21 }) + ((x.level || '').trim() ? run(' — ' + x.level.trim(), { sz: 21 }) : ''), { after: 40 })); }); }
    var ce = S.certs.filter(function (x) { return (x.name || '').trim(); });
    if (ce.length) { heading('certs'); ce.forEach(function (x) { entry(x.name.trim(), (x.issuer || '').trim(), (x.year || '').trim(), ''); }); }

    var NS = ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
      ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
      ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document' + NS + '><w:body>' + X.join('') +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="0" w:footer="0" w:gutter="0"/>' +
      (rtl ? '<w:bidi/>' : '') + '</w:sectPr></w:body></w:document>';
    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    var drels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      (hasPhoto ? '<Relationship Id="rIdPhoto" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/photo.jpeg"/>' : '') + '</Relationships>';
    var enc = new TextEncoder(), files = [
      { name: '[Content_Types].xml', data: enc.encode(ct) },
      { name: '_rels/.rels', data: enc.encode(rels) },
      { name: 'word/document.xml', data: enc.encode(doc) },
      { name: 'word/_rels/document.xml.rels', data: enc.encode(drels) }
    ];
    if (hasPhoto) {
      var b64 = S.photo.split(',')[1], bin = atob(b64), u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      files.push({ name: 'word/media/photo.jpeg', data: u8 });
    }
    return zip(files, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }
  var CRC = (function () { var c, tb = new Uint32Array(256); for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; tb[n] = c >>> 0; } return tb; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files, type) {
    var enc = new TextEncoder(), parts = [], dir = [], off = 0, DATE = 0x21;  /* 1980-01-01, 00:00 */
    files.forEach(function (f) {
      var nm = enc.encode(f.name), d = f.data, c = crc32(d), lh = new DataView(new ArrayBuffer(30)), ch = new DataView(new ArrayBuffer(46));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, DATE, true); lh.setUint32(14, c, true); lh.setUint32(18, d.length, true);
      lh.setUint32(22, d.length, true); lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nm, d);
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, DATE, true); ch.setUint32(16, c, true);
      ch.setUint32(20, d.length, true); ch.setUint32(24, d.length, true); ch.setUint16(28, nm.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true); ch.setUint32(42, off, true);
      dir.push(new Uint8Array(ch.buffer), nm);
      off += 30 + nm.length + d.length;
    });
    var size = dir.reduce(function (a, b) { return a + b.length; }, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true);
    end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, size, true); end.setUint32(16, off, true); end.setUint16(20, 0, true);
    return new Blob(parts.concat(dir, [new Uint8Array(end.buffer)]), { type: type });
  }
  function download(blob, name) {
    var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 5000);
  }
  $('#cvDocx').addEventListener('click', function () {
    if (needName()) return;
    download(buildDocx(), baseName() + ' - CV.docx');
    status(t('cv_docx_done'));
  });

  fillForm();
  render();
  if (!canSave) status(t('cv_nosave'));
})();
