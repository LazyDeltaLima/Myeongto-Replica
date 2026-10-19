// server/sim/constants.js — simulation timing, conversions and tuning knobs (DESIGN §3, §4, §5).
// Pure data; every value here is safe to tweak for balancing. Nothing in the sim reads wall-clock time.

import { GEO } from '../../shared/constants.js';

/** Fixed simulation step in game seconds (DESIGN §4). */
export const TICK = 1 / 30;
/** Snapshots are produced every N ticks by the match (20 Hz at 2× real time). */
export const SNAPSHOT_EVERY = 3;

export const ROWS = GEO.ROWS;
/** The stage width (21): the mirrored right side of a pair field maps col → STAGE_COLS − 1 − col (DESIGN §3). */
export const STAGE_COLS = GEO.COLS;
/**
 * The battle grid's width: room for the widest 联防 field of the 8-player mode (GEO.WIDE_COLS, server/sim/wideStage.js);
 * every other field uses the stage's 21 columns of it, the rest is off the stage. A tile key is row × COLS + col.
 */
export const COLS = GEO.WIDE_COLS;

/** tilesPerSecond = moveSpeed × MOVE_SCALE (DESIGN §3). */
export const MOVE_SCALE = 0.5;
/**
 * An unblocked ranged enemy stands for each attack's clip (ai.js attackStand, GitHub #58); one whose model has no attack
 * clip known (no `attackAnim` in data/enemies.json) stands this long after each attack instead, as do all after an
 * attack 麻痹 interrupts (DESIGN §5.5).
 */
export const ATTACK_PAUSE = 0.35;
/**
 * The shortest clip scale of a normal attack (a swing never plays its clip faster than 10×): client constant
 * `AbstractAnimatedAbility.MIN_ANIM_SCALE` 0.1, read by `AbstractAnimatedAbility.UpdatePlaybackSpeed` (ai.js attackTiming).
 */
export const MIN_ANIM_SCALE = 0.1;
/**
 * Collider radius of an allied unit (PRTS 作战机制 §碰撞体积与位置识别: "我方干员碰撞体积基本均为以0.25格为半径的圆形" —
 * "关于碰撞体积与远程索敌，碰撞箱碰撞是为最常用的方式，索敌抬手等均使用碰撞箱"; the Ifrit 0.1 collider example). A ranged enemy's
 * normal attack takes an ally whose collider touches its range circle: centre distance ≤ rangeRadius + this
 * (ai.js enemyAttack; user playtest #6 follow-up — 萨卡兹枯朽战车's 2.2 reaches 2.45). [ASSUMED] every ally, summons
 * included; enemy skills / zones of content keep their own (point) radius.
 */
export const ALLY_COLLIDER_RADIUS = 0.25;
/**
 * Collider radius of an enemy (a regular one: a huge enemy's hit rectangle is its collider, body.js). The official
 * client gives the enemy prefabs' root a trigger CircleCollider2D of radius 0.1 on the ENEMY layer, and an operator's
 * normal-attack search (`RangeSelector` → `PhysicsRange` → `Physics2D.OverlapAreaNonAlloc` with the range's tile boxes)
 * returns every enemy whose circle overlaps a box (PRTS 作战机制, above: "索敌抬手等均使用碰撞箱"; client disassembly,
 * maintainer's notes): an attack range and a skill's attack range take an enemy within 0.1 of one of their tiles
 * (body.js colliderKeys / bodyInRange, Battle.enemiesInKeys; maintainer decision 2026-10-17). A skill's AUTO-TRIGGER
 * check of its range tiles (`LitePhysicsUtil._CheckContainsPosition`: the position's tile) and the tile rules the
 * client runs on the enemy's current tile (terrain, tile listeners such as burning or snowy ground, tile selectors,
 * "所在格" effects) keep the point — Battle.enemiesOnTiles, body.js bodyInKeys —; a trap or mark whose client effect is a
 * range selector (瑕光 S2's own tile, 琳琅诗怀雅's bomb, 克莱门莎 S3, 望's stones) takes the collider; blocking and splash
 * keep the position (中点判定).
 */
