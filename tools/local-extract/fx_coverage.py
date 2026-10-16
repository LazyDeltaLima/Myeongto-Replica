"""What an effect extraction leaves out (fx_extract.py): the parts of the client's effect prefabs that the extract does not
carry or render/fxplayer.js does not draw, listed instead of dropped without a word.

Every run of fx_extract.py collects, per extracted prefab, what it met that the pipeline does not take:

    component   a Unity component type the walk does not read (SpriteRenderer, RectTransform …)
    script      a client MonoBehaviour (by its MonoScript PathID; named by the il2cpp dump when one is there)
    dependency  a dependency bundle the CAB index names a missing file for, or does not know (a client update moved
                it): its textures are missing from the extract
    reader      a component the extract reads by raw words whose layout was not recognised (it read nothing)
    module      an enabled ParticleSystem module the extract does not carry
    shape       a ParticleSystem shape type the player has no emitter for
    texture     a texture the shader declares and the material sets, which the player never samples
    property    a shader property the material sets off its default, which the player never reads
    shader      a shader name the player has never been checked against (its special cases go by name)
    material    a material the extract reads as none (Unity's built-in defaults) on a system that emits
    clip        an Animator / Animation binding the extract could not resolve, or states past the default one
    stale       (--coverage) the extracted file differs from what the extractor writes now at this path: re-extract

Each item has a status: `new` (nobody has looked at it: look before trusting the effect), `todo` (known and not done:
KNOWN says what it does), `hand` (hand-written render code draws it instead) or `none` (draws nothing, or the player
already does the same). The run prints the new items with the prefabs
that have them and one line for the known ones; `--coverage` writes the whole list (fx_extract.py).

Pure Python (no UnityPy): the extractor hands in plain values, the tests duck-type them.
"""
import re
from pathlib import Path

# Unity component types the extract reads (Extractor.prefab walk); MonoBehaviour goes by its script (SCRIPTS)
COMPONENTS_READ = {'Transform', 'ParticleSystem', 'ParticleSystemRenderer', 'MeshRenderer', 'MeshFilter', 'Animator',
                   'Animation', 'SkinnedMeshRenderer', 'TrailRenderer', 'LineRenderer', 'MonoBehaviour'}

# client MonoScript PathID -> class name (EN client; the same ids in the CN client where compared; names from the il2cpp dump
# by their serialized fields, 2026-10-16). The read ones are what fx_extract.py takes; the others are named so the report
# says what they are — their status is in KNOWN. A script with no serialized field keeps its id (#…)
SCRIPTS = {
    6196809664641094801: 'ParticleEffect',            # root_effect (raw words)
    4524653206994915020: 'ProjectileEffect',          # projectile_effect (raw words)
    4526430437831129839: 'FxDelay',                   # fx_delay / root_effect
    8889037078861433556: 'FollowMountPoint',          # mount_point (raw words)
    568963171123803239: 'FxUVTweener',                # uv_tween
    1369540917083035942: 'FxUVTweenerAdvance',        # uv_tween
    7163214010000414217: 'FxUVRotation',              # uv_rotation
    7599136815520768295: 'SwitchableBackEffect',      # switch_back
    7347111497538980357: 'SwitchableRightEffect',     # right_effect
    -2385344539842054984: 'LineEffectEmitterDynamic',  # line_dynamic
    # not read (KNOWN)
    -337322108846137150: 'FollowDirection', 1149374055237060560: 'FxLODSetting', -488665936260092151: 'EmptyEffect',
    -5498265793651067281: 'OnPlayEmitter', 2565987927806955259: 'OnFinishEmitter', -5974768320951421776: 'PauseEffectIf',
    -8269937305055351653: 'PauseAnotherEffect', 2267209715737721819: 'PauseEffectIfNotIdle',
    6329958979451404875: 'PauseEffectWithAnimation', -654372255496816943: 'PauseEffectIfSpineEvent',
    -6490124024613466648: 'FinishEffectIf', 8393240480824250599: 'FinishEffectViaOwnerBuff',
    2994498389723426252: 'FollowTileHeight', -4364771506185570144: 'SwitchableEffectByFaceDirection',
    5365557655193992920: 'SwitchableThreeFaceEffect', 1228563541688412297: 'SwitchableWhenContainsEquipment',
    -2470488090548023017: 'SwitchableEffectByBuffStackCnt', -3960942007169782850: 'EmitterRandomGroup',
    8922258000712749090: 'FunnelHitEffect', 1115230818793786687: 'RandomDirection', 1759359436891135837: 'OnPlayAudioPlayer',
    -7571717170868447701: 'OnFinishAnime', 4957269727245382446: 'TriggerAnimatorWhenFinish',
    -1577373638081991986: 'SwitchAnimatorStateWhenFinish', 295235635984623506: 'SetAnimatorFloatByCondition',
    -5165147848620574582: 'BuffProgressFloatSource', 70527413319701124: 'SetAnimatorTriggerByCondition',
    -2505866108626100628: 'AuraProjectileSetAnimatorTrigger', -7693528729676623236: 'SetAnimatorTriggerOnEvent',
    4106883806711907659: 'Svash2FlyToPredefinedTokenCard', -6677432354943165660: 'ColorModifier',
    -4538866681947353501: 'YuS3EffectBehaviour', 4140733268730780971: 'YuS3EffectWithEdgeBehaviour',
}
# what the extract reads of the scripts above (reader() checks the raw ones)
SCRIPTS_READ = {'ParticleEffect', 'ProjectileEffect', 'FxDelay', 'FollowMountPoint', 'FxUVTweener', 'FxUVTweenerAdvance',
                'FxUVRotation', 'SwitchableBackEffect', 'SwitchableRightEffect', 'LineEffectEmitterDynamic'}

