// render/fxgame.js — the official battle effects in the game's battle view (local patch, docs/LOCAL-PATCH.md).
//
// render/app.js calls three hooks: onEvent(e, views) for every battle event it handles, update(dt, cam, vp) each frame,
// clear() when a battle ends. Effects play only for operators whose effect bundle was extracted from a local client
// (tools/local-extract/fx_extract.py → /assets/local/fx/index.json); everyone else keeps the procedural FX of
// render/fx.js, which also keep playing for these operators (damage numbers, projectiles, hit flashes).
//
// Bindings (2026-10-07, docs/LOCAL-PATCH.md 「스킬 중 공격 이펙트」): when /assets/local/fx/modes.json (tools/local-extract/
// char_modes.py: the character prefab's attack modes with the effects their attacks cast / hit) lists the operator, its
// attacks play their mode's effects — the running skill's mode (shared/skill-modes.js) on EVERY attack of the skill, like the
// official client (its `_castEffects` sit on the skill mode's attack ability; the activation itself shows only the buff
// loop, plus the mode's own buff effects — `attach`, e.g. 丰川祥子 S3's range), and the impacts that mode's hit effects
// (≤ 2). A skill that switches no mode keeps the name mapping below.
// Trails (local patch 2026-10-07): a ranged attack whose mode binds a projectile `trail` (the projectile's `_mainEffect`) flies
// that prefab from the shooter to its (moving) target over the sim's flight time (fx.js projSpeed — it lands with the damage,
// lobbed shots on fx.js's arc) instead of render/fx.js's procedural shot (arrowKind 'officialTrail'); a trail's first shot
// keeps the procedural one while its file loads, and past MAX_TRAILS live trails or at load level 3 the procedural shot stays.
// Clock: every effect, its gaps and its end run on the battle clock (`rate`, the game speed — the official effects use
// scaled time), not only the notes.
// Event → effect (render/fxmap.js effectsFor, by the client's prefab names):
//   'skill' on   → <op>_skill_0N_start_* on the caster, <op>_skill_0N_buff_* looping on it until 'skill' off / death
//   'atk'        → <op>_attack_start_* on the attacker (normal attacks; skill attacks show the skill's hit)
//   'dmg'        → <op>_attack_hit_01 / <op>_skill_0N_hit_01 on the target of that attacker's last attack (≤ HIT_GAP_S; local
//                  patch: once per attack — the first damage after it)
// Effects follow their unit's rendered position and facing.
//
// Cost: nothing is loaded (three.js, the player, the files) until an operator with an extracted bundle acts; the layer
// is two transparent canvases (pointer-events none) — the effects on the caster (buff loops, local patch: its cast / skill
// start too) under the units canvas (the operator on top; above it on the 2D board, whose backdrop is opaque), the hits on
// targets, trails and notes over it — each drawn only while one of its
// effects is alive, at most
// at device pixel ratio 1.5 (1 at 'medium'); quality 'low' turns the layer off. render/fxplayer.js caps particles and
// effects (MAX_INSTANCES, the oldest ends). The view's adaptive load level (render/app.js adaptLoad, as render/fx.js
// drops its extras at level ≥ 2): level 2 plays 'high' as 'medium', level 3 also skips the normal-attack effects.
// stats() → { live, loaded, updateMs, renderMs, calls, particles, notes } (view.stats().fxGame).
// 丰川祥子's notes (kits/ops/op-oblvns.js, battle.fx 'oblvnsNote' born / track / free / hit / gone): each note is her client trail
// prefab (fxmap.js NOTE_FX) flown here between the sim's events — free flight on its heading (the 扩张正弦 weave drawn
// around it), tracing the target's view, the hit prefab on arrival (a piano note flies on 0.5 s); w = 2 draws two notes.
// While they play, her 'atk' arrow of render/fx.js is not drawn (the event's projectile kind is replaced); without the
// official effects (quality low, no WebP, no bundle, load level 3 for normal-attack notes) the arrow stays.

import { syncThreeCamera } from './projection.js';
import { fxBundleOf, effectsFor } from './fxmap.js';
import { noteEffects, NOTE_FLIGHT } from './fxmap.js';
import { attackMode, boundEffects } from './fxmap.js'; // local patch: the mode bindings (modes.json)
import { activationEffects } from './fxmap.js'; // local patch: a skill activation's effects
import { projSpeed } from './fx.js'; // local patch: the trails' flight time (the sim's projectile speeds)
import { bodyZ } from './fx.js'; // local patch: status effects at a unit's head / body (fxstatus.js)
import { wallTiles } from './fx.js'; // local patch: 余 S3's wall tiles
import { PROJ } from './style.js';
import { UF } from '../../../shared/constants.js'; // local patch: the views' skill flag (skillByFlag)

const INDEX_URL = '/assets/local/fx/index.json';
const MODES_URL = '/assets/local/fx/modes.json';   // effect bindings per attack mode (tools/local-extract/char_modes.py)
const MAX_HIT_FX = 2;
const MAX_TRAILS = 12;      // official projectile trails in flight at once (then fx.js's procedural shots)
const TRAIL_Z = 0.35;       // their height over the ground (tiles) at both ends [ASSUMED]
const HIT_GAP_S = 0.12;        // one hit effect per attacker → target pair within this time (multi-hit skills)
const ATTACK_GAP_S = 0.2;
let webpPromise = null;
/** Whether the browser decodes (lossy + alpha) WebP — a 1×1 probe image. */
const webpOk = () => (webpPromise ||= new Promise((resolve) => {
  if (typeof Image === 'undefined') { resolve(false); return; }
  const img = new Image();
  img.onload = () => resolve(img.width === 1);
  img.onerror = () => resolve(false);
  img.src = 'data:image/webp;base64,UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAARBxAR/Q9ERP8DAABWUDggGAAAABQBAJ0BKgEAAQAAAP4AAA3AAP7mtQAAAA==';
}));
let indexPromise = null;
const loadIndex = () => (indexPromise ||= fetch(INDEX_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null));
let modesPromise = null;
const loadModes = () => (modesPromise ||= fetch(MODES_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null));

/**
 * @param {{ host: HTMLElement, above: HTMLCanvasElement, quality: () => string, load?: () => number, under?: () => boolean, fieldRect?: () => any }} o
 *   load: the view's adaptive load level 0–3 (render/app.js); under: whatever lies below the units canvas shows through
 *   it (the 3D board is on — the 2D board paints an opaque backdrop on the units canvas itself); fieldRect: the battle
 *   field's tile rect (local patch: 余 S3's wall runs across it, fx.js wallTiles)
 */
