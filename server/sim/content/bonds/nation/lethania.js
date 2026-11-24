// server/sim/content/bonds/nation/lethania.js — 莱塔尼亚 (lethaniaShip, 卫戍协议：规程).
//
//   act3autochess_bond_eff_lethania   (bondeffect_lethania) members ATK +(atk_base + atk_per_stack·L). The enemies of the
//                                     field carry [enemy] ([enemy][stripbb]: UNIQUE, the first 莱塔尼亚 player's index):
//                                     knocked down (HP_ZERO, HP_ZERO_WITH_NO_SOURCE, FALLDOWN) it runs [summoner] where it
//                                     fell. 6 of the player's own (AutoChessAssignBondCharCntToBB without …InCurArea): the
//                                     members carry _power — knocked down, the same [summoner] where they fell.
//   [summoner]                        cap summon_cnt_max_2 when a player of the field has 6 (…InCurArea), else
//                                     summon_cnt_max_1, over the player's live summons (global blackboard
//                                     `<index>.bond_eff_lethania[summon_cnt]`, +1 / −1 by [summoned]); below it a Dice of
//                                     min(summon_prob_max, base + per·L) (L the field's highest 莱塔尼亚 layers), then with
//                                     6 on the field and a Dice of min(big_prob_max, base + per·L) “一个乐部”
//                                     (enemy_9026_acltm), else “一个小节” (enemy_9025_aclts), on the nearest passable tile
//                                     (bonds/walker.js: a walking ally built from the enemy record)
//   [summoned]                        on each summon: ATK +(atk_base + atk_per_stack·L) (MULTIPLIER, the field's highest
//                                     layers, again every 0.3 s — here as the layers change)
//   “一个乐部”                         its talent Aura (base_attack_speed 20): 莱塔尼亚 operators ASPD +20 while it is on the
//                                     field (bond text 「在场时使【莱塔尼亚】干员攻速+20」), each 乐部 its own +20: the table's
//                                     acltm[atk-spd] gives every 莱塔尼亚 operator a derived acltm[atk-spd-core]
//                                     (disableOverride, ended with its 乐部 — FinishDerivedBuff), so two 乐部 give +40; the
//                                     core's stack term (attack_speed_per_stack) is 0 in the talent; its Sk1 (SP INCREASE_WHEN_ATTACK,
//                                     3): after 3 attacks the next one strikes twice (「造成3次攻击后下一次攻击进行2连击」)
// Numbers: the season's bonds.json `buffs[].bb`, every buff of the record together (shared.js recordBb).
// [추정·CN: the aura is the summoning player's 莱塔尼亚 operators' (the node does not say whose); Sk1's second hit comes 0.234 s after the first (the two OnAttack frames of its Skill
// clip, 0.533 / 0.767 s); a field shared by two 莱塔尼亚 players gives the enemies' summons to the first one installed]

import * as S from '../../support/index.js';
import { num, reached, fieldMaxLayers, standing } from '../shared.js';
import { spawnWalker, nearestGroundTile } from '../walker.js';
/** @import { Battle } from '../../../Battle.js' */
/** @import { Unit } from '../../../units.js' */
/** @import { BondInstaller, BondTemplate, BondBb } from '../shared.js' */
/** @import { DeathEv } from '../../support/index.js' */

const SMALL = 'enemy_9025_aclts', BIG = 'enemy_9026_acltm';
/** The two OnAttack frames of “一个乐部”'s Skill clip (enemy spine `hits.Skill`): its Sk1 strikes twice, this far apart. */
const BIG_SECOND_HIT = 0.767 - 0.533;

/**
 * The field's 莱塔尼亚 state: the player whose enemies' deaths summon, each player's live summons, its 乐部 and members.
 * @param {Battle} battle
 * @returns {{ owner: string | null, live: Map<string, number>, big: Map<string, number>, members: Map<string, Unit[]> }}
 */
function store(battle) {
  return S.battleStore(battle, 'bond:lethania', () => ({ owner: null, live: new Map(), big: new Map(), members: new Map() }));
}

/** Does a player of the field have `cnt` 莱塔尼亚 members (…InCurArea)? @param {Battle} battle @param {unknown} cnt */
function fieldReached(battle, cnt) {
  return battle.players.some((/** @type {{ playerId: string }} */ p) => reached(battle, p.playerId, 'lethaniaShip', cnt));
}

/** The [summoned] ATK of a summon, from the field's highest 莱塔尼亚 layers. @param {Battle} battle @param {BondBb} bb @param {Unit} u */
function summonedAtk(battle, bb, u) {
  if (!u.alive) return;
  const L = Math.max(0, fieldMaxLayers(battle, 'lethaniaShip', 0));
  S.passiveBuff(battle, u, 'bond:lethania:summoned', S.directMods({ atk: num(bb.atk_base) + num(bb.atk_per_stack) * L }));
}

