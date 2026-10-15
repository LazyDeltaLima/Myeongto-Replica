// test/match/ruleset-match.test.js — 규칙 모드 on the real match path (shared/ruleset.js): the match carries its ruleset in
// m.public, and the 休闲 ruleset lifts 限伤 — the same 999-layer 炎 Final Assault + Hidden Core as
// test/match/playtest6-limits.test.js (where classic cancels every leader hit of ≥ 300000) lands those hits and credits
// them to the shared pool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, BOSS_HIT_LIMIT } from '../../shared/constants.js';
import { Battle } from '../../server/sim/Battle.js';
import { makeMatch, give, legalTileFor } from './harness.js';

test('m.public.ruleset: the match ruleset (classic without one, casual when given); boss battles get noBossHitLimit only in casual', () => {
  for (const [ruleset, preset] of [[undefined, 'classic'], ['casual', 'casual'], [{ preset: 'casual' }, 'casual'], ['bogus', 'classic']]) {
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 3, fake: true, ruleset }).start();
    const pub = h.m.publicView();
    assert.equal(pub.ruleset.preset, preset, String(ruleset));
    assert.equal(typeof pub.ruleset.options.bossHitLimit, 'boolean');
    h.m.dispose();
  }
});

const YAN = ['chess_char_6_15_a', 'chess_char_5_12_a', 'chess_char_4_17_a', 'chess_char_3_03_a'];
/** Every enemy takes ×K damage (a stand-in for a 999-layer board's debuffs): the hits land far past 300000. */
const K = 2000;
function recordingBattleClass(log) {
  return class extends Battle {
    constructor(opts) {
      const user = opts.setup;
      super({ ...opts, setup: (b) => {
        if (typeof user === 'function') user(b);
        if (b.kind !== 'boss' && b.kind !== 'hidden') return;
        const rec = { kind: b.kind, battle: b, caps: 0, leaderHits: [], credits: [] };
        log.push(rec);
        const fx0 = b.fx.bind(b);
        b.fx = (k, p) => { if (k === 'hitCap') rec.caps++; return fx0(k, p); };
        b.on('enemySpawn', ({ enemy }) => b.addBuff(enemy, { key: 'test:999debuffs', mods: { dmgTakenMul: K } }));
        b.on('damaged', (c) => {
          if (!c.target || !c.target.isBoss || c.type === 'element') return;
          rec.leaderHits.push(c.amount);
        }, { priority: -1000 });
        if (b.sharedBoss) {
          const pool = b.sharedBoss;
          const dmg = pool.damage.bind(pool);
          pool.damage = (pid, amount) => { rec.credits.push(amount); return dmg(pid, amount); };
        }
      } });
    }
  };
}

test('casual: a 999-layer 炎 board\'s leader hits of ≥ 300000 land and reach the shared pool (no 限伤)', () => {
  const h = makeMatch({ mode: 'solo', difficulty: 'HARD', seed: 76, fake: true, captureFrames: false, ruleset: 'casual',
    script: (b) => (b.kind === 'normal' ? { duration: 1 } : {}) });
  const m = h.m;
  m.bossId = 'boss_6';
  m.hiddenBossId = 'boss_9';
  m.gd.bossHpMul = () => 0.1;
  h.start();
  h.toPrep(14);
  const ps = h.ps('p_0');
  for (const p of [...ps.board.values()]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear();
  const used = new Set();
  for (const id of YAN) {
    const at = legalTileFor(m, ps, id, used);
    used.add(`${at[0]},${at[1]}`);
    give(m, ps, id, 'board', at);
  }
  ps.addLayers('yanShip', 5000);
  ps.recompute();
  ps.lp = 200;
  const log = [];
  m.BattleClass = recordingBattleClass(log);
  h.drive(() => m.phase === PHASE.FINAL_ASSAULT || h.ended != null);
  assert.equal(m.phase, PHASE.FINAL_ASSAULT);
  h.drive(() => h.ended != null, { maxSteps: 8e6 });
  assert.ok(h.ended, `the match ended (${m.phase} R${m.round})`);
  assert.ok(log.length >= 1, 'a real boss field ran');
  for (const rec of log) {
    assert.equal(rec.battle.flags.noBossHitLimit, true, `${rec.kind}: the battle got the flag`);
    assert.equal(rec.caps, 0, `${rec.kind}: nothing was cancelled`);
    assert.ok(rec.leaderHits.some((a) => Math.ceil(a) >= BOSS_HIT_LIMIT), `${rec.kind}: a hit of ≥ 300000 landed (max ${Math.max(0, ...rec.leaderHits)})`);
    assert.ok(rec.credits.some((a) => a >= BOSS_HIT_LIMIT), `${rec.kind}: and reached the shared pool`);
    assert.equal(rec.battle.reason, 'cleared');
  }
  assert.equal(h.ended.victory, true);
  assert.equal(m.errorCount, 0);
  m.dispose();
});
