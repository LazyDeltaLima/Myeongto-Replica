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
// stats() → { live, loaded, updateMs, renderMs, calls, particles, notes } (view.stats().fxGame). `trace` (tests): called with
// { kind, names, by, at } for every effect play() starts, before it loads (node has no WebP, so nothing is drawn there), and
// { kind: 'spawn', names, by, on, tag, facing } for every extracted prefab spawn() starts, { kind: 'status', names, by } for every
// status effect statusOn() starts on `by` (render/fxstatus.js, 2026-10-21). `dry` (tests, 2026-10-20): nothing ever
// loads and the layer never fails — every event takes the path it takes in a browser up to the load, so `trace` sees them all
// (without it node's missing WebP fails the layer at the first load and the later events skip the official effects); it
// reads each started prefab's JSON alone to trace what that prefab creates once it plays (dryFollow, 2026-10-21).
// 丰川祥子's notes (kits/ops/op-oblvns.js, battle.fx 'oblvnsNote' born / track / free / hit / gone): each note is her client trail
// prefab (fxmap.js NOTE_FX) flown here between the sim's events — free flight on its heading (the 扩张正弦 weave drawn
// around it), tracing the target's view, the hit prefab on arrival (a piano note flies on 0.5 s); w = 2 draws two notes.
// While they play, her 'atk' arrow of render/fx.js is not drawn (the event's projectile kind is replaced); without the
// official effects (quality low, no WebP, no bundle, load level 3 for normal-attack notes) the arrow stays.

import { syncThreeCamera, OFFICIAL } from './projection.js';
import { fxBundleOf, effectsFor } from './fxmap.js';
import { noteEffects, NOTE_FLIGHT } from './fxmap.js';
import { attackMode, boundEffects, fortressEffects, modelessTrail } from './fxmap.js'; // local patch: the mode bindings (modes.json)
import { activationEffects } from './fxmap.js'; // local patch: a skill activation's effects
import { foeEffects, castTiming, castPhase, CAST_EVENT } from './fxmap.js'; // 2026-10-10: enemy-held mode buffs, cast timings
import { clipGroup, hitLoopEnd, deployEffect, deadEffect } from './fxmap.js'; // 2026-10-11: clip variants, looping hits, deploy / dead effects
import { castEnd, commonEffects, skillEdge, skillHeld } from './fxmap.js'; // 2026-10-16: the always-on effects of the common abilities (2026-10-24: a skill's own held buffs, its start / end effects)
import { altGroup, combatEffects } from './fxmap.js'; // 2026-10-21: ability group children, the COMBAT state's effects
import { modePart } from './fxmap.js'; // 2026-10-21: a mode talent's attack, a per-side child of the attack
import { defaultModeEffects } from './fxmap.js'; // 2026-10-21: the Default mode's own effects
import { projSpeed } from './fx.js'; // local patch: the trails' flight time (the sim's projectile speeds)
import { bodyZ } from './fx.js'; // local patch: status effects at a unit's head / body (fxstatus.js)
import { wallTiles } from './fx.js'; // local patch: 余 S3's wall tiles
import { fxSpec } from './fx.js'; // local patch: the stand-in archetype of a kit fx event (standInOff)
import { SHOT_HEIGHT } from './fx.js'; // local patch: a trail's start without a muzzle point
import { boneMissing, liftedPoint, loadPoints, mountSpawn, pointKey, pointOn, pointTurn } from './fxpoints.js'; // local patch: the model points of _spawnLocation 3 / 8…
import { GRAPHIC_TILT, takesGraphicTurn } from './fxpoints.js'; // 2026-10-22: an effect on a unit takes its Graphic's X −30°
import { STANDARD_PLACE, modelOffset } from './fxpoints.js'; // 2026-10-22: 望's 棋子 model stands at its prefab's place (the ball)
import { enemyProjSpeed, enemyShot } from './fx/speeds.js'; // 2026-10-10: an enemy shot's record / flight time (data/enemies.json `proj`)
import { shotSpeedOf, shotArcOf } from './fx/projectiles.js'; // 2026-10-16: an operator shot's flight time (data/chess.json `shot`)
import { opShot } from './fx/speeds.js'; // 2026-10-21: a skill's own shot record (skillShotOut)
import { boomerangThrown, boomerangCaught } from './heldWheel.js'; // local patch: a 回环射手's boomerang leaves / is back in her hand
import { PROJ } from './style.js';
import { aglGlideBack } from './fx/kinds.js'; // 予愿安洁莉娜 S2: when her model is back home
import { faceSwitchCopy, faceTurn, followDir, playSpeed } from './fx/face.js'; // 2026-10-11 (maintainer decision 15): `_usePlaybackSpeed` / `_limitedPlaybackSpeed`; 2026-10-22 FollowDirection, SwitchableEffectByFaceDirection
import { kitOfficialPlan, kitOperator } from './fx/kitofficial.js'; // 2026-10-16: kit events the buff templates draw
import { UF } from '../../../shared/constants.js'; // local patch: the views' skill flag (skillByFlag)
import { enemyRecordMode } from '../../../shared/skill-modes.js'; // 2026-10-23: an ally from an enemy record (炎佑)
import { animPause, clipOf, facesBack, idlePause, pauseIfNow } from './fx/pause.js'; // 2026-10-21: the client's pause / finish behaviours

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
    // (2026-10-10, official client: UberEffectEmitter.EffectOptions.TryGetEffect) 4 UD_OR_LR = slot 0
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

/**
 * (maintainer re-report 2026-10-08, docs/rules/fx.md 「관리자 제보 (2026-10-07 밤)」) the official effects of a 望 stone's blast (createFxLayer stoneFx) — `at`:
 * played at the stone (S1 sktok_wang_1 / S3 sktok_wang_3 `_castEffects`, S2 ExplodeRow·Col·Cross `_effectKey` once per
 * activated axis, a 跟子's `_effectOnTrigger`); `target`: on each enemy it damages (S2 ExplodeRow `_hitEffects` / a 跟子's
 * `_effectsWhenHit`; S3 a 跟子 only). token_wang_skill_03_hit_03 is referenced by nothing in the client: never played.
 */
export function stoneBlastFx(skill, follower = false) {
  if (skill === 2) return { at: ['token_wang_skill_02_hit'], target: 'token_wang_skill_02_hit_02' };
  if (skill === 3) return { at: ['token_wang_skill_03_hit'], target: follower ? 'token_wang_skill_03_hit_02' : null };
  return { at: ['token_wang_skill_01_hit'], target: null };
}

/**
 * 望's link line (fxgame stone effects): the unbroken run of stones through tile (x, y) along axis 'h' (x) or 'v' (y) —
 * client WangStoneTriggerManager._FilterContinuousCharacters — as its two end tiles' keys `x,y` (first =
 * the lower), or null for a stone alone on it. `tiles` has a key per stone tile (Set or Map).
 */
export function linkRun(tiles, x, y, axis) {
  const dx = axis === 'h' ? 1 : 0, dy = axis === 'h' ? 0 : 1;
  let lo = 0, hi = 0;
  while (tiles.has(`${x + (lo - 1) * dx},${y + (lo - 1) * dy}`)) lo--;
  while (tiles.has(`${x + (hi + 1) * dx},${y + (hi + 1) * dy}`)) hi++;
  return hi > lo ? [`${x + lo * dx},${y + lo * dy}`, `${x + hi * dx},${y + hi * dy}`] : null;
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
const PLAYS_URL = '/assets/local/fx/plays.json';   // 2026-10-23: the kit plans' client keys → prefabs (tools/build-fx-plays.mjs)
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
  // (2026-10-21) their `emitted` lists (fx_extract.py set_emitted) the same way
  const emitted = { ...(a.emitted || {}) };
  for (const [k, list] of Object.entries(b.emitted || {})) emitted[k] = emitted[k] ? [...new Set([...emitted[k], ...list])] : list;
  return { ...a, bundles, emitted };
}
let indexPromise = null;
const loadIndex = () => (indexPromise ||= Promise.all([getJson(INDEX_URL), getJson(ENEMY_INDEX_URL)]).then(([a, b]) => mergeIndex(a, b)));
let modesPromise = null;
const loadModes = () => (modesPromise ||= getJson(MODES_URL));
let playsPromise = null;
const loadPlays = () => (playsPromise ||= getJson(PLAYS_URL));
let enemyModesPromise = null;
const loadEnemyModes = () => (enemyModesPromise ||= getJson(ENEMY_MODES_URL));
/**
 * 2026-10-23 (docs/rules/fx.md 「적 상태의 버프 이펙트」): the client mode a sim form stands for, per enemy id — sim form
 * (UnitInfo `form`, the forms render/units.js FORMS draws) → its battle prefab's `_modes` name. Most of these modes attack
 * on the same clip, so the attack clip cannot tell them apart (fxgame.js emodeOf falls back to it for unlisted forms). A
 * rebirth switches at its end (Enemy.States.RebornState → DoReborn → Unit.SwitchMode to the RebornTalent's `_modeIndex`):
 * the second form ('form2'), not the 重生 ('reborn') itself.
 */
const PRISONER_MODES = Object.freeze({ warning: 'R', liberty: 'L' });
const EMBER_MODES = Object.freeze({ husk: 'Prop' });
const STATUE_MODES = Object.freeze({ stone: 'Stone', fly: 'Fly' });
const FORM_MODES = Object.freeze({
  enemy_1116_liprr: PRISONER_MODES, enemy_1116_liprr_2: PRISONER_MODES, enemy_1118_lidbox_2: PRISONER_MODES,
  enemy_1119_vofsd: PRISONER_MODES, enemy_1121_lifbos: PRISONER_MODES, enemy_1121_lifbos_2: PRISONER_MODES,
  enemy_1172_dugago: STATUE_MODES, enemy_1172_dugago_2: STATUE_MODES,
  enemy_1288_duskls: EMBER_MODES, enemy_1288_duskls_2: EMBER_MODES, enemy_1292_duskld: EMBER_MODES, enemy_9010_acpupp: EMBER_MODES,
  enemy_2025_syufo: Object.freeze({ crawl: 'Normal' }),
  enemy_1509_mousek: Object.freeze({ noShield: 'NoShield' }),   // its last barrier layer's end (archetypes.js artsBarrier brokeForm)
  enemy_1516_jakill: Object.freeze({ form2: 'R' }),
  enemy_1535_wlfmster: Object.freeze({ form2: 'M2' }),
  enemy_1512_mcmstr: Object.freeze({ form2: 'Bird' }),
  enemy_1517_xi: Object.freeze({ form2: 'Reborn' }),
  enemy_1525_blkswb: Object.freeze({ form2: 'Reborn' }),
  enemy_1539_reid: Object.freeze({ form2: 'Reborn' }),
  enemy_9007_acelem: Object.freeze({ parasitic: 'Parasitic' }),
  enemy_9011_acrefr: Object.freeze({ stopped: 'NoRef' }),
  enemy_9017_achunt: Object.freeze({ charge: 'S1' }),
  enemy_1040_bombd: Object.freeze({ bombed: 'S1' }),
  enemy_10081_mpplai: Object.freeze({ translator_fuchou: 'ModeB', translator_youling: 'MoveC', translator_shushi: 'ModeD' }),
});

/**
 * @param {{ host: HTMLElement, above: HTMLCanvasElement, quality: => string, load?: => number, under?: => boolean, fieldRect?: => any, enemyDef?: (id: string) => any, unitDef?: (info: any) => any }} o
 *   load: the view's adaptive load level 0–3 (render/app.js); under: whatever lies below the units canvas shows through
 *   it (the 3D board is on — the 2D board paints an opaque backdrop on the units canvas itself); fieldRect: the battle
 *   field's tile rect (local patch: 余 S3's wall runs across it, fx.js wallTiles); enemyDef: an enemy's data/enemies.json
 *   record (2026-10-10: its shot's speed, `proj`); unitDef: a unit's data record by its UnitInfo (render/app.js lookupDef;
 *   2026-10-16: an operator shot's speed, data/chess.json `shot`); audio: the sound object (2026-10-10: `enemyMode?.(unitId, defId, mode,
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

/**
 * Kit fx 'buffProgress' { id, key, r } on the live effects: those of unit `id` that read buff `key` (`animSrc`) take the
 * remaining share `r`; at 0 the buff is spent and they end now, as their timed end does (2026-10-23: 纯烬艾雅法拉 S2 —
 * agoat2_s_2[shield]'s ON_BUFF_TRIGGER, its `value` spent, interrupts the ability skchr_agoat2_2/Shield/Aura whose `_effects`
 * is the range effect; it had stayed its whole `duration`).
 */
export function buffProgressOn(list, o, now) {
  for (const l of list) {
    if (!((l.owner === o.id || l.view?.id === o.id) && l.inst.def?.animSrc?.some((s) => s.buff === o.key))) continue;
    l.inst.setBuffProgress(o.key, o.r);
    if (!(Number(o.r) > 0) && (l.until == null || l.until > now)) l.until = now;
  }
}

/** Forward vector [dRow, dCol] of a deploy direction (server/sim/dir.js DIR_VEC; RIGHT for anything else). */
const DIR_FWD = Object.freeze({ UP: [1, 0], RIGHT: [0, 1], DOWN: [-1, 0], LEFT: [0, -1] });

/**
 * The turn of the 土石结构's SpecialPoint0 (prefab trap_032_mound/Graphic/Mesh/SpecialPoint0, local rotation; Graphic and Mesh
 * do not turn, `_enableRotate` 0) — its sand marks are created at that point WITH its turn, not its 0.01 scale (maintainer
 * report 2026-10-18: drawn without it, map_desert_02_down blew right to left; the four directional copies differ only in their
 * static_offset turn, which lines up with the wind — down / up along the rows, left / right along the columns — only under
 * this one).
 */
export const MOUND_SP0_TURN = Object.freeze([-0.5, -0.5, 0.5, 0.5]);
/** Columns of the battle grid (GEO.WIDE_COLS): a stage's 21, the 8-player mode's wide 联防 field up to 37. */
const BATTLE_COLS = 37;
/** tan of half the client battle camera's vertical field of view (projection.js OFFICIAL.fovY 40°) — a camera effect's frame. */
const TAN_CLIENT_HALF_FOV = Math.tan((OFFICIAL.fovY * Math.PI) / 360);
/** 战场#06's 沙尘暴: its direction → the camera effect (EN template sand_storm[camera_effect]: DOWN → up_to_down …). */
export const STORM_SCREEN = Object.freeze({ DOWN: 'screen_desert_up_to_down', UP: 'screen_desert_down_to_up', LEFT: 'screen_desert_right_to_left', RIGHT: 'screen_desert_left_to_right' });
/**
 * The sand marks of a 沙尘暴 on the 土石结构 (EN template sand_storm[trap]): every mound `{ r, c, z }` in a span `{ c0, c1,
 * dir }` of `storm` (m.field `storm`, sim content/devices.js stormView) with no other mound against the wind up to the map
 * edge (its HasCertainCharacterInFrontOfMe: sim stormSheltered) wears storm_ally_mark's map_desert_02_<dir> (DOWN → _down).
 * Every mound is strengthened on 战场#06, which spares it the damage, not the mark. → [{ r, c, z, name }]
 * @param {{c0: number, c1: number, dir: string}[]|null|undefined} storm
 * @param {{r: number, c: number, z?: number}[]} mounds
 */
