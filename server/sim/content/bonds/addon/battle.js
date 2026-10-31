// server/sim/content/bonds/addon/battle.js — battle side of the 15 add-on bonds (research 02 §3.9–§3.23).
//
// Every number comes from data/bonds.json (`env_gbuff_new` buff blackboards). ATK / DEF / max HP "+X%" are 直接乘算
// (support directMods: additive with every other percentage, PRTS 盟约记录). Effects only apply to the owning
// player's units (`unit.ownerId === playerId`): two players sharing a boss / 联防 field never buff each other.
// Layer-dependent values read the LIVE layers (`battle.getPlayer(pid).bonds[id].layers`): an IN_BATTLE layer gain
// (engine `layerGain` hook, which fires before the layers are written) schedules one deferred recompute per player.
//
//   精准 preciShip     members ATK +(base_atk + atk_per_stack·L); tier 2 (3 distinct): members + RANGED operators,
//                      which also ignore power_def_penetrate DEF / power_magic_resist_penetrate RES (defIgnorePct / resIgnorePct)
//   迅捷 swiftShip     an operator's skill end → one roll p = min(1, base_prob + prob_per_stack·L): a hit gives a member
//                      +normal_sp SP and, at L ≥ power_bond_stack_cnt, every operator +power_sp (a member both, on the same
//                      roll — client buff graph act1autochess_bond_eff_swift: Dice → member? → AlwaysNext → layers?)
//   灵巧 skillfulShip  ASPD +(base + per·L) for an operator that, when it deploys, has a member piece on its own or one of
//                      its 4 adjacent tiles (L ≥ power_bond_stack_cnt: its 8 surrounding tiles) — members themselves
//                      always; judged once per deployment and kept while it stays (client buff graph, see 灵巧 aura below)
//   奥术 arcaneShip    member arts damage → target arts taken ×(base + per·L) for weak_duration s; tier 2: ×power_weak_scale
//                      when the target is at or below hp_ratio at application. ONE instance per target whatever applies it — the
//                      two players of a pair field compete for it, the strongest wins (battle.applyStrongest, 同名效果取最高:
//                      PRTS 作战机制 "同名buff的默认叠加策略buff只能表现出一个"; 巴哈姆特 12316 first-hand: "共享型buff會跟對面搶
//                      如果對面層數比你高就不需要再特別激活直接吃他的奧術buff"). v2.5 kept one per player, so two players'
//                      instances multiplied (×5.4 × ×5.6 on a leader at ~250 layers, DESIGN §20.10). PRTS 盟约记录's own
//                      note "※同一单位仅可对同一目标同时施加1个该盟约法术伤害提升效果" (one instance per unit and target)
//                      fits it under the engine default (a newer same-named buff waits until the earlier ends, PRTS
//                      常见同名状态); strongest vs earliest is [ASSUMED]. A member does not re-apply (nor refresh) while
//                      its own instance on that target lasts: client buff graph act2autochess_bond_eff_arcane ON_OUTPUT_DAMAGE
//                      (MAGICAL damage of any attack type, dodged included) → CheckContainsBuff [weak] from this member →
//                      IfNot → CreateBuff (FilterByTargetHpRatio LE hp_ratio picks the tier-2 value; the PRTS revision
//                      oldid 386936 said the same). Re-measured after the 0.1.0 report
//                      "奥术盟约不生效": it works on the real and the browser path (test/sim/feedback1b-arcane.test.js);
//                      标准 never activates it (modeDataDict inactiveBondIdList)
//   坚守 steadShip     all operators max HP +(base + per·L); tier 2: 40 % of a non-member operator's damage is borne by
//                      the members on the field (split evenly, sourceless true damage — already mitigated), members’ thorns
//                      (base + per·L arts, sourceless but credited to the member hit, ≤ 1 per cd_duration per member;
//                      无来源 damage uses the chance and hits nobody, a 流失 never does — PRTS 备注 / 作战机制)
//                      + 脆弱 ×damage_scale for weak[limit] s, applied before the thorn (client buff graph stead[ex])
//   助力 deputShip     all operators DEF +(base + per·L), redeploy time ×(1 + respawn_time)
//   突袭 raidShip      a member jumps — retreat + free redeploy next to a ground enemy (a 隐匿, asleep or untargetable one
//                      too), the highest 嘲讽 then the most advanced first — on: its passive skill (once per battle), its
//                      ready MANUAL or AUTO skill with no enemy on its own / front tile, its AUTO skill's start (not blocking),
//                      or no_attack_duration s without an attack (SP kept; the skill ways land with full SP). Landing:
//                      the enemy's tile or the one behind it as seen from the member, on a battlefield tile of this
//                      field (both halves of a boss field and of a two-helper 联防 field, never the hand rows) it may
//                      stand on (never the 深水区, never a fallen operator's tile). While its skill runs a member has
//                      ATK / max HP +(base + per·L). Details and sources: the 突袭 section below (client buff graph
//                      act1autochess_bond_eff_raid). A real redeployment (full HP, `deploy` fires — 部署时 traits) with
//                      its SP / charges kept; knocked out after a jump it lies where it fell and comes back there (the
//                      engine's rest tile, Battle._layBody); L ≥ power_bond_stack_cnt: every operator ASPD +power_attack_speed
//   不屈 indomShip     ground operator knocked out → p = min(1, base + per·L) immediate free redeploy where it lies
//                      (the engine's rest tile), rolled as a pseudo-random distribution (dicePRD: the N-th roll since the
//                      last hit succeeds with N × C(p), one count per battle); tier 2: every operator on the field +sp SP
//   协防 emptyShip     all operators phys/arts taken ×(1 − damage_resistance); members dealt ×damage_scale_normal
//                      (elite ×damage_scale_extra)
//   独行 soloShip      the member(s) ATK +atk, HP +max_hp, +sp SP on every deploy
//   绝技 suntShip      tier 1: elite operators ATK +power_atk; tier 2: elites SP cost ceil(×sp_ratio) — not their summons
//   远见 / 奇迹 / 投资人 / 调和 have no battle effect (prep side, membership in support/index.js).
//
// Hooks registered only when a bond needs them. Priorities: `hit` −20 (坚守 redirect, after other modifiers had their
// say), `death` 10 (不屈, the bond slot of the revive/redeploy convention); everything else 0.

