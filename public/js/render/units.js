// render/units.js — per-unit views for battle units and prep pieces (DESIGN §9).
//
// UnitView = shadow sprite (shadow layer) + body container (depth-sorted unit layer: elite aura, Spine actor or
// the avatar-in-rarity-diamond fallback) + HUD container (bar layer: HP bar with delayed "ghost" damage, SP bar
// with ready glow / draining skill bar, tier chip, status icons, blocked marker). The fallback shows at once and
// cross-fades to the Spine model when it has loaded (the game never blocks on Spine); an optional local-client model
// (assets.js spineEntry `fallback`, DESIGN §13: 灼热源石虫 / 炽焰源石虫) falls back to the web model first; that web alias
// (the plain 源石虫) is drawn tinted toward the slug's own colours (ALIAS_TINT). A model that failed or timed out is
// loaded again after SPINE_RETRY_MS (bounded), and `retryAssets()` re-resolves a view's picture and model when the
// asset manifest arrives after the view was built or the tab is shown again (render/app.js; public issue #8 item 5:
// after a reload whose manifest was slow or failed, every operator stayed the image-less placeholder for good); a load
// begun while the tab was hidden and still in flight SPINE_STUCK_MS after it is shown again is started again
// (assets.js spine.restart: GitHub #68, such a load may never settle — its view stayed the placeholder). Every
// bar is a tinted Texture.WHITE sprite, so HUDs batch into few draw calls.
//
// Placement: feet anchored at world (x, y, z); scale = camera px-per-tile at the feet × UNIT.modelScale, so
// chibis shrink with distance like the original. An enemy's model is also scaled by its official prefab factor
// (enemies.json `modelScale`, user playtest #6 item 9: the official battle prefab shrinks e.g. 威龙 to 0.16 / 0.27 of
// the standard size — tools/build-data.mjs MODEL_SCALES; `enemyModelScale`). Operators and summons face their deploy direction `dir`
// (research 09 §1.2, DESIGN §3: UP|RIGHT|DOWN|LEFT, chosen with the direction wheel; UnitInfo / piece `dir`, else
// the legacy `facing` ±1): the Back model for UP (when one exists, research 07 §5.5), the Front model for RIGHT and
// DOWN, mirrored for LEFT; the orange ground wedge "›" of prep board pieces points along `dir` (rotated on the ground
// plane). `setDir(dir)` re-orients a live view (swapping Front ⇄ Back without a fallback flash). In battle an attack turns
// an operator to its target and it faces `dir` again with no target left (`face`, turnTo — render/face-turn.js,
// docs/rules/render.md 「공격 방향」): mirrored toward a target behind it, the Back model for one above it, each change played
// as the client's 0.15 s turn about the upright axis (`turnS`: the model narrows to edge-on, changes, widens). Enemies flip by the
// sign of their horizontal velocity (with hysteresis). A dead or knocked-out operator facing UP falls and lies with its
// Front model — 131 of the 135 Back skeletons have no Die clip (GitHub issue #25: the Back model went on with its
// attack loop under the redeploy ring) — and stands up again with the Back model (`_wantsBack`, `_syncModel`).
//
// Knocked-out operators (user playtest #4 item 9, b.snap `down`): `setDown([id, respawnAt, respawnTime, state, row,
// col])` keeps a dead operator on the tile it lies on (row / col: where it fell, or its home — sim Battle._layBody,
// player report F5 after 0.1.0) in its knocked-down pose — the Spine Die clip played once and held on its last
// frame (the collapsed / kneeling pose with closed eyes; the Front model's for one facing UP unless its Back skeleton has its own Die clip, see above), slightly
// greyed — with a redeploy ring above its head:
// a dark disc, a mint arc filling as the respawn timer runs and the seconds left; once the timer is done and it still
// waits, a full amber ring with "DP" (not enough DP) or a red ring with "!" (its tile is taken). `onDeploy` (the
// redeploy) plays the deploy clip and restores the normal look; `setDown(null)` on a dead view lets it fade out.
// An operator that enters a battle already knocked out (联防, user playtest #5 item 2: sim 'die' reason 'forcedExit')
// goes down with `die(true)`: straight to the held end of the clip, no fall.
// Enemy modes (the `form` of a sim fx — shared/protocol.js fxForm — → `setForm(form, fx)`): 掠海漂移体 dropping to 爬行模式
// (user playtest #5 item 1) plays its skeleton's 'Change' clip once, then the crawl set (*_02); 暴鸰 flies on without its
// bomb (*_2) after the drop (feedback D4); 转译基底's forms, the 逐火 embers, 再生's puppet, the leaders' 重生 and 守墓石像
// likewise (user report after 0.1.0) — FORMS; an operator's form is a 傀儡师's 替身 (GitHub issue #44). A view built later
// (`info.form` = UnitInfo `form`, the sim's current form, through render/app.js renderInfo) starts in the mode; a dead
// view keeps the form it died in (`_dieForm`) for a model built while it lies down.
// Element gauges (b.snap `elem` → sample `el` / `elFill` / `elUntil` / `elDur`), the official form (PRTS 元素: "模型
// 下部会显示对应的元素图标，并以白条显示剩余的元素值"; enemies "小尺寸图标（不显示元素图标，仅根据元素种类改变背景色）"): a row
// right under the unit's own HP / SP bars and inside their span — the element's disc at the left (operators with its
// glyph, enemies smaller and plain) and a white bar of the remaining 元素值 (1 − fill) that runs out right to left
// like the HP bar above it; during a 爆发冷却 the bar refills over the cooldown (PRTS: "元素条显示缓慢恢复至上限"), drawn in
// the element's colour with the disc pulsing [ASSUMED look], so a refill never reads as 元素值 still left while the
// burst's stun / damage / 凋亡 ticks hit the unit. User playtest #6 (report 11): the v2.3 ring right of the bars sat on
// the next operator's tier chip and bars (drawn under them) and read as that operator's gauge, a shrinking ring reads
// like a filling progress ring, and its refill was the same white as the 元素值 left. The disc comes from the hudRings
// atlas, the bars are tinted Texture.WHITE sprites; built on first use and hidden when idle.
//
// ItemView renders hand items as a floating icon plate; DeviceView renders battle devices (crates) as 3D boxes
// with an HP bar once damaged.
//
// Cost control (low-end devices): a unit whose body is outside the viewport (`ctx.viewport()`, with a margin) is not
// animated or drawn at all (its clock catches up, ≤ 0.5 s, when it comes back); `opts.lod: 'idle'` (the enemy preview
// pen: idle loops only) animates through the impostor atlas every 3rd frame; under the view's adaptive load level
// (`ctx.loadLevel()` 1–3, app.js) small / far units (< ~56 px per tile) animate every 2nd frame, and from level 2 on
// every unit does.
//
// Picking is by tile (render/pick.js, user playtest #4 item 1): views carry no hit shapes; `bounds()` is the drawn body's
// screen rect for tooltips and overlays (view.pieceScreenRect). A dragged (lifted) item plate is drawn centred on its
// ground point, i.e. on the pointer (render/app.js).

import { UF, ANIM } from '../../../shared/constants.js';
import { SpineActor } from './spine.js';
import { diamondTexture, shadowTexture, fxAtlas, tierChip, statusTexture, itemTexture, hudRings, ringArc, downLabel, HUD_DISC, ELEMENT_RING } from './textures.js';
import { COLORS, TIER_COLORS, ENEMY_FRAME, UNIT, PROJ, statusIconKey, statusIconSuppressed } from './style.js';
import { drawCrate, rowDepthKey, ROW_KEY, deviceBoxOf, DEVICE_BOX } from './tiles.js';
import { noHpBar, facingless, bodyless } from '../../../shared/trap-tokens.js'; // local patch; 2026-10-11 bodyless markers
import { UF_CAMOU, UF_LIFTOFF } from '../../../shared/local.js'; // local patch: 迷彩 icon; 起飞
import { FacingMarker, facingTextures } from './facing.js'; // local patch: official facing marker
import { faceOf, turnFace, turnWidth, dirVector, NEAR_SQ, SWITCH_TIME } from './face-turn.js'; // an operator turns to its target (「공격 방향」)
import { iconShownAsFx } from './fxstatus.js'; // local patch: statuses drawn as official effects
import { aglGlideBack } from './fx/kinds.js'; // 予愿安洁莉娜 S2's glide: when her model is back
import { syncHeldWeapon } from './boomerang.js'; // local patch: a 回环射手's boomerang in her hand (Spine skin 'Bullet')
import { ElementRing, epRingReady, AllyBars, EnemyBars, giantBossOf, hudUnit, hudAnchorY, prepChip, PREP_CHIP, EquipBar, equipTextures, shieldedBar } from './hud-bars.js'; // local patch: official battle HUD

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const DIRS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
/** Deploy direction of an ally from a UnitInfo / piece: `dir` (any case), else the legacy `facing` sign. */
export function unitDir(info) {
  const d = typeof info?.dir === 'string' ? info.dir.toUpperCase() : null;
  if (d && DIRS.includes(d)) return d;
  return info?.facing === -1 ? 'LEFT' : 'RIGHT';
}
/**
 * Official size factor of an enemy's model (enemies.json `modelScale`: its battle prefab's scale / the standard 0.27;
 * 1 when absent or unusable) — applied on top of UNIT.modelScale to the skeleton and to the head (bar) height.
 */
export function enemyModelScale(rec) {
  const k = Number(rec && rec.modelScale);
  return Number.isFinite(k) && k > 0.05 && k < 20 ? k : 1;
}
/**
 * Vertical stretch of an enemy's model on top of `enemyModelScale` (enemies.json `modelScaleY`, the official battle
 * prefab's `Graphic` scale sy ÷ sx; 1 when absent or unusable). `modelScale` only carries the horizontal product of
 * Graphic / FaceSwitcher / Spine, so a model whose prefab has a non-uniform scale is drawn too short without this.
 * Two enemies have one — 帝国炮火先兆者 and 帝国炮火中枢先兆者 at 1.263 (Graphic (0.19, 0.24, 0.24): the official draws
 * them 26 % taller than their width implies); a sweep of all 242 readable enemy prefabs found no other
 * (tools/local-extract/enemy_model_offsets.py, docs/research/12 §3.1; PR #211 by @xcdoge).
 */
export function enemyModelScaleY(rec) {
  const k = Number(rec && rec.modelScaleY);
  return Number.isFinite(k) && k > 0.2 && k < 5 ? k : 1;
}
/**
 * Official size factor of a summon's model: its battle prefab (pkgrps/btl_pfb_tokens_*.ab) Spine transform product / the
 * standard 0.27, like an enemy's `modelScale` (2026-10-08, client EN; every other tokens.json summon is 0.27).
 */
export const TOKEN_MODEL_K = Object.freeze({
  token_10000_silent_healrb: 0.4 / 0.27, token_10006_vodfox_doll: 0.4 / 0.27,
  token_10031_swire2_gdtrap: 0.25 / 0.27, token_10057_svash2_eagle1: 0.25 / 0.27, token_10057_svash2_eagle2: 0.25 / 0.27,
  token_10057_svash2_eagle3: 0.25 / 0.27,
});
/**
 * Seconds of the death clip of a manifest Spine entry (`anims.die`, else a 'Die' clip, as SpineActor.dieClip; its
 * `animations` duration), 0 when it has none — 131 of the 135 operator Back models (GitHub issue #25).
 */
export function dieClipDur(entry) {
  const durs = entry && entry.animations && typeof entry.animations === 'object' ? entry.animations : null;
  if (!durs) return 0;
  const name = (entry.anims && typeof entry.anims.die === 'string' && entry.anims.die) || 'Die';
  const d = Object.hasOwn(durs, name) ? Number(durs[name]) : NaN;
  return Number.isFinite(d) && d > 0 ? d : 0;
}
/**
 * render/app.js syncBattle's step for one view and its interpolated sample `s` at render time `t`: a living view (or a
 * device) takes the whole sample; a dying one only the position — its DIE window in the snapshots; one shown alive
 * again (redeployed without an event) stands up first.
 */
export function syncView(v, s, t) {
  if (v.alive || v.info?.kind === 'device') v.sync(s, t);
  else if (v.dying > 0) { if (typeof v.followSample === 'function') v.followSample(s, t); else { v.x = s.x; v.y = s.y; } }
  else if (s.anim !== ANIM.DIE && s.hp > 0) { v.revive?.(); v.sync(s, t); }
}
/** World step (x = col, y = row) of a direction. */
export const DIR_STEP = Object.freeze({ UP: [0, 1], RIGHT: [1, 0], DOWN: [0, -1], LEFT: [-1, 0] });
const nowMs = () => (globalThis.performance ? globalThis.performance.now() : Date.now());
/**
 * local patch (official deploy, maintainer's notes 2026-10-07): an allied unit with a Spine model
 * drops in by its own Start clip (103 of 143 operator skeletons fall from 0.6–7 body heights, landing at ~0.2 s) — no
 * alpha fade-in, no mint pillar (fx.deploy skips a `bornOfficial` view), the ring and shadow before the body (BORN_LEAD_S),
 * and the body starts dark for BORN_TINT_S (the capture's first frame, client `_disableBornTweenColor`;
 * ×(1 − BORN_TINT_K) and the length are [추정]).
 */
const BORN_TINT_S = 0.1;
const BORN_TINT_K = 0.4;
/**
 * Deployed before its model is in (a battle start builds every view and model at once: the models came 0.17–0.31 s after
 * the 'deploy' in a real round 1): the ground ring + shadow show first, the body (model, diamond, bars) at least
 * BORN_LEAD_S later, when the model is in, and Start plays from its start — the official round start shows rings and
 * shadows ~0.1 s before the operators (`11-phase-drop-rings-first`); catching the clip up skipped the whole fall. One not in
 * within BORN_WAIT_MAX_S shows the diamond as before. A model already shown (a prep placement, a redeploy) drops at once.
 */
const BORN_LEAD_S = 0.1;
const BORN_WAIT_MAX_S = 1;
/*
 * The official round start deploys its pieces one by one (maintainer re-report 2026-10-08 2-4). Until 2026-10-10 the view
 * staggered the opening deployment itself (BORN_STAGGER_S 0.12 s a piece, the sim unchanged); since then the sim deploys
 * one piece every 0.2 game s (server/sim/battle/lifecycle.js _prebuiltStep, client `_Prebuilt`) and each 'deploy' event
 * drops its piece at once — docs/rules/render.md 「배치 낙하」.
 */
/** local patch: the most one frame advances a playing drop-in (Start) — a hitch of the battle switch cannot skip it. */
const DEPLOY_MAX_STEP_S = 1 / 30;
/** Frames a held pose's impostor slot (SpineActor.poseHeld) goes without a redraw at most (~4 s at 60 fps): a WebGL
 *  context lost and restored gives the atlas back blank (_updateImpostor). */
export const HELD_REDRAW_FRAMES = 240;
/** Units with no art in the game data drawn as an ice diamond: 圣聆初雪 S2's frozen protection point (保护目标（冻结状态）, PRTS
 *  无头像; data/assets.json has no avatar or model for it, so the token fallback showed 圣聆初雪's own face) — the marker of a
 *  frozen gate. */
const ICE_TOKENS = new Set(['token_10058_sbell2_icetgt']);
const ICE_FRAME = 0x9fe6ff;
/** How long a view waits for its avatar before showing the image-less placeholder diamond. */
const PIC_WAIT_MS = 400;
/**
 * Waits (ms, real time) before a view loads its Spine model again after the load failed or timed out (assets.js, 20 s)
 * — bounded: after the last one the view keeps its diamond until `retryAssets` (a manifest that arrived late, the tab
 * shown again). Counted from the failure; a hidden tab runs no frames, so nothing is retried while hidden.
 */
export const SPINE_RETRY_MS = Object.freeze([2000, 6000, 15000, 30000]);
/**
 * A Spine load begun while the tab was hidden and still in flight this long (ms, real time) after the tab is shown again
 * is started again (`retryAssets` arms it, `update` fires it; GitHub #68: such a load — a request the hidden tab left
 * hanging — may never settle, and the view stayed the placeholder). A load that finishes within it is never doubled.
 * [ASSUMED] the length: a healthy load finishes within a few seconds once the tab is visible.
 */
export const SPINE_STUCK_MS = 5000;

/** Heights above this count as standing on a raised top (bench pads are the lowest raised tiles, 0.16). */
const RAISED_Z = 0.12;
/**
 * Flying units hover this many tiles up (PR #211 by @xcdoge; the owner's decision of 2026-10-06;
 * docs/research/12-flying-visuals-official.md): an enemy flyer above the road (z 0) whatever tile it crosses — a raised
 * block under it is no step (GitHub #277) —, an operator or summon above its tile.
 *
 * The official client's fly offset is a **single constant, `Vector3(0, 0.35f, 0)`**: `Torappu.Battle.CharacterAnimator`'s
 * constructor stores it in the instance field at +0x114 (`GameAssembly.dll` 0x180600555 reads the constant at 0x186a78a50 =
 * 0x3EB33333; x and z are 0), and `_SetFlyMountPointOffset` / `_SetFlyHitOffset` add it to the mount / hit transforms
 * while the unit flies and add its negation when it lands (the sign flips through the −0.0 mask at 0x186a77e00). It is
 * model-independent: no store to that field exists anywhere in the binary except the constructor.
 *
 * `0.35` is that constant in the client's own (character) space, whose unit is the standard battle-prefab scale **0.27**
 * (our `enemies.json modelScale` is a multiple of it — units.js `enemyModelScale`), so the lift is **0.35 / 0.27 ≈ 1.3
 * tiles** [ASSUMED: the hierarchy that yields the 1 / 0.27 factor]. An official screenshot (帝国炮火先兆者 over a tile)
 * measures the same: the drone's art bottom sits 1.2–1.4 tiles above the ground it crosses.
 *
 * **No per-model term** — (a) the binary never rewrites the offset; (b) the battle prefabs carry no per-model vertical
 * correction for flyers (their `Graphic` node sits at local (0,0,0), or at the (0,−0.2,−0.06) their ground-unit prefab
 * family shares — unrelated to how far each model's art hangs below its pivot). So a model whose art hangs below its
 * origin keeps that hang in the official too: 妖怪 flies with its rotors ≈ 0.9 tiles up, 帝国炮火先兆者 with its art
 * bottom ≈ 1.3. It replaced a flat 0.32 (player report 2026-10-05: 无人机等飞行单位位置明显偏低 — every flyer was ~1 tile
 * too low). The shadow stays on the ground under the unit; the HP bar, damage numbers, projectile hits and skill rings
 * ride the body (`hover`); range highlights are tiles.
 */
export const FLY_HOVER = 1.3;
/**
 * An airborne (起飞) operator whose client data sets its own lift (tiles), instead of FLY_HOVER: the trait blackboard's
 * `height_offset` (character_table), which her mode buffs move the model's graphic holder to (ModifyGraphicHolderHeight:
 * aglna2_s_2[chant_end], aglna2_s_3[mode] — the latter 0.4 on a high-ground tile, `high`). 予愿安洁莉娜 0.8 (maintainer
 * report 2026-10-12 「제자리에 돌아왔을 때 이륙 고도가 지금보다 낮다」: she flew at 1.3) [ASSUMED: the offset is in tiles —
 * world space, not the 0.27 character space of the flyers' 0.35].
 */
