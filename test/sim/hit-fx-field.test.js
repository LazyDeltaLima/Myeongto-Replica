// test/sim/hit-fx-field.test.js — the official effect moments a 'dmg' / 'heal' event names (2026-10-24): the 'dmg' 9th field
// and the 'heal' 5th, [[key, ownerId, life?], …] (server/sim/damage.js fxField / hitFx). A kit's `moment` key on its damage / heal
// / HP loss is owned by the source; `battle.hitFx` adds one for the target's side after the event went out. The renderer
// plays them (render/fx/kitofficial.js `hit`, docs/rules/fx.md 「키트 이벤트의 공식 이펙트」). A field only: events are
// counted, never hashed, so no golden digest moves.
// Run: node --test test/sim/hit-fx-field.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const walker = (o = {}) => enemyRec({ key: 'enemy_walker', hp: 1e6, speed: 0.01, ...o });
const moments = (e, i) => (Array.isArray(e[i]) ? e[i] : []);
const has = (list, key, owner) => list.some((m) => m[0] === key && (owner === undefined || m[1] === owner));

test('damage and heal options carry the key (owned by the source); hitFx tags the target\'s event of this tick', () => {
  const h = makeBattle({
    defs: { enemies: { enemy_walker: walker() } }, enemies: [{ key: 'enemy_walker', pos: [10, 6] }],
    units: [{ chessId: 'chess_char_2_08_a', row: 10, col: 4 }], content: 'none', autoFinish: false,
  });
  h.step();
  const e = h.enemy('enemy_walker'), u = h.allies()[0];
  h.b.drainEvents();
  h.b.dealDamage(u, e, { amount: 100, type: 'true', moment: 'k:a' });
  h.b.dealDamage(u, e, { amount: 100, type: 'true' });
  h.b.hitFx(e, 'k:b', u, 5);
  u.hp = 1;
  h.b.heal(u, u, 50, { moment: 'k:c' });
  h.b.loseHp(u, 0.6, { moment: 'k:d' });
  const evs = h.b.drainEvents();
  const dmg = evs.filter((x) => x[0] === 'dmg');
  assert.deepEqual(dmg[0][8], [['k:a', u.id]]);
  assert.deepEqual(dmg[1][8], [['k:b', u.id, 5]], 'hitFx: the latest event on it, with the life');
  assert.deepEqual(evs.find((x) => x[0] === 'heal')[4], [['k:c', u.id]]);
  assert.deepEqual(dmg[2][8], [['k:d', null]], 'a loss without a source: no owner');
  // no key: the event keeps its 8 fields; a hitFx on a later tick tags nothing
  h.b.dealDamage(u, e, { amount: 100, type: 'true' });
  const plain = h.b.drainEvents().find((x) => x[0] === 'dmg');
  assert.equal(plain.length, 8);
  h.step();
  h.b.hitFx(e, 'k:e', u);
  assert.equal(plain.length, 8, 'not on an earlier tick');
});

test('the kits send their moments: 引星棘刺 S2 ticks, 水月 S3 loss, 休谟斯 trait heal, 泡泡 T1', () => {
  const fight = (units, cast, seconds = 8, enemies = [{ key: 'enemy_walker', pos: [10, 5] }]) => {
    const h = makeBattle({ seed: 3, autoFinish: false, timeLimit: 60, defs: { enemies: { enemy_walker: walker({ atk: 300 }) } }, enemies, units });
    h.step();
    for (const id of cast) { const u = h.unit(id); u.skill.gainSp(999, 'test'); if (!u.skill.active) u.skill.activate('test'); }
    h.run(seconds);
    checkInvariants(h.b);
    return h;
  };
  const dmgKeys = (h) => h.eventsOf('dmg').flatMap((e) => moments(e, 8));
  const healKeys = (h) => h.eventsOf('heal').flatMap((e) => moments(e, 4));
  // 引星棘刺 S2 解构涌潮: its alchemy unit's arts per second
  let h = fight([{ chessId: 'chess_char_5_15_a', row: 10, col: 3, skillIndex: 1 }], ['chess_char_5_15_a']);
  const thorn = h.unit('chess_char_5_15_a');
  assert.ok(has(dmgKeys(h), 'thorn2_s2_damage', thorn.id), JSON.stringify(dmgKeys(h)));
  // 水月 S3: an attack hitting fewer than 3 enemies costs her HP
  h = fight([{ chessId: 'chess_char_4_09_a', row: 10, col: 4, skillIndex: 2 }], ['chess_char_4_09_a']);
  assert.ok(has(dmgKeys(h), 'mizuki_s_3[damage]'), JSON.stringify(dmgKeys(h)));
  // 休谟斯 收割者 trait heal (she takes the walker's hits)
  h = fight([{ chessId: 'chess_char_2_09_a', row: 10, col: 4 }], [], 8, [{ key: 'enemy_walker', pos: [10, 5] }]);
  const humus = h.unit('chess_char_2_09_a');
  humus.hp = humus.s.maxHp * 0.3;
  h.run(4);
  assert.ok(has(healKeys(h), 'trait', humus.id), JSON.stringify(healKeys(h)));
  // 泡泡 T1 尖刺盾: the hit it takes names its debuff on the attacker, for its duration
  h = fight([{ chessId: 'chess_char_2_08_a', row: 10, col: 4 }], []);
  const bubble = h.unit('chess_char_2_08_a');
  const spike = h.eventsOf('dmg').filter((e) => e[1] === bubble.id).flatMap((e) => moments(e, 8));
  assert.ok(spike.length && spike.every((m) => m[0] === 'bubble_t_1[atk_down]' && m[1] === bubble.id && m[2] > 0), JSON.stringify(spike));
});

