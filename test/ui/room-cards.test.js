// The waiting room after upstream 0.3.3 (screens/room.js): the 名片干员 seat cards (ui/seatArt.js — the pickable
// operators, the default by player id, the art fallback), their sync (ui/cardSync.js room.card), 协议启动！'s card layout
// (ui/protocolBoot.js), and a custom room's settings in the 快速匹配 confirmation (ui/matchQueue.js customFound).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const load = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const json = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

test('cardOperators: the visible non-自选 chess (golden form first) and this server\'s 自选 picks, 6★ first; never a hidden preset', async () => {
  const { cardOperators } = await load('public/js/ui/seatArt.js');
  const { LOCAL_DIY_PICKS } = await load('shared/local-diy.js');
  const chess = Object.values(json('data/chess.json').chess || json('data/chess.json'));
  const backups = json('data/backups.json');
  const list = cardOperators(chess, backups);
  const ids = list.map((c) => c.charId);
  assert.equal(new Set(ids).size, ids.length, 'one record per operator');
  for (const c of chess) {
    if (c.isDiy || typeof c.charId !== 'string') continue;
    const visibleTwin = chess.some((o) => o.charId === c.charId && o.visible !== false && !o.isDiy);
    assert.equal(ids.includes(c.charId), visibleTwin, `${c.charId} ${c.name}`);
  }
  // a golden record wins (its E2 art)
  const golden = chess.find((c) => c.isGolden && c.visible !== false && !c.isDiy);
  if (golden) assert.equal(list.find((c) => c.charId === golden.charId).isGolden, true);
  // the 自选 pool joins with the picks this server offers only, with their E2 art
  const picks = new Set(LOCAL_DIY_PICKS);
  for (const id of backups.diy.ownedPool) {
    if (chess.some((c) => c.charId === id && !c.isDiy)) continue;
    assert.equal(ids.includes(id), picks.has(id), id);
    if (picks.has(id)) assert.equal(list.find((c) => c.charId === id).assets.portrait, `${id}_2`);
  }
  for (let i = 1; i < list.length; i++) assert.ok((list[i - 1].rarity ?? 0) >= (list[i].rarity ?? 0), 'rarity order');
});

test('seatOperator: one\'s own card shows the local pick at once, another the server\'s; no pick → the same pool operator on every client', async () => {
  const { cardContext, seatOperator, hash32 } = await load('public/js/ui/seatArt.js');
  const list = [{ charId: 'a', chessId: 'c_a', rarity: 6 }, { charId: 'b', chessId: 'c_b', rarity: 5 }, { charId: 'c', chessId: 'c_c', rarity: 4 }, { charId: 'd', rarity: 6 }];
  const ctx = cardContext(list);
  assert.deepEqual(ctx.pool.map((c) => c.charId), ['a', 'b'], '5★/6★ chess records only, by charId');
  const seat = { playerId: 'p1', isBot: false, card: 'c' };
  assert.equal(seatOperator(seat, ctx, { myId: 'me' }).chess.charId, 'c');
  assert.equal(seatOperator(seat, ctx, { myId: 'p1', myCard: 'd' }).chess.charId, 'd', 'my own pick before the server has it');
  const none = { playerId: 'p2', isBot: false };
  const want = ctx.pool[hash32('p2') % ctx.pool.length].charId;
  assert.equal(seatOperator(none, ctx).chess.charId, want);
  assert.equal(seatOperator(none, cardContext([...list].reverse())).chess.charId, want, 'the list order does not change it');
  assert.equal(seatOperator({ playerId: 'x', card: 'zzz' }, cardContext(list, { pending: true })), null, 'an unknown pick waits for the 自选 data');
  assert.equal(seatOperator({ playerId: 'bot', isBot: true }, ctx), null);
  assert.equal(seatOperator(null, ctx), null);
});

test('seatArtSrc: the first picture not failed in this card, else none (the avatar frame)', async () => {
  const { seatArtSrc } = await load('public/js/ui/seatArt.js');
  assert.equal(seatArtSrc(['a.png', 'b.png']), 'a.png');
  assert.equal(seatArtSrc(['a.png', 'b.png'], ['a.png']), 'b.png');
  assert.equal(seatArtSrc([null, 'a.png'], ['a.png']), null);
});

test('seatPicture / seatIllust: the first picture not failed, a 立绘 with its RectTransform frame; no frame → no 立绘', async () => {
  const { seatPicture, seatIllust } = await load('public/js/ui/seatArt.js');
  const F = { x: -20.9, y: 96.5, w: 2143.4, h: 2143.4 };
  assert.deepEqual(seatPicture([null, { src: 'i.webp', frame: F }, { src: 'p.png' }]), { src: 'i.webp', frame: F });
  assert.deepEqual(seatPicture([{ src: 'i.webp', frame: F }, { src: 'p.png' }], ['i.webp']), { src: 'p.png', frame: null });
  assert.equal(seatPicture([{ src: 'p.png' }], ['p.png']), null);
  const local = { groups: { chararts: {
    char_1: { path: '/a/char_1.webp', w: 600, h: 1024, frame: { x: 1, y: 2, w: 3, h: 4 }, rect: F, full: { path: '/a/full/char_1.webp', w: 900, h: 1536 } },
    char_2: { path: '/a/char_2.webp', w: 600, h: 1024, frame: { x: 1, y: 2, w: 3, h: 4 } },
  } } };
  assert.deepEqual(seatIllust(local, { charId: 'char_1' }, false), { src: '/a/char_1.webp', frame: F });
  assert.deepEqual(seatIllust(local, { charId: 'char_1' }, true), { src: '/a/full/char_1.webp', frame: F }, '高清: the full copy');
  assert.equal(seatIllust(local, { charId: 'char_2' }, false), null, 'only the unit card\'s frame: the portrait instead (run chararts_extract.py)');
  assert.equal(seatIllust(null, { charId: 'char_1' }, false), null);
});

