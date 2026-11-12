// server/sim/content/kits/ops/op-makoto.js — 结城理 (char_4217_makoto), 6★ 傀儡师 (特种): a 联动 operator only the CN server
// has (Persona 3 Reload), offered as a 自选 pick (maintainer decision 2026-11-12). Official CN tables (character_table,
// skill_table, battle_equip_table / uniequip_table as built into data/backups.json), the CN client's prefabs (charpack
// char_4217_makoto: the modes Default / Stand_S1 / Stand_S2 / Stand_S3_1 / Stand_S3_2 / Switch2Normal and the
// makoto[switch2*] sequence abilities; the skill prefabs skchr_makoto_1..3) and its 34 makoto_* buff templates. Every
// class of the charpack has its EN counterpart; six buff-template nodes are CN-only — SetCastSkillManualTriggerOnly,
// SplitDamageByMultiAttack, AssignAllBlackboardFromAnotherBuff, CheckDamageType and two of the animator — and what their
// fields leave open is [ASSUMED·CN] below (docs/rules/diy.md 「유키 마코토」).
//
// The 傀儡师 trait is the shared one (professions.js installDollkeeper: a lethal hit or a direct `dollSwitch` starts the
// 2 s switch, the <替身> holds 阻回 and blocks nothing for the trait's `duration` s, then switches back; the switch clears
// the statuses and the 技力 and leaves the form at full HP). What is his own:
// - every skill is "被动：<替身>状态召唤<persona>… 主动：立即切换为<替身>状态作战": the cast (makoto_s<n>_trigger) switches to
//   the <替身> at once, and whichever way the <替身> starts (cast or lethal hit) the persona of the picked skill fights;
// - 不羁之力 (talent 1, makoto_standin / makoto_standin_t1_max_hp): in the <替身> ATK +atk, base attack time +base_attack_time
//   s, max HP +max_hp_t1 (and the PUM-Y trait's +max_hp: makoto_tr MAX_HP, a second MULTIPLIER); switching to it from the
//   <本体> (makoto_switchbegin CheckUnitCurrentMode 0) gives 停顿 for `sluggish` s to every enemy in its range_id (x-1);
// - the personas (the modes' attacks, range x-1 — every skill's rangeId, AutoLoadBoxRange of the mode):
//   S1 俄耳甫斯: an ally (ground or air) under 50 % HP in range is healed heal_scale × ATK (HealAlly_Lt50Per, the lowest
//     HP ratio first), else one ground enemy takes atk_scale × ATK arts (MagicAttack, projectile_chr_makoto_s1);
//   S2 塔纳托斯: up to max_target ground enemies take atk_scale × ATK arts (makoto_s2_fear_damage) and each is feared
//     `fear` s with chance `prob` (makoto_s2_fear_possibility); its aura (every 0.1 s, ground and air) knocks out a
//     feared enemy whose HP is below kill_atk_scale × ATK (kill_damage 无来源 true damage, makoto_s2_fear_aura_inst_kill);
//   S3 塔纳托斯 then 俄耳甫斯: up to max_target enemies, ground or air, take atk_scale × ATK 弱点伤害 (common_weak_damage:
//     arts or physical, whichever the target resists less) with ATTACK_SPEED +talent@attack_speed; a lethal hit then
//     (makoto_tr in mode 3) switches to 俄耳甫斯 for the rest of the <替身> time: no attack, block_cnt, the allies of the
//     range (operators, makoto_s3_2_aura professionMask) get `prob` physical and arts 闪避, and every `interval` s the
//     max_target_heal most injured of them are healed heal_scale × ATK half a second later (makoto[s3_heal_others],
//     makoto_s3_2_be_healed). A lethal hit as 俄耳甫斯 — or as the S1 / S2 persona — knocks him out (no makoto_tr branch).
// - S.E.E.S.队长 (talent 2, makoto_talent_2 / makoto_on_enter_normal): when the <替身> time runs out (not when he is knocked
//   out), the switch back is the 总攻击: 1.6 s after it starts (makoto_allout_attack_damage triggerInterval) every enemy,
//   ground or air, in range_id x-1 around each S.E.E.S. member (CreateBuffToCertainGroupId 'sees': every 结城理 on the
//   field — teammates' too, "可叠加") takes atk_scale × his ATK true damage (multi_attack_total_cnt 1).

import { num, talentBb, traitBb, skillRec, batMod, up } from '../shared/tier1.js';
import { absoluteRangeKeys } from '../../../targeting.js';
import { COLS } from '../../../constants.js';
import { hasHp } from '../../../damage.js';
import { weaknessRetype } from '../../items/shared.js';