const LIFTOFF_HEIGHT = Object.freeze({
  char_1015_aglna2: { lift: 0.8, high: 0.4, highSkill: 2 },
  // 凯尔希·思衡托: no ModifyGraphicHolderHeight in her charpack or any kalts2_* buff template, `_motionMode` 0 — her 起飞
  // (kalts2_t_1) only changes her block mode, so the client draws her on her tile (maintainer request 2026-10-12)
  char_1052_kalts2: { lift: 0 },
  // 蒂比: her skills' `attack@height_offset` 0.8 (skill_table), which tippi_height_ctrl[tween] moves her graphic holder to
  // (no high-ground variant) (maintainer decision 2026-10-12)
  char_4191_tippi: { lift: 0.8 },
});
/**
 * A push / pull slide (推拉, PR #380 by @xcdoge). The sim displaces at once — server/sim/battle/displacement.js walks its
 * 0.1-tile steps inside one call — and then holds the enemy in its 失衡 (UNBALANCE) state (PR #392's idea): a push for the
 * 位移时间 of its 受力等级 (PRTS 游戏数据基础 推力-位移近似对应表: 0.2 … 35/30 game s), a pull for its force window (推与拉:
 * 0.5 / 1 s). The snapshots only ever show the destination, so the view slides there under a constant deceleration
 * (UnitView.slideTo) for that same span: the `displace` fx carries it (`dur`, game seconds) and the view divides it by the
 * playback rate (ctx.animRate — 2 game s per real second by default: a 0.8 s push slides 0.4 real s) — it lands as the
 * sim's state ends. v0 = 2D/T, a = v0/T then run the distance in exactly T. DISPLACE_SLIDE (real s per √tile, kept in
 * 0.12–0.45 s) is only the fallback for an fx without `dur` (a recording made before 0.2.2) [ASSUMED].
 */
export const DISPLACE_SLIDE = 0.14;
/**
 * Terrain friction factor of a slide: 1 = normal land, < 1 = slippery (ICE_LAND) slides longer. Every tile of this mode
 * is normal land (its 11 maps have no ice or slime), so it is always 1.
 */
export const SLIDE_FRICTION = 1;
/**
 * Seconds of the death fade that follows the Die clip in `dying` (die(): the clip, then this tail). A flying unit keeps
 * its lift for the whole clip and drops only inside this tail (PR #380: the official client removes its fly offset in
 * `CharacterAnimator.OnFinish`, when the finish state ends — docs/research/14-death-animations.md).
 */
const DIE_FADE_TAIL = 0.55;
/**
 * Longest Die clip a death plays out (s): the longest enemy Die clip of data/assets.json is 盐风主教昆图斯's 7.97 s (234
 * enemy Die clips; the old 1.6 s cap cut 25 of them short — the bosses' most), and the official client plays its clip
 * out (PR #380). It only bounds a view whose data lies.
 */
export const DIE_CLIP_MAX = 8;

/** b.snap `down` entry states (server/sim/constants.js DOWN_STATE). */
export const DOWN_STATE = Object.freeze({ COUNTING: 0, WAIT_DP: 1, WAIT_TILE: 2 });
/** Knocked-down look: model tint and alpha; redeploy ring colours per state; ring size (tiles) and height. */
export const DOWN_LOOK = Object.freeze({
  tint: 0xb4b4b4, alpha: 0.92,
  ring: Object.freeze({ [DOWN_STATE.COUNTING]: 0x4ed8af, [DOWN_STATE.WAIT_DP]: 0xffc600, [DOWN_STATE.WAIT_TILE]: 0xff4b3e }),
  size: 0.42, height: 1.02,
});
/**
 * local patch (LOCAL-PATCH.md 「배치 UI」): a piece being placed — dragged, or held on its tile while its direction is
 * chosen — is drawn see-through like the official client's deploy preview. [추정] 0.6 (KR client capture).
 */
export const GHOST_ALPHA = 0.6;
/**
 * An enemy drawn with another enemy's web model because its own is only in the local client (manifest `spineAliasOf`
 * + `spineLocal`: 灼热 / 炽焰源石虫 → the plain 源石虫's skeleton, feedback D3 after 0.1.0): a multiply tint toward its own
 * lava colours (orange / red-orange), so it reads apart from the plain slug where the local art was not extracted
 * (research 07 §5.6 "a hue shift") [ASSUMED look]. Never on its official (local) model; status tints win over it.
 */
export const ALIAS_TINT = Object.freeze({ enemy_1305_mhslim: 0xffc48a, enemy_1305_mhslim_2: 0xff9070 });
/**
 * Element gauge row under the bars (see header): the disc's diameter in tiles and its pixel clamp (enemies × `enemy`),
 * the gap under the bars (px). The white bar is as tall as the SP bar and fills the rest of the bars' width. During a
 * 爆发冷却 the refilling bar takes the element's colour (textures.js ELEMENT_RING `tint`) and the disc's alpha pulses
 * between `pulse` and 1 at `pulseHz` (real time).
 */
export const EL_BAR = Object.freeze({ icon: 0.15, min: 8, max: 15, enemy: 0.8, gap: 1, pulse: 0.45, pulseHz: 1.5 });

/**
 * Enemy modes drawn with another clip set of the same skeleton (the `form` of a sim fx — shared/protocol.js fxForm —
 * → UnitView.setForm), per Spine id; the mode's roles override the manifest's (data/assets.json anims), `change` plays
 * once first:
 * - 掠海漂移体 (PRTS: 受晕眩/沉睡/冻结影响后进入爬行模式 — for good) crawls on its *_02 clips after 'Change';
 * - 假想敌：骨刺 (GitHub #296, PR #365): not an fx — its form follows the snapshot's stealth bit (STEALTH_FORMS): the
 *   manifest's *_A (the three-headed snake) while its 隐匿 is on, 'revealed' *_B the moment it is blocked or revealed, *_A
 *   again when the 隐匿 is back; no change clip, a running attack / stun pose carried over (SpineActor.syncFormPose);
 * - 暴鸰 flies on its bomb-less *_2 clips once its one bomb left (the official prefab's mode S1: Move→Move_2, Idle→Idle_2,
 *   Die→Die_2; user feedback after 0.1.0, D4: the bomb used to stay under the drone — no change clip, the drop is its
 *   Attack clip);
 * - 转译基底·α (user report after 0.1.0, #5): its 2 s change clip A_Die_B / _C / _D, then 寻仇者 B_*, 幽灵 C_* (no attack
 *   clip: it never attacks) or 特战术师 D_* — its manifest roles are the original form's A_Idle / A_Move;
 * - 深池逐火战士 / 精锐战士 / 护卫 (#8): knocked out → 'Die' (the 1 s 重生), the 余烬 on Idle_2 / Move_2 and its death on
 *   Die_2 (also while 'Revive' plays: the ember can still be beaten); standing up again → 'Revive', then the warrior's
 *   manifest clips;
 * - 假想敌：再生: knocked out → A_Die, the 傀儡 on B_Idle / B_Move / B_Die; back → B_Revive, then the A_* manifest clips;
 *   (both: the stand-up clip (`end`) is timed from the 'ember' fx's `dur` to end as the husk stands up — the 'revive'
 *   fx then only lands in the manifest clips);
 * - the leaders' 重生 (sim reborn(): forms 'reborn' → 'form2'): 锏 Revive1, Revive2 held, Revive3, then B_*; 扎罗 A_revive_1 /
 *   _2 / _3, then B_* (its double-hit attack); “复仇者” Revive_Begin / _Loop / _End; 杰斯顿 C1_Die (its 4 s 重生), then
 *   C2_* — their manifests mix the forms (锏 / 扎罗 died on B_Die from the A model, the look of report #5). The closing
 *   clip (`end`) is timed from the 重生's `dur` (the 'telegraph' fx) to end with it, so the second form walks and
 *   attacks on its own clips at once (a view that missed the timing — built mid-重生 — skips the closing clip);
 * - 守墓石像 (forms 'stone' → 'fly'): the statue on Sleep [ASSUMED by name], then the flyer's *_2 clips.
 * - the 孤岛风云 prisoners (sim content/enemies/archetypes.js prisoner: forms 'warning' → 'liberty'), as their official
 *   battle prefabs' modes: confined on the manifest's clips (the grey collar light: 普通囚犯 / 老练囚犯 Idle3 … through
 *   tools/assets/spine.mjs PREFAB_SPINE_ROLES, 强壮囚犯 Idle …, 拳师囚犯 / 重犯 / 传奇重犯 *_grey), mode R — the warning
 *   before the last confined attack — on the blinking orange set (*2, *_orange), mode L — 【解放】 — on the red set
 *   (普通囚犯 / 老练囚犯 Idle …, 强壮囚犯 *3, the others *_red); no change clip (the prefab switches the set at once).
 * - the 傀儡师 operators' <替身> (sim professions.js installDollkeeper: form 'doll' from the start of the switch to it
 *   until the switch back starts, GitHub issue #44): the skeletons draw it on their *_B clips (their own slots — the
 *   本体's are hidden). 归溟幽灵鲨: Start_B fades it in (the 1 s switch), Idle_B (it never attacks), Die_B breaks it
 *   apart over its last second (`end`, timed from the 'substitute' fx's `dur`), the 本体 comes back on Start_2 (`leave`:
 *   played when the form ends); knocked out as the 替身 it collapses on Die_B_2 and stays down so. 风丸: Die_2 → Start_B
 *   (charpack CommonAbilities kazema[switch2stand]), then Idle_B / Attack_B (her 替身 attacks), Die_B as its death; the
 *   本体 comes back on Die_B → Start ([switch2normal]: Die_B → Born) — two clips in a row each way, while the sim's switch
 *   (professions.js DOLL_SWITCH) is 1 s [ASSUMED], so her 替身's first attacks wait for Start_B to end on screen. Facing
 *   UP: 归溟幽灵鲨's Back skeleton has only Idle_B and Start_2, 风丸's Start_B, Idle_B and Attack_B — the clips a Back
 *   skeleton lacks are skipped; neither has the 替身's death clip, so a 替身 knocked out lies on the Front model like every
 *   knocked-out operator facing UP (_wantsBack). The sim resets the form right after the 'die' event; the form it died in
 *   (`_dieForm`) gives the model built for the knock-out — and one rebuilt while it is down — the 替身's death clip; it
 *   stands up as the 本体.
 * - 烛煌 (char_1040_blaze2) 绝处重燃 (her kit: fx 'downed' → form 'downed', 'revive' → null): downed on Revive_Begin, lying on
 *   Revive_Idle (her charpack talent mode), up again on Revive_End (`leave`). Knocked out while downed she falls on Die and the
 *   form ends with the knock-out (`endsOnDeath`: the sim clears it without an fx).
 * - a skill's sub-mode (`endsWithSkill`: the view drops the form as the skill ends, after its End clip is chosen — the
 *   sim clears unit.form without an fx), drawn as the skill's clips of that mode (charpack modes, docs/rules/render.md
 *   「Spine 클립 커버리지」 D): 寒芒克洛丝 S2's 4 shots after 40 hits (fx 'quadShot' → 'quad': mode S2_Sub Skill_Loop_2),
 *   维什戴尔 S2's overload, the second half (fx 'wisdelOverload': mode S2_Overload — Skill_2_Overload_Begin, then
 *   Skill_2_Overload_Idle / _Loop, closing on Skill_2_Overload_End instead of Skill_2_End: the skin's mix clips), 佩佩 S3 at
 *   its full range (fx 'rangeMax': Skill_3_Loop_B for Skill_3_Loop_A, buff pepe_s3_range_max).
 * - 赤刃明霄陈 S2 (her kit's 'chen3Vanish' fx → form 'vanish', 'chen3Respawn' → null): skchr_chen3_2 `_animKey
 *   "Skill_2_Begin"` then `_endAnimKey "Skill_2_Disappear"` — gone (`hold`: the last frame of the change clips stays, mode
 *   'held') while she slashes —, back on Start_2 (`leave`: mode S2Respawn Born→Start_2), then her plain clips.
 * - 丰川祥子 S2's organ timbre (her kit's 'spGain' fx → form 'organ', null back to the piano): charpack S2_AttackSpeed
 *   Idle→Skill_2_Idle_B, Attack→Skill_2_Loop_B over the piano that S2 sets from the deployment (anims `equip`).
 * - 泥岩 (char_311_mudrok) S3's 10 s sleep (her kit: fx 'stone' → form 'dormant', 'rockfall' → null; skchr_mudrok_3
 *   SleepAura `_default`): Skill_2_Begin, asleep on Skill_2_Sleep, Skill_2_Awake as she wakes (`leave`), then the S3 mode's
 *   Skill_2_Idle / Skill_2_Attack. Her Back skeleton has none of the three: asleep on Skill_2_Idle (a role `idle` may list
 *   clips, the first the skeleton has).
 * A kind without a clip set of this skeleton (barriers, charges, …) changes nothing. 吉兆飞鳞's 晕眩模式 is its Stun clip.
 */
/**
 * Enemy forms that follow the snapshot's stealth bit (UF.STEALTH: the sim sends it only while the enemy's 隐匿 is on —
 * not blocked, not revealed) instead of a sim fx, per Spine id: the FORMS kind drawn while the bit is OFF; the manifest's
 * clips while it is on. Switched at once (UnitView.sync, and for a model loaded later the load callback).
 */
export const STEALTH_FORMS = Object.freeze({ enemy_9008_acbunn: 'revealed' });

/**
 * 要塞 (fortress) operators whose blocked and unblocked attacks are two clips of one role, per Spine id: [melee, ranged]
 * pairs (SpineActor.fortressClips; the latest attack's kind picks — the sim's 'swing' / 'atk' projectile 'none' while it
 * blocks). Client prefabs `<id>/Modes/<mode>/Body/Attack/`: MeleeAttack / BlockedMeleeAttack / BlockedRangedAttack play
 * the first, RangedAttack the second (maintainer report 2026-10-10: 号角 played Attack_A for her ranged attacks too, and
 * 灰毫 played her ranged Attack01 while blocking). 号角's Skill_1_A / _B have no ability of their own [추정: same split].
 */
export const FORTRESS_CLIPS = Object.freeze({
  char_4039_horn: Object.freeze([['Attack_A', 'Attack_B'], ['Skill_1_A', 'Skill_1_B'], ['Skill_2_A_Loop', 'Skill_2_B_Loop'], ['Skill_3_A_Loop', 'Skill_3_B_Loop']]),
  char_431_ashlok: Object.freeze([['Attack02', 'Attack01']]),
});
/**
 * Skills whose mode keeps the skill's loop clip on as its stance and attacks without a clip of its own, per Spine id: the
 * 0-based skill indices (SpineActor.stanceSkills). Client charpack: 烛煌 `Modes/S3` `_replaceAnimPairs` Idle → Skill_3_Loop
 * and its Attack ability `_animKey ""` (tools/assets/local-attack-timing.json S3 anim "") — the Skill_3_Loop flame
 * stance runs from Skill_3_Begin to Skill_3_End while her attacks fire from it (maintainer report 2026-10-10: after her
 * first S3 attack she stood in Idle, the loop replayed from its start at each attack).
 */
export const STANCE_SKILLS = Object.freeze({ char_1040_blaze2: Object.freeze([2]) });

/**
 * Enemy models drawn this many columns right of their unit (body and shadow; the HP bar keeps its own giant offset), by
 * enemy key. [ASSUMED] 假想敌：管's hidden-core copy (enemy_9021_acduml_2, boss_10): its level stands it on (row 3, col 9) —
 * one column left of the normal 管 (act1autochess_h07_03, col 10) — while its prefab moves the hit box one column right
 * (BoxCollider2D m_Offset x 1; the normal one 0) and the boss HP bar 1.4 right (`_bossHudOffset`); the Spine data, the
 * Graphic node, the level's map and camera are the same as the normal copy's, so nothing found in the client moves the
 * model. User report 2026-10-10: the hidden-core 管 looks shifted left while the normal one is right → drawn over its hit
 * box (col 10). 假想敌：弦 (its partner on the same tile) has no such offsets and stays.
 */
export const MODEL_SHIFT = Object.freeze({ enemy_9021_acduml_2: 1 });
const loop =(name, via = null) => Object.freeze(via ? { begin: null, loop: name, end: null, via } : { begin: null, loop: name, end: null });
const clipSet = (idle, move, die, attack = null) => Object.freeze({
  idle, deploy: idle, die, move: loop(move),
  attack: attack ? loop(attack, 'attackAny') : null,
  skill: attack ? Object.freeze({ begin: null, loop: attack, end: null, via: 'attack', index: 0, idle: null }) : null,
});
const EMBER = Object.freeze({
  husk: Object.freeze({ change: 'Die', end: 'Revive', next: 'revived', roles: clipSet('Idle_2', 'Move_2', 'Die_2') }),
  revived: Object.freeze({ change: null, roles: Object.freeze({}) }),
});
/** A 重生 held on `hold` (also while the sim reports the rebirth's stun) after `begin`, closing on `end` as the 重生 ends,
 *  then the second form. */
