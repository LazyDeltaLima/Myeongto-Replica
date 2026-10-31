// render/hud-bars.js — local patch (docs/LOCAL-PATCH.md 「전투 화면 UI」): the official battle HUD of units (bars, prep chip).
//
// The client's unit HUD (EN client arts/ui/[uc]battlecommon.ab, battle/[pack]common.ab `hud_unit`) is a screen-space
// canvas: its size does not follow the camera or the unit's depth — in the CN capture (2000×1125) the bars of both
// operator rows are 128–129 px wide for the prefab's 125 (≈ 2000 / 1920 px per unit), though the rows' tiles are 168
// and 177 px apart. One unit here = min(width / 1920, height / 1080) CSS px of the view ([추정] the fit for other aspect
// ratios: no CanvasScaler value found). Every size below is in those units, from `hud_unit`'s centre (prefab offsets).
// The client puts that centre on the unit's own point (UIUnitHUD.Attach follows the unit's `_uiMountPoint`, empty in the
// prefabs, so the unit's transform). An operator's, token's or enemy's model stands ≈ 0.16 tile lower on screen (its prefab place,
// fxpoints.js modelPlace), ≈ 26 units with the official camera, so the HP bar's centre (54.5 under hud_unit) is ≈ 28
// units under its shoes — official captures: CN 5 / 6 / 13 27 / 29 / 33.7 units, PC 2026-10-23 (赤刃明霄陈) 29. A unit
// whose model still stands on its point (devices; enemies until 2026-10-24) draws hud_unit HUD_ANCHOR units over it instead: the same
// ≈ 30 units under the shoes, fitted to those captures on 2026-10-07 before the model places were drawn.
//
// Allies (char_hp_slider / char_sp_slider / char_sp_cast_slider / char_bullet_bar / char_slider_background):
//   HP 125×7 #49b2e3 α.7 over its delayed loss (white α.7, `slider_back`), SP 125×7 right under it — charging #caec46
//   α.7, a running skill's remaining duration #ffa800 α.7 — on one black α.5 plate. The plate is `sprite_bg` (9-sliced,
//   borders 4 / 5): a black α .70 core with a 4–5 px feathered shadow, laid out 8.6 × 10.32 units larger than the bars (the
//   prefab's 133.6 × (14 + 10.32) around 125 × 14) — i.e. the core (α .35 with the tint) under the bars and only the soft
//   shadow outside: 「불투명도가 들어간 바 위에 색 바」 (user, capture 14; a hard 1-unit margin read as an outline). Without
//   the sprite (local client art): a plain α .35 rect under the bars. The bullet bar (b.snap `ammo`, server/sim/local-hud.js
//   bulletView — a running ammo skill's bullets left, or a bullet-mode skill's SP such as 琳琅诗怀雅's coins) replaces the SP
//   row: one block per bullet on a #e56d00 α.31 track (`char_bullet_bar`), the blocks laid out by code (UIBulletBar) —
//   [추정] their colour #ffa800 and 2-unit gaps from the captures (7 bullets: 16–17 px blocks 2 px apart; 19 bullets: ~4.5 px
//   blocks, the same gaps — many bullets make thin blocks). From BULLET_NO_GAP (40) bullets the client draws no gaps
//   (UIBulletBar.ShowBulletCount: IGNORE_GAP_COUNT), i.e. one bar of the share left; so does a block under 1 px. No glow when
//   the SP is full (maintainer decision 2026-10-07: none in the captures, the skills fire at once).
// Tier chip: the official shows none in battle (CN captures) and `shop_hud`'s chess_level_icon (autochess_level_N,
//   rect 42, scale 1.25, at (-45.5, +127.75) from the feet) over a piece in prep. That sprite is only 38 px (looked blurry
//   at its 1.25× size, maintainer check 2026-10-07); img_chess_level_N (45 px, the shop card's) is the same design — numeral
//   0.53 × 0.70 of the dark interior in both, CN capture 4: 0.51 × 0.69 — so it is drawn instead, its 39-px interior at
//   the official's 30 × 1.25 = 37.5 units (capture 4: 39 px at 2000 wide = 37.4). Web manifest shopCard/ first, then the
//   local client (ui/battle), then autochess_level_N; none: units.js keeps the drawn chip.
// Equipment bar (prep, maintainer capture 2026-10-07: 「장착된 아이템이 있을 때만, 하나만 장착되면 한 칸만」): `shop_hud`'s equip_bg
//   (74×30, at (13, 29.4) in shop_hud — right of the chip) with equip_0 / equip_1 (23×6 at ±12.8 / 13) — a white pill
//   (equip_normal_icon) per item, [추정] the glowing gold pill (equip_gold_icon, 31×14 drawn at its own size) for a golden
//   item; hidden without items. Sprites: local client ui/battlecommon (tools/local-extract/extract.py); none: item pips.
// Redeploy countdown over a knocked-out operator (the same prefab's battle_state, AutoChessDummyHud._UpdateBattleState):
//   while the card is not available, countdown_bg (countdown_background: the red clock disc, 85 × 0.7 at (0, 105)) with
//   countdown_fill (a white ring, 47) as an Image Filled Radial360 from the top, clockwise, fillAmount = 1 − the card's
//   respawnProgress — the time left drains; no number. Once available, cost_lack (the same disc with the cost glyph) while
//   the card is not readyToSpawn (DP short, or no deploy slot left), else nothing — readyToSpawn has no tile check, so an
//   operator waiting for its taken tile shows none. Sprites as above; none: units.js keeps its drawn ring.
// Enemies (shown once hurt, bosses always — `_alwaysShowHp` is off but on 圣堂剑士):
//   - `enemy_hp_slider`: 105×7 #ea4700 α.7 over the white α.7 loss, the sprite_bg plate 8 × 8.55 larger
//     (enemy_slider_background), 55.3 under hud_unit (CN captures: ≈ 110 px at 2000 wide);
//   - `enemy_boss_hp_slider` (a boss without the giant panel: 铳, 卢西恩, …): 130×9 #ea2727 α.85, 43 under hud_unit, its
//     sprite_bg plate 10 × 8 larger and the boss emblem (sprite_enemy_boss_hud_small 57×65, 7 under the bar's centre) behind
//     the bar; its SP (`enemy_boss_sp_slider` 130×6 #ebc9ff α.7, plate 10 × 7 larger) right under it [추정 place];
//   - the giant boss panel (`EnemyGiantBoss`, battle/[pack]common.ab panel_enemy_boss_info — the 卫戍协议 bosses whose prefab
//     has `_bossHudScale`, maintainer: 「위수협의 모드에서만 넓게」): HP 798×10 × the prefab's x scale (0.35 → 279, CN capture 8 of
//     假想敌：管 ≈ 281 × 9.3 units) #ff2b2b α.8 over the white α.7 loss, a black α.39 plate (800×12) and a white α.39 frame
//     (sprite_enemy_boss_hp_bg, 9-sliced, 816×28: a grey α .76 core edged with dark lines); its SP (default_sp_slider
//     798×8 #cab2d4 α.8, plate 800×12, frame 816×24) 16.3 under the HP bar's centre [캡처 8]; the emblem (sprite_enemy_boss_hud_large) behind its centre ≈ 39 units
//     wide [캡처 8 / 10]; a hit flash (hit_effect: sprite_bar_glow, 9-sliced, 818×31, #ff0000 α.78 — maintainer decision 2026-10-07)
//     fading over HIT_FLASH s [추정]. Its centre on the feet [추정 — the placement is native code; the captures show it at
//     the boss's feet], moved by the prefab's `_bossHudOffset` in tiles [추정 단위] (萨米的意志 / 昆图斯 up 1.4 / 1.02, 管 II
//     right 1.4).
//   Boss SP: the official enemy SP (enemy_database spData INCREASE_WITH_TIME — 管 0/50 +1/s, PRTS 「技力 0/50 自动回复」;
//   阿利斯泰尔 25), b.snap `bsp` (server/sim/local-hud.js); only the bosses with SP show the bar (maintainer decision 2026-10-07).

