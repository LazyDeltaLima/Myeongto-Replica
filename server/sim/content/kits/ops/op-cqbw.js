// server/sim/content/kits/ops/op-cqbw.js — W (char_113_cqbw) 自选 operator kit: 6★ 炮手 (狙击), an owned-6★ pick of the
// tier-5 and tier-6 自选 slots; every skill, both talents, the trait, both modules (ART-X “佣兵的行囊”, ART-Y “刺棱钝刃”) at
// every form, and the kit of her summon “此面向敌” (token_10008_cqbw_box). Kit contract and the 自选 rules: ../README.md
// ("How to add an operator (自选)").
//
// Forms (data/backups.json units.char_113_cqbw, the DIY slot statuses): normal = E2 Lv1, skills at rank 4, no module;
// elite = E2 Lv60, rank 7, the picked module at stage 1 (tier 5) or 3 (tier 6) — the owner's decision of 2026-10-05.
// Full potential (the owner's decision of 2026-10-07). Sources: character_table / skill_table / battle_equip_table and the token record
// (zh_CN, as built into backups.json); PRTS W, 此面向敌 and 溅射半径一览 (the 备注 quoted below); the client's skill prefabs
// ([uc]skills skchr_cqbw_1 / 2 / 3, sktok_cqbw_token) and buff templates (cqbw_t_1, cqbw_t_2, cqbw_e_dmg,
// cqbw_e_sp[kill_with_projectile] / [kill_with_token], cqbw_e_003_t).
// - Trait (炮手) "攻击造成群体物理伤害": ranged physical, every enemy within SPLASH of the struck one takes the hit in full
//   (the aoesniper profile), air units too (data canHitFly); her 3-10, blocks 1, ground enemies target her (no flag).
//   PRTS 溅射半径一览 gives the 炮手 1.0 — the profile keeps the 扩散术师's 1.1 — so the kit's trait sets 1.0.
// - Module ART-X “佣兵的行囊” "攻击被阻挡的敌人时攻击力提升至110%" (trait bb atk_scale; cqbw_e_dmg: AtkScaleUp on every damage
//   she calculates, the cached D12 bombs included, when the target is blocked): ×atk_scale on her damage to a blocked
//   enemy — D12 only while she is on the field (PRTS "撤退W…炸弹无法享受W的天赋、模组的增益"); the module's token part gives
//   此面向敌 the same (its trait atk_scale, below). Stage 2+ changes 落井下石 (below).
// - Module ART-Y “刺棱钝刃” "攻击时无视敌人100点的防御力" (def_penetrate_fixed): defIgnoreFlat on her damage (D12 is 无来源, so
//   no source penetration reaches it — the engine's sourceless rule, PRTS 伤害分类). Stage 2+ changes 设伏 (below).
// - T1 设伏 "在战场停留10秒后获得60%的物理和法术闪避，且不容易成为敌人的攻击目标" (cqbw_t_1: the evade buff with taunt level −1,
//   lifetime ∞): `interval` s after each deployment, dodgePhys / dodgeArts `prob` and taunt taunt_level until she leaves.
//   ART-Y stage 3: 8 s, plus the hidden talent 2 (cqbw_e_003_t; PRTS 备注 "部署后每秒获得一层永久的攻击力提升效果（…3级时每层
//   1.25%攻击力，上限16层），受到伤害时…清空攻击力提升效果"): one stack of ATK +atk (直接乘算) every second from her deployment,
//   at most max_stack_cnt, all cleared by any damage she takes — cqbw_e_003_t ON_TAKE_DAMAGE `IfModifierTarget` (refuses a
//   damage already cancelled) → FinishDerivedBuff. Its buff is gained at her deployment, so its graph runs before those of
//   the buffs she gains later (same event priority ⇒ gained order): a hit a shield absorbs and a hit 设伏 dodges clear it;
//   a 无敌 one (cancelled before any buff) does not; a 流失 and an element 损伤 (no ON_TAKE_DAMAGE) neither.
// - T2 落井下石 "攻击范围内的敌人在被晕眩时受到的物理伤害+18%" (full potential: +21%; cqbw_t_2 on the enemies of her range:
//   ON_TAKE_DAMAGE, STUNNED, DamageScale PHYSICAL): any physical damage, whoever deals it, on an enemy standing in her
//   attack range while it is 晕眩 (the catalogue stun — not 冻结 / 浮空) ×damage_scale; two W keep the strongest (同名 buff).
//   ART-X stage 2+ (+27 % at stage 3, full potential) adds "击倒敌人时获得1点技力" — PRTS 修正 "被自身的远程攻击击倒时" and
//   备注 "当受天赋影响的单位被W的弹道（包括D12的炸弹）击倒，W将恢复1点技力（无视阻回）…当此面向敌击倒敌人时，不论该敌人是否受天赋效果
//   影响，也会令W获得1点技力（无视阻回）": +sp SP (forced) when her projectile — a normal attack, 红桃K, a D12 bomb — knocks out an
//   enemy of her range, or one of her mines knocks out any enemy.
// - S1 红桃K (MANUAL, data DEFAULT): "立即发射一枚榴弹…并使命中目标晕眩" — a CastSkill with its Skill state (`_switchToState` 1:
//   the cast cuts her swing and she does not attack through `Skill_1`, scaled to her attack interval; `_shouldCastLikeAttack`
//   only counts it as an attack for attack-triggered talents): the target is taken as the cast starts (`_selectTargetTiming` 0,
//   `_postFilter` HATRED_DES, one target), the grenade (`projectile_chr_cqbw_s1`, speed 8) leaves on the clip's OnAttack frame:
//   atk_scale × ATK physical to every enemy within GRENADE_RADIUS (PRTS 备注 "榴弹爆炸范围半径为1.2") of where it lands, air
//   units too (`_targetMotion` 3), each stunned `stun` s after its hit.
// - S2 惊吓盒子 (AUTO, data DEFAULT — "下次攻击变为…埋下地雷"): the attack it is cast for plants a 此面向敌 on a free deployable
//   tile of her range instead (melee or ranged: 此面向敌 "部署位置=全部位"). PRTS 备注: "攻击范围内不存在可部署位时，技能不会
//   发动" (the cast is refused and keeps its SP — prefab `_cancelIfSearchTargetFailed`), "召唤物部署优先级：可选敌人中点所在
//   地块（按地块上所有可选敌人中最高仇恨值降序）>距离其它可选敌人最近地块>其它地块（随机排序）" — targetable ground enemies
//   (the selector's `_targetMotion` 1) — the skill prefab's TileSelector (BETTER_ENEMY_WITH_COLLIDER, `_alwaysRandomInTheEnd`;
//   tier1 betterEnemyTiles): 仇恨值 = the hatred order (HATRED_DES, her default target order); "其它可选敌人" = those of her
//   range, each in that order taking its nearest free tile (none when that one is taken); the rest drawn with battle.rng —
//   and "W撤退时撤退全部此面向敌" (her knock-out too: her CommonAbilities buff cqbw_c, template die_to_kill_token, runs
//   KillTokens ON_OWNER_FINISH — as she leaves the field for any reason). No cap on the mines [ASSUMED·no source: the token's
//   maxDeployCount 1 is its deck limit; no source caps what the skill lays].
//   此面向敌 (mineKit): no enemy selects it (the token prefab's `_category` 2 TRAP_OR_ITEM; selectors take `_targetCategory` 1 DEFAULT), blocks
//   nothing, no attack, lasts its talent `duration` (120 s). PRTS 此面向敌 备注 "受害者启动模式的触发及爆炸的半径均为1.35，触发后延迟1.5s
//   爆炸，不可对空", W 备注 "触发瞬间实时读取W的攻击力", 技能 备注 "该技能伤害会借用持有者的攻击力计算": a targetable ground
//   enemy within 1.35 arms it (W's ATK read then); 1.5 s later every targetable ground enemy within 1.35 takes atk_scale ×
//   that ATK physical (×its trait atk_scale on a blocked one: ART-X) and is stunned `stun` s; the mine is used up
//   (sktok_cqbw_token's suicide buff). The token skill's blackboard is the S2 blackboard of the form.
// - S3 D12 (MANUAL, data DEFAULT): a CastSkill with its Skill state, as S1, on `Skill_3`: the targets are taken and the ATK cached
//   as the cast starts (`_selectTargetTiming` 0, `_useCachedAtkOnly`), the max_target enemies of her range with the most HP
//   (`_postFilter` 15 HP_DES, current HP; air units too: `_targetMotion` 3). On the clip's OnAttack frame one bomb sticks to each
//   of them still alive, no flight (`projectile_chr_cqbw_s3`: `_immediatelyReach`, `_delayAfterReached`, `_delayTime` 3). PRTS 备注
//   "炸弹使用技能开启瞬间W的缓存攻击力，爆炸半径为1.2，延迟3s引爆，造成无来源的物理普通伤害…被安装炸弹的目标被击倒/离场，或进入重生/消失状态时，炸弹
//   会立刻提前引爆" (`_stopIfTargetDead`, `_stopIfTargetDisappeared`): BOMB_DELAY s later — at once when its target falls, leaves,
//   hides or turns 无敌 + 无法选中 (重生) — every targetable enemy within 1.2 of the bomb takes atk_scale × the cached ATK physical,
//   无来源 (credited to her), and is stunned `stun` s.

