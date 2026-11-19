// tools/ui-check/measure.mjs — `ui-check measure`: layout checks of one of our screens in a real Chrome, no official
// screenshot needed. The page half (`collect`, run through page.evaluate) only reads the DOM — rects, scroll sizes,
// overflow, padding, text and image urls; every judgement is made here in node (`judge`), so it is tested without a
// browser (test/ui-check-measure.test.js).
//
// The spec is the same file `ui-check compare` reads (tools/ui-check/compare.mjs header): `ours` names the screen and
// its state (tools/ui-check/browser.mjs header), and a `measure` part says which cells of that screen are checked how.
// The official part is not needed here. `measure`:
//   tol      px (default 1): a difference over it fails
//   views    [{ name, viewport: [w, h], touch, dpr, uiK, uiPxPerUnit }] — each opens the screen afresh with these over
//            `ours` (default: one view "screen" = ours, viewport ours.viewport, else the layouts' screen, else 1920×1080)
//   roots    [selector…] — the parts of the screen the two sweeps below look at (every match, and all inside it):
//            · clipped text: every visible element with its own text is cut neither by its own box (scrollWidth /
//              scrollHeight over clientWidth / clientHeight) nor by an ancestor that clips (overflow other than
//              visible). Cut along an axis an ancestor scrolls (overflow auto / scroll) is reported apart as `scroll`
//              (a list the player can scroll), not failed.
//            · images: every <img> loaded, and every url() of a background / mask / border image of an element or its
//              ::before / ::after loads as an image (a 404, an empty url or one that is not a picture fails)
//   text     { except: [{ sel, why }] } — text inside a match of sel (closest) is not failed by the sweep; `why` is required
//   heights  [{ name, each, ref, cells: [selector…], edges, tol, min }] — sibling cells match a reference cell. With
//            `each`, per match of it (a row): ref is looked up inside the row (":scope …" works), or `{ global: sel }`
//            takes the document's i-th match for the i-th row; cells are looked up inside the row. edges: letters of
//            h (height, default) t b (top, bottom) w l r (width, left, right)
//   centres  [{ name, sel, parent, axes, tol, min }] — every match's centre is its parent's: parent = the closest
//            ancestor matching `parent` (default the parent element); axes x, y or xy (default)
//   padding  [{ name, sel, child, axes, tol, min }] — the content sits as far from the left edge as from the right (axes
//            x, default; y; xy): the gap between the padding box and the union of the visible children (or the
//            matches of `child` inside it, or the element's own text when it has no child element)
//   filled   [{ name, sel, each, min, text, art }] — the data cells a mockup showed are filled: at least `min` (default
//            1) matches (per `each` row when given), each with text (true: not empty; a string: a regular expression
//            the trimmed text matches) and / or `art` (an image it or a visible element inside it shows, every one of
//            them loading as in the image sweep)
//   network  { except: [{ match, why }] } — failed requests (4xx, failed loads) and page errors fail unless a regular
//            expression `match` finds them; `why` is required
// Every entry with `min` (default 1) fails when it measured fewer elements than that, so a selector that matches
// nothing never passes as empty.

import path from 'node:path';

export const CHECKS = ['tol', 'views', 'roots', 'text', 'heights', 'centres', 'padding', 'filled', 'network'];
const EDGE_LETTERS = /^[htbwlr]+$/;
const AXES = new Set(['x', 'y', 'xy']);

const fail = (msg) => { throw new Error(`ui-check measure: ${msg}`); };
const list = (v, what) => {
  if (v == null) return [];
  if (!Array.isArray(v)) fail(`${what} must be a list`);
  return v;
};
const needWhy = (arr, what) => arr.map((e, i) => {
  if (!e || typeof e !== 'object') fail(`${what}[${i}] must be an object`);
  if (!e.why || typeof e.why !== 'string') fail(`${what}[${i}] needs a why (the reason it is not a failure)`);
  return e;
});

/**
 * The views and checks of a spec's `measure` part, validated (unknown keys stop the run rather than check nothing).
 * `layouts` are the compare spec's loaded layouts (only for the default viewport), may be empty.
 */