const CHAR = 'char_4217_makoto';
const S1 = 'skchr_makoto_1', S2 = 'skchr_makoto_2', S3 = 'skchr_makoto_3';
/** HealAlly_Lt50Per (AdvancedSelectorWithinHpRatio `_maxHpRatio` 0.5): "生命值低于50%". */
const HEAL_BELOW = 0.5;
/** makoto_s2_fear_aura_inst_kill: the AuraAbility buff's triggerInterval. */
const KILL_TICK = 0.1;
/** makoto_on_enter_normal → makoto_allout_attack_damage: triggerInterval 1.6 s (waitFirstTriggerInterval). */
const ALLOUT_DELAY = 1.6;
/** makoto[s3_heal_others] → makoto_s3_2_be_healed: the heal lands as that 0.5 s buff ends (ON_BUFF_FINISH ApplyHeal). */
const HEAL_DELAY = 0.5;
/** makoto_s3_2_aura TargetValidator professionMask 639: every profession but TOKEN / TRAP — operators, no summon or device. */
const operator = (a) => a.kind !== 'token' && a.kind !== 'device';
/** makoto[switch2stand_s3_2]: Die2Stand Doll_Skill_3_P1toP2_ChangeBegin 0.5 s + SwitchEnd Doll_Skill_3_P1toP2_ChangeEnd 1 s
 *  (`_timeMode` 1, `_maxAnimScale` 1: each step lasts its clip — the model's clip lengths; the mode switches 0.99 s into the
 *  second, makoto_delayed_switchend). */
export const S3_CHANGE = 1.5;
/** The 替身's block: makoto_stand[block_zero] (FINAL_SCALER 0) is the shared trait's blockCnt −99 (professions.js). */
const SUBSTITUTE_BLOCK = 99;

const ANY = Object.freeze({ canHitFly: true });
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const keysOf = (unit, grid) => absoluteRangeKeys(grid, unit.tileR, unit.tileC, unit.dir, 0);
const tileKey = (u) => u.tileR * COLS + u.tileC;

