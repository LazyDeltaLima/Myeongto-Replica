// In-match intents (`g.*`, DESIGN §8.2) with uniform error handling: every request goes through
// `act()`, which plays a UI sound on success, shows the ERR_TEXT toast on failure (ui/matchToast.js) and never throws.
// The UI never mutates state optimistically — it waits for the next m.private / m.public push.
// `net.request` is looked up at call time so the dev mock harness can stub it.

import { net } from '../net.js';
import { matchToast, matchToastError } from './matchToast.js';
import { t } from '../../../shared/i18n.js';
import { audio } from '../audio.js';

/** @type {Readonly<Record<string, string>>} */
const SUCCESS_SFX = {
  'g.buy': 'buy', 'g.sell': 'sell', 'g.refresh': 'refresh', 'g.freeze': 'freeze', 'g.levelUp': 'levelup',
  'g.move': 'drop', 'g.equip': 'equip', 'g.art': 'artPlace', 'g.reward': 'pick', 'g.choice': 'pick',
  'g.band': 'confirm', 'g.bandSkip': 'back', 'g.infoReady': 'ready', 'g.infoReroll': 'confirm', 'g.draftReady': 'ready', 'g.emote': 'emote', 'g.destroy': 'back',
};

let inflight = 0;
/** @type {Set<(n: number) => void>} */
const busyListeners = new Set();
const emitBusy = () => { for (const fn of [...busyListeners]) { try { fn(inflight); } catch { /* ignore */ } } };

/** Subscribe to the number of in-flight intents (for subtle busy indicators). @param {(n: number) => void} fn */
export function onBusy(fn) { busyListeners.add(fn); return () => busyListeners.delete(fn); }

// Single-flight shop refresh (upstream #501): under a high round trip the shop has not answered yet while the player taps
// 刷新 again, and every extra g.refresh the client sends is a paid refresh (server match/match/intents.js → ps.refresh).
// A refresh while the previous request is still on the wire is dropped; the 刷新 button dims (ui/shopBar.js subscribes
// to onRefreshBusy) and the R hotkey, which calls the same actions.refresh, stays inert until the reply lands.
let refreshPending = false;
/** @type {Set<(busy: boolean) => void>} */
const refreshBusyListeners = new Set();
const emitRefreshBusy = () => { for (const fn of [...refreshBusyListeners]) { try { fn(refreshPending); } catch { /* ignore */ } } };

/**
 * Subscribe to the shop refresh's in-flight state — fires once with the current state.
 * @param {(busy: boolean) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onRefreshBusy(fn) {
  refreshBusyListeners.add(fn);
  try { fn(refreshPending); } catch { /* ignore */ }
  return () => { refreshBusyListeners.delete(fn); };
}

/**
 * Send an intent. Resolves true on `ok`, false on error (already toasted).
 * @param {string} t
 * @param {object} [fields]
 * @param {{ sfx?: string|false, quiet?: boolean, errorText?: Record<string, string> }} [opts] errorText: the line an
 *   error code shows in place of its ERR_TEXT
 * @returns {Promise<boolean>}
 */
export async function act(t, fields = {}, opts = {}) {
  inflight += 1;
  emitBusy();
  try {
    await net.request(t, fields);
    const s = opts.sfx === undefined ? SUCCESS_SFX[t] : opts.sfx;
    if (s) audio.sfx(s);
    return true;
  } catch (/** @type {any} */ err) {
    if (!opts.quiet) {
      const own = opts.errorText?.[err?.code];
      if (own) matchToast(own, 'warn');
      else matchToastError(err); // (none with settings → 「对局通知」 off)
      audio.sfx('error', { volume: 0.6 });
    }
    return false;
  } finally {
    inflight = Math.max(0, inflight - 1);
    emitBusy();
  }
}

