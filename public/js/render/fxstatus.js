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

/** The client's HEAD_POINT sits a little over the drawn head (the 战栗 fist of capture 10 floats above it) [추정 share]. */
const HEAD = 1.1;
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
  wanted: cite('char_lemuen_range_aim', ['lemuen', 'lemuen_talent_buff_01', HEAD, 2.0]),
  // local patch (maintainer report 2026-10-07, video: orange X strokes on her marked enemies): 焰影苇草's 灼痕 'reed2:scorch' —
  // buff reed2_t_1 effectKey reed2_debuff_01 [추정: on the body]
  scorch: cite('reed2_t_1', ['reed2', 'reed2_debuff_01', 0.5]),
  // 空弦's 铁弦 'talent:archet_shield' — its buff archet_t_2 carries overrideEffectKey archet_buff_01_start (EN charpack
  // char_332_archet Talents/2), a looping mesh at the feet (_spawnLocation 1) while the layer holds. Other 护盾 layers have
  // no buff effect (凯尔希·思衡托's kalts2_t_2[shield]: effectKey "", overrideEffectKey null — CN client)
  archet_shield: cite('archet_t_2', ['archet', 'archet_buff_01_start', 0]),
});
const ALIAS = Object.freeze({ artsFragile: 'fragile', physFragile: 'fragile', elemFragile: 'fragile' });

// ---- buff effects (docs/rules/ui.md ⑤ 「버프 이펙트」; EN buff templates, charpacks, [uc]skills.ab, 2026-10-14) ----------
// A spec is [bundle, prefab, height share] as STATUS_FX (spawn 1 feet / 5 ground → 0, 2 body → 0.5, 4 head → HEAD), or
// OWN for the prefab's own `_spawnLocation` (its special points too: fxgame.js statusOn). These effects are keyed by
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
    indigo: cite('indigo_t[unmovable]', ['indigo', 'indigo_buff_01_start', 0]),   // charpack S2_T1/Talents/1
    billro: cite('billro_s_2[enhance][root]', ['billro', 'billro_skill_02_buff_03', 0]),
    mizuki: cite('mizuki_s_2[unmovable]', ['mizuki', 'mizuki_skill_02_buff_02', 0]),
    cetsyr: cite('cetsyr_s_2[unmoveable]', ['cetsyr', 'cetsyr_skill_02_tie', 0]),   // template, spawn 5
    ines: cite('ines_t_1[enemy][unmove]', ['ines', 'ines_imprison_01', 0.5]),
    glady: cite('skchr_glady_3/ChantAttack1', ['glady', 'glady_skill_03_buff_to_enemy', 0]),   // _activeBuffs[0]
    mlyss: cite('mlyss_s_3[unmoveable]', ['mlyss_token', 'token_10030_mlyss_wtrman_c3_debuff_01', 0]),   // the 流形's S3 bind
    // qiubai_s_1[unmovable_effect]; the talent / module 落英 binds carry none
    qiubai: Object.freeze({ s1: cite('qiubai_s_1[unmovable_effect]', ['qiubai', 'qiubai_skill_01_buff', 0.5]) }),
  }),
  // 抵抗: gnosis_t_2[effect] on the 谢拉格 operators (charpack Talents/2/karlan); 寒檀's is KEY_FX 'sntlla:born'
  resist: Object.freeze({ gnosis: cite('gnosis_t_2[effect]', ['common', 'common_ resistance_01', 0]) }),
  // 禁疗: 史尔特尔's 余烬 surtr_t_2[withdraw] (charpack Talents/2; the sim buff has no source: the holder's code)
  healFree: Object.freeze({ surtr: cite('surtr_t_2[withdraw]', ['surtr', 'surtr_buff_01_start', 0]) }),
});

const ANGEL2_SELF = Object.freeze(['angel2', 'angel2_skill_2_buff_01', 0]);
const ANGEL2_OTHER = Object.freeze(['angel2', 'angel2_skill_2_buff_02', 0]);
/**
 * A kit buff → the official buff's effect: by its key; a list of specs when the buff stands for several; a function picks by
 * the holder (`view`) and its statusSource() (`from`) or returns null for none.
 */
