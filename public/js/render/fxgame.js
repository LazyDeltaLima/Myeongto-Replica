// render/fxgame.js — the official battle effects in the game's battle view (local NAS patch, docs/LOCAL-PATCH.md).
//
// render/app.js calls three hooks: onEvent(e, views) for every battle event it handles, update(dt, cam, vp) each frame,
// clear() when a battle ends. Effects play only for operators whose effect bundle was extracted from a local client
// (tools/local-extract/fx_extract.py → /assets/local/fx/index.json); everyone else keeps the procedural FX of
// render/fx.js, which also keep playing for these operators (damage numbers, projectiles, hit flashes).
//
// Event → effect (render/fxmap.js effectsFor, by the client's prefab names):
//   'skill' on   → <op>_skill_0N_start_* on the caster, <op>_skill_0N_buff_* looping on it until 'skill' off / death
//   'atk'        → <op>_attack_start_* on the attacker (normal attacks; skill attacks show the skill's hit)
//   'dmg'        → <op>_attack_hit_01 / <op>_skill_0N_hit_01 on the target of that attacker's last attack (≤ HIT_GAP_S)
// Effects follow their unit's rendered position and facing.
//
// Cost: nothing is loaded (three.js, the player, the files) until an operator with an extracted bundle acts; the layer
// is its own transparent canvas above the units (pointer-events none), drawn only while an effect is alive, at most
// at device pixel ratio 1.5 (1 at 'medium'); quality 'low' turns the layer off. render/fxplayer.js caps particles.

import { syncThreeCamera } from './projection.js';
import { fxBundleOf, effectsFor } from './fxmap.js';

const INDEX_URL = '/assets/local/fx/index.json';
const HIT_GAP_S = 0.12;        // one hit effect per attacker → target pair within this time (multi-hit skills)
const ATTACK_GAP_S = 0.2;
const MAX_LIVE = 32;
let webpPromise = null;
/** Whether the browser decodes (lossy + alpha) WebP — a 1×1 probe image. */
const webpOk = () => (webpPromise ||= new Promise((resolve) => {
  if (typeof Image === 'undefined') { resolve(false); return; }
  const img = new Image();
  img.onload = () => resolve(img.width === 1);
  img.onerror = () => resolve(false);
  img.src = 'data:image/webp;base64,UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAARBxAR/Q9ERP8DAABWUDggGAAAABQBAJ0BKgEAAQAAAP4AAA3AAP7mtQAAAA==';
}));
let indexPromise = null;
const loadIndex = () => (indexPromise ||= fetch(INDEX_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null));

/**
 * @param {{ host: HTMLElement, above: HTMLCanvasElement, quality: () => string }} o
 */
