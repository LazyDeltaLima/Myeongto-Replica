// render/fxplayer.js — official battle effects (local patch, docs/LOCAL-PATCH.md): plays the effect prefabs that
// tools/local-extract/fx_extract.py exported from a local client (public/assets/local/fx/**) in a three.js scene that
// uses the battlefield camera (render/projection.js — Arknights' own 30° / 40° camera, so the effects keep their framing).
//
// An effect = a node tree (Unity transforms) with particle systems, plain meshes and its Mecanim clips. The whole tree is
// simulated in Unity's battle frame (x = col, y = row, z = −height) under a root that mirrors z, so every module keeps
// Unity's own semantics (shapes, alignments, euler order ZXY) and the scene sees board coordinates.
//
// Subset of Unity's particle system: start values (constant / curve / random two curves / random two constants), rate
// and bursts, shapes (sphere, hemisphere, cone, box, circle, edge, rectangle, donut), velocity / force / limit velocity /
// noise (cheap), color / size / rotation over lifetime, texture sheet frames, custom data (two vec4 streams), local or
// world simulation, Birth sub emitters; renderers billboard / stretched / horizontal / vertical / mesh. Shaders: one uber shader standing in for the Torappu particle shaders (main texture with UV scroll,
// distortion, dissolve with edge, colour ramp, the material's blend factors); the renderers' FxUVTweener scripts move their
// textures' offsets (uvTween, 2026-10-14).
//
// Cost control (DESIGN §17.3 rules): one draw call per particle system (instanced, skipped while it has no particle),
// particle arrays preallocated and reused, no per-frame allocation, curves flattened to typed arrays at load, a
// system's instance data in one interleaved buffer (one upload, by the used range), trail strips uploaded by the used
// range, a global particle budget per quality ('high' 6000 / 'medium' 2500 / 'low' 0 = the procedural FX only),
// emission scaled by quality, at most PLAYER_CAP effects alive (the oldest is ended; an ended instance reports
// done — render/fxgame.js keeps its own caps per kind below it: MAX_INSTANCES short, MAX_LASTING lasting), textures
// and meshes shared; (2026-10-28) the shader's scalar uniforms packed (PACKED_GLSL: three.js walks every uniform of a
// material on each draw), the noise and the ribbon order without per-call allocation or comparator. A speed-up must not
// change the picture: render the same seeded scene with the git version and the working file and compare the pixels, and
// pin the numbers in a test (test/render/fx-cpu-identity.test.js; docs/rules/fx.md 「공식 전투 이펙트」, 성능 2).
//
//   const lib = new FxLibrary('/assets/local/fx/');  const def = await lib.load('chen3', 'chen3_skill_01_start_01');
//   const fx = new FxInstance(def, { quality });  scene.add(fx.object);  fx.object.position.set(col, row, 0);
//   each frame: fx.update(dtSeconds, camera);  if (fx.done) { scene.remove(fx.object); fx.dispose(); }

import * as THREE from '../../vendor/three.module.js';
import { effectTurn } from './fx/face.js';

/**
 * The prefab records fx_extract.py writes (FxLibrary.load reads them as JSON), typed by the fields this file reads; a
 * record's other fields are `unknown` (render/fxgame.js reads some of them). A field a mode or switch needs is typed as
 * present (a MinMaxGradient's `g` for its gradient modes): the extract writes what its mode reads.
 * @typedef {{ [key: string]: unknown }} Bag a record read by key
 * @typedef {number[]} CurveKey an AnimationCurve key [t, v, in, out] (a missing or null tangent: a stepped key)
 * @typedef {{ m: number, s: number, n: number, c?: CurveKey[], d?: CurveKey[], cf?: Float64Array, df?: Float64Array }} MinMax
 *   a MinMaxCurve (`m` 0 constant `s`, 1 curve `c` × `s`, 2 between the curves `d` and `c` × `s`, 3 between `n` and `s`;
 *   `cf` / `df` the flat forms prepareCurves attaches)
 * @typedef {{ c: number[][], a: number[][], mode?: number, cf?: Float64Array, af?: Float64Array }} Gradient colour keys
 *   [[t, r, g, b]…] and alpha keys [[t, a]…] (`mode` 1 fixed), their flat forms `cf` / `af`
 * @typedef {Gradient & { cf: Float64Array, af: Float64Array }} FlatGradient a Gradient with its flat forms
 * @typedef {{ m?: number, g: Gradient, h: Gradient, a: number[], b: number[] }} MinMaxGradient `m` 0 the colour `a`, 1 the
 *   gradient `g`, 2 between the colours `b` and `a`, 3 between the gradients `h` and `g`, 4 `g` at the particle's random
 * @typedef {{ t: number, n: MinMax, cycles?: number, interval?: number, p?: number }} Burst an emission burst
 * @typedef {{ type: number, mesh?: string, radius: number, arc?: number, arcMode?: number, arcSpread?: number, arcSpeed?: MinMax,
 *   radMode?: number, radSpread?: number, radSpeed?: MinMax, thick?: number, angle?: number, length?: number, scale?: number[],
 *   box?: number[], donut?: number, meshCol?: boolean, place?: number, randDir?: number, sphDir?: number, randPos?: number,
 *   rotE?: number[], pos?: number[] }} PsShape a ShapeModule
 * @typedef {{ mode: number, align: number, mat?: string, trailMat?: string, mesh?: string, meshes?: string[], lengthScale?: number,
 *   velScale?: number, free?: boolean, rotw?: boolean, pivot?: unknown, sortMode?: number, flip?: number[], layer?: number,
 *   order?: number, fudge?: number, ownStreams?: number | boolean | null, streams?: number[] }} PsRender a ParticleSystemRenderer
 * @typedef {{ x: MinMax, y: MinMax, z: MinMax }} Axes3 a module's curve per axis
 * @typedef {{ x?: MinMax, y?: MinMax, z: MinMax }} RotAxes a rotation module's curves (x / y with separate axes)
 * @typedef {{ x: MinMax, y?: MinMax, z?: MinMax }} SizeAxes a size module's curves (y / z with separate axes)
 * @typedef {Axes3 & { on?: number | boolean, orbX?: MinMax, orbY?: MinMax, orbZ?: MinMax, radial?: MinMax, orbOff?: MinMax[],
 *   speedMul?: MinMax }} VelocityModule VelocityOverLifetime with its orbit, radial and speed modifier
 * @typedef {{ str: MinMax, strY?: MinMax, strZ?: MinMax, freq?: number, damping?: boolean, posAmt?: MinMax, rotAmt?: MinMax,
 *   sizeAmt?: MinMax, scroll?: MinMax, oct?: number, octMul?: number, octScale?: number, qual?: number }} NoiseModule
 * @typedef {{ mode?: number, life: MinMax, world?: boolean, die?: boolean, split?: boolean, texMode?: number, inherit?: boolean,
 *   width?: MinMax, sizeWidth?: boolean, colorOT: MinMaxGradient, colorOL?: MinMaxGradient, ratio?: number,
 *   minDist: number }} TrailModule
 * @typedef {{ dampen: MinMax, bounce: MinMax, lifeLoss: MinMax, radius?: number, minKill?: number, maxKill?: number,
 *   planes?: number[] }} CollisionModule
 * @typedef {{ frame: MinMax, start: MinMax, tx?: number, ty?: number, anim?: number, cycles?: number, rowMode?: number,
 *   row?: number }} SheetModule TextureSheetAnimation
 * @typedef {{ node: number, type?: number, props?: number, p?: number }} SubEmitter a sub emitter entry
 * @typedef {{ inherit?: { mode?: number, k: MinMax }, velOL?: VelocityModule, noise?: NoiseModule, rotOL?: RotAxes,
 *   rotBySpeed?: RotAxes & { range?: number[] }, sizeOL?: SizeAxes, sizeBySpeed?: SizeAxes & { range?: number[] },
 *   force?: Axes3, limit?: { mag: MinMax, drag: MinMax, dampen?: number }, collide?: CollisionModule,
 *   colorOL?: MinMaxGradient, custom?: ({ v?: MinMax[], col?: MinMaxGradient } | null)[], uv?: SheetModule,
 *   trail?: TrailModule, sub?: SubEmitter[] }} PsModules a system's modules (absent: off)
 * @typedef {{ render: PsRender, mods: PsModules, shape?: PsShape, space?: number, max?: number, dur: number, loop?: boolean,
 *   prewarm?: boolean, delay?: MinMax, life: MinMax, speed: MinMax, size: MinMax, sizeY?: MinMax, sizeZ?: MinMax,
 *   rot: MinMax, rotX?: MinMax, rotY?: MinMax, flipRot?: number, color: MinMaxGradient, rate: MinMax, dist?: MinMax,
 *   bursts?: Burst[], gravity: MinMax, speedMul?: number, scaling?: number }} PsRec a ParticleSystem (node `ps`)
 * @typedef {{ mat: string, width: number, time: number, minDist: number, grad: Gradient, widthCurve?: CurveKey[],
 *   wf?: Float64Array, texMode?: number, align?: number, layer?: number, order?: number }} TrailRec a TrailRenderer (`trailR`)
 * @typedef {{ mat: string, width: number, pts: number[][], grad: Gradient, widthCurve?: CurveKey[], loop?: boolean,
 *   world?: boolean, texMode?: number, layer?: number, order?: number }} LineRec a LineRenderer (`lineR`)
 * @typedef {{ mesh: string, mat: string, more?: string[], off?: boolean, bones: number[], layer?: number,
 *   order?: number }} MeshRec a MeshRenderer (`mesh`) or SkinnedMeshRenderer (`skin`, its `bones`)
 * @typedef {{ maps: [string, number, number, number?][], shared?: boolean, keep?: boolean, until?: number }} UvTweenRec
 *   a node's FxUVTweener (`uvt`)
 * @typedef {{ effects?: unknown[], [key: string]: unknown }} EmitRec an OnPlayEmitter / OnFinishEmitter record
 *   (render/fxgame.js plays it)
 * @typedef {{ name: string, parent: number, pos?: number[], rot?: number[], scale?: number[], active?: boolean, ps?: PsRec,
 *   trailR?: TrailRec, lineR?: LineRec, mesh?: MeshRec, skin?: MeshRec, uvt?: UvTweenRec, uvr?: number[], delay?: number,
 *   sdelay?: number, emit?: { effect?: string, count?: number, [key: string]: unknown }, onPlay?: EmitRec,
 *   onFinish?: EmitRec, onPlayIf?: EmitRec[], [key: string]: unknown }} FxNode a node of the prefab tree (`parent` −1: the
 *   root); the pause keys (PAUSE_KEYS) are among the rest
 * @typedef {{ pos: number[], idx: number[], uv?: number[], col?: number[], sub?: number[][], bi?: number[], bw?: number[],
 *   bind?: number[][] }} MeshFile a mesh file (mesh/<key>.json: positions, indices, uvs, vertex colours 0–255, sub-meshes, skin)
 * @typedef {{ img: string, tiling: number[], offset: number[] }} MatTex a material texture slot
 * @typedef {{ shader?: string, floats?: Record<string, number>, colors?: Record<string, number[]>,
 *   tex?: Record<string, MatTex>, keywords?: string[], queue?: number }} MatRec a material
 * @typedef {{ node: number, prop: string, type?: number, curves: number[][][] }} ClipTrack a clip track: its streamed keys
 *   [[t, c0, c1, c2, c3]…] per component
 * @typedef {{ tracks: ClipTrack[], len?: number, loop?: boolean, sm?: number }} FxClip a Mecanim clip (`sm`: its state machine)
 * @typedef {{ from: number, to: number, dur: number, exit?: number | null, norm?: boolean, offset?: number,
 *   cond?: [string, string, number][] }} SmTransition a transition (`from` −1: any state)
 * @typedef {{ node: number, states: ({ clip?: number, speed?: number } | undefined)[], def?: number,
 *   params?: Record<string, [string, unknown]>, trans?: SmTransition[] }} SmDef a state machine (`params`: name → [type, default])
 * @typedef {{ sm: number, p: string, buff: string, int?: boolean, fin?: number, def?: number, curve?: CurveKey[] }} AnimSource
 *   a parameter fed by a buff's progress (`animSrc`)
 * @typedef {{ sm: number, pairs?: [string, string][], def?: string | null }} AnimBuff a trigger by the owner's buffs (`animBuff`)
 * @typedef {{ sm: number, rec?: boolean, play?: number, p?: string, v?: unknown }} AnimFinish what the finish sets (`animFin`)
 * @typedef {{ fxDelay?: number, delay?: number, rnd?: boolean, bodyNode?: number, speed?: number, limit?: number, hold?: unknown,
 *   [key: string]: unknown }} FaceRec the root's
 *   effect component (render/fx/face.js)
 * @typedef {{ nodes: FxNode[], materials: Record<string, MatRec | undefined>, geoms: Record<string, THREE.BufferGeometry | null>,
 *   lib: FxLibrary, bundle?: string, face?: FaceRec, mount?: { followScaleSign?: boolean, followScale?: boolean,
 *   useBehaviourPause?: boolean, pauseWhenInvalid?: boolean, onlyPauseWhenInvalid?: boolean, keepOriginRotation?: number,
 *   type?: number },
 *   jitter?: unknown[], rdir?: unknown[], lod?: { off?: number[], ps?: [number, number][] }, clips?: FxClip[], sms?: SmDef[],
 *   animSrc?: AnimSource[], animBuff?: AnimBuff[], animFin?: AnimFinish[], mainPs?: number, offFinish?: number[],
 *   finish?: number, name?: string, duration?: number, swFace?: { oneShot?: boolean, up?: string, down?: string, left?: string,
 *   [key: string]: unknown },
 *   back?: { effect?: string, beh?: boolean, force?: boolean, sync?: boolean, oneShot?: boolean, predict?: unknown } | null,
 *   three?: { up?: string, [key: string]: unknown } | null, right?: string, rightOnce?: boolean, rightRev?: boolean,
 *   follow?: { once?: boolean, src?: string, left?: number, vflip?: number, [key: string]: unknown } | null, tileH?: number,
 *   spawn?: number, rootTile?: boolean, height?: number, lineDyn?: Record<string, unknown>, lineEm?: Record<string, unknown>,
 *   followOwner?: boolean, posCap?: boolean, rgroup?: { pick?: string[], self?: boolean, noOwner?: boolean, mainPos?: boolean },
 *   equipFx?: { hooks?: [string, unknown, string][], pause?: boolean }, fly?: { loc: number, inv?: boolean, dur?: unknown,
 *   real?: boolean, ease: number }, swBB?: { fx: string[], iv?: unknown, buff: string, [key: string]: unknown },
 *   [key: string]: unknown }} FxDef a loaded prefab (FxLibrary.load: its meshes in `geoms`, its library `lib`) — the fields
 *   render/fxgame.js reads by name too
 */
/**
 * The player's own records.
 * @typedef {{ value: any }} Uniform a material uniform (any: the loose three.js stand-in's value — a number, a vector, a texture)
 * @typedef {{ budget: number, emission: number }} Quality a QUALITY entry
 * @typedef {{ o: THREE.Object3D, tr: ClipTrack, len: number, off?: number, loop?: boolean, ci?: number, also?: TrackBind[] }} TrackBase
 * @typedef {TrackBase & ({ kind: 'pos' | 'scale' | 'quat' | 'euler' | 'active' } | { kind: 'width', ln: LineRenderer }
 *   | { kind: 'set', at: Bag, key: string | number, bool?: boolean, k?: number } | { kind: 'visible', m: THREE.Mesh }
 *   | { kind: 'matComp', u: Uniform, axis: string, k: number } | { kind: 'mat', u: Uniform })} TrackBind what a clip track
 *   drives (FxInstance.bindTrack0)
 * @typedef {{ u: Uniform, z0: number, w0: number, vx: number, vy: number, until: number, frac: boolean, dyn?: boolean,
 *   s1?: number, zs?: number, ws?: number }} UvTweenMap a texture offset an FxUVTweener moves (uvTween; `dyn`: a clip moves its speed)
 * @typedef {{ e: SubEmitter, sys: ParticleSystemLinks }} SubLink a sub emitter and its target system (ParticleSystem.setSubs)
 * @typedef {{ at: THREE.Vector3, t01: number, col?: number[] | null, size?: number[] | null, rot?: number | null, lifeK?: number,
 *   parent?: number }} SubBirth a sub emitter's emission at a parent particle (ParticleSystem.emit)
 * @typedef {{ pts: Float32Array, cnt: number, born: number, tl: number, r0: number, r1: number, r2: number, a: number,
 *   col: Float32Array, size: number }} Ghost a dead particle's trail kept (ParticleSystem.ghost)
 * @typedef {{ mesh: THREE.Mesh, g: THREE.InstancedBufferGeometry, ib: THREE.InstancedInterleavedBuffer,
 *   src: THREE.BufferGeometry }} MoreMesh a mesh renderer's further mesh (ParticleSystem `more`)
 * @typedef {{ place: number, cum: Float64Array | null, total: number, I: ArrayLike<number>, P: ArrayLike<number>,
 *   N: ArrayLike<number>, C: ArrayLike<number> | null, nv: number, c: number[] }} MeshShapeData a Mesh shape (meshShape)
 * @typedef {{ k: number, count: number, time: number, t01: number, arcLaps: number, radLaps: number }} ShapeCtx an emission's
 *   place in its frame (shapeSample)
 * @typedef {{ to: number, dur: number, t: number, dt: number }} SmFade a running transition
 * @typedef {{ d: SmDef, k: number, cur: number, t: number, fresh: boolean, tr: SmFade | null, p: Record<string, unknown>,
 *   fin: boolean, bt?: string | null }} SmRun a state machine's state (FxInstance.newSm)
 * @typedef {{ m: SmRun, b: TrackBind, def: number[], tracks: TrackBind[], v: number[] }} SmSlot what a state machine's clips
 *   drive at one place (FxInstance.smSlots)
 * @typedef {StripBatch & { vb: THREE.InterleavedBuffer, index: THREE.BufferAttribute, room: number, geometry: THREE.BufferGeometry }} StripBatchBuf
 *   a StripBatch with its buffers (its constructor builds them: StripBatch.build)
 * @typedef {{ pick: (x: FxInstance) => ParticleSystem | StripBatch, id: number, strip: boolean, batch: StripRows | RowBatch | null,
 *   material: THREE.ShaderMaterial }} FlightSlot a renderer FlightBatch merges across the copies of one prefab
 * @typedef {{ begin(): void, add(x: ParticleSystem | StripBatch, ox: number, oy: number, oz: number): boolean,
 *   end(material: THREE.ShaderMaterial | undefined, order: number | undefined, x: number, y: number, z: number): void,
 *   dispose(): void }} MergeBatch
 *   what FlightBatch.merge calls on a slot's batch (a RowBatch for particles, a StripRows for ribbons)
 */

/** @type {Readonly<Record<string, Quality>>} */
export const QUALITY = Object.freeze({
  high: { budget: 6000, emission: 1 },
  medium: { budget: 2500, emission: 0.6 },
  low: { budget: 0, emission: 0 },
});
/** Short effects (hits, casts, trails) alive at once — render/fxgame.js trimLive ends the oldest past it. */
export const MAX_INSTANCES = 24;
/** (2026-10-21) the node keys of the client's pause / finish behaviours (fx_extract.py pause_scripts; render/fx/pause.js). */
export const PAUSE_KEYS = Object.freeze(['pauseIf', 'pauseOther', 'pauseAnim', 'pauseIdle', 'pauseMove', 'pauseGone', 'pauseMenu', 'pauseSpine', 'finishIf']);
/** Lasting effects (buff loops, skill walls / zones: render/fxgame.js isLasting) alive at once besides them (2026-10-10:
 * 余 S3's wall alone is 2 per tile + 2 ends — 44 across the boss field). */
export const MAX_LASTING = 48;
/** The player's own backstop over every instance (a caller without its own cap, or two views at once). */
const PLAYER_CAP = MAX_INSTANCES + MAX_LASTING + 8;
/**
 * 2026-11-12: the backstop of the pinned instances (FxInstance opts.pinned — render/fxgame.js's `pinned` entries, which its
 * caps never end: an operator's always-on effects, the board's own, a floor laid on every tile of a field), counted apart
 * from PLAYER_CAP. They were counted in it, and the oldest went first: 规程's 悲惨之雨 floors (44 on a field) ended the
 * sandstorm and the other board effects lit before them.
 */
const PINNED_CAP = 512;
const GRAVITY = new THREE.Vector3(0, 0, 9.81); // Unity battle frame: +z is down (z = −height)
/** Particle systems alive (registered by their constructor, removed by dispose). */
const systems = new Set();
/** Particles of the registered systems, kept by emit / kill / dispose (summing every system on each emit call was 12% of
 *  the player's CPU in a crowded scene). */
let liveParticles = 0;

// ---------------------------------------------------------------- curves

/**
 * Hermite AnimationCurve [[t, v, in, out]…] at t.
 * @param {CurveKey[] | null | undefined} keys
 * @param {number} t
 */
export function evalCurve(keys, t) {
  if (!keys || !keys.length) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  const n = keys.length;
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 1;
  while (i < n && keys[i][0] < t) i++;
  const a = keys[i - 1], b = keys[i];
  const dt = b[0] - a[0];
  if (dt <= 0) return b[1];
  const s = (t - a[0]) / dt;
  const out = Number.isFinite(a[3]) ? a[3] : 0, inn = Number.isFinite(b[2]) ? b[2] : 0;
  if (!Number.isFinite(a[3]) || !Number.isFinite(b[2])) return a[1]; // stepped key
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * a[1] + (s3 - 2 * s2 + s) * dt * out + (-2 * s3 + 3 * s2) * b[1] + (s3 - s2) * dt * inn;
}

// Curves and gradients are flattened into Float64Arrays when an effect is loaded (prepareCurves): the per-particle
// evaluations read one typed array instead of nested key arrays. The arithmetic and its order are the ones of evalCurve /
// evalGradient, so the results are the same numbers.

/**
 * Keys [[t, v, in, out]…] → [n, t0, v0, in0, out0, t1, …]; a missing or non-finite tangent becomes NaN (a stepped key).
 * @param {CurveKey[]} keys
 */
function flatKeys(keys) {
  const f = new Float64Array(1 + keys.length * 4);
  f[0] = keys.length;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i], o = 1 + i * 4;
    f[o] = k[0]; f[o + 1] = k[1];
    f[o + 2] = Number.isFinite(k[2]) ? k[2] : NaN; f[o + 3] = Number.isFinite(k[3]) ? k[3] : NaN;
  }
  return f;
}

/**
 * evalCurve over flatKeys data.
 * @param {Float64Array} f
 * @param {number} t
 */
function evalFlat(f, t) {
  const n = f[0];
  if (!n) return 0;
  if (t <= f[1]) return f[2];
  const z = 1 + (n - 1) * 4;
  if (t >= f[z]) return f[z + 1];
  let i = 1;
  while (i < n && f[1 + i * 4] < t) i++;
  const a = 1 + (i - 1) * 4, b = a + 4;
  const dt = f[b] - f[a];
  if (dt <= 0) return f[b + 1];
  const s = (t - f[a]) / dt;
  const out = f[a + 3], inn = f[b + 2];
  if (!Number.isFinite(out) || !Number.isFinite(inn)) return f[a + 1]; // stepped key
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * f[a + 1] + (s3 - 2 * s2 + s) * dt * out + (-2 * s3 + 3 * s2) * f[b + 1] + (s3 - s2) * dt * inn;
}

/**
 * Gradient keys [[t, …w values]…] → [n, t0, …, t1, …].
 * @param {number[][]} keys
 * @param {number} w
 */
function flatGradKeys(keys, w) {
  const f = new Float64Array(1 + keys.length * w);
  f[0] = keys.length;
  for (let i = 0; i < keys.length; i++) for (let k = 0; k < w; k++) f[1 + i * w + k] = keys[i][k];
  return f;
}

/** @type {(a: unknown) => a is number[][]} */
const isKeyList = (a) => Array.isArray(a) && Array.isArray(a[0]);

/**
 * A MinMaxCurve in one object shape ({m, s, n, c, d, cf, df}, absent fields undefined, the flat forms attached): the
 * extracted ones come in four ({m, s}, {m, s, n}, {m, s, c}, {m, s, c, d}), and evalMM, read per particle and module,
 * looked their fields up through all of them (load study F, 2026-11-15). Same fields, same values.
 * @param {MinMax} o
 * @returns {MinMax}
 */
function curveOf(o) {
  return { m: o.m, s: o.s, n: o.n, c: o.c, d: o.d, cf: Array.isArray(o.c) ? flatKeys(o.c) : undefined, df: Array.isArray(o.d) ? flatKeys(o.d) : undefined };
}

/**
 * Attach the flat forms to every MinMaxCurve ({m, s, c?, d?}: cf / df — each replaced by its curveOf copy) and Gradient
 * ({c, a, mode}: cf / af) below o. @returns o, or its copy when o is a MinMaxCurve itself.
 * @param {Bag} o
 */
export function prepareCurves(o) {
  if (!o || typeof o !== 'object' || ArrayBuffer.isView(o)) return o;
  if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) o[i] = prepareCurves(o[i]); return o; }
  if (typeof o.m === 'number' && 's' in o) return curveOf(/** @type {MinMax} */ (o));
  if (isKeyList(o.c) && isKeyList(o.a) && 'mode' in o) { o.cf = flatGradKeys(o.c, 4); o.af = flatGradKeys(o.a, 2); }
  for (const k in o) {
    if (k === 'cf' || k === 'df' || k === 'af') continue;
    const v = o[k];
    if (v && typeof v === 'object') o[k] = prepareCurves(/** @type {Bag} */ (v));
  }
  return o;
}

/**
 * MinMaxCurve {m, s, n?, c?, d?} at normalized time t with the particle's random r.
 * @param {MinMax | null | undefined} mm
 * @param {number} t
 * @param {number} r
 */
export function evalMM(mm, t, r) {
  if (!mm) return 0;
  switch (mm.m) {
    case 1: return mm.s * (mm.cf ? evalFlat(mm.cf, t) : evalCurve(mm.c, t));
    case 2: {
      const a = mm.df ? evalFlat(mm.df, t) : evalCurve(mm.d, t), b = mm.cf ? evalFlat(mm.cf, t) : evalCurve(mm.c, t);
      return mm.s * (a + (b - a) * r);
    }
    case 3: return mm.n + (mm.s - mm.n) * r;
    default: return mm.s;
  }
}

/**
 * evalGradient over the flat colour / alpha keys.
 * @param {FlatGradient} g
 * @param {number} t
 * @param {number[]} out
 */
function evalGradientFlat(g, t, out) {
  const c = g.cf, a = g.af, nc = c[0], na = a[0];
  if (t <= c[1]) { out[0] = c[2]; out[1] = c[3]; out[2] = c[4]; } else {
    const z = 1 + (nc - 1) * 4;
    if (t >= c[z]) { out[0] = c[z + 1]; out[1] = c[z + 2]; out[2] = c[z + 3]; } else {
      let i = 1;
      while (i < nc && c[1 + i * 4] < t) i++;
      const p = 1 + (i - 1) * 4, q = p + 4, s = g.mode === 1 ? 1 : (t - c[p]) / Math.max(1e-6, c[q] - c[p]);
      out[0] = c[p + 1] + (c[q + 1] - c[p + 1]) * s; out[1] = c[p + 2] + (c[q + 2] - c[p + 2]) * s; out[2] = c[p + 3] + (c[q + 3] - c[p + 3]) * s;
    }
  }
  if (t <= a[1]) out[3] = a[2]; else {
    const z = 1 + (na - 1) * 2;
    if (t >= a[z]) out[3] = a[z + 1]; else {
      let i = 1;
      while (i < na && a[1 + i * 2] < t) i++;
      const p = 1 + (i - 1) * 2, q = p + 2, s = g.mode === 1 ? 1 : (t - a[p]) / Math.max(1e-6, a[q] - a[p]);
      out[3] = a[p + 1] + (a[q + 1] - a[p + 1]) * s;
    }
  }
  return out;
}

/**
 * @param {Gradient} g
 * @param {number} t
 * @param {number[]} out
 * @returns {number[]}
 */
function evalGradient(g, t, out) {
  if (g.cf) return evalGradientFlat(/** @type {FlatGradient} */ (g), t, out);
  const c = g.c, a = g.a;
  let i = 1;
  if (t <= c[0][0]) { out[0] = c[0][1]; out[1] = c[0][2]; out[2] = c[0][3]; } else if (t >= c[c.length - 1][0]) {
    const k = c[c.length - 1]; out[0] = k[1]; out[1] = k[2]; out[2] = k[3];
  } else {
    while (i < c.length && c[i][0] < t) i++;
    const p = c[i - 1], q = c[i], s = g.mode === 1 ? 1 : (t - p[0]) / Math.max(1e-6, q[0] - p[0]);
    out[0] = p[1] + (q[1] - p[1]) * s; out[1] = p[2] + (q[2] - p[2]) * s; out[2] = p[3] + (q[3] - p[3]) * s;
  }
  if (t <= a[0][0]) out[3] = a[0][1]; else if (t >= a[a.length - 1][0]) out[3] = a[a.length - 1][1]; else {
    i = 1;
    while (i < a.length && a[i][0] < t) i++;
    const p = a[i - 1], q = a[i], s = g.mode === 1 ? 1 : (t - p[0]) / Math.max(1e-6, q[0] - p[0]);
    out[3] = p[1] + (q[1] - p[1]) * s;
  }
  return out;
}

const gradA = [0, 0, 0, 0], gradB = [0, 0, 0, 0];   // evalMG mode 3 (random between two gradients)

/**
 * MinMaxGradient at t with random r → out [r, g, b, a].
 * @param {MinMaxGradient | null | undefined} mg
 * @param {number} t
 * @param {number} r
 * @param {number[]} out
 */
export function evalMG(mg, t, r, out) {
  if (!mg) { out[0] = out[1] = out[2] = out[3] = 1; return out; }
  switch (mg.m) {
    case 1: return evalGradient(mg.g, t, out);
    case 2: for (let k = 0; k < 4; k++) out[k] = mg.b[k] + (mg.a[k] - mg.b[k]) * r; return out;
    case 3: {
      const a = evalGradient(mg.h, t, gradA), b = evalGradient(mg.g, t, gradB);
      for (let k = 0; k < 4; k++) out[k] = a[k] + (b[k] - a[k]) * r;
      return out;
    }
    case 4: return evalGradient(mg.g, r, out);
    default: out[0] = mg.a[0]; out[1] = mg.a[1]; out[2] = mg.a[2]; out[3] = mg.a[3]; return out;
  }
}

/**
 * Mecanim streamed key list [[t, c0, c1, c2, c3]…] at t.
 * @param {number[][] | null | undefined} keys
 * @param {number} t
 */
function evalClipCurve(keys, t) {
  if (!keys || !keys.length) return 0;
  let k = keys[0];
  for (let i = 1; i < keys.length && keys[i][0] <= t; i++) k = keys[i];
  const dt = Math.max(0, t - k[0]);
  return ((k[1] * dt + k[2]) * dt + k[3]) * dt + k[4];
}

/**
 * Write a clip track's value `v` to what it drives (FxInstance.bindTrack0).
 * @param {TrackBind} b
 * @param {number[]} v
 */
function writeTrack(b, v) {
  const o = b.o;
  switch (b.kind) {
    case 'pos': o.position.set(v[0], v[1], v[2]); break;
    case 'scale': o.scale.set(v[0], v[1], v[2]); break;
    case 'quat': o.quaternion.set(v[0], v[1], v[2], v[3]).normalize(); break;
    case 'euler': o.quaternion.setFromEuler(clipE.set(v[0] * D2R, v[1] * D2R, v[2] * D2R, 'YXZ')); break;
    case 'matComp': if (b.u.value?.isVector4 || b.u.value?.isVector2) b.u.value[b.axis] = v[0] * b.k; break;
    case 'width': b.ln.w = v[0]; break; // local patch
    case 'active': o.visible = v[0] > 0.5; break; // local patch: m_IsActive
    case 'set': b.at[b.key] = b.bool ? v[0] > 0.5 : v[0] * (b.k || 1); break; // 2026-10-22
    case 'visible': b.m.visible = v[0] > 0.5; break; // 2026-10-22: MeshRenderer.m_Enabled
    default: b.u.value = v[0];
  }
  if (b.also) for (const a of b.also) writeTrack(a, v);   // (2026-10-26) the renderer's further materials
}

/**
 * 2026-10-22 (effect bundle J): whether an exit time `exit` (normalized) was passed between state times `t0` and `t1` of a
 * state `len` s long — a looping state's below 1 on the frame it is passed in each loop (Mecanim evaluates it every loop),
 * else from then on [ASSUMED for a non-looping state: Unity's manual describes the looping case only].
 * @param {number} t0 @param {number} t1 @param {number} len @param {boolean} loop @param {number} exit
 */
function exitPassed(t0, t1, len, loop, exit) {
  if (!(len > 0)) return true;
  const n0 = t0 / len, n1 = t1 / len;
  if (loop && exit < 1) return n1 >= exit && Math.floor(n1 - exit) > Math.floor(n0 - exit);
  if (loop) return n0 < exit && n1 >= exit;
  return n1 >= exit;
}

/**
 * A Mecanim transition condition (fx_extract.py COND_MODES) on parameter value `v`.
 * @param {unknown} v
 * @param {string} mode
 * @param {number} x
 */
function condOk(v, mode, x) {
  switch (mode) {
    case 'if': return !!v;
    case 'ifnot': return !v;
    case 'gt': return Number(v) > x;
    case 'lt': return Number(v) < x;
    case 'eq': return Number(v) === x;
    case 'ne': return Number(v) !== x;
    default: return false;
  }
}

/**
 * A Unity AnimationCurve [[time, value, inSlope, outSlope]] at `t` (Hermite; a null tangent = a step), clamped at its ends.
 * @param {CurveKey[] | null | undefined} keys
 * @param {number} t
 */
function keyCurve(keys, t) {
  if (!keys?.length) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t >= b[0]) continue;
    if (a[3] == null || b[2] == null) return a[1];
    const h = b[0] - a[0], s = (t - a[0]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * a[1] + (s3 - 2 * s2 + s) * h * a[3] + (-2 * s3 + 3 * s2) * b[1] + (s3 - s2) * h * b[2];
  }
  return keys[keys.length - 1][1];
}

// ---------------------------------------------------------------- shader

/** @type {Readonly<Record<number, number>>} */
const BLEND = { 0: THREE.ZeroFactor, 1: THREE.OneFactor, 2: THREE.DstColorFactor, 3: THREE.SrcColorFactor,
  4: THREE.OneMinusDstColorFactor, 5: THREE.SrcAlphaFactor, 6: THREE.OneMinusSrcColorFactor, 7: THREE.DstAlphaFactor,
  8: THREE.OneMinusDstAlphaFactor, 9: THREE.SrcAlphaSaturateFactor, 10: THREE.OneMinusSrcAlphaFactor };

// (2026-10-28, mobile perf) The shader's scalar uniforms travel packed: three.js walks every uniform of a material on each
// draw (a draw is one particle system, trail or mesh, and each has its own material), and with ~80 of them that walk was the
// largest part of the effect layer's draw in a boss fight. The 18 switches are bits of one int (uPFlags), the 4 small ints
// one ivec4 (uPInt), the 17 floats five vec4s (uPF0..4); the shader reads them back by the same names (PACKED_GLSL's
// defines), so its code is unchanged and it gets the same values. On the material the old names stay as accessors
// (PackedFlag / PackedNum): code, clips and tests read and write `uniforms.uOpacity.value` as before.
const PACKED_FLAGS = ['uFracUV', 'uHasAdd', 'uHasDisturb', 'uHasDisturb2', 'uHasWeight', 'uHasDissolve', 'uVCMajor', 'uHasDissolve2', 'uVCol',
  'uRim', 'uPremul', 'uZFlat', 'uHasRam', 'uCustom', 'uAdditive', 'uUVRot', 'uFree', 'uRotW', 'uPremulX2', 'uSysOn', 'uRimAdd'];
const PACKED_INTS = ['uMode', 'uAlign', 'uDisMode', 'uMulti'];
const PACKED_FLOATS = ['uAddFactor', 'uOpacity', 'uACtrl', 'uDisturbMain', 'uDisturbDissolve', 'uAmount', 'uBorder', 'uAmount2', 'uBorder2',
  'uRimPower', 'uFloor', 'uBaseH', 'uTime', 'uLengthScale', 'uVelScale', 'uHand', 'uWSign', 'uDisChan', 'uMainChan', 'uRamChan'];
const AXES = ['x', 'y', 'z', 'w'];
const PACKED_GLSL = [
  `uniform int uPFlags; uniform ivec4 uPInt; ${[0, 1, 2, 3, 4].map((k) => `uniform vec4 uPF${k};`).join(' ')}`,
  ...PACKED_FLAGS.map((n, k) => `#define ${n} ((uPFlags & ${1 << k}) != 0)`),
  ...PACKED_INTS.map((n, k) => `#define ${n} uPInt.${AXES[k]}`),
  ...PACKED_FLOATS.map((n, k) => `#define ${n} uPF${k >> 2}.${AXES[k & 3]}`),
].join('\n');
/** A switch of uPFlags under its old name: `value` reads and writes its bit (a boolean, as the bool uniform it was). */
class PackedFlag {
  /** @param {{ value: number }} u @param {number} bit */
  constructor(u, bit) { this.u = u; this.bit = bit; }
  get value() { return (this.u.value & this.bit) !== 0; }
  /** @param {boolean} v */
  set value(v) { this.u.value = v ? this.u.value | this.bit : this.u.value & ~this.bit; }
}
/** A component of a packed vector under its old name. */
class PackedNum {
  /** @param {THREE.Vector4} v @param {string} axis */
  constructor(v, axis) { this.v = v; this.axis = axis; }
  get value() { return this.v[this.axis]; }
  /** @param {number} x */
  set value(x) { this.v[this.axis] = x; }
}
/**
 * The material's scalar uniforms → the packed ones, each old name an accessor onto its place (initial values kept).
 * @param {Record<string, Uniform>} u
 */
function packUniforms(u) {
  const flags = { value: 0 }, ints = { value: new THREE.Vector4() }, floats = [0, 1, 2, 3, 4].map(() => ({ value: new THREE.Vector4() }));
  PACKED_FLAGS.forEach((n, k) => { const v = u[n].value; u[n] = new PackedFlag(flags, 1 << k); u[n].value = v; });
  PACKED_INTS.forEach((n, k) => { const v = u[n].value; u[n] = new PackedNum(ints.value, AXES[k]); u[n].value = v; });
  PACKED_FLOATS.forEach((n, k) => { const v = u[n].value; u[n] = new PackedNum(floats[k >> 2].value, AXES[k & 3]); u[n].value = v; });
  u.uPFlags = flags; u.uPInt = ints;
  floats.forEach((f, k) => { u[`uPF${k}`] = f; });
  return u;
}

const VERT = /* glsl; i18n-ignore: the Chinese is in shader comments */`
  ${PACKED_GLSL}
  attribute vec3 iPos; attribute vec3 iSize; attribute vec3 iRot; attribute vec4 iColor; attribute vec4 iC1; attribute vec4 iC2;
  attribute vec4 iUV; attribute vec3 iVel;
  attribute vec4 vcol;
  uniform vec3 uPivot; uniform vec3 uUX;   // the scalars: PACKED_GLSL
  // (2026-11-04) the system's transform scale (uSysOn, ParticleSystem.sysScale), one uniform: its 3×3 the effect root's turn
  // (Unity frame → scene), its last column S per Unity world axis
  uniform mat4 uSys;
  #define uSysS uSys[3].xyz
  varying vec2 vUv; varying vec4 vColor; varying vec4 vC1; varying vec4 vC2;
  // local patch: vH = the board height (scene z) of the fragment — what lies under the floor is cut (FRAG uFloor; the
  // official map's opaque ground hides it by depth); vN / vVP = view-space normal / position of a mesh (the Rim shaders)
  varying float vH; varying vec3 vN; varying vec3 vVP;
  // the scene height of a view-space offset (the camera has no scale: the inverse view rotation is its transpose)
  float hOfView(vec3 off) { return (vec4(off, 0.0) * viewMatrix).z; }
  // 2026-10-14: a SkinnedMeshRenderer (THREE.SkinnedMesh: three defines USE_SKINNING and binds the bone texture)
  #include <skinning_pars_vertex>
  mat3 rotZXY(vec3 e) {  // Unity euler order: Z, then X, then Y (applied to column vectors as Ry * Rx * Rz)
    float cx = cos(e.x), sx = sin(e.x), cy = cos(e.y), sy = sin(e.y), cz = cos(e.z), sz = sin(e.z);
    mat3 rx = mat3(1., 0., 0., 0., cx, sx, 0., -sx, cx);
    mat3 ry = mat3(cy, 0., -sy, 0., 1., 0., sy, 0., cy);
    mat3 rz = mat3(cz, sz, 0., -sz, cz, 0., 0., 0., 1.);
    return ry * rx * rz;
  }
  // (2026-11-04, official engine: the geometry job's billboard dispatchers) a view-space quad offset with its camera axes
  // scaled per Unity world axis by the system's transform scale (diag(S) · the camera basis)
  vec3 sysView(vec3 off) {
    if (!uSysOn) return off;
    mat3 a = mat3(viewMatrix) * mat3(uSys);
    return a * (uSysS * (transpose(a) * off));
  }
  void fxMain() {
    vUv = iUV.xy + uv * iUV.zw; vColor = iColor * (uVCol ? vcol : vec4(1.0)); vC1 = iC1; vC2 = iC2;  // local patch: mesh vertex colours
    vN = vec3(0.0, 0.0, 1.0); vVP = vec3(0.0, 0.0, -1.0);
    // (2026-11-17, official engine: the trail job's TransformZ frame) iSize.y = 2: a TransformZ trail — iVel is the point's
    // side in the batch's frame, in its node's x-y plane, not the camera's (StripBatch.tz, stripSides)
    if (uMode == 6 && iSize.y > 1.5) {
      vec3 sp = position + iVel * iRot.x * iSize.x * 0.5;
      vH = (modelMatrix * vec4(sp, 1.0)).z;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(sp, 1.0);
      return;
    }
    if (uMode == 6) {                       // trail strip: camera-facing ribbon, iVel = tangent, iRot.x = side, iSize.x = width
      vec4 cv = modelViewMatrix * vec4(position, 1.0);
      vec3 tv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
      vec2 d = length(tv.xy) > 1e-6 ? normalize(tv.xy) : vec2(1.0, 0.0);
      // (2026-11-17, official engine: the line builder) iSize.y = 1: iRot.yz is the point's side in view space as the
      // engine makes it, a corner's mitre included (StripBatch.strip, stripSides); else the tangent's perpendicular
      vec2 so = (iSize.y > 0.5 ? iRot.yz : vec2(-d.y, d.x)) * iRot.x * iSize.x * 0.5;
      cv.xy += so;
      vH = (modelMatrix * vec4(position, 1.0)).z + hOfView(vec3(so, 0.0));
      gl_Position = projectionMatrix * cv;
      return;
    }
    if (uMode == 4) {                       // mesh particle: iRot arrives with its sign (ParticleSystem meshRotSign)
      mat3 rm = rotZXY(iRot);
      vec3 transformed = position;
      #include <skinbase_vertex>
      #include <skinning_vertex>
      // + the renderer's pivot before the turn: the official client's mesh job moves the mesh by (x, -z, y) × the particle's size,
      // in the mesh's own units, so that y runs along the mesh's z (the 重构体's crystals sit 27 × 0.12 × 0.12 = 0.39 out, their long axis outward)
      vec3 piv = vec3(uPivot.x, -uPivot.z, uPivot.y) * abs(iSize);
      vec3 p = rm * ((transformed + piv) * iSize);
      vec3 nl = rm * (normal / max(abs(iSize), vec3(1e-4)));
      // (official client: the Local mesh job) a world-space system's particles live in the root's frame, and the job's basis is
      // still the system's rotation × its scale: uSys = the node's turn in that frame (sysScale)
      if (uAlign == 5) { p = mat3(uSys) * (uSysS * p); nl = mat3(uSys) * nl; }
      else if (uAlign != 2) {
        // (official client: the mesh jobs of the other alignments) the same matrix over another basis, the system's transform
        // scale inside it: View (0) the camera's right, up and forward; World (1) the Unity world's axes; Velocity (4) z along
        // velocity + animated velocity, x = normalize(world up × z) (world x along up, z when it stands still), y = z × x.
        // vb = that basis in view space; this view space has −z ahead, so forward is −z and the Unity frame's handedness comes with it
        mat3 vb = mat3(1., 0., 0., 0., 1., 0., 0., 0., -1.);
        if (uAlign == 1) vb = mat3(viewMatrix) * mat3(uSys);
        else if (uAlign == 4) {
          mat3 m3 = mat3(modelMatrix), ru = mat3(uSys);
          float vl = dot(iVel, iVel);
          vec3 nw = vl > 1e-30 ? normalize(m3 * iVel) : ru[2];
          vec3 w = cross(ru[1], nw) * uHand;
          vec3 rt = dot(w, w) > 1e-30 ? normalize(w) : ru[0];
          vb = mat3(viewMatrix) * mat3(rt, cross(nw, rt) * uHand, nw);
        }
        vec3 off = vb * (uSysS * p);
        vH = (modelMatrix * vec4(iPos, 1.0)).z + hOfView(off);
        vec4 cv = modelViewMatrix * vec4(iPos, 1.0);
        if (uRim) { vN = vb * (rm * (normal / max(abs(iSize), vec3(1e-4)))); vVP = cv.xyz + off; }
        gl_Position = projectionMatrix * vec4(cv.xyz + off, 1.0);
        return;
      }
      vH = (modelMatrix * vec4(iPos + p, 1.0)).z;
      if (uRim) { vN = normalMatrix * nl; vVP = (modelViewMatrix * vec4(iPos + p, 1.0)).xyz; }
      gl_Position = projectionMatrix * modelViewMatrix * vec4(iPos + p, 1.0);
      return;
    }
    // quad corner, -0.5..0.5; local patch: + the renderer's pivot (m_Pivot, in particle sizes) when the instance asks for it
    // (FxInstance opts.pivot, default on): the quad's centre sits pivot x size from the particle, turned with it (elite glow bao: pivot x
    // .95 at rotation -90 deg, its gold band runs from the feet back behind the unit, official recording 2026-10-08;
    // [ASSUMED] the sign: + puts that band behind the unit as recorded, - would put it in front of the feet).
    // Stretched and mesh particles: below / above (2026-10-22)
    vec2 c = (position.xy + uPivot.xy) * iSize.xy;
    float cr = cos(-iRot.z), sr = sin(-iRot.z);
    if (uMode == 1) {                       // stretched billboard
      vec4 cv = modelViewMatrix * vec4(iPos, 1.0);
      vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
      // local patch (maintainer video 2026-10-07, 锏 S3: long thin slash lines): the length is the size's y × lengthScale, the
      // width its x (3D start size 0.15 × 3.6 drew short fat petals the other way round) — the official engine's too
      if (uFree) {
        // (2026-10-27, effect bundle X2, official engine: the freeform quad of the geometry job) freeform stretching
        // (m_FreeformStretching): the quad facing the camera's position (as Facing), turned by -rotation — and with
        // rotateWithStretchDirection (uRotW) by atan2(-d.y, -d.x) more, d its frame's part of the velocity, so its x runs
        // against the screen velocity — then drawn out by lengthScale + |v| × velocityScale along the 3D velocity; head-on it
        // keeps its plain size. No velocity (or, turning, none across the view) draws nothing, as the engine's
        vec3 f = normalize(-cv.xyz);
        vec3 rt = cross(vec3(0.0, 1.0, 0.0), f);
        rt = length(rt) > 1e-4 ? normalize(rt) : vec3(1.0, 0.0, 0.0);
        vec3 ut = cross(f, rt);
        vec2 d = vec2(dot(vv, rt), dot(vv, ut));
        float vl = dot(vv, vv);
        if (vl < 1e-30 || (uRotW && dot(d, d) < 1e-30)) { vH = 0.0; gl_Position = projectionMatrix * cv; return; }
        float a = -iRot.z + (uRotW ? atan(-d.y, -d.x) : 0.0);
        vec2 q = vec2(c.x * cos(a) - c.y * sin(a), c.x * sin(a) + c.y * cos(a));
        vec3 vh = vv * inversesqrt(vl);
        vec3 off = rt * q.x + ut * q.y;
        off += (uLengthScale + sqrt(vl) * uVelScale - 1.0) * dot(off, vh) * vh;
        vH = (modelMatrix * vec4(iPos, 1.0)).z + hOfView(off);
        gl_Position = projectionMatrix * vec4(cv.xyz + off, 1.0);
        return;
      }
      // (2026-10-27, official engine: the stretched quad of the geometry job) in 3D from the head H = particle + v̂ · pivot y ×
      // size y + across · pivot x × half the width back to the tail H − L, L = v̂ · lengthScale × size y + v · velocityScale
      // (seen head-on it shortens and thins); across = the screen part of view ray × L (zero head-on); u runs 0 at the head
      // to 1 at the tail, v across. No velocity draws nothing. The engine also takes off the camera's velocity × its
      // cameraVelocityScale — the board camera does not move. (2026-11-04) The system's transform scale: the dispatcher hands
      // lengthScale × its x (uSysS.x) and draws the width through the scaled camera basis (sysView); velocityScale and the
      // size are not scaled
      float vl = dot(vv, vv);
      vec3 vh = vl > 1e-30 ? vv * inversesqrt(vl) : vec3(0.0);
      vec3 L = vh * (uLengthScale * uSysS.x * iSize.y) + vv * uVelScale;
      vec2 a = cross(cv.xyz, L).xy;          // this view space has −z ahead: the engine's camera-space cross, negated
      vec3 W = sysView(vec3(dot(a, a) > 1e-30 ? -normalize(a) : vec2(0.0), 0.0) * (0.5 * iSize.x));
      vec3 p = cv.xyz + vh * (uPivot.y * iSize.y) + W * uPivot.x - L * (position.x + 0.5) + W * (2.0 * position.y);
      vH = (modelMatrix * vec4(iPos, 1.0)).z + hOfView(p - cv.xyz);
      gl_Position = projectionMatrix * vec4(p, 1.0);
      return;
    }
    vec2 rc = vec2(c.x * cr - c.y * sr, c.x * sr + c.y * cr);
    if (uMode == 0 && uAlign == 4) {
      // (2026-10-27, official engine: the Velocity quad of the geometry job) the quad's normal is the velocity; its x axis
      // normalize(M · (z × v̂)) with z the simulation space's (the output's x when the velocity runs along z or is zero, v̂
      // then z), its y axis normal × x — taken in the Unity frame: uHand = this scene's handedness against it, uWSign =
      // the mirror a world-space system's particles carry here and the engine's do not (FxInstance facing). A 3D rotation
      // turns the corner in that frame by -x, -y, -z in Unity's Z-X-Y order (the engine's 3D-rotation quad), so rotX 90°
      // lays the quad along the velocity: 蕾缪安 S3's mark wedges (crosshair_02 triangle *) face the camera, flying inward
      mat3 m3 = mat3(modelMatrix);
      float vl = dot(iVel, iVel);
      vec3 vh = vl > 1e-30 ? iVel * inversesqrt(vl) : vec3(0.0, 0.0, 1.0);
      vec3 nw = normalize(m3 * vh);
      vec3 w = m3 * vec3(-vh.y, vh.x, 0.0) * uWSign;
      vec3 rt = dot(w, w) > 1e-30 ? normalize(w) : uUX;
      // (2026-11-04) the system's transform scale on the turned corner, per axis of that frame (the engine's scale ⊙)
      vec3 lc = uSysS * (rotZXY(-iRot) * vec3(c, 0.0));
      vec3 wp = (modelMatrix * vec4(iPos, 1.0)).xyz + rt * lc.x + cross(nw, rt) * (uHand * lc.y) + nw * lc.z;
      vH = wp.z;
      gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      return;
    }
    if (uMode == 0 && uAlign == 6) {
      // (official client: the World basis is the identity whatever the simulation space) a local-space system's World quad: placed
      // by its node, drawn on the Unity world's axes × the system's scale, without the node's turn
      vec4 cv = modelViewMatrix * vec4(iPos, 1.0);
      vec3 off = mat3(viewMatrix) * mat3(uSys) * (vec3(rc, 0.0) * uSysS);
      vH = (modelMatrix * vec4(iPos, 1.0)).z + hOfView(off);
      gl_Position = projectionMatrix * vec4(cv.xyz + off, 1.0);
      return;
    }
    if (uMode == 2 || (uMode == 0 && (uAlign == 1 || uAlign == 2 || uAlign == 5))) {
      // horizontal billboard (Unity: in the world XZ plane) / world- or local-aligned quad (XY plane of that space). (2026-11-04)
      // An aligned quad takes the system's transform scale (the engine's diag(S) basis): a local-space system's through its
      // model matrix, a world-space one's here (sysScale leaves uSysS at 1 for the former). Local over a world-space simulation
      // (uAlign 5): the basis is the system's rotation (official client), uSys = the node's turn in the root's frame
      vec3 p = uMode == 2 ? vec3(rc.x, 0.0, rc.y) : vec3(rc, 0.0) * uSysS;
      if (uAlign == 5) p = mat3(uSys) * p;
      vH = (modelMatrix * vec4(iPos + p, 1.0)).z;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(iPos + p, 1.0);
      return;
    }
    if (uMode == 3) {
      // (2026-11-16, fx-C) vertical billboard (Unity: upright on the world's up axis, turned to face the camera — here the
      // scene's +z and the camera's right axis laid flat [추정·엔진: the camera's axis, not its position]); its corner in
      // scene units, as a camera-facing quad's. 黑键 (char_4046_ebnhlz)'s cube aura token_ebnhlz_buff, node quan
      vec3 wq = (modelMatrix * vec4(iPos, 1.0)).xyz;
      vec3 rt = vec3(viewMatrix[0][0], viewMatrix[1][0], 0.0);
      rt = dot(rt, rt) > 1e-12 ? normalize(rt) : vec3(1.0, 0.0, 0.0);
      wq += rt * rc.x + vec3(0.0, 0.0, rc.y);
      vH = wq.z;
      gl_Position = projectionMatrix * viewMatrix * vec4(wq, 1.0);
      return;
    }
    vec4 cv = modelViewMatrix * vec4(iPos, 1.0);   // camera-facing
    // (2026-10-27, effect bundle V) Facing alignment (3): the quad faces the camera's position, not its plane (Unity manual)
    // (2026-11-04) a View quad's camera axes scaled by the system's transform scale (sysView; Facing's dispatcher is not read)
    vec3 off = uMode == 0 && uAlign == 0 ? sysView(vec3(rc, 0.0)) : vec3(rc, 0.0);
    if (uMode == 0 && uAlign == 3 && length(cv.xyz) > 1e-6) {
      vec3 f = normalize(-cv.xyz);
      vec3 rt = cross(vec3(0.0, 1.0, 0.0), f);
      rt = length(rt) > 1e-4 ? normalize(rt) : vec3(1.0, 0.0, 0.0);
      off = rt * rc.x + cross(f, rt) * rc.y;
    }
    vH = (modelMatrix * vec4(iPos, 1.0)).z + hOfView(off);
    gl_Position = projectionMatrix * vec4(cv.xyz + off, 1.0);
  }
  // 2026-10-26 (client shaders ZDistort/*): the depth of the point where this vertex's view ray meets the
  // plane at board height uBaseH, the screen position unchanged — the client's vertex stage moves the world point along its
  // camera's slope (√3) to _BaselineZ and keeps it from falling below it, so the material depth-tests as if it lay on the
  // floor [추정: this camera's own ray for the client's fixed slope]
  void main() {
    fxMain();
    if (!uZFlat) return;
    vec4 vp = inverse(projectionMatrix) * gl_Position;
    vec3 v = vp.xyz / vp.w;
    float dh = (vec4(v, 0.0) * viewMatrix).z;   // the scene height the ray climbs from the camera to the point
    if (abs(dh) < 1e-6) return;
    float t = (uBaseH - cameraPosition.z) / dh;
    if (t <= 0.0) return;
    vec4 q = projectionMatrix * vec4(v * t, 1.0);
    gl_Position.z = q.z / q.w * gl_Position.w;
  }`;

const FRAG = /* glsl; i18n-ignore: the Chinese is in shader comments */`
  ${PACKED_GLSL}
  uniform sampler2D uMain; uniform vec4 uMainST; uniform vec2 uMainSpeed; uniform vec4 uTint;
  uniform sampler2D uDisturb; uniform vec4 uDisturbST; uniform vec2 uDisturbSpeed; uniform vec2 uDisturbStr;
  uniform sampler2D uDissolve; uniform vec4 uDissolveST; uniform vec2 uDissolveSpeed;
  uniform sampler2D uDissolve2; uniform vec4 uDissolve2ST;
  varying float vH; varying vec3 vN; varying vec3 vVP;
  uniform sampler2D uRam; uniform vec4 uRamST; uniform vec3 uRimCol;
  uniform vec2 uDisAnchor;
  uniform sampler2D uDisturb2; uniform vec4 uDisturb2ST; uniform vec2 uDisturb2Str; uniform vec2 uDisturb2Anchor;
  uniform sampler2D uWeight; uniform vec4 uWeightST;
  uniform sampler2D uAdd; uniform vec4 uAddST; uniform sampler2D uMask;
  uniform vec4 uRot0; uniform vec4 uRot1; uniform vec4 uRot2; uniform vec4 uRot3;   // uvRotation (the material's uRot, one uniform each)
  uniform sampler2D uDisB; uniform vec4 uDisBST; uniform vec2 uSpeedB; uniform vec4 uTintB;
  uniform sampler2D uDisC; uniform vec4 uDisCST; uniform vec2 uSpeedC; uniform vec4 uTintC; uniform vec3 uAmountV; uniform vec3 uBorderV;
  varying vec2 vUv; varying vec4 vColor; varying vec4 vC1; varying vec4 vC2;
  // 2026-10-18 (client shader): a dissolve cut — saturate((d − amount + border · (1 − roundEven(amount + .5))) / border)
  float cut(float d, float amt, float bw) { bw = max(bw, 1e-3); return clamp((d - amt + bw * (1.0 - roundEven(amt + 0.5))) / bw, 0.0, 1.0); }
  // 2026-10-14 (client shader, the _HG_UV_ROTATION branch): FxUVRotation turns a texture's tiled uv about its centre, before the scroll
  vec2 rotUV(vec2 t, vec4 r) { vec2 c = t - 0.5; return vec2(r.x * c.x + r.z * c.y, r.y * c.x + r.w * c.y) + 0.5; }
  // 2026-11-16 (client shader): a texture channel selector (_MainTexChannel / _RamTexChannel: 0 rgba, 1 r, 2 g, 3 b, else a —
  // the one channel in all four)
  vec4 chan(vec4 t, float c) { return c < 0.5 ? t : vec4(c < 1.5 ? t.r : c < 2.5 ? t.g : c < 3.5 ? t.b : t.a); }
  void main() {
    if (vH < uFloor) discard;   // local patch: under the floor (FxInstance opts.floor)
    vec2 dis = vec2(0.0);
    vec2 uv;
    if (uDisMode == 0) {
      uv = vUv * uMainST.xy + uMainST.zw;
      // custom data (Torappu (CustomData) shaders, streams Custom1XYZW + Custom2XYZW): custom1.xy = main uv offset,
      // custom1.zw = extra distortion, custom2.x = dissolve amount — [ASSUMED] from the curves, tuned by eye
      if (uCustom) uv += vC1.xy;
      if (uUVRot) uv = rotUV(uv, uRot0);
      // 2026-10-22 (client shader): every family scrolls by the fraction of speed × time (frc) — the same on a repeating
      // texture, not on a Clamp one (tex/wrap.json); Dissolve AB / Add UVTween wraps the whole scrolled uv (uFracUV)
      uv += fract(uMainSpeed * uTime);
      if (uHasDisturb) {
        vec2 duv = vUv * uDisturbST.xy + uDisturbST.zw;
        if (uUVRot) duv = rotUV(duv, uRot3);
        duv += fract(uDisturbSpeed * uTime);
        // local patch (client shader): the noise's red channel times the strength, not centred
        vec2 n = vec2(texture2D(uDisturb, duv).r);
        dis = n * (uDisturbStr + (uCustom ? vC1.zw : vec2(0.0)));
        uv += dis * uDisturbMain;
      }
      if (uFracUV) uv = fract(uv);
    } else {
      // 2026-10-14 (client shader): Disturb Origin (1) / Disturb Anchor (2) — the noise (.r − _Anchor, × the _WEIGHT_ON weight
      // texture's rg; Anchor's second noise when _ToggleUseDisturb2) × _Intensity moves the renderer's own uv before the
      // main texture's tiling / offset; Anchor scrolls the main uv by _UVTween.xy and the noise uv by .zw (uMainSpeed /
      // uDisturbSpeed)
      if (uHasDisturb) {
        vec2 n = vec2(texture2D(uDisturb, vUv * uDisturbST.xy + uDisturbST.zw + fract(uDisturbSpeed * uTime)).r) - uDisAnchor;
        vec2 n2 = uHasDisturb2 ? vec2(texture2D(uDisturb2, vUv * uDisturb2ST.xy + uDisturb2ST.zw).r) - uDisturb2Anchor : vec2(0.0);
        if (uHasWeight) { vec2 w = texture2D(uWeight, vUv * uWeightST.xy + uWeightST.zw).rg; n *= w; n2 *= w; }
        dis = n * uDisturbStr + n2 * uDisturb2Str;
      }
      uv = (vUv + dis) * uMainST.xy + uMainST.zw + fract(uMainSpeed * uTime);
    }
    vec4 tex = chan(texture2D(uMain, uv), uMainChan);
    // 2026-10-14 (client shader): Mask (AlphaBlend) — main + 2 · _AddFactor · _AddTex(own uv) · _MaskTex.a(main uv)
    if (uHasAdd) tex += 2.0 * uAddFactor * texture2D(uAdd, vUv * uAddST.xy + uAddST.zw) * texture2D(uMask, uv).a;
    vec4 col = tex * uTint * vColor;
    if (uPremul) col *= vColor.a;   // 2026-10-22: Legacy Particles/Alpha Blended Premultiply (Unity's Default-Particle)
    // 2026-10-14 (client shader): Disturb Origin multiplies by _MainColor.a once more, Anchor by lerp(1, _MainColor.a,
    // _MainColorACtrl) (uTint carries the ×2)
    if (uACtrl != 0.0) col *= 1.0 + uACtrl * (uTint.a * 0.5 - 1.0);
    // local patch (maintainer report 2026-10-07, 赤刃明霄陈 S3's range too bright): the Ram family multiplies by _RamTex sampled at
    // the renderer's own uv through its tiling / offset — all of rgba (the client's shader: Ram/Disturb(CustomData),
    // Ram/Add, Ram/AlphaBlend) — not a ramp looked up by the dissolve edge as assumed before
    if (uHasRam) { vec2 ruv = vUv * uRamST.xy + uRamST.zw; if (uUVRot) ruv = rotUV(ruv, uRot2); col *= chan(texture2D(uRam, ruv), uRamChan); }
    // dissolve: the shaders declare no edge colour, so _BorderWidth is the softness of the cut [ASSUMED]
    float e = 1.0;
    if (uHasDissolve) {
      vec2 suv = vUv * uDissolveST.xy + uDissolveST.zw;
      if (uUVRot) suv = rotUV(suv, uRot1);
      suv = uDisMode == 0 ? suv + fract(uDissolveSpeed * uTime) + dis * uDisturbDissolve
        : (vUv + dis) * uDissolveST.xy + uDissolveST.zw;   // Anchor: the moved uv through _DissolveTex_ST (client shader)
      if (uFracUV) suv = fract(suv);
      // 2026-11-01 (client shader): Ram/Disturb(CustomData) picks the dissolve texture's channel by _DissolvTexChannel
      // (0 r, 1 g, 2 b, else a — uDisChan; 冻河's hits keep 3)
      vec4 dt = texture2D(uDissolve, suv);
      float d = uDisChan < 0.5 ? dt.r : uDisChan < 1.5 ? dt.g : uDisChan < 2.5 ? dt.b : dt.a;
      // local patch (client shader): saturate((d − amount + border · (1 − roundEven(amount + .5))) / border) — at amount 0
      // the border is added, so nothing is cut (the dark texels were holes before)
      float amt = uAmount + (uCustom ? vC2.x : 0.0);
      float bw = max(uBorder, 1e-3);
      e = clamp((d - amt + bw * (1.0 - roundEven(amt + 0.5))) / bw, 0.0, 1.0);
      // … (VertexColor Major): amount = 1 − vertex alpha, alpha = cut · texture alpha · tint alpha (vertex alpha not multiplied),
      // colour = 2 · texture · vertex colour
      if (uVCMajor) { e = clamp((d - (1.0 - vColor.a) + vColor.a * bw) / bw, 0.0, 1.0); col.a = tex.a * uTint.a * 0.5; col.rgb = tex.rgb * 2.0 * vColor.rgb; } // (no tint rgb)
      col.a *= e;
      // local patch: the … Double family cuts by a second texture with its own amount / border too [ASSUMED: alpha × both]
      if (uHasDissolve2) {
        float d2 = texture2D(uDissolve2, vUv * uDissolve2ST.xy + uDissolve2ST.zw + fract(uDissolveSpeed * uTime) + dis * uDisturbDissolve).r;
        // 2026-10-14 (client shader): the second cut adds its border like the first
        float bw2 = max(uBorder2, 1e-3);
        col.a *= clamp((d2 - uAmount2 + bw2 * (1.0 - roundEven(uAmount2 + 0.5))) / bw2, 0.0, 1.0);
      }
      // 2026-10-18 (client shader, Optimize/Dissolve AB MultiTex _DISSOLVE_TWO / _THREE): the main colour (2 · texture · vertex)
      // tinted again by _TintColorB (C), each cut by its own dissolve texture (_DissolveTexB / C, _Amount / _BorderWidth .y / .z,
      // scrolled by _TexSpeed2 .xy / .zw), layered: lerp(first, B, B's alpha), then + C × C's alpha (all four channels)
      if (uMulti >= 2) {
        vec4 base = tex * vColor;
        vec4 cb = base * uTintB;
        cb.a = clamp(cb.a * cut(texture2D(uDisB, vUv * uDisBST.xy + uDisBST.zw + fract(uSpeedB * uTime)).r, uAmountV.y, uBorderV.y), 0.0, 1.0);
        col = mix(col, cb, cb.a);
        if (uMulti >= 3) {
          vec4 cc = base * uTintC;
          cc.a = clamp(cc.a * cut(texture2D(uDisC, vUv * uDisCST.xy + uDisCST.zw + fract(uSpeedC * uTime)).r, uAmountV.z, uBorderV.z), 0.0, 1.0);
          col += cc * cc.a;
        }
      }
    }
    // local patch: Torappu/Particles/Rim — opaque at the silhouette, clear facing the camera [ASSUMED: alpha × (1 − |N·V|)^power]
    // (client shader, 2026-10-07: the rim term scales the colour as well as the alpha)
    // 2026-11-16 (client shader): AlphaBlend(ZWrite) with _UseRim > 0 adds _RimCol.rgb × (1 − saturate(N·V))^_RimPower to the
    // colour (not the alpha) — N·V not folded, so a face turned away from the camera takes the whole rim colour (uRimAdd)
    if (uRim && uRimAdd) col.rgb += uRimCol * pow(1.0 - clamp(dot(normalize(vN), normalize(-vVP)), 0.0, 1.0), uRimPower);
    else if (uRim) { float rim = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(-vVP))), 0.0, 1.0), uRimPower); col *= rim; }
    col.a *= uOpacity;
    if (col.a < 0.002) discard;
    // 2026-11-01 (client shader, the CN client since its 10-23 update): with _PremultiplyAlpha One the pass blends
    // One OneMinusSrcAlpha and the colour leaves as 2 · alpha · colour (renderState src, uPremulX2)
    if (uPremulX2) col.rgb *= 2.0 * col.a;
    gl_FragColor = col;
  }`;

/**
 * 2026-10-22 (the client's shader pass states, `[uc]shaders.ab` m_ParsedForm, every Torappu particle shader): which pass
 * reads its culling, depth write and source blend factor from the material, and the fixed state of the others.
 * Culling (Unity CullMode 0 Off, 1 Front, 2 Back): `_CullMode` for the Disturb family (not the GrabPass ones), the (CustomData)
 * family, AlphaBlend(ZWrite), Common and Dissolve Double; Back for Rim, Flipbook, MatCap, Toon / Outline, Dissolve Cutout;
 * Off for the rest (Additive, AlphaBlend, Dissolve, Mask … — their `_CullMode` is a value left from another shader).
 * Depth write: `_ZWrite` for AlphaBlend(ZWrite) / Common / Cutout, off elsewhere (Disturb Origin / Anchor carry a `_ZWrite`
 * 1 no pass reads). Source factor: `_SrcBlend` for Disturb Origin / Anchor / Cutout, SrcAlpha elsewhere (One for the
 * Premultiply legacy shader). 2026-11-01: the CN client's AlphaBlend, Ram/Disturb(CustomData) (and its Particles-L2D copy) and
 * Ram/VertexDisturb(CustomData) since its 10-23 update read it from `_PremultiplyAlpha` (default 5 SrcAlpha; 1 One — then the
 * pixel stage premultiplies, FRAG uPremulX2); the EN client's are fixed SrcAlpha and its materials carry 5 or nothing.
 */
const CULL_READ = /^(?!.*GrabPass).*(Disturb|\(CustomData)|AlphaBlend\(ZWrite\)|\/Particles\/Common$|^Torappu\/Particles\/Dissolve\/Dissolve Double$/;
const CULL_BACK = /\/Rim\/|Flipbook|MatCap|Poker-Reflect|\/3D\/Toon|Unlit-Outline|Dissolve Cutout/;
const ZWRITE_READ = /AlphaBlend\(ZWrite\)|\/Particles\/(Common|Cutout)$/;
const SRC_READ = /\/Disturb\/Disturb (Origin|Anchor)$|\/Particles\/Cutout$/;
const PREMUL_READ = /^Torappu\/Particles(-L2D)?\/(AlphaBlend|Ram\/(Vertex)?Disturb\(CustomData\))$/;
// 2026-11-16 (client shaders, both clients): the shaders declaring `_MainTexChannel` — all select it the same way (FRAG chan);
// `_RamTexChannel` only the Ram/Disturb(CustomData) pair. ZDistort's copies have no selector (makeMaterial)
const MAIN_CHAN_READ = /^Torappu\/Particles(-L2D)?\/(Additive|AlphaBlend|Dissolve\/Dissolve\(CustomData\)|(Ram|Disturb)\/Disturb\(CustomData\))$/;
const RAM_CHAN_READ = /^Torappu\/Particles(-L2D)?\/Ram\/Disturb\(CustomData\)$/;
/**
 * 2026-11-16 (client shader): AlphaBlend(ZWrite)'s rim — `_UseRim` > 0 (the pixel stage's own test).
 * @type {(shader: string, f: Record<string, number>) => boolean}
 */
const rimAdd = (shader, f) => /^Torappu\/Particles\/AlphaBlend\(ZWrite\)$/.test(shader) && (f._UseRim ?? 0) > 0;
/**
 * Whether a material on mesh geometry needs the mesh's normals (a Rim shader, AlphaBlend(ZWrite)'s rim): useMeshAttrs, PROGRAM_VARIANTS.
 * @type {(shader: string, f?: Record<string, number>) => boolean}
 */
export const meshNormals = (shader, f = {}) => /\/Rim\//.test(shader) || rimAdd(shader, f);
/**
 * The pass premultiplies: `_PremultiplyAlpha` One (below 1.5, the pixel stage's own test) where the pass reads it.
 * @type {(shader: string, f: Record<string, number>) => boolean}
 */
const premulX2 = (shader, f) => PREMUL_READ.test(shader) && (f._PremultiplyAlpha ?? 5) < 1.5;
/**
 * three.js side for a Unity CullMode on mesh geometry (the Unity frame's z flip turns three's winding with it).
 * @type {Readonly<Record<number, number>>}
 */
const SIDE = { 0: THREE.DoubleSide, 1: THREE.BackSide, 2: THREE.FrontSide };
/**
 * @param {string} shader
 * @param {Record<string, number>} [f]
 */
export function renderState(shader, f = {}) {
  return {
    cull: CULL_READ.test(shader) ? f._CullMode ?? 0 : CULL_BACK.test(shader) ? 2 : 0,
    zwrite: ZWRITE_READ.test(shader) && (f._ZWrite ?? 0) !== 0,
    src: SRC_READ.test(shader) ? f._SrcBlend ?? 5 : /Alpha Blended Premultiply/.test(shader) || premulX2(shader, f) ? 1 : 5,
  };
}

const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE.needsUpdate = true;

/**
 * @param {MatRec | null | undefined} m
 * @param {FxLibrary | null} lib
 * @returns {THREE.ShaderMaterial}
 */
function makeMaterial(m, lib) {
  const f = m?.floats || {}, c = m?.colors || {}, t = m?.tex || {};
  const shader = String(m?.shader || '');
  /** @type {(k: string) => THREE.Texture | null | undefined} */
  const tex = (k) => (t[k] ? /** @type {FxLibrary} */ (lib).texture(t[k].img) : null);
  /** @type {(k: string) => THREE.Vector4} */
  const st = (k) => (t[k] ? new THREE.Vector4(t[k].tiling[0], t[k].tiling[1], t[k].offset[0], t[k].offset[1]) : new THREE.Vector4(1, 1, 0, 0));
  // the Torappu particle shaders' neutral colour is 0.5 (shader property defaults): colour = 2 · tint · vertex · texture
  // 2026-10-22: Unity's Default-Particle (Legacy Particles/Alpha Blended Premultiply) has no tint: vertex colour × texture × vertex alpha
  const premul = /Alpha Blended Premultiply/.test(shader);
  // 2026-11-16: Unity's Particles/Standard Unlit (유키 마코토's S1 heal, its Fade mode: `_Mode` 2, `_ALPHABLEND_ON`) is
  // `_Color` × vertex colour × texture, no ×2; its pass blends by `_SrcBlend` / `_DstBlend` (the `additive` rule below)
  const stdUnlit = shader === 'Particles/Standard Unlit';
  const tint = premul ? [1, 1, 1, 1] : stdUnlit ? (c._Color || [1, 1, 1, 1]) : /CustomData|Disturb|Ram/.test(shader) ? (c._MainColor || [0.5, 0.5, 0.5, 0.5]) : (c._TintColor || c._MainColor || c._Color || [0.5, 0.5, 0.5, 0.5]);
  const tintMul = /Rim Tint/.test(shader) || premul || stdUnlit ? 1 : 2; // local patch (client shader): Rim Tint has no ×2 (Rim Texture, Additive … do)
  // blend: Additive / Dissolve Add = SrcAlpha One, AlphaBlend / … AB = SrcAlpha OneMinusSrcAlpha, the (CustomData) family
  // reads its `_DstBlend` enum (Add 1 / AlphaBlend 10). Materials also carry _SrcBlend/_DstBlend left over from Unity's
  // Standard shader: never read for the fixed families
  // 2026-10-22: the legacy Alpha Blended (Premultiply) shaders blend over by name too (`_DstBlend` 0 is a value left on them);
  // a `_DstBlend` 0 where the pass reads it (Disturb Origin, 2 of Gnosis's stones: One Zero) draws opaque
  let additive;
  if (/AlphaBlend|\bAB\b|Alpha Blended/.test(shader)) additive = false;
  else if (/Additive|Add\b|Add /.test(shader)) additive = true;
  else additive = (f._DstBlend ?? 1) === 1;
  const rs = renderState(shader, f);
  // 2026-10-26 (client shader): ZDistort/Disturb(CustomData) draws as Ram/Disturb(CustomData) with every channel selector at
  // its default (main and _RamTex rgba, noise and dissolve .r — the same constant slots), the name rules above and below
  // giving it that; its vertex stage only changes the depth (uZFlat). ZDistort/Additive, /AlphaBlend and
  // /Dissolve(CustomData) are likewise Particles/Additive, /AlphaBlend and Dissolve/Dissolve(CustomData) without their
  // channel selectors (main rgba, dissolve .r), with the same pass states and the same vertex stage
  const zflat = /\/ZDistort\//.test(shader);
  const opaque =!additive && f._DstBlend === 0 && SRC_READ.test(shader);
  const src = rs.src, dst = additive ? 1 : opaque ? 0 : 10;
  // 2026-10-14: Disturb Origin / Anchor name their noise _DisturTex (it was never read: no distortion, no flow)
  const disKey = t._DisturbTex ? '_DisturbTex' : t._NoiseTex ? '_NoiseTex' : '_DisturTex';
  const disturb = tex(disKey);
  const disMode = /Disturb Origin/.test(shader) ? 1 : /Disturb Anchor/.test(shader) ? 2 : 0;
  // 2026-10-14 (client shader): Disturb Anchor and Dissolve AB / Add UVTween scroll by _UVTween × _Time.y — main uv by .xy, the
  // noise (Anchor) or dissolve (UVTween) uv by .zw. No other particle shader declares it (nor _Speed / _FlowStrength, which
  // only Flipbook / GrabPass shaders read and no extracted material uses): there they are values left from another shader
  const tween = disMode === 2 || /UVTween/.test(shader);
  const uvTween = tween && Array.isArray(c._UVTween) ? c._UVTween : [0, 0, 0, 0];
  // 2026-10-14 (client shader): Mask (AlphaBlend) adds _AddTex (its own uv through _AddTex_ST, which its clips scroll) × the
  // _MaskTex alpha × _AddFactor × 2 to the main texture [ASSUMED: which sampler is which — the second uv's _ST is the one the
  // clips move]
  const add = /\/Mask\//.test(shader) ? tex('_AddTex') : null;
  // 2026-10-14 (client shader properties): only the (CustomData) family declares _Main / _Dissolve / _DisturbU·VSpeed —
  // Additive, AlphaBlend, the Dissolve and Disturb Origin / Anchor materials carry them left from another shader (they scrolled before)
  /** @type {(v: number | undefined) => number} */
  const sp = (v) => (/CustomData/.test(shader) && v) || 0;
  const disturb2 = disMode === 2 && (f._ToggleUseDisturb2 || 0) > 0 ? tex('_DisturTex_02') : null;
  const weight = disMode === 2 && (m?.keywords || []).includes('_WEIGHT_ON') ? tex('_WeightTex') : null;
  // local patch: the … Double family dissolves by _DissolveTex_01 / _02, each with its own _Amount_0N / _BorderWidth_0N (its
  // clips animate those; the materials' plain _Amount / _BorderWidth are left over from another shader)
  const double = !t._DissolveTex && !!t._DissolveTex_01;
  const dissolve = double ? tex('_DissolveTex_01') : tex('_DissolveTex');
  const dissolve2 = double ? tex('_DissolveTex_02') : null;
  const toggles = /Disturb Anchor/.test(shader), useTex = /Dissolve\(CustomData\)/.test(shader); // local patch
  // 2026-10-18 (client shader): Optimize/Dissolve AB MultiTex (战场#06's screen_desert_*) — `_Dissolve` picks the
  // _DISSOLVE_ONE / _TWO / _THREE variant (its KeywordEnum order: the four materials keep _DISSOLVE_THREE with 2); `_Amount` /
  // `_BorderWidth` are vectors (x, y, z per dissolve texture); `_TexSpeed` scrolls the main uv (.xy) and the first dissolve
  // (.zw), `_TexSpeed2` the second (.xy) and third (.zw), by 2 · _Time.y (the constant slots by name: the variants'
  // parameter tables); `_MainTexSpeed` is declared but read by no variant
  const multi = /Dissolve AB MultiTex/.test(shader) ? Math.min(3, Math.max(1, Math.round(f._Dissolve ?? 0) + 1)) : 0;
  /** @type {(a: unknown, i: number) => number} */
  const vec = (a, i) => (Array.isArray(a) ? +a[i] || 0 : 0);
  /** @type {(a: unknown) => THREE.Vector4} */
  const tintOf = (a) => (Array.isArray(a) ? new THREE.Vector4(a[0] * 2, a[1] * 2, a[2] * 2, a[3] * 2) : new THREE.Vector4(1, 1, 1, 1));
  const rot = [0, 1, 2, 3].map(() => new THREE.Vector4(1, 0, 0, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: rs.zwrite, depthTest: false,
    side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: BLEND[src], blendDst: BLEND[dst],
    // local patch (maintainer 2026-10-07: black squares on 비르투오사's hit, 望's link): the alpha channel of a see-through canvas
    // (render/fxgame.js, premultiplied) — additive light never covers what is under it (a texture without alpha has a black
    // background: it added to the alpha before and composited as a black square), alpha blend is the premultiplied "over"
    blendSrcAlpha: additive ? THREE.ZeroFactor : THREE.OneFactor, blendDstAlpha: additive ? THREE.OneFactor : opaque ? THREE.ZeroFactor : THREE.OneMinusSrcAlphaFactor,
    uniforms: packUniforms({
      uMain: { value: tex('_MainTex') || WHITE }, uMainST: { value: st('_MainTex') },
      uMainSpeed: { value: multi ? new THREE.Vector2(2 * vec(c._TexSpeed, 0), 2 * vec(c._TexSpeed, 1)) : tween ? new THREE.Vector2(uvTween[0], uvTween[1]) : new THREE.Vector2(sp(f._MainUSpeed), sp(f._MainVSpeed)) },
      uFracUV: { value: disMode === 0 && tween }, // 2026-10-22 (client shader): Dissolve AB / Add UVTween — frac(uv + _UVTween × t)
      uHasAdd: { value: !!add }, uAdd: { value: add || WHITE }, uAddST: { value: st('_AddTex') },
      uMask: { value: tex('_MaskTex') || WHITE }, uAddFactor: { value: f._AddFactor ?? 1 },
      uTint: { value: new THREE.Vector4(tint[0] * tintMul, tint[1] * tintMul, tint[2] * tintMul, tint[3] * tintMul) },
      uOpacity: { value: f._Opacity ?? 1 },
      // local patch (client shader, 2026-10-07): only Disturb Anchor declares the _ToggleUse* switches (and Dissolve(CustomData)
      // _UseDissolveTex) — elsewhere they are values left over from another shader, and dissolve / disturb always run
      // 2026-10-14 (client shader): Anchor's first noise always runs; _ToggleUseDisturb2 switches its second one (uHasDisturb2)
      uHasDisturb: { value: !!disturb }, uDisturb: { value: disturb || WHITE },
      uDisturbST: { value: st(disKey) },
      uDisturbSpeed: { value: disMode === 2 ? new THREE.Vector2(uvTween[2], uvTween[3]) : new THREE.Vector2(sp(f._DisturbUSpeed), sp(f._DisturbVSpeed)) },
      uDisMode: { value: disMode }, uDisAnchor: { value: new THREE.Vector2(disMode === 2 ? f._AnchorU || 0 : 0, disMode === 2 ? f._AnchorV || 0 : 0) },
      uACtrl: { value: disMode === 1 ? 1 : disMode === 2 ? f._MainColorACtrl || 0 : 0 },
      uHasDisturb2: { value: !!disturb2 }, uDisturb2: { value: disturb2 || WHITE }, uDisturb2ST: { value: st('_DisturTex_02') },
      uDisturb2Str: { value: new THREE.Vector2(f._IntensityU_02 || 0, f._IntensityV_02 || 0) },
      uDisturb2Anchor: { value: new THREE.Vector2(f._AnchorU_02 || 0, f._AnchorV_02 || 0) },
      uHasWeight: { value: !!weight }, uWeight: { value: weight || WHITE }, uWeightST: { value: st('_WeightTex') },
      uDisturbStr: { value: new THREE.Vector2(f._IntensityU || 0, f._IntensityV || 0) },
      uDisturbMain: { value: f._DisturbInfluenceMainUV ?? 1 }, uDisturbDissolve: { value: f._DisturbInfluenceDissolveUV ?? 0 },
      uHasDissolve: { value: !!dissolve && (toggles ? (f._ToggleUseDissolve ?? 1) !== 0 : useTex ? (f._UseDissolveTex ?? 1) !== 0 : true) }, uDissolve: { value: dissolve || WHITE },
      uDissolveST: { value: st(double ? '_DissolveTex_01' : '_DissolveTex') },
      uDissolveSpeed: { value: multi ? new THREE.Vector2(2 * vec(c._TexSpeed, 2), 2 * vec(c._TexSpeed, 3)) : disMode === 0 && tween ? new THREE.Vector2(uvTween[2], uvTween[3]) : new THREE.Vector2(sp(f._DissolveUSpeed), sp(f._DissolveVSpeed)) },
      // local patch (client shader): Dissolve(CustomData)'s amount is _DissolveIntensity (no _Amount), … (VertexColor Major) has none:
      // its vertex alpha is the amount (uVCMajor)
      uAmount: { value: multi ? vec(c._Amount, 0) : (double ? f._Amount_01 : useTex ? f._DissolveIntensity : f._Amount) || 0 }, uVCMajor: { value: /VertexColor Major/.test(shader) },
      uBorder: { value: multi ? vec(c._BorderWidth, 0) : (double ? f._BorderWidth_01 : f._BorderWidth) || 0 },
      uMulti: { value: multi }, uDisB: { value: tex('_DissolveTexB') || WHITE }, uDisBST: { value: st('_DissolveTexB') },
      uDisC: { value: tex('_DissolveTexC') || WHITE }, uDisCST: { value: st('_DissolveTexC') },
      uSpeedB: { value: new THREE.Vector2(2 * vec(c._TexSpeed2, 0), 2 * vec(c._TexSpeed2, 1)) }, uSpeedC: { value: new THREE.Vector2(2 * vec(c._TexSpeed2, 2), 2 * vec(c._TexSpeed2, 3)) },
      uTintB: { value: tintOf(c._TintColorB) }, uTintC: { value: tintOf(c._TintColorC) },
      uAmountV: { value: new THREE.Vector3(vec(c._Amount, 0), vec(c._Amount, 1), vec(c._Amount, 2)) },
      uBorderV: { value: new THREE.Vector3(vec(c._BorderWidth, 0), vec(c._BorderWidth, 1), vec(c._BorderWidth, 2)) },
      uHasDissolve2: { value: !!dissolve2 }, uDissolve2: { value: dissolve2 || WHITE }, uDissolve2ST: { value: st('_DissolveTex_02') },
      uAmount2: { value: f._Amount_02 || 0 }, uBorder2: { value: f._BorderWidth_02 || 0 },
      // local patch: vertex colours / Rim — turned on by the geometry's owner (useMeshAttrs); the floor (FxInstance opts.floor)
      uVCol: { value: false }, uRim: { value: false }, uRimPower: { value: f._RimPower ?? (rimAdd(shader, f) ? 3 : 1) }, uFloor: { value: -1e9 }, uPremul: { value: premul },
      uRimAdd: { value: rimAdd(shader, f) }, uRimCol: { value: new THREE.Vector3(...(c._RimCol || [1, 1, 1]).slice(0, 3)) },
      uPremulX2: { value: premulX2(shader, f) }, uDisChan: { value: /\/Ram\/Disturb\(CustomData\)$/.test(shader) ? f._DissolvTexChannel ?? 0 : 0 },
      uMainChan: { value: MAIN_CHAN_READ.test(shader) ? f._MainTexChannel ?? 0 : 0 }, uRamChan: { value: RAM_CHAN_READ.test(shader) ? f._RamTexChannel ?? 0 : 0 },
      // 2026-10-26: ZDistort's floor depth (VERT main), + the effect's floor (FxInstance)
      uZFlat: { value: zflat }, uBaseH: { value: -(f._BaselineZ || 0) },
      uHasRam: { value: !!t._RamTex }, uRam: { value: tex('_RamTex') || WHITE }, uRamST: { value: st('_RamTex') },
      uCustom: { value: (f._HGCustomVertexStream ?? (/CustomData/.test(shader) ? 1 : 0)) !== 0 },
      uTime: { value: 0 }, uAdditive: { value: additive },
      uUVRot: { value: false }, uRot: { value: rot },   // uvRotation
      uRot0: { value: rot[0] }, uRot1: { value: rot[1] }, uRot2: { value: rot[2] }, uRot3: { value: rot[3] },
      uMode: { value: 0 }, uLengthScale: { value: 2 }, uVelScale: { value: 0 }, uAlign: { value: 0 }, uPivot: { value: new THREE.Vector3() },
      uFree: { value: false }, uRotW: { value: false }, uUX: { value: new THREE.Vector3(1, 0, 0) }, uHand: { value: -1 }, uWSign: { value: 1 },
      uSysOn: { value: false }, uSys: { value: new THREE.Matrix4().setPosition(1, 1, 1) },   // S = 1 until sysScale
    }),
  });
  mat.fxTime = mat.uniforms[TIME_VEC].value;   // setTime
  mat.userData.order = m?.queue ?? 3000;
  mat.userData.uvRot = /Disturb\(CustomData/.test(shader);   // the shaders with the _HG_UV_ROTATION branch (uvRotation)
  mat.userData.rim = meshNormals(shader, f);
  // 2026-10-22: the pass's culling — set on mesh geometry only (meshSide): a billboard, trail or line is built facing the
  // camera, as Unity builds them, so Back culls nothing there and the player keeps both sides
  mat.userData.cull = rs.cull;
  // local patch: whether the material tests depth (`_ZTest` 4 LessEqual …; 0 Disabled / 8 Always do not) — the floor cut
  // applies only to those: the client's map hides what they draw under the ground by depth [ASSUMED: 0 = Disabled is used]
  mat.userData.ztest = !(f._ZTest === 0 || f._ZTest === 8);
  // its depth never lies under its floor: no floor cut (FxInstance). The plane: client z grows downward, so _BaselineZ is minus
  // a height — above the effect's own floor here (the tile top it stands on: a fixed plane at the low ground would hide a
  // high-ground operator's buff behind her own tile in this board's occluders) [추정: every extracted material has 0]
  mat.userData.zflat = zflat;
  mat.userData.baseH = -(f._BaselineZ || 0);
  // local patch (maintainer report 2026-10-08): … and against the map's raised tiles / crates (render/fxgame.js occluders —
  // the only depth in an effect canvas: every effect renderer writes none, as before)
  mat.depthTest = mat.userData.ztest;
  return mat;
}

/**
 * 2026-10-22: a material drawn on mesh geometry (a MeshRenderer / skinned mesh, a mesh particle) takes its pass's culling.
 * @param {THREE.ShaderMaterial} mat
 */
function meshSide(mat) {
  mat.side = SIDE[mat.userData.cull] ?? THREE.DoubleSide;
  return mat;
}

/**
 * 2026-10-27: the shader program variants the extracted effects use — three.js keys a program by the material's side
 * (meshSide: its pass's `cull`), a skinned mesh and a geometry with normals (useMeshAttrs: a Rim material on a mesh). Of
 * the 12 combinations only these occur (test/render/fx-program-variants.test.js walks every extracted prefab): the
 * double-sided quad (billboards, trails, lines; first, ensure links it), a one-sided mesh either way, a double-sided
 * skinned mesh, a Rim mesh culling its back and (2026-11-16, 国度's range spheres) a double-sided mesh with
 * AlphaBlend(ZWrite)'s rim.
 */
export const PROGRAM_VARIANTS = [{ cull: 0 }, { cull: 2 }, { cull: 1 }, { cull: 0, skin: true }, { cull: 2, normals: true }, { cull: 0, normals: true }];

/** One scene per PROGRAM_VARIANTS entry, for a renderer to compile before the effects; their materials are never disposed (fxgame.js ensure / prewarm, keepPrograms). */
export function programVariants() {
  return PROGRAM_VARIANTS.map(({ cull, skin, normals }) => {
    let geo = QUAD;
    if (normals) { geo = QUAD.clone(); geo.computeVertexNormals(); }
    const mat = makeMaterial(null, null);
    mat.side = SIDE[cull];
    const scene = new THREE.Scene();
    if (!skin) { scene.add(new THREE.Mesh(geo, mat)); return scene; }
    const bone = new THREE.Bone();
    const skinned = new THREE.SkinnedMesh(geo, mat);
    skinned.add(bone);
    skinned.bind(new THREE.Skeleton([bone]));
    scene.add(skinned);
    return scene;
  });
}

/**
 * 2026-10-14: the uniform holding a texture's tiling / offset, by the material's texture name.
 * @type {Readonly<Record<string, string>>}
 */
const TEX_ST = { _MainTex: 'uMainST', _AddTex: 'uAddST', _DisturbTex: 'uDisturbST', _NoiseTex: 'uDisturbST', _DisturTex: 'uDisturbST', _DisturTex_02: 'uDisturb2ST',
  _DissolveTex: 'uDissolveST', _DissolveTex_01: 'uDissolveST', _DissolveTex_02: 'uDissolve2ST', _RamTex: 'uRamST', _WeightTex: 'uWeightST' };

/**
 * 2026-10-14 (client Torappu.Fx.FxUVTweener / FxUVTweenerAdvance, `Update`): a renderer's
 * script that moves its material's texture offsets — each named texture's offset grows by 2 × speed per second (SPEED_SCALE
 * 2), from the material's own offset with `keepInitOffset`, else from 0 (`OnEnable`), until `tweenAnmTime` for an Advance
 * without `tweenRepeat` (fx_extract.py `uvt`). The fractional wrap of `protect*UV` / `tweenRepeat` (the map's 4th field,
 * 2026-10-22) matters on a Clamp texture (tex/wrap.json). Kept on `mat.userData.uvt`, moved by setTime; a texture a clip track drives is left to the clip
 * (bindTrack0 — the Animator's property block wins over the material).
 * 2026-10-27 (official client, effect bundle W2d): with `useSharedMaterial` (uvt `shared`) `Awake` swaps the renderer's material
 * for MaterialManager.GetMaterial(it, 'FX_UV_TWEENER') — one copy per source material and key, made once — and `Update`
 * moves that copy: every renderer of it shows the offsets the last tweener wrote that frame, and one starting with
 * `keepInitOffset` starts from them. Here those renderers hold one tiling / offset vector per material (uvShared), which
 * each instance writes as it steps — the newest last [추정·엔진: Unity's Update order of the tweeners].
 */
const UV_SHARED = new Map();   // `${material key} ${uniform}` → its shared Vector4
/**
 * @param {Uniform} u
 * @param {string} key
 * @param {string} uname
 */
function uvShared(u, key, uname) {
  const k = `${key} ${uname}`;
  let v = UV_SHARED.get(k);
  if (!v) UV_SHARED.set(k, (v = u.value.clone()));
  u.value = v;
}
/**
 * @param {THREE.ShaderMaterial | null | undefined} mat
 * @param {UvTweenRec | null | undefined} uvt
 * @param {MatRec | null | undefined} m
 * @param {string | null} [key]
 */
function uvTween(mat, uvt, m, key = null) {
  if (!mat || !uvt || !Array.isArray(uvt.maps)) return;
  /** @type {UvTweenMap[]} */
  const list = [];
  for (const [name, vx, vy, fr] of uvt.maps) {
    const u = TEX_ST[name] && m?.tex?.[name] ? mat.uniforms[TEX_ST[name]] : null;
    if (!u || list.some((e) => e.u === u)) continue;
    if (uvt.shared && key) uvShared(u, key, TEX_ST[name]);
    list.push({ u, z0: uvt.keep ? u.value.z : 0, w0: uvt.keep ? u.value.w : 0, vx: +vx || 0, vy: +vy || 0, until: /** @type {number} */ (uvt.until) > 0 ? /** @type {number} */ (uvt.until) : Infinity, frac: fr === 1 });
  }
  if (list.length) mat.userData.uvt = list;
}

/**
 * (2026-10-14, official client and its shader) a node's FxUVRotation (fx_extract.py `uvr`: 4 angles in degrees, 0 = off): it switches the
 * shader's _HG_UV_ROTATION branch (a float the official script writes as 1 every frame, not a keyword; 2026-10-26) — only the
 * Disturb(CustomData) family has one (Disturb / Ram/Disturb / ZDistort …; every rotated material of the extracted prefabs) —
 * and sets _Rotation0..3 to (cos, −sin, sin, cos) of each angle [ASSUMED: cos / sin — the client calls two unnamed CRT functions; the identity at angle 0 settles it]. The shader turns
 * texture k's tiled uv (+ the custom offset for the main one) about (0.5, 0.5), u' = x·u + z·v, v' = y·u + w·v, then scrolls:
 * 0 main, 1 dissolve, 2 the third texture (_RamTex / _WeightTex), 3 the noise [ASSUMED: _Rotation2 / 3 in the order of their
 * constant slots — the shader's names are stripped].
 * @param {THREE.ShaderMaterial | null | undefined} mat
 * @param {unknown} uvr
 */
function uvRotation(mat, uvr) {
  if (!mat?.userData.uvRot || !Array.isArray(uvr)) return;
  mat.uniforms.uUVRot.value = true;
  uvr.forEach((deg, k) => {
    const a = (+deg || 0) * (Math.PI / 180), c = Math.cos(a), s = Math.sin(a);
    if (k < 4) mat.uniforms.uRot.value[k].set(c, -s, s, c);
  });
}

// uTime's place in the packed floats (PACKED_FLOATS): setTime writes it there directly
const TIME_K = PACKED_FLOATS.indexOf('uTime'), TIME_VEC = `uPF${TIME_K >> 2}`;
if (AXES[TIME_K & 3] !== 'x') throw new Error('[fx] uTime must be its packed vector\'s x (setTime)');

/**
 * The renderer's time (seconds since its branch started) into its material: the shader clock and the uvTween offsets.
 * (load study F, 2026-11-15) The clock goes straight into its packed vector (`fxTime`, which the material keeps from its making — the accessors write the same vector), not
 * through the `uTime` accessor — one call per system a frame, the same value.
 * @param {THREE.ShaderMaterial} mat
 * @param {number} t
 */
function setTime(mat, t) {
  const tv = mat.fxTime;
  if (tv) tv.x = t; else mat.uniforms.uTime.value = t;
  const uvt = mat.userData.uvt;
  if (!uvt) return;
  for (const e of uvt) {
    const s = Math.max(0, Math.min(t, e.until));
    let z, w;
    if (e.dyn) {   // 2026-10-22: a speed a clip moves (bindTrack0 `uvt:`) — summed frame by frame, as the client's Update
      const ds = e.s1 == null || s < e.s1 ? s : s - e.s1;
      if (e.s1 == null || s < e.s1) { e.zs = e.z0; e.ws = e.w0; }
      e.zs += e.vx * ds; e.ws += e.vy * ds; e.s1 = s;
      z = e.zs; w = e.ws;
    } else { z = e.z0 + e.vx * s; w = e.w0 + e.vy * s; }
    // 2026-10-22: a map whose offset the client keeps to its fraction (fx_extract.py uv_tween: the map's 4th field —
    // protectMainUV / protectSecondUV, an Advance's tweenRepeat): the same on a repeating texture, not on a Clamp one
    e.u.value.z = e.frac ? z - Math.floor(z) : z;
    e.u.value.w = e.frac ? w - Math.floor(w) : w;
  }
}

/**
 * local patch: a mesh's own attributes on the instanced geometry `g` of `src` — its vertex colours (most slash / ring meshes
 * fade their edges by vertex alpha) and, for a Rim material, its normals (computed once on the shared geometry).
 * @param {THREE.BufferGeometry} g
 * @param {THREE.BufferGeometry} src
 * @param {THREE.ShaderMaterial} mat
 */
function useMeshAttrs(g, src, mat) {
  if (src.getAttribute('vcol')) { g.setAttribute('vcol', src.getAttribute('vcol')); mat.uniforms.uVCol.value = true; }
  if (mat.userData.rim) {
    if (!src.getAttribute('normal')) src.computeVertexNormals();
    g.setAttribute('normal', src.getAttribute('normal'));
    mat.uniforms.uRim.value = true;
  }
}

// ---------------------------------------------------------------- library (shared textures, meshes, defs)

/**
 * A Unity TextureWrapMode as three.js wrapping: 1 Clamp → ClampToEdge, 2 Mirror → MirroredRepeat, 3 MirrorOnce →
 * MirroredRepeat [ASSUMED: three.js has no mirror-once; it differs only beyond one mirrored copy], else Repeat.
 * @type {(m: number | undefined) => number}
 */
const wrapMode = (m) => (m === 1 ? THREE.ClampToEdgeWrapping : m === 2 || m === 3 ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping);

/**
 * A file name in a URL: names can hold '#' (skin texture names, e.g. `…_sale#10_…`) that would end the path.
 * @type {(name: string) => string}
 */
const seg = (name) => encodeURIComponent(name);
/**
 * A bundle folder in a URL, each part of it encoded: a skin effect's is `skin/<bundle>` (docs/rules/render.md 「스킨 모델 소재」).
 * @type {(bundle: string) => string}
 */
const folder = (bundle) => String(bundle).split('/').map(seg).join('/');
/** The skin effects' folder under the library's base (fx_extract.py SKIN_DIR): `skin/<bundle>/` prefabs, `skin/tex/`, `skin/mesh/`. */
export const SKIN_FX_DIR = 'skin/';

export class FxLibrary {
  constructor(base = '/assets/local/fx/') {
    this.base = base;
    /** @type {Map<string, Promise<FxDef | null>>} */
    this.defs = new Map();
    /** @type {Map<string, THREE.Texture>} */
    this.textures = new Map();
    /** @type {Map<string, Promise<THREE.BufferGeometry | null>>} */
    this.meshes = new Map();
    this.loader = new THREE.TextureLoader();
    // 2026-11-17: the textures / meshes only skin effects use (skin/index.json `tex` / `mesh`, their wraps skin/tex/wrap.json) —
    // read before the first skin prefab is built (skinFiles); any other name is in the shared tex/ and mesh/
    /** @type {Set<string> | null} */
    this.skinTex = null;
    /** @type {Set<string> | null} */
    this.skinMesh = null;
    /** @type {Record<string, number[]> | null} */
    this.skinWrap = null;
  }

  /**
   * 2026-11-17 (docs/rules/render.md 「스킨 모델 소재」 「스킨 이펙트 프리팹」): which textures and meshes live in the skin folder,
   * fetched once before the first prefab of a `skin/<bundle>` folder is built. fx_extract.py place_skin_files keeps the two
   * folders apart (a file a default effect uses is shared), so a name decides its folder whichever prefab names it.
   * @returns {Promise<void>}
   */
  skinFiles() {
    if (!this._skin) {
      /** @type {(u: string, d: Bag) => Promise<Bag>} */
      const json = (u, d) => fetch(u).then((r) => (r.ok ? r.json() : d)).catch(() => d);
      this._skin = Promise.all([json(this.base + SKIN_FX_DIR + 'index.json', {}), json(this.base + SKIN_FX_DIR + 'tex/wrap.json', {})]).then(([ix, w]) => {
        this.skinTex = new Set(Array.isArray(ix?.tex) ? ix.tex : []);
        this.skinMesh = new Set(Array.isArray(ix?.mesh) ? ix.mesh : []);
        this.skinWrap = /** @type {Record<string, number[]>} */ (w && typeof w === 'object' ? w : {});
      });
    }
    return this._skin;
  }

  /**
   * 2026-10-22: each texture's Unity wrap mode (tools/local-extract/fx_extract.py tex/wrap.json: { file: [u, v] } for the
   * ones that do not repeat; 0 Repeat, 1 Clamp, 2 Mirror, 3 MirrorOnce), fetched once before the first effect is built.
   * Every texture used to repeat: 烛煌 S3's flame (blaze2_02, Clamp, tiled ×4 and scrolled along its mesh) covered the
   * whole pillar for a second instead of passing along it as one streak.
   * @returns {Promise<Record<string, number[]>>}
   */
  wraps() {
    if (!this._wraps) this._wraps = fetch(this.base + 'tex/wrap.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((w) => (w && typeof w === 'object' ? w : {}));
    return /** @type {Promise<Record<string, number[]>>} */ (this._wraps);
  }

  /** @param {string} name */
  texture(name) {
    if (!this.textures.has(name)) {
      const own = !!this.skinTex?.has(name);   // 2026-11-17: a skin effect's own texture (skinFiles)
      const tx = this.loader.load(this.base + (own ? SKIN_FX_DIR : '') + 'tex/' + seg(name));
      const w = own ? this.skinWrap?.[name] : this.wrapOf?.[name];
      tx.wrapS = wrapMode(w?.[0]);
      tx.wrapT = wrapMode(w?.[1]);
      tx.colorSpace = THREE.NoColorSpace;
      tx.flipY = true;    // PNGs are top-down; Unity's uv v = 0 is the bottom row
      this.textures.set(name, tx);
    }
    return this.textures.get(name);
  }

  /**
   * @param {string} key
   * @returns {Promise<THREE.BufferGeometry | null>}
   */
  async mesh(key) {
    if (!this.meshes.has(key)) {
      this.meshes.set(key, fetch(this.base + (this.skinMesh?.has(key) ? SKIN_FX_DIR : '') + 'mesh/' + seg(key) + '.json').then((r) => (r.ok ? r.json() : null)).then(/** @param {MeshFile | null} d */ (d) => {
        if (!d) return null;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
        if (d.uv?.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv.length === (d.pos.length / 3) * 2 ? d.uv : d.uv.filter((_, i) => i % 4 < 2), 2));
        g.setIndex(d.idx);
        // local patch: vertex colours (0–255 from the extract) → vcol, used by the shader's uVCol
        const nv = d.pos.length / 3;
        if (d.col?.length === nv * 4) {
          const mx = d.col.reduce((a, v) => (v > a ? v : a), 0);
          g.setAttribute('vcol', new THREE.Float32BufferAttribute(mx > 1.001 ? d.col.map((v) => v / 255) : d.col, 4));
        }
        // 2026-10-14: a skinned mesh's 4 bone indices / weights per vertex and its bones' bind poses (FxInstance n.skin)
        if (/** @type {number} */ (d.sub?.length) > 1) g.userData.sub = d.sub;   // (2026-10-26) each sub-mesh's [first index, index count]
        if (d.bi?.length === nv * 4 && d.bw?.length === nv * 4 && d.bind?.length) {
          // 2026-10-27: float indices — Uint16 ones (an integer input to three's `vec4 skinIndex`) froze the first draw of a
          // skinned effect 0.14–0.19 s per renderer on Windows (ANGLE / D3D11, Firefox and Chrome), linked program or not
          g.setAttribute('skinIndex', new THREE.Float32BufferAttribute(d.bi, 4));
          g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(d.bw, 4));
          g.userData.bind = d.bind;
        }
        return g;
      }).catch(() => null));
    }
    return /** @type {Promise<THREE.BufferGeometry | null>} */ (this.meshes.get(key));
  }

  /**
   * Load an effect definition (+ its meshes); null when the file is missing.
   * @param {string} bundle
   * @param {string} prefab
   * @returns {Promise<FxDef | null>}
   */
  async load(bundle, prefab) {
    const key = `${bundle}/${prefab}`;
    if (!this.defs.has(key)) {
      this.defs.set(key, (async () => {
        if (String(bundle).startsWith(SKIN_FX_DIR)) await this.skinFiles();   // its textures / meshes may be the skin folder's
        const r = await fetch(`${this.base}${folder(bundle)}/${seg(prefab)}.json`);
        if (!r.ok) return null;
        const def = await r.json();
        this.wrapOf = await this.wraps();   // the textures its materials make (FxInstance) take their wrap from it
        for (const n of def.nodes) {
          if (n.ps) prepareCurves(n.ps);
          if (n.trailR) { prepareCurves(n.trailR); if (n.trailR.widthCurve?.length) n.trailR.wf = flatKeys(n.trailR.widthCurve); }
        }
        def.geoms = {};
        const keys = new Set();
        for (const n of def.nodes) {
          if (n.ps?.render?.mesh) keys.add(n.ps.render.mesh);
          for (const k of n.ps?.render?.meshes || []) keys.add(k);   // (2026-10-27) the renderer's further meshes
          if (n.ps?.shape?.mesh) keys.add(n.ps.shape.mesh);   // 2026-10-22: a Mesh shape's mesh
          if (n.mesh?.mesh) keys.add(n.mesh.mesh);
          if (n.skin?.mesh) keys.add(n.skin.mesh);
        }
        await Promise.all([...keys].map(async (k) => { def.geoms[k] = await this.mesh(k); }));
        def.lib = this;
        def.bundle = bundle; // 2026-10-21: where its RandomEmitter copies load from (render/fxgame.js stepEmitters)
        return def;
      })().catch(() => null));
    }
    return /** @type {Promise<FxDef | null>} */ (this.defs.get(key));
  }

  /**
   * Free what this library uploaded (its view is gone: render/fxgame.js destroy): every texture and mesh geometry is
   * disposed — the renderers drop their GL copies and their 'dispose' listeners, which otherwise kept the renderer and its
   * WebGL context reachable through the library — and the caches are emptied. A load still in flight may fill them again
   * (nothing draws it any more).
   */
  dispose() {
    for (const tx of this.textures.values()) { try { tx.dispose(); } catch { /* ignore */ } }
    for (const p of this.meshes.values()) Promise.resolve(p).then((g) => g?.dispose(), () => {});
    this.textures.clear();
    this.meshes.clear();
    this.defs.clear();
  }
}

const QUAD = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
})();

// ---------------------------------------------------------------- trails

// one strip vertex = 18 floats in one buffer: position 3, uv 2, iColor 4, iSize 3 (x = width), iRot 3 (x = side),
// iVel 3 (the tangent)
const SV = 18, SV_UV = 3, SV_COL = 5, SV_SIZE = 9, SV_ROT = 12, SV_TAN = 15;
const STRIP_ATTRS = [['position', 3, 0], ['uv', 2, SV_UV], ['iColor', 4, SV_COL], ['iSize', 3, SV_SIZE], ['iRot', 3, SV_ROT], ['iVel', 3, SV_TAN]];

// three.js names each new geometry and interleaved buffer with a uuid drawn from Math.random: the buffers grown while an
// effect plays (StripBatch.strip, ParticleSystem.grow) take those draws from a counter instead, so the effect's particles
// get the same random numbers as when everything was made at its start
let uuidN = 0;
const uuidRandom = () => (uuidN = (Math.imul(uuidN, 1103515245) + 12345) >>> 0) / 4294967296;
/**
 * @template T
 * @param {() => T} make
 * @returns {T}
 */
function besideRandom(make) {
  const r0 = Math.random;
  Math.random = uuidRandom;
  try { return make(); } finally { Math.random = r0; }
}

// the same values on every vertex of every strip batch: iUV (0, 0, 1, 1), iC1 / iC2 / iPos 0 — one set of attributes
// shared by all batches (stripConsts), never deleted with a batch (StripBatch.dispose)
/** @type {[string, number][]} */
const STRIP_CONSTS = [['iUV', 4], ['iC1', 4], ['iC2', 4], ['iPos', 3]];
/** @type {{ nv: number, attrs: [string, THREE.BufferAttribute][] } | null} */
let stripConst = null;

/**
 * The shared constant attributes for at least `nv` vertices: a larger set when a batch outgrows the last one.
 * @param {number} nv
 */
function stripConsts(nv) {
  if (stripConst && stripConst.nv >= nv) return stripConst.attrs;
  const NV = Math.max(nv, 512, (stripConst?.nv || 0) * 2);
  // a new Float32Array is already 0, so only iUV's 1s are written (2026-10-30: an arr.set([…]) per vertex, up to 8000
  // for a particle trail, was ~5 % of Firefox's main thread in a co-op boss fight, at each effect's creation)
  const attrs = STRIP_CONSTS.map(([name, n]) => {
    const arr = new Float32Array(NV * n);
    if (name === 'iUV') for (let o = 2; o < arr.length; o += 4) { arr[o] = 1; arr[o + 1] = 1; }
    return /** @type {[string, THREE.BufferAttribute]} */ ([name, new THREE.BufferAttribute(arr, n)]);
  });
  stripConst = { nv: NV, attrs };
  return attrs;
}

// the points a strip batch has room for at first (grown up to its cap by StripBatch.strip)
const STRIP_ROOM0 = 64;
const capBox = new THREE.Box3(), capV = new THREE.Vector3(), ORIGIN = new THREE.Vector3();

/**
 * three.js's bounding sphere of a strip geometry as it was while the buffers held the whole cap: the vertices past the room
 * are 0 there. three.js computes it once, at the geometry's first draw, and sorts the transparent draws by its centre.
 * @param {THREE.BufferGeometry} g
 * @param {number} cap
 */
function capSphere(g, cap) {
  const P = g.getAttribute('position'), short = P.count < cap * 2;
  capBox.setFromBufferAttribute(P);
  if (short) capBox.expandByPoint(ORIGIN);
  const s = g.boundingSphere || (g.boundingSphere = new THREE.Sphere());
  capBox.getCenter(s.center);
  let r2 = short ? s.center.distanceToSquared(ORIGIN) : 0;
  for (let i = 0; i < P.count; i++) r2 = Math.max(r2, s.center.distanceToSquared(capV.fromBufferAttribute(P, i)));
  s.radius = Math.sqrt(r2);
}

// (2026-11-17, official engine: StoreLineData and the line / trail vertex writers) the sides of a strip's points as the
// engine makes them, in the camera's view space: needs the camera, so a batch keeps the one it was last drawn with
// (StripBatch.view) and one not drawn yet takes the last any strip was drawn with
const stripView = new THREE.Matrix4();
let stripViewOn = false;
let sideQ = new Float64Array(64 * 3), sideN = new Float64Array(64 * 2), sideR = new Float64Array(64), sideO = new Float32Array(64 * 2);
/**
 * sign(v) · max(|v|, 0.01): the engine's divisor for a point's depth (its sign bit, so +0 counts as +).
 * @type {(v: number) => number}
 */
const sideSafe = (v) => (v < 0 || Object.is(v, -0) ? -1 : 1) * Math.max(Math.abs(v), 0.01);
/**
 * The engine's tangent-line slope −x / y of a side, clamped to ±10⁵ (a NaN, 0 / 0, takes −10⁵ as its max / min does).
 * @type {(x: number, y: number) => number}
 */
const sideSlope = (x, y) => { const s = -x / y; return s !== s ? -1e5 : Math.min(1e5, Math.max(-1e5, s)); };
/**
 * Normal N[o..o+1] pulled towards the mean (mx, my) by 1 − f and normalised (kept when that is ~0).
 * @param {Float64Array} N @param {number} o @param {number} mx @param {number} my @param {number} f
 */
function sidePull(N, o, mx, my, f) {
  const vx = mx + (N[o] - mx) * f, vy = my + (N[o + 1] - my) * f, v2 = vx * vx + vy * vy;
  if (v2 > 1e-30) { const v = Math.sqrt(v2); N[o] = vx / v; N[o + 1] = vy / v; }
}

/**
 * The m points of `pts` (the batch's frame) through the view matrix elements `e`: each point's side into sideO (x, y per
 * point; × side × width / 2 in view space). `W` is the width the engine hands the line builder — the largest width-curve key ×
 * widthMultiplier for a TrailRenderer / LineRenderer, the particle's width without the curve for a particle trail.
 * The engine (StoreLineData): a point's normal is the perpendicular of its segment to the point before (the first point's,
 * of the segment to the next), on screen — d.xy · z − p.xy · d.z with z = sign · max(|z|, 0.01); a segment shorter than
 * 10⁻⁵ (squared, 10⁻³⁰ for two points) takes the next one, else the last good one, else x. A segment shorter than 2W pulls
 * both its normals to their mean: n = normalize(mean + (n − mean) · f), f = max(L / 2W − ½, 0) · 2 (L ≤ W: the mean).
 * The vertex writers: an end point takes the normal of its segment; a point between takes the mitre of its two segments'
 * normals A, B — where the sides' edge lines meet, A + (I − A) · min(1, 50|A − B|², 50|A + B|²), no longer than
 * max(1, 3 · clamp(L′ / 2W, 0, 1)) with L′ the length stored for the point before it.
 * `flat` (a TransformZ trail, StripBatch.tz): `e` takes the points into its node's plane frame, where the engine finds the
 * normals with no perspective — every point at z = −1 and the segment's z dropped (d.xy · −1).
 * @param {ArrayLike<number>} e
 * @param {ArrayLike<number>} pts
 * @param {number} m
 * @param {number} W
 * @param {boolean} [flat]
 */
function stripSides(e, pts, m, W, flat = false) {
  if (sideR.length < m) {
    const n = Math.max(m, sideR.length * 2);
    sideQ = new Float64Array(n * 3); sideN = new Float64Array(n * 2); sideR = new Float64Array(n); sideO = new Float32Array(n * 2);
  }
  const Q = sideQ, N = sideN, R = sideR, O = sideO;
  for (let k = 0; k < m; k++) {
    const x = pts[k * 3], y = pts[k * 3 + 1], z = pts[k * 3 + 2];
    Q[k * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
    Q[k * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    Q[k * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  const thr = m > 2 ? 1e-5 : 1e-30, w2 = 2 * W;
  let have = false, lx = 1, ly = 0, lz = 0;
  for (let i = 0; i < m; i++) {
    const j = i > 1 ? i : 1, a = (j - 1) * 3, b = j * 3;
    let dx = Q[a] - Q[b], dy = Q[a + 1] - Q[b + 1], dz = Q[a + 2] - Q[b + 2];
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    R[i] = L > 0 ? L / w2 : 0;
    let good = L * L >= thr;
    if (!good && j < m - 1) {
      const c = b + 3;
      dx = Q[b] - Q[c]; dy = Q[b + 1] - Q[c + 1]; dz = Q[b + 2] - Q[c + 2];
      good = dx * dx + dy * dy + dz * dz >= thr;
    }
    if (good) { lx = dx; ly = dy; lz = dz; have = true; } else if (have) { dx = lx; dy = ly; dz = lz; } else { dx = 1; dy = 0; dz = 0; }
    const qx = sideSafe(Q[i * 3]), qy = sideSafe(Q[i * 3 + 1]), qz = flat ? -1 : sideSafe(Q[i * 3 + 2]);
    if (flat) dz = 0;
    const rx = dx * qz - dz * qx, ry = dy * qz - dz * qy, rl = Math.hypot(rx, ry);
    N[i * 2] = rl > 0 ? -ry / rl : 0; N[i * 2 + 1] = rl > 0 ? rx / rl : 0;
    if (i > 0 && L < w2) {
      const f = Math.max(R[i] - 0.5, 0) * 2, o0 = i * 2 - 2, o1 = i * 2;
      const mx = (N[o0] + N[o1]) * 0.5, my = (N[o0 + 1] + N[o1 + 1]) * 0.5;
      sidePull(N, o0, mx, my, f);
      sidePull(N, o1, mx, my, f);
    }
  }
  for (let k = 0; k < m; k++) {
    if (k === 0 || k === m - 1) {
      const i = Math.min(k + 1, m - 1);
      O[k * 2] = N[i * 2]; O[k * 2 + 1] = N[i * 2 + 1];
      continue;
    }
    const ax = N[k * 2], ay = N[k * 2 + 1], bx = N[k * 2 + 2], by = N[k * 2 + 3];
    let x = ax, y = ay;
    const s1 = sideSlope(ax, ay), s2 = sideSlope(bx, by);
    if (!(Math.abs(s1 - s2) < 1e-5)) {
      const c1 = ay - s1 * ax, c2 = by - s2 * bx, ix = (c2 - c1) / (s1 - s2), iy = s1 * ix + c1;
      const t = Math.min(1, 50 * ((ax - bx) ** 2 + (ay - by) ** 2), 50 * ((ax + bx) ** 2 + (ay + by) ** 2));
      x = ax + (ix - ax) * t; y = ay + (iy - ay) * t;
    }
    const lim = Math.max(1, 3 * Math.min(1, Math.max(0, R[k - 1]))), l2 = x * x + y * y;
    if (l2 > lim * lim) { const s = lim / Math.sqrt(l2); x *= s; y *= s; }
    O[k * 2] = x; O[k * 2 + 1] = y;
  }
}

/**
 * (2026-11-17, official engine: TrailRendererGeometryJob.Initialize) A TransformZ trail's plane frame: the engine builds the
 * frame B = [the node's x, its y, −its z] from the renderer's world matrix `t` (scale kept) and hands its inverse to the line
 * builder, which finds the sides there (stripSides `flat`) and writes the vertices back through B — so a side is
 * x · the node's x + y · its y, scaled with the node. Into `out` the inverse (its translation left out: the sides do not
 * depend on it). False for a degenerate frame (|det| ≤ 10⁻⁶ at unit mean scale, where the engine takes an SVD inverse):
 * then the strip has no width [추정·엔진: the SVD branch not ported — its zero axis drops the width in the cases seen].
 * @param {ArrayLike<number>} t
 * @param {THREE.Matrix4} out
 */
function stripPlane(t, out) {
  out.set(t[0], t[4], -t[8], 0, t[1], t[5], -t[9], 0, t[2], t[6], -t[10], 0, 0, 0, 0, 1);
  const s2 = (t[0] ** 2 + t[1] ** 2 + t[2] ** 2 + t[4] ** 2 + t[5] ** 2 + t[6] ** 2 + t[8] ** 2 + t[9] ** 2 + t[10] ** 2) / 3;
  if (!(s2 > 1e-30) || !(Math.abs(out.determinant()) > 1e-6 * s2 ** 1.5)) return false;
  out.invert();
  return true;
}

/**
 * The largest value of a curve's keys [[t, v, …]…] and 0 (the engine's width for the line builder); no keys: 1, as drawn.
 * @param {CurveKey[] | null | undefined} keys
 */
function keysMax(keys) {
  if (!keys?.length) return 1;
  let a = 0;
  for (const k of keys) if (k[1] > a) a = k[1];
  return a;
}

/** A batch of camera-facing strips drawn with one material in one draw call (rebuilt every frame; small counts). Only
 *  what a frame writes goes to the GPU: a ribbon batch holds max + 1 points but draws only the live particles, and the whole
 *  buffers were sent every frame before (2.8–3.5 MB per frame in a crowded scene).
 *  2026-10-30: its buffers start with room for STRIP_ROOM0 points and grow when a frame needs more, up to `cap` — a
 *  particle trail's whole cap (up to 4000 points, about 1 MB with the constant attributes) was allocated and sent to the GPU
 *  at each effect's creation, while a sample of 116 effects drew at most 480 of their 54,462 points. */
class StripBatch {
  /**
   * @param {THREE.ShaderMaterial} material
   * @param {number} [cap]
   */
  constructor(material, cap = 256) {
    this.cap = cap;
    material.uniforms.uMode.value = 6;
    this.material = material;
    this.geometry = null;
    this.mesh = new THREE.Mesh(this.build(Math.min(cap, STRIP_ROOM0)), material);
    this.mesh.frustumCulled = false;
    this.n = 0; this.ni = 0;
    // the camera it was last drawn with (stripSides); mv = that view × the batch's frame, for this frame's strips;
    // sides: 0 none (the tangent's perpendicular in the shader), 1 from the view, 2 in a TransformZ node's plane (tz)
    /** @type {THREE.Matrix4 | null} */
    this.view = null; this.mv = new THREE.Matrix4(); this.sides = 0;
    // (2026-11-17, official engine: TrailRendererGeometryJob.Initialize) a TransformZ trail (`alignment` 1): its node in the
    // batch's frame, set by its owner each frame (TrailRenderer.update); null: the camera's view
    /** @type {THREE.Matrix4 | null} */
    this.tz = null; this.tzM = new THREE.Matrix4(); this.tzFlat = false;
    this.mesh.onBeforeRender = /** @param {unknown} r @param {unknown} sc @param {THREE.PerspectiveCamera} camera */ (r, sc, camera) => {
      (this.view ||= new THREE.Matrix4()).copy(camera.matrixWorldInverse);
      stripView.copy(camera.matrixWorldInverse); stripViewOn = true;
    };
  }

  /**
   * New buffers with room for `room` points, holding what the old ones hold (a frame's strips so far).
   * @param {number} room
   */
  build(room) {
    const g = new THREE.BufferGeometry();
    const vb = new THREE.InterleavedBuffer(new Float32Array(room * 2 * SV), SV);
    vb.setUsage(THREE.DynamicDrawUsage);
    for (const [name, size, offset] of STRIP_ATTRS) g.setAttribute(name, new THREE.InterleavedBufferAttribute(vb, size, offset));
    for (const [name, at] of stripConsts(room * 2)) g.setAttribute(name, at);
    const index = new THREE.BufferAttribute(new Uint16Array(room * 6), 1);
    index.setUsage(THREE.DynamicDrawUsage);
    g.setIndex(index);
    g.setDrawRange(0, 0);
    // the draw order stays the one of the whole-cap buffers: their sphere, kept once computed (capSphere)
    g.computeBoundingSphere = () => capSphere(g, this.cap);
    const old = this.geometry;
    if (old) {
      vb.array.set(/** @type {THREE.InterleavedBuffer} */ (this.vb).array); index.array.set(/** @type {THREE.BufferAttribute} */ (this.index).array);
      g.setDrawRange(old.drawRange.start, old.drawRange.count);
      if (old.boundingSphere) g.boundingSphere = old.boundingSphere;
      this.mesh.geometry = g;
      this.drop(old);
    }
    this.vb = vb; this.index = index; this.geometry = g; this.room = room;
    return g;
  }

  /**
   * Dispose a geometry of this batch without the shared constant attributes (three.js deletes every attribute's buffer).
   * @param {THREE.BufferGeometry} g
   */
  drop(g) {
    for (const [name] of STRIP_CONSTS) g.deleteAttribute(name);
    g.dispose();
  }

  begin() {
    this.n = 0; this.ni = 0;
    if (this.tz) { this.sides = 2; this.tzFlat = stripPlane(this.tz.elements, this.mv); return; }
    const v = this.view || (stripViewOn ? stripView : null);
    this.sides = v ? 1 : 0;
    if (v) { this.mesh.updateWorldMatrix(true, false); this.mv.multiplyMatrices(v, this.mesh.matrixWorld); }
  }

  /**
   * One strip: pts = flat [x, y, z, …], per point width w[], colour c[] (4 each), u[] along the trail; W = the width the
   * engine's line builder takes (stripSides) — with a camera seen, the sides come from it, else from the tangent; a
   * TransformZ strip (tz) takes them in its node's plane, written into the tangent's slot (the shader's iSize.y = 2).
   * @param {Float32Array} pts @param {number} count @param {Float32Array} w @param {Float32Array} c @param {Float32Array} u
   * @param {number} [W]
   */
  strip(pts, count, w, c, u, W = 0) {
    if (count < 2 || this.n + count > this.cap) return;
    if (this.n + count > /** @type {number} */ (this.room)) besideRandom(() => this.build(Math.min(this.cap, Math.max(this.n + count, /** @type {number} */ (this.room) * 2))));
    const D = /** @type {THREE.InterleavedBuffer} */ (this.vb).array, I = /** @type {THREE.BufferAttribute} */ (this.index).array, on = this.sides, plane = on === 2, t = this.tz?.elements;
    if (on === 1 || (plane && this.tzFlat)) stripSides(this.mv.elements, pts, count, W, plane);
    for (let k = 0; k < count; k++) {
      let tx, ty, tz;
      if (plane) {
        // the side out of the plane frame: x · the node's x + y · its y (its scale kept); a degenerate frame: none. Negated:
        // the engine's line writer puts v = 0 on the +normal side and the +1 vertex here takes v = 1 (as the old TransformZ did)
        const sx = this.tzFlat ? -sideO[k * 2] : 0, sy = this.tzFlat ? -sideO[k * 2 + 1] : 0;
        tx = sx * t[0] + sy * t[4]; ty = sx * t[1] + sy * t[5]; tz = sx * t[2] + sy * t[6];
      } else {
        const a = Math.max(0, k - 1), b = Math.min(count - 1, k + 1);
        tx = pts[b * 3] - pts[a * 3]; ty = pts[b * 3 + 1] - pts[a * 3 + 1]; tz = pts[b * 3 + 2] - pts[a * 3 + 2];
      }
      for (let side = 0; side < 2; side++) {
        const o = ((this.n + k) * 2 + side) * SV;
        D[o] = pts[k * 3]; D[o + 1] = pts[k * 3 + 1]; D[o + 2] = pts[k * 3 + 2];
        D[o + SV_TAN] = tx; D[o + SV_TAN + 1] = ty; D[o + SV_TAN + 2] = tz;
        D[o + SV_ROT] = side ? 1 : -1; D[o + SV_SIZE] = w[k]; D[o + SV_SIZE + 1] = on;
        D[o + SV_ROT + 1] = on === 1 ? sideO[k * 2] : 0; D[o + SV_ROT + 2] = on === 1 ? sideO[k * 2 + 1] : 0;
        D[o + SV_UV] = u[k]; D[o + SV_UV + 1] = side;
        D[o + SV_COL] = c[k * 4]; D[o + SV_COL + 1] = c[k * 4 + 1]; D[o + SV_COL + 2] = c[k * 4 + 2]; D[o + SV_COL + 3] = c[k * 4 + 3];
      }
      if (k > 0) {
        const v0 = (this.n + k - 1) * 2, v1 = v0 + 2, j = this.ni;
        I[j] = v0; I[j + 1] = v0 + 1; I[j + 2] = v1; I[j + 3] = v0 + 1; I[j + 4] = v1 + 1; I[j + 5] = v1;
        this.ni += 6;
      }
    }
    this.n += count;
  }

  end() {
    if (this.ni) {   // an empty batch draws nothing and sends nothing
      /** @type {THREE.InterleavedBuffer} */ (this.vb).clearUpdateRanges(); /** @type {THREE.InterleavedBuffer} */ (this.vb).addUpdateRange(0, this.n * 2 * SV); /** @type {THREE.InterleavedBuffer} */ (this.vb).needsUpdate = true;
      /** @type {THREE.BufferAttribute} */ (this.index).clearUpdateRanges(); /** @type {THREE.BufferAttribute} */ (this.index).addUpdateRange(0, this.ni); /** @type {THREE.BufferAttribute} */ (this.index).needsUpdate = true;
    }
    /** @type {THREE.BufferGeometry} */ (this.geometry).setDrawRange(0, this.ni);
    // an empty batch is not drawn — once three.js has its bounding sphere: the first draw computes it from what the buffer
    // holds then and it sets the draw order, so that draw stays where it always was
    this.mesh.visible = this.ni > 0 || !/** @type {THREE.BufferGeometry} */ (this.geometry).boundingSphere;
  }

  dispose() { this.mesh.removeFromParent(); this.drop(/** @type {THREE.BufferGeometry} */ (this.geometry)); this.material.dispose(); }
}

const TRAIL_PTS = 48;
const TRAIL_KEEP = TRAIL_PTS - 1;   // points a TrailRenderer records (its live head is the last one drawn)
// one strip being written: points, width, colour, texture coordinate, and t = the share along the strip (particle trails)
let trailPts = new Float32Array(TRAIL_PTS * 3), trailW = new Float32Array(TRAIL_PTS), trailC = new Float32Array(TRAIL_PTS * 4), trailU = new Float32Array(TRAIL_PTS), trailT = new Float32Array(TRAIL_PTS);
/**
 * Room for a strip of `m` points: a ribbon has one point per particle.
 * @param {number} m
 */
function trailRoom(m) {
  if (m <= trailU.length) return;
  const n = Math.max(m, trailU.length * 2);
  trailPts = new Float32Array(n * 3); trailW = new Float32Array(n); trailC = new Float32Array(n * 4); trailU = new Float32Array(n); trailT = new Float32Array(n);
}
/** The points a batch of particle trails can draw in a frame: its indices are 16 bits, two vertices a point. */
const PTRAIL_CAP = 32000;
const trailM = new THREE.Matrix4(), trailV = new THREE.Vector3();

/**
 * Point A[o..o+2] through the affine matrix elements `e` (three's column order) — `lin`: its linear part only (a velocity).
 * FxInstance.followWorld: what a world-space system keeps in the root's frame, from the root's last frame into this one.
 * @param {Float32Array | Float64Array} A @param {number} o @param {ArrayLike<number>} e
 * @param {boolean} [lin]
 */
function remap(A, o, e, lin = false) {
  const x = A[o], y = A[o + 1], z = A[o + 2], t = lin ? 0 : 1;
  A[o] = e[0] * x + e[4] * y + e[8] * z + e[12] * t;
  A[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13] * t;
  A[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14] * t;
}

/**
 * A TrailRenderer: a ribbon behind its node's motion (sampled in the effect root's space).
 * @typedef {TrailRenderer & { off?: boolean }} TrailRendererOff `off`: switched off by a clip (FxInstance m_IsActive)
 */
class TrailRenderer {
  /** @param {TrailRec} tr @param {THREE.Object3D} node @param {THREE.Object3D} root @param {FxDef} def */
  constructor(tr, node, root, def) {
    this.tr = tr; this.node = node; this.root = root;
    this.def0 = tr;   // 2026-10-22: the shared definition (a clip's `trail:time` drives an own copy)
    this.minDistK = 1;   // FxInstance.setMoveScale
    this.batch = new StripBatch(makeMaterial(def.materials[tr.mat], def.lib), TRAIL_PTS);
    this.batch.mesh.renderOrder = sortingOrder(tr);
    root.add(this.batch.mesh);
    this.ring = new Float64Array(TRAIL_KEEP * 4);   // recorded points x, y, z, t; the oldest at `head`
    this.head = 0; this.count = 0;
    this.time = 0;
  }

  /**
   * @this {TrailRendererOff}
   * @param {number} dt @param {number} sinceStart
   */
  update(dt, sinceStart) {
    this.time += dt;
    setTime(this.batch.material, sinceStart);
    // local patch (m_IsActive): switched off by a clip — not drawn, its points dropped [ASSUMED: cleared, not kept for the next on]
    if (this.off) { this.count = 0; this.batch.begin(); this.batch.end(); return; }
    const tr = this.tr, R = this.ring;
    this.node.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, false);
    tmpM.copy(this.root.matrixWorld).invert().multiply(this.node.matrixWorld);
    const p = tmpV.set(0, 0, 0).applyMatrix4(tmpM);
    const last = ((this.head + this.count - 1) % TRAIL_KEEP) * 4;
    if (this.node.visible && (!this.count || Math.hypot(p.x - R[last], p.y - R[last + 1], p.z - R[last + 2]) >= tr.minDist * this.minDistK)) {
      if (this.count === TRAIL_KEEP) { this.head = (this.head + 1) % TRAIL_KEEP; this.count--; }
      const w = ((this.head + this.count) % TRAIL_KEEP) * 4;
      R[w] = p.x; R[w + 1] = p.y; R[w + 2] = p.z; R[w + 3] = this.time;
      this.count++;
    }
    while (this.count && this.time - R[this.head * 4 + 3] > tr.time) { this.head = (this.head + 1) % TRAIL_KEEP; this.count--; }
    // 2026-10-27 (effect bundle W2d): `alignment` 1 TransformZ — the ribbon lies in the node's x-y plane (Unity manual: it faces
    // the node's z), else it faces the camera; (2026-11-17, official engine) the node's frame now for every point, each frame
    this.batch.tz = tr.align === 1 ? this.batch.tzM.copy(tmpM) : null;
    // newest first: the live head, then the recorded points
    const n = this.count + 1;
    this.batch.begin();
    if (n >= 2) {
      let d = 0;
      for (let k = 0; k < n; k++) {
        if (k === 0) { trailPts[0] = p.x; trailPts[1] = p.y; trailPts[2] = p.z; } else {
          const h = ((this.head + this.count - k) % TRAIL_KEEP) * 4;
          trailPts[k * 3] = R[h]; trailPts[k * 3 + 1] = R[h + 1]; trailPts[k * 3 + 2] = R[h + 2];
          d += Math.hypot(trailPts[k * 3] - trailPts[k * 3 - 3], trailPts[k * 3 + 1] - trailPts[k * 3 - 2], trailPts[k * 3 + 2] - trailPts[k * 3 - 1]);
        }
        trailU[k] = d;
      }
      for (let k = 0; k < n; k++) {
        const u = k / (n - 1), f = d > 0 ? trailU[k] / d : u;   // (the width and colour along the points, as before)
        trailW[k] = tr.width * (tr.wf ? evalFlat(tr.wf, u) : tr.widthCurve?.length ? evalCurve(tr.widthCurve, u) : 1);
        evalGradient(tr.grad, u, tmpC);
        trailC.set(tmpC, k * 4);
        // 2026-10-27 (effect bundle W2d; Unity manual, LineTextureMode): 0 Stretch = once over the length, by distance; 1 Tile =
        // once per unit of length; 2 DistributePerSegment = once over the length, the points evenly spaced; 3 RepeatPerSegment =
        // once per segment. Before, Stretch went by the point index and Tile by the point index × minVertexDistance
        trailU[k] = tr.texMode === 1 ? trailU[k] : tr.texMode === 2 ? u : tr.texMode === 3 ? k : f;
      }
      this.batch.strip(trailPts, n, trailW, trailC, trailU, tr.width * keysMax(tr.widthCurve));
    }
    this.batch.end();
  }

  get alive() { return this.count > 0; }

  /**
   * The recorded points through `e` (remap; FxInstance.followWorld: the root moved or turned; Unity trails are world space).
   * @param {ArrayLike<number>} e
   */
  shift(e) {
    const R = this.ring;
    for (let k = 0; k < this.count; k++) remap(R, ((this.head + k) % TRAIL_KEEP) * 4, e);
  }

  dispose() { this.batch.dispose(); }
}

// local patch (maintainer report 2026-10-07: 蕾缪안 S3's aiming beams were missing) ---------------- line renderer
/**
 * A Unity LineRenderer (fx_extract.py lineR): a view-facing strip through fixed points of its node (local space; a
 * world-space line's points come from a client script — drawn in the effect's space [ASSUMED]). Width = widthMultiplier
 * (a clip may animate it: 'width') × widthCurve; colour = colorGradient along the line; u: Stretch 0..1, Tile = distance,
 * Distribute / Repeat per segment = the segment index. Unity keeps the object (its last clip frame) until its owner
 * destroys it: alive while the instance is not stopped.
 */
// FxInstance.setPath: the most points a line takes (a chain's units; 2026-11-10: a range outline's corners — its batch grows
// to what it draws, StripBatch.build)
const LINE_PATH_MAX = 256;
class LineRenderer {
  /** @param {LineRec} ln @param {THREE.Object3D} node @param {THREE.Object3D} root @param {FxDef} def */
  constructor(ln, node, root, def) {
    this.tr = ln; this.node = node; this.root = root;
    /** @type {{ x: number, y: number, z: number }[] | null} */
    this.ends = null;   // 2026-10-10: FxInstance.setLine
    /** @type {{ x: number, y: number, z: number }[] | null} */
    this.path = null;   // 2026-10-16: FxInstance.setPath
    this.w = ln.width;
    const n = ln.pts.length + (ln.loop ? 1 : 0);
    this.n = Math.min(n, TRAIL_PTS);
    this.batch = new StripBatch(makeMaterial(def.materials[ln.mat], def.lib), Math.max(this.n, LINE_PATH_MAX));
    this.batch.mesh.renderOrder = ln.order || 0;
    root.add(this.batch.mesh);
  }

  /** @param {number} dt @param {number} sinceStart */
  update(dt, sinceStart) {
    const ln = this.tr, path = this.path, n = path ? Math.min(path.length, LINE_PATH_MAX) : this.n;
    trailRoom(n);
    setTime(this.batch.material, sinceStart);
    this.batch.begin();
    let shown = true;
    for (let o = this.node; o && o !== this.root; o = o.parent) if (!o.visible) { shown = false; break; }
    if (shown && n >= 2 && this.w > 0) {
      this.node.updateWorldMatrix(true, false);
      this.root.updateWorldMatrix(true, false);
      if (ln.world) tmpM.identity(); else tmpM.copy(this.root.matrixWorld).invert().multiply(this.node.matrixWorld);
      // 2026-10-10: a LineEffectEmitterDynamic line (FxInstance.setLine) — its first / last point at two scene points
      // (client _UpdateMountPoint: SetPosition(0, start) / SetPosition(1, end) each frame), the ones between spread evenly;
      // 2026-10-16: a path line (FxInstance.setPath) runs through its points instead
      const ends = this.ends;
      if (ends || path) tmpM2.copy(this.root.matrixWorld).invert();
      let total = 0;
      for (let k = 0; k < n; k++) {
        const q = ln.pts[k % ln.pts.length];
        const f = n > 1 ? k / (n - 1) : 0;
        const p = path
          ? tmpV.set(path[k].x, path[k].y, path[k].z).applyMatrix4(tmpM2)
          : ends
          ? tmpV.set(ends[0].x + (ends[1].x - ends[0].x) * f, ends[0].y + (ends[1].y - ends[0].y) * f, ends[0].z + (ends[1].z - ends[0].z) * f).applyMatrix4(tmpM2)
          : tmpV.set(q[0], q[1], q[2]).applyMatrix4(tmpM);
        trailPts[k * 3] = p.x; trailPts[k * 3 + 1] = p.y; trailPts[k * 3 + 2] = p.z;
        if (k) total += Math.hypot(p.x - trailPts[k * 3 - 3], p.y - trailPts[k * 3 - 2], p.z - trailPts[k * 3 - 1]);
        trailU[k] = total;   // the distance so far (u below)
      }
      for (let k = 0; k < n; k++) {
        const f = total > 0 ? trailU[k] / total : k / (n - 1);
        trailW[k] = this.w * (ln.widthCurve?.length ? evalCurve(ln.widthCurve, f) : 1);
        evalGradient(ln.grad, f, tmpC);
        trailC.set(tmpC, k * 4);
        trailU[k] = ln.texMode === 1 ? trailU[k] : ln.texMode === 2 ? k / (n - 1) : ln.texMode === 3 ? k : f;
      }
      this.batch.strip(trailPts, n, trailW, trailC, trailU, this.w * keysMax(ln.widthCurve));
    }
    this.batch.end();
  }

  dispose() { this.batch.dispose(); }
}

// ---------------------------------------------------------------- particle system

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), tmpM2 = new THREE.Matrix4();
const emitM = new THREE.Matrix4();   // ParticleSystem.emit: node → root for a world-space system
const frameQ = new THREE.Quaternion(), ONE3 = new THREE.Vector3(1, 1, 1);   // ParticleSystem.syncFrame
// ParticleSystem sub emitters (2026-10-14): the parent's node → root, a particle's point, the shape offset, inherited values
const subM = new THREE.Matrix4(), subAt = new THREE.Vector3(), subOff = new THREE.Vector3(), subCol = [0, 0, 0, 0], subSize = [1, 1, 1];
// (2026-10-26, effect bundle U) the orbit's frames (orbitFrame: orbitLocal = a local-space system's own), its temporaries,
// the noise's output, one emission's place in its call for the shape's ordered modes (shapeSample `ctx`)
const orbitLocal = new THREE.Matrix4(), orbitM = new THREE.Matrix4(), orbC = new THREE.Vector3(), orbW = new THREE.Vector3();
const orbP = new THREE.Vector3(), orbQ = new THREE.Quaternion(), noiseV = new THREE.Vector4();
const shapeCtx = { k: 0, count: 1, time: 0, t01: 0, arcLaps: 0, radLaps: 0 };
/**
 * A MinMaxCurve that is not zero everywhere (its scalar multiplies a curve).
 * @type {(mm: MinMax | null | undefined) => boolean}
 */
const mmOn = (mm) => !!mm && !!(mm.s || mm.n);

// (2026-10-26, effect bundle U; official client Perlin3D) the noise module's gradient noise: Ken Perlin's improved noise
// (his permutation, the engine's 16 gradients, fade 6t⁵ − 15t⁴ + 10t³); perlinD gives f × its derivatives along x and y at
// p × f — what the official client's Perlin3D(p, f) returns (compared on random points: |Δ| < 0.003, float32 rounding)
const PERM = Uint8Array.from([151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180]);
const GRAD = Int8Array.from([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1,1,1,0,-1,1,0,0,-1,1,0,-1,-1]);
/** @type {(t: number) => number} */
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10), dfade = (/** @type {number} */ t) => 30 * t * t * (t * (t - 2) + 1);
const pdOut = [0, 0];
// (2026-10-28, mobile perf) perlinD unrolled: it made three arrays and four closures per call and looked the permutation
// up 24 times (a fifth of the particle update in a boss fight); the corners now share their x and xy lookups (14) and
// live in locals. The same integer hashes and the same arithmetic in the same order — the same numbers
// (test/render/fx-cpu-identity.test.js compares it with the earlier form).
/**
 * The trilinear blend of eight corner values (x fastest) by u, v, w.
 * @param {number} a0 @param {number} a1 @param {number} a2 @param {number} a3 @param {number} a4 @param {number} a5 @param {number} a6 @param {number} a7 @param {number} u @param {number} v @param {number} w
 */
function pdTri(a0, a1, a2, a3, a4, a5, a6, a7, u, v, w) {
  const x00 = a0 + u * (a1 - a0), x10 = a2 + u * (a3 - a2), x01 = a4 + u * (a5 - a4), x11 = a6 + u * (a7 - a6);
  const y0 = x00 + v * (x10 - x00), y1 = x01 + v * (x11 - x01);
  return y0 + w * (y1 - y0);
}
/**
 * The bilinear blend of a00 a10 a01 a11 by s, t.
 * @param {number} a00 @param {number} a10 @param {number} a01 @param {number} a11 @param {number} s @param {number} t
 */
function pdBy(a00, a10, a01, a11, s, t) { const p0 = a00 + s * (a10 - a00), p1 = a01 + s * (a11 - a01); return p0 + t * (p1 - p0); }
/** @param {number} x @param {number} y @param {number} z @param {number} f */
export function perlinD(x, y, z, f) {
  x *= f; y *= f; z *= f;
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  x -= X; y -= Y; z -= Z;
  const xi = X & 255, yi = Y & 255, zi = Z & 255, P = PERM, G = GRAD;
  const u = fade(x), v = fade(y), w = fade(z), du = dfade(x), dv = dfade(y);
  // the eight corners k = i + 2j + 4l: the gradient index of P[P[P[x + i] + y + j] + z + l] (each sum & 255), its value n
  // and its gradient's x / y parts, each blended by the fades (and their derivatives)
  const a0 = P[xi], a1 = P[(xi + 1) & 255];
  const b0 = P[(a0 + yi) & 255], b1 = P[(a1 + yi) & 255], b2 = P[(a0 + yi + 1) & 255], b3 = P[(a1 + yi + 1) & 255];
  const g0 = (P[(b0 + zi) & 255] & 15) * 3, g1 = (P[(b1 + zi) & 255] & 15) * 3, g2 = (P[(b2 + zi) & 255] & 15) * 3, g3 = (P[(b3 + zi) & 255] & 15) * 3;
  const g4 = (P[(b0 + zi + 1) & 255] & 15) * 3, g5 = (P[(b1 + zi + 1) & 255] & 15) * 3, g6 = (P[(b2 + zi + 1) & 255] & 15) * 3, g7 = (P[(b3 + zi + 1) & 255] & 15) * 3;
  const x1 = x - 1, y1 = y - 1, z1 = z - 1;
  const c0 = G[g0] * (x - 0) + G[g0 + 1] * (y - 0) + G[g0 + 2] * (z - 0), c1 = G[g1] * x1 + G[g1 + 1] * (y - 0) + G[g1 + 2] * (z - 0);
  const c2 = G[g2] * (x - 0) + G[g2 + 1] * y1 + G[g2 + 2] * (z - 0), c3 = G[g3] * x1 + G[g3 + 1] * y1 + G[g3 + 2] * (z - 0);
  const c4 = G[g4] * (x - 0) + G[g4 + 1] * (y - 0) + G[g4 + 2] * z1, c5 = G[g5] * x1 + G[g5 + 1] * (y - 0) + G[g5 + 2] * z1;
  const c6 = G[g6] * (x - 0) + G[g6 + 1] * y1 + G[g6 + 2] * z1, c7 = G[g7] * x1 + G[g7 + 1] * y1 + G[g7 + 2] * z1;
  // ∂/∂x: the blended gradients' x + du × (the x-differences blended in y, z); ∂/∂y the same in y
  const gx = pdTri(G[g0], G[g1], G[g2], G[g3], G[g4], G[g5], G[g6], G[g7], u, v, w) + du * pdBy(c1 - c0, c3 - c2, c5 - c4, c7 - c6, v, w);
  const gy = pdTri(G[g0 + 1], G[g1 + 1], G[g2 + 1], G[g3 + 1], G[g4 + 1], G[g5 + 1], G[g6 + 1], G[g7 + 1], u, v, w) + dv * pdBy(c2 - c0, c3 - c1, c6 - c4, c7 - c5, u, w);
  pdOut[0] = gx * f; pdOut[1] = gy * f;
  return pdOut;
}
// (official client Perlin1D, Perlin2D) the noise module's Low and Medium quality: gradients ±1 along x, and the four axis
// directions (the permutation's low three bits, the other four empty), the same fade. Perlin1D gives 2f × dN/dx and 0 at x × f;
// Perlin2D gives √2 f × its x and y derivatives at (x, y) × f (compared with the client's on random points: test/render/fx-emission-motion.test.js)
const GRAD2 = [1, 0, -1, 0, 0, 1, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0];
/** @param {number} x @param {number} y @param {number} z @param {number} f */
export function perlin1(x, y, z, f) {
  const px = x * f, X = Math.floor(px), t = px - X, i = X & 255, g0 = PERM[i] & 1 ? -1 : 1, g1 = PERM[(i + 1) & 255] & 1 ? -1 : 1;
  pdOut[0] = 2 * f * (g0 + (g1 - g0) * fade(t) + (g1 * (t - 1) - g0 * t) * dfade(t)); pdOut[1] = 0;
  return pdOut;
}
/** @param {number} x @param {number} y @param {number} z @param {number} f */
export function perlin2(x, y, z, f) {
  const px = x * f, py = y * f, X = Math.floor(px), Y = Math.floor(py), s = px - X, t = py - Y, xi = X & 255, yi = Y & 255, P = PERM, G = GRAD2;
  const a0 = P[xi], a1 = P[(xi + 1) & 255];
  const g0 = (P[(a0 + yi) & 255] & 7) * 2, g1 = (P[(a1 + yi) & 255] & 7) * 2, g2 = (P[(a0 + yi + 1) & 255] & 7) * 2, g3 = (P[(a1 + yi + 1) & 255] & 7) * 2;
  const n0 = G[g0] * s + G[g0 + 1] * t, n1 = G[g1] * (s - 1) + G[g1 + 1] * t, n2 = G[g2] * s + G[g2 + 1] * (t - 1), n3 = G[g3] * (s - 1) + G[g3 + 1] * (t - 1);
  const u = fade(s), v = fade(t), k = Math.SQRT2 * f;
  const n01 = n0 + u * (n1 - n0), n23 = n2 + u * (n3 - n2);
  const gx0 = G[g0] + u * (G[g1] - G[g0]), gx1 = G[g2] + u * (G[g3] - G[g2]), gy0 = G[g0 + 1] + u * (G[g1 + 1] - G[g0 + 1]), gy1 = G[g2 + 1] + u * (G[g3 + 1] - G[g2 + 1]);
  const dn0 = n1 - n0, dn1 = n3 - n2;
  pdOut[0] = k * (gx0 + v * (gx1 - gx0) + dfade(s) * (dn0 + v * (dn1 - dn0)));
  pdOut[1] = k * (gy0 + v * (gy1 - gy0) + dfade(t) * (n23 - n01));
  return pdOut;
}
/** (official client: the octave loop round Perlin3D) Σ ampₖ × pn(p, f × scaleᵏ) / Σ ampₖ, ampₖ = mulᵏ. */
const fbOut = [0, 0];
/**
 * @param {number} x @param {number} y @param {number} z @param {number} f @param {number} oct @param {number} mul @param {number} scale
 * @param {(x: number, y: number, z: number, f: number) => number[]} [pn]
 */
function perlinOct(x, y, z, f, oct, mul, scale, pn = perlinD) {
  let sa = 0, sb = 0, amp = 1, sum = 0;
  for (let k = 0; k < oct; k++) { const d = pn(x, y, z, f); sa += d[0] * amp; sb += d[1] * amp; sum += amp; amp *= mul; f *= scale; }
  fbOut[0] = sa / sum; fbOut[1] = sb / sum;
  return fbOut;
}
// one particle's instance data = 28 floats in one buffer (one upload per system and frame, was eight):
// iPos 3, iSize 3, iRot 3, iColor 4, iC1 4, iC2 4, iUV 4, iVel 3
const IV = 28, IV_POS = 0, IV_SIZE = 3, IV_ROT = 6, IV_COL = 9, IV_C1 = 13, IV_C2 = 17, IV_UV = 21, IV_VEL = 25;
/** @type {[string, number, number][]} */
const INSTANCE_ATTRS = [['iPos', 3, IV_POS], ['iSize', 3, IV_SIZE], ['iRot', 3, IV_ROT], ['iColor', 4, IV_COL], ['iC1', 4, IV_C1],
  ['iC2', 4, IV_C2], ['iUV', 4, IV_UV], ['iVel', 3, IV_VEL]];

/** An instanced geometry over `src` (its index, positions, uvs) with its own instance buffer of `max` rows. */
/**
 * The largest value of a MinMax curve (Unity MinMaxCurve's max: a prewarm's window).
 * @param {MinMax | null | undefined} mm
 */
function mmMax(mm) {
  if (!mm) return 0;
  if (mm.m === 3) return Math.max(mm.s, mm.n);
  if (mm.m !== 1 && mm.m !== 2) return mm.s;
  let a = 0;
  for (let i = 0; i <= 16; i++) a = Math.max(a, evalMM(mm, i / 16, 0), evalMM(mm, i / 16, 1));
  return a;
}

/**
 * @param {THREE.BufferGeometry} src
 * @param {number} max
 * @returns {{ g: THREE.InstancedBufferGeometry, ib: THREE.InstancedInterleavedBuffer }}
 */
function instanced(src, max) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = src.index;
  g.setAttribute('position', src.getAttribute('position'));
  if (src.getAttribute('uv')) g.setAttribute('uv', src.getAttribute('uv'));
  const ib = new THREE.InstancedInterleavedBuffer(new Float32Array(max * IV), IV, 1);
  ib.setUsage(THREE.DynamicDrawUsage);
  for (const [name, size, offset] of INSTANCE_ATTRS) g.setAttribute(name, new THREE.InterleavedBufferAttribute(ib, size, offset));
  g.instanceCount = 0;
  return { g, ib };
}

/**
 * 2026-10-28: dispose an effect's geometry without the attributes it shares with `src` (QUAD, a library mesh: the index,
 * positions, uvs, vertex colours, normals, skin). three.js deletes the GL buffer of every attribute of a disposed
 * geometry, so a particle system ending deleted QUAD's buffers under every other live effect: their vertex array objects
 * kept the deleted buffers and each of their draws failed (WebGL `drawElementsInstanced: no buffer is bound to enabled
 * attribute` — the effect not drawn; 르무엔's attack trail on, hundreds during her S3). `src` itself goes with the library.
 * @param {THREE.BufferGeometry} g
 * @param {THREE.BufferGeometry | null | undefined} src
 */
function disposeOwn(g, src) {
  if (src && g.index === src.index) g.setIndex(null);
  if (src) for (const name of Object.keys(g.attributes)) if (src.getAttribute(name) === g.attributes[name]) g.deleteAttribute(name);
  g.dispose();
}

/**
 * 2026-10-30: `mesh`'s instanced geometry `g` (over `src`, instance buffer `ib`) for `room` rows — a new one holding the old
 * rows and its other attributes (vertex colours, normals); the old one disposed without what it shares (disposeOwn).
 * @param {THREE.Mesh} mesh @param {THREE.InstancedBufferGeometry} g @param {THREE.InstancedInterleavedBuffer} ib
 * @param {THREE.BufferGeometry} src @param {number} room
 */
function regrow(mesh, g, ib, src, room) {
  const { g: g2, ib: ib2 } = instanced(src, room);
  ib2.array.set(ib.array);
  for (const name of Object.keys(g.attributes)) if (!g2.getAttribute(name)) { g2.setAttribute(name, g.getAttribute(name)); g.deleteAttribute(name); }
  g2.instanceCount = g.instanceCount;
  mesh.geometry = g2;
  disposeOwn(g, src);
  return { g: g2, ib: ib2 };
}

// the particles a system has room for at first (grown up to its max by ParticleSystem.grow)
const PS_ROOM0 = 16;

/**
 * (2026-10-27, effect bundle V) a renderer's place in Unity's transparent order — its sorting layer (`layer`, the layer's
 * place: 0 = Default, −2 = two layers before it) before its sortingOrder (`order`) — as a three.js renderOrder.
 */
export const LAYER_ORDER = 100000;
/** @type {(r: { layer?: number, order?: number } | null | undefined) => number} */
export const sortingOrder = (r) => (r?.layer || 0) * LAYER_ORDER + (r?.order || 0);

/**
 * (2026-10-27, effect bundle V) the custom data as the renderer streams it to the shader (official enum: 31–34 Custom1X…XYZW,
 * 35–38 Custom2X…XYZW): the floats after the uv, in stream order, are what the shader reads as custom1 then custom2 — for
 * each of those 8 slots the index into (custom1, custom2) that fills it, −1 for none; null when it is custom1 then custom2
 * as they are. Custom streams off (`ownStreams` 0): Unity's default streams carry no custom data, all −1.
 * @param {PsRender} r
 */
function customMap(r) {
  if (r.ownStreams == null) return null;   // an extract before 2026-10-27
  /** @type {number[]} */
  const flat = [];
  if (r.ownStreams) {
    for (const s of r.streams || []) {
      if (s >= 31 && s <= 38) { const c = s <= 34 ? 0 : 4; for (let k = 0; k <= (s - 31) % 4; k++) flat.push(c + k); }
    }
  }
  const map = Array.from({ length: 8 }, (_, j) => (j < flat.length ? flat[j] : -1));
  return map.every((v, j) => v === j) ? null : map;
}
/** @type {(src: THREE.BufferGeometry) => THREE.Float32BufferAttribute} */
const whiteVcol = (src) => new THREE.Float32BufferAttribute(new Float32Array(src.getAttribute('position').count * 4).fill(1), 4);
const sortM = new THREE.Matrix4();
const velAx = new THREE.Vector3();   // (2026-10-27) ParticleSystem.velFrame
const tmpC = [0, 0, 0, 0], tmpC2 = [0, 0, 0, 0], tmpC3 = [0, 0, 0, 0], tmpCD = new Float32Array(8);
const D2R = Math.PI / 180;
// (2026-10-22) a particle's size multipliers (sizeOf), the emitter velocity's frame change (emitterVelocity)
const sizeK = [1, 1, 1], SIZE_ONE = Object.freeze([1, 1, 1]), tmpM3 = new THREE.Matrix3();

/**
 * @typedef {ParticleSystem & { subOf?: ParticleSystem, trailPath?: THREE.Object3D[] }} ParticleSystemLinks `subOf`: the system it is a sub
 *   emitter of (FxInstance sets it); `trailPath`: its particles' trail path in the effect (FxInstance)
 * @typedef {ParticleSystemLinks & { tm: TrailModule, histK: number, hist: Float32Array, histN: Uint8Array, trailBatch: StripBatch,
 *   order: number[] }} ParticleTrails a system with its TrailModule on (its trail methods; ParticleSystem.draw checks `trailBatch`)
 * @typedef {ParticleSystem & { subs: SubLink[], subAcc: Float32Array }} ParticleSubs a system with Birth sub emitters (setSubs)
 */
class ParticleSystem {
  /**
   * @param {PsRec} ps @param {THREE.Object3D} node @param {THREE.Object3D} root @param {FxDef} def
   * @param {{ q: Quality, cap?: number, pivot?: boolean, lod?: number | null }} opts
   */
  constructor(ps, node, root, def, opts) {
    this.ps = ps;
    this.node = node;           // THREE.Object3D of its node
    this.frame = node;          // where its particles live (useLocalScale: a stand-in without the parents' scale)
    /** @type {THREE.Object3D | null} */
    this.top = null;
    this.root = root;           // effect root (Unity frame)
    this.q = opts.q;
    this.lod = opts.lod ?? null;   // (2026-10-23) its FxLODSetting percentage at quality 'medium' (rateK / burstK)
    this.world = ps.space === 1;
    this.meshShape = ps.shape?.type === 6 ? meshShape(ps.shape, def.geoms?.[/** @type {string} */ (ps.shape.mesh)]) : null;   // 2026-10-22
    const max = Math.max(1, Math.min(ps.max || 1000, opts.cap || 400));
    this.max = max;
    // 2026-10-30: the per-particle arrays and instance buffers hold `room` particles, grown up to `max` as emission needs
    // (grow) — each new system allocated `max` (750 at 'high') and sent the instance buffers to the GPU whole, while a
    // sample of 854 systems peaked at 5,627 particles of their 486,650 (66 MB of GPU buffers for 0.7 MB used)
    const room = Math.min(max, PS_ROOM0);
    this.room = room;
    this.n = 0;
    this.time = -(evalMM(ps.delay, 0, Math.random()) || 0);
    this.emitAcc = 0;
    this.burstDone = (ps.bursts || []).map(() => 0);
    this.stopped = false;
    this.cycle = 0;
    // 2026-10-22: InheritVelocity (mode 0 Initial — the only one extracted): a world-space system's particles take the
    // emitter's velocity × k at birth (Unity manual: the module acts on world simulation space only); Collision planes:
    // the nodes FxInstance hands over (`planes`, from `mods.collide.planes`)
    const iv = ps.mods.inherit;
    this.inherit = this.world && iv && (iv.mode ?? 0) === 0 ? iv.k : null;
    this.emitV = new THREE.Vector3();
    /** @type {THREE.Vector3 | null} */
    this.emitAt = null;
    // (2026-10-26, effect bundle U) emission by distance (`dist`): the emitter's move this frame, in the root frame (moved);
    // prewarm: a looping system runs one whole cycle before its first frame (prewarm); the velocity module's orbit / radial /
    // speed modifier (orbit); the noise module's field (noise, nz = each particle's last noise value for its size)
    this.moved = ps.dist ? new THREE.Vector3() : null;
    this.distAcc = 0;
    this.arcLaps = this.arcLaps0 = 0; this.radLaps = this.radLaps0 = 0;   // the shape's Loop / PingPong clocks (arcPick), now and a step ago
    // the noise field's per-system offset (the engine's: the system's random × 100 per axis) and its scroll
    this.nOff = ps.mods.noise ? [Math.random() * 100, Math.random() * 100, Math.random() * 100] : null;
    this.nScroll = 0;
    this.warm = !!(ps.prewarm && ps.loop && ps.dur > 0);
    const vo = ps.mods.velOL;
    this.orbit = !!vo && (!!vo.orbX || !!vo.orbY || mmOn(vo.orbZ) || mmOn(vo.radial) || !!vo.orbOff);
    this.speedK = !!vo && !(vo.speedMul?.m === 0 && vo.speedMul.s === 1) && !!vo.speedMul;
    /** @type {THREE.Object3D[]} */
    this.planes = [];
    /** @type {Float32Array | null} */
    this.planeAt = null;
    // particle state (SoA)
    this.pos = new Float32Array(room * 3); this.vel = new Float32Array(room * 3); this.age = new Float32Array(room);
    // (2026-10-27) the step's animated velocity (VelocityOverLifetime, orbit, radial, noise): the engine's quads take
    // velocity + animated velocity (stretched and Velocity-aligned billboards)
    this.avel = new Float32Array(room * 3);
    this.life = new Float32Array(room); this.size0 = new Float32Array(room * 3); this.rot = new Float32Array(room * 3);
    this.rotVel = new Float32Array(room); this.col0 = new Float32Array(room * 4); this.rnd = new Float32Array(room * 4);
    this.nz = ps.mods.noise?.sizeAmt ? new Float32Array(room) : null;
    const geomSrc = /** @type {THREE.BufferGeometry} */ (ps.render.mode === 4 && def.geoms[/** @type {string} */ (ps.render.mesh)] ? def.geoms[/** @type {string} */ (ps.render.mesh)] : QUAD);
    const { g, ib } = instanced(geomSrc, room);
    this.ib = ib;
    this.geometry = g;
    this.geomSrc = geomSrc;
    // a trail-only system (renderer mode None / no particle material) draws only its trails
    const drawParticles = ps.render.mat && ps.render.mode !== 5;
    const mat = makeMaterial(def.materials[/** @type {string} */ (ps.render.mat)] || null, def.lib);
    mat.uniforms.uMode.value = ps.render.mode;   // (2026-11-16) 3 vertical billboards have their own branch (was drawn as 0)
    mat.uniforms.uLengthScale.value = ps.render.lengthScale ?? 2;
    mat.uniforms.uVelScale.value = ps.render.velScale ?? 0;
    // (official client) a mesh particle's alignment picks its mesh job, Local when `rotOL` turns its separate axes
    // (PrepareForRender forces it); its Facing job is unread and no extracted system has it (fx_coverage reports one)
    const meshAlign = ps.render.mode !== 4 ? -1 : ps.mods?.rotOL?.x || ps.render.align === 3 ? 2 : ps.render.align ?? 0;
    const billboard = ps.render.mode === 0;
    // (official client) the job's basis does not depend on the simulation space: Local is the system's rotation (the state's, kept
    // for a world-space system too), World the identity. So a world-space system's Local (5) and a local-space system's World (6)
    // are drawn apart from the frame their particles live in
    this.sysLocal = this.world && (meshAlign === 2 || (billboard && ps.render.align === 2));
    const worldOverLocal = !this.world && billboard && ps.render.align === 1;
    mat.uniforms.uAlign.value = this.sysLocal ? 5 : worldOverLocal ? 6 : meshAlign >= 0 ? meshAlign : billboard || ps.render.align < 3 ? ps.render.align ?? 0 : 0;   // Facing, Velocity: billboards only
    mat.uniforms.uFree.value = !!ps.render.free;
    mat.uniforms.uRotW.value = !!ps.render.rotw;
    this.velAlign = (ps.render.mode === 0 && ps.render.align === 4) || meshAlign === 4;
    this.rootTurn = meshAlign === 1 || meshAlign === 4 || worldOverLocal;   // its basis needs the root's turn every frame (sysScale)
    // (2026-11-04) the quads that take the system's transform scale (sysScale): View, Velocity and stretched billboards
    // (freeform aside), and a world-space system's World / Local-aligned ones (a local-space system's take it from their
    // model matrix); so do View, World and Velocity meshes (their matrix helper); horizontal, vertical and Facing renderers
    // do not here (their dispatchers are not read)
    const r = ps.render;
    this.quadScaled = (r.mode === 0 && (r.align === 0 || r.align === 4 || worldOverLocal || (this.world && (r.align === 1 || r.align === 2)))) || (r.mode === 1 && !r.free) || meshAlign === 0 || meshAlign === 1 || meshAlign === 4 || this.sysLocal;
    /** @type {THREE.Object3D[] | null} */
    this.scalePath = null;   // the nodes whose scale it takes (FxInstance), null for none
    // (official client) a mesh particle turns by its rotation as it is, by all three axes the other way with `rotOL`'s separate axes
    this.meshRotSign = r.mode === 4 && ps.mods?.rotOL?.x ? -1 : 1;
    /** @type {THREE.Vector3 | null} */
    this.sysS = null;        // the scale last sent
    if (opts.pivot && Array.isArray(ps.render.pivot)) mat.uniforms.uPivot.value.set(+ps.render.pivot[0] || 0, +ps.render.pivot[1] || 0, +ps.render.pivot[2] || 0); // local patch (FxInstance opts.pivot, default on)
    if (geomSrc !== QUAD) { useMeshAttrs(g, geomSrc, mat); meshSide(mat); } // local patch
    this.material = mat;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = sortingOrder(ps.render) + (mat.userData.order - 3000) / 100;
    this.draws = !!drawParticles;
    this.mesh.visible = false;   // drawn while it has particles (update)
    (this.world ? root : node).add(this.mesh);
    // (2026-10-27, effect bundle V) a mesh renderer's further meshes (m_Mesh1..3, `meshes`): each particle draws one of the
    // set ones, picked at birth uniformly (official engine: GetMeshCount counts the set slots, CalculateRandomMeshIndex takes
    // the particle's random modulo that count) — an instanced mesh per shape under the first, rows split by `mi`
    /** @type {MoreMesh[]} */
    this.more = [];
    if (geomSrc !== QUAD) {
      for (const k of ps.render.meshes || []) {
        const src = def.geoms[k];
        if (!src) continue;
        const { g: g2, ib: ib2 } = instanced(src, room);
        useMeshAttrs(g2, src, mat);
        const m2 = new THREE.Mesh(g2, mat);
        m2.frustumCulled = false;
        m2.renderOrder = this.mesh.renderOrder;
        this.mesh.add(m2);
        this.more.push({ mesh: m2, g: g2, ib: ib2, src });
      }
      // a shared material with vertex colours from one shape: the others draw theirs white
      if (mat.uniforms.uVCol.value) for (const [gg, src] of [[g, geomSrc], ...this.more.map((m) => [m.g, m.src])]) if (!gg.getAttribute('vcol')) gg.setAttribute('vcol', whiteVcol(src));
    }
    this.mi = this.more.length ? new Uint8Array(room) : null;
    // (2026-10-27, effect bundle V) the renderer's sort mode (`sortMode`: 1 distance, 2 oldest in front, 3 youngest in front,
    // 4 depth) — the camera as last drawn, in the particles' frame (orderRows)
    this.sortMode = drawParticles ? ps.render.sortMode || 0 : 0;
    if (this.sortMode) {
      this.camP = /** @type {THREE.Vector3 | null} */ (null); this.camF = new THREE.Vector3(); this.sortKey = new Float32Array(room); this.sortIdx = /** @type {number[]} */ ([]); this.rowTmp = /** @type {Float32Array | null} */ (null);
      this.mesh.onBeforeRender = /** @param {unknown} r @param {unknown} sc @param {THREE.PerspectiveCamera} camera */ (r, sc, camera) => {
        sortM.copy(this.mesh.matrixWorld).invert();
        (this.camP ||= new THREE.Vector3()).setFromMatrixPosition(camera.matrixWorld).applyMatrix4(sortM);
        camera.getWorldDirection(this.camF).transformDirection(sortM);
      };
    }
    this.cmap = customMap(ps.render);
    this.flipK = ps.render.flip?.some((v) => v) ? ps.render.flip : null;
    // particle trails (TrailModule): a position history per particle (mode 0) or one ribbon through them (mode 1)
    const tm = ps.mods.trail;
    if (tm && typeof tm === 'object' && ps.render.trailMat && def.materials[ps.render.trailMat]) {
      this.tm = tm;
      // the points a trail holds: its whole life at 60 records a second (the official client's store has no limit, it
      // doubles). Past that it keeps every other point (updateTrails), so a long or fast-recording trail keeps its length
      this.histK = tm.mode === 1 ? 0 : Math.min(TRAIL_KEEP, Math.ceil(mmMax(ps.life) * mmMax(tm.life) * 60) + 2);
      this.hist = new Float32Array(room * this.histK * 4);  // x, y, z, age at record
      this.histN = new Uint8Array(room);
      const cap = Math.min(PTRAIL_CAP, tm.mode === 1 ? max + 1 : max * (this.histK + 1));
      this.trailBatch = new StripBatch(makeMaterial(def.materials[ps.render.trailMat], def.lib), cap);
      this.trailBatch.mesh.renderOrder = this.mesh.renderOrder;
      // (official client) the trail's worldSpace reaches the per-particle trails only: a ribbon runs through the particles where they are
      this.trailWorld = !this.world && !!tm.world && tm.mode !== 1;   // its points go to the root's frame as they are recorded
      (this.world || this.trailWorld ? root : node).add(this.trailBatch.mesh);
      /** @type {number[]} */
      this.order = [];                                          // ribbon order, reused
      /** @type {(x: number, y: number) => number} */
      this.olderFirst = (x, y) => this.age[y] - this.age[x];
      // (2026-10-27, effect bundle V) dieWithParticles off: a dead particle's trail stays until its points expire (ghosts);
      // splitSubEmitterRibbons: a sub emitter's ribbon per parent particle (par = the parent's uid)
      /** @type {Ghost[] | null} */
      this.ghosts = tm.mode !== 1 && tm.die === false ? [] : null;
      if (tm.mode === 1 && tm.split) { this.par = new Float64Array(room); this.byParent = /** @type {(x: number, y: number) => number} */ ((x, y) => /** @type {Float64Array} */ (this.par)[x] - /** @type {Float64Array} */ (this.par)[y] || this.age[y] - this.age[x]); }
    }
    this.uid = new Float64Array(room); this.uidN = 0;            // each particle's id (a sub emitter's ribbons split by it)
    this.listed = true;                                         // counted in liveParticles until dispose
    systems.add(this);
  }

  /**
   * @this {ParticleSystemLinks}
   * @returns {boolean}
   */
  get alive() {
    if (this.ghosts?.length) return true;
    if (this.subOf) return this.n > 0 || this.subOf.alive;   // a sub emitter lives on its parent's particles
    return this.n > 0 || (!this.stopped && (this.ps.loop || this.time < this.ps.dur));
  }

  /**
   * (2026-10-14) Sub emitters of type Birth (`list`: { e: { node, props, p }, sys }): each target stops emitting on its own and
   * instead runs its emission module per particle of this system — its rate over time and its bursts on that particle's
   * age (the target's own duration; looping or not, as the target), at the particle's position (+ the target's shape),
   * each emission kept with probability `p`. `props` inherits from the particle: 1 colour (× its current colour), 2 size
   * (× its current size), 4 rotation (+ its rotation), 8 lifetime (× its remaining fraction) [ASSUMED: Unity's inherit
   * lifetime by the remaining fraction]. [ASSUMED: the target's start values are evaluated at that age over its duration]
   * @param {SubLink[]} list
   */
  setSubs(list) {
    for (const x of list) { x.sys.subOf = this; x.sys.emitAcc = 0; }
    const birth = list.filter((x) => (x.e.type || 0) === 0), hit = list.filter((x) => x.e.type === 1);
    if (birth.length) { this.subs = birth; this.subAcc = new Float32Array(this.room * birth.length); }
    if (hit.length) this.subsHit = hit;
  }

  /**
   * 2026-10-30: room for `need` particles (at most `max`): every per-particle array and instance buffer, the old contents
   * kept (the rows past `n` too, as the arrays held them); the sort scratch is made again at the new size. The new buffers
   * leave Math.random alone (besideRandom).
   * @param {number} need
   */
  grow(need) {
    const room = Math.min(this.max, Math.max(need, this.room * 2));
    /** @type {[string, number][]} */
    const per = [['pos', 3], ['vel', 3], ['age', 1], ['avel', 3], ['life', 1], ['size0', 3], ['rot', 3], ['rotVel', 1], ['col0', 4],
      ['rnd', 4], ['nz', 1], ['mi', 1], ['sortKey', 1], ['hist', (this.histK || 0) * 4], ['histN', 1], ['par', 1], ['uid', 1],
      ['subAcc', this.subs?.length || 0]];
    for (const [k, w] of per) {
      const a = /** @type {Record<string, Float32Array | null | undefined>} */ (/** @type {unknown} */ (this))[k];
      if (!a) continue;
      const b = new (/** @type {new (n: number) => Float32Array} */ (a.constructor))(room * w);
      b.set(a);
      /** @type {Record<string, Float32Array>} */ (/** @type {unknown} */ (this))[k] = b;
    }
    this.rowTmp = this.ageKey = this.ageKeyW = null;
    besideRandom(() => {
      ({ g: this.geometry, ib: this.ib } = regrow(this.mesh, this.geometry, this.ib, this.geomSrc, room));
      for (const m of this.more) ({ g: m.g, ib: m.ib } = regrow(m.mesh, m.g, m.ib, m.src, room));
    });
    this.room = room;
  }

  /**
   * local patch (m_IsActive, maintainer's decision 2026-10-08 「공식과 동일하게」): its GameObject switched off by a clip — Unity clears
   * the system and stops it; switched on again it plays from its start (playOnAwake).
   * @param {boolean} on
   */
  setActive(on) {
    if (on) {
      this.time = -(evalMM(this.ps.delay, 0, Math.random()) || 0);
      this.emitAcc = 0; this.distAcc = 0; this.burstDone.fill(0); this.stopped = false; this.cycle = 0;
      this.arcLaps = this.arcLaps0 = this.radLaps = this.radLaps0 = this.nScroll = 0;
      this.warm = !!(this.ps.prewarm && this.ps.loop && this.ps.dur > 0);
    } else { this.stopped = true; while (this.n) this.kill(this.n - 1); }
  }

  /**
   * `count` particles from the shape. `sub` (2026-10-14, a sub emitter's call — setSubs): { at (the parent particle, root
   * frame), t01, col?, size?, rot?, lifeK? } — from that point instead of the node's origin, with the inherited values.
   * `along` (2026-10-26, effect bundle U: emission by distance) the emitter's move this frame in the root frame — a world-space
   * system spreads the particles evenly back along it, from where the emitter was to where it is (official client: the
   * engine starts them through StartParticles at intervals of 1 / count inside the frame); a local-space system's move
   * with the emitter.
   * @param {number} count
   * @param {SubBirth | null} [sub]
   * @param {THREE.Vector3 | null} [along]
   */
  emit(count, sub = null, along = null) {
    const ps = this.ps;
    const room = Math.min(count, this.max - this.n, this.q.budget - liveParticles);
    if (room <= 0) return;
    if (this.n + room > this.room) this.grow(this.n + room);
    if (this.listed) liveParticles += room;
    // world space: the node → root transform, the same for every particle of this call
    if (this.world || sub) {
      if (this.top) this.syncFrame(); else this.node.updateWorldMatrix(true, false);
      this.root.updateWorldMatrix(true, false);
      emitM.copy(this.root.matrixWorld).invert().multiply(this.frame.matrixWorld);
    }
    if (sub) {   // the shape's origin moved to the particle: in the root frame (world) or the node's
      subOff.copy(sub.at);
      if (this.world) subOff.sub(tmpV.setFromMatrixPosition(emitM));
      else subOff.applyMatrix4(tmpM2.copy(emitM).invert());
    }
    for (let k = 0; k < room; k++) {
      const i = this.n++;
      const r = this.rnd;
      for (let j = 0; j < 4; j++) r[i * 4 + j] = Math.random();
      const t01 = sub ? sub.t01 : ps.dur > 0 ? Math.min(1, Math.max(0, this.time / ps.dur)) : 0;
      this.age[i] = 0;
      this.life[i] = Math.max(0.01, evalMM(ps.life, t01, Math.random()) * (sub?.lifeK ?? 1));
      const sp = evalMM(ps.speed, t01, Math.random());
      const s = evalMM(ps.size, t01, Math.random());
      this.size0[i * 3] = s;
      this.size0[i * 3 + 1] = ps.sizeY ? evalMM(ps.sizeY, t01, Math.random()) : s;
      this.size0[i * 3 + 2] = ps.sizeZ ? evalMM(ps.sizeZ, t01, Math.random()) : s;
      // (2026-10-27, effect bundle V) the renderer's flip: that share of the particles mirrored on each axis (Unity manual)
      if (this.flipK) for (let j = 0; j < 3; j++) if (this.flipK[j] && Math.random() < this.flipK[j]) this.size0[i * 3 + j] = -this.size0[i * 3 + j];
      if (this.mi) this.mi[i] = Math.floor(Math.random() * (this.more.length + 1));
      this.uid[i] = ++this.uidN;
      if (this.par) this.par[i] = sub?.parent ?? 0;
      const flip = Math.random() < (ps.flipRot || 0) ? -1 : 1;
      this.rot[i * 3] = ps.rotX ? evalMM(ps.rotX, t01, Math.random()) : 0;
      this.rot[i * 3 + 1] = ps.rotY ? evalMM(ps.rotY, t01, Math.random()) : 0;
      this.rot[i * 3 + 2] = evalMM(ps.rot, t01, Math.random()) * flip;
      evalMG(ps.color, t01, Math.random(), tmpC);
      if (sub?.col) for (let j = 0; j < 4; j++) tmpC[j] *= sub.col[j];
      this.col0.set(tmpC, i * 4);
      if (sub?.size) for (let j = 0; j < 3; j++) this.size0[i * 3 + j] *= sub.size[j];
      if (sub?.rot != null) this.rot[i * 3 + 2] += sub.rot;
      // position + direction from the shape (local space of the node)
      const p = tmpV.set(0, 0, 0), d = tmpV2.set(0, 0, 1);
      shapeCtx.k = k; shapeCtx.count = room; shapeCtx.time = Math.max(0, this.time); shapeCtx.t01 = t01;
      // the Loop clocks inside the frame: the k-th of this call between this step's laps (k 0) and the last step's
      const f = room > 1 ? k / room : 0;
      shapeCtx.arcLaps = this.arcLaps + (this.arcLaps0 - this.arcLaps) * f; shapeCtx.radLaps = this.radLaps + (this.radLaps0 - this.radLaps) * f;
      shapeSample(ps.shape, p, d, this.meshShape, shapeCtx);
      if (this.meshShape?.C) for (let j = 0; j < 4; j++) this.col0[i * 4 + j] *= this.meshShape.c[j];
      if (this.shapeK) p.multiply(this.shapeK);   // Shape scaling: the scale reaches the start position only
      if (this.world) { p.applyMatrix4(emitM); d.transformDirection(emitM); }
      if (sub) p.add(subOff);
      if (along && this.world) p.addScaledVector(along, -(room - 1 - k) / room);
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      if (this.histN) this.histN[i] = 0;
      this.vel[i * 3] = d.x * sp; this.vel[i * 3 + 1] = d.y * sp; this.vel[i * 3 + 2] = d.z * sp;
      this.avel[i * 3] = this.avel[i * 3 + 1] = this.avel[i * 3 + 2] = 0;
      if (this.inherit) {
        const k = evalMM(this.inherit, t01, Math.random()), v = this.emitV;
        this.vel[i * 3] += v.x * k; this.vel[i * 3 + 1] += v.y * k; this.vel[i * 3 + 2] += v.z * k;
      }
    }
  }

  /**
   * (2026-10-23, official client) the emission factors: the prefab's FxLODSetting percentage of this system at quality
   * 'medium' (`ApplyLowDetailPS`: the rate and every burst count × `_detailPercentage`), else the quality's — a burst at
   * 0 s whole.
   */
  rateK() { return this.lod ?? this.q.emission; }
  /** @param {number} t */
  burstK(t) { return this.lod ?? Math.max(this.q.emission, t === 0 ? 1 : 0); }

  /**
   * 2026-10-22: where a clip writes the value at `keys` (PS_ANIM) — [object, key], each object on the way this system's own
   * copy (the extracted definition is shared by every instance); null when the system has no such module.
   * @param {(string | number)[] | undefined} keys
   * @returns {[Bag, string | number] | null}
   */
  animPath(keys) {
    if (!keys) return null;
    const own = this.own || (this.own = new Set());
    let o = /** @type {Bag} */ (/** @type {unknown} */ (this)), /** @type {string | number} */ k = 'ps';
    for (const key of keys) {
      let v = o[k];
      if (!v || typeof v !== 'object') return null;
      if (!own.has(v)) { v = Array.isArray(v) ? v.slice() : { ...v }; o[k] = v; own.add(v); }
      o = /** @type {Bag} */ (v); k = key;
    }
    if (this.tm) this.tm = this.ps.mods.trail;   // the trail module it keeps (a TrailModule colour copied above)
    return [o, k];
  }

  /**
   * 2026-10-22 (InheritVelocity): the emitter's velocity since the last frame, in the root frame where a world-space system
   * keeps its particles (Unity: the Transform's world velocity) — the root's own move counts (a flying projectile).
   * @param {number} dt
   */
  emitterVelocity(dt) {
    this.node.updateWorldMatrix(true, false);
    const p = tmpV.setFromMatrixPosition(this.node.matrixWorld);
    if (this.emitAt && dt > 0) {
      this.emitV.copy(p).sub(this.emitAt).divideScalar(dt);
      this.root.updateWorldMatrix(true, false);
      this.emitV.applyMatrix3(tmpM3.setFromMatrix4(tmpM.copy(this.root.matrixWorld).invert()));
    } else this.emitV.set(0, 0, 0);
    if (this.moved) this.moved.copy(this.emitV).multiplyScalar(dt);   // (2026-10-26) this frame's move, for `dist`
    (this.emitAt ||= new THREE.Vector3()).copy(p);
  }

  /**
   * Particle i's size multipliers (out, x / y / z) at age fraction a: SizeOverLifetime × (2026-10-22) SizeBySpeed — its curve
   * at the speed's place in `range` (Unity: the particle velocity; here the simulated one, without VelocityOverLifetime /
   * noise offsets [ASSUMED] — a system with a velocity limit keeps VelocityOverLifetime in it, see simulate).
   * @param {number} i @param {number} a @param {number} r
   * @param {number[]} out
   */
  sizeOf(i, a, r, out) {
    const m = this.ps.mods;
    out[0] = out[1] = out[2] = 1;
    if (m.sizeOL) { out[0] = evalMM(m.sizeOL.x, a, r); out[1] = m.sizeOL.y ? evalMM(m.sizeOL.y, a, r) : out[0]; out[2] = m.sizeOL.z ? evalMM(m.sizeOL.z, a, r) : out[0]; }
    const sb = m.sizeBySpeed;
    if (sb) {
      const lo = sb.range?.[0] ?? 0, hi = sb.range?.[1] ?? 1;
      // (official client SizeBySpeedModule.Update) the speed of velocity + animated velocity
      const sp = Math.hypot(this.vel[i * 3] + this.avel[i * 3], this.vel[i * 3 + 1] + this.avel[i * 3 + 1], this.vel[i * 3 + 2] + this.avel[i * 3 + 2]);
      const t = hi > lo ? Math.min(1, Math.max(0, (sp - lo) / (hi - lo))) : 0;
      const x = evalMM(sb.x, t, r);
      out[0] *= x; out[1] *= sb.y ? evalMM(sb.y, t, r) : x; out[2] *= sb.z ? evalMM(sb.z, t, r) : x;
    }
    if (this.nz) {   // (2026-10-26, official client NoiseModule.UpdateSize) × max(0, 1 + ½ × amount × noise x × strength)
      const k = Math.max(0, 1 + 0.5 * this.nz[i] * evalMM(/** @type {NoiseModule} */ (m.noise).sizeAmt, a, r));
      out[0] *= k; out[1] *= k; out[2] *= k;
    }
    return out;
  }

  /**
   * (2026-10-26, effect bundle U; official client DragUpdate) the limit module's drag for particle i: the speed it loses a
   * second — drag × the particle's cross-section π (size / 2)² (`multiplyDragByParticleSize`, its largest axis) × its speed²
   * (`…Velocity`); both are on in every extracted system with a drag (the coverage report names one that is off). Before,
   * the player damped the velocity by drag × size × speed.
   * @param {number} i @param {number} a @param {number} drag @param {number} speed
   */
  dragOf(i, a, drag, speed) {
    const sk = this.sizeOf(i, a, this.rnd[i * 4 + 2], sizeK), o = i * 3;
    const r = 0.5 * Math.max(Math.abs(this.size0[o] * sk[0]), Math.abs(this.size0[o + 1] * sk[1]), Math.abs(this.size0[o + 2] * sk[2]));
    return drag * Math.PI * r * r * speed * speed;
  }

  /**
   * (2026-10-26, effect bundle U) the velocity module's orbit (`orbX` / `orbY` / `orbZ`, about the system's own axes) and
   * radial speed (`radial`, away from the centre) round the centre `orbOff` (the system's origin + its offset): the frame
   * they act in this step — null for a local-space system (its particles live in the node's frame), else the node → root
   * matrix of a world-space one.
   */
  orbitFrame() {
    if (!this.world) return orbitLocal;
    if (this.top) this.syncFrame(); else this.node.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, false);
    orbitM.copy(this.root.matrixWorld).invert().multiply(this.frame.matrixWorld);
    return orbitM;
  }

  /**
   * The orbit's centre (particle frame) for a particle at age fraction a.
   * @param {number} a @param {number} r @param {THREE.Matrix4} M
   */
  orbitC(a, r, M) {
    const off = /** @type {VelocityModule} */ (this.ps.mods.velOL).orbOff;
    orbC.set(off ? evalMM(off[0], a, r) : 0, off ? evalMM(off[1], a, r) : 0, off ? evalMM(off[2], a, r) : 0);
    if (M !== orbitLocal) orbC.applyMatrix4(M);
    return orbC;
  }

  /**
   * Particle i turned about the orbit's centre by the orbital velocity × h (official client UpdateOrbitalAndRadialTpl:
   * radians per second, +z turns x toward y as Quaternion.AngleAxis; the turn's move goes in as
   * velocity ÷ the speed modifier, which the step multiplies back — so h carries it). The position turns, its velocity
   * does not. [Several axes at once: the engine composes three axis turns per step, here one turn about their sum —
   * the same to first order in the step]
   * @param {number} i @param {number} a @param {number} r @param {THREE.Matrix4} M @param {number} h
   */
  orbitStep(i, a, r, M, h) {
    const vo = /** @type {VelocityModule} */ (this.ps.mods.velOL);
    orbW.set(vo.orbX ? evalMM(vo.orbX, a, r) : 0, vo.orbY ? evalMM(vo.orbY, a, r) : 0, evalMM(vo.orbZ, a, r) || 0);
    const w = orbW.length();
    if (w < 1e-9) return;
    if (M !== orbitLocal) orbW.transformDirection(M); else orbW.divideScalar(w);
    const c = this.orbitC(a, r, M), o = i * 3;
    orbQ.setFromAxisAngle(orbW, w * h);
    orbP.set(this.pos[o] - c.x, this.pos[o + 1] - c.y, this.pos[o + 2] - c.z).applyQuaternion(orbQ);
    this.pos[o] = c.x + orbP.x; this.pos[o + 1] = c.y + orbP.y; this.pos[o + 2] = c.z + orbP.z;
  }

  /**
   * (2026-10-26; official client NoiseModule.Update) the field's scroll: each step it moves by the scroll speed at the
   * system's time (the curve's upper value) × dt.
   * @param {number} dt
   */
  noiseFrame(dt) {
    const nm = /** @type {NoiseModule} */ (this.ps.mods.noise), dur = this.ps.dur;
    const t01 = dur > 0 ? ((Math.max(0, this.time) % dur) / dur) : 0;
    this.nScroll += (evalMM(nm.scroll, t01, 1) || 0) * dt;
    return true;
  }

  /**
   * (2026-10-26, effect bundle U; official client NoiseModule.CalculateNoiseJob) the noise module for particle i at age
   * fraction a — curl noise: three potentials sampled with their axes turned and the scroll on the third coordinate, the
   * particle's place moved by the system's random offset (`nOff`, 100 × random per axis; the second and third samples add
   * 100 to x), each giving perlinD's x / y derivatives (A, B):
   * R1 = (z, y, x + s), R2 = (x + 100, z, y + s), R3 = (y, x + 100, z + s) → velocity (R3A − R2B, R1A − R3B, R2A − R1B),
   * octaves averaged (perlinOct); × the strength (`strY` / `strZ` per axis when separate; damping divides it by the
   * frequency) × the position amount — a velocity added for this step, not kept. Out: xyz that velocity, w the z noise ×
   * strength (the 2D rotation). [ASSUMED·미조사: the 1D / 2D qualities (Perlin1D / 2D, 62 of the client's systems) as the 3D one]
   * @param {number} i @param {number} a @param {number} r
   * @param {THREE.Vector4} out
   */
  noiseAt(i, a, r, out) {
    const nm = /** @type {NoiseModule} */ (this.ps.mods.noise), f = Math.max(1e-6, nm.freq || 0.5), o = i * 3;
    let s = evalMM(nm.str, a, r);
    let sy = nm.strY ? evalMM(nm.strY, a, r) : s, sz = nm.strZ ? evalMM(nm.strZ, a, r) : s;
    if (nm.damping) { s /= f; sy /= f; sz /= f; }
    const pa = nm.posAmt ? evalMM(nm.posAmt, a, r) : 1;
    const x = this.pos[o] + /** @type {number[]} */ (this.nOff)[0], y = this.pos[o + 1] + /** @type {number[]} */ (this.nOff)[1], z = this.pos[o + 2] + /** @type {number[]} */ (this.nOff)[2], sc = this.nScroll;
    const oct = nm.oct || 1, om = nm.octMul ?? 0.5, os = nm.octScale ?? 2;
    // (official client: the jobs of each quality) the same three points; the scroll runs along the last axis the quality reads
    const q = nm.qual ?? 2, s0 = q === 0 ? sc : 0, s1 = q === 1 ? sc : 0, s2 = q === 2 ? sc : 0, pn = q === 0 ? perlin1 : q === 1 ? perlin2 : perlinD;
    let d = perlinOct(z + s0, y + s1, x + s2, f, oct, om, os, pn); const a1 = d[0], b1 = d[1];
    d = perlinOct(x + 100 + s0, z + s1, y + s2, f, oct, om, os, pn); const a2 = d[0], b2 = d[1];
    d = perlinOct(y + s0, x + 100 + s1, z + s2, f, oct, om, os, pn); const a3 = d[0], b3 = d[1];
    const nx = (a3 - b2) * s, ny = (a1 - b3) * sy, nz = (a2 - b1) * sz;
    out.set(nx * pa, ny * pa, nz * pa, nz);
    if (this.nz) this.nz[i] = nx;
    return out;
  }

  /**
   * 2026-10-22 (CollisionModule, type 0 Planes): each plane node's point and normal (its local +y, Unity's plane up) in the
   * frame the particles live in, 6 floats a plane; null without planes.
   */
  planeFrames() {
    if (!this.planes.length) return null;
    const P = this.planeAt || (this.planeAt = new Float32Array(this.planes.length * 6));
    const frame = this.world ? this.root : this.frame;
    frame.updateWorldMatrix(true, false);
    tmpM2.copy(frame.matrixWorld).invert();
    this.planes.forEach((o, k) => {
      o.updateWorldMatrix(true, false);
      tmpM.multiplyMatrices(tmpM2, o.matrixWorld);
      tmpV.setFromMatrixPosition(tmpM);
      tmpV2.set(0, 1, 0).applyMatrix3(tmpM3.setFromMatrix4(tmpM)).normalize();
      P[k * 6] = tmpV.x; P[k * 6 + 1] = tmpV.y; P[k * 6 + 2] = tmpV.z; P[k * 6 + 3] = tmpV2.x; P[k * 6 + 4] = tmpV2.y; P[k * 6 + 5] = tmpV2.z;
    });
    return P;
  }

  /**
   * CollisionModule, type 0 Planes (official client: PlaneCollision, PerformPlaneCollisions): particle i against the planes P,
   * the first one it is within reach of. Its velocity here is the particle's + the animated one × the speed modifier (sm); the
   * radius is its size × `radius` × ½ (the largest axis of a 3D size). No side and no direction count: a particle behind a plane
   * or moving away from it collides too, unless it moves along the plane. The hit is where its line meets the surface; what lies
   * past the hit and the velocity are reflected, × (1 − `dampen`), then their normal part keeps only `bounce` of itself. The
   * particle's velocity takes the result less the animated velocity. `lifeLoss` of its lifetime goes, and it dies by the speed
   * it came in with (below `minKill`, above `maxKill`). The three curves are read at time 0, not at the particle's age.
   * Returns false when it died.
   * @param {number} i @param {number} a @param {Float32Array} P @param {number} sm
   */
  collide(i, a, P, sm) {
    const co = /** @type {CollisionModule} */ (this.ps.mods.collide), pos = this.pos, vel = this.vel, avel = this.avel, o = i * 3;
    const sk = this.sizeOf(i, a, this.rnd[i * 4 + 2], sizeK);
    const rad = 0.5 * (co.radius ?? 1) * Math.max(Math.abs(this.size0[o] * sk[0]), Math.abs(this.size0[o + 1] * sk[1]), Math.abs(this.size0[o + 2] * sk[2]));   // the drawn size
    const vx = (vel[o] + avel[o]) * sm, vy = (vel[o + 1] + avel[o + 1]) * sm, vz = (vel[o + 2] + avel[o + 2]) * sm;
    const sp = Math.hypot(vx, vy, vz);
    if (sp <= 1e-5) return true;
    for (let k = 0; k < P.length; k += 6) {
      const nx = P[k + 3], ny = P[k + 4], nz = P[k + 5];
      const dist = (pos[o] - P[k]) * nx + (pos[o + 1] - P[k + 1]) * ny + (pos[o + 2] - P[k + 2]) * nz;
      if (dist > rad) continue;
      const vn = vx * nx + vy * ny + vz * nz;
      if (Math.abs(vn) < 1e-4 * sp) continue;
      const t = (rad - dist) / vn, hx = pos[o] + vx * t, hy = pos[o + 1] + vy * t, hz = pos[o + 2] + vz * t;
      // w = the velocity reflected × keep, its normal part then × bounce; what lies past the hit (−v t) comes out as −w t
      const keep = 1 - evalMM(co.dampen, 0, Math.random()), bn = vn * ((1 - evalMM(co.bounce, 0, Math.random())) - 2);
      const wx = keep * (vx + nx * bn), wy = keep * (vy + ny * bn), wz = keep * (vz + nz * bn);
      if (this.subsHit) this.emitHitSubs(i, a, hx, hy, hz);
      pos[o] = hx - wx * t; pos[o + 1] = hy - wy * t; pos[o + 2] = hz - wz * t;
      vel[o] = wx / sm - avel[o]; vel[o + 1] = wy / sm - avel[o + 1]; vel[o + 2] = wz / sm - avel[o + 2];
      this.age[i] += evalMM(co.lifeLoss, 0, Math.random()) * this.life[i];
      return !(sp < (co.minKill ?? 0) || sp > (co.maxKill ?? 1e4) || this.age[i] >= this.life[i]);
    }
    return true;
  }

  /**
   * Kill the particles whose life ends within the step `dt` (advance: a full system's room before it emits).
   * @param {number} dt
   */
  reapDue(dt) {
    for (let i = this.n - 1; i >= 0; i--) if (this.age[i] + dt * (1 + 1e-3) >= this.life[i]) this.kill(i);
  }

  /** @param {number} i */
  kill(i) {
    if (this.ghosts && /** @type {Uint8Array} */ (this.histN)[i]) /** @type {ParticleTrails} */ (this).ghost(i);
    const last = --this.n;
    if (this.listed) liveParticles--;
    if (i === last) return;
    this.pos.copyWithin(i * 3, last * 3, last * 3 + 3); this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.avel.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.size0.copyWithin(i * 3, last * 3, last * 3 + 3); this.rot.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.col0.copyWithin(i * 4, last * 4, last * 4 + 4); this.rnd.copyWithin(i * 4, last * 4, last * 4 + 4);
    this.age[i] = this.age[last]; this.life[i] = this.life[last]; this.rotVel[i] = this.rotVel[last];
    if (this.nz) this.nz[i] = this.nz[last];
    if (this.mi) this.mi[i] = this.mi[last];
    this.uid[i] = this.uid[last];
    if (this.par) this.par[i] = this.par[last];
    if (this.subAcc) { const J = /** @type {SubLink[]} */ (this.subs).length; this.subAcc.copyWithin(i * J, last * J, last * J + J); }
    if (this.hist) {
      const K = /** @type {number} */ (this.histK) * 4;
      this.hist.copyWithin(i * K, last * K, last * K + K);
      /** @type {Uint8Array} */ (this.histN)[i] = /** @type {Uint8Array} */ (this.histN)[last];
    }
  }

  /**
   * (2026-10-26) Unity's ParticleSystemScalingMode.Local (fx_extract.py `scaling` 1, the default): a system takes its own
   * node's scale only, never its parents' (Unity manual: "ignores parent scale"). Its particles move to `frame`, a stand-in
   * under `top` (the prefab's frame) with the node's place and turn but the node's own scale, kept in step by syncFrame.
   * FxInstance sets it up for a system under a scaled parent: 酒神 S2's hit wave (phatm2_skill_02_hit_range_01
   * music_wave_*, parent ground_01 z ×2.73) stood 2.7 times taller than the official recording's
   * @param {THREE.Object3D} top
   * @param {boolean} [shape]
   */
  useLocalScale(top, shape = false) {
    // (2026-10-27, effect bundle V) Shape (`scaling` 2, Unity manual: the scale reaches the shape only, not the particles'
    // size or movement): the stand-in has no scale and the node's whole scale up to `top` multiplies the start positions
    if (shape) this.shapeK = new THREE.Vector3(1, 1, 1);
    const f = new THREE.Group();
    f.matrixAutoUpdate = false;
    top.add(f);
    this.frame = f; this.top = top;
    if (!this.world) f.add(this.mesh);
    if (this.trailBatch && !(this.world || this.trailWorld)) f.add(this.trailBatch.mesh);
    this.syncFrame();
  }

  /** The stand-in `frame` to the node's place, turn (its own and its parents' turns) and own scale; shown while the node is. */
  syncFrame() {
    const f = this.frame, top = /** @type {THREE.Object3D} */ (this.top);
    let on = true;
    frameQ.identity();
    for (let o = this.node; o && o !== top; o = o.parent) { frameQ.premultiply(o.quaternion); if (!o.visible) on = false; }
    f.visible = on;
    this.node.updateWorldMatrix(true, false);
    tmpV.setFromMatrixPosition(this.node.matrixWorld).applyMatrix4(tmpM.copy(top.matrixWorld).invert());
    if (this.shapeK) {
      this.shapeK.set(1, 1, 1);
      for (let o = this.node; o && o !== top; o = o.parent) this.shapeK.multiply(o.scale);
    }
    f.matrix.compose(tmpV, frameQ, this.shapeK ? ONE3 : this.node.scale);
    f.matrixWorldNeedsUpdate = true;   // matrixAutoUpdate off: three.js recomputes matrixWorld only when told
    f.updateWorldMatrix(false, false);
  }

  /**
   * @this {ParticleSystemLinks}
   * @param {number} dt @param {number} sinceStart
   */
  update(dt, sinceStart) {
    const ps = this.ps;
    if (this.top) this.syncFrame();
    if (this.inherit || this.moved) this.emitterVelocity(dt);
    dt *= ps.speedMul || 1;
    setTime(this.material, sinceStart);
    if (this.warm && !this.stopped && !this.subOf && this.time + dt >= 0) this.prewarm();
    this.advance(dt, this.moved);
    this.draw(sinceStart);
  }

  /**
   * (2026-10-26, effect bundle U) Unity's prewarm (`prewarm`, looping systems only — all 2045 extracted have no start delay):
   * the system starts as if it had already run for its particles' longest life (official client: Play → Simulate(0) →
   * ComputePrewarmStartParameters, the sub-emitters' lifetimes aside) — here that window in steps of at most 1/30 s (60 at
   * most) before its first frame, ending on a whole cycle. A range, buff or aura was empty at first and filled up over one
   * cycle; the official one is full from the start. 2026-11-04: not one cycle, as the manual says — the 重构体's crystals
   * (rate 0.125 / s, life 8 s, cycle 1 s) each stand from the first frame, not from the eighth second. Trails (TrailModule)
   * start from the particles' places then.
   */
  prewarm() {
    this.warm = false;
    const dur = this.ps.dur, win = Math.max(mmMax(this.ps.life), 1e-3), steps = Math.min(60, Math.max(1, Math.ceil(win * 30))), h = win / steps;
    this.time = (dur - (win % dur)) % dur;
    for (let k = 0; k < steps; k++) this.advance(h, null);
    this.time -= h;   // advance() of this frame adds its own step: the window ends where this frame begins
  }

  /**
   * One step `dt` (system seconds) of emission and motion. `moved` (emission by distance): the emitter's move this frame
   * in the root frame (emitterVelocity), null in prewarm.
   * @this {ParticleSystemLinks}
   * @param {number} dt
   * @param {THREE.Vector3 | null} moved
   */
  advance(dt, moved) {
    const ps = this.ps, m = ps.mods;
    // emission
    const prev = this.time;
    this.time += dt;
    const sh = ps.shape;
    if (sh && (sh.arcSpeed || sh.radSpeed) && this.time >= 0) {   // ShapeModule.Update: the speed at the system's time, max random
      const t01s = ps.dur > 0 ? (this.time % ps.dur) / ps.dur : 0;
      this.arcLaps0 = this.arcLaps; this.radLaps0 = this.radLaps;
      if (sh.arcSpeed) this.arcLaps += evalMM(sh.arcSpeed, t01s, 1) * dt;
      if (sh.radSpeed) this.radLaps += evalMM(sh.radSpeed, t01s, 1) * dt;
    }
    if (!this.stopped && !this.subOf && this.time >= 0) {
      // (2026-10-31, maintainer report 「시빌라이트 에테르나 S3 이펙트가 보였다가 사라지기를 반복」) a full system first lets go
      // of the particles this step ends, then emits: a one-particle plane (cetsyr_skill_03_buff_01's plane_boli_01, max 1,
      // rate 1 / s, life 1 s at simulation speed 0.4) is born again as it dies. Emitting first, the full system dropped that
      // emission and stood empty a whole period (2.5 s there) [추정·엔진: Unity's update order — the dead particles go before
      // the step's emission — is the engine's own]
      if (this.n >= this.max) this.reapDue(dt);
      let t = this.time;
      if (ps.loop && ps.dur > 0 && t >= ps.dur) {
        t %= ps.dur;
        if (t < prev % ps.dur) this.burstDone.fill(0);
      }
      if (t <= ps.dur || ps.loop) {
        const t01 = ps.dur > 0 ? Math.min(1, t / ps.dur) : 0;
        const rate = evalMM(ps.rate, t01, Math.random()) * this.rateK();
        this.emitAcc += rate * dt;
        // (a thousandth of a particle short counts as due: the float sums of `emitAcc` and `age` keep a life of whole
        // emission periods on the next emission's step — reapDue)
        const whole = Math.floor(this.emitAcc + 1e-3);
        if (whole > 0) {
          this.emitAcc = Math.max(0, this.emitAcc - whole);
          const n0 = this.n;
          this.emit(whole);
          // each one's age from its own moment in the step (Unity emits at sub-frame times), the newest `emitAcc / rate` old
          // once this step has aged it: a life of the emission period ends at the step of the next emission, not one before
          if (rate > 0) for (let i = n0, j = this.n - n0 - 1; i < this.n; i++, j--) this.age[i] = (this.emitAcc + j) / rate - dt;
        }
        // (2026-10-26, effect bundle U) Unity's rate over distance: particles per unit the emitter moved (root frame = Unity
        // units) — the client's FxLODSetting scales the rate over time and the bursts only (ApplyLowDetailPS), so only the
        // quality's factor here. A system emitting only so (418 of the client's systems: the stars and leaves behind
        // projectiles and dashes) drew nothing before
        if (moved && ps.dist) {
          this.distAcc += evalMM(ps.dist, t01, Math.random()) * moved.length() * this.q.emission;
          const n = Math.floor(this.distAcc);
          if (n > 0) { this.distAcc -= n; this.emit(n, null, moved); }
        }
        const bursts = ps.bursts;
        if (bursts) {
          for (let k = 0; k < bursts.length; k++) {
            const b = bursts[k], cycles = b.cycles || 1;
            while (this.burstDone[k] < cycles && t >= b.t + this.burstDone[k] * (b.interval || 0)) {
              this.burstDone[k]++;
              if (Math.random() <= (b.p ?? 1)) this.emit(Math.max(0, Math.round(evalMM(b.n, 0, Math.random()) * this.burstK(b.t))));
            }
          }
        }
      }
    }
    // simulate
    const grav = evalMM(ps.gravity, 0, 0);
    const velOn = !!m.velOL && m.velOL.on !== 0 && m.velOL.on !== false;
    const orbit = velOn && this.orbit ? this.orbitFrame() : null, vo = /** @type {VelocityModule} */ (m.velOL);
    const nzOn = !!m.noise && this.noiseFrame(dt);
    const P = m.collide ? this.planeFrames() : null;
    if ((this.subs || this.subsHit) && !this.world) {   // the node → root transform for the sub emitters' points
      this.frame.updateWorldMatrix(true, false); this.root.updateWorldMatrix(true, false);
      subM.copy(this.root.matrixWorld).invert().multiply(this.frame.matrixWorld);
    }
    const step = dt;
    for (let i = this.n - 1; i >= 0; i--) {
      // emitted within this step (its sub-frame age below 0 until now): it moves for its part of the step only
      const before = this.age[i], born = before < 0;
      this.age[i] += step;
      const age0 = born ? 0 : before, dt = born ? this.age[i] : step;
      if (this.age[i] >= this.life[i]) { this.kill(i); continue; }
      const a = this.age[i] / this.life[i], r = this.rnd[i * 4];
      let vx = this.vel[i * 3], vy = this.vel[i * 3 + 1], vz = this.vel[i * 3 + 2];
      // (official client: the modules' order before SimulateParticles) the animated velocity of this step — VelocityOverLifetime,
      // orbit, radial, then noise — then gravity / force on the particle's own velocity, then the limit on their sum: it stays
      // under the limit and the particle's own velocity takes the difference (MagnitudeUpdate). 패신저 T2's lightning (start
      // speed 0, 5 u/s over its life, limit 0.7 → 0) flew 1.5–3 tiles off her weapon while the limit only met `vel`
      let ox = 0, oy = 0, oz = 0;
      if (velOn) { ox = evalMM(/** @type {VelocityModule} */ (m.velOL).x, a, r); oy = evalMM(/** @type {VelocityModule} */ (m.velOL).y, a, r); oz = evalMM(/** @type {VelocityModule} */ (m.velOL).z, a, r); }
      // (2026-10-26, effect bundle U; official client SimulateParticles) the velocity module's speed modifier multiplies
      // the particle's velocity and its VelocityOverLifetime / orbit / radial / noise velocity this step
      const sm = this.speedK ? evalMM(vo.speedMul, a, r) : 1;
      if (orbit) {   // radial: away from the orbit's centre, added like VelocityOverLifetime
        const o = i * 3, c = this.orbitC(a, r, orbit);
        const rad = mmOn(vo.radial) ? evalMM(vo.radial, a, r) : 0;
        if (rad) {
          const dx = this.pos[o] - c.x, dy = this.pos[o + 1] - c.y, dz = this.pos[o + 2] - c.z, l = Math.hypot(dx, dy, dz);
          if (l > 1e-6) { ox += dx / l * rad; oy += dy / l * rad; oz += dz / l * rad; }
        }
        // the engine adds the orbit's move ÷ (dt × the speed modifier) to the animated velocity, from the point before the step
        const h = sm * dt;
        if (h) {
          const q0 = this.pos[o], q1 = this.pos[o + 1], q2 = this.pos[o + 2];
          this.orbitStep(i, a, r, orbit, h);
          ox += (this.pos[o] - q0) / h; oy += (this.pos[o + 1] - q1) / h; oz += (this.pos[o + 2] - q2) / h;
          this.pos[o] = q0; this.pos[o + 1] = q1; this.pos[o + 2] = q2;
        }
      }
      if (nzOn) {
        const nv = this.noiseAt(i, a, r, noiseV);
        ox += nv.x; oy += nv.y; oz += nv.z;
      }
      if (grav) { vx += GRAVITY.x * grav * dt; vy += GRAVITY.y * grav * dt; vz += GRAVITY.z * grav * dt; }
      if (m.force) { vx += evalMM(m.force.x, a, r) * dt; vy += evalMM(m.force.y, a, r) * dt; vz += evalMM(m.force.z, a, r) * dt; }
      if (m.limit) {
        // (official client MagnitudeUpdate) over the limit the speed goes toward it by 1 − (1 − dampen)^(30 dt) a step
        let tx = vx + ox, ty = vy + oy, tz = vz + oz;
        const lim = evalMM(m.limit.mag, a, r), sp = Math.hypot(tx, ty, tz);
        if (sp > lim && sp > 0) {
          const k = 1 - Math.pow(1 - Math.min(1, Math.max(0, m.limit.dampen || 0)), 30 * dt), ns = sp + (lim - sp) * k;
          tx *= ns / sp; ty *= ns / sp; tz *= ns / sp;
        }
        const drag = evalMM(m.limit.drag, a, r);
        if (drag) {
          const s0 = Math.hypot(tx, ty, tz);
          if (s0 > 0) { const k = Math.max(0, s0 - this.dragOf(i, a, drag, s0) * dt) / s0; tx *= k; ty *= k; tz *= k; }
        }
        vx = tx - ox; vy = ty - oy; vz = tz - oz;
      }
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      this.pos[i * 3] += (vx + ox) * sm * dt; this.pos[i * 3 + 1] += (vy + oy) * sm * dt; this.pos[i * 3 + 2] += (vz + oz) * sm * dt;
      this.avel[i * 3] = ox; this.avel[i * 3 + 1] = oy; this.avel[i * 3 + 2] = oz;
      if (P && !this.collide(i, a, P, sm)) { this.kill(i); continue; }
      if (m.rotOL) {
        this.rot[i * 3 + 2] += evalMM(m.rotOL.z, a, r) * dt;
        // 2026-10-22: a separate-axes module turns a mesh particle about x / y too (Unity adds angularVelocity3D to each
        // euler of rotation3D) — common_ignite_attack's swirl bands tumble open from edge-on into arcs
        if (m.rotOL.x) this.rot[i * 3] += evalMM(m.rotOL.x, a, r) * dt;
        if (m.rotOL.y) this.rot[i * 3 + 1] += evalMM(m.rotOL.y, a, r) * dt;
      }
      // 2026-11-16 (RotationBySpeedModule, fx_extract.py `rotBySpeed`): the angular velocity at the speed's place in its range
      // (the speed as size by speed reads it), added to the one over lifetime
      const rb = m.rotBySpeed;
      if (rb) {
        const lo = rb.range?.[0] ?? 0, hi = rb.range?.[1] ?? 1;
        const sp = Math.hypot(vx + ox, vy + oy, vz + oz);
        const t = hi > lo ? Math.min(1, Math.max(0, (sp - lo) / (hi - lo))) : 0;
        this.rot[i * 3 + 2] += evalMM(rb.z, t, r) * dt;
        if (rb.x) this.rot[i * 3] += evalMM(rb.x, t, r) * dt;
        if (rb.y) this.rot[i * 3 + 1] += evalMM(rb.y, t, r) * dt;
      }
      // (official client) the noise turns it by noise z × strength × the rotation amount × dt × π / 360
      if (nzOn && /** @type {NoiseModule} */ (m.noise).rotAmt) this.rot[i * 3 + 2] += noiseV.w * evalMM(/** @type {NoiseModule} */ (m.noise).rotAmt, a, r) * (Math.PI / 360) * dt;
      if (this.subs) /** @type {ParticleSubs} */ (this).emitSubs(i, age0, this.age[i], dt);
    }
  }

  /**
   * The particles' instance data and trails for this frame (sinceStart: the branch's time, for the trails' ages).
   * @param {number} sinceStart
   */
  draw(sinceStart) {
    const m = this.ps.mods;
    if (this.velAlign && this.n) this.velFrame();
    if ((this.scalePath || this.rootTurn || this.sysLocal) && this.n) this.sysScale();
    // instance data, uploaded by the used range in one call
    const n = this.n, D = this.ib.array, rotSign = this.meshRotSign;
    // (load study F) no size module: sizeOf's multipliers are 1, 1, 1 — not asked per particle
    const sized = !!(m.sizeOL || m.sizeBySpeed || this.nz);
    for (let i = 0; i < n; i++) {
      const a = this.age[i] / this.life[i], r = this.rnd[i * 4 + 2], o = i * IV;
      D[o + IV_POS] = this.pos[i * 3]; D[o + IV_POS + 1] = this.pos[i * 3 + 1]; D[o + IV_POS + 2] = this.pos[i * 3 + 2];
      D[o + IV_VEL] = this.vel[i * 3] + this.avel[i * 3]; D[o + IV_VEL + 1] = this.vel[i * 3 + 1] + this.avel[i * 3 + 1];
      D[o + IV_VEL + 2] = this.vel[i * 3 + 2] + this.avel[i * 3 + 2];
      const sk = sized ? this.sizeOf(i, a, r, sizeK) : SIZE_ONE;
      D[o + IV_SIZE] = this.size0[i * 3] * sk[0]; D[o + IV_SIZE + 1] = this.size0[i * 3 + 1] * sk[1]; D[o + IV_SIZE + 2] = this.size0[i * 3 + 2] * sk[2];
      D[o + IV_ROT] = this.rot[i * 3] * rotSign; D[o + IV_ROT + 1] = this.rot[i * 3 + 1] * rotSign; D[o + IV_ROT + 2] = this.rot[i * 3 + 2] * rotSign;
      for (let k = 0; k < 4; k++) D[o + IV_COL + k] = this.col0[i * 4 + k];
      if (m.colorOL) { evalMG(m.colorOL, a, this.rnd[i * 4 + 3], tmpC2); for (let k = 0; k < 4; k++) D[o + IV_COL + k] *= tmpC2[k]; }
      const cd = m.custom;
      for (let s2 = 0; s2 < 2; s2++) {
        const c = o + (s2 ? IV_C2 : IV_C1), e = cd?.[s2];
        for (let k = 0; k < 4; k++) D[c + k] = e?.v?.[k] ? evalMM(e.v[k], a, r) : 0;
        if (e?.col) { evalMG(e.col, a, r, tmpC2); for (let k = 0; k < 4; k++) D[c + k] = tmpC2[k]; }
      }
      if (cd && this.cmap) {
        for (let k = 0; k < 8; k++) tmpCD[k] = D[o + IV_C1 + k];
        for (let k = 0; k < 8; k++) D[o + IV_C1 + k] = this.cmap[k] < 0 ? 0 : tmpCD[this.cmap[k]];
      }
      if (m.uv) {
        const tx = m.uv.tx || 1, ty = m.uv.ty || 1, frames = m.uv.anim === 1 ? tx : tx * ty;
        // (official client UVModule, timeMode 0 Lifetime: the extractor stops on another) frac(frame + start) of the sheet:
        // `start` is a share of the sheet (0.25 of 4 is frame 1), not a frame number; a constant frame with a constant start
        // is frac(cycles × frame + start) — the client's 0.999999 is only in timeMode 1 Speed — and a curve frame reads the
        // curve at frac(max(age, 0) × cycles), no 0.999999 either (official client: the Lifetime sheet templates, every frame
        // mode; at a whole age × cycles the curve is read at 0). Each draws its own random: not the size's, nor each other's
        const uvr = this.rnd[i * 4 + 1], fm = m.uv.frame, cyc = m.uv.cycles || 1;
        const fv = fm?.m === 0 && m.uv.start?.m === 0 ? fm.s * cyc : evalMM(fm, (Math.max(a, 0) * cyc) % 1, (uvr * 37.3) % 1);
        // (official client, the billboard geometry) the cell is ⌊ratio × tx × ty⌋ with no clamp, its row ⌊cell / tx⌋, its column
        // the rest; a single-row sheet's ratio is (row + frac) / ty, so its cell is row × tx + ⌊frac × tx⌋ — taken in whole
        // numbers here (that product in doubles can land a hair under a row's first cell). The row (2026-10-27, effect bundle V):
        // `row` clamped to the sheet (rowMode 0 Custom) or one at random per particle (1 Random)
        const ut = fv + evalMM(m.uv.start, 0, (uvr * 61.7) % 1), k = Math.floor((ut - Math.floor(ut)) * frames);
        const f = m.uv.anim !== 1 ? k : k + tx * (m.uv.rowMode === 1 ? Math.min(ty - 1, Math.floor(this.rnd[i * 4 + 1] * ty))
          : Math.max(0, Math.min(ty - 1, m.uv.row || 0)));
        const col = f % tx, row = Math.floor(f / tx);
        D[o + IV_UV] = col / tx; D[o + IV_UV + 1] = 1 - (row + 1) / ty; D[o + IV_UV + 2] = 1 / tx; D[o + IV_UV + 3] = 1 / ty;
      } else { D[o + IV_UV] = 0; D[o + IV_UV + 1] = 0; D[o + IV_UV + 2] = 1; D[o + IV_UV + 3] = 1; }
    }
    this.mesh.visible = this.draws && n > 0;
    if (this.trailBatch) /** @type {ParticleTrails} */ (this).updateTrails(sinceStart);   // they read the rows by particle: before the order below
    let n0 = n;
    if (this.mi || (this.sortMode && n > 1)) n0 = this.orderRows(n);
    if (n0) { this.ib.clearUpdateRanges(); this.ib.addUpdateRange(0, n0 * IV); this.ib.needsUpdate = true; }
    this.geometry.instanceCount = n0;
  }

  /**
   * (2026-10-27, effect bundle V) The rows of this frame in drawing order, split by mesh (`mi`) → the first mesh's row count.
   * Sort modes (official engine ParticleSystemRenderer::Sort): 1 the squared distance to the camera, 4 the depth along it,
   * 2 / 3 the key max(0, 100 − remaining life) / start life, greater first for 1 2 4 and less first for 3; the engine's
   * first is the nearest (1, 4), so its first is the one in front and is drawn last here — far to near, the oldest (2) /
   * youngest (3) last. [추정·엔진: the geometry job drawing the sorted rows from the last — read from the distance modes]
   * @param {number} n
   */
  orderRows(n) {
    const D = this.ib.array, mode = this.sortMode;
    /** @type {number[] | null} */
    let idx = null;
    if (mode && (mode === 2 || mode === 3 || this.camP)) {
      const K = /** @type {Float32Array} */ (this.sortKey), P = this.pos, c = /** @type {THREE.Vector3} */ (this.camP), F = /** @type {THREE.Vector3} */ (this.camF);
      idx = /** @type {number[]} */ (this.sortIdx);
      idx.length = n;
      for (let i = 0; i < n; i++) {
        idx[i] = i;
        // (official engine Sort) 2 / 3: max(0, 100 − its age fraction) × its start lifetime — the longer-lived behind, then by age
        if (mode === 2 || mode === 3) K[i] = Math.max(0, 100 - this.age[i] / this.life[i]) * this.life[i];
        else {
          const dx = P[i * 3] - c.x, dy = P[i * 3 + 1] - c.y, dz = P[i * 3 + 2] - c.z;
          K[i] = mode === 4 ? dx * F.x + dy * F.y + dz * F.z : dx * dx + dy * dy + dz * dz;
        }
      }
      // drawn first = the engine's first row: the farthest (1, 4), the largest key (2: the youngest), the smallest (3: the oldest)
      idx.sort(mode === 3 ? (x, y) => K[x] - K[y] : (x, y) => K[y] - K[x]);
    }
    const T = this.rowTmp || (this.rowTmp = new Float32Array(this.room * IV));
    T.set(D.subarray(0, n * IV));
    /** @type {(buf: Float32Array, b: number) => number} */
    const fill = (buf, b) => {
      let w = 0;
      for (let k = 0; k < n; k++) {
        const i = idx ? idx[k] : k;
        if (this.mi && this.mi[i] !== b) continue;
        buf.set(T.subarray(i * IV, i * IV + IV), w * IV);
        w++;
      }
      return w;
    };
    const n0 = fill(D, 0);
    this.more.forEach((m, k) => {
      const w = fill(m.ib.array, k + 1);
      if (w) { m.ib.clearUpdateRanges(); m.ib.addUpdateRange(0, w * IV); m.ib.needsUpdate = true; }
      m.g.instanceCount = w;
    });
    return n0;
  }

  /**
   * (2026-10-27) The Velocity quad's frame uniforms: the Unity world's x in the scene (its fallback x axis), the scene's
   * handedness against the Unity frame (FxInstance's object without the z flip of `unity`), and for a world-space system
   * the facing mirror that `unity` puts on its particles (the engine's world-space particles carry none).
   */
  velFrame() {
    const obj = this.root.parent || this.root, u = this.material.uniforms;
    obj.updateWorldMatrix(true, false);
    const e = obj.matrixWorld.elements;
    u.uUX.value.copy(velAx.set(e[0], e[1], e[2]).normalize());
    u.uHand.value = obj.matrixWorld.determinant() < 0 ? 1 : -1;
    u.uWSign.value = this.world && this.root.scale.x < 0 ? -1 : 1;
  }

  /**
   * (2026-11-04, official engine: the geometry job's billboard dispatchers) the system's transform scale S on its quads —
   * a View quad's camera axes are multiplied per Unity world axis by S (diag(S) · the camera basis), a stretched one's width
   * the same way and its lengthScale by S.x (its velocityScale and the size not), a Velocity quad's turned corner per axis of
   * its frame, a World / Local-aligned quad's basis by S. S = the product of `scalePath`'s scales (FxInstance: Hierarchy its
   * node's and parents', Local its own), per axis and without sign [추정·엔진: whether the job's scale keeps the sign of a
   * mirrored transform — unread; the facing mirror stays off the quads as before]. Sent only when it changes.
   */
  sysScale() {
    let x = 1, y = 1, z = 1;
    if (this.scalePath) for (const o of this.scalePath) { x *= Math.abs(o.scale.x); y *= Math.abs(o.scale.y); z *= Math.abs(o.scale.z); }
    const u = this.material.uniforms, M = u.uSys.value.elements, S = (this.sysS ||= new THREE.Vector3(NaN, 0, 0));
    if (S.x !== x || S.y !== y || S.z !== z) {
      S.set(x, y, z);
      M[12] = x; M[13] = y; M[14] = z;
      u.uSysOn.value = Math.abs(x - 1) > 1e-4 || Math.abs(y - 1) > 1e-4 || Math.abs(z - 1) > 1e-4;
    }
    if (this.sysLocal) {   // the node's turn in the root's frame: the transforms' rotations alone, whatever their scales
      frameQ.identity();
      for (let o = this.node; o && o !== this.root; o = o.parent) frameQ.premultiply(o.quaternion);
      const R = tmpM.makeRotationFromQuaternion(frameQ).elements;
      for (let c = 0; c < 3; c++) { M[c * 4] = R[c * 4]; M[c * 4 + 1] = R[c * 4 + 1]; M[c * 4 + 2] = R[c * 4 + 2]; }
      return;
    }
    if (!u.uSysOn.value && !this.rootTurn) return;
    // the root's turn, Unity frame → scene (its columns without their length; the facing mirror keeps its sign)
    this.root.updateWorldMatrix(true, false);
    const e = this.root.matrixWorld.elements;
    for (let c = 0; c < 3; c++) {
      const l = Math.hypot(e[c * 4], e[c * 4 + 1], e[c * 4 + 2]) || 1;
      M[c * 4] = e[c * 4] / l; M[c * 4 + 1] = e[c * 4 + 1] / l; M[c * 4 + 2] = e[c * 4 + 2] / l;
    }
  }

  /**
   * (2026-11-16, fx-C) setSubs's Collision sub emitters (type 1): particle i (age fraction a) hit a plane at (x, y, z) (collide;
   * this system's frame): each one emits there once — its bursts' counts [추정·엔진: a triggered sub emitter emits the sum of its
   * bursts and not its rate over time; every such target of the extracted prefabs has one burst at 0 and no rate], kept with
   * probability `p`, inheriting as emitSubs. 아이린 S3's range_02: the stars and sparks where the shots meet the ground.
   * @param {number} i @param {number} a @param {number} x @param {number} y @param {number} z
   */
  emitHitSubs(i, a, x, y, z) {
    const at = subAt.set(x, y, z);
    if (!this.world) at.applyMatrix4(subM);
    for (const { e, sys } of /** @type {SubLink[]} */ (this.subsHit)) {
      let n = 0;
      for (const b of sys.ps.bursts || []) if (Math.random() <= (b.p ?? 1)) n += Math.max(0, Math.round(evalMM(b.n, 0, Math.random()) * sys.burstK(b.t)));
      if (n <= 0 || Math.random() > (e.p ?? 1)) continue;
      const props = e.props || 0;
      let col = null, size = null;
      if (props & 1) {
        col = subCol; for (let k = 0; k < 4; k++) col[k] = this.col0[i * 4 + k];
        if (this.ps.mods.colorOL) { evalMG(this.ps.mods.colorOL, a, this.rnd[i * 4 + 3], tmpC2); for (let k = 0; k < 4; k++) col[k] *= tmpC2[k]; }
      }
      if (props & 2) {
        const sk = this.sizeOf(i, a, this.rnd[i * 4 + 2], sizeK);
        size = subSize; size[0] = this.size0[i * 3] * sk[0]; size[1] = this.size0[i * 3 + 1] * sk[1]; size[2] = this.size0[i * 3 + 2] * sk[2];
      }
      sys.emit(n, { at, t01: 0, col, size, rot: props & 4 ? this.rot[i * 3 + 2] : null, lifeK: props & 8 ? Math.max(0, 1 - a) : 1, parent: this.uid[i] });
    }
  }

  /**
   * setSubs: particle i (age a0 → a1 this frame) runs each sub emitter's emission module.
   * @param {number} i @param {number} a0 @param {number} a1 @param {number} dt
   * @this {ParticleSubs}
   */
  emitSubs(i, a0, a1, dt) {
    const m = this.ps.mods, J = this.subs.length, a = a1 / this.life[i], r = this.rnd[i * 4 + 2];
    let at = null, col = null, size = null;
    for (let j = 0; j < J; j++) {
      const { e, sys } = this.subs[j], tp = sys.ps, dur = tp.dur > 0 ? tp.dur : 1;
      if (!tp.loop && a0 > dur) continue;
      let n = 0;
      const t1 = tp.loop ? a1 % dur : Math.min(a1, dur), t01 = t1 / dur;
      this.subAcc[i * J + j] += evalMM(tp.rate, t01, Math.random()) * sys.rateK() * dt;
      const whole = Math.floor(this.subAcc[i * J + j]);
      if (whole > 0) { this.subAcc[i * J + j] -= whole; n += whole; }
      for (const b of tp.bursts || []) {   // each burst time (and its cycles) in [a0, a1) of the particle's age, per lap when looping
        for (let c = 0; c < (b.cycles || 1); c++) {
          const tb = b.t + c * (b.interval || 0);
          if (tb > dur) break;
          const lap0 = tp.loop ? Math.floor(a0 / dur) : 0, lap1 = tp.loop ? Math.floor(a1 / dur) : 0;
          for (let L = lap0; L <= lap1; L++) {
            const at0 = L * dur + tb;
            if (at0 >= a0 && (at0 < a1 || (a0 === 0 && at0 === 0)) && Math.random() <= (b.p ?? 1)) n += Math.max(0, Math.round(evalMM(b.n, 0, Math.random()) * sys.burstK(tb)));
          }
        }
      }
      if (n <= 0 || Math.random() > (e.p ?? 1)) continue;
      if (!at) {
        at = subAt.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
        if (!this.world) at.applyMatrix4(subM);
      }
      const props = e.props || 0;
      if (props & 1 && !col) {
        col = subCol; for (let k = 0; k < 4; k++) col[k] = this.col0[i * 4 + k];
        if (m.colorOL) { evalMG(m.colorOL, a, this.rnd[i * 4 + 3], tmpC2); for (let k = 0; k < 4; k++) col[k] *= tmpC2[k]; }
      }
      if (props & 2 && !size) {
        const sk = this.sizeOf(i, a, r, sizeK);
        size = subSize; size[0] = this.size0[i * 3] * sk[0]; size[1] = this.size0[i * 3 + 1] * sk[1]; size[2] = this.size0[i * 3 + 2] * sk[2];
      }
      sys.emit(n, { at, t01, col: props & 1 ? col : null, size: props & 2 ? size : null, rot: props & 4 ? this.rot[i * 3 + 2] : null,
        lifeK: props & 8 ? Math.max(0, 1 - a) : 1, parent: this.uid[i] });
    }
  }

  /**
   * (2026-10-28, mobile perf) A ribbon's order without a comparator: the order `order.sort(olderFirst)` gives — oldest first,
   * equal ages in index order (a stable sort of 0..n−1) — from one native sort of doubles: each key is the particle's age (a
   * float32, so its double leaves the low 29 mantissa bits zero) with 2²⁹ − 1 − index in those bits; ascending keys read
   * backwards are age descending, then index ascending. False (nothing written) when an age is negative or not finite, or
   * there are too many particles — the caller sorts as before. The comparator sort was a tenth of the particle update in a
   * scene of ribbons.
   * @param {number[]} order
   * @param {number} n
   */
  ageOrder(order, n) {
    if (n > LOW_MASK) return false;
    const K = /** @type {Float64Array} */ (this.ageKey || (this.ageKey = new Float64Array(this.age.length))), W = /** @type {Uint32Array} */ (this.ageKeyW || (this.ageKeyW = new Uint32Array(K.buffer))), A = this.age;
    for (let i = 0; i < n; i++) {
      const a = A[i];
      if (!(a >= 0 && a < Infinity)) return false;
      K[i] = a;
      W[i * 2 + LO] |= LOW_MASK - i;
    }
    K.subarray(0, n).sort();
    for (let k = 0; k < n; k++) order[k] = LOW_MASK - (W[(n - 1 - k) * 2 + LO] & LOW_MASK);
    return true;
  }

  /**
   * (official client) What the size gives a trail's width: the x of a 2D size, √(x·y) of a 3D one, ∛(x·y·z) when the particle is a mesh.
   * @param {number} x @param {number} y @param {number} z
   */
  trailSize(x, y, z) {
    if (x === y && (y === z || this.ps.render.mode !== 4)) return Math.abs(x);
    return this.ps.render.mode === 4 ? Math.cbrt(Math.abs(x * y * z)) : Math.sqrt(Math.abs(x * y));
  }

  /**
   * (official client, TrailModule::CalculateLifetime) How long a point of particle i's trail lasts: the curve read at the particle's
   * age now — a point's time left changes as the particle ages — × its start lifetime. `sizeAffectsLifetime` is off in every system
   * (fx_coverage), and it would multiply by the size.
   * @param {number} i
   * @this {ParticleTrails}
   */
  trailLife(i) { return evalMM(this.tm.life, Math.min(1, this.age[i] / this.life[i]), this.rnd[i * 4 + 3]) * this.life[i]; }

  /**
   * (official client, ParticleSystemTrailGeometryJob) Along a strip of m points (trailPts, from its first): t, where the width and the
   * colour are read (trailT), and the texture coordinate (trailU), by the module's textureMode: 0 Stretch t = the share of the length
   * walked, once over it; 1 Tile the same t, the texture once per unit from the first point (`tile`: units of length a unit of these
   * points is, the material's tiling scales it); 2 DistributePerSegment t = k / (m − 1), once over it; 3 RepeatPerSegment the same t,
   * once per segment. The first point is the particle in a particle's trail and the oldest particle in a ribbon. Before, t was
   * k / (m − 1) in every mode, so unevenly spaced points (a particle slowing down) put the colours and the width elsewhere.
   * @param {number} m @param {number} tile
   * @this {ParticleTrails}
   */
  trailTex(m, tile) {
    const mode = this.tm.texMode || 0, T = trailT, U = trailU;
    if (mode === 2 || mode === 3) {
      const inv = m > 1 ? 1 / (m - 1) : 0;
      for (let k = 0; k < m; k++) { T[k] = k * inv; U[k] = mode === 3 ? k : T[k]; }
      return;
    }
    const P = trailPts;
    let d = 0;
    T[0] = 0;
    for (let k = 1; k < m; k++) {
      const o = k * 3, dx = P[o] - P[o - 3], dy = P[o + 1] - P[o - 2], dz = P[o + 2] - P[o - 1];
      d += Math.sqrt(dx * dx + dy * dy + dz * dz);
      T[k] = d;
    }
    const inv = 1 / Math.max(d, 1e-6);
    for (let k = 0; k < m; k++) { U[k] = mode === 1 ? T[k] * tile : T[k] * inv; T[k] *= inv; }
  }

  /**
   * A dead particle's trail kept (dieWithParticles off): its points, the particle's age then and its width / colour.
   * @param {number} i
   * @this {ParticleTrails}
   */
  ghost(i) {
    const K = this.histK, cnt = this.histN[i], a = Math.min(1, this.age[i] / this.life[i]);
    const pts = this.hist.slice(i * K * 4, i * K * 4 + cnt * 4);
    const col = new Float32Array(4);
    for (let k = 0; k < 4; k++) col[k] = this.col0[i * 4 + k];
    if (this.ps.mods.colorOL) { evalMG(this.ps.mods.colorOL, a, this.rnd[i * 4 + 3], tmpC2); for (let k = 0; k < 4; k++) col[k] *= tmpC2[k]; }
    const sk = this.sizeOf(i, a, this.rnd[i * 4 + 2], sizeK);
    /** @type {Ghost[]} */ (this.ghosts).push({
      pts, cnt, born: this.time - this.age[i], tl: evalMM(this.tm.life, 1, this.rnd[i * 4 + 3]) * this.life[i],
      r0: this.rnd[i * 4], r1: this.rnd[i * 4 + 1], r2: this.rnd[i * 4 + 2], a, col,
      size: this.trailSize(this.size0[i * 3] * sk[0], this.size0[i * 3 + 1] * sk[1], this.size0[i * 3 + 2] * sk[2]),
    });
  }

  /**
   * The ghosts' strips: their points age on with the system's clock and go once older than the trail's lifetime.
   * @param {number} ts @param {number} tile
   * @this {ParticleTrails}
   */
  ghostTrails(ts, tile) {
    const tm = this.tm, G = /** @type {Ghost[]} */ (this.ghosts);
    for (let j = G.length - 1; j >= 0; j--) {
      const g = G[j], now = this.time - g.born, P = g.pts;
      let drop = 0;
      while (drop < g.cnt && now - P[(drop + 1 < g.cnt ? drop + 1 : drop) * 4 + 3] > g.tl) drop++;
      if (drop >= g.cnt) { G.splice(j, 1); continue; }
      const m = Math.min(g.cnt - drop, TRAIL_PTS);
      for (let k = 0; k < m; k++) {
        const h = (g.cnt - 1 - k) * 4;
        trailPts[k * 3] = P[h]; trailPts[k * 3 + 1] = P[h + 1]; trailPts[k * 3 + 2] = P[h + 2];
      }
      if (m > 1) this.trailTail(m, now - g.tl, P[drop * 4 + 3], P[(drop + 1) * 4 + 3]);
      this.trailTex(m, tile);
      for (let q = 0; q < 4; q++) tmpC2[q] = tm.inherit ? g.col[q] : 1;
      if (tm.colorOL) { evalMG(tm.colorOL, g.a, g.r2, tmpC3); for (let q = 0; q < 4; q++) tmpC2[q] *= tmpC3[q]; }
      for (let k = 0; k < m; k++) {
        const t = trailT[k];
        trailW[k] = (tm.width ? evalMM(tm.width, t, g.r0) : 1) * (tm.sizeWidth ? g.size : 1) * ts;
        evalMG(tm.colorOT, t, g.r1, tmpC);
        for (let q = 0; q < 4; q++) trailC[k * 4 + q] = tmpC[q] * tmpC2[q];
      }
      this.trailBatch.strip(trailPts, m, trailW, trailC, trailU, (tm.sizeWidth ? g.size : 1) * ts);
    }
  }

  /**
   * (official client) The last of the m points slides towards the one before it, to where the trail's lifetime ends between their two
   * times (t0 its own, t1 the next one's): the end of a trail moves on smoothly rather than a point at a time. `at` = now − lifetime.
   * @param {number} m @param {number} at @param {number} t0 @param {number} t1
   */
  trailTail(m, at, t0, t1) {
    const f = t1 > t0 ? Math.min(1, Math.max(0, (at - t0) / (t1 - t0))) : 0, P = trailPts, o = (m - 1) * 3;
    P[o] += (P[o - 3] - P[o]) * f; P[o + 1] += (P[o - 2] - P[o + 1]) * f; P[o + 2] += (P[o - 1] - P[o + 2]) * f;
  }

  /**
   * The trail points kept in the root's frame through `e` (remap): the root moved or turned and a world-space trail stays where it was made (FxInstance.followWorld).
   * @param {ArrayLike<number>} e
   */
  shiftTrails(e) {
    if (!this.tm || this.tm.mode === 1) return;
    const H = /** @type {Float32Array} */ (this.hist), K = /** @type {number} */ (this.histK) * 4;
    for (let i = 0; i < this.n; i++) {
      for (let k = 0, o = i * K; k < /** @type {Uint8Array} */ (this.histN)[i]; k++, o += 4) remap(H, o, e);
    }
    if (this.ghosts) for (const g of this.ghosts) for (let k = 0; k < g.cnt; k++) remap(g.pts, k * 4, e);
  }

  /**
   * The official client's TrailModule::Update (the points) and ParticleSystemTrailGeometryJob (the strips). A trail's points are dropped
   * only once the point after the oldest has expired, and that oldest slides to where the lifetime ends (trailTail); ratio is a choice
   * made once per particle; a point is recorded when the particle has moved more than minVertexDistance. Records come once per drawn
   * frame here rather than once per simulation step.
   * @this {ParticleTrails}
   * @param {number} sinceStart
   */
  updateTrails(sinceStart) {
    const tm = this.tm, K = this.histK, H = this.hist, n = this.n, b = this.trailBatch, D = this.ib.array;
    setTime(b.material, sinceStart);
    b.begin();
    // (official client) the width takes ∛|x·y·z| of the system's transform scale, by its scaling mode (FxInstance: trailPath); length
    // in Tile mode is measured after the transform, so points in a scaled frame count that much more
    let ts = 1;
    if (this.trailPath) {
      let x = 1, y = 1, z = 1;
      for (const o of this.trailPath) { x *= o.scale.x; y *= o.scale.y; z *= o.scale.z; }
      ts = Math.cbrt(Math.abs(x * y * z));
    }
    const tile = this.world || this.trailWorld ? 1 : ts;
    if (tm.mode === 1) {
      // ribbon: the particles from the oldest to the newest (a stable sort, ties keep their index order); split by the
      // parent particle (splitSubEmitterRibbons) — a strip per parent
      const order = this.order;
      order.length = n;
      if (this.par || !this.ageOrder(order, n)) {
        for (let i = 0; i < n; i++) order[i] = i;
        order.sort(this.par ? this.byParent : this.olderFirst);
      }
      trailRoom(n);
      for (let s0 = 0; s0 < n;) {
        let s1 = s0 + 1;
        if (this.par) while (s1 < n && this.par[order[s1]] === this.par[order[s0]]) s1++;
        else s1 = n;
        const m = s1 - s0;
        for (let k = 0; k < m; k++) {
          const i = order[s0 + k];
          trailPts[k * 3] = this.pos[i * 3]; trailPts[k * 3 + 1] = this.pos[i * 3 + 1]; trailPts[k * 3 + 2] = this.pos[i * 3 + 2];
        }
        if (m > 1) {
          this.trailTex(m, tile);
          for (let k = 0; k < m; k++) {
            const i = order[s0 + k], o = i * IV, t = trailT[k];
            trailW[k] = (tm.width ? evalMM(tm.width, t, this.rnd[i * 4]) : 1) * (tm.sizeWidth ? this.trailSize(D[o + IV_SIZE], D[o + IV_SIZE + 1], D[o + IV_SIZE + 2]) : 1) * ts;
            evalMG(tm.colorOT, t, this.rnd[i * 4 + 1], tmpC);
            if (tm.colorOL) { evalMG(tm.colorOL, this.age[i] / this.life[i], this.rnd[i * 4 + 2], tmpC2); for (let q = 0; q < 4; q++) tmpC[q] *= tmpC2[q]; }
            if (tm.inherit) for (let q = 0; q < 4; q++) tmpC[q] *= D[o + IV_COL + q];
            for (let q = 0; q < 4; q++) trailC[k * 4 + q] = tmpC[q];
          }
          // the ribbon's width for the line builder: the width curve's multiplier × the system's scale [추정·엔진: the render
          // job multiplies one more factor in, not read]
          b.strip(trailPts, m, trailW, trailC, trailU, (tm.width ? tm.width.s : 1) * ts);
        }
        s0 = s1;
      }
    } else {
      if (this.trailWorld) {   // the points of a world-space trail over a local simulation: to the root's frame
        this.frame.updateWorldMatrix(true, false); this.root.updateWorldMatrix(true, false);
        trailM.copy(this.root.matrixWorld).invert().multiply(this.frame.matrixWorld);
      }
      const ratio = tm.ratio ?? 1, minD2 = tm.minDist * tm.minDist;
      for (let i = 0; i < n; i++) {
        // (official client) ratio: whether this particle has a trail at all, from a random number of its own
        if (ratio < 1 && !(ratio >= (this.rnd[i * 4 + 3] * 61.7) % 1)) continue;
        const base = i * K * 4, age = this.age[i], tl = this.trailLife(i);
        let cnt = this.histN[i];
        // forget the points older than the trail's lifetime, all but the last one before it
        let drop = 0;
        while (drop < cnt && age - H[base + (drop + 1 < cnt ? drop + 1 : drop) * 4 + 3] > tl) drop++;
        if (drop) { H.copyWithin(base, base + drop * 4, base + cnt * 4); cnt -= drop; }
        let px = this.pos[i * 3], py = this.pos[i * 3 + 1], pz = this.pos[i * 3 + 2];
        if (this.trailWorld) { trailV.set(px, py, pz).applyMatrix4(trailM); px = trailV.x; py = trailV.y; pz = trailV.z; }
        let moved = !cnt;
        if (cnt) {
          const o = base + (cnt - 1) * 4, dx = px - H[o], dy = py - H[o + 1], dz = pz - H[o + 2];
          moved = dx * dx + dy * dy + dz * dz > minD2;
        }
        if (moved) {
          if (cnt === K) {   // full: every other point goes, the oldest stays and its next one keeps its time
            let w = 1;
            for (let r = 2; r < cnt; r += 2, w++) { const f = base + r * 4, t = base + w * 4; H[t] = H[f]; H[t + 1] = H[f + 1]; H[t + 2] = H[f + 2]; H[t + 3] = H[f + 3]; }
            cnt = w;
          }
          const o = base + cnt * 4;
          H[o] = px; H[o + 1] = py; H[o + 2] = pz; H[o + 3] = age;
          cnt++;
        }
        this.histN[i] = cnt;
        if (!cnt) continue;
        // newest first: the particle, then its history
        const m = cnt + 1;
        trailPts[0] = px; trailPts[1] = py; trailPts[2] = pz;
        for (let k = 1; k < m; k++) {
          const h = base + (cnt - k) * 4;
          trailPts[k * 3] = H[h]; trailPts[k * 3 + 1] = H[h + 1]; trailPts[k * 3 + 2] = H[h + 2];
        }
        if (m > 2) this.trailTail(m, age - tl, H[base + 3], H[base + 7]);
        this.trailTex(m, tile);
        // what does not change along the strip, once: the size, the trail's colour by the particle's age, the particle's colour
        const o = i * IV, wk = (tm.sizeWidth ? this.trailSize(D[o + IV_SIZE], D[o + IV_SIZE + 1], D[o + IV_SIZE + 2]) : 1) * ts, r0 = this.rnd[i * 4], r1 = this.rnd[i * 4 + 1];
        for (let q = 0; q < 4; q++) tmpC3[q] = tm.inherit ? D[o + IV_COL + q] : 1;
        if (tm.colorOL) { evalMG(tm.colorOL, age / this.life[i], this.rnd[i * 4 + 2], tmpC2); for (let q = 0; q < 4; q++) tmpC3[q] *= tmpC2[q]; }
        for (let k = 0; k < m; k++) {
          const t = trailT[k];
          trailW[k] = (tm.width ? evalMM(tm.width, t, r0) : 1) * wk;
          evalMG(tm.colorOT, t, r1, tmpC);
          for (let q = 0; q < 4; q++) trailC[k * 4 + q] = tmpC[q] * tmpC3[q];
        }
        b.strip(trailPts, m, trailW, trailC, trailU, wk);
      }
      if (this.ghosts?.length) this.ghostTrails(ts, tile);
    }
    b.end();
  }

  stop() { this.stopped = true; }

  dispose() {
    if (this.listed) { liveParticles -= this.n; this.listed = false; }
    systems.delete(this);
    this.n = 0;
    this.mesh.removeFromParent();
    if (this.top) this.frame.removeFromParent();
    disposeOwn(this.geometry, this.geomSrc);
    for (const m of this.more) disposeOwn(m.g, m.src);
    this.material.dispose();
    this.trailBatch?.dispose();
  }
}

/** ParticleSystem.ageOrder: the low 29 mantissa bits of a double, and which 32-bit half of it holds them on this platform. */
const LOW_MASK = 0x1fffffff, LO = new Uint8Array(new Float64Array([1]).buffer)[7] === 0x3f ? 0 : 1;
const SCALE = new THREE.Vector3(), shapeE = new THREE.Euler(), shapeV = new THREE.Vector3();
/**
 * 2026-10-22: a BoxShell (15) / BoxEdge (16) point from the volume point `p` (box `size`): a shell puts one axis on a face —
 * the face pair chosen by its area —, an edge two axes on an edge, chosen by its length; `thick` (ShapeModule
 * boxThickness, 0..1 per axis) is the share of the half size inward the point may lie (0 = on the surface, 1 = the whole
 * volume). [추정: the choice by area / length — Unity's own sampling is not public; the client's boxes are flat (one size
 * 0), where a shell is the whole rectangle either way and an edge its outline.] A box without area / length keeps `p`.
 * @param {number} type @param {number[]} size @param {unknown} thick @param {THREE.Vector3} p
 */
function boxSurface(type, size, thick, p) {
  const a = size.map(Math.abs), t = Array.isArray(thick) ? thick : [0, 0, 0];
  const w = type === 15 ? [a[1] * a[2], a[0] * a[2], a[0] * a[1]] : a;
  const sum = w[0] + w[1] + w[2];
  if (!(sum > 0)) return;
  let r = Math.random() * sum, k = 0;
  while (k < 2 && r >= w[k]) { r -= w[k]; k++; }
  /** @type {(i: number) => void} */
  const put = (i) => { p.setComponent(i, (Math.random() < 0.5 ? -1 : 1) * (0.5 - Math.random() * 0.5 * Math.min(1, Math.max(0, +t[i] || 0))) * size[i]); };
  if (type === 15) put(k);
  else for (let i = 0; i < 3; i++) if (i !== k) put(i);
}

/**
 * 2026-10-22: a Mesh shape's (6) sampler over geometry `g` (FxLibrary.mesh): placementMode `place` 0 = a vertex, 1 = a
 * point on a triangle's edge (by its length), 2 = a point on a triangle (by its area), at random (m_MeshSpawn mode 0, the
 * client's only one); the direction = the surface normal there (three's from the triangles — the mesh files carry none;
 * their winding gives Unity's side). `meshCol` (m_UseMeshColors) tints the particle by the vertex colours there (a mesh
 * without them: white). Official client: triangles weighted by area, edges (each triangle's three) by length, vertices evenly.
 * @param {PsShape} sh
 * @param {THREE.BufferGeometry | null | undefined} g
 * @returns {MeshShapeData | null}
 */
function meshShape(sh, g) {
  const pos = g?.getAttribute('position'), index = g?.getIndex();
  if (!pos || !index || index.count < 3) return null;
  if (!/** @type {THREE.BufferGeometry} */ (g).getAttribute('normal')) /** @type {THREE.BufferGeometry} */ (g).computeVertexNormals();
  const I = index.array, P = pos.array, N = /** @type {THREE.BufferGeometry} */ (g).getAttribute('normal').array, C = sh.meshCol ? /** @type {THREE.BufferGeometry} */ (g).getAttribute('vcol')?.array || null : null;
  const nt = Math.floor(I.length / 3), place = /** @type {number} */ (sh.place) | 0;
  /** @type {(a: number, b: number) => number} */
  const len = (a, b) => Math.hypot(P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]);
  let cum = null, total = 0;
  if (place === 1 || place === 2) {
    cum = new Float64Array(place === 1 ? nt * 3 : nt);
    for (let t = 0; t < nt; t++) {
      const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
      if (place === 1) { cum[t * 3] = total += len(a, b); cum[t * 3 + 1] = total += len(b, c); cum[t * 3 + 2] = total += len(c, a); }
      else {
        const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
        const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
        cum[t] = total += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      }
    }
    if (!(total > 0)) return null;
  }
  return { place, cum, total, I, P, N, C, nv: pos.count, c: [1, 1, 1, 1] };
}
/**
 * Binary search: the first index of `cum` above r.
 * @param {Float64Array} cum @param {number} r
 */
function cumIndex(cum, r) {
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] > r) hi = m; else lo = m + 1; }
  return lo;
}
/**
 * A point of mesh shape `ms` into p, its normal into d, its vertex colour into ms.c (weights w over vertices a, b, c).
 * @param {MeshShapeData} ms @param {THREE.Vector3} p @param {THREE.Vector3} d
 */
function meshSample(ms, p, d) {
  const rand = Math.random, { I, P, N, C } = ms;
  let a, b = 0, c = 0, wa = 1, wb = 0, wc = 0;
  if (ms.place === 0) a = Math.floor(rand() * ms.nv) % ms.nv;
  else if (ms.place === 1) {
    const e = cumIndex(/** @type {Float64Array} */ (ms.cum), rand() * ms.total), t = (e / 3) | 0, k = e % 3;
    a = I[t * 3 + k]; b = I[t * 3 + (k + 1) % 3];
    wb = rand(); wa = 1 - wb;
  } else {
    const t = cumIndex(/** @type {Float64Array} */ (ms.cum), rand() * ms.total);
    a = I[t * 3]; b = I[t * 3 + 1]; c = I[t * 3 + 2];
    let u = rand(), v = rand();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    wa = 1 - u - v; wb = u; wc = v;
  }
  /** @type {(A: ArrayLike<number>, n: number, j: number) => number} */
  const mix = (A, n, j) => A[a * n + j] * wa + A[b * n + j] * wb + A[c * n + j] * wc;
  p.set(mix(P, 3, 0), mix(P, 3, 1), mix(P, 3, 2));
  d.set(mix(N, 3, 0), mix(N, 3, 1), mix(N, 3, 2));
  if (d.lengthSq() > 1e-12) d.normalize(); else d.set(0, 0, 1);
  if (C) for (let j = 0; j < 4; j++) ms.c[j] = mix(C, 4, j);
}

/**
 * (2026-10-26, effect bundle U; official client — the engine's StartCircle / StartCone… / StartSingleSidedEdge for each mode,
 * ShapeModule.Update) where on the arc or the edge one emission falls, 0…1 of it: mode 0 Random; 1 Loop / 2 PingPong — `laps`
 * is the system's sum of its speed × dt (ShapeModule.Update, the speed curve at the system's time), in whole turns of 360°
 * for an arc (`span` = the arc's degrees: speed 1 is one turn a second whatever the arc, wrapped at the arc's end) and in
 * radii for an edge (`span` 0); PingPong folds every other lap back; 3 BurstSpread — the particles of one emission evenly,
 * k / count round a full circle, k / (count − 1) on a part arc or an edge (both ends); a spread snaps the place down to its
 * steps (spread × the arc / edge) before the wrap. The emissions of one step take laps between this step's (the first)
 * and the last step's (emit: ctx.arcLaps / radLaps).
 * @param {number} mode @param {number} spread @param {number} laps @param {number} span @param {ShapeCtx | null} ctx
 */
function arcPick(mode, spread, laps, span, ctx) {
  let v;
  if (mode === 3 && ctx) v = ctx.k / Math.max(1, span >= 360 ? ctx.count : ctx.count - 1);
  else if ((mode === 1 || mode === 2) && ctx) v = span > 0 ? laps * 360 / span : laps;
  else v = Math.random();
  if (spread > 0) v = Math.floor(v / spread) * spread;
  if (mode === 1) v -= Math.floor(v);
  else if (mode === 2) { v = ((v % 2) + 2) % 2; if (v > 1) v = 2 - v; }
  return Math.min(1, v);
}

/**
 * A random unit vector (the engine's RandomUnitVector — uniform on the sphere).
 * @param {THREE.Vector3} out
 */
function randUnit(out) {
  const z = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - z * z);
  return out.set(s * Math.cos(th), s * Math.sin(th), z);
}

/**
 * @param {PsShape | undefined} sh @param {THREE.Vector3} p @param {THREE.Vector3} d
 * @param {MeshShapeData | null} [ms]
 * @param {ShapeCtx | null} [ctx]
 */
function shapeSample(sh, p, d, ms = null, ctx = null) {
  if (!sh) return;
  const rand = Math.random;
  const arcU = () => (sh.arcMode || sh.arcSpread ? arcPick(sh.arcMode || 0, sh.arcSpread || 0, ctx?.arcLaps || 0, sh.arc ?? 360, ctx) : rand());
  const keep = 1 - (sh.thick ?? 1);
  // (official client StartSphere / StartHemiSphere) the radius at ∛lerp((1 − thickness)³, 1, rand): even over the shell's volume
  const ball = () => (sh.radius || 0) * Math.cbrt(1 + (keep * keep * keep - 1) * rand());
  switch (sh.type) {
    case 0: case 1: { // sphere: round its arc, in its order like a circle's
      const u = rand() * 2 - 1, th = arcU() * (sh.arc ?? 360) * D2R, s = Math.sqrt(1 - u * u);
      d.set(s * Math.cos(th), s * Math.sin(th), u); p.copy(d).multiplyScalar(ball());
      break;
    }
    case 2: case 3: { // hemisphere (+z), the same
      const u = rand(), th = arcU() * (sh.arc ?? 360) * D2R, s = Math.sqrt(1 - u * u);
      d.set(s * Math.cos(th), s * Math.sin(th), u); p.copy(d).multiplyScalar(ball());
      break;
    }
    case 4: case 7: case 8: case 9: { // cone along +z
      // (2026-10-26, official client StartCone / StartConeVolume) the base point at ρ = √lerp(1, max(0.01, 1 − thickness), rand)
      // of the radius (the player had ρ = 1 − thickness × rand, its radius / the radius for the direction); the direction
      // (ρ sin a cos θ, ρ sin a sin θ, cos a) normalised; a cone volume (8, 9) then moves it rand × `length` along that
      // direction (it emitted from its base only — 214 prefabs)
      // (official client) its floor on 1 − thickness is 0.01, where the stock engine has 0.001
      const th = arcU() * (sh.arc ?? 360) * D2R, rho = Math.sqrt(1 + (Math.max(0.01, keep) - 1) * rand());
      const bx = Math.cos(th) * rho, by = Math.sin(th) * rho, ang = (sh.angle || 0) * D2R;
      p.set(bx * (sh.radius || 0), by * (sh.radius || 0), 0);
      d.set(bx * Math.sin(ang), by * Math.sin(ang), Math.cos(ang)).normalize();
      if ((sh.type === 8 || sh.type === 9) && sh.length) p.addScaledVector(d, rand() * sh.length);
      break;
    }
    case 5: case 15: case 16: { // box: +z
      const sx = sh.scale?.[0] ?? 1, sy = sh.scale?.[1] ?? 1, sz = sh.scale?.[2] ?? 1;
      p.set((rand() - 0.5) * sx, (rand() - 0.5) * sy, (rand() - 0.5) * sz);
      if (sh.type !== 5) boxSurface(sh.type, [sx, sy, sz], sh.box, p);
      d.set(0, 0, 1);
      break;
    }
    case 10: case 11: { // circle in XY, outward
      // (official client StartCircle) the radius at lerp(radius, max(0.01, radius × (1 − thickness)), rand): a straight line,
      // so the particles gather toward the middle; the stock engine has √lerp((1 − thickness)², 1, rand), even over the area
      const th = arcU() * (sh.arc ?? 360) * D2R, R = sh.radius || 0;
      d.set(Math.cos(th), Math.sin(th), 0);
      p.copy(d).multiplyScalar(sh.type === 11 ? sh.radius : R + (Math.max(0.01, R * keep) - R) * rand());
      break;
    }
    case 12: { // edge along x, +y (2026-10-26: in order by `radMode` / `radSpread`)
      const u = sh.radMode || sh.radSpread ? arcPick(sh.radMode || 0, sh.radSpread || 0, (ctx?.radLaps || 0) / (sh.radius || 1), 0, ctx) : rand();
      p.set((u * 2 - 1) * (sh.radius || 0), 0, 0); d.set(0, 1, 0);
      break;
    }
    case 17: { // donut: (2026-10-26, effect bundle U; official client StartDonut) its arc and its tube (`donut`, the tube
      // radius × lerp(max(0.01, 1 − thickness), 1, rand)), out from the tube's centre line; before, every particle sat on the centre ring
      const th = arcU() * (sh.arc ?? 360) * D2R, ph = rand() * Math.PI * 2;
      const lo = Math.max(0.01, keep), tr = (sh.donut ?? 0) * (lo + (1 - lo) * rand()), cx = Math.cos(th), cy = Math.sin(th);
      d.set(cx * Math.cos(ph), cy * Math.cos(ph), Math.sin(ph));
      p.set(cx * sh.radius, cy * sh.radius, 0).addScaledVector(d, tr);
      break;
    }
    case 6: // mesh (2026-10-22: meshSample; a mesh that did not load stays a point)
      if (ms) meshSample(ms, p, d);
      break;
    case 18: // rectangle in XY, +z
      p.set((rand() - 0.5) * (sh.scale?.[0] ?? 1), (rand() - 0.5) * (sh.scale?.[1] ?? 1), 0); d.set(0, 0, 1);
      break;
    default: break;
  }
  // (2026-10-26, effect bundle U; official client EmitterStoreData) before the shape's transform: Randomize Direction
  // (toward a random unit vector), then Spherize Direction (toward the untransformed point's outward), then Randomize
  // Position (a random unit vector × the amount — on a sphere, not in a cube); the direction is normalised once after
  if (sh.randDir || sh.sphDir || sh.randPos) {
    d.normalize();
    if (sh.randDir) d.lerp(randUnit(shapeV), sh.randDir);
    if (sh.sphDir && p.lengthSq() > 1e-12) d.lerp(shapeV.copy(p).normalize(), sh.sphDir);
    if (sh.randPos) p.addScaledVector(randUnit(shapeV), sh.randPos);
    d.normalize();
  }
  // the box family (5 Box, 15 BoxShell, 16 BoxEdge) and the rectangle took the scale as their size above — once (user
  // decision 2026-10-08, re-report: BoxShell / BoxEdge were scaled twice — 望 S3's lizi_l lines spread ±2 × ±4.5
  // tiles instead of ±1 × ±1.5; 58 systems of 36 prefabs)
  if (sh.type !== 5 && sh.type !== 15 && sh.type !== 16 && sh.type !== 18 && sh.scale) p.multiply(SCALE.set(sh.scale[0], sh.scale[1], sh.scale[2]));
  if (sh.rotE && (sh.rotE[0] || sh.rotE[1] || sh.rotE[2])) {
    tmpQ.setFromEuler(shapeE.set(sh.rotE[0] * D2R, sh.rotE[1] * D2R, sh.rotE[2] * D2R, 'YXZ'));
    p.applyQuaternion(tmpQ); d.applyQuaternion(tmpQ);
  }
  if (sh.pos) { p.x += sh.pos[0] ?? 0; p.y += sh.pos[1] ?? 0; p.z += sh.pos[2] ?? 0; }
}

// ---------------------------------------------------------------- effect instance

/** @type {FxInstance[]} */
const live = [];
let livePinned = 0;   // the pinned instances of `live` (PINNED_CAP)
/**
 * Clip tracks on material properties: the uniform each drives, and a colour component → vector axis.
 * @type {Readonly<Record<string, string>>}
 */
const CLIP_UNIFORM = { _Amount: 'uAmount', _Opacity: 'uOpacity', _BorderWidth: 'uBorder', _TintColor: 'uTint', _MainColor: 'uTint', _Color: 'uTint',
  // local patch: the … Double dissolve's two amounts / borders
  _Amount_01: 'uAmount', _Amount_02: 'uAmount2', _BorderWidth_01: 'uBorder', _BorderWidth_02: 'uBorder2',
  // local patch: textures' tiling / offset (a line's scrolling dots / flow)
  _MainTex_ST: 'uMainST', _DissolveTex_ST: 'uDissolveST', _DisturbTex_ST: 'uDisturbST', _NoiseTex_ST: 'uDisturbST', _DissolveIntensity: 'uAmount',
  // 2026-10-14: Disturb Origin / Anchor's noise textures and strengths
  _DisturTex_ST: 'uDisturbST', _DisturTex_02_ST: 'uDisturb2ST', _MainColorACtrl: 'uACtrl',
  // 2026-10-14: the tracks no uniform took before — the Double family's second dissolve tiling, Rim's power, Mask's added texture
  _DissolveTex_02_ST: 'uDissolve2ST', _RimPower: 'uRimPower', _AddTex_ST: 'uAddST' };
/**
 * 2026-10-14: float tracks that drive one axis of a vector uniform (Disturb Origin / Anchor's strengths and anchors).
 * @type {Readonly<Record<string, [string, string]>>}
 */
const CLIP_COMP = { _IntensityU: ['uDisturbStr', 'x'], _IntensityV: ['uDisturbStr', 'y'], _AnchorU: ['uDisAnchor', 'x'], _AnchorV: ['uDisAnchor', 'y'],
  _IntensityU_02: ['uDisturb2Str', 'x'], _IntensityV_02: ['uDisturb2Str', 'y'], _AnchorU_02: ['uDisturb2Anchor', 'x'], _AnchorV_02: ['uDisturb2Anchor', 'y'] };
/** local patch: an order-0 mesh at least this tall (tiles, board height) wraps the unit — drawn in front (FxInstance split). */
const WRAP_H = 0.3;
/** local patch: … unless it starts more than this far behind the unit (rows, +y) — it stands behind her, not around her. */
const WRAP_BEHIND = 0.5;
const tmpBox = new THREE.Box3();
/**
 * local patch: whether the order-0 mesh `mesh` wraps the unit at `obj`'s origin (its source geometry's bounds through its
 * node, in `obj`'s space): taller than WRAP_H and reaching the unit's own tile row. 蛇屠箱 / 마터호른 S2's domes do (front,
 * official video); 赤刃明霄陈 S3's dragon head `longtou` lies 0.8–1.6 rows behind her (back — official capture: the dragon
 * is behind her) [추정: the client sorts order 0 by distance; the Spine's own sort point is not known].
 * @param {THREE.Mesh} mesh @param {THREE.Object3D} obj
 */
function wrapsUnit(mesh, obj) {
  const g = mesh.geometry;
  const pos = g.getAttribute('position');
  if (!pos) return false;
  tmpBox.setFromBufferAttribute(pos);
  tmpM.copy(obj.matrixWorld).invert().multiply(mesh.matrixWorld);
  tmpBox.applyMatrix4(tmpM);
  return tmpBox.max.z - tmpBox.min.z > WRAP_H && tmpBox.min.y <= WRAP_BEHIND;
}
/** local patch (FxInstance opts.ahead): rows in front of the unit (−y, nearer the camera) where an order-0 system counts as ahead. */
const AHEAD_Y = 0.1;
/**
 * Whether `node` sits more than AHEAD_Y in front of `obj`'s origin (the unit's feet), in `obj`'s frame.
 * @param {THREE.Object3D} node @param {THREE.Object3D} obj
 */
function aheadOf(node, obj) {
  node.getWorldPosition(tmpV);
  obj.worldToLocal(tmpV);
  return tmpV.y < -AHEAD_Y;
}
/** local patch: three.js layers of a split instance's renderers (FxInstance opts.split) — behind / in front of the units. */
export const FX_BACK = 1, FX_FRONT = 2;
/** @type {Readonly<Record<string, string>>} */
const CLIP_AXIS = { r: 'x', g: 'y', b: 'z', a: 'w', x: 'x', y: 'y', z: 'z', w: 'w' };
/**
 * 2026-10-22: a clip's ParticleSystem values (fx_extract.py ANIMATED_VALUES, track `ps:<property path>`) → their place in the
 * extracted system (keys from `ps`; a MinMaxCurve's scalar = `s`, its minScalar `n`, a MinMaxGradient's colour = `a`).
 * The system takes its own copy of each object on the way (ParticleSystem.animPath): the definition is shared.
 * @type {Readonly<Record<string, (string | number)[]>>}
 */
const PS_ANIM = {
  'EmissionModule.rateOverTime.scalar': ['rate', 's'], 'EmissionModule.rateOverTime.minScalar': ['rate', 'n'],
  'ShapeModule.radius.value': ['shape', 'radius'], 'SizeModule.curve.scalar': ['mods', 'sizeOL', 'x', 's'],
  'InitialModule.gravityModifier.scalar': ['gravity', 's'], 'InitialModule.startSize.scalar': ['size', 's'], 'InitialModule.startSizeY.scalar': ['sizeY', 's'], looping: ['loop'], simulationSpeed: ['speedMul'],
  'VelocityModule.enabled': ['mods', 'velOL', 'on'],   // (2026-10-23) a switched-off module a clip turns on (fx_extract.py clip_modules)
  // (2026-11-16, fx-C) the rate over distance and the bursts' counts (机械师's 机械狗 S3 trails stop them as the clip ends)
  'EmissionModule.rateOverDistance.scalar': ['dist', 's'], 'EmissionModule.rateOverDistance.minScalar': ['dist', 'n'],
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [[`EmissionModule.m_Bursts.Array.data[${i}].countCurve.scalar`, ['bursts', i, 'n', 's']],
    [`EmissionModule.m_Bursts.Array.data[${i}].countCurve.minScalar`, ['bursts', i, 'n', 'n']]]).flat()),
  ...Object.fromEntries([...'rgba'].flatMap((c, k) => [[`InitialModule.startColor.maxColor.${c}`, ['color', 'a', k]],
    [`TrailModule.colorOverLifetime.maxColor.${c}`, ['mods', 'trail', 'colorOL', 'a', k]]])),
};
/**
 * 2026-10-22: a clip's FxUVTweener speeds (track `uvt:<field>`) → [its map (0 `_MainTex`, 1 the second map), the axis].
 * @type {Readonly<Record<string, [number, string]>>}
 */
const UVT_ANIM = { xspeed: [0, 'vx'], yspeed: [0, 'vy'], secondXSpeed: [1, 'vx'], secondYSpeed: [1, 'vy'] };
// local patch: a clip's GameObject m_IsActive binding (Mecanim type 1, crc32('m_IsActive'); the extract keeps it as 'attr:…')
const ACTIVE_PROP = 'attr:2086281974';
const clipE = new THREE.Euler();
const IDENTITY16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * Whether any renderer of the prefab `def` is behind the units (a negative sortingOrder) — a status effect splits only then.
 * @param {FxDef | null | undefined} def
 */
export function hasBackOrder(def) {
  // (2026-10-27) or a sorting layer before Default
  return !!def?.nodes?.some((n) => [n.mesh, n.skin, n.ps?.render, n.trailR, n.lineR].some((r) => ((r?.layer || 0) || (r?.order || 0)) < 0));
}

export class FxInstance {
  /**
   * @param {FxDef} def FxLibrary.load result
   * @param {{ quality?: 'high'|'medium'|'low', facing?: 1|-1|null, dir?: {x: number, y: number}|null, body?: string|null, speed?: number, delays?: boolean, scale?: number, floor?: number|null, split?: boolean|'backOnly', atSpawn?: boolean, pivot?: boolean, hold?: number|null, ahead?: boolean, tilt?: readonly number[]|null, pinned?: boolean }} [opts]
   *   tilt (2026-10-22): a Unity quaternion the whole prefab is turned by inside the Unity frame — the `Graphic` rotation of
   *   the unit it is created on (render/fxpoints.js GRAPHIC_TILT / takesGraphicTurn); world-space particles are not turned
   *   facing / dir / body (maintainer decision 2026-10-11 「공식대로」): the effect turns as the client's `ParticleEffect.FaceTo`
   * does by its root `face` record (render/fx/face.js faceTurn) — `dir` = the direction it is played with
   *   (default ±x by `facing`, the owner's drawn side), `body` = the four-way facing of the unit it is created on (for
   *   `_useBodyRotation`); it is mirrored only by a FollowMountPoint with `_followScaleSign` (the Spine flip, `facing`) — and,
   *   2026-11-18, by render/fxgame.js's frame loop when it copies a flipping point's rotation (fxpoints.js pointFlips). A
   *   root of another effect class (`bodyFace`: trails, lines, EmptyEffect wrappers — 2026-11-17, official client) turns its
   *   `_bodyTransofrm` to `dir` as the base Effect.FaceTo does (fx/face.js effectTurn), unmirrored — with neither `dir` nor
   *   `facing` given, to `Defaults.EFFECT_DIRECTION` (up). A prefab without either record (an old extract, a root without
   *   an effect component) keeps the old mirror by `facing`.
   *   speed / delays (maintainer decision 2026-10-11): nothing is drawn until the root FxDelay `_delayTime` (effect time)
   *   plus `_delayToPlay` (game time × `speed`, the playback speed it runs at) have passed, and a branch with its own FxDelay
   *   (node `delay`, game time) or a `_subFXDelayConfigs` entry (node `sdelay`, effect time) starts that much later
   *   (`FxDelay.OnEnable` / `Effect._DelayToActiveGameObject`); `delays: false` plays everything at once.
   *   local patch: floor = the board height of the ground under it (default 0): what lies more than 0.05 below is not drawn
   *   (null: no cut); split = each renderer on layer FX_FRONT or FX_BACK by its Unity sorting (sortingOrder > 0, or 0 with a
   *   negative sorting fudge = in front of the units, whose Spine renderers are Default / order 0 and write no depth) —
   *   without it everything stays on layer 0; 'backOnly' (a status effect) puts only sortingOrder < 0 on FX_BACK; atSpawn (default on; false keeps it) = drop the root node's own position (the
   *   caller's placement replaces it); pivot (default on; false ignores it) = billboard / aligned / horizontal quads use their
   *   renderer's pivot (uPivot) — on for every effect by the maintainer's decision 2026-10-08 (docs/LOCAL-PATCH.md 「정예 기물 금빛」);
   *   stretched billboards and mesh particles too since 2026-10-22;
   *   ahead (default on, with split; false keeps order 0 behind) = an order-0 particle system whose node lies in front of the unit
   *   goes to FX_FRONT — the elite glow first, every split effect by the maintainer's decision 2026-10-08
   */
  constructor(def, opts = {}) {
    this.def = def;
    this.moveScale = 1; this.shaderAhead = 0;   // setMoveScale
    this.hold = opts.hold ?? null; // local patch: freeze the effect at this time (s) — a mark that stays once shown
    this.pinned = !!opts.pinned;   // 2026-11-12: counted under PINNED_CAP, not PLAYER_CAP
    this.q = QUALITY[/** @type {string} */ (opts.quality)] || QUALITY.high;
    this.time = 0;
    this.object = new THREE.Group();            // placed in board coordinates by the caller
    const unity = new THREE.Group();            // Unity battle frame: mirror z (z = −height)
    const facing = opts.facing || 1;
    // (2026-10-21, official client) the client's FunnelHitEffect (fx_extract.py `jitter`): OnPlay turns the
    // effect to a random direction of the map plane (RandomUtil.RandomDirectionV2) and moves it by Random.Range(−r, r) per
    // axis of `_randomRange` in world space — a drone hit at a random point (Unity's display random: Math.random here)
    const jit = Array.isArray(def?.jitter) && def.jitter.length === 3 ? def.jitter.map((v) => Number(v) || 0) : null;
    // (2026-10-22, official client) the client's RandomDirection (fx_extract.py `rdir` [from x, y, z, to x, y, z]): `OnPlay`
    // turns the effect to RandomUtil.RandomVector3(from, to) — Random.Range per axis, not normalised (锏 S2)
    const rr = Array.isArray(def?.rdir) && def.rdir.length === 6 ? def.rdir.map((v) => Number(v) || 0) : null;
    /** @type {(a: number, b: number) => number} */
    const span = (a, b) => a + Math.random() * (b - a);
    const rdir = jit ? { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 } : rr ? { x: span(rr[0], rr[3]), y: span(rr[1], rr[4]) } : null;
    const side = def?.face || opts.facing != null ? { x: facing, y: 0 } : null;   // none given: EFFECT_DIRECTION (base turn)
    const turn = effectTurn(def, rdir || opts.dir || side, rdir ? null : opts.body ?? null);
    this.turn = turn;
    // the mirror: by FollowMountPoint `_followScaleSign` (its point's scale sign = the Spine flip) — or `_followScale`, which
    // copies the whole scale, its sign too (2026-10-27, official client) — when the prefab has its face or bodyFace record,
    // else (an old extract, no effect component on the root) the old rule — mirrored when its owner faces left
    const mirror = turn ? (def?.mount?.followScaleSign || def?.mount?.followScale ? facing : 1) : facing;
    unity.scale.set(mirror * (opts.scale || 1), opts.scale || 1, -(opts.scale || 1));
    if (jit) {   // Unity world (x, y, z = −height)
      /** @type {(a: number) => number} */
      const r = (a) => (a ? (Math.random() * 2 - 1) * a : 0);
      const x = r(jit[0]), y = r(jit[1]), z = r(jit[2]);
      unity.position.set(x, y, z ? -z : 0);
    }
    this.object.add(unity);
    this.unity = unity;
    // 2026-10-22 (official client, docs/rules/fx.md 「캐릭터 그림의 기울기」): an effect created on a unit takes its model's
    // `Graphic` rotation, X −30° (opts.tilt: render/fxpoints.js takesGraphicTurn) — the prefab is authored in that plane,
    // facing the camera; untilted, a shield disc lay on the board and was drawn as an ellipse. Its world-space particles
    // and trails stay in the untilted Unity frame (they are kept in `unity`'s space)
    const tilt = new THREE.Group();
    if (Array.isArray(opts.tilt)) tilt.quaternion.set(opts.tilt[0], opts.tilt[1], opts.tilt[2], opts.tilt[3]);
    unity.add(tilt);
    /** @type {THREE.Object3D[]} */
    this.nodes = [];
    /** @type {ParticleSystemLinks[]} */
    this.systems = [];
    /** @type {THREE.ShaderMaterial[]} */
    this.meshMats = [];
    /** @type {THREE.Mesh[]} */
    this.meshObjs = [];   // 2026-10-22: a node's MeshRenderer object (a clip's `mr:enabled`)
    /** @type {[THREE.InstancedBufferGeometry, THREE.BufferGeometry][]} */
    this.meshGeos = [];   // 2026-10-28: their geometries with the library mesh each shares attributes with (disposeOwn)
    /** @type {THREE.ShaderMaterial[][]} */
    this.meshMore = [];   // (2026-10-26) a node's further MeshRenderer materials (n.mesh.more)
    /** @type {TrailRendererOff[]} */
    this.trails = [];
    /** @type {LineRenderer[]} */
    this.lines = [];   // local patch: LineRenderers
    /** @type {{ o: THREE.Object3D, rec: NonNullable<FxNode['emit']>, next: number }[]} */
    this.emitters = []; // 2026-10-21: RandomEmitter nodes ({ o, rec: node `emit`, next }) — render/fxgame.js plays their copies
    /** @type {{ o: THREE.Object3D, play: EmitRec | null, finish: EmitRec | null, [key: string]: unknown }[]} */
    this.onEmit = [];   // (2026-10-21) OnPlayEmitter / OnFinishEmitter nodes ({ o, play: node `onPlay` or one of `onPlayIf`, finish: node `onFinish` }) — fxgame.js stepOnEmit
    /** @type {{ k: string, rec: Bag, [key: string]: unknown }[]} */
    this.pausers = [];  // (2026-10-21) the behaviours that pause / finish the effect ({ k: PAUSE_KEYS, rec: the node's record — each of `pauseOther`'s }) — fxgame.js stepPauses
    if (!def || !this.q.budget) { this.empty = true; return; }
    const speed = Number(opts.speed) > 0 ? Number(opts.speed) : 1;
    const delays = opts.delays !== false;
    /** @type {FaceRec} */
    const f = def.face || {};
    // the root's wait (effect seconds): FxDelay `_delayTime` ÷ the speed in game time = `_delayTime` here; `_delayToPlay`
    // is game time (`_randomPlayDelay`: a random part of it)
    /** @type {number} */
    this.wait = delays ? (Number(f.fxDelay) > 0 ? Number(f.fxDelay) : 0)
      + (Number(f.delay) > 0 ? (f.rnd ? Math.random() : 1) * Number(f.delay) * speed : 0) : 0;
    if (this.wait > 0) unity.visible = false;
    /** @type {number[]} */
    const t0 = [];   // each node's start (effect seconds after the root shows): its own and its parents' branch delays
    /** @type {{ mesh: THREE.SkinnedMesh, skin: MeshRec, bind: number[][] }[]} */
    const skins = [];
    // (2026-10-23, official client) the root's FxLODSetting (fx_extract.py `lod`): the client's low-detail effects, applied on
    // a device with HIGH_LEVEL_EFFECT graded off (`Effect.OnAllocate` → `ApplyLowDetail`) — here at quality 'medium' [ASSUMED:
    // our 'medium' = that grading]: its `_disableObjects` off, its hooked systems' emission × their percentage
    const lod = this.q === QUALITY.medium ? def.lod : null;
    const lodOff = new Set(lod?.off || []), lodPs = new Map(lod?.ps || []);
    /** @type {THREE.Skeleton[]} */
    this.skeletons = [];
    /** @type {{ o: THREE.Object3D, at: number, on: boolean }[]} */
    this.branches = [];
    def.nodes.forEach((n, i) => {
      const o = new THREE.Group();
      o.name = n.name;
      // local patch (opts.atSpawn, default on — every effect, maintainer decision 2026-10-08): an effect the client instantiates at
      // a spawn point drops its root's own position (Unity Instantiate(prefab, position, …) overwrites it) — the elite glow's
      // root z −0.25 lifted the whole glow a quarter tile; 104 prefabs have one, mostly projectile trails, which flew 0.4–0.65
      // tile off their shot's line (空弦 archet, 丰川祥子 oblvns).
      // [ASSUMED] (Unity does this natively): the recording's band height matches with it dropped, not with it kept. The child
      // static_offset stays — the client's ParticleEffect names it (CHILD_NAME_STATIC_OFFSET). `_overwriteHeight` /
      // `_heightOffset` are C# (official client 2026-10-10: Effect._InitLocationFromEntity sets localPosition.z =
      // −(entity height + offset) only when the flag is on — of the pool's prefabs only thorn2_skill_01_range has it)
      if (n.pos && !(opts.atSpawn !== false && n.parent < 0)) o.position.set(n.pos[0], n.pos[1], n.pos[2]);
      if (n.rot) o.quaternion.set(n.rot[0], n.rot[1], n.rot[2], n.rot[3]);
      if (n.scale) o.scale.set(n.scale[0], n.scale[1], n.scale[2]);
      o.visible = n.active !== false && !lodOff.has(i);
      (n.parent >= 0 ? this.nodes[n.parent] : tilt).add(o);
      this.nodes[i] = o;
      if (n.emit?.effect && /** @type {number} */ (n.emit.count) > 0) this.emitters.push({ o, rec: n.emit, next: 0 });
      if (n.onPlay?.effects?.length || n.onFinish?.effects?.length) this.onEmit.push({ o, play: n.onPlay || null, finish: n.onFinish || null });
      // (2026-11-16) OnPlayEmitterIf: each plays only when its owner passes `if` as it starts (fxgame.js stepOnEmit)
      if (Array.isArray(n.onPlayIf)) for (const rec of n.onPlayIf) if (rec?.effects?.length) this.onEmit.push({ o, play: rec, finish: null });
      for (const k of PAUSE_KEYS) for (const rec of /** @type {Bag[]} */ (k === 'pauseOther' ? n[k] || [] : n[k] ? [n[k]] : [])) this.pausers.push({ k, rec });
      const own = !delays || n.parent < 0 ? 0 : (Number(n.delay) > 0 ? Number(n.delay) * speed : 0) + (Number(n.sdelay) > 0 ? Number(n.sdelay) : 0);
      t0[i] = (n.parent >= 0 ? t0[n.parent] || 0 : 0) + own;
      o.userData.t0 = t0[i];
      if (own > 0 && o.visible) { o.visible = false; this.branches.push({ o, at: t0[i], on: false }); }
      // 2026-10-14: a SkinnedMeshRenderer (n.skin) is drawn like a mesh, by its bones (bound below, once every node exists)
      const mr = n.mesh || n.skin;
      const src = mr && def.geoms[mr.mesh];
      if (src && (!n.skin || src.userData.bind)) {
        // (2026-10-26, effect bundle W2a) material j draws sub-mesh min(j, sub-meshes − 1) (the mesh file's `sub`)
        const sub = src.userData.sub;
        /** @type {(key: string, j: number) => THREE.Mesh} */
        const draw = (key, j) => {
          const mat = meshSide(makeMaterial(def.materials[key], def.lib));
          mat.uniforms.uMode.value = 4;
          // Local: this mesh is placed by its node's matrix. The shader's other alignments are a mesh particle's, drawn by the
          // camera with the particle's size, which here is 1: 락락's and 쉐라's drones lost their node's scale and came out a tile wide
          mat.uniforms.uAlign.value = 2;
          const g = new THREE.InstancedBufferGeometry();
          g.index = src.index;
          if (sub) g.setDrawRange(...sub[Math.min(j, sub.length - 1)]);
          g.setAttribute('position', src.getAttribute('position'));
          if (src.getAttribute('uv')) g.setAttribute('uv', src.getAttribute('uv'));
          if (n.skin) { g.setAttribute('skinIndex', src.getAttribute('skinIndex')); g.setAttribute('skinWeight', src.getAttribute('skinWeight')); }
          useMeshAttrs(g, src, mat); // local patch
          /** @type {(name: string, v: number[]) => void} */
          const one = (name, v) => g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(v), v.length));
          one('iPos', [0, 0, 0]); one('iSize', [1, 1, 1]); one('iRot', [0, 0, 0]); one('iColor', [1, 1, 1, 1]);
          one('iC1', [0, 0, 0, 0]); one('iC2', [0, 0, 0, 0]); one('iUV', [0, 0, 1, 1]); one('iVel', [0, 0, 0]);
          g.instanceCount = 1;
          this.meshGeos.push([g, src]);
          const mesh = n.skin ? new THREE.SkinnedMesh(g, mat) : new THREE.Mesh(g, mat);
          mesh.frustumCulled = false;
          mesh.renderOrder = sortingOrder(mr);
          mat.userData.t0 = t0[i];
          return mesh;
        };
        const mesh = draw(mr.mat, 0);
        o.add(mesh);
        if (n.skin) skins.push({ mesh, skin: n.skin, bind: src.userData.bind });
        this.meshMats[i] = mesh.material;
        this.meshObjs[i] = mesh;
        // the renderer's further materials (fx_extract.py `more`; 水月 S3 start draws its mesh twice): copies under the
        // first, so its switch hides them with it
        n.mesh?.more?.forEach((key, k) => {
          if (!def.materials[key]) return;
          const m = draw(key, k + 1);
          mesh.add(m);
          (this.meshMore[i] ||= []).push(m.material);
        });
        // (2026-10-26) a switched-off MeshRenderer draws nothing until a clip switches it on (`mr:enabled`)
        if (n.mesh?.off) mesh.visible = false;
      }
    });
    // Unity skins in world space: Σ weight · bone.localToWorld · bindpose · vertex — the renderer's own transform is not used.
    // A SkinnedMesh bound with an identity bind matrix in 'attached' mode gives the same (bone.matrixWorld · boneInverse, then
    // back through the mesh's own matrix); that matrix is the effect root's, not the node's — a node may be flattened to scale
    // 0 (水月 S2's tentacle `2`: y 0), which would collapse the mesh. Its node still switches it on and off
    for (const k of skins) {
      const bones = k.skin.bones.map((b) => this.nodes[b]);
      if (bones.some((b) => !b)) { k.mesh.visible = false; continue; }
      const sk = new THREE.Skeleton(bones, bones.map((_, j) => new THREE.Matrix4().fromArray(k.bind[j] || IDENTITY16)));
      this.skeletons.push(sk);   // its bone texture is freed with the effect (dispose)
      k.mesh.bind(sk, new THREE.Matrix4());
      k.mesh.updateMatrixWorld = function () { this.matrixWorld.copy(unity.matrixWorld); this.bindMatrixInverse.copy(this.matrixWorld).invert(); };
    }
    if (turn) this.applyTurn(turn);
    def.nodes.forEach((n, i) => {
      if (n.trailR) this.trails.push(new TrailRenderer(n.trailR, this.nodes[i], unity, def));
      if (n.lineR && def.materials[n.lineR.mat]) this.lines.push(new LineRenderer(n.lineR, this.nodes[i], unity, def)); // local patch
      if (n.ps && (n.ps.render?.mat || n.ps.render?.trailMat)) {
        // per-system cap: the extract's max, shared out of the quality budget
        this.systems.push(new ParticleSystem(n.ps, this.nodes[i], unity, def, { q: this.q, cap: Math.ceil(this.q.budget / 8), pivot: opts.pivot !== false, lod: lodPs.get(i) }));
      }
      // 2026-10-14: the node's FxUVTweener moves its renderer's material (Unity GetComponent<Renderer>: a node has one)
      if (n.uvt) {
        const o = this.nodes[i];
        const sys = this.systems.find((s) => s.node === o), ln = this.lines.find((t) => t.node === o), tr = this.trails.find((t) => t.node === o);
        if (this.meshMats[i]) uvTween(this.meshMats[i], n.uvt, def.materials[/** @type {MeshRec} */ (n.mesh || n.skin).mat], /** @type {MeshRec} */ (n.mesh || n.skin).mat);
        else if (sys) uvTween(sys.material, n.uvt, def.materials[/** @type {string} */ (/** @type {PsRec} */ (n.ps).render.mat)], /** @type {PsRec} */ (n.ps).render.mat);
        else if (ln) uvTween(ln.batch.material, n.uvt, def.materials[/** @type {LineRec} */ (n.lineR).mat], /** @type {LineRec} */ (n.lineR).mat);
        else if (tr) uvTween(tr.batch.material, n.uvt, def.materials[/** @type {TrailRec} */ (n.trailR).mat], /** @type {TrailRec} */ (n.trailR).mat);
      }
      if (n.uvr) {   // 2026-10-14: FxUVRotation, the same renderer
        const o = this.nodes[i];
        const sys = this.systems.find((s) => s.node === o), ln = this.lines.find((t) => t.node === o), tr = this.trails.find((t) => t.node === o);
        // (2026-10-26, official client) it writes the renderer's property block with no index: every material of it — a
        // mesh's further ones (n.mesh.more), a particle system's trail
        const mats = this.meshMats[i] ? [this.meshMats[i], ...(this.meshMore[i] || [])]
          : sys ? [sys.material, sys.trailBatch?.material] : [ln?.batch.material || tr?.batch.material];
        for (const m of mats) uvRotation(m, n.uvr);
      }
    });
    // 2026-10-14: sub emitters (fx_extract.py `mods.sub`, Birth): the target system emits from each of this system's particles
    // instead of playing on its own; (2026-11-16) Collision ones (type 1, on a system with a CollisionModule) where they hit
    for (const s of this.systems) {
      const list = (Array.isArray(s.ps.mods?.sub) ? s.ps.mods.sub : [])
        .map((e) => ({ e, sys: this.systems.find((x) => x.node === this.nodes[e.node]) }))
        .filter((x) => x.sys && x.sys !== s && !x.sys.subOf && ((x.e.type || 0) === 0 || (x.e.type === 1 && s.ps.mods?.collide)));
      if (list.length) s.setSubs(/** @type {SubLink[]} */ (list));
      // 2026-10-22: the CollisionModule's planes (fx_extract.py collide_planes: node indices)
      for (const k of s.ps.mods?.collide?.planes || []) if (this.nodes[k]) s.planes.push(this.nodes[k]);
    }
    // local patch (maintainer report, maintainer's decision 2026-10-08): every clip of the prefab plays — a nested sub-prefab has
    // its own Animator (缄默德克萨斯 S2's texas2_birth_02_start: the root + 4 slashes; clips[0] alone left the slashes frozen
    // on their material defaults). The extract resolves each clip's nodes into the whole tree; each starts when its branch shows
    // (2026-10-11: the sub-prefabs' own FxDelay 0–0.3 s, node `delay` — bindTrack `off`) and the effect's clip time is the longest
    /** @type {FxClip[]} */
    this.clips = def.clips || [];
    // 2026-10-22 (effect bundle J): a controller with more states is a state machine (fx_extract.py state_machine, `sms`);
    // its other states' clips play only when it switches to them, so the effect's clip time counts its default state's
    /** @type {SmRun[]} */
    this.sms = (def.sms || []).map((d, k) => this.newSm(d, k));
    /** @type {((key: string) => boolean|null)|null} the owner's buffs for `animBuff` (render/fxgame.js; unset: taken as held) */
    this.heldBuff = null;
    const first = new Set(this.sms.map((m) => m.d.states[/** @type {number} */ (m.d.def)]?.clip));
    /** @type {number} */
    this.clipLen = this.clips.reduce((m, c, i) => (c.sm == null || first.has(i) ? Math.max(m, c.len || 0) : m), 0);
    /** @type {THREE.ShaderMaterial[]} */
    this.meshMatList = [...this.meshMats, ...this.meshMore.flat()].filter(Boolean);
    // local patch: the floor cut and the per-renderer layers
    if (opts.floor !== null) {
      // every material that tests depth loses what lies under the floor (FxInstance opts.floor), as the client's opaque map
      // hides it (2026-10-26, maintainer decision after the official recording: 缄默德克萨斯 S3's round smoke `yanwu`, on the
      // ground and sinking, is gone there 0.2 s after the blades land; 酒神's waves 0.095 under the floor never show) —
      // until then only renderers whose node rested 0.25 under were cut [the board's floor = the client's ground: ASSUMED]
      this.floor0 = opts.floor || 0;
      this.applyFloor(this.floor0);
    }
    /** @type {number[]} */
    this.layerN = [0, 0, 0];
    if (opts.split) {
      /** @type {(mesh: THREE.Object3D, front: boolean | undefined) => void} */
      const put = (mesh, front) => { const k = front ? FX_FRONT : FX_BACK; mesh.layers.set(k); /** @type {number[]} */ (this.layerN)[k]++; };
      // backOnly (a status effect, render/fxgame.js playStatus): only sortingOrder < 0 goes behind the unit, the rest stays
      // in front as it was before the split
      /** @type {((o: number) => boolean) | null} */
      const back = opts.split === 'backOnly' ? (o) => o >= 0 : null;
      // (2026-10-27, effect bundle V) a renderer on a sorting layer after Default is over the units whatever its order, one
      // before it under them (hsguma S2's floor, layer −2); on Default the order decides as before
      /** @type {(r: { layer?: number, order?: number } | null | undefined, f: (o: number) => boolean) => boolean} */
      const side = (r, f) => ((r?.layer || 0) ? /** @type {{ layer: number }} */ (r).layer > 0 : f(r?.order || 0));
      // 2026-10-22 (docs/rules/fx.md 「캐릭터 그림의 기울기」): the sides are judged in the prefab's own, untilted frame —
      // WRAP_H / AHEAD_Y were set there. Tilted, every order-0 plane in the model's plane (a background quad behind her,
      // 뮤엘시스 S3 bg_wave_01) stood 0.6–0.9 tall and counted as a dome around the unit, drawn over her
      const turned = tilt.quaternion.clone();
      tilt.quaternion.identity();
      this.object.updateMatrixWorld(true);
      def.nodes.forEach((n, i) => {
        if (this.meshMats[i]) {
          const mesh = this.nodes[i].children.find((/** @type {THREE.Object3D} */ c) => c.isMesh && c.material === this.meshMats[i]);
          // local patch (maintainer report 2026-10-07, video: 蛇屠箱's S2 hex dome covers her): an order-0 mesh that stands up
          // around the unit (a dome / shell, > WRAP_H tall) is in front — the client sorts order 0 by distance; a flat
          // ground decal stays behind
          const front = mesh && side(n.mesh || n.skin, (order) => (back ? back(order) : order > 0 || (!order && wrapsUnit(mesh, this.object))));
          if (mesh) for (const m of [mesh, ...mesh.children.filter((/** @type {THREE.Object3D} */ c) => c.isMesh)]) put(m, front);
        }
      });
      // local patch (opts.ahead, maintainer report 2026-10-08: the elite glow's gold band covers the legs in the game; every split
      // effect by the maintainer's decision 2026-10-08 — 19 caster / ground prefabs): an order-0 system whose node lies in front of
      // the unit (nearer the camera) is drawn over it — the client sorts order 0 by distance [ASSUMED for all but the glow:
      // in front of / behind every unit at once, not sorted per unit]
      for (const s of this.systems) {
        const r = s.ps.render;
        const front = side(r, (o) => (back ? back(o) : o > 0 || (o === 0 && ((r.fudge || 0) < 0 || (opts.ahead !== false && aheadOf(s.node, this.object))))));
        if (s.draws) put(s.mesh, front); else s.mesh.layers.set(front ? FX_FRONT : FX_BACK);
        for (const m of s.more) m.mesh.layers.set(front ? FX_FRONT : FX_BACK);
        if (s.trailBatch) put(s.trailBatch.mesh, front);
      }
      for (const t of this.trails) put(t.batch.mesh, side(t.tr, (o) => (back ? back(o) : o > 0)));
      for (const t of this.lines) put(t.batch.mesh, back ? back(t.tr.order || 0) : (t.tr.order || 0) > 0); // local patch
      tilt.quaternion.copy(turned);
      this.object.updateMatrixWorld(true);
    } else this.layerN[0] = 1;
    // (2026-10-10, user report: buff effects that vanish) a clip with Unity's loop flag (fx_extract.py `loop` = the clip's
    // m_LoopTime) repeats — it was held on its last frame, and an effect whose only motion was such a clip ended with it
    /** @type {TrackBind[]} */
    this.clipTracks = [];
    /** @type {Map<string, SmSlot>} */
    this.smSlots = new Map();   // a state machine's tracks by `${sm}|${node}|${prop}`: the clips of its states blend there
    this.clips.forEach((c, ci) => {
      for (const tr of c.tracks) {
        const b = this.bindTrack(tr, c.len || 0);
        if (!b) continue;
        if (c.loop && /** @type {number} */ (c.len) > 0) b.loop = true;
        if (!this.sms[/** @type {number} */ (c.sm)]) { this.clipTracks.push(b); continue; }
        b.ci = ci;
        const key = `${c.sm}|${tr.node}|${tr.prop}`;
        const slot = this.smSlots.get(key) || { m: this.sms[/** @type {number} */ (c.sm)], b, def: this.trackValue(b), tracks: [], v: [] };
        slot.tracks.push(b);
        this.smSlots.set(key, slot);
      }
    });
    /** @type {boolean} */
    this.clipLoops = this.clips.some((c) => c.sm == null && c.loop && /** @type {number} */ (c.len) > 0);
    for (const b of this.clipTracks) if (/** @type {number} */ (b.off) > 0) this.clipLen = Math.max(this.clipLen, /** @type {number} */ (b.off) + (b.len || 0)); // a delayed branch's clip ends later
    // …and a mesh renderer is drawn while its effect lives (Unity keeps a MeshRenderer on until the effect object goes): a
    // prefab with meshes ends only when it is stopped (a buff with its owner, a one-shot at its caller's `until`) — the skill
    // buffs (浊心斯卡蒂 S2, 寒芒克洛丝 S2, 号角 S3 …: meshes only, no clip, no particles) were done on their first frame
    /** @type {boolean} */
    this.holdMeshes = this.meshMatList.length > 0;
    // local patch (m_IsActive, maintainer's decision 2026-10-08 「공식과 동일하게」 — report: 缄默德克萨斯 S3's falling blades are
    // switched off as they land): the particle systems / trails under a node a clip switches on and off follow it (meshes and
    // lines follow by their node's visibility). And those under a node inactive from the start (maintainer 2026-10-08 「일단 꺼봐」):
    // in 164 of the 166 such prefabs nothing in the prefab switches the node on (maintainer's notes 2026-10-08, the
    // workspace root) — 아르케토 S3's stray `smoke` lives on, switched on, in archet_skill_03_start_01
    const switched = new Set([...this.clipTracks, ...[...this.smSlots.values()].map((s) => s.b)].filter((b) => b.kind === 'active').map((b) => b.o));
    /** @type {(o: THREE.Object3D) => boolean} */
    const under = (o) => { for (let p = o; p && p !== unity; p = p.parent) if (switched.has(p) || !p.visible) return true; return false; };
    /** @type {{ x: ParticleSystemLinks | TrailRendererOff, on: boolean }[]} */
    this.gated = [...this.systems, ...this.trails].filter((x) => under(x.node)).map((x) => ({ x, on: true }));
    // (2026-10-26) a system in Unity's Local scaling mode under a parent that is scaled, or whose scale a clip drives, drops
    // its parents' scale (ParticleSystem.useLocalScale); 535 systems of 136 prefabs had a scaled parent
    const scaledBy = new Set([...this.clipTracks, ...[...this.smSlots.values()].flatMap((s) => s.tracks)].filter((b) => b.kind === 'scale').map((b) => b.o));
    /** @type {(o: THREE.Object3D) => boolean} */
    const scaled = (o) => scaledBy.has(o) || Math.abs(o.scale.x - 1) > 1e-4 || Math.abs(o.scale.y - 1) > 1e-4 || Math.abs(o.scale.z - 1) > 1e-4;
    for (const s of this.systems) {
      const mode = s.ps.scaling ?? 1;
      if (mode === 1) for (let p = s.node.parent; p && p !== tilt; p = p.parent) if (scaled(p)) { s.useLocalScale(tilt); break; }
      // (2026-10-27) Shape (2): a system scaled itself or by a parent (引星棘刺 S2 range: its node × 0.53)
      if (mode === 2) for (let p = s.node; p && p !== tilt; p = p.parent) if (scaled(p)) { s.useLocalScale(tilt, true); break; }
      // (2026-11-04) the transform scale its quads take (sysScale): Hierarchy (0) its node's and its parents', Local (1) its
      // node's own; Shape (2) none
      const path = [];
      if (mode === 0) for (let p = s.node; p && p !== tilt; p = p.parent) path.push(p);
      else if (mode === 1) path.push(s.node);
      if (s.quadScaled && path.some(scaled)) s.scalePath = path;
      if (s.tm && path.some(scaled)) s.trailPath = path;
    }
    /** @type {number[]} */
    this.clipV = [];
    live.push(this);
    if (this.pinned) livePinned++;
    // the oldest of its kind goes (dispose removes it from `live`): pinned and other instances have their own caps
    while (live.length - livePinned > PLAYER_CAP) /** @type {FxInstance} */ (live.find((x) => !x.pinned)).dispose();
    while (livePinned > PINNED_CAP) /** @type {FxInstance} */ (live.find((x) => x.pinned)).dispose();
  }

  /**
   * ParticleEffect.FaceTo on the prefab's named children (faceTurn): 'rotation_y' / 'rotation_z' 180° (FLIP_TWO_SIDE; unflipped:
   * identity, as the client sets it), 'rotation_z' by `z` degrees (FOUR_DIRECTION / FIXED_DIRECTION), the prefab's body
   * transform (`face.bodyNode`, else a node named 'body') by `any` degrees about z (ANY_DIR) — or the base Effect.FaceTo's
   * node `turn.node` (`bodyFace`, effectTurn). The first node of the name anywhere in the tree (the prefabs keep them under
   * static_offset).
   * @param {NonNullable<ReturnType<typeof effectTurn>>} turn
   */
  applyTurn(turn) {
    /** @type {(name: string) => THREE.Object3D | undefined} */
    const named = (name) => this.nodes.find((o) => o && o.name === name);
    const ry = named('rotation_y'), rz = named('rotation_z');
    if (turn.flip != null) {
      if (ry) ry.rotation.set(0, turn.flip ? Math.PI : 0, 0);
      if (rz) rz.rotation.set(0, 0, turn.flip ? Math.PI : 0);
    }
    if (turn.z != null && rz) rz.rotation.set(0, 0, (turn.z * Math.PI) / 180);
    if (turn.any != null) {
      const bn = Number.isInteger(turn.node) ? turn.node : this.def?.face?.bodyNode, b = Number.isInteger(bn) ? this.nodes[/** @type {number} */ (bn)] : named('body');
      if (b) b.rotation.set(0, 0, (turn.any * Math.PI) / 180);
      // 2026-11-18: a ProjectileEffect root then takes its OnBeforePlay rotation (fx/face.js effectTurn `main` / `roll`) —
      // what render/fx/face.js bodyTurn sets again on a flying shot; a still one (a shell on its spot) has only this
      if (b && turn.main) {
        b.quaternion.set(turn.main[0], turn.main[1], turn.main[2], turn.main[3]);
        if (turn.roll) b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (Math.random() * turn.roll * Math.PI) / 180));
      }
    }
  }

  /**
   * What a clip track drives, resolved once (applyClip runs every frame).
   * @param {ClipTrack} tr
   * @param {number} len
   * @returns {TrackBind | null}
   */
  bindTrack(tr, len) {
    const o = this.nodes[tr.node];
    if (!o) return null;
    const r = this.bindTrack0(tr, len, o);
    if (r) r.off = o.userData.t0 || 0;   // its branch's start (a nested sub-prefab's Animator starts when it shows)
    return r;
  }

  /**
   * @param {ClipTrack} tr
   * @param {number} len
   * @param {THREE.Object3D} o
   * @returns {TrackBind | null}
   */
  bindTrack0(tr, len, o) {
    if (tr.prop === 'pos' || tr.prop === 'scale' || tr.prop === 'quat' || tr.prop === 'euler') return { tr, o, kind: tr.prop, len };
    if (tr.prop === 'width') { const ln = this.lines.find((t) => t.node === o); return ln ? { tr, o, kind: 'width', ln, len } : null; } // local patch
    if (tr.prop === ACTIVE_PROP && tr.type === 1) return { tr, o, kind: 'active', len }; // local patch: m_IsActive
    // 2026-10-22: a clip moving a particle module's value, a trail's length, a mesh renderer's switch, a UV tweener's speed
    if (tr.prop.startsWith('ps:')) {
      const at = this.systems.find((x) => x.node === o)?.animPath(PS_ANIM[tr.prop.slice(3)]);
      return at ? { tr, o, kind: 'set', at: at[0], key: at[1], bool: tr.prop === 'ps:looping' || tr.prop === 'ps:VelocityModule.enabled', len } : null;
    }
    if (tr.prop === 'trail:time') {
      const t = this.trails.find((x) => x.node === o);
      if (!t) return null;
      if (t.tr === t.def0) t.tr = { ...t.tr };
      return { tr, o, kind: 'set', at: t.tr, key: 'time', len };
    }
    if (tr.prop === 'mr:enabled') { const m = this.meshObjs[tr.node]; return m ? { tr, o, kind: 'visible', m, len } : null; }
    if (tr.prop.startsWith('uvt:')) {
      const [k, axis] = UVT_ANIM[tr.prop.slice(4)] || [];
      const mat = this.meshMats[tr.node] || this.systems.find((x) => x.node === o)?.material
        || this.trails.find((x) => x.node === o)?.batch.material || this.lines.find((x) => x.node === o)?.batch.material;
      const e = axis && mat?.userData.uvt?.[k];
      if (!e) return null;
      e.dyn = true;   // setTime integrates a moving speed
      return { tr, o, kind: 'set', at: e, key: axis, k: 2, len };   // the extract's speeds carry SPEED_SCALE 2
    }
    if (!tr.prop.startsWith('mat:')) return null;
    const mat = this.meshMats[tr.node] || this.systems.find((s) => s.node === o)?.material
      || this.trails.find((t) => t.node === o)?.batch.material || this.lines.find((t) => t.node === o)?.batch.material;
    if (!mat) return null;
    const [name, comp0] = tr.prop.slice(4).split('.');
    const uname = CLIP_UNIFORM[name] || CLIP_COMP[name]?.[0], comp = comp0 || CLIP_COMP[name]?.[1];
    /** @type {(m: THREE.ShaderMaterial) => TrackBind | null} */
    const one = (m) => {
      if (/^_Anchor/.test(name) && m.uniforms.uDisMode?.value !== 2) return null;   // only Disturb Anchor declares them
      const u = m.uniforms[uname];
      if (!u) return null;
      if (m.userData.uvt) m.userData.uvt = m.userData.uvt.filter((/** @type {UvTweenMap} */ e) => e.u !== u); // uvTween: the clip's property block wins
      if ([...UV_SHARED.values()].includes(u.value)) u.value = u.value.clone();   // (its own block, not the shared material)
      const k = uname === 'uTint' ? 2 : 1;   // the material tint carries the shaders' ×2 (makeMaterial)
      return comp ? { tr, o, kind: 'matComp', u, axis: CLIP_AXIS[comp], k, len } : { tr, o, kind: 'mat', u, len };
    };
    // (2026-10-26) the renderer's property block reaches each of its materials (n.mesh.more)
    const all = /** @type {TrackBind[]} */ ([mat, ...(mat === this.meshMats[tr.node] ? this.meshMore[tr.node] || [] : [])].map(one).filter(Boolean));
    if (all.length > 1) all[0].also = all.slice(1);
    return all[0] || null;
  }

  /**
   * local patch: whether layer k (0, or FX_BACK / FX_FRONT of a split instance) has a renderer of this effect.
   * @param {number} k
   */
  hasLayer(k) { return !this.empty && (this.layerN?.[k] || 0) > 0; }

  /**
   * 2026-10-10: a line effect's two ends (client LineEffectEmitterDynamic, fx_extract.py `lineDyn`): every LineRenderer of it
   * runs from point `a` to `b` ({x, y, z} in the coordinates the effect's object sits in) from now on; null = its authored points.
   * @param {{ x: number, y: number, z: number } | null | undefined} a
   * @param {{ x: number, y: number, z: number } | null | undefined} b
   */
  setLine(a, b) {
    const ends = a && b ? [{ x: +a.x || 0, y: +a.y || 0, z: +a.z || 0 }, { x: +b.x || 0, y: +b.y || 0, z: +b.z || 0 }] : null;
    for (const t of this.lines) t.ends = ends;
  }

  /**
   * 2026-10-16: every LineRenderer of the effect runs through `pts` ({x, y, z} in the coordinates the effect's object sits
   * in, in order; at most LINE_PATH_MAX) from now on — client ChainLightningEffectBehaviour.PlayLineEffect:
   * positionCount = the units, SetPosition(i, unit i). Fewer than two points or null: its authored points.
   * @param {{ x: number, y: number, z: number }[] | null | undefined} pts
   */
  setPath(pts) {
    const path = Array.isArray(pts) && pts.length >= 2 ? pts.map((p) => ({ x: +p.x || 0, y: +p.y || 0, z: +p.z || 0 })) : null;
    for (const t of this.lines) { t.path = path; if (path) t.ends = null; }
  }

  /** Game seconds × speed (effect seconds) before the effect and its last delayed branch start (0 when nothing waits). */
  get lead() { return (this.wait || 0) + (this.branches || []).reduce((m, b) => Math.max(m, b.at), 0); }

  /**
   * End emission (looping buffs); `now` also removes the live particles.
   * @param {boolean} [now]
   */
  stop(now = false) {
    if (!this.stopping) this.finishAnim();
    this.stopping = true;
    if (this.kids) for (const c of this.kids) c.stop(now);
    for (const s of this.systems) { s.stop(); if (now) while (s.n) s.kill(s.n - 1); }
    if (now) this.time = Infinity;
  }

  /**
   * 2026-10-23: the client's `Effect.FinishMe` on an effect the pool takes back later (a buff's: `Entity.RemoveBuffEffect`,
   * a finished zone, a timed end): its behaviours finish (finishAnim), its root ParticleEffect / ProjectileEffect stops its
   * first system with its children and switches off its `_inactiveOnFinish` nodes (finishMain) — the other systems keep
   * emitting until the caller ends it `finish` s later (`delayToRecycle`). stop() stops every system instead.
   */
  finish() {
    if (!this.stopping) this.finishAnim();
    this.stopping = true;
    if (this.kids) for (const c of this.kids) c.finish();
    this.finishMain();
  }

  /**
   * 2026-10-11 (user report: projectiles that vanish late — 언더플로우, 애쉬락): a projectile's `_mainEffect` as its projectile
   * stops (`Projectile.OnProjectileStop` → `ClearMainEffectIfNot` → `Effect.FinishMe`):
   * `ProjectileEffect.OnFinish` stops the effect's first particle system with its children (`Awake`:
   * GetComponentInChildren<ParticleSystem> — the active ones, depth first: the extract's node order) and switches off its
   * `_inactiveOnFinish` nodes (fx_extract.py `offFinish`: the bullet, shell, arrow head …), whose particles go with them. The
   * rest keeps running until the caller ends it `finish` s later (the pool's recycle).
   * (2026-10-21, official client) The first system counts every ParticleSystem — also one the extract dropped (no material,
   * a disabled renderer: often the empty container over the others), and for a ParticleEffect root (`ParticleEffect.Awake`
   * with includeInactive) an inactive node's too: the extract writes that node as `mainPs` when it is
   * not the first extracted system of an active node (fx_extract.py main_ps); `Stop(true)` takes its children.
   * A ParticleEffect root's own `_inactiveOnFinish` is `offFinish` as well.
   */
  finishMain() {
    if (this.empty || this.disposed || this.offFinish) return;
    const nodes = this.def.nodes;
    /** @type {(i: number) => boolean} */
    const activeIn = (i) => { for (let k = i; k >= 0; k = nodes[k].parent) if (nodes[k].active === false) return false; return true; };
    /** @type {(o: THREE.Object3D, top: THREE.Object3D) => boolean} */
    const within = (o, top) => { for (let p = o; p && p !== this.unity; p = p.parent) if (p === top) return true; return false; };
    const main = Number.isInteger(this.def.mainPs) && /** @type {number} */ (this.def.mainPs) >= 0 && /** @type {number} */ (this.def.mainPs) < nodes.length ? /** @type {number} */ (this.def.mainPs) : -1;
    const first = main >= 0 ? main : nodes.findIndex((n, i) => n.ps && activeIn(i));
    if (first >= 0) for (const s of this.systems) if (within(s.node, this.nodes[first])) s.stop();
    this.offFinish = (this.def.offFinish || []).map((i) => this.nodes[i]).filter(Boolean);
    for (const o of this.offFinish) {
      o.visible = false;
      for (const s of this.systems) if (within(s.node, o)) { s.stop(); while (s.n) s.kill(s.n - 1); }
    }
  }

  get done() {
    if (this.empty || this.disposed) return true;
    if (this.kids?.some((c) => !c.done)) return false;
    // ended while it waited for its FxDelay: it never shows (the client's FinishMe recycles it hidden)
    if (this.wait > 0) return !!this.stopping;
    if (!this.stopping && this.branches.some((b) => !b.on)) return false;
    const clipDone = (!this.clips.length || this.stopping || (this.time >= this.clipLen && !this.clipLoops)) && this.sms.every((m) => this.smSettled(m));
    return clipDone && this.systems.every((s) => !s.alive) && this.trails.every((t) => !t.alive || this.time > this.clipLen + t.tr.time)
      && (!this.lines.length || !!this.stopping) // local patch: a line stays until its effect is ended
      && (!this.holdMeshes || !!this.stopping);
  }

  /** @param {number} dt */
  update(dt) {
    // disposed: ended here (PLAYER_CAP) while its owner still holds it — it must not keep simulating unseen
    if (this.empty || this.disposed) return;
    if (this.kids) for (const c of this.kids) c.update(dt);
    if (this.wait > 0) { // its root FxDelay / _delayToPlay: nothing drawn or run yet
      if (this.stopping) return;
      const w = Math.min(this.wait, dt);
      this.wait -= w; dt -= w;
      if (this.wait > 1e-9) return;
      this.wait = 0;
      this.unity.visible = true;
    }
    if (this.moveScale !== 1) { const d = dt * this.moveScale; this.shaderAhead += dt - d; dt = d; }   // setMoveScale
    if (this.hold != null && !this.stopping && this.time + dt > this.hold) dt = Math.max(0, this.hold - this.time); // local patch
    this.time += dt;
    if (this.clipTracks.length) this.applyClip(this.time);
    if (this.sms.length) {
      for (const m of this.sms) this.stepSm(m, dt);
      this.applySm();
    }
    for (const b of this.branches) { // a delayed branch shows at its start (its systems start then — the gate below)
      if (this.time < b.at) b.o.visible = false;
      else if (!b.on) { b.on = true; b.o.visible = true; }
    }
    if (this.offFinish) for (const o of this.offFinish) o.visible = false;   // finishMain: off for good
    for (const g of this.gated) { // local patch: m_IsActive — on only while every node above it is
      let on = true;
      for (let p = g.x.node; p && p !== this.unity; p = p.parent) if (!p.visible) { on = false; break; }
      if (on === g.on) continue;
      g.on = on;
      if (g.x instanceof ParticleSystem) { if (!on || !this.stopping) g.x.setActive(on); } else g.x.off = !on;
    }
    this.followWorld();
    for (const s of this.systems) s.update(dt, this.time - (s.node.userData.t0 || 0));
    for (const t of this.trails) t.update(dt, this.time - (t.node.userData.t0 || 0));
    for (const t of this.lines) t.update(dt, this.time - (t.node.userData.t0 || 0)); // local patch
    for (const m of this.meshMatList) setTime(m, this.time - (m.userData.t0 || 0));
    if (this.shaderAhead) this.shaderClock();
  }

  /**
   * 2026-11-04 (official client: `Projectile._UpdateEffectTimeScale` → `ProjectileEffect.ForceApplyPlaybackSpeedMultiplier` →
   * `UpdatePlaybackSpeed`): a projectile's move scale is its main effect's too. Each particle system's `simulationSpeed` and
   * Animator's `speed` take it, each TrailRenderer's `time` and `minVertexDistance` are divided by it. So the whole effect runs at
   * that share of the time here (the ribbons' ages with it), its ribbons record their points that much farther apart, and only
   * what runs on the engine's clock stays as it was: the shaders' `_Time` and the tweens' scrolls (shaderClock).
   * @param {number} k
   */
  setMoveScale(k) {
    if (this.empty) return;
    this.moveScale = k;
    for (const t of this.trails) t.minDistK = 1 / k;
  }

  /** The materials' clock goes on at full rate (setMoveScale): ahead of the effect's by `shaderAhead`. */
  shaderClock() {
    const k = this.shaderAhead;
    /** @type {(m: THREE.ShaderMaterial, n: THREE.Object3D | THREE.ShaderMaterial) => void} */
    const set = (m, n) => setTime(m, this.time - (n.userData.t0 || 0) + k);
    for (const s of this.systems) { set(s.material, s.node); if (s.trailBatch) set(s.trailBatch.material, s.node); }
    for (const t of this.trails) set(t.batch.material, t.node);
    for (const t of this.lines) set(t.batch.material, t.node);
    for (const m of this.meshMatList) set(m, m);
  }

  /**
   * local patch: Unity's world-space particles and trails stay where they were made when the effect moves (赤刃明霄陈 S3's
   * 剑气 carries its trail across the board: the dragon's body and tail are its trails). They are kept in root space here,
   * so when the root has moved since the last frame they are moved back by that much. A still effect: no change.
   * 2026-11-16 (maintainer comparison with an official 호른 recording: her shells' smoke rose up to 0.8 tile above the path
   * the shell flew): also when it has turned or scaled — a projectile's root turns along its flight every frame (bodyTurn),
   * and points kept in its frame swung with it, those behind a lob's falling nose up; so the whole map from the root's
   * last frame to this one (its velocities through the linear part). A degenerate last frame (scale 0) keeps the move only.
   */
  followWorld() {
    const root = this.unity;
    root.updateWorldMatrix(true, false);
    const cur = root.matrixWorld;
    const prev = this.rootM || (this.rootM = cur.clone());
    if (prev.equals(cur)) return;
    const M = tmpM.copy(cur).invert();
    if (Math.abs(prev.determinant()) > 1e-12) M.multiply(prev);
    else { const off = tmpV.setFromMatrixPosition(prev).applyMatrix4(M); M.makeTranslation(off.x, off.y, off.z); }
    prev.copy(cur);
    const e = M.elements;
    for (const s of this.systems) {
      if (s.world) for (let i = 0; i < s.n; i++) { remap(s.pos, i * 3, e); remap(s.vel, i * 3, e, true); }
      if (s.world || s.trailWorld) s.shiftTrails(e);
    }
    for (const t of this.trails) t.shift(e);
  }

  /**
   * Every clip's tracks at effect time t, each held on its own clip's last frame.
   * @param {number} t
   */
  applyClip(t) {
    const v = this.clipV;
    for (const b of this.clipTracks) {
      const tb = Math.max(0, t - (b.off || 0));
      const curves = b.tr.curves, tc = b.loop ? tb % b.len : Math.min(tb, b.len);
      v.length = curves.length;
      for (let i = 0; i < curves.length; i++) v[i] = evalClipCurve(curves[i], tc);
      writeTrack(b, v);
    }
  }

  /**
   * What track `b` drives holds now, in the clip's units (the default a state machine blends towards).
   * @param {TrackBind} b
   * @returns {number[]}
   */
  trackValue(b) {
    const o = b.o;
    switch (b.kind) {
      case 'pos': return o.position.toArray();
      case 'scale': return o.scale.toArray();
      case 'quat': return o.quaternion.toArray();
      case 'euler': clipE.setFromQuaternion(o.quaternion, 'YXZ'); return [clipE.x / D2R, clipE.y / D2R, clipE.z / D2R];
      case 'matComp': return [(b.u.value?.[b.axis] ?? 0) / b.k];
      case 'width': return [b.ln.w ?? 1];
      case 'active': return [o.visible ? 1 : 0];
      case 'set': return [b.bool ? (b.at[b.key] ? 1 : 0) : (Number(b.at[b.key]) || 0) / (b.k || 1)];
      case 'visible': return [b.m.visible ? 1 : 0];
      default: return [Number(b.u.value) || 0];
    }
  }

  /**
   * 2026-10-22 (effect bundle J; docs/rules/fx.md 「애니메이터 상태」): a controller's state machine (fx_extract.py `sms`) as
   * Mecanim runs it — the current state's clip plays from its entry; each frame the transitions out of it (any-state ones
   * first, then its own in their order) are checked: an exit time (normalized; a looping state's below 1 once in every loop,
   * on the frame it is passed — a non-looping state's from then on [ASSUMED]) and every condition (a trigger is used up
   * when its transition starts); a transition blends the two states over its duration (seconds, or of the source state's
   * length with `norm`), both clips running, then the new state goes on from where it got to. Its parameters start at
   * their defaults; the effect's finish (`animFin`), code (setParam) and a buff progress source (`animSrc`) set them.
   * @param {SmDef} d
   * @param {number} k
   * @returns {SmRun}
   */
  newSm(d, k) {
    /** @type {Record<string, unknown>} */
    const p = {};
    for (const [n, [, v]] of Object.entries(d.params || {})) p[n] = v;
    return { d, k, cur: d.def || 0, t: 0, fresh: true, tr: null, p, fin: false };
  }

  /**
   * @param {SmRun} m @param {number} s
   * @returns {FxClip | null}
   */
  smClip(m, s) { return this.clips[/** @type {number} */ (m.d.states[s]?.clip)] || null; }

  /** @param {SmRun} m @param {number} dt */
  stepSm(m, dt) {
    // a nested sub-prefab's Animator starts when its branch shows
    const off = this.nodes[m.d.node]?.userData.t0 || 0;
    const step = Math.max(0, this.time - Math.max(this.time - dt, off));
    if (this.time < off) return;
    for (const s of this.def.animSrc || []) {
      if (s.sm !== m.k) continue;
      const v = this.srcValue(s);
      m.p[s.p] = s.int ? Math.trunc(/** @type {number} */ (v)) : v;
    }
    // 2026-11-16 (official client SetAnimatorTriggerByCondition + BuffsKeyAnimatorTrigger, fx_extract.py `animBuff`): the
    // trigger of the first pair whose buff the owner holds, else the default — set as it plays and again when it changes
    // (the previous one reset); a name the Animator lacks sets nothing
    for (const s of this.def.animBuff || []) {
      if (s.sm !== m.k) continue;
      const v = this.buffTrigger(s);
      if (v === m.bt) continue;
      if (m.bt && m.d.params?.[m.bt]?.[0] === 'trigger') m.p[m.bt] = false;
      m.bt = v;
      if (v && m.d.params?.[v]?.[0] === 'trigger') m.p[v] = true;
    }
    const st = m.d.states[m.cur], clip = this.smClip(m, m.cur), len = clip?.len || 0;
    const prev = m.fresh ? -1e-6 : m.t;
    m.fresh = false;
    m.t += step * (st?.speed ?? 1);
    if (m.tr) {
      m.tr.t += step;
      m.tr.dt += step * (m.d.states[m.tr.to]?.speed ?? 1);
      if (m.tr.t >= m.tr.dur) this.enterState(m, m.tr.to, m.tr.dt);
      return;
    }
    for (const tr of m.d.trans || []) {
      if (tr.from !== m.cur && !(tr.from === -1 && tr.to !== m.cur)) continue;
      if (tr.exit != null && !exitPassed(prev, m.t, len, !!clip?.loop, tr.exit)) continue;
      if (!(tr.cond || []).every(([n, mode, x]) => condOk(m.p[n], mode, x))) continue;
      for (const [n] of tr.cond || []) if (m.d.params?.[n]?.[0] === 'trigger') m.p[n] = false;
      const dur = tr.norm ? tr.dur * len : tr.dur, at = (tr.offset || 0) * (this.smClip(m, tr.to)?.len || 0);
      if (dur > 1e-6) m.tr = { to: tr.to, dur, t: 0, dt: at };
      else this.enterState(m, tr.to, at);
      break;
    }
  }

  /**
   * @param {SmRun} m @param {number} s
   * @param {number} [t]
   */
  enterState(m, s, t = 0) {
    m.cur = s;
    m.t = t;
    m.fresh = true;
    m.tr = null;
  }

  /** The state machines' tracks: each slot the weighted clips of its machine's playing states, the rest its default. */
  applySm() {
    for (const slot of this.smSlots.values()) {
      const m = slot.m, v = slot.v, n = slot.def.length;
      const w = m.tr ? Math.min(1, m.tr.t / m.tr.dur) : 0;
      /** @type {[number | undefined, number, number][]} */
      const play = m.tr ? [[m.d.states[m.cur]?.clip, m.t, 1 - w], [m.d.states[m.tr.to]?.clip, m.tr.dt, w]] : [[m.d.states[m.cur]?.clip, m.t, 1]];
      v.length = n;
      v.fill(0);
      let rest = 1;
      for (const b of slot.tracks) {
        const e = play.find((x) => x[0] === b.ci);
        if (!e || !(e[2] > 0)) continue;
        const tc = b.len > 0 ? (b.loop ? e[1] % b.len : Math.min(e[1], b.len)) : 0;
        const curves = b.tr.curves;
        let sign = 1;
        if (b.kind === 'quat') { // the shorter way round
          let dot = 0;
          for (let i = 0; i < 4; i++) dot += evalClipCurve(curves[i], tc) * slot.def[i];
          sign = dot < 0 ? -1 : 1;
        }
        for (let i = 0; i < n; i++) v[i] += e[2] * sign * evalClipCurve(curves[i], tc);
        rest -= e[2];
      }
      if (rest > 1e-6) for (let i = 0; i < n; i++) v[i] += rest * slot.def[i];
      writeTrack(slot.b, v);
    }
  }

  /**
   * Whether state machine `m` keeps the effect alive: running a clip, a transition, or one about to start by itself.
   * @param {SmRun} m
   * @returns {boolean}
   */
  smSettled(m) {
    const c = this.smClip(m, m.cur);
    const played = !m.tr && (!c || (!c.loop && m.t >= /** @type {number} */ (c.len)));
    // finished: a state its finish switched to plays out unless it loops (the pool recycles it `finish` s later)
    if (this.stopping) return !m.fin || played || (!m.tr && !!c?.loop);
    return played && !(m.d.trans || []).some((t) => (t.from === m.cur || t.from === -1) && !t.cond);
  }

  /** FinishEffectIf `_finishIfCurrentAnimFinish`: its Animator's current state, not looping, has played once. */
  get animEnded() {
    const m = this.sms.find((x) => x.d.node === 0);
    if (m) {
      const c = this.smClip(m, m.cur);
      return !m.tr && !!c && !c.loop && m.t >= /** @type {number} */ (c.len);
    }
    return !!this.clips.length && !this.clipLoops && this.time >= this.clipLen;
  }

  /**
   * 2026-10-22 (effect bundle J): `c` (another instance, made with the same options) plays with this one in its place,
   * updated, finished and removed with it — the module variant a SwitchableWhenContainsEquipment creates on the owner and
   * finishes at its own finish (render/fxgame.js equipVariant).
   */
  /**
   * The floor on the depth-tested materials: what lies under it is cut, a ZDistort material's depth lies on it.
   * @param {number} floor
   */
  applyFloor(floor) {
    this.floor = floor;
    const cut = floor - 0.05;
    /** @type {(m: THREE.ShaderMaterial) => void} */
    const setFloor = (m) => {
      if (m.userData.zflat) m.uniforms.uBaseH.value = m.userData.baseH + floor;
      else if (m.userData.ztest) m.uniforms.uFloor.value = cut;
    };
    this.meshMatList.forEach(setFloor);
    for (const s of this.systems) { setFloor(s.material); if (s.trailBatch) setFloor(s.trailBatch.material); }
    for (const t of this.trails) setFloor(t.batch.material);
    for (const t of this.lines) setFloor(t.batch.material); // local patch
  }

  /**
   * 深水区 (docs/rules/fx.md 「심해 구역의 바닥 자르기」): `z` < 0 = how deep what this effect is on or flies at has sunk: the
   * floor goes down to it, and back to the floor it was made with when `z` is 0 again. Water hides nothing; the road's
   * height is no ground there. Called per frame: unchanged, it touches nothing. No floor (null): stays uncut.
   * @param {number} z
   */
  setSink(z) {
    if (this.floor0 == null) return;
    const f = z < 0 ? Math.min(this.floor0, z) : this.floor0;
    if (f !== this.floor) this.applyFloor(f);
    if (this.kids) for (const c of this.kids) c.setSink(z);
  }

  /** @param {FxInstance | null | undefined} c */
  adopt(c) {
    if (!c || c.empty) return;
    (this.kids ||= []).push(c);
    c.object.position.set(0, 0, 0);
    this.object.add(c.object);
  }

  /** The effect's finish (Effect.FinishMe → each behaviour's OnFinish): its `animFin` set their parameters / states. */
  finishAnim() {
    const fin = Number(this.def.finish) > 0;
    for (const f of this.def.animFin || []) {
      const m = this.sms[f.sm];
      if (!m || (f.rec && !fin)) continue;   // TriggerAnimatorWhenFinish / SwitchAnimatorStateWhenFinish: only with a delayToRecycle
      m.fin = true;
      if (Number.isInteger(f.play)) this.enterState(m, /** @type {number} */ (f.play));
      else if (f.p) m.p[f.p] = f.v;
    }
  }

  /**
   * Set an Animator parameter of the effect's state machines (the client: Animator.SetInteger / SetTrigger …).
   * @param {string} name @param {unknown} v
   */
  setParam(name, v) {
    for (const m of this.sms) if (m.d.params && name in m.d.params) m.p[name] = v;
  }

  /**
   * The owner's buff `key`'s blackboard progress for a BuffProgressFloatSource (`animSrc`): `r` in [0, 1], null = no
   * such buff. Unset, the buff is taken as full [추정: the buff the effect shows is added with it].
   * @param {string} key @param {unknown} r
   */
  setBuffProgress(key, r) { (this.buffProg ||= new Map()).set(key, r == null ? null : Math.min(1, Math.max(0, Number(r) || 0))); }

  /**
   * BuffsKeyAnimatorTrigger.GetValue for `animBuff` entry `s`: `heldBuff(key)` (set by render/fxgame.js from the owner's
   * view) answers true / false, or null when the view cannot tell — taken as held [추정: the effect plays with its buff].
   * @param {AnimBuff} s
   * @returns {string | null | undefined}
   */
  buffTrigger(s) {
    for (const [trigger, key] of s.pairs || []) if (this.heldBuff?.(key) ?? true) return trigger;
    return s.def;
  }

  /** @param {AnimSource} s */
  srcValue(s) {
    if (this.stopping) return s.fin;   // GetValue once finished: `_finishedVal`
    const r = this.buffProg?.has(s.buff) ? this.buffProg.get(s.buff) : 1;
    return r == null ? s.def : keyCurve(s.curve, r);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.kids) for (const c of this.kids) c.dispose();
    for (const s of this.systems) s.dispose();
    for (const t of this.trails) t.dispose();
    for (const t of this.lines) t.dispose(); // local patch
    for (const m of this.meshMatList || this.meshMats) m?.dispose();
    for (const [g, src] of this.meshGeos || []) disposeOwn(g, src);
    for (const sk of this.skeletons || []) sk.dispose();
    this.object.removeFromParent();
    const i = live.indexOf(this);
    if (i >= 0) { live.splice(i, 1); if (this.pinned) livePinned--; }
  }
}

// ---- 2026-11-04: flights of one prefab drawn together --------------------------------------------------------------------
const SCROLL_UNIFORMS = ['uMainSpeed', 'uDisturbSpeed', 'uDissolveSpeed', 'uSpeedB', 'uSpeedC'];
/**
 * A material that looks the same at any effect time: no uniform of it depends on which instance it belongs to (clips aside).
 * @param {THREE.ShaderMaterial} mat
 */
function timeless(mat) {
  if (mat.userData.uvt || mat.userData.zflat) return false;
  for (const k of SCROLL_UNIFORMS) {
    const v = mat.uniforms[k]?.value;
    if (v && (v.x !== 0 || v.y !== 0)) return false;
  }
  return true;
}
/** @type {(a: FxInstance, b: FxInstance) => number} */
const ORDER_FAR_FIRST = (a, b) => /** @type {number} */ (b.flightDepth) - /** @type {number} */ (a.flightDepth);
const NODE_TRACKS = new Set(['pos', 'scale', 'quat', 'euler', 'active', 'visible']);   // clip tracks a merge keeps: transforms are baked per frame
const FLIGHT_STRIP_CAP = 32000;   // points of a merged ribbon draw: two vertices each, in 16-bit indices

/**
 * Is `o` drawn as far as the nodes of its instance go?
 * @param {THREE.Object3D} o @param {THREE.Object3D | null} top
 */
function shown(o, top) {
  for (let p = o; p && p !== top; p = p.parent) if (!p.visible) return false;
  return true;
}

/**
 * A merged draw shows what was added, with the material and order of the renderers it stands for, at the group's origin.
 * @param {THREE.Mesh} mesh @param {boolean} on
 * @param {THREE.ShaderMaterial | undefined} material @param {number | undefined} order
 * @param {number} x @param {number} y @param {number} z
 */
function showMerged(mesh, on, material, order, x, y, z) {
  mesh.visible = on;
  if (!on) return;
  mesh.material = material;
  mesh.renderOrder = order;
  mesh.position.set(x, y, z);
}

/**
 * Particle rows of several systems in one instanced draw, positions baked to the scene.
 * @typedef {RowBatch & { g: THREE.InstancedBufferGeometry, ib: THREE.InstancedInterleavedBuffer }} RowBatchMesh with its geometry `g` and instance buffer `ib` (set by destructuring)
 */
class RowBatch {
  /**
   * @this {RowBatchMesh}
   * @param {THREE.Object3D} scene
   */
  constructor(scene) {
    this.room = PS_ROOM0;
    ({ g: this.g, ib: this.ib } = instanced(QUAD, this.room));
    this.mesh = new THREE.Mesh(this.g);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.n = 0;
  }

  begin() { this.n = 0; }

  /**
   * @this {RowBatchMesh}
   * @param {ParticleSystem} s
   * @param {number} ox @param {number} oy @param {number} oz
   */
  add(s, ox, oy, oz) {
    const count = s.geometry.instanceCount, n = this.n;
    if (n + count > this.room) {
      const room = Math.max(n + count, this.room * 2);
      besideRandom(() => { ({ g: this.g, ib: this.ib } = regrow(this.mesh, this.g, this.ib, QUAD, room)); });
      this.room = room;
    }
    const D = this.ib.array, e = s.mesh.matrixWorld.elements, stretched = s.material.uniforms.uMode.value === 1;
    D.set(s.ib.array.subarray(0, count * IV), n * IV);
    for (let i = n * IV, end = (n + count) * IV; i < end; i += IV) {
      const x = D[i + IV_POS], y = D[i + IV_POS + 1], z = D[i + IV_POS + 2];
      D[i + IV_POS] = e[0] * x + e[4] * y + e[8] * z + e[12] - ox;
      D[i + IV_POS + 1] = e[1] * x + e[5] * y + e[9] * z + e[13] - oy;
      D[i + IV_POS + 2] = e[2] * x + e[6] * y + e[10] * z + e[14] - oz;
      if (!stretched) continue;   // only a stretched quad reads its velocity here
      const vx = D[i + IV_VEL], vy = D[i + IV_VEL + 1], vz = D[i + IV_VEL + 2];
      D[i + IV_VEL] = e[0] * vx + e[4] * vy + e[8] * vz;
      D[i + IV_VEL + 1] = e[1] * vx + e[5] * vy + e[9] * vz;
      D[i + IV_VEL + 2] = e[2] * vx + e[6] * vy + e[10] * vz;
    }
    this.n = n + count;
    return true;
  }

  /**
   * @this {RowBatchMesh}
   * @param {THREE.ShaderMaterial | undefined} material @param {number | undefined} order
   * @param {number} x @param {number} y @param {number} z
   */
  end(material, order, x, y, z) {
    if (this.n) { this.ib.clearUpdateRanges(); this.ib.addUpdateRange(0, this.n * IV); this.ib.needsUpdate = true; }
    this.g.instanceCount = this.n;
    showMerged(this.mesh, this.n > 0, material, order, x, y, z);
  }

  /** @this {RowBatchMesh} */
  dispose() { this.mesh.removeFromParent(); disposeOwn(this.g, QUAD); }
}

/** Ribbons of several renderers in one strip draw (a StripBatch of its own), points baked to the scene. */
class StripRows {
  /** @param {THREE.Object3D} scene @param {THREE.ShaderMaterial} material */
  constructor(scene, material) {
    this.b = /** @type {StripBatchBuf} */ (new StripBatch(material, FLIGHT_STRIP_CAP));
    this.b.geometry.boundingSphere = new THREE.Sphere();   // its origin sets the draw order, as a particle system's
    this.mesh = this.b.mesh;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  begin() { this.b.begin(); }

  /**
   * @returns false when the cap leaves no room: the renderer keeps its own draw.
   * @param {StripBatchBuf} src
   * @param {number} ox @param {number} oy @param {number} oz
   */
  add(src, ox, oy, oz) {
    const b = this.b, base = b.n, need = base + src.n;
    if (need > b.cap) return false;
    if (need > b.room) besideRandom(() => b.build(Math.min(b.cap, Math.max(need, b.room * 2))));
    const D = b.vb.array, e = src.mesh.matrixWorld.elements, floats = src.n * 2 * SV;
    D.set(src.vb.array.subarray(0, floats), base * 2 * SV);
    for (let i = base * 2 * SV, end = i + floats; i < end; i += SV) {
      const x = D[i], y = D[i + 1], z = D[i + 2], tx = D[i + SV_TAN], ty = D[i + SV_TAN + 1], tz = D[i + SV_TAN + 2];
      D[i] = e[0] * x + e[4] * y + e[8] * z + e[12] - ox;
      D[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13] - oy;
      D[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14] - oz;
      D[i + SV_TAN] = e[0] * tx + e[4] * ty + e[8] * tz;
      D[i + SV_TAN + 1] = e[1] * tx + e[5] * ty + e[9] * tz;
      D[i + SV_TAN + 2] = e[2] * tx + e[6] * ty + e[10] * tz;
    }
    const I = b.index.array, S = src.index.array, off = base * 2;
    for (let k = 0; k < src.ni; k++) I[b.ni + k] = S[k] + off;
    b.ni += src.ni;
    b.n = need;
    return true;
  }

  /**
   * @param {THREE.ShaderMaterial | undefined} material @param {number | undefined} order
   * @param {number} x @param {number} y @param {number} z
   */
  end(material, order, x, y, z) {
    this.b.end();
    showMerged(this.mesh, this.b.ni > 0, material, order, x, y, z);
  }

  dispose() { this.mesh.removeFromParent(); this.b.drop(this.b.geometry); }
}

/**
 * Every shot 逻各斯 S3 holds stays in the air many times longer, so a pile of the same projectile cost a draw call per renderer
 * of each (7 for a caster's bolt). The renderers that can move to the scene's frame without changing their look (view-facing,
 * stretched and ribbon ones whose material ignores the effect's clock) go into one draw per renderer of the prefab: same rows,
 * positions baked to the scene, the farthest instance first as three.js sorts them. The particles still simulate in their own
 * systems; a renderer that cannot (a mesh, an aligned quad, a scrolling material) keeps its own draw. Call right before the
 * render, after the instances' update; their `draw` shows their own meshes again in the next update.
 * The look is compared pixel by pixel with the separate draws: test/render/flight-batch.browser.test.js.
 */
export class FlightBatch {
  /** @param {THREE.Object3D} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<FxDef, { sig: number, slots: FlightSlot[], members: FxInstance[] }>} */
    this.groups = new Map();   // def → { sig, slots: [{ pick, batch }], members }
    this.fw = new THREE.Vector3();
    this.cp = new THREE.Vector3();
  }

  /**
   * Which renderers of this prefab merge: read from the first instance, the same for every instance of a prefab and size. Merging
   * moves a renderer's draw past the other instances' renderers of the same sorting order, which only additive ones do not see:
   * a renderer sharing its order merges only when all of that order are additive (the frame's sum is the same in any order).
   * @param {FxInstance} inst
   * @returns {FlightSlot[]}
   */
  slotsOf(inst) {
    const allAdd = new Map(), seen = new Map();   // per renderOrder: every renderer of it additive? how many?
    inst.object.traverse((/** @type {THREE.Mesh} */ o) => {
      if (!o.isMesh) return;
      const add = !!o.material?.uniforms?.uAdditive?.value;
      allAdd.set(o.renderOrder, (allAdd.get(o.renderOrder) ?? true) && add);
      seen.set(o.renderOrder, (seen.get(o.renderOrder) ?? 0) + 1);
    });
    /** @type {(mesh: THREE.Mesh) => boolean | undefined} */
    const free = (mesh) => seen.get(mesh.renderOrder) === 1 || allAdd.get(mesh.renderOrder);
    /** @type {FlightSlot[]} */
    const slots = [];
    inst.systems.forEach((s, i) => {
      const u = s.material.uniforms, mode = u.uMode.value, al = u.uAlign.value;
      if (s.draws && !s.more.length && !s.sortMode && free(s.mesh) && timeless(s.material) && (mode === 1 || (mode === 0 && (al === 0 || al === 3)))) {
        slots.push({ pick: (x) => x.systems[i], id: s.mesh.id, strip: false, batch: null, material: s.material });
      }
      if (s.trailBatch && free(s.trailBatch.mesh) && timeless(s.trailBatch.material)) {
        slots.push({ pick: (x) => /** @type {StripBatch} */ (x.systems[i].trailBatch), id: s.trailBatch.mesh.id, strip: true, batch: null, material: s.trailBatch.material });
      }
    });
    inst.trails.forEach((t, i) => {
      if (t.tr.align !== 1 && free(t.batch.mesh) && timeless(t.batch.material)) {
        slots.push({ pick: (x) => x.trails[i].batch, id: t.batch.mesh.id, strip: true, batch: null, material: t.batch.material });
      }
    });
    return slots.sort((a, b) => a.id - b.id);   // three.js's last tie-break between renderers of one depth and order
  }

  /**
   * `flights`: the live instances to draw together, whichever of them are in this scene. @returns the instances merged.
   * @param {FxInstance[]} flights @param {THREE.PerspectiveCamera} camera
   */
  sync(flights, camera) {
    const groups = this.groups;
    if (!flights.length) { if (groups.size) this.dispose(); return 0; }
    for (const g of groups.values()) g.members.length = 0;
    camera.getWorldDirection(this.fw);
    this.cp.setFromMatrixPosition(camera.matrixWorld);
    for (const inst of flights) {
      if (inst.empty || inst.disposed || inst.stopping || inst.wait > 0 || inst.kids || inst.sms.length || inst.object.parent !== this.scene) continue;
      if (inst.clipTracks.some((b) => !NODE_TRACKS.has(b.kind))) continue;   // a clip on a material: its look is its own instance's
      let g = groups.get(inst.def);
      const sig = inst.systems.length * 1024 + inst.trails.length;
      if (!g) { g = { sig, slots: this.slotsOf(inst), members: [] }; groups.set(inst.def, g); }
      if (g.sig !== sig) continue;
      const p = inst.object.position;
      inst.flightDepth = (p.x - this.cp.x) * this.fw.x + (p.y - this.cp.y) * this.fw.y + (p.z - this.cp.z) * this.fw.z;
      inst.object.updateMatrixWorld(true);
      g.members.push(inst);
    }
    let merged = 0;
    for (const g of groups.values()) {
      const M = g.members;
      if (M.length < 2) { for (const sl of g.slots) if (sl.batch) sl.batch.mesh.visible = false; continue; }
      merged += M.length;
      M.sort(ORDER_FAR_FIRST);
      let ox = 0, oy = 0, oz = 0;
      for (const m of M) { ox += m.object.position.x; oy += m.object.position.y; oz += m.object.position.z; }
      ox /= M.length; oy /= M.length; oz /= M.length;
      for (const sl of g.slots) this.merge(sl, M, ox, oy, oz);
    }
    return merged;
  }

  /**
   * @param {FlightSlot} sl @param {FxInstance[]} M
   * @param {number} ox @param {number} oy @param {number} oz
   */
  merge(sl, M, ox, oy, oz) {
    sl.batch ||= besideRandom(() => (sl.strip ? new StripRows(this.scene, sl.material) : new RowBatch(this.scene)));
    const b = /** @type {MergeBatch} */ (sl.batch);
    b.begin();
    /** @type {ParticleSystem | StripBatch | null} */
    let lead = null;
    for (const m of M) {
      const x = sl.pick(m);
      if (!x.mesh.visible || !shown(x.mesh, m.object)) continue;
      const u = x.material.uniforms;
      if (u.uSysOn.value || (lead && u.uFloor.value !== lead.material.uniforms.uFloor.value)) continue;
      if (sl.strip && !/** @type {StripBatch} */ (x).ni) continue;
      if (b.add(x, ox, oy, oz)) { x.mesh.visible = false; lead ||= x; }
    }
    b.end(lead?.material, lead?.mesh.renderOrder, ox, oy, oz);
  }

  dispose() {
    for (const g of this.groups.values()) for (const sl of g.slots) /** @type {MergeBatch | null} */ (sl.batch)?.dispose();
    this.groups.clear();
  }
}

// ---- 2026-11-12: one prefab laid on many tiles drawn together ----------------------------------------------------------
const LINEAR = [0, 1, 2, 4, 5, 6, 8, 9, 10];
/**
 * Do two world matrices (their elements) turn and scale alike — differ by their translation only?
 * @param {ArrayLike<number>} a @param {ArrayLike<number>} b
 */
function sameLinear(a, b) {
  for (const k of LINEAR) if (Math.abs(a[k] - b[k]) > 1e-6 * (1 + Math.abs(a[k]))) return false;
  return true;
}
const INSTANCE_NAMES = new Set(INSTANCE_ATTRS.map(([name]) => name));
/**
 * The meshes of an instance drawn from rows (particle systems, MeshRenderers), in its nodes' order: alike in every copy.
 * @param {FxInstance} inst
 * @returns {THREE.Mesh[]}
 */
function rowMeshes(inst) {
  /** @type {THREE.Mesh[]} */
  const out = [];
  inst.object.traverse((/** @type {THREE.Mesh} */ o) => {
    const g = o.geometry;
    if (o.isMesh && !o.isSkinnedMesh && g?.isInstancedBufferGeometry && g.getAttribute('iPos')) out.push(o);
  });
  return out;
}
/**
 * Is `o` drawn as far as its scene goes?
 * @type {(o: THREE.Object3D) => boolean}
 */
const shownAll = (o) => shown(o, null);
const tileM3 = new THREE.Matrix3(), tileV = new THREE.Vector3();
/** @type {WeakMap<FxInstance, THREE.Mesh[]>} */
const rowsOf = new WeakMap();   // instance → its row meshes (rowMeshes)
/** @type {(a: THREE.Object3D, b: THREE.Object3D) => number} */
const TILE_FAR_FIRST = (a, b) => b.userData.tileDepth - a.userData.tileDepth;

/** The rows of several copies of one renderer in one instanced draw, in the frame of the first copy's renderer. */
class TileRows {
  /** @param {THREE.Object3D} scene */
  constructor(scene) {
    this.room = PS_ROOM0;
    this.ib = /** @type {THREE.InstancedInterleavedBuffer | null} */ (null); this.g = /** @type {THREE.InstancedBufferGeometry | null} */ (null); this.src = /** @type {THREE.BufferGeometry | null} */ (null);
    this.mesh = new THREE.Mesh(new THREE.InstancedBufferGeometry());
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.n = 0;
  }

  /**
   * A geometry over `src`'s shape (its index, draw range and every attribute but the rows, shared) with `room` rows.
   * @param {THREE.BufferGeometry} src @param {number} room
   */
  build(src, room) {
    const g = new THREE.InstancedBufferGeometry();
    g.index = src.index;
    for (const [name, at] of Object.entries(src.attributes)) if (!INSTANCE_NAMES.has(name)) g.setAttribute(name, at);
    g.setDrawRange(src.drawRange.start, src.drawRange.count);
    const ib = new THREE.InstancedInterleavedBuffer(new Float32Array(room * IV), IV, 1);
    ib.setUsage(THREE.DynamicDrawUsage);
    for (const [name, size, offset] of INSTANCE_ATTRS) g.setAttribute(name, new THREE.InterleavedBufferAttribute(ib, size, offset));
    if (this.ib) ib.array.set(this.ib.array.subarray(0, Math.min(this.ib.array.length, room * IV)));
    if (this.g) this.drop(this.g);
    this.mesh.geometry = g;
    this.g = g; this.ib = ib; this.src = src; this.room = room;
  }

  /**
   * Dispose a geometry of this batch without what it shares with its renderers (three.js deletes every attribute's buffer).
   * @param {THREE.BufferGeometry} g
   */
  drop(g) {
    for (const name of Object.keys(g.attributes)) if (!INSTANCE_NAMES.has(name)) g.deleteAttribute(name);
    g.setIndex(null);
    g.dispose();
  }

  /** @param {THREE.BufferGeometry} src */
  begin(src) {
    this.n = 0;
    if (src !== this.src) besideRandom(() => this.build(src, this.room));   // its shape's geometry: the first copy's
  }

  /**
   * The rows of renderer `x`, moved by (dx, dy, dz) in its own frame.
   * @param {THREE.Mesh} x
   * @param {number} dx @param {number} dy @param {number} dz
   */
  add(x, dx, dy, dz) {
    const g = x.geometry, a = g.getAttribute('iPos'), rows = a.isInterleavedBufferAttribute;
    if (rows && a.data.stride !== IV) return false;
    const count = rows ? g.instanceCount : 1, n = this.n;
    if (!count) return false;
    if (n + count > this.room) { const room = Math.max(n + count, this.room * 2); besideRandom(() => this.build(/** @type {THREE.BufferGeometry} */ (this.src), room)); }
    const D = /** @type {THREE.InstancedInterleavedBuffer} */ (this.ib).array;
    if (rows) D.set(a.data.array.subarray(0, count * IV), n * IV);
    else {   // a MeshRenderer: one row, an attribute each (FxInstance)
      for (const [name, size, offset] of INSTANCE_ATTRS) {
        const at = g.getAttribute(name);
        for (let k = 0; k < size; k++) D[n * IV + offset + k] = at ? at.array[k] : 0;
      }
    }
    for (let i = n * IV, end = (n + count) * IV; i < end; i += IV) { D[i + IV_POS] += dx; D[i + IV_POS + 1] += dy; D[i + IV_POS + 2] += dz; }
    this.n = n + count;
    return true;
  }

  /**
   * Drawn with renderer `x`'s material, order, layers and world matrix.
   * @param {THREE.Mesh | null} x
   */
  end(x) {
    const on = this.n > 0 && !!x;
    if (on) { /** @type {THREE.InstancedInterleavedBuffer} */ (this.ib).clearUpdateRanges(); /** @type {THREE.InstancedInterleavedBuffer} */ (this.ib).addUpdateRange(0, this.n * IV); /** @type {THREE.InstancedInterleavedBuffer} */ (this.ib).needsUpdate = true; }
    this.g && (this.g.instanceCount = this.n);
    this.mesh.visible = on;
    if (!on) return;
    this.mesh.material = x.material;
    this.mesh.renderOrder = x.renderOrder;
    this.mesh.layers.mask = x.layers.mask;
    this.mesh.matrix.copy(x.matrixWorld);
    this.mesh.matrixWorld.copy(x.matrixWorld);
  }

  dispose() { this.mesh.removeFromParent(); if (this.g) this.drop(this.g); this.g = null; this.src = null; }
}

/**
 * 规程's 悲惨之雨 lays its floor on every tile of a field (44 at once) and a battlefield's tile effects lie on a dozen tiles
 * or more: as many draws per renderer (176 for the floor, 4 renderers of which 3 meshes or aligned quads that FlightBatch
 * cannot take). Copies of one prefab at the same effect time, turned and scaled alike — a floor laid on many tiles at once —
 * differ only by where they are: each renderer of them is drawn once, every copy's rows moved into the first copy's frame by
 * the distance between them, so any renderer mode, alignment, material clip or shader clock looks as it did (every copy's
 * material holds the same values). The particles still simulate in their own systems (their own randomness).
 * Call `sync` right before the render, after the instances' update, and `restore` right after it: the copies' own meshes are
 * hidden only for that render (a MeshRenderer's `visible` is its clip's switch). A sorting system and a skinned mesh keep
 * their own draws.
 * The look is compared pixel by pixel with the separate draws: test/render/tile-batch.browser.test.js.
 */
export class TileBatch {
  constructor() {
    this.fw = new THREE.Vector3();
    this.cp = new THREE.Vector3();
    /** @type {Map<FxDef, { slots: number[] | null, n: number, sets: { scene: THREE.Object3D, rows: TileRows[] }[] }>} */
    this.pools = new Map();   // def → { slots: [its mergeable row meshes' indices], n: row meshes, sets: [{ scene, rows: [TileRows per slot] }] }
    /** @type {THREE.Object3D[]} */
    this.hidden = [];
  }

  /**
   * Which of the prefab's row meshes merge (read from one instance: the same for every copy) — all but a sorting system's,
   * which orders its rows by the camera itself. Unlike FlightBatch, renderers sharing a sorting order merge too: the copies
   * lie on distinct tiles, so one draws over another only at their edges, and within each copy those renderers keep their
   * order (the first copy's, the same in each: they are placed alike).
   * @param {THREE.Object3D[]} meshes
   * @returns {number[]}
   */
  slotsOf(meshes) {
    /** @type {number[]} */
    const out = [];
    meshes.forEach((o, i) => { if (!Object.hasOwn(o, 'onBeforeRender')) out.push(i); });
    return out;
  }

  /**
   * `insts`: the live instances laid on tiles, in any scenes; `camera` the one they are drawn with (each renderer's copies
   * farthest first, as three.js orders them apart). @returns the copies merged.
   * @param {FxInstance[]} insts
   * @param {THREE.PerspectiveCamera | null} [camera]
   */
  sync(insts, camera = null) {
    if (camera) { camera.getWorldDirection(this.fw); this.cp.setFromMatrixPosition(camera.matrixWorld); } else this.fw.set(0, 0, 0);
    /** @type {Map<FxDef, Map<string, { scene: THREE.Object3D, members: FxInstance[] }>>} */
    const groups = new Map();   // `${def name} ${scene} ${time …}` → { def, scene, members }
    for (const inst of insts) {
      if (inst.empty || inst.disposed || inst.wait > 0 || inst.kids) continue;
      let scene = inst.object;
      while (scene.parent) scene = scene.parent;
      if (!scene.isScene) continue;
      const sms = inst.sms.length ? inst.sms.map((m) => `${m.cur}:${m.t}:${m.tr ? m.tr.to : ''}`).join(',') : '';
      inst.object.updateMatrixWorld(true);
      const e = inst.object.matrixWorld.elements;   // its turn and scale (a copy turned otherwise goes with its own kind)
      let turn = '';
      for (const k of LINEAR) turn += `${Math.round(e[k] * 1e5)},`;
      const key = `${scene.id} ${inst.time} ${inst.floor} ${inst.stopping ? 1 : 0} ${inst.moveScale} ${inst.shaderAhead} ${sms} ${turn}`;
      const pool = /** @type {{ slots: number[] | null, n: number, sets: { scene: THREE.Object3D, rows: TileRows[] }[] }} */ (this.pools.get(inst.def) || this.pools.set(inst.def, { slots: null, n: 0, sets: [] }).get(inst.def));
      let g = groups.get(inst.def)?.get(key);
      if (!g) {
        if (!groups.has(inst.def)) groups.set(inst.def, new Map());
        /** @type {Map<string, { scene: THREE.Object3D, members: FxInstance[] }>} */ (groups.get(inst.def)).set(key, (g = { scene, members: [] }));
      }
      let rm = rowsOf.get(inst);
      if (!rm) rowsOf.set(inst, (rm = rowMeshes(inst)));
      pool.slots ||= this.slotsOf(rm);
      pool.n ||= rm.length;
      if (rm.length !== pool.n) continue;
      g.members.push(inst);
    }
    let merged = 0;
    for (const [def, pool] of this.pools) {
      const keyed = [...(groups.get(def)?.values() || [])].filter((g) => g.members.length > 1);
      // a set of batches per group of copies, kept for the next frames (in the scene of its group)
      while (pool.sets.length > keyed.length) for (const b of /** @type {{ rows: TileRows[] }} */ (pool.sets.pop()).rows) b.dispose();
      keyed.forEach((g, k) => {
        /** @type {{ scene: THREE.Object3D, rows: TileRows[] } | null | undefined} */
        let set = pool.sets[k];
        if (set && set.scene !== g.scene) { for (const b of set.rows) b.dispose(); set = null; }
        if (!set) pool.sets[k] = set = { scene: g.scene, rows: /** @type {number[]} */ (pool.slots).map(() => besideRandom(() => new TileRows(g.scene))) };
        /** @type {number[]} */ (pool.slots).forEach((i, j) => { merged += this.merge(set.rows[j], g.members, i); });
      });
      if (!pool.sets.length && !groups.has(def)) this.pools.delete(def);
    }
    return merged;
  }

  /**
   * Row mesh `i` of each copy in batch `b`: drawn there when two or more show it alike. @returns the copies merged.
   * @param {TileRows} b @param {FxInstance[]} members @param {number} i
   */
  merge(b, members, i) {
    /** @type {THREE.Mesh | null} */
    let lead = null, c = 0;
    /** @type {THREE.Mesh[]} */
    const take = [];
    for (const m of members) {
      const x = /** @type {THREE.Mesh[]} */ (rowsOf.get(m))[i];
      if (!x.visible || !shownAll(x)) continue;
      if (lead && (x.material.uniforms.uFloor?.value !== lead.material.uniforms.uFloor?.value || !sameLinear(x.matrixWorld.elements, lead.matrixWorld.elements))) continue;
      if (!lead) lead = x;
      const f = x.matrixWorld.elements;
      x.userData.tileDepth = (f[12] - this.cp.x) * this.fw.x + (f[13] - this.cp.y) * this.fw.y + (f[14] - this.cp.z) * this.fw.z;
      take.push(x);
      c++;
    }
    if (c < 2) { b.n = 0; b.end(null); return 0; }
    take.sort(TILE_FAR_FIRST);
    b.begin(/** @type {THREE.Mesh} */ (lead).geometry);
    const e = /** @type {THREE.Mesh} */ (lead).matrixWorld.elements;
    tileM3.setFromMatrix4(/** @type {THREE.Mesh} */ (lead).matrixWorld).invert();
    let n = 0;
    for (const x of take) {
      const f = x.matrixWorld.elements;
      tileV.set(f[12] - e[12], f[13] - e[13], f[14] - e[14]).applyMatrix3(tileM3);
      if (!b.add(x, tileV.x, tileV.y, tileV.z)) continue;
      x.visible = false;
      this.hidden.push(x);
      n++;
    }
    b.end(lead);
    return n;
  }

  /** After the render: the copies' own meshes as they were, the merged draws off until the next sync. */
  restore() {
    for (const x of this.hidden) x.visible = true;
    this.hidden.length = 0;
    for (const pool of this.pools.values()) for (const set of pool.sets) for (const b of set.rows) b.mesh.visible = false;
  }

  dispose() {
    this.restore();
    for (const pool of this.pools.values()) for (const set of pool.sets) for (const b of set.rows) b.dispose();
    this.pools.clear();
  }
}

/** Live particle count (diagnostics / tests). */
export const fxStats = () => ({ particles: liveParticles, instances: live.length });
