// render/fxstatus.js — local patch (docs/LOCAL-PATCH.md 「전투 화면 UI」 ⑤): the official status effects on battle units.
//
// The client shows a status by an effect prefab, not an icon row (maintainer captures 9 / 10: a snowflake over 寒冷 enemies,
// the ice block of 冻结, a fist over 战栗; 隐匿 / 迷彩 have no icon). The prefabs live in battle/prefabs/effects/buff.ab and
// common.ab (extracted by tools/local-extract/fx_extract.py --bundle buff / common); each is a loop ( _isLoop 1) placed at
// its `_spawnLocation` (EN client data: 1 feet, 2 body / HIT point, 4 head, 5 ground centre). The sim status → prefab
// mapping is by the prefab names (the client builds them from the status — metadata COMMON_EFFECT_PREFIX; the mapping
// code is native) [추정 where marked]:
//   stun 晕眩 → buff_stun (head)              freeze 冻结 → buff_autochess_frozen (feet: the block around the model)
//   cold 寒冷 → buff_cold (head)              sleep 沉睡 → buff_sleep (body)
//   silence 沉默 → buff_silence (head)        fear 恐惧 → common_buff_fear (head)
//   tremble 战栗 → common_buff_thrill (head, the fist — maintainer capture 10)   disarm 缴械 → common_disarm_icon (head)
//   slow 减速 → buff_slowdown (feet)          sluggish 迟缓 → buff_sluggish (feet)
//   aspdDown → buff_attack_speed_reduction_01 (feet)   weaken 虚弱 → buff_weak (head)
//   defDown → buff_defdown (head)             resDown → buff_magic_resistance_down (head)
//   fragile 脆弱 (all kinds) → 'buff_ fragile_01' (feet)   levitate 浮空 → common_levitate_01 (ground)
//   stealth 隐匿 → common_invisible on both sides (feet; its ColorModifier greys the model to α .894 — units.js) —
//     local patch (maintainer report 2026-10-07: a big green leaf on 望's stone on an 排气格栅 tile): the leaf was
//     common_stealth (texture common_leaf), which only the 生息演算 buildings use (trap_405/406/459 talents' overrideEffectKey);
//     an operator's own 隐匿 is common_invisible (skchr_milu_1 overrideEffectKey, dynamicabilities Invisible) [추정: the
//     tile's 隐匿 the same]       camou 迷彩 → common_buff_micai_01 (body) [추정: _01 of the three]
//   lemuen:wanted 通缉 (蕾缪安's talent) → lemuen/lemuen_talent_buff_01 (head) [추정 height]
//   reed2:scorch 灼痕 (焰影苇草's talent) → reed2/reed2_debuff_01 (body) [추정 height]
//   talent:archet_shield 铁弦 (空弦's 护盾 layer) → archet/archet_buff_01_start (feet: its _spawnLocation 1)
// Beyond this table the client has no status effect of its own: every buff names its effect (`overrideEffectKey`, client
// `Entity.AddBuffEffect`), and a status with none shows nothing — no 无敌 / 束缚 / 护盾 / 嘲讽 badge (EN buff templates: 21
// of 46 INVINCIBLE buffs, 12 of 22 UNMOVABLE, 42 of 110 shield buffs carry none; `common_invincible_0N`,
// `common_unmovable_01`, `common_shield_01` belong to single enemies / one 装备 / 凯恩's S2). SOURCE_FX / KEY_FX / LAYER_FX / STACK_FX
// below draw the effects of the buffs this fork's statuses stand for, by the applier or the buff key
// (docs/rules/ui.md ⑤ 「버프 이펙트」). The drawn status icons (units.js _iconKeys) are only the fallback while the effect
// layer is off (quality 'low', no WebP, no extracted effects: `view._statusIcons`, maintainer decision 2026-10-14).
// Synced once per frame from the views' flags and 'status' keys (render/app.js).

import { UF } from '../../../shared/constants.js';
import { UF_CAMOU } from '../../../shared/local.js';
import { cite } from './fx/cite.js';
import { whenPlays } from './fx/conds.js';

/** The client's HEAD_POINT sits a little over the drawn head (the 战栗 fist of capture 10 floats above it) [추정 share]. */
const HEAD = 1.1;
/**
 * 2026-10-23 (묶음 K2, docs/rules/fx.md 「바인딩 표」 「클라 키로 재생」): a spec naming the client key `key` in its prefab slot —
 * `[bundle, { tpl: key }, height, hold?]`: the prefabs that key's buff holds with no condition (tools/build-fx-plays.mjs
 * `held`, public/assets/local/fx/plays.json; specsOf), and what it creates as it ends (`end`: as END_FX). None without the file.
 */
const keyed = (key, bundle, frac, ...rest) => Object.freeze(cite(key, [bundle, Object.freeze({ tpl: key }), frac, ...rest]));
/**
 * 2026-10-23 (묶음 K3): a `keyed` spec whose buff stands for every condition of its key's rows (`{ all: true }`, render/fx/conds.js):
 * the status is the buff those rows create, so their conditions (a dice roll, a damage filter, a stack count …) held — the key
 * holds one prefab or one condition set, never a choice between prefabs (test/render/fx-bindings.test.js).
 */
