#!/usr/bin/env python3
"""Battle effect extraction (local patch, docs/LOCAL-PATCH.md): official operator skill / attack effects from a
locally installed client, for the web effect player (public/js/render/fxplayer.js, preview page /fxlab.html).

An effect is a Unity prefab in battle/prefabs/effects/<name>.ab (e.g. chen3_skill_01_start_01): a GameObject tree of
ParticleSystems (+ renderers), MeshRenderers and an Animator whose Mecanim clip animates transforms and material
properties. This script writes, per effect bundle:

    public/assets/local/fx/<bundle>/<prefab>.json   the tree, normalized particle modules, materials, clip curves
    public/assets/local/fx/tex/<texture>.webp       textures (shared by every effect; static WebP, --png for PNG)
    public/assets/local/fx/mesh/<mesh>.json         meshes (positions, uv, colors, indices)
    public/assets/local/fx/index.json               { bundles: { <bundle>: [prefab, ...] } }

Textures usually live in other bundles, named only by their internal CAB file; `--cab-index` (built once with
--build-cab-index, a JSON CAB -> bundle path) lets the loader pull them in. Nothing here is required by the game: an
install without the files draws its procedural effects (render/fx.js).

Usage:
    python fx_extract.py --game <Arknights_Data> --build-cab-index .cache/fx-cab-index.json
    python fx_extract.py --game <Arknights_Data> --cab-index .cache/fx-cab-index.json --bundle chen3 [--prefab NAME ...]
                         [--match REGEX] [--list] [--all-skins] [--prune]
    python fx_extract.py … --bundle wang_token --pack pkgrps/btl_pfb_fx_token_3.ab --match '^token_wang_'   (望's 棋子)
Default skin only unless --all-skins; --prune deletes textures / meshes no effect uses any more.
Needs UnityPy + lz4 (requirements.txt); LZ4AK bundles are decoded by aklz4.py.
"""
import argparse
import json
import math
import os
import re
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'assets' / 'local' / 'fx'
BUNDLE_DIRS = ('PersistentData/Bundles', 'StreamingAssets/AB/Windows')  # PersistentData (hot updates) first
# skin / collab variants of a prefab (the remake draws the default skin only; keep in sync with render/fxmap.js isVariant)
WEBP_QUALITY = 85
WIDTH_ATTR = zlib.crc32(b'm_Parameters.widthMultiplier')   # local patch: the clip binding of a line / trail's width
VARIANT_RE = re.compile(r'#\d+|_sale|_iteration|_avemujica|_cn_topolect', re.I)
# local patch: prefabs never extracted — common_stealth (texture common_leaf; only the 生息演算 buildings use it, and the maintainer has
# never seen the leaf in the game, 2026-10-08: "그 텍스처는 폐기해")
DISCARD = {'common_stealth'}
# local patch (maintainer report, maintainer's decision 2026-10-08): Unity's built-in meshes a MeshFilter / mesh particle names in
# `Library/unity default resources` (FileID → that external, the PathID below) — 缄默德克萨斯 S3's falling sword blade is a
# Quad. The client ships the file (<Arknights_Data>/Resources); only Quad / Plane are read from it (Cube 10202 / Sphere 10207
# are left out by the decision)
BUILTIN_RES = 'unity default resources'
BUILTIN_MESHES = {10209: 'Plane', 10210: 'Quad'}
# local patch: the MonoScript PathID of the effects' FollowMountPoint component (mount_point); 1205
# default-skin prefabs of the EN client carry one (maintainer's notes 2026-10-08)
MOUNT_SCRIPT = 0x7b5c342088cfcad4
# 2026-10-10, decompile check: the MonoScript PathID of SwitchableBackEffect (switch_back) — 62 default-skin
# prefabs of the extracted bundles carry one (비르투오사 S3 cello_skill_03_buff_front_02 → _back_02, 로즈몬티스, 휴머스 …)
BACK_SCRIPT = 7599136815520768295


def r4(v):
    """Round floats for compact JSON."""
    if isinstance(v, float):
        if math.isinf(v) or math.isnan(v):
            return 0
        return round(v, 4)
    return v


def bundle_path(game, rel):
    for d in BUNDLE_DIRS:
        p = Path(game) / d / rel
        if p.exists():
            return p
    return None


# ---------------------------------------------------------------- CAB index

def build_cab_index(game, out):
    from UnityPy.files.BundleFile import BundleFile
    from UnityPy.streams import EndianBinaryReader
    import aklz4  # noqa: F401
    idx = {}
    for d in reversed(BUNDLE_DIRS):  # StreamingAssets first, PersistentData overrides
        root = Path(game) / d
        for dp, _dn, fn in os.walk(root):
            for f in fn:
                if not f.endswith('.ab'):
                    continue
                p = Path(dp) / f
                try:
                    bf = BundleFile(EndianBinaryReader(p.read_bytes()), None, name=str(p))
                except Exception:
                    continue
                for name in bf.files.keys():
                    if name.startswith('CAB-') and '.' not in name:
                        idx[name] = str(p.relative_to(game))
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(idx))
    print(f'[fx] CAB index: {len(idx)} entries -> {out}')


# ---------------------------------------------------------------- value normalizers

def curve_keys(c):
    """AnimationCurve -> [[t, v, inSlope, outSlope], ...]."""
    return [[r4(k['time']), r4(k['value']), r4(k['inSlope']), r4(k['outSlope'])] for k in (c or {}).get('m_Curve', [])]


def minmax(mm):
    """MinMaxCurve -> {m: mode, s: scalar, n: minScalar, c?: curve, d?: minCurve}. Modes: 0 constant, 1 curve,
    2 random between two curves, 3 random between two constants."""
    if not isinstance(mm, dict):
        return None
    m = mm.get('minMaxState', 0)
    o = {'m': m, 's': r4(mm.get('scalar', 0))}
    if m == 3:
        o['n'] = r4(mm.get('minScalar', 0))
    if m in (1, 2):
        o['c'] = curve_keys(mm.get('maxCurve'))
    if m == 2:
        o['d'] = curve_keys(mm.get('minCurve'))
    return o


