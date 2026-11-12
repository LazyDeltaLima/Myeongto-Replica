// test/render/element-burst-fx.test.js — docs/rules/ui.md 「전투 화면 UI」 ⑤: an element burst (the sim's fx burst with an
// `element`, damage.js resolveBurst) plays the official hit effect its ep_break_<el>_char / _enemy buff template creates on the
// unit (fxgame.js burstFx); before, render/fx.js's procedural burst stood in.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const FX = path.join(ROOT, 'public/assets/local/fx');

const body = (src, head) => {
  const at = src.indexOf(head);
  assert.ok(at >= 0, head);
  return src.slice(at, src.indexOf('\n  }\n', at) + 4);
};

test('burstFx: the element bursts\' ep_break_<el>_char / _enemy CreateEffect on the unit by its side', () => {
  const fx = body(SRC, 'const BURST_FX = {');
  assert.match(fx, /burn: \[null, 'common_firedamage_hit'\]/);
  assert.match(fx, /erosion: \['common_waterElementExplosion', 'common_waterdamage_hit'\]/);
  assert.match(fx, /apoptosis: \['common_darkdamage_hit', 'common_darkdamage_hit'\]/);
  assert.match(fx, /neural: \['common_nerve_injury_01_hit', null\]/);
  assert.match(SRC, /if \(e\[1\] === 'burst' && e\[4\]\?\.element\) \{ if \(burstFx\(e, views\)\) ownFx\.add\(e\); return; \}/);
  const common = existsSync(path.join(FX, 'index.json')) ? JSON.parse(readFileSync(path.join(FX, 'index.json'), 'utf8')).bundles.common || [] : null;
  if (common) for (const n of ['common_firedamage_hit', 'common_waterdamage_hit', 'common_darkdamage_hit', 'common_nerve_injury_01_hit', 'common_waterElementExplosion']) assert.ok(common.includes(n), n);
});

// 2026-11-11 (docs/rules/fx.md 「규정 광조 폭발」): the CN-only 5th element 狂躁 — the sim's burst on an enemy is the
// template's common_maniadamage_hit on it, on the official layer path (no procedural burst); BURST_FX agrees with the
// CreateEffect of every ep_break_<el>_char / _enemy template the new season's tables carry
const TEMPLATES = path.join(ROOT, '.cache/gamedata-act3autochess/battle/buff_template_data.json');
test('burstFx: BURST_FX is what every ep_break_<el>_char / _enemy template creates on its BUFF_OWNER', { skip: !existsSync(TEMPLATES) && 'no new-season buff templates' }, () => {
  const t = JSON.parse(readFileSync(TEMPLATES, 'utf8'));
  const EL = { neural: 'sanity', erosion: 'water', burn: 'fire', apoptosis: 'dark', rampage: 'anger' };
  const fx = body(SRC, 'const BURST_FX = {');
  for (const [el, name] of Object.entries(EL)) {
    const row = new RegExp(`${el}: \\[(null|'[^']+'), (null|'[^']+')\\]`).exec(fx);
    assert.ok(row, el);
    ['char', 'enemy'].forEach((side, i) => {
      const tpl = t[`ep_break_${name}_${side}`];
      const made = Object.values(tpl?.eventToActions || {}).flat().filter((a) => /CreateEffect,/.test(a.$type) && a._targetType === 'BUFF_OWNER').map((a) => a._effectKey);
      const ours = row[i + 1] === 'null' ? null : row[i + 1].slice(1, -1);
      // 神经 on an operator plays ep_break_sanity[epfree]'s overrideEffectKey, not a CreateEffect (the header above)
      if (el === 'neural' && side === 'char') return assert.equal(ours, 'common_nerve_injury_01_hit');
      assert.deepEqual(ours ? [ours] : [], made, `${el} ${side}`);
    });
  }
});

test('狂躁 burst on an enemy: the sim\'s fx burst plays common_maniadamage_hit on it; the stand-in burst is left out', async () => {
  const { createFxLayer } = await import('../../public/js/render/fxgame.js');
  const { makeBattle, enemyRec } = await import('../helpers/battleHarness.js');
  const h = makeBattle({ defs: { enemies: { e_dummy: enemyRec({ key: 'e_dummy', hp: 1e6 }) } }, enemies: [{ key: 'e_dummy', count: 1, interval: 0 }], autoFinish: false });
  h.run(0.5);
  const e = h.enemies()[0];
  h.b.dealDamage(null, e, { amount: 1000, type: 'element', element: 'rampage' });
  const burst = h.eventsOf('fx').find((x) => x[1] === 'burst' && x[4]?.element === 'rampage');
  assert.ok(burst && burst[4].id === e.id, 'the sim names the enemy');
  const fetch0 = globalThis.fetch;
  try {
    const files = { '/assets/local/fx/index.json': { bundles: { common: ['common_maniadamage_hit'] } } };
    globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, enemyDef: () => null, trace: (p) => seen.push(p) });
    await new Promise((r) => setTimeout(r, 10));
    const foe = { id: e.id, x: 1, y: 1, alive: true, isEnemy: true, info: { id: e.id, side: 'enemy', defId: 'e_dummy' } };
    const ally = { id: 99, x: 2, y: 1, alive: true, info: { id: 99, side: 'ally', defId: 'char_x' } };
    const views = new Map([[foe.id, foe], [99, ally]]);
    layer.onEvent(['tick'], views);
    seen.length = 0;
    layer.onEvent(burst, views);
    assert.equal(layer.ownsFx(burst), true);
    assert.deepEqual(seen.filter((p) => p.kind === 'spawn').flatMap((p) => p.names), ['common_maniadamage_hit']);
    const onAlly = ['fx', 'burst', 2, 1, { id: 99, element: 'rampage' }];
    layer.onEvent(onAlly, views);
    assert.equal(layer.ownsFx(onAlly), false, 'no operator effect: the stand-in');
  } finally { globalThis.fetch = fetch0; }
});
