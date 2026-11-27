// Client entry: boot (fonts, identity, socket), net → store wiring, router, global overlays.
//
// Router (derived from the store, no URL routes):
//   not entered            → Title
//   m.public.phase ≠ LOBBY → Game (screens/game.js: briefing / band draft / match / result by phase)
//   room.inMatch           → Game (match starting, m.public on its way)
//   in a room              → Room
//   otherwise              → Lobby
// Deep link `?room=CODE`: remembered at boot, auto-joined once the player has entered and the
// session is online (after a short grace period in case the server restores a room on resume).
// Reloading a tab that already passed the title re-enters automatically (sessionStorage flag) and
// resumes the server session with the saved token; stale room/match state is dropped if the
// server does not re-push it within RESTORE_GRACE_MS after `welcome`. Boot waits for
// `identity.init()` (which token this tab may use without stealing another live tab's session)
// before the first connect; a page restored from the back/forward cache reloads.
// A `welcome` with a NEW playerId (the server restarted / the session expired) while a room or match was on screen:
// toast 「服务器会话已重置，上一局模拟已结束」 (store.js sessionResetNotice) and return to the lobby with nothing stale.
//
// Shared modules are imported relatively ('../../shared/…' resolves to /shared/… in the browser).
// Multi-device support (ui/device.js + css/devices.css): feature classes on <html>, no page zoom, safe areas, rotation
// re-layout; ui/compat.js polyfills are imported before anything else.
// 干员调配 (DESIGN §16): an overlay over any route (<LoadoutHost/>, opened from lobby / room / briefing); its loadout is
// kept in sync with the server by installLoadoutSync (room.loadout after every welcome and edit), its 干员持有 tab's
// not-owned list (0.2.0 补位) by installOwnershipSync (room.ownership, likewise), the 自选编队 picks (0.2.0 DIY) by
// installDiySync (room.diy, likewise; it also keeps welcome.diyKitted for the picker).
// Game data: every text of the game is static data (/data/*.json) downloaded once per page; the in-match files are
// warmed in the background as soon as the player is in a room (warmGameData), before the match needs them; the match
// screen's code (render engine, browser sim, three.js, Pixi) from the lobby on (preload.js).
// Language (ui/lang.js, docs/I18N.md): chosen before the first render (initLang); App re-renders on a switch (useLang).
// Server texts are translated on arrival: m.toast / m.ticker frames (msgid + params, or the text as a msgid; a
// config.broadcasts line from its id + args), error codes (ui/toasts.js describeError) and room.closed reasons.