import { normDir, rotateOffset } from '../../../dir.js';
import { bodyKeys, bodyOnTile } from '../../../body.js';
import { isHpLoss } from '../../../damage.js';
import {
  num, bondRecord, buffParams, bondTier, bondLayers, isMember, isElite, isGroundOp, onField, playerOps, passiveBuff,
  fxOn, tplFx, N4, N8, directMods, COLS,
} from '../../support/index.js';

export const ID = Object.freeze({
  preci: 'preciShip', swift: 'swiftShip', skillful: 'skillfulShip', arcane: 'arcaneShip', stead: 'steadShip',
  deput: 'deputShip', raid: 'raidShip', indom: 'indomShip', empty: 'emptyShip', solo: 'soloShip', sunt: 'suntShip',
});
export const KEY = Object.freeze({
  preci: 'bond:preciShip', stead: 'bond:steadShip', deput: 'bond:deputShip', skillful: 'bond:skillfulShip',
  raid: 'bond:raidShip', raidAspd: 'bond:raidShip:aspd', empty: 'bond:emptyShip', emptyDmg: 'bond:emptyShip:dmg',
  solo: 'bond:soloShip', sunt: 'bond:suntShip', arcane: 'bond:arcaneShip',
});
/** Bonds whose battle values depend on layers (recomputed on in-battle gains). */
const LAYERED = new Set([ID.preci, ID.swift, ID.skillful, ID.arcane, ID.stead, ID.deput, ID.raid, ID.indom]);
const STEAD_CD = 'bond:steadShip:cd';
const AURA_JUDGE = 'bond:skillfulShip:judge'; // u.mem: { near, cross } judged on the receiver's deployment
const ARCANE_BY = 'bond:arcaneShip:by';  // target u.mem: member id → until when its own 奥术 instance lasts
const RAID_POLL = 0.25;
const RAID_SPAWN = 'bond:raidShip:spawn';  // u.mem: the [spawn] mark (any jump; kept until the member leaves the field)
const RAID_TRIG_KEY = 'bond:raidShip:trig'; // u.mem: the running AUTO-skill [trig] (token)

/**
 * PRD base chances C for a nominal chance p = i / 100 (battle_misc_table miscConfig.prdBaseProbs, 101 entries): client
 * code `Nodes.DicePRD.Execute` takes C = prdBaseProbs[RoundToInt(p × 100)] (past the end: the last), and
 * the N-th roll since the last success hits with N × C (`RandomExtensions.Dice`); the count N lives on the battle's global
 * blackboard under "prd#" + the node's key, so every unit rolling that key shares it.
 */
const PRD_BASE = Object.freeze([
  0, 0.00016, 0.00062, 0.00139, 0.00245, 0.0038, 0.00544, 0.00736, 0.00955, 0.01202, 0.01475, 0.01774, 0.02098, 0.02448,
  0.02823, 0.03222, 0.03645, 0.04092, 0.04562, 0.05055, 0.0557, 0.06108, 0.06668, 0.07249, 0.07851, 0.08474, 0.09118,
  0.09783, 0.10467, 0.11171, 0.11895, 0.12638, 0.134, 0.14181, 0.14981, 0.15798, 0.16633, 0.17491, 0.18362, 0.19249,
  0.20155, 0.21092, 0.22037, 0.2299, 0.23954, 0.24931, 0.25987, 0.27045, 0.28101, 0.29155, 0.3021, 0.31268, 0.32329,
  0.33412, 0.34737, 0.3604, 0.37322, 0.38584, 0.39828, 0.41054, 0.42265, 0.4346, 0.44642, 0.4581, 0.46967, 0.48113,
  0.49248, 0.50746, 0.52941, 0.55072, 0.57143, 0.59155, 0.61111, 0.63014, 0.64865, 0.66667, 0.68421, 0.7013, 0.71795,
  0.73418, 0.75, 0.76543, 0.78049, 0.79518, 0.80952, 0.82353, 0.83721, 0.85058, 0.86364, 0.8764, 0.88889, 0.9011,
  0.91304, 0.92473, 0.93617, 0.94737, 0.95833, 0.96907, 0.97959, 0.9899, 1,
]);
/** PRD base chance C of a nominal chance `p` (PRD_BASE). */
export const prdBase = (p) => (p > 0 ? PRD_BASE[Math.min(PRD_BASE.length - 1, Math.round(p * 100))] : 0);
/**
 * One DicePRD roll on `state` ({ n }: the shared count of failures since the last success): hit with (n + 1) × C.
 * A hit resets the count, a miss stores it.
 */
export function dicePRD(battle, state, p) {
  const c = prdBase(p);
  if (!(c > 0)) return false;
  const n = (state.n || 0) + 1;
  const hit = battle.rng() < n * c;
  state.n = hit ? 0 : n;
  return hit;
}

/** 奥术 vulnerability mods for a multiplier (battle.applyStrongest). */
const arcaneMods = (v) => ({ artsTakenMul: v });

/** `env_gbuff_new` blackboard of a bond (numbers only) of the scope's data (support dataFile; default: the default season's). */
export function bondBb(bondId, scope) {
  return buffParams(bondRecord(bondId, scope), 'env_gbuff_new') ?? {};
}
/** 迅捷 / 不屈 proc chance p = min(1, base_prob + prob_per_stack·L). */
export const procChance = (bb, L) => Math.max(0, Math.min(1, num(bb.base_prob) + num(bb.prob_per_stack) * L));
const prob = procChance;

// =====================================================================================================================
// per-player state

function makeState(battle, p) {
  const pid = p.playerId;
  const ops = playerOps(battle, pid);
  const st = { pid, ops, tiers: {}, bb: {}, members: {} };
  for (const id of Object.values(ID)) {
    const t = bondTier(battle, pid, id);
    if (t <= 0) continue;
    st.tiers[id] = t;
    st.bb[id] = bondBb(id, battle);
    st.members[id] = new Set(ops.filter((u) => isMember(battle, u, id)));
  }
  return st;
}
const L = (battle, st, id) => bondLayers(battle, st.pid, id);

