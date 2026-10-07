// Debug page sandbag arena (local patch, docs/LOCAL-PATCH.md): the game's own battle view (render/app.js — 3D board,
// Spine models, render/fx.js + the official effects of render/fxgame.js) on a 7×7 tile island with one operator and
// sandbag enemies, simulated in the page by the shared sim (/sim/) the way battle/runner.js runs a client-side battle,
// and heard through the game's audio manager (audio.js handleBattleEvents: attack / impact / skill / kit-hit sounds and
// the voice lines). Same event path as a match: what plays here is what plays in a battle.
//
//   const arena = await createArena(host, { onEvents(ev, gt), onRestart(battle) })
//   arena.start(cfg)        a new battle (cfg: js/debug/sandbag.js createSandbagBattle + `terrain`, `hurt()` = the
//                           injured-ally option, hurtOp every HURT.every s); the camera frames the island; a new terrain
//                           rebuilds the board
//   arena.setPaused(bool) · arena.setSpeed(x) (game speed: 1 = 30 ticks per second) · arena.stepOnce(seconds)
//   arena.op() / arena.bags() / arena.battle()     the live sim units (read-only use)
//   arena.fillSp() / arena.castNow()               the operator's skill charged / cast now
//   arena.playFx(key, unitId) · arena.showRange(on) · arena.setQuality(q) · arena.view · arena.stats()

import { createFieldView } from '../render/app.js';
import { data } from '../data.js';
import { assets } from '../assets.js';
import { audio, installAudio } from '../audio.js';
import { mergeDiyData } from '../../../shared/diy.js';
import { ARENA, SIM_DATA_FILES, HURT, arenaStage, createSandbagBattle, arenaOp, arenaBags, keepSandbags, reviveSandbags, hurtOp, fillSp, castNow, rangeTiles } from './sandbag.js';

const TICK = 1 / 30;
/** Data files the view reads (unit models / names, the board art manifest). */
const VIEW_FILES = ['chess', 'tokens', 'enemies', 'items', 'stages', 'bonds', 'assets', 'local'];
/** Camera padding (px) around the island. */
const PAD = Object.freeze({ top: 56, bottom: 24, left: 24, right: 24 });

