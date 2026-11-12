// server/sim/content/bonds/nation/egir.js — 阿戈尔 (egirShip).
//
//   act1autochess_bond_eff_egir   members max HP +(base_max_hp + max_hp_per_stack·L) (直接乘算); battle start devour (see
//                                 devour(): the marker's gained base ATK is a 最终加算, `atkFinal`, not scaled by its ATK
//                                 +%); 5: max_free_respawn_cnt free redeploys, at once, to the knock-outs in time order —
//                                 a member again on each life —, then the 联防 members entering down (upstream #882)
//   act3autochess_bond_eff_egir   (卫戍协议：规程, bondeffect_egir_2 — 歌蕾蒂娅's strategy switches the bond to it) the same
//                                 HP and devour; 6: a member's first knock-out calls the 整备区's rightmost 阿戈尔 of its
//                                 deploy class onto its tile (≤ switch_cnt_max), with its devour gains (installEgirAct3)
// Hook priority: death 11 (5-tier revive, before 不屈's death 10; every `fatal` saver runs before any death hook); 规程's 6
// summon −1000 (after every other death handler, as 卡西米尔's switch).

import * as S from '../../support/index.js';
import { mitigate } from '../../../damage.js';
import * as items from '../../items.js';
import { FORCED_EXIT } from '../../../constants.js';
import { num, reached, onLayers } from '../shared.js';

// "更靠左和靠上": left first (on the player's own board: mirrored players count from the field's right), then top first —
// row 0 is the BOTTOM row (DESIGN §3), so the top of the board is the highest row index. The order is a board position,
// independent of the members' directions (only "身前" follows each member's `dir`). The devour marks in this order (PRTS
// "从最先部署（更靠左和靠上的）的【阿戈尔】干员开始"; the battle's initial deployment order, Battle.start).
const boardCol = (u) => (u.player && u.player.mirror ? -u.tileC : u.tileC);
const egirOrder = (a, b) => boardCol(a) - boardCol(b) || b.tileR - a.tileR || a.id - b.id;

/**
 * The battle-start devour window, shared by every player's 阿戈尔 on the field: `passes` = devour passes still to run
 * (one per player with the bond active, counted at install), `flush` = what runs once the last pass is over (the 5-tier
 * players' slots for their members entering 联防 down).
 */
function egirStart(battle) {
  return S.battleStore(battle, 'bonds:egir:start', () => ({ passes: 0, flush: [] }));
}

/** What each marker gained by the devour (unit → its 'bond:egir:devour' mods), for 规程's 6 summon to pass on. */
function devourGains(battle) {
  return S.battleStore(battle, 'bonds:egir:gains', () => new Map());
}

/**
 * 联防: an operator forced out at the deployment (carry.down, Battle.start, before battleStart) still stands on its
 * deploy position for the devour (PRTS 盟约记录 最先部署). The forced exit is not a knock-out (no 被击倒 effects), but a
 * 5-tier member takes a slot left by the devour for it (installEgir, upstream #882).
 */
function egirDownAtStart(battle, u) {
  return S.isOp(u) && !u.alive && u.removeReason === FORCED_EXIT && !!u.carry && u.carry.down === true
    && battle.isDown(u);
}