import { loadPoints } from './fxpoints.js'; // the model's head point (the stored-charge mark)

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Reference canvas of the battle HUD (CSS px per unit = min(w / W, h / H)). */
export const HUD_REF = Object.freeze({ w: 1920, h: 1080 });

/** CSS px per HUD unit for a view `vp` ({ width, height } CSS px); 1 without one. */
export function hudUnit(vp) {
  const w = Number(vp?.width), h = Number(vp?.height);
  if (!(w > 0 && h > 0)) return 1;
  return Math.min(w / HUD_REF.w, h / HUD_REF.h);
}

/** Units from the unit's point up to `hud_unit`'s centre for a model that stands on its point (see header). */
export const HUD_ANCHOR = 24.5;
/** Screen y (px) of `hud_unit`'s centre for the unit's point at `y`, `anchor` units under it, with `u` px per unit. */
export const hudAnchorY = (y, u, anchor = HUD_ANCHOR) => y - anchor * u;

/** Ally bars (see header), in HUD units (y: below hud_unit's centre). */
export const ALLY_BAR = Object.freeze({
  w: 125, h: 7, y: 54.5, grow: Object.freeze([8.6, 10.32]),
  hp: 0x49b2e3, sp: 0xcaec46, cast: 0xffa800, alpha: 0.7, ghost: 0xffffff,
  plateAlpha: 0.5,
  ammoTrack: 0xe56d00, ammoTrackAlpha: 0.31, ammo: 0xffa800, ammoAlpha: 1, ammoGap: 2,
  shield: 0xbcdbdf, shieldAlpha: 1,
});

/**
 * The HP bar with a barrier (屏障 / 护盾), as the client: UIHudCharHpSlider.UpdatePlugin reads the unit's
 * shieldUIController.shieldToShow `s` and sets the slider to (hp + s) / (maxHp + s), the split (UIHpFillImage.splitValue)
 * to s / (hp + s); the fill's material ui_battle_ally_hp_bar (shader Torappu/UI/Hp) draws the part of the fill past
 * uv.x > 1.003 − split in `_Color2` #bcdbdf, opaque (not the fill's #49b2e3 α.7). Allies only: the enemies' HP sliders
 * have no such material or call. Returns `{ hp, ghost, split }` (shares 0..1 of the bar; `split` of the filled part).
 * @param {number} hp @param {number} maxHp @param {number} ghostHp the delayed-loss HP @param {number} shield
 */
export function shieldedBar(hp, maxHp, ghostHp, shield) {
  const s = Number(shield) > 0 ? Number(shield) : 0;
  const tot = Math.max(1e-9, (Number(maxHp) || 0) + s);
  const h = clamp(Number(hp) || 0, 0, Number(maxHp) || 0);
  const k = clamp((h + s) / tot, 0, 1);
  const g = Math.max(k, clamp(((Number(ghostHp) || 0) + s) / tot, 0, 1));
  return { hp: k, ghost: g, split: s > 0 && h + s > 0 ? s / (h + s) : 0 };
}

/**
 * Prep tier chip (`shop_hud` chess_level_icon), in HUD units: centre from hud_unit's centre; the dark interior's size.
 * y: the prefab's 128 lowered with the models (053283a1 drew them 0.864× — 1/320 → 0.0027) to 107.3 (maintainer 2026-10-08
 * 「작아진 크기에 맞춰 레벨칩 높이도 낮춰줘」), then matched to the maintainer's official video crop of 望 (maintainer's notes 2026-10-07
 * user-issues-3/wang-chip-10.png vs our wang-chip-9.png, measured in chip-size units): chip centre above the eyes
 * 53.7 official vs 45.8 ours → +7.7 → 115.
 */
export const PREP_CHIP = Object.freeze({ x: -45.5, y: 115, interior: 37.5 });
/** Prep equipment bar (`shop_hud` equip_bg, root scale 1.25), in HUD units: centre from hud_unit's centre, size, slots. */
export const PREP_EQUIP = Object.freeze({ x: 14.75, y: 129.5, w: 92.5, h: 37.5, slots: Object.freeze([-16, 16.25]), slotW: 28.75, slotH: 7.5, scale: 1.25 });

/**
 * Redeploy countdown over a knocked-out operator (the dummy HUD's battle_state, root scale 1.25), in HUD units: centre
 * above hud_unit's centre (countdown_bg / cost_lack at (0, 105)), the disc (85 × 0.7) and the fill ring in it (47 × 0.7).
 */
export const RESPAWN_HUD = Object.freeze({ y: 105 * 1.25, size: 85 * 0.7 * 1.25, fill: 47 * 0.7 * 1.25 });

