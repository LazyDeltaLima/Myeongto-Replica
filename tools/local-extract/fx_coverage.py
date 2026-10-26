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
    field       a ParticleSystem / renderer field whose value the pipeline does not play, or one PS_FIELDS does not classify
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
    -6714358757634045276: 'CameraEffect',   # (2026-10-26) by its fields; screen_com_poison_04 (the time-out screen)
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
# (2026-10-26, effect bundle T) every serialized field of a drawn ParticleSystem (modules of MODULES_READ, when enabled) and
# of its ParticleSystemRenderer (`renderer.`), by its dotted type-tree path ([] = each list item), and what the pipeline
# does with it — so a field nobody carries is listed by its value instead of dropped without a word (酒神 S2's hit wave:
# scalingMode was carried as `scaling` and never played, and the module-level check above could not see it):
#   _K(key)            carried by fx_extract.particle_system under that key of the extract's `ps` and played by
#                      render/fxplayer.js — test/fx-coverage.test.js pins the field name to particle_system and the
#                      key's last name to fxplayer.js
#   _V(key, values)    carried, but the player handles only these values: another one is reported
#   _A(value, why)     not carried or not played: the pipeline draws as if it were `value`; another one is reported
#   _N(why)            makes no difference here (or another check reports it)
# A field outside the table (a client update, a module first read) is reported as not classified. `when` (any entry):
# (ps, renderer) -> the field matters at all (a cone's arc, a separate axis).
def _K(key, when=None):
    return ('key', key, None, when)


def _V(key, values, when=None):
    return ('values', key, frozenset(values), when)


def _A(value, why, when=None):
    return ('assume', value, why, when)


def _N(why, when=None):
    return ('none', None, why, when)


def _R(why, when=None):
    """(2026-10-26, effect bundle W1) read by the extractor to decide whether or how it carries the component (a switch, a
    reference) — no key of its own; the test pins the field name to its reader (COMP_READERS)."""
    return ('read', None, why, when)


def _mod(ps, m):
    return ps.get(m) or {}


def _shape_in(*types):
    return lambda ps, r: _mod(ps, 'ShapeModule').get('type') in types


def _flag(m, f):
    return lambda ps, r: bool(_mod(ps, m).get(f))


