// test/render/lod3-skill-fx.test.js — the view's adaptive load level 3 (render/app.js adaptLoad) leaves no official effect
// out (2026-11-14, docs/rules/render.md 「적응 부하 단계」): it used to leave out the normal attacks' (operators' and
// enemies'), which saved 3 % of the effect layer's time in a crowded boss round; a skill's, a kit event's and a normal
// attack's effects play as at level 0. #13 found 塔露拉 S3's 簇火 skipped at level 3 (oxi-wave-fx.test.js); the other
// gates that held a skill's effects back the same way: 凛御银灰 S3's eagle (svashBird), 异客 S3's storm strikes (chainFx), a
// skill's own shot (skillShotOut: 流星 S2's volley), a kit plan's flights (planShots: 维伊's stored energies), a skill
// mode's cast effects (beginCast), its lock drones (droneShot: 耶拉 S2) and its attack trails (trailShot). The enemy
// side's level-3 case is cannon-fx.test.js's.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NO_DATA, withLayer } from '../helpers/fxDryLayer.js';
import { fxEvent } from '../helpers/fxEvent.js';

const FOE = 'enemy_1007_slime';

/** What `steps` draws at load level `lod`: the started prefabs (sorted) and the trails it went to load (perfSkips `first`). */
async function drawn(lod, defId, skillIndex, steps) {
  let out = null;
  await withLayer(async ({ layer, unit, take }) => {
    const views = new Map([[1, unit(1, 'ally', defId, 0, skillIndex)], [8, unit(8, 'enemy', FOE, 2)], [9, unit(9, 'enemy', FOE, 3)]]);
    views.get(1).info.kind = 'op';
    layer.onEvent(['deploy', 1], views);
    layer.update(0.02);
    take();
    layer.perfSkips();
    await steps({ layer, views, ev: (name, o) => layer.onEvent(fxEvent(name, { x: 0, y: 0, ...o }), views) });
    out = { names: take().map((n) => n.split('@')[0]).sort(), skips: layer.perfSkips() };
  }, { load: () => lod });
  return out;
}

const CASES = [
  ['凛御银灰 S3: the eagle with each attack', 'char_1045_svash2', 2, 'svash2_skill_03_trail_02', async ({ layer, views }) => {
    layer.onEvent(['skill', 1, 1], views);
    layer.onEvent(['swing', 1, 0.2, 'none'], views);
    layer.onEvent(['atk', 1, 8, 'none'], views);
  }],
  ['异客 S3: each storm strike\'s chain graphic and hits', 'char_472_pasngr', 2, 'pasngr_skill_03_hit', async ({ layer, views, ev }) => {
    layer.onEvent(['skill', 1, 1], views);
    ev('lightning', { id: 8, src: 1, i: 0 });
    ev('lightning', { id: 9, src: 1, i: 1, from: 8 });
  }],
  ['流星 S2: the volley\'s arrows', 'char_126_shotst', 1, 'shotst_skill_02_trail', async ({ layer, views }) => {
    layer.onEvent(['skill', 1, 1], views);
    layer.onEvent(['fx', 'volley', 0, 0, { id: 1, targets: [8, 9], skill: 'shotst_2' }], views);
    layer.update(0.6);
  }],
  ['维伊: the stored energies leaving with an attack (a kit plan, no stand-in)', 'char_4226_veen', 0, 'veen_trail_01', async ({ ev }) => {
    ev('veenVolley', { id: 1, target: 8, stored: 1, merged: 1 });
  }],
  ['耶拉 S2: the locked drones\' hits', 'char_4013_kjera', 1, 'kjera_token_skill_02_hit_F_L_01', async ({ layer, views, ev }) => {
    layer.onEvent(['skill', 1, 1], views);
    layer.update(0.02);
    ev('drone', { x: 2, id: 1 });
    ev('drone', { x: 2, id: 1 });
  }],
];

for (const [label, defId, skill, mark, steps] of CASES) {
  test(`load level 3 keeps a skill's effects — ${label}`, { skip: NO_DATA }, async () => {
    const at0 = await drawn(0, defId, skill, steps), at3 = await drawn(3, defId, skill, steps);
    assert.ok(at0.names.includes(mark), `${mark} at level 0 (${at0.names.join(', ')})`);
    assert.deepEqual(at3.names, at0.names, 'the same prefabs at level 3');
  });
}

// a skill mode's attacks and a normal attack: their cast effects (beginCast) and the official trail they load (trailShot)
// as at level 0
test('load level 3: a skill mode\'s attack and a normal attack keep their casts and trail', { skip: NO_DATA }, async () => {
  const attack = (skillOn) => async ({ layer, views }) => {
    if (skillOn) layer.onEvent(['skill', 1, 1], views);
    layer.onEvent(['swing', 1, 0.2, 'arrow'], views);
    layer.onEvent(['atk', 1, 8, 'arrow'], views);
    layer.update(0.1);
  };
  // 能天使 S3: a ranged skill mode with cast effects of its own
  const s0 = await drawn(0, 'char_103_angel', 2, attack(true)), s3 = await drawn(3, 'char_103_angel', 2, attack(true));
  assert.ok(s0.names.length > 0, 'S3\'s attack starts effects at level 0');
  assert.deepEqual(s3.names, s0.names, 'and the same at level 3');
  assert.ok(s0.skips.first > 0 && s3.skips.first === s0.skips.first, `its trail is loaded at level 3 too (${s0.skips.first} / ${s3.skips.first})`);
  const n0 = await drawn(0, 'char_103_angel', 0, attack(false)), n3 = await drawn(3, 'char_103_angel', 0, attack(false));
  assert.ok(n0.names.length > 0, 'a normal attack draws at level 0');
  assert.deepEqual(n3.names, n0.names, 'and the same at level 3');
  assert.equal(n3.skips.first, n0.skips.first, 'the same trails loaded');
  assert.ok(!('lod3' in n3.skips), 'perfSkips has no `lod3` count left');
});

// every gate at once: the layer reads the load level only for the 'medium' path from level 2 (fxQuality)
test('fxgame.js reads the load level only for the \'medium\' path', () => {
  const src = readFileSync(new URL('../../public/js/render/fxgame.js', import.meta.url), 'utf8');
  const uses = src.split('\n').filter((l) => /\blevel\(\)/.test(l));
  assert.deepEqual(uses.map((l) => l.trim()), ["return v === 'medium' || level() >= 2 ? 'medium' : 'high';"]);
});
