// test/render/enemy-tile-warn.test.js — an enemy ability's area on the tiles (sim fx 'telegraph' with `tiles`, 2026-11-26,
// docs/rules/fx.md 「적 범위 공격의 경고 칸」): the official game lays no tile warning for it — the ability's own effects show the
// moment — so an enemy that binds the ability draws no stand-in red tile flash (render/fxgame.js etileWarn), and the effects of
// that moment no other event draws (帝国的甲胄's marker on its target, 阿利斯泰尔's 王权号令 shot start) play from it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer, TILE_WARN_SKILLS } from '../../public/js/render/fxgame.js';
import { fxEvent } from '../helpers/fxEvent.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const NAMES = ['vt_marker', 'vt_trail', 'li_start', 'li_lock', 'li_tstart', 'dk_hit', 'dk_range'];
const EMODES = {
  $fx: Object.fromEntries(NAMES.map((n) => [n, ['b', n]])),
  // 帝国的甲胄-like: Appear's empty shot puts a 5.8 s marker buff on its target
  enemy_vt: { modes: [{ name: 'Default', anim: ['Attack'] }], skills: { appear: { cast: ['vt_trail'], opt: { vt_trail: { s: 4, e: 3, o: 1 } }, hit: [],
    hitBuff: ['vt_marker'], hitBuffLife: { vt_marker: 5.8 }, proj: { key: 'p_vt_empty', mount: 2 }, anim: 'Skill_1' } } },
  // 阿利斯泰尔-like: equip's shot plays its start effect on its target
  enemy_li: { modes: [{ name: 'Default', anim: ['Attack'] }], skills: { equip: { cast: ['li_start'], opt: { li_start: { s: 2, e: 3, o: 0 } }, hit: ['li_lock'],
    proj: { key: 'p_li', mount: 2, targetStart: ['li_tstart'] }, anim: 'Skill_1' } } },
  // 腐败骑士-like hammer: its hits' range effects (drawn on the 'dmg' of the strike)
  enemy_dk: { modes: [{ name: 'Mode', anim: ['Attack'] }], skills: { chargeattack: { cast: [], opt: {}, hit: ['dk_hit', 'dk_range'] } } },
  // bound, but not that ability
  enemy_other: { modes: [{ name: 'Default', anim: ['Attack'] }], skills: { somethingelse: { cast: ['dk_hit'], opt: {}, hit: [] } } },
};
const files = {
  '/assets/local/fx/index.json': { bundles: { b: NAMES } },
  '/assets/local/fx/enemy-modes.json': EMODES,
};
globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });

const settle = () => new Promise((r) => setTimeout(r, 5));
const enemy = (id, defId) => ({ id, x: 6, y: 1, alive: true, info: { id, side: 'enemy', defId }, actor: { roles: { attack: { loop: 'Attack' } }, current: 'Move' } });
const ally = (id, x, y) => ({ id, x, y, alive: true, info: { id, side: 'ally', defId: 'char_x' } });

