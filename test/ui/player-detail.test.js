// The 队员信息 dialog's client half (ui/playerDetail.js, ui/teamPanel.js; docs/rules/ui.md 「팀원 정보 창」): an avatar
// tap opens the dialog instead of watching, 前往查看 moved onto the avatar inside it, one row per player at the list's
// rows, the lit bonds only, NOINFO for an empty list, the name's #number, the cards as tall as the list avatar, the
// field's equipment bar, the official 前往观战 frame over the whole avatar. The server half (m.public players[].lineup) is
// test/match/player-detail.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const { PlayerDetail, detailBonds, detailLineup, nameTags, goFrameStyle, CARD_H } = await import('../../public/js/ui/playerDetail.js');

function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  if (typeof v.type === 'function' && /^(Operators|Bonds|NoInfo)$/.test(v.type.name)) yield* walk(v.type(v.props));
  yield* walk(v.props?.children);
}
const hasClass = (v, c) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(c);

test('the dialog lists the lit bonds only (the official NOINFO of a teammate with none) and well-formed operators', () => {
  const bonds = [
    { bondId: 'a', active: true, layers: 3, count: 2 },
    { bondId: 'b', active: false, layers: 9, count: 1 },
    { bondId: 'c', active: true, off: true, count: 2 },
    { bondId: 'd', active: true, layers: 7, count: 3 },
  ];
  assert.deepEqual(detailBonds(bonds).map((b) => b.bondId), ['d', 'a'], 'lit, not mode-off, by layers');
  assert.deepEqual(detailBonds(null), []);
  assert.deepEqual(detailLineup([{ char: 'char_1' }, null, { tier: 3 }, { char: '' }]).map((u) => u.char), ['char_1']);
});