/** 一个乐部's aura on `pid`'s members: ASPD +base_attack_speed for each of the player's 乐部 on the field (header). @param {Battle} battle @param {string} pid */
function syncAura(battle, pid) {
  const st = store(battle);
  const members = st.members.get(pid) ?? [];
  const n = st.big.get(pid) ?? 0;
  const rec = battle.data.rawEnemy?.(BIG);
  const tal = rec?.talents && !Array.isArray(rec.talents) ? rec.talents.bb ?? {} : {};
  const aspd = num(tal['Aura.base_attack_speed'], 0) * n;
  for (const m of members) {
    if (aspd) S.passiveBuff(battle, m, 'bond:lethania:aura', { aspd });
    else battle.removeBuff(m, 'bond:lethania:aura');
  }
}

/** “一个乐部”'s Sk1: after 3 attacks the 4th strikes twice. @param {Battle} battle @param {Unit} u */
function bigSkill(battle, u) {
  let sp = 0, extra = false;
  battle.on('attack', (/** @type {{ attacker: Unit, targets: Unit[] }} */ c) => {
    if (c.attacker !== u || extra) return;
    if (sp < 3) { sp++; return; }
    sp = 0;
    const targets = c.targets.slice();
    battle.after(BIG_SECOND_HIT, () => {
      if (!u.alive || !u.deployed) return;
      const live = targets.filter((t) => t && t.alive);
      if (!live.length) return;
      extra = true;
      try { battle.forceAttack(u, live); } finally { extra = false; }
    }, { owner: u });
  }, { owner: u });
}

/** [summoner] for player `pid` where `at` fell. @param {Battle} battle @param {string} pid @param {BondBb} bb @param {Unit} at */
function summon(battle, pid, bb, at) {
  const st = store(battle);
  const six = fieldReached(battle, bb.power_bond_char_cnt);
  const cap = num(six ? bb.summon_cnt_max_2 : bb.summon_cnt_max_1, 0);
  if ((st.live.get(pid) ?? 0) >= cap) return;
  const L = Math.max(0, fieldMaxLayers(battle, 'lethaniaShip', 0));
  const p = Math.min(num(bb.summon_prob_max, 1), num(bb.summon_prob_base) + num(bb.summon_prob_per_stack) * L);
  if (!battle.rng.chance(p)) return;
  const pBig = Math.min(num(bb.big_prob_max, 1), num(bb.big_prob_base) + num(bb.big_prob_per_stack) * L);
  const big = six && battle.rng.chance(pBig);
  const tile = nearestGroundTile(battle, at.x, at.y);
  if (!tile) return;
  const key = big ? BIG : SMALL;
  const u = spawnWalker(battle, pid, key, tile[0], tile[1], {
    onDeath: () => {
      st.live.set(pid, Math.max(0, (st.live.get(pid) ?? 0) - 1));
      if (big) { st.big.set(pid, Math.max(0, (st.big.get(pid) ?? 0) - 1)); syncAura(battle, pid); }
    },
  });
  if (!u) return;
  st.live.set(pid, (st.live.get(pid) ?? 0) + 1);
  summonedAtk(battle, bb, u);
  battle.on('layerGain', () => battle.after(0, () => summonedAtk(battle, bb, u), { owner: u }), { owner: u, priority: -100 });
  if (big) {
    st.big.set(pid, (st.big.get(pid) ?? 0) + 1);
    syncAura(battle, pid);
    bigSkill(battle, u);
  }
}

/** @type {BondInstaller} */
function installLethania(battle, pid, bb, members) {
  standing(battle, pid, 'lethaniaShip', members, 'bond:lethania', { atk: [bb.atk_base, bb.atk_per_stack] });
  const st = store(battle);
  st.members.set(pid, members);
  const died = (/** @type {DeathEv} */ c) => c.reason === 'killed';
  if (st.owner == null) {
    st.owner = pid;
    battle.on('death', (/** @type {DeathEv} */ c) => { if (c.unit.side === 'enemy' && died(c)) summon(battle, pid, bb, c.unit); });
  }
  if (reached(battle, pid, 'lethaniaShip', bb.power_bond_char_cnt)) {
    const set = new Set(members);
    battle.on('death', (/** @type {DeathEv} */ c) => { if (set.has(c.unit) && died(c)) summon(battle, pid, bb, c.unit); });
  }
}

/** @type {Readonly<Record<string, BondTemplate>>} */
export const TEMPLATES = Object.freeze({
  act3autochess_bond_eff_lethania: { bond: 'lethaniaShip', battle: installLethania, bb: 'record' },
});
