// test/content/enemy-cast-target.test.js — every enemy ability that plays effects on its cast's targets as the cast starts
// (the prefab's `_castTargetEffects`, ON_CAST_START: tools/assets/local-enemy-bindings.json `castTargetEffects`) names
// that target in the sim's event of that moment, so the view can play them there (docs/rules/fx.md 「적 범위 공격의 경고 칸」):
// a skill (`Skills/<name>`) in its fx 'enemySkill' `tgt` (`tgts` when it has more) — content/enemies.js castSkill, from what
// the kit's fire returns —, an attack mode's ability in its 'swing' 6th field (ai.js enemyAttack). A kit that drives the
// moment by an event of its own says so in SELF with the event that names the target.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BIND = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-enemy-bindings.json'), 'utf8'));
const FILES = ['data/enemies.json', ...readdirSync(path.join(ROOT, 'data/seasons')).map((s) => `data/seasons/${s}/enemies.json`)]
  .filter((f) => existsSync(path.join(ROOT, f)));
/** enemy key → its first data record. */
const RECS = new Map();
for (const f of FILES) for (const [k, r] of Object.entries(JSON.parse(readFileSync(path.join(ROOT, f), 'utf8')))) if (!RECS.has(k)) RECS.set(k, r);

/**
 * `<enemy> <ability path>` whose cast target the kit's own events name, with that event. Each entry says why.
 * @type {Readonly<Record<string, string>>}
 */
const SELF = Object.freeze({
  'enemy_9021_acduml Modes/Default/Body/Attack/AbilityName': '假想敌：管 attacks by its kit (content/bosses.js pipeCore, profile.noAttack): no swing — its fx \'beam\' { from, to } names the target as the attack starts',
  'enemy_9021_acduml_2 Modes/Default/Body/Attack/AbilityName': '(as enemy_9021_acduml)',
});

/** [enemy, ability path, prefab skill name or null for an attack mode] of every ability with cast-target effects. */
const CASES = [];
for (const [key, b] of Object.entries(BIND)) {
  for (const a of Object.values(/** @type {{ abilities?: Record<string, { path: string, castTargetEffects?: unknown[] }> }} */ (b).abilities || {})) {
    if (!a || !Array.isArray(a.castTargetEffects) || !a.castTargetEffects.length) continue;
    const m = /(?:^|\/)Skills\/([^/]+)$/.exec(a.path);
    CASES.push([key, a.path, m ? m[1] : null]);
  }
}

const W = (id, o = {}) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: 1e9, def: 0, res: 0, blockCnt: 3, ...o }, rangeGrid: [[0, 0]], skill: null });
const NOATK = () => ({ trait: { noAttack: true } });

/** The events of a battle with enemy `key` pinned beside a blocking wall and three more units, run up to `secs`. */
function eventsWith(key, secs, done) {
  const rec = RECS.get(key);
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    defs: { chess: { w1: W('w1'), w2: W('w2', { maxHp: 2e9 }), w3: W('w3', { maxHp: 5e8 }), w4: W('w4') }, enemies: { [key]: rec } },
    kits: { w1: NOATK, w2: NOATK, w3: NOATK, w4: NOATK }, enemies: [], captureNoisy: true,
    units: [{ chessId: 'w1', row: 10, col: 6 }, { chessId: 'w2', row: 10, col: 4 }, { chessId: 'w3', row: 12, col: 7 }, { chessId: 'w4', row: 9, col: 5 }],
  });
  h.step();
  const e = h.spawn(key, { pos: [10, 6], routeIndex: 0, mods: { speedMul: 0 } });
  const ids = new Set(h.allies().map((u) => u.id));
  h.runUntil(() => done(h.events, e, ids), secs);
  return { got: done(h.events, e, ids), e, ids, h };
}

test('the sweep sees the known cases (鼠王 DriftSand / SandStorm, 乌顶巨角卢鲁 skill, 假想敌：械 SommonSquad, 自制投石机 attacks)', () => {
  const k = new Set(CASES.map(([key, , s]) => `${key} ${s}`));
  for (const c of ['enemy_1509_mousek DriftSand', 'enemy_1509_mousek SandStorm', 'enemy_10144_xdelk_2 skill', 'enemy_9029_acfnc SommonSquad', 'enemy_10162_mnctpt null']) assert.ok(k.has(c), c);
});

for (const [key, p, skill] of CASES) {
  const why = SELF[`${key} ${p}`];
  test(`${key} ${p}: its cast start names its target${why ? ' (its kit\'s own event)' : ''}`, { skip: !RECS.has(key) && 'no data record' }, () => {
    if (why) { assert.ok(why.length > 8, 'say why'); return; }
    if (skill) {
      const name = skill.toLowerCase();
      const cast = (/** @type {unknown[][]} */ ev, /** @type {{ id: number }} */ e) => ev.find((x) => x[0] === 'fx' && x[1] === 'enemySkill'
        && /** @type {Record<string, unknown>} */ (x[4]).id === e.id && String(/** @type {Record<string, unknown>} */ (x[4]).ability).toLowerCase() === name);
      const { got, ids } = eventsWith(key, 120, (ev, e) => cast(ev, e));
      assert.ok(got, `${key}: ${skill} was never cast (the sweep's arena — give it the condition it needs)`);
      const o = /** @type {Record<string, unknown>} */ (got[4]);
      assert.ok(ids.has(o.tgt), `${key} ${skill}: 'enemySkill' tgt ${o.tgt} is no unit of the field — its fire must return the unit it casts on (content/enemies.js castSkill; docs/rules/fx.md 「적 범위 공격의 경고 칸」)`);
      if (o.tgts) assert.ok(Array.isArray(o.tgts) && o.tgts.every((t) => ids.has(t)) && o.tgts[0] === o.tgt, 'tgts: the units, the main one first');
    } else {
      const { got, ids } = eventsWith(key, 30, (ev, e) => ev.find((x) => x[0] === 'swing' && x[1] === e.id));
      assert.ok(got, `${key}: never swung`);
      assert.ok(ids.has(got[5]), `${key}: the enemy 'swing' 6th field ${got[5]} is not its target (ai.js enemyAttack; docs/rules/fx.md 「적 범위 공격의 경고 칸」)`);
    }
  });
}

test('a fire that returns the enemies it summons names no target (枯朽萃聚使徒 BornBugs)', () => {
  const { got } = eventsWith('enemy_1321_wdarft', 60, (ev, e) => ev.find((x) => x[0] === 'fx' && x[1] === 'enemySkill' && /** @type {Record<string, unknown>} */ (x[4]).id === e.id));
  assert.ok(got, 'BornBugs cast');
  assert.equal(/** @type {Record<string, unknown>} */ (got[4]).tgt, undefined);
});
