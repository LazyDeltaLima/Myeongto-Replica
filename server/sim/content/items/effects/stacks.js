// server/sim/content/items/effects/stacks.js — item buff behaviours: stacks that grow during a deployment — ATK per skill start, ASPD per output.
// Keyed by the official buff key (bbStr.key of the item record's battle buff); items/battle.js runs them for every record
// that carries the key, whatever its item id (items/shared.js: the entry shape and the early / late order).

import { num, battleStore, directMods } from '../../support/index.js';
import { late, chance, isAddition } from '../shared.js';

/** 有限加速器's cooldown step: its global buff's triggerInterval (act1vautochess_equip_acarm037_global_buff). */
const ACCEL_STEP = 0.2;

/** chess_item_3_04_e, chess_item_4_03_e */
export const BUFFS = {
  // 炎国短刀: each skill start +atk (≤ atk_buff_cnt stacks) — one 直接乘算 bonus of atk × stacks. Client buff template
  // act1vautochess_acarm024_buff (this season's eff_acarm040 attaches it under the other mode's name): ON_SKILL_START Dice(prob),
  // then while buff_cnt < atk_buff_cnt CreateBuff acarm_024_buff[atk] (INFINITY, overrideEffectKey trap_acarm40_buff: the
  // 'item:yanDagger' effect, render/fxstatus.js KEY_FX) and buff_cnt + 1. buff_cnt is the global buff's own (0), and every
  // deployment attaches it anew (as 黄沙罗盘): the stacks last one deployment. Its last branch (buff_cnt == get_gold_cnt:
  // trap_acgarm_buff_02 and a sound) never runs in this season — no blackboard sets get_gold_cnt.
  act1vautochess_equip_acarm024_global_buff: late(function chess_item_3_04_e(battle, u, p, S) {
    const key = S.key('stacks');
    const cap = Math.max(1, Math.floor(num(p.atk_buff_cnt, 10)));
    let n = 0, seq = null;
    // a new deployment (its 'deploy' event, or a skill it starts before that event: a carried 部署时 skill) starts over
    const fresh = () => {
      if (seq === u.deploySeq) return;
      seq = u.deploySeq;
      n = 0;
      battle.removeBuff(u, key);
      battle.removeBuff(u, 'item:yanDagger');
    };
    S.on('deploy', (c) => { if (c.unit === u) fresh(); });
    S.on('skillStart', (c) => {
      if (c.unit !== u) return;
      fresh();
      if (!chance(battle, num(p.prob, 1)) || n >= cap) return;
      n++;
      S.buff(u, { key, mods: directMods({ atk: num(p.atk) * n }), refresh: 'replace' });
      S.buff(u, { key: 'item:yanDagger', visible: true, refresh: 'replace' });
    });
  }),
  // 有限加速器: ASPD +attack_speed per stack (≤ max_buff_cnt). Client buff template act1vautochess_acarm037_buff (this season's
  // eff_acarm052 attaches it): ON_OUTPUT_MODIFIER, while acarm037_cd is 0 — a damage the carrier outputs whose attack type is
  // not ADDITION (附加伤害: isAddition), or a heal it outputs — below the cap the derived autochess_acarm037_buff[attack_speed] is
  // finished and made again with the new total (overrideEffectKey trap_acgarm_buff_03, so its effect starts over: the
  // 'item:accel' effect and the fx 'stacks' count, render/fxstatus.js RENEWED), buff_cnt + 1 and acarm037_cd = 1. The global
  // buff's ON_BUFF_TRIGGER (triggerInterval 0.2 s, INFINITY, the first 0.2 s after it starts) sets acarm037_cd back to 0: at
  // most one stack per 0.2 s step counted from the deployment, which attaches the global buff anew (buff_cnt 0) — the stacks
  // last one deployment. The output is the `hit` (before the target's dodge) and the `heal`; its PlayAudio
  // trap_acgarm_buff_03 has no bank in the official audio table (silent). The template's atk is 0 in this season.
  act1vautochess_equip_acarm037_global_buff: late(function chess_item_4_03_e(battle, u, p, S) {
    if (!num(p.attack_speed)) return;
    const key = S.key('stacks');
    const cap = Math.max(1, Math.floor(num(p.max_buff_cnt, 60)));
    let n = 0, step = -1, seq = null;
    const fresh = () => {
      if (seq === u.deploySeq) return;
      seq = u.deploySeq;
      n = 0; step = -1;
      battle.removeBuff(u, key);
      battle.removeBuff(u, 'item:accel');
    };
    const stack = () => {
      if (!u.alive || !u.deployed) return;
      fresh();
      if (n >= cap) return;
      const s = Math.floor((battle.time - u.deployedAt) / ACCEL_STEP + 1e-6);
      if (s === step) return;
      step = s;
      n++;
      S.buff(u, { key, mods: { aspd: num(p.attack_speed) * n }, refresh: 'replace' });
      S.buff(u, { key: 'item:accel', visible: true, refresh: 'replace' });
      const made = battleStore(battle, 'item:accel', () => new Map());
      const k = (made.get(u) || 0) + 1;
      made.set(u, k);
      battle.fx('stacks', { x: u.x, y: u.y, id: u.id, buff: 'item:accel', n: k });
    };
    S.on('deploy', (c) => { if (c.unit === u) fresh(); });
    S.on('hit', (c) => { if (c.source === u && !isAddition(c.dmg)) stack(); });
    S.on('heal', (c) => { if (c.source === u && !c.opts?.regen) stack(); });
  }),
};