export const actions = {
  infoReady: () => act('g.infoReady'),
  // the briefing's 重新抽取 vote (server phases.js maybeEndInfo)
  infoReroll: () => act('g.infoReroll'),
  // ... and its withdrawal while the vote is open
  infoRerollCancel: () => act('g.infoReroll', { cancel: true }, { sfx: 'back' }),
  // 规程 solo: the core bond group this match plays (server phases.js pickBondGroup; again until the seat is ready)
  bondGroup: (/** @type {number} */ idx) => act('g.bondGroup', { idx }, { sfx: 'pick' }),
  // the in-match 重新开始 vote (server restart.js): propose / yes / no / cancel; a proposal within a minute of the
  // proposer's last failed vote is refused (RATE) with its own line
  restartVote: (/** @type {string} */ op, target = 'restart') => act('g.restart', { op, target }, { sfx: op === 'no' || op === 'cancel' ? 'back' : 'confirm', errorText: { RATE: t('稍后才能再次发起重新开始') } }),
  // a spectator seat's reservation of the next free player seat (server/lobby.js header)
  reserveSeat: (/** @type {boolean} */ on) => act('room.reserveSeat', { on }, { sfx: on ? 'confirm' : 'back' }),
  band: (/** @type {string} */ bandId) => act('g.band', { bandId }),
  bandSkip: () => act('g.bandSkip'),
  // 规程's active 指令 (server match/bandSkill.js): {} for a 点击使用 stage, else the target — uid | slot | row + col (ui/bandSkill.js)
  bandSkill: (fields = {}) => act('g.bandSkill', fields, { sfx: 'confirm' }),
  // the strategy draft's 编队确认 (after the last pick): done
  draftReady: () => act('g.draftReady'),
  // 规程's 确定自选编队 (server diyChoose.js): the slots brought into the match, then 准备就绪 / 取消准备
  // a failure toasts (the screen then shows the server's choice again: screens/diyChoose.js settleDiyChoice)
  diyChoose: (/** @type {string[]} */ slots) => act('g.diyChoose', { slots }, { sfx: false }),
  diyReady: (cancel = false) => act('g.diyReady', cancel ? { cancel: true } : {}, { sfx: false }),
  /** @param {number} slot @param {{ sfx?: string | false, quiet?: boolean }} [opts] */
  buy: (slot, opts) => act('g.buy', { slot }, opts), // local patch: `opts` (screens/game.js — an operator's purchase sounds as its drop-in)
  // a refresh while the previous g.refresh is still on the wire is dropped (upstream #501, onRefreshBusy above)
  refresh: () => {
    if (refreshPending) return Promise.resolve(false);
    refreshPending = true;
    emitRefreshBusy();
    return act('g.refresh').finally(() => { refreshPending = false; emitRefreshBusy(); });
  },
  freeze: () => act('g.freeze'),
  levelUp: () => act('g.levelUp'),
  sell: (/** @type {number} */ uid) => act('g.sell', { uid }),
  // `dir` (UP|RIGHT|DOWN|LEFT): the direction chosen with the deploy wheel (research 09 §6.1 — g.move / g.art carry it;
  // the server defaults to RIGHT when absent)
  /** @param {number} uid @param {unknown} to @param {string} [dir] */
  move: (uid, to, dir) => act('g.move', dir ? { uid, to, dir } : { uid, to }),
  // `replaceUid`: the equipped item the replace dialog picked (ui/equipReplace.js) — it is destroyed; absent ⇒ none needed
  /** @param {number} itemUid @param {number} targetUid @param {number} [replaceUid] */
  equip: (itemUid, targetUid, replaceUid) => act('g.equip', Number.isInteger(replaceUid) ? { itemUid, targetUid, replaceUid } : { itemUid, targetUid }),
  /** @param {number} itemUid @param {number} row @param {number} col @param {string} [dir] */
  art: (itemUid, row, col, dir) => act('g.art', dir ? { itemUid, row, col, dir } : { itemUid, row, col }),
  destroy: (/** @type {number} */ uid) => act('g.destroy', { uid }),
  reward: (/** @type {number} */ idx) => act('g.reward', { idx }),
  /** @param {number} idx @param {string} [choiceId] */
  choice: (idx, choiceId) => act('g.choice', choiceId === undefined ? { idx } : { idx, choiceId }),
  surrender: (/** @type {{ fieldId: string, battleId: string }} */ field, op = 'propose') => act('g.surrender', { fieldId: field.fieldId, battleId: field.battleId, op },
    { sfx: op === 'no' || op === 'cancel' ? 'back' : 'confirm', errorText: { RATE: t('稍后才能再次发起放弃战斗') } }),
  ready: (/** @type {boolean} */ ready) => act('g.ready', { ready }, { sfx: ready ? 'ready' : 'back' }),
  /** @param {string} id @param {string} [set] */
  emote: (id, set) => act('g.emote', set === 'user' ? { id, set } : { id }, { quiet: true }), // local patch: emote set
  // `playerId`: the player tapped in the team panel (a shared field shows two) — what an eliminated viewer follows
  watch: (/** @type {string} */ fieldId, /** @type {string | null} */ playerId = null) => act('g.watch', typeof playerId === 'string' && playerId ? { fieldId, playerId } : { fieldId }, { sfx: 'tab' }),
  autoplay: (/** @type {boolean} */ on) => act('g.autoplay', { on }),
  // solo battles only (ui/matchStatus.js pauseAvailable): m.public.paused follows
  pause: (/** @type {boolean} */ on) => act('g.pause', { on: !!on }, { sfx: on ? 'click' : 'confirm' }),
};