// Polyfills first (older Safari / Firefox ESR): every module evaluated after this one sees them.
import './ui/compat.js';
import { render } from '../vendor/preact.module.js';
import { useErrorBoundary } from '../vendor/hooks.module.js';
import { html, UiHosts, Button, MicroLabel, closeAllDialogs } from './ui/components.js';
import { ConnectionBanner } from './ui/connBanner.js';
import { ToastHost, toast, toastError, describeError } from './ui/toasts.js';
import { InviteSpectateHost, offerSpectate } from './ui/inviteSpectate.js';
import { net, identity, NetError, defaultWsUrl } from './net.js';
import { store, useStore, emptyMatch, selectRoute, sessionResetNotice, isSpectating, reservedRank } from './store.js';
/** @import { AppState, Bag } from './store.js' */
import { data } from './data.js';
import { resolveRuleset } from '../../shared/ruleset.js';
import { customBorrowIds } from '../../shared/seasonBorrow.js';
import { GAME_FILES } from './ui/gameComponents.js';
import { SIM_DATA_FILES } from './battle/runner.js';
import { preloadMatchCode } from './preload.js';
import { TitleScreen, sanitizeName } from './screens/title.js';
import { LobbyScreen, rememberRoom, parseRoomParam } from './screens/lobby.js';
import { RoomScreen, roomFacts } from './screens/room.js';
import { GameScreen } from './screens/game.js';
import { audio, installAudio } from './audio.js';
import { settingsStore } from './ui/settings.js';
import { showMatchToast } from './ui/gameLogic/settings.js';
import { GuideHost } from './ui/guide.js';
import { installDeviceSupport, useScreenWakeLock } from './ui/device.js';
import { isCombatPhase } from './ui/gameLogic/phases.js';
import { installPerfHud } from './ui/perfHud.js'; // `?perf=1`: frame / sim / render readout + the report's perf: lines
import { LoadoutHost } from './screens/loadout.js';
import { StatsHost } from './screens/stats.js';
import { recordResult, recordQuit, installStatsRecorder } from './ui/stats.js';
import { installLoadoutSync, installOwnershipSync, installDiySync, installSkinsSync, setLoadoutSeason } from './ui/loadoutSync.js';
import { installCardSync } from './ui/cardSync.js';
import { installSeasons, activeSeason, followActiveSeason, loadPickedSeason, inviteSeasonOf } from './ui/season.js';
import { installDiyPresets, setPresetSeason } from './ui/diyPresets.js'; // 맹약별 선발 프리셋 (per season)
import { setCustomRulesSeason } from './ui/customRulesStore.js';
import { startBuildGuard } from './ui/buildGuard.js';
import { installChat } from './ui/chat.js';
import { installRestartNotice } from './ui/restartNotice.js'; // the deploy's restart countdown
import { installGeneration, genUrl, pageGen, takeMoved } from './ui/generation.js'; // the deploy's server generation (no cut matches)
import { UpdateNotice } from './ui/updateNotice.js';
import { installMatchQueue } from './ui/matchQueue.js'; // 랜덤 매칭 (server/matchmaking.js)
import { installFeedback } from './ui/feedback.js'; // local patch: whether the server keeps feedback (welcome)
import { installGpuNotice } from './ui/gpuNotice.js'; // hardware acceleration off: say where to turn it on
import { installResources, ResourceHost, resStore } from './resources.js';
import { useSkinArt } from './ui/skins.js';
import { emoteSet } from '../../shared/emote-art.js';
import { initLang, useLang, tickerText } from './ui/lang.js';
import { statusBubbleFields } from './ui/statusBubbles.js';
import { t, N_, translateWire } from '../../shared/i18n.js';
import { PHASE } from '../../shared/constants.js';
import { mergePublic } from '../../shared/protocol.js';
import { battleArt } from './ui/battleArt.js';
import { recordError, installPageRecord } from './diag.js';
import { pushTraitFx } from './render/fxtrait.js'; // 2026-11-12: 规程's m.trait (the 特质 effect over a prep piece)

const RESTORE_GRACE_MS = 1500;
const JOIN_DELAY_MS = 350;
const TICKER_KEEP = 20;
const EMOTE_KEEP = 20;

const SCREENS = { title: TitleScreen, lobby: LobbyScreen, room: RoomScreen, game: GameScreen };

/** Copy of a server message without transport fields. @param {Bag} msg @returns {Bag} */
function payload(msg) {
  const { t, rid, ...rest } = msg; // eslint-disable-line no-unused-vars
  return rest;
}

function clearRoomParam() {
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has('room') && !url.searchParams.has('season')) return;
    url.searchParams.delete('room');
    url.searchParams.delete('season');
    history.replaceState(history.state, '', url.pathname + (url.search || '') + url.hash);
  } catch { /* ignore */ }
}

// ---- net → store wiring ---------------------------------------------------------------------------

let seq = 0;
let welcomeAt = 0;
let roomStateAt = 0;
let matchAt = 0;
/** @type {ReturnType<typeof setTimeout> | null} */
let restoreTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let joinTimer = null;
let joinInFlight = false;
/** @type {ReturnType<typeof startBuildGuard> | null} ui/buildGuard.js, started once the page is up */
let buildGuard = null;

function clearPendingJoin() {
  store.patch('ui', { pendingJoin: null, pendingSeason: null });
  clearRoomParam();
}

/** Auto-join the deep-linked room once entered + online (idempotent). */
function schedulePendingJoin() {
  clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (joinTimer));
  joinTimer = setTimeout(async () => {
    const s = store.get();
    const code = s.ui.pendingJoin;
    if (!code || joinInFlight || !s.session.entered || net.status !== 'online') return;
    if (s.room) {
      if (s.room.code !== code) toast(t('你已在其他同盟中，请先离开当前同盟'), 'warn');
      clearPendingJoin();
      return;
    }
    joinInFlight = true;
    try {
      await net.request('room.join', { code });
    } catch (err) {
      // no player seat in the invited co-op room: offer a spectator seat instead (ui/inviteSpectate.js)
      if (!offerSpectate(err, code)) toastError(err);
    } finally {
      joinInFlight = false;
      clearPendingJoin();
    }
  }, JOIN_DELAY_MS);
}