/** Enemy bars (see header), in HUD units; y: below hud_unit's centre (normal / boss) or from the feet (giant). */
export const ENEMY_BAR = Object.freeze({ w: 105, h: 7, y: 55.3, hp: 0xea4700, alpha: 0.7, plateAlpha: 0.5, grow: Object.freeze([8, 8.55]) });
export const BOSS_BAR = Object.freeze({
  w: 130, h: 9, y: 43, hp: 0xea2727, alpha: 0.85, plateAlpha: 0.5, grow: Object.freeze([10, 8]),
  emblem: Object.freeze({ name: 'sprite_enemy_boss_hud_small', w: 57, h: 65, dy: 7 }),
  sp: Object.freeze({ h: 6, dy: 7.5, color: 0xebc9ff, alpha: 0.7, grow: Object.freeze([10, 7]) }),
});
export const GIANT_BAR = Object.freeze({
  w: 798, h: 10, y: 0, hp: 0xff2b2b, alpha: 0.8, plateAlpha: 0.39, grow: Object.freeze([2, 2]), hard: true,
  frame: Object.freeze({ name: 'sprite_enemy_boss_hp_bg', grow: Object.freeze([18, 18]), alpha: 0.39, border: Object.freeze([11, 10, 11, 10]) }),
  sp: Object.freeze({ h: 8, dy: 16.3, color: 0xcab2d4, alpha: 0.8, grow: Object.freeze([2, 4]), frameGrow: Object.freeze([18, 16]) }),
  hit: Object.freeze({ name: 'sprite_bar_glow', grow: Object.freeze([20, 21]), tint: 0xff0000, alpha: 0.78, border: Object.freeze([18, 12, 18, 12]) }),
  emblem: Object.freeze({ name: 'sprite_enemy_boss_hud_large', w: 39, h: 39 * 67 / 59, dy: 2 }),
});
/** Seconds a giant boss's hit flash fades over [추정]. */
export const HIT_FLASH = 0.35;
/**
 * The giant boss panel's prefab values (enemy prefab `_bossHudScale.x`, `_bossHudOffset` in tiles), by Spine id / enemy
 * key — every data/enemies.json prefab with the field (EN client battle/enm_pfb_*.ab, 2026-10-07).
 */
export const GIANT_BOSS = Object.freeze({
  enemy_9013_acstmk: Object.freeze({ sx: 0.35, off: Object.freeze([0, 0]) }),     // 假想敌：胄 (and _2: same prefab)
  enemy_9021_acduml: Object.freeze({ sx: 0.35, off: Object.freeze([0, 0]) }),     // 假想敌：管
  enemy_9021_acduml_2: Object.freeze({ sx: 0.35, off: Object.freeze([1.4, 0]) }), // 假想敌：管 (隐秘核心)
  enemy_9032_aclionk: Object.freeze({ sx: 0.35, off: Object.freeze([0, 0]) }),    // 阿利斯泰尔，帝国余晖
  enemy_9033_acdeer: Object.freeze({ sx: 0.35, off: Object.freeze([0, 1.4]) }),   // “萨米的意志”
  enemy_1521_dslily: Object.freeze({ sx: 0.765, off: Object.freeze([0, 1.02]) }), // 盐风主教昆图斯
});
/** The giant boss entry of a unit info (`spine` first: the _2 variants share a prefab), or null. */
export const giantBossOf = (info) => (info && (GIANT_BOSS[info.spine] || GIANT_BOSS[info.defId])) || null;

/** Narrowest bullet block drawn (px): with more bullets than fit, the bullets left share the track as one bar. */
const AMMO_BLOCK_MIN = 1;
/** From this many bullets the client's bullet bar has no gaps (UIBulletBar IGNORE_GAP_COUNT): one bar of the share left. */
export const BULLET_NO_GAP = 40;

function rect(P, parent, color, alpha) {
  const s = new P.Sprite(P.Texture.WHITE);
  s.tint = color;
  s.alpha = alpha;
  s.anchor.set(0, 0.5);
  parent.addChild(s);
  return s;
}

/** Plate sprites: `sprite_bg` (bars) and the giant panel's frame; [left, top, right, bottom] 9-slice borders (texture px). */
const PLATE = Object.freeze({ name: 'sprite_bg', border: Object.freeze([4, 5, 4, 5]), core: 179 / 255 });

/**
 * A plate around a bar box: the 9-sliced sprite `name` (local client ui/battlecommon) drawn with its texture px at `u`
 * (× `sx` across, as the giant panel's scaled canvas) — `grow` units larger than the box — tinted `tint` α `alpha`; a
 * plain rect of the box at `bare` alpha while the sprite is not there (`bare` null: nothing).
 */
class Plate {
  constructor(P, parent, { name, border, tint = 0x000000, alpha, bare = null }) {
    this.P = P; this.name = name; this.bare = bare;
    this.rect = bare != null ? rect(P, parent, tint, bare) : null;
    this.slice = P.NineSlicePlane ? new P.NineSlicePlane(P.Texture.WHITE, ...border) : null;
    if (this.slice) { this.slice.tint = tint; this.slice.alpha = alpha; this.slice.visible = false; parent.addChild(this.slice); }
  }

  /** Around the box centred (cx, cy) px, `wU` × `hU` units (× `sx` across), sprite `grow` [x, y] units larger. */
  update(assets, cx, cy, wU, hU, grow, u, sx = 1) {
    const t = this.slice ? texOf(this.P, localUrl(assets, 'ui/battlecommon', this.name)) : null;
    if (this.slice) this.slice.visible = !!t;
    if (t) {
      const o = this.slice;
      if (o.texture !== t) o.texture = t;
      o.scale.set(u * sx, u);
      o.width = wU + grow[0]; o.height = hU + grow[1];
      o.position.set(cx - (wU + grow[0]) * u * sx / 2, cy - (hU + grow[1]) * u / 2);
    }
    if (this.rect) {
      this.rect.visible = !t;
      if (!t) { this.rect.position.set(cx - wU * u * sx / 2, cy); this.rect.width = wU * u * sx; this.rect.height = hU * u; }
    }
  }
}

/**
 * The HP / SP / ammo bars of one allied unit (operator or summon), drawn into `parent` (the view's HUD container).
 * `update` places them; `hide` hides them; they go with the parent.
 */
export class AllyBars {
  constructor(P, parent) {
    this.P = P;
    this.anchor = HUD_ANCHOR; // hud_unit's centre over the unit's point (units.js: 0 for a model at its prefab place)
    const B = ALLY_BAR;
    this.root = new P.Container();
    parent.addChild(this.root);
    this.plate = new Plate(P, this.root, { ...PLATE, alpha: B.plateAlpha, bare: B.plateAlpha * PLATE.core });
    this.ghost = rect(P, this.root, B.ghost, B.alpha);
    this.hp = rect(P, this.root, B.hp, B.alpha);
    this.shield = rect(P, this.root, B.shield, B.shieldAlpha); // the barrier's end of the HP fill (shieldedBar)
    this.shield.visible = false;
    this.sp = rect(P, this.root, B.sp, B.alpha);
    this.ammoTrack = rect(P, this.root, B.ammoTrack, B.ammoTrackAlpha);
    this.blocks = [];
    this.root.visible = false;
  }

  hide() { this.root.visible = false; }

