// gpu.js (hardware or software WebGL) and its notice (ui/gpuNotice.js) and report line (diag.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probeGpu, webgl2Missing, SOFTWARE_RENDERER_RE } from '../../public/js/gpu.js';
import { gpuNoticeText, installGpuNotice } from '../../public/js/ui/gpuNotice.js';
import { buildDiagnostics } from '../../public/js/diag.js';

/**
 * A document whose canvases answer like a browser: `hw` = contexts with failIfMajorPerformanceCaveat succeed,
 * `gl2` / `gl1` = WebGL2 / WebGL exist at all, `name` = the unmasked renderer.
 */
function fakeDoc({ hw = true, gl2 = true, gl1 = true, name = 'ANGLE (NVIDIA GeForce RTX 3060)' } = {}) {
  const made = [];
  const gl = (two) => {
    const g = {
      lost: false,
      getExtension: (n) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 1 }
        : n === 'WEBGL_lose_context' ? { loseContext: () => { g.lost = true; } } : null),
      getParameter: (p) => (p === 1 ? name : 'WebKit WebGL'),
      RENDERER: 2,
    };
    if (two) g.texStorage2D = () => {};
    made.push(g);
    return g;
  };
  return {
    made,
    createElement: () => ({
      getContext(type, attrs) {
        if (attrs?.failIfMajorPerformanceCaveat && !hw) return null;
        if (type === 'webgl2') return gl2 ? gl(true) : null;
        if (type === 'webgl') return gl1 ? gl(false) : null;
        return null;
      },
    }),
  };
}

test('probeGpu: a GPU draws → hardware, and every probe context is released', () => {
  const doc = fakeDoc();
  assert.deepEqual(probeGpu(doc), { accel: 'hardware', webgl2: true, renderer: 'ANGLE (NVIDIA GeForce RTX 3060)' });
  assert.ok(doc.made.length > 0 && doc.made.every((g) => g.lost));
});

test('probeGpu: refused under the performance caveat → software (acceleration off / blocklisted GPU)', () => {
  const g = probeGpu(fakeDoc({ hw: false, name: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))' }));
  assert.equal(g.accel, 'software');
  assert.equal(g.webgl2, true);
  assert.equal(webgl2Missing(fakeDoc({ hw: false })), 'WebGL2 unavailable: software rendering');
});

test('probeGpu: a software renderer name counts as software even when the caveat lets it through', () => {
  assert.equal(probeGpu(fakeDoc({ name: 'llvmpipe (LLVM 15.0.7, 256 bits)' })).accel, 'software');
  assert.equal(probeGpu(fakeDoc({ name: 'Microsoft Basic Render Driver' })).accel, 'software');
  for (const n of ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Apple GPU', 'Adreno (TM) 650', 'Mali-G78']) {
    assert.ok(!SOFTWARE_RENDERER_RE.test(n), n);
  }
});

test('probeGpu: no WebGL2 / no WebGL at all', () => {
  const g = probeGpu(fakeDoc({ gl2: false }));
  assert.equal(g.accel, 'hardware');
  assert.equal(g.webgl2, false);
  assert.equal(webgl2Missing(fakeDoc({ gl2: false })), 'WebGL2 unavailable: no WebGL2');
  assert.deepEqual(probeGpu(fakeDoc({ gl2: false, gl1: false })), { accel: 'none', webgl2: false, renderer: null });
  assert.equal(probeGpu(null).accel, 'unknown');
});

test('gpuNoticeText: a notice for software and none only', () => {
  assert.equal(gpuNoticeText({ accel: 'hardware' }), null);
  assert.equal(gpuNoticeText({ accel: 'unknown' }), null);
  assert.match(gpuNoticeText({ accel: 'software' }), /硬件加速/);
  assert.match(gpuNoticeText({ accel: 'none' }), /WebGL/);
});

function fakeStore(state) {
  const subs = new Set();
  return {
    get: () => state,
    set(next) { state = next; for (const f of [...subs]) f(state); },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    subs,
  };
}

test('installGpuNotice: one toast, on entering the lobby, and none when the GPU draws', () => {
  const shown = [];
  const store = fakeStore({ session: { entered: false } });
  installGpuNotice({ store, status: () => ({ accel: 'software' }), show: (s) => shown.push(s) });
  assert.equal(shown.length, 0);
  store.set({ session: { entered: true } });
  store.set({ session: { entered: false } });
  store.set({ session: { entered: true } });
  assert.equal(shown.length, 1);
  assert.equal(store.subs.size, 0, 'unsubscribed after the notice');

  const quiet = [];
  installGpuNotice({ store: fakeStore({ session: { entered: true } }), status: () => ({ accel: 'hardware' }), show: (s) => quiet.push(s) });
  assert.equal(quiet.length, 0);
});

test('the report marks a software renderer on its gpu: line', () => {
  const base = { state: { connection: {} }, entries: [], now: 0, pageStart: 0, renderEvents: [], mounts: [], resources: [] };
  const soft = buildDiagnostics({ ...base, env: { gpu: 'SwiftShader', gpuAccel: 'software' } }).split('\n');
  assert.ok(soft.includes('gpu: SwiftShader | software rendering'));
  const hard = buildDiagnostics({ ...base, env: { gpu: 'ANGLE (Test GPU)', gpuAccel: 'hardware' } }).split('\n');
  assert.ok(hard.includes('gpu: ANGLE (Test GPU)'));
});