/** End the post-resume "syncing" state early once the server re-pushed what we were showing. */
function maybeFinishRestore() {
  const s = store.get();
  if (!s.ui.restoring) return;
  const roomOk = !s.room || roomStateAt >= welcomeAt;
  const matchOk = !s.match.public || matchAt >= welcomeAt || !s.room?.inMatch;
  if (roomOk && matchOk) {
    clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (restoreTimer));
    store.patch('ui', { restoring: false });
  }
}

/**
 * Leave whatever room / match was on screen for the lobby with nothing stale left behind: open imperative dialogs,
 * the post-resume restore timer, ticker lines and emote bubbles of the old match (the battle runner and the 暂离 flag
 * follow the store themselves).
 */
function backToLobby() {
  identity.rememberMatch(null);
  clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (restoreTimer));
  const s = store.get();
  if (s.room || s.match.public) closeAllDialogs();
  store.set({ room: null, match: emptyMatch(), ticker: [], emotes: [] });
  store.patch('ui', { restoring: false, serverLost: null });
}

/** @param {Bag} msg the `welcome` */
function onWelcome(msg) {
  identity.saveToken(msg.token);
  identity.rememberMatch(null);
  const prev = store.get();
  const prevId = prev.me.playerId;
  const name = typeof msg.name === 'string' && msg.name ? msg.name : prev.me.name;
  identity.saveName(name);
  store.set({ me: { playerId: msg.playerId ?? null, name, token: typeof msg.token === 'string' ? msg.token : null } });
  welcomeAt = Date.now();

  if (prevId != null && prevId !== msg.playerId) {
    // A brand-new server session (the server restarted — crashed / killed, so no room.closed arrived — or this session
    // expired on it): whatever we showed before is gone — back to the lobby cleanly and say why (over a running match:
    // the official server-lost dialog first, serverLost).
    const notice = sessionResetNotice(prev, msg.playerId);
    if (serverLostDue(prev)) serverLost(t(notice || SERVER_LOST_TIP));
    else {
      backToLobby();
      if (notice) toast(t(notice), 'warn', { ttl: 7000 });
    }
  } else if (prev.room || prev.match.public) {
    // Resumed session: the server re-pushes room/match state; drop whatever it doesn't.
    store.patch('ui', { restoring: true });
    clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (restoreTimer));
    restoreTimer = setTimeout(() => {
      const s = store.get();
      /** @type {Partial<AppState>} */
      const patch = {};
      if (s.room && roomStateAt < welcomeAt) patch.room = null;
      if (s.match.public && matchAt < welcomeAt) patch.match = emptyMatch();
      store.set(patch);
      store.patch('ui', { restoring: false });
    }, RESTORE_GRACE_MS);
  }
  schedulePendingJoin();
}

