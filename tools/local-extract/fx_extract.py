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
    python fx_extract.py … --coverage .cache/fx-coverage.json [--bundle chen3]   (what the pipeline leaves out, fx_coverage.py)
Default skin only unless --all-skins; --prune deletes textures / meshes no effect uses any more. Every extraction ends with
the parts of its prefabs the pipeline leaves out (fx_coverage.py): `NOT HANDLED` lines are new — look before trusting the effect.
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
from fx_coverage import Coverage  # noqa: E402

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
# 2026-10-11, decompile check round 2: the MonoScript PathID of Torappu.Fx.FxDelay (root_effect `fxDelay`; 38 of the roots of
# texas2 / dusk / siege2, a component of one float `_delayTime`)
FXDELAY_SCRIPT = 4526430437831129839
# 2026-10-11, decompile check: the MonoScript PathID of Torappu.Battle.Effects.ProjectileEffect (projectile_effect; the root
# of a projectile's `_mainEffect`: 202 of the extracted prefabs of the EN client, the same id in the CN client)
PROJECTILE_EFFECT_SCRIPT = 4524653206994915020
# 2026-10-16: the MonoScript PathID of Torappu.Fx.ParticleEffect (root_effect, which recognises it by its shape; fx_coverage
# checks that every root carrying one was recognised)
PARTICLE_EFFECT_SCRIPT = 6196809664641094801
# (2026-10-20) the MonoScript PathID of SwitchableRightEffect (right_effect; fx_coverage checks its raw fallback)
RIGHT_SCRIPT = 7347111497538980357
# (2026-10-16) Unity's built-in particle materials (an anonymous bundle, anon/*.bin): read as no material, as before the CAB
# index knew that bundle — nearly all sit on empty container systems (227 of 234); fx_coverage lists the 7 that emit
UNITY_DEFAULT_MATERIALS = {'Default-Particle', 'Default-ParticleSystem'}
# (2026-10-16) the `mount` keys and the FollowMountPoint fields they come from, in the field order
MOUNT_FIELDS = {'type': '_mountPointType', 'followScaleSign': '_followScaleSign', 'followScale': '_followScale',
                'pauseWhenInvalid': '_pauseWhenMountPointInvalid', 'onlyPauseWhenInvalid': '_onlyPauseWhenMountPointInvalid',
                'keepOriginRotation': '_keepOriginRotation', 'useBehaviourPause': '_useBehaviourPause'}
# (2026-10-16) the root_effect keys and the ParticleEffect fields they are raw-read from (fx_coverage cross-checks them
# against the type tree when it reads)
ROOT_EFFECT_FIELDS = {'delayToPlay': '_delayToPlay', 'delayToFinish': '_delayToFinish', 'randomDelay': '_randomPlayDelay',
                      'useSpeed': '_usePlaybackSpeed', 'limited': '_limitedPlaybackSpeed', 'rotate': '_rotateType',
                      'spawn': '_spawnLocation', 'leftIsDefault': '_leftIsDefault', 'body': '_useBodyRotation',
                      'mainDir': '_mainDir', 'overwrite': '_overwriteHeight', 'heightOffset': '_heightOffset'}
ROOT_EFFECT_FLOATS = {'delayToPlay', 'delayToFinish', 'limited', 'heightOffset'}


def r4(v):
    """Round floats for compact JSON."""
    if isinstance(v, float):
        if math.isinf(v) or math.isnan(v):
            return 0
        return round(v, 4)
    return v


def same_value(a, b):
    """(2026-10-20, check_readers) a raw read equals the type tree's: numbers within 1e-4, lists / tuples item by item."""
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(same_value(x, y) for x, y in zip(a, b))
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(float(a) - float(b)) <= 1e-4
    return a == b


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
                # (2026-10-16) also the anonymous bundles `anon/*.bin`: one holds the shared particle material of 130
                # effect bundles (CAB-9675…, 32 renderers of aglina alone) — without it those particles were dropped
                if not f.endswith(('.ab', '.bin')):
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
        # 2026-10-14: the sub emitters — the emitter's ParticleSystem is resolved to its node after the walk (sub_emitters);
        # type 0 Birth (all 397 of the extracted prefabs), properties = the inherit bits (1 colour, 2 size, 4 rotation, 8 lifetime)
        mods['sub'] = [{'emitter': e.get('emitter') or {}, 'type': e.get('type', 0), 'props': e.get('properties', 0),
                        'p': r4(e.get('emitProbability', 1))} for e in ps['SubModule'].get('subEmitters') or []]
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


def hermite_keys(keys, comp=None):
    """A legacy clip's AnimationCurve (Unity Keyframes: time, value, inSlope, outSlope; `comp` picks x / y / z / w of a vector
    or quaternion key) -> the clip keys of decode_clip: per segment the cubic of its Hermite span (a stepped key, an infinite
    slope, holds its value). Weighted keys are read unweighted [ASSUMED: none of the extracted prefabs has one]."""
    def val(k, f):
        v = k[f]
        return v[comp] if comp else v
    out = []
    for i, k in enumerate(keys):
        t, p0 = k['time'], val(k, 'value')
        if i + 1 == len(keys):
            out.append([r4(t), 0, 0, 0, r4(p0)])
            break
        n = keys[i + 1]
        dt, p1 = n['time'] - t, val(n, 'value')
        m0, m1 = val(k, 'outSlope'), val(n, 'inSlope')
        if dt <= 0 or not (math.isfinite(m0) and math.isfinite(m1)):
            out.append([r4(t), 0, 0, 0, r4(p0)])
            continue
        d = (p1 - p0) / dt
        out.append([r4(t), r4((m0 + m1 - 2 * d) / (dt * dt)), r4((3 * d - 2 * m0 - m1) / dt), r4(m0), r4(p0)])
    return out


def legacy_clip(clip, rel, wrap=0):
    """(2026-10-14) A legacy Animation clip (m_Legacy: Unity keeps its curves as keyframes, not a muscle clip) -> a clip like
    animator_clips': position / scale / quaternion / euler curves by their transform path, float curves by attribute —
    `material.<prop>[.<r|g|b|a|x|y|z|w>]` → `mat:` (the renderer's material), `m_IsActive` → the GameObject switch (type 1, as the
    Mecanim binding), any other attribute kept as `attr:<crc32>`. `rel` maps a path relative to the Animation's GameObject to
    a node — a path that is not under it binds nothing, as in Unity (sbell2_skill_03_range's `spin` names its siblings: no
    clip). The length is every curve's last key (a legacy clip's m_MuscleClip is unused); wrap 2 (Loop) repeats — the clip's
    own m_WrapMode, or with 0 (Default) the Animation's `wrap`. Once / ClampForever hold the last key, like a Mecanim clip
    [ASSUMED for Once: Unity stops the clip there]."""
    tracks, length = [], 0.0
    for field, prop, comps in (('m_PositionCurves', 'pos', 'xyz'), ('m_ScaleCurves', 'scale', 'xyz'),
                               ('m_RotationCurves', 'quat', 'xyzw'), ('m_EulerCurves', 'euler', 'xyz')):
        for cv in clip.get(field) or []:
            keys = (cv.get('curve') or {}).get('m_Curve') or []
            length = max([length] + [k['time'] for k in keys[-1:]])
            node = rel.get(cv.get('path') or '')
            if not keys or node is None:
                continue
            tracks.append({'node': node, 'prop': prop, 'type': 4, 'curves': [hermite_keys(keys, c) for c in comps]})
    for cv in clip.get('m_FloatCurves') or []:
        keys = (cv.get('curve') or {}).get('m_Curve') or []
        length = max([length] + [k['time'] for k in keys[-1:]])
        node = rel.get(cv.get('path') or '')
        attr = cv.get('attribute') or ''
        if not keys or node is None:
            continue
        if attr.startswith('material.'):
            prop = 'mat:' + attr[9:]
        else:
            prop = f'attr:{crc32(attr)}'
        tracks.append({'node': node, 'prop': prop, 'type': cv.get('classID', 0), 'curves': [hermite_keys(keys)]})
    if clip.get('m_CompressedRotationCurves'):
        print(f"[fx] legacy clip {clip['m_Name']}: compressed rotation curves skipped")
    if not tracks:
        return None
    return {'name': clip['m_Name'], 'len': r4(length), 'loop': (clip.get('m_WrapMode') or wrap) == 2, 'legacy': 1,
            'tracks': tracks}


def crc32(s):
    return zlib.crc32(s.encode('utf-8')) & 0xffffffff


def emits(ps):
    """(2026-10-16) whether a ParticleSystem type tree emits anything by itself: emission on with a rate or a burst."""
    em = ps.get('EmissionModule') or {}
    if not em.get('enabled'):
        return False
    rate = (em.get('rateOverTime') or {})
    return bool(rate.get('scalar')) or any(((b.get('countCurve') or {}).get('scalar') or 0) > 0
                                           for b in (em.get('m_Bursts') or [])[:em.get('m_BurstCount', 0)])


def json_diff(a, b, path='', out=None, limit=20):
    """(2026-10-16, fx_coverage) the paths where two JSON values differ, list indices written `[]` (`nodes[].mesh`): a key
    only one side has, or a different value; at most `limit`."""
    out = set() if out is None else out
    if len(out) >= limit:
        return out
    if isinstance(a, dict) and isinstance(b, dict):
        for k in set(a) | set(b):
            p = f'{path}.{k}' if path else k
            if k not in a or k not in b:
                out.add(p + (' (new)' if k not in a else ' (gone)'))
            else:
                json_diff(a[k], b[k], p, out, limit)
    elif isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        for x, y in zip(a, b):
            json_diff(x, y, path + '[]', out, limit)
    elif a != b and not (isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) <= 1e-4):
        out.add(path or '(root)')
    return out


