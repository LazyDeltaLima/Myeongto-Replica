// server/sim/content/kits/ops/op-wang.js — 望 (char_2027_wang) 自选 operator kit — local patch: the nas-local 선발 kit
// (formerly kits/diy.js, docs/LOCAL-PATCH.md 「선발 오퍼레이터」 — the owner's decisions are recorded there) on upstream's
// 自选 framework; it replaces upstream's op-wang.js (the owner's rule: where the two differ, ours wins). Kit contract:
// ../README.md ("How to add an operator (自选)"); `chess` = the composed 自选 record (shared/diy.js diyRecordOf). Her 棋子
// get their kit here: the placed pieces in a talent install (battle._setupUnit, as upstream's), every spawned stone and
// 跟子 through spawnToken `kit` (content/index.js resolves no token kit for it).
// fx kinds the client draws / sounds from (render/fxgame.js stoneFx, audio.js kitHitKey): 'zone' { token, skill 1|2|3,
// axes, line, follower, consumed } (a trigger), 'wangLink' { axes, first }, 'summon'.
//
// 望 (陷阱师) — 铸子 / 料敌机先; S1 取势, S2 连星, S3 天下劫; 棋子 (token_10064_wang_stone1)
//
// Sources: the official tables (character_table / skill_table: talents, skills, the token's sktok_wang_1..3 and its
// x-6 range, overridden by the sktok_wang_3 prefab's x-1) and PRTS 「望」 备注 (fetched 2026-10-05). Rules followed:
// - 棋子 = 陷阱: not an attack target, takes no damage (persistent untargetable + invulnerable; no HP bar on the client,
//   shared/trap-tokens.js). A stone is 激活 once orthogonally connected to another stone or 跟子 of hers, and stays
//   active after that neighbour leaves (latched; namu: "연결된 바둑돌이 사라져도 유지"); a selectable enemy (flyers too; no unrevealed 隐匿 one —
//   stoneSelectable) on the trigger area of an activated stone — checked every tick, one already standing there when it
//   activates too (user decision 2026-10-07, W2) — triggers it and USES IT UP (陷阱师 traps: "踩上去的
//   第一个敌人会触发其效果"; the token has an ON_UNIT_DEAD sound; user report 2026-10-05). A used-up placed stone comes back
//   on its own tile like the mode's redeploys (Battle.redeploy / tokens.js enableRespawn): after its respawnTime, for its
//   DP cost (卫戍协议 in-battle DP: 10, +1/s), once no walking enemy stands there (during S3 on a tile of her range it may
//   come back onto one: 「在攻击范围内手动部署棋子时可部署至敌人所在位置」, user decision 2026-10-07, W10) — and it takes
//   one stone of the stock: with the stock empty the used stones wait until S1 / S2 refill it (user decision 2026-10-07,
//   RETURN_USES_STOCK; the former card rule, no stock spent, is kept off beside it). The trigger area is the
//   stone's own tile, with S3 equipped (its passive: "棋子的触发和伤害范围扩大") x-1, a radius-2 diamond of 13 tiles (the
//   sktok_wang_3 prefab's SkillTrigger / Selector and PRTS 天下劫 "携带该技能时…x-1"; the table's x-6 cross is in no prefab —
//   owner's decision 2026-10-06: the official diamond)
//   and every enemy in it is hit — a high-ground stone thus catches ground enemies with S3; with S2 only a flyer
//   on its tile triggers it, and the line blast then hits ground enemies too.
// - Stones are hand pieces placed in the prep (any deployable tile, ground or high ground — owner's decision 2026-10-05,
//   tools/build-diy.mjs makes the token position ALL). They stay exactly where they were placed: the battle-start
//   deployment is automatic, and 铸子's 跟子 comes only with a MANUAL deployment ("手动部署棋子时") — so none at the
//   battle start (it used to add one per stone, and those, counted under the deploy limit, withdrew the oldest placed
//   stones: the layout changed when the battle began).
// - 跟子 (铸子, E1+): PRTS "通过天赋'额外部署的棋子'实为望自身发射的弹道 由此其不具有单位相关的性质（例如占据空位等）" — not a unit: it never counts under the stone deploy limit
//   (maxDeployCount) and occupies no tile; ≤ attack@max_spawn_cnt of them. Tile: one of the 4 neighbours, enemy tiles
//   first, then undeployable ground > deployable ground > deployable high ground (never undeployable high ground), ties
//   up > right > down > left as the board is drawn (PRTS 「相同优先级时按棋子上>右>下>左」, left / right swapped on a mirrored
//   field; user decision 2026-10-07, W8 — it replaced the seeded random of the client's _alwaysRandomInTheEnd 1; the
//   priority confirmed in game by the user 2026-10-07); only where no character unit stands and no knocked-out operator
//   lies (downOn, as upstream; user decision 2026-10-07). It needs no stock and is drawn as a stone. It links like a stone; its damage comes from 望.
// - Stock (手牌): at the battle start the stones not placed (deploy limit − placed: 6, 7 with her module
//   uniequip_002_wang — stoneLimits; user decision 2026-10-07), ≤ maxDeckStackCnt.
//   S1 / S2: "立即获得两枚棋子", 阻回 while the stock is full (PRTS 备注). S3: gains cnt, the stones above the stock limit
//   go out as 跟子 on the enemies of her range (PRTS: "技能开启时自动部署的为第一天赋的跟子"); manual deployments in her
//   range may go on enemy tiles and bring the talent's 跟子 (free) + up to 3 extra 跟子, one ammo each — ≤ 3 ammo a deployment
//   (「第一天赋额外至多部署3枚棋子并消耗等量弹药」: one manual stone = the talent's 1 + S3's ≤ 3 — confirmed in game by the
//   user 2026-10-07, W12); it ends when stopped or out of stones,
//   the ammo left returns as stones.
// - [ASSUMED] 卫戍协议 battles take no manual deployment: like the mode's 自动操作 of skills, stones of the stock are
//   deployed automatically (S1 / S2: on the free deployable tile next to her stones that an enemy route crosses,
//   nearest to an enemy, no enemy on it — trait; S3: on an enemy tile of her range, one a second) while fewer than
//   maxDeployCount stones stand; S3 stops itself once it can deploy no more. The used-up stones waiting for a redeploy
//   come first: new tiles only beyond them. A deployment from the stock pays the stone's DP cost too.
// - 取势: 停顿 + atk_scale × 望's ATK arts per second for `sluggish` s (independent per trigger, from 望).
//   连星: arts atk_scale × 望's ATK to the enemies within 3 tiles on both sides along the link direction (vertical
//   when linked up / down, horizontal when left / right; once activated a direction stays, PRTS 备注) + slow: independent
//   stacks, each on its own timer, 直接乘算 (their percentages add up in that stage), move speed ≥ 0.1 (addWangSlow; user
//   decision 2026-10-07, W7).
//   料敌机先: per stone on the continuous straight line through the triggering stone, +per_atk_scale damage and
//   per_magic_resist_penetrate_fixed flat RES ignore (≤ max_trigger_cnt); latched per stone at the longest line it
//   has seen (namu: 3 linked, one leaves → the others keep 3).

