// render/home-mark.js — what a dragged prep piece leaves on the tile it was picked from (render/units.js
// UnitView.markHome, render/app.js startDragVisual).
//
// The official drag (AutoChessDragState) never moves the character: entering the drag it takes the one on the begin
// tile (AutoChessDummyManager.MarkLeaving) and `_CreateOutline` multiplies its body colour by the state's
// `_overlapColor` (a grey of .667) and turns on its Spine outline (BattleSpineOutlineManager), while a dummy built
// from it — its own colours, no alpha anywhere on the path — follows the pointer and later stands on the drop tile
// for the direction step. The state's exit (`_ClearDummy` → MarkReturned, `_ClearOutline`) puts both back. Our view
// itself is what moves, so the tile keeps a still picture of it: docs/rules/ui.md 「배치 UI」.
//
// Drawn ONCE when the drag starts: the view's body (its live model, impostor slot or portrait diamond) into a
// snapshot, then the mark's texture is the snapshot's silhouette grown by the outline width in the outline colour (12
// offset copies filled by SRC_IN, the way render/item-models.js rings a held item) under the snapshot tinted grey.
// While the drag lasts one Sprite is placed per frame — nothing redrawn or allocated (CONTRIBUTING "Per-frame
// rendering"); only one piece is dragged at a time.

/** @import { Camera } from './projection.js' */
import { COLORS } from './style.js';

export const HOME_MARK = Object.freeze({
  /** the client's `_overlapColor` (.667 grey) as a multiply tint */
  tint: 0xaaaaaa,
  /**
   * The outline colour and width. The client's outline config for this mode is #00928388 at size 0.04 through the
   * `Spine-Skeleton-BattleOutline` shader, whose blending and units are not read [추정·화면: 공식 영상 캡처에서 잼]:
   * the colour is the held item's ring (≈ 100,225,200 in the official CN prep recording, ≈ 70–100,220–245,190–220
   * around the operator in the maintainer's capture of 2026-11-16) and the width the same ~1/64 tile (2–3 px at
   * ~170 px per tile in that capture; item-models.js OUTLINE_PX at its REF_PX).
   */
  outline: COLORS.heldOutline,
  width: 2 / 128,
  /**
   * How far a piece held for the direction step on a battle tile another character stands on is raised, tiles: the
   * drag state's `_overlapOffset` (0, 0, −0.45) added to the drop tile's world position (`_TryMoveToNextState`; the
   * battle frame's z is −height), while that character is greyed by the same tint (`_DoBattleOverlap`, render/app.js
   * holdPiece).
   */
  overlapLift: 0.45,
});

/** Largest snapshot side, CSS px (a zoomed phone board's model is far smaller). */
const MAX_SIDE = 1024;

export class HomeMark {
  /**
   * @param {typeof PIXI} P PIXI
   * @param {PIXI.Renderer} renderer
   * @param {PIXI.Container} body the view's model container (UnitView.body), drawn as it stands now
   * @param {{ x: number, y: number, z: number }} at the world point drawn at the body's origin
   * @param {number} s screen px per tile the body is drawn at now
   * @param {PIXI.Container} layer the depth-sorted unit layer
   * @returns {HomeMark|null} null without a renderer, a drawn body or a render target
   */
  static draw(P, renderer, body, at, s, layer) {
    if (!renderer || !body || !body.visible || !(s > 0)) return null;
    const rot = body.rotation, alpha = body.alpha;
    body.rotation = 0; body.alpha = 1;
    try {
      let b = null;
      try { b = body.getLocalBounds(); } catch { /* nothing drawn */ }
      if (!b || !(b.width > 0) || !(b.height > 0)) return null;
      const line = Math.max(1, s * HOME_MARK.width);
      const pad = Math.ceil(line) + 2;
      const w = Math.min(MAX_SIDE, Math.ceil(b.width) + pad * 2), h = Math.min(MAX_SIDE, Math.ceil(b.height) + pad * 2);
      const ox = pad - b.x, oy = pad - b.y;   // the body's origin in the snapshot
      const res = renderer.resolution || 1;
      let snap, out;
      try {
        snap = P.RenderTexture.create({ width: w, height: h, resolution: res });
        out = P.RenderTexture.create({ width: w, height: h, resolution: res });
      } catch { if (snap) snap.destroy(true); return null; }
      const m = new P.Matrix();
      m.set(1, 0, 0, 1, ox, oy);
      const box = new P.Container();
      let ok = true;
      try {
        renderer.render(body, { renderTexture: snap, clear: true, transform: m });
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2, sp = new P.Sprite(snap);
          sp.position.set(Math.cos(a) * line, Math.sin(a) * line);
          box.addChild(sp);
        }
        const fill = new P.Sprite(P.Texture.WHITE);
        fill.width = w; fill.height = h; fill.tint = HOME_MARK.outline;
        fill.blendMode = P.BLEND_MODES.SRC_IN;
        box.addChild(fill);
        const grey = new P.Sprite(snap);
        grey.tint = HOME_MARK.tint;
        box.addChild(grey);
        renderer.render(box, { renderTexture: out, clear: true });
      } catch { ok = false; }
      box.destroy({ children: true, texture: false });
      snap.destroy(true);
      if (!ok) { out.destroy(true); return null; }
      return new HomeMark(P, out, ox / w, oy / h, at, s, layer);
    } finally {
      body.rotation = rot; body.alpha = alpha;
    }
  }

  /**
   * @param {typeof PIXI} P PIXI @param {PIXI.Texture} texture the mark's picture @param {number} ax @param {number} ay its
   * anchor @param {{ x: number, y: number, z: number }} at @param {number} s @param {PIXI.Container} layer
   */
  constructor(P, texture, ax, ay, at, s, layer) {
    this.texture = texture;
    this.at = { x: at.x, y: at.y, z: at.z };
    this.s = s;                   // px per tile the picture was drawn at
    this.p = { x: 0, y: 0, s: 0, depth: 0 };
    this.sprite = new P.Sprite(texture);
    this.sprite.anchor.set(ax, ay);
    layer.addChild(this.sprite);
  }

  /**
   * The frame's place: on its world point, scaled with the camera, turned by its lean; `depth` = its zIndex.
   * @param {Camera} cam @param {number} depth
   */
  place(cam, depth) {
    const a = this.at, p = cam.project(a.x, a.y, a.z, this.p);
    const sp = this.sprite;
    sp.position.set(p.x, p.y);
    sp.scale.set(p.s / this.s);
    sp.rotation = cam.lean || 0;   // drawn upright: it stands turned with the board as the body does
    sp.zIndex = depth;
  }

  destroy() {
    if (!this.sprite) return;
    this.sprite.destroy();
    this.sprite = null;
    try { this.texture.destroy(true); } catch { /* ignore */ }
    this.texture = null;
  }
}
