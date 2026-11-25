// test/render/eskill-attack-finish.test.js — an enemy channel skill's cast effects at their own events (2026-11-26,
// docs/rules/fx.md 「적 범위 공격의 경고 칸」 「시전 이펙트의 때」): 腐败骑士's 蓄力锤 (ChargeAttack, a three-part channel of the
// skill's `duration` 4 s) binds dekght_skill_01_gather (ON_CAST_START → ON_ATTACK_FINISH), _gather_02 (ON_CAST_START →
// ON_CAST_END) and three start effects (ON_ATTACK_FINISH → ON_CAST_END); ThreePartChannelingAnimation `_fireAttackFinishEvent`
// raises ON_ATTACK_FINISH as the end clip (Skill_End, 2.133 s) starts, 1.867 s in. Until 2026-11-26 the view played all five
// as the cast began and all five again at the hammer's 'explode' (2.967 s in, the fx carries the cast's `ability`).
// The sim's events come from the real kit (content/enemies/leaders.js); the render runs on the extracted binding's shape (the
// real one is compared at the end).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { getData } from '../../server/data.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const MODES = new URL('../../public/assets/local/fx/enemy-modes.json', import.meta.url);
const quiet = { warn() {}, error() {}, info() {} };
const D = getData({ log: quiet });
const DK = 'enemy_1513_dekght';
const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e9, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
const GATHER = 'dekght_skill_01_gather', GATHER2 = 'dekght_skill_01_gather_02';
const STARTS = ['dekght_skill_01_start', 'dekght_skill_01_start_02', 'dekght_skill_01_start_03'];
const CAST = [GATHER, GATHER2, ...STARTS];
// the part of the extracted binding this case reads (enemy-modes.json, enemy_bindings.py)
const PART = { cast: CAST, opt: { [GATHER]: { s: 2, e: 6, o: 0 }, [GATHER2]: { s: 2, e: 3, o: 0 },
  ...Object.fromEntries(STARTS.map((n) => [n, { s: 6, e: 3, o: 0 }])) }, hit: ['dekght_skill_01_hit', 'dekght_skill_01_range'] };
const NAMES = [...CAST, ...PART.hit];

/** A still wall at (10, 5) blocking 腐败骑士 there; every event logged with its battle time. */
function field() {
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    kind: 'normal', sharedBoss: null, enemies: [], defs: { chess: { t_wall: WALL }, enemies: { [DK]: D.enemies[DK] } },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) },
    units: [{ chessId: 't_wall', row: 10, col: 5, uid: 1 }],
  });
  h.step();
  const b = h.battle, ev0 = b._ev.bind(b), rec = [];
  b._ev = (e) => { rec.push([b.time, e]); return ev0(e); };
  const e = h.spawn(DK, { pos: [10, 5], routeIndex: 0, mods: { speedMul: 0 }, tag: null });
  return { h, e, rec };
}
const viewOf = (u) => ({ id: u.id, x: u.x, y: u.y, alive: true, isEnemy: u.side === 'enemy', form: null, flags: 0, statuses: new Set(),
  info: { id: u.id, side: u.side === 'enemy' ? 'enemy' : 'ally', defId: u.defId ?? 'char_x', form: null } });
const fxIs = (e, kind, k) => e[0] === 'fx' && e[1] === kind && (k == null || e[4]?.kind === k || e[4]?.ability === k);

