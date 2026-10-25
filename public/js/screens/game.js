// Game screen — every in-match screen, dispatched by m.public.phase (DESIGN §10):
//   INFO_CHECK → Briefing (screens/briefing.js), BAND_DRAFT → Band draft (screens/bandDraft.js),
//   RESULT / m.result → Result (screens/result.js), everything else → MatchScreen below.
//
// MatchScreen = full-screen field view (render engine per DESIGN §9, DOM fallback when it can't load)
// with the DOM HUD layered on top: top bar, bond strip + popup, team panel (click = g.watch), effects, the round damage
// chip and panel (ui/roundDamage.js: under the effects on a desktop, under the team panel on a phone),
// shop bar (prep), merge-reward and 机变 overlays, detail panel, enemy / match-info drawer, combat HUD
// (DP, "作战结束，等待队友完成作战" + teammates' progress, observing pill, 联防 / 最终攻势 ‹ › camera halves),
// phase banners, the own battle's end (the official round_result_dialog banner and its BATTLEOVER sound once per round:
// when the own result comes in in solo, at SETTLE in co-op (after a 联防) and when no result came: ui/gameLogic/phases.js holdsBattleEnd /
// settleBattleEnd), ticker, emote wheel + bubbles,
// settings, exit flow. Drag & drop from the view: pieceDrop on a board tile (also the piece's own tile) opens the
// direction wheel (ui/facingWheel.js, research 09 §1.2) and its release sends g.move {uid, to, dir} (g.art {…, dir}
// for 画卷); pieceDrop on a bench slot → g.move; items → g.equip (confirm when replacing) / g.art. Equipment
// released over an operator's sprite equips that operator even when the tile under the pointer is the one behind
// it; a refused drop toasts the reason (gameLogic dropFailureReason / canPlace). Tapping an own piece selects it:
// its underframe (ui/underframe.js: 撤退 / 出售 +N / 销毁), its rotated range tiles and its detail card; right-click /
// long-press opens the detail card only. There is no drag-to-sell. The own board is drawn and checked with the
// player's stage overrides (terrain 机变 cards: gameLogic stageOverrides / effectiveStage); in a boss round's prep the
// legality reads the player's half of the boss field (gameLogic deployFieldOf, user playtest #5 item 7).
// Shortcuts (设置 → 快捷键; the official defaults D refresh, S freeze, G level-up, A shop, C ready, X sell, W enemy pen,
// Q retreat, Space pause), Esc closes the topmost popup.
// The UI never mutates match state locally; it re-renders from m.public / m.private / m.field pushes.
// Client-side combat (DESIGN §14, m.public.combatMode 'client'): battles are simulated in this browser by
// battle/runner.js, which publishes the battle's field meta into store.match.field and feeds the view the same b.snap /
// b.ev frames the server used to stream. Observing follows research 09 §3.1 (battle/observe.js): a teammate row →
// 前往查看 → a local replica, 返回战场 goes back — also while the own normal battle runs (maintainer decision 2026-10-25,
// the next season's convenience; the official current season refused it): the own battle goes on off screen (the
// runner's state().mine says when it ends), its progress row "你自己" sits under the observing pill; in 联防 / 最终攻势
// the ‹ › pill switches the camera between the field's halves and 全景.
// Enemy preview pen (research 09 §2 / §6.2 item 3): in 休整期 the right HUD 🔍▶▶ pans the camera to the pen
// (view.setCamera('pen')); the left button turns into 🔍◀◀ and returns to the camera in use before (the grey right
// button, Esc or any camera change of the game flow return too). The shop bar folds away while the pen is shown and
// comes back as it was. Tapping an enemy in the pen (view pieceClick with `enemyKey` / a `preview` enemy unit) opens its
// detail card; the old enemy list lives on as the 敌方情报 tab of the 本局信息 dialog (left 🔍).
// Every camera request of this screen goes through setCam (it remembers the camera the pen returns to);
// `.gm[data-camera]` mirrors the current camera kind (E2E / styling). Folding the shop bar (收起) on the own prep board
// flies the camera to the official shop-collapsed framing and unfolding back to the shop camera (public issue #5:
// gameLogic prepCameraFor / foldCamera — never over the pen, a teammate's board or a battle; deferred while a piece is
// dragged or its direction is chosen).
// Equipment dropped on an operator whose two slots are used opens the equip-replace dialog (ui/equipReplace.js): the
// player picks the equipped item to destroy → g.equip {itemUid, targetUid, replaceUid}; 取消 sends nothing. 销毁 is only
// offered for loose items (equipped ones are locked, ui/facing.js itemDestroyable).
// Solo battles (ui/matchStatus.js pauseAvailable): the top bar's pause button / the pause key send g.pause {on}; m.public.paused
// shows the paused overlay (继续作战 / 放弃模拟) and freezes the HUD clocks. Boss rounds: the top bar shows the level's
// 120 s countdown and the red DOT overtime warning (m.public.overtimeAt).
// User playtest #3: the own LP's −N tick grows while the own battle's enemies enter the blue gate (item 2: the runner's
// state().leaks → ui/hud.js liveLp → top bar + own team row; teammates' rows from m.public players[].pendingLp; in 联防 a
// leaker's enemies still standing — runner state().uniteLeft / m.public players[].uniteLeft, the ×N tag — user
// playtest #6 item 7); while the temp overflow row (临时整备区) holds pieces it is framed and labelled on the board
// (ui/underframe.js TempRowNotice) and 准备就绪 / Space say why they are refused (item 3).
// User playtest #4: the detail card shows live stats (item 7) — in battle the local sim's unit (battle/runner.js
// unitStats), in prep an own board unit's start-of-battle stats (g.unitStats → m.unitStats); 机变 cards take two taps
// (item 2, ui/choiceOverlay.js).
// Merges (user playtest #6 follow-up, PRTS 卫戍协议/帮助 "若消耗已部署至作战区的干员，则发送至作战区对应位置"): a shop /
// reward card armed for a purchase that completes a merge lights, in gold, the board tile its elite will take (the
// deployed copy that deploys first, gameLogic.mergeTarget — none when no copy is deployed: the elite goes to the hand);
// the elite then appears there with the promotion cue (render/app.js setPrep → fx.promote).
// The bond strip, its popup and a unit card's bond chips follow the player on screen (DESIGN §20.15, ui/watchBonds.js):
// a scouted / watched / auto-observed teammate's field → that teammate's bonds (m.public players[].bonds, tagged
// "👁 name"); 联防 / 最终攻势 → the player on the ‹ › half (全景: yours when you fight there, else the teammate picked
// with 前往查看 — `watchWho` — or the field's first player, never the viewer's own); in battle with the live layers of
// the battle on screen (battle/runner.js state().bondLayers). Picking a teammate on such a field (a 联防 leaker, an
// eliminated spectator) frames their half and keeps the ‹ › pill (返回战场 on the own team row); an open bond popup closes when the
// strip changes hands.
// Spectator seats (community report #26, a remake feature): a spectator has no m.private and plays like an ELIMINATED
// player — no shop, no ready, no emotes (▸ [ASSUMED] off), the server auto-observes the first field of every battle, a
// team row → 前往查看 any player; in 休整期 / 机变 / round start it is shown the first player's board by itself (once per
// phase). Its pill reads 观战中, never "你已被淘汰"; its exit only leaves the seat (ui/matchChrome.js ExitModal).

import { useCallback, useEffect, useMemo, useRef, useState } from '../../vendor/hooks.module.js';
import { PHASE, GEO } from '../../../shared/constants.js';
import { html, Spinner, PhaseBanner, ResultDialog, Icon, Button, confirmDialog, closeAllDialogs, useTicker } from '../ui/components.js';
import { useGameData, GIcon, PlayerAvatar } from '../ui/gameComponents.js';
import { enemyIconUrl } from '../ui/assetUrls.js';
import { useFieldView } from '../ui/fieldHost.js';
import { TopBar, liveLp, ownLeaks, uniteRemaining, tempInfo, matchLpCap } from '../ui/hud.js';
import { BondStrip, BondPopup } from '../ui/bondStrip.js';
import { TeamPanel } from '../ui/teamPanel.js';
import { ShopBar } from '../ui/shopBar.js';
import { DetailPanel, resolveDetail } from '../ui/detailPanel.js';
import { TileToast } from '../ui/tileToast.js';
import { RewardOverlay } from '../ui/rewardOverlay.js';
import { ChoiceOverlay } from '../ui/choiceOverlay.js';
import { EnemyDrawer } from '../ui/enemyDrawer.js';
import { Ticker } from '../ui/ticker.js';
import { EmoteWheel } from '../ui/emotes.js';
import { GameChat } from '../ui/chat.js';
import { DebugPanel } from '../ui/debugPanel.js'; // local patch: local debug mode only (m.private.debug)
import { EffectsList } from '../ui/effectsList.js';
import { RoundDamage } from '../ui/roundDamage.js';
import { CombatHud } from '../ui/combatHud.js';
import { SettingsModal, settingsStore } from '../ui/settings.js';
import { ExitModal, AwayOverlay, awayStore } from '../ui/matchChrome.js';
import { openGuide } from '../ui/guide.js';
import { actions } from '../ui/gameActions.js';
import { FacingWheel, holdPiece, setPieceDir, syncPieceDirs, showRange, useTileScreen } from '../ui/facingWheel.js';
import { Underframe, underframeRect, TempRowNotice } from '../ui/underframe.js';
import { StandInTags } from './game/standInTags.js';
import { needsFacing, facingIntent, previewGrid, pieceDir, underframeActions, retreatSlot, itemDestroyable } from '../ui/facing.js';
import { EquipReplaceDialog, replaceRequest, replaceIntent } from '../ui/equipReplace.js';
import { EquipHoverPanel, equipHoverState } from '../ui/equipHover.js'; // local patch: the official equip-slot popup
import { pauseAvailable, isPaused, frozenNow } from '../ui/matchStatus.js';
import { pieceTile } from '../render/drag.js';
import {
  phaseMode, phaseBanner, isCombatPhase, showDeadPill, isBossPhase, placementContext, placementRecords, canPlace, boardTargets, dropIntent,
  holdsBattleEnd, settleBattleEnd, roundResultBox,
  snapHud, activeBubbles, shortcutFor, shortcutBlocked, closesOnFieldPress, closesOnOutsidePress, openedFromWindow, windowCardGone, phaseTotalSeconds, homeFieldId, ownFieldId, normalizeSp, normalizePersonalChoice, sortedPlayers,
  terrainInfo, deviceInfo, deviceTipAt, noteDeviceUnits, deviceUnitsForEntry,
  shopBlockReason, stageOverrides, effectiveStage, watchTarget, dropFailureReason,
  previewEnemyKey, prepCamera, prepCameraFor, foldCamera, deployFieldOf, fieldTile, panelSide, panelSlots, bondPopupPlace, unitLoadout, deployedRecord,
  mergeTarget, modeOffBonds, readyFundsPrompt, readyOverflowPrompt, readyShopFold, ownerBandId, ownDiyRecord, ownStandIn, handFull,
} from '../ui/gameLogic.js';
import { toast } from '../ui/toasts.js';
import { matchToast } from '../ui/matchToast.js';
import { BriefingScreen } from './briefing.js';
import { BandDraftScreen } from './bandDraft.js';
import { ResultScreen } from './result.js';
import { net } from '../net.js';
import { store, useStore, shallowEqual, serverNow, isSpectating } from '../store.js';
import { battleRunner } from '../battle/runner.js';
import { isClientCombat, observeTarget, teammateProgress, ownProgress, cameraLayers, layerCamera, sidesOf, resumedWatch, followedScout } from '../battle/observe.js';
import { screenStrip, playerBonds, playerLayer, detailBondOwner, toggleBond, popupView } from '../ui/watchBonds.js';
import { data, localAsset, getMode } from '../data.js';
import { voiceForPiece, voiceForPlace, voiceForUnit, holdResultVoice, voiceForRoutePreview } from '../voice.js'; // local patch: 选中 lines on a tap, 部署 on a bench → board placement, 结算 line kept, 行动开始 on a battle-start route preview cursor
import { hudArt, BondNav } from '../ui/hudArt.js'; // local patch: the official HUD look (css/hud-art.css)
import { phaseArt, RoundStartBanner, BattleEndBanner, useRoundGold, roundsToBoss } from '../ui/phaseArt.js'; // local patch: css/phase-art.css
import { battleArt, loadingArt, LoadingScreen, GameStartBanner, opensGame, BottomTips, bottomTipType, WaitingDialog, HelpBattleBanner, BossPrepare, bossOpening, SettleEnding, endingOf, ENDINGS, SelfDead, ReadyTipDialog, OnlyConfirmDialog, soloResumeDue, preloadBattleArt } from '../ui/battleArt.js'; // the official 卫戍协议 dialogs (css/battle-art.css)
import { placingDetail } from '../ui/detailArt.js'; // local patch: the unit card while placing
import { audio, resultSpeaker, resultVoiceSlot } from '../audio.js';
import { battleOverOf, battleLossOf } from '../audioOfficial.js'; // local patch: round_result_dialog sound
import { useDocClass, FullscreenButton } from '../ui/device.js';
// MatchEnded, PausedOverlay, the highlight styles and keepEarly live in ./game/*.js.
import { HUD_HZ_MS, MERGE_HL, SEL_RANGE, cx } from './game/marks.js';
import { keepEarly } from './game/early.js';
import { MatchEnded, PausedOverlay } from './game/overlays.js';
import { inspectRange } from './game/range.js';
import { t, tParts } from '../../../shared/i18n.js';
import { playerName } from '../../../shared/botNames.js';

/** LOCAL-PATCH.md 「오퍼레이터 음성」 (2-5): a committed bench → board placement still says its 部署 line when its drop-in comes this late (ms). */
const PLACE_VOICE_MS = 3000;

/** Router for the in-match screens. */
export function GameScreen() {
  const pub = useStore((s) => s.match.public);
  const hasResult = useStore((s) => !!s.match.result);
  const ended = useStore((s) => !!s.room && !s.room.inMatch && !!s.match.public);
  const away = useStore((s) => s.away, Object.is, awayStore);
  const autoplay = useStore((s) => !!(Array.isArray(s.match.public?.players) && s.match.public.players.find((p) => p && p.playerId === s.me.playerId)?.autoplay));
  const gd = useGameData();
  // room chat (local patch) on the briefing / draft / result screens; the match screen has its own in the corner
  const coopRoom = useStore((s) => s.room?.mode === 'coop');
  const [chatOpen, setChatOpen] = useState(false);
  // the match's end (settle_ending_dialog, ui/battleArt.js SettleEnding): when m.result lands on a match on screen, its
  // ending plays over the field before the result screen (a result already there when this screen mounted does not)
  const [, setEndTick] = useState(0);
  const endRef = useRef({ seen: hasResult, ending: null, onField: false });
  if (hasResult && !endRef.current.seen) {
    endRef.current.seen = true;
    const status = endingOf(store.get().match.result);
    if (status && pub && endRef.current.onField && battleArt('ending').cls) {
      const boss = pub.bossId ? data.lookup('bosses', pub.bossId) : null;
      endRef.current.ending = { status, portrait: boss ? enemyIconUrl(data.get('assets'), boss.enemyKey) : null };
      audio.sfx(ENDINGS[status].sfx);
    }
  }
  const ending = endRef.current.ending;
  if (!pub || !gd.ready) {
    return html`<div class="screen gload">
      <${Spinner} size="lg" label=${pub ? 'LOADING DATA' : 'ENTERING SIMULATION'} />
      <p class="t-lo">${pub ? t('正在载入模拟数据…') : t('正在进入模拟…')}</p>
    </div>`;
  }
  const mode = phaseMode(pub.phase);
  let body;
  if (ending) body = html`<${MatchScreen} />`; // the same element as before: the field stays under the ending
  // the server sends RESULT's m.public before m.result (settle.js finish: flush, then the result): a match on screen
  // keeps its field until the result lands — the result screen without one read 模拟失败 for a moment (even after a
  // win), and the field mounted again for the ending showed the battle loading screen
  else if (!hasResult && mode === 'result' && endRef.current.onField) body = html`<${MatchScreen} />`;
  else if (hasResult || mode === 'result') body = html`<${ResultScreen} />`;
  else if (mode === 'briefing') body = html`<${BriefingScreen} />`;
  else if (mode === 'draft') body = html`<${BandDraftScreen} />`;
  else body = html`<${MatchScreen} />`;
  endRef.current.onField = body.type === MatchScreen;
  return html`${body}
    ${ending ? html`<${SettleEnding} status=${ending.status} portrait=${ending.portrait} onDone=${() => { endRef.current.ending = null; setEndTick((x) => x + 1); }} />` : null}
    ${coopRoom && !ending && (hasResult || mode === 'result' || mode === 'briefing' || mode === 'draft') ? html`<div class="gchat-float"><${GameChat} open=${chatOpen} onToggle=${setChatOpen} /></div>` : null}
    ${(away || autoplay) && !hasResult && mode !== 'result' && !ended ? html`<${AwayOverlay} />` : null}
    ${ended && !hasResult && mode !== 'result' ? html`<${MatchEnded} />` : null}`;
}