const rebirth = (begin, hold, end, form2 = Object.freeze({})) => Object.freeze({
  reborn: Object.freeze({ change: begin, end, next: 'form2', roles: Object.freeze({ idle: hold, deploy: hold, move: loop(hold), stun: loop(hold), attack: null, skill: null }) }),
  form2: Object.freeze({ change: null, roles: form2 }),
});
const STATUE = Object.freeze({
  stone: Object.freeze({ change: null, roles: Object.freeze({ idle: 'Sleep', deploy: 'Sleep', move: loop('Sleep'), stun: loop('Sleep'), attack: null, skill: null }) }),
  fly: Object.freeze({ change: null, roles: clipSet('Idle_2', 'Move_2', 'Die_2', 'Attack_2') }),
});
const JAKILL2 = clipSet('C2_Idle', 'C2_Move', 'C2_Die', 'C2_Attack');
/** A prisoner's 'warning' (mode R) and 'liberty' (mode L) clip sets: the clip-name suffix of each (see the list above). */
const prisoner = (warn, free) => Object.freeze({
  warning: Object.freeze({ change: null, roles: clipSet(`Idle${warn}`, `Move${warn}`, `Die${warn}`, `Attack${warn}`) }),
  liberty: Object.freeze({ change: null, roles: clipSet(`Idle${free}`, `Move${free}`, `Die${free}`, `Attack${free}`) }),
});
const PRISONER = prisoner('2', '');
const PRISONER_COLOURED = prisoner('_orange', '_red');
/** A skill's clips in one of its sub-modes (FORMS `endsWithSkill`): skill slot `index`, attack clip `loop`. */
const skillRoles = (index, loop, o = {}) => Object.freeze({ begin: null, end: null, idle: null, ...o, loop, index });
/** A 傀儡师's 替身 roles: idle `idle`, death `die`, attack `attack` (null: none), no skill clip of its own. */
const dollRoles = (idle, die, attack = null) => Object.freeze({
  idle, deploy: idle, die, attack: attack ? Object.freeze({ begin: null, loop: attack, end: null }) : null, attackDown: null, skill: null,
});
export const FORMS = Object.freeze({
  char_1023_ghost2: Object.freeze({
    doll: Object.freeze({ change: 'Start_B', end: 'Die_B', leave: 'Start_2', roles: dollRoles('Idle_B', 'Die_B_2') }),
  }),
  char_1040_blaze2: Object.freeze({
    downed: Object.freeze({ change: 'Revive_Begin', leave: 'Revive_End', endsOnDeath: true, roles: Object.freeze({ idle: 'Revive_Idle', deploy: 'Revive_Idle', move: loop('Revive_Idle'), stun: loop('Revive_Idle'), attack: null, skill: null }) }),
  }),
  char_1021_kroos2: Object.freeze({
    quad: Object.freeze({ change: null, endsWithSkill: true, roles: Object.freeze({ skill: skillRoles(1, 'Skill_Loop_2', { begin: 'Skill_Begin', end: 'Skill_End', idle: 'Skill_Idle' }) }) }),
  }),
  char_1035_wisdel: Object.freeze({
    overload: Object.freeze({ change: 'Skill_2_Overload_Begin', endsWithSkill: true, roles: Object.freeze({ skill: skillRoles(1, 'Skill_2_Overload_Loop', { end: 'Skill_2_Overload_End', idle: 'Skill_2_Overload_Idle' }) }) }),
  }),
  char_4058_pepe: Object.freeze({
    rangeMax: Object.freeze({ change: null, endsWithSkill: true, roles: Object.freeze({ skill: skillRoles(2, 'Skill_3_Loop_B', { begin: 'Skill_3_Begin', end: 'Skill_3_End', idle: 'Skill_3_Idle' }) }) }),
  }),
  char_1050_chen3: Object.freeze({
    vanish: Object.freeze({ change: Object.freeze(['Skill_2_Begin', 'Skill_2_Disappear']), hold: true, leave: 'Start_2', endsWithSkill: true, endsOnDeath: true, roles: Object.freeze({ attack: null }) }),
  }),
  char_4182_oblvns: Object.freeze({
    organ: Object.freeze({ change: null, roles: Object.freeze({ idle: 'Skill_2_Idle_B', attack: loop('Skill_2_Loop_B') }) }),
  }),
  char_311_mudrok: Object.freeze({
    dormant: Object.freeze({ change: 'Skill_2_Begin', leave: 'Skill_2_Awake', endsOnDeath: true, roles: Object.freeze({ idle: Object.freeze(['Skill_2_Sleep', 'Skill_2_Idle']), deploy: 'Skill_2_Sleep', stun: loop('Skill_2_Sleep'), attack: null, skill: null }) }),
  }),
  char_4016_kazema: Object.freeze({
    doll: Object.freeze({ change: Object.freeze(['Die_2', 'Start_B']), leave: Object.freeze(['Die_B', 'Start']), roles: dollRoles('Idle_B', 'Die_B', 'Attack_B') }),
  }),
  enemy_1040_bombd: Object.freeze({
    bombed: Object.freeze({
      roles: Object.freeze({
        idle: 'Idle_2', deploy: 'Idle_2', die: 'Die_2',
        move: Object.freeze({ begin: 'Move_Begin_2', loop: 'Move_Loop_2', end: 'Move_End_2' }),
      }),
    }),
  }),
  enemy_2025_syufo: Object.freeze({
    crawl: Object.freeze({ change: 'Change', roles: clipSet('Idle_02', 'Move_02', 'Die_02', 'Attack_02') }),
  }),
  enemy_9008_acbunn: Object.freeze({
    revealed: Object.freeze({ change: null, roles: clipSet('Idle_B', 'Move_B', 'Die_B', 'Attack_B') }),
  }),
  enemy_10081_mpplai: Object.freeze({
    translator_fuchou: Object.freeze({ change: 'A_Die_B', roles: clipSet('B_Idle', 'B_Move', 'B_Die', 'B_Attack') }),
    translator_youling: Object.freeze({ change: 'A_Die_C', roles: clipSet('C_Idle', 'C_Move', 'C_Die') }),
    translator_shushi: Object.freeze({ change: 'A_Die_D', roles: clipSet('D_Idle', 'D_Move', 'D_Die', 'D_Attack') }),
  }),
  enemy_1288_duskls: EMBER,
  enemy_1288_duskls_2: EMBER,
  enemy_1292_duskld: EMBER,
  enemy_9010_acpupp: Object.freeze({
    husk: Object.freeze({ change: 'A_Die', end: 'B_Revive', next: 'revived', roles: clipSet('B_Idle', 'B_Move', 'B_Die') }),
    revived: Object.freeze({ change: null, roles: Object.freeze({}) }),
  }),
  enemy_1525_blkswb: rebirth('Revive1', 'Revive2', 'Revive3', clipSet('B_Idle', 'B_Move', 'B_Die', 'B_Attack')),
  enemy_1535_wlfmster: rebirth('A_revive_1', 'A_revive_2', 'A_revive_3', clipSet('B_Idle', 'B_Move', 'B_Die', 'B_Attack')),
  enemy_1539_reid: rebirth('Revive_Begin', 'Revive_Loop', 'Revive_End'),
  // 重生 on the skeleton's own Revive clip (PR #275 by @xcdoge; content/enemies/leaders.js kitUglyThing / kitXi): 巨大的丑东西
  // — Revive 8.67 s of the 10 s 重生 (its self-destruct 2.17 s in), then the fleeing 大祭司 (Idle_2 / Move_2 / Stun_2;
  // 不进行攻击) holding its idle while the sim still holds the 重生 (reported as a stun); 自在 — Revive_01 5.33 s for the
  // 5 s 重生, then the same model, stronger (reborn.atk)
  enemy_1512_mcmstr: Object.freeze({
    reborn: Object.freeze({ change: 'Revive', next: 'form2', roles: Object.freeze({ idle: 'Idle_2', deploy: 'Idle_2', move: loop('Idle_2'), stun: loop('Idle_2'), attack: null, skill: null }) }),
    form2: Object.freeze({ change: null, roles: Object.freeze({ ...clipSet('Idle_2', 'Move_2', 'Die'), stun: loop('Stun_2') }) }),
  }),
  enemy_1517_xi: Object.freeze({
    reborn: Object.freeze({ change: 'Revive_01', next: 'form2', roles: Object.freeze({}) }),
    form2: Object.freeze({ change: null, roles: Object.freeze({}) }),
  }),
  enemy_1516_jakill: Object.freeze({
    reborn: Object.freeze({ change: 'C1_Die', roles: JAKILL2 }),
    form2: Object.freeze({ change: null, roles: JAKILL2 }),
  }),
  enemy_1172_dugago: STATUE,
  enemy_1172_dugago_2: STATUE,
  enemy_1116_liprr: PRISONER,
  enemy_1116_liprr_2: PRISONER,
  enemy_1119_vofsd: prisoner('2', '3'),
  enemy_1118_lidbox_2: PRISONER_COLOURED,
  enemy_1121_lifbos: PRISONER_COLOURED,
  enemy_1121_lifbos_2: PRISONER_COLOURED,
});

/**
 * Keep `obj` in the right layer: the surface container of block row round(y) when it lies on a raised top at
 * height `z` (drawn after that row's blocks), else `fallback`. Reparents only on change.
 */
export function placeOnGround(ctx, obj, fallback, y, z) {
  let layer = fallback;
  if (z > RAISED_Z && ctx.surfaceLayer) layer = ctx.surfaceLayer(Math.round(y)) || fallback;
  if (obj.parent !== layer) layer.addChild(obj);
}

/** Standing height of a world point (tile top incl. raised devices); 0 off-grid / without a stage. */
export function groundZ(ctx, x, y) {
  if (!ctx.heightAt) return 0;
  const h = ctx.heightAt(Math.round(y), Math.round(x));
  return Number.isFinite(h) && h > 0 ? h : 0;
}

/** Enemy Spine models face right by default like operators (verified by eye on Ark-Models skeletons). */
export const ENEMY_MODEL_FACES_LEFT = false;

let _whiteTex = null;
const white = () => (_whiteTex || (_whiteTex = globalThis.PIXI.Texture.WHITE));

function bar(P, parent, color, alpha = 1) {
  const s = new P.Sprite(white());
  s.tint = color;
  s.alpha = alpha;
  s.anchor.set(0, 0.5);
  parent.addChild(s);
  return s;
}

/**
 * Shared context handed to every view by app.js.
 * @typedef {{ P: any, layers: { shadow: any, units: any, bars: any, groundFx: any },
 *   assets: any, cam: () => any, heightAt: (r:number,c:number)=>number, fx: any, time: () => number,
 *   settings: { damageNumbers: boolean, quality: string } }} ViewCtx
 */

export class UnitView {
  /**
   * @param {ViewCtx} ctx
   * @param {object} info UnitInfo-like: { id, uid?, kind, side, defId, spine, avatar, tier, golden, facing, maxHp, boss?, motion?, name? }
   * @param {{ prep?: boolean }} [opts]
   */
  constructor(ctx, info, opts = {}) {
    const P = ctx.P;
    this.ctx = ctx;
    this.P = P;
    this.info = { ...info };
    this.id = info.id;
    this.uid = info.uid ?? null;
    this.prep = !!opts.prep;
    this.lodIdle = opts.lod === 'idle';
    this.culled = false;          // outside the viewport this frame (not animated, not drawn)
    this._offDt = 0;              // animation time skipped while culled
    this._far = false;            // small on screen (adaptive LOD, with hysteresis)
    this.isEnemy = info.side === 'enemy';
    this.isBoss = !!info.boss;
    // enemies: the official prefab's size factor (1 for operators, summons and enemies at the standard size)
    const def = this.isEnemy && ctx.lookupDef ? ctx.lookupDef(info) : null;
    this.modelK = this.isEnemy ? enemyModelScale(def) : TOKEN_MODEL_K[info.defId] || 1; // local patch: summon prefab sizes
    // a fast enemy walks on its model's own Run cycle when it has one (PR #275 by @xcdoge: 猎狗pro, moveSpeed 1.9, Run_Loop
    // 0.53 s next to Move_Loop 0.80 s; also 深池侦察犬 1.7). [ASSUMED] the threshold: faster than the standard 1
    this.moveFast = this.isEnemy && Number(def?.stats?.moveSpeed) > 1;
    // the official's own model quirks (enemies.json, read from its battle prefabs — tools/local-extract/enemy_model_offsets.py,
    // PR #211): a vertical stretch (its Graphic scale's sy / sx, the two 帝国炮火先兆者 at 1.263) and a mirrored X scale
    // (the Graphic's sx is negative, so the official draws the authored model flipped: 木制瑞印)
    this.modelKY = this.isEnemy ? enemyModelScaleY(def) : 1;
    this.modelDX = this.isEnemy ? MODEL_SHIFT[info.defId] || 0 : 0; // MODEL_SHIFT [ASSUMED]
    this.mirrorX = this.isEnemy && !!(def && def.mirrorX);
    this.isToken = info.kind === 'token';
    this.golden = !!info.golden;
    this.tier = clamp(Number(info.tier) || 1, 1, 6);
    this.x = Number(info.x) || 0; this.y = Number(info.y) || 0; this.z = 0;
    this.zTarget = null;          // battle: standing height the feet ease towards (tile top under the unit; 0 for enemies)
    this.slide = null;            // a push / pull slide (slideTo): held, then easing into the sim's position (update)
    this.glideS = null;           // a model glide away from its tile and back (glide): it owns the drawn position meanwhile
    this.riseDur = 0;             // after a glide: the lift comes up linearly over this many game s (0 = the usual ease)
    /** @type {number|null} */
    this.shadowZ = null;          // an enemy flyer's shadow height (the tile top under it), else null: the shadow is at z
    /** @type {number|null} */
    this.shadowZTarget = null;
    this.flying = info.motion === 'FLY';
    this.hover = 0;               // flying: body height above the road / the ground under it
    this.liftoff = false;         // an airborne (起飞) operator: drawn at the flyers' height too (shared/local.js UF_LIFTOFF)
    this.modelSX = NaN;           // the Spine model's display scale (x with the facing mirror) — render/fxgame.js specialPoint
    this.modelSY = NaN;
    this.bodyless = bodyless(info.defId);   // a summon drawn by its effect only (shared/trap-tokens.js BODYLESS_TOKENS)
    this.dir = this.isEnemy ? null : unitDir(info);
    // whether the direction is known (UnitInfo / piece `dir`), not just the legacy ±1: battle and scouting views show
    // the ground wedge only then (a derived RIGHT would mislabel an UP / DOWN operator)
    this.hasDir = !this.isEnemy && typeof info.dir === 'string' && DIRS.includes(info.dir.toUpperCase());
    this.facing = this.dir === 'LEFT' ? -1 : 1;
    this.visFacing = this.isEnemy ? -1 : this.facing;
    // an operator's / summon's facing while it fights (render/face-turn.js): the mirror `lr`, Back / Front `ud`, `dir4`;
    // its deploy direction until an attack turns it (turnTo); `faceUd` the half shown (Back / Front: a turn changes it
    // edge-on, half way through — `turnS` { t, shown } the turn under way)
    this.face = this.isEnemy ? null : faceOf(this.dir);
    this.faceUd = this.face?.ud;
    this.turnS = null;
    this.hp = Number(info.maxHp) || 1; this.maxHp = Number(info.maxHp) || 1; this.ghostHp = this.hp;
    this.sp = 0; this.spMax = 0;
    this.flags = 0; this.anim = ANIM.IDLE;
    this.statuses = new Set();
    this.alive = true;
    this.dying = 0;               // seconds left of the death fade (0 = not dying)
    this.dieT = 0;                // seconds since die() (the Die clip's clock; a late Spine model catches up)
    this.remove = false;          // set when the death fade ended (owner removes the view)
    this.down = null;             // knocked out, waiting to redeploy: { until, total, state } (setDown) — no fade meanwhile
    this.gameT = 0;               // battle game time of the frame (render clock), for the redeploy ring's countdown and the element bar's refill
    this.el = null; this.elFill = 0; this.elUntil = 0; this.elDur = 0;   // shown element gauge (sync)
    this._elBar = null;           // { root, disc, bg, fill } sprites of the element gauge row, built on first use
    this._downRing = null;        // { disc, track, arc, text } sprites (text: the shared label, textures.js downLabel), built on first use
    this.alpha = 1; this.fadeIn = this.prep ? 1 : 0;
    this.bornOfficial = false; this._bornT = 0; this._bornWait = -1; // local patch: official drop-in (onDeploy; -1 = not waiting)
    this.lunge = 0; this.lungeDir = { x: 1, y: 0 };
    this.flash = 0;
    this.bob = Math.random() * Math.PI * 2;
    this.hovered = false; this.dimmed = false; this.lift = 0;
    this.lastAtk = -1; this.atkInterval = defaultInterval(ctx, info);
    this.shake = 0;
    this.screen = { x: 0, y: 0, s: 1, top: 0 };
    this.destroyed = false;
    this.form = typeof info.form === 'string' ? info.form : null;   // the unit's model form: an enemy's mode, a 傀儡师's 替身 (setForm, FORMS)
    this._deployKey = null;       // the latest deploy clip key (onDeploy): a model swapped mid-deploy plays the same clip
    this._dieSkill = false;       // it died in a skill's mode (die): a model built while it lies down plays that skill's death
    this._dieForm = null;         // the form it died in (die): a model built while it lies down shows that form's death

    // --- display objects
    this.shadow = new P.Sprite(ctx.shadowTex || shadowTexture());
    this.shadow.anchor.set(0.5);
    this.shadow.alpha = 0.55;
    ctx.layers.shadow.addChild(this.shadow);

    this.root = new P.Container();
    this.root.sortableChildren = false;
    ctx.layers.units.addChild(this.root);

    const fx = fxAtlas();
    this.aura = null;
    if (this.golden) {
      this.aura = new P.Sprite(fx.tex.glow);
      this.aura.anchor.set(0.5, 0.62);
      this.aura.tint = 0xffc94a;
      this.aura.blendMode = P.BLEND_MODES.ADD;
      this.root.addChild(this.aura);
    }
    this.body = new P.Container();
    this.root.addChild(this.body);
    this.fallback = new P.Sprite(P.Texture.EMPTY);
    this.fallback.anchor.set(0.5, 1);
    this.body.addChild(this.fallback);
    this.actor = null;
    this.spineReady = false;
    this._modelDirty = false;            // died / stood up since the last frame: update() checks Front ⇄ Back (_syncModel)
    this._spineBusy = false;             // a Spine load of this view is in flight
    this._spineTries = 0;                // failed loads since the last model (SPINE_RETRY_MS)
    this._retryAt = 0;                   // when the next retry is due (ms, performance clock; 0 = none)
    this._spineHidden = false;           // the load in flight began while the tab was hidden (SPINE_STUCK_MS)
    this._stuckAt = 0;                   // when that load is started again unless it settled (ms; 0 = none)
    this.baseTint = 0xffffff;            // the drawn model's own tint (ALIAS_TINT), under the status tints

    this.hud = new P.Container();
    ctx.layers.bars.addChild(this.hud);
    this._buildHud();

    this.facingArrow = null;
    this._loadPicture();
    this._loadSpine();
  }

  // ---- loading ---------------------------------------------------------------------------------------------

  _frameColor() {
    if (this.isEnemy) return this.isBoss ? ENEMY_FRAME.boss : this.tier >= 2 ? ENEMY_FRAME.elite : ENEMY_FRAME.normal;
    if (ICE_TOKENS.has(this.info.defId)) return ICE_FRAME;
    if (this.golden) return 0xffc600;
    return TIER_COLORS[this.tier] || TIER_COLORS[1];
  }

  // The fallback portrait (avatar in a rarity diamond, a 160×160 canvas cached by textures.js) is built lazily, on
  // the first frame it is actually visible: never for a unit whose Spine model is ready before that, and never as
  // an image-less placeholder that the avatar replaces a moment later (the placeholder only shows when the avatar
  // is missing or still loading after PIC_WAIT_MS).
  _loadPicture() {
    const a = this.ctx.assets;
    // (an ICE_TOKENS unit takes no picture: the token fallback would be its owner's face — assets.js tokenAvatarUrl)
    const url = ICE_TOKENS.has(this.info.defId) ? null : a && (a.picture ? a.picture(this.info.avatar) || a.picture(this.info.defId) || a.picture(this.info.spine) : null);
    this._pic = { key: String(this.info.avatar || this.info.defId || 'unknown'), color: this._frameColor(), img: null, state: 'none', shown: null, t0: nowMs() };
    if (!url || !a.image) return;
    const cached = typeof a.imageNow === 'function' ? a.imageNow(url) : null;
    if (cached) { this._pic.img = cached; this._pic.state = 'img'; return; }
    this._pic.state = 'wait';
    const pic = this._pic;
    Promise.resolve().then(() => a.image(url)).then((img) => {
      if (img) { pic.img = img; pic.state = 'img'; } else pic.state = 'none';
    }, () => { pic.state = 'none'; });
  }

  /** Put the right diamond on the fallback sprite (called while the fallback is visible). */
  _ensurePicture() {
    const pic = this._pic;
    if (!pic || this.destroyed) return;
    let want = pic.state === 'img' ? 'img' : 'placeholder';
    if (pic.state === 'wait' && nowMs() - pic.t0 < PIC_WAIT_MS) want = null;
    if (!want || pic.shown === want) return;
    this.fallback.texture = diamondTexture(pic.key, want === 'img' ? pic.img : null, pic.color, { enemy: this.isEnemy, golden: this.golden, ice: ICE_TOKENS.has(this.info.defId) });
    pic.shown = want;
  }

  /** @param {boolean} [retry] load again even after a remembered failure (assets.js acquire `{ retry }`) */
  _loadSpine(retry = false) {
    const a = this.ctx.assets;
    if (!a || !a.spineEntry || !a.spine) return;
    const id = this.info.spine || this.info.defId;
    // Front/Back rule (research 07 §5.5 / 09 §1.2): Front facing right/down (mirrored for left), Back facing up — while
    // standing (a knocked-out operator lies with the model that has a fall: _wantsBack).
    const back = this._wantsBack();
    const entry = id ? a.spineEntry(id, { back }) : null;
    if (!entry || this.ctx.settings?.quality === 'low' && this.isEnemy && !this.isBoss && this.ctx.crowded?.()) return;
    this.entryBack = back;
    this._acquireSpine(entry, id, retry);
  }

  /**
   * Re-resolve what this view could not draw yet (public issue #8 item 5): the picture when it has none (no avatar URL —
   * the asset manifest arrived after the view was built — or the image failed) and, at once, the Spine model when none
   * is shown and none is loading (no manifest entry then, or a load that failed / timed out). render/app.js calls it for
   * every view when a manifest arrives (assets.js onChange) and when the tab is shown again. A load still in flight that
   * began while the tab was hidden gets SPINE_STUCK_MS from now (the tab visible) to finish, then `update` starts it again
   * (GitHub #68). Nothing to do otherwise.
   */
  retryAssets() {
    if (this.destroyed) return;
    if (!this._pic || this._pic.state === 'none') this._loadPicture();
    if (this.actor) return;
    if (!this._spineBusy) { this._retryAt = 0; this._loadSpine(true); return; }
    if (this._spineHidden && !this._stuckAt && !globalThis.document?.hidden) this._stuckAt = nowMs() + SPINE_STUCK_MS;
  }