_ARC = (4, 7, 8, 9, 10, 11, 17)   # the shapes with an arc (cones, circles, the donut)
_LIGHTING = 'lighting, shadows, probes, batching: the effects are unlit and cast nothing'
_SHAPE_KIND = 'the `shape` kind reports it (particle())'
PS_FIELDS = {
    'lengthInSec': _K('dur'), 'looping': _K('loop'), 'startDelay': _K('delay'), 'simulationSpeed': _K('speedMul'),
    'moveWithTransform': _V('space', (0, 1)),
    'moveWithCustomTransform': _N('only with moveWithTransform 2 (Custom), reported there'),
    'scalingMode': _V('scaling', (0, 1, 2)),
    'prewarm': _K('prewarm'),
    'playOnAwake': _A(True, 'a system that waits for a script to play it'),
    'autoRandomSeed': _N('the random sequence only'), 'randomSeed': _N('the random sequence only'),
    'cullingMode': _N('what Unity does off screen'),
    'emitterVelocityMode': _N('[ASSUMED] without a Rigidbody on the effect Unity takes the Transform\'s motion either way'),
    'ringBufferMode': _A(0, 'particles kept alive in a ring buffer'),
    'ringBufferLoopRange.x': _N('only with ringBufferMode'), 'ringBufferLoopRange.y': _N('only with ringBufferMode'),
    'stopAction': _N('what happens to the GameObject when the system stops'),
    'useUnscaledTime': _A(False, 'runs on unscaled time'),
    'm_GameObject': _N('the owner'),
    # InitialModule
    'InitialModule.enabled': _N('always on'),
    'InitialModule.startLifetime': _K('life'), 'InitialModule.startSpeed': _K('speed'), 'InitialModule.startColor': _K('color'),
    'InitialModule.startSize': _K('size'), 'InitialModule.size3D': _K('sizeY'),
    'InitialModule.startSizeY': _K('sizeY', _flag('InitialModule', 'size3D')),
    'InitialModule.startSizeZ': _K('sizeZ', _flag('InitialModule', 'size3D')),
    'InitialModule.startRotation': _K('rot'), 'InitialModule.rotation3D': _K('rotX'),
    'InitialModule.startRotationX': _K('rotX', _flag('InitialModule', 'rotation3D')),
    'InitialModule.startRotationY': _K('rotY', _flag('InitialModule', 'rotation3D')),
    'InitialModule.maxNumParticles': _K('max'), 'InitialModule.gravityModifier': _K('gravity'),
    'InitialModule.randomizeRotationDirection': _K('flipRot'),
    'InitialModule.customEmitterVelocity.x': _N('only with emitterVelocityMode 2 (Custom)'),
    'InitialModule.customEmitterVelocity.y': _N('only with emitterVelocityMode 2 (Custom)'),
    'InitialModule.customEmitterVelocity.z': _N('only with emitterVelocityMode 2 (Custom)'),
    # EmissionModule
    'EmissionModule.enabled': _N('the module switch'), 'EmissionModule.rateOverTime': _K('rate'),
    'EmissionModule.rateOverDistance': _K('dist'),
    'EmissionModule.m_BurstCount': _K('bursts'), 'EmissionModule.m_Bursts': _N('an empty burst list'),
    'EmissionModule.m_Bursts[].time': _K('bursts[].t'), 'EmissionModule.m_Bursts[].countCurve': _K('bursts[].n'),
    'EmissionModule.m_Bursts[].cycleCount': _K('bursts[].cycles'), 'EmissionModule.m_Bursts[].repeatInterval': _K('bursts[].interval'),
    'EmissionModule.m_Bursts[].probability': _K('bursts[].p'),
    # ShapeModule
    'ShapeModule.enabled': _N('the module switch'), 'ShapeModule.type': _K('shape.type'),
    'ShapeModule.radius.value': _K('shape.radius'),
    'ShapeModule.radius.mode': _K('shape.radMode', _shape_in(12)),
    'ShapeModule.radius.spread': _K('shape.radSpread', _shape_in(12)),
    'ShapeModule.radius.speed': _K('shape.radSpeed', lambda ps, r: _shape_in(12)(ps, r) and _mod(ps, 'ShapeModule').get('radius', {}).get('mode') in (1, 2)),
    'ShapeModule.angle': _K('shape.angle'),
    'ShapeModule.length': _K('shape.length', _shape_in(8, 9)),
    'ShapeModule.arc.value': _K('shape.arc'),
    'ShapeModule.arc.mode': _K('shape.arcMode', _shape_in(*_ARC)),
    'ShapeModule.arc.spread': _K('shape.arcSpread', _shape_in(*_ARC)),
    'ShapeModule.arc.speed': _K('shape.arcSpeed', lambda ps, r: _shape_in(*_ARC)(ps, r) and _mod(ps, 'ShapeModule').get('arc', {}).get('mode') in (1, 2)),
    'ShapeModule.radiusThickness': _K('shape.thick'), 'ShapeModule.boxThickness.x': _K('shape.box'),
    'ShapeModule.boxThickness.y': _K('shape.box'), 'ShapeModule.boxThickness.z': _K('shape.box'),
    'ShapeModule.donutRadius': _K('shape.donut', _shape_in(17)),
    'ShapeModule.m_Position.x': _K('shape.pos'), 'ShapeModule.m_Position.y': _K('shape.pos'), 'ShapeModule.m_Position.z': _K('shape.pos'),
    'ShapeModule.m_Rotation.x': _K('shape.rotE'), 'ShapeModule.m_Rotation.y': _K('shape.rotE'), 'ShapeModule.m_Rotation.z': _K('shape.rotE'),
    'ShapeModule.m_Scale.x': _K('shape.scale'), 'ShapeModule.m_Scale.y': _K('shape.scale'), 'ShapeModule.m_Scale.z': _K('shape.scale'),
    'ShapeModule.alignToDirection': _A(False, 'particles turned to their start direction (`shape.align` is carried, not played)'),
    'ShapeModule.randomDirectionAmount': _K('shape.randDir'),
    'ShapeModule.sphericalDirectionAmount': _K('shape.sphDir'),
    'ShapeModule.randomPositionAmount': _K('shape.randPos'),
    'ShapeModule.placementMode': _K('shape.place', _shape_in(6)), 'ShapeModule.m_UseMeshColors': _K('shape.meshCol', _shape_in(6)),
    'ShapeModule.m_Mesh': _K('shape.mesh', _shape_in(6)),
    'ShapeModule.m_MeshMaterialIndex': _N('only with m_UseMeshMaterialIndex'),
    'ShapeModule.m_UseMeshMaterialIndex': _A(False, 'emits from one sub-mesh', _shape_in(6)),
    'ShapeModule.m_MeshSpawn.mode': _N(_SHAPE_KIND), 'ShapeModule.m_MeshSpawn.speed': _N(_SHAPE_KIND),
    'ShapeModule.m_MeshSpawn.spread': _N(_SHAPE_KIND), 'ShapeModule.m_MeshNormalOffset': _N(_SHAPE_KIND),
    'ShapeModule.m_MeshRenderer': _N(_SHAPE_KIND), 'ShapeModule.m_SkinnedMeshRenderer': _N(_SHAPE_KIND),
    'ShapeModule.m_Sprite': _N(_SHAPE_KIND), 'ShapeModule.m_SpriteRenderer': _N(_SHAPE_KIND),
    'ShapeModule.m_Texture': _A(None, 'a texture masks / colours the start positions'),
    **{f'ShapeModule.{f}': _N('only with m_Texture') for f in (
        'm_TextureAlphaAffectsParticles', 'm_TextureBilinearFiltering', 'm_TextureClipChannel', 'm_TextureClipThreshold',
        'm_TextureColorAffectsParticles', 'm_TextureUVChannel')},
    # over-lifetime modules
    'SizeModule.enabled': _N('the module switch'), 'SizeModule.curve': _K('mods.sizeOL.x'), 'SizeModule.separateAxes': _K('mods.sizeOL.y'),
    'SizeModule.y': _K('mods.sizeOL.y', _flag('SizeModule', 'separateAxes')),
    'SizeModule.z': _K('mods.sizeOL.z', _flag('SizeModule', 'separateAxes')),
    'ColorModule.enabled': _N('the module switch'), 'ColorModule.gradient': _K('mods.colorOL'),
    'RotationModule.enabled': _N('the module switch'), 'RotationModule.curve': _K('mods.rotOL.z'),
    'RotationModule.separateAxes': _K('mods.rotOL.x'),
    'RotationModule.x': _K('mods.rotOL.x', _flag('RotationModule', 'separateAxes')),
    'RotationModule.y': _K('mods.rotOL.y', _flag('RotationModule', 'separateAxes')),
    'VelocityModule.enabled': _N('the module switch (a clip that switches it on is a track: clip_modules)'),
    'VelocityModule.x': _K('mods.velOL.x'), 'VelocityModule.y': _K('mods.velOL.y'), 'VelocityModule.z': _K('mods.velOL.z'),
    'VelocityModule.inWorldSpace': _K('mods.velOL.world'), 'VelocityModule.speedModifier': _K('mods.velOL.speedMul'),
    'VelocityModule.radial': _K('mods.velOL.radial'),
    'VelocityModule.orbitalX': _K('mods.velOL.orbX'), 'VelocityModule.orbitalY': _K('mods.velOL.orbY'),
    'VelocityModule.orbitalZ': _K('mods.velOL.orbZ'),
    'VelocityModule.orbitalOffsetX': _K('mods.velOL.orbOff'), 'VelocityModule.orbitalOffsetY': _K('mods.velOL.orbOff'),
    'VelocityModule.orbitalOffsetZ': _K('mods.velOL.orbOff'),
    'ForceModule.enabled': _N('the module switch'), 'ForceModule.x': _K('mods.force.x'), 'ForceModule.y': _K('mods.force.y'),
    'ForceModule.z': _K('mods.force.z'), 'ForceModule.inWorldSpace': _K('mods.force.world'),
    'ForceModule.randomizePerFrame': _A(False, 'a random force picked anew each frame'),
    'ClampVelocityModule.enabled': _N('the module switch'), 'ClampVelocityModule.magnitude': _K('mods.limit.mag'),
    'ClampVelocityModule.dampen': _K('mods.limit.dampen'), 'ClampVelocityModule.drag': _K('mods.limit.drag'),
    'ClampVelocityModule.separateAxis': _A(False, 'a limit per axis'),
    'ClampVelocityModule.x': _N('only with separateAxis'), 'ClampVelocityModule.y': _N('only with separateAxis'),
    'ClampVelocityModule.z': _N('only with separateAxis'), 'ClampVelocityModule.inWorldSpace': _N('only with separateAxis'),
    'ClampVelocityModule.multiplyDragByParticleSize': _A(True, 'drag not grown with the particle\'s size (the player always grows it)',
                                                         lambda ps, r: _val(_mod(ps, 'ClampVelocityModule').get('drag')) != 0),
    'ClampVelocityModule.multiplyDragByParticleVelocity': _A(True, 'drag not grown with the particle\'s speed (the player always grows it)',
                                                             lambda ps, r: _val(_mod(ps, 'ClampVelocityModule').get('drag')) != 0),
    'NoiseModule.enabled': _N('the module switch'), 'NoiseModule.strength': _K('mods.noise.str'), 'NoiseModule.frequency': _K('mods.noise.freq'),
    'NoiseModule.scrollSpeed': _K('mods.noise.scroll'), 'NoiseModule.damping': _K('mods.noise.damping'),
    'NoiseModule.separateAxes': _K('mods.noise.strY'),
    'NoiseModule.strengthY': _K('mods.noise.strY', _flag('NoiseModule', 'separateAxes')),
    'NoiseModule.strengthZ': _K('mods.noise.strZ', _flag('NoiseModule', 'separateAxes')),
    'NoiseModule.octaves': _K('mods.noise.oct'),
    'NoiseModule.octaveMultiplier': _K('mods.noise.octMul', lambda ps, r: _mod(ps, 'NoiseModule').get('octaves', 1) > 1),
    'NoiseModule.octaveScale': _K('mods.noise.octScale', lambda ps, r: _mod(ps, 'NoiseModule').get('octaves', 1) > 1),
    'NoiseModule.quality': _N('[ASSUMED] Unity\'s 1D / 2D noise — the player samples one 3D field for every quality'),
    'NoiseModule.remapEnabled': _A(False, 'the noise value remapped by a curve'),
    'NoiseModule.remap': _N('only with remapEnabled'), 'NoiseModule.remapY': _N('only with remapEnabled'),
    'NoiseModule.remapZ': _N('only with remapEnabled'),
    'NoiseModule.positionAmount': _K('mods.noise.posAmt'),
    'NoiseModule.rotationAmount': _K('mods.noise.rotAmt'), 'NoiseModule.sizeAmount': _K('mods.noise.sizeAmt'),
    'UVModule.enabled': _N('the module switch'), 'UVModule.tilesX': _K('mods.uv.tx'), 'UVModule.tilesY': _K('mods.uv.ty'),
    'UVModule.animationType': _V('mods.uv.anim', (0, 1)), 'UVModule.rowIndex': _K('mods.uv.row'),
    'UVModule.rowMode': _V('mods.uv.rowMode', (0, 1),
                           lambda ps, r: _mod(ps, 'UVModule').get('animationType') == 1 and _mod(ps, 'UVModule').get('tilesY', 1) > 1),
    'UVModule.frameOverTime': _K('mods.uv.frame'), 'UVModule.startFrame': _K('mods.uv.start'), 'UVModule.cycles': _K('mods.uv.cycles'),
    'UVModule.mode': _A(0, 'frames from a sprite list instead of a grid'), 'UVModule.sprites[].sprite': _N('only with mode 1 (Sprites)'),
    'UVModule.flipU': _A(0, 'a share of the particles mirrored'), 'UVModule.flipV': _A(0, 'a share of the particles mirrored'),
    'UVModule.timeMode': _A(0, 'frames by speed or fps instead of lifetime'), 'UVModule.fps': _N('only with timeMode FPS'),
    'UVModule.speedRange.x': _N('only with timeMode Speed'), 'UVModule.speedRange.y': _N('only with timeMode Speed'),
    'UVModule.uvChannelMask': _N('which mesh UV channels the frames apply to (the quads have one)'),
    'CustomDataModule.enabled': _N('the module switch'),
    **{f'CustomDataModule.{f}{i}': _K('mods.custom') for f in ('mode', 'color', 'vectorComponentCount') for i in (0, 1)},
    **{f'CustomDataModule.vector{i}_{k}': _K('mods.custom') for i in (0, 1) for k in range(4)},
    'TrailModule.enabled': _N('the module switch'), 'TrailModule.mode': _V('mods.trail.mode', (0, 1)),
    'TrailModule.ratio': _K('mods.trail.ratio'), 'TrailModule.lifetime': _K('mods.trail.life'),
    'TrailModule.minVertexDistance': _K('mods.trail.minDist'), 'TrailModule.worldSpace': _K('mods.trail.world'),
    'TrailModule.textureMode': _K('mods.trail.texMode'), 'TrailModule.dieWithParticles': _K('mods.trail.die'),
    'TrailModule.sizeAffectsWidth': _K('mods.trail.sizeWidth'), 'TrailModule.sizeAffectsLifetime': _A(False, 'the trail\'s life follows the size'),
    'TrailModule.inheritParticleColor': _K('mods.trail.inherit'), 'TrailModule.colorOverLifetime': _K('mods.trail.colorOL'),
    'TrailModule.widthOverTrail': _K('mods.trail.width'), 'TrailModule.colorOverTrail': _K('mods.trail.colorOT'),
    'TrailModule.ribbonCount': _A(1, 'several ribbons (`trail.ribbons` is carried, not played)'),
    'TrailModule.splitSubEmitterRibbons': _K('mods.trail.split'),
    'TrailModule.attachRibbonsToTransform': _A(False, 'ribbons joined to the system\'s position'),
    'TrailModule.generateLightingData': _N(_LIGHTING), 'TrailModule.shadowBias': _N(_LIGHTING),
    'InheritVelocityModule.enabled': _N('the module switch'), 'InheritVelocityModule.m_Mode': _N('MODULE_MODES reports another mode'),
    'InheritVelocityModule.m_Curve': _K('mods.inherit.k'),
    'SizeBySpeedModule.enabled': _N('the module switch'), 'SizeBySpeedModule.curve': _K('mods.sizeBySpeed.x'),
    'SizeBySpeedModule.range.x': _K('mods.sizeBySpeed.range'), 'SizeBySpeedModule.range.y': _K('mods.sizeBySpeed.range'),
    'SizeBySpeedModule.separateAxes': _K('mods.sizeBySpeed.y'),
    'SizeBySpeedModule.y': _K('mods.sizeBySpeed.y', _flag('SizeBySpeedModule', 'separateAxes')),
    'SizeBySpeedModule.z': _K('mods.sizeBySpeed.z', _flag('SizeBySpeedModule', 'separateAxes')),
    'CollisionModule.enabled': _N('the module switch'), 'CollisionModule.type': _N('MODULE_MODES reports type 1 World'),
    'CollisionModule.m_Planes': _K('mods.collide.planes'), 'CollisionModule.m_Dampen': _K('mods.collide.dampen'),
    'CollisionModule.m_Bounce': _K('mods.collide.bounce'), 'CollisionModule.m_EnergyLossOnCollision': _K('mods.collide.lifeLoss'),
    'CollisionModule.minKillSpeed': _K('mods.collide.minKill'), 'CollisionModule.maxKillSpeed': _K('mods.collide.maxKill'),
    'CollisionModule.radiusScale': _A(1, 'the collision radius scaled (`collide.radius` is carried, not played)'),
    'CollisionModule.collisionMode': _A(0, '2D collisions'),
    **{f'CollisionModule.{f}': _N('only with type 1 World (collides with the scene\'s colliders)') for f in (
        'quality', 'voxelSize', 'maxCollisionShapes', 'collidesWith.m_Bits', 'collidesWithDynamic', 'interiorCollisions',
        'colliderForce', 'multiplyColliderForceByCollisionAngle', 'multiplyColliderForceByParticleSize',
        'multiplyColliderForceByParticleSpeed')},
    'CollisionModule.collisionMessages': _N('script messages'),
    'SubModule.enabled': _N('the module switch'), 'SubModule.subEmitters[].emitter': _K('mods.sub[].node'),
    'SubModule.subEmitters[].type': _V('mods.sub[].type', (0,)), 'SubModule.subEmitters[].properties': _K('mods.sub[].props'),
    'SubModule.subEmitters[].emitProbability': _A(1, 'a sub-emitter fires only sometimes (`sub[].p` is carried, not played)'),
    # the ParticleSystemRenderer
    'renderer.m_RenderMode': _V('render.mode', (0, 1, 2, 4, 5)),
    'renderer.m_RenderAlignment': _V('render.align', (0, 1, 2, 3)),
    'renderer.m_LengthScale': _K('render.lengthScale'), 'renderer.m_VelocityScale': _K('render.velScale'),
    'renderer.m_CameraVelocityScale': _A(0, 'a stretch by the camera\'s motion'),
    'renderer.m_FreeformStretching': _A(False, 'stretched quads not turned to the camera', lambda ps, r: r.get('m_RenderMode') == 1),
    'renderer.m_RotateWithStretchDirection': _N('only with m_FreeformStretching'),
    'renderer.m_AllowRoll': _N('billboards that do not roll with the camera: the board\'s camera does not roll'),
    'renderer.m_NormalDirection': _N('billboard normals for lit materials: the effects are unlit'),
    'renderer.m_Pivot.x': _K('render.pivot'), 'renderer.m_Pivot.y': _K('render.pivot'), 'renderer.m_Pivot.z': _K('render.pivot'),
    'renderer.m_Flip.x': _K('render.flip'), 'renderer.m_Flip.y': _K('render.flip'), 'renderer.m_Flip.z': _K('render.flip'),
    'renderer.m_SortingOrder': _K('render.order'), 'renderer.m_SortingFudge': _K('render.fudge'),
    'renderer.m_SortingLayer': _K('render.layer'),
    'renderer.m_SortingLayerID': _N('the layer\'s place is m_SortingLayer'),
    'renderer.m_SortMode': _V('render.sortMode', (0, 1, 2, 3, 4)),
    'renderer.m_MaxParticleSize': _N('[ASSUMED] a cap on a billboard\'s share of the screen: the board\'s camera keeps them under it'),
    'renderer.m_MinParticleSize': _A(0, 'a floor on a billboard\'s share of the screen'),
    'renderer.m_Mesh': _K('render.mesh', lambda ps, r: r.get('m_RenderMode') == 4),
    **{f'renderer.m_Mesh{i}': _K('render.meshes', lambda ps, r: r.get('m_RenderMode') == 4) for i in (1, 2, 3)},
    'renderer.m_MeshDistribution': _A(0, 'the meshes picked by their weights (NonUniformRandom)',
                                      lambda ps, r: r.get('m_RenderMode') == 4 and any(r.get(f'm_Mesh{i}') for i in (1, 2, 3))),
    **{f'renderer.m_MeshWeighting{s}': _N('only with m_MeshDistribution 1 (reported there)') for s in ('', '1', '2', '3')},
    'renderer.m_Materials': _K('render.mat'),
    'renderer.m_UseCustomVertexStreams': _K('render.ownStreams'),
    'renderer.m_VertexStreams': _K('render.streams'),   # the custom ones mapped (fxplayer.js customMap), others: particle()
    'renderer.m_ApplyActiveColorSpace': _N('[ASSUMED] vertex colours converted in a linear-space project'),
    'renderer.m_Enabled': _N('a disabled renderer is not extracted'),
    'renderer.m_MaskInteraction': _A(0, 'drawn inside / outside a sprite mask'),
    'renderer.m_EnableGPUInstancing': _N('how Unity batches mesh particles'), 'renderer.m_MotionVectors': _N('motion vectors'),
    'renderer.m_GameObject': _N('the owner'), 'renderer.m_DynamicOccludee': _N('occlusion culling'),
    'renderer.m_RendererPriority': _N('render pipeline ordering'), 'renderer.m_RenderingLayerMask': _N('render pipeline layers'),
    **{f'renderer.{f}': _N(_LIGHTING) for f in (
        'm_CastShadows', 'm_ReceiveShadows', 'm_ShadowBias', 'm_StaticShadowCaster', 'm_LightProbeUsage',
        'm_LightProbeVolumeOverride', 'm_ReflectionProbeUsage', 'm_ProbeAnchor', 'm_LightmapIndex', 'm_LightmapIndexDynamic',
        'm_LightmapTilingOffset.x', 'm_LightmapTilingOffset.y', 'm_LightmapTilingOffset.z', 'm_LightmapTilingOffset.w',
        'm_LightmapTilingOffsetDynamic.x', 'm_LightmapTilingOffsetDynamic.y', 'm_LightmapTilingOffsetDynamic.z',
        'm_LightmapTilingOffsetDynamic.w', 'm_StaticBatchInfo.firstSubMesh', 'm_StaticBatchInfo.subMeshCount',
        'm_StaticBatchRoot', 'm_RayTraceProcedural', 'm_RayTracingMode')},
}
# (2026-10-27, effect bundle V) the vertex streams the player lays out the client's way (fxplayer.js customMap): Position,
# Normal, Color, UV, then any of Custom1X…XYZW (31–34) and Custom2X…XYZW (35–38) in any order
STREAMS_PLAYED = {0, 1, 3, 4, *range(31, 39)}

