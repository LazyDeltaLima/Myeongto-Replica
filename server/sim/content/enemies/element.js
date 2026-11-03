// server/sim/content/enemies/element.js — ELEMENT 元素 kits (element damage, 海嗣 / 萨卡兹 / 孽生 enemies) and their part of
// KITS (split from content/enemies.js).

import { periodicDamage } from '../../damage.js';
import {
  stOf, T, elem, hurt, targetsNear, areaAllies, areaAlliesInTiles, targetAndArea, byPriority, setForm, onTerrain, canCast,
} from './helpers.js';
import { taunt, ep, deathSpawn, deathBoom, setFloat, float, skill, kitEp, kitStun3 } from './archetypes.js';

// ---------------------------------------------------------------------------------------------------------------
// constants (numbers that exist nowhere in the data)

/** 假想敌：淤困: element damage its host's burst spreads to the allies of the 4 tiles around (PRTS 假想敌：淤困 "附着对象元素爆发时
 *  …对附着对象及周围4格内的所有我方单位…造成1000同类型元素损伤"; the host itself is in its 爆发冷却). */
const PARASITE_SPREAD = 1000;
/** 假想敌：淤困: how often its host must still block it — `enemy_acelem[check_block]` triggerInterval 0.2, from the attachment. */
const CHECK_BLOCK_INTERVAL = 0.2;
/** 假想敌：淤困: its Combat cast — the length of its clip Parasitic (enemy_9007_acelem.skel), which has no OnAttack event. */
const PARASITIC_CLIP = 1.2;

// ---------------------------------------------------------------------------------------------------------------
// kits

function kitDeepsea(ab, { swim = false, drown = false }) {
  return [{
    iv: 0.25,
    spawn(b, e) { if (swim) e.mem.immuneDrown = true; },
    tick(b, e, a, dt) {
      const wet = onTerrain(b, e, 'deepsea');
      if (swim) {
        if (wet && !a.wet) b.addBuff(e, { key: 'ab:swim', mods: { atkPct: T(ab, 'Swim.atk') ?? 0 }, flags: { stealth: true }, visible: true });
        if (!wet && a.wet) b.removeBuff(e, 'ab:swim');
        if (wet) b.removeBuff(e, 'terrain:deepsea');   // 免疫水蚀: drop devices.js' deep-water debuff
      }
      // PRTS 码头水手 "水蚀状态下或处于清澈水域时，每秒受到1000点无来源真实伤害" (伤害分类: 深水区/涨潮水蚀 is BUFF damage):
      // damage, not a 流失 — 脆弱 scales it (player report D1 audit)
      if (drown && wet) { const v = T(ab, 'Drown.damage') ?? 0; if (v > 0) b.dealDamage(null, e, { ...periodicDamage(v * dt), tags: ['dot', 'periodic', 'drown'] }); }
      a.wet = wet;
    },
    // 免疫水蚀: the deep-water tick (devices.js, tag 'deepsea') and drowning — not 环境伤害 ('terrain', e.g. 活性源石)
    hitIn(c, b, e, a) { if (swim && a.wet && c.dmg.tags && c.dmg.tags.some((t) => t === 'deepsea' || t === 'drown')) c.dmg.cancel = true; },
  }];
}

function kitTidmag(ab) {
  return [ep('erosion', T(ab, 'EpDamage.attack@ep_damage_ratio') ?? 0), {
    before(c, b, e) {
      // PRTS 控潮术师 "对目标所在地块及周围四格内的所有我方单位造成法术普通伤害": the 周围四格 are an area selection (格子判定:
      // a 迷彩 ally is hit; an unblocking 隐匿 or an airborne 起飞 one is not — areaAlliesInTiles)
      const t0 = c.targets[0];
      if (!t0) return;
      const l = c.targets.slice();
      for (const u of areaAlliesInTiles(b, e, t0.tileR, t0.tileC, 'plus', 1)) if (!l.includes(u)) l.push(u);
      c.targets = l;
    },
  }];
}