/** @param {Bag} msg the `room.state` */
function onRoomState(msg) {
  const room = payload(msg);
  roomStateAt = Date.now();
  const myId = store.get().me.playerId;
  /** @type {Array<Bag | null>} */
  const seats = Array.isArray(room.seats) ? room.seats : [];
  if (myId != null && seats.length && !seats.some((s) => s && s.playerId === myId) && !isSpectating(room, myId)) {
    // We are no longer seated (kicked / left elsewhere) — neither in a player seat nor a spectator seat.
    if (store.get().room) toast(t('你已不在该同盟中'), 'warn');
    store.set({ room: null, match: emptyMatch() });
    return;
  }
  const prevRoom = store.get().room;
  const sameRoom = !!prevRoom && prevRoom.code === room.code;
  // the briefing's vote ended the match (server phases.js maybeEndInfo): 'reroll'; the in-match vote (restart.js):
  // 'restart' — recorded as 中途退出 (本机统计, ui/stats.js recordQuit; maintainer decision 2026-10-31) before the state goes
  const lastPub = sameRoom && prevRoom.inMatch ? store.get().match.public : null;
  const outcome = lastPub?.restarted ? 'restart' : lastPub?.infoOutcome ?? null;
  if (outcome === 'restart' && !store.get().match.result) {
    try { recordQuit(store.get()); } catch (err) { console.warn('[stats] restart record failed', err); }
  }
  // A (new) match starts: forget the previous match's state so stale results never show — also when a briefing reroll
  // replaced the match while inMatch stayed true (a new matchNo).
  if (room.inMatch && !(sameRoom && prevRoom.inMatch && prevRoom.matchNo === room.matchNo)) {
    store.set({ match: emptyMatch() });
    if (outcome === 'reroll' && room.mode === 'coop') toast(t('已重新抽取本局信息'), 'info');
    if (outcome === 'restart' && room.mode === 'coop') toast(t('全员同意，从头开始'), 'success');
  } else if (!room.inMatch && outcome) {
    // a reroll the server could not start (the deploy's restart countdown, or an 8-seat room left with fewer than five
    // Doctors — server/lobby.js Room.seatsOpen): straight back to the room (there is no result to show)
    store.set({ match: emptyMatch() });
    if (lastPub?.restartTarget === 'room') toast(t('已返回等待室'), 'success');
    else toast(roomFacts(room, myId).seatsOpen ? t('八人同盟需至少 5 名博士才能开始，已返回等待室') : t('无法开始新的模拟，已返回等待室'), 'warn', { ttl: 6000 });
  }
  if (sameRoom && reservedRank(prevRoom, myId) && seats.some((seat) => seat?.playerId === myId)) toast(t('已按预约入座'), 'success');
  store.set({ room });
  identity.rememberMatch(room.inMatch && seats.some((seat) => seat?.playerId === myId)
    ? { name: store.get().me.name, code: room.code || '' } : null);
  if (room.mode === 'coop' && typeof room.code === 'string') rememberRoom(room.code);
  maybeFinishRestore();
}

/**
 * Server lost (the client's AutoChessBattleUIController._HandleServerLost → tab_server_lost_dialog; docs/rules/ui.md
 * 「공식 위수협약 UI」): a running match the server ended for this player (room.closed, or a brand-new session after the
 * server restarted) stays on screen under the official one-button dialog (screens/game.js) with the reason, and only its
 * 确认 leads to the lobby (the client's QuitGame) — without the local art: straight to the lobby with a toast, as before.
 */
const SERVER_LOST_TIP = N_('与服务器的连接已断开');
/** @param {AppState} s */
function serverLostDue(s) {
  const pub = s?.match?.public;
  if (!pub || !pub.phase || pub.phase === PHASE.LOBBY || pub.phase === PHASE.RESULT || s.match.result) return false;
  return !!battleArt('confirm').cls;
}
/** @param {string} text */
function serverLost(text) {
  closeAllDialogs(); // what they ask about is gone, and they would lie over this dialog's 确认
  identity.rememberMatch(null);
  store.patch('ui', { serverLost: { text } });
}

/** @type {Readonly<Record<string, string>>} */
const CLOSE_REASON = {
  // 'timeout' = this player was removed after staying disconnected past the lobby grace (server/lobby.js)
  host_left: N_('创建者已离开，同盟已解散'), timeout: N_('由于长时间断开连接，你已离开同盟'), empty: N_('同盟已解散'),
  kicked: N_('你已被移出同盟'), ended: N_('模拟已结束'), expired: N_('同盟已过期'), shutdown: N_('服务器维护中，同盟已关闭'),
  newVersion: N_('新版本已上线，请在新版本中重新创建同盟'),
};