  /**
   * Load `entry` and show it. Every acquire is paired with exactly one release: a superseded / failed / post-destroy
   * load releases its own entry; the displayed model's entry (`_actorEntry`) is released when that model is replaced or
   * destroyed. A model that fails to load falls back to the entry's `fallback` (an optional local-client model,
   * assets.js spineEntry: DESIGN §13) when it names one; otherwise the view keeps its fallback diamond and — while no
   * model is shown — loads again after SPINE_RETRY_MS (a timed-out or failed download used to stay a diamond for good).
   */
  _acquireSpine(entry, id, retry = false) {
    const a = this.ctx.assets;
    this.entry = entry;
    const req = this._spineReq = (this._spineReq || 0) + 1;
    this._spineBusy = true;
    this._spineHidden = !!globalThis.document?.hidden;
    this._stuckAt = 0;
    a.spine.acquire(entry, retry ? { retry: true } : undefined).then((data) => {
      if (req === this._spineReq) { this._spineBusy = false; this._stuckAt = 0; }
      if (this.destroyed || req !== this._spineReq) { this._releaseEntry(entry); return; }
      this._spineTries = 0;
      this._retryAt = 0;
      let actor = null;
      try {
        actor = new SpineActor(data, entry);
        actor.setSkillIndex(this.info.skillIndex);
        actor.setRunMode(this.moveFast);
        // enemies play their attack clip once per attack, then walk on (GitHub #58: the sim stands them for that clip)
        actor.clipPerAttack = this.isEnemy;
        actor.fortressClips = FORTRESS_CLIPS[id] || null;
        actor.stanceSkills = STANCE_SKILLS[id] || null;
        // its clip events go to the audio (render/app.js ctx.spineEvent); `null` first = this unit now has a model that
        // reports them (the audio drops its stand-in for it)
        if (this.ctx.spineEvent) {
          const uid = this.info.id;
          actor.onEvent = (name) => { if (!this.destroyed && actor === this.actor) this.ctx.spineEvent(uid, name); };
          this.ctx.spineEvent(uid, null);
        }
      } catch (err) {
        console.warn('[render] spine build failed', id, err?.message || err);
        this._releaseEntry(entry);
        return;
      }
      // a Front ⇄ Back swap (setDir, an attack's turn — turnTo —, or knocked out / standing again: _syncModel) replaces the previous model in place:
      // no fallback diamond in between; a deploy clip it was playing goes on on the new model (an operator facing UP
      // redeployed: its Back model takes over from the Front model it lay down with)
      const swap = !!this.actor;
      const deployed = swap && this.alive ? this.actor.deployElapsed() : null;
      const swung = swap && this.alive ? this.actor.swingElapsed?.() ?? null : null;   // and a swing it had begun
      // local patch: deployed before its model loaded (a battle start) — shown at once, no cross-fade from the diamond;
      // update() starts its Start clip (BORN_LEAD_S)
      const late = !swap && this._bornWait >= 0 && this.alive;
      if (swap) this._dropActor();
      this.actor = actor;
      this._actorEntry = entry;
      this.baseTint = (!entry.local && ALIAS_TINT[id]) || 0xffffff;   // the web alias of a local-only model
      this.body.addChild(this.actor.spine);
      this.spineReady = true;
      this.swapT = swap || late ? 1 : 0;
      this.actor.spine.alpha = swap || late ? 1 : 0;
      // a mode the unit is already in (a model built or rebuilt after the change): its clip set, no change clip — a dead
      // one lies in the form it died in (a 替身 knocked out: the sim resets the form at once, but the Front model it lies
      // down with facing UP, §22.1, is built a frame later; a model rebuilt while it is down)
      const f = this._formSpec() || (this.alive ? null : this._dieForm);
      if (f) this.actor.setForm(f.roles);
      // replay current state (a dead model resumes its Die clip where it would be — a knocked-down one holds its end)
      if (!this.alive) {
        const d = this.actor.die(!!this._dieSkill);
        const at = Math.min(d, this.dieT * (this.ctx.animRate?.() || 1));
        if (at > 0) this.actor.update(at);
      } else {
        if (this.flags & UF.SKILL) this.actor.setSkill(true);
        this.actor.setBase(this._baseFromAnim());
        if (deployed != null) { this.actor.deploy(this._deployKey); if (deployed > 0) this.actor.update(deployed); }
        else if (swung) {
          this.actor.combatHit = !!swung.combat;
          if (this.actor.swing(swung.windup, swung.alt) && swung.elapsed > 0) this.actor.update(swung.elapsed);
        }
        // a stealth-driven form (STEALTH_FORMS): the pose of the clip set in force now, even under a frozen stun
        if (STEALTH_FORMS[id]) this.actor.syncFormPose();
      }
    }, () => {
      if (req === this._spineReq) { this._spineBusy = false; this._stuckAt = 0; }
      this._releaseEntry(entry);
      if (this.destroyed || req !== this._spineReq) return;
      if (entry.fallback) { this._acquireSpine(entry.fallback, id, retry); return; }
      // keep the fallback diamond (or the model already shown: a failed Front ⇄ Back swap) — and try again later
      if (!this.actor && this._spineTries < SPINE_RETRY_MS.length) this._retryAt = nowMs() + SPINE_RETRY_MS[this._spineTries++];
    });
  }

  _formSpec() {
    return this.form ? FORMS[this.info.spine || this.info.defId]?.[this.form] || null : null;
  }

  /**
   * The unit changed mode (the `form` of a sim fx — shared/protocol.js fxForm; `fx` = that fx's extra): the mode's clip
   * set (FORMS) after its change clip, and its closing clip (`end`, landing in the `next` form's clips) timed to end
   * `fx.dur` game s later — the unit is still in this mode while it plays (an ember can be beaten in its last second),
   * so this mode's death clip stays until the next mode's fx; null goes back to the manifest clips (through the old
   * mode's `leave` clip when it has one: a 替身's 本体 coming back); a kind this skeleton has no clip set for (an arts
   * barrier, a broken charge …) changes nothing. Kept for a model built later.
   */
  setForm(kind, fx = null) {
    const k = typeof kind === 'string' ? kind : null;
    if (k === this.form) return;
    if (k && !FORMS[this.info.spine || this.info.defId]?.[k]) return;
    const prev = this._formSpec();
    this.form = k;
    this.info.form = k;
    const f = this._formSpec();
    if (!this.actor) return;
    const dur = fx && Number(fx.dur);
    let next = f && f.next ? FORMS[this.info.spine || this.info.defId]?.[f.next]?.roles || null : null;
    if (next && typeof f.roles.die === 'string') next = { ...next, die: f.roles.die };
    // an fx handed out late (render/app.js: a stall, a hidden tab) skips a change clip that would already have ended
    const late = fx && Number(fx.late) > 0 ? Number(fx.late) : 0;
    const change = f && f.change && !(late > 0 && late >= (this.actor.dur?.(f.change) ?? Infinity)) ? f.change : null;
    if (f) this.actor.setForm(f.roles, change, f.end && dur > 0 ? { clip: f.end, in: dur, roles: next } : null, !!f.hold);
    else if (prev) this.actor.setForm(null, prev.leave && !(late > 0 && late >= (this.actor.dur?.(prev.leave) ?? Infinity)) ? prev.leave : null);
  }

  // ---- HUD -------------------------------------------------------------------------------------------------

  _buildHud() {
    const P = this.P, h = this.hud;
    this.hpBg = bar(P, h, COLORS.hpBack, 0.85);
    this.hpGhost = bar(P, h, COLORS.hpGhost, 0.9);
    this.hpFill = bar(P, h, this.isEnemy ? (this.isBoss ? COLORS.hpBoss : COLORS.hpEnemy) : COLORS.hpAlly);
    this.shieldBar = bar(P, h, COLORS.shield, 0.95);
    this.spBg = bar(P, h, COLORS.hpBack, 0.85);
    this.spFill = bar(P, h, COLORS.sp);
    this.spGlow = new P.Sprite(fxAtlas().tex.glow);
    this.spGlow.anchor.set(0.5);
    this.spGlow.tint = COLORS.spReady;
    this.spGlow.blendMode = P.BLEND_MODES.ADD;
    h.addChild(this.spGlow);
    // nothing shows until the first HUD update decides (a culled or prep view never draws bars)
    for (const b of [this.hpBg, this.hpGhost, this.hpFill, this.shieldBar, this.spBg, this.spFill, this.spGlow]) b.visible = false;
    // local patch: official bars (hud-bars.js) — allies, enemies, bosses and the 卫戍协议 giant bosses
    const giant = this.isEnemy ? giantBossOf(this.info) : null;
    this.lpBars = !this.isEnemy ? new AllyBars(P, h) : new EnemyBars(P, h, giant ? 'giant' : this.isBoss ? 'boss' : 'normal', giant);
    this.ammo = null;
    this.barrier = 0;
    this.chip = null;
    // operators only: summon tokens have no tier (hand and field alike) — local patch (maintainer request 2026-10-08): a prep
    // summon wears its owner's chip (app.js pieceInfo `chip`; official: same level chip as the operator)
    if (!this.isEnemy && (!this.isToken || this.info.chip) && this.info.kind !== 'device') {
      this.chip = new P.Sprite(tierChip(this.tier, this.golden));
      this._chipTex = this.chip.texture; // local patch: the drawn chip, when the official one is not installed (hud-bars.js)
      this.chip.anchor.set(0.5);
      h.addChild(this.chip);
    }
    this.icons = [];
    for (let i = 0; i < 4; i++) {
      const s = new P.Sprite(P.Texture.EMPTY);
      s.anchor.set(0.5);
      s.visible = false;
      h.addChild(s);
      this.icons.push(s);
    }
    this.blockIcon = new P.Sprite(statusTexture('blocked'));
    this.blockIcon.anchor.set(0.5);
    this.blockIcon.visible = false;
    this.ctx.layers.groundFx.addChild(this.blockIcon);
    this.countText = null;
    this.itemPips = [];
  }

  /** Show a stack count (token stacks in the hand) — BitmapText-free: a tiny canvas-less chip via Text. */
  setCount(n) {
    const P = this.P;
    if (!(n > 1)) { if (this.countText) this.countText.visible = false; return; }
    if (!this.countText) {
      this.countText = new P.Text('', { fontFamily: 'Bender, Oxanium, sans-serif', fontSize: 22, fontWeight: '700', fill: '#ffffff', stroke: '#0b0f0e', strokeThickness: 5 });
      this.countText.anchor.set(0.5);
      this.hud.addChild(this.countText);
    }
    this.countText.text = `×${n}`;
    this.countText.visible = true;
  }

  /** Equipped item pips (prep): list of item icon URLs. */
  /** local patch (LOCAL-PATCH.md 「전투 화면 UI」): the equipped items' golden flags, for the official prep equip bar (hud-bars.js). */
  setEquip(gold) { this._equip = Array.isArray(gold) ? gold.map(Boolean) : []; }

  setItems(urls) {
    const P = this.P;
    const list = Array.isArray(urls) ? urls.slice(0, 2) : [];
    while (this.itemPips.length > list.length) this.itemPips.pop().destroy();
    list.forEach((u, i) => {
      let s = this.itemPips[i];
      if (!s) { s = new P.Sprite(P.Texture.EMPTY); s.anchor.set(0.5); this.hud.addChild(s); this.itemPips[i] = s; }
      if (s._url === u) return;
      s._url = u;
      const a = this.ctx.assets;
      s.texture = itemTexture(u || 'none', null, 0x4ed8af);
      if (u && a?.image) a.image(u).then((img) => { if (!s.destroyed && s._url === u) s.texture = itemTexture(u, img, 0x4ed8af); }, () => {});
    });
  }

  // ---- state input ---------------------------------------------------------------------------------------

  _baseFromAnim() {
    if (this.anim === ANIM.STUN || (this.flags & (UF.STUNNED | UF.FROZEN | UF.SLEEP))) return 'stun';
    if (this.anim === ANIM.MOVE) return 'move';
    return 'idle';
  }

  /** Apply an interpolated sample (render/interp.js); `t` = the render clock's game time (ring countdowns). */
  sync(s, t) {
    if (!s) return;
    if (Number.isFinite(t)) this.gameT = t;
    // the element gauge shown (b.snap `elem`): element, fill 0..1, cooldown end (game s) and length
    this.el = typeof s.el === 'string' ? s.el : null;
    this.elFill = this.el ? s.elFill || 0 : 0; this.elUntil = this.el ? s.elUntil || 0 : 0; this.elDur = this.el ? s.elDur || 0 : 0;
    this.followSample(s, t);
    this.flying = !!(s.flags & UF.FLYING) || this.info.motion === 'FLY';
    this.liftoff = !!(s.flags & UF_LIFTOFF);
    // enemies keep to the road plane: ground enemies only ever walk low tiles (a rounding step onto a block edge must not
    // pop them up), and a flyer hovers FLY_HOVER above the road whatever tile it crosses — the official lift is one
    // constant over the route (docs/research/12), so a block under it is no step (GitHub #277: a flyer passing over one
    // high-ground / forbidden block rose and dropped like stairs). Its shadow still lies on the tile top under it.
    // While sliding, the floor is read under the view's own (mid-flight) position, not the destination's.
    const floor = this.slide ? groundZ(this.ctx, this.x, this.y) : groundZ(this.ctx, s.x, s.y);
    const gz = this.isEnemy ? 0 : floor;
    if (this.zTarget == null) this.z = gz;
    this.zTarget = gz;
    this.shadowZTarget = this.isEnemy && this.flying ? floor : null;
    if (this.shadowZTarget == null) this.shadowZ = null;
    else if (this.shadowZ == null) this.shadowZ = this.z;
    if (s.maxHp > 0) this.maxHp = s.maxHp;
    const hp = clamp(s.hp, 0, this.maxHp);
    if (hp < this.hp - 0.5 && this.isBoss) this.shake = 0.25;
    if (hp < this.hp - 0.5 && this.lpBars?.hit) this.lpBars.hit(); // local patch: a giant boss's hit flash
    this.hp = hp;
    this.sp = s.sp; this.spMax = s.spMax;
    this.ammo = s.ammo || null; // local patch: official bullet bar (b.snap `ammo`)
    this.barrier = Number(s.shield) > 0 ? Number(s.shield) : 0; // the barrier on the HP bar (b.snap `shield`, hud-bars.js shieldedBar)
    this.bsp = s.bsp || null;   // local patch: a boss's official SP (b.snap `bsp`)
    const prevFlags = this.flags;
    this.flags = s.flags | 0;
    this.anim = s.anim | 0;
    // a stealth-driven form (STEALTH_FORMS: 假想敌：骨刺) follows this snapshot's stealth bit at once — before a DIE in the
    // same snapshot, so it dies in the form it had
    const stealthForm = this.isEnemy && this.alive ? STEALTH_FORMS[this.info.spine || this.info.defId] : null;
    if (stealthForm) {
      const form = this.flags & UF.STEALTH ? null : stealthForm;
      if (form !== this.form) {
        this.setForm(form);
        this.actor?.syncFormPose();
        if (this.imp) this.imp.dirty = true;
      }
    }
    if (this.isEnemy && !this.slide?.face && Math.abs(s.vx) > 0.08) this.visFacing = s.vx < 0 ? -1 : 1;
    // an operator on a kit's flight (snapshot anim MOVE: 予愿安洁莉娜 S3, whose flight `_faceToMoveDirection`) faces its
    // travel, and its own direction again once it stands
    else if (!this.isEnemy && (s.anim | 0) === ANIM.MOVE && Math.abs(s.vx) > 0.08) this.visFacing = s.vx < 0 ? -1 : 1;
    else if (!this.isEnemy && (this.anim | 0) === ANIM.MOVE && (s.anim | 0) !== ANIM.MOVE) this.visFacing = this.face ? this.face.lr : this.facing;
    if ((prevFlags ^ this.flags) & UF.SKILL) this.setSkill(!!(this.flags & UF.SKILL));
    if (this.anim === ANIM.DIE && this.alive) this.die();
    if (this.actor && this.alive) this.actor.setBase(this._baseFromAnim());
  }

  setWorld(x, y, z = 0) { this.x = x; this.y = y; this.z = z; }

  /**
   * The sampled position: the view's — unless a push / pull slide owns it (slideTo), which only anchors where it eases
   * to on it, from the snapshot that carries the destination on (`at`; before that the sample is still sliding or
   * snapping there). sync() starts with it; a dying view gets nothing else (syncView: the DIE window of the snapshots),
   * so a unit killed on the step of its push still lands where the sim put the body (Grok's review of fb7-render).
   */
  followSample(s, t) {
    if (this.glideS) { this.glideS.lx = s.x; this.glideS.ly = s.y; return; }
    const sl = this.slide;
    if (!sl) { this.x = s.x; this.y = s.y; }
    else if (!(t < sl.at)) { sl.lx = s.x; sl.ly = s.y; sl.live = true; }
  }

  /**
   * Slide to a displacement's destination (推拉, the `displace` fx at (x, y)) instead of appearing there: `opts.dur` = the
   * fx's 失衡 time in game seconds (real seconds = dur / ctx.animRate), else the DISPLACE_SLIDE·√D fallback.
   * `at` (game s): the time of the snapshot that carries the destination — render/app.js starts the slide as soon as the
   * interpolator shows the interval before it, and until the render clock reaches `at` the view holds where it stood
   * (the sample in between is a lerp or a snap towards the destination). From then on it eases from there into the
   * sampled position — the destination, and the walk the enemy resumes from it —, so it lands without a jump. Without
   * `at` the destination counts as shown. A unit that dies on the way finishes the slide: its body lies where the push
   * put it (the sim's position); a dead one is placed there, a knocked-down one is left to setDown.
   */
  slideTo(x, y, opts = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    // already on the way there: app.js starts the slide ahead of the event, then the event itself asks again
    if (this.slide && this.slide.x1 === x && this.slide.y1 === y) return;
    if (this.down) { this.slide = null; return; }
    const dx = x - this.x, dy = y - this.y;
    const D = Math.hypot(dx, dy);
    if (!this.alive || !(D > 0.05)) { this.x = x; this.y = y; this.slide = null; return; }
    const f = Number.isFinite(opts.friction) && opts.friction > 0 ? opts.friction : SLIDE_FRICTION;
    // the sim's 失衡 time (game s) at the playback rate; a slippery tile (f < 1) slides longer
    const rate = this.ctx.animRate?.() || 1;
    const T = Math.max(0.05, (opts.dur > 0 ? opts.dur / rate : clamp(DISPLACE_SLIDE * Math.sqrt(D), 0.12, 0.45)) / f);
    // v0 = 2D/T and a = v0/T run the distance in exactly T with the velocity reaching 0 there, integrated in update().
    // The slide owns an enemy's facing until it lands (the snapshot's vx points back down the route it resumes):
    // `face` 'push' — it faces the pusher, against its travel (client `Enemy.KnockBack` → `FaceTo(-direction)`; a push
    // with no left / right part leaves it as it was), 'keep' — a pull leaves it as it was (client `DragTowardSource`,
    // hook pulls); none (a raw displacement) — it faces its travel. battle/displacement.js push / pull.
    const face = opts.face === 'push' || opts.face === 'keep' ? opts.face : null;
    if (this.isEnemy && face === 'push') { if (Math.abs(dx) > 1e-3) this.visFacing = dx < 0 ? 1 : -1; }
    else if (this.isEnemy && !face) this.visFacing = dx < 0 ? -1 : 1;
    const v0 = 2 * D / T;
    const at = Number.isFinite(opts.at) ? opts.at : -Infinity;
    this.slide = {
      x1: x, y1: y, sx: this.x, sy: this.y, ux: dx / D, uy: dy / D, D, done: 0, v: v0, a: v0 / T, t: 0, dur: T,
      at, live: at === -Infinity, lx: x, ly: y, ox: 0, oy: 0, run: false, wait: 0, face,
    };
  }

