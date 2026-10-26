"""What an effect extraction leaves out (fx_extract.py): the parts of the client's effect prefabs that the extract does not
carry or render/fxplayer.js does not draw, listed instead of dropped without a word.

Every run of fx_extract.py collects, per extracted prefab, what it met that the pipeline does not take:

    component   a Unity component type the walk does not read (SpriteRenderer, RectTransform …)
    script      a client MonoBehaviour (by its MonoScript PathID; named by the class → field-name table when one is there)
    dependency  a dependency bundle the CAB index names a missing file for, or does not know (a client update moved
                it): its textures are missing from the extract
    reader      a component the extract reads by its field names with a raw-word fallback (fx_extract check_readers):
                without a type tree the raw words were read unchecked, or the fallback no longer recognises the
                layout / disagrees with the type tree (a client update shifted the words)
    module      an enabled ParticleSystem module the extract does not carry
    shape       a ParticleSystem shape type the player has no emitter for
    texture     a texture the shader declares and the material sets, which the player never samples
    property    a shader property the material sets off its default, which the player never reads
    shader      a shader name the player has never been checked against (its special cases go by name)
    material    a material the extract reads as none (Unity's built-in defaults) on a system that emits
    clip        an Animator / Animation binding the extract could not resolve, or states past the default one
    stale       (--coverage) the extracted file differs from what the extractor writes now at this path: re-extract
    unwalked    (--coverage) a prefab of the index the walk could not reach (its client not given, its bundle or the
                prefab gone): the report says nothing about it
    unverified  a feature of the extracted prefabs (signature()) that no prefab of the verified list (fx-verified.json:
                the maintainer compared it on screen with the official game) has: carried by the pipeline, never seen

Each item has a status: `new` (nobody has looked at it: look before trusting the effect), `todo` (known and not done:
KNOWN says what it does), `hand` (hand-written render code draws it instead), `none` (draws nothing, or the player
already does the same), or `unverified` / `unwalked` (the kinds of those names). The run prints the new items with the prefabs
that have them and one line for the known ones and one for the unverified ones; `--coverage` writes the whole list
(fx_extract.py).

Pure Python (no UnityPy): the extractor hands in plain values, the tests duck-type them. Run on its own it reads the
extracted files on disk (no client): `python3 tools/local-extract/fx_coverage.py unverified` lists the unverified features
and the prefabs that would cover them, `… verify <bundle/name> … --by arena|match` adds prefabs to the verified list.
"""
import argparse
import datetime
import json
import sys
from pathlib import Path

# Unity component types the extract reads (Extractor.prefab walk); MonoBehaviour goes by its script (SCRIPTS)
COMPONENTS_READ = {'Transform', 'RectTransform', 'ParticleSystem', 'ParticleSystemRenderer', 'MeshRenderer', 'MeshFilter', 'Animator',
                   'Animation', 'SkinnedMeshRenderer', 'TrailRenderer', 'LineRenderer', 'MonoBehaviour'}

