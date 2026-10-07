// render/infectionMark.js — local patch (src/docs/LOCAL-PATCH.md 「공식 맵 렌더링」): the red 「!!!」 over a unit on 活性源石.
//
// The tile's buff (tile_infection: periodic_damage, 1 s, duration 300, _clearBuffsWhenLeft 0) shows overrideEffectKey
// common_acute_infection_buff_01 (battle/prefabs/effects/common.ab, EN client; _isLoop, _holdByOwner, _spawnLocation 4 =
// the unit's top [추정], net +0.077 over it): `andi` — star_02 (soft dot) 0.536 wide, _TintColor (0.3088, 0, 0, 0.259)
// under the AlphaBlend particle shader (× 2: rgb 0.618, 0, 0, alpha 0.518 · tex.a); `tubiao` — kuangre_01 (three
// wedges) 0.254 wide turned 90° (the tips down), clip 0.667 s loop: _TintColor.r 0.4191 → 0.25 → 0.4191, .a 0.347 → 1
// → 0.347, scale 1 → 0.8552 → 1 (rgb × 2, alpha × 2 clamped). Who carries it — the sim does not report the buff, so
// the view decides from positions: in prep the pieces standing on the tile (user, 2026-10-07: 「해당 타일 위에
// 오퍼레이터를 배치했을때」), in battle every ground unit that has touched one since the battle began (the buff lasts
// 300 s after the last contact — the whole battle). Textures: tools/local-extract/boardfx_extract.py (board/fx); without
// them nothing is drawn.
//
//   const marks = createInfectionMarks(P, layer, { icon: url, glow: url })
//   marks.update([{ x, y, s }…], t)   x / y = the unit's top in px, s = px per tile there      marks.destroy()

export const MARK = Object.freeze({ icon: 0.254, glow: 0.536, lift: 0.077, period: 2 / 3 });

/** Tint red, alpha, scale of the icon at time t (s): the clip's 3 keys, eased (Hermite with flat ends ≈ cosine). */
export function markPhase(t) {
  const u = ((t % MARK.period) + MARK.period) % MARK.period / MARK.period;   // 0..1
  const k = 0.5 - 0.5 * Math.cos(u * 2 * Math.PI);                            // 0 → 1 (mid) → 0
  const r = 0.4191 + (0.25 - 0.4191) * k;
  const a = 0.347 + (1 - 0.347) * k;
  const s = 1 + (0.8552 - 1) * k;
  return { red: Math.min(1, 2 * r), alpha: Math.min(1, 2 * a), scale: s };
}

/** Size of the client textures (px) — the sprites are scaled from it, also while they still load. */
const TEX = 128;
const hexRed = (v) => (Math.round(Math.max(0, Math.min(1, v)) * 255) << 16);

export function createInfectionMarks(P, layer, urls) {
  let texIcon = null, texGlow = null;
  try { if (urls?.icon && urls?.glow) { texIcon = P.Texture.from(urls.icon); texGlow = P.Texture.from(urls.glow); } } catch { texIcon = texGlow = null; }
  const pool = [];
  const root = new P.Container();
  layer?.addChild?.(root);
  const make = () => {
    const c = new P.Container();
    const glow = new P.Sprite(texGlow);
    glow.anchor.set(0.5); glow.tint = hexRed(0.618); glow.alpha = 0.518;
    const icon = new P.Sprite(texIcon);
    icon.anchor.set(0.5); icon.rotation = Math.PI / 2;
    c.addChild(glow, icon);
    root.addChild(c);
    return { c, glow, icon };
  };
  return {
    update(list, t) {
      const n = texIcon && texGlow && Array.isArray(list) ? list.length : 0;
      const ph = n ? markPhase(t) : null;
      for (let i = 0; i < Math.max(n, pool.length); i++) {
        if (i >= n) { pool[i].c.visible = false; continue; }
        const m = pool[i] || (pool[i] = make());
        const p = list[i];
        m.c.visible = true;
        m.c.position.set(p.x, p.y - MARK.lift * p.s);
        const g = (MARK.glow * p.s) / TEX;
        m.glow.scale.set(g);
        const k = (MARK.icon * p.s * ph.scale) / TEX;
        m.icon.scale.set(k);
        m.icon.tint = hexRed(ph.red);
        m.icon.alpha = ph.alpha;
      }
    },
    destroy() { root.destroy({ children: true }); pool.length = 0; },
  };
}