function wireNet() {
  net.on('status', (snap) => {
    const cur = store.get().connection;
    store.set({
      connection: {
        status: snap.status, ping: snap.ping, attempt: snap.attempt, retryAt: snap.retryAt,
        lastError: snap.lastError, everOnline: cur.everOnline || snap.status === 'online', online: cur.online ?? null,
      },
    });
  });
  net.on('clock', (c) => store.set({ clock: { offset: c.offset, rtt: c.rtt, synced: c.synced } }));
  // the 在线 count beside the ping (components.js OnlinePill)
  net.on('pong', (m) => { if (Number.isInteger(m.n) && m.n !== store.get().connection.online) store.patch('connection', { online: m.n }); });
  net.on('welcome', onWelcome);
  net.on('helloError', (err) => {
    if (err.code === 'SESSION_IN_USE') {
      // another window still holds the seat after the retries (net.js IN_USE_RETRY_MS): this page goes on as a new
      // session, and the recovery dialog offers to continue the seat here instead (ui/resumeMatch.js)
      identity.rejectToken();
      if (identity.contested().length) { store.patch('ui', { seatElsewhere: true }); return; }
    }
    toastError(err);
  });
  net.on('replaced', () => {
    identity.replaced();
    toast(t('该身份已在其他页面登录，本页已断开'), 'warn', { ttl: 6000 });
  });
  net.on('unhandledError', (err) => toastError(err));
  net.on('room.state', onRoomState);
  // the page reads the data, the loadout and the statistics of the 卫戍协议 season on screen (ui/season.js activeSeason:
  // the room's — room.state `season`, absent = the default — else the picked one): shared/seasons.js, data.js setSeason
  // (the battle runner then loads the sim again with it), loadoutSync.js setLoadoutSeason — at once with the boot's
  // season (followActiveSeason), then on every change
  installSeasons({ net });
  followActiveSeason((season) => {
    data.setSeason(season);
    setPresetSeason(season); // first: the picks follower must not save one season's picks into the other's roster
    setLoadoutSeason(season);
    setCustomRulesSeason(season); // the 自定义 settings and presets name the season's own ids (ui/customRulesStore.js)
  });
  // what the room's custom ruleset borrows from other seasons' battlefields / 特训敌人 types (shared/seasonBorrow.js):
  // the data store — and the battle runner's sim — read those records too, as the server's match does
  const followBorrow = (/** @type {AppState} */ st) => {
    const rs = st.room ? st.match?.public?.ruleset ?? st.room.ruleset ?? null : null;
    data.setBorrow(rs ? customBorrowIds(resolveRuleset(rs).custom) : null);
  };
  store.subscribe((s, prev) => { if (s.room !== prev.room || s.match?.public?.ruleset !== prev.match?.public?.ruleset) followBorrow(s); });
  followBorrow(store.get());
  net.on('room.closed', (msg) => {
    // a waiting room the draining server closed: it stays on screen under the move dialog, which says whether it comes
    // back on the new server, while the page reloads onto it (ui/generation.js, ui/updateNotice.js) — no toast
    if (msg.reason === 'newVersion' && pageGen()) return;
    const known = Object.hasOwn(CLOSE_REASON, String(msg.reason)) ? CLOSE_REASON[msg.reason] : null;
    const text = known ? t(known) : typeof msg.reason === 'string' && msg.reason.length < 60 ? t('同盟已关闭：{reason}', { reason: msg.reason }) : t('同盟已关闭');
    if (serverLostDue(store.get())) { serverLost(text); return; }
    backToLobby();
    toast(text, 'warn');
  });
  // a broadcast is a delta: merged onto the m.public held (shared/protocol.js mergePublic)
  net.on('m.public', (msg) => { matchAt = Date.now(); store.patch('match', { public: mergePublic(store.get().match.public, payload(msg)) }); maybeFinishRestore(); });
  net.on('m.private', (msg) => { matchAt = Date.now(); store.patch('match', { private: payload(msg) }); });
  // upstream #482: the own bond's layers rose in 回合开始 / 机变 / 休整期 (the server sends it live only, never on a resync)
  net.on('m.layer', (msg) => {
    const s = store.get();
    if (selectRoute(s) === 'game' && msg.playerId === s.me?.playerId) audio.layerGain(msg.bondId, msg.add);
  });
  // 规程: a 特质 of the own piece ran in the preparation — its effect over the piece (render/fxtrait.js; live only)
  net.on('m.trait', (msg) => { if (selectRoute(store.get()) === 'game') pushTraitFx(msg); });
  net.on('m.field', (msg) => store.patch('match', { field: payload(msg) }));
  net.on('m.result', (msg) => {
    const res = payload(msg);
    // 콘솔 모드 (server/local-console.js): 「로비로」 goes straight back to the room; a console match keeps no record
    if (res?.reason === 'consoleLobby') { store.set({ match: emptyMatch() }); return; }
    store.patch('match', { result: res });
    if (res?.reason === 'console' || store.get().match.public?.console) return;
    // 本机统计 (PR #323): every arrival, including the lobby's result replay after a reconnect / reload —
    // replays dedupe by content id inside recordResult (spectator seats' copies build no record at all)
    recordResult(res, { myId: store.get().me.playerId, roomMode: store.get().room?.mode ?? null, ruleset: store.get().match.public?.ruleset ?? store.get().room?.ruleset ?? null, season: store.get().room?.season ?? null, now: Date.now() });
  });
  net.on('m.toast', (msg) => {
    const kind = ['info', 'success', 'warn', 'error'].includes(msg.kind) ? msg.kind : 'info';
    if (!showMatchToast(settingsStore.get())) return; // settings → 「对局通知」 off
    // msgid + params (server ≥ 0.2.0) or the text itself as a msgid, in the current language
    toast(translateWire(msg), kind);
  });
  net.on('m.ticker', (msg) => {
    if (typeof msg.text !== 'string') return;
    const text = tickerText(msg);
    // type, player + the round it came in: a BOSS_HIT line is dropped once its boss round is over and superseded by the
    // same player's next one (ui/ticker.js tickerLineLive / tickerSupersedes)
    const type = typeof msg.type === 'string' ? msg.type : null;
    const playerId = typeof msg.playerId === 'string' ? msg.playerId : null;
    // its broadcast priority: the strip plays the highest first (ui/ticker.js enqueueTickerLines)
    const priority = Number.isFinite(msg.priority) ? msg.priority : 0;
    // what 规程's avatar bubbles draw (ui/statusBubbles.js): the line's args (SHOP_LEVEL's level), an elite's chess and
    // what it fields as, a leader-damage line's step and percent
    const bubble = statusBubbleFields(msg);
    store.set((s) => ({ ticker: [...s.ticker.slice(-(TICKER_KEEP - 1)), { id: ++seq, text, at: Date.now(), type, playerId, round: s.match?.public?.round ?? null, priority, ...bubble }] }));
  });
  net.on('m.emote', (msg) => {
    store.set((s) => ({ emotes: [...s.emotes.slice(-(EMOTE_KEEP - 1)), { seq: ++seq, playerId: msg.playerId, id: msg.id, set: emoteSet(msg.set), at: Date.now() }] }));
  });

  // Entering (title → lobby) while already online also needs the deep-link join.
  store.subscribe((s, prev) => {
    // the server-lost dialog's 确认 (screens/game.js) clears it: now leave the dead match
    if (prev.ui.serverLost && !s.ui.serverLost) backToLobby();
    if (s.session.entered && !prev.session.entered) {
      schedulePendingJoin();
      preloadMatchCode(); // the match screen's code, while the player is in the lobby (preload.js)
    }
    // in a room (co-op or solo, also a resumed one) a match is near: its data starts downloading
    if (s.room && !prev.room) warmGameData();
    // a room this page leaves (放弃模拟 / 离开同盟 / no longer seated) is no seat another window may recover
    if (prev.room && !s.room) identity.rememberMatch(null);
  });
}