# client MonoScript PathID -> class name (EN client; the same ids in the CN client where compared; names from the client's classes
# by their serialized fields, 2026-10-16). The read ones are what fx_extract.py takes; the others are named so the report
# says what they are — their status is in KNOWN. A script with no serialized field keeps its id (#…)
SCRIPTS = {
    6196809664641094801: 'ParticleEffect',            # root_effect (field names, raw fallback)
    4524653206994915020: 'ProjectileEffect',          # projectile_effect (field names, raw fallback)
    4526430437831129839: 'FxDelay',                   # fx_delay / root_effect (field names, raw fallback)
    8889037078861433556: 'FollowMountPoint',          # mount_point (field names, raw fallback)
    568963171123803239: 'FxUVTweener',                # uv_tween
    1369540917083035942: 'FxUVTweenerAdvance',        # uv_tween
    7163214010000414217: 'FxUVRotation',              # uv_rotation
    7599136815520768295: 'SwitchableBackEffect',      # switch_back
    7347111497538980357: 'SwitchableRightEffect',     # right_effect (field names, raw fallback)
    -2385344539842054984: 'LineEffectEmitterDynamic',  # line_dynamic
    -1593825680945881793: 'RandomEmitter',            # random_emitter (node `emit`)
    -7734721471322670107: 'FlyToPredefinedLocation',  # fly_location (`fly`)
    -5498265793651067281: 'OnPlayEmitter',            # on_emitters (node `onPlay`)
    2565987927806955259: 'OnFinishEmitter',           # on_emitters (node `onFinish`)
    # not read (KNOWN)
    -337322108846137150: 'FollowDirection', 1149374055237060560: 'FxLODSetting', -488665936260092151: 'EmptyEffect',
    -5974768320951421776: 'PauseEffectIf',
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
    # (2026-10-21) the route cursors, the 战场#06 wall and the enemies' packs
    978915749116962969: 'PreviewCursor', -2553461985578519915: 'SimpleEffect', 8058004230779817607: 'EffectData_Projectile',
    8089147815673937552: 'LineEffectEmitter', -7751344843855468294: 'SwitchableEffectByBlackboardValue',
    # (2026-10-21) named from the client's MonoScript bundle (the CAB every m_Script points at: m_Namespace / m_ClassName)
    -342699933188949169: 'EffectImportData', 6704954098737650565: 'SyncEffectScaleWithAuraRangeRadius',
    -1569843327534094582: 'PauseEffectIfNotMove', 8401462487392191767: 'PauseEffectIfDisappeared', -2862109401119915025: 'FollowOwner',
    -1576532863054725745: 'FollowOwnerRootTileHeight',
}
# what the extract reads of the scripts above (reader() checks the raw fallbacks)
SCRIPTS_READ = {'ParticleEffect', 'ProjectileEffect', 'FxDelay', 'FollowMountPoint', 'FxUVTweener', 'FxUVTweenerAdvance',
                'FxUVRotation', 'SwitchableBackEffect', 'SwitchableRightEffect', 'LineEffectEmitterDynamic', 'RandomEmitter',
                'LineEffectEmitter',   # (2026-10-23) line_emitter (`lineEm`: its start / mid / end effects; its maker sets the ends)
                'FlyToPredefinedLocation', 'OnPlayEmitter', 'OnFinishEmitter', 'EmptyEffect', 'PauseEffectIf', 'PauseAnotherEffect',
                'PauseEffectIfNotIdle', 'PauseEffectWithAnimation', 'PauseEffectIfSpineEvent', 'FinishEffectIf', 'FunnelHitEffect',
                'FollowDirection', 'SwitchableEffectByFaceDirection', 'SwitchableThreeFaceEffect', 'RandomDirection',
                'FollowTileHeight',
                'FxLODSetting',   # (2026-10-23) lod_setting (`lod`: the low-detail switches, applied at quality 'medium')
                # (2026-10-22, effect bundle J) the Animator drivers, the random group and the module variants
                'OnFinishAnime', 'TriggerAnimatorWhenFinish', 'SwitchAnimatorStateWhenFinish', 'SetAnimatorTriggerOnEvent',
                'SetAnimatorFloatByCondition', 'BuffProgressFloatSource', 'SetAnimatorTriggerByCondition',
                'AuraProjectileSetAnimatorTrigger', 'EmitterRandomGroup', 'SwitchableWhenContainsEquipment',
                # (2026-10-25) owner_follow (`followOwner`, `rootTile`) and pause_scripts (`pauseMove`): field-less
                'FollowOwner', 'FollowOwnerRootTileHeight', 'PauseEffectIfNotMove'}

# ParticleSystem modules the extract carries (fx_extract.particle_system)
MODULES_READ = {'InitialModule', 'EmissionModule', 'ShapeModule', 'SizeModule', 'ColorModule', 'RotationModule',
                'VelocityModule', 'ForceModule', 'ClampVelocityModule', 'NoiseModule', 'UVModule', 'CustomDataModule',
                'TrailModule', 'SubModule', 'InheritVelocityModule', 'SizeBySpeedModule', 'CollisionModule'}
# (2026-10-22) the one way each of these is read (fx_extract.particle_system): another setting is reported (`particle`)
MODULE_MODES = {'InheritVelocityModule': ('m_Mode', 0, 'mode 1 Current (follows the emitter all its life)'),
                'CollisionModule': ('type', 0, 'type 1 World (collides with the scene\'s colliders)')}
# shape types render/fxplayer.js emits from (the `switch (sh.type)` of its emitter); others fall back to a point
SHAPES_DRAWN = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17, 18}
SHAPE_NAMES = {6: 'Mesh', 13: 'MeshRenderer', 14: 'SkinnedMeshRenderer', 19: 'Sprite', 20: 'SpriteRenderer'}

# material textures / values render/fxplayer.js reads (makeMaterial, CLIP_UNIFORM, CLIP_COMP) — test/local-extract.test.js
# keeps these lists equal to the names in fxplayer.js
PLAYER_TEXTURES = {'_MainTex', '_AddTex', '_DissolveTex', '_DissolveTex_01', '_DissolveTex_02', '_DissolveTexB', '_DissolveTexC', '_DisturbTex', '_NoiseTex',
                   '_DisturTex', '_DisturTex_02', '_MaskTex', '_RamTex', '_WeightTex'}