# ParticleSystem modules the extract carries (fx_extract.particle_system)
MODULES_READ = {'InitialModule', 'EmissionModule', 'ShapeModule', 'SizeModule', 'ColorModule', 'RotationModule',
                'VelocityModule', 'ForceModule', 'ClampVelocityModule', 'NoiseModule', 'UVModule', 'CustomDataModule',
                'TrailModule', 'SubModule'}
# shape types render/fxplayer.js emits from (the `switch (sh.type)` of its emitter); others fall back to a point
SHAPES_DRAWN = {0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 15, 16, 17, 18}
SHAPE_NAMES = {6: 'Mesh', 13: 'MeshRenderer', 14: 'SkinnedMeshRenderer', 19: 'Sprite', 20: 'SpriteRenderer'}

# material textures / values render/fxplayer.js reads (makeMaterial, CLIP_UNIFORM, CLIP_COMP) — test/local-extract.test.js
# keeps these lists equal to the names in fxplayer.js
PLAYER_TEXTURES = {'_MainTex', '_AddTex', '_DissolveTex', '_DissolveTex_01', '_DissolveTex_02', '_DisturbTex', '_NoiseTex',
                   '_DisturTex', '_DisturTex_02', '_MaskTex', '_RamTex', '_WeightTex'}
PLAYER_VALUES = {'_Color', '_MainColor', '_TintColor', '_UVTween', '_AddFactor', '_Amount', '_Amount_01', '_Amount_02',
                 '_AnchorU', '_AnchorU_02', '_AnchorV', '_AnchorV_02', '_BorderWidth', '_BorderWidth_01', '_BorderWidth_02',
                 '_DissolveIntensity', '_DissolveUSpeed', '_DissolveVSpeed', '_DisturbInfluenceDissolveUV',
                 '_DisturbInfluenceMainUV', '_DisturbUSpeed', '_DisturbVSpeed', '_DstBlend', '_HGCustomVertexStream',
                 '_IntensityU', '_IntensityU_02', '_IntensityV', '_IntensityV_02', '_MainColorACtrl', '_MainUSpeed',
                 '_MainVSpeed', '_Opacity', '_RimPower', '_ToggleUseDissolve', '_ToggleUseDisturb2', '_UseDissolveTex', '_ZTest'}