export const ENEMY_COLLIDER_RADIUS = 0.1;
/**
 * Block contact (PRTS 游戏数据基础 §阻挡半径; 作战机制 §碰撞体积与位置识别 "中点判定 … 案例: 阻挡"): an unblocked enemy whose
 * position lies within the blocker's radius of the blocker's centre touches it — compared on squared distances, as the
 * official client does. Ground blocking 0.70709997 (² 0.49999037); air blocking (起飞 / blockFly units against flyers)
 * 0.8944 (² 0.79995137); devices override it (阻隔工事 / 障碍物 0.4472). Used by Battle._checkBlock (user playtest #5).
 */
export const BLOCK_RADIUS = Object.freeze({ ground: 0.70709997, fly: 0.8944, device: 0.4472 });
export const BLOCK_RADIUS_SQ = Object.freeze({ ground: 0.49999037, fly: 0.79995137, device: 0.4472 * 0.4472 });
/**
 * An enemy's 隐匿 after a block ends (s): PRTS 作战机制 §隐匿 "对于绝大部分可隐匿的敌人而言，在被我方单位阻挡后会解除隐匿，不被
 * 阻挡的3秒后重新进入隐匿" / §隐匿与Buff的关系 "阻挡状态解除后3s开关重新被开启而恢复隐匿". An enemy page's "（解除阻挡N秒后
 * 恢复）" overrides it per 隐匿 source (buff `data.stealthRestore`: content/enemies/helpers.js STEALTH_RESTORE_BY_KEY). Battle._stealthSwitch; our
 * operators' 隐匿 / 迷彩 are never lifted by blocking ("我方干员并不会因为阻挡而解除隐匿").
 */
export const STEALTH_RESTORE = 3;
/** Default projectile speed in tiles/s for ranged operators/enemies. */
export const PROJECTILE_SPEED = 12;
/**
 * Projectile speeds per visual kind (tiles/s): an operator's shot the extract does not know (ai.js opShot — data/chess.json
 * `shot` gives the official one), a token's, a device's, an enemy's not read (`enemy`). `none`/`beam` are instant. `boomerang` (回环射手 跃跃) is the OUTBOUND
 * flight to the target — PRTS 跃跃 特性 note "投射物飞行速度15，返回时飞行速度3.75"; the way back is
 * BOOMERANG_RETURN_SPEED (ai.js throwBoomerang). `droneBomb` = 暴鸰's bomb (the official projectile_bombd `_speed` 5;
 * content/enemies/fly.js kitBombd).
 */
export const PROJECTILE_SPEEDS = Object.freeze({ arrow: 14, bolt: 11, bomb: 8, lob: 8, orb: 10, drone: 16, enemy: 10, boomerang: 15, droneBomb: 5 });
/** 回环射手: speed (tiles/s) of a boomerang flying back from its hit point to its thrower (PRTS "返回时飞行速度3.75"). */
export const BOOMERANG_RETURN_SPEED = 3.75;

/** Minimum damage ratio after mitigation (5 % of the pre-mitigation amount). */
export const MIN_DAMAGE_RATIO = 0.05;

/** Element gauge capacity of operators and normal/elite enemies; leaders (rank BOSS) hold 2000 (ba.dt.*2). */
export const ELEMENT_GAUGE_MAX = 1000;
export const ELEMENT_GAUGE_MAX_LEADER = 2000;
/**
 * Element names with a gauge on every unit (凋亡 is `apoptosis`). The engine's own fifth gauge `necrosis` (12 s of 100 true
 * damage/s and ATK −20 % — no official element: the client's `ElementType` is SANITY / WATER / FIRE / DARK) was removed
 * by the maintainer decision of 2026-10-11 (docs/rules/sim.md 「자작 원소 necrosis 삭제」).
 */
export const ELEMENTS = Object.freeze(['burn', 'neural', 'apoptosis', 'erosion']);
/**
 * Element bursts — official term table (gamedata_const termDescriptionDict):
 *   `ally` = an operator/summon hit by enemy damage (ba.dt.burning / neural / apoptosis / erosion),
 *   `enemy` = an enemy hit by operators (the "·我方" terms ba.dt.burning2 / neural2 / apoptosis2 / erosion2;
 *   `elemDamage` is 元素伤害: HP damage through 元素抗性 instead of DEF/RES, × elementalTakenMul = 元素脆弱).
 * Burst damage is 无来源 (PRTS 元素): no damage-dealt multiplier or penetration of the unit that filled the gauge.
 * `duration` = the burst's 爆发冷却 (PRTS 元素 table "持续时间": 10 s, 凋亡 15 s, 侵蚀 on enemies 8 s — the operators'
 * 侵蚀 burst has its 10 s cooldown too): while it runs NO element of the unit fills or recovers, and when it ends every
 * gauge of the unit resets (damage.js).
 */