PLAYER_VALUES = {'_Color', '_MainColor', '_TintColor', '_UVTween', '_AddFactor', '_Amount', '_Amount_01', '_Amount_02',
                 '_AnchorU', '_AnchorU_02', '_AnchorV', '_AnchorV_02', '_BorderWidth', '_BorderWidth_01', '_BorderWidth_02',
                 '_DissolveIntensity', '_DissolveUSpeed', '_DissolveVSpeed', '_DisturbInfluenceDissolveUV',
                 '_DisturbInfluenceMainUV', '_DisturbUSpeed', '_DisturbVSpeed', '_DstBlend', '_HGCustomVertexStream',
                 '_IntensityU', '_IntensityU_02', '_IntensityV', '_IntensityV_02', '_MainColorACtrl', '_MainUSpeed',
                 '_MainVSpeed', '_Opacity', '_RimPower', '_ToggleUseDissolve', '_ToggleUseDisturb2', '_UseDissolveTex', '_ZTest',
                 '_CullMode', '_ZWrite', '_SrcBlend', '_BaselineZ',
                 '_Dissolve', '_TexSpeed', '_TexSpeed2', '_TintColorB', '_TintColorC'}
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
    'Torappu/Particles/Optimize/Dissolve AB MultiTex',   # 2026-10-18 (战场#06's screen_desert_*)
    'Torappu/Particles/Rim/Rim Texture (Add)', 'Torappu/Particles/Rim/Rim Texture (AlphaBlend)',
    'Torappu/Particles/Rim/Rim Tint (Add)', 'Torappu/Particles/Rim/Rim Tint (AlphaBlend)',
    'Torappu/Particles/Mask/Mask (Add)', 'Torappu/Particles/Mask/Mask (AlphaBlend)',
    'Torappu/Particles-L2D/Ram/Disturb(CustomData)', 'Torappu/Particles-L2D/Disturb/Disturb(CustomData)',
    'Torappu/Particles-L2D/Dissolve/Dissolve(CustomData)', 'Torappu/Particles-L2D/Dissolve/Dissolve Add',
    'Torappu/Particles-L2D/AlphaBlend',   # 2026-10-21 (盟约·辅助干员's csuppo hit): properties, tags and blend state = Particles/AlphaBlend
    # 2026-10-26 (酒神's hits, buffs, range and 迷狂牢笼): the pixel stage of Ram/Disturb(CustomData) with every channel at its
    # default, on the same constant slots; the vertex stage moves only the depth to the `_BaselineZ` plane (fxplayer.js uZFlat)
    'Torappu/Particles/ZDistort/Disturb(CustomData)',
    # 2026-10-26: likewise Particles/Additive, /AlphaBlend and Dissolve/Dissolve(CustomData) without their channel selectors
    # (main rgba, dissolve .r), with the same pass states and the same vertex stage (uZFlat)
    'Torappu/Particles/ZDistort/Additive', 'Torappu/Particles/ZDistort/AlphaBlend',
    'Torappu/Particles/ZDistort/Dissolve(CustomData)',
    # 2026-10-22: Unity's legacy particle shaders, by their pass states (SrcAlpha One / SrcAlpha OneMinusSrcAlpha — 2 × tint ×
    # vertex × texture; Premultiply One OneMinusSrcAlpha — vertex × texture × vertex alpha, Unity's Default-Particle)
    'Legacy Shaders/Particles/Additive', 'Legacy Shaders/Particles/Alpha Blended',
    'Legacy Shaders/Particles/Alpha Blended Premultiply',
}