/** 掠海漂移体 爬行模式: the stun it takes on dropping (PRTS "进入爬行模式并晕眩0.5秒"; not in its blackboard). */
const SYUFO_CRAWL_STUN = 0.5;

/**
 * 掠海漂移体 (PRTS): 初始模式 近地悬浮 + 失衡免疫, 不会攻击飞行单位; 受晕眩/无法行动/沉睡/冻结/缚地影响后进入爬行模式 for
 * good and is stunned 0.5 s — a ground unit (blockable, melee operators hit it) that "仅进行阻挡攻击" (only its blocker).
 * The engine has 晕眩 / 冻结 / 沉睡 / 缚地 (予愿安洁莉娜 S2; no operator here applies 无法行动). Erosion on every attack.
 */
function kitSyufo(ab) {
  return [float(), ep('erosion', T(ab, 'EpDamage.attack@ep_damage_ratio') ?? 0), {
    spawn(b, e) { e.profile.canTarget = (u) => !u.isFlying; },
    status(c, b, e, a) {
      if (a.crawl || !(c.status === 'stun' || c.status === 'freeze' || c.status === 'sleep' || c.status === 'groundbind')) return;
      a.crawl = true;
      setFloat(b, e, false);
      e.profile.melee = true;
      b.applyStatus(e, 'stun', { duration: SYUFO_CRAWL_STUN, source: null });
      setForm(b, e, 'crawl');
    },
  }];
}

function kitDeathEye(ab, e) {
  const s = ab.sk.DeathEye;
  const r = e.base.rangeRadius || 2.5;
  return [ep('apoptosis', T(ab, 'empty.attack@ep_damage_ratio') ?? 0), skill(s, (b, e2, a) => {
    const t = byPriority(e2, targetsNear(b, e2, r))[0];
    if (!t) return;
    const dur = s.bb.hit_duration ?? 0;
    b.addBuff(e2, { key: 'ab:channel', duration: dur, flags: { disarm: true } });
    b.fx('beam', { x: e2.x, y: e2.y, from: e2.id, to: t.id, kind: 'deathEye', dur });
    let n = 0;
    const h = b.every(1, () => {
      if (!e2.alive) { h.cancel(); return; }
      // a stun / silence (SILENCE-flagged ability) or the locked target's fall interrupts the channel: no burst
      if (e2.s.flags.stun || e2.s.flags.silence || !t.alive) { h.cancel(); b.removeBuff(e2, 'ab:channel'); b.fx('beam', { x: e2.x, y: e2.y, from: e2.id, to: t.id, kind: 'deathEyeEnd' }); return; }
      hurt(b, e2, t, e2.s.atk * (s.bb.atk_scale ?? 0), 'arts');
      if (++n >= dur) {
        h.cancel();
        b.fx('explode', { x: t.x, y: t.y, r: 1, kind: 'apoptosis' });
        // "对目标及其周围4格的我方单位": the locked target (a 隐匿 it gained mid-channel does not save it) + an area around it
        for (const u of targetAndArea(t, areaAllies(b, e2, t.x, t.y, 1))) elem(b, e2, u, 'apoptosis', e2.s.atk * (s.bb.ep_damage_ratio ?? 0));
      }
    }, { owner: e2 });
  }, { sil: true, cond: (b, e2) => targetsNear(b, e2, r).length > 0 })];
}

/**
 * 淤困's "受到的元素损伤提高至130%" on its host: an `elementHit` multiplier (SIM.md §7.2 — every "受到的元素损伤±N%"; on an
 * operator at priority 20, before a 损伤屏障), never 元素伤害. One battle-wide handler, installed with the first host.
 */
function ensureParasiteHook(b) {
  const st = stOf(b);
  if (st.parasiteHook) return;
  st.parasiteHook = true;
  b.on('elementHit', (c) => {
    const bf = c.target && c.dmg && c.dmg.type === 'element' ? c.target.findBuff('ab:parasite') : null;
    const m = bf && bf.data ? bf.data.epMul : 1;
    if (m > 0 && m !== 1) c.dmg.mul *= m;
  }, { priority: 20 });
}

