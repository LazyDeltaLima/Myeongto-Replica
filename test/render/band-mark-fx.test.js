// test/render/band-mark-fx.test.js — 规程's 指令 marks drawn in the prep (2026-11-12, docs/rules/fx.md 「규정 액티브 전략의
// 표식·칸 이펙트」): the strategy effect's blackboard names the prefab over the marked operator (`skill_target_effect`) and on the
// marked tile (`effect`) — render/fxband.js holds them as a table pinned here to the data; the real match's view
// (m.private.bandSkill.marks / chests) feeds it; 宝藏探机's chest is drawn as its enemy record's model (app/info.js
// deviceAsEnemy) in the prep and in the battle; and a walking ally's `walks` survives renderInfo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACT3, ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch, give, legalTileFor } from '../match/harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { FIELD } from '../../server/match/board.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { BAND_CHEST } from '../../server/sim/content/bands/meta.js';
import { unitInfo } from '../../server/sim/snapshot.js';
import { renderInfo, deviceAsEnemy } from '../../public/js/render/app/info.js';
import { BAND_MARK_FX, BAND_TILE_FX, BAND_FX_BUNDLE, bandMarksOf, bandMarkFxByUid, bandTileFx, syncBandMarks, bandMarkKey } from '../../public/js/render/fxband.js';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const OK = { ok: true };
const quiet = { error() {}, warn() {}, info() {}, log() {} };
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const EFFECTS = JSON.parse(read('data/seasons/act3autochess/effects.json'));

