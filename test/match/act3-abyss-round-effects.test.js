// 规程 co-op 终极 (act3autochess mode_multi_abyss): its non-leader enemy multipliers are the measured round effects —
// one ENEMY effect added per round, in the order two official CN matches carried (tools/build-data.mjs
// SEASON_ENEMY_ROUND_EFFECTS, upstream PR #1013 hand-ported) — folded from the season's effect blackboards with no base
// multiplier, and their additive attack speed (`aspdAdd`, `enemy_attribute_add` attack_speed) reaches every enemy:
// wave enemies, bounty enemies, the leaders and the leaders' summons (docs/rules/sim.md 「규정 적·보스」 라운드 적 효과).
// The other 规程 modes and the 盟约 keep the stack table and have no attack-speed bonus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getData } from '../../server/data.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { GameData } from '../../server/match/gamedata.js';
import { buildBossWave, buildNormalWave, leaderMods, setupMatchWaves } from '../../server/match/waves.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { createRng } from '../../server/sim/rng.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';
import { makeBattle } from '../helpers/battleHarness.js';
import { DATA, makeMatch } from './harness.js';

const REAL = { skip: !hasGeneratedData() };
const quiet = { warn() {}, error() {}, info() {}, debug() {} };
const ACT3 = hasGeneratedData() ? getData({ log: quiet, season: 'act3autochess' }) : null;
const MODE = 'mode_multi_abyss';
const ORDER = ['8', '6', '1', '7', '2_2', '7', '7', '9', '16', '2_2', '8', '10', '15', '7', '2_2'].map((id) => `aceffect_enemy_${id}`);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)), `${msg}: ${a} ≈ ${b}`);

test('规程 co-op 终极: each round row is the measured effects folded from the season\'s blackboards; other modes keep no ASPD bonus', REAL, () => {
  const rows = ACT3.config.modes[MODE].enemyScale;
  assert.equal(Object.keys(rows).length, ORDER.length, 'one effect per round');
  // an independent fold of the season's effect records
  let atk = 1, hp = 1, speed = 1, aspd = 0, supply = 1;
  for (const [i, id] of ORDER.entries()) {
    for (const b of ACT3.effects[id].buffs) {
      if (b.key === 'enemy_attribute_mul') {
        if (b.bb.atk != null) atk *= b.bb.atk;
        if (b.bb.max_hp != null) { hp *= b.bb.max_hp; if (b.bb.atk == null) supply *= b.bb.max_hp; }
      } else if (b.key === 'enemy_attribute_add') aspd += b.bb.attack_speed;
      else speed *= 1 + b.bb.move_speed;
    }
    const r = rows[i + 1];
    near(r.atk, atk, `R${i + 1} atk`);
    near(r.hp, hp, `R${i + 1} hp`);
    near(r.speed, speed, `R${i + 1} speed`);
    assert.equal(r.aspdAdd, aspd, `R${i + 1} aspdAdd`);
    near(r.supplyHp ?? 1, supply, `R${i + 1} supplyHp`);
  }
  // the numbers upstream PR #1013 and the research table give (8 R: 3.88, 14 R: 12.28; attack speed +10 → +30)
  near(rows[8].hp, 3.881779, 'R8 hp');
  near(rows[14].hp, 12.280707, 'R14 hp');
  near(rows[14].atk, 1.1 ** 8, 'R14 atk: eight ×1.1 effects, no 攻坚装备 ×1.11');
  assert.deepEqual(Object.values(rows).map((r) => r.aspdAdd), [10, 15, 15, 15, 15, 15, 15, 15, 15, 15, 25, 25, 30, 30, 30]);
  assert.deepEqual(Object.values(rows).map((r) => r.speed), [1, 1, ...Array(13).fill(1.3)], '急行军 from round 3');
  for (const [D, name] of [[ACT3, '规程'], [DATA, '盟约']]) {
    for (const [id, m] of Object.entries(D.config.modes)) {
      if (D === ACT3 && id === MODE) continue;
      for (const [r, row] of Object.entries(m.enemyScale || {})) assert.equal(row.aspdAdd, undefined, `${name} ${id} R${r}`);
    }
  }
});

