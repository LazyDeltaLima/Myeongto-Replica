// render/hud-bars.js — local patch (docs/LOCAL-PATCH.md 「전투 화면 UI」): the official battle HUD of allied units.
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
//   α.7, a running skill's remaining duration #ffa800 α.7 — on one black α.5 plate (`sprite_bg`) exactly under the bars
//   (user check 2026-10-07: no outline — a 1-unit margin read as one). An ammo skill (b.snap `ammo`, server/sim/local-hud.js) shows its bullets left instead:
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
  w: 125, h: 7, y: 54.5, pad: 0,
  hp: 0x49b2e3, sp: 0xcaec46, cast: 0xffa800, alpha: 0.7, ghost: 0xffffff,
  plate: 0x000000, plateAlpha: 0.5,
  ammoTrack: 0xe56d00, ammoTrackAlpha: 0.31, ammo: 0xffa800, ammoAlpha: 1, ammoGap: 2,
});

/** Prep tier chip (`shop_hud` chess_level_icon), in HUD units: centre from hud_unit's centre; the dark interior's size. */
export const PREP_CHIP = Object.freeze({ x: -45.5, y: 128, interior: 37.5 });
/** Prep equipment bar (`shop_hud` equip_bg, root scale 1.25), in HUD units: centre from hud_unit's centre, size, slots. */
export const PREP_EQUIP = Object.freeze({ x: 14.75, y: 129.5, w: 92.5, h: 37.5, slots: Object.freeze([-16, 16.25]), slotW: 28.75, slotH: 7.5, scale: 1.25 });

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
    this.plate = rect(P, this.root, B.plate, B.plateAlpha);
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
   * SP bar), `cast` (the skill runs: the SP bar is its remaining duration), `ammo` ([left, max] or null). Returns the
   * bottom edge (px) of what it drew.
   */
  update(x, y, u, { hp, ghost, sp = null, cast = false, ammo = null }) {
    const B = ALLY_BAR;
    this.root.visible = true;
    const w = B.w * u, h = B.h * u, x0 = x - w / 2;
    const hy = hudAnchorY(y, u) + B.y * u;
    const rows = sp == null && !ammo ? 1 : 2;
    const pad = B.pad * u;
    this.plate.position.set(x0 - pad, hy - h / 2 + (rows * h) / 2);
    this.plate.width = w + 2 * pad; this.plate.height = rows * h + 2 * pad;
    this.ghost.position.set(x0, hy); this.ghost.width = w * clamp(ghost, 0, 1); this.ghost.height = h;
    this.hp.position.set(x0, hy); this.hp.width = w * clamp(hp, 0, 1); this.hp.height = h;
    const sy = hy + h;
    const showAmmo = !!ammo && ammo[1] > 0;
    this.sp.visible = sp != null && !showAmmo;
    if (this.sp.visible) {
      this.sp.tint = cast ? B.cast : B.sp;
      this.sp.position.set(x0, sy); this.sp.width = w * clamp(sp, 0, 1); this.sp.height = h;
    }
    this.ammoTrack.visible = showAmmo;
    let used = 0;
    if (showAmmo) {
      this.ammoTrack.position.set(x0, sy); this.ammoTrack.width = w; this.ammoTrack.height = h;
      const max = Math.round(ammo[1]), left = clamp(Math.round(ammo[0]), 0, max);
      const gap = B.ammoGap * u, bw = (w - gap * (max - 1)) / max;
      if (bw >= AMMO_BLOCK_MIN) {
        for (let i = 0; i < left; i++) {
          const b = this._block(i);
          b.position.set(x0 + i * (bw + gap), sy); b.width = bw; b.height = h;
        }
        used = left;
      } else if (left > 0) {
        const b = this._block(0);
        b.position.set(x0, sy); b.width = (w * left) / max; b.height = h;
        used = 1;
      }
    }
    for (let i = used; i < this.blocks.length; i++) this.blocks[i].visible = false;
    return hy - h / 2 + rows * h + pad;
  }

  _block(i) {
    let b = this.blocks[i];
    if (!b) b = this.blocks[i] = rect(this.P, this.root, ALLY_BAR.ammo, ALLY_BAR.ammoAlpha);
    b.visible = true;
    return b;
  }
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