// the seat card's 立绘 placement (room.css .rseat__art img.is-rect) reproduces what the official settlement cards were
// measured to draw on the maintainer's 1920×1080 screenshot (docs/rules/ui.md 「명함 오퍼레이터」): in card units from
// the art box's centre (y down), the drawn texture's size and centre for two skin arts of this checkout's skin list
test('seat card 立绘 placement: room.css reproduces the measured official settlement cards', (t) => {
  const css = readFileSync(path.join(ROOT, 'public/css/screens/room.css'), 'utf8');
  const m = css.match(/\.rseat__art img\.is-rect \{ --k: calc\(([\d.]+) \* var\(--u\)\);[^}]*top: calc\(50% \+ ([\d.]+) \* var\(--u\)/);
  assert.ok(m, 'room.css .rseat__art img.is-rect changed shape: update this test with it');
  const [K, DY] = [+m[1], +m[2]];
  let skins;
  try { skins = json('public/assets/local/spine/skin/skins.json').skins; } catch { t.skip('no skin list in this checkout'); return; }
  const seen = [
    // skin key, drawn texture size (card units), its centre from the box's centre (x, y down)
    ['char_1041_angel2@iteration#6', 1570.8, -16.3, -29.6],
    ['char_213_mostma@ambienceSynesthesia#6', 1399.2, -2.4, -1.9],
  ];
  let ran = 0;
  for (const [key, size, cx, cy] of seen) {
    const r = skins[key]?.illust?.rect;
    if (!r) continue;
    ran++;
    const why = `${key}: the seat card draws the 立绘 by its RectTransform at the measured scale and centre (docs/rules/ui.md 「명함 오퍼레이터」)`;
    assert.ok(Math.abs(r.w * K / size - 1) < 0.012, `${why}: size ${r.w * K} vs ${size}`);
    assert.ok(Math.abs(r.x * K - cx) < 2.5 && Math.abs(DY - r.y * K - cy) < 2.5, `${why}: centre (${r.x * K}, ${DY - r.y * K}) vs (${cx}, ${cy})`);
  }
  if (!ran) t.skip('the skin list has no RectTransform frames: run tools/local-extract/skin_extract.py --only art');
});

test('installCardSync: room.card after a welcome and after a pick, again on RATE, not again for the same pick', async () => {
  const { createStore } = await load('public/js/store.js');
  const { installCardSync } = await load('public/js/ui/cardSync.js');
  const target = createStore({ card: 'char_a', cardSync: 'idle' });
  const handlers = {};
  const sent = [];
  let refuse = null;
  const net = {
    status: 'online',
    on: (k, fn) => { handlers[k] = fn; return () => { delete handlers[k]; }; },
    request: async (type, body) => { sent.push([type, body.charId]); if (refuse) { const e = Object.assign(new Error(refuse), { code: refuse }); refuse = null; throw e; } return { t: 'ok' }; },
  };
  const timers = [];
  const T = { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {} };
  const run = async () => { while (timers.length) { const { fn } = timers.shift(); fn(); await new Promise((r) => setImmediate(r)); } };
  const sync = installCardSync({ net, target, timers: T });
  handlers.welcome();
  await run();
  assert.deepEqual(sent, [['room.card', 'char_a']]);
  assert.equal(target.get().cardSync, 'synced');
  target.set({ card: 'char_b' });
  refuse = 'RATE';
  await run();
  assert.deepEqual(sent.slice(1), [['room.card', 'char_b'], ['room.card', 'char_b']], 'tried again after RATE');
  target.set({ card: 'char_b', cardSync: 'synced' });
  await run();
  assert.equal(sent.length, 3, 'the same pick is not sent again');
  handlers.welcome();
  await run();
  assert.deepEqual(sent.at(-1), ['room.card', 'char_b'], 'a new session gets it again');
  sync.dispose();
});

test('bootLayout: a solo card under the ring, pairs left / right with a line into the ship, up to eight cards inside the stage', async () => {
  const { bootLayout } = await load('public/js/ui/protocolBoot.js');
  assert.deepEqual(bootLayout(1), [{ x: 703, y: 645, side: 'c' }]);
  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    const spots = bootLayout(n);
    assert.equal(spots.length, n);
    spots.forEach((s, i) => {
      assert.equal(s.side, i % 2 ? 'r' : 'l');
      assert.ok(s.from && s.to, 'a line');
      assert.ok(s.y >= 150 && s.y + 127 <= 1080, `card ${i + 1} of ${n} on the stage (y ${s.y})`);
    });
  }
  assert.equal(bootLayout(12).length, 8);
});

test('customFound: a custom room\'s settings in the confirmation — the count of differences and the summary lines', async () => {
  const { data } = await load('public/js/data.js');
  const { customFound } = await load('public/js/ui/matchQueue.js');
  const { CUSTOM_OFFICIAL } = await load('shared/ruleset.js');
  void data;
  const same = customFound(structuredClone(CUSTOM_OFFICIAL), 'NORMAL', 4);
  assert.equal(same.n, 0);
  const changed = structuredClone(CUSTOM_OFFICIAL);
  changed.flow.rounds = 10;
  const r = customFound(changed, 'NORMAL', 4);
  assert.ok(r.n >= 1, 'the round count differs');
  assert.ok(r.lines.length >= 1 && r.lines.every((l) => typeof l === 'string' && l));
});
