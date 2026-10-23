// render/num-official.js — local patch (docs/LOCAL-PATCH.md 「전투 화면 UI」 ④): the client's damage / heal numbers.
//
// battle/[pack]common.ab `hud_unit` spawns them in its `popup` (150 units over hud_unit's centre):
//   damage_text (UIDamageText): legacy Text "Novecentowide-Normal" 30, #ff3a00, Shadow black α .5 at (1, −1),
//     `_randomRange` (10, 5), `_lifeTime` 0.5, `_upOffset` / `_downOffset` (0, 30), `_fontSizeScale` 1.5;
//     UIDamageText.CRITICAL_FONT_SIZE_SCALE 1.1 (EN client metadata);
//   heal_text (UIHealText): the same font, #00ff95, "+n", `_randomRange` (10, 5), `_lifeTime` 0.5, `_floatOffset` (0, 40).
// When: a damage number only for a critical hit (PRTS 「伤害红字（暴击）」: ≥ 1.5 × the hit's expected damage — Modifier.
// isCritical, BattleConsts.MODIFIER_CRIT_THRESHOLD 1.5) or one forced (强制红字: 蕾缪安 S3) — the sim marks them
// (server/sim/local-hud.js damageNumberFlag, 'dmg' 5th field); heals always (no flag in the data; PRTS / 나무위키 silent).
// The motion is the official client's (DOTween, 2026-10-10; docs/rules/ui.md 「전투 화면 UI」 ④), from a random start within
// ±`_randomRange` (UIPopup.Init), over `_lifeTime`:
//   damage (UIDamageText.SetTweens): half = life × 0.5; position p → p + `_upOffset` (OutExpo, half) then
//     → p − `_downOffset` (InExpo, half; both targets from the start p); scale 1 → `_fontSizeScale` (OutExpo, half) then
//     → 0 (InExpo, half); no alpha tween. A crit's font is × 1.1. The blue / BLOCK texts move the same.
//   heal (UIHealText.SetTweens): position p → p + `_floatOffset` (OutCubic, life); text alpha 1 → 0 (InExpo,
//     life); no scale tween.
// (The damage motion matches the maintainer video of 2026-10-07 — first frame at 0.87 of the peak, shrink and drop in the last
// ~0.13 s — measured then against the peak size.) Sizes in HUD units (hud-bars.js hudUnit: screen-fixed).

import { hudUnit, hudAnchorY, HUD_ANCHOR } from './hud-bars.js';

export const OFFICIAL_NUM = Object.freeze({
  // prefab values: life `_lifeTime`, spread `_randomRange`, up / down `_upOffset` / `_downOffset` (y), pop `_fontSizeScale`;
  // crit UIDamageText.CRITICAL_FONT_SIZE_SCALE; heal rise `_floatOffset` (y)
  popup: 150, size: 30, life: 0.5, spread: Object.freeze([10, 5]), pop: 1.5, crit: 1.1, up: 30, down: 30,
  dmg: Object.freeze({ color: '#ff3a00', font: 'sp-num-off-dmg' }),
  heal: Object.freeze({ color: '#00ff95', rise: 40, font: 'sp-num-off-heal' }),
  // a red number stopped by a 屏障 / 护盾 (PRTS 「强制红字与蓝字」, sim 'blk' event): blue (block_text #3a35d9, else as
  // damage_text) where the block allows it, else a yellow 「BLOCK」 (PRTS #ff9000 [추정 look: no client sprite found])
  blue: Object.freeze({ color: '#3a35d9', font: 'sp-num-off-blue' }),
  block: Object.freeze({ color: '#ff9000', font: 'sp-num-off-block', chars: 'BLOCK' }),
});
/** DOTween's eases (DG.Tweening.Ease OutExpo 18 / InExpo 17 / OutCubic 9) on 0..1. */
export const outExpo = (k) => (k >= 1 ? 1 : 1 - 2 ** (-10 * k));
export const inExpo = (k) => (k <= 0 ? 0 : 2 ** (10 * (k - 1)));
const outCubic = (k) => 1 - (1 - k) ** 3;
/** Bitmap font size (px) the glyphs are rendered at; drawn scaled to the HUD size. */
const GLYPH = 60;
const MAX = 80;

// Generated once, at the first number (the HUD's CSS already uses the font, so it is normally loaded by then).
let fonts = false;
function ensureFonts(P) {
  if (fonts) return;
  for (const k of ['dmg', 'heal', 'blue', 'block']) {
    const o = OFFICIAL_NUM[k];
    try {
      P.BitmapFont.from(o.font, {
        fontFamily: ['Novecento Wide', 'Bender', 'sans-serif'], fontSize: GLYPH, fill: o.color,
        // Shadow (1, −1) at 30 → 2 px down-right at the glyph size
        dropShadow: true, dropShadowColor: '#000000', dropShadowAlpha: 0.5, dropShadowDistance: 2 * Math.SQRT2, dropShadowAngle: Math.PI / 4, dropShadowBlur: 0,
      }, { chars: o.chars ? [o.chars] : [['0', '9'], '+'], resolution: 1, padding: 4 });
    } catch (err) { console.warn('[num] bitmap font', o.font, err?.message || err); }
  }
  fonts = true;
}

