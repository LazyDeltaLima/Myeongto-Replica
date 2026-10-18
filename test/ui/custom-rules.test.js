// 커스텀 규칙 on the client (maintainer decisions 2026-10-18): the preset store (public/js/ui/customRulesStore.js — the
// stored envelope cleaned, presets added / saved / renamed / deleted, the lobby's settings), the share code (only the
// settings that differ from the official ones, compressed; a pasted code is sanitized), the switch's 自定义 option with
// its ⚙ and the 同盟匹配 lock (ui/ruleset.js), and how the lobby and the room use them (screens/lobby.js, room.js).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');

// a localStorage for the store (loaded at import)
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};
mem.set('sp.pref.customRules', JSON.stringify({
  v: 1,
  presets: [{ id: 'p1', name: '  Hard   leaders ', rules: { leaders: { hp: 150 } } }, { id: 'p1', name: 'dup' }, { name: 'no id' }, 'junk'],
  active: 'p1',
  draft: { enemies: { hp: 99999 } },
}));

const S = await import('../../public/js/ui/customRulesStore.js');
const { CUSTOM_OFFICIAL, sanitizeCustom } = await import('../../shared/ruleset.js');
const stored = () => JSON.parse(mem.get('sp.pref.customRules'));

beforeEach(() => {
  S.customRulesStore.set(S.parseStoredCustom({ presets: [{ id: 'p1', name: 'Hard leaders', rules: { leaders: { hp: 150 } } }], active: 'p1', draft: null }));
});

test('the stored envelope is cleaned: duplicate / id-less presets dropped, names trimmed, every rules object sanitized', () => {
  const st = S.parseStoredCustom(JSON.parse(JSON.stringify({
    presets: [{ id: 'p1', name: '  Hard   leaders ', rules: { leaders: { hp: 150 } } }, { id: 'p1', name: 'dup' }, { name: 'no id' }, 'junk'],
    active: 'p1', draft: { enemies: { hp: 99999 } },
  })));
  assert.equal(st.presets.length, 1);
  assert.equal(st.presets[0].name, 'Hard leaders');
  assert.equal(st.presets[0].rules.leaders.hp, 150);
  assert.equal(st.active, 'p1');
  assert.equal(st.draft.enemies.hp, 1000);
  const empty = S.parseStoredCustom(null);
  assert.deepEqual(empty.presets, []);
  assert.equal(empty.active, null);
  assert.deepEqual(empty.draft, CUSTOM_OFFICIAL);
  assert.equal(S.parseStoredCustom({ presets: [], active: 'gone' }).active, null);
});

test('presets: add (shown in the picker), save, rename, delete; the lobby settings (draft) are their own', () => {
  const id = S.addPreset('Mine', { enemies: { atk: 200 } });
  assert.ok(id && id !== 'p1');
  assert.equal(S.customRulesStore.get().active, id);
  assert.equal(S.presetOf(id).rules.enemies.atk, 200);
  assert.equal(S.savePreset(id, { enemies: { atk: 300 } }), true);
  assert.equal(S.presetOf(id).rules.enemies.atk, 300);
  assert.equal(S.savePreset('nope', {}), false);
  assert.equal(S.renamePreset(id, '   '), false, 'an empty name is refused');
  assert.equal(S.renamePreset(id, 'x'.repeat(40)), true);
  assert.equal(S.presetOf(id).name.length, S.CUSTOM_NAME_MAX);
  assert.equal(S.nextPresetName('Preset'), 'Preset 1');
  S.setDraft({ flow: { rounds: 18 } });
  assert.equal(S.customDraft().flow.rounds, 18);
  assert.equal(stored().draft.flow.rounds, 18, 'persisted');
  assert.deepEqual(S.selectPreset('p1'), S.presetOf('p1').rules);
  assert.equal(S.customRulesStore.get().active, 'p1');
  S.deletePreset('p1');
  assert.equal(S.presetOf('p1'), null);
  assert.equal(S.customRulesStore.get().active, null, 'the shown preset was deleted');
  assert.equal(S.customDraft().flow.rounds, 18, 'the lobby settings stay');
  assert.equal(stored().v, 1);
});

test('the preset list is bounded', () => {
  S.customRulesStore.set(S.parseStoredCustom(null));
  for (let i = 0; i < S.CUSTOM_PRESET_MAX; i++) assert.ok(S.addPreset(`n${i}`, {}));
  assert.equal(S.addPreset('one more', {}), null);
});

