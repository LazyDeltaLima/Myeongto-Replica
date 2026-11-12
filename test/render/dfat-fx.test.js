// test/render/dfat-fx.test.js — 规程's 萨卡兹子裔责罚者 / 惩戒者 StunAttack drawn by its official effects (2026-11-12,
// docs/rules/fx.md 「규정 살카즈 후예 무리」): its ready mark enemy_dfat_skill_hint (ReadyEnemySkillEffect) from the SP filling
// to the cast's finish; the cast's ON_SPELL_ON effect enemy_dfat_skill_start_01 at the strike (the sim's 'explode'
// dfatStun), not at the cast's start; the strike draws no stand-in blast, its hit effect on the unit it stuns. The sim's events
// come from the real 规程 kit (content/enemies/reborn.js kitDfat); the render runs on a sample binding (the extracted one is
// compared at the end).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { getData } from '../../server/data.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const MODES = new URL('../../public/assets/local/fx/enemy-modes.json', import.meta.url);
const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = getData({ log: quiet, season: 'act3autochess' });
const DFAT = 'enemy_1362_dfat';
const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });

// the parts of the extracted binding these cases read (enemy-modes.json, enemy_bindings.py)
const MELEE = { cast: ['enemy_dfat_attack_start_01', 'enemy_dfat_attack_start_02'],
  opt: { enemy_dfat_attack_start_01: { s: 2, e: 3, o: 1 }, enemy_dfat_attack_start_02: { s: 2, e: 3, o: 1 } }, hit: ['enemy_dfat_attack_hit'] };
const STUN = { cast: ['enemy_dfat_skill_start_01'], opt: { enemy_dfat_skill_start_01: { s: 4, e: 3, o: 1 } }, hit: ['enemy_dfat_skill_hit'], ready: ['enemy_dfat_skill_hint'], anim: 'Skill' };
const emodes = () => ({ [DFAT]: { modes: [{ name: 'Default', anim: ['Attack'], melee: MELEE, ranged: MELEE }], skills: { stunattack: STUN } } });
const NAMES = [...new Set(JSON.stringify(emodes()).match(/"enemy_dfat_[a-z0-9_]+"/g).map((s) => JSON.parse(s)))];

async function layer() {
  const m = emodes();
  m.$fx = Object.fromEntries(NAMES.map((n) => [n.toLowerCase(), ['b', n]]));
  const files = { '/assets/local/fx/index.json': { bundles: { b: NAMES } }, '/assets/local/fx/enemy-modes.json': m };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const seen = [];
  const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, enemyDef: (id) => ACT3.enemies[id] || null, trace: (p) => seen.push(p) });
  await new Promise((r) => setTimeout(r, 10));
  return { L, seen };
}
const viewOf = (u) => ({ id: u.id, x: u.x, y: u.y, alive: true, isEnemy: u.side === 'enemy', form: null, flags: 0, statuses: new Set(),
  info: { id: u.id, side: u.side === 'enemy' ? 'enemy' : 'ally', defId: u.defId ?? 'char_x', form: null } });
const spawned = (seen) => seen.splice(0).filter((p) => p.kind === 'spawn').map((p) => `${p.names[0]}${p.on != null ? '>' + p.on : ''}`);
const tick = (L) => L.update(0.05, { dist: 20 }, { width: 100, height: 100 });

function fight() {
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    kind: 'normal', sharedBoss: null, enemies: [], defs: { chess: { t_wall: WALL }, enemies: { [DFAT]: ACT3.enemies[DFAT] } },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) }, units: [{ chessId: 't_wall', row: 10, col: 7, uid: 1 }],
  });
  h.step();
  const e = h.spawn(DFAT, { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0 }, tag: null });   // on the wall's tile: blocked
  h.runUntil(() => h.eventsOf('fx').some((x) => x[1] === 'enemySkillReady' && x[4]?.on === 0), 25);
  return { h, e };
}

test('萨卡兹子裔责罚者: its ready mark from the SP filling to the cast\'s end; the strike\'s cast effect at the strike, its hit on the unit — no stand-in blast', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { h, e } = fight();
    const fx = h.events.filter((x) => x[0] === 'fx' && x[4]?.id === e.id);
    const on = fx.find((x) => x[1] === 'enemySkillReady' && x[4].on === 1), cast = fx.find((x) => x[1] === 'enemySkill' && x[4].ability === 'StunAttack');
    const boom = fx.find((x) => x[1] === 'explode' && x[4].kind === 'dfatStun'), off = fx.find((x) => x[1] === 'enemySkillReady' && x[4].on === 0);
    assert.ok(on && cast && boom && off && boom[4].ability === 'StunAttack', 'the sim readies, casts, strikes and ends the cast');
    const i = h.events.indexOf(boom);
    const hits = h.events.slice(i, i + 12).filter((x) => x[0] === 'dmg' && x[5] === e.id);
    assert.ok(hits.length, 'the strike hits the wall');
    const wall = h.allies()[0];
    const { L, seen } = await layer();
    const views = new Map([[e.id, viewOf(e)], [wall.id, viewOf(wall)]]);
    L.onEvent(['tick'], views);
    seen.length = 0;
    L.onEvent(on, views);
    assert.equal(L.ownsFx(on), true);
    assert.deepEqual(seen.splice(0).filter((p) => p.kind === 'spawn').map((p) => [p.names[0], p.tag]), [['enemy_dfat_skill_hint', 'ready:stunattack']], 'the ready mark, held');
    tick(L);
    L.onEvent(cast, views);
    tick(L);
    assert.deepEqual(spawned(seen), [], 'nothing at the cast\'s start (its effect is the strike\'s, ON_SPELL_ON)');
    L.onEvent(boom, views);
    assert.equal(L.ownsFx(boom), true, 'no stand-in blast');
    for (const x of hits) L.onEvent(x, views);
    tick(L);
    assert.deepEqual(spawned(seen), [`enemy_dfat_skill_start_01>${e.id}`, `enemy_dfat_skill_hit>${wall.id}`], 'the strike\'s cast effect, its hit on the wall');
    L.onEvent(off, views);
    assert.deepEqual(seen.splice(0).filter((p) => p.kind === 'readyEnd').map((p) => p.names[0]), ['enemy_dfat_skill_hint'], 'the mark ends with the cast');
  } finally { globalThis.fetch = fetch0; }
});

test('the extracted binding: the parts these cases read', { skip: !existsSync(MODES) && 'no extracted enemy effects' }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8'));
  for (const k of [DFAT, `${DFAT}_2`]) assert.deepEqual(m[k].skills.stunattack, STUN, k);
  for (const n of NAMES) assert.ok(m.$fx[n.toLowerCase()], `${n} extracted`);
});
