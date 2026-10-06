// render/fxgame.js — the official battle effects in the game's battle view (local patch, docs/LOCAL-PATCH.md).
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
// is two transparent canvases (pointer-events none) — the looping skill buffs under the units canvas (the operator on
// top; above it on the 2D board, whose backdrop is opaque), everything else over it — each drawn only while one of its
// effects is alive, at most
// at device pixel ratio 1.5 (1 at 'medium'); quality 'low' turns the layer off. render/fxplayer.js caps particles and
// effects (MAX_INSTANCES, the oldest ends). The view's adaptive load level (render/app.js adaptLoad, as render/fx.js
// drops its extras at level ≥ 2): level 2 plays 'high' as 'medium', level 3 also skips the normal-attack effects.
// stats() → { live, loaded, updateMs, renderMs, calls, particles, notes } (view.stats().fxGame).
// 丰川祥子's notes (kits/diy.js, battle.fx 'oblvnsNote' born / track / free / hit / gone): each note is her client trail
// prefab (fxmap.js NOTE_FX) flown here between the sim's events — free flight on its heading (the 扩张正弦 weave drawn
// around it), tracing the target's view, the hit prefab on arrival (a piano note flies on 0.5 s); w = 2 draws two notes.
// While they play, her 'atk' arrow of render/fx.js is not drawn (the event's projectile kind is replaced); without the
// official effects (quality low, no WebP, no bundle, load level 3 for normal-attack notes) the arrow stays.

import { syncThreeCamera } from './projection.js';
import { fxBundleOf, effectsFor } from './fxmap.js';
import { noteEffects, NOTE_FLIGHT } from './fxmap.js';

const INDEX_URL = '/assets/local/fx/index.json';
const HIT_GAP_S = 0.12;        // one hit effect per attacker → target pair within this time (multi-hit skills)
const ATTACK_GAP_S = 0.2;
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
 * @param {{ host: HTMLElement, above: HTMLCanvasElement, quality: () => string, load?: () => number, under?: () => boolean }} o
 *   load: the view's adaptive load level 0–3 (render/app.js); under: whatever lies below the units canvas shows through
 *   it (the 3D board is on — the 2D board paints an opaque backdrop on the units canvas itself)
 */
