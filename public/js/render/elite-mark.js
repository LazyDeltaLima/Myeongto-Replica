// render/elite-mark.js — local patch (docs/rules/fx.md 「정예 기물 금빛」): what marks an elite (精锐) operator in the prep
// besides the official golden glow (render/fxgolden.js).
//
// - Ground ring (EliteRing): a gold ring on the floor under the piece, shown in the prep while the official glow cannot
//   play (quality 'low' turns the official effects off, or the effect is not installed) — the glow is a feet effect, so
//   its stand-in sits at the feet too. Maintainer decision 2026-10-17: the fallback for 'low' only, never in battle
//   (the official battle units are real characters without the glow).
// - Badge (eliteBadgeTexture): the official 精二 chevrons (ui `eliteLarge/elite_2_large`), gold with a thin dark
//   outline, right of the prep tier chip, behind the settings toggle 「精锐干员标记」 (`eliteBadge`, off by default;
//   maintainer decision 2026-10-17: prep only).

/** Ground ring radius in tiles (outside the official facing ring, 1.28 × 0.55 / 2 = 0.35) and its lift off the floor. */
export const ELITE_RING = Object.freeze({ r: 0.46, lift: 0.012, pulse: 2.2, alphaMin: 0.85 });
/** Badge: the ui asset, its width × the chip's height, and its centre's gap from the chip's right edge × its width. */
export const ELITE_BADGE = Object.freeze({ ui: 'eliteLarge/elite_2_large', width: 1.3, gap: 0.6 });

const makeCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

let _ring = null;
/** The ring texture (a gold band with a soft outer edge and a faint fill), drawn once. */
export function eliteRingTexture(P) {
  if (_ring) return _ring;
  const c = makeCanvas(256, 256), x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,200,60,0.10)'); g.addColorStop(0.70, 'rgba(255,200,60,0.18)');
  g.addColorStop(0.80, 'rgba(255,214,90,0.95)'); g.addColorStop(0.86, 'rgba(255,240,170,1)'); g.addColorStop(0.90, 'rgba(255,200,60,0.85)');
  g.addColorStop(1, 'rgba(255,180,40,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return (_ring = P.Texture.from(c));
}

const _badge = new Map(); // url → Texture | null (loading / failed)
/**
 * The badge texture for the chevron image at `url`: null while it loads (or when it failed). The chevrons are tinted
 * a top-down gold gradient over a dark outline (16 offset copies), so they read on the light tiles and over the glow.
 */
export function eliteBadgeTexture(P, url) {
  if (!url) return null;
  if (_badge.has(url)) return _badge.get(url);
  _badge.set(url, null);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const bw = 128, bh = Math.max(1, Math.round((bw * img.height) / img.width)), pad = 10;
      const tint = (col) => {
        const t = makeCanvas(bw, bh), x = t.getContext('2d');
        x.drawImage(img, 0, 0, bw, bh);
        x.globalCompositeOperation = 'source-in';
        x.fillStyle = col; x.fillRect(0, 0, bw, bh);
        return t;
      };
      const c = makeCanvas(bw + pad * 2, bh + pad * 2), x = c.getContext('2d');
      const dark = tint('rgba(18,12,4,0.9)');
      for (let a = 0; a < 16; a++) x.drawImage(dark, pad + Math.cos((a / 8) * Math.PI) * 7, pad + Math.sin((a / 8) * Math.PI) * 7);
      const gold = tint('#ffd04a'), gx = gold.getContext('2d');
      const gd = gx.createLinearGradient(0, 0, 0, bh);
      gd.addColorStop(0, '#fff1b0'); gd.addColorStop(0.5, '#ffd04a'); gd.addColorStop(1, '#f0a81e');
      gx.globalCompositeOperation = 'source-atop'; gx.fillStyle = gd; gx.fillRect(0, 0, bw, bh);
      x.drawImage(gold, pad, pad);
      _badge.set(url, P.Texture.from(c));
    } catch { /* stays null: no badge */ }
  };
  img.src = url;
  return null;
}

const UV = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
const IDX = new Uint16Array([0, 1, 2, 0, 2, 3]);
const P0 = { x: 0, y: 0, s: 0, depth: 0 };
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/** The ground ring of one piece: a quad on the floor (projected by the camera, so it foreshortens with the board). */
export class EliteRing {
  constructor(P) {
    this.mesh = new P.SimpleMesh(eliteRingTexture(P), new Float32Array(8), UV, IDX);
  }

  /** Lay it at world (x, y, z) with camera `cam`; `alpha` the unit's, `t` the clock (a slow pulse). */
  update(cam, x, y, z, alpha, t) {
    const m = this.mesh, R = ELITE_RING.r;
    const v = m.vertices;
    CORNERS.forEach(([sx, sy], i) => {
      const q = cam.project(x + sx * R, y + sy * R, z + ELITE_RING.lift, P0);
      v[i * 2] = q.x; v[i * 2 + 1] = q.y;
    });
    m.vertices = v;
    const k = ELITE_RING.alphaMin + (1 - ELITE_RING.alphaMin) * (0.5 + 0.5 * Math.sin(t * ELITE_RING.pulse));
    m.alpha = k * alpha;
  }

  destroy() { this.mesh.destroy(); }
}