// =====================================================================================================================
// match-long passives (re-applied on layer changes; passiveBuff replaces by key → idempotent)

function applyPassives(battle, st) {
  const t = st.tiers;
  if (t[ID.preci]) {
    const bb = st.bb[ID.preci];
    const wide = t[ID.preci] >= 2;
    const mods = directMods({ atk: num(bb.base_atk) + num(bb.atk_per_stack) * L(battle, st, ID.preci) });
    if (wide) { mods.defIgnorePct = num(bb.power_def_penetrate); mods.resIgnorePct = num(bb.power_magic_resist_penetrate); }
    for (const u of st.ops) {
      if (st.members[ID.preci].has(u) || (wide && u.def?.position === 'RANGED')) passiveBuff(battle, u, KEY.preci, mods);
    }
  }
  if (t[ID.stead]) {
    const bb = st.bb[ID.stead];
    const mods = directMods({ hp: num(bb.base_max_hp) + num(bb.max_hp_per_stack) * L(battle, st, ID.stead) });
    for (const u of st.ops) passiveBuff(battle, u, KEY.stead, mods);
  }
  if (t[ID.deput]) {
    const bb = st.bb[ID.deput];
    const mods = directMods({ def: num(bb.base_def) + num(bb.def_per_stack) * L(battle, st, ID.deput) }, { redeployMul: Math.max(0, 1 + num(bb.respawn_time)) });
    for (const u of st.ops) passiveBuff(battle, u, KEY.deput, mods);
  }
  if (t[ID.raid]) {
    const bb = st.bb[ID.raid];
    const lv = L(battle, st, ID.raid);
    const milestone = num(bb.power_bond_stack_cnt, Infinity);
    if (lv >= milestone) {
      const mods = { aspd: num(bb.power_attack_speed) };
      for (const u of st.ops) passiveBuff(battle, u, KEY.raidAspd, mods);
      if (!st.raidMilestone) { st.raidMilestone = true; for (const u of st.members[ID.raid]) if (onField(u)) { fxOn(battle, 'bondMilestone', u, KEY.raid, 'aspd'); break; } }
    }
    st.raidMods = raidMods(bb, lv);
    for (const u of st.members[ID.raid]) {
      const b = u.findBuff(KEY.raid);
      if (b) { b.mods = st.raidMods; u.markDirty(); }
    }
  }
  if (t[ID.arcane]) {
    const bb = st.bb[ID.arcane];
    const m = num(bb.base_damage_scale, 1) + num(bb.damage_scale_per_stack) * L(battle, st, ID.arcane);
    st.arcaneMul = Math.max(0, m);
    st.arcaneLowMul = Math.max(0, m * num(bb.power_weak_scale, 1));
  }
  if (t[ID.skillful]) {
    const bb = st.bb[ID.skillful];
    const lv = L(battle, st, ID.skillful);
    const v = num(bb.base_attack_speed) + num(bb.attack_speed_per_stack) * lv;
    if (!st.auraMods || st.auraMods.aspd !== v) st.auraMods = { aspd: v };
    st.auraWide = lv >= num(bb.power_bond_stack_cnt, Infinity);
  }
}

function raidMods(bb, lv) {
  const mods = directMods({
    atk: num(bb.base_atk) + num(bb.atk_per_stack) * lv,
    hp: num(bb.base_max_hp) + num(bb.max_hp_per_stack) * lv,
  });
  const aspd = num(bb.base_attack_speed) + num(bb.attack_speed_per_stack) * lv;
  if (aspd) mods.aspd = aspd;
  return mods;
}

/** Layer-independent passives (协防 / 独行 / 绝技), applied once. */
function applyStatic(battle, st) {
  const t = st.tiers;
  if (t[ID.empty]) {
    const bb = st.bb[ID.empty];
    const taken = Math.max(0, 1 - num(bb.damage_resistance));
    for (const u of st.ops) {
      passiveBuff(battle, u, KEY.empty, { physTakenMul: taken, artsTakenMul: taken });
      if (st.members[ID.empty].has(u)) {
        passiveBuff(battle, u, KEY.emptyDmg, { dmgDealtMul: num(isElite(u) ? bb.damage_scale_extra : bb.damage_scale_normal, 1) });
      }
    }
  }
  if (t[ID.solo]) {
    const bb = st.bb[ID.solo];
    const mods = directMods({ atk: num(bb.atk), hp: num(bb.max_hp) });
    for (const u of st.members[ID.solo]) passiveBuff(battle, u, KEY.solo, mods);
  }
  if (t[ID.sunt]) {
    const bb = st.bb[ID.sunt];
    const mods = directMods({ atk: num(bb.power_atk) });
    for (const u of st.ops) {
      if (!isElite(u)) continue;
      passiveBuff(battle, u, KEY.sunt, mods);
      if (t[ID.sunt] >= 2) suntSpCost(u, bb);
    }
  }
}

/**
 * 绝技 tier 2: the skill's SP cost becomes ceil(cost × sp_ratio) — client node ModifySpData (`_onlyUpdateSpCost`,
 * `_updateSpCostViaMaxRatioKey` sp_ratio): ceil of the float32 product, written into the character's skill data, so it
 * stays for the battle (once per unit here).
 */
function suntSpCost(u, bb) {
  const sk = u && u.skill;
  if (!sk || sk.noSkill || u.mem[KEY.sunt]) return;
  u.mem[KEY.sunt] = true;
  sk.baseSpCost = Math.ceil(Math.fround(Math.fround(sk.baseSpCost) * Math.fround(num(bb.sp_ratio, 1))));
  sk._normalize();   // re-establish SP / charges for the new cost (as the spCostMul setter does)
}

