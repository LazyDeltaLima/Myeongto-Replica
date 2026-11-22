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

const seasonData = (dir) => ({ chess: json(`${dir}chess.json`).chess || json(`${dir}chess.json`), backups: json(`${dir}backups.json`) });
const A2 = 'act2autochess', A3 = 'act3autochess';

test('buildCards: every season\'s visible non-自选 chess (golden form first) and this server\'s 自选 picks; never a hidden preset', async () => {
  const { buildCards } = await load('shared/cardOperators.js');
  const { LOCAL_DIY_PICKS } = await load('shared/local-diy.js');
  const d2 = seasonData('data/'), d3 = seasonData('data/seasons/act3autochess/');
  const { operators } = buildCards([[A2, d2], [A3, d3]]);
  const by = new Map(operators.map((o) => [o.charId, o]));
  assert.equal(by.size, operators.length, 'one record per operator');
  const picks = new Set(LOCAL_DIY_PICKS);
  for (const [season, d] of [[A2, d2], [A3, d3]]) {
    const chess = Object.values(d.chess);
    for (const c of chess) {
      if (c.isDiy || typeof c.charId !== 'string') continue;
      const visible = chess.some((o) => o.charId === c.charId && o.visible !== false && !o.isDiy);
      assert.equal(!!by.get(c.charId)?.seasons.includes(season), visible, `${season} ${c.charId} ${c.name}`);
      if (visible) assert.equal(by.get(c.charId).pool.includes(season), (c.rarity ?? 0) >= 5, `${season} ${c.charId}: the default pool is its 5★ / 6★`);
    }
    for (const id of d.backups.diy.ownedPool) {
      if (chess.some((c) => c.charId === id && !c.isDiy)) continue;
      assert.equal(!!by.get(id)?.seasons.includes(season), picks.has(id), `${season} pick ${id}`);
      if (picks.has(id)) assert.equal(by.get(id).assets.portrait, `${id}_2`, 'a 自选 pick draws its E2 art');
    }
  }
  const golden = Object.values(d2.chess).find((c) => c.isGolden && c.visible !== false && !c.isDiy);
  assert.equal(by.get(golden.charId).assets.portrait, golden.assets.portrait, 'the golden form\'s art');
  assert.ok(operators.some((o) => o.seasons.length === 1 && o.seasons[0] === A3), '规程 has operators 盟约 lacks');
});

// the CARD_EXTRA_OPERATORS records as data/cards.json holds them (build-data reads them from character_table, which a
// checkout may lack): their season-made fields are rebuilt by buildCards and checked by the next tests
const fileExtras = async () => {
  const { CARD_EXTRA_OPERATORS } = await load('shared/cardOperators.js');
  return json('data/cards.json').operators.filter((o) => CARD_EXTRA_OPERATORS.includes(o.charId))
    .map(({ seasons, pool, ...rec }) => rec);
};

test('data/cards.json is what build-data writes from the current data (rebuild: node tools/build-data.mjs --offline)', async () => {
  const { buildCards } = await load('shared/cardOperators.js');
  assert.deepEqual(json('data/cards.json'), buildCards([[A2, seasonData('data/')], [A3, seasonData('data/seasons/act3autochess/')]], await fileExtras()),
    'data/cards.json is stale: tools/build-data.mjs writeCards (docs/DATA.md §19) rebuilds it');
});

test('CARD_EXTRA_OPERATORS: listed for every season, never in the default pool, drawn with the E0 art; a season that fields one keeps its own record', async () => {
  const { buildCards, cardExtra, CARD_EXTRA_OPERATORS } = await load('shared/cardOperators.js');
  const ops = json('data/cards.json').operators;
  assert.ok(CARD_EXTRA_OPERATORS.length, 'the list is not empty (else this test is moot)');
  for (const id of CARD_EXTRA_OPERATORS) {
    const o = ops.find((c) => c.charId === id);
    assert.ok(o, `${id}: in data/cards.json (shared/cardOperators.js CARD_EXTRA_OPERATORS; rebuild: node tools/build-data.mjs --offline)`);
    assert.deepEqual(o.seasons, [A2, A3]);
    assert.deepEqual(o.pool, [], `${id}: only a player's pick shows it`);
    assert.equal(o.assets.portrait, id);
    assert.ok(o.name && o.rarity >= 1);
  }
  const extra = cardExtra('char_x', { name: '某人', appellation: 'Someone', rarity: 'TIER_1' });
  assert.deepEqual(extra, { charId: 'char_x', name: '某人', appellation: 'Someone', rarity: 1, assets: { avatar: 'char_x', portrait: 'char_x' } });
  assert.throws(() => cardExtra('char_y', undefined), /not in character_table/);
  const fielded = { chess: { c1: { charId: 'char_x', name: '某人', rarity: 6, isGolden: true, assets: { avatar: 'char_x_2', portrait: 'char_x_2' } } }, backups: {} };
  const both = buildCards([[A2, { chess: {}, backups: {} }], [A3, fielded]], [extra]).operators;
  assert.deepEqual(both, [{ ...fielded.chess.c1, appellation: null, seasons: [A3], pool: [A3] }].map(({ isGolden, ...r }) => r),
    'the fielding season\'s record, not the extra');
});

