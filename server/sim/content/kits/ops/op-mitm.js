// server/sim/content/kits/ops/op-mitm.js — 渡桥 (char_4147_mitm) kit: 5★ 战术家 (先锋), a tier-2 piece of the season not out yet (shared/seasons.js `next`,
// docs/rules/diy.md 「새 시즌 미틈·로베르타·클릭·퀘르쿠스」); both skills, the talent, the trait, TAC-Y in both forms, and the kit of her 援军 樱桃三号 (token_10037_mitm_trshrb).
//
// Forms (data/seasons/next/chess.json): normal = E1 Lv60, skills at rank 4, no module; elite = E2 Lv55, rank 7, TAC-Y stage 1.
// Sources: the record's tables; PRTS 渡桥, 樱桃三号 (备注); charpack char_4147_mitm (Trait mitm_tr_1, Passive die_to_kill_token, Talents/1 charge_token[born]), skill prefabs
// skchr_mitm_1 / _2, token prefab token_10037_mitm_trshrb (Modes Reborn / Default / Trash / Skill, SpawnTrash on x-5), buff_template_data mitm_s_1, mitm_s_1[cost], mitm_s_2[cost],
// mitm_s_2[to_token], trshrb_t_1[dead_listener], trshrb_t_1[trash_born], trshrb_t_1[reborn], and CheckBlocked (`_checkBlockedBySourceToken`: the blocker is a token of hers).
// - Trait: her damage on an enemy one of her tokens blocks, the 残骸 too, has ATK × atk_scale (ON_CALCULATE_DAMAGE, before DEF).
// - 樱桃三号: blocks block_cnt in 小车形态, 禁疗. A knock-out or a withdrawal puts it in its 战术点形态 for `interval` s, off the fight with its tile kept, then back at full HP; the next
//   frame a 残骸 stands on a random free melee tile of the x-5 around it: ATK and DEF −100 %, max HP × (1 + max_hp), block_cnt, no attack, gone for good when it leaves.
// - S1 遥控解体 (AUTO, instant): +cost DP at the start. At the strike a 小车 explodes for her ATK × aoe_damage_scale physical on the ground enemies of its x-5 (the trait counts: they are
//   still blocked), then withdraws: the 残骸 comes after the damage. No 小车: DP only.
// - S2 承压功率: ATK +atk, +cost DP every interval s. A 小车 at the start stops attacking with block_cnt 2 and DEF +def until the skill ends, then withdraws; one coming back during the skill is a plain 小车.
// - TAC-Y: the enemies her tokens block have taunt +taunt_level while blocked (as 伺夜's TAC-Y). Stage 1 has no 残骸 HP change and no `def`.

import { num, traitBb, skillRec, up, instantKind } from '../shared/tier1.js';
import { freeTile, groundTile, tacticalPoint } from '../shared/tier3.js';
import { absoluteRangeKeys } from '../../../targeting.js';
import { COLS, FORCED_EXIT } from '../../../constants.js';

const S1 = 'skchr_mitm_1';
const S2 = 'skchr_mitm_2';
export const CAR = 'token_10037_mitm_trshrb';
/** token prefab SpawnTrash/Selector and mitm_s_1: `_rangeId` x-5. */
const X5 = Object.freeze([[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]].map((p) => Object.freeze(p)));
const RETRY = 0.25;
/** Removal reasons that put the 小车 in its 战术点形态 ("撤退或被击倒"); 'expired' = her leaving. */
const TAC_EXITS = new Set(['killed', 'retreat', FORCED_EXIT]);
export const SKILL_FORM = 'mitm_s_2[to_token][attribute]';
export const WASTE = 'trshrb_t_1[trash_born]';
const MARK = 'token:mitm_mark';
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
/** First talent of a normalised token def holding `key`. */
const tokBb = (def, key) => (def?.talents ?? []).find((t) => t && t.bb && t.bb[key] != null)?.bb ?? {};
const isWaste = (t) => !!t.mem.mitmWaste;

