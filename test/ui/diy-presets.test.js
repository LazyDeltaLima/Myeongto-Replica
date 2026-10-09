// 진영별 선발 프리셋 (local feature, user decisions 2026-10-09 8–10; public/js/ui/diyPresets.js): per-browser 自选 presets
// per chat faction, all empty at first; the 自选编队 tab's bar makes / applies / links / deletes them, edits follow the
// linked preset, and a chat faction pick applies that faction's preset with a 撤销 (a faction without one changes nothing).
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
  P.diyPresetStore.set({ presets: {}, active: null, notice: null });
  setDiyPicks({});
  mem.delete(`sp.pref.${P.DIY_PRESETS_PREF}`);
});

test('stored presets: only chat factions and clean picks; the link only to a preset that exists', () => {
  const got = P.parseStoredPresets({ v: 1, presets: { yan: { [T6A]: WANG, junk: 3 }, nowhere: { [T6A]: WANG }, kjerag: 'x' }, active: 'kjerag' });
  assert.deepEqual(Object.keys(got.presets), ['yan']);
  assert.deepEqual(got.presets.yan, { [T6A]: WANG });
  assert.equal(got.active, null);
  assert.deepEqual(P.parseStoredPresets(null), { presets: {}, active: null });
  assert.equal(P.parseStoredPresets({ presets: { yan: {} }, active: 'yan' }).active, 'yan', 'an empty preset (no 自选 at all) is a preset');
});

test('the bar: an empty faction is made from the current picks and linked; edits follow it; 不使用预设 unlinks', () => {
  setDiyPicks({ [T6A]: WANG });
  P.selectPreset('yan');
  assert.equal(P.diyPresetStore.get().active, 'yan');
  assert.deepEqual(P.diyPresetStore.get().presets.yan, { [T6A]: WANG });
  setDiyPicks({ [T6A]: WANG, [T6B]: CHEN });
  assert.deepEqual(P.diyPresetStore.get().presets.yan, { [T6A]: WANG, [T6B]: CHEN }, 'an edit is saved into the linked preset');
  assert.deepEqual(stored().presets.yan, { [T6A]: WANG, [T6B]: CHEN }, 'and persisted');
  P.selectPreset(null);
  setDiyPicks({ [T6A]: WIS });
  assert.deepEqual(P.diyPresetStore.get().presets.yan, { [T6A]: WANG, [T6B]: CHEN }, 'unlinked: the preset stays');
  P.selectPreset('yan');
  assert.deepEqual(loadoutStore.get().diy, { [T6A]: WANG, [T6B]: CHEN }, 'a saved preset is applied');
  P.deletePreset('yan');
  assert.equal(P.diyPresetStore.get().active, null);
  assert.equal(P.diyPresetStore.get().presets.yan, undefined);
  assert.deepEqual(loadoutStore.get().diy, { [T6A]: WANG, [T6B]: CHEN }, 'deleting keeps the picks');
});

test('chat pick: a faction without a preset changes nothing; with one, the picks change and 撤销 restores them', () => {
  setDiyPicks({ [T6A]: WIS });
  assert.equal(P.applyFactionPreset('yan'), null);
  assert.deepEqual(loadoutStore.get().diy, { [T6A]: WIS });
  assert.equal(P.diyPresetStore.get().active, null);

  P.diyPresetStore.set({ presets: { yan: { [T6A]: WANG, [T6B]: CHEN } } });
  const n = P.applyFactionPreset('yan', { inMatch: true, now: 5 });
  assert.equal(n.factionId, 'yan');
  assert.equal(n.inMatch, true);
  assert.equal(n.canReroll, false, 'past the briefing: no reroll to mention');
  assert.deepEqual(loadoutStore.get().diy, { [T6A]: WANG, [T6B]: CHEN });
  assert.equal(P.diyPresetStore.get().active, 'yan');
  assert.equal(P.diyPresetStore.get().notice, n);
  assert.equal(P.undoFactionPreset(), true);
  assert.deepEqual(loadoutStore.get().diy, { [T6A]: WIS });
  assert.equal(P.diyPresetStore.get().active, null);
  assert.deepEqual(P.diyPresetStore.get().presets.yan, { [T6A]: WANG, [T6B]: CHEN }, 'undo leaves the preset alone');
  assert.equal(P.undoFactionPreset(), false);

  setDiyPicks({ [T6A]: WIS });
  assert.equal(P.applyFactionPreset('yan', { inMatch: true, canReroll: true }).canReroll, true, 'in the briefing a reroll takes it');
  P.undoFactionPreset();

  // the picks already are the preset: linked, no notice
  P.selectPreset('yan');
  P.selectPreset(null);
  assert.equal(P.applyFactionPreset('yan'), null);
  assert.equal(P.diyPresetStore.get().active, 'yan');
  assert.equal(P.diyPresetStore.get().notice, null);
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