  /**
   * 予愿安洁莉娜 S2's 吟唱 (the 'dash' fx with `chant`, server kit op-aglna2.js): her model rides the sweep — the client
   * carries it on projectile_chr_aglna2_s2_fly (follower `_restoreOnEnd` 1) — from her tile to (tx, ty) in `travel` game s,
   * stays there and is back on her tile as the `chant` game s end; her tile and the sim's position never move (PRTS 备注
   * "期间模型向前方移动（不改变所在地块及中心坐标）"). Clips: Skill_2_Takeoff_Begin / _Loop / _End over the 吟唱 (the
   * skill's ChantBeforeSkill `_animation`; the End clip — her take-off upward — as she reaches the end), then back home
   * as it ends (fx/kinds.js aglGlideBack) on Skill_2_Begin (`_afterEndAnim`, SpineActor.chant). She glides low and rises
   * to her airborne height over `rise` game s once home (aglna2_s_2[chant_end]: ModifyGraphicHolderHeight over
   * `height_duration` 1). [ASSUMED: constant speed (the movement's speed curve ≈0.95–1.13 not modelled).]
   */
  glide(tx, ty, { travel, chant, rise = 1 } = {}) {
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || !(chant > 0) || !this.alive || this.down) return;
    const g = this.glideS;
    const lx = g ? g.lx : this.x, ly = g ? g.ly : this.y;
    this.slide = null;
    const fly = Math.max(1e-3, Number(travel) || 0), back = aglGlideBack(fly, chant);
    this.glideS = { lx, ly, dx: tx - lx, dy: ty - ly, t: 0, travel: fly, back, rise };
    this.riseDur = 0;
    if (this.actor && this.spineReady) {
      this.actor.chant({ begin: 'Skill_2_Takeoff_Begin', loop: 'Skill_2_Takeoff_Loop', end: 'Skill_2_Takeoff_End', endAt: fly, total: back, after: 'Skill_2_Begin' });
    }
  }

  /** How high this unit hovers when it flies or is airborne: FLY_HOVER, or its own take-off height (LIFTOFF_HEIGHT). */
  _liftHeight() {
    const h = !this.flying && this.liftoff ? LIFTOFF_HEIGHT[this.info.spine || this.info.defId] : null;
    if (!h) return FLY_HOVER;
    const highSkill = h.high != null && this.info.skillIndex === h.highSkill && (this.flags & UF.SKILL) && (this.zTarget ?? this.z) > RAISED_Z;
    return highSkill ? h.high : h.lift;
  }

  setFacing(f) {
    if (this.isEnemy) { this.facing = f === -1 ? -1 : 1; return; }
    // the legacy ±1 only speaks about left / right: an UP / DOWN operator keeps its direction
    if (f === -1) this.setDir('LEFT');
    else if (this.dir === 'LEFT') this.setDir('RIGHT');
  }

  /**
   * Whether this unit should show its Back model: facing UP and a Back model exists — while it stands. A dead or
   * knocked-out one keeps the Back model only when that skeleton has a fall of its own (4 of the 135 Back models); the
   * others have no Die clip, so the Front model shows the fall and the held knocked-down pose (GitHub issue #25: the
   * Back model went on with its attack loop under the redeploy ring) [ASSUMED: no source says which model the official
   * client lies down with; a Back skeleton without a Die clip cannot show a fall].
   */
  _wantsBack() {
    const a = this.ctx.assets;
    const id = this.info.spine || this.info.defId;
    if (this.isEnemy || (this.face ? this.faceUd : this.dir) !== 'UP' || !id || !a || typeof a.hasBack !== 'function' || !a.hasBack(id)) return false;
    return this.alive || dieClipDur(typeof a.spineEntry === 'function' ? a.spineEntry(id, { back: true }) : null) > 0;
  }

  /**
   * Load the model the unit wants when it is not the one shown or loading (Front ⇄ Back: its direction, or it went down /
   * stood up again). A swap replaces the model in place (_acquireSpine: no diamond in between; a fall or a deploy clip
   * goes on where it is). Nothing before the first model was asked for (no manifest entry yet).
   */
  _syncModel() {
    if (this.entry && this._wantsBack() !== !!this.entryBack) this._loadSpine();
  }

  /**
   * Re-orient an operator / summon (UP|RIGHT|DOWN|LEFT, any case; the direction wheel's live preview and the stored
   * m.private `dir`). Mirrors for LEFT, swaps to the Back model for UP (and back) when the model differs.
   */
  setDir(dir) {
    if (this.isEnemy || this.destroyed) return;
    const d = unitDir({ dir, facing: this.facing });
    if (typeof dir !== 'string' || d === this.dir) return;
    this.dir = d;
    this.info.dir = d;
    this.hasDir = true;
    this.facing = d === 'LEFT' ? -1 : 1;
    this.face = faceOf(d);
    this.faceUd = this.face.ud;
    this.turnS = null;
    this.visFacing = this.face.lr;
    if (this.imp) this.imp.dirty = true;
    this._syncModel();
  }

  /**
   * An attack turns this operator / summon toward world point (x, y) as its swing starts (sim 'swing' with its main
   * target, render/app.js; client code `Entity.FaceToTarget`: nothing within 0.2 tiles; `Entity.FaceTo`: not while
   * stunned, frozen or asleep). Mirrors it toward a target behind it, takes the Back model for one above it
   * (render/face-turn.js). docs/rules/render.md 「공격 방향」.
   */
  turnToward(x, y) {
    const dx = x - this.x, dy = y - this.y;
    if (!(dx * dx + dy * dy > NEAR_SQ)) return;
    this.turnTo(dx, dy);
  }

  /**
   * Turn toward the vector (dx, dy) (`idle`: the way back to the deploy direction, FaceToDirection(idle)). The change
   * shows half way through a SWITCH_TIME turn (client code `FaceSwitcher._DoSwitchFaceInternal`, update → turnWidth); a
   * turn under way completes first (`_KillLastTween` → Kill(true)); a unit with no model drawn turns at once.
   */
  turnTo(dx, dy, idle = false) {
    if (!this.face || !this.alive || this.down || this.destroyed) return;
    if (this.flags & (UF.STUNNED | UF.FROZEN | UF.SLEEP)) return;
    if (!turnFace(this.face, dx, dy, idle)) return;
    if (this.turnS && !this.turnS.shown) this._showFace();
    if (!(this.actor && this.spineReady)) { this.turnS = null; this._showFace(); return; }
    this.turnS = { t: 0, shown: false };
  }

  /** Show the facing `face` holds: the mirror and the Front / Back model (a turn's half way, or at once). */
  _showFace() {
    if ((this.anim | 0) !== ANIM.MOVE) this.visFacing = this.face.lr;   // a kit's flight faces its travel until it lands
    if (this.imp) this.imp.dirty = true;
    if (this.faceUd !== this.face.ud) { this.faceUd = this.face.ud; this._syncModel(); }
  }

  /**
   * Face the deploy direction again (sim 'face': no target left, blocking nobody — client code `TryFaceToIdleDirection`
   * → `FaceToDirection(idle)`; `idle` false: an attack whose ability faces its default direction, `_faceToDefault`).
   */
  faceDeploy(idle = true) {
    const [dx, dy] = dirVector(this.dir);
    this.turnTo(dx, dy, idle);
  }

  /** Stand in the deploy direction outright (a (re)deployment: Character.OnBorn → FaceTo(direction)). */
  _resetFace() {
    if (!this.face) return;
    const was = this.faceUd;
    this.face = faceOf(this.dir);
    this.faceUd = this.face.ud;
    this.turnS = null;
    this.visFacing = this.face.lr;
    if (this.imp) this.imp.dirty = true;
    if (was !== this.face.ud) this._syncModel();
  }

  _releaseEntry(entry) {
    try { this.ctx.assets?.spine?.release(entry); } catch { /* ignore */ }
  }

  /** Destroy the current Spine actor (and its impostor) and release its asset entry (model swap / destroy). */
  _dropActor() {
    if (this.imp) {
      try { if (this.imp.slot) this.ctx.impostors?.free(this.imp.slot); this.imp.sprite.destroy(); if (this.imp.rt) this.imp.rt.destroy(true); } catch { /* ignore */ }
      this.imp = null;
    }
    this._box = null; this._boxExt = null; this._boxClips = null;
    this._tint = undefined;   // the next model gets the current tint on its first frame (a knocked-down one its grey)
    const old = this.actor;
    this.actor = null;
    this.spineReady = false;
    if (old) { try { old.destroy(); } catch { /* ignore */ } }
    if (this._actorEntry) this._releaseEntry(this._actorEntry);
    this._actorEntry = null;
  }

  /** An attack was made (b.ev 'atk'). `target` = view or null. */
  /** An fx `signal` of this unit (秘术师 'store'): the role's clip for it, over its attack interval (SpineActor.signalSwing). */
  onSignal(signal) {
    if (!this.alive || !this.actor || typeof signal !== 'string') return;
    this.actor.signalSwing(signal, this.atkInterval);
  }

  /** One attack hit now (b.ev 'atk'); `signal` = its 5th field: the client ability it is (a talent's own attack 'T.1'). */
  onAttack(target, now, kind, signal = null) {
    if (!this.alive) return;
    // a one-off cast (PROJ[kind].once: 暴鸰's bomb drop) is no attack rhythm: its clip plays once at its own speed
    const once = !!PROJ[kind]?.once;
    if (!once) {
      if (this.lastAtk >= 0) {
        const d = now - this.lastAtk;
        if (d > 0.05 && d < 6) this.atkInterval = this.atkInterval * 0.6 + d * 0.4;
      }
      this.lastAtk = now;
    }
    if (target && !this.isEnemy && this.info.kind !== 'device') {
      // operators turn at their swing's start instead (turnTo; render/app.js), not at the strike; enemies turn here
    } else if (target && this.isEnemy) {
      const dx = target.x - this.x;
      if (Math.abs(dx) > 0.1) this.visFacing = dx < 0 ? -1 : 1;
    }
    if (target) {
      const dx = target.x - this.x, dy = target.y - this.y, len = Math.hypot(dx, dy) || 1;
      this.lungeDir.x = dx / len; this.lungeDir.y = dy / len;
    }
    this.lunge = 1;
    this._atkKind(kind);
    if (this.actor) this.actor.attack(this.atkInterval, once, typeof signal === 'string' ? signal : null); // game seconds: the actor's clock runs in game time
    if (this.imp) this.imp.dirty = true;
  }

  /**
   * This unit starts a normal attack's swing now (b.ev 'swing'); its strike comes `windup` game seconds later: the Spine
   * attack clip plays from its start at the official speed (render/spine.js swing). True when the clip was started.
   * `kind` = the swing's projectile kind (its 4th field); `base` = its 5th field: the attack plays the Default attack clip
   * although a skill is on (赤刃明霄陈 S3 before its mode switch, kits/ops/op-chen3.js s3Spec); `combat` = its 7th: the main
   * target is an enemy this unit blocks (the role's `combat` clip, render/spine.js _swingClip).
   */
  onSwing(windup, kind, base = false, combat = false) {
    if (!this.alive || !this.actor || !this.spineReady) return false;
    this._atkKind(kind);
    this.actor.baseClip = !!base;
    this.actor.combatHit = !!combat;
    const ok = this.actor.swing(windup);
    if (ok && this.imp) this.imp.dirty = true;
    return ok;
  }

  /**
   * An attack by this unit is `lead` game seconds ahead in the snapshot buffer: start the Spine attack wind-up now
   * so the strike frame lines up with the attack. True once started (then stop calling for that attack). `kind` = the
   * 'atk' projKind (a one-off cast winds up at the clip's own speed).
   */
  windUp(lead, kind) {
    if (!this.alive || !this.actor || !this.spineReady) return false;
    this._atkKind(kind);
    const ok = this.actor.windUp(this.atkInterval, lead, !!PROJ[kind]?.once);
    if (ok && this.imp) this.imp.dirty = true;
    return ok;
  }

  /** The coming attack's projectile kind ('none' = melee): a 要塞's clip of it (FORTRESS_CLIPS). */
  _atkKind(kind) {
    if (this.actor?.fortressClips && typeof kind === 'string' && kind) this.actor.atkRanged = kind !== 'none';
  }

  onHit() { this.flash = 1; }

  /** The skill turned on / off (`variant`: the cast's clip variant, the sim's 'skill' event 4th field — anims skill `variants`). */
  setSkill(on, variant = null) {
    if (on) this.statuses.add('skill'); else this.statuses.delete('skill');
    if (this.actor) this.actor.setSkill(on, variant);
    // a skill's sub-mode (FORMS `endsWithSkill`) ends with it — its End clip was chosen in that mode just above
    if (!on && this._formSpec()?.endsWithSkill) {
      this.form = null;
      this.info.form = null;
      this.actor?.setForm(null);
    }
  }

  /** A (re)deployment; `key`: the deploy clip's key (the sim's 'deploy' event 4th field — SpineActor.deploy). */
  onDeploy(key = null) {
    const official = !this.isEnemy && !!this.entry; // local patch: the official drop-in (BORN_LEAD_S, BORN_TINT_S)
    this.bornOfficial = official;
    this.fadeIn = official ? 1 : 0;
    this._deployKey = typeof key === 'string' ? key : null;
    if (!this.alive) this.revive();
    this._resetFace();
    this._bornStart(official);
    return official;
  }

  /** The skill's deploy clip `key` without a deployment (a sim fx's `redeploy`: 乌尔比安 S3's anchor on his own tile). */
  replayDeploy(key) {
    this._deployKey = typeof key === 'string' ? key : null;
    if (this.alive && this.actor) this.actor.deploy(this._deployKey);
  }

  /** A model already shown drops in at once; none yet (a battle start builds every view then): the ring and
   *  shadow first, update() plays Start once the model is in (BORN_LEAD_S). */
  _bornStart(official) {
    if (official && !this.actor) { this._bornWait = 0; this._bornT = 0; }
    else if (this.actor) { this.actor.deploy(this._deployKey); if (official) this._bornT = BORN_TINT_S; }
  }

  onStatus(key, on) {
    if (typeof key !== 'string') return;
    if (on) this.statuses.add(key); else this.statuses.delete(key);
  }

  /**
   * The unit died: its Die clip plays, then it fades (unless it stays down, setDown). `instant`: it starts on the held
   * end of the clip — a unit that is already down (a field joined mid-battle, an operator entering 联防 knocked out).
   * An operator facing UP whose Back model has no Die clip (GitHub issue #25) falls with its Front model: the swap is
   * made by this frame's update (`_modelDirty` → _syncModel, after every event and snapshot of the frame, so a death
   * and a redeploy in one frame — a 突袭 jump, a 不屈 revive, a backlog after a hidden tab — load nothing); meanwhile the
   * Back model holds still (SpineActor.die), and the Front model's Die clip times the fade. The form it dies in
   * (`_dieForm`: a 傀儡师's 替身, which the sim resets right after the 'die' event) gives that model — and any built while
   * it lies down — its death clip, until it stands up again; so does the skill it dies in (`_dieSkill`: the Die pair of
   * the skill's mode, SpineActor.dieClip — the sim ends the skill right before the 'die' event).
   */
  die(instant = false) {
    if (!this.alive) return;
    this.alive = false;
    this._modelDirty = true;
    this._dieForm = this._formSpec();
    // a form that ends with a knock-out (`endsOnDeath`: 烛煌 downed) — the death clip still comes from it (_dieForm)
    if (this._dieForm?.endsOnDeath) { this.form = null; this.info.form = null; }
    // a skill's mode it dies in (SpineActor.skillDying: its own Die pair) — kept for the model built for the knock-out
    this._dieSkill = this.actor ? this.actor.skillDying() : !!(this.flags & UF.SKILL);
    let d = this.actor ? this.actor.die(this._dieSkill) : 0;
    if (this.actor && !d) d = this._fallDur();
    const rate = this.ctx.animRate?.() || 1;
    this.dieT = 0;
    this.dying = clamp(d / rate, 0.35, DIE_CLIP_MAX) + DIE_FADE_TAIL;
    this.dieDur = this.dying;
    if (instant) { this.dieT = 30; if (this.actor) this.actor.update(30); }
  }

  /** Seconds of the fall of the model the unit wants now (its manifest entry's Die clip), 0 without one. */
  _fallDur() {
    const a = this.ctx.assets;
    const id = this.info.spine || this.info.defId;
    return a && typeof a.spineEntry === 'function' && id ? dieClipDur(a.spineEntry(id, { back: this._wantsBack() })) : 0;
  }

  /** Standing again (a redeploy, a revive): an operator facing UP gets its Back model back (this frame's update). */
  revive() {
    this.alive = true;
    this._modelDirty = true;
    // a model built while it lay in a form's death pose (_dieForm) stands up on the unit's own clips
    if (this._dieForm && this.actor && !this._formSpec()) this.actor.setForm(null);
    this._dieForm = null;
    this._dieSkill = false;
    this.dying = 0; this.remove = false; this.alpha = 1;
    this.down = null;
    this.hp = this.maxHp; this.ghostHp = this.hp;
    if (this.actor) this.actor.revive();
  }

  /**
   * Knocked-out state (b.snap `down` entry `[id, respawnAt, respawnTime, state, row?, col?]`, render/interp.js downAt)
   * or null; `t` = the render clock's game time. A living view is knocked down first (its Die clip plays; `instant`: a
   * view made for a unit that is already down — a field joined mid-battle — starts on the held end of the clip). While
   * down the view never fades: the Die clip's last frame stays on the tile the entry names (the view moves there when
   * it stands elsewhere: a body that went back to its home, a view built from the unit's deploy info) under the
   * redeploy ring. null on a view still down (it left for good) starts the fade; the redeploy itself comes through
   * onDeploy / revive.
   */
  setDown(d, t, instant = false) {
    if (Number.isFinite(t)) this.gameT = t;
    if (!d) {
      if (!this.down) return;
      this.down = null;
      if (!this.alive) { this.dying = DIE_FADE_TAIL; this.dieDur = DIE_FADE_TAIL; }
      return;
    }
    if (this.alive) this.die(instant);
    if (Number.isInteger(d[4]) && Number.isInteger(d[5]) && (this.x !== d[5] || this.y !== d[4])) {
      this.x = d[5]; this.y = d[4];
      this.z = this.zTarget = groundZ(this.ctx, this.x, this.y);
    }
    if (this.zTarget == null) this.z = this.zTarget = groundZ(this.ctx, this.x, this.y); // never synced: its tile top
    this.dying = 0; // no death fade while down
    const dn = this.down || (this.down = { until: 0, total: 0, state: DOWN_STATE.COUNTING });
    dn.until = Number(d[1]) || 0;
    dn.total = Math.max(0, Number(d[2]) || 0);
    dn.state = d[3] | 0;
  }

  // ---- per frame -------------------------------------------------------------------------------------------

  /** @param {number} dt real seconds @param {any} cam camera @param {number} t real clock */
  update(dt, cam, t) {
    if (this.destroyed) return;
    // a displacement's slide (slideTo): held where it stood until the snapshot with the destination is shown, then
    // eased into the sampled position (sync keeps `lx, ly` current) under a constant deceleration
    if (this.slide) {
      const sl = this.slide;
      if (this.down) this.slide = null;   // a knocked-down view lies on its tile (setDown)
      else if (!sl.live) {
        this.x = sl.sx; this.y = sl.sy;
        // the destination's snapshot never shown (the unit left the snapshots, a stalled stream): it slides to the
        // destination the fx named
        if ((sl.wait += dt) > 0.5) sl.live = true;
      } else {
        if (!sl.run) { sl.run = true; sl.ox = sl.sx - sl.lx; sl.oy = sl.sy - sl.ly; }
        const step = Math.min(dt, 0.1);                // a hidden tab's catch-up frame must not overshoot
        const v0 = sl.v;
        sl.v = Math.max(0, sl.v - sl.a * step);        // friction: the velocity decays every frame
        // the step's mean velocity — exact under a constant deceleration (the end-of-step speed fell ~D·dt/T short:
        // 9 % of a 0.18 s slide at 60 fps, then a jump onto the end)
        sl.done = Math.min(sl.D, sl.done + (v0 + sl.v) / 2 * step);
        sl.t += step;
        if (this.isEnemy && !sl.face) this.visFacing = sl.ux < 0 ? -1 : 1;
        const k = 1 - sl.done / sl.D;                  // the share of the way still to go
        this.x = sl.lx + sl.ox * k; this.y = sl.ly + sl.oy * k;
        // the clock or the spent velocity lands it on the sampled position
        if (sl.t >= sl.dur - 1e-9 || sl.done >= sl.D - 1e-9 || sl.v <= 1e-9) { this.x = sl.lx; this.y = sl.ly; this.slide = null; }
      }
    }
    // a glide (glide): out along its way, held at its end, back on the tile as it ends — the lift then rises
    if (this.glideS) {
      const g = this.glideS;
      g.t += dt * (this.ctx.animRate?.() || 1);
      if (g.t >= g.back || !this.alive || this.down) {
        this.glideS = null;
        this.x = g.lx; this.y = g.ly;
        this.riseDur = g.rise > 0 ? g.rise : 0;
      } else {
        const k = Math.min(1, g.t / g.travel);
        this.x = g.lx + g.dx * k; this.y = g.ly + g.dy * k;
      }
    }
    const P = this.P;
    // a turn (turnTo) runs in battle time; the change shows half way, and a unit down or dead turns no further
    let turnK = 1;
    if (this.turnS) {
      const ts = this.turnS;
      ts.t += dt * (this.ctx.animRate?.() || 1);
      if (!ts.shown && (ts.t >= SWITCH_TIME / 2 || !this.alive || this.down)) { ts.shown = true; this._showFace(); }
      if (ts.t >= SWITCH_TIME || !this.alive || this.down) this.turnS = null;
      else turnK = turnWidth(ts.t);
    }
    // the model for the state the frame's events and snapshot left (Front ⇄ Back when it went down / stood up: die, revive)
    if (this._modelDirty) { this._modelDirty = false; this._syncModel(); }
    // a failed / timed-out model load is tried again once its wait is over (SPINE_RETRY_MS; frames only: never hidden)
    if (this._retryAt && nowMs() >= this._retryAt) { this._retryAt = 0; if (!this.actor && !this._spineBusy) this._loadSpine(true); }
    // a load begun in a hidden tab and still in flight SPINE_STUCK_MS after it came back: started again (GitHub #68)
    if (this._stuckAt && nowMs() >= this._stuckAt) {
      this._stuckAt = 0;
      if (!this.actor && this._spineBusy && this.entry) { this._spineHidden = false; this.ctx.assets?.spine?.restart?.(this.entry); }
    }
    if (this.zTarget != null && this.z !== this.zTarget) {
      const d = this.zTarget - this.z;
      this.z = Math.abs(d) < 1e-3 ? this.zTarget : this.z + d * Math.min(1, dt * 12);
    }
    if (this.shadowZTarget != null && this.shadowZ !== this.shadowZTarget) {
      const d = this.shadowZTarget - this.shadowZ;
      this.shadowZ = Math.abs(d) < 1e-3 ? this.shadowZTarget : this.shadowZ + d * Math.min(1, dt * 12);
    }
    // a flyer keeps its lift through the Die clip and drops only as it fades out: the client removes the fly offset in
    // CharacterAnimator.OnFinish, when the finish state ends; a knocked-down flyer lies on the ground. An airborne (起飞)
    // operator rises to the same height and comes down when it lands (maintainer decision 2026-10-11, docs/rules/render.md
    // 「이륙 높이」); its shadow stays on its tile
    const hoverTo = (this.flying || this.liftoff) && !this.glideS && (this.alive || (this.dying > DIE_FADE_TAIL && !this.down)) ? this._liftHeight() : 0;
    if (this.riseDur > 0 && hoverTo > this.hover) this.hover = Math.min(hoverTo, this.hover + hoverTo / this.riseDur * dt * (this.ctx.animRate?.() || 1));
    else if (this.hover !== hoverTo) { this.riseDur = 0; this.hover = Math.abs(hoverTo - this.hover) < 1e-3 ? hoverTo : this.hover + (hoverTo - this.hover) * Math.min(1, dt * 6); }
    if (this.riseDur > 0 && this.hover >= hoverTo) this.riseDur = 0;
    const p = cam.project(this.x, this.y, this.z + this.hover + this.lift, this.screen);
    const s = p.s;
    // fades
    if (this.fadeIn < 1) this.fadeIn = Math.min(1, this.fadeIn + dt * 4);
    if (this._bornT > 0) this._bornT = Math.max(0, this._bornT - dt); // local patch: the dark first frames (BORN_TINT_S)
    if (this._bornWait >= 0) { // local patch: the body waits BORN_LEAD_S (and for its model) before Start plays
      this._bornWait += Math.min(dt, 0.25); // a hitch of the battle switch does not use up the wait (DEPLOY_MAX_STEP_S)
      if (this.actor && this.spineReady && this._bornWait >= BORN_LEAD_S && this.alive) { this._bornWait = -1; this.actor.deploy(this._deployKey); this._bornT = BORN_TINT_S; }
      else if (this._bornWait >= BORN_WAIT_MAX_S || !this.alive) this._bornWait = -1;
    }
    this.body.alpha = this._bornWait >= 0 ? 0 : 1;
    let alpha = this.fadeIn;
    if (this.down) {
      // knocked down: the Die clip ends and holds its last frame (the actor keeps its clock), no fade
      this.dieT += dt;
      alpha *= DOWN_LOOK.alpha;
    } else if (this.dying > 0) {
      this.dieT += dt;
      this.dying -= dt;
      const tail = DIE_FADE_TAIL;
      if (this.dying < tail) alpha *= Math.max(0, this.dying / tail);
      if (this.dying <= 0) { this.dying = 0; this.remove = true; alpha = 0; }
    }
    // local patch (⑤): a 隐匿 drawn by its official effect takes the prefab's ColorModifier — grey (.5) at α .894
    // (common_invisible; allies too since maintainer report 2026-10-07 — fxstatus.js) — instead of the 45 % ghost (迷彩, and
    // without the effect keep it)
    const lpInvis = !!(this._fxStatusOn?.has('stealth') || this._fxStatusOn?.has('stealthAlly'));
    if (this.flags & UF.STEALTH) alpha *= lpInvis ? 0.894 : 0.45;
    if (this.dimmed) alpha *= 0.35;
    if (this.ghost) alpha *= GHOST_ALPHA; // local patch
    this.alpha = alpha;

    // body placement — the 0.12-tile jolt toward the target on an attack stands in for the avatar diamond's missing attack
    // clip; a Spine model plays its own and keeps its place (GitHub #61: every ranged attack shoved the model aside)
    const lungeK = this.lunge > 0 && !(this.actor && this.spineReady) ? Math.sin(this.lunge * Math.PI) * 0.12 : 0;
    this.lunge = Math.max(0, this.lunge - dt * 5);
    const lx = this.lungeDir.x * lungeK, ly = this.lungeDir.y * lungeK;
    let bx = p.x, by = p.y;
    if (lungeK || this.modelDX) { const q = cam.project(this.x + this.modelDX + lx, this.y + ly, this.z + this.hover + this.lift, LG_P); bx = q.x; by = q.y; }
    this.root.position.set(bx, by);
    this.root.alpha = alpha;
    this.root.zIndex = unitDepthKey(cam, this.x, this.y, this.lift);
    // off-screen: nothing to animate or draw (bounds / hit-testing still follow `screen`)
    if (this._cull(bx, by, s, dt)) return;
    const flip = (this.isEnemy ? (ENEMY_MODEL_FACES_LEFT ? -this.visFacing : this.visFacing) : this.visFacing) * (this.mirrorX ? -1 : 1) * turnK;

    // shadow (on a raised top it is drawn with that block row, else in the shadow layer under everything); an enemy
    // flyer's lies on the tile under it while its body hovers from the road (shadowZ, GitHub #277)
    const shz = this.shadowZ ?? this.z;
    placeOnGround(this.ctx, this.shadow, this.ctx.layers.shadow, this.y, shz);
    const sh = cam.project(this.x + this.modelDX, this.y, shz, SH_P);
    this.shadow.position.set(sh.x, sh.y);
    const shw = s * (this.isBoss ? 1.6 : 0.95) / this.shadow.texture.width;
    this.shadow.scale.set(shw, shw * (this.shadow.texture === shadowTexture() ? 1 : 1.05));
    this.shadow.alpha = this.bodyless ? 0 : 0.5 * alpha * (this.lift > 0 ? 0.6 : 1);

    // model / fallback
    const spineShown = this.actor && this.spineReady;
    if (spineShown) {
      syncHeldWeapon(this.actor, this); // local patch (maintainer report): the held boomerang, off while one flies
      if (this.swapT < 1) this.swapT = Math.min(1, this.swapT + dt * 5);
      this.fallback.alpha = 1 - this.swapT;
      this.fallback.visible = this.swapT < 1;
      const sc = s * UNIT.modelScale * this.modelK;
      // what the skeleton is drawn at, whether directly or through an impostor (whose skeleton is scaled for its slot)
      this.modelSX = sc * flip; this.modelSY = sc * this.modelKY;
      const flashK = this.flash > 0 ? this.flash : 0;
      let tint = this.baseTint;
      if (this.down) tint = DOWN_LOOK.tint;
      else if (this.flags & UF.FROZEN && !this._fxStatusOn?.has('freeze')) tint = 0x9fd4ff; // local patch: not under the official ice block
      else if (this.flags & UF.COLD && !this._fxStatusOn?.has('cold')) tint = 0xcfe6ff;
      else if (lpInvis) tint = 0x808080; // local patch: common_invisible's ColorModifier (.5, .5, .5)
      if (flashK > 0) tint = mixTint(tint, 0xff8a80, flashK * 0.8);
      if (this._bornT > 0) tint = mixTint(tint, 0x000000, BORN_TINT_K * (this._bornT / BORN_TINT_S)); // local patch
      let animDt = dt * (this.ctx.animRate?.() || 1);
      // local patch (maintainer 2026-10-08 「작전 시작할때 배치 효과음은 나오는데 배치 연출이 안나오고 있어」, not reproduced here [추정]):
      // the drop-in (Start, landing at ~0.2 s) is never swallowed — no off-screen catch-up while it plays, and a long
      // frame (the battle switch building the field) advances it by at most DEPLOY_MAX_STEP_S
      const falling = this.actor.mode === 'deploy';
      if (this._offDt > 0) { if (!falling) animDt += Math.min(0.5, this._offDt); this._offDt = 0; }
      if (falling) animDt = Math.min(animDt, DEPLOY_MAX_STEP_S * (this.ctx.animRate?.() || 1));
      let interval = this.ctx.impostorInterval ? this.ctx.impostorInterval() : 0;
      if (this.lodIdle) interval = Math.max(interval, 3);
      const lvl = this.ctx.loadLevel ? this.ctx.loadLevel() : 0;
      if (lvl > 0) {
        this._far = this._far ? s < 60 : s < 52;
        if (lvl >= 2 || this._far) interval = Math.max(interval, 2);
      }
      let clipFlip = false;
      if (this.actor.clipped) {
        const clip = this.ctx.clipAllowed ? this.ctx.clipAllowed() : true;
        const was = this.actor.clipOn;
        this.actor.setClipping(clip);
        clipFlip = was !== this.actor.clipOn;
        if (clip && this.ctx.impostors) interval = Math.max(1, interval);
      }
      // a pose that cannot change (a knocked-out operator lying in its held Die pose, a frozen model) is neither re-posed
      // nor redrawn — it would draw the same pixels again; the actor's clock still runs
      const held = !clipFlip && this.actor.poseHeld();
      // local patch: no impostor while an unclipped model falls in (its slot is sized from the standing pose)
      if (interval > 0 && this.ctx.renderer && !(this.actor.mode === 'deploy' && !this.actor.clipped)) {
        if (clipFlip && this.imp) this.imp.dirty = true;   // masks on / off: the slot is redrawn either way
        this._updateImpostor(sc, flip, tint, animDt, interval, held);
      } else {
        if (this.imp) this._leaveImpostor();
        this.actor.spine.alpha = this.swapT;
        this.actor.spine.scale.set(sc * flip, sc * this.modelKY);
        if (held) this.actor.clock += animDt;
        else this.actor.update(animDt);
        if (this._tint !== tint) { this._tint = tint; this.actor.spine.tint = tint; }
      }
    }
    // the diamond is only needed while no model shows (a cross-fade keeps whatever diamond was already up); a bodiless
    // marker (shared/trap-tokens.js) shows none — only its effect
    if (this.bodyless) this.fallback.visible = false;
    else if (!spineShown) this._ensurePicture();
    if (!spineShown || this.swapT < 1) {
      const size = s * UNIT.diamond * (this.isBoss ? 1.5 : 1);
      const bob = this.alive ? Math.sin(t * 2.4 + this.bob) * s * 0.03 : 0;
      this.fallback.scale.set(size / 160);
      this.fallback.position.set(0, -s * 0.08 + bob);
      this.fallback.tint = this.down ? DOWN_LOOK.tint : this.flash > 0 ? mixTint(0xffffff, 0xff8a80, this.flash) : (this.flags & UF.FROZEN ? 0x9fd4ff : 0xffffff);
      if (!this.alive) this.fallback.alpha = Math.max(0, this.fallback.alpha);
    }
    this.flash = Math.max(0, this.flash - dt * 6);

    // facing chevron on the ground, like the original's orange › (research 09 §1.2: prep and combat): own prep pieces
    // on the board (app.js sets _showFacing; bench pieces have none); battle / scouting allies whose dir is known
    let wedge = this._showFacing !== undefined ? this._showFacing && this.prep : this.hasDir && this.info.kind !== 'device';
    if (wedge && (facingless(this.info.defId) || this.bodyless)) wedge = false; // local patch: summons placed without a facing
    if (wedge && this.flying) wedge = false; // a flying ally (炎佑) has no deploy tile nor facing
    // local patch (LOCAL-PATCH.md 「전투 화면 UI」): the official ring + arrow on the ground when the art is there (facing.js)
    const facingTex = wedge && this.alive ? facingTextures(P, this.ctx.assets) : null;
    if (facingTex) {
      if (!this._facing) this._facing = new FacingMarker(P, facingTex);
      placeOnGround(this.ctx, this._facing.root, this.ctx.layers.groundFx, this.y, this.z);
      this._facing.root.visible = this.lift <= 0;
      this._facing.update(cam, this.x, this.y, this.z + 0.01, DIR_STEP[this.dir] || DIR_STEP.RIGHT, alpha);
      if (this.facingArrow) this.facingArrow.visible = false;
    } else if (this._facing) this._facing.root.visible = false;
    if (wedge && this.alive && !facingTex) {
      if (!this.facingArrow) {
        this.facingArrow = new P.Sprite(fxAtlas().tex.chevron);
        this.facingArrow.anchor.set(0.5);
        this.facingArrow.tint = 0xff9c33;
        this.ctx.layers.groundFx.addChild(this.facingArrow);
      }
      placeOnGround(this.ctx, this.facingArrow, this.ctx.layers.groundFx, this.y, this.z);
      // on the ground ring, 0.36 tile out along the deploy direction; rotated to the projected direction and
      // foreshortened along it (the chevron texture points right: local x = the pointing axis)
      const [sx, sy] = DIR_STEP[this.dir] || DIR_STEP.RIGHT;
      const c0 = cam.project(this.x, this.y, this.z + 0.01, FA_C);
      const fa = cam.project(this.x + 0.36 * sx, this.y + 0.36 * sy, this.z + 0.01, FA_P);
      const vx = fa.x - c0.x, vy = fa.y - c0.y;
      const len = Math.hypot(vx, vy) || 1;
      this.facingArrow.visible = this.lift <= 0;
      this.facingArrow.position.set(fa.x, fa.y);
      this.facingArrow.rotation = Math.atan2(vy, vx);
      const fs = (s * 0.22) / 64;
      const along = clamp(len / (s * 0.36 || 1), 0.35, 1.2);
      this.facingArrow.scale.set(fs * along, fs * (sy ? 1 : 0.8));
      this.facingArrow.alpha = 0.9 * alpha;
    } else if (this.facingArrow) this.facingArrow.visible = false;

    // elite aura
    if (this.aura) {
      const k = 0.35 + 0.12 * Math.sin(t * 2.2 + this.bob);
      this.aura.alpha = k;
      this.aura.visible = !this._fxStatusOn?.has('golden'); // local patch: the official prep glow instead (fxgolden.js)
      this.aura.scale.set((s * 1.3) / 128, (s * 1.9) / 128);
    }

    // head height: operators/tokens are uniform chibis; enemies vary (setup-pose bounds, when known; else the chibi
    // headroom × their official model factor)
    let headTiles = UNIT.headroom;
    if (this.isEnemy && spineShown && this.actor.entry.bounds) headTiles = clamp(this.actor.height * UNIT.modelScale * this.modelK * this.modelKY * 0.92, 0.55, this.isBoss ? 3.2 : 2.2);
    else if (this.isEnemy && this.isBoss) headTiles = 2.2;
    else if (this.isEnemy && spineShown) headTiles = clamp(UNIT.headroom * this.modelK * this.modelKY, 0.55, 2.2);
    this._headTiles = headTiles;
    this.screen.top = by - headTiles * s;
    this._updateHud(dt, s, bx, by - headTiles * s, alpha, t);
  }

  /**
   * Viewport culling: true (and everything hidden) while the unit's body lies outside the viewport with a margin.
   * Dying units are never culled (their fade must finish and remove the view).
   */
  _cull(bx, by, s, dt) {
    const vp = this.ctx.viewport ? this.ctx.viewport() : null;
    let off = false;
    if (vp && !(this.dying > 0) && !this.lift) {
      const m = s * 1.3;
      off = bx < -m || bx > vp.width + m || by < -m * 0.5 || by - s * 3.6 > vp.height;
    }
    if (off !== this.culled) {
      this.culled = off;
      this.root.visible = !off;
      this.hud.visible = !off;
      this.shadow.visible = !off;
      if (off) { if (this.facingArrow) this.facingArrow.visible = false; if (this._facing) this._facing.root.visible = false; this.blockIcon.visible = false; }
    }
    if (off) this._offDt += dt * (this.ctx.animRate?.() || 1);
    return off;
  }

  _updateHud(dt, s, x, y, alpha, t) {
    const prep = this.prep;
    const showBars = !prep && this.alive && this.info.kind !== 'item';
    const damaged = this.hp < this.maxHp - 0.5;
    const showHp = showBars && (!this.isEnemy || damaged || this.isBoss) && !noHpBar(this.info.defId); // local patch: traps
    const bw = clamp(s * (this.isBoss ? UNIT.bossBarWidth : UNIT.barWidth), 24, this.isBoss ? 260 : 96);
    const bh = clamp(s * (this.isBoss ? 0.12 : 0.075), 3, this.isBoss ? 12 : 7);
    // a knocked-down operator's HUD is its redeploy ring alone, drawn at full strength over the greyed model
    this.hud.alpha = this._bornWait >= 0 ? 0 : this.down ? this.fadeIn : this.dying > 0 ? 0 : alpha; // local patch: bars with the body
    let sx = this.shake > 0 ? Math.sin(t * 90) * this.shake * 10 : 0;
    this.shake = Math.max(0, this.shake - dt);
    const x0 = x - bw / 2 + sx;
    let cy = y - 4;
    // local patch (LOCAL-PATCH.md 「전투 화면 UI」): allies draw the official bars under their feet, screen-fixed (hud-bars.js)
    const lp = !!this.lpBars;
    let lpBottom = 0;
    // HP
    this.hpBg.visible = this.hpFill.visible = this.hpGhost.visible = showHp && !lp;
    if (showHp) {
      const k = this.maxHp > 0 ? clamp(this.hp / this.maxHp, 0, 1) : 0;
      if (this.ghostHp < this.hp) this.ghostHp = this.hp;
      else this.ghostHp = Math.max(this.hp, this.ghostHp - this.maxHp * dt * 0.9);
      const g = this.maxHp > 0 ? clamp(this.ghostHp / this.maxHp, 0, 1) : 0;
      if (lp && this.isEnemy) {
        // (an enemy's SP is 圣堂剑士's bullets alone: sim/content/local-patch.js)
        lpBottom = this.lpBars.update(this.screen.x, this.screen.y, hudUnit(this.ctx.viewport?.()), s, dt,
          { hp: k, ghost: g, ammo: this.spMax > 0 ? [this.sp, this.spMax] : null, sp: this.bsp ? clamp(this.bsp[0] / this.bsp[1], 0, 1) : null }, this.ctx.assets);
      } else if (lp) {
        // the bullet bar whenever the sim lists it (b.snap `ammo`, sim local-hud.js bulletView): a running ammo skill, or a
        // bullet-mode skill while it is affecting — a passive one (琳琅诗怀雅's coins) carries no UF.SKILL
        const u = hudUnit(this.ctx.viewport?.()), active = !!(this.flags & UF.SKILL);
        const sp = this.spMax > 0 ? clamp(this.sp / this.spMax, 0, 1) : null;
        const bar = shieldedBar(this.hp, this.maxHp, this.ghostHp, this.barrier);
        lpBottom = this.lpBars.update(this.screen.x + sx, this.screen.y, u, { hp: bar.hp, ghost: bar.ghost, split: bar.split, sp, cast: active, ammo: this.ammo }, this.ctx.assets);
      }
      this.hpBg.position.set(x0 - 1, cy); this.hpBg.width = bw + 2; this.hpBg.height = bh + 2;
      this.hpGhost.position.set(x0, cy); this.hpGhost.width = bw * g; this.hpGhost.height = bh;
      this.hpFill.position.set(x0, cy); this.hpFill.width = bw * k; this.hpFill.height = bh;
      if (!this.isEnemy) this.hpFill.tint = k < 0.3 ? COLORS.hpAllyLow : COLORS.hpAlly;
    } else if (lp) this.lpBars.hide();
    // the official bars draw an ally's barrier amount inside the HP bar (hud-bars.js shieldedBar) and nothing for a hit-count
    // 护盾 layer (BlockDamage `_showShieldUI` false in archet_t_2, kalts2_t_2[shield], mudrok_t_1, nearl2_s_2[shield]: its
    // effects are the buff's own and the block's parry, fxgame.js) — no strip on an ally's official bars; it stays for an
    // enemy's barrier and the plain bars
    const shielded = showHp && (this.flags & UF.SHIELD) && !(lp && !this.isEnemy);
    this.shieldBar.visible = !!shielded;
    if (shielded && lp) { const u = hudUnit(this.ctx.viewport?.()), b = this.lpBars.box; this.shieldBar.position.set(b.x0, b.top - 1.5 * u); this.shieldBar.width = b.w; this.shieldBar.height = Math.max(1.5, 2.5 * u); } // local patch: a strip over the official HP bar
    else if (shielded) { this.shieldBar.position.set(x0, cy - bh / 2 - 1); this.shieldBar.width = bw; this.shieldBar.height = Math.max(1.5, bh * 0.35); }
    // SP
    const showSp = showBars && this.spMax > 0; // local patch: an enemy sends SP only for 圣堂剑士's bullets (sim/content/local-patch.js)
    this.spBg.visible = this.spFill.visible = showSp && !lp; // local patch: allies' SP is in their official bars
    const spH = Math.max(2, bh * 0.6);
    let ready = false;
    if (showSp) {
      const active = !!(this.flags & UF.SKILL);
      const k = clamp(this.sp / this.spMax, 0, 1);
      ready = !active && k >= 0.999 && !this.isEnemy && !lp; // local patch: bullets, not a charged skill; no glow on the official bars
      const sy = cy + bh / 2 + spH / 2 + 1.5;
      this.spBg.position.set(x0 - 1, sy); this.spBg.width = bw + 2; this.spBg.height = spH + 2;
      this.spFill.position.set(x0, sy); this.spFill.width = bw * k; this.spFill.height = spH;
      this.spFill.tint = active ? COLORS.spActive : ready ? COLORS.spReady : COLORS.sp;
      this._spY = sy;
    }
    this.spGlow.visible = ready;
    if (ready) {
      const pulse = 0.55 + 0.35 * Math.sin(t * 6);
      this.spGlow.position.set(x0 + bw, this._spY);
      this.spGlow.scale.set((spH * 5) / 128);
      this.spGlow.alpha = pulse;
    }
    // tier chip (left of the bars in battle; above the head in prep)
    if (this.chip) {
      // local patch (LOCAL-PATCH.md 「전투 화면 UI」): no chip in battle (official); in prep the official autochess_level_N
      // sprite at `shop_hud`'s place when the local client art is installed (hud-bars.js PREP_CHIP)
      const off = prep ? prepChip(this.P, this.ctx.assets, this.tier) : null;
      if (off) {
        const u = hudUnit(this.ctx.viewport?.());
        if (this.chip.texture !== off.tex) this.chip.texture = off.tex;
        this.chip.scale.set(off.k * u);
        this.chip.visible = this.alive;
        this.chip.position.set(this.screen.x + PREP_CHIP.x * u, hudAnchorY(this.screen.y, u) - PREP_CHIP.y * u);
      } else {
      if (this.chip.texture !== this._chipTex) this.chip.texture = this._chipTex;
      const cs = clamp(s * (prep ? 0.24 : 0.19), 11, 28) / 44;
      this.chip.scale.set(cs);
      this.chip.visible = this.alive && (prep || !lp);
      if (prep) this.chip.position.set(x, y - this.chip.height / 2 + 2);
      else this.chip.position.set(x0 - this.chip.width / 2 - 1, cy + (showSp ? spH / 2 : 0));
      }
    }
    // status icons row above the bars
    const icons = this._iconKeys();
    const isz = clamp(s * 0.26, 12, 26);
    const iy = cy - bh / 2 - isz / 2 - 3;
    for (let i = 0; i < this.icons.length; i++) {
      const ic = this.icons[i];
      const key = icons[i];
      if (!key || !this.alive || prep) { ic.visible = false; continue; }
      const tex = statusTexture(key);
      if (!tex) { ic.visible = false; continue; }
      ic.texture = tex;
      ic.visible = true;
      ic.width = ic.height = isz;
      ic.position.set(x - ((icons.length - 1) * (isz + 2)) / 2 + i * (isz + 2), iy);
    }
    // element gauge row under the bars (b.snap `elem`); redeploy ring above a knocked-down operator (b.snap `down`)
    if (lp) { // local patch: the official element ring at the feet (hud-bars.js ElementRing); without its art the row under the bars
      const u = hudUnit(this.ctx.viewport?.()), w = (this.isEnemy ? 105 : 125) * u, side = this.isEnemy ? 'enemy' : 'ally';
      const want = showBars && !!this.el;
      if (want && !this._elRing && epRingReady(this.P, this.ctx.assets, side)) this._elRing = new ElementRing(this.P, this.hud, side);
      const ring = want && !!this._elRing && this._elRing.update(this.ctx.assets, this.el, this.elementLeft(), this.elementCooling(), this.screen.x, this.screen.y, u, dt);
      if (!ring && this._elRing) this._elRing.hide();
      this._updateElementBar(want && !ring, lpBottom ? this.lpBars.box.x0 : this.screen.x - w / 2, lpBottom ? this.lpBars.box.w : w,
        lpBottom || hudAnchorY(this.screen.y, u) + 59 * u, 7 * u, s, t);
    }
    else this._updateElementBar(showBars && !!this.el, x0, bw, cy + bh / 2 + (showSp ? spH + 1.5 : 0) + 1, spH, s, t);
    this._updateDownRing(!prep && !!this.down && !this.alive, x, this.screen.y - DOWN_LOOK.height * s, s, t);
    // blocked marker at the feet (enemies held by a blocker)
    const blocked = !prep && this.alive && this.isEnemy && (this.flags & UF.BLOCKED);
    this.blockIcon.visible = !!blocked;
    if (blocked) {
      const f = this.screen;
      this.blockIcon.position.set(f.x + (this.visFacing < 0 ? -1 : 1) * s * 0.34, SH_P.y - s * 0.04);
      this.blockIcon.scale.set(clamp(s * 0.22, 9, 22) / 32 * (this.visFacing < 0 ? -1 : 1), clamp(s * 0.22, 9, 22) / 32);
      this.blockIcon.alpha = 0.85 * alpha;
    }
    // count badge & item pips (prep)
    if (this.countText && this.countText.visible) {
      this.countText.scale.set(clamp(s / 90, 0.5, 1.2));
      this.countText.position.set(x + s * 0.32, this.screen.y - s * 0.12);
    }
    // local patch (LOCAL-PATCH.md 「전투 화면 UI」): in prep the official equip bar stands for the item pips when installed
    const eqTex = prep && this._equip?.length && this.alive ? equipTextures(this.P, this.ctx.assets) : null;
    if (eqTex) (this._equipBar || (this._equipBar = new EquipBar(this.P, this.hud))).update(this.screen.x, this.screen.y, hudUnit(this.ctx.viewport?.()), this._equip, eqTex);
    else if (this._equipBar) this._equipBar.hide();
    for (let i = 0; i < this.itemPips.length; i++) {
      const pip = this.itemPips[i];
      const ps = clamp(s * 0.26, 12, 30);
      pip.width = pip.height = ps;
      pip.position.set(this.screen.x - s * 0.36 + i * (ps + 1), this.screen.y - s * 0.05);
      pip.visible = this.alive && !eqTex; // local patch: the equip bar instead
    }
  }

  /** True while the shown gauge is in its 爆发冷却 (b.snap `elem` carries the cooldown's end and length). */
  elementCooling() {
    return !!this.el && this.elDur > 0 && this.elUntil > 0;
  }

  /**
   * The share of the element bar drawn (0..1): the remaining 元素值 (1 − fill), or during a 爆发冷却 the part of the
   * cooldown already run (the bar refills to full, PRTS 元素 "元素条显示缓慢恢复至上限"). 0 without a gauge.
   */
  elementLeft() {
    if (!this.el) return 0;
    if (this.elementCooling()) return clamp(1 - (this.elUntil - this.gameT) / this.elDur, 0, 1);
    return clamp(1 - this.elFill, 0, 1);
  }

  /**
   * Element gauge row (see header) under the bars spanning x0 … x0 + bw, its top at `top`: the element's disc at the
   * left (operators with its glyph; enemies plain, × EL_BAR.enemy) and, beside it to the bars' right end, a bar of
   * `elementLeft()` on a dark track `h` px tall — white for the 元素值 left; in the element's colour, the disc pulsing
   * (clock `t`), while it refills over a 爆发冷却. Built on the first gauge, hidden while there is none.
   */
  _updateElementBar(show, x0, bw, top, h, s, t = 0) {
    let r = this._elBar;
    if (!show) { if (r) r.root.visible = false; return; }
    const tex = hudRings();
    if (!r) {
      const P = this.P;
      const root = new P.Container();
      const bg = bar(P, root, COLORS.hpBack, 0.85);
      const fill = bar(P, root, 0xffffff);
      const disc = new P.Sprite(tex.disc.burn);
      disc.anchor.set(0.5);
      root.addChild(disc);
      r = this._elBar = { root, disc, bg, fill };
      this.hud.addChild(root);
    }
    const d = clamp(s * EL_BAR.icon, EL_BAR.min, EL_BAR.max) * (this.isEnemy ? EL_BAR.enemy : 1);
    const cy = top + EL_BAR.gap + d / 2;
    r.disc.texture = (this.isEnemy ? tex.discEnemy : tex.disc)[this.el] || tex.disc.burn;
    r.disc.width = r.disc.height = d / HUD_DISC;   // the disc fills HUD_DISC of its atlas cell
    r.disc.position.set(x0 + d / 2, cy);
    const bx = x0 + d + 2, w = Math.max(4, x0 + bw - bx);
    r.bg.position.set(bx - 1, cy); r.bg.width = w + 2; r.bg.height = h + 2;
    const k = this.elementLeft();
    r.fill.visible = k > 0;
    r.fill.position.set(bx, cy); r.fill.width = w * k; r.fill.height = h;
    if (this.elementCooling()) {
      r.fill.tint = (ELEMENT_RING[this.el] || ELEMENT_RING.burn).tint;
      r.disc.alpha = EL_BAR.pulse + (1 - EL_BAR.pulse) * (0.5 + 0.5 * Math.cos(t * Math.PI * 2 * EL_BAR.pulseHz));
    } else {
      r.fill.tint = 0xffffff;
      r.disc.alpha = 1;
    }
    r.root.visible = true;
  }

  /**
   * Redeploy ring above a knocked-down operator (see header), centred on (cx, cy): a mint arc filling as its respawn
   * timer runs with the seconds left; a full pulsing amber ring with "DP" / red ring with "!" once it only waits.
   */
  _updateDownRing(show, cx, cy, s, t) {
    let r = this._downRing;
    if (!show) { if (r) r.root.visible = false; return; }
    const tex = hudRings();
    if (!r) {
      const P = this.P;
      const root = new P.Container();
      const mk = (tx) => { const sp = new P.Sprite(tx); sp.anchor.set(0.5); root.addChild(sp); return sp; };
      const disc = mk(tex.downDisc), track = mk(tex.track), arc = mk(tex.arcs[0]);
      const text = mk(P.Texture.EMPTY);
      r = this._downRing = { root, disc, track, arc, text, label: null, res: 0 };
      this.hud.addChild(root);
    }
    const dn = this.down;
    const counting = dn.state === DOWN_STATE.COUNTING;
    const left = Math.max(0, dn.until - this.gameT);
    r.arc.texture = ringArc(counting ? (dn.total > 0 ? clamp(1 - left / dn.total, 0, 1) : 1) : 1);
    const color = DOWN_LOOK.ring[dn.state] ?? DOWN_LOOK.ring[DOWN_STATE.COUNTING];
    r.arc.tint = color;
    const label = counting ? String(Math.ceil(left - 1e-6)) : dn.state === DOWN_STATE.WAIT_DP ? 'DP' : '!';
    const res = this.ctx.renderer?.resolution || 1;
    if (r.label !== label || r.res !== res) {
      r.label = label;
      r.res = res;
      r.text.texture = downLabel(label, counting ? '#ffffff' : '#' + color.toString(16).padStart(6, '0'), res);
    }
    const d = clamp(s * DOWN_LOOK.size, 22, 52);
    const k = d / tex.size;
    r.disc.scale.set(k); r.track.scale.set(k); r.arc.scale.set(k);
    r.text.scale.set((d * (label.length > 2 ? 0.34 : 0.44)) / 32);
    r.root.position.set(cx, cy);
    r.root.alpha = counting ? 1 : 0.72 + 0.28 * Math.sin(t * 5);
    r.root.visible = true;
  }

  // ---- impostor mode (crowded fields, clipped skeletons): the skeleton is rendered into a slot of the shared
  // impostor atlas (render/impostor.js) every `interval` frames (staggered per unit; every frame for clipped
  // skeletons, whose stencil masks must stay out of the main pass) and shown as one sprite. Without a free atlas
  // slot the unit keeps a private RenderTexture (same visuals, one extra framebuffer switch).

  _impBox() {
    // the box holds every pose seen so far: each clip's local bounds are watched through its first play and a pose
    // reaching past the box grows it (maintainer report 2026-10-12: the box was the first pose's only, so 안젤리나 더 멜로우
    // 위시's S2 staff and take-off were cut off at its edge — a straight cut that read as a raised tile drawn over her; any
    // skill pose reaching farther than the idle one was cut the same way). The falling-in Start is not watched (its
    // height is the deploy room of _renderImpostor)
    const a = this.actor, clip = a.current || '';
    const seen = this._boxClips || (this._boxClips = new Map());
    let until = seen.get(clip);
    if (until === undefined) { until = clip ? a.clock + Math.min(6, a.dur(clip) || 0) : -Infinity; seen.set(clip, until); }
    if (this._box && (a.mode === 'deploy' || !(a.clock <= until))) return this._box;
    let b;
    try { b = a.spine.getLocalBounds(); } catch { b = null; }
    const ok = b && Number.isFinite(b.width) && b.width > 10 && b.height > 10;
    const e = this._boxExt;
    if (this._box && (!ok || (e && b.x >= e.x0 && b.y >= e.y0 && b.x + b.width <= e.x1 && b.y + b.height <= e.y1))) return this._box;
    let x0 = -220, y0 = -420, x1 = 220, y1 = 40;
    if (ok) {
      const u = this._boxExt = e ? { x0: Math.min(e.x0, b.x), y0: Math.min(e.y0, b.y), x1: Math.max(e.x1, b.x + b.width), y1: Math.max(e.y1, b.y + b.height) }
        : { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height };
      const w = u.x1 - u.x0, h = u.y1 - u.y0;
      const padX = Math.max(60, w * 0.3), padY = Math.max(50, h * 0.22);
      x0 = Math.min(u.x0 - padX, -140); x1 = Math.max(u.x1 + padX, 140);
      y0 = Math.min(u.y0 - padY, -260); y1 = Math.max(u.y1 + padY * 0.4, 30);
    }
    this._box = { x0, y0, w: x1 - x0, h: y1 - y0 };
    return this._box;
  }

  _updateImpostor(sc, flip, tint, animDt, interval, held = false) {
    const P = this.P;
    const atlas = this.ctx.impostors || null;
    if (!this.imp) {
      const sprite = new P.Sprite(P.Texture.EMPTY);
      if (this.actor.spine.parent) this.actor.spine.parent.removeChild(this.actor.spine);
      if (atlas) atlas.park(this.actor.spine);
      this.body.addChild(sprite);
      this.imp = { sprite, slot: null, rt: null, sc: 0, acc: 0, phase: (Math.random() * 64) | 0, dirty: true, last: 0 };
    }
    const imp = this.imp;
    imp.acc += animDt;
    const frame = this.ctx.frameNo ? this.ctx.frameNo() : 0;
    // the view's slot in this frame's update order (app.js impostorSlot) spreads the refreshes evenly over the interval;
    // a context without slots keeps the random phase. A unit whose slot keeps moving with the frame (the units before it
    // culled on and off in step) is still refreshed after 2 intervals at the latest.
    const turn = this.ctx.impostorSlot ? this.ctx.impostorSlot() : imp.phase;
    const rescale = Math.abs(sc - imp.sc) > imp.sc * 0.12;
    // a held pose (SpineActor.poseHeld) keeps the image its slot already shows; only its clock moves on. It is still
    // redrawn every HELD_REDRAW_FRAMES: a slot's pixels live in a render texture, which a lost and restored WebGL context
    // (a phone short of memory, a tab switch) gives back blank, and nothing else would draw the lying model again
    const still = held && !imp.dirty && !rescale && frame - imp.last < HELD_REDRAW_FRAMES;
    if (still) { this.actor.clock += imp.acc; imp.acc = 0; }
    const due = !still && (imp.dirty || interval <= 1 || (frame + turn) % interval === 0 || frame - imp.last >= 2 * interval || rescale);
    if (due) {
      this.actor.update(imp.acc);
      imp.acc = 0;
      imp.dirty = false;
      imp.last = frame;
      this._renderImpostor(sc, atlas);
    }
    const k = imp.sc > 0 ? sc / imp.sc : 1;
    imp.sprite.scale.set(k * flip, k);
    imp.sprite.alpha = this.swapT;
    imp.sprite.tint = tint;
  }

  _renderImpostor(sc, atlas) {
    const P = this.P, R = this.ctx.renderer, imp = this.imp;
    const yK = this.modelKY; // the vertical stretch is baked into the impostor (the flip is the sprite's)
    let box = this._impBox();
    // local patch: a clipped model stays an impostor while it falls in — room for its Start clip's height above (≤ 7 H)
    if (this.actor.mode === 'deploy') box = { x0: box.x0, y0: box.y0 - box.h * 7, w: box.w, h: box.h * 8 };
    const w = Math.max(8, Math.ceil(box.w * sc)), h = Math.max(8, Math.ceil(box.h * sc * yK));
    const sp = this.actor.spine;
    sp.alpha = 1;
    if (this._tint !== 0xffffff) { this._tint = 0xffffff; sp.tint = 0xffffff; }
    const ox = -box.x0 * sc, oy = -box.y0 * sc * yK;
    if (atlas) {
      let slot = imp.slot;
      const clip = !!(this.actor.clipped && this.actor.clipOn);
      if (!slot || w > slot.w || h > slot.h || w < slot.w * 0.6 || h < slot.h * 0.6 || slot.clip !== clip) {
        if (slot) atlas.free(slot);
        slot = imp.slot = atlas.alloc(w, h, { clip });
        if (slot && imp.rt) { imp.rt.destroy(true); imp.rt = null; }
      }
      if (slot) {
        atlas.draw(slot, sp, { a: sc, d: sc * yK, tx: ox, ty: oy });
        if (imp.sprite.texture !== slot.tex) imp.sprite.texture = slot.tex;
        imp.sprite.anchor.set(ox / slot.w, oy / slot.h);
        imp.sc = sc;
        return;
      }
    }
    // private render target (no atlas / atlas full)
    let rt = imp.rt;
    if (!rt || w > rt.width || h > rt.height || w < rt.width * 0.6 || h < rt.height * 0.6) {
      if (rt) rt.destroy(true);
      rt = imp.rt = P.RenderTexture.create({ width: Math.ceil(w / 8) * 8, height: Math.ceil(h / 8) * 8, resolution: R.resolution });
      imp.sprite.texture = rt;
    }
    const parent = sp.parent;
    sp.position.set(0, 0);
    sp.scale.set(1, 1);
    sp.visible = true;
    const m = this._m || (this._m = new P.Matrix());
    m.set(sc, 0, 0, sc * yK, ox, oy);
    try { R.render(sp, { renderTexture: rt, clear: true, transform: m }); } catch { /* lost context etc. */ }
    if (parent === atlas?.parked) sp.visible = false;
    imp.sprite.anchor.set(ox / rt.width, oy / rt.height);
    imp.sc = sc;
  }

  _leaveImpostor() {
    const imp = this.imp;
    this.imp = null;
    if (!imp) return;
    const atlas = this.ctx.impostors || null;
    if (imp.slot && atlas) atlas.free(imp.slot);
    imp.sprite.destroy();
    if (imp.rt) imp.rt.destroy(true);
    if (this.actor && this.actor.spine) {
      if (atlas) atlas.unpark(this.actor.spine);
      this.actor.spine.visible = true;
      this.actor.spine.position.set(0, 0);
      this.body.addChild(this.actor.spine);
    }
  }

  _iconKeys() {
    const out = ICON_TMP;
    out.length = 0;
    const f = this.flags;
    const push = (k) => { if (k && !out.includes(k) && out.length < 4) out.push(k); };
    // local patch (LOCAL-PATCH.md 「전투 화면 UI」 ⑤): a status shown by its official effect (fxstatus.js) has no icon
    const fx = this._fxStatusOn && this._fxStatusOn.size ? this._fxStatusOn : null;
    if (f & UF.FROZEN) { if (!fx?.has('freeze')) push('freeze'); }
    else if (f & UF.STUNNED && !fx?.has('stun')) push('stun');
    if (f & UF.SLEEP && !fx?.has('sleep')) push('sleep');
    if (f & UF.COLD && !(f & UF.FROZEN) && !fx?.has('cold')) push('cold');
    // local patch (maintainer report 2026-10-07, official capture: 望's stones carry no badge; then "소환물 위에 붙어 있는 노란 방패
    // 모양 아이콘을 제거해줘"): no shield icon over a summon — a trap's standing invulnerability (shared/trap-tokens.js) is no
    // status, and the view cannot tell a skill's short one from it (only the UF.INVULN flag) [추정: summons show none]
    if (f & UF.INVULN && !this.isToken && !noHpBar(this.info?.defId)) push('invuln');
    if (f & UF.STEALTH && !(fx && (fx.has('camou') || fx.has('stealth') || fx.has('stealthAlly')))) push(f & UF_CAMOU ? 'camou' : 'stealth'); // local patch: 迷彩 (위장) has its own icon
    for (const k of this.statuses) {
      if (out.length >= 4) break;
      if (k === 'skill') continue;
      // a burst's lock ('burnBurst', 'neuralBurst' … — the 爆发冷却) is shown by the element gauge row under the bars
      // (b.snap `elem`); only a feed without gauges (an older recording) shows it as a status
      if (this.el && k.endsWith('Burst')) continue;
      if (statusIconSuppressed(k, this.statuses)) continue; // 折射 while silenced
      if (fx && iconShownAsFx(this, k)) continue; // local patch: drawn as its official effect
      const icon = statusIconKey(k);
      // flag-driven states are authoritative (a stale 'stun' status must not outlive the flag)
      if (!icon || icon === 'stun' || icon === 'freeze' || icon === 'sleep' || icon === 'stealth' || icon === 'invuln') continue;
      if (icon === 'camou') continue; // local patch: flag-driven too (UF_CAMOU)
      if (icon === 'cold' && (f & UF.FROZEN)) continue;
      push(icon);
    }
    return out;
  }

  /** Canvas-space bounds (CSS px) of the body: 0.7 tile wide, from its head (UNIT.headroom; enemies: their model) down
   * to just below the feet — tooltips and overlays (view.pieceScreenRect), not picking (render/pick.js is by tile). */
  bounds() {
    const s = this.screen.s || 1;
    const h = (this._headTiles || UNIT.headroom) * s;
    const w = s * 0.7;
    return { x: this.screen.x - w / 2, y: this.screen.y - h, width: w, height: h + s * 0.1 };
  }

  setHover(on) { this.hovered = !!on; }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this._dropActor();
    this.shadow.destroy();
    this.blockIcon.destroy();
    if (this.facingArrow) this.facingArrow.destroy();
    if (this._facing) this._facing.destroy(); // local patch
    this.hud.destroy({ children: true });
    this.root.destroy({ children: true });
  }
}