function setup({ band, funds = 30, seed = 7, round = 1 }) {
  const reg = createRegistry({ data: ACT3_ON_BASE_FIELD, log: quiet });
  const h = makeMatch({ mode: 'solo', humans: 1, seed, registry: reg, fake: true, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(1, { band: 'band_amiya' });
  const m = h.m;
  m.round = round;
  const ps = h.ps('p_0');
  ps.bandId = band; ps.counters = {}; ps.funds = funds; ps.offers.length = 0; ps.ready = false;
  for (const l of [...ps.board.keys()]) ps.board.delete(l);
  ps.hand.fill(null); ps.temp.fill(null);
  ps.recompute();
  const use = (target = {}) => m.handle('p_0', { t: 'g.bandSkill', ...target });
  return { m, ps, use };
}
const visible = Object.values(ACT3.chess).filter((c) => c.visible && !c.isGolden && !c.isDiy && c.goldenId);
const onBoard = (m, ps, id) => { const at = legalTileFor(m, ps, id); assert.ok(at, `a tile for ${id}`); return give(m, ps, id, 'board', at); };
function tileOf(m, ps, filter) {
  for (let r = FIELD.r0; r <= FIELD.r1; r++) for (let c = FIELD.c0; c <= FIELD.c1; c++) if (m._bandSkillTile(ps, r, c, filter)) return [r, c];
  return null;
}

test('the mark prefabs are the strategy effects\' own: every `skill_target_effect` and tile `effect` of effects.json, nothing else', () => {
  const chess = {}, tile = {};
  for (const [id, rec] of Object.entries(EFFECTS)) {
    const p = rec.params || {};
    if (p.skill_target_chess && typeof p.skill_target_effect === 'string') chess[id] = p.skill_target_effect;
    if (p.skill_target_tile && typeof p.effect === 'string') tile[id] = p.effect;
  }
  assert.deepEqual(BAND_MARK_FX, chess);
  assert.deepEqual(BAND_TILE_FX, tile);
});

test('the real view\'s operator mark (意志鼓舞) → map_v079_squad_02 over that operator; a passive strategy\'s view has no marks', () => {
  const { m, ps, use } = setup({ band: 'band_survive' });
  const p = onBoard(m, ps, visible.find((c) => c.tier === 2).chessId);
  assert.deepEqual(use({ uid: p.uid }), OK);
  const priv = ps.privateView();
  const by = bandMarkFxByUid(bandMarksOf(priv));
  assert.deepEqual([...by].map(([u, s]) => [u, [...s]]), [[p.uid, ['map_v079_squad_02']]]);
  assert.deepEqual(bandTileFx(bandMarksOf(priv)), []);
  assert.deepEqual(bandMarksOf({ bandSkill: { usable: false, marks: [], chests: [] } }), []);
  assert.deepEqual(bandMarksOf({}), []);
});

test('the real view\'s tile mark (溃心领域) → map_v079_dikuai02 on that board tile, once per tile', () => {
  const { m, ps, use } = setup({ band: 'band_dance' });
  const t = tileOf(m, ps, 'PASSABLE');
  assert.ok(t, 'a passable tile');
  assert.deepEqual(use({ row: t[0], col: t[1] }), OK);
  const marks = bandMarksOf(ps.privateView());
  assert.deepEqual(bandTileFx(marks), [{ bundle: BAND_FX_BUNDLE, name: 'map_v079_dikuai02', row: t[0], col: t[1] }]);
  assert.equal(bandTileFx([...marks, ...marks]).length, 1, 'two marks on one tile: one floor');
  assert.equal(bandMarkFxByUid(marks).size, 0);
});

test('宝藏探机\'s chest: the view\'s chest and the battle\'s device are drawn as enemy_9038_achest\'s model (walks), a plain device stays a box', () => {
  const { m, ps, use } = setup({ band: 'band_treasure' });
  const t = tileOf(m, ps, 'PASSABLE_AND_BUILDABLE');
  assert.deepEqual(use({ row: t[0], col: t[1] }), OK);
  assert.deepEqual(ps.privateView().bandSkill.chests, [{ row: t[0], col: t[1], enemyId: 'enemy_9038_achest' }]);
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'ch', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  b.start();
  const id = ps.effects.find((e) => e.key === BAND_CHEST).id;
  const ch = b.allyUnits.find((u) => u.mem?.bandChest === id);
  const info = renderInfo(JSON.parse(JSON.stringify(unitInfo(ch))));
  assert.equal(info.kind, 'device');
  const rec = ACT3.enemies.enemy_9038_achest;
  const drawn = deviceAsEnemy(info, rec);
  assert.equal(drawn.walks, true, 'the walking-ally path: the enemy record\'s model and bindings');
  assert.equal(drawn.spine, rec.spine || 'enemy_9038_achest');
  assert.equal(deviceAsEnemy(info, null), info, 'no record: a DeviceView box');
  assert.equal(deviceAsEnemy({ ...info, kind: 'op' }, rec).walks, undefined, 'only a device');
});

test('renderInfo keeps a walking ally\'s `walks` (it was dropped: a real match drew 莱塔尼亚\'s summons as plain summons)', () => {
  assert.equal(renderInfo({ id: 1, side: 'ally', kind: 'token', walks: true }).walks, true);
  assert.equal(renderInfo({ id: 1, side: 'ally', kind: 'token' }).walks, undefined);
});

test('syncBandMarks: each own prep piece wears its marks\' effects at the prefab\'s own place, drops the unmarked ones, none outside the prep', () => {
  const calls = [];
  const fx = {
    statusReady: () => true,
    statusOn(v, b, n, k, frac) { calls.push(['on', v.uid, b, n, k, frac]); (v._fxStatusOn ||= new Set()).add(k); },
    statusOff(v, k, now) { calls.push(['off', v.uid, k, now]); v._fxStatusOn.delete(k); },
  };
  const a = { uid: 1, alive: true }, c = { uid: 2, alive: true }, mate = { uid: 1, alive: true };
  const views = new Map([['p:1', a], ['p:2', c], ['m:1', mate]]);
  syncBandMarks(views, fx, true, bandMarkFxByUid([{ effectId: 'eff_band14', uid: 1 }, { effectId: 'eff_band24', itemId: 'x' }]));
  assert.deepEqual(calls.splice(0), [['on', 1, 'map', 'map_v079_squad_03', bandMarkKey('map_v079_squad_03'), 'own']]);
  syncBandMarks(views, fx, true, bandMarkFxByUid([{ effectId: 'eff_band14', uid: 1 }]));
  assert.deepEqual(calls.splice(0), [], 'held, not started again');
  syncBandMarks(views, fx, true, bandMarkFxByUid([{ effectId: 'eff_band22', uid: 2 }]));
  assert.deepEqual(calls.splice(0), [['off', 1, bandMarkKey('map_v079_squad_03'), true], ['on', 2, 'map', 'map_v079_squad_04', bandMarkKey('map_v079_squad_04'), 'own']]);
  c._fxStatusOn.add('golden');
  syncBandMarks(views, fx, false, bandMarkFxByUid([{ effectId: 'eff_band22', uid: 2 }]));
  assert.deepEqual(calls.splice(0), [['off', 2, bandMarkKey('map_v079_squad_04'), true]], 'outside the prep: gone; another key (the elite glow) left alone');
});

test('setBandTiles: one floor per prefab and tile, on the floor layer, pinned; again after clear()', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const files = { '/assets/local/fx/index.json': { bundles: { map: ['map_v079_dikuai02'] } } };
    globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
    const seen = [];
    const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p) });
    const list = [{ bundle: 'map', name: 'map_v079_dikuai02', x: 3, y: 4, z: 0.2 }, { bundle: 'map', name: 'map_v079_dikuai02', x: 3, y: 4, z: 0.2 },
      { bundle: 'map', name: 'map_v079_not_extracted', x: 1, y: 1 }];
    assert.equal(L.setBandTiles(list), false, 'the index not loaded yet: call again');
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(L.setBandTiles(list), true);
    const tiles = () => seen.splice(0).filter((p) => p.kind === 'spawn' && p.tag === 'bandTile').map((p) => p.names[0]);
    assert.deepEqual(tiles(), ['map_v079_dikuai02'], 'one, the extracted one');
    L.clear();
    L.setBandTiles(list);
    assert.deepEqual(tiles(), ['map_v079_dikuai02'], 'clear() took it: laid again');
  } finally { globalThis.fetch = fetch0; }
});

test('the prep view wires them: setPrep reads the marks and the chests, the frame syncs them in the prep, a device of an enemy record is no DeviceView', () => {
  const src = read('public/js/render/app.js');
  assert.match(src, /const marks = bandMarksOf\(src\);/);
  assert.match(src, /syncChests\(Array\.isArray\(src\.bandSkill\?\.chests\) \? src\.bandSkill\.chests : \[\]\);/);
  assert.match(src, /if \(mode === 'prep' && \(bandMarkUids\.size \|\| bandSync \|\| bandTilesWait\)\)/);
  assert.match(src, /info\.kind === 'device' && !deviceInfo\(info\)\.walks \? new DeviceView\(ctx, info\)/);
});