# known items: 'kind:what' -> (status, note). `todo` = known, not drawn as the client does (the 2026-10-16 baseline; the
# open list is docs/rules/fx.md 「추출 누락 보고」); `hand` = drawn by hand-written render code instead (the note says where);
# `none` = draws nothing, or the player already does the same. Anything not here is `new`.
_TODO, _HAND, _NONE = 'todo', 'hand', 'none'
KNOWN = {
    # components
    'component:MeshCollider': (_NONE, 'physics / ray casts only'),
    'component:BoxCollider': (_NONE, 'physics / ray casts only'),
    # client scripts
    'script:FinishEffectViaOwnerBuff': (_HAND, 'finishes when the owner\'s buff ends; only on 余 S3, drawn by render/fxgame.js (its tiles)'),
    'script:SwitchableEffectByBuffStackCnt': (_HAND, 'a variant by buff stack count; only 信仰搅拌机\'s rmixer_buff_01 (`_stackCnt` 3, GE): '
                                              'render/fxstatus.js STACK_FX \'rmixer:t1\''),
    'script:OnPlayAudioPlayer': (_NONE, 'a sound, not drawn (audio is separate)'),
    'script:Svash2FlyToPredefinedTokenCard': (_HAND, 'flies 凛御银灰\'s eagle to his 风雪之眼 deploy card, which this HUD does not have: '
                                                      'render/fxgame.js startFly ends it in place after 0.5 s (docs/rules/fx.md 凛御银灰 S3)'),
    'script:ColorModifier': (_HAND, 'tints the owner model: render/units.js (stealth greying)'),
    'script:YuS3EffectBehaviour': (_HAND, 'render/fxgame.js (余 S3 tiles)'),
    'script:YuS3EffectWithEdgeBehaviour': (_HAND, 'render/fxgame.js (余 S3 tiles)'),
    # (2026-10-21) first met when --coverage walked the CN 선발 bundles, the route cursors and the enemies' packs
    # (2026-10-22) no such class in the EN client (the CN client's scripts are not read): judged by their field names
    'script:#3354437260492772109 _ignoreOwnerValid,_rotateIfFaceLeft,_rotation': (
        _NONE, 'CN client only: turns 予愿安洁莉娜\'s S2 flight trails by `_rotation` when facing left — (0, 0, 0) on both '
               'prefabs, nothing to turn [ASSUMED]'),
    'script:#7584231671898059191 _flipYWhenLeft': (_HAND, 'CN client only: flips 克莱门莎\'s S2 bullet upside down when it flies '
                                                   'left — with the flight turned 180° the same as the left / right mirror '
                                                   'render/fxgame.js gives it (pickFx \'anchor\') [ASSUMED]'),
    'script:PreviewCursor': (_HAND, 'the route preview cursor\'s mover (`_moveSpeed`, `_height`): render/fxroute.js'),
    'script:SimpleEffect': (_HAND, 'only S_desert_wall_02_start_Mesh (s.ab), which the player never plays (see shader:Unlit/Texture)'),
    # (2026-10-21, official client) EffectData_Projectile (Effects.Data, a SourceData) is two Transform lists and a .ctor: no
    # runtime code of the 2026-10-14 EN client reads it — ProjectileEffect's own `_inactiveOnFinish` is
    # what the client switches off
    'script:EffectData_Projectile': (_NONE, 'data only: no runtime code reads it (ProjectileEffect\'s own `_inactiveOnFinish` is read)'),
    'script:SwitchableEffectByBlackboardValue': (_TODO, 'plays `_effects[v − 1]` for v = the int `_blackboardKey` of the owner\'s buff '
                                                 '`_buffKey` (1..count, none otherwise; checked every `_updateInterval` — '
                                                 '_UpdateEffect): 灼藤\'s ramp, which the sim does not report'),
    # (2026-10-21) without a serialized field, named from the client's MonoScripts; (2026-10-25) its Update read in the client:
    # FollowOwner, FollowOwnerRootTileHeight and PauseEffectIfNotMove are read now (SCRIPTS_READ)
    'script:PauseEffectIfDisappeared': (_TODO, 'pauses the effect while its owner is an Enemy whose `isDisappeared` is set (a DISAPPEAR '
                                        'leg, a 驮兽 passenger); the view of such an enemy leaves the board (render/app.js) and '
                                        'cannot tell it from a leak: 5 hit effects of 隐德来希 [todo: a view flag for it]'),
    # particle systems
    # materials (values: the extracted materials, 2026-10-16)
    'property:Torappu/Particles/Disturb/Disturb Anchor _Weight': (_NONE, 'the toggle behind keyword _WEIGHT_ON, which the player reads (all 198 materials agree)'),
    # clips
    'clip:binding to a path outside the Animator': (_NONE, 'the clip names a node the prefab does not have (deleted in authoring): '
                                                    'Unity binds nothing either'),
    # (2026-10-22) a clip's particle module values, trail length, MeshRenderer switch and FxUVTweener speeds are tracks now
    # (fx_extract.py ANIMATED_VALUES → render/fxplayer.js PS_ANIM / UVT_ANIM); (2026-10-23) also the VelocityModule switch
    # (fx_extract.py clip_modules: the enemies' mcmstr_buff_04_start)
    'script:EffectImportData': (_NONE, 'import settings (`_importName`, `_resourceName`, `_sortingLayerId`, `_removeTopAnimator` …): '
                                'no runtime code of the 2026-10-14 EN client refers to the class (2026-10-25)'),
    'script:SyncEffectScaleWithAuraRangeRadius': (_TODO, 'scales the effect with its owner\'s aura ability range (÷ `_effectOriginRadius`): '
                                                  'only enemy_lrmm_range_01, of an enemy no stage of this mode fields (2026-10-25)'),
    'clip:material property the shader does not declare': (_NONE, 'Unity sets a value no pass reads'),
    'shader:Unlit/Texture': (_HAND, 'only S_desert_wall_02_start_Mesh (s.ab), which the player never plays: scene_extract.py '
                                    '--devices bakes its mesh into the 土石结构 model, drawn opaque and unlit by board3d/official.js'),
    'clip:material property on a node with nothing drawn': (
        _NONE, 'its renderer draws nothing in the client either (an empty MeshFilter: mostma fangkuai, nearl2 add2)'),
    # dependencies (EN client)
    'dependency:CAB-658d74aab777086fc32b93f385be999a: not in the CAB index (rebuild it: --build-cab-index)': (
        _NONE, 'the client\'s MonoScripts (every m_Script points there): the extract reads none of them'),
}