// ---- match screen ----------------------------------------------------------------------------------------

/** A card of a unit of the battle on screen: a unit's, or a crate's / turret's (a device card with its `unitId`, #228). */
const inBattleCard = (d) => d?.kind === 'unit' || (d?.kind === 'device' && d.device?.unitId != null);

function MatchScreen() {
  useDocClass('sp-in-match');
  // the official 卫戍协议 toast (auto_chess_notify_taost, css/battle-art.css .sp-ac-toast) while the art is there
  const toastArt = battleArt('toast');
  useDocClass('sp-ac-toast', !!toastArt.cls);
  useEffect(() => {
    const root = document.documentElement;
    const url = /--ts-bg:([^;]+)/.exec(toastArt.style || '')?.[1];
    if (url) root.style.setProperty('--ts-bg', url);
    return () => root.style.removeProperty('--ts-bg');
  }, [toastArt.style]);
  const serverLostBox = useStore((s) => s.ui.serverLost);
  // the connection pieces show when the server may be gone: their sprites are fetched now
  useEffect(() => { preloadBattleArt(['reconnect', 'confirm']); }, [toastArt.style]);
  const pub = useStore((s) => s.match.public);
  const priv = useStore((s) => s.match.private);
  const field = useStore((s) => s.match.field);
  const myId = useStore((s) => s.me.playerId);
  const conn = useStore((s) => s.connection, shallowEqual);
  const emotes = useStore((s) => s.emotes);
  const roomSolo = useStore((s) => s.room?.mode === 'solo');
  const spectator = useStore((s) => isSpectating(s.room, s.me.playerId));
  const gd = useGameData();

  const hostRef = useRef(null);
  const barRef = useRef(null);
  const hudElRef = useRef(null);                         // .gm__hud (inside the safe-area insets: the panels' frame)
  const { view, kind: viewKind, upgrading: viewUpgrading } = useFieldView(hostRef);
  // the loading screen stays until the engine has drawn its first frame of the field (render/app.js isReady / 'ready':
  // the textures go up behind it); a view without isReady (the DOM view) is ready at once, and so is a late engine
  // taking over from the DOM view already on screen (no second loading screen, ui/fieldHost.js)
  const [readyView, setReadyView] = useState(null);
  const shownView = useRef(null); // the view last shown; null while a mount loads
  useEffect(() => {
    if (!view) { shownView.current = null; return undefined; }
    const ready = () => { shownView.current = view; setReadyView(view); };
    if (shownView.current || view.isReady() !== false) { ready(); return undefined; }
    const off = view.on('ready', ready);
    if (view.isReady() !== false) ready();
    return off;
  }, [view]);
  const fieldLoading = viewKind === 'loading' || (!!view && readyView !== view);

  const [watching, setWatching] = useState(null);        // fieldId the player chose to watch (null = home)
  const [watchWho, setWatchWho] = useState(null);        // { fieldId, playerId }: the teammate picked with 前往查看
  const [drawer, setDrawer] = useState(null);            // 'enemies' | 'info' | null
  const [bondOpen, setBondOpen] = useState(null);        // { id, ownerId, from }: the bond popup and whose bond it shows
  const [bondsCollapsed, setBondsCollapsed] = useState(false);
  const [detail, setDetail] = useState(null);            // detail target
  // a special terrain tile's toast (ui/tileToast.js: { key, terrain, again? }) — the client's tile toast, not a card (GitHub #3)
  const [tileTip, setTileTip] = useState(null);
  const tipAtDown = useRef(null);                        // the toast a field press hid (a press on the same tile brings it back)
  const [collapsed, setCollapsed] = useState(false);
  const [rewardMin, setRewardMin] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false); // room chat (local patch)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false); // phones: ⚙ / 📖 / ⛶ folded behind ⋯ (css/devices.css .gm__more)
  const [exitOpen, setExitOpen] = useState(false);
  const [drag, setDrag] = useState(null);                // { uid, kind, id } while dragging a piece
  const [facing, setFacing] = useState(null);            // direction step: { uid, piece, row, col, grid, name }
  const [sel, setSel] = useState(null);                  // tapped own piece: { uid }
  const [selBusy, setSelBusy] = useState(false);
  const [holdSeq, setHoldSeq] = useState(0);             // bumped when a held piece is released (re-apply the prep state)
  const [hud, setHud] = useState(null);
  const [banner, setBanner] = useState(null);
  const [opening, setOpening] = useState(false);         // game_start_dialog before round 1's round-start banner
  const [bossOpen, setBossOpen] = useState(null);        // the boss round's opening (BossPrepare kind) before its round-start banner
  const [goldAsk, setGoldAsk] = useState(null);          // the official 准备 question with funds left: { text, resolve }
  const goldTipOff = useRef(false);                      // its 本局不再提示 ticked (DataInScene: this match only)
  const [outDialog, setOutDialog] = useState(false);     // self_dead_dialog: the viewer was just eliminated
  const [resultBox, setResultBox] = useState(null);      // the round's result box (ResultDialog), shown at SETTLE
  const [readyBusy, setReadyBusy] = useState(false);
  const [spBusy, setSpBusy] = useState(null);
  const [personalBusy, setPersonalBusy] = useState(null); // { choiceId, idx }: an older request cannot clear a newer pick
  const [layer, setLayer] = useState('ALL');             // 联防 / 最终攻势 camera: 'L' | 'ALL' | 'R' (wide 联防: 'H0'…'H3')
  const [pen, setPen] = useState(false);                 // the camera shows the enemy preview pen (research 09 §2)
  const [camKind, setCamKind] = useState('prep');        // kind of the last camera request (data-camera)
  const [replace, setReplace] = useState(null);          // equip-replace dialog: { request, resolve }
  const [eqHover, setEqHover] = useState(null);          // local patch: the equip-slot popup (ui/equipHover.js)
  const [pauseBusy, setPauseBusy] = useState(false);
  const [armedCard, setArmedCard] = useState(null);     // the shop bar's armed card { kind, id } (merge tile cue)
  const cc = isClientCombat(pub);
  const battleState = useStore((s) => s.match.battle, shallowEqual); // local battle runner (client-side combat)

  const phase = pub?.phase;
  const roundGoldNow = useRoundGold(phase, priv?.funds, priv?.roundGold, pub?.round); // local patch: the round-start banner's 获得 (ui/phaseArt.js)
  // kept for the round: round 1's banner mounts after game_start_dialog, when ROUND_START (and useRoundGold) is over
  const roundGoldRef = useRef(null);
  if (Number.isFinite(roundGoldNow)) roundGoldRef.current = { round: pub?.round, gold: roundGoldNow };
  const roundGold = roundGoldNow ?? (roundGoldRef.current?.round === pub?.round ? roundGoldRef.current.gold : null);
  const mode = phaseMode(phase);
  const combat = isCombatPhase(phase);
  const solo = roomSolo || String(pub?.modeId || '').includes('single');
  const players = sortedPlayers(pub);
  const meP = players.find((p) => p.playerId === myId) || null;
  // a spectator seat watches like an eliminated player (it has no m.private and no row in m.public)
  const alive = spectator ? false : priv ? priv.alive !== false : meP?.alive !== false;
  const home = homeFieldId(pub, myId);
  // the official elimination dialog once, when the viewer's own seat goes out during the match (not for a spectator seat,
  // not on a reconnect that finds the seat already out)
  const aliveRef = useRef(alive);
  useEffect(() => {
    if (aliveRef.current && !alive && !spectator && phase !== PHASE.RESULT && battleArt('dead').cls) setOutDialog(true);
    aliveRef.current = alive;
  }, [alive]);
  const watchingOther = !!watching && watching !== home && watching !== ownFieldId(myId);
  // watching a teammate's prep board: the 本局信息 drawer shows THEIR 策略 in place of one's own (user playtest #2 item 2)
  const scoutPid = watchingOther && field?.prep && typeof field.fieldId === 'string' && field.fieldId.startsWith('n:') ? field.fieldId.slice(2) : null;
  const scoutBandId = scoutPid ? ownerBandId(pub, scoutPid) : null;
  const scoutBandOwner = scoutPid ? (playerName(players.find((p) => p.playerId === scoutPid)?.name) || null) : null;
  const personalChoice = !spectator && alive ? normalizePersonalChoice(pub, priv, myId) : null;
  const hasPersonalChoice = !!personalChoice;
  const editable = phase === PHASE.PREP && !!priv && alive && !priv.ready && !watchingOther && !hasPersonalChoice;
  const showShop = !!priv && alive && (phase === PHASE.PREP || phase === PHASE.SP_DRAFT || phase === PHASE.ROUND_START) && !watchingOther;
  const layersDisabled = phase === PHASE.UNITE || isBossPhase(phase);
  const sp = phase === PHASE.SP_DRAFT ? normalizeSp(pub?.sp, players) : null;
  const total = phaseTotalSeconds(pub, gd.config, myId);
  // solo pause: offered in the own battle; while m.public.paused every HUD clock stops at the pause moment
  const paused = isPaused(pub);
  const pauseSeenRef = useRef(null);
  if (!paused) pauseSeenRef.current = null;
  else if (pauseSeenRef.current == null) pauseSeenRef.current = serverNow();
  const frozenAt = paused ? frozenNow(pub, serverNow(), pauseSeenRef.current) : null;
  // live LP (user playtest #3 item 2): the own normal battle's counted leaks — the local runner's count (authoritative
  // or display replica) and the server's m.public players[].pendingLp, whichever is further (both only grow during a
  // round; a display replica stands still while the player watches a teammate's field, the server's count then moves
  // on) — cost min(lpCapPerRound, n) at settlement; shown at once as the −N tick until the settled m.private lands (ui/hud.js liveLp
  // keeps the base between renders); 联防 (user playtest #6 item 7): a leaker's enemies still standing on the 联防 field —
  // the local replica's count while it runs, else m.public players[].uniteLeft (ui/hud.js uniteRemaining) — replace it;
  // the teammates' rows take the same local counts (`uniteLocal`, ui/teamPanel.js rowLp)
  const lpBaseRef = useRef(null);
  // the round's LP cap (Infinity under a custom 「解除上限」) and a custom 「共享」 match's team LP (the own leaks' −N
  // tick on the top bar's alliance LP, ui/hud.js TopBar)
  const lpCap = matchLpCap(pub, gd.config);
  const sharedLp = !isBossPhase(phase) && Number.isFinite(pub?.teamLp) ? pub.teamLp : null;
  const localLeaks = battleState && battleState.leaks ? battleState.leaks[ownFieldId(myId)] : undefined;
  const uniteLocal = phase === PHASE.UNITE && battleState && battleState.uniteLeft ? battleState.uniteLeft : null;
  const leaker = phase === PHASE.UNITE && Array.isArray(pub?.unite?.leakers) && pub.unite.leakers.includes(myId);
  const localLeft = leaker && uniteLocal ? (uniteLocal[myId] ?? 0) : undefined;
  const liveLpNow = liveLp(lpBaseRef.current, {
    phase, round: pub?.round, lp: sharedLp ?? priv?.lp, statsLeaks: priv?.stats?.leaks, alive,
    leaks: ownLeaks(localLeaks, meP?.pendingLp), cap: lpCap,
    uniteLeft: leaker ? uniteRemaining(localLeft, meP?.uniteLeft) : null,
  });
  lpBaseRef.current = liveLpNow.base;
  // what this round's battle cost me, kept while it runs for the battle-end announcement at SETTLE when the own result
  // never came in (server-run combat, a reconnect — ui/gameLogic/phases.js settleBattleEnd; GitHub #235, PR #112 by
  // @Convey123): by then the settlement has landed (Match.flush sends m.private before the SETTLE m.public) and the live
  // count reads 0. A per-round MAXIMUM — leaks only grow within a round, and a frame that lands after the settlement must
  // not wipe a real count — and only for a player in the round (a spectator seat or an eliminated player fights nothing
  // and gets no announcement).
  const roundLossRef = useRef(null);
  if (isCombatPhase(phase) && alive) {
    const prev = roundLossRef.current;
    const same = !!prev && prev.round === pub?.round;
    const leaks = ownLeaks(localLeaks, meP?.pendingLp);
    roundLossRef.current = { round: pub?.round, leaks: same ? Math.max(prev.leaks, leaks) : leaks, cap: lpCap };
  }
  // the own battle's end, once per round (docs/LOCAL-PATCH.md 「0.2.0 병합」, maintainer decision 2026-10-08: ours only) —
  // the official round_result_dialog (ui/phaseArt.js BattleEndBanner; without its local art the plain box) and its
  // BATTLEOVER sound. `over` = audioOfficial.js battleOverOf / settleBattleEnd { kind, lost, sfx }.
  const battleEndRound = useRef(null);                   // the round whose battle end was announced
  const heldEndRef = useRef(null);                       // { round, over }: a co-op result held for SETTLE (holdsBattleEnd)
  const resultSeq = useRef(0);                           // re-keys the plain result box
  const announceBattleEnd = (over, round) => {
    battleEndRound.current = round;
    audio.sfx(over.sfx);
    resultSeq.current += 1;
    const key = `result:${round}:${resultSeq.current}`;
    if (phaseArt('result').cls) setBanner({ key, result: { perfect: over.kind === 'perfect', lost: over.lost } });
    else setResultBox({ ...roundResultBox(over.lost), key });
  };

  // latest values for event handlers bound once
  const live = useRef({});
  // the field the own pieces are deployed on: the own board, or the player's half of the boss field in a boss round's
  // prep (user playtest #5 item 7: legality and the legal-tile highlights read THOSE tiles, like the server)
  const deployField = deployFieldOf(pub, myId);
  // the own pieces' records: a DIY slot the player filled is its 自选 operator (0.2.0, m.private.diy — position, range,
  // name; gameLogic/diy.js), every other chess its data record
  const ownChess = (id) => { const c = gd.chess(id); return ownDiyRecord(c, live.current.priv, { chess: data.get('chess'), backups: data.get('backups') }) || c; };
  // what the own pieces show (names and art of the facing wheel, the underframe, the equip-replace dialog): a chess the
  // player does not own is its stand-in (0.2.0 补位 — the owner's recall of the official mode, 2026-10-06); rules keep
  // ownChess (the composed record carries the chess's identity anyway)
  const ownShown = (id) => { const c = ownChess(id); return ownStandIn(c, live.current.priv, data.get('backups')) || c; };
  const placeCtx = useMemo(() => placementContext({
    priv, stage: gd.stage(pub?.stageId), editable, field: deployField,
    ...placementRecords(data, priv), // the Chinese rule records whatever the language: the 高台 trait check (upstream #676)
    getToken: gd.token, getItem: gd.item, getEffect: gd.effect,
  }), [priv, pub?.stageId, editable, gd.ready, deployField]);
  live.current = { pub, priv, field, editable, hasPersonalChoice, placeCtx, watching, watchWho, home, myId, alive, spectator, detail, drawer, bondOpen, emoteOpen, settingsOpen, exitOpen, drag, facing, sel, selBusy, pen, tileTip, collapsedNow: collapsed, canPause: false, paused, cap: lpCap };

  // ---- camera: every request goes through setCam, which remembers it for the pen's way back -----------------------
  // the own prep board: the normal board, or — in the prep of a boss round — the player's half of the boss field
  // (research 09 §1.2: the right-hand player's board mirrored; gameLogic prepCamera). The DOM fallback view keeps the
  // own board's layout there (every coordinate the UI handles is a board coordinate either way) and draws the tiles of
  // that half (ui/fallbackField.js: the legal fence tiles are floor, not the normal field's walls; user playtest #5 item 7).
  const prepCam = prepCamera(pub, myId);
  const prepCamKey = `${prepCam.kind}:${prepCam.opts.side}`;
  const prepCamSeen = useRef(prepCamKey);                // the prep camera last requested
  const camRef = useRef({ kind: 'prep', opts: { rect: { ...GEO.NORMAL_RECT }, side: 'L' } });
  const penRef = useRef({ on: false, collapsed: false });
  // the shop bar is shown folded (收起; the pen folds it for itself: the player's own state is the one it returns to) —
  // the own prep board then takes the official shop-collapsed camera (public issue #5, gameLogic prepCameraFor)
  const shopFolded = showShop && (pen ? penRef.current.collapsed : collapsed);
  // 准备就绪 folds the shop bar, cancelling it unfolds the bar again (GitHub #138; gameLogic readyShopFold): the board is set,
  // the fight is what to look at — the board camera follows the fold like a hand-made one (the effect below). Inside the pen
  // the bar is folded for itself: the state it returns to is the one that changes. The official 접기 상자 (shop art) is the
  // same `collapsed` state, so it folds with it (maintainer decision 2026-10-09: the game folds the shop on ready too).
  const readySeen = useRef(null);
  useEffect(() => {
    const cur = phase === PHASE.PREP && priv && alive && !watchingOther ? { round: pub?.round, ready: !!priv.ready } : null;
    const change = readyShopFold(readySeen.current, cur);
    readySeen.current = cur;
    if (!change) return;
    if (penRef.current.on) penRef.current.collapsed = change === 'fold';
    else setCollapsed(change === 'fold');
  }, [phase, pub?.round, priv?.ready, !!priv, alive, watchingOther]);
  const cancelFacingRef = useRef(() => {});
  const setCam = useCallback((kind, opts) => {
    camRef.current = { kind, opts: opts || {} };
    setCamKind(kind);
    if (penRef.current.on) { penRef.current.on = false; setPen(false); setCollapsed(penRef.current.collapsed); }
    view?.setCamera(kind, opts);
  }, [view]);
  // 休整期 only; never while a piece is being placed (the wheel sits on a tile of the board camera)
  const penAvail = phase === PHASE.PREP && !!view && viewKind !== 'loading';
  live.current.penAvail = penAvail;
  live.current.showShop = showShop;
  /** Pan to the enemy preview pen (on) or back to the camera in use before (off). */
  const togglePen = useCallback((on) => {
    const P = penRef.current;
    if (!view || on === P.on) return;
    if (on) {
      const L = live.current;
      if (L.pub?.phase !== PHASE.PREP) return;
      if (L.facing) return;
      P.on = true;
      P.collapsed = L.collapsedNow;
      setPen(true);
      setSel(null);
      setDrawer(null);                                   // the pen replaces the list
      setBondOpen(null);                                 // the bond strip hides: its popup must not float over the pen
      setDetail((d) => (d?.kind === 'enemy' ? d : null)); // a shop card / unit card belongs to the board view
      setCollapsed(true);
      view.setCamera('pen', { side: camRef.current.opts?.side || 'L' });
      audio.sfx('click', { volume: 0.5 });
    } else {
      P.on = false;
      setPen(false);
      setCollapsed(P.collapsed);
      const c = camRef.current;
      view.setCamera(c.kind, c.opts);
      audio.sfx('back', { volume: 0.5 });
    }
  }, [view]);
  const togglePenRef = useRef(togglePen);
  togglePenRef.current = togglePen;

  // the stage as the own board looks: terrain 机变 cards open / reclassify tiles and remove crates (stageOverrides)
  const baseStage = gd.ready ? gd.stage(pub?.stageId) : null;
  const overrides = stageOverrides(priv, gd.effect);
  const overridesKey = JSON.stringify(overrides);
  const ownStage = useMemo(() => effectiveStage(baseStage, overrides), [baseStage, overridesKey]);

  // ---- field view wiring ---------------------------------------------------------------------------------
  const lastFieldRef = useRef(null);
  const viewModeRef = useRef(null);
  const snapUnitsRef = useRef(new Map());
  // the shown battle's device units (crates / “双眼皮” turrets: UnitInfo by id) — the meta's `units` plus the 'spawn' events,
  // for the tap on a device (gameLogic.deviceTipAt); the renderer's pick skips devices, a tap on one lands in tileClick
  const deviceUnitsRef = useRef(new Map());
  const hudRef = useRef(null);
  // b.ev / b.snap that arrive before the UI entered their field (the battle's first ticks race the m.public /
  // m.field re-render): kept per fieldId and replayed on enter so no unit's 'spawn' UnitInfo is ever lost.
  const evBufRef = useRef(new Map());   // fieldId → ev tuples since that field's m.field
  const snapBufRef = useRef(new Map()); // fieldId → latest snapshot
  // a new m.field for the field already on screen (a resync, or the runner re-showing it after a hidden-tab backlog
  // overflowed): its frames are buffered like a new field's until the enter effect re-enters it — enterBattle resets
  // the view, so a 'spawn' or form fx pushed in between used to be lost (placeholder views, the old model)
  const reentryRef = useRef(null);

  // prep rendering (own board) vs battle rendering (m.field). The field object present when prep starts is stale
  // (last round's battle): combat only enters an m.field pushed after that (a new object), and every new m.field
  // push (watch switch, reconnect) re-enters the battle view.
  const showPrep = (mode === 'prep' || mode === 'boot') && !watchingOther;

  // own board (prep, or a battle field the player fights on) → the stage with the player's overrides; a teammate's
  // board → the plain stage (their overrides are not known here)
  const shownField = showPrep ? null : field;
  const shownMembers = shownField ? ((Array.isArray(pub?.fields) ? pub.fields : []).find((f) => f && f.fieldId === shownField.fieldId)?.players
    || (Array.isArray(shownField.players) ? shownField.players : null)) : null;
  const ownView = showPrep || (shownField ? (shownMembers ? shownMembers.includes(myId) : shownField.fieldId === ownFieldId(myId)) : !watchingOther);
  // every field is fought on the round's battlefield — 联防 too, its terrain, crates and water included (0.2.1, the
  // owner's decision of 2026-10-07; 0.2.0 drew the escaped levels' empty road there and restored the board on leaving)
  useEffect(() => {
    if (!view) return;
    const st = ownView ? ownStage : baseStage;
    if (st) view.setStage(st);
  }, [view, ownView, ownStage, baseStage]);
  // the stage behind the board ON SCREEN — the own one (机变 overrides applied) or, while watching a teammate, the plain
  // one — and how a tapped BOARD tile maps to it (GitHub issue #184: tileClick → gameLogic.terrainInfo). Everywhere but a
  // boss-prep board the two spaces are the same: a 最终攻势 / 隐秘核心 battle renders the stage's own rows (GEO.BOSS_RECT),
  // 联防 / normal rects are stage rows; the boss PREP draws the player's half (stage rows 2–5) as board rows 9–12
  // (render/prepfield.js toDisp), which is exactly gameLogic.fieldTile.
  live.current.terrainStage = ownView ? ownStage : baseStage;
  live.current.terrainTile = showPrep && (deployField === 'bossL' || deployField === 'bossR')
    ? (row, col) => fieldTile(deployField, row, col)
    : (row, col) => [row, col];
  // a battle on screen (not the prep board, not a scouted prep board): its crates and turrets are device UNITS, found by
  // unit; everything else answers by the stage's own device entries (gameLogic.deviceTipAt / deviceInfo, #228)
  live.current.deviceBattle = !!shownField && !shownField.prep;
  const staleFieldRef = useRef(null);
  const enteredFieldRef = useRef(null);
  const enteredViewRef = useRef(null);
  const pressSel = useRef(null);                         // the selected piece when the current field press began
  useEffect(() => {
    // Read before a view change clears the refs. A later refresh of this same field (g.watch / reshow replaces the
    // field object) must still know which battle the device units already noted belong to.
    const previousFieldId = lastFieldRef.current;
    const previousDevices = deviceUnitsRef.current;
    if (enteredViewRef.current !== view) {
      // A replacement engine (ui/fieldHost.js retries a fallback view) has no field, even when the match's m.field
      // object did not change: the prep camera and the battle are entered again on it. While it loads, frames are
      // buffered instead of sent to a null / destroyed view; its subscription below asks for fresh meta.
      enteredViewRef.current = view;
      enteredFieldRef.current = null;
      lastFieldRef.current = null;
      viewModeRef.current = null;
      reentryRef.current = null;
    }
    if (!view) return;
    if (showPrep) {
      if (field?.prep) staleFieldRef.current = field; // a prep scouting board is never a battle to enter
      if (viewModeRef.current !== 'prep') {
        audio.stopBondCue('battle'); // upstream #482: the battle's layer-up cue ends with it (a prep gain's cue stays)
        // the battle we just left (or whatever was stored before mount) must not be re-entered next combat;
        // an m.field that arrives during prep (the upcoming battle) is a new object and will be entered
        staleFieldRef.current = field;
        const pc = prepCameraFor(pub, myId, shopFolded);
        setCam(pc.kind, pc.opts);
        prepCamSeen.current = prepCamKey;
        viewModeRef.current = 'prep';
        lastFieldRef.current = null;
        enteredFieldRef.current = null;
        reentryRef.current = null;
        setHud(null);
      }
      if (priv) {
        view.setPrep(priv, { editable, canPlace: (uid, target) => canPlace(live.current.placeCtx, uid, target).ok });
        // stored facings (m.private board `dir`); the piece in the direction step shows the wheel's preview instead
        syncPieceDirs(view, priv, live.current.facing?.uid ?? null);
      }
      return;
    }
    const wanted = combat || mode === 'settle' || watchingOther;
    if (!wanted || !field || !field.fieldId || field === staleFieldRef.current || field === enteredFieldRef.current) return;
    if (watchingOther && !combat && field.fieldId !== watching) return; // an older push while switching
    if (lastFieldRef.current && lastFieldRef.current !== field.fieldId) setDetail((d) => (inBattleCard(d) ? null : d));
    enteredFieldRef.current = field;
    lastFieldRef.current = field.fieldId;
    reentryRef.current = null;
    viewModeRef.current = 'battle';
    snapUnitsRef.current = new Map();
    const early = evBufRef.current.get(field.fieldId);
    evBufRef.current.delete(field.fieldId);
    // Crates and turrets are absent from a start-of-battle meta and arrive once, as spawn events. Re-entering the
    // same field from a refresh that repeats that meta (the subscription below asks for one) must not drop them.
    const noted = noteDeviceUnits(new Map(), { units: field.units, events: early });
    deviceUnitsRef.current = deviceUnitsForEntry(previousDevices, noted, previousFieldId != null && previousFieldId === field.fieldId);
    // The renderer clears its unit metadata on entry too. Restore known devices there as well as in the card lookup;
    // otherwise their next HP tuple becomes an unknown enemy whose pieceClick consumes the device's tileClick.
    const units = Array.isArray(field.units) ? [...field.units] : [];
    const ids = new Set(units.map((u) => u?.id));
    for (const [id, info] of deviceUnitsRef.current) if (!ids.has(id)) units.push(info);
    view.enterBattle({ ...field, units });
    const earlySnap = snapBufRef.current.get(field.fieldId);
    snapBufRef.current.delete(field.fieldId);
    // a scouted prep board frames like the own prep with the shop folded (the bench row included, app.js camRect);
    // 'prep' expands the rect's top to the hand row
    const kind = field.prep ? 'prep' : (field.kind === 'hidden' ? 'boss' : field.kind || 'normal');
    const pf = (Array.isArray(pub?.fields) ? pub.fields : []).find((f) => f && f.fieldId === field.fieldId);
    const members = Array.isArray(pf?.players) ? pf.players : Array.isArray(field.players) ? field.players : [];
    const sides = field.sides && typeof field.sides === 'object' ? field.sides : null;
    // a scouted board of a boss round's prep (Match.prepFieldMeta: the boss-field rows, `side` = the scouted player's
    // half) is framed by the boss-field prep camera of that half — the leader standing at its spawn (item 55)
    const side = field.prep && (field.side === 'L' || field.side === 'R') ? field.side
      : sides && sides[myId] ? sides[myId] : members.length > 1 && members.indexOf(myId) === 1 ? 'R' : 'L';
    // local simulation (client-side combat) feeds a frame per animation frame: no network jitter buffer
    view.raw?.setLocalFeed?.({ on: !!field.local, speed: field.speed });
    audio.setGameSpeed?.(field.speed); // a START sound's own delay is in game time (docs/rules/audio.md 「공격 소리 신호」)
    setLayer('ALL');
    // a lone player's boss field (solo modes, the odd player of a co-op Final Assault: the `_s` templates route every
    // enemy to the left objective) is framed on its own half like the ‹ › half view; pairs start on 全景. A 联防 field
    // with one Doctor starts on that Doctor's half (layerCamera of 全景, upstream #635): the [layer] effect does not
    // run here when the layer already was 全景, so the entry asks layerCamera itself
    const lone = kind === 'boss' && members.length === 1;
    setCam(kind, lone ? { rect: field.rect, side, half: true }
      : kind === 'unite' ? layerCamera(field, 'ALL', side)
        : { rect: field.rect, side, ...(field.prep ? { shop: false } : {}) });
    audio.setFieldUnits(field.units);
    if (early && early.length) {
      // replay state-bearing events only (a burst of stale hit sparks / damage numbers would look wrong)
      view.pushEvents(early);
      // the opening deployment of a battle that just began sits in this buffer too (the local sim runs before the view
      // enters the field): its deploy sounds / lines play — maintainer re-report 2026-10-08 「작전 시작할 때 배치 효과음이 안 들림」
      const opening = combat && !watchingOther && !(earlySnap && Number(earlySnap.gt) > 2);
      // + its deploy-time skills (缄默德克萨斯 S2's mode sounds, maintainer report — audio.js holds them for the unit's deploy)
      audio.handleBattleEvents(early.filter((e) => e[0] === 'spawn' || (opening && (e[0] === 'deploy' || e[0] === 'skill'))));
    }
    if (!earlySnap && (field.prep || !combat) && Array.isArray(field.units)) {
      // prep scouting: no battle snapshots follow. A later m.field for this board (the teammate moved) re-enters
      // above and places the units again, including an empty board (GitHub #87).
      view.pushSnapshot({
        fieldId: field.fieldId, gt: 0,
        units: field.units.filter((u) => u && u.id != null).map((u) => [u.id, Number(u.x) || 0, Number(u.y) || 0, u.maxHp || 1, u.maxHp || 1, 0, 0, 0, 0]),
      });
    }
    if (earlySnap) {
      view.pushSnapshot(earlySnap);
      if (Array.isArray(earlySnap.units)) {
        snapUnitsRef.current = new Map(earlySnap.units.filter(Array.isArray).map((t) => [t[0], t]));
      }
      hudRef.current = snapHud(earlySnap);
      setHud(hudRef.current);
    }
  }, [view, showPrep, priv, editable, field, combat, mode, watchingOther, watching, holdSeq]);

  // battle frames straight from the socket (server-run combat, 20 Hz) or from the local simulation (client-side combat,
  // battle/runner.js, every animation frame) — never through the store. Frames go to the view as received: the game
  // time travels as `gt` and the render engine reads it (render/interp.js frameTime).
  useEffect(() => {
    let last = 0;
    let pending = null;
    const flush = () => { pending = null; last = performance.now(); setHud(hudRef.current); };
    const onFieldMeta = (msg) => {
      if (!msg || typeof msg.fieldId !== 'string') return;
      evBufRef.current.set(msg.fieldId, []);
      snapBufRef.current.delete(msg.fieldId);
      if (msg.fieldId === lastFieldRef.current) reentryRef.current = msg.fieldId;
    };
    // the field the view shows now (null while a re-entry of it is pending: its frames are buffered)
    const shownId = () => (reentryRef.current && reentryRef.current === lastFieldRef.current ? null : lastFieldRef.current);
    const onSnap = (snap) => {
      const cur = shownId();
      if (!snap || typeof snap !== 'object') return;
      if (!cur || (snap.fieldId && snap.fieldId !== cur)) {
        if (typeof snap.fieldId === 'string') snapBufRef.current.set(snap.fieldId, snap);
        return;
      }
      view?.pushSnapshot(snap);
      if (Array.isArray(snap.units)) {
        const mp = new Map();
        for (const t of snap.units) if (Array.isArray(t)) mp.set(t[0], t);
        snapUnitsRef.current = mp;
      }
      hudRef.current = snapHud(snap);
      const dt = performance.now() - last;
      if (dt >= HUD_HZ_MS) flush();
      else if (!pending) pending = setTimeout(flush, HUD_HZ_MS - dt);
    };
    const onEv = (msg) => {
      const cur = shownId();
      if (!msg || !Array.isArray(msg.ev)) return;
      if (!cur || (msg.fieldId && msg.fieldId !== cur)) {
        if (typeof msg.fieldId !== 'string') return;
        const buf = evBufRef.current.get(msg.fieldId) || [];
        // only state-bearing tuples are replayed later (see the enter effect)
        for (const e of msg.ev) if (keepEarly(e)) buf.push(e);
        if (buf.length > 1500) buf.splice(0, buf.length - 1500);
        evBufRef.current.set(msg.fieldId, buf);
        if (evBufRef.current.size > 8) evBufRef.current.delete(evBufRef.current.keys().next().value);
        return;
      }
      view?.pushEvents(msg);
      noteDeviceUnits(deviceUnitsRef.current, { events: msg.ev });
      audio.handleBattleEvents(msg.ev);
    };
    // 干员语音 (结算): the own battle's result just came in — the operator's line depends on how it went
    // (完美作战 ⇒ 3星结束行动, 绝境 / 终极 ⇒ 完成高难行动, 有漏怪 ⇒ 非3星结束行动, 一个没杀 ⇒ 行动失败)
    const onResult = (msg) => {
      try {
        if (!msg || !msg.result) return;
        const st = store.get();
        const pid = st.me?.playerId;
        const mine = (pid && msg.result.perPlayer && msg.result.perPlayer[pid]) || null;
        const diff = st.match?.public?.difficulty;
        // the speaker comes from THIS battle's own field (`mine.unitsEnd`), not from the field on screen: watching a
        // teammate used to make THEIR operator say the viewer's line (review on #73). unitsEnd names chess ids: the
        // record the own piece shows gives the operator whose voice bank speaks — a 补位 piece's stand-in (its own
        // voice, like its 选中 line) and a filled 自选 slot's operator (ownShown), else the chess record's charId
        // local patch: the own normal battle's end — the official banner and sound (BATTLEOVER_REDUCE / NOREDUCE / NORMAL,
        // audioOfficial.js battleOverOf), once per round (announceBattleEnd); in co-op it waits for SETTLE, after the 联防
        // that may follow (ui/gameLogic/phases.js holdsBattleEnd)
        const round = st.match?.public?.round;
        // (a solo result holds the viewer alone: its own loss decides; a held co-op one is replaced at SETTLE by every
        // player's charge, m.public.roundLosses)
        const over = mine && msg.own !== false && st.match?.public?.phase === PHASE.COMBAT && battleEndRound.current !== round ? battleOverOf({ [pid]: battleLossOf(mine, live.current.cap) }, pid) : null;
        if (over && holdsBattleEnd(over, st.match?.public, pid)) heldEndRef.current = { round, over };
        else if (over) announceBattleEnd(over, round);
        const charId = resultSpeaker(mine, Math.random, (id) => ownShown(id)?.charId ?? null);
        if (!charId) return;
        // local patch: kept for the won settlement instead of said now (voice.js holdResultVoice — the official game is
        // silent at a round's end)
        holdResultVoice({ charId, slot: resultVoiceSlot({
          perfect: !!(mine?.perfect),
          leaked: Array.isArray(mine?.leaked) ? mine.leaked.length : 0,
          killed: mine?.killed ?? msg.result.killed,
          total: mine?.total ?? msg.result.total,
          hard: diff === 'HARD' || diff === 'ABYSS',
        }) });
      } catch { /* ignore */ }
    };
    const offs = [net.on('m.field', onFieldMeta), net.on('b.snap', onSnap), net.on('b.ev', onEv)];
    if (battleRunner) offs.push(battleRunner.on('field', onFieldMeta), battleRunner.on('snap', onSnap), battleRunner.on('ev', onEv), battleRunner.on('result', onResult));
    // A replacement view (ui/fieldHost.js retry) needs metadata that includes the enemies / tokens spawned before it
    // existed, not only the events buffered while it loaded. Subscribe first so the reshow's metadata and snapshot take
    // the ordinary buffered re-entry path.
    if (view && !showPrep && field?.fieldId) {
      if (field.local) battleRunner?.reshow();
      else if (combat || watchingOther) {
        const who = watchWho?.fieldId === field.fieldId ? watchWho.playerId : null;
        net.request('g.watch', { fieldId: field.fieldId, ...(who ? { playerId: who } : {}) }).catch(() => {});
      }
    }
    return () => { for (const off of offs) { try { off(); } catch { /* ignore */ } } clearTimeout(pending); };
  }, [view]);

  // the prep board moves while prep is shown (a boss round's prep begins, or a teammate left and the pairs changed):
  // the next camera of the own board (the direction wheel sits on a board tile — it closes first)
  useEffect(() => {
    if (prepCamSeen.current === prepCamKey) return;
    prepCamSeen.current = prepCamKey;
    if (!view || viewModeRef.current !== 'prep' || !showPrep) return;
    if (live.current.facing) cancelFacingRef.current();
    setSel(null);
    const pc = prepCameraFor(pub, myId, shopFolded);
    setCam(pc.kind, pc.opts);
  }, [view, prepCamKey, showPrep]);

  // the shop bar folded (收起) or unfolded on the own prep board (public issue #5: the board did not grow, while the
  // battle and scouting views had no bar to make room for): the official shop-collapsed camera or the shop camera
  // again, flown like any camera change. Never over the pen or a teammate's board or in battle; deferred while a piece
  // is dragged or its direction is chosen (the drop target and the wheel sit on tiles of the camera in use) — this
  // effect runs again when that ends (gameLogic foldCamera). Picking reads the camera of every frame (render/pick.js).
  useEffect(() => {
    const next = foldCamera({
      pub, myId, folded: shopFolded, ownPrep: !!view && viewModeRef.current === 'prep' && showPrep,
      pen, busy: !!drag || !!facing, current: camRef.current,
    });
    if (next) setCam(next.kind, next.opts);
  }, [view, shopFolded, showPrep, pen, !!drag, !!facing, prepCamKey]);

  // 联防 / 最终攻势: the ‹ › pill moves the camera between the field's halves and 全景 (research 09 §3.1)
  useEffect(() => {
    if (!view || !field || !field.local || !isCombatPhase(phase)) return;
    if (!cameraLayers(field, pub, myId).length) return;
    const kind = field.kind === 'hidden' ? 'boss' : field.kind;
    setCam(kind, layerCamera(field, layer, sidesOf(field)[myId] || 'L'));
  }, [layer]);

  // 前往查看 of a teammate on a two-half shared field (a 联防 leaker / an eliminated spectator tapping a helper or a pair
  // player): the camera goes to that player's half, so the ‹ › pill reads "👁 name" like the strip's tag (DESIGN §20.15;
  // official observing targets a player, research 09 §3.1). Once per pick and per field entered (entering resets 全景).
  const whoAppliedRef = useRef({ who: null, field: null });
  useEffect(() => {
    const who = watchWho;
    if (!view || !who || !field || field.fieldId !== who.fieldId || !field.local || !isCombatPhase(phase)) return;
    const A = whoAppliedRef.current;
    if (A.who === who && A.field === field) return;
    whoAppliedRef.current = { who, field };
    const k = playerLayer(field, pub, myId, who.playerId);
    if (!k) return;
    setLayer(k);
    // the camera directly too: when the layer state already equals k the [layer] effect would not run
    setCam(field.kind === 'hidden' ? 'boss' : field.kind, layerCamera(field, k, sidesOf(field)[myId] || 'L'));
  }, [view, watchWho, field, phase]);

  // graceful degradation: without WebGL / the render engine the DOM view takes over — say so once per match (not while
  // a late engine is still on its way to replace it: ui/fieldHost.js useFieldView `upgrading`)
  useEffect(() => {
    if (viewKind !== 'fallback' || viewUpgrading) return;
    let asked = null;
    try { asked = new URLSearchParams(globalThis.location?.search || '').get('render'); } catch { asked = null; }
    if (asked === 'fallback' || globalThis.__SP_RENDER__ === 'fallback') return;
    toast(t('渲染器暂时未能加载，已切换为简化视图（功能不受影响，可刷新重试）'), 'info', { ttl: 5000 });
  }, [viewKind, viewUpgrading]);

  // phase changes: banners, sounds, resets
  const phaseKey = `${phase}:${pub?.round}`;
  const prevPhase = useRef(null);
  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = phase;
    if (prev === phase) return;
    const b = phaseBanner(phase, pub, { alive, spectator });
    // the boss rounds open with their boss_prepare dialog before the round's prep (ui/battleArt.js bossOpening — the
    // client's BOSS_PREPARE_WAITING), its BOSSROUND sound with it, the round-start banner after it; the boss battle
    // itself then starts without a banner (the round bar's trans_boss is the only cue, as for any battle)
    const boss = battleArt('boss').cls ? bossOpening(phase, pub, solo) : null;
    const bossBattle = (phase === PHASE.FINAL_ASSAULT || phase === PHASE.HIDDEN_CORE) && !!battleArt('boss').cls;
    // BATTLE_CHECK: the official loading screen replaces upstream's 协议启动 band when the mode's picture is there
    if (b && !bossBattle && !(phase === PHASE.BATTLE_CHECK && loadingArt(getMode(pub?.modeId)))) setBanner({ ...b, key: phaseKey });
    // round 1 opens with game_start_dialog (and its ON_ACT1AUTOCHESS_TARGET), the round-start banner after it
    const opens = opensGame(phase, prev, pub?.round) && !!battleArt('start').cls;
    if (opens) { setOpening(true); audio.sfx('target'); }
    if (boss) { setBossOpen(boss); audio.sfx(boss === 'hidden' ? 'bossRoundSecret' : boss === 'single' ? 'bossRoundSingle' : 'bossRoundTeam'); }
    if (phase === PHASE.ROUND_START && !opens && !boss) audio.sfx('roundStart');
    else if (phase === PHASE.PREP) audio.sfx('rest', { volume: 0.7 });
    else if (phase === PHASE.COMBAT) audio.sfx('battleStart');
    else if (phase === PHASE.UNITE) audio.sfx('defenceUnite');
    else if (phase === PHASE.FINAL_ASSAULT && !bossBattle) audio.sfx(solo ? 'bossRoundSingle' : 'bossRoundTeam');
    else if (phase === PHASE.HIDDEN_CORE && !bossBattle) audio.sfx('bossRoundSecret');
    else if (phase === PHASE.SP_DRAFT) audio.sfx('draft');
    else if (phase === PHASE.SETTLE) {
      // the own battle's end held for SETTLE (co-op — holdsBattleEnd) or whose result never came in (server-run combat, a
      // reconnect, a battle this client did not run): every alive player's charge of the round (m.public.roundLosses — after
      // a 联防 a leaker pays for the survivors, not for its own battle's leaks; a teammate's loss alone makes it NORMAL),
      // else the held result, else what the round kept (ui/gameLogic/phases.js settleBattleEnd)
      const kept = roundLossRef.current;
      roundLossRef.current = null;
      const cost = kept && kept.round === pub?.round ? kept : null;
      const held = heldEndRef.current && heldEndRef.current.round === pub?.round ? heldEndRef.current.over : null;
      heldEndRef.current = null;
      const over = battleEndRound.current === pub?.round ? null : settleBattleEnd(cost, pub?.roundLosses || pub?.uniteResult?.losses, myId, held);
      if (over) announceBattleEnd(over, pub?.round);
    }
    // the server resets every watcher to its own field on phase changes — but an eliminated player / spectator seat
    // keeps the prep board it follows from 回合开始 through 机变 and 休整期 (Match._followScout re-points it only at the
    // round start): resetting here would fly the camera home and back at every prep phase (item 56)
    const keepScout = (phase === PHASE.SP_DRAFT || phase === PHASE.PREP) && (!alive || spectator)
      && typeof live.current.watching === 'string' && live.current.watching.startsWith('n:');
    if (!keepScout) {
      setWatching(null);
      setWatchWho(null);
    }
    // the pen is a 休整期 view: leaving prep returns the camera (the next setCam would, too)
    if (phase !== PHASE.PREP && penRef.current.on) togglePenRef.current(false);
    // a battle unit's panel (live HP of a unit of the fight that just ended) never outlives its battle
    if (!isCombatPhase(phase) && phase !== PHASE.SETTLE) setDetail((d) => (inBattleCard(d) ? null : d));
    if (isCombatPhase(phase)) { setCollapsed(false); setDrag(null); view?.highlightTiles(null, null); }
    setSel(null);
    if (phase !== PHASE.PREP) setRewardMin(false);
    setSpBusy(null);
  }, [phaseKey]);

  useEffect(() => {
    setPersonalBusy((b) => b?.choiceId === personalChoice?.id ? b : null);
    if (!personalChoice) return;
    setSel(null);
    setDetail(null);
    setArmedCard(null);
    setDrag(null);
    view?.highlightTiles(null, null);
    cancelFacingRef.current();
  }, [personalChoice?.id, view]);

  // a reload / reconnect while watching a teammate's battle after the own one (client-side combat): the server resends
  // the watched field, the fresh screen adopts it as watched once per battle — the observing pill, 返回战场 and the own
  // row work again, and the bond strip's "👁 name" matches the HUD (battle/observe.js resumedWatch)
  const seenBattleRef = useRef(null);
  useEffect(() => {
    const r = resumedWatch(battleState, { pub, myId, alive, watching, seen: seenBattleRef.current });
    seenBattleRef.current = r.seen;
    if (r.fieldId) setWatching(r.fieldId);
  }, [battleState?.battleId, battleState?.loading, !!pub]);

  // the countdown cue (official ON_ACT1AUTOCHESS_COUNTDOWN, maintainer decision 2026-10-14): once, when the HUD countdown
  // turns orange at the phase's warning time (gameLogic countdownWarnAt), ready or not — upstream ticked every second
  // of the last 10, and only for a player not ready yet or on their own 机变 pick
  const timerCue = () => audio.sfx('timer');

  // your turn cue in the 机变 draft
  const spMine = !!sp && !solo && sp.turnPid === myId && !sp.pickOf.has(myId);
  useEffect(() => { if (spMine) audio.sfx('yourTurn'); }, [spMine]);

  // promotion (merge reward offered) and bond activation cues; a special refresh's offer (凯瑟琳 定向投放 …) plays the
  // shop's refresh sound instead of the promotion cue
  const offerCue = priv?.shop?.rewardOffer ? (priv.shop.rewardOffer.source === 'special' ? 'refresh' : 'merge') : null;
  useEffect(() => { if (offerCue) audio.sfx(offerCue); }, [offerCue]);
  // local patch (maintainer report 2026-10-07): an own operator dropped in on the prep board / bench — bought, a reward the
  // server gave, moved to the board or back to the bench — plays its deploy sound (render/app.js prepDeployed)
  // LOCAL-PATCH.md 「오퍼레이터 음성」 (2-5, owner 2026-10-08): one the player placed from the bench (commitFacing → placedRef) says its 部署 line
  // as it lands on the board
  const placedRef = useRef(new Map()); // uid → Date.now() of a committed bench → board placement
  useEffect(() => (view ? view.on('pieceDeploy', (e) => {
    audio.prepDeploy(e?.unit, e?.uid);
    const at = e?.area === 'board' ? placedRef.current.get(e.uid) : undefined;
    if (at === undefined) return;
    placedRef.current.delete(e.uid);
    if (Date.now() - at <= PLACE_VOICE_MS) voiceForPlace(e.unit, e.uid);
  }) : undefined), [view]);
  // 2026-10-10, docs/rules/audio.md 「오퍼레이터 음성」: an official route preview cursor of the battle's start appeared
  // (render/fxroute.js createBattleCursors) on a field of the player's own → 行动开始 by an operator of the own board
  // (voice.js voiceForRoutePreview); a watched teammate's field stays silent. The boss-prep route preview (our feature)
  // says nothing (관리자 결정 (2026-10-10)).
  useEffect(() => (view ? view.on('routePreview', (e) => {
    const f = live.current.field;
    if (!f || (e?.fieldId != null && f.fieldId !== e.fieldId) || !Array.isArray(f.players) || !f.players.includes(live.current.myId)) return;
    const board = Array.isArray(live.current.priv?.board) ? live.current.priv.board : [];
    const ids = board.filter((p) => p && p.kind === 'chess').map((p) => { const r = ownShown(p.id); return r?.assets?.spine || r?.charId || null; });
    voiceForRoutePreview(ids);
  }) : undefined), [view]);
  // a shop / reward card armed for a purchase that completes a merge lights the tile its elite will take (the deployed
  // copy that deploys first — PRTS 卫戍协议/帮助 "若消耗已部署至作战区的干员，则发送至作战区对应位置", gameLogic.mergeTarget)
  const mergeAt = armedCard?.kind === 'chess' && editable && showPrep ? mergeTarget(priv, armedCard.id, gd.chess) : null;
  const mergeAtKey = mergeAt ? `${mergeAt.row},${mergeAt.col}` : '';
  useEffect(() => {
    if (!view) return;
    try { view.highlightTiles(mergeAt ? [[mergeAt.row, mergeAt.col]] : [], MERGE_HL); } catch { /* cosmetic */ }
  }, [view, mergeAtKey]);
  const activeBonds = (priv?.bonds || []).filter((b) => b && b.active).length;
  const prevActive = useRef(activeBonds);
  useEffect(() => {
    // upstream #482: a layer gain of the same update (m.layer, main.js) already started the cue — keep it, don't restart it
    if (activeBonds > prevActive.current && phase === PHASE.PREP && !audio.bondCueRecent('prep')) audio.sfx('bondUp', { scope: 'prep' });
    prevActive.current = activeBonds;
  }, [activeBonds]);

  // emote bubbles (and a sound for teammates' emotes)
  const bubbleMs = (gd.config?.timers?.chatBubble ?? 3) * 1000;
  const bubbles = activeBubbles(emotes, Date.now(), bubbleMs);
  useTicker(bubbles.size ? 500 : 0); // re-render only while a bubble is showing (to expire it)
  const lastEmote = useRef(emotes.length ? emotes[emotes.length - 1].seq : 0);
  useEffect(() => {
    const e = emotes[emotes.length - 1];
    if (e && e.seq > lastEmote.current) { lastEmote.current = e.seq; if (e.playerId !== myId) audio.sfx('emote', { volume: 0.6 }); }
  }, [emotes]);

  // ---- actions ----------------------------------------------------------------------------------------------
  const buy = useCallback(async (i) => {
    const slot = live.current.priv?.shop?.slots?.[i];
    // local patch (maintainer report 2026-10-07): an operator / summon lands on the bench with its deploy sound (pieceDeploy) —
    // the shop's own sound (ON_ACT1AUTOCHESS_MAGIC_PLACE_HAND, b_char_tokenset) stays for equipment. No 部署 line (owner's
    // 卫戍协议 videos, 2026-10-08: a purchase / reward only sounds the deploy SFX).
    return actions.buy(i, slot && slot.kind !== 'item' ? { sfx: false } : undefined);
  }, []);
  const pickReward = useCallback((i) => actions.reward(i), []);
  // 准备 asks first, as the client's _EventOnPrepReadyBtnClick: units left in the temp row (PREP_READY_TIP_1 —
  // gameLogic.readyOverflowPrompt; they go at the prep's end), then funds left (PREP_READY_TIP_2, community report #4: the
  // prep's end wipes them; not 坎诺特, not at 0 funds, not under AI 托管, not once muted — gameLogic.readyFundsPrompt),
  // each confirmed before the next. The button and Space both come here.
  const askingReady = useRef(false);
  const toggleReady = useCallback(async (r) => {
    const L = live.current;
    const me = Array.isArray(L.pub?.players) ? L.pub.players.find((p) => p && p.playerId === L.myId) : null;
    const asks = r ? [
      ['overflow', readyOverflowPrompt(L.priv, { autoplay: !!me?.autoplay })],
      ['gold', goldTipOff.current ? null : readyFundsPrompt(L.priv, { keptBands: data.get('config')?.economy?.leftoverFundsKeptByBands, autoplay: !!me?.autoplay })],
    ].filter(([, a]) => a) : [];
    if (asks.length) {
      if (askingReady.current) return;
      askingReady.current = true;
      let ok = true;
      for (const [kind, ask] of asks) {
        // the client's own confirm dialog when the local art has it (ui/battleArt.js ReadyTipDialog; the funds one has
        // the 本局不再提示 box that mutes it for the rest of this match), else the generic one
        ok = battleArt('confirm').cls
          ? await new Promise((resolve) => setGoldAsk({ text: ask.text, check: kind === 'gold', resolve }))
          : await confirmDialog(ask);
        const now = live.current;
        if (!ok || now.pub?.phase !== PHASE.PREP || now.priv?.ready) { ok = false; break; }
      }
      askingReady.current = false;
      if (!ok) return;
    }
    setReadyBusy(true);
    await actions.ready(r);
    setReadyBusy(false);
  }, []);
  // the tile toast belongs to the board it was read from: a new phase (prep ↔ battle, the next round) takes it away
  useEffect(() => { setTileTip(null); tipAtDown.current = null; }, [phase, watching]);
  // the prep ended (timer) while the question was open: drop it — the funds are gone either way
  useEffect(() => {
    if (phase === PHASE.PREP || !askingReady.current) return;
    closeAllDialogs();
    setGoldAsk((g) => { g?.resolve(false); return null; });
  }, [phase]);

  /** 出售 (operators, underframe +N) / 销毁 (items and Arts, confirmed: they cannot be sold). */
  const sellPiece = useCallback(async (piece) => {
    if (!piece) return false;
    const closeIt = () => { setDetail((d) => (d?.kind === 'piece' && d.uid === piece.uid ? null : d)); setSel((x) => (x && x.uid === piece.uid ? null : x)); };
    if (piece.kind === 'item') {
      // an equipped item is locked (the server refuses g.destroy): replacing it is the equip-replace dialog's job
      if (!itemDestroyable(live.current.placeCtx, piece.uid)) { matchToast(t('已配发的装备无法销毁'), 'warn'); audio.sfx('error', { volume: 0.5 }); return false; }
      const it = data.lookup('items', piece.id);
      const ok = await confirmDialog({ title: t('销毁道具'), text: t('道具无法出售。确定要销毁「{name}」吗？', { name: it?.name || t('道具') }), okText: t('销毁'), danger: true });
      if (ok && await actions.destroy(piece.uid)) { closeIt(); return true; }
      return false;
    }
    if (await actions.sell(piece.uid)) { closeIt(); return true; }
    return false;
  }, []);

  // The watched field only changes once the server accepted g.watch: a refused target (an eliminated teammate, the
  // other pair's boss field) must not move the eye icon / switcher label away from what is actually on screen.
  // `playerId`: the teammate picked (a team row) — a shared field shows two players, the strip follows the picked one
  // (DESIGN §20.15); null for a field picked as such (the legacy switcher).
  const requestWatch = useCallback(async (fid, playerId = null) => {
    const prev = live.current.watching;
    const prevWho = live.current.watchWho;
    const who = playerId ? { fieldId: fid, playerId } : null;
    setWatching(fid);
    setWatchWho(who);
    const ok = await actions.watch(fid, playerId);
    if (!ok) {
      setWatching((w) => (w === fid ? prev : w));
      setWatchWho((w) => (w === who ? prevWho : w));
    }
    return ok;
  }, []);

  /** Back to the own field (返回战场 / the own row). */
  const backHome = useCallback(() => {
    const L = live.current;
    if (L.watching && L.watching !== L.home) {
      const target = isCombatPhase(L.pub?.phase) ? L.home : ownFieldId(L.myId);
      // client-side combat without an own field to go back to (a 联防 leaker, an eliminated player): the screen keeps
      // the field it shows — g.watch of a field that does not exist would only be refused (an error toast); an
      // eliminated player / spectator seat has no prep board of its own either
      const combatNow = isCombatPhase(L.pub?.phase);
      const exists = combatNow ? (!isClientCombat(L.pub) || (Array.isArray(L.pub?.fields) && L.pub.fields.some((f) => f && f.fieldId === target)))
        : (L.alive && !L.spectator);
      if (exists) actions.watch(target);
    }
    setWatching(null);
    setWatchWho(null);
  }, []);

  const watchPlayer = useCallback((p) => {
    const L = live.current;
    if (isClientCombat(L.pub)) {
      const observing = !!L.watching && L.watching !== L.home && L.watching !== ownFieldId(L.myId);
      const t = observeTarget(p, L.pub, L.myId, { observing });
      if (t.back) { backHome(); return; }
      if (t.reason) { matchToast(t.reason, 'warn'); audio.sfx('error', { volume: 0.5 }); return; }
      if (t.fieldId) requestWatch(t.fieldId, p.playerId);
      return;
    }
    const self = p.playerId === L.myId;
    if (self) {
      // (an eliminated player / spectator seat has no prep board of its own to ask for: item 56)
      const combatNow = isCombatPhase(L.pub?.phase);
      if (L.watching && L.watching !== L.home && (combatNow || (L.alive && !L.spectator))) actions.watch(combatNow ? L.home : ownFieldId(L.myId));
      setWatching(null);
      setWatchWho(null);
      return;
    }
    const t = watchTarget(p, L.pub, L.myId);
    if (t.reason) { matchToast(t.reason, 'warn'); audio.sfx('error', { volume: 0.5 }); return; }
    requestWatch(t.fieldId, p.playerId);
  }, []);

  const watchField = useCallback((fid) => { requestWatch(fid); }, []);

  // an eliminated player or a spectator seat follows a player through every phase reset (community report of
  // 2026-10-06, item 56; the idea of PR #189): the server pushes that player's prep board (Match._followScout) — the one
  // it last watched, else the first player still in — and the screen adopts it like a 前往查看 tap, once per phase and
  // board (a 返回战场 this phase is not overridden; a row switches to another player, who is followed from then on).
  // Until 0.2.0 every round's reset dropped an eliminated player onto its own empty board (a spectator seat asked for
  // the first player itself).
  const followRef = useRef(null);
  useEffect(() => {
    const fid = followedScout({ field, watching, alive, spectator, myId });
    if (!fid || !pub) return;
    const key = `${phaseKey}:${fid}`;
    if (followRef.current === key) return;
    followRef.current = key;
    // the phase reset's render (watching null) ran the own-prep branch with this scout meta in `field` and marked it
    // stale: un-mark it, or the enter effect refuses it and the board stays blank until the player moves (PR #189)
    if (staleFieldRef.current === field) staleFieldRef.current = null;
    setWatching(fid);
    setWatchWho({ fieldId: fid, playerId: fid.slice(2) });
  }, [field, pub, watching, alive, spectator, phaseKey, myId]);

  // ---- view events (drag & drop, clicks) ----------------------------------------------------------------------
  useEffect(() => {
    if (!view) return undefined;
    let moveOff = null;
    // the drop target is the tile under the pointer (render/drag.js; an item dropped on a unit's tile equips that unit —
    // user playtest #4 item 1); `tile` = the last target tile (tileHover), `released` = the pointer went up (not a cancel)
    const ptr = { released: false, tile: null };
    // local patch: the item being dragged (its equip-slot popup over the operator under it) and the popup's last state
    const eq = { uid: null, state: null };
    const setEq = (st) => { eq.state = st; setEqHover(st); };
    const lookups = { getChess: ownChess, getToken: gd.token, getItem: gd.item, chessRecord: (rec) => deployedRecord(rec, live.current.priv, ownChess, gd.backups) };
    const runIntent = async (intent) => {
      const L = live.current;
      if (intent.confirmReplace) {
        // both slots used: the player picks the equipped item to destroy (cancel ⇒ nothing is sent)
        const request = replaceRequest(L.placeCtx, intent, ownShown, gd.item);
        if (request) {
          const uid = await openReplaceRef.current(request);
          if (!Number.isInteger(uid)) { audio.sfx('back', { volume: 0.5 }); return; }
          const r = replaceIntent(intent, uid);
          await actions.equip(r.fields.itemUid, r.fields.targetUid, r.fields.replaceUid);
          return;
        }
      }
      const f = intent.fields;
      if (intent.t === 'g.move') await actions.move(f.uid, f.to);
      else if (intent.t === 'g.equip') await actions.equip(f.itemUid, f.targetUid);
      else if (intent.t === 'g.art') await actions.art(f.itemUid, f.row, f.col);
    };
    const refuse = (reason) => {
      audio.sfx('error', { volume: 0.5 });
      if (reason) matchToast(reason, 'warn');
    };
    const endDrag = () => {
      moveOff?.(); moveOff = null;
      setDrag(null);
      eq.uid = null;
      if (eq.state && !eq.state.equipped) setEq(null);
      view.highlightTiles(null, null);
    };
    /** Open the direction wheel for a legal board drop (the piece stays on the tile meanwhile). */
    const openFacing = (entry, t) => {
      const piece = entry.piece;
      const rec = piece.kind === 'item' ? gd.item(piece.id) : piece.kind === 'token' ? gd.token(piece.id) : ownShown(piece.id);
      holdPiece(view, piece.uid, { row: t.row, col: t.col });
      setSel(null);
      setFacing({ uid: piece.uid, piece, row: t.row, col: t.col, grid: previewGrid(lookups, piece), name: rec?.name || '' });
      audio.sfx('pick', { volume: 0.5 });
    };
    const offs = [
      view.on('pieceDragStart', (e) => {
        const L = live.current;
        const entry = L.placeCtx?.pieces.get(e?.uid);
        if (!entry || !L.editable) return;
        audio.sfx('pick', { volume: 0.6 }); // no 选中 line when a drag to place starts (owner's 卫戍协议 videos, 2026-10-08)
        setSel(null);
        // a new placement: a piece's detail card (right-click / long-press) would sit beside the wheel showing another unit
        setDetail((d) => (d?.kind === 'piece' ? null : d));
        setDrag({ uid: entry.piece.uid, kind: entry.piece.kind, id: entry.piece.id, area: entry.area });
        eq.uid = entry.piece.kind === 'item' ? entry.piece.uid : null;
        setEq(null);
        const { legal } = boardTargets(L.placeCtx, entry.piece.uid);
        // local patch (LOCAL-PATCH.md 「배치 UI」): the bench slots that take the piece are tinted too (teal, board3d
        // tileOverlay BENCH_TINT), its own slot included — like the official prep (KR capture: the whole bench while an
        // item is dragged)
        for (let i = 0; i < GEO.HAND_SIZE; i++) {
          const own = entry.area === 'hand' && entry.idx === i;
          if (own || canPlace(L.placeCtx, entry.piece.uid, { area: 'hand', idx: i }).ok) legal.push([GEO.HAND_ROW, i]);
        }
        view.highlightTiles(null, null);
        view.highlightTiles(legal, 'legal');
        ptr.released = false; ptr.tile = null;
        // capture phase: marked before the drag controller (canvas listener) ends the drag
        const onUp = () => { ptr.released = true; };
        window.addEventListener('pointerup', onUp, { passive: true, capture: true });
        moveOff = () => window.removeEventListener('pointerup', onUp, { capture: true });
      }),
      view.on('tileHover', (t) => {
        ptr.tile = t && typeof t === 'object' ? t : null;
        if (eq.uid != null) setEq(equipHoverState(live.current.placeCtx, eq.uid, ptr.tile)); // local patch
      }),
      view.on('pieceDrop', async (e) => {
        // local patch: an item dropped on the operator its popup shows plays the slot's equipped flash, then closes
        const st = eq.state;
        const t0 = e?.target || {};
        const onIt = st && !st.full && eq.uid === e?.uid
          && (t0.area === 'board' ? t0.row === st.row && t0.col === st.col : t0.area === 'hand' && st.row === GEO.HAND_ROW && t0.idx === st.col);
        endDrag();
        setEq(onIt ? { ...st, equipped: true } : null);
        if (onIt) setTimeout(() => { if (eq.state?.equipped) setEq(null); }, 0);
        const L = live.current;
        if (!e || !L.editable) return;
        const entry = L.placeCtx?.pieces.get(e.uid);
        if (!entry) return;
        const t = e.target || {};
        if (t.area === 'outside') return; // no drag-to-sell (research 09 §5): the piece goes back
        const res = canPlace(L.placeCtx, e.uid, t);
        if (needsFacing(L.placeCtx, e.uid, t, res)) { openFacing(entry, t); return; }
        const intent = dropIntent(L.placeCtx, e.uid, t);
        if (!intent) {
          if (res.code && res.code !== 'ALREADY') refuse(res.reason);
          return;
        }
        await runIntent(intent);
      }),
      view.on('pieceDragEnd', (e) => {
        // a cancelled drag (no pieceDrop) must not leave the highlights behind; a release on a tile that takes nothing
        // (the drag controller found no legal target there) says why
        const released = ptr.released;
        const tile = ptr.tile;
        endDrag();
        const L = live.current;
        if (!e || e.dropped || !released || !L.editable) return;
        const src = L.placeCtx?.pieces.get(e.uid);
        if (!src) return;
        const onOwnSlot = !!tile && ((src.area === 'board' && tile.area === 'board' && tile.row === src.row && tile.col === src.col)
          || (src.area !== 'board' && tile.area === src.area && (tile.idx ?? tile.col) === src.idx));
        if (onOwnSlot) return; // put back where it was
        const reason = dropFailureReason(L.placeCtx, e.uid, tile);
        if (reason) refuse(reason);
      }),
      view.on('pieceClick', (e) => {
        if (!e) return;
        audio.sfx('click', { volume: 0.4 });
        // an enemy of the preview pen (research 09 §2.2 "Intel": tap it for its detail card) or the round's leader on the boss
        // field; opened from the field, so the next press of the field closes it like a piece's card (GitHub #3: a boss card
        // left open covered the bench)
        const penKey = previewEnemyKey(e);
        if (penKey) { setDetail({ kind: 'enemy', id: penKey, fromField: true }); return; }
        if (e.unitId != null || e.unit) {
          setDetail({ kind: 'unit', unit: e.unit || null, unitId: e.unitId, uid: e.uid });
          if (isCombatPhase(live.current.pub?.phase)) voiceForUnit(e.unit, e.unitId); // local patch: 选中 line, a re-tap too
          return;
        }
        if (!Number.isInteger(e.uid)) return;
        setDetail({ kind: 'piece', uid: e.uid });
        // a tap selects an own piece (underframe + range); right-click / long-press only opens its detail card. A tap on
        // the piece that was selected when the press started deselects it.
        const L = live.current;
        if (e.detail || e.button === 2 || !L.editable || L.facing) return;
        const wasSel = pressSel.current === e.uid;
        pressSel.current = null;
        setSel(wasSel ? null : { uid: e.uid });
        const tapped = L.placeCtx?.pieces.get(e.uid)?.piece;
        // a re-tap of the selected one speaks too (official); the voice of what the piece shows — 自选 / 补位 (voice.js)
        voiceForPiece(tapped, tapped && tapped.kind !== 'item' && tapped.kind !== 'token' ? ownShown(tapped.id) : null);
        if (wasSel) setDetail((d) => (d?.kind === 'piece' && d.uid === e.uid ? null : d));
      }),
      // a tap on the ground itself: a stage device on the tile (阻隔工事 / “双眼皮” / 射击台 / 源石流发生装置: GitHub #228, PR
      // #229) explains itself first — the renderer's pick skips devices, so the tap lands here —, then a special terrain
      // tile (GitHub issue #184 「建议加入对于特殊地形的单击信息提示」) — 活性源石 / 沼泽 / 排气格栅 / 深水区 / 红蓝门 /
      // 传送, with the numbers of the stage behind the board. An ordinary tile (road / floor / wall) says nothing, so the
      // press keeps its other meanings (deselect, close).
      view.on('tileClick', (t) => {
        if (!t || !Number.isInteger(t.row) || !Number.isInteger(t.col)) return;
        const L = live.current;
        const [row, col] = L.terrainTile(t.row, t.col);
        const device = L.deviceBattle
          ? deviceTipAt(L.terrainStage, row, col, { units: [...deviceUnitsRef.current.values()], snap: snapUnitsRef.current })
          : deviceInfo(L.terrainStage, row, col);
        if (device) {
          audio.sfx('click', { volume: 0.4 });
          setSel(null);
          setDetail({ kind: 'device', device });
          return;
        }
        // a special tile: the client's tile toast at the top (TileInfoController._SelectTile → UIToastController.Show,
        // GitHub #3, maintainer decision 2026-10-14) — no card, nothing over the board; the press already hid the last one
        const info = terrainInfo(L.terrainStage, row, col);
        if (!info) return;
        const key = `${row},${col}`;
        const again = tipAtDown.current?.key === key;
        if (!again) audio.sfx('click', { volume: 0.4 });
        setSel(null);
        setTileTip({ key, terrain: info, again });
      }),
    ];
    return () => { moveOff?.(); for (const off of offs) { try { off?.(); } catch { /* ignore */ } } };
  }, [view]);

  // ---- equip-replace dialog (ui/equipReplace.js): one at a time; resolves the picked replaceUid or null (cancel) ----------
  const replaceRef = useRef(null);
  replaceRef.current = replace;
  const closeReplace = useCallback((uid) => {
    const cur = replaceRef.current;
    if (!cur) return;
    replaceRef.current = null;
    setReplace(null);
    try { cur.resolve(Number.isInteger(uid) ? uid : null); } catch { /* ignore */ }
  }, []);
  const openReplaceRef = useRef(null);
  openReplaceRef.current = (request) => new Promise((resolve) => {
    if (replaceRef.current) { try { replaceRef.current.resolve(null); } catch { /* ignore */ } }
    const next = { request, resolve };
    replaceRef.current = next;
    setSel(null);
    setReplace(next);
    audio.sfx('click', { volume: 0.5 });
  });
  // the dialog closes (nothing sent) when editing stops or its operator / item / equipped items changed meanwhile
  useEffect(() => {
    if (!replace) return;
    const r = replace.request;
    const target = placeCtx.pieces.get(r.targetUid)?.piece;
    const items = Array.isArray(target?.items) ? target.items : [];
    const still = editable && !!target && !!placeCtx.pieces.get(r.item.uid) && r.options.every((o) => items.some((x) => x && x.uid === o.uid));
    if (!still) closeReplace(null);
  }, [replace, placeCtx, editable]);
  useEffect(() => () => { const cur = replaceRef.current; replaceRef.current = null; try { cur?.resolve(null); } catch { /* ignore */ } }, []);

  // ---- solo pause (g.pause; m.public.paused) ---------------------------------------------------------------------------
  const togglePause = useCallback(async (on) => {
    setPauseBusy(true);
    await actions.pause(on);
    setPauseBusy(false);
  }, []);
  const togglePauseRef = useRef(togglePause);
  togglePauseRef.current = togglePause;

  // ---- solo resume (tab_single_resume_dialog): this screen opened on a solo run already under way (a reload, a new tab)
  // → the official one-button dialog first; a running battle waits paused under it (the client sends ReqResumeSingleMode
  // only on 确认) and goes on at 确认 (ui/battleArt.js soloResumeDue / OnlyConfirmDialog)
  const firstPubSeen = useRef(false);
  const [resumeAsk, setResumeAsk] = useState(null); // { pausedHere }
  useEffect(() => {
    if (firstPubSeen.current || !pub) return;
    firstPubSeen.current = true;
    if (spectator || !soloResumeDue(pub, solo) || !battleArt('confirm').cls) return;
    const pause = !pub.paused && pauseAvailable(pub, { solo, alive });
    setResumeAsk({ pausedHere: pause });
    if (pause) togglePauseRef.current(true);
  }, [pub]);
  const answerResume = () => {
    const ask = resumeAsk;
    setResumeAsk(null);
    if (ask?.pausedHere && isPaused(store.get().match.public)) togglePauseRef.current(false);
  };

  // a press on the field deselects (a tap on a piece selects it again at release — see pieceClick)
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const onDown = () => {
      const L = live.current;
      pressSel.current = L.sel ? L.sel.uid : null;
      if (L.sel) setSel(null);
      // tapping elsewhere closes the selection and a card opened from the field — by a tap, a right-click or a long
      // press (a press on a piece re-opens its card at release, pieceClick)
      setDetail((d) => (closesOnFieldPress(d) ? null : d));
      // and the tile toast (the client's _ClearSelectedTile); a press on the same tile shows it again at release (tileClick)
      tipAtDown.current = L.tileTip;
      if (L.tileTip) setTileTip(null);
    };
    host.addEventListener('pointerdown', onDown, true);
    return () => host.removeEventListener('pointerdown', onDown, true);
  }, []);
  // a press outside the field lets go of the selected piece too (the chat, the player list, the top bar …): only its
  // underframe (撤退 / 出售 / 销毁), its card and a dialog keep it, so Q / X never act on a piece the player let go of
  // (a report: X after a press on the chat sold the operator selected before)
  useEffect(() => {
    if (!sel) return undefined;
    const onDown = (e) => {
      const t = e.target;
      if (hostRef.current?.contains(t)) return; // the field's own press (above): a re-tap of the piece toggles it
      if (t?.closest?.('.uframe, .dpanel, .modal')) return;
      setSel(null);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [!!sel]);

  // ---- direction step (research 09 §1.2) and the selected piece's underframe ------------------------------------
  const heldRef = useRef(new Map());                     // uid → { row, col, t } committed placements awaiting m.private
  const releaseHold = useCallback((uid) => {
    heldRef.current.delete(uid);
    holdPiece(view, uid, null);
    setHoldSeq((n) => n + 1);                           // re-apply the prep state: the piece settles where the server says
  }, [view]);
  const cancelFacing = useCallback(() => {
    const f = live.current.facing;
    if (!f) return;
    setFacing(null);
    if (f.piece.kind !== 'item') setPieceDir(view, f.uid, pieceDir(f.piece));
    releaseHold(f.uid);
    audio.sfx('back', { volume: 0.5 });
  }, [view, releaseHold]);
  cancelFacingRef.current = cancelFacing;
  const previewFacing = useCallback((dir) => {
    const f = live.current.facing;
    if (!f || f.piece.kind === 'item') return;
    setPieceDir(view, f.uid, dir || pieceDir(f.piece));
  }, [view]);
  const commitFacing = useCallback(async (dir) => {
    const f = live.current.facing;
    if (!f) return;
    setFacing(null);
    const intent = facingIntent(f.piece, { row: f.row, col: f.col }, dir);
    heldRef.current.set(f.uid, { row: f.row, col: f.col, t: Date.now() });
    // 2-5: a bench → board placement says its 部署 line when it lands (pieceDeploy) — not a move on the board
    const from = live.current.placeCtx?.pieces.get(f.uid)?.area;
    if (f.piece.kind === 'chess' && from && from !== 'board') placedRef.current.set(f.uid, Date.now());
    const ok = intent.t === 'g.art'
      ? await actions.art(intent.fields.itemUid, intent.fields.row, intent.fields.col, intent.fields.dir)
      : await actions.move(intent.fields.uid, intent.fields.to, intent.fields.dir);
    if (!ok) {
      placedRef.current.delete(f.uid); // 2-5
      if (f.piece.kind !== 'item') setPieceDir(view, f.uid, pieceDir(f.piece));
      releaseHold(f.uid);
      return;
    }
    // accepted: the piece stays on the tile until m.private shows it there (or a short grace passes)
    setTimeout(() => { if (heldRef.current.has(f.uid)) releaseHold(f.uid); }, 1500);
  }, [view, releaseHold]);
  // m.private caught up with a committed placement → stop holding it; a summon stack of several copies (凯瑟琳's 2
  // devices, user playtest #6) stays in the hand and one copy — another piece — lands on the tile: release it too
  useEffect(() => {
    const splitLanded = (e, h) => e.piece.kind === 'token' && [...placeCtx.pieces.values()].some((x) => x.area === 'board' && x.piece.kind === 'token'
      && x.piece.id === e.piece.id && x.piece.uid !== e.piece.uid && x.row === h.row && x.col === h.col);
    for (const [uid, h] of [...heldRef.current]) {
      const e = placeCtx.pieces.get(uid);
      if (!e || (e.area === 'board' && e.row === h.row && e.col === h.col) || (e.area !== 'board' && splitLanded(e, h))) releaseHold(uid);
    }
  }, [placeCtx]);
  // the wheel closes when editing stops (ready, phase end, observing) or its piece is gone (merged, sold)
  useEffect(() => {
    if (facing && (!editable || !placeCtx.pieces.get(facing.uid))) cancelFacing();
  }, [editable, placeCtx, facing]);
  // the selected piece: gone / not editable → deselect (its range tiles: the detail card's, cardRange below)
  const selEntry = sel ? placeCtx.pieces.get(sel.uid) || null : null;
  live.current.showPrep = showPrep;
  useEffect(() => { if (sel && (!selEntry || !editable || !showPrep)) setSel(null); }, [sel, selEntry, editable, showPrep]);
  // the selected piece's underframe on screen: the detail card docks on the side away from it (user playtest #2
  // item 8 — at some aspect ratios a bench unit's 出售 sat under the left card); the underframe is drawn above every
  // panel anyway (css z-index), this keeps it visible too
  const ufTile = selEntry && editable && showPrep ? pieceTile(selEntry) : null;
  const ufGeo = useTileScreen(view, ufTile ? ufTile.row : null, ufTile ? ufTile.col : null);
  // the gold tile of an armed merge card (mergeAt): the detail card the first tap opened docks away from it (QA 6b — at
  // 1920×1080 the left card covered half of a target tile in the leftmost legal column)
  const mergeGeo = useTileScreen(view, mergeAt ? mergeAt.row : null, mergeAt ? mergeAt.col : null);
  const retreatSel = useCallback(async () => {
    const L = live.current;
    const uid = L.sel?.uid;
    const to = uid != null ? retreatSlot(L.placeCtx, uid) : null;
    if (!to) { matchToast(t('整备区已满'), 'warn'); audio.sfx('error', { volume: 0.5 }); return; }
    setSelBusy(true);
    if (await actions.move(uid, to)) {
      setSel(null);
      setDetail((d) => (d?.kind === 'piece' && d.uid === uid ? null : d)); // its card would cover the bench
    }
    setSelBusy(false);
  }, []);
  const sellSel = useCallback(async () => {
    const e = live.current.sel ? live.current.placeCtx.pieces.get(live.current.sel.uid) : null;
    if (!e) return;
    setSelBusy(true);
    await sellPiece(e.piece);
    setSelBusy(false);
  }, []);

  // unit clicks from the engine may only carry an id: resolve through m.field / spawn infos
  const detailTarget = useMemo(() => {
    if (detail?.kind !== 'unit' || detail.unit) return detail;
    const u = (Array.isArray(field?.units) ? field.units : []).find((x) => x && x.id === detail.unitId);
    return u ? { ...detail, unit: u } : detail;
  }, [detail, field]);
  const resolved = useMemo(() => resolveDetail(detailTarget, placeCtx.pieces, { priv, backups: gd.backups }), [detailTarget, placeCtx, gd.ready, data.locale()]);
  useEffect(() => { if (detail && !resolved && detail.kind === 'piece') setDetail(null); }, [resolved]);
  const snapHp = (() => {
    const id = resolved?.unitId;
    const t = id != null ? snapUnitsRef.current.get(id) : null;
    return t ? { hp: t[3], max: t[4] } : null;
  })();
  // a crate's / turret's card closes with it: destroyed (HP gone, or its tuple left the snapshots once the die animation
  // is over — before the first snapshot of a battle nothing is judged)
  useEffect(() => {
    const id = detail?.kind === 'device' ? detail.device?.unitId : null;
    const snap = snapUnitsRef.current;
    if (id != null && snap.size > 0 && !(snap.get(id)?.[3] > 0)) setDetail(null);
  }, [hud, detail]);

  // ---- live stats of the detail card (user playtest #4 item 7) ------------------------------------------------------
  // battle: the local sim's unit (battle/runner.js unitStats — a getter the panel re-reads 4× a second; any unit of the
  // battle on screen: own, a teammate's, an enemy). Prep: an own board unit's stats at the start of its next battle,
  // asked from the server (g.unitStats → m.unitStats; only the newest request's answer counts) whenever m.private or the
  // phase changes while such a card is open — the last answer stays on show until the next one lands
  const [unitStats, setUnitStats] = useState(null);      // m.unitStats: { seq, round, units: Map<uid, entry> }
  const statsSeqRef = useRef(0);
  useEffect(() => net.on('m.unitStats', (msg) => {
    if (!msg || msg.seq !== statsSeqRef.current || !Array.isArray(msg.units)) return;
    setUnitStats({ seq: msg.seq, round: msg.round, units: new Map(msg.units.filter((u) => u && Number.isInteger(u.uid)).map((u) => [u.uid, u])) });
  }), []);
  const prepStatsUid = (phase === PHASE.PREP || phase === PHASE.SP_DRAFT || phase === PHASE.ROUND_START) && showPrep && alive
    && !!resolved?.piece && (resolved.type === 'chess' || resolved.type === 'token') && placeCtx.pieces.get(resolved.piece.uid)?.area === 'board'
    ? resolved.piece.uid : null;
  useEffect(() => {
    if (prepStatsUid == null) return undefined;
    const t = setTimeout(() => {
      statsSeqRef.current = (statsSeqRef.current % 1e9) + 1;
      try { Promise.resolve(net.request('g.unitStats', { seq: statsSeqRef.current })).catch(() => {}); } catch { /* offline */ }
    }, 120);
    return () => clearTimeout(t);
  }, [prepStatsUid, priv, phase]);
  const liveStats = (() => {
    if (prepStatsUid != null) {
      const e = unitStats && unitStats.round === pub?.round ? unitStats.units.get(prepStatsUid) : null;
      return e ? { ...e, src: 'prep' } : null;
    }
    // a battle unit's card, or an own board piece's card left open into the battle (its unit found by uid)
    const id = resolved?.unitId;
    const pieceUid = id == null && Number.isInteger(resolved?.piece?.uid) ? resolved.piece.uid : null;
    if ((id == null && pieceUid == null) || !cc || !battleRunner || !field?.local || showPrep) return null;
    const fid = field.fieldId;
    return () => {
      const uid = id ?? battleRunner.unitIdOf(pieceUid, myId, fid);
      const e = uid != null ? battleRunner.unitStats(uid, fid) : null;
      return e ? { ...e, src: 'battle' } : null;
    };
  })();

  // ---- keyboard ---------------------------------------------------------------------------------------------
  useEffect(() => {
    const onKey = async (e) => {
      const act = shortcutFor(e, settingsStore.get().keys); // the player's key map (设置 → 快捷键)
      const L = live.current;
      // dialogs / the guide own the keyboard; behind the 本局信息 / 敌方情报 drawer only Esc (closing it) acts
      if (shortcutBlocked(act, { modal: !!document.querySelector('.modal, .guide'), drawer: !!L.drawer })) return;
      if (L.hasPersonalChoice) {
        if (act !== 'escape') e.preventDefault();
        if (act === 'ready') {
          audio.sfx('error', { volume: 0.5 });
          matchToast(shopBlockReason('ready', { priv: L.priv, editable: true }), 'warn');
        }
        return; // ChoiceOverlay handles Escape without cancelling the server's pending choice.
      }
      if (act === 'escape') {
        if (L.emoteOpen) setEmoteOpen(false);
        else if (L.pen && !L.detail) togglePenRef.current(false);
        else if (L.detail?.from === 'bond') setDetail(null); // a bond member's card lies over its popup
        else if (L.bondOpen) setBondOpen(null);
        else if (L.detail) setDetail(null);
        else if (L.tileTip) setTileTip(null);
        else if (L.drawer) setDrawer(null);
        else if (!L.sel) return;
        // Esc lets go of the selected piece as well (its card is often what it closed): Q / X never act on a piece that
        // looks let go of — only the underframe's small diamond showed it was still selected
        if (L.sel) setSel(null);
        e.preventDefault();
        return;
      }
      // the pause key (Space unless rebound: the official pauseBattle) pauses / resumes a solo battle; nothing else
      if (act === 'pause') {
        e.preventDefault(); // a focused HUD button must not activate either (see shortcutFor)
        if (!L.canPause && !L.paused) return;
        if (e.target instanceof HTMLElement && e.target.closest('button, [role="button"]')) e.target.blur();
        togglePauseRef.current(!L.paused);
        return;
      }
      // the right 🔍 (查看敌人): to the enemy preview pen and back, as its button does
      if (act === 'viewEnemy') {
        if (L.pen) togglePenRef.current(false);
        else if (L.penAvail) togglePenRef.current(true);
        else return;
        e.preventDefault();
        return;
      }
      // 调度中心 (the official autochessShop): folds / unfolds the shop bar, as its 收起 / 展开商店 buttons (the pen keeps
      // the bar folded for itself)
      if (act === 'shop') {
        if (!L.showShop || L.pen) return;
        e.preventDefault();
        setCollapsed((c) => !c);
        return;
      }
      if (L.pub?.phase !== PHASE.PREP || !L.priv) return;
      e.preventDefault(); // a focused HUD button must not also activate (Space, or any key bound) — see shortcutFor
      if (act === 'ready' && e.target instanceof HTMLElement && e.target.closest('button, [role="button"]')) e.target.blur();
      if (act === 'ready') {
        const refused = !L.priv.ready ? shopBlockReason('ready', { priv: L.priv, editable: true }) : null;
        // an open 教鞭 choice blocks it: say why (the button shows it too — user playtest #3 item 3; a temp overflow
        // does not block it any more: toggleReady asks first)
        if (refused) { audio.sfx('error', { volume: 0.5 }); matchToast(refused, 'warn'); return; }
        toggleReady(!L.priv.ready);
        return;
      }
      if (!L.editable) return;
      if (act === 'retreat' || act === 'sell') {
        if (!L.showPrep || L.drag || L.facing || L.selBusy || !L.sel) return;
        const selected = L.placeCtx.pieces.get(L.sel.uid);
        if (selected?.piece.kind !== 'chess') return;
        const available = underframeActions(L.placeCtx, L.sel.uid);
        if (act === 'retreat' && available?.retreat) await retreatSel();
        else if (act === 'sell' && available?.sell != null) await sellSel();
        return;
      }
      const reason = shopBlockReason(act, { priv: L.priv, editable: L.editable });
      if (reason) { audio.sfx('error', { volume: 0.5 }); return; }
      if (act === 'refresh') actions.refresh();
      else if (act === 'freeze') actions.freeze();
      else if (act === 'levelUp') actions.levelUp();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- render ---------------------------------------------------------------------------------------------------
  const readyCount = players.filter((p) => p.ready || p.status === 'ready').length;
  const aliveCount = players.filter((p) => p.alive !== false && p.status !== 'left').length;
  // the own battle is over: the server says so (status done) or — client-side combat — the local simulation just ended
  // (on screen or off it: a teammate watched meanwhile — the runner's state().mine)
  const mineB = cc && battleState ? battleState.mine : null;
  const localDone = !!mineB && mineB.done && mineB.fieldId === ownFieldId(myId);
  // (client-side combat: only in 各自行动 — 联防 observers just watch the 联防 field, research 09 §3.1)
  const myDone = combat && (cc ? phase === PHASE.COMBAT && (meP?.status === 'done' || localDone) : meP?.status === 'done');
  // the solo pause button: only while the own battle still runs (the server refuses it afterwards)
  const canPause = pauseAvailable(pub, { solo, alive, done: meP?.status === 'done' || localDone });
  live.current.canPause = canPause;
  // client-side combat: observing a teammate's battle (research 09 §3.1) and the 联防 / 最终攻势 camera halves
  // (an eliminated player auto-observes a teammate's normal field — research 09 "keep-watching" — without asking)
  const watchedFid = watchingOther ? watching : (cc && combat && !alive && battleState && battleState.watch && battleState.kind === 'normal' ? battleState.fieldId : null);
  // the ‹ › pill: on the 联防 / 最终攻势 field on screen — also one watched with 前往查看 (a leaker, an eliminated spectator)
  const layers = cc && combat && field && field.local && (!watchingOther || field.fieldId === watching) ? cameraLayers(field, pub, myId) : [];
  const progress = cc && phase === PHASE.COMBAT ? teammateProgress(pub, myId) : null;
  // the bond strip follows the player on screen (DESIGN §20.15, ui/watchBonds.js): a teammate's board / battle (前往查看,
  // an eliminated player's auto-observed field) → their bonds; a 联防 / 最终攻势 field → the player on the ‹ › half (全景:
  // yours when you fight there, else the teammate picked with 前往查看 / the field's first player); in battle with the
  // live layers of the battle on screen (the runner's bondLayers)
  const settleMode = mode === 'settle';
  const strip = screenStrip({
    pub, priv, myId, combat, settle: settleMode, watchingOther, watching, home,
    battleFieldId: cc ? (battleState?.fieldId || null) : (combat || settleMode ? lastFieldRef.current : null),
    field, layers, layer, who: watchWho, bondLayers: battleState?.bondLayers || null,
  });
  const stripFid = strip.fieldId;
  const liveLayers = (combat || settleMode) && battleState?.bondLayers ? battleState.bondLayers : null;
  // the observing pill names the player whose bonds the strip shows (the same teammate as the strip's "👁 name" tag)
  const observingName = cc && combat && watchedFid ? (!strip.self && stripFid === watchedFid ? strip.name : (players.find((p) => p.fieldId === watchedFid || ownFieldId(p.playerId) === watchedFid)?.name || t('队友'))) : null;
  const watchedP = watchingOther ? (players.find((p) => p.playerId !== myId && (watching === ownFieldId(p.playerId) || (watching === p.fieldId && String(watching).startsWith('n:')))) || null) : null;
  const watchedName = watchingOther ? (watchedP?.name || players.find((p) => watching === p.fieldId)?.name || t('队友')) : null;
  const stripBonds = strip.bonds;
  // a popup opened from the strip closes when the strip changes hands (another teammate scouted / a ‹ › half / back to
  // the own bonds); one opened from a card's chip keeps its unit owner (it carries its own player either way)
  const stripOwnerRef = useRef(strip.ownerId);
  useEffect(() => {
    if (stripOwnerRef.current === strip.ownerId) return;
    stripOwnerRef.current = strip.ownerId;
    setBondOpen((b) => (b && b.from === 'strip' ? null : b));
  }, [strip.ownerId]);
  // the popup shows the player it was opened for (ui/watchBonds.js popupView): their entry + live layers, their name,
  // and as members your pieces or their operators on the field on screen — under client-side combat the battle's own
  // (the runner's field meta is taken before they deploy); a battle sends no bench (a prep scout does: ownerBoard)
  const popOps = cc && battleRunner && field?.local && bondOpen && bondOpen.ownerId !== myId ? battleRunner.ownerOps(bondOpen.ownerId, field.fieldId) : null;
  const bondPop = popupView({ open: bondOpen, pub, priv, myId, field, units: popOps, live: liveLayers });
  const openBond = (id, ownerId, from) => { setBondOpen((b) => toggleBond(b, id, ownerId, from)); audio.sfx('click', { volume: 0.4 }); };
  // local patch (maintainer 2026-10-06): a press outside the bond popup closes it (the strip's discs, its < > and the card's
  // bond cells keep their own toggles)
  useEffect(() => {
    if (!bondOpen) return undefined;
    const onDown = (e) => {
      // (a press in the card a member row or a chip opened keeps it: the member's card goes with its popup)
      if (e.target?.closest?.('.bpop, .bpop-nav, .bslot, [data-bond], .modal, .dpanel')) return;
      setBondOpen(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [!!bondOpen]);
  // a card a window opened (the drawer's rows, a bond popup's members) has no close button (GitHub #3, maintainer
  // decision 2026-10-14): a press anywhere but on the card or a row that opens another one closes it, and it goes with
  // its window (gameLogic/shortcuts.js closesOnOutsidePress / windowCardGone)
  const windowCard = openedFromWindow(detail) ? detail.from : null;
  useEffect(() => {
    if (!windowCard) return undefined;
    const onDown = (e) => setDetail((d) => (closesOnOutsidePress(d, e.target) ? null : d));
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [windowCard]);
  useEffect(() => {
    setDetail((d) => (windowCardGone(d, { drawer, bond: bondOpen }) ? null : d));
  }, [!!drawer, !!bondOpen, windowCard]);
  const watchingNow = combat ? (watching || field?.fieldId || home) : watching;
  const shopOpen = showShop && !collapsed;
  const ufShown = !!(selEntry && editable && !facing && !drag && showPrep && ufGeo);
  // the temp overflow row holds pieces (user playtest #3 item 3): framed and labelled on the own prep board
  const temp = tempInfo(priv);
  const tempNotice = temp.count > 0 && !!view && viewKind !== 'loading' && showPrep && alive && !pen && !sp;
  // the ready button shows why it is refused under it (ui/hud.js ReadyToggle): the effects column moves down a line
  const readyWhy = phase === PHASE.PREP && alive && !priv?.ready && (hasPersonalChoice || temp.count > 0);
  // the official bottom band (panel_bottom_tips): ready / overflow / full hand in the prep, the own battle over in a battle
  const tipType = spectator || !battleArt('waiting').cls ? null : bottomTipType({
    prep: phase === PHASE.PREP, watching: watchingOther, ready: !!priv?.ready, overflow: temp.count > 0, full: !!priv && handFull(priv),
    ownDone: !!myDone && (phase === PHASE.COMBAT || phase === PHASE.UNITE), alive,
  });
  // the frame the panels are laid out in: the HUD layer (client px; inside the safe-area insets of a notched phone),
  // and the root font size (1rem)
  const panelFrame = () => {
    let rem = 100;
    try { rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 100; } catch { /* default */ }
    let b = null;
    try { b = hudElRef.current?.getBoundingClientRect() || null; } catch { b = null; }
    const vp = b && b.width > 0 && b.height > 0 ? { left: b.left, top: b.top, width: b.width, height: b.height }
      : { left: 0, top: 0, width: globalThis.innerWidth || 1920, height: globalThis.innerHeight || 1080 };
    return { rem, vp };
  };
  const dSide = (() => {
    if (ufShown) {
      const { rem, vp } = panelFrame();
      return panelSide(underframeRect(ufGeo, rem), panelSlots(vp, rem, { shopOpen }));
    }
    if (mergeGeo && resolved) {
      const { rem, vp } = panelFrame();
      const half = (mergeGeo.s > 0 ? mergeGeo.s : 64) * 1.05; // the tile diamond's box (underframeRect's)
      return panelSide({ left: mergeGeo.x - half, right: mergeGeo.x + half, top: mergeGeo.y - half, bottom: mergeGeo.y + half }, panelSlots(vp, rem, { shopOpen }));
    }
    return 'left';
  })();
  // the bond popup: next to the card, never over the selected unit's underframe when a place is free (bondPopupPlace)
  const bpPlace = (() => {
    if (!bondOpen) return 'left';
    const { rem, vp } = panelFrame();
    return bondPopupPlace(ufShown ? underframeRect(ufGeo, rem) : null, vp, rem, resolved ? dSide : null);
  })();
  // the player's own operators (and the shop / bond member cards) show the loadout's skill / module (DESIGN §16);
  // a teammate's unit (前往查看 in prep, 联防 / 最终攻势 fields, an observed battle) shows ITS owner's choice, carried by
  // the unit (UnitInfo skillIndex / moduleId: the sim's, or Match.prepFieldMeta's) — never the viewer's loadout
  const detailLoadout = (() => {
    if (!resolved || resolved.type !== 'chess') return null;
    if (detailTarget?.kind === 'unit') {
      const u = detailTarget.unit;
      const owner = u?.ownerId;
      if (resolved.piece || (owner != null && owner === myId)) return priv?.loadout ?? null;
      return unitLoadout(resolved.chess, u);
    }
    return priv?.loadout ?? null; // own pieces, shop / reward / bond-member cards
  })();
  // the open detail card's unit draws its attack range on the field (screens/game/range.js inspectRange, GitHub PR #281):
  // an own board piece in prep (its loadout / stand-in record, its facing); in battle or on a scouted board an ally
  // operator / summon on the field — the range it fights with now (the live stats' `range` and `dir`, the snapshot's
  // tile) — never an enemy, a dead unit or a bench unit (UnitInfo `area` hand / temp); drag, the wheel and the pen
  // draw their own
  const cardRange = !drag && !facing && !pen ? inspectRange({
    target: detailTarget, detail: resolved, pieces: placeCtx.pieces, showPrep, field,
    snapshot: snapUnitsRef.current.get(resolved?.unitId),
    live: typeof liveStats === 'function' ? liveStats() : liveStats,
    loadout: detailLoadout, getChess: gd.chess, backups: gd.backups,
  }) : null;
  const cardRangeKey = cardRange ? JSON.stringify(cardRange) : '';
  useEffect(() => {
    if (!view) return undefined;
    showRange(view, cardRange?.grid, cardRange?.row, cardRange?.col, cardRange?.dir, SEL_RANGE);
    return () => showRange(view, null, 0, 0, null, SEL_RANGE);
  }, [view, cardRangeKey, showPrep, field]);
  // the card's bond chips — and the popup a chip opens: a battle / scouted unit's OWNER's bonds (yours, or that
  // teammate's — m.public + live layers), your own piece's yours, a popup member card the popup's player; shop / reward
  // cards read the strip's (ui/watchBonds.js detailBondOwner)
  const detailOwner = detailBondOwner(detailTarget, { pub, myId, stripOwnerId: strip.ownerId });
  const detailBonds = detailOwner === strip.ownerId ? stripBonds : playerBonds({ pub, priv, myId, ownerId: detailOwner, live: liveLayers });
  // bonds this mode never activates (标准: 10 of 23, 奥术 among them) — shown 本局禁用 on cards, chips and the popup
  const offBonds = modeOffBonds(getMode(pub?.modeId));
  const loadArt = loadingArt(getMode(pub?.modeId)); // the battle loading screen's picture, code and mode name
  // the boss round's opening (ui/battleArt.js BossPrepare): the leader's portrait, and in co-op the players alive with their LP
  const bossNow = bossOpen || isBossPhase(phase);
  const bossKey = bossOpen === 'hidden' || phase === PHASE.HIDDEN_CORE ? pub?.hiddenBossId || pub?.bossId : pub?.bossId;
  const bossRec = bossNow && bossKey ? data.lookup('bosses', bossKey) : null;
  const bossPortrait = bossRec ? enemyIconUrl(data.get('assets'), bossRec.enemyKey) : null;
  const bossTeam = bossNow ? players.filter((p) => p.alive !== false && p.status !== 'left').map((p) => ({
    id: p.playerId, avatar: html`<${PlayerAvatar} player=${p} size="sm" self=${p.playerId === myId} />`, lp: p.lp, mine: p.playerId === myId })) : [];

  const hudLook = hudArt(); // local patch
  return html`<div class=${cx('screen', 'gm', `gm--${mode}`, drag && 'is-dragging', collapsed && 'is-collapsed', (sp || hasPersonalChoice) && 'has-sp', pen && 'is-pen', readyWhy && 'has-readywhy', hudLook.cls)}
      style=${hudLook.style} data-camera=${pen ? 'pen' : camKind}>
    <div class="gm__field" ref=${hostRef} onContextMenu=${(e) => e.preventDefault()}></div>
    ${fieldLoading ? html`<div class="gm__loading"><${Spinner} label="LOADING FIELD" /></div>` : null}
    <div class="gm__vignette" aria-hidden="true"></div>
    ${tempNotice ? html`<${TempRowNotice} view=${view} count=${temp.count} items=${temp.items} label=${!drag && !facing}
      ready=${phase === PHASE.PREP && !!priv?.ready} />` : null}
    ${showPrep && view && viewKind !== 'loading' && priv && !pen ? html`<${StandInTags} view=${view} priv=${priv} getChess=${gd.chess} backups=${gd.backups} />` : null}

    ${/* the player list and its emote bubbles: a layer of their own under the HUD panels, lifted above the 机变 / 悬赏
        screen while it is open (css/phase-art.css .gm__side) */ ''}
    <div class="gm__side">
      <${TeamPanel} pub=${pub} myId=${myId} watching=${watchingNow} bubbles=${bubbles} onWatch=${watchPlayer} cap=${lpCap} uniteLocal=${uniteLocal}
        self=${Number.isFinite(priv?.lp) ? { lp: priv.lp, pending: liveLpNow.pending, unite: liveLpNow.unite, left: liveLpNow.left } : null}
        observe=${cc ? { canObserve: (p) => observeTarget(p, pub, myId, { observing: watchingOther }), observing: watchingOther, onBack: backHome } : null}
        after=${html`<${RoundDamage} pub=${pub} priv=${priv} myId=${myId} place="phone" spectator=${spectator} />`} />
    </div>

    <div class="gm__hud" ref=${hudElRef}>
      <${TopBar} pub=${pub} priv=${priv} conn=${conn} hud=${hud} total=${total} drawer=${drawer}
        onExit=${() => setExitOpen(true)} onDrawer=${(t) => setDrawer((d) => (d ? null : t))} onReady=${toggleReady}
        readyBusy=${readyBusy} readyCount=${readyCount} playerCount=${solo ? 1 : aliveCount}
        pen=${pen} penAvail=${penAvail} onPen=${togglePen} config=${gd.config} frozenAt=${frozenAt} onTimerWarn=${timerCue}
        pause=${canPause || paused ? { show: canPause, paused, busy: pauseBusy, onToggle: () => togglePause(!paused) } : null}
        live=${liveLpNow} spectator=${spectator} />

      <div class="gm__bonds">
        <button type="button" class="bonds-toggle" aria-expanded=${!bondsCollapsed} aria-controls="match-bond-strip"
          aria-label=${bondsCollapsed ? t('展开盟约') : t('收起盟约')} title=${bondsCollapsed ? t('展开盟约') : t('收起盟约')}
          onKeyDown=${(e) => {
            // Keep native Space activation here without also firing the global ready / pause shortcut.
            if (e.key === ' ') e.stopPropagation();
          }}
          onClick=${() => {
            if (!bondsCollapsed && bondOpen?.from === 'strip') setBondOpen(null);
            setBondsCollapsed(!bondsCollapsed);
          }}><${Icon} name=${bondsCollapsed ? 'chevronRight' : 'chevronLeft'} /><span>${bondsCollapsed ? t('盟约') : t('收起')}</span></button>
        <div id="match-bond-strip" class="gm__bond-list" hidden=${bondsCollapsed}>
          <${BondStrip} bonds=${stripBonds} layersDisabled=${layersDisabled} openId=${bondPop && bondPop.ownerId === strip.ownerId ? bondPop.bondId : null}
            owner=${strip.name} onOpen=${(id) => openBond(id, strip.ownerId, 'strip')} />
          ${layersDisabled && hudLook.cls ? html`<span class="bpause" role="status">${t('暂停叠层')}</span>` : null}
        </div>
      </div>

      <div class="gm__effects"><${EffectsList} effects=${watchingOther && field ? (field.effects ?? null) : priv?.effects} />
        <${RoundDamage} pub=${pub} priv=${priv} myId=${myId} place="desktop" spectator=${spectator} /></div>
      ${priv?.debug && !spectator ? html`<${DebugPanel} debug=${priv.debug} prep=${phase === PHASE.PREP} diy=${priv.diy} />` : null /* local patch: local debug mode */}

      ${watchingOther && !combat ? html`<div class="gm__watching" role="status">
        <${GIcon} name="eye" /><span>${tParts('正在查看 {name} 的阵地（只读）', { name: html`<b>${watchedName}</b>` })}</span>
        ${spectator ? null : html`<${Button} size="sm" variant="primary" icon="back" onClick=${() => watchPlayer({ playerId: myId })}>${t('返回自己')}<//>`}
      </div>` : null}

      ${showShop ? html`<${ShopBar} priv=${priv} editable=${editable} collapsed=${collapsed} onCollapse=${setCollapsed}
        barRef=${barRef} offBonds=${offBonds}
        onBuy=${buy} onLevel=${() => actions.levelUp()} onRefresh=${() => actions.refresh()} onFreeze=${() => actions.freeze()}
        onDetail=${(id, kind, hint) => setDetail({ kind: kind === 'item' ? 'item' : 'chess', id, hint: hint || null })}
        onDetailClose=${() => setDetail((d) => (d?.kind === 'chess' || d?.kind === 'item' ? null : d))}
        onRefuse=${(reason) => { matchToast(reason, 'warn'); audio.sfx('error', { volume: 0.5 }); }}
        reward=${phase === PHASE.PREP && !rewardMin ? priv?.shop?.rewardOffer || null : null}
        onReward=${pickReward} onRewardLater=${() => setRewardMin(true)} onArm=${setArmedCard} />` : null}

      ${phase === PHASE.PREP && priv?.shop?.rewardOffer ? html`<${RewardOverlay} priv=${priv} minimized=${rewardMin || collapsed}
        onMinimize=${(m) => { setRewardMin(m); if (!m) setCollapsed(false); }} />` : null}

      ${combat || mode === 'settle' ? html`<${CombatHud} pub=${pub} myId=${myId} watching=${watchingNow} hud=${hud} myDone=${!!myDone && alive} waitBand=${tipType === 'WAIT_FINISH'}
        spectating=${!alive} spectator=${spectator} onWatch=${watchField}
        client=${cc ? { progress, observing: observingName ? { name: observingName } : null, layers, layer, onLayer: setLayer,
          own: watchingOther && alive ? ownProgress(pub, myId, { localDone }) : null } : null} />` : null}

      ${showDeadPill(alive, phase) ? (spectator
        ? html`<div class="gm__dead gm__dead--spectator" role="status"><${GIcon} name="eye" />${t('观战中 · 点击左侧成员头像切换查看')}</div>`
        : html`<div class="gm__dead" role="status"><${Icon} name="close" />${t('你已被淘汰 · 可继续观战队友')}</div>`) : null}

      <${Ticker} />
      <${TileToast} tip=${tileTip} />


      ${drawer ? html`<${EnemyDrawer} tab=${drawer} onTab=${setDrawer} pub=${pub} priv=${priv} onClose=${() => setDrawer(null)}
        bandId=${scoutBandId} bandOwner=${scoutBandOwner}
        onEnemy=${(k, n) => setDetail({ kind: 'enemy', id: k, count: n, from: 'drawer' })} onChess=${(id) => setDetail({ kind: 'chess', id, foreign: true, from: 'drawer' })} />` : null}

      ${bondPop ? html`<${BondPopup} bondId=${bondPop.bondId} entry=${bondPop.entry} priv=${bondPop.priv} banned=${pub?.bannedChess || []} owner=${bondPop.name}
        off=${offBonds.has(bondPop.bondId)}
        place=${bpPlace} over=${!!resolved && bpPlace === dSide}
        onClose=${() => setBondOpen(null)} onMember=${(id, items, standInFor, diy) => setDetail({ kind: 'chess', id, owner: bondPop.ownerId, items: items || null, standInFor: standInFor || null, diy: diy || null, from: 'bond' })} />` : null}
      ${bondPop && hudLook.cls && bondPop.ownerId === strip.ownerId ? html`<${BondNav} bonds=${stripBonds} id=${bondPop.bondId} onOpen=${(id) => openBond(id, strip.ownerId, 'strip')} />` : null /* local patch: the popup's < > (ui/hudArt.js) */}

      ${resolved ? html`<${DetailPanel} detail=${resolved} snapHp=${snapHp}
        bonds=${detailBonds} offBonds=${offBonds} loadout=${detailLoadout} ops=${priv?.ops ?? null} side=${dSide} shopOpen=${shopOpen} live=${liveStats}
        onBond=${(id) => openBond(id, detailOwner, 'detail')} />` : null}
      ${!resolved && hudLook.cls && (drag || facing) && placingDetail(drag || facing, placeCtx.pieces, { priv, backups: gd.backups }) ? html`<div class="dart-placing">
        <${DetailPanel} detail=${placingDetail(drag || facing, placeCtx.pieces, { priv, backups: gd.backups })} bonds=${detailBonds} offBonds=${offBonds} loadout=${detailLoadout} ops=${priv?.ops ?? null} /></div>` : null /* local patch: the card while placing (ui/detailArt.js) */}

      ${selEntry && editable && !facing && !drag && showPrep ? html`<${Underframe} key=${sel.uid} view=${view} uid=${sel.uid}
        row=${pieceTile(selEntry)?.row} col=${pieceTile(selEntry)?.col} actions=${underframeActions(placeCtx, sel.uid)} busy=${selBusy}
        name=${(selEntry.piece.kind === 'item' ? gd.item(selEntry.piece.id) : selEntry.piece.kind === 'token' ? gd.token(selEntry.piece.id) : ownShown(selEntry.piece.id))?.name || ''}
        onRetreat=${retreatSel} onSell=${sellSel} onDestroy=${sellSel} />` : null}
    </div>

    ${sp ? html`<${ChoiceOverlay} pub=${pub} sp=${sp} myId=${myId} solo=${solo} busyIdx=${spBusy} total=${total}
      onPick=${async (i) => { setSpBusy(i); await actions.choice(i); setSpBusy(null); }} />` : null}
    ${personalChoice ? html`<${ChoiceOverlay} key=${personalChoice.id} pub=${pub} sp=${personalChoice} myId=${myId} solo=${solo} personal=${true}
      busyIdx=${personalBusy?.choiceId === personalChoice.id ? personalBusy.idx : null} total=${total}
      onPick=${async (i) => {
        const choiceId = personalChoice.id;
        setPersonalBusy({ choiceId, idx: i });
        await actions.choice(i, choiceId);
        setPersonalBusy((b) => b?.choiceId === choiceId ? null : b);
      }} />` : null}

    <div class=${sp || personalChoice ? 'gm__corner is-over-choice' : 'gm__corner'}>${/* local patch (maintainer report): out of .gm__hud, above the 机变 / 悬赏 screen (css/phase-art.css) */ ''}
      ${spectator ? null : html`<${EmoteWheel} open=${emoteOpen} onToggle=${setEmoteOpen} onSend=${(id, set) => actions.emote(id, set)} disabled=${conn.status !== 'online'} />`}
      ${solo ? null : html`<${GameChat} open=${chatOpen} onToggle=${(v) => { setChatOpen(v); if (v) setEmoteOpen(false); }} disabled=${conn.status !== 'online'} />`}
      ${/* phones (css/devices.css): ⚙ / 📖 / ⛶ fold behind one ⋯ button so the corner stops covering the bottom row of
          the 机变 cards and the bench (maintainer request 2026-10-12); elsewhere the ⋯ button is hidden and the three show */ ''}
      <button type="button" class=${toolsOpen ? 'gm__gear gm__more is-open' : 'gm__gear gm__more'} aria-expanded=${String(toolsOpen)}
        aria-label=${toolsOpen ? t('收起') : t('更多')} title=${toolsOpen ? t('收起') : t('更多')} onClick=${() => setToolsOpen((v) => !v)}><${Icon} name=${toolsOpen ? 'close' : 'dots'} /></button>
      <span class=${toolsOpen ? 'gm__tools is-open' : 'gm__tools'}>
        <button type="button" class="gm__gear" aria-label=${t('设置')} title=${t('设置')} onClick=${() => { setToolsOpen(false); setSettingsOpen(true); }}><${GIcon} name="gear" /></button>
        <button type="button" class="gm__gear gm__guide" aria-label=${t('玩法说明')} title=${t('玩法说明')} onClick=${() => { setToolsOpen(false); openGuide(0); }}><${Icon} name="book" /></button>
        <${FullscreenButton} class="gm__gear gm__fs" />
      </span>
    </div>

    ${loadArt ? html`<${LoadingScreen} show=${phase === PHASE.BATTLE_CHECK || (fieldLoading && phase !== PHASE.RESULT)} art=${loadArt} tips=${gd.config?.tips} />` : null}
    <${BottomTips} type=${tipType} shopOpen=${shopOpen} />
    <${WaitingDialog} phase=${phase} deadline=${pub?.deadline} paused=${paused} now=${serverNow} />
    ${opening ? html`<${GameStartBanner} onDone=${() => { setOpening(false); audio.sfx('roundStart'); }} />` : null}
    ${bossOpen && !opening ? html`<${BossPrepare} key=${`boss:${pub?.round}`} kind=${bossOpen} portrait=${bossPortrait} team=${bossTeam}
      onDone=${() => { setBossOpen(null); audio.sfx('roundStart'); }} />` : null}
    ${opening || bossOpen ? null : banner?.result ? html`<${BattleEndBanner} key=${banner.key} perfect=${banner.result.perfect} lost=${banner.result.lost} onDone=${() => setBanner(null)} />`
      : banner && String(banner.key).startsWith(`${PHASE.ROUND_START}:`) && phaseArt('round').cls
        ? html`<${RoundStartBanner} key=${banner.key} round=${pub?.round} gold=${roundGold} watching=${spectator || !alive}
            remain=${roundsToBoss(pub?.round, pub?.bossRound ?? getMode(pub?.modeId)?.bossRound, gd.config?.constants?.bossTrailerStartRound ?? 3)} onDone=${() => setBanner(null)} />` /* local patch: ui/phaseArt.js */
      : banner && String(banner.key).startsWith(`${PHASE.UNITE}:`) && battleArt('help').cls
        ? html`<${HelpBattleBanner} key=${banner.key} onDone=${() => setBanner(null)} />`
        : banner && !(String(banner.key).startsWith(`${PHASE.SP_DRAFT}:`) && phaseArt('choose').cls) ? html`<${PhaseBanner} key=${banner.key} mode="overlay" title=${banner.title} sub=${banner.sub} micro=${banner.micro}
      tone=${banner.tone} duration=${banner.duration || 1500} onDone=${() => setBanner(null)} />` : null}

    ${resultBox ? html`<${ResultDialog} key=${resultBox.key} title=${resultBox.title} sub=${resultBox.sub} micro=${resultBox.micro}
      tone=${resultBox.tone} duration=${resultBox.duration} onDone=${() => setResultBox(null)} />` : null}

    ${facing && view ? html`<${FacingWheel} key=${`${facing.uid}:${facing.row},${facing.col}`} view=${view} row=${facing.row} col=${facing.col}
      grid=${facing.grid} name=${facing.name} onPreview=${previewFacing} onCommit=${commitFacing} onCancel=${cancelFacing} />` : null}

    ${goldAsk ? html`<${ReadyTipDialog} key=${goldAsk.text} text=${goldAsk.text} check=${goldAsk.check} onAnswer=${(ok, noMore) => {
      if (ok && noMore) goldTipOff.current = true;
      setGoldAsk(null);
      goldAsk.resolve(ok);
    }} />` : null}
    ${outDialog ? html`<${SelfDead} onWatch=${() => setOutDialog(false)} onExit=${() => { setOutDialog(false); setExitOpen(true); }} />` : null}
    ${resumeAsk && !serverLostBox ? html`<${OnlyConfirmDialog} text=${t('存在进行中的模拟，是否继续？')} onOk=${answerResume} />` : null}
    ${serverLostBox ? html`<${OnlyConfirmDialog} key=${serverLostBox.text} text=${serverLostBox.text} onOk=${() => store.patch('ui', { serverLost: null })} />` : null}
    ${paused && !resumeAsk ? html`<${PausedOverlay} canResume=${solo} busy=${pauseBusy} onResume=${() => togglePause(false)} onExit=${() => setExitOpen(true)} />` : null}

    ${view ? html`<${EquipHoverPanel} view=${view} state=${eqHover} />` : null}

    ${replace ? html`<${EquipReplaceDialog} request=${replace.request} getItem=${gd.item}
      onConfirm=${(uid) => closeReplace(uid)} onCancel=${() => closeReplace(null)} />` : null}

    <${SettingsModal} open=${settingsOpen} onClose=${() => setSettingsOpen(false)} />
    <${ExitModal} open=${exitOpen} onClose=${() => setExitOpen(false)} solo=${solo} />
  </div>`;
}