/**
 * Battle-start devour (research 02 §3.6 algorithm): members in order (further left on the player's own board — the
 * Final Assault right side is mirrored, so its board-left is the field's right — then higher on the board first) mark
 * the operator on the tile in front of them (one step along each member's own direction `dir`), and through marked
 * members the tiles in front of
 * those (chain); never themselves, a unit already marked by them or a unit that marked them. The marker gains the base
 * ATK and block count of everything it marked — the ATK as a 最终加算 (`atkFinal`, PRTS 盟约记录 "该付与来源获得所有标记单位
 * 的基础攻击力（最终加算）和阻挡数"): added after its percentages, so its skill's ATK +% does not scale it (it was `atkFlat`
 * until 0.1.3: 1000 base ATK, +100 %, +2000 devoured gave 6000 instead of 4000; GitHub #165 point 2, PR #176, the owner's
 * decision of 2026-10-06, DESIGN §24.7). Then each mark makes its target lose damage_value HP as a
 * 物理流失 (PRTS 盟约记录: "造成5000点物理流失", 修正 "【吞噬】的物理流失来源为被付与目标自身；单位被【吞噬】击杀时，击杀来源始终为
 * 对应标记的付与来源"; PRTS 作战机制: a 物理流失 "会受到目标当前防御力…影响而相应衰减") — less the target's DEF as a physical hit
 * (its own source: no DEF ignore), then battle.loseHp: no shields, dodge or damage multipliers (DEF-free until 0.1.1); the
 * kill is credited to the marker — in marking order. One 物理流失 per mark ("每个标记令目标受到一次5000点物理流失"): a member
 * in a chain loses one to every 阿戈尔 behind it (DESIGN §25.22.5: an elite 斯卡蒂 behind two of them, 7513 HP at 60
 * layers, loses 2 × 4751). A target knocked out during the pass has its remaining marks cancelled, also when it is back at
 * once (不屈's 立刻重新部署, 埃芒加德 / M3茧甲, the 5-tier revive — installEgir): PRTS 盟约记录 "目标首次被
 * 击倒后解除自身被付与但还未触发的【吞噬】效果". Only the target's state cancels a mark: a marker knocked out by an earlier
 * mark still resolves its own, credited to it (PRTS names only the target; "击杀来源始终为对应标记的付与来源") — GitHub #165
 * point 3, PR #176, the owner's decision of 2026-10-06; until 0.1.3 a marker off the field gave no further mark.
 * Not modelled: the 流失's own source (PRTS: the target itself) — the hooks see the marker as the source, as for the
 * credit (an open question, DESIGN §24.7).
 * 联防: the operators down since the end of their own combat (forced out by Battle.start) mark, are marked and resolve
 * their marks like standing ones, but nothing resolves on them (below; per players' reports, owner's decision 2026-10-04).
 * Whose operator stands in front does not matter (PRTS "依次吞噬身前一格干员", no own-side limit; the owner's decision of
 * 2026-10-05 after GitHub #140 comment 4): on a shared field (联防, boss) a teammate's operator — standing, or entering
 * 联防 down — is marked like an own one, gives the same base ATK / block count, and the chain goes on through it when it
 * is an 阿戈尔 (S.isMember: its own bonds). Its knock-out is its owner's (their bonds' revives, 不屈 …), credited to the
 * marker as usual. Each devoured operator adds its tier to 阿戈尔 once (IN_BATTLE gain, disabled in 联防 / boss fields).
 * Kept by maintainer decision 2026-10-11 although the client graph spares a teammate whose 阿戈尔 is not active (eat_calculated):
 * on 联防 / boss fields the halves' boundary has attack points and undeployable tiles, so no teammate stands in front.
 * Tokens / devices / empty tiles are never devoured.
 */