export const ELEMENT = Object.freeze({
  burn: Object.freeze({
    burstDamage: 1200, burstType: 'arts', resDown: 20, duration: 10,
    ally: Object.freeze({ damage: 1200, type: 'arts', resDown: 20, duration: 10 }),
    enemy: Object.freeze({ elemDamage: 7000, resDown: 20, duration: 10 }),
  }),
  neural: Object.freeze({
    burstDamage: 1000, burstType: 'true', stun: 10, duration: 10,
    ally: Object.freeze({ damage: 1000, type: 'true', stun: 10, duration: 10 }),
    enemy: Object.freeze({ elemDamage: 6000, palsy: 3, duration: 10 }),
  }),
  apoptosis: Object.freeze({
    dps: 100, duration: 15,
    ally: Object.freeze({ dps: 100, dpsType: 'arts', spLossPerSec: 1, duration: 15 }),
    enemy: Object.freeze({ elemDps: 800, weaken: 0.5, duration: 15 }),
  }),
  erosion: Object.freeze({
    ally: Object.freeze({ damage: 800, type: 'phys', defDown: 100, duration: 10 }),
    enemy: Object.freeze({ elemDamage: 5000, defDown: 120, duration: 8 }),
  }),
});
/**
 * Official element order (PRTS 元素: SANITY 1 神经, WATER 2 侵蚀, FIRE 3 灼燃, DARK 4 凋亡):
 * the tie-break of the "当前损伤元素" a unit shows — the fullest gauge, then the lower id (damage.js elementView).
 */
export const ELEMENT_ORDER = Object.freeze(['neural', 'erosion', 'burn', 'apoptosis']);
/** 麻痹 (ba.palsy): each stack cancels one normal attack of an enemy; at most 3 stacks, lasts until consumed. */
export const PALSY_MAX = 3;
/**
 * 麻痹震颤: an enemy whose attack 麻痹 interrupted neither moves nor starts an attack for this long — melee, ranged, blocked
 * or not (client code `Enemy.States.PalsyState.OnTick`: it stays while its `palsying` buff holds; a stun / freeze / 浮空
 * takes over). [ASSUMED] the length: `palsying` is a buff of the client's buff table, which the client files we read do
 * not hold — PRTS 术语释义 麻痹 「进入0.5秒的麻痹震颤状态」.
 */
export const PALSY_STOP = 0.5;

/**
 * Push / pull (位移; user playtest #6 item 14). The 受力等级 is the source's 力度 minus the target's current 重量等级
 * (massLevel, 失重 counts) — PRTS 游戏数据基础 §重量公式 (力度: 微小力 −1, 小力 0, 中力 1, 较大力 2, 大力 3, 大力+1 4, 特大力
 * 5) and PRTS 推与拉. PUSH_TILES = the official push distance per 受力等级 (游戏数据基础 "推力-位移近似对应表": ≤ −3 → 0,
 * −2 → 0.12, −1 → 0.44, 0 → 1.7, 1 → 2.14, 2 → 2.96, ≥ 3 → 3.53 tiles). Pulls (拖拽 / 捕网, "拉力-位移近似对应表"):
 * ≥ 0 → all the way to the pull point (必定拉至身前), −1 → PULL_WEAK_SHARE of the starting distance, −2 → PULL_CRAWL
 * tiles, ≤ −3 → nothing. A pull "至面前" aims at the point PULL_ORIGIN tiles in front of the puller (拉力起点 "干员前方0.5格
 * 距离处") and stops once the target is within PULL_STOP_RADIUS of the puller's centre (急停 "拖拽者中心半径0.6708").
 * A directional push (推击手, 野鬃 S2 — the client buff template knockback[dir] —, 朝部署方向) on a target more than 45°
 * off the direction or nearer than PUSH_DIRECTIONAL_MIN_DIST becomes radial with 受力等级 −2 (推与拉 "特殊修正";
 * knockback[dir] _decreaseForceLevelWhenNotInDirection 2).
 * PRTS 推与拉 gives two columns of 理想移动距离: 弹道 (a push carried by a projectile — "温蒂的23技能、阿消的12技能"; equal
 * to the 游戏数据基础 table above) and 特效 (an effect push, one frame less of travel — "食铁兽的12技能、见行者的12技能"):
 * PUSH_TILES_EFFECT, used by the skills in PUSH_EFFECT_SKILLS (见行者 S1 护身射击 / S2 惊爆射击, the only 特效 pushers of
 * the pool PRTS names). [ASSUMED: every other push of the pool (野鬃, 山, 莫斯提马, 琳琅诗怀雅, 圣聆初雪, 薄绿) uses the 弹道
 * column — PRTS does not classify them; the two columns differ by 7–12 %.]
 */