def type_paths(d, prefix=''):
    """The dotted paths of a type tree's nested fields (lists not entered) — the names a Mecanim binding's crc32 is of."""
    for k, v in d.items():
        p = f'{prefix}{k}'
        yield p
        if isinstance(v, dict):
            yield from type_paths(v, p + '.')


def sub_emitters(nodes, pss):
    """(2026-10-14) Each extracted system's `mods.sub` emitters → { node, type, props, p }: `pss` maps a ParticleSystem path id
    to its node. An emitter outside the prefab or a node drawing nothing (no `ps`) is dropped, an empty list with it."""
    for n in nodes:
        mods = (n.get('ps') or {}).get('mods') or {}
        if not isinstance(mods.get('sub'), list):
            continue
        out = []
        for e in mods['sub']:
            em = e.pop('emitter', None) or {}
            k = pss.get(em.get('m_PathID')) if not em.get('m_FileID') else None
            if k is not None and nodes[k].get('ps'):
                out.append({'node': k, **e})
        if out:
            mods['sub'] = out
        else:
            mods.pop('sub')   # no emitter set (67 of the 145 prefabs with the module on): Unity emits nothing


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
        # 2026-10-16: what the run meets and the pipeline leaves out (fx_coverage.py; the dump names unknown scripts)
        self.cov = Coverage(dump=ROOT / '.cache' / 'il2cpp' / 'dump.cs')
        self.shader_props = {}   # shader path id -> [(name, type, defaults)] (Coverage.material)
        self.dry = False         # --coverage: no texture / mesh file written

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
                        if rel and not (self.game / rel).exists():
                            # 2026-10-16: a client update moves bundles (PersistentData → StreamingAssets): an old index
                            # loses their textures without a word — fx_coverage `dependency`
                            self.cov.dependency(f'{cab} → {rel}: the file is gone (rebuild the index: --build-cab-index)', bundle_rel)
                            continue
                        if not rel and cab.upper().startswith('CAB-'):
                            self.cov.dependency(f'{cab}: not in the CAB index (rebuild it: --build-cab-index)', bundle_rel)
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
        if not p.exists() and not self.dry:
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

    def mesh(self, obj, out, skin=False):
        """A mesh file; `skin` (2026-10-14, a SkinnedMeshRenderer's mesh — its own key `…_skin`) adds per vertex 4 bone
        indices `bi` and weights `bw` (a mesh with an index channel only weighs 1 on its first bone) and per bone its bind
        pose `bind` (16 numbers, column-major)."""
        key = f'{obj.read().m_Name}_{obj.path_id & 0xffffffff:08x}' + ('_skin' if skin else '')
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
        if skin:
            bi, bw = [], []
            inds, wts = h.m_BoneIndices or [], h.m_BoneWeights or []
            for v in range(len(pos) // 3):
                ii = list(inds[v]) if v < len(inds) else [0]
                ww = list(wts[v]) if v < len(wts) else [1.0]
                bi += (ii + [0, 0, 0, 0])[:4]
                bw += [r4(float(x)) for x in (ww + [0, 0, 0, 0])[:4]]
            bind = []
            for b in obj.read_typetree().get('m_BindPose') or []:
                bind.append([r4(b[f'e{r}{c}']) for c in range(4) for r in range(4)])
            data.update(bi=bi, bw=bw, bind=bind)
        p = out / 'mesh' / (key + '.json')
        p.parent.mkdir(parents=True, exist_ok=True)
        if not p.exists() and not self.dry:   # 2026-10-10: the same key is the same mesh — a shared file is never rewritten
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
        self.cov.material(shader, self.declared_props(sh),
                          {n for n, te in pairs(props['m_TexEnvs']) if (te.get('m_Texture') or {}).get('m_PathID')},
                          {**floats, **colors})
        mats[key] = {'shader': shader, 'tex': tex, 'floats': floats, 'colors': colors,
                     'queue': d.get('m_CustomRenderQueue', -1), 'keywords': d.get('m_ValidKeywords') or d.get('m_ShaderKeywords')}
        return key

    def declared_props(self, sh):
        """(2026-10-16, fx_coverage) a shader's declared properties [(name, type, [4 defaults])], cached by shader; [] when
        its type tree does not read."""
        if sh is None:
            return []
        if sh.path_id not in self.shader_props:
            try:
                ps = sh.read_typetree()['m_ParsedForm']['m_PropInfo']['m_Props']
                self.shader_props[sh.path_id] = [(p['m_Name'], p['m_Type'], [p.get(f'm_DefValue[{i}]', 0) for i in range(4)]) for p in ps]
            except Exception:
                self.shader_props[sh.path_id] = []
        return self.shader_props[sh.path_id]

    def note_components(self, go, d):
        """(2026-10-16, fx_coverage) every component of the GameObject `go` (type tree `d`) to the coverage report; the
        MonoScript PathIDs of its MonoBehaviours (a set)."""
        sids = set()
        for c in d['m_Component']:
            comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], go)
            if comp is None:
                continue
            self.cov.component(comp.type.name)
            if comp.type.name != 'MonoBehaviour':
                continue
            raw = comp.get_raw_data()
            if len(raw) < 28:
                continue
            sid = struct.unpack_from('<q', raw, 20)[0]
            sids.add(sid)
            try:
                fields = [k for k in comp.read_typetree() if not k.startswith('m_')]
            except Exception:
                fields = None
            self.cov.script(sid, fields)
        return sids

    def prefab(self, root, out):
        nodes, mats, paths = [], {}, {}
        self.gobjs = {}   # node index -> GameObject (clip bindings named by their component, fx_coverage)
        animators = []
        skinned = []
        pss = {}   # ParticleSystem path id -> node (sub emitters)

        gos = {}

        def walk(go, parent, path):
            d = go.read_typetree()
            node = {'name': d['m_Name'], 'parent': parent, 'active': bool(d.get('m_IsActive', 1))}
            idx = len(nodes)
            nodes.append(node)
            paths[idx] = path
            gos[go.path_id] = idx
            self.gobjs[idx] = go
            self.note_components(go, d)
            self.check_readers(go, parent < 0)
            if parent >= 0:
                dl = self.fx_delay(go)
                if dl:
                    node['delay'] = dl
            uvt = self.uv_tween(go)
            if uvt:
                node['uvt'] = uvt
            uvr = self.uv_rotation(go)
            if uvr:
                node['uvr'] = uvr
            tr = None
            for c in d['m_Component']:
                comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], go)
                if comp is None:
                    continue
                t = comp.type.name
                if t == 'Transform':
                    tr = comp.read_typetree()
                    gos[comp.path_id] = idx
                    node['pos'] = vec3(tr['m_LocalPosition'])
                    q = tr['m_LocalRotation']
                    node['rot'] = [r4(q['x']), r4(q['y']), r4(q['z']), r4(q['w'])]
                    node['scale'] = vec3(tr['m_LocalScale'])
                elif t == 'ParticleSystem':
                    node['_ps'] = comp
                    pss[comp.path_id] = idx
                elif t == 'ParticleSystemRenderer':
                    node['_psr'] = comp
                elif t == 'MeshRenderer':
                    node['_mr'] = comp
                elif t == 'MeshFilter':
                    node['_mf'] = comp
                elif t == 'Animator':
                    animators.append((idx, comp))
                elif t == 'Animation':
                    animators.append((idx, comp))   # legacy (animator_clips → legacy_clips)
                elif t == 'SkinnedMeshRenderer':
                    skinned.append((idx, comp))     # its bones are resolved once the whole tree is walked (skin)
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
                        if m is not None and m.read_typetree()['m_Name'] in UNITY_DEFAULT_MATERIALS:
                            if psr_t.get('m_Enabled', 1) and emits(node['_ps'].read_typetree()):
                                self.cov.add('material', "Unity's default particle material on an emitting system")
                            m = None
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
                        self.cov.particle(ps_t)
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
        for idx, smr in skinned:
            sk = self.skin(smr, gos, out, mats)
            if sk:
                nodes[idx]['skin'] = sk
        sub_emitters(nodes, pss)
        for k, t in self.sub_delays(root, gos).items():
            nodes[k]['sdelay'] = t
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
        height = self.overwrite_height(root)
        if height is not None:
            out_def['height'] = height
        face = self.root_face(self.root_effect(root))
        if face:
            out_def['face'] = face
        finish = self.delay_to_finish(root)
        if finish:
            out_def['finish'] = finish
        off = self.off_on_finish(root, gos)
        if off:
            out_def['offFinish'] = off
        right = self.right_effect(root)
        if right:
            out_def['right'] = right
        back = self.switch_back(root)
        if back:
            out_def['back'] = back
        line = self.line_dynamic(root)
        if line:
            out_def['lineDyn'] = line
        return out_def

    def monos(self, go):
        """(2026-10-20) the GameObject's MonoBehaviours as (MonoScript PathID or None, raw bytes, type tree or None when it
        does not read) — the readers below take a component's field names first and its raw words only without them."""
        try:
            d = go.read_typetree()
        except Exception:
            return []
        out = []
        for c in d['m_Component']:
            comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], go)
            if comp is None or comp.type.name != 'MonoBehaviour':
                continue
            raw = comp.get_raw_data()
            try:
                t = comp.read_typetree()
            except Exception:
                t = None
            out.append((struct.unpack_from('<q', raw, 20)[0] if len(raw) >= 28 else None, raw, t))
        return out

    def check_readers(self, go, root):
        """(2026-10-16, fx_coverage; 2026-10-20 field names first) the components with a raw-word fallback, on the root
        (`root`) or, FxDelay only, on a child: without a type tree the raw words are read unchecked, which the report says;
        with one the fallback must still recognise the layout and agree with it field by field — a client update that adds
        a field shifts the words (FollowMountPoint, 2026-10-14), and this shows it before the day the fallback is needed."""
        readers = {FXDELAY_SCRIPT: ('FxDelay', self.fx_delay_tree, self.fx_delay_raw)}
        if root:
            readers.update({PARTICLE_EFFECT_SCRIPT: ('ParticleEffect', self.root_effect_tree, self.root_effect_raw),
                            PROJECTILE_EFFECT_SCRIPT: ('ProjectileEffect', self.projectile_tree, self.projectile_raw),
                            RIGHT_SCRIPT: ('SwitchableRightEffect', self.right_tree, self.right_raw),
                            MOUNT_SCRIPT: ('FollowMountPoint', self.mount_tree, self.mount_raw)})
        for sid, raw, t in self.monos(go):
            if sid not in readers:
                continue
            name, from_tree, from_raw = readers[sid]
            r = from_raw(raw)
            if t is None:
                self.cov.reader(name, False, 'no type tree: read by raw words, unchecked' if r is not None else None)
                continue
            v = from_tree(t)
            if v is None:
                self.cov.reader(name, False, 'the type tree lacks the fields read')
            elif r is None:
                self.cov.reader(name, False, 'raw fallback: layout not recognised')
            else:
                off = [k for k in v if not same_value(v[k], r.get(k))] if isinstance(v, dict) else ([] if same_value(v, r) else ['value'])
                self.cov.reader(name, not off, f"raw fallback ≠ type tree: {', '.join(off)}" if off else None)

    def line_dynamic(self, root):
        """2026-10-10, decompile check — client `LineEffectEmitterDynamic` (`Update` RVA 0xCA0600 → `_UpdateMountPoint`
        0xCA26C0, `_TryUpdateEffects` 0xCA1830): every frame each LineRenderer of the effect gets position 0 = its start
        owner's `_startMountPointType` point + `_startPosOffset` and position 1 = its end owner's `_endMountPointType` point +
        `_endPosOffset` (`_tweenEndPosition`: lerped from the start over `_tweenDuration`), and `_startEffect` / `_endEffect`
        follow those two ends; the owners come from the node that made it (`Nodes.CreateLineEffect.Execute` 0xB91190: start =
        its source, end = its target). Read by the root component's type tree: { sMount, eMount, start?, end?, mid?, sOff?,
        eOff?, tween?, finishBuff? } (Entity.MountPointType numbers), None without one."""
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
            except Exception:
                continue
            if '_startMountPointType' not in t or '_endMountPointType' not in t:
                continue
            out = {'sMount': int(t['_startMountPointType']), 'eMount': int(t['_endMountPointType'])}
            for k, name in (('_startEffect', 'start'), ('_endEffect', 'end'), ('_midEffect', 'mid')):
                if isinstance(t.get(k), str) and t[k]:
                    out[name] = t[k]
            for k, name in (('_startPosOffset', 'sOff'), ('_endPosOffset', 'eOff')):
                v = t.get(k) or {}
                if any(abs(float(v.get(a, 0) or 0)) > 1e-6 for a in 'xyz'):
                    out[name] = [r4(v.get('x', 0)), r4(v.get('y', 0)), r4(v.get('z', 0))]
            if t.get('_tweenEndPosition'):
                out['tween'] = r4(t.get('_tweenDuration') or 0)
            if t.get('_finishIfBuffNotExists') and isinstance(t.get('_buffKeyForFinish'), str) and t['_buffKeyForFinish']:
                out['finishBuff'] = t['_buffKeyForFinish']
            return out
        return None

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
        (chen3 S3 buff_L / buff_R, mlynar, texas2, tippi: 15 pairs). Read by its type tree (right_tree), else raw
        (right_raw). None when the root has no such component."""
        for _sid, raw, t in self.monos(root):
            v = self.right_tree(t) if t is not None else self.right_raw(raw)
            if v is not None:
                return v['effect'] or None
        return None

    @staticmethod
    def right_tree(t):
        """right_effect by its field names: { effect: `_rightEffect` }, None without the field."""
        return {'effect': t['_rightEffect']} if isinstance(t.get('_rightEffect'), str) else None

    @staticmethod
    def right_raw(raw):
        """right_effect's raw fallback: header, empty name, one string, then `_onlyCheckOnPlay`, `_reverseLeftRight` (the
        EN client since its 2026-10-14 update) and `_reactivationMode` (the CN client) — one to three ints (2026-10-20: the
        one-int layout alone matched neither client any more, check_readers); { effect } or None."""
        off = 12 + 4 + 12
        if len(raw) > 200 or len(raw) < off + 12 or struct.unpack_from('<i', raw, off)[0] != 0:
            return None
        off += 4
        n = struct.unpack_from('<i', raw, off)[0]
        end = (off + 4 + n + 3) & ~3
        if not 0 < n <= 128 or len(raw) - end not in (4, 8, 12):
            return None
        s = raw[off + 4:off + 4 + n].decode('utf-8', 'replace')
        return {'effect': s} if re.fullmatch(r'[\w#.\-]+', s) else None

    def root_effect(self, root):
        """The fields of the root's effect component (the client's ParticleEffect, `Torappu.Fx`) and of its FxDelay, or None
        without an effect component: { delayToPlay, delayToFinish, randomDelay, useSpeed, limited, rotate, spawn,
        leftIsDefault, body, mainDir, overwrite, heightOffset (ROOT_EFFECT_FIELDS), subs: [(m_FileID, m_PathID, delayTime)]
        (`_subFXDelayConfigs`), fxDelay }. (2026-10-20) Read by its field names (root_effect_tree) when its type tree reads —
        the EN client's has, since the 2026-10-16 extraction; the raw words (root_effect_raw) are the fallback for a
        component whose type tree does not read, and check_readers says when it was used. FxDelay (`Torappu.Fx.FxDelay`, one
        float `_delayTime`: the GameObject starts `_delayTime` ÷ the playback speed later — `FxDelay.OnEnable`, RVA
        0x34C1650) by its MonoScript (FXDELAY_SCRIPT)."""
        pe, delay = None, None
        for sid, raw, t in self.monos(root):
            if sid == FXDELAY_SCRIPT:
                v = self.fx_delay_tree(t) if t is not None else self.fx_delay_raw(raw)
                if v is not None:
                    delay = v['delay']
                    continue
            if pe is None:
                pe = self.root_effect_tree(t) if t is not None else self.root_effect_raw(raw)
        if pe is None:
            return None
        pe['fxDelay'] = delay
        return pe

    @staticmethod
    def root_effect_tree(t):
        """root_effect by the ParticleEffect field names, None when the type tree lacks one of them."""
        if not all(f in t for f in ROOT_EFFECT_FIELDS.values()):
            return None
        pe = {k: float(t[f] or 0) if k in ROOT_EFFECT_FLOATS else int(t[f] or 0) for k, f in ROOT_EFFECT_FIELDS.items()}
        pe['subs'] = [(int(e['transform'].get('m_FileID') or 0), int(e['transform'].get('m_PathID') or 0), float(e.get('delayTime') or 0))
                      for e in t.get('_subFXDelayConfigs') or []]
        return pe

    @staticmethod
    def root_effect_raw(raw):
        """root_effect's raw fallback (the ParticleEffect's script type tree was not in the bundles until the 2026-10-14 client
        update). After the MonoBehaviour header and name: ints #0–#2, #3 = the length n of `_subFXDelayConfigs` (4 ints an
        entry), then from s = 4 + 4n the fields in the order of the client's dump — s `_delayToPlay`, s+1 `_delayToFinish`,
        s+2 `_maxLifetime`, s+3 `_randomPlayDelay`, s+4 `_autoReuse`, s+5 `_usePlaybackSpeed`, s+6 `_limitedPlaybackSpeed`,
        s+8 `_rotateType`, s+9 `_spawnLocation`, s+10 `_leftIsDefault`, s+11 `_useBodyRotation`, s+12 `_mainDir`, s+13
        `_holdByOwner`, s+14 `_overwriteHeight`, s+15 `_heightOffset`. (2026-10-11, decompile check round 2: the component
        used to be recognised by `_limitedPlaybackSpeed` == 2.0 — 51 bound prefabs with another limit (−1, 4, 0: 텍사스 디
        오메르토사 S2 texas2_skill_02_start) lost their `spawn`, and a non-empty `_subFXDelayConfigs` shifted every field.)
        Recognised by its shape: n ≤ 64, `_maxLifetime` −1 or in (0, 100), the bools 0 / 1, `_rotateType` ≤ 8,
        `_spawnLocation` < 64. Two layouts (2026-10-11): the EN client's has 28 words from s; the CN client's (newer) 30 —
        one int before `_rotateType` (s+8) and one at the end, both 0 in every component compared, so `_rotateType` and
        everything after it sit one word later (checked on the same prefabs of both clients: 158 components of texas2 /
        etlchi / chen3 / swire, every field equal under this mapping). Without it a CN prefab read `_spawnLocation` from
        `_rotateType`. None when the shape does not match."""
        if len(raw) < 32:
            return None
        n = struct.unpack_from('<i', raw, 28)[0]
        if not 0 <= n <= 256:
            return None
        b = raw[(32 + n + 3) & ~3:]
        if len(b) < 24 * 4:
            return None
        i = lambda k: struct.unpack_from('<i', b, 4 * k)[0]  # noqa: E731
        f = lambda k: struct.unpack_from('<f', b, 4 * k)[0]  # noqa: E731
        subs = i(3)
        if not 0 <= subs <= 64:
            return None
        s = 4 + 4 * subs
        if len(b) < (s + 16) * 4:
            return None
        x = 1 if len(b) // 4 - s == 30 else 0   # the CN layout: one more word before `_rotateType`
        life = f(s + 2)
        if life != -1.0 and not 0 < life < 100:
            return None
        if not (0 <= i(s + 8 + x) <= 8 and 0 <= i(s + 9 + x) < 64 and i(s + 3) in (0, 1) and i(s + 5) in (0, 1) and i(s + 14 + x) in (0, 1)):
            return None
        return {'delayToPlay': f(s), 'delayToFinish': f(s + 1), 'randomDelay': i(s + 3), 'useSpeed': i(s + 5), 'limited': f(s + 6), 'rotate': i(s + 8 + x),
                'spawn': i(s + 9 + x), 'leftIsDefault': i(s + 10 + x), 'body': i(s + 11 + x), 'mainDir': i(s + 12 + x), 'overwrite': i(s + 14 + x),
                'heightOffset': f(s + 15 + x),
                # `_subFXDelayConfigs` (2026-10-11): { GameObject PPtr (m_FileID int, m_PathID int64), delayTime float } each
                'subs': [(i(4 + 4 * k), struct.unpack_from('<q', b, 4 * (5 + 4 * k))[0], f(7 + 4 * k)) for k in range(subs)]}

    def fx_delay(self, go):
        """(2026-10-11, maintainer decision 16) the `_delayTime` of a FxDelay component on this GameObject (MonoScript
        FXDELAY_SCRIPT; `FxDelay.OnEnable` RVA 0x34C1650 hides the GameObject and shows it `_delayTime` ÷ its playback speed
        later — a child's own FxDelay keeps the default speed 1.0 [추정: only the root's is set by `Effect.UpdatePlaybackSpeed`
        0xC8AE50]), rounded; None without one or ≤ 0. 텍사스 디 오메르토사 S2 texas2_birth_02_start: its four slashes 0 / 0.1 / 0.15 / 0.3.
        (2026-10-20) By its field name, the raw word without a type tree."""
        for sid, raw, t in self.monos(go):
            if sid != FXDELAY_SCRIPT:
                continue
            v = self.fx_delay_tree(t) if t is not None else self.fx_delay_raw(raw)
            if v is not None:
                return r4(v['delay']) if v['delay'] > 0 else None
        return None

    @staticmethod
    def fx_delay_tree(t):
        """fx_delay by its field name: { delay: `_delayTime` }, None without it."""
        return {'delay': float(t['_delayTime'] or 0)} if '_delayTime' in t else None

    @staticmethod
    def fx_delay_raw(raw):
        """fx_delay's raw fallback: the one float after the MonoBehaviour header and name; { delay } or None."""
        if len(raw) < 32:
            return None
        n = struct.unpack_from('<i', raw, 28)[0]
        b = raw[(32 + n + 3) & ~3:] if 0 <= n <= 256 else b''
        return {'delay': struct.unpack_from('<f', b, 0)[0]} if len(b) == 4 else None

    def sub_delays(self, root, gos):
        """(2026-10-11) the root effect's `_subFXDelayConfigs` as { node index: delayTime } (`gos`: GameObject / Transform
        PathID → node index): `Effect._DelayToActiveGameObject` hides that GameObject and shows it `delayTime` ÷ the playback
        speed later (`Effect.UpdatePlaybackSpeed` RVA 0xC8AE50 sets `delayRuntime`). 티티 S3 titi_skill_03_hit_02, 왕 wang_birth_01 / _02."""
        pe = self.root_effect(root)
        out = {}
        for _fid, pid, t in (pe or {}).get('subs') or []:
            if pid in gos and t > 0 and gos[pid] > 0:
                out[gos[pid]] = r4(t)
        return out

    def delay_only(self, bundle, pack=None):
        """2026-10-11: write only the branch delays — node `delay` (a child's FxDelay) and `sdelay` (the root's
        `_subFXDelayConfigs`) — into the bundle's already extracted prefabs (the nodes in the extractor's own walk order;
        a file whose node names do not line up is left alone). Returns (prefabs with a branch delay, files changed)."""
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
            order, gos = [], {}

            def walk(g, parent):
                dd = g.read_typetree()
                idx = len(order)
                gos[g.path_id] = idx
                order.append((dd['m_Name'], self.fx_delay(g) if parent >= 0 else None))
                tr = None
                for c in dd['m_Component']:
                    comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], g)
                    if comp is not None and comp.type.name == 'Transform':
                        tr = comp.read_typetree()
                        gos[comp.path_id] = idx
                for ch in (tr or {}).get('m_Children') or []:
                    cto = self.resolve(ch, g)
                    cgo = self.resolve(cto.read_typetree()['m_GameObject'], cto) if cto is not None else None
                    if cgo is not None:
                        walk(cgo, idx)
            walk(go, -1)
            subs = self.sub_delays(go, gos)
            d = json.loads(f.read_text())
            nodes = d.get('nodes') or []
            if len(nodes) != len(order) or any(n.get('name') != order[k][0] for k, n in enumerate(nodes)):
                print(f'[fx] {bundle}/{f.stem}: node tree differs from the bundle, skipped')
                continue
            dirty = False
            for k, n in enumerate(nodes):
                want = {'delay': order[k][1], 'sdelay': subs.get(k)}
                for key, v in want.items():
                    if n.get(key) == v:
                        continue
                    dirty = True
                    if v is None:
                        n.pop(key, None)
                    else:
                        n[key] = v
            found += any(x[1] for x in order) or bool(subs)
            if dirty:
                f.write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False))
                changed += 1
        print(f'[fx] {bundle}: {found} prefab(s) with a branch delay, {changed} file(s) changed')
        return found, changed

    def uv_tween(self, go):
        """2026-10-14, decompile check — the GameObject's Torappu.Fx.FxUVTweener / FxUVTweenerAdvance (`Update` RVA
        0x34C5F90 / 0x34C5780): every frame its renderer's material moves the offset of `_MainTex` (xspeed, yspeed), of
        `secondMapName` (secondXSpeed, secondYSpeed; `useSecondMap`) and, for Advance, of each enabled `extraMapSettings`
        texture (XSpeed, YSpeed) by 2 × speed × dt (SPEED_SCALE 2; a texture with both speeds 0 is not touched); `OnEnable`
        starts the offsets from the material's own with `keepInitOffset`, else from 0; an Advance without `tweenRepeat` stops
        after `tweenAnmTime` s. Read by the component's type tree (found by its fields, not its script id): { maps:
        [[texture, 2·sx, 2·sy], …], keep?, until? }, None without one. Drawn by render/fxplayer.js uvTween."""
        try:
            d = go.read_typetree()
        except Exception:
            return None
        for c in d['m_Component']:
            comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], go)
            if comp is None or comp.type.name != 'MonoBehaviour':
                continue
            try:
                t = comp.read_typetree()
            except Exception:
                continue
            if 'xspeed' not in t or 'secondMapName' not in t:
                continue
            maps = [('_MainTex', t.get('xspeed'), t.get('yspeed'))]
            if t.get('useSecondMap') and isinstance(t.get('secondMapName'), str) and t['secondMapName']:
                maps.append((t['secondMapName'], t.get('secondXSpeed'), t.get('secondYSpeed')))
            for e in t.get('extraMapSettings') or []:
                if e.get('enabled') and isinstance(e.get('mapName'), str) and e['mapName']:
                    maps.append((e['mapName'], e.get('XSpeed'), e.get('YSpeed')))
            maps = [[n, r4(2 * float(x or 0)), r4(2 * float(y or 0))] for n, x, y in maps if float(x or 0) or float(y or 0)]
            if not maps:
                return None
            out = {'maps': maps}
            if t.get('keepInitOffset'):
                out['keep'] = 1
            if 'tweenRepeat' in t and not t.get('tweenRepeat'):
                out['until'] = r4(float(t.get('tweenAnmTime') or 0))
            return out
        return None

    def uv_rotation(self, go):
        """(2026-10-14, decompile check) the GameObject's Torappu.Fx.FxUVRotation: `_Initialize` (RVA 0x34C4C70) enables the
        material keyword _HG_UV_ROTATION and sets `<_propertyName>0..3` to the identity (1, 0, 0, 1) (the class's static,
        `.cctor` 0x34C4EE0); `Update` (0x34C4870) sets each enabled one (`_rotateTex1..4`) to `_CalculateMatrix` (0x34C4B80)
        of its angle (`angle1`, `_angle2..4`, degrees × 0.0174533): (f₂, −f₁, f₁, f₂) of two unnamed CRT calls — (cos, −sin, sin,
        cos) [ASSUMED: identity at angle 0]. → `uvr` [4 angles, degrees; 0 for a disabled one], None without one or with all
        disabled. Every component (154 in 62 prefabs) names `_Rotation`. Drawn by render/fxplayer.js (uRot0..3)."""
        try:
            d = go.read_typetree()
        except Exception:
            return None
        for c in d['m_Component']:
            comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], go)
            if comp is None or comp.type.name != 'MonoBehaviour':
                continue
            try:
                t = comp.read_typetree()
            except Exception:
                continue
            if '_rotateTex1' not in t or '_propertyName' not in t:
                continue
            if t.get('_propertyName') != '_Rotation':
                print(f"[fx] FxUVRotation {d['m_Name']}: property {t.get('_propertyName')!r} skipped")
                return None
            ang = [r4(float(t.get(a) or 0)) if t.get(f'_rotateTex{k + 1}') else 0
                   for k, a in enumerate(('angle1', '_angle2', '_angle3', '_angle4'))]
            return ang if any(ang) else None
        return None

    def uvt_only(self, bundle, pack=None):
        """2026-10-14: write only the nodes' `uvt` (uv_tween) and `uvr` (uv_rotation) into the bundle's already extracted prefabs (the nodes in the
        extractor's own walk order, like delay_only; a file whose node names do not line up is left alone). Returns
        (prefabs with one, files changed)."""
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
            order = []

            def walk(g):
                dd = g.read_typetree()
                order.append((dd['m_Name'], self.uv_tween(g), self.uv_rotation(g)))
                tr = None
                for c in dd['m_Component']:
                    comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], g)
                    if comp is not None and comp.type.name == 'Transform':
                        tr = comp.read_typetree()
                for ch in (tr or {}).get('m_Children') or []:
                    cto = self.resolve(ch, g)
                    cgo = self.resolve(cto.read_typetree()['m_GameObject'], cto) if cto is not None else None
                    if cgo is not None:
                        walk(cgo)
            walk(go)
            d = json.loads(f.read_text())
            nodes = d.get('nodes') or []
            if len(nodes) != len(order) or any(n.get('name') != order[k][0] for k, n in enumerate(nodes)):
                print(f'[fx] {bundle}/{f.stem}: node tree differs from the bundle, uvt skipped')
                continue
            dirty = False
            for k, n in enumerate(nodes):
                for key, v in (('uvt', order[k][1]), ('uvr', order[k][2])):   # 2026-10-14: and FxUVRotation's `uvr`
                    if n.get(key) == v:
                        continue
                    dirty = True
                    if v is None:
                        n.pop(key, None)
                    else:
                        n[key] = v
            found += any(x[1] or x[2] for x in order)
            if dirty:
                f.write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False))
                changed += 1
        print(f'[fx] {bundle}: {found} prefab(s) with a uv tween, {changed} file(s) changed')
        return found, changed

    def skin(self, smr, gos, out, mats):
        """(2026-10-14) A SkinnedMeshRenderer: { mesh (with its bones' bind poses — mesh(skin=True)), mat, order, bones (node
        indices, in the mesh's bone order) }; Unity draws it from its bones' world transforms (the node's own transform is not
        used). None when it is off, has no material or names a bone outside the tree. 9 extracted prefabs (水月 S2, 歌蕾蒂娅 S2,
        斯卡蒂 S3, 浊心斯卡蒂 S3, 铃兰 S3, 星熊 S3), their bones turned by legacy clips."""
        s = smr.read_typetree()
        if not s.get('m_Enabled', 1) or not s.get('m_Materials'):
            return None
        mo = self.mesh_ref(s.get('m_Mesh'), smr)
        mat = self.resolve(s['m_Materials'][0], smr)
        bones = [gos.get(b['m_PathID']) if not b.get('m_FileID') else None for b in s.get('m_Bones') or []]
        if mo is None or mat is None or not bones or any(b is None for b in bones):
            return None
        mk = self.mesh(mo, out, skin=True)
        if mk is None:
            return None
        return {'mesh': mk, 'mat': self.material(mat, out, mats), 'order': s.get('m_SortingOrder', 0), 'bones': bones}

    def skin_only(self, bundle, pack=None):
        """2026-10-14: write only the nodes' `skin` (skin: SkinnedMeshRenderers, their meshes, materials and textures) into the
        bundle's already extracted prefabs (walk order checked like uvt_only). Returns (prefabs with one, files changed)."""
        rel = pack or f'battle/prefabs/effects/{bundle}.ab'
        if not bundle_path(self.game, rel):
            print(f'[fx] {bundle}: bundle not found, skipped')
            return 0, 0
        env = self.load(rel)
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
            names, gos, smrs = [], {}, []

            def walk(g):
                dd = g.read_typetree()
                idx = len(names)
                names.append(dd['m_Name'])
                tr = None
                for c in dd['m_Component']:
                    comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], g)
                    if comp is None:
                        continue
                    if comp.type.name == 'Transform':
                        tr = comp.read_typetree()
                        gos[comp.path_id] = idx
                    elif comp.type.name == 'SkinnedMeshRenderer':
                        smrs.append((idx, comp))
                for ch in (tr or {}).get('m_Children') or []:
                    cto = self.resolve(ch, g)
                    cgo = self.resolve(cto.read_typetree()['m_GameObject'], cto) if cto is not None else None
                    if cgo is not None:
                        walk(cgo)
            walk(go)
            if not smrs:
                continue
            d = json.loads(f.read_text())
            nodes = d.get('nodes') or []
            if len(nodes) != len(names) or any(n.get('name') != names[k] for k, n in enumerate(nodes)):
                print(f'[fx] {bundle}/{f.stem}: node tree differs from the bundle, skin skipped')
                continue
            before = json.dumps(d, sort_keys=True)
            mats = d.setdefault('materials', {})
            for idx, smr in smrs:
                sk = self.skin(smr, gos, OUT, mats)
                if sk:
                    nodes[idx]['skin'] = sk
                    found += 1
                else:
                    nodes[idx].pop('skin', None)
            if json.dumps(d, sort_keys=True) != before:
                f.write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False))
                changed += 1
        print(f'[fx] {bundle}: {found} skinned renderer(s), {changed} file(s) changed')
        return found, changed

    def sub_only(self, bundle, pack=None):
        """2026-10-14: write only the particle systems' sub emitters (`ps.mods.sub`, sub_emitters) into the bundle's already
        extracted prefabs (walk order checked like uvt_only). Returns (prefabs with one, files changed)."""
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
            names, pss, subs = [], {}, {}

            def walk(g):
                dd = g.read_typetree()
                idx = len(names)
                names.append(dd['m_Name'])
                tr = None
                for c in dd['m_Component']:
                    comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], g)
                    if comp is None:
                        continue
                    if comp.type.name == 'Transform':
                        tr = comp.read_typetree()
                    elif comp.type.name == 'ParticleSystem':
                        pss[comp.path_id] = idx
                        sm = comp.read_typetree().get('SubModule') or {}
                        if sm.get('enabled'):
                            subs[idx] = [{'emitter': e.get('emitter') or {}, 'type': e.get('type', 0), 'props': e.get('properties', 0),
                                          'p': r4(e.get('emitProbability', 1))} for e in sm.get('subEmitters') or []]
                for ch in (tr or {}).get('m_Children') or []:
                    cto = self.resolve(ch, g)
                    cgo = self.resolve(cto.read_typetree()['m_GameObject'], cto) if cto is not None else None
                    if cgo is not None:
                        walk(cgo)
            walk(go)
            d = json.loads(f.read_text())
            nodes = d.get('nodes') or []
            if len(nodes) != len(names) or any(n.get('name') != names[k] for k, n in enumerate(nodes)):
                print(f'[fx] {bundle}/{f.stem}: node tree differs from the bundle, sub emitters skipped')
                continue
            before = json.dumps(d, sort_keys=True)
            for k, n in enumerate(nodes):
                mods = (n.get('ps') or {}).get('mods')
                if mods is None:
                    continue
                if k in subs:
                    mods['sub'] = subs[k]
                else:
                    mods.pop('sub', None)
            sub_emitters(nodes, pss)
            found += any((n.get('ps') or {}).get('mods', {}).get('sub') for n in nodes)
            if json.dumps(d, sort_keys=True) != before:
                f.write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False))
                changed += 1
        print(f'[fx] {bundle}: {found} prefab(s) with a sub emitter, {changed} file(s) changed')
        return found, changed

    def legacy_only(self, bundle, pack=None):
        """2026-10-14: write only the legacy Animation clips (legacy_clips, `legacy: 1` in `clips`) into the bundle's already
        extracted prefabs (the nodes in the extractor's own walk order, like uvt_only; a file whose node names do not line up
        is left alone); `duration` grows to the longest clip as a full extraction does. Returns (prefabs with one, files changed)."""
        rel = pack or f'battle/prefabs/effects/{bundle}.ab'
        p = bundle_path(self.game, rel)
        if not p:
            print(f'[fx] {bundle}: bundle not found, skipped')
            return 0, 0
        env = self.load(rel)   # with the dependency bundles: some clips live in a shared one (kroos2 / cetsyr)
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
            names, paths, anims = [], {}, []

            def walk(g, path):
                dd = g.read_typetree()
                idx = len(names)
                names.append(dd['m_Name'])
                paths[idx] = path
                tr = None
                for c in dd['m_Component']:
                    comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], g)
                    if comp is None:
                        continue
                    if comp.type.name == 'Transform':
                        tr = comp.read_typetree()
                    elif comp.type.name == 'Animation':
                        anims.append((idx, comp))
                for ch in (tr or {}).get('m_Children') or []:
                    cto = self.resolve(ch, g)
                    cgo = self.resolve(cto.read_typetree()['m_GameObject'], cto) if cto is not None else None
                    if cgo is not None:
                        cn = cgo.read_typetree()['m_Name']
                        walk(cgo, f'{path}/{cn}' if path else cn)
            walk(go, '')
            d = json.loads(f.read_text())
            nodes = d.get('nodes') or []
            if len(nodes) != len(names) or any(n.get('name') != names[k] for k, n in enumerate(nodes)):
                print(f'[fx] {bundle}/{f.stem}: node tree differs from the bundle, legacy clips skipped')
                continue
            new = [c for aidx, a in anims for c in self.legacy_clips(a, aidx, paths)]
            clips = [c for c in d.get('clips') or [] if not c.get('legacy')] + new
            found += bool(new)
            if clips == (d.get('clips') or []):
                continue
            d['clips'] = clips
            if new:
                d['duration'] = r4(min(max(d.get('duration') or 0, *(c['len'] for c in new)), 10))
            f.write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False))
            changed += 1
        print(f'[fx] {bundle}: {found} prefab(s) with a legacy clip, {changed} file(s) changed')
        return found, changed

    def spawn_location(self, root):
        """local patch: the effect component's `_spawnLocation` on the root (1 feet, 2 body / HIT point, 4 head, 5 ground
        centre — docs/rules/fx.md 「관리자 제보 재수정 (2026-10-07 저녁)」; verified on buff_stun 4 / buff_slowdown 1 / buff_sleep 2)
        — root_effect. None when not found. Any SpawnLocation value (local patch: 9–15 = MP_SPECIAL_1…6 — the cap at 8 left
        66 prefabs without one)."""
        pe = self.root_effect(root)
        return pe['spawn'] if pe else None

    def overwrite_height(self, root):
        """(2026-10-10, decompile check — client `Effect._InitLocationFromEntity`, RVA 0xC8B0xx: with
        `_overwriteHeight` the effect's height becomes the entity's height + `_heightOffset`): the root effect component's
        `_overwriteHeight` / `_heightOffset` (root_effect). The offset when it is on (쏜즈 더 로드스타 S1
        thorn2_skill_01_range: 0.0), else None."""
        pe = self.root_effect(root)
        return r4(pe['heightOffset']) if pe and pe['overwrite'] == 1 else None

    @staticmethod
    def root_face(pe):
        """(2026-10-11, decompile check round 2) the root effect's playback fields: `ParticleEffect.FaceTo` (RVA 0xCB1DC0) turns by
        `_rotateType` (0 NONE: never mirrored, 1 FLIP_TWO_SIDE: 'rotation_y' / 'rotation_z' 180° when facing left — right with
        `_leftIsDefault`, 2 FOUR_DIRECTION from `_mainDir`, 3 FIXED_DIRECTION, 4 ANY_DIR); `Effect.Play` (0xC8A5D0) turns it to
        its entity's own four-way direction instead of the given one with `_useBodyRotation` (`body`); `Effect._PlayInternal`
        (0xC8C4F0) uses the playback speed only with `_usePlaybackSpeed`, caps it at `_limitedPlaybackSpeed` ÷ the time scale
        (≥ 0) and waits `_delayToPlay` (random up to it with `_randomPlayDelay`); FxDelay starts the whole effect `_delayTime` ÷
        the speed later. Drawn by render/fxplayer.js FxInstance (maintainer decisions 2026-10-11, docs/rules/fx.md 「좌우 거울·재생
        속도·루트 지연」). { rot, left?, body?, dir?, speed? (0 = ignores the playback speed), limit? (≠ 2), delay?, rnd?,
        fxDelay? } or None."""
        if not pe:
            return None
        o = {'rot': pe['rotate']}
        if pe['leftIsDefault']:
            o['left'] = 1
        if pe.get('body'):
            o['body'] = 1
        if pe['rotate'] in (2, 3):
            o['dir'] = pe['mainDir']
        if not pe['useSpeed']:
            o['speed'] = 0
        if abs(pe['limited'] - 2.0) > 1e-6:
            o['limit'] = r4(pe['limited'])
        if pe['delayToPlay'] > 0:
            o['delay'] = r4(pe['delayToPlay'])
            if pe['randomDelay']:
                o['rnd'] = 1
        if pe['fxDelay'] and pe['fxDelay'] > 0:
            o['fxDelay'] = r4(pe['fxDelay'])
        return o

    def root_only(self, bundle, pack=None):
        """2026-10-11: rewrite only the root effect fields — `spawn`, `height` and `face` (root_effect / root_face) — of the
        bundle's already extracted prefabs, like back_only (the spawn recognition fix: 51 bound prefabs gain a `spawn`).
        Returns (prefabs with an effect component, files changed)."""
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
            pe = self.root_effect(go)
            found += pe is not None
            d = json.loads(f.read_text())
            want = {'spawn': pe['spawn'] if pe else None,
                    'height': r4(pe['heightOffset']) if pe and pe['overwrite'] == 1 else None,
                    'face': self.root_face(pe)}
            if all(d.get(k) == v for k, v in want.items()):
                continue
            for k, v in want.items():
                if v is None:
                    d.pop(k, None)
                else:
                    d[k] = v
            f.write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False))
            changed += 1
        print(f'[fx] {bundle}: {found} prefab(s) with a root effect component, {changed} file(s) changed')
        return found, changed

    def delay_to_finish(self, root):
        """(2026-10-11, decompile check — client `Effect.FinishMe` RVA 0xC88FE0: an effect being finished (a buff ending,
        `Entity.RemoveBuffEffect` RVA 0x36001C0) stops its parts and is recycled `delayToRecycle` s later, which a
        ParticleEffect returns as its `_delayToFinish` — `ParticleEffect.get_delayToRecycle` RVA 0xCB3470): the root effect
        component's `_delayToFinish` (root_effect). buff_stun 0, buff_slowdown 0.5, buff_cold 0.06. None when the
        component is not found. (2026-10-11) A projectile's `_mainEffect` has a ProjectileEffect root instead
        (projectile_effect): its `_delayToFinish` too — `ProjectileEffect.get_delayToRecycle` RVA 0xCB4E40."""
        pe = self.root_effect(root)
        v = pe['delayToFinish'] if pe else None
        if pe is None:
            pj = self.projectile_effect(root)
            v = pj['delayToFinish'] if pj else None
        return r4(v) if v is not None and math.isfinite(v) and 0 <= v <= 60 else None

    def projectile_effect(self, root):
        """(2026-10-11, decompile check — the user report 「투사체가 늦게 사라짐」) the root's ProjectileEffect component
        (PROJECTILE_EFFECT_SCRIPT; `Torappu.Battle.Effects.ProjectileEffect`, the root of a projectile's `_mainEffect`) as
        { delayToFinish, off: [Transform PathID …] }, or None. The client finishes that effect when its projectile stops
        (`Projectile.OnProjectileStop` RVA 0x5FC1A0 → `ClearMainEffectIfNot` 0x5F9550 → `Effect.FinishMe` 0xC88FE0):
        `ProjectileEffect.OnFinish` (0xCB42B0) stops its first particle system with its children (`Awake` 0xCB3A00:
        GetComponentInChildren<ParticleSystem>, `Stop(true)`) and switches off every `_inactiveOnFinish` Transform, and the
        pool takes the whole effect back `_delayToFinish` s later (at once when 0). (2026-10-20) Read by its field names
        (projectile_tree), the raw words (projectile_raw) without a type tree."""
        for sid, raw, t in self.monos(root):
            if sid != PROJECTILE_EFFECT_SCRIPT:
                continue
            v = self.projectile_tree(t) if t is not None else self.projectile_raw(raw)
            if v is not None:
                return v
        return None

    @staticmethod
    def projectile_tree(t):
        """projectile_effect by its field names (`_inactiveOnFinish` entries of this file only), None without them."""
        if '_delayToFinish' not in t or '_inactiveOnFinish' not in t:
            return None
        return {'delayToFinish': float(t['_delayToFinish'] or 0),
                'off': [int(p.get('m_PathID') or 0) for p in t['_inactiveOnFinish'] or [] if not p.get('m_FileID')]}

    @staticmethod
    def projectile_raw(raw):
        """projectile_effect's raw fallback. The fields after the MonoBehaviour name (dump order): the Effect base
        `_bodyTransofrm` (PPtr, 3 words) and `_subFXDelayConfigs` (count n + 4 words each), then from s = 4 + 4n: s
        `_resetMainDir`, s+1 `_mainDir`, s+2 `_rotate180Y`, s+3 `_randomAngle`, s+4 `_delayToFinish`, s+5 `_allowAutoReuse`,
        s+6 `_preloadCnt`, s+7 `_flipIfLeft`, s+8 `_inactiveOnFinish` (count + 3 words each), then `_inactiveOnHit` (count +
        3 words each) — the same in the EN and CN clients (202 + 11 compared). None when it is not that layout."""
        if len(raw) < 32:
            return None
        n = struct.unpack_from('<i', raw, 28)[0]
        if not 0 <= n <= 256:
            return None
        b = raw[(32 + n + 3) & ~3:]
        words = len(b) // 4
        i = lambda k: struct.unpack_from('<i', b, 4 * k)[0]  # noqa: E731
        if words < 4 or not 0 <= i(3) <= 64:
            return None
        s = 4 + 4 * i(3)
        if words < s + 10:
            return None
        a = i(s + 8)
        h = s + 9 + 3 * a
        if not 0 <= a <= 256 or words < h + 1 or words != h + 1 + 3 * i(h):
            return None
        return {'delayToFinish': struct.unpack_from('<f', b, 4 * (s + 4))[0],
                'off': [struct.unpack_from('<q', b, 4 * (s + 10 + 3 * k))[0] for k in range(a) if i(s + 9 + 3 * k) == 0]}

    def off_on_finish(self, root, gos):
        """(2026-10-11) the node indices of the ProjectileEffect's `_inactiveOnFinish` (projectile_effect; `gos`: GameObject /
        Transform PathID → node index), sorted, or None: switched off the moment its projectile stops."""
        pj = self.projectile_effect(root)
        off = sorted({gos[p] for p in (pj or {}).get('off') or [] if p in gos})
        return off or None

    def tree_ids(self, go):
        """(2026-10-11) the node names of the prefab under `go` in the extractor's walk order and its GameObject / Transform
        PathID → node index map (prefab()'s `gos`), for the *_only rewrites."""
        names, gos = [], {}

        def walk(g):
            dd = g.read_typetree()
            idx = len(names)
            gos[g.path_id] = idx
            names.append(dd['m_Name'])
            tr = None
            for c in dd['m_Component']:
                comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], g)
                if comp is not None and comp.type.name == 'Transform':
                    tr = comp.read_typetree()
                    gos[comp.path_id] = idx
            for ch in (tr or {}).get('m_Children') or []:
                cto = self.resolve(ch, g)
                cgo = self.resolve(cto.read_typetree()['m_GameObject'], cto) if cto is not None else None
                if cgo is not None:
                    walk(cgo)
        walk(go)
        return names, gos

    def finish_only(self, bundle, pack=None):
        """2026-10-11: write only the `finish` (delay_to_finish) and the `offFinish` (off_on_finish; a file whose node names do
        not line up with the bundle's keeps its own) of the bundle's already extracted prefabs, like height_only. Returns
        (prefabs with a finish delay, files changed)."""
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
            v = self.delay_to_finish(go) or None
            d = json.loads(f.read_text())
            found += v is not None
            want = {'finish': v}
            if self.projectile_effect(go) is not None:
                names, gos = self.tree_ids(go)
                nodes = d.get('nodes') or []
                if len(nodes) == len(names) and all(n.get('name') == names[k] for k, n in enumerate(nodes)):
                    want['offFinish'] = self.off_on_finish(go, gos)
                else:
                    print(f'[fx] {bundle}/{f.stem}: node tree differs from the bundle, offFinish skipped')
            if all(d.get(k) == x for k, x in want.items()):
                continue
            for k, x in want.items():
                if x is None:
                    d.pop(k, None)
                else:
                    d[k] = x
            f.write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False))
            changed += 1
        print(f'[fx] {bundle}: {found} prefab(s) with a finish delay, {changed} file(s) changed')
        return found, changed

    def height_only(self, bundle, pack=None):
        """2026-10-10: write only the `height` (overwrite_height) of the bundle's already extracted prefabs, like
        back_only. Returns (prefabs with one, files changed)."""
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
            h = self.overwrite_height(go)
            d = json.loads(f.read_text())
            found += h is not None
            if d.get('height') == h:
                continue
            if h is None:
                d.pop('height', None)
            else:
                d['height'] = h
            f.write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False))
            changed += 1
        print(f'[fx] {bundle}: {found} overwrite-height prefab(s), {changed} file(s) changed')
        return found, changed

    def mount_point(self, root):
        """local patch (maintainer report): the root's FollowMountPoint component — the effect follows
        a model point of its owner every frame (스펙터 디 언체인드 S2's red ring on her saw), recognised by its MonoScript
        (PathID MOUNT_SCRIPT): { type, followScaleSign, followScale, pauseWhenInvalid, onlyPauseWhenInvalid,
        keepOriginRotation, useBehaviourPause } (MOUNT_FIELDS; `type` is a MountPointType, its constants: 0 FOOT, 1 HIT,
        2 MUZZLE, 3 HEAD, 4 UI, 5 SPECIAL_0, 6 SPECIAL_1, 7 GROUND, 8–21 SPECIAL_2–15; render/fxpoints.js mountSpawn). None
        when the root has none. (2026-10-16) Read by its field names when the type tree reads (mount_tree), the raw words
        (mount_raw) the fallback."""
        for sid, raw, t in self.monos(root):
            if sid != MOUNT_SCRIPT or len(raw) < 32:
                continue
            v = self.mount_tree(t) if t is not None else None
            return v if v is not None else self.mount_raw(raw)
        return None

    @staticmethod
    def mount_tree(t):
        """mount_point by its field names, None without `_mountPointType`."""
        return {k: int(t.get(f) or 0) for k, f in MOUNT_FIELDS.items()} if '_mountPointType' in t else None

    @staticmethod
    def mount_raw(raw):
        """mount_point's raw fallback: after the header and the empty name, 7 ints in the field order of global-metadata's
        field table (MOUNT_FIELDS, bools as ints). The CN client's (newer) component has 9 words: a float (1.0) and an int
        (0) after `_followScale` (checked on the same prefabs of both clients — swire, texas2, horn, svash2, etlchi —, the
        four bools in the same order after them); without it a CN prefab read the float's bits as
        `_pauseWhenMountPointInvalid`. The EN client's 2026-10-14 update added `_pauseWhenFollowScaleNearlyZero` after
        `_followScale` (8 words), and the raw read took it for `_pauseWhenMountPointInvalid` in 332 of 372 prefabs
        (fx_coverage `reader`, 2026-10-16). Only the 7-, 8- and 9-word layouts (any other: None)."""
        if len(raw) < 32:
            return None
        n = struct.unpack_from('<i', raw, 28)[0]
        off = (32 + n + 3) & ~3
        words = (len(raw) - off) // 4
        if words not in (7, 8, 9):
            return None
        w = struct.unpack_from(f'<{words}i', raw, off)
        v = w[:3] + w[3 + words - 7:]   # 8: skip `_pauseWhenFollowScaleNearlyZero`; 9 (CN): a float and that int
        return dict(zip(MOUNT_FIELDS, v))

    def animator_clips(self, anim, aidx, nodes, paths, mats):
        if anim.type.name == 'Animation':
            return self.legacy_clips(anim, aidx, paths)
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
        if len(ct.get('m_AnimationClips') or []) > 1:
            self.cov.clip('Animator clips past the first (other states: set by client scripts)')
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
                if node is None:
                    self.cov.clip('binding to a path outside the Animator')
                elif prop.startswith('attr:') and not (tid == 1 and attr == crc32('m_IsActive')):
                    self.cov.clip(self.binding_name(b, node))
                ci += n
            clips_out.append({'name': clip['m_Name'], 'len': length, 'loop': bool(clip.get('m_MuscleClip', {}).get('m_LoopTime', 0)), 'tracks': tracks})
        return clips_out

    def binding_name(self, b, node):
        """(2026-10-16, fx_coverage) a Mecanim binding no track takes, named: a material property the bound renderer's
        material does not have (customType 22), else `<component type>.<property path>` by crc32 over the paths of that
        component's type tree on the bound GameObject, else its type id and attribute."""
        tid, attr = b['typeID'], b['attribute']
        go = self.gobjs.get(node)
        if b.get('customType') == 22:
            low = attr & 0x0fffffff
            for m in self.node_materials(go):
                for name, _t, _d in self.declared_props(self.resolve(m.get('m_Shader'), go)):
                    for n in (name, name + '_ST'):
                        if crc32(n) & 0x0fffffff == low:
                            return f'material {n}: declared by the shader, not saved on the material'
            return 'material property the shader does not declare'
        try:
            for c in go.read_typetree()['m_Component'] if go is not None else []:
                comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], go)
                if comp is None or int(comp.type.value) != tid:
                    continue
                for p in type_paths(comp.read_typetree()):
                    if crc32(p) == attr:
                        return f'{comp.type.name}.{p}'
                return f'{comp.type.name} attr:{attr}'
        except Exception:
            pass
        return f'type {tid} attr:{attr}'

    def node_materials(self, go):
        """(2026-10-16, fx_coverage) the type trees of the materials of every renderer on the GameObject."""
        out = []
        try:
            for c in go.read_typetree()['m_Component'] if go is not None else []:
                comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], go)
                if comp is None or not comp.type.name.endswith('Renderer'):
                    continue
                for mp in comp.read_typetree().get('m_Materials') or []:
                    m = self.resolve(mp, comp)
                    if m is not None:
                        out.append(m.read_typetree())
        except Exception:
            pass
        return out

    def legacy_clips(self, anim, aidx, paths):
        """(2026-10-14) A legacy Animation component: its default clip (m_Animation, played automatically — every one of the
        39 extracted prefabs with one has m_PlayAutomatically) as legacy_clip; [] without one."""
        a = anim.read_typetree()
        if not a.get('m_PlayAutomatically', 1):
            return []
        co = self.resolve(a.get('m_Animation'), anim)
        if co is None:
            return []
        base = paths[aidx]
        rel = {}
        for i, p in paths.items():
            if base and not (p == base or p.startswith(base + '/')):
                continue
            rel.setdefault(p[len(base) + 1:] if base and p != base else ('' if p == base else p), i)
        c = legacy_clip(co.read_typetree(), rel, a.get('m_WrapMode', 0))
        return [c] if c else []

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

    def run(self, bundle, prefabs=None, all_skins=False, match=None, list_only=False, pack=None, index='index.json', write=True):
        # pack: a shared battle pack instead (e.g. pkgrps/btl_pfb_fx_token_3.ab, the summons' effects), its roots written
        # as `bundle` — pick them with --match / --prefab. `prefabs` match without case (the enemy
        # prefabs name `…_B_hit_01`, the bundles' roots / containers may differ in case). `index`: the index file the bundle's
        # list goes to (enemy_bindings.py: enemy-index.json — the operators' index.json stays as it is). `write` False
        # (--coverage, 2026-10-16): walk the prefabs for the coverage report only, nothing written
        want = {p.lower() for p in prefabs} if prefabs else None
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
        if not list_only and write:
            (out / bundle).mkdir(parents=True, exist_ok=True)
        for go in roots:
            name = go.read_typetree()['m_Name']
            if want is not None and name.lower() not in want:
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
            self.cov.begin(f'{bundle}/{name}')
            data = self.prefab(go, out)
            written.append(name)
            self.cov.prefab(data)   # 2026-10-20: its signature, for the unverified kind (fx-verified.json)
            if not write:
                # (2026-10-16) the file on disk against what this extractor writes now: an extractor fix that only some
                # bundles were re-extracted with (the built-in Quad, 2026-10-08) leaves the others drawing less
                f = out / bundle / f'{name}.json'
                if f.exists():
                    for path in json_diff(json.loads(f.read_text()), json.loads(json.dumps(data, ensure_ascii=False))):
                        self.cov.stale(re.sub(r'^materials\.[^.]+', 'materials.*', path))
                continue
            (out / bundle / f'{name}.json').write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False))
        if not write:
            print(f'[fx] {bundle}: {len(written)} prefab(s) checked')
            return
        index_p = out / index
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
    ap.add_argument('--uvt-only', action='store_true', help='only write the FxUVTweener `uvt` and FxUVRotation `uvr` of the nodes into the already '
                    'extracted prefabs of the bundles (every bundle of the index without --bundle; 2026-10-14)')
    ap.add_argument('--sub-only', action='store_true', help='only write the particle systems\' sub emitters (`ps.mods.sub`) '
                    'into the already extracted prefabs of the bundles (every bundle of the index without --bundle; 2026-10-14)')
    ap.add_argument('--skin-only', action='store_true', help='only write the SkinnedMeshRenderers (node `skin`, their meshes '
                    'and materials) into the already extracted prefabs of the bundles (every bundle of the index without '
                    '--bundle; 2026-10-14)')
    ap.add_argument('--legacy-only', action='store_true', help='only write the legacy Animation clips into the already '
                    'extracted prefabs of the bundles (every bundle of the index without --bundle; 2026-10-14)')
    ap.add_argument('--back-only', action='store_true', help='only write the SwitchableBackEffect `back` into the already '
                    'extracted prefabs of the bundles (every bundle of index.json without --bundle; 2026-10-10)')
    ap.add_argument('--index', default='index.json', help='the index file under public/assets/local/fx the bundles\' lists go '
                    'to (enemy_bindings.py writes enemy-index.json)')
    ap.add_argument('--pack', metavar='REL', help='read the prefabs from this bundle (relative to the bundle folders, e.g. '
                    'pkgrps/btl_pfb_fx_token_3.ab) and write them as --bundle (local patch: 望\'s 棋子 effects → wang_token)')
    ap.add_argument('--root-only', action='store_true', help='only rewrite the root effect fields `spawn` / `height` / `face` '
                    'of the already extracted prefabs of the bundles (every bundle of index.json without --bundle; 2026-10-11)')
    ap.add_argument('--delay-only', action='store_true', help='only write the branch delays (node `delay` / `sdelay`: a child\'s '
                    'FxDelay, the root\'s _subFXDelayConfigs) into the already extracted prefabs of the bundles (every bundle of '
                    'index.json without --bundle; 2026-10-11)')
    ap.add_argument('--height-only', action='store_true', help='only write the `_overwriteHeight` `height` into the already '
                    'extracted prefabs of the bundles (every bundle of index.json without --bundle; 2026-10-10)')
    ap.add_argument('--finish-only', action='store_true', help='only write the `_delayToFinish` `finish` (and a projectile '
                    'effect\'s `_inactiveOnFinish` `offFinish`) into the already extracted prefabs of the bundles (every bundle '
                    'of --index without --bundle; 2026-10-11)')
    ap.add_argument('--coverage', metavar='OUT', help='write no effect file or index: walk the already extracted prefabs of the bundles (every '
                    'bundle of --index without --bundle) and write the full list of what the pipeline leaves out to OUT '
                    '(JSON, fx_coverage.py; 2026-10-16)')
    a = ap.parse_args()
    if a.build_cab_index:
        build_cab_index(a.game, a.build_cab_index)
        return
    ex = Extractor(a.game, a.cab_index, png=a.png)
    if a.root_only:
        bundles = a.bundle or sorted(json.loads((OUT / a.index).read_text())['bundles'])
        tot = [ex.root_only(b, pack=a.pack) for b in bundles]
        print(f'[fx] root: {sum(x[0] for x in tot)} prefab(s) with a root effect component, {sum(x[1] for x in tot)} file(s) changed')
        return
    if a.delay_only:
        bundles = a.bundle or sorted(json.loads((OUT / a.index).read_text())['bundles'])
        tot = [ex.delay_only(b, pack=a.pack) for b in bundles]
        print(f'[fx] delay: {sum(x[0] for x in tot)} prefab(s) with a branch delay, {sum(x[1] for x in tot)} file(s) changed')
        return
    if a.height_only:
        bundles = a.bundle or sorted(json.loads((OUT / 'index.json').read_text())['bundles'])
        tot = [ex.height_only(b, pack=a.pack) for b in bundles]
        print(f'[fx] height: {sum(x[0] for x in tot)} prefab(s) with an overwritten height, {sum(x[1] for x in tot)} file(s) changed')
        return
    if a.finish_only:
        bundles = a.bundle or sorted(json.loads((OUT / a.index).read_text())['bundles'])
        tot = [ex.finish_only(b, pack=a.pack) for b in bundles]
        print(f'[fx] finish: {sum(x[0] for x in tot)} prefab(s) with a finish delay, {sum(x[1] for x in tot)} file(s) changed')
        return
    if a.back_only:
        bundles = a.bundle or sorted(json.loads((OUT / 'index.json').read_text())['bundles'])
        tot = [ex.back_only(b, pack=a.pack) for b in bundles]
        print(f'[fx] back: {sum(x[0] for x in tot)} prefab(s) with a back switch, {sum(x[1] for x in tot)} file(s) changed')
        return
    if a.uvt_only:
        bundles = a.bundle or sorted(json.loads((OUT / a.index).read_text())['bundles'])
        tot = [ex.uvt_only(b, pack=a.pack) for b in bundles]
        print(f'[fx] uvt: {sum(x[0] for x in tot)} prefab(s) with a uv tween, {sum(x[1] for x in tot)} file(s) changed')
        return
    if a.sub_only:
        bundles = a.bundle or sorted(json.loads((OUT / a.index).read_text())['bundles'])
        tot = [ex.sub_only(b, pack=a.pack) for b in bundles]
        print(f'[fx] sub: {sum(x[0] for x in tot)} prefab(s) with a sub emitter, {sum(x[1] for x in tot)} file(s) changed')
        return
    if a.skin_only:
        bundles = a.bundle or sorted(json.loads((OUT / a.index).read_text())['bundles'])
        tot = [ex.skin_only(b, pack=a.pack) for b in bundles]
        print(f'[fx] skin: {sum(x[0] for x in tot)} skinned renderer(s), {sum(x[1] for x in tot)} file(s) changed')
        return
    if a.legacy_only:
        bundles = a.bundle or sorted(json.loads((OUT / a.index).read_text())['bundles'])
        tot = [ex.legacy_only(b, pack=a.pack) for b in bundles]
        print(f'[fx] legacy: {sum(x[0] for x in tot)} prefab(s) with a legacy clip, {sum(x[1] for x in tot)} file(s) changed')
        return
    if a.mount_only:
        bundles = a.bundle or sorted(json.loads((OUT / 'index.json').read_text())['bundles'])
        tot = [ex.mount_only(b, pack=a.pack) for b in bundles]
        print(f'[fx] mount: {sum(x[0] for x in tot)} prefab(s) with a mount, {sum(x[1] for x in tot)} file(s) changed')
        return
    if a.coverage:
        ex.dry = True
        listed = json.loads((OUT / a.index).read_text())['bundles']
        for b in a.bundle or sorted(listed):
            if not listed.get(b):
                continue
            try:
                ex.run(b, set(a.prefab) or set(listed[b]), all_skins=a.all_skins, pack=a.pack, index=a.index, write=False)
            except SystemExit as e:   # a bundle extracted from a shared pack (wang_token) or another client: give --pack
                print(f'[fx] {b}: {e}, skipped')
        rep = ex.cov.report()
        Path(a.coverage).parent.mkdir(parents=True, exist_ok=True)
        Path(a.coverage).write_text(json.dumps(rep, ensure_ascii=False, indent=1))
        print('\n'.join(ex.cov.summary()))
        print(f'[fx] coverage: {len(rep)} item(s) -> {a.coverage}')
        return
    for b in a.bundle:
        ex.run(b, set(a.prefab) or None, all_skins=a.all_skins, match=re.compile(a.match) if a.match else None, list_only=a.list, pack=a.pack, index=a.index)
    if a.bundle and not a.list:
        print('\n'.join(ex.cov.summary()))   # 2026-10-16: what this run left out (fx_coverage.py)
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