# a shader property type (Unity SerializedProperty m_Type)
TEXTURE = 4

# ------------------------------------------------------------ feature signatures (unverified, 2026-10-20)

# the verified list: {'prefabs': {'bundle/name': {'date', 'by': 'arena' | 'match', 'features': [...], 'todo': [...],
# 'notes': [...]}}}. `features` is the prefab's signature when it was checked, so a feature the extract starts carrying
# later shows up unverified until the prefab is checked again; `todo` = its fx_coverage todo items then, `notes` = the
# differences seen on screen (docs/rules/fx.md 「이펙트 골든 세트」)
VERIFIED = Path(__file__).parent / 'fx-verified.json'
ROOT = Path(__file__).resolve().parents[2]
FX_OUT = ROOT / 'public' / 'assets' / 'local' / 'fx'
# material floats that switch how the player draws (blend, depth, culling, the dissolve / disturb toggles)
SWITCH_FLOATS = ('_CullMode', '_Cull', '_ZTest', '_ZWrite', '_SrcBlend', '_DstBlend', '_HGCustomVertexStream',
                 '_ToggleUseDissolve', '_ToggleUseDisturb2', '_UseDissolveTex')
# the clip binding render/fxplayer.js plays among the `attr:<crc32>` ones (ACTIVE_PROP: Mecanim type 1, m_IsActive);
# the others it skips, and the `clip` kind reports them
ACTIVE_ATTR = 'attr:2086281974'


def _key_paths(v, path, out):
    """Every key path of an extracted value, list items written `[]`; a min-max curve ({m, s, …}) and the clip curves are
    leaves (their inner keys are values, not fields)."""
    if isinstance(v, dict):
        if 'm' in v and path:
            out.add(path)
            return
        for k, x in v.items():
            _key_paths(x, f'{path}.{k}' if path else k, out)
    elif isinstance(v, (list, tuple)):
        if path.endswith('curves'):
            out.add(path)
            return
        for x in v:
            if isinstance(x, (dict, list, tuple)):
                _key_paths(x, path + '[]', out)
            else:
                out.add(path + '[]')
                break
    else:
        out.add(path)


def signature(d):
    """The features of one extracted effect (an fx_extract.py JSON): what render/fxplayer.js consumes, with the values
    that changed its behaviour before (spawn / mount points, the face rotate type, particle render mode, space and shape,
    shaders, culling and blend switches, clip tracks), plus `key:<path>` for every field the extract writes outside the
    materials — so a field the extractor starts carrying is a new, unverified feature without anyone listing it here."""
    s = set()
    for k in ('spawn', 'height', 'finish', 'offFinish', 'right', 'back', 'lineDyn'):
        if k in d:
            s.add(f'top:{k}' + (f'={d[k]}' if k == 'spawn' else ''))
    if 'mount' in d:
        s.add(f"mount:type={d['mount']['type']}")
        s.add(f"mount:keep={d['mount']['keepOriginRotation']}")
    if 'face' in d:
        s.add(f"face:rot={d['face']['rot']}")
        s.update(f'face:{k}' for k in d['face'] if k != 'rot')
    for nd in d['nodes']:
        s.update(f'node:{k}' for k in ('mesh', 'trailR', 'lineR', 'skin', 'uvt', 'uvr', 'delay', 'sdelay') if k in nd)
        if not nd.get('active', True):
            s.add('node:inactive')
        ps = nd.get('ps')
        if ps:
            s.add(f"ps:render={ps['render']['mode']}")
            s.add(f"ps:space={ps['space']}")
            if ps.get('shape'):
                s.add(f"ps:shape={ps['shape']['type']}")
            s.update(f'ps:mod:{m}' for m in ps['mods'])
            if ps.get('prewarm'):
                s.add('ps:prewarm')
    for m in d['materials'].values():
        s.add(f"shader:{m['shader']}")
        s.update(f'tex:{t}' for t in m.get('tex') or {})
        fl = m.get('floats') or {}
        s.update(f'mat:{k}={fl[k]:g}' for k in SWITCH_FLOATS if k in fl)
        s.update(f'kw:{k}' for k in m.get('keywords') or [])
    for c in d['clips']:
        s.add('clip:legacy' if c.get('legacy') else 'clip:mecanim')
        for t in c['tracks']:
            p = t['prop']
            if p.startswith('mat:'):
                s.add('track:' + p.split('.')[0])
            elif p == ACTIVE_ATTR and t.get('type') == 1:
                s.add('track:active')
            elif not p.startswith('attr:'):
                s.add('track:' + p)
    keys = set()
    _key_paths({k: v for k, v in d.items() if k != 'materials'}, '', keys)
    s.update(f'key:{k}' for k in keys)
    return s


