// render/hud-bars.js — local patch (docs/LOCAL-PATCH.md 「전투 화면 UI」): the official battle HUD of units (bars, prep chip).
//
// The client's unit HUD (EN client arts/ui/[uc]battlecommon.ab, battle/[pack]common.ab `hud_unit`) is a screen-space
// canvas: its size does not follow the camera or the unit's depth — in the CN capture (2000×1125) the bars of both
// operator rows are 128–129 px wide for the prefab's 125 (≈ 2000 / 1920 px per unit), though the rows' tiles are 168
// and 177 px apart. One unit here = min(width / 1920, height / 1080) CSS px of the view ([추정] the fit for other aspect
// ratios: no CanvasScaler value found). Every size below is in those units, from `hud_unit`'s centre (prefab offsets).
// That centre lies HUD_ANCHOR units above the unit's feet [캡처]: the HP bar's centre is ≈ 30 units under the deploy ring's
// centre — where the shoes stand, in the captures and in ours alike — (CN captures 5 / 6 / 13: 27 / 29 / 33.7 units) where
// the prefab puts it 54.5 under hud_unit (user check 2026-10-07: 54.5 under the feet drew the bars too low); the prep chip
// of capture 4 also stood ≈ 16 units over the prefab's place. Presumably the unit's root over the model's (prefab
// `Graphic` −0.2 tile).
//
// Allies (char_hp_slider / char_sp_slider / char_sp_cast_slider / char_bullet_bar / char_slider_background):
//   HP 125×7 #49b2e3 α.7 over its delayed loss (white α.7, `slider_back`), SP 125×7 right under it — charging #caec46
//   α.7, a running skill's remaining duration #ffa800 α.7 — on one black α.5 plate. The plate is `sprite_bg` (9-sliced,
//   borders 4 / 5): a black α .70 core with a 4–5 px feathered shadow, laid out 8.6 × 10.32 units larger than the bars (the
//   prefab's 133.6 × (14 + 10.32) around 125 × 14) — i.e. the core (α .35 with the tint) under the bars and only the soft
//   shadow outside: 「불투명도가 들어간 바 위에 색 바」 (user, capture 14; a hard 1-unit margin read as an outline). Without
//   the sprite (local client art): a plain α .35 rect under the bars. An ammo skill (b.snap `ammo`, server/sim/local-hud.js) shows its bullets left instead:
//   one block per bullet on a #e56d00 α.31 track (`char_bullet_bar`), the blocks laid out by code (UIBulletBar) —
//   [추정] their colour #ffa800 and 2-unit gaps from the captures (7 bullets: 16–17 px blocks 2 px apart; 19 bullets: ~4.5 px
//   blocks, the same gaps — many bullets make thin blocks, never one bar unless a block would be under 1 px). No glow when
//   the SP is full (user decision 2026-10-07: none in the captures, the skills fire at once).
// Tier chip: the official shows none in battle (CN captures) and `shop_hud`'s chess_level_icon (autochess_level_N,
//   rect 42, scale 1.25, at (-45.5, +127.75) from the feet) over a piece in prep. That sprite is only 38 px (looked blurry
//   at its 1.25× size, user check 2026-10-07); img_chess_level_N (45 px, the shop card's) is the same design — numeral
//   0.53 × 0.70 of the dark interior in both, CN capture 4: 0.51 × 0.69 — so it is drawn instead, its 39-px interior at
//   the official's 30 × 1.25 = 37.5 units (capture 4: 39 px at 2000 wide = 37.4). Web manifest shopCard/ first, then the
//   local client (ui/battle), then autochess_level_N; none: units.js keeps the drawn chip.
// Equipment bar (prep, user capture 2026-10-07: 「장착된 아이템이 있을 때만, 하나만 장착되면 한 칸만」): `shop_hud`'s equip_bg
//   (74×30, at (13, 29.4) in shop_hud — right of the chip) with equip_0 / equip_1 (23×6 at ±12.8 / 13) — a white pill
//   (equip_normal_icon) per item, [추정] the glowing gold pill (equip_gold_icon, 31×14 drawn at its own size) for a golden
//   item; hidden without items. Sprites: local client ui/battlecommon (tools/local-extract/extract.py); none: item pips.
// Enemies (shown once hurt, bosses always — `_alwaysShowHp` is off but on 圣堂剑士):
//   - `enemy_hp_slider`: 105×7 #ea4700 α.7 over the white α.7 loss, the sprite_bg plate 8 × 8.55 larger
//     (enemy_slider_background), 55.3 under hud_unit (CN captures: ≈ 110 px at 2000 wide);
//   - `enemy_boss_hp_slider` (a boss without the giant panel: 铳, 卢西恩, …): 130×9 #ea2727 α.85, 43 under hud_unit, its
//     sprite_bg plate 10 × 8 larger and the boss emblem (sprite_enemy_boss_hud_small 57×65, 7 under the bar's centre) behind
//     the bar; its SP (`enemy_boss_sp_slider` 130×6 #ebc9ff α.7, plate 10 × 7 larger) right under it [추정 place];
//   - the giant boss panel (`EnemyGiantBoss`, battle/[pack]common.ab panel_enemy_boss_info — the 卫戍协议 bosses whose prefab
//     has `_bossHudScale`, user: 「위수협의 모드에서만 넓게」): HP 798×10 × the prefab's x scale (0.35 → 279, CN capture 8 of
//     假想敌：管 ≈ 281 × 9.3 units) #ff2b2b α.8 over the white α.7 loss, a black α.39 plate (800×12) and a white α.39 frame
//     (sprite_enemy_boss_hp_bg, 9-sliced, 816×28: a grey α .76 core edged with dark lines); its SP (default_sp_slider
//     798×8 #cab2d4 α.8, plate 800×12, frame 816×24) 16.3 under the HP bar's centre [캡처 8]; the emblem (sprite_enemy_boss_hud_large) behind its centre ≈ 39 units
//     wide [캡처 8 / 10]; a hit flash (hit_effect: sprite_bar_glow, 9-sliced, 818×31, #ff0000 α.78 — user decision 2026-10-07)
//     fading over HIT_FLASH s [추정]. Its centre on the feet [추정 — the placement is native code; the captures show it at
//     the boss's feet], moved by the prefab's `_bossHudOffset` in tiles [추정 단위] (萨米的意志 / 昆图斯 up 1.4 / 1.02, 管 II
//     right 1.4).
//   Boss SP: the official enemy SP (enemy_database spData INCREASE_WITH_TIME — 管 0/50 +1/s, PRTS 「技力 0/50 自动回复」;
//   阿利斯泰尔 25), b.snap `bsp` (server/sim/local-hud.js); only the bosses with SP show the bar (user decision 2026-10-07).

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Reference canvas of the battle HUD (CSS px per unit = min(w / W, h / H)). */
export const HUD_REF = Object.freeze({ w: 1920, h: 1080 });