/**
 * Download every data file of the match UI (gameComponents GAME_FILES: operators, skills, bonds, items, enemies, 特质 …)
 * and of the browser battle simulation (battle/runner.js SIM_DATA_FILES, which takes them from this store) in the
 * background once the player is in a room — a match is near (the lobby alone never downloads them). The game's
 * texts are static data loaded once per page — never fetched during a match — and the match screen waits for these
 * files, so with them warmed it opens at once and no text ever appears late (user playtest #3 item 9). Idempotent (the
 * data store shares each file's promise); the match code too (preload.js), for a page that skipped the lobby.
 */
function warmGameData() {
  preloadMatchCode();
  const go = () => { data.loadAll(GAME_FILES, SIM_DATA_FILES).catch(() => {}); };
  if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(go, { timeout: 2500 });
  else setTimeout(go, 600);
}

// ---- UI chrome (the connection banner lives in ui/connBanner.js) -----------------------------------

/** @param {{ error: Error, reset: () => void }} props */
function ScreenCrashed({ error, reset }) {
  return html`<div class="screen crash">
    <div class="crash__box brackets">
      <${MicroLabel} tone="mint">SYSTEM FAULT<//>
      <h2>${t('界面发生错误')}</h2>
      <p class="t-lo">${String(error?.message || error).slice(0, 200)}</p>
      <${Button} variant="primary" icon="refresh" onClick=${reset}>${t('重新加载界面')}<//>
    </div>
  </div>`;
}