const keyedAll = (key, bundle, frac, ...rest) => Object.freeze(cite(key, [bundle, Object.freeze({ tpl: key, when: ALL }), frac, ...rest]));
const ALL = Object.freeze({ all: true });
/** status → [bundle, prefab, height share (0 feet, .5 body, HEAD head), hold (s: frozen there — local patch)]; `stealth` takes the side's prefab. */
export const STATUS_FX = Object.freeze({
  stun: ['buff', 'buff_stun', HEAD], freeze: ['buff', 'buff_autochess_frozen', 0], cold: ['buff', 'buff_cold', HEAD],
  sleep: ['buff', 'buff_sleep', 0.5], silence: ['buff', 'buff_silence', HEAD], fear: ['common', 'common_buff_fear', HEAD],
  tremble: ['common', 'common_buff_thrill', HEAD], disarm: ['common', 'common_disarm_icon', HEAD],
  slow: ['buff', 'buff_slowdown', 0], sluggish: ['buff', 'buff_sluggish', 0], aspdDown: ['buff', 'buff_attack_speed_reduction_01', 0],
  weaken: ['buff', 'buff_weak', HEAD], defDown: ['buff', 'buff_defdown', HEAD], resDown: ['buff', 'buff_magic_resistance_down', HEAD],
  fragile: ['buff', 'buff_ fragile_01', 0], levitate: ['common', 'common_levitate_01', 0],
  stealth: ['common', 'common_invisible', 0], stealthAlly: ['common', 'common_invisible', 0], camou: ['common', 'common_buff_micai_01', 0.5],
  // local patch (maintainer report 2026-10-07): 蕾缪安's talent 跨境追缉许可 'lemuen:wanted' — the client's char_lemuen_range_aim[effect]
  // buff (overrideEffectKey lemuen_talent_buff_01, the crosshair on the wanted enemy) [추정: at the head]
  // its systems loop in / pulse / out every 2.5 s; the maintainer (2026-10-07): once shown it stays — held at 2.0 s (the X steady)
  wanted: keyed('char_lemuen_range_aim', 'lemuen', HEAD, 2.0),
  // local patch (maintainer report 2026-10-07, video: orange X strokes on her marked enemies): 焰影苇草's 灼痕 'reed2:scorch' —
  // buff reed2_t_1 effectKey reed2_debuff_01 [추정: on the body]
  scorch: keyedAll('reed2_t_1', 'reed2', 0.5),
  // 空弦's 铁弦 'talent:archet_shield' — its buff archet_t_2 carries overrideEffectKey archet_buff_01_start (EN charpack
  // char_332_archet Talents/2), a looping mesh at the feet (_spawnLocation 1) while the layer holds. Other 护盾 layers have
  // no buff effect (凯尔希·思衡托's kalts2_t_2[shield]: effectKey "", overrideEffectKey null — CN client)
  archet_shield: keyed('archet_t_2', 'archet', 0),
});
const ALIAS = Object.freeze({ artsFragile: 'fragile', physFragile: 'fragile', elemFragile: 'fragile' });

// ---- buff effects (docs/rules/ui.md ⑤ 「버프 이펙트」; EN buff templates, charpacks, [uc]skills.ab, 2026-10-14) ----------
// A spec is [bundle, prefab, height share] as STATUS_FX (spawn 1 feet / 5 ground → 0, 2 body → 0.5, 4 head → HEAD), or
// OWN for the prefab's own `_spawnLocation` (its special points too: fxgame.js statusOn); a `keyed` spec names the client
// key in the prefab slot (its rows give the prefabs). These effects are keyed by
// `bundle/prefab`: the client keeps one effect per name on a unit (Entity.AddBuffEffect refCounter).

/** A spec height: where the prefab's own `_spawnLocation` puts it (fxgame.js playStatus → lifted). */
export const OWN = 'own';

/**
 * A catalogue status whose official buff depends on who applies it: status key → the applier's fx code (render/fxmap.js
 * fxBundleOf of its charId — the holder's own when the buff has no source) → spec, or { [buff `fx` hint]: spec } when only
 * one of the applier's buffs has an effect. An applier missing here draws nothing (the client's buff has no effect).
 */
