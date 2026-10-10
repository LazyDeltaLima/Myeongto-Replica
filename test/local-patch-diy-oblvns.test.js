// test/local-patch-diy-oblvns.test.js — 丰川祥子 (char_4182_oblvns) 선발 kit (server/sim/content/kits/ops/op-oblvns.js):
// her normal-attack notes hit with the ATK at the shot. Every attack ability of her charpack (all 24) has RangedAttack
// `_useCachedAtkOnly` 1 (EN client, 2026-10-10 check); the kit marks the engine projectile it takes over with
// `projectile.cachedAtk` and ai.js resolveHit uses it. Until then the note read her ATK when it arrived.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeBattle, enemyRec } from './helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKUPS = JSON.parse(readFileSync(path.join(ROOT, 'data/backups.json'), 'utf8'));
const CHAR = 'char_4182_oblvns';
const pickOf = (elite, sk) => ({ charId: CHAR, skillIndex: sk, uniEquipId: elite ? 'uniequip_002_oblvns' : null });
const op = ({ tier = 6, elite = true, sk = 0, row = 10, col = 4, ...rest } = {}) => ({ diy: { slot: tier, ...pickOf(elite, sk) }, elite, row, col, uid: 1, ...rest });
const POST = enemyRec({ key: 'enemy_post', hp: 1e9, speed: 0, mass: 0 });
const BOOST = { key: 'test:atk', duration: Infinity, mods: { atkPct: 1, atkScaleMul: 2 } };

/**
 * The damage of her first normal attack (its attackId) — `boost`: right after the shot, while the note flies, her ATK
 * doubles and her 攻击倍率 multiplier doubles (a buff).
 */
const firstAttack = (boost) => {
  const h = makeBattle({ seed: 5, timeLimit: 60, autoFinish: false, captureNoisy: true, defs: { enemies: { enemy_post: POST } },
    flags: { dpPerSec: 0, dpMax: 999 }, units: [op({ sk: 0 })] });
  h.step();
  const u = h.unit(1);
  h.spawn('enemy_post', { pos: [10, 6] });
  let id = null;
  h.b.on('attack', (c) => { if (c.attacker === u && c.targets.length && id == null) id = h.b._attackSeq; });
  for (let i = 0; i < 300 && id == null; i++) h.step();
  assert.ok(id != null, 'she attacked the post');
  const atkAtShot = u.s.atk;
  assert.ok(u.mem.noteList?.length, 'the attack flies as a note');
  if (boost) {
    h.b.addBuff(u, BOOST);
    h.step();
    assert.ok(u.s.atk > atkAtShot * 1.5, `her ATK doubled while the note flies (${atkAtShot} → ${u.s.atk})`);
  }
  const t0 = h.b.time;
  h.runUntil(() => h.hooksOf('damaged').some((x) => x.source === u && x.dmg?.attackId === id), 5);
  const hits = h.hooksOf('damaged').filter((x) => x.source === u && x.dmg?.attackId === id);
  assert.ok(hits.length, 'the note landed');
  assert.ok(h.b.time - t0 > 0.2, 'after a flight');
  assert.equal(h.b.errors.length, 0, h.b.errors[0]?.error?.message);
  return hits.reduce((a, x) => a + x.amount, 0);
};

describe('丰川祥子 notes: the ATK at the shot (client RangedAttack `_useCachedAtkOnly` 1)', () => {
  test('a normal-attack note that lands after an ATK / 攻击倍率 buff hits as hard as without it', () => {
    const plain = firstAttack(false), boosted = firstAttack(true);
    assert.ok(plain > 0);
    assert.ok(Math.abs(boosted - plain) < 1e-6, `the same damage (${plain} vs ${boosted}) — before: about 4× with the buff`);
  });

  test('other ranged attacks still hit with the ATK at impact (no cachedAtk on their projectile)', async () => {
    const { resolveHit } = await import('../server/sim/ai.js');
    const h = makeBattle({ seed: 5, timeLimit: 60, autoFinish: false, captureNoisy: true, defs: { enemies: { enemy_post: POST } },
      flags: { dpPerSec: 0, dpMax: 999 }, units: [op({ sk: 0 })] });
    h.step();
    const u = h.unit(1);
    const e = h.spawn('enemy_post', { pos: [10, 6] });
    const prof = { atkScale: 1, dmgType: 'arts' };
    const hp0 = e.hp;
    resolveHit(h.b, u, prof, e, { attackId: 1 }, e.x, e.y);
    const now = hp0 - e.hp;
    resolveHit(h.b, u, prof, e, { attackId: 2, cachedAtk: { atk: u.s.atk / 2, atkScaleMul: u.s.atkScaleMul } }, e.x, e.y);
    const half = hp0 - now - e.hp;
    assert.ok(now > 0 && Math.abs(half - now / 2) < now * 0.02, `cachedAtk halves it (${now} → ${half})`);
  });
});

describe('丰川祥子 through the real match path (seats[].diy → Match board → battleInput → BattleSpec → createBattleFromSpec)', () => {
  test('m04: her first note deals the same damage when her ATK doubles while it flies; no errors', async () => {
    const T6 = 'chess_char_6_diy1_a';
    const { makeMatch } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    assert.ok(BACKUPS.units[CHAR], 'her data');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6]: pickOf(false, 1) } }];
    const mh = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    mh.toPrep(3);
    mh.setStage('act2autochess_m04');
    const m = mh.m, ps = mh.ps('p_0');
    ps.initDiyStock?.(new Set());
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const w = ps.acquireChess(T6, { source: 'buy' });
    assert.ok(w, 'her piece');
    assert.ok(m.handle('p_0', { t: 'g.move', uid: w.uid, to: { area: 'board', row: 10, col: 7 }, dir: 'RIGHT' }).ok);
    const spec = JSON.stringify(buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent }));
    // the first of her attacks whose note lands (an earlier note can lose its target): found in a plain run, then the
    // same battle again with her ATK / 攻击倍率 doubled right after that shot
    const run = (want) => {
      const b = createBattleFromSpec(JSON.parse(spec), m.ds);
      b.start();
      const u = b.allyUnits.find((x) => x.kind === 'op');
      assert.equal(u.def.charId, CHAR);
      const dealt = new Map();
      let fired = false, boosted = false;
      b.on('attack', (c) => { if (c.attacker === u && c.targets.length && b._attackSeq === want) fired = true; });
      b.on('damaged', (c) => { if (c.source === u && c.dmg?.attackId) dealt.set(c.dmg.attackId, (dealt.get(c.dmg.attackId) || 0) + c.amount); });
      while (!b.finished && b.time < 60 && !(want == null ? dealt.size : dealt.has(want))) {
        b.step();
        if (fired && !boosted) { b.addBuff(u, BOOST); boosted = true; }
      }
      assert.equal(b.errors.length, 0, b.errors[0]?.error?.message);
      if (want != null) assert.ok(boosted && u.s.atk > 0, 'boosted after the shot');
      return [...dealt][0];
    };
    const [id, plain] = run(null);
    assert.ok(id && plain > 0, 'one of her notes landed');
    const [id2, boosted] = run(id);
    assert.equal(id2, id);
    assert.ok(Math.abs(boosted - plain) < 1e-6, `the same damage (${plain} vs ${boosted})`);
    m.dispose?.();
  });
});