/** The /sim/ modules + their data (a copy of battle/runner.js loadBrowserSim, which this page cannot import). */
async function loadSim() {
  const [battleM, simdata, support, dirM] = await Promise.all([
    import('/sim/Battle.js'), import('/sim/simdata.js'), import('/sim/content/support/index.js'), import('/sim/dir.js')]);
  const get = (n) => fetch(`/data/${n}.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const files = await Promise.all(SIM_DATA_FILES.map(get));
  const missing = SIM_DATA_FILES.filter((n, i) => !files[i]);
  if (missing.length) throw new Error(`simulation data unavailable: ${missing.join(', ')}`);
  const raw = Object.fromEntries(SIM_DATA_FILES.map((n, i) => [n, files[i]]));
  const merged = mergeDiyData({ chess: raw.chess, tokens: raw.tokens, diy: await get('diy') }); // the 甄选 picks, as the server
  raw.chess = merged.chess;
  raw.tokens = merged.tokens;
  simdata.setSimData(raw);
  if (typeof support.setGameData === 'function') support.setGameData(null);
  return { mods: { Battle: battleM.Battle, DataSource: simdata.DataSource, withUnitLoadouts: simdata.withUnitLoadouts }, ds: new simdata.DataSource(raw, null), rotateOffset: dirM.rotateOffset };
}

/** Sim content errors: kept for the status line, never thrown. */
function makeLogger(errors) {
  const keep = (...a) => { errors.push(a.map(String).join(' ')); if (errors.length > 50) errors.shift(); console.warn('[sim]', ...a); };
  return Object.freeze({ error: keep, warn: keep, info() {}, debug() {} });
}

export async function createArena(host, hooks = {}) {
  await data.loadAll(VIEW_FILES);
  assets.seed?.(data.get('assets'));
  assets.seedLocal?.(data.get('local'));
  installAudio({ getManifest: () => data.get('assets'), settings: { bgm: 0 } });
  const [sim, view] = await Promise.all([
    loadSim(),
    createFieldView(host, { data, assets, audio, settings: { quality: 'high', damageNumbers: true }, padding: () => PAD }),
  ]);

  // heard: the audio manager knows this battle's units — it drops every event (spawns too) until the first gesture
  // unlocks it, so the units on the field are handed over then (audio.setFieldUnits)
  let battle = null, cfg = null, stageId = null, runs = 0, nextHurt = 0, heard = false;
  let paused = false, speed = 1, acc = 0, last = 0, raf = 0, destroyed = false, range = false, rangeKey = '';
  const errors = [];
  const logger = makeLogger(errors);
  const perf = { frameMs: 0, ticks: 0 };

  /** Push the steps' events and a snapshot to the view and the audio (battle/runner.js emitFrame, one batch). */
  function emit() {
    const ev = battle.drainEvents() || [];
    if (reviveSandbags(battle, ev)) ev.push(...(battle.drainEvents() || []));
    const { t: gt, ...snap } = battle.snapshot();
    if (!heard && audio.unlocked) { heard = true; audio.setFieldUnits(battle.fieldMeta().units); }
    if (ev.length) {
      // the page's log first: the sounds the audio manager starts for these events are logged right after them
      try { hooks.onEvents?.(ev, gt); } catch (err) { console.warn('[arena] onEvents', err); }
      view.pushEvents({ t: 'b.ev', fieldId: battle.fieldId, gt, ev });
      audio.handleBattleEvents(ev);
    }
    view.pushSnapshot({ ...snap, t: 'b.snap', fieldId: battle.fieldId, gt });
    if (range) syncRange();
  }

  function steps(n) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      battle.step();
      keepSandbags(battle);
      if (battle.time >= nextHurt && cfg.hurt?.()) { hurtOp(battle); nextHurt = battle.time + HURT.every; }
    }
    perf.ticks += n;
    perf.frameMs = perf.frameMs * 0.9 + (performance.now() - t0) * 0.1;
  }

  function frame(now) {
    raf = 0;
    if (destroyed) return;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (battle && !paused) {
      acc += dt * speed;
      const n = Math.min(16, Math.floor(acc / TICK + 1e-9));
      if (n > 0) { acc -= n * TICK; steps(n); emit(); }
    }
    raf = requestAnimationFrame(frame);
  }

  function syncRange() {
    const u = arenaOp(battle);
    const tiles = u && u.alive ? rangeTiles(u, sim.rotateOffset) : [];
    const key = tiles.join(';');
    if (key === rangeKey) return;
    rangeKey = key;
    view.highlightTiles(tiles.length ? tiles : [], 'range');
  }

  function start(next) {
    cfg = { ...next };
    const stage = arenaStage(cfg.terrain, data.get('stages'));
    if (stage.id !== stageId) { view.setStage(stage); stageId = stage.id; }
    const fieldId = `debug#${++runs}`;
    battle = createSandbagBattle(sim.mods, sim.ds, { ...cfg, stage, fieldId, logger });
    const meta = battle.fieldMeta();
    view.enterBattle({ ...meta, fieldId, kind: 'normal', rect: { ...ARENA }, stageId: stage.id, live: true, local: true, speed, players: [] });
    view.setLocalFeed({ on: true, speed });
    view.setCamera('normal', { rect: { ...ARENA }, fit: true, instant: true, padding: PAD });
    audio.setFieldUnits(meta.units);
    heard = audio.unlocked;
    rangeKey = '';
    view.highlightTiles(null);
    acc = 0;
    nextHurt = 0;
    try { hooks.onRestart?.(battle); } catch (err) { console.warn('[arena] onRestart', err); }
    emit();
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    return battle;
  }

  const onResize = () => view.resize();
  window.addEventListener('resize', onResize);

  return {
    view,
    start,
    battle: () => battle,
    config: () => cfg,
    op: () => arenaOp(battle),
    bags: () => arenaBags(battle),
    errors,
    get paused() { return paused; },
    setPaused(v) {
      paused = !!v; acc = 0;
      // the sounds stop with the battle (a skill's loop would play on)
      try { if (audio.ctx) { if (paused) audio.ctx.suspend(); else audio.ctx.resume(); } } catch { /* ignore */ }
    },
    get speed() { return speed; },
    setSpeed(x) { speed = Number(x) > 0 ? Number(x) : 1; view.setLocalFeed({ on: true, speed }); },
    /** Run `seconds` of game time now (paused stepping). */
    stepOnce(seconds = 0.1) { if (!battle) return; steps(Math.max(1, Math.round(seconds / TICK))); emit(); },
    fillSp() { const ok = fillSp(arenaOp(battle)); if (ok) emit(); return ok; },
    castNow() { const ok = castNow(arenaOp(battle)); if (ok) emit(); return ok; },
    playFx(key, unitId) { return view.debugFx ? view.debugFx(key, unitId) : Promise.resolve(false); },
    showRange(on) { range = !!on; rangeKey = ''; if (range && battle) syncRange(); else view.highlightTiles(null); },
    setQuality(q) { view.setSettings({ quality: q }); },
    stats: () => ({ ...perf, view: view.stats ? view.stats() : null }),
    destroy() { destroyed = true; if (raf) cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); view.destroy(); },
  };
}
