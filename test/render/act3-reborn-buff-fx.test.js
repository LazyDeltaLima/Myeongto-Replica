// test/render/act3-reborn-buff-fx.test.js — 规程's 再生 enemies whose client buffs the sim names by `fxTag` (2026-11-12,
// docs/rules/fx.md 「규정 재생 무리」): 蕴核饲育者 / 异光体饲育者's draw as it comes in (dsfull_tr_1[derived][1] / [2]:
// enemy_dsfull_buff_01 / _04, [3] none) and 沸血骑士团精锐's stacks (wdkght_t[enhance]: enemy_wdkght_skill_01_buff) and the
// knock-out that fills them (wdkght_t[effect]: enemy_wdkght_skill_01_start_03) — drawn on it by the generic `buff:` path
// (render/fxstatus.js, the binding's `buffFx`). The sim's events come from the real 规程 kits (server/sim/content/enemies/
// reborn.js kitBreeder · kitBloodKnight); the render runs on a sample binding (the extracted one is compared at the end).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { wantedStatusFx, statusSource } from '../../public/js/render/fxstatus.js';
import { getData } from '../../server/data.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const MODES = new URL('../../public/assets/local/fx/enemy-modes.json', import.meta.url);
const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = getData({ log: quiet, season: 'act3autochess' });
const DSFULL = 'enemy_1437_dsfull', DSFULL2 = 'enemy_1437_dsfull_2', WDKGHT = 'enemy_1103_wdkght_2', PLASM = 'enemy_1137_plasm';
const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });

function field(keys, seed = 7) {
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed, autoFinish: false, timeLimit: 600, kind: 'normal', sharedBoss: null, enemies: [],
    defs: { chess: { t_wall: WALL }, enemies: Object.fromEntries(keys.map((k) => [k, ACT3.enemies[k]])) },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) }, units: [{ chessId: 't_wall', row: 10, col: 6, uid: 1 }],
  });
  h.step();
  return h;
}
const put = (h, key, pos) => h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: 0 }, tag: null });

// the parts of the extracted binding these cases read (enemy-modes.json, enemy_bindings.py)
const DERIVED = { 'dsfull_tr_1[derived][1]': ['enemy_dsfull_buff_01'], 'dsfull_tr_1[derived][2]': ['enemy_dsfull_buff_04'] };
const emodes = () => ({
  [DSFULL]: { modes: [{ name: 'Default', anim: ['Attack'] }], buffFx: DERIVED },
  [DSFULL2]: { modes: [{ name: 'Default', anim: ['Attack'] }], buffFx: DERIVED },
  [WDKGHT]: { modes: [{ name: 'Default', anim: ['Attack'] }], buffFx: { 'wdkght_t[enhance]': ['enemy_wdkght_skill_01_buff'], 'wdkght_t[effect]': ['enemy_wdkght_skill_01_start_03'] } },
});
const NAMES = ['enemy_dsfull_buff_01', 'enemy_dsfull_buff_04', 'enemy_wdkght_skill_01_buff', 'enemy_wdkght_skill_01_start_03'];

async function layer() {
  const m = emodes();
  m.$fx = Object.fromEntries(NAMES.map((n) => [n.toLowerCase(), ['b', n]]));
  const files = { '/assets/local/fx/index.json': { bundles: { b: NAMES } }, '/assets/local/fx/enemy-modes.json': m };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, enemyDef: (id) => ACT3.enemies[id] || null });
  await new Promise((r) => setTimeout(r, 10));
  return L;
}
const viewOf = (u) => ({ id: u.id, x: u.x, y: u.y, alive: true, isEnemy: u.side === 'enemy', form: null, flags: 0, statuses: new Set(), statusFrom: new Map(),
  info: { id: u.id, side: u.side === 'enemy' ? 'enemy' : 'ally', defId: u.defId ?? 'char_x', form: null } });