export const SOURCE_FX = Object.freeze({
  bind: Object.freeze({
    indigo: keyed('indigo_t[unmovable]', 'indigo', 0),   // charpack S2_T1/Talents/1
    billro: keyed('billro_s_2[enhance][root]', 'billro', 0),
    mizuki: keyed('mizuki_s_2[unmovable]', 'mizuki', 0),
    cetsyr: keyed('cetsyr_s_2[unmoveable]', 'cetsyr', 0),   // template, spawn 5
    ines: keyedAll('ines_t_1[enemy][unmove]', 'ines', 0.5),
    glady: keyed('skchr_glady_3/ChantAttack1', 'glady', 0),   // _activeBuffs[0]
    mlyss: keyedAll('mlyss_s_3[unmoveable]', 'mlyss_token', 0),   // the 流形's S3 bind
    // qiubai_s_1[unmovable_effect]; the talent / module 落英 binds carry none
    qiubai: Object.freeze({ s1: keyedAll('qiubai_s_1[unmovable_effect]', 'qiubai', 0.5) }),
  }),
  // 抵抗: gnosis_t_2[effect] on the 谢拉格 operators (charpack Talents/2/karlan); 寒檀's is KEY_FX 'sntlla:born'
  resist: Object.freeze({ gnosis: keyed('gnosis_t_2[effect]', 'common', 0) }),
  // 禁疗: 史尔特尔's 余烬 surtr_t_2[withdraw] (charpack Talents/2; the sim buff has no source: the holder's code)
  healFree: Object.freeze({ surtr: keyed('surtr_t_2[withdraw]', 'surtr', 0) }),
  // (2026-10-24, 묶음 S6) 浮空 from 予愿安洁莉娜 S2: aglna2_s_2[enemy] gives a ground enemy (!CheckMotionMode FLY — the sim levitates
  // only those) aglna2_s_2[enemy][levitate], whose overrideEffectKey aglna2_levitate_01_emit stands for the common one. Another
  // applier keeps STATUS_FX's (STATUS_FALLBACK).
  levitate: Object.freeze({ aglna2: keyedAll('aglna2_s_2[enemy][levitate]', 'aglna2', 0) }),
  // 诱导 from 圣聆初雪 S3: sbell2_s3[attract_core] creates sbell2_s3[attract_effect] (sbell2_skill_03_hint) on the enemy once its
  // pull to her (AddAttractToTargetNearestTileUseAbilitySelector) is set — the sim's 'attract' status, given only then
  attract: Object.freeze({ sbell2: keyedAll('sbell2_s3[attract_effect]', 'sbell2', 0) }),
});
/** SOURCE_FX statuses whose other appliers draw STATUS_FX's common effect (the client's buff without an override). */
const STATUS_FALLBACK = new Set(['levitate']);

const BURN_BURST = keyed('ep_fire_magic_res_down', 'buff', 0.5);
const EROSION_DOWN = keyed('ep_water_def_down', 'buff', HEAD);
// (each of the two keys' rows holds both prefabs: the holder picks — not by key)
const ANGEL2_SELF = Object.freeze(['angel2', 'angel2_skill_2_buff_01', 0]);
const ANGEL2_OTHER = Object.freeze(['angel2', 'angel2_skill_2_buff_02', 0]);
/**
 * A kit buff → the official buff's effect: by its key; a list of specs when the buff stands for several; a function picks by
 * the holder (`view`) and its statusSource() (`from`) or returns null for none.
 */