# (2026-10-26, effect bundle W1) the same for everything else the walk meets: every serialized field of the GameObject, of
# its other components, of the client scripts the extract reads (SCRIPTS_READ, as 'script:<class>') and of the materials
# — the particle check above could not see a switched-off MeshRenderer (drawn anyway: 赤刃明霄陈 S1's dao_di_dm) or
# a projectile's random turn (ProjectileEffect `_randomAngle`), because nothing looked inside those components. Rules as in
# PS_FIELDS, plus _R (read to decide whether / how it is carried); `when` takes (the component's type tree, None). A
# key is the extract's JSON path (`nodes[]` a node, `materials.*` a material); test/fx-coverage.test.js pins each
# _K / _V / _R field name to the fx_extract.py readers of COMP_READERS and each key's last name to the render code.
_RENDERER_COMMON = {
    'm_GameObject': _N('the owner'), 'm_DynamicOccludee': _N('occlusion culling'), 'm_MotionVectors': _N('motion vectors'),
    'm_RendererPriority': _N('render pipeline ordering'), 'm_RenderingLayerMask': _N('render pipeline layers'),
    'm_SortingLayerID': _N('the layer\'s place is m_SortingLayer'),
    'm_SortingLayer': _A(0, 'a sorting layer before or after the default one: draws behind or over everything there'),
    'm_MaskInteraction': _A(0, 'drawn inside / outside a sprite mask'),
    **{f: _N(_LIGHTING) for f in (
        'm_CastShadows', 'm_ReceiveShadows', 'm_StaticShadowCaster', 'm_LightProbeUsage', 'm_LightProbeVolumeOverride',
        'm_ReflectionProbeUsage', 'm_ProbeAnchor', 'm_LightmapIndex', 'm_LightmapIndexDynamic', 'm_StaticBatchInfo.firstSubMesh',
        'm_StaticBatchInfo.subMeshCount', 'm_StaticBatchRoot', 'm_RayTraceProcedural', 'm_RayTracingMode', 'm_EnlightenVertexStream',
        *(f'm_LightmapTilingOffset{d}.{a}' for d in ('', 'Dynamic') for a in 'xyzw'))},
}


def _line_params(key):
    """A TrailRenderer's / LineRenderer's m_Parameters (Unity LineParameters) carried under `key`."""
    return {'m_Parameters.widthMultiplier': _K(f'{key}.width'), 'm_Parameters.widthCurve': _K(f'{key}.widthCurve'),
            'm_Parameters.colorGradient': _K(f'{key}.grad'), 'm_Parameters.alignment': _V(f'{key}.align', (0,)),
            'm_Parameters.textureMode': _V(f'{key}.texMode', (0, 1, 2, 3) if key == 'lineR' else (0, 1)),
            'm_Parameters.numCapVertices': _A(0, 'rounded ends'), 'm_Parameters.numCornerVertices': _A(0, 'rounded corners'),
            'm_Parameters.textureScale.x': _A(1, 'the texture scaled along the line'),
            'm_Parameters.textureScale.y': _A(1, 'the texture scaled across the line'),
            'm_Parameters.shadowBias': _N(_LIGHTING), 'm_Parameters.generateLightingData': _N(_LIGHTING)}