def color(c):
    return [r4(c['r']), r4(c['g']), r4(c['b']), r4(c['a'])]


def gradient(g):
    nc, na = g.get('m_NumColorKeys', 2), g.get('m_NumAlphaKeys', 2)
    ck = [[r4(g[f'ctime{i}'] / 65535), r4(g[f'key{i}']['r']), r4(g[f'key{i}']['g']), r4(g[f'key{i}']['b'])] for i in range(nc)]
    ak = [[r4(g[f'atime{i}'] / 65535), r4(g[f'key{i}']['a'])] for i in range(na)]
    return {'c': ck, 'a': ak, 'mode': g.get('m_Mode', 0)}


def mmgrad(mg):
    """MinMaxGradient -> {m, a?, b?, g?, h?}: 0 color, 1 gradient, 2 random two colors, 3 random two gradients,
    4 random color from gradient."""
    if not isinstance(mg, dict):
        return None
    m = mg.get('minMaxState', 0)
    o = {'m': m}
    if m in (0, 2):
        o['a'] = color(mg['maxColor'])
    if m == 2:
        o['b'] = color(mg['minColor'])
    if m in (1, 3, 4):
        o['g'] = gradient(mg['maxGradient'])
    if m == 3:
        o['h'] = gradient(mg['minGradient'])
    return o


def vec3(v):
    return [r4(v['x']), r4(v['y']), r4(v['z'])]


# ---------------------------------------------------------------- particle system

def particle_system(ps, psr, mat_key, mesh_key, trail_mat=None):
    im = ps['InitialModule']
    o = {
        'dur': r4(ps['lengthInSec']), 'loop': bool(ps['looping']), 'delay': minmax(ps['startDelay']),
        'speedMul': r4(ps.get('simulationSpeed', 1)), 'space': ps.get('moveWithTransform', 0),  # 0 local, 1 world
        'scaling': ps.get('scalingMode', 1), 'prewarm': bool(ps.get('prewarm', 0)),
        'life': minmax(im['startLifetime']), 'speed': minmax(im['startSpeed']), 'color': mmgrad(im['startColor']),
        'size': minmax(im['startSize']), 'rot': minmax(im['startRotation']), 'max': im['maxNumParticles'],
        'gravity': minmax(im.get('gravityModifier')), 'flipRot': r4(im.get('randomizeRotationDirection', 0)),
    }
    if im.get('size3D'):
        o['sizeY'], o['sizeZ'] = minmax(im['startSizeY']), minmax(im['startSizeZ'])
    if im.get('rotation3D'):
        o['rotX'], o['rotY'] = minmax(im['startRotationX']), minmax(im['startRotationY'])
    em = ps['EmissionModule']
    if em['enabled']:
        o['rate'] = minmax(em['rateOverTime'])
        o['bursts'] = [{'t': r4(b['time']), 'n': minmax(b['countCurve']), 'cycles': b['cycleCount'],
                        'interval': r4(b['repeatInterval']), 'p': r4(b.get('probability', 1))}
                       for b in em.get('m_Bursts', [])[:em.get('m_BurstCount', 0)]]
    sh = ps['ShapeModule']
    if sh['enabled']:
        o['shape'] = {'type': sh['type'], 'radius': r4(sh['radius']['value']) if isinstance(sh.get('radius'), dict) else r4(sh.get('radius', 1)),
                      'angle': r4(sh['angle']), 'arc': r4(sh['arc']['value']) if isinstance(sh.get('arc'), dict) else 360,
                      'thick': r4(sh.get('radiusThickness', 1)), 'length': r4(sh.get('length', 0)),
                      'pos': vec3(sh['m_Position']), 'rotE': vec3(sh['m_Rotation']), 'scale': vec3(sh['m_Scale']),
                      'box': vec3(sh.get('boxThickness', {'x': 0, 'y': 0, 'z': 0})),
                      'align': sh.get('alignToDirection', 0), 'randDir': r4(sh.get('randomDirectionAmount', 0)),
                      'sphDir': r4(sh.get('sphericalDirectionAmount', 0))}
    mods = {}
    if ps['SizeModule']['enabled']:
        s = ps['SizeModule']
        mods['sizeOL'] = {'x': minmax(s['curve'])}
        if s.get('separateAxes'):
            mods['sizeOL'].update({'y': minmax(s['y']), 'z': minmax(s['z'])})
    if ps['ColorModule']['enabled']:
        mods['colorOL'] = mmgrad(ps['ColorModule']['gradient'])
    if ps['RotationModule']['enabled']:
        r = ps['RotationModule']
        mods['rotOL'] = {'z': minmax(r['curve'])}
        if r.get('separateAxes'):
            mods['rotOL'].update({'x': minmax(r['x']), 'y': minmax(r['y'])})
    if ps['VelocityModule']['enabled']:
        v = ps['VelocityModule']
        mods['velOL'] = {'x': minmax(v['x']), 'y': minmax(v['y']), 'z': minmax(v['z']), 'world': bool(v.get('inWorldSpace')),
                         'radial': minmax(v.get('radial')), 'orbZ': minmax(v.get('orbitalZ')), 'speedMul': minmax(v.get('speedModifier'))}
    if ps['ForceModule']['enabled']:
        f = ps['ForceModule']
        mods['force'] = {'x': minmax(f['x']), 'y': minmax(f['y']), 'z': minmax(f['z']), 'world': bool(f.get('inWorldSpace'))}
    if ps['ClampVelocityModule']['enabled']:
        c = ps['ClampVelocityModule']
        mods['limit'] = {'mag': minmax(c['magnitude']), 'dampen': r4(c.get('dampen', 0)), 'drag': minmax(c.get('drag'))}
    if ps['NoiseModule']['enabled']:
        n = ps['NoiseModule']
        mods['noise'] = {'str': minmax(n['strength']), 'freq': r4(n['frequency']), 'scroll': minmax(n.get('scrollSpeed')),
                         'damping': bool(n.get('damping'))}
    if ps['UVModule']['enabled']:
        u = ps['UVModule']
        mods['uv'] = {'tx': u['tilesX'], 'ty': u['tilesY'], 'frame': minmax(u['frameOverTime']), 'start': minmax(u['startFrame']),
                      'cycles': r4(u['cycles']), 'anim': u['animationType'], 'row': u.get('rowIndex', 0), 'rowMode': u.get('rowMode', 0)}
    cd = ps.get('CustomDataModule', {})
    if cd.get('enabled'):
        out = []
        for i in (0, 1):
            mode = cd.get(f'mode{i}', 0)  # 0 disabled, 1 vector, 2 color
            if mode == 1:
                out.append({'v': [minmax(cd[f'vector{i}_{k}']) for k in range(cd.get(f'vectorComponentCount{i}', 4))]})
            elif mode == 2:
                out.append({'col': mmgrad(cd[f'color{i}'])})
            else:
                out.append(None)
        mods['custom'] = out
    tm = ps.get('TrailModule', {})
    if tm.get('enabled'):
        mods['trail'] = {'mode': tm.get('mode', 0), 'ratio': r4(tm.get('ratio', 1)), 'life': minmax(tm.get('lifetime')),
                         'minDist': r4(tm.get('minVertexDistance', 0.2)), 'texMode': tm.get('textureMode', 0),
                         'world': bool(tm.get('worldSpace')), 'die': bool(tm.get('dieWithParticles', True)),
                         'sizeWidth': bool(tm.get('sizeAffectsWidth')), 'inherit': bool(tm.get('inheritParticleColor')),
                         'colorOL': mmgrad(tm.get('colorOverLifetime')), 'width': minmax(tm.get('widthOverTrail')),
                         'colorOT': mmgrad(tm.get('colorOverTrail')), 'ribbons': tm.get('ribbonCount', 1)}
    if ps.get('SubModule', {}).get('enabled'):
        mods['sub'] = True    # not played yet
    o['mods'] = mods
    o['render'] = {'mode': psr['m_RenderMode'], 'mat': mat_key, 'mesh': mesh_key, 'trailMat': trail_mat, 'lengthScale': r4(psr.get('m_LengthScale', 2)),
                   'velScale': r4(psr.get('m_VelocityScale', 0)), 'align': psr.get('m_RenderAlignment', 0),
                   'pivot': vec3(psr['m_Pivot']) if isinstance(psr.get('m_Pivot'), dict) else [0, 0, 0],
                   'order': psr.get('m_SortingOrder', 0), 'fudge': r4(psr.get('m_SortingFudge', 0)),
                   'maxSize': r4(psr.get('m_MaxParticleSize', 0.5)), 'streams': list(psr.get('m_VertexStreams', b''))
                   if isinstance(psr.get('m_VertexStreams'), (bytes, list)) else []}
    return o