import { num, traitBb, skillRec, up, statBuff, betterEnemyTiles } from '../shared/tier1.js';
import { sortEnemyTargets } from '../../../targeting.js';
import { bodyInRange } from '../../../body.js';
import { hasHp, isHpLoss } from '../../../damage.js';
import { COLS } from '../../../constants.js';

const S1 = 'skchr_cqbw_1';
const S2 = 'skchr_cqbw_2';
const S3 = 'skchr_cqbw_3';
/** Her summon “此面向敌” (S2 惊吓盒子). */
export const MINE = 'token_10008_cqbw_box';
/** PRTS 溅射半径一览: 炮手 1.0. */
const SPLASH = 1.0;
/** PRTS S1 备注 "榴弹爆炸范围半径为1.2". */
const GRENADE_RADIUS = 1.2;
/** `projectile_chr_cqbw_s1` `_speed`. */
const GRENADE_SPEED = 8;
const GRENADE_TAG = 'cqbw:grenade';
/** PRTS 此面向敌 备注 "触发及爆炸的半径均为1.35，触发后延迟1.5s爆炸". */
const MINE_RADIUS = 1.35;
const MINE_DELAY = 1.5;
/** 此面向敌's lifetime when its token record carries none (token talent `duration`: 120 s). */
const MINE_LIFE = 120;
/** PRTS S3 备注 "爆炸半径为1.2，延迟3s引爆". */
const BOMB_RADIUS = 1.2;
const BOMB_DELAY = 3;
/** 设伏 ART-Y: one ATK stack every second from the deployment (PRTS 备注 "部署后每秒获得一层"). */
const RAMP_IV = 1;
const AMBUSH_KEY = 'cqbw_t_1[evade]';   // (the client key: the status path holds its overrideEffectKey cqbw_buff_01_start)
const RAMP_KEY = 'talent:cqbw:ramp';
const MINE_TAG = 'cqbw:mine';
const D12_TAG = 'cqbw:d12';
const GROUND = Object.freeze({ canHitFly: false });
const AIR = Object.freeze({ canHitFly: true });
/** 落井下石's factor already applied to a damage instance (two W on one field keep the strongest). */
const STUN_SCALED = new WeakMap();