# shaders whose behaviour render/fxplayer.js was checked against (by name: blend, tint, distortion, dissolve families)
# (2026-10-16: every shader of the extracted effects then — a shader outside the list is new to the player)
SHADERS_CHECKED = {
    'Torappu/Particles/Additive', 'Torappu/Particles/AlphaBlend', 'Torappu/Particles/AlphaBlend(ZWrite)',
    'Torappu/Particles/Ram/Disturb(CustomData)', 'Torappu/Particles/Ram/AlphaBlend', 'Torappu/Particles/Ram/Add',
    'Torappu/Particles/Disturb/Disturb(CustomData)', 'Torappu/Particles/Disturb/Disturb Origin',
    'Torappu/Particles/Disturb/Disturb Anchor', 'Torappu/Particles/Dissolve/Dissolve(CustomData)',
    'Torappu/Particles/Dissolve/Dissolve AB', 'Torappu/Particles/Dissolve/Dissolve Add',
    'Torappu/Particles/Dissolve/Dissolve AB UVTween', 'Torappu/Particles/Dissolve/Dissolve Add UVTween',
    'Torappu/Particles/Dissolve/Dissolve AB (VertexColor Major)', 'Torappu/Particles/Dissolve/Dissolve Add (VertexColor Major)',
    'Torappu/Particles/Dissolve/Dissolve AB Double', 'Torappu/Particles/Dissolve/Dissolve Add Double',
    'Torappu/Particles/Rim/Rim Texture (Add)', 'Torappu/Particles/Rim/Rim Texture (AlphaBlend)',
    'Torappu/Particles/Rim/Rim Tint (Add)', 'Torappu/Particles/Rim/Rim Tint (AlphaBlend)',
    'Torappu/Particles/Mask/Mask (Add)', 'Torappu/Particles/Mask/Mask (AlphaBlend)',
    'Torappu/Particles-L2D/Ram/Disturb(CustomData)', 'Torappu/Particles-L2D/Disturb/Disturb(CustomData)',
    'Torappu/Particles-L2D/Dissolve/Dissolve(CustomData)', 'Torappu/Particles-L2D/Dissolve/Dissolve Add',
}

