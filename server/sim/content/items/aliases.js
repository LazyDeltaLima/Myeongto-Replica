// server/sim/content/items/aliases.js — official item buff keys another season renamed with the same meaning: the same
// item, the same text and the same numbers under a new key. The prep side reads a renamed key as the default season's
// (server/match/builtinMeta.js, items/meta.js, content/coverage.js); a key whose item changed meaning is no alias —
// 规程's 寻呼模块 / 简易通讯机 take the operator's first bond only (use_equip_spe_goods_first_bond,
// equip_destory_first_bond_char), its 拟态物质 falls back to an operator of the same tier (use_equip_reward_same_tier),
// and they run nothing until they have handlers of their own.

/** Renamed key → the default season's key, each checked against both seasons' records (item, text, blackboard). */
export const BUFF_KEY_ALIASES = Object.freeze({
  use_equip_take_shop: 'use_equip_reward_random_char_chess_in_shop', // 紧急调度券 {count}
  use_equip_bond_layer: 'use_equip_reward_char_chess_bond_layer', // 随身身份牌 {layer}
  use_equip_next_gold: 'use_equip_gain_coin_when_next_round_start', // 见钱眼开玩偶 {count}
  equip_use_deploy: 'equip_destory_deployment_cnt_change', // 人事部文档 {count}
  equip_tier_recr_gift: 'use_equip_recruit_new_char_and_give_char_to_player_most_bond', // 信标 {refresh_cnt, choice_cnt}
});

/** The default season's name of an item buff key (itself when no season renamed it). @param {unknown} key */
export const canonicalBuffKey = (key) => (typeof key === 'string' && Object.hasOwn(BUFF_KEY_ALIASES, key) ? BUFF_KEY_ALIASES[key] : key);
