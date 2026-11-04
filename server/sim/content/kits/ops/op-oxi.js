// 塔露拉 (char_4247_oxi), 本源近卫. Official CN tables 2026-10-28 (79.0; she is not on the EN / KR servers yet), the CN
// client's prefabs and buff templates (char_4247_oxi, skchr_oxi_1..3, the oxi_* buff templates), PRTS 塔露拉 2026-11-01
// (no 备注 yet). No module, no summon. The classes she alone uses are CN-only — TimedTileLeaseAbility (the footprints),
// TargetCenteredAreaMeleeAttack and LinearDecayBuffToOwnerDuringAbility (S2), OxiFireRainSlotBehaviour,
// CheckOxiFireRainSlot and EmitDirectionalMapEdgeProjectileVolley (S3): their behaviour is read from their serialized
// fields and the skill texts, and what those leave open is [ASSUMED] below (docs/rules/diy.md 「탈룰라」).

import { num, talentBb, skillRec, up, holdProtect, PROTECT_TICK_HOLD } from '../shared/tier1.js';
import { canTargetEnemy } from '../../../targeting.js';
import { dirVec } from '../../../dir.js';
import { COLS } from '../../../constants.js';
import { hasHp } from '../../../damage.js';

const S1 = 'skchr_oxi_1', S2 = 'skchr_oxi_2', S3 = 'skchr_oxi_3';
const GROUND = Object.freeze({ canHitFly: false, groundOnly: true });
const ANY = Object.freeze({ canHitFly: true });
/** oxi_t_2_fire_break_detector: the trail a 灼燃 burst leaves lasts 5 s (「爆发后5秒内」) and re-leases every 0.5 s. */
const TRAIL_TIME = 5, TRAIL_STEP = 0.5;
/** skchr_oxi_3's volley (EmitDirectionalMapEdgeProjectileVolley `_maxBackDistance`): the edge it starts from is at most 11 tiles behind her. */
const WAVE_MAX_BACK = 11;
const skillBb = (raw, id) => skillRec(raw, id)?.bb ?? {};
const tileOf = (u) => [Math.round(u.y), Math.round(u.x)];
/** 非持续 damage of hers (the templates' FilterDamageModifer `IS_CONTINUOUS` off): a DoT tick carries 'dot'. */
const direct = (dmg) => !dmg?.tags?.includes('dot');