/** CSS px per HUD unit for a view `vp` ({ width, height } CSS px); 1 without one. */
export function hudUnit(vp) {
  const w = Number(vp?.width), h = Number(vp?.height);
  if (!(w > 0 && h > 0)) return 1;
  return Math.min(w / HUD_REF.w, h / HUD_REF.h);
}

/** Units from the feet up to `hud_unit`'s centre (see header). */
export const HUD_ANCHOR = 24.5;
/** Screen y (px) of `hud_unit`'s centre for feet at `feetY` with `u` px per unit. */
export const hudAnchorY = (feetY, u) => feetY - HUD_ANCHOR * u;

/** Ally bars (see header), in HUD units (y: below hud_unit's centre). */
export const ALLY_BAR = Object.freeze({
  w: 125, h: 7, y: 54.5, grow: Object.freeze([8.6, 10.32]),
  hp: 0x49b2e3, sp: 0xcaec46, cast: 0xffa800, alpha: 0.7, ghost: 0xffffff,
  plateAlpha: 0.5,
  ammoTrack: 0xe56d00, ammoTrackAlpha: 0.31, ammo: 0xffa800, ammoAlpha: 1, ammoGap: 2,
});

/** Prep tier chip (`shop_hud` chess_level_icon), in HUD units: centre from hud_unit's centre; the dark interior's size. */
export const PREP_CHIP = Object.freeze({ x: -45.5, y: 128, interior: 37.5 });
/** Prep equipment bar (`shop_hud` equip_bg, root scale 1.25), in HUD units: centre from hud_unit's centre, size, slots. */
export const PREP_EQUIP = Object.freeze({ x: 14.75, y: 129.5, w: 92.5, h: 37.5, slots: Object.freeze([-16, 16.25]), slotW: 28.75, slotH: 7.5, scale: 1.25 });

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
    const B = ALLY_BAR;
    this.root = new P.Container();
    parent.addChild(this.root);
    this.plate = new Plate(P, this.root, { ...PLATE, alpha: B.plateAlpha, bare: B.plateAlpha * PLATE.core });
    this.ghost = rect(P, this.root, B.ghost, B.alpha);
    this.hp = rect(P, this.root, B.hp, B.alpha);
    this.sp = rect(P, this.root, B.sp, B.alpha);
    this.ammoTrack = rect(P, this.root, B.ammoTrack, B.ammoTrackAlpha);
    this.blocks = [];
    this.root.visible = false;
  }

  hide() { this.root.visible = false; }

  /**
   * Draw for feet at (x, y) with `u` px per unit: `hp` / `ghost` (shares 0..1 of the max HP), `sp` (share 0..1 or null: no
   * SP bar), `cast` (the skill runs: the SP bar is its remaining duration), `ammo` ([left, max] or null); `assets` for
   * the plate sprite. Returns the bottom edge (px) of the bars.
   */
  update(x, y, u, { hp, ghost, sp = null, cast = false, ammo = null }, assets = null) {
    const B = ALLY_BAR;
    this.root.visible = true;
    const w = B.w * u, h = B.h * u, x0 = x - w / 2;
    const hy = hudAnchorY(y, u) + B.y * u;
    const rows = sp == null && !ammo ? 1 : 2;
    this.plate.update(assets, x, hy - h / 2 + (rows * h) / 2, B.w, rows * B.h, B.grow, u);
    this.ghost.position.set(x0, hy); this.ghost.width = w * clamp(ghost, 0, 1); this.ghost.height = h;
    this.hp.position.set(x0, hy); this.hp.width = w * clamp(hp, 0, 1); this.hp.height = h;
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
    if (bw >= AMMO_BLOCK_MIN) {
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
    else cy = hudAnchorY(y, u) + B.y * u;
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
    const cx = x + E.x * u, cy = hudAnchorY(y, u) - E.y * u;
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