_ONE_MAT = [('ref',)]   # the walk draws a renderer's first material: a second one (a second sub-mesh) is reported
_TRANSFORM = {f'm_Local{k}.{a}': _K(f'nodes[].{key}') for k, key, axes in (('Position', 'pos', 'xyz'), ('Rotation', 'rot', 'xyzw'),
                                                                           ('Scale', 'scale', 'xyz')) for a in axes}
_TRANSFORM.update({'m_Children': _R('the walk follows them'), 'm_Father': _N('the walk'), 'm_GameObject': _N('the owner'),
                   'm_ConstrainProportionsScale': _N('an editor setting')})
_POOL = 'how the client pools the effect'
_OFF = 'a switched-off component is read as if it were on [ASSUMED: the client skips a disabled behaviour]'
_SUBS = {'_subFXDelayConfigs': _N('an empty list'),
         '_subFXDelayConfigs[].delayTime': _A(0, 'branch delays: the extract reads them on a ParticleEffect root only'),
         '_subFXDelayConfigs[].transform': _N('with its delayTime')}
_EFFECT_BASE = {'m_Enabled': _A(1, _OFF), '_allowAutoReuse': _N(_POOL), '_preloadCnt': _N(_POOL),
                '_bodyTransofrm': _N('turned only by a ParticleEffect\'s ANY_DIR (`_rotateType` 4), read there'), **_SUBS}
_PAUSE = 'paused per behaviour instead of the whole effect'
_BUFF_PROGRESS = ('hand-written: the kit fx \'buffProgress\' hands the progress (render/fxgame.js), not these blackboard keys '
                  '(`animSrc[].max` / `prog` are carried for it)')