const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
/** Talent of data index `i` of the composed record (ART-Y's hidden talent 2 has no name). */
const talentAt = (chess, i) => (chess?.talents ?? []).find((t) => t && t.index === i) ?? null;
/** First talent of a normalised token def holding `key` (token talents keep no index). */
const tokTalent = (def, key) => (def?.talents ?? []).find((t) => t && t.bb && t.bb[key] != null) ?? null;
/** A mine of `unit`. */
const isMineOf = (t, unit) => !!t && t.kind === 'token' && t.defId === MINE && t.ownerUnit === unit;
/** 晕眩 (cqbw_t_2 checks STUNNED: the catalogue stun, not 冻结 / 浮空). */
const stunned = (e) => e.hasBuff('stun');
/** D12's early burst: the target fell, left, hides (消失) or is 无敌 + 无法选中 (重生). */
const gone = (e) => !e || !e.alive || e.hidden || !!(e.s.flags.invulnerable && e.s.flags.untargetable);

/** The enemies of her range and the ones she blocks, by her target order (`_targetMotion` 3: air units too). */
function rangeFoes(battle, unit) {
  const pool = battle.enemiesInKeys(unit.rangeKeys, unit, AIR);
  for (const e of battle.blockedTargets(unit, AIR)) if (!pool.includes(e)) pool.push(e);
  sortEnemyTargets(battle, unit, pool, null);
  return pool;
}