function App() {
  const route = useStore(selectRoute);
  // settings → 通用 「保持屏幕常亮」 (ui/settings.js WakeLockSetting): one lock for the whole app, so the reasons can overlap;
  // 'combat' = this match's combat phases for a seat or a spectator, until its result
  const wakeMode = useStore((s) => s.screenWakeLock, Object.is, settingsStore);
  const combat = useStore((s) => selectRoute(s) === 'game' && !s.match.result && isCombatPhase(s.match.public?.phase));
  useScreenWakeLock(wakeMode === 'always' || (wakeMode === 'combat' && combat));
  useLang(); // a language switch re-renders the whole tree in place
  useSkinArt(); // so does a change of the operator skins' pictures (the choice, the catalogue, the skin data downloaded: ui/skins.js skinArt)
  const [error, resetError] = useErrorBoundary((err) => { console.error('[ui] screen crashed', err); recordError('ui', err, 'screen crashed'); });
  const Screen = SCREENS[route] || LobbyScreen;
  return html`<div class="app-root">
    <div class="app-bg" aria-hidden="true"></div>
    ${error ? html`<${ScreenCrashed} error=${error} reset=${resetError} />` : html`<${Screen} key=${route} />`}
    <${ConnectionBanner} />
    <${UpdateNotice} />
    <${ToastHost} />
    <${UiHosts} />
    <${InviteSpectateHost} />
    <${ResourceHost} />
    <${GuideHost} />
    <${LoadoutHost} />
    <${StatsHost} />
  </div>`;
}

// ---- boot -----------------------------------------------------------------------------------------

/** @param {number} ms */
async function waitForFonts(ms) {
  const fonts = document.fonts;
  if (!fonts || typeof fonts.load !== 'function') return;
  const loads = [
    fonts.load('900 1em "Noto Sans SC"', '卫戍协议盟约'), // i18n-ignore (font sample)
    fonts.load('700 1em "Noto Sans SC"', '开始'), // i18n-ignore (font sample)
    fonts.load('500 1em "Lexend Exa 500"', '0123456789'), // --font-num (css/theme.css)
    fonts.load('700 1em "Lexend Exa"', '0123456789'), // the official Bold spots
    fonts.load('700 1em Rajdhani', '0123456789'),
  ].map((p) => p.catch(() => null));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, ms))]);
}

function installGlobalErrorHandlers() {
  window.addEventListener('unhandledrejection', (ev) => {
    const err = ev.reason;
    // Media autoplay/abort rejections (audio.play() before a user gesture, interrupted loads) are
    // expected browser behaviour, not app errors: log quietly, never toast.
    if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) { console.warn('[app] ignored rejection', err.name); return; }
    console.error('[app] unhandled rejection', err);
    recordError('rejection', err);
    if (err instanceof NetError) toastError(err);
    else toast(t('发生意外错误：{error}', { error: describeError(err) }).slice(0, 120), 'error');
  });
  window.addEventListener('error', (ev) => {
    if (!(ev instanceof ErrorEvent)) return; // resource load errors are not script errors
    console.error('[app] uncaught error', ev.error || ev.message);
    recordError('error', ev.error || ev.message, ev.error ? null : `${ev.filename || '?'}:${ev.lineno || 0}:${ev.colno || 0}`);
  });
}

