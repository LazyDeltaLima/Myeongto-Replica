// tools/ui-check measure: the judging half (no browser) — spec validation, clipped text (own box, clipping ancestor,
// scrolling list, exceptions), sibling cells against a reference, centres, padding symmetry, filled data cells,
// broken images, failed requests, and the `min` that keeps an empty selector from passing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMeasure, pagePlan, judge, cutBy, formatMeasure } from '../tools/ui-check/measure.mjs';

const spec = (measure, ours = { url: '/x.html' }) => ({ ours, measure });
const R = (x, y, w, h) => ({ x, y, w, h });
const raw = (over = {}) => ({ viewport: [1600, 900], text: [], heights: [], centres: [], padding: [], filled: [], images: [], ...over });
const statuses = (res, check) => res.rows.filter((r) => r.check === check).map((r) => r.status);
const textEl = (o = {}) => ({
  label: 'span.nm "Doctor"', text: 'Doctor', except: -1, textRect: R(10, 10, 50, 14), inline: false, textOverflow: 'clip',
  self: { rect: R(10, 10, 50, 14), clientLeft: 0, clientTop: 0, clientWidth: 50, clientHeight: 14 },
  client: [50, 14], scroll: [50, 14], ox: 'visible', oy: 'visible', clips: [], ...o,
});

test('ui-check measure: views default to ours, a spec that checks nothing or names an unknown check stops', () => {
  const ms = resolveMeasure(spec({ roots: ['.d'] }, { url: '/x', viewport: [1600, 900] }), '/s');
  assert.deepEqual(ms.views.map((v) => [v.name, v.ours.viewport, v.ours.url]), [['screen', [1600, 900], '/x']]);
  assert.equal(ms.tol, 1);
  const two = resolveMeasure(spec({ roots: ['.d'], views: [{ name: 'desk', viewport: [1600, 900] }, { name: 'phone', viewport: [844, 390], touch: true }] }), '/s',
    { row: { canvas: { screen: [1920, 1080] } } });
  assert.deepEqual(two.views.map((v) => [v.name, v.ours.viewport, !!v.ours.touch]), [['desk', [1600, 900], false], ['phone', [844, 390], true]]);
  assert.deepEqual(resolveMeasure(spec({ roots: ['.d'] }), '/s', { row: { canvas: { screen: [1920.4, 1080] } } }).views[0].ours.viewport, [1920, 1080]);
  assert.throws(() => resolveMeasure(spec({}), '/s'), /checks nothing/);
  assert.throws(() => resolveMeasure({ ours: { url: '/x' } }, '/s'), /no "measure"/);
  assert.throws(() => resolveMeasure(spec({ roots: ['.d'], hieghts: [] }), '/s'), /unknown key "hieghts"/);
  assert.throws(() => resolveMeasure(spec({ roots: ['.d'], text: { except: [{ sel: '.a' }] } }), '/s'), /needs a why/);
  assert.throws(() => resolveMeasure(spec({ roots: ['.d'], network: { except: [{ match: '(' , why: 'x' }] } }), '/s'), /not a regular expression/);
  assert.throws(() => resolveMeasure(spec({ heights: [{ ref: { global: '.a' }, cells: ['.b'] }] }), '/s'), /needs each/);
  assert.throws(() => resolveMeasure(spec({ heights: [{ ref: '.a', cells: ['.b'], edges: 'hq' }] }), '/s'), /edges "hq"/);
  assert.throws(() => resolveMeasure(spec({ filled: [{ sel: '.a' }] }), '/s'), /checks nothing/);
  assert.throws(() => resolveMeasure(spec({ roots: ['.d'], views: [{ name: 'a b' }] }), '/s'), /needs a name/);
  const plan = pagePlan(resolveMeasure(spec({ roots: ['.d'], text: { except: [{ sel: '.list', why: 'scrolls' }] }, centres: [{ sel: '.c', parent: '.p' }] }), '/s'));
  assert.deepEqual([plan.textExcept, plan.centres], [['.list'], [{ sel: '.c', parent: '.p' }]]);
});

