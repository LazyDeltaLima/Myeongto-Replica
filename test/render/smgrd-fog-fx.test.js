// test/render/smgrd-fog-fx.test.js — “邪魔的利刃”'s 【国度】 tiles drawn by their official effect (2026-11-26, docs/rules/sim.md
// 「적 비행 유닛 공격 전수 조사」 '데몬의 칼날' 화면, docs/rules/fx.md 「적 이펙트 바인딩」): its talent's buff makes the
// tile-binding global buff rogue_3_blackfog[random_tile] (SharedRandomTileGlobalBuff), whose `_tileEffect`
// enemy_smgrd_buff_03_range TryAddBindingTiles creates on every tile it adds, held to the battle's end. The sim's kit sends
// fx 'tileBind' with the tiles each step adds (and Battle.fieldMeta `tileBind` the whole list); the render lays the effect
// that enemy-modes.json `tileBind` names on each (tools/local-extract/enemy_bindings.py reads the global buff prefab; it did
// not: nothing was drawn). The events come from the real kit (server/sim/content/enemies/leaders.js); the render runs on a
// sample binding (the extracted one is compared at the end). One layer for the file: a second createFxLayer reads the
// first one's tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import { COLS } from '../../server/sim/constants.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const MODES = new URL('../../public/assets/local/fx/enemy-modes.json', import.meta.url);
const SMGRD = 'enemy_2048_smgrd', GB = 'rogue_3_blackfog[random_tile]', FX = 'enemy_smgrd_buff_03_range';
const wall = (id) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });

let layerP = null;
function layer() {
  layerP ||= (async () => {
    const m = { $fx: { [FX]: ['b', FX] }, [SMGRD]: { modes: [{ name: 'Default', anim: ['Attack'] }], tileBind: { [GB]: [FX] } } };
    const files = { '/assets/local/fx/index.json': { bundles: { b: [FX] } }, '/assets/local/fx/enemy-modes.json': m };
    globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
    const seen = [];
    const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p) });
    await new Promise((r) => setTimeout(r, 10));
    return { L, seen };
  })();
  return layerP;
}
const settle = () => new Promise((r) => setTimeout(r, 10));

/** The boss walking from (10, 8) on a field with a wall, its 'tileBind' fx and the battle. */
function walk(sec) {
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600, enemies: [], captureNoisy: true,
    defs: { chess: { t_wall: wall('t_wall') } }, kits: { t_wall: () => ({ trait: { noAttack: true } }) },
    units: [{ chessId: 't_wall', row: 12, col: 3, uid: 1 }],
  });
  h.step();
  const e = h.spawn(SMGRD, { pos: [10, 8], routeIndex: 0, mods: { speedMul: 1 }, tag: null });
  e.profile.noAttack = true;
  h.run(sec);
  return { h, e, evs: h.events.filter((x) => x[0] === 'fx' && x[1] === 'tileBind') };
}

test('“邪魔的利刃”: each step of its 【国度】 sends the tiles it adds (fx tileBind), the field meta keeps the whole list', () => {
  const { h, e, evs } = walk(8);
  assert.ok(evs.length >= 2, `the first 3×3 and at least one step on: ${evs.length}`);
  for (const x of evs) assert.deepEqual([x[4].id, x[4].by, x[4].key], [e.id, SMGRD, GB], 'its id, binding and global buff');
  const buildable = ([x, y]) => h.b.grid.inBounds(y, x) && h.b.grid.tile(y, x).build !== 'NONE';
  const first = evs[0][4].tiles;
  const around = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) around.push([8 + dc, 10 + dr]);
  assert.deepEqual(first, around.filter(buildable), 'the first: the buildable tiles of the 3×3 around its tile');
  const all = evs.flatMap((x) => x[4].tiles);
  assert.equal(new Set(all.map(([x, y]) => y * COLS + x)).size, all.length, 'a tile is sent once (TryAddBindingTiles adds only new ones)');
  assert.ok(evs.slice(1).every((x) => x[4].tiles.length > 0 && x[4].tiles.length <= 3 * 3), 'each later step only the new tiles');
  assert.deepEqual(h.b.fieldMeta().tileBind, [{ key: GB, by: SMGRD, tiles: all }], 'Battle.fieldMeta `tileBind`: every tile so far, in order');
  h.b.kill(e, null);
  h.run(1);
  assert.equal(h.events.filter((x) => x[0] === 'fx' && x[1] === 'tileBind').length, evs.length, 'nothing more once it is gone');
  assert.deepEqual(h.b.fieldMeta().tileBind?.[0].tiles, all, 'the tiles stay after the boss (nothing removes the global buff)');
});

test('the render lays enemy_smgrd_buff_03_range on each 【国度】 tile, pinned, once per tile, and again from the field meta after a re-entry', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { L, seen } = await layer();
    const { h, evs } = walk(8);
    const views = new Map();
    const laid = () => seen.filter((p) => p.kind === 'spawn' && p.tag === 'tileBind');
    seen.length = 0;
    for (const x of evs) { L.onEvent(x, views); assert.equal(L.ownsFx(x), true, 'owned: no stand-in'); }
    L.onEvent(evs[0], views);   // the same tiles again: no second copy
    await settle();
    const all = evs.flatMap((x) => x[4].tiles);
    assert.deepEqual(laid().map((p) => p.names[0]), all.map(() => FX), `one ${FX} per tile (enemy-modes.json tileBind — docs/rules/fx.md 「적 이펙트 바인딩」)`);
    assert.deepEqual(laid().map((p) => p.pt), all.map(([x, y]) => [x, y, 0]), 'on its tile');
    assert.ok(laid().every((p) => p.pinned && p.by === null), 'pinned, owned by no unit: held to the battle\'s end, through the boss\'s knock-out');
    // a re-entry (render/app.js enterBattle): clear(), then the meta's list
    L.clear();
    seen.length = 0;
    L.setTileBinds(h.b.fieldMeta().tileBind);
    await settle();
    assert.equal(laid().length, all.length, 'every tile laid again after a re-entry — the fx names each tile once');
    L.clear();
  } finally { globalThis.fetch = fetch0; }
});

test('the extracted binding: the global buff\'s `_tileEffect` in tileBind, the effect extracted', { skip: !existsSync(MODES) && 'no extracted enemy effects' }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8'));
  assert.deepEqual(m[SMGRD]?.tileBind, { [GB]: [FX] }, `${SMGRD} tileBind (tools/local-extract/enemy_bindings.py read_global_buffs → template_info \`tileBind\`)`);
  assert.ok(m.$fx[FX], `${FX} extracted (enemy_bindings.py --extract --id ${SMGRD})`);
});
