#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
سَحاتِك — مولّد الموقع متعدد اللغات (بدون أي مكتبات خارجية)

الأوامر:
  python build.py                 يبني الموقع كاملاً بكل اللغات في مجلد public/
  python build.py new my-slug     ينشئ ملف منشور عربي جديد + ملفات ترجمة فارغة لكل لغة
  python build.py status          يعرض المنشورات التي تنقصها ترجمة
  python build.py serve           يبني الموقع ويشغّله على http://localhost:8000 للمعاينة
"""
import html, json, os, re, shutil, sys, datetime, hashlib
from urllib.parse import quote

if sys.platform == 'win32':
    try:
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8')
        if hasattr(sys.stderr, 'reconfigure'):
            sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

ROOT = os.path.dirname(os.path.abspath(__file__))
P = lambda *a: os.path.join(ROOT, *a)
SITE = json.load(open(P('site.json'), encoding='utf-8'))
BASE_URL = SITE['url'].rstrip('/')
CAT_EN = {k: v['en'] for k, v in SITE['categories'].items()}
STR = json.load(open(P('content', 'i18n', 'strings.json'), encoding='utf-8'))
LANGS = list(STR.keys())            # الأولى هي اللغة الأساسية (العربية)
DEFAULT = LANGS[0]
KINDS = ('article', 'head', 'tip', 'quote')
MARK = '<svg viewBox="-60 -60 532 508" aria-hidden="true"><use href="#s-mark"/></svg>'

MONTHS = {
    'ar': ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
    'en': ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    'tr': ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
    'ru': ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    'es': ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    'fil': ['Enero', 'Pebrero', 'Marso', 'Abril', 'Mayo', 'Hunyo', 'Hulyo', 'Agosto', 'Setyembre', 'Oktubre', 'Nobyembre', 'Disyembre'],
}
def fmt_date(d, lang):
    if lang == 'zh': return '%d年%d月%d日' % (d.year, d.month, d.day)
    m = MONTHS.get(lang, MONTHS['en'])[d.month - 1]
    if lang == 'es': return '%d de %s de %d' % (d.day, m, d.year)
    if lang == 'ru': return '%d %s %d г.' % (d.day, m, d.year)
    if lang in ('en', 'fil'): return '%s %d, %d' % (m, d.day, d.year) if lang == 'fil' else '%d %s %d' % (d.day, m, d.year)
    return '%d %s %d' % (d.day, m, d.year)

def reading_time(text, lang):
    clean = re.sub(r'```.*?```', '', text, flags=re.S)
    if lang == 'zh':
        n = max(1, round(len(re.findall(r'[一-鿿]', clean)) / 350))
    else:
        rate = {'ar': 150, 'ru': 170}.get(lang, 200)
        n = max(1, round(len(re.findall(r'\S+', clean)) / rate))
    if lang == 'ar':
        label = 'دقيقة قراءة' if n == 1 else 'دقيقتان قراءة' if n == 2 else ('%d دقائق قراءة' % n if n <= 10 else '%d دقيقة قراءة' % n)
    else:
        label = {'en': '%d min read', 'tr': '%d dk okuma', 'ru': '%d мин чтения', 'es': '%d min de lectura',
                 'fil': '%d minutong basa', 'zh': '阅读约 %d 分钟'}.get(lang, '%d min') % n
    return n, label

def esc(s): return html.escape(str(s), quote=True)
def js_json(o):
    """JSON safe to embed inside <script> (no </script> breakout, no HTML comment tricks)."""
    return json.dumps(o, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
def safe_url(u):
    """Only allow http(s), mailto, site-relative and #anchor links. Blocks javascript:, data:, vbscript: ..."""
    v = html.unescape(u).strip()
    if re.match(r'^[/\\]{2}', v): return '#'   # protocol-relative: //x, \\x, /\x, \/x
    if re.match(r'^(https?://|mailto:|/(?!/)|#|\./|\.\./)', v, re.I) or not re.match(r'^[^/?#]*:', v): return u
    return '#'
def read(path): return open(path, encoding='utf-8').read()
def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8', newline='\n').write(text)
def fill(tpl, S=None, **kw):
    if S is not None:
        tpl = re.sub(r'\{\{s:(\w+)\}\}', lambda m: esc(S[m.group(1)]) if m.group(1) != 'fonts' else S['fonts'], tpl)
    for k, v in kw.items(): tpl = tpl.replace('{{%s}}' % k, str(v))
    left = re.findall(r'\{\{(s:)?(\w+)\}\}', tpl)
    if left: raise SystemExit('قالب ناقص، لم تُعبّأ الحقول: %s' % ', '.join(sorted(set(''.join(x) for x in left))))
    return tpl

