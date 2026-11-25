// server/sim/content/bands/battle.js — battle side of the strategies (bands, data/bands.json; research 01 §11).
//
// Each player of a battle installs the IN_BATTLE parts of its own band, dispatched on the band buff's bbStr.key
// (numbers from the blackboard, never hard-coded). Band buffs apply in every battle kind (normal / 联防 / boss /
// hidden); IN_BATTLE layer gains are no-ops where the match disables them (support.gainLayers).
//
//   act1autochess_band2_buff  阿米娅 众志合一   ≥ value_i active bonds (highest i) ⇒ every operator ATK +atk_i,
//                                               HP +max_hp_i (直接乘算 — support directMods —, bonds snapshot at combat start)
//   act1autochess_band28_buff 埃芒加德 命结之秘 the first max_respawn_cnt operator knock-downs of the battle revive at
//                                               once — PRTS 备注 "“复活”的实现方式为：受益者因移动之外的原因退场时下次部署
//                                               的再部署时间和费用归零": the knock-out stands (被击倒时 effects run) and the
//                                               operator redeploys at once, free, where it lies (部署时 effects run, SP
//                                               reset): items reviveNow, a `death` hook after M3茧甲's and before 阿戈尔
//                                               5 / 不屈 (in place until 0.2.0, community report 「…砾和瑕光这种死亡和部
//                                               署的叠层效果，如果有艾芒加德的3次复活似乎是无法触发」)
//   act1autochess_band13_buff 克莱门莎 崇高牺牲 a <bond_id> operator knocked down ⇒ +its tier (等阶) <bond_id> layers
//                                               (bond_add_type by_charlevel) — only while <bond_id> is active, and a 调和
//                                               member counts (client buff template act1autochess_band13_buff ON_OWNER_KILLED:
//                                               AutoChessFilterCharacterBondIds _considerManiShip → AutoChessTriggerGarrisonAbility
//                                               → the client's ScenePlayerData.AddBondCount: no layers for an
//                                               inactive bond; until 2026-10-11 requireActive false and own bonds only)
//   act1autochess_band16_buff 大帝 加急调派     "每次部署后再部署时间减少50%": every deployment of an operator stacks one
//                                               redeploy ×(1 + respawn_time) for the rest of the battle, with no cap (PRTS
//                                               卫戍协议：盟约 下半 / PRTS盟约记录 备注 "※该策略效果可无限叠加"; a 20-stack cap
//                                               until 0.2.2 — GitHub #328, PR #329)
//   act1autochess_band17_buff 桑葚 药枚实验     at combat start the player's units on the front-most (最右边) column: each
//                                               attack has `prob` to gain 1 shield layer (max 1); a later deployment
//                                               judges again 0.1 s after it (keeps it if none of the player's units
//                                               stands further right, and takes it from those left of it)
//   act1autochess_band18_buff 休谟斯 回收利用   a ground (地面) operator's skill ends ⇒ a random operator on its 4
//                                               neighbouring tiles gains `sp` SP
//   act1autochess_band15_buff 卡莱莎 食腐之蝶   an operator knocked down ⇒ every other unit of the player on the field
//                                               ATK +atk × n, n ≤ max_stack_cnt (+20 % … +200 %, additive stacks),
//                                               until that unit is knocked down itself or the battle ends
//   act1autochess_band19_buff 陈 以己之长       the player's operators' physical / arts damage becomes 弱点伤害
//   act2autochess_band12_buff 夕 墨色真颜       at combat start operators of which ≥ 2 of the same name (same base chess,
//                                               elite or not) stand on the field get ATK +atk
//   act2autochess_band3_buff  伊奥莱塔 统御号令 at combat start n = elite operators on the field ⇒ every elite operator
//                                               ATK +atk_per_cnt × n, HP +max_hp_per_cnt × n (all 直接乘算)
//   attr_common_global_buff   陈 以己之长 (规程) the second buff: elite operators (filter_autochess_golden) ATK +atk
//                                               (直接乘算), ASPD +attack_speed
//   auto_chess_change_map    Touch 外勤医疗    "所有玩家场地上出现一名<预备干员-医疗>": while any alive player of the match
//                                               holds band_amedic, every player's field gets the map character of the
//                                               variant whose common_condition holds for that player's elites on the field
//                                               (condition_golden_chess_le cnt → 预备干员-医疗, _ge cnt → Touch), spawned at
//                                               combat start on its stage slot (tokens.spawnMapChar)
// Prep-only bands (economy / shop / grants / layers at prep end or round start) live in bands/meta.js.

import {
  num, buffsOf, bandRecord, isOp, onField, isElite, tierOf, isMember, activeBondIds, playerOps, passiveBuff, fxOn, tplFx,
  matchBands, gainLayers, alliesAround, N4, baseChessId, isGroundOp, directMods, effectRecord, battleStore, tileKey,
} from '../support/index.js';
import { COLS } from '../../constants.js';
import { weaknessRetype, addShieldLayer, PRIO_RESPAWN, reviveNow } from '../items/battle.js';
import { addCapMod } from '../garrisons/effects/triggered.js';
import { spawnMapChar } from '../tokens.js';