/**
 * 假想敌：淤困 附着: blocked, it casts its mode Default's Combat ability on its blocker — the clip Parasitic (1.2 s, `_timeMode`
 * FROM_ANIMATION) has no OnAttack event, so the cast waits the whole clip (EasyToStartAbility `_waitForAttackEvent` up to
 * the cached duration) and then lands (AbilityStandard.OnCastOnTarget → AbilityAttachment.Apply: Talents/1's
 * PassiveAttachmentAbility gives the target `enemy_acelem[to_parasitic]`). The enemy has no Attack ability (applyWay NONE):
 * this is all it does. Attached it switches to mode Parasitic, blinks onto the host's tile centre and is 自缚
 * (`ab:parasiteAttached` noMove + selfBound); the host takes arts damage every second and element damage ×. Every 0.2 s from
 * the attachment (`enemy_acelem[check_block]`) the host must still block it, else the attachment ends (PRTS "附着效果在解除阻挡时
 * 解除"); its death ends it too. The cast follows the client's COMBAT state: it starts as the enemy enters it on being blocked
 * (`CombatState.OnEnter`); while it runs the state waits (`OnTick` returns while the ability casts), so losing the block does
 * not cut it — it lands on the operator it started on, who must still be on the field; a stun switches the state and
 * `OnExit` interrupts it (so does a freeze, a levitation or the palsy halt).
 */
function kitParasite(ab) {
  const scale = T(ab, '1.atk_scale') ?? 0, elMul = T(ab, '1.ep_damage_scale') ?? 1;
  const attach = (b, e, a, host) => {
    a.host = host;
    a.next = b.time + CHECK_BLOCK_INTERVAL;
    ensureParasiteHook(b);
    // to_parasitic's BlinkNode (`_forceToMapPosition`, the host's grid from AssignGridPositionToBlackboard) → Enemy.Blink(grid):
    // onto a tile its motion can pass, it is let go by its blocker (ReleaseFromBlocker — the block slide ends) and set on the
    // tile centre at once; the host's next search (≤ 3 ticks, battle/blocking.js) blocks it again there, at its own centre.
    // fx 'teleport' kind 'parasite' makes the client cut this short move instead of sliding it (render/interp.js). The client
    // prefab has no effect for the blink: mode Parasitic plays Parasitic once and then Idle_2 for Idle (`_replaceAnimPairs`) —
    // form 'parasitic' (render/units.js FORMS), no stand-in puff (fx/kinds.js)
    const fromX = e.x, fromY = e.y;
    // [추정·엔진: when the blink fails (a tile it cannot pass) whether the buff's next node — the block check — still runs is
    // not read; it attaches where it stands]
    if (e.isFlying || b.grid.groundPassable(host.tileR, host.tileC)) {
      b._unblock(e);
      e.x = host.tileC; e.y = host.tileR;
      if (e.route) e.route.pts = null;
    }
    b.addBuff(e, { key: 'ab:parasiteAttached', flags: { noMove: true, selfBound: true } });
    e.form = 'parasitic';
    b.fx('teleport', { x: e.x, y: e.y, fromX, fromY, id: e.id, kind: 'parasite', form: 'parasitic' });
    b.fx('beam', { x: e.x, y: e.y, from: e.id, to: host.id, kind: 'parasite' });
    b.addBuff(host, {
      // "受到的元素损伤提高至130%": a 元素损伤 multiplier on the element hit (ensureParasiteHook), not 元素伤害
      key: 'ab:parasite', visible: true, interval: 1, data: { src: e, spread: PARASITE_SPREAD, epMul: elMul },
      onTick: ({ battle, unit }) => { if (e.alive) battle.dealDamage(e, unit, { amount: e.s.atk * scale, type: 'arts', canDodge: false, ignoreSelect: true, tags: ['enemyAbility', 'parasite'] }); },
    });
  };
  const detach = (b, e, a) => {
    b.removeBuff(a.host, 'ab:parasite');
    b.removeBuff(e, 'ab:parasiteAttached');
    a.host = null;
    // back to the prefab's mode Default (to_parasitic's ON_BUFF_FINISH SwitchMode 0); a silent 'phase' (render/fx/kinds.js)
    e.form = null;
    b.fx('phase', { x: e.x, y: e.y, id: e.id, kind: 'detached', form: null });
  };
  return [taunt(-1), {
    tick(b, e, a) {
      while (a.host && b.time >= a.next - 1e-9) {
        a.next += CHECK_BLOCK_INTERVAL;
        if (!a.host.alive || e.blockedBy !== a.host) detach(b, e, a);
      }
      if (a.host) return;
      if (a.castOn) {
        const t = a.castOn;
        // (stun covers freeze and levitate — their statuses set it —; the palsy halt is the other state that interrupts)
        if (!canCast(e, false, b) || b.time < e.palsyUntil - 1e-9 || !t.alive || !t.deployed) a.castOn = null;
        else {
          if (b.time >= a.castEnd - 1e-9) { a.castOn = null; attach(b, e, a, t); }
          return;
        }
      }
      const bl = e.blockedBy && e.blockedBy.alive && canCast(e, false, b) ? e.blockedBy : null;
      if (bl) { a.castOn = bl; a.castEnd = b.time + PARASITIC_CLIP; }
    },
    death(c, b, e, a) { if (a.host) b.removeBuff(a.host, 'ab:parasite'); b.removeBuff(e, 'ab:parasiteAttached'); },
  }];
}