export const KEY_FX = Object.freeze({
  'papyrs:shield': keyedAll('papyrs_t_1[shield_core]', 'papyrs', 0.5),
  // 休谟斯 再回收 (2026-10-24, 묶음 S6): humus_t_1[effect] holds humus_t_1[effect_holder] (humus_buff_03) while her barrier's
  // `dynamic` is above 0 — the sim's barrier buff, gone when spent
  'humus:recycle': keyedAll('humus_t_1[effect_holder]', 'humus', 0),
  'svash2:barrier': cite('svash2_s_1[build]', ['svash2', 'svash2_skill_01_shield_01', 0]),   // the deployed card's 屏障
  // 凯瑟琳's device: its end creates token_cathy_catsld_shield_01_end (the key's `end`) — the mark's end, its shield broken
  // (catsld_t_1[core] ON_TAKE_DAMAGE FinishBuffsById) or its timer out ([timer][interval] ON_BUFF_FINISH)
  'cathy:shield': keyed('catsld_t_1[shield_mark]', 'cathy_token', 0),
  'reckpr:guard': keyed('reckpr_02[listener]', 'reckpr', 0),   // S2's healed operator
  'sntlla:born': keyed('sntlla_t_1[atk]', 'common', 0),   // its 抵抗 with it
  // angel2_s_2[shield][trigger] on her, angel2_s_2[select_target] on the teammate she takes ASPD from [추정: the owners]
  'angel2:barrier': cite(['angel2_s_2[shield][trigger]', 'angel2_s_2[select_target]'], (v) => (fxCode(v) === 'angel2' ? ANGEL2_SELF : ANGEL2_OTHER)),
  // element bursts (ep_break_*): 凋亡 ep_break_dark[damage] on both sides; 灼燃 ep_fire_magic_res_down and 侵蚀
  // ep_water_def_down (the DEF cut, `erosionDown`) on operators only — an enemy's 灼燃 / 侵蚀 burst has its hit effect only
  apoptosisBurst: keyed('ep_break_dark[damage]', 'common', 0.5),
  burnBurst: cite('ep_fire_magic_res_down', (v) => (v.isEnemy ? null : BURN_BURST)),
  erosionDown: cite('ep_water_def_down', (v) => (v.isEnemy ? null : EROSION_DOWN)),
  // 2026-10-15: 阿利斯泰尔's pieces held by an operator (bosses.js HELD_BUFF) — enemy_vtmstr_equip_A/C/B[char]'s
  // overrideEffectKey (the pieces' Talents/2 `…[char]` templates), INFINITY: for the battle; `_spawnLocation` 2 = its HIT point
  'boss:heldSword': cite('enemy_vtmstr_equip_A[char]', ['pfx_enemy_13', 'enemy_vtswd_buff_01', 0.5]),
  'boss:heldVest': cite('enemy_vtmstr_equip_C[char]', ['pfx_enemy_13', 'enemy_vtshld_buff_01', 0.5]),
  'boss:heldWand': cite('enemy_vtmstr_equip_B[char]', ['pfx_enemy_13', 'enemy_vtwand_buff_01', 0.5]),
  // 2026-10-23: 扎罗's 【远古威慑】 (leaders.js kitWolfLord awe) — its CommonAbilities/FearAura/Aura buff enemy_wlfmster_fear's
  // overrideEffectKey on every operator in range
  'ab:ancientAwe': cite('enemy_wlfmster_fear', ['pfx_enemy_14', 'enemy_wlfmster_B_buff_02_02', OWN]),
  // and on 扎罗 while it runs (leaders.js kitWolfLord onKo): that AuraAbility's own `_effects`, its range on the ground
  // (enemy-modes.json `auraNested`; DoAttach creates it on the owner, Detach finishes it)
  'ab:aweAura': cite('enemy_1535_wlfmster/CommonAbilities/FearAura/Aura', ['pfx_enemy_14', 'enemy_wlfmster_B_buff_02', OWN]),
  // 2026-10-16 (이펙트 연결 전수 묶음 3, docs/rules/fx.md 「재능 버프·시전 이펙트」): talent buffs' overrideEffectKey (EN charpacks
  // Talents/N; a key ending in `:<id>` — one buff per applier — matches without it)
  'agoat2:mist': keyed('agoat2_t_1', 'agoat2', OWN),   // (Talents/1 _additiveActiveBuffs) on the healed ally
  'pasngr:enhance': keyedAll('pasngr_t_1[enhance]', 'pasngr', OWN),   // pasngr_t_1 → pasngr_t_1[enhance] on the enemy
  'udflow:dot': keyed('udflow_t_1', 'udflow', OWN),   // on the enemy
  'rosmon:stable': keyed('rosmon_t_2', 'rosmon', OWN),   // (Talents/2/Aura) on her and the 术师
  'inside:ammo': keyed('inside_t_1[active]', 'inside', OWN),   // (CommonAbilities/AddAmmoWrapper) on the ally
  'dusk:pending': keyed('dusk_t_2[spawn]', 'dusk', OWN),   // until 点睛's summon
  'halo2:t2': keyed('halo2_t_2[fx]', 'halo2', OWN),   // (_passiveBuffs) until the stacks are full …
  'halo2:t2full': keyedAll('halo2_t_2[full]', 'halo2', OWN),   // … then halo2_t_2[full]
  'texas2:swordplay': keyed('texas2_t_2', 'texas2', OWN),   // ended by ON_TARGET_KILLED
  // texas2_t_1[recast_effect] and [recast_effect_02]'s derived buff until the recast. (2026-10-21) The second is off while S3
  // runs and she is not stunned: skchr_texas2_3's AppearSwordRain creates texas2_s[no_effect_02] as the skill starts
  // (texas2_s_3[create_no_effect_02], an immediate buff), ModeWithSwordRain's texas2_s_3 (life `duration`) ends it, and
  // [recast_effect_02]'s trigger (every 0.1 s) finishes the effect while it is there unless STUNNED (EN buff templates)
  'texas2:recast': cite(['texas2_t_1[recast_effect]', 'texas2_t_1[recast_effect_02]'], (v) => {
    const s3 = !!v?._fxSkillOn && v.info?.skillIndex === 2 && !((v.flags | 0) & UF.STUNNED);
    const first = ['texas2', 'texas2_buff_02_start', OWN];
    return s3 ? [first] : [first, ['texas2', 'texas2_buff_02_start_02', OWN]];
  }),
  // 2026-10-21 (docs/rules/fx.md 「버프 스택 수로 바뀌는 이펙트」): 佩佩 S2 from its second cast, pepe_s_2[attack_speed]'s
  // derived [effect_1/2/3] by the casts left (`cnt`: ≤ 0 → _03, ≤ 1 → _01, else _02; the kit's `fx` hint) until the skill ends
  'pepe:rage': cite('pepe_s_2[attack_speed]', (v, from) => {
    const lv = Number(from?.fx);
    return lv >= 1 && lv <= 3 ? ['pepe', `pepe_buff_level_0${lv}`, OWN] : null;
  }),
  // the held dodge: 赤刃明霄陈 T2 chen3_t2[evade] chen3_Shield_buff_01, 蒂比 T tippi_t[evade] tippi_buff_01 (each ended by its Evade)
  // 2026-10-24 (묶음 S2): 塑心 S3 自由的探戈 — the operators of her range with the highest max HP / ATK / DEF (the sim's
  // 'cello:tango:*', 0.75 s and renewed): cello_s_3[max_hp] / [atk] / [def] make [effect_hp] / [effect_atk] / [effect_def] on
  // them (cello_skill_03_buff_04 / _03 / _05), held while that buff is (cello_s[effect_holder])
  'cello:tango:hp': keyed('cello_s_3[effect_hp]', 'cello', OWN),
  'cello:tango:atk': keyed('cello_s_3[effect_atk]', 'cello', OWN),
  'cello:tango:def': keyed('cello_s_3[effect_def]', 'cello', OWN),
  // 2026-10-24 (묶음 S2): 百炼嘉维尔 S3's end — gvial2_s_3's ON_BUFF_FINISH creates gvial2_s_3[final_bleed] (LIMITED final_duration,
  // gvial2_skill_3_bleed) on her: the kit's self bleed after the skill
  'gvial:bleed': keyed('gvial2_s_3[final_bleed]', 'gvial2', OWN),
  'chen3:evade': keyedAll('chen3_t2[evade]', 'chen3', OWN),
  'tippi:evade': keyedAll('tippi_t[evade]', 'tippi', OWN),
  // 战场#06's 沙尘暴 on an unsheltered operator (EN template sand_storm[ally], ON_BUFF_TRIGGER): storm[attr_to_ally] — its
  // SwitchDirection on the storm's direction (the buff's `fx`, devices.js tickStorm) creates map_desert_03_<the side the
  // wind comes from> (DOWN → _up) at the HIT point — and storm[attr_to_ally_mark] buff_desert_01 over the head
  'terrain:sandstorm': cite('sand_storm[ally]', (v, from) => [['map', `map_desert_03_${STORM_FROM[from?.fx] || 'up'}`, OWN], ['buff', 'buff_desert_01', OWN]]),
  // … and on an enemy: sand_storm[enemy] creates sand_storm[slow_down], which names no effect (not the 'slow' fallback)
  'terrain:sandstormSlow': cite('sand_storm[enemy]', () => null),
});
/** A storm direction → the suffix of its map_desert_03 operator effect (sand_storm[ally]: RIGHT → _left …). */
const STORM_FROM = Object.freeze({ DOWN: 'up', UP: 'down', LEFT: 'right', RIGHT: 'left' });

