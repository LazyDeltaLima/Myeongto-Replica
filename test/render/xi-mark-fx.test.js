// test/render/xi-mark-fx.test.js — “自在”'s and 鼠王's marks drawn by their official effects (2026-11-26, docs/rules/sim.md
// 「적 스킬 = 일반 공격 차례」 '즈자이'의 표식·래트킹의 표식): each mark is a GloballUniqueBuffAbility's `_uniqueBuff`
// (enemy_xi_mark[a] / [b] — overrideEffectKey enemy_xi_skill_01_buff_02; mousek_mark[a] mousek_skill_02_buff, [b]
// mousek_skill_01_buff), held on the unit it marks while it stays. The sim's status names the buff (`fxTag`) with the enemy as
// its source, and render/fxstatus.js draws that enemy's binding of it on the operator; tools/local-extract/enemy_bindings.py
// reads `_uniqueBuff` into the binding's buffFx (it did not: nothing was drawn). The events come from the real kits
// (server/sim/content/enemies/leaders.js kitXi · kitLeaderMisc); the render runs on a sample binding (the extracted one is
// compared at the end). One layer for the file: a second createFxLayer reads the first one's tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { wantedStatusFx, statusSource } from '../../public/js/render/fxstatus.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const MODES = new URL('../../public/assets/local/fx/enemy-modes.json', import.meta.url);
const XI = 'enemy_1517_xi', MOUSEK = 'enemy_1509_mousek';
const XI_FX = 'enemy_xi_skill_01_buff_02', MOUSEK_A = 'mousek_skill_02_buff', MOUSEK_B = 'mousek_skill_01_buff';
// the parts of the extracted binding these cases read (enemy-modes.json `buffFx`: [a] is in both of “自在”'s modes)
const BIND = {
  [XI]: { 'enemy_xi_mark[a]#0': [XI_FX], 'enemy_xi_mark[a]#1': [XI_FX], 'enemy_xi_mark[b]': [XI_FX] },
  [MOUSEK]: { 'mousek_mark[a]': [MOUSEK_A], 'mousek_mark[b]': [MOUSEK_B] },
};
const NAMES = [XI_FX, MOUSEK_A, MOUSEK_B];
const wall = (id, maxHp) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });

let layerP = null;
function layer() {
  layerP ||= (async () => {
    const m = { $fx: Object.fromEntries(NAMES.map((n) => [n.toLowerCase(), ['b', n]])) };
    for (const [k, fx] of Object.entries(BIND)) m[k] = { modes: [{ name: 'Default', anim: ['Attack'] }, { name: 'R', anim: ['Attack'] }], buffFx: fx };
    const files = { '/assets/local/fx/index.json': { bundles: { b: NAMES } }, '/assets/local/fx/enemy-modes.json': m };
    globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
    const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true });
    await new Promise((r) => setTimeout(r, 10));
    return L;
  })();
  return layerP;
}

function field(walls) {
  const chess = Object.fromEntries(walls.map((w) => [w.id, wall(w.id, w.maxHp ?? 1e7)]));
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600, enemies: [], captureNoisy: true,
    defs: { chess }, kits: Object.fromEntries(walls.map((w) => [w.id, () => ({ trait: { noAttack: true } })])),
    units: walls.map((w, i) => ({ chessId: w.id, row: w.at[0], col: w.at[1], uid: i + 1 })),
  });
  h.step();
  return h;
}
const viewOf = (u) => ({ id: u.id, x: u.x, y: u.y, alive: true, isEnemy: u.side === 'enemy', form: null, flags: 0, statuses: new Set(), statusFrom: new Map(),
  info: { id: u.id, side: u.side === 'enemy' ? 'enemy' : 'ally', defId: u.defId ?? 'char_x', form: null } });
/** The views of the field, their statuses kept from the sim's events as the client does (render/app.js). */
function views(h, enemy) {
  const vs = new Map([[enemy.id, viewOf(enemy)], ...h.allies().map((u) => [u.id, viewOf(u)])]);
  for (const e of h.events) {
    const v = e[0] === 'status' ? vs.get(e[1]) : null;
    if (v) { if (e[3]) { v.statuses.add(e[2]); v.statusFrom.set(e[2], statusSource(vs, e) || {}); } else { v.statuses.delete(e[2]); v.statusFrom.delete(e[2]); } }
  }
  return vs;
}
const want = (L, vs, u) => [...wantedStatusFx(vs.get(u.id), new Map(), L.enemyBuffFx, null, null, (id) => vs.get(id)).keys()].sort();
const on = (h, key) => h.events.filter((e) => e[0] === 'status' && e[2] === key && e[3]);

