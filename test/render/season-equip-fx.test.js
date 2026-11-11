// test/render/season-equip-fx.test.js — 规程's equipment drawn by its official effects (2026-11-11, docs/rules/fx.md 「규정 장비
// 이펙트」): the season's buff templates name each effect (CN client prefabs of trap.ab, extracted with --client cn), the sim
// sends them as template effects ('tplfx': 伊比利亚骨刺刀's extra hits, 动能轰击弩's splash, 不退者卫护系统's pull, 聚合急救箱's heal)
// or as visible buffs held on the carrier (灵巧涡轮手套, 动能加速器 at its cap, 汲取者之镰 during the skill). The sim's events come
// from the real 规程 items (server/sim/content/items/effects/); the render runs on a sample index (the extracted effects are
// checked only where they are on disk).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import * as F from '../../public/js/render/fxstatus.js';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';
import { ACT3 } from '../helpers/seasonPieces.js';
import { DataSource, getDefaultSource } from '../../server/sim/simdata.js';

const ROOT = new URL('../../', import.meta.url);
const TEMPLATES = new URL('.cache/gamedata-act3autochess/battle/buff_template_data.json', ROOT);
const INDEX = new URL('public/assets/local/fx/index.json', ROOT);
const GAME = readFileSync(new URL('public/js/render/fxgame.js', ROOT), 'utf8');
const I = (k, q = 'a') => `chess_item_${k}_e_${q}`;

/** The template effects the sim sends and the buff effects it shows, by template. */
const TPL = ['trap_acarm133_hit', 'trap_acarm133_hit_02', 'trap_acarm148_buff', 'trap_acarm151_hit'];
const HELD = { 'item:turboGlove': 'trap_acarm132_buff_01', 'item:kineticMax': 'trap_acarm149_buff_01', 'item:reaperScythe': 'trap_acarm154_buff_01' };

function op(id) {
  return chessRec({
    id, profession: 'WARRIOR', bonds: [], tier: 1, rangeGrid: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
    stats: { maxHp: 2000, atk: 500, def: 200, res: 10, aspd: 100, bat: 1, respawnTime: 20, spRecovery: 1, blockCnt: 2 },
    skill: { spCost: 3, duration: 2, initSp: 0 },
  });
}
function fight(items, foes = [[10, 6]], extra = []) {
  const ops = { t_op: op('t_op'), t_a: op('t_a') };
  const data = new DataSource({ ...ACT3, chess: { ...ACT3.chess, ...ops }, enemies: { ...ACT3.enemies, e_d: enemyRec({ key: 'e_d', hp: 1e7, speed: 0, def: 0, res: 0 }) } }, getDefaultSource());
  const h = makeBattle({ data, units: [{ chessId: 't_op', row: 10, col: 4, items }, ...extra], enemies: foes.map(([r, c]) => ({ key: 'e_d', pos: [r, c] })), timeLimit: 999, autoFinish: false });
  h.step();
  return h;
}
const tplOf = (h) => h.events.filter((e) => e[0] === 'tplfx');
const statusOn = (h, key) => h.events.find((e) => e[0] === 'status' && e[2] === key && e[3] === 1);

test('the CN templates name the drawn effects: KEY_FX of the held buffs, the template effects the sim sends', { skip: !existsSync(TEMPLATES) && 'no 规程 buff templates (tools/build-data.mjs)' }, () => {
  const T = JSON.parse(readFileSync(TEMPLATES, 'utf8'));
  const keys = (k) => JSON.stringify(T[k]);
  for (const [status, prefab] of Object.entries(HELD)) {
    const e = F.KEY_FX[status];
    assert.ok(e, status);
    assert.deepEqual([e[0], e[1]], ['trap', prefab], status);
    for (const k of e.src) assert.match(keys(k), new RegExp(`"(effectKey|overrideEffectKey)":"${prefab}"`), `${status}: ${k}`);
  }
  assert.match(keys('act3autochess_equip_acarm133_global_buff'), /"_effectKey":"trap_acarm133_hit".*"_effectKey":"trap_acarm133_hit_02"|"_effectKey":"trap_acarm133_hit_02".*"_effectKey":"trap_acarm133_hit"/);
  assert.match(keys('act3autochess_equip_acarm151_global_buff[splash]'), /"_effectKey":"trap_acarm151_hit"/);
  // 不退者卫护系统: [effect] holds trap_acarm148_buff for attract_duration (LIMITED), as long as the drawn one lasts
  const find = (o) => {
    if (!o || typeof o !== 'object') return null;
    if (o.buffKey === 'act3autochess_equip_acarm148_global_buff[effect]') return o;
    for (const v of Object.values(o)) { const r = find(v); if (r) return r; }
    return null;
  };
  const eff = find(T.act3autochess_equip_acarm148_global_buff);
  assert.ok(eff, '[effect]');
  assert.deepEqual([eff.overrideEffectKey, eff.lifeTimeType, eff.durationKey], ['trap_acarm148_buff', 'LIMITED', 'attract_duration']);
});