  /**
   * Draw for feet at (x, y) with `u` px per unit: `hp` / `ghost` (shares 0..1 of the max HP), `sp` (share 0..1 or null: no
   * SP bar), `cast` (the skill runs: the SP bar is its remaining duration), `ammo` ([left, max] or null), `split` (the
   * barrier's share of the HP fill's length, shieldedBar — 0: none); `assets` for the plate sprite. Returns the bottom
   * edge (px) of the bars.
   */
  update(x, y, u, { hp, ghost, sp = null, cast = false, ammo = null, split = 0 }, assets = null) {
    const B = ALLY_BAR;
    this.root.visible = true;
    const w = B.w * u, h = B.h * u, x0 = x - w / 2;
    const hy = hudAnchorY(y, u, this.anchor) + B.y * u;
    const rows = sp == null && !ammo ? 1 : 2;
    this.plate.update(assets, x, hy - h / 2 + (rows * h) / 2, B.w, rows * B.h, B.grow, u);
    this.ghost.position.set(x0, hy); this.ghost.width = w * clamp(ghost, 0, 1); this.ghost.height = h;
    this.hp.position.set(x0, hy); this.hp.width = w * clamp(hp, 0, 1); this.hp.height = h;
    const sw = this.hp.width * clamp(split, 0, 1);
    this.shield.visible = sw > 0;
    if (sw > 0) { this.shield.position.set(x0 + this.hp.width - sw, hy); this.shield.width = sw; this.shield.height = h; }
    const sy = hy + h;
    const showAmmo = !!ammo && ammo[1] > 0;
    this.sp.visible = sp != null && !showAmmo;
    if (this.sp.visible) {
      this.sp.tint = cast ? B.cast : B.sp;
      this.sp.position.set(x0, sy); this.sp.width = w * clamp(sp, 0, 1); this.sp.height = h;
    }
    drawBullets(this, showAmmo ? ammo : null, x0, sy, w, h, u);
    this.box = { x0, w, top: hy - h / 2 };
    return hy - h / 2 + rows * h;
  }
}

/**
 * Bullet blocks (see header) on `o.ammoTrack` / `o.blocks` (made on use in `o.root`): `ammo` [left, max] or null (hidden),
 * the row's left `x0`, centre `y`, size `w` × `h` px.
 */
function drawBullets(o, ammo, x0, y, w, h, u) {
  const B = ALLY_BAR;
  o.ammoTrack.visible = !!ammo;
  let used = 0;
  if (ammo) {
    o.ammoTrack.position.set(x0, y); o.ammoTrack.width = w; o.ammoTrack.height = h;
    const max = Math.round(ammo[1]), left = clamp(Math.round(ammo[0]), 0, max);
    const gap = B.ammoGap * u, bw = (w - gap * (max - 1)) / max;
    const block = (i) => { let b = o.blocks[i]; if (!b) b = o.blocks[i] = rect(o.P, o.root, B.ammo, B.ammoAlpha); b.visible = true; return b; };
    if (bw >= AMMO_BLOCK_MIN && max < BULLET_NO_GAP) {
      for (let i = 0; i < left; i++) { const b = block(i); b.position.set(x0 + i * (bw + gap), y); b.width = bw; b.height = h; }
      used = left;
    } else if (left > 0) {
      const b = block(0); b.position.set(x0, y); b.width = (w * left) / max; b.height = h;
      used = 1;
    }
  }
  for (let i = used; i < o.blocks.length; i++) o.blocks[i].visible = false;
}

/**
 * The HP bar of an enemy (see header): `kind` 'normal' | 'boss' | 'giant' (`giant` = its GIANT_BOSS entry). `hit()`
 * flashes a giant's bar; textures of the emblem / frame / glow come from `assets` once loaded (none: plain bars).
 */
export class EnemyBars {
  constructor(P, parent, kind, giant = null) {
    this.P = P; this.kind = kind; this.giant = giant;
    this.anchor = HUD_ANCHOR;
    const B = this.B = kind === 'giant' ? GIANT_BAR : kind === 'boss' ? BOSS_BAR : ENEMY_BAR;
    this.root = new P.Container();
    parent.addChild(this.root);
    this.emblem = B.emblem ? new P.Sprite(P.Texture.EMPTY) : null;
    if (this.emblem) { this.emblem.anchor.set(0.5); this.emblem.visible = false; this.root.addChild(this.emblem); }
    this.hitGlow = B.hit ? slice(P, this.root, B.hit.border) : null;
    if (this.hitGlow) { this.hitGlow.tint = B.hit.tint; this.hitGlow.visible = false; }
    // a row: its plate(s) and fills — the giant panel's hard black plate under a white frame, the others' sprite_bg plate
    const row = (color, alpha, sp) => {
      const r = {};
      if (B.frame) r.frame = new Plate(P, this.root, { name: B.frame.name, border: B.frame.border, tint: 0xffffff, alpha: B.frame.alpha });
      r.plate = B.hard ? new Plate(P, this.root, { name: null, border: [0, 0, 0, 0], alpha: B.plateAlpha, bare: B.plateAlpha })
        : new Plate(P, this.root, { ...PLATE, alpha: B.plateAlpha, bare: B.plateAlpha * PLATE.core });
      if (!sp) r.ghost = rect(P, this.root, 0xffffff, 0.7);
      r.fill = rect(P, this.root, color, alpha);
      return r;
    };
    this.hpRow = row(B.hp, B.alpha, false);
    this.hp = this.hpRow.fill; this.ghost = this.hpRow.ghost;
    this.spRow = null;
    this.ammoTrack = null; this.blocks = [];
    this.flash = 0;
    this.root.visible = false;
  }

  hide() { this.root.visible = false; }

  /** A hit: a giant's bar flashes (HIT_FLASH). */
  hit() { if (this.hitGlow) this.flash = HIT_FLASH; }

