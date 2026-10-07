// render/hud-bars.js — local patch (docs/LOCAL-PATCH.md 「전투 화면 UI」): the official battle HUD of allied units.
//
// The client's unit HUD (EN client arts/ui/[uc]battlecommon.ab, battle/[pack]common.ab `hud_unit`) is a screen-space
// canvas: its size does not follow the camera or the unit's depth — in the CN capture (2000×1125) the bars of both
// operator rows are 128–129 px wide for the prefab's 125 (≈ 2000 / 1920 px per unit), though the rows' tiles are 168
// and 177 px apart. One unit here = min(width / 1920, height / 1080) CSS px of the view ([추정] the fit for other aspect
// ratios: no CanvasScaler value found). Every size below is in those units, measured from the unit's feet (`hud_unit`
// sits on the unit's position — the bars' centre lies 54.5 below it, the capture ≈ 55 px under the tile centre).
//
// Allies (char_hp_slider / char_sp_slider / char_sp_cast_slider / char_bullet_bar / char_slider_background):
//   HP 125×7 #49b2e3 α.7 over its delayed loss (white α.7, `slider_back`), SP 125×7 right under it — charging #caec46
//   α.7, a running skill's remaining duration #ffa800 α.7 — on one black α.5 plate (`sprite_bg`; the capture shows it
//   about 1 px past the bars). An ammo skill (b.snap `ammo`, server/sim/local-hud.js) shows its bullets left instead:
//   one block per bullet on a #e56d00 α.31 track (`char_bullet_bar`), the blocks laid out by code (UIBulletBar) —
//   [추정] their colour #ffa800 and 2-unit gaps from the captures (7 bullets: 16–17 px blocks 2 px apart; 19 bullets: ~4.5 px
//   blocks, the same gaps — many bullets make thin blocks, never one bar unless a block would be under 1 px). No glow when
//   the SP is full (user decision 2026-10-07: none in the captures, the skills fire at once).
// Tier chip: the official shows none in battle (CN captures) and `shop_hud`'s chess_level_icon (autochess_level_N,
//   rect 42, scale 1.25, at (-45.5, +127.75) from the feet) over a piece in prep; drawn from the local-client sprite when
//   it is installed (data/local-assets.json ui/battle), else units.js keeps the drawn chip.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Reference canvas of the battle HUD (CSS px per unit = min(w / W, h / H)). */
export const HUD_REF = Object.freeze({ w: 1920, h: 1080 });

/** CSS px per HUD unit for a view `vp` ({ width, height } CSS px); 1 without one. */
export function hudUnit(vp) {
  const w = Number(vp?.width), h = Number(vp?.height);
  if (!(w > 0 && h > 0)) return 1;
  return Math.min(w / HUD_REF.w, h / HUD_REF.h);
}

/** Ally bars (see header), in HUD units. */
export const ALLY_BAR = Object.freeze({
  w: 125, h: 7, y: 54.5, pad: 1,
  hp: 0x49b2e3, sp: 0xcaec46, cast: 0xffa800, alpha: 0.7, ghost: 0xffffff,
  plate: 0x000000, plateAlpha: 0.5,
  ammoTrack: 0xe56d00, ammoTrackAlpha: 0.31, ammo: 0xffa800, ammoAlpha: 1, ammoGap: 2,
});

/** Prep tier chip (`shop_hud` chess_level_icon), in HUD units: centre from the feet, scale of the sprite's rect. */
export const PREP_CHIP = Object.freeze({ x: -45.5, y: 127.75, scale: 1.25, rect: 42 });

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
   * Draw at feet (x, y) with `u` px per unit: `hp` / `ghost` (shares 0..1 of the max HP), `sp` (share 0..1 or null: no
   * SP bar), `cast` (the skill runs: the SP bar is its remaining duration), `ammo` ([left, max] or null). Returns the
   * bottom edge (px) of what it drew.
   */
  update(x, y, u, { hp, ghost, sp = null, cast = false, ammo = null }) {
    const B = ALLY_BAR;
    this.root.visible = true;
    const w = B.w * u, h = B.h * u, x0 = x - w / 2;
    const hy = y + B.y * u;
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

const _chipTex = new Map();
/**
 * The official prep tier chip texture of tier 1..6 (local-client `ui/battle/autochess_level_N`), or null while it is not
 * installed or not loaded yet (the caller keeps its drawn chip). `assets`: the view's asset store (localUrl).
 */
export function prepChipTexture(P, assets, tier) {
  const t = clamp(tier | 0 || 1, 1, 6);
  let tex = _chipTex.get(t);
  if (tex === undefined) {
    const url = typeof assets?.localUrl === 'function' ? assets.localUrl('ui/battle', `autochess_level_${t}`) : null;
    tex = null;
    if (url) { try { tex = P.Texture.from(url); } catch { tex = null; } }
    _chipTex.set(t, tex);
  }
  return tex && tex.baseTexture && tex.baseTexture.valid ? tex : null;
}