/** Free deployable tiles of her current range (melee or ranged: 此面向敌 "部署位置=全部位"). */
function mineTiles(battle, unit) {
  const out = [];
  for (const k of unit.rangeKeys ?? []) {
    const r = Math.floor(k / COLS), c = k % COLS;
    if (!battle.grid.inRect(r, c) || !battle.grid.canStand(r, c, { ranged: true }) || battle.isReservedTile(r, c)) continue;
    out.push([r, c]);
  }
  return out;
}

/** The tile 惊吓盒子 plants on (the official TileSelector order: tier1 betterEnemyTiles), or null when her range has none free. */
function mineTile(battle, unit) {
  return betterEnemyTiles(battle, unit, mineTiles(battle, unit), 1, GROUND)[0] ?? null;
}

/**
 * 此面向敌's kit (header). `owner` = W, `def` = the token def of her pick (the S2 blackboard of the form; ART-X: the
 * token trait atk_scale).
 */
function mineKit(owner, def) {
  const sk = def?.skill?.bb ?? {};
  const scale = num(sk.atk_scale), stun = num(sk.stun);
  const blocked = num(def?.traitBb?.atk_scale, 1);
  return {
    skill: {
      kind: 'passive',
      onTick({ battle, unit }) {
        if (!unit.alive || unit.mem.armed) return;
        if (!battle.foesInRadius(unit.x, unit.y, MINE_RADIUS, true).some((e) => !e.isFlying)) return;
        unit.mem.armed = true;
        const atk = up(owner) ? owner.s.atk : 0; // 触发瞬间实时读取W的攻击力
        battle.fx('kitHit', { x: unit.x, y: unit.y, id: unit.id, src: owner.id, k: 'cqbw:mineArm' });
        battle.after(MINE_DELAY, () => {
          if (!unit.alive) return; // withdrawn meanwhile (W left the field, its time ran out)
          for (const e of battle.foesInRadius(unit.x, unit.y, MINE_RADIUS, true)) {
            if (e.isFlying) continue; // 不可对空
            const mul = blocked !== 1 && e.blockedBy ? blocked : 1;
            battle.dealDamage(unit, e, { amount: atk * scale * mul, type: 'phys', isSkill: true, tags: ['summon', MINE_TAG] });
            if (stun > 0 && hasHp(e)) battle.applyStatus(e, 'stun', { duration: stun, source: unit });
          }
          battle.fx('kitHit', { x: unit.x, y: unit.y, id: unit.id, src: owner.id, k: 'cqbw:mineHit' });
          battle.retreat(unit, { reason: 'expired', permanent: true });
        }, { owner: unit });
      },
    },
    trait: { noAttack: true },
  };
}

/**
 * D12: a bomb stuck to `e` (its cached ATK × scale, `blocked` = ART-X's factor while she stays on the field). It goes off
 * BOMB_DELAY s later, or at once when the target is gone.
 */
function plantBomb(battle, unit, e, cached, b3, blocked) {
  const scale = num(b3.atk_scale), stun = num(b3.stun);
  const burst = (x, y) => {
    const mul = up(unit) ? blocked : 1; // a withdrawn W lends her bombs no module
    battle.fx('kitHit', { x, y, id: unit.id, src: unit.id, target: e.id, k: 'cqbw:bombHit' });
    for (const v of battle.foesInRadius(x, y, BOMB_RADIUS, true)) {
      const m = mul !== 1 && v.blockedBy ? mul : 1;
      battle.dealDamage(unit, v, { amount: cached * scale * m, type: 'phys', sourceless: true, isSkill: true, tags: ['skill', D12_TAG] });
      if (stun > 0 && hasHp(v)) battle.applyStatus(v, 'stun', { duration: stun, source: unit });
    }
  };
  const spot = { x: e.x, y: e.y };
  let done = false, watch = null, timer = null;
  const fire = () => {
    if (done) return;
    done = true;
    if (watch) battle.off(watch);
    if (timer) timer.cancel();
    burst(spot.x, spot.y);
  };
  watch = battle.on('tick', () => {
    if (gone(e)) { fire(); return; }
    spot.x = e.x; spot.y = e.y;
  });
  timer = battle.after(BOMB_DELAY, () => { if (!gone(e)) { spot.x = e.x; spot.y = e.y; } fire(); });
  battle.fx('kitHit', { x: e.x, y: e.y, id: unit.id, src: unit.id, target: e.id, k: 'cqbw:bomb' });
}