  /**
   * Draw for feet at (x, y), `u` px per unit, `s` px per tile (the giant's tile offset), `dt` s; `hp` / `ghost` shares of
   * the max HP, `sp` a boss's SP share (null: none), `ammo` [left, max] (圣堂剑士); `assets` for the sprites.
   */
  update(x, y, u, s, dt, { hp, ghost, sp = null, ammo = null }, assets) {
    const B = this.B;
    this.root.visible = true;
    const sx = this.giant ? this.giant.sx : 1;
    const w = B.w * sx * u, h = B.h * u;
    let cx = x, cy;
    if (this.giant) { cx += this.giant.off[0] * s; cy = y - this.giant.off[1] * s + B.y * u; }
    else cy = hudAnchorY(y, u, this.anchor) + B.y * u;
    const x0 = cx - w / 2;
    const tex = (n) => texOf(this.P, localUrl(assets, 'ui/battlecommon', n));
    if (this.emblem) {
      const t = tex(B.emblem.name);
      this.emblem.visible = !!t;
      if (t) { this.emblem.texture = t; this.emblem.position.set(cx, cy + B.emblem.dy * u); this.emblem.width = B.emblem.w * u; this.emblem.height = B.emblem.h * u; }
    }
    if (this.hitGlow) {
      this.flash = Math.max(0, this.flash - dt);
      const t = this.flash > 0 ? tex(B.hit.name) : null;
      this.hitGlow.visible = !!t;
      if (t) {
        const g = B.hit.grow;
        this.hitGlow.texture = t; this.hitGlow.alpha = B.hit.alpha * (this.flash / HIT_FLASH);
        this.hitGlow.scale.set(u * sx, u); this.hitGlow.width = B.w + g[0]; this.hitGlow.height = B.h + g[1];
        this.hitGlow.position.set(cx - (B.w + g[0]) * u * sx / 2, cy - (B.h + g[1]) * u / 2);
      }
    }
    const r = this.hpRow;
    if (r.frame) r.frame.update(assets, cx, cy, B.w, B.h, B.frame.grow, u, sx);
    r.plate.update(assets, cx, cy, B.w + (B.hard ? B.grow[0] : 0), B.h + (B.hard ? B.grow[1] : 0), B.hard ? [0, 0] : B.grow, u, sx);
    r.ghost.position.set(x0, cy); r.ghost.width = w * clamp(ghost, 0, 1); r.ghost.height = h;
    r.fill.position.set(x0, cy); r.fill.width = w * clamp(hp, 0, 1); r.fill.height = h;
    let bottom = cy + h / 2;
    // a boss's SP row (BOSS_BAR / GIANT_BAR sp) under the HP bar
    const S = B.sp;
    if (S && sp != null) {
      if (!this.spRow) {
        const P = this.P, row = {};
        if (B.frame) row.frame = new Plate(P, this.root, { name: B.frame.name, border: B.frame.border, tint: 0xffffff, alpha: B.frame.alpha });
        row.plate = B.hard ? new Plate(P, this.root, { name: null, border: [0, 0, 0, 0], alpha: B.plateAlpha, bare: B.plateAlpha })
          : new Plate(P, this.root, { ...PLATE, alpha: S.alpha, bare: S.alpha * PLATE.core });
        row.fill = rect(P, this.root, S.color, S.alpha);
        this.spRow = row;
      }
      const q = this.spRow, sy = cy + S.dy * u;
      if (q.frame) q.frame.update(assets, cx, sy, B.w, S.h, S.frameGrow, u, sx);
      q.plate.update(assets, cx, sy, B.w + (B.hard ? S.grow[0] : 0), S.h + (B.hard ? S.grow[1] : 0), B.hard ? [0, 0] : S.grow, u, sx);
      q.fill.visible = true; q.fill.position.set(x0, sy); q.fill.width = w * clamp(sp, 0, 1); q.fill.height = S.h * u;
      bottom = sy + S.h * u / 2;
    } else if (this.spRow) {
      for (const o of [this.spRow.frame?.slice, this.spRow.frame?.rect, this.spRow.plate.slice, this.spRow.plate.rect, this.spRow.fill]) if (o) o.visible = false;
    }
    // an enemy's bullets (圣堂剑士, `enemy_bullet_bar` 105×7 [추정] right under the HP bar, the allies' blocks)
    if (ammo && !this.ammoTrack) this.ammoTrack = rect(this.P, this.root, ALLY_BAR.ammoTrack, ALLY_BAR.ammoTrackAlpha);
    if (this.ammoTrack) drawBullets(this, ammo, x0, bottom + h / 2, w, h, u);
    if (ammo) bottom += h;
    this.box = { x0, w, top: cy - h / 2 };
    return bottom;
  }
}

/** A 9-sliced sprite (PIXI NineSlicePlane; a plain Sprite where there is none), anchored at its top-left. */
function slice(P, parent, [l, t, r, b]) {
  const o = P.NineSlicePlane ? new P.NineSlicePlane(P.Texture.WHITE, l, t, r, b) : new P.Sprite(P.Texture.WHITE);
  parent.addChild(o);
  return o;
}

const _tex = new Map();
function texOf(P, url) {
  if (!url) return null;
  let tex = _tex.get(url);
  if (tex === undefined) {
    try { tex = P.Texture.from(url); } catch { tex = null; }
    _tex.set(url, tex);
  }
  return tex && tex.baseTexture && tex.baseTexture.valid ? tex : null;
}
const localUrl = (assets, group, name) => (typeof assets?.localUrl === 'function' ? assets.localUrl(group, name) : null);

/**
 * The official prep tier chip of tier 1..6: `{ tex, k }` — `k` = HUD units per texture px (the interior sized as the
 * official's) — or null while none is installed / loaded (the caller keeps its drawn chip). `assets`: the view's store.
 */
export function prepChip(P, assets, tier) {
  const t = clamp(tier | 0 || 1, 1, 6);
  const sharp = (typeof assets?.ui === 'function' ? assets.ui(`shopCard/img_chess_level_${t}`) : null) || localUrl(assets, 'ui/battle', `img_chess_level_${t}`);
  let tex = texOf(P, sharp);
  if (tex) return { tex, k: PREP_CHIP.interior / 39 };
  tex = texOf(P, localUrl(assets, 'ui/battle', `autochess_level_${t}`));
  return tex ? { tex, k: PREP_CHIP.interior / 30 } : null;
}

/** The prep equipment bar's textures `{ bg, normal, gold }`, or null while they are not installed / loaded. */
export function equipTextures(P, assets) {
  const bg = texOf(P, localUrl(assets, 'ui/battlecommon', 'equip_bg'));
  const normal = texOf(P, localUrl(assets, 'ui/battlecommon', 'equip_normal_icon'));
  const gold = texOf(P, localUrl(assets, 'ui/battlecommon', 'equip_gold_icon'));
  return bg && normal && gold ? { bg, normal, gold } : null;
}

/** The prep equipment bar of one piece (see header), drawn into `parent`. */
export class EquipBar {
  constructor(P, parent) {
    this.anchor = HUD_ANCHOR;
    this.root = new P.Container();
    this.bg = new P.Sprite(P.Texture.EMPTY); this.bg.anchor.set(0.5);
    this.slots = [0, 1].map(() => { const s = new P.Sprite(P.Texture.EMPTY); s.anchor.set(0.5); return s; });
    this.root.addChild(this.bg, ...this.slots);
    this.root.visible = false;
    parent.addChild(this.root);
  }

  hide() { this.root.visible = false; }

  /** Draw for feet at (x, y), `u` px per unit, for `gold` (one boolean per equipped item, at most 2 drawn) with textures `t`. */
  update(x, y, u, gold, t) {
    const E = PREP_EQUIP;
    this.root.visible = true;
    const cx = x + E.x * u, cy = hudAnchorY(y, u, this.anchor) - E.y * u;
    this.bg.texture = t.bg; this.bg.position.set(cx, cy); this.bg.width = E.w * u; this.bg.height = E.h * u;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      s.visible = i < gold.length;
      if (!s.visible) continue;
      s.position.set(cx + E.slots[i] * u, cy);
      if (gold[i]) { s.texture = t.gold; s.width = t.gold.width * E.scale * u; s.height = t.gold.height * E.scale * u; }
      else { s.texture = t.normal; s.width = E.slotW * u; s.height = E.slotH * u; }
    }
  }
}