test('enemy tile area: bound ability → no stand-in tile flash; the marker / shot start of that moment on the unit there; unbound → the stand-in stays', async () => {
  const plays = [];
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => plays.push(p) });
  await settle();
  const views = new Map([[1, enemy(1, 'enemy_vt')], [2, enemy(2, 'enemy_li')], [3, enemy(3, 'enemy_dk')], [4, enemy(4, 'enemy_other')],
    [5, enemy(5, 'enemy_none')], [10, ally(10, 2, 3)], [11, ally(11, 4, 2)]]);
  layer.onEvent(['tick'], views);
  const spawned = () => plays.splice(0).filter((p) => p.kind === 'spawn');

  // 回忆里的誓死 on the highest-HP ally (10 at 2, 3): its marker held 5.8 s on that ally, no red 3×3
  const bar = fxEvent('telegraph', { x: 2, y: 3, r: 1, tiles: 'box', dur: 5.85, kind: 'barrage', id: 1 });
  layer.onEvent(bar, views);
  assert.equal(layer.ownsFx(bar), true, 'no stand-in tile flash for 回忆里的誓死');
  let got = spawned();
  const mk = got.find((p) => p.names[0] === 'vt_marker');
  assert.ok(mk && mk.on === 10 && mk.tag === 'debuff', `the Appear marker on its target: ${JSON.stringify(got)}`);

  // 王权号令 at the ally on (4, 2): the shot's start effect on it
  const dec = fxEvent('telegraph', { x: 4, y: 2, r: 1, kind: 'royalDecree', tiles: 'plus', id: 2 });
  layer.onEvent(dec, views);
  assert.equal(layer.ownsFx(dec), true, 'no stand-in tile flash for 王权号令');
  got = spawned();
  assert.ok(got.some((p) => p.names[0] === 'li_tstart' && p.on === 11), `its _effectsToTargetWhenStart on the target: ${JSON.stringify(got)}`);
  // … on the spot when nobody stands there
  const dec2 = fxEvent('telegraph', { x: 0, y: 0, r: 1, kind: 'royalDecree', tiles: 'plus', id: 2 });
  layer.onEvent(dec2, views);
  got = spawned();
  assert.ok(got.some((p) => p.names[0] === 'li_tstart' && Array.isArray(p.pt) && p.pt[0] === 0 && p.pt[1] === 0), `on the spot: ${JSON.stringify(got)}`);

  // 蓄力锤: its hits draw it; nothing more here, and no stand-in
  const ch = fxEvent('telegraph', { x: 4, y: 2, r: 1, dur: 3, kind: 'chargeAttack', tiles: 'plus', id: 3 });
  layer.onEvent(ch, views);
  assert.equal(layer.ownsFx(ch), true, 'no stand-in tile flash for 蓄力锤');
  assert.deepEqual(spawned().map((p) => p.names[0]), []);

  // the stand-in stays: an enemy without that ability, one without a binding, a telegraph without tiles
  for (const [id, kind, tiles] of [[4, 'chargeAttack', 'plus'], [5, 'chargeAttack', 'plus'], [1, 'barrage', undefined]]) {
    const ev = fxEvent('telegraph', { x: 2, y: 3, r: 1, kind, id, ...(tiles ? { tiles } : null) });
    layer.onEvent(ev, views);
    assert.equal(layer.ownsFx(ev), false, `stand-in kept: enemy ${id} ${kind} tiles=${tiles}`);
  }
});

/** Every sim 'telegraph' kind sent with `tiles` (server/sim/content), from the source. */
function simTileTelegraphs() {
  const out = new Map();
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.js')) {
        const src = readFileSync(p, 'utf8');
        for (const m of src.matchAll(/fx\('telegraph',\s*\{([^}]*)\}/g)) {
          if (!/\btiles:/.test(m[1])) continue;
          const k = /\bkind:\s*'(\w+)'/.exec(m[1]);
          assert.ok(k, `a tile telegraph without a literal kind in ${p}: ${m[0]}`);
          out.set(k[1], p.slice(ROOT.length + 1));
        }
      }
    }
  };
  walk(join(ROOT, 'server/sim/content'));
  return out;
}

test('every sim tile telegraph names its enemy ability for the render (TILE_WARN_SKILLS)', () => {
  const kinds = simTileTelegraphs();
  assert.ok(kinds.has('chargeAttack') && kinds.size >= 6, `the sweep found the known kinds: ${[...kinds.keys()]}`);
  for (const [k, file] of kinds) {
    assert.ok(TILE_WARN_SKILLS[k], `sim fx 'telegraph' kind '${k}' (${file}) sends \`tiles\` but render/fxgame.js TILE_WARN_SKILLS does not name `
      + 'its enemy ability: the screen draws the red stand-in tile flash the official game does not have. Add the ability (enemy-modes.json '
      + 'skills key) — docs/rules/fx.md 「적 범위 공격의 경고 칸」');
  }
});

const REAL = join(ROOT, 'public/assets/local/fx/enemy-modes.json');
test('the enemies that send them bind those abilities with extracted effects (enemy-modes.json)', { skip: !existsSync(REAL) && 'no extracted effects' }, () => {
  const em = JSON.parse(readFileSync(REAL, 'utf8'));
  const CASES = { barrage: 'enemy_10027_vtsk', royalDecree: 'enemy_9032_aclionk', driftSand: 'enemy_1509_mousek', xiCross: 'enemy_1517_xi',
    chargeAttack: 'enemy_1513_dekght', blastArrow: 'enemy_1513_dekght_2' };
  for (const [kind, ab] of Object.entries(TILE_WARN_SKILLS)) {
    const id = /** @type {string} */ (CASES[kind]);
    assert.ok(id, `a known enemy for '${kind}'`);
    const part = em[id]?.skills?.[String(ab).toLowerCase()];
    assert.ok(part, `${id} binds '${ab}' (TILE_WARN_SKILLS.${kind})`);
    const names = [...(part.cast || []), ...(part.hit || []), ...(part.hitBuff || []), ...(part.proj?.targetStart || [])];
    assert.ok(names.some((n) => em.$fx[String(n).toLowerCase()]), `${id} '${ab}' has an extracted effect: ${names}`);
  }
});