import { COLS } from '../../../constants.js';
import { bodyOnTile } from '../../../body.js';
import { enemyStealthed } from '../../../targeting.js';
import { talentBb } from '../shared/tier1.js';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const live = (u) => !!u && u.alive && u.deployed && !u.removed && !u.hidden;
const selectedSkill = (chess, def) => chess?.skill?.skillId ?? def?.skill?.id ?? null;
const skillGridOf = (def) => (def?.skill?.rangeGrid?.length ? def.skill.rangeGrid : null);
const ANY = Object.freeze({ canHitFly: true });
const inRange = (battle, unit) => battle.enemiesInKeys(unit.rangeKeys || [], unit, ANY);

const STONE_ID = 'token_10064_wang_stone1';
/** Her summon 棋子 (named as upstream's tests import it). */
export const STONE = STONE_ID;
const ORTHO = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // up > right > down > left (row 0 = bottom)
/** The same order on a mirrored field (drawn with col → 20 − col): 上 > 右 > 下 > 左 as drawn = +row, −col, −row, +col. */
const ORTHO_MIRRORED = [[1, 0], [0, -1], [-1, 0], [0, 1]];
const WANG_S3_PACE = 1; // [ASSUMED] one automatic deployment a second while S3 runs
/** A used stone's return takes one stone of the stock (user decision 2026-10-07); false = the former card rule (no stock). */
const RETURN_USES_STOCK = true;
/**
 * Tiles no 跟子 may take (local patch 2026-10-06, user: "적 공격 포인트"): the client 跟子 selector has `exceptTileTypes`
 * with tileTypesMask 14. Torappu TileTypesMask bits, in the order of battle_misc_table tileTypeDict (DEFAULT 1 assumed
 * first, then END 2, START 4, HOLE 8, FAKE_HIGHLAND 16, RESPAWN_ABNORMAL 32) → 14 = END | START | HOLE:
 * tile_end / tile_end_cooperate / tile_allygoal, tile_start / tile_start_cooperate / tile_enemygoal, tile_hole.
 */
const FOLLOWER_EXCEPT_TILES = new Set(['tile_end', 'tile_end_cooperate', 'tile_allygoal', 'tile_start', 'tile_start_cooperate', 'tile_enemygoal', 'tile_hole']);
const WANG_S3_EXTRA = 3; // "第一天赋额外至多部署3枚棋子"