export default {
  char_113_cqbw: (bb, chess) => {
    const t0 = talentAt(chess, 0)?.bb ?? {};     // 设伏 (ART-Y stage 3: interval 8)
    const ramp = talentAt(chess, 2)?.bb ?? {};   // ART-Y stage 3 hidden talent: atk / max_stack_cnt
    const t1 = talentAt(chess, 1)?.bb ?? {};     // 落井下石 (ART-X stage 2+: damage_scale, sp)
    const tb = traitBb(chess);                    // ART-X atk_scale · ART-Y def_penetrate_fixed
    const blocked = num(tb.atk_scale, 1);
    const b1 = bbOf(chess, S1), b3 = bbOf(chess, S3);
    return {
      trait: { splashRadius: SPLASH },
      skills: {
        [S1]: {
          kind: 'instant',
          onStart({ battle, unit, skill }) { skill.castPick = rangeFoes(battle, unit)[0] ?? null; },   // (`_selectTargetTiming` 0)
          onStrike({ battle, unit, skill }) {
            const e = skill.castPick;
            if (!e?.alive) return;
            const atk = unit.s.atk, scale = num(b1.atk_scale, 1), stun = num(b1.stun);
            battle.fx('kitHit', { x: e.x, y: e.y, id: unit.id, src: unit.id, target: e.id, k: 'cqbw:grenade' });
            battle.addProjectile({
              from: unit, target: e, speed: GRENADE_SPEED, visual: 'bomb', source: unit, hitDead: true,
              onHit: (c) => {
                for (const v of battle.foesInRadius(c.x, c.y, GRENADE_RADIUS, true)) {
                  battle.dealDamage(unit, v, { amount: atk * scale, type: 'phys', isAttack: true, isSkill: true, tags: ['skill', GRENADE_TAG] });
                  if (stun > 0 && hasHp(v)) battle.applyStatus(v, 'stun', { duration: stun, source: unit });
                }
              },
            });
          },
        },
        [S2]: {
          kind: 'instant',
          onStart({ battle, unit }) {
            const tile = mineTile(battle, unit);
            if (!tile) return; // (the activate guard below refuses such a cast)
            const def = battle.tokenDef(MINE, unit);
            const life = num(tokTalent(def, 'duration')?.bb?.duration, MINE_LIFE);
            const m = battle.spawnToken(unit, MINE, tile[0], tile[1], { kit: mineKit(unit, def), untargetable: true, duration: life });
            if (m) battle.fx('summon', { x: m.x, y: m.y, id: unit.id, token: MINE });
          },
        },
        [S3]: {
          kind: 'instant',
          onStart({ battle, unit, skill }) {   // (`_selectTargetTiming` 0)
            unit.mem.cqbwCached = unit.s.atk * unit.s.atkScaleMul; // 技能开启瞬间的缓存攻击力
            const n = Math.max(1, Math.floor(num(b3.max_target, 3)));
            const pool = rangeFoes(battle, unit);
            pool.sort((a, b) => b.hp - a.hp); // 生命值最多 (stable: her order breaks ties)
            skill.castPick = pool.slice(0, n);
          },
          onStrike({ battle, unit, skill }) {
            for (const e of skill.castPick) if (e.alive) plantBomb(battle, unit, e, unit.mem.cqbwCached, b3, blocked);
          },
        },
      },
      talents: [
        { install(battle, unit) { // 设伏 (+ ART-Y stage 3: ATK ramp, reset by damage)
          const iv = Math.max(0, num(t0.interval)), prob = num(t0.prob), taunt = num(t0.taunt_level);
          const per = num(ramp.atk), cap = Math.floor(num(ramp.max_stack_cnt));
          battle.on('deploy', (ctx) => {
            if (ctx.unit !== unit) return;
            const seq = unit.deploySeq;
            if (prob > 0 || taunt) {
              battle.after(iv, () => {
                if (!up(unit) || unit.deploySeq !== seq) return;
                battle.addBuff(unit, { key: AMBUSH_KEY, mods: { dodgePhys: prob, dodgeArts: prob, taunt }, tags: ['talent'], visible: true });
                battle.fx('buff', { x: unit.x, y: unit.y, id: unit.id, kind: 'cqbw:ambush' });
              }, { owner: unit });
            }
            if (per > 0 && cap > 0) {
              battle.every(RAMP_IV, (b, sched) => {
                if (!up(unit) || unit.deploySeq !== seq) { sched.cancel(); return; }
                battle.addBuff(unit, { key: RAMP_KEY, refresh: 'stack', maxStacks: cap, mods: { atkPct: per }, tags: ['talent'] });
              }, { owner: unit });
            }
          }, { owner: unit });
          if (per > 0 && cap > 0) {
            const clear = (ctx) => {
              if (ctx.target !== unit || ctx.dmg?.type === 'element' || isHpLoss(ctx.dmg)) return;
              if (unit.findBuff(RAMP_KEY)) battle.removeBuff(unit, RAMP_KEY);
            };
            battle.on('damaged', clear, { owner: unit });
            // her own dodge (设伏's evade, gained after cqbw_e_003_t, so its graph sees the hit first) clears it too
            battle.on('voidHit', (ctx) => { if (ctx.why === 'dodge') clear(ctx); }, { owner: unit });
          }
        } },
        { install(battle, unit) { // 落井下石 (+ ART-X stage 2+: SP on her projectiles' / mines' knock-outs)
          const scale = num(t1.damage_scale, 1), sp = num(t1.sp);
          if (scale !== 1) {
            battle.on('hit', (ctx) => {
              const e = ctx.target, d = ctx.dmg;
              if (!e || e.side !== 'enemy' || d.type !== 'phys' || !up(unit) || !stunned(e) || !bodyInRange(e, unit.rangeKeySet)) return;
              const prev = STUN_SCALED.get(d) ?? 1;
              if (!(scale > prev)) return;
              d.mul *= scale / prev;
              STUN_SCALED.set(d, scale);
            }, { owner: unit });
          }
          if (sp > 0) {
            battle.on('damaged', (ctx) => {
              const e = ctx.target, d = ctx.dmg;
              if (!e || e.side !== 'enemy' || !d || d.type === 'element' || hasHp(e) || !up(unit) || !unit.skill) return;
              const src = ctx.source;
              const shot = (src === unit && d.isAttack) || ((ctx.credit ?? src) === unit && d.tags?.includes(D12_TAG));
              if (isMineOf(src, unit) || (shot && bodyInRange(e, unit.rangeKeySet))) unit.skill.gainSp(sp, 'init'); // 无视阻回
            }, { owner: unit });
          }
        } },
      ],
      install(battle, unit) {
        const sid = unit.skill?.id;
        // ART-X: 攻击被阻挡的敌人时攻击力提升至110% (her own damage; D12 and the mines apply it themselves)
        if (blocked !== 1) {
          battle.on('hit', (ctx) => {
            const t = ctx.target;
            if (ctx.source !== unit || !t || t.side !== 'enemy' || !t.blockedBy || ctx.dmg.type === 'element') return;
            ctx.dmg.amount *= blocked;
          }, { owner: unit });
        }
        // ART-Y: 攻击时无视敌人100点的防御力
        statBuff(battle, unit, 'trait:cqbw:pierce', { defIgnoreFlat: num(tb.def_penetrate_fixed) });
        if (sid === S2) {
          // "攻击范围内不存在可部署位时，技能不会发动": every activation is refused while her range has no free deployable
          // tile — the SP stays (non-enumerable: never serialised; the pattern of 6_06 莎草)
          const sk = unit.skill;
          if (sk && !Object.prototype.hasOwnProperty.call(sk, 'activate')) {
            const activate = sk.activate;
            Object.defineProperty(sk, 'activate', {
              configurable: true, writable: true, enumerable: false,
              value(reason, opts) { return mineTiles(battle, unit).length ? activate.call(this, reason, opts) : false; },
            });
          }
          // W撤退时撤退全部此面向敌
          battle.on('death', (ctx) => {
            if (ctx.unit !== unit) return;
            for (const t of battle.allyUnits) if (t.alive && isMineOf(t, unit)) battle.retreat(t, { reason: 'expired', permanent: true });
          }, { owner: unit });
        }
      },
    };
  },
};
