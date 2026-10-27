#!/usr/bin/env python3
"""Battle effect extraction (local patch, docs/LOCAL-PATCH.md): official operator skill / attack effects from a
locally installed client, for the web effect player (public/js/render/fxplayer.js, preview page /fxlab.html).

An effect is a Unity prefab in battle/prefabs/effects/<name>.ab (e.g. chen3_skill_01_start_01): a GameObject tree of
ParticleSystems (+ renderers), MeshRenderers and an Animator whose Mecanim clip animates transforms and material
properties. This script writes, per effect bundle:

    public/assets/local/fx/<bundle>/<prefab>.json   the tree, normalized particle modules, materials, clip curves
    public/assets/local/fx/tex/<texture>.webp       textures (shared by every effect; static WebP, --png for PNG)
    public/assets/local/fx/mesh/<mesh>.json         meshes (positions, uv, colors, indices)
    public/assets/local/fx/tex/wrap.json            { <texture>: [wrap u, wrap v] } of the textures that do not repeat
                                                    (2026-10-22; --wrap-only rereads every extracted one)
    public/assets/local/fx/index.json               { bundles: { <bundle>: [prefab, ...] }, sources: { <bundle> or
                                                    <bundle>/<prefab>: { pack, client } } } — sources: where a prefab
                                                    was read from when that is not its own bundle of the EN client

Textures usually live in other bundles, named only by their internal CAB file; `--cab-index` (built once with
--build-cab-index, a JSON CAB -> bundle path) lets the loader pull them in. Nothing here is required by the game: an
install without the files draws its procedural effects (render/fx.js).

Usage:
    python fx_extract.py --game <Arknights_Data> --build-cab-index .cache/fx-cab-index.json
    python fx_extract.py --game <Arknights_Data> --cab-index .cache/fx-cab-index.json --bundle chen3 [--prefab NAME ...]
                         [--match REGEX] [--list] [--all-skins] [--prune]
    python fx_extract.py … --bundle wang_token --pack pkgrps/btl_pfb_fx_token_3.ab --match '^token_wang_'   (望's 棋子)
    python fx_extract.py … --coverage .cache/fx-coverage.json [--bundle chen3]   (what the pipeline leaves out, fx_coverage.py)
                         [--other-game <CN Arknights_Data> --other-cab-index .cache/fx-cab-index-cn.json] [--index enemy-index.json]
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
from fx_coverage import COMP_FIELDS, Coverage  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'assets' / 'local' / 'fx'
BUNDLE_DIRS = ('PersistentData/Bundles', 'StreamingAssets/AB/Windows')  # PersistentData (hot updates) first
# skin / collab variants of a prefab (the remake draws the default skin only; keep in sync with render/fxmap.js isVariant)
WEBP_QUALITY = 85
WIDTH_ATTR = zlib.crc32(b'm_Parameters.widthMultiplier')   # local patch: the clip binding of a line / trail's width
# (2026-10-22) clip bindings on a component's own values the player drives (render/fxplayer.js bindTrack0): the component
# (Unity class id) → {its property path: the track's prop}. A Mecanim binding is the crc32 of the path, a legacy one the path
ANIMATED_VALUES = {
    198: {p: 'ps:' + p for p in (   # ParticleSystem
        'EmissionModule.rateOverTime.scalar', 'EmissionModule.rateOverTime.minScalar', 'ShapeModule.radius.value',
        'SizeModule.curve.scalar', 'InitialModule.gravityModifier.scalar', 'looping',
        'simulationSpeed',   # (2026-10-22, effect bundle J) 纯烬艾雅法拉 S2 range's level clips
        'VelocityModule.enabled',   # (2026-10-23) a clip switching the module on (vel_ol `on`)
        *(f'InitialModule.startColor.maxColor.{c}' for c in 'rgba'), *(f'TrailModule.colorOverLifetime.maxColor.{c}' for c in 'rgba'))},
    96: {'m_Time': 'trail:time'},   # TrailRenderer
    23: {'m_Enabled': 'mr:enabled'},   # MeshRenderer
    114: {p: 'uvt:' + p for p in ('xspeed', 'yspeed', 'secondXSpeed', 'secondYSpeed')},   # MonoBehaviour: FxUVTweener
}
ANIMATED_CRC = {(cid, zlib.crc32(p.encode())): prop for cid, m in ANIMATED_VALUES.items() for p, prop in m.items()}
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
# 2026-10-10, official client: the MonoScript PathID of SwitchableBackEffect (switch_back) — 62 default-skin
# prefabs of the extracted bundles carry one (비르투오사 S3 cello_skill_03_buff_front_02 → _back_02, 로즈몬티스, 휴머스 …)
BACK_SCRIPT = 7599136815520768295
# 2026-10-11, official client: the MonoScript PathID of Torappu.Fx.FxDelay (root_effect `fxDelay`; 38 of the roots of
# texas2 / dusk / siege2, a component of one float `_delayTime`)
FXDELAY_SCRIPT = 4526430437831129839
# 2026-10-11, official client: the MonoScript PathID of Torappu.Battle.Effects.ProjectileEffect (projectile_effect; the root
# of a projectile's `_mainEffect`: 202 of the extracted prefabs of the EN client, the same id in the CN client)
PROJECTILE_EFFECT_SCRIPT = 4524653206994915020
# 2026-10-16: the MonoScript PathID of Torappu.Fx.ParticleEffect (root_effect, which recognises it by its shape; fx_coverage
# checks that every root carrying one was recognised)
PARTICLE_EFFECT_SCRIPT = 6196809664641094801
# (2026-10-20) the MonoScript PathID of SwitchableRightEffect (right_effect; fx_coverage checks its raw fallback)
RIGHT_SCRIPT = 7347111497538980357
# (2026-10-21, official client) the MonoScript PathID of Torappu.Battle.Effects.RandomEmitter (random_emitter, node `emit`)
RANDOM_EMITTER_SCRIPT = -1593825680945881793
# (2026-10-21, official client) the MonoScript PathIDs of Torappu.Battle.Effects.OnPlayEmitter and OnFinishEmitter
# (on_emitters, node `onPlay` / `onFinish`)
ON_PLAY_EMITTER_SCRIPT = -5498265793651067281
ON_FINISH_EMITTER_SCRIPT = 2565987927806955259
# (2026-10-21, official client) the MonoScript PathIDs of the client's effect behaviours that pause or finish their effect
# (pause_scripts, node `pauseIf` / `pauseOther` / `pauseAnim` / `pauseIdle` / `pauseSpine` / `finishIf`) and of EmptyEffect
# (an Effect root without particles: delay_to_finish); the same ids in the CN client
PAUSE_IF_SCRIPT = -5974768320951421776
PAUSE_OTHER_SCRIPT = -8269937305055351653
PAUSE_ANIM_SCRIPT = 6329958979451404875
PAUSE_IDLE_SCRIPT = 2267209715737721819
PAUSE_SPINE_SCRIPT = -654372255496816943
FINISH_IF_SCRIPT = -6490124024613466648
EMPTY_EFFECT_SCRIPT = -488665936260092151
# (2026-10-21, official client) the MonoScript PathID of Torappu.Battle.Effects.FunnelHitEffect (funnel_hit, `jitter`)
FUNNEL_HIT_SCRIPT = 8922258000712749090
# (2026-10-22, official client) the MonoScript PathID of Torappu.Battle.Effects.FollowDirection (follow_direction, `follow`)
FOLLOW_DIRECTION_SCRIPT = -337322108846137150
# (2026-10-23, official client) the MonoScript PathID of Torappu.Fx.FxLODSetting (lod_setting, `lod`)
LOD_SCRIPT = 1149374055237060560
# (2026-10-22, official client) the MonoScript PathIDs of Torappu.Battle.Effects.SwitchableEffectByFaceDirection
# (switch_face, `swFace`), SwitchableThreeFaceEffect (three_face, `three`), RandomDirection (random_direction, `rdir`) and
# FollowTileHeight (tile_height, `tileH`)
SWITCH_FACE_SCRIPT = -4364771506185570144
THREE_FACE_SCRIPT = 5365557655193992920
RANDOM_DIRECTION_SCRIPT = 1115230818793786687
FOLLOW_TILE_HEIGHT_SCRIPT = 2994498389723426252
# (2026-10-25, official client) the MonoScript PathIDs of Torappu.Battle.Effects.FollowOwner and FollowOwnerRootTileHeight
# (owner_follow: `followOwner`, `rootTile`) and PauseEffectIfNotMove (pause_scripts: `pauseMove`) — field-less scripts
FOLLOW_OWNER_SCRIPT = -2862109401119915025
ROOT_TILE_SCRIPT = -1576532863054725745
PAUSE_MOVE_SCRIPT = -1569843327534094582
# (2026-10-22, official client) the MonoScript PathIDs of the scripts that drive an Animator at the effect's finish / play
# (anim_scripts, `animFin` / `animSrc`), and of EmitterRandomGroup (random_group, `rgroup`) and SwitchableWhenContainsEquipment
# (equip_effects, `equipFx`)
TRIGGER_WHEN_FINISH_SCRIPT = 4957269727245382446
ON_FINISH_ANIME_SCRIPT = -7571717170868447701
SWITCH_STATE_WHEN_FINISH_SCRIPT = -1577373638081991986
TRIGGER_ON_EVENT_SCRIPT = -7693528729676623236
TRIGGER_BY_CONDITION_SCRIPT = 70527413319701124
AURA_TRIGGER_SCRIPT = -2505866108626100628
SET_FLOAT_SCRIPT = 295235635984623506
BUFF_PROGRESS_SCRIPT = -5165147848620574582
RANDOM_GROUP_SCRIPT = -3960942007169782850
EQUIP_SWITCH_SCRIPT = 1228563541688412297
# Mecanim's parameter types (AnimatorControllerParameterType) and condition modes (AnimatorConditionMode; 5 = the exit time
# itself, never stored as a condition)
PARAM_TYPES = {1: 'float', 3: 'int', 4: 'bool', 9: 'trigger'}
PARAM_VALUES = {1: 'm_FloatValues', 3: 'm_IntValues', 4: 'm_BoolValues', 9: 'm_BoolValues'}
COND_MODES = {1: 'if', 2: 'ifnot', 3: 'gt', 4: 'lt', 6: 'eq', 7: 'ne'}
# Torappu.Battle.AbnormalFlag by value (the 2026-10-14 EN client; E_NUM = 44 means "no flag"). A value past the list (the CN client's
# newer flags) stays a number.
ABNORMAL_FLAGS = ('STUNNED', 'SP_RECOVER_STOPPED', 'TARGET_FREE', 'BLOCK_FREE', 'HIDDEN', 'INVINCIBLE', 'UNDEADABLE', 'HEAL_FREE',
                  'UNBALANCE_IMMUNE', 'INVISIBLE', 'UNUSED_PLACEHOLDER_1', 'DISARMED', 'SILENCED', 'UNMOVABLE',
                  'UNUSED_PLACEHOLDER_2', 'ALLY_TARGET_FREE', 'FROZEN', 'CAMOUFLAGE', 'FORCE_DISARMED',
                  'STUNNED_NO_AMPLIFY_DAMAGE', 'DISABLE_COMBAT', 'ELEMENT_FREE_ALL', 'UNMOVABLE_PRIVATE', 'COLD',
                  'SKILL_NOT_ACTIVATABLE', 'LEVITATE', 'DURANCE', 'NOT_WITHDRAWABLE', 'OUT_OF_GROUND', 'SP_MODIFY_STOPPED',
                  'ANTI_STATUS_RESISTABLE', 'DISARMED_COMBAT', 'TOWER_TARGET_FREE', 'FEARED', 'SKILL_ACTIVABLE_IN_ABNORMAL',
                  'MOTION_TARGET_FREE', 'FORCE_LEVITATE', 'BUFF_ADD_CAN_BE_CANCELED_IF_DEFENSE',
                  'DEFENSE_BUFF_ADD_IF_CANCELABLE_BUFF', 'PALSY', 'PALSYING', 'ATTRACTED', 'FEARED_PRIVATE', 'DOZE')
ABNORMAL_NONE = 44
ABNORMAL_COMBOS = ('SLEEPING', 'SHELTERING')   # Torappu.Battle.AbnormalCombo (E_NUM = 2)
# (2026-10-16) Unity's built-in particle materials (an anonymous bundle, anon/*.bin): read as no material on a system that
# emits nothing, as before the CAB index knew that bundle — empty containers (227 of 234); (2026-10-22) read on the ones that
# emit (Default-Particle: Legacy Shaders/Particles/Alpha Blended Premultiply, render/fxplayer.js)
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
                      'mainDir': '_mainDir', 'hold': '_holdByOwner', 'overwrite': '_overwriteHeight', 'heightOffset': '_heightOffset',
                      'maxLife': '_maxLifetime'}
ROOT_EFFECT_FLOATS = {'delayToPlay', 'delayToFinish', 'limited', 'heightOffset', 'maxLife'}


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


def projectile_carriers(game):
    """(2026-10-27, effect bundle W2b-2) {`_mainEffect` prefab name: {projectile key: whether its body turns}} of the
    projectiles of battle/prefabs/[uc]projectiles.ab (both bundle folders, a root of PersistentData first; names in lower
    case). A chain graphic's `_mainEffect` is its line (char_modes.Projectiles), left out. The body turns only with
    `_rotateToTarget` (BasicMovement.RotateToCertainDirection); a root without a movement keeps it as it is."""
    from char_modes import load_tree
    out, seen = {}, set()
    for d in BUNDLE_DIRS:
        f = Path(game) / d / 'battle/prefabs/[uc]projectiles.ab'
        if not f.exists():
            continue
        per = {}
        for gp, t, _ in load_tree(f)[0]:
            per.setdefault(gp.split('/')[0], []).append(t)
        for key, lst in per.items():
            if key in seen:
                continue
            seen.add(key)
            turn = any(t.get('_rotateToTarget') for t in lst)
            for t in lst:
                m = t.get('_mainEffect')
                if isinstance(m, str) and m and '_playSpecialEffectOnFirstOne' not in t:
                    out.setdefault(m.lower(), {})[key.lower()] = turn
    return out


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

def mm_nz(mm):
    """(2026-10-26, effect bundle U) a minmax() result that is not zero everywhere (its scalar multiplies a curve)."""
    return bool(mm) and bool(mm.get('s') or mm.get('n'))


def vel_ol(v):
    """A VelocityModule (velocity over lifetime) as the extract's `mods.velOL`. (2026-10-26, effect bundle U) the orbital
    velocity about x / y (`orbX`, `orbY`) and the orbit's centre (`orbOff` [x, y, z]) only where they are not zero."""
    o = {'x': minmax(v['x']), 'y': minmax(v['y']), 'z': minmax(v['z']), 'world': bool(v.get('inWorldSpace')),
         'radial': minmax(v.get('radial')), 'orbZ': minmax(v.get('orbitalZ')), 'speedMul': minmax(v.get('speedModifier'))}
    for k, f in (('orbX', 'orbitalX'), ('orbY', 'orbitalY')):
        if mm_nz(minmax(v.get(f))):
            o[k] = minmax(v.get(f))
    off = [minmax(v.get(f)) for f in ('orbitalOffsetX', 'orbitalOffsetY', 'orbitalOffsetZ')]
    if any(mm_nz(x) for x in off):
        o['orbOff'] = off
    return o