function devour(battle, pid, bb, members) {
  // 联防: an operator down at the end of its own combat (carryState.down — Battle.start forced it out right before
  // battleStart, FORCED_EXIT) takes part in the devour as if it stood on its tile, then stays out: it marks in its turn,
  // it is "the unit in front" of another (the chain goes on through it when it is a member), its base ATK / block count
  // for its marker and its own marks resolve (their 物理流失 lands, credited to it as usual); only the marks ON it resolve
  // nothing — it is forced out, so it is never knocked out again, revived or devoured. Per players' reports (community
  // report #3, GitHub #33 item 3), owner's decision 2026-10-04; until 0.1.2 the forced exit came first and the chain broke.
  const downAtStart = (u) => egirDownAtStart(battle, u);
  const order = members.filter((u) => S.onField(u) || downAtStart(u)).sort(egirOrder);
  // the operator in front, whoever owns it (until 0.1.3 only the player's own): a living one, else one lying there since
  // the 联防 start (carry.down, forced out) — a teammate's included
  const opAt = (u) => {
    const [r, c] = S.frontTile(u);
    const a = S.allyAt(battle, r, c);
    if (a) return S.isOp(a) && a.alive ? a : null;
    const d = battle.downOn(r, c);
    return d && downAtStart(d) ? d : null;
  };
  const markedBy = new Map(); // marker → [targets]
  const marks = [];
  for (const m of order) {
    const mine = [];
    const seen = new Set([m]);
    const queue = [m];
    for (let guard = 0; queue.length && guard < 64; guard++) {
      const x = queue.shift();
      const t = opAt(x);
      if (!t || seen.has(t)) continue;
      if ((markedBy.get(t) ?? []).includes(m)) continue;
      seen.add(t);
      mine.push(t);
      // through a marked 阿戈尔 (for the player's own operators: exactly its members; a teammate's by its own bonds)
      if (S.isMember(battle, t, 'egirShip')) queue.push(t);
    }
    markedBy.set(m, mine);
    if (!mine.length) continue;
    let atk = 0, block = 0;
    for (const t of mine) { atk += num(t.base.atk, 0); block += num(t.base.blockCnt, 0); marks.push([m, t]); }
    const mods = {};
    if (atk > 0) mods.atkFinal = atk; // 最终加算 (units.js _recalc)
    if (block > 0) mods.blockCnt = block;
    if (Object.keys(mods).length) {
      S.passiveBuff(battle, m, 'bond:egir:devour', mods);
      devourGains(battle).set(m, mods);
    }
  }
  const amount = num(bb.damage_value, 0);
  const layered = new Set();
  // a target knocked out during the pass = off the field, or in another deployment than when the marks were placed (items
  // deploymentOf: 不屈 and the 复活 of 埃芒加德 / M3茧甲 redeploy it at once, the 5-tier revive — at once again since 2026-11-13, after the board scan of 0.2.0) — a
  // revived member was standing again when its pending marks used to knock it out a second time and spend every revive
  // at t = 0 (GitHub #33)
  const dep = new Map();
  for (const [, t] of marks) if (!dep.has(t)) dep.set(t, items.deploymentOf(t));
  const knocked = (t) => !t.alive || items.deploymentOf(t) !== dep.get(t);
  for (const [m, t] of marks) {
    // every mark resolves whatever became of its marker — knocked out by an earlier mark (and revived or not), or down
    // since its own combat (downAtStart); a mark on a unit knocked out during the pass, or lying down since the 联防
    // start, resolves nothing (`knocked`: it is off the field)
    if (knocked(t)) continue;
    S.fxOn(battle, 'devour', t, 'bond:egirShip', 'devour', { from: m.id });
    if (amount > 0) battle.loseHp(t, mitigate(amount, 'phys', t.s), { source: m, tags: ['bond:egir:devour'] });
    // client buff template act1autochess_bond_eff_egir[eat_mark] ON_BUFF_LATE_ENABLE: CreateEffect on the marked unit
    // after its FixedValueDamage (owner and source: the marked unit; display only)
    S.tplFx(battle, t, 'bond_aegir_eat_01', t);
    if (!layered.has(t)) {
      layered.add(t);
      S.gainLayers(battle, { playerId: pid, bonds: 'egirShip', n: S.tierOf(t), source: m, reason: 'bond' });
    }
  }
}

/**
 * Every tier of both directions: the members' max HP and the battle-start devour pass. Returns the devour window
 * (egirStart) for the 6-tier part.
 */