let _respawnTex = null, _respawnAssets = null; // the textures once all three are loaded, per asset store
/**
 * The redeploy countdown's textures `{ bg, fill, lack }`, or null while they are not installed / loaded or there is no
 * SimpleMesh (the fill is a RadialFill mesh, as the element ring's).
 */
export function respawnTextures(P, assets) {
  if (!P.SimpleMesh) return null;
  if (_respawnTex && _respawnAssets === assets) return _respawnTex;
  const bg = texOf(P, localUrl(assets, 'ui/battlecommon', 'countdown_background'));
  const fill = texOf(P, localUrl(assets, 'ui/battlecommon', 'countdown_fill'));
  const lack = texOf(P, localUrl(assets, 'ui/battlecommon', 'cost_lack'));
  if (!(bg && fill && lack)) return null;
  _respawnAssets = assets;
  return (_respawnTex = { bg, fill, lack });
}

/** The redeploy countdown of one knocked-out operator (see header), drawn into `parent`. */
export class RespawnHud {
  constructor(P, parent) {
    this.anchor = HUD_ANCHOR;
    this.root = new P.Container();
    const mk = () => { const s = new P.Sprite(P.Texture.EMPTY); s.anchor.set(0.5); return s; };
    this.bg = mk();
    this.root.addChild(this.bg);
    // the fill: the ring sprite as a Radial360 fan mesh (RadialFill: batched with the sprites, no stencil mask, its
    // vertices rewritten only when the share moves), sized in HUD units under a scaled container
    this.fillRoot = new P.Container();
    this.root.addChild(this.fillRoot);
    this.fill = new RadialFill(P, this.fillRoot);
    this.lack = mk();
    this.root.addChild(this.lack);
    this.root.visible = false;
    parent.addChild(this.root);
  }

  hide() { this.root.visible = false; }

  /**
   * Draw for feet at (x, y), `u` px per unit, with textures `t`: `amount` = the fill's share (the client sets
   * 1 − Card.respawnProgress, the time left) on countdown_background, or null for cost_lack alone (the timer is done
   * but the card is not readyToSpawn).
   */
  update(x, y, u, amount, t) {
    const R = RESPAWN_HUD;
    this.root.visible = true;
    this.root.position.set(x, hudAnchorY(y, u, this.anchor) - R.y * u);
    const counting = amount != null;
    this.bg.visible = this.fillRoot.visible = counting; this.lack.visible = !counting;
    if (!counting) {
      this.lack.texture = t.lack; this.lack.width = this.lack.height = R.size * u;
      return;
    }
    this.bg.texture = t.bg; this.bg.width = this.bg.height = R.size * u;
    this.fillRoot.scale.set(u);
    this.fill.update(t.fill, R.fill, Number(amount) || 0);
  }
}

// ---- the stored-charge mark --------------------------------------------------------------------------------------------
// An AUTO skill that can be charged more than once (可充能N次: 瑕光 / 塞雷娅 S1 …) shows its stored charges over the unit
// (client UIHudCharSkillMarkPanel.UpdatePlugin: the panel's `_autoSkillMark` on while BasicSkill.availableCnt > 0, its
// `_skillCntLabel` that count — sim local-hud.js chargeMark, b.snap `charge`). arts/ui/[uc]battlecommon.ab
// char_skill_mark_panel `auto_skill_ready`: sprite_circle 36×36 #404040 α .39, its child sprite_auto (the ring of arrows)
// 50×50 #ffd900 turning on its TweenRotate (local z 0 → 360 in 10 s, Ease Linear, loop −1 Restart, _ignoreTimeScale:
// ConstructTweener = DORotate(…, RotateMode.LocalAxisAdd), so one turn every 10 s of real time, counter-clockwise on
// screen), and text_skill_cnt (50×40, size 26, centred 3 up, #ffd900, font Novecentowide-Normal, Shadow black α .5 at
// (1, −1): 1 right, 1 down). The ring starts its turn when the mark appears [추정: the tween's phase]. The number sits as
// Unity lays the line: the font asset (Novecentowide-Normal, size 16: m_Ascent 16.8, m_LineSpacing 19.2) centres a line box
// of 1.2 em in the text rect with the baseline 1.05 em under its top, so the baseline is (1.05 − 0.6) × 26 − 3 = 8.7 units
// under the ring's centre and the digit (cap 0.7 em) about centred; Pixi's own box (glyph-measured ascent, the shadow
// added to its size) would leave it high, so the label is placed by its baseline and advance width. The panel follows the unit's head point
// (`_FollowPosition`: the head transform's UI position + (0, 0.3, 0) — m_defaultSkillMarkLocalPositionOffset); here the
// operator's `head` of fxpoints.js (char_points.py `_headTransform`: 400 skeleton units up for 128 of 130 operators) on the
// drawn model, `headUp` units higher [추정: 0.3 of the UI camera's world taken as 30 canvas units]; a unit without a
// points entry or a drawn model uses the prefab's own place, 154.7 over hud_unit.
export const SKILL_MARK = Object.freeze({ y: 154.7, headUp: 30, disc: 36, discColor: 0x404040, discAlpha: 0.39, ring: 50, color: 0xffd900, text: 26, textY: 3, baseline: (1.05 - 1.2 / 2) * 26 - 3, turn: 10 });
const MARK_FONT = ['Novecento Wide', 'Bender', 'sans-serif'];
/** The ring's angle (radians, Pixi: clockwise positive) `t` seconds after the mark appeared: −360° per SKILL_MARK.turn. */
export const markRingAngle = (t) => -((((t % SKILL_MARK.turn) + SKILL_MARK.turn) % SKILL_MARK.turn) / SKILL_MARK.turn) * Math.PI * 2;
const wallSec = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000;
let markPoints = null;
loadPoints().then((p) => { markPoints = p; });
/** The screen y (px) of a view's head point on its drawn model, or null (no points entry, no model drawn yet). */
export function headPointY(v, points = markPoints) {
  const e = v?.info && points?.[v.info.spine || v.info.defId]?.head;
  const side = e && (v.entryBack ? e.B || e.F : e.F || e.B);
  const at = side?.at;
  if (!Array.isArray(at) || !Number.isFinite(at[1]) || !v.spineReady || !Number.isFinite(v.modelSY) || !v.root) return null;
  return v.root.y + (v.body?.y || 0) - at[1] * Math.abs(v.modelSY);
}

