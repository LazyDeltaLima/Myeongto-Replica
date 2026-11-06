// server/sim/content/kits/ops/op-robrta.js — 罗比菈塔 (char_484_robrta) kit: 4★ 工匠 (辅助), a tier-3 piece of the season not out yet (shared/seasons.js `next`,
// docs/rules/diy.md 「새 시즌 미틈·로베르타·클릭·퀘르쿠스」); both skills, the talent, CRA-X in both forms, and the kit of her <支援装置> 全自动造型仪 (token_10018_robrta_mach).
//
// Forms (data/seasons/next/chess.json): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, CRA-X stage 1.
// Sources: the record's tables; PRTS 罗比菈塔, 全自动造型仪 (备注), 分支特性信息 工匠; charpack char_484_robrta (Talents/1 charge_token[refresh]), skill prefabs skchr_robrta_1 / _2, token
// prefab token_10018_robrta_mach (Talents/1 and 1+, `_passiveBuffs`, `_tileOptions`), buff_template_data robrta_mach_t, robrta_mach_t[mode], charge_token[refresh], trigger_charge_token,
// withdraw_target_as_dead_when_buff_finish, and Deck.TokenCard.Recharge (`refreshRemainingCnt`: the holding becomes cnt, at most the cap, instead of adding).
// - 造型仪调试: each deployment sets her holding to cnt (cap cnt, +1 with CRA-X; the module's cost is in the token's data). CRA-X's trigger_charge_token is on the undeployed card
//   (`_attachPassiveBuffsOnDummy`). [ASSUMED·엔진: that +1 comes before the deployment's refresh, which overwrites it, so only S2 reaches the cap; the order was not read] A placed machine deploys free at the battle
//   start, and one that left comes back on its tile as her other <支援装置> do (op-ironmn.js deviceReturn: its redeploy time, one held, its cost, she on the field).
// - The machine: no attack, 禁疗, 无敌, never targeted; it leaves `duration` s after each deployment (the passive robrta_mach_withdraw, as dead). A unit on a melee tile of its range (the tile it faces)
//   has DEF +def while there (one machine's: 不叠加), and hit-count shields from the machine's count, which is the machine's own: what one unit used the next one does not get (PRTS 「总次数可分别作用于
//   先后部署于其作用格的多个单位」). The count is the one the talent's text names (Talents/1+ at E2: 2). Operators and summons (professionMask, PRTS), no other device.
//   [ASSUMED·엔진: two machines facing one unit keep a shield each; whether the client's same-key buff replaces is not read]
// - S1 叙拉古式上妆: ATK +atk, DEF +def. S2 全自动造型仪: no attack, block +block_cnt, DEF +def; +robrta_s_2[recharge].cnt held as it ends.

import { num, talentBb, traitBb, skillRec, up } from '../shared/tier1.js';
import { deviceState, deviceReturn, devicesLeaveWithOwner, rechargeDevices } from './op-ironmn.js';
import { COLS } from '../../../constants.js';

const S1 = 'skchr_robrta_1';
const S2 = 'skchr_robrta_2';
export const MACH = 'token_10018_robrta_mach';
export const DEF_KEY = 'robrta_mach_t[def]';
export const SHIELD_KEY = 'robrta_mach_t';
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const tokBb = (def, key) => (def?.talents ?? []).find((t) => t && t.bb && t.bb[key] != null) ?? null;
/** "获得2层护盾": no blackboard key holds the count (the prefab's Talents/1 and 1+ differ). */
const shieldCount = (def) => {
  const m = String(tokBb(def, 'def')?.description ?? tokBb(def, 'def')?.desc ?? '').match(/(\d+)层/);
  return m ? +m[1] : 1;
};