function installHpAndDevour(battle, pid, bb, members) {
  // HP (every tier): a match-long buff put on the members when the battle is built, so each one is deployed with it
  // (Battle._deploy: full HP of the raised max HP) and the battle-start devour finds it — the community report's step 1,
  // 「第一步给所有鱼加盟约的血量」 (DESIGN §25.22.5: an elite 深巡, 2904 HP and DEF 655, loses 5000 − 655 = 4345 to a mark and
  // stands from 15 layers on, 2904 × 1.50 = 4356). The layers the devour adds raise it one tick later (onLayers; the HP
  // ratio is kept).
  const apply = () => {
    const mods = S.directMods({ hp: num(bb.base_max_hp, 0) + num(bb.max_hp_per_stack, 0) * S.bondLayers(battle, pid, 'egirShip') });
    for (const u of members) S.passiveBuff(battle, u, 'bond:egir', mods);
  };
  apply();
  onLayers(battle, pid, 'egirShip', apply);
  const start = egirStart(battle);
  start.passes++;
  battle.on('battleStart', () => {
    try {
      devour(battle, pid, bb, members);
    } finally {
      if (--start.passes <= 0) for (const flush of start.flush.splice(0)) flush();
    }
  }, { once: true });
  return start;
}

function installEgir(battle, pid, bb, members) {
  // 5: "前3名【阿戈尔】干员首次被击倒时立刻复活" — the official client (act1autochess_bond_eff_egir ON_OWNER_FINISH; the bond
  // is a global buff, `env_gbuff_new` without `add_times`, put on every unit at each birth — Unit.OnBorn →
  // BattleController.RegisterUnit —, whose ON_BUFF_START sets `reborn_mask` back to 0): every finish of a member while the
  // player's count is under max_free_respawn_cnt (bonds.json; the client's counter is per side, `free_respawn_cnt_a/b`)
  // takes one and makes its next deployment free with no redeploy time — so a member revived once is revived again on a
  // later knock-out while slots last (one per member until 2026-11-13, the owner's decision of 2026-10-05, after the
  // description 「首次被击倒」). A member never knocked out takes none (GitHub #105, #140 "没被吃的阿戈尔干员也会占用复活名额").
  // The slot is taken at the knock-out, so the battle-start devour's knock-outs take them in knock-out order, as later
  // ones (by board position from the bottom-left once the devour was over, after a community report, 2026-10-07 –
  // 2026-11-13; in knock-out order until 0.2.0, DESIGN §24.3). A revived member is back at once; its pending marks are
  // cancelled (devour, `knocked`: PRTS 盟约记录 "目标首次被击倒后解除自身被付与但还未触发的【吞噬】效果"; until 0.1.2 they
  // knocked it out again, GitHub #33) [ASSUMED·엔진: the client deploys the card when its automatic deployment starts,
  // after the devour; the same marks resolve]. A knock-out in the devour is otherwise like any other: 被击倒 triggers fire
  // (克莱门莎, 幽灵鲨 …). Its own saver acts first: a kit or item saver that prevents the knock-out is a `fatal` hook
  // (斯卡蒂's DRE-Y −50, kit savers 10 … −60, 坚固维式重锤 PRIO_REVIVE −100), so the unit is never knocked out and no slot is
  // used; a 复活 (M3茧甲 13, 埃芒加德 12 — items reviveNow, a knock-out and a free redeploy since 0.2.0) answers the
  // knock-out before this hook and marks it `revivedBy`: that knock-out takes no slot (the owner's decision of
  // 2026-10-05: an operator's own revive uses no slot; [ASSUMED] for 埃芒加德, a band, as for M3茧甲, the item revive the
  // owner named). Only knock-outs ('killed') count [ASSUMED·미조사: the client's ON_OWNER_FINISH also runs on a withdraw;
  // no 阿戈尔 withdraws itself in this mode]; an operator entering 联防 down (FORCED_EXIT) is no knock-out but takes a slot
  // the devour left (the flush below, upstream #882); a 调和 member counts like any other. Each battle (normal, 联防,
  // boss) counts its own. PRTS: the knocked-out unit's next deployment has 0 redeploy time and 0 cost, i.e. it IS knocked
  // out (被击倒 triggers fire) and redeploys where it lies (the engine's rest tile, Battle._layBody: the tile it was
  // knocked out on — a raid-relocated member comes back where it fell —, or its own home when it fell on another board
  // piece's home; PRTS 卫戍协议/帮助 §作战阶段 单位部署) with full HP, SP reset and `deploy` effects (卡西米尔 / 叙拉古).
  // Death priority 11: before 不屈 (10), whose redeploy "also consumes a 复活 charge" — the slot is always the one used.
  // Until 0.1.3 the slots were fixed at battle start for the first 3 members by position (§23.20).
  const max = reached(battle, pid, 'egirShip', bb.power_bond_char_cnt) ? Math.max(0, Math.floor(num(bb.max_free_respawn_cnt, 0))) : 0;
  const start = installHpAndDevour(battle, pid, bb, members);
  if (!(max > 0)) return;
  const memberOps = new Set(members.filter(S.isOp));
  let revives = 0;
  const revive = (u) => {
    if (!battle.redeploy(u, { free: true })) return;
    revives++;
    S.fxOn(battle, 'revive', u, 'bond:egirShip', 'respawn', { n: revives });
    S.tplFx(battle, u, 'map_act1autochess_reinforce_02', u); // act1autochess_bond_eff_egir ON_OWNER_FINISH, the free-respawn branch
  };
  start.flush.push(() => {
    // 联防: a member entering down (carry.down, forced out by Battle.start) is removed by the client after the devour
    // (MainGameInHelpBattle.StartMainBattle: one tick after the mode change, `_ApplyChessStatus` finishes every unit
    // without a carried status — reason OTHER), and the template's ON_OWNER_FINISH filters only MOVE_LIKE_RESPAWN_SELF:
    // that removal takes a slot like a knock-out (an official recording, upstream #882). So once every devour is over,
    // the members lying down since the start take the slots left, in the deployment order (the client's character list)
    // [ASSUMED·엔진: the list is reordered by the units the devour removed]; without a slot they stay down and redeploy
    // by the normal rule.
    const down = members.filter((u) => memberOps.has(u) && egirDownAtStart(battle, u));
    for (const u of down.sort((a, b) => a.deploySeq - b.deploySeq)) if (revives < max) revive(u);
  });
  battle.on('death', (c) => {
    const u = c.unit;
    if (c.reason !== 'killed' || c.revivedBy || !memberOps.has(u)) return;
    if (revives >= max || u.alive || u.removed) return;
    revive(u);
  }, { priority: 11 });
}