def load_verified(path=VERIFIED):
    """{'bundle/name': entry} of the verified list ({} when there is none)."""
    p = Path(path)
    return json.loads(p.read_text(encoding='utf-8')).get('prefabs', {}) if p.exists() else {}


def verified_features(verified):
    return set().union(*(set(e.get('features') or []) for e in verified.values()))


def greedy_cover(sets, want):
    """[(key, features it adds)] picked greedily until `want` is covered (or nothing adds more)."""
    left, pick = set(want), []
    while left:
        k = max(sets, key=lambda k: len(sets[k] & left))
        n = len(sets[k] & left)
        if not n:
            break
        pick.append((k, n))
        left -= sets[k]
    return pick


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


class Coverage:
    """The report of one extraction run. `begin(key)` names the prefab the following calls are about."""

    def __init__(self, class_fields=None, verified=VERIFIED):
        self.items = {}        # (kind, what) -> {'kind', 'what', 'detail', 'prefabs': set}
        self.key = None
        self.sigs = {}         # prefab key -> signature() (unverified)
        self.verified = verified   # the verified list's path (load_verified)
        self.class_fields = class_fields   # the class → field-name table's path: names the unknown scripts (lazy)
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
        """A reader with a raw-word fallback (root_effect …) ran on a component of that script: not ok = `why` (the raw
        words were read because the type tree did not, the fallback does not recognise the layout or disagrees with the
        type tree), or without `why` nothing was read at all."""
        if not ok:
            self.add('reader', f'{script}: {why or "layout not recognised, nothing read"}')

    def particle(self, ps):
        """A ParticleSystem type tree."""
        for k, v in ps.items():
            if k.endswith('Module') and isinstance(v, dict) and v.get('enabled') and k not in MODULES_READ:
                self.add('module', k)
        for k, (field, read, what) in MODULE_MODES.items():
            v = ps.get(k) or {}
            if v.get('enabled') and v.get(field, read) != read:
                self.add('module', f'{k} {what}')
        sh = ps.get('ShapeModule') or {}
        if sh.get('enabled') and sh.get('type') not in SHAPES_DRAWN:
            t = sh.get('type')
            self.add('shape', f'{t} {SHAPE_NAMES.get(t, "?")}')
        if sh.get('enabled') and sh.get('type') == 6:   # (2026-10-22) the one way a Mesh shape is read
            ms = sh.get('m_MeshSpawn') or {}
            if ms.get('mode', 0) != 0:
                self.add('shape', f'6 Mesh m_MeshSpawn mode {ms.get("mode")} (vertices / edges in order, not at random)')
            if sh.get('m_MeshNormalOffset', 0) or sh.get('alignToDirection'):
                self.add('shape', '6 Mesh normal offset / align to direction')

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

    def unwalked(self, why, keys):
        """(2026-10-21) prefabs of the index the --coverage walk could not reach (`why`: no extractor of their client, their
        bundle missing, not in it): whatever they leave out is missing from the report."""
        for k in keys:
            self.add('unwalked', why, 'listed in the index, not walked: the report says nothing about them', key=k)

    def stale(self, path):
        self.add('stale', path, 'the file on disk differs from a fresh extraction here: re-extract the bundle')

    def prefab(self, d):
        """The extracted effect of the current prefab (its JSON value): its signature, for the unverified kind."""
        if self.key:
            self.sigs[self.key] = signature(json.loads(json.dumps(d)))

    def unverified(self):
        """{feature: set of prefabs} of this run's prefabs that the verified list does not cover."""
        done = verified_features(load_verified(self.verified))
        out = {}
        for k, sig in self.sigs.items():
            for f in sig - done:
                out.setdefault(f, set()).add(k)
        return out

    # ------------------------------------------------------------ naming by the class → field-name table

    def class_of(self, fields):
        """The client class whose serialized fields hold the most of `fields` (the smallest such class on a tie), from the
        class → field-name table; None without a table or fields."""
        if not fields or not self.class_fields:
            return None
        if self._classes is None:
            self._classes = load_class_fields(self.class_fields)
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
        if kind in ('unverified', 'unwalked'):
            return (kind, None)
        k = KNOWN.get(f'{kind}:{what}')
        return k if k else ('new', None)

    def report(self):
        out = []
        for (kind, what), it in sorted(self.items.items()):
            st, note = self.status(kind, what)
            out.append({'kind': kind, 'what': what, 'status': st, 'note': note, 'detail': it['detail'],
                        'count': len(it['prefabs']), 'prefabs': sorted(it['prefabs'])})
        for f, ks in sorted(self.unverified().items()):
            out.append({'kind': 'unverified', 'what': f, 'status': 'unverified', 'note': None,
                        'detail': 'no prefab of the verified list (fx-verified.json) has it', 'count': len(ks),
                        'prefabs': sorted(ks)})
        return out

    def summary(self, examples=4):
        """Printable lines: each new item with up to `examples` prefabs, then one line for the known ones."""
        rep = self.report()
        lines = []
        new = [r for r in rep if r['status'] == 'new']
        for r in new:
            ex = ', '.join(r['prefabs'][:examples]) + (' …' if r['count'] > examples else '')
            lines.append(f"[fx] NOT HANDLED {r['kind']} {r['what']}: {r['count']} prefab(s) — {ex}")
        known = [r for r in rep if r['status'] in ('todo', 'hand', 'none')]
        if known:
            n = {st: sum(r['status'] == st for r in known) for st in ('todo', 'hand', 'none')}
            lines.append(f"[fx] known gaps: {n['todo']} todo, {n['hand']} drawn by hand-written code, {n['none']} draw nothing "
                         '(fx_extract.py --coverage lists them)')
        for r in (r for r in rep if r['status'] == 'unwalked'):
            ex = ', '.join(r['prefabs'][:examples]) + (' …' if r['count'] > examples else '')
            lines.append(f"[fx] NOT WALKED {r['what']}: {r['count']} prefab(s) — {ex}")
        if len(known) + len(new) == 0:
            lines.append('[fx] coverage: nothing left out')
        unv = [r for r in rep if r['status'] == 'unverified']
        if self.sigs:
            n = len(set().union(*self.sigs.values()))
            lines.append(f'[fx] unverified: {len(unv)} of {n} feature(s) of these {len(self.sigs)} prefab(s) on no verified '
                         'prefab (fx_coverage.py unverified lists them)')
        return lines


