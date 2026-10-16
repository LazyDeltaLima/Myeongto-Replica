// tools/local-extract/fx_coverage.py: the report of what an effect extraction leaves out (fx_extract.py), so a part of a client
// prefab the pipeline does not take is listed instead of dropped without a word (docs/rules/fx.md 「추출 누락 보고」). The
// checks run on plain values (no UnityPy); the lists of what render/fxplayer.js reads are pinned to its source here.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'tools/local-extract');
const PY = ['python3', 'python'].find((bin) => spawnSync(bin, ['--version']).status === 0);
const ENV = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };

/** Run python code with fx_coverage imported as `c` (and fx_extract as `fe`); returns the parsed JSON it prints. */
function py(code) {
  const src = `import sys, json\nsys.path.insert(0, ${JSON.stringify(TOOL)})\nimport fx_coverage as c\nimport fx_extract as fe\n${code}`;
  const r = spawnSync(PY, ['-I', '-c', src], { encoding: 'utf8', env: ENV });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

describe('fx_coverage.py', { skip: !PY && 'no python3' }, () => {
  test('an unknown component / script / module / shape / texture / property is `new`; the baseline ones keep their status', () => {
    const rep = py(`
cov = c.Coverage()
cov.begin('wang/wang_passive_01_start')
for t in ('Transform', 'SpriteRenderer', 'MeshCollider', 'MonoBehaviour'):
    cov.component(t)
cov.script(6196809664641094801, ['_delayToPlay'])     # ParticleEffect: read
cov.script(-337322108846137150, ['_lerpDuration'])    # FollowDirection: known todo
cov.script(123, ['_someField'])                       # unknown, no dump: its id and fields
cov.reader('ParticleEffect', True)
cov.reader('FollowMountPoint', False)
cov.particle({'EmissionModule': {'enabled': 1}, 'CollisionModule': {'enabled': 1}, 'LightsModule': {'enabled': 1},
              'NoiseModule': {'enabled': 0}, 'ShapeModule': {'enabled': 1, 'type': 6}})
cov.particle({'ShapeModule': {'enabled': 1, 'type': 20}})
cov.material('Torappu/Particles/AlphaBlend', [('_MainTex', 4, [0, 0, 0, 0]), ('_GlowTex', 4, [0, 0, 0, 0]),
             ('_MainTexChannel', 2, [0, 0, 0, 0]), ('_Opacity', 2, [1, 0, 0, 0]), ('_Glow', 0, [0, 0, 0, 0])],
             {'_MainTex', '_GlowTex'}, {'_MainTexChannel': 1.0, '_Opacity': 0.3, '_Glow': [0, 0, 0, 0]})
cov.material('Torappu/Particles/NewShader', [], set(), {})
print(json.dumps({r['kind'] + ':' + r['what']: r['status'] for r in cov.report()}))`);
    assert.deepEqual(rep, {
      'component:SpriteRenderer': 'new', 'component:MeshCollider': 'none',
      'script:FollowDirection': 'todo', 'script:#123 _someField': 'new',
      'reader:FollowMountPoint: layout not recognised, nothing read': 'new',
      'module:CollisionModule': 'todo', 'module:LightsModule': 'new',
      'shape:6 Mesh': 'todo', 'shape:20 SpriteRenderer': 'new',
      'texture:Torappu/Particles/AlphaBlend _GlowTex': 'new',
      'property:Torappu/Particles/AlphaBlend _MainTexChannel': 'new',
      'shader:Torappu/Particles/NewShader': 'new',
    });
  });

  test('summary: one NOT HANDLED line per new item with its prefabs, one line for the known ones', () => {
    const lines = py(`
cov = c.Coverage()
for k in ('a/x', 'a/y'):
    cov.begin(k); cov.component('SpriteRenderer'); cov.component('MeshCollider')
cov.dependency('CAB-1 → gone.ab: the file is gone', 'battle/prefabs/effects/a.ab')
print(json.dumps(cov.summary()))`);
    assert.equal(lines.length, 3);
    assert.match(lines[0], /^\[fx\] NOT HANDLED component SpriteRenderer: 2 prefab\(s\) — a\/x, a\/y$/);
    assert.match(lines[1], /^\[fx\] NOT HANDLED dependency CAB-1 .*: 1 prefab\(s\) — battle\/prefabs\/effects\/a\.ab$/);
    assert.match(lines[2], /known gaps: 0 todo, 0 drawn by hand-written code, 1 draw nothing/);
  });

  test('the il2cpp dump names an unknown script by its fields, an Effect behaviour before a battle node', () => {
    const name = py(`
import tempfile, os
d = tempfile.mkdtemp()
p = os.path.join(d, 'dump.cs')
open(p, 'w').write('''public class Nodes.CheckModifierContainsKey : ActionNode // TypeDefIndex: 1
{
\\tprivate string _customKey; // 0x10
}
public class TriggerAnimatorWhenFinish : Effect.Behaviour // TypeDefIndex: 2
{
\\t[SerializeField]
\\tprivate string _customKey; // 0x20
\\tprivate static DelegateBridge __Hotfix0_OnPlay; // 0x0
}
''')
cov = c.Coverage(dump=p)
cov.script(4242, ['_customKey'])
print(json.dumps([r['what'] for r in cov.report()]))`);
    assert.deepEqual(name, ['TriggerAnimatorWhenFinish']);
  });

  test('FollowMountPoint: read by its field names; raw words only for the 7-, 8- (EN after 2026-10-14) and 9-word (CN) layouts', () => {
    const r = py(`
import struct
from types import SimpleNamespace as NS
class Comp:
    def __init__(self, words, tree=None):
        self.type = NS(name='MonoBehaviour')
        self.raw = b'\\0' * 20 + struct.pack('<q', fe.MOUNT_SCRIPT) + struct.pack('<i', 0) + struct.pack(f'<{len(words)}i', *words)
        self.tree = tree
    def get_raw_data(self): return self.raw
    def read_typetree(self):
        if self.tree is None: raise ValueError('no type tree')
        return self.tree
def root(comp):
    files = NS(objects={7: comp})
    comp.assets_file = files
    return NS(read_typetree=lambda: {'m_Component': [{'component': {'m_FileID': 0, 'm_PathID': 7}}]}, assets_file=files)
ex = fe.Extractor.__new__(fe.Extractor)
tree = {'_mountPointType': 5, '_followScaleSign': 0, '_followScale': 0, '_pauseWhenFollowScaleNearlyZero': 0,
        '_pauseWhenMountPointInvalid': 1, '_onlyPauseWhenMountPointInvalid': 0, '_keepOriginRotation': 0, '_useBehaviourPause': 0}
out = {
  'tree': ex.mount_point(root(Comp([5, 0, 0, 0, 1, 0, 0, 0], tree))),
  'raw7': ex.mount_point(root(Comp([5, 0, 0, 1, 0, 1, 0]))),
  'raw8': ex.mount_point(root(Comp([5, 0, 0, 0, 1, 0, 1, 0]))),
  'raw9': ex.mount_point(root(Comp([5, 0, 0, 1065353216, 0, 1, 0, 1, 0]))),
  'raw10': ex.mount_point(root(Comp([5] * 10))),
}
print(json.dumps({k: v and [v['type'], v['pauseWhenInvalid'], v['onlyPauseWhenInvalid'], v['keepOriginRotation']] for k, v in out.items()}))`);
    assert.deepEqual(r, { tree: [5, 1, 0, 0], raw7: [5, 1, 0, 1], raw8: [5, 1, 0, 1], raw9: [5, 1, 0, 1], raw10: null });
  });

  test('a raw reader that disagrees with the type tree is reported with the fields', () => {
    const rep = py(`
cov = c.Coverage()
cov.begin('x/y')
cov.reader('ParticleEffect', False, 'raw words ≠ type tree: spawn')
cov.reader('ParticleEffect', True, None)
print(json.dumps([r['what'] for r in cov.report()]))`);
    assert.deepEqual(rep, ['ParticleEffect: raw words ≠ type tree: spawn']);
  });

  test('json_diff: the paths where an extracted file and a fresh extraction differ, list indices as []', () => {
    const d = py(`print(json.dumps(sorted(fe.json_diff(
  {'nodes': [{'name': 'a'}, {'name': 'qizi'}], 'duration': 1.0, 'face': {'rot': 1}},
  {'nodes': [{'name': 'a'}, {'name': 'qizi', 'mesh': {'mesh': 'Quad'}}], 'duration': 1.00001, 'spawn': 2}))))`);
    assert.deepEqual(d, ['face (gone)', 'nodes[].mesh (new)', 'spawn (new)']);
  });

  test('type_paths: the dotted field paths a Mecanim binding hashes (ParticleSystem.EmissionModule.rateOverTime.scalar)', () => {
    const hit = py(`
ps = {'EmissionModule': {'enabled': 1, 'rateOverTime': {'scalar': 5.0, 'minMaxState': 0}}, 'lengthInSec': 1.0}
print(json.dumps([p for p in fe.type_paths(ps) if fe.crc32(p) == fe.crc32('EmissionModule.rateOverTime.scalar')]))`);
    assert.deepEqual(hit, ['EmissionModule.rateOverTime.scalar']);
  });
});

describe('fx_coverage.py lists match the code they describe', { skip: !PY && 'no python3' }, () => {
  const lists = PY ? py(`print(json.dumps({'tex': sorted(c.PLAYER_TEXTURES), 'val': sorted(c.PLAYER_VALUES),
  'shapes': sorted(c.SHAPES_DRAWN), 'modules': sorted(c.MODULES_READ), 'known': sorted(c.KNOWN),
  'scripts': sorted(c.SCRIPTS.values()), 'read': sorted(c.SCRIPTS_READ)}))`) : null;
  const player = readFileSync(path.join(ROOT, 'public/js/render/fxplayer.js'), 'utf8');

  test('PLAYER_TEXTURES / PLAYER_VALUES = the material textures and values render/fxplayer.js reads', () => {
    const tex = new Set([...player.matchAll(/tex\('(_\w+)'\)|t\.(_\w+Tex)\b|'(_\w*Tex\w*)'/g)].map((m) => m[1] || m[2] || m[3]));
    const val = new Set([...player.matchAll(/\b[fc]\.(_\w+)/g)].map((m) => m[1]));
    for (const m of player.matchAll(/^const CLIP_(?:UNIFORM|COMP) = \{([\s\S]*?)\};/gm)) {
      for (const k of m[1].matchAll(/(_\w+):/g)) if (!k[1].endsWith('_ST')) val.add(k[1]);
    }
    assert.deepEqual(lists.tex, [...tex].filter((n) => !n.endsWith('_ST')).sort());
    assert.deepEqual(lists.val, [...val].sort());
  });

  test('SHAPES_DRAWN = the shape types of the player\'s emitter switch', () => {
    const sw = player.slice(player.indexOf('switch (sh.type)'));
    const body = sw.slice(0, sw.indexOf('\n  }\n'));
    const cases = [...body.matchAll(/case (\d+):/g)].map((m) => +m[1]).sort((a, b) => a - b);
    assert.deepEqual(lists.shapes, cases);
  });

  test('MODULES_READ = the ParticleSystem modules fx_extract.particle_system reads', () => {
    const ex = readFileSync(path.join(TOOL, 'fx_extract.py'), 'utf8');
    const fn = ex.slice(ex.indexOf('def particle_system('), ex.indexOf('# ------', ex.indexOf('def particle_system(')));
    const mods = new Set([...fn.matchAll(/ps(?:\.get\(|\[)'(\w+Module)'/g)].map((m) => m[1]));
    assert.deepEqual(lists.modules, [...mods].sort());
  });

  test('every known script is a named script; every read script is in SCRIPTS', () => {
    const scripts = new Set(lists.scripts);
    for (const k of lists.known.filter((k) => k.startsWith('script:') && !k.startsWith('script:#'))) assert.ok(scripts.has(k.slice(7)), k);
    for (const r of lists.read) assert.ok(scripts.has(r), r);
  });
});