const SH_P = { x: 0, y: 0, s: 0, depth: 0 };
const FA_P = { x: 0, y: 0, s: 0, depth: 0 };
const FA_C = { x: 0, y: 0, s: 0, depth: 0 };
const LG_P = { x: 0, y: 0, s: 0, depth: 0 };
const ICON_TMP = [];

/**
 * Unit-layer zIndex of a unit / piece whose feet are at (x, y): farther rows first (so raised block rows, keyed by
 * tiles.rowDepthKey, hide units behind them); lifted (dragged) pieces on top; ties broken by column.
 */
export function unitDepthKey(cam, x, y, lift = 0) {
  // +40 (< one row of depth at the official 30° pitch, 100·sin 30° = 50): a lifted piece never ties with the unit one
  // row in front of it (a tie flickers with the column tie-break)
  return -cam.depthOf(x, y, 0) * 100 + (lift > 0 ? 40 : 0) + x * 0.001;
}

function mixTint(a, b, k) {
  const t = clamp(k, 0, 1);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return ((ar + (br - ar) * t) << 16) | ((ag + (bg - ag) * t) << 8) | ((ab + (bb - ab) * t) | 0);
}

/** Attack interval from data (bat × 100 / aspd), game seconds. */
function defaultInterval(ctx, info) {
  try {
    const rec = ctx.lookupDef ? ctx.lookupDef(info) : null;
    const st = rec?.stats;
    if (st && st.bat > 0) return clamp((st.bat * 100) / (st.aspd > 0 ? st.aspd : 100), 0.2, 6);
  } catch { /* ignore */ }
  return 1.2;
}

