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
// In a skill without a mode of its own: the skill's shot on its first attack, else the Default mode's trail (takeShot).
// Clock: every effect, its gaps and its end run on the battle clock (`rate`, the game speed — the official effects use
// scaled time), not only the notes.
// Event → effect (render/fxmap.js effectsFor, by the client's prefab names):
//   'skill' on   → <op>_skill_0N_start_* on the caster, <op>_skill_0N_buff_* looping on it until 'skill' off / death
//   'swing'      → (2026-10-10) the attack's cast effects of ON_CAST_START on the attacker, as its swing starts
//                  (swingFx; modes.json castOpt) — or <op>_attack_start_* by name without bindings
//   'atk'        → its ON_SPELL_ON cast effects (strikeFx); the swing's own when no 'swing' came before it
//   'dmg'        → <op>_attack_hit_01 / <op>_skill_0N_hit_01 on the target of that attacker's last attack (≤ HIT_GAP_S; local
//                  patch: once per attack — the first damage after it)
//   'deploy'     → (2026-10-11) the operator's / token's deploy effect (flushDeploys); 'die' 'killed' → its dead effect
//                  and (2026-10-16) its always-on effects (modes.json `common`), until its 'die'
//   fx 'palsy'   → (2026-10-11) the enemy's cast cut by 麻痹 ends its effects (cutCast)
// Effects follow their unit's rendered position and facing.
//
// Cost: nothing is loaded (three.js, the player, the files) until an operator with an extracted bundle acts; the layer
// is two transparent canvases (pointer-events none) — the effects on the caster (buff loops, local patch: its cast / skill
// start too) under the units canvas (the operator on top; above it on the 2D board, whose backdrop is opaque), the hits on
// targets, trails and notes over it — each drawn only while one of its
// effects is alive, at most
// at device pixel ratio 1.5 (1 at 'medium'); quality 'low' turns the layer off. render/fxplayer.js caps particles; the
// effects alive are capped here per kind (trimLive: MAX_INSTANCES short ones, MAX_LASTING lasting ones — the oldest of
// that kind ends). The view's adaptive load level (render/app.js adaptLoad, as render/fx.js
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
import { attackMode, boundEffects, fortressEffects, modelessTrail } from './fxmap.js'; // local patch: the mode bindings (modes.json)
import { activationEffects } from './fxmap.js'; // local patch: a skill activation's effects
import { foeEffects, castTiming, castPhase, CAST_EVENT } from './fxmap.js'; // 2026-10-10: enemy-held mode buffs, cast timings
import { clipGroup, hitLoopEnd, deployEffect, deadEffect } from './fxmap.js'; // 2026-10-11: clip variants, looping hits, deploy / dead effects
import { commonEffects } from './fxmap.js'; // 2026-10-16: the always-on effects of the common abilities
import { projSpeed } from './fx.js'; // local patch: the trails' flight time (the sim's projectile speeds)
import { bodyZ } from './fx.js'; // local patch: status effects at a unit's head / body (fxstatus.js)
import { wallTiles } from './fx.js'; // local patch: 余 S3's wall tiles
import { fxSpec } from './fx.js'; // local patch: the stand-in archetype of a kit fx event (standInOff)
import { SHOT_HEIGHT } from './fx.js'; // local patch: a trail's start without a muzzle point
import { boneMissing, liftedPoint, loadPoints, mountSpawn, pointKey, pointOn, pointTurn } from './fxpoints.js'; // local patch: the model points of _spawnLocation 3 / 8…
import { enemyProjSpeed, enemyShot } from './fx/speeds.js'; // 2026-10-10: an enemy shot's record / flight time (data/enemies.json `proj`)
import { boomerangThrown, boomerangCaught } from './boomerang.js'; // local patch: a 回环射手's boomerang leaves / is back in her hand
import { PROJ } from './style.js';
import { aglGlideBack } from './fx/kinds.js'; // 予愿安洁莉娜 S2: when her model is back home
import { playSpeed } from './fx/face.js'; // 2026-10-11 (maintainer decision 15): `_usePlaybackSpeed` / `_limitedPlaybackSpeed`
import { kitOfficialPlan, kitOperator } from './fx/kitofficial.js'; // 2026-10-16: kit events the buff templates draw
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
const ESKILL_HOLD_CAP = 40;    // 2026-10-15: a held enemy skill's effects without its end event (子代 lives 35 s) [추정]
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
 *   record (2026-10-10: its shot's speed, `proj`); audio: the sound object (2026-10-10: `enemyMode?.(unitId, defId, mode,
 *   previous mode)` when an enemy's official mode changes — stepEnemies); standIn: render/fx.js simFx(kind, x, y, extra) for a
 *   procedural stand-in this layer times itself (2026-10-10: the 冰凌's pillars tile by tile — ecolumnFx)
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

/** Seconds left that make an effect lasting (liveOverCap) — longer than any hit / cast prefab plays. */
export const LASTING_S = 5;
/** Whether live entry `l` is a lasting effect at battle time `now`: a buff loop, one with no end, or one with > LASTING_S left. */
export const isLasting = (l, now) => !!(l && (l.buff || l.keep || l.until == null || l.until - now > LASTING_S));
/**
 * The live effects to end (oldest first) so that at most `capShort` short ones (hits, casts, trails) and `capLasting`
 * lasting ones (isLasting) stay — each kind ends its own oldest (2026-10-10, maintainer report: 赤刃明霄陈 S3's
 * self-buff, 余 S3's fire wall and other lasting effects showed and vanished, or never showed, in a full battle: one list
 * capped at 24 ended the oldest effect, nearly always a buff loop or a wall piece started with the skill — the hits and
 * casts of a few attackers fill 24 within a second).
 * A `pinned` entry (2026-10-16: an operator's always-on effects, alwaysOn — a few per unit on the board) is never ended here.
 */
export function liveOverCap(list, now, capShort, capLasting) {
  let nLasting = 0, nPinned = 0;
  for (const l of list) if (l?.pinned) nPinned++; else if (isLasting(l, now)) nLasting++;
  let nShort = list.length - nLasting - nPinned;
  const out = [];
  for (const l of list) {
    if (nShort <= capShort && nLasting <= capLasting) break;
    if (l?.pinned) continue;
    if (isLasting(l, now)) { if (nLasting > capLasting) { out.push(l); nLasting--; } }
    else if (nShort > capShort) { out.push(l); nShort--; }
  }
  return out;
}

/** Forward vector [dRow, dCol] of a deploy direction (server/sim/dir.js DIR_VEC; RIGHT for anything else). */
const DIR_FWD = Object.freeze({ UP: [1, 0], RIGHT: [0, 1], DOWN: [-1, 0], LEFT: [0, -1] });
/** 余 S3's piece offset toward his front (yu_skill3_range_01_root `_offset`). */
export const YU_WALL_OFFSET = 0.4;
/**
 * 余 S3 灶里乾坤's fire wall as the client assembles it (2026-10-10, maintainer report: the flames stand on his tile's
 * front edge — facing right, on its right edge; decompile): his skill's buff effect yu_skill3_range_01_source
 * (YuS3EffectBehaviour `_effectEachGrid`, OnPlay RVA 0xCC2100) creates yu_skill3_range_01_root at the centre of every
 * tile of his line across the map; each root (YuS3EffectWithEdgeBehaviour._InitPlayersIfNot, 0xCC2F70) plays its pieces at
 * the tile centre + SharedConsts.FOUR_WAYS[his direction] × `_offset` 0.4 — on the tile's front edge: facing UP / DOWN
 * its row piece `_effectWhenHorizontal` yu_skill3_range_01 (HorizontalEffectPlayer.EffectNeedPlay 0xCB0BC0: direction 0 /
 * 2); facing LEFT / RIGHT the column piece of its screen side, `_effectVerticalWhenAtWorldRight` _r or `…Left` _l
 * (VerticalEffectPlayer.IsWorldRight 0xCC1910: its x right of the camera's); and at an end of the line (the next tile
 * invalid) the end piece as well — _L_end / _R_end along a row, _l / _r + _U_end / _D_end along a column.
 * @param {string} dir his direction (UP | RIGHT | DOWN | LEFT)
 * @param {Array<[number, number]>} tiles the line's tiles [[row, col]] in order (render/fx.js wallTiles)
 * @param {number} midX the camera's column: a column piece right of it is the _r copy
 * @returns {Array<{ name: string, x: number, y: number }>} client names (the extracted files differ in case: _R)
 */
export function yuWallPieces(dir, tiles, midX) {
  const [dr, dc] = DIR_FWD[dir] || DIR_FWD.RIGHT;
  const col = dc !== 0;   // facing LEFT / RIGHT: the wall runs along his column
  const out = [];
  if (!Array.isArray(tiles) || !tiles.length) return out;
  const ends = col
    ? { lo: Math.min(...tiles.map((t) => t[0])), hi: Math.max(...tiles.map((t) => t[0])) }
    : { lo: Math.min(...tiles.map((t) => t[1])), hi: Math.max(...tiles.map((t) => t[1])) };
  for (const [r, c] of tiles) {
    out.push({ name: 'yu_skill3_range_01_root', x: c, y: r });
    const x = c + dc * YU_WALL_OFFSET, y = r + dr * YU_WALL_OFFSET;
    if (col) {
      const side = x > midX ? 'r' : 'l';
      out.push({ name: `yu_skill3_range_01_${side}`, x, y });
      if (r === ends.hi) out.push({ name: `yu_skill3_range_01_${side}_U_end`, x, y });   // row up = +row (dir.js)
      if (r === ends.lo) out.push({ name: `yu_skill3_range_01_${side}_D_end`, x, y });
    } else {
      out.push({ name: 'yu_skill3_range_01', x, y });
      if (c === ends.lo) out.push({ name: 'yu_skill3_range_01_L_end', x, y });
      if (c === ends.hi) out.push({ name: 'yu_skill3_range_01_R_end', x, y });
    }
  }
  return out;
}

export function createFxLayer({ host, above, quality, load = () => 0, under = () => false, rate = () => 1, fieldRect = () => null, grid = () => null, enemyDef = () => null, audio = () => null, standIn = () => {} }) {
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
    if (entry.owner != null && gone.has(entry.owner) && (entry.buff || entry.onCaster)) { inst.dispose(); return null; }
    if (entry.cast?.cut) { inst.dispose(); return null; } // 2026-10-11: its cast was cut (cutCast) while the file loaded
    recent.push({ n: inst.def?.name ?? inst.name ?? '?', t: clockS, seq: ++recentSeq }); if (recent.length > 24) recent.shift(); // local patch
    layer.scene.add(inst.object);
    layer.n++;
    const l = { inst, ...entry, layer };
    live.push(l);
    return l;
  }
  function dropLive(l) { l.inst.dispose(); l.layer.n--; }
  /** End the oldest effects past their kind's cap (liveOverCap). */
  function trimLive() {
    if (!mod) return;
    for (const l of liveOverCap(live, clockS, mod.fxp.MAX_INSTANCES, mod.fxp.MAX_LASTING ?? mod.fxp.MAX_INSTANCES)) {
      live.splice(live.indexOf(l), 1);
      dropLive(l);
    }
  }
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
  // `aim`: the hit's attacker (an entry with `_useOwnerToTargetDirection`, modes.json `hitAim`); `cast` (2026-10-11): the
  // cast record it belongs to (beginCast — cutCast ends them)
  // Facing (2026-10-11, maintainer decision 「공식대로」 — client `Effect.Play` RVA 0xC8A5D0 / `ParticleEffect.FaceTo` 0xCB1DC0):
  // the effect is played with a direction — the caster's drawn side (faceVector, ±x), its four-way facing for an entry with
  // `_useFourDirectionalFace` (modes.json `turn`), attacker → target for `_useOwnerToTargetDirection` (`hitAim`) — and the
  // prefab's `_rotateType` decides what that does (fxplayer.js FxInstance / fx/face.js faceTurn: only FLIP_TWO_SIDE flips,
  // FOUR_DIRECTION turns, NONE does neither). This replaces 「every effect mirrored when facing left」 and its exceptions (the
  // left / right copies of a directional entry, the `right` twins, the turned entries): those prefabs are NONE /
  // FOUR_DIRECTION. A prefab without the record (no ParticleEffect root) keeps the old mirror / turn.
  async function play(view, kind, skillIndex = 0, { at = null, buff = false, names: given = null, tag = null, until: endAt = null, speed = 1, aim = null, cast = null } = {}) {
    const b = bundleOf(view);
    if (!b) return;
    // local patch (maintainer report): a directional emitter entry plays the copy for the facing (dirPick)
    const { names, unflip } = dirPick(view, given || effectsFor(b.prefabs, kind, skillIndex));
    if (!names.length || !(await ensure())) return;
    // local patch (maintainer report 2026-10-08: 赤刃明霄陈's S3 dragon twice, over her): a left / right pair (fx_extract.py
    // `right`: the client plays the left copy and swaps in its `_rightEffect` while the owner faces right) is one effect —
    // the copy for the facing (all five pairs are `_rotateType` 0: never mirrored); the right copy that the name lookup
    // listed besides is skipped
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
      if (!buff && endAt != null && endAt <= clockS) continue;
      const ground = at || view;
      const anchor = lifted(ground, def); // local patch: its _spawnLocation
      const fourWay = turns(view).has(n); // `_useFourDirectionalFace` (local patch, maintainer report 2026-10-07: 野鬃 S2 stood upright)
      const aimed = !!(aim && at && aimSet(view).has(names[i])); // 2026-10-10: attacker → target
      // only the effects that go to the split scene (on the caster) split — a hit on a target goes to the upper canvas,
      // which draws layer 0 only (split, every blast on a target was invisible at 'high' on the 3D board: 烛煌 S3)
      const split = (buff || !at) && splitOn();
      const side = (view.visFacing ?? view.facing ?? 1) < 0 ? -1 : 1;
      const dir = aimed ? { x: Number(at.x) - Number(aim.x), y: Number(at.y) - Number(aim.y) } : fourWay ? WAY4[facingDir(view)] : { x: side, y: 0 };
      // no face record (an old extract / no ParticleEffect root): the old rule — mirrored when facing left, except the turned
      // entries, the `right` twins and the left / right copies of a directional entry
      const turnOld = !def.face && fourWay && def.nodes?.some((d) => d.name === 'rotation_z');
      const facing = def.face ? side : aimed ? aimFacing(null, def, aim, at) : turnOld || sided || unflip.has(names[i]) ? 1 : side;
      const sp = playSpeed(def.face, speed, gameRate()); // `_usePlaybackSpeed` 0 → 1.0; ≤ `_limitedPlaybackSpeed` ÷ the battle speed
      // local patch: cut at the ground the unit stands on (fxplayer.js floor — a tile's height, not a flyer's hover)
      const inst = new mod.fxp.FxInstance(def, { quality: q(), facing, dir, body: facingDir(at && at.info ? at : view), speed: sp, split, floor: ground.z || 0 });
      if (turnOld) aimMover(inst, facingDir(view));
      if (aimed && !def.face) aimAlong(inst, aim, at);
      // its FxDelay / branch delays (inst.lead, effect seconds) come before its prefab's duration
      const until = buff ? null : endAt ?? clockS + (def.duration || 3) + 0.5 + inst.lead / sp;
      inst.object.position.set(anchor.x, anchor.y, anchor.z || 0);
      // local patch (maintainer 2026-10-07: the skill effects covered the operator): every effect on the caster — its cast /
      // skill start as well as its buff loops — goes under the units; the hits on a target stay over
      // (local patch, maintainer report 2026-10-07: 마터호른 S2's dome must cover her) at 'high' the caster's effects split by their renderers' sorting
      addLive(inst, { view: anchor, owner: view.id ?? view.info?.id, buff, onCaster: !at, until, tag, speed: sp, cast, backSw: backSwitch(def, at || view, b.bundle) }, split ? layers.split : buff || !at ? layers.under : layers.over);
      trimLive();
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
    sw.entry = addLive(inst, { view: at, owner: l.owner, buff: l.buff, onCaster: l.onCaster, until: l.until, tag: l.tag, backOf: l }, l.layer);
    trimLive();
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
  /**
   * The unit left the field (knocked out / withdrawn): its buffs and the one-shots on it end; hits it made on targets play
   * on — except its cast's looping ones (2026-10-11: `OnCastFinish` clears the `_oneshot` 0 effects, OWNER_DEAD too).
   */
  function stopOwned(ownerId) {
    for (const l of live) if (l.owner === ownerId && (l.buff || l.onCaster || l.tag === 'castLoop')) l.inst.stop(true);
  }

  // the trail's 'rotation_z' node is the client's heading pivot: the dragon's head points along +x at 0° (the prefab's
  // own 90° = UP); board x = column, y = row (UP = +row). Re-aimed on every 'fx' step, so it turns with the 剑气 at walls
  const MOVER_DEG = { RIGHT: 0, UP: 90, LEFT: 180, DOWN: 270 };
  const WAY4 = { UP: { x: 0, y: 1 }, RIGHT: { x: 1, y: 0 }, DOWN: { x: 0, y: -1 }, LEFT: { x: -1, y: 0 } }; // SharedConsts.FOUR_WAYS
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
      trimLive();
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
  const SP_P = { x: 0, y: 0, s: 0, depth: 0 };
  /**
   * The column a unit's model stands on: its x + its view's `modelDX` (render/units.js MODEL_SHIFT — 2026-10-10, [ASSUMED]:
   * 假想敌：管's hidden-core copy is drawn one column right of its tile). Effects placed on a model, shots from / to it and
   * line ends use it; a model point (specialPoint) already follows the drawn body.
   */
  const mx = (v) => Number(v.x) + (Number(v.modelDX) || 0);
  /** The world point of a unit's model point `key` (muzzle, sp0…; its current skeleton's, front or back), or null. */
  function specialPoint(v, out, key = 'sp0') {
    const entry = ptsOf(v)?.[key] || null;
    const sp = entry && v.actor?.spine, sk = sp?.skeleton;
    if (!sk || !v.screen?.s || !camRef || !sp.scale) return null;
    const bone = pointOn(entry, sk, !!v.entryBack, boneAt);
    if (!bone) return null;
    // the bone in the skeleton's own frame times the model's display scale, from the unit's root + body (not through the
    // display tree: an impostor-drawn model renders its skeleton elsewhere, units.js _updateImpostor). The scale is the
    // view's own (units.js `modelSX` / `modelSY`, facing mirror included): an impostor's skeleton is scaled for its atlas
    // slot without the mirror, or not at all (render/impostor.js draw)
    const kx = Number.isFinite(v.modelSX) ? v.modelSX : sp.scale.x, ky = Number.isFinite(v.modelSY) ? v.modelSY : sp.scale.y;
    const ox = (v.root?.x ?? v.screen.x) + (v.body?.x || 0), oy = (v.root?.y ?? v.screen.y) + (v.body?.y || 0);
    const g = { x: ox + bone.x * kx, y: oy + bone.y * ky };
    // the world point under it at the unit's row (fxpoints.js liftedPoint: the camera's perspective taken into account)
    return liftedPoint(camRef, v.x, v.y, (v.z || 0) + (v.hover || 0), v.screen.y, g.x, g.y, out, SP_P);
  }
  /**
   * Where a unit's entity stands (maintainer report 2026-10-12: 予愿安洁莉娜 S2's buff_01 on the ground went along with her
   * gliding model): its model's column (mx), but its tile while the model glides away from it (render/units.js glide —
   * the client carries only the model, on projectile_chr_aglna2_s2_fly; the entity stays). An effect created on the unit
   * without a FollowMountPoint stays with the entity [추정: the client's Effect is held at the entity, not the model]; a
   * mounted one follows its point on the model (specialPoint).
   */
  const ex = (v) => (v.glideS ? Number(v.glideS.lx) + (Number(v.modelDX) || 0) : mx(v));
  const ey = (v) => (v.glideS ? Number(v.glideS.ly) : v.y);
  // local patch (maintainer report): a prefab with a FollowMountPoint (fx_extract.py `mount`) is placed
  // at and follows its mount point instead of its _spawnLocation; with `pauseWhenInvalid` it stands still (`paused`, the
  // frame loop skips its update) while the unit's current skeleton has none of the point's bones
  function lifted(v, def) {
    const spawn = mountSpawn(def?.mount) ?? def?.spawn;
    const key = pointKey(spawn);
    if (key && v && ptsOf(v)?.[key]) {
      const p = { x: 0, y: 0, z: 0 };
      const at = () => specialPoint(v, p, key) || (camRef ? { x: mx(v), y: v.y, z: bodyZ(camRef, v, 0.5) } : v);
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
    if (!frac || !v || !(v.info || v.screen)) {
      // 2026-10-11: an airborne (起飞) operator's feet are at the flyers' height (render/units.js `liftoff`; the client's
      // _spawnLocation FOOT / NONE is the entity's place, its fly height included) — 予愿安洁莉娜 S3's range ring is authored to
      // come down from there onto her tile (docs/rules/render.md 「이륙 높이」)
      if (v && v.liftoff) {
        return {
          get x() { return ex(v); }, get y() { return ey(v); }, get z() { return (v.z || 0) + (v.hover || 0); },
          get alive() { return v.alive; }, get remove() { return v.remove; }, id: v.id, info: v.info,
        };
      }
      if (!v || !(v.modelDX || 'glideS' in v)) return v;
      return {   // its feet under the drawn model (MODEL_SHIFT), on its tile while the model glides
        get x() { return ex(v); }, get y() { return ey(v); }, get z() { return v.z; }, get hover() { return v.hover; },
        get alive() { return v.alive; }, get remove() { return v.remove; }, id: v.id, info: v.info,
      };
    }
    return {
      get x() { return ex(v); }, get y() { return ey(v); },
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
    // local patch: status prefabs are not split like a caster's effect — their renderers are sortingOrder 0 / fudge 0
    // (buff_autochess_frozen's block too), which that split puts behind the unit, while the client sorts them by depth and
    // the 冻结 block covers the model (maintainer capture 9); drawn over the units (the snowflake / fist over heads, capture 10).
    // 2026-10-14 (maintainer report: 伊内丝's / 卡涅利安's bind tinted the whole enemy, YouTube captures: thin red lines / gold
    // sand strands, the glow only around the silhouette): a renderer with sortingOrder < 0 is behind the model (伊内丝 glow -1,
    // 卡涅利安 sand planes -2 / -3) — at 'high' a prefab that has one splits 'backOnly', everything else stays in front.
    // local patch (maintainer request 2026-10-08): `under` (the prep elite glow, fxgolden.js — its glow / sparks are sortingOrder -1,
    // behind the model) splits by sorting at 'high' like a caster's effect, else draws under the units
    const split = !splitOn() ? false : under ? true : mod.fxp.hasBackOrder(def) ? 'backOnly' : false;
    const inst = new mod.fxp.FxInstance(def, { quality: q(), facing: (view.visFacing ?? view.facing ?? 1) < 0 ? -1 : 1, split, floor: view.z || 0, hold });
    inst.object.position.set(anchor.x, anchor.y, anchor.z);
    addLive(inst, { view: anchor, owner: ownerOf(view), buff: true, status: key, again: () => playStatus(view, bundle, name, key, frac, hold, under), unit: view }, split ? layers.split : under ? layers.under : layers.over);
    trimLive();
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
  /**
   * 2026-10-16: whether an attack in a skill that switches no attack mode (modeNow −1) is the skill's own shot. A skill
   * without duration (an instant cast, charges, the next attack: 号角 S1, 歌蕾蒂娅 S1, 流星 S1 …) shoots its projectile
   * (modes.json `skills[i].shot` / `shotHit`, char_modes.py) with the first attack after its start — the sim's window of such
   * a skill ends with that attack; the attacks of the same moment share it (断崖 S1's two targets). Its trail
   * (fxmap.js modelessTrail) and its hits ('dmg') are the shot's; any other attack of the skill flies the Default mode's trail
   * (the client's attack mode does not change) — before, they all flew render/fx.js's procedural shot.
   */
  function takeShot(src) {
    const s = src._fxShot, shot = skillBind(src)?.shot;
    if (!s || !(s.t == null || s.t === clockS) || !Array.isArray(shot) || !shot.length) return false;
    s.t = clockS;
    return true;
  }
  /** Whether this attack flies its mode's official trail (decided now, synchronously, for arrowKind); loads it otherwise. */
  function trailShot(e, src, tgt, mode, shot = false) {
    if (!tgt || mode == null || level() >= 3 || failed) return false;
    const spec = PROJ[e[3]];
    let name = null;
    if (spec && mode === -1) ({ name, mode } = modelessTrail(bindOf(src), bundleOf(src)?.prefabs, skillIdx(src), shot));
    else if (spec) name = bound(src, mode, 'trail')[0];
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
    const rec = { inst: null, tgt, x0: from.x, y0: from.y, z0: from.z, tx: mx(tgt), ty: tgt.y, tz: shotTo(tgt), k: 0,
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
      trimLive();
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
    const rec = { inst: null, tgt, x0: from.x, y0: from.y, z0: from.z, tx: mx(tgt), ty: tgt.y, tz: shotTo(tgt), k: 0,
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
    if (mp === 7) return { x: mx(src), y: src.y, z: (src.z || 0) + (src.hover || 0) };   // MountPointType GROUND
    const key = Number.isInteger(mp) ? pointKey(mountSpawn({ type: mp })) : null;
    const p = (key && specialPoint(src, shotAt, key)) || specialPoint(src, shotAt, 'muzzle');
    return p ? { x: p.x, y: p.y, z: p.z } : { x: mx(src), y: src.y, z: bodyZ(camRef, src, SHOT_HEIGHT.launch) };
  }
  const shotTo = (t) => specialPoint(t, hitAt, 'hit')?.z ?? bodyZ(camRef, t, SPAWN_FRAC[2]);
  /** A trail at flight fraction k: on the line to the target's current spot (a lob on its arc), turned along it. */
  function placeTrail(rec) {
    const t = rec.tgt;
    if (t && t.alive !== false && !t.remove && Number.isFinite(t.x)) { rec.tx = mx(t); rec.ty = t.y; rec.tz = shotTo(t); }
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
  /**
   * 2026-10-11 (user report: 언더플로우's and 애쉬락's projectiles disappear late): a projectile's `_mainEffect` ends as its
   * projectile stops, the client's way (`Effect.FinishMe` RVA 0xC88FE0 on a ProjectileEffect): its first particle system
   * stops and its `_inactiveOnFinish` nodes go off at once (FxInstance.finishMain), and the whole effect is gone `_delayToFinish`
   * s later (`delayToRecycle`, the prefab's `finish`; none = at once) — it used to stop emitting and stay until its last
   * particle died: 언더플로우's bullet (a 5 s particle) sat on the target for up to 5 s, 애쉬락's shell for 1.5 s.
   */
  function finishShot(inst, l = live.find((x) => x.inst === inst)) {
    if (!inst) return;
    const fin = Number(inst.def?.finish);
    inst.finishMain?.();
    if (l && fin > 0) { if (!(l.finishAt <= clockS + fin)) l.finishAt = clockS + fin; } else inst.stop(true);
  }
  /** Fly the trails one frame (game time); a trail that arrived ends as its projectile's main effect (finishShot). */
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
      if (rec.k >= 1) { finishShot(rec.inst); trails.splice(i, 1); }
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
      trimLive();
    }
  }
  function endNote(rec) {
    rec.ended = true;
    for (const c of rec.copies) finishShot(c.inst); // 2026-10-11: her note is the projectile's `_mainEffect` (finishShot)
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
    trimLive();
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
  async function spawn(bundle, name, at, entry, { over = true, facing = 1, drop = null, aim = null, dir = null } = {}) {
    if (!index?.bundles?.[bundle]?.includes(name) || !(await ensure())) return null;
    const def = await lib.load(bundle, name);
    if (!mod || !def) return null;
    if (entry.until != null && entry.until <= clockS) return null; // 2026-10-10: its end passed while it loaded
    if (entry.owner != null && gone.has(entry.owner) && (entry.buff || entry.onCaster)) return null;
    const unit = at && at.info ? at : null;
    const split = !over && splitOn();   // an effect on the ground / a unit splits by sorting at 'high'
    // 2026-10-10: turned along its attacker → target line; 2026-10-11 (maintainer decision 「공식대로」): played with that
    // direction (else `dir`, else ±x by `facing`) and turned as its prefab's `_rotateType` says (play())
    const official = !!def.face;
    if (aim && !official) facing = aimFacing(null, def, aim, at);
    const d = aim ? { x: Number(at.x) - Number(aim.x), y: Number(at.y) - Number(aim.y) } : dir;
    const sp = playSpeed(def.face, entry.speed ?? 1, gameRate());
    const inst = new mod.fxp.FxInstance(def, { quality: q(), facing, dir: d, body: unit ? facingDir(unit) : null, speed: sp, split, floor: drop ? null : at.z && !over ? at.z : 0 });
    if (aim && !official) aimAlong(inst, aim, at);
    if (!drop) at = lifted(at, def); // local patch: its _spawnLocation
    if (!drop && Number.isFinite(def.height)) at = overHeight(at, def.height); // 2026-10-10: `_overwriteHeight`
    inst.object.position.set(at.x, at.y, at.z || 0);
    const e = { view: at, ...entry, speed: sp, backSw: backSwitch(def, unit, bundle) };
    if (e.until === undefined) e.until = clockS + (def.duration || 3) + 0.5 + inst.lead / sp;
    if (drop) { drop.inst = inst; placeTrail(drop); }
    const l = addLive(inst, e, over ? layers.over : split ? layers.split : layers.under);
    trimLive();
    return l;
  }
  // ---- 卫戍协议 template effects (2026-10-11, maintainer decision 17 「넣음」) --------------------------------------------
  // The mode's bond / equipment / band buff templates create effects from their graph nodes (`Nodes.CreateEffect`
  // RVA 0xB90880 on a unit, `CreateEffectAtScreenPos` on the screen) once when the node runs — 라테라노 클립 bond_laterano_reload_01,
  // 신속 맹약·사막 나침반 bond_charge_battle_01, 에기르 맹약 bond_aegir_eat_01, 증원 map_act1autochess_reinforce_02, 쉐라그 맹약 map_snow_left_2_right
  // (docs/rules/fx.md 「위수 협의 템플릿 이펙트」). The sim names each in the status event ['tplfx', target | null, key,
  // source | null] (docs/SIM.md); a missing prefab or target plays nothing.
  const TPL_BUNDLES = ['bond', 'map', 'common', 'buff'];   // looked in first (the template effects' own bundles)
  let tplIdx = null, tplIdxOf = null;
  /** [bundle, prefab] of an extracted effect named `key` (without case; the template bundles first), or null. */
  function tplPrefab(key) {
    if (typeof key !== 'string' || !key || !index?.bundles) return null;
    if (tplIdxOf !== index) {
      tplIdxOf = index; tplIdx = new Map();
      const all = Object.keys(index.bundles);
      for (const b of [...TPL_BUNDLES.filter((x) => all.includes(x)), ...all.filter((x) => !TPL_BUNDLES.includes(x))]) {
        for (const n of index.bundles[b] || []) if (!tplIdx.has(String(n).toLowerCase())) tplIdx.set(String(n).toLowerCase(), [b, n]);
      }
    }
    return tplIdx.get(key.toLowerCase()) || null;
  }
  /** The middle of the battle field (a screen-position effect) [추정: the client's screen position is the screen centre]. */
  function fieldMiddle() {
    let rect = null;
    try { rect = fieldRect(); } catch { /* none */ }
    if (rect && [rect.r0, rect.r1, rect.c0, rect.c1].every(Number.isFinite)) return { x: (rect.c0 + rect.c1) / 2, y: (rect.r0 + rect.r1) / 2, z: 0 };
    let g = null;
    try { g = grid(); } catch { /* none */ }
    return Array.isArray(g) && g.length && Array.isArray(g[0]) ? { x: (g[0].length - 1) / 2, y: (g.length - 1) / 2, z: 0 } : null;
  }
  function tplFx(e, views) {
    const r = tplPrefab(e[2]);
    if (!r) return;
    if (e[1] == null) { // on the screen: over the field
      const at = fieldMiddle();
      if (at) spawn(r[0], r[1], at, { owner: null, buff: false, tag: 'tplfx' }, { over: true });
      return;
    }
    const tgt = views?.get?.(e[1]);
    if (!tgt) return;
    // a unit leaving in the same moment (에기르 맹약's devoured operator): where it stood, not followed
    if (tgt.alive === false || tgt.remove) {
      spawn(r[0], r[1], { x: Number(tgt.x), y: Number(tgt.y), z: Number(tgt.z) || 0 }, { owner: null, buff: false, tag: 'tplfx' }, { over: true, facing: efacing(tgt) });
      return;
    }
    // on its target (followed, at its prefab's _spawnLocation), ended with it; played with the target's facing [추정: the
    // node's direction options are not in the event]
    spawn(r[0], r[1], tgt, { owner: null, buff: false, on: tgt.id ?? e[1], tag: 'tplfx' }, { over: true, facing: efacing(tgt) });
  }
  // A 护盾 layer blocking a hit (sim damage.js absorbShields → fx 'parry' {id}): the client's BlockDamage.Execute (RVA
  // 0xBB6960) plays common_buff_parry_01 on the holder when the node names no effect of its own (_specifyBlockEffect /
  // blackboard `effect`; empty in archet_t_2, kalts2_t_2[shield], mudrok_t_1, nearl2_s_2[shield])
  const PARRY = 'common_buff_parry_01';
  function parryFx(e, views) {
    const tgt = views?.get?.(e[4]?.id);
    if (!tgt || failed || q() === 'low' || !index?.bundles?.common?.includes(PARRY)) return;
    spawn('common', PARRY, tgt, { owner: null, buff: false, on: tgt.id ?? e[4].id, tag: 'parry' }, { over: true, facing: efacing(tgt) });
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
  // ---- 2026-10-11: the 선발 picks only the CN client has — 凯尔希·思衡托 (kalts2), 克莱门莎 (clemnt), 予愿安洁莉娜 (aglna2): their kit
  // events drawn with their official prefabs. Which prefab plays at which moment is read from the CN client's
  // battle/prefabs/[uc]projectiles.ab (`_mainEffect` / `_effectsWhenReached` / `_effectsToTargetWhenStart`) and its buff templates
  // (gamedata battle/buff_template_data `overrideEffectKey` / `_effectKey`) — docs/rules/fx.md 「선발 추가 3명 — 키트 이펙트」.
  /** The extracted bundle of `v` when it is `bundle`'s operator, else null. */
  const pickOf = (v, bundle) => (!failed && v && bundleOf(v)?.bundle === bundle ? bundleOf(v) : null);
  /** The extracted name of `n` in `b` (the templates' keys differ in case from the bundle's: fly_trail_rightAndLeft_01), or null. */
  const pickName = (b, n) => (b ? b.prefabs.find((p) => p.toLowerCase() === n.toLowerCase()) || null : null);
  /** An anchor moving from (x0, y0) to (x1, y1) over `dur` battle seconds from now (a projectile's `_mainEffect`), at height z. */
  function glider(x0, y0, x1, y1, dur, z = 0) {
    const t0 = clockS, d = Math.max(0.04, dur);
    const k = () => Math.min(1, (clockS - t0) / d);
    return { get x() { return x0 + (x1 - x0) * k(); }, get y() { return y0 + (y1 - y0) * k(); }, z, alive: true };
  }
  const cabinEnd = new Map();   // 克莱门莎 id → the clock her S2 carriage stops (its passengers' marks end then)
  const aglFlights = new Map(); // 予愿安洁莉娜 id → her S3 flight's effects { off, lives } (ended by the 'aglnaFlight' off)
  function pickFx(e, views) {
    const o = e[4];
    if (!o || typeof o !== 'object') return false;
    const x = Number(e[2]), y = Number(e[3]);
    switch (e[1]) {
      // 克莱门莎 S2 浮游放逐舱: projectile_chr_clemnt_s2_lr / _s2_ud (`_mainEffect` bullet_01 along a row, bullet_02 along a column)
      // runs from her tile to where the sim stops it, in the sim's time
      case 'anchor': {
        const b = pickOf(views.get(o.id), 'clemnt');
        const x0 = Number(o.fromX), y0 = Number(o.fromY), dx = x - x0, dy = y - y0, dur = Math.max(0, Number(o.dur) || 0);
        const n = pickName(b, Math.abs(dx) >= Math.abs(dy) ? 'clemnt_skill_02_bullet_01' : 'clemnt_skill_02_bullet_02');
        if (!n || !Number.isFinite(x0) || !Number.isFinite(y0)) return false;
        ownFx.add(e);
        cabinEnd.set(o.id, clockS + dur);
        if (dur > 0) spawn(b.bundle, n, glider(x0, y0, x, y, dur), { owner: o.id, buff: false, until: clockS + dur }, { over: false, facing: dx < 0 ? -1 : 1, dir: { x: Math.sign(dx), y: Math.sign(dy) } });
        return true;
      }
      // …and its vortex where it stopped: projectile_chr_clemnt_s2_range (`_mainEffect` bullet_range_01, on the ground) for the
      // rest of the skill [추정: that projectile is the vortex — no other S2 prefab is a ground ring of water]
      case 'tide': {
        const b = pickOf(views.get(o.id), 'clemnt'), n = pickName(b, 'clemnt_skill_02_bullet_range_01');
        if (!n) return false;
        ownFx.add(e);
        spawn(b.bundle, n, { x, y, z: 0 }, { owner: o.id, buff: true, until: clockS + Math.max(0.5, Number(o.dur) || 0) }, { over: false });
        return true;
      }
      case 'teleport': {
        // a passenger of the carriage (src = 克莱门莎): clemnt_s2[projectile_hit] puts mark_enemy over its head while it is carried
        if (o.src != null) {
          const b = pickOf(views.get(o.src), 'clemnt'), n = pickName(b, 'clemnt_skill_02_mark_enemy'), v = views.get(o.id);
          if (!n || !v) return false;
          ownFx.add(e);
          if (!(v._clemntMark > clockS)) {
            v._clemntMark = Math.max(clockS + 0.2, cabinEnd.get(o.src) || 0);
            spawn(b.bundle, n, v, { owner: o.id, buff: true, until: v._clemntMark });
          }
          return true;
        }
        // 凯尔希·思衡托 S3 lands on her anchor's tile: teleport_end_01 [추정: by its name — no template names it]
        const b = pickOf(views.get(o.id), 'kalts2'), n = pickName(b, 'kalts2_skill_03_teleport_end_01');
        if (!n) return false;
        ownFx.add(e);
        spawn(b.bundle, n, views.get(o.id) || { x, y, z: 0 }, { owner: null, buff: false });
        return true;
      }
      // 克莱门莎 S3: projectile_chr_clemnt_s3 flies with no effect (its fall is a sound) and `_effectsWhenReached` Mark_all_01, which
      // holds its own three waves (5.25 s) — once a bombardment (the sim's 'lock'); its three 'blast's draw no stand-in
      case 'lock': {
        const b = pickOf(views.get(o.src), 'clemnt'), n = pickName(b, 'clemnt_skill_03_Mark_all_01');
        if (!n) return false;
        ownFx.add(e);
        spawn(b.bundle, n, { x, y, z: 0 }, { owner: null, buff: false }, { over: false });
        return true;
      }
      case 'blast': {
        if (!pickName(pickOf(views.get(o.id), 'clemnt'), 'clemnt_skill_03_Mark_all_01')) return false;
        ownFx.add(e);
        return true;
      }
      // 凯尔希·思衡托 S2: the 医疗单元 lands — projectile_chr_kalts2_s2_dmg / _s2_heal `_effectsWhenReached` range_damage_01 at an enemy,
      // range_heal_01 at an ally (the sim's `ally`); its 'healAoe' of the same moment draws nothing more
      case 'aoe': case 'healAoe': {
        const b = pickOf(views.get(o.id), 'kalts2');
        if (!b || (e[1] === 'aoe' && o.skill !== 'kalts2:s2')) return false;
        const n = pickName(b, o.ally || e[1] === 'healAoe' ? 'kalts2_skill_02_range_heal_01' : 'kalts2_skill_02_range_damage_01');
        if (!n) return false;
        ownFx.add(e);
        if (e[1] === 'aoe') spawn(b.bundle, n, { x, y, z: 0 }, { owner: null, buff: false }, { over: false });
        return true;
      }
      // 凯尔希·思衡托 S3 takes off for her anchor: teleport_01 where she leaves [추정: by its name], and projectile_chr_kalts2_s3_2's
      // `_mainEffect` teleport_trail_01 flying to the anchor in the sim's time (at her hit-point height [추정])
      case 'disappear': {
        const src = views.get(o.id), b = pickOf(src, 'kalts2');
        const tx = Number(o.tx), ty = Number(o.ty), dur = Math.max(0.05, Number(o.t) || 0);
        if (!b || !Number.isFinite(tx) || !Number.isFinite(ty)) return false;
        ownFx.add(e);
        const start = pickName(b, 'kalts2_skill_03_teleport_01'), trail = pickName(b, 'kalts2_skill_03_teleport_trail_01');
        if (start) spawn(b.bundle, start, { x, y, z: 0 }, { owner: null, buff: false });
        const z = src && camRef ? bodyZ(camRef, src, SPAWN_FRAC[2]) - (src.z || 0) : 0.5;
        // turned along its flight, as every projectile's `_mainEffect` (placeTrail)
        if (trail) {
          spawn(b.bundle, trail, glider(x, y, tx, ty, dur, (src?.z || 0) + z), { owner: null, buff: false, until: clockS + dur + 5, shotEnd: clockS + dur })
            .then((l) => { if (l) l.inst.object.rotation.set(0, 0, Math.atan2(ty - y, tx - x)); });
        }
        return true;
      }
      // 予愿安洁莉娜 S3's flight ('aglnaFlight' on / off — the sim moves her body; projectile_chr_aglna2_s3_fly has no `_mainEffect`):
      // the S3Move mode's aglna2_s_3[fly_passive] trail aglna2_skill_03_fly_trail_01 and aglna2_s_3[move_mode]'s
      // [move_eff_r] / [move_eff_l] (aglna2_skill_03_buff_right_01 / _left_01, by the side she flies to: CheckFaceLOrR) on her
      // until the flight ends [ASSUMED: the side taken once, at take-off]
      case 'aglnaFlight': {
        const src = views.get(o.id), b = pickOf(src, 'aglna2');
        const prev = aglFlights.get(o.id);
        if (prev) { prev.off = true; for (const l of prev.lives) l.until = clockS; aglFlights.delete(o.id); }
        // landed: her deployment direction after the move (the sim turns her toward her travel, home: her own)
        if (!Number(o.on) && typeof o.dir === 'string') src?.setDir?.(o.dir);
        if (!b) return false;
        ownFx.add(e);
        if (!Number(o.on)) return true;
        const rec = { off: false, lives: [] };
        aglFlights.set(o.id, rec);
        const side = Number(o.tx) < x ? 'left' : 'right';
        for (const n of ['aglna2_skill_03_fly_trail_01', `aglna2_skill_03_buff_${side}_01`].map((k) => pickName(b, k)).filter(Boolean)) {
          spawn(b.bundle, n, src, { owner: o.id, buff: true, until: null }).then((l) => {
            if (!l) return;
            if (rec.off) l.until = clockS; else rec.lives.push(l);
          });
        }
        return true;
      }
      // 予愿安洁莉娜 S2 (`chant` > 0): aglna2_s_2[flying] on her model while it glides out (projectile_chr_aglna2_s2_fly
      // creates it as it leaves and finishes it as it reaches: `t`; render/units.js glide moves the model) — the glide trail
      // of her direction (rightAndLeft / up / down _01) and fly_range_01 —, then [chant_end] fly_end_01–03 back home (aglGlideBack).
      // The trail follows its mount point on the gliding model; fly_range_01 (_spawnLocation 5, no FollowMountPoint) is a
      // streak on the ground authored from x −0.5 to ~4.3 along its _mainDir RIGHT (FOUR_DIRECTION), the length of the
      // sweep: it stays on her tile, turned to the sweep (maintainer report 2026-10-12: it moved with her model) [추정: played
      // with the projectile's direction of flight]
      case 'dash': {
        const src = views.get(o.id), b = pickOf(src, 'aglna2'), chant = Number(o.chant);
        if (!b || !(chant > 0)) return false;
        const dx = Number(o.tx) - x, dy = Number(o.ty) - y, fly = Math.min(chant, Number(o.t) || 0);
        const way = Math.abs(dx) >= Math.abs(dy) ? 'rightAndLeft' : dy > 0 ? 'up' : 'down';
        ownFx.add(e);
        if (fly > 0) {
          const trail = pickName(b, `aglna2_skill_02_fly_trail_${way}_01`), range = pickName(b, 'aglna2_skill_02_fly_range_01');
          if (trail) spawn(b.bundle, trail, src, { owner: o.id, buff: true, until: clockS + fly });
          if (range) {
            const at = { x: x + (Number(src?.modelDX) || 0), y, z: Number(src?.z) || 0 };
            spawn(b.bundle, range, at, { owner: o.id, buff: true, until: clockS + fly }, { dir: { x: dx, y: dy } });
          }
        }
        castsDelayed.push({ t: clockS + aglGlideBack(fly, chant), run: () => {
          if (!src || src.alive === false || src.remove || gone.has(o.id)) return;
          for (const n of ['aglna2_skill_02_fly_end_01', 'aglna2_skill_02_fly_end_02', 'aglna2_skill_02_fly_end_03'].map((k) => pickName(b, k)).filter(Boolean)) {
            spawn(b.bundle, n, src, { owner: o.id, buff: false });
          }
        } });
        return true;
      }
      // 予愿安洁莉娜 S3's “一会儿见！” (on her deployment tile while she is away): its own effect (pkgrps/btl_pfb_fx_token_3.ab
      // token_aglna2_agairp_01 → bundle aglna2_token) on it while it stands
      case 'summon': {
        if (o.token !== 'token_10071_aglna2_agairp' || failed || !index?.bundles?.aglna2_token?.includes('token_aglna2_agairp_01')) return false;
        const v = views.get(o.id);
        ownFx.add(e);
        spawn('aglna2_token', 'token_aglna2_agairp_01', v || { x, y, z: 0 }, { owner: o.id, buff: true, until: null }, { over: false });
        return true;
      }
      default: return false;
    }
  }
  /**
   * 2026-10-16: the kit events render/fx/kitofficial.js maps to the prefabs the client's buff templates create at that
   * moment (talent / buff moments no skill or attack binding draws). true = handled (its stand-in skipped); a plan that only
   * ends earlier effects (`pass`) or whose prefabs are not extracted leaves the event to the rest.
   */
  function officialKitFx(e, views) {
    const o = e[4], opId = kitOperator(o), op = views.get(opId), b = !failed && q() !== 'low' ? bundleOf(op) : null;
    const plan = b && isOp(op) ? kitOfficialPlan(e[1], o, b.bundle, { skill: skillIdx(op), back: faceBack(op) }) : null;
    if (!plan) return false;
    for (const tag of plan.stop) for (const l of live) if (l.tag === tag && l.owner === opId) l.inst.stop();
    let n = 0;
    for (const p of plan.play) {
      const name = pickName(b, p.n);
      if (!name) continue;
      if (p.line) {
        const from = views.get(o[p.line[0]]), to = views.get(o[p.line[1]]);
        if (from && to) { startLine(b.bundle, name, from, to, 1e6, { sMount: 1, eMount: 1 }); n++; }
        continue;
      }
      const v = p.on === 'op' ? op : p.on === 'id' ? views.get(o.id) : null;
      if (p.on !== 'point' && !v) continue;
      const at = v || { x: Number(e[2]), y: Number(e[3]), z: 0 };
      const on = v ? ownerOf(v) : undefined;
      const entry = p.life === 'skill' ? { owner: opId, buff: true, until: null }
        : p.life === 'deployed' ? { owner: opId, buff: false, onCaster: true, until: null, on }
          : p.life === 'tag' ? { owner: opId, buff: false, onCaster: !!p.leave, until: null, tag: p.tag, on }
            : p.life === 'unit' ? { owner: null, buff: false, until: null, on }
              : typeof p.life === 'number' ? { owner: null, buff: false, until: clockS + p.life, on }
                : { owner: null, buff: false, on };
      spawn(b.bundle, name, at, entry, { over: p.on !== 'point', facing: v ? efacing(v) : 1 });
      n++;
    }
    if (!n || plan.pass) return false;
    ownFx.add(e);
    return true;
  }
  /** Kit 'fx' events drawn with official prefabs; true = handled here (ownFx: render/fx.js skips its stand-in). */
  function kitFx(e, views) {
    const o = e[4];
    if (!o || typeof o !== 'object') return false;
    if (pickFx(e, views)) return true;
    if (officialKitFx(e, views)) return true;
    const x = Number(e[2]), y = Number(e[3]);
    // 余 S3 灶里乾坤: the client builds the wall from per-tile pieces along the skill's infinite line (skchr_yu_3/TileRange
    // _isHorizontalInfinite), each on the tile's front edge (yuWallPieces — 2026-10-10, maintainer report: it stood on the
    // tile centres, a row piece turned 90° for a column); ends with the skill
    if (e[1] === 'firewall') {
      const src = views.get(o.id), b = bundleOf(src);
      if (!b || !b.prefabs.includes('yu_skill3_range_01')) return false;
      ownFx.add(e);
      let rect = null;
      try { rect = fieldRect(); } catch { /* the ±4 fallback */ }
      const dir = typeof o.dir === 'string' ? o.dir.toUpperCase() : o.axis === 'row' ? 'UP' : 'RIGHT';
      const midX = rect && Number.isFinite(rect.c0) && Number.isFinite(rect.c1) ? (rect.c0 + rect.c1) / 2 : 10;   // the camera's column [추정: the field's middle]
      const file = (n) => b.prefabs.find((p) => p.toLowerCase() === n.toLowerCase()) || null;   // the client looks names up without case (_r → _R)
      for (const p of yuWallPieces(dir, wallTiles(x, y, o.axis === 'row' ? 'row' : 'col', rect), midX)) {
        const n = file(p.name);
        if (n) spawn(b.bundle, n, { x: p.x, y: p.y, z: 0 }, { owner: o.id, buff: true, until: null }, { over: false });
      }
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
  /**
   * The unit's facing for a turned effect: an operator's 4-way face direction now (`Entity.faceDirection` — an attack
   * turns it to its target, render/face-turn.js), else its deploy direction, left / right as it is drawn now.
   */
  const facingDir = (v) => (v.face?.dir4 ? v.face.dir4 : v.dir === 'UP' || v.dir === 'DOWN' ? v.dir : (v.visFacing ?? v.facing ?? 1) < 0 ? 'LEFT' : 'RIGHT');
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
  const KIT_OWNED = new Set(['yu_skill3_range_01',
    // 2026-10-11 (pickFx): the 선발 picks' kit-event prefabs — the `_range` name rule played 克莱门莎's vortex and 予愿安洁莉娜's glide
    // range on the caster for the whole skill besides
    'clemnt_skill_02_bullet_01', 'clemnt_skill_02_bullet_02', 'clemnt_skill_02_bullet_range_01', 'clemnt_skill_02_mark_enemy',
    'clemnt_skill_03_Mark_all_01', 'kalts2_skill_02_range_damage_01', 'kalts2_skill_02_range_heal_01', 'kalts2_skill_03_teleport_01',
    'kalts2_skill_03_teleport_trail_01', 'kalts2_skill_03_teleport_end_01', 'aglna2_skill_02_fly_trail_rightAndLeft_01',
    'aglna2_skill_02_fly_trail_up_01', 'aglna2_skill_02_fly_trail_down_01', 'aglna2_skill_02_fly_range_01', 'aglna2_skill_02_fly_end_01',
    'aglna2_skill_02_fly_end_02', 'aglna2_skill_02_fly_end_03', 'aglna2_skill_03_fly_trail_01', 'aglna2_skill_03_buff_right_01',
    'aglna2_skill_03_buff_left_01']);
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
      const go = () => { if (v._fxCast === c && v.alive !== false) play(v, 'attackStart', 0, { names: [n], tag: loop ? 'castLoop' : 'cast', until: end, speed: c.speed, cast: c }); };
      const delay = c.first && opt?.d > 0 ? opt.d / c.speed : 0;
      if (delay > 0) castsDelayed.push({ t: clockS + delay, run: go }); else go();
    }
  }

  // ---- input targets, clip variants, looping hits, 麻痹 (2026-10-11, decompile check round 2) -------------------
  // InputTargetEffectOptions (modes.json `input`, char_modes.py) is a CastEffectOptions created on the ability's main target
  // instead of the caster (client `InputTargetEffectOptions.CreateEffect`, RVA 0xB1B5F0): at its `_startEvent` (4 the
  // strike, 2 the swing start — 시's dusk_attack_01_hit_02 loops on the target from the swing to the strike), at the
  // ability's playback speed, and — `_useInputPos` (castOpt p) — at the target's last place once it died. The main target is
  // the strike's first 'atk' target; a swing names none, so a swing-start one goes on its last attack's target while that
  // one lives [추정: the sim's 'swing' carries no target], else it starts at the strike.
  /** The main target of `v`'s last strike, while it is on the field. */
  function lastTarget(v) {
    const t = v._fxTgt != null ? lastViews?.get(v._fxTgt) : null;
    return t && t.alive !== false && !t.remove ? t : null;
  }
  /** The input-target effects of phase `phase` ('swing' / 'strike') of cast `c` (mode `mode`), on its main target. */
  function inputFx(v, c, mode, phase, tgt = null) {
    let names = bound(v, mode, 'input');
    if (!names.length || c.skip) return;
    names = names.filter((n) => phaseOf(v, mode, n) === phase);
    if (phase === 'swing') {
      c.inTgt = tgt || lastTarget(v);
      if (!c.inTgt) { c.inputLate = names; return; }
    } else {
      c.inTgt ||= tgt;
      if (c.inputLate) { names = [...c.inputLate, ...names]; c.inputLate = null; }
    }
    const tg = c.inTgt;
    if (!tg) return;
    for (const n of names) {
      const opt = castTiming(bindOf(v), c.mode, n);
      if (opt?.once && c.fired.has(n)) continue;
      c.fired.add(n);
      const loop = !!opt && opt.o === 0;
      const end = !loop ? null : opt.e === CAST_EVENT.SPELL_ON || opt.e === CAST_EVENT.SPELL_END ? Math.max(c.hitAt, clockS) : c.end;
      const go = () => {
        if (v._fxCast !== c || v.alive === false) return;
        const dead = tg.alive === false || !!tg.remove;
        if (dead && !opt?.p) return;   // CreateEffect on a dead target: nothing
        const at = dead ? { x: tg.x, y: tg.y, z: tg.z || 0 } : tg;
        play(v, 'attackHit', 0, { at, names: [n], tag: loop ? 'castLoop' : 'cast', until: end, speed: c.speed, cast: c });
      };
      const delay = c.first && opt?.d > 0 ? opt.d / c.speed : 0;
      if (delay > 0) castsDelayed.push({ t: clockS + delay, run: go }); else go();
    }
  }
  /**
   * The clip group of a new cast of `v` (modes.json clipFx[mode], fxmap.js clipGroup — 비나 빅토리아's Attack_1 / Attack_2
   * cast siege2_attack_start_01 / _02): the group of the attack clip its model plays; its extracted cast / hit names.
   */
  function castGroup(v, mode) {
    const cf = Number.isInteger(mode) && mode >= 0 ? bindOf(v)?.clipFx?.[mode] : null;
    if (!cf) return null;
    let clip = null;
    try { const a = v.actor, ac = a?._attackClip?.(); clip = ac ? (a._loopOf ? a._loopOf(ac) : ac.loop) : null; } catch { /* none */ }
    const g = clipGroup(cf, clip, v._fxClipLast ?? -1, Math.random());
    if (!g) return null;
    v._fxClipLast = g.index;
    return { cast: extracted(v, g.cast), hit: extracted(v, g.hit) };
  }
  const withGroup = (names, more) => (more?.length ? [...new Set([...names, ...more])] : names);
  /**
   * An attack's hits on `tgt` (its mode's hit list): a looping one (modes.json hitLoop) ends at its `_endEvent` — the cast's
   * end for ON_CAST_END / ON_ATTACK_FINISH (엑시아 angle_attack_01_hit, `_convertCastEndToAttachFinish`), at once for
   * ON_SPELL_ON / _END — or with the next cast, a 麻痹 cut or its owner's death; a CastTargetEffectOptions one (castTgt:
   * 실버애쉬 더 레인프로스트 svash2_attack_hit_01) plays at the ability's speed, the others at 1.0.
   */
  function hitFx(src, tgt, names, c) {
    const bind = bindOf(src), fast = new Set(bind?.castTgt || []);
    const plain = [], quick = [];
    for (const n of names) {
      const e = hitLoopEnd(bind, n);
      if (e == null) { (fast.has(n) ? quick : plain).push(n); continue; }
      const until = e === CAST_EVENT.SPELL_ON || e === CAST_EVENT.SPELL_END ? clockS : c?.end != null && c.end > clockS ? c.end : undefined;
      play(src, 'attackHit', 0, { at: tgt, names: [n], aim: src, tag: 'castLoop', until, cast: c });
    }
    if (plain.length) play(src, 'attackHit', 0, { at: tgt, names: plain, aim: src });
    if (quick.length) play(src, 'attackHit', 0, { at: tgt, names: quick, aim: src, speed: c?.speed || 1 });
  }
  /**
   * 麻痹 interrupted `v`'s cast (sim fx 'palsy' { id } — client `Enemy.CanDoAbilitySpellOn` → `FinishIfNot(PALSY)`):
   * `EffectOptions.OnCastFinish` (RVA 0xAE1ED0) with reason PALSY ends every effect that cast's options made, the one-shots
   * too (`_ClearAllEffects`), and the delayed ones never start.
   */
  function cutCast(v) {
    const c = v?._fxCast;
    if (!c) return;
    c.cut = true;
    for (const l of live) if (l.cast === c && !l.inst.stopping) l.inst.stop();
    v._fxCast = null;
  }
  function stepCasts() {
    for (let i = castsDelayed.length - 1; i >= 0; i--) if (clockS >= castsDelayed[i].t) castsDelayed.splice(i, 1)[0].run();
  }
  /**
   * (2026-10-10, maintainer report: 号角's blocked enemies got her ranged blast) the bound `role` effects of mode `mode`
   * for an attack of projectile kind `kind`: a 要塞 mode (modes.json `fortress`, char_modes.py — charpack MeleeAttack /
   * BlockedMeleeAttack vs RangedAttack) casts and hits with its melee abilities' effects while it blocks (the sim's
   * 'swing' / 'atk' kind 'none'), its ranged ones' (+ the projectile's hit) otherwise; any other mode its whole list.
   * `split` tells whether the 要塞 lists answered (then no name-mapped stand-in either).
   */
  function boundFor(v, mode, role, kind) {
    const f = fortressEffects(bindOf(v), bundleOf(v)?.prefabs, mode, role, kind);
    return f ? { names: f, split: true } : { names: mode != null ? bound(v, mode, role) : [], split: false };
  }
  /** A swing starts: the cast effects of ON_CAST_START (the mode's, or the name mapping's attack start without bindings). */
  function swingFx(src, windup, views, kind = null) {
    if (!isOp(src) || !bundleOf(src)) return;
    skillByFlag(src, views);
    const mode = modeNow(src);
    const c = beginCast(src, windup, mode);
    c.group = castGroup(src, mode);
    if (c.skip) return;
    const { names: own, split } = boundFor(src, mode, 'cast', kind);
    const cast = withGroup(own, c.group?.cast);
    inputFx(src, c, mode, 'swing');
    if (cast.length || split) { playCast(src, c, cast.filter((n) => phaseOf(src, mode, n) === 'swing')); return; }
    // no mode binding: the name mapping's attack start, at the swing like the client's ON_CAST_START majority [추정]
    if (!src._fxSkillOn) play(src, 'attackStart', 0, { tag: 'cast' });
  }
  /**
   * The strike ('atk' on `tgt`): the cast effects of ON_SPELL_ON / ON_SPELL_END; the swing's own when no swing was
   * announced. Its first target is the cast's main target (input-target effects, lastTarget).
   */
  function strikeFx(src, mode, kind = null, tgt = null) {
    let c = src._fxCast;
    const same = c && c.mode === mode && clockS <= c.hitAt + SWING_SLACK && (c.struckAt == null || clockS - c.struckAt < 0.03);
    const { names: own, split } = boundFor(src, mode, 'cast', kind);
    if (!same) {   // no 'swing' for this attack: its swing effects now (the moment they had before)
      c = beginCast(src, 0, mode);
      c.group = castGroup(src, mode);
      if (!c.skip) {
        const cast = withGroup(own, c.group?.cast);
        if (cast.length || split) playCast(src, c, cast.filter((n) => phaseOf(src, mode, n) === 'swing'));
        else if (!src._fxSkillOn) play(src, 'attackStart', 0, { tag: 'cast' });
        inputFx(src, c, mode, 'swing', tgt);
      }
    }
    if (c.struckAt != null && clockS - c.struckAt < 0.03) return;   // another target of the same strike
    c.struckAt = clockS;
    if (tgt) src._fxTgt = ownerOf(tgt);
    const cast = withGroup(own, c.group?.cast);
    if (!c.skip && cast.length) playCast(src, c, cast.filter((n) => phaseOf(src, mode, n) === 'strike'));
    inputFx(src, c, mode, 'strike', tgt);
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
  // ---- a storm's chain strikes (2026-10-16, 异客 S3) -------------------------------------------------------------
  // modes.json skills[i].chain (char_modes.py): projectile_chr_pasngr_s3's chain graphic plays its `_specialHitEffect`
  // (pasngr_skill_03_hit) on the first unit of each strike (`_playSpecialEffectOnFirstOne`) and its `_mainEffect` line
  // (pasngr_attack_line) from each struck unit to the next; the projectile's `_effectsWhenHit` (skills[i].target) go on every
  // one. The sim sends each hop as kit fx 'lightning' { id, src, i, from }. false → render/fx.js's procedural bolt.
  function chainFx(e, views) {
    const o = e[4];
    if (!o || typeof o !== 'object' || failed || level() >= 3) return false;
    const src = views.get(o.src), tgt = views.get(o.id);
    if (!tgt || !isOp(src) || !bundleOf(src)) return false;
    const sk = skillBind(src), c = sk?.chain;
    if (!c) return false;
    ownFx.add(e);
    const names = [...(Number(o.i) === 0 ? extracted(src, c.first) : []), ...extracted(src, sk.target)];
    if (names.length) play(src, 'attackHit', 0, { at: tgt, names, aim: src });
    const from = o.from != null ? views.get(o.from) : null;
    const line = from ? extracted(src, c.line)[0] : null;
    if (line && camRef) startLine(bundleOf(src).bundle, line, from, tgt, 0, { sMount: 1, eMount: 1 });   // HIT point to HIT point [추정]
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
  function eplay(v, names, { at = null, over = !!at, buff = false, tag = null, until, owner, on, speed = 1, aim = null, cast = null } = {}) {
    for (const n of names || []) {
      const r = efx(n);
      if (!r) continue;
      const entry = { owner: owner !== undefined ? owner : at ? null : ownerOf(v), buff, onCaster: !at, tag, speed, cast };
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
      const go = () => { if (v._fxCast === c && v.alive !== false) eplay(v, [n], { tag: loop ? 'castLoop' : 'cast', until: end, speed: c.speed, cast: c }); };
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
    if (mount === 7) return { x: mx(src), y: src.y, z: (src.z || 0) + (src.hover || 0) };
    const key = Number.isInteger(mount) ? pointKey(mountSpawn({ type: mount })) : null;
    const p = (key && specialPoint(src, shotAt, key)) || specialPoint(src, shotAt, 'muzzle');
    return p ? { x: p.x, y: p.y, z: p.z } : { x: mx(src), y: src.y, z: bodyZ(camRef, src, SHOT_HEIGHT.launch) };
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
    launchTrail({ inst: null, tgt, x0: from.x, y0: from.y, z0: from.z, tx: mx(tgt), ty: tgt.y, tz: shotTo(tgt), k: 0,
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
  // 2026-10-10: the enemies' content-skill shots — the sim's fx 'enemyShot' { id, from?, tgt, key, move, speed, t }
  // (content/enemies/helpers.js shoot, docs/SIM.md): projectile `key`'s `_mainEffect` from the shooter's `_mountPointType`
  // point (a hop leaving another unit — a chain / bounce: that unit's hit point [추정]) to the target's hit point over the
  // sim's flight `t` (a PARACURVE on its `_raiseHeight` arc; TRACE / FIXED_DIRECTION / HARPOON straight [추정: a harpoon's
  // stretched line is drawn as its trail]); its `_effectsToTargetWhenStart` on the target as it leaves, its `_effectsWhenHit` /
  // `_effectsWhenReached` there as it lands (the 'dmg' of that moment then plays only the ability's own hit effects).
  let eprojAll = null;   // projectile key → its record in any enemy's bindings (a hop's shooter may bind it under another id)
  function eprojOf(v, key) {
    if (typeof key !== 'string' || !key) return null;
    const own = v && ebindOf(v) ? eprojByKey(v, key) : null;
    if (own || !emodes) return own;
    if (!eprojAll) {
      eprojAll = new Map();
      for (const [id, b] of Object.entries(emodes)) {
        if (id[0] === '$' || !b || typeof b !== 'object') continue;
        const parts = [...(b.modes || []).flatMap((m) => [m?.ranged, m?.melee]), ...Object.values(b.skills || {})];
        for (const p of parts) {
          if (p?.proj?.key && !eprojAll.has(p.proj.key)) eprojAll.set(p.proj.key, p.proj);
          for (const sp of Array.isArray(p?.proj?.sub) ? p.proj.sub : []) if (sp?.key && !eprojAll.has(sp.key)) eprojAll.set(sp.key, sp);
        }
      }
    }
    return eprojAll.get(key) || null;
  }
  const eshotLand = new Map();   // `${shooter id}:${target id}` → battle clock its official shot lands (eskillHit)
  /** The projectile record of shot `key` when it can be drawn officially (the layer on, its trail or hit extracted), else null. */
  function eshotDrawable(owner, key) {
    if (!owner || !index || !emodes || failed || q() === 'low') return null;
    const pr = eprojOf(owner, key);
    return pr && [...(pr.trail || []), ...(pr.hit || []), ...(pr.reached || [])].some(efx) ? pr : null;
  }
  function eshotFx(o, views) {
    const shooter = o.id != null ? views.get(o.id) : null;
    const from = o.from != null ? views.get(o.from) : shooter;
    const tgt = o.tgt != null ? views.get(o.tgt) : null;
    const owner = shooter || from;
    const pr = eshotDrawable(owner, o.key);
    // a straight shot (FIXED_DIRECTION: `dir` + `range`, content/enemies/helpers.js lineShot) flies with or without a target
    const dir = Array.isArray(o.dir) && o.dir.length >= 2 ? [Number(o.dir[0]) || 0, Number(o.dir[1]) || 0] : null;
    if (!pr || !from || (!tgt && !dir)) return false;
    // the cast's own effects when no 'enemySkill' came before it (one play per ability and moment: eskillFx)
    if (shooter && typeof o.ability === 'string' && o.ability) eskillFx(shooter, o.ability);
    const t = Number(o.t) > 0 ? Number(o.t) : 0;
    if (tgt && Array.isArray(pr.targetStart) && pr.targetStart.length) eplay(owner, pr.targetStart, { at: tgt });
    const r = efx(Array.isArray(pr.trail) ? pr.trail[0] : null);
    if (r && camRef && t > 0 && t <= (dir ? 12 : 6) && !pr.link && level() < 3 && trails.length < MAX_TRAILS) {
      const p0 = from === shooter ? eshotFrom(from, pr.mount)
        : { x: mx(from), y: from.y, z: specialPoint(from, shotAt, 'hit')?.z ?? bodyZ(camRef, from, SPAWN_FRAC[2]) };
      let rec;
      if (dir) {
        // straight along `dir` (board axes: +x the next column, +y the next row up) to the predicted first hit, `range` tiles
        // out — the sim's own sweep decides the hit; level at its start height [추정]
        const range = Number(o.range) > 0 ? Number(o.range) : t * (Number(o.speed) || Number(pr.speed) || 5);
        rec = { inst: null, tgt: null, x0: p0.x, y0: p0.y, z0: p0.z, tx: p0.x + dir[0] * range, ty: p0.y + dir[1] * range, tz: p0.z, k: 0, dur: Math.max(0.04, t), arc: 0 };
      } else {
        const arc = (o.move ?? pr.move) === 'PARACURVE' || (o.move == null && Number(pr.raise) > 0) ? Math.max(0, Number(pr.raise) || 0) : 0;
        rec = { inst: null, tgt, x0: p0.x, y0: p0.y, z0: p0.z, tx: mx(tgt), ty: tgt.y, tz: shotTo(tgt), k: 0, dur: Math.max(0.04, t), arc };
      }
      ensure().then((ok) => { if (ok && lib) launchTrail(rec, r[0], r[1]); }, () => {});
    }
    if (dir) return true;   // its hit: the 'dmg' the sim's sweep makes (eskillHit draws the projectile's hit then)
    const land = [...new Set([...(pr.hit || []), ...(pr.reached || [])])].filter((n) => efx(n)).slice(0, MAX_HIT_FX);
    eshotLand.set(`${o.id ?? o.from}:${o.tgt}`, clockS + t);
    const go = () => { if (land.length && tgt.alive !== false && !tgt.remove && level() < 3) eplay(owner, land, { at: tgt }); };
    if (t > 0) castsDelayed.push({ t: clockS + t, run: go }); else go();
    return true;
  }
  /**
   * 2026-10-10: “萨米的意志”'s 冰凌 — sim fx 'column' { x, y, c, id, key, sub, r0, dir, speed, dist, life } once at the strike
   * (content/bosses.js kitDeer, docs/rules/sim.md 「萨米的意志 冰凌」): projectile `key` runs from row `r0` of column `c` along
   * `dir` at `speed` and places projectile `sub` on the tile k·`dist` from the start as it passes (k·dist / speed s after the
   * strike); each sub lives `life` s and then hits that tile. Official: `key`'s `_mainEffect` along the column (the client's
   * projectile_enemy_smdeer has none) and each sub's `_mainEffect` / `_effectsWhenReached` on its tile as it is placed
   * (AttachToTarget `_immediatelyReach` — reached at once [추정: the reach effect plays as it is placed]); its `_effectsWhenHit`
   * belong to the 'dmg' of the hit. Without any of them extracted, render/fx.js's pillar per tile at its hit moment
   * (`standIn`), no longer one for the column at once. Tiles off the drawn field are skipped (their timing kept).
   * Handled even when the official layer is off (the stand-ins' timing). true = drawn here (ownFx).
   */
  function ecolumnFx(e, views) {
    const o = e[4];
    const speed = Number(o?.speed);
    if (!o || typeof o !== 'object' || o.r0 == null || !(speed > 0)) return false;
    const c0 = Number(o.c ?? e[2]), r0 = Number(o.r0);
    if (!Number.isFinite(c0) || !Number.isFinite(r0)) return false;
    const dir = Array.isArray(o.dir) && o.dir.length >= 2 ? [Number(o.dir[0]) || 0, Number(o.dir[1]) || 0] : [0, -1];
    const dist = Number(o.dist) > 0 ? Number(o.dist) : 1, life = Number(o.life) > 0 ? Number(o.life) : 1;
    const on = !!(index && emodes && !failed && q() !== 'low');
    const v = views?.get?.(o.id) || null;
    const main = on ? eprojOf(v, o.key) : null, sub = on ? eprojOf(v, o.sub) : null;
    const subFx = sub ? [...new Set([...(sub.trail || []), ...(sub.reached || []), ...(sub.start || [])])].map(efx).filter(Boolean) : [];
    const mainR = main ? efx(Array.isArray(main.trail) ? main.trail[0] : null) : null;
    let rect = null;
    try { rect = fieldRect(); } catch { /* every tile */ }
    const shown = (r, c) => !rect || ![rect.r0, rect.r1, rect.c0, rect.c1].every(Number.isFinite)
      || (r >= rect.r0 - 0.5 && r <= rect.r1 + 0.5 && c >= rect.c0 - 0.5 && c <= rect.c1 + 0.5);
    const cells = [];
    for (let k = 0; k < 64; k++) {
      const r = r0 + dir[1] * k * dist, c = c0 + dir[0] * k * dist;
      if (r < -0.5 || c < -0.5 || r > 18.5 || c > 20.5) break;   // off the stage: the main projectile stops
      cells.push({ r, c, t: (k * dist) / speed });
    }
    const official = !!(subFx.length || mainR);
    if (official && level() < 3) {
      for (const cell of cells) {
        if (!shown(cell.r, cell.c) || !subFx.length) continue;
        const at = { x: cell.c, y: cell.r, z: 0 };
        castsDelayed.push({ t: clockS + cell.t, run: () => { for (const f of subFx.slice(0, MAX_HIT_FX)) spawn(f[0], f[1], at, { owner: null, buff: false }); } });
      }
      if (mainR && cells.length > 1 && camRef && trails.length < MAX_TRAILS) {
        const last = cells[cells.length - 1];
        const rec = { inst: null, tgt: null, x0: c0, y0: r0, z0: 0, tx: last.c, ty: last.r, tz: 0, k: 0, dur: Math.max(0.04, last.t), arc: 0 };
        ensure().then((ok) => { if (ok && lib) launchTrail(rec, mainR[0], mainR[1]); }, () => {});
      }
    } else if (!official) {
      for (const cell of cells) {
        if (!shown(cell.r, cell.c)) continue;
        castsDelayed.push({ t: clockS + cell.t + life, run: () => { try { standIn('column', cell.c, cell.r, { r: 0.5 }); } catch { /* never breaks the view */ } } });
      }
    }
    ownFx.add(e);
    return true;
  }

  // the sim's procedural stand-in beams that come right before a content shot ('beam' { from, to, kind }, then 'enemyShot'
  // { from, tgt, key }: fly.js FireWeapon, bosses.js 碎铳之簧 / 管 / 弦, leaders.js ChainBuff) → the projectile each stands in
  // for: not drawn when that projectile is drawn officially (eshotFx)
  const SHOT_BEAMS = {
    fireWeapon: 'projectile_enemy_acfort_skill', springBullet: 'projectile_enemy_actrpb', springCombo: 'projectile_enemy_actrpc',
    acdumlStrike: 'projectile_enemy_acduml', acdummStrike: 'projectile_enemy_acdumm', chainBuff: 'projectile_enemy_smsha_s',
  };
  /** Damage by `by` on `tid` around the landing of its official shot: the projectile's own hit effects are the shot's. */
  const eshotHitDone = (by, tid) => Math.abs(clockS - (eshotLand.get(`${by}:${tid}`) ?? -99)) < 0.6;
  /** An attack's / skill's effects on a unit its damage hit: its hit list + its projectile's hit / reach, ≤ MAX_HIT_FX. */
  function ehitFx(src, part, tgt, noProj = false) {
    const pr = noProj ? {} : part.proj || {};
    const names = [...new Set([...(part.hit || []), ...(pr.hit || []), ...(pr.reached || [])])].filter((n) => efx(n)).slice(0, MAX_HIT_FX);
    const aim = new Set(part.aim || []);
    const plain = edirs(src, part, names.filter((n) => !aim.has(n)));
    if (plain.length) eplay(src, plain, { at: tgt });
    const aimed = names.filter((n) => aim.has(n));
    if (aimed.length) eplay(src, aimed, { at: tgt, aim: src });
    if (Array.isArray(part.hitBuff) && part.hitBuff.length) eholdBuff(src, part, tgt);
  }
  // 2026-10-11, decompile check round 2 — a buff an enemy's attack puts on its target shows its own effect on that target
  // while the buff lasts, one per name per unit: client `Entity.AddBuffEffect` (RVA 0x35F3CA0) keeps it with a ref count
  // (`BuffEffectHolder.refCounter`) and `RemoveBuffEffect` (0x36001C0) finishes it as the last buff of that name ends.
  // enemy-modes.json `hitBuffLife` { name: life } (enemy_bindings.py): a LIMITED buff — held `life` s, a hit while it stands
  // renews it [추정: maxStackCnt 1, the life restarts]; IMMEDIATELY (0) — the prefab's own run; a buff whose end the tables
  // do not give (INFINITY / CUSTOM: a stun's, a status's — its end is the sim's) — the prefab's own run as before, but one at
  // a time per name on the unit (no second copy while one plays) [추정].
  const ebuffs = new Map();   // `${target id}:${prefab}` → { l: live entry | null while it loads, until }
  function eholdBuff(src, part, tgt) {
    const tid = ownerOf(tgt);
    for (const n of part.hitBuff.slice(0, 2)) {
      const r = efx(n);
      if (!r) continue;
      const life = part.hitBuffLife?.[n];
      if (life === 0) { eplay(src, [n], { at: tgt }); continue; }
      const until = life > 0 ? clockS + life : undefined;
      const key = `${tid}:${n}`;
      const rec = ebuffs.get(key);
      if (rec && (!rec.l || (!rec.l.stopped && !rec.l.inst.stopping && live.includes(rec.l)))) {
        if (until !== undefined) { rec.until = until; if (rec.l) rec.l.until = until; }
        continue;
      }
      const nr = { l: null, until };
      ebuffs.set(key, nr);
      spawn(r[0], r[1], tgt, { owner: null, buff: false, on: tid, until, tag: 'debuff' }, { over: true, facing: efacing(src) }).then((l) => {
        if (!l) { if (ebuffs.get(key) === nr) ebuffs.delete(key); return; }
        nr.l = l;
        if (nr.until !== undefined) l.until = nr.until;
        if (gone.has(tid)) l.inst.stop(true);
      });
    }
  }
  // 2026-10-10: a buff's line effect (its template's `Nodes.CreateLineEffect` on ON_BUFF_START — client `Execute`, RVA
  // 0xB91190: the effect is made on the buff's owner and its LineEffectEmitterDynamic gets start owner = the buff's source,
  // end owner = the owner; fx_extract.py `lineDyn` has the prefab's mount points and start / end effects). 假想敌：胄's attacks
  // (Combat and Attack) put acstmk_line_effect (lifeTime 5) on their target: enemy_acstmk_attack_line runs from its
  // SPECIAL_0 point to the target's HIT point with its `_startEffect` on the start, and ends with the buff
  // (`_finishIfBuffNotExists` + `_buffKeyForFinish`): `life` after the last hit, at the target's death, or when its source is
  // gone; the effect then fades (`_delayToFinish` 0.5: stop()).
  // [추정: the buff goes on with the attack's hit — its 'dmg' — and a hit while it stands refreshes it (maxStackCnt 1)]
  const elines = new Map();   // `${source id}:${target id}:${prefab}` → { src, tgt, until, l, sp, dyn }
  const lineA = { x: 0, y: 0, z: 0 }, lineB = { x: 0, y: 0, z: 0 };
  /** A unit's point of Entity.MountPointType `type` (GROUND: its feet; a point its model lacks: half its height). */
  function elinePoint(v, type, out, off) {
    const key = type === 7 ? null : pointKey(mountSpawn({ type }));
    const p = key ? specialPoint(v, out, key) : null;
    if (!p) { out.x = mx(v); out.y = v.y; out.z = type === 7 ? (v.z || 0) : bodyZ(camRef, v, SPAWN_FRAC[2]); }
    if (Array.isArray(off)) { out.x += Number(off[0]) || 0; out.z += Number(off[1]) || 0; }   // Unity +y = up [추정]
    return out;
  }
  /** The CreateLineEffect lines of the buffs an enemy's attack / skill `part` puts on `tgt` (enemy-modes.json `line`). */
  function elineFx(src, part, tgt) {
    if (!Array.isArray(part?.line) || !camRef || level() >= 3) return;
    for (const ln of part.line) {
      const r = efx(ln?.fx);
      if (!r) continue;
      // the buff's life: `life` s (LIMITED), 0 = it ends as it starts (IMMEDIATELY: the line flashes and fades), none = the
      // prefab's own duration [추정: an endless buff's line]
      const life = Number(ln.life) >= 0 && ln.life != null ? Number(ln.life) : -1;
      startLine(r[0], r[1], src, tgt, life, { sMount: 5, eMount: 1 });
    }
  }
  /**
   * Line prefab `bundle`/`name` from unit `src` to `tgt` for `life` s (0: it flashes and fades, < 0: the prefab's duration);
   * `dyn0` = its mount points when the prefab has no `lineDyn`. A line already standing between them is refreshed.
   */
  function startLine(bundle, name, src, tgt, life, dyn0) {
    const key = `${ownerOf(src)}:${ownerOf(tgt)}:${name}`;
    const rec = elines.get(key);
    if (rec && rec.fade == null) { rec.until = Math.max(rec.until, clockS + Math.max(0, life)); return; }   // the buff refreshed
    const nrec = { src, tgt, until: clockS + Math.max(0, life), l: null, sp: null, dyn: null, ended: false };
    elines.set(key, nrec);
    spawn(bundle, name, tgt, { owner: null, buff: true, until: null, on: ownerOf(tgt) }).then((l) => {
      if (!l) { elines.delete(key); return; }
      if (nrec.ended) { l.inst.stop(); return; }
      nrec.l = l;
      nrec.dyn = l.inst.def?.lineDyn || dyn0;
      if (life < 0) nrec.until = clockS + (l.inst.def?.duration || 1);
      stepLine(nrec);
      const st = typeof nrec.dyn.start === 'string' ? nrec.dyn.start : null;
      const sr = st && (efx(st) || (index?.bundles?.[bundle]?.includes(st) ? [bundle, st] : null));
      if (sr) {
        nrec.sp = { x: lineA.x, y: lineA.y, z: lineA.z };
        spawn(sr[0], sr[1], nrec.sp, { owner: null, buff: false }).then((s2) => { if (s2) nrec.spLive = s2; });
      }
    });
  }
  function stepLine(rec) {
    if (!rec.l?.inst) return;
    const a = elinePoint(rec.src, rec.dyn.sMount, lineA, rec.dyn.sOff), b = elinePoint(rec.tgt, rec.dyn.eMount, lineB, rec.dyn.eOff);
    rec.l.inst.setLine?.(a, b);
    if (rec.sp) { rec.sp.x = a.x; rec.sp.y = a.y; rec.sp.z = a.z; }
  }
  /**
   * Each frame: the lines follow their two units. One whose buff ended keeps drawing `_delayToFinish` (0.5 s) and then stops
   * (Effect.FinishMe); one of whose units is gone ends at once (its buff goes with it).
   */
  function stepLines() {
    for (const [k, rec] of elines) {
      const gone2 = (v) => !v || v.alive === false || v.remove || gone.has(ownerOf(v));
      if (gone2(rec.tgt) || gone2(rec.src)) {
        rec.ended = true;
        rec.l?.inst.stop(true);
        elines.delete(k);
        continue;
      }
      if (clockS > rec.until) {
        if (!rec.l) { if (clockS > rec.until + 2) { rec.ended = true; elines.delete(k); } continue; }   // still loading
        if (rec.fade == null) { rec.fade = clockS + 0.5; rec.l.until = rec.fade; }
        if (clockS > rec.fade) { elines.delete(k); continue; }
      }
      stepLine(rec);
    }
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
  function eskillFx(v, key, { on = true, loop = false, target = null, hold = false } = {}) {
    const part = eskillPart(v, key);
    if (!part || !eOn(v)) return false;
    const pr0 = part.proj || {};
    if (![...(part.cast || []), ...(part.hit || []), ...(part.buff || []), ...(part.attach || []), ...(pr0.trail || []), ...(pr0.hit || []),
      ...(pr0.reached || []), ...(pr0.targetStart || [])].some(efx)) return false; // nothing of it extracted: the procedural stand-ins stay
    const id = ownerOf(v);
    if (!on) {
      for (const l of live) if (l.tag === 'eskill' && l.owner === id) l.inst.stop();
      if (v._fxESkill) { v._fxESkill.hold = false; v._fxESkill.t = -99; }   // a held skill's end: its later damage is no hit of it
      return true;
    }
    const k = `${id}:${key.toLowerCase()}`;
    // 2026-10-15: a talent buff's effect held until this ability starts (enemy-modes.json `auraEnd`: 子代's tentac_grow → Grow)
    for (const l of live) if (l.owner === id && l.tag === `aura:${key.toLowerCase()}`) l.inst.stop();
    v._fxESkill = { part, t: clockS, hold, held: hold ? new Set() : null };
    if (clockS - (eskillSeen.get(k) ?? -9) < 1) return true;
    eskillSeen.set(k, clockS);
    if (hold) {
      // 2026-10-15: a held skill (the sim's fx 'enemySkill' `hold` until its 'enemySkillEnd' — 子代's 摄食): its loop cast
      // effects (opt `o` 0, to ON_CAST_END) last until that end, cut at ESKILL_HOLD_CAP s [추정: a lost end]
      const names = edirs(v, part, part.cast), loops = names.filter((n) => part.opt?.[n]?.o === 0);
      eplay(v, names.filter((n) => !loops.includes(n)), { tag: 'cast' });
      if (loops.length) eplay(v, loops, { buff: true, tag: 'eskill', until: clockS + ESKILL_HOLD_CAP });
    } else eplay(v, edirs(v, part, part.cast), { tag: 'cast' });
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
          launchTrail({ inst: null, tgt: target, x0: from.x, y0: from.y, z0: from.z, tx: mx(target), ty: target.y, tz: shotTo(target), k: 0,
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
    const tgt = s && (s.hold || clockS - s.t <= 3) && eOn(v) ? views.get(tid) : null;
    if (!tgt || level() >= 3) return false;
    const key = `${by}:${tid}`;
    if (clockS - (lastHit.get(key) ?? -9) < HIT_GAP_S) return true;
    lastHit.set(key, clockS);
    // 2026-10-15: a held skill's `_onlyOnce` hit effects (enemy-modes.json `hopt`): on its first hit of each unit, held there
    // until the skill ends (子代's trap_dstnta_attack_01_hit on the operator it holds, to ON_CAST_END)
    const once = s.hold && s.part.hopt ? (s.part.hit || []).filter((n) => s.part.hopt[n]?.once) : [];
    for (const n of once) {
      if (s.held.has(`${tid}:${n}`)) continue;
      s.held.add(`${tid}:${n}`);
      eplay(v, [n], { at: tgt, owner: ownerOf(v), on: tid, buff: true, tag: 'eskill', until: clockS + ESKILL_HOLD_CAP });
    }
    ehitFx(v, once.length ? { ...s.part, hit: s.part.hit.filter((n) => !once.includes(n)) } : s.part, tgt, eshotHitDone(by, tid));
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
  // ---- deploy / dead effects of operators and tokens (2026-10-11, decompile check round 2) ------------------------
  // Client `Character.get_startEffect` (RVA 0x7085E0): a character's deploy plays its prefab root's `_startEffect` (a mode's
  // `_overrideStartEffect` first — `GetStartEffect`, 0x6F74B0), else common_char_birth_01 — a token common_call_start_01
  // (`DefaultEffects.CHARACTER_BORN` / `TOKEN_BORN`); `_onlyPlayStartEffectOnce` keeps it to the first deploy. Its death
  // plays `_deadEffect`, else common_char_die_01. Here on each 'deploy' (a 【移动】 too — the client redeploys) of an
  // operator / token whose prefab is extracted (its own bundle, else the shared `common` one), and on its 'die' when knocked
  // out ('killed'; a retreat / expiry plays none [추정]). 望's stones keep their own (stoneFx).
  const deployed = new Map();   // unit id → battle clock of its 'deploy' (its view may be built right after the event)
  const startedOnce = new Set();
  const opDead = new Set();     // units whose dead effect played (ownsDeath)
  const isAlly = (v) => !!(v?.info && v.info.side !== 'enemy' && (v.info.kind === 'op' || v.info.kind === 'token') && !isStone(v));
  /** [bundle, prefab] of a deploy / dead effect of `v`: its own bundle's, else the shared common one; null when not extracted. */
  function allyFx(v, name) {
    const b = bundleOf(v);
    if (b?.prefabs.includes(name)) return [b.bundle, name];
    return index?.bundles?.common?.includes(name) ? ['common', name] : null;
  }
  function flushDeploys(views) {
    if (!deployed.size || !views) return;
    for (const [id, t] of deployed) {
      const v = views.get(id);
      if (!v) { if (clockS - t > 2) deployed.delete(id); continue; }
      deployed.delete(id);
      if (!isAlly(v) || v.alive === false || failed || q() === 'low') continue;
      const bind = bindOf(v);
      alwaysOn(v, id);
      const fx = deployEffect(bind, v.info.kind === 'token', v._fxSkillOn ? modeNow(v) ?? 0 : 0);
      // `_onlyPlayStartEffectOnce`: the root's effect on the first deploy only [추정: a mode's override still plays]
      if (bind?.startOnce && !fx.override) { if (startedOnce.has(id)) continue; startedOnce.add(id); }
      const r = allyFx(v, fx.name);
      if (r) spawn(r[0], r[1], v, { owner: id, buff: false, onCaster: true, tag: 'born' }, { over: false, facing: efacing(v) });
    }
  }
  /**
   * 2026-10-16, decompile check: the always-on effects (fxmap.js commonEffects) — client `Unit.AttachCommonAbilities` (RVA
   * 0x84DF50) attaches the root's common abilities with the unit, so their INFINITY buffs' effects stay through every mode and
   * skill. Started on each deploy (a 【移动】 re-attaches them: the old ones end first), ended by its 'die' (stopOwned).
   * Not `buff` entries: stopBuffs ends those with every skill.
   */
  function alwaysOn(v, id) {
    const b = bundleOf(v);
    const names = b ? commonEffects(bindOf(v), b.prefabs, KIT_OWNED) : [];
    if (!names.length) return;
    for (const l of live) if (l.tag === 'common' && l.owner === id) l.inst.stop(true);
    for (const n of names) spawn(b.bundle, n, v, { owner: id, buff: false, onCaster: true, until: null, tag: 'common', pinned: true }, { over: false, facing: efacing(v) });
  }
  function allyDeathFx(v, reason) {
    if (reason !== 'killed' || !isAlly(v) || failed || q() === 'low') return;
    const r = allyFx(v, deadEffect(bindOf(v)));
    if (!r) return;
    opDead.add(ownerOf(v));
    spawn(r[0], r[1], { x: v.x, y: v.y, z: v.z || 0 }, { owner: null, buff: false, tag: 'dead' }, { over: false, facing: efacing(v) });
  }

  const eborn = new Map();   // enemy id → battle clock of its 'spawn' (its view is built right after the event)
  /**
   * The enemies spawned since the last frame: their start effect and auras. The start effect is the prefab root's
   * `_startEffect` only — client code `Enemy.States.BornState._PlayAnimation` (RVA 0x73C6F0) plays `Enemy.get_startEffect`
   * (0x733ED0), which returns the root field and never a UnitMode's `_overrideStartEffect` (only `Character.GetStartEffect`,
   * 0x6F74B0 — operators and tokens — reads that).
   */
  function flushEnemyBirths(views) {
    if (!eborn.size || !views) return;
    for (const [id, t] of eborn) {
      const v = views.get(id);
      if (!v) { if (clockS - t > 2) eborn.delete(id); continue; }
      eborn.delete(id);
      if (!eOn(v) || v.alive === false) continue;
      const b = ebindOf(v);
      v._fxEMode = emodeOf(v);
      if (b.start) eplay(v, [b.start], { tag: 'born' });
      if (Array.isArray(b.aura) && b.aura.length) {
        // 2026-10-15: an aura that ends into an ability (`auraEnd`) is tagged by it — eskillFx stops it as that ability starts
        const end = b.auraEnd || {};
        eplay(v, b.aura.filter((n) => !end[n]), { buff: true, tag: 'aura' });
        for (const n of b.aura) if (end[n]) eplay(v, [n], { buff: true, tag: `aura:${end[n]}` });
      }
    }
  }
  /**
   * Each frame: an enemy whose mode changed (its clip set's attack) ends the old mode's loop casts (ON_DETACHED) and tells
   * the sound (contract 1 of the 2026-10-10 split: audio.enemyMode(unitId, defId, mode, previous mode)); a bound skill's clip
   * starting plays it. A mode switch plays no effect of its own: client code `Unit.SwitchMode` (RVA 0x76E1D0) runs
   * `InactiveMode` → `ActivateMode` (0x766E20: the new mode's GameObject on, its abilities attached) → `OnSwitchMode`
   * (`Enemy.OnSwitchMode` 0x727200: its skills detached / attached, `Unit.OnSwitchMode` 0x76C810: the state machine restarted,
   * `BuffContainer.OnUnitSwitchMode`) — none creates an effect, and the mode's `_overrideStartEffect` is not read for an enemy.
   * The mode is tracked whenever the bindings are loaded (the sound needs it at quality 'low' too).
   */
  function stepEnemies(views) {
    if (!emodes || !views) return;
    for (const v of views.values()) {
      if (v?.info?.side !== 'enemy' || v.alive === false || !ebindOf(v)) continue;
      if (v._fxEMode === undefined) { v._fxEMode = emodeOf(v); v._fxEClip = v.actor?.current; continue; } // on the field before this layer
      const mi = emodeOf(v);
      if (mi !== v._fxEMode) {
        const prev = v._fxEMode;
        v._fxEMode = mi;
        endCast(v); v._fxFirstDone = null;
        try { audio()?.enemyMode?.(ownerOf(v), v.info.defId, mi, prev); } catch { /* the sound never breaks the view */ }
      }
      if (!eOn(v)) continue;
      const clip = v.actor?.current;
      if (clip !== v._fxEClip) {
        v._fxEClip = clip;
        const k = typeof clip === 'string' ? animSkill(ebindOf(v)).get(clip.toLowerCase()) : null;
        if (k) eskillFx(v, k);
      }
    }
  }
  /**
   * An enemy's death: its dead effect where it falls — its mode's `_overrideDeadEffect`, else the root's `_deadEffect`, else
   * common_enemy_die_01 (client code `Enemy.get_deadEffect`, RVA 0x730300). enemy-modes.json `dead` carries the default
   * already (enemy_bindings.py); '' = none (a `Trap` token without its own: 子代), the fallback only for an entry without it.
   */
  const edeadOf = (v) => {
    const b = ebindOf(v);
    return b ? b.modes?.[v._fxEMode ?? emodeOf(v) ?? 0]?.dead || (b.dead ?? 'common_enemy_die_01') || null : null;
  };
  function edeathFx(v) {
    if (!eOn(v)) return;
    const dead = edeadOf(v);
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
    /** Whether status effects can play at all (index loaded, not 'low', no WebP failure): off, units draw their status icons (fxstatus.js). */
    statusLayer() { return !!(index && !failed && q() !== 'low'); },
    /** local patch (⑤): loop `bundle`/`name` on `view` as its status `key` (once per key) at `frac` of its height. */
    statusOn(view, bundle, name, key, frac = 0, hold = null, under = false) {
      const on = view._fxStatusOn || (view._fxStatusOn = new Set());
      if (on.has(key)) return;
      on.add(key);
      playStatus(view, bundle, name, key, frac, hold, under);
    },
    /**
     * local patch (⑤): end the status effect `key` on `view`; `now` (render/fxstatus.js): as the client finishes a buff's
     * effect (Entity.OnBuffFinish → RemoveBuffEffect RVA 0x36001C0 → Effect.FinishMe RVA 0xC88FE0) — emission stops and the
     * effect is removed its prefab's `_delayToFinish` later (ParticleEffect.get_delayToRecycle RVA 0xCB3470; def.finish),
     * at once when that is 0 (buff_stun) — instead of its particles living out their lifetimes.
     * local patch (maintainer report 2026-10-08: the stun marks stacked over a re-stunned enemy): an ended effect never
     * restarts (`again` was still set — the stopped one, done, saw the status on again and started a copy beside the new
     * one, one more per re-stun); buff_stun's mark is one 10 s particle, which hung over the head beside the next stun's.
     */
    statusOff(view, key, now = false) {
      if (!view._fxStatusOn?.delete(key)) return;
      const id = ownerOf(view);
      for (const l of live) {
        if (l.status !== key || l.owner !== id) continue;
        l.again = null;
        // 2026-10-11 (docs/rules/ui.md ⑤): `now` = the client's Effect.FinishMe — emission stops, the effect goes its prefab's
        // `_delayToFinish` later (def.finish, fx_extract.py); none / 0: at once
        const fin = now ? Number(l.inst.def?.finish) : 0;
        if (fin > 0) { l.inst.stop(false); l.finishAt = clockS + fin; } else l.inst.stop(now);
      }
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
      trimLive();
      return { stop: (now = false) => inst.stop(now), alive: () => live.some((l) => l.inst === inst) };
    },
    /**
     * 2026-10-10: whether an enemy's death is drawn here with its official dead effect (edeathFx) — render/app.js then skips
     * render/fx.js's procedural death puff (the client plays only the dead effect: `DeadState._PlayAnimation`).
     */
    // 2026-10-11: operators / tokens too (allyDeathFx); 2026-10-15: an enemy-side token bound with no dead effect (子代) owns
    // its death too — the client shows nothing, so no procedural puff either
    ownsDeath(v) {
      if (v?.info?.side !== 'enemy') return !!(v && opDead.has(ownerOf(v)));
      if (!eOn(v)) return false;
      const d = edeadOf(v);
      return d ? !!efx(d) : true;
    },
    /** Whether a 'fx' event is drawn here with its official effect (render/fx.js then skips its 2D stand-in). */
    ownsFx(e) { return ownFx.has(e); },
    /**
     * 2026-10-10: a unit's attack swing starts, `windup` game seconds before its strike ('atk') — the cast
     * effects of ON_CAST_START. onEvent already does this for the sim's 'swing' state event; for a caller with its own.
     */
    onSwing(view, windup, kind) { if (view && index && q() !== 'low') swingFx(view, Number(windup) || 0, lastViews || new Map(), kind); },
    /** A battle event render/app.js handled (the views map resolves unit ids). */
    onEvent(e, views) {
      lastViews = views;
      if (Array.isArray(e)) {
        if (e[0] === 'die') gone.add(e[1]);
        else if (e[0] === 'deploy') { gone.delete(e[1]); opDead.delete(e[1]); if (e[2] !== 1) deployed.set(e[1], clockS);   // (e[2] 1: a flight's landing, no deploy effect)
          const v = views?.get?.(e[1]); if (v) { v._fxFirstDone = null; v._fxCast = null; } } // 2026-10-10: its first attack again; 2026-10-11: its deploy effect (flushDeploys)
        else if (e[0] === 'spawn') { gone.delete(e[1]?.id ?? e[1]); if (e[1]?.side === 'enemy' && e[1].id != null) eborn.set(e[1].id, clockS); } // 2026-10-10: its start effect (flushEnemyBirths)
        else if (e[0] === 'fx' && e[1] === 'summon' && e[4]) gone.delete(e[4].id);
        // local patch: a stone spawned (its 'summon' fx of the same moment, if any, takes it off — stoneFx)
        if (e[0] === 'spawn' && e[1] && (e[1].defId === STONE || e[1].spine === STONE)) stoneBirth.add(e[1].id);
      }
      // 2026-10-10: 萨米的意志's 冰凌 tile by tile (official or the staggered stand-in — at quality 'low' too)
      if (Array.isArray(e) && e[0] === 'fx' && e[1] === 'column' && e[4]?.r0 != null) { ecolumnFx(e, views); return; }
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
          v._fxShot = e[2] ? { t: null } : null; // 2026-10-16: its shot, not taken yet (takeShot)
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
          const shot = mode === -1 && takeShot(src); // 2026-10-16: a mode-less skill's own shot
          if (tgt) lastAtk.set(tgt.id ?? tgt.info?.id, { src, t: clockS, mode, kind: e[3], shot });
          if (!noteAtks.has(e)) trailShot(e, src, tgt, mode, shot); // local patch: its projectile's official trail
          if (src._fxSkillOn) foeFx(src, tgt, mode); // 2026-10-10: a mode buff held by the enemy
          // local patch: the mode's own cast effects (a skill's on each of its attacks) — since 2026-10-10 on the attack's own
          // clock: those of ON_CAST_START already started at its 'swing', the strike's (ON_SPELL_ON) now (strikeFx); the
          // throttle (ATTACK_GAP_S) and load level 3 skip them as before (beginCast)
          strikeFx(src, mode, e[3], tgt);
          return;
        }
        // (2026-10-10, decompile check): the sim's swing start ['swing', unit, windup, kind] — an attack's
        // ON_CAST_START cast effects (swingFx). Every state event reaches onEvent, so render/app.js needs no call of its own.
        case 'swing': {
          const src = views.get(e[1]);
          if (src?.info?.side === 'enemy') { if (eOn(src)) eswingFx(src, Number(e[2]) || 0, e[3]); return; }
          if (src) swingFx(src, Number(e[2]) || 0, views, e[3]);
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
            elineFx(a.src, a.epart, tgt); // 2026-10-10: the line of the buff it puts on the target (CreateLineEffect)
            return;
          }
          if (!a.src._fxSkillOn && level() >= 3) return;
          if (fxBundleOf(a.src.info?.spine || a.src.info?.defId) === 'oblvns' && notesOn(a.src, true)) return;   // her notes hit on their own
          const key = `${a.src.id ?? a.src.info?.id}:${tid}`;
          if (clockS - (lastHit.get(key) ?? -9) < HIT_GAP_S) return;
          lastHit.set(key, clockS);
          lastAtk.delete(tid); // local patch: one impact per attack (a mark's / DoT's later ticks are no attack's hit; audio.js does the same)
          // the mode's hit effects (a 要塞's of the attack it made: boundFor); a skill's shot: its projectile's (takeShot)
          const { names: hitList, split } = a.shot ? { names: extracted(a.src, skillBind(a.src)?.shotHit), split: false } : boundFor(a.src, a.mode, 'hit', a.kind);
          const c = a.src._fxCast?.mode === a.mode ? a.src._fxCast : null; // 2026-10-11: its cast (clip group, loop end, speed)
          const hits = withGroup(hitList, c?.group?.hit).slice(0, MAX_HIT_FX);
          if (hits.length) { hitFx(a.src, tgt, hits, c); return; }
          if (split || bound(a.src, a.mode, 'input').length) return; // its hits are its input-target effects (inputFx), not a name-mapped one
          play(a.src, a.src._fxSkillOn ? 'skillHit' : 'attackHit', skillIdx(a.src), { at: tgt });
          return;
        }
        case 'fx': { // a kit's moving effect: 赤刃明霄陈 S3 剑气 (kits/ops/op-chen3.js) carries her official trail along its path
          if (e[1] === 'palsy' && e[4]?.id != null) { const v = views.get(e[4].id); if (v) cutCast(v); } // 2026-10-11: 麻痹 cut its cast
          if (stoneFx(e, views)) return;
          if (e[1] === 'caperBoomerang2' && e[4]) { caperSecond(e, views); return; } // 2026-10-10: 跃跃 S2's second boomerang
          // 2026-10-10: an enemy content skill's official projectile (eshotFx), and no stand-in beam for a shot drawn so
          if (e[1] === 'enemyShot' && e[4]) { eshotFx(e[4], views); return; }
          if (e[1] === 'beam' && e[4] && SHOT_BEAMS[e[4].kind] && level() < 3) {
            const o = e[4], from = views.get(o.from ?? o.id);
            const pr = from && views.get(o.to) ? eshotDrawable(views.get(o.caster) || from, SHOT_BEAMS[o.kind]) : null;
            if (pr && !pr.link && efx(Array.isArray(pr.trail) ? pr.trail[0] : null)) { ownFx.add(e); return; } // its trail flies instead
          }
          // 2026-10-10: an enemy's skill / special action naming its ability (fx 'enemySkill' and the fx of its cast) — that ability's official
          // effects, and no procedural stand-in for it (standInOff's kinds) when the enemy binds it
          if (e[4] && typeof e[4] === 'object') {
            const o = e[4], k = fxAbility(o);
            const v = k ? views.get(o.caster ?? o.id ?? o.src ?? o.by) : null;
            if (v?.info?.side === 'enemy') {
              // 2026-10-15: a held skill's end ('enemySkillEnd' { id, ability } after an 'enemySkill' with `hold`)
              if (e[1] === 'enemySkillEnd') { eskillFx(v, k, { on: false }); return; }
              const tgt = o.target ?? o.tgt ?? o.to;
              if (eskillFx(v, k, { target: tgt != null ? views.get(tgt) || null : null, hold: e[1] === 'enemySkill' && !!o.hold }) && STAND_IN.has(fxSpec(e[1], o).a)) ownFx.add(e);
              return;
            }
          }
          // 2026-10-10: a skill projectile's reach effects; 2026-10-14: 歌蕾蒂娅 S3's tornado (kit fx 'tornado', its projectile's
          // reach effects glady_skill_03_range / _02 — the 2D zone stood in for them); 2026-10-16: 异客 S3's storm (kit fx
          // 'storm', projectile_chr_pasngr_s3's pasngr_skill_03_range) and its strikes (chainFx)
          if ((e[1] === 'zone' || e[1] === 'tornado' || e[1] === 'storm') && zoneFx(e, views)) return;
          if (e[1] === 'lightning' && chainFx(e, views)) return;
          if (e[1] === 'oblvnsNote' && e[4]) { noteFx(e, views); return; }
          if (e[1] === 'parry' && e[4]) { parryFx(e, views); return; }
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
          else if (v) allyDeathFx(v, e[2]); // 2026-10-11: an operator's / token's dead effect
          for (const k of ebuffs.keys()) if (k.startsWith(`${e[1]}:`)) ebuffs.delete(k);
          return;
        }
        case 'leak': stopOwned(e[1]); return; // 2026-10-10: an enemy that got through — its auras end
        case 'tplfx': tplFx(e, views); return; // 2026-10-11: a 卫戍协议 template effect
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
      if (index) flushDeploys(lastViews); // 2026-10-11: the operators' / tokens' deploy effects
      stepLines(); // 2026-10-10: buff line effects follow their units
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
        if (l.shotEnd != null && clockS >= l.shotEnd) { l.shotEnd = null; finishShot(l.inst, l); } // 2026-10-11: a flown main effect arrives
        if (l.finishAt != null && clockS >= l.finishAt) { l.finishAt = null; l.inst.stop(true); } // 2026-10-11: statusOff's delay
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
      castsDelayed.length = 0; zones.clear(); eborn.clear(); eskillSeen.clear(); elines.clear(); eshotLand.clear();
      deployed.clear(); startedOnce.clear(); opDead.clear(); ebuffs.clear(); // 2026-10-11
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
      trimLive();
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
