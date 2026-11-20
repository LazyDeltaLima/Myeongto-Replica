// 공개방 on the client (maintainer decisions 2026-11-20; server/lobby.js 「공개방」): the 同盟匹配 list (ui/publicRooms.js —
// which rooms the player's matchmaking would take, the order and the F2 filter), the waiting room's 公开 switch
// (screens/room.js publicOption, room.setPublic), the two entries split by who plays (同盟模拟 private, 同盟匹配's
// 创建公开联合 and the waiting dialog's 以公开联合等待 public with 满员自动开始), matchmaking's offer of a public room
// (ui/matchQueue.js, room.matchFound `room`) and the 匹配补位 button's removal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const load = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const EN = JSON.parse(read('public/i18n/en.json'));
const KO = JSON.parse(read('public/i18n/ko.json'));

const H = { kind: 'human' }, B = { kind: 'bot' }, E = { kind: 'empty' };
const row = (o = {}) => ({ code: 'AAAA', host: { name: 'H', no: '1234' }, difficulty: 'NORMAL', ruleset: { preset: 'classic' }, size: 4,
  seats: [{ ...H, host: true }, B, E, E], state: 'lobby', spectators: 0, spectatorSeats: 2, since: 0, ...o });
const PICK = { season: 'act2autochess', difficulty: 'NORMAL', ruleset: 'classic', size: 4, quick: false };

test('roomFit: the picked season and difficulty, in LOBBY with a free or AI seat; 精准匹配 also the ruleset and size', async () => {
  const { roomFit } = await load('public/js/ui/publicRooms.js');
  assert.equal(roomFit(row(), PICK), 'fit');
  assert.equal(roomFit(row({ ruleset: { preset: 'casual' } }), PICK), 'quick', 'another ruleset: 快速匹配 only');
  assert.equal(roomFit(row({ size: 8, seats: [H, H, E, E, E, E, E, E] }), PICK), 'quick', 'another size');
  assert.equal(roomFit(row({ ruleset: { preset: 'custom' } }), PICK), 'quick', 'a custom room is the quick players\'');
  assert.equal(roomFit(row({ ruleset: { preset: 'casual' } }), { ...PICK, quick: true }), 'fit');
  assert.equal(roomFit(row({ seats: [H, B, B, B] }), PICK), 'fit', 'AI seats give way');
  assert.equal(roomFit(row({ seats: [H, H, H, H] }), PICK), null, 'full');
  assert.equal(roomFit(row({ state: 'match' }), PICK), null, 'running');
  assert.equal(roomFit(row({ difficulty: 'HARD' }), PICK), null);
  assert.equal(roomFit(row({ season: 'act3autochess' }), PICK), null, 'another season (the queue is the season\'s)');
  assert.equal(roomFit(row({ season: 'act3autochess' }), { ...PICK, season: 'act3autochess' }), 'fit');
});

test('listRooms: the picked season first (matchmaking\'s, waiting, running), the others by season; the F2 filter', async () => {
  const { listRooms, roomFit, roomsWaiting } = await load('public/js/ui/publicRooms.js');
  const rows = [
    row({ code: 'LIVE', state: 'match', round: 9 }),
    row({ code: 'CASU', ruleset: { preset: 'casual' } }),
    row({ code: 'NEXT', season: 'act3autochess' }),
    row({ code: 'FITS' }),
    row({ code: 'HARD', difficulty: 'HARD' }),
  ];
  const fit = (r) => roomFit(r, PICK);
  const o = { season: 'act2autochess', offered: ['act2autochess', 'act3autochess'], fit };
  const all = listRooms(rows, o);
  assert.deepEqual(all.current.map((x) => x.row.code), ['FITS', 'CASU', 'HARD', 'LIVE']);
  assert.deepEqual(all.others.map((g) => [g.season, g.rows.map((x) => x.row.code)]), [['act3autochess', ['NEXT']]]);
  assert.equal(all.fits, 1);
  assert.equal(all.total, 5);
  assert.deepEqual(listRooms(rows, { ...o, fitOnly: true }).current.map((x) => x.row.code), ['FITS']);
  assert.deepEqual(listRooms(rows, { ...o, fitOnly: true }).others, [], 'another season has no matchmaking rooms');
  assert.ok(!listRooms(rows, { ...o, live: false }).current.some((x) => x.row.code === 'LIVE'), '进行中（观战） off');
  const next = listRooms(rows, { ...o, pick: 'act3autochess' });
  assert.deepEqual([next.current.length, next.others.map((g) => g.rows.length)], [0, [1]], 'one season picked');
  assert.deepEqual(listRooms(null, o), { current: [], others: [], fits: 0, total: 0 });
  assert.equal(roomsWaiting(rows, 'act2autochess', 'NORMAL'), 2, 'the card\'s 房间 n: the waiting rooms of its season and difficulty');
});