test('规程 co-op 终极: GameData and the wave builders carry aspdAdd to wave enemies and leaders (not the leader HP)', REAL, () => {
  const gd = new GameData(ACT3, MODE);
  assert.equal(gd.enemyScale(13).aspdAdd, 30);
  assert.equal(gd.leaderScale(15).aspdAdd, 30);
  assert.equal(new GameData(ACT3, 'mode_multi_hard').enemyScale(13).aspdAdd, undefined);
  const rng = createRng(21);
  const setup = setupMatchWaves(gd, rng);
  const wave = buildNormalWave(gd, rng, setup, 13);
  assert.ok(wave.spawns.length > 0);
  for (const s of wave.spawns) assert.equal(s.mods.aspdAdd, 30, s.enemyKey);
  assert.deepEqual(leaderMods(gd, 15).aspdAdd, 30);
  const boss = buildBossWave(gd, rng, setup.factions, 14, { bossId: Object.keys(ACT3.config.modes[MODE].bossIds ?? {})[0] ?? 'boss_8', solo: false });
  const leader = boss.spawns.find((s) => s.tag === 'boss');
  assert.ok(leader, 'the boss wave has its leader');
  assert.equal(leader.mods.aspdAdd, 30);
  assert.ok(!('hpMul' in leader.mods), 'the leader HP is the shared pool');
});

test('real match path: a 规程 co-op 终极 normal field spawns its enemies with the round\'s attack speed added; 绝境 without', REAL, () => {
  const run = (modeId) => {
    const h = makeMatch({ mode: 'coop', modeId, humans: 2, seed: 5, data: ACT3, season: 'act3autochess' }).start();
    h.toPrep(2);
    const spec = buildBattleSpec({ battleId: 'abyss.normal', ...h.m._normalOpts(h.ps('p_0')) });
    const b = createBattleFromSpec(spec, undefined, { recordEvents: false, quiet: true });
    for (let i = 0; i < 30 * 40 && b.enemies.length < 3; i++) b.step();
    const seen = b.units.filter((u) => u.side === 'enemy');
    h.m.dispose();
    return seen;
  };
  const abyss = run(MODE);
  assert.ok(abyss.length > 0, 'enemies spawned');
  for (const e of abyss) {
    assert.equal(e.base.aspd, e.def.aspd + 15, `${e.defId}: data ${e.def.aspd} + R2's 15`);
    near(e.base.maxHp, e.def.maxHp * (e.mods.hpMul ?? 1), `${e.defId} hp`);
  }
  const hard = run('mode_multi_hard');
  assert.ok(hard.length > 0);
  for (const e of hard) assert.equal(e.base.aspd, e.def.aspd, `${e.defId}: no bonus on 绝境`);
});

test('a leader whose data attack speed is 0 (假想敌：铳 / 管 / 弦) keeps the round\'s attack speed on top of its floor', REAL, () => {
  const keys = ['enemy_9017_achunt', 'enemy_9021_acduml', 'enemy_9022_acdumm'].filter((k) => ACT3.enemies[k]);
  assert.ok(keys.length >= 2, 'the skill-driven leaders exist in 规程');
  const field = (key, mods) => {
    const h = makeBattle({
      content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600, kind: 'boss', enemies: [],
      defs: { enemies: { [key]: ACT3.enemies[key] } },
    });
    h.step();
    const e = h.spawn(key, { pos: [3, 8], routeIndex: 0, mods: { speedMul: 0, ...mods }, tag: 'boss' });
    h.step();
    return e;
  };
  for (const key of keys) {
    assert.equal(ACT3.enemies[key].stats.aspd, 0, `${key}: data attack speed 0`);
    const plain = field(key, {}), boosted = field(key, { aspdAdd: 30 });
    assert.equal(boosted.s.aspd, plain.s.aspd + 30, `${key}: +30 stays on top of the floor (${plain.s.aspd})`);
  }
  // the leaders' mid-fight summons: test/seasons-act3-enemies.test.js 「规程 补给线 leaves the leaders' summons … out」
});
