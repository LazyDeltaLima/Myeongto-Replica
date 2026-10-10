// render/fxgame.js — the official battle effects in the game's battle view (local patch, docs/LOCAL-PATCH.md).
//
// render/app.js calls three hooks: onEvent(e, views) for every battle event it handles, update(dt, cam, vp) each frame,
// clear() when a battle ends. Effects play only for operators whose effect bundle was extracted from a local client
// (tools/local-extract/fx_extract.py → /assets/local/fx/index.json) and — 2026-10-10 — for enemies bound in
// /assets/local/fx/enemy-modes.json (tools/local-extract/enemy_bindings.py; their prefabs in enemy-index.json bundles: see
// 「the enemies' official effects」 below); everyone else keeps the procedural FX of render/fx.js, which also keep playing
// for these units (damage numbers, projectiles without an official trail, hit flashes).
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
//   'swing'      → (2026-10-10) the attack's cast effects of ON_CAST_START on the attacker, as its swing starts
//                  (swingFx; modes.json castOpt) — or <op>_attack_start_* by name without bindings
//   'atk'        → its ON_SPELL_ON cast effects (strikeFx); the swing's own when no 'swing' came before it
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
import { foeEffects, castTiming, castPhase, CAST_EVENT } from './fxmap.js'; // 2026-10-10: enemy-held mode buffs, cast timings
import { projSpeed } from './fx.js'; // local patch: the trails' flight time (the sim's projectile speeds)
import { bodyZ } from './fx.js'; // local patch: status effects at a unit's head / body (fxstatus.js)
import { wallTiles } from './fx.js'; // local patch: 余 S3's wall tiles
import { fxSpec } from './fx.js'; // local patch: the stand-in archetype of a kit fx event (standInOff)
import { SHOT_HEIGHT } from './fx.js'; // local patch: a trail's start without a muzzle point
import { boneMissing, loadPoints, mountSpawn, pointKey, pointOn, pointTurn } from './fxpoints.js'; // local patch: the model points of _spawnLocation 3 / 8…
import { enemyProjSpeed, enemyShot } from './fx/speeds.js'; // 2026-10-10: an enemy shot's record / flight time (data/enemies.json `proj`)
import { boomerangThrown, boomerangCaught } from './boomerang.js'; // local patch: a 回环射手's boomerang leaves / is back in her hand
import { PROJ } from './style.js';
import { UF } from '../../../shared/constants.js'; // local patch: the views' skill flag (skillByFlag)

/**
 * (maintainer re-report 2026-10-08, docs/rules/fx.md 「관리자 제보 (2026-10-07 밤)」) the official effects of a 望 stone's blast (createFxLayer stoneFx) — `at`:
 * played at the stone (S1 sktok_wang_1 / S3 sktok_wang_3 `_castEffects`, S2 ExplodeRow·Col·Cross `_effectKey` once per
 * activated axis, a 跟子's `_effectOnTrigger`); `target`: on each enemy it damages (S2 ExplodeRow `_hitEffects` / a 跟子's
 * `_effectsWhenHit`; S3 a 跟子 only). token_wang_skill_03_hit_03 is referenced by nothing in the client: never played.
 */
/**
 * local patch (maintainer report): `names` with each directional emitter entry of `groups` (char_modes.py `dirs` [{ t, s }])
 * replaced by its copy for facing `d` (0 UP, 1 RIGHT, 2 DOWN, 3 LEFT; `left` = drawn facing left) — see dirPick in
 * createFxLayer. Exported for the tests.
 * @param {Array<{t: number, s: string[]}>|null|undefined} groups
 * @param {string[]} names
 * @param {number} d
 * @param {boolean} left
 * @returns {{ names: string[], unflip: Set<string> }}
 */
export function dirCopies(groups, names, d, left) {
  const unflip = new Set();
  if (!Array.isArray(groups) || !groups.length || !names.length) return { names, unflip };
  let out = names;
  for (const g of groups) {
    const s = Array.isArray(g?.s) ? g.s : [];
    if (!out.some((n) => s.includes(n))) continue;
    // (2026-10-10, decompile check: client UberEffectEmitter.EffectOptions.TryGetEffect, RVA 0xAE1FE0) 4 UD_OR_LR = slot 0
    // facing back (up), else slot 2, and the left / right slot when that one is empty; a type outside the enum plays nothing
    const lr = left ? 3 : 1;
    const slot = g.t === 0 ? 0 : g.t === 1 ? lr : g.t === 2 ? (d === 0 ? 0 : 2)
      : g.t === 4 ? (d === 0 ? (s[0] ? 0 : lr) : s[2] ? 2 : lr) : g.t === 3 || g.t === 5 ? d : -1;
    const pick = s[slot] || '';
    const at = out.findIndex((n) => s.includes(n));
    out = out.filter((n, i) => i === at || !s.includes(n));
    out = pick ? out.map((n, i) => (i === at ? pick : n)) : out.filter((_, i) => i !== at);
    if (pick && s[1] && s[3] && s[1] !== s[3]) unflip.add(pick);
  }
  out = out.filter((n, i) => out.indexOf(n) === i);
  return { names: out, unflip };
}

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
// 2026-10-10: the enemies' effect bindings and the bundles extracted for them (tools/local-extract/enemy_bindings.py)
const ENEMY_MODES_URL = '/assets/local/fx/enemy-modes.json';
const ENEMY_INDEX_URL = '/assets/local/fx/enemy-index.json';
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
const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
/**
 * 2026-10-10: the operators' index.json and the enemies' enemy-index.json as one { bundles } (a bundle in both —
 * `common` — lists the prefabs of both). Exported for the tests.
 */
export function mergeIndex(a, b) {
  if (!b || !b.bundles) return a || null;
  if (!a || !a.bundles) return b;
  const bundles = { ...a.bundles };
  for (const [k, list] of Object.entries(b.bundles)) bundles[k] = bundles[k] ? [...new Set([...bundles[k], ...list])] : list;
  return { ...a, bundles };
}
let indexPromise = null;
const loadIndex = () => (indexPromise ||= Promise.all([getJson(INDEX_URL), getJson(ENEMY_INDEX_URL)]).then(([a, b]) => mergeIndex(a, b)));
let modesPromise = null;
const loadModes = () => (modesPromise ||= getJson(MODES_URL));
let enemyModesPromise = null;
const loadEnemyModes = () => (enemyModesPromise ||= getJson(ENEMY_MODES_URL));

/**
 * @param {{ host: HTMLElement, above: HTMLCanvasElement, quality: () => string, load?: () => number, under?: () => boolean, fieldRect?: () => any, enemyDef?: (id: string) => any }} o
 *   load: the view's adaptive load level 0–3 (render/app.js); under: whatever lies below the units canvas shows through
 *   it (the 3D board is on — the 2D board paints an opaque backdrop on the units canvas itself); fieldRect: the battle
 *   field's tile rect (local patch: 余 S3's wall runs across it, fx.js wallTiles); enemyDef: an enemy's data/enemies.json
 *   record (2026-10-10: its shot's speed, `proj`)
 */
/**
 * Whether a kit 'fx' zone event is a lasting ground area away from its operator's view `v` — 引星棘刺's 炼金单元 (S1 / S3
 * on allies, S2 drifting and re-sent each second under its `key`: upstream f1e462ef), 锡人's charges, 歌蕾蒂娅's 漩涡, 号角's
 * flare, 异客's storm. The client draws it with the skill's `…_token` / `…_range` prefabs at the area, which nothing here
 * plays there (the skill's effects play on the caster), so standInOff keeps its 2D zone (render/fx/zones.js) — 
 * 2026-10-08 (before, an operator with official effects drew nothing at the area). Short bursts and areas on the
 * operator itself (莫斯提马 S2) stay official-only.
 */
export function areaAway(e, v) {
  const o = e && e[4];
  if (!o || typeof o !== 'object' || !v) return false;
  if (!(o.key != null || Number(o.duration ?? o.dur) > 1)) return false;
  return Math.hypot(Number(e[2]) - Number(v.x), Number(e[3]) - Number(v.y)) > 0.5;
}