function stonesOf(battle, owner) {
  return battle.allies(owner.ownerId).filter((a) => a.kind === 'token' && a.defId === STONE_ID && a.ownerUnit === owner && a.alive);
}
const isFollower = (s) => !!s?.mem?.wangFollower;
const stoneAt = (stones, r, c) => stones.find((s) => s.tileR === r && s.tileC === c) || null;
/** Stones on the continuous straight line (row or column) through `s`, the longer one. */
function lineCount(stones, s) {
  let best = 1;
  for (const [dr, dc] of [[0, 1], [1, 0]]) {
    let n = 1;
    for (const k of [1, -1]) for (let i = 1; stoneAt(stones, s.tileR + dr * i * k, s.tileC + dc * i * k); i++) n++;
    best = Math.max(best, n);
  }
  return best;
}
/** The S3-equipped stone's x-1 trigger / damage area (radius-2 diamond, 13 tiles) as [dr, dc] offsets. */
const DIAMOND2 = Object.freeze([[0, 0], [1, 0], [2, 0], [-1, 0], [-2, 0], [0, 1], [0, 2], [0, -1], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
const enemiesOnTile = (battle, r, c) => battle.enemies.filter((e) => e.alive && !e.hidden && Math.round(e.y) === r && Math.round(e.x) === c);
/** Walking enemies on a tile: the only ones that block a stone's placement / redeploy (client _excludeOccupiedByWalkEnemy). */
const walkersOnTile = (battle, r, c) => enemiesOnTile(battle, r, c).filter((e) => !e.isFlying);
/**
 * An enemy a stone can select (trigger on, hit): PRTS 作战机制 §AOE伤害判定 "AOE的判定是对攻击范围内的每个可以被选中的敌人进行
 * 判定" and 隐匿 "一般无法被敌方的索敌机制和Buff选择器选中为目标" (Battle.foesInRadius: no untargetable, no unrevealed 隐匿 one);
 * PRTS 望 备注 "棋子的索敌…" — the stones select like any summon (user report 2026-10-05: 은신 enemies took the blast).
 */
const stoneSelectable = (e) => e.alive && !e.hidden && !e.s.flags.untargetable && !(e.s.flags.stealth && enemyStealthed(e));
/**
 * S3 enemy tiles, most urgent first: the official text only says "优先部署在范围内敌人所在位置" (client WangTileSelector
 * SKILL_3_INSTANT sorts natively, no distance sort in its data; PRTS orders by enemy / tile class only) — local patch
 * (user decision 2026-10-06) [추정]: the enemy closest to its goal first (default targeting: remaining path, then spawn order).
 */
const goalFirst = (battle, list) => list.sort((a, b) => battle.remainingDistance(a) - battle.remainingDistance(b) || a.spawnSeq - b.spawnSeq);
const wangSkill = (owner) => owner?.skill?.id ?? owner?.def?.skill?.id ?? null;

function wang(bb, chess, def) {
  const sid = selectedSkill(chess, def);
  const t0 = talentBb(chess, 0);
  const followerCap = Math.max(0, num(t0['attack@max_spawn_cnt'], 0));
  // the 棋子 variant of her form / skill / module (a 自选 piece's token variants are keyed by its owner form)
  const stoneDef = (battle, unit) => battle.tokenDef(STONE_ID, unit);
  const stoneStats = (battle, unit) => stoneDef(battle, unit)?.stats ?? {};
  /**
   * deployLimit / deckStack of her stone variant with her module (normalizeToken drops both from `stats`; tokens.js
   * deployLimitOf reads the raw variant the same way). local patch (2026-10-08): the module raises the deploy limit
   * 6 → 7 (uniequip_002_wang `byModule` stats) — the kit used to fall back to 6 always (user's video: 7 stones in the prep).
   */
  const stoneLimits = (battle, unit) => {
    const raw = stoneDef(battle, unit)?.raw;
    const oid = unit.def?.tokenOwner ?? unit.defId;
    let v = raw?.variants?.[oid] ?? raw?.variants?.[String(oid).replace(/_b$/, '_a')] ?? null;
    const mid = unit.def?.loadout?.moduleId;
    if (v && typeof mid === 'string' && v.byModule?.[mid]) v = { ...v, ...v.byModule[mid], stats: { ...v.stats, ...v.byModule[mid].stats } };
    const vs = v?.stats ?? {};
    return { deployLimit: vs.deployLimit ?? raw?.deployLimit ?? raw?.stats?.deployLimit, deckStack: vs.deckStack ?? raw?.stats?.deckStack };
  };
  // stock = the stone cards in her hand, ≤ deckCap ("最多拥有": the client's card counts — wang_s3_charge_token
  // max_cnt / remaining_cnt via AssignTokenCardCntToBB, _stopSpWhenTokenIsFull; local patch 2026-10-06: not field + hand)
  const st = (unit) => unit.mem.wang || (unit.mem.wang = { stock: 0, deckCap: 7, fieldCap: 6, prepPlaced: 0 });
  const placed = (battle, unit) => stonesOf(battle, unit).filter((s) => !isFollower(s));
  const followers = (battle, unit) => stonesOf(battle, unit).filter(isFollower);
  /** Placed stones used up by a trigger, waiting to be redeployed on their own tile. */
  const waitingOf = (battle, unit) => battle.allyUnits.filter((t) => t.kind === 'token' && t.defId === STONE_ID && t.ownerUnit === unit
    && !t.alive && !t.removed && t.mem.wangUsed);
  /** Battle.isReservedTile without the home tiles of her own used stones waiting to be redeployed. */
  const reservedForOthers = (battle, unit, r, c) =>
    battle.isReservedTile(r, c, (a) => a.kind === 'token' && a.defId === STONE_ID && a.ownerUnit === unit && a.mem.wangUsed);
  /**
   * A consumed stone comes back on its own tile like any redeploy of the mode (tokens.js enableRespawn /
   * Battle.redeploy): after its respawnTime, paying its DP cost; the tile must be free of units and enemies (trait).
   * [ASSUMED] she must be on the field (a hand piece of hers).
   * Stock (user decision 2026-10-07, the trapmaster rule the user knows from the game): every return takes one stone
   * of her stock (the deploy limit — 6, 7 with her module — minus the stones placed in the prep at the start); with the stock empty a used stone waits until S1 / S2
   * 「立即获得两枚棋子」 refill it. `RETURN_USES_STOCK`.
   * Former rule (2026-10-06 – 2026-10-07, kept for reference, off): a consumed stone was a card again (the token deck:
   * a summon that leaves returns to the hand after its 再部署时间 — the stock is the deck, not a count used up) and came
   * back without spending the stock, so the placed stones cycled for the whole battle. It replaced an earlier model
   * where the stock was 7 − placed (1 with 6 on the board) and the stones stopped after one return (user report
   * 2026-10-06 「돌이 다시 놓이지 않는다」 — with the decision of 2026-10-07 that is the intended behaviour again).
   */
  const inHerRange = (unit, r, c) => !!(unit.rangeKeySet?.has(r * COLS + c) ?? unit.rangeKeys?.includes(r * COLS + c));
  /**
   * S3 「第一天赋额外至多部署3枚棋子并消耗等量弹药」 (user decision 2026-10-07, W12; confirmed in game by the user the same day): a deployment during S3
   * brings the talent's ordinary single 跟子 for free plus ≤ WANG_S3_EXTRA extra ones, one ammo each — so ≤ 3 ammo a
   * deployment (the first 跟子 built is the free one). Formerly ≤ 4 跟子 and one ammo for every one (client
   * SpawnTokenS3InSkill BuildStone counter `_countEvent 4, _expendPerTrigger 1`, user 2026-10-06); upstream: ≤ 3 in all,
   * every one paid, no free one.
   */
  const s3Followers = (ammo) => 1 + Math.min(WANG_S3_EXTRA, ammo);
  const s3Paid = (built) => Math.max(0, built - 1);
  /** Spend the S3 ammo of a deployment that built `built` 跟子 (`ammo` = the count before it); the last ammo ends S3. */
  const spendS3 = (unit, ammo, built) => {
    const paid = s3Paid(built);
    if (!(paid > 0)) return false;
    unit.skill.ammoLeft = st(unit).ammo = Math.max(0, ammo - paid);
    if (unit.skill.ammoLeft <= 0) { unit.skill.end('ammo'); return true; }
    return false;
  };
  const redeployUsed = (battle, unit) => {
    if (!live(unit)) return;
    for (const t of waitingOf(battle, unit).sort((a, b) => a.mem.respawnAt - b.mem.respawnAt)) {
      if (battle.time + 1e-9 < t.mem.respawnAt) continue;
      // trait 「陷阱无法放置于敌人已在的格子中」: no return while a walking enemy stands on its tile — except during S3 on a
      // tile of her range: 天下劫 「在攻击范围内手动部署棋子时可部署至敌人所在位置」 (user decision 2026-10-07, W10: the
      // return is her deployment of the stone in the mode, as below)
      const s3 = unit.skill?.active && unit.skill.id === 'skchr_wang_3';
      const s3Here = s3 && inHerRange(unit, t.homeR, t.homeC);
      if (!s3Here && walkersOnTile(battle, t.homeR, t.homeC).length) continue;
      // [추정] (report 3 #2-3, 2026-10-08) nor while a 跟子 of hers lies there: a 跟子 holds no tile (`_occ`, PRTS 「不具有单位
      // 相关的性质（例如占据空位等）」), so Battle.redeploy would bring the stone back onto it — two stones on one tile. It waits
      // until the 跟子 goes off, as it waits for a stone S3 put on its tile (the drop below)
      if (stoneAt(stonesOf(battle, unit), t.homeR, t.homeC)) continue;
      if (placed(battle, unit).length >= st(unit).fieldCap) break; // never over the deploy limit (it would withdraw a stone)
      if (RETURN_USES_STOCK && st(unit).stock <= 0) break; // the stock is out: wait for S1 / S2 (user decision 2026-10-07)
      if (!battle.redeploy(t, { free: false })) continue;
      if (RETURN_USES_STOCK) st(unit).stock--;
      Object.assign(t.mem, { wangUsed: false, active: false, line: 0, axes: new Set() });
      battle.fx('summon', { x: t.x, y: t.y, id: t.id });
      // every stone birth brings its 跟子 (client wang_stone1_t_1[trigger] ON_OWNER_BORN) — the battle-start deployment
      // of the prep stones aside (user decision)
      // local patch (2026-10-06, user: "S3 ammo never drops"): while S3 runs, a used stone coming back IS her deployment
      // of a stone in the mode (卫戍协议 has no hand placement; the prep layout keeps the field at its cap of 6, so the
      // S3 stand-in found no free slot and spent nothing) — it builds the S3 跟子 around it (s3Followers: the talent's
      // one free + ≤ 3 extra, one ammo each)
      const ammo = s3 ? Math.max(0, Math.floor(num(unit.skill.ammoLeft, 0))) : 0;
      const built = followAround(battle, unit, t, s3 ? s3Followers(ammo) : 1);
      if (s3) spendS3(unit, ammo, built);
      syncSpLock(battle, unit);
    }
  };
  /** 阻回 while the stock is full (S1 / S2). */
  const syncSpLock = (battle, unit) => {
    if (sid === 'skchr_wang_3') return;
    const s = st(unit);
    const full = s.stock >= s.deckCap;
    const has = unit.buffs.some((b) => b.key === 'wang:stockFull');
    if (full && !has) battle.addBuff(unit, { key: 'wang:stockFull', duration: Infinity, flags: { noSp: true } });
    else if (!full && has) battle.removeBuff(unit, 'wang:stockFull');
  };
  /** A 跟子 on (r, c): a projectile of hers — never under the stone deploy limit, holds no tile. */
  const placeFollower = (battle, unit, r, c) => {
    const tdef = stoneDef(battle, unit);
    if (!tdef) return null;
    const kit = wangStone(tdef.skill?.bb ?? {}, tdef.raw ?? tdef, tdef); // no fromTokens: outside the deploy limit
    kit.follower = true;
    const f = battle.spawnToken(unit, STONE_ID, r, c, { anySource: true, force: true, kit });
    if (!f) return null;
    f.mem.wangFollower = true;
    if (battle.unitAt(r, c) === f) battle._occ[r * COLS + c] = null; // occupies no tile
    // local patch: `follower` — its own effect (render/fxgame.js: projectile_chr_wang_stone* wang_passive_01_buff)
    battle.fx('summon', { x: f.x, y: f.y, id: f.id, follower: true });
    return f;
  };
  /** Follower tile class (PRTS 备注): 0 undeployable ground, 1 deployable ground, 2 deployable high ground, null = none. */
  const followerClass = (battle, r, c, stones) => {
    if (!battle.grid.inRect(r, c) || stoneAt(stones, r, c) || battle.grid.isObstacle(r, c)) return null;
    if (battle.downOn(r, c)) return null; // a knocked-out operator lies there (user decision 2026-10-07, as upstream's downOn)
    const occ = battle.unitAt(r, c);
    if (occ && !isFollower(occ)) return null; // no character unit
    const t = battle.grid.tile(r, c);
    if (FOLLOWER_EXCEPT_TILES.has(t.key) || t.special === 'start' || t.special === 'end') return null; // local patch
    if (t.build === 'NONE') return t.pass === 'ALL' && t.height === 'LOW' ? 0 : null;
    return t.height === 'LOW' ? 1 : 2;
  };
  /** 铸子 跟子 around `s`; returns the count placed (≤ n). */
  const followAround = (battle, unit, s, n = 1) => {
    let k = 0;
    // ties: PRTS 铸子 备注 「相同优先级时按棋子上>右>下>左」 as the board is drawn — the mirrored field (boss / hidden right
    // side, drawn with col → 20 − col) swaps right and left (as upstream's SIDES_MIRRORED). User decision 2026-10-07 (W8):
    // replaces the seeded random tie-break (client _alwaysRandomInTheEnd 1 — the sources disagree, the user chose PRTS)
    const sides = battle.getPlayer(unit.ownerId)?.mirror ? ORTHO_MIRRORED : ORTHO;
    while (k < n && followers(battle, unit).length < followerCap) {
      const stones = stonesOf(battle, unit);
      const cand = [];
      sides.forEach(([dr, dc], idx) => {
        const r = s.tileR + dr, c = s.tileC + dc;
        const cls = followerClass(battle, r, c, stones);
        if (cls != null) cand.push([r, c, enemiesOnTile(battle, r, c).length ? 0 : 1, cls, idx]);
      });
      cand.sort((a, b) => a[2] - b[2] || a[3] - b[3] || a[4] - b[4]);
      if (!cand.length || !placeFollower(battle, unit, cand[0][0], cand[0][1])) break;
      k++;
    }
    return k;
  };
  /** A stone from the stock on (r, c) ("manual" deployment), then its 跟子 (`extra` of them). */
  const deployStone = (battle, unit, r, c, extra = 1) => {
    // a deployment from the stock pays the stone's DP cost (卫戍协议 has in-battle DP: 10, +1/s — the same pool the
    // automatic operator redeploys use)
    const ps = battle.getPlayer(unit.ownerId);
    const cost = num(stoneStats(battle, unit).cost, 3);
    if (!ps || ps.dp + 1e-9 < cost) return null;
    const tdef = stoneDef(battle, unit);
    const s = tdef ? battle.spawnToken(unit, STONE_ID, r, c, { anySource: true, kit: placedStoneKit(tdef) }) : null;
    if (!s) return null;
    ps.dp = Math.max(0, ps.dp - num(s.base.cost, cost)); // the deployed stone's own cost (TRP-X module: −1), as Battle.redeploy
    battle.fx('summon', { x: s.x, y: s.y, id: s.id });
    st(unit).stock--;
    s.mem.wangExtra = followAround(battle, unit, s, extra);
    return s;
  };
  /** S1 / S2 automatic deployment tile: free deployable, no enemy (trait), next to her stones (or her), route first. */
  const autoTile = (battle, unit) => {
    const stones = stonesOf(battle, unit);
    const seeds = stones.length ? stones : [unit];
    const cand = [];
    for (const s of seeds) {
      for (const [dr, dc] of ORTHO) {
        const r = s.tileR + dr, c = s.tileC + dc;
        if (!battle.grid.inRect(r, c) || stoneAt(stones, r, c) || cand.some((x) => x[0] === r && x[1] === c)) continue;
        const t = battle.grid.tile(r, c);
        if (t.build === 'NONE' || battle.grid.isObstacle(r, c) || battle.unitAt(r, c) || battle.isReservedTile(r, c)) continue;
        if (walkersOnTile(battle, r, c).length) continue; // trait: only walking enemies block (_excludeOccupiedByWalkEnemy)
        const near = battle.enemies.filter((e) => e.alive).reduce((m, e) => Math.min(m, Math.hypot(e.x - c, e.y - r)), 99);
        cand.push([r, c, t.pass === 'ALL' && t.height === 'LOW' ? 0 : 1, near]);
      }
    }
    cand.sort((a, b) => a[2] - b[2] || a[3] - b[3]);
    return cand[0] || null;
  };
  const autoDeploy = (battle, unit) => {
    const s = st(unit);
    // consumed stones waiting to come back on their tiles go first (the player's layout), new ones only beyond them
    while (s.stock > 0 && !waitingOf(battle, unit).length && placed(battle, unit).length < s.fieldCap) {
      const t = autoTile(battle, unit);
      if (!t || !deployStone(battle, unit, t[0], t[1], 1)) break;
    }
  };
  /** "获得N枚棋子" (ChargeToken): charge = min(deckCap − hand, n) cards; returns the count above it. */
  const addOwned = (unit, n) => {
    const s = st(unit);
    const add = Math.max(0, Math.min(n, s.deckCap - s.stock));
    s.stock += add;
    return n - add;
  };
  const gain = (battle, unit, n) => {
    const s = st(unit);
    addOwned(unit, n);
    autoDeploy(battle, unit);
    syncSpLock(battle, unit);
  };
  return {
    skills: {
      // AUTO, no attack of their own: "立即获得两枚棋子" as soon as the SP is full (阻回 while the stock is full)
      skchr_wang_1: { kind: 'instant', trigger: { rule: 'SP_FULL' }, onStart({ battle, unit }) { gain(battle, unit, Math.max(1, num(bb.cnt, 2))); } },
      skchr_wang_2: { kind: 'instant', trigger: { rule: 'SP_FULL' }, onStart({ battle, unit }) { gain(battle, unit, Math.max(1, num(bb.cnt, 2))); } },
      skchr_wang_3: {
        kind: 'ammo', ammo: Math.max(1, num(bb.trigger_time, 20)),
        targeting: { rangeGrid: skillGridOf(def), showOwnRange: true },
        attack: { noAttack: true },
        onStart({ battle, unit }) {
          const s = st(unit);
          const seq = unit.deploySeq;
          const running = () => unit.deploySeq === seq && unit.skill?.active && unit.skill.id === 'skchr_wang_3';
          s.ammo = unit.skill.ammoLeft; // mirrored: SkillRuntime.end zeroes ammoLeft before onEnd (the refund needs it)
          // no stone placed in the prep at all: nothing is charged or placed and the skill never ends (user's observation
          // of the real game, 2026-10-06 — no deployment ever spends ammo or stones)
          if (!s.prepPlaced) return;
          // client: ChargeToken (min(max − remaining, cnt) cards), then InstantSpawn of the rest as 跟子, ≤ max_spawn_cnt
          // alive, on tiles of her range, no adjacency. Order: PRTS 技能3 备注 "触发第一天赋时，按照有敌人的>没有敌人的；不可部署地块>
          // 可部署地面地块>可部署高台地块的优先级生成" — enemy tiles first, each group by tile class (followerClass); among enemy
          // tiles of one class the enemy closest to its goal first (goalFirst, [추정] user decision 2026-10-06), the rest
          // random [ASSUMED: the client InstantSpawn selector (WangTileSelector SKILL_3_INSTANT, _alwaysRandomInTheEnd 0)
          // sorts natively — review 2026-10-06: the empty tiles were plain random, no class order]
          let over = addOwned(unit, Math.max(1, num(bb.cnt, 8)));
          const stones0 = stonesOf(battle, unit);
          const cand = [];
          goalFirst(battle, inRange(battle, unit).filter(stoneSelectable)).forEach((e, i) => {
            const r = Math.round(e.y), c = Math.round(e.x), cls = followerClass(battle, r, c, stones0);
            if (cls != null) cand.push([r, c, 0, cls, i]);
          });
          for (const k of unit.rangeKeys || []) {
            const r = Math.floor(k / COLS), c = k % COLS, cls = followerClass(battle, r, c, stones0);
            const foe = enemiesOnTile(battle, r, c).some(stoneSelectable);   // (already listed above, by goal) : random
            if (cls != null) cand.push([r, c, foe ? 0 : 1, cls, foe ? 1e6 : battle.rng()]);
          }
          cand.sort((a, b) => a[2] - b[2] || a[3] - b[3] || a[4] - b[4]);
          const tiles = cand.map(([r, c]) => [r, c]);
          for (const [r, c] of tiles) {
            if (over <= 0 || followers(battle, unit).length >= followerCap) break;
            if (followerClass(battle, r, c, stonesOf(battle, unit)) == null) continue;
            if (placeFollower(battle, unit, r, c)) over--;
          }
          // automatic "manual" deployments: a stone on an enemy tile of her range and a 跟子 on each placeable neighbour (≤ 4),
          // one ammo per 跟子 built (client SpawnTokenS3InSkill). It ends only when the stones (stock) or the ammo run out —
          // no self-stop while the field is full (it waits).
          const drop = () => {
            if (!running()) return false;
            if (s.stock <= 0) { unit.skill.end('stones'); return false; }
            // her used stones waiting to come back hold their slots (as in autoDeploy): a new stone beyond them would make
            // the comeback exceed the deploy limit, and tokens.js would withdraw a prep stone for good (review 2026-10-06)
            if (placed(battle, unit).length + waitingOf(battle, unit).length >= s.fieldCap) return false;
            const stones = stonesOf(battle, unit);
            // where she would put it by hand: an enemy tile of her range (closest to its goal first) — else (local patch 2026-10-06,
            // user report "S3 spends no ammo": enemies walking just outside her range never gave the stand-in a tile)
            // a free tile of her range on the ground routes, nearest to a living enemy, no walking enemy on it (trait)
            const tiles = goalFirst(battle, inRange(battle, unit).filter(stoneSelectable)).map((e) => [Math.round(e.y), Math.round(e.x)]);
            const alive = battle.enemies.filter((e) => e.alive && !e.hidden);
            if (alive.length) {
              const near = (r, c) => alive.reduce((m, e) => Math.min(m, Math.hypot(e.x - c, e.y - r)), 99);
              const extra = [];
              for (const k of unit.rangeKeys || []) {
                const r = Math.floor(k / COLS), c = k % COLS;
                if (!battle.grid.inRect(r, c) || walkersOnTile(battle, r, c).length) continue;
                const t = battle.grid.tile(r, c);
                extra.push([r, c, t.pass === 'ALL' && t.height === 'LOW' ? 0 : 1, near(r, c)]);
              }
              extra.sort((x, y) => x[2] - y[2] || x[3] - y[3]);
              tiles.push(...extra.map(([r, c]) => [r, c]));
            }
            for (const [r, c] of tiles) {
              if (!battle.grid.inRect(r, c) || stoneAt(stones, r, c) || battle.grid.isObstacle(r, c)) continue;
              const t = battle.grid.tile(r, c);
              // local patch (2026-10-06): the home tile of one of HER used stones waiting to come back does not hold the
              // deployment off (isReservedTile did: on a lane of prep stones every enemy tile was such a home, so S3 never
              // deployed and never spent ammo); that stone waits until its tile is free again
              if (t.build === 'NONE' || battle.unitAt(r, c) || reservedForOthers(battle, unit, r, c)) continue;
              const ammo = Math.max(0, Math.floor(num(unit.skill.ammoLeft, 0)));
              // the talent's 跟子 free + ≤ 3 extra for one ammo each (s3Followers / spendS3, user decision 2026-10-07,
              // W12 [ASSUMED reading]; formerly ≤ 4, every one paid — client SpawnTokenS3InSkill `_countEvent 4`)
              const stone = deployStone(battle, unit, r, c, s3Followers(ammo));
              if (!stone) continue;
              if (spendS3(unit, ammo, Math.max(0, stone.mem.wangExtra))) return true;
              if (s.stock <= 0 && unit.skill?.active) unit.skill.end('stones');
              return true;
            }
            return false;
          };
          drop();
          const job = battle.every(WANG_S3_PACE, () => { if (!running()) { job.cancel(); return; } drop(); }, { owner: unit });
        },
        onEnd({ unit }) {
          // the ammo left returns as stones (ammoLeft is already 0 here: the mirrored count)
          const s = st(unit);
          addOwned(unit, Math.max(0, Math.floor(num(s.ammo, 0))));
          s.ammo = 0;
        },
      },
    },
    talents: [
      { install(battle, unit) { // 铸子: the stock at the battle start (the placed stones stay as they are — no 跟子)
        // her placed 棋子 (hand pieces from the prep) run the stone kit: set up here, before the battle starts (formerly
        // content/index.js resolved kits/diy.js tokenKits; upstream's op-wang.js does the same as this)
        for (const t of battle.allyUnits) {
          if (t.kind !== 'token' || t.defId !== STONE_ID || t.ownerUnit !== unit || t.alive || t.deployed) continue;
          if (t.kit) battle.offOwner(t);
          battle._setupUnit(t, placedStoneKit(t.def));
        }
        battle.on('battleStart', () => {
          const ss = stoneLimits(battle, unit);
          const s = st(unit);
          s.deckCap = Math.max(1, num(ss.deckStack, 7));
          s.fieldCap = Math.max(1, num(ss.deployLimit, 6));
          // 卫戍协议 hands out the deploy limit (maxDeployCount, 6) as cards (PRTS 卫戍协议/帮助 "根据召唤物部署数量上限…发送等量
          // 召唤物至手牌区"): those placed stand, the rest are the stock
          const n = placed(battle, unit).length;
          s.prepPlaced = n;
          s.stock = Math.min(s.deckCap, Math.max(0, s.fieldCap - n));
          syncSpLock(battle, unit);
          battle.every(0.25, () => redeployUsed(battle, unit), { owner: unit }); // new stones only come with a skill (gain)
        }, { owner: unit });
        // 望 leaves the field (retreat / knock-out): every stone and 跟子 of hers dies (client die_to_kill_token,
        // ON_OWNER_FINISH → KillTokens). [ASSUMED] the placed stones are cards again and come back on their tiles,
        // for DP, once she stands again (redeployUsed waits for her)
        battle.on('death', (ctx) => {
          if (ctx.unit !== unit) return;
          for (const t of stonesOf(battle, unit)) {
            if (!isFollower(t)) t.mem.wangUsed = true;
            battle.retreat(t, { reason: 'expired', permanent: true });
          }
        }, { owner: unit, priority: -20 });
        // a placed stone used up by its trigger waits for its redeploy (a 跟子 — a projectile — is simply gone)
        battle.on('death', (ctx) => {
          const t = ctx.unit;
          if (!t || t.kind !== 'token' || t.defId !== STONE_ID || t.ownerUnit !== unit || isFollower(t) || !t.mem.wangUsed || battle.finished) return;
          t.removed = false;
          t.mem.respawnAt = battle.time + Math.max(0, num(t.base.respawnTime, 2));
        }, { owner: unit, priority: -10 });
      } },
    ],
  };
}

/** 棋子 / 跟子: a trap — untargetable, no damage taken, no attack; triggers when an enemy enters its area while activated. */
function wangStone(bb, raw, def) {
  const kit = {
    skill: {
      kind: 'passive',
      onTick({ battle, unit }) {
        const owner = unit.ownerUnit;
        if (!unit.alive || !owner) return;
        const stones = stonesOf(battle, owner);
        const links = ORTHO.filter(([dr, dc]) => stoneAt(stones, unit.tileR + dr, unit.tileC + dc));
        // 连星: a link direction, once seen, stays activated (PRTS 备注)
        const axes = unit.mem.axes || (unit.mem.axes = new Set());
        const nAxes = axes.size;
        for (const [dr] of links) axes.add(dr ? 'v' : 'h');
        // link fx (official ON_CUSTOM_TRIGGER wang_stone1_line_up): on activation and on each new link direction
        if (axes.size > nAxes) battle.fx('wangLink', { x: unit.x, y: unit.y, id: unit.id, axes: [...axes], first: !unit.mem.active, follower: isFollower(unit) });
        // 激活 and 料敌机先 stacks are latched (PRTS / namu): once linked a stone stays active, and keeps the longest
        // straight line it has seen (≤ max_trigger_cnt) after a linked stone leaves
        if (links.length) {
          unit.mem.active = true;
          unit.mem.line = Math.max(unit.mem.line ?? 0, lineCount(stones, unit));
        }
        if (!unit.mem.active) return;
        const wide = wangSkill(owner) === 'skchr_wang_3'; // S3 equipped: x-1 trigger / damage area
        // presence, checked every tick (user decision 2026-10-07, W2): an activated stone goes off whenever a selectable
        // enemy IS on its trigger area — one already standing there when it activates too, not only one entering it
        // (client sktok_wang_1/3 SkillTrigger `_minTargetNum 1`: a selector that finds ≥ 1 target [추정: polled])
        for (const e of battle.enemies) {
          if (!stoneSelectable(e)) continue;
          // a 跟子 checks the enemy's root tile (client _checkTargetRootTile); a stone its body on the tile
          const on = wide ? inArea(e, unit) : isFollower(unit) ? (Math.round(e.x) === unit.tileC && Math.round(e.y) === unit.tileR)
            : (e.hitArea ? bodyOnTile(e, unit.tileR, unit.tileC) : Math.abs(e.x - unit.tileC) <= 0.5 && Math.abs(e.y - unit.tileR) <= 0.5);
          if (!on) continue;
          trigger(battle, unit, owner, stones, e, wide, axes);
          // a trap is used up by its trigger (陷阱师 traps: "踩上去的第一个敌人会触发其效果"; the stone has an
          // ON_UNIT_DEAD sound) — its fx carries `consumed` so the client plays no knock-out sound
          unit.mem.wangUsed = true;
          battle.retreat(unit, { reason: 'expired', permanent: true });
          return;
        }
      },
    },
    trait: { noAttack: true },
    install(battle, unit) {
      // persistent + allowDead: the kit installs before the deployment (the unit is not alive yet — a plain buff was
      // refused, so stones were attacked and took damage)
      battle.addBuff(unit, { key: 'wang:stone', duration: Infinity, persist: true, allowDead: true, flags: { untargetable: true, invulnerable: true } });
    },
  };
  return kit;

  /**
   * The enemies a stone's blast selects on tiles (dr, dc) around it: Battle.enemiesInKeys with canTargetEnemy — the
   * engine's selection (no 隐匿 unless revealed, no untargetable; 沉睡 is 无敌 anyway), flyers included, a huge enemy's
   * body on any of the tiles (checklist: never loop battle.enemies to deal damage; review 2026-10-06).
   */
  function blastFoes(battle, unit, offsets) {
    const keys = [];
    for (const [dr, dc] of offsets) {
      const r = unit.tileR + dr, c = unit.tileC + dc;
      if (battle.grid.inRect(r, c)) keys.push(r * COLS + c);
    }
    return battle.enemiesInKeys(keys, unit, ANY);
  }
  function inArea(e, unit) {
    const r = Math.round(e.y), c = Math.round(e.x);
    return DIAMOND2.some(([dr, dc]) => unit.tileR + dr === r && unit.tileC + dc === c);
  }

  function trigger(battle, unit, owner, stones, e, wide, axes) {
    const tal = talentBb(owner.def?.raw ?? owner.def, 1);
    const n = Math.min(num(tal['attack@max_trigger_cnt'], 3), unit.mem.line ?? lineCount(stones, unit));
    const mul = 1 + num(tal['attack@per_atk_scale'], 0.1) * n;
    const resFlat = num(tal['attack@per_magic_resist_penetrate_fixed'], 9) * n;
    const atk = owner.s?.atk ?? unit.s.atk;
    const src = isFollower(unit) ? owner : unit; // a 跟子's damage comes from 望 (PRTS 备注)
    const sk = wangSkill(owner);
    // trigger / explosion fx: `skill` 1 | 2 | 3 = the effect of the stone (3 = S3 equipped, x-1 diamond), `axes` the
    // activated link directions (S2 line blast), `follower` = a 跟子; the stone is used up right after (`consumed`)
    battle.fx('zone', { x: unit.x, y: unit.y, id: unit.id, r: wide ? 2.5 : 0.6, dur: 0.6, consumed: true, token: STONE_ID,
      skill: wide ? 3 : sk === 'skchr_wang_2' ? 2 : 1, axes: [...axes], line: n, target: e.id, follower: isFollower(unit) });
    if (wide) {
      for (const v of blastFoes(battle, unit, DIAMOND2)) {
        battle.dealDamage(src, v, { amount: atk * num(bb.atk_scale, 3.2) * mul, type: 'arts', resIgnoreFlat: resFlat, isSkill: true, canDodge: false, tags: ['summon', 'trap'] });
      }
      return;
    }
    if (sk === 'skchr_wang_2') {
      // 连星: the enemies within 3 tiles on both sides along each activated link direction
      const span = Math.max(1, Math.floor(num(bb.tile_count, 6) / 2));
      const hit = new Set();
      for (const axis of axes) {
        const line = [];
        for (let d = -span; d <= span; d++) line.push(axis === 'h' ? [0, d] : [d, 0]);
        for (const v of blastFoes(battle, unit, line)) hit.add(v);
      }
      for (const v of hit) {
        battle.dealDamage(src, v, { amount: atk * num(bb.atk_scale, 4.8) * mul, type: 'arts', resIgnoreFlat: resFlat, isSkill: true, canDodge: false, tags: ['summon', 'trap'] });
        if (v.alive) addWangSlow(battle, owner, v, -Math.abs(num(bb.move_speed, -0.4)), num(bb.duration, 6));
      }
      return;
    }
    // 取势 (default): 停顿 + atk_scale × 望's ATK arts per second for `sluggish` s (independent stacks per trigger)
    const dur = num(bb.sluggish, 6.5), scale = num(bb.atk_scale, 1.2);
    battle.applyStatus(e, 'sluggish', { duration: dur, source: owner });
    // PRTS S1 备注: "由望依自身属性预计算伤害后、以无来源的形式施加给目标" — 无来源 (望 keeps the credit) for a stone's DoT; a
    // 跟子's damage keeps 望 as its source (client: the 跟子 is her projectile)
    // local patch (user report 2026-10-07 #5): every tick sounds — the client's wang_stone1_t[damage_audio] child buff
    // (triggerInterval 1, first at once) plays p_imp_stwctp_d on each trigger; `kitHit` is the sound-only fx (audio.js)
    const tick = (t) => {
      battle.fx('kitHit', { x: t.x, y: t.y, id: owner.id, k: 'wang:1' });
      battle.dealDamage(owner, t, { amount: atk * scale * mul, type: 'arts', resIgnoreFlat: resFlat, canDodge: false, ignoreSelect: true, sourceless: !isFollower(unit), tags: ['dot', 'trap'] });
    };
    // client buff: triggerInterval 1.0, waitFirstTriggerInterval false, lifetime 6.5 s → ticks at 0, 1, … 6 (7 in all)
    tick(e);
    if (e.alive) battle.addBuff(e, { key: 'wang:dot', refresh: 'independent', duration: dur, interval: 1, source: owner, visible: true, onTick: ({ unit: t }) => tick(t) });
  }
}

const WANG_SLOW_KEY = 'wang:slow';
/** 连星's move speed floor (PRTS S2 备注 「移动速度存在0.1数值下限」; PRTS 数值范围 移动速度 min 0.1). */
const WANG_SLOW_FLOOR = 0.1;
/**
 * 连星's slow (user decision 2026-10-07, W7): client BT wang_stone2_s — MOVE_SPEED `MULTIPLIER` with `disableOverride`
 * (every trigger its own modifier) — and PRTS S2 备注 「移动速度降低为直接乘算，可无限叠加，每层独立计时（但移动速度存在0.1数值
 * 下限）」: every application is its own stack with its own timer, none replaces another. 直接乘算 = PRTS 属性基本公式's
 * (1 + D_t) stage, whose percentages add up (「除最终乘算为变化数值之间相乘外，其余均为相加」; research/battle-mechanics-reference.md):
 * the stage is max(0, 1 + Σ move_speed), e.g. 0.6 / 0.2 / 0 for 1 / 2 / 3 stacks of −0.4 — upstream's addSlow model. The
 * floor: the enemy's move speed never drops under 0.1 through it (the stage is raised to 0.1 ÷ the speed the other effects
 * leave; nothing to raise when they stop it outright). One buff per enemy holds the stacks (`data.list`); shown as 'slow'.
 * Exported for the tests.
 */
export function addWangSlow(battle, src, e, value, duration) {
  if (!e?.alive || !(duration > 0) || !value) return null;
  const refresh = (unit, b) => {
    const now = battle.time;
    b.data.list = b.data.list.filter((x) => x.until > now + 1e-9);
    if (!b.data.list.length) { battle.removeBuff(unit, b); return; }
    const stage = Math.max(0, 1 + b.data.list.reduce((a, x) => a + x.v, 0));
    // the speed the other effects leave: (base + Σ moveFlat) × Π moveMul of the other buffs
    let flat = num(unit.base.moveSpeed, 0), mul = 1;
    for (const o of unit.buffs) {
      if (o === b || !o.mods) continue;
      if (typeof o.mods.moveFlat === 'number') flat += o.mods.moveFlat * o.stacks;
      if (typeof o.mods.moveMul === 'number') mul *= Math.pow(o.mods.moveMul, o.stacks);
    }
    const others = flat * mul;
    const m = others > 1e-9 ? Math.max(stage, Math.min(1, WANG_SLOW_FLOOR / others)) : stage;
    if (b.mods?.moveMul !== m) { b.mods = { moveMul: m }; unit.markDirty(); }
  };
  let b = e.buffs.find((x) => x.key === WANG_SLOW_KEY);
  if (!b) {
    b = battle.addBuff(e, { key: WANG_SLOW_KEY, status: 'slow', source: src, tags: ['skill'], data: { list: [] }, mods: { moveMul: 1 },
      onTick: ({ unit, buff }) => refresh(unit, buff) });
  }
  if (!b) return null;
  b.data.list.push({ v: value, until: battle.time + duration });
  refresh(e, b);
  return b;
}

/** The kit of a placed 棋子 (a hand piece; not a 跟子): under the stone deploy limit (content/tokens.js, `fromTokens`). */
function placedStoneKit(tdef) {
  const k = wangStone(tdef?.skill?.bb ?? {}, tdef?.raw ?? tdef ?? {}, tdef ?? null);
  k.fromTokens = true;
  return k;
}

export default {
  char_2027_wang: (bb, chess, def) => wang(bb, chess, def),
};