/**
 * A kit buff whose official effect is one prefab per layer left: nearl2_s_2 creates [shield][a..d] while `times` ≥ 1..4;
 * 泥岩's mudrok_t_1 (max_times 3) its bottom layer [shield_c] mudrok_buff_03_start, then [shield_b] _02_start, then the top
 * [shield_a] _01_start — a hit breaks the top one first ([shield_a], then [shield_b], [shield_c]: their ON_DAMAGE nodes).
 * The count comes with the status (app.js `n`), drops with each fx 'parry' of the buff (UnitView.onStatusHit) and is set
 * by a kit's fx 'stacks' (UnitView.onStatusCount: 泥岩's layer gains).
 */
export const LAYER_FX = Object.freeze({
  'nearl2:shield': Object.freeze(cite('nearl2_s_2', [2, 3, 4, 5].map((i) => Object.freeze(['nearl2', `nearl2_skill_02_buff_0${i}`, 0])))),
  'mudrok:layers': Object.freeze(cite(['mudrok_t_1[init]', 'mudrok_t_1[recharge]'], [3, 2, 1].map((i) => Object.freeze(['mudrok', `mudrok_buff_0${i}_start`, 0])))),
});

/**
 * A kit buff whose official effects come with its stack count (a kit's fx 'stacks', UnitView.onStatusCount): [from stacks,
 * spec, below?] entries, each one shown while the count is ≥ `from` (and < `below` when given). A bound may be 'max' / 'mid':
 * the event's `max` / `mid` (the official blackboard's max_stack_cnt / mid_stack_cnt, which the kit reads). A key ending in
 * `:<id>` (one buff per applier) matches without it. 卡涅利安's S3 mark: billro_s_3[mark_effect] creates [part] at 1 stack and
 * [full] at 5 (billro_s_3[charge][enhance] stacks), [part] staying. The rest (2026-10-21, EN buff templates; docs/rules/fx.md
 * 「버프 스택 수로 바뀌는 이펙트」): a STACK buff's overrideEffectKey from its first stack, and the derived buff a
 * FilterByBuffStackCount creates at its count. 2026-10-23 (묶음 K3): an entry may instead be `stacked` — the key's rows judged
 * at the count (卡涅利安's mark, 阿斯卡纶, 夕, 洛洛, 玛恩纳); the arrays left are the ones the rows cannot pick by the count
 * alone (信仰搅拌机's swap is its prefab's SwitchableEffectByBuffStackCnt, 琳琅诗怀雅's [max] sits behind CheckCost, 妮芙's
 * behind the 凋亡 burst type).
 */
const st = (bundle, name) => Object.freeze([bundle, name, OWN]);
/**
 * 2026-10-23 (묶음 K3): a STACK_FX entry by the client key `key` — the prefabs its buffs hold at the count of `counted`
 * (its FilterByBuffStackCount buff; the rows creating it hold while it has a stack), the count info's `max` / `mid` as the
 * blackboard max_stack_cnt / mid_stack_cnt, a derived buff kept once created (render/fx/conds.js whenPlays) — at `frac`.
 */