def load_class_fields(path):
    """{class name: (set of its instance field names, base class or None)} from a class → field-name table of the client's
    scripts: a JSON object { "<class name>": { "fields": [instance field names], "base": "<base class or null>" } }, kept
    outside the repository. A missing file is an empty table (the unknown scripts are then listed by PathID)."""
    p = Path(path)
    if not p.exists():
        return {}
    doc = json.loads(p.read_text(encoding='utf-8'))
    return {cls: (set(v.get('fields') or ()), v.get('base')) for cls, v in doc.items()}


# ------------------------------------------------------------ on its own: the verified list against the files on disk

def disk_signatures(fx_dir=FX_OUT, index='index.json'):
    """{'bundle/name': signature()} of every extracted effect listed in the index (no client needed)."""
    fx_dir = Path(fx_dir)
    out = {}
    for b, names in json.loads((fx_dir / index).read_text())['bundles'].items():
        for n in names:
            f = fx_dir / b / f'{n}.json'
            if f.exists():
                out[f'{b}/{n}'] = signature(json.loads(f.read_text(encoding='utf-8')))
    return out


def rare_first_cover(sets, want):
    """[(key, features it adds)] that covers `want` rarest feature first (maintainer decision 2026-10-20: the golden set is
    checked from the rare features up, 10 to 15 prefabs a batch): the least used uncovered feature picks, of the prefabs
    that have it, the one adding the most uncovered features."""
    users = {}
    for k, s in sets.items():
        for f in s & want:
            users.setdefault(f, []).append(k)
    left, pick = set(users), []
    while left:
        f = min(left, key=lambda f: (len(users[f]), f))
        k = max(sorted(users[f]), key=lambda k: len(sets[k] & left))
        pick.append((k, len(sets[k] & left)))
        left -= sets[k]
    return pick