async function boot() {
  installGlobalErrorHandlers();
  // this page's report lines kept for the page after it: a phone that ends the page loses nothing (diag.js)
  installPageRecord();
  // touch / hover / fullscreen classes, zoom-gesture blocking, rotation re-layout (ui/device.js, css/devices.css)
  installDeviceSupport();
  installPerfHud();
  // A page restored from the back/forward cache has a dead socket and a stale token choice: start over.
  window.addEventListener('pageshow', (ev) => { if (ev.persisted) location.reload(); });
  // Pick this tab's reconnect token (asks other live tabs; ≤150 ms) while fonts load.
  const identityReady = identity.init();

  const pendingJoin = parseRoomParam(location.search);
  const pendingSeason = inviteSeasonOf(location.search, !!pendingJoin);
  const savedName = sanitizeName(identity.loadName());
  const entered = identity.wasEntered() && !!savedName;
  store.set((s) => ({
    me: { ...s.me, name: savedName },
    session: { entered },
    ui: { ...s.ui, pendingJoin, pendingSeason, season: loadPickedSeason(), updated: takeMoved() }, // this tab just moved onto a new version (ui/updateNotice.js)
  }));

  wireNet();
  installStatsRecorder(store); // follows the match on screen, so a 放弃模拟 can be recorded (ui/stats.js)
  installLoadoutSync({ net });
  installChat();
  installRestartNotice({ net, onRestarted: () => { buildGuard?.burst().catch(() => {}); } });
  installGeneration({ net, inMatch: () => selectRoute(store.get()) === 'game', wsUrl: () => defaultWsUrl() });
  installMatchQueue({ net });
  installFeedback({ net });
  installResources();
  installOwnershipSync({ net });
  installDiySync({ net });
  installCardSync({ net }); // 名片干员: the operator on this browser's seat card (room.card, ui/seatArt.js)
  installSkinsSync({ net, pack: resStore }); // operator skins (room.skins, ui/skins.js), sent while the skin data is chosen
  installDiyPresets();
  net.attachBrowserHooks();
  // Audio: unlock on first gesture, BGM follows the route / match phase (js/audio.js).
  installAudio({ getManifest: () => data.get('assets'), subscribe: store.subscribe, getState: store.get, selectRoute, selectSeason: activeSeason, settings: settingsStore.get() });
  data.load('assets').catch(() => {});
  // Warm the data cache in the background (missing files are tolerated).
  data.loadAll('config').catch(() => {});
  // Optional local-client art manifest (emotes, tutorial pages, official UI sprites; DESIGN §13).
  data.load('local').catch(() => {});

  const connectWhenReady = identityReady.then(() => {
    // the seat this page would have resumed is held by another live window of this browser: offer it here
    if (identity.contested().length) store.patch('ui', { seatElsewhere: true });
    if (entered) net.setName(savedName);
    else net.connect();
  });
  // the language (and its UI translations) before the first render: no Chinese flash for an English player
  const langReady = initLang().catch((err) => console.warn('[app] language setup failed', err));
  await Promise.all([waitForFonts(1200), connectWhenReady, langReady]);
  const root = document.getElementById('app');
  render(html`<${App} />`, /** @type {HTMLElement} */ (root));
  installGpuNotice({ store }); // after langReady: the toast's text is translated when it is shown

  const splash = document.getElementById('boot');
  if (splash) {
    splash.classList.add('is-done');
    setTimeout(() => splash.remove(), 300);
  }
  // the season's entry animation before the title screen (ui/entryFilm.js: 盟约's opening, 规程's hub clip); never over a
  // restored match, and only while the season on screen is the one whose film plays
  const filmSeason = activeSeason(store.get());
  import('./ui/entryFilm.js')
    .then((m) => m.playEntryFilm({ season: filmSeason, skip: () => selectRoute(store.get()) === 'game' || activeSeason(store.get()) !== filmSeason }))
    .catch((err) => console.warn('[app] entry film unavailable', err));
  // `import`: a module of this page by its path from /js/ (`__SP__.import('./ui/lang.js')`, tests and the console). The
  // page loads its modules under the build's /b/<tag>/r/ URLs (server/http/buildTag.js), so an absolute import('/js/…')
  // would load a second copy with its own state, not the page's.
  globalThis.__SP__ = { store, net, data, version: 1, import: (/** @type {string} */ p) => import(new URL(p, import.meta.url).href) };
  // A page keeps the modules it imported at load time for its whole lifetime, so a deploy cannot reach an open tab
  // (ui/buildGuard.js): watch `/healthz.build`. Outside a match the page reloads itself; during a match the guard says
  // so instead (the connection banner offers 刷新页面) and reloads once the match — settlement screen included — is over,
  // so a running game is never thrown away.
  // A restart the page heard of is over (ui/restartNotice.js onRestarted): the guard checks at once, not within two minutes.
  try {
    buildGuard = startBuildGuard({
      fetchFn: (/** @type {string} */ url, /** @type {RequestInit} */ init) => globalThis.fetch(genUrl(url), init), // this tab's server during a deploy (ui/generation.js)
      inMatch: () => selectRoute(store.get()) === 'game',
      onStale: ({ waiting }) => { if (waiting) store.patch('ui', { buildStale: true }); },
    });
  } catch (err) {
    console.warn('[app] build guard failed to start', err);
  }
}

boot().catch((err) => {
  console.error('[app] boot failed', err);
  const el = document.getElementById('boot-err');
  if (el) el.textContent = t('启动失败，请刷新页面重试');
});