export const PUSH_TILES = Object.freeze({ '-2': 0.12, '-1': 0.44, 0: 1.7, 1: 2.14, 2: 2.96, 3: 3.53 });
export const PUSH_TILES_EFFECT = Object.freeze({ '-2': 0.085, '-1': 0.374, 0: 1.562, 1: 1.987, 2: 2.773, 3: 3.331 });
export const PUSH_EFFECT_SKILLS = Object.freeze(new Set(['skchr_forcer_1', 'skchr_forcer_2']));
export const PULL_WEAK_SHARE = 0.35;
export const PULL_CRAWL = 0.03;
export const PULL_ORIGIN = 0.5;
export const PULL_STOP_RADIUS = 0.6708;
export const PUSH_DIRECTIONAL_MIN_DIST = 0.25;
/**
 * 失衡 (UNBALANCE) — the state machine a force > 0 puts an enemy in (PRTS 失衡位移机制 「当一名敌方单位受到一个任意来源的力，
 * 并且受力大小 > 0 时，该敌方单位将进入失衡（UNBALANCE）状态机」; 异常效果图鉴/失衡免疫 「失衡期间无法自主移动、发动攻击、使用技能」 —
 * not an abnormal status: 异常效果 「失衡…不属于异常效果，它是一种状态机」, so it is no stun). Its length in game seconds:
 * PUSH_UNBALANCE = a push by 受力等级 — PRTS 游戏数据基础 推力-位移近似对应表 「位移时间」 (whole frames at 30 fps: 6, 12, 24,
 * 27, 32, 35; the 0.1 s floor is inside them); PULL_UNBALANCE / PULL_UNBALANCE_WEAK = a pull's force window — 推与拉 §拉力
 * 「作用时间默认为 1 s；若本次受力等级 < −1，作用时间改为 0.5 s」, the state lasting to its end after the 急停 too (「目标将仍保持
 * 失衡状态至拉力作用时间结束为止」); UNBALANCE_MIN = the 失衡硬直 floor (「立刻拥有 0.1 s 的“失衡硬直”。此期间无法解除失衡状态机
 * ——哪怕已经没有被移动或者受力」) — what a 静态刚体 hit by a push gets (特殊机制 静态刚体 「失衡状态拥有 0.1 秒保底持续时间」; a pulled
 * one stays for the pull's window, its force lasting that long).
 * PR #392 by @xcdoge brought the state; its 0.6387·√tiles was derived from the page's μ = 0.5 单位假设, not printed.
 */
export const PUSH_UNBALANCE = Object.freeze({ '-2': 0.2, '-1': 0.4, 0: 0.8, 1: 0.9, 2: 32 / 30, 3: 35 / 30 });
export const PULL_UNBALANCE = 1;
export const PULL_UNBALANCE_WEAK = 0.5;
export const UNBALANCE_MIN = 0.1;

/**
 * Fallback freeze when a second 寒冷 lands and neither the remaining cold nor the incoming one has a duration
 * (Battle.applyStatus). A real duration uses max(remaining, incoming) — PRTS 术语释义 寒冷 「持续时间取双方之中最高」.
 */
export const COLD_FREEZE_DURATION = 3;
/** 浮空 (ba.levitate): the duration is halved on units heavier than this weight (massLevel). */
export const LEVITATE_HALF_WEIGHT = 3;
/** 抵抗 (ba.buffres): default share of a resisted status's duration that is removed (0.5 = 减半). */
export const RESIST_DEFAULT = 0.5;
/** 抵抗: a resisting unit loses one 麻痹 stack every RESIST_PALSY_DECAY seconds ("麻痹等状态每5秒流失1层"). */
export const RESIST_PALSY_DECAY = 5;
export const COLD_ASPD = -30;
export const FREEZE_RES_DOWN = 15;