function kitIgnitable(ab) {
  return [deathBoom({ scale: T(ab, 'boom.atk_scale') ?? 0, type: 'arts', cond: (e) => !!e.mem.ab.ignited, sil: true, ability: 'boom' })];
}

function kitFlameVine(ab) {
  const add = T(ab, 'pow.add_max_atk') ?? 0, time = T(ab, 'pow.time') ?? 0;
  const first = T(ab, 'pow.attack@ep_damage_ratio') ?? 0, normal = T(ab, 'pow.attack@ep_damage_ratio_normal') ?? 0;
  return [{
    iv: 0.5,
    spawn(b, e, a) { a.t0 = b.time; a.first = true; },
    tick(b, e, a) {
      if (!a.first || !(time > 0)) return;
      const k = Math.min(1, (b.time - a.t0) / time);
      b.addBuff(e, { key: 'ab:pow', mods: { atkPct: add * k }, persist: true });
    },
    dealt(c, b, e, a) {
      const t = c.target;
      if (a.first) {
        // 首次攻击 (PRTS 灼藤): every other ally of the target's 3×3 (range x-4, "格子判定，不受迷彩制约") takes 100 % ATK
        // arts splash and everyone there 25 % ATK burn — an area selection (no unblocking 隐匿 ally); then the ATK ramp
        // ends and later attacks add 20 %
        a.first = false;
        b.fx('explode', { x: t.x, y: t.y, r: 1.5, kind: 'flameVine' });
        for (const u of targetAndArea(t, areaAlliesInTiles(b, e, t.tileR, t.tileC, 'box', 1))) { if (u !== t) hurt(b, e, u, e.s.atk, 'arts'); elem(b, e, u, 'burn', e.s.atk * first); }
        b.removeBuff(e, 'ab:pow');
      } else elem(b, e, t, 'burn', e.s.atk * normal);
    },
    attack(c, b, e) {
      // ignites nearby 卷心籽
      for (const o of b.enemiesInRadius(e.x, e.y, 1.5)) if (o.defId === 'enemy_10065_ftzlc' && o.mem.ab && !o.mem.ab.ignited) { o.mem.ab.ignited = true; b.fx('ignite', { x: o.x, y: o.y, id: o.id }); }
    },
  }];
}