// =============================================================================================================

/**
 * Hand item: icon plate floating above its slot. While dragged (`lift` > 0) the plate is centred on its ground point —
 * the pointer (render/app.js moveDragVisual); it drops on (and equips the unit on) the tile under the pointer.
 */
export class ItemView {
  constructor(ctx, info) {
    const P = ctx.P;
    this.ctx = ctx; this.P = P;
    this.info = { ...info };
    this.id = info.id; this.uid = info.uid ?? null;
    this.x = info.x || 0; this.y = info.y || 0; this.z = 0;
    this.alive = true; this.remove = false; this.lift = 0; this.dimmed = false;
    this.bob = Math.random() * 6;
    this.screen = { x: 0, y: 0, s: 1, top: 0 };
    this.shadow = new P.Sprite(ctx.shadowTex || shadowTexture());
    this.shadow.anchor.set(0.5);
    ctx.layers.shadow.addChild(this.shadow);
    this.root = new P.Container();
    ctx.layers.units.addChild(this.root);
    this.plate = new P.Sprite(itemTexture(String(info.defId || 'item'), null, info.color || 0x9aa5a0));
    this.plate.anchor.set(0.5, 1);
    this.root.addChild(this.plate);
    this.info.icon = null;
    this.setIcon(info.icon);
    this.hud = null;
  }
  /** Show the item's icon (an URL; the plain plate until it loads) — again when the asset manifest named it late. */
  setIcon(url) {
    if (this.destroyed || !url || url === this.info.icon) return;
    this.info.icon = url;
    const a = this.ctx.assets;
    if (a?.image) a.image(url).then((img) => { if (!this.destroyed && img && this.info.icon === url) this.plate.texture = itemTexture(String(this.info.defId), img, this.info.color || 0x9aa5a0); }, () => {});
  }
  setWorld(x, y, z = 0) { this.x = x; this.y = y; this.z = z; }
  /** A battle snapshot sample (syncBattle syncs every unit of the field): a hand item on a scouted prep board rides
   *  the units as kind 'item' (Match.prepFieldMeta) — follow its position, there is nothing else to animate. */
  sync(s) { this.x = s.x; this.y = s.y; }
  update(dt, cam, t) {
    const lifted = this.lift > 0;
    const p = cam.project(this.x, this.y, lifted ? this.z : this.z + this.lift + 0.12 + Math.sin(t * 2 + this.bob) * 0.03, this.screen);
    this.root.position.set(p.x, p.y);
    this.root.zIndex = unitDepthKey(cam, this.x, this.y, this.lift);
    const size = p.s * 0.62;
    this.plate.scale.set(size / 128);
    this.plate.anchor.set(0.5, lifted ? 0.5 : 1);
    this.root.alpha = this.dimmed ? 0.35 : 1;
    placeOnGround(this.ctx, this.shadow, this.ctx.layers.shadow, this.y, this.z);
    const sh = cam.project(this.x, this.y, this.z, SH_P);
    this.shadow.position.set(sh.x, sh.y);
    this.shadow.scale.set((p.s * 0.55) / this.shadow.texture.width);
    this.shadow.alpha = 0.35;
    this.screen.top = lifted ? p.y - size / 2 : p.y - size;
  }
  /** Canvas-space bounds (CSS px) of the plate (centred on the pointer while dragged). */
  bounds() {
    const w = (this.screen.s || 1) * 0.62;
    return { x: this.screen.x - w / 2, y: this.lift > 0 ? this.screen.y - w / 2 : this.screen.y - w, width: w, height: w };
  }
  setHover() {}
  destroy() { if (this.destroyed) return; this.destroyed = true; this.shadow.destroy(); this.root.destroy({ children: true }); }
}

