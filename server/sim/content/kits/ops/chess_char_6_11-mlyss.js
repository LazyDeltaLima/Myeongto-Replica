// server/sim/content/kits/ops/chess_char_6_11-mlyss.js — 缪尔赛思 (char_249_mlyss) kit, tier 6.
// Conventions of the tier-6 kits: ../shared/tier6.js; kit contract and rules: ../README.md.

import {
  num, bv, tbb, tdesc, moduleBb, parseN, live, isTok, onDefaultSkill, selectedSkill, AROUND8, N4, bstate, bestTile,
  pullToward, enemiesIn,
} from '../shared/tier6.js';
import { holdProtect } from '../shared/tier1.js';
import { hasPower } from '../shared/powers.js';

/** 莱茵生命: the group tag `rhine` (mlyss_e_003_t templates CheckCharacterGroupTag). */
const isRhine = (u) => hasPower(u, 'rhine');
/** The hidden (index −1) module parts of the selected module, each blackboard on its own (moduleBb merges them). */
const moduleParts = (chess) => (chess?.talents || []).filter((t) => t && t.index === -1 && t.bb).map((t) => t.bb);
/**
 * The 流形's switch casts out of its Recharge mode (token prefab Modes/Recharge/Body/Talents/1 mlyss_wtrman_switch / _melee /
 * _range, official client): `_preDelay` 1 s before their reborn buff brings it back.
 */
const MANIFOLD_REBORN = 1;

// ------------------------------------------------------------------------------------------------------------------
// 缪尔赛思 chess_char_6_11 (战术家) — S3 浅层非熵适应; 净水即生命 (流形); 开源节流; module 梳妆流形

/**
 * 流形 copy (token talent "复制目标90%的生命值、攻击力、防御力、法抗，以及阻挡数、攻击间隔、攻击范围、初始伤害类型（不攻击、
 * 治疗类型则不继承）"): scale × HP/ATK/DEF/RES, block count, BAT/ASPD, range and damage type. The attack itself stays the
 * token's single-target attack (melee or ranged after the copied position) — splash/chain/multi-hit shapes are not
 * listed and not copied. `ranged` (近/远程位) decides the special trait (steal / split).
 */
function copyInto(battle, t, src, scale, ranged) {
  const sb = src.base, b = t.base;
  b.maxHp = Math.max(1, num(sb.maxHp, b.maxHp) * scale);
  for (const k of ['atk', 'def', 'res']) if (Number.isFinite(sb[k])) b[k] = sb[k] * scale;
  for (const k of ['blockCnt', 'bat', 'aspd']) if (Number.isFinite(sb[k])) b[k] = sb[k];
  if (Array.isArray(src.rangeGrid) && src.rangeGrid.length) t.rangeGrid = src.rangeGrid;
  const sp = src.profile || {};
  const p = t.profile;
  if (p) {
    p.attack = ranged ? 'ranged' : 'melee';
    // (a 阵法术师 / 轰击术师's instant 'beam' is their every-enemy-in-range shape: the copy fires a plain bolt)
    p.projectile = ranged ? (sp.projectile && sp.projectile !== 'none' && sp.projectile !== 'orb' && sp.projectile !== 'beam' ? sp.projectile : 'bolt') : 'none';
    p.canHitFly = ranged ? true : !!sp.canHitFly;
    if (!(sp.dmgType === 'heal' || sp.dmgType === 'none' || sp.noAttack || sp.noAttackUnlessSkill)) p.dmgType = sp.dmgType;
    p.heal = null;
    p.noAttack = false;
    p.noAttackUnlessSkill = false;
  }
  battle.removeBuff(t, 'mlyss:stolen');
  t.mem.mlyss = { ranged, from: src.id, stolenAtk: 0, stolenDef: 0, attacks: 0 }; // "复制后重置"
  t.markDirty();
  t.hp = t.s.maxHp;
  battle.refreshRange(t); // the copied grid: current + initial range, trigger keys
}

/** A split copy's time (`mlyss_wtrman_summon[trigger]`: it dies when the time is up); called again, its time starts over. */
function cloneTime(battle, t, dur) {
  t.mem.mlyssCloneTimer?.cancel?.();
  t.mem.mlyssCloneTimer = battle.after(dur, () => { if (t.alive) battle.retreat(t, { reason: 'expired', permanent: true }); }, { owner: t });
}