test('ui-check measure: clipped text — its own box, a clipping ancestor, a scrolling list, an exception', () => {
  const ms = resolveMeasure(spec({ roots: ['.d'], text: { except: [{ sel: '.legacy', why: 'known, ui-O line' }] } }), '/s');
  const clip = (ox, oy, rect = R(0, 0, 40, 40)) => ({ label: 'div.list', rect, clientLeft: 0, clientTop: 0, clientWidth: rect.w, clientHeight: rect.h, ox, oy });
  const res = judge(ms, raw({
    text: [
      textEl(),                                                                                     // fits
      textEl({ label: 'a', textOverflow: 'ellipsis', ox: 'hidden', client: [30, 14], scroll: [52, 14], self: { rect: R(10, 10, 30, 14), clientLeft: 0, clientTop: 0, clientWidth: 30, clientHeight: 14 } }), // ellipsis
      textEl({ label: 'b', client: [50, 14], scroll: [80, 14] }),                                   // a child sticks out, the text fits: not text
      textEl({ label: 'c', clips: [clip('hidden', 'hidden')] }),                                    // cut 20px by a hidden ancestor
      textEl({ label: 'd', clips: [clip('auto', 'hidden')] }),                                      // cut along x only, the list scrolls x
      textEl({ label: 'e', textRect: R(10, 30, 20, 14), clips: [clip('auto', 'hidden')] }),         // cut along y: the list does not scroll y
      textEl({ label: 'f', except: 0, clips: [clip('hidden', 'hidden')] }),
      textEl({ label: 'g', textRect: R(10, 10, 31, 14), clips: [clip('hidden', 'hidden')] }),        // 1px over: within tol
    ],
  }));
  const by = Object.fromEntries(res.rows.filter((r) => r.check === 'text' && r.status !== 'ok').map((r) => [r.what.split(':')[0], r.status]));
  assert.deepEqual(by, { a: 'fail', c: 'fail', d: 'scroll', e: 'fail', f: 'except' });
  assert.match(res.rows.find((r) => r.what.startsWith('a:')).what, /22px x by its own box/);
  assert.equal(res.excepted[0].detail, 'known, ui-O line');
  assert.deepEqual(statuses(judge(ms, raw()), 'text'), ['fail'], 'roots with no text measured nothing — a failure, not a pass');
  assert.deepEqual(cutBy(R(-3, 5, 10, 50), { rect: R(0, 0, 40, 40), clientLeft: 0, clientTop: 0, clientWidth: 40, clientHeight: 40 }), { x: 3, y: 15 });
});

test('ui-check measure: sibling cells against the reference cell, ±tol on the asked edges', () => {
  const ms = resolveMeasure(spec({ heights: [{ name: 'cards', each: '.row', ref: { global: '.av' }, cells: ['.card', '.ops'], edges: 'htb', min: 4 }] }), '/s');
  const scope = (cards, ops) => ({ scope: 'div.row', ref: { label: 'av', rect: R(0, 100, 94, 94) }, cells: [{ sel: '.card', els: cards }, { sel: '.ops', els: ops }] });
  const ok = judge(ms, raw({ heights: [[scope([{ label: 'card', rect: R(100, 100, 300, 94) }], [{ label: 'ops', rect: R(400, 100.6, 300, 94.4) }]),
    scope([{ label: 'card', rect: R(100, 100, 300, 95) }], [{ label: 'ops', rect: R(400, 99, 300, 95) }])]] }));
  assert.deepEqual(statuses(ok, 'heights'), ['ok']);
  const bad = judge(ms, raw({ heights: [[scope([{ label: 'card', rect: R(100, 102, 300, 94) }], [{ label: 'ops', rect: R(400, 100, 300, 95.6) }]),
    scope([], [{ label: 'ops', rect: R(400, 100, 300, 94) }])]] }));
  const what = bad.failed.map((r) => r.what);
  assert.ok(what.some((w) => /card vs av top \+2 bottom \+2/.test(w)), what.join('\n'));
  assert.ok(what.some((w) => /ops vs av height \+1.6 bottom \+1.6/.test(w)), what.join('\n'));
  assert.ok(what.some((w) => /no visible \.card/.test(w)), what.join('\n'));
  const few = judge(ms, raw({ heights: [[scope([{ label: 'card', rect: R(100, 100, 300, 94) }], [])]] }));
  assert.ok(few.failed.some((r) => /measured 1 cells, the spec wants at least 4/.test(r.what)));
  assert.ok(judge(ms, raw({ heights: [[{ scope: 'div.row', ref: null, cells: [] }]] })).failed.some((r) => /no reference cell/.test(r.what)));
});

