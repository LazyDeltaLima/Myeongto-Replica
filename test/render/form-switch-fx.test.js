// test/render/form-switch-fx.test.js — an enemy's mode switch the sim sends as fx 'phase' { id, kind, form } draws no stand-in
// puff when the model draws that form itself (2026-11-12, docs/rules/fx.md 「규정 특수 적 항목·호위」): the client's SwitchMode
// creates no effect — the form's clip set (render/units.js FORMS, its change clip) or its mode's effects (fxgame.js FORM_MODES)
// are the switch. A form the model does not draw keeps the puff (nothing else shows it).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { fxSpec } from '../../public/js/render/fx/kinds.js';

let fake, UnitView, createFxLayer;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
  ({ createFxLayer } = await import('../../public/js/render/fxgame.js'));
});
after(() => fake.restore());

const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const view = (defId, side = 'enemy', extra = {}) => new UnitView(fakeViewCtx(fake.P, { cam }), { id: 1, side, kind: side === 'enemy' ? 'enemy' : 'chess', defId, tier: 1, x: 5, y: 5, maxHp: 1000, hp: 1000, ...extra }, {});
async function layer() {
  const fetch0 = globalThis.fetch;
  // an effects index (none of its effects needed); without one the layer keeps every stand-in
  const files = { '/assets/local/fx/index.json': { bundles: {} }, '/assets/local/fx/enemy-modes.json': { $fx: {} } };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, enemyDef: () => null });
  await new Promise((r) => setTimeout(r, 10));
  globalThis.fetch = fetch0;
  return L;
}
const phase = (form, kind = form, extra = {}) => ['fx', 'phase', 5, 5, { x: 5, y: 5, id: 1, kind, form, ...extra }];

// the sim's setForm 'phase' switches into a form the model draws (server content: element.js 掠海漂移体 'crawl', critic.js
// 寻路者 'HeadShot' / null and 无畏掷弹兵 'Light', leaders.js 转译基底·α translator_*, bonds/giant.js 「不眠雪山」 Giant /
// SnowyMountain)
const SWITCHES = [
  ['enemy_2025_syufo', ['crawl']], ['enemy_1216_cansld', ['HeadShot', null]], ['enemy_1219_mtrbty', ['HeadShot', null]],
  ['enemy_1213_mtrsnp', ['HeadShot', null]], ['enemy_1405_boomer_2', ['Light']],
  ['enemy_10081_mpplai', ['translator_fuchou', 'translator_youling', 'translator_shushi']],
];

test('a known form\'s switch: no stand-in puff (its clips draw it)', async () => {
  const L = await layer();
  for (const [defId, forms] of SWITCHES) {
    const v = view(defId);
    const views = new Map([[1, v]]);
    L.onEvent(['tick'], views);
    for (const f of forms) {
      const e = phase(f, f, f && f.startsWith('translator_') ? { dur: 1 } : {});
      assert.notEqual(fxSpec('phase', e[4]).a, 'none', `${defId} ${f}: a stand-in would draw`);
      assert.equal(v.knowsForm(f), true, `${defId} ${f}: the model draws it`);
      L.onEvent(e, views);
      assert.equal(L.ownsFx(e), true, `${defId} ${f}: no puff`);
    }
  }
});

test('the walking 「不眠雪山」 giant\'s Giant / SnowyMountain switch: no puff either', async () => {
  const L = await layer();
  const v = view('enemy_9024_acsgnt', 'ally', { walks: true });
  v.info.walks = true;
  const views = new Map([[1, v]]);
  for (const f of ['SnowyMountain', 'Giant']) {
    const e = phase(f);
    L.onEvent(e, views);
    assert.equal(L.ownsFx(e), true, f);
  }
});

test('a form the model does not draw, or an operator\'s phase: the puff stays', async () => {
  const L = await layer();
  const v = view('enemy_2025_syufo');
  const e = phase('nothingDrawn');
  L.onEvent(e, new Map([[1, v]]));
  assert.equal(v.knowsForm('nothingDrawn'), false);
  assert.equal(L.ownsFx(e), false, 'nothing else shows it');
  const plain = view('enemy_1007_slime');
  const back = phase(null, 'x');
  L.onEvent(back, new Map([[1, plain]]));
  assert.equal(plain.knowsForm(null), false, 'a model without forms');
  assert.equal(L.ownsFx(back), false);
});