test('the season drop-down picks the matchmaking\'s season: a season = its queue and rooms, 所有赛季 = the chip\'s queue and every season\'s rooms', async () => {
  const { queueTarget, roomFit, roomsWaiting, listRooms } = await load('public/js/ui/publicRooms.js');
  assert.deepEqual(queueTarget('all', 'act2autochess'), { season: 'act2autochess', anySeason: true }, 'the Doctors in the chip season\'s queue');
  assert.deepEqual(queueTarget('act3autochess', 'act2autochess'), { season: 'act3autochess', anySeason: false });
  const all = { ...PICK, season: 'all' };
  assert.equal(roomFit(row({ season: 'act3autochess' }), all), 'fit', 'every season\'s rooms');
  assert.equal(roomFit(row(), all), 'fit');
  assert.equal(roomFit(row({ difficulty: 'HARD' }), all), null);
  const rows = [row({ code: 'A2' }), row({ code: 'N1', season: 'act3autochess', ruleset: { preset: 'casual' } }),
    row({ code: 'N2', season: 'act3autochess' }), row({ code: 'NL', season: 'act3autochess', state: 'match' })];
  assert.equal(roomsWaiting(rows, 'all', 'NORMAL'), 3, '所有赛季: every season\'s waiting rooms summed');
  assert.equal(roomsWaiting(rows, 'act3autochess', 'NORMAL'), 2);
  // another season's group keeps the matchmaking's rooms first, as the picked season's does
  const v = listRooms(rows, { season: 'act2autochess', offered: ['act2autochess', 'act3autochess'], pick: 'act3autochess', fit: (r) => roomFit(r, { ...PICK, season: 'act3autochess' }) });
  assert.deepEqual(v.others[0].rows.map((x) => x.row.code), ['N2', 'N1', 'NL']);
  assert.equal(listRooms(rows, { season: 'act2autochess', pick: 'act3autochess', fitOnly: true, fit: (r) => roomFit(r, { ...PICK, season: 'act3autochess' }) }).others[0].rows.length, 1,
    '仅匹配对象 works for another season too');
  const src = read('public/js/screens/lobby.js');
  assert.match(src, /const \[pick, setPick\] = useState\(season\);\s*useEffect\(\(\) => \{ if \(!open\) setPick\(season\); \}, \[open, season\]\);/, 'it opens on the chip\'s season');
  assert.match(src, /const \{ season: queueSeason, anySeason \} = queueTarget\(target, season\);/);
  assert.match(src, /joinQuickQueue\(difficulty, queueSeason, anySeason\)/);
  assert.match(src, /seasonQueueCounts\(s, queueSeason, false\)/, 'the cards\' 等待 n follow the drop-down\'s queue');
  assert.match(src, /roomsWaiting\(publicRooms, target, d\)/, 'the cards\' 房间 n follow the drop-down');
  assert.match(src, /<\$\{PublicRooms\} season=\$\{season\} pick=\$\{target\} onPick=\$\{setPick\}/);
  assert.match(src, /waiting=\$\{c\.id === 'match' \? hubWaiting : null\}/, 'the hub keeps the chip season\'s');
  assert.match(src, /seasonFields\(q\.season \?\? season\) \}, \{ queued: true \}\)/, '以公开联合等待 opens the room in the queue\'s season');
  const mq = read('public/js/ui/matchQueue.js');
  assert.match(mq, /\.\.\.\(anySeason \? \{ anySeason: true \} : \{\}\)/);
  assert.match(mq, /season: seasonOf\(msg\.season\)/);
  assert.doesNotMatch(read('public/js/ui/publicRooms.js'), /useState\('all'\)|otherPick/, 'the drop-down is the lobby\'s, 仅匹配对象 never disabled');
});