// =====================================================================================================================
// 灵巧 aura — client buff graph act1autochess_bond_eff_skillful. ON_BUFF_START (the receiver's deployment) judges ONCE:
// AutoChessFilterCharacterBondIds `_checkTargetInRangeId "x-4"` (the client: LitePhysicsUtil.FindTilesInBox
// around the receiver's tile, then the board piece on each tile, AutoChessBattleUtil.GetChessInstByPos, and its bonds) —
// no member piece on the 3×3 → the buff ends; else "x-5" (the cross, own tile included) sets in_normal_range.
// ON_BUFF_TRIGGER (live layers): ASPD when L ≥ power_bond_stack_cnt, else only when in_normal_range. The judgment is
// kept for the receiver's stay on the field: a member that leaves, falls or moves later changes nothing.

/** Board tile of a member's piece: where it stands, else where it waits (its body tile when down, else its home). */
function auraPieceTile(battle, m) {
  if (!m || m.removed) return null;
  if (m.alive && m.deployed) return [m.tileR, m.tileC];
  return battle.restTile(m);
}

/** Judge the receiver `u` on its deployment (u.mem[AURA_JUDGE] = { near, cross }) and apply the buff. */
function judgeAura(battle, st, u) {
  let near = false, cross = false;
  for (const m of st.members[ID.skillful]) {
    const t = auraPieceTile(battle, m);
    if (!t) continue;
    const dr = Math.abs(t[0] - u.tileR), dc = Math.abs(t[1] - u.tileC);
    if (dr > 1 || dc > 1) continue;
    near = true;
    if (dr + dc <= 1) { cross = true; break; }
  }
  u.mem[AURA_JUDGE] = { near, cross };
  applyAura(battle, st, u);
}

/** Add / refresh / remove the 灵巧 buff of `u` from its stored judgment and the live layers (st.auraMods / auraWide). */
function applyAura(battle, st, u) {
  const j = u.mem[AURA_JUDGE];
  const mods = st.auraMods;
  const on = !!(j && j.near && (st.auraWide || j.cross) && mods && onField(u));
  const b = u.findBuff(KEY.skillful);
  if (!on) { if (b) battle.removeBuff(u, KEY.skillful); return; }
  if (!b) battle.addBuff(u, { key: KEY.skillful, mods });
  else if (b.mods !== mods) { b.mods = mods; u.markDirty(); }
}

// =====================================================================================================================
// 突袭 relocation — the official buff graph act1autochess_bond_eff_raid (+ [attack] / [trig] / [skill] / [all]) and its
// node AutoChessRebuildCharacterOnTile (the client's `Nodes.AutoChessRebuildCharacterOnTile.Execute`).
//
// Four ways to jump, all the same landing (raidJump):
//   PASSIVE skill  — while the member carries no [spawn] mark (any jump sets it; a durable buff, so it survives the jump
//                    itself — kept here until the member leaves the field otherwise [ASSUMED: knocked out / withdrawn,
//                    the character's buffs go; community report of 2026-10-06 item 44: a revived passive member jumps
//                    at once]), whatever is in its range: one jump per deployment, as soon as a candidate enemy exists
//                    (缄默德克萨斯's ON_DEPLOY skills are PASSIVE in the client tables).
//   ready skill    — MANUAL or AUTO: the skill is ready (CheckCharSkillAvailable), not running (CheckCharSkillAffecting)
//                    and no enemy stands on the member's own tile or the tile in front of it (CheckHasEnemyInRange, range
//                    "1-1", _useAttackRange false: the client's `Nodes.CheckHasEnemyInRange.Execute` reads the
//                    blackboard / node range id, not the attack range, and counts every valid enemy whose body overlaps
//                    it). No [spawn] check: it jumps again whenever the enemy leaves that box. The AUTO skills too, by an
//                    official recording (maintainer decision 2026-10-19; until then MANUAL only): 瑕光 with S1 (AUTO,
//                    "下次攻击", two charges) waited, charged, until a landing tile freed, jumped with both charges kept,
//                    jumped again 0.7 s later — the enemy, unblockable after its blink, had walked off her front tile
//                    [ASSUMED: read from the recording] —, then attacked. The skill-start [trig] below stays.
//   AUTO skill     — on its skill start, when the member carries no [spawn] mark and blocks nothing (CheckBlocked): the
//                    derived [trig] jumps RAID_TRIG s later (triggerInterval 0.3, waitFirstTriggerInterval) and again
//                    every RAID_TRIG s while the skill runs (the retreat ends the skill, so once) [ASSUMED: the jump ends
//                    the skill as our retreat does].
//   no attack      — [attack]: no_attack_duration s without an attack ([attacked] is re-made on every ON_AFTER_ATTACK
//                    and when the buff is enabled) — no range or skill condition; the SP ratio is kept
//                    (AssignCurSpToBB → modify_sp[ratio]). The idle time starts again at the landing [ASSUMED: the
//                    [attacked] mark is re-made by the re-enable after the move].
// The three skill ways land with full SP ([spawn] = modify_sp[ratio] sp 1.0: the client's `Nodes.ModifySp.Execute`
// sets RoundToInt(maxSp × ratio)); a passive skill has none.

/** [trig] trigger interval (s) of the AUTO-skill jump. */
const RAID_TRIG = 0.3;
/** At most this many candidates (FilterUtil.Filter(cands, null, 128, HATRED_DES)). */
const RAID_MAX_TARGETS = 128;
/** Range "1-1" (range_table: grids (0,0), (0,1), direction RIGHT): the landing box and the "enemy in range" box. */
const RANGE_1_1 = Object.freeze([[0, 0], [0, 1]]);
const OPPOSITE_DIR = Object.freeze({ UP: 'DOWN', DOWN: 'UP', RIGHT: 'LEFT', LEFT: 'RIGHT' });

/** The member's official skill type: 'PASSIVE' | 'AUTO' | 'MANUAL' (def.skillType; our passive kits count as PASSIVE). */
function raidSkillType(sk) {
  if (!sk || sk.noSkill) return null;
  const t = String(sk.def?.skillType ?? '').toUpperCase();
  if (sk.kind === 'passive' || t === 'PASSIVE') return 'PASSIVE';
  return sk.manual ? 'MANUAL' : 'AUTO';
}