/** The official numbers of one field view: `damage` / `heal` spawn, `update` animates, `destroy` frees. */
export class OfficialNumbers {
  constructor(ctx) {
    this.ctx = ctx; this.P = ctx.P;
    this.live = [];
    this.pool = new Map();
    try { globalThis.document?.fonts?.load?.(`${GLYPH}px "Novecento Wide"`)?.catch?.(() => {}); } catch { /* ignore */ }
  }

  /** A damage number of `amount` on `view` when `flag` (1 crit, 2 forced) says so. */
  damage(view, amount, flag) {
    if (!(flag > 0)) return;
    this._spawn(view, amount, 'dmg', flag === 1);
  }

  heal(view, amount) { this._spawn(view, amount, 'heal', false); }

  /** A red number stopped by a shield: `shown` → the blue number of `amount`, else 「BLOCK」. */
  blocked(view, amount, shown) { this._spawn(view, amount, shown ? 'blue' : 'block', false); }

  _spawn(view, amount, kind, crit) {
    const n = Math.round(amount);
    if (!(n > 0 || kind === 'block') || !view || !view.screen) return;
    ensureFonts(this.P);
    const o = OFFICIAL_NUM[kind];
    let t = this.pool.get(o.font)?.pop();
    if (!t) {
      const text = new this.P.BitmapText('0', { fontName: o.font, fontSize: GLYPH, align: 'center' });
      text.anchor.set(0.5);
      this.ctx.layers.text.addChild(text);
      t = { text, font: o.font };
    }
    t.text.text = kind === 'block' ? 'BLOCK' : (kind === 'heal' ? '+' : '') + n;
    t.text.visible = true;
    t.view = view; t.kind = kind; t.crit = crit; t.age = 0;
    t.dx = (Math.random() * 2 - 1) * OFFICIAL_NUM.spread[0];
    t.dy = (Math.random() * 2 - 1) * OFFICIAL_NUM.spread[1];
    t.x = view.screen.x; t.y = view.screen.y; t.anchor = view.hudAnchor ?? HUD_ANCHOR; // hud_unit over the point (units.js)
    if (this.live.length >= MAX) this._free(this.live.shift());
    this.live.push(t);
    this._place(t);
  }

  _place(t) {
    const O = OFFICIAL_NUM, o = O[t.kind];
    const u = hudUnit(this.ctx.viewport?.());
    // stays where it spawned: the client parents the text to the battle UI's text layer and sets its position once from the
    // unit HUD's `popup` (UIController.ShowNumericText → UIPopup.InitPosition), so it does not follow
    // a moving unit (2026-10-10; it used to)
    if (t.kind !== 'heal') { // UIDamageText.SetTweens: up and grow, then down below the start and shrink to nothing
      const half = O.life / 2;
      let y, grow;
      if (t.age < half) { const k = outExpo(t.age / half); y = O.up * k; grow = 1 + (O.pop - 1) * k; }
      else { const k = inExpo(Math.min(1, (t.age - half) / half)); y = O.up - (O.up + O.down) * k; grow = O.pop * (1 - k); }
      t.text.scale.set((O.size * u * grow * (t.crit ? O.crit : 1)) / GLYPH);
      t.text.position.set(t.x + t.dx * u, hudAnchorY(t.y, u, t.anchor) - (O.popup + t.dy + y) * u);
      t.text.alpha = 1;
      return;
    }
    const k = Math.min(1, t.age / O.life); // UIHealText.SetTweens: float up, fade out
    t.text.scale.set((O.size * u) / GLYPH);
    t.text.position.set(t.x + t.dx * u, hudAnchorY(t.y, u, t.anchor) - (O.popup + t.dy + o.rise * outCubic(k)) * u);
    t.text.alpha = 1 - inExpo(k);
  }

  /** Advance by `dt` real seconds. */
  update(dt) {
    let w = 0;
    for (const t of this.live) {
      t.age += dt;
      if (t.age >= OFFICIAL_NUM.life) { this._free(t); continue; }
      this._place(t);
      this.live[w++] = t;
    }
    this.live.length = w;
  }

  _free(t) {
    t.text.visible = false; t.view = null;
    let list = this.pool.get(t.font);
    if (!list) this.pool.set(t.font, list = []);
    if (list.length < 30) list.push(t); else t.text.destroy();
  }

  /** Drop every live number (a new battle, the view switched). */
  clear() { for (const t of this.live) this._free(t); this.live.length = 0; }

  destroy() {
    this.clear();
    for (const list of this.pool.values()) for (const t of list) t.text.destroy();
    this.pool.clear();
  }
}