COMP_FIELDS = {
    'GameObject': {'m_Name': _K('nodes[].name'), 'm_IsActive': _K('nodes[].active'),
                   'm_Layer': _A(15, 'another layer: drawn by another camera, or by none [ASSUMED]'),
                   'm_Tag': _N('a tag: scripts look it up'), 'm_StaticEditorFlags': _N('an editor setting')},
    'Transform': _TRANSFORM,
    'RectTransform': {**_TRANSFORM, **{f'{f}.{a}': _N('only under a RectTransform parent (fx_extract walk: placed as a Transform)')
                                       for f in ('m_AnchorMin', 'm_AnchorMax', 'm_AnchoredPosition', 'm_SizeDelta', 'm_Pivot')
                                       for a in 'xy'}},
    'MeshRenderer': {**_RENDERER_COMMON,
                     'm_Enabled': _K('nodes[].mesh.off'),   # (2026-10-26, effect bundle W2a) hidden until a clip's `mr:enabled`
                     # material j draws sub-mesh min(j, sub-meshes − 1) (`more`, the mesh's `sub`); an empty first slot is
                     # reported on a node that shows (fx_extract.py no_material)
                     'm_Materials': _K('nodes[].mesh.more'), 'm_SortingOrder': _K('nodes[].mesh.order'),
                     'm_SortingLayer': _K('nodes[].mesh.layer'),   # (2026-10-27, effect bundle V)
                     'm_AdditionalVertexStreams': _A(None, 'vertex streams added per renderer (baked colours)')},
    'MeshFilter': {'m_GameObject': _N('the owner'), 'm_Mesh': _K('nodes[].mesh.mesh')},
    'SkinnedMeshRenderer': {**_RENDERER_COMMON, 'm_Enabled': _R('a switched-off one is not extracted (skin)'),
                            'm_Materials': _V('nodes[].skin.mat', _ONE_MAT), 'm_SortingOrder': _K('nodes[].skin.order'),
                            'm_Mesh': _K('nodes[].skin.mesh'), 'm_Bones': _K('nodes[].skin.bones'),
                            'm_RootBone': _N('the bones are drawn from their world transforms; the root bone only bounds them'),
                            **{f'm_AABB.{c}.{a}': _N('bounds for culling') for c in ('m_Center', 'm_Extent') for a in 'xyz'},
                            'm_DirtyAABB': _N('bounds for culling'), 'm_UpdateWhenOffscreen': _N('bounds for culling'),
                            'm_Quality': _N('[ASSUMED] bones per vertex: Auto (0) takes the quality setting'),
                            'm_SkinnedMotionVectors': _N('motion vectors'),
                            'm_BlendShapeWeights': _A((), 'blend shape weights')},
    'TrailRenderer': {**_RENDERER_COMMON, **_line_params('trailR'),
                      'm_Enabled': _R('a switched-off trail is not extracted'), 'm_Materials': _V('nodes[].trailR.mat', _ONE_MAT),
                      'm_SortingOrder': _K('nodes[].trailR.order'), 'm_SortingLayer': _K('nodes[].trailR.layer'),
                      'm_Time': _K('nodes[].trailR.time'),
                      'm_MinVertexDistance': _K('nodes[].trailR.minDist'), 'm_Emitting': _A(True, 'a trail that does not emit (`trailR.emitting` is carried, not played)'),
                      'm_Autodestruct': _A(False, 'the GameObject destroyed once the trail is gone')},
    'LineRenderer': {**_RENDERER_COMMON, **_line_params('lineR'),
                     'm_Enabled': _R('a switched-off line is not extracted'), 'm_Materials': _V('nodes[].lineR.mat', _ONE_MAT),
                     'm_SortingOrder': _K('nodes[].lineR.order'), 'm_Positions': _K('nodes[].lineR.pts'),
                     **{f'm_Positions[].{a}': _K('nodes[].lineR.pts') for a in 'xyz'},
                     'm_UseWorldSpace': _K('nodes[].lineR.world'), 'm_Loop': _K('nodes[].lineR.loop')},
    'Animator': {'m_GameObject': _N('the owner'), 'm_Controller': _R('its clips and states are the tracks (animator_clips)'),
                 'm_Enabled': _R('a switched-off Animator plays nothing: its clips are not read (prefab)'),
                 'm_Avatar': _N('the effect clips bind by path, not by an avatar'),
                 'm_CullingMode': _A(0, 'stops animating off screen'), 'm_UpdateMode': _A(0, 'animates on unscaled time / physics'),
                 'm_ApplyRootMotion': _A(False, 'root motion'), 'm_KeepAnimatorStateOnDisable': _A(False, 'the state kept when switched off'),
                 'm_LinearVelocityBlending': _N('root motion only'), 'm_StabilizeFeet': _N('humanoid only'),
                 'm_HasTransformHierarchy': _N('an optimised hierarchy: the paths still bind'),
                 'm_AllowConstantClipSamplingOptimization': _N('an optimisation'),
                 'm_WriteDefaultValuesOnDisable': _N('what a switched-off Animator leaves')},
    'Animation': {'m_GameObject': _N('the owner'), 'm_Animation': _R('the default clip, the one track (legacy_clips)'),
                  'm_PlayAutomatically': _R('without it nothing plays (legacy_clips)'), 'm_WrapMode': _K('clips[].loop'),
                  'm_Enabled': _R('a switched-off Animation plays nothing: its clip is not read (prefab)'),
                  'm_Animations': _N('its other clips: only a script plays them'),
                  'm_CullingType': _N('[ASSUMED] off-screen culling: the effects are on screen'),
                  'm_AnimatePhysics': _A(False, 'animates in the physics step')},
    'Material': {'m_Name': _N('the name'), 'm_Shader': _K('materials.*.shader'),
                 'm_ValidKeywords': _K('materials.*.keywords'),   # each one is also checked against KEYWORDS_READ (fields)
                 'm_ShaderKeywords': _K('materials.*.keywords'),   # older clients: one string
                 'm_InvalidKeywords': _N('keywords the shader does not declare: no variant switches'),
                 'm_CustomRenderQueue': _K('materials.*.queue'),
                 'm_SavedProperties.m_TexEnvs': _N('the `texture` kind checks them (material())'),
                 'm_SavedProperties.m_Floats': _N('the `property` kind checks them (material())'),
                 'm_SavedProperties.m_Colors': _N('the `property` kind checks them (material())'),
                 'm_SavedProperties.m_Ints': _A((), 'integer properties: not read'),
                 'disabledShaderPasses': _A((), 'shader passes switched off'), 'stringTagMap': _A((), 'override tags'),
                 'm_LightmapFlags': _N(_LIGHTING), 'm_DoubleSidedGI': _N(_LIGHTING),
                 'm_EnableInstancingVariants': _N('GPU instancing'), 'm_BuildTextureStacks': _N('virtual texturing'),
                 'm_LockedProperties': _N('an editor setting'), 'm_Parent': _A(None, 'a material variant of another')},
    # the client scripts (SCRIPTS_READ)
    'script:ParticleEffect': {
        'm_Enabled': _A(1, _OFF), '_allowAutoReuse': _N(_POOL), '_preloadCnt': _N(_POOL),
        '_delayToPlay': _K('face.delay'), '_randomPlayDelay': _K('face.rnd'), '_delayToFinish': _K('finish'),
        '_usePlaybackSpeed': _K('face.speed'), '_limitedPlaybackSpeed': _K('face.limit'), '_rotateType': _V('face.rot', (0, 1, 2, 3, 4)),
        '_spawnLocation': _K('spawn'), '_leftIsDefault': _K('face.left'), '_useBodyRotation': _K('face.body'), '_mainDir': _K('face.dir'),
        '_holdByOwner': _K('face.hold'), '_overwriteHeight': _K('height'), '_heightOffset': _K('height'),
        '_bodyTransofrm': _K('face.bodyNode'), '_inactiveOnFinish': _K('offFinish'),
        '_subFXDelayConfigs': _N('an empty list'), '_subFXDelayConfigs[].delayTime': _K('nodes[].sdelay'),
        '_subFXDelayConfigs[].transform': _K('nodes[].sdelay'),
        '_rotationY': _N('the node FLIP_TWO_SIDE turns — the player takes the first node named rotation_y (turned_nodes reports a '
                         'difference)'),
        '_rotationZ': _N('the node FLIP_TWO_SIDE / FOUR_DIRECTION / FIXED_DIRECTION turn — the player takes the first node named '
                         'rotation_z (turned_nodes)'),
        '_maxLifetime': _A(-1, 'the client finishes the effect this many seconds after it plays'),
        '_isLoop': _A(0, 'a loop effect: the effect manager keeps at most 3 of one key at one place (ParticleEffectManager)'),
        '_ignoredByParticleEffectManager': _A(0, 'left out of the effect manager (that cap)'),
        '_toggleMeshRendererWhenPause': _A(0, 'its MeshRenderers switched off while it is paused'),
        '_flipZ': _A(None, 'a node mirrored on z when facing left'),
        '_disableBattleEffectShrink': _A(0, 'kept out of the battle\'s effect scaling [ASSUMED from its name: a newer field of the CN client]')},
    'script:ProjectileEffect': {
        **_EFFECT_BASE, '_delayToFinish': _K('finish'), '_inactiveOnFinish': _K('offFinish'),
        '_resetMainDir': _A(1, 'the projectile not turned back to its main direction as it flies [ASSUMED]'),
        '_mainDir': _A(1, 'another main direction [ASSUMED]', lambda t, _: bool(t.get('_resetMainDir'))),
        '_randomAngle': _A(0, 'the projectile turned by a random angle up to this'),
        '_rotate180Y': _A(0, 'the projectile turned 180° about y'),
        '_flipIfLeft': _A(0, 'the projectile mirrored when it flies left'), '_inactiveOnHit': _A((), 'nodes switched off on a hit')},
    'script:EmptyEffect': {**_EFFECT_BASE, '_delayToFinish': _K('finish')},
    'script:FxDelay': {'m_Enabled': _R('a switched-off child FxDelay delays nothing (it acts in OnEnable); the root\'s is switched on as the effect plays'), '_delayTime': _K('nodes[].delay')},
    'script:FollowMountPoint': {
        'm_Enabled': _A(1, _OFF), '_mountPointType': _K('mount.type'), '_followScaleSign': _K('mount.followScaleSign'),
        '_followScale': _A(0, 'the effect takes its point\'s scale (`mount.followScale` is carried, not played)'), '_pauseWhenMountPointInvalid': _K('mount.pauseWhenInvalid'),
        '_onlyPauseWhenMountPointInvalid': _A(0, 'paused only while its point is invalid (`mount.onlyPauseWhenInvalid` is carried, not played)'), '_keepOriginRotation': _K('mount.keepOriginRotation'),
        '_useBehaviourPause': _A(0, _PAUSE + ' (`mount.useBehaviourPause` is carried, not played)'),
        '_pauseWhenFollowScaleNearlyZero': _A(0, 'paused while its point\'s scale is nearly zero'),
        '_scaleMultiplier': _A(1, 'the point\'s scale multiplied [ASSUMED from its name: a newer field of the CN client]', lambda t, _: bool(t.get('_followScale')))},
    **{f'script:{c}': {
        'm_Enabled': _R('a switched-off tweener moves nothing (it moves the offsets in Update)'),
        'xspeed': _K('nodes[].uvt.maps'), 'yspeed': _K('nodes[].uvt.maps'), 'secondXSpeed': _K('nodes[].uvt.maps'),
        'secondYSpeed': _K('nodes[].uvt.maps'), 'secondMapName': _K('nodes[].uvt.maps'), 'useSecondMap': _K('nodes[].uvt.maps'),
        'keepInitOffset': _K('nodes[].uvt.keep'),
        'useSharedMaterial': _A(0, 'moves the shared material: one offset for every renderer that uses it [ASSUMED]'),
        **({'protectMainUV': _K('nodes[].uvt.maps'), 'protectSecondUV': _K('nodes[].uvt.maps')} if c == 'FxUVTweener' else {
            'tweenRepeat': _K('nodes[].uvt.until'), 'tweenAnmTime': _K('nodes[].uvt.until'), 'extraMapSettings': _N('an empty list'),
            **{f'extraMapSettings[].{f}': _K('nodes[].uvt.maps') for f in ('XSpeed', 'YSpeed', 'enabled', 'mapName')},
            **{f'extraMapSettings[].mapST.{a}': _A(0, 'the map\'s own tiling / offset [ASSUMED]') for a in 'xyzw'}})}
        for c in ('FxUVTweener', 'FxUVTweenerAdvance')},
    'script:FxUVRotation': {'m_Enabled': _R('a switched-off rotation turns nothing (it turns in Update)'),
                            **{f: _K('nodes[].uvr') for f in ('angle1', '_angle2', '_angle3', '_angle4',
                                                              '_rotateTex1', '_rotateTex2', '_rotateTex3', '_rotateTex4')},
                            '_propertyName': _V('nodes[].uvr', ('_Rotation',))},
    'script:SwitchableBackEffect': {
        'm_Enabled': _A(1, _OFF), '_backEffect': _K('back.effect'), '_predictFaceDirection': _A(0, 'the side predicted from the coming direction (`back.predict` is carried, not played)'), '_oneShot': _K('back.oneShot'),
        '_createEffectOnStart': _A(0, 'the back copy made paused when it plays'),
        '_forceCheckInUpdate': _A(0, 'the side checked again every frame'),
        '_predictOnlyWhenDirectionNonBack': _A(1, 'the side predicted also when the direction is back'),
        '_syncPlayBackSpeed': _A(0, 'the back copy takes this one\'s playback speed'), '_useBehaviourPause': _A(0, _PAUSE),
        '_preserveBackWhenPredictingDirection': _A(0, 'the back copy kept while the side is predicted [ASSUMED from its name: a newer field of the CN client]')},
    'script:SwitchableRightEffect': {
        'm_Enabled': _A(1, _OFF), '_rightEffect': _K('right'), '_onlyCheckOnPlay': _A(0, 'the side checked only as it plays'),
        '_reverseLeftRight': _A(0, 'left and right swapped'),
        '_reactivationMode': _A(0, 'how the copy is played again [ASSUMED from its name: a newer field of the CN client]')},
    'script:LineEffectEmitterDynamic': {
        'm_Enabled': _A(1, _OFF), '_startMountPointType': _K('lineDyn.sMount'), '_endMountPointType': _K('lineDyn.eMount'),
        '_startEffect': _K('lineDyn.start'), '_endEffect': _K('lineDyn.end'), '_midEffect': _K('lineDyn.mid'),
        **{f'_startPosOffset.{a}': _K('lineDyn.sOff') for a in 'xyz'}, **{f'_endPosOffset.{a}': _K('lineDyn.eOff') for a in 'xyz'},
        '_tweenEndPosition': _A(0, 'the end eased out from the start over _tweenDuration (`lineDyn.tween` is carried, not played)'),
        '_tweenDuration': _N('only with _tweenEndPosition'),
        '_finishIfBuffNotExists': _A(0, 'finished once the buff _buffKeyForFinish is gone (`lineDyn.finishBuff` is carried, not played)'),
        '_buffKeyForFinish': _N('only with _finishIfBuffNotExists'),
        '_fetchStartEndViaBuff': _A(0, 'the two ends taken from a buff\'s source and target'),
        '_buffKey': _N('only with _fetchStartEndViaBuff'),
        '_checkBuffSourceForFinish': _A(0, 'finished by the buff\'s source'),
        '_effectGeneratedOnSourceIfFinish': _A('', 'an effect made on the source as it finishes'),
        '_effectGeneratedOnTargetIfFinish': _A('', 'an effect made on the target as it finishes'),
        '_finishIfEitherOfOwnersNotAliveOrReborn': _A(0, 'finished when either end dies or revives'),
        '_finishIfEitherOfOwnersNotExist': _A(0, 'finished when either end is gone'),
        '_forceLineUseWorldSpace': _A(0, 'its lines drawn in world space'),
        '_pauseWhenDisappear': _A(0, 'paused while an end has disappeared'),
        '_useSelfEffectOnly': _A(0, 'only its own effect, not the start / end ones'),
        '_switchMaterialParamViaLR': _A(0, 'the material tiling / offset switched by the side'),
        **{f'{f}.{a}': _N('only with _switchMaterialParamViaLR') for f in (
            '_offsetValueLeft', '_offsetValueRight', '_tilingValueLeft', '_tilingValueRight') for a in 'xy'}},
    'script:LineEffectEmitter': {'m_Enabled': _A(1, _OFF), '_startEffect': _K('lineEm.start'), '_midEffect': _K('lineEm.mid'),
                                 '_endEffect': _K('lineEm.end')},
    'script:RandomEmitter': {
        'm_Enabled': _A(1, _OFF), '_effect': _K('nodes[].emit.effect'), '_count': _K('nodes[].emit.count'),
        '_preDelay': _K('nodes[].emit.pre'), '_delayPerEffect': _K('nodes[].emit.per'),
        **{f'_randomRangeFrom.{a}': _K('nodes[].emit.from') for a in 'xyz'}, **{f'_randomRangeTo.{a}': _K('nodes[].emit.to') for a in 'xyz'}},
    'script:FlyToPredefinedLocation': {
        'm_Enabled': _A(1, _OFF), '_location': _K('fly.loc'), '_duration': _K('fly.dur'), '_easeType': _K('fly.ease'),
        '_isIndependentUpdate': _K('fly.real'), '_inversStartEnd': _K('fly.inv'), '_ignorePlayerSide': _A(0, 'flies to the place of either side (`fly.anySide` is carried, not played)')},
    'script:OnPlayEmitter': {
        'm_Enabled': _A(1, _OFF), '_effects': _K('nodes[].onPlay.effects'), '_preDelay': _K('nodes[].onPlay.pre'),
        '_instant': _K('nodes[].onPlay.pre'), '_useFaceVector': _K('nodes[].onPlay.face'), '_clearWhenFinish': _K('nodes[].onPlay.clear'),
        '_useSourceEffectPos': _K('nodes[].onPlay.srcPos'), '_keepPauseSync': _A(0, 'the effects it made paused with this one')},
    'script:OnFinishEmitter': {
        'm_Enabled': _A(1, _OFF), '_effects': _K('nodes[].onFinish.effects'), '_useFaceVector': _K('nodes[].onFinish.face'),
        '_useEffectPosition': _K('nodes[].onFinish.effPos')},
    'script:PauseEffectIf': {
        'm_Enabled': _R('a switched-off one is not read (pause_scripts)'),
        **{f: _K('nodes[].pauseIf.when') for f in (
            '_checkAbnormalFlag', '_pauseWhenAbnormalFlag', '_pauseWhenAbnormalFlags', '_checkAbnormalCombo', '_pauseWhenAbnormalCombo',
            '_checkUnitModeIndex', '_pauseWhenModeIndexList', '_checkDisappear', '_checkContainBuff', '_pauseWhenContainBuffKey',
            '_pauseWhenContainBuffKeyList', '_checkNotInAbnormalFlag', '_pauseWhenNotInAbnormalFlag', '_checkFaceToBack',
            '_checkFaceToRight', '_checkState', '_pauseWhenCharState', '_checkCharacterSharedBlackboardKey',
            '_characterSharedBlackboardKeyList')},
        '_checkAbnormalImmune': _A(0, 'paused while immune to a flag (`pauseIf.when[].immune` is carried, not played)'),
        '_pauseWhenAbnormalImmune': _N('only with _checkAbnormalImmune'),
        '_requireAllConditions': _K('nodes[].pauseIf.all'), '_checkOnPlay': _K('nodes[].pauseIf.onPlay'),
        '_disableMeshRendererWhenPause': _A(0, 'its MeshRenderers off while paused (`pauseIf.meshOff` is carried, not played)')},
    'script:PauseAnotherEffect': {'m_Enabled': _R('a switched-off one is not read (pause_scripts)'), '_effect': _K('nodes[].pauseOther[].effect'),
                                  '_preDelay': _K('nodes[].pauseOther[].pre'), '_checkUpdate': _K('nodes[].pauseOther[].update')},
    'script:PauseEffectWithAnimation': {
        'm_Enabled': _R('a switched-off one is not read (pause_scripts)'), '_validAnimation': _K('nodes[].pauseAnim.valid'),
        '_invalidAnimation': _K('nodes[].pauseAnim.invalid'), '_finishIfPause': _K('nodes[].pauseAnim.finish'),
        '_noPauseWhenValid': _K('nodes[].pauseAnim.restore'), '_delayToPause': _K('nodes[].pauseAnim.pre'),
        '_delayToRestore': _K('nodes[].pauseAnim.back'), '_useBehaviourPause': _A(0, _PAUSE)},
    'script:PauseEffectIfNotIdle': {'m_Enabled': _R('a switched-off one is not read (pause_scripts)'),
                                    '_needCheckFaceSwitch': _K('nodes[].pauseIdle.back'), '_pauseWhenBack': _K('nodes[].pauseIdle.back'),
                                    '_pauseWhenFront': _K('nodes[].pauseIdle.front')},
    'script:PauseEffectIfSpineEvent': {
        'm_Enabled': _R('a switched-off one is not read (pause_scripts)'), '_pauseAtStart': _K('nodes[].pauseSpine.start'),
        '_invertSpineEventMapping': _K('nodes[].pauseSpine.invert'), 'onlyCheckedAnimations': _K('nodes[].pauseSpine.anims'),
        '_useBehaviourPause': _A(0, _PAUSE)},
    'script:FinishEffectIf': {'m_Enabled': _R('a switched-off one is not read (pause_scripts)'),
                              '_finishIfOwnerInvalid': _K('nodes[].finishIf.ownerGone'), '_finishIfNotDummy': _A(0, 'finished when its owner is not a dummy (`finishIf.notDummy` is carried, not played)'),
                              '_finishIfCurrentAnimFinish': _K('nodes[].finishIf.animEnd')},
    'script:PauseEffectIfNotMove': {'m_Enabled': _R('a switched-off one is not read (pause_scripts)')},
    'script:FollowOwner': {'m_Enabled': _R('a switched-off one is not read (owner_follow)')},
    'script:FollowOwnerRootTileHeight': {'m_Enabled': _R('a switched-off one is not read (owner_follow)')},
    'script:FunnelHitEffect': {'m_Enabled': _A(1, _OFF), **{f'_randomRange.{a}': _K('jitter') for a in 'xyz'}},
    'script:FollowDirection': {
        'm_Enabled': _A(1, _OFF), **{f: _K('follow.src') for f in (
            '_useFourDir', '_useOwnerDirection', '_useOwnerMoveDirection', '_useFaceToInsteadOfFaceVector', '_useFaceSwitcherFaceLORR')},
        '_leftIsDefault': _K('follow.left'), '_flipWhenFaceToVertical': _K('follow.vflip'), '_onlyFollowOnPlay': _K('follow.once'),
        '_useDirectionLerp': _K('follow.lerp'), '_lerpDuration': _K('follow.lerp'),
        '_reverseWhenFaceToBack': _A(0, 'turned the other way while its owner faces back [ASSUMED from its name: a newer field of the CN client]')},
    'script:SwitchableEffectByFaceDirection': {
        'm_Enabled': _A(1, _OFF), '_upEffect': _K('swFace.up'), '_downEffect': _K('swFace.down'), '_leftEffect': _K('swFace.left'),
        '_oneShot': _K('swFace.oneShot'), '_useBehaviourPause': _A(0, _PAUSE + ' (`swFace.beh` is carried, not played)')},
    'script:SwitchableThreeFaceEffect': {
        'm_Enabled': _A(1, _OFF), '_upEffect': _K('three.up'), '_downEffect': _K('three.down'),
        '_forceCheckInUpdate': _A(0, 're-applied every frame (`three.check` is carried, not played)'), '_createEffectOnStart': _K('three.start')},
    'script:RandomDirection': {'m_Enabled': _A(1, _OFF), **{f'{f}.{a}': _K('rdir') for f in ('_randomRotationFrom', '_randomRotationTo')
                                                            for a in 'xyz'}},
    'script:FollowTileHeight': {'m_Enabled': _A(1, _OFF), '_followTileHeightSpeed': _K('tileH')},
    'script:FxLODSetting': {'m_Enabled': _A(1, _OFF), '_disableObjects': _K('lod.off'), '_particleDetailsHookers': _N('an empty list'),
                            '_particleDetailsHookers[]._particle': _K('lod.ps'),
                            '_particleDetailsHookers[]._detailPercentage': _K('lod.ps')},
    'script:TriggerAnimatorWhenFinish': {'m_Enabled': _R('a switched-off one is not read (anim_scripts)'), '_customKey': _K('animFin[].p')},
    'script:OnFinishAnime': {'m_Enabled': _R('a switched-off one is not read (anim_scripts)'), '_triggerName': _K('animFin[].p'),
                             '_isTrigger': _K('animFin[].v'), '_isInt': _K('animFin[].v'), '_triggerValue': _K('animFin[].v')},
    'script:SwitchAnimatorStateWhenFinish': {'m_Enabled': _R('a switched-off one is not read (anim_scripts)'),
                                             '_stateName': _K('animFin[].play')},
    'script:SetAnimatorTriggerOnEvent': {'m_Enabled': _R('a switched-off one is not read (anim_scripts)'),
                                         '_event': _V('animFin[].p', (0,)), '_animatorTriggerName': _K('animFin[].p')},
    'script:SetAnimatorFloatByCondition': {
        'm_Enabled': _R('a switched-off one is not read (anim_scripts)'), '_paramName': _K('animSrc[].p'), '_isInt': _K('animSrc[].int'),
        '_source': _N('[ASSUMED] the root\'s one BuffProgressFloatSource (anim_scripts reports more)')},
    'script:BuffProgressFloatSource': {
        'm_Enabled': _R('a switched-off one is not read (anim_scripts)'), '_buffKey': _K('animSrc[].buff'), '_maxKey': _N(_BUFF_PROGRESS),
        '_progressKey': _N(_BUFF_PROGRESS), '_defaultVal': _K('animSrc[].def'), '_finishedVal': _K('animSrc[].fin'),
        '_curve': _K('animSrc[].curve')},
    'script:SetAnimatorTriggerByCondition': {
        'm_Enabled': _R('a switched-off one is not read (anim_scripts)'),
        '_source': _N('[ASSUMED] the root\'s AuraProjectileSetAnimatorTrigger'), '_autoFindSource': _N('[ASSUMED] the same'),
        '_checkInterval': _A(-1, 'checked every so many seconds instead of every frame'),
        '_skipWhenIsNullOrEmpty': _A(0, 'an empty value skipped')},
    'script:AuraProjectileSetAnimatorTrigger': {'m_Enabled': _R('a switched-off one is not read (anim_scripts)'),
                                                '_triggerKey': _K('animFin[].p'),
                                                '_defaultKey': _A('', 'a trigger set before the aura stops')},
    'script:EmitterRandomGroup': {
        'm_Enabled': _R('a switched-off one is not read (random_group)'), '_effectPickFrom': _K('rgroup.pick'),
        '_selfExcluded': _K('rgroup.self'), '_dontCheckOwner': _K('rgroup.noOwner'),
        '_finishEffectWhenSelfFinish': _K('rgroup.keep'), '_useMainEffectPos': _K('rgroup.mainPos')},
    'script:SwitchableWhenContainsEquipment': {
        'm_Enabled': _R('a switched-off one is not read (equip_effects)'), '_pauseWhenSwitch': _K('equipFx.pause'),
        '_equipmentEffectHookSchemas': _N('an empty list'),
        **{f'_equipmentEffectHookSchemas[].{f}': _K('equipFx.hooks') for f in ('equipmentPair.key', 'equipmentPair.level', 'hookEffectKey')}},
}
# the fx_extract.py functions (or module tables) that read each kind, where the test looks for its fields' names
COMP_READERS = {
    **{k: ('prefab',) for k in ('GameObject', 'Transform', 'RectTransform', 'MeshRenderer', 'MeshFilter', 'TrailRenderer', 'LineRenderer')},
    'SkinnedMeshRenderer': ('skin',), 'Animator': ('animator_clips', 'enabled'), 'Animation': ('legacy_clips', 'legacy_clip', 'enabled'),
    'Material': ('material',),
    'script:ParticleEffect': ('ROOT_EFFECT_FIELDS', 'root_effect_tree', 'off_on_finish', 'delay_to_finish'),
    'script:ProjectileEffect': ('projectile_tree',), 'script:EmptyEffect': ('delay_to_finish',),
    'script:FxDelay': ('fx_delay_tree', 'enabled'), 'script:FollowMountPoint': ('MOUNT_FIELDS',),
    'script:FxUVTweener': ('uv_tween',), 'script:FxUVTweenerAdvance': ('uv_tween',), 'script:FxUVRotation': ('uv_rotation',),
    'script:SwitchableBackEffect': ('switch_back',), 'script:SwitchableRightEffect': ('right_tree',),
    'script:LineEffectEmitterDynamic': ('line_dynamic',), 'script:LineEffectEmitter': ('line_emitter',),
    'script:RandomEmitter': ('random_emitter',), 'script:FlyToPredefinedLocation': ('fly_location',),
    'script:OnPlayEmitter': ('on_emitters',), 'script:OnFinishEmitter': ('on_emitters',),
    **{f'script:{c}': ('pause_scripts', 'pause_if') for c in (
        'PauseEffectIf', 'PauseAnotherEffect', 'PauseEffectWithAnimation', 'PauseEffectIfNotIdle', 'PauseEffectIfSpineEvent',
        'FinishEffectIf', 'PauseEffectIfNotMove')},
    'script:FollowOwner': ('owner_follow',), 'script:FollowOwnerRootTileHeight': ('owner_follow',),
    'script:FunnelHitEffect': ('funnel_hit',), 'script:FollowDirection': ('follow_direction',),
    'script:SwitchableEffectByFaceDirection': ('switch_face',), 'script:SwitchableThreeFaceEffect': ('three_face',),
    'script:RandomDirection': ('random_direction',), 'script:FollowTileHeight': ('tile_height',), 'script:FxLODSetting': ('lod_setting',),
    **{f'script:{c}': ('anim_scripts',) for c in (
        'TriggerAnimatorWhenFinish', 'OnFinishAnime', 'SwitchAnimatorStateWhenFinish', 'SetAnimatorTriggerOnEvent',
        'SetAnimatorFloatByCondition', 'BuffProgressFloatSource', 'SetAnimatorTriggerByCondition', 'AuraProjectileSetAnimatorTrigger')},
    'script:EmitterRandomGroup': ('random_group',), 'script:SwitchableWhenContainsEquipment': ('equip_effects',),
}
# a script's fields of the MonoBehaviour base: not the class's own
_MONO_BASE = {'m_GameObject', 'm_Script', 'm_Name', 'm_EditorHideFlags', 'm_EditorClassIdentifier'}
# material keywords the player follows (2026-10-26): by the keyword itself, or by the toggle float the shader pairs with it
# (in PLAYER_VALUES). Another keyword a material switches on is reported: its shader variant may draw otherwise
KEYWORDS_READ = {'_WEIGHT_ON': None, '_HGCUSTOMVERTEXSTREAM_ON': '_HGCustomVertexStream', '_DISSOLVE_THREE': '_Dissolve'}