export default {
  char_4147_mitm: (bb, chess) => {
    const scale = num(traitBb(chess).atk_scale, 1.5);
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const tokenId = (chess?.talents ?? []).find((t) => t && t.tokenKey)?.tokenKey ?? CAR;

    /** Her tokens, 小车 and 残骸, placed or summoned. */
    const tokensOf = (battle, unit) => battle.allyUnits.filter((t) => t.kind === 'token' && t.defId === tokenId && t.ownerUnit === unit);
    const carsOf = (battle, unit) => tokensOf(battle, unit).filter((t) => !isWaste(t));
    const carUp = (battle, unit) => carsOf(battle, unit).find((t) => up(t)) ?? null;
    const isMine = (u, t) => !!t && t.kind === 'token' && t.defId === tokenId && t.ownerUnit === u;

    const wasteKit = (def) => {
      const t = tokBb(def, 'trshrb_t_1[trash_born].block_cnt');
      return {
        skill: null,
        trait: { noAttack: true },
        talents: [],
        install(battle, w) {
          w.mem.mitmWaste = true;
          battle.addBuff(w, {
            key: WASTE, persist: true, allowDead: true, flags: { noHeal: true },
            mods: {
              blockCnt: num(t['trshrb_t_1[trash_born].block_cnt'], 1), hpPct: num(t['trshrb_t_1[trash_born].max_hp'], -0.5),
              atkPct: num(t['trshrb_t_1[trash_born].atk'], -1), defPct: num(t['trshrb_t_1[trash_born].def'], -1),
            },
          });
        },
      };
    };

    /** The 残骸 of a 小车 that just left: a random free melee tile of its x-5, none when there is none. */
    const spawnWaste = (battle, owner, car) => {
      if (!up(owner)) return;
      const keys = absoluteRangeKeys(X5, car.homeR ?? car.tileR, car.homeC ?? car.tileC, car.dir, 0);
      const self = (car.homeR ?? car.tileR) * COLS + (car.homeC ?? car.tileC);
      const tiles = keys.filter((k) => k !== self).map((k) => [(k / COLS) | 0, k % COLS]).filter(([r, c]) => freeTile(battle, r, c) && groundTile(battle, r, c));
      if (!tiles.length) return;
      const [r, c] = battle.rng.pick(tiles);
      const w = battle.spawnToken(owner, tokenId, r, c, { kit: wasteKit(battle.tokenDef(tokenId, owner)) });
      if (w) { battle.fx('summon', { x: w.x, y: w.y, id: w.id, src: owner.id, token: tokenId }); }
    };

    const carKit = (owner, def) => {
      const t = tokBb(def, 'interval');
      const refresh = num(t.interval, 15), block = num(t.block_cnt, 1);
      return {
        skill: null,
        talents: [],
        install(battle, car) {
          battle.addBuff(car, { key: 'trshrb_t_1[block_cnt]', mods: { blockCnt: block }, flags: { noHeal: true }, persist: true, allowDead: true });
          battle.on('death', (ctx) => {
            if (ctx.unit !== car || battle.finished || !TAC_EXITS.has(ctx.reason) || !up(owner)) return;
            car.removed = false;
            const seq = (car.mem.mitmTacSeq ?? 0) + 1;
            car.mem.mitmTacSeq = seq;
            car.mem.mitmTac = seq;
            battle.fx('disappear', { x: car.x, y: car.y, id: car.id });
            battle.after(battle.dt, () => { if (car.mem.mitmTac === seq) spawnWaste(battle, owner, car); }, { owner: car });
            const back = () => {
              if (car.mem.mitmTac !== seq || battle.finished || car.alive || car.removed) return;
              if (!up(owner)) { car.mem.mitmTac = 0; return; }
              if (battle.redeploy(car, { free: true })) { car.mem.mitmTac = 0; battle.fx('summon', { x: car.x, y: car.y, id: car.id, src: owner.id, token: tokenId }); return; }
              battle.after(RETRY, back, { owner: car });
            };
            battle.after(refresh, back, { owner: car });
          }, { owner: car, priority: -10 });
        },
      };
    };

    return {
      // the 援军 is 樱桃三号: no engine generic 援军
      trait: {
        install() {},
        dmgMul: (battle, unit, target) => (isMine(unit, target?.blockedBy) ? scale : 1),
      },
      skills: {
        [S1]: {
          kind: instantKind({ skill: { maxCharges: num(skillRec(chess, S1)?.maxChargeTime, 1) } }),
          onStart({ battle, unit }) {
            const n = num(b1.cost);
            if (n > 0) { battle.addDp(unit.ownerId, n); battle.fx('dp', { x: unit.x, y: unit.y, n, id: unit.id }); }
          },
          onStrike({ battle, unit }) {
            const car = carUp(battle, unit);
            if (!car) return;
            const keys = absoluteRangeKeys(X5, car.tileR, car.tileC, car.dir, 0);
            const atk = unit.s.atk * num(b1.aoe_damage_scale);
            battle.fx('aoe', { x: car.x, y: car.y, radius: 1, id: unit.id, skill: 'mitm:s1' });
            for (const e of battle.enemiesInKeys(keys, unit, { canHitFly: false, groundOnly: true })) {
              battle.dealDamage(unit, e, { amount: atk * (isMine(unit, e.blockedBy) ? scale : 1), type: 'phys', isSkill: true, canDodge: false, tags: ['skill', 'mitm:s1'] });
            }
            if (up(car)) battle.retreat(car, { reason: 'retreat' });
          },
        },
        [S2]: {
          kind: 'duration',
          mods: { atkPct: num(b2.atk) },
          targeting: { maxTargets: Math.max(1, Math.floor(num(b2['attack@max_target'], 1))) },
          onStart({ battle, unit }) {
            unit.mem.mitmCost = { paid: 0, at: battle.time };
            const car = carUp(battle, unit);
            unit.mem.mitmS2Car = car;
            if (!car) return;
            const base = num(tokBb(car.def, 'block_cnt').block_cnt, 1);
            battle.addBuff(car, {
              key: SKILL_FORM, source: unit, flags: { disarm: true }, visible: true, tags: ['skill'],
              mods: { blockCnt: num(b2['mitm_s_2[to_token].block_cnt'], 2) - base, defPct: num(b2['mitm_s_2[to_token].def']) },
            });
          },
          onTick({ battle, unit }) {
            const c = unit.mem.mitmCost, iv = num(b2['mitm_s_2[cost].interval']), each = num(b2['mitm_s_2[cost].cost'], 1);
            if (!c || !(iv > 0)) return;
            while (battle.time + 1e-9 >= c.at + (c.paid + 1) * iv) {
              c.paid++;
              battle.addDp(unit.ownerId, each);
              battle.fx('dp', { x: unit.x, y: unit.y, n: each, id: unit.id });
            }
          },
          onEnd({ battle, unit, reason }) {
            const c = unit.mem.mitmCost;
            unit.mem.mitmCost = null;
            const car = unit.mem.mitmS2Car;
            unit.mem.mitmS2Car = null;
            // the 12th step falls on the last tick of a skill that ran its time
            if (c && reason !== 'death') {
              const rest = num(b2['mitm_s_2[cost].display']) - c.paid;
              if (reason === 'duration' && rest > 0) battle.addDp(unit.ownerId, rest * num(b2['mitm_s_2[cost].cost'], 1));
            }
            if (car?.findBuff(SKILL_FORM)) {
              battle.removeBuff(car, SKILL_FORM);
              if (up(car)) battle.retreat(car, { reason: 'retreat' });
            }
          },
        },
      },
      talents: [
        { install(battle, unit) { // 废品战车: her placed piece runs its kit (set up here, before the battle starts — as 可露希尔's 指挥中心)
          for (const t of tokensOf(battle, unit)) {
            if (t.alive || t.deployed) continue;
            if (t.kit) battle.offOwner(t);
            battle._setupUnit(t, carKit(unit, t.def));
          }
          const summon = () => {
            if (!up(unit)) return;
            const ps = carsOf(battle, unit);
            const live = ps.find((t) => up(t));
            if (live) { unit.trait.reinforcement = live; return; }
            if (ps.some((t) => !t.alive && !t.removed && t.mem.mitmTac)) return; // in its 战术点形态: back by itself
            const waiting = ps.find((t) => !t.alive && !t.removed);
            if (waiting && battle.redeploy(waiting, { free: true })) {
              unit.trait.reinforcement = waiting;
              battle.fx('summon', { x: waiting.x, y: waiting.y, id: waiting.id, src: unit.id, token: tokenId });
              return;
            }
            const board = ps.find((t) => t.uid != null);
            const tile = tacticalPoint(battle, unit, board ? [board.homeR, board.homeC] : null);
            if (!tile) return;
            const t = battle.spawnToken(unit, tokenId, tile[0], tile[1], { kit: carKit(unit, battle.tokenDef(tokenId, unit)) });
            if (!t) return;
            unit.trait.reinforcement = t;
            battle.fx('summon', { x: t.x, y: t.y, id: t.id, src: unit.id, token: tokenId });
          };
          battle.on('deploy', (ctx) => {
            if (ctx.unit === unit) { summon(); return; }
            if (isMine(unit, ctx.unit) && !isWaste(ctx.unit)) unit.trait.reinforcement = ctx.unit;
          }, { owner: unit });
          // die_to_kill_token: her leaving takes her tokens with her, no 战术点形态
          battle.on('death', (ctx) => {
            if (ctx.unit !== unit) return;
            for (const t of tokensOf(battle, unit)) {
              if (t.alive) battle.retreat(t, { reason: 'expired', permanent: true });
              t.mem.mitmTac = 0;
            }
            unit.trait.reinforcement = null;
          }, { owner: unit });
          // TAC-Y: taunt on the enemies her tokens block, while blocked
          const taunt = num(tokBb(battle.tokenDef(tokenId, unit), 'taunt_level').taunt_level);
          if (taunt > 0) {
            battle.on('tick', () => {
              for (const t of tokensOf(battle, unit)) {
                if (!up(t)) continue;
                for (const e of t.blocking) {
                  if (e.alive && e.blockedBy === t) battle.addBuff(e, { key: MARK, duration: 0.25, refresh: 'extend', mods: { taunt }, source: t, visible: true });
                }
              }
            }, { owner: unit });
          }
        } },
      ],
    };
  },
};