/** The stored-charge mark of one allied unit (see above), drawn into `parent`. */
export class SkillMark {
  constructor(P, parent) {
    this.P = P;
    this.anchor = HUD_ANCHOR;
    this.root = new P.Container();
    this.disc = new P.Sprite(P.Texture.EMPTY); this.disc.anchor.set(0.5);
    this.ring = new P.Sprite(P.Texture.EMPTY); this.ring.anchor.set(0.5);
    // drawn at 2× the official size and scaled down, so the glyphs stay sharp on a high-DPI view (the shadow's 1 unit = 2 px)
    this.label = new P.Text('', {
      fontFamily: MARK_FONT, fontSize: SKILL_MARK.text * 2, fill: SKILL_MARK.color,
      dropShadow: true, dropShadowColor: '#000000', dropShadowAlpha: 0.5, dropShadowDistance: 2 * Math.SQRT2, dropShadowAngle: Math.PI / 4, dropShadowBlur: 0,
    });
    this.label.anchor.set(0.5);
    this.root.addChild(this.disc, this.ring, this.label);
    this.root.visible = false;
    this.n = 0;
    this.t0 = 0;
    this.metric = null;
    parent.addChild(this.root);
    // a number drawn before the font arrived keeps the fallback face: draw (and measure) it again once loaded
    try { globalThis.document?.fonts?.load?.(`${SKILL_MARK.text * 2}px "${MARK_FONT[0]}"`)?.then?.(() => { if (!this.label.destroyed) { this.label.dirty = true; this.metric = null; } }, () => {}); } catch { /* ignore */ }
  }

  /** `{ w, top }` of the label (style px): its advance width, its baseline under the texture's top — as Pixi draws it — or null. */
  _metric() {
    if (this.metric) return this.metric;
    const TM = this.P.TextMetrics, st = this.label.style;
    if (typeof TM?.measureText !== 'function') return null;
    try {
      const m = TM.measureText(this.label.text || ' ', st);
      const pad = (st.padding || 0) + (st.strokeThickness || 0) / 2;
      this.metric = { w: m.lineWidths[0], top: pad + m.fontProperties.ascent, pad };
    } catch { return null; }
    return this.metric;
  }

  /** The number by its baseline (SKILL_MARK.baseline under the ring's centre `cx, cy`) and advance width, `u` px per unit. */
  _placeLabel(cx, cy, u) {
    const M = SKILL_MARK, k = u / 2, m = this._metric();
    if (!m) { this.label.anchor.set(0.5); this.label.position.set(cx, cy - M.textY * u); return; }
    this.label.anchor.set(0, 0);
    this.label.position.set(cx - (m.pad + m.w / 2) * k, cy + M.baseline * u - m.top * k);
  }

  hide() { this.root.visible = false; }

  /**
   * Draw for feet at (x, y), `u` px per unit, `n` stored charges (≤ 0: hidden), over the head of `view` when its model point
   * is known (headPointY); sprites from `assets` (local client); `now` = wall-clock seconds (the ring ignores game speed).
   */
  update(x, y, u, n, assets = null, view = null, now = wallSec()) {
    const M = SKILL_MARK;
    if (!(n > 0)) { this.hide(); return; }
    if (!this.root.visible) this.t0 = now;
    this.root.visible = true;
    const head = headPointY(view);
    const cx = x, cy = head != null ? head - M.headUp * u : hudAnchorY(y, u, this.anchor) - M.y * u;
    const disc = texOf(this.P, localUrl(assets, 'ui/battlecommon', 'sprite_circle'));
    const ring = texOf(this.P, localUrl(assets, 'ui/battlecommon', 'sprite_auto'));
    // without the client's sprites a plain dark disc stands for both (the number alone would float)
    this.disc.texture = disc || this.P.Texture.WHITE;
    this.disc.tint = M.discColor; this.disc.alpha = disc ? M.discAlpha : 0.6;
    this.disc.position.set(cx, cy); this.disc.width = this.disc.height = M.disc * u;
    this.ring.visible = !!ring;
    if (ring) { this.ring.texture = ring; this.ring.tint = M.color; this.ring.position.set(cx, cy); this.ring.width = this.ring.height = M.ring * u; this.ring.rotation = markRingAngle(now - this.t0); }
    if (this.n !== n) { this.n = n; this.label.text = String(n); this.metric = null; }
    this._placeLabel(cx, cy, u);
    this.label.scale.set(u / 2);
  }
}

// ---- element (EP) rings ----------------------------------------------------------------------------------------------
// Maintainer request 2026-10-07 (「원소 피해는 원형 바, 가운데 아이콘은 원소 유형에 따라 다르다」). The client's `char_ep_slider` /
// `enemy_ep_slider` (arts/ui/[uc]battlecommon.ab), their UIHudUnitEpSlider `_elementDatas` in ELEMENT_ORDER (neural,
// erosion, burn, apoptosis — sim constants.js):
//   ally: ep_slider ×1.2 at 25.9 under hud_unit — ep_hit_spread (76×78, the element's colour, a pulse on a hit [추정 anim]),
//     ep_center_color (sprite_ep_color 28, the element's colour), ep_back (slider_ep_back 54, α .784), the back slider
//     (slider_ep_fill 28, white α .3: the value a moment ago, like the HP bar's loss) and the fill (slider_ep_fill 28,
//     white) — both Image type Filled, Radial360 from the top clockwise (FillOrigin 2: the empty wedge left of 12 o'clock,
//     as in CN captures 8 / 10) — and ep_icon (14×14: sprite_ep_icon / _water / _fire / _dark);
//   enemy: ×1.2 at 26.5 — ep_back (slider_ep_back_enemy 51), ep_center_color (slider_ep_color_enemy, a 27-px disc in a
//     51 rect), fill_back (slider_ep_fill_back_enemy 17, dark), the fill (slider_ep_fill_enemy 12, #d5d5d5), no icon;
//     on its burst ep_break_spread (41×42, the element's break colour) with ep_break_hint (33) [추정 anim].
// The value is render/units.js elementLeft(): the 元素值 left (PRTS 「以白条显示剩余的元素值」), refilling over a 爆发冷却.
// Sprites: local client ui/battlecommon; without them (or SimpleMesh) units.js keeps its drawn gauge row.

export const EP = Object.freeze({
  ally: Object.freeze({
    y: 25.9, scale: 1.2,
    color: Object.freeze({ neural: 0x00ffd8, erosion: 0x3da1ff, burn: 0xff4901, apoptosis: 0x474747 }),
    icon: Object.freeze({ neural: 'sprite_ep_icon', erosion: 'sprite_ep_water_icon', burn: 'sprite_ep_fire_icon', apoptosis: 'sprite_ep_dark_icon' }),
  }),
  enemy: Object.freeze({
    y: 26.5, scale: 1.2,
    color: Object.freeze({ neural: 0x149882, erosion: 0x266ad0, burn: 0xe3531a, apoptosis: 0x7c7c7c }),
    breakColor: Object.freeze({ neural: 0x149882, erosion: 0x266ad0, burn: 0xe3531a, apoptosis: 0x1c1c1c }),
  }),
});
/** Seconds of a hit pulse / a burst's spread [추정: the clips are animations not read here]. */
export const EP_PULSE = 0.4, EP_BREAK = 0.6;
const FAN = 48;