def _whole(v):
    """A type-tree value that is one field (a curve, a gradient, an object reference), not a struct of fields."""
    return isinstance(v, dict) and (any(k in v for k in ('minMaxState', 'm_PathID', 'm_PreInfinity', 'm_NumColorKeys'))
                                    or ('first' in v and 'second' in v))   # a gradient, a map entry (a material's properties)


def _fields(v, path, out):
    """{dotted path: [values]} of a type tree, list items under `[]` (one value per item)."""
    if isinstance(v, dict) and not _whole(v):
        for k, x in v.items():
            if k != 'serializedVersion':
                _fields(x, f'{path}.{k}' if path else k, out)
    elif isinstance(v, list) and v and isinstance(v[0], dict) and not _whole(v[0]):
        for x in v:
            _fields(x, path + '[]', out)
    else:
        out.setdefault(path, []).append(v)


def _val(v):
    """A type-tree value to compare with an assumed one: a curve that is one constant → that number (a curve × 0 → 0),
    another curve → 'curve'; a gradient → 'gradient'; an object reference → 'ref' / None; a list → a tuple."""
    if isinstance(v, dict) and 'minMaxState' in v:
        if 'scalar' not in v:
            return 'gradient'
        st, s = v.get('minMaxState', 0), v.get('scalar', 0)
        if st == 0 or s == 0 or (st == 3 and abs(v.get('minScalar', s) - s) < 1e-6):
            return s
        return 'curve'
    if isinstance(v, dict) and 'm_PathID' in v:
        return 'ref' if v['m_PathID'] else None
    if isinstance(v, (bytes, list, tuple)):
        return tuple(_val(x) for x in v)
    return v