export default {
  char_4247_oxi: (bb, raw) => {
    const t0 = talentBb(raw, 0), t1 = talentBb(raw, 1);
    const b2 = skillBb(raw, S2), b3 = skillBb(raw, S3);

    // ---- 绝不妥协 (talent 1): oxi_t_1_arcane_manager / _attack_completed / _arcane_stack ----
    // A stack every `arcane_step_interval` s while no attack of hers is recent (the marker lasts `arcane_idle_delay` s, set
    // at deployment and by every normal attack), up to round(arcane_max / arcane_step); each normal attack (the Default
    // mode's attacks carry `oxi_t_1_attack_completed`, her skill abilities do not) takes one off. Her non-DoT arts and
    // element damage ×(1 + arcane_step × stacks): Nodes.DamageScale with `_isStackable` multiplies by 1 + value × the
    // valid stack count (official client).
    const arcaneMax = Math.max(0, Math.round(num(t0.arcane_max) / Math.max(1e-9, num(t0.arcane_step, 1))));
    const arcaneShow = (battle, unit, a) => battle.fx('stacks', { x: unit.x, y: unit.y, id: unit.id, buff: 'oxi_t_1_arcane_stack', n: a.n, max: arcaneMax });

    // ---- 我即火焰 (talent 2): the footprints (oxi_fire_field_lease, a TimedTileLeaseAbility) ----
    const fieldDuration = num(t1.field_duration, 4), fieldCap = Math.max(0, num(t1.max_count, 25));
    const fieldStep = num(t1.field_interval, 0.3), fieldScale = num(t1.field_atk_scale);
    const lease = (battle, unit, f, key) => {
      // a re-lease restarts its time [ASSUMED·no source: the maintainer's memory of the official game, "probably" (2026-11-01)]
      // (its 'zone' again: the footprint's effect is held the new time — render/fx/kitofficial.js 'zone')
      // (`n` 1 on a new tile: its `_effectSettings` castedTimeThreshold 1 sounds oxi_fire_field_create — audio.js)
      const show = (n) => battle.fx('zone', { x: key % COLS, y: Math.floor(key / COLS), r: 0.5, dur: fieldDuration, id: unit.id, tile: key, ...(n ? { n } : {}) });
      if (f.tiles.has(key)) { f.tiles.set(key, battle.time + fieldDuration); show(0); return; }
      // full: a new tile is refused (`_rejectNewWhenFull`, kept over the maintainer's memory of the oldest one going —
      // maintainer decision 2026-11-01) [ASSUMED·CN: the field read by its name]
      if (f.tiles.size >= fieldCap) return;
      f.tiles.set(key, battle.time + fieldDuration);
      show(1);
    };
    const tickField = (battle, unit) => {
      const f = unit.mem.oxiField;
      if (!f) return;
      if (!up(unit)) { f.tiles.clear(); f.trails.clear(); f.burn.clear(); return; } // `_fixClearOnEnd`, derived trails end with her
      const now = battle.time;
      for (const [k, until] of f.tiles) if (until <= now + 1e-9) f.tiles.delete(k);
      for (const [e, t] of f.trails) {
        if (!e.alive || t.until <= now + 1e-9) { f.trails.delete(e); continue; }
        // oxi_t_2_trail: every 0.5 s and whenever its root tile changes, the tile it stands on — passable ground only (TileSelector)
        const [r, c] = tileOf(e), key = r * COLS + c;
        if (key === t.key && now < t.next - 1e-9) continue;
        t.key = key; t.next = now + TRAIL_STEP;
        if (battle.grid.groundPassable(r, c, true)) lease(battle, unit, f, key);
      }
      // oxi_shared_fire_field_damage: a ground enemy on a footprint (not invisible, untargetable or invincible) takes
      // ATK × field_atk_scale arts every field_interval s from its entry, one timer however many footprints it crosses
      // (one EXTEND buff); leaving them clears it (`_clearEnterBuffWhenEnemyLeave`).
      const on = f.tiles.size ? battle.enemiesOnTiles([...f.tiles.keys()], unit, GROUND) : [];
      const here = new Set(on);
      for (const e of f.burn.keys()) if (!here.has(e)) f.burn.delete(e);
      for (const e of on) {
        const due = f.burn.get(e);
        if (due == null) { f.burn.set(e, now + fieldStep); continue; }
        if (now < due - 1e-9) continue;
        f.burn.set(e, due + fieldStep);
        if (e.s.flags.invulnerable) continue;
        battle.dealDamage(unit, e, { amount: unit.s.atk * fieldScale, type: 'arts', canDodge: false,
          tags: ['dot', 'talent', 'oxi:field'] });
      }
    };

    // ---- S2 阂断骤雪: cast by oxi_s_2_guard_manager when she is attacked ----
    const guardTotal = num(b2.skill_duration, 1.3), guardHold = num(b2.shelter_hold_duration, 0.2);
    const guardProtect = num(b2.damage_resistance);
    /** LinearDecayBuffToOwnerDuringAbility: damage_resistance for shelter_hold_duration s, then linearly to 0 at skill_duration. */
    const shelterAt = (dt) => (dt < guardHold ? guardProtect
      : guardProtect * Math.max(0, 1 - (dt - guardHold) / Math.max(1e-9, guardTotal - guardHold)));
    const retaliate = (battle, unit, from) => {
      // TargetCenteredAreaMeleeAttack: around the attacker wherever it stands, else (gone, untargetable) around an enemy she
      // blocks or has in her 1-1 box (the CenterFallbackSelector); no centre = no damage (`_allowNoTarget`, the buffs still
      // come) [ASSUMED·CN: no range limit — the input target validator's CircleRange radius is unknown; the maintainer
      // remembers "probably the whole map" (2026-11-01)] [ASSUMED·no source: the damage at the cast, not at the
      // Skill_2_Cambat attack event]
      let centre = from && from.side === 'enemy' && canTargetEnemy(unit, from, ANY) ? from : null;
      if (!centre) centre = battle.enemiesInKeys(unit.baseRangeKeys || unit.rangeKeys, unit, GROUND)
        .sort((a, b) => (b.blockedBy === unit) - (a.blockedBy === unit) || a.spawnSeq - b.spawnSeq)[0] ?? null;
      if (!centre) return;
      const radius = num(b2.ability_range_radius, 1), atk = unit.s.atk * num(b2.retaliate_atk_scale);
      battle.fx('blast', { x: centre.x, y: centre.y, r: radius, id: unit.id });
      for (const e of battle.foesInRadius(centre.x, centre.y, radius)) {
        const dealt = battle.dealDamage(unit, e, { amount: atk, type: 'arts', isSkill: true, isSplash: e !== centre,
          tags: ['skill', 'oxi:guard'] });
        // oxi_s_2_guard_manager ON_AFTER_OUTPUT_DAMAGE: heal_ratio of each hit of this skill ability
        if (dealt > 0 && unit.alive) battle.heal(unit, unit, dealt * num(b2.heal_ratio), { self: true, tags: ['skill'] });
      }
    };
    const guardOpen = (battle, unit) => {
      const t0s = battle.time;
      unit.mem.oxiGuardUntil = t0s + guardTotal;
      // the shelter's buff is added while the hit that cast it is being taken: the target's buff list is double buffered
      // (SortedDoubleBufferedBuffList), so it does not reduce that hit — it starts on the next scheduled step
      battle.after(0, () => {
        const hold = battle.every(battle.dt, () => {
          const dt = battle.time - t0s;
          if (!up(unit) || dt >= guardTotal - 1e-9) { hold.cancel(); return; }
          holdProtect(battle, unit, shelterAt(dt), PROTECT_TICK_HOLD, unit);
        }, { owner: unit, immediate: true });
      }, { owner: unit });
    };

    // ---- S3 日冕重烈: the 簇火 volleys ----
    const volley = (battle, unit, overload) => {
      const w = unit.mem.oxiS3;
      if (!w) return;
      const R = battle.grid.rect, [dr, dc] = dirVec(unit.dir), [r, c] = [unit.tileR, unit.tileC];
      const half = Math.max(0, Math.floor(num(overload ? b3.overload_half_width : b3.normal_half_width, 2)));
      const horizontal = dc !== 0, sign = horizontal ? dc : dr;
      // the lanes across her facing, centred on her, shifted back inside the map at an edge [ASSUMED·CN: the field
      // `_shiftLaneWindowAtMapEdge` read by its name; the maintainer remembers "probably shifted" (2026-11-01)]
      const lo = horizontal ? R.r0 : R.c0, hi = horizontal ? R.r1 : R.c1, mid = horizontal ? r : c;
      let a = mid - half, z = mid + half;
      if (a < lo) { z += lo - a; a = lo; }
      if (z > hi) { a -= z - hi; z = hi; }
      a = Math.max(a, lo);
      // along her facing: from the map edge behind her, at most WAVE_MAX_BACK behind, to wave_exit_distance past the far edge
      // [ASSUMED·CN: EmitDirectionalMapEdgeProjectileVolley is CN-only — read by its name and fields; the maintainer's
      // memory (2026-11-01) agrees: from the edge opposite her facing, gone at the far edge]
      const along = horizontal ? c : r, back = sign > 0 ? (horizontal ? R.c0 : R.r0) : (horizontal ? R.c1 : R.r1);
      const ahead = sign > 0 ? (horizontal ? R.c1 : R.r1) : (horizontal ? R.c0 : R.r0);
      const from = sign > 0 ? Math.max(back, along - WAVE_MAX_BACK) : Math.min(back, along + WAVE_MAX_BACK);
      const to = ahead + sign * num(b3.wave_exit_distance, 5);
      const wave = { hit: new Set(), id: w.waves = (w.waves ?? 0) + 1 }, atk = unit.s.atk;
      for (let lane = a; lane <= z; lane++) w.fires.push({ wave, atk, s: from, to, sign, horizontal, lane });
      // its 簇火 (projectile_chr_oxi_s_3_heatwave, one a lane) for the renderer: lanes a..z from `s` to `to` along the rows
      // (h 1) or the columns, at wave_speed; an explosion names its wave and lane ('blast' w / lane)
      battle.fx('oxiWave', { x: unit.x, y: unit.y, id: unit.id, w: wave.id, h: horizontal ? 1 : 0, a, z, s: from, to,
        v: num(b3.wave_speed, 2.3) });
    };
    const explode = (battle, unit, p, x, y) => {
      const radius = num(b3.range_radius, 1.5), scale = num(b3.heatwave_atk_scale), repeat = num(b3.same_wave_repeat_damage_scale, 1);
      battle.fx('blast', { x, y, r: radius, id: unit.id, element: 'burn', w: p.wave.id, lane: p.lane });
      // flyers too [ASSUMED·no source: the text names no 地面 (S1's does) and the maintainer remembers so (2026-11-01); the
      // projectile prefab is not read]
      for (const e of battle.foesInRadius(x, y, radius)) {
        const m = p.wave.hit.has(e) ? repeat : 1;
        p.wave.hit.add(e);
        // 「若目标处于灼燃损伤爆发期间则改为造成元素伤害」: its 爆发冷却 (burnBurst) runs
        const elem = !!e.findBuff('burnBurst');
        battle.dealDamage(unit, e, { amount: p.atk * scale * m, type: elem ? 'elemental' : 'arts', ...(elem ? { element: 'burn' } : {}),
          isSkill: true, isSplash: true, canDodge: false, tags: ['skill', 'oxi:fire'] });
      }
    };
    const tickFires = (battle, unit, dt) => {
      const w = unit.mem.oxiS3;
      if (!w || !w.fires.length) return;
      const step = num(b3.wave_speed, 2.3) * dt, reach = num(b3.projectile_range, 0.5);
      w.fires = w.fires.filter((p) => {
        p.s += p.sign * step;
        if ((p.to - p.s) * p.sign <= 0) return false;
        const [x, y] = p.horizontal ? [p.s, p.lane] : [p.lane, p.s];
        if (!battle.foesInRadius(x, y, reach).length) return true;
        explode(battle, unit, p, x, y);   // 「“簇火”碰到敌人时爆炸」: one explosion, then it is gone
        return false;
      });
    };

    return {
      trait: { dmgType: 'arts' },   // 绝不妥协 「攻击造成法术伤害」 (her Default MeleeAttack `_damageType` 2)
      skills: {
        // S1 照霎白夜: the next attack strikes every ground enemy on the target's tile (GridPositionRange) for atk_scale and
        // fears them `fear` s (the MeleeAttack's `fear` active buff)
        [S1]: { kind: 'instant', attack: { atkScale: num(skillBb(raw, S1).atk_scale, 1),
          onHit({ battle, unit, target }) {
            if (!target) return;
            const [r, c] = tileOf(target), b1 = skillBb(raw, S1);
            const on = battle.enemiesInKeys([r * COLS + c], unit, GROUND);
            if (!on.includes(target)) on.unshift(target);
            for (const e of on) {
              if (e !== target) battle.dealDamage(unit, e, { amount: unit.s.atk * num(b1.atk_scale, 1), type: 'arts',
                isAttack: true, isSkill: true, tags: ['skill', 'oxi:s1'] });
              if (e.alive) battle.applyStatus(e, 'fear', { duration: num(b1.fear), source: unit });
            }
          } } },
        // S2 阂断骤雪: NeverTrigger — the guard manager (installed below) casts it on an attack she takes
        [S2]: {
          kind: 'charges', trigger: 'NEVER',
          onStart({ battle, unit }) {
            const from = unit.mem.oxiGuardFrom ?? null;
            unit.mem.oxiGuardFrom = null;
            unit.mem.oxiRetaliate = from;
            guardOpen(battle, unit);
            // oxi_s_2_stack, given as the ability starts (`_runActionOnEvent` 2) — before its strike, so the retaliation has it:
            // ATK / DEF +atk / +def per stack, max_stack_cnt stacks, stack_duration s refreshed by each cast (a STACK override
            // group: `_AddStack` keeps the longer time, a full group refreshes it)
            battle.addBuff(unit, { key: 'oxi_s_2_stack', refresh: 'stack', stacks: 1, maxStacks: num(b2.max_stack_cnt, 5),
              duration: num(b2.stack_duration, 5), mods: { atkPct: num(b2.atk), defPct: num(b2.def) }, visible: true, tags: ['skill'] });
          },
          onStrike({ battle, unit }) {   // (`_selectTargetTiming` 1)
            const from = unit.mem.oxiRetaliate ?? null;
            unit.mem.oxiRetaliate = null;
            retaliate(battle, unit, from);
          },
        },
        // S3 日冕重烈: ATK +atk, no attacks (mode S3NoAttack), a volley of 簇火 every normal_interval s, from its 过载 (the
        // second half) every overload_interval s over the wider lanes; each wave fires at once when its buff starts.
        // Cast by the automatic operations with an enemy anywhere on the field (GDGLOW_SKILL_2, the act2autochess row of
        // the other field-wide MANUAL S3s) instead of the data's DEFAULT (no rangeId: her 1-1 attack state)
        // [ASSUMED·CN: the new season's skillTriggerDataList has no row for her yet]
        [S3]: {
          kind: 'duration', mods: { atkPct: num(b3.atk) }, flags: { disarm: true }, trigger: 'GDGLOW_SKILL_2',
          onStart({ battle, unit }) {
            unit.mem.oxiS3 = { fires: unit.mem.oxiS3?.fires ?? [], waves: unit.mem.oxiS3?.waves ?? 0, next: battle.time, over: false };
          },
          onTick({ battle, unit, skill }) {
            const w = unit.mem.oxiS3;
            if (!w) return;
            if (!w.over && skill.duration - skill.timeLeft >= skill.duration / 2 - 1e-9) {
              w.over = true; w.next = battle.time;
              battle.fx('overload', { x: unit.x, y: unit.y, id: unit.id });
            }
            if (battle.time < w.next - 1e-9) return;
            volley(battle, unit, w.over);
            w.next = battle.time + num(w.over ? b3.overload_interval : b3.normal_interval, 2);
          },
          // the fires already out keep going [ASSUMED: no FinishManagedProjectiles on the skill]
          onEnd({ unit }) { if (unit.mem.oxiS3) unit.mem.oxiS3.next = Infinity; },
        },
      },
      talents: [
        { install(battle, unit) {
          const a = unit.mem.oxiArcane = { n: 0, recent: Infinity };
          battle.on('deploy', ({ unit: u }) => { if (u === unit) { a.n = 0; a.recent = battle.time + num(t0.arcane_idle_delay, 3); } }, { owner: unit });
          battle.every(num(t0.arcane_step_interval, 0.5), () => {
            if (!up(unit) || battle.time < a.recent - 1e-9 || a.n >= arcaneMax) return;
            a.n++; arcaneShow(battle, unit, a);
          }, { owner: unit });
          battle.on('attack', ({ attacker, isSkill }) => {
            if (attacker !== unit || isSkill) return;
            a.recent = battle.time + num(t0.arcane_idle_delay, 3);
            if (a.n > 0) { a.n--; arcaneShow(battle, unit, a); }
          }, { owner: unit });
          battle.on('hit', ({ source, dmg }) => {
            if (source !== unit || !a.n || !direct(dmg) || (dmg.type !== 'arts' && dmg.type !== 'elemental')) return;
            dmg.mul *= 1 + num(t0.arcane_step) * a.n;
          }, { owner: unit });
          // oxi_t_1_burning_damage: every non-DoT arts damage she deals adds ep_damage_ratio × that damage of 灼燃损伤
          battle.on('damaged', ({ source, target, amount, dmg }) => {
            if (source !== unit || !(amount > 0) || dmg?.type !== 'arts' || !direct(dmg) || target?.side !== 'enemy' || !hasHp(target)) return;
            battle.dealDamage(unit, target, { amount: amount * num(t0.ep_damage_ratio), type: 'element', element: 'burn', tags: ['talent', 'oxi:t1'] });
          }, { owner: unit });
        } },
        { install(battle, unit) {
          // oxi_t_2_fire_break_detector on every enemy while she is on the field: a 灼燃 burst starting gives it the trail
          const f = unit.mem.oxiField = { tiles: new Map(), trails: new Map(), burn: new Map() };
          battle.on('elementBurst', ({ target, element }) => {
            if (element !== 'burn' || !up(unit) || target?.side !== 'enemy') return;
            f.trails.set(target, { until: battle.time + TRAIL_TIME, key: -1, next: 0 });
          }, { owner: unit });
          battle.every(battle.dt, () => tickField(battle, unit), { owner: unit });
        } },
      ],
      install(battle, unit) {
        if (unit.skill?.id === S2) {
          // oxi_s_2_guard_manager (HIGH priority, ON_TAKE_DAMAGE): damage of the mask ANY_ATTACK (physical, arts, true,
          // element) — not a DoT or a buff's, not the environment's, from an enemy (a projectile's source counts), dodged
          // ones included (MISS / HIT_FAILED) — outside the cast's window casts S2 at its source; a cast takes that damage
          // down to damage_remaining_scale if it is physical or arts (PHYSICAL_AND_MAGICAL)
          battle.on('hit', ({ source, target, dmg }) => {
            if (target !== unit || !source || source.side !== 'enemy' || dmg.sourceless || !direct(dmg)) return;
            if (dmg.type !== 'phys' && dmg.type !== 'arts' && dmg.type !== 'true' && dmg.type !== 'elemental') return;
            if (battle.time < (unit.mem.oxiGuardUntil ?? -1) - 1e-9) return;
            const sk = unit.skill;
            if (!sk.ready || !unit.canAct || unit.s.flags.silence) return;
            unit.mem.oxiGuardFrom = source;
            if (!sk.activate('TAKE_DAMAGE')) { unit.mem.oxiGuardFrom = null; return; }
            if (dmg.type === 'phys' || dmg.type === 'arts') dmg.mul *= num(b2.damage_remaining_scale, 1);
          }, { owner: unit, priority: 50 });
          // with a stack her normal attack is the BuffedAttack: every enemy she blocks (`_limitedMaxTargetNumToBlockedCnt`);
          // the swing names that child, for its sound
          battle.on('swing', (c) => { if (c.unit === unit && !c.isSkill && unit.findBuff('oxi_s_2_stack')) c.signal = 'BuffedAttack'; }, { owner: unit });
          battle.every(battle.dt, () => {
            if (!unit.alive || !unit.profile) return;
            const buffed = !!unit.findBuff('oxi_s_2_stack');
            if (unit.profile !== unit.mem.oxiBuffedProfile) unit.mem.oxiBaseProfile = unit.profile;
            const base = unit.mem.oxiBaseProfile;
            if (!base) return;
            if (!buffed) { if (unit.profile !== base) unit.profile = base; return; }
            if (unit.profile !== unit.mem.oxiBuffedProfile || unit.mem.oxiBuffedOf !== base) {
              unit.mem.oxiBuffedOf = base;
              // (its `buffed_attack_atk_scale` is 1 at every rank: the Default attack's own scale)
              unit.profile = unit.mem.oxiBuffedProfile = { ...base, hitAllBlocked: true };
            }
          }, { owner: unit, immediate: true });
        }
        if (unit.skill?.id === S3) battle.every(battle.dt, () => tickFires(battle, unit, battle.dt), { owner: unit });
      },
    };
  },
};