// =====================================================================================================================
// 规程: 歌蕾蒂娅's other direction (bondeffect_egir_2, act3autochess_bond_eff_egir)
//
// The template is act 1's (the same [max_hp], the same devour: ON_AUTO_CHESS_MODE_CHANGED marks range 1-1 — the tile in
// front — then x-5 through marked members, [eat_mark] unchanged); only its ON_OWNER_FINISH differs. On a member's
// knock-out (HP_ZERO, HP_ZERO_WITH_NO_SOURCE or FALLDOWN — our 'killed') at power_bond_char_cnt members: its first one
// only (egir_first_finish_flag, spent whether or not anyone comes), while the player's switches are under
// switch_cnt_max (the AUTOCHESS global `bond_eff_egir_switch_cnt_<side>`, raised only when one comes), the rightmost 阿戈尔
// of the 整备区 that may stand on its tile (AutoChessCheckSwitchWithHand / AutoChessMarkSwitchWithHand: `_selectType`
// RIGHT, `_putType` ORIGINAL, `_checkBond` egirShip, `_buildableType` NONE) comes in there facing its way and the member
// leaves the field without a body, as 卡西米尔's 6 switch (kazimierz.js). The newcomer gets [attr_extend]: the fallen
// member's devour gains (egir_bond_atk / egir_bond_block_cnt [extend] — ATK 最终加算, block count; the HP part only with
// a strategy item's egir_band_equip_extra, none in this mode) are added to its own. The bond states stay the battle's
// input (「不改变场上的盟约激活状态」).
// [ASSUMED·CN: the switch nodes are CN-only — "may stand on its tile" is the member's deploy class (as the switch 特质,
// garrisons/effects/switch.js `_checkOriginBuildable`); the counter is per player (act 1's revives the same way); the
// switch runs after every other `death` handler (priority −1000, as 卡西米尔's), so a saver or 不屈 answers first]. The
// counter rises in ON_OWNER_FINISH, so the devour's own knock-outs switch at once in knock-out order, as later ones (by
// the community report's board scan once the devour was over until 2026-11-13, as act 1's revives). The flag is the
// character's shared blackboard, never reset by ON_BUFF_START (unlike act 1's reborn_mask): one switch per member.