/** Default DP rules (DESIGN §5.5), overridable by Battle opts.flags. */
export const DP_DEFAULTS = Object.freeze({ dpInit: 10, dpPerSec: 1, dpMax: 99 });
/**
 * The automatic skill operations (client code `AutoChessBattleTrigger`, maintainer decision 2026-10-11 — docs/rules/sim.md
 * 「스킬 범위 발동」): every AUTO_TRIGGER_INTERVAL s of battle time (`AutoTrigger`: `WaitForFixedSeconds(0.2)`) one pass
 * over the characters (`_TryTriggerAvailableSkills`): one whose block is running counts it down one and is skipped; the
 * first whose MANUAL skill casts gets BLOCK_SKILL_TICK passes of block and ends the pass — one automatic cast per pass in
 * the whole battle, the same character checked again on the 11th pass (≈ 2.2 s). Battle.js _autoTriggerPass,
 * skills.js autoTrigger. AUTO skills fire by their own rule and are not operations.
 */
export const AUTO_TRIGGER_INTERVAL = 0.2;
export const BLOCK_SKILL_TICK = 10;
/**
 * The block of the battle-start deployment, in seconds (`battle.flags.startOpCooldown`; PRTS 卫戍协议/帮助 "…作战开始时部署
 * 的单位将进入冷却") — BLOCK_SKILL_TICK passes [ASSUMED: no start block found in the client — `_OnUnitBorn` (0x7D6B30) only gives a TAKE_DAMAGE
 * character its on-hit buff;
 * until 2026-10-11 every automatic cast waited 3 s, PRTS 「自动操作具有3s冷却」].
 */
export const AUTO_OP_COOLDOWN = BLOCK_SKILL_TICK * AUTO_TRIGGER_INTERVAL;

// The battle-start deployment interval lives in shared/constants.js: the browser's audio.js times the 部署 line by it and
// can only import from /shared/ and /sim/ (this module is served as /sim/constants.js, not under its repository path).
export { PREBUILT_INTERVAL } from '../../shared/constants.js';
/**
 * State of a knocked-out operator waiting to redeploy on the tile it lies on (b.snap `down` entries, Battle.snapshot):
 * its respawn timer runs (COUNTING), then it waits for the player's DP to reach its cost (WAIT_DP) or for its tile to be
 * free (WAIT_TILE — a safeguard: no ally deploys on a body's tile, Battle.downOn). render/units.js mirrors these codes.
 */
export const DOWN_STATE = Object.freeze({ COUNTING: 0, WAIT_DP: 1, WAIT_TILE: 2 });
/**
 * Removal reason of an operator that enters a battle already knocked out: a 联防 helper's operator down at the end of
 * its own combat (PlayerBattleInput `carryState.down`; PRTS 卫戍协议/帮助 §联防阶段 "上一阶段为退场状态的干员强制退场").
 * Battle.start deploys it with everyone, then withdraws it at once with HP 0 — down on its own tile like a knocked-out
 * operator (Battle.isDown, b.snap `down`), its redeploy timer running from then — without the knock-out hooks (`kill`,
 * `death` with reason 'killed'), which fired in its own combat. render/app.js mirrors the string (no fall, no death
 * burst).
 */
export const FORCED_EXIT = 'forcedExit';

/** Safety cap for battles with an infinite time limit (boss rounds are force-ended by the match). */
export const MAX_BATTLE_TIME = 3600;
/** A battle that raised this many internal errors is force-ended as a timeout. */
export const MAX_INTERNAL_ERRORS = 200;

/** Time (s) a dead unit stays in snapshots with the DIE animation. */
export const DIE_ANIM_TIME = 0.8;
/** Time (s) the ATTACK / DEPLOY animation code is reported after the action. */
export const ATTACK_ANIM_TIME = 0.35;
export const DEPLOY_ANIM_TIME = 0.5;

/** Stage devices that act as ground obstacles for pathing (阻隔工事). */
export const OBSTACLE_DEVICES = Object.freeze({ trap_1105_accrate: { hp: 100, name: '阻隔工事' } });

/**
 * ASPD (攻击速度) clamps for every unit. The attribute's floor is 20 (PRTS 数值范围: ATTACK_SPEED 默认下限 20; 游戏数据基础
 * "攻击速度属性实际被限制了下限为20" — so two −50 slows on base 100 leave ASPD 20, interval = 5 × BAT, not 10 × BAT; user
 * playtest #6 item 17). The interval formula's own 10–600 clamp ("参与攻击间隔计算时会被限定在10~600以内") then only binds
 * at the top.
 */
