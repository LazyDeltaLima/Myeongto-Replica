// test/content/enemy-proj-wait-coverage.test.js — every enemy skill whose official ability waits for its projectile
// (`_waitForProjectileInvalid`: `skillCast.*.proj` of data/enemies.json and the seasons' enemies.json, read from the
// client prefabs by tools/local-extract/attack_timing.py; a group's child too) casts as long as that projectile lives:
// its kit tells the engine when the projectile is gone (`projAlive`, content/enemies.js projCastOver), or the skill is
// listed with why in test/content/enemy-proj-wait-list.js. 节日爵士乐手, 萨卡兹王庭军精锐术师, W, 陷落雪祀 and “萨米的意志” cast for
// 0 s (or their clip) until 2026-11-07 / 2026-11-14 because nothing said so (docs/rules/sim.md 「적 스킬 = 일반 공격 차례」
// 시전 길이, 「투사체를 기다리는 적 스킬 넷」); a new enemy, season or extract that adds such a skill fails here until it is
// wired or listed. The other way round, a wired kit whose open cast never closes stands PROJ_WAIT_MAX (60 s) — as
// 节日爵士乐手 did on its blocker's tile (2026-11-14): every wired skill is cast here and must end well before that.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';
import { OTHER } from './enemy-proj-wait-list.js';
import { NOT_CAST } from './enemy-not-cast-list.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILES = ['data/enemies.json', ...readdirSync(path.join(ROOT, 'data/seasons')).map((s) => `data/seasons/${s}/enemies.json`)]
  .filter((f) => existsSync(path.join(ROOT, f)));
const DATA = FILES.map((f) => [f, JSON.parse(readFileSync(path.join(ROOT, f), 'utf8'))]);
const LISTED = { ...OTHER };

/** Does cast record `c` wait for a projectile — itself, or a child of its group? (content/enemies.js waitsProj) */
const waits = (c) => !!c && (!!c.proj || (c.kind === 'seq' && (c.subs || []).some(waits)));

/** `<enemy key> <skill>` → { file, key, rec, skill } of every projectile-waiting skill, per season file. */
function waiting() {
  const out = [];
  for (const [file, D] of DATA) {
    for (const [key, rec] of Object.entries(D)) {
      for (const [skill, c] of Object.entries(rec.skillCast || {})) if (waits(c)) out.push({ id: `${key} ${skill}`, file, key, rec, skill });
    }
  }
  return out;
}

const WALL = (id) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: 1e9, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
const NOATK = () => ({ trait: { noAttack: true } });

/**
 * A battle with enemy record `rec` (`key`) blocked by a wall at (10, 6), two more walls above and below, and three
 * standing slimes behind it (allies to buff for 陷落雪祀's chain); the enemy's kit abilities by lower-case name.
 */
function arena(key, rec) {
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    defs: { chess: { w1: WALL('w1'), w2: WALL('w2'), w3: WALL('w3') }, enemies: { [key]: rec } }, kits: { w1: NOATK, w2: NOATK, w3: NOATK },
    enemies: [], units: [{ chessId: 'w1', row: 10, col: 6 }, { chessId: 'w2', row: 9, col: 6 }, { chessId: 'w3', row: 11, col: 6 }],
  });
  h.step();
  const e = h.spawn(key, { pos: [10, 6], routeIndex: 0, mods: { speedMul: 0 } });
  for (const pos of [[10, 8], [9, 8], [11, 8]]) h.spawn('enemy_1007_slime', { pos, routeIndex: 0, mods: { speedMul: 0 } });
  const byName = new Map();
  for (const a of e.mem?.ab?.list || []) if (a && a.name) byName.set(a.name.toLowerCase(), a);
  return { h, e, byName };
}

test('the extract marks the projectile-waiting skills (节日爵士乐手 fire, 死亡之眼, W C4, “萨米的意志” Lasso)', () => {
  const ids = new Set(waiting().map((w) => w.id));
  for (const id of ['enemy_10034_cnvsax fire', 'enemy_1275_dwlock_2 deatheye', 'enemy_1504_cqbw c4', 'enemy_2050_smsha chainbuff', 'enemy_9033_acdeer lasso']) {
    assert.ok(ids.has(id), id);
  }
});

