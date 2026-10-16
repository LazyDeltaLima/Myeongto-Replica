// public/js/gpu.js — what this browser draws WebGL with: the GPU (hardware acceleration) or a software renderer.
//
// A page cannot read the browser's "use graphics acceleration" setting; two signals stand in for it:
//   - `failIfMajorPerformanceCaveat`: a context asked with it is refused when the browser would draw on a software
//     renderer (acceleration off, a blocklisted GPU or driver, a remote desktop without a GPU);
//   - the renderer name (WEBGL_debug_renderer_info): SwiftShader (Chrome / Edge), llvmpipe / softpipe (Mesa),
//     Microsoft Basic Render Driver (WARP: Windows without a GPU driver) are software renderers.
// `probeGpu()` checks again on every call (the 3D board's retries); `gpuStatus()` is the page's first answer, kept for
// the bug report (diag.js) and the player's notice (ui/gpuNotice.js).

/** Renderer names of software rasterisers. */
export const SOFTWARE_RENDERER_RE = /SwiftShader|llvmpipe|softpipe|Basic Render Driver|\bsoftware\b/i;

function context(doc, type, attrs) {
  try {
    const c = doc.createElement('canvas');
    return c.getContext(type, attrs) || null;
  } catch { return null; }
}

function release(gl) {
  try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ignore */ }
}

function rendererName(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch { return null; }
}

/**
 * Probe WebGL now. `accel`: 'hardware' | 'software' (WebGL only without the GPU) | 'none' (no WebGL at all) |
 * 'unknown' (no document). `webgl2`: WebGL2 exists at all (hardware or not); `renderer`: the GPU's name, or null.
 * @param {any} [doc]
 * @returns {{ accel: 'hardware'|'software'|'none'|'unknown', webgl2: boolean, renderer: string|null }}
 */
export function probeGpu(doc = globalThis.document) {
  if (!doc?.createElement) return { accel: 'unknown', webgl2: false, renderer: null };
  const strict = { failIfMajorPerformanceCaveat: true };
  let fast = context(doc, 'webgl2', strict) || context(doc, 'webgl', strict);
  const any2 = fast && typeof fast.texStorage2D === 'function' ? fast : context(doc, 'webgl2');
  const any = fast || any2 || context(doc, 'webgl');
  const renderer = any ? rendererName(any) : null;
  if (fast && renderer && SOFTWARE_RENDERER_RE.test(renderer)) fast = null;
  const out = { accel: fast ? 'hardware' : any ? 'software' : 'none', webgl2: !!any2, renderer };
  for (const gl of new Set([fast, any2, any])) release(gl);
  return out;
}

let first = null;
/** The page's first probeGpu() answer (one probe per page). */
export function gpuStatus() {
  if (!first) first = probeGpu();
  return first;
}

/**
 * Why the 3D board found no usable WebGL2 (render/app.js, the report's `render:` line): the GPU draws in software, or
 * the browser has no WebGL2.
 */
export function webgl2Missing(doc = globalThis.document) {
  const g = probeGpu(doc);
  return g.accel === 'software' ? 'WebGL2 unavailable: software rendering'
    : g.accel === 'none' || !g.webgl2 ? 'WebGL2 unavailable: no WebGL2' : 'WebGL2 unavailable';
}