test('不退者卫护系统\'s effect lasts its buff: TPL_BUFF_S is the attract_duration of every 规程 item that carries it', () => {
  const life = Number(GAME.match(/const TPL_BUFF_S = \{[^}]*trap_acarm148_buff: ([\d.]+)/)?.[1]);
  assert.equal(life, 3);
  const durs = new Set();
  const raw = readFileSync(new URL('data/seasons/act3autochess/effects.json', ROOT), 'utf8');
  for (const m of raw.matchAll(/"attract_duration":([\d.]+)/g)) durs.add(Number(m[1]));
  assert.deepEqual([...durs], [life], 'one duration in the season\'s data');
});

test('the sim sends the template effects of the real 规程 items', () => {
  const spike = (q) => { const h = fight([I('3_14', q)]); h.run(3); return [...new Set(tplOf(h).map((e) => e[2]))]; };
  assert.deepEqual(spike('a'), ['trap_acarm133_hit_02'], '伊比利亚骨刺刀: one extra hit');
  assert.deepEqual(spike('b'), ['trap_acarm133_hit'], 'two');
  const g = fight([I('6_06')], [[10, 5], [10, 8]]);
  g.run(8);
  const pull = tplOf(g).filter((e) => e[2] === 'trap_acarm148_buff');
  assert.ok(pull.length >= 1, '不退者卫护系统 on its skill');
  assert.equal(pull[0][1], g.unit('t_op').id, 'on the carrier');
  const k = fight([I('6_08')], [[10, 6], [10, 6]]);
  k.b.rng = Object.assign(() => 0, k.b.rng);
  k.run(120);
  assert.ok(tplOf(k).some((e) => e[2] === 'trap_acarm151_hit'), '动能轰击弩\'s splash once at the cap');
  assert.ok(statusOn(k, 'item:kineticMax'), 'and the cap buff shown');
});

test('the sim shows the held buffs of the real 规程 items', () => {
  const t = fight([I('2_10')], []);
  assert.ok(statusOn(t, 'item:turboGlove'), '灵巧涡轮手套 from the deployment');
  const r = fight([I('6_10')]);
  r.run(8);
  assert.ok(statusOn(r, 'item:reaperScythe'), '汲取者之镰 during the skill');
  assert.ok(r.events.some((e) => e[0] === 'status' && e[2] === 'item:reaperScythe' && e[3] === 0), 'and off after it');
});

test('the held buffs draw their prefab on the carrier', () => {
  for (const [status, prefab] of Object.entries(HELD)) {
    const v = { info: { spine: 'char_x', defId: 'char_x' }, isEnemy: false, alive: true, flags: 0, statuses: new Set([status]) };
    assert.deepEqual([...F.wantedStatusFx(v).values()].map((s) => s[1]), [prefab], status);
  }
});

test('a dry layer plays each template effect the sim sends on its unit', async () => {
  const fetch0 = globalThis.fetch;
  const files = { '/assets/local/fx/index.json': { bundles: { trap: TPL, plosis: ['common_heal_hit_01'] } } };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(`${p.kind}:${p.tag} ${p.names.join('+')} on ${p.on}`) });
    await new Promise((r) => setTimeout(r, 10));
    const views = new Map([[7, { id: 7, info: { id: 7, side: 'player' }, x: 1, y: 1, z: 0, alive: true, facing: 1 }]]);
    for (const n of [...TPL, 'common_heal_hit_01']) L.onEvent(['tplfx', 7, n, 7], views);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(seen.sort(), [...TPL, 'common_heal_hit_01'].map((n) => `spawn:tplfx ${n} on 7`).sort());
  } finally { globalThis.fetch = fetch0; }
});

test('the extracted effects hold every prefab named here', { skip: !existsSync(INDEX) && 'no extracted effects' }, () => {
  const idx = JSON.parse(readFileSync(INDEX, 'utf8'));
  for (const n of [...TPL, ...Object.values(HELD)]) {
    assert.ok(idx.bundles.trap?.includes(n), n);
    assert.equal(idx.sources[`trap/${n}`]?.client, 'cn', `${n}: from the CN client`);
  }
  assert.ok(Object.values(idx.bundles).some((b) => b.includes('common_heal_hit_01')), '聚合急救箱\'s heal (a copy in another bundle)');
});