test('ui-check measure: centres on the asked axes, and min keeps an empty selector from passing', () => {
  const ms = resolveMeasure(spec({ centres: [{ name: 'img', sel: '.img', parent: '.band' }, { name: 'eq', sel: '.eq', axes: 'x' }, { name: 'none', sel: '.none', min: 0 }] }), '/s');
  const parent = { label: 'band', rect: R(0, 0, 100, 100) };
  const res = judge(ms, raw({ centres: [
    [{ label: 'img', rect: R(17, 17.4, 66, 66), parent }, { label: 'img2', rect: R(20, 17, 66, 66), parent }, { label: 'img3', rect: R(17, 17, 66, 66), parent: null }],
    [{ label: 'eq', rect: R(30, 80, 40, 10), parent }],
    [],
  ] }));
  assert.deepEqual(res.failed.map((r) => r.what), ['img2 in band: centre off x 3', 'img3: no parent .band']);
  assert.deepEqual(statuses(res, 'centres'), ['fail', 'fail', 'ok', 'ok'], 'eq is off in y only, which it does not check; none wants 0');
  const empty = judge(ms, raw({ centres: [[], [], []] }));
  assert.ok(empty.failed.some((r) => /measured 0 elements of \.img, the spec wants at least 1/.test(r.what)));
});

test('ui-check measure: padding — the content as far from the left edge as from the right', () => {
  const ms = resolveMeasure(spec({ padding: [{ name: 'bar', sel: '.bar' }, { name: 'pill', sel: '.pill', axes: 'xy' }] }), '/s');
  const res = judge(ms, raw({ padding: [
    [{ label: 'bar', padBox: R(0, 0, 100, 20), inner: R(10, 0, 80.8, 14) }, { label: 'bar2', padBox: R(0, 0, 100, 20), inner: R(9, 2, 80, 16) }],
    [{ label: 'pill', padBox: R(0, 0, 60, 20), inner: R(5, 2, 50, 14) }, { label: 'pill2', padBox: R(0, 0, 60, 20), inner: null }],
  ] }));
  assert.deepEqual(res.failed.map((r) => r.what), ['bar2: left 9 right 11', 'pill: top 2 bottom 4', 'pill2: nothing inside to measure']);
});

test('ui-check measure: filled data cells — count, text, pattern, art that loads', () => {
  const ms = resolveMeasure(spec({ filled: [
    { name: 'tag', sel: '.tag', text: '^#\\d{4}$', min: 2 },
    { name: 'name', sel: '.nm', text: true },
    { name: 'portrait', sel: '.av', each: '.row', art: true },
  ] }), '/s');
  const images = [{ url: '/a.png', ok: true, users: [] }, { url: '/gone.png', ok: false, why: 'does not load as an image', users: ['i.av'] }];
  const res = judge(ms, raw({ images, filled: [
    [{ scope: null, items: [{ label: 'tag', text: '#1274', urls: [] }, { label: 'tag2', text: '#12', urls: [] }] }],
    [{ scope: null, items: [{ label: 'nm', text: '', urls: [] }] }],
    [{ scope: 'row', items: [{ label: 'av', text: '', urls: ['/a.png'] }] }, { scope: 'row', items: [{ label: 'av', text: '', urls: ['/gone.png'] }, { label: 'av2', text: '', urls: [] }] }, { scope: 'row', items: [] }],
  ] }));
  assert.deepEqual(res.failed.filter((r) => r.check === 'filled').map((r) => r.what), [
    'tag2: "#12" does not match /^#\\d{4}$/',
    'nm: empty',
    'row #1: av: image /gone.png does not load',
    'row #1: av2: shows no image',
    'row #2: 0 of .av, the spec wants at least 1',
  ]);
});

test('ui-check measure: broken images under the roots and failed requests / page errors fail unless excepted', () => {
  const ms = resolveMeasure(spec({ roots: ['.d'], network: { except: [{ match: 'favicon', why: 'the mock page has none' }] } }), '/s');
  const res = judge(ms, raw({ text: [textEl()], images: [{ url: '/x.png', ok: true, users: [] }, { url: 'http://h/', ok: false, why: 'empty url', users: ['i.shop'] }] }),
    { requests: ['404 http://h/favicon.ico', '404 http://h/assets/a.png'], errors: ['TypeError: x is undefined'] });
  assert.deepEqual(res.failed.map((r) => [r.check, r.what.slice(0, 30)]), [
    ['images', 'http://h/ — empty url (i.shop)'], ['network', '404 http://h/assets/a.png'], ['network', 'TypeError: x is undefined'],
  ]);
  assert.equal(res.excepted[0].detail, 'the mock page has none');
  const text = formatMeasure('desk', res).join('\n');
  assert.match(text, /^\[desk\] failed: 3 {2}scroll: 0 {2}excepted: 1 {2}ok: 1/);
  assert.match(text, /FAIL network · page error: TypeError/);
});