def _same(a, b):
    if isinstance(a, bool) or isinstance(b, bool) or a is None or b is None or isinstance(a, str) or isinstance(b, str):
        return a == b if not (isinstance(a, (bool, int)) and isinstance(b, (bool, int))) else int(a) == int(b)
    try:
        return abs(float(a) - float(b)) < 1e-4
    except (TypeError, ValueError):
        return a == b


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
    # (2026-10-26, effect bundle T) the fields the pipeline does not play, from the first field-level run over the EN client
    # (2158 prefabs); the note says which open bundle takes them (docs/rules/fx.md 「추출 누락 보고」 「입자 필드」)
    # (2026-10-26, effect bundle U) what that bundle left: the start direction turn of 4 systems (圣约送葬人's ranges)
    'field:ShapeModule.alignToDirection ≠ False': (_TODO, 'emission and motion (open): particles turned to their start direction'),
    'field:ShapeModule.arc on a Sphere / Hemisphere': (_TODO, 'emission and motion (open): a sphere\'s arc and its order (the enemies\' 40 systems, BurstSpread)'),
    # (2026-10-27, effect bundle V) what that bundle left: how the engine builds its quads (not read) decides both
    'field:renderer.m_FreeformStretching ≠ False': (_TODO, 'drawing (open): stretched quads not facing the camera'),
    'field:renderer.m_RenderAlignment = 4': (_TODO, 'drawing (open): billboards along the velocity, drawn facing the camera'),
    # (2026-10-26, effect bundle W1) the other components, the read scripts and the materials, from the first field-level run
    # over the operators' prefabs (EN + CN clients) and the enemies' (EN): what the pipeline does not do yet
    **{f'field:{w}': (_TODO, f'components and scripts (open): {n}') for w, n in (
        ('GameObject.m_Layer ≠ 15', 'a node on another layer (0): whether the battle camera draws it [ASSUMED]'),
        ('FxUVTweener.useSharedMaterial ≠ 0', 'one offset for every renderer of the shared material [ASSUMED]'),
        ('FxUVTweenerAdvance.useSharedMaterial ≠ 0', 'one offset for every renderer of the shared material [ASSUMED]'),
        ('ProjectileEffect._randomAngle ≠ 0', 'the projectile turned by a random angle each time (空弦 S3, 哈洛德)'),
        ('ProjectileEffect._rotate180Y ≠ 0', 'the projectile turned 180° about y'),
        ('ProjectileEffect._resetMainDir ≠ 1', 'the projectile not turned back to its main direction'),
        ('ProjectileEffect._mainDir ≠ 1', 'another main direction'),
        ('ParticleEffect._maxLifetime ≠ -1', 'the client finishes the effect after so many seconds (灵知\'s talent buff: 2 s)'),
        ('ParticleEffect._isLoop ≠ 0', 'the effect manager keeps at most 3 loop effects of one key at one place'),
        ('ParticleEffect._ignoredByParticleEffectManager ≠ 0', 'left out of that cap'),
        ('FollowMountPoint._followScale ≠ 0', 'the effect takes its point\'s scale (焰尾\'s buff)'),
        ('FollowMountPoint._onlyPauseWhenMountPointInvalid ≠ 0', 'paused only while its point is invalid'),
        ('FollowMountPoint._useBehaviourPause ≠ 0', 'paused per behaviour'),
        ('PauseEffectIf._checkAbnormalImmune ≠ 0', 'paused while its owner is immune to a flag'),
        ('PauseEffectIf._disableMeshRendererWhenPause ≠ 0', 'its MeshRenderers off while paused'),
        ('PauseEffectWithAnimation._useBehaviourPause ≠ 0', 'paused per behaviour'),
        ('PauseEffectIfSpineEvent._useBehaviourPause ≠ 0', 'paused per behaviour'),
        ('SwitchableBackEffect._useBehaviourPause ≠ 0', 'paused per behaviour'),
        ('SwitchableBackEffect._forceCheckInUpdate ≠ 0', 'the side checked again every frame'),
        ('SwitchableBackEffect._syncPlayBackSpeed ≠ 0', 'the back copy takes the playback speed'),
        ('SwitchableRightEffect._onlyCheckOnPlay ≠ 0', 'the side checked only as it plays'),
        ('OnPlayEmitter._keepPauseSync ≠ 0', 'the effects it made paused with it'),
        ('LineEffectEmitterDynamic._fetchStartEndViaBuff ≠ 0', 'the two ends from a buff\'s source and target'),
        ('LineEffectEmitterDynamic._finishIfEitherOfOwnersNotAliveOrReborn ≠ 0', 'finished when either end dies or revives'),
        ('LineEffectEmitterDynamic._finishIfEitherOfOwnersNotExist ≠ 0', 'finished when either end is gone'),
        ('LineEffectEmitterDynamic._forceLineUseWorldSpace ≠ 0', 'its lines in world space'),
        ('LineEffectEmitterDynamic._pauseWhenDisappear ≠ 0', 'paused while an end has disappeared'),
        ('LineEffectEmitterDynamic._checkBuffSourceForFinish ≠ 0', 'finished by the buff\'s source'),
        ('LineEffectEmitterDynamic._finishIfBuffNotExists ≠ 0', 'finished once a buff is gone'),
        ('TrailRenderer.m_Parameters.alignment = 1', 'a trail facing its transform\'s z, not the camera'),
        ('TrailRenderer.m_Parameters.textureMode = 2', 'the texture spread per segment'))},
    # materials (values: the extracted materials, 2026-10-16)
    'property:Torappu/Particles/Disturb/Disturb Anchor _Weight': (_NONE, 'the toggle behind keyword _WEIGHT_ON, which the player reads (all 198 materials agree)'),
    # clips
    'clip:binding to a path outside the Animator': (_NONE, 'the clip names a node the prefab does not have (deleted in authoring): '
                                                    'Unity binds nothing either'),
    # (2026-10-22) a clip's particle module values, trail length, MeshRenderer switch and FxUVTweener speeds are tracks now
    # (fx_extract.py ANIMATED_VALUES → render/fxplayer.js PS_ANIM / UVT_ANIM); (2026-10-23) also the VelocityModule switch
    # (fx_extract.py clip_modules: the enemies' mcmstr_buff_04_start)
    'script:CameraEffect': (_NONE, 'only screen_com_poison_04 (the time-out poison screen), which the player never plays: this mode never '
                           'attaches the buff that shows it (docs/rules/fx.md, 2026-10-25)'),
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
    nodes = d['nodes']

    def scaled_parent(nd):
        """(2026-10-26) a node under a scaled parent (where Local scaling drops the parents' scale)."""
        p = nd.get('parent', -1)
        while 0 <= p < len(nodes):
            if any(abs(x - 1) > 1e-3 for x in nodes[p].get('scale') or (1, 1, 1)):
                return True
            p = nodes[p].get('parent', -1)
        return False

    for nd in nodes:
        s.update(f'node:{k}' for k in ('mesh', 'trailR', 'lineR', 'skin', 'uvt', 'uvr', 'delay', 'sdelay') if k in nd)
        if not nd.get('active', True):
            s.add('node:inactive')
        ps = nd.get('ps')
        if ps:
            s.add(f"ps:render={ps['render']['mode']}")
            s.add(f"ps:space={ps['space']}")
            # (2026-10-26, effect bundle T) values that change how a field always present is played: a key: feature is on
            # every system, so it was "verified" by the first checked prefab whatever its value (酒神 S2's Local scaling)
            s.add(f"ps:scaling={ps.get('scaling', 1)}" + ('@scaledParent' if scaled_parent(nd) else ''))
            s.add(f"ps:align={ps['render'].get('align', 0)}")
            if 'uv' in ps['mods']:
                s.add(f"ps:uv.anim={ps['mods']['uv'].get('anim', 0)}")
            if 'trail' in ps['mods']:
                s.add(f"ps:trail.mode={ps['mods']['trail'].get('mode', 0)}")
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

    def component(self, type_name, tree=None):
        """A component by its type name, and (2026-10-26, effect bundle W1) its type tree's fields when given (fields)."""
        if type_name not in COMPONENTS_READ:
            self.add('component', type_name)
        elif tree is not None:
            self.fields(type_name, tree)

    def script(self, script_id, fields=None, tree=None):
        """A MonoBehaviour by its MonoScript PathID and (when its type tree reads) its own field names; a read one's type tree
        (`tree`) field by field (fields)."""
        name = SCRIPTS.get(script_id)
        if name in SCRIPTS_READ:
            if tree is not None:
                self.fields(f'script:{name}', tree)
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

    def particle(self, ps, psr=None):
        """A ParticleSystem type tree (and its renderer's, when given): the modules, the shape and every field (PS_FIELDS)."""
        self.particle_fields(ps, psr or {})
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

    def particle_fields(self, ps, psr):
        """(2026-10-26, effect bundle T) the `field` kind: each field of PS_FIELDS whose value the pipeline does not play
        (an assumed one differs, a value outside the played ones), and each field the table does not classify."""
        fs = {}
        for k, v in ps.items():
            if k.endswith('Module') and isinstance(v, dict):
                if not v.get('enabled') or k not in MODULES_READ:
                    continue   # off, or reported whole (the `module` kind)
                _fields(v, k, fs)
            elif not k.startswith('_'):
                _fields(v, k, fs)
        if psr:
            _fields(psr, 'renderer', fs)
        self.check_fields(PS_FIELDS, fs, '', (ps, psr), 'PS_FIELDS')
        cd = ps.get('CustomDataModule') or {}
        if psr and cd.get('enabled') and 'CustomDataModule' in MODULES_READ and psr.get('m_UseCustomVertexStreams'):
            st = list(_val(psr.get('m_VertexStreams') or ()))
            if st[:4] != [0, 1, 3, 4] or not set(st) <= STREAMS_PLAYED:
                self.add('field', f'renderer.m_VertexStreams = {st}',
                         'the player lays out Position, Normal, Color, UV, then the custom streams (fxplayer.js customMap)')
        # (2026-10-26, effect bundle U) the engine's sphere / hemisphere take an arc and its order too (StartSphere<mode>);
        # the player's spheres emit all round at random — PS_FIELDS looks at the arc on the cones, circles and donut only
        sh = ps.get('ShapeModule') or {}
        arc = sh.get('arc') or {}
        if sh.get('enabled') and sh.get('type') in (0, 1, 2, 3) and (arc.get('mode', 0) or _val(arc.get('spread', 0))
                                                                    or not _same(_val(arc.get('value', 360)), 360)):
            self.add('field', 'ShapeModule.arc on a Sphere / Hemisphere', 'the player\'s spheres emit all round at random')

    def check_fields(self, table, fs, prefix, args, name):
        """The `field` items of one type tree's fields `fs` ({dotted path: [values]}) by the rules of `table` (PS_FIELDS,
        COMP_FIELDS[kind]); `prefix` names the kind in the item, `args` go to a rule's `when`."""
        for path, vals in fs.items():
            rule = table.get(path)
            if rule is None:
                self.add('field', f'{prefix}{path} (not classified)', f'a field fx_coverage.{name} does not know: {_val(vals[0])!r}')
                continue
            how, a, b, when = rule
            if how in ('key', 'none', 'read') or (when and not when(*args)):
                continue
            for v in map(_val, vals):
                if how == 'assume' and not _same(v, a):
                    self.add('field', f'{prefix}{path} ≠ {a!r}', b)
                elif how == 'values' and not any(_same(v, x) for x in b):
                    self.add('field', f'{prefix}{path} = {v!r}', f'the player handles {sorted(b, key=lambda x: (type(x).__name__, x))} ({a})')

    def fields(self, kind, t):
        """(2026-10-26, effect bundle W1) the `field` kind for the type tree `t` of a GameObject, a component, a read script
        ('script:<class>') or a material (COMP_FIELDS[kind]; a kind without a table is not looked into), and a material's
        keywords the player does not follow (KEYWORDS_READ)."""
        table = COMP_FIELDS.get(kind)
        if table is None or not isinstance(t, dict):
            return
        fs = {}
        strip = _MONO_BASE if kind.startswith('script:') else {'m_Component'}
        _fields({k: v for k, v in t.items() if k not in strip}, '', fs)
        self.check_fields(table, fs, kind.removeprefix('script:') + '.', (t, None), f'COMP_FIELDS[{kind!r}]')
        if kind == 'Material':
            kws = t.get('m_ValidKeywords')
            if kws is None:
                kws = (t.get('m_ShaderKeywords') or '').split()
            for kw in kws or []:
                if kw not in KEYWORDS_READ:
                    self.add('field', f'Material keyword {kw}', 'a shader variant the player does not follow')

    def turned_nodes(self, rotate, refs, nodes):
        """(2026-10-26, effect bundle W1) the nodes a root ParticleEffect turns as it faces (`_rotationY` with FLIP_TWO_SIDE,
        `_rotationZ` with it and with FOUR_DIRECTION / FIXED_DIRECTION: `_rotateType` 1, 2, 3) against the ones the player
        turns — the first node named rotation_y / rotation_z (render/fxplayer.js applyTurn). `refs`: {field: the node index
        it references, or None}, `nodes`: the node names in walk order."""
        for field, name, types in (('_rotationY', 'rotation_y', (1,)), ('_rotationZ', 'rotation_z', (1, 2, 3))):
            if rotate not in types:
                continue
            ref = refs.get(field)
            first = next((i for i, n in enumerate(nodes) if n == name), None)
            if ref == first:
                continue
            if ref is None:
                self.add('field', f'ParticleEffect.{field} unset, a node named {name}',
                         'the player turns that node; the client turns none')
            elif first is None:
                self.add('field', f'ParticleEffect.{field} on a node not named {name}',
                         'the client turns it; the player turns none')
            else:
                self.add('field', f'ParticleEffect.{field} on another node than the first named {name}',
                         'the client turns the one referenced; the player the first of that name')

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