def clip_modules(nodes, clips):
    """(2026-10-23) A system whose VelocityModule is off but a clip of the prefab switches it on (track
    `ps:VelocityModule.enabled`; the enemies' mcmstr_buff_04_start) carries the module as `velOL` with `on` 0 — the clip
    sets `on` (render/fxplayer.js PS_ANIM). The walk keeps each system's switched-off module as `_velOff` until here."""
    for c in clips:
        for tr in c.get('tracks') or []:
            n = nodes[tr['node']] if tr.get('prop') == 'ps:VelocityModule.enabled' else None
            mods = (n.get('ps') or {}).get('mods') if n else None
            if mods is not None and 'velOL' not in mods and n.get('_velOff'):
                mods['velOL'] = {**n['_velOff'], 'on': 0}
    for n in nodes:
        n.pop('_velOff', None)


def particle_system(ps, psr, mat_key, mesh_key, trail_mat=None, shape_mesh=None, more_meshes=None):
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
        if mm_nz(minmax(em.get('rateOverDistance'))):   # (2026-10-26, effect bundle U) particles per unit the emitter moves
            o['dist'] = minmax(em['rateOverDistance'])
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
        # (2026-10-26, effect bundle U) the arc's and the edge's emission order (mode 0 Random, 1 Loop, 2 PingPong, 3 BurstSpread),
        # their discrete steps (spread) and the Loop / PingPong speed; the donut's tube radius; the random start offset
        for k, f in (('arc', 'arc'), ('rad', 'radius')):
            a = sh.get(f) if isinstance(sh.get(f), dict) else {}
            if a.get('mode', 0) or a.get('spread', 0):
                o['shape'][f'{k}Mode'] = a.get('mode', 0)
                o['shape'][f'{k}Spread'] = r4(a.get('spread', 0))
                if a.get('mode', 0) in (1, 2):
                    o['shape'][f'{k}Speed'] = minmax(a.get('speed'))
        if sh['type'] == 17:
            o['shape']['donut'] = r4(sh.get('donutRadius', 0.2))
        if sh.get('randomPositionAmount', 0):
            o['shape']['randPos'] = r4(sh['randomPositionAmount'])
        if sh['type'] == 6 and shape_mesh:
            # 2026-10-22: a Mesh shape — its mesh file, placementMode (0 vertex, 1 edge, 2 triangle) and m_UseMeshColors
            # (the client's 79 systems: m_MeshSpawn mode 0 Random, no normal offset; fx_coverage reports another)
            o['shape'].update({'mesh': shape_mesh, 'place': sh.get('placementMode', 0), 'meshCol': bool(sh.get('m_UseMeshColors', 1))})
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
        mods['velOL'] = vel_ol(ps['VelocityModule'])
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
        # (2026-10-26, effect bundle U) a strength per axis, the octaves, the amounts on position / rotation / size
        if n.get('separateAxes'):
            mods['noise'].update({'strY': minmax(n['strengthY']), 'strZ': minmax(n['strengthZ'])})
        if n.get('octaves', 1) > 1:
            mods['noise'].update({'oct': n['octaves'], 'octMul': r4(n.get('octaveMultiplier', 0.5)), 'octScale': r4(n.get('octaveScale', 2))})
        pa = minmax(n.get('positionAmount'))
        if pa and not (pa['m'] == 0 and pa['s'] == 1):
            mods['noise']['posAmt'] = pa
        for k, f in (('rotAmt', 'rotationAmount'), ('sizeAmt', 'sizeAmount')):
            if mm_nz(minmax(n.get(f))):
                mods['noise'][k] = minmax(n[f])
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
        # (2026-10-27, effect bundle V) a sub emitter's ribbon per parent particle
        if tm.get('splitSubEmitterRibbons'):
            mods['trail']['split'] = 1
    # 2026-10-22: the three modules every extracted prefab sets one way (fx_coverage flags any other) — InheritVelocity in
    # mode 0 (Initial: at birth), SizeBySpeed, Collision against planes (type 0; `planes` = their Transforms, resolved to
    # nodes after the walk — collide_planes)
    iv = ps.get('InheritVelocityModule') or {}
    if iv.get('enabled'):
        mods['inherit'] = {'mode': iv.get('m_Mode', 0), 'k': minmax(iv.get('m_Curve'))}
    sbs = ps.get('SizeBySpeedModule') or {}
    if sbs.get('enabled'):
        rg = sbs.get('range') or {}
        mods['sizeBySpeed'] = {'x': minmax(sbs['curve']), 'range': [r4(rg.get('x', 0)), r4(rg.get('y', 1))]}
        if sbs.get('separateAxes'):
            mods['sizeBySpeed'].update({'y': minmax(sbs['y']), 'z': minmax(sbs['z'])})
    co = ps.get('CollisionModule') or {}
    if co.get('enabled') and co.get('type', 0) == 0:
        mods['collide'] = {'planes': [p for p in co.get('m_Planes') or [] if p.get('m_PathID')],
                           'dampen': minmax(co.get('m_Dampen')), 'bounce': minmax(co.get('m_Bounce')),
                           'lifeLoss': minmax(co.get('m_EnergyLossOnCollision')), 'minKill': r4(co.get('minKillSpeed', 0)),
                           'maxKill': r4(co.get('maxKillSpeed', 10000)), 'radius': r4(co.get('radiusScale', 1))}
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
    # (2026-10-27, effect bundle V) the drawing order and the rest of the renderer: the sorting layer's place (m_SortingLayer,
    # 0 = Default), the particles' sort mode, whether `streams` reach the shader at all (off: Unity's default streams, no
    # custom data), the further meshes of a mesh renderer (m_Mesh1..3, one picked per particle), the mirrored share per axis
    r = o['render']
    r['ownStreams'] = 1 if psr.get('m_UseCustomVertexStreams') else 0
    if psr.get('m_SortingLayer', 0):
        r['layer'] = psr['m_SortingLayer']
    if psr.get('m_SortMode', 0):
        r['sortMode'] = psr['m_SortMode']
    if more_meshes:
        r['meshes'] = more_meshes
    # (2026-10-27) a stretched renderer's freeform stretching (the engine builds that quad another way) and, with it, whether
    # the quad turns toward its stretch (effect bundle X2)
    if psr.get('m_RenderMode') == 1 and psr.get('m_FreeformStretching'):
        r['free'] = 1
        if psr.get('m_RotateWithStretchDirection'):
            r['rotw'] = 1
    fl = vec3(psr['m_Flip']) if isinstance(psr.get('m_Flip'), dict) else [0, 0, 0]
    if any(fl):
        r['flip'] = fl
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
            prop = ANIMATED_VALUES.get(cv.get('classID', 0), {}).get(attr) or f'attr:{crc32(attr)}'
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


def client_of(game):
    """(2026-10-21) the client a game folder is, by the company Unity's `app.info` names: HyperGryph = 'cn', anything else
    'en' (Yostar; also a merged copy of bundle folders without the file)."""
    try:
        company = (Path(game) / 'app.info').read_text(encoding='utf-8', errors='replace').splitlines()[0].strip()
    except (OSError, IndexError):
        return 'en'
    return 'cn' if company.lower() == 'hypergryph' else 'en'


def own_pack(bundle):
    return f'battle/prefabs/effects/{bundle}.ab'


# 2026-10-22: a texture's wrap mode (Texture2D m_TextureSettings m_WrapU / m_WrapV, Unity TextureWrapMode: 0 Repeat,
# 1 Clamp, 2 Mirror, 3 MirrorOnce). The effect player repeated every texture: a Clamp one tiled ×4 and scrolled along a
# mesh (烛煌 S3's flame, blaze2_02) covered the whole mesh instead of passing along it as one streak.
WRAP_FILE = 'tex/wrap.json'


def tex_wrap(t):
    """(u, v) wrap mode of a read Texture2D (an older serialisation's single m_WrapMode for both)."""
    s = getattr(t, 'm_TextureSettings', None)
    if s is None:
        return (0, 0)
    w = getattr(s, 'm_WrapMode', None)
    u, v = getattr(s, 'm_WrapU', w), getattr(s, 'm_WrapV', w)
    return (int(u or 0), int(v or 0))


def merge_wraps(found, out=OUT):
    """Write the wraps of the textures `found` ({file name: (u, v)}) into `out`/tex/wrap.json — { file: [u, v] } for the
    textures that do not repeat both ways (render/fxplayer.js FxLibrary reads it; a texture not listed repeats). Returns
    the number of listed textures."""
    p = out / WRAP_FILE
    cur = json.loads(p.read_text()) if p.exists() else {}
    for name, (u, v) in found.items():
        if u or v:
            cur[name] = [u, v]
        else:
            cur.pop(name, None)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(dict(sorted(cur.items())), indent=0))
    return len(cur)


def wrap_walk(ex, a):
    """--wrap-only: the wrap of every already extracted texture, read from the packs its effects came from (the index's
    `sources` per client, like coverage_walk) and their dependency bundles. Returns {file name: (u, v)}."""
    exs = {ex.client: ex}
    if a.other_game:
        other = Extractor(a.other_game, a.other_cab_index, png=a.png)
        if other.client in exs:
            raise SystemExit(f'--other-game is the same client ({other.client}) as --game')
        exs[other.client] = other
    have = {f.name for f in (OUT / 'tex').iterdir()}
    packs = set()
    for idx in ('index.json', 'enemy-index.json'):
        p = OUT / idx
        if not p.exists():
            continue
        index = json.loads(p.read_text())
        for b, names in index['bundles'].items():
            for n in names:
                s = source_of(index, b, n)
                packs.add((s['client'], s['pack']))
    found = {}
    for client, pack in sorted(packs):
        e = exs.get(client)
        if e is None:
            print(f'[fx] wrap: {pack} is from the {client} client: give --other-game')
            continue
        try:
            env = e.load(pack)
        except SystemExit as err:
            print(f'[fx] wrap: {client} {pack}: {err}')
            continue
        for o in env.objects:
            if o.type.name != 'Texture2D':
                continue
            t = o.read()
            for ext in ('.webp', '.png'):
                name = f'{t.m_Name}_{o.path_id & 0xffffffff:08x}{ext}'
                if name in have:
                    found[name] = tex_wrap(t)
    print(f'[fx] wrap: {len(found)} of {len(have)} texture file(s) found, '
          f'{sum(1 for w in found.values() if w != (0, 0))} not repeating')
    return found


def source_of(index, bundle, name):
    """(2026-10-21) where an extracted prefab was read from: {'pack': the bundle path, 'client': 'en' | 'cn'} — the index's
    `sources` entry of `<bundle>/<name>`, else of `<bundle>`, else the bundle's own `battle/prefabs/effects/<bundle>.ab` in
    the EN client. --coverage walks each prefab where it came from (a shared token pack, another operator's bundle, the
    CN client, the enemies' packs)."""
    s = index.get('sources') or {}
    e = s.get(f'{bundle}/{name}', s.get(bundle)) or {}
    return {'pack': e.get('pack') or own_pack(bundle), 'client': e.get('client', 'en')}


def set_emitted(index, bundle, out=OUT):
    """(2026-10-21) record in `index['emitted'][bundle]` the bundle's prefabs another of its prefabs creates (its nodes'
    OnPlayEmitter `onPlay` / OnFinishEmitter `onFinish`, its root's SwitchableBackEffect `back` — 远牙 S3's
    fartth_skill_03_buff_02_B —, and (2026-10-22) its face switches' copies `swFace` / `three`, its random group's picks `rgroup`
    and its module variants `equipFx`): render/fxgame.js's name
    rules leave them to their emitter. Read from the extracted files, so it holds after any partial extraction; the key
    goes when there are none."""
    listed = set(index['bundles'].get(bundle, []))
    names = set()
    for n in listed:
        f = out / bundle / f'{n}.json'
        if not f.exists():
            continue
        d = json.loads(f.read_text())
        back = (d.get('back') or {}).get('effect')
        if back in listed:
            names.add(back)
        for k in ('swFace', 'three'):
            names.update(v for v in (d.get(k) or {}).values() if isinstance(v, str) and v in listed)
        # (2026-10-22) the random group's picks and the module variants
        names.update(v for v in (d.get('rgroup') or {}).get('pick') or [] if v in listed)
        names.update(h[2] for h in (d.get('equipFx') or {}).get('hooks') or [] if h[2] in listed)
        for nd in d.get('nodes') or []:
            for k in ('onPlay', 'onFinish'):
                names.update(e for e in (nd.get(k) or {}).get('effects') or [] if e in listed)
    em = index.setdefault('emitted', {})
    if names:
        em[bundle] = sorted(names)
    else:
        em.pop(bundle, None)
    if not em:
        index.pop('emitted')


def set_sources(index, bundle, names, written, src):
    """(2026-10-21) record in `index['sources']` where the bundle's prefabs `names` come from: `src` ({pack, client}) for
    the ones just `written`, the recorded source for the others. Only what differs from the default (source_of) is kept:
    one `<bundle>` entry when every prefab of the bundle shares it, else one `<bundle>/<name>` entry per prefab."""
    def short(e):
        out = {}
        if e.get('pack') and e['pack'] != own_pack(bundle):
            out['pack'] = e['pack']
        if e.get('client', 'en') != 'en':
            out['client'] = e['client']
        return out
    per = {n: short(src if n in written else source_of(index, bundle, n)) for n in names}
    s = {k: v for k, v in (index.get('sources') or {}).items() if k != bundle and not k.startswith(bundle + '/')}
    if len({json.dumps(e, sort_keys=True) for e in per.values()}) == 1:
        e = next(iter(per.values()))
        if e:
            s[bundle] = e
    else:
        s.update({f'{bundle}/{n}': e for n, e in per.items() if e})
    if s:
        index['sources'] = dict(sorted(s.items()))
    else:
        index.pop('sources', None)


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


def collide_planes(nodes, tfs):
    """(2026-10-22) Each extracted system's `mods.collide.planes` (Transform pointers) → node indices: `tfs` maps a
    Transform path id to its node. A plane outside the prefab is dropped; with none left the module goes (Unity collides
    with nothing — 2 of the 42 systems with the module on set no plane)."""
    for n in nodes:
        co = (n.get('ps') or {}).get('mods', {}).get('collide')
        if not co:
            continue
        co['planes'] = [k for k in (tfs.get(p.get('m_PathID')) for p in co['planes'] if not p.get('m_FileID')) if k is not None]
        if not co['planes']:
            n['ps']['mods'].pop('collide')


# ---------------------------------------------------------------- extraction

