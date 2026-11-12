// render/item-models.js — still snapshots of the equipment Spine models (render/units.js ItemView).
//
// The client builds every item as a trap character whose battle prefab draws one Spine model; each of the extracted
// models (tools/local-extract/extract.py item_spine_ids, data/assets.json itemSpines) has a single 0 s clip, the
// prefab's SkeletonAnimation `Default` (one model names it `animation`), so the model is a still pose. Instead of a
// live skeleton per hand item, each model is drawn ONCE into a cell of one shared render-texture page, and every item
// view showing it draws a Sprite of that cell — same-texture sprites, batched with the rest of the field (CONTRIBUTING
// "Per-frame rendering": nothing redrawn per frame, no per-unit Graphics / masks).
//
//   const models = new ItemModels(renderer, assets)
//   const ref = models.acquire(entry)       // entry = assets.itemSpine(trapId); null without one
//   ref.ready.then((snap) => …)             // snap = { texture, ax, ay, k } or null (load failed / page full)
//   models.release(ref)                     // once per acquire
//   models.outline(snap, color)             // the snapshot's outline texture (a held item left in its slot), or null
//   models.destroy()
//
// `snap.k` is the CSS px per tile the cell was drawn at (a sprite shows the model at `s` px per tile with scale s / k);
// `ax` / `ay` the anchor of the skeleton's origin (the feet) in the cell; `top` / `bottom` / `width` the model's box in
// it (fractions of the cell side). A cell nobody references stays cached until
// its space is needed (least recently released first), its skeleton data held through assets.spine.acquire. After a
// WebGL context loss the page's pixels are gone: every cached cell is drawn again on the restored context.

import { UNIT } from './style.js';

/** CSS px per tile a model is drawn at in its cell (the hand slot's model is ~0.4–1 tile; zoomed boards reach ~100). */
const REF_PX = 128;
/** Cell side, CSS px: a model larger than that at REF_PX is drawn smaller (its `k` says so). */
const CELL = 128;
/** Physical px per page side. */
const PAGE_PX = 2048;
/** Spare edge around a model in its cell, CSS px (linear filtering must not sample the neighbour). */
const PAD = 2;
/** Outline width, cell CSS px (≈ 2 screen px at a 1080p prep board: the official ring around a dragged item). */
const OUTLINE_PX = 2;

export class ItemModels {
  /**
   * @param {any} renderer PIXI renderer
   * @param {any} assets the render host's assets (assets.js: `spine.acquire / release`)
   */
  constructor(renderer, assets) {
    this.P = globalThis.PIXI;
    this.R = renderer;
    this.assets = assets;
    this.res = Math.max(1, Math.min(2, renderer?.resolution || 1));
    this.size = Math.floor(PAGE_PX / this.res);          // CSS px per page side
    this.cols = Math.max(1, Math.floor(this.size / CELL));
    this.rt = null;                                       // created with the first model
    this.cells = new Map();                               // entry → cell
    this.free = [];                                       // cell indexes never used or given back
    for (let i = this.cols * this.cols - 1; i >= 0; i--) this.free.push(i);
    this.idle = new Set();                                // cells with no reference, oldest release first
    this.stats = { cells: 0, drawn: 0, full: 0, failed: 0, shrunk: 0 };   // shrunk: models drawn under REF_PX to fit
    this.outlines = new Map();                            // snapshot texture → its outline's render texture
    this._ctx = { contextChange: () => this._redrawAll() };
    try { renderer?.runners?.contextChange?.add(this._ctx); } catch { /* no runner: no restore */ }
  }

  /** A reference to the snapshot of `entry` (null without an entry); `ready` resolves to the snapshot or null. */
  acquire(entry) {
    if (!entry || !this.assets?.spine) return null;
    let cell = this.cells.get(entry);
    if (!cell) {
      cell = { entry, refs: 0, index: -1, texture: null, snap: null, spine: null, data: null, gone: false };
      cell.ready = this._load(cell);
      this.cells.set(entry, cell);
      this.stats.cells = this.cells.size;
    }
    cell.refs++;
    this.idle.delete(cell);
    return { cell, ready: cell.ready };
  }