test('one row per player at the measured places; an eliminated player is covered, the own row marked', () => {
  const players = [
    { playerId: 'p_0', name: 'A', alive: true, shopLevel: 3, bonds: [], lineup: [] },
    { playerId: 'p_1', name: 'B', alive: false, shopLevel: 9, winStreak: 4, bonds: [{ bondId: 'x', active: true, layers: 2 }],
      lineup: [{ char: 'char_x', tier: 6, golden: true, equip: [0, 1] }, { char: 'char_y', tier: 5, equip: [1, 0, 0], slots: 4 }] },
  ];
  const geo = { left: -8, top: -10, width: 900, height: 200, k: 1,
    rows: [{ top: -10, height: 100, hole: 98, at: 10, ah: 80 }, { top: 90, height: 100, hole: 98, at: 10, ah: 80 }] };
  const v = PlayerDetail({ players, myId: 'p_0', geo });
  assert.ok(hasClass(v, 'pdetail'));
  const rows = [...walk(v)].filter((n) => hasClass(n, 'pdetail__row'));
  assert.equal(rows.length, 2);
  assert.ok(hasClass(rows[0], 'is-self') && !hasClass(rows[0], 'is-dead'));
  assert.ok(hasClass(rows[1], 'is-dead'));
  assert.match(rows[1].props.style, /top:100px;height:100px/, 'rows touch: each at its own measured top, the list row plus the gap');
  assert.match(rows[1].props.style, /--at:10px;--ah:80px/, 'the cards level with the list avatar and as tall (docs/rules/ui.md 「팀원 정보 창」)');
  const tag = [...walk(rows[1])].find((n) => hasClass(n, 'pdetail__tag'));
  assert.ok(tag && /^#\d{4}$/.test([tag.props.children].flat().join('')), 'the name card carries the #number');
  const bars = [...walk(rows[1])].filter((n) => hasClass(n, 'pdetail__eq'));
  assert.equal(bars.length, 1, "the field's equipment bar on the two-slot operator, none past two slots (as on the field)");
  const pills = [...walk(bars[0])].filter((n) => n.type === 'i');
  assert.deepEqual(pills.map((n) => n.props.class), ['is-l', 'is-r is-gold'], 'a pill per item, the golden item gold');
  assert.ok([...walk(rows[1])].some((n) => hasClass(n, 'pdetail__combo')), '完美连胜 n on the name card');
  assert.ok(![...walk(rows[0])].some((n) => hasClass(n, 'pdetail__combo')), 'none without a streak');
  const lvl = [...walk(rows[1])].find((n) => hasClass(n, 'pdetail__shop'));
  assert.ok(lvl, 'the shop level');
});

test('wiring: an avatar tap toggles the dialog (no watch), 前往查看 is the dialog tag, the stylesheet is linked', () => {
  const panel = read('public/js/ui/teamPanel.js');
  const at = panel.indexOf('<button type="button" class="team__btn"');
  const btn = panel.slice(at, panel.indexOf('</button>', at));
  assert.match(btn, /onClick=\$\{\(\) => setDetail\(\(d\) => !d\)\}/, 'the avatar opens / closes the dialog');
  assert.doesNotMatch(btn, /onWatch/, 'the avatar no longer watches');
  assert.match(panel, /class="team__ob pdetail__go"[^\n]*\n[^\n]*onClick=\$\{\(\) => go\(p\)\}/, '前往查看 on the avatar while the dialog is open');
  assert.match(panel, /<\$\{PlayerDetail\} players=\$\{players\}/);
  assert.match(read('public/index.html'), /<link rel="stylesheet" href="\/css\/player-detail\.css" \/>/);
  assert.match(read('public/css/player-detail.css'), /\.gm__side\.has-pdetail \{ z-index: 19; \}/, 'above the HUD panels while open');
});

test('the #number: four digits from the player id, the same on every call, a clash moved on', () => {
  const players = [{ playerId: 'p_0a1b2c3d4e' }, { playerId: 'ai_1234abcd' }, { playerId: 'p_ffeeddccbb' }];
  const a = nameTags(players), b = nameTags(players.slice().reverse());
  for (const p of players) {
    assert.match(a.get(p.playerId), /^\d{4}$/);
    assert.equal(a.get(p.playerId), b.get(p.playerId), 'the order of the list does not change it');
  }
  const twice = nameTags([{ playerId: 'x' }, { playerId: 'x' }]);
  assert.equal(twice.size, 1);
  const tags = nameTags(Array.from({ length: 200 }, (_, i) => ({ playerId: `p_${i}` })));
  assert.equal(new Set(tags.values()).size, 200, 'no two players of a list share a number');
});

test('前往查看: the official frame over the whole avatar (93 × 84.6 over the 72 avatar, 4 above its centre)', () => {
  const st = goFrameStyle({ x: 0, y: 0, w: 72, h: 72 });
  assert.match(st, /left:-10\.5px;top:-10\.3px;width:93px;height:84\.6px;--a:1px;/);
  const css = read('public/css/player-detail.css');
  assert.match(css, /\.pdetail__gobar \{[^}]*width: calc\(72 \* var\(--a\)\)/, 'the caption band spans the avatar width');
  const panel = read('public/js/ui/teamPanel.js');
  assert.match(panel, /class="team__ob pdetail__go" style=\$\{goFrameStyle\(av\)\}/, 'the button is the frame over the avatar');
});

test('white sprites the client tints are masks, never backgrounds (drawn as is they show white plates)', () => {
  // detail_list_back (#2f2f2f 60 %), char_avatar_frame, btn_ob_other: white in the bundle, coloured by the Image — maintainer
  // report 2026-11-19 「배경이 흰색으로 깨진듯이」; docs/rules/ui.md 「팀원 정보 창」
  const css = read('public/css/player-detail.css');
  for (const v of ['--pd-list', '--pd-frame', '--pd-ob']) {
    const uses = [...css.matchAll(new RegExp(`([a-z-]+):\\s*var\\(${v}\\b`, 'g'))].map((m) => m[1]);
    assert.ok(uses.length, `${v} is used`);
    assert.deepEqual([...new Set(uses)].filter((p) => !/mask$/.test(p)), [], `${v} only as a mask (the white sprite is tinted by its colour)`);
  }
  assert.match(css, /\.pdetail__card \{[^}]*height: var\(--ah\)/);
  assert.match(css, /\.pdetail__part \{[^}]*height: var\(--ah\)/);
  assert.equal(CARD_H, 78);
});