export function createFxLayer({ host, above, quality, load = () => 0, under = () => false, rate = () => 1 }) {
  let index = null;
  if (typeof fetch === 'function') loadIndex().then((i) => { index = i; });
  let mod = null, loading = null, failed = false;
  let webp = null;   // the WebP probe's answer once known (the note layer decides synchronously)
  if (typeof Image !== 'undefined') webpOk().then((v) => { webp = v; });
  let camera = null, lib = null, size = null;
  // two canvases: a skill's looping buff effect under the units canvas, so the operator stays on top of it; every
  // other effect (skill start, attacks, hits, the moving 剑气 trail) over it. Without a see-through units canvas (2D
  // board) the lower one moves above too.
  const layers = { under: null, over: null };   // { canvas, renderer, scene, n: live count }
  const live = [];                   // { inst, view: followed view | null, owner: unit id, buff: boolean, layer }
  const lastAtk = new Map();         // target id → { src view, t }
  const lastHit = new Map();         // `${src}:${tgt}` → t
  const lastAttackFx = new Map();    // src id → t
  const movers = new Map();          // caster id → { inst, at, t } — effects carried along a kit's moving fx
  const notes = new Map();           // 丰川祥子's notes: sim note id → { pos, dx, dy, mode, state, … } (noteFx)
  let clockS = 0;
  let lastViews = null;               // the views map of the last event (the notes trace their targets' views)
  const perf = { updateMs: 0, renderMs: 0, calls: 0 };

  const level = () => { try { return load() || 0; } catch { return 0; } };
  const q = () => {
    const v = quality();
    if (v === 'low') return 'low';
    return v === 'medium' || level() >= 2 ? 'medium' : 'high';
  };
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
      const make = (before, z) => {
        const canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'none', pointerEvents: 'none', zIndex: z });
        host.insertBefore(canvas, before);
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
        renderer.setClearColor(0x000000, 0);
        return { canvas, renderer, scene: new THREE.Scene(), n: 0 };
      };
      // under: z 1 like the units canvas and before it in the DOM (above the 3D board's z 0)
      layers.under = make(above, '1');
      layers.over = make(above.nextSibling, '2');
      camera = new THREE.PerspectiveCamera();
      size = new THREE.Vector2();
      lib = new fxp.FxLibrary('/assets/local/fx/');
      mod = { THREE, fxp };
    }).catch((err) => { failed = true; console.warn('[fx] official effects unavailable', err); });
    await loading;
    return !!mod;
  }

  // units that left the field: an effect bound to one (buff / one-shot on it) whose file finished loading after its
  // 'die' would never be stopped — a 棋子 placed and used up in the same tick kept its looping cross for good
  const gone = new Set();
  function addLive(inst, entry, layer) {
    if (entry.owner != null && gone.has(entry.owner) && (entry.buff || entry.onCaster)) { inst.dispose(); return; }
    layer.scene.add(inst.object);
    layer.n++;
    live.push({ inst, ...entry, layer });
  }
  function dropLive(l) { l.inst.dispose(); l.layer.n--; }
  /** A layer's canvas is shown only while it has a live effect; the lower one sits above the units on the 2D board. */
  function showLayers() {
    let below = false;
    try { below = !!under(); } catch { /* keep it above */ }
    const z = below ? '1' : '2';
    if (layers.under.canvas.style.zIndex !== z) layers.under.canvas.style.zIndex = z;
    for (const L of [layers.under, layers.over]) {
      const d = L.n ? 'block' : 'none';
      if (L.canvas.style.display !== d) L.canvas.style.display = d;
    }
  }

  async function play(view, kind, skillIndex = 0, { at = null, buff = false } = {}) {
    const b = bundleOf(view);
    if (!b) return;
    const names = effectsFor(b.prefabs, kind, skillIndex);
    if (!names.length || !(await ensure())) return;
    for (const n of names) {
      const def = await lib.load(b.bundle, n);
      if (!mod) return;   // destroyed while the file loaded (the view left the battle)
      if (!def) continue;
      const anchor = at || view;
      const inst = new mod.fxp.FxInstance(def, { quality: q(), facing: (view.visFacing ?? view.facing ?? 1) < 0 ? -1 : 1 });
      inst.object.position.set(anchor.x, anchor.y, anchor.z || 0);
      // a one-shot on the caster (not a hit on a target) ends with its prefab's duration even if a system loops —
      // 望's S3 wang_skill_03_range_start (looping 'line1/2', the range cross) stayed on the board for good
      const until = buff ? null : clockS + (def.duration || 3) + 0.5;
      addLive(inst, { view: anchor, owner: view.id ?? view.info?.id, buff, onCaster: !at, until }, buff ? layers.under : layers.over);
      // the player's own cap: it has already ended the oldest (done, dispose is a no-op) — the same one here
      while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
    }
  }

  function stopBuffs(ownerId, now = false) {
    for (const l of live) if (l.buff && l.owner === ownerId) l.inst.stop(now);
  }
  /** The unit left the field (knocked out / withdrawn): its buffs and the one-shots on it end; hits it made on targets play on. */
  function stopOwned(ownerId) {
    for (const l of live) if (l.owner === ownerId && (l.buff || l.onCaster)) l.inst.stop(true);
  }

  // the trail's 'rotation_z' node is the client's heading pivot: the dragon's head points along +x at 0° (the prefab's
  // own 90° = UP); board x = column, y = row (UP = +row). Re-aimed on every 'fx' step, so it turns with the 剑气 at walls
  const MOVER_DEG = { RIGHT: 0, UP: 90, LEFT: 180, DOWN: 270 };
  function aimMover(inst, dir) {
    const deg = MOVER_DEG[dir];
    const pivot = deg != null && inst.nodes?.find((o) => o && o.name === 'rotation_z');
    if (pivot) pivot.rotation.set(0, 0, (deg * Math.PI) / 180);
  }

  // 望's 棋子 (kits/diy.js): its effects are the token's own (pkgrps/btl_pfb_fx_token_3.ab → bundle wang_token).
  // 'zone' with the stone token = it went off (skill 1 取势 / 2 连星 along its link axes / 3 the x-1 diamond);
  // 'wangLink' = it activated (the golden cross, once); 'summon' of a stone = placed. The ground marks (the stone's own
  // looping cross, the link line) go on the lower layer, under the stone's model; the explosions over it. [ASSUMED] which prefab is which,
  // by name; S2's line blast is turned by its 'rotation_z' pivot (h = 0°, v = 90°).
  const STONE = 'token_10064_wang_stone1', STONE_FX = 'wang_token';
  const STONE_HIT = {
    1: ['token_wang_skill_01_hit'],
    2: ['token_wang_skill_02_hit', 'token_wang_skill_02_hit_02'],
    3: ['token_wang_skill_03_hit', 'token_wang_skill_03_hit_02', 'token_wang_skill_03_hit_03'],
  };
  // owner: a stone's id — the effect follows it as a buff and stops on its 'die' (used up / withdrawn); without an
  // owner it is a one-shot, stopped after its prefab's duration even if a system loops (token_wang_birth_01_buff's
  // looping 'sz' kept its cross on the board forever)
  async function playAt(names, at, { deg = null, owner = null, under = false } = {}) {
    const prefabs = index?.bundles?.[STONE_FX];
    if (!prefabs || !(await ensure())) return;
    for (const n of names) {
      if (!prefabs.includes(n)) continue;
      const def = await lib.load(STONE_FX, n);
      if (!mod) return;   // destroyed while the file loaded
      if (!def) continue;
      const inst = new mod.fxp.FxInstance(def, { quality: q() });
      if (deg != null) { const p = inst.nodes?.find((o) => o && o.name === 'rotation_z'); if (p) p.rotation.set(0, 0, (deg * Math.PI) / 180); }
      inst.object.position.set(at.x, at.y, at.z || 0);
      const until = owner == null ? clockS + (def.duration || 3) + 0.5 : Infinity;
      addLive(inst, { view: owner == null ? null : at, owner, buff: owner != null, until }, under ? layers.under : layers.over);
      while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
    }
  }
  function stoneFx(e, views) {
    const o = e[4];
    if (!o || typeof o !== 'object') return false;
    const at = { x: Number(e[2]), y: Number(e[3]), z: 0 };
    if (e[1] === 'zone' && o.token === STONE) {
      const names = STONE_HIT[o.skill] || STONE_HIT[1];
      if (o.skill === 2) {
        const [hit, ...rest] = names;
        const axes = Array.isArray(o.axes) && o.axes.length ? o.axes : ['h'];
        for (const a of axes) playAt([hit], at, { deg: a === 'v' ? 90 : 0 });
        playAt(rest, at);
      } else playAt(names, at);
      return true;
    }
    if (e[1] === 'wangLink') { if (o.first) playAt(['token_wang_passive_01_line'], at, { under: true }); return true; }
    if (e[1] === 'summon') {
      const v = views.get(o.id);
      if (v?.info && (v.info.defId === STONE || v.info.spine === STONE)) { playAt(['token_wang_birth_01_buff'], v, { owner: o.id, under: true }); return true; }
    }
    return false;
  }

  // ---- 丰川祥子's notes (see the header) ----
  const NOTE_Z = 0.35;           // flight height over the ground (tiles)
  const gameRate = () => { try { const r = Number(rate()); return r > 0 ? r : 1; } catch { return 1; } };
  /**
   * Whether her notes play as official effects now — decided as the events come, so the arrow can step aside; under
   * load level 3 only while a skill runs (S1's notes count as one), like the normal-attack effects.
   */
  const notesOn = (src, skill = false) => !!(index && q() !== 'low' && !failed && webp === true && bundleOf(src)
    && !noteBroken.has(bundleOf(src).bundle) && (skill || src._fxSkillOn || level() < 3));
  // bundles whose note trail failed to load: her attacks fall back to render/fx.js's arrow and hit effect (review
  // 2026-10-06: the arrow was dropped before anything knew the trail could load — her attacks went invisible)
  const noteBroken = new Set();
  // 'atk' events whose arrow her note replaces (app.js asks arrowKind; the event tuple itself is left as it came)
  const noteAtks = new WeakSet();
  // sim fx events drawn here with an official effect (赤刃明霄陈 S3 剑气): render/fx.js skips its 2D stand-in
  const ownFx = new WeakSet();
  async function startNote(rec, src) {
    const b = bundleOf(src);
    const fx = noteEffects(rec.mode, rec.fan);
    if (!b || !fx || !b.prefabs.includes(fx.trail)) { if (b) noteBroken.add(b.bundle); return; }
    if (!(await ensure())) return;
    const def = await lib.load(b.bundle, fx.trail);
    if (!def) noteBroken.add(b.bundle);
    if (!def || !mod || rec.ended) return;
    for (const c of rec.copies) {
      const inst = new mod.fxp.FxInstance(def, { quality: q() });
      inst.object.position.set(c.pos.x, c.pos.y, c.pos.z);
      c.inst = inst;
      addLive(inst, { view: c.pos, owner: rec.owner, buff: false, game: true }, layers.over);
      while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
    }
  }
  function endNote(rec) {
    rec.ended = true;
    for (const c of rec.copies) c.inst?.stop();
    notes.delete(rec.id);
  }
  function noteFx(e, views) {
    const o = e[4];
    const src = views.get(o.id);
    let rec = notes.get(o.n);
    const x = Number(e[2]), y = Number(e[3]);
    const head = (Number(o.a) || 0) * Math.PI / 180;
    if (o.e === 'born') {
      if (rec || !src || !notesOn(src, o.m === 's1')) return;
      const w = Math.max(1, Math.min(2, Number(o.w) || 1));
      rec = { id: o.n, owner: o.id, mode: o.m, fan: Number(o.i) || 0, x, y, z: (src.z || 0) + NOTE_Z, dx: Math.cos(head), dy: Math.sin(head),
        state: 'free', tgt: o.t ?? null, age: 0, weave: 1, pass: 0, ended: false,
        copies: Array.from({ length: w }, (_, k) => ({ pos: { x, y, z: (src.z || 0) + NOTE_Z }, sign: k ? -1 : 1, inst: null })) };
      notes.set(o.n, rec);
      startNote(rec, src);
      return;
    }
    if (!rec) return;
    rec.x = x; rec.y = y;   // the sim's position at the change
    if (o.e === 'track') { rec.state = 'track'; rec.tgt = o.t ?? null; return; }
    if (o.e === 'free') { rec.state = 'free'; rec.tgt = null; rec.dx = Math.cos(head); rec.dy = Math.sin(head); return; }
    if (o.e === 'hit') {
      const fx = noteEffects(rec.mode, rec.fan), b = src && bundleOf(src);
      const tgt = o.t != null ? views.get(o.t) : null;
      if (fx && b && b.prefabs.includes(fx.hit)) playNoteHit(b.bundle, fx.hit, tgt || { x, y, z: rec.z - NOTE_Z });
      const pass = NOTE_FLIGHT[rec.mode]?.pass;
      if (pass) { rec.state = 'pass'; rec.pass = pass.time; rec.tgt = null; return; }   // the piano note flies on through
    }
    endNote(rec);
  }
  async function playNoteHit(bundle, name, at) {
    if (!(await ensure())) return;
    const def = await lib.load(bundle, name);
    if (!def || !mod) return;
    const inst = new mod.fxp.FxInstance(def, { quality: q() });
    inst.object.position.set(at.x, at.y, at.z || 0);
    addLive(inst, { view: null, owner: null, buff: false, game: true, until: clockS + (def.duration || 2) + 0.5 }, layers.over);
    while (live.length > mod.fxp.MAX_INSTANCES) dropLive(live.shift());
  }
  /** Fly the notes one frame (game time: the battle clock's rate). */
  function stepNotes(dt, views) {
    if (!notes.size) return;
    const g = dt * gameRate();
    for (const rec of notes.values()) {
      const f = NOTE_FLIGHT[rec.mode] || NOTE_FLIGHT.base;
      rec.age += g;
      let speed = f.free;
      if (rec.state === 'pass') {
        speed = f.pass?.speed || f.track;
        if ((rec.pass -= g) <= 0) { endNote(rec); continue; }
      } else if (rec.state === 'track') {
        speed = f.track;
        const t = rec.tgt != null ? views?.get(rec.tgt) : null;
        if (t && t.alive !== false) {
          const tx = t.x - rec.x, ty = t.y - rec.y, d = Math.hypot(tx, ty);
          if (d <= speed * g) { speed = 0; rec.x = t.x; rec.y = t.y; }   // there: waits for the sim's hit
          else if (d > 1e-6) {
            const k = Math.min(1, f.turn * g);
            const ndx = rec.dx + (tx / d - rec.dx) * k, ndy = rec.dy + (ty / d - rec.dy) * k, l = Math.hypot(ndx, ndy) || 1;
            rec.dx = ndx / l; rec.dy = ndy / l;
          }
          rec.z += ((t.z || 0) + NOTE_Z - rec.z) * Math.min(1, 4 * g);
        }
      }
      rec.x += rec.dx * speed * g; rec.y += rec.dy * speed * g;
      // the free flight's 扩张正弦: a sideways weave growing with the flight, gone while tracing [ASSUMED shape:
      // 3 waves per second, amplitude up to `sine` after 0.6 s]
      rec.weave += ((rec.state === 'free' ? 1 : 0) - rec.weave) * Math.min(1, 5 * g);
      const amp = (f.sine || 0) * Math.min(1, rec.age / 0.6) * rec.weave;
      const side = amp * Math.sin(rec.age * Math.PI * 2 * 1.5);
      for (const c of rec.copies) {
        const s = side * c.sign + (rec.copies.length > 1 ? c.sign * 0.08 : 0);
        c.pos.x = rec.x - rec.dy * s; c.pos.y = rec.y + rec.dx * s; c.pos.z = rec.z;
      }
      if (rec.age > 60 || rec.copies.every((c) => c.inst && c.inst.done)) endNote(rec);   // a lost event (the sim's NOTE_SAFETY) / the player's cap
    }
  }

  const isOp = (v) => v && v.info && v.info.side !== 'enemy';
  const skillIdx = (v) => (Number.isInteger(v?.info?.skillIndex) ? v.info.skillIndex : 0);

  return {
    /** The projectile kind render/fx.js should draw for an 'atk' event (her note replaces the arrow: 'oblvnsNote'). */
    arrowKind(e) { return noteAtks.has(e) ? 'oblvnsNote' : e[3]; },
    /** Whether a 'fx' event is drawn here with its official effect (render/fx.js then skips its 2D stand-in). */
    ownsFx(e) { return ownFx.has(e); },
    /** A battle event render/app.js handled (the views map resolves unit ids). */
    onEvent(e, views) {
      lastViews = views;
      if (Array.isArray(e)) {
        if (e[0] === 'die') gone.add(e[1]);
        else if (e[0] === 'deploy') gone.delete(e[1]);
        else if (e[0] === 'spawn') gone.delete(e[1]?.id ?? e[1]);
        else if (e[0] === 'fx' && e[1] === 'summon' && e[4]) gone.delete(e[4].id);
      }
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
          // 丰川祥子: her note (the 'oblvnsNote' born event of this attack) replaces render/fx.js's arrow
          if (tgt && fxBundleOf(src.info.spine || src.info.defId) === 'oblvns' && notesOn(src)) noteAtks.add(e);
          if (tgt) lastAtk.set(tgt.id ?? tgt.info?.id, { src, t: clockS });
          const sid = src.id ?? src.info.id;
          if (level() >= 3) return;   // the busiest effects go first under load
          if (!src._fxSkillOn && clockS - (lastAttackFx.get(sid) ?? -9) >= ATTACK_GAP_S) { lastAttackFx.set(sid, clockS); play(src, 'attackStart'); }
          return;
        }
        case 'dmg': {
          const tid = e[1];
          const a = lastAtk.get(tid);
          if (!a || clockS - a.t > 2.5) return;
          const tgt = views.get(tid);
          if (!tgt) return;
          if (!a.src._fxSkillOn && level() >= 3) return;
          if (fxBundleOf(a.src.info?.spine || a.src.info?.defId) === 'oblvns' && notesOn(a.src, true)) return;   // her notes hit on their own
          const key = `${a.src.id ?? a.src.info?.id}:${tid}`;
          if (clockS - (lastHit.get(key) ?? -9) < HIT_GAP_S) return;
          lastHit.set(key, clockS);
          play(a.src, a.src._fxSkillOn ? 'skillHit' : 'attackHit', skillIdx(a.src), { at: tgt });
          return;
        }
        case 'fx': { // a kit's moving effect: 赤刃明霄陈 S3 剑气 (kits/diy.js) carries her official trail along its path
          if (stoneFx(e, views)) return;
          if (e[1] === 'oblvnsNote' && e[4]) { noteFx(e, views); return; }
          if (e[1] !== 'chen3Qi' || !e[4]) return;
          const src = views.get(e[4].id);
          if (!src || !bundleOf(src) || failed) return;
          ownFx.add(e);
          const mv = movers.get(e[4].id);
          const at = { x: Number(e[2]), y: Number(e[3]), z: 0.3 };
          if (mv && mv.inst && !mv.inst.done) { mv.at.x = at.x; mv.at.y = at.y; mv.t = clockS; aimMover(mv.inst, e[4].dir); return; }
          const names = effectsFor(bundleOf(src).prefabs, 'skillTrail', 2);
          if (!names.length || movers.has(e[4].id)) return;
          movers.set(e[4].id, { pending: true });
          (async () => {
            if (!(await ensure())) { movers.delete(e[4].id); return; }
            const def = await lib.load(bundleOf(src).bundle, names[0]);
            if (!def || !mod) { movers.delete(e[4].id); return; }
            const inst = new mod.fxp.FxInstance(def, { quality: q() });   // turned by aimMover, not mirrored
            aimMover(inst, e[4].dir);
            inst.object.position.set(at.x, at.y, at.z);
            const m = { inst, at, t: clockS };
            movers.set(e[4].id, m);
            addLive(inst, { view: at, owner: e[4].id, buff: true, mover: true }, layers.over);
          })();
          return;
        }
        case 'die': stopOwned(e[1]); return;
        default:
      }
    },

    update(dt, cam, vp) {
      clockS += dt;
      stepNotes(dt, lastViews);   // the notes fly on while their trails load
      if (!mod) return;
      if (!live.length) { showLayers(); return; }
      const w = Math.max(1, vp.width | 0), h = Math.max(1, vp.height | 0);
      const pr = Math.min(globalThis.devicePixelRatio || 1, q() === 'medium' ? 1 : 1.5);
      for (const L of [layers.under, layers.over]) {
        if (!L.n) continue;
        if (L.renderer.getPixelRatio() !== pr) L.renderer.setPixelRatio(pr);
        const s = L.renderer.getSize(size);
        if (s.x !== w || s.y !== h) L.renderer.setSize(w, h, false);
      }
      syncThreeCamera(cam, camera, w, h, { near: Math.max(0.3, cam.dist * 0.08), far: cam.dist + 70 });
      const t0 = performance.now();
      for (const [id, m] of movers) {
        if (!m.inst) continue;
        // a mover the player ended (its cap) is replaced by the next 'fx' event instead of holding the slot 0.4 s
        if (m.inst.done || clockS - m.t > 0.4) { m.inst.stop(); movers.delete(id); } else if (m.inst.time > 1.5) m.inst.time = 0.4; // keep the trail running
      }
      const rate2 = gameRate();
      for (let i = live.length - 1; i >= 0; i--) {
        const l = live[i];
        if (l.view && l.view.alive !== false && !l.view.remove) l.inst.object.position.set(l.view.x, l.view.y, l.view.z || 0);
        if (l.until != null && clockS > l.until && !l.stopped) { l.stopped = true; l.inst.stop(); }
        l.inst.update(l.game ? dt * rate2 : dt);   // the notes run on the battle clock (their trails' length = speed × time)
        if (l.inst.done) { dropLive(l); live.splice(i, 1); }
      }
      showLayers();
      const t1 = performance.now();
      let calls = 0;
      for (const L of [layers.under, layers.over]) {
        if (!L.n) continue;
        L.renderer.render(L.scene, camera);
        calls += L.renderer.info.render.calls;
      }
      perf.updateMs = perf.updateMs * 0.9 + (t1 - t0) * 0.1;
      perf.renderMs = perf.renderMs * 0.9 + (performance.now() - t1) * 0.1;
      perf.calls = calls;
    },

    clear() {
      for (const l of live) dropLive(l);
      live.length = 0;
      lastAtk.clear(); lastHit.clear(); lastAttackFx.clear(); movers.clear(); notes.clear(); gone.clear();
      if (mod) showLayers();
    },

    destroy() {
      this.clear();
      for (const L of [layers.under, layers.over]) {
        try { L?.renderer.dispose(); } catch { /* ignore */ }
        L?.canvas.remove();
      }
      layers.under = layers.over = null;
      mod = null;
    },

    /** Per-frame averages (update = the players, render = the layer's draw), the last frame's draw calls, live particles. */
    stats() {
      return {
        live: live.length, loaded: !!mod, updateMs: Math.round(perf.updateMs * 100) / 100, renderMs: Math.round(perf.renderMs * 100) / 100,
        calls: perf.calls, particles: mod ? mod.fxp.fxStats().particles : 0, notes: notes.size,
      };
    },
  };
}