test('share code: only the settings that differ from the official ones, compressed; decoding fills the rest and sanitizes', async () => {
  const rules = sanitizeCustom({ enemies: { hp: 150 }, bonds: { pick: { yanShip: 'ban' } }, stages: { ban: ['act2autochess_m02'] } });
  assert.deepEqual(S.customDelta(rules), { bonds: { pick: { yanShip: 'ban' } }, enemies: { hp: 150 }, stages: { ban: ['act2autochess_m02'] } });
  assert.deepEqual(S.customDelta(CUSTOM_OFFICIAL), {});
  const code = await S.encodeCustomCode(rules);
  assert.match(code, /^SPC1j?\.[A-Za-z0-9_-]+$/);
  assert.ok(code.length < 160, `short: ${code.length}`);
  const back = await S.decodeCustomCode(` ${code.slice(0, 20)}\n${code.slice(20)} `);
  assert.equal(back.ok, true);
  assert.deepEqual(back.rules, rules);
  assert.equal(back.newer, false);
  for (const bad of ['', 'junk', 'SPC1.@@@', 'SPC1.AAAA', null, 42]) assert.equal((await S.decodeCustomCode(bad)).ok, false, String(bad));
  // a hand-made code: out-of-range values come back clamped; a newer version is read with a warning
  const raw = Buffer.from(JSON.stringify({ enemies: { hp: 99999 } })).toString('base64url');
  const hand = await S.decodeCustomCode(`SPC9j.${raw}`);
  assert.equal(hand.ok, true);
  assert.equal(hand.rules.enemies.hp, 1000);
  assert.equal(hand.newer, true);
});

test('the switch: 自定义 with its ⚙ after it; 同盟匹配 locks it with the reason on top of the tooltip; the lobby remembers the queue preset', async () => {
  const src = read('public/js/ui/ruleset.js');
  assert.match(src, /data-testid="custom-rules-gear"/);
  assert.match(src, /customLock \? `\$\{customLock\}\\n\$\{tips\}` : tips/);
  const R = await import('../../public/js/ui/ruleset.js');
  mem.delete('sp.pref.lobby.ruleset');
  mem.delete('sp.pref.lobby.queueRuleset');
  assert.equal(R.lobbyRuleset(), 'classic');
  R.saveLobbyRuleset('casual');
  R.saveLobbyRuleset('custom');
  assert.equal(R.lobbyRuleset(), 'custom');
  assert.equal(R.lobbyQueueRuleset(), 'casual', '开始匹配 takes the last queue preset');
  R.saveLobbyRuleset('zany');
  assert.equal(R.lobbyRuleset(), 'custom');
});

test('the lobby and the room: room.create / room.setRuleset carry the settings; a custom room has no 匹配补位; the bar line-up', () => {
  const lobby = read('public/js/screens/lobby.js');
  assert.match(lobby, /ruleset === 'custom'\s*\? \{ mode: roomMode, difficulty, ruleset, custom: customDraft\(\) \}/);
  assert.match(lobby, /joinQueue\(difficulty, queueRuleset\)/);
  assert.match(lobby, /<\$\{CustomRulesDialog\} \/>/);
  const room = read('public/js/screens/room.js');
  assert.match(room, /net\.request\('room\.setRuleset', \{ preset: 'custom', custom \}\)/);
  assert.match(room, /disabled=\$\{isCustom \|\| !facts\.canStart \|\| !online\}/);
  assert.match(room, /readonly: true/);
  // 「AI 队友最后选择」 under the ready count, the switch alone in the row under the difficulty
  const center = room.slice(room.indexOf('<div class="room-bar__center">'), room.indexOf('<div class="room-bar__status">'));
  assert.match(center, /<\$\{AiLastToggle\}/);
  const row = room.slice(room.indexOf('<div class="room-bar__row">'), room.indexOf('<div class="room-bar__center">'));
  assert.doesNotMatch(row, /AiLastToggle/);
  assert.match(read('public/index.html'), /css\/screens\/custom-rules\.css/);
});

test('the dialog has its five tabs and no 「后续更新生效」 tag (a match reads every setting); every text has its English', async () => {
  const { CUSTOM_TABS } = await import('../../public/js/ui/customRules.js');
  assert.deepEqual([...CUSTOM_TABS], ['bonds', 'enemies', 'bosses', 'stages', 'flow']);
  assert.doesNotMatch(read('public/js/ui/customRules.js'), /后续更新生效|PENDING/);
  const en = JSON.parse(read('public/i18n/en.json'));
  const src = read('public/js/ui/customRules.js');
  for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) {
    assert.equal(typeof en[m[1]], 'string', `en.json: ${m[1]}`);
    assert.ok(!/[一-鿿]/.test(en[m[1]]), `English for ${m[1]}`);
  }
});

test('the stat curve chart leaves out the custom line while it is the official one (maintainer request 2026-10-18)', async () => {
  const { CurveChart } = await import('../../public/js/ui/customRules.js');
  const mode = JSON.parse(read('data/config.json')).modes.mode_multi_hard;
  const lines = (c) => {
    const svg = CurveChart({ work: sanitizeCustom(c), mode });
    return JSON.stringify(svg, (k, v) => (typeof v === 'function' ? undefined : v)).match(/crx-chart__(off|cus)/g);
  };
  assert.deepEqual(lines({}), ['crx-chart__off'], 'official curve, hp 100 %, official rounds: the official line only');
  assert.deepEqual(lines({ flow: { rounds: 14 } }), ['crx-chart__off'], 'the official round count given explicitly');
  for (const c of [{ enemies: { curve: 'gentle' } }, { enemies: { hp: 150 } }, { flow: { rounds: 16 } }, { flow: { rounds: 8 } }]) {
    assert.deepEqual(lines(c), ['crx-chart__off', 'crx-chart__cus'], JSON.stringify(c));
  }
});