/**
 * A jump candidate: TargetOptions { ENEMY, WALK_ONLY, category NONE|DEFAULT, advanced options off } — the client's
 * `TargetOptions.VerifyTarget` returns from `_VerifyAdvanced` at once when `enableAdvancedOptions` is
 * false, so a 隐匿, asleep, untargetable or stunned ground enemy is one too (the template's STUNNED / SLEEPING flags
 * are never read); only the motion mask leaves flying enemies out. On the map: alive, deployed and shown.
 */
function raidCandidate(e) {
  return !!(e && e.alive && e.deployed && !e.hidden && !e.isFlying);
}

/**
 * The candidates in FilterUtil HATRED_DES order, at most RAID_MAX_TARGETS: the client's `Enemy.get_hatred`
 * = tauntLevel × a large constant − the remaining route — so the highest 嘲讽 level first, then the most
 * advanced (least remaining distance); the spawn order breaks ties [ASSUMED: FilterUtil's order among equal hatred].
 * Every enemy of the battle — a pair field's other half included —, no own-field preference.
 */
function raidTargets(battle) {
  const list = [];
  for (const e of battle.enemies) if (raidCandidate(e)) list.push(e);
  const key = new Map(list.map((e) => [e, { t: -(e.s.taunt || 0), d: num(battle.remainingDistance ? battle.remainingDistance(e) : 0) }]));
  list.sort((a, b) => key.get(a).t - key.get(b).t || key.get(a).d - key.get(b).d || (a.spawnSeq ?? a.id) - (b.spawnSeq ?? b.id));
  if (list.length > RAID_MAX_TARGETS) list.length = RAID_MAX_TARGETS;
  return list;
}

/**
 * Whether (r, c) is a battlefield tile of this battle (AutoChessBattleUtil.IsBattleField: the tile indexer's BATTLE_FIELD
 * set = every map tile but tile_achand, narrowed by the extra validator `AutoChessMapAreaManager.ResetTileIndexer`
 * sets per game state: BATTLE → the left (own) normal area; HELP_BATTLE → both normal halves when
 * several players help (isMultiPlayerHelp), else the own one; BOSS_BATTLE → the whole boss map). So: a boss / hidden-core
 * field opens both halves of rows 2–5 even for a lone player (never its hand / 临时整备区 rows 0–1, tile_achand); a 联防
 * field both halves with two helpers and the own half for one (Battle.onFieldBoard); a normal field its own board.
 */
function raidBattlefield(battle, r, c) {
  if (battle.kind === 'boss' || battle.kind === 'hidden') return battle.grid.inRect(r, c) && battle.grid.tile(r, c).key !== 'tile_achand';
  return battle.onFieldBoard(r, c);
}

/**
 * Landing tile [row, col] of member `u` next to enemy `e`, or null — the client's AutoChessRebuildCharacterOnTile: for
 * each tile of the enemy (its root tile; a huge enemy's body tiles), LitePhysicsUtil.FindTilesInBox("1-1", tile,
 * opposite of the member's direction) in the range's grid order — the enemy's own tile first, then the tile behind
 * it as seen from the member, so the enemy ends up on the member's own or front tile — and the first that passes
 * BuildCondition.CheckBuildable + Tile.CheckBuildable for the card (the battlefield, grid.canStand: its position's
 * buildable tiles, never the 深水区; free of another piece: Battle.isReservedTile — no living ally, no knocked-out
 * operator's body). No range check: a ranged member lands next to the enemy too. Enemies stand anywhere (a melee
 * member may land on the enemy's tile and block it).
 */
function raidTile(battle, u, e) {
  const back = OPPOSITE_DIR[normDir(u.dir)];
  const ranged = u.def?.position === 'RANGED';
  for (const k of bodyKeys(e)) {
    const br = Math.floor(k / COLS), bc = k - br * COLS;
    for (const [gr, gc] of RANGE_1_1) {
      const [dr, dc] = rotateOffset(gr, gc, back);
      const r = br + dr, c = bc + dc;
      if (!battle.grid.inRect(r, c) || !raidBattlefield(battle, r, c) || !battle.grid.canStand(r, c, { ranged }) || battle.isReservedTile(r, c)) continue;
      return [r, c];
    }
  }
  return null;
}

/**
 * An enemy on the member's own tile or the one in front of it (range "1-1" in its direction): any enemy on the map, by
 * the tile of its position — client CheckHasEnemyInRange → LitePhysicsUtil.CheckOverlapInBox → _CheckContainsPosition.
 */
function raidEnemyClose(battle, u) {
  const d = normDir(u.dir);
  const tiles = RANGE_1_1.map(([gr, gc]) => { const [dr, dc] = rotateOffset(gr, gc, d); return [u.tileR + dr, u.tileC + dc]; });
  for (const e of battle.enemies) {
    if (!e.alive || !e.deployed || e.hidden) continue;
    for (const [r, c] of tiles) if (bodyOnTile(e, r, c)) return true;
  }
  return false;
}

/**
 * One jump of member `u` (raidTargets → raidTile): the first candidate with a landing tile; none → nothing happens and
 * the next trigger looks again. `fullSp`: the skill ways ([spawn] sp 1.0); else the SP is kept. Returns true when it
 * jumped.
 */
function raidJump(battle, st, u, fullSp) {
  for (const e of raidTargets(battle)) {
    const tile = raidTile(battle, u, e);
    if (!tile) continue;
    const res = raidRedeploy(battle, u, tile[0], tile[1]);
    if (!res) return false;
    u.mem[KEY.raid] = battle.time; // with deployedAt: the idle time starts again from the landing
    u.mem[RAID_SPAWN] = true;
    if (fullSp && u.skill && !u.skill.noSkill) u.skill.setSpTotal(u.skill.maxCharges * u.skill.spCost);
    raidSkillBuff(battle, st, u);
    if (res === 'raid') fxOn(battle, 'blink', u, KEY.raid, 'relocate', { target: e.id });
    return true;
  }
  return false;
}