test('묶음 S6 (2026-10-24): moments the kit sends only when the client\'s condition held — 锏 S2, 忍冬 T1, 雪猎 T1', () => {
  const fight = (units, cast, seconds = 8) => {
    const h = makeBattle({ seed: 3, autoFinish: false, timeLimit: 60, defs: { enemies: { enemy_walker: walker({ atk: 300 }) } },
      enemies: [{ key: 'enemy_walker', pos: [10, 5] }], units });
    h.step();
    for (const id of cast) { const u = h.unit(id); u.skill.gainSp(999, 'test'); if (!u.skill.active) u.skill.activate('test'); }
    h.run(seconds);
    checkInvariants(h.b);
    return h;
  };
  const dmgKeys = (h) => h.eventsOf('dmg').flatMap((e) => moments(e, 8));
  // 锏 S2: the first slash on an enemy names its [blocked] / [not_blocked] buff
  let h = fight([{ chessId: 'chess_char_6_19_a', row: 10, col: 4, skillIndex: 1 }], ['chess_char_6_19_a']);
  const k = dmgKeys(h).filter((m) => m[0].startsWith('blkkgt_s_2['));
  assert.ok(k.length && k.every((m) => m[0] === 'blkkgt_s_2[blocked]' || m[0] === 'blkkgt_s_2[not_blocked]'), JSON.stringify(dmgKeys(h)));
  // 忍冬 T1 追凶: each arts addition names vulpis_t_1[vfx] for `interval` s
  h = fight([{ chessId: 'chess_char_3_18_a', row: 10, col: 4 }], []);
  const vfx = dmgKeys(h).filter((m) => m[0] === 'vulpis_t_1[vfx]');
  assert.ok(vfx.length && vfx.every((m) => m[1] === h.unit('chess_char_3_18_a').id && m[2] > 0), JSON.stringify(dmgKeys(h)));
  // 雪猎 T1 裂云兽: the strike sent at a skill's start
  h = fight([{ chessId: 'chess_char_3_11_a', row: 10, col: 3 }], ['chess_char_3_11_a']);
  assert.ok(has(dmgKeys(h), 'snhunt_t[effect]', h.unit('chess_char_3_11_a').id), JSON.stringify(dmgKeys(h)));
});