test('“自在”: its 纬地经天 mark draws enemy_xi_skill_01_buff_02 on the unit it marks — the second form\'s [a] and [b] too', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const L = await layer();
    const h = field([{ id: 't_wall', at: [10, 6] }, { id: 't_wall2', at: [12, 3] }]);
    const e = h.spawn(XI, { pos: [10, 8], routeIndex: 0, mods: { speedMul: 0 }, tag: null });
    assert.ok(h.runUntil(() => on(h, 'ab:xiMark').length > 0, 10), 'the sim marks a unit');
    const [near, far] = ['t_wall', 't_wall2'].map((id) => h.unit(id));
    const m1 = on(h, 'ab:xiMark')[0];
    assert.deepEqual([m1[1], m1[4], m1[5]?.fx], [near.id, e.id, 'buff:enemy_xi_mark[a]'], 'on the nearest, “自在” its source, naming its buff');
    let vs = views(h, e);
    assert.deepEqual(want(L, vs, near), [`b/${XI_FX}`], 'the mark on the nearest');
    assert.deepEqual(want(L, vs, far), [], 'nothing on the other');
    vs.delete(e.id);
    assert.deepEqual(want(L, vs, near), [`b/${XI_FX}`], 'its view gone: its binding by the defId the status kept (2026-11-27)');
    const kept = vs.get(near.id).statusFrom.get('ab:xiMark');
    vs.get(near.id).statusFrom.set('ab:xiMark', { fx: kept.fx, n: 0 });
    assert.deepEqual(want(L, vs, near), [], 'drawn by its source\'s binding: none without one');
    h.b.kill(e, null);
    assert.ok(h.runUntil(() => on(h, 'ab:xiMark2[a]').length > 0 && on(h, 'ab:xiMark2[b]').length > 0, 30), 'the second form marks [a] and [b]');
    vs = views(h, e);
    assert.ok(!vs.get(near.id).statuses.has('ab:xiMark'), 'the first form\'s mark is gone');
    assert.deepEqual(want(L, vs, far), [`b/${XI_FX}`], '[a] on the farthest');
    assert.deepEqual(want(L, vs, near), [`b/${XI_FX}`], '[b] on the nearest');
  } finally { globalThis.fetch = fetch0; }
});

test('鼠王: its Skills/Mark draws mousek_skill_02_buff on the lowest max HP ([a]) and mousek_skill_01_buff on the highest ([b])', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const L = await layer();
    const h = field([{ id: 't_wall', at: [10, 8], maxHp: 2e7 }, { id: 't_wall2', at: [12, 6], maxHp: 5e6 }]);
    const e = h.spawn(MOUSEK, { pos: [9, 9], routeIndex: 0, mods: { speedMul: 0 }, tag: null });
    assert.ok(h.runUntil(() => on(h, 'ab:mousekMark[a]').length > 0 && on(h, 'ab:mousekMark[b]').length > 0, 10), 'the sim marks both');
    const [hi, lo] = ['t_wall', 't_wall2'].map((id) => h.unit(id));
    assert.deepEqual(on(h, 'ab:mousekMark[a]').map((x) => [x[1], x[4], x[5]?.fx]), [[lo.id, e.id, 'buff:mousek_mark[a]']]);
    const vs = views(h, e);
    assert.deepEqual(want(L, vs, lo), [`b/${MOUSEK_A}`]);
    assert.deepEqual(want(L, vs, hi), [`b/${MOUSEK_B}`]);
  } finally { globalThis.fetch = fetch0; }
});

test('the extracted binding: the marks\' `_uniqueBuff` in buffFx, their effects extracted', { skip: !existsSync(MODES) && 'no extracted enemy effects' }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8'));
  for (const [k, fx] of Object.entries(BIND)) {
    for (const [key, names] of Object.entries(fx)) {
      assert.deepEqual(m[k]?.buffFx?.[key], names, `${k} buffFx ${key} (tools/local-extract/enemy_bindings.py \`uniqueBuffs\`)`);
    }
  }
  for (const n of NAMES) assert.ok(m.$fx[n.toLowerCase()], `${n} extracted (enemy_bindings.py --extract --id ${XI} --id ${MOUSEK})`);
});