export function createFxLayer({ host, above, quality }) {
  let index = null;
  if (typeof fetch === 'function') loadIndex().then((i) => { index = i; });
  let mod = null, loading = null, failed = false;
  let renderer = null, scene = null, camera = null, canvas = null, lib = null;
  const live = [];                   // { inst, view: followed view | null, owner: unit id, buff: boolean }
  const lastAtk = new Map();         // target id → { src view, t }
  const lastHit = new Map();         // `${src}:${tgt}` → t
  const lastAttackFx = new Map();    // src id → t
  const movers = new Map();          // caster id → { inst, at, t } — effects carried along a kit's moving fx
  let clockS = 0;

  const q = () => { const v = quality(); return v === 'low' ? 'low' : v === 'medium' ? 'medium' : 'high'; };
  const bundleOf = (v) => {
    const id = v && v.info && (v.info.spine || v.info.defId);
    const b = id ? fxBundleOf(id) : null;
    return b && index && index.bundles && index.bundles[b] ? { bundle: b, prefabs: index.bundles[b] } : null;
  };

  async function ensure() {
    if (mod) return true;
    if (failed || q() === 'low') return false;
    // the extracted textures are WebP (tools/local-extract/fx_extract.py): a browser without it (iOS Safari < 14) keeps
    // the procedural FX
    if (!(await webpOk())) { failed = true; return false; }
    loading ||= Promise.all([import('../../vendor/three.module.js'), import('./fxplayer.js')]).then(([THREE, fxp]) => {
      canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'none', pointerEvents: 'none', zIndex: '2' });
      host.insertBefore(canvas, above.nextSibling);
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
      renderer.setClearColor(0x000000, 0);
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera();
      lib = new fxp.FxLibrary('/assets/local/fx/');
      mod = { THREE, fxp };
    }).catch((err) => { failed = true; console.warn('[fx] official effects unavailable', err); });
    await loading;
    return !!mod;
  }

  async function play(view, kind, skillIndex = 0, { at = null, buff = false } = {}) {
    const b = bundleOf(view);
    if (!b) return;
    const names = effectsFor(b.prefabs, kind, skillIndex);
    if (!names.length || !(await ensure())) return;
    for (const n of names) {
      const def = await lib.load(b.bundle, n);
      if (!def) continue;
      const anchor = at || view;
      const inst = new mod.fxp.FxInstance(def, { quality: q(), facing: (view.visFacing ?? view.facing ?? 1) < 0 ? -1 : 1 });
      inst.object.position.set(anchor.x, anchor.y, anchor.z || 0);
      scene.add(inst.object);
      live.push({ inst, view: anchor, owner: view.id ?? view.info?.id, buff });
      while (live.length > MAX_LIVE) { const old = live.shift(); old.inst.dispose(); }
    }
  }

  function stopBuffs(ownerId, now = false) {
    for (const l of live) if (l.buff && l.owner === ownerId) l.inst.stop(now);
  }

  const isOp = (v) => v && v.info && v.info.side !== 'enemy';
  const skillIdx = (v) => (Number.isInteger(v?.info?.skillIndex) ? v.info.skillIndex : 0);

  return {
    /** A battle event render/app.js handled (the views map resolves unit ids). */
    onEvent(e, views) {
      if (!index || q() === 'low' || !Array.isArray(e)) return;
      switch (e[0]) {
        case 'skill': {
          const v = views.get(e[1]);
          if (!isOp(v) || !bundleOf(v)) return;
          if (e[2]) { v._fxSkillOn = true; play(v, 'skillStart', skillIdx(v)); play(v, 'skillBuff', skillIdx(v), { buff: true }); }
          else { v._fxSkillOn = false; stopBuffs(v.id ?? v.info.id); }
          return;
        }
        case 'atk': {
          const src = views.get(e[1]);
          if (!isOp(src) || !bundleOf(src)) return;
          const tgt = views.get(e[2]);
          if (tgt) lastAtk.set(tgt.id ?? tgt.info?.id, { src, t: clockS });
          const sid = src.id ?? src.info.id;
          if (!src._fxSkillOn && clockS - (lastAttackFx.get(sid) ?? -9) >= ATTACK_GAP_S) { lastAttackFx.set(sid, clockS); play(src, 'attackStart'); }
          return;
        }
        case 'dmg': {
          const tid = e[1];
          const a = lastAtk.get(tid);
          if (!a || clockS - a.t > 2.5) return;
          const tgt = views.get(tid);
          if (!tgt) return;
          const key = `${a.src.id ?? a.src.info?.id}:${tid}`;
          if (clockS - (lastHit.get(key) ?? -9) < HIT_GAP_S) return;
          lastHit.set(key, clockS);
          play(a.src, a.src._fxSkillOn ? 'skillHit' : 'attackHit', skillIdx(a.src), { at: tgt });
          return;
        }
        case 'fx': { // a kit's moving effect: 赤刃明霄陈 S3 剑气 (kits/diy.js) carries her official trail along its path
          if (e[1] !== 'chen3Qi' || !e[4]) return;
          const src = views.get(e[4].id);
          if (!src || !bundleOf(src)) return;
          const mv = movers.get(e[4].id);
          const at = { x: Number(e[2]), y: Number(e[3]), z: 0.3 };
          if (mv && mv.inst && !mv.inst.done) { mv.at.x = at.x; mv.at.y = at.y; mv.t = clockS; return; }
          const names = effectsFor(bundleOf(src).prefabs, 'skillTrail', 2);
          if (!names.length || movers.has(e[4].id)) return;
          movers.set(e[4].id, { pending: true });
          (async () => {
            if (!(await ensure())) { movers.delete(e[4].id); return; }
            const def = await lib.load(bundleOf(src).bundle, names[0]);
            if (!def) { movers.delete(e[4].id); return; }
            const inst = new mod.fxp.FxInstance(def, { quality: q(), facing: e[4].dir === 'LEFT' ? -1 : 1 });
            inst.object.position.set(at.x, at.y, at.z);
            scene.add(inst.object);
            const m = { inst, at, t: clockS };
            movers.set(e[4].id, m);
            live.push({ inst, view: at, owner: e[4].id, buff: true, mover: true });
          })();
          return;
        }
        case 'die': stopBuffs(e[1], true); return;
        default:
      }
    },

    update(dt, cam, vp) {
      clockS += dt;
      if (!mod) return;
      if (!live.length) { if (canvas.style.display !== 'none') { canvas.style.display = 'none'; } return; }
      if (canvas.style.display === 'none') canvas.style.display = 'block';
      const w = Math.max(1, vp.width | 0), h = Math.max(1, vp.height | 0);
      const pr = Math.min(globalThis.devicePixelRatio || 1, q() === 'medium' ? 1 : 1.5);
      if (renderer.getPixelRatio() !== pr) renderer.setPixelRatio(pr);
      const s = renderer.getSize(new mod.THREE.Vector2());
      if (s.x !== w || s.y !== h) renderer.setSize(w, h, false);
      syncThreeCamera(cam, camera, w, h, { near: Math.max(0.3, cam.dist * 0.08), far: cam.dist + 70 });
      for (const [id, m] of movers) {
        if (!m.inst) continue;
        if (clockS - m.t > 0.4) { m.inst.stop(); movers.delete(id); } else if (m.inst.time > 1.5) m.inst.time = 0.4; // keep the trail running
      }
      for (let i = live.length - 1; i >= 0; i--) {
        const l = live[i];
        if (l.view && l.view.alive !== false && !l.view.remove) l.inst.object.position.set(l.view.x, l.view.y, l.view.z || 0);
        l.inst.update(dt);
        if (l.inst.done) { l.inst.dispose(); live.splice(i, 1); }
      }
      renderer.render(scene, camera);
    },

    clear() {
      for (const l of live) l.inst.dispose();
      live.length = 0;
      lastAtk.clear(); lastHit.clear(); lastAttackFx.clear(); movers.clear();
      if (canvas) canvas.style.display = 'none';
    },

    destroy() {
      this.clear();
      try { renderer?.dispose(); } catch { /* ignore */ }
      canvas?.remove();
      mod = null;
    },

    stats() { return { live: live.length, loaded: !!mod }; },
  };
}
