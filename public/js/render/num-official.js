// render/num-official.js — local patch (docs/LOCAL-PATCH.md 「전투 화면 UI」 ④): the client's damage / heal numbers.
//
// battle/[pack]common.ab `hud_unit` spawns them in its `popup` (150 units over hud_unit's centre):
//   damage_text (UIDamageText): legacy Text "Novecentowide-Normal" 30, #ff3a00, Shadow black α .5 at (1, −1),
//     `_randomRange` (10, 5), `_lifeTime` 0.5, `_upOffset` / `_downOffset` (0, 30), `_fontSizeScale` 1.5;
//     UIDamageText.CRITICAL_FONT_SIZE_SCALE 1.1 (EN client metadata);
//   heal_text (UIHealText): the same font, #00ff95, "+n", `_randomRange` (10, 5), `_lifeTime` 0.5, `_floatOffset` (0, 40).
// When: a damage number only for a critical hit (PRTS 「伤害红字（暴击）」: ≥ 1.5 × the hit's expected damage — Modifier.
// isCritical, BattleConsts.MODIFIER_CRIT_THRESHOLD 1.5) or one forced (强制红字: 蕾缪安 S3) — the sim marks them
// (server/sim/local-hud.js damageNumberFlag, 'dmg' 5th field); heals always (no flag in the data; PRTS / 나무위키 silent). The motion is native code [추정]: a random start within ±(10, 5), popped in at
// `_fontSizeScale` and settling to 1 (× 1.1 for a crit) over the first fifth, rising `_upOffset` (heals `_floatOffset`)
// with an ease-out over the life, fading over its last 30 %. Sizes in HUD units (hud-bars.js hudUnit: screen-fixed).

import { hudUnit, hudAnchorY } from './hud-bars.js';

export const OFFICIAL_NUM = Object.freeze({
  popup: 150, size: 30, life: 0.5, spread: Object.freeze([10, 5]), pop: 1.5, crit: 1.1, popT: 0.2, fadeFrom: 0.7,
  dmg: Object.freeze({ color: '#ff3a00', rise: 30, font: 'sp-num-off-dmg' }),
  heal: Object.freeze({ color: '#00ff95', rise: 40, font: 'sp-num-off-heal' }),
  // a red number stopped by a 屏障 / 护盾 (PRTS 「强制红字与蓝字」, sim 'blk' event): blue (block_text #3a35d9, else as
  // damage_text) where the block allows it, else a yellow 「BLOCK」 (PRTS #ff9000 [추정 look: no client sprite found])
  blue: Object.freeze({ color: '#3a35d9', rise: 30, font: 'sp-num-off-blue' }),
  block: Object.freeze({ color: '#ff9000', rise: 30, font: 'sp-num-off-block', chars: 'BLOCK' }),
});
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
    t.x = view.screen.x; t.y = view.screen.y;
    if (this.live.length >= MAX) this._free(this.live.shift());
    this.live.push(t);
    this._place(t);
  }

  _place(t) {
    const O = OFFICIAL_NUM, o = O[t.kind];
    const u = hudUnit(this.ctx.viewport?.());
    // follows its unit while it lives (the popup is a child of the unit's HUD); keeps the last place once it is gone
    if (t.view && !t.view.destroyed && t.view.screen) { t.x = t.view.screen.x; t.y = t.view.screen.y; }
    const k = Math.min(1, t.age / O.life);
    const rise = o.rise * (1 - (1 - k) * (1 - k));
    const pop = t.age < O.popT ? O.pop + (1 - O.pop) * (t.age / O.popT) : 1;
    const sc = (O.size * u * pop * (t.crit ? O.crit : 1)) / GLYPH;
    t.text.scale.set(sc);
    t.text.position.set(t.x + t.dx * u, hudAnchorY(t.y, u) - (O.popup + t.dy + rise) * u);
    t.text.alpha = k <= O.fadeFrom ? 1 : Math.max(0, 1 - (k - O.fadeFrom) / (1 - O.fadeFrom));
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