export default {
  [CHAR]: (bb, chess) => {
    const t1 = talentBb(chess, 0), t2 = talentBb(chess, 1), tr = traitBb(chess);
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    // every skill's rangeId and both talents' range_id are x-1 (the radius-2 diamond)
    const personaGrid = (id) => skillRec(chess, id)?.rangeGrid ?? skillRec(chess, S1)?.rangeGrid ?? null;
    const talentGrid = personaGrid(S1);

    // ---- the persona profiles (the <替身> modes' attacks) -------------------------------------------------------------
    const injuredBelow = (battle, unit) => {
      const set = unit.rangeKeySet || new Set(unit.rangeKeys || []);
      return battle.allyUnits.filter((a) => a.alive && a.deployed && !a.hidden && a.kind !== 'device' && set.has(tileKey(a))
        && battle.allySelectable(a, unit) && a.s.maxHp > 0 && a.hp / a.s.maxHp < HEAL_BELOW - 1e-9);
    };
    const profileOf = (base, mode) => {
      if (mode === 's1') return { ...base, attack: 'ranged', projectile: 'bolt', dmgType: 'arts', heal: null,
        atkScale: num(b1['attack@atk_scale'], 1), maxTargets: 1, canHitFly: false, groundOnly: true, noAttack: false };
      if (mode === 's1heal') return { ...base, attack: 'ranged', projectile: 'none', dmgType: 'heal',
        heal: { mode: 'single', hpAtMost: HEAL_BELOW }, atkScale: num(b1['attack@heal_scale'], 1), maxTargets: 1, noAttack: false };
      if (mode === 's2') return { ...base, attack: 'melee', projectile: 'none', dmgType: 'arts', heal: null,
        atkScale: num(b2['attack@atk_scale'], 1), maxTargets: Math.max(1, num(b2['attack@max_target'], 1)), canHitFly: false,
        groundOnly: true, noAttack: false };
      if (mode === 's3_1') return { ...base, attack: 'melee', projectile: 'none', dmgType: 'arts', heal: null,
        atkScale: num(b3['attack@atk_scale'], 1), maxTargets: Math.max(1, num(b3['attack@max_target'], 1)), canHitFly: true,
        groundOnly: false, noAttack: false };
      if (mode === 's3_2') return { ...base, noAttack: true };   // Stand_S3_2 has no `_attack`
      return base;
    };

    return {
      skills: {
        // "主动：立即切换为<替身>状态作战" (makoto_s<n>_trigger → makoto[switch2stand_s<n>]). The cast needs no target
        // (`_allowNoTarget`); the automatic operations cast it by the data's rule (DEFAULT on the skill's x-1 box; 规程's
        // row for S3, INVALID_IN_SKILL + ATTACK_RANGE_ENEMY + SKILL_RANGE_ENEMY, is not read: the basic strategy —
        // tools/build-data.mjs resolveTrigger [ASSUMED·CN]).
        [S1]: { kind: 'instant', onStart({ battle, unit }) { battle.emit('dollSwitch', { unit, reason: 'skill', done: false }); } },
        [S2]: { kind: 'instant', onStart({ battle, unit }) { battle.emit('dollSwitch', { unit, reason: 'skill', done: false }); } },
        // S3 in Stand_S3_1 (makoto_s3_1_allow_cast_skill): castable with no 技力 to switch to 俄耳甫斯, but manual only
        // (SetCastSkillManualTriggerOnly) — no automatic operation casts it, so in this mode only the lethal hit switches
        // [ASSUMED·CN: the node is CN-only; read by its name and that 卫戍协议 has no manual cast]. The <替身> holds 阻回 (the
        // shared trait's noSp), so the skill is never ready there anyway.
        [S3]: { kind: 'instant', onStart({ battle, unit }) { battle.emit('dollSwitch', { unit, reason: 'skill', done: false }); } },
      },
      talents: [
        // 不羁之力: the 停顿 of the switch from the <本体>; the <替身> stats are part of the persona (install below)
        { install(battle, unit) {
          battle.on('dollSwap', ({ unit: u, form }) => {
            if (u !== unit || form !== 'doll' || !(num(t1.sluggish) > 0) || !talentGrid) return;
            // (CreateBuffInRange: every enemy of the range, ground or air; a 停顿 immune / resisted one is the status's business)
            for (const e of battle.enemiesInKeys(keysOf(unit, talentGrid), unit, ANY)) {
              battle.applyStatus(e, 'sluggish', { duration: num(t1.sluggish), source: unit });
            }
          }, { owner: unit });
        } },
        // S.E.E.S.队长: the 总攻击 of a switch back the <替身> time ended (installed with the persona below)
        { install() {} },
      ],
      install(battle, unit) {
        const sid = unit.skill?.id;
        const st = unit.mem.mk = { mode: 'normal', base: null, baseGrid: null, next: Infinity, heals: [] };

        const setMode = (mode) => {
          st.mode = mode;
          battle.removeBuff(unit, 'makoto_standin');
          battle.removeBuff(unit, 'makoto_s3_2');
          if (mode === 'normal') {
            if (st.base) unit.profile = st.base;
            if (st.baseGrid) { unit.rangeGrid = st.baseGrid; battle.refreshRange(unit); }
            st.base = null; st.baseGrid = null; st.next = Infinity; st.heals = [];
            return;
          }
          if (!st.base) { st.base = unit.profile; st.baseGrid = unit.rangeGrid; }
          // makoto_standin: ATK ×(1 + atk) and +base_attack_time s (from makoto_talent_1), max HP ×(1 + MAX_HP of makoto_tr
          // — the PUM-Y trait's max_hp) and ×(1 + max_hp_t1) (makoto_standin_t1_max_hp): MULTIPLIER items add up
          const mods = { atkPct: num(t1.atk), batPct: batMod(t1.base_attack_time, chess), hpPct: num(t1.max_hp_t1) + num(tr.max_hp) };
          // makoto_s3_1_standin: ATTACK_SPEED +talent@attack_speed (ADDITION)
          if (mode === 's3_1') mods.aspd = num(b3['talent@attack_speed']);
          battle.addBuff(unit, { key: 'makoto_standin', mods, visible: true, tags: ['talent'] });
          if (mode === 's3_2') {
            // makoto_s3_2_mod_block_cnt: block_zero off, −2, then +attack@block_cnt — the base 2 back to block_cnt
            battle.addBuff(unit, { key: 'makoto_s3_2', visible: true, tags: ['skill'],
              mods: { blockCnt: SUBSTITUTE_BLOCK - 2 + num(b3['attack@block_cnt']) } });
            st.next = battle.time;   // makoto_s3_2_heal_others: the first heal as the mode starts (ON_BUFF_START)
          }
          unit.profile = profileOf(st.base, mode === 's1' ? 's1' : mode);
          const g = personaGrid(sid);
          if (g) { unit.rangeGrid = g; battle.refreshRange(unit); }
        };

        battle.on('dollSwap', ({ unit: u, form }) => {
          if (u !== unit) return;
          if (form === 'doll') {
            setMode(sid === S1 ? 's1' : sid === S2 ? 's2' : sid === S3 ? 's3_1' : 'normal');
            return;
          }
          // back to the <本体>: the persona ends; a switch back the <替身> time ended is the 总攻击 (talent 2)
          setMode('normal');
          if (num(t2.atk_scale) > 0) battle.after(ALLOUT_DELAY, () => allout(battle, unit), { owner: unit });
        }, { owner: unit });
        battle.on('death', ({ unit: u }) => {
          if (u !== unit) return;
          if (st.mode !== 'normal') setMode('normal');
          // the aura's 闪避 goes with him (the buffs are the allies', the tick below stops with its owner)
          for (const a of battle.allyUnits) { const b = a.findBuff('makoto_s3_2_evade'); if (b && b.source === unit) battle.removeBuff(a, b); }
        }, { owner: unit });

        // S3: a lethal hit on 塔纳托斯 (makoto_tr in mode 3) with <替身> time left switches to 俄耳甫斯. The switch is
        // makoto[switch2stand_s3_2], the same sequence as the others (SwitchBegin: makoto_switchbegin's clear, 技力 and
        // protection; Die2Stand heals to full) over its own two clips, S3_CHANGE; the <替身> time left at its start
        // (makoto_assign_standing_time) is the new makoto_standin's duration after it, so the switch does not use it up.
        if (sid === S3) {
          battle.on('fatal', (ctx) => {
            if (ctx.unit !== unit || ctx.prevented || st.mode !== 's3_1' || unit.trait.dollSwitching) return;
            const sub = unit.findBuff('trait:substitute');
            if (!sub || !(sub.timeLeft > 0.01)) return;
            ctx.prevented = true;
            toOrpheus(battle, unit, sub);
            setMode('s3_2');
          }, { owner: unit, priority: -99.5 });   // after a held 不死 (items/battle.js −99), before the trait (−100)
        }

        // the per-tick persona work: S1's heal-or-attack choice, S2's kill aura, S3_2's heals
        battle.every(battle.dt, () => {
          if (!unit.alive || !unit.deployed || st.mode === 'normal' || !st.base) return;
          if (st.mode === 's1') {
            // the AbilitySelectableGroup: HealAlly_Lt50Per first when its trigger has a target, else MagicAttack
            const want = injuredBelow(battle, unit).length ? 's1heal' : 's1';
            if (unit.profile.dmgType !== (want === 's1heal' ? 'heal' : 'arts')) unit.profile = profileOf(st.base, want);
          } else if (st.mode === 's2') {
            if (unit.trait.dollSwitching) return;
            if (Math.round(battle.time / battle.dt) % Math.max(1, Math.round(KILL_TICK / battle.dt))) return;
            const thr = num(b2['attack@kill_atk_scale']) * unit.s.atk;
            for (const e of battle.enemiesInKeys(unit.rangeKeys, unit, ANY)) {
              if (!e.alive || !hasHp(e) || !e.s?.flags?.fear || !(e.hp < thr)) continue;
              battle.dealDamage(unit, e, { amount: num(b2['attack@kill_damage'], 9999999), type: 'true', canDodge: false,
                sourceless: true, isSkill: true, tags: ['skill', 'execute', 'makoto:s2'], moment: 'makoto_skill_02_hit_01_finish' });
              if (!up(unit)) return;
            }
          } else if (st.mode === 's3_2') {
            if (unit.trait.dollSwitching) return;
            for (let i = st.heals.length - 1; i >= 0; i--) {
              const h = st.heals[i];
              if (battle.time < h.at - 1e-9) continue;
              st.heals.splice(i, 1);
              if (h.target.alive && h.target.deployed) battle.heal(unit, h.target, unit.s.atk * num(b3['attack@heal_scale']), { isSkill: true, tags: ['skill', 'makoto:s3'] });
            }
            if (battle.time < st.next - 1e-9) return;
            st.next = battle.time + Math.max(0.1, num(b3['attack@interval'], 1));
            const n = Math.max(1, num(b3['attack@max_target_heal'], 1));
            const picked = battle.injuredAlliesInKeys(unit.rangeKeys, unit, false).filter(operator).slice(0, n);
            for (const a of picked) st.heals.push({ target: a, at: battle.time + HEAL_DELAY });
          }
        }, { owner: unit });

        // S1: a heal swing is the group's HealAlly_Lt50Per child (its sounds; MagicAttack is the plain one)
        if (sid === S1) {
          battle.on('swing', (c) => { if (c.unit === unit && st.mode === 's1' && unit.profile.dmgType === 'heal') c.signal = 'HealAlly_Lt50Per'; }, { owner: unit });
        }
        // S2: each target is feared `fear` s with chance `prob` (makoto_s2_fear_possibility, Dice)
        if (sid === S2) {
          battle.on('damaged', ({ source, target, dmg }) => {
            if (source !== unit || st.mode !== 's2' || !dmg?.isAttack || !target?.alive || target.side !== 'enemy') return;
            if (battle.rng.chance(num(b2['attack@prob']))) battle.applyStatus(target, 'fear', { duration: num(b2['attack@fear']), source: unit });
          }, { owner: unit });
        }
        // S3 塔纳托斯: 弱点伤害 (common_weak_damage) on its attacks
        if (sid === S3) {
          battle.on('hit', ({ source, target, dmg }) => {
            if (source === unit && st.mode === 's3_1' && dmg?.isAttack) weaknessRetype(dmg, unit, target);
          }, { owner: unit, priority: 10 });
          // S3 俄耳甫斯: `prob` physical and arts 闪避 for the operators of the range, himself included (makoto_s3_2_aura →
          // the evade template); refreshed every tick, gone when he leaves the mode or they leave the range
          battle.every(battle.dt, () => {
            const on = st.mode === 's3_2' && up(unit) && !unit.trait.dollSwitching;
            const set = on ? (unit.rangeKeySet || new Set(unit.rangeKeys || [])) : null;
            for (const a of battle.allyUnits) {
              const has = a.findBuff('makoto_s3_2_evade');
              const want = on && a.alive && a.deployed && operator(a) && set.has(tileKey(a));
              if (want && !has) {
                battle.addBuff(a, { key: 'makoto_s3_2_evade', source: unit, visible: true, tags: ['aura'],
                  mods: { dodgePhys: num(b3['attack@prob']), dodgeArts: num(b3['attack@prob']) } });
              } else if (!want && has && has.source === unit) battle.removeBuff(a, has);
            }
          }, { owner: unit });
        }
      },
    };

    /** makoto[switch2stand_s3_2]: the 塔纳托斯 → 俄耳甫斯 switch (see the fatal hook). */
    function toOrpheus(battle, unit, sub) {
      const left = sub.timeLeft;
      for (const b of unit.buffs.slice()) if (b.status) battle.removeBuff(unit, b);
      const sk = unit.skill;
      if (sk && !sk.noSkill) { sk.sp = 0; sk.charges = sk.spCost <= 0 ? sk.maxCharges : 0; }
      unit.trait.dollSwitching = true;
      const done = () => { unit.trait.dollSwitching = false; };
      battle.addBuff(unit, {
        key: 'trait:dollSwitching', duration: S3_CHANGE, onRemove: done,
        onExpire: () => { done(); if (unit.alive && unit.deployed) { unit.markDirty(); unit.hp = unit.s.maxHp; } },
        flags: { invulnerable: true, noSp: true, noHeal: true, healFree: true, isolated: true, disarm: true },
      });
      // the <替身> time left starts again after the switch
      sub.timeLeft = left + S3_CHANGE;
      unit.markDirty();
      unit.hp = unit.s.maxHp;
      // (no 'dollSwap': a persona change inside the <替身>, not a <替身> / <本体> switch — 不羁之力's 停顿 and 不屈 skip it; and
      // no 'swap' event, whose view is the switch back to the <本体>: the persona's own clips and makoto_change_01 are the
      // renderer's to wire — the view reads the mode from the unit's buffs, `makoto_s3_2`)
    }

    /** S.E.E.S.队长's 总攻击: every 结城理 of the field strikes the enemies around it with this one's ATK. */
    function allout(battle, unit) {
      if (!unit.alive || !unit.deployed || !talentGrid) return;   // makoto_talent_2 ON_OWNER_FINISH ends it
      const amount = unit.s.atk * num(t2.atk_scale);
      for (const m of battle.allyUnits) {
        if (!m.alive || !m.deployed || m.def?.charId !== CHAR) continue;
        for (const e of battle.enemiesInKeys(keysOf(m, talentGrid), m, ANY)) {
          if (!e.alive || !hasHp(e)) continue;
          battle.dealDamage(unit, e, { amount, type: 'true', canDodge: false, isAttack: false, isSkill: false,
            ...(m === unit ? {} : { sourceless: true }), tags: ['talent', 'makoto:t2'], moment: 'makoto_talent_hit_01' });
        }
      }
    }
  },
};
