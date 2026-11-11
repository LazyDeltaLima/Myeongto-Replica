// server/sim/content/bands/progress.js — what a 规程 strategy stage shows of its progress (m.private bandSkill `tag` /
// `unlock`, server/match/match/bandSkill.js bandSkillView; the HUD portrait's pill and the 「{@tag}」 / 「{@unlock}」 of
// its text, public/js/ui/bandSkill.js).
//
//   tag     a stage whose table `showTag` is 'value_target' counts toward its effect: { value, target } read from the
//           counters its handler keeps (content/bands/meta.js — this file only reads them). 娜仁图亚 「获得3名【萨尔贡】
//           干员后」 → the <bond> chess counted toward the next discount / 3; 洛洛 → the <bond> chess bought since the last
//           item / 3; 玛恩纳 → the funds earned this round / 3; 裁度 → this round's manual refreshes / 1; 贾维 → the
//           refreshes toward the next grant / 4; the 「每回合首次…」 passives without a 「{@tag}」 in their text (巫恋,
//           复奏, 休露丝) → this round's uses / 1 (maintainer decision 2026-11-12).
//   unlock  a stage with a `next` counts toward it: { value, target } of its unlockType (the round, the 调度中心 level, the
//           funds spent in the match, the bond's counted members) — 琳琅诗怀雅 「消耗资金达到60时解锁{@unlock}」.
// Where and in which form the official client shows these is not in the tables [ASSUMED·화면: 공식 화면 미확인 — 값/목표를
// 초상 알약과 문구 자리에].
//
// ctx: { round, counter(key), roundStats(), shopLevel(), stats(), bondCount(id) } — the reads bandStageIndex's ctx has.

import { buffsOf, num } from '../support/index.js';

const int = (v, d = 0) => Math.trunc(num(v, d));
/** A per-round counter of meta.js roundCounter: 0 when it was last written in another round. */
const roundCount = (ctx, key) => (ctx.counter(`${key}:r`) === ctx.round ? ctx.counter(key) : 0);
const vt = (value, target) => ({ value: Math.max(0, Math.min(target, value)), target });

/** buff key → (ctx, params) → { value, target } */
const TAG = {
  gain_bond_cnt_shop_up_discount: (ctx, p) => vt(ctx.counter('band:narant:gained'), Math.max(1, int(p.count, 3))),
  buy_bond_char_cnt_gain_equip: (ctx, p) => { const t = Math.max(1, int(p.count, 3)); return vt(ctx.counter('band:lolo:bought') % t, t); },
  buy_bond_char_gain_coin: (ctx, p) => vt(roundCount(ctx, 'band:mlynar'), Math.max(1, int(p.max_count, 3))),
  n_round_refresh_cnt_gain_coin: (ctx, p) => vt(Number(ctx.roundStats()?.refreshes) || 0, Math.max(1, int(p.refresh_count, 1))),
  refresh_shop_count_gain_coin_bond_char_chess: (ctx, p) => { const t = Math.max(1, int(p.refresh_count, 4)); return vt(ctx.counter('band:chiave:refreshes') % t, t); },
  sell_char_swap_shop_char: (ctx, p) => vt(roundCount(ctx, 'band:vodfox'), Math.max(1, int(p.count, 1))),
  promote_char_extra_award: (ctx, p) => vt(roundCount(ctx, 'band:bonus'), Math.max(1, int(p.count, 1))),
  round_buy_bond_char_price: (ctx, p) => vt(roundCount(ctx, 'band:sciurus'), Math.max(1, int(p.n, 1))),
};

/** The stage's effect progress (null: the stage shows none, or its key keeps no count). */
export function stageTag(ctx, stage) {
  if (!stage || stage.showTag !== 'value_target') return null;
  for (const b of buffsOf(stage)) if (b.key && TAG[b.key]) return TAG[b.key](ctx, b.p);
  return null;
}

/** The progress toward the stage's `next` (null: the last stage, or an unlock type without a count). */
export function stageUnlock(ctx, stage) {
  const next = stage?.next;
  const a = Array.isArray(next?.unlockParams) ? next.unlockParams : [];
  switch (next?.unlockType) {
    case 'band_skill_load_by_round': return vt(ctx.round, Math.max(1, int(a[0], 1)));
    case 'band_skill_load_by_shop_lv': return vt(ctx.shopLevel(), Math.max(1, int(a[0], 1)));
    case 'band_skill_load_by_coin_cost': return vt(Number(ctx.stats()?.gold) || 0, Math.max(1, int(a[0], 1)));
    case 'band_skill_load_by_bond_act_count': return vt(ctx.bondCount(String(a[0] ?? '')), Math.max(1, int(a[1], 1)));
    default: return null;
  }
}

/** The keys this file reads a count for (tests: every value_target stage of the season has one, or a next). */
export const TAG_KEYS = Object.freeze(Object.keys(TAG));