test('publicOption: a co-op room\'s state, the host switches it; the switch sends room.setPublic; 匹配补位 is gone', async () => {
  const { publicOption } = await load('public/js/screens/room.js');
  const room = { mode: 'coop', hostId: 'h', public: true, seats: [] };
  assert.deepEqual(publicOption(room, 'h'), { on: true, editable: true });
  assert.deepEqual(publicOption({ ...room, public: undefined }, 'g'), { on: false, editable: false });
  assert.equal(publicOption({ ...room, mode: 'solo' }, 'h'), null);
  const src = read('public/js/screens/room.js');
  assert.match(src, /net\.request\('room\.setPublic', \{ on \}\)/);
  assert.match(src, /data-testid="room-public"/);
  assert.match(src, /<\$\{PublicSwitch\} [^>]*fold=\$\{true\}/, 'the waiting room\'s switch is the new room\'s PublicSwitch, folded (one part)');
  assert.doesNotMatch(src, /net\.request\('room\.queueRoom'|room\.matching|rs-fill/);
});

test('two entries by who plays: 同盟模拟 private (no 公开 row), 同盟匹配\'s 创建公开联合 and the queue\'s offer public with auto start', async () => {
  const lobby = read('public/js/screens/lobby.js');
  assert.doesNotMatch(lobby, /proto-public|onPub\b|publicField/, '同盟模拟 has no 公开 row (maintainer decision 2026-11-20)');
  assert.match(lobby, /t\('非公开同盟 · 创建后用邀请码邀请好友或添加 AI 队友'\)/);
  assert.match(lobby, /N_\('用邀请码召集好友，或与 AI 队友一起进行的非公开同盟。'\)/);
  assert.match(lobby, /N_\('寻找公开联合加入、自动匹配，或创建公开联合等待其他博士。'\)/);
  for (const k of ['用邀请码召集好友，或与 AI 队友一起进行的非公开同盟。', '寻找公开联合加入、自动匹配，或创建公开联合等待其他博士。']) {
    assert.ok(EN[k] && KO[k], `the entry tooltip has its English and Korean: ${k}`);
  }
  // 创建公开联合 (pa): the matching screen's ruleset carried over, back = the list, a public room
  assert.match(lobby, /const openPublicNew = \(\) => \{ setRuleset\(queueRuleset\); setOpen\('pa'\); \};/);
  assert.match(lobby, /onClose=\$\{\(\) => setOpen\(publicNew \? 'match' : null\)\}/);
  assert.match(lobby, /publicNew \? openPublicRoom\(createFields\(\)\) : net\.request\('room\.create', createFields\(\)\)/);
  assert.match(lobby, /onCreate=\$\{openPublicNew\}/);
  assert.match(lobby, /<\$\{MatchQueueDialog\} onPublic=\$\{queuePublic\} inline=\$\{waitHere\} \/>/);
  // openPublicRoom: out of the queue first, a public room, 满员自动开始 on (both ways in, maintainer decisions 2026-11-20)
  const { openPublicRoom } = await load('public/js/screens/lobby.js');
  const { net } = await load('public/js/net.js');
  const { store } = await load('public/js/store.js');
  const sent = [];
  const real = net.request;
  net.request = async (t, f) => { sent.push([t, f]); return { t: 'ok' }; };
  try {
    store.patch('ui', { queue: null });
    await openPublicRoom({ mode: 'coop', difficulty: 'NORMAL', ruleset: 'custom', custom: {} });
    assert.deepEqual(sent, [['room.create', { mode: 'coop', difficulty: 'NORMAL', ruleset: 'custom', custom: {}, public: true }], ['room.setAutoStart', { on: true }]]);
    sent.length = 0;
    await openPublicRoom({ mode: 'coop', difficulty: 'HARD', ruleset: 'classic' }, { queued: true });
    assert.deepEqual(sent.map(([t]) => t), ['room.unqueue', 'room.create', 'room.setAutoStart'], 'room.create keeps a queue entry: unqueue first');
  } finally { net.request = real; }
  // the waiting dialog offers it after a minute, only where the lobby passes onPublic
  const { PUBLIC_OFFER_MS } = await load('public/js/ui/matchQueue.js');
  assert.equal(PUBLIC_OFFER_MS, 60_000);
  const mq = read('public/js/ui/matchQueue.js');
  assert.match(mq, /const late = !!onPublic && Date\.now\(\) - queue\.since >= PUBLIC_OFFER_MS;/);
  assert.match(mq, /data-testid="queue-public"[\s\S]{0,80}onClick=\$\{\(\) => go\('public', \(\) => onPublic\(queue\)\)\}>\$\{t\('以公开联合等待'\)\}/);
  // the list: 创建公开联合 at its head and in an empty list
  const pr = read('public/js/ui/publicRooms.js');
  assert.match(pr, /<\$\{NewRoom\} onCreate=\$\{onCreate\} testid="pubrooms-new" \/>\s*<span class="pubrooms__filter">/);
  assert.match(pr, /<\$\{NewRoom\} onCreate=\$\{onCreate\} big=\$\{true\} testid="pubrooms-new-empty" \/>/);
});

test('autoStartOption: the host of a public co-op room alone; the count\'s seconds; the status line and the switch', async () => {
  const { autoStartOption, autoStartLeft } = await load('public/js/screens/room.js');
  const room = { mode: 'coop', hostId: 'h', public: true, autoStart: true, seats: [] };
  assert.deepEqual(autoStartOption(room, 'h'), { on: true });
  assert.deepEqual(autoStartOption({ ...room, autoStart: undefined }, 'h'), { on: false });
  assert.equal(autoStartOption(room, 'g'), null, 'hidden from the other Doctors (maintainer decision 2026-11-20)');
  assert.equal(autoStartOption({ ...room, public: false }, 'h'), null, 'a private room has none');
  assert.equal(autoStartOption({ ...room, mode: 'solo' }, 'h'), null);
  assert.equal(autoStartOption({ ...room, inMatch: true }, 'h'), null);
  assert.equal(autoStartLeft({ autoStartAt: 10_000 }, 3_001), 7, 'whole seconds, rounded up');
  assert.equal(autoStartLeft({ autoStartAt: 10_000 }, 12_000), 0);
  assert.equal(autoStartLeft({}, 0), null, 'no count');
  const src = read('public/js/screens/room.js');
  assert.match(src, /net\.request\('room\.setAutoStart', \{ on \}\)/);
  assert.match(src, /data-testid="room-autostart"/);
  assert.match(src, /room\.autoStart === true\n\s+\? html`<span class="t-lo room-bar__pub"><\$\{Icon\} name="signal" \/>\$\{t\('自动开始'\)\}/, 'waiting: just 「自动开始」');
});

test('the hub: 同盟匹配\'s badges inside its card, the public rooms of every season; no line above the entries', async () => {
  const { store } = await load('public/js/store.js');
  const { installMatchQueue } = await load('public/js/ui/matchQueue.js');
  const handlers = {};
  installMatchQueue({ net: { on: (t, fn) => { handlers[t] = fn; } } });
  handlers['lobby.queueCounts']({ counts: {}, rooms: { act2autochess: 1, act3autochess: 2 } });
  assert.deepEqual(store.get().ui.queueRooms, { act2autochess: 1, act3autochess: 2 });
  const { countAll } = await load('public/js/screens/lobby.js');
  assert.equal(countAll(store.get().ui.queueRooms), 3, 'every season summed (maintainer decision 2026-11-20)');
  const lobby = read('public/js/screens/lobby.js');
  assert.match(lobby, /const totalRooms = countAll\(queueRooms\);/);
  assert.match(lobby, /data-testid=\$\{testid\}/);
  assert.match(lobby, /badge\(rooms, t\('公开房间 \{n\}'/);
  assert.doesNotMatch(lobby, /hub-entry__group|points:/, 'the line above the entries is gone');
  const css = read('public/css/screens/lobby.css');
  assert.match(css, /\.hub-entry__wait\.is-zero \{/, 'a 0 is dimmed in place');
});

test('matchQueue: lobby.rooms fills ui.publicRooms; an offer keeps its room; any room.state ends the queue', async () => {
  const { store } = await load('public/js/store.js');
  const { installMatchQueue, leftText } = await load('public/js/ui/matchQueue.js');
  const handlers = {};
  installMatchQueue({ net: { on: (t, fn) => { handlers[t] = fn; } } });
  handlers['lobby.rooms']({ rooms: [row()] });
  assert.equal(store.get().ui.publicRooms.length, 1);
  handlers['room.queueState']({ queued: true, difficulty: 'NORMAL', ruleset: 'classic', count: 1, waitedMs: 0 });
  const card = { code: 'AAAA', host: { name: 'H', no: '1234' }, ruleset: { preset: 'classic' }, size: 4, seats: [H, B, E, E] };
  handlers['room.matchFound']({ difficulty: 'NORMAL', ruleset: 'classic', players: 1, accepted: 0, mine: false, inMs: 15000, room: card });
  assert.deepEqual(store.get().ui.queue.found.room, card);
  handlers['room.state']({ code: 'AAAA', seats: [] });
  assert.equal(store.get().ui.queue, null, 'the offered room\'s state: seated');
  assert.equal(leftText({ reason: 'party' }), null, 'a room no longer queues');
  assert.ok(leftText({ reason: 'room' }));
});

test('the target and the waiting in 同盟匹配\'s screen (mockup round six): 开始匹配\'s second line, the right column waits, the picks locked; the offer names its season', async () => {
  const lobby = read('public/js/screens/lobby.js');
  // S1: the start button's second line, from the drop-down's target and the chip season
  assert.match(lobby, /target === 'all' \? tParts\('\{target\} 公开联合 · 新联合 \{season\}', \{ target: bold\(t\('所有赛季'\)\), season: bold\(seasonName\(season\)\) \}\)/);
  assert.match(lobby, /target === season \? tParts\('\{season\} 赛季', \{ season: bold\(seasonName\(target\)\) \}\)\s*: tParts\('\{season\} 赛季 · 匹配成功后将切换赛季'/);
  assert.match(lobby, /sub=\$\{matching \? targetLine : null\} wait=\$\{waitHere \? html`<\$\{QueueWait\} onPublic=\$\{queuePublic\} \/>` : null\} locked=\$\{waitHere\}/);
  assert.match(lobby, /const waitHere = matching && queued;/);
  // W1: the wait takes the hint, range switch and start button's place; the rule rows and the cards are locked
  const select = lobby.slice(lobby.indexOf('export function ProtocolSelect('), lobby.indexOf('export function AllianceSelect('));
  assert.match(select, /: wait \? html`<div class="proto-foot create-box proto-foot--range proto-foot--wait">\$\{wait\}<\/div>` : html`<div/);
  assert.match(select, /onSelect=\$\{onDifficulty\} disabled=\$\{readOnly \|\| locked\}/);
  assert.match(lobby, /counts8=\$\{queueCounts8\}\s*readOnly=\$\{waitHere\} \/>/);
  assert.match(lobby, /<\$\{SizeSwitch\} value=\$\{size\} onPick=\$\{onSize\} disabled=\$\{quick \|\| readOnly\}/, 'the queue\'s 人数 locked too');
  const mq = read('public/js/ui/matchQueue.js');
  assert.match(mq, /if \(!queue \|\| \(inline && !queue\.found\)\) return null;/, 'the dialog keeps the confirmation and the vote, the waiting is inline');
  const wait = mq.slice(mq.indexOf('export function QueueWait('), mq.indexOf('function FoundRoom('));
  assert.match(wait, /<\$\{ModeCapsule\} season=\$\{queue\.anySeason \? 'all' : queue\.season\} quick=\$\{queue\.quick\}/);
  assert.match(wait, /const late = !!onPublic && Date\.now\(\) - queue\.since >= PUBLIC_OFFER_MS;/);
  assert.match(wait, /data-testid="queue-public"\s*onClick=\$\{\(\) => go\('public', \(\) => onPublic\(queue\)\)\}>\$\{t\('以公开联合等待'\)\}/);
  assert.match(wait, /aria-label=\$\{t\('取消匹配'\)\} onClick=\$\{cancel\}>\$\{primary \? null : t\('取消匹配'\)\}/, '取消匹配 as its icon beside an action');
  // 所有赛季 as the capsule's season part
  assert.match(read('public/js/ui/modeCapsule.js'), /season === 'all' \? html`<span class="rs-mode__seg rs-mode__season is-all">\$\{t\('所有赛季'\)\}<\/span>`/);
  // the confirmation: the season part always, the switch line for another season than the page's, the target on the mode line
  assert.match(mq, /<\$\{ModeCapsule\} season=\$\{season\} ruleset=\$\{room\.ruleset\?\.preset\}/);
  assert.match(mq, /seasonOf\(season\) !== seasonOf\(page\) \? html`<span class="queue-dialog__offer" data-testid="found-switch">/);
  assert.match(mq, /\$\{queue\.anySeason \? ` · \$\{t\('所有赛季'\)\}` : ''\}/);
  // the store: room.queueState's anySeason, the offer's season
  const { store } = await load('public/js/store.js');
  const { installMatchQueue } = await load('public/js/ui/matchQueue.js');
  const handlers = {};
  installMatchQueue({ net: { on: (t, fn) => { handlers[t] = fn; } } });
  handlers['room.queueState']({ queued: true, difficulty: 'NORMAL', ruleset: 'classic', anySeason: true, count: 1, waitedMs: 0 });
  assert.equal(store.get().ui.queue.anySeason, true);
  handlers['room.matchFound']({ difficulty: 'NORMAL', ruleset: 'classic', season: 'act3autochess', players: 1, accepted: 0, mine: false, inMs: 15000,
    room: { code: 'AAAA', host: { name: 'H', no: '1' }, ruleset: { preset: 'classic' }, size: 4, seats: [H, B, E, E] } });
  assert.equal(store.get().ui.queue.found.season, 'act3autochess', 'the offer\'s season (absent = the default)');
  assert.equal(store.get().ui.queue.anySeason, true, 'the target stays through the offer');
  handlers['room.queueState']({ queued: true, difficulty: 'NORMAL', ruleset: 'classic', count: 1, waitedMs: 0 });
  assert.equal(store.get().ui.queue.anySeason, false);
  handlers['room.queueState']({ queued: false, difficulty: 'NORMAL', reason: 'left' });
  // the capsule may not shrink with its season part (the name was cut), as the list's
  const css = read('public/css/screens/lobby.css');
  assert.match(css, /\.queue-dialog__room \.rs-mode \{ --o: var\(--po\); margin-right: 0; max-width: none;/);
  assert.match(css, /\.proto-side\.is-locked \.proto-rules, \.proto-side\.is-locked \.proto-list \{ opacity: \.42;/);
});

test('every new text has its English and Korean', () => {
  const files = ['public/js/ui/publicRooms.js', 'public/js/ui/modeCapsule.js', 'public/js/ui/matchQueue.js', 'public/js/screens/room.js', 'public/js/screens/lobby.js'];
  const keys = ['公开联合', '仅匹配对象', '进行中（观战）', '所有赛季', '房间 {n}', '匹配对象', '设置 {n} 项不同', '查看全部设置', '参加', '公开', '不公开',
    '等待 {n} 分钟', '进行中 · 第{n}回合', '确定将「{name}」移出同盟吗？对方 10 分钟内无法再次加入。', '接受后加入该联合，由创建者开始模拟',
    '公开房间 {n}', '自动开始', '满员且所有博士准备就绪后，倒计时结束即自动开始模拟', '{n} 秒后自动开始',
    '非公开同盟 · 创建后用邀请码邀请好友或添加 AI 队友', '创建公开联合', '公开联合 · 显示在同盟匹配列表中，匹配中的博士会加入', '目前没有公开联合',
    '点击「开始匹配」等待，或创建公开联合，匹配中的博士会进入空位', '以公开联合等待', '超过 1 分钟仍未凑齐 · 以公开联合等待，同条件匹配的博士会加入，空位也可由 AI 队友补上',
    '「开始匹配」寻找这里选的赛季 · 所有赛季时博士之间按当前赛季（{season}）匹配 · 加入其他赛季的联合会切换到该赛季',
    '正在寻找博士', '{count}/{n} · 凑齐 {n} 名后开始', '{count}/{n} · 满 {m} 名可投票提前开始', '同难度 {count} 名 · 规则、人数不限',
    '匹配中也可使用列表 · 从列表加入将退出匹配', '超过 1 分钟仍未凑齐 · 以公开联合等待，同条件匹配的博士会加入', '接受后将切换到「{season}」赛季'];
  // the start button's target line goes through tParts (its names in bold)
  for (const k of ['{target} 公开联合 · 新联合 {season}', '{season} 赛季', '{season} 赛季 · 匹配成功后将切换赛季']) {
    assert.ok(read('public/js/screens/lobby.js').includes(`tParts('${k}'`), `used: ${k}`);
    assert.ok(EN[k] && KO[k], `en / ko: ${k}`);
  }
  // 「방」 as the official KR client (房间 = 방; 联合 is the mode's name alone — maintainer decision 2026-11-20)
  for (const k of ['公开联合', '的公开联合', '没有符合筛选条件的公开联合']) assert.doesNotMatch(KO[k], /연합/, `ko: ${k}`);
  const src = files.map(read).join('\n');
  for (const k of keys) {
    assert.ok(src.includes(`t('${k}'`), `used: ${k}`);
    assert.ok(EN[k] && !/[一-鿿]/.test(EN[k]), `en: ${k}`);
    assert.ok(KO[k] && !/[一-鿿]/.test(KO[k]), `ko: ${k}`);
  }
});