const stacked = (key, counted, bundle, frac = OWN) => Object.freeze(cite(key, { tpl: key, counted, bundle, frac }));
export const STACK_FX = Object.freeze({
  'billro:mark': stacked('billro_s_3[mark_effect]', 'billro_s_3[charge][enhance]', 'billro', HEAD),
  // 信仰搅拌机 T1 rmixer_t1[attr_stack] rmixer_buff_01, whose SwitchableEffectByBuffStackCnt (`_stackCnt` 3, GE) swaps it for
  // rmixer_buff_02 at 3 stacks (the first paused — official client)
  'rmixer:t1': Object.freeze(cite('rmixer_t1', [[1, st('rmixer', 'rmixer_buff_01'), 3], [3, st('rmixer', 'rmixer_buff_02')]])),
  // 琳琅诗怀雅 T1 大买家: swire2_tr's swire2_t_1[atk] swire2_buff_01_start, at max_stack_cnt also [max] _01_start_02
  'talent:swire2_buyer': Object.freeze(cite('swire2_tr', [[1, st('swire2', 'swire2_buff_01_start')], ['max', st('swire2', 'swire2_buff_01_start_02')]])),
  // 阿斯卡纶 T1 on the enemy: ascln_t_1[debuff] ascln_buff_01; at max_stack_cnt [max_eff] ascln_buff_02, ended when the
  // stacks drop below (its 1 s ON_BUFF_TRIGGER FinishDerivedBuff)
  'ascln:judg': stacked('ascln_t_1', 'ascln_t_1[debuff]', 'ascln'),
  // 夕 T1 化境: dusk_t_1[atk] dusk_buff_03_start; at max_stack_cnt (EQUALS) [effect] dusk_buff_03_start_02
  'dusk:realm': stacked('dusk_t_1', 'dusk_t_1[atk]', 'dusk'),
  // 塞雷娅 T1 莱茵充能护服: demkni_t_1[stack] demkni_buff_01_self
  'saria:suit': Object.freeze(cite('demkni_t_1', [[1, keyed('demkni_t_1', 'demkni', OWN)]])),
  // 妮芙 T2 窥心钥: at max_stack_cnt (the module's stack_cnt_check) nymph_t_2[atk][effect] nymph_talent_buff_02
  'nymph:key': Object.freeze(cite('nymph_t_2', [['max', st('nymph', 'nymph_talent_buff_02')]])),
  // 洛洛 T1: at max_stack_cnt (EQUALS) rockr_t_1[effect_1] rockr_buff_01
  'rockr:rock': stacked('rockr_t_1', 'rockr_t_1[atk]', 'rockr'),
  // 玛恩纳 解放者 trait: mlynar_tr's stack per second — [a] _L_01 from the first, [b] _L_02 from mid_stack_cnt, [c] _L_03 at
  // max_stack_cnt (set while the skill is off; mlynar_s_cast's finish ends them with the stacks)
  'trait:libratorRamp': stacked('mlynar_tr', 'mlynar_tr_atk', 'mlynar'),
});
/** A STACK_FX bound: a number, or the count info's `max` / `mid`. */
const bound = (b, from) => (typeof b === 'number' ? b : Number(from?.[b]) || Infinity);

/** The fx code of a view's character (fxmap.js fxBundleOf: 'char_469_indigo' → 'indigo'), or ''. */
function fxCode(v) {
  const id = v && v.info && (v.info.spine || v.info.defId);
  return id ? String(id).replace(/^char_\d+_/, '') : '';
}

/**
 * What the client needs of a 'status' on-event `e` (['status', id, key, 1, sourceId?, { fx?, n? }?], sim
 * battle/status.js): the applier's fx code (resolved now: the applier may be gone by the next frame), the buff's `fx`
 * hint and its layer count. null when the event carries none.
 * @param {Map<any, any>} views
 * @param {any[]} e
 */
export function statusSource(views, e) {
  const info = e[5] && typeof e[5] === 'object' ? e[5] : null;
  if (e[4] == null && !info) return null;
  return { src: e[4] != null ? fxCode(views.get(e[4])) || null : null, fx: info?.fx ?? null, n: Number(info?.n) || 0 };
}

/** The STATUS_FX key of a sim 'status' key ('tremble', 'skill:haini_slow', 'talent:weak_fragile' …), or null. */
export function statusFxKey(key) {
  if (typeof key !== 'string' || !key) return null;
  if (STATUS_FX[key] && key !== 'stealthAlly') return key;
  if (ALIAS[key]) return ALIAS[key];
  const tail = key.includes(':') ? key.slice(key.lastIndexOf(':') + 1) : key;
  if (STATUS_FX[tail] && tail !== 'stealthAlly') return tail;
  if (ALIAS[tail]) return ALIAS[tail];
  // keyword fallbacks as render/style.js STATUS_GUESS (the content buffs' own keys)
  if (/trembl/i.test(tail)) return 'tremble';
  if (/fear/i.test(tail)) return 'fear';
  if (/fragil|vulner/i.test(tail) && !/invul/i.test(tail)) return 'fragile';   // 'invulnerable' is no 脆弱
  if (/aspd/i.test(tail)) return /gain|up/i.test(tail) ? null : 'aspdDown';
  if (/slugg/i.test(tail)) return 'sluggish';
  if (/slow/i.test(tail)) return 'slow';
  if (/silen/i.test(tail)) return 'silence';
  if (/weak/i.test(tail)) return 'weaken';
  if (/stun|daze/i.test(tail)) return 'stun';
  if (/sleep|slumber/i.test(tail)) return 'sleep';
  if (/levit/i.test(tail)) return 'levitate';
  if (/disarm/i.test(tail)) return 'disarm';
  return null;
}

const WANT = new Map();
/**
 * 2026-10-21 (docs/rules/fx.md 「적 상태의 버프 이펙트」): what a buff's end creates (its template's ON_BUFF_FINISH CreateEffect,
 * once — Nodes.CreateEffect.Execute), by the effect key of the buff's own effect: played as that effect ends
 * on a living unit (syncStatusFx), not as the unit dies or leaves.
 */
