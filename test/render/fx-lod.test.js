// test/render/fx-lod.test.js — the client's FxLODSetting (official client 2026-10-23, docs/rules/fx.md 「저사양 이펙트 — FxLODSetting」):
// the root's low-detail switches, which the client applies on a device graded without HIGH_LEVEL_EFFECT —
// fx_extract.py lod_setting (`lod`), render/fxplayer.js at quality 'medium'.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mm = (s) => ({ m: 0, s });
const sys = (over = {}) => ({
  dur: 5, loop: false, delay: mm(0), speedMul: 1, space: 0, scaling: 1, prewarm: false, life: mm(5), speed: mm(0),
  color: { m: 0, a: [1, 1, 1, 1] }, size: mm(0.1), rot: mm(0), max: 1000, gravity: mm(0), flipRot: 0, rate: mm(0), bursts: [], mods: {},
  shape: { type: 10, radius: 1, angle: 0, arc: 360, thick: 1, length: 1, pos: [0, 0, 0], rotE: [0, 0, 0], scale: [1, 1, 1], box: [0, 0, 0] },
  render: { mode: 0, mat: 'm', mesh: null, align: 0, pivot: [0, 0, 0], order: 0 }, ...over,
});
const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
const burst = (n) => [{ t: 0, n: mm(n), cycles: 1, interval: 0, p: 1 }];

async function play(quality, lod) {
  const { FxInstance } = await import('../../public/js/render/fxplayer.js');
  const def = {
    name: 'l', duration: 5, geoms: {}, lib: { texture: () => null }, clips: [], ...(lod ? { lod } : {}),
    nodes: [node('root', -1), node('hooked', 0, { ps: sys({ bursts: burst(100), rate: mm(100) }) }), node('plain', 0, { ps: sys({ bursts: burst(100) }) }),
      node('gone', 0, { ps: sys({ bursts: burst(100) }) })],
    materials: { m: { shader: 'Torappu/Particles/Additive', tex: { _MainTex: { img: 't', tiling: [1, 1], offset: [0, 0] } }, floats: {}, colors: {} } },
  };
  const inst = new FxInstance(def, { quality });
  for (let i = 0; i < 30; i++) inst.update(1 / 30);
  return inst;
}

test("quality 'medium': the `off` nodes are switched off, a hooked system emits × its percentage (rate and bursts)", async () => {
  const lod = { off: [3], ps: [[1, 0.4]] };
  const med = await play('medium', lod);
  assert.equal(med.nodes[3].visible, false, '_disableObjects');
  const [hooked, plain] = med.systems;
  assert.ok(Math.abs(hooked.n - (40 + 40)) <= 2, `burst 100 × 0.4 + rate 100 × 0.4 for 1 s (${hooked.n})`);
  assert.equal(plain.n, 100, "an unhooked system's first-frame burst stays whole, as before");
  const high = await play('high', lod);
  assert.equal(high.nodes[3].visible, true, "'high' (the client's HIGH_LEVEL_EFFECT): nothing changes");
  assert.ok(Math.abs(high.systems[0].n - 200) <= 2, `full emission at 'high' (${high.systems[0].n})`);
  const none = await play('medium', null);
  assert.ok(Math.abs(none.systems[0].n - (100 + 60)) <= 2, `no FxLODSetting: the quality's own factor (${none.systems[0].n})`);
});

test('fx_extract.py lod_setting: the root FxLODSetting by its field names — nodes by GameObject, systems by their GameObject', () => {
  const out = execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, 'tools/local-extract')
import fx_extract as fe
class Comp:
    def __init__(self, go): self.go = go
    def read_typetree(self): return {'m_GameObject': {'m_FileID': 0, 'm_PathID': self.go}}
class Stub:
    cov = None
    def monos(self, root):
        return [(fe.LOD_SCRIPT, b'', {'_disableObjects': [{'m_FileID': 0, 'm_PathID': 30}, {'m_FileID': 0, 'm_PathID': 99}],
                 '_particleDetailsHookers': [{'_particle': {'m_FileID': 0, 'm_PathID': 7}, '_detailPercentage': 0.6000000238418579}]})]
    def resolve(self, ptr, ctx): return Comp({7: 20}[ptr['m_PathID']])
print(json.dumps(fe.Extractor.lod_setting(Stub(), None, {10: 1, 20: 2, 30: 3})))`], { cwd: ROOT, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(out), { off: [3], ps: [[2, 0.6]] });
});
