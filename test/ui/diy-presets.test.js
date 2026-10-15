// 맹약별 선발 프리셋 (local feature, maintainer decisions 2026-10-09; public/js/ui/diyPresets.js): per-browser 自选 rosters,
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
await data.loadAll('chess', 'bonds', 'assets', 'backups', 'bands');

const T6A = 'chess_char_6_diy1_a';
const T6B = 'chess_char_6_diy2_a';
const WANG = { charId: 'char_2027_wang', skillIndex: 2, uniEquipId: null };
const CHEN = { charId: 'char_1050_chen3', skillIndex: 1, uniEquipId: null };
const WIS = { charId: 'char_1035_wisdel', skillIndex: 2, uniEquipId: null };
const stored = () => JSON.parse(mem.get(`sp.pref.${P.DIY_PRESETS_PREF}`) || 'null');

P.installDiyPresets();
beforeEach(() => {
  P.diyPresetStore.set({ presets: {}, base: {}, active: null, links: {}, notice: null });
  setDiyPicks({});
  mem.delete(`sp.pref.${P.DIY_PRESETS_PREF}`);
});

test('stored rosters: only chat factions, clean and non-empty picks; a v1 envelope takes the live picks as base', () => {
  const got = P.parseStoredPresets({ v: 2, presets: { yan: { [T6A]: WANG, junk: 3 }, nowhere: { [T6A]: WANG }, kjerag: 'x', sargon: {} }, base: { [T6A]: WIS }, active: 'kjerag' });
  assert.deepEqual(Object.keys(got.presets), ['yan']);
  assert.deepEqual(got.presets.yan, { [T6A]: WANG });
  assert.deepEqual(got.base, { [T6A]: WIS });
  assert.equal(got.active, 'kjerag', 'an empty faction may be the one shown');
  assert.deepEqual(P.parseStoredPresets(null), { presets: {}, base: {}, active: null, links: {} });
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

test('전략별 선발 프리셋 (maintainer 2026-10-12): links persist, a strategy without one falls back to its nation bond, else keeps the picks', () => {
  const got = P.parseStoredPresets({ v: 3, presets: {}, base: {}, active: null, links: { band_paganini: 'laterano', band_chen: 'base', band_x: 'nowhere', junk: 'yan' } });
  assert.deepEqual(got.links, { band_paganini: 'laterano', band_chen: 'base' });
  assert.deepEqual(P.parseStoredPresets({ v: 2, presets: {}, base: {}, active: null }).links, {}, 'a v2 envelope has none');
  P.linkBand('band_paganini', 'laterano');
  P.linkBand('band_chen', 'yan');
  assert.deepEqual(P.diyPresetStore.get().links, { band_paganini: 'laterano', band_chen: 'yan' });
  assert.equal(stored().v, 3);
  assert.deepEqual(stored().links, { band_paganini: 'laterano', band_chen: 'yan' }, 'persisted');
  P.linkBand('band_chen', null);
  assert.deepEqual(P.diyPresetStore.get().links, { band_paganini: 'laterano' }, 'cleared');
  P.linkBand('band_paganini', 'nowhere');
  assert.deepEqual(P.diyPresetStore.get().links, {}, 'an unknown target clears it too');
  // the recommendation: bands.json bondIds ∩ the chat factions
  const bands = data.list('bands');
  const pag = bands.find((b) => b.bandId === 'band_paganini');
  const bld = bands.find((b) => b.bandId === 'band_bldsk');
  assert.equal(P.bandRecommendation(pag), 'laterano');
  assert.equal(P.bandRecommendation(bld), null);
  assert.equal(bands.filter((b) => P.bandRecommendation(b)).length, 9, '9 of the 40 strategies are built around a nation bond');
  assert.equal(P.bandPresetChoice('band_paganini', pag, {}), 'laterano', 'no link: the recommendation');
  assert.equal(P.bandPresetChoice('band_paganini', pag, { band_paganini: 'base' }), 'base', 'a link wins');
  assert.equal(P.bandPresetChoice('band_bldsk', bld, {}), P.KEEP_LINK, 'neither: keep the picks');
});

test('a 推荐 can be unlinked (maintainer request 2026-10-13): KEEP_LINK turns the recommendation off, and the grid toggles', () => {
  const bands = data.list('bands');
  const pag = bands.find((b) => b.bandId === 'band_paganini');
  const chen = bands.find((b) => b.bandId === 'band_chen');
  P.diyPresetStore.set({ links: {} });
  assert.deepEqual(P.parseStoredPresets({ v: 3, presets: {}, base: {}, active: null, links: { band_paganini: 'keep' } }).links, { band_paganini: 'keep' }, 'stored');
  assert.equal(P.bandPresetChoice('band_paganini', pag, { band_paganini: P.KEEP_LINK }), P.KEEP_LINK, 'turned off: keep the picks');
  assert.equal(P.bandLinkTarget(pag, {}), 'laterano', 'the recommendation applies');
  assert.equal(P.bandLinkTarget(pag, { band_paganini: P.KEEP_LINK }), null);
  assert.equal(P.bandLinkTarget(pag, { band_paganini: 'yan' }), 'yan', 'a link wins');
  // the recommended strategy: off, then back to recommended (no link)
  P.toggleBandLink(pag, 'laterano');
  assert.deepEqual(P.diyPresetStore.get().links, { band_paganini: 'keep' });
  assert.deepEqual(stored().links, { band_paganini: 'keep' }, 'persisted');
  P.toggleBandLink(pag, 'laterano');
  assert.deepEqual(P.diyPresetStore.get().links, {});
  // from another roster it is linked there, and unlinked from there it goes back to its recommendation
  P.toggleBandLink(pag, 'yan');
  assert.deepEqual(P.diyPresetStore.get().links, { band_paganini: 'yan' });
  P.toggleBandLink(pag, 'yan');
  assert.deepEqual(P.diyPresetStore.get().links, {});
  // a linked recommended strategy unlinked from its own faction is turned off
  P.linkBand('band_paganini', 'laterano');
  P.toggleBandLink(pag, 'laterano');
  assert.deepEqual(P.diyPresetStore.get().links, { band_paganini: 'keep' });
  // a strategy without a recommendation: link, move, unlink
  P.diyPresetStore.set({ links: {} });
  P.toggleBandLink(chen, 'yan');
  P.toggleBandLink(chen, P.BASE_LINK);
  assert.deepEqual(P.diyPresetStore.get().links, { band_chen: 'base' }, 'moved');
  P.toggleBandLink(chen, P.BASE_LINK);
  assert.deepEqual(P.diyPresetStore.get().links, {});
});

test('不使用预设 by a strategy link: the base roster is shown with a notice and 撤销', () => {
  setDiyPicks({ [T6A]: WIS }); // 不使用预设 shown: its roster follows
  P.diyPresetStore.set({ presets: { yan: { [T6A]: WANG } } });
  P.selectPreset('yan');
  const n = P.applyBasePreset({ inMatch: true, now: 1 });
  assert.equal(n.base, true);
  assert.equal(n.factionId, null);
  assert.equal(P.diyPresetStore.get().active, null);
  assert.deepEqual(loadoutStore.get().diy, { [T6A]: WIS });
  assert.equal(P.undoFactionPreset(), true);
  assert.equal(P.diyPresetStore.get().active, 'yan');
  assert.deepEqual(loadoutStore.get().diy, { [T6A]: WANG });
  P.selectPreset(null);
  assert.equal(P.applyBasePreset(), null, 'already shown');
});

test('the tab lists the strategies applying the roster shown (icon, dashed suggestions, ×) and the strategy grid', async () => {
  const { PresetBandLinksView } = await import('../../public/js/screens/diy.js');
  const bands = data.list('bands');
  const flat = (tree) => JSON.stringify(tree, (k, v) => (k === '__o' || typeof v === 'function' ? undefined : v));
  const a = flat(PresetBandLinksView({ target: 'laterano', links: { band_chen: 'laterano' }, bands, onToggle() {} }));
  assert.match(a, /data-band":"band_chen"/);
  assert.match(a, /"bandId":"band_chen"/, 'the chip carries the strategy icon');
  assert.match(a, /"diy-link is-rec","data-band":"band_paganini"/, '파가니니 suggested while unlinked');
  assert.doesNotMatch(a, /diy-band-grid/, 'the grid is closed');
  const b = flat(PresetBandLinksView({ target: 'laterano', links: { band_paganini: 'yan' }, bands, onToggle() {} }));
  assert.doesNotMatch(b, /data-band":"band_paganini"/, 'linked elsewhere: no suggestion');
  const off = flat(PresetBandLinksView({ target: 'laterano', links: { band_paganini: 'keep' }, bands, onToggle() {} }));
  assert.doesNotMatch(off, /data-band":"band_paganini"/, 'a turned-off suggestion is gone');
  // the open grid: every strategy a toggle — ✓ here (dashed by recommendation), dimmed with the other roster's mark
  const g = PresetBandLinksView({ target: 'laterano', links: { band_chen: 'laterano', band_amiya: 'yan', band_dusk: 'base' }, bands, onToggle() {}, open: true });
  const tiles = [];
  const walk = (n) => { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === 'object') { if (n.props?.['data-band'] && String(n.props.class || '').includes('diy-band')) tiles.push(n.props); Object.values(n.props || {}).forEach(walk); } };
  walk(g);
  const tile = (id) => tiles.find((p) => p['data-band'] === id);
  assert.equal(tiles.length, 40, 'all 40 strategies');
  assert.equal(tile('band_chen').class, 'diy-band is-here');
  assert.equal(tile('band_chen')['aria-pressed'], 'true');
  assert.equal(tile('band_paganini').class, 'diy-band is-here is-rec');
  assert.equal(tile('band_amiya').class, 'diy-band is-other');
  assert.equal(tile('band_dusk').class, 'diy-band is-other');
  assert.equal(tile('band_bldsk').class, 'diy-band');
  assert.equal(tile('band_bldsk')['aria-pressed'], 'false');
  const bar = flat(DiyPresetBar({ presets: {}, active: null, onSelect() {}, onDelete() {}, links: {}, bands, onToggle() {} }));
  assert.match(bar, /"target":"base"/);
});

test('the strategy draft\'s preset row: a filled slot\'s × empties it in the roster the row shows (maintainer request 2026-10-13)', async () => {
  // the roster shown (base) takes it through the live picks
  setDiyPicks({ [T6A]: WIS, [T6B]: CHEN });
  P.diyPresetStore.set({ presets: { yan: { [T6A]: WANG, [T6B]: CHEN }, sargon: { [T6A]: WIS } } });
  P.clearRosterSlot(P.BASE_LINK, T6B);
  assert.deepEqual(loadoutStore.get().diy, { [T6A]: WIS });
  assert.deepEqual(P.diyPresetStore.get().base, { [T6A]: WIS }, 'the shown roster follows');
  // another faction's preset is only stored: the live picks and the roster shown stay
  P.clearRosterSlot('yan', T6A);
  assert.deepEqual(P.diyPresetStore.get().presets.yan, { [T6B]: CHEN });
  assert.deepEqual(stored().presets.yan, { [T6B]: CHEN }, 'persisted');
  assert.deepEqual(loadoutStore.get().diy, { [T6A]: WIS });
  assert.equal(P.diyPresetStore.get().active, null);
  // its last pick: the faction has no preset any more (as the tab's 清空)
  P.clearRosterSlot('sargon', T6A);
  assert.equal(P.diyPresetStore.get().presets.sargon, undefined);
  // 保持当前编队: the picks in use, whichever roster is shown
  P.selectPreset('yan');
  P.clearRosterSlot(P.KEEP_LINK, T6B);
  assert.deepEqual(loadoutStore.get().diy, {});
  assert.equal(P.diyPresetStore.get().presets.yan, undefined);
  // an empty slot or an unknown roster: nothing
  P.clearRosterSlot('nowhere', T6A);
  P.clearRosterSlot(P.BASE_LINK, T6B);
  assert.deepEqual(P.diyPresetStore.get().base, { [T6A]: WIS });

  // the row: × on a filled slot it can edit, none on an empty one, a locked row or without the handler
  const { DraftPresetRow } = await import('../../public/js/screens/bandDraft.js');
  const band = data.list('bands').find((b) => b.bandId === 'band_paganini');
  const walk = function* (v) {
    if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
    if (!v || typeof v !== 'object') return;
    yield v;
    yield* walk(v.props?.children);
  };
  const cleared = [];
  const row = (extra) => [...walk(DraftPresetRow({ band, choice: 'yan', link: null, presets: { yan: { [T6A]: WANG } }, base: {}, live: {}, off: null,
    locked: false, remember: true, onChoice() {}, onRemember() {}, onEdit() {}, onClear: (id) => cleared.push(id), ...extra }))];
  const rm = (nodes) => nodes.filter((v) => v.props?.['data-testid'] === 'draft-preset-remove');
  const nodes = row({});
  assert.equal(rm(nodes).length, 1, 'only the filled slot');
  assert.equal(nodes.filter((v) => v.props?.['data-testid'] === 'draft-preset-swap').length, 1, 'its swap stays');
  rm(nodes)[0].props.onClick();
  assert.deepEqual(cleared, [T6A]);
  assert.equal(rm(row({ locked: true })).length, 0, 'a locked row');
  assert.equal(rm(row({ onClear: null })).length, 0, 'no handler');
});