test('cardOperators + cardContext: the offered seasons\' operators to pick, localized; the default drawn from the room\'s season alone', async () => {
  const { cardOperators, cardContext, seatOperator, hash32 } = await load('public/js/ui/seatArt.js');
  const file = json('data/cards.json');
  const only3 = file.operators.find((o) => o.seasons.length === 1 && o.seasons[0] === A3);
  const one = cardOperators(file, { seasons: [A2] });
  const both = cardOperators(file, { seasons: [A2, A3], localeName: (zh) => `ko:${zh}` });
  assert.ok(!one.some((c) => c.charId === only3.charId), 'a season the server does not offer adds none');
  assert.equal(both.length, file.operators.length);
  assert.equal(both.find((c) => c.charId === only3.charId).name, `ko:${only3.name}`, 'named in the locale');
  for (let i = 1; i < both.length; i++) assert.ok((both[i - 1].rarity ?? 0) >= (both[i].rarity ?? 0), 'rarity order');
  const ctx = cardContext(both, { season: A2 });
  assert.deepEqual(ctx.pool.map((c) => c.charId), cardContext(one, { season: A2 }).pool.map((c) => c.charId),
    'the default pool is the room\'s season\'s, whatever other seasons are offered');
  assert.ok(ctx.pool.length > 10 && ctx.pool.every((c) => c.pool.includes(A2) && c.rarity >= 5));
  assert.equal(seatOperator({ playerId: 'p', card: only3.charId }, ctx).chess.charId, only3.charId, 'another season\'s pick is drawn');
  assert.equal(seatOperator({ playerId: 'p2' }, ctx).chess, ctx.pool[hash32('p2') % ctx.pool.length]);
  assert.equal(seatOperator({ playerId: 'p', card: only3.charId }, cardContext([], { pending: true })), null, 'a pick waits for the file');
});

test('seatOperator: one\'s own card shows the local pick at once, another the server\'s; no pick → the same pool operator on every client', async () => {
  const { cardContext, seatOperator, hash32 } = await load('public/js/ui/seatArt.js');
  const list = [{ charId: 'b', rarity: 5, pool: ['s'] }, { charId: 'a', rarity: 6, pool: ['s'] }, { charId: 'c', rarity: 4, pool: [] }, { charId: 'd', rarity: 6, pool: ['t'] }];
  const ctx = cardContext(list, { season: 's' });
  assert.deepEqual(ctx.pool.map((c) => c.charId), ['a', 'b'], 'the room\'s season\'s pool only, by charId');
  const seat = { playerId: 'p1', isBot: false, card: 'c' };
  assert.equal(seatOperator(seat, ctx, { myId: 'me' }).chess.charId, 'c');
  assert.equal(seatOperator(seat, ctx, { myId: 'p1', myCard: 'd' }).chess.charId, 'd', 'my own pick before the server has it');
  const none = { playerId: 'p2', isBot: false };
  const want = ctx.pool[hash32('p2') % ctx.pool.length].charId;
  assert.equal(seatOperator(none, ctx).chess.charId, want);
  assert.equal(seatOperator(none, cardContext([...list].reverse(), { season: 's' })).chess.charId, want, 'the list order does not change it');
  assert.equal(seatOperator({ playerId: 'x', card: 'zzz' }, cardContext(list, { pending: true, season: 's' })), null, 'an unknown pick waits for the data');
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

test('customFound: the public list names a 规程 room\'s bonds and leaders from that season\'s files, not by their ids', async () => {
  const { existsSync } = await import('node:fs');
  const { data } = await load('public/js/data.js');
  const { customFound, customStore, CUSTOM_NAME_FILES } = await load('public/js/ui/matchQueue.js');
  const SEASON = 'act3autochess';
  // the browser's /data/<file> and /data/s/<season>/<file> (the server answers the season's own file, else the default's)
  const fileOf = (url) => {
    const m = /^\/data\/(?:s\/([^/]+)\/)?([a-z-]+\.json)$/.exec(url);
    if (!m) return null;
    const own = path.join(ROOT, m[1] ? `data/seasons/${m[1]}/${m[2]}` : `data/${m[2]}`);
    const p = existsSync(own) ? own : path.join(ROOT, `data/${m[2]}`);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  };
  const saved = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const body = fileOf(String(url));
    return body == null ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => JSON.parse(body) };
  };
  try {
    // 精准 (preciShip) is in both seasons; 假想敌：鳍 (boss_16, a 隐秘核心 leader) only in 规程's
    const custom = { bonds: { pick: { preciShip: 'allow' } }, bosses: { ban: ['boss_16'] } };
    const st = customStore(SEASON);
    assert.ok(st !== data, 'a room of another season reads that season\'s store');
    await Promise.all([st.loadAll(...CUSTOM_NAME_FILES), data.loadAll(...CUSTOM_NAME_FILES)]);
    const room = customFound(custom, 'NORMAL', 4, SEASON).items;
    const text = room.map((l) => l.text).join('\n');
    assert.ok(!/preciShip|boss_16/.test(text), `names, not ids (the summary must read the room's season's files: docs/rules/ui.md 「공개방」 커스텀 요약의 이름):\n${text}`);
    assert.ok(text.includes(st.lookup('bonds', 'preciShip').name) && text.includes(st.lookup('bosses', 'boss_16').name), text);
    assert.ok(room.some((l) => l.key === 'bosses.ban.hidden'), 'boss_16 is banned as a 隐秘核心 leader');
    // the page's own (默认赛季) files lack the 规程 leader: what the list showed before it read the room's season
    const page = customFound(custom, 'NORMAL', 4).items.map((l) => l.text).join('\n');
    assert.ok(page.includes('boss_16'), 'the default season has no boss_16 (else this test no longer tells the seasons apart)');
  } finally {
    globalThis.fetch = saved;
  }
});
