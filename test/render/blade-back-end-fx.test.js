// test/render/blade-back-end-fx.test.js — '斩胄之剑' / '破胄之锤''s copy drawn in its prefab mode Back_End (2026-11-14,
// docs/rules/fx.md 「적 프리팹 모드별 능력 — 갑주 복제 Back_End」): the real kit (content/bosses.js kitBlade) names the copy's
// form 'backEnd' on the kitHit it already sent (no new event: the battle golden does not move); render/units.js FORMS
// plays its Back_End entrance clip and Idle_B; render/fxgame.js reads that mode's own BornAnim Skills/2
// (enemy-modes.json modes[2].skills['2'], tools/local-extract/enemy_bindings.py render_entry): enemy_acstma_back_end on the
// clip, not the first mode's enemy_acstma_revive — the two were one merged part before, and the copy played as the first
// mode. The view runs on a sample binding (the extracted one is compared at the end).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { FORMS } from '../../public/js/render/units.js';
import { makeBattle } from '../helpers/battleHarness.js';
import { hasGeneratedData, getDefaultSource } from '../../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };
const MODES = new URL('../../public/assets/local/fx/enemy-modes.json', import.meta.url);
const HELM = 'enemy_9013_acstmk', BLADE = 'enemy_9014_acstma', HAMMER = 'enemy_9015_acstmb';
const BAIT = 'chess_char_1_02_a';
const pool = (hp) => ({ hp, maxHp: hp, damage(_pid, a) { this.hp = Math.max(0, this.hp - a); } });

const part = (cast, anim, o = 0) => ({ cast: [cast], opt: { [cast]: { s: 2, e: 3, o } }, hit: [], anim });
// (the hammer's first-mode BornAnim plays its Revive clip by name, its effect once; the sword's names `Born`)
const emodes = () => Object.fromEntries([[BLADE, 'acstma', 'Born', 0], [HAMMER, 'acstmb', 'Revive', 1]].map(([id, n, born, o]) => [id, {
  modes: [{ name: 'Default', anim: ['Attack'] }, { name: 'Skill', anim: [] }, { name: 'Back_End', anim: ['Attack'], skills: { 2: part(`enemy_${n}_back_end`, 'Back_End') } }],
  skills: { 2: part(`enemy_${n}_revive`, born, o) },
}]));
const NAMES = ['enemy_acstma_back_end', 'enemy_acstma_revive', 'enemy_acstmb_back_end', 'enemy_acstmb_revive'];

test('the blade\'s copy (real kit): its kitHit names form \'backEnd\', a clip set the view has (Back_End, then Idle_B)', REAL, () => {
  const WAVES = getDefaultSource();
  const H08 = 'act1autochess_h08_01';
  const tpl = WAVES.getWave(H08);
  const origin = tpl.extraRoutes[tpl.branches.left_hand_origin[0][0].routeIndex];
  const h = makeBattle({
    kind: 'boss', sharedBoss: pool(1e7), seed: 3, autoFinish: false, timeLimit: 400,
    setup(b) { b.opts.templateId = H08; }, units: [{ chessId: BAIT, row: 12, col: 15 }],
  });
  h.step();
  const b = /** @type {any} */ (h.battle), ev0 = b._ev.bind(b), rec = [];
  b._ev = (e) => { rec.push(e); return ev0(e); };
  h.spawn(HELM, { pos: [2, 9], routeIndex: 0, mods: { speedMul: 0 }, tag: 'boss' }).profile.noAttack = true;
  const first = h.spawn(BLADE, { pos: origin.start, routeIndex: 0, tag: 'part' });
  h.runUntil(() => rec.some((e) => e[0] === 'fx' && e[1] === 'kitHit' && e[4]?.k === 'acstma:back'), 60);
  const back = rec.find((e) => e[0] === 'fx' && e[1] === 'kitHit' && e[4]?.k === 'acstma:back');
  assert.ok(back, 'the dive lands and the copy takes over');
  const copy = b.units.find((u) => u.id === back[4].id);
  assert.ok(copy && copy !== first && copy.defId === BLADE, 'on the copy');
  assert.equal(back[4].form, 'backEnd', 'the copy\'s form — the client\'s mode Back_End');
  assert.equal(copy.form, 'backEnd', 'kept on the unit (UnitInfo form: a view built later)');
  for (const id of [BLADE, HAMMER]) {
    const f = FORMS[id]?.backEnd;
    assert.ok(f && f.change === 'Back_End' && f.roles.idle === 'Idle_B' && f.roles.move?.loop === 'Idle_B', `${id}: render/units.js FORMS backEnd`);
  }
});

test('the copy in Back_End plays that mode\'s BornAnim effect on its Back_End clip — not the first mode\'s', async () => {
  const m = emodes();
  m.$fx = Object.fromEntries(NAMES.map((n) => [n, ['b', n]]));
  const files = { '/assets/local/fx/index.json': { bundles: { b: NAMES } }, '/assets/local/fx/enemy-modes.json': m };
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const plays = [];
    const L = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (p) => plays.push(p) });
    await new Promise((r) => setTimeout(r, 10));
    const v = { id: 5, x: 3, y: 3, alive: true, form: null, info: { id: 5, side: 'enemy', defId: BLADE }, actor: { roles: { attack: { loop: 'Attack' } }, current: 'Idle_B' } };
    const views = new Map([[5, v]]);
    L.onEvent(['tick'], views);
    const step = () => L.update(0.016, { liftFor: () => 0, scaleAt: () => 64, dist: 10 }, { width: 10, height: 10 });
    step();
    v.form = 'backEnd'; step();   // render/app.js: the kitHit's form
    v.actor.current = 'Back_End'; step();
    assert.deepEqual(plays.filter((p) => p.kind === 'spawn').map((p) => p.names[0]), ['enemy_acstma_back_end'], 'Back_End\'s own effect, once');
  } finally { globalThis.fetch = fetch0; }
});

test('the extracted binding: the blades\' Skills/2 split by mode', { skip: !existsSync(MODES) && 'no extracted enemy effects' }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8')), w = emodes();
  for (const id of [BLADE, HAMMER]) {
    assert.deepEqual(m[id].skills['2'], w[id].skills['2'], `${id}: the first mode's BornAnim`);
    assert.equal(m[id].modes[2].name, 'Back_End');
    assert.deepEqual(m[id].modes[2].skills?.['2'], w[id].modes[2].skills['2'], `${id}: Back_End's own`);
  }
  for (const n of NAMES) assert.ok(m.$fx[n], `${n} extracted`);
});
