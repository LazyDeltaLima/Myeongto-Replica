// server/sim/content/items/effects/stacks.js — item buff behaviours: stacks that grow during a deployment — ATK per skill start, ASPD per output.
// Keyed by the official buff key (bbStr.key of the item record's battle buff); items/battle.js runs them for every record
// that carries the key, whatever its item id (items/shared.js: the entry shape and the early / late order).

import { num, battleStore, directMods, onField, tplFx } from '../../support/index.js';
import { isHpLoss } from '../../../damage.js';
import { late, chance, isAddition, procTags } from '../shared.js';

/** 有限加速器's cooldown step: its global buff's triggerInterval (act1vautochess_equip_acarm037_global_buff). */
const ACCEL_STEP = 0.2;

/** chess_item_3_04_e, chess_item_4_03_e; 规程: 灵巧涡轮手套, 乌萨斯呼吸器, 动能加速器 (and 动能轰击弩's splash) */
export const BUFFS = {
  // 灵巧涡轮手套 (规程, act3autochess_equip_acarm132_global_buff): each deployment (ON_OWNER_POST_BORN; a lent copy at once)
  //   starts [atk_speed]: every 1 s (the first 1 s in) +1 layer below atk_speed_layer_max, ASPD +attack_speed × layers; the
  //   first damage that lowers the carrier's HP (ON_APPLIED_MODIFIER IsDamage, real HP delta < 0) ends it until the next
  //   deployment. Effect trap_acarm132_buff_01 while it holds ('item:turboGlove')
  act3autochess_equip_acarm132_global_buff: late(function act3_turboGlove(battle, u, p, S) {
    const step = num(p.attack_speed), cap = Math.max(1, Math.floor(num(p.atk_speed_layer_max, 10)));
    if (!step) return;
    const key = S.key('aspd');
    let seq = null, n = 0, live = false, tick = null;
    const stop = () => {
      live = false;
      if (tick) { tick.cancel(); tick = null; }
      battle.removeBuff(u, key);
      battle.removeBuff(u, 'item:turboGlove');
    };
    const start = () => {
      if (seq === u.deploySeq) return;
      stop();
      seq = u.deploySeq;
      n = 0;
      live = true;
      S.buff(u, { key: 'item:turboGlove', visible: true, refresh: 'replace' });
      tick = S.every(1, () => {
        if (!live || !onField(u) || n >= cap) return;
        n++;
        S.buff(u, { key, mods: { aspd: step * n }, refresh: 'replace' });
      });
    };
    S.on('deploy', (c) => { if (c.unit === u) start(); });
    S.on('damaged', (c) => { if (live && c.target === u && c.amount > 0 && c.type !== 'element' && !isHpLoss(c.dmg)) stop(); });
    if (onField(u)) start();
  }),
  // 乌萨斯呼吸器 (规程, act3autochess_equip_acarm138_global_buff): every deployment of the carrier in this battle
  //   (ON_OWNER_POST_BORN, the first included) +1 layer up to layer_max — kept on the operator for the battle (a shared
  //   blackboard keyed by its chess) — and 阻挡数 +block_cnt_cell × layers, ATK +atk_cell × layers (MULTIPLIER, 直接乘算).
  //   A lent copy gives one layer's worth at once
  act3autochess_equip_acarm138_global_buff: late(function act3_ursusRespirator(battle, u, p, S, rec) {
    const bc = num(p.block_cnt_cell), ac = num(p.atk_cell), cap = Math.max(1, Math.floor(num(p.layer_max, 2)));
    const key = S.key('layers');
    const layers = battleStore(battle, 'item:ursusRespirator', () => new Map());
    const id = `${u.id}|${rec.id}`;
    const set = (n) => S.buff(u, { key, mods: { blockCnt: bc * n, ...directMods({ atk: ac * n }) }, refresh: 'replace' });
    let seq = null;
    const grow = () => {
      if (seq === u.deploySeq) return;
      seq = u.deploySeq;
      const n = Math.min(cap, (layers.get(id) ?? 0) + 1);
      layers.set(id, n);
      set(n);
    };
    S.on('deploy', (c) => { if (c.unit === u) grow(); });
    if (onField(u)) set(1);
  }),
  // 动能加速器 (规程, act3autochess_equip_acarm149_global_buff; also 动能轰击弩): each ability the carrier starts of the
  //   family ATTACK_OR_SKILL — an attack (a heal included) or a skill — +1 layer below layer_max, ASPD +attack_speed ×
  //   layers, for the deployment. At layer_max the effect trap_acarm149_buff_01 ('item:kineticMax') and, with
  //   have_splash_damage (动能轰击弩), act3autochess_equip_acarm151_global_buff: from then on each such ability start, out of
  //   its splash_cd s cooldown, Dice prob ⇒ one random enemy in the carrier's range takes a 溅射 of atk_scale × ATK
  //   physical within range_radius of it (AOEDamage reads the blackboard's range_radius; 公式 클라에서 확인 — a collider
  //   overlap), effect trap_acarm151_hit. [ASSUMED·CN: the selector act3autochess_equip_acarm151_ability is read as the
  //   text's "攻击范围内随机敌人"]
  act3autochess_equip_acarm149_global_buff: late(function act3_kineticAccel(battle, u, p, S) {
    const step = num(p.attack_speed), cap = Math.max(1, Math.floor(num(p.layer_max, 60)));
    if (!step) return;
    const splash = num(p.have_splash_damage) > 0;
    const pr = num(p.prob), sc = num(p.atk_scale, 1), r = num(p.range_radius, 1), cd = num(p.splash_cd, 0.5);
    const key = S.key('aspd');
    let seq = null, n = 0, readyAt = -Infinity;
    const fresh = () => {
      if (seq === u.deploySeq) return;
      seq = u.deploySeq;
      n = 0; readyAt = -Infinity;
      battle.removeBuff(u, key);
      battle.removeBuff(u, 'item:kineticMax');
    };
    const started = () => {
      if (!onField(u)) return;
      fresh();
      if (n >= cap) {
        if (!splash || battle.time < readyAt - 1e-9 || !chance(battle, pr)) return;
        readyAt = battle.time + cd;
        const t = battle.rng.pick(battle.enemiesInKeys(u.rangeKeys, u, u.profile));
        if (!t) return;
        for (const e of battle.foesInColliderRadius(t.x, t.y, r)) battle.dealDamage(u, e, { amount: u.s.atk * sc, type: 'phys', isSplash: true, tags: procTags('kineticSplash') });
        tplFx(battle, t, 'trap_acarm151_hit', u);
        return;
      }
      n++;
      S.buff(u, { key, mods: { aspd: step * n }, refresh: 'replace' });
      if (n >= cap) S.buff(u, { key: 'item:kineticMax', visible: true, refresh: 'replace' });
    };
    S.on('deploy', (c) => { if (c.unit === u) fresh(); });
    S.on('attack', (c) => { if (c.attacker === u) started(); });
    S.on('skillStart', (c) => { if (c.unit === u) started(); });
  }),
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
