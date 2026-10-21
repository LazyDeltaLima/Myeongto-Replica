// test/sim/enemy-buff-tags.test.js — 2026-10-21 (docs/rules/fx.md 「적 상태의 버프 이펙트」): an enemy's sim status that stands
// for one of its client buffs names that buff in its status event (`fxTag` 'buff:<client buff keys>', sent as `fx`), so the
// render draws the enemy's own buff effect; and 重弩突袭者's 直击 picks its target with the client's uneven same-line
// offsets (AdvancedSelectorWithTrapSheltr `_checkOnTheSameLine`: X −0.5…0.5, Y −0.5…0.1 of its position minus the target's).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const E = JSON.parse(fs.readFileSync(new URL('../../data/enemies.json', import.meta.url), 'utf8'));
const WALL = (id) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
const NOATK = () => ({ trait: { noAttack: true } });
function arena(o = {}) {
  return makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    defs: { chess: { t_wall: WALL('t_wall') } }, kits: { t_wall: NOATK }, enemies: [], ...o,
  });
}
const put = (h, key, pos) => h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: 0 } });
const tagOf = (h, id, key) => h.eventsOf('status').find((x) => x[1] === id && x[2] === key && x[3] === 1)?.[5]?.fx ?? null;

test('leaders: the statuses standing for their client buffs name them (杰斯顿 狱警, 扎罗 first form, 鼠王 / 泥岩 barriers)', () => {
  const h = arena();
  h.step();
  const jakill = put(h, 'enemy_1516_jakill', [5, 8]);
  const wolf = put(h, 'enemy_1535_wlfmster', [6, 8]);
  const mouse = put(h, 'enemy_1509_mousek', [7, 8]);
  const rock = put(h, 'enemy_1511_mdrock', [8, 8]);
  h.run(0.2);
  assert.equal(tagOf(h, jakill.id, 'ab:warden'), 'buff:jakill_enhance#0');
  assert.equal(tagOf(h, wolf.id, 'ab:wolfGuard'), 'buff:enemy_wlfmster_reduce_damage');
  assert.equal(tagOf(h, mouse.id, 'ab:sandDef'), 'buff:mousek_shield[a]|mousek_shield[b]|mousek_shield[c]');
  assert.equal(tagOf(h, rock.id, 'ab:rockPower'), 'buff:enemy_mdrock_s_2[shield_a]|enemy_mdrock_s_2[shield_b]|enemy_mdrock_s_2[shield_c]');
});

test('a half-HP rage names its client toggle buff', () => {
  const h = arena();
  h.step();
  const e = put(h, 'enemy_1500_skulsr', [5, 8]);
  h.run(0.1);
  h.b.dealDamage(null, e, { amount: e.s.maxHp * 0.6, type: 'true' });
  h.run(0.2);
  assert.equal(tagOf(h, e.id, 'ab:lowhp'), 'buff:skulsr_t_1');
});

test('重弩突袭者 直击: a unit up to 0.5 above it is in line, one 0.4 below is not (client Y offsets −0.5…0.1)', () => {
  const s = E.enemy_1404_msnip.skills.find((x) => x.prefabKey === 'CrossAttack');
  const shotAt = (dy) => {
    const h = arena({ units: [{ chessId: 't_wall', row: 9, col: 4 }] });
    h.step();
    const e = put(h, 'enemy_1404_msnip', [9, 8]);
    e.y += dy;
    h.run(s.initCooldown + 0.3);
    return !!e.findBuff('ab:revealed');
  };
  assert.equal(shotAt(0), true, 'the same row');
  assert.equal(shotAt(-0.4), true, 'the unit 0.4 above it (its y − the unit\'s = −0.4)');
  assert.equal(shotAt(0.4), false, 'the unit 0.4 below it: out of line (until 2026-10-21 ±0.5 took it)');
  assert.equal(shotAt(0.05), true, 'within the 0.1');
});
