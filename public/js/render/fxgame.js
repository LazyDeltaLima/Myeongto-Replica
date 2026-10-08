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
import { fxSpec } from './fx.js'; // local patch: the stand-in archetype of a kit fx event (standInOff)
import { SHOT_HEIGHT } from './fx.js'; // local patch: a trail's start without a muzzle point
import { boneMissing, loadPoints, mountSpawn, pointKey, pointOn } from './fxpoints.js'; // local patch: the model points of _spawnLocation 3 / 8…
import { boomerangThrown, boomerangCaught } from './boomerang.js'; // local patch: a 回环射手's boomerang leaves / is back in her hand
import { PROJ } from './style.js';
import { UF } from '../../../shared/constants.js'; // local patch: the views' skill flag (skillByFlag)

/**
 * (user re-report 2026-10-08 #2-7, LOCAL-PATCH.md 「사용자 제보 3차」) the official effects of a 望 stone's blast (createFxLayer stoneFx) — `at`:
 * played at the stone (S1 sktok_wang_1 / S3 sktok_wang_3 `_castEffects`, S2 ExplodeRow·Col·Cross `_effectKey` once per
 * activated axis, a 跟子's `_effectOnTrigger`); `target`: on each enemy it damages (S2 ExplodeRow `_hitEffects` / a 跟子's
 * `_effectsWhenHit`; S3 a 跟子 only). token_wang_skill_03_hit_03 is referenced by nothing in the client: never played.
 */
export function stoneBlastFx(skill, follower = false) {
  if (skill === 2) return { at: ['token_wang_skill_02_hit'], target: 'token_wang_skill_02_hit_02' };
  if (skill === 3) return { at: ['token_wang_skill_03_hit'], target: follower ? 'token_wang_skill_03_hit_02' : null };
  return { at: ['token_wang_skill_01_hit'], target: null };
}
/** Whether an enemy `dx`, `dy` tiles from a stone lies on its blast (kits/ops/op-wang.js trigger): S2 its activated link
 *  axes ('h' / 'v') ≤ 3 tiles each way, S3 the x-1 diamond (radius 2), S1 the stone's own tile. */
export function inStoneBlast(skill, axes, dx, dy) {
  const c = Math.round(dx), r = Math.round(dy);
  if (skill === 2) return (axes || ['h']).some((a) => (a === 'v' ? c === 0 && Math.abs(r) <= 3 : r === 0 && Math.abs(c) <= 3));
  if (skill === 3) return Math.abs(c) + Math.abs(r) <= 2;
  return c === 0 && r === 0;
}

const INDEX_URL = '/assets/local/fx/index.json';
const MODES_URL = '/assets/local/fx/modes.json';   // effect bindings per attack mode (tools/local-extract/char_modes.py)
const MAX_HIT_FX = 2;
const MAX_TRAILS = 12;      // official projectile trails in flight at once (then fx.js's procedural shots)
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
/**
 * Whether a kit 'fx' zone event is a lasting ground area away from its operator's view `v` — 引星棘刺's 炼金单元 (S1 / S3
 * on allies, S2 drifting and re-sent each second under its `key`: upstream f1e462ef), 锡人's charges, 歌蕾蒂娅's 漩涡, 号角's
 * flare, 异客's storm. The client draws it with the skill's `…_token` / `…_range` prefabs at the area, which nothing here
 * plays there (the skill's effects play on the caster), so standInOff keeps its 2D zone (render/fx/zones.js) — session K
 * 2026-10-08 (K-4; before, an operator with official effects drew nothing at the area). Short bursts and areas on the
 * operator itself (莫斯提马 S2) stay official-only.
 */
export function areaAway(e, v) {
  const o = e && e[4];
  if (!o || typeof o !== 'object' || !v) return false;
  if (!(o.key != null || Number(o.duration ?? o.dur) > 1)) return false;
  return Math.hypot(Number(e[2]) - Number(v.x), Number(e[3]) - Number(v.y)) > 0.5;
}