# known items: 'kind:what' -> (status, note). `todo` = known, not drawn as the client does (the 2026-10-16 baseline; the
# open list is docs/rules/fx.md 「추출 누락 보고」); `hand` = drawn by hand-written render code instead (the note says where);
# `none` = draws nothing, or the player already does the same. Anything not here is `new`.
_TODO, _HAND, _NONE = 'todo', 'hand', 'none'
KNOWN = {
    # components
    'component:MeshCollider': (_NONE, 'physics / ray casts only'),
    'component:BoxCollider': (_NONE, 'physics / ray casts only'),
    'component:RectTransform': (_TODO, 'a UI transform: the walk reads Transform only, so the node loses its place and children'),
    # client scripts
    'script:FollowDirection': (_TODO, 'turns the effect with its owner / target direction every frame (only the root '
                               'ParticleEffect `_rotateType` is read, `face`)'),
    'script:FxLODSetting': (_TODO, 'switches objects / particle details off by quality level [ASSUMED: nothing at the top level]'),
    'script:EmptyEffect': (_TODO, 'an Effect root without particles: its `_delayToFinish` / sub delays are not read'),
    'script:OnPlayEmitter': (_TODO, 'plays other effects when this one starts'),
    'script:OnFinishEmitter': (_TODO, 'plays other effects when this one finishes'),
    'script:PauseEffectIf': (_TODO, 'pauses the effect on owner conditions (abnormal flags, blackboard keys)'),
    'script:PauseAnotherEffect': (_TODO, 'pauses another effect of the owner'),
    'script:PauseEffectIfNotIdle': (_TODO, 'pauses while the owner is not idle / faces back or front'),
    'script:PauseEffectWithAnimation': (_TODO, 'pauses by the owner\'s current animation'),
    'script:PauseEffectIfSpineEvent': (_TODO, 'pauses on the owner\'s Spine events'),
    'script:FinishEffectIf': (_TODO, 'finishes on owner conditions (animation end, owner gone)'),
    'script:FinishEffectViaOwnerBuff': (_HAND, 'finishes when the owner\'s buff ends; only on 余 S3, drawn by render/fxgame.js (its tiles)'),
    'script:FollowTileHeight': (_TODO, 'follows the height of the tile under it'),
    'script:SwitchableEffectByFaceDirection': (_TODO, 'plays an up / down / left variant by facing'),
    'script:SwitchableThreeFaceEffect': (_TODO, 'plays an up / down variant by facing'),
    'script:SwitchableWhenContainsEquipment': (_TODO, 'a variant per equipped module'),
    'script:SwitchableEffectByBuffStackCnt': (_TODO, 'a variant by buff stack count'),
    'script:EmitterRandomGroup': (_TODO, 'plays one of a group at random'),
    'script:FunnelHitEffect': (_TODO, 'a random offset of a drone hit'),
    'script:RandomDirection': (_TODO, 'a random direction at play'),
    'script:OnPlayAudioPlayer': (_NONE, 'a sound, not drawn (audio is separate)'),
    'script:OnFinishAnime': (_TODO, 'sets an Animator trigger at finish (Animator states past the first)'),
    'script:TriggerAnimatorWhenFinish': (_TODO, 'sets an Animator trigger at finish (Animator states past the first)'),
    'script:SwitchAnimatorStateWhenFinish': (_TODO, 'switches the Animator state at finish'),
    'script:SetAnimatorFloatByCondition': (_TODO, 'drives an Animator parameter'),
    'script:BuffProgressFloatSource': (_TODO, 'drives an Animator parameter by buff progress'),
    'script:SetAnimatorTriggerByCondition': (_TODO, 'sets an Animator trigger on a condition'),
    'script:AuraProjectileSetAnimatorTrigger': (_TODO, 'sets an Animator trigger'),
    'script:SetAnimatorTriggerOnEvent': (_TODO, 'sets an Animator trigger on an event'),
    'script:Svash2FlyToPredefinedTokenCard': (_TODO, 'moves the eagle to a card position (one kit)'),
    'script:ColorModifier': (_HAND, 'tints the owner model: render/units.js (stealth greying)'),
    'script:YuS3EffectBehaviour': (_HAND, 'render/fxgame.js (余 S3 tiles)'),
    'script:YuS3EffectWithEdgeBehaviour': (_HAND, 'render/fxgame.js (余 S3 tiles)'),
    'script:#8401462487392191767': (_TODO, 'no serialized field: name unknown'),
    'script:#-2862109401119915025': (_TODO, 'no serialized field: name unknown'),
    'script:#-1576532863054725745': (_TODO, 'no serialized field: name unknown'),
    # particle systems
    'module:CollisionModule': (_TODO, 'particles bounce on / die at planes or the world'),
    'module:InheritVelocityModule': (_TODO, 'particles inherit the moving emitter\'s velocity'),
    'module:SizeBySpeedModule': (_TODO, 'size by particle speed'),
    'shape:6 Mesh': (_TODO, 'emits from a mesh: the player falls back to a point'),
    # materials (values: the extracted materials, 2026-10-16)
    'property:Torappu/Particles/Disturb/Disturb Anchor _Weight': (_NONE, 'the toggle behind keyword _WEIGHT_ON, which the player reads (all 198 materials agree)'),
    'property:Torappu/Particles/Disturb/Disturb Origin _SrcBlend': (_TODO, 'the player blends SrcAlpha (5) as most materials do; 2 set One (1)'),
    'property:Torappu/Particles/Disturb/Disturb Anchor _SrcBlend': (_NONE, 'every material sets SrcAlpha (5), which the player uses'),
    'property:Torappu/Particles/Disturb/Disturb Origin _CullMode': (_TODO, 'the player draws both sides; Back (2) differs only seen from behind'),
    'property:Torappu/Particles/Disturb/Disturb Anchor _CullMode': (_TODO, 'the player draws both sides; Back (2) differs only seen from behind'),
    'property:Torappu/Particles/Disturb/Disturb(CustomData) _CullMode': (_TODO, 'the player draws both sides; Back (2) differs only seen from behind'),
    'property:Torappu/Particles/Ram/Disturb(CustomData) _CullMode': (_TODO, 'the player draws both sides; Back (2) differs only seen from behind'),
    'property:Torappu/Particles/AlphaBlend(ZWrite) _CullMode': (_TODO, 'the player draws both sides; Back (2) differs only seen from behind'),
    'property:Torappu/Particles/AlphaBlend(ZWrite) _ZWrite': (_TODO, 'the player never writes depth'),
    # clips
    'clip:binding to a path outside the Animator': (_NONE, 'the clip names a node the prefab does not have (deleted in authoring): '
                                                    'Unity binds nothing either'),
    'clip:Animator clips past the first (other states: set by client scripts)': (_TODO, 'only the default state\'s clip plays'),
    'clip:ParticleSystem.EmissionModule.rateOverTime.scalar': (_TODO, 'a clip animating a particle module: the player keeps the authored value'),
    'clip:ParticleSystem.ShapeModule.radius.value': (_TODO, 'a clip animating a particle module: the player keeps the authored value'),
    'clip:ParticleSystem.SizeModule.curve.scalar': (_TODO, 'a clip animating a particle module: the player keeps the authored value'),
    'clip:ParticleSystem.TrailModule.colorOverLifetime.maxColor.a': (_TODO, 'a clip animating a particle module: the player keeps the authored value'),
    'clip:TrailRenderer.m_Time': (_TODO, 'a clip animating a trail\'s length: the player keeps the authored value'),
    'clip:MonoBehaviour.xspeed': (_TODO, 'a clip animating FxUVTweener speed: the player keeps the authored value'),
    'clip:MonoBehaviour.secondXSpeed': (_TODO, 'a clip animating FxUVTweener speed: the player keeps the authored value'),
    'clip:material property the shader does not declare': (_NONE, 'Unity sets a value no pass reads'),
    "material:Unity's default particle material on an emitting system": (
        _TODO, 'the client draws Unity\'s plain default particle; the extract reads that material as none (UNITY_DEFAULT_MATERIALS)'),
    'shader:Legacy Shaders/Particles/Alpha Blended': (_TODO, 'no name rule in the player: blended by `_DstBlend`'),
    **{f'clip:material {n}: declared by the shader, not saved on the material': (
        _TODO, 'the shader reads it but fx_extract material_prop looks on the material only: the track is dropped')
       for n in ('_MainTex_ST', '_DissolveTex_ST', '_AddTex_ST', '_Amount', '_TintColor')},
    # dependencies (EN client)
    'dependency:CAB-658d74aab777086fc32b93f385be999a: not in the CAB index (rebuild it: --build-cab-index)': (
        _NONE, 'the client\'s MonoScripts (every m_Script points there): the extract reads none of them'),
}