def cmd_unverified(a):
    sigs = disk_signatures(a.fx)
    ver = load_verified(a.verified)
    done = verified_features(ver)
    feats = set().union(*sigs.values())
    want = feats - done
    users = {f: sorted(k for k, s in sigs.items() if f in s) for f in want}
    rare = {f: ks for f, ks in users.items() if len(ks) <= a.rare}
    cover = rare_first_cover(sigs, want)
    print(f'[fx] {len(sigs)} prefab(s), {len(feats)} feature(s); verified: {len(ver)} prefab(s), {len(feats & done)} feature(s); '
          f'unverified {len(want)} ({len(rare)} on <= {a.rare} prefab(s)); cover rarest first {len(cover)} prefab(s), '
          f'greedy {len(greedy_cover(sigs, want))}')
    for i, (k, n) in enumerate(cover[:a.top]):
        print(f'  {i + 1:3} +{n:<3} {k}')
    if len(cover) > a.top:
        print(f'  … {len(cover) - a.top} more (--top)')
    if a.json:
        Path(a.json).write_text(json.dumps({
            'features': sorted(feats), 'unverified': sorted(want),
            'rare': [{'feature': f, 'prefabs': rare[f]} for f in sorted(rare)],
            'cover': [{'prefab': k, 'adds': n} for k, n in cover]}, ensure_ascii=False, indent=1))
        print(f'[fx] -> {a.json}')


def cmd_verify(a):
    p = Path(a.verified)
    doc = json.loads(p.read_text(encoding='utf-8')) if p.exists() else {'prefabs': {}}
    todo = {}
    if a.coverage and Path(a.coverage).exists():
        for r in json.loads(Path(a.coverage).read_text(encoding='utf-8')):
            if r['status'] == 'todo':
                for k in r['prefabs']:
                    todo.setdefault(k, []).append(f"{r['kind']}:{r['what']}")
    else:
        print(f'[fx] no coverage report ({a.coverage}): `todo` left empty — fx_extract.py --coverage writes it', file=sys.stderr)
    for key in a.prefab:
        b, n = key.split('/', 1)
        f = Path(a.fx) / b / f'{n}.json'
        if not f.exists():
            sys.exit(f'[fx] {key}: no extracted file {f}')
        doc['prefabs'][key] = {'date': a.date, 'by': a.by,
                               'features': sorted(signature(json.loads(f.read_text(encoding='utf-8')))),
                               'todo': sorted(todo.get(key, [])), 'notes': a.note or []}
        print(f"[fx] verified {key} ({a.by}, {len(doc['prefabs'][key]['features'])} features, "
              f"{len(doc['prefabs'][key]['todo'])} todo)")
    doc['prefabs'] = dict(sorted(doc['prefabs'].items()))
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')


def main(argv=None):
    ap = argparse.ArgumentParser(description='the verified list of extracted effects (fx-verified.json) against the files on disk')
    ap.add_argument('--fx', default=str(FX_OUT), help='the extracted effects (index.json and bundle folders)')
    ap.add_argument('--verified', default=str(VERIFIED), help='the verified list')
    sub = ap.add_subparsers(dest='cmd', required=True)
    u = sub.add_parser('unverified', help='the features no verified prefab has, and the prefabs that cover them rarest first')
    u.add_argument('--rare', type=int, default=3, help='a rare feature: on at most this many prefabs')
    u.add_argument('--top', type=int, default=15, help='cover lines printed (one batch)')
    u.add_argument('--json', help='write { features, unverified, rare, cover } here')
    v = sub.add_parser('verify', help='add prefabs the maintainer compared on screen with the official game')
    v.add_argument('prefab', nargs='+', help='bundle/name')
    v.add_argument('--by', required=True, choices=('arena', 'match'), help='checked in the debug arena or in a real match')
    v.add_argument('--note', action='append', help='a difference seen on screen (repeatable)')
    v.add_argument('--date', default=datetime.date.today().isoformat())
    v.add_argument('--coverage', default=str(ROOT / '.cache' / 'fx-coverage.json'),
                   help='the fx_extract.py --coverage report the prefabs\' todo items come from')
    a = ap.parse_args(argv)
    {'unverified': cmd_unverified, 'verify': cmd_verify}[a.cmd](a)


if __name__ == '__main__':
    main()