export function createFxLayer({ host, above, quality, load = () => 0, under = () => false, rate = () => 1, fieldRect = () => null, grid = () => null, enemyDef = () => null }) {
  let index = null, modes = null, emodes = null;
  if (typeof fetch === 'function') {
    loadIndex().then((i) => { index = i; }); loadModes().then((m) => { modes = m; });
    loadEnemyModes().then((m) => { emodes = m && typeof m === 'object' ? m : null; });
  }
  let mod = null, loading = null, failed = false;
  let webp = null;   // the WebP probe's answer once known (the note layer decides synchronously)
  if (typeof Image !== 'undefined') webpOk().then((v) => { webp = v; });
  let camera = null, lib = null, size = null;
  // two canvases: the effects on the caster (a skill's looping buff; local patch: its cast / skill start too) under the
  // units canvas, so the operator stays on top of them; the hits on targets, the trails and the moving 剑气 over it.
  // Without a see-through units canvas (2D board) the lower one moves above too.
  const layers = { under: null, over: null, split: null };   // { canvas, renderer, scene, n: live count }
  // local patch (maintainer report 2026-10-07): `split` is a scene drawn on both canvases — each renderer of its effects
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

  // `until` (2026-10-10): a one-shot's end on the battle clock instead of its prefab's duration (a cast effect
  // ended by its cast — castFx); one whose end has passed while its file loaded is not started
  // `speed` (2026-10-10, decompile check): the playback speed — a cast effect plays at its ability's (the attack's
  // anim scale), a hit effect at 1.0 (client `HitEffectOptions.OnCastOnTarget`, RVA 0xAE54D0: CreateEffect(…, 1.0));
  // `aim`: the hit's attacker (an entry with `_useOwnerToTargetDirection`, modes.json `hitAim`)
  async function play(view, kind, skillIndex = 0, { at = null, buff = false, names: given = null, tag = null, until: endAt = null, speed = 1, aim = null } = {}) {
    const b = bundleOf(view);
    if (!b) return;
    // local patch (maintainer report): a directional emitter entry plays the copy for the facing (dirPick)
    const { names, unflip } = dirPick(view, given || effectsFor(b.prefabs, kind, skillIndex));
    if (!names.length || !(await ensure())) return;
    // local patch (maintainer report 2026-10-08: 赤刃明霄陈's S3 dragon twice, over her): a left / right pair (fx_extract.py
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
      // a one-shot on the caster (not a hit on a target) ends with its prefab's duration even if a system loops —
      // 望's S3 wang_skill_03_range_start (looping 'line1/2', the range cross) stayed on the board for good
      const until = buff ? null : endAt ?? clockS + (def.duration || 3) + 0.5;
      if (until != null && until <= clockS) continue;
      const ground = at || view;
      const anchor = lifted(ground, def); // local patch: its _spawnLocation
      // local patch (maintainer report 2026-10-07: 野鬃 S2 stood upright): an effect the client turns to the unit's facing
      // (charpack / skills.ab `_useFourDirectionalFace`: its 'rotation_z' pivot, stored at an editing angle) is turned, not mirrored
      const turn = turns(view).has(n) && def.nodes?.some((d) => d.name === 'rotation_z');
      const aimed = !!(aim && at && aimSet(view).has(names[i])); // 2026-10-10: turned along attacker → target
      // only the effects that go to the split scene (on the caster) split — a hit on a target goes to the upper canvas,
      // which draws layer 0 only (split, every blast on a target was invisible at 'high' on the 3D board: 烛煌 S3)
      const split = (buff || !at) && splitOn();
      // local patch: cut at the ground the unit stands on (fxplayer.js floor — a tile's height, not a flyer's hover)
      const facing = aimed ? aimFacing(null, def, aim, at) : turn || sided || unflip.has(names[i]) ? 1 : (view.visFacing ?? view.facing ?? 1) < 0 ? -1 : 1;
      const inst = new mod.fxp.FxInstance(def, { quality: q(), facing, split, floor: ground.z || 0 });
      if (turn) aimMover(inst, facingDir(view));
      if (aimed) aimAlong(inst, aim, at);
      inst.object.position.set(anchor.x, anchor.y, anchor.z || 0);
      // local patch (maintainer 2026-10-07: the skill effects covered the operator): every effect on the caster — its cast /
      // skill start as well as its buff loops — goes under the units; the hits on a target stay over
      // (local patch, maintainer report 2026-10-07: 마터호른 S2's dome must cover her) at 'high' the caster's effects split by their renderers' sorting
      addLive(inst, { view: anchor, owner: view.id ?? view.info?.id, buff, onCaster: !at, until, tag, speed, backSw: backSwitch(def, at || view, b.bundle) }, split ? layers.split : buff || !at ? layers.under : layers.over);
      // the player's own cap: it has already ended the oldest (done, dispose is a no-op) — the same one here
      while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
    }
  }

  // ---- SwitchableBackEffect (2026-10-10, decompile check) -----------------------------------------------------
  // A prefab whose root carries the client's SwitchableBackEffect (fx_extract.py `back`: 비르투오사 S3 cello_skill_03_buff_front_02
  // → cello_skill_03_buff_back_02, and 61 more of 26 operators — 로즈몬티스 `_B` copies, 비질, 휴머스 …) is swapped while its owner faces back:
  // `SwitchableBackEffect._UpdateFace` (RVA 0xCB7E70) pauses it and creates `_backEffect` on the owner when the owner's
  // `faceToBack` turns true, and the other way round when it turns back to the front ('common_empty' = nothing while back).
  // Here the owner faces back while its Back model is drawn (UnitView.entryBack; before the model loads, a deploy facing UP);
  // the paused front is not drawn [추정: the pause hides it — a frozen copy beside the back one is not seen in captures].
  const faceBack = (v) => !!(v && (v.entryBack ?? v.dir === 'UP'));
  /** The back switch of `def` on its unit `unit` (an operator / enemy view), or null. */
  function backSwitch(def, unit, bundle) {
    const b = def?.back;
    if (!b || typeof b.effect !== 'string' || !unit || !unit.info) return null;
    return { name: b.effect, bundle, unit, on: false, entry: null };
  }
  async function startBack(l) {
    const sw = l.backSw;
    if (sw.name === 'common_empty' || !index?.bundles?.[sw.bundle]?.includes(sw.name)) return;
    const def = await lib.load(sw.bundle, sw.name);
    if (!mod || !def || !sw.on || !live.includes(l) || l.inst.stopping) return;
    const inst = new mod.fxp.FxInstance(def, { quality: q(), facing: (sw.unit.visFacing ?? sw.unit.facing ?? 1) < 0 ? -1 : 1, split: l.layer === layers.split, floor: sw.unit.z || 0 });
    const at = lifted(sw.unit, def); // created on the owner at its own _spawnLocation / mount point
    inst.object.position.set(at.x, at.y, at.z || 0);
    addLive(inst, { view: at, owner: l.owner, buff: l.buff, onCaster: l.onCaster, until: l.until, tag: l.tag, backOf: l }, l.layer);
    sw.entry = live[live.length - 1];
    while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
  }
  /** Swap the switchable effects whose owner turned to / from its back (each frame, before the players run). */
  function stepBackSwitches() {
    for (const l of live) {
      const sw = l.backSw;
      if (!sw) continue;
      if (l.inst.stopping || l.inst.done) { if (sw.entry && !sw.entry.inst.stopping) sw.entry.inst.stop(); continue; }
      const back = faceBack(sw.unit);
      if (back === sw.on) continue;
      sw.on = back;
      l.hidden = back;
      l.inst.object.visible = !back;
      if (back) startBack(l);
      else if (sw.entry) { sw.entry.inst.stop(true); sw.entry = null; }
    }
  }

  // local patch (maintainer report 2026-10-08: 赤刃明霄陈's S3 dragon over the 阻隔工事 crate behind her): the client's map and its
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
  // (maintainer re-report 2026-10-08 「터질 때 직선 파티클이 폭발 범위보다 넓게 나옴」): what the client plays at the
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
  // local patch (maintainer report 2026-10-07, capture: the hand-placed stone glows yellow, the talent's 跟子 has black
  // wisps): a 跟子 is 望's projectile (PRTS 备注; client projectile_chr_wang_stone1/2/3), whose effects are hers (bundle
  // wang): `_effectsToTileWhenStart` wang_passive_01_buff (the black / white / gold rings, andi_lne) and
  // `_triggeredEffect` wang_passive_01_buff_02; the placed token's are its prefab `_startEffect` token_wang_birth_01_buff
  // and sktok_wang_N/TriggeredEffect token_wang_01_buff [추정: TriggeredEffect = 激活, the link]
  // (maintainer re-report 2026-10-08 「바둑알 이펙트 루프가 아직 안 됨」): the activation effect (STONE_ON) is a
  // buff's `overrideEffectKey` (sktok_wang_N/TriggeredEffect `_buffs[0]`) and both it and the 跟子's `_triggeredEffect` are
  // held by their owner (root ParticleEffect raw int #17 = `_holdByOwner` 1, as every status buff; the blasts 0 — decompile
  // check 2026-10-10: the field order of ParticleEffect, and `Effect._InitLocationFromEntity` ends with entity.HoldEffect;
  // not `_isLoop` as first guessed): their dark / gold wisps (the `line` meshes, dissolved in over 0.6 s by the clip) stay on the stone while it stands —
  // the official capture's upper stone. We dropped them after the clip (~1 s), so they flashed once; and the stones
  // placed linked in the prep never showed them (their 'wangLink' came before the view entered the field — the early
  // buffer, screens/game/early.js keepEarly). Kept now (playAt `keep`), stopped at the stone's 'die' (used up / withdrawn).
  const FOLLOWER_FX = 'wang';
  const STONE_BORN = { stone: 'token_wang_birth_01_buff', follower: 'wang_passive_01_buff' };
  const STONE_ON = { stone: 'token_wang_01_buff', follower: 'wang_passive_01_buff_02' };
  // local patch (maintainer 2026-10-08 「수동, 재능 바둑돌 이펙트가 loop 되지 않고 한번만 나타나고 있어서 모르겠어」): official capture
  // (maintainer's notes 2026-10-07) — a stone's glow / cross / link line sit on its ball, 0.19 tile (on
  // screen) above the shadow; ours drew them on the ground (_spawnLocation 5) under the ball, where the stone's own looping
  // glow (the `sz` systems) hid under its shadow and only the first burst read. The ball centre is 0.18 tile up on screen.
  // (maintainer re-report 2026-10-08 「바둑알 밑의 십자가 모양 이펙트가 타일 위치와 어긋남」): the birth effects' cross
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
  // (2026-10-08: the 3-second replay of a 跟子's wang_passive_01_buff (a2bd93de, [추정]) is gone — the capture's wisps
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
  // The prefabs are held by their owner (root `_holdByOwner` 1) though some systems run once (buff_silence: 1 s) — a status
  // effect that ends while its status is still on starts again (update).
  let camRef = null;
  // local patch (maintainer report 2026-10-07, video: 史尔特尔's blast sits on the enemy's body): the prefab root's
  // `_spawnLocation` (fx_extract.py spawn: 2 body / HIT point, 4 head; 1 feet, 5 ground centre and the rest stay on the
  // ground) lifts an effect placed on a unit; points stay where they are
  const SPAWN_FRAC = { 2: 0.5, 4: 1.1 };
  // local patch (maintainer report 2026-10-08: 비르투오사's S3 effect comes out of the cello she holds; generalised by the
  // same day): _spawnLocation 3 / 6 (MUZZLE_POINT) and MP_SPECIAL_N are the model's Muzzle / SpecialPointN (fxpoints.js
  // pointKey; chararts DefaultSkin, mostly Spine bone followers — 비르투오사's SpecialPoint0 follows F_Weapon_Chord /
  // B_Weapon_Chord, her cello). The table (tools/local-extract/char_points.py → points.json) covers the operators; a unit
  // without the point (an enemy, a melee model's muzzle, no table) keeps the old place, the ground
  let points = null;
  // 2026-10-10: an enemy's points are its enemy-modes.json entry's (enemy_bindings.py, the Graphic animator's
  // _muzzleTransform / _hitTransform / _headTransform / _specialPointN of its battle prefab)
  const ptsOf = (v) => (!v?.info ? null : v.info.side === 'enemy' ? ebindOf(v)?.points || null : (points && points[v.info.spine || v.info.defId]) || null);
  loadPoints().then((p) => { points = p; });
  const boneAt = { x: 0, y: 0 };
  /** The world point of a unit's model point `key` (muzzle, sp0…; its current skeleton's, front or back), or null. */
  function specialPoint(v, out, key = 'sp0') {
    const entry = ptsOf(v)?.[key] || null;
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
  // local patch (maintainer report): a prefab with a FollowMountPoint (fx_extract.py `mount`) is placed
  // at and follows its mount point instead of its _spawnLocation; with `pauseWhenInvalid` it stands still (`paused`, the
  // frame loop skips its update) while the unit's current skeleton has none of the point's bones
  function lifted(v, def) {
    const spawn = mountSpawn(def?.mount) ?? def?.spawn;
    const key = pointKey(spawn);
    if (key && v && ptsOf(v)?.[key]) {
      const p = { x: 0, y: 0, z: 0 };
      const at = () => specialPoint(v, p, key) || (camRef ? { x: v.x, y: v.y, z: bodyZ(camRef, v, 0.5) } : v);
      const pause = !!def?.mount?.pauseWhenInvalid;
      // local patch (maintainer report — 아르케토 S3's cast fan stood upright; maintainer's decision 2026-10-08 「전체 적용」): a
      // FollowMountPoint with `_keepOriginRotation` 0 gives the effect its point's turn too (fxpoints.js pointTurn) — the
      // frame loop turns the prefab root about the Unity frame's z (the board's normal: +x = column, +y = row, as aimMover)
      // by it, inside the facing mirror: 아르케토's fan (authored pointing +y up the board, its ring round its axis) lies along
      // her shot, opening behind her with its spike toward the enemy (the maintainer's account of the client, 2026-10-08). Every
      // frame (2026-10-10, decompile check, maintainer decision (2026-10-10)): the client's `FollowMountPoint._FollowMountPoint`
      // (RVA 0xC9E2E0, each LateUpdate) takes the point's rotation every frame when `_keepOriginRotation` is 0. From 2026-10-08
      // it was taken once, at the start: 니어 더 래디언트 나이트 S3's light lance (nearl2_skill_03_start `qiang`, on F_Weapon)
      // thrusts forward at 0° while her lance swings back to ~160° in the next 0.5 s, and following it turned the thrust
      // backward (maintainer 2026-10-08 「빛으로 된 창으로 찌르는 이펙트가 허전해」) — the cause is then in that point's angle here
      // (sign / axis of the turn: the client turns the effect in the skeleton's tilted plane, here about the board's normal
      // [추정]), to be checked on screen
      const turns = def?.mount && def.mount.keepOriginRotation === 0;
      return {
        get x() { return at().x; }, get y() { return at().y; }, get z() { return at().z; },
        get alive() { return v.alive; }, get remove() { return v.remove; },
        get paused() { return pause && boneMissing(ptsOf(v)?.[key], v.actor?.spine?.skeleton); },
        get rot() { return turns ? pointTurn(ptsOf(v)?.[key], v.actor?.spine?.skeleton, !!v.entryBack) : null; },
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
  /**
   * (2026-10-10, decompile check — client `Effect._InitLocationFromEntity`: with `_overwriteHeight` the effect's
   * height is set to the entity's height + `_heightOffset`; fx_extract.py `height`, only 쏜즈 더 로드스타 S1
   * thorn2_skill_01_range in the pool, offset 0, after its _spawnLocation 7 put it at height 0): `at` at the ground height of
   * its unit / of the tile under it plus `off` [추정: the entity — her S1 projectile where it landed — stands on that tile].
   */
  function overHeight(at, off) {
    const unit = at && at.info ? at : null;
    const tileTop = (x, y) => {
      let g = null;
      try { g = grid(); } catch { /* none */ }
      const t = Array.isArray(g) ? g[Math.round(y)]?.[Math.round(x)] : null;
      return t && t.drawn ? (t.h || 0) + (t.devH || 0) : 0;
    };
    return {
      get x() { return at.x; }, get y() { return at.y; },
      get z() { return (unit ? (unit.z || 0) + (unit.hover || 0) : tileTop(at.x, at.y)) + off; },
      get alive() { return at.alive; }, get remove() { return at.remove; }, id: at.id, info: at.info,
    };
  }
  const statusFailed = new Set();   // `${bundle}/${name}` that did not load: their units keep the icon (statusReady false)
  async function playStatus(view, bundle, name, key, frac, hold = null, under = false) {
    if (!(await ensure())) return;
    const def = await lib.load(bundle, name);
    if (mod && !def) { statusFailed.add(`${bundle}/${name}`); view._fxStatusOn?.delete(key); return; }
    if (!mod || !view._fxStatusOn?.has(key)) return;   // destroyed, or turned off while it loaded
    // local patch (maintainer report 2026-10-08: the stun marks stacked over a re-stunned enemy): one effect per unit and
    // status — a status turned off and on again while its file loaded started a second load; the first one lands here too
    if (live.some((l) => l.status === key && l.unit === view && !l.inst.stopping && !l.inst.done)) return;
    const anchor = {
      get x() { return view.x; }, get y() { return view.y; },
      get z() { return frac > 0 && camRef ? bodyZ(camRef, view, frac) : (view.z || 0) + (view.hover || 0); },
      get alive() { return view.alive; }, get remove() { return view.remove; },
    };
    // local patch: status prefabs are NOT split — their renderers are sortingOrder 0 / fudge 0 (buff_autochess_frozen's
    // block too), which the split puts behind the unit, while the client sorts them by depth and the 冻结 block covers the
    // model (maintainer capture 9); drawn over the units as before (the snowflake / fist over heads, capture 10)
    // local patch (maintainer request 2026-10-08): `under` (the prep elite glow, fxgolden.js — its glow / sparks are sortingOrder -1,
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
    // local patch (maintainer 2026-10-08): the link line and the activation flash on the stones' balls (STONE_BALL)
    const onBall = { x: at.x, y: at.y, z: ballZ(at.x, at.y, 0) };
    // local patch (maintainer report 2026-10-07: the old yellow circle / mint hex + pillar under the stones' official effects):
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
        // local patch: the activation effect of its own kind (STONE_ON), on the ball, kept while the stone stands
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
        // local patch: a 跟子's rings (its own birth effect), a placed stone's gold cross — on the ground
        if (o.follower) playAt([STONE_BORN.follower], v, { owner: o.id, under: true, bundle: FOLLOWER_FX });
        else playAt([STONE_BORN.stone], v, { owner: o.id, under: true });
        return true;
      }
    }
    return false;
  }
  // a stone blast's hit effect on each enemy it damages — the 'dmg' of the same moment on its area
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
  // local patch (maintainer report 2026-10-07, capture: the hand-placed stone keeps its gold glow): the prep's stones come in
  // with the battle start ('spawn', no 'summon' fx — kits/diy.js), yet the token's `_startEffect` plays on every birth —
  // a stone spawned without a 'summon' fx in the same batch is a placed one: its token_wang_birth_01_buff (update)
  const stoneBirth = new Set();
  function flushStoneBirths(views) {
    if (!stoneBirth.size) return;
    for (const id of stoneBirth) {
      const v = views?.get(id);
      if (isStone(v) && v.alive !== false && stonesOn()) playAt([STONE_BORN.stone], v, { owner: id, under: true }); // on the ground
    }
    stoneBirth.clear();
  }

  // local patch (maintainer report 2026-10-07: "전용 이펙트가 추가된 오퍼레이터들의 스킬 효과 등에는 옛날 공용 이펙트 효과(노란 원형)도
  // 제거"): a kit 'fx' event of an operator whose official effects play (its bundle extracted, not 'low') draws none of
  // render/fx.js's procedural skill stand-ins — the orange zone circle, the blast rings, the mint hex + pillar, the buff
  // sparkle, the shield hex, the pulses. What the client draws for that moment is its skill / hit prefabs (played from the
  // 'skill' / 'atk' / 'dmg' events or kitFx); informational marks stay (dodge / crit text, DP, locks and marks, beams,
  // displacement arrows, heals). The event's operator: `src`, else `by`, else `id` (an ally token / device keeps them).
  const STAND_IN = new Set(['blast', 'zone', 'wall', 'summon', 'buff', 'wave', 'pillar', 'element', 'healAoe', 'shield', 'shatter', 'strike', 'volley']);
  // local patch (maintainer 2026-10-08, report follow-up: 스펙터 디 언체인드's blue effects after the switch to the 替身 never
  // showed): a 傀儡师's 替身 is its charpack mode 'Stand', whose own Talents buffs' effects (modes.json `attach` minus
  // `attachFoe`: ghost2_beidong_buff_01, the 3×3 circle of ghost2_standin[switch]) last while the form does — from sim fx
  // 'substitute' (professions.js installDollkeeper) until 'swap' (back to the 本体) or 'dollEnd' (knocked out as the 替身) —
  // and its appearance (`dollBorn`, [switch2stand]/StandBorn: ghost2_birth_01_start, the blue swirl) plays once. The
  // enemy-targeted buff's effect (beidong_buff_02, on the enemies 拥抱自我 hits) is not on her (maintainer 2026-10-08 with the
  // official video: 「파란 소용돌이가 잠깐 나왔다가 사라지고, 3x3칸짜리 원형 이펙트도 따로 있어」). Started with the switch
  // [추정]; the prefabs' own end effects (beidong_buff_01_end) are not played.
  function dollFx(e, views) {
    const id = e[4].id, v = views.get(id);
    for (const l of live) if (l.tag === 'doll' && l.owner === id) l.inst.stop(e[1] === 'dollEnd');
    if (e[1] !== 'substitute' || !v || q() === 'low') return;
    const b = bindOf(v), pre = bundleOf(v)?.prefabs || [];
    const born = (b?.dollBorn || []).filter((x) => pre.includes(x));
    if (born.length) play(v, 'skillStart', 0, { names: born });
    const n = b?.modes?.indexOf('Stand') ?? -1;
    const foe = new Set(n > 0 ? b?.attachFoe?.[n] || [] : []);
    const names = n > 0 ? bound(v, n, 'attach').filter((x) => !foe.has(x)) : [];
    if (names.length) play(v, 'skillBuff', 0, { names, buff: true, tag: 'doll' });
  }
  function standInOff(e, views) {
    const o = e[4];
    if (!o || typeof o !== 'object' || !index || failed || q() === 'low') return false;
    const a = fxSpec(e[1], o).a;
    if (!STAND_IN.has(a)) return false;
    const v = views.get(o.src ?? o.by ?? o.id);
    const k = v?.info?.kind;
    if (a === 'zone' && v && areaAway(e, v)) return false; // see areaAway
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
    const from = shotFrom(src, mode);
    const rec = { inst: null, tgt, x0: from.x, y0: from.y, z0: from.z, tx: tgt.x, ty: tgt.y, tz: shotTo(tgt), k: 0,
      dur: Math.max(0.04, dist / projSpeed(e[3])), arc: spec.arc ? spec.arc * Math.min(1.8, Math.max(0.6, 0.45 + dist * 0.18)) : 0 };
    // local patch (maintainer report 2026-10-08: one boomerang that comes back): a 回环射手's trail is the projectile itself
    // both ways — projectile_chr_caper `_comeBack` 1 at `_comeBackSpeedScale` .25 (the sim's BOOMERANG_RETURN_SPEED), its
    // `_mainEffect` kept (`_clearMainEffectWhenReached` 0): it turns at the hit and flies back to her (stepTrails), and the
    // wheel is out of her hand meanwhile (render/boomerang.js)
    if (e[3] === 'boomerang') {
      rec.src = src; rec.back = Math.max(0.04, dist / projSpeed('boomerangReturn')); boomerangThrown(src);
      // 2026-10-10: 跃跃 S2's boomerangs (projectile_chr_caper_s2 / _s2_1, ParacurveMovement `_raiseHeight` 0.3,
      // none under `_noRaiseHeightThreshold` 1.3 tiles) arc; the second one (caperBoomerang2) the other way (`_inverseParacurve`)
      if (/_skill_02_/.test(name)) rec.arc = caperArc(dist, false);
    }
    launchTrail(rec, b.bundle, name);
    return true;
  }
  /** A trail record `rec` on its way (stepTrails flies it); the prefab `bundle`/`name` joins it once loaded. */
  function launchTrail(rec, bundle, name) {
    trails.push(rec);
    lib.load(bundle, name).then((def) => {
      if (!mod || !def || !trails.includes(rec)) { const i = trails.indexOf(rec); if (i >= 0) { trails.splice(i, 1); if (rec.back) boomerangCaught(rec.src); } return; }
      const inst = new mod.fxp.FxInstance(def, { quality: q() });
      rec.inst = inst;
      placeTrail(rec);
      addLive(inst, { view: null, owner: null, buff: false, until: clockS + rec.dur + (rec.back || 0) + (def.duration || 2) + 0.5 }, layers.over);
      while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
    }, () => {});
  }
  // client projectile_chr_caper_s2 / _s2_1 (EN [uc]projectiles.ab): ParacurveMovement `_raiseHeight` 0.3, `_noRaiseHeightThreshold`
  // 1.3 — the second boomerang `_inverseParacurve` 1 [추정: the inverse curve dips under the straight line by the same height]
  const caperArc = (dist, inverse) => (dist < 1.3 ? 0 : inverse ? -0.3 : 0.3);
  /**
   * 2026-10-10: 跃跃 S2's later boomerang (sim fx 'caperBoomerang2' { id, tgt, n } — no 'atk' of its own, 0.1 s
   * after the attack's) — her S2 mode's trail (projectile_chr_caper_s2_1 `_mainEffect` caper_skill_02_trail) out to its target
   * on the inverse arc and back like the first; the wheel is out of her hand while any is out (render/boomerang.js counts them).
   * false → render/fx.js draws its procedural boomerang.
   */
  function caperSecond(e, views) {
    const o = e[4];
    const src = views.get(o.id), tgt = views.get(o.tgt);
    if (!src || !tgt || !isOp(src) || !bundleOf(src) || level() >= 3 || failed || trails.length >= MAX_TRAILS) return false;
    const mode = modeNow(src);
    const name = bound(src, mode, 'trail')[0];
    const b = bundleOf(src);
    if (!name || !trailReady.has(`${b.bundle}/${name}`)) return false;
    const dist = Math.hypot(tgt.x - src.x, tgt.y - src.y);
    const from = shotFrom(src, mode);
    const rec = { inst: null, tgt, x0: from.x, y0: from.y, z0: from.z, tx: tgt.x, ty: tgt.y, tz: shotTo(tgt), k: 0,
      dur: Math.max(0.04, dist / projSpeed('boomerang')), arc: caperArc(dist, true), src, back: Math.max(0.04, dist / projSpeed('boomerangReturn')) };
    boomerangThrown(src);
    launchTrail(rec, b.bundle, name);
    ownFx.add(e);
    return true;
  }
  // local patch (was TRAIL_Z 0.35 tile at both ends — 空弦's arrows flew at her feet): a trail leaves
  // the shooter's point where it is at the shot and flies to the target's hit point. Client (decompile check 2026-10-10):
  // `RangedAttack._GetMountPoint` (RVA 0xA4B4E0) = the shooter's GetMountPoint(`_mountPointType`) — MUZZLE for 210 attacks,
  // a special point or GROUND for 19 (modes.json `shotFrom` per mode: 로즈몬티스 S2 GROUND, 포덴코 S2 SPECIAL_0, 토가와 사키코
  // SPECIAL_3 …) — and `GetTargetLocatable` (0xA4A190) the target's hitMountPoint. Ours: that point of the model (fxpoints.js;
  // GROUND = its feet on the ground), the Muzzle when it has not that one; the target's hit point (points.json `hit`, the
  // operators) or half its drawn height (enemies: no table). A shooter without a point starts at fx.js's shot height.
  const shotAt = { x: 0, y: 0, z: 0 }, hitAt = { x: 0, y: 0, z: 0 };
  function shotFrom(src, mode = null) {
    const mp = Number.isInteger(mode) ? bindOf(src)?.shotFrom?.[mode] : null;
    if (mp === 7) return { x: src.x, y: src.y, z: (src.z || 0) + (src.hover || 0) };   // MountPointType GROUND
    const key = Number.isInteger(mp) ? pointKey(mountSpawn({ type: mp })) : null;
    const p = (key && specialPoint(src, shotAt, key)) || specialPoint(src, shotAt, 'muzzle');
    return p ? { x: p.x, y: p.y, z: p.z } : { x: src.x, y: src.y, z: bodyZ(camRef, src, SHOT_HEIGHT.launch) };
  }
  const shotTo = (t) => specialPoint(t, hitAt, 'hit')?.z ?? bodyZ(camRef, t, SPAWN_FRAC[2]);
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
        // local patch: a boomerang on its way back, from the hit point to where it left her (her Muzzle) at
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
      if (rec.k >= 1 && rec.back) { rec.phase = 1; rec.k = 1; rec.tgt = null; continue; } // local patch: turns back at the hit point
      if (rec.k >= 1) { rec.inst?.stop(); trails.splice(i, 1); }
    }
  }

  // ---- 荒芜拉普兰德 S3's wolves (local patch, maintainer report 2026-10-06: no wolf effect) ----
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

  // ---- local patch (maintainer report 2026-10-07): skills that act through damage or kit events --------
  /**
   * One prefab of `bundle` at `at` (a view or point, followed): entry = addLive's { owner, buff, until, on (the unit it sits
   * on: stopped at its 'die') }; `over` puts it over the units. Resolves the live entry (null if not played).
   */
  async function spawn(bundle, name, at, entry, { over = true, facing = 1, drop = null, aim = null } = {}) {
    if (!index?.bundles?.[bundle]?.includes(name) || !(await ensure())) return null;
    const def = await lib.load(bundle, name);
    if (!mod || !def) return null;
    if (entry.until != null && entry.until <= clockS) return null; // 2026-10-10: its end passed while it loaded
    if (entry.owner != null && gone.has(entry.owner) && (entry.buff || entry.onCaster)) return null;
    const unit = at && at.info ? at : null;
    const split = !over && splitOn();   // an effect on the ground / a unit splits by sorting at 'high'
    if (aim) facing = aimFacing(null, def, aim, at); // 2026-10-10: turned along its attacker → target line
    const inst = new mod.fxp.FxInstance(def, { quality: q(), facing, split, floor: drop ? null : at.z && !over ? at.z : 0 });
    if (aim) aimAlong(inst, aim, at);
    if (!drop) at = lifted(at, def); // local patch: its _spawnLocation
    if (!drop && Number.isFinite(def.height)) at = overHeight(at, def.height); // 2026-10-10: `_overwriteHeight`
    inst.object.position.set(at.x, at.y, at.z || 0);
    const e = { view: at, ...entry, backSw: backSwitch(def, unit, bundle) };
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
      // local patch (maintainer 2026-10-07): the pieces are authored for a row wall (deployed facing up / down); a column wall
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
    // local patch (maintainer report 2026-10-07, video: an ink sword falls on each target every second): 缄默德克萨斯 S3 剑雨滂沱's
    // rain — the sim's 'swordRain' on a target (src = her) draws her skill's target effect there (maintainer report,
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
    // local patch (maintainer report 2026-10-07: the old stand-ins go — standInOff): the kit events whose moment has an official
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
      // local patch (maintainer report 2026-10-07, video: each locked enemy keeps a red beam and a shrinking reticle until its shell
      // lands): the aim projectile's _effectsToTargetWhenStart trail_01 (LineRenderer beams) and its _mainEffect
      // crosshair_range, on the target with the lock mark [ASSUMED: all three stay until that target's shell]
      const mark = [];
      const list = lemMarks.get(o.src) || []; list.push(mark); lemMarks.set(o.src, list);
      // the lock's flash: buff lemuen_proj_s3_effect CreateEffect crosshair_01 on the target — that buff lives with the aim
      // projectiles (FinishManagedProjectiles at lemuen_s3_end), so it ends with the mark too (maintainer 2026-10-07: it outlived
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
   * local patch (maintainer report 2026-10-07: 缄默德克萨斯 S2 / S3 drew her normal attacks): a deploy-time passive with a duration
   * runs with no 'skill' event (server/sim/skills.js) — its view's UF.SKILL flag is the only sign. Its start / loops / mode
   * follow that flag (checked on its attacks); a skill the events started is left to them.
   */
  function skillByFlag(v, views) {
    const on = !!((v.flags | 0) & UF.SKILL);
    // a skill the events drive is theirs; and right after an 'off' event the snapshot's flag may still be set for a frame
    // (maintainer 2026-10-07: 缄默德克萨斯 S2's loops came back after the skill and stayed)
    if (v._fxSkillByEvent || clockS - (v._fxSkillOffT ?? -9) < 0.5) return;
    if (on && !v._fxSkillOn) { v._fxSkillFlag = true; api.onEvent(['skill', v.id ?? v.info?.id, 1, 'flag'], views); }
    else if (!on && v._fxSkillOn && v._fxSkillFlag) { v._fxSkillFlag = false; api.onEvent(['skill', v.id ?? v.info?.id, 0], views); }
  }
  const modeNow = (v) => attackMode(bindOf(v), !!v._fxSkillOn, skillIdx(v));
  // local patch (maintainer report 2026-10-07, 11 items): the skill's own effects (modes.json `skills[i]`, char_modes.py from
  // [uc]skills.ab: cast / castLoop / buff on the caster, target / targetBuff on its targets, end = a finishing ability's)
  const skillBind = (v) => bindOf(v)?.skills?.[skillIdx(v)] || null;
  const extracted = (v, list) => (Array.isArray(list) ? list.filter((n) => bundleOf(v)?.prefabs.includes(n)) : []);
  const turns = (v) => new Set(bindOf(v)?.turn || []);
  // ---- a hit turned along its attacker → target line (2026-10-10, decompile check) ----------------------------
  // Client `HitEffectOptions.OnCastOnTarget` (RVA 0xAE54D0): dir = `_useOwnerToTargetDirection` ? target.mapPos − owner.mapPos
  // : the owner's facing; modes.json `hitAim` (char_modes.py) names those effects (언더플로우 S2 udflow_skill_02_hit_01). A
  // prefab with the 'rotation_z' heading pivot turns it to that line (as aimMover, any angle); one without is mirrored to the
  // line's left / right side [추정: how Effect turns to `dir` is not read].
  const aimSet = (v) => new Set(bindOf(v)?.hitAim || []);
  const aimFacing = (_inst, def, src, tgt) => (def?.nodes?.some((d) => d.name === 'rotation_z') ? 1 : Number(tgt.x) - Number(src.x) < 0 ? -1 : 1);
  function aimAlong(inst, src, tgt) {
    const pivot = inst.nodes?.find((o) => o && o.name === 'rotation_z');
    if (pivot) pivot.rotation.set(0, 0, Math.atan2(Number(tgt.y) - Number(src.y), Number(tgt.x) - Number(src.x)));
  }
  /** The unit's facing for a turned effect: its deploy direction, left / right as it is drawn now. */
  const facingDir = (v) => (v.dir === 'UP' || v.dir === 'DOWN' ? v.dir : (v.visFacing ?? v.facing ?? 1) < 0 ? 'LEFT' : 'RIGHT');
  /**
   * local patch (maintainer report — 아르케토 S3's `start_02` / `start_02_B` both played; maintainer's decision 2026-10-08 「13명
   * 전체」): an emitter entry's `_effects` is a slot list 0 UP, 1 RIGHT, 2 DOWN, 3 LEFT and its `_directionType` picks the slot
   * for the owner's facing (char_modes.py `dirs` [{ t, s }]) — client `TryGetEffect` (decompile check 2026-10-10): 0 NONE slot
   * 0; 1 L_OR_R left or right (up / down by the side it is drawn facing); 2 U_OR_D slot 0 facing back (up), any other facing
   * slot 2 (the sides show the front model: `faceToBack` false); 3 FOUR_DIR / 5 FOUR_DIR_FIXED the facing's own slot;
   * 4 UD_OR_LR slot 0 / 2 like U_OR_D, the left / right slot when that one is empty. An empty slot plays nothing. Every name of the entry in
   * `names` gives way to that one copy, at the first one's place. `unflip`: a copy picked from an entry with its own RIGHT
   * and LEFT copies (백파이프 S2 / S3 `_right` / `_left`) is authored for that side — not mirrored again [ASSUMED].
   */
  const dirPick = (v, names) => dirCopies(bindOf(v)?.dirs, names, ['UP', 'RIGHT', 'DOWN', 'LEFT'].indexOf(facingDir(v)), (v.visFacing ?? v.facing ?? 1) < 0);
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

  // ---- cast effects on the attack's own clock (2026-10-10, decompile check; fxmap.js castTiming) ---------------
  // The client starts 87 % of the attacks' `_castEffects` (399 of 466) on ON_CAST_START, raised in AbilityStandard._DoCast
  // before it waits out the pre-delay — as the swing starts, the OnAttack frame × the ability's anim scale before the strike
  // — and the rest on ON_SPELL_ON (the strike). The sim announces each swing (state event ['swing', unit, windup, kind]:
  // `windup` game seconds to its 'atk'); an effect then starts at its own event, a loop one (`_oneshot` 0) ends at its
  // `_endEvent` — ON_CAST_END / ON_ATTACK_FINISH = the cast's end, the swing + windup × clip / OnAttack frame (the cast
  // lasts the anim-scaled clip: AbstractAnimatedAbility.UpdatePlaybackSpeed), ON_SPELL_END ≈ the strike —, at the next
  // swing (OnCastFinish clears it), at a mode switch (ON_DETACHED: 'skill' on / off) or its owner's death.
  // `_delayIfFirstAttack` delays the first attack's effect by that ÷ the ability's playback speed (1 / anim scale) and
  // `_onlyOnce` keeps it to once per cast (`OnCastStart` resets m_casted). Without a 'swing' before an attack (an older
  // server, an attack the sim did not announce) its swing effects start at the 'atk', as before.
  const SWING_SLACK = 0.35;   // an 'atk' this late after its swing's strike time still belongs to that swing
  const castsDelayed = [];    // { t, run } — first-attack delays (battle clock)
  /** The cast's length and playback speed from the unit's attack clip: windup = anim scale × its OnAttack frame. */
  function castSpan(v, windup) {
    try {
      const a = v?.actor, clip = a?._attackClip?.();
      if (!clip || !(windup > 0)) return null;
      const dur = a.dur(clip.loop), hit = a._hitTime(clip.loop, dur);
      if (!(dur > 0) || !(hit > 0)) return null;
      const scale = windup / hit;
      return { len: dur * scale, speed: 1 / scale };
    } catch { return null; }
  }
  /** Whether this is the first attack of mode `mode` since it was attached (deploy / skill switch) [추정: the client's isFirstAttack]. */
  function firstAttack(v, mode) {
    const done = (v._fxFirstDone ||= new Set());
    if (done.has(mode)) return false;
    done.add(mode);
    return true;
  }
  /** The unit's current cast ends: its loop cast effects stop, gracefully (`_ClearEffects` — the one-shots play out). */
  function endCast(v) {
    const id = ownerOf(v);
    for (const l of live) if (l.tag === 'castLoop' && l.owner === id && !l.inst.stopping) l.inst.stop();
    v._fxCast = null;
  }
  /** The phase ('swing' / 'strike') of mode `mode`'s cast effect `n`; an older modes.json without timings: the strike. */
  const phaseOf = (v, mode, n) => (bindOf(v)?.castOpt ? castPhase(castTiming(bindOf(v), mode, n)) : 'strike');
  /** A new cast (swing) of `v`: its record { t, hitAt, end, speed, mode, fired, skip }. */
  function beginCast(v, windup, mode) {
    endCast(v);
    const w = Math.max(0, Number(windup) || 0);
    const span = castSpan(v, w);
    const sid = ownerOf(v);
    const skip = clockS - (lastAttackFx.get(sid) ?? -9) < ATTACK_GAP_S || level() >= 3;
    if (!skip) lastAttackFx.set(sid, clockS);
    const c = { t: clockS, hitAt: clockS + w, end: span ? clockS + span.len : null, speed: span?.speed || 1, mode, fired: new Set(), struckAt: null, skip, first: firstAttack(v, mode) };
    v._fxCast = c;
    return c;
  }
  /** Play the cast effects `names` of cast `c` (its mode's timings: loop end, first-attack delay, once per cast). */
  function playCast(v, c, names) {
    const bind = bindOf(v);
    // the facing's copy of each directional entry first (dirPick; play() picks it again, unchanged), so two copies of one
    // entry in the list stay one effect and each copy finds its own timing (castOpt names every slot)
    for (const n of dirPick(v, names).names) {
      const opt = castTiming(bind, c.mode, n);
      if (opt?.once && c.fired.has(n)) continue;
      c.fired.add(n);
      const loop = opt && opt.o === 0;
      const end = !loop ? null : opt.e === CAST_EVENT.SPELL_ON || opt.e === CAST_EVENT.SPELL_END ? Math.max(c.hitAt, clockS) : c.end;
      // (2026-10-10, decompile check) at the ability's playback speed — only the cast effects (CastEffectOptions), the hits at 1.0
      const go = () => { if (v._fxCast === c && v.alive !== false) play(v, 'attackStart', 0, { names: [n], tag: loop ? 'castLoop' : 'cast', until: end, speed: c.speed }); };
      const delay = c.first && opt?.d > 0 ? opt.d / c.speed : 0;
      if (delay > 0) castsDelayed.push({ t: clockS + delay, run: go }); else go();
    }
  }
  function stepCasts() {
    for (let i = castsDelayed.length - 1; i >= 0; i--) if (clockS >= castsDelayed[i].t) castsDelayed.splice(i, 1)[0].run();
  }
  /** A swing starts: the cast effects of ON_CAST_START (the mode's, or the name mapping's attack start without bindings). */
  function swingFx(src, windup, views) {
    if (!isOp(src) || !bundleOf(src)) return;
    skillByFlag(src, views);
    const mode = modeNow(src);
    const c = beginCast(src, windup, mode);
    if (c.skip) return;
    const cast = mode != null ? bound(src, mode, 'cast') : [];
    if (cast.length) { playCast(src, c, cast.filter((n) => phaseOf(src, mode, n) === 'swing')); return; }
    // no mode binding: the name mapping's attack start, at the swing like the client's ON_CAST_START majority [추정]
    if (!src._fxSkillOn) play(src, 'attackStart', 0, { tag: 'cast' });
  }
  /** The strike ('atk'): the cast effects of ON_SPELL_ON / ON_SPELL_END; the swing's own when no swing was announced. */
  function strikeFx(src, mode) {
    let c = src._fxCast;
    const same = c && c.mode === mode && clockS <= c.hitAt + SWING_SLACK && (c.struckAt == null || clockS - c.struckAt < 0.03);
    const cast = mode != null ? bound(src, mode, 'cast') : [];
    if (!same) {   // no 'swing' for this attack: its swing effects now (the moment they had before)
      c = beginCast(src, 0, mode);
      if (!c.skip) {
        if (cast.length) playCast(src, c, cast.filter((n) => phaseOf(src, mode, n) === 'swing'));
        else if (!src._fxSkillOn) play(src, 'attackStart', 0, { tag: 'cast' });
      }
    }
    if (c.struckAt != null && clockS - c.struckAt < 0.03) return;   // another target of the same strike
    c.struckAt = clockS;
    if (!c.skip && cast.length) playCast(src, c, cast.filter((n) => phaseOf(src, mode, n) === 'strike'));
  }

  // ---- a mode buff on enemies (2026-10-10, decompile check: 아스트젠 더 라이트체이서 S3) -----------------------
  // modes.json `attachFoe` of the running skill's mode — the buff's ability selects enemies (halo2 S3 LinkEnemy: its
  // `_selector`'s range selectors `_targetSide 2`, `_maxNum 1`, the enemy already holding `halo2_s_3_link` first) — sits on
  // that enemy: here the enemy her attacks hit, kept on it while it lives and the skill lasts, then the next one she hits;
  // `attachFoeMax` caps how many hold it at once (none: every enemy hit).
  function foeFx(src, tgt, mode) {
    const f = src._fxFoe;
    if (!f || !tgt || tgt.info?.side !== 'enemy' || f.mode !== mode) return;
    const tid = ownerOf(tgt);
    for (const id of [...f.on]) { const u = lastViews?.get(id); if (!u || u.alive === false || u.remove) f.on.delete(id); }
    if (f.on.has(tid)) return;
    const b = bundleOf(src);
    let put = false;
    for (const n of f.names) {
      const max = bindOf(src)?.attachFoeMax?.[n] || 0;
      if (max > 0 && f.on.size >= max) continue;
      spawn(b.bundle, n, tgt, { owner: ownerOf(src), buff: true, on: tid, until: null });
      put = true;
    }
    if (put) f.on.add(tid);
  }

  // ---- a skill projectile's lasting reach effects (2026-10-10, decompile check: 쏜즈 더 로드스타) -------------
  // modes.json skills[i].zone (char_modes.py): the client's `EffectBehaviour.OnProjectileReached` (RVA 0x970110) creates
  // the projectile's `_effectsWhenReached` where it lands — parented to its body with `_setReachEffectOnProjectile` (S2's
  // drifting alchemy unit), fixed there otherwise (S1, S3) — and, with `_clearReachedEffectWhenStop`, ends them at
  // `OnProjectileStop` (0x970650); `ScalableAuraHitBehaviour` (0x982390) makes its `_effectKey` under the projectile's body
  // scaled to its range and ends it at the stop (0x982620). The sim's area of that projectile is its 'zone' fx event (x, y,
  // r / radius, duration / dur; a `key`-ed one re-sent each second as it drifts and grows): the effects play there and stop
  // when its time is up. The aura's scale follows the radius from the first event's [추정: the prefab is drawn for the
  // thrown radius]. 引星棘刺, 锡人, 号角 S1, 波登可 S2 have such projectiles.
  const zones = new Map();   // `${caster}:${key}` → { at, vx, vy, st, until, r0, list: [live entries], aura: Set }
  function zoneFx(e, views) {
    const o = e[4];
    if (!o || typeof o !== 'object' || failed) return false;
    const src = views.get(o.id);
    if (!isOp(src) || !bundleOf(src)) return false;
    const z = skillBind(src)?.zone;
    const fx = extracted(src, z?.fx), aura = extracted(src, z?.aura);
    if (!fx.length && !aura.length) return false;
    ownFx.add(e);
    const x = Number(e[2]), y = Number(e[3]), dur = Math.max(0, Number(o.duration ?? o.dur) || 0), r = Number(o.r ?? o.radius) || 0;
    const until = clockS + (dur > 0 ? dur : 3);
    const k = o.key != null ? `${o.id}:${o.key}` : null;
    const rec = k ? zones.get(k) : null;
    if (rec) {
      const dt = clockS - rec.st;
      if (rec.onProj && dt > 1e-3) { rec.vx = (x - rec.sx) / dt; rec.vy = (y - rec.sy) / dt; rec.at.x = x; rec.at.y = y; }
      rec.sx = x; rec.sy = y; rec.st = clockS; rec.until = until;
      for (const l of rec.list) {
        l.until = until;
        if (rec.aura.has(l) && rec.r0 > 0 && r > 0) l.inst.object.scale.setScalar(r / rec.r0);
      }
      return true;
    }
    const at = { x, y, z: 0 };
    const nrec = { at, onProj: !!z.onProj, vx: 0, vy: 0, sx: x, sy: y, st: clockS, until, r0: r, list: [], aura: new Set() };
    if (k) zones.set(k, nrec);
    const bundle = bundleOf(src).bundle;
    for (const n of [...fx, ...aura]) {
      spawn(bundle, n, at, { owner: null, buff: false, until }, { over: false }).then((l) => {
        if (!l) return;
        nrec.list.push(l);
        l.until = nrec.until;
        if (aura.includes(n)) nrec.aura.add(l);
      });
    }
    return true;
  }
  function stepZones(g) {
    for (const [k, rec] of zones) {
      if (clockS > rec.until + 1) { zones.delete(k); continue; }
      if (rec.onProj) { rec.at.x += rec.vx * g; rec.at.y += rec.vy * g; }
    }
  }

  // ---- the enemies' official effects (2026-10-10, docs/rules/fx.md 「적 이펙트 바인딩」) --------------------------
  // enemy-modes.json (tools/local-extract/enemy_bindings.py, from the client's battle/enm_pfb_*.ab — the prefab's root
  // `_startEffect` / `_deadEffect`, its UnitModes' overrides, each ability's emitters, projectile and buffs; the effect
  // prefabs extracted beside the operators' into enemy-index.json bundles): per enemy id
  //   modes[i] = { name, anim: its attack clips, melee / ranged: { cast, opt (castOpt's { s, e, o, d?, once? }), hit, aim?,
  //   dirs?, hitBuff?, proj?: { key, mount, trail, hit, reached, targetStart, speed, raise?, link? } }, start?, dead? },
  //   start?, dead?, skills: { <ability name, lower case>: { cast, opt, hit, buff?, attach?, hitBuff?, proj?, anim? } },
  //   aura?: effect-only buffs of its talents, points: its model points (fxpoints.js shape)
  // and `$fx` = effect name (lower case) → [bundle, prefab]: the client looks effects up without case (the prefabs name
  // `…_B_hit_01`, the bundles' containers are lower case [추정: by the names]).
  // Events: 'swing' → the attack's ON_CAST_START cast effects (Combat for a melee strike, Attack for a shot: the sim's kind
  // 'none' / 'enemy'), 'atk' → its ON_SPELL_ON ones + the projectile's official trail (the procedural orb without one),
  // 'dmg' → its hit effects (+ the projectile's `_effectsWhenHit` / `_effectsWhenReached`) on the target — the attacker
  // named by the sim ('dmg' 6th field) or the last attack on it —, 'spawn' → its start effect + auras, 'die' → its dead
  // effect, 'skill' / 'fx' naming an ability (`prefabKey`, or the clip of a bound skill the model plays) → that ability's
  // effects. Cast effects play at the ability's speed, hits at 1.0 (as the operators').
  const ebindOf = (v) => (v?.info?.side === 'enemy' && emodes ? emodes[v.info.defId] || emodes[v.info.spine] || null : null);
  /** [bundle, prefab] of effect `name` when it is extracted (enemy-modes.json `$fx`, without case), or null. */
  function efx(name) {
    const r = typeof name === 'string' && name ? emodes?.$fx?.[name.toLowerCase()] : null;
    return Array.isArray(r) && index?.bundles?.[r[0]]?.includes(r[1]) ? r : null;
  }
  const eOn = (v) => !!(index && emodes && !failed && q() !== 'low' && ebindOf(v));
  /** The enemy's mode now: the one whose attack clip is its clip set's attack (a form switch changes it), else 0. */
  function emodeOf(v) {
    const b = ebindOf(v);
    if (!b || !Array.isArray(b.modes) || !b.modes.length) return null;
    const clip = v.actor?.roles?.attack?.loop;
    if (typeof clip === 'string' && b.modes.length > 1) {
      const c = clip.toLowerCase();
      const i = b.modes.findIndex((m) => Array.isArray(m?.anim) && m.anim.some((a) => String(a).toLowerCase() === c));
      if (i >= 0) return i;
    }
    return 0;
  }
  /** { mode, part } of an enemy attack of the sim's kind `kind` ('none' / none: a melee strike — its Combat, else Attack). */
  function epart(v, kind) {
    const b = ebindOf(v), mode = emodeOf(v);
    const m = mode == null ? null : b.modes[mode];
    if (!m) return null;
    const shot = !!kind && kind !== 'none';
    return { mode, part: (shot ? m.ranged || m.melee : m.melee || m.ranged) || null };
  }
  const efacing = (v) => ((v.visFacing ?? v.facing ?? 1) < 0 ? -1 : 1);
  /** The directional copies of `names` for the enemy's facing (a part's `dirs`, dirCopies). */
  const edirs = (v, part, names) => dirCopies(part?.dirs, names || [], ['UP', 'RIGHT', 'DOWN', 'LEFT'].indexOf(facingDir(v)), efacing(v) < 0).names;
  /**
   * Effects `names` of enemy `v`: on it (its cast / born effects: under the units, split at 'high'), or `at` a unit / point
   * (its hits: over them). `until` / `buff` / `tag` / `owner` / `on` / `speed` as spawn()'s entry; `aim`: turned along it → `at`.
   */
  function eplay(v, names, { at = null, over = !!at, buff = false, tag = null, until, owner, on, speed = 1, aim = null } = {}) {
    for (const n of names || []) {
      const r = efx(n);
      if (!r) continue;
      const entry = { owner: owner !== undefined ? owner : at ? null : ownerOf(v), buff, onCaster: !at, tag, speed };
      if (buff) entry.until = until ?? null; else if (until != null) entry.until = until;
      if (on !== undefined) entry.on = on;
      spawn(r[0], r[1], at || v, entry, { over, facing: efacing(v), aim });
    }
  }
  /** The cast effects `names` of cast `c` (c.part's timings: loop end, first-attack delay, once per cast). */
  function eplayCast(v, c, names) {
    const part = c.part;
    for (const n of edirs(v, part, names)) {
      const opt = part.opt?.[n] || null;
      if (opt?.once && c.fired.has(n)) continue;
      c.fired.add(n);
      const loop = !!opt && opt.o === 0;
      const end = !loop ? null : opt.e === CAST_EVENT.SPELL_ON || opt.e === CAST_EVENT.SPELL_END ? Math.max(c.hitAt, clockS) : c.end;
      const go = () => { if (v._fxCast === c && v.alive !== false) eplay(v, [n], { tag: loop ? 'castLoop' : 'cast', until: end, speed: c.speed }); };
      const delay = c.first && opt?.d > 0 ? opt.d / c.speed : 0;
      if (delay > 0) castsDelayed.push({ t: clockS + delay, run: go }); else go();
    }
  }
  const phaseIn = (part, phase) => (part?.cast || []).filter((n) => castPhase(part.opt?.[n] || null) === phase);
  function eswingFx(src, windup, kind) {
    const p = epart(src, kind);
    if (!p || !p.part) return;
    const c = beginCast(src, windup, p.mode);
    c.part = p.part;
    if (!c.skip) eplayCast(src, c, phaseIn(p.part, 'swing'));
  }
  function estrikeFx(src, kind) {
    const p = epart(src, kind);
    if (!p || !p.part) return null;
    let c = src._fxCast;
    const same = c && c.mode === p.mode && c.part === p.part && clockS <= c.hitAt + SWING_SLACK && (c.struckAt == null || clockS - c.struckAt < 0.03);
    if (!same) {   // no 'swing' for this attack: its swing effects now
      c = beginCast(src, 0, p.mode);
      c.part = p.part;
      if (!c.skip) eplayCast(src, c, phaseIn(p.part, 'swing'));
    }
    if (c.struckAt != null && clockS - c.struckAt < 0.03) return p;
    c.struckAt = clockS;
    if (!c.skip) eplayCast(src, c, phaseIn(p.part, 'strike'));
    return p;
  }
  /** Where an enemy's shot leaves: its `_mountPointType` point (enemy-modes.json points; GROUND = its feet), its muzzle. */
  function eshotFrom(src, mount) {
    if (mount === 7) return { x: src.x, y: src.y, z: (src.z || 0) + (src.hover || 0) };
    const key = Number.isInteger(mount) ? pointKey(mountSpawn({ type: mount })) : null;
    const p = (key && specialPoint(src, shotAt, key)) || specialPoint(src, shotAt, 'muzzle');
    return p ? { x: p.x, y: p.y, z: p.z } : { x: src.x, y: src.y, z: bodyZ(camRef, src, SHOT_HEIGHT.launch) };
  }
  /** Tiles per game second of `src`'s shot: data/enemies.json `proj` (what the sim flies it at), else the sim's enemy speed. */
  function eshotSpeed(src) {
    let v;
    try { v = enemyProjSpeed(enemyDef(src.info?.defId), src.info?.form); } catch { v = null; }
    return v || projSpeed('enemy');
  }
  /**
   * An enemy shot ('atk' kind 'enemy') as its projectile's official trail (`_mainEffect`) from its mount point to the target's
   * hit point over the sim's flight time; false → render/fx.js's orb (no trail prefab, a ray / link projectile, not loaded yet).
   */
  function etrailShot(e, src, tgt, part) {
    let shot;
    try { shot = enemyShot(enemyDef(src.info?.defId), src.info?.form); } catch { shot = undefined; }
    if (shot === null || (shot && (shot.link || shot.instant || shot.move === 'ATTACH'))) return false; // no flight (the sim: instant)
    const pr = (shot?.key && eprojByKey(src, shot.key)) || (part && part.proj);
    if (!pr || !tgt || e[3] !== 'enemy' || pr.link || level() >= 3 || failed) return false;
    const r = efx(Array.isArray(pr.trail) ? pr.trail[0] : null);
    if (!r) return false;
    const key = `${r[0]}/${r[1]}`;
    if (!trailReady.has(key)) {
      ensure().then((ok) => (ok ? lib.load(r[0], r[1]) : null)).then((def) => { if (def) trailReady.add(key); }, () => {});
      return false;
    }
    if (trails.length >= MAX_TRAILS) return false;
    trailAtks.add(e);
    const dist = Math.hypot(tgt.x - src.x, tgt.y - src.y);
    const from = eshotFrom(src, pr.mount);
    launchTrail({ inst: null, tgt, x0: from.x, y0: from.y, z0: from.z, tx: tgt.x, ty: tgt.y, tz: shotTo(tgt), k: 0,
      dur: Math.max(0.04, dist / eshotSpeed(src)), arc: Number(shot?.height ?? pr.raise) > 0 && (shot?.move ?? 'PARACURVE') === 'PARACURVE' ? Number(shot?.height ?? pr.raise) : 0 }, r[0], r[1]);
    return true;
  }
  /** The enemy's bound projectile `key` (enemy-modes.json: a mode's attack or a skill), or null. */
  function eprojByKey(v, key) {
    const b = ebindOf(v);
    for (const m of b?.modes || []) for (const p of [m?.ranged, m?.melee]) if (p?.proj?.key === key) return p.proj;
    for (const p of Object.values(b?.skills || {})) if (p?.proj?.key === key) return p.proj;
    return null;
  }
  /** An attack's / skill's effects on a unit its damage hit: its hit list + its projectile's hit / reach, ≤ MAX_HIT_FX. */
  function ehitFx(src, part, tgt) {
    const pr = part.proj || {};
    const names = [...new Set([...(part.hit || []), ...(pr.hit || []), ...(pr.reached || [])])].filter((n) => efx(n)).slice(0, MAX_HIT_FX);
    const aim = new Set(part.aim || []);
    const plain = edirs(src, part, names.filter((n) => !aim.has(n)));
    if (plain.length) eplay(src, plain, { at: tgt });
    const aimed = names.filter((n) => aim.has(n));
    if (aimed.length) eplay(src, aimed, { at: tgt, aim: src });
    // a buff it puts on the target: its own effect, played once [추정: held while the buff lasts — its life is not known here]
    if (Array.isArray(part.hitBuff) && part.hitBuff.length) eplay(src, part.hitBuff.slice(0, 1), { at: tgt });
  }
  // the enemies' abilities by name (the sim's fx 'enemySkill' { id, ability, n } at a content skill's cast, and `ability` +
  // `caster` on every fx of that cast — docs/SIM.md; the ability = data/enemies.json skills[].prefabKey = the prefab's
  // Skills/<name> without case)
  const eskillSeen = new Map();   // `${id}:${key}` → battle clock: one play per ability and moment
  function eskillPart(v, key) {
    const s = ebindOf(v)?.skills;
    if (!s || typeof key !== 'string' || !key) return null;
    const k = key.toLowerCase();
    return s[k] || s[k.split('/').pop()] || null;
  }
  /**
   * An enemy's ability `key` used now: its cast effects on it, its own buff / attach effects (looping while a 'skill' lasts —
   * `loop`, cut at 20 s [추정: an end the sim does not announce]; once otherwise), its projectile's trail to `target` with its
   * start effects there; the units its damage hits next get its hit effects (eskillHit). true when the enemy binds it.
   */
  function eskillFx(v, key, { on = true, loop = false, target = null } = {}) {
    const part = eskillPart(v, key);
    if (!part || !eOn(v)) return false;
    const pr0 = part.proj || {};
    if (![...(part.cast || []), ...(part.hit || []), ...(part.buff || []), ...(part.attach || []), ...(pr0.trail || []), ...(pr0.hit || []),
      ...(pr0.reached || []), ...(pr0.targetStart || [])].some(efx)) return false; // nothing of it extracted: the procedural stand-ins stay
    const id = ownerOf(v);
    if (!on) { for (const l of live) if (l.tag === 'eskill' && l.owner === id) l.inst.stop(); return true; }
    const k = `${id}:${key.toLowerCase()}`;
    v._fxESkill = { part, t: clockS };
    if (clockS - (eskillSeen.get(k) ?? -9) < 1) return true;
    eskillSeen.set(k, clockS);
    eplay(v, edirs(v, part, part.cast), { tag: 'cast' });
    const own = [...(part.buff || []), ...(part.attach || [])];
    if (own.length) eplay(v, own, loop ? { buff: true, tag: 'eskill', until: clockS + 20 } : { tag: 'cast' });
    const pr = part.proj;
    if (target && pr && target !== v) {
      if (Array.isArray(pr.targetStart)) eplay(v, pr.targetStart, { at: target });
      const r = efx(Array.isArray(pr.trail) ? pr.trail[0] : null);
      const speed = Number(pr.speed) > 0 ? Number(pr.speed) : 0;
      if (r && speed > 0 && !pr.link && trails.length < MAX_TRAILS && level() < 3) {
        const dist = Math.hypot(target.x - v.x, target.y - v.y);
        if (dist / speed <= 6) {
          const from = eshotFrom(v, pr.mount);
          launchTrail({ inst: null, tgt: target, x0: from.x, y0: from.y, z0: from.z, tx: target.x, ty: target.y, tz: shotTo(target), k: 0,
            dur: Math.max(0.04, dist / speed), arc: Number(pr.raise) > 0 ? Number(pr.raise) : 0 }, r[0], r[1]);
        }
      }
    }
    return true;
  }
  /** A 'dmg' on `tid` by enemy `by` (the sim's attacker field) within 3 s of its ability: that ability's hit effects. */
  function eskillHit(tid, by, views) {
    const v = by != null ? views.get(by) : null;
    const s = v && v._fxESkill;
    const tgt = s && clockS - s.t <= 3 && eOn(v) ? views.get(tid) : null;
    if (!tgt || level() >= 3) return false;
    const key = `${by}:${tid}`;
    if (clockS - (lastHit.get(key) ?? -9) < HIT_GAP_S) return true;
    lastHit.set(key, clockS);
    ehitFx(v, s.part, tgt);
    return true;
  }
  /** The ability key an enemy 'fx' event names (`ability`; `prefabKey`, a string `skill` too), or null. */
  const fxAbility = (o) => {
    const k = o.ability ?? o.prefabKey ?? (typeof o.skill === 'string' ? o.skill : null);
    return typeof k === 'string' && k ? k : null;
  };
  // a bound skill whose clip the model starts (render/units.js: a skill flag, a form's change clip — 'Revive', 'Skill_2' …)
  // plays its effects too: the render shows that ability then, whether or not the sim names it
  function animSkill(b) {
    if (b._animSkill) return b._animSkill;
    const atk = new Set(b.modes.flatMap((m) => (m?.anim || []).map((a) => String(a).toLowerCase())));
    const map = new Map();
    for (const [k, p] of Object.entries(b.skills || {})) {
      const a = typeof p?.anim === 'string' ? p.anim.toLowerCase() : null;
      if (a && !atk.has(a) && !map.has(a)) map.set(a, k);
    }
    Object.defineProperty(b, '_animSkill', { value: map, enumerable: false });
    return map;
  }
  const eborn = new Map();   // enemy id → battle clock of its 'spawn' (its view is built right after the event)
  /** The enemies spawned since the last frame: their start effect (the mode's override, else the root's) and auras. */
  function flushEnemyBirths(views) {
    if (!eborn.size || !views) return;
    for (const [id, t] of eborn) {
      const v = views.get(id);
      if (!v) { if (clockS - t > 2) eborn.delete(id); continue; }
      eborn.delete(id);
      if (!eOn(v) || v.alive === false) continue;
      const b = ebindOf(v), mi = emodeOf(v);
      v._fxEMode = mi;
      const start = b.modes?.[mi]?.start || b.start;
      if (start) eplay(v, [start], { tag: 'born' });
      if (Array.isArray(b.aura) && b.aura.length) eplay(v, b.aura, { buff: true, tag: 'aura' });
    }
  }
  /** Each frame: an enemy whose mode changed (its clip set's attack) ends the old mode's loop casts (ON_DETACHED); a bound skill's clip starting plays it. */
  function stepEnemies(views) {
    if (!emodes || !views) return;
    for (const v of views.values()) {
      if (v?.info?.side !== 'enemy' || v.alive === false || !eOn(v)) continue;
      if (v._fxEMode === undefined) { v._fxEMode = emodeOf(v); v._fxEClip = v.actor?.current; continue; } // on the field before this layer
      const mi = emodeOf(v);
      if (mi !== v._fxEMode) { v._fxEMode = mi; endCast(v); v._fxFirstDone = null; }
      const clip = v.actor?.current;
      if (clip !== v._fxEClip) {
        v._fxEClip = clip;
        const k = typeof clip === 'string' ? animSkill(ebindOf(v)).get(clip.toLowerCase()) : null;
        if (k) eskillFx(v, k);
      }
    }
  }
  /** An enemy's death: its dead effect (its mode's override, else the root's) where it falls. */
  function edeathFx(v) {
    if (!eOn(v)) return;
    const b = ebindOf(v);
    const dead = b.modes?.[v._fxEMode ?? emodeOf(v) ?? 0]?.dead || b.dead;
    if (dead) eplay(v, [dead], { owner: null, tag: 'dead' });
  }

  const api = {
    /** The projectile kind render/fx.js should draw for an 'atk' event (her note replaces the arrow: 'oblvnsNote'). */
    arrowKind(e) { return noteAtks.has(e) ? 'oblvnsNote' : trailAtks.has(e) ? 'officialTrail' : e[3]; }, // local patch: trails
    /**
     * local patch (maintainer 2026-10-07: effects covered the operator): whether a unit's skill activation is shown by its
     * official effects here — render/fx.js then skips its procedural burst (gold pillar, flash, rings over the unit) and
     * keeps only its ground aura.
     */
    ownsSkill(v) {
      // local patch (maintainer report 2026-10-07: "전용 이펙트가 추가된 오퍼레이터들의 스킬 효과 등에는 옛날 공용 이펙트 효과도 제거" —
      // 望 S1's gold pillar + hex): every operator with official effects, also a skill with no start / buff effect of its
      // own (望 S1 skchr_wang_1: no effect key in skills.ab) — its activation shows what the client shows, its own prefabs or none.
      // It used to keep the procedural burst for those (many S1s), so the activation was not silent on screen.
      // A 望 stone too (maintainer reports 2026-10-08): its token passive's 'skill' on comes BEFORE the 'deploy' of a used stone
      // coming back (same id, 2 s after its 'die' during S3) — while the dying view still fades (≤ 2.15 s), so the gold
      // pillar + hex was drawn on it. The client shows the stone's own birth / activation prefabs (stoneFx), no burst.
      if (isStone(v)) return stonesOn();
      // 2026-10-10: an enemy whose skills are bound (enemy-modes.json) — the client draws no gold pillar for it
      if (v?.info?.side === 'enemy') return !!(eOn(v) && ebindOf(v).skills);
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
     * local patch (maintainer report 2026-10-08: the stun marks stacked over a re-stunned enemy): an ended effect never
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
    /**
     * 2026-10-10: a unit's attack swing starts, `windup` game seconds before its strike ('atk') — the cast
     * effects of ON_CAST_START. onEvent already does this for the sim's 'swing' state event; for a caller with its own.
     */
    onSwing(view, windup, kind) { if (view && index && q() !== 'low') swingFx(view, Number(windup) || 0, lastViews || new Map()); void kind; },
    /** A battle event render/app.js handled (the views map resolves unit ids). */
    onEvent(e, views) {
      lastViews = views;
      if (Array.isArray(e)) {
        if (e[0] === 'die') gone.add(e[1]);
        else if (e[0] === 'deploy') { gone.delete(e[1]); const v = views?.get?.(e[1]); if (v) { v._fxFirstDone = null; v._fxCast = null; } } // 2026-10-10: its first attack again
        else if (e[0] === 'spawn') { gone.delete(e[1]?.id ?? e[1]); if (e[1]?.side === 'enemy' && e[1].id != null) eborn.set(e[1].id, clockS); } // 2026-10-10: its start effect (flushEnemyBirths)
        else if (e[0] === 'fx' && e[1] === 'summon' && e[4]) gone.delete(e[4].id);
        // local patch: a stone spawned (its 'summon' fx of the same moment, if any, takes it off — stoneFx)
        if (e[0] === 'spawn' && e[1] && (e[1].defId === STONE || e[1].spine === STONE)) stoneBirth.add(e[1].id);
      }
      if (!index || q() === 'low' || !Array.isArray(e)) return;
      switch (e[0]) {
        case 'skill': {
          const v = views.get(e[1]);
          // 2026-10-10: an enemy's skill naming its ability (['skill', id, on, prefabKey] — the sim sends fx 'enemySkill' today)
          if (v?.info?.side === 'enemy') { const k = typeof e[3] === 'string' ? e[3] : e[4]?.prefabKey; if (k) eskillFx(v, k, { on: !!e[2], loop: true }); return; }
          if (!isOp(v) || !bundleOf(v)) return;
          if (e[2] && e[3] !== 'flag') v._fxSkillByEvent = true; // local patch: skillByFlag leaves it alone
          if (!e[2] && e[3] !== 'flag') v._fxSkillOffT = clockS;
          if (e[2] && v._fxSkillFlag && e[3] !== 'flag') { v._fxSkillFlag = false; return; } // already started from its flag (skillByFlag)
          // 2026-10-10: the mode switch detaches the old mode's abilities (ON_DETACHED ends their loop cast
          // effects) and attaches the new one's (its first attack again: `_delayIfFirstAttack`)
          endCast(v); v._fxFirstDone = null; v._fxFoe = null;
          if (e[2]) {
            v._fxSkillOn = true;
            v._fxMarked = null;   // local patch: the targets its marks sit on (pendingHit)
            const fm = attackMode(bindOf(v), true, skillIdx(v)) ?? -1; // 2026-10-10: its mode's enemy-held buff effects
            const foe = foeEffects(bindOf(v), bundleOf(v).prefabs, fm);
            if (foe.length) v._fxFoe = { mode: fm, names: foe, on: new Set() };
            // local patch: the activation's effects (activation(): name mapping + the skill's own, minus the attacks' / targets')
            const { start, loops } = activation(v);
            if (start.length) play(v, 'skillStart', skillIdx(v), { names: start });
            if (loops.length) play(v, 'skillBuff', skillIdx(v), { buff: true, names: loops });
            expect(v, extracted(v, skillBind(v)?.target));   // local patch: its damage this tick (德克萨斯 S2)
          }
          // local patch (maintainer 2026-10-07: the buffs / range stayed ~1 s after the skill): its loops end with it, at once
          // (and the marks it left on its targets: 戴菲恩 S3's hit_1)
          else { v._fxSkillOn = false; stopBuffs(v.id ?? v.info.id, true); endWolves(v.id ?? v.info.id); }
          return;
        }
        case 'atk': {
          const src = views.get(e[1]);
          // 2026-10-10: an enemy's attack — its strike's cast effects, its shot's official trail, its hit to come
          if (src?.info?.side === 'enemy') {
            if (!eOn(src)) return;
            const tgt = views.get(e[2]);
            const p = estrikeFx(src, e[3]);
            if (tgt && p?.part) {
              lastAtk.set(tgt.id ?? tgt.info?.id, { src, t: clockS, mode: p.mode, epart: p.part });
              etrailShot(e, src, tgt, p.part);
            }
            return;
          }
          if (!isOp(src) || !bundleOf(src)) return;
          skillByFlag(src, views); // local patch
          const tgt = views.get(e[2]);
          // 丰川祥子: her note (the 'oblvnsNote' born event of this attack) replaces render/fx.js's arrow
          if (tgt && fxBundleOf(src.info.spine || src.info.defId) === 'oblvns' && notesOn(src)) noteAtks.add(e);
          const mode = modeNow(src); // local patch: the mode this attack belongs to (its bound cast / hit effects)
          if (tgt) lastAtk.set(tgt.id ?? tgt.info?.id, { src, t: clockS, mode });
          if (!noteAtks.has(e)) trailShot(e, src, tgt, mode); // local patch: its projectile's official trail
          if (src._fxSkillOn) foeFx(src, tgt, mode); // 2026-10-10: a mode buff held by the enemy
          // local patch: the mode's own cast effects (a skill's on each of its attacks) — since 2026-10-10 on the attack's own
          // clock: those of ON_CAST_START already started at its 'swing', the strike's (ON_SPELL_ON) now (strikeFx); the
          // throttle (ATTACK_GAP_S) and load level 3 skip them as before (beginCast)
          strikeFx(src, mode);
          return;
        }
        // (2026-10-10, decompile check): the sim's swing start ['swing', unit, windup, kind] — an attack's
        // ON_CAST_START cast effects (swingFx). Every state event reaches onEvent, so render/app.js needs no call of its own.
        case 'swing': {
          const src = views.get(e[1]);
          if (src?.info?.side === 'enemy') { if (eOn(src)) eswingFx(src, Number(e[2]) || 0, e[3]); return; }
          if (src) swingFx(src, Number(e[2]) || 0, views);
          return;
        }
        case 'dmg': {
          const tid = e[1];
          // 2026-10-10: the attacker, the 6th field of the sim's damage event (null: 无来源 damage / an older sim)
          const by = e.length >= 6 && e[5] != null ? e[5] : null;
          if (stoneHit(tid, views)) return; // a 望 stone blast's hit effect
          if (pendingHit(tid, views)) return; // local patch: a skill's damage without an attack
          let a = lastAtk.get(tid);
          if (a && by != null && ownerOf(a.src) !== by) a = null; // another unit's damage: not that attack's hit
          if (!a || clockS - a.t > 2.5) { if (by != null) eskillHit(tid, by, views); return; } // an enemy ability's hit (2026-10-10)
          const tgt = views.get(tid);
          if (!tgt) return;
          if (a.epart) { // 2026-10-10: an enemy attack's hit effects
            if (level() >= 3) return;
            const key = `${ownerOf(a.src)}:${tid}`;
            if (clockS - (lastHit.get(key) ?? -9) < HIT_GAP_S) return;
            lastHit.set(key, clockS);
            lastAtk.delete(tid);
            ehitFx(a.src, a.epart, tgt);
            return;
          }
          if (!a.src._fxSkillOn && level() >= 3) return;
          if (fxBundleOf(a.src.info?.spine || a.src.info?.defId) === 'oblvns' && notesOn(a.src, true)) return;   // her notes hit on their own
          const key = `${a.src.id ?? a.src.info?.id}:${tid}`;
          if (clockS - (lastHit.get(key) ?? -9) < HIT_GAP_S) return;
          lastHit.set(key, clockS);
          lastAtk.delete(tid); // local patch: one impact per attack (a mark's / DoT's later ticks are no attack's hit; audio.js does the same)
          const hits = a.mode != null ? bound(a.src, a.mode, 'hit').slice(0, MAX_HIT_FX) : []; // local patch: the mode's hit effects
          if (hits.length) { play(a.src, 'attackHit', 0, { at: tgt, names: hits, aim: a.src }); return; }
          play(a.src, a.src._fxSkillOn ? 'skillHit' : 'attackHit', skillIdx(a.src), { at: tgt });
          return;
        }
        case 'fx': { // a kit's moving effect: 赤刃明霄陈 S3 剑气 (kits/ops/op-chen3.js) carries her official trail along its path
          if (stoneFx(e, views)) return;
          if (e[1] === 'caperBoomerang2' && e[4]) { caperSecond(e, views); return; } // 2026-10-10: 跃跃 S2's second boomerang
          // 2026-10-10: an enemy's skill / special action naming its ability (fx 'enemySkill' and the fx of its cast) — that ability's official
          // effects, and no procedural stand-in for it (standInOff's kinds) when the enemy binds it
          if (e[4] && typeof e[4] === 'object') {
            const o = e[4], k = fxAbility(o);
            const v = k ? views.get(o.caster ?? o.id ?? o.src ?? o.by) : null;
            if (v?.info?.side === 'enemy') {
              const tgt = o.target ?? o.tgt ?? o.to;
              if (eskillFx(v, k, { target: tgt != null ? views.get(tgt) || null : null }) && STAND_IN.has(fxSpec(e[1], o).a)) ownFx.add(e);
              return;
            }
          }
          if (e[1] === 'zone' && zoneFx(e, views)) return; // 2026-10-10: a skill projectile's reach effects
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
        case 'die': {
          stopOwned(e[1]); endWolves(e[1]); for (const l of live) if (l.on === e[1]) l.inst.stop(true); // local patch: marks on it
          // 蕾缪安 knocked out / withdrawn mid-S3: no shells follow (kit onEnd 'death'), so her locks' marks end with her
          // (they are owned by their targets)
          const lm = lemMarks.get(e[1]);
          if (lm) { lemMarks.delete(e[1]); for (const mark of lm) { mark.done = true; for (const l of mark) l.inst.stop(true); } }
          const v = views.get(e[1]);
          if (v?.info?.side === 'enemy' && e[2] !== 'forcedExit') edeathFx(v); // 2026-10-10: its dead effect
          return;
        }
        case 'leak': stopOwned(e[1]); return; // 2026-10-10: an enemy that got through — its auras end
        default:
      }
    },

    update(dt, cam, vp) {
      camRef = cam; // local patch: status effects' heights (playStatus)
      clockS += dt * gameRate(); // local patch: the battle clock (gaps, ends) — the official effects use scaled time
      stepTrails(dt * gameRate()); // local patch
      stepCasts(); // 2026-10-10: delayed first-attack cast effects
      stepZones(dt * gameRate()); // 2026-10-10: moving projectile reach effects
      if (lastViews && index) for (const v of lastViews.values()) if (isOp(v) && (v._fxSkillOn || ((v.flags | 0) & UF.SKILL)) && bundleOf(v)) skillByFlag(v, lastViews); // local patch
      stepNotes(dt, lastViews);   // the notes fly on while their trails load
      stepWolves(dt);
      flushStoneBirths(lastViews); // local patch
      flushEnemyBirths(lastViews); stepEnemies(lastViews); // 2026-10-10: the enemies' born effects, modes, skill clips
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
      stepBackSwitches();
      for (let i = live.length - 1; i >= 0; i--) {
        const l = live[i];
        if (l.view && l.view.alive !== false && !l.view.remove) {
          l.inst.object.position.set(l.view.x, l.view.y, l.view.z || 0);
          const r = l.view.rot;   // local patch: its mount point's turn (lifted)
          if (r != null && l.inst.nodes?.[0]) l.inst.nodes[0].rotation.set(0, 0, r);
        }
        // local patch (maintainer 2026-10-07: 蕾缪安's beams must come straight down from the sky wherever the target stands): the
        // effect's +y turned to the camera's up — a line along it projects to a screen-vertical line at any place
        if (l.skyward) {
          SKY_Y ||= new mod.THREE.Vector3(0, 1, 0); skyUp ||= new mod.THREE.Vector3();
          l.inst.object.quaternion.setFromUnitVectors(SKY_Y, skyUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize());
        }
        if (l.until != null && clockS > l.until && !l.stopped) { l.stopped = true; l.inst.stop(); }
        if (l.backOf && (l.backOf.inst.stopping || !live.includes(l.backOf)) && !l.inst.stopping) l.inst.stop(); // 2026-10-10: a back copy ends with its front
        if ((!l.view?.paused && !l.hidden) || l.inst.stopping) l.inst.update(dt * rate2 * (l.speed > 0 ? l.speed : 1));   // local patch: every effect on the battle clock (the notes did already: trail = speed × time); a front paused for its back copy (stepBackSwitches) waits
        if (l.inst.done && l.status && l.again && l.unit?._fxStatusOn?.has(l.status) && l.unit.alive !== false) { const a = l.again; l.again = null; a(); } // local patch: a status loops
        // a kept effect (playAt `keep`: 望's stone activation) stays until its owner's 'die' stops it
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
      for (const r of trails) if (r.back) boomerangCaught(r.src); // local patch: back in hand for the next battle
      trails.length = 0; pending.length = 0; // local patch
      castsDelayed.length = 0; zones.clear(); eborn.clear(); eskillSeen.clear();
      if (mod) showLayers();
    },

    destroy() {
      this.clear();
      // local patch (maintainer request 2026-10-10, docs/rules/render.md 「이펙트 렌더러 정리」): free the textures, meshes
      // and occluders while the contexts still live, then end both contexts at once like the 3D board (scene.js destroy) —
      // renderer.dispose() alone left them, 45–170 MB of textures each match, to a GC that never came while anything held
      // the old view
      try { lib?.dispose(); } catch { /* ignore */ }
      try { occ?.geo.dispose(); occ?.meshes[0]?.material.dispose(); } catch { /* ignore */ }
      for (const L of [layers.under, layers.over]) {
        try { L?.renderer.dispose(); } catch { /* ignore */ }
        try { L?.renderer.forceContextLoss(); } catch { /* ignore */ }
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