const benchKey = (pid) => `bond:egir:bench:${pid}`;

/**
 * The 6 summon's candidates: the player's 整备区 阿戈尔 members (调和 counted), any deploy class, rightmost slot first, as
 * reserve operators (battle/players.js createReserveAlly; one unit per hand slot, shared with the other hand rules).
 */
function reserveEgir(battle, pid, bb) {
  if (!reached(battle, pid, 'egirShip', bb.power_bond_char_cnt)) return;
  const ps = S.player(battle, pid);
  const hand = Array.isArray(ps?.input?.reserve) ? ps.input.reserve : [];
  const bench = S.battleStore(battle, benchKey(pid), () => []);
  for (const inp of [...hand].filter((h) => h && Number.isInteger(h.slot)).sort((a, b) => b.slot - a.slot)) {
    const def = battle._allyDefFromInput(inp);
    if (!def) continue;
    const probe = { kind: 'op', side: 'ally', ownerId: pid, def, items: Array.isArray(inp.items) ? inp.items : [] };
    if (!S.isMember(battle, probe, 'egirShip')) continue;
    const u = battle.createReserveAlly(ps, inp);
    if (u && !bench.includes(u)) bench.push(u);
  }
}

function installEgirAct3(battle, pid, bb, members) {
  installHpAndDevour(battle, pid, bb, members);
  if (!reached(battle, pid, 'egirShip', bb.power_bond_char_cnt)) return;
  const max = Math.max(0, Math.floor(num(bb.switch_cnt_max, 0)));
  const bench = S.battleStore(battle, benchKey(pid), () => []);
  if (!(max > 0) || !bench.length) return;
  const memberOps = new Set(members.filter(S.isOp));
  const knockedOut = new Set(); // members whose first knock-out of this battle has happened (egir_first_finish_flag)
  const gains = devourGains(battle);
  let used = 0;
  const summon = (u) => {
    if (used >= max || u.alive || u.removed) return;
    const next = bench.find((x) => !(x.deploySeq > 0) && !x.alive && x.def?.position === u.def?.position);
    if (!next) return;
    const tile = battle.restTile(u);
    u.removed = true;
    if (!battle.fieldReserve(next, tile, u.dir)) { u.removed = false; return; }
    used++;
    memberOps.add(next);
    // [attr_extend]: the fallen member's gains, passed on again by the newcomer's own first knock-out
    const g = gains.get(u);
    if (g && Object.keys(g).length) {
      S.passiveBuff(battle, next, 'bond:egir:devour', { ...g });
      gains.set(next, g);
    }
    // (the view sees the knock-out's 'die' and the newcomer's 'deploy', as 卡西米尔's switch: no effect of its own yet)
  };
  battle.on('death', (c) => {
    const u = c.unit;
    if (c.reason !== 'killed' || c.revivedBy || !memberOps.has(u) || knockedOut.has(u)) return;
    knockedOut.add(u);
    summon(u);
  }, { priority: -1000 });
}

export const TEMPLATES = Object.freeze({
  act1autochess_bond_eff_egir: { bond: 'egirShip', battle: installEgir },
  act3autochess_bond_eff_egir: {
    bond: 'egirShip', battle: installEgirAct3, reserve: reserveEgir,
    hand: (bb) => ({ position: null, need: num(bb.power_bond_char_cnt) }),
  },
});