  /** Give back a reference of `acquire` (once each). */
  release(ref) {
    const cell = ref?.cell;
    if (!cell || ref.released) return;
    ref.released = true;
    if (--cell.refs > 0) return;
    if (cell.snap) this.idle.add(cell);          // kept until its space is needed
    else if (!cell.ready || cell.failed) this._drop(cell);
  }

  async _load(cell) {
    let data;
    try {
      data = await this.assets.spine.acquire(cell.entry);
    } catch {
      this.stats.failed++;
      cell.failed = true;
      if (cell.refs <= 0) this._drop(cell);
      return null;
    }
    if (cell.gone) { this._release(cell.entry); return null; }
    cell.data = data;
    try {
      const spine = new this.P.spine.Spine(data);
      spine.autoUpdate = false;
      const clip = (cell.entry.anims && typeof cell.entry.anims.idle === 'string' && cell.entry.anims.idle)
        || (data.animations && data.animations[0]?.name) || null;
      if (clip) { try { spine.state.setAnimation(0, clip, false); } catch { /* no such clip: the setup pose */ } }
      spine.update(0);
      cell.spine = spine;
    } catch (err) {
      console.warn('[render] item model build failed', err?.message || err);
      this.stats.failed++;
      cell.failed = true;
      this._release(cell.entry);
      cell.data = null;
      if (cell.refs <= 0) this._drop(cell);
      return null;
    }
    const index = this._cellIndex();
    if (index < 0) { this.stats.full++; cell.failed = true; this._dropSpine(cell); if (cell.refs <= 0) this._drop(cell); return null; }
    cell.index = index;
    cell.snap = this._draw(cell);
    if (!cell.snap) { this._free(cell); cell.failed = true; if (cell.refs <= 0) this._drop(cell); return null; }
    if (cell.refs <= 0) this.idle.add(cell);
    return cell.snap;
  }

  /** A free cell index: a never-used / given-back one, else the oldest idle cell's (that cell is dropped); -1 when full. */
  _cellIndex() {
    if (this.free.length) return this.free.pop();
    for (const old of this.idle) {
      this._drop(old);
      if (this.free.length) return this.free.pop();
    }
    return -1;
  }

  /** Draw `cell.spine` into its cell; the snapshot, or null when the page cannot be made. */
  _draw(cell) {
    const P = this.P;
    if (!this.rt) {
      try { this.rt = P.RenderTexture.create({ width: this.size, height: this.size, resolution: this.res }); } catch { return null; }
    }
    const sp = cell.spine;
    sp.scale.set(1);
    sp.position.set(0, 0);
    const b = sp.getLocalBounds();                      // skeleton units, y down (pixi-spine flips Spine's y)
    const w = Math.max(1, b.width), h = Math.max(1, b.height);
    const room = CELL - 2 * PAD;
    const k = Math.min(REF_PX, room / (w * UNIT.modelScale), room / (h * UNIT.modelScale));
    const sc = k * UNIT.modelScale;                     // CSS px per skeleton unit in the cell
    if (k < REF_PX && !cell.shrunk) { cell.shrunk = true; this.stats.shrunk++; }
    const cx = (cell.index % this.cols) * CELL, cy = Math.floor(cell.index / this.cols) * CELL;
    // the model's box centred in the cell horizontally, its bottom on the cell's bottom pad
    const ox = cx + (CELL - w * sc) / 2 - b.x * sc;
    const oy = cy + CELL - PAD - (b.y + h) * sc;
    sp.scale.set(sc);
    sp.position.set(ox, oy);
    const eraser = new P.Sprite(P.Texture.WHITE);
    eraser.blendMode = P.BLEND_MODES.ERASE;
    eraser.position.set(cx, cy);
    eraser.width = CELL; eraser.height = CELL;
    const batch = new P.Container();
    batch.addChild(eraser, sp);
    try {
      this.R.render(batch, { renderTexture: this.rt, clear: !this._cleared, skipUpdateTransform: false });
      this._cleared = true;
    } catch { batch.removeChildren(); eraser.destroy(); return null; }
    batch.removeChildren();
    eraser.destroy();
    batch.destroy();
    this.stats.drawn++;
    if (!cell.texture) cell.texture = new P.Texture(this.rt.baseTexture, new P.Rectangle(cx, cy, CELL, CELL));
    // the skeleton's origin in the cell, as a Sprite anchor
    return { texture: cell.texture, ax: (ox - cx) / CELL, ay: (oy - cy) / CELL, k,
      // the model's box in the cell (fractions of CELL): its top and bottom, its width
      top: (oy + b.y * sc - cy) / CELL, bottom: (CELL - PAD) / CELL, width: (w * sc) / CELL };
  }

