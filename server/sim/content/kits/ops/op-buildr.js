// server/sim/content/kits/ops/op-buildr.js — 青枳 (char_488_buildr) kit: 5★ 尖兵 (先锋), a tier-3 piece of the season not out yet (shared/seasons.js `next`,
// docs/rules/diy.md 「새 시즌 팽 더 파이어 샤픈드·폰사이러스·프로스트리프·바르카리스」); both skills, the talent and SOL-X in both forms.
//
// Forms (data/seasons/next/chess.json): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, SOL-X stage 1.
// Sources: the record's tables; PRTS 青枳 (备注 of S2); charpack char_488_buildr (Talents/1, Modes/S2), skill prefab skchr_buildr_2 (ActiveOneOfBuffAbility), buff_template_data buildr_t_1,
// buildr_s_2[b], buildr_trait[e_002].
// - T1 拆迁队守则 (buildr_t_1: one trigger, `interval` s after she is deployed): max HP ×(1 + max_hp) until she leaves; each deployment starts it anew.
// - S1 冲锋号令·γ型: +cost DP at once (AUTO, no target), as 德克萨斯's.
// - S2 工程者之愿 (ActiveOneOfBuffAbility, m_spellCnt): the first use after a deployment: +cost DP, ATK +atk, DEF +def for its duration. From the second use on (`_extraBuffs`; PRTS 备注: counted
//   anew at each deployment): +cost DP again (buildr_s_2[c]), the same ATK and DEF, no end of its own, +buildr_s_2[b].cost DP every buildr_s_2[b].interval s.
// - SOL-X: while she blocks an enemy, ATK and DEF ×(1 + trait atk / def) (buildr_trait[e_002]: ON_OWNER_BLOCKEE_CHANGED).

import { num, talentBb, traitBb, skillRec, skillBbOf, toggleBuff, up } from '../shared/tier1.js';

const S1 = 'skcom_charge_cost[3]';
const S2 = 'skchr_buildr_2';
const MAX_HP = 'buildr_t[max_hp]';
const BLOCKED = 'buildr_trait[e_002_blocked]';

export default {
  char_488_buildr: (bb, chess) => {
    const t0 = talentBb(chess, 0), tb = traitBb(chess), b2 = skillRec(chess, S2)?.bb ?? {};
    const gain = (battle, unit, n) => {
      battle.addDp(unit.ownerId, n);
      battle.fx('dp', { x: unit.x, y: unit.y, n, id: unit.id });
    };
    return {
      skills: {
        [S1]: {
          kind: 'instant', trigger: 'SP_FULL',
          onStart({ battle, unit }) { gain(battle, unit, num(skillBbOf(chess, S1).cost)); },
        },
        [S2]: {
          kind: 'toggle', mods: { atkPct: num(b2.atk), defPct: num(b2.def) },
          onStart({ battle, unit, skill }) {
            gain(battle, unit, num(b2.cost));
            unit.mem.buildrCasts = (unit.mem.buildrCasts ?? 0) + 1;
            skill.timeLeft = unit.mem.buildrCasts < 2 ? Math.max(0.01, skill.duration) : Infinity;
            if (unit.mem.buildrCasts < 2) return;
            const n = num(b2['buildr_s_2[b].cost']), iv = num(b2['buildr_s_2[b].interval']);
            if (n > 0 && iv > 0) unit.mem.buildrFlow = battle.every(iv, () => battle.addDp(unit.ownerId, n), { owner: unit });
          },
          onTick({ skill, dt }) {
            if (!Number.isFinite(skill.timeLeft)) return;
            skill.timeLeft -= dt;
            if (skill.timeLeft <= 1e-9) skill.end('duration');
          },
          onEnd({ unit }) { unit.mem.buildrFlow?.cancel(); unit.mem.buildrFlow = null; },
        },
      },
      talents: [{ install(battle, unit) {
        const hp = num(t0.max_hp), iv = num(t0.interval);
        battle.on('deploy', (c) => {
          if (c.unit !== unit) return;
          unit.mem.buildrCasts = 0;
          if (!(hp > 0)) return;
          battle.removeBuff(unit, MAX_HP);
          const seq = unit.deploySeq;
          battle.after(iv, () => {
            if (up(unit) && unit.deploySeq === seq) battle.addBuff(unit, { key: MAX_HP, mods: { hpPct: hp }, tags: ['talent'] });
          }, { owner: unit });
        }, { owner: unit });
        if (num(tb.atk) || num(tb.def)) toggleBuff(battle, unit, BLOCKED, () => unit.blocking.length > 0, { atkPct: num(tb.atk), defPct: num(tb.def) });
      } }],
    };
  },
};