# ------------------------------------------------------------------ front matter
def front(path):
    raw = read(path).replace('\r\n', '\n').lstrip('﻿')
    m = re.match(r'^---\n(.*?)\n---\n?(.*)$', raw, re.S)
    if not m: raise SystemExit('الملف %s لا يبدأ بترويسة --- صحيحة' % path)
    meta, key = {}, None
    for line in m.group(1).split('\n'):
        if not line.strip() or line.strip().startswith('#'): continue
        if re.match(r'^\s+-\s+', line) and key:
            if not isinstance(meta.get(key), list): meta[key] = []
            meta[key].append(re.sub(r'^\s+-\s+', '', line).strip()); continue
        k, _, v = line.partition(':')
        key = k.strip(); v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'': v = v[1:-1]
        meta[key] = v if v else []
    meta['body_md'] = m.group(2)
    return meta

def parse_post(path):
    meta = front(path)
    meta['file'] = os.path.basename(path)
    for req in ('title', 'date', 'kind', 'category'):
        if not meta.get(req): raise SystemExit('الملف %s ينقصه الحقل: %s' % (path, req))
    if meta['kind'] not in KINDS: raise SystemExit('%s: نوع غير معروف "%s" (المسموح: %s)' % (path, meta['kind'], ', '.join(KINDS)))
    if meta['category'] not in CAT_EN: raise SystemExit('%s: تصنيف غير معروف "%s" (المسموح: %s)' % (path, meta['category'], ', '.join(CAT_EN)))
    meta['date'] = datetime.date.fromisoformat(meta['date'])
    meta['draft'] = str(meta.get('draft', 'false')).lower() in ('true', 'yes', '1', 'نعم')
    meta['slug'] = meta.get('slug') or os.path.splitext(meta['file'])[0]
    if not re.match(r'^[a-z0-9-]+$', meta['slug']): raise SystemExit('%s: الـ slug يجب أن يكون حروفاً إنجليزية صغيرة وأرقاماً وشرطات فقط' % path)
    return meta

def translation(base, lang):
    """يرجع نسخة المنشور بلغة معينة، أو None إذا لا توجد ترجمة."""
    if lang == DEFAULT: return dict(base, lang=lang)
    path = P('content', 'i18n', lang, 'posts', base['file'])
    if not os.path.exists(path): return None
    t = front(path)
    if str(t.get('draft', 'false')).lower() in ('true', 'yes', '1'): return None
    p = dict(base, lang=lang)
    for k in ('title', 'excerpt', 'steps', 'quote', 'glyph'):
        if t.get(k): p[k] = t[k]
    p['body_md'] = t['body_md'] if t['body_md'].strip() else ''
    if p['kind'] in ('article', 'head') and not p['body_md'].strip():
        return None
    return p

# ------------------------------------------------------------------ markdown (subset)
def inline(t):
    t = esc(t)
    codes = []
    t = re.sub(r'`([^`]+)`', lambda m: codes.append(m.group(1)) or '\x00%d\x00' % (len(codes) - 1), t)
    t = re.sub(r'!\[([^\]]*)\]\(([^)\s]+)\)', lambda m: '<img src="%s" alt="%s" loading="lazy">' % (safe_url(m.group(2)), m.group(1)), t)
    def link(m):
        href = safe_url(m.group(2)); ext = href.startswith('http')
        return '<a href="%s"%s>%s</a>' % (href, ' target="_blank" rel="noopener noreferrer"' if ext else '', m.group(1))
    t = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', link, t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<em>\1</em>', t)
    t = re.sub(r'\[\[(.+?)\]\]', r'<kbd>\1</kbd>', t)
    t = re.sub(r'\x00(\d+)\x00', lambda m: '<code>%s</code>' % codes[int(m.group(1))], t)
    return t