class Extractor:
    def __init__(self, game, cab_index, png=False, client=None):
        self.png = png
        import UnityPy
        import aklz4  # noqa: F401
        self.UnityPy = UnityPy
        self.game = Path(game)
        self.client = client or client_of(game)   # 2026-10-21: recorded with each written prefab (index `sources`)
        self.cab = json.loads(Path(cab_index).read_text()) if cab_index else {}
        self.textures = {}   # path_id/name key -> file name
        self.wraps = {}      # 2026-10-22: texture file name -> (wrap u, wrap v) of each texture met (merge_wraps)
        self.meshes = {}
        self.builtin = None  # the client's unity default resources, loaded on first use (mesh_ref)
        # 2026-10-16: what the run meets and the pipeline leaves out (fx_coverage.py). .cache/class-fields.json, a class →
        # field-name table of the client's scripts kept outside the repository, names the unknown scripts; without it
        # they are listed by PathID
        cf = ROOT / '.cache' / 'class-fields.json'
        self.cov = Coverage(class_fields=cf if cf.exists() else None)
        self.shader_props = {}   # shader path id -> [(name, type, defaults)] (Coverage.material)
        self.keep = None         # 2026-10-20: a dict to collect each walked prefab's JSON in ('bundle/name' -> data; fx_golden.py)
        self.dry = False         # --coverage: no texture / mesh file written
        self.carriers = None     # 2026-10-27: projectile_carriers, read on first use (body_still)

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
        self.wraps[name] = tex_wrap(obj.read())
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
            subs = [[i for face in sm for i in face] for sm in h.get_triangles()]
        except Exception as ex:
            print(f'[fx] mesh {key}: {ex}')
            return None
        idx = [i for sm in subs for i in sm]
        if not idx:   # an empty mesh (mostma fangkuai): nothing to draw
            return None
        data = {'pos': pos, 'uv': uv, 'idx': idx}
        if len(subs) > 1:   # (2026-10-26, effect bundle W2a) each sub-mesh's [first index, index count] (a MeshRenderer's `more`)
            data['sub'] = [[sum(map(len, subs[:k])), len(sm)] for k, sm in enumerate(subs)]
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
        # 2026-10-10: the same key is the same mesh — a shared file is never rewritten (2026-10-26: but once for its `sub`)
        if not self.dry and (not p.exists() or ('sub' in data and '"sub"' not in p.read_text())):
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
        self.cov.fields('Material', d)   # (2026-10-26, effect bundle W1) its own fields and keywords
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
        self.cov.fields('GameObject', d)   # (2026-10-26, effect bundle W1) and every component's fields (fx_coverage.COMP_FIELDS)
        for c in d['m_Component']:
            comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], go)
            if comp is None:
                continue
            tn = comp.type.name
            if tn != 'MonoBehaviour':
                try:   # the particle systems are checked where they are read (particle)
                    tree = comp.read_typetree() if tn in COMP_FIELDS else None
                except Exception:
                    tree = None
                self.cov.component(tn, tree)
                continue
            self.cov.component(tn)
            raw = comp.get_raw_data()
            if len(raw) < 28:
                continue
            sid = struct.unpack_from('<q', raw, 20)[0]
            sids.add(sid)
            try:
                tree = comp.read_typetree()
                fields = [k for k in tree if not k.startswith('m_')]
            except Exception:
                tree = fields = None
            self.cov.script(sid, fields, tree)
        return sids

    def prefab(self, root, out):
        nodes, mats, paths = [], {}, {}
        self.gobjs = {}   # node index -> GameObject (clip bindings named by their component, fx_coverage)
        animators = []
        skinned = []
        no_mat = []   # nodes whose MeshRenderer has no material
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
            emit = self.random_emitter(go)
            if emit:
                node['emit'] = emit
            node.update(self.on_emitters(go))
            node.update(self.pause_scripts(go))
            tr = None
            for c in d['m_Component']:
                comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], go)
                if comp is None:
                    continue
                t = comp.type.name
                # (2026-10-25) a RectTransform (a UI transform: 溯光星源's halo2_skill_01_buff_01) outside a Canvas is placed by
                # its local position, rotation and scale as a Transform is — its anchors only act under a RectTransform parent
                if t in ('Transform', 'RectTransform'):
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
                elif t in ('Animator', 'Animation'):
                    # (2026-10-26, effect bundle W2a) a switched-off one plays nothing (纯烬艾雅法拉 S3's weapon:
                    # its tree shows at once instead of dissolving in) — no script of the client switches it on (enabled)
                    if self.enabled(comp):
                        animators.append((idx, comp))   # Animation: legacy (animator_clips → legacy_clips)
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
                        if tr_t.get('m_SortingLayer', 0):
                            node['trailR']['layer'] = tr_t['m_SortingLayer']   # (2026-10-27, effect bundle V)
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
                            if not (psr_t.get('m_Enabled', 1) and emits(node['_ps'].read_typetree())):
                                m = None
                        if m is not None:
                            mat_key = self.material(m, out, mats)
                        if len(psr_t['m_Materials']) > 1:
                            m2 = self.resolve(psr_t['m_Materials'][1], psr)
                            if m2 is not None:
                                trail_mat = self.material(m2, out, mats)
                    mesh_key, more_meshes = None, []
                    if psr_t.get('m_RenderMode') == 4:
                        # (2026-10-27, effect bundle V) every set slot of m_Mesh..m_Mesh3 (the engine counts the set ones and
                        # picks one per particle): the first is `mesh`, the rest `meshes`
                        for slot in ('m_Mesh', 'm_Mesh1', 'm_Mesh2', 'm_Mesh3'):
                            mo = self.mesh_ref(psr_t.get(slot), psr)
                            if mo is not None:
                                more_meshes.append(self.mesh(mo, out))
                        mesh_key = more_meshes.pop(0) if more_meshes else None
                    ps_o = node.pop('_ps')
                    ps_t = ps_o.read_typetree()
                    shape_mesh = None   # 2026-10-22: a Mesh shape's mesh
                    sh_t = ps_t.get('ShapeModule') or {}
                    if sh_t.get('enabled') and sh_t.get('type') == 6:
                        so = self.mesh_ref(sh_t.get('m_Mesh'), ps_o)
                        if so is not None:
                            shape_mesh = self.mesh(so, out)
                    # a system without a material / an enabled renderer draws nothing (often an empty container)
                    has_trail = ps_t.get('TrailModule', {}).get('enabled') and trail_mat
                    if (mat_key or has_trail) and psr_t.get('m_Enabled', 1):
                        node['ps'] = particle_system(ps_t, psr_t, mat_key, mesh_key, trail_mat, shape_mesh, more_meshes)
                        self.cov.particle(ps_t, psr_t)
                        if not ps_t['VelocityModule']['enabled']:
                            node['_velOff'] = vel_ol(ps_t['VelocityModule'])   # clip_modules
            node.pop('_psr', None)
            if '_mr' in node and '_mf' in node:
                mr = node.pop('_mr').read_typetree()
                mf = node.pop('_mf')
                mo = self.mesh_ref(mf.read_typetree()['m_Mesh'], mf)
                ms = [self.resolve(m, node.get('_ctx', mf)) for m in mr.get('m_Materials') or []]
                if mo is not None and ms and ms[0] is not None:
                    node['mesh'] = {'mesh': self.mesh(mo, out), 'mat': self.material(ms[0], out, mats),
                                    'order': mr.get('m_SortingOrder', 0)}
                    if mr.get('m_SortingLayer', 0):
                        node['mesh']['layer'] = mr['m_SortingLayer']   # (2026-10-27, effect bundle V) as a particle renderer's
                    # (2026-10-26, effect bundle W2a) Unity draws material i with sub-mesh min(i, sub-meshes − 1): the mesh
                    # file's `sub` ranges, and a second material on a one-part mesh draws it once more (水月 S3 start) —
                    # `more` = the materials after the first, null for an empty slot
                    if len(ms) > 1:
                        node['mesh']['more'] = [self.material(m, out, mats) if m is not None else None for m in ms[1:]]
                    # a switched-off renderer draws nothing until a clip switches it on (`mr:enabled`) — no script of the
                    # client turns these on (enabled; 赤刃明霄陈 S1 dao_di_dm, 荒芜拉普兰德's slashes)
                    if not mr.get('m_Enabled', 1):
                        node['mesh']['off'] = 1
                elif mo is not None and ms:
                    no_mat.append(idx)   # checked once the clips are read (no_material)
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
        collide_planes(nodes, gos)
        for k, t in self.sub_delays(root, gos).items():
            nodes[k]['sdelay'] = t
        spawn = self.spawn_location(root)
        clips, sms = [], []
        for aidx, anim in animators:
            clips.extend(self.animator_clips(anim, aidx, nodes, paths, mats, len(clips), sms))
        clip_modules(nodes, clips)
        self.no_material(no_mat, nodes, clips)
        dur = 0
        for n in nodes:
            ps = n.get('ps')
            if ps:
                life = ps['life'] or {}
                lmax = max(life.get('s', 0), life.get('n', 0)) if life.get('m') in (0, 3) else max([k[1] for k in life.get('c', [[0, 1]])] or [1]) * life.get('s', 1)
                dly = (ps['delay'] or {}).get('s', 0)
                dur = max(dur, dly + (ps['dur'] if not ps['loop'] else 2) + lmax)
        first = {sm['states'][sm['def']]['clip'] for sm in sms}
        for i, c in enumerate(clips):
            if 'sm' not in c or i in first:   # a state machine's other states play only when something switches to them
                dur = max(dur, c['len'])
        out_def = {'version': 1, 'name': nodes[0]['name'], 'duration': r4(min(dur, 10)), 'nodes': nodes, 'materials': mats, 'clips': clips}
        if sms:
            out_def['sms'] = sms
            for key, v in self.anim_scripts(root, nodes, sms).items():
                out_def[key] = v
        for key, read in (('rgroup', self.random_group), ('equipFx', self.equip_effects)):
            v = read(root)
            if v:
                out_def[key] = v
        if spawn is not None:
            out_def['spawn'] = spawn
        mount = self.mount_point(root)
        if mount is not None:
            out_def['mount'] = mount
        height = self.overwrite_height(root)
        if height is not None:
            out_def['height'] = height
        face = self.root_face(self.root_effect(root), gos)
        if face:
            out_def['face'] = face
            self.cov.turned_nodes(face['rot'], self.turned_refs(root, gos), [n['name'] for n in nodes])
        finish = self.delay_to_finish(root)
        if finish:
            out_def['finish'] = finish
        life = self.max_lifetime(root)
        if life is not None:
            out_def['maxLife'] = life
        off = self.off_on_finish(root, gos)
        if off:
            out_def['offFinish'] = off
        out_def.update(self.projectile_turn(root, nodes[0].get('rot')))
        out_def.update(self.body_still(nodes[0]['name']))
        main = self.main_ps(root, [n['parent'] for n in nodes], [n['active'] for n in nodes], set(pss.values()),
                            [i for i, n in enumerate(nodes) if n.get('ps')])
        if main is not None:
            out_def['mainPs'] = main
        jitter = self.funnel_hit(root)
        if jitter:
            out_def['jitter'] = jitter
        lod = self.lod_setting(root, gos)
        if lod:
            out_def['lod'] = lod
        follow = self.follow_direction(root)
        if follow:
            out_def['follow'] = follow
        out_def.update(self.owner_follow(root))
        for key, read in (('swFace', self.switch_face), ('three', self.three_face), ('rdir', self.random_direction),
                          ('tileH', self.tile_height)):
            v = read(root)
            if v:
                out_def[key] = v
        right = self.right_effect(root)
        if right:
            out_def['right'] = right
        back = self.switch_back(root)
        if back:
            out_def['back'] = back
        line = self.line_dynamic(root)
        if line:
            out_def['lineDyn'] = line
        else:
            em = self.line_emitter(root)
            if em:
                out_def['lineEm'] = em
        fly = self.fly_location(root)
        if fly:
            out_def['fly'] = fly
        return out_def

    @staticmethod
    def enabled(comp, t=None, raw=None):
        """(2026-10-26, effect bundle W2a) whether a Behaviour / Renderer component is switched on (`m_Enabled`; a
        MonoBehaviour without a type tree: its raw byte 12, after the m_GameObject pointer). A switched-off script runs no
        OnEnable / Update. Official client: the effect code switches on only the root's FxDelay (`Effect.OnBeforePlay`,
        root_effect), a MeshRenderer only through `PauseEffectIf._disableMeshRendererWhenPause` and
        `FxLODSetting.RevertToHighDetail` (its `_disableObjects`), an Animator through none; no prefab with a switched-off
        one has either script, and no clip track switches one on."""
        if t is None and raw is None:
            try:
                t = comp.read_typetree()
            except Exception:
                raw = comp.get_raw_data()
        if t is not None:
            return bool(t.get('m_Enabled', 1))
        return len(raw) < 13 or raw[12] != 0

    def no_material(self, idxs, nodes, clips):
        """(2026-10-26, effect bundle W2a) a MeshRenderer whose material slot is empty (`idxs`) is reported only on a node
        that shows — active, or switched on by a clip: every one so far (克莱门莎 S3 buff, 灵知 S3 buff, 异客 S2 buff, an
        enemy's attack) sits on an inactive node no clip switches on, so the client draws nothing there either; what Unity
        draws for an empty slot that shows is not checked."""
        on = {t['node'] for c in clips for t in c['tracks'] if t['type'] == 1 and t['prop'] == f'attr:{crc32("m_IsActive")}'}
        for i in idxs:
            k, shows = i, True
            while k >= 0:
                if not nodes[k].get('active', True) and k not in on:
                    shows = False
                    break
                k = nodes[k]['parent']
            if shows:
                self.cov.add('field', 'MeshRenderer.m_Materials empty on a node that shows',
                             'the extract draws nothing; what the client draws there is not checked')

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
        """2026-10-10, official client — `LineEffectEmitterDynamic` (`Update` → `_UpdateMountPoint`,
        `_TryUpdateEffects`): every frame each LineRenderer of the effect gets position 0 = its start
        owner's `_startMountPointType` point + `_startPosOffset` and position 1 = its end owner's `_endMountPointType` point +
        `_endPosOffset` (`_tweenEndPosition`: lerped from the start over `_tweenDuration`), and `_startEffect` / `_endEffect`
        follow those two ends; the owners come from the node that made it (`Nodes.CreateLineEffect.Execute`: start =
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

    def line_emitter(self, root):
        """2026-10-23 — client `LineEffectEmitter` (no mount points of its own: a link projectile's `_mainEffect` whose two
        ends the projectile sets — 炎佑 Skill_2 `projectile_enemy_acloon_line` → `enemy_acloon_skill_loop_2_line`): its
        `_startEffect` / `_midEffect` / `_endEffect` names as { start?, mid?, end? }, None without the component or names."""
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
            if '_startEffect' not in t or '_midEffect' not in t or '_startMountPointType' in t:
                continue
            out = {name: t[k] for k, name in (('_startEffect', 'start'), ('_midEffect', 'mid'), ('_endEffect', 'end'))
                   if isinstance(t.get(k), str) and t[k]}
            return out or None
        return None

    def switch_back(self, root):
        """2026-10-10, official client — `SwitchableBackEffect._UpdateFace`: the root's
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
            out = {'effect': t['_backEffect'], 'predict': int(t.get('_predictFaceDirection') or 0), 'oneShot': int(t.get('_oneShot') or 0)}
            if t.get('_useBehaviourPause'):   # (2026-10-27) `_UpdateFace` pauses this one per behaviour, else its shared flag
                out['beh'] = 1
            return out
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

    def fly_location(self, root):
        """(2026-10-21, official client) the client's FlyToPredefinedLocation on the root: { loc, dur, ease, real } — `OnPlay`
 moves the effect from where it was made to the HUD place `_location` (PredefinedLocation: 0 COST = the
        DP counter, 1 CARD, 4 MAX_COST, 8 AUTOCHESS_BOUND_BAR …; BattleController.GetPredefinedLocationPosition: the UI
        element's screen point taken down to the map height) in `_duration` s with DOTween ease `_easeType`, unscaled time
        when `_isIndependentUpdate`, then finishes it (FinishMe); `_inversStartEnd` (fly the other way) is kept as `inv`
        (common_charge_cost_01: COST 0.5 s InQuad). By its field names only; None without one."""
        for _sid, _raw, t in self.monos(root):
            if t is None or '_location' not in t or '_easeType' not in t:
                continue
            out = {'loc': int(t['_location']), 'dur': r4(t.get('_duration') or 0), 'ease': int(t['_easeType']),
                   'real': bool(t.get('_isIndependentUpdate'))}
            if t.get('_inversStartEnd'):
                out['inv'] = True
            if t.get('_ignorePlayerSide'):
                out['anySide'] = True
            return out
        return None

    def funnel_hit(self, root):
        """(2026-10-21, official client) the client's FunnelHitEffect on the root: its `_randomRange` [x, y, z] — `OnPlay` (the
        2026-10-14 EN client) turns the effect to `RandomUtil.RandomDirectionV2()` (a random unit vector of the map plane, x / y
        each `Random.value` × 2 − 1, normalised) through `Effect.Behaviour.FaceTo`, then moves the effect's transform
        by `RandomUtil.RandomVector3(_randomRange)` (`Random.Range(−r, r)` per axis) in world space — a drone hit at a
        random point around its target (耶拉 S2 kjera_token_skill_02_hit_*; 流明 S2 lumen_skill_02_hit has a zero range — only
        the random facing). By its field names; None without one."""
        for sid, _raw, t in self.monos(root):
            if sid != FUNNEL_HIT_SCRIPT:
                continue
            if t is None or not isinstance(t.get('_randomRange'), dict):
                self.cov.reader('FunnelHitEffect', False, 'no type tree: nothing read')
                return None
            return [r4(t['_randomRange'].get(k) or 0) for k in ('x', 'y', 'z')]
        return None

    def lod_setting(self, root, gos):
        """(2026-10-23, official client) the root's FxLODSetting (`Effect.Awake`: GetComponent on the effect's own object; every
        one of the extracted prefabs is there) as { off: [node], ps: [[node, percentage]] }, or None. The client applies it
        only on a device whose grading has HIGH_LEVEL_EFFECT off (`Effect.OnAllocate` → `ApplyLowDetail`), or when the
        activity's ParticleEffectManagerConfig `forceUseLowDetailFx` (battle_misc_table: act1vhalfidle only, not
        act2autochess) — `_disableObjects` are switched off (SetActive false, their Renderer disabled) and each
        `_particleDetailsHookers` system's emission rate (constant / curve multiplier) and burst counts are multiplied by
        `_detailPercentage` (ParticleDetailsHooker.ApplyLowDetailPS). render/fxplayer.js applies it at quality 'medium'.
        By its field names only (`gos`: GameObject / Transform PathID → node index; a ParticleSystem by its GameObject)."""
        for sid, _raw, t in self.monos(root):
            if sid != LOD_SCRIPT:
                continue
            if t is None or '_disableObjects' not in t:
                self.cov.reader('FxLODSetting', False, 'no type tree: nothing read')
                return None
            off = sorted({gos[x['m_PathID']] for x in t.get('_disableObjects') or []
                          if isinstance(x, dict) and not x.get('m_FileID') and x.get('m_PathID') in gos})
            ps = []
            for h in t.get('_particleDetailsHookers') or []:
                ptr = (h or {}).get('_particle') or {}
                comp = self.resolve(ptr, root) if ptr.get('m_PathID') and not ptr.get('m_FileID') else None
                k = gos.get(comp.read_typetree()['m_GameObject']['m_PathID']) if comp is not None else None
                if k is not None:
                    ps.append([k, r4(h.get('_detailPercentage', 1))])
            out = {}
            if off:
                out['off'] = off
            if ps:
                out['ps'] = ps
            return out or None
        return None

    def follow_direction(self, root):
        """(2026-10-22, official client) the client's FollowDirection on the root (every one of the pool's is there): which
        direction `_FollowDirection` (the 2026-10-14 EN client) turns the effect to through `Effect.Behaviour.FaceTo` —
        when it plays (`OnPlay`, over the direction it was played with) and every frame after (`Update`)
        unless `_onlyFollowOnPlay` — from its owner (`Behaviour.owner`), the first set of:
            `_useFourDir`                   'four'  the owner's `faceTo` (Entity.m_faceTo: an attack turns it to its target)
            `_useOwnerDirection`            'owner' SharedConsts.FOUR_WAYS[the owner's `direction`] (its deploy direction)
            `_useOwnerMoveDirection`        'move'  an enemy's move direction (`_useDirectionLerp`: eased over `_lerpDuration`)
            `_useFaceToInsteadOfFaceVector` 'faceTo' LEFT when `faceTo`.x (× −1 with `_leftIsDefault`) < 0 (≤ 0 with
                                                     `_flipWhenFaceToVertical`), else RIGHT
            `_useFaceSwitcherFaceLORR`      'lorr'  the owner's `faceLOrR` (LEFT / RIGHT as drawn): without `_leftIsDefault`
                                                     LEFT → RIGHT and RIGHT → LEFT, with it as it is
            none                            'face'  the owner's `faceVector` (× −1 with `_leftIsDefault`)
        { src, left?, vflip?, once?, lerp? } by its field names; None without one."""
        for sid, _raw, t in self.monos(root):
            if sid != FOLLOW_DIRECTION_SCRIPT:
                continue
            if t is None or '_useFourDir' not in t:
                self.cov.reader('FollowDirection', False, 'no type tree: nothing read')
                return None
            src = next((k for f, k in (('_useFourDir', 'four'), ('_useOwnerDirection', 'owner'), ('_useOwnerMoveDirection', 'move'),
                                       ('_useFaceToInsteadOfFaceVector', 'faceTo'), ('_useFaceSwitcherFaceLORR', 'lorr'))
                        if t.get(f)), 'face')
            out = {'src': src}
            if t.get('_leftIsDefault') and src in ('face', 'faceTo', 'lorr'):
                out['left'] = 1
            if t.get('_flipWhenFaceToVertical') and src == 'faceTo':
                out['vflip'] = 1
            if t.get('_onlyFollowOnPlay'):
                out['once'] = 1
            if t.get('_useDirectionLerp') and src == 'move':
                out['lerp'] = r4(t.get('_lerpDuration') or 0)
            return out
        return None

    def owner_follow(self, root):
        """(2026-10-25, official client) the field-less FollowOwner / FollowOwnerRootTileHeight on the root:
            `followOwner`  FollowOwner (`Update` → `_FollowEntity`, while its owner is valid) puts the effect at its owner's
                           point for its `_spawnLocation` every frame: 1 foot, 2 hit, 3 muzzle with the muzzle's rotation,
                           4 head, 5 the owner's place with its rotation, 6 muzzle; any other value: left where it is
            `rootTile`     FollowOwnerRootTileHeight (`OnPlay`, `LateUpdate` → `_FollowRootTileHeight`) sets its local height so
                           that it stays at its owner's map-position height (the tile it stands on) however the owner is raised
        { followOwner?: 1, rootTile?: 1 }."""
        out = {}
        for sid, _raw, t in self.monos(root):
            if isinstance(t, dict) and t.get('m_Enabled') == 0:
                continue
            if sid == FOLLOW_OWNER_SCRIPT:
                out['followOwner'] = 1
            elif sid == ROOT_TILE_SCRIPT:
                out['rootTile'] = 1
        return out

    def turned_refs(self, root, gos):
        """(2026-10-26, effect bundle W1, fx_coverage turned_nodes) the node indices the root ParticleEffect's `_rotationY` /
        `_rotationZ` reference (`gos`: GameObject / Transform PathID → node index), None for an unset one."""
        for sid, _raw, t in self.monos(root):
            if sid == PARTICLE_EFFECT_SCRIPT and t is not None:
                ref = lambda p: gos.get(p.get('m_PathID')) if isinstance(p, dict) and p.get('m_PathID') and not p.get('m_FileID') else None
                return {f: ref(t.get(f)) for f in ('_rotationY', '_rotationZ')}
        return {}

    def root_script(self, root, script, name, field):
        """The type tree of the root's MonoBehaviour of MonoScript `script` (None without one, or without its type tree — the
        report then says so for `name`; `field` is a field it must have)."""
        for sid, _raw, t in self.monos(root):
            if sid != script:
                continue
            if t is None or field not in t:
                self.cov.reader(name, False, 'no type tree: nothing read')
                return None
            return t
        return None

    def switch_face(self, root):
        """(2026-10-22, official client) the client's SwitchableEffectByFaceDirection on the root: { up?, down?, left?, oneShot?,
        beh? } — `_UpdateFace` (the 2026-10-14 EN client, from `OnPlay` only) reads its owner's `faceDirection`
        (MapUtil.ParseDirection of `faceTo`) as it plays: DOWN with `_downEffect`, UP with `_upEffect`, LEFT with `_leftEffect`
        pauses this effect and creates that one on the owner, played with its faceVector; `_oneShot` then finishes this one
        (the copy lives on by itself), else `OnFinish` finishes the copy with it; `_useBehaviourPause` pauses per
        behaviour. 新约能天使's attack / skill starts (`_down` copies only). By its field names; None without a copy."""
        t = self.root_script(root, SWITCH_FACE_SCRIPT, 'SwitchableEffectByFaceDirection', '_downEffect')
        if t is None:
            return None
        out = {k: t[f] for k, f in (('up', '_upEffect'), ('down', '_downEffect'), ('left', '_leftEffect')) if isinstance(t.get(f), str) and t[f]}
        if not out:
            return None
        if t.get('_oneShot'):
            out['oneShot'] = 1
        if t.get('_useBehaviourPause'):
            out['beh'] = 1
        return out

    def three_face(self, root):
        """(2026-10-22, official client) the client's SwitchableThreeFaceEffect on the root: { up?, down?, check?, start? } —
        `OnPlay` creates both copies on the owner paused when `_createEffectOnStart` (`_CreateEffectOnStart`),
        then `_UpdateFace` (again every frame from `Update` until it finishes) shows the up
        copy while the owner's `faceToBack` (its Back model), the down copy while its `faceToDown` (a ThreeFaceAnimator's
        `_down` face: CharacterAnimator.activeFace), else this one — the others paused; `_forceCheckInUpdate` re-applies
        it every frame even when nothing changed. 维什戴尔 S3 wisdel_skill_03_start. By its field names."""
        t = self.root_script(root, THREE_FACE_SCRIPT, 'SwitchableThreeFaceEffect', '_upEffect')
        if t is None:
            return None
        out = {k: t[f] for k, f in (('up', '_upEffect'), ('down', '_downEffect')) if isinstance(t.get(f), str) and t[f]}
        if not out:
            return None
        if t.get('_forceCheckInUpdate'):
            out['check'] = 1
        if t.get('_createEffectOnStart'):
            out['start'] = 1
        return out

    def random_direction(self, root):
        """(2026-10-22, official client) the client's RandomDirection on the root: [from x, y, z, to x, y, z] — `OnPlay`,
        when its owner is valid, turns the effect through `Effect.Behaviour.FaceTo` to
        `RandomUtil.RandomVector3(_randomRotationFrom, _randomRotationTo)` (`Random.Range(from, to)` per axis — not
        normalised). 锏 S2 blkkgt_skill_02_hit_2 (−1, −1, 0 → 1, 1, 0). By its field names."""
        t = self.root_script(root, RANDOM_DIRECTION_SCRIPT, 'RandomDirection', '_randomRotationFrom')
        if t is None:
            return None
        v3 = lambda v: [r4((v or {}).get(k) or 0) for k in ('x', 'y', 'z')]
        return v3(t.get('_randomRotationFrom')) + v3(t.get('_randomRotationTo'))

    def tile_height(self, root):
        """(2026-10-22, official client) the client's FollowTileHeight on the root: its `_followTileHeightSpeed` — `_UpdateHeight`
        (from `OnPlay` at once, from `Update` every frame after) moves the effect's world height
        toward the height of the tile under it (MapUtil.GetTileHightByMapPosition of its own position), by at most speed ×
        deltaTime a frame (at once as it plays). 伊内丝's sentry, 圣聆初雪's snow, 凛御银灰 S3's range. None without."""
        t = self.root_script(root, FOLLOW_TILE_HEIGHT_SCRIPT, 'FollowTileHeight', '_followTileHeightSpeed')
        if t is None:
            return None
        return r4(t.get('_followTileHeightSpeed') or 0)

    def random_emitter(self, go):
        """(2026-10-21, official client) the client's RandomEmitter on this GameObject: { effect, count, pre, per, from, to } —
        `_DoEmit` waits `_preDelay` s, then plays `_count` copies of the prefab `_effect`, each at a random
        point of the box `_randomRangeFrom`–`_randomRangeTo` in this GameObject's space (TransformPoint), `_delayPerEffect`
        s apart (common_charge_cost_start_01 → 3 × common_charge_cost_01). By its field names only; None without one."""
        for sid, _raw, t in self.monos(go):
            if sid != RANDOM_EMITTER_SCRIPT:
                continue
            if t is None or not isinstance(t.get('_effect'), str):
                self.cov.reader('RandomEmitter', False, 'no type tree: nothing read')
                return None
            if not t['_effect'] or int(t.get('_count') or 0) <= 0:
                return None
            v3 = lambda v: [r4(v.get(k, 0)) for k in ('x', 'y', 'z')]
            return {'effect': t['_effect'], 'count': int(t['_count']), 'pre': r4(t.get('_preDelay') or 0),
                    'per': r4(t.get('_delayPerEffect') or 0), 'from': v3(t.get('_randomRangeFrom') or {}),
                    'to': v3(t.get('_randomRangeTo') or {})}
        return None

    def on_emitters(self, go):
        """(2026-10-21, official client) the client's OnPlayEmitter / OnFinishEmitter on this GameObject, by their field
        names: { onPlay: { effects, pre, face, clear, srcPos }, onFinish: { effects, face, effPos } } (either may be missing).
        OnPlayEmitter `_OnPlayInternal`: `_instant` → `_DoEmit` now, else (the GameObject active) after
        `_preDelay` s (`<_DoEmitWithPreDelay>d__16`) — `pre` is 0 when instant; `_DoEmit` creates each
        of `_effects` through BattleController.CreateEffect: `_useSourceEffectPos` at this transform's position, else with no
        owner on this transform's parent, else on the owner (with its faceVector when `_useFaceVector`); `_clearWhenFinish`
        keeps them and OnFinish finishes them. OnFinishEmitter `OnFinish` creates `_effects` on the
        owner (faceVector when `_useFaceVector`), or at the effect's map position when `_useEffectPosition`, or with no
        owner on this transform's parent."""
        out = {}
        for sid, _raw, t in self.monos(go):
            if sid not in (ON_PLAY_EMITTER_SCRIPT, ON_FINISH_EMITTER_SCRIPT):
                continue
            what = 'OnPlayEmitter' if sid == ON_PLAY_EMITTER_SCRIPT else 'OnFinishEmitter'
            if t is None or not isinstance(t.get('_effects'), list):
                self.cov.reader(what, False, 'no type tree: nothing read')
                continue
            effects = [e for e in t['_effects'] if isinstance(e, str) and e]
            if not effects:
                continue
            if sid == ON_PLAY_EMITTER_SCRIPT:
                out['onPlay'] = {'effects': effects, 'pre': 0 if t.get('_instant') else r4(t.get('_preDelay') or 0),
                                 'face': bool(t.get('_useFaceVector')), 'clear': bool(t.get('_clearWhenFinish')),
                                 'srcPos': bool(t.get('_useSourceEffectPos'))}
            else:
                out['onFinish'] = {'effects': effects, 'face': bool(t.get('_useFaceVector')),
                                   'effPos': bool(t.get('_useEffectPosition'))}
        return out

    def pause_scripts(self, go):
        """(2026-10-21, official client) the client's effect behaviours on this GameObject that pause or finish the whole effect
        they belong to, by their field names (none of them has a raw fallback: without a type tree nothing is read). A pause
        (`Effect.Behaviour.set_isPaused` → `Effect.set_isPaused` → `ParticleEffect.OnPausedUpdated`)
        switches the effect's particle system GameObject off and pauses it; the unpause switches it on and plays on.
        - `pauseIf` (PauseEffectIf; `GetCheckResult` each frame from `Update`, and at play with `_checkOnPlay`
          — `OnPlay`; `_CheckPause` sets the pause only when some term was checked): { when: [term …],
          all (`_requireAllConditions`: the terms are AND-ed, else OR-ed — `_CombinePauseFlag`), onPlay, meshOff
          (`_disableMeshRendererWhenPause`: the MeshRenderers of the effect off while paused) }. The terms, of the effect's
          owner, in the client's order: { flag } its abnormal flag (`_checkAbnormalFlag`: `_pauseWhenAbnormalFlag` and each
          of `_pauseWhenAbnormalFlags`); { immune } immune to that flag (`_checkAbnormalImmune`); { combo, not } the
          abnormal combo (SLEEPING / SHELTERING; `_checkAbnormalCombo` CHECK_YES / CHECK_NO — `_CheckPauseIfFlag`);
          { mode: [index], not } its unit mode index in the list; { gone } disappeared (`_checkDisappear`); { buff: [key],
          not } holds the buff (`_pauseWhenContainBuffKey`, or any of `_pauseWhenContainBuffKeyList`); { flag, not: 1 }
          lacks the flag (`_checkNotInAbnormalFlag`); { back, not } faces back; { right, not } faces right; { state, not }
          its state id; { bb: [key], not } any of these shared-blackboard bools. Flags by name (ABNORMAL_FLAGS), E_NUM: none.
        - `pauseOther` (PauseAnotherEffect, a list — one per component): [{ effect, pre, update }] — at play (`OnPlay`; after `_preDelay` s:
          `Update`) the owner's buff effect named `effect` (`Entity.GetBuffEffect`) is paused by this one
          (`_OnPause`: `Effect.SetPausedByOthers`) until this one finishes (`OnFinish` → `_OnUnpause`);
          with `_checkUpdate` each frame again (a later one too), and given back while this one is paused itself.
        - `pauseAnim` (PauseEffectWithAnimation; `_CheckPause` each frame): the owner's current animation pauses
          it when `valid` (`_validAnimation`) is given and lacks it, or `invalid` (`_invalidAnimation`) holds it — after
          `pre` (`_delayToPause` > 0) s ÷ the playback speed (`_DoPause`), and `finish` (`_finishIfPause`) finishes
          the effect then; otherwise `restore` (`_noPauseWhenValid`) unpauses it (after `_delayToRestore` > 0 s: `back`).
          `beh` (`_useBehaviourPause`, 2026-10-27): the pause is this behaviour's own (`SetBehaviourPause`), else the
          effect's shared flag (`set_isPaused`) — also on `pauseSpine`.
        - `pauseMove` (PauseEffectIfNotMove; `Update`, 2026-10-25): paused while its owner, an Enemy, is not moving by itself
          (`Enemy.isMovingBySelf` false); an owner that is not an Enemy leaves it as it is.
        - `pauseIdle` (PauseEffectIfNotIdle; `Update`): paused while the owner is not in its idle state
          (`Character.isInIdletState`), and with `_needCheckFaceSwitch` while it faces back (`back`) / front (`front`).
        - `pauseSpine` (PauseEffectIfSpineEvent): { start, invert, anims } — paused at play with `_pauseAtStart` (`OnPlay`);
          the owner's Spine events OnDeactivateEffect / OnActivateEffect (`Entity.Event` 38 / 37 → `_OnPauseEffect`
          / `_OnPlayEffect`) pause / unpause it (`_invertSpineEventMapping` swaps them), and while its
          current animation is none of `anims` (`onlyCheckedAnimations`) it is unpaused (`Update`).
        - `finishIf` (FinishEffectIf; `Update`): { ownerGone, notDummy, animEnd } — finishes the effect when its
          owner is gone (`_finishIfOwnerInvalid`), when its owner is not a dummy (`_finishIfNotDummy`), or when this
          GameObject's Animator (`Awake`) has played its current state's clip once (not a loop, normalized time ≥ 1:
          `_finishIfCurrentAnimFinish`)."""
        out = {}
        for sid, _raw, t in self.monos(go):
            if sid == PAUSE_MOVE_SCRIPT:   # field-less
                if not (isinstance(t, dict) and t.get('m_Enabled') == 0):
                    out['pauseMove'] = 1
                continue
            what = {PAUSE_IF_SCRIPT: 'PauseEffectIf', PAUSE_OTHER_SCRIPT: 'PauseAnotherEffect', PAUSE_ANIM_SCRIPT: 'PauseEffectWithAnimation',
                    PAUSE_IDLE_SCRIPT: 'PauseEffectIfNotIdle', PAUSE_SPINE_SCRIPT: 'PauseEffectIfSpineEvent',
                    FINISH_IF_SCRIPT: 'FinishEffectIf'}.get(sid)
            if what is None:
                continue
            if t is None or (isinstance(t, dict) and t.get('m_Enabled') == 0):
                if t is None:
                    self.cov.reader(what, False, 'no type tree: nothing read')
                continue
            g = lambda k, d=0: t.get(k, d) if t.get(k) is not None else d
            names = lambda v: [x for x in (v or []) if isinstance(x, str) and x]
            if sid == PAUSE_IF_SCRIPT:
                out['pauseIf'] = self.pause_if(t)
            elif sid == PAUSE_OTHER_SCRIPT:
                if isinstance(t.get('_effect'), str) and t['_effect']:   # a list: 泥岩's mudrok_buff_01_start holds two
                    out.setdefault('pauseOther', []).append({'effect': t['_effect'], 'pre': r4(max(0, float(g('_preDelay')))),
                                                             'update': bool(g('_checkUpdate'))})
            elif sid == PAUSE_ANIM_SCRIPT:
                v = {'valid': names(t.get('_validAnimation')), 'invalid': names(t.get('_invalidAnimation')),
                     'finish': bool(g('_finishIfPause')), 'restore': bool(g('_noPauseWhenValid')),
                     'pre': r4(max(0, float(g('_delayToPause')))), 'back': r4(max(0, float(g('_delayToRestore')))),
                     'beh': bool(g('_useBehaviourPause'))}
                out['pauseAnim'] = {k: x for k, x in v.items() if x not in ([], 0, False)}
            elif sid == PAUSE_IDLE_SCRIPT:
                face = bool(g('_needCheckFaceSwitch'))
                out['pauseIdle'] = {'back': face and bool(g('_pauseWhenBack')), 'front': face and bool(g('_pauseWhenFront'))}
            elif sid == PAUSE_SPINE_SCRIPT:
                out['pauseSpine'] = {'start': bool(g('_pauseAtStart')), 'invert': bool(g('_invertSpineEventMapping')),
                                     'anims': names(t.get('onlyCheckedAnimations'))}
                if g('_useBehaviourPause'):
                    out['pauseSpine']['beh'] = True
            else:
                v = {'ownerGone': bool(g('_finishIfOwnerInvalid')), 'notDummy': bool(g('_finishIfNotDummy')),
                     'animEnd': bool(g('_finishIfCurrentAnimFinish'))}
                if any(v.values()):
                    out['finishIf'] = v
        return out

    @staticmethod
    def pause_if(t):
        """pause_scripts' `pauseIf` of one PauseEffectIf type tree (the terms in GetCheckResult's order)."""
        g = lambda k, d=0: t.get(k) if t.get(k) is not None else d
        flag = lambda v: ABNORMAL_FLAGS[v] if 0 <= v < len(ABNORMAL_FLAGS) else v
        check = lambda k: int(g(k)) in (1, 2)   # PauseEffectIf.CheckType: NOT_CHECK 0, CHECK_YES 1, CHECK_NO 2
        nope = lambda k: {'not': 1} if int(g(k)) == 2 else {}
        when = []
        if g('_checkAbnormalFlag'):
            for v in [int(g('_pauseWhenAbnormalFlag'))] + [int(x) for x in g('_pauseWhenAbnormalFlags', []) or []]:
                if v != ABNORMAL_NONE:
                    when.append({'flag': flag(v)})
        if g('_checkAbnormalImmune') and int(g('_pauseWhenAbnormalImmune')) != ABNORMAL_NONE:
            when.append({'immune': flag(int(g('_pauseWhenAbnormalImmune')))})
        if check('_checkAbnormalCombo'):
            c = int(g('_pauseWhenAbnormalCombo'))
            when.append({'combo': ABNORMAL_COMBOS[c] if 0 <= c < len(ABNORMAL_COMBOS) else c, **nope('_checkAbnormalCombo')})
        if check('_checkUnitModeIndex'):
            when.append({'mode': [int(x) for x in g('_pauseWhenModeIndexList', []) or []], **nope('_checkUnitModeIndex')})
        if g('_checkDisappear'):
            when.append({'gone': 1})
        if check('_checkContainBuff'):
            keys = [x for x in g('_pauseWhenContainBuffKeyList', []) or [] if isinstance(x, str)]
            when.append({'buff': keys or [str(g('_pauseWhenContainBuffKey', '') or '')], **nope('_checkContainBuff')})
        if g('_checkNotInAbnormalFlag') and int(g('_pauseWhenNotInAbnormalFlag')) != ABNORMAL_NONE:
            when.append({'flag': flag(int(g('_pauseWhenNotInAbnormalFlag'))), 'not': 1})
        if check('_checkFaceToBack'):
            when.append({'back': 1, **nope('_checkFaceToBack')})
        if check('_checkFaceToRight'):
            when.append({'right': 1, **nope('_checkFaceToRight')})
        if check('_checkState'):
            when.append({'state': int(g('_pauseWhenCharState')), **nope('_checkState')})
        if check('_checkCharacterSharedBlackboardKey'):
            when.append({'bb': [x for x in g('_characterSharedBlackboardKeyList', []) or [] if isinstance(x, str)], **nope('_checkCharacterSharedBlackboardKey')})
        out = {'when': when}
        for k, f in (('all', '_requireAllConditions'), ('onPlay', '_checkOnPlay'), ('meshOff', '_disableMeshRendererWhenPause')):
            if g(f):
                out[k] = True
        return out

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
        float `_delayTime`: the GameObject starts `_delayTime` ÷ the playback speed later — `FxDelay.OnEnable`)
        by its MonoScript (FXDELAY_SCRIPT)."""
        pe, delay = None, None
        for sid, raw, t in self.monos(root):
            if sid == FXDELAY_SCRIPT:
                v = self.fx_delay_tree(t) if t is not None else self.fx_delay_raw(raw)
                if v is not None:
                    # (2026-10-26, official client) switched off or not: `Effect.Awake` keeps the root's own FxDelay and
                    # `Effect.OnBeforePlay` switches it on as the effect plays (a child's switched-off one stays off: fx_delay)
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
        bt = t.get('_bodyTransofrm') or {}
        pe['bodyT'] = 0 if bt.get('m_FileID') else int(bt.get('m_PathID') or 0)
        return pe

    @staticmethod
    def root_effect_raw(raw):
        """root_effect's raw fallback (the ParticleEffect's script type tree was not in the bundles until the 2026-10-14 client
        update). After the MonoBehaviour header and name: ints #0–#2, #3 = the length n of `_subFXDelayConfigs` (4 ints an
        entry), then from s = 4 + 4n the fields in the order the client declares them — s `_delayToPlay`, s+1 `_delayToFinish`,
        s+2 `_maxLifetime`, s+3 `_randomPlayDelay`, s+4 `_autoReuse`, s+5 `_usePlaybackSpeed`, s+6 `_limitedPlaybackSpeed`,
        s+8 `_rotateType`, s+9 `_spawnLocation`, s+10 `_leftIsDefault`, s+11 `_useBodyRotation`, s+12 `_mainDir`, s+13
        `_holdByOwner`, s+14 `_overwriteHeight`, s+15 `_heightOffset`. (2026-10-11, official client: the component
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
        return {'delayToPlay': f(s), 'delayToFinish': f(s + 1), 'maxLife': life, 'randomDelay': i(s + 3), 'useSpeed': i(s + 5), 'limited': f(s + 6), 'rotate': i(s + 8 + x),
                'spawn': i(s + 9 + x), 'leftIsDefault': i(s + 10 + x), 'body': i(s + 11 + x), 'mainDir': i(s + 12 + x), 'hold': i(s + 13 + x),
                'overwrite': i(s + 14 + x),
                'heightOffset': f(s + 15 + x),
                # (2026-10-23) the Effect base's `_bodyTransofrm` (PPtr: m_FileID int, m_PathID int64) — words #0–#2
                'bodyT': 0 if i(0) else struct.unpack_from('<q', b, 4)[0],
                # `_subFXDelayConfigs` (2026-10-11): { GameObject PPtr (m_FileID int, m_PathID int64), delayTime float } each
                'subs': [(i(4 + 4 * k), struct.unpack_from('<q', b, 4 * (5 + 4 * k))[0], f(7 + 4 * k)) for k in range(subs)]}

    def fx_delay(self, go):
        """(maintainer decision 2026-10-11) the `_delayTime` of a FxDelay component on this GameObject (MonoScript
        FXDELAY_SCRIPT; `FxDelay.OnEnable` hides the GameObject and shows it `_delayTime` ÷ its playback speed
        later — a child's own FxDelay keeps the default speed 1.0 [추정: only the root's is set by `Effect.UpdatePlaybackSpeed`]),
        rounded; None without one or ≤ 0. 텍사스 디 오메르토사 S2 texas2_birth_02_start: its four slashes 0 / 0.1 / 0.15 / 0.3.
        (2026-10-20) By its field name, the raw word without a type tree."""
        for sid, raw, t in self.monos(go):
            if sid != FXDELAY_SCRIPT or not self.enabled(None, t, raw):   # (2026-10-26) switched off: no OnEnable (위셔델 S2)
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
        speed later (`Effect.UpdatePlaybackSpeed` sets `delayRuntime`). 티티 S3 titi_skill_03_hit_02, 왕 wang_birth_01 / _02."""
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
        """2026-10-14, official client — the GameObject's Torappu.Fx.FxUVTweener / FxUVTweenerAdvance (`Update`):
        every frame its renderer's material moves the offset of `_MainTex` (xspeed, yspeed), of
        `secondMapName` (secondXSpeed, secondYSpeed; `useSecondMap`) and, for Advance, of each enabled `extraMapSettings`
        texture (XSpeed, YSpeed) by 2 × speed × dt (SPEED_SCALE 2; a texture with both speeds 0 is not touched); `OnEnable`
        starts the offsets from the material's own with `keepInitOffset`, else from 0; an Advance without `tweenRepeat` stops
        after `tweenAnmTime` s. Read by the component's type tree (found by its fields, not its script id): { maps:
        [[texture, 2·sx, 2·sy, 1 when the offset keeps its fraction?], …], keep?, until? }, None without one. Drawn by
        render/fxplayer.js uvTween."""
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
            if not t.get('m_Enabled', 1):   # (2026-10-26, effect bundle W2a) switched off: no Update (跃跃's trails, 水月 S3 start)
                return None
            # (2026-10-22, official client) the offset each frame keeps only its fraction (x − floorf(x)): FxUVTweener's
            # `_MainTex` with `protectMainUV`, its second map with `protectSecondUV` (`Update`), every map of
            # an Advance with `tweenRepeat` — the same on a repeating texture, not on a Clamp one (tex/wrap.json):
            # the map's 4th field 1
            adv = 'tweenRepeat' in t
            rep = 1 if adv and t.get('tweenRepeat') else 0
            maps = [('_MainTex', t.get('xspeed'), t.get('yspeed'), rep if adv else int(bool(t.get('protectMainUV'))))]
            if t.get('useSecondMap') and isinstance(t.get('secondMapName'), str) and t['secondMapName']:
                maps.append((t['secondMapName'], t.get('secondXSpeed'), t.get('secondYSpeed'), rep if adv else int(bool(t.get('protectSecondUV')))))
            for e in t.get('extraMapSettings') or []:
                if e.get('enabled') and isinstance(e.get('mapName'), str) and e['mapName']:
                    maps.append((e['mapName'], e.get('XSpeed'), e.get('YSpeed'), rep))
            maps = [[n, r4(2 * float(x or 0)), r4(2 * float(y or 0))] + ([1] if fr else []) for n, x, y, fr in maps if float(x or 0) or float(y or 0)]
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
        """(2026-10-14, official client) the GameObject's Torappu.Fx.FxUVRotation: `Update` writes the float
        _HG_UV_ROTATION = 1 into the renderer's property block (the shader turns the uv when it is above 0.5 — a branch, not a
        keyword; 2026-10-26) and `<_propertyName>0..3`, from the identity (1, 0, 0, 1) (the class's static,
        `.cctor`); each enabled one (`_rotateTex1..4`) is `_CalculateMatrix`
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
            if not t.get('m_Enabled', 1):   # (2026-10-26, effect bundle W2a) switched off: no Update (深巡 S2 buff)
                return None
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
        """(2026-10-10, official client — `Effect._InitLocationFromEntity`: with
        `_overwriteHeight` the effect's height becomes the entity's height + `_heightOffset`): the root effect component's
        `_overwriteHeight` / `_heightOffset` (root_effect). The offset when it is on (쏜즈 더 로드스타 S1
        thorn2_skill_01_range: 0.0), else None."""
        pe = self.root_effect(root)
        return r4(pe['heightOffset']) if pe and pe['overwrite'] == 1 else None

    @staticmethod
    def root_face(pe, gos=None):
        """(2026-10-11, official client) the root effect's playback fields: `ParticleEffect.FaceTo` turns by
        `_rotateType` (0 NONE: never mirrored, 1 FLIP_TWO_SIDE: 'rotation_y' / 'rotation_z' 180° when facing left — right with
        `_leftIsDefault`, 2 FOUR_DIRECTION from `_mainDir`, 3 FIXED_DIRECTION, 4 ANY_DIR); `Effect.Play` turns it to
        its entity's own four-way direction instead of the given one with `_useBodyRotation` (`body`); `Effect._PlayInternal`
        uses the playback speed only with `_usePlaybackSpeed`, caps it at `_limitedPlaybackSpeed` ÷ the time scale
        (≥ 0) and waits `_delayToPlay` (random up to it with `_randomPlayDelay`); FxDelay starts the whole effect `_delayTime` ÷
        the speed later. Drawn by render/fxplayer.js FxInstance (maintainer decisions 2026-10-11, docs/rules/fx.md 「좌우 거울·재생
        속도·루트 지연」). (2026-10-22, official client) `_holdByOwner` (`hold`): `Effect._InitLocationFromEntity` (the 2026-10-14 EN
        client) ends with `Entity.HoldEffect`, which parents the effect to its entity's `effectTransform`
        (Unit `_effectTransform`: the `Effects` child of the unit's root, not of its model) keeping its place — it moves with
        the unit from where it was created; without it the effect stays there. (2026-10-23, official client) ANY_DIR turns
        the Effect base's `_bodyTransofrm` (`Effect.get_bodyTransform`; MapUtil.FaceTo2d), a Transform the prefab names —
        `bodyNode`, its node index (`gos`: PathID → node index). { rot, left?, body?, dir?, hold?, speed? (0 = ignores the
        playback speed), limit? (≠ 2), delay?, rnd?, fxDelay?, bodyNode? } or None."""
        if not pe:
            return None
        o = {'rot': pe['rotate']}
        if pe['leftIsDefault']:
            o['left'] = 1
        if pe.get('body'):
            o['body'] = 1
        if pe['rotate'] in (2, 3):
            o['dir'] = pe['mainDir']
        if pe['rotate'] == 4 and gos and pe.get('bodyT') in gos:
            o['bodyNode'] = gos[pe['bodyT']]
        if pe.get('hold'):
            o['hold'] = 1
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
        """2026-10-11: rewrite only the root effect fields — `spawn`, `height` and `face` (root_effect / root_face), and
        (2026-10-22) the FollowDirection `follow`, the face switches `swFace` / `three`, the RandomDirection `rdir` and the
        FollowTileHeight `tileH` — of the bundle's already extracted prefabs, like back_only (the spawn
        recognition fix: 51 bound prefabs gain a `spawn`).
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
                    'face': self.root_face(pe, self.tree_ids(go)[1] if pe and pe['rotate'] == 4 else None),
                    'follow': self.follow_direction(go), 'swFace': self.switch_face(go),
                    'three': self.three_face(go), 'rdir': self.random_direction(go), 'tileH': self.tile_height(go) or None}
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

    def max_lifetime(self, root):
        """(2026-10-27, official client) the root ParticleEffect's `_maxLifetime` when it is ≥ 0, else None (−1: no limit).
        `ParticleEffect.OnEnable` starts `_CheckIfAlive`, which with `_maxLifetime` ≥ 0 waits that many seconds of real time
        (WaitForSecondsRealtime) and finishes the effect (`FinishMe(false)`) — 灵知's talent buff ends 2 s after it shows
        however long its systems loop."""
        pe = self.root_effect(root)
        v = pe.get('maxLife') if pe else None
        return r4(v) if v is not None and math.isfinite(v) and 0 <= v <= 600 else None

    def delay_to_finish(self, root):
        """(2026-10-11, official client — `Effect.FinishMe`: an effect being finished (a buff ending,
        `Entity.RemoveBuffEffect`) stops its parts and is recycled `delayToRecycle` s later, which a
        ParticleEffect returns as its `_delayToFinish` — `ParticleEffect.get_delayToRecycle`): the root effect
        component's `_delayToFinish` (root_effect). buff_stun 0, buff_slowdown 0.5, buff_cold 0.06. None when the
        component is not found. (2026-10-11) A projectile's `_mainEffect` has a ProjectileEffect root instead
        (projectile_effect): its `_delayToFinish` too — `ProjectileEffect.get_delayToRecycle`."""
        pe = self.root_effect(root)
        v = pe['delayToFinish'] if pe else None
        if pe is None:
            pj = self.projectile_effect(root)
            v = pj['delayToFinish'] if pj else None
        if pe is None and v is None:
            # (2026-10-21) an EmptyEffect root (no particles of its own: lines, emitters, wrappers): its `_delayToFinish` too
            # — `EmptyEffect.get_delayToRecycle`
            for sid, _raw, t in self.monos(root):
                if sid == EMPTY_EFFECT_SCRIPT and t is not None and t.get('_delayToFinish') is not None:
                    v = float(t['_delayToFinish'])
        return r4(v) if v is not None and math.isfinite(v) and 0 <= v <= 60 else None

    def projectile_effect(self, root):
        """(2026-10-11, official client — the maintainer report 「투사체가 늦게 사라짐」) the root's ProjectileEffect component
        (PROJECTILE_EFFECT_SCRIPT; `Torappu.Battle.Effects.ProjectileEffect`, the root of a projectile's `_mainEffect`) as
        { delayToFinish, off: [Transform PathID …] }, or None. The client finishes that effect when its projectile stops
        (`Projectile.OnProjectileStop` → `ClearMainEffectIfNot` → `Effect.FinishMe`):
        `ProjectileEffect.OnFinish` stops its first particle system with its children (`Awake`:
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
                'off': [int(p.get('m_PathID') or 0) for p in t['_inactiveOnFinish'] or [] if not p.get('m_FileID')],
                'reset': bool(t.get('_resetMainDir')), 'mainDir': int(t.get('_mainDir') or 0),
                'rotate180Y': bool(t.get('_rotate180Y')), 'randomAngle': float(t.get('_randomAngle') or 0)}

    @staticmethod
    def projectile_raw(raw):
        """projectile_effect's raw fallback. The fields after the MonoBehaviour name (serialized order): the Effect base
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
                'off': [struct.unpack_from('<q', b, 4 * (s + 10 + 3 * k))[0] for k in range(a) if i(s + 9 + 3 * k) == 0],
                'reset': bool(i(s) & 0xff), 'mainDir': i(s + 1), 'rotate180Y': bool(i(s + 2) & 0xff),
                'randomAngle': struct.unpack_from('<f', b, 4 * (s + 3))[0]}

    def projectile_turn(self, root, rot):
        """(2026-10-27, effect bundle W2b, official client) how a ProjectileEffect root (projectile_effect) is turned on its
        projectile's body each time it plays — `ProjectileEffect.OnBeforePlay`: with `_resetMainDir` and a `_mainDir` other
        than UP its localRotation becomes Euler(0, `_rotate180Y` ? 180 : 0, `_mainDir` · 90) (its own rotation `rot` is
        dropped; UP leaves it, 180Y included), then a `_randomAngle` ≠ 0 rolls it about its own x axis by
        Random.Range(0, `_randomAngle`). The body's +y is the flight direction (`MapUtil.FaceTo2d` / `FaceTo3dUpwardMajor`).
        {'mainRot': the Unity quaternion [x, y, z, w] on the body, 'roll': degrees (only ≠ 0)}, or {} for another root."""
        pj = self.projectile_effect(root)
        if pj is None:
            return {}
        if pj['reset'] and pj['mainDir'] != 0:
            hy, hz = math.radians(180 if pj['rotate180Y'] else 0) / 2, math.radians(pj['mainDir'] * 90) / 2
            sy, cy, sz, cz = math.sin(hy), math.cos(hy), math.sin(hz), math.cos(hz)
            q = [sy * sz, sy * cz, cy * sz, cy * cz]   # Unity Euler order: qY · qX · qZ
        else:
            q = list(rot or [0, 0, 0, 1])
        out = {'mainRot': [r4(v) + 0.0 for v in q]}
        a = pj['randomAngle']
        if math.isfinite(a) and abs(a) > 1e-6:
            out['roll'] = r4(a)
        return out

    def body_still(self, name):
        """(2026-10-27, effect bundle W2b-2, official client) whether the projectile body a `_mainEffect` sits on
        (projectile_turn) stays unturned: `BasicMovement.RotateToCertainDirection` does nothing without `_rotateToTarget`,
        `OnInitPose` is one `OnTick(0)` through it, `BattleFactory.CreateProjectile` takes the projectile from the pool and
        parents it without touching its rotation, and every projectile prefab's root and `_bodyTransform` are unrotated —
        so such a body keeps the board's frame (its +y the board's UP) whichever way it flies. {'still': 1} when no
        projectile that carries the prefab turns, {'stillBy': [the keys of those that do not]} when only some do (引星棘刺's
        thorn2_attack_trail: her normal attack turns, S1–S3 do not), else {}."""
        if self.carriers is None:
            self.carriers = projectile_carriers(self.game)
        c = self.carriers.get(str(name).lower()) or {}
        keys = sorted(k for k, turn in c.items() if not turn)
        if not keys:
            return {}
        return {'still': 1} if len(keys) == len(c) else {'stillBy': keys}

    def still_only(self, bundle, index):
        """2026-10-27: write only the `still` / `stillBy` (body_still) of the bundle's already extracted prefabs — by their
        names, the bundle itself is not read; a prefab the other client wrote (`index` sources) is left to that client's run.
        Returns (prefabs with one, files changed)."""
        src = index.get('sources') or {}
        found = changed = 0
        for f in sorted((OUT / bundle).glob('*.json')):
            if (src.get(f'{bundle}/{f.stem}') or {}).get('client', 'en') != self.client:
                continue
            d = json.loads(f.read_text())
            want = self.body_still(d.get('name') or f.stem)
            found += bool(want)
            if all(d.get(k) == want.get(k) for k in ('still', 'stillBy')):
                continue
            for k in ('still', 'stillBy'):
                if k in want:
                    d[k] = want[k]
                else:
                    d.pop(k, None)
            f.write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False))
            changed += 1
        print(f'[fx] {bundle}: {found} prefab(s) on a body that may stay unturned, {changed} file(s) changed')
        return found, changed

    def off_on_finish(self, root, gos):
        """(2026-10-11) the node indices of the ProjectileEffect's `_inactiveOnFinish` (projectile_effect; `gos`: GameObject /
        Transform PathID → node index), sorted, or None: switched off the moment its projectile stops. (2026-10-21, official
        client) A ParticleEffect root's own `_inactiveOnFinish` the same: `ParticleEffect.OnFinish` (the 2026-10-14 EN
        client) stops its first system and `SetActiveIfNecessary(false)` on each — by its field names only (the EN and CN
        clients' type trees read since 2026-10-16)."""
        pj = self.projectile_effect(root)
        ids = (pj or {}).get('off') or []
        if pj is None:
            for _sid, _raw, t in self.monos(root):
                if t is not None and all(f in t for f in ROOT_EFFECT_FIELDS.values()) and isinstance(t.get('_inactiveOnFinish'), list):
                    ids = [int(x.get('m_PathID') or 0) for x in t['_inactiveOnFinish'] if isinstance(x, dict) and not x.get('m_FileID')]
                    break
        off = sorted({gos[p] for p in ids if p in gos})
        return off or None

    def main_ps(self, root, parents, actives, ps_nodes, drawn):
        """(2026-10-21, official client) the node index of the particle system the client stops when it finishes this effect,
        when it is not the one render/fxplayer.js FxInstance.finishMain takes by itself (the first extracted system of an
        active node) — else None. `parents` / `actives`: the nodes' parent index and m_IsActive, `ps_nodes`: the nodes with a
        ParticleSystem component (also those the walk drops: no material, a disabled renderer), `drawn`: the extracted ones
        (a list, or False). The client takes it in Awake with GetComponentInChildren<ParticleSystem> (depth first = the walk
        order): `ProjectileEffect.Awake` (the 2026-10-14 EN client) the overload without `includeInactive` (active nodes
        only), `ParticleEffect.Awake` with `includeInactive` true; both OnFinish call
        `ParticleSystem.Stop(true)` (with its children, emission only). So a system without a material can be the
        one stopped (and nothing visible stops), or one under an inactive node (a ParticleEffect's)."""
        if not ps_nodes:
            return None

        def active_in(i):
            while i >= 0:
                if actives[i] is False:
                    return False
                i = parents[i]
            return True
        if self.projectile_effect(root) is not None:
            client = next((i for i in sorted(ps_nodes) if active_in(i)), None)
        elif self.root_effect(root) is not None:
            client = min(ps_nodes)
        else:
            return None
        player = next((i for i in (drawn or []) if active_in(i)), None)
        return client if client is not None and client != player else None

    def tree_ids(self, go):
        """(2026-10-11) the node names of the prefab under `go` in the extractor's walk order and its GameObject / Transform
        PathID → node index map (prefab()'s `gos`), for the *_only rewrites."""
        names, gos = [], {}
        self.tree_more = {'parents': [], 'actives': [], 'ps': set()}   # (2026-10-21) for main_ps

        def walk(g, parent):
            dd = g.read_typetree()
            idx = len(names)
            gos[g.path_id] = idx
            names.append(dd['m_Name'])
            self.tree_more['parents'].append(parent)
            self.tree_more['actives'].append(bool(dd.get('m_IsActive', 1)))
            tr = None
            for c in dd['m_Component']:
                comp = self.resolve(c['component'] if isinstance(c, dict) else c[1], g)
                if comp is not None and comp.type.name == 'Transform':
                    tr = comp.read_typetree()
                    gos[comp.path_id] = idx
                elif comp is not None and comp.type.name == 'ParticleSystem':
                    self.tree_more['ps'].add(idx)
            for ch in (tr or {}).get('m_Children') or []:
                cto = self.resolve(ch, g)
                cgo = self.resolve(cto.read_typetree()['m_GameObject'], cto) if cto is not None else None
                if cgo is not None:
                    walk(cgo, idx)
        walk(go, -1)
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
            want = {'finish': v, 'jitter': self.funnel_hit(go)}
            names, gos = self.tree_ids(go)
            nodes = d.get('nodes') or []
            same = len(nodes) == len(names) and all(n.get('name') == names[k] for k, n in enumerate(nodes))
            if same:
                want['lod'] = self.lod_setting(go, gos)   # (2026-10-23)
            if self.projectile_effect(go) is not None or self.root_effect(go) is not None:
                if same:
                    want['offFinish'] = self.off_on_finish(go, gos)
                    tm = self.tree_more
                    want['mainPs'] = self.main_ps(go, tm['parents'], tm['actives'], tm['ps'], [k for k, n in enumerate(nodes) if n.get('ps')])
                else:
                    print(f'[fx] {bundle}/{f.stem}: node tree differs from the bundle, offFinish / mainPs skipped')
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
        """mount_point's raw fallback: after the header and the empty name, 7 ints in the client's field order
        (MOUNT_FIELDS, bools as ints). The CN client's (newer) component has 9 words: a float (1.0) and an int
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

    def state_machine(self, ct):
        """(2026-10-22, effect bundle J) the controller's first layer as { def, states: [{ name, clip (index into its
        m_AnimationClips or None), speed? }], params: { name: [type, default] }, trans: [{ from (state, -1 = any state), to,
        dur, norm? (a duration in the source state's normalized time), exit? (the exit time, when it has one), offset?,
        cond?: [[param, mode, threshold]] }] } — any-state transitions first (Mecanim checks them first), then each state's
        in the order the controller lists them. A second layer, a blend tree of more than one clip, a speed parameter or a
        transition out of the state machine is not read (the report says so). None without a layer."""
        c = ct.get('m_Controller') or {}
        tos = {int(k): v for k, v in ct.get('m_TOS') or []}
        layers = c.get('m_LayerArray') or []
        if not layers:
            return None
        if len(layers) > 1:
            self.cov.clip('Animator layers past the first')
        sm = c['m_StateMachineArray'][layers[0]['data']['m_StateMachineIndex']]['data']
        sts = [s['data'] for s in sm.get('m_StateConstantArray') or []]
        states = []
        for s in sts:
            clip = None
            for bt in s.get('m_BlendTreeConstantArray') or []:
                bn = bt['data']['m_NodeArray']
                if len(bn) > 1:
                    self.cov.clip('Animator blend tree')
                if bn and bn[0]['data']['m_ClipID'] != 0xFFFFFFFF:
                    clip = bn[0]['data']['m_ClipID']
            st = {'name': tos.get(s['m_NameID'], ''), 'clip': clip}
            if s.get('m_Speed', 1) != 1:
                st['speed'] = r4(s['m_Speed'])
            if s.get('m_SpeedParamID') or s.get('m_TimeParamID'):
                self.cov.clip('Animator state speed / time parameter')
            states.append(st)
        dv = (c.get('m_DefaultValues') or {}).get('data') or {}
        params = {}
        for v in (c.get('m_Values') or {}).get('data', {}).get('m_ValueArray') or []:
            t = PARAM_TYPES.get(v['m_Type'])
            if t is None:
                continue
            arr = dv.get(PARAM_VALUES[v['m_Type']]) or []
            x = arr[v['m_Index']] if v['m_Index'] < len(arr) else 0
            params[tos.get(v['m_ID'], str(v['m_ID']))] = [t, bool(x) if t in ('bool', 'trigger') else (r4(x) if t == 'float' else int(x))]

        def tr(t, frm):
            t = t['data']
            if t['m_DestinationState'] >= len(states):
                self.cov.clip('Animator transition out of the state machine')
                return None
            out = {'from': frm, 'to': t['m_DestinationState'], 'dur': r4(t['m_TransitionDuration'])}
            if not t.get('m_HasFixedDuration', True):
                out['norm'] = True
            if t.get('m_HasExitTime'):
                out['exit'] = r4(t['m_ExitTime'])
            if t.get('m_TransitionOffset'):
                out['offset'] = r4(t['m_TransitionOffset'])
            cond = [[tos.get(x['data']['m_EventID'], str(x['data']['m_EventID'])), COND_MODES[x['data']['m_ConditionMode']],
                     r4(x['data']['m_EventThreshold'])] for x in t.get('m_ConditionConstantArray') or []
                    if x['data']['m_ConditionMode'] in COND_MODES]
            if cond:
                out['cond'] = cond
            return out
        trans = [tr(t, -1) for t in sm.get('m_AnyStateTransitionConstantArray') or []]
        trans += [tr(t, i) for i, s in enumerate(sts) for t in s.get('m_TransitionConstantArray') or []]
        return {'def': min(sm.get('m_DefaultState', 0), max(0, len(states) - 1)), 'states': states, 'params': params,
                'trans': [t for t in trans if t]}

    def animator_clips(self, anim, aidx, nodes, paths, mats, at=0, sms=None):
        """The Animator's clips as tracks over the prefab's nodes. (2026-10-22, effect bundle J) one state: that state's clip
        (it was m_AnimationClips[0], which in 22 of the 26 controllers with more clips is not the default state's — 에이야퍄들라
        더 크비트 아스카 S2's range played its level 2); more states: every clip a state plays, each with `sm` = the index of
        the controller's state_machine in `sms` (appended here, with `node` = the Animator's node and each state's `clip`
        as an index into the prefab's `clips`, which start at `at`)."""
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
        acl = ct.get('m_AnimationClips') or []
        sm = self.state_machine(ct)
        if sm and len(sm['states']) > 1 and sms is not None:
            order = list(dict.fromkeys(s['clip'] for s in sm['states'] if s['clip'] is not None and s['clip'] < len(acl)))
        else:
            d = sm['states'][sm['def']]['clip'] if sm and sm['states'] else None
            order = [d] if d is not None and d < len(acl) else list(range(min(1, len(acl))))
            sm = None
        made = {}   # controller clip index -> index in clips_out
        for k in order:
            cp = acl[k]
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
                if prop is None and node is not None and b.get('customType') != 22:
                    prop = ANIMATED_CRC.get((tid, attr))   # 2026-10-22: a module / trail / renderer / UV tweener value
                if prop is None and node is not None:
                    prop = self.material_prop(attr, nodes[node], mats, lambda: self.node_declared(node)) or f'attr:{attr}'
                if node is not None and prop:
                    tracks.append({'node': node, 'prop': prop, 'type': tid, 'curves': curves[ci:ci + n]})
                if node is None:
                    self.cov.clip('binding to a path outside the Animator')
                elif prop.startswith('attr:') and not (tid == 1 and attr == crc32('m_IsActive')):
                    self.cov.clip(self.binding_name(b, node, nodes[node]))
                ci += n
            made[k] = len(clips_out)
            clips_out.append({'name': clip['m_Name'], 'len': length, 'loop': bool(clip.get('m_MuscleClip', {}).get('m_LoopTime', 0)), 'tracks': tracks})
        if sm:
            for c in clips_out:
                c['sm'] = len(sms)
            for s in sm['states']:
                s['clip'] = at + made[s['clip']] if s['clip'] in made else -1
            sm['node'] = aidx
            sms.append(sm)
        return clips_out

    def anim_scripts(self, root, nodes, sms):
        """(2026-10-22, effect bundle J; the 2026-10-14 EN client) the root's scripts that drive one of the prefab's
        state machines (`sms`) — at the effect's finish (Effect.FinishMe → each behaviour's OnFinish) `animFin`: [{ sm, p, v,
        rec? }] sets parameter `p` to `v` (a trigger: true), or [{ sm, play }] plays state `play` at once (Animator.Play) — `rec`:
        only when the effect waits before it is recycled (`delayToRecycle` > 0, the root's `finish`):
        - TriggerAnimatorWhenFinish (`OnFinish`, `Awake`: GetComponent<Animator>): the trigger `_customKey`,
          or 'OnFinish' (the static `s_finishTrigger`, `.cctor`), `rec`;
        - OnFinishAnime (`Init`: GetComponentInChildren<Animator> — the first under the root, active; `OnFinish`):
          `_isTrigger` → SetTrigger(`_triggerName`), else `_isInt` → SetInteger(name, `_triggerValue` ? 1 : 0),
          else SetBool(name, `_triggerValue`);
        - SwitchAnimatorStateWhenFinish (`OnFinish`, `Awake`: GetComponent<Animator>): Play(`_stateName`), `rec`;
        - SetAnimatorTriggerOnEvent (`OnFinish`; `OnPlay` only Rebinds): `_event` ON_FINISH (0) →
          SetTrigger(`_animatorTriggerName`);
        - SetAnimatorTriggerByCondition (`_UpdateAnimator`: SetTrigger(its source's value) when it changes and is not
          empty) with an AuraProjectileSetAnimatorTrigger source (`GetValue`: `_triggerKey` once `SetTriggerValue`,
          else `_defaultKey`): `aura` — set when the aura projectile stops (ScalableAuraHitBehaviour.OnProjectileStop:
          ThrowEffect — only re-parented — then SetTriggerValue instead of FinishMe), the moment
          render/fxgame.js zoneFx ends the aura (引星棘刺 S2).
        And `animSrc`: [{ sm, p, int, buff, max, prog, def, fin, curve }] — SetAnimatorFloatByCondition (`OnPlay`:
        the source's GetValueOnPlay; `Update`: GetValue, set when it changed; SetInteger of the truncated value with
        `_isInt`, else SetFloat) with a BuffProgressFloatSource (`GetValueOnPlay` = `_defaultVal`; `GetValue`:
        `_finishedVal` once finished, else `_curve`(GetBlackboardProgress: the owner's first buff `_buffKey`, its
        blackboard `_progressKey` ÷ `_maxKey` clamped to [0, 1]); curve keys [time, value, inSlope, outSlope]).
        A script on another node than the root, or on an Animator with one state (nothing to switch), is left out."""
        by_node = {sm['node']: k for k, sm in enumerate(sms)}

        def live(i):
            while i >= 0:
                if nodes[i].get('active') is False:
                    return False
                i = nodes[i]['parent']
            return True
        # GetComponentInChildren: the first in depth-first order (the node order) — only a state machine counts, an
        # Animator with one state ahead of it would take the trigger and switch nothing [추정: none in the clients]
        child = next((by_node[i] for i in sorted(by_node) if live(i)), None)
        own = by_node.get(0)
        fin, src, sources = [], [], []
        by_cond = aura = None
        for sid, _raw, t in self.monos(root):
            if t is None or t.get('m_Enabled') == 0:
                continue
            if sid == TRIGGER_WHEN_FINISH_SCRIPT and own is not None:
                fin.append({'sm': own, 'p': t.get('_customKey') or 'OnFinish', 'v': True, 'rec': True})
            elif sid == ON_FINISH_ANIME_SCRIPT and child is not None:
                name, v = t.get('_triggerName') or '', bool(t.get('_triggerValue'))
                fin.append({'sm': child, 'p': name, 'v': True if t.get('_isTrigger') else (int(v) if t.get('_isInt') else v)})
            elif sid == SWITCH_STATE_WHEN_FINISH_SCRIPT and own is not None:
                names = [s['name'] for s in sms[own]['states']]
                if t.get('_stateName') in names:
                    fin.append({'sm': own, 'play': names.index(t['_stateName']), 'rec': True})
            elif sid == TRIGGER_ON_EVENT_SCRIPT and own is not None and t.get('_event', 0) == 0:
                fin.append({'sm': own, 'p': t.get('_animatorTriggerName') or '', 'v': True})
            elif sid == SET_FLOAT_SCRIPT and own is not None:
                src.append((t, own))
            elif sid == TRIGGER_BY_CONDITION_SCRIPT and own is not None:
                by_cond = True
            elif sid == AURA_TRIGGER_SCRIPT and t.get('_triggerKey'):
                aura = t['_triggerKey']
            elif sid == BUFF_PROGRESS_SCRIPT:
                sources.append(t)
        if by_cond and aura:   # [추정: its `_source` is that aura source — `_autoFindSource` on the one prefab]
            fin.append({'sm': own, 'p': aura, 'v': True, 'aura': True})
        out = {}
        if fin:
            out['animFin'] = fin
        # a curve key's infinite tangent (a stepped key) as null: JSON has no Infinity
        slope = lambda v: r4(v) if isinstance(v, (int, float)) and math.isfinite(v) else None
        for t, k in src:
            s = sources[0] if len(sources) == 1 else None   # the root's one source: what `_source` points at [추정 when more]
            if s is None:
                self.cov.clip('SetAnimatorFloatByCondition without one BuffProgressFloatSource')
                continue
            curve = [[r4(x['time']), r4(x['value']), slope(x['inSlope']), slope(x['outSlope'])] for x in (s.get('_curve') or {}).get('m_Curve') or []]
            out.setdefault('animSrc', []).append({'sm': k, 'p': t.get('_paramName') or '', 'int': bool(t.get('_isInt')),
                                                  'buff': s.get('_buffKey') or '', 'max': s.get('_maxKey') or '',
                                                  'prog': s.get('_progressKey') or '', 'def': r4(s.get('_defaultVal') or 0),
                                                  'fin': r4(s.get('_finishedVal') or 0), 'curve': curve})
        return out

    def random_group(self, root):
        """(2026-10-22, effect bundle J; the 2026-10-14 EN client) the root's EmitterRandomGroup `rgroup`: { pick, self?,
        noOwner?, keep?, mainPos? } — at play (`OnPlay` → `_PickOneEmitter`): without an owner and neither
        `_dontCheckOwner` (`noOwner`) nor `_useMainEffectPos` (`mainPos`), nothing; else, unless `_selfExcluded`, with probability
        1 / (n + 1) (BattleController.randomTrivial) the effect stays itself (`self`); otherwise it pauses itself, creates
        Uniform(`_effectPickFrom`) (`pick`) on its owner (at its own position without one, with `mainPos`) and — unless
        `_finishEffectWhenSelfFinish` (`keep`: `OnFinish` then finishes the created ones) — finishes itself."""
        for sid, _raw, t in self.monos(root):
            if sid != RANDOM_GROUP_SCRIPT or t is None or t.get('m_Enabled') == 0:
                continue
            pick = [x for x in t.get('_effectPickFrom') or [] if x]
            if not pick:
                return None
            out = {'pick': pick}
            for k, f in (('noOwner', '_dontCheckOwner'), ('keep', '_finishEffectWhenSelfFinish'), ('mainPos', '_useMainEffectPos')):
                if t.get(f):
                    out[k] = True
            if not t.get('_selfExcluded'):
                out['self'] = True
            return out
        return None

    def equip_effects(self, root):
        """(2026-10-22, effect bundle J; the 2026-10-14 EN client) the root's SwitchableWhenContainsEquipment `equipFx`:
        { hooks: [[uniEquipId, level, effect]], pause? } — at play (`OnPlay` → `_TrySpawnHookEffect`): when
        the owner (a Character) has the module `uniEquipId` at `level` (CharacterData's current UniqueEquipPair), the hook's
        effect is created on it (BattleController.CreateEffect, its faceVector) and, with `_pauseWhenSwitch` (`pause`), this
        one pauses; `OnFinish` finishes the created one. Without hooks (the variants themselves): None."""
        for sid, _raw, t in self.monos(root):
            if sid != EQUIP_SWITCH_SCRIPT or t is None or t.get('m_Enabled') == 0:
                continue
            hooks = [[h['equipmentPair']['key'], int(h['equipmentPair']['level']), h['hookEffectKey']]
                     for h in t.get('_equipmentEffectHookSchemas') or [] if h.get('hookEffectKey')]
            if not hooks:
                return None
            out = {'hooks': hooks}
            if t.get('_pauseWhenSwitch'):
                out['pause'] = True
            return out
        return None

    def binding_name(self, b, node, nd=None):
        """(2026-10-16, fx_coverage) a Mecanim binding no track takes, named: a material property the bound renderer's
        material does not have (customType 22) — (2026-10-21) or on a node the extract draws nothing on (`nd`, its node:
        no mesh / skin / particles / trail / line, e.g. an empty MeshFilter) —, else `<component type>.<property path>`
        by crc32 over the paths of that component's type tree on the bound GameObject, else its type id and attribute."""
        tid, attr = b['typeID'], b['attribute']
        go = self.gobjs.get(node)
        if b.get('customType') == 22:
            if nd is not None and not any(nd.get(k) for k in ('mesh', 'skin', 'ps', 'trailR', 'lineR')):
                return 'material property on a node with nothing drawn'
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
    def material_prop(attr, node, mats, declared=None):
        """A material property binding (Mecanim customType 22): the low 28 bits are crc32(property name), the top nibble
        the component — 4..7 = r/g/b/a (x/y/z/w), 8 = a float. Matched against the bound renderer's material, then
        (2026-10-21) against the properties its shader declares — `declared()` [(name, Unity property type)]: a clip may
        drive one the material never saved (Unity sets it on the renderer's property block; the shader reads it the same).
        A SkinnedMeshRenderer (`skin`, 2026-10-21) is bound like a mesh (the player's meshMats hold both)."""
        mk = (node.get('mesh') or {}).get('mat') or (node.get('skin') or {}).get('mat') \
            or ((node.get('ps') or {}).get('render') or {}).get('mat') \
            or (node.get('trailR') or {}).get('mat') or (node.get('lineR') or {}).get('mat')
        m = mats.get(mk) if mk else None
        if not m:
            return None
        low, comp = attr & 0x0fffffff, attr >> 28
        named = lambda n: f'mat:{n}' + {4: '.r', 5: '.g', 6: '.b', 7: '.a'}.get(comp, '')
        for n in list(m['floats'].keys()) + list(m['colors'].keys()):
            if crc32(n) & 0x0fffffff == low:
                return named(n)
        # local patch: a texture's tiling / offset (_MainTex_ST: components 0..3 = tiling x, y, offset x, y) — scrolling lines
        for n in m['tex'].keys():
            if crc32(n + '_ST') & 0x0fffffff == low and comp <= 3:
                return f'mat:{n}_ST.' + 'xyzw'[comp]
        for n, t in (declared() if declared else []):
            if t == 4:   # a texture: its _ST
                if crc32(n + '_ST') & 0x0fffffff == low and comp <= 3:
                    return f'mat:{n}_ST.' + 'xyzw'[comp]
            elif crc32(n) & 0x0fffffff == low:
                return named(n)
        return None

    def node_declared(self, node):
        """(2026-10-21) the properties the shaders of node `node`'s renderers declare: [(name, Unity property type)] (4 = a
        texture), for material_prop."""
        go = self.gobjs.get(node)
        return [(name, t) for m in self.node_materials(go)
                for name, t, _d in self.declared_props(self.resolve(m.get('m_Shader'), go))]

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
        # list goes to (enemy_bindings.py: enemy-index.json — the operators' index.json stays as it is), with where each
        # written prefab was read from (`sources`, 2026-10-21). `write` False (--coverage, 2026-10-16): walk the prefabs for
        # the coverage report only, nothing written. Returns the names walked
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
            if self.keep is not None:
                self.keep[f'{bundle}/{name}'] = json.loads(json.dumps(data, ensure_ascii=False))
            if not write:
                # (2026-10-16) the file on disk against what this extractor writes now: an extractor fix that only some
                # bundles were re-extracted with (the built-in Quad, 2026-10-08) leaves the others drawing less
                f = out / bundle / f'{name}.json'
                if f.exists():
                    # every path (2026-10-21): json_diff's default cap of 20, taken before the materials were folded
                    # into `materials.*`, hid the later differences of a prefab with many materials
                    for path in json_diff(json.loads(f.read_text()), json.loads(json.dumps(data, ensure_ascii=False)), limit=10 ** 6):
                        self.cov.stale(re.sub(r'^materials\.[^.]+', 'materials.*', path))
                continue
            (out / bundle / f'{name}.json').write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False))
        if not write:
            print(f'[fx] {bundle}: {len(written)} prefab(s) checked')
            return written
        index_p = out / index
        index = json.loads(index_p.read_text()) if index_p.exists() else {'bundles': {}}
        if list_only:
            print(f'[fx] {bundle}: ' + ' '.join(sorted(written)))
            return written
        keep = set(index['bundles'].get(bundle, [])) | set(written)
        if not all_skins:
            keep = {n for n in keep if not VARIANT_RE.search(n)}
            for f in (out / bundle).glob('*.json'):
                if VARIANT_RE.search(f.stem):
                    f.unlink()
        index['bundles'][bundle] = sorted(keep)
        set_sources(index, bundle, sorted(keep), set(written), {'pack': rel, 'client': self.client})
        set_emitted(index, bundle, out)
        index_p.write_text(json.dumps(index, ensure_ascii=False, indent=1))
        print(f'[fx] {bundle}: {len(written)} prefab(s), {len(self.textures)} texture(s), {len(self.meshes)} mesh(es) -> {out}')
        return written


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
                    '(and the FollowDirection `follow`, the face switches `swFace` / `three`, `rdir`, `tileH`, 2026-10-22) of the already extracted prefabs of the bundles (every bundle of index.json without --bundle; 2026-10-11)')
    ap.add_argument('--delay-only', action='store_true', help='only write the branch delays (node `delay` / `sdelay`: a child\'s '
                    'FxDelay, the root\'s _subFXDelayConfigs) into the already extracted prefabs of the bundles (every bundle of '
                    'index.json without --bundle; 2026-10-11)')
    ap.add_argument('--height-only', action='store_true', help='only write the `_overwriteHeight` `height` into the already '
                    'extracted prefabs of the bundles (every bundle of index.json without --bundle; 2026-10-10)')
    ap.add_argument('--finish-only', action='store_true', help='only write the `_delayToFinish` `finish` (and a projectile '
                    'or particle effect\'s `_inactiveOnFinish` `offFinish` and the system it stops `mainPs`, 2026-10-21, and the '
                    'root\'s FxLODSetting `lod`, 2026-10-23) into the '
                    'already extracted prefabs of the bundles (every bundle of --index without --bundle; 2026-10-11)')
    ap.add_argument('--still-only', action='store_true', help='only write the `still` / `stillBy` (a projectile `_mainEffect` '
                    'whose body does not turn: `_rotateToTarget` 0) into the already extracted prefabs of the bundles, by name '
                    '(every bundle of --index without --bundle; the prefabs of the --game client only; 2026-10-27)')
    ap.add_argument('--coverage', metavar='OUT', help='write no effect file or index: walk the already extracted prefabs of the bundles (every '
                    'bundle of --index without --bundle) and write the full list of what the pipeline leaves out to OUT '
                    '(JSON, fx_coverage.py; 2026-10-16). Each prefab is walked from where it was extracted (the index\'s '
                    '`sources`; 2026-10-21)')
    ap.add_argument('--client', choices=('en', 'cn'), help='the client --game is, recorded with the written prefabs (default: '
                    'by its app.info — HyperGryph = cn, else en)')
    ap.add_argument('--other-game', metavar='DIR', help='--coverage: the Arknights_Data folder of the other client, for the '
                    'prefabs extracted from it (the CN 선발 bundles)')
    ap.add_argument('--other-cab-index', metavar='JSON', help='--coverage: the CAB index of --other-game')
    ap.add_argument('--wrap-only', action='store_true', help='only write tex/wrap.json: the wrap mode of every already '
                    'extracted texture, read from the packs of both indexes (the CN ones with --other-game / '
                    '--other-cab-index; 2026-10-22)')
    ap.add_argument('--emitted-only', action='store_true', help='only rewrite the index\'s `emitted` lists (the prefabs another '
                    'prefab of the bundle creates, from the already extracted files; every bundle of --index without --bundle; 2026-10-21)')
    a = ap.parse_args()
    if a.wrap_only:
        ex = Extractor(a.game, a.cab_index, png=a.png, client=a.client)
        print(f'[fx] wrap: {merge_wraps(wrap_walk(ex, a))} texture(s) listed in {OUT / WRAP_FILE}')
        return
    if a.emitted_only:
        index_p = OUT / a.index
        index = json.loads(index_p.read_text())
        for b in a.bundle or sorted(index['bundles']):
            set_emitted(index, b)
        index_p.write_text(json.dumps(index, ensure_ascii=False, indent=1))
        print(f"[fx] emitted: {sum(len(v) for v in (index.get('emitted') or {}).values())} prefab(s) in {len(index.get('emitted') or {})} bundle(s)")
        return
    if a.build_cab_index:
        build_cab_index(a.game, a.build_cab_index)
        return
    ex = Extractor(a.game, a.cab_index, png=a.png, client=a.client)
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
    if a.still_only:
        index = json.loads((OUT / a.index).read_text())
        tot = [ex.still_only(b, index) for b in (a.bundle or sorted(index['bundles']))]
        print(f'[fx] still: {sum(x[0] for x in tot)} prefab(s) on a body that may stay unturned, {sum(x[1] for x in tot)} file(s) changed')
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
        coverage_walk(ex, a)
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
        merge_wraps(ex.wraps)   # 2026-10-22: the wraps of the textures it met (tex/wrap.json)
    if a.prune:
        prune(OUT)