export function createFxLayer({ host, above, quality, load = () => 0, under = () => false, rate = () => 1, fieldRect = () => null, grid = () => null }) {
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
      occ = makeOccluders(THREE, [layers.under.scene, layers.over.scene, layers.split.scene]); // local patch
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

  async function play(view, kind, skillIndex = 0, { at = null, buff = false, names: given = null, tag = null } = {}) {
    const b = bundleOf(view);
    if (!b) return;
    const names = given || effectsFor(b.prefabs, kind, skillIndex);
    if (!names.length || !(await ensure())) return;
    // local patch (user report 2026-10-08: 赤刃明霄陈's S3 dragon twice, over her): a left / right pair (fx_extract.py
    // `right`: the client plays the left copy and swaps in its `_rightEffect` while the owner faces right) is one effect —
    // the copy for the facing, not mirrored; the right copy that the name lookup listed besides is skipped
    const defs = await Promise.all(names.map((n) => lib.load(b.bundle, n)));
    const twins = new Set(defs.map((d) => d?.right).filter(Boolean));
    for (let i = 0; i < names.length; i++) {
      let n = names[i], def = defs[i];
      if (!mod) return;   // destroyed while the file loaded (the view left the battle)
      if (!def || twins.has(n)) continue;
      const sided = def.right ? ((view.visFacing ?? view.facing ?? 1) < 0 ? 'L' : 'R') : null;
      if (sided === 'R') {
        const r = await lib.load(b.bundle, def.right);
        if (!mod) return;
        if (r) { n = def.right; def = r; }
      }
      const ground = at || view;
      const anchor = lifted(ground, def); // local patch: its _spawnLocation
      // local patch (user report 2026-10-07: 野鬃 S2 stood upright): an effect the client turns to the unit's facing
      // (charpack / skills.ab `_useFourDirectionalFace`: its 'rotation_z' pivot, stored at an editing angle) is turned, not mirrored
      const turn = turns(view).has(n) && def.nodes?.some((d) => d.name === 'rotation_z');
      // only the effects that go to the split scene (on the caster) split — a hit on a target goes to the upper canvas,
      // which draws layer 0 only (split, every blast on a target was invisible at 'high' on the 3D board: 烛煌 S3)
      const split = (buff || !at) && splitOn();
      // local patch: cut at the ground the unit stands on (fxplayer.js floor — a tile's height, not a flyer's hover)
      const inst = new mod.fxp.FxInstance(def, { quality: q(), facing: turn || sided ? 1 : (view.visFacing ?? view.facing ?? 1) < 0 ? -1 : 1, split, floor: ground.z || 0 });
      if (turn) aimMover(inst, facingDir(view));
      inst.object.position.set(anchor.x, anchor.y, anchor.z || 0);
      // a one-shot on the caster (not a hit on a target) ends with its prefab's duration even if a system loops —
      // 望's S3 wang_skill_03_range_start (looping 'line1/2', the range cross) stayed on the board for good
      const until = buff ? null : clockS + (def.duration || 3) + 0.5;
      // local patch (user 2026-10-07: the skill effects covered the operator): every effect on the caster — its cast /
      // skill start as well as its buff loops — goes under the units; the hits on a target stay over
      // (local patch, user report 2026-10-07: 마터호른 S2's dome must cover her) at 'high' the caster's effects split by their renderers' sorting
      addLive(inst, { view: anchor, owner: view.id ?? view.info?.id, buff, onCaster: !at, until, tag }, split ? layers.split : buff || !at ? layers.under : layers.over);
      // the player's own cap: it has already ended the oldest (done, dispose is a no-op) — the same one here
      while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
    }
  }

  // local patch (user report 2026-10-08: 赤刃明霄陈's S3 dragon over the 阻隔工事 crate behind her): the client's map and its
  // devices are opaque geometry in the depth buffer, so an effect renderer that tests depth (`_ZTest` 4 — fxplayer.js
  // userData.ztest; her dragon head, most of the 剑气 trail) is hidden inside / behind a crate or a raised tile, while one
  // with `_ZTest` 0 draws over it. The board is another canvas here: its raised tiles (tile tops, `grid()`) and the battle's
  // device boxes (render/units.js DeviceView: crates, turrets) are drawn into each effect canvas's depth only, first.
  let occ = null, occKey = '', occGrid = null, occTiles = [], occGridN = 0;
  const OCC_DOWN = 0.05; // tops a little lower: an effect on a unit standing on a high tile is at that height (fxplayer.js floor cut)
  function makeOccluders(THREE, scenes) {
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, depthTest: true, side: THREE.DoubleSide });
    const meshes = scenes.map((sc) => {
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = -1e9; m.frustumCulled = false; m.layers.enableAll(); m.visible = false;
      sc.add(m);
      return m;
    });
    return { THREE, geo, meshes };
  }
  /** Rebuild the occluder boxes when the raised tiles or the live device boxes changed; none off the 3D board. */
  function syncOccluders() {
    if (!occ) return;
    let on = false;
    try { on = !!under(); } catch { /* 2D board: the units canvas paints the board */ }
    const devs = [];
    let g = null;
    if (on) {
      try { g = grid(); } catch { /* none */ }
      if (g !== occGrid) { // the tile boxes change with the stage only (render/tiles.js rebuilds its grid)
        occGrid = g; occGridN++; occTiles = [];
        if (Array.isArray(g)) for (const row of g) for (const t of row || []) {
          const h = t && t.drawn ? (t.h || 0) + (t.devH || 0) : 0;
          if (h > OCC_DOWN + 0.01) occTiles.push([t.c, t.r, 0.5, h - OCC_DOWN]);
        }
      }
      if (lastViews) for (const v of lastViews.values()) {
        if (!v || !v.spec || !(v.spec.height > 0) || v.alive === false || v.remove || !('box' in v)) continue;
        devs.push([v.x, v.y, (v.spec.size || 0.8) / 2, (v.z || 0) + v.spec.height - OCC_DOWN]);
      }
    }
    const key = on ? `${occGridN}|${devs.map((b) => b.map((x) => Math.round(x * 100)).join(',')).join(';')}` : '';
    const boxes = on ? [...occTiles, ...devs] : [];
    if (key === occKey) return;
    occKey = key;
    const pos = new Float32Array(boxes.length * 36 * 3);
    let k = 0;
    const v = (x, y, z) => { pos[k++] = x; pos[k++] = y; pos[k++] = z; };
    const quad = (a, b, c, d) => { v(...a); v(...b); v(...c); v(...a); v(...c); v(...d); };
    for (const [x, y, hw, top] of boxes) {
      const x0 = x - hw, x1 = x + hw, y0 = y - hw, y1 = y + hw, z0 = -1, z1 = top;
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
      quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
      quad([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]);
      quad([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]);
      quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
      quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]);
    }
    occ.geo.dispose();
    occ.geo.setAttribute('position', new occ.THREE.BufferAttribute(pos, 3));
    occ.geo.setDrawRange(0, boxes.length * 36);
    for (const m of occ.meshes) m.visible = boxes.length > 0;
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
  // (user re-report 2026-10-08 #2-7 「터질 때 직선 파티클이 폭발 범위보다 넓게 나옴」): what the client plays at the
  // stone is its trigger's cast effect only — sktok_wang_1 / sktok_wang_3 `_castEffects`, sktok_wang_2/ExplodeRow·Col·Cross
  // `_effectKey` (the line, turned by `rotation_z`) and the 跟子 projectiles' `_effectOnTrigger` (EN client [uc]skills.ab /
  // [uc]projectiles.ab). The `_02` prefabs are the HIT effects on each enemy hit (ExplodeRow `_hitEffects`, the S3 跟子's
  // `_effectsWhenHit`; stoneBlastFx `target`), and token_wang_skill_03_hit_03 — a copy of the S3 blast 2 tiles off along its
  // `rotation_z` — is referenced by no ability, skill, projectile or table: it is not played (it drew a second blast and
  // its line particles up to ~9 tiles out beside the x-1 diamond).
  // (stoneBlastFx / inStoneBlast below the layer)
  // owner: a stone's id — the effect follows it as a buff and stops on its 'die' (used up / withdrawn); without an
  // owner it is a one-shot, stopped after its prefab's duration even if a system loops (token_wang_birth_01_buff's
  // looping 'sz' kept its cross on the board forever)
  // local patch (user report 2026-10-07 #4, capture: the hand-placed stone glows yellow, the talent's 跟子 has black
  // wisps): a 跟子 is 望's projectile (PRTS 备注; client projectile_chr_wang_stone1/2/3), whose effects are hers (bundle
  // wang): `_effectsToTileWhenStart` wang_passive_01_buff (the black / white / gold rings, andi_lne) and
  // `_triggeredEffect` wang_passive_01_buff_02; the placed token's are its prefab `_startEffect` token_wang_birth_01_buff
  // and sktok_wang_N/TriggeredEffect token_wang_01_buff [추정: TriggeredEffect = 激活, the link]
  // (user re-report 2026-10-08 #2-1 「바둑알 이펙트 루프가 아직 안 됨」): the activation effect (STONE_ON) is a
  // buff's `overrideEffectKey` (sktok_wang_N/TriggeredEffect `_buffs[0]`) and both it and the 跟子's `_triggeredEffect` are
  // loop prefabs (root effect component int #17 = 1, as every status buff; the blasts 0 — [추정] that field is `_isLoop`):
  // their dark / gold wisps (the `line` meshes, dissolved in over 0.6 s by the clip) stay on the stone while it stands —
  // the official capture's upper stone. We dropped them after the clip (~1 s), so they flashed once; and the stones
  // placed linked in the prep never showed them (their 'wangLink' came before the view entered the field — the early
  // buffer, screens/game/early.js keepEarly). Kept now (playAt `keep`), stopped at the stone's 'die' (used up / withdrawn).
  const FOLLOWER_FX = 'wang';
  const STONE_BORN = { stone: 'token_wang_birth_01_buff', follower: 'wang_passive_01_buff' };
  const STONE_ON = { stone: 'token_wang_01_buff', follower: 'wang_passive_01_buff_02' };
  // local patch (user 2026-10-08 「수동, 재능 바둑돌 이펙트가 loop 되지 않고 한번만 나타나고 있어서 모르겠어」): official capture
  // (research/2026-10-07-user-issues-3/cap-231814.png) — a stone's glow / cross / link line sit on its ball, 0.19 tile (on
  // screen) above the shadow; ours drew them on the ground (_spawnLocation 5) under the ball, where the stone's own looping
  // glow (the `sz` systems) hid under its shadow and only the first burst read. The ball centre is 0.18 tile up on screen.
  // (user re-report 2026-10-08 #2-2 「바둑알 밑의 십자가 모양 이펙트가 타일 위치와 어긋남」): the birth effects' cross
  // (`sz` / `sz1`: flat quads 1 tile long in the ground plane) is a ground mark — in the official capture its arms run edge
  // to edge of the stone's tile, about its middle (8–10 px of a ~250 px tile above it); lifted to the ball it sat 0.15 tile
  // up the tile and slid off it by the perspective, so STONE_BORN plays on the ground again (the 跟子's rings are
  // `_effectsToTileWhenStart` too). The activation wisps and the link line stay on the ball (the wisps wrap it in the capture).
  const STONE_BALL = 0.18;
  /** World height of a stone's ball centre at (x, y) on ground z0 (fx.js liftFor, the drawn height on screen). */
  const ballZ = (x, y, z0) => {
    if (!camRef || typeof camRef.liftFor !== 'function') return z0 + STONE_BALL;
    const dz = camRef.liftFor(x, y, z0, STONE_BALL * camRef.scaleAt(x, y, z0));
    return Number.isFinite(dz) ? z0 + dz : z0 + STONE_BALL;
  };
  /** A stone view's ball as an effect anchor (follows the view). */
  const ballOf = (v) => ({
    get x() { return v.x; }, get y() { return v.y; }, get z() { return ballZ(v.x, v.y, (v.z || 0) + (v.hover || 0)); },
    get alive() { return v.alive; }, get remove() { return v.remove; }, id: v.id, info: v.info,
  });
  // (2026-10-08 #2-1: the 3-second replay of a 跟子's wang_passive_01_buff (637a43e0, [추정]) is gone — the capture's wisps
  // are its activation effect, kept above; the birth prefab's rings are one-shot systems and its `sz1` cross loops itself)
  /** local patch: whether 望's stone effects play here (render/fx.js then skips its procedural stand-in). */
  const stonesOn = () => !!(index?.bundles?.[STONE_FX] && !failed && q() !== 'low');
  // `keep`: with an owner, the effect stays after its clip and systems end (a loop prefab whose meshes hold — STONE_ON)
  // until the owner's 'die' stops it (update)
  async function playAt(names, at, { deg = null, owner = null, under = false, bundle = STONE_FX, keep = false } = {}) {
    const prefabs = index?.bundles?.[bundle];
    if (!prefabs || !(await ensure())) return;
    for (const n of names) {
      if (!prefabs.includes(n)) continue;
      const def = await lib.load(bundle, n);
      if (!mod) return;   // destroyed while the file loaded
      if (!def) continue;
      const inst = new mod.fxp.FxInstance(def, { quality: q() });
      if (deg != null) { const p = inst.nodes?.find((o) => o && o.name === 'rotation_z'); if (p) p.rotation.set(0, 0, (deg * Math.PI) / 180); }
      inst.object.position.set(at.x, at.y, at.z || 0);
      const until = owner == null ? clockS + (def.duration || 3) + 0.5 : Infinity;
      addLive(inst, { view: owner == null ? null : at, owner, buff: owner != null, until, keep: !!keep && owner != null }, under ? layers.under : layers.over);
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
  // local patch (user report 2026-10-08: 비르투오사's S3 effect comes out of the cello she holds; generalised by session F the
  // same day): _spawnLocation 3 / 6 (MUZZLE_POINT) and MP_SPECIAL_N are the model's Muzzle / SpecialPointN (fxpoints.js
  // pointKey; chararts DefaultSkin, mostly Spine bone followers — 비르투오사's SpecialPoint0 follows F_Weapon_Chord /
  // B_Weapon_Chord, her cello). The table (tools/local-extract/char_points.py → points.json) covers the operators; a unit
  // without the point (an enemy, a melee model's muzzle, no table) keeps the old place, the ground
  let points = null;
  const pointsOn = (v) => !!(points && v?.info && points[v.info.spine || v.info.defId]);
  loadPoints().then((p) => { points = p; });
  const boneAt = { x: 0, y: 0 };
  /** The world point of a unit's model point `key` (muzzle, sp0…; its current skeleton's, front or back), or null. */
  function specialPoint(v, out, key = 'sp0') {
    const entry = pointsOn(v) ? points[v.info.spine || v.info.defId][key] : null;
    const sp = entry && v.actor?.spine, sk = sp?.skeleton;
    if (!sk || !v.screen?.s || !camRef || !sp.scale) return null;
    const bone = pointOn(entry, sk, !!v.entryBack, boneAt);
    if (!bone) return null;
    // the bone in the skeleton's own frame times the model's display scale, from the unit's root + body (not through the
    // display tree: an impostor-drawn model renders its skeleton elsewhere, units.js _updateImpostor)
    const ox = (v.root?.x ?? v.screen.x) + (v.body?.x || 0), oy = (v.root?.y ?? v.screen.y) + (v.body?.y || 0);
    const g = { x: ox + bone.x * sp.scale.x, y: oy + bone.y * sp.scale.y };
    const z0 = (v.z || 0) + (v.hover || 0);
    const dz = camRef.liftFor(v.x, v.y, z0, v.screen.y - g.y);
    out.x = v.x + (g.x - v.screen.x) / v.screen.s; out.y = v.y; out.z = z0 + (Number.isFinite(dz) ? dz : 0);
    return out;
  }
  // local patch (user report 4 #4-7, session L 2026-10-08): a prefab with a FollowMountPoint (fx_extract.py `mount`) is placed
  // at and follows its mount point instead of its _spawnLocation; with `pauseWhenInvalid` it stands still (`paused`, the
  // frame loop skips its update) while the unit's current skeleton has none of the point's bones
  function lifted(v, def) {
    const spawn = mountSpawn(def?.mount) ?? def?.spawn;
    const key = pointKey(spawn);
    if (key && v && pointsOn(v) && points[v.info.spine || v.info.defId][key]) {
      const p = { x: 0, y: 0, z: 0 };
      const at = () => specialPoint(v, p, key) || (camRef ? { x: v.x, y: v.y, z: bodyZ(camRef, v, 0.5) } : v);
      const pause = !!def?.mount?.pauseWhenInvalid;
      return {
        get x() { return at().x; }, get y() { return at().y; }, get z() { return at().z; },
        get alive() { return v.alive; }, get remove() { return v.remove; },
        get paused() { return pause && boneMissing(points[v.info.spine || v.info.defId][key], v.actor?.spine?.skeleton); },
        id: v.id, info: v.info,
      };
    }
    const frac = SPAWN_FRAC[spawn];
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
  async function playStatus(view, bundle, name, key, frac, hold = null, under = false) {
    if (!(await ensure())) return;
    const def = await lib.load(bundle, name);
    if (mod && !def) { statusFailed.add(`${bundle}/${name}`); view._fxStatusOn?.delete(key); return; }
    if (!mod || !view._fxStatusOn?.has(key)) return;   // destroyed, or turned off while it loaded
    // local patch (user report 4 #4-1, 2026-10-08: the stun marks stacked over a re-stunned enemy): one effect per unit and
    // status — a status turned off and on again while its file loaded started a second load; the first one lands here too
    if (live.some((l) => l.status === key && l.unit === view && !l.inst.stopping && !l.inst.done)) return;
    const anchor = {
      get x() { return view.x; }, get y() { return view.y; },
      get z() { return frac > 0 && camRef ? bodyZ(camRef, view, frac) : (view.z || 0) + (view.hover || 0); },
      get alive() { return view.alive; }, get remove() { return view.remove; },
    };
    // local patch: status prefabs are NOT split — their renderers are sortingOrder 0 / fudge 0 (buff_autochess_frozen's
    // block too), which the split puts behind the unit, while the client sorts them by depth and the 冻结 block covers the
    // model (user capture 9); drawn over the units as before (the snowflake / fist over heads, capture 10)
    // local patch (user request 2026-10-08): `under` (the prep elite glow, fxgolden.js — its glow / sparks are sortingOrder -1,
    // behind the model) splits by sorting at 'high' like a caster's effect, else draws under the units
    const split = !!under && splitOn();
    const inst = new mod.fxp.FxInstance(def, { quality: q(), facing: (view.visFacing ?? view.facing ?? 1) < 0 ? -1 : 1, split, floor: view.z || 0, hold });
    inst.object.position.set(anchor.x, anchor.y, anchor.z);
    addLive(inst, { view: anchor, owner: ownerOf(view), buff: true, status: key, again: () => playStatus(view, bundle, name, key, frac, hold, under), unit: view }, split ? layers.split : under ? layers.under : layers.over);
    while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
  }

  function stoneFx(e, views) {
    const o = e[4];
    if (!o || typeof o !== 'object') return false;
    const at = { x: Number(e[2]), y: Number(e[3]), z: 0 };
    // local patch (user 2026-10-08): the link line and the activation flash on the stones' balls (STONE_BALL)
    const onBall = { x: at.x, y: at.y, z: ballZ(at.x, at.y, 0) };
    // local patch (user report 2026-10-07 #7: the old yellow circle / mint hex + pillar under the stones' official effects):
    // render/fx.js draws nothing for a stone event handled here
    const mine = (e[1] === 'zone' && o.token === STONE) || e[1] === 'wangLink' || (e[1] === 'summon' && isStone(views.get(o.id)));
    if (mine && stonesOn()) ownFx.add(e);
    if (e[1] === 'zone' && o.token === STONE) {
      const fx = stoneBlastFx(o.skill, !!o.follower);
      const axes = Array.isArray(o.axes) && o.axes.length ? o.axes : ['h'];
      if (o.skill === 2) for (const a of axes) playAt(fx.at, at, { deg: a === 'v' ? 90 : 0 });
      else playAt(fx.at, at);
      if (fx.target) stoneHits.push({ t: clockS, x: at.x, y: at.y, skill: o.skill, axes, by: o.target, name: fx.target, done: new Set() });
      return true;
    }
    if (e[1] === 'wangLink') {
      if (o.first) {
        playAt(['token_wang_passive_01_line'], onBall, { under: true });
        // local patch: the activation effect of its own kind (STONE_ON), on the ball, kept while the stone stands (#2-1)
        const sv = views.get(o.id);
        const on = isStone(sv) ? { at: ballOf(sv), owner: o.id, keep: true } : { at: onBall };
        playAt([o.follower ? STONE_ON.follower : STONE_ON.stone], on.at, { owner: on.owner, keep: on.keep, bundle: o.follower ? FOLLOWER_FX : STONE_FX });
      }
      return true;
    }
    if (e[1] === 'summon') {
      const v = views.get(o.id);
      stoneBirth.delete(o.id);
      if (isStone(v)) {
        // local patch: a 跟子's rings (its own birth effect), a placed stone's gold cross — on the ground (#2-2)
        if (o.follower) playAt([STONE_BORN.follower], v, { owner: o.id, under: true, bundle: FOLLOWER_FX });
        else playAt([STONE_BORN.stone], v, { owner: o.id, under: true });
        return true;
      }
    }
    return false;
  }
  // (#2-7) a stone blast's hit effect on each enemy it damages — the 'dmg' of the same moment on its area
  // (S2: its activated link lines, ≤ 3 tiles each way; S3: the x-1 diamond) — and always the enemy that set it off ('zone'
  // `target`), wherever its view is drawn this frame
  const stoneHits = [];
  function stoneHit(tid, views) {
    while (stoneHits.length && clockS - stoneHits[0].t > PENDING_S) stoneHits.shift();
    const tgt = stoneHits.length ? views.get(tid) : null;
    if (!tgt) return false;
    let claimed = false;
    for (const h of stoneHits) {
      if (h.done.has(tid) || (tid !== h.by && !inStoneBlast(h.skill, h.axes, tgt.x - h.x, tgt.y - h.y))) continue;
      h.done.add(tid);
      claimed = true;
      spawn(STONE_FX, h.name, tgt, { owner: null, buff: false });
    }
    return claimed;
  }
  const isStone = (v) => !!(v?.info && (v.info.defId === STONE || v.info.spine === STONE));
  // local patch (user report 2026-10-07 #4, capture: the hand-placed stone keeps its gold glow): the prep's stones come in
  // with the battle start ('spawn', no 'summon' fx — kits/diy.js), yet the token's `_startEffect` plays on every birth —
  // a stone spawned without a 'summon' fx in the same batch is a placed one: its token_wang_birth_01_buff (update)
  const stoneBirth = new Set();
  function flushStoneBirths(views) {
    if (!stoneBirth.size) return;
    for (const id of stoneBirth) {
      const v = views?.get(id);
      if (isStone(v) && v.alive !== false && stonesOn()) playAt([STONE_BORN.stone], v, { owner: id, under: true }); // on the ground (#2-2)
    }
    stoneBirth.clear();
  }

  // local patch (user report 2026-10-07 #7: "전용 이펙트가 추가된 오퍼레이터들의 스킬 효과 등에는 옛날 공용 이펙트 효과(노란 원형)도
  // 제거"): a kit 'fx' event of an operator whose official effects play (its bundle extracted, not 'low') draws none of
  // render/fx.js's procedural skill stand-ins — the orange zone circle, the blast rings, the mint hex + pillar, the buff
  // sparkle, the shield hex, the pulses. What the client draws for that moment is its skill / hit prefabs (played from the
  // 'skill' / 'atk' / 'dmg' events or kitFx); informational marks stay (dodge / crit text, DP, locks and marks, beams,
  // displacement arrows, heals). The event's operator: `src`, else `by`, else `id` (an ally token / device keeps them).
  const STAND_IN = new Set(['blast', 'zone', 'wall', 'summon', 'buff', 'wave', 'pillar', 'element', 'healAoe', 'shield', 'shatter', 'strike', 'volley']);
  // local patch (user 2026-10-08, report 4 #4-7 follow-up: 스펙터 디 언체인드's blue effects after the switch to the 替身 never
  // showed): a 傀儡师's 替身 is its charpack mode 'Stand', whose Talents buffs' effects (modes.json `attach`: ghost2_beidong_buff_02
  // the ring, _buff_01 the 3×3 waves) last while the form does — from sim fx 'substitute' (professions.js installDollkeeper)
  // until 'swap' (back to the 本体) or 'dollEnd' (knocked out as the 替身). Started with the switch [추정: the client's
  // Talents buffs apply as the mode changes]; the prefabs' own end effects (beidong_buff_01_end) are not played.
  function dollFx(e, views) {
    const id = e[4].id, v = views.get(id);
    for (const l of live) if (l.tag === 'doll' && l.owner === id) l.inst.stop(e[1] === 'dollEnd');
    if (e[1] !== 'substitute' || !v || q() === 'low') return;
    const n = bindOf(v)?.modes?.indexOf('Stand') ?? -1;
    const names = n > 0 ? bound(v, n, 'attach') : [];
    if (names.length) play(v, 'skillBuff', 0, { names, buff: true, tag: 'doll' });
  }
  function standInOff(e, views) {
    const o = e[4];
    if (!o || typeof o !== 'object' || !index || failed || q() === 'low') return false;
    const a = fxSpec(e[1], o).a;
    if (!STAND_IN.has(a)) return false;
    const v = views.get(o.src ?? o.by ?? o.id);
    const k = v?.info?.kind;
    if (a === 'zone' && v && areaAway(e, v)) return false; // session K 2026-10-08 (K-4): see areaAway
    return !!(isOp(v) && k !== 'token' && k !== 'device' && k !== 'item' && bundleOf(v));
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
    const from = shotFrom(src);
    const rec = { inst: null, tgt, x0: from.x, y0: from.y, z0: from.z, tx: tgt.x, ty: tgt.y, tz: shotTo(tgt), k: 0,
      dur: Math.max(0.04, dist / projSpeed(e[3])), arc: spec.arc ? spec.arc * Math.min(1.8, Math.max(0.6, 0.45 + dist * 0.18)) : 0 };
    // local patch (user report 4 #4-6, 2026-10-08: one boomerang that comes back): a 回环射手's trail is the projectile itself
    // both ways — projectile_chr_caper `_comeBack` 1 at `_comeBackSpeedScale` .25 (the sim's BOOMERANG_RETURN_SPEED), its
    // `_mainEffect` kept (`_clearMainEffectWhenReached` 0): it turns at the hit and flies back to her (stepTrails), and the
    // wheel is out of her hand meanwhile (render/boomerang.js)
    if (e[3] === 'boomerang') { rec.src = src; rec.back = Math.max(0.04, dist / projSpeed('boomerangReturn')); boomerangThrown(src); }
    trails.push(rec);
    lib.load(b.bundle, name).then((def) => {
      if (!mod || !def || !trails.includes(rec)) { const i = trails.indexOf(rec); if (i >= 0) { trails.splice(i, 1); if (rec.back) boomerangCaught(rec.src); } return; }
      const inst = new mod.fxp.FxInstance(def, { quality: q() });
      rec.inst = inst;
      placeTrail(rec);
      addLive(inst, { view: null, owner: null, buff: false, until: clockS + rec.dur + (rec.back || 0) + (def.duration || 2) + 0.5 }, layers.over);
      while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
    }, () => {});
    return true;
  }
  // local patch (session F 2026-10-08, was TRAIL_Z 0.35 tile at both ends [ASSUMED] — 空弦's arrows flew at her feet): a
  // trail leaves the shooter's Muzzle point (fxpoints.js; the client's "Unit {0} has no muzzlePoint" — its projectiles start
  // there), where it is at the shot, and flies to the target's hit point, the height its _spawnLocation 2 hit effects take
  // [ASSUMED: the client's HitPoint]. A shooter without one (no table, no muzzle) starts at fx.js's shot height.
  const shotAt = { x: 0, y: 0, z: 0 };
  function shotFrom(src) {
    const p = specialPoint(src, shotAt, 'muzzle');
    return p ? { x: p.x, y: p.y, z: p.z } : { x: src.x, y: src.y, z: bodyZ(camRef, src, SHOT_HEIGHT.launch) };
  }
  const shotTo = (t) => bodyZ(camRef, t, SPAWN_FRAC[2]);
  /** A trail at flight fraction k: on the line to the target's current spot (a lob on its arc), turned along it. */
  function placeTrail(rec) {
    const t = rec.tgt;
    if (t && t.alive !== false && !t.remove && Number.isFinite(t.x)) { rec.tx = t.x; rec.ty = t.y; rec.tz = shotTo(t); }
    const k = Math.min(1, rec.k);
    if (rec.dropZ) {   // local patch: a shell falling straight down (蕾缪안 S3), the trail's +x turned to −z
      if (!rec.inst) return;
      rec.inst.object.position.set(rec.x0, rec.y0, rec.dropZ * (1 - k));
      rec.inst.object.rotation.set(0, Math.PI / 2, 0);
      return;
    }
    const x = rec.x0 + (rec.tx - rec.x0) * k, y = rec.y0 + (rec.ty - rec.y0) * k;
    const z = rec.z0 + (rec.tz - rec.z0) * k + (rec.arc ? rec.arc * 4 * k * (1 - k) : 0);
    if (!rec.inst) return;
    rec.inst.object.position.set(x, y, z);
    rec.inst.object.rotation.set(0, 0, Math.atan2(rec.ty - rec.y0, rec.tx - rec.x0));
  }
  /** Fly the trails one frame (game time); a trail that arrived stops emitting and fades out. */
  function stepTrails(g) {
    for (let i = trails.length - 1; i >= 0; i--) {
      const rec = trails[i];
      if (rec.phase === 1) {
        // local patch (#4-6): a boomerang on its way back, from the hit point to where it left her (her Muzzle) at
        // .25 of its speed, turned to her (`_rotateToTarget`); caught there — or gone with her — it is gone at once (its
        // wheel is a 5 s particle: stopped, it hung where it ended)
        const home = !!rec.src && rec.src.alive !== false && !rec.src.remove;
        rec.k = Math.max(0, rec.k - g / rec.back);
        placeTrail(rec);
        rec.inst?.object.rotation.set(0, 0, Math.atan2(rec.y0 - rec.ty, rec.x0 - rec.tx));
        if (rec.k <= 0 || !home) { rec.inst?.stop(true); trails.splice(i, 1); boomerangCaught(rec.src); }
        continue;
      }
      rec.k += g / rec.dur;
      placeTrail(rec);
      if (rec.k >= 1 && rec.back) { rec.phase = 1; rec.k = 1; rec.tgt = null; continue; } // local patch (#4-6): turns back at the hit point
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
    // rain — the sim's 'swordRain' on a target (src = her) draws her skill's target effect there (user report 4 #4-5,
    // 2026-10-08): ModeWithSwordRain's EmitSword shoots projectile_chr_texas2_s3_sword_rain, whose _effectsToTargetWhenStart
    // is texas2_skill_03_hit_02 (the sword dropping from 5.5 tiles up + its landing) — modes.json skills[2].target
    if (e[1] === 'swordRain' && o.src != null) {
      const src = views.get(o.src), b = bundleOf(src);
      const names = b ? extracted(src, skillBind(src)?.target) : [];
      if (!names.length) return false;
      ownFx.add(e);
      for (const n of names) spawn(b.bundle, n, views.get(o.id) || { x, y, z: 0 }, { owner: null, buff: false });
      return true;
    }
    // local patch (user report 2026-10-07 #7: the old stand-ins go — standInOff): the kit events whose moment has an official
    // prefab draw it instead of nothing — 维什戴尔's 残影 bomb ('explode', by = her) wisdel_bomb_01_hit [추정: by name; no
    // prefab key found], 赤刃明霄陈 S2's strikes ('swordStorm', id = her) skchr_chen3_2 _hitGroups[0..5] in turn [추정: one
    // group a strike], 丰川祥子's fever ('sunBurst', id = her) her Combat mode's cast oblvns_combat_01_start [추정]
    if (e[1] === 'explode' || e[1] === 'swordStorm' || e[1] === 'sunBurst') {
      const src = views.get(e[1] === 'explode' ? o.by : o.id), b = bundleOf(src);
      const n = !b ? null : e[1] === 'explode' ? (b.bundle === 'wisdel' ? 'wisdel_bomb_01_hit' : null)
        : e[1] === 'swordStorm' ? (b.bundle === 'chen3' ? `chen3_skill_02_hit_0${((src._fxStormN = ((src._fxStormN ?? -1) + 1) % 6)) + 1}` : null)
          : b.bundle === 'oblvns' ? 'oblvns_combat_01_start' : null;
      if (!n || !b.prefabs.includes(n)) return false;
      ownFx.add(e);
      spawn(b.bundle, n, e[1] === 'sunBurst' ? src : { x, y, z: 0 }, { owner: null, buff: false });
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
      // local patch (user report 2026-10-07 #7: "전용 이펙트가 추가된 오퍼레이터들의 스킬 효과 등에는 옛날 공용 이펙트 효과도 제거" —
      // 望 S1's gold pillar + hex): every operator with official effects, also a skill with no start / buff effect of its
      // own (望 S1 skchr_wang_1: no effect key in skills.ab) — its activation shows what the client shows, its own prefabs or none.
      // It used to keep the procedural burst for those (many S1s), so the activation was not silent on screen.
      // A 望 stone too (report 3 B ① / report 5 #4): its token passive's 'skill' on comes BEFORE the 'deploy' of a used stone
      // coming back (same id, 2 s after its 'die' during S3) — while the dying view still fades (≤ 2.15 s), so the gold
      // pillar + hex was drawn on it. The client shows the stone's own birth / activation prefabs (stoneFx), no burst.
      if (isStone(v)) return stonesOn();
      return !!(index && isOp(v) && bundleOf(v) && q() !== 'low' && !failed);
    },
    /** local patch (⑤): whether the shared status prefab `bundle`/`name` can play (index loaded, not 'low', listed). */
    statusReady(bundle, name) { return !!(index && !failed && q() !== 'low' && index.bundles?.[bundle]?.includes(name) && !statusFailed.has(`${bundle}/${name}`)); },
    /** local patch (⑤): loop `bundle`/`name` on `view` as its status `key` (once per key) at `frac` of its height. */
    statusOn(view, bundle, name, key, frac = 0, hold = null, under = false) {
      const on = view._fxStatusOn || (view._fxStatusOn = new Set());
      if (on.has(key)) return;
      on.add(key);
      playStatus(view, bundle, name, key, frac, hold, under);
    },
    /**
     * local patch (⑤): end the status effect `key` on `view`; `now`: its particles go at once (render/fxstatus.js) instead
     * of living out their lifetimes.
     * local patch (user report 4 #4-1, 2026-10-08: the stun marks stacked over a re-stunned enemy): an ended effect never
     * restarts (`again` was still set — the stopped one, done, saw the status on again and started a copy beside the new
     * one, one more per re-stun), and fxstatus.js ends a status `now`: buff_stun's mark is one 10 s particle, so a
     * stopped one hung over the head for up to 10 s beside the next stun's [추정: the client drops a buff's effect with it].
     */
    statusOff(view, key, now = false) {
      if (!view._fxStatusOn?.delete(key)) return;
      const id = ownerOf(view);
      for (const l of live) if (l.status === key && l.owner === id) { l.again = null; l.inst.stop(now); }
    },
    /**
     * `bundle`/`name` on the board point `at` ({ x, y, z }, followed every frame: the caller moves it), over the units,
     * until its handle's stop() — the Final Assault prep's route preview cursor (render/fxroute.js, LOCAL-PATCH.md
     * 「보스 경로 미리보기」). Resolves { stop(now), alive() } — alive() false once a clear() or the instance cap dropped it —
     * or null when it cannot play (not extracted, quality low, no WebP).
     */
    async playFree(bundle, name, at) {
      if (!at || !index?.bundles?.[bundle]?.includes(name) || q() === 'low' || failed || !(await ensure())) return null;
      const def = await lib.load(bundle, name);
      if (!mod || !def) return null;
      const inst = new mod.fxp.FxInstance(def, { quality: q() });
      inst.object.position.set(at.x, at.y, at.z || 0);
      addLive(inst, { view: at, owner: null, buff: true, keep: true }, layers.over);
      while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
      return { stop: (now = false) => inst.stop(now), alive: () => live.some((l) => l.inst === inst) };
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
        // local patch: a stone spawned (its 'summon' fx of the same moment, if any, takes it off — stoneFx)
        if (e[0] === 'spawn' && e[1] && (e[1].defId === STONE || e[1].spine === STONE)) stoneBirth.add(e[1].id);
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
          if (stoneHit(tid, views)) return; // a 望 stone blast's hit effect (#2-7)
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
          if ((e[1] === 'substitute' || e[1] === 'swap' || e[1] === 'dollEnd') && e[4]) dollFx(e, views); // local patch: the 替身's own effects
          if (standInOff(e, views)) ownFx.add(e); // local patch: no old procedural stand-in for an operator with official effects
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
      flushStoneBirths(lastViews); // local patch
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
      syncOccluders(); // local patch
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
        if (!l.view?.paused || l.inst.stopping) l.inst.update(dt * rate2);   // local patch: every effect on the battle clock (the notes did already: trail = speed × time)
        if (l.inst.done && l.status && l.again && l.unit?._fxStatusOn?.has(l.status) && l.unit.alive !== false) { const a = l.again; l.again = null; a(); } // local patch: a status loops
        // (#2-1) a kept effect (playAt `keep`: 望's stone activation) stays until its owner's 'die' stops it
        if (l.inst.done && !(l.keep && !l.inst.stopping)) { dropLive(l); live.splice(i, 1); }
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
      for (const r of trails) if (r.back) boomerangCaught(r.src); // local patch (#4-6): back in hand for the next battle
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
      occ = null; occKey = ''; occGrid = null; occTiles = []; // local patch
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