def md(text, S, toc=None):
    titles = {'tip': S['c_tip'], 'warning': S['c_warning'], 'note': S['c_note'], 'action': S['c_action']}
    lines = text.replace('\r\n', '\n').split('\n')
    out, i, para = [], 0, []
    def flush():
        if para: out.append('<p>%s</p>' % inline(' '.join(s.strip() for s in para))); para.clear()
    while i < len(lines):
        ln = lines[i]; s = ln.strip()
        if not s: flush(); i += 1; continue
        if s.startswith('```'):
            flush(); lang = s[3:].strip(); buf = []; i += 1
            while i < len(lines) and not lines[i].strip().startswith('```'): buf.append(lines[i]); i += 1
            out.append('<pre><code%s>%s</code></pre>' % (' data-lang="%s"' % esc(lang) if lang else '', esc('\n'.join(buf)))); i += 1; continue
        m = re.match(r'^:::\s*(tip|warning|note|action)\s*(.*)$', s)
        if m:
            flush(); kind, title = m.group(1), m.group(2).strip() or titles[m.group(1)]; buf = []; i += 1; depth = 0
            while i < len(lines):
                t = lines[i].strip()
                if re.match(r'^:::\s*\w', t): depth += 1
                elif t == ':::':
                    if depth == 0: break
                    depth -= 1
                buf.append(lines[i]); i += 1
            out.append('<div class="callout %s"><div class="ch">%s<span>%s</span></div>%s</div>' % (kind, MARK if kind in ('tip', 'action') else '', inline(title), md('\n'.join(buf), S)))
            i += 1; continue
        m = re.match(r'^(#{1,4})\s+(.*)$', s)
        if m:
            flush(); level = max(2, len(m.group(1))); text_ = m.group(2).strip()
            if level == 2 and toc is not None:
                hid = 's%d' % (len(toc) + 1); toc.append((hid, text_))
                out.append('<h2 id="%s">%s</h2>' % (hid, inline(text_)))
            else: out.append('<h%d>%s</h%d>' % (min(level, 4), inline(text_), min(level, 4)))
            i += 1; continue
        if re.match(r'^(-{3,}|\*{3,})$', s): flush(); out.append('<hr>'); i += 1; continue
        if s.startswith('>'):
            flush(); buf = []
            while i < len(lines) and lines[i].strip().startswith('>'): buf.append(lines[i].strip()[1:].strip()); i += 1
            out.append('<blockquote><p>%s</p></blockquote>' % inline(' '.join(buf))); continue
        if s.startswith('|') and i + 1 < len(lines) and re.match(r'^\|?\s*:?-{2,}', lines[i + 1].strip()):
            flush(); rows = []
            while i < len(lines) and lines[i].strip().startswith('|'): rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')]); i += 1
            head, body = rows[0], rows[2:]
            out.append('<div class="table-wrap"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (
                ''.join('<th>%s</th>' % inline(c) for c in head),
                ''.join('<tr>%s</tr>' % ''.join('<td>%s</td>' % inline(c) for c in r) for r in body))); continue
        if re.match(r'^[-*]\s+', s) or re.match(r'^\d+[.)]\s+', s):
            flush(); ordered = bool(re.match(r'^\d', s)); items = []
            pat = r'^\d+[.)]\s+' if ordered else r'^[-*]\s+'
            while i < len(lines) and re.match(pat, lines[i].strip()):
                items.append(re.sub(pat, '', lines[i].strip())); i += 1
                while i < len(lines) and lines[i].startswith('  ') and lines[i].strip() and not re.match(pat, lines[i].strip()):
                    items[-1] += ' ' + lines[i].strip(); i += 1
            tag = 'ol' if ordered else 'ul'
            out.append('<%s>%s</%s>' % (tag, ''.join('<li>%s</li>' % inline(x) for x in items), tag)); continue
        m = re.match(r'^!\[([^\]]*)\]\(([^)\s]+)\)$', s)
        if m:
            flush(); out.append('<figure><img src="%s" alt="%s" loading="lazy">%s</figure>' % (esc(safe_url(m.group(2))), esc(m.group(1)), '<figcaption>%s</figcaption>' % inline(m.group(1)) if m.group(1) else '')); i += 1; continue
        para.append(ln); i += 1
    flush()
    return '\n'.join(out)

# ------------------------------------------------------------------ cards
def cover_html(p):
    v = p.get('cover') or 'a'
    if v not in ('a', 'b', 'c'): v = 'a'
    return '<div class="cover %s"><span class="frame"></span><span class="gl">%s</span>%s<span class="cc">%s</span></div>' % (
        v, esc(p.get('glyph', '')), MARK, esc(CAT_EN[p['category']]))