export function createFxLayer({ host, above, quality, load = () => 0, under = () => false, rate = () => 1, fieldRect = () => null }) {
  let index = null, modes = null;
  if (typeof fetch === 'function') { loadIndex().then((i) => { index = i; }); loadModes().then((m) => { modes = m; }); }
  let mod = null, loading = null, failed = false;
  let webp = null;   // the WebP probe's answer once known (the note layer decides synchronously)
  if (typeof Image !== 'undefined') webpOk().then((v) => { webp = v; });
  let camera = null, lib = null, size = null;
  // two canvases: the effects on the caster (a skill's looping buff; local patch: its cast / skill start too) under the
  // units canvas, so the operator stays on top of them; the hits on targets, the trails and the moving 剑气 over it.
  // Without a see-through units canvas (2D board) the lower one moves above too.
  const layers = { under: null, over: null, split: null };   // { canvas, renderer, scene, n: live count }
  // local patch (user report 2026-10-07, items 1 / 8): `split` is a scene drawn on both canvases — each renderer of its effects
  // on the side its Unity sorting puts it (fxplayer.js FxInstance split: sortingOrder > 0 / fudge < 0 in front of the units,
  // the rest behind; 마터호른 S2's dome has a back and a front copy). The effects on units go there at quality 'high'; at
  // 'medium' (one upload per effect, not two) they keep the old rule: the caster's under the units, the rest over.
  const live = [];                   // { inst, view: followed view | null, owner: unit id, buff: boolean, layer }
  const lastAtk = new Map();         // target id → { src view, t }
  const lastHit = new Map();         // `${src}:${tgt}` → t
  const lastAttackFx = new Map();    // src id → t
  const movers = new Map();          // caster id → { inst, at, t } — effects carried along a kit's moving fx
  const notes = new Map();           // 丰川祥子's notes: sim note id → { pos, dx, dy, mode, state, … } (noteFx)
  let clockS = 0;
  let lastViews = null;               // the views map of the last event (the notes trace their targets' views)
  const perf = { updateMs: 0, renderMs: 0, calls: 0 };
  const recent = []; // local patch: the last prefabs started ({ n: name, t: battle clock, seq }) — stats().recent, /debug.html's log
  let recentSeq = 0;

  const level = () => { try { return load() || 0; } catch { return 0; } };
  const q = () => {
    const v = quality();
    if (v === 'low') return 'low';
    return v === 'medium' || level() >= 2 ? 'medium' : 'high';
  };
  const bundleOf = (v) => {
    const id = v && v.info && (v.info.spine || v.info.defId);
    const b = id ? fxBundleOf(id) : null;
    return b && index && index.bundles && index.bundles[b] ? { bundle: b, prefabs: index.bundles[b] } : null;
  };

  async function ensure() {
    if (mod) return true;
    if (failed || q() === 'low') return false;
    // the extracted textures are WebP (tools/local-extract/fx_extract.py): a browser without it (iOS Safari < 14) keeps
    // the procedural FX
    if (!(await webpOk())) { failed = true; return false; }
    loading ||= Promise.all([import('../../vendor/three.module.js'), import('./fxplayer.js')]).then(([THREE, fxp]) => {
      const make = (before, z) => {
        const canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'none', pointerEvents: 'none', zIndex: z });
        host.insertBefore(canvas, before);
        // local patch: premultiplied — the page adds an additive effect's light and lets the alpha (fxplayer.js blendSrcAlpha) cover
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
        renderer.setClearColor(0x000000, 0);
        return { canvas, renderer, scene: new THREE.Scene(), n: 0 };
      };
      // under: z 1 like the units canvas and before it in the DOM (above the 3D board's z 0)
      layers.under = make(above, '1');
      layers.over = make(above.nextSibling, '2');
      layers.split = { scene: new THREE.Scene(), n: 0 }; // local patch
      camera = new THREE.PerspectiveCamera();
      size = new THREE.Vector2();
      lib = new fxp.FxLibrary('/assets/local/fx/');
      mod = { THREE, fxp };
    }).catch((err) => { failed = true; console.warn('[fx] official effects unavailable', err); });
    await loading;
    return !!mod;
  }

  // units that left the field: an effect bound to one (buff / one-shot on it) whose file finished loading after its
  // 'die' would never be stopped — a 棋子 placed and used up in the same tick kept its looping cross for good
  const gone = new Set();
  function addLive(inst, entry, layer) {
    if (entry.owner != null && gone.has(entry.owner) && (entry.buff || entry.onCaster)) { inst.dispose(); return; }
    recent.push({ n: inst.def?.name ?? inst.name ?? '?', t: clockS, seq: ++recentSeq }); if (recent.length > 24) recent.shift(); // local patch
    layer.scene.add(inst.object);
    layer.n++;
    live.push({ inst, ...entry, layer });
  }
  function dropLive(l) { l.inst.dispose(); l.layer.n--; }
  /** A layer's canvas is shown only while it has a live effect; the lower one sits above the units on the 2D board. */
  function showLayers() {
    let below = false;
    try { below = !!under(); } catch { /* keep it above */ }
    const z = below ? '1' : '2';
    if (layers.under.canvas.style.zIndex !== z) layers.under.canvas.style.zIndex = z;
    for (const L of [layers.under, layers.over]) {
      const d = L.n || layers.split.n ? 'block' : 'none'; // local patch: split effects draw on both
      if (L.canvas.style.display !== d) L.canvas.style.display = d;
    }
  }

  async function play(view, kind, skillIndex = 0, { at = null, buff = false, names: given = null } = {}) {
    const b = bundleOf(view);
    if (!b) return;
    const names = given || effectsFor(b.prefabs, kind, skillIndex);
    if (!names.length || !(await ensure())) return;
    for (const n of names) {
      const def = await lib.load(b.bundle, n);
      if (!mod) return;   // destroyed while the file loaded (the view left the battle)
      if (!def) continue;
      const ground = at || view;
      const anchor = lifted(ground, def); // local patch: its _spawnLocation
      // local patch (user report 2026-10-07: 野鬃 S2 stood upright): an effect the client turns to the unit's facing
      // (charpack / skills.ab `_useFourDirectionalFace`: its 'rotation_z' pivot, stored at an editing angle) is turned, not mirrored
      const turn = turns(view).has(n) && def.nodes?.some((d) => d.name === 'rotation_z');
      // only the effects that go to the split scene (on the caster) split — a hit on a target goes to the upper canvas,
      // which draws layer 0 only (split, every blast on a target was invisible at 'high' on the 3D board: 烛煌 S3)
      const split = (buff || !at) && splitOn();
      // local patch: cut at the ground the unit stands on (fxplayer.js floor — a tile's height, not a flyer's hover)
      const inst = new mod.fxp.FxInstance(def, { quality: q(), facing: turn ? 1 : (view.visFacing ?? view.facing ?? 1) < 0 ? -1 : 1, split, floor: ground.z || 0 });
      if (turn) aimMover(inst, facingDir(view));
      inst.object.position.set(anchor.x, anchor.y, anchor.z || 0);
      // a one-shot on the caster (not a hit on a target) ends with its prefab's duration even if a system loops —
      // 望's S3 wang_skill_03_range_start (looping 'line1/2', the range cross) stayed on the board for good
      const until = buff ? null : clockS + (def.duration || 3) + 0.5;
      // local patch (user 2026-10-07: the skill effects covered the operator): every effect on the caster — its cast /
      // skill start as well as its buff loops — goes under the units; the hits on a target stay over
      // (local patch, user report 2026-10-07: 마터호른 S2's dome must cover her) at 'high' the caster's effects split by their renderers' sorting
      addLive(inst, { view: anchor, owner: view.id ?? view.info?.id, buff, onCaster: !at, until }, split ? layers.split : buff || !at ? layers.under : layers.over);
      // the player's own cap: it has already ended the oldest (done, dispose is a no-op) — the same one here
      while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
    }
  }

  /** local patch: whether the effects on units split by sorting now ('high', a see-through units canvas — the 3D board). */
  function splitOn() {
    if (q() !== 'high') return false;
    try { return !!under(); } catch { return false; }
  }

  function stopBuffs(ownerId, now = false) {
    for (const l of live) if (l.buff && l.owner === ownerId) l.inst.stop(now);
  }
  /** The unit left the field (knocked out / withdrawn): its buffs and the one-shots on it end; hits it made on targets play on. */
  function stopOwned(ownerId) {
    for (const l of live) if (l.owner === ownerId && (l.buff || l.onCaster)) l.inst.stop(true);
  }

  // the trail's 'rotation_z' node is the client's heading pivot: the dragon's head points along +x at 0° (the prefab's
  // own 90° = UP); board x = column, y = row (UP = +row). Re-aimed on every 'fx' step, so it turns with the 剑气 at walls
  const MOVER_DEG = { RIGHT: 0, UP: 90, LEFT: 180, DOWN: 270 };
  function aimMover(inst, dir) {
    const deg = MOVER_DEG[dir];
    const pivot = deg != null && inst.nodes?.find((o) => o && o.name === 'rotation_z');
    if (pivot) pivot.rotation.set(0, 0, (deg * Math.PI) / 180);
  }

  // 望's 棋子 (kits/ops/op-wang.js): its effects are the token's own (pkgrps/btl_pfb_fx_token_3.ab → bundle wang_token).
  // 'zone' with the stone token = it went off (skill 1 取势 / 2 连星 along its link axes / 3 the x-1 diamond);
  // 'wangLink' = it activated (the golden cross, once); 'summon' of a stone = placed. The ground marks (the stone's own
  // looping cross, the link line) go on the lower layer, under the stone's model; the explosions over it. [ASSUMED] which prefab is which,
  // by name; S2's line blast is turned by its 'rotation_z' pivot (h = 0°, v = 90°).
  const STONE = 'token_10064_wang_stone1', STONE_FX = 'wang_token';
  const STONE_HIT = {
    1: ['token_wang_skill_01_hit'],
    2: ['token_wang_skill_02_hit', 'token_wang_skill_02_hit_02'],
    3: ['token_wang_skill_03_hit', 'token_wang_skill_03_hit_02', 'token_wang_skill_03_hit_03'],
  };
  // owner: a stone's id — the effect follows it as a buff and stops on its 'die' (used up / withdrawn); without an
  // owner it is a one-shot, stopped after its prefab's duration even if a system loops (token_wang_birth_01_buff's
  // looping 'sz' kept its cross on the board forever)
  async function playAt(names, at, { deg = null, owner = null, under = false } = {}) {
    const prefabs = index?.bundles?.[STONE_FX];
    if (!prefabs || !(await ensure())) return;
    for (const n of names) {
      if (!prefabs.includes(n)) continue;
      const def = await lib.load(STONE_FX, n);
      if (!mod) return;   // destroyed while the file loaded
      if (!def) continue;
      const inst = new mod.fxp.FxInstance(def, { quality: q() });
      if (deg != null) { const p = inst.nodes?.find((o) => o && o.name === 'rotation_z'); if (p) p.rotation.set(0, 0, (deg * Math.PI) / 180); }
      inst.object.position.set(at.x, at.y, at.z || 0);
      const until = owner == null ? clockS + (def.duration || 3) + 0.5 : Infinity;
      addLive(inst, { view: owner == null ? null : at, owner, buff: owner != null, until }, under ? layers.under : layers.over);
      while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
    }
  }
  // ---- local patch (LOCAL-PATCH.md 「전투 화면 UI」 ⑤): status effects (render/fxstatus.js decides which, when) -------------
  // A shared-bundle prefab (battle/prefabs/effects/buff.ab, common.ab) looping on a unit while its status lasts, at `frac`
  // of its drawn height (the prefab's _spawnLocation: feet 0 / body .5 / head 1, through fx.js bodyZ), over the units
  // (the 冻结 block encases the model, the marks float over heads); stopped by statusOff, the unit's death or clear().
  // The prefabs are loops by their root flag (_isLoop 1) though some systems run once (buff_silence: 1 s) — a status
  // effect that ends while its status is still on starts again (update).
  let camRef = null;
  // local patch (user report 2026-10-07, video: 史尔特尔's blast sits on the enemy's body): the prefab root's
  // `_spawnLocation` (fx_extract.py spawn: 2 body / HIT point, 4 head; 1 feet, 5 ground centre and the rest stay on the
  // ground) lifts an effect placed on a unit; points stay where they are
  const SPAWN_FRAC = { 2: 0.5, 4: 1.1 };
  function lifted(v, def) {
    const frac = SPAWN_FRAC[def?.spawn];
    if (!frac || !v || !(v.info || v.screen)) return v;
    return {
      get x() { return v.x; }, get y() { return v.y; },
      get z() { return camRef ? bodyZ(camRef, v, frac) : (v.z || 0) + (v.hover || 0) + (v._headTiles || 1.2) * frac; },
      get alive() { return v.alive; }, get remove() { return v.remove; },
      id: v.id, info: v.info,
    };
  }
  const ownerOf = (v) => v.id ?? v.info?.id;
  const statusFailed = new Set();   // `${bundle}/${name}` that did not load: their units keep the icon (statusReady false)
  async function playStatus(view, bundle, name, key, frac, hold = null) {
    if (!(await ensure())) return;
    const def = await lib.load(bundle, name);
    if (mod && !def) { statusFailed.add(`${bundle}/${name}`); view._fxStatusOn?.delete(key); return; }
    if (!mod || !view._fxStatusOn?.has(key)) return;   // destroyed, or turned off while it loaded
    const anchor = {
      get x() { return view.x; }, get y() { return view.y; },
      get z() { return frac > 0 && camRef ? bodyZ(camRef, view, frac) : (view.z || 0) + (view.hover || 0); },
      get alive() { return view.alive; }, get remove() { return view.remove; },
    };
    // local patch: status prefabs are NOT split — their renderers are sortingOrder 0 / fudge 0 (buff_autochess_frozen's
    // block too), which the split puts behind the unit, while the client sorts them by depth and the 冻结 block covers the
    // model (user capture 9); drawn over the units as before (the snowflake / fist over heads, capture 10)
    const split = false;
    const inst = new mod.fxp.FxInstance(def, { quality: q(), facing: (view.visFacing ?? view.facing ?? 1) < 0 ? -1 : 1, split, floor: view.z || 0, hold });
    inst.object.position.set(anchor.x, anchor.y, anchor.z);
    addLive(inst, { view: anchor, owner: ownerOf(view), buff: true, status: key, again: () => playStatus(view, bundle, name, key, frac, hold), unit: view }, split ? layers.split : layers.over);
    while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
  }

  function stoneFx(e, views) {
    const o = e[4];
    if (!o || typeof o !== 'object') return false;
    const at = { x: Number(e[2]), y: Number(e[3]), z: 0 };
    if (e[1] === 'zone' && o.token === STONE) {
      const names = STONE_HIT[o.skill] || STONE_HIT[1];
      if (o.skill === 2) {
        const [hit, ...rest] = names;
        const axes = Array.isArray(o.axes) && o.axes.length ? o.axes : ['h'];
        for (const a of axes) playAt([hit], at, { deg: a === 'v' ? 90 : 0 });
        playAt(rest, at);
      } else playAt(names, at);
      return true;
    }
    if (e[1] === 'wangLink') { if (o.first) playAt(['token_wang_passive_01_line'], at, { under: true }); return true; }
    if (e[1] === 'summon') {
      const v = views.get(o.id);
      if (v?.info && (v.info.defId === STONE || v.info.spine === STONE)) { playAt(['token_wang_birth_01_buff'], v, { owner: o.id, under: true }); return true; }
    }
    return false;
  }

  // ---- official projectile trails (local patch 2026-10-07, see the header) ----
  const trails = [];               // { inst, tgt view, x0, y0, tx, ty, k, dur, arc }
  const trailReady = new Set();    // `bundle/prefab` loaded once: its shots draw the official trail from then on
  const trailAtks = new WeakSet(); // 'atk' tuples drawn here (fx.js skips its shot: arrowKind)
  /** Whether this attack flies its mode's official trail (decided now, synchronously, for arrowKind); loads it otherwise. */
  function trailShot(e, src, tgt, mode) {
    if (!tgt || mode == null || level() >= 3 || failed) return false;
    const spec = PROJ[e[3]];
    const name = spec ? bound(src, mode, 'trail')[0] : null;
    if (!name) return false;
    const b = bundleOf(src);
    const key = `${b.bundle}/${name}`;
    if (!trailReady.has(key)) {
      ensure().then((ok) => (ok ? lib.load(b.bundle, name) : null)).then((def) => { if (def) trailReady.add(key); }, () => {});
      return false;
    }
    if (trails.length >= MAX_TRAILS) return false;
    trailAtks.add(e);
    const dx = tgt.x - src.x, dy = tgt.y - src.y, dist = Math.hypot(dx, dy);
    const rec = { inst: null, tgt, x0: src.x, y0: src.y, tx: tgt.x, ty: tgt.y, k: 0, dur: Math.max(0.04, dist / projSpeed(e[3])),
      arc: spec.arc ? spec.arc * Math.min(1.8, Math.max(0.6, 0.45 + dist * 0.18)) : 0 };
    trails.push(rec);
    lib.load(b.bundle, name).then((def) => {
      if (!mod || !def || !trails.includes(rec)) { const i = trails.indexOf(rec); if (i >= 0) trails.splice(i, 1); return; }
      const inst = new mod.fxp.FxInstance(def, { quality: q() });
      rec.inst = inst;
      placeTrail(rec);
      addLive(inst, { view: null, owner: null, buff: false, until: clockS + rec.dur + (def.duration || 2) + 0.5 }, layers.over);
      while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
    }, () => {});
    return true;
  }
  /** A trail at flight fraction k: on the line to the target's current spot (a lob on its arc), turned along it. */
  function placeTrail(rec) {
    const t = rec.tgt;
    if (t && t.alive !== false && !t.remove && Number.isFinite(t.x)) { rec.tx = t.x; rec.ty = t.y; }
    const k = Math.min(1, rec.k);
    if (rec.dropZ) {   // local patch: a shell falling straight down (蕾缪안 S3), the trail's +x turned to −z
      if (!rec.inst) return;
      rec.inst.object.position.set(rec.x0, rec.y0, rec.dropZ * (1 - k));
      rec.inst.object.rotation.set(0, Math.PI / 2, 0);
      return;
    }
    const x = rec.x0 + (rec.tx - rec.x0) * k, y = rec.y0 + (rec.ty - rec.y0) * k;
    const z = TRAIL_Z + (rec.arc ? rec.arc * 4 * k * (1 - k) : 0);
    if (!rec.inst) return;
    rec.inst.object.position.set(x, y, z);
    rec.inst.object.rotation.set(0, 0, Math.atan2(rec.ty - rec.y0, rec.tx - rec.x0));
  }
  /** Fly the trails one frame (game time); a trail that arrived stops emitting and fades out. */
  function stepTrails(g) {
    for (let i = trails.length - 1; i >= 0; i--) {
      const rec = trails[i];
      rec.k += g / rec.dur;
      placeTrail(rec);
      if (rec.k >= 1) { rec.inst?.stop(); trails.splice(i, 1); }
    }
  }

  // ---- 荒芜拉普兰德 S3's wolves (local patch, user report 2026-10-06: no wolf effect) ----
  // The sim's drones are virtual (kits/tier6.js whitw2); a local-patch hook there sends their positions every 0.15 s
  // ('whitw2Drones' {id, d: [x, y, …]}). In the client each S3 drone is a projectile_chr_whitw2_funnel_s3_1…4 whose
  // _mainEffect is whitw2_skill_03_token_trail_01 (EN battle/prefabs/[uc]projectiles.ab) — the wolf; it glides to the
  // latest sample, ends with the skill ('skill' off → stopBuffs) or her 'die'. A drone's attack ('drone') plays
  // whitw2_skill_03_token_hit_01 [ASSUMED: by name — the funnel prefabs carry no hit list].
  const WOLF = { bundle: 'whitw2', fly: 'whitw2_skill_03_token_trail_01', hit: 'whitw2_skill_03_token_hit_01', z: 0.35 };
  const wolves = new Map();   // her id → { list: [{ inst, at, to }], pending }
  const wolvesOn = () => !!(index?.bundles?.[WOLF.bundle]?.includes(WOLF.fly) && q() !== 'low' && !failed);
  function wolfFx(e) {
    const o = e[4];
    if (!wolvesOn() || o?.id == null) return false;
    ownFx.add(e);
    const d = Array.isArray(o.d) ? o.d : [];
    let w = wolves.get(o.id);
    if (!w) { w = { list: [], pending: 0 }; wolves.set(o.id, w); }
    for (let i = 0; i < d.length / 2; i++) {
      const to = { x: Number(d[2 * i]), y: Number(d[2 * i + 1]) };
      if (w.list[i]) { w.list[i].to = to; continue; }
      if (i < w.list.length + w.pending) continue;   // still loading
      w.pending++;
      (async () => {
        const def = (await ensure()) ? await lib.load(WOLF.bundle, WOLF.fly) : null;
        w.pending--;
        if (!def || !mod || wolves.get(o.id) !== w) return;
        const facing = to.x < Number(e[2]) ? -1 : 1;   // [ASSUMED] the wolf faces away from her, left or right
        const inst = new mod.fxp.FxInstance(def, { quality: q(), facing });
        const at = { x: to.x, y: to.y, z: WOLF.z };
        inst.object.position.set(at.x, at.y, at.z);
        w.list.push({ inst, at, to });
        addLive(inst, { view: at, owner: o.id, buff: true }, layers.over);
      })();
    }
    return true;
  }
  function stepWolves(dt) {
    const k = Math.min(1, dt * 8);
    for (const w of wolves.values()) for (const m of w.list) {
      m.at.x += (m.to.x - m.at.x) * k; m.at.y += (m.to.y - m.at.y) * k;
      if (m.inst.time > 6) m.inst.time = 1;   // the prefab lasts 7 s: keep the wolf for the whole skill
    }
  }
  function endWolves(id) { wolves.delete(id); }

  // ---- 丰川祥子's notes (see the header) ----
  const NOTE_Z = 0.35;           // flight height over the ground (tiles)
  const gameRate = () => { try { const r = Number(rate()); return r > 0 ? r : 1; } catch { return 1; } };
  /**
   * Whether her notes play as official effects now — decided as the events come, so the arrow can step aside; under
   * load level 3 only while a skill runs (S1's notes count as one), like the normal-attack effects.
   */
  const notesOn = (src, skill = false) => !!(index && q() !== 'low' && !failed && webp === true && bundleOf(src)
    && !noteBroken.has(bundleOf(src).bundle) && (skill || src._fxSkillOn || level() < 3));
  // bundles whose note trail failed to load: her attacks fall back to render/fx.js's arrow and hit effect (review
  // 2026-10-06: the arrow was dropped before anything knew the trail could load — her attacks went invisible)
  const noteBroken = new Set();
  // 'atk' events whose arrow her note replaces (app.js asks arrowKind; the event tuple itself is left as it came)
  const noteAtks = new WeakSet();
  // sim fx events drawn here with an official effect (赤刃明霄陈 S3 剑气): render/fx.js skips its 2D stand-in
  const ownFx = new WeakSet();
  async function startNote(rec, src) {
    const b = bundleOf(src);
    const fx = noteEffects(rec.mode, rec.fan);
    if (!b || !fx || !b.prefabs.includes(fx.trail)) { if (b) noteBroken.add(b.bundle); return; }
    if (!(await ensure())) return;
    const def = await lib.load(b.bundle, fx.trail);
    if (!def) noteBroken.add(b.bundle);
    if (!def || !mod || rec.ended) return;
    for (const c of rec.copies) {
      const inst = new mod.fxp.FxInstance(def, { quality: q() });
      inst.object.position.set(c.pos.x, c.pos.y, c.pos.z);
      c.inst = inst;
      addLive(inst, { view: c.pos, owner: rec.owner, buff: false, game: true }, layers.over);
      while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
    }
  }
  function endNote(rec) {
    rec.ended = true;
    for (const c of rec.copies) c.inst?.stop();
    notes.delete(rec.id);
  }
  function noteFx(e, views) {
    const o = e[4];
    const src = views.get(o.id);
    let rec = notes.get(o.n);
    const x = Number(e[2]), y = Number(e[3]);
    const head = (Number(o.a) || 0) * Math.PI / 180;
    if (o.e === 'born') {
      if (rec || !src || !notesOn(src, o.m === 's1')) return;
      const w = Math.max(1, Math.min(2, Number(o.w) || 1));
      rec = { id: o.n, owner: o.id, mode: o.m, fan: Number(o.i) || 0, x, y, z: (src.z || 0) + NOTE_Z, dx: Math.cos(head), dy: Math.sin(head),
        state: 'free', tgt: o.t ?? null, age: 0, weave: 1, pass: 0, ended: false,
        copies: Array.from({ length: w }, (_, k) => ({ pos: { x, y, z: (src.z || 0) + NOTE_Z }, sign: k ? -1 : 1, inst: null })) };
      notes.set(o.n, rec);
      startNote(rec, src);
      return;
    }
    if (!rec) return;
    rec.x = x; rec.y = y;   // the sim's position at the change
    if (o.e === 'track') { rec.state = 'track'; rec.tgt = o.t ?? null; return; }
    if (o.e === 'free') { rec.state = 'free'; rec.tgt = null; rec.dx = Math.cos(head); rec.dy = Math.sin(head); return; }
    if (o.e === 'hit') {
      const fx = noteEffects(rec.mode, rec.fan), b = src && bundleOf(src);
      const tgt = o.t != null ? views.get(o.t) : null;
      if (fx && b && b.prefabs.includes(fx.hit)) playNoteHit(b.bundle, fx.hit, tgt || { x, y, z: rec.z - NOTE_Z });
      const pass = NOTE_FLIGHT[rec.mode]?.pass;
      if (pass) { rec.state = 'pass'; rec.pass = pass.time; rec.tgt = null; return; }   // the piano note flies on through
    }
    endNote(rec);
  }
  async function playNoteHit(bundle, name, at) {
    if (!(await ensure())) return;
    const def = await lib.load(bundle, name);
    if (!def || !mod) return;
    const inst = new mod.fxp.FxInstance(def, { quality: q() });
    inst.object.position.set(at.x, at.y, at.z || 0);
    addLive(inst, { view: null, owner: null, buff: false, game: true, until: clockS + (def.duration || 2) + 0.5 }, layers.over);
    while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
  }
  /** Fly the notes one frame (game time: the battle clock's rate). */
  function stepNotes(dt, views) {
    if (!notes.size) return;
    const g = dt * gameRate();
    for (const rec of notes.values()) {
      const f = NOTE_FLIGHT[rec.mode] || NOTE_FLIGHT.base;
      rec.age += g;
      let speed = f.free;
      if (rec.state === 'pass') {
        speed = f.pass?.speed || f.track;
        if ((rec.pass -= g) <= 0) { endNote(rec); continue; }
      } else if (rec.state === 'track') {
        speed = f.track;
        const t = rec.tgt != null ? views?.get(rec.tgt) : null;
        if (t && t.alive !== false) {
          const tx = t.x - rec.x, ty = t.y - rec.y, d = Math.hypot(tx, ty);
          if (d <= speed * g) { speed = 0; rec.x = t.x; rec.y = t.y; }   // there: waits for the sim's hit
          else if (d > 1e-6) {
            const k = Math.min(1, f.turn * g);
            const ndx = rec.dx + (tx / d - rec.dx) * k, ndy = rec.dy + (ty / d - rec.dy) * k, l = Math.hypot(ndx, ndy) || 1;
            rec.dx = ndx / l; rec.dy = ndy / l;
          }
          rec.z += ((t.z || 0) + NOTE_Z - rec.z) * Math.min(1, 4 * g);
        }
      }
      rec.x += rec.dx * speed * g; rec.y += rec.dy * speed * g;
      // the free flight's 扩张正弦: a sideways weave growing with the flight, gone while tracing [ASSUMED shape:
      // 3 waves per second, amplitude up to `sine` after 0.6 s]
      rec.weave += ((rec.state === 'free' ? 1 : 0) - rec.weave) * Math.min(1, 5 * g);
      const amp = (f.sine || 0) * Math.min(1, rec.age / 0.6) * rec.weave;
      const side = amp * Math.sin(rec.age * Math.PI * 2 * 1.5);
      for (const c of rec.copies) {
        const s = side * c.sign + (rec.copies.length > 1 ? c.sign * 0.08 : 0);
        c.pos.x = rec.x - rec.dy * s; c.pos.y = rec.y + rec.dx * s; c.pos.z = rec.z;
      }
      if (rec.age > 60 || rec.copies.every((c) => c.inst && c.inst.done)) endNote(rec);   // a lost event (the sim's NOTE_SAFETY) / the player's cap
    }
  }

  // ---- local patch (user report 2026-10-07, items 2 / 9 / 10 / 11): skills that act through damage or kit events --------
  /**
   * One prefab of `bundle` at `at` (a view or point, followed): entry = addLive's { owner, buff, until, on (the unit it sits
   * on: stopped at its 'die') }; `over` puts it over the units. Resolves the live entry (null if not played).
   */
  async function spawn(bundle, name, at, entry, { over = true, facing = 1, drop = null } = {}) {
    if (!index?.bundles?.[bundle]?.includes(name) || !(await ensure())) return null;
    const def = await lib.load(bundle, name);
    if (!mod || !def) return null;
    const split = !over && splitOn();   // an effect on the ground / a unit splits by sorting at 'high'
    const inst = new mod.fxp.FxInstance(def, { quality: q(), facing, split, floor: drop ? null : at.z && !over ? at.z : 0 });
    if (!drop) at = lifted(at, def); // local patch: its _spawnLocation
    inst.object.position.set(at.x, at.y, at.z || 0);
    const e = { view: at, ...entry };
    if (e.until === undefined) e.until = clockS + (def.duration || 3) + 0.5;
    if (drop) { drop.inst = inst; placeTrail(drop); }
    addLive(inst, e, over ? layers.over : split ? layers.split : layers.under);
    while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
    return live[live.length - 1];
  }
  /**
   * A 'dmg' of this moment on `tid` that waiting skill effects claim (expect(); each plays its effect on the target once —
   * 戴菲恩's finisher hit and its last slash's mark come together).
   */
  function pendingHit(tid, views) {
    while (pending.length && clockS - pending[0].t > PENDING_S) pending.shift();
    const tgt = pending.length ? views.get(tid) : null;
    if (!tgt) return false;
    let claimed = false;
    for (const p of pending) {
      // not another unit's hit of the same moment: an attack on it by someone else, or a target out of the skill's reach
      const a = lastAtk.get(tid);
      if (a && a.src !== p.src && clockS - a.t < 1) continue;
      if (Math.hypot(tgt.x - p.src.x, tgt.y - p.src.y) > PENDING_REACH) continue;
      claimed = true;
      p.done ||= new Set();
      if (p.done.has(tid)) continue;   // its second hit of the same moment (德克萨斯 S2: 2 swords)
      p.done.add(tid);
      const b = bundleOf(p.src);
      if (!b) continue;
      const srcId = p.src.id ?? p.src.info?.id;
      if (p.buff) {   // a mark on the target while the skill lasts (once per target): ended with the skill's buffs or its death
        p.src._fxMarked ||= new Set();
        if (p.src._fxMarked.has(tid)) continue;
        p.src._fxMarked.add(tid);
        for (const n of p.names) spawn(b.bundle, n, tgt, { owner: srcId, buff: true, on: tid, until: null });
      } else for (const n of p.names) spawn(b.bundle, n, tgt, { owner: null, buff: false });
    }
    if (claimed) lastAtk.delete(tid);
    return claimed;
  }
  const lemuenOn = (v) => !!(v && fxBundleOf(v.info?.spine || v.info?.defId) === 'lemuen' && bundleOf(v) && !failed);
  let SKY_Y = null, skyUp = null; // local patch: skyward beams (update; three.js loads lazily)
  const lemMarks = new Map();   // 蕾缪安 id → [[live entries of one lock's beam / reticle / mark]], in lock order (its shells land in that order)
  const LEM_DROP_Z = 3;         // the shell falls from this height (tiles) [ASSUMED: straight down]
  /** Kit 'fx' events drawn with official prefabs; true = handled here (ownFx: render/fx.js skips its stand-in). */
  function kitFx(e, views) {
    const o = e[4];
    if (!o || typeof o !== 'object') return false;
    const x = Number(e[2]), y = Number(e[3]);
    // 余 S3 灶里乾坤: the client builds the wall from per-tile pieces along the skill's infinite line (skchr_yu_3/TileRange
    // _isHorizontalInfinite) [ASSUMED layout: one yu_skill3_range_01 per tile, _root on his tile]; ends with the skill
    if (e[1] === 'firewall') {
      const src = views.get(o.id), b = bundleOf(src);
      if (!b || !b.prefabs.includes('yu_skill3_range_01')) return false;
      ownFx.add(e);
      let rect = null;
      try { rect = fieldRect(); } catch { /* the ±4 fallback */ }
      // local patch (user 2026-10-07): the pieces are authored for a row wall (deployed facing up / down); a column wall
      // (facing left / right) turns each piece 90° about the height so its flames run along the column
      const turn = (l) => { if (l && o.axis !== 'row') l.inst.object.rotation.set(0, 0, Math.PI / 2); };
      for (const [r, c] of wallTiles(x, y, o.axis === 'row' ? 'row' : 'col', rect)) {
        spawn(b.bundle, r === Math.round(y) && c === Math.round(x) ? 'yu_skill3_range_01_root' : 'yu_skill3_range_01', { x: c, y: r, z: 0 }, { owner: o.id, buff: true, until: null }, { over: false }).then(turn);
      }
      spawn(b.bundle, 'yu_skill3_range_01', { x, y, z: 0 }, { owner: o.id, buff: true, until: null }, { over: false }).then(turn);
      return true;
    }
    // a blocked shot: skchr_yu_3/Aura/EnemyAura _effectOnEliminatePos
    if (e[1] === 'firewallBlock') {
      const b = bundleOf(views.get(o.id));
      if (!b || !b.prefabs.includes('yu_skill3_annex_01')) return false;
      ownFx.add(e);
      spawn(b.bundle, 'yu_skill3_annex_01', { x, y, z: 0.3 }, { owner: null, buff: false });
      return true;
    }
    // local patch (user report 2026-10-07, video: an ink sword falls on each target every second): 缄默德克萨斯 S3 剑雨滂沱's
    // rain — the sim's 'swordRain' on a target (src = her) draws texas2_skill_03_hit there [ASSUMED: the rain's prefab by name]
    if (e[1] === 'swordRain' && o.src != null) {
      const src = views.get(o.src), b = bundleOf(src);
      if (!b || !b.prefabs.includes('texas2_skill_03_hit')) return false;
      ownFx.add(e);
      spawn(b.bundle, 'texas2_skill_03_hit', views.get(o.id) || { x, y, z: 0 }, { owner: null, buff: false });
      return true;
    }
    // local patch: 焰影苇草 S3 — a 灼痕 enemy's death bursts (sim 'scorchBurst', id = her): reed2_debuff_boom_01 there
    if (e[1] === 'scorchBurst') {
      const b = bundleOf(views.get(o.id));
      if (!b || !b.prefabs.includes('reed2_debuff_boom_01')) return false;
      ownFx.add(e);
      spawn(b.bundle, 'reed2_debuff_boom_01', { x, y, z: 0 }, { owner: null, buff: false });
      return true;
    }
    // 蕾缪安 S3 ([uc]projectiles.ab projectile_chr_lemuen_s3_aim / _s3_attack): the lock leaves crosshair_02 on the target
    // (its _extraBuffsInTheEnd) until that target's shell lands; each shell (_mainEffect trail_02) falls onto its point over
    // the sim's flight time and explodes (_effectsWhenReached hit_01). Her S2 aim (the same 'lock') keeps fx.js's reticle.
    if (e[1] === 'lock') {
      const src = views.get(o.src);
      if (!lemuenOn(src) || skillIdx(src) !== 2) return false;
      ownFx.add(e);
      const tgt = views.get(o.id);
      // local patch (user report 2026-10-07, video: each locked enemy keeps a red beam and a shrinking reticle until its shell
      // lands): the aim projectile's _effectsToTargetWhenStart trail_01 (LineRenderer beams) and its _mainEffect
      // crosshair_range, on the target with the lock mark [ASSUMED: all three stay until that target's shell]
      const mark = [];
      const list = lemMarks.get(o.src) || []; list.push(mark); lemMarks.set(o.src, list);
      // the lock's flash: buff lemuen_proj_s3_effect CreateEffect crosshair_01 on the target — that buff lives with the aim
      // projectiles (FinishManagedProjectiles at lemuen_s3_end), so it ends with the mark too (user 2026-10-07: it outlived
      // the bombing by up to 1 s as a 2.65 s one-shot)
      for (const n of ['lemuen_skill_03_crosshair_01', 'lemuen_skill_03_trail_01', 'lemuen_skill_03_crosshair_range', 'lemuen_skill_03_crosshair_02']) {
        spawn(bundleOf(src).bundle, n, tgt || { x, y, z: 0 }, { owner: o.id, buff: true, on: o.id, until: clockS + 30, skyward: n.endsWith('trail_01') }).then((l) => {
          if (!l) return;
          if (mark.done) l.inst.stop(); else mark.push(l);
        });
      }
      return true;
    }
    if (e[1] === 'bombardShell' || e[1] === 'bombard') {
      const src = views.get(o.id);
      if (!lemuenOn(src)) return false;
      ownFx.add(e);
      if (e[1] === 'bombard') {
        const mark = lemMarks.get(o.id)?.shift();
        if (mark) { mark.done = true; for (const l of mark) l.inst.stop(true); } // its long-lived glow particles go with the shell
        spawn(bundleOf(src).bundle, 'lemuen_skill_03_hit_01', { x, y, z: 0 }, { owner: null, buff: false });
        return true;
      }
      const dur = Math.max(0.05, Number(o.t) || 0.5);
      const rec = { inst: null, tgt: null, x0: x, y0: y, tx: x, ty: y, k: 0, dur, arc: 0, dropZ: LEM_DROP_Z };
      trails.push(rec);
      spawn(bundleOf(src).bundle, 'lemuen_skill_03_trail_02', { x, y, z: LEM_DROP_Z }, { view: null, owner: null, buff: false, until: clockS + dur + 2 }, { drop: rec })
        .then((l) => { if (!l) { const i = trails.indexOf(rec); if (i >= 0) trails.splice(i, 1); } });
      return true;
    }
    // 戴菲恩 S3 (skchr_blkkgt_3): each slash marks its targets (MultiAttack/Damage _activeBuffs → hit_1, while the skill lasts);
    // the finisher (EndAttack, sim fx 'finale') casts end / start_03 / start_04 and hits hit_2 on its targets
    if (e[1] === 'slash' || e[1] === 'finale') {
      const src = views.get(o.id), sk = src && skillBind(src);
      if (!sk || !bundleOf(src) || !src._fxSkillOn) return false;
      if (e[1] === 'slash') { expect(src, extracted(src, sk.targetBuff), true); return false; }   // its 2D slash stays
      if (!sk.end) return false;
      play(src, 'skillStart', skillIdx(src), { names: extracted(src, sk.end.cast) });
      expect(src, extracted(src, sk.end.hit));
      return false;
    }
    return false;
  }

  const isOp = (v) => v && v.info && v.info.side !== 'enemy';
  const skillIdx = (v) => (Number.isInteger(v?.info?.skillIndex) ? v.info.skillIndex : 0);
  // local patch: the attack-mode bindings (modes.json). bound(v, n, role) = the extracted prefabs of mode n's role;
  // skillMode(v) = the mode of its equipped skill (> 0) or -1; modeNow(v) = the mode its attacks use now (the running skill's,
  // Default 0) — null when the operator is not listed, -1 for a running skill that switches no mode (the name mapping)
  const bindOf = (v) => { const id = v?.info?.spine || v?.info?.defId; return (id && modes?.[id]) || null; };
  const bound = (v, n, role) => boundEffects(bindOf(v), bundleOf(v)?.prefabs, n, role);
  const skillMode = (v) => attackMode(bindOf(v), true, skillIdx(v)) ?? -1;
  /**
   * local patch (user report 2026-10-07: 缄默德克萨斯 S2 / S3 drew her normal attacks): a deploy-time passive with a duration
   * runs with no 'skill' event (server/sim/skills.js) — its view's UF.SKILL flag is the only sign. Its start / loops / mode
   * follow that flag (checked on its attacks); a skill the events started is left to them.
   */
  function skillByFlag(v, views) {
    const on = !!((v.flags | 0) & UF.SKILL);
    // a skill the events drive is theirs; and right after an 'off' event the snapshot's flag may still be set for a frame
    // (user 2026-10-07: 缄默德克萨斯 S2's loops came back after the skill and stayed)
    if (v._fxSkillByEvent || clockS - (v._fxSkillOffT ?? -9) < 0.5) return;
    if (on && !v._fxSkillOn) { v._fxSkillFlag = true; api.onEvent(['skill', v.id ?? v.info?.id, 1, 'flag'], views); }
    else if (!on && v._fxSkillOn && v._fxSkillFlag) { v._fxSkillFlag = false; api.onEvent(['skill', v.id ?? v.info?.id, 0], views); }
  }
  const modeNow = (v) => attackMode(bindOf(v), !!v._fxSkillOn, skillIdx(v));
  // local patch (user report 2026-10-07, 11 items): the skill's own effects (modes.json `skills[i]`, char_modes.py from
  // [uc]skills.ab: cast / castLoop / buff on the caster, target / targetBuff on its targets, end = a finishing ability's)
  const skillBind = (v) => bindOf(v)?.skills?.[skillIdx(v)] || null;
  const extracted = (v, list) => (Array.isArray(list) ? list.filter((n) => bundleOf(v)?.prefabs.includes(n)) : []);
  const turns = (v) => new Set(bindOf(v)?.turn || []);
  /** The unit's facing for a turned effect: its deploy direction, left / right as it is drawn now. */
  const facingDir = (v) => (v.dir === 'UP' || v.dir === 'DOWN' ? v.dir : (v.visFacing ?? v.facing ?? 1) < 0 ? 'LEFT' : 'RIGHT');
  // prefabs a kit event here draws instead (余 S3's wall piece: one per tile along the wall, not one on him)
  const KIT_OWNED = new Set(['yu_skill3_range_01']);
  /** What a skill activation plays on the caster (fxmap.js activationEffects: { start, loops }). */
  const activation = (v) => activationEffects(bindOf(v), bundleOf(v).prefabs, skillIdx(v), KIT_OWNED);
  // effects waiting for the damage of this tick: a skill that hits without an attack event (德克萨斯 S2's sword rain on
  // activation, 戴菲恩 S3's slashes / finisher) — the next 'dmg' events of the same moment are its targets
  const pending = [];   // { src view, names, buff, t }
  const PENDING_S = 0.02;
  const PENDING_REACH = 4.5;   // tiles: farther targets are not this skill's (its ranges reach ≤ 4)
  function expect(src, names, buff = false) { if (names.length) pending.push({ src, names, buff, t: clockS }); }

  const api = {
    /** The projectile kind render/fx.js should draw for an 'atk' event (her note replaces the arrow: 'oblvnsNote'). */
    arrowKind(e) { return noteAtks.has(e) ? 'oblvnsNote' : trailAtks.has(e) ? 'officialTrail' : e[3]; }, // local patch: trails
    /**
     * local patch (user 2026-10-07: effects covered the operator): whether a unit's skill activation is shown by its
     * official effects here — render/fx.js then skips its procedural burst (gold pillar, flash, rings over the unit) and
     * keeps only its ground aura.
     */
    ownsSkill(v) {
      if (!(index && isOp(v) && bundleOf(v) && q() !== 'low' && !failed)) return false;
      // only a skill with official start / buff effects of its own: one whose bundle has none (many S1s — the client's common
      // buff effects are not extracted) keeps the procedural burst, or its activation would show nothing
      // (local patch: the same lists the activation plays — activation())
      const { start, loops } = activation(v);
      return bound(v, skillMode(v), 'cast').length > 0 || start.length > 0 || loops.length > 0;
    },
    /** local patch (⑤): whether the shared status prefab `bundle`/`name` can play (index loaded, not 'low', listed). */
    statusReady(bundle, name) { return !!(index && !failed && q() !== 'low' && index.bundles?.[bundle]?.includes(name) && !statusFailed.has(`${bundle}/${name}`)); },
    /** local patch (⑤): loop `bundle`/`name` on `view` as its status `key` (once per key) at `frac` of its height. */
    statusOn(view, bundle, name, key, frac = 0, hold = null) {
      const on = view._fxStatusOn || (view._fxStatusOn = new Set());
      if (on.has(key)) return;
      on.add(key);
      playStatus(view, bundle, name, key, frac, hold);
    },
    /** local patch (⑤): end the status effect `key` on `view`. */
    statusOff(view, key) {
      if (!view._fxStatusOn?.delete(key)) return;
      const id = ownerOf(view);
      for (const l of live) if (l.status === key && l.owner === id) l.inst.stop();
    },
    /** Whether a 'fx' event is drawn here with its official effect (render/fx.js then skips its 2D stand-in). */
    ownsFx(e) { return ownFx.has(e); },
    /** A battle event render/app.js handled (the views map resolves unit ids). */
    onEvent(e, views) {
      lastViews = views;
      if (Array.isArray(e)) {
        if (e[0] === 'die') gone.add(e[1]);
        else if (e[0] === 'deploy') gone.delete(e[1]);
        else if (e[0] === 'spawn') gone.delete(e[1]?.id ?? e[1]);
        else if (e[0] === 'fx' && e[1] === 'summon' && e[4]) gone.delete(e[4].id);
      }
      if (!index || q() === 'low' || !Array.isArray(e)) return;
      switch (e[0]) {
        case 'skill': {
          const v = views.get(e[1]);
          if (!isOp(v) || !bundleOf(v)) return;
          if (e[2] && e[3] !== 'flag') v._fxSkillByEvent = true; // local patch: skillByFlag leaves it alone
          if (!e[2] && e[3] !== 'flag') v._fxSkillOffT = clockS;
          if (e[2] && v._fxSkillFlag && e[3] !== 'flag') { v._fxSkillFlag = false; return; } // already started from its flag (skillByFlag)
          if (e[2]) {
            v._fxSkillOn = true;
            v._fxMarked = null;   // local patch: the targets its marks sit on (pendingHit)
            // local patch: the activation's effects (activation(): name mapping + the skill's own, minus the attacks' / targets')
            const { start, loops } = activation(v);
            if (start.length) play(v, 'skillStart', skillIdx(v), { names: start });
            if (loops.length) play(v, 'skillBuff', skillIdx(v), { buff: true, names: loops });
            expect(v, extracted(v, skillBind(v)?.target));   // local patch: its damage this tick (德克萨斯 S2)
          }
          // local patch (user 2026-10-07: the buffs / range stayed ~1 s after the skill): its loops end with it, at once
          // (and the marks it left on its targets: 戴菲恩 S3's hit_1)
          else { v._fxSkillOn = false; stopBuffs(v.id ?? v.info.id, true); endWolves(v.id ?? v.info.id); }
          return;
        }
        case 'atk': {
          const src = views.get(e[1]);
          if (!isOp(src) || !bundleOf(src)) return;
          skillByFlag(src, views); // local patch
          const tgt = views.get(e[2]);
          // 丰川祥子: her note (the 'oblvnsNote' born event of this attack) replaces render/fx.js's arrow
          if (tgt && fxBundleOf(src.info.spine || src.info.defId) === 'oblvns' && notesOn(src)) noteAtks.add(e);
          const mode = modeNow(src); // local patch: the mode this attack belongs to (its bound cast / hit effects)
          if (tgt) lastAtk.set(tgt.id ?? tgt.info?.id, { src, t: clockS, mode });
          if (!noteAtks.has(e)) trailShot(e, src, tgt, mode); // local patch: its projectile's official trail
          const sid = src.id ?? src.info.id;
          if (level() >= 3) return;   // the busiest effects go first under load
          const cast = mode != null ? bound(src, mode, 'cast') : [];
          if (cast.length) { // local patch: the mode's own cast effects, a skill's on each of its attacks
            if (clockS - (lastAttackFx.get(sid) ?? -9) >= ATTACK_GAP_S) { lastAttackFx.set(sid, clockS); play(src, 'attackStart', 0, { names: cast }); }
            return;
          }
          if (!src._fxSkillOn && clockS - (lastAttackFx.get(sid) ?? -9) >= ATTACK_GAP_S) { lastAttackFx.set(sid, clockS); play(src, 'attackStart'); }
          return;
        }
        case 'dmg': {
          const tid = e[1];
          if (pendingHit(tid, views)) return; // local patch: a skill's damage without an attack
          const a = lastAtk.get(tid);
          if (!a || clockS - a.t > 2.5) return;
          const tgt = views.get(tid);
          if (!tgt) return;
          if (!a.src._fxSkillOn && level() >= 3) return;
          if (fxBundleOf(a.src.info?.spine || a.src.info?.defId) === 'oblvns' && notesOn(a.src, true)) return;   // her notes hit on their own
          const key = `${a.src.id ?? a.src.info?.id}:${tid}`;
          if (clockS - (lastHit.get(key) ?? -9) < HIT_GAP_S) return;
          lastHit.set(key, clockS);
          lastAtk.delete(tid); // local patch: one impact per attack (a mark's / DoT's later ticks are no attack's hit; audio.js does the same)
          const hits = a.mode != null ? bound(a.src, a.mode, 'hit').slice(0, MAX_HIT_FX) : []; // local patch: the mode's hit effects
          if (hits.length) { play(a.src, 'attackHit', 0, { at: tgt, names: hits }); return; }
          play(a.src, a.src._fxSkillOn ? 'skillHit' : 'attackHit', skillIdx(a.src), { at: tgt });
          return;
        }
        case 'fx': { // a kit's moving effect: 赤刃明霄陈 S3 剑气 (kits/ops/op-chen3.js) carries her official trail along its path
          if (stoneFx(e, views)) return;
          if (e[1] === 'oblvnsNote' && e[4]) { noteFx(e, views); return; }
          if (e[1] === 'whitw2Drones' && e[4]) { wolfFx(e); return; }
          if (kitFx(e, views)) return; // local patch: 余 S3 wall, 蕾缪安 S3 lock / shells, 戴菲恩 S3 slashes / finisher
          if ((e[1] === 'drone' || e[1] === 'drones') && e[4] && wolvesOn() && wolves.has(e[4].id)) {   // her wolves: no generic puff
            ownFx.add(e);
            if (e[1] === 'drone') playNoteHit(WOLF.bundle, WOLF.hit, { x: Number(e[2]), y: Number(e[3]), z: WOLF.z });
            return;
          }
          if (e[1] !== 'chen3Qi' || !e[4]) return;
          const src = views.get(e[4].id);
          if (!src || !bundleOf(src) || failed) return;
          ownFx.add(e);
          const mv = movers.get(e[4].id);
          const at = { x: Number(e[2]), y: Number(e[3]), z: 0.3 };
          if (mv && mv.inst && !mv.inst.done) { mv.at.x = at.x; mv.at.y = at.y; mv.t = clockS; aimMover(mv.inst, e[4].dir); return; }
          const names = effectsFor(bundleOf(src).prefabs, 'skillTrail', 2);
          if (!names.length || movers.has(e[4].id)) return;
          movers.set(e[4].id, { pending: true });
          (async () => {
            if (!(await ensure())) { movers.delete(e[4].id); return; }
            const def = await lib.load(bundleOf(src).bundle, names[0]);
            if (!def || !mod) { movers.delete(e[4].id); return; }
            const inst = new mod.fxp.FxInstance(def, { quality: q() });   // turned by aimMover, not mirrored
            aimMover(inst, e[4].dir);
            inst.object.position.set(at.x, at.y, at.z);
            const m = { inst, at, t: clockS };
            movers.set(e[4].id, m);
            addLive(inst, { view: at, owner: e[4].id, buff: true, mover: true }, layers.over);
          })();
          return;
        }
        case 'die': stopOwned(e[1]); endWolves(e[1]); for (const l of live) if (l.on === e[1]) l.inst.stop(true); return; // local patch: marks on it
        default:
      }
    },

    update(dt, cam, vp) {
      camRef = cam; // local patch: status effects' heights (playStatus)
      clockS += dt * gameRate(); // local patch: the battle clock (gaps, ends) — the official effects use scaled time
      stepTrails(dt * gameRate()); // local patch
      if (lastViews && index) for (const v of lastViews.values()) if (isOp(v) && (v._fxSkillOn || ((v.flags | 0) & UF.SKILL)) && bundleOf(v)) skillByFlag(v, lastViews); // local patch
      stepNotes(dt, lastViews);   // the notes fly on while their trails load
      stepWolves(dt);
      if (!mod) return;
      if (!live.length) { showLayers(); return; }
      const w = Math.max(1, vp.width | 0), h = Math.max(1, vp.height | 0);
      const pr = Math.min(globalThis.devicePixelRatio || 1, q() === 'medium' ? 1 : 1.5);
      for (const L of [layers.under, layers.over]) {
        if (!L.n && !layers.split.n) continue;
        if (L.renderer.getPixelRatio() !== pr) L.renderer.setPixelRatio(pr);
        const s = L.renderer.getSize(size);
        if (s.x !== w || s.y !== h) L.renderer.setSize(w, h, false);
      }
      syncThreeCamera(cam, camera, w, h, { near: Math.max(0.3, cam.dist * 0.08), far: cam.dist + 70 });
      const t0 = performance.now();
      for (const [id, m] of movers) {
        if (!m.inst) continue;
        // a mover the player ended (its cap) is replaced by the next 'fx' event instead of holding the slot 0.4 s
        if (m.inst.done || clockS - m.t > 0.4) { m.inst.stop(); movers.delete(id); } else if (m.inst.time > 1.5) m.inst.time = 0.4; // keep the trail running
      }
      const rate2 = gameRate();
      for (let i = live.length - 1; i >= 0; i--) {
        const l = live[i];
        if (l.view && l.view.alive !== false && !l.view.remove) l.inst.object.position.set(l.view.x, l.view.y, l.view.z || 0);
        // local patch (user 2026-10-07: 蕾缪安's beams must come straight down from the sky wherever the target stands): the
        // effect's +y turned to the camera's up — a line along it projects to a screen-vertical line at any place
        if (l.skyward) {
          SKY_Y ||= new mod.THREE.Vector3(0, 1, 0); skyUp ||= new mod.THREE.Vector3();
          l.inst.object.quaternion.setFromUnitVectors(SKY_Y, skyUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize());
        }
        if (l.until != null && clockS > l.until && !l.stopped) { l.stopped = true; l.inst.stop(); }
        l.inst.update(dt * rate2);   // local patch: every effect on the battle clock (the notes did already: trail = speed × time)
        if (l.inst.done && l.status && l.again && l.unit?._fxStatusOn?.has(l.status) && l.unit.alive !== false) { const a = l.again; l.again = null; a(); } // local patch: a status loops
        if (l.inst.done) { dropLive(l); live.splice(i, 1); }
      }
      showLayers();
      const t1 = performance.now();
      let calls = 0;
      // local patch: the split scene's back renderers after the lower canvas's own, its front ones before the upper's
      const S = layers.split, { FX_BACK, FX_FRONT } = mod.fxp;
      const draw = (L, scene, mask, clear) => {
        camera.layers.set(mask); L.renderer.autoClear = clear; L.renderer.render(scene, camera); calls += L.renderer.info.render.calls;
      };
      if (layers.under.n || S.n) { draw(layers.under, layers.under.scene, 0, true); if (S.n) draw(layers.under, S.scene, FX_BACK, false); }
      if (layers.over.n || S.n) { if (S.n) draw(layers.over, S.scene, FX_FRONT, true); draw(layers.over, layers.over.scene, 0, !S.n); }
      camera.layers.set(0);
      perf.updateMs = perf.updateMs * 0.9 + (t1 - t0) * 0.1;
      perf.renderMs = perf.renderMs * 0.9 + (performance.now() - t1) * 0.1;
      perf.calls = calls;
    },

    clear() {
      for (const l of live) dropLive(l);
      live.length = 0;
      lastAtk.clear(); lastHit.clear(); lastAttackFx.clear(); movers.clear(); notes.clear(); gone.clear(); wolves.clear(); lemMarks.clear();
      trails.length = 0; pending.length = 0; // local patch
      if (mod) showLayers();
    },

    destroy() {
      this.clear();
      for (const L of [layers.under, layers.over]) {
        try { L?.renderer.dispose(); } catch { /* ignore */ }
        L?.canvas.remove();
      }
      layers.under = layers.over = layers.split = null;
      mod = null;
    },

    /**
     * /debug.html: one prefab `bundle/name` of the extracted index on `at` — a unit's view (followed, facing as it does)
     * or a board point { x, y, z } — ended after its duration like play()'s one-shots; on an operator it goes under the
     * units like play()'s caster effects, on an enemy over them. Resolves false when the prefab is not extracted or the layer is off (quality low, no WebP).
     */
    async debugPlay(key, at, { facing = null } = {}) {
      const [bundle, name] = String(key || '').split('/');
      if (!at || !index?.bundles?.[bundle]?.includes(name) || !(await ensure())) return false;
      const def = await lib.load(bundle, name);
      if (!mod || !def) return false;
      const f = facing ?? at.visFacing ?? at.facing ?? 1;
      const onOp = at.info?.side !== 'enemy', split = onOp && splitOn(); // local patch: as play() — split at 'high'
      const inst = new mod.fxp.FxInstance(def, { quality: q(), facing: f < 0 ? -1 : 1, split, floor: at.z || 0 });
      inst.object.position.set(at.x, at.y, at.z || 0);
      addLive(inst, { view: at, owner: at.id ?? at.info?.id ?? null, buff: false, until: clockS + (def.duration || 3) + 0.5 }, onOp ? (split ? layers.split : layers.under) : layers.over);
      while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
      return true;
    },

    /** Per-frame averages (update = the players, render = the layer's draw), the last frame's draw calls, live particles. */
    stats() {
      return {
        live: live.length, loaded: !!mod, updateMs: Math.round(perf.updateMs * 100) / 100, renderMs: Math.round(perf.renderMs * 100) / 100,
        calls: perf.calls, particles: mod ? mod.fxp.fxStats().particles : 0, notes: notes.size,
        recent: recent.slice(), trails: trails.length, // local patch
        buffs: live.filter((l) => l.buff && !l.inst.done).map((l) => l.inst.def?.name ?? '?'), // local patch: the looping effects on now
        trailAt: trails.map((r) => (r.inst ? [+r.inst.object.position.x.toFixed(2), +r.inst.object.position.y.toFixed(2), +r.k.toFixed(2)] : [r.k])), // local patch
      };
    },
  };
  return api;
}