export default {
  char_484_robrta: (bb, chess) => {
    const t0 = talentBb(chess, 0), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const charge = Math.floor(num(t0.cnt)), extra = Math.floor(num(traitBb(chess).cnt));
    const tokenId = (chess?.talents ?? []).find((t) => t && t.tokenKey)?.tokenKey ?? MACH;

    const machKit = (def) => {
      const t = tokBb(def, 'def')?.bb ?? {};
      const defUp = num(t.def), life = num(t.duration), hits = shieldCount(def);
      return {
        skill: null,
        trait: { noAttack: true },
        talents: [],
        install(battle, m) {
          battle.addBuff(m, { key: 'robrta_mach_invincible', flags: { invulnerable: true, untargetable: true, noHeal: true }, persist: true, allowDead: true });
          const skey = `${SHIELD_KEY}:${m.id}`;
          /** The unit it serves now: on a melee tile of its range, an operator or a summon that is no device. */
          const target = () => {
            for (const k of m.rangeKeys || []) {
              const a = battle.unitAt((k / COLS) | 0, k % COLS);
              if (!up(a) || a === m || a.side !== 'ally' || a.ownerId !== m.ownerId) continue;
              if (a.kind !== 'op' && (a.kind !== 'token' || a.s.flags.invulnerable)) continue;
              if (battle.grid.canStand(a.tileR, a.tileC) && !a.hidden) return a;
            }
            return null;
          };
          const release = () => {
            const a = m.mem.machTarget;
            if (!a) return;
            const s = a.findBuff(skey);
            // (a unit that left has lost its buffs: the count of the last tick stands)
            if (s) { m.mem.machLeft = s.shieldHits; battle.removeBuff(a, s); }
            const d = a.findBuff(DEF_KEY);
            if (d && d.source === m) battle.removeBuff(a, d);
            m.mem.machTarget = null;
          };
          battle.on('deploy', (ctx) => {
            if (ctx.unit !== m) return;
            m.mem.machLeft = hits;
            m.mem.machTarget = null;
            const seq = m.deploySeq;
            if (life > 0) battle.after(life, () => { if (m.alive && m.deploySeq === seq) battle.retreat(m, { reason: 'retreat' }); }, { owner: m });
          }, { owner: m });
          battle.on('tick', () => {
            if (!up(m)) return;
            const a = target();
            const cur = m.mem.machTarget;
            if (cur && cur !== a) release();
            if (!a) return;
            if (cur === a) {
              const s = a.findBuff(skey);
              m.mem.machLeft = s ? s.shieldHits : 0;
            } else {
              m.mem.machTarget = a;
              if (m.mem.machLeft > 0) battle.addBuff(a, { key: skey, shieldHits: m.mem.machLeft, source: m, visible: true, tags: ['talent', 'device'] });
            }
            // 防御加成不叠加: one machine's at a time; the next one takes over when it goes
            const d = a.findBuff(DEF_KEY);
            if (!d) battle.addBuff(a, { key: DEF_KEY, mods: { defPct: defUp }, source: m, visible: true, tags: ['talent', 'device'] });
          }, { owner: m });
          battle.on('death', (ctx) => { if (ctx.unit === m) release(); }, { owner: m, priority: 10 });
        },
      };
    };

    return {
      skills: {
        [S1]: { kind: 'duration', mods: { atkPct: num(b1.atk), defPct: num(b1.def) } },
        [S2]: {
          kind: 'duration', mods: { defPct: num(b2.def), blockCnt: num(b2.block_cnt) }, attack: { noAttack: true },
          onEnd({ unit, reason }) { if (reason !== 'death') rechargeDevices(unit, Math.floor(num(b2['robrta_s_2[recharge].cnt'], 1))); },
        },
      },
      talents: [{ install(battle, unit) {
        const st = deviceState(unit);
        st.cap = charge + extra;
        for (const t of battle.allyUnits) {
          if (t.kind !== 'token' || t.defId !== tokenId || t.ownerUnit !== unit || t.alive || t.deployed) continue;
          if (t.kit) battle.offOwner(t);
          battle._setupUnit(t, machKit(t.def));
          deviceReturn(battle, t, unit);
          st.devices.add(t);
        }
        // charge_token[refresh]: the holding becomes cnt
        battle.on('deploy', (ctx) => { if (ctx.unit === unit) st.stock = Math.min(st.cap, charge); }, { owner: unit });
        devicesLeaveWithOwner(battle, unit);
      } }],
    };
  },
};