def card(p, S):
    cat = S['cats'][p['category']]; k = p['kind']
    if k == 'article':
        return ('<a class="post f-article" data-kind="article" href="%s">%s<div class="in"><div class="k"><span>%s</span><span class="rt">%d min</span></div>'
                '<h3>%s</h3><p>%s</p></div></a>') % (p['url'], cover_html(p), esc(cat), p['minutes'], esc(p['title']), esc(p.get('excerpt', '')))
    if k == 'head':
        return ('<a class="post f-head" data-kind="head" href="%s"><div class="in"><div class="k"><span>%s · %s</span><span class="rt">%d min</span></div>'
                '<h3>%s</h3><p>%s</p><span class="more">%s</span></div></a>') % (p['url'], esc(S['head_prefix']), esc(cat), p['minutes'], esc(p['title']), esc(p.get('excerpt', '')), esc(S['read_more']))
    if k == 'tip':
        steps = p.get('steps') or []
        return ('<article class="post f-tip" data-kind="tip"><div class="in"><span class="chip">%s</span><h3>%s</h3><ol>%s</ol>'
                '<div class="ft"><span>sahati-tech.com.ly</span>%s</div></div></article>') % (esc(S['tip_chip']), esc(p['title']), ''.join('<li>%s</li>' % inline(s) for s in steps), MARK)
    return ('<article class="post f-quote" data-kind="quote"><div class="in"><span class="qm" aria-hidden="true">%s</span><blockquote>%s</blockquote>'
            '<div class="k"><span>%s · %s</span><span>%s</span></div></div></article>') % (esc(S['qm']), esc(p.get('quote') or p['title']), esc(S['quote_prefix']), esc(cat), esc(S['site_name']))