/**
 * raid[skill]: while a member's skill runs (CheckCharSkillAffecting), ATK / max HP +(base + per·L) (MULTIPLIER, our
 * additive percentages) and ASPD +(base_attack_speed + per·L), removed at the skill's end — every member, jumped or not.
 * A passive skill counts while it is on [ASSUMED: our engine keeps a passive on for the whole deployment; the client
 * reads Ability.isAffecting].
 */
function raidSkillBuff(battle, st, u) {
  const on = onField(u) && !!(u.skill && !u.skill.noSkill && u.skill.active);
  const b = u.findBuff(KEY.raid);
  if (on && !b) battle.addBuff(u, { key: KEY.raid, mods: st.raidMods });
  else if (!on && b) battle.removeBuff(u, KEY.raid);
}

function raidPoll(battle, st) {
  const idle = num(st.bb[ID.raid].no_attack_duration, 10);
  for (const u of st.members[ID.raid]) {
    if (!onField(u)) continue;
    raidSkillBuff(battle, st, u);
    const sk = u.skill;
    const type = raidSkillType(sk);
    if (type === 'PASSIVE' && !u.mem[RAID_SPAWN] && raidJump(battle, st, u, true)) continue;
    if ((type === 'MANUAL' || type === 'AUTO') && sk.ready && !sk.active && !raidEnemyClose(battle, u) && raidJump(battle, st, u, true)) continue;
    const since = Math.max(u.lastAttackAt ?? -Infinity, u.deployedAt ?? -Infinity, u.mem[KEY.raid] ?? -Infinity);
    if (battle.time - since >= idle - 1e-9) raidJump(battle, st, u, false);
  }
}

/** AUTO skill start → [trig]: a jump RAID_TRIG s later, again every RAID_TRIG s while that skill runs. */
function raidAutoTrig(battle, st, u) {
  if (raidSkillType(u.skill) !== 'AUTO' || u.mem[RAID_SPAWN] || (u.blocking && u.blocking.length)) return;
  const token = (u.mem[RAID_TRIG_KEY] = (u.mem[RAID_TRIG_KEY] ?? 0) + 1);
  const tick = () => {
    if (u.mem[RAID_TRIG_KEY] !== token || !onField(u) || !u.skill || !u.skill.active) return;
    if (!raidJump(battle, st, u, true)) battle.after(RAID_TRIG, tick);
  };
  battle.after(RAID_TRIG, tick);
}

/**
 * "保留技力立即再部署": retreat the unit and redeploy it for free on (r, c) with its SP / charges kept (engine redeploy
 * `tile` + `keepSp`: restored before the `deploy` handlers run; the board tile stays its home). Should the landing fail
 * (raidTile skips taken, reserved and body tiles, so only content refusing it), the unit goes straight back to its home
 * tile (never stranded off the field).
 * Returns 'raid' | 'home' | false.
 */
function raidRedeploy(battle, u, r, c) {
  battle.retreat(u, { reason: 'raid' });
  if (u.alive) return false;
  if (battle.redeploy(u, { free: true, tile: [r, c], keepSp: true })) return 'raid';
  return battle.redeploy(u, { free: true, keepSp: true }) ? 'home' : false;
}

// =====================================================================================================================
// install