export const END_FX = Object.freeze({
  // (a `keyed` spec's end comes with its key: specsOf) 泥岩 T1: mudrok_t_1[shield_c] (her last layer, LAYER_FX's first) — a hit with neither [shield_a] nor [shield_b] left creates
  // mudrok_buff_01_end on her (ON_TAKE_DAMAGE CreateEffect TARGET) as it breaks
  'mudrok/mudrok_buff_03_start': Object.freeze(cite('mudrok_t_1[shield_c]', [Object.freeze(['mudrok', 'mudrok_buff_01_end', 'own'])])),
});
const END_OF = new Map();   // effect key → its end specs: an enemy buff's (wantedStatusFx, from fxgame.js enemyBuffFx), a keyed spec's (specsOf)
const ONCE_OF = new Set();  // 2026-10-23: effect keys of an enemy's IMMEDIATELY buffs (enemyBuffFx `once`): flashed once as the status comes on
/** Every effect key syncStatusFx turns on (and so may turn off): not the prep 'golden' glow of fxgolden.js. */
const MINE = new Set(Object.keys(STATUS_FX));

const NO_SPECS = Object.freeze([]);
const KEYED = new WeakMap();   // plays document → keyed spec → its specs
/**
 * The concrete specs of a `keyed` spec: the prefabs its key holds in `plays` (the loaded plays.json) — none without it —,
 * each ending into the key's `end` prefabs (END_OF). Memoised per plays document.
 */
function specsOf(spec, plays) {
  const t = spec[1];
  if (!plays) return NO_SPECS;
  let memo = KEYED.get(plays);
  if (!memo) KEYED.set(plays, (memo = new Map()));
  let out = memo.get(spec);
  if (!out) {
    const k = plays.keys?.[t.tpl];
    const held = [...new Set([...(k?.held || []), ...whenPlays(k, t.when).filter((r) => r.role === 'held').map((r) => r.n)])];
    out = Object.freeze(held.map((n) => Object.freeze([spec[0], n, ...spec.slice(2)])));
    const ends = (k?.end || []).map((n) => Object.freeze([spec[0], n, OWN]));
    if (ends.length) for (const s of out) END_OF.set(`${s[0]}/${s[1]}`, ends);
    memo.set(spec, out);
  }
  return out;
}

const STACKED = new WeakMap();   // plays document → `stacked` entry|count|max|mid → its specs
/** The specs of a `stacked` STACK_FX entry at count `n` (`from`: the count info's max / mid) — none without `plays`. */
function stackedSpecs(e, n, from, plays) {
  if (!plays) return NO_SPECS;
  let memo = STACKED.get(plays);
  if (!memo) STACKED.set(plays, (memo = new Map()));
  const max = Number(from?.max) || null, mid = Number(from?.mid) || null;
  const id = `${e.tpl}|${n}|${max}|${mid}`;
  let out = memo.get(id);
  if (!out) {
    const k = plays.keys?.[e.tpl];
    const bb = { ...(max ? { max_stack_cnt: max } : {}), ...(mid ? { mid_stack_cnt: mid } : {}) };
    const on = whenPlays(k, { stacks: { [e.counted]: n }, bb, buffs: [] }).filter((r) => r.role === 'held').map((r) => r.n);
    out = Object.freeze([...new Set([...(k?.held || []), ...on])].map((name) => Object.freeze([e.bundle, name, e.frac])));
    memo.set(id, out);
  }
  return out;
}

function put(out, k, spec) { if (spec && !out.has(k)) out.set(k, spec); }
let playsNow = null;   // wantedStatusFx's `plays` (byName, keyed specs)
const byName = (out, spec) => {
  if (!spec) return;
  if (typeof spec[1] === 'string') put(out, `${spec[0]}/${spec[1]}`, spec);
  else for (const s of specsOf(spec, playsNow)) put(out, `${s[0]}/${s[1]}`, s);
};

/**
 * The effects `v` should show now: effect key → spec. STATUS_FX keys for the catalogue statuses (`stealth` already
 * resolved to the side's prefab key), `bundle/prefab` for the buff effects (SOURCE_FX / KEY_FX / LAYER_FX / STACK_FX).
 * `v.statusFrom` (UnitView.onStatus): status key → statusSource(). `plays`: the loaded plays.json (`keyed` specs).
 */