export function stormMarks(storm, mounds) {
  const out = [];
  if (!Array.isArray(storm) || !Array.isArray(mounds)) return out;
  const at = new Set(mounds.map((m) => `${m.r},${m.c}`));
  for (const m of mounds) {
    const s = storm.find((x) => x && m.c >= x.c0 && m.c <= x.c1 && DIR_FWD[x.dir]);
    if (!s) continue;
    const [dr, dc] = DIR_FWD[s.dir];
    let sheltered = false;
    for (let r = m.r - dr, c = m.c - dc; r >= 0 && r < 19 && c >= 0 && c < BATTLE_COLS; r -= dr, c -= dc) if (at.has(`${r},${c}`)) { sheltered = true; break; }
    if (!sheltered) out.push({ r: m.r, c: m.c, z: Number(m.z) || 0, name: `map_desert_02_${s.dir.toLowerCase()}` });
  }
  return out;
}
/** 余 S3's piece offset toward his front (yu_skill3_range_01_root `_offset`). */
export const YU_WALL_OFFSET = 0.4;
/**
 * 余 S3 灶里乾坤's fire wall as the client assembles it (2026-10-10, maintainer report: the flames stand on his tile's
 * front edge — facing right, on its right edge; official client): his skill's buff effect yu_skill3_range_01_source
 * (YuS3EffectBehaviour `_effectEachGrid`, OnPlay) creates yu_skill3_range_01_root at the centre of every
 * tile of his line across the map; each root (YuS3EffectWithEdgeBehaviour._InitPlayersIfNot) plays its pieces at
 * the tile centre + SharedConsts.FOUR_WAYS[his direction] × `_offset` 0.4 — on the tile's front edge: facing UP / DOWN
 * its row piece `_effectWhenHorizontal` yu_skill3_range_01 (HorizontalEffectPlayer.EffectNeedPlay: direction 0 /
 * 2); facing LEFT / RIGHT the column piece of its screen side, `_effectVerticalWhenAtWorldRight` _r or `…Left` _l
 * (VerticalEffectPlayer.IsWorldRight: its x right of the camera's); and at an end of the line (the next tile
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

export function createFxLayer({ host, above, quality, load = () => 0, under = () => false, rate = () => 1, fieldRect = () => null, grid = () => null, enemyDef = () => null, unitDef = () => null, audio = () => null, standIn = () => {}, trace = null, dry = false }) {
  let index = null, modes = null, emodes = null, plays = null;
  if (typeof fetch === 'function') {
    // (2026-10-23) the index with the plays: what waits for the index (the status layer, a deploy's always-on effects, the
    // notes) finds the client keys' prefabs already there
    Promise.all([loadIndex(), loadPlays()]).then(([i, p]) => { plays = p && typeof p === 'object' ? p : null; index = i; });
    loadModes().then((m) => { modes = m; });
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
  const healAtk = new Map();         // ally id → { src view, t, mode, kind, shot }: the heal shot on its way to it (healHit)
  const lastHit = new Map();         // `${src}:${tgt}` → t
  const lastAttackFx = new Map();    // src id → t
  const movers = new Map();          // caster id → { inst, at, t } — effects carried along a kit's moving fx
  const notes = new Map();           // 丰川祥子's notes: sim note id → { pos, dx, dy, mode, state, … } (noteFx)
  let clockS = 0;
  let stormGen = 0;                  // 2026-10-18: setStorm's battle (clear() ends it; a load finishing after drops its effect)
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
  // (2026-10-21) the bundle's prefabs another of its prefabs creates (index.json `emitted`, fx_extract.py set_emitted: OnPlayEmitter /
  // OnFinishEmitter — stepOnEmit): the name rules leave them to it (they started 歌蕾蒂娅 S2's buff_02_front, 苏尔特 S3's buff_02,
  // 望 S3's range … with the skill besides, and 华法琳 S2's buff_end for the whole skill); a client binding naming one still plays it
  const emittedSets = new Map();
  const emittedIn = (bundle) => {
    let s = emittedSets.get(bundle);
    if (!s || s.of !== index) { s = new Set(index?.emitted?.[bundle] || []); s.of = index; emittedSets.set(bundle, s); }
    return s;
  };
  // (2026-10-21) and the prefabs packed in from another bundle (index.json `sources` with a `pack`, fx_extract.py --pack):
  // only the client bindings that name them play them — the `_attack` name rule took common.ab's common_ignite_attack (a
  // skill's activation buff) for the normal attack's cast of an operator with none bound (艾丝黛尔, 地灵: on every attack)
  const packedSets = new Map();
  const packedIn = (bundle) => {
    let s = packedSets.get(bundle);
    if (!s || s.of !== index) {
      s = new Set(Object.entries(index?.sources || {}).filter(([k, v]) => v?.pack && k.startsWith(`${bundle}/`)).map(([k]) => k.slice(bundle.length + 1)));
      s.of = index; packedSets.set(bundle, s);
    }
    return s;
  };

  async function ensure() {
    if (mod) return true;
    if (failed || q() === 'low') return false;
    if (dry) return false;
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
  function dropLive(l) { if (l.inst.pausers?.length) releaseOthers(l); l.inst.dispose(); l.layer.n--; }
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
  // `speed` (2026-10-10, official client): the playback speed — a cast effect plays at its ability's (the attack's
  // anim scale), a hit effect at 1.0 (client `HitEffectOptions.OnCastOnTarget`: CreateEffect(…, 1.0));
  // `aim`: the hit's attacker (an entry with `_useOwnerToTargetDirection`, modes.json `hitAim`); `cast` (2026-10-11): the
  // cast record it belongs to (beginCast — cutCast ends them)
  // Facing (2026-10-11, maintainer decision 「공식대로」 — client `Effect.Play` / `ParticleEffect.FaceTo`):
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
    const { names: picked, unflip } = dirPick(view, given || effectsFor(b.prefabs, kind, skillIndex).filter((n) => !emittedIn(b.bundle).has(n) && !packedIn(b.bundle).has(n)));
    const names = [...picked];
    if (names.length && trace) trace({ kind, names, by: ownerOf(view), at: at ? ownerOf(at) ?? null : null }); // tests: what it plays
    if (dry) for (const n of names) dryFollow(b.bundle, n, ownerOf(view) ?? null, (at || view).info ? ownerOf(at || view) ?? null : null);
    if (!names.length || !(await ensure())) return;
    // local patch (maintainer report 2026-10-08: 赤刃明霄陈's S3 dragon twice, over her): a left / right pair (fx_extract.py
    // `right`: the client plays the left copy and swaps in its `_rightEffect` while the owner faces right) is one effect —
    // the copy for the facing (all five pairs are `_rotateType` 0: never mirrored); the right copy that the name lookup
    // listed besides is skipped
    // 2026-10-24 (묶음 S7): a right copy listed without its left one (`_left` is a directional name effectsFor skips: 凯尔希·思衡托
    // S3 kalts2_skill_03_buff_02_right_01, 寒檀 S2 sntlla_skill_02_buff_02_right) is that pair — its left copy plays and swaps
    for (let i = 0; i < names.length; i++) {
      const l = names[i].replace(/_right(?=_|$)/, '_left');
      if (l === names[i] || names.includes(l) || !index?.bundles?.[b.bundle]?.includes(l)) continue;
      if ((await lib.load(b.bundle, l))?.right === names[i]) names[i] = l;
    }
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
      // 2026-10-22: its face switch's copy for the owner's facing (faceCopy) plays instead, with the owner's faceVector
      const dur0 = def.duration || 3;
      const copy = faceCopy(def, ground.info ? ground : view, b.bundle);
      let own = false;   // `_oneShot`: the copy lives on by itself, else it ends with this effect
      if (copy) {
        const c = await lib.load(b.bundle, copy);
        if (!mod) return;
        if (c) { own = !!def.swFace.oneShot; n = copy; def = c; }
      }
      // 2026-10-22: its random group's pick, its owner's module variant (randomPick / equipVariant)
      const pick = await randomPick(def, b.bundle, true);
      if (pick) { n = pick.n; def = pick.def; }
      const variant = await equipVariant(def, view, b.bundle);
      if (!mod) return;
      if (variant?.pause) { def = variant.def; }
      const anchor = lifted(ground, def, buff); // local patch: its _spawnLocation
      const fourWay = !copy && turns(view).has(n); // `_useFourDirectionalFace` (local patch, maintainer report 2026-10-07: 野鬃 S2 stood upright)
      const aimed = !copy && !!(aim && at && aimSet(view).has(names[i])); // 2026-10-10: attacker → target
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
      const opts = { quality: q(), facing, dir, body: facingDir(at && at.info ? at : view), speed: sp, split, floor: ground.z || 0, tilt: tiltOn(ground, def) };
      const inst = new mod.fxp.FxInstance(def, opts);
      if (variant && !variant.pause) inst.adopt(new mod.fxp.FxInstance(variant.def, opts));
      if (turnOld) aimMover(inst, facingDir(view));
      if (aimed && !def.face) aimAlong(inst, aim, at);
      // its FxDelay / branch delays (inst.lead, effect seconds) come before its prefab's duration
      const until = own ? clockS + (def.duration || 3) + 0.5 + inst.lead / sp
        : buff ? null : endAt ?? clockS + (n === copy ? dur0 : def.duration || 3) + 0.5 + inst.lead / sp;
      inst.object.position.set(anchor.x, anchor.y, anchor.z || 0);
      // local patch (maintainer 2026-10-07: the skill effects covered the operator): every effect on the caster — its cast /
      // skill start as well as its buff loops — goes under the units; the hits on a target stay over
      // (local patch, maintainer report 2026-10-07: 마터호른 S2's dome must cover her) at 'high' the caster's effects split by their renderers' sorting
      addLive(inst, { view: anchor, owner: view.id ?? view.info?.id, buff, onCaster: !at, until, tag, speed: sp, cast: own ? null : cast, backSw: backSwitch(def, at || view, b.bundle) }, split ? layers.split : buff || !at ? layers.under : layers.over);
      trimLive();
    }
  }

  // ---- EmitterRandomGroup · SwitchableWhenContainsEquipment (2026-10-22, effect bundle J; docs/rules/fx.md 「애니메이터 상태」)
  // fx_extract.py random_group `rgroup` (迷迭香 S3's hits): as it plays, the effect stays itself with probability 1 / (n + 1)
  // (`self`), else one of `pick` at random takes its place (the client pauses and finishes it, creating the pick on its
  // owner); nothing without an owner unless `noOwner` / `mainPos`. equip_effects `equipFx` (莫斯提马 S2's ranges): with its
  // owner carrying the module of a hook, that hook's effect plays with it (`pause`: instead of it) and ends with it — the
  // owner's module level is not known here; every hook in the clients lists all three levels [추정: any level].
  /** The def `def` plays as (its random pick, loaded) — { n, def } — or null (itself). */
  async function randomPick(def, bundle, owned) {
    const g = def?.rgroup;
    if (!g || !Array.isArray(g.pick) || !g.pick.length || (!owned && !g.noOwner && !g.mainPos)) return null;
    if (g.self && Math.random() < 1 / (g.pick.length + 1)) return null;
    const n = g.pick[Math.floor(Math.random() * g.pick.length)];
    const d = index?.bundles?.[bundle]?.includes(n) ? await lib.load(bundle, n) : null;
    return d ? { n, def: d } : null;
  }
  /** The module variant of `def` for its owner `owner` (a view), loaded: { def, pause } or null. */
  async function equipVariant(def, owner, bundle) {
    const e = def?.equipFx, mid = owner?.info?.moduleId || owner?.info?.diy?.uniEquipId;
    const h = e && mid ? (e.hooks || []).find((x) => x[0] === mid) : null;
    const d = h && index?.bundles?.[bundle]?.includes(h[2]) ? await lib.load(bundle, h[2]) : null;
    return d ? { def: d, pause: !!e.pause } : null;
  }

  // ---- SwitchableEffectByFaceDirection (2026-10-22, official client; docs/rules/fx.md 「이펙트 방향」) ------------------
  // A prefab with it on its root (fx_extract.py `swFace`: 新约能天使's attack / skill starts, `_down` copies) is swapped as it
  // plays (`_UpdateFace`, from `OnPlay` only): for the owner's `faceDirection` (ParseDirection of faceTo — an
  // attack turns it to its target: face-turn.js `dir4`) DOWN / UP / LEFT with a copy named, the client pauses this effect and
  // creates the copy on the owner with its faceVector; `_oneShot` finishes this one at once (the copy runs its own course),
  // else `OnFinish` finishes the copy with it. Here the copy plays in its place — the paused one draws nothing.
  /** The copy `def`'s face switch plays on `unit` facing as it does now, or null (this one plays). */
  function faceCopy(def, unit, bundle) {
    const name = unit ? faceSwitchCopy(def?.swFace, facingDir(unit)) : null;
    return name && index?.bundles?.[bundle]?.includes(name) ? name : null;
  }

  // ---- SwitchableBackEffect (2026-10-10, official client) -----------------------------------------------------
  // A prefab whose root carries the client's SwitchableBackEffect (fx_extract.py `back`: 비르투오사 S3 cello_skill_03_buff_front_02
  // → cello_skill_03_buff_back_02, and 61 more of 26 operators — 로즈몬티스 `_B` copies, 비질, 휴머스 …) is swapped while its owner faces back:
  // `SwitchableBackEffect._UpdateFace` pauses it and creates `_backEffect` on the owner when the owner's
  // `faceToBack` turns true, and the other way round when it turns back to the front ('common_empty' = nothing while back).
  // Here the owner faces back while its Back model is drawn (UnitView.entryBack; before the model loads, a deploy facing UP);
  // the paused front is not drawn [추정: the pause hides it — a frozen copy beside the back one is not seen in captures].
  // SwitchableThreeFaceEffect (2026-10-22, official client; fx_extract.py `three`: 维什戴尔 S3 wisdel_skill_03_start) is the same
  // swap by `faceToBack` for its up copy — `_UpdateFace` (every frame) shows `_upEffect` while the owner faces
  // back, `_downEffect` while its owner's animator is a ThreeFaceAnimator showing its `_down` face, else itself. No operator
  // model has a third face (their chararts animators have `_front` / `_back` only) and `UnitAnimator.faceToDown` is false, so
  // the down copy never shows: the front copy stays while the unit faces down (docs/rules/fx.md 「이펙트 방향」).
  const faceBack = facesBack;
  /** The back switch of `def` on its unit `unit` (an operator / enemy view), or null. */
  function backSwitch(def, unit, bundle) {
    const b = def?.back || (def?.three?.up ? { effect: def.three.up } : null);
    if (!b || typeof b.effect !== 'string' || !unit || !unit.info) return null;
    return { name: b.effect, bundle, unit, on: false, entry: null };
  }
  async function startBack(l) {
    const sw = l.backSw;
    if (sw.name === 'common_empty' || !index?.bundles?.[sw.bundle]?.includes(sw.name)) return;
    const def = await lib.load(sw.bundle, sw.name);
    if (!mod || !def || !sw.on || !live.includes(l) || l.inst.stopping) return;
    const inst = new mod.fxp.FxInstance(def, { quality: q(), facing: (sw.unit.visFacing ?? sw.unit.facing ?? 1) < 0 ? -1 : 1, split: l.layer === layers.split, floor: sw.unit.z || 0, tilt: tiltOn(sw.unit, def) });
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
      l.inst.object.visible = !back && !l.offHeld && !l.paused;
      if (back) startBack(l);
      else if (sw.entry) { sw.entry.inst.stop(true); sw.entry = null; }
    }
  }

  // ---- pause / finish behaviours (2026-10-21, official client; docs/rules/fx.md 「이펙트 멈춤·끝 조건」) ----------------
  // An effect pauses as its behaviours ask (FxInstance.pausers, fx_extract.py pause_scripts, render/fx/pause.js): the
  // client's `Effect.set_isPaused` → `ParticleEffect.OnPausedUpdated` switches its particle system off and
  // pauses it, and the unpause plays it on — here it is not drawn and not stepped while `paused`. PauseEffectIf and
  // PauseEffectIfNotIdle write the effect's own flag (`pzSelf`), PauseEffectWithAnimation / PauseEffectIfSpineEvent pause it
  // per behaviour (`pzBeh`: `_useBehaviourPause`, the same pause — `Effect.get_isPaused`), another effect's
  // PauseAnotherEffect holds it (`pzBy`: `SetPausedByOthers`); FinishEffectIf finishes it.
  const entryOwner = (l) => l.unit || (l.owner != null ? lastViews?.get(l.owner) : null) || null;

  // ---- FollowDirection (2026-10-22, official client; docs/rules/fx.md 「이펙트 방향」) --------------------------------------
  // A prefab with the client's FollowDirection on its root (fx_extract.py `follow`: 183 operator / 89 enemy prefabs, most
  // of them skill buffs) is turned again as it plays and every frame after (`Update`; once with
  // `_onlyFollowOnPlay`) to its owner's direction (fx/face.js followDir) through the same `ParticleEffect.FaceTo` it was
  // played with (faceTurn) — a FLIP_TWO_SIDE buff mirrors when its operator turns to an enemy behind it, a FOUR_DIRECTION
  // range lies along the deploy direction. The owner is the unit it is created on [추정: the client's `Behaviour.owner` is
  // the entity CreateEffect was given], else its caster
  function stepFollow(l) {
    const u = (l.view?.info && (lastViews?.get(l.view.id) || l.view)) || entryOwner(l);
    if (!u) return;
    l.followed = true;
    const dir = followDir(l.inst.def.follow, { side: u.visFacing ?? u.facing ?? 1, to: u.face?.to || null, deploy: u.dir || null });
    if (!dir) return;
    const t = faceTurn(l.inst.def.face, dir);
    const was = l.inst.turn;
    if (!t || (t.flip === was.flip && t.z === was.z && t.any === was.any)) return;
    l.inst.turn = t;
    l.inst.applyTurn(t);
  }
  // ---- FollowTileHeight (2026-10-22, official client; docs/rules/fx.md 「이펙트 방향」) --------------------------------------
  // A prefab with the client's FollowTileHeight on its root (fx_extract.py `tileH`: 伊内丝's sentry label / range, 圣聆初雪's
  // snow, 凛御银灰 S3's range) keeps its height at the tile under it: `_UpdateHeight` moves its world height
  // toward that tile's (MapUtil.GetTileHightByMapPosition of its own position) by at most `_followTileHeightSpeed` × the
  // frame's time — at once as it plays (`OnPlay`), then every frame (`Update`)
  function stepTileHeight(l, g) {
    const p = l.inst.object.position, h = tileTop(p.x, p.y);
    if (l.tileZ == null) l.tileZ = h;
    else { const d = h - l.tileZ; l.tileZ += Math.sign(d) * Math.min(Math.abs(d), l.inst.def.tileH * g); }
    p.z = l.tileZ;
  }
  function setPaused(l) {
    const p = !!(l.pzSelf || l.pzBeh?.size || l.pzBy?.size);
    if (p === !!l.paused) return;
    l.paused = p;
    l.inst.object.visible = !p && !l.hidden && !l.offHeld;
  }
  const behPause = (l, pz, on) => { if (on) (l.pzBeh ||= new Set()).add(pz); else l.pzBeh?.delete(pz); };
  /** The effects `l`'s PauseAnotherEffect holds are given back (it finished, ended or is paused itself). */
  function releaseOthers(l) {
    for (const pz of l.inst.pausers) {
      if (pz.k !== 'pauseOther' || !pz.held) continue;
      for (const o of pz.held) { o.pzBy?.delete(l); if (live.includes(o)) setPaused(o); }
      pz.held.clear();
    }
  }
  /** Each frame, before the effect steps: its pause / finish behaviours on its owner (entryOwner). */
  function stepPauses(l) {
    const inst = l.inst, v = entryOwner(l);
    for (const pz of inst.pausers) {
      const r = pz.rec;
      if (pz.k === 'pauseIf') {
        const x = v ? pauseIfNow(r, v) : null;
        if (x != null) l.pzSelf = x;
      } else if (pz.k === 'pauseIdle') {
        const x = idlePause(r, v);
        if (x != null) l.pzSelf = x;
      } else if (pz.k === 'pauseAnim') {
        // `_DoPause`: after `pre` s ÷ the playback speed, then `finish`; the restore (`_noPauseWhenValid`) after `back`
        const want = animPause(r, clipOf(v));
        if (want === true) {
          pz.back = null;
          if (!pz.on && pz.at == null) pz.at = clockS + (r.pre > 0 ? r.pre / (l.speed > 0 ? l.speed : 1) : 0);
        } else if (want === false) {
          pz.at = null;
          if (pz.on && pz.back == null) pz.back = clockS + (r.back > 0 ? r.back : 0);
        }
        if (pz.at != null && clockS >= pz.at) { pz.at = null; pz.on = true; if (r.finish && !inst.stopping) inst.stop(); }
        if (pz.back != null && clockS >= pz.back) { pz.back = null; pz.on = false; }
        behPause(l, pz, pz.on);
      } else if (pz.k === 'pauseSpine') {
        // `_pauseAtStart`; the Spine events come through spineEvent(); outside `anims` it plays (`Update`)
        if (pz.on == null) pz.on = !!r.start;
        const clip = r.anims?.length ? clipOf(v) : null;
        if (clip && !r.anims.includes(clip)) pz.on = false;
        behPause(l, pz, pz.on);
      } else if (pz.k === 'pauseOther') {
        // `OnPlay` / `Update`: the owner's effect named `effect`, after `pre` s; with `update`
        // again each frame, and given back while this one is paused
        pz.held ||= new Set();
        pz.at ??= clockS + (r.pre > 0 ? r.pre : 0);
        if (inst.stopping || inst.done || l.owner == null) { releaseOthers(l); continue; }
        if (clockS < pz.at || (pz.done && !r.update)) continue;
        pz.done = true;
        if (r.update && l.paused) { releaseOthers(l); continue; }
        for (const o of live) {
          if (o === l || o.owner !== l.owner || o.inst.def?.name !== r.effect || o.inst.stopping || pz.held.has(o)) continue;
          (o.pzBy ||= new Set()).add(l);
          pz.held.add(o);
          setPaused(o);
        }
      } else if (pz.k === 'finishIf' && !inst.stopping) {
        const gone = l.owner != null && (!v || v.alive === false || v.remove);
        const clipEnd = r.animEnd && inst.animEnded;
        if ((r.ownerGone && gone) || clipEnd) inst.stop();
      }
    }
    setPaused(l);
  }

  // ---- RandomEmitter (2026-10-21, official client) -------------------------------------------------------------
  // A node with the client's RandomEmitter (fx_extract.py node `emit`: common_charge_cost_start_01 → 3 × common_charge_cost_01,
  // 德克萨斯 S1 and four more) plays `count` copies of another prefab: `_DoEmit` waits `_preDelay`, then for
  // each copy takes a random point of the box `from`–`to` through the node's transform (Transform.TransformPoint) and
  // creates the prefab there (BattleController.CreateEffectAtWorldPos: it stays where it was made), `_delayPerEffect` apart.
  // The copies come from the bundle of the prefab that emits them. [ASSUMED: RandomUtil.RandomVector3 is uniform per axis]
  const emitAt = (em) => {
    const { from, to } = em.rec;
    const r = (k) => Number(from[k]) + Math.random() * (Number(to[k]) - Number(from[k]));
    em.o.updateWorldMatrix(true, false);
    return new mod.THREE.Vector3(r(0), r(1), r(2)).applyMatrix4(em.o.matrixWorld);
  };
  async function emitCopy(l, rec, p) {
    const bundle = l.inst.def?.bundle;
    if (!bundle || !index?.bundles?.[bundle]?.includes(rec.effect)) return;
    if (trace) trace({ kind: 'spawn', names: [rec.effect], by: l.owner ?? null, on: null, tag: 'random', facing: 1 }); // tests
    const def = await lib.load(bundle, rec.effect);
    if (!mod || !def || !layers.under) return;
    const inst = new mod.fxp.FxInstance(def, { quality: q(), split: l.layer === layers.split, floor: l.inst.object.position.z || 0 });
    inst.object.position.copy(p);
    const e = addLive(inst, { owner: l.owner, buff: false, until: clockS + (def.duration || 3) + 0.5 + inst.lead }, l.layer);
    if (e && def.fly) startFly(e);
    trimLive();
  }
  // ---- FlyToPredefinedLocation (2026-10-21, official client) ---------------------------------------------------
  // A prefab with the client's FlyToPredefinedLocation (fx_extract.py `fly`: common_charge_cost_01, the RandomEmitter copies
  // above) moves from where it was made to a HUD place and then finishes: `OnPlay` DOMove(place, `_duration`)
  // with ease `_easeType`, unscaled time when `_isIndependentUpdate`, OnComplete → FinishMe. The place
  // (BattleController.GetPredefinedLocationPosition → UIController.GetPredefinedLocationByUI) is the UI element's screen
  // point taken down to the map height; 卫戍协议's HUD plugin (AutoChessUIPlugin.HookPredefinedUILocation) answers
  // only AUTOCHESS_BOUND_BAR, so COST is the base battle UI's cost counter = our DP counter (`.dpbox`, ui/combatHud.js).
  // [ASSUMED: its centre; the board the viewer looks at is the viewer's side — the client keeps another side's copy where it is]
  const FLY_PLACE = { 0: '.dpbox' }; // PredefinedLocation COST; others are not drawn by this HUD
  const EASE = { 1: (t) => t, 5: (t) => t * t }; // DOTween Linear, InQuad (others fall back to InQuad [ASSUMED])
  function flyTarget(loc) {
    const sel = FLY_PLACE[loc];
    const el = sel && host.ownerDocument?.querySelector(sel);
    const cv = layers.under?.canvas;
    if (!el || !cv || !camera) return null;
    const r = el.getBoundingClientRect(), c = cv.getBoundingClientRect();
    if (!r.width || !c.width || !c.height) return null;
    const { THREE } = mod;
    const ndc = new THREE.Vector2(((r.left + r.width / 2 - c.left) / c.width) * 2 - 1, -(((r.top + r.height / 2 - c.top) / c.height) * 2 - 1));
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3()); // the map height
  }
  function startFly(l) {
    const f = l.inst.def.fly;
    const from = l.inst.object.position.clone();
    // no such place on this screen (the debug arena; 凛御银灰's 战鹰 eagle_flyToHand_01, whose Svash2FlyToPredefinedTokenCard
    // flies to his eye's deploy card — a card this HUD has not): it stays, and still finishes then
    const to = flyTarget(f.loc);
    if (to) l.view = null;   // a spawn on a unit: the flight moves it, not the unit
    l.fly = { from: f.inv ? to : from, to: f.inv ? from : to, dur: Math.max(1e-3, Number(f.dur) || 0), real: !!f.real, t: 0, ease: EASE[f.ease] || EASE[5] };
  }
  /** One frame of a flying effect: `dt` real seconds, `dtGame` battle seconds; at the end it finishes. */
  function stepFly(l, dt, dtGame) {
    const f = l.fly;
    f.t = Math.min(f.dur, f.t + (f.real ? dt : dtGame));
    if (f.from && f.to) l.inst.object.position.lerpVectors(f.from, f.to, f.ease(f.t / f.dur));
    if (f.t >= f.dur) { l.fly = null; if (!l.inst.stopping) l.inst.stop(); }
  }

  /** Play the copies of a live effect's emitters whose time has come (effect seconds since its node showed). */
  function stepEmitters(l) {
    const inst = l.inst;
    if (inst.stopping || inst.wait > 0) return;
    for (const em of inst.emitters) {
      const { count, pre = 0, per = 0 } = em.rec;
      const t = inst.time - (em.o.userData.t0 || 0), sp = l.speed > 0 ? l.speed : 1;
      while (em.next < count && t >= (Number(pre) + em.next * Number(per)) * sp) {
        em.next++;
        emitCopy(l, em.rec, emitAt(em));
      }
    }
  }

  // ---- OnPlayEmitter / OnFinishEmitter (2026-10-21, official client) ---------------------------------------------
  // A node with the client's OnPlayEmitter (fx_extract.py node `onPlay`; 33 operator and enemy prefabs, all on the root: buffs
  // that add their ground copy — fartth_skill_03_buff_02 → _XZ, skadi2_skill_03_buff_03 → _XZ — or their other parts) creates other
  // prefabs when its effect plays (`_OnPlayInternal`: now when `_instant`, else `_preDelay` s later): `_DoEmit`
  // through BattleController.CreateEffect on the effect's owner — the unit it was created on — each at its own
  // _spawnLocation, or at this node with `_useSourceEffectPos`; `_clearWhenFinish` finishes them when this one finishes
  // (OnFinish). OnFinishEmitter (`onFinish`; 22 prefabs: the `_end` copies of range rings and buffs) creates its prefabs when the
  // effect finishes (OnFinish), on the owner or at the effect's map position (`_useEffectPosition`). Without an owner
  // (an effect on a point) both play at the effect's place. They come from the bundle of the prefab that emits them, played
  // with the owner's facing (the overload without a direction asks the target for one too [추정: its faceVector]).
  const onEmitNow = (l, em) => (em.play.pre > 0 ? l.inst.time - (em.o.userData.t0 || 0) >= Number(em.play.pre) * (l.speed > 0 ? l.speed : 1) : true);
  function onEmitPlay(l, rec, here) {
    const bundle = l.inst.def?.bundle;
    const unit = l.view?.info && l.view.id != null ? lastViews?.get(l.view.id) || null : null;
    const pt = () => { const p = l.inst.object.position; return { x: p.x, y: p.y, z: p.z || 0 }; };
    const at = here || !unit || unit.alive === false || unit.remove ? pt() : unit;
    const kids = [];
    for (const n of rec.effects) {
      if (!index?.bundles?.[bundle]?.includes(n)) continue;
      kids.push(spawn(bundle, n, at, { owner: l.owner ?? null, buff: !!l.buff, on: unit?.id ?? l.on ?? null, tag: 'emit', until: rec.clear ? l.until : undefined },
        { over: l.layer === layers.over, facing: unit ? efacing(unit) : 1 }));
    }
    return kids;
  }
  /** Play a live effect's OnPlayEmitter prefabs when their time comes and its OnFinishEmitter prefabs when it finishes. */
  function stepOnEmit(l) {
    const inst = l.inst, ending = inst.stopping || inst.done;
    for (const em of inst.onEmit) {
      if (em.play && !em.kids && !ending && inst.wait <= 0 && onEmitNow(l, em)) {
        em.kids = onEmitPlay(l, em.play, em.play.srcPos);
      }
      if (ending && !em.ended) {
        em.ended = true;
        if (em.play?.clear && em.kids) for (const k of em.kids) Promise.resolve(k).then((c) => { if (c && !c.inst.stopping) c.inst.stop(); });
        if (em.finish) onEmitPlay(l, em.finish, em.finish.effPos);
      }
    }
  }
  // `dry` (tests, 2026-10-21): a dry layer loads no prefab, so what a prefab creates once it plays — its OnPlayEmitter /
  // OnFinishEmitter prefabs (stepOnEmit) and RandomEmitter copies (stepEmitters) — never reached `trace`. Each started
  // prefab's JSON alone is read here and those are traced as the live path traces them (spawn: tag 'emit', on the unit the
  // parent sits on; emitCopy: tag 'random', at a point), then theirs. Whether the parent lives to finish is not followed:
  // its OnFinishEmitter prefabs are traced with the ones it plays.
  const dryDefs = new Map();
  function dryFollow(bundle, name, by, on, seen = new Set()) {
    const key = `${bundle}/${name}`;
    if (!trace || typeof fetch !== 'function' || seen.has(key)) return;
    seen.add(key);
    let p = dryDefs.get(key);
    if (!p) {
      p = fetch(`/assets/local/fx/${encodeURIComponent(bundle)}/${encodeURIComponent(name)}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      dryDefs.set(key, p);
    }
    p.then((def) => {
      const has = (n) => typeof n === 'string' && !!index?.bundles?.[bundle]?.includes(n);
      for (const node of def?.nodes || []) {
        for (const n of [...(node.onPlay?.effects || []), ...(node.onFinish?.effects || [])]) {
          if (!has(n)) continue;
          trace({ kind: 'spawn', names: [n], by, on, tag: 'emit', facing: 1 });
          dryFollow(bundle, n, by, on, seen);
        }
        if (node.emit?.count > 0 && has(node.emit.effect)) {
          trace({ kind: 'spawn', names: [node.emit.effect], by, on: null, tag: 'random', facing: 1 });
          dryFollow(bundle, node.emit.effect, by, null, seen);
        }
      }
    });
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

  /**
   * A skill ended: its loops end. Not the statuses the unit wears (`status`, fxstatus.js): the sim ends those (statusOff);
   * stopped here, their `again` restarted them from the start the next frame (2026-10-16).
   * (2026-10-23, official client) `now` = the client's end of a buff's effect: `BuffContainer._FinishAndRemoveBuff` →
   * `Entity.OnBuffFinish` → `RemoveBuffEffect` → `Effect.FinishMe` (not immediately; a cast's looping effects the same,
   * `CastEffectOptions._ClearEffects`) — its first system stops and its `_inactiveOnFinish` nodes go off (FxInstance.finish),
   * the effect goes its prefab's `_delayToFinish` later (def.finish); none / 0: at once. It stopped every system before.
   */
  function stopBuffs(ownerId, now = false) {
    for (const l of live) {
      if (!l.buff || l.status || l.owner !== ownerId) continue;
      const fin = now ? Number(l.inst.def?.finish) : 0;
      if (fin > 0) { l.inst.finish(); if (!(l.finishAt <= clockS + fin)) l.finishAt = clockS + fin; } else l.inst.stop(now);
    }
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
  // held by their owner (root ParticleEffect raw int #17 = `_holdByOwner` 1, as every status buff; the blasts 0 — official
  // client 2026-10-10: the field order of ParticleEffect, and `Effect._InitLocationFromEntity` ends with entity.HoldEffect;
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
  // 2026-10-22 (docs/rules/render.md 「모델 위치값」): STONE_BALL is the ball above the MODEL's root, and the model stands
  // at its prefab's FaceSwitcher place (units.js modelDY / modelDZ; the stone's is fxpoints.js STANDARD_PLACE) — about
  // 0.16 tile below the stone's point on screen, so the ball is ~0.02 tile above it, where the 跟子's `qizi (1)` is
  const STONE_BALL = 0.18, STONE_FACE = modelOffset(STANDARD_PLACE.face);
  // (maintainer report 2026-10-16: the effects on the balls slid off them toward the board's edges) The ball is drawn
  // straight above the stone's root on screen (an upright billboard), but a point raised in world z drifts away from the
  // screen centre under the perspective camera (≈ 0.04 tile per column off centre at the ball's height): the world point
  // whose projection IS the drawn ball comes from fxpoints.js liftedPoint, as a model point's does.
  const BALL_P = { x: 0, y: 0, s: 0, depth: 0 }, BALL_Q = { x: 0, y: 0, s: 0, depth: 0 };
  /** World point of the ball centre of a stone at (x, y) on ground z0: drawn STONE_BALL tile above its model's root on screen. */
  const ballAt = (x0, y0, g0, out = { x: 0, y: 0, z: 0 }) => {
    const x = x0 + STONE_FACE.dx, y = y0 + STONE_FACE.dy, z0 = g0 + STONE_FACE.dz;
    if (!camRef || typeof camRef.project !== 'function') { out.x = x; out.y = y; out.z = z0 + STONE_BALL; return out; }
    const r = camRef.project(x, y, z0, BALL_P);
    return liftedPoint(camRef, x, y, z0, r.y, r.x, r.y - STONE_BALL * r.s, out, BALL_Q);
  };
  /** A stone view's ball as an effect anchor (follows the view). */
  const ballOf = (v) => {
    const p = { x: 0, y: 0, z: 0 };
    const at = () => ballAt(v.x, v.y, (v.z || 0) + (v.hover || 0), p);
    return {
      get x() { return at().x; }, get y() { return v.y; }, get z() { return at().z; },
      get alive() { return v.alive; }, get remove() { return v.remove; }, id: v.id, info: v.info,
    };
  };
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
  const ptsOf = (v) => (!v?.info ? null : efoe(v) ? ebindOf(v)?.points || null : (points && points[v.info.spine || v.info.defId]) || null);
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
  /**
   * 2026-10-22 (docs/rules/fx.md 「캐릭터 그림의 기울기」): FxInstance `tilt` for prefab `def` created on `on` — its model's
   * `Graphic` rotation when `on` is a unit and the prefab's `_spawnLocation` takes it (fxpoints.js takesGraphicTurn); a
   * board point gets none.
   */
  const tiltOn = (on, def) => (on && on.info && takesGraphicTurn(def) ? GRAPHIC_TILT : null);
  const ex = (v) => (v.glideS ? Number(v.glideS.lx) + (Number(v.modelDX) || 0) : mx(v));
  const ey = (v) => (v.glideS ? Number(v.glideS.ly) : v.y);
  // local patch (maintainer report): a prefab with a FollowMountPoint (fx_extract.py `mount`) is placed
  // at and follows its mount point instead of its _spawnLocation; with `pauseWhenInvalid` it stands still (`paused`, the
  // frame loop skips its update) while the unit's current skeleton has none of the point's bones.
  // 2026-10-22 (official client; docs/rules/fx.md 「붙는 자리」): any other effect on a unit is put once where its
  // `_spawnLocation` is (`Effect._InitLocationFromEntity`: every location ends at the same tail) and then moves
  // with the unit only when held — `_holdByOwner` (face `hold`: `Entity.HoldEffect`), or `buff`: a buff's effect
  // (`Entity.AddBuffEffect` holds every one it creates, the same parenting inlined); a cast or a hit without
  // `_holdByOwner` stays where it was made (held)
  function lifted(v, def, buff = false) {
    const at = followed(v, def, buff);
    return !v || !v.info || !at || at.placed || def?.mount || buff || def?.face?.hold ? at : placedOnce(v, at);
  }
  /** `f` read once, on the first access (its creation), for unit `v` — what a placed, unheld effect keeps. */
  function placedOnce(v, f) {
    let p0 = null;
    const first = () => { p0 ||= { x: f.x, y: f.y, z: f.z || 0, hover: f.hover }; };
    return {
      get x() { first(); return p0.x; }, get y() { first(); return p0.y; }, get z() { first(); return p0.z; },
      get hover() { first(); return p0.hover; },
      get alive() { return v.alive; }, get remove() { return v.remove; }, id: v.id, info: v.info,
    };
  }
  function followed(v, def, buff) {
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
      // frame (2026-10-10, official client, maintainer decision (2026-10-10)): the client's `FollowMountPoint._FollowMountPoint`
      // (each LateUpdate) takes the point's rotation every frame when `_keepOriginRotation` is 0. From 2026-10-08
      // it was taken once, at the start: 니어 더 래디언트 나이트 S3's light lance (nearl2_skill_03_start `qiang`, on F_Weapon)
      // thrusts forward at 0° while her lance swings back to ~160° in the next 0.5 s, and following it turned the thrust
      // backward (maintainer 2026-10-08 「빛으로 된 창으로 찌르는 이펙트가 허전해」) — the cause is then in that point's angle here
      // (sign / axis of the turn: the client turns the effect in the skeleton's tilted plane, here about the board's normal
      // [추정]), to be checked on screen
      const turns = def?.mount && def.mount.keepOriginRotation === 0;
      if (!def?.mount) return placedAt(v, def, key, spawn, at, buff);
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
      // 2026-10-23 (official client; docs/rules/render.md 「모델 위치값·그림자」): 1 FOOT_POINT is the unit's foot mount
      // point, its animator's `footTransform` — the active face's skeleton node (CharacterAnimator, MultiSpineAnimator;
      // SingleSpineAnimator's skeleton, EmptyAnimator's own node) — so a foot effect stands with the model its prefab
      // places off the unit's point (render/units.js faceDX / modelDY / modelDZ): 余 S3's buff hung 0.16 tile above her
      // feet (maintainer report 2026-10-23, official recording). 0 NONE and the ground centres stay on the point
      const foot = spawn === 1 && v && (v.faceDX || v.modelDY || v.modelDZ) ? v : null;
      const fdx = () => (foot ? Number(foot.faceDX) || 0 : 0), fdy = () => (foot ? Number(foot.modelDY) || 0 : 0);
      const fdz = () => (foot ? Number(foot.modelDZ) || 0 : 0);
      // 2026-10-11: an airborne (起飞) operator's feet are at the flyers' height (render/units.js `liftoff`; the client's
      // _spawnLocation FOOT / NONE is the entity's place, its fly height included) — 予愿安洁莉娜 S3's range ring is authored to
      // come down from there onto her tile (docs/rules/render.md 「이륙 높이」). (2026-10-21) A flying enemy's too (render/units.js
      // `flying`: UnitInfo motion FLY or the snapshot's UF.FLYING, drawn `hover` up): its feet effects stayed on the road under it
      if (v && (v.liftoff || v.flying)) {
        return {
          get x() { return ex(v) + fdx(); }, get y() { return ey(v) + fdy(); }, get z() { return (v.z || 0) + (v.hover || 0) + fdz(); },
          get alive() { return v.alive; }, get remove() { return v.remove; }, id: v.id, info: v.info,
        };
      }
      if (!v || !(v.modelDX || 'glideS' in v || foot)) return v;
      return {   // its feet under the drawn model (MODEL_SHIFT), on its tile while the model glides
        get x() { return ex(v) + fdx(); }, get y() { return ey(v) + fdy(); }, get z() { return foot ? (v.z || 0) + fdz() : v.z; },
        get hover() { return v.hover; },
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
  /**
   * (2026-10-22, official client; docs/rules/fx.md 「이펙트 붙는 자리」) An effect created at a model point without a
   * FollowMountPoint: the client's `Effect._InitLocationFromEntity` puts it once at the point
   * (`at`, read on the first access — its creation), with the point Transform's rotation for 3 MUZZLE_POINT (the muzzle's
   * BoneFollower turns with its bone: fxpoints.js pointTurn; the client's skeleton is flipped inside, so a model drawn
   * mirrored here gives the mirrored angle π − θ, the effect itself not mirrored); then `Entity.HoldEffect` for
   * `_holdByOwner` (face `hold`) parents it to the unit's `Effects` Transform, a child of its root — it moves with the unit
   * from where it was made, not with the bone —, and without it the effect stays there. It used to follow the point every
   * frame (2026-10-08) and took no turn: 엑시아's muzzle flash (spawn 3, `_rotateType` 0) kept its authored rightward
   * direction, over her gun when she faced left.
   */
  function placedAt(v, def, key, spawn, at, buff = false) {
    const hold = !!def?.face?.hold || buff;   // 2026-10-22: a buff's effect is always held (lifted)
    let p0 = null, b0 = null, r0 = null;
    const first = () => {
      if (p0) return;
      const p = at();
      p0 = { x: p.x, y: p.y, z: p.z || 0 };
      b0 = { x: ex(v), y: ey(v), z: (v.z || 0) + (v.hover || 0) };
      if (spawn === 3) {
        const t = pointTurn(ptsOf(v)?.[key], v.actor?.spine?.skeleton, !!v.entryBack);
        r0 = t == null ? null : (v.visFacing ?? v.facing ?? 1) < 0 ? Math.PI - t : t;
      }
    };
    return {
      get x() { first(); return hold ? ex(v) + p0.x - b0.x : p0.x; },
      get y() { first(); return hold ? ey(v) + p0.y - b0.y : p0.y; },
      get z() { first(); return hold ? (v.z || 0) + (v.hover || 0) + p0.z - b0.z : p0.z; },
      get rot() { first(); return r0; },
      get alive() { return v.alive; }, get remove() { return v.remove; },
      id: v.id, info: v.info, placed: true,
    };
  }
  const ownerOf = (v) => v.id ?? v.info?.id;
  /**
   * (2026-10-10, official client — `Effect._InitLocationFromEntity`: with `_overwriteHeight` the effect's
   * height is set to the entity's height + `_heightOffset`; fx_extract.py `height`, only 쏜즈 더 로드스타 S1
   * thorn2_skill_01_range in the pool, offset 0, after its _spawnLocation 7 put it at height 0): `at` at the ground height of
   * its unit / of the tile under it plus `off` [추정: the entity — her S1 projectile where it landed — stands on that tile].
   */
  /** The height of the drawn tile under board point (x, y) (its device included), 0 off the board. */
  function tileTop(x, y) {
    let g = null;
    try { g = grid(); } catch { /* none */ }
    const t = Array.isArray(g) ? g[Math.round(y)]?.[Math.round(x)] : null;
    return t && t.drawn ? (t.h || 0) + (t.devH || 0) : 0;
  }
  function overHeight(at, off) {
    const unit = at && at.info ? at : null;
    return {
      get x() { return at.x; }, get y() { return at.y; },
      get z() { return (unit ? (unit.z || 0) + (unit.hover || 0) : tileTop(at.x, at.y)) + off; },
      get alive() { return at.alive; }, get remove() { return at.remove; }, id: at.id, info: at.info,
    };
  }
  const statusFailed = new Set();   // `${bundle}/${name}` that did not load: their units keep the icon (statusReady false)
  async function playStatus(view, bundle, name, key, frac, hold = null, under = false, once = false) {
    if (!(await ensure())) return;
    const def = await lib.load(bundle, name);
    if (mod && !def) { statusFailed.add(`${bundle}/${name}`); view._fxStatusOn?.delete(key); return; }
    if (!mod || !view._fxStatusOn?.has(key)) return;   // destroyed, or turned off while it loaded
    // local patch (maintainer report 2026-10-08: the stun marks stacked over a re-stunned enemy): one effect per unit and
    // status — a status turned off and on again while its file loaded started a second load; the first one lands here too
    if (live.some((l) => l.status === key && l.unit === view && !l.inst.stopping && !l.inst.done)) return;
    // 2026-10-16: `frac` 'own' (fxstatus.js OWN) — at the prefab's own `_spawnLocation`, special points included, as a kit's play
    const anchor = frac === 'own' ? lifted(view, def, true) : {
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
    const inst = new mod.fxp.FxInstance(def, { quality: q(), facing: (view.visFacing ?? view.facing ?? 1) < 0 ? -1 : 1, split, floor: view.z || 0, hold, tilt: tiltOn(view, def) });
    inst.object.position.set(anchor.x, anchor.y, anchor.z);
    // (`once`: finished the frame it lands — FxInstance.finish, then gone def.finish s later — and never started again)
    const fin = once ? Math.max(0, Number(def.finish) || 0) : 0;
    addLive(inst, { view: anchor, owner: ownerOf(view), buff: true, status: key, again: once ? null : () => playStatus(view, bundle, name, key, frac, hold, under), unit: view,
      ...(once ? { until: clockS, finishAt: clockS + fin } : null) }, split ? layers.split : under ? layers.under : layers.over);
    trimLive();
  }

  /** 2026-10-21: a one-shot status prefab on `view` at its own `_spawnLocation` (a buff's end effect: api.statusOnce). */
  async function playOnce(view, bundle, name) {
    if (!(await ensure())) return;
    const def = await lib.load(bundle, name);
    if (!mod || !def || view.remove) return;
    const inst = new mod.fxp.FxInstance(def, { quality: q(), facing: (view.visFacing ?? view.facing ?? 1) < 0 ? -1 : 1, floor: view.z || 0, tilt: tiltOn(view, def) });
    const anchor = lifted(view, def);
    inst.object.position.set(anchor.x, anchor.y, anchor.z);
    addLive(inst, { view: anchor, owner: ownerOf(view), unit: view }, layers.over);
    trimLive();
  }

  // (2026-10-22) The link line, token_wang_passive_01_line (three world-space LineRenderers, one 1 s clip): the client's
  // WangStoneTriggerManager._TryTriggerStones runs on a stone's birth — _CollectTmpTiles sorts the stones
  // of its row and of its column and keeps the unbroken run through it (_FilterContinuousCharacters) — and
  // _PlayTriggeredLineEffect makes the line once per run of two or more, on the born stone, with every
  // LineRenderer's point 0 / 1 = the run's first / last stone's `worldPosition` (set once). The sim says 'wangLink' for
  // each stone that gains a link direction, the born one and its neighbours alike: a line per direction new to that
  // stone, the same run drawn once in a moment. The ends: a 跟子 on its tile point, a placed 棋子 on its ball (the
  // activation's place, maintainer 2026-10-08; the client's entity point is the ground under it [추정: kept on the ball]).
  const LINK_LINE = 'token_wang_passive_01_line';
  const linkAxes = new Map();   // stone id → the link directions drawn for it
  const linkRuns = new Map();   // run key → clockS it was drawn
  // a 跟子 still in its throw (throwStart) — the client's line waits for its birth, the landing [추정: the sim links it as
  // the throw starts]: a line with such an end is put off until it lands
  const throwLand = new Map();  // 跟子 id → clockS it lands
  function linkEnd(v) {
    const z = (Number(v.z) || 0) + (Number(v.hover) || 0);
    // a 跟子's view is drawn by its effects (units.js drawnByFx sets `_fxBody`)
    return v._fxBody ? { x: Number(v.x), y: Number(v.y), z } : ballAt(Number(v.x), Number(v.y), z);
  }
  function linkLines(o, views) {
    const sv = views.get(o.id);
    if (!isStone(sv)) return;
    const seen = linkAxes.get(o.id) || new Set();
    linkAxes.set(o.id, seen);
    const own = sv.info?.ownerUid;
    const at = new Map();
    for (const v of views.values()) {
      if (!isStone(v) || v.alive === false || v.remove) continue;
      if (own != null && v.info?.ownerUid != null && v.info.ownerUid !== own) continue;
      at.set(`${Math.round(v.x)},${Math.round(v.y)}`, v);
    }
    for (const a of Array.isArray(o.axes) ? o.axes : []) {
      if (seen.has(a)) continue;
      seen.add(a);
      const run = linkRun(at, Math.round(sv.x), Math.round(sv.y), a);
      if (!run) continue;
      const key = `${a}:${run[0]}:${run[1]}`;
      if (linkRuns.get(key) === clockS) continue;
      if (linkRuns.size > 64) for (const [k, t] of linkRuns) if (t !== clockS) linkRuns.delete(k);
      linkRuns.set(key, clockS);
      const a0 = at.get(run[0]), b0 = at.get(run[1]);
      const wait = Math.max(0, ...[...at.values()].filter((v) => linkRun(at, Math.round(v.x), Math.round(v.y), a)?.[0] === run[0])
        .map((v) => (throwLand.get(v.id) ?? 0) - clockS));
      if (wait > 0) castsDelayed.push({ t: clockS + wait, run: () => playLine(linkEnd(a0), linkEnd(b0)) });
      else playLine(linkEnd(a0), linkEnd(b0));
    }
  }
  async function playLine(a, b) {
    if (!index?.bundles?.[STONE_FX]?.includes(LINK_LINE) || !(await ensure())) return;
    const def = await lib.load(STONE_FX, LINK_LINE);
    if (!mod || !def) return;
    const inst = new mod.fxp.FxInstance(def, { quality: q() });
    inst.object.position.set(a.x, a.y, a.z || 0);
    inst.setLine(a, b);
    addLive(inst, { view: null, owner: null, buff: false, until: clockS + (def.duration || 1) + 0.5, keep: false }, layers.under);
    trimLive();
  }
  function stoneFx(e, views) {
    const o = e[4];
    if (!o || typeof o !== 'object') return false;
    const at = { x: Number(e[2]), y: Number(e[3]), z: 0 };
    // local patch (maintainer 2026-10-08): the link line and the activation flash on the stones' balls (STONE_BALL)
    const onBall = ballAt(at.x, at.y, 0);
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
      linkLines(o, views);
      if (o.first) {
        // (2026-10-17) a 跟子 is its effects' stone (units.js drawnByFx): its ball, `qizi (1)`, is on the tile point and the
        // client makes its activation on the projectile there (WangStoneHitBehaviour.PlayStoneTriggeredEffect)
        // — the prefabs' own heights (wisps `line` 0.13–0.2) wrap it; STONE_BALL lifts only to a placed 棋子's model ball
        const flat = !!o.follower && stonesOn();
        // local patch: the activation effect of its own kind (STONE_ON), on the ball, kept while the stone stands
        const sv = views.get(o.id);
        const on = isStone(sv) ? { at: flat ? sv : ballOf(sv), owner: o.id, keep: true } : { at: flat ? at : onBall };
        playAt([o.follower ? STONE_ON.follower : STONE_ON.stone], on.at, { owner: on.owner, keep: on.keep, bundle: o.follower ? FOLLOWER_FX : STONE_FX });
      }
      return true;
    }
    if (e[1] === 'summon') {
      const v = views.get(o.id);
      stoneBirth.delete(o.id);
      if (isStone(v)) {
        // local patch: a 跟子's rings (its own birth effect), a placed stone's gold cross — on the ground
        // (maintainer decision 2026-10-17) a 跟子 is its effects' stone, no model (units.js drawnByFx): the throw's falling
        // `qizi` hides at 0.2333 s and its tile effect, with the resting `qizi (1)`, comes as it lands (THROW_S)
        if (o.follower) {
          v.drawnByFx?.(stonesOn);
          throwStart(v);
          castsDelayed.push({ t: clockS + THROW_S, run: () => playAt([STONE_BORN.follower], v, { owner: o.id, under: true, bundle: FOLLOWER_FX }) });
        } else playAt([STONE_BORN.stone], v, { owner: o.id, under: true });
        return true;
      }
    }
    return false;
  }
  // The throw of a 跟子: charpack SpawnToken/BuildStone and skchr_wang_3 InstantSpawn `_startEffect` wang_passive_01_start —
  // a CastOnTileAbility's, created on each cast TILE, not on her (`CastOnTileAbility.OnCastStart`:
  // CreateEffect(_startEffect, m_castTiles[i], owner); its clip drops the stone from the sky onto that point), and finished
  // as the stone lands there (`_finishStartEffectsOnCastOnTile`: after the 0.25 s `_preDelay`) — emission stops, the effect
  // goes its `finish` later (Effect.FinishMe, statusOff). [추정: the sim's 'summon' is the landing; it starts there]
  // (2026-10-16 maintainer report: it was played on her)
  const THROW_S = 0.25;
  function throwStart(v) {
    const t0 = clockS;
    throwLand.set(v.id, t0 + THROW_S);
    spawn(FOLLOWER_FX, 'wang_passive_01_start', { x: v.x, y: v.y, z: v.z || 0 }, { owner: null, buff: false }, { over: false }).then((l) => {
      if (!l) return;
      l.until = Math.max(clockS, t0 + THROW_S);
      const fin = Number(l.inst.def?.finish);
      l.finishAt = l.until + (fin > 0 ? fin : 0);
    });
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
  // [추정]; the prefabs' own end effects (beidong_buff_01_end) are not played. 2026-10-24 (묶음 S4): the switch back
  // ('swap') plays `dollBack` once ([switch2normal]/StandBorn `_castEffects`: the swirl and ghost2_birth_empty_03).
  function dollFx(e, views) {
    const id = e[4].id, v = views.get(id);
    for (const l of live) if (l.tag === 'doll' && l.owner === id) l.inst.stop(e[1] === 'dollEnd');
    if (e[1] === 'swap' && v && q() !== 'low') {
      const back = (bindOf(v)?.dollBack || []).filter((x) => bundleOf(v)?.prefabs.includes(x));
      if (back.length) play(v, 'skillStart', 0, { names: back });
    }
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
    const v = views.get(kitOperator(o, e[1]));
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
    const s = src._fxShot, sk = skillBind(src), shot = sk?.shot;
    if (!s || !(s.t == null || s.t === clockS) || !((Array.isArray(shot) && shot.length) || sk?.hitGroups?.shots)) return false;
    s.t = clockS;
    return true;
  }
  /** Whether this attack flies its mode's official trail (decided now, synchronously, for arrowKind); loads it otherwise. */
  function trailShot(e, src, tgt, mode, shot = false) {
    if (!tgt || mode == null || level() >= 3 || failed) return false;
    const spec = PROJ[e[3]];
    let name = null;
    const sg = spec && e[3] !== 'boomerang' ? strikeGroups(src, mode, shot) : null; // 跃跃's second boomerang: caperSecond
    if (spec && mode === -1) ({ name, mode } = modelessTrail(bindOf(src), bundleOf(src)?.prefabs, skillIdx(src), shot));
    else if (spec) {
      // 2026-10-21: the trail of the ability cast in place of the attack (modePart: a talent's 'T.1' arrow, 凯尔希·思衡托 S2's
      // per-side shot), else the mode's
      const sig = typeof e[4] === 'string' && e[4] ? e[4] : null;
      name = modePart(bindOf(src), bundleOf(src)?.prefabs, mode, sig, tgt.info?.side ? tgt.info.side !== 'enemy' : null)?.trail[0] || bound(src, mode, 'trail')[0];
    }
    if (!name) return false;
    const b = bundleOf(src);
    const key = `${b.bundle}/${name}`;
    if (!trailReady.has(key)) {
      ensure().then((ok) => (ok ? lib.load(b.bundle, name) : null)).then((def) => { if (def) trailReady.add(key); }, () => {});
      return false;
    }
    if (trails.length >= MAX_TRAILS) return false;
    const dx = tgt.x - src.x, dy = tgt.y - src.y, dist = Math.hypot(dx, dy);
    // 2026-10-16: the sim's flight time of this operator's shot (data/chess.json `shot`); none when it lands at the strike
    const v = e[3] === 'boomerang' ? null : shotSpeedOf({ lookupDef: unitDef }, src, tgt, dist);
    if (v === 0) return false;
    trailAtks.add(e);
    const from = shotFrom(src, mode);
    // (2026-10-23) a PARACURVE shot rises its official height (灰毫's shell), as an enemy's does
    const lob = e[3] === 'boomerang' ? null : shotArcOf({ lookupDef: unitDef }, src);
    const rec = { inst: null, tgt, x0: from.x, y0: from.y, z0: from.z, tx: mx(tgt), ty: tgt.y, tz: shotTo(tgt), k: 0,
      dur: Math.max(0.04, dist / (v || projSpeed(e[3]))), arc: lob ?? (spec.arc ? spec.arc * Math.min(1.8, Math.max(0.6, 0.45 + dist * 0.18)) : 0) };
    // local patch (maintainer report 2026-10-08: one boomerang that comes back): a 回环射手's trail is the projectile itself
    // both ways — projectile_chr_caper `_comeBack` 1 at `_comeBackSpeedScale` .25 (the sim's BOOMERANG_RETURN_SPEED), its
    // `_mainEffect` kept (`_clearMainEffectWhenReached` 0): it turns at the hit and flies back to her (stepTrails), and the
    // wheel is out of her hand meanwhile (render/heldWheel.js)
    if (e[3] === 'boomerang') {
      rec.src = src; rec.back = Math.max(0.04, dist / projSpeed('boomerangReturn')); boomerangThrown(src);
      // 2026-10-10: 跃跃 S2's boomerangs (projectile_chr_caper_s2 / _s2_1, ParacurveMovement `_raiseHeight` 0.3,
      // none under `_noRaiseHeightThreshold` 1.3 tiles) arc; the second one (caperBoomerang2) the other way (`_inverseParacurve`)
      if (/_skill_02_/.test(name)) rec.arc = caperArc(dist, false);
    }
    launchTrail(rec, b.bundle, name);
    // 2026-10-21: a skill shot's rope (its list's `_line`: 歌蕾蒂娅 S1, 崖心 S1, 溯光星源 S2) from her to the flying head
    if (shot && mode === -1) { const line = shotLine(src, name); if (line) ropeLine(b.bundle, line, src, rec); }
    // 2026-10-16: the attack's later strikes shoot projectiles of their own (strikeGroups `shots`: 伺夜 S3's second and third
    // arrows, 新约能天使 S1's eight) — each `dt` (`_triggerDelta`) after the one before, from where the first left
    // [추정: the sim lands every strike with the first; the client shoots strike n at n × _triggerDelta]
    (sg?.shots?.slice(1) || []).forEach((s, k) => {
      const n = Array.isArray(s) ? s.find((x) => b.prefabs.includes(x)) : null;
      if (!n) return;
      if (!trailReady.has(`${b.bundle}/${n}`)) { ensure().then((ok) => (ok ? lib.load(b.bundle, n) : null)).then((def) => { if (def) trailReady.add(`${b.bundle}/${n}`); }, () => {}); return; }
      const go = () => { if (trails.length < MAX_TRAILS && !gone.has(ownerOf(tgt))) launchTrail({ ...rec, inst: null, k: 0, tx: mx(tgt), ty: tgt.y, tz: shotTo(tgt) }, b.bundle, n); };
      if (sg.dt > 0) castsDelayed.push({ t: clockS + sg.dt * (k + 1), run: go }); else go();
    });
    return true;
  }
  /**
   * 2026-10-21 (이펙트 연결 전수 ①): a skill's own projectile (modes.json skills[i].shot, char_modes.py — the `_mainEffect`
   * of the projectile its skill prefab's ability shoots) from `src` to `to` (a unit, followed, or a ground point), for the kit
   * events of skills whose window has no attack to carry it (takeShot): 流星 S2 'volley', 崖心 S2 'pull', 波登可 S2 / 锡人 /
   * 引星棘刺 'zone'. At the sim's speed of that skill's shot (data/chess.json shot.skills[i]: speeds.js opShot; none read:
   * 10 tiles / s [추정]) on its PARACURVE `height` arc, from her muzzle; a `_line` of the list (崖心's rope) runs from her to
   * the flying head (ropeLine). `land` runs as it lands. The flight time (s), or -1 with nothing to fly.
   */
  function skillShotOut(src, to, land = null) {
    if (!isOp(src) || !bundleOf(src) || failed || level() >= 3 || !to) return -1;
    const b = bundleOf(src), i = skillIdx(src);
    const { name, shot } = modelessTrail(bindOf(src), b.prefabs, i, true);
    if (!shot || !name) return -1;
    let def;
    try { def = unitDef(src.info) ?? null; } catch { def = null; }
    const s = opShot(def, true, i);
    if (s && Number(s.speed) === 0 && s.move !== 'OTHER') return -1;   // no flight: the skill's shot lands at once
    const unit = to.info ? to : null;
    const from = shotFrom(src, null);
    const tx = unit ? mx(unit) : Number(to.x), ty = Number(to.y), tz = unit ? shotTo(unit) : Number(to.z) || 0;
    // the sim's flight: unit to unit (or point), as trailShot
    const dur = Math.max(0.04, Math.hypot(tx - src.x, ty - src.y) / (Number(s?.speed) > 0 ? Number(s.speed) : 10));
    const arc = s?.move === 'PARACURVE' && Number(s.height) > 0 ? Number(s.height) : 0;
    const rec = { inst: null, tgt: unit, x0: from.x, y0: from.y, z0: from.z, tx, ty, tz, k: 0, dur, arc };
    trails.push(rec);
    spawn(b.bundle, name, { x: from.x, y: from.y, z: from.z }, { owner: null, buff: false, until: clockS + dur + 5 }, { drop: rec })
      .then((l) => { if (!l) { const k = trails.indexOf(rec); if (k >= 0) trails.splice(k, 1); } });
    const line = unit ? shotLine(src, name) : null;
    if (line) ropeLine(b.bundle, line, src, rec);
    castsDelayed.push({ t: clockS + dur, run: () => land?.() });
    return dur;
  }
  /**
   * 2026-10-23: load the shot list of `v`'s skill (modes.json skills[i].shot) at its deploy, as the client has its effects
   * pooled before a skill fires. Loaded at the first throw, it was ready only after the flight (流星 S2's arrows, 0.3 s; the
   * first load of a prefab and its textures takes longer), and a shot that landed meanwhile is not drawn (spawn `drop`).
   */
  function warmShot(v) {
    const b = bundleOf(v), names = extracted(v, skillBind(v)?.shot);
    if (b && names.length) ensure().then((ok) => (ok ? Promise.all(names.map((n) => lib.load(b.bundle, n))) : null)).catch(() => {});
  }
  const LINE_FX = /_line(_|$)/i;   // char_modes.py LINE_FX: a rope / link of the list, not a projectile
  /** The `_line` of `src`'s running skill's shot list beside its trail `name` (extracted), or null. */
  const shotLine = (src, name) => (skillBind(src)?.shot || []).find((x) => x !== name && LINE_FX.test(x) && bundleOf(src)?.prefabs.includes(x)) ?? null;
  let ropeSeq = 0;
  /**
   * 2026-10-21 (이펙트 연결 전수 ①): a harpoon's rope — the second line component of the skill's projectile (its `_mainEffect`
   * with `_throwEffect`: projectile_chr_glady_s1 glady_skill_01_line, projectile_slchan_s1 / _s2 slchan_skill_0N_line;
   * 溯光星源 S2's link projectile_chr_halo2_s2_link halo2_skill_02_line_01) — from the shooter's muzzle to the flying head of
   * trail record `rec`, then to where it struck for the projectile's `_linkDuration` (1 s) [추정: the component's class is not
   * checked — its fields read as a rope after the head; 溯光星源's link flies at 1000 tiles / s, drawn here with her shot].
   */
  function ropeLine(bundle, name, src, rec, link = 1) {
    if (!camRef) return;
    const at = () => {
      const t = rec.tgt;
      if (rec.k >= 1 && t && t.alive !== false && !t.remove) return [mx(t), t.y, shotTo(t)];
      const k = Math.min(1, rec.k);
      return [rec.x0 + (rec.tx - rec.x0) * k, rec.y0 + (rec.ty - rec.y0) * k, rec.z0 + (rec.tz - rec.z0) * k + (rec.arc ? rec.arc * 4 * k * (1 - k) : 0)];
    };
    const head = { id: `rope:${++ropeSeq}`, alive: true, get x() { return at()[0]; }, get y() { return at()[1]; }, get z() { return at()[2]; } };
    startLine(bundle, name, src, head, rec.dur + link, { sMount: 2, eMount: 7 });
  }
  /**
   * 2026-10-21: the kit events of skills without an attack that shoot their skill's projectile at units — 流星 S2 'volley'
   * { id, targets } (an arrow at each), 崖心 S2 'pull' { src, id } (the harpoon at the enemy it drags): skillShotOut, and the
   * shot's hit (skills[i].shotHit, else its target effects) on each as it lands instead of at the damage of the same moment
   * (the kit sends the event before its damage: pendingHit finds the target taken). true = handled.
   */
  function skillShotFx(e, views) {
    const o = e[4];
    if (!o || typeof o !== 'object' || (e[1] !== 'volley' && e[1] !== 'pull')) return false;
    const src = views.get(e[1] === 'pull' ? o.src : o.id);
    const ids = e[1] === 'pull' ? [o.id] : Array.isArray(o.targets) ? o.targets : [];
    if (!src?._fxSkillOn || !ids.length) return false;
    const sk = skillBind(src), hits = extracted(src, sk?.shotHit?.length ? sk.shotHit : sk?.target);
    let n = 0;
    for (const id of ids) {
      const tgt = views.get(id);
      if (!tgt) continue;
      const dur = skillShotOut(src, tgt, () => { if (hits.length && tgt.alive !== false && !tgt.remove) play(src, 'attackHit', 0, { at: tgt, names: hits, aim: src }); });
      if (dur < 0) continue;
      n++;
      for (const p of pending) if (p.src === src) (p.done ||= new Set()).add(id);   // its hit waits for the landing
    }
    if (!n) return false;
    ownFx.add(e);
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
      addLive(inst, { view: null, owner: null, buff: false, until: clockS + rec.dur + (rec.back || 0) + (def.duration || 2) + 0.5, flight: rec }, layers.over);
      trimLive();
    }, () => {});
  }
  // client projectile_chr_caper_s2 / _s2_1 (EN [uc]projectiles.ab): ParacurveMovement `_raiseHeight` 0.3, `_noRaiseHeightThreshold`
  // 1.3 — the second boomerang `_inverseParacurve` 1 [추정: the inverse curve dips under the straight line by the same height]
  const caperArc = (dist, inverse) => (dist < 1.3 ? 0 : inverse ? -0.3 : 0.3);
  /**
   * 2026-10-10: 跃跃 S2's later boomerang (sim fx 'caperBoomerang2' { id, tgt, n } — no 'atk' of its own, 0.1 s
   * after the attack's) — her S2 mode's trail (projectile_chr_caper_s2_1 `_mainEffect` caper_skill_02_trail) out to its target
   * on the inverse arc and back like the first; the wheel is out of her hand while any is out (render/heldWheel.js counts them).
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
  // the shooter's point where it is at the shot and flies to the target's hit point. Client (official client 2026-10-10):
  // `RangedAttack._GetMountPoint` = the shooter's GetMountPoint(`_mountPointType`) — MUZZLE for 210 attacks,
  // a special point or GROUND for 19 (modes.json `shotFrom` per mode: 로즈몬티스 S2 GROUND, 포덴코 S2 SPECIAL_0, 토가와 사키코
  // SPECIAL_3 …) — and `GetTargetLocatable` the target's hitMountPoint. Ours: that point of the model (fxpoints.js;
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
    // 2026-10-22 (maintainer report: 蕾缪안's S3 shells came in at 45°): a stationary projectile (projectile_chr_lemuen_s3_attack
    // has no mover, `_lifeTime 0.25`) stays on its landing point, unturned — the fall is its _mainEffect's own clip (trail_02
    // node `pos` y 7.27 → 0.31 in 0.27 s under static_offset X −30°, straight down on screen); the old 3-tile drop with the
    // root turned 90° added a second fall across it
    if (rec.still) {
      rec.inst?.object.position.set(rec.x0, rec.y0, 0);
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
   * projectile stops, the client's way (`Effect.FinishMe` on a ProjectileEffect): its first particle system
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
      if (trace) trace({ kind: 'spawn', names: [WOLF.fly], by: o.id, on: null, tag: 'wolf', facing: 1 }); // tests
      w.pending++;   // (a dry layer's never ends: nothing loads)
      if (dry) { dryFollow(WOLF.bundle, WOLF.fly, o.id, null); continue; }
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
  // 2026-10-22 (effect bundle J, official client): her skill's end detaches the funnels — Whitw2Skill3FunnelRangedAttack.
  // OnDetached sets each funnel projectile's `_mainEffect` Animator int 'OnEnd' = 1 (the trail's
  // s3_idle → s3_end01) and the projectiles stop (FinishMe: gone its `_delayToFinish` 0.35 s later); `fade` false (she
  // left the field): they are already gone with her
  /**
   * 2026-10-22 (effect bundle J): kit fx 'buffProgress' { id, key, r } — the remaining share `r` of operator `id`'s buff `key`
   * (纯烬艾雅法拉 S2's barrier agoat2_s_2[shield]: what it can still absorb ÷ its pool), which her effects' BuffProgressFloatSource
   * reads every frame (fx_extract.py `animSrc` → FxInstance.setBuffProgress: the range's level 2 / 1 / 0).
   */
  function buffProgress(o) {
    if (o.id == null || typeof o.key !== 'string') return;
    buffProgressOn(live, o, clockS);
  }
  function endWolves(id, fade = true) {
    const w = wolves.get(id);
    wolves.delete(id);
    if (!fade) return;
    for (const m of w?.list || []) {
      const l = live.find((x) => x.inst === m.inst);
      if (!l || m.inst.stopping) continue;
      m.inst.setParam('OnEnd', 1);
      l.buff = false;   // not ended at once with her loops (stopBuffs)
      const fin = Number(m.inst.def?.finish);
      m.inst.finish();
      l.finishAt = clockS + (fin > 0 ? fin : 0);
    }
  }

  // ---- 丰川祥子's notes (see the header) ----
  const NOTE_Z = 0.35;           // flight height over the ground (tiles)
  const gameRate = () => { try { const r = Number(rate()); return r > 0 ? r : 1; } catch { return 1; } };
  /**
   * Whether her notes play as official effects now — decided as the events come, so the arrow can step aside; under
   * load level 3 only while a skill runs (S1's notes count as one), like the normal-attack effects.
   */
  const notesOn = (src, skill = false) => !!(index && plays && q() !== 'low' && !failed && webp === true && bundleOf(src)
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
    const fx = noteEffects(rec.mode, rec.fan, plays);
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
      const fx = noteEffects(rec.mode, rec.fan, plays), b = src && bundleOf(src);
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
    if (!index?.bundles?.[bundle]?.includes(name)) return null;
    if (trace) trace({ kind: 'spawn', names: [name], by: entry.owner ?? null, on: at && at.info ? ownerOf(at) ?? null : null, tag: entry.tag ?? null, facing }); // tests
    if (dry) dryFollow(bundle, name, entry.owner ?? null, at && at.info ? ownerOf(at) ?? null : null);
    if (!(await ensure())) return null;
    let def = await lib.load(bundle, name);
    const pick = await randomPick(def, bundle, entry.owner != null || !!at?.info);   // 2026-10-22: its random group's pick
    if (pick) def = pick.def;
    if (!mod || !def) return null;
    if (entry.until != null && entry.until <= clockS) return null; // 2026-10-10: its end passed while it loaded
    // 2026-10-23: a shot that landed while it loaded is not drawn (launchTrail's rule) — placed at its end, nothing finished
    // it and it sat on the target for 5 s (流星 S2's first volley: the arrows showed up on the sandbag with their hits)
    if (drop && !trails.includes(drop)) return null;
    if (entry.owner != null && gone.has(entry.owner) && (entry.buff || entry.onCaster)) return null;
    const unit = at && at.info ? at : null;
    const split = !over && splitOn();   // an effect on the ground / a unit splits by sorting at 'high'
    // 2026-10-10: turned along its attacker → target line; 2026-10-11 (maintainer decision 「공식대로」): played with that
    // direction (else `dir`, else ±x by `facing`) and turned as its prefab's `_rotateType` says (play())
    const official = !!def.face;
    if (aim && !official) facing = aimFacing(null, def, aim, at);
    const d = aim ? { x: Number(at.x) - Number(aim.x), y: Number(at.y) - Number(aim.y) } : dir;
    const sp = playSpeed(def.face, entry.speed ?? 1, gameRate());
    const inst = new mod.fxp.FxInstance(def, { quality: q(), facing, dir: d, body: unit ? facingDir(unit) : null, speed: sp, split, floor: drop ? null : at.z && !over ? at.z : 0, tilt: drop ? null : tiltOn(unit, def) });
    if (aim && !official) aimAlong(inst, aim, at);
    if (!drop) at = lifted(at, def, !!entry.buff); // local patch: its _spawnLocation
    if (!drop && Number.isFinite(def.height)) at = overHeight(at, def.height); // 2026-10-10: `_overwriteHeight`
    inst.object.position.set(at.x, at.y, at.z || 0);
    // 2026-10-24: a flying shot (`drop`) is moved by stepTrails, not pinned to the point it left (the live loop follows `view`
    // every frame — 流星 S2's arrow sat at her muzzle for the whole flight, maintainer report)
    const e = { view: drop ? null : at, ...entry, speed: sp, backSw: backSwitch(def, unit, bundle), ...(drop ? { flight: drop } : null) };
    if (e.until === undefined) e.until = clockS + (def.duration || 3) + 0.5 + inst.lead / sp;
    if (drop) { drop.inst = inst; placeTrail(drop); }
    const l = addLive(inst, e, over ? layers.over : split ? layers.split : layers.under);
    if (l && def.fly) startFly(l);   // 2026-10-24 (묶음 S5): a FlyToPredefinedLocation prefab played on its own flies too
    trimLive();
    return l;
  }
  // ---- 卫戍协议 template effects (2026-10-11, maintainer decision 17 「넣음」) --------------------------------------------
  // The mode's bond / equipment / band buff templates create effects from their graph nodes (`Nodes.CreateEffect`
  // on a unit, `CreateEffectAtScreenPos` on the screen) once when the node runs — 라테라노 클립 bond_laterano_reload_01,
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
  // A 护盾 layer blocking a hit (sim damage.js absorbShields → fx 'parry' {id, buff}): the client's BlockDamage.Execute
  // plays the buff blackboard's `effect` (GetStringOrDefault, the node's
  // _specifyBlockEffect the default) on the holder, else common_buff_parry_01. Empty in archet_t_2, kalts2_t_2[shield],
  // nearl2_s_2[shield]; 泥岩's layers inherit mudrok_t_1's charpack blackboard `effect` mudrok_buff_01_hit (Talents/1 _buffs
  // [recharge] / [init], whose CreateBuff makes them).
  // 2026-10-23 — what the layer's ON_TAKE_DAMAGE graph creates after its BlockDamage (EN buff templates): 泥岩's three
  // mudrok_t_1[shield_a/b/c] CreateEffect common_heal_hit_01 on her at every block (AFTER_FX; a copy from any bundle that
  // holds it — the prefab is not in hers); “自在”'s layers enemy_xi_s2[shield_normal] / [shield_last] block with
  // _specifyBlockEffect enemy_xi_skill_02_buff_hit, an amount barrier (`dynamic`): only a hit taken whole is cancelled
  // with it (the event's `whole`), and the last layer's break (`broke`: IsBlackboardZero → FinishBuff → CreateEffect)
  // plays enemy_xi_skill_02_buff_03 (BREAK_FX); the enemy 泥岩's enemy_mdrock_s_2 the same with enemy_mdrock_skill_01_buff_hit
  // and enemy_mdrock_skill_buff_05 (sim layers 'ab:rockPower[1..3]'; its artsBarrier's own 'shieldBreak' follows: SHATTERS)
  const PARRY = 'common_buff_parry_01';
  const XI_HIT = ['pfx_enemy_14', 'enemy_xi_skill_02_buff_hit'], ROCK_HIT = ['pfx_enemy_8', 'enemy_mdrock_skill_01_buff_hit'];
  const BLOCK_FX = { 'mudrok:layers': ['mudrok', 'mudrok_buff_01_hit'], 'ab:xiShield[a]': XI_HIT, 'ab:xiShield[b]': XI_HIT, 'ab:xiShield[c]': XI_HIT,
    'ab:rockPower[1]': ROCK_HIT, 'ab:rockPower[2]': ROCK_HIT, 'ab:rockPower[3]': ROCK_HIT };
  const AFTER_FX = { 'mudrok:layers': 'common_heal_hit_01' };
  const BREAK_FX = { 'ab:xiShield[c]': ['pfx_enemy_14', 'enemy_xi_skill_02_buff_03'], 'ab:rockPower[3]': ['pfx_enemy_8', 'enemy_mdrock_skill_buff_05'] };
  const SHATTERS = new Set(['ab:rockPower[3]']);
  const brokeOwn = new Set();   // ids whose barrier break played its official effect this moment
  const anyBundle = (n) => Object.keys(index?.bundles || {}).find((b) => index.bundles[b].includes(n)) || null;
  function parryFx(e, views) {
    const tgt = views?.get?.(e[4]?.id);
    if (!tgt || failed || q() === 'low') return;
    const at = (b, n) => { if (b && index?.bundles?.[b]?.includes(n)) spawn(b, n, tgt, { owner: null, buff: false, on: tgt.id ?? e[4].id, tag: 'parry' }, { over: true, facing: efacing(tgt) }); };
    if (e[4].whole !== 0) {
      const own = BLOCK_FX[e[4].buff];
      at(...(own && index?.bundles?.[own[0]]?.includes(own[1]) ? own : ['common', PARRY]));
      const after = AFTER_FX[e[4].buff];
      if (after) at(anyBundle(after), after);
    }
    // the barrier's own 'shieldBreak' of the same hit (content/enemies/archetypes.js artsBarrier) then draws no 2D shatter
    if (e[4].broke) { const br = BREAK_FX[e[4].buff]; if (br && index?.bundles?.[br[0]]?.includes(br[1])) { at(...br); if (SHATTERS.has(e[4].buff)) brokeOwn.add(e[4].id); } }
  }
  // 2026-10-23: 远眺's death (sim fx 'explode' kind 'expose', content/enemies/fly.js kitExposeOnDeath — killed, not silenced):
  // its talent enemy_hummbd_t ON_OWNER_KILLED, when not SILENCED, CreateEffect enemy_hummbd_die_02 on it, then the
  // CreateBuffInCircleRange the sim plays — instead of the 2D ring. On its body while it is still drawn, else where it fell.
  const EXPOSE_FX = ['pfx_enemy_6', 'enemy_hummbd_die_02'];
  function exposeFx(e, views) {
    if (failed || !index?.bundles?.[EXPOSE_FX[0]]?.includes(EXPOSE_FX[1])) return false;
    const v = views?.get?.(e[4].id);
    const at = v && !v.remove ? v : { x: Number(e[4].x), y: Number(e[4].y), z: 0 };
    spawn(EXPOSE_FX[0], EXPOSE_FX[1], at, { owner: null, buff: false, tag: 'expose', ...(v ? { on: v.id } : {}) }, { over: true, facing: v ? efacing(v) : 1 });
    return true;
  }
  // (2026-10-21) An element burst (sim damage.js resolveBurst → its fx burst {id, element}): the EN buff templates'
  // ep_break_<el>_char / _enemy play one CreateEffect on the BUFF_OWNER at ON_BUFF_START — fire on an enemy
  // common_firedamage_hit (none on an operator: its 灼燃 shows ep_fire_magic_res_down's buff_burn, fxstatus.js), water
  // common_waterElementExplosion / common_waterdamage_hit, dark common_darkdamage_hit on both; 神经 on an operator is
  // ep_break_sanity[epfree]'s overrideEffectKey common_nerve_injury_01_hit, on an enemy palsy[stack] (none) [operator, enemy]
  const BURST_FX = {
    burn: [null, 'common_firedamage_hit'],
    erosion: ['common_waterElementExplosion', 'common_waterdamage_hit'],
    apoptosis: ['common_darkdamage_hit', 'common_darkdamage_hit'],
    neural: ['common_nerve_injury_01_hit', null],
  };
  function burstFx(e, views) {
    const tgt = views?.get?.(e[4]?.id);
    const n = BURST_FX[e[4]?.element]?.[tgt?.info?.side === 'enemy' ? 1 : 0];
    if (!tgt || !n || failed || q() === 'low' || !index?.bundles?.common?.includes(n)) return false;
    spawn('common', n, tgt, { owner: null, buff: false, on: tgt.id ?? e[4].id, tag: 'elemBurst' }, { over: true, facing: efacing(tgt) });
    return true;
  }

  /**
   * A 'dmg' of this moment on `tid` that waiting skill effects claim (expect(); each plays its effect on the target once —
   * 戴菲恩's finisher hit and its last slash's mark come together).
   */
  function pendingHit(tid, views, by = null) {
    while (pending.length && clockS - pending[0].t > PENDING_S) pending.shift();
    const tgt = pending.length ? views.get(tid) : null;
    if (!tgt) return false;
    let claimed = false;
    for (const p of pending) {
      // not another unit's hit of the same moment: an attack on it by someone else, or a target out of the skill's reach
      const a = lastAtk.get(tid);
      if (a && a.src !== p.src && clockS - a.t < 1) continue;
      if (Math.hypot(tgt.x - p.src.x, tgt.y - p.src.y) > PENDING_REACH) continue;
      // (2026-10-21) nor damage on the caster's side (an enemy's hit on an operator), nor another operator's — the 'dmg'
      // attacker (6th field) is the caster, its summon (维什戴尔's shade token_10035_wisdel_wward), or none (无来源); the
      // event golden's `- spawn … → ally` lines (埃拉托·Ayer·塑心 …) were these
      if (tgt.info?.side && tgt.info.side === p.src.info?.side) continue;
      if (by != null && by !== (p.src.id ?? p.src.info?.id) && views.get(by)?.info?.kind === 'op') continue;
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
  const cabinMarks = new Map(); // 克莱门莎 id → her carriage mark (_mark_01 / _mark_02): its spawn promise
  /** End 克莱门莎's carriage mark (a buff's effect: FinishMe, its own finish) and put `name` on her until `until`. */
  function cabinMark(v, b, name, until) {
    const id = v ? ownerOf(v) : null;
    if (id == null) return;
    const prev = cabinMarks.get(id);
    cabinMarks.delete(id);
    if (prev) prev.then((l) => { if (l) l.inst.stop(); });
    const n = name ? pickName(b, name) : null;
    if (n && until > clockS) cabinMarks.set(id, spawn(b.bundle, n, v, { owner: id, buff: true, until, tag: 'cabinMark' }));
  }
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
        // (2026-10-21) clemnt_s2[emit_projectile]'s start puts [mass_not_full_effect] on her — clemnt_skill_02_mark_01 until the
        // carriage stops (its trigger: FinishBuffsById) or is full ('cabinFull')
        cabinMark(views.get(o.id), b, 'clemnt_skill_02_mark_01', clockS + dur);
        return true;
      }
      // … full: [sync_passenger_info] ends _mark_01 and puts [mass_full_effect] clemnt_skill_02_mark_02 on her until it stops
      case 'cabinFull': {
        const b = pickOf(views.get(o.id), 'clemnt');
        if (!pickName(b, 'clemnt_skill_02_mark_02')) return false;
        ownFx.add(e);
        cabinMark(views.get(o.id), b, 'clemnt_skill_02_mark_02', cabinEnd.get(o.id) ?? clockS);
        return true;
      }
      // …and its vortex where it stopped: projectile_chr_clemnt_s2_range (`_mainEffect` bullet_range_01, on the ground) for the
      // rest of the skill [추정: that projectile is the vortex — no other S2 prefab is a ground ring of water]
      case 'tide': {
        const b = pickOf(views.get(o.id), 'clemnt'), n = pickName(b, 'clemnt_skill_02_bullet_range_01');
        if (!n) return false;
        ownFx.add(e);
        cabinMark(views.get(o.id), b, null, clockS);   // (2026-10-21) the stop ends her mark
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
      // range_heal_01 at an ally (the sim's `ally`); its 'healAoe' of the same moment draws nothing more. (2026-10-21) Landing,
      // it emits the other half (its ProjectileActionBehaviour ON_HIT_OBJECT EmitProjectile, from the projectile): the
      // damage shot projectile_chr_kalts2_s2_sub_heal, the heal shot _sub_dmg — 0.4 s projectiles whose
      // `_effectsToTargetWhenStart` play there: indicator_damage_01 + range_heal_01_delay / indicator_heal_01 +
      // range_damage_01_delay [추정: the sim lands both halves at once, the client the second at the sub projectile's stop]
      case 'aoe': case 'healAoe': {
        const b = pickOf(views.get(o.id), 'kalts2');
        if (!b || (e[1] === 'aoe' && o.skill !== 'kalts2:s2')) return false;
        const heal = !!o.ally || e[1] === 'healAoe';
        const n = pickName(b, heal ? 'kalts2_skill_02_range_heal_01' : 'kalts2_skill_02_range_damage_01');
        if (!n) return false;
        ownFx.add(e);
        if (e[1] !== 'aoe') return true;
        for (const m of [n, ...(heal ? ['kalts2_skill_02_indicator_heal_01', 'kalts2_skill_02_range_damage_01_delay'] : ['kalts2_skill_02_indicator_damage_01', 'kalts2_skill_02_range_heal_01_delay'])]) {
          const k = pickName(b, m);
          if (k) spawn(b.bundle, k, { x, y, z: 0 }, { owner: null, buff: false }, { over: false });
        }
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
          // (2026-10-21) not the ones a trail creates as it finishes (fly_trail_rightAndLeft_01's OnFinishEmitter: fly_end_02)
          for (const n of ['aglna2_skill_02_fly_end_01', 'aglna2_skill_02_fly_end_02', 'aglna2_skill_02_fly_end_03'].map((k) => pickName(b, k)).filter((k) => k && !emittedIn(b.bundle).has(k))) {
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
    const o = e[4], opId = kitOperator(o, e[1]), op = views.get(opId), b = !failed && q() !== 'low' ? bundleOf(op) : null;
    const foe = views.get(o.id)?.info?.side === 'enemy';
    const plan = b && isOp(op) ? kitOfficialPlan(e[1], o, b.bundle, { skill: skillIdx(op), back: faceBack(op), foe, plays }) : null;
    if (!plan) return false;
    if (plan.skillFlag) (op._fxSkillFlags ||= new Set()).add(plan.skillFlag);   // until the skill ends (洛洛's overDrones)
    for (const tag of plan.stop) {
      for (const l of live) if (l.tag === tag && l.owner === opId) l.inst.stop();
      for (const l of elines.values()) if (l.tag === tag && l.owner === opId) l.until = Math.min(l.until, clockS);   // 2026-10-24: its tagged lines
    }
    const x = Number(e[2]), y = Number(e[3]);
    let n = 0, flight = 0;
    const casts = [];
    for (const p of plan.play) {
      const slot = p.slot != null ? `${opId}|${p.slot}` : null;
      if (slot && p.off) { endSlot(slot); continue; }
      const pb = p.bundle ? { bundle: p.bundle, prefabs: index?.bundles?.[p.bundle] || [] } : b;
      const name = pickName(pb, p.n);
      if (!name) continue;
      if (p.cast) { casts.push(name); n++; continue; } // (2026-10-21) the operator's own cast effects, below
      if (slot) {
        const s = slots.get(slot);
        // (2026-10-24, 묶음 S3) a slot play with seconds as `life` lasts that long from its latest play
        const until = typeof p.life === 'number' ? clockS + p.life : null;
        if (s && s.name === name && (s.l ? !s.l.inst.stopping && live.includes(s.l) : !s.done)) { if (s.l && until != null) s.l.until = until; n++; continue; } // kept
        endSlot(slot);
        const onUnit = p.unit != null || (p.on && p.on !== 'point');
        const sv = p.unit != null ? views.get(p.unit) : onUnit ? (p.on === 'op' ? op : views.get(o[p.on])) : null;
        if (onUnit && !sv) continue;
        const rec = { name, l: null, done: false };
        slots.set(slot, rec);
        const pt = sv ? (p.orbit ? orbiter(sv, p.orbit) : sv)
          : Array.isArray(p.at) ? { x: Number(p.at[0]), y: Number(p.at[1]), z: 0 } : { x, y, z: 0 };
        const on = sv ? ownerOf(sv) : undefined;
        spawn(pb.bundle, name, pt, { owner: opId, buff: false, onCaster: true, until, tag: 'slot', on }, { over: !!sv }).then((l) => {
          rec.done = true;
          if (!l) return;
          if (slots.get(slot) === rec) rec.l = l; else l.inst.stop();
        });
        // `ready`: played where an empty slot starts again (a projectile's _coolDownReadyEffectOnProjectilePos)
        const rn = !s && p.ready ? pickName(pb, p.ready) : null;
        if (rn) spawn(pb.bundle, rn, pt, { owner: null, buff: false, on }, { over: !!sv });
        n++;
        continue;
      }
      if (p.line) {
        // (2026-10-24, 묶음 S4) one field naming a list: a line through its units in order (溯光星源 S3's locks)
        const ends = p.line.length === 1 ? [o[p.line[0]]].flat().map((id, i, a) => [id, a[i + 1]]).slice(0, -1)
          : [o[p.line[1]]].flat().map((id) => [o[p.line[0]], id]);
        const meta = p.tag || p.life === 'skill' ? { tag: p.tag ?? null, owner: opId, skill: p.life === 'skill' } : null;
        for (const [a, z] of ends) {
          const from = views.get(a), to = views.get(z);
          if (from && to) { startLine(pb.bundle, name, from, to, p.life === 'once' ? -1 : 1e6, { sMount: 1, eMount: 1 }, meta); n++; }
        }
        continue;
      }
      if (p.harpoon) { flight = Math.max(flight, planHarpoon(pb, name, op, p.harpoon, x, y)); n++; continue; }
      if (p.fly && (p.to || p.from)) { flight = Math.max(flight, planShots(pb, name, op, p, o, x, y, views)); n++; continue; }
      if (p.fly) { // a projectile's `_mainEffect` from the operator to the event's point at `fly` tiles / s, along its flight
        const dur = Math.hypot(x - op.x, y - op.y) / p.fly, z = camRef ? bodyZ(camRef, op, SPAWN_FRAC[2]) - (op.z || 0) : 0.5;
        flight = Math.max(flight, dur);
        spawn(pb.bundle, name, glider(op.x, op.y, x, y, dur, (op.z || 0) + z), { owner: null, buff: false, until: clockS + dur + 5, shotEnd: clockS + dur })
          .then((l) => { if (l) l.inst.object.rotation.set(0, 0, Math.atan2(y - op.y, x - op.x)); });
        n++;
        continue;
      }
      // (2026-10-21) `unit`: one unit by its id; an `on` field holding a list: each of its units
      const vs = p.unit != null ? [views.get(p.unit)] : p.on === 'op' ? [op] : p.on === 'point' ? [null] : [o[p.on]].flat().map((id) => views.get(id));
      const endName = p.life === 'unit' && p.end ? pickName(pb, p.end) : null;
      for (const v of vs) {
        if (p.on !== 'point' && !v) continue;
        const at = v && p.orbit ? orbiter(v, p.orbit) : v || (Array.isArray(p.at) ? { x: Number(p.at[0]), y: Number(p.at[1]), z: 0 } : { x, y, z: 0 });
        const on = v ? ownerOf(v) : undefined;
        // (2026-10-24, 묶음 S8) a skill-long play may carry a `tag` a later plan's `stop` ends (海霓 S2's stages)
        const entry = p.life === 'skill' ? { owner: opId, buff: true, until: null, on, ...(p.tag ? { tag: p.tag } : {}) }
          : p.life === 'deployed' ? { owner: opId, buff: false, onCaster: true, until: null, on }
            : p.life === 'tag' ? { owner: opId, buff: false, onCaster: !!p.leave, until: null, tag: p.tag, on }
              : p.life === 'unit' ? { owner: null, buff: false, until: null, on }
                : typeof p.life === 'number' ? { owner: null, buff: false, until: clockS + p.life, on }
                  : { owner: null, buff: false, on };
        const go = () => spawn(pb.bundle, name, at, entry, { over: p.on !== 'point', facing: v ? efacing(v) : 1 });
        if (p.after === 'fly' && flight > 0) castsDelayed.push({ t: clockS + flight, run: go }); else go();
        // (2026-10-21) its end effect where the unit stands as it goes ('die': unitEndFx)
        if (endName && on != null) { const l = unitEnds.get(on) || []; l.push({ bundle: pb.bundle, name: endName }); unitEnds.set(on, l); }
        n++;
      }
    }
    if (casts.length) play(op, 'skillStart', 0, { names: casts });
    if (!n || plan.pass) return false;
    ownFx.add(e);
    return true;
  }
  /**
   * (2026-10-24, 묶음 S3) the official effect moments a 'dmg' (9th field) / 'heal' (5th) names — [[key, owner, life?], …]
   * (server/sim/damage.js fxField): each is the kit event 'hit' { k, src: owner, id: the unit hit / healed, by, life, fly: 1
   * when that unit flies (묶음 S6) } of render/fx/kitofficial.js, executed as its other plans are.
   */
  function hitMoments(list, tid, by, views) {
    const t = views.get(tid);
    if (!t) return;
    for (const m of list) {
      if (!Array.isArray(m) || typeof m[0] !== 'string') continue;
      officialKitFx(['fx', 'hit', t.x, t.y, { k: m[0], src: m[1], id: tid, by, life: m[2], fly: t.flying ? 1 : 0 }], views);
    }
  }
  /**
   * 2026-10-21 (이펙트 연결 전수 ①): a plan's projectile flights (render/fx/kitofficial.js `fly` with `to` / `from`) on trail
   * records (stepTrails flies them, followed targets): from the operator's muzzle to each unit of the event's field `p.to`
   * (`gap` s apart — 琳琅诗怀雅 S3's coins, RandomGold `_triggerDelta`), or (`from: 'point'`) from the event's point back to
   * the operator (伊内丝 S3's recalled 影哨). On landing `hit` plays on its unit; `rope` runs from the operator to the head
   * (ropeLine — the guard_back projectile's line, `_useEndPointAsStartPos`); `pass` { n, on } plays on each unit of the
   * event's field `on` as the head passes it (its projection on the flight). The longest flight's time (s).
   */
  function planShots(pb, name, op, p, o, x, y, views) {
    const speed = Number(p.fly) > 0 ? Number(p.fly) : 10;
    const hits = (Array.isArray(p.hit) ? p.hit : []).map((h) => pickName(pb, h)).filter(Boolean);
    const rope = p.rope ? pickName(pb, p.rope) : null;
    const back = p.from === 'point';
    const tos = back ? [op] : [o[p.to]].flat().map((id) => views.get(id)).filter((u) => u && u.alive !== false && !u.remove);
    let longest = 0;
    tos.forEach((u, k) => {
      const go = () => {
        if (level() >= 3 || trails.length >= MAX_TRAILS || (!back && (u.alive === false || u.remove))) return;
        const from = back ? { x, y, z: shotTo(op) } : shotFrom(op, null);
        const tx = mx(u), ty = u.y, dur = Math.max(0.04, Math.hypot(tx - (back ? x : op.x), ty - (back ? y : op.y)) / speed);
        const rec = { inst: null, tgt: u, x0: from.x, y0: from.y, z0: from.z, tx, ty, tz: shotTo(u), k: 0, dur, arc: 0 };
        trails.push(rec);
        spawn(pb.bundle, name, { x: from.x, y: from.y, z: from.z }, { owner: null, buff: false, until: clockS + dur + 5 }, { drop: rec })
          .then((l) => { if (!l) { const i = trails.indexOf(rec); if (i >= 0) trails.splice(i, 1); } });
        if (rope) ropeLine(pb.bundle, rope, op, rec, 0);
        if (hits.length && !back) castsDelayed.push({ t: clockS + dur, run: () => { if (u.alive !== false && !u.remove) play(op, 'attackHit', 0, { at: u, names: hits, aim: op }); } });
        const pn = p.pass ? pickName(pb, p.pass.n) : null;
        if (pn) {
          const L2 = (tx - from.x) ** 2 + (ty - from.y) ** 2;
          for (const id of [o[p.pass.on]].flat()) {
            const v = views.get(id);
            if (!v) continue;
            const f = L2 > 1e-9 ? Math.max(0, Math.min(1, ((v.x - from.x) * (tx - from.x) + (v.y - from.y) * (ty - from.y)) / L2)) : 0;
            castsDelayed.push({ t: clockS + f * dur, run: () => { if (v.alive !== false && !v.remove) play(op, 'attackHit', 0, { at: v, names: [pn], aim: op }); } });
          }
        }
        return dur;
      };
      const wait = (Number(p.gap) || 0) * k;
      const dur = Math.hypot(mx(u) - (back ? x : op.x), u.y - (back ? y : op.y)) / speed;
      longest = Math.max(longest, wait + dur);
      if (wait > 0) castsDelayed.push({ t: clockS + wait, run: go }); else go();
    });
    return longest;
  }
  /**
   * 2026-10-21: a plan's harpoon (render/fx/kitofficial.js `harpoon` { out, back }: 歌蕾蒂娅 S3's 捕网, projectile_chr_glady_s3_3
   * `_harpoonEffect` glady_skill_03_line — `_firstPartTime` out to the event's point, `_secondPartTime` pulled back): the line
   * from her muzzle to a head that goes out and comes back; `moving` plays on that head from its arrival (`_movingEffectsWhenReached`).
   * The out time (s: the plan's `after: 'fly'` plays at the arrival).
   */
  function planHarpoon(pb, name, op, h, x, y) {
    if (!camRef) return 0;
    const out = Math.max(0.04, Number(h.out) || 0.3), backT = Math.max(0.04, Number(h.back) || 1), t0 = clockS;
    const o0 = shotFrom(op, null);
    const at = () => {
      const t = clockS - t0, k = t < out ? t / out : Math.max(0, 1 - (t - out) / backT);
      return [o0.x + (x - o0.x) * k, o0.y + (y - o0.y) * k, o0.z * (1 - k)];
    };
    const head = { id: `rope:${++ropeSeq}`, alive: true, get x() { return at()[0]; }, get y() { return at()[1]; }, get z() { return at()[2]; } };
    startLine(pb.bundle, name, op, head, out + backT, { sMount: 2, eMount: 7 });
    const mv = h.moving ? pickName(pb, h.moving) : null;
    // 2026-10-23 (maintainer arena check 「歌蕾蒂娅 S3 끝에 작살로 끌어온 회오리가 조금 오래 남음」): ended as the projectile stops, the
    // client's FinishMe (zoneEnd: gone `_delayToFinish` later) — a plain `until` only stopped emitting, and range_04's 10 s
    // particles stayed about 2 s after the head was back
    if (mv) castsDelayed.push({ t: clockS + out, run: () => spawn(pb.bundle, mv, head, { owner: null, buff: false, until: clockS + backT }, { over: false }).then((l) => { if (l) zoneEnd(l, l.until, true); }) });
    return out;
  }
  /**
   * 2026-10-21, official client (이펙트 묶음 D): 凛御银灰 S3's eagle. Each attack of his S3 mode triggers BirdAttack
   * (svash2_s_3[trigger_self]), whose buff svash2_s_3[bird_on_self] fires projectile_chr_svash2_s3_bird_self through
   * `Nodes.Svash2EmitProjectileFixedDirection.Execute`: from him (`_startPositionType` BUFF_OWNER) towards the
   * first enemy of his range_id box (`_GetTargetMountPoint` [추정: the attack's target]) for `emit_count` tiles
   * (none in the blackboard: 3.0) — 10 tiles / s, `_lifeTime` 0.3 s. Its Svash2ProjectileEffectBehaviour (`Init`,
   * `_CreateAlignToProjectileEffect`, `OnProjectileStop`) creates `_effectsAlignToProjectileDirection`
   * svash2_skill_03_trail_02 at the start's foot point, turned along start → target, and finishes it when the projectile
   * stops. (The bird on another operator — BirdAttack_Ally, projectile_chr_svash2_s3_bird: `…WhenDirRight` _trail_right_01
   * when that direction's x > 0, else _trail_left_01 — needs the 战鹰 on a card, which the sim has not.) [추정: at the
   * sim's strike]
   */
  /**
   * 2026-10-21, official client (이펙트 묶음 D; upstream #633): a 秘术师's stored attack energies on its body. modes.json
   * `charge` (char_modes.py charge_effects: the ChargableAttackGroup's MultiChargeUberEffectEmitter) — each store (sim fx
   * 'mysticStore', `n` stored now) casts `cast` and keeps `hold[n − 1]` on the unit (深靛: a star at SpecialPoint 1 / 3 / 4,
   * where that energy's projectile leaves from); the next attack cast on a target (the release, `OnCastOnTarget`) finishes
   * them all, as does its leaving.
   */
  const charges = new Map();   // unit id → the spawn promises of its held charge effects
  function chargeStore(e, views) {
    const o = e[4], v = views.get(o.id), b = bundleOf(v), ch = bindOf(v)?.charge;
    if (!v || !b || !ch || failed || q() === 'low') return false;
    const k = Math.max(1, Number(o.n) || 1) - 1, id = ownerOf(v);
    const cast = extracted(v, ch.cast);
    if (cast.length) play(v, 'attackStart', 0, { names: cast });
    const list = charges.get(id) || [];
    for (const n of extracted(v, Array.isArray(ch.hold) ? ch.hold[k] : null)) {
      list.push(spawn(b.bundle, n, v, { owner: id, buff: false, onCaster: true, until: null, tag: 'charge' }, { over: false, facing: efacing(v) }));
    }
    charges.set(id, list);
    return true;
  }
  function chargeRelease(v) {
    const id = v ? ownerOf(v) : null, list = id != null ? charges.get(id) : null;
    if (!list) return;
    charges.delete(id);
    for (const p of list) p.then((l) => { if (l) l.inst.stop(); });
  }
  const SVASH_BIRD = { bundle: 'svash2', name: 'svash2_skill_03_trail_02', life: 0.3 };
  function svashBird(src, tgt) {
    const b = tgt && src?._fxSkillOn && skillIdx(src) === 2 ? pickOf(src, SVASH_BIRD.bundle) : null;
    const n = pickName(b, SVASH_BIRD.name);
    if (!n || level() >= 3) return;
    const dx = mx(tgt) - mx(src), dy = tgt.y - src.y, d = Math.hypot(dx, dy);
    if (!(d > 1e-6)) return;
    const t0 = clockS;
    spawn(b.bundle, n, src, { owner: ownerOf(src), buff: false, tag: 'svashBird' }, { over: false, dir: { x: dx / d, y: dy / d } }).then((l) => {
      if (!l) return;
      l.until = Math.max(clockS, t0 + SVASH_BIRD.life);
      const fin = Number(l.inst.def?.finish);
      l.finishAt = l.until + (fin > 0 ? fin : 0);
    });
  }
  // officialKitFx `slot` plays: `${operator}|${slot}` → { name, l: its live entry once loaded, done: loading finished }
  const slots = new Map();
  // (2026-10-21) officialKitFx 'unit' plays with an `end`: unit id → [{ bundle, name }] played where it stands at its 'die'
  // (a buff template's ON_OWNER_FINISH CreateEffect: 圣聆初雪's frozen protection point thawing, sbell2_tile_defrost)
  const unitEnds = new Map();
  function unitEndFx(id, v) {
    const l = unitEnds.get(id);
    if (!l) return;
    unitEnds.delete(id);
    if (!v || failed || q() === 'low') return;
    for (const x of l) spawn(x.bundle, x.name, { x: v.x, y: v.y, z: v.z || 0 }, { owner: null, buff: false, tag: 'unitEnd' }, { over: false, facing: efacing(v) });
  }
  /** End the effect held in `key` (and one still loading there). */
  function endSlot(key) {
    const s = slots.get(key);
    if (!s) return;
    slots.delete(key);
    if (s.l) s.l.inst.stop();
  }
  /**
   * A point circling unit `v` (a projectile's `_projectileAroundRadius` `r` tiles at `_aroundSpeed` `spd` °/s) at its body
   * height, alive while it is. With `phase` (°) the circle is the unit's own, shared by its orbiters: one of several
   * projectiles spread around it (魔王's motes).
   */
  function orbiter(v, { r, spd, phase }) {
    const t0 = phase != null ? (v._fxOrbitT0 ??= clockS) : clockS, w = (spd * Math.PI) / 180, p0 = ((Number(phase) || 0) * Math.PI) / 180;
    const ang = () => w * (clockS - t0) + p0;
    return {
      get x() { return v.x + r * Math.cos(ang()); }, get y() { return v.y + r * Math.sin(ang()); },
      get z() { return camRef ? bodyZ(camRef, v, SPAWN_FRAC[2]) : (v.z || 0) + 0.5; }, get alive() { return v.alive !== false && !v.remove; },
    };
  }
  // ---- 驭械术师 drones (2026-10-16, 이펙트 연결 전수 묶음 3, docs/rules/fx.md 「驭械术师 드론」) -------------------------------------
  // modes.json `funnels[mode]` (char_modes.py funnel_entries): client FunnelEffectEmitter.OnEvent — the idle
  // loops while the mode is attached (its `back` copy while she faces back: the SwitchableBackEffect swap, stepBackSwitches),
  // paused from the attack's cast start with its `hide` effect (`off`: hidden too) and resumed with its `show` effect at the
  // attack's finish (`wait`: when the drone's projectile ends); a Default mode without emitters keeps its drone buff's look
  // (`idle` alone). Each attack also flies a drone's projectile (`trail` from its mount point `from`, `hit` on arrival) —
  // the sim's one 'atk' of a 驭械术师 stands for her shot and the drone's. The hide at the 'atk' (2026-10-21, official client):
  // the drone's ON_CAST_START is its own ability's, which her attack casts from its DoCastOnTargets — after her shot, at
  // her strike (MultiFunnelsNormalAttack / MultiFunnelRemoteAttack: RangedAttack.DoCastOnTargets,
  // then CastToTarget of each active `_funnelActions`). [추정: the show 0.2 s after the shot unless `wait` (no drone with a
  // hide lacks it today); a projectile without `speed` at 10 tiles / s]
  // An `attach` projectile does not fly (AttachToTarget): it hits at once and ends `delay` s later (荒芜拉普兰德's normal
  // attack: her drone comes back 0.5 s after its bite). A `lock` one stays on its target (耶拉 / 洛洛 S2, 荒芜拉普兰德 S1 / S2):
  // its drone hides once, every attack on that target is a hit only, and it comes back when the target is gone (droneLock);
  // its hits end with it (`_clearHitEffectOnStop`). Each hit takes the next of `seq` (`overSeq` while 洛洛 overloads: the
  // kit plan's skillFlag 'overDrones').
  const funnelsOf = (v, n) => { const f = bindOf(v)?.funnels?.[n]; return Array.isArray(f) ? f : []; };
  const funnelMode = (v) => { const m = v._fxSkillOn ? modeNow(v) : 0; return Number.isInteger(m) && m >= 0 ? m : 0; };
  /** Whether `list` are 荒芜拉普兰德's normal-attack drones (her Default / S1 modes: idle ones; S2's lock their targets one each). */
  const wolfPair = (v, list) => fxBundleOf(v.info?.spine || v.info?.defId) === 'whitw2' && list.some((x) => x.idle?.length);
  /** How many of a mode's drones act: 荒芜拉普兰德's 1 + S1's passive 浮游单元+1 + 头狼 stage 3 (the sim's profile.hits); every one
   * otherwise. (2026-10-21, official client) the client's MultiFunnelsNormalAttack.UpdateActiveCntIfAdded: min(the
   * `_funnelActions` count, 1 + blackboard `cnt` (M0_1 / S1 attack@cnt 0) + MultiFunnelExtraActiveCntAbility's count by ability
   * name) — AddFunnelAbilityActiveCnt +1 from whitw2_s1[passive] (M0 / M1) and whitw2_t[extra_ability]'s third trigger (M0–M2,
   * WolvesDispersed). */
  function funnelCount(v, list) {
    if (!wolfPair(v, list)) return list.length;
    return Math.min(list.length, 1 + (skillIdx(v) === 0 ? 1 : 0) + ((v._fxAlpha | 0) >= 3 ? 1 : 0));
  }
  /** Start the idle drones of `v`'s mode now (after its deploy, a skill's on / off, a count change); `force` restarts them. */
  function droneIdle(v, force = false) {
    const b = bundleOf(v), id = ownerOf(v);
    if (!b || failed || q() === 'low') return;
    const n = funnelMode(v), list = funnelsOf(v, n), k = funnelCount(v, list), key = `${n}|${k}`;
    if (!force && v._fxDrone?.key === key) return;
    for (const l of live) if (l.tag === 'drone' && l.owner === id) { l.inst.stop(true); if (l.backSw?.entry) l.backSw.entry.inst.stop(true); }
    const rec = { key, n, k, ls: list.map(() => []), locks: new Map(), seq: new Map() };
    v._fxDrone = rec;
    list.slice(0, k).forEach((x, j) => (x.idle || []).forEach((name, m) => {
      if (!b.prefabs.includes(name)) return;
      spawn(b.bundle, name, v, { owner: id, buff: false, onCaster: true, until: null, tag: 'drone', pinned: true }, { over: false, facing: efacing(v) }).then((l) => {
        if (!l) return;
        if (v._fxDrone !== rec) { l.inst.stop(true); return; }
        const back = x.back?.[m];
        if (back && !l.backSw) l.backSw = { name: back, bundle: b.bundle, unit: v, on: false, entry: null };
        rec.ls[j].push(l);
      });
    }));
  }
  /**
   * Pause (`on`) or resume drone `j`'s idle loops (and their back copies). Paused is hidden too (2026-10-21, user report 「쉐라 S2
   * 드론이 그녀에게 그림처럼 고정」): the client's pause (`ParticleEffect.OnPausedUpdated`) switches off the
   * GameObject of the effect's main particle system, and every drone idle prefab (耶拉 F / B / default, 洛洛, 至简, 荒芜拉普兰德)
   * draws all it has under that node (`mainPs` 2 `fixed` / 4 `wolf (1)`) — as `_setActiveFalseWhenPause` (`off`) does
   * with the whole effect; ours froze 耶拉's on her (`off` unset) while the lock's hit effect flew her drone at the target.
   */
  function holdDrone(rec, j, on) {
    for (const l of rec.ls[j] || []) {
      for (const x of [l, l.backSw?.entry]) {
        if (!x || x.inst.stopping) continue;
        x.held = on;
        x.offHeld = on;
        x.inst.object.visible = !on && !(x === l && l.hidden);
      }
    }
  }
  /**
   * 2026-10-21 (user report: 쉐라 S2's second drone stayed on her): the operators whose kit sends each locked drone's hit
   * ('fx' 'drone' at its target, kits chess_char_3_20-kjera / chess_char_4_03-kjera / chess_char_2_10-rockr) — their lock
   * drones follow those events, one per drone (the client's Funnel_0 / Funnel_1 lock a target each, `_alwaysIncludeTarget`:
   * both on a lone enemy), not her body's attacks, which locked one drone only.
   */
  const LOCK_BY_FX = new Set(['kjera', 'rockr']);
  const lockByFx = (v) => LOCK_BY_FX.has(fxBundleOf(v?.info?.spine || v?.info?.defId));
  /**
   * 2026-10-23: 荒芜拉普兰德 S2 (client `M2FunnelRemoteAttack`: her own shot, then the drones on their own selectors) — the
   * sim lists an attack's body target first, then one per drone lock (kits chess_char_6_18-whitw2): the first 'atk' of the
   * moment draws her shot only, the others their lock drone only. 'body' | 'drone' | null (every other attack: both).
   */
  const BODY_FIRST = new Map([['whitw2', 'S2']]);
  function atkPart(v, mode) {
    const m = BODY_FIRST.get(fxBundleOf(v?.info?.spine || v?.info?.defId));
    if (!m || bindOf(v)?.modes?.[mode] !== m) return null;
    const at = v._fxAtkAt?.t === clockS ? v._fxAtkAt : (v._fxAtkAt = { t: clockS, n: 0 });
    return at.n++ === 0 ? 'body' : 'drone';
  }
  /**
   * An attack of `src` on `tgt` in `mode`: its drones' hide / shot / hit / show. `only`: 'lock' — the lock drones (a kit's
   * 'drone' event), 'free' — the others (her attack, when lockByFx).
   */
  function droneShot(src, tgt, mode, only = null) {
    if (!tgt || level() >= 3 || failed) return;
    const b = bundleOf(src), id = ownerOf(src), tid = ownerOf(tgt);
    const n = Number.isInteger(mode) && mode >= 0 ? mode : funnelMode(src), list = funnelsOf(src, n);
    const shots = list.map((x, j) => [x, j]).filter(([x]) => x.proj && (!only || (only === 'lock') === !!x.lock));
    if (!b || !shots.length) return;
    const k = Math.min(shots.length, funnelCount(src, list));
    // the attacks of one moment take the next drones (耶拉 S2's two locks, 荒芜拉普兰德 S2's); her normal attack strikes with
    // every active drone at once (the sim's `hits`)
    const at = src._fxDroneAt?.t === clockS ? src._fxDroneAt : (src._fxDroneAt = { t: clockS, i: 0, used: new Set() });
    const count = wolfPair(src, list) ? k : 1;
    const rec = src._fxDrone?.n === n ? src._fxDrone : null;
    const has = (nm) => b.prefabs.includes(nm);
    for (let c = 0; c < count; c++) {
      let [x, j] = shots[at.i++ % k];
      if (x.lock && rec) {
        // a lock: the drone already on this target, else a free one, else the next (not one this moment took already)
        const free = shots.slice(0, k).filter(([, i]) => !at.used.has(i));
        const pick = free.find(([, i]) => rec.locks.get(i)?.tid === tid) || free.find(([, i]) => !rec.locks.has(i));
        if (pick) [x, j] = pick;
      }
      at.used.add(j);
      const from = droneFrom(src, x.from), to = { x: mx(tgt), y: tgt.y, z: shotTo(tgt) };
      const dur = x.attach ? 0 : Math.hypot(to.x - from.x, to.y - from.y) / (x.speed > 0 ? x.speed : 10);
      const idleNow = rec && j < rec.k && x.idle?.length;   // a drone of the mode now, shown idle
      const held = x.lock && rec?.locks.get(j)?.tid === tid;
      if (x.lock && rec && !held) droneLock(src, rec, x, j, tgt, tid, idleNow);
      else if (!x.lock && idleNow) {
        for (const nm of (x.hide || []).filter(has)) spawn(b.bundle, nm, src, { owner: null, buff: false, on: id }, { over: false, facing: efacing(src) });
        holdDrone(rec, j, true);
        const back = x.attach ? Number(x.delay) || 0 : x.wait ? dur : 0.2;
        castsDelayed.push({ t: clockS + back, run: () => { if (src._fxDrone === rec) droneBack(src, rec, x, j); } });
      }
      const trail = !x.attach && (x.trail || []).find(has);
      if (trail) {
        spawn(b.bundle, trail, glider(from.x, from.y, to.x, to.y, dur, from.z), { owner: null, buff: false, until: clockS + dur + 5, shotEnd: clockS + dur })
          .then((l) => { if (l) l.inst.object.rotation.set(0, 0, Math.atan2(to.y - from.y, to.x - from.x)); });
      }
      const groups = (src._fxSkillFlags?.has('overDrones') && x.overSeq) || x.seq;
      const g = groups ? (rec?.seq.get(j) ?? 0) % groups.length : 0;
      if (groups && rec) rec.seq.set(j, g + 1);
      const hits = [...(x.hit || []), ...(groups ? groups[g] : [])].filter(has);
      // a lock's hits are its projectile's: ended with it (its target's 'die', the skill's end: stopBuffs, a re-lock)
      const entry = x.lock ? { owner: id, buff: true, on: tid, tag: `droneHit:${j}`, until: null } : { owner: null, buff: false };
      const hit = () => { if (tgt.alive !== false && !tgt.remove) for (const nm of hits) spawn(b.bundle, nm, tgt, entry); };
      if (hits.length) { if (dur > 0) castsDelayed.push({ t: clockS + dur, run: hit }); else hit(); }
    }
  }
  /** A kit's locked-drone hit ('fx' 'drone' [x, y] at its target, lockByFx): the next lock drone of this moment on the enemy there. */
  function lockDroneFx(e, views) {
    const src = views.get(e[4].id);
    if (!src || !lockByFx(src) || !src._fxSkillOn || !bundleOf(src)) return false;
    const x = Number(e[2]), y = Number(e[3]);
    let tgt = null, best = 0.6;
    for (const v of views.values()) {
      if (v?.info?.side !== 'enemy' || v.alive === false || v.remove) continue;
      const d = Math.hypot(Number(v.x) - x, Number(v.y) - y);
      if (d < best) { best = d; tgt = v; }
    }
    if (!tgt) return false;
    ownFx.add(e);
    droneShot(src, tgt, modeNow(src), 'lock');
    return true;
  }
  /** Drone `j` locks `tgt`: the one it held comes back first; it hides once and comes back when `tgt` is gone. */
  function droneLock(src, rec, x, j, tgt, tid, idleNow) {
    const b = bundleOf(src), id = ownerOf(src);
    if (rec.locks.has(j)) droneBack(src, rec, x, j);
    const lk = { tid };
    rec.locks.set(j, lk);
    if (idleNow) {
      for (const nm of (x.hide || []).filter((s) => b.prefabs.includes(s))) spawn(b.bundle, nm, src, { owner: null, buff: false, on: id }, { over: false, facing: efacing(src) });
      holdDrone(rec, j, true);
    }
    const watch = () => {
      if (src._fxDrone !== rec || rec.locks.get(j) !== lk) return;
      if (tgt.alive === false || tgt.remove) droneBack(src, rec, x, j);
      else castsDelayed.push({ t: clockS + 0.1, run: watch });
    };
    castsDelayed.push({ t: clockS + 0.1, run: watch });
  }
  /** Drone `j` comes back: its lock (and that lock's hits) ends, its idle loops resume with its `show` effect. */
  function droneBack(src, rec, x, j) {
    const b = bundleOf(src), id = ownerOf(src);
    if (rec.locks.delete(j)) for (const l of live) if (l.tag === `droneHit:${j}` && l.owner === id) l.inst.stop();
    if (!(j < rec.k && x.idle?.length) || !b) return;
    holdDrone(rec, j, false);
    for (const nm of (x.show || []).filter((s) => b.prefabs.includes(s))) spawn(b.bundle, nm, src, { owner: null, buff: false, on: id }, { over: false, facing: efacing(src) });
  }
  /** Where a drone's projectile leaves (its ability's `_mountPointType`: the drone's special point), else her muzzle. */
  function droneFrom(src, mp) {
    const key = Number.isInteger(mp) ? pointKey(mountSpawn({ type: mp })) : null;
    const p = (key && specialPoint(src, shotAt, key)) || specialPoint(src, shotAt, 'muzzle');
    return p ? { x: p.x, y: p.y, z: p.z } : { x: mx(src), y: src.y, z: bodyZ(camRef, src, SHOT_HEIGHT.launch) };
  }

  // ---- 伺夜's wolf pack (2026-10-16, 이펙트 연결 전수 묶음 3, docs/rules/fx.md 「伺夜 늑대 무리」) ---------------------------------
  // The token prefab token_10028_vigil_wolf (pkgrps/btl_pfb_tokens_0) and its buff templates draw the pack's other wolves as
  // effects beside the model: vigil_wolf_t_1_enhance[holder] — the first extra wolf vigil_token_sub_start_1, the second _2
  // (INFINITY); a lost one (vigil_wolf_t_1[listener] ON_TAKE_DAMAGE / 41) vigil_token_sub_die_2 or _1; the last one
  // (ON_BEFORE_TRY_SET_HP_ZERO) vigil_token_die and its Recharge mode (vigil_wolf_t_1[trigger] vigil_token_ghost) — the
  // sim's 战术点形态 — until its vigil_wolf_switch cast vigil_token_start; [block_cnt] vigil_token_buff_1–4 on its head / body /
  // hands (SPECIAL_0–3) while it stands. Its bite (vigil_wolf_hit_effect): _hit_1 / _2 / _3 by its extra wolves, _extra with
  // 伺夜 S2's gift (vigil_wolf_s_2: vigil_token_skill_02_hint at the cast, _ready until that bite); the extra wolves' cast
  // (_vigilWolfCastEffects) vigil_token_sub_attack_1 / _2; S1 ③'s heal and S2's (at the gifted bite: vigil_wolf_s_2
  // ON_ABILITY_CAST_ON_TARGET) vigil_token_heal. The count comes with the sim's 'summon' / 'revive' / 'wolfShadow' /
  // 'wolfShadowLost' / 'wolfCount' (a board piece's first, 2026-10-21) (`wolves` / `n`); its 战术点 ghost stays at the tile it
  // fell on until it comes back or 'wolfTacEnd' (伺夜 left: the Recharge mode leaves with the token) — 40 s at most otherwise
  const PACK = 'token_10028_vigil_wolf', PACK_FX = 'vigil';
  const isPack = (v) => !!(v?.info && (v.info.defId === PACK || v.info.spine === PACK));
  const packOn = () => !!(index?.bundles?.[PACK_FX]?.includes('vigil_token_sub_start_1') && q() !== 'low' && !failed);
  const packs = new Map();   // wolf id → { n, subs: [live|null, live|null], ghost, ready, tac }
  const packOf = (id) => { let p = packs.get(id); if (!p) packs.set(id, (p = { n: 2, subs: [null, null], ghost: null, ready: null, tac: false })); return p; };
  /** `facing`: for a point `at` (no view), the wolf's facing (2026-10-21: vigil_token_die is FLIP_TWO_SIDE). */
  function packFx(name, at, entry, facing = at?.info ? efacing(at) : 1) {
    return index?.bundles?.[PACK_FX]?.includes(name) ? spawn(PACK_FX, name, at, entry, { over: false, facing }) : Promise.resolve(null);
  }
  /** Its extra wolves for `n` wolves now (the standing view `v`); `lost`: the one gone plays its sub_die. */
  function packSubs(id, v, n, lost) {
    const p = packOf(id), want = Math.max(0, Math.min(2, n - 1));
    for (let k = 1; k >= 0; k--) {
      const on = k < want;
      if (!on && p.subs[k]) {
        p.subs[k].then((l) => l?.inst.stop());
        p.subs[k] = null;
        if (lost && v) packFx(`vigil_token_sub_die_${k + 1}`, v, { owner: null, buff: false });
      }
      if (on && !p.subs[k] && v) {
        p.subsT = clockS;
        p.subs[k] = packFx(`vigil_token_sub_start_${k + 1}`, v, { owner: id, buff: false, onCaster: true, until: null, tag: 'pack' });
      }
    }
  }
  /** Its deploy at clock `t` (flushDeploys): the decorations, the extra wolves, back from the 战术点形态. */
  function packDeploy(v, id, t) {
    if (!packOn()) return;
    const p = packOf(id);
    if (p.ghost) { p.ghost.then((l) => l?.inst.stop()); p.ghost = null; }
    if (p.tac) { p.tac = false; packFx('vigil_token_start', v, { owner: null, buff: false }); }
    if (!(p.subsT >= t)) p.subs = [null, null];   // (extra wolves its 'summon' started since are this deployment's)
    for (let k = 1; k <= 4; k++) packFx(`vigil_token_buff_${k}`, v, { owner: id, buff: false, onCaster: true, until: null, tag: 'pack' });
    packSubs(id, v, p.n, false);
    if (p.readyOn) p.ready = packFx('vigil_token_skill_02_ready', v, { owner: id, buff: false, onCaster: true, until: null, tag: 'pack' });
  }
  /** A pack event (its count / its gift); true when drawn here. */
  function packEvent(e, views) {
    const o = e[4];
    if (!o || o.id == null || !packOn()) return false;
    const v = views.get(o.id);
    if (e[1] === 'buff') {
      if (o.skill !== 'vigil_2' || !isPack(v)) return false;
      const p = packOf(o.id);
      packFx('vigil_token_skill_02_hint', v, { owner: null, buff: false });
      if (!p.readyOn) p.ready = packFx('vigil_token_skill_02_ready', v, { owner: o.id, buff: false, onCaster: true, until: null, tag: 'pack' });
      p.readyOn = true;
      return true;
    }
    if (e[1] === 'wolfTacEnd') {   // 2026-10-21: its 战术点形态 ends without a return (伺夜 left)
      const p = packs.get(o.id);
      if (!p) return true;
      if (p.ghost) { p.ghost.then((l) => l?.inst.stop()); p.ghost = null; }
      p.tac = false;
      return true;
    }
    const n = Number(o.wolves ?? o.n);
    if (!Number.isFinite(n) || !(isPack(v) || e[1] === 'wolfShadowLost')) return false;
    const p = packOf(o.id), was = p.n;
    p.n = n;
    if (n === 0) {   // its 战术点形态
      p.tac = true;
      for (let k = 0; k < 2; k++) if (p.subs[k]) { p.subs[k].then((l) => l?.inst.stop()); p.subs[k] = null; }
      const at = { x: Number(e[2]), y: Number(e[3]), z: v?.z || 0 }, f = v?.info ? efacing(v) : 1;   // (the place it fell on, as the wolf faced)
      packFx('vigil_token_die', at, { owner: null, buff: false }, f);
      if (!p.ghost) p.ghost = packFx('vigil_token_ghost', at, { owner: null, buff: false, until: clockS + 40, tag: 'pack' }, f);
      return true;
    }
    if (v && v.alive !== false) {
      packSubs(o.id, v, n, n < was);
      if (e[1] === 'revive' && o.src != null && n === was) packFx('vigil_token_heal', v, { owner: null, buff: false });   // 伺夜 S1 ③
    }
    return e[1] !== 'summon';   // (a summon keeps the rest: the token's deploy effect)
  }
  /** A bite of the pack on `tgt`: the extra wolves' casts, its hit by their number, S2's gift. */
  function packAtk(v, tgt) {
    if (!packOn()) return;
    const id = ownerOf(v), p = packOf(id), extra = Math.max(0, Math.min(2, p.n - 1));
    for (let k = 1; k <= extra; k++) packFx(`vigil_token_sub_attack_${k}`, v, { owner: null, buff: false });
    if (!tgt) return;
    packFx(`vigil_token_attack_hit_${extra + 1}`, tgt, { owner: null, buff: false });
    if (p.readyOn) {
      p.readyOn = false;
      packFx('vigil_token_attack_hit_extra', tgt, { owner: null, buff: false });
      packFx('vigil_token_heal', v, { owner: null, buff: false });   // 2026-10-21: the gift heals on this bite
      if (p.ready) { p.ready.then((l) => l?.inst.stop()); p.ready = null; }
    }
  }

  /** Kit 'fx' events drawn with official prefabs; true = handled here (ownFx: render/fx.js skips its stand-in). */
  function kitFx(e, views) {
    const o = e[4];
    if (!o || typeof o !== 'object') return false;
    if (pickFx(e, views)) return true;
    if (officialKitFx(e, views)) return true;
    if (e[1] === 'yanyouFlame' && ebreathFx(e, views)) return true;   // 2026-10-23: 炎佑's 祛恶之焰 (ebreathFx)
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
    // (its _extraBuffsInTheEnd) until that target's shell lands; each shell (_mainEffect trail_02, played on its point — the
    // prefab falls by itself) ends at the sim's flight time and explodes (_effectsWhenReached hit_01). Her S2 aim (the same 'lock') keeps fx.js's reticle.
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
    if (e[1] === 'bombardShell' && emortarFx(e, views)) return true;   // 2026-10-22: 帝国炮火先兆者's shells (emortarFx)
    if (e[1] === 'bombard' && emortarLand(e)) return true;
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
      const rec = { inst: null, tgt: null, x0: x, y0: y, tx: x, ty: y, k: 0, dur, arc: 0, still: true };
      trails.push(rec);
      spawn(bundleOf(src).bundle, 'lemuen_skill_03_trail_02', { x, y, z: 0 }, { view: null, owner: null, buff: false, until: clockS + dur + 2 }, { drop: rec })
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
  // ---- a hit turned along its attacker → target line (2026-10-10, official client) ----------------------------
  // Client `HitEffectOptions.OnCastOnTarget`: dir = `_useOwnerToTargetDirection` ? target.mapPos − owner.mapPos
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
   * for the owner's facing (char_modes.py `dirs` [{ t, s }]) — client `TryGetEffect` (official client 2026-10-10): 0 NONE slot
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
    'kalts2_skill_02_range_damage_01_delay', 'kalts2_skill_02_range_heal_01_delay',   // (2026-10-21: the follow-up shot's)
    'kalts2_skill_03_teleport_trail_01', 'kalts2_skill_03_teleport_end_01', 'aglna2_skill_02_fly_trail_rightAndLeft_01',
    'aglna2_skill_02_fly_trail_up_01', 'aglna2_skill_02_fly_trail_down_01', 'aglna2_skill_02_fly_range_01', 'aglna2_skill_02_fly_end_01',
    'aglna2_skill_02_fly_end_02', 'aglna2_skill_02_fly_end_03', 'aglna2_skill_03_fly_trail_01', 'aglna2_skill_03_buff_right_01',
    'aglna2_skill_03_buff_left_01',
    // 2026-10-16 (render/fx/kitofficial.js): 卡涅利安's eff_cond buffs by charge, 泥岩 S3's sleep / wake (mudrok_skill_03_buff_02:
    // 2026-10-21, mudrok_skill_03_buff's OnPlayEmitter creates it — stepOnEmit), 新约能天使 S3's shell landing (the `_range`
    // name rule looped it on her)
    'billro_skill_01_buff_01', 'billro_skill_01_buff_01_02', 'billro_skill_01_buff_02', 'billro_skill_02_buff_01',
    'billro_skill_02_buff_01_02', 'billro_skill_02_buff_02', 'billro_skill_03_buff_01_01', 'billro_skill_03_buff_01_01_02',
    'billro_skill_03_buff_01_02', 'billro_skill_03_buff_02_01', 'billro_skill_03_buff_02_02', 'mudrok_skill_03_awake',
    'mudrok_skill_03_awake_02', 'mudrok_skill_03_sleep', 'mudrok_skill_03_range', 'mudrok_skill_03_buff', 'mudrok_skill_03_buff_02',
    'angel2_skill_3_begin_range_01', 'agoat2_skill_02_range_01',
    // 2026-10-23: 灵知 / 流明 S2's charge stages and 灵知's cast range (kitofficial.js 'charges' — the `_buff` / `_range` name
    // rules looped all of them through the instant cast)
    'gnosis_skill_02_buff_01', 'gnosis_skill_02_buff_02', 'gnosis_skill_02_range_01', 'gnosis_skill_02_range_02',
    'lumen_skill_02_buff', 'lumen_skill_02_buff_02',
    // 2026-10-23: 寒芒克洛丝 S2's warmed state (kitofficial.js 'quadShot': at 40 hits) — the S2 mode's attach list and the `_buff`
    // name rule drew buff_01 / _02 from the skill's start, and the event added all three over them
    'kroos2_skill_02_buff_01', 'kroos2_skill_02_buff_02', 'kroos2_skill_02_buff_03',
    // 2026-10-24 (묶음 S2): 塑心 S3's ATK effect is on the ally it lifts (fxstatus.js 'cello:tango:atk'), not hers (the `_buff` rule)
    'cello_skill_03_buff_03',
    // 2026-10-24 (묶음 S7): 圣约送葬人 S3's front buff is SKILL_HELD's, by the deploy facing (its `_back` copy otherwise)
    'excu2_skill_03_buff_01',
    // 2026-10-24 (묶음 S8): 海霓 S2's stage buffs come with her talent's raises (kitofficial.js 'hit'), not at the skill's start
    'haini_skill_02_buff_01', 'haini_skill_02_buff_02']);
  /** What a skill activation plays on the caster (fxmap.js activationEffects: { start, loops }). */
  const activation = (v) => {
    const b = bundleOf(v), em = emittedIn(b.bundle);
    const a = activationEffects(bindOf(v), b.prefabs, skillIdx(v), em.size ? new Set([...KIT_OWNED, ...em]) : KIT_OWNED);
    // 2026-10-24 (묶음 S2): the skill's own template buffs on the operator (fxmap.js SKILL_HELD)
    const held = skillHeld(v?.info?.spine || v?.info?.defId, skillIdx(v), b.prefabs, plays, faceBack(v)).filter((n) => !a.loops.includes(n));
    // 2026-10-24 (묶음 S5): what its template creates once as it starts (fxmap.js SKILL_EDGE `start`)
    const once = skillEdge(v?.info?.spine || v?.info?.defId, skillIdx(v), 'start', b.prefabs, plays).filter((n) => !a.start.includes(n));
    return held.length || once.length ? { start: [...a.start, ...once], loops: [...a.loops, ...held] } : a;
  };
  /**
   * 2026-10-24 (묶음 S5): what a skill's template creates on the operator as it ends (fxmap.js SKILL_EDGE `end`) — 凛御银灰's
   * 战鹰 back on his arm. Created once and kept by its prefab: a loop stays with the operator like its always-on effects
   * (tag 'common': a redeploy's alwaysOn ends it, 'die' too).
   */
  function skillEnd(v, flags = null) {
    const b = bundleOf(v), id = ownerOf(v);
    if (!b || id == null || v.alive === false || failed || q() === 'low') return;
    for (const n of skillEdge(v?.info?.spine || v?.info?.defId, skillIdx(v), 'end', b.prefabs, plays, flags)) {
      spawn(b.bundle, n, v, { owner: id, buff: false, onCaster: true, until: null, tag: 'common', pinned: true }, { over: false, facing: efacing(v) });
    }
  }
  // effects waiting for the damage of this tick: a skill that hits without an attack event (德克萨斯 S2's sword rain on
  // activation, 戴菲恩 S3's slashes / finisher) — the next 'dmg' events of the same moment are its targets
  const pending = [];   // { src view, names, buff, t }
  const PENDING_S = 0.02;
  const PENDING_REACH = 4.5;   // tiles: farther targets are not this skill's (its ranges reach ≤ 4)
  function expect(src, names, buff = false) { if (names.length) pending.push({ src, names, buff, t: clockS }); }

  // ---- cast effects on the attack's own clock (2026-10-10, official client; fxmap.js castTiming) ---------------
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
  const FIXED_FRAME_S = 1 / 30;   // the client's fixed step (AsyncUtil.InvokeNextFixedFrame)
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
    // 2026-10-24 (묶음 S7): its EndAnimEffectEmitter's effects (fxmap.js CAST_END) a fixed frame after the cast's end, unless
    // a new cast began (the client's `isCasting`) or the cast was cut
    const ends = c.end != null && !skip ? castEnd(v?.info?.spine || v?.info?.defId, bindOf(v), mode, bundleOf(v)?.prefabs) : [];
    if (ends.length) castsDelayed.push({ t: c.end + FIXED_FRAME_S, run: () => { if (v._fxCast === c && !c.cut && v.alive !== false) play(v, 'attackStart', 0, { names: ends, tag: 'cast' }); } });
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
      // (2026-10-10, official client) at the ability's playback speed — only the cast effects (CastEffectOptions), the hits at 1.0
      const go = () => { if (v._fxCast === c && v.alive !== false) play(v, 'attackStart', 0, { names: [n], tag: loop ? 'castLoop' : 'cast', until: end, speed: c.speed, cast: c }); };
      const delay = c.first && opt?.d > 0 ? opt.d / c.speed : 0;
      if (delay > 0) castsDelayed.push({ t: clockS + delay, run: go }); else go();
    }
  }

  // ---- input targets, clip variants, looping hits, 麻痹 (2026-10-11, official client, round 2) -------------------
  // InputTargetEffectOptions (modes.json `input`, char_modes.py) is a CastEffectOptions created on the ability's main target
  // instead of the caster (client `InputTargetEffectOptions.CreateEffect`): at its `_startEvent` (4 the
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
   * cast siege2_attack_start_01 / _02): the group of the attack clip its model plays; its extracted cast / hit names. And
   * (2026-10-21) the child of the mode's ability group the attack casts (altFx, fxmap.js altGroup — 迷迭香 Attack_A / _B,
   * 凛御银灰 AttackA / B / C, 仇白's blocked-enemy Combat_A / _B): its own cast / hit / shot-start effects (`start`). And
   * (2026-10-21) the ability cast in place of the mode's attack (fxmap.js modePart): the mode talent of the swing's signal
   * `sig` (寒芒克洛丝's 中的 arrow — `replace`: its cast instead of the attack's), else the per-side child for target `tgt`
   * (凯尔希·思衡托 S2: HealAlly at an ally, AttackEnemy at an enemy; no target: its last one).
   */
  function castGroup(v, mode, sig = null, tgt = null) {
    const bind = bindOf(v);
    const cf = Number.isInteger(mode) && mode >= 0 ? bind?.clipFx?.[mode] : null;
    const af = Number.isInteger(mode) && mode >= 0 ? bind?.altFx?.[mode] : null;
    const t = tgt || lastTarget(v);
    const part = modePart(bind, bundleOf(v)?.prefabs, mode, sig, t?.info?.side ? t.info.side !== 'enemy' : null);
    if (part) return { cast: part.cast, hit: [], start: [], replace: part.replace };
    if (!cf && !af) return null;
    let clip = null;
    try { const a = v.actor, ac = a?._attackClip?.(); clip = ac ? (a._loopOf ? a._loopOf(ac) : ac.loop) : null; } catch { /* none */ }
    const g = cf ? clipGroup(cf, clip, v._fxClipLast ?? -1, Math.random()) : null;
    if (g) v._fxClipLast = g.index;
    const h = af ? altGroup(bind, mode, clip, !!v._fxCombat, v._fxAltLast ?? -1, Math.random()) : null;
    if (h) v._fxAltLast = h.index;
    if (!g && !h) return null;
    return { cast: extracted(v, [...(g?.cast || []), ...(h?.cast || [])]), hit: extracted(v, [...(g?.hit || []), ...(h?.hit || [])]),
      start: extracted(v, h?.start || []) };
  }
  const withGroup = (names, more) => (more?.length ? [...new Set([...names, ...more])] : names);
  /** The cast list of a cast whose own list is `own` and group `g` (castGroup): a `replace` group's alone. */
  const castOf = (own, g) => (g?.replace ? g.cast : withGroup(own, g?.cast));
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
   * `EffectOptions.OnCastFinish` with reason PALSY ends every effect that cast's options made, the one-shots
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
  function boundFor(v, mode, role, kind, combat = !!v._fxCombat) {
    // 2026-10-21: a mode with a COMBAT state ability: its effects on a swing at an enemy it blocks (fxmap.js combatEffects)
    const cs = combatEffects(bindOf(v), bundleOf(v)?.prefabs, mode, role, combat);
    if (cs) return { names: cs, split: true };
    const f = fortressEffects(bindOf(v), bundleOf(v)?.prefabs, mode, role, kind);
    return f ? { names: f, split: true } : { names: mode != null ? bound(v, mode, role) : [], split: false };
  }
  /** A swing starts: the cast effects of ON_CAST_START (the mode's, or the name mapping's attack start without bindings). */
  function swingFx(src, windup, views, kind = null, sig = null, faceId = null) {
    if (!isOp(src) || !bundleOf(src)) return;
    skillByFlag(src, views);
    const mode = modeNow(src);
    const c = beginCast(src, windup, mode);
    c.sig = sig;
    c.group = castGroup(src, mode, sig, faceId != null ? views.get(faceId) : null);
    if (c.skip) return;
    const { names: own, split } = boundFor(src, mode, 'cast', kind);
    const cast = castOf(own, c.group);
    inputFx(src, c, mode, 'swing');
    if (cast.length || split) { playCast(src, c, cast.filter((n) => phaseOf(src, mode, n) === 'swing')); return; }
    // no mode binding: the name mapping's attack start, at the swing like the client's ON_CAST_START majority [추정]
    if (!src._fxSkillOn) play(src, 'attackStart', 0, { tag: 'cast' });
  }
  /**
   * The strike ('atk' on `tgt`): the cast effects of ON_SPELL_ON / ON_SPELL_END; the swing's own when no swing was
   * announced. Its first target is the cast's main target (input-target effects, lastTarget).
   */
  function strikeFx(src, mode, kind = null, tgt = null, sig = null) {
    let c = src._fxCast;
    const same = c && c.mode === mode && clockS <= c.hitAt + SWING_SLACK && (c.struckAt == null || clockS - c.struckAt < 0.03) && (c.sig ?? null) === sig;
    const { names: own, split } = boundFor(src, mode, 'cast', kind);
    if (!same) {   // no 'swing' for this attack: its swing effects now (the moment they had before)
      c = beginCast(src, 0, mode);
      c.sig = sig;
      c.group = castGroup(src, mode, sig, tgt);
      if (!c.skip) {
        const cast = castOf(own, c.group);
        if (cast.length || split) playCast(src, c, cast.filter((n) => phaseOf(src, mode, n) === 'swing'));
        else if (!src._fxSkillOn) play(src, 'attackStart', 0, { tag: 'cast' });
        inputFx(src, c, mode, 'swing', tgt);
      }
    }
    if (c.struckAt != null && clockS - c.struckAt < 0.03) return;   // another target of the same strike
    c.struckAt = clockS;
    if (tgt) src._fxTgt = ownerOf(tgt);
    const cast = castOf(own, c.group);
    if (!c.skip && cast.length) playCast(src, c, cast.filter((n) => phaseOf(src, mode, n) === 'strike'));
    inputFx(src, c, mode, 'strike', tgt);
  }

  /**
   * 2026-10-16: the effects a mode's shot plays on its target as it leaves (modes.json `tgtStart[mode]`, char_modes.py — the
   * projectile's `_effectsToTargetWhenStart`): 银灰's svrash_attack_01_trail, 迷迭香's rosmon_attack_A_hit_01 / S2's
   * rosmon_skill_02_range / S3's rosmon_skill_03_B_hit_01, 溯光星源 S3's halo2_skill_03_trail_01. Before, nothing played them
   * (迷迭香 S2's range looped on her by the `_range` name rule — fxmap.js activationEffects now leaves it to this).
   */
  function shotStartFx(src, tgt, mode, shot = false) {
    const sg = strikeGroups(src, mode, shot);
    // an attack whose strikes shoot projectiles of their own: each one's (strikeGroups `starts`), else the mode's shot's
    let names = sg?.starts ? extracted(src, [...new Set(sg.starts.flat())]) : bound(src, mode, 'tgtStart');
    // (2026-10-21) and the shot of the ability group's child this attack cast (castGroup `start`: 迷迭香 Attack_B's)
    const c = src._fxCast?.mode === mode ? src._fxCast : null;
    if (c?.group?.start?.length) names = [...new Set([...names, ...c.group.start])];
    if (names.length) play(src, 'attackHit', 0, { at: tgt, names, aim: src });
  }

  // ---- a mode buff on enemies (2026-10-10, official client: 아스트젠 더 라이트체이서 S3) -----------------------
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

  // ---- a skill projectile's lasting reach effects (2026-10-10, official client: 쏜즈 더 로드스타) -------------
  // modes.json skills[i].zone (char_modes.py): the client's `EffectBehaviour.OnProjectileReached` creates
  // the projectile's `_effectsWhenReached` where it lands — parented to its body with `_setReachEffectOnProjectile` (S2's
  // drifting alchemy unit), fixed there otherwise (S1, S3) — and, with `_clearReachedEffectWhenStop`, ends them at
  // `OnProjectileStop`; `ScalableAuraHitBehaviour` makes its `_effectKey` under the projectile's body
  // scaled to its range and ends it at the stop. The sim's area of that projectile is its 'zone' fx event (x, y,
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
        zoneEnd(l, until, !rec.aura.has(l));
        if (rec.aura.has(l) && rec.r0 > 0 && r > 0) l.inst.object.scale.setScalar(r / rec.r0);
      }
      return true;
    }
    const at = { x, y, z: 0 };
    const nrec = { at, onProj: !!z.onProj, vx: 0, vy: 0, sx: x, sy: y, st: clockS, until, r0: r, list: [], aura: new Set() };
    if (k) zones.set(k, nrec);
    const bundle = bundleOf(src).bundle;
    const put = () => {
      for (const n of [...fx, ...aura]) {
        spawn(bundle, n, at, { owner: null, buff: false, until: nrec.until }, { over: false }).then((l) => {
          if (!l) return;
          nrec.list.push(l);
          if (aura.includes(n)) nrec.aura.add(l);
          zoneEnd(l, nrec.until, !nrec.aura.has(l));
        });
      }
    };
    // 2026-10-21: a skill without an attack in its window (锡人, 波登可 S2, 引星棘刺) throws its projectile here first — the reach
    // effects play as it lands (OnProjectileReached); one that an attack already carried (号角 S1: takeShot) does not fly again
    const s = src._fxShot;
    const fly = s && (s.t == null || s.t === clockS) ? skillShotOut(src, { x, y, z: 0 }) : -1;
    if (fly >= 0) { s.t = clockS; castsDelayed.push({ t: clockS + fly, run: put }); } else put();
    return true;
  }
  /**
   * A zone effect's end at `until`. A reach effect (`fx`) is finished as the client's `EffectBehaviour.OnProjectileStop`
   * does (→ `Effect.FinishMe`): gone its prefab's `_delayToFinish` later (def.finish; none: at
   * once) — 2026-10-17 (maintainer report 「패신저 S3 이펙트가 스킬이 끝났는데도 안 사라짐」): stopped, pasngr_skill_03_range's
   * cloud (a 50 s particle) kept the whole field on the board for 46 s more. The aura stops emitting at `until`, as before.
   */
  function zoneEnd(l, until, finish) {
    l.until = until;
    if (!finish) return;
    const fin = Number(l.inst.def?.finish);
    l.finishAt = until + (fin > 0 ? fin : 0);
  }
  // ---- a storm's chain strikes (2026-10-16, 异客 S3) -------------------------------------------------------------
  // modes.json skills[i].chain (char_modes.py): projectile_chr_pasngr_s3's chain graphic plays its `_specialHitEffect`
  // (pasngr_skill_03_hit) on the first unit of each strike (`_playSpecialEffectOnFirstOne`) and its `_mainEffect` line
  // (pasngr_attack_line) through the struck units — one line per strike, at their feet (skills[i].chain.hit 0: chainLine
  // below); the projectile's `_effectsWhenHit` (skills[i].target) go on every one. The sim sends each hop as kit fx
  // 'lightning' { id, src, i, from } (i 0: the unit the storm struck). false → render/fx.js's procedural bolt.
  const strikes = new Map();   // operator id → its storm strikes so far (one line each)
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
    if (Number(o.i) === 0) strikes.set(o.src, (strikes.get(o.src) || 0) + 1);
    const from = o.from != null ? views.get(o.from) : null;
    const line = from ? extracted(src, c.line)[0] : null;
    if (line && camRef) chainLine(`storm:${o.src}:${strikes.get(o.src) || 0}`, bundleOf(src).bundle, line, from, tgt, c.hit === 1);
    return true;
  }
  // ---- a chain shot's line (2026-10-16, official client, docs/rules/fx.md 「연쇄 공격」) ------------------------------
  // Client ChainLightningHitBehaviour (DoSelectTargetToHit, OnProjectileReached): the shot reaching
  // its first unit hits every unit of the chain at once — each gets the projectile's `_effectsWhenHit` — and its chain
  // graphic, the projectile's first ChainLightningEffectBehaviour (`get_effect`: GetComponent), draws its
  // `_mainEffect` once (PlayLineEffect): made at the projectile, every LineRenderer of it gets one point per struck
  // unit in order — the shooter is not on it —, set once (they do not follow the units): the unit's hit point
  // (`Entity.hitPoint`) with `_playEffectOnHitPoint`, else its transform's position (modes.json `chainHit[mode]` /
  // skills[i].chain.hit, char_modes.py); the projectile's stop finishes it (OnProjectileStop). The sim sends each
  // bounce as 'atk' [previous unit, next unit, 'chain' | 'chainHeal', null, shooter, the chain's first unit] (ai.js, 溯光星源
  // S1's kit), every bounce of a chain in one moment: they make one line; the next unit's 'dmg' plays the mode's hit
  // effects (lastAtk). Before, a bounce went down the attack path of its previous unit — an enemy's own attack cast effects
  // (estrikeFx), a healed ally's (strikeFx) —, render/fx.js drew a purple beam for it (now only without the line:
  // arrowKind), and then (0a7c6f4d) one line per bounce from hit point to hit point, following the units.
  const CHAIN_KINDS = new Set(['chain', 'chainHeal']);
  const CHAIN_LINE_S = 0.5;     // the line's `_delayToFinish` after the projectile stops [추정: as startLine's]
  const aimed = new Map();      // `${shooter}:${target}` → { t, mode }: its last attack at that unit (the chain it starts)
  const chainLines = new Map(); // `${shooter}:${first unit}` (or the storm strike's) → { t, pts, l }: the line of a chain now
  const chainAtks = new WeakSet(); // bounce 'atk' tuples drawn here (arrowKind)
  /** A struck unit's point on a chain's line: its hit point, or where its entity stands (`transform.position`). */
  function chainPoint(v, hit) {
    if (hit) return elinePoint(v, 1, { x: 0, y: 0, z: 0 });
    // [추정: a flying enemy's / lifted operator's entity stays on its tile — the client raises its graphic holder]
    return { x: ex(v), y: ey(v), z: Number(v.z) || 0 };
  }
  /** Chain `key`'s line through `from` (its first unit, for a new chain) and `to`, now. */
  function chainLine(key, bundle, name, from, to, hit) {
    let c = chainLines.get(key);
    if (c && c.t !== clockS) c = null;
    if (c) {
      if (c.pts.length < 16) c.pts.push(chainPoint(to, hit));
      c.l?.inst.setPath?.(c.pts);
      return;
    }
    if (chainLines.size > 32) for (const [k, x] of chainLines) if (x.t !== clockS) chainLines.delete(k);
    c = { t: clockS, pts: [chainPoint(from, hit), chainPoint(to, hit)], l: null };
    chainLines.set(key, c);
    spawn(bundle, name, { ...c.pts[0] }, { owner: null, buff: false, until: clockS + CHAIN_LINE_S }).then((l) => {
      if (!l) return;
      c.l = l;
      l.inst.setPath?.(c.pts);
    });
  }
  function chainHop(e, views) {
    const prev = e[1], next = e[2], src = views.get(e[5]);
    if (!isOp(src)) return;
    const head = e[6] ?? prev;
    const a = aimed.get(`${e[5]}:${head}`);
    // the mode its shot left in (a skill may have ended while it flew), else the one now
    const mode = a && clockS - a.t <= 2.5 ? a.mode : modeNow(src);
    if (e[3] === 'chain') lastAtk.set(next, { src, t: clockS, mode, kind: e[3], shot: false });
    else healAtk.set(next, { src, t: clockS, mode, kind: e[3], shot: false }); // a chain heal's next ally (healHit)
    const from = views.get(prev), tgt = views.get(next);
    if (!from || !tgt || !bundleOf(src) || failed || level() >= 3) return;
    // a skill that switches no attack mode (−1) keeps the Default mode's shot (modelessTrail)
    const m = mode != null && mode >= 0 ? mode : 0;
    const line = bound(src, m, 'chain')[0];
    if (!line) return;
    chainAtks.add(e);
    if (camRef) chainLine(`${e[5]}:${head}`, bundleOf(src).bundle, line, from, tgt, bindOf(src)?.chainHit?.[m] === 1);
  }
  /**
   * An operator attack `a` (lastAtk / healAtk record) hitting `tgt`: its mode's hit effects (a 要塞's of the attack it made:
   * boundFor; a skill's shot: its projectile's, takeShot), else the name-mapped hit. One impact per attack: the record leaves
   * `map` (a mark's / DoT's later ticks are no attack's hit; audio.js does the same).
   */
  function attackHit(a, tgt, tid, map, strike = null) {
    if (!a.src._fxSkillOn && level() >= 3) return;
    const key = `${a.src.id ?? a.src.info?.id}:${tid}`;
    const sg = strikeGroups(a.src, a.mode, a.shot);
    const again = !!sg && (a.hitT === clockS || (strike != null && strike > (a.n ?? -1))); // a later strike of the same attack (strikeGroups)
    if (!again && clockS - (lastHit.get(key) ?? -9) < HIT_GAP_S) return;
    lastHit.set(key, clockS);
    if (sg) { a.n = strike ?? (again ? a.n + 1 : 0); a.hitT = clockS; } else map.delete(tid);
    // (2026-10-21) a talent's own attack (`sig`): that ability's hits instead of the mode's (modePart `replace`)
    const tp = a.sig ? modePart(bindOf(a.src), bundleOf(a.src)?.prefabs, a.mode, a.sig, null) : null;
    let { names: hitList, split } = tp?.replace ? { names: tp.hit, split: true }
      : sg?.base ? { names: extracted(a.src, sg.base), split: false }   // strikes with shots of their own
      : a.shot ? { names: extracted(a.src, skillBind(a.src)?.shotHit), split: false } : boundFor(a.src, a.mode, 'hit', a.kind, !!a.combat);
    if (sg) hitList = [...new Set([...hitList, ...extracted(a.src, sg.g[strikeIndex(sg, a.n)])])];
    const c = a.src._fxCast?.mode === a.mode ? a.src._fxCast : null; // 2026-10-11: its cast (clip group, loop end, speed)
    const hits = withGroup(hitList, c?.group?.hit).slice(0, MAX_HIT_FX);
    if (hits.length) { hitFx(a.src, tgt, hits, c); return; }
    if (split || bound(a.src, a.mode, 'input').length) return; // its hits are its input-target effects (inputFx), not a name-mapped one
    play(a.src, a.src._fxSkillOn ? 'skillHit' : 'attackHit', skillIdx(a.src), { at: tgt });
  }
  /**
   * 2026-10-16, official client: the per-strike hits of an attack in `mode` (modes.json `hitGroups[mode]`; a skill that
   * switches no mode, −1: its own skills[i].hitGroups — 阿斯卡纶 S1), or null. The client's MultiHitUberEffectEmitter
   * (`OnCastOnTarget`) plays group n on the target of the cast's n-th strike (`spellCnt`, 0 at the cast
   * start), the last group past the end; `loop` n modulo the groups, `rand` a random one (char_modes.py hit_groups). The
   * sim sends an attack's strikes as one 'atk' and its 'dmg's of the same tick (赤刃明霄陈 S1 / S3, 德克萨斯 S2, 锏 …), each
   * numbered by its 8th field `strike` (damage.js; without it, an older sim: the i-th of them). Before, only the first
   * played, and with a name-mapped hit (no mode binding).
   */
  function strikeGroups(v, mode, shot = false) {
    let g = null;
    if (shot) g = skillBind(v)?.hitGroups;
    else if (Number.isInteger(mode) && mode >= 0) g = bindOf(v)?.hitGroups?.[mode];
    else if (mode === -1) { g = skillBind(v)?.hitGroups; if (g?.shots) g = null; } // its strikes' shots are its own shot's (takeShot)
    return g && Array.isArray(g.g) && g.g.length ? g : null;
  }
  const strikeIndex = (sg, n) => (sg.rand ? Math.floor(Math.random() * sg.g.length) : sg.loop ? n % sg.g.length : Math.min(n, sg.g.length - 1));
  /**
   * 2026-10-16: a heal shot's hit. The client's heal projectile (赫默 projectile_silent, 莎草 projectile_chr_papyrs …) plays
   * its `_effectsWhenHit` on the ally it reaches (`Projectile.OnHitTarget`, as a damaging shot's on its enemy) — modes.json
   * `hit[mode]` of every 医疗 operator; a chain heal's bounces hit each next ally (chainHop). The sim sends no 'dmg' for a
   * heal: its 'heal' [ally, amount, healer] (damage.js) lands with the shot (ai.js opShot), and the healer's last heal attack
   * on that ally (healAtk, ≤ 2.5 s) is the one hitting. Before, nothing played on the healed ally.
   */
  function healHit(e, views) {
    const tid = e[1], by = e[3] ?? null;
    const a = healAtk.get(tid);
    if (!a || clockS - a.t > 2.5) { if (a) healAtk.delete(tid); return; }
    if (by != null && ownerOf(a.src) !== by) return; // another unit's heal (a regen, a talent): not that shot's
    const tgt = views.get(tid);
    if (tgt) attackHit(a, tgt, tid, healAtk);
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
  // 2026-10-23: an ally built from an enemy record (炎佑, shared/skill-modes.js ENEMY_RECORD_MODES) attacks with its enemy
  // prefab's bindings in its one mode — the attacker's paths below take it as an enemy, a target keeps its real side
  const erec = (v) => !!(v?.info && v.info.side !== 'enemy' && enemyRecordMode(v.info.defId));
  const efoe = (v) => v?.info?.side === 'enemy' || erec(v);
  const ebindOf = (v) => (efoe(v) && emodes ? emodes[v.info.defId] || emodes[v.info.spine] || null : null);
  /** [bundle, prefab] of effect `name` when it is extracted (enemy-modes.json `$fx`, without case), or null. */
  function efx(name) {
    const r = typeof name === 'string' && name ? emodes?.$fx?.[name.toLowerCase()] : null;
    return Array.isArray(r) && index?.bundles?.[r[0]]?.includes(r[1]) ? r : null;
  }
  const eOn = (v) => !!(index && emodes && !failed && q() !== 'low' && ebindOf(v));
  /**
   * The enemy's mode now: the one its sim form stands for (FORM_MODES, 2026-10-23), else the one whose attack clip is its
   * clip set's attack (a form switch changes it), else 0.
   */
  function emodeOf(v) {
    const b = ebindOf(v);
    if (!b || !Array.isArray(b.modes) || !b.modes.length) return null;
    const rm = erec(v) ? enemyRecordMode(v.info.defId).mode : -1;
    if (rm >= 0) return rm < b.modes.length ? rm : 0;
    const fm = typeof v.form === 'string' ? (FORM_MODES[v.info.defId] || FORM_MODES[v.info.spine])?.[v.form] : null;
    if (fm && b.modes.length > 1) {
      const i = b.modes.findIndex((m) => m?.name === fm);
      if (i >= 0) return i;
    }
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
    if (!pr || !tgt || (e[3] !== 'enemy' && !erec(src)) || pr.link || level() >= 3 || failed) return false;
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
      // (an enemy-record ally flies the sim's shot of its kind: the sim gives it an ally's speed)
      dur: Math.max(0.04, dist / (erec(src) ? projSpeed(e[3]) : eshotSpeed(src))), arc: Number(shot?.height ?? pr.raise) > 0 && (shot?.move ?? 'PARACURVE') === 'PARACURVE' ? Number(shot?.height ?? pr.raise) : 0 }, r[0], r[1]);
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
  /**
   * 2026-10-22 (maintainer request): an enemy's shell fired at a spot (content/enemies/fly.js kitShell — 帝国炮火先兆者 /
   * 中枢先兆者: fx 'bombardShell' { id, t } as it fires, 'bombard' at the spot `t` s later) with its projectile's official
   * effects instead of fx.js's procedural mortar out of the shooter. projectile_enemy_emppnt is an AttachToTarget with
   * `_delayToStart` 3 (docs/rules/sim.md): its `_effectsToTargetWhenStart` (enemy_emppnt_attack_01_start, a 3 s reticle) on
   * the spot as it fires, its `_mainEffect` (enemy_emppnt_attack_01_trail) — a shell that falls by itself, clip 0.27 s, like
   * 蕾缪安 S3's — played on the spot EMORTAR_FALL s before the landing so that it touches down then [추정: the client starts
   * it after the delay; when it reaches is not read], and `_effectsWhenReached` (enemy_emppnt_attack_01_hit) at the landing
   * (emortarLand). true = drawn here.
   */
  const EMORTAR_FALL = 0.27;
  const emortars = [];   // { x, y, hits: [[bundle, prefab]], marks: [live entries], shell: live entry | null, done }
  function emortarFx(e, views) {
    const o = e[4], src = views.get(o.id);
    if (!src || !eOn(src) || level() >= 3) return false;
    let shot;
    try { shot = enemyShot(enemyDef(src.info?.defId), src.info?.form); } catch { shot = undefined; }
    const pr = shot?.key ? eprojByKey(src, shot.key) : null;
    const trail = efx(Array.isArray(pr?.trail) ? pr.trail[0] : null);
    const hits = [...new Set([...(pr?.reached || []), ...(pr?.hit || [])])].map(efx).filter(Boolean).slice(0, MAX_HIT_FX);
    const starts = (pr?.targetStart || []).map(efx).filter(Boolean);
    if (!pr || (!trail && !hits.length && !starts.length)) return false;
    const x = Number(e[2]), y = Number(e[3]), t = Math.max(0.05, Number(o.t) || 0.5);
    const rec = { x, y, hits, marks: [], shell: null, done: false };
    emortars.push(rec);
    if (emortars.length > 64) emortars.shift();
    ownFx.add(e);
    for (const [b, n] of starts) {
      spawn(b, n, { x, y, z: 0 }, { owner: null, buff: false, until: clockS + t + 0.5 }).then((l) => {
        if (!l) return;
        if (rec.done) l.inst.stop(); else rec.marks.push(l);
      });
    }
    if (trail) {
      castsDelayed.push({ t: clockS + Math.max(0, t - EMORTAR_FALL), run: () => {
        if (rec.done) return;
        spawn(trail[0], trail[1], { x, y, z: 0 }, { owner: null, buff: false, until: clockS + EMORTAR_FALL + 4 }).then((l) => {
          if (!l) return;
          if (rec.done) finishShot(l.inst, l); else rec.shell = l;
        });
      } });
    }
    return true;
  }
  /** fx 'bombard' at the spot of a shell emortarFx drew: its shell ends as it lands, its reticle goes, its hit plays. */
  function emortarLand(e) {
    const x = Number(e[2]), y = Number(e[3]);
    const i = emortars.findIndex((r) => !r.done && Math.hypot(r.x - x, r.y - y) < 0.05);
    if (i < 0) return false;
    const rec = emortars[i];
    emortars.splice(i, 1);
    rec.done = true;
    ownFx.add(e);
    for (const l of rec.marks) l.inst.stop();
    if (rec.shell) finishShot(rec.shell.inst, rec.shell);
    if (level() < 3) for (const [b, n] of rec.hits) spawn(b, n, { x, y, z: 0 }, { owner: null, buff: false });
    return true;
  }
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
      if (r < -0.5 || c < -0.5 || r > 18.5 || c > BATTLE_COLS - 0.5) break;   // off the grid: the main projectile stops
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
  // 2026-10-11, official client, round 2 — a buff an enemy's attack puts on its target shows its own effect on that target
  // while the buff lasts, one per name per unit: client `Entity.AddBuffEffect` keeps it with a ref count
  // (`BuffEffectHolder.refCounter`) and `RemoveBuffEffect` finishes it as the last buff of that name ends.
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
  // 2026-10-10: a buff's line effect (its template's `Nodes.CreateLineEffect` on ON_BUFF_START — client `Execute`:
  // the effect is made on the buff's owner and its LineEffectEmitterDynamic gets start owner = the buff's source,
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
  function startLine(bundle, name, src, tgt, life, dyn0, meta = null) {
    const key = `${ownerOf(src)}:${ownerOf(tgt)}:${name}`;
    const rec = elines.get(key);
    if (rec && rec.fade == null) { rec.until = Math.max(rec.until, clockS + Math.max(0, life)); return; }   // the buff refreshed
    const nrec = { src, tgt, until: clockS + Math.max(0, life), l: null, sp: null, dyn: null, ended: false, tag: meta?.tag ?? null, owner: meta?.owner ?? null, skill: !!meta?.skill };
    elines.set(key, nrec);
    spawn(bundle, name, tgt, { owner: null, buff: true, until: null, on: ownerOf(tgt) }).then((l) => {
      if (!l) { elines.delete(key); return; }
      if (nrec.ended) { l.inst.stop(); return; }
      nrec.l = l;
      // (a LineEffectEmitter — fx_extract.py `lineEm` — names its start / end effects but leaves the ends to its maker)
      nrec.dyn = l.inst.def?.lineDyn || (l.inst.def?.lineEm ? { ...dyn0, ...l.inst.def.lineEm } : dyn0);
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
   * 2026-10-23 (docs/rules/fx.md 「적 이펙트 바인딩」 적 기록으로 만든 아군): 炎佑's 祛恶之焰 tick (content/tokens.js yanyouKit: fx
   * 'yanyouFlame' { id, target } every game second, the first as the channel starts) drawn with its skill's binding
   * (ENEMY_RECORD_MODES `skill`, enemy-modes.json skills.skill_2) instead of render/fx/beams.js's jet: its link projectile's
   * line (`proj.trail` enemy_acloon_skill_loop_2_line, a LineEffectEmitter whose `_startEffect` enemy_acloon_line_start sits
   * on its start) from the dragon's `proj.mount` point (MUZZLE) to the locked target's HIT point, and the skill buff's effect
   * (`hitBuff` enemy_acloon_skill_hit_range, buff acloon_s_2) on the target. Each tick holds both EBREATH_HOLD s more; the
   * skill's end ('skill' off), the target's or the dragon's ends them. [추정: the projectile's `_linkDuration` 7 s is not
   * used — the line lasts the channel, as the sim's lock does] true = drawn here.
   */
  const EBREATH_HOLD = 1.2;
  const ebreath = new Map();   // dragon id → { tgt, l: its target effect (live entry) | null, until, done }
  function ebreathFx(e, views) {
    const o = e[4], src = views.get(o.id), tgt = views.get(o.target);
    if (!src || !tgt || !erec(src) || !eOn(src) || level() >= 3) return false;
    const part = eskillPart(src, enemyRecordMode(src.info.defId).skill);
    const line = efx(Array.isArray(part?.proj?.trail) ? part.proj.trail[0] : null);
    if (!line) return false;
    ownFx.add(e);
    for (const l of elines.values()) if (l.src === src && l.tgt !== tgt) l.until = Math.min(l.until, clockS);   // a new lock
    startLine(line[0], line[1], src, tgt, EBREATH_HOLD, { sMount: Number.isInteger(part.proj.mount) ? part.proj.mount : 2, eMount: 1 });
    const id = ownerOf(src);
    let rec = ebreath.get(id);
    if (rec && (rec.tgt !== tgt || rec.done || clockS > rec.until)) { endBreathOn(rec); rec = null; }
    if (!rec) {
      const r = { tgt, l: null, until: 0, done: false };
      rec = r;
      ebreath.set(id, r);
      for (const n of part.hitBuff || []) {
        const fx = efx(n);
        if (fx) spawn(fx[0], fx[1], tgt, { owner: null, buff: true, on: ownerOf(tgt), until: clockS + EBREATH_HOLD }).then((l) => { if (!l) return; if (r.done) l.inst.stop(); else r.l = l; });
      }
    }
    rec.until = clockS + EBREATH_HOLD;
    if (rec.l) rec.l.until = rec.until;
    return true;
  }
  function endBreathOn(rec) { rec.done = true; if (rec.l) rec.l.until = clockS; }
  /** 祛恶之焰 ended ('skill' off): its line fades now (`_delayToFinish`, stepLines), its target effect stops. */
  function endBreath(v) {
    const id = ownerOf(v), rec = ebreath.get(id);
    if (rec) { endBreathOn(rec); ebreath.delete(id); }
    for (const l of elines.values()) if (l.src === v) l.until = Math.min(l.until, clockS);
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
  // ---- deploy / dead effects of operators and tokens (2026-10-11, official client, round 2) ------------------------
  // Client `Character.get_startEffect`: a character's deploy plays its prefab root's `_startEffect` (a mode's
  // `_overrideStartEffect` first — `GetStartEffect`), else common_char_birth_01 — a token common_call_start_01
  // (`DefaultEffects.CHARACTER_BORN` / `TOKEN_BORN`); `_onlyPlayStartEffectOnce` keeps it to the first deploy. Its death
  // plays `_deadEffect`, else common_char_die_01. Here on each 'deploy' (a 【移动】 too — the client redeploys) of an
  // operator / token whose prefab is extracted (its own bundle, else the shared `common` one), and on its 'die' when knocked
  // out ('killed'; a retreat / expiry plays none [추정]). 望's stones keep their own (stoneFx).
  const deployed = new Map();   // unit id → battle clock of its 'deploy' (its view may be built right after the event)
  const startedOnce = new Set();
  const opDead = new Set();     // units whose dead effect played (ownsDeath)
  const isAlly = (v) => !!(v?.info && v.info.side !== 'enemy' && (v.info.kind === 'op' || v.info.kind === 'token') && !isStone(v));
  /** [bundle, prefab] of a deploy / dead effect of `v`: its own bundle's (a summon's: tokenBundle), else the shared common one; null when not extracted. */
  function allyFx(v, name) {
    const b = bundleOf(v);
    if (b?.prefabs.includes(name)) return [b.bundle, name];
    const t = tokenBundle(v, name);
    if (t) return [t, name];
    return index?.bundles?.common?.includes(name) ? ['common', name] : null;
  }
  /**
   * 2026-10-22 (upstream 5209873f's symptom, docs/rules/fx.md 「소환물 스킬 오라」): a summon's own effects — modes.json keyed by
   * its token id (char_modes.py token_auras: { owner, aura: { owner skill index: [prefab…] }, start }) — live in its owner's
   * bundle (诅咒娃娃: vodfox) or in `<owner>_token` (斯卡蒂的海嗣: skadi2_token, pkgrps/btl_pfb_fx_token_2.ab). The bundle of
   * `name`, or null.
   */
  function tokenBundle(v, name) {
    const owner = v?.info?.kind === 'token' ? bindOf(v)?.owner : null;
    if (!owner || !name) return null;
    const ob = fxBundleOf(owner);
    return [ob, `${ob}_token`].find((b) => index?.bundles?.[b]?.includes(name)) ?? null;
  }
  /**
   * The aura a summon's skill keeps on it while it stands (client AuraAbility `_effects`, attached with the token and
   * finished as it leaves: 诅咒娃娃 vodfox_skill_02_buff, 斯卡蒂的海嗣 token_skadi2_skill_0<n>_buff by 浊心斯卡蒂's skill —
   * the token's snapshot `skillIndex` is its owner's). The sim sends no skill event for such a passive: kept by the frame
   * (stepTokenAuras — a view built mid-battle starts it too), restarted on each deploy (`force`), ended by its 'die'
   * (stopOwned) or when it is gone.
   */
  function tokenAura(v, force = false) {
    if (v?.info?.kind !== 'token') return;
    const aura = bindOf(v)?.aura;
    if (!aura || typeof aura !== 'object') return;
    const id = ownerOf(v);
    const list = v.alive !== false && !failed && q() !== 'low' ? aura[String(v.info.skillIndex ?? '')] ?? Object.values(aura)[0] ?? [] : [];
    const names = list.map((n) => [tokenBundle(v, n), n]).filter(([b]) => b);
    const key = names.map(([, n]) => n).join('|');
    const rec0 = v._fxAura;
    // the same aura still loading or playing (a lost one — its 'die' ended it, the view stands again — comes back after 1 s)
    if (!force && (rec0?.key ?? '') === key && (!key || rec0.pending > 0 || rec0.lives.some((l) => !l.inst.done) || clockS - rec0.t < 1)) return;
    for (const l of live) if (l.tag === 'tokAura' && l.owner === id) l.inst.stop(force);
    const rec = { key, lives: [], pending: names.length, t: clockS };
    v._fxAura = rec;
    for (const [b, n] of names) {
      spawn(b, n, v, { owner: id, buff: false, onCaster: true, until: null, tag: 'tokAura', pinned: true }, { over: false, facing: efacing(v) })
        .then((l) => { rec.pending--; if (!l) return; if (v._fxAura !== rec) l.inst.stop(); else rec.lives.push(l); });
    }
  }
  function stepTokenAuras(views) {
    if (!views) return;
    for (const v of views.values()) if (v?.info?.kind === 'token' && (v._fxAura || bindOf(v)?.aura)) tokenAura(v);
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
      tokenAura(v, true);   // 2026-10-22: a summon's skill aura
      defaultModeFx(v, true);   // 2026-10-21: the Default mode's own effects
      droneIdle(v, true);   // 2026-10-16: the Default mode's drones
      warmShot(v);   // 2026-10-23: its skill's own shot, ready for the skill's first throw
      if (isPack(v)) packDeploy(v, id, t);   // 2026-10-16: 伺夜's wolf pack
      const fx = deployEffect(bind, v.info.kind === 'token', v._fxSkillOn ? modeNow(v) ?? 0 : 0);
      // `_onlyPlayStartEffectOnce`: the root's effect on the first deploy only [추정: a mode's override still plays]
      if (bind?.startOnce && !fx.override) { if (startedOnce.has(id)) continue; startedOnce.add(id); }
      // 2026-10-24 (묶음 S4): a summon's own start effect (modes.json `start`: 凯尔希·思衡托's 战术锚点) — 'common_empty' is
      // nothing (乌尔比安's block); one not extracted (蜜蜡's obelisk, 夕's dragon …) keeps the token's common one, as before
      const r = fx.name === 'common_empty' ? null
        : allyFx(v, fx.name) ?? (v.info.kind === 'token' && !fx.override ? allyFx(v, deployEffect(null, true).name) : null);
      if (r) spawn(r[0], r[1], v, { owner: id, buff: false, onCaster: true, tag: 'born' }, { over: false, facing: efacing(v) });
    }
  }
  /**
   * 2026-10-16, official client: the always-on effects (fxmap.js commonEffects) — client `Unit.AttachCommonAbilities`
   * attaches the root's common abilities with the unit, so their INFINITY buffs' effects stay through every mode and
   * skill. Started on each deploy (a 【移动】 re-attaches them: the old ones end first), ended by its 'die' (stopOwned).
   * Not `buff` entries: stopBuffs ends those with every skill.
   */
  function alwaysOn(v, id) {
    const b = bundleOf(v);
    const names = b ? commonEffects(bindOf(v), b.prefabs, KIT_OWNED, v?.info?.spine || v?.info?.defId, plays, skillIdx(v)) : [];
    if (!names.length) return;
    for (const l of live) if (l.tag === 'common' && l.owner === id) l.inst.stop(true);
    for (const n of names) spawn(b.bundle, n, v, { owner: id, buff: false, onCaster: true, until: null, tag: 'common', pinned: true }, { over: false, facing: efacing(v) });
  }
  /**
   * 2026-10-21 (maintainer decision 2026-10-21, official client): the Default mode's own effects (fxmap.js defaultModeEffects).
   * The client attaches a mode's abilities with the mode and detaches them when another mode takes over (Unit.SwitchMode →
   * ActivateMode); a detach ends their effects — an aura's own (AuraAbility.DoDetach → _ClearEffects:
   * Effect.FinishMe(false), it fades) and a buff's (Entity.RemoveBuffEffect). So they show while the operator is deployed and
   * no running skill switched her mode (a skill that switches none, attackMode −1, keeps the Default mode) — through a stun
   * too —, end at a mode-switching skill's start, come back at its end and end with her retreat / death (stopOwned).
   * `force` (a deploy, a 【移动】 too: the client re-attaches) restarts them.
   */
  function defaultModeFx(v, force = false) {
    const id = ownerOf(v), b = bundleOf(v);
    const m = v._fxSkillOn ? modeNow(v) ?? -1 : 0;
    const names = b && !failed && q() !== 'low' && v.alive !== false && !(m > 0) ? defaultModeEffects(bindOf(v), b.prefabs, KIT_OWNED) : [];
    const key = names.join('|');
    if (!force && (v._fxMode0?.key ?? '') === key) return;
    for (const l of live) if (l.tag === 'mode0' && l.owner === id) l.inst.stop(force);
    const rec = { key };
    v._fxMode0 = rec;
    for (const n of names) {
      spawn(b.bundle, n, v, { owner: id, buff: false, onCaster: true, until: null, tag: 'mode0', pinned: true }, { over: false, facing: efacing(v) })
        .then((l) => { if (l && v._fxMode0 !== rec) l.inst.stop(); });
    }
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
   * `_startEffect` only — the client's `Enemy.States.BornState._PlayAnimation` plays `Enemy.get_startEffect`
   *, which returns the root field and never a UnitMode's `_overrideStartEffect` (only `Character.GetStartEffect`
   * — operators and tokens — reads that).
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
   * starting plays it. A mode switch plays no effect of its own: the client's `Unit.SwitchMode` runs
   * `InactiveMode` → `ActivateMode` (the new mode's GameObject on, its abilities attached) → `OnSwitchMode`
   * (`Enemy.OnSwitchMode`: its skills detached / attached, `Unit.OnSwitchMode`: the state machine restarted,
   * `BuffContainer.OnUnitSwitchMode`) — none creates an effect, and the mode's `_overrideStartEffect` is not read for an enemy.
   * The mode is tracked whenever the bindings are loaded (the sound needs it at quality 'low' too).
   */
  function stepEnemies(views) {
    if (!emodes || !views) return;
    for (const v of views.values()) {
      if (v?.info?.side !== 'enemy' || v.alive === false || !ebindOf(v)) continue;
      if (v._fxEMode === undefined) { v._fxEMode = emodeOf(v); v._fxEClip = v.actor?.current; v._fxEForm = v.form ?? null; continue; } // on the field before this layer
      // 2026-10-23: a rebirth starting — the 重生 form coming on (a leader's reborn()) — plays its RebornTalent `_effects`
      const form = v.form ?? null;
      if (form !== v._fxEForm) {
        v._fxEForm = form;
        if (form === 'reborn' && eOn(v)) erebornFx(v, v._fxEMode);
      }
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
        // … or a form's closing clip starting (render/units.js FORMS `end`: the 逐火 ember standing up on Revive — the sim's
        // stand-up comes as that clip ends, the client's rebirth plays its clip and effects from its start)
        const fd = typeof v._formSpec === 'function' ? v._formSpec() : null;
        if (fd?.end && clip === fd.end && form !== 'reborn') erebornFx(v, v._fxEMode);   // (a 重生's own closing clip: started above)
      }
    }
  }
  /**
   * 2026-10-23 (docs/rules/fx.md 「적 상태의 버프 이펙트」): the effects of the rebirth enemy `v` starts in mode `mode` —
   * enemy-modes.json `reborn` (its RebornTalents' `_effects`, the talent outside the modes or in that mode). The client's
   * `Enemy.OnReborn` → `DoFakeDeath` (buffs cleared) → `Enemy.States.RebornState.OnEnter`: created as the rebirth starts, on
   * their own (`BattleController.CreateEffects`) — finished as it ends only with `_clearEffectsAfterReborn`, which none of
   * ours sets (`clear` 0) [추정: such a one would play its own length here too].
   */
  function erebornFx(v, mode) {
    const b = ebindOf(v);
    for (const rb of Array.isArray(b?.reborn) ? b.reborn : []) {
      if (rb.mode != null && rb.mode !== mode) continue;
      eplay(v, rb.fx, { tag: 'reborn' });
    }
  }
  /**
   * An enemy's death: its dead effect where it falls — its mode's `_overrideDeadEffect`, else the root's `_deadEffect`, else
   * common_enemy_die_01 (the client's `Enemy.get_deadEffect`). enemy-modes.json `dead` carries the default
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
    arrowKind(e) { return noteAtks.has(e) ? 'oblvnsNote' : trailAtks.has(e) || chainAtks.has(e) ? 'officialTrail' : e[3]; }, // local patch: trails, chain lines
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
      if (efoe(v)) return !!(eOn(v) && ebindOf(v).skills);
      return !!(index && isOp(v) && bundleOf(v) && q() !== 'low' && !failed);
    },
    /** local patch (⑤): whether the shared status prefab `bundle`/`name` can play (index loaded, not 'low', listed). */
    statusReady(bundle, name) { return !!(index && !failed && q() !== 'low' && index.bundles?.[bundle]?.includes(name) && !statusFailed.has(`${bundle}/${name}`)); },
    /** The loaded plays.json (tools/build-fx-plays.mjs: the hand tables' client keys → prefabs), or null: fxstatus.js keyed specs. */
    plays() { return plays; },
    /** Whether status effects can play at all (index loaded, not 'low', no WebP failure): off, units draw their status icons (fxstatus.js). */
    statusLayer() { return !!(index && !failed && q() !== 'low'); },
    /**
     * 2026-10-21 (docs/rules/fx.md 「적 이펙트 바인딩」 「적 상태의 버프 이펙트」): an enemy's own buff effects for
     * render/fxstatus.js — the client draws a status by its buff's effect (Entity.AddBuffEffect), and an enemy's buffs are
     * its prefab's (enemy-modes.json `buffFx` / `buffEnd` / `inv` / `stealth`, enemy_bindings.py). `kind` 'key': the buffs
     * the sim's status names (`fxTag` = the client buff keys, 'a|b'; a key one enemy uses in several modes is `<key>#<mode>`
     * and a bare tag takes any of them), 'inv': its rebirth 无敌, 'stealth': its 隐匿, 'mode' (2026-10-23): the passive buffs
     * of the mode it is in (`modes[i].aura` of an enemy with several modes — attached with the mode by Unit.ActivateMode,
     * gone with it; none during a 重生: Unit.DoFakeDeath clears its buffs, the new mode comes at the rebirth's end).
     * { on, ends, once } — the [bundle, prefab, 'own'] specs of the extracted ones and, by `bundle/prefab` of one, what its
     * buff's ON_BUFF_FINISH creates (once) and whether its buff is IMMEDIATELY (`buffOnce`, 2026-10-23: “碎铳之簧”'s
     * achunt_dog_silence as its MoveToHunter mode comes on — flashed, see statusOn) — or null.
     */
    enemyBuffFx(v, kind, tag = '') {
      const b = ebindOf(v);
      if (!b) return null;
      if (kind === 'mode') {
        if (!Array.isArray(b.modes) || b.modes.length < 2 || v.form === 'reborn') return null;
        tag = String(v._fxEMode ?? emodeOf(v) ?? 0);
      }
      const memo = b._buffMemo || Object.defineProperty(b, '_buffMemo', { value: new Map(), enumerable: false })._buffMemo;
      const mk = `${kind}:${tag}`;
      if (memo.has(mk)) return memo.get(mk);
      const specs = (names) => [...new Set(names)].map(efx).filter(Boolean).map((r) => [r[0], r[1], 'own']);
      let on = [];
      const ends = new Map();   // `bundle/prefab` of a buff's effect → that buff's end specs
      const once = new Set();   // 2026-10-23: `bundle/prefab` of an IMMEDIATELY buff's effect (`buffOnce`): flashed, not held
      if (kind === 'inv' || kind === 'stealth') on = Array.isArray(b[kind]) ? b[kind] : [];
      else if (kind === 'mode') on = Array.isArray(b.modes[Number(tag)]?.aura) ? b.modes[Number(tag)].aura : [];
      else if (kind === 'key' && tag) {
        const fx = b.buffFx || {}, fin = b.buffEnd || {}, imm = Array.isArray(b.buffOnce) ? b.buffOnce : [];
        for (const t of String(tag).split('|')) {
          for (const k of Object.keys(fx)) {
            if (k !== t && !k.startsWith(`${t}#`)) continue;
            const mine = specs(fx[k] || []), end = specs(fin[k] || []);
            on = on.concat(fx[k] || []);
            if (end.length) for (const sp of mine) ends.set(`${sp[0]}/${sp[1]}`, end);
            if (imm.includes(k)) for (const sp of mine) once.add(`${sp[0]}/${sp[1]}`);
          }
        }
      }
      const r = { on: specs(on), ends, once };
      memo.set(mk, r.on.length ? r : null);
      return memo.get(mk);
    },
    /** 2026-10-21: `bundle`/`name` once on `view` at the prefab's own `_spawnLocation` — a buff's end (fxstatus.js `end`). */
    statusOnce(view, bundle, name) {
      if (!index?.bundles?.[bundle]?.includes(name) || q() === 'low' || failed) return;
      if (trace) trace({ kind: 'statusEnd', names: [name], by: ownerOf(view) ?? null, at: null });
      if (dry) dryFollow(bundle, name, ownerOf(view) ?? null, ownerOf(view) ?? null);
      playOnce(view, bundle, name);
    },
    /**
     * 2026-10-21: a battle unit's Spine clip event (render/app.js ctx.spineEvent): OnDeactivateEffect / OnActivateEffect
     * pause / unpause its effects' PauseEffectIfSpineEvent (`Entity.Event` ON_DEACTIVATE_EFFECT_EVENT 38 / ON_ACTIVATE 37 →
     * `_OnPauseEffect` / `_OnPlayEffect`; `invert` swaps them).
     */
    spineEvent(id, name) {
      const off = name === 'OnDeactivateEffect';
      if (id == null || (!off && name !== 'OnActivateEffect')) return;
      for (const l of live) {
        if (l.owner !== id || !l.inst.pausers?.length) continue;
        for (const pz of l.inst.pausers) if (pz.k === 'pauseSpine') { pz.on = pz.rec.invert ? !off : off; behPause(l, pz, pz.on); }
        setPaused(l);
      }
    },
    /**
     * local patch (⑤): loop `bundle`/`name` on `view` as its status `key` (once per key) at `frac` of its height.
     * 2026-10-23: `once` — an IMMEDIATELY buff's effect (fxstatus.js ONCE_OF): the client's buff ends as it starts and
     * finishes the effect (Effect.FinishMe), so it is finished at once and gone its `_delayToFinish` later, never looped.
     */
    statusOn(view, bundle, name, key, frac = 0, hold = null, under = false, once = false) {
      const on = view._fxStatusOn || (view._fxStatusOn = new Set());
      if (on.has(key)) return;
      on.add(key);
      if (trace) trace({ kind: 'status', names: [name], by: ownerOf(view) ?? null, at: null, ...(once ? { once: true } : null) }); // tests: the status prefab on `view`
      if (dry) dryFollow(bundle, name, ownerOf(view) ?? null, frac === 'own' ? ownerOf(view) ?? null : null);
      playStatus(view, bundle, name, key, frac, hold, under, once);
    },
    /**
     * local patch (⑤): end the status effect `key` on `view`; `now` (render/fxstatus.js): as the client finishes a buff's
     * effect (Entity.OnBuffFinish → RemoveBuffEffect → Effect.FinishMe) — emission stops and the
     * effect is removed its prefab's `_delayToFinish` later (ParticleEffect.get_delayToRecycle; def.finish),
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
        // 2026-10-11 (docs/rules/ui.md ⑤): `now` = the client's Effect.FinishMe — its first system stops (2026-10-23:
        // FxInstance.finish, not every system), the effect goes its prefab's `_delayToFinish` later (def.finish,
        // fx_extract.py); none / 0: at once
        const fin = now ? Number(l.inst.def?.finish) : 0;
        if (fin > 0) { l.inst.finish(); l.finishAt = clockS + fin; } else l.inst.stop(now);
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
     * 2026-10-18: 战场#06's 沙尘暴 over the battle (render/app.js enterBattle: m.field `storm`, `mounds` the active 土石结构
     * { r, c, z }), until the next clear(). The storm device's sand_storm[camera_effect] (ON_BUFF_START, SwitchDirection on
     * its direction) wears screen_desert_<from>_to_<to>_empty, a wrapper (`_effects`) of the looping
     * screen_desert_<from>_to_<to> (`_spawnLocation` 12 CAMERA): played here on the camera, which it follows (update) —
     * [ASSUMED] the camera's position and turn, as Unity parents it, and on while the storm blows over any half; and the
     * mounds the wind reaches wear their sand marks (stormMarks).
     */
    async setStorm(storm, mounds) {
      const gen = stormGen;
      if (!Array.isArray(storm) || !storm.length || q() === 'low' || failed || !(dry || await ensure()) || gen !== stormGen) return;
      const dir = storm[0].dir;
      const play = async (bundle, name, at, extra, turn = null) => {
        if (!index?.bundles?.[bundle]?.includes(name)) return;
        if (trace) trace({ kind: 'storm', names: [name], by: null, at: null }); // tests: the board's effects (no owner)
        if (dry) { dryFollow(bundle, name, null, null); return; }
        const def = await lib.load(bundle, name);
        if (!mod || !def || gen !== stormGen) return;
        const inst = new mod.fxp.FxInstance(def, { quality: q() });
        inst.object.position.set(at.x, at.y, at.z || 0);
        if (turn) inst.nodes[0]?.quaternion.set(turn[0], turn[1], turn[2], turn[3]);   // the point's turn (Unity frame)
        addLive(inst, { view: extra?.camera ? null : at, owner: null, buff: true, keep: true, pinned: true, tag: 'storm', ...extra }, layers.over);   // pinned: never ended by the caps
      };
      const jobs = [];
      if (STORM_SCREEN[dir]) jobs.push(play('screen', STORM_SCREEN[dir], { x: 0, y: 0, z: 0 }, { camera: true }));
      for (const m of stormMarks(storm, mounds)) jobs.push(play('map', m.name, { x: m.c, y: m.r, z: m.z }, null, MOUND_SP0_TURN));
      await Promise.all(jobs);
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
          if (erec(v)) { if (!e[2]) endBreath(v); return; }   // 2026-10-23: 炎佑's channel ends (ebreathFx)
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
          else {
            const flags = v._fxSkillFlags?.size ? new Set(v._fxSkillFlags) : null;   // (묶음 S8: SKILL_EDGE `if`)
            v._fxSkillOn = false; v._fxSkillFlags?.clear(); endWolves(v.id ?? v.info.id); stopBuffs(v.id ?? v.info.id, true); skillEnd(v, flags);
            for (const l of elines.values()) if (l.skill && l.owner === (v.id ?? v.info.id)) l.until = Math.min(l.until, clockS);   // a plan's `life: 'skill'` lines
          }
          droneIdle(v);   // 2026-10-16: the drones of the mode now
          defaultModeFx(v);   // 2026-10-21: the Default mode's own effects, off while a skill switched her mode
          return;
        }
        case 'atk': {
          if (CHAIN_KINDS.has(e[3])) { chainHop(e, views); return; } // 2026-10-16: a bounce is no attack of its "source"
          const src = views.get(e[1]);
          // 2026-10-10: an enemy's attack — its strike's cast effects, its shot's official trail, its hit to come
          if (efoe(src)) {
            if (!eOn(src)) return;
            const tgt = views.get(e[2]);
            const p = estrikeFx(src, e[3]);
            if (tgt && p?.part) {
              lastAtk.set(tgt.id ?? tgt.info?.id, { src, t: clockS, mode: p.mode, epart: p.part });
              etrailShot(e, src, tgt, p.part);
            }
            return;
          }
          if (isPack(src)) { packAtk(src, views.get(e[2])); return; } // 2026-10-16: 伺夜's wolf pack
          if (!isOp(src) || !bundleOf(src)) return;
          skillByFlag(src, views); // local patch
          const tgt = views.get(e[2]);
          // 丰川祥子: her note (the 'oblvnsNote' born event of this attack) replaces render/fx.js's arrow
          if (tgt && fxBundleOf(src.info.spine || src.info.defId) === 'oblvns' && notesOn(src)) noteAtks.add(e);
          const mode = modeNow(src); // local patch: the mode this attack belongs to (its bound cast / hit effects)
          const shot = mode === -1 && takeShot(src); // 2026-10-16: a mode-less skill's own shot
          const sig = typeof e[4] === 'string' && e[4] ? e[4] : null; // 2026-10-21: a talent's own attack ('T.1': modePart)
          if (tgt) lastAtk.set(tgt.id ?? tgt.info?.id, { src, t: clockS, mode, kind: e[3], shot, combat: !!src._fxCombat, sig });
          if (tgt && tgt.info?.side !== 'enemy') healAtk.set(tgt.id ?? tgt.info?.id, { src, t: clockS, mode, kind: e[3], shot }); // healHit
          if (tgt) aimed.set(`${src.id ?? src.info?.id}:${tgt.id ?? tgt.info?.id}`, { t: clockS, mode }); // the chain it may start (chainHop)
          if (aimed.size > 256) for (const [k, x] of aimed) if (clockS - x.t > 2.5) aimed.delete(k);
          const part = atkPart(src, mode);
          if (!noteAtks.has(e) && part !== 'drone') trailShot(e, src, tgt, mode, shot); // local patch: its projectile's official trail
          if (src._fxSkillOn) foeFx(src, tgt, mode); // 2026-10-10: a mode buff held by the enemy
          // local patch: the mode's own cast effects (a skill's on each of its attacks) — since 2026-10-10 on the attack's own
          // clock: those of ON_CAST_START already started at its 'swing', the strike's (ON_SPELL_ON) now (strikeFx); the
          // throttle (ATTACK_GAP_S) and load level 3 skip them as before (beginCast)
          strikeFx(src, mode, e[3], tgt, sig);
          svashBird(src, tgt);   // 2026-10-21: 凛御银灰 S3's eagle
          chargeRelease(src);    // 2026-10-21: a 秘术师's stored energies leave with it
          if (part !== 'body') droneShot(src, tgt, mode, lockByFx(src) ? 'free' : null);   // 2026-10-16: its drones (2026-10-21: the locks by 'drone')
          if (tgt && (src._fxSkillOn || level() < 3)) shotStartFx(src, tgt, mode, shot);
          return;
        }
        // (2026-10-10, official client): the sim's swing start ['swing', unit, windup, kind] — an attack's
        // ON_CAST_START cast effects (swingFx). Every state event reaches onEvent, so render/app.js needs no call of its own.
        case 'swing': {
          const src = views.get(e[1]);
          if (efoe(src)) { if (eOn(src)) eswingFx(src, Number(e[2]) || 0, e[3]); return; }
          if (src) src._fxCombat = Number(e[6]) === 1;   // 2026-10-21: at an enemy it blocks (combatEffects, altGroup)
          // (2026-10-21) the 9th field: a talent ability cast in place of the attack; the 6th: its target, when it turns to it
          if (src) swingFx(src, Number(e[2]) || 0, views, e[3], typeof e[8] === 'string' && e[8] ? e[8] : null, typeof e[5] === 'number' ? e[5] : null);
          return;
        }
        case 'dmg': {
          const tid = e[1];
          // 2026-10-10: the attacker, the 6th field of the sim's damage event (null: 无来源 damage / an older sim)
          const by = e.length >= 6 && e[5] != null ? e[5] : null;
          if (Array.isArray(e[8])) hitMoments(e[8], tid, by, views);   // 2026-10-24 (묶음 S3): its kit effect moments
          if (stoneHit(tid, views)) return; // a 望 stone blast's hit effect
          if (pendingHit(tid, views, by)) return; // local patch: a skill's damage without an attack
          let a = lastAtk.get(tid);
          if (a && by != null && ownerOf(a.src) !== by) a = null; // another unit's damage: not that attack's hit
          // an attack with per-strike hits keeps its record for its strikes of the same tick (strikeGroups); a DoT tick is none
          // (2026-10-16: the sim's 8th field numbers them; one without — a talent's extra hit — is no strike; a numbered one
          // after the last is a later strike even on a later tick — a 轰击术师's aftershocks 0.3 s apart)
          const strike = Number.isInteger(e[7]) ? e[7] : null;
          const later = !!a && a.hitT != null && strike != null && strike > (a.n ?? -1) && clockS - a.t <= 2.5;
          if (a && a.hitT != null && !later && (a.hitT !== clockS || e[6] === 1 || (e.length >= 8 && e[7] == null))) { if (a.hitT !== clockS) lastAtk.delete(tid); a = null; }
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
          if (fxBundleOf(a.src.info?.spine || a.src.info?.defId) === 'oblvns' && notesOn(a.src, true)) return;   // her notes hit on their own
          attackHit(a, tgt, tid, lastAtk, strike);
          return;
        }
        // 2026-10-16: a heal shot reaching its ally — the healer's mode hit effects on it (healHit); 2026-10-24 (묶음 S3): its
        // kit effect moments (5th field)
        case 'heal': healHit(e, views); if (Array.isArray(e[4])) hitMoments(e[4], e[1], e[3] ?? null, views); return;
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
          // (2026-10-21) and the moment's other official effects (render/fx/kitofficial.js: 歌蕾蒂娅 S3's mark on her target)
          if ((e[1] === 'zone' || e[1] === 'tornado' || e[1] === 'storm') && zoneFx(e, views)) { officialKitFx(e, views); return; }
          if (e[1] === 'lightning' && chainFx(e, views)) return;
          if (e[1] === 'oblvnsNote' && e[4]) { noteFx(e, views); return; }
          if (e[1] === 'parry' && e[4]) { parryFx(e, views); return; }
          if (e[1] === 'shieldBreak' && e[4] && brokeOwn.delete(e[4].id)) { ownFx.add(e); return; } // 2026-10-23: its official break drew it (parryFx)
          if (e[1] === 'explode' && e[4]?.kind === 'expose' && exposeFx(e, views)) { ownFx.add(e); return; }
          if (e[1] === 'burst' && e[4]?.element) { if (burstFx(e, views)) ownFx.add(e); return; }
          // (2026-10-24, 묶음 S8) and the marks on their targets (render/fx/kitofficial.js)
          if (e[1] === 'whitw2Drones' && e[4]) { wolfFx(e); officialKitFx(e, views); return; }
          if (e[1] === 'buffProgress' && e[4]) { buffProgress(e[4]); ownFx.add(e); return; }
          // 2026-10-16: 伺夜's wolf pack (its count, its gift)
          if (['summon', 'revive', 'wolfShadow', 'wolfShadowLost', 'wolfCount', 'wolfTacEnd', 'buff'].includes(e[1]) && packEvent(e, views)) ownFx.add(e);
          // 2026-10-16: 荒芜拉普兰德's 头狼 stage (stage 3: one more drone — droneIdle)
          if (e[1] === 'talent' && e[4]?.name === 'alpha') { const v = views.get(e[4].id); if (v) { v._fxAlpha = Number(e[4].stage) || 0; droneIdle(v); } }
          if (e[1] === 'mysticStore' && e[4] && chargeStore(e, views)) { ownFx.add(e); return; } // 2026-10-21: a 秘术师's stored energy
          if (skillShotFx(e, views)) return; // 2026-10-21: 流星 S2's arrows, 崖心 S2's harpoon (a skill's own projectile)
          if (kitFx(e, views)) return; // local patch: 余 S3 wall, 蕾缪安 S3 lock / shells, 戴菲恩 S3 slashes / finisher
          if ((e[1] === 'substitute' || e[1] === 'swap' || e[1] === 'dollEnd') && e[4]) dollFx(e, views); // local patch: the 替身's own effects
          if (standInOff(e, views)) ownFx.add(e); // local patch: no old procedural stand-in for an operator with official effects
          if (e[1] === 'drone' && e[4] && lockDroneFx(e, views)) return;   // 2026-10-21: 耶拉 / 洛洛 S2's locked drones
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
          stopOwned(e[1]); endWolves(e[1], false); for (const l of live) if (l.on === e[1]) l.inst.stop(true); // local patch: marks on it
          // 蕾缪安 knocked out / withdrawn mid-S3: no shells follow (kit onEnd 'death'), so her locks' marks end with her
          // (they are owned by their targets)
          const lm = lemMarks.get(e[1]);
          if (lm) { lemMarks.delete(e[1]); for (const mark of lm) { mark.done = true; for (const l of mark) l.inst.stop(true); } }
          const v = views.get(e[1]);
          if (v?.info?.side === 'enemy' && e[2] !== 'forcedExit') edeathFx(v); // 2026-10-10: its dead effect
          else if (v) allyDeathFx(v, e[2]); // 2026-10-11: an operator's / token's dead effect
          unitEndFx(e[1], v); // 2026-10-21: a kit plan's end effect where it stood (圣聆初雪's thawing tile)
          charges.delete(e[1]); // (its held charge effects: stopOwned above)
          linkAxes.delete(e[1]); throwLand.delete(e[1]); // 望's stone: a stone that comes back links anew
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
      if (index) stepTokenAuras(lastViews); // 2026-10-22: the summons' skill auras
      stepLines(); // 2026-10-10: buff line effects follow their units
      // a frame without effects costs them nothing: the means decay (they used to stand at the last effect frame's cost)
      if (!mod || !live.length) { perf.updateMs *= 0.9; perf.renderMs *= 0.9; perf.calls = 0; }
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
      // 2026-10-18: a camera effect (setStorm) stands 0.9–1.7 in front of the camera — the near plane stays before it
      const onCam = live.some((l) => l.camera);
      syncThreeCamera(cam, camera, w, h, { near: onCam ? 0.3 : Math.max(0.3, cam.dist * 0.08), far: cam.dist + 70 });
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
        // 2026-10-18: a camera effect in the camera's frame — Unity's camera looks down +z, three's down −z: the effect's
        // Unity group (z mirrored) maps camera-local (x, y, z) to three's (x, y, −z), so the camera's own transform places it
        // [ASSUMED] scaled across the view by tan(fov / 2) / tan(20°): the client's battle camera has a 40° vertical field of
        // view (projection.js OFFICIAL.fovY) — a fitted camera's narrower one keeps the same framing (the sand along the top)
        if (l.camera) {
          l.inst.object.position.copy(camera.position); l.inst.object.quaternion.copy(camera.quaternion);
          const k = Math.tan((camera.fov * Math.PI) / 360) / TAN_CLIENT_HALF_FOV;
          l.inst.object.scale.set(k, k, 1);
        }
        else if (l.view && l.view.alive !== false && !l.view.remove) {
          l.inst.object.position.set(l.view.x, l.view.y, l.view.z || 0);
          const r = l.view.rot;   // local patch: its mount point's turn (lifted)
          if (r != null && l.inst.nodes?.[0]) l.inst.nodes[0].rotation.set(0, 0, r);
        }
        if (l.inst.turn && l.inst.def?.follow && !(l.followed && l.inst.def.follow.once)) stepFollow(l); // 2026-10-22: FollowDirection
        if (l.inst.def?.tileH > 0) stepTileHeight(l, dt * rate2); // 2026-10-22: FollowTileHeight
        // local patch (maintainer 2026-10-07: 蕾缪安's beams must come straight down from the sky wherever the target stands): the
        // effect's +y turned to the camera's up — a line along it projects to a screen-vertical line at any place
        if (l.skyward) {
          SKY_Y ||= new mod.THREE.Vector3(0, 1, 0); skyUp ||= new mod.THREE.Vector3();
          l.inst.object.quaternion.setFromUnitVectors(SKY_Y, skyUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize());
        }
        if (l.fly) stepFly(l, dt, dt * rate2); // 2026-10-21: FlyToPredefinedLocation
        // 2026-10-23: an end with a recycle (`finishAt`) is the client's FinishMe — its first system only (FxInstance.finish)
        if (l.until != null && clockS > l.until && !l.stopped) { l.stopped = true; if (l.finishAt != null) l.inst.finish(); else l.inst.stop(); }
        if (l.shotEnd != null && clockS >= l.shotEnd) { l.shotEnd = null; finishShot(l.inst, l); } // 2026-10-11: a flown main effect arrives
        if (l.finishAt != null && clockS >= l.finishAt) { l.finishAt = null; l.inst.stop(true); } // 2026-10-11: statusOff's delay
        if (l.backOf && (l.backOf.inst.stopping || !live.includes(l.backOf)) && !l.inst.stopping) l.inst.stop(); // 2026-10-10: a back copy ends with its front
        if (l.inst.pausers?.length) stepPauses(l); // 2026-10-21: the client's pause / finish behaviours
        if ((!l.view?.paused && !l.hidden && !l.held && !l.paused) || l.inst.stopping) l.inst.update(dt * rate2 * (l.speed > 0 ? l.speed : 1));   // local patch: every effect on the battle clock (the notes did already: trail = speed × time); a front paused for its back copy (stepBackSwitches) waits
        if (l.inst.emitters?.length) stepEmitters(l); // 2026-10-21: RandomEmitter copies
        if (l.inst.onEmit?.length) stepOnEmit(l); // 2026-10-21: OnPlayEmitter / OnFinishEmitter
        if (l.inst.done && l.status && l.again && l.unit?._fxStatusOn?.has(l.status) && l.unit.alive !== false) { const a = l.again; l.again = null; a(); } // local patch: a status loops
        // a kept effect (playAt `keep`: 望's stone activation) stays until its owner's 'die' stops it
        // 2026-10-24: a projectile's main effect stays while it flies (`flight`: its trail record) — the client finishes it when
        // the projectile stops (finishShot). One without a clip or particle system (流星 S2's arrow: a mesh and two 0.15 s
        // trails, `duration` 0) was done 0.15 s after it left and vanished mid-flight
        if (l.inst.done && !(l.keep && !l.inst.stopping) && !(l.flight && trails.includes(l.flight))) { dropLive(l); live.splice(i, 1); }
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
      stormGen++;
      for (const l of live) dropLive(l);
      live.length = 0;
      lastAtk.clear(); healAtk.clear(); aimed.clear(); chainLines.clear(); strikes.clear(); lastHit.clear(); lastAttackFx.clear(); movers.clear(); notes.clear(); gone.clear(); wolves.clear(); packs.clear(); lemMarks.clear();
      for (const r of trails) if (r.back) boomerangCaught(r.src); // local patch: back in hand for the next battle
      trails.length = 0; pending.length = 0; // local patch
      castsDelayed.length = 0; zones.clear(); eborn.clear(); eskillSeen.clear(); elines.clear(); ebreath.clear(); eshotLand.clear(); emortars.length = 0;
      deployed.clear(); startedOnce.clear(); opDead.clear(); ebuffs.clear(); // 2026-10-11
      linkAxes.clear(); linkRuns.clear(); throwLand.clear(); // 2026-10-22
      brokeOwn.clear(); // 2026-10-23
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
      const inst = new mod.fxp.FxInstance(def, { quality: q(), facing: f < 0 ? -1 : 1, split, floor: at.z || 0, tilt: tiltOn(at, def) });
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
        paused: live.filter((l) => l.paused && !l.inst.done).map((l) => l.inst.def?.name ?? '?'), // 2026-10-21: held by a pause behaviour (stepPauses)
        mode0: live.filter((l) => l.tag === 'mode0' && !l.inst.done && !l.inst.stopping).map((l) => l.inst.def?.name ?? '?'), // 2026-10-21: the Default mode's (defaultModeFx)
        trailAt: trails.map((r) => (r.inst ? [+r.inst.object.position.x.toFixed(2), +r.inst.object.position.y.toFixed(2), +r.k.toFixed(2)] : [r.k])), // local patch
      };
    },
  };
  return api;
}