const tick = (L) => L.update(0.05, { dist: 20 }, { width: 100, height: 100 });
/** Feed the layer the field's events, keeping each view's statuses as the client does (render/app.js). */
function feed(L, h, views) {
  for (const e of h.events) {
    if (e[0] === 'spawn' && e[1] && !views.has(e[1].id)) views.set(e[1].id, viewOf(e[1]));
    L.onEvent(e, views);
    const v = e[0] === 'status' ? views.get(e[1]) : null;
    if (v) { if (e[3]) { v.statuses.add(e[2]); v.statusFrom.set(e[2], statusSource(views, e) || {}); } else { v.statuses.delete(e[2]); v.statusFrom.delete(e[2]); } }
    tick(L);
  }
}
const want = (L, v, views) => [...wantedStatusFx(v, new Map(), L.enemyBuffFx, null, null, (id) => views.get(id)).keys()].sort();

test('饲育者: the sea monster it drew as it came in — [1] enemy_dsfull_buff_01, [2] enemy_dsfull_buff_04, [3] nothing — on it', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const seen = new Set();
    for (const key of [DSFULL, DSFULL2]) {
      for (let seed = 1; seed <= 40 && seen.size < 6; seed++) {
        const h = field([key], seed);
        const e = put(h, key, [10, 8]);
        h.run(0.2);
        const st = h.events.find((x) => x[0] === 'status' && x[1] === e.id && x[2] === 'ab:dsfullDerived' && x[3]);
        assert.ok(st, `${key}: the sim puts on its draw`);
        const n = Number(/\[derived\]\[(\d)\]$/.exec(st[5]?.fx || '')?.[1]);
        if (seen.has(`${key}:${n}`)) continue;
        seen.add(`${key}:${n}`);
        const L = await layer();
        const views = new Map([[e.id, viewOf(e)], ...h.allies().map((u) => [u.id, viewOf(u)])]);
        feed(L, h, views);
        const fx = { 1: ['b/enemy_dsfull_buff_01'], 2: ['b/enemy_dsfull_buff_04'], 3: [] }[n];
        assert.deepEqual(want(L, views.get(e.id), views), fx, `${key} drew [${n}]`);
      }
    }
    for (const k of [DSFULL, DSFULL2]) for (const n of [1, 2, 3]) assert.ok(seen.has(`${k}:${n}`), `${k}: [${n}] drawn by some seed`);
  } finally { globalThis.fetch = fetch0; }
});

test('沸血骑士团精锐: its stacks enemy_wdkght_skill_01_buff from the first knock-out, and enemy_wdkght_skill_01_start_03 from the one that fills them', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([WDKGHT, PLASM]);
    const e = put(h, WDKGHT, [12, 9]);
    h.step();
    const L = await layer();
    const views = new Map([[e.id, viewOf(e)], ...h.allies().map((u) => [u.id, viewOf(u)])]);
    const w = h.allies()[0];
    let from = 0;
    const step = () => { const evs = h.events.slice(from); from = h.events.length; feed(L, { events: evs }, views); };
    step();
    assert.deepEqual(want(L, views.get(e.id), views), [], 'none before a knock-out');
    for (let i = 1; i <= 10; i++) {
      h.b.kill(put(h, PLASM, [12, 3]), w);
      h.step();
      step();
      assert.deepEqual(want(L, views.get(e.id), views), i < 10 ? ['b/enemy_wdkght_skill_01_buff'] : ['b/enemy_wdkght_skill_01_buff', 'b/enemy_wdkght_skill_01_start_03'], `${i} knocked out`);
    }
  } finally { globalThis.fetch = fetch0; }
});

test('the extracted binding: the parts these cases read', { skip: !existsSync(MODES) && 'no extracted enemy effects' }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8')), w = emodes();
  for (const k of [DSFULL, DSFULL2, WDKGHT]) for (const [b, fx] of Object.entries(w[k].buffFx)) assert.deepEqual(m[k].buffFx[b], fx, `${k} ${b}`);
  assert.equal(m[DSFULL].buffFx['dsfull_tr_1[derived][3]'], undefined, '[3] has no effect');
  for (const n of NAMES) assert.ok(m.$fx[n.toLowerCase()], `${n} extracted`);
});