export function wantedStatusFx(v, out = WANT, ebuff = null, plays = null) {
  out.clear();
  playsNow = plays;
  const f = v.flags | 0;
  // 2026-10-21: an enemy's own buff effects (fxgame.js enemyBuffFx — its prefab's buffs; ebuff(view, kind, tag) → { on, ends })
  const own = v.isEnemy && typeof ebuff === 'function' ? (kind, tag) => ebuff(v, kind, tag) : null;
  const byOwn = (r) => {
    for (const s of r.on) {
      byName(out, s);
      const k = `${s[0]}/${s[1]}`, e = r.ends?.get(k);
      if (e) END_OF.set(k, e);
      if (r.once?.has(k)) ONCE_OF.add(k);
    }
  };
  // 2026-10-23: the passive buffs of the mode an enemy with several modes is in (prisoners' 【解放】, 守墓石像's statue, the
  // 逐火 ember …) — held while the mode is on; one a status names too is the same `bundle/prefab` key, drawn once
  if (own) { const r = own('mode'); if (r) byOwn(r); }
  if (f & UF.STUNNED) put(out, 'stun', STATUS_FX.stun);
  if (f & UF.FROZEN) put(out, 'freeze', STATUS_FX.freeze);
  if (f & UF.COLD) put(out, 'cold', STATUS_FX.cold);
  if (f & UF.SLEEP) put(out, 'sleep', STATUS_FX.sleep);
  if (f & UF.STEALTH) {
    const k = f & UF_CAMOU ? 'camou' : v.isEnemy ? 'stealth' : 'stealthAlly';
    // an enemy's 隐匿 is its own invisible buff's effect: common_invisible for most, 假想敌：骨刺's enemy_acbunn_buff, 家族灭迹人's
    // enemy_sgkill_buff, 锏's second form enemy_blkswb_buff_03 (enemy-modes.json `stealth`: its buffs with the INVISIBLE flag)
    const r = k === 'stealth' && own ? own('stealth') : null;
    if (r) byOwn(r); else put(out, k, STATUS_FX[k]);
  }
  if (v.statuses) {
    for (const k of v.statuses) {
      const from = v.statusFrom?.get?.(k) || null;
      // the client buff an enemy's own status stands for (its `fxTag` 'buff:<client buff keys>'), a rebirth's 无敌 (`ab:…:inv`,
      // reborn() in server/sim/content/enemies/archetypes.js): the enemy's own buff effects — none bound, nothing drawn
      const tag = typeof from?.fx === 'string' && from.fx.startsWith('buff:') ? from.fx.slice(5) : null;
      if (tag != null || /^ab:.*:inv$/.test(k)) {
        const r = own ? (tag != null ? own('key', tag) : own('inv')) : null;
        if (r) byOwn(r);
        continue;
      }
      const per = SOURCE_FX[k];
      const e = per ? per[from?.src || fxCode(v)] : null;
      if (per && (e || !STATUS_FALLBACK.has(k))) {
        byName(out, Array.isArray(e) ? e : e && from?.fx != null ? e[from.fx] : null);
        continue;
      }
      const kf = KEY_FX[k] ?? KEY_FX[k.replace(/:\d+$/, '')];
      if (kf) {
        const spec = typeof kf === 'function' ? kf(v, from) : kf;
        if (spec && Array.isArray(spec[0])) for (const s of spec) byName(out, s); else byName(out, spec);
        continue;
      }
      const layers = LAYER_FX[k];
      if (layers) { for (let i = 0; i < Math.min(layers.length, from?.n || 0); i++) byName(out, layers[i]); continue; }
      const stacks = STACK_FX[k] ?? STACK_FX[k.replace(/:\d+$/, '')];
      if (stacks) {
        const n = from?.n || 1;
        if (stacks.tpl) for (const s of stackedSpecs(stacks, n, from, plays)) put(out, `${s[0]}/${s[1]}`, s);
        else for (const [min, spec, below] of stacks) if (n >= bound(min, from) && (below == null || n < bound(below, from))) byName(out, spec);
        continue;
      }
      const s = statusFxKey(k);
      if (s === 'stealth' || s === 'camou') continue; // by the flags above (side, 迷彩)
      if (s) put(out, s, typeof STATUS_FX[s][1] === 'string' ? STATUS_FX[s] : specsOf(STATUS_FX[s], plays)[0]);
    }
  }
  return out;
}

/** Whether the effect layer draws status effects now (fxgame.js statusLayer); off: the drawn icons stand in. */
function layerOn(fxGame) { return typeof fxGame.statusLayer === 'function' ? !!fxGame.statusLayer() : true; }

/**
 * Sync every live unit's status effects with `fxGame` (render/fxgame.js statusOn / statusOff). `views`: the field's
 * views (Map). Units not in battle (prep), dead or culled show none. Sets `view._statusIcons` (units.js): the drawn icons
 * only while the layer is off.
 */
export function syncStatusFx(views, fxGame, battle) {
  if (!fxGame || typeof fxGame.statusOn !== 'function') return;
  const icons = !layerOn(fxGame);
  const ebuff = typeof fxGame.enemyBuffFx === 'function' ? fxGame.enemyBuffFx : null;
  const plays = typeof fxGame.plays === 'function' ? fxGame.plays() : null;
  for (const v of views.values()) {
    if (!v || typeof v.flags !== 'number') continue;
    v._statusIcons = icons;
    const on = v._fxStatusOn;
    const live = battle && v.alive && !v.prep && !v.remove;
    const want = live ? wantedStatusFx(v, WANT, ebuff, plays) : (WANT.clear(), WANT);
    for (const [k, spec] of want) {
      if (on && on.has(k)) continue;
      const [bundle, name, frac, hold] = spec;
      // (an IMMEDIATELY buff's effect, ONCE_OF: finished as it starts — kept in `on` till the status ends, so not again)
      if (fxGame.statusReady(bundle, name)) { MINE.add(k); fxGame.statusOn(v, bundle, name, k, frac, hold, false, ONCE_OF.has(k)); }
    }
    // local patch: not the prep 'golden' glow (fxgolden.js); local patch (maintainer report 2026-10-08): `now` — an ended
    // status takes its effect's particles with it (buff_stun's mark lives 10 s: it hung on beside the next stun's), after
    // the prefab's `_delayToFinish` as the client's Effect.FinishMe does (2026-10-11, fxgame.js statusOff; buff_stun 0)
    if (on) {
      for (const k of [...on]) {
        if (want.has(k) || !MINE.has(k)) continue;
        fxGame.statusOff(v, k, true);
        // 2026-10-21: a buff's end effect, once, when the buff ends on a living unit (END_FX, an enemy buff's `buffEnd`)
        const end = live ? END_FX[k] || END_OF.get(k) : null;
        if (end && typeof fxGame.statusOnce === 'function') for (const [b, n] of end) fxGame.statusOnce(v, b, n);
      }
    }
  }
}
