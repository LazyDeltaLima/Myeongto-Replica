// render/facing.js — local patch (docs/LOCAL-PATCH.md 「전투 화면 UI」): the official facing marker on the board.
//
// Every operator prefab (charpack/char_*.ab) carries Others/Direction/DirectionIndicator (Character `_directionIndicator`;
// `_directionTransform` turns it): two SpriteRenderers lying on the ground (the battle's XY plane), scale 0.55 —
//   Ring:  sprite_direction_ring (battle/[pack]common.ab, rect 128, ppu 100) at the unit, white α .502 → 0.704 tiles across;
//   Arrow: sprite_direction_arrow (same bundle, rect 128 — the texture is tight-packed 65×112 at (31, 8), a "›" pointing
//          +x whose concave root meets the ring) 0.333 tiles out along the facing, tint #FF9900 opaque → its tip on the
//          tile's edge.
// (Maintainer request 2026-10-07 「배치 방향 표시 화살표도 실제 인게임과 동일하게」, replacing the drawn orange chevron.) Both are
// drawn as ground quads: each frame the four corners are projected with the camera (SimpleMesh), so they lie on the
// board like the client's. The art is the web manifest's ui/battle sprites (sprite_direction_arrow / _ring); without
// them (or without SimpleMesh: tests) the caller keeps the chevron.

/** Prefab values in tiles (see header). */
export const FACING = Object.freeze({
  ring: 1.28 * 0.55, arrow: 1.28 * 0.55, arrowOut: 0.333, ringAlpha: 0.502, tint: 0xff9900,
  // the packed arrow texture inside its 128-px rect (px from the rect's top-left)
  trim: Object.freeze({ x: 31, y: 8, w: 65, h: 112, rect: 128 }),
});

const UV = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
const IDX = new Uint16Array([0, 1, 2, 0, 2, 3]);
const P0 = { x: 0, y: 0, s: 0, depth: 0 };

function quad(P, parent, tex) {
  const m = new P.SimpleMesh(tex, new Float32Array(8), UV, IDX);
  parent.addChild(m);
  return m;
}

/** The marker's textures `{ ring, arrow }` from the asset store, or null while they are not there / not loaded. */
export function facingTextures(P, assets) {
  if (!P.SimpleMesh || typeof assets?.ui !== 'function') return null;
  const get = (name) => {
    const url = assets.ui(`battle/${name}`);
    if (!url) return null;
    let t = _tex.get(url);
    if (t === undefined) { try { t = P.Texture.from(url); } catch { t = null; } _tex.set(url, t); }
    return t && t.baseTexture && t.baseTexture.valid ? t : null;
  };
  const ring = get('sprite_direction_ring'), arrow = get('sprite_direction_arrow');
  return ring && arrow ? { ring, arrow } : null;
}
const _tex = new Map();

/** The ring + arrow of one unit, as ground quads in a container (`root`) the caller places in a layer. */
export class FacingMarker {
  constructor(P, t) {
    this.root = new P.Container();
    this.ring = quad(P, this.root, t.ring);
    this.ring.alpha = FACING.ringAlpha;
    this.arrow = quad(P, this.root, t.arrow);
    this.arrow.tint = FACING.tint;
  }

  /**
   * Lay it at world (x, y, z) facing `step` ([dx, dy], render/units.js DIR_STEP) with camera `cam`; `alpha` the unit's.
   */
  update(cam, x, y, z, step, alpha) {
    this.root.alpha = alpha;
    const [dx, dy] = step;
    // a standing unit under a still camera keeps its corners (each frame re-projected 8 of them for every ally)
    const k0 = this._key;
    if (k0 && k0.cam === cam && k0.v === cam.version && k0.x === x && k0.y === y && k0.z === z && k0.dx === dx && k0.dy === dy) return;
    this._key = { cam, v: cam.version, x, y, z, dx, dy };
    const px = -dy, py = dx;                 // the texture's "up" (−v) on the ground: left of the facing
    const put = (mesh, pts) => {
      const v = mesh.vertices;
      for (let i = 0; i < 4; i++) { const p = cam.project(pts[i][0], pts[i][1], z, P0); v[i * 2] = p.x; v[i * 2 + 1] = p.y; }
      mesh.vertices = v;
    };
    const r = FACING.ring / 2;
    // texture corners (u, v) = (0,0) (1,0) (1,1) (0,1): left-top, right-top, right-bottom, left-bottom
    put(this.ring, [[x - r, y + r], [x + r, y + r], [x + r, y - r], [x - r, y - r]]); // round: axis-aligned
    const T = FACING.trim, k = FACING.arrow / T.rect;
    const cx = x + dx * FACING.arrowOut, cy = y + dy * FACING.arrowOut;
    const corner = (u, v) => {
      const along = (u - T.rect / 2) * k, side = (T.rect / 2 - v) * k;
      return [cx + dx * along + px * side, cy + dy * along + py * side];
    };
    put(this.arrow, [corner(T.x, T.y), corner(T.x + T.w, T.y), corner(T.x + T.w, T.y + T.h), corner(T.x, T.y + T.h)]);
  }

  destroy() { this.root.destroy({ children: true }); }
}