test('腐败骑士 (real kit): 蓄力锤\'s gather from the cast\'s start to the end clip, its start effects from there; none again at the hammer\'s blast, whose hits draw its hit effects', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { h, e, rec } = field();
    h.runUntil(() => rec.some(([, x]) => fxIs(x, 'enemySkill', 'ChargeAttack')), 40);
    h.run(4.5);
    const [t0, cast] = rec.find(([, x]) => fxIs(x, 'enemySkill', 'ChargeAttack'));
    assert.equal(cast[4].dur, 4, 'the sim gives the channel its 4 s (content/enemies.js chanView)');
    const blast = rec.find(([t, x]) => t >= t0 && fxIs(x, 'explode', 'chargeAttack'));
    assert.ok(blast && blast[1][4].ability === 'ChargeAttack' && Math.abs(blast[0] - t0 - 2.967) < 0.05,
      `the hammer's blast inside the cast, 2.967 s in (${blast && (blast[0] - t0).toFixed(3)})`);
    const wall = h.allies()[0];

    const m = { $fx: Object.fromEntries(NAMES.map((n) => [n, ['b', n]])), [DK]: { modes: [{ name: 'Mode', anim: ['Attack'] }], skills: { chargeattack: PART } } };
    const files = { '/assets/local/fx/index.json': { bundles: { b: NAMES } }, '/assets/local/fx/enemy-modes.json': m };
    globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
    const seen = [];
    const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, unitDef: (info) => D.enemies[/** @type {{ defId: string }} */ (info).defId] || null,
      trace: (p) => seen.push({ ...p, t: clock }) });
    let clock = 0;
    await new Promise((r) => setTimeout(r, 10));
    const views = new Map([[e.id, viewOf(e)], [wall.id, viewOf(wall)]]);
    const CAM = { dist: 20 }, VP = { width: 100, height: 100 };
    let at = t0;
    L.update(0, CAM, VP);
    for (const [t, x] of rec) {
      if (t < t0 - 1e-9) continue;
      while (t - at > 1e-9) { const d = Math.min(1 / 60, t - at); L.update(d, CAM, VP); at += d; clock = at - t0; }
      L.onEvent(x, views);
    }
    const spawns = seen.filter((p) => p.kind === 'spawn');
    const of = (n) => spawns.filter((p) => p.names[0] === n);
    for (const n of [GATHER, GATHER2]) {
      assert.equal(of(n).length, 1, `${n} once, as the cast starts — not again at the blast (${JSON.stringify(of(n))})`);
      assert.ok(of(n)[0].t < 0.05, `${n} at the cast's start (${of(n)[0].t})`);
    }
    for (const n of STARTS) {
      assert.equal(of(n).length, 1, `${n} once (ON_ATTACK_FINISH), not at the cast's start nor again at the blast (${JSON.stringify(of(n))})`);
      assert.ok(Math.abs(of(n)[0].t - 1.867) < 0.05, `${n} as the end clip starts, 1.867 s in (${of(n)[0].t.toFixed(3)})`);
    }
    // (the gather loop's end at ON_ATTACK_FINISH is its live entry's `until`: a dry layer keeps no live entries to read)
    assert.ok(of('dekght_skill_01_hit').some((p) => p.on === wall.id && p.t > 2.9), 'the hammer\'s hit effect on the blocker at the blast (eskillHit)');
  } finally { globalThis.fetch = fetch0; }
});

test('the extracted binding of 腐败骑士\'s 蓄力锤 times its cast effects as this case does', { skip: !existsSync(MODES) && 'no extracted effects' }, () => {
  const real = JSON.parse(readFileSync(MODES, 'utf8'))[DK]?.skills?.chargeattack;
  assert.ok(real, 'enemy-modes.json has 腐败骑士\'s chargeattack');
  assert.deepEqual(real.cast, PART.cast);
  assert.deepEqual(real.opt, PART.opt);
});

// every enemy ability whose cast effects start or end at ON_ATTACK_FINISH: the view times that moment from the ability's
// three-part channel (fxgame.js echanFinishAt, data `skillCast.*`); without one those effects keep the cast's start and end.
// Listed: the ones another path times.
const AF_ELSEWHERE = {
  'enemy_1535_wlfmster:reborn': '扎罗 “狼之主”\'s 重生 ability: its rebornAbility (fxgame.js erebornAbility) raises ON_ATTACK_FINISH at the Reborn_End clip',
};
test('every enemy ability with ON_ATTACK_FINISH cast effects plays a channel the view can time (docs/rules/fx.md 「적 범위 공격의 경고 칸」)', { skip: !existsSync(MODES) && 'no extracted effects' }, () => {
  const AF = 6;
  const modes = JSON.parse(readFileSync(MODES, 'utf8'));
  const seen = [];
  for (const [id, b] of Object.entries(modes)) {
    if (id.startsWith('$')) continue;
    for (const [sk, p] of Object.entries(b.skills || {})) {
      if (!Object.values(p.opt || {}).some((t) => t && (t.s === AF || t.e === AF))) continue;
      const key = `${id}:${sk}`;
      seen.push(key);
      if (AF_ELSEWHERE[key]) continue;
      /** @param {unknown} c a data skillCast record @returns {{ chan: { wait?: unknown }, chanEnd?: { dur?: number } } | null} */
      const chanRec = (c) => {
        if (!c || typeof c !== 'object') return null;
        const r = /** @type {{ chan?: { loop?: unknown, wait?: unknown }, chanEnd?: { dur?: number }, subs?: unknown }} */ (c);
        if (r.chan && typeof r.chan.loop === 'string') return /** @type {{ chan: { wait?: unknown }, chanEnd?: { dur?: number } }} */ (r);
        return (Array.isArray(r.subs) ? r.subs : []).map(chanRec).find(Boolean) || null;
      };
      const r = chanRec(D.enemies[id]?.skillCast?.[sk]);
      assert.ok(r && !r.chan.wait && r.chanEnd?.dur > 0, `${key}: cast effects at ON_ATTACK_FINISH, but no three-part channel with an end clip in data skillCast — `
        + 'the view plays them at the cast\'s start (fxgame.js echanFinishAt; docs/rules/fx.md 「적 범위 공격의 경고 칸」 「시전 이펙트의 때」): time that moment, or list it here with the path that does');
    }
  }
  assert.ok(seen.includes(`${DK}:chargeattack`), `the sweep reached 腐败骑士's 蓄力锤 (${seen.join(', ')})`);
  for (const k of Object.keys(AF_ELSEWHERE)) assert.ok(seen.includes(k), `${k} is listed but has no ON_ATTACK_FINISH cast effects any more: drop it`);
});