/** A texture drawn Filled Radial360 from the top, clockwise (Unity Image fill origin Top): a fan mesh over its square. */
class RadialFill {
  constructor(P, parent) {
    this.n = FAN + 2;
    this.v = new Float32Array(this.n * 2);
    this.uv = new Float32Array(this.n * 2);
    const idx = new Uint16Array(FAN * 3);
    for (let i = 0; i < FAN; i++) { idx[i * 3] = 0; idx[i * 3 + 1] = i + 1; idx[i * 3 + 2] = i + 2; }
    this.mesh = new P.SimpleMesh(P.Texture.WHITE, this.v, this.uv, idx);
    this.amount = -1; this.size = -1;
    parent.addChild(this.mesh);
  }

  /** Texture `t`, `size` local units across, fill `amount` 0..1. */
  update(t, size, amount) {
    const m = this.mesh;
    if (m.texture !== t) m.texture = t;
    amount = clamp(amount, 0, 1);
    if (Math.abs(amount - this.amount) < 1e-4 && size === this.size) return;
    this.amount = amount; this.size = size;
    const v = this.v, uv = this.uv;
    v[0] = 0; v[1] = 0; uv[0] = 0.5; uv[1] = 0.5;
    const end = amount * Math.PI * 2;
    for (let i = 0; i <= FAN; i++) {
      const a = -Math.PI / 2 + Math.min(end, (i / FAN) * Math.PI * 2);   // screen y down: increasing angle = clockwise
      const c = Math.cos(a), s = Math.sin(a), k = 0.5 / Math.max(Math.abs(c), Math.abs(s));
      uv[(i + 1) * 2] = 0.5 + c * k; uv[(i + 1) * 2 + 1] = 0.5 + s * k;
      v[(i + 1) * 2] = c * k * size; v[(i + 1) * 2 + 1] = s * k * size;
    }
    m.geometry.getBuffer('aTextureCoord').update(uv);
    m.vertices = v;
    m.visible = amount > 0;
  }
}

/** The textures of an element ring for `side` 'ally' | 'enemy' (all of them, or null while any is missing). */
function epTextures(P, assets, side) {
  const names = side === 'ally'
    ? ['sprite_ep_hit_spread', 'sprite_ep_color', 'slider_ep_back', 'slider_ep_fill', 'sprite_ep_icon', 'sprite_ep_water_icon', 'sprite_ep_fire_icon', 'sprite_ep_dark_icon']
    : ['slider_ep_back_enemy', 'slider_ep_color_enemy', 'slider_ep_fill_back_enemy', 'slider_ep_fill_enemy', 'sprite_ep_break_spread', 'sprite_ep_break_hint'];
  const out = {};
  for (const n of names) { const t = texOf(P, localUrl(assets, 'ui/battlecommon', n)); if (!t) return null; out[n] = t; }
  return out;
}

/** Whether the ring can be drawn (SimpleMesh and the sprites are there) for `side`. */
export const epRingReady = (P, assets, side) => !!P.SimpleMesh && !!epTextures(P, assets, side);

/** One unit's element ring (see above), in `parent` (the view's HUD container). */
export class ElementRing {
  constructor(P, parent, side) {
    this.P = P; this.side = side;
    this.anchor = HUD_ANCHOR;
    this.root = new P.Container();
    parent.addChild(this.root);
    const spr = () => { const s = new P.Sprite(P.Texture.EMPTY); s.anchor.set(0.5); this.root.addChild(s); return s; };
    if (side === 'ally') {
      this.spread = spr(); this.disc = spr(); this.back = spr();
      this.ghostFill = new RadialFill(P, this.root); this.ghostFill.mesh.alpha = 0.3;
      this.fill = new RadialFill(P, this.root);
      this.icon = spr();
    } else {
      this.back = spr(); this.disc = spr();
      this.fillBack = new RadialFill(P, this.root);
      this.fill = new RadialFill(P, this.root); this.fill.mesh.tint = 0xd5d5d5;
      this.spread = spr(); this.hint = spr();
    }
    this.ghost = 1; this.last = 1; this.pulse = 0; this.burst = 0; this.cooling = false;
    this.root.visible = false;
  }

  hide() { this.root.visible = false; this.ghost = 1; this.last = 1; this.cooling = false; }

  /**
   * Draw the gauge of element `el` (sim key) at value `k` 0..1 (elementLeft) for feet (x, y), `u` px per unit, `dt` s;
   * `cooling`: in its 爆发冷却 (a burst just started when it turns on).
   */
  update(assets, el, k, cooling, x, y, u, dt) {
    const E = EP[this.side], t = epTextures(this.P, assets, this.side);
    if (!t) { this.hide(); return false; }
    this.root.visible = true;
    this.root.position.set(x, hudAnchorY(y, u, this.anchor) + E.y * u);
    this.root.scale.set(E.scale * u);
    const col = E.color[el] ?? E.color.burn;
    if (k < this.last - 1e-4 && !cooling) this.pulse = EP_PULSE;            // a hit: the spread pulses
    if (cooling && !this.cooling) this.burst = EP_BREAK;                      // the burst
    this.cooling = cooling; this.last = k;
    this.pulse = Math.max(0, this.pulse - dt); this.burst = Math.max(0, this.burst - dt);
    // the back slider follows the value down with a delay (as the HP bar's loss), at once up
    this.ghost = k >= this.ghost ? k : Math.max(k, this.ghost - dt * 0.9);
    const set = (s, tex, w, h, tint = 0xffffff, alpha = 1) => { s.texture = tex; s.width = w; s.height = h; s.tint = tint; s.alpha = alpha; s.visible = alpha > 0; };
    if (this.side === 'ally') {
      const p = this.pulse / EP_PULSE;
      set(this.spread, t.sprite_ep_hit_spread, 76 * (1 - p), 78 * (1 - p), col, p);
      set(this.disc, t.sprite_ep_color, 28, 28, col);
      set(this.back, t.slider_ep_back, 54, 54, 0xffffff, 0.784);
      this.ghostFill.update(t.slider_ep_fill, 28, this.ghost);
      this.fill.update(t.slider_ep_fill, 28, k);
      const ic = t[EP.ally.icon[el] ?? 'sprite_ep_icon'];
      set(this.icon, ic, ic.width, ic.height);
    } else {
      set(this.back, t.slider_ep_back_enemy, 51, 51);
      set(this.disc, t.slider_ep_color_enemy, t.slider_ep_color_enemy.width, t.slider_ep_color_enemy.height, col);
      this.fillBack.update(t.slider_ep_fill_back_enemy, 17, 1);
      this.fill.update(t.slider_ep_fill_enemy, 12, k);
      const b = this.burst / EP_BREAK, bc = EP.enemy.breakColor[el] ?? col;
      set(this.spread, t.sprite_ep_break_spread, 41 * (1 - b * 0.5) * 1.5, 42 * (1 - b * 0.5) * 1.5, bc, b);
      set(this.hint, t.sprite_ep_break_hint, 33, 33, 0xffffff, b);
    }
    return true;
  }
}
