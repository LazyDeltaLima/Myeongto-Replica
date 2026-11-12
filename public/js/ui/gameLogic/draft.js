// ui/gameLogic/draft.js — 机变 and band-draft normalisation. Re-exported from ../gameLogic.js.

import { isObj } from './shared.js';
import { PHASE } from '../../../../shared/constants.js';
import { t } from '../../../../shared/i18n.js';


// ---- 机变 / band draft normalisation ----------------------------------------------------------------------

/**
 * Normalise m.public.draft ({order, turn, picks, skips?}) — tolerant of index/playerId turns and
 * object/array picks.
 * @param {any} draft
 * @param {any[]} [players]
 * @returns {{ order: string[], turnPid: string|null, picks: Map<string,string>, skipsLeft: Map<string, number>, done: boolean }}
 */
export function normalizeDraft(draft, players = []) {
  const ids = (Array.isArray(players) ? players : []).filter(isObj).map((p) => p.playerId);
  const order = Array.isArray(draft?.order) && draft.order.length ? draft.order.filter((x) => typeof x === 'string') : ids;
  let turnPid = null;
  if (typeof draft?.turn === 'string') turnPid = draft.turn;
  else if (Number.isInteger(draft?.turn) && draft.turn >= 0 && draft.turn < order.length) turnPid = order[draft.turn];
  const picks = new Map();
  const src = draft?.picks;
  if (Array.isArray(src)) {
    src.forEach((v, i) => {
      if (typeof v === 'string' && order[i]) picks.set(order[i], v);
      else if (isObj(v) && typeof v.playerId === 'string' && typeof v.bandId === 'string') picks.set(v.playerId, v.bandId);
    });
  } else if (isObj(src)) {
    for (const [k, v] of Object.entries(src)) if (typeof v === 'string' && v) picks.set(k, v);
  }
  const skipsLeft = new Map();
  const sk = draft?.skipsLeft ?? draft?.skips;
  if (isObj(sk)) for (const [k, v] of Object.entries(sk)) if (Number.isFinite(v)) skipsLeft.set(k, v);
  const done = order.length > 0 && order.every((pid) => picks.has(pid));
  return { order, turnPid, picks, skipsLeft, done };
}

/**
 * Normalise m.public.sp ({family, cards, turn, picks, order?}).
 * Cards: string ids or objects; picks: {playerId: cardIdx} | [{playerId, idx}] | card.takenBy.
 * @param {any} sp
 * @param {any[]} [players]
 */
export function normalizeSp(sp, players = []) {
  if (!isObj(sp)) return null;
  const ids = (Array.isArray(players) ? players : []).filter(isObj).map((p) => p.playerId);
  const order = Array.isArray(sp.order) && sp.order.length ? sp.order.filter((x) => typeof x === 'string') : ids;
  // up to 12: an 8-player match draws 12 cards (GameData.spDraftCards), every other match 6 or fewer
  const cards = (Array.isArray(sp.cards) ? sp.cards : []).slice(0, 12).map((c, idx) => {
    const card = typeof c === 'string' ? { id: c } : isObj(c) ? { ...c } : {};
    return { ...card, idx, takenBy: typeof card.takenBy === 'string' ? card.takenBy : null };
  });
  const takenBy = new Map(); // idx → playerId
  const pickOf = new Map(); // playerId → idx
  const src = sp.picks;
  const add = (pid, idx) => {
    if (typeof pid !== 'string' || !Number.isInteger(idx) || idx < 0 || idx >= cards.length) return;
    takenBy.set(idx, pid);
    pickOf.set(pid, idx);
  };
  if (Array.isArray(src)) src.forEach((v, i) => { if (isObj(v)) add(v.playerId, v.idx); else if (Number.isInteger(v) && order[i]) add(order[i], v); });
  else if (isObj(src)) for (const [k, v] of Object.entries(src)) add(k, v);
  if (isObj(sp.taken)) for (const [k, v] of Object.entries(sp.taken)) add(v, Number(k));
  for (const c of cards) if (c.takenBy) add(c.takenBy, c.idx);
  for (const c of cards) c.takenBy = takenBy.get(c.idx) ?? null;
  let turnPid = null;
  if (typeof sp.turn === 'string') turnPid = sp.turn;
  else if (Number.isInteger(sp.turn) && sp.turn >= 0 && sp.turn < order.length) turnPid = order[sp.turn];
  return {
    family: typeof sp.family === 'string' ? sp.family : null,
    name: typeof sp.name === 'string' && sp.name ? sp.name : null,
    desc: typeof sp.desc === 'string' && sp.desc ? sp.desc : null,
    untimed: !!sp.untimed,
    cards, order, turnPid, pickOf, takenBy, pickedCount: pickOf.size,
  };
}