export function install(battle) {
  if (!battle || !Array.isArray(battle.players) || !battle.players.length) return;
  const states = [];
  for (const p of battle.players) {
    const st = makeState(battle, p);
    if (Object.keys(st.tiers).length) states.push(st);
  }
  if (!states.length) return;
  const byPid = Object.create(null);
  for (const st of states) { byPid[st.pid] = st; applyPassives(battle, st); applyStatic(battle, st); }
  const has = (id, tier = 1) => states.some((st) => (st.tiers[id] ?? 0) >= tier);

  // live layers
  if (states.some((st) => Object.keys(st.tiers).some((id) => LAYERED.has(id)))) {
    battle.on('layerGain', (c) => {
      const st = byPid[c.playerId];
      if (!st || !st.tiers[c.bondId] || !LAYERED.has(c.bondId) || st.pending) return;
      st.pending = true;
      battle.after(0, () => {
        st.pending = false;
        applyPassives(battle, st);
        if (st.tiers[ID.skillful]) for (const u of battle.allies(st.pid)) if (u.kind === 'op' && u.mem[AURA_JUDGE]) applyAura(battle, st, u);
      });
    });
  }

  // 灵巧 aura: judged on every deployment of one of the player's operators (the initial ones included); a relocation
  // (`deploy` with move: true) keeps the judgment [추정: the client re-runs ON_BUFF_START only on a real (re)spawn]
  if (has(ID.skillful)) {
    battle.on('deploy', (c) => {
      const u = c.unit, st = u && byPid[u.ownerId];
      if (!st || !st.tiers[ID.skillful] || u.kind !== 'op' || c.move) return;
      judgeAura(battle, st, u);
    });
  }

  // 突袭
  if (has(ID.raid)) {
    const raid = states.filter((st) => st.tiers[ID.raid] && st.members[ID.raid].size);
    if (raid.length) {
      battle.every(RAID_POLL, () => { for (const st of raid) raidPoll(battle, st); });
      const member = (u) => { const st = u && byPid[u.ownerId]; return st && st.tiers[ID.raid] && st.members[ID.raid].has(u) ? st : null; };
      battle.on('skillStart', ({ unit: u }) => {
        const st = member(u);
        if (!st) return;
        raidSkillBuff(battle, st, u);
        raidAutoTrig(battle, st, u);
      });
      battle.on('skillEnd', ({ unit: u }) => {
        const st = member(u);
        if (!st) return;
        u.mem[RAID_TRIG_KEY] = (u.mem[RAID_TRIG_KEY] ?? 0) + 1; // FinishDerivedBuffById [trig]
        raidSkillBuff(battle, st, u);
      });
      // [spawn] is a durable buff: it survives the jump itself (MoveLikeRespawnSelf), not the member leaving the field
      battle.on('death', ({ unit: u, reason }) => {
        if (reason === 'raid' || !member(u)) return;
        delete u.mem[RAID_SPAWN];
        u.mem[RAID_TRIG_KEY] = (u.mem[RAID_TRIG_KEY] ?? 0) + 1;
      });
    }
  }

  // 迅捷
  if (has(ID.swift)) {
    battle.on('skillEnd', (c) => {
      const u = c.unit;
      if (!u || u.kind !== 'op' || c.reason === 'death' || !u.alive || !u.skill) return;
      const st = byPid[u.ownerId];
      if (!st || !st.tiers[ID.swift]) return;
      const bb = st.bb[ID.swift];
      const lv = L(battle, st, ID.swift);
      const p = prob(bb, lv);
      // one Dice for both lines (act1autochess_bond_eff_swift ON_SKILL_FINISH: Dice → member? +normal_sp → AlwaysNext →
      // L ≥ power_bond_stack_cnt? +power_sp)
      const member = st.members[ID.swift].has(u), power = lv >= num(bb.power_bond_stack_cnt, Infinity);
      if (!(member || power) || !(battle.rng() < p)) return;
      let gained = 0;
      // each line's ModifySp is followed by its own CreateEffect bond_charge_battle_01 on the operator (two on a member at
      // L ≥ power_bond_stack_cnt; the buff's source is no unit — display only)
      if (member) { gained += u.skill.gainSp(num(bb.normal_sp), 'bond'); tplFx(battle, u, 'bond_charge_battle_01', null); }
      if (power) { gained += u.skill.gainSp(num(bb.power_sp), 'bond'); tplFx(battle, u, 'bond_charge_battle_01', null); }
      if (gained > 0) fxOn(battle, 'sp', u, 'bond:swiftShip', 'proc', { n: gained });
    });
  }

  // 独行 (SP on every deploy). 绝技's SP cost skips summons: its AutoChessFilterChess passes a character whose card maps to
  // a board piece (AutoChessBattleUtil.GetInstIdByCardUid ≥ 0), and AutoChessDataIndexer.ConstructRunTimeIndexer fills
  // that map (runtimeCard2ChessDict) with operator cards only — token cards go to runtimeToken2CardDict (until
  // 2026-10-31 an elite's summons had the cost cut too)
  if (has(ID.solo)) {
    battle.on('deploy', (c) => {
      const u = c.unit;
      if (!u || u.kind !== 'op') return;
      const st = byPid[u.ownerId];
      if (!st) return;
      if (st.tiers[ID.solo] && st.members[ID.solo].has(u) && u.skill) {
        const n = num(st.bb[ID.solo].sp);
        if (n > 0) u.skill.gainSp(n, 'init');
      }
    });
  }

  // 不屈 (PRTS 卫戍协议：盟约 下半/PRTS盟约记录, its 修正: "地面干员被击倒、撤退、切换<替身>与<本体>时，有(18+0.4×层数)%概率立刻
  // 重新部署"; "※“立刻重新部署”的实现方式为：令受益者下次部署的再部署时间和费用归零"; owner's decision 2026-10-04 to follow it).
  // Rolls on a knock-out ('killed') and on a 撤退 ('retreat' — 史尔特尔's 余烬, 耀骑士临光 S2, 伊内丝 S3 … — and 行商's
  // 'merchant' withdrawal): a hit redeploys it at once, free, where it lies (engine rest tile, §22.15). Not on the 突袭
  // retreat ('raid': it redeploys at once and free anyway — the zeroed next deployment would change nothing [ASSUMED: no
  // roll]) nor on the 联防 forced exit (FORCED_EXIT: the battle's setup, not a 撤退 — §19.3). A 傀儡师 switch (hook
  // `dollSwap`, to the 替身 and back) rolls too; she stays on the field, so a hit only zeroes her NEXT deployment: the
  // next time she leaves the field (knocked out, withdrawn) she is back at once and free (`u.mem.indomFreeDeploy`)
  // [ASSUMED: one such deployment at a time, spent by her next deployment whatever brings it]. Tier 2 (+sp SP to every
  // operator on the field) stays a knock-out effect: its own line ("地面干员被击倒时使场上所有干员技力+5") was not corrected.
  // Both lines take a 地面干员 = a melee-position operator on any tile (support isGroundOp: 歌蕾蒂娅 on a 高台 counts, a
  // ranged operator on a melee tile does not — community report 「不屈盟约效果高台干员也错误的吃到了」, 0.1.3).
  if (has(ID.indom)) {
    const INDOM_EXITS = new Set(['killed', 'retreat', 'merchant']);
    // the official roll is DicePRD (act1autochess_bond_eff_indom[lowland], key "prd#act1autochess_bond_eff_indom[lowland]"
    // on the battle's global blackboard): one count for the whole battle — every player's ground operators share it
    const prd = { n: 0 };
    const stOf = (u) => { const st = isGroundOp(u) ? byPid[u.ownerId] : null; return st && st.tiers[ID.indom] ? st : null; };
    battle.on('death', (c) => {
      const u = c.unit;
      const banked = !!(u && u.mem && u.mem.indomFreeDeploy);
      if (!INDOM_EXITS.has(c.reason) || !(stOf(u) || (banked && u.kind === 'op'))) return;
      const st = stOf(u);
      const bb = st ? st.bb[ID.indom] : null;
      if (st && c.reason === 'killed' && st.tiers[ID.indom] >= 2) {
        const sp = num(bb.sp);
        if (sp > 0) for (const o of st.ops) if (onField(o) && o.skill) o.skill.gainSp(sp, 'bond');
      }
      if (u.alive || u.removed || u.mem[ID.indom] === battle.time) return;
      if (banked || (st && dicePRD(battle, prd, prob(bb, L(battle, st, ID.indom))))) {
        u.mem[ID.indom] = battle.time;
        if (battle.redeploy(u, { free: true })) fxOn(battle, 'revive', u, 'bond:indomShip', 'redeploy');
      }
    }, { priority: 10 });
    battle.on('dollSwap', ({ unit: u }) => {
      const st = stOf(u);
      if (!st || !u.alive || u.mem.indomFreeDeploy) return;
      if (dicePRD(battle, prd, prob(st.bb[ID.indom], L(battle, st, ID.indom)))) u.mem.indomFreeDeploy = true;
    });
    // the zeroed deployment is the next one, whatever brings it (this redeploy, the 阿戈尔 revive, the 突袭 jump …)
    battle.on('deploy', ({ unit: u }) => { if (u && u.mem && u.mem.indomFreeDeploy) u.mem.indomFreeDeploy = false; });
  }

  // 坚守 (tier 2) redirect + thorns, 奥术 vulnerability
  const stead = has(ID.stead, 2);
  const arcane = has(ID.arcane);
  if (stead) {
    battle.on('hit', (c) => {
      const t = c.target, dmg = c.dmg;
      // redirected damage (浊心斯卡蒂 S1 transfer) is not cut and re-shared again (see chess_char_6_04-skadi2.js)
      // (client: the moved part carries SharedFlag 7 SKIP_MODIFIER_EVENT — DamageSplit / AutoChessDamageSplit — so no
      // ON_TAKE_DAMAGE graph, 坚守's or 浊心斯卡蒂's, sees it again)
      if (!t || t.side !== 'ally' || t.kind !== 'op' || !dmg || dmg.cancel || dmg.steadShare || dmg.steadCut || dmg.type === 'element' || dmg.tags?.includes('transfer')) return;
      const st = byPid[t.ownerId];
      if (!st || (st.tiers[ID.stead] ?? 0) < 2 || st.members[ID.stead].has(t)) return;
      let any = false;
      for (const m of st.members[ID.stead]) if (onField(m)) { any = true; break; }
      if (!any) return;
      const ratio = Math.max(0, Math.min(1, num(st.bb[ID.stead].damage_resistance)));
      if (!(ratio > 0) || ratio >= 1) return;
      dmg.mul *= 1 - ratio;
      dmg.steadCut = ratio;
    }, { priority: -20 });
  }
  if (stead || arcane) {
    battle.on('damaged', (c) => {
      const t = c.target, dmg = c.dmg;
      if (!t || !dmg) return;
      if (t.side === 'ally') {
        if (!stead || t.kind !== 'op') return;
        const st = byPid[t.ownerId];
        if (!st || (st.tiers[ID.stead] ?? 0) < 2) return;
        if (dmg.steadCut) {
          const ratio = dmg.steadCut;
          dmg.steadCut = 0;
          const share = (num(c.amount) / (1 - ratio)) * ratio;
          if (!(share > 0)) return;
          const on = [];
          for (const m of st.members[ID.stead]) if (onField(m)) on.push(m);
          // the share is already mitigated and already carries the attacker's damage multipliers: deal it sourceless
          // (the member's own damage-taken modifiers and shields still apply), never re-scaled by the attacker
          for (const m of on) {
            const d = battle.makeDamage({ amount: share / on.length, type: 'true', canDodge: false, tags: ['bond:stead:share'] });
            d.steadShare = true;
            battle.dealDamage(null, m, d);
            // AutoChessDamageSplit creates its `_hitEffectKey` on each member it moves a share to (official client)
            tplFx(battle, m, 'bond_shield_buff_hit', t);
          }
          return;
        }
        // a 流失 never uses a thorn chance (PRTS 作战机制 "生命流失不会触发反伤"); 无来源 damage does, hitting nobody (备注
        // "可被无来源伤害消耗反伤机会")
        if (dmg.steadShare || dmg.steadThorn || c.type === 'element' || isHpLoss(dmg) || !st.members[ID.stead].has(t)) return;
        const bb = st.bb[ID.stead];
        const last = t.mem[STEAD_CD] ?? -Infinity;
        if (battle.time - last < num(bb.cd_duration) - 1e-9) return;
        t.mem[STEAD_CD] = battle.time;
        const src = c.source;
        if (!src || src.side !== 'enemy' || !src.alive) return;
        // "伤害来源受到(850+10×L)点法术伤害": 无来源 (no attacker multipliers, hooks see no source) but credited to the
        // member hit — its player's stats and shared-pool tally count it, like an element burst (v2.5: no credit at all,
        // up to 19 % of a co-op leader's pool and 88 % of a solo one went unattributed, DESIGN §20.10)
        // the 脆弱 first, then the damage (act1autochess_bond_eff_stead[ex] ON_TAKE_DAMAGE: [cd] → CreateBuffById weak[limit]
        // → FixedValueDamage), so the thorn itself already takes the 脆弱; `fxTag` names that client buff (its own
        // effect buff_weak[limit] over the head, render/fxstatus.js HINT_FX)
        battle.applyStatus(src, 'fragile', { duration: num(bb['weak[limit]'], 5), value: num(bb.damage_scale, 1) - 1, source: t, fxTag: 'weak[limit]' });
        const d = battle.makeDamage({ amount: num(bb.base_damage_value) + num(bb.damage_value_per_stack) * L(battle, st, ID.stead), type: 'arts', canDodge: false, sourceless: true });
        d.steadThorn = true;
        battle.dealDamage(t, src, d);
        return;
      }
      if (!arcane || c.type !== 'arts' || t.side !== 'enemy' || !t.alive) return;
      const src = c.source;
      if (!src || src.kind !== 'op') return;
      const st = byPid[src.ownerId];
      if (!st || !st.tiers[ID.arcane] || !st.members[ID.arcane].has(src)) return;
      const bb = st.bb[ID.arcane];
      const by = t.mem[ARCANE_BY] || (t.mem[ARCANE_BY] = {});
      if (battle.time < num(by[src.id], -Infinity) - 1e-9) return;   // its own instance still lasts: no re-apply
      const dur = num(bb.weak_duration, 3);
      by[src.id] = battle.time + dur;
      const low = st.tiers[ID.arcane] >= 2 && t.hpRatio <= num(bb.hp_ratio) + 1e-9;
      // one 奥术 instance per target, the strongest (both players of a pair field included): see the header
      battle.applyStrongest(t, KEY.arcane, { duration: dur, value: low ? st.arcaneLowMul : st.arcaneMul, mods: arcaneMods, source: src });
    });
  }
}