/** @import { Battle } from '../../Battle.js' */
/** @import { Unit } from '../../units.js' */
/** @import { DataScope, DeployEv, DeathEv, SkillEv, HitEv, DamagedEv, AttackEv } from '../support/index.js' */
/** @import { BuffRec } from '../bonds/shared.js' */
/** @import { BattlePlayer } from '../../battle/players.js' */
/**
 * A player of the battle (battle/players.js _addPlayer) with the fields of its battle input the bands read
 * (PlayerBattleInput: `bandStage`, `bandCommand`, `bandMarks`, `bandChests`, `reserve` …).
 * @typedef {BattlePlayer & { input: Record<string, unknown> }} BandPlayer
 * A band buff behaviour (BY_KEY), a mark's on its operator (MARK_BY_KEY) and a tile mark's (TILE_MARK_BY_KEY); `p` the
 * buff's params `{ ...bb, ...bbStr }`.
 * @typedef {(battle: Battle, ps: BandPlayer, p: Record<string, unknown>, bandId: string) => void} BandFn
 * @typedef {(battle: Battle, ps: BandPlayer, u: Unit, p: Record<string, unknown>, key: string) => void} MarkFn
 * @typedef {(battle: Battle, ps: BandPlayer, tile: number[], p: Record<string, unknown>) => void} TileMarkFn
 * A mark of the battle input (`bandMarks`: `{ effectId, uid | itemId, capAdd?, gone? }`, a tile mark `{ effectId, row, col }`).
 * @typedef {{ effectId: string, uid?: number, gone?: true, itemId?: string, capAdd?: number, row?: number, col?: number, [field: string]: unknown }} BandMark
 * A map-character variant of band_amedic (amedicVariants).
 * @typedef {{ cond: string, cnt: number, chars: string[] }} AmedicVariant
 */

export const AMEDIC_BAND = 'band_amedic';
/** The common_condition values of band_amedic's auto_chess_change_map (amedicCharsFor); any other places nobody. */
export const AMEDIC_CONDS = Object.freeze(['condition_golden_chess_ge', 'condition_golden_chess_le']);
/** The bond_add_type values 崇高牺牲 (act1autochess_band13_buff) reads; any other gains nothing. */
export const BAND13_ADD_TYPES = Object.freeze(['by_charlevel', 'by_count']);

/**
 * 'death' priority of 埃芒加德's revive: a knock-out (so after every `fatal` saver — kits', 坚固维式重锤's 不死), after the
 * operator's own M3茧甲 (PRIO_RESPAWN 13), before 阿戈尔 5's first-knock-out revive (11) and 不屈 (10).
 */
export const PRIO_BAND_REVIVE = PRIO_RESPAWN - 1;

const keyOf = (/** @type {string} */ bandId, part = '') => `band:${bandId}${part ? `:${part}` : ''}`;
const deployedOps = (/** @type {Battle} */ battle, /** @type {string} */ pid) => playerOps(battle, pid, { fieldOnly: true });

// ---------------------------------------------------------------------------------------------------------------
// band buff behaviours: (battle, ps, params, bandId)