/** Adapt only the recipient's current PREP choice; never write it into the public draft. */
export function normalizePersonalChoice(pub, priv, myId) {
  const choice = priv?.personalChoice;
  if (pub?.phase !== PHASE.PREP || !priv || priv.playerId !== myId || priv.alive === false
    || !choice || choice.round !== pub.round) return null;
  if (choice.kind === 'bandSkill') {
    // 规程's 更换指令 (server/match/match/bandSkill.js offerBandSkillChoice): cards of 指令, the source (投机骰子 — an item —
    // or the own strategy's 好多委托) and the 指令 it replaces (the taken one, else the own strategy's)
    const bs = isObj(priv.bandSkill) ? priv.bandSkill : null;
    return {
      ...normalizeSp({ family: 'command', name: t('更换指令'), desc: t('请选择一项指令'),
        cards: choice.cards, turn: myId, order: [myId], picks: {} }),
      id: choice.id,
      command: {
        sourceItemId: typeof choice.sourceItemId === 'string' ? choice.sourceItemId : null,
        ownBandId: typeof priv.bandId === 'string' ? priv.bandId : null,
        currentBandId: (typeof bs?.commandBandId === 'string' && bs.commandBandId) || (typeof priv.bandId === 'string' ? priv.bandId : null),
        currentStage: Number.isInteger(bs?.stage) ? bs.stage : null,
      },
    };
  }
  return {
    ...normalizeSp({ family: 'bounty', name: t('教鞭 · 战术特训'), desc: t('请选择一项战术特训'),
      cards: choice.cards, turn: myId, order: [myId], picks: {} }),
    id: choice.id,
  };
}

// ---- 规程's 确定自选编队 (screens/diyChoose.js; server/match/match/diyChoose.js) ----------------------------------------

/** The tier of an official 自选 slot id (chess_char_<tier>_diy<n>_a), or null. @param {any} id */
export function diySlotTier(id) {
  const n = Number(/^chess_char_(\d+)_diy/.exec(typeof id === 'string' ? id : '')?.[1]);
  return Number.isInteger(n) ? n : null;
}

/**
 * How many start steps a match of the season has before 协议启动: config.timers.enterSteps without BATTLE_CHECK — 盟约 2
 * (确认本局信息, 选择策略), 规程 3 (and CUSTOM_CHECK, 确定自选编队). 2 when the list is absent. The step headers' 「n/…」.
 * @param {any} config the season's config.json
 */
export function startStepCount(config) {
  const steps = Array.isArray(config?.timers?.enterSteps) ? config.timers.enterSteps : null;
  const n = steps ? steps.filter((s) => isObj(s) && typeof s.step === 'string' && s.step !== 'BATTLE_CHECK').length : 0;
  return n > 0 ? n : 2;
}

/**
 * The tier rows of 确定自选编队 (m.private.diyChoose { lineup, chosen, ready, perTier }): one per tier with a limit, in
 * tier order (5, 6 — the official screen's Ⅴ row above Ⅵ), each with its 自选编队 slots in lineup order, whether each is
 * chosen or out this match (`isOff`: all its bonds are off — the server leaves such a piece out of the shop, so the card
 * is 本局禁用 and cannot be chosen), and the count against the limit.
 * @param {any} view m.private.diyChoose
 * @param {string[]} [chosen] the chosen slots (default the view's)
 * @param {(slotId: string, pick: any) => boolean} [isOff]
 * @returns {Array<{ tier: number, limit: number, count: number, slots: Array<{ slotId: string, pick: any, chosen: boolean, off: boolean }> }>}
 */
export function diyChooseRows(view, chosen = view?.chosen, isOff = () => false) {
  const per = isObj(view?.perTier) ? view.perTier : {};
  const lineup = isObj(view?.lineup) ? view.lineup : {};
  const on = new Set(Array.isArray(chosen) ? chosen : []);
  return Object.keys(per).map(Number).filter((tier) => Number.isInteger(tier) && Number(per[tier]) > 0).sort((a, b) => a - b).map((tier) => {
    const slots = Object.keys(lineup).filter((id) => diySlotTier(id) === tier && isObj(lineup[id]))
      .map((slotId) => ({ slotId, pick: lineup[slotId], chosen: on.has(slotId), off: !!isOff(slotId, lineup[slotId]) }));
    return { tier, limit: Number(per[tier]), count: slots.filter((s) => s.chosen).length, slots };
  });
}

/**
 * A tap on a 确定自选编队 card: the chosen slots after it, in the order they were chosen. A chosen card leaves the choice;
 * another joins it, and when its tier is already at the limit the tier's earliest choice makes room (maintainer
 * decision 2026-11-11 [ASSUMED·화면: the official screens show no tap on a full tier]).
 * @param {string[]} order the chosen slots, earliest first
 * @param {string} slotId
 * @param {Record<number, number>} perTier
 * @returns {string[]}
 */
export function toggleDiyChoice(order, slotId, perTier) {
  const cur = (Array.isArray(order) ? order : []).filter((id) => typeof id === 'string');
  if (cur.includes(slotId)) return cur.filter((id) => id !== slotId);
  const tier = diySlotTier(slotId);
  const limit = Number(isObj(perTier) ? perTier[tier] : 0) || 0;
  if (limit <= 0) return cur;
  const same = cur.filter((id) => diySlotTier(id) === tier);
  const drop = new Set(same.slice(0, Math.max(0, same.length - limit + 1)));
  return [...cur.filter((id) => !drop.has(id)), slotId];
}