def coverage_walk(ex, a):
    """--coverage: walk the listed prefabs of the bundles (dry), each from its recorded source (source_of — `--pack`
    overrides it): the prefabs of a client neither `ex` nor --other-game is, of a bundle the client lacks, or listed but
    not in the bundle are reported `unwalked` (2026-10-21; before, a token pack, the CN bundles and the enemies' packs
    were skipped with one printed line)."""
    exs = {ex.client: ex}
    if a.other_game:
        other = Extractor(a.other_game, a.other_cab_index, png=a.png)
        if other.client in exs:
            raise SystemExit(f'--other-game is the same client ({other.client}) as --game')
        other.cov = ex.cov   # one report
        exs[other.client] = other
    for e in exs.values():
        e.dry = True
    index = json.loads((OUT / a.index).read_text())
    listed = index['bundles']
    for b in a.bundle or sorted(listed):
        names = set(a.prefab) or set(listed.get(b) or [])
        groups = {}
        for n in names:
            s = source_of(index, b, n)
            groups.setdefault((s['client'], a.pack or s['pack']), set()).add(n)
        for (client, pack), ns in sorted(groups.items()):
            keys = sorted(f'{b}/{n}' for n in ns)
            e = exs.get(client)
            if e is None:
                ex.cov.unwalked(f'extracted from the {client} client: give --other-game', keys)
                continue
            try:
                got = e.run(b, ns, all_skins=a.all_skins, pack=pack, index=a.index, write=False)
            except SystemExit as err:
                ex.cov.unwalked(f'{client} {pack}: {err}', keys)
                continue
            miss = [n for n in ns if n.lower() not in {g.lower() for g in got}]
            skin = [n for n in miss if not a.all_skins and VARIANT_RE.search(n)]
            ex.cov.unwalked('a skin variant: give --all-skins', sorted(f'{b}/{n}' for n in skin))
            ex.cov.unwalked(f'not in {client} {pack}', sorted(f'{b}/{n}' for n in miss if n not in skin))


def prune(out):
    """Delete tex/*.png and mesh/*.json that no effect JSON under `out` references."""
    tex, mesh = set(), set()
    for f in out.glob('*/*.json'):
        d = json.loads(f.read_text())
        for m in d.get('materials', {}).values():
            for t in m.get('tex', {}).values():
                tex.add(t['img'])
        for n in d.get('nodes', []):
            r = (n.get('ps') or {}).get('render') or {}
            for k in r.get('mesh'), *(r.get('meshes') or ()), (n.get('mesh') or {}).get('mesh'):
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