/** @type {Record<string, BandFn>} */
const BY_KEY = {
  // 阿米娅 众志合一
  act1autochess_band2_buff(battle, ps, p, bandId) {
    const n = activeBondIds(battle, ps.playerId).length;
    let atk = 0, hp = 0;
    for (let i = 1; i <= 9 && p[`value_${i}`] != null; i++) {
      if (n >= num(p[`value_${i}`], Infinity)) { atk = num(p[`atk_${i}`]); hp = num(p[`max_hp_${i}`]); }
    }
    if (!(atk > 0 || hp > 0)) return;
    const mods = directMods({ atk, hp });
    for (const u of playerOps(battle, ps.playerId)) passiveBuff(battle, u, keyOf(bandId), mods);
  },

  // 埃芒加德 命结之秘
  act1autochess_band28_buff(battle, ps, p, bandId) {
    const max = Math.floor(num(p.max_respawn_cnt, 3));
    if (!(max > 0)) return;
    let used = 0;
    battle.on('death', (/** @type {DeathEv} */ c) => {
      const u = c.unit;
      if (used >= max || !isOp(u) || u.ownerId !== ps.playerId || !reviveNow(battle, c, 'band')) return;
      used++;
      fxOn(battle, 'revive', u, keyOf(bandId), bandId, { left: max - used });
      tplFx(battle, u, 'map_act1autochess_reinforce_02', u); // client buff template act1autochess_band28_buff ON_OWNER_FINISH
    }, { priority: PRIO_BAND_REVIVE });
  },

  // 克莱门莎 崇高牺牲
  act1autochess_band13_buff(battle, ps, p, bandId) {
    const bond = typeof p.bond_id === 'string' && p.bond_id ? p.bond_id : null;
    if (!bond) return;
    const t = p.bond_add_type;
    const byLevel = t == null || t === '' || t === 'by_charlevel';
    if (!byLevel && !(typeof t === 'string' && BAND13_ADD_TYPES.includes(t))) return; // a type this does not read gains nothing (content/coverage.js)
    battle.on('death', (/** @type {DeathEv} */ c) => {
      const u = c.unit;
      if (c.reason !== 'killed' || !isOp(u) || u.ownerId !== ps.playerId || !isMember(battle, u, bond)) return;
      const n = byLevel ? tierOf(u) : Math.max(1, Math.floor(num(p.value, 1)));
      if (gainLayers(battle, { playerId: ps.playerId, bonds: bond, n, requireActive: true, source: u, reason: 'band' }) > 0) {
        fxOn(battle, 'layer', u, keyOf(bandId), bandId, { bond, n });
      }
    });
  },

  // 大帝 加急调派
  act1autochess_band16_buff(battle, ps, p, bandId) {
    const mul = Math.max(0, 1 + num(p.respawn_time, 0));
    if (mul === 1) return;
    const key = keyOf(bandId);
    battle.on('deploy', (/** @type {DeployEv} */ c) => {
      const u = c.unit;
      if (!isOp(u) || u.ownerId !== ps.playerId) return;
      battle.addBuff(u, { key, mods: { redeployMul: mul }, refresh: 'stack', stacks: 1, maxStacks: Infinity, persist: true, allowDead: true });
    });
  },

  // 桑葚 药枚实验
  act1autochess_band17_buff(battle, ps, p, bandId) {
    const pr = num(p.prob);
    if (!(pr > 0)) return;
    const key = keyOf(bandId, 'shield');
    /** @type {Set<Unit>} */
    const chosen = new Set();
    // "最右边的所有我方单位": the highest raw field column (a board position, whatever the units' directions), on the
    // mirrored Final Assault right side too — the client compares grid columns (AssignGridPositionToBlackboard;
    // maintainer decision 2026-10-11, second answer: follow the client). Until then the mirrored side counted from the
    // field's left (`ps.mirror ? -u.tileC : u.tileC`), docs/rules/sim.md 「桑葚」
    const boardCol = (/** @type {Unit} */ u) => u.tileC;
    let begun = false;
    battle.on('battleStart', () => {
      begun = true;
      const units = battle.allies(ps.playerId);
      let front = -Infinity;
      for (const u of units) front = Math.max(front, boardCol(u));
      for (const u of units) if (boardCol(u) === front) chosen.add(u);
    });
    // a deployment after the battle start (a redeploy, a jump, a summon) runs its own check (client buff template
    // act1autochess_band17_buff: ON_BUFF_START gives the unit [core] and [self], which 0.1 s later puts [check] on every
    // unit of the same player side — whichever of the two stands further left loses its [core]): it keeps [core] only
    // if no unit of the player stands further right, and takes it from every unit left of it
    battle.on('deploy', (/** @type {DeployEv} */ c) => {
      const u = c.unit;
      if (!begun || !u || u.ownerId !== ps.playerId || u.side === 'enemy' || u.kind === 'device') return;
      chosen.add(u);
      const seq = u.deploySeq;
      battle.after(0.1, () => {
        if (!u.alive || !u.deployed || u.deploySeq !== seq) return;
        const me = boardCol(u);
        for (const a of battle.allies(ps.playerId)) {
          if (a === u) continue;
          const col = boardCol(a);
          if (col > me) chosen.delete(u);
          else if (col < me) chosen.delete(a);
        }
      }, { owner: u });
    });
    battle.on('attack', (/** @type {AttackEv} */ c) => {
      const u = c.attacker;
      if (!chosen.has(u) || !u.alive) return;
      if (!(pr >= 1 || battle.rng() < pr)) return;
      if (addShieldLayer(battle, u, key, 1)) fxOn(battle, 'shield', u, keyOf(bandId), bandId);
    });
  },

  // 休谟斯 回收利用 ("地面干员技能结束时…": a melee-position operator on any tile — support isGroundOp)
  act1autochess_band18_buff(battle, ps, p, bandId) {
    const sp = num(p.sp);
    if (!(sp > 0)) return;
    battle.on('skillEnd', (/** @type {SkillEv} */ c) => {
      const u = c.unit;
      if (!isOp(u) || u.ownerId !== ps.playerId || c.reason === 'death' || !onField(u) || !isGroundOp(u)) return;
      const cands = alliesAround(battle, u, N4).filter((a) => a.kind === 'op' && a.skill && !a.skill.noSkill && a.skill.kind !== 'passive');
      const t = cands.length ? battle.rng.pick(cands) : null;
      if (!t) return;
      /** @type {NonNullable<Unit['skill']>} */ (t.skill).gainSp(sp, 'band'); // cands have a skill
      fxOn(battle, 'spGain', t, keyOf(bandId), bandId, { n: sp, from: u.id });
    });
  },

  // 卡莱莎 食腐之蝶
  act1autochess_band15_buff(battle, ps, p, bandId) {
    const step = num(p.atk);
    const cap = Math.max(1, Math.floor(num(p.max_stack_cnt, 10)));
    if (!(step > 0)) return;
    const key = keyOf(bandId);
    battle.on('death', (/** @type {DeathEv} */ c) => {
      const d = c.unit;
      if (c.reason !== 'killed' || !isOp(d) || d.ownerId !== ps.playerId) return;
      for (const a of battle.allies(ps.playerId)) {
        if (a === d) continue;
        const cur = /** @type {BuffRec | null} */ (a.findBuff(key));
        const n = Math.min(cap, (cur && cur.data ? cur.data.n : 0) + 1);
        battle.addBuff(a, { key, mods: directMods({ atk: step * n }), refresh: 'replace', data: { n }, visible: true });
      }
    });
  },

  // 陈 以己之长
  act1autochess_band19_buff(battle, ps) {
    battle.on('hit', (/** @type {HitEv} */ c) => {
      const s = c.source;
      if (!isOp(s) || s.ownerId !== ps.playerId || !c.target || c.target.side !== 'enemy') return;
      weaknessRetype(c.dmg, s, c.target);
    }, { priority: 5 });
  },

  // 夕 墨色真颜
  act2autochess_band12_buff(battle, ps, p, bandId) {
    const atk = num(p.atk);
    if (!atk) return;
    battle.on('battleStart', () => {
      /** @type {Map<string, Unit[]>} */
      const groups = new Map();
      for (const u of deployedOps(battle, ps.playerId)) {
        const b = baseChessId(u);
        if (!groups.has(b)) groups.set(b, []);
        /** @type {Unit[]} */ (groups.get(b)).push(u);
      }
      for (const list of groups.values()) {
        if (list.length < 2) continue;
        for (const u of list) passiveBuff(battle, u, keyOf(bandId), directMods({ atk }));
      }
    });
  },

  // 伊奥莱塔 统御号令
  act2autochess_band3_buff(battle, ps, p, bandId) {
    const a = num(p.atk_per_cnt), h = num(p.max_hp_per_cnt);
    if (!(a > 0 || h > 0)) return;
    battle.on('battleStart', () => {
      const elites = deployedOps(battle, ps.playerId).filter(isElite);
      const n = elites.length;
      if (!n) return;
      const mods = directMods({ atk: a * n, hp: h * n });
      for (const u of elites) passiveBuff(battle, u, keyOf(bandId), mods);
    });
  },

  // 陈 以己之长 (规程's second buff): "精锐干员额外获得攻击力+16%，攻击速度+16" — the player's elite operators
  // (filter_autochess_golden) ATK +atk (直接乘算) and ASPD +attack_speed for the whole battle
  attr_common_global_buff(battle, ps, p, bandId) {
    const mods = directMods({ atk: num(p.atk), hp: num(p.max_hp) });
    if (num(p.attack_speed)) mods.aspd = num(p.attack_speed);
    if (!Object.keys(mods).length) return;
    const elitesOnly = num(p.filter_autochess_golden) > 0;
    for (const u of playerOps(battle, ps.playerId)) if (!elitesOnly || isElite(u)) passiveBuff(battle, u, keyOf(bandId, 'attr'), mods);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Touch 外勤医疗 (auto_chess_change_map, every player's field)

/**
 * Map-character variants of band_amedic: [{ cond, cnt, chars: [tokenId…] }] (the scope's data, support dataFile).
 * @param {DataScope} [scope]
 */
export function amedicVariants(scope = null) {
  /** @type {AmedicVariant[]} */
  const out = [];
  for (const b of buffsOf(bandRecord(AMEDIC_BAND, scope))) {
    if (b.key !== 'auto_chess_change_map') continue;
    /** @type {Set<string>} */
    const chars = new Set();
    for (const [k, v] of Object.entries(b.p)) if (k.includes('#') && num(v) > 0) chars.add(k.split('#')[0]);
    out.push({ cond: String(b.p.common_condition || ''), cnt: num(b.p.cnt, 0), chars: [...chars] });
  }
  return out;
}

/** Map characters for a player with `elites` elite operators on the field. @param {number} elites @param {AmedicVariant[]} [variants] */
export function amedicCharsFor(elites, variants = amedicVariants()) {
  for (const v of variants) {
    const ok = v.cond === 'condition_golden_chess_ge' ? elites >= v.cnt : v.cond === 'condition_golden_chess_le' ? elites <= v.cnt : false;
    if (ok) return v.chars;
  }
  return [];
}

/** @param {Battle} battle */
function installMapChars(battle) {
  const variants = amedicVariants(battle);
  if (!variants.length) return;
  const holders = battle.players.filter((ps) => matchBands(battle, ps.playerId).includes(AMEDIC_BAND));
  if (!holders.length) return;
  battle.on('battleStart', () => {
    for (const ps of holders) {
      const elites = deployedOps(battle, ps.playerId).filter(isElite).length;
      for (const id of amedicCharsFor(elites, variants)) {
        // The map character stands on the field in preparation (client AutoChessBattleDataModel.PrepareForPrepareState
        // applies auto_chess_change_map with no pieces counted: always 预备干员-医疗); Touch replaces it here once the
        // elite count is known, keeping the predefine's early aggro rank (Battle.spawnToken preBattleAggro; upstream PR #451).
        const u = spawnMapChar(battle, ps.playerId, id, { preBattle: true });
        if (u) fxOn(battle, 'summon', u, keyOf(AMEDIC_BAND), AMEDIC_BAND);
      }
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------

/** Band buff keys with a battle part (tests / tooling). */
export const BATTLE_BUFF_KEYS = Object.freeze([...Object.keys(BY_KEY), 'auto_chess_change_map']);

/** Does this band have a battle part? (the scope's data, support dataFile) @param {unknown} bandId @param {DataScope} [scope] */
export function hasBattlePart(bandId, scope = null) {
  return buffsOf(bandRecord(bandId, scope)).some((b) => (b.bbKey && BY_KEY[b.bbKey]) || b.key === 'auto_chess_change_map');
}

/**
 * The strategy's buffs in this battle: those of the stage the player reached (PlayerBattleInput `bandStage`, 规程's
 * 指令 stages — bands/meta.js bandStageIndex), else the record's own (one stage).
 * @param {Parameters<typeof buffsOf>[0]} band @param {unknown} stage
 */
export function bandBattleBuffs(band, stage) {
  if (!band) return [];
  const stages = Array.isArray(band.skills) && band.skills.length ? band.skills : null;
  if (!stages) return buffsOf(band);
  const i = Math.max(0, Math.min(stages.length - 1, Math.trunc(num(stage, 0)) || 0));
  return buffsOf(stages[i]);
}

/** @param {Battle} battle */
export function install(battle) {
  for (const ps of battle.players) {
    // the own strategy, then a 指令 taken from another one (更换指令: PlayerBattleInput `bandCommand` / `bandCommandStage`,
    // server/match/player/round.js) — a passive 指令 brings its battle buffs (阿米娅, 陈…); the taken 指令 is never the
    // own strategy (match/bandSkill.js setBandCommand)
    const held = [[ps.bandId, ps.input?.bandStage], [ps.input?.bandCommand, ps.input?.bandCommandStage]];
    for (const [bandId, stage] of held) {
      const band = typeof bandId === 'string' && bandId ? bandRecord(bandId, battle) : null;
      if (!band) continue;
      for (const b of bandBattleBuffs(band, stage)) {
        const f = b.bbKey ? BY_KEY[b.bbKey] : null;
        if (!f) continue;
        try { f(battle, ps, b.p, bandId); } catch (e) { battle._handlerError?.(`band:${bandId}`, null, e); }
      }
    }
  }
  installMapChars(battle);
  installMarks(battle);
}

// ---------------------------------------------------------------------------------------------------------------
// 规程's marks (bands/meta.js addMark): the drag 指令 whose effect waits for the next battle. The battle input carries the
// round's marks (PlayerBattleInput `bandMarks`: [{ effectId, uid | itemId, capAdd? }], server/match/player/round.js);
// the input already applied what changes the fielded units (全场聚焦: the operator as its elite; 电气化！: the item on every
// operator with a free slot — markInputNeeds). The rest runs here on the marked operator, by the buff of the mark's
// effect (its bbStr.key, the client's buff template of 规程's table):
//
//   act3autochess_band12_buff 意志鼓舞 「下次战斗开始时立即击倒并复活，并获得额外2次复活次数」: ON_AUTO_CHESS_MODE_CHANGED with
//                             start_dead → [kill]: the operator is knocked out at combat start and rebuilt on its tile at
//                             once (reborn_mask 1: that knock-out uses no revive — ours: no reviveNow takes it, its 被击倒时
//                             effects run, and it comes back after every other `death` handler: 部署时 effects run, SP
//                             reset); then, like 埃芒加德's band28 template, its next max_respawn_cnt knock-outs revive at
//                             once, free, where it lies (reviveNow) — counted per operator (band12_buff_respawn_cnt).
//   act1autochess_band17_buff 药枚实验 the 桑葚 template on the marked operator alone: [self] puts [check] on the player's
//                             units 0.1 s into the battle and the marked one keeps [core] only while none of them stands in
//                             a column further right — so the shield chance (prob: 20 % / 35 % by the stage) works on the
//                             front-most column only, as the passive 桑葚 band; a later (re)deployment of the operator
//                             judges again.
//   act3autochess_band22_buff 消解空间 「首次受到伤害时使其击倒，并召唤整备区最右侧干员」: ON_TAKE_DAMAGE —
//                             AutoChessCheckSwitchWithHand (RIGHT, ORIGINAL, no class or bond filter: nothing without a
//                             hand operator, and the next damage checks again), reborn_mask −1 (no revive), the switch,
//                             InstantKill (credited to the operator itself: a self knock-out — CN play): the
//                             rightmost 整备区 operator comes in on its tile, facing its way, and the
//                             operator leaves without a body (as the switch 特质, garrisons/effects/switch.js). The hand
//                             operators reach the battle in the input's `reserve`.
//   capAdd                    正直教官: + capAdd on the operator's 特质 caps (garrisons/effects/triggered.js addCapMod).
// [ASSUMED·CN: the buff of a mark lands on the marked operator (skill_target_chess — the classes are CN-only); a revive or
// switch of another rule that the client's reborn_mask would not stop is stopped here too (c.revivedBy); the start
// knock-out counts as a knock-out for 被击倒时 effects and the results.]

export const MARK_UPGRADE = 'auto_chess_battle_chess_upgrade';
export const MARK_GIVE_ALL = 'auto_chess_battle_give_all_equip';
const MARK_SWAP = 'act3autochess_band22_buff';
/** death priorities: the mark's knock-outs take no revive (before every revive), its rebuild / switch come last. */
const PRIO_MARK_LOCK = 1000;
const PRIO_MARK_LAST = -2000;

/**
 * The mark buffs that, when their marked operator is gone before the battle (sold, merged away — no piece of the player
 * has its uid), land on every operator the player fields at combat start instead of on nobody. The official 消解空间
 * does this (CN play, maintainer report 2026-11-25: marked on the field or in the 整备区, then sold — every fielded
 * operator falls on its first damage, a self knock-out as on the marked one), a bug the maintainer chose to follow while
 * the official game keeps it (maintainer decision 2026-11-25). The official fix is one deletion here: without the key
 * the gone mark gives nothing again, as every other mark (round.js bandMarksNow, installMarks).
 * [ASSUMED·CN: a gone operator other than a sold one (merged away, removed by another 指令) does the same; the
 * operators a switch brings in later do not take it; with several fielded, each knock-out calls the next rightmost
 * 整备区 operator, as the marked one's would — the video showed only 不屈 rebuilds]
 */
export const MARK_SPREADS_WHEN_GONE = new Set([MARK_SWAP]);

/** Does this mark's effect spread to the fielded operators when its operator is gone (MARK_SPREADS_WHEN_GONE)? @param {Parameters<typeof buffsOf>[0]} eff */
export function markSpreadsWhenGone(eff) {
  return buffsOf(eff).some((b) => b.bbKey != null && MARK_SPREADS_WHEN_GONE.has(b.bbKey));
}

/**
 * What a mark's effect record asks of the battle input: { upgrade, giveItem, hand } (server/match/player/round.js).
 * @param {Parameters<typeof buffsOf>[0]} eff
 */
export function markInputNeeds(eff) {
  const out = { upgrade: false, giveItem: false, hand: false };
  for (const b of buffsOf(eff)) {
    if (b.key === MARK_UPGRADE) out.upgrade = true;
    else if (b.key === MARK_GIVE_ALL) out.giveItem = true;
    else if (b.bbKey === MARK_SWAP) out.hand = true;
  }
  return out;
}

const marksOf = (/** @type {BandPlayer} */ ps) => (Array.isArray(ps.input?.bandMarks) ? ps.input.bandMarks.filter((/** @type {unknown} */ m) => m && typeof m === 'object') : []);
const markedUnit = (/** @type {Battle} */ battle, /** @type {BandPlayer} */ ps, /** @type {unknown} */ uid) => battle.allyUnits.find((u) => isOp(u) && u.ownerId === ps.playerId && !u.reserve && u.uid === uid) ?? null;

/**
 * No revive takes `u`'s knock-out while `lock()` holds (the client's reborn_mask ≠ 0).
 * @param {Battle} battle @param {Unit} u @param {() => boolean} lock
 */
function lockRevive(battle, u, lock) {
  battle.on('death', (/** @type {DeathEv} */ c) => { if (c.unit === u && lock()) c.revivedBy = c.revivedBy || 'band:mark'; }, { priority: PRIO_MARK_LOCK });
}

/** @type {Record<string, MarkFn>} */
const MARK_BY_KEY = {
  act3autochess_band12_buff(battle, ps, u, p, key) {
    const max = Math.max(0, Math.floor(num(p.max_respawn_cnt, 0)));
    let starting = false;
    let used = 0;
    lockRevive(battle, u, () => starting);
    battle.on('death', (/** @type {DeathEv} */ c) => {
      if (c.unit !== u || starting || used >= max || !reviveNow(battle, c, 'band')) return;
      used++;
      fxOn(battle, 'revive', u, key, ps.bandId, { left: max - used });
      tplFx(battle, u, 'map_act1autochess_reinforce_02', u);
    }, { priority: PRIO_BAND_REVIVE });
    battle.on('death', (/** @type {DeathEv} */ c) => {
      if (c.unit !== u || !starting) return;
      starting = false;
      if (!u.alive && !u.removed && battle.redeploy(u, { free: true })) fxOn(battle, 'revive', u, key, ps.bandId, { start: true });
    }, { priority: PRIO_MARK_LAST });
    if (!(num(p.start_dead, 0) > 0)) return;
    battle.on('battleStart', () => {
      if (!onField(u)) return;
      starting = true;
      battle.kill(u, null);
      starting = false;
    });
  },

  act1autochess_band17_buff(battle, ps, u, p, key) {
    const pr = num(p.prob);
    if (!(pr > 0)) return;
    let core = false;
    const judge = () => {
      if (!u.alive || !u.deployed) return;
      const me = u.tileC;
      core = !battle.allies(ps.playerId).some((a) => a !== u && a.tileC > me);
    };
    let begun = false;
    battle.on('battleStart', () => { begun = true; battle.after(0.1, judge, { owner: u }); });
    battle.on('deploy', (/** @type {DeployEv} */ c) => {
      if (!begun || c.unit !== u) return;
      core = false;
      const seq = u.deploySeq;
      battle.after(0.1, () => { if (u.deploySeq === seq) judge(); }, { owner: u });
    });
    battle.on('attack', (/** @type {AttackEv} */ c) => {
      if (c.attacker !== u || !core || !u.alive) return;
      if (!(pr >= 1 || battle.rng() < pr)) return;
      if (addShieldLayer(battle, u, `${key}:shield`, 1)) fxOn(battle, 'shield', u, key, ps.bandId);
    });
  },

  act3autochess_band22_buff(battle, ps, u, _p, key) {
    let pending = false;
    lockRevive(battle, u, () => pending);
    battle.on('damaged', (/** @type {DamagedEv} */ c) => {
      if (pending || c.target !== u || !u.alive || c.type === 'element') return;
      if (!handCandidate(battle, ps.playerId)) return;
      pending = true;
      // the knock-out is the operator's own (InstantKill from itself — CN play, maintainer report 2026-11-22: an
      // 乌萨斯 member so knocked out gains the bond's 临时层数 for it, ON_TARGET_KILLED)
      battle.kill(u, u);
    });
    battle.on('death', (/** @type {DeathEv} */ c) => {
      if (c.unit !== u || !pending) return;
      pending = false;
      const next = handCandidate(battle, ps.playerId);
      // back already (不屈's redeploy — the mark's reborn_mask lock does not stop it): no switch, the tile is its own
      if (!next || u.removed || u.alive) return;
      const tile = battle.restTile(u);
      u.removed = true;
      if (battle.fieldReserve(next, tile, u.dir)) fxOn(battle, 'garrison', next, key, ps.bandId, { from: u.id });
      else u.removed = false;
    }, { priority: PRIO_MARK_LAST });
  },
};

const benchKey = (/** @type {string} */ pid) => `band:mark:bench:${pid}`;
/** The rightmost hand operator of the player's reserve not fielded yet, or null. @param {Battle} battle @param {string} pid @returns {Unit | null} */
function handCandidate(battle, pid) {
  for (const u of battleStore(battle, benchKey(pid), () => [])) if (!(u.deploySeq > 0) && !u.alive) return u;
  return null;
}

/**
 * Before any content installs (content/index.js `reserve`): the hand operators a 消解空间 mark may call — every chess of
 * the input's `reserve`, rightmost slot first (shared per slot with the other switch rules: createReserveAlly).
 * @param {Battle} battle
 */
export function reserve(battle) {
  for (const ps of battle.players || []) {
    if (!marksOf(ps).some((m) => m.uid != null && markInputNeeds(effectRecord(m.effectId, battle)).hand)) continue;
    const hand = Array.isArray(ps.input?.reserve) ? ps.input.reserve : [];
    const bench = battleStore(battle, benchKey(ps.playerId), () => []);
    for (const inp of [...hand].filter((h) => h && Number.isInteger(h.slot)).sort((a, b) => b.slot - a.slot)) {
      const u = battle.createReserveAlly(ps, inp);
      if (u && !bench.includes(u)) bench.push(u);
    }
  }
}

// 规程's MAP_TILE 指令 in battle. A tile mark (bands/meta.js, 溃心领域: { effectId, row, col } in board coordinates) runs its
// effect's buff on that tile of the player's field (Battle.mapTile):
//
//   act3autochess_band19_buff 溃心领域 「战斗开始后首次经过该地块的敌人获得恐惧，持续3秒」: the client's global buff gives every
//                             enemy (its prefab's targetSide 2, targetMotion 3: ground and flying) the template, whose
//                             ON_OWNER_ROOT_TILE_CHANGED checks the enemy's position against the marked tile
//                             (AutoChessCheckPosition, _checkPlayerIndex) and, while its own `triggered` is 0, gives it
//                             `fear` and sets `triggered` — so each enemy is feared once, the first time its root tile
//                             becomes the tile. Ours: the enemy's tile (rounded position) read after the moves of each
//                             tick; the tile it is first seen on is no change [ASSUMED·엔진: the client's first tile]; the fear
//                             has no source (a global buff's), which makes it flutter inside its tile (sim/fear.js) for
//                             `fear` s [ASSUMED·CN: the buff's source].
//
// 宝藏探机's chests (bands/meta.js BAND_CHEST, the input's `bandChests`: { id, row, col, enemyId, coin }) stand on their tiles
// from the start as an ally-side unit with no attack (a device: no enemy or ally selects it) and the enemy record's HP. The
// prefab of enemy_9038_achest: an AuraAbility of radius 0.5 over ground enemies (targetMotion 1) whose achest[aura_enemy]
// InstantKills the chest (_killSource, _skipReborn) as one enters — 「被敌人触碰后永久消失」; ours: a ground enemy (not
// hidden) within 0.5 of the chest's centre [ASSUMED·엔진: the enemy's collider radius is not added]. At the battle end a
// standing chest pays its coin (「战斗结束后提供1资金」, Battle.addCoins) and a fallen one is reported in the player's result
// (`bandChestsGone`: the match removes it). A chest whose tile is no ground passage of this field (a boss field) or is
// taken is left out of this battle and stays [ASSUMED·CN].

/** 0.5 — the chest's aura radius (enemy_9038_achest, AuraAbility CircleCollider2D), squared. */
const CHEST_TOUCH_SQ = 0.25;

/** @type {Record<string, TileMarkFn>} */
const TILE_MARK_BY_KEY = {
  act3autochess_band19_buff(battle, ps, [r, c], p) {
    const fear = num(p.fear, 0);
    if (!(fear > 0)) return;
    const k = r * COLS + c;
    /** @type {WeakMap<Unit, number>} */
    const last = new WeakMap();
    /** @type {WeakSet<Unit>} */
    const done = new WeakSet();
    battle.on('tick', () => {
      for (const e of battle.enemies) {
        if (!e.alive || e.hidden || done.has(e)) continue;
        const now = tileKey(e);
        const before = last.get(e);
        last.set(e, now);
        if (before === undefined || before === now || now !== k) continue;
        done.add(e);
        battle.applyStatus(e, 'fear', { duration: fear, source: null });
      }
    });
  },
};

/** @param {Battle} battle @param {BandPlayer} ps @param {BandMark} m */
function installTileMark(battle, ps, m) {
  if (m.row == null || m.col == null) return;
  const tile = battle.mapTile(ps, m.row, m.col);
  if (!battle.grid.inRect(tile[0], tile[1])) return;
  for (const b of buffsOf(effectRecord(m.effectId, battle))) {
    const f = b.bbKey ? TILE_MARK_BY_KEY[b.bbKey] : null;
    if (f) f(battle, ps, tile, b.p);
  }
}

/** @param {Battle} battle */
function installChests(battle) {
  for (const ps of battle.players) {
    const list = Array.isArray(ps.input?.bandChests) ? ps.input.bandChests : [];
    /** @type {Array<{ u: Unit, id: string, coin: number }>} */
    const chests = [];
    for (const x of list) {
      if (!x || typeof x.id !== 'string' || !Number.isInteger(x.row) || !Number.isInteger(x.col) || typeof x.enemyId !== 'string') continue;
      const [r, c] = battle.mapTile(ps, x.row, x.col);
      if (!battle.grid.inRect(r, c) || !battle.grid.walkable(r, c, true)) continue;
      const rec = battle.data.getEnemy ? battle.data.getEnemy(x.enemyId) : null;
      const u = battle.spawnDevice(x.enemyId, r, c, { hp: num(rec?.stats?.maxHp, 100), blockCnt: 0, name: rec?.name ?? x.enemyId });
      if (!u) continue;
      u.ownerId = ps.playerId;
      u.mem.bandChest = x.id;
      chests.push({ u, id: x.id, coin: Math.max(0, Math.floor(num(x.coin, 0))) });
    }
    if (!chests.length) continue;
    battle.on('tick', () => {
      for (const ch of chests) {
        const u = ch.u;
        if (!u.alive) continue;
        for (const e of battle.enemies) {
          if (!e.alive || e.hidden || e.isFlying) continue;
          const dx = e.x - u.x, dy = e.y - u.y;
          if (dx * dx + dy * dy <= CHEST_TOUCH_SQ) { battle.kill(u, null); break; }
        }
      }
    });
    battle.on('battleEnd', (/** @type {{ result: { perPlayer?: Record<string, Record<string, unknown>> } | null }} */ { result }) => {
      /** @type {string[]} */
      const gone = [];
      for (const ch of chests) {
        if (ch.u.alive) { if (ch.coin > 0) battle.addCoins(ps.playerId, ch.coin); } else gone.push(ch.id);
      }
      const pp = result && result.perPlayer ? result.perPlayer[ps.playerId] : null;
      if (pp && gone.length) pp.bandChestsGone = gone;
    });
  }
}

/** @param {Battle} battle */
function installMarks(battle) {
  installChests(battle);
  for (const ps of battle.players) {
    for (const m of marksOf(ps)) {
      if (m.uid == null) {
        if (Number.isInteger(m.row) && Number.isInteger(m.col)) {
          try { installTileMark(battle, ps, m); } catch (e) { battle._handlerError?.(`band:${ps.bandId}:mark`, null, e); }
        }
        continue;
      }
      const eff = effectRecord(m.effectId, battle);
      // a gone operator's mark (round.js bandMarksNow `gone`) on every operator the player fields (MARK_SPREADS_WHEN_GONE)
      const targets = m.gone
        ? (markSpreadsWhenGone(eff) ? battle.allyUnits.filter((u) => isOp(u) && u.ownerId === ps.playerId && !u.reserve) : [])
        : [markedUnit(battle, ps, m.uid)];
      const key = keyOf(ps.bandId || 'band', `mark:${m.effectId}`);
      for (const u of targets) {
        if (!u) continue;
        try {
          if (num(m.capAdd, 0) > 0) { addCapMod(battle, u, Math.floor(num(m.capAdd, 0)), 0); continue; }
          for (const b of buffsOf(eff)) {
            const f = b.bbKey ? MARK_BY_KEY[b.bbKey] : null;
            if (f) f(battle, ps, u, b.p, key);
          }
        } catch (e) { battle._handlerError?.(`band:${ps.bandId}:mark`, u, e); }
      }
    }
  }
}
