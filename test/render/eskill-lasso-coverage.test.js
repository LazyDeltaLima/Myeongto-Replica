// test/render/eskill-lasso-coverage.test.js — every enemy ability whose official projectile is a link with a line effect
// (LassoProjectile / HarpoonMovement + a renderer `_mainEffect`, read from the client prefabs into
// tools/assets/local-enemy-bindings.json by tools/local-extract/enemy_bindings.py) is drawn by the view or listed with why
// in test/render/eskill-lasso-list.js (2026-11-14, docs/rules/fx.md 「적 채널 스킬의 줄 투사체」). 节日爵士乐手's 狂欢式演奏 was
// such a line the view drew as the sim's stand-in beam (maintainer report 2026-11-14); a new enemy, season or extract that
// adds one fails here until it is wired or listed. A wired (LASSO) one is checked on its real kit: the channel's fx
// 'enemySkill' carries `dur` and `tgt` (what render/fxgame.js elassoStart draws the line for) and every stand-in beam the
// kit sends meanwhile is one LASSO_BEAMS keeps from being drawn over the line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LASSO_BEAMS } from '../../public/js/render/fxgame.js';
import { getData } from '../../server/data.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';
import { LASSO, OTHER, NOT_CAST, TODO } from './eskill-lasso-list.js';

const BINDINGS = JSON.parse(readFileSync(new URL('../../tools/assets/local-enemy-bindings.json', import.meta.url), 'utf8'));
const quiet = { warn() {}, error() {}, info() {} };
const LISTED = { ...LASSO, ...OTHER, ...NOT_CAST, ...TODO };

/** `<enemy id> <ability path>` → its link projectile, for every bound ability that fires one with a line effect. */
function linkAbilities() {
  const projs = BINDINGS.$projectiles || {};
  const line = (k) => { const p = projs[k]; return p && p.link > 0 && Array.isArray(p.trail) && p.trail.length ? p : null; };
  const out = new Map();
  for (const [id, rec] of Object.entries(BINDINGS)) {
    if (id.startsWith('$') || !rec || !Array.isArray(rec.abilities)) continue;
    for (const a of rec.abilities) for (const p of a.projectiles || []) if (line(p.key)) out.set(`${id} ${a.path}`, { key: p.key, ...line(p.key) });
  }
  return out;
}

test('the bindings carry the link lines (节日爵士乐手 fire on itself, 死亡之眼 on its head)', () => {
  const m = linkAbilities();
  assert.ok(m.size >= 8, `${m.size} link abilities`);
  assert.equal(m.get('enemy_10034_cnvsax Modes/Attack/Body/Skills/fire')?.onSrc, 1);
  assert.equal(m.get('enemy_1275_dwlock_2 Skills/DeathEye/LineAttack')?.key, 'projectile_enemy_dwlock_line');
});

test('every link-line ability is drawn by elassoStart or listed with why', () => {
  const missing = [...linkAbilities().keys()].filter((k) => !LISTED[k]);
  assert.deepEqual(missing, [], 'send the channel\'s `dur` / `tgt` from its kit (castFx) and list it in LASSO, or list it in test/render/eskill-lasso-list.js with why');
});

test('the list names only link-line abilities, each once', () => {
  const m = linkAbilities();
  for (const k of Object.keys(LISTED)) assert.ok(m.has(k), `${k}: no such link-line ability in the bindings`);
  const keys = [LASSO, OTHER, NOT_CAST, TODO].flatMap((o) => Object.keys(o));
  assert.equal(new Set(keys).size, keys.length, 'one group per ability');
});

const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e9, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
/** Enemy `key` blocked by a still wall, every event logged with its battle time. */
function field(key) {
  const D = getData({ log: quiet });
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    kind: 'normal', sharedBoss: null, enemies: [], defs: { chess: { t_wall: WALL }, enemies: { [key]: D.enemies[key] } },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) }, units: [{ chessId: 't_wall', row: 10, col: 5, uid: 1 }],
  });
  h.step();
  const b = h.battle, ev0 = b._ev.bind(b), rec = [];
  b._ev = (e) => { rec.push([b.time, e]); return ev0(e); };
  const e = h.spawn(key, { pos: [10, 5], routeIndex: 0, mods: { speedMul: 0 }, tag: null });
  return { h, e, rec };
}

for (const [k, ability] of Object.entries(LASSO)) {
  const id = k.split(' ')[0];
  test(`${k} (real kit): its channel sends \`dur\` and \`tgt\`, and its stand-in beams are LASSO_BEAMS'`, () => {
    const { h, e, rec } = field(id);
    const isCast = ([, x]) => x[0] === 'fx' && x[1] === 'enemySkill' && x[4]?.id === e.id && x[4]?.ability === ability;
    h.runUntil(() => rec.some(isCast), 60);
    const [t0, cast] = rec.find(isCast) || [];
    assert.ok(cast, `the sim casts ${ability}`);
    assert.ok(Number(cast[4].dur) > 0 && cast[4].tgt != null, `its fx 'enemySkill' carries the channel's dur / tgt (${JSON.stringify(cast[4])})`);
    h.run(Number(cast[4].dur) + 0.5);
    const beams = rec.filter(([t, x]) => t >= t0 && x[0] === 'fx' && x[1] === 'beam' && (x[4]?.from ?? x[4]?.id) === e.id).map(([, x]) => x[4].kind);
    assert.ok(beams.length > 0, 'the kit sends its stand-in beams');
    assert.deepEqual([...new Set(beams)].filter((b) => !LASSO_BEAMS.has(b)), [], 'every stand-in beam of the channel is in render/fxgame.js LASSO_BEAMS');
  });
}