# a shader property type (Unity SerializedProperty m_Type)
TEXTURE = 4


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


class Coverage:
    """The report of one extraction run. `begin(key)` names the prefab the following calls are about."""

    def __init__(self, dump=None):
        self.items = {}        # (kind, what) -> {'kind', 'what', 'detail', 'prefabs': set}
        self.key = None
        self.dump = dump       # il2cpp dump.cs path: names the unknown scripts (lazy)
        self._classes = None

    def begin(self, key):
        self.key = key

    def add(self, kind, what, detail=None, key=None):
        it = self.items.setdefault((kind, what), {'kind': kind, 'what': what, 'detail': detail, 'prefabs': set()})
        if detail and not it['detail']:
            it['detail'] = detail
        if key or self.key:
            it['prefabs'].add(key or self.key)

    # ------------------------------------------------------------ checks (called by the extractor)

    def component(self, type_name):
        if type_name not in COMPONENTS_READ:
            self.add('component', type_name)

    def script(self, script_id, fields=None):
        """A MonoBehaviour by its MonoScript PathID and (when its type tree reads) its own field names."""
        name = SCRIPTS.get(script_id)
        if name in SCRIPTS_READ:
            return
        if name is None:
            name = self.class_of(fields) or f'#{script_id}'
            if fields and name.startswith('#'):
                name += ' ' + ','.join(sorted(fields))[:120]
        self.add('script', name, f'MonoScript {script_id}')

    def reader(self, script, ok, why=None):
        """A raw-word reader (root_effect …) ran on a component of that script: not ok = its layout was not recognised
        (nothing read) or, `why`, what it read disagrees with the type tree."""
        if not ok:
            self.add('reader', f'{script}: {why or "layout not recognised, nothing read"}')

    def particle(self, ps):
        """A ParticleSystem type tree."""
        for k, v in ps.items():
            if k.endswith('Module') and isinstance(v, dict) and v.get('enabled') and k not in MODULES_READ:
                self.add('module', k)
        sh = ps.get('ShapeModule') or {}
        if sh.get('enabled') and sh.get('type') not in SHAPES_DRAWN:
            t = sh.get('type')
            self.add('shape', f'{t} {SHAPE_NAMES.get(t, "?")}')

    def material(self, shader, props, tex, values):
        """A material: its shader name, the shader's declared properties [(name, type, defaults)], the textures it sets
        (names with a texture) and its float / colour values {name: number or [r, g, b, a]}."""
        if shader and SHADERS_CHECKED and shader not in SHADERS_CHECKED:
            self.add('shader', shader)
        for name, typ, dflt in props or []:
            if typ == TEXTURE:
                if name in tex and name not in PLAYER_TEXTURES:
                    self.add('texture', f'{shader} {name}')
                continue
            if name in PLAYER_VALUES or name not in values:
                continue
            v = values[name]
            vs = v if isinstance(v, (list, tuple)) else [v]
            if any(_num(a) is None or _num(b) is None or abs(_num(a) - _num(b)) > 1e-4 for a, b in zip(vs, dflt)):
                self.add('property', f'{shader} {name}')

    def clip(self, what, detail=None):
        self.add('clip', what, detail)

    def dependency(self, what, bundle):
        """A dependency bundle (textures, shared meshes) the loader could not open for `bundle`."""
        self.add('dependency', what, 'what lives there (textures …) is missing from every effect of the bundle', key=bundle)

    def stale(self, path):
        self.add('stale', path, 'the file on disk differs from a fresh extraction here: re-extract the bundle')

    # ------------------------------------------------------------ naming by the il2cpp dump

    def class_of(self, fields):
        """The client class whose serialized fields hold the most of `fields` (the smallest such class on a tie), from the
        il2cpp dump; None without a dump or fields."""
        if not fields or not self.dump:
            return None
        if self._classes is None:
            self._classes = load_dump_fields(self.dump)
        fs = set(fields)
        best = None
        for cls, (own, base) in self._classes.items():
            n = len(fs & own)
            # a component class first (an Effect behaviour, a MonoBehaviour): a lone field name also sits on battle nodes
            score = (n, base in ('Effect.Behaviour', 'MonoBehaviour', 'Effect'), -len(own))
            if n and (best is None or score > best[0]):
                best = (score, cls)
        return best[1] if best and best[0][0] * 2 >= len(fs) else None

    # ------------------------------------------------------------ report

    def status(self, kind, what):
        k = KNOWN.get(f'{kind}:{what}')
        return k if k else ('new', None)

    def report(self):
        out = []
        for (kind, what), it in sorted(self.items.items()):
            st, note = self.status(kind, what)
            out.append({'kind': kind, 'what': what, 'status': st, 'note': note, 'detail': it['detail'],
                        'count': len(it['prefabs']), 'prefabs': sorted(it['prefabs'])})
        return out

    def summary(self, examples=4):
        """Printable lines: each new item with up to `examples` prefabs, then one line for the known ones."""
        rep = self.report()
        lines = []
        new = [r for r in rep if r['status'] == 'new']
        for r in new:
            ex = ', '.join(r['prefabs'][:examples]) + (' …' if r['count'] > examples else '')
            lines.append(f"[fx] NOT HANDLED {r['kind']} {r['what']}: {r['count']} prefab(s) — {ex}")
        known = [r for r in rep if r['status'] != 'new']
        if known:
            n = {st: sum(r['status'] == st for r in known) for st in ('todo', 'hand', 'none')}
            lines.append(f"[fx] known gaps: {n['todo']} todo, {n['hand']} drawn by hand-written code, {n['none']} draw nothing "
                         '(fx_extract.py --coverage lists them)')
        if not rep:
            lines.append('[fx] coverage: nothing left out')
        return lines


_CLASS_RE = re.compile(r'^(?:public |internal |private |protected )*(?:sealed |abstract |static )*class (\S+)(?: : ([\w.]+))?')
_FIELD_RE = re.compile(r'^\s+(?:public|private|protected|internal)\s+(?!static|const)[\w.<>\[\], ]+?\s(_?\w+); // 0x')


def load_dump_fields(path):
    """{class name: (set of its instance field names, base class or None)} from an Il2CppDumper dump.cs."""
    classes, cur = {}, None
    p = Path(path)
    if not p.exists():
        return classes
    with p.open(encoding='utf-8', errors='replace') as f:
        for line in f:
            m = _CLASS_RE.match(line)
            if m:
                cur = classes.setdefault(m.group(1), (set(), m.group(2)))[0]
                continue
            if cur is not None:
                m = _FIELD_RE.match(line)
                if m:
                    cur.add(m.group(1))
    return classes
