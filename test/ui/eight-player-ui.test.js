// The 8-player mode on the client (maintainer decisions 2026-10-16, 2026-10-19; server and numbers: test/eight-player.test.js):
// the lobby's 人数 switch and its room.create / room.queue fields, the 8-seat room's seats and start rule, the queue
// dialog's counts, the eight seat colours and result-chart colours, the folded progress list, and the sources that mark
// the 8-row player list, the 12-card 机变 grid and the 4 + 4 Final Assault opening.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const EN = JSON.parse(read('public/i18n/en.json'));
const KO = JSON.parse(read('public/i18n/ko.json'));

const seat = (i, o = {}) => ({ seat: i, playerId: `p${i}`, name: `P${i}`, isBot: false, ready: true, connected: true, ...o });
const room8 = (n, o = {}) => ({
  code: 'ABCD', hostId: 'p0', mode: 'coop', size: 8, difficulty: 'HARD',
  seats: Array.from({ length: 8 }, (_, i) => (i < n ? seat(i) : null)), ...o,
});

test('lobby: room.create / room.queue carry size 8 only for an 8-seat alliance (never solo)', async () => {
  const { sizeFields } = await load('public/js/screens/lobby.js');
  assert.deepEqual(sizeFields('coop', 8), { size: 8 });
  assert.deepEqual(sizeFields('match', 8), { size: 8 });
  assert.deepEqual(sizeFields('solo', 8), {}, 'a solo room is never an 8-seat one');
  assert.deepEqual(sizeFields('coop', 4), {});
  const src = read('public/js/screens/lobby.js');
  assert.match(src, /\.\.\.sizeFields\(roomMode, big \? LARGE_SEATS : MAX_SEATS\)/);
  assert.match(src, /const big = roomMode !== 'solo' && size === LARGE_SEATS;/); // every season, 规程 too (2026-11-16)
  assert.match(src, /joinQueue\(difficulty, queueRuleset, big \? LARGE_SEATS : MAX_SEATS, queueSeason, anySeason\)/);
  assert.match(src, /savePref\('lobby\.size', n\)/);
  // 人数 (maintainer decisions 2026-11-07): a row of 选择模拟协议's rules in 同盟匹配 only, and in 创建同盟's bar on 选择同盟方式;
  // 独立模拟 has none
  const rules = src.slice(src.indexOf('export function ProtoRules('), src.indexOf('export function ProtocolSelect('));
  // (同盟匹配 of every season, 规程's too; its 自定义 stays locked by `matching`)
  assert.match(rules, /\$\{matching \? html`<span class="proto-rules__row">\s*<\$\{RowKey\} text=\$\{t\('人数'\)\} \/>/);
  assert.match(rules, /<\$\{SizeSwitch\} value=\$\{size\} onPick=\$\{onSize\} disabled=\$\{quick \|\| readOnly\}/); // readOnly: locked while queued
  // 创建同盟 is 选择模拟协议 (roomMode 'coop'): its 人数 is the rules' room row, fed by the lobby's pick
  assert.match(rules, /<\$\{SizeSwitch\} value=\$\{size\} onPick=\$\{onSize\} disabled=\$\{readOnly \|\| sizeLocked\}/);
  assert.match(src, /onSize=\$\{roomMode === 'solo' \? null : pickSize\}/);
  // a custom summary only for 独立模拟's / a room's 自定义 (同盟匹配 has no 自定义), in the brief: a solo room is never an
  // 8-seat one
  const brief = src.slice(src.indexOf('export function CustomBrief('), src.indexOf('export function QuickRange('));
  assert.match(brief, /if \(roomMode === 'match' \|\| ruleset !== 'custom'\) return null;/);
  assert.match(brief, /<\$\{CustomSummary\}[^>]*size=\$\{MAX_SEATS\}/);
});

test('matchQueue: joinQueue adds size only for an 8-player queue; counts8 and size reach the store; the dialog counts to the size', () => {
  const src = read('public/js/ui/matchQueue.js');
  assert.match(src, /\.\.\.\(size !== MAX_SEATS \? \{ size \} : \{\}\)/);
  assert.match(src, /queueCounts8: countsOf\(msg\.counts8\)/);
  assert.match(src, /size: seatsOf\(msg\.size\)/);
  assert.match(src, /t\('排队中的博士：\{count\}\/\{n\}', \{ count: Math\.min\(cap, queue\.count\), n: cap \}\)/);
  assert.match(read('public/js/store.js'), /queueCounts8: null/);
});

test('room: an 8-seat room has 8 seats, no AI seats, and starts with five Doctors or more', async () => {
  const { normalizeSeats, roomFacts, aiLastOption } = await load('public/js/screens/room.js');
  assert.equal(normalizeSeats(room8(3)).length, 8);
  assert.equal(normalizeSeats({ mode: 'coop', seats: [] }).length, 4, 'a room without size: 4');
  assert.equal(normalizeSeats({ mode: 'solo', size: 8, seats: [] }).length, 1);
  const four8 = roomFacts(room8(4), 'p0');
  assert.equal(four8.large, true);
  assert.equal(four8.seatsOpen, true);
  assert.equal(four8.canAddBot, false, 'the 8-player mode has no AI teammates');
  assert.equal(four8.canStart, false);
  for (const n of [5, 7]) {
    const f = roomFacts(room8(n), 'p0');
    assert.deepEqual([f.seatsOpen, f.canStart], [false, true], `${n} Doctors`);
  }
  const full = roomFacts(room8(8), 'p0');
  assert.equal(full.seatsOpen, false);
  assert.equal(full.canStart, true);
  const waiting = roomFacts(room8(8, { seats: room8(8).seats.map((s, i) => (i === 3 ? { ...s, ready: false } : s)) }), 'p0');
  assert.equal(waiting.canStart, false);
  const four = roomFacts({ ...room8(2), size: 4, seats: [seat(0), seat(1), null, null] }, 'p0');
  assert.equal(four.large, false);
  assert.equal(four.canAddBot, true);
  assert.equal(four.canStart, true, 'a 4-seat room still starts with open seats');
  assert.equal(aiLastOption(room8(8), 'p0'), null);
  const src = read('public/js/screens/room.js');
  assert.match(src, /seats--8/);
  assert.match(src, /t\('八人同盟需至少 5 名博士才能开始'\)/);
});

test('seat colours: eight distinct hues for the 8-player seats, the first four unchanged; both avatars use them', async () => {
  const { SEAT_HUES, seatHue } = await load('public/js/ui/components.js');
  assert.deepEqual(SEAT_HUES.slice(0, 4), [162, 196, 38, 280]);
  assert.equal(new Set(Array.from({ length: 8 }, (_, i) => seatHue(i))).size, 8);
  assert.equal(seatHue(8), seatHue(0));
  assert.equal(seatHue(-1), seatHue(7));
  assert.match(read('public/js/ui/gameComponents.js'), /const hue = seatHue\(player\?\.seat\)/);
});

test('result charts: eight players without a faction get eight distinct colours; with factions no two share one', async () => {
  const { playerColors, colorDistance, SPARE_PLAYER_COLORS, DEFAULT_PLAYER_COLORS, MIN_COLOR_DE } = await load('public/js/ui/gameLogic/resultCharts.js');
  const { CHAT_FACTIONS } = await load('shared/local.js');
  const colorsOf = (factions) => [...playerColors(factions.map((f, i) => ({ playerId: `p${i}`, faction: f }))).values()];
  const plain = colorsOf(Array(8).fill(null)).map((x) => x.color);
  assert.equal(new Set(plain).size, 8);
  assert.deepEqual(plain, [...DEFAULT_PLAYER_COLORS, ...SPARE_PLAYER_COLORS]);
  for (const a of SPARE_PLAYER_COLORS.slice(1, 3)) {
    for (const b of [...DEFAULT_PLAYER_COLORS, SPARE_PLAYER_COLORS[0]]) assert.ok(colorDistance(a, b) >= MIN_COLOR_DE, `${a} vs ${b}`);
  }
  const ids = [null, ...CHAT_FACTIONS.map((f) => f.id)];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let k = 0; k < 400; k++) {
    const seating = Array.from({ length: 8 }, () => ids[Math.floor(rnd() * ids.length)]);
    const out = colorsOf(seating).map((x) => x.color);
    assert.equal(new Set(out).size, 8, seating.join(' '));
  }
});

test('progress list: up to four teammates one by one; more fold the finished ones into one count', async () => {
  const { progressRows } = await load('public/js/ui/combatHud.js');
  const four = [{ playerId: 'a', done: true }, { playerId: 'b' }, { playerId: 'c' }, { playerId: 'd', done: true }];
  assert.deepEqual(progressRows(four), { rows: four, done: null, total: 4 });
  const seven = Array.from({ length: 7 }, (_, i) => ({ playerId: `p${i}`, done: i < 5 }));
  const r = progressRows(seven);
  assert.deepEqual(r.rows.map((p) => p.playerId), ['p5', 'p6']);
  assert.equal(r.done, 5);
  assert.equal(r.total, 7);
  assert.deepEqual(progressRows(null), { rows: [], done: null, total: 0 });
});

test('in-match UI: the 8-row player list, the compact draft order, the 12-card 机变 grid and the 4 + 4 Final Assault opening', () => {
  assert.match(read('public/js/ui/teamPanel.js'), /players\.length > 4 && 'is-8'/);
  assert.match(read('public/css/hud-art.css'), /\.team\.is-8 \{ --u: calc\(var\(--ui-u, \.015rem\) \* \.6\); \}/);
  assert.match(read('public/js/screens/bandDraft.js'), /draft\.order\.length > 4 && 'is-8'/);
  assert.match(read('public/css/screens/draft.css'), /\.draft-order\.is-8 \.dorder \{/);
  const choice = read('public/js/ui/choiceOverlay.js');
  assert.match(choice, /sp\.cards\.length > 6 && 'spov__grid--12'/);
  assert.match(read('public/css/screens/game-panels.css'), /\.spov__grid--12 \{ grid-template-columns: repeat\(4/);
  assert.match(read('public/css/phase-art.css'), /\.spov__grid--12 \{[^}]*repeat\(3, calc\(var\(--pu\) \* 271\)\)/);
  const art = read('public/js/ui/battleArt.js');
  assert.match(art, /const sides = wide \? \[team\.slice\(0, 4\), team\.slice\(4, 8\)\] : \[team\.slice\(0, 4\)\]/);
  assert.match(read('public/css/battle-art.css'), /@keyframes bbp-team8/);
});

test('matchQueue: 「바로 시작」 is offered in an 8-player queue of five or more; a vote reaches the store and its outcome toasts', async () => {
  const { canProposeStart, installMatchQueue } = await load('public/js/ui/matchQueue.js');
  const { store } = await load('public/js/store.js');
  const q = (o) => ({ difficulty: 'HARD', ruleset: 'classic', size: 8, count: 5, since: 0, found: null, ...o });
  assert.equal(canProposeStart(q()), true);
  assert.equal(canProposeStart(q({ count: 4 })), false);
  assert.equal(canProposeStart(q({ size: 4, count: 4 })), false, 'a 4-player queue never votes');
  assert.equal(canProposeStart(q({ found: { players: 5 } })), false);
  assert.equal(canProposeStart(null), false);
  const handlers = {};
  installMatchQueue({ net: { on: (t, fn) => { handlers[t] = fn; } } });
  handlers['room.queueState']({ queued: true, difficulty: 'HARD', ruleset: 'classic', size: 8, count: 6, waitedMs: 0 });
  handlers['room.matchFound']({ difficulty: 'HARD', ruleset: 'classic', size: 8, players: 6, accepted: 1, mine: false, inMs: 15000,
    vote: true, need: 5, declined: 2, no: true, by: 'P3' });
  assert.deepEqual(store.get().ui.queue.found.vote, { need: 5, declined: 2, no: true, by: 'P3' });
  handlers['room.queueState']({ queued: true, difficulty: 'HARD', ruleset: 'classic', size: 8, count: 1, waitedMs: 0, vote: 'started', started: 5 });
  assert.equal(store.get().ui.queue.found, null);
  const src = read('public/js/ui/matchQueue.js');
  assert.match(src, /t\('赞成的 \{n\} 名博士已先行开始，继续匹配', \{ n: msg\.started \?\? 0 \}\)/);
  assert.match(src, /run\('vote', \{ t: 'room\.queueVote' \}\)/);
});

test('the 8-player texts go through t() and have English and Korean', () => {
  const ids = ['与至多 {n} 名博士组成同盟，共享干员池，联防协作抵御敌潮。', '{n}–{max} 名博士即可开始 · 没有 AI 队友', '仅匹配真人 · 满 {n} 人后开始', '人数',
    '八人同盟：{n}–{max} 名博士即可开始，没有 AI 队友；卡池、敌方数值和联防人数随开局人数调整', '{n} 人同盟', '创建后邀请好友加入（{n}–{max} 名博士）', '排队中的博士：{count}/{n}',
    '八人同盟需至少 5 名博士才能开始',
    '凑齐 {n} 名博士后开始', '{n}人',
    // the 「바로 시작」 vote of the 8-player queue
    '提前开始投票', '赞成的 {n} 名博士已先行开始，继续匹配', '赞成未满 {n} 名，继续匹配', '已赞成 · 等待其他博士投票…', '已反对 · 等待其他博士投票…',
    '继续等待', '赞成开始', '{name} 提议以当前人数开始', '有博士提议以当前人数开始', '赞成 {yes} · 反对 {no} / {players}',
    '满 {n} 名赞成即由赞成的博士开始，其余博士继续匹配', '提议提前开始', '满 {n} 名可投票提前开始'];
  for (const zh of ids) {
    for (const [name, pack] of [['en', EN], ['ko', KO]]) {
      assert.equal(typeof pack[zh], 'string', `${name}: ${zh}`);
      assert.ok(pack[zh].length > 0 && !/[一-鿿]/.test(pack[zh]), `${name} text for ${zh}`);
    }
  }
});
