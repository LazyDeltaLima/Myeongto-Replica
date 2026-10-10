// 진영별 선발 프리셋 (local feature, maintainer decisions 2026-10-09; public/js/ui/diyPresets.js): per-browser 自选 rosters,
// one for 不使用预设 and one per chat faction, each its own (a faction's empty until filled — then no preset); the
// 自选编队 tab's bar switches between them, edits follow the roster shown, and a faction pick (chat / strategy draft)
// applies that faction's preset with a 撤销 (a faction without one changes nothing).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try {
    const body = readFileSync(path.join(ROOT, 'data', name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const P = await import('../../public/js/ui/diyPresets.js');
const { presetPickLive } = await import('../../public/js/ui/factionPick.js');
const { loadoutStore, setDiyPicks } = await import('../../public/js/ui/loadoutSync.js');
const { DiyPanelView, DiyPresetBar } = await import('../../public/js/screens/diy.js');
const { data } = await import('../../public/js/data.js');
await data.loadAll('chess', 'bonds', 'assets', 'backups');

const T6A = 'chess_char_6_diy1_a';
const T6B = 'chess_char_6_diy2_a';
const WANG = { charId: 'char_2027_wang', skillIndex: 2, uniEquipId: null };
const CHEN = { charId: 'char_1050_chen3', skillIndex: 1, uniEquipId: null };
const WIS = { charId: 'char_1035_wisdel', skillIndex: 2, uniEquipId: null };
const stored = () => JSON.parse(mem.get(`sp.pref.${P.DIY_PRESETS_PREF}`) || 'null');

P.installDiyPresets();
beforeEach(() => {
  P.diyPresetStore.set({ presets: {}, base: {}, active: null, notice: null });
  setDiyPicks({});
  mem.delete(`sp.pref.${P.DIY_PRESETS_PREF}`);
});

test('stored rosters: only chat factions, clean and non-empty picks; a v1 envelope takes the live picks as base', () => {
  const got = P.parseStoredPresets({ v: 2, presets: { yan: { [T6A]: WANG, junk: 3 }, nowhere: { [T6A]: WANG }, kjerag: 'x', sargon: {} }, base: { [T6A]: WIS }, active: 'kjerag' });
  assert.deepEqual(Object.keys(got.presets), ['yan']);
  assert.deepEqual(got.presets.yan, { [T6A]: WANG });
  assert.deepEqual(got.base, { [T6A]: WIS });
  assert.equal(got.active, 'kjerag', 'an empty faction may be the one shown');
  assert.deepEqual(P.parseStoredPresets(null), { presets: {}, base: {}, active: null });
  assert.deepEqual(P.parseStoredPresets({ v: 1, presets: { yan: { [T6A]: WANG } }, active: null }, { [T6A]: CHEN }).base, { [T6A]: CHEN });
  assert.deepEqual(P.parseStoredPresets({ v: 1, presets: { yan: { [T6A]: WANG } }, active: 'yan' }, { [T6A]: WANG }).base, {});
});

test('the bar: 不使用预设 and every faction keep their own picks — switching never copies them (maintainer report 2026-10-09)', () => {
  setDiyPicks({ [T6A]: WIS }); // shown: 不使用预设
  P.selectPreset('yan');
  assert.deepEqual(loadoutStore.get().diy, {}, 'a faction without a preset starts empty, not with the picks left behind');
  assert.equal(P.diyPresetStore.get().presets.yan, undefined, 'an empty roster is no preset');
  setDiyPicks({ [T6A]: WANG, [T6B]: CHEN });
  assert.deepEqual(P.diyPresetStore.get().presets.yan, { [T6A]: WANG, [T6B]: CHEN }, 'an edit is saved into the roster shown');
  assert.deepEqual(stored().presets.yan, { [T6A]: WANG, [T6B]: CHEN }, 'and persisted');
  P.selectPreset('sargon');
  assert.deepEqual(loadoutStore.get().diy, {}, 'another empty faction: empty again');
  P.selectPreset(null);
  assert.deepEqual(loadoutStore.get().diy, { [T6A]: WIS }, '不使用预设 has its own picks back');
  assert.deepEqual(P.diyPresetStore.get().base, { [T6A]: WIS });
  P.selectPreset('yan');
  assert.deepEqual(loadoutStore.get().diy, { [T6A]: WANG, [T6B]: CHEN }, 'a saved preset is shown');
  setDiyPicks({});
  assert.equal(P.diyPresetStore.get().presets.yan, undefined, 'emptied: no preset any more');
  setDiyPicks({ [T6A]: WANG });
  P.deletePreset('yan');
  assert.equal(P.diyPresetStore.get().active, null);
  assert.equal(P.diyPresetStore.get().presets.yan, undefined);
  assert.deepEqual(loadoutStore.get().diy, { [T6A]: WIS }, 'deleting the shown preset goes back to 不使用预设');
});

test('faction pick: a faction without a preset changes nothing; with one, the picks change and 撤销 restores them', () => {
  setDiyPicks({ [T6A]: WIS });
  assert.equal(P.applyFactionPreset('yan'), null);
  assert.deepEqual(loadoutStore.get().diy, { [T6A]: WIS });
  assert.equal(P.diyPresetStore.get().active, null);

  P.diyPresetStore.set({ presets: { yan: { [T6A]: WANG, [T6B]: CHEN } } });
  const n = P.applyFactionPreset('yan', { inMatch: true, now: 5 });
  assert.equal(n.factionId, 'yan');
  assert.equal(n.inMatch, true);
  assert.deepEqual(loadoutStore.get().diy, { [T6A]: WANG, [T6B]: CHEN });
  assert.equal(P.diyPresetStore.get().active, 'yan');
  assert.deepEqual(P.diyPresetStore.get().base, { [T6A]: WIS }, '不使用预设 keeps its picks');
  assert.equal(P.diyPresetStore.get().notice, n);
  assert.equal(P.undoFactionPreset(), true);
  assert.deepEqual(loadoutStore.get().diy, { [T6A]: WIS });
  assert.equal(P.diyPresetStore.get().active, null);
  assert.deepEqual(P.diyPresetStore.get().presets.yan, { [T6A]: WANG, [T6B]: CHEN }, 'undo leaves the preset alone');
  assert.equal(P.undoFactionPreset(), false);

  // the preset already shown: no notice
  P.selectPreset('yan');
  assert.equal(P.applyFactionPreset('yan'), null);
  assert.equal(P.diyPresetStore.get().notice, null);
  // a faction without a preset while a preset is shown: still nothing changes
  assert.equal(P.applyFactionPreset('sargon'), null);
  assert.deepEqual(loadoutStore.get().diy, { [T6A]: WANG, [T6B]: CHEN });
});

test('the tab draws the bar: 不使用预设 + eight factions, saved ones filled, the linked one on, 删除 for it', () => {
  const tree = DiyPresetBar({ presets: { yan: { [T6A]: WANG } }, active: 'yan', onSelect() {}, onDelete() {} });
  const flat = JSON.stringify(tree, (k, v) => (k === '__o' || typeof v === 'function' ? undefined : v));
  const chips = [...flat.matchAll(/"data-preset":"([a-z]*)"/g)].map((x) => x[1]);
  assert.deepEqual(chips, ['', 'yan', 'sargon', 'victoria', 'kjerag', 'laterano', 'aegir', 'siracusa', 'kazimierz']);
  assert.match(flat, /diy-preset has-preset is-on/);
  assert.match(flat, /diy-preset-delete/);
  const none = JSON.stringify(DiyPresetBar({ presets: {}, active: null, onSelect() {}, onDelete() {} }), (k, v) => (typeof v === 'function' ? undefined : v));
  assert.doesNotMatch(none, /diy-preset-delete/);
  // the view takes the bar only when given its handlers (the older callers and tests draw no bar)
  const panel = (extra) => JSON.stringify(DiyPanelView({ m: null, picks: {}, legal: {}, kitted: null, onSet() {}, picking: null, onPicking() {}, ...extra }), (k, v) => (typeof v === 'function' ? (v.name || 'fn') : v));
  assert.doesNotMatch(panel({}), /DiyPresetBar/);
  assert.match(panel({ presets: {}, activePreset: null, onPreset() {}, onPresetDelete() {} }), /DiyPresetBar/);
});

test('a faction pick applies its preset out of a match and in its briefing / strategy draft only (maintainer 2026-10-09)', () => {
  assert.equal(presetPickLive({ room: { inMatch: false } }), true);
  assert.equal(presetPickLive({ room: null }), true);
  for (const phase of ['INFO_CHECK', 'BAND_DRAFT']) assert.equal(presetPickLive({ room: { inMatch: true }, match: { public: { phase } } }), true, phase);
  for (const phase of ['PREP', 'COMBAT', 'SP_DRAFT', 'FINAL_ASSAULT']) assert.equal(presetPickLive({ room: { inMatch: true }, match: { public: { phase } } }), false, phase);
});