// =============================================================================================================

/**
 * Battle device unit (kind 'device': crates, “双眼皮” turrets, unknown stage devices): a textured 3D box (the tile
 * atlas, render/tiles.js BoxMesh — the real crate / device plates when the board art is installed), a turret head
 * that turns to its target and flashes on attack, HP bar once damaged, and a break-apart on death.
 */
const GENERIC_DEVICE = Object.freeze({ size: 0.7, height: 0.36, top: 'platformTop', side: 'forbidSide' });
export class DeviceView {
  constructor(ctx, info) {
    const P = ctx.P;
    this.ctx = ctx; this.P = P;
    this.info = { ...info };
    this.id = info.id; this.uid = null;
    this.isEnemy = false;
    this.spec = deviceBoxOf(info.defId) || GENERIC_DEVICE;
    this.turret = this.spec === DEVICE_BOX.turret;
    this.x = Number(info.x) || 0; this.y = Number(info.y) || 0; this.z = 0;
    this.hp = Number(info.maxHp) || 100; this.maxHp = this.hp;
    this.alive = true; this.remove = false; this.dying = 0; this.flags = 0;
    this.facing = info.facing === -1 ? -1 : 1;
    this.aim = this.facing > 0 ? 0 : Math.PI; this.aimTo = this.aim; this.fire = 0;
    this.screen = { x: 0, y: 0, s: 1, top: 0 };
    this._headTiles = this.spec.height + 0.2;
    this.box = ctx.createBox ? ctx.createBox() : null;
    this.gfx = new P.Graphics();       // fallback body (no tile field) and the turret head
    ctx.layers.units.addChild(this.gfx);
    this.hud = new P.Container();
    ctx.layers.bars.addChild(this.hud);
    this.hpBg = bar(P, this.hud, COLORS.hpBack, 0.85);
    this.hpFill = bar(P, this.hud, this.turret ? COLORS.hpAlly : 0xe0b877);
    this.camVersion = -1;
  }
  sync(s) {
    if (!s) return;
    this.x = s.x; this.y = s.y; this.z = groundZ(this.ctx, s.x, s.y);
    if (s.maxHp > 0) this.maxHp = s.maxHp;
    this.hp = clamp(s.hp, 0, this.maxHp); this.flags = s.flags | 0;
  }
  setWorld(x, y, z = 0) { this.x = x; this.y = y; this.z = z; }
  onAttack(target) {
    if (!this.alive) return;
    if (target) this.aimTo = Math.atan2(target.y - this.y, target.x - this.x);
    this.fire = 1;
  }
  windUp() { return false; }
  onHit() { this.shake = 0.2; }
  onDeploy() {}
  onStatus() {}
  setSkill() {}
  setFacing() {}
  die() { if (!this.alive) return; this.alive = false; this.dying = 0.45; this.ctx.fx?.crateBreak?.(this.x, this.y, this.z, this.turret ? 0x6c777d : null); }
  revive() { this.alive = true; this.dying = 0; this.remove = false; }
  update(dt, cam, t) {
    const shake = this.shake > 0 ? Math.sin(t * 80) * this.shake * 0.05 : 0;
    this.shake = Math.max(0, (this.shake || 0) - dt);
    const k = this.dying > 0 ? Math.max(0, this.dying / 0.45) : 1;
    if (this.dying > 0) { this.dying -= dt; if (this.dying <= 0) this.remove = true; }
    const zKey = rowDepthKey(cam, Math.round(this.y)) + ROW_KEY.devices;
    const size = this.spec.size * (0.6 + 0.4 * k), height = this.spec.height * k;
    const g = this.gfx;
    if (this.box) {
      this.box.update(cam, { x: this.x + shake, y: this.y, z: this.z, size, height, top: this.spec.top, side: this.spec.side, alpha: k });
      if (this.box.mesh) {
        if (!this.box.mesh.parent) this.ctx.layers.units.addChild(this.box.mesh);
        this.box.mesh.zIndex = zKey;
      }
    }
    const redraw = !this.box || this.turret || cam.version !== this.camVersion || shake || this.dying > 0 || this._lastShake;
    if (redraw) {
      this.camVersion = cam.version;
      this._lastShake = !!shake;
      g.clear();
      if (!this.box) drawCrate(g, cam, this.x + shake, this.y, this.z, size, height, 1);
      if (this.turret && height > 0.05) this._drawHead(g, cam, dt, height, k);
    }
    g.zIndex = zKey + 0.001;
    g.alpha = k;
    const p = cam.project(this.x, this.y, this.z + this.spec.height + 0.35, this.screen);
    const show = this.alive && this.hp < this.maxHp - 0.5;
    this.hud.visible = show;
    if (show) {
      const bw = clamp(p.s * 0.7, 24, 90), bh = clamp(p.s * 0.06, 3, 6);
      this.hpBg.position.set(p.x - bw / 2 - 1, p.y); this.hpBg.width = bw + 2; this.hpBg.height = bh + 2;
      this.hpFill.position.set(p.x - bw / 2, p.y); this.hpFill.width = bw * clamp(this.hp / this.maxHp, 0, 1); this.hpFill.height = bh;
    }
    this.screen.top = p.y;
  }
  /** Turret head: a squat dome with a barrel aimed at the last target; muzzle flash on attack. */
  _drawHead(g, cam, dt, height, k) {
    let d = this.aimTo - this.aim;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.aim += d * Math.min(1, dt * 10);
    this.fire = Math.max(0, this.fire - dt * 5);
    const z = this.z + height;
    const c = cam.project(this.x, this.y, z + 0.08);
    const s = c.s;
    const ex = Math.cos(this.aim), ey = Math.sin(this.aim);
    const recoil = this.fire * 0.06;
    const tip = cam.project(this.x + ex * (0.42 - recoil), this.y + ey * (0.42 - recoil), z + 0.12);
    g.lineStyle(0);
    g.beginFill(0x1c2124, 0.95 * k); g.drawEllipse(c.x, c.y, s * 0.2, s * 0.13); g.endFill();
    g.lineStyle(Math.max(2, s * 0.07), 0x39444a, k);
    g.moveTo(c.x, c.y - s * 0.05); g.lineTo(tip.x, tip.y - s * 0.03);
    g.lineStyle(Math.max(1, s * 0.03), 0x9aa7ad, k);
    g.moveTo(c.x, c.y - s * 0.06); g.lineTo(tip.x, tip.y - s * 0.04);
    g.lineStyle(0);
    g.beginFill(0x4b565c, k); g.drawEllipse(c.x, c.y - s * 0.07, s * 0.14, s * 0.09); g.endFill();
    g.beginFill(this.fire > 0 ? 0xffd27a : 0xff5a4a, (0.6 + 0.4 * this.fire) * k); g.drawCircle(c.x, c.y - s * 0.09, s * 0.035); g.endFill();
    if (this.fire > 0.2) { g.beginFill(0xfff0c0, this.fire * 0.8 * k); g.drawCircle(tip.x, tip.y - s * 0.03, s * 0.08 * this.fire); g.endFill(); }
  }
  bounds() { const s = this.screen.s; return { x: this.screen.x - s * 0.45, y: this.screen.y, width: s * 0.9, height: s }; }
  hitTest(x, y) { const b = this.bounds(); return this.alive && x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height; }
  setHover() {}
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.box) this.box.destroy();
    this.gfx.destroy();
    this.hud.destroy({ children: true });
  }
}