export const ASPD_MIN = 20;
export const ASPD_MAX = 600;

/**
 * 移动速度 floor for a unit that walks at all (PRTS 数值范围: MOVE_SPEED 最小 0.1): slows, MULTIPLIER stacks and other cuts never
 * take the attribute below it (伊利昂的木驮兽 with 5 passengers: 1 + 5 × (−0.2) = 0 → 0.1). A unit held by a noMove state
 * (束缚, 地面束缚, a form change) stays at its own value, 0 for those: movement stops on the flag first (ai.js).
 */
export const MOVE_SPEED_MIN = 0.1;

/** Client event buffer cap (events are dropped oldest-first beyond this when nobody drains). */
export const EVENT_BUFFER_CAP = 50000;

/** Nested hook emits deeper than this are skipped (content recursion, e.g. a `damaged` handler dealing damage). */
export const MAX_HOOK_DEPTH = 32;
/** spawnEnemy refuses to exceed this many living enemies on one field (runaway content spawn loops). */
export const MAX_ALIVE_ENEMIES = 600;

/** Heal-over-time / regen events are aggregated and only emitted when they reach this amount. */
export const REGEN_EVENT_MIN = 1;

/**
 * How far inside the field rectangle an enemy is held (tiles; Battle._clampPos). The rectangle's edge lies exactly
 * halfway between two tiles, where the tile of a position — rounded half to even (body.js; PRTS 作战机制 四舍六入五成双)
 * — would depend on whether the row / column number is even. Held this little inside, an enemy at the edge is always on
 * the edge tile. 2^-20 (about a millionth of a tile) is exact in binary and far above the rounding error of a position,
 * yet too small to change a slide of 0.1-tile steps against the edge.
 */
export const FIELD_EDGE_INSET = 1 / 1048576;

/** Row offset mapping board rows (9..12) onto boss-field rows (2..5). */
export const BOSS_ROW_OFFSET = -7;

/**
 * Shared boss pool (Final Assault / Hidden Core): a pool holding less than this many HP is empty — the hit that would
 * leave less takes the rest (server SharedBossPool, browser LocalBossPool) and a browser pool reading below it is 0.
 * Pool HP is a float: the server subtracts each field's reported damage per player, the browser shows `server hp −
 * unacknowledged local damage`, and their rounding could leave dust (3.6e-12) that no hit could remove — the local
 * cumulative counter absorbed it — so the leader stood at "0 HP" until the overtime drain ended the run (user playtest
 * #6 item 5). With the rule a pool always reads 0 or at least 1 HP: 0 on the HUD = the leader is down.
 */
export const BOSS_POOL_MIN_HP = 1;

/**
 * How the percentage attribute bonuses (ATK / DEF / max HP "+X%") of the 卫戍 systems combine: 盟约, 策略, 装备, the
 * 机变 cards and the per-layer 特质 (garrisons' 每叠加N层 …+X%). Official: PRTS 卫戍协议：盟约 下半/PRTS盟约记录 "盟约效果，
 * 策略效果，装备效果提供的属性加成均为直接乘算"; 直接乘算 is the modifier class whose values are SUMMED with every other
 * 直接乘算 — a skill's "攻击力+X%" included — before multiplying (PRTS 游戏数据基础 属性基本公式 "直接乘算结果 D_t = t₁ + t₂ +
 * … + tₙ", A = (A₀ + D_p)(1 + D_t); PRTS 作战机制 X₂ = X₁(1 + b₁% + b₂%)). 'add' = that rule: the engine's additive
 * atkPct / defPct / hpPct (content/support directMods). 'multiply' = the v2.5 reading (each source its own ×(1 + x)
 * atkMul / defMul / hpMul), which compounded: at 600 精准 layers a ranged operator with four more such bonuses dealt
 * ×74 instead of ×12 and Final Assault leaders fell in seconds (user report after playtest #6). "提升至X%/X倍" effects
 * (炎佑 ×1.5, 攻击海怪敌人时攻击力提升至150%) and the char_attribute_mul 特质 (+20 % / +25 % on the chess itself, a rune on
 * the base attributes) stay multipliers.
 */
export const DIRECT_BONUS_STACKING = 'add';

/** 链术师 jump radius (PRTS 溅射半径一览, 特性: "链术师 … 1.7"; 1.8 until 0.1.1). */
export const CHAIN_RADIUS = 1.7;