test('묶음 S8 (2026-10-24): 菲莱 S2 by her rage, 至简 T1 roll, 深靛 S2 tick, 海霓 S2 raises; 焰影苇草 / 荒芜拉普兰德 event fields', () => {
  const fight = (units, cast, seconds = 8, enemies = [{ key: 'enemy_walker', pos: [10, 5] }], defs = walker({ atk: 300 })) => {
    const h = makeBattle({ seed: 3, autoFinish: false, timeLimit: 60, defs: { enemies: { enemy_walker: defs } }, enemies, units });
    h.step();
    for (const id of cast) { const u = h.unit(id); u.skill.gainSp(999, 'test'); if (!u.skill.active) u.skill.activate('test'); }
    h.run(seconds);
    checkInvariants(h.b);
    return h;
  };
  const dmgKeys = (h) => h.eventsOf('dmg').flatMap((e) => moments(e, 8));
  const fxOf = (h, name) => h.eventsOf('fx').filter((e) => e[1] === name).map((e) => e[4]);
  // 菲莱 S2: the blast's hits name philae:blast, philae:blast:rage while she holds her rage
  let h = fight([{ chessId: 'chess_char_3_06_a', row: 10, col: 4 }], ['chess_char_3_06_a'], 0.1);
  const philae = h.unit('chess_char_3_06_a'), foe = h.enemy('enemy_walker');
  h.b.dealDamage(foe, philae, { amount: 10, type: 'phys' });   // "受到攻击时"
  assert.ok(has(dmgKeys(h), 'philae:blast', philae.id) && !has(dmgKeys(h), 'philae:blast:rage'), JSON.stringify(dmgKeys(h)));
  h.b.addBuff(philae, { key: 'skill:philae_rage', visible: true });
  h.run(2);
  h.b.dealDamage(foe, philae, { amount: 10, type: 'phys' });
  assert.ok(has(dmgKeys(h), 'philae:blast:rage', philae.id), JSON.stringify(dmgKeys(h)));
  // 至简 T1 忽有所悟: a won roll names malist_t_1 on that hit — some of her hits, not all
  h = fight([{ chessId: 'chess_char_3_13_a', row: 10, col: 3 }], [], 30);
  const mal = h.unit('chess_char_3_13_a');
  const mine = h.eventsOf('dmg').filter((e) => e[5] === mal.id);
  const won = mine.filter((e) => has(moments(e, 8), 'malist_t_1', mal.id));
  assert.ok(won.length > 0 && won.length < mine.length, `${won.length} of ${mine.length}`);
  // 深靛 S2: each tick on a bound enemy names indigo_s_2[damage] for a little over the interval
  h = fight([{ chessId: 'chess_char_1_17_a', row: 10, col: 3 }], ['chess_char_1_17_a'], 0.1);
  const indigo = h.unit('chess_char_1_17_a');
  h.b.applyStatus(h.enemy('enemy_walker'), 'bind', { duration: 10, source: indigo });
  h.run(2);
  const dot = dmgKeys(h).filter((m) => m[0] === 'indigo_s_2[damage]');
  assert.ok(dot.length >= 2 && dot.every((m) => m[1] === indigo.id && m[2] > 0.5 && m[2] < 1), JSON.stringify(dmgKeys(h)));
  // 海霓 S2: the kills that raise her talent — haini:up once below its max, haini:full once at it
  const weak = walker({ hp: 10 });
  h = fight([{ chessId: 'chess_char_3_09_a', row: 10, col: 3 }], ['chess_char_3_09_a'], 12,
    [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ key: 'enemy_walker', pos: [10, 4], delay: i })), weak);
  const haini = h.unit('chess_char_3_09_a');
  const stages = dmgKeys(h).filter((m) => m[0].startsWith('haini:')).map((m) => m[0]);
  assert.ok(stages.length >= 1 && stages.length <= 2 && new Set(stages).size === stages.length, JSON.stringify(stages));
  if (haini.mem.hainiMul >= 1 + 1e-9) assert.ok(stages.includes(haini.mem.hainiStage === 2 ? 'haini:full' : 'haini:up'));
  // 焰影苇草 S2: each fireball strike names her (`by`) and its cooldown (`cd`); `src` stays the carrier
  h = fight([{ chessId: 'chess_char_6_08_a', row: 10, col: 3, skillIndex: 1 }, { chessId: 'chess_char_2_08_a', row: 10, col: 4 }], ['chess_char_6_08_a'], 6);
  const reed = h.unit('chess_char_6_08_a');
  const strikes = fxOf(h, 'strike');
  assert.ok(strikes.length && strikes.every((o) => o.by === reed.id && o.cd > 0 && o.src != null), JSON.stringify(strikes));
  // 荒芜拉普兰德 S3: each drone's target in its positions' event — [id, 0 chasing / 1 held] or null
  h = fight([{ chessId: 'chess_char_6_18_a', row: 10, col: 3 }], ['chess_char_6_18_a'], 6);
  const wolves = fxOf(h, 'whitw2Drones');
  assert.ok(wolves.length && wolves.every((o) => Array.isArray(o.t) && o.t.length * 2 === o.d.length), JSON.stringify(wolves[0]));
  const marks = wolves.flatMap((o) => o.t).filter(Boolean);
  assert.ok(marks.some((m) => m[1] === 1), JSON.stringify(marks.slice(0, 4)));
});