# ---------------------------------------------------------------- Mecanim clip (streamed / dense / constant)

def decode_clip(clip):
    """-> (duration, [curve keys per curve index]) where a key is [t, c0, c1, c2, c3] (value = c3 + c2 dt + c1 dt^2 + c0 dt^3)."""
    mc = clip['m_MuscleClip']
    data = mc['m_Clip']['data']
    curves = []
    sc = data['m_StreamedClip']
    n_stream = sc['curveCount']
    raw = struct.pack(f'<{len(sc["data"])}I', *sc['data'])
    streamed = [[] for _ in range(n_stream)]
    pos = 0
    while pos + 8 <= len(raw):
        t, nk = struct.unpack_from('<fi', raw, pos)
        pos += 8
        for _ in range(nk):
            i, c0, c1, c2, c3 = struct.unpack_from('<iffff', raw, pos)
            pos += 20
            if 0 <= i < n_stream and math.isfinite(t):
                streamed[i].append([r4(t), r4(c0), r4(c1), r4(c2), r4(c3)])
    curves.extend(streamed)
    dc = data['m_DenseClip']
    nf, ncur, rate, t0 = dc['m_FrameCount'], dc['m_CurveCount'], dc['m_SampleRate'], dc['m_BeginTime']
    arr = dc['m_SampleArray']
    for ci in range(ncur):
        keys = []
        for f in range(nf):
            v = arr[f * ncur + ci]
            v2 = arr[(f + 1) * ncur + ci] if f + 1 < nf else v
            slope = (v2 - v) * rate
            keys.append([r4(t0 + f / rate), 0, 0, r4(slope), r4(v)])
        curves.append(keys)
    for v in data['m_ConstantClip']['data']:
        curves.append([[0, 0, 0, 0, r4(v)]])
    return r4(mc['m_StopTime']), curves


def crc32(s):
    return zlib.crc32(s.encode('utf-8')) & 0xffffffff


# ---------------------------------------------------------------- extraction