export function resolveMeasure(spec, dir, layouts = {}) {
  const m = spec.measure;
  if (!m || typeof m !== 'object') fail('the spec has no "measure" part');
  for (const k of Object.keys(m)) if (!CHECKS.includes(k) && !k.startsWith('//')) fail(`unknown key "${k}" (known: ${CHECKS.join(', ')})`);
  if (!spec.ours?.url) fail('spec.ours.url is missing');
  const tol = m.tol ?? 1;
  if (!(tol >= 0)) fail(`bad tol ${m.tol}`);
  const screen = Object.values(layouts)[0]?.canvas?.screen;
  const baseView = { viewport: spec.ours.viewport || (screen && screen.map((v) => Math.round(v))) || [1920, 1080] };
  const views = list(m.views, 'measure.views');
  const resolvedViews = (views.length ? views : [{ name: 'screen' }]).map((v, i) => {
    if (!v.name || !/^[\w-]+$/.test(v.name)) fail(`views[${i}] needs a name of letters, digits, - or _ (it names the picture)`);
    const ours = { ...spec.ours, ...baseView, ...v };
    delete ours.name;
    return { name: v.name, ours };
  });
  if (new Set(resolvedViews.map((v) => v.name)).size !== resolvedViews.length) fail('two views have the same name');
  const roots = list(m.roots, 'measure.roots');
  if (roots.some((r) => typeof r !== 'string' || !r)) fail('roots are selectors');
  const named = (e, i, what) => ({ name: e.name || `${what} ${i + 1}`, min: 1, ...e });
  const heights = list(m.heights, 'measure.heights').map((e, i) => {
    if (!e.ref || !(typeof e.ref === 'string' || typeof e.ref?.global === 'string')) fail(`heights[${i}] needs ref (a selector or { global })`);
    if (!e.cells?.length) fail(`heights[${i}] needs cells`);
    if (e.ref.global && !e.each) fail(`heights[${i}]: ref { global } needs each`);
    if (e.edges && !EDGE_LETTERS.test(e.edges)) fail(`heights[${i}] edges "${e.edges}" is not letters of htbwlr`);
    return { edges: 'h', ...named(e, i, 'heights') };
  });
  const centres = list(m.centres, 'measure.centres').map((e, i) => {
    if (!e.sel) fail(`centres[${i}] needs sel`);
    if (e.axes && !AXES.has(e.axes)) fail(`centres[${i}] axes "${e.axes}" is not x, y or xy`);
    return { axes: 'xy', ...named(e, i, 'centres') };
  });
  const padding = list(m.padding, 'measure.padding').map((e, i) => {
    if (!e.sel) fail(`padding[${i}] needs sel`);
    if (e.axes && !AXES.has(e.axes)) fail(`padding[${i}] axes "${e.axes}" is not x, y or xy`);
    return { axes: 'x', ...named(e, i, 'padding') };
  });
  const filled = list(m.filled, 'measure.filled').map((e, i) => {
    if (!e.sel) fail(`filled[${i}] needs sel`);
    if (e.text == null && !e.art) fail(`filled[${i}] checks nothing: give text (true or a pattern) and / or art`);
    if (typeof e.text === 'string') { try { new RegExp(e.text); } catch { fail(`filled[${i}] text "${e.text}" is not a regular expression`); } }
    return named(e, i, 'filled');
  });
  const textExcept = needWhy(list(m.text?.except, 'measure.text.except'), 'text.except');
  if (textExcept.some((e) => !e.sel)) fail('text.except entries need sel');
  const netExcept = needWhy(list(m.network?.except, 'measure.network.except'), 'network.except');
  for (const e of netExcept) { try { new RegExp(e.match); } catch { fail(`network.except match "${e.match}" is not a regular expression`); } }
  if (!roots.length && !heights.length && !centres.length && !padding.length && !filled.length) fail('measure checks nothing');
  return { dir: dir ? path.resolve(dir) : null, tol, views: resolvedViews, roots, textExcept, heights, centres, padding, filled, netExcept };
}

/** What `collect` needs from the resolved checks (selectors only — it runs in the page). */
export function pagePlan(ms) {
  return {
    roots: ms.roots, textExcept: ms.textExcept.map((e) => e.sel),
    heights: ms.heights.map((e) => ({ each: e.each || null, ref: e.ref, cells: e.cells })),
    centres: ms.centres.map((e) => ({ sel: e.sel, parent: e.parent || null })),
    padding: ms.padding.map((e) => ({ sel: e.sel, child: e.child || null })),
    filled: ms.filled.map((e) => ({ sel: e.sel, each: e.each || null, art: !!e.art })),
  };
}

/* global document, getComputedStyle, Image, Node, location -- collect() runs in the browser */
/**
 * Run in the page (page.evaluate(collect, pagePlan(ms))): the raw geometry of every checked element. Self-contained —
 * nothing outside this function is visible to it.
 */