function kitNucleus(ab) {
  return [{
    taken(c, b, e, a) {
      if (a.on) return;
      a.on = true;
      b.addBuff(e, { key: 'ab:combat', persist: true, visible: true, mods: { moveMul: T(ab, '0.move_speed') ?? 1 } });
      // dslntf_tr_1's PlayAudio `Awake` as it switches to mode 1 (sound only)
      b.fx('kitHit', { x: e.x, y: e.y, id: e.id, k: 'dslntf:awake' });
    },
    iv: T(ab, '1.interval') ?? 1,
    // 【孽生者的神经毒素】 "（无视迷彩，同名效果不叠加…）": an area selection (no unblocking 隐匿 ally)
    tick(b, e, a) { if (!a.on) return; for (const u of areaAllies(b, e, e.x, e.y, T(ab, '1.range_radius') ?? 0)) elem(b, e, u, 'neural', e.s.atk * (T(ab, '1.ep_damage_ratio') ?? 0)); },
  }];
}

// ---------------------------------------------------------------------------------------------------------------
// this family's part of KITS (content/enemies.js spreads the parts in this order)

export const ELEMENT_KITS = Object.freeze({
  // --- ELEMENT 元素
  enemy_1148_dssbr: kitEp('neural', 'epdamage.attack@ep_damage_ratio'),       // 底海滑动者 · neural on hit
  enemy_1148_dssbr_2: kitEp('neural', 'epdamage.attack@ep_damage_ratio'),     // 富营养的滑动者 · neural on hit
  enemy_1158_divman: (ab) => kitDeepsea(ab, { swim: true }),          // 潜水员 · in deep water: ATK up + stealth; immune to 水蚀
  enemy_1160_hvyslr: (ab) => [...kitStun3(ab), ...kitDeepsea(ab, { drown: true })],   // 码头水手 · every (spCost+1)th attack stuns; drowns in deep water
  enemy_1160_hvyslr_2: (ab) => [...kitStun3(ab), ...kitDeepsea(ab, { drown: true })], // 码头水手长 · same
  enemy_1161_tidmag: kitTidmag,                                      // 控潮术师 · attack hits target + 4 neighbours, erosion
  enemy_1161_tidmag_2: kitTidmag,                                    // 领潮员 · same
  enemy_1162_magmot: (ab) => [...kitTidmag(ab), deathSpawn(ab.tS['DeathRattle.enemy_key'], 1)], // 术师快艇 · same + 控潮术师 on death
  enemy_1305_mhslim: kitEp('burn', 'EpDamage.attack@ep_damage_ratio'),        // 灼热源石虫 · burn on hit
  enemy_1305_mhslim_2: kitEp('burn', 'EpDamage.attack@ep_damage_ratio'),      // 炽焰源石虫 · burn on hit
  enemy_2021_syfish: kitEp('erosion', 'EpDamage.attack@ep_damage_ratio'),     // 骨海漂流体 · erosion on hit
  enemy_2025_syufo: kitSyufo,                                        // 掠海漂移体 · 近地悬浮 (drops to 爬行模式 when stunned) + erosion
  enemy_1229_darmy: kitEp('apoptosis', 'epdamage.attack@ep_damage_ratio'),    // 萨卡兹王庭军战士 · apoptosis on hit
  enemy_1229_darmy_2: kitEp('apoptosis', 'epdamage.attack@ep_damage_ratio'),  // 萨卡兹王庭军精锐战士 · apoptosis on hit
  enemy_1275_dwlock_2: kitDeathEye,                                  // 萨卡兹王庭军精锐术师 · apoptosis on hit + DeathEye channel → group apoptosis
  enemy_1439_dslntf: kitNucleus,                                     // 元核孽生者 · first damage: combat state (speed ×, neural pulse around)
  enemy_1439_dslntf_2: kitNucleus,                                   // 异光体孽生者 · same
  enemy_9007_acelem: kitParasite,                                    // 假想敌：淤困 · taunt −1; parasitises its blocker (arts/s, element taken ×, its burst spreads 1000)
  enemy_10065_ftzlc: kitIgnitable,                                   // 卷心籽 · ignited by 灼藤 → arts death blast
  enemy_10067_ftsjc: kitFlameVine,                                   // 灼藤 · ATK ramps until the 1st attack (3×3 arts + burn), burn on hit, ignites 卷心籽
});