/** A split copy of the ranged 流形 `t` on tile (r, c), lasting `dur` s (the 'deploy' listener copies `t` into it). */
function splitCopy(battle, unit, tokId, t, r, c, dur) {
  unit.mem.mlyssCloneOf = t;
  let cl;
  try { cl = battle.spawnToken(unit, tokId, r, c, { kit: { skill: null } }); } finally { unit.mem.mlyssCloneOf = null; }
  if (!cl) return null;
  cloneTime(battle, cl, dur);
  battle.fx('split', { x: cl.x, y: cl.y, id: cl.id, src: t.id, by: unit.id });   // `by` her: render/fx/kitofficial.js
  return cl;
}

function mlyss(bb, chess, def) {
  const tokId = def?.talents?.[0]?.tokenKey || (chess?.tokens || [])[0] || 'token_10030_mlyss_wtrman';
  const t1 = tbb(def, 1), mod = moduleBb(chess);
  const isDef = onDefaultSkill(chess), sid = selectedSkill(chess, def);
  const reinfCut = parseN(chess?.trait?.moduleDesc, /伤害降低(\d+(?:\.\d+)?)%/, 0) / 100;
  // S3 (default) only: melee pulse interval, ranged-copy bind
  const pulseIv = Math.max(0.2, bv(bb, 'interval', 2)), bindDur = isDef ? bv(bb, 'duration', 1.5) : 0;
  // "自身与流形攻击力+N%（攻击速度+N）" — every skill of hers buffs the 流形 too while it runs
  const manifoldMods = { atkPct: num(bb.atk), ...(num(bb.attack_speed) ? { aspd: num(bb.attack_speed) } : {}) };
  const buffManifold = (battle, t, dur) => battle.addBuff(t, { key: 'mlyss:s3', mods: manifoldMods, duration: dur });
  // module 落叶四季 (开源节流): copying a 莱茵生命 operator ⇒ she gains `sp`; deploying the copied one ⇒ it gains `sp_other`
  // (TAC-Y's hidden part: `sp` beside `sp_other`; TAC-D's hidden part has an `sp` of its own, for the 流形)
  const rhineSp = 'sp_other' in mod ? num(mod.sp) : 0, rhineSpOther = num(mod.sp_other);
  // module TAC-D (“缪尔赛思和朋友们”): "自身与援军造成伤害时附带相当于12%伤害的侵蚀损伤" (ep_damage_ratio); 净水即生命 +
  // "缪尔赛思或流形攻击范围内有敌人侵蚀损伤爆发后，对其造成相当于缪尔赛思攻击力400%元素伤害且流形获得80点技力" (atk_scale / sp of
  // the part beside it)
  const tacD = moduleParts(chess).find((b) => 'ep_damage_ratio' in b) ? moduleParts(chess) : null;
  const erosionRatio = tacD ? num(tacD.find((b) => 'ep_damage_ratio' in b).ep_damage_ratio) : 0;
  const burstPart = tacD?.find((b) => 'atk_scale' in b && 'sp' in b) ?? {};
  const burstScale = num(burstPart.atk_scale), burstSp = num(burstPart.sp);
  const tokTal = (t, key) => { for (const x of t.def?.talents || []) if (x?.bb && typeof x.bb[key] === 'number') return x.bb; return {}; };
  // "其被击败后会在25秒后自动刷新" (token talent interval; the talent text as a fallback)
  const respawnOf = (t) => num(tokTal(t, 'scale').interval, parseN(tdesc(def, 0), /(\d+(?:\.\d+)?)秒后自动刷新/, 25));
  const isRanged = (src) => (src.def?.position ? src.def.position === 'RANGED' : src.profile?.attack === 'ranged');

  // the copy of an operator the automatic operations chose (content/tokens.js manifoldCopyTarget, the token skill's autoTrigger)
  const copyFrom = (battle, unit, t, src) => {
    copyInto(battle, t, src, num(tokTal(t, 'scale').scale, 1), isRanged(src));
    // `mode`: the 流形's prefab mode from now on (Melee / Range — the client's mlyss_wtrman_switch_melee / _range; the S3 / S2
    // variants follow her running skill, public/js/audio.js), `by` her id (docs/SIM.md)
    battle.fx('copy', { x: t.x, y: t.y, id: t.id, src: src.id, mode: isRanged(src) ? 'Range' : 'Melee', by: unit.id });
    if (rhineSp > 0 && isRhine(src) && unit.skill) unit.skill.gainSp(rhineSp, 'talent');
  };
  const mineLive = (battle, unit) => battle.allyUnits.filter((x) => isTok(x, tokId, unit) && live(x));

  const skills = {
    // S1 渐进性润化: fake_cost DP over the skill (1 every mlyss_s_1[cost].interval s, the rest at its end), she and her
    // 流形 ATK / ASPD +
    skchr_mlyss_1: {
      kind: 'duration',
      mods: { atkPct: num(bb.atk), aspd: num(bb.attack_speed) },
      onStart({ battle, unit, skill }) {
        unit.mem.mlyDp = { acc: 0, got: 0 };
        for (const t of mineLive(battle, unit)) buffManifold(battle, t, skill.timeLeft);
      },
      onTick({ battle, unit, dt }) {
        const m = unit.mem.mlyDp;
        if (!m) return;
        const iv = Math.max(0.1, bv(bb, 'interval', 1.364)), total = Math.floor(num(bb.fake_cost, 11)), per = bv(bb, 'cost', 1);
        m.acc += dt;
        while (m.acc + 1e-9 >= iv && m.got < total) { m.acc -= iv; m.got++; battle.addDp(unit.ownerId, per); }
      },
      onEnd({ battle, unit, reason }) {
        const m = unit.mem.mlyDp;
        unit.mem.mlyDp = null;
        const total = Math.floor(num(bb.fake_cost, 11));
        if (m && reason === 'duration' && m.got < total) battle.addDp(unit.ownerId, (total - m.got) * bv(bb, 'cost', 1));
      },
    },
    // S2 生态耦合: +cost DP, she and her 流形 ATK +; melee copies regenerate hp ratio / s and take 庇护; ranged copies
    // attack twice at random targets of their range (install)
    skchr_mlyss_2: {
      kind: 'duration',
      mods: { atkPct: num(bb.atk) },
      onStart({ battle, unit, skill }) {
        battle.addDp(unit.ownerId, num(bb.cost));
        battle.fx('dp', { x: unit.x, y: unit.y, id: unit.id, n: num(bb.cost) });
        for (const t of mineLive(battle, unit)) buffManifold(battle, t, skill.timeLeft);
      },
    },
  };

  return {
    skills,
    install(battle, unit) {
      if (sid === 'skchr_mlyss_2') {
        const regen = num(bb.hp_recovery_per_sec_by_max_hp_ratio), dr = num(bb.damage_resistance);
        battle.every(0.25, () => {
          const on = !!unit.skill?.active && live(unit);
          for (const t of battle.allyUnits) {
            if (!isTok(t, tokId, unit) || !t.profile) continue;
            const m = t.mem.mlyss;
            if (t.mem.mlyssHits == null) t.mem.mlyssHits = Math.max(1, Math.floor(num(t.profile.hits, 1)));
            const ranged = !!(m && m.ranged);
            t.profile.hits = on && ranged && live(t) ? t.mem.mlyssHits * 2 : t.mem.mlyssHits; // 二连击
            // its Range_S2 mode's attack looks for its target at the strike (`_selectTargetTiming` 1; the summons' attack record is the Default mode's)
            t.profile.strikeSel = on && ranged ? 1 : null;
            if (on && m && !ranged && live(t)) {
              battle.addBuff(t, { key: 'mlyss:eco', duration: 0.4, refresh: 'replace', visible: true, mods: { hpRegenRatio: regen } });
              // "获得15%的庇护": the shared 庇护 (holdProtect — 同名效果取最高 with every other source)
              holdProtect(battle, t, dr, 0.4, unit);
            }
          }
        }, { owner: unit });
        battle.on('beforeAttack', (ctx) => { // ranged copies: 随机攻击范围内的目标
          const t = ctx.attacker;
          if (!isTok(t, tokId, unit) || !t.mem.mlyss?.ranged || !unit.skill?.active) return;
          const c = battle.enemiesInKeys(t.rangeKeys, t, ctx.profile);
          if (c.length) ctx.targets = [battle.rng.pick(c)];
        }, { owner: unit });
      }
      if (rhineSpOther > 0) battle.on('deploy', ({ unit: u, initial }) => { // the copied 莱茵生命 operator is deployed
        if (initial || !u || u.kind !== 'op' || u.ownerId !== unit.ownerId || !isRhine(u) || !u.skill) return;
        if (battle.allyUnits.some((t) => isTok(t, tokId, unit) && live(t) && t.mem.mlyss?.from === u.id)) u.skill.gainSp(rhineSpOther, 'talent');
      }, { owner: unit });
    },
    skill: {
      kind: 'duration',
      mods: { atkPct: num(bb.atk) },
      onStart({ battle, unit, skill }) {
        battle.addDp(unit.ownerId, num(bb.cost));
        battle.fx('dp', { x: unit.x, y: unit.y, id: unit.id, n: num(bb.cost) });
        const S = unit.mem;
        let ranged = false;
        for (const t of battle.allyUnits.filter((x) => isTok(x, tokId, unit) && live(x))) {
          buffManifold(battle, t, skill.timeLeft);
          if (t.mem.mlyss?.ranged) ranged = true;
        }
        // 刷新所有流形: each ranged 流形 — not a split copy (mlyss_s_3[token_range_trigger]: `mlyss_wtrman_summon[override]`) — casts
        // the token skill's SpawnTokenS3 on the five tiles of x-5 (`_maxNum` 5): a split copy on every free one, and a 流形 or copy
        // already there (`_buffsToExistToken` mlyss_wtrman_[summon_refresh]) back to full HP, a copy's time from the start. Its
        // EmitProjectileS3 only flies at those tiles (no `_atkScale`). A destroyed 流形 is not touched: only a living one casts.
        if (ranged) {
          const rangedOnes = battle.allyUnits.filter((x) => isTok(x, tokId, unit) && live(x) && x.mem.mlyss?.ranged && !x.mem.mlyssClone);
          for (const t of rangedOnes) {
            const dur = num(tokTal(t, 'steal_atk').interval, 25);
            for (const [dr, dc] of N4) {
              const r = t.tileR + dr, c = t.tileC + dc;
              const there = battle.allyUnits.find((x) => isTok(x, tokId, unit) && live(x) && x.tileR === r && x.tileC === c);
              if (there) {
                there.hp = there.s.maxHp;
                if (there.mem.mlyssClone) cloneTime(battle, there, dur);
                // its refill effect; `src` the casting 流形 (its own tile is one of the five: its cast effect too)
                battle.fx('refresh', { x: there.x, y: there.y, id: there.id, src: t.id, by: unit.id });
              } else if (battle.grid.inRect(r, c) && !battle.isReservedTile(r, c) && battle.grid.canStand(r, c, { ranged: true })) splitCopy(battle, unit, tokId, t, r, c, dur);
            }
          }
        }
        S.mlyssPulse = battle.every(pulseIv, () => { // melee copies: pull the 8 surrounding tiles + stun blocked units
          if (!unit.skill?.active) return;
          for (const t of battle.allyUnits) {
            if (!isTok(t, tokId, unit) || !live(t) || !t.mem.mlyss || t.mem.mlyss.ranged) continue;
            for (const e of battle.unitsInGrid(t, AROUND8, { side: 'enemy' })) pullToward(battle, t, e, num(t.def?.skill?.bb?.force));
            for (const e of t.blocking) if (e.alive) battle.applyStatus(e, 'stun', { duration: pulseIv + 0.1, source: unit });
            battle.fx('pulse', { x: t.x, y: t.y, id: t.id, by: unit.id });
          }
        }, { owner: unit, immediate: true });
      },
      onEnd({ unit }) { if (unit.mem.mlyssPulse) unit.mem.mlyssPulse.cancel(); unit.mem.mlyssPulse = null; },
    },
    talents: [
      { install(battle, unit) { // 净水即生命: 流形 copy / respawn / melee steal / ranged split
        const S = bstate(battle);
        S.robbed ??= new WeakMap(); // enemy → { atk, def } stolen by any 流形
        const mine = (t) => isTok(t, tokId, unit);
        // a fallen 流形 of hers waiting on its tile (below), but `t`: deployLimit 1 — another one standing ends its wait for good
        const endDown = (t) => {
          for (const d of battle.allyUnits) {
            if (d === t || !mine(d) || !d.mem.mlyssDown || d.alive || d.removed) continue;
            d.mem.mlyssDown = 0;
            d.removed = true;
          }
        };
        battle.on('deploy', ({ unit: t }) => {
          if (!mine(t)) return;
          const clone = unit.mem.mlyssCloneOf;
          if (clone) { // a split copy: same stats as its origin, never copies/splits/respawns itself
            unit.mem.mlyssCloneOf = null;
            t.mem.mlyssClone = true;
            t.mem.isClone = true; // content/tokens.js skips clones too (her redeploy must bring a real 流形, not adopt a clone)
            copyInto(battle, t, clone, 1, true);
            return;
          }
          endDown(t); // another 流形 of hers stands (a tactical re-summon): the fallen one does not come back
          if (t.mem.mlyssReborn) { // back from its fall (below): its copy, home and first-deployment SP stay as they were
            if (unit.skill?.active && unit.skill.isTimed) buffManifold(battle, t, unit.skill.timeLeft);
            return;
          }
          t.mem.mlyssHome = [t.tileR, t.tileC];
          // born in mode Recharge: mlyss_wtrman_born_trigger casts mlyss_wtrman_switch at once (its effect c0 → c1; the
          // engine's born time stands for the cast)
          battle.fx('manifoldUp', { x: t.x, y: t.y, id: t.id, by: unit.id, mode: 'Default', born: 1 });
          const sp = num(tokTal(t, 'sp').sp);
          if (sp > 0 && !unit.mem.mlyssFirst && t.skill) t.skill.gainSp(sp, 'talent'); // elite: first deployment +5 SP
          unit.mem.mlyssFirst = true;
          if (unit.skill?.active && unit.skill.isTimed) buffManifold(battle, t, unit.skill.timeLeft);
        }, { owner: unit });
        // the 流形 copies when the automatic operations say (content/tokens.js, the token skill's autoTrigger), this way
        unit.mem.manifoldCopy = (b, t, src) => { if (mine(t) && !t.mem.mlyssClone) copyFrom(b, unit, t, src); };
        // trigger rule MLYSS_WTRMAN ("全部技能，受流形影响") for her own skills (`_TryUsingSkillTypeMlyssWtrman`, not a token):
        // the MANUAL check, then her ATTACK / COMBAT state — the engine's DEFAULT without a trigger grid; her 流形 do not count
        // "其被击败后会在25秒后自动刷新" — the token prefab (official client): a RallyPoint whose live modes hold
        // mlyss_wtrman_t_1[listener]; ON_BEFORE_TRY_SET_HP_ZERO it does not die but switches its category off the fight
        // (SwitchRallyPointCategory), into mode 0 Recharge (its puddle), its skill interrupted and its SP cleared. The prefab's
        // `_retainedBuffsWhenDead` keep its copy (mlyss_wtrman_melee / range[mark], steal_attr_self[atk] / [def],
        // mlyss_wtrman_t_2[range_cnt]). Recharge's mlyss_wtrman_t_1[trigger] fires after the talent `interval` and casts
        // mlyss_wtrman_switch_melee / _range (or mlyss_wtrman_switch uncopied): after its `_preDelay` its reborn buff
        // (RallyPointReborn, hp_ratio 1) brings it back in its copied mode. Split copies hold mlyss_wtrman_summon[override]
        // in the listener's place (same overrideKey, higher priority) and fall for good. So: the fallen 流形 stays on its tile
        // (alive false, removed false: Battle.isReservedTile keeps the tile), whether she stands or not, and comes back there
        // at full HP with its copy, its stolen ATK / DEF and its split count; expired / replaced ones do not return
        battle.on('death', ({ unit: t, reason }) => {
          if (!mine(t) || t.mem.mlyssClone || reason !== 'killed' || !t.mem.mlyssHome || battle.finished) return;
          t.removed = false;
          const seq = (t.mem.mlyssDownSeq ?? 0) + 1;
          t.mem.mlyssDownSeq = seq;
          t.mem.mlyssDown = seq;
          t.skill?.setSpTotal?.(0); // ClearCharacterSp (its skill ended with the removal: InterruptCharacterSkill)
          const mode = t.mem.mlyss ? (t.mem.mlyss.ranged ? 'Range' : 'Melee') : 'Default';
          const wait = respawnOf(t);
          // `mode`: the one it fell in (its effect back to c0), `t`: s until it stands again (its Recharge look lasts that long)
          battle.fx('manifoldDown', { x: t.x, y: t.y, id: t.id, by: unit.id, mode, t: wait + MANIFOLD_REBORN });
          const back = () => {
            if (t.mem.mlyssDown !== seq || battle.finished || t.alive || t.removed) return;
            t.mem.mlyssReborn = true;
            let ok;
            try { ok = battle.redeploy(t, { free: true }); } finally { t.mem.mlyssReborn = false; }
            if (!ok) { battle.after(1, back, { owner: t }); return; } // its tile is taken: retry in 1 s
            t.mem.mlyssDown = 0;
            t.skill?.setSpTotal?.(0);
            const m = t.mem.mlyss;
            if (m && (m.stolenAtk > 0 || m.stolenDef > 0)) battle.addBuff(t, { key: 'mlyss:stolen', mods: { atkFlat: m.stolenAtk, defFlat: m.stolenDef } });
          };
          battle.after(wait, () => {
            if (t.mem.mlyssDown !== seq || battle.finished || t.alive || t.removed) return;
            // mlyss_wtrman_t_1[trigger] ON_BUFF_TRIGGER: the switch cast and its effect c0 → c1 / c2 / c3, then the reborn
            battle.fx('manifoldUp', { x: t.x, y: t.y, id: t.id, by: unit.id, mode });
            battle.after(MANIFOLD_REBORN, back, { owner: t });
          }, { owner: t });
        }, { owner: unit });
        battle.on('attack', ({ attacker: t, targets }) => {
          if (!mine(t) || !t.mem.mlyss || !live(t)) return;
          const tal = tokTal(t, 'steal_atk');
          const m = t.mem.mlyss;
          if (!m.ranged) { // melee copy: 每次攻击偷取敌方10点攻击力与防御力（最高250点）— a capped copy steals nothing more
            const sa = num(tal.steal_atk), sd = num(tal.steal_def, sa);
            const capA = num(tal.steal_atk_max, Infinity), capD = num(tal.steal_def_max, capA);
            let changed = false;
            for (const e of targets) {
              if (!e.alive || e.side !== 'enemy') continue;
              const ga = Math.max(0, Math.min(sa, capA - m.stolenAtk)), gd = Math.max(0, Math.min(sd, capD - m.stolenDef));
              if (!(ga > 0 || gd > 0)) break;
              m.stolenAtk += ga; m.stolenDef += gd;
              const rb = S.robbed.get(e) || { atk: 0, def: 0 };
              rb.atk += ga; rb.def += gd;
              S.robbed.set(e, rb);
              battle.addBuff(e, { key: 'mlyss:robbed', mods: { atkFlat: -rb.atk, defFlat: -rb.def }, source: t });
              changed = true;
            }
            if (changed) battle.addBuff(t, { key: 'mlyss:stolen', mods: { atkFlat: m.stolenAtk, defFlat: m.stolenDef } });
          } else if (!t.mem.mlyssClone) { // ranged copy: split every N attacks (the clone lasts `interval` s)
            const every = Math.max(1, Math.floor(bv(tal, 'max_stack_cnt', 10)));
            if (++m.attacks % every !== 0) return;
            const tiles = N4.slice(1).map(([dr, dc]) => [t.tileR + dr, t.tileC + dc])
              .filter(([r, c]) => battle.grid.inRect(r, c) && !battle.isReservedTile(r, c) && battle.grid.canStand(r, c, { ranged: true }));
            const tile = bestTile(battle, tiles);
            if (!tile) return;
            splitCopy(battle, unit, tokId, t, tile[0], tile[1], num(tal.interval, 25));
          }
        }, { owner: unit });
        battle.on('damaged', (ctx) => { // S3, ranged copies: attacks bind
          const t = ctx.source;
          if (!mine(t) || !t.mem.mlyss?.ranged || !unit.skill?.active || !ctx.dmg?.isAttack || !ctx.target.alive || !(bindDur > 0)) return;
          battle.applyStatus(ctx.target, 'bind', { duration: bindDur, source: unit });
        }, { owner: unit });
        battle.on('hit', (ctx) => { // module: 援军 / 流形 take less damage from the enemies they block
          const t = ctx.target, s = ctx.source;
          if (!t || !s || s.side !== 'enemy' || s.blockedBy !== t) return;
          if (mine(t)) { // 流形 (her 援军): token module part, unless its token kit (content/tokens.js) applies it
            if (!t.kit?.fromTokens) { const ds = num(tokTal(t, 'damage_scale').damage_scale, 1); if (ds > 0 && ds < 1) ctx.dmg.mul *= ds; }
          } else if (reinfCut > 0 && t === unit.trait?.reinforcement) ctx.dmg.mul *= 1 - reinfCut; // engine 援军
        }, { owner: unit });
        // module 落叶四季: "援军阻挡的敌人更容易受到我方的攻击" — the 流形's module part (token talent taunt_level: +1) on
        // the enemies it blocks: our operators pick higher-taunt enemies first (targeting.js sortEnemyTargets)
        battle.every(0.25, () => {
          for (const t of battle.allyUnits) {
            if (!mine(t) || !live(t) || !t.blocking.length) continue;
            const lv = num(tokTal(t, 'taunt_level').taunt_level);
            if (!(lv > 0)) continue;
            for (const e of t.blocking) if (e.alive) battle.addBuff(e, { key: 'mlyss:exposed', mods: { taunt: lv }, duration: 0.4, refresh: 'replace', source: t });
          }
        }, { owner: unit });
      } },
      ...(tacD ? [{ install(battle, unit) { // module TAC-D: erosion on her and her 流形's damage; the burst's 元素伤害 and SP
        const mine = (t) => isTok(t, tokId, unit) || (!!t && t === unit.trait?.reinforcement);
        if (erosionRatio > 0) {
          battle.on('damaged', (ctx) => {
            const s = ctx.source, t = ctx.target;
            if ((s !== unit && !mine(s)) || !t || t.side !== 'enemy' || !t.alive || !(ctx.amount > 0)) return;
            if (ctx.dmg?.type === 'element' || ctx.dmg?.type === 'elemental') return; // not on its own erosion / the burst hit
            battle.dealDamage(s, t, { type: 'element', element: 'erosion', amount: ctx.amount * erosionRatio, tags: ['module'] });
          }, { owner: unit });
        }
        if (burstScale > 0 || burstSp > 0) {
          battle.on('elementBurst', ({ target, element }) => {
            if (element !== 'erosion' || !target || target.side !== 'enemy' || !live(unit)) return;
            const copies = battle.allyUnits.filter((t) => isTok(t, tokId, unit) && live(t));
            const near = enemiesIn(battle, unit).includes(target) || copies.some((t) => enemiesIn(battle, t).includes(target));
            if (!near) return;
            if (burstScale > 0 && target.alive) battle.dealDamage(unit, target, { amount: unit.s.atk * burstScale, type: 'elemental', element: 'erosion', tags: ['module'] });
            // [ASSUMED·CN: "流形获得80点技力" names no 流形 — every 流形 of hers on the field; the module is CN-only so far]. It lands on
            // a copied 流形 (its skill ends with the copy's switch, content/tokens.js MANIFOLD_SWITCH) and on one back from a fall
            // (SP cleared), not while its skill runs (SP is not gained then) nor on split copies (no skill); a full copied 流形
            // casts again and copies nothing
            if (burstSp > 0) for (const t of copies) t.skill?.gainSp(burstSp, 'talent');
          }, { owner: unit });
        }
      } }] : []),
      { install(battle, unit) { // 开源节流: 莱茵生命 ops of the owner cost less DP to redeploy
        const S = bstate(battle);
        S.rhine ??= new Set();
        if (S.rhine.has(unit.ownerId)) return;
        S.rhine.add(unit.ownerId);
        const cut = num(t1.cost), first = num(t1.runtime_cost);
        battle.on('battleStart', () => {
          const rh = battle.allyUnits.filter((a) => a.kind === 'op' && a.ownerId === unit.ownerId && isRhine(a)).sort((a, b) => a.deploySeq - b.deploySeq);
          rh.forEach((a, i) => { a.base.cost = Math.max(0, a.base.cost + cut + (i === 0 ? first : 0)); });
        });
      } },
    ],
  };
}

export default {
  chess_char_6_11_a: mlyss,
};