ICONS = {
    'fb': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21h3.1z"/></svg>',
    'wa': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>',
    'x': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.8 3h3.1l-6.8 7.7 8 10.3h-6.2l-4.9-6.3L5.4 21H2.3l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z"/></svg>',
    'tg': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.4 4.2 2.9 11.3c-1.3.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.5c.3-1.3-.5-1.8-1.4-1.1zM8.9 14l9.3-5.9c.4-.3.8-.1.5.2l-7.6 6.9-.3 3.3L8.9 14z"/></svg>',
    'cp': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>'}

def share_buttons(url, title, S):
    u, t = quote(url, safe=''), quote(title, safe='')
    return ''.join([
        '<a href="https://www.facebook.com/sharer/sharer.php?u=%s" target="_blank" rel="noopener" aria-label="%s">%s</a>' % (u, esc(S['share_fb']), ICONS['fb']),
        '<a href="https://wa.me/?text=%s%%20%s" target="_blank" rel="noopener" aria-label="%s">%s</a>' % (t, u, esc(S['share_wa']), ICONS['wa']),
        '<a href="https://t.me/share/url?url=%s&amp;text=%s" target="_blank" rel="noopener" aria-label="%s">%s</a>' % (u, t, esc(S['share_tg']), ICONS['tg']),
        '<a href="https://twitter.com/intent/tweet?url=%s&amp;text=%s" target="_blank" rel="noopener" aria-label="%s">%s</a>' % (u, t, esc(S['share_x']), ICONS['x']),
        '<button type="button" data-copy="%s" aria-label="%s">%s</button>' % (esc(url), esc(S['share_copy']), ICONS['cp'])])

def glossary_html(lang):
    path = P('content', 'glossary.txt') if lang == DEFAULT else P('content', 'i18n', lang, 'glossary.txt')
    if not os.path.exists(path): path = P('content', 'glossary.txt')
    out = []
    for line in read(path).splitlines():
        if line.strip() and not line.strip().startswith('#'):
            parts = [x.strip() for x in line.split('|', 2)]
            if len(parts) != 3: raise SystemExit('%s: سطر غير صحيح في القاموس: %s' % (path, line))
            term, en, d = parts
            out.append('<div class="term"><div class="t"><h3>%s</h3>%s</div><p>%s</p></div>' % (esc(term), '<span class="en">%s</span>' % esc(en) if en else '', esc(d)))
    return out


# ------------------------------------------------------------------ AI Atlas content
def atlas_parse(path):
    """Read content/atlas/<lang>.txt: [section] headers followed by 'key = value' lines."""
    secs, cur = {}, None
    if not os.path.exists(path): return secs
    for ln in read(path).splitlines():
        if not ln.strip() or ln.lstrip().startswith('#'): continue
        m = re.match(r'^\[(.+?)\]\s*$', ln)
        if m: cur = m.group(1).strip(); secs.setdefault(cur, {}); continue
        if cur is None or '=' not in ln: raise SystemExit('%s: سطر غير مفهوم: %s' % (path, ln))
        k, _, v = ln.partition('=')
        secs[cur][k.strip()] = v.strip()
    return secs

ATLAS_CACHE = {}
def atlas_lang(lang):
    if lang not in ATLAS_CACHE: ATLAS_CACHE[lang] = atlas_parse(P('content', 'atlas', '%s.txt' % lang))
    return ATLAS_CACHE[lang]

def atlas_data(lang):
    """Merged Atlas data for one language (falls back to English, then Arabic, key by key)."""
    struct = json.load(open(P('content', 'atlas', 'structure.json'), encoding='utf-8'))
    chain = [atlas_lang(lang), atlas_lang('en'), atlas_lang('ar')]
    en = atlas_lang('en')
    def g(sec, key, default=''):
        for c in chain:
            v = c.get(sec, {}).get(key)
            if v: return v
        return default
    def block(sec, keys): return {k: g(sec, k) for k in keys}
    ui = block('ui', ('simple', 'analogy', 'why', 'example', 'terms', 'summit', 'stage', 'pkg', 'idea', 'insights'))
    stages = []
    for st in struct['stages']:
        so = dict(id=st['id'], n=st['n'], label=st['label'], ent=st['ent'], **block('stage ' + st['id'], ('title', 'lead', 'simple', 'analogy', 'why', 'example')))
        so['pkgs'] = []
        for p in st['pkgs']:
            po = dict(id=p['id'], label=p['label'], **block('pkg ' + p['id'], ('name', 'desc', 'simple', 'analogy', 'why', 'example')))
            po['terms'] = []
            for t in p['terms']:
                sec = 'term ' + t['k']
                name = g(sec, 'name'); en_name = en.get(sec, {}).get('name', '')
                badge = en_name if (lang != 'en' and en_name and en_name != name) else atlas_lang('ar').get(sec, {}).get('name', '')
                po['terms'].append({'name': name, 'badge': badge, 'def': g(sec, 'def'), 'tags': t.get('tags', [])})
            so['pkgs'].append(po)
        stages.append(so)
    si = dict(id='si', n='SI', label=struct['si']['label'], ent=struct['si']['ent'], **block('si', ('title', 'lead', 'simple', 'analogy', 'why', 'example')))
    si['ladder'] = [{'k': k, 'title': g('si', 'ladder.%s.title' % k), 'def': g('si', 'ladder.%s.def' % k), 'status': g('si', 'ladder.%s.status' % k)} for k in ('ANI', 'AGI', 'ASI')]
    si['insights'] = [g('si', 'insight.%d' % i) for i in range(1, 10) if g('si', 'insight.%d' % i)]
    return {'ui': ui, 'stages': stages, 'si': si}

def atlas_missing(lang):
    """Keys present in Arabic but missing in this language (for `build.py status`)."""
    ar, cur = atlas_lang('ar'), atlas_lang(lang)
    return [(sec, k) for sec, kv in ar.items() for k in kv if not cur.get(sec, {}).get(k)]

# ------------------------------------------------------------------ build
def load_base_posts():
    posts = []
    for f in sorted(os.listdir(P('content', 'posts'))):
        if f.endswith('.md') and not f.startswith('_'):
            p = parse_post(P('content', 'posts', f))
            if not p['draft']: posts.append(p)
    posts.sort(key=lambda p: (p['date'], p['file']), reverse=True)
    slugs = [p['slug'] for p in posts]
    dup = {s for s in slugs if slugs.count(s) > 1}
    if dup: raise SystemExit('slug مكرر: %s' % ', '.join(dup))
    return posts

def build():
    out = P('public')
    if os.path.isdir(out): shutil.rmtree(out)
    shutil.copytree(P('static'), out)
    css = ''.join(read(P('static', 'assets', f)) for f in ('base.css', 'article.css', 'atlas.css'))
    write(os.path.join(out, 'assets', 'site.css'), css)
    for f in ('base.css', 'article.css', 'atlas.css'): os.remove(os.path.join(out, 'assets', f))
    version = hashlib.md5((css + ''.join(read(P('static', 'assets', f)) for f in ('site.js', 'skin.js', 'atlas.js'))).encode()).hexdigest()[:8]

    base_posts = load_base_posts()
    base_tpl, sprite = read(P('templates', 'base.html')), read(P('templates', 'sprite.html'))
    year = datetime.date.today().year
    nl = SITE.get('newsletter_endpoint', '')
    if nl and not nl.startswith('https://'): raise SystemExit('site.json: newsletter_endpoint يجب أن يبدأ بـ https://')
    nl_attrs = ' action="%s" method="post" target="_blank" rel="noopener noreferrer" data-endpoint="1"' % esc(nl) if nl else ''

    # every language version of every post
    versions = {}   # slug -> {lang: post}
    by_lang = {}
    for lang in LANGS:
        S = STR[lang]; lst = []
        for bp in base_posts:
            p = translation(bp, lang)
            if not p: continue
            p['url'] = '%s/posts/%s/' % (S['prefix'], p['slug'])
            p['minutes'], p['read_label'] = reading_time(p['body_md'], lang)
            versions.setdefault(p['slug'], {})[lang] = p; lst.append(p)
        by_lang[lang] = lst

    def lang_links(lang, urls):
        return ''.join('<li><a href="%s" hreflang="%s" lang="%s"%s>%s<span>%s</span></a></li>' % (
            urls.get(l, STR[l]['prefix'] + '/'), STR[l]['html_lang'], STR[l]['html_lang'],
            ' aria-current="true"' if l == lang else '', esc(STR[l]['lang_name']), esc(STR[l]['code'])) for l in LANGS)
    def hreflang(urls):
        tags = ['<link rel="alternate" hreflang="%s" href="%s%s">' % (STR[l]['html_lang'], BASE_URL, u) for l, u in urls.items()]
        if DEFAULT in urls: tags.append('<link rel="alternate" hreflang="x-default" href="%s%s">' % (BASE_URL, urls[DEFAULT]))
        return '\n'.join(tags)

    def page(lang, content, title, desc, url, alt_urls, og_type='website', body_class='', head_extra='', og_title=None):
        S = STR[lang]
        return fill(base_tpl, S, page_title=esc(title), description=esc(desc), canonical=BASE_URL + url, og_type=og_type,
                    og_title=esc(og_title or title), og_image=BASE_URL + '/assets/og-cover.png', head_extra=head_extra,
                    version=version, body_class=body_class, sprite=sprite, content=content, newsletter_attrs=nl_attrs, year=year,
                    prefix=S['prefix'], hreflang=hreflang(alt_urls), lang_links=lang_links(lang, alt_urls),
                    js_strings=js_json({k: S[k] for k in ('nl_invalid', 'nl_soon', 'copied')}))

    home_urls = {l: STR[l]['prefix'] + '/' for l in LANGS}
    atlas_urls = {l: STR[l]['prefix'] + '/atlas/' for l in LANGS}
    sitemap = []   # (path, lastmod)
    def pdate(p):
        u = p.get('updated')
        try: return datetime.date.fromisoformat(str(u)) if u else p['date']
        except ValueError: return p['date']
    atlas_mod = SITE.get('atlas_updated') or datetime.date.today().isoformat()
    social = [u.split('?')[0] for u in SITE.get('social', {}).values() if u]
    for lang in LANGS:
        S = STR[lang]; posts = by_lang[lang]; root = os.path.join(out, S['prefix'].strip('/'))
        pages = [p for p in posts if p['kind'] in ('article', 'head')]
        terms = glossary_html(lang)
        ad = atlas_data(lang)
        ai_chips = ''.join('<span>%s %s</span>' % (st['n'], esc(st['title'])) for st in ad['stages']) + '<span class="si-badge">SI %s</span>' % esc(ad['si']['title'])
        home = fill(read(P('templates', 'home.html')), S, sprite_lockup=read(P('templates', 'sprite-lockup.html')), ai_stage_chips=ai_chips,
                    count_posts=len(posts), count_topics=len(CAT_EN), count_terms=len(terms),
                    feed='\n'.join(card(p, S) for p in posts), glossary='\n'.join(terms), prefix=S['prefix'])
        home_ld = {"@context": "https://schema.org", "@graph": [
            {"@type": "Organization", "@id": BASE_URL + '/#org', "name": STR[DEFAULT]['site_name'], "alternateName": ["Sahati Tech", "CyberLogy"],
             "url": BASE_URL + '/', "logo": {"@type": "ImageObject", "url": BASE_URL + '/assets/icon-192.png', "width": 192, "height": 192}, "sameAs": social},
            {"@type": "WebSite", "@id": BASE_URL + S['prefix'] + '/#website', "name": S['site_name'], "url": BASE_URL + S['prefix'] + '/',
             "description": S['site_description'], "inLanguage": S['html_lang'], "publisher": {"@id": BASE_URL + '/#org'}}]}
        write(os.path.join(root, 'index.html'), page(lang, home, S['site_title'], S['site_description'], S['prefix'] + '/', home_urls,
              head_extra='<script type="application/ld+json">%s</script>' % js_json(home_ld)))
        sitemap.append((S['prefix'] + '/', max([pdate(p) for p in posts]).isoformat() if posts else atlas_mod))

        # AI Atlas for this language
        atlas_tpl = read(P('templates', 'atlas.html'))
        adata = atlas_data(lang)
        atlas_content = fill(atlas_tpl, S, prefix=S['prefix'], version=version,
                             atlas_data='<script type="application/json" id="atlasData">%s</script>' % js_json(adata))
        atlas_page_html = page(lang, atlas_content, S['atlas_title'], S['atlas_lead'], S['prefix'] + '/atlas/', atlas_urls, body_class='is-atlas')
        write(os.path.join(root, 'atlas', 'index.html'), atlas_page_html)
        sitemap.append((S['prefix'] + '/atlas/', atlas_mod))

        for idx, p in enumerate(pages):
            toc = []; body = md(p['body_md'], S, toc)
            cat = S['cats'][p['category']]
            toc_html = '<details class="toc"><summary>%s</summary><ol>%s</ol></details>' % (esc(S['toc_title']), ''.join('<li><a href="#%s">%s</a></li>' % (h, inline(t)) for h, t in toc)) if len(toc) >= 2 else ''
            newer = pages[idx - 1] if idx > 0 else None
            older = pages[idx + 1] if idx + 1 < len(pages) else None
            pn = ('<a class="pv" href="%s"><span>← PREVIOUS</span><b>%s</b></a>' % (older['url'], esc(older['title'])) if older else '<span class="empty-slot"></span>') + \
                 ('<a class="nx" href="%s"><span>NEXT →</span><b>%s</b></a>' % (newer['url'], esc(newer['title'])) if newer else '<span class="empty-slot"></span>')
            rel = [q for q in pages if q is not p and q['category'] == p['category']]
            rel += [q for q in pages if q is not p and q not in rel]
            related = '<div class="related"><h2>%s</h2><div class="grid">%s</div></div>' % (esc(S['related']), ''.join(card(q, S) for q in rel[:3])) if rel else ''
            url = BASE_URL + p['url']
            alts = {l: v['url'] for l, v in versions[p['slug']].items()}
            ld = {"@context": "https://schema.org", "@type": "BlogPosting", "headline": p['title'], "description": p.get('excerpt', ''),
                  "datePublished": p['date'].isoformat(), "dateModified": pdate(p).isoformat(), "image": BASE_URL + '/assets/og-cover.png', "inLanguage": S['html_lang'], "mainEntityOfPage": url,
                  "author": {"@type": "Organization", "name": S['site_name']}, "publisher": {"@type": "Organization", "@id": BASE_URL + '/#org', "name": S['site_name'], "logo": {"@type": "ImageObject", "url": BASE_URL + '/assets/icon-192.png'}}}
            content = fill(read(P('templates', 'post.html')), S, prefix=S['prefix'],
                hero_class=' is-head' if p['kind'] == 'head' else '', kind_label=esc(S['pill_' + p['kind']]), kind_label_single=esc(S['kind_' + p['kind']]),
                category_ar=esc(cat), title=esc(p['title']), excerpt=esc(p.get('excerpt', '')), date_iso=p['date'].isoformat(), date_ar=fmt_date(p['date'], lang),
                read_time=esc(p['read_label']), cover_block='<div class="wrap post-cover">%s</div>' % cover_html(p) if p['kind'] == 'article' else '',
                body=body, toc=toc_html, share_buttons=share_buttons(url, p['title'], S), prev_next=pn, related=related)
            write(os.path.join(root, 'posts', p['slug'], 'index.html'),
                  page(lang, content, '%s | %s' % (p['title'], S['site_name']), p.get('excerpt') or S['site_description'], p['url'], alts,
                       og_type='article', og_title=p['title'], body_class='is-post',
                       head_extra='<script type="application/ld+json">%s</script>' % js_json(ld)))
            sitemap.append((p['url'], pdate(p).isoformat()))

        items = ''.join('<item><title>%s</title><link>%s</link><guid>%s</guid><pubDate>%s</pubDate><description>%s</description></item>' % (
            esc(p['title']), BASE_URL + p['url'], BASE_URL + p['url'],
            datetime.datetime.combine(p['date'], datetime.time(9)).strftime('%a, %d %b %Y %H:%M:%S +0200'), esc(p.get('excerpt', ''))) for p in pages[:30])
        write(os.path.join(root, 'feed.xml'), '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>%s</title><link>%s%s/</link><description>%s</description><language>%s</language>%s</channel></rss>' % (
            esc(S['site_name']), BASE_URL, S['prefix'], esc(S['site_description']), S['html_lang'], items))

    # 404 (one file for the whole site, in the default language + links to every language)
    S = STR[DEFAULT]
    nf_langs = ''.join('<li><a href="%s/" lang="%s">%s</a></li>' % (STR[l]['prefix'], STR[l]['html_lang'], esc(STR[l]['lang_name'])) for l in LANGS)
    write(os.path.join(out, '404.html'), page(DEFAULT, fill(read(P('templates', '404.html')), S, prefix='', nf_langs=nf_langs),
          '%s | %s' % (S['nf_page_title'], S['site_name']), S['site_description'], '/404.html', home_urls))
    write(os.path.join(out, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">%s</urlset>' % ''.join('<url><loc>%s%s</loc><lastmod>%s</lastmod></url>' % (BASE_URL, esc(u), m) for u, m in sitemap))
    write(os.path.join(out, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: %s/sitemap.xml\n' % BASE_URL)
    print('✓ تم البناء ← public/')
    for lang in LANGS:
        print('   %-4s %-9s منشورات: %d' % (lang, STR[lang]['lang_name'], len(by_lang[lang])))
    missing = status(quiet=True)
    if missing: print('⚠ توجد ترجمات ناقصة (%d). شغّل: python build.py status' % missing)

def status(quiet=False):
    base = load_base_posts(); n = 0
    for lang in LANGS[1:]:
        miss = [p['file'] for p in base if not translation(p, lang)]
        n += len(miss)
        if not quiet and miss:
            print('%s (%s): %s' % (lang, STR[lang]['lang_name'], ', '.join(miss)))
    if not quiet and not n: print('✓ كل المنشورات مترجمة لكل اللغات.')
    for lang in LANGS[1:]:
        m = atlas_missing(lang)
        n += len(m)
        if not quiet and m:
            print('الأطلس · %s (%s): %d نص ناقص، مثل: %s' % (lang, STR[lang]['lang_name'], len(m), ', '.join('[%s] %s' % x for x in m[:4])))
    return n

# ------------------------------------------------------------------ commands
NEW_TEMPLATE = '''---
title: عنوان المنشور هنا
slug: {slug}
date: {date}
# النوع: article (مقال بغلاف) | head (شرح بدون غلاف) | tip (نصيحة سريعة) | quote (قاعدة)
kind: article
# التصنيف: {cats}
category: acc
# لون الغلاف (للمقالات فقط): a داكن | b برونزي | c فاتح
cover: a
glyph: 2FA
excerpt: سطر أو سطران يلخصان المنشور، يظهران في البطاقة وعند المشاركة.
draft: true
# للنصائح السريعة فقط:
# steps:
#   - افتح **الإعدادات**
# للقواعد فقط:
# quote: نص القاعدة
---

مقدمة قصيرة تشرح المشكلة.

## العنوان الأول

نص الفقرة.

:::action
1. الخطوة الأولى التي ينفذها القارئ الآن
:::
'''
TR_TEMPLATE = '''---
# Translation of: {file}  ({lang})
# Only these fields are translated; date, kind, category and cover come from the Arabic file.
title:
excerpt:
draft: true
# steps:      (quick tips only)
#   -
# quote:      (rules only)
---

'''

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'build'
    if cmd == 'new':
        if len(sys.argv) < 3 or not re.match(r'^[a-z0-9-]+$', sys.argv[2]):
            raise SystemExit('الاستخدام: python build.py new my-post-slug   (حروف إنجليزية صغيرة وأرقام وشرطات)')
        name = '%s-%s.md' % (datetime.date.today().isoformat(), sys.argv[2])
        path = P('content', 'posts', name)
        if os.path.exists(path): raise SystemExit('الملف موجود مسبقاً: ' + path)
        write(path, NEW_TEMPLATE.format(slug=sys.argv[2], date=datetime.date.today().isoformat(), cats=' | '.join(CAT_EN)))
        for lang in LANGS[1:]:
            write(P('content', 'i18n', lang, 'posts', name), TR_TEMPLATE.format(file=name, lang=STR[lang]['lang_name']))
        print('✓ أُنشئ المنشور: content/posts/%s\n✓ وملفات الترجمة في content/i18n/<lang>/posts/%s\n  اكتب، ثم غيّر draft إلى false في كل ملف، ثم شغّل: python build.py' % (name, name))
    elif cmd == 'status':
        status()
    elif cmd == 'serve':
        build()
        import http.server, functools, socketserver
        port = int(sys.argv[2]) if len(sys.argv) > 2 else 8000
        class H(http.server.SimpleHTTPRequestHandler):
            def send_error(self, code, message=None, explain=None):
                if code == 404 and os.path.exists(P('public', '404.html')):
                    body = open(P('public', '404.html'), 'rb').read()
                    self.send_response(404); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
                else: super().send_error(code, message, explain)
        handler = functools.partial(H, directory=P('public'))
        socketserver.TCPServer.allow_reuse_address = True
        with socketserver.TCPServer(('127.0.0.1', port), handler) as srv:
            print('معاينة: http://localhost:%d  (Ctrl+C للإيقاف)' % port); srv.serve_forever()
    elif cmd == 'build':
        build()
    else:
        print(__doc__)
