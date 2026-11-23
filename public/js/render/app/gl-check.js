// public/js/render/app/gl-check.js — the bug report's check of what the field view's PIXI renderer uploads (reports
// #27·#28: canvas-sourced textures — bars, damage numbers, the impostor eraser — came up transparent on one phone).
// Run when a report is copied (diag.js renderStatus → view.uploadCheck), never per frame: it reads pixels back.

/**
 * Draw `Texture.WHITE` and a white canvas made now into a 2×1 render texture and read the alpha back: 255 / 255 = both
 * upload; `canvas 0` = an upload from a canvas comes up transparent even when the canvas is fresh (the GPU process),
 * `white 0` = the buffer white too. With it, the damage-number font pages (PIXI.BitmapFont, canvases drawn once):
 * how many are blank on the CPU side now (a 2D context lost and given back blank) and how many say isContextLost().
 * @param {any} P PIXI @param {any} renderer the view's PIXI renderer
 * @returns {{ lost?: boolean, white?: number, canvas?: number, error?: string, pages: number, blank: number, lostPages: number }}
 */
export function uploadCheck(P, renderer) {
  const out = { ...fontPages(P) };
  const gl = renderer?.gl;
  if (!gl || gl.isContextLost?.()) return { ...out, lost: true };
  const doc = globalThis.document;
  const c = doc.createElement('canvas');
  c.width = 2; c.height = 2;
  const g = c.getContext('2d');
  if (g) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 2, 2); }
  // not Texture.from: that caches the canvas by id
  const fresh = new P.Texture(new P.BaseTexture(c));
  const rt = P.RenderTexture.create({ width: 2, height: 1 });
  const box = new P.Container();
  const a = new P.Sprite(P.Texture.WHITE), b = new P.Sprite(fresh);
  a.width = a.height = b.width = b.height = 1;
  b.x = 1;
  box.addChild(a, b);
  try {
    renderer.render(box, { renderTexture: rt, clear: true });
    const px = renderer.extract.pixels(rt);
    return { ...out, white: px[3], canvas: px[7] };
  } catch (/** @type {any} */ err) {
    return { ...out, error: String(err?.message || err).slice(0, 80) };
  } finally {
    box.destroy({ children: true });
    fresh.destroy(true);
    rt.destroy(true);
  }
}

/** The bitmap font pages drawn from a canvas: how many, how many blank now, how many with a lost 2D context. @param {any} P */
export function fontPages(P) {
  let pages = 0, blank = 0, lostPages = 0;
  for (const font of Object.values(P?.BitmapFont?.available || {})) {
    for (const t of Object.values(/** @type {any} */ (font)?.pageTextures || {})) {
      const src = /** @type {any} */ (t)?.baseTexture?.resource?.source;
      if (!src || typeof src.getContext !== 'function') continue;
      pages++;
      try {
        const g = src.getContext('2d');
        if (g?.isContextLost?.()) { lostPages++; continue; }
        const d = g?.getImageData(0, 0, src.width, src.height)?.data;
        let any = false;
        if (d) for (let i = 3; i < d.length; i += 4) if (d[i]) { any = true; break; }
        if (!any) blank++;
      } catch { /* a tainted or odd canvas: not counted */ }
    }
  }
  return { pages, blank, lostPages };
}

/** The report's words for an uploadCheck result: `upload white 255 canvas 255, font pages 4 (0 blank)`. @param {any} r */
export function uploadCheckText(r) {
  if (!r) return null;
  const up = r.lost ? 'upload not checked: context lost' : r.error ? `upload check failed: ${r.error}` : `upload white ${r.white} canvas ${r.canvas}`;
  const fonts = r.pages ? `font pages ${r.pages} (${r.blank} blank${r.lostPages ? `, ${r.lostPages} context lost` : ''})` : null;
  return [up, fonts].filter(Boolean).join(', ');
}