export async function collect(plan) {
  const r1 = (v) => Math.round(v * 100) / 100;
  const box = (r) => ({ x: r1(r.left), y: r1(r.top), w: r1(r.width), h: r1(r.height) });
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.visibility !== 'collapse' && Number(cs.opacity) > 0;
  };
  const label = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).map((c) => `.${c}`).join('') : '';
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${el.tagName.toLowerCase()}${cls}${t ? ` "${t}"` : ''}`;
  };
  const urlsOf = (el) => {
    const out = [];
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue;
      for (const prop of ['background-image', 'mask-image', '-webkit-mask-image', 'border-image-source', 'list-style-image']) {
        const v = cs.getPropertyValue(prop);
        if (!v || v === 'none') continue;
        for (const m of v.matchAll(/url\((["']?)(.*?)\1\)/g)) out.push(m[2]);
      }
    }
    if (el.tagName === 'IMG') out.push(`img:${el.currentSrc || el.src || ''}`);
    return out;
  };
  const images = new Map(); // url → { url, ok, w, h, users: [label] }
  const useImages = (el) => {
    const us = urlsOf(el);
    for (const u of us) {
      if (!images.has(u)) images.set(u, { url: u, users: [] });
      const e = images.get(u);
      if (e.users.length < 3) e.users.push(label(el));
    }
    return us;
  };
  const all = (sel, root = document) => [...root.querySelectorAll(sel)];
  const res = { viewport: [document.documentElement.clientWidth, document.documentElement.clientHeight], text: [], heights: [], centres: [], padding: [], filled: [], images: [] };

  // the sweeps over the roots
  const rootEls = [...new Set(plan.roots.flatMap((s) => all(s)))];
  const swept = new Set();
  for (const root of rootEls) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (swept.has(el)) continue;
      swept.add(el);
      if (!visible(el)) continue;
      useImages(el);
      const own = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (!own.length) continue;
      const range = document.createRange();
      range.setStartBefore(own[0]);
      range.setEndAfter(own[own.length - 1]);
      const t = range.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const clips = [];
      for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (ps.overflowX === 'visible' && ps.overflowY === 'visible') continue;
        const q = p.getBoundingClientRect();
        clips.push({ label: label(p), rect: box(q), clientLeft: p.clientLeft, clientTop: p.clientTop, clientWidth: p.clientWidth, clientHeight: p.clientHeight, ox: ps.overflowX, oy: ps.overflowY });
      }
      res.text.push({
        label: label(el), text: own.map((n) => n.textContent.trim()).join(' ').slice(0, 40),
        except: plan.textExcept.findIndex((s) => el.closest(s)),
        textRect: box(t), inline: cs.display === 'inline', textOverflow: cs.textOverflow,
        self: { rect: box(el.getBoundingClientRect()), clientLeft: el.clientLeft, clientTop: el.clientTop, clientWidth: el.clientWidth, clientHeight: el.clientHeight },
        client: [el.clientWidth, el.clientHeight], scroll: [el.scrollWidth, el.scrollHeight], ox: cs.overflowX, oy: cs.overflowY, clips,
      });
    }
  }

  plan.heights.forEach((h) => {
    const scopes = h.each ? all(h.each) : [document];
    const globalRefs = typeof h.ref === 'object' ? all(h.ref.global) : null;
    res.heights.push(scopes.map((scope, i) => {
      const ref = globalRefs ? globalRefs[i] : scope.querySelector(h.ref);
      return {
        scope: scope === document ? null : label(scope),
        ref: ref ? { label: label(ref), rect: box(ref.getBoundingClientRect()) } : null,
        cells: h.cells.map((sel) => ({ sel, els: all(sel, scope).filter(visible).map((el) => ({ label: label(el), rect: box(el.getBoundingClientRect()) })) })),
      };
    }));
  });

  plan.centres.forEach((c) => {
    res.centres.push(all(c.sel).filter(visible).map((el) => {
      const p = c.parent ? el.parentElement?.closest(c.parent) : el.parentElement;
      return { label: label(el), rect: box(el.getBoundingClientRect()), parent: p ? { label: label(p), rect: box(p.getBoundingClientRect()) } : null };
    }));
  });

  plan.padding.forEach((c) => {
    res.padding.push(all(c.sel).filter(visible).map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const pad = {
        x: r.left + parseFloat(cs.borderLeftWidth), y: r.top + parseFloat(cs.borderTopWidth),
        r: r.right - parseFloat(cs.borderRightWidth), b: r.bottom - parseFloat(cs.borderBottomWidth),
      };
      let kids = (c.child ? all(c.child, el) : [...el.children]).filter(visible).map((k) => k.getBoundingClientRect());
      if (!kids.length && !c.child && el.textContent.trim()) {
        const range = document.createRange();
        range.selectNodeContents(el);
        kids = [range.getBoundingClientRect()];
      }
      const inner = kids.length ? {
        x: Math.min(...kids.map((k) => k.left)), y: Math.min(...kids.map((k) => k.top)),
        r: Math.max(...kids.map((k) => k.right)), b: Math.max(...kids.map((k) => k.bottom)),
      } : null;
      return { label: label(el), padBox: pad && { x: r1(pad.x), y: r1(pad.y), w: r1(pad.r - pad.x), h: r1(pad.b - pad.y) }, inner: inner && { x: r1(inner.x), y: r1(inner.y), w: r1(inner.r - inner.x), h: r1(inner.b - inner.y) } };
    }));
  });

  plan.filled.forEach((f) => {
    const scopes = f.each ? all(f.each) : [document];
    res.filled.push(scopes.map((scope) => ({
      scope: scope === document ? null : label(scope),
      items: all(f.sel, scope).filter(visible).map((el) => ({
        label: label(el), text: (el.textContent || '').trim().replace(/\s+/g, ' '),
        urls: f.art ? [el, ...el.querySelectorAll('*')].filter(visible).flatMap(useImages) : [],
      })),
    })));
  });

  // load every image url once (from the cache: the page already asked for them)
  const here = location.href.split('#')[0];
  await Promise.all([...images.values()].map(async (e) => {
    // an <img> is loaded the same way, from its src: a lazy one outside a scrolled list has not asked for it yet
    const src = e.url.startsWith('img:') ? e.url.slice(4) : e.url;
    if (!src || src === here || /^about:/.test(src)) { e.ok = false; e.why = 'empty url'; return; }
    await new Promise((done) => {
      const im = new Image();
      const t = setTimeout(() => { e.ok = false; e.why = 'timeout'; done(); }, 8000);
      im.onload = () => { clearTimeout(t); e.ok = im.naturalWidth > 0; e.w = im.naturalWidth; e.h = im.naturalHeight; if (!e.ok) e.why = 'no pixels'; done(); };
      im.onerror = () => { clearTimeout(t); e.ok = false; e.why = 'does not load as an image'; done(); };
      im.src = src;
    });
  }));
  res.images = [...images.values()];
  return res;
}

const round1 = (v) => Math.round(v * 10) / 10;
const over = (d, tol) => Math.abs(round1(d)) > tol;
const shortUrl = (u) => (u.length > 90 ? `${u.slice(0, 60)}…${u.slice(-28)}` : u);

/** How far the text rect sticks out of a clipping ancestor's visible (client) box, per axis. */
export function cutBy(t, clip) {
  const cx = clip.rect.x + clip.clientLeft, cy = clip.rect.y + clip.clientTop;
  const cw = clip.clientWidth || clip.rect.w, ch = clip.clientHeight || clip.rect.h;
  return {
    x: Math.max(cx - t.x, t.x + t.w - (cx + cw), 0),
    y: Math.max(cy - t.y, t.y + t.h - (cy + ch), 0),
  };
}

const SCROLLS = new Set(['auto', 'scroll']);

/**
 * Judge the raw `collect` result against the checks. Returns { rows, failed, scroll, excepted } — a row is
 * { check, name, status: ok | fail | scroll | except, what, detail }.
 */
export function judge(ms, raw, problems = { requests: [], errors: [] }) {
  const rows = [];
  const add = (check, name, status, what, detail = null) => rows.push({ check, name, status, what, detail });
  const { tol } = ms;

  if (ms.roots.length) {
    let texts = 0;
    for (const t of raw.text) {
      texts++;
      const cuts = [];
      const [cw, chh] = t.client, [sw, sh] = t.scroll;
      // its own box: the scroll size is over the client size because of the text (not a child that sticks out) — the
      // text rect leaves the box, or the box cuts it with an ellipsis
      const self = t.inline ? null : cutBy(t.textRect, t.self);
      const ellipsis = t.textOverflow === 'ellipsis' && t.ox !== 'visible';
      if (self && cw > 0 && sw - cw > tol && (self.x > tol || ellipsis)) cuts.push({ by: 'its own box', axis: 'x', px: sw - cw, scroll: SCROLLS.has(t.ox) });
      if (self && chh > 0 && sh - chh > tol && self.y > tol) cuts.push({ by: 'its own box', axis: 'y', px: sh - chh, scroll: SCROLLS.has(t.oy) });
      for (const c of t.clips) {
        const d = cutBy(t.textRect, c);
        if (d.x > tol && c.ox !== 'visible') cuts.push({ by: c.label, axis: 'x', px: d.x, scroll: SCROLLS.has(c.ox) });
        if (d.y > tol && c.oy !== 'visible') cuts.push({ by: c.label, axis: 'y', px: d.y, scroll: SCROLLS.has(c.oy) });
      }
      if (!cuts.length) continue;
      const what = `${t.label}: ${cuts.map((c) => `${round1(c.px)}px ${c.axis} by ${c.by}`).join('; ')}`;
      if (t.except >= 0) add('text', 'clipped text', 'except', what, ms.textExcept[t.except].why);
      else if (cuts.every((c) => c.scroll)) add('text', 'clipped text', 'scroll', what, 'only along an axis its box or an ancestor scrolls');
      else add('text', 'clipped text', 'fail', what);
    }
    if (!texts) add('text', 'clipped text', 'fail', `no text under the roots ${ms.roots.join(', ')} — nothing measured`);
    else add('text', 'clipped text', 'ok', `${texts} texts`);
  }

  ms.heights.forEach((h, i) => {
    const scopes = raw.heights[i] || [];
    let n = 0;
    const EDGE = { h: ['height', (a, b) => a.h - b.h], t: ['top', (a, b) => a.y - b.y], b: ['bottom', (a, b) => a.y + a.h - (b.y + b.h)], w: ['width', (a, b) => a.w - b.w], l: ['left', (a, b) => a.x - b.x], r: ['right', (a, b) => a.x + a.w - (b.x + b.w)] };
    scopes.forEach((s, si) => {
      const where = s.scope ? `${s.scope} #${si}` : 'page';
      if (!s.ref) { add('heights', h.name, 'fail', `${where}: no reference cell`); return; }
      for (const c of s.cells) {
        if (!c.els.length) { add('heights', h.name, 'fail', `${where}: no visible ${c.sel}`); continue; }
        for (const e of c.els) {
          n++;
          const diffs = [...h.edges].map((k) => [EDGE[k][0], round1(EDGE[k][1](e.rect, s.ref.rect))]);
          const bad = diffs.filter(([, d]) => over(d, h.tol ?? tol));
          if (bad.length) add('heights', h.name, 'fail', `${where}: ${e.label} vs ${s.ref.label} ${bad.map(([k, d]) => `${k} ${d > 0 ? '+' : ''}${d}`).join(' ')}`, { cell: e.rect, ref: s.ref.rect });
        }
      }
    });
    if (n < h.min) add('heights', h.name, 'fail', `measured ${n} cells, the spec wants at least ${h.min}`);
    else if (!rows.some((r) => r.check === 'heights' && r.name === h.name && r.status === 'fail')) add('heights', h.name, 'ok', `${n} cells`);
  });

  ms.centres.forEach((c, i) => {
    const els = raw.centres[i] || [];
    let n = 0, bad = 0;
    for (const e of els) {
      if (!e.parent) { add('centres', c.name, 'fail', `${e.label}: no parent ${c.parent || ''}`); bad++; continue; }
      n++;
      const a = e.rect, p = e.parent.rect;
      const dx = round1(a.x + a.w / 2 - (p.x + p.w / 2)), dy = round1(a.y + a.h / 2 - (p.y + p.h / 2));
      const offs = [];
      if (c.axes.includes('x') && over(dx, c.tol ?? tol)) offs.push(`x ${dx}`);
      if (c.axes.includes('y') && over(dy, c.tol ?? tol)) offs.push(`y ${dy}`);
      if (offs.length) { add('centres', c.name, 'fail', `${e.label} in ${e.parent.label}: centre off ${offs.join(' ')}`, { el: a, parent: p }); bad++; }
    }
    if (n < c.min) add('centres', c.name, 'fail', `measured ${n} elements of ${c.sel}, the spec wants at least ${c.min}`);
    else if (!bad) add('centres', c.name, 'ok', `${n} elements`);
  });

  ms.padding.forEach((c, i) => {
    const els = raw.padding[i] || [];
    let n = 0, bad = 0;
    for (const e of els) {
      if (!e.inner) { add('padding', c.name, 'fail', `${e.label}: nothing inside to measure`); bad++; continue; }
      n++;
      const P = e.padBox, I = e.inner;
      const offs = [];
      const gl = I.x - P.x, gr = P.x + P.w - (I.x + I.w), gt = I.y - P.y, gb = P.y + P.h - (I.y + I.h);
      if (c.axes.includes('x') && over(gl - gr, c.tol ?? tol)) offs.push(`left ${round1(gl)} right ${round1(gr)}`);
      if (c.axes.includes('y') && over(gt - gb, c.tol ?? tol)) offs.push(`top ${round1(gt)} bottom ${round1(gb)}`);
      if (offs.length) { add('padding', c.name, 'fail', `${e.label}: ${offs.join('; ')}`, { padBox: P, inner: I }); bad++; }
    }
    if (n < c.min) add('padding', c.name, 'fail', `measured ${n} elements of ${c.sel}, the spec wants at least ${c.min}`);
    else if (!bad) add('padding', c.name, 'ok', `${n} elements`);
  });

  const imageOk = new Map(raw.images.map((im) => [im.url, im]));
  ms.filled.forEach((f, i) => {
    const scopes = raw.filled[i] || [];
    let bad = 0, n = 0;
    const re = typeof f.text === 'string' ? new RegExp(f.text) : null;
    scopes.forEach((s, si) => {
      const where = s.scope ? `${s.scope} #${si}: ` : '';
      if (s.items.length < f.min) { add('filled', f.name, 'fail', `${where}${s.items.length} of ${f.sel}, the spec wants at least ${f.min}`); bad++; }
      for (const it of s.items) {
        n++;
        if (f.text === true && !it.text) { add('filled', f.name, 'fail', `${where}${it.label}: empty`); bad++; }
        if (re && !re.test(it.text)) { add('filled', f.name, 'fail', `${where}${it.label}: "${it.text.slice(0, 30)}" does not match /${f.text}/`); bad++; }
        if (f.art) {
          const broken = it.urls.filter((u) => !imageOk.get(u)?.ok);
          if (!it.urls.length) { add('filled', f.name, 'fail', `${where}${it.label}: shows no image`); bad++; }
          else if (broken.length) { add('filled', f.name, 'fail', `${where}${it.label}: image ${broken.map(shortUrl).join(', ')} does not load`); bad++; }
        }
      }
    });
    if (!scopes.length) { add('filled', f.name, 'fail', `no ${f.each} to look in`); bad++; }
    if (!bad) add('filled', f.name, 'ok', `${n} cells`);
  });

  if (ms.roots.length) {
    const broken = raw.images.filter((im) => !im.ok);
    for (const im of broken) add('images', 'images', 'fail', `${shortUrl(im.url)} — ${im.why || 'broken'} (${im.users.join(', ')})`);
    if (!broken.length) add('images', 'images', 'ok', `${raw.images.length} images`);
  }

  const lines = [...problems.requests.map((r) => ['request', r]), ...problems.errors.map((e) => ['page error', e])];
  let netBad = 0;
  for (const [kind, s] of lines) {
    const ex = ms.netExcept.find((e) => new RegExp(e.match).test(s));
    if (ex) add('network', kind, 'except', s, ex.why);
    else { add('network', kind, 'fail', s); netBad++; }
  }
  if (!netBad) add('network', 'network', 'ok', `${lines.length} failed requests / page errors${lines.length ? ' (all excepted)' : ''}`);

  return {
    rows,
    failed: rows.filter((r) => r.status === 'fail'),
    scroll: rows.filter((r) => r.status === 'scroll'),
    excepted: rows.filter((r) => r.status === 'except'),
  };
}

/** The report of one view as text lines: the failures first, then scroll / excepted, then the passed checks. */
export function formatMeasure(view, res) {
  const out = [`[${view}] failed: ${res.failed.length}  scroll: ${res.scroll.length}  excepted: ${res.excepted.length}  ok: ${res.rows.filter((r) => r.status === 'ok').length}`];
  for (const r of res.failed) out.push(`  FAIL ${r.check} · ${r.name}: ${r.what}`);
  for (const r of res.scroll) out.push(`  scroll ${r.check}: ${r.what}`);
  for (const r of res.excepted) out.push(`  except ${r.check}: ${r.what} — ${r.detail}`);
  for (const r of res.rows.filter((x) => x.status === 'ok')) out.push(`  ok ${r.check} · ${r.name}: ${r.what}`);
  return out;
}