class Extractor:
    def __init__(self, game, cab_index, png=False):
        self.png = png
        import UnityPy
        import aklz4  # noqa: F401
        self.UnityPy = UnityPy
        self.game = Path(game)
        self.cab = json.loads(Path(cab_index).read_text()) if cab_index else {}
        self.textures = {}   # path_id/name key -> file name
        self.meshes = {}
        self.builtin = None  # the client's unity default resources, loaded on first use (mesh_ref)

    def load(self, bundle_rel):
        files = [bundle_path(self.game, bundle_rel)]
        if not files[0]:
            raise SystemExit(f'bundle not found: {bundle_rel}')
        env = self.UnityPy.load(*map(str, files))
        # pull in dependency bundles (textures, shaders, shared meshes) named by their CAB
        seen = {str(files[0])}
        for _ in range(2):
            deps = set()
            for f in list(env.files.values()):
                for sf in getattr(f, 'files', {}).values():
                    for e in getattr(sf, 'externals', []):
                        cab = e.path.split('/')[-1]
                        rel = self.cab.get(cab)
                        if rel:
                            p = str(self.game / rel)
                            if p not in seen:
                                deps.add(p)
            for p in deps:
                seen.add(p)
                try:
                    env.load_file(p)
                except Exception as ex:  # a broken dependency only costs its textures
                    print(f'[fx] dependency {p}: {ex}')
        return env

    @staticmethod
    def resolve(pptr, ctx):
        if not pptr or not pptr.get('m_PathID'):
            return None
        try:
            if pptr['m_FileID'] == 0:
                return ctx.assets_file.objects.get(pptr['m_PathID'])
            ext = ctx.assets_file.externals[pptr['m_FileID'] - 1]
            target = ext.path.split('/')[-1].lower()
            env = ctx.assets_file.environment
            for f in env.files.values():
                for name, sf in getattr(f, 'files', {}).items():
                    if name.lower() == target and hasattr(sf, 'objects'):
                        return sf.objects.get(pptr['m_PathID'])
        except Exception:
            return None
        return None

    def mesh_ref(self, pptr, ctx):
        """local patch: resolve() for a mesh, falling back to the built-in Quad / Plane (BUILTIN_MESHES)."""
        o = self.resolve(pptr, ctx)
        if o is not None or not pptr or not pptr.get('m_FileID') or pptr.get('m_PathID') not in BUILTIN_MESHES:
            return o
        try:
            if ctx.assets_file.externals[pptr['m_FileID'] - 1].path.split('/')[-1].lower() != BUILTIN_RES:
                return None
        except Exception:
            return None
        if self.builtin is None:
            p = self.game / 'Resources' / BUILTIN_RES
            self.builtin = self.UnityPy.load(str(p)) if p.exists() else False
            if not self.builtin:
                print(f'[fx] no {p}: the built-in Quad / Plane meshes are skipped')
        if not self.builtin:
            return None
        for f in self.builtin.files.values():
            o = getattr(f, 'objects', {}).get(pptr['m_PathID'])
            if o is not None:
                return o
        return None

    def texture(self, obj, out):
        key = f'{obj.read().m_Name}_{obj.path_id & 0xffffffff:08x}'
        if key in self.textures:
            return self.textures[key]
        name = key + ('.png' if self.png else '.webp')
        p = out / 'tex' / name
        if not p.exists():
            p.parent.mkdir(parents=True, exist_ok=True)
            try:
                img = obj.read().image
                if self.png:
                    img.save(p)
                else:  # static WebP, alpha kept at full quality (iOS Safari 14+; older browsers skip the official effects)
                    img.save(p, 'WEBP', quality=WEBP_QUALITY, method=6, alpha_quality=100)
            except Exception as ex:
                print(f'[fx] texture {key}: {ex}')
                return None
        self.textures[key] = name
        return name

    def mesh(self, obj, out):
        key = f'{obj.read().m_Name}_{obj.path_id & 0xffffffff:08x}'
        if key in self.meshes:
            return self.meshes[key]
        m = obj.read()
        try:
            from UnityPy.helpers.MeshHelper import MeshHandler
            h = MeshHandler(m)
            h.process()
            pos = [r4(v) for vtx in h.m_Vertices for v in vtx] if h.m_Vertices and isinstance(h.m_Vertices[0], (list, tuple)) else [r4(v) for v in (h.m_Vertices or [])]
            uv = [r4(v) for vtx in (h.m_UV0 or []) for v in (vtx if isinstance(vtx, (list, tuple)) else [vtx])]
            col = [r4(v) for vtx in (h.m_Colors or []) for v in (vtx if isinstance(vtx, (list, tuple)) else [vtx])]
            idx = [i for tri in h.get_triangles() for face in ([tri] if isinstance(tri[0], int) else tri) for i in face]
        except Exception as ex:
            print(f'[fx] mesh {key}: {ex}')
            return None
        data = {'pos': pos, 'uv': uv, 'idx': idx}
        if col:
            data['col'] = col
        p = out / 'mesh' / (key + '.json')
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(data, separators=(',', ':')))
        self.meshes[key] = key
        return key

    def material(self, obj, out, mats):
        d = obj.read_typetree()
        key = f'{d["m_Name"]}_{obj.path_id & 0xffffffff:08x}'
        if key in mats:
            return key
        sh = self.resolve(d['m_Shader'], obj)
        shader = None
        if sh is not None:
            try:
                shader = sh.read().m_ParsedForm.m_Name
            except Exception:
                shader = None
        props = d['m_SavedProperties']

        def pairs(lst):
            for e in lst:
                yield (e['first'], e['second']) if isinstance(e, dict) else (e[0], e[1])
        tex = {}
        for name, te in pairs(props['m_TexEnvs']):
            t = self.resolve(te['m_Texture'], obj)
            if t is None:
                continue
            f = self.texture(t, out)
            if f:
                tex[name] = {'img': f, 'tiling': [r4(te['m_Scale']['x']), r4(te['m_Scale']['y'])],
                             'offset': [r4(te['m_Offset']['x']), r4(te['m_Offset']['y'])]}
        floats = {n: r4(v) for n, v in pairs(props['m_Floats'])}
        colors = {n: color(v) for n, v in pairs(props['m_Colors'])}
        mats[key] = {'shader': shader, 'tex': tex, 'floats': floats, 'colors': colors,
                     'queue': d.get('m_CustomRenderQueue', -1), 'keywords': d.get('m_ValidKeywords') or d.get('m_ShaderKeywords')}
        return key

    def prefab(self, root, out):
        nodes, mats, paths = [], {}, {}
        animators = []

        def walk(go, parent, path):
            d = go.read_typetree()
            node = {'name': d['m_Name'], 'parent': parent, 'active': bool(d.get('m_IsActive', 1))}
            idx = len(nodes)
            nodes.append(node)
            paths[idx] = path
            tr = None
            for c in d['m_Component']:
                comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], go)
                if comp is None:
                    continue
                t = comp.type.name
                if t == 'Transform':
                    tr = comp.read_typetree()
                    node['pos'] = vec3(tr['m_LocalPosition'])
                    q = tr['m_LocalRotation']
                    node['rot'] = [r4(q['x']), r4(q['y']), r4(q['z']), r4(q['w'])]
                    node['scale'] = vec3(tr['m_LocalScale'])
                elif t == 'ParticleSystem':
                    node['_ps'] = comp
                elif t == 'ParticleSystemRenderer':
                    node['_psr'] = comp
                elif t == 'MeshRenderer':
                    node['_mr'] = comp
                elif t == 'MeshFilter':
                    node['_mf'] = comp
                elif t == 'Animator':
                    animators.append((idx, comp))
                elif t == 'TrailRenderer':
                    tr_t = comp.read_typetree()
                    tm = self.resolve(tr_t['m_Materials'][0], comp) if tr_t.get('m_Materials') else None
                    pr = tr_t.get('m_Parameters', {})
                    if tm is not None and tr_t.get('m_Enabled', 1):
                        node['trailR'] = {'time': r4(tr_t.get('m_Time', 1)), 'width': r4(pr.get('widthMultiplier', 1)),
                                          'widthCurve': curve_keys(pr.get('widthCurve')), 'grad': gradient(pr['colorGradient']),
                                          'align': pr.get('alignment', 0), 'texMode': pr.get('textureMode', 0),
                                          'minDist': r4(tr_t.get('m_MinVertexDistance', 0.1)), 'emitting': bool(tr_t.get('m_Emitting', 1)),
                                          'mat': self.material(tm, out, mats), 'order': tr_t.get('m_SortingOrder', 0)}
                elif t == 'LineRenderer':
                    # local patch (maintainer report 2026-10-07: 蕾缪安 S3's aiming beams were missing): a line through fixed points
                    # (local space; world-space lines get their points from a client script — kept, drawn local [ASSUMED])
                    ln_t = comp.read_typetree()
                    lm = self.resolve(ln_t['m_Materials'][0], comp) if ln_t.get('m_Materials') else None
                    pr = ln_t.get('m_Parameters', {})
                    if lm is not None and ln_t.get('m_Enabled', 1) and len(ln_t.get('m_Positions') or []) >= 2:
                        node['lineR'] = {'pts': [vec3(v) for v in ln_t['m_Positions']], 'world': bool(ln_t.get('m_UseWorldSpace', 0)),
                                         'loop': bool(ln_t.get('m_Loop', 0)), 'width': r4(pr.get('widthMultiplier', 1)),
                                         'widthCurve': curve_keys(pr.get('widthCurve')), 'grad': gradient(pr['colorGradient']),
                                         'align': pr.get('alignment', 0), 'texMode': pr.get('textureMode', 0),
                                         'mat': self.material(lm, out, mats), 'order': ln_t.get('m_SortingOrder', 0)}
            for comp_key in ('_ps',):
                if comp_key in node:
                    psr = node.pop('_psr', None)
                    psr_t = psr.read_typetree() if psr else {}
                    mat_key = trail_mat = None
                    if psr_t.get('m_Materials'):
                        m = self.resolve(psr_t['m_Materials'][0], psr)
                        if m is not None:
                            mat_key = self.material(m, out, mats)
                        if len(psr_t['m_Materials']) > 1:
                            m2 = self.resolve(psr_t['m_Materials'][1], psr)
                            if m2 is not None:
                                trail_mat = self.material(m2, out, mats)
                    mesh_key = None
                    if psr_t.get('m_RenderMode') == 4:
                        mo = self.mesh_ref(psr_t.get('m_Mesh'), psr)
                        if mo is not None:
                            mesh_key = self.mesh(mo, out)
                    ps_t = node.pop('_ps').read_typetree()
                    # a system without a material / an enabled renderer draws nothing (often an empty container)
                    has_trail = ps_t.get('TrailModule', {}).get('enabled') and trail_mat
                    if (mat_key or has_trail) and psr_t.get('m_Enabled', 1):
                        node['ps'] = particle_system(ps_t, psr_t, mat_key, mesh_key, trail_mat)
            node.pop('_psr', None)
            if '_mr' in node and '_mf' in node:
                mr = node.pop('_mr').read_typetree()
                mf = node.pop('_mf')
                mo = self.mesh_ref(mf.read_typetree()['m_Mesh'], mf)
                mat = self.resolve(mr['m_Materials'][0], node.get('_ctx', mf)) if mr.get('m_Materials') else None
                if mo is not None and mat is not None:
                    node['mesh'] = {'mesh': self.mesh(mo, out), 'mat': self.material(mat, out, mats),
                                    'order': mr.get('m_SortingOrder', 0)}
            node.pop('_mr', None)
            node.pop('_mf', None)
            if tr:
                for ch in tr['m_Children']:
                    cto = self.resolve(ch, go)
                    if cto is None:
                        continue
                    cgo = self.resolve(cto.read_typetree()['m_GameObject'], cto)
                    if cgo is not None:
                        cname = cgo.read_typetree()['m_Name']
                        walk(cgo, idx, f'{path}/{cname}' if path else cname)

        walk(root, -1, '')
        spawn = self.spawn_location(root)
        clips = []
        for aidx, anim in animators:
            clips.extend(self.animator_clips(anim, aidx, nodes, paths, mats))
        dur = 0
        for n in nodes:
            ps = n.get('ps')
            if ps:
                life = ps['life'] or {}
                lmax = max(life.get('s', 0), life.get('n', 0)) if life.get('m') in (0, 3) else max([k[1] for k in life.get('c', [[0, 1]])] or [1]) * life.get('s', 1)
                dly = (ps['delay'] or {}).get('s', 0)
                dur = max(dur, dly + (ps['dur'] if not ps['loop'] else 2) + lmax)
        for c in clips:
            dur = max(dur, c['len'])
        out_def = {'version': 1, 'name': nodes[0]['name'], 'duration': r4(min(dur, 10)), 'nodes': nodes, 'materials': mats, 'clips': clips}
        if spawn is not None:
            out_def['spawn'] = spawn
        mount = self.mount_point(root)
        if mount is not None:
            out_def['mount'] = mount
        right = self.right_effect(root)
        if right:
            out_def['right'] = right
        back = self.switch_back(root)
        if back:
            out_def['back'] = back
        return out_def

    def switch_back(self, root):
        """2026-10-10, decompile check — client `SwitchableBackEffect._UpdateFace`: the root's
        SwitchableBackEffect — while the owner faces back (its back model) the client pauses this effect and plays
        `_backEffect` instead, and the other way round when it turns to the front (render/fxgame.js backSwap). Read by its
        type tree (the bundle carries it): { effect: _backEffect ('common_empty' = nothing while back), predict:
        _predictFaceDirection, oneShot: _oneShot }. None when the root has none."""
        try:
            d = root.read_typetree()
        except Exception:
            return None
        for c in d['m_Component']:
            comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], root)
            if comp is None or comp.type.name != 'MonoBehaviour':
                continue
            raw = comp.get_raw_data()
            if len(raw) < 28 or struct.unpack_from('<q', raw, 20)[0] != BACK_SCRIPT:
                continue
            try:
                t = comp.read_typetree()
            except Exception:
                return None
            if not isinstance(t.get('_backEffect'), str) or not t['_backEffect']:
                return None
            return {'effect': t['_backEffect'], 'predict': int(t.get('_predictFaceDirection') or 0), 'oneShot': int(t.get('_oneShot') or 0)}
        return None

    def right_effect(self, root):
        """local patch: the client's left / right effect pair — a second component on the root with `_rightEffect` (the
        prefab played instead while the owner faces right; this one is the left-facing copy) and `_onlyCheckOnPlay`
        (chen3 S3 buff_L / buff_R, mlynar, texas2, tippi: 15 pairs). Read by its type tree, else raw: header, empty name,
        one string, one int. None when the root has no such component."""
        try:
            d = root.read_typetree()
        except Exception:
            return None
        for c in d['m_Component']:
            comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], root)
            if comp is None or comp.type.name != 'MonoBehaviour':
                continue
            try:
                t = comp.read_typetree()
                if isinstance(t.get('_rightEffect'), str):
                    return t['_rightEffect'] or None
                continue
            except Exception:
                pass
            raw = comp.get_raw_data()
            off = 12 + 4 + 12
            if len(raw) > 200 or len(raw) < off + 12 or struct.unpack_from('<i', raw, off)[0] != 0:
                continue
            off += 4
            n = struct.unpack_from('<i', raw, off)[0]
            end = (off + 4 + n + 3) & ~3
            if not 0 < n <= 128 or end + 4 != len(raw):
                continue
            s = raw[off + 4:off + 4 + n].decode('utf-8', 'replace')
            if re.fullmatch(r'[\w#.\-]+', s):
                return s
        return None

    def spawn_location(self, root):
        """local patch: the effect component's `_spawnLocation` on the root (1 feet, 2 body / HIT point, 4 head, 5 ground
        centre — docs/rules/fx.md 「관리자 제보 재수정 (2026-10-07 저녁)」). Its script's type tree is not in the bundle, so the raw fields are
        read: after the MonoBehaviour header and name, int #13 (verified on buff_stun 4 / buff_slowdown 1 / buff_sleep 2);
        the component is recognised by its float −1 at #6 and 2.0 at #10. None when not found. Any SpawnLocation value
        (local patch: 9–15 = MP_SPECIAL_1…6 — the cap at 8 left 66 prefabs without one)."""
        try:
            d = root.read_typetree()
        except Exception:
            return None
        for c in d['m_Component']:
            comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], root)
            if comp is None or comp.type.name != 'MonoBehaviour':
                continue
            raw = comp.get_raw_data()
            off = 12 + 4 + 12
            if len(raw) < off + 4:
                continue
            n = struct.unpack_from('<i', raw, off)[0]
            off = (off + 4 + n + 3) & ~3
            if len(raw) < off + 14 * 4:
                continue
            ints = struct.unpack_from('<14i', raw, off)
            if ints[6] == -1082130432 and ints[10] == 1073741824 and 0 <= ints[13] < 64:
                return ints[13]
        return None

    def mount_point(self, root):
        """local patch (maintainer report): the root's FollowMountPoint component — the effect follows
        a model point of its owner every frame (스펙터 디 언체인드 S2's red ring on her saw). Its script's type tree is not in
        the bundle; the component is recognised by its MonoScript (PathID MOUNT_SCRIPT) and read raw: after the header and
        the empty name, 7 ints in the field order of global-metadata's field table — _mountPointType (MountPointType,
        its constants: 0 FOOT, 1 HIT, 2 MUZZLE, 3 HEAD, 4 UI, 5 SPECIAL_0, 6 SPECIAL_1, 7 GROUND, 8–21 SPECIAL_2–15;
        render/fxpoints.js mountSpawn), _followScaleSign, _followScale,
        _pauseWhenMountPointInvalid, _onlyPauseWhenMountPointInvalid, _keepOriginRotation, _useBehaviourPause (bools as
        ints). None when the root has none."""
        try:
            d = root.read_typetree()
        except Exception:
            return None
        for c in d['m_Component']:
            comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], root)
            if comp is None or comp.type.name != 'MonoBehaviour':
                continue
            raw = comp.get_raw_data()
            if len(raw) < 32 or struct.unpack_from('<q', raw, 20)[0] != MOUNT_SCRIPT:
                continue
            n = struct.unpack_from('<i', raw, 28)[0]
            off = (32 + n + 3) & ~3
            if len(raw) < off + 7 * 4:
                return None
            v = struct.unpack_from('<7i', raw, off)
            return {'type': v[0], 'followScaleSign': v[1], 'followScale': v[2], 'pauseWhenInvalid': v[3],
                    'onlyPauseWhenInvalid': v[4], 'keepOriginRotation': v[5], 'useBehaviourPause': v[6]}
        return None

    def animator_clips(self, anim, aidx, nodes, paths, mats):
        a = anim.read_typetree()
        ctrl = self.resolve(a.get('m_Controller'), anim)
        if ctrl is None:
            return []
        ct = ctrl.read_typetree()
        clips_out = []
        base = paths[aidx]
        rel = {}
        for i, p in paths.items():
            if base and not (p == base or p.startswith(base + '/')):
                continue
            rp = p[len(base) + 1:] if base and p != base else ('' if p == base else p)
            rel[crc32(rp)] = i
        for cp in ct.get('m_AnimationClips', [])[:1]:  # the default state's clip
            co = self.resolve(cp, ctrl)
            if co is None:
                continue
            clip = co.read_typetree()
            length, curves = decode_clip(clip)
            bindings = clip['m_ClipBindingConstant']['genericBindings']
            ci = 0
            tracks = []
            for b in bindings:
                tid, attr = b['typeID'], b['attribute']
                n = 1
                prop = None
                if tid == 4:
                    n = {1: 3, 2: 4, 3: 3, 4: 3}.get(attr, 1)
                    prop = {1: 'pos', 2: 'quat', 3: 'scale', 4: 'euler'}.get(attr)
                node = rel.get(b['path'])
                if prop is None and node is not None and attr == WIDTH_ATTR:
                    prop = 'width'   # local patch: a Line / Trail Renderer's widthMultiplier
                if prop is None and node is not None:
                    prop = self.material_prop(attr, nodes[node], mats) or f'attr:{attr}'
                if node is not None and prop:
                    tracks.append({'node': node, 'prop': prop, 'type': tid, 'curves': curves[ci:ci + n]})
                ci += n
            clips_out.append({'name': clip['m_Name'], 'len': length, 'loop': bool(clip.get('m_MuscleClip', {}).get('m_LoopTime', 0)), 'tracks': tracks})
        return clips_out

    @staticmethod
    def material_prop(attr, node, mats):
        """A material property binding (Mecanim customType 22): the low 28 bits are crc32(property name), the top nibble
        the component — 4..7 = r/g/b/a (x/y/z/w), 8 = a float. Matched against the bound renderer's material."""
        mk = (node.get('mesh') or {}).get('mat') or ((node.get('ps') or {}).get('render') or {}).get('mat') \
            or (node.get('trailR') or {}).get('mat') or (node.get('lineR') or {}).get('mat')
        m = mats.get(mk) if mk else None
        if not m:
            return None
        low, comp = attr & 0x0fffffff, attr >> 28
        for n in list(m['floats'].keys()) + list(m['colors'].keys()):
            if crc32(n) & 0x0fffffff == low:
                return f'mat:{n}' + {4: '.r', 5: '.g', 6: '.b', 7: '.a'}.get(comp, '')
        # local patch: a texture's tiling / offset (_MainTex_ST: components 0..3 = tiling x, y, offset x, y) — scrolling lines
        for n in m['tex'].keys():
            if crc32(n + '_ST') & 0x0fffffff == low and comp <= 3:
                return f'mat:{n}_ST.' + 'xyzw'[comp]
        return None

    def back_only(self, bundle, pack=None):
        """2026-10-10: write only the SwitchableBackEffect `back` of the bundle's already extracted prefabs
        (switch_back), like mount_only. Returns (prefabs with one, files changed)."""
        rel = pack or f'battle/prefabs/effects/{bundle}.ab'
        p = bundle_path(self.game, rel)
        if not p:
            print(f'[fx] {bundle}: bundle not found, skipped')
            return 0, 0
        env = self.UnityPy.load(str(p))
        found = changed = 0
        for o in env.objects:
            if o.type.name != 'Transform':
                continue
            t = o.read_typetree()
            if t['m_Father']['m_PathID'] != 0:
                continue
            go = self.resolve(t['m_GameObject'], o)
            if go is None:
                continue
            f = OUT / bundle / f"{go.read_typetree()['m_Name']}.json"
            if not f.exists():
                continue
            back = self.switch_back(go)
            d = json.loads(f.read_text())
            found += back is not None
            if d.get('back') == back:
                continue
            if back is None:
                d.pop('back', None)
            else:
                d['back'] = back
            f.write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False))
            changed += 1
        print(f'[fx] {bundle}: {found} back-switch prefab(s), {changed} file(s) changed')
        return found, changed

    def mount_only(self, bundle, pack=None):
        """local patch (maintainer's decision 2026-10-08 「전체 적용」): write only the `mount` of the bundle's already
        extracted prefabs (mount_point), nothing else — a full re-extract would also bring every other extractor change
        since (built-in Quad meshes, decided for texas2 only). Returns (prefabs with a mount, files changed)."""
        rel = pack or f'battle/prefabs/effects/{bundle}.ab'
        p = bundle_path(self.game, rel)
        if not p:
            print(f'[fx] {bundle}: bundle not found, skipped')
            return 0, 0
        env = self.UnityPy.load(str(p))   # the root components only: no dependency bundles
        found = changed = 0
        for o in env.objects:
            if o.type.name != 'Transform':
                continue
            t = o.read_typetree()
            if t['m_Father']['m_PathID'] != 0:
                continue
            go = self.resolve(t['m_GameObject'], o)
            if go is None:
                continue
            f = OUT / bundle / f"{go.read_typetree()['m_Name']}.json"
            if not f.exists():
                continue
            mount = self.mount_point(go)
            d = json.loads(f.read_text())
            found += mount is not None
            if d.get('mount') == mount:
                continue
            if mount is None:
                d.pop('mount', None)
            else:
                d['mount'] = mount
            f.write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False))
            changed += 1
        print(f'[fx] {bundle}: {found} mount prefab(s), {changed} file(s) changed')
        return found, changed

    def run(self, bundle, prefabs=None, all_skins=False, match=None, list_only=False, pack=None):
        # pack: a shared battle pack instead (e.g. pkgrps/btl_pfb_fx_token_3.ab, the summons' effects), its roots written
        # as `bundle` — pick them with --match / --prefab
        rel = pack or f'battle/prefabs/effects/{bundle}.ab'
        env = self.load(rel)
        out = OUT
        main_file = None
        for f in env.files.values():
            # the first match: a dependency may share the name (battle/[pack]common.ab pulls in another [pack]common.ab)
            if main_file is None and str(getattr(f, 'name', '')).endswith(Path(rel).name):
                main_file = f
        roots = []
        for o in env.objects:
            if o.type.name != 'Transform':
                continue
            if main_file is not None and o.assets_file.parent is not main_file:
                continue
            t = o.read_typetree()
            if t['m_Father']['m_PathID'] == 0:
                go = self.resolve(t['m_GameObject'], o)
                if go is not None:
                    roots.append(go)
        written = []
        if not list_only:
            (out / bundle).mkdir(parents=True, exist_ok=True)
        for go in roots:
            name = go.read_typetree()['m_Name']
            if prefabs and name not in prefabs:
                continue
            if name in DISCARD:
                continue
            if not all_skins and VARIANT_RE.search(name):
                continue
            if match and not match.search(name):
                continue
            if list_only:
                written.append(name)
                continue
            data = self.prefab(go, out)
            (out / bundle / f'{name}.json').write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False))
            written.append(name)
        index_p = out / 'index.json'
        index = json.loads(index_p.read_text()) if index_p.exists() else {'bundles': {}}
        if list_only:
            print(f'[fx] {bundle}: ' + ' '.join(sorted(written)))
            return
        keep = set(index['bundles'].get(bundle, [])) | set(written)
        if not all_skins:
            keep = {n for n in keep if not VARIANT_RE.search(n)}
            for f in (out / bundle).glob('*.json'):
                if VARIANT_RE.search(f.stem):
                    f.unlink()
        index['bundles'][bundle] = sorted(keep)
        index_p.write_text(json.dumps(index, ensure_ascii=False, indent=1))
        print(f'[fx] {bundle}: {len(written)} prefab(s), {len(self.textures)} texture(s), {len(self.meshes)} mesh(es) -> {out}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--game', required=True, help='Arknights_Data folder (or a merged copy of its bundle folders)')
    ap.add_argument('--build-cab-index', metavar='OUT')
    ap.add_argument('--cab-index', metavar='JSON')
    ap.add_argument('--bundle', action='append', default=[], help='effect bundle name, e.g. chen3 (repeatable)')
    ap.add_argument('--prefab', action='append', default=[], help='only these prefabs')
    ap.add_argument('--all-skins', action='store_true', help='also skin / collab variants (default: the default skin only)')
    ap.add_argument('--match', metavar='REGEX', help='only prefabs whose name matches (e.g. "_skill_03_")')
    ap.add_argument('--list', action='store_true', help='print the prefab names of the bundles, extract nothing')
    ap.add_argument('--png', action='store_true', help='write PNG textures instead of WebP')
    ap.add_argument('--prune', action='store_true', help='delete textures / meshes no extracted effect references')
    ap.add_argument('--mount-only', action='store_true', help='only write the FollowMountPoint `mount` into the already '
                    'extracted prefabs of the bundles (every bundle of index.json without --bundle; local patch)')
    ap.add_argument('--back-only', action='store_true', help='only write the SwitchableBackEffect `back` into the already '
                    'extracted prefabs of the bundles (every bundle of index.json without --bundle; local patch 2026-10-10)')
    ap.add_argument('--pack', metavar='REL', help='read the prefabs from this bundle (relative to the bundle folders, e.g. '
                    'pkgrps/btl_pfb_fx_token_3.ab) and write them as --bundle (local patch: 望\'s 棋子 effects → wang_token)')
    a = ap.parse_args()
    if a.build_cab_index:
        build_cab_index(a.game, a.build_cab_index)
        return
    ex = Extractor(a.game, a.cab_index, png=a.png)
    if a.back_only:
        bundles = a.bundle or sorted(json.loads((OUT / 'index.json').read_text())['bundles'])
        tot = [ex.back_only(b, pack=a.pack) for b in bundles]
        print(f'[fx] back: {sum(x[0] for x in tot)} prefab(s) with a back switch, {sum(x[1] for x in tot)} file(s) changed')
        return
    if a.mount_only:
        bundles = a.bundle or sorted(json.loads((OUT / 'index.json').read_text())['bundles'])
        tot = [ex.mount_only(b, pack=a.pack) for b in bundles]
        print(f'[fx] mount: {sum(x[0] for x in tot)} prefab(s) with a mount, {sum(x[1] for x in tot)} file(s) changed')
        return
    for b in a.bundle:
        ex.run(b, set(a.prefab) or None, all_skins=a.all_skins, match=re.compile(a.match) if a.match else None, list_only=a.list, pack=a.pack)
    if a.prune:
        prune(OUT)


def prune(out):
    """Delete tex/*.png and mesh/*.json that no effect JSON under `out` references."""
    tex, mesh = set(), set()
    for f in out.glob('*/*.json'):
        d = json.loads(f.read_text())
        for m in d.get('materials', {}).values():
            for t in m.get('tex', {}).values():
                tex.add(t['img'])
        for n in d.get('nodes', []):
            for k in ((n.get('ps') or {}).get('render') or {}).get('mesh'), (n.get('mesh') or {}).get('mesh'):
                if k:
                    mesh.add(k + '.json')
    gone = 0
    for f in [*(out / 'tex').glob('*.png'), *(out / 'tex').glob('*.webp')]:
        if f.name not in tex:
            f.unlink(); gone += 1
    for f in (out / 'mesh').glob('*.json'):
        if f.name not in mesh:
            f.unlink(); gone += 1
    print(f'[fx] pruned {gone} unreferenced file(s)')


if __name__ == '__main__':
    main()