test('every projectile-waiting enemy skill is wired (`projAlive`) or listed with why', () => {
  const missing = [], wiredListed = [], noCut = [];
  for (const w of waiting()) {
    const { byName } = arena(w.key, w.rec);
    const a = byName.get(w.skill);
    const wired = !!(a && typeof a.projAlive === 'function');
    if (!wired && !LISTED[w.id] && !NOT_CAST[w.id]) missing.push(`${w.id} (${w.file})`);
    if (wired && (LISTED[w.id] || NOT_CAST[w.id])) wiredListed.push(w.id);
    // a cast cut short clears its projectiles (RangedAttack.OnCastEnd → ClearProjectile, 공식 클라에서 확인): the kit ends
    // what its projectile carries there (a channel, a lasso's stun, a chain's next jumps — or W's charge, which blows)
    if (wired && typeof a.onCut !== 'function') noCut.push(w.id);
  }
  assert.deepEqual(missing, [], 'give the kit ability `projAlive` and `onCut`, or list it in test/content/enemy-proj-wait-list.js (test/content/enemy-not-cast-list.js when the sim never casts it)');
  assert.deepEqual(wiredListed, [], 'wired now: take it off the list (or off test/content/enemy-not-cast-list.js)');
  assert.deepEqual(noCut, [], 'a wired skill needs `onCut`: what its projectile does when the cast is cut');
});

test('the list names only projectile-waiting skills of the data', () => {
  const ids = new Set(waiting().map((w) => w.id));
  assert.deepEqual(Object.keys(LISTED).filter((k) => !ids.has(k)), []);
  assert.deepEqual(Object.keys(LISTED).filter((k) => NOT_CAST[k]), [], 'also in test/content/enemy-not-cast-list.js: one place');
  assert.ok(['enemy_1223_dmech charge_gunctrl', 'enemy_9012_acloon skill'].every((k) => ids.has(k) && NOT_CAST[k]), 'the not-cast list reaches the projectile waits');
});

test('`projAlive` sits only on skills that wait for their projectile', () => {
  // (every enemy with a prefab-read skill: a `projAlive` on a skill without `proj` never opens its cast — dead code that
  // reads as if the cast waited)
  const wrong = [];
  const done = new Set();
  for (const [file, D] of DATA) {
    for (const [key, rec] of Object.entries(D)) {
      if (!rec.skillCast || done.has(`${file} ${key}`)) continue;
      done.add(`${file} ${key}`);
      const { byName } = arena(key, rec);
      for (const [name, a] of byName) if (typeof a.projAlive === 'function' && !waits(rec.skillCast[name])) wrong.push(`${key} ${name} (${file})`);
    }
  }
  assert.deepEqual(wrong, []);
});

/** Open casts longer than this stand for a kit that never said its projectile was gone (PROJ_WAIT_MAX is 60 s). */
const OPEN_MAX = 30;

test(`every wired skill is cast here and its open cast ends with its projectile (under ${OPEN_MAX} s)`, () => {
  const seen = new Set(), report = [];
  for (const w of waiting()) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    const { h, e, byName } = arena(w.key, w.rec);
    const a = byName.get(w.skill);
    if (!a || typeof a.projAlive !== 'function') continue;
    const lens = [];
    let start = null;
    for (let t = 0; t < 120 && e.alive; t += h.TICK) {
      h.step();
      const k = e.mem.ab.casting;
      if (k && k.open && k.a === a) { if (start == null) start = h.b.time; } else if (start != null) { lens.push(h.b.time - start); start = null; }
      if (start != null && h.b.time - start > OPEN_MAX) break;
    }
    if (start != null && h.b.time - start > OPEN_MAX) report.push(`${w.id}: an open cast still running after ${OPEN_MAX} s`);
    else if (!lens.length) report.push(`${w.id}: never cast in 120 s here — give this test a setup that casts it`);
  }
  assert.deepEqual(report, []);
});