  /**
   * The outline of a snapshot: its silhouette grown by OUTLINE_PX in `color` (the official prep screen rings an item
   * that is being dragged in its slot), a texture of the cell's size and anchor. Drawn once per model, the first time
   * one is dragged, into a small render texture of its own: the silhouette is the snapshot drawn at offsets around a
   * circle, then filled with the colour by a SRC_IN pass — no filter, nothing redrawn per frame.
   * @param {{ texture: any }|null} snap
   * @param {number} color 0xRRGGBB
   */
  outline(snap, color) {
    const P = this.P;
    if (!snap?.texture || !this.R) return null;
    const have = this.outlines.get(snap.texture);
    if (have) return have.rt;
    let rt;
    try { rt = P.RenderTexture.create({ width: CELL, height: CELL, resolution: this.res }); } catch { return null; }
    const o = { rt, texture: snap.texture, color };
    if (!this._drawOutline(o)) { rt.destroy(true); return null; }
    this.outlines.set(snap.texture, o);
    return rt;
  }

  _drawOutline(o) {
    const P = this.P;
    const box = new P.Container();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, sp = new P.Sprite(o.texture);
      sp.position.set(Math.cos(a) * OUTLINE_PX, Math.sin(a) * OUTLINE_PX);
      box.addChild(sp);
    }
    const fill = new P.Sprite(P.Texture.WHITE);
    fill.width = CELL; fill.height = CELL; fill.tint = o.color;
    fill.blendMode = P.BLEND_MODES.SRC_IN;
    box.addChild(fill);
    let ok = true;
    try { this.R.render(box, { renderTexture: o.rt, clear: true }); } catch { ok = false; }
    box.destroy({ children: true, texture: false });
    return ok;
  }

  _dropOutline(texture) {
    const o = this.outlines.get(texture);
    if (!o) return;
    this.outlines.delete(texture);
    try { o.rt.destroy(true); } catch { /* ignore */ }
  }

  _redrawAll() {
    if (!this.rt) return;
    this._cleared = false;
    for (const cell of this.cells.values()) if (cell.snap && cell.spine) this._draw(cell);
    for (const o of this.outlines.values()) this._drawOutline(o);
  }

  _release(entry) { try { this.assets.spine.release(entry); } catch { /* ignore */ } }

  _dropSpine(cell) {
    if (cell.spine) { try { cell.spine.destroy({ children: true }); } catch { /* ignore */ } cell.spine = null; }
    if (cell.data) { this._release(cell.entry); cell.data = null; }
  }

  _free(cell) {
    if (cell.index >= 0) { this.free.push(cell.index); cell.index = -1; }
  }

  _drop(cell) {
    if (cell.gone) return;
    cell.gone = true;
    this.idle.delete(cell);
    if (this.cells.get(cell.entry) === cell) this.cells.delete(cell.entry);
    this.stats.cells = this.cells.size;
    this._dropSpine(cell);
    this._free(cell);
    if (cell.texture) {
      this._dropOutline(cell.texture);
      try { cell.texture.destroy(false); } catch { /* ignore */ }
      cell.texture = null;
    }
    cell.snap = null;
  }

  destroy() {
    for (const cell of [...this.cells.values()]) this._drop(cell);
    for (const t of [...this.outlines.keys()]) this._dropOutline(t);
    try { this.R?.runners?.contextChange?.remove(this._ctx); } catch { /* ignore */ }
    if (this.rt) { try { this.rt.destroy(true); } catch { /* ignore */ } this.rt = null; }
  }
}