export const KEY_FX = Object.freeze({
  'papyrs:shield': cite('papyrs_t_1[shield_core]', ['papyrs', 'papyrs_talent_01', 0.5]),
  'svash2:barrier': cite('svash2_s_1[build]', ['svash2', 'svash2_skill_01_shield_01', 0]),   // the deployed card's 屏障
  'cathy:shield': cite('catsld_t_1[shield_mark]', ['cathy_token', 'token_cathy_catsld_shield_01', 0]),
  'reckpr:guard': cite('reckpr_02[listener]', ['reckpr', 'reckpr_skill2_hit_buff', 0]),   // S2's healed operator
  'sntlla:born': cite('sntlla_t_1[atk]', ['common', 'common_ resistance_01', 0]),   // its 抵抗 with it
  // angel2_s_2[shield][trigger] on her, angel2_s_2[select_target] on the teammate she takes ASPD from [추정: the owners]
  'angel2:barrier': cite(['angel2_s_2[shield][trigger]', 'angel2_s_2[select_target]'], (v) => (fxCode(v) === 'angel2' ? ANGEL2_SELF : ANGEL2_OTHER)),
  // element bursts (ep_break_*): 凋亡 ep_break_dark[damage] on both sides; 灼燃 ep_fire_magic_res_down and 侵蚀
  // ep_water_def_down (the DEF cut, `erosionDown`) on operators only — an enemy's 灼燃 / 侵蚀 burst has its hit effect only
  apoptosisBurst: cite('ep_break_dark[damage]', ['common', 'common_darkdamage_debuff', 0.5]),
  burnBurst: cite('ep_fire_magic_res_down', (v) => (v.isEnemy ? null : ['buff', 'buff_burn', 0.5])),
  erosionDown: cite('ep_water_def_down', (v) => (v.isEnemy ? null : ['buff', 'buff_defdown', HEAD])),
  // 2026-10-15: 阿利斯泰尔's pieces held by an operator (bosses.js HELD_BUFF) — enemy_vtmstr_equip_A/C/B[char]'s
  // overrideEffectKey (the pieces' Talents/2 `…[char]` templates), INFINITY: for the battle; `_spawnLocation` 2 = its HIT point
  'boss:heldSword': cite('enemy_vtmstr_equip_A[char]', ['pfx_enemy_13', 'enemy_vtswd_buff_01', 0.5]),
  'boss:heldVest': cite('enemy_vtmstr_equip_C[char]', ['pfx_enemy_13', 'enemy_vtshld_buff_01', 0.5]),
  'boss:heldWand': cite('enemy_vtmstr_equip_B[char]', ['pfx_enemy_13', 'enemy_vtwand_buff_01', 0.5]),
  // 2026-10-16 (이펙트 연결 전수 묶음 3, docs/rules/fx.md 「재능 버프·시전 이펙트」): talent buffs' overrideEffectKey (EN charpacks
  // Talents/N; a key ending in `:<id>` — one buff per applier — matches without it)
  'agoat2:mist': cite('agoat2_t_1', ['agoat2', 'agoat2_recover_01', OWN]),   // (Talents/1 _additiveActiveBuffs) on the healed ally
  'pasngr:enhance': cite('pasngr_t_1[enhance]', ['pasngr', 'pasngr_beidong_buff_01', OWN]),            // pasngr_t_1 → pasngr_t_1[enhance] on the enemy
  'udflow:dot': cite('udflow_t_1', ['udflow', 'udflow_debuff_01', OWN]),   // on the enemy
  'rosmon:stable': cite('rosmon_t_2', ['rosmon', 'rosmon_buff_01_start', OWN]),   // (Talents/2/Aura) on her and the 术师
  'inside:ammo': cite('inside_t_1[active]', ['inside', 'inside_buff_01_start', OWN]),   // (CommonAbilities/AddAmmoWrapper) on the ally
  'dusk:pending': cite('dusk_t_2[spawn]', ['dusk', 'dusk_buff_04_start', OWN]),   // until 点睛's summon
  'halo2:t2': cite('halo2_t_2[fx]', ['halo2', 'halo2_talent_01', OWN]),   // (_passiveBuffs) until the stacks are full …
  'halo2:t2full': cite('halo2_t_2[full]', ['halo2', 'halo2_talent_02', OWN]),                      // … then halo2_t_2[full]
  'texas2:swordplay': cite('texas2_t_2', ['texas2', 'texas2_buff_01_start', OWN]),   // ended by ON_TARGET_KILLED
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
  'chen3:evade': cite('chen3_t2[evade]', ['chen3', 'chen3_Shield_buff_01', OWN]),
  'tippi:evade': cite('tippi_t[evade]', ['tippi', 'tippi_buff_01', OWN]),
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
 * FilterByBuffStackCount creates at its count.
 */
const st = (bundle, name) => Object.freeze([bundle, name, OWN]);
export const STACK_FX = Object.freeze({
  'billro:mark': Object.freeze(cite('billro_s_3[mark_effect]', [[1, Object.freeze(['billro', 'billro_skill_03_buff_03_01', HEAD])], [5, Object.freeze(['billro', 'billro_skill_03_buff_03_02', HEAD])]])),
  // 信仰搅拌机 T1 rmixer_t1[attr_stack] rmixer_buff_01, whose SwitchableEffectByBuffStackCnt (`_stackCnt` 3, GE) swaps it for
  // rmixer_buff_02 at 3 stacks (the first paused — disassembly 0xE9B9B0)
  'rmixer:t1': Object.freeze(cite('rmixer_t1', [[1, st('rmixer', 'rmixer_buff_01'), 3], [3, st('rmixer', 'rmixer_buff_02')]])),
  // 琳琅诗怀雅 T1 大买家: swire2_tr's swire2_t_1[atk] swire2_buff_01_start, at max_stack_cnt also [max] _01_start_02
  'talent:swire2_buyer': Object.freeze(cite('swire2_tr', [[1, st('swire2', 'swire2_buff_01_start')], ['max', st('swire2', 'swire2_buff_01_start_02')]])),
  // 阿斯卡纶 T1 on the enemy: ascln_t_1[debuff] ascln_buff_01; at max_stack_cnt [max_eff] ascln_buff_02, ended when the
  // stacks drop below (its 1 s ON_BUFF_TRIGGER FinishDerivedBuff)
  'ascln:judg': Object.freeze(cite('ascln_t_1', [[1, st('ascln', 'ascln_buff_01')], ['max', st('ascln', 'ascln_buff_02')]])),
  // 夕 T1 化境: dusk_t_1[atk] dusk_buff_03_start; at max_stack_cnt (EQUALS) [effect] dusk_buff_03_start_02
  'dusk:realm': Object.freeze(cite('dusk_t_1', [[1, st('dusk', 'dusk_buff_03_start')], ['max', st('dusk', 'dusk_buff_03_start_02')]])),
  // 塞雷娅 T1 莱茵充能护服: demkni_t_1[stack] demkni_buff_01_self
  'saria:suit': Object.freeze(cite('demkni_t_1', [[1, st('demkni', 'demkni_buff_01_self')]])),
  // 妮芙 T2 窥心钥: at max_stack_cnt (the module's stack_cnt_check) nymph_t_2[atk][effect] nymph_talent_buff_02
  'nymph:key': Object.freeze(cite('nymph_t_2', [['max', st('nymph', 'nymph_talent_buff_02')]])),
  // 洛洛 T1: at max_stack_cnt (EQUALS) rockr_t_1[effect_1] rockr_buff_01
  'rockr:rock': Object.freeze(cite('rockr_t_1', [['max', st('rockr', 'rockr_buff_01')]])),
  // 玛恩纳 解放者 trait: mlynar_tr's stack per second — [a] _L_01 from the first, [b] _L_02 from mid_stack_cnt, [c] _L_03 at
  // max_stack_cnt (set while the skill is off; mlynar_s_cast's finish ends them with the stacks)
  'trait:libratorRamp': Object.freeze(cite('mlynar_tr', [[1, st('mlynar', 'mlynar_attack_01_buff_L_01')], ['mid', st('mlynar', 'mlynar_attack_01_buff_L_02')],
    ['max', st('mlynar', 'mlynar_attack_01_buff_L_03')]])),
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
 * once — Nodes.CreateEffect.Execute RVA 0xB90880), by the effect key of the buff's own effect: played as that effect ends
 * on a living unit (syncStatusFx), not as the unit dies or leaves.
 */
export const END_FX = Object.freeze({
  // 凯瑟琳's device: catsld_t_1[shield_mark] ON_BUFF_FINISH → token_cathy_catsld_shield_01_end on BUFF_OWNER — the mark's end,
  // its shield broken (catsld_t_1[core] ON_TAKE_DAMAGE FinishBuffsById) or its timer out ([timer][interval] ON_BUFF_FINISH)
  'cathy_token/token_cathy_catsld_shield_01': Object.freeze(cite('catsld_t_1[shield_mark]', [Object.freeze(['cathy_token', 'token_cathy_catsld_shield_01_end', 'own'])])),
  // 泥岩 T1: mudrok_t_1[shield_c] (her last layer, LAYER_FX's first) — a hit with neither [shield_a] nor [shield_b] left creates
  // mudrok_buff_01_end on her (ON_TAKE_DAMAGE CreateEffect TARGET) as it breaks
  'mudrok/mudrok_buff_03_start': Object.freeze(cite('mudrok_t_1[shield_c]', [Object.freeze(['mudrok', 'mudrok_buff_01_end', 'own'])])),
});
const END_OF = new Map();   // enemy buff effect key → its end specs (wantedStatusFx, from fxgame.js enemyBuffFx)
/** Every effect key syncStatusFx turns on (and so may turn off): not the prep 'golden' glow of fxgolden.js. */
const MINE = new Set(Object.keys(STATUS_FX));

function put(out, k, spec) { if (spec && !out.has(k)) out.set(k, spec); }
const byName = (out, spec) => { if (spec) put(out, `${spec[0]}/${spec[1]}`, spec); };

/**
 * The effects `v` should show now: effect key → spec. STATUS_FX keys for the catalogue statuses (`stealth` already
 * resolved to the side's prefab key), `bundle/prefab` for the buff effects (SOURCE_FX / KEY_FX / LAYER_FX / STACK_FX).
 * `v.statusFrom` (UnitView.onStatus): status key → statusSource().
 */
export function wantedStatusFx(v, out = WANT, ebuff = null) {
  out.clear();
  const f = v.flags | 0;
  // 2026-10-21: an enemy's own buff effects (fxgame.js enemyBuffFx — its prefab's buffs; ebuff(view, kind, tag) → { on, ends })
  const own = v.isEnemy && typeof ebuff === 'function' ? (kind, tag) => ebuff(v, kind, tag) : null;
  const byOwn = (r) => { for (const s of r.on) { byName(out, s); const e = r.ends?.get(`${s[0]}/${s[1]}`); if (e) END_OF.set(`${s[0]}/${s[1]}`, e); } };
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
      if (per) {
        const e = per[from?.src || fxCode(v)];
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
        for (const [min, spec, below] of stacks) if (n >= bound(min, from) && (below == null || n < bound(below, from))) byName(out, spec);
        continue;
      }
      const s = statusFxKey(k);
      if (s === 'stealth' || s === 'camou') continue; // by the flags above (side, 迷彩)
      if (s) put(out, s, STATUS_FX[s]);
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
  for (const v of views.values()) {
    if (!v || typeof v.flags !== 'number') continue;
    v._statusIcons = icons;
    const on = v._fxStatusOn;
    const live = battle && v.alive && !v.prep && !v.remove;
    const want = live ? wantedStatusFx(v, WANT, ebuff) : (WANT.clear(), WANT);
    for (const [k, spec] of want) {
      if (on && on.has(k)) continue;
      const [bundle, name, frac, hold] = spec;
      if (fxGame.statusReady(bundle, name)) { MINE.add(k); fxGame.statusOn(v, bundle, name, k, frac, hold); }
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
