// What tsc cannot see in the match classes (the sim's Battle is in sim-members.d.ts, so that the sim can be checked
// without server/match/). Type-only: nothing imports this file at run time.
//
// The split classes: Match and PlayerState keep their constructor and fields in one file and get their methods at
// load time from the part classes under server/match/match/ and server/match/player/ (each file copies its parts'
// prototype members onto the class, in a fixed order). tsc cannot see that copy, so this file merges the parts
// into the class type. The other direction (`this` inside a part is the whole class) is the `@this` tag on each part
// method: a part cannot extend the class here as well, the two bases would reference each other. Keep each list the
// same as the class file's install loop.

import type { MatchPlatform } from '../server/match/match/platform.js';
import type { MatchInfra } from '../server/match/match/infra.js';
import type { MatchMessaging } from '../server/match/match/messaging.js';
import type { MatchViews } from '../server/match/match/views.js';
import type { MatchWatch } from '../server/match/match/watch.js';
import type { MatchIntents } from '../server/match/match/intents.js';
import type { MatchPause } from '../server/match/match/pause.js';
import type { MatchPhases } from '../server/match/match/phases.js';
import type { MatchDiyChoose } from '../server/match/match/diyChoose.js';
import type { MatchSpDraft } from '../server/match/match/spDraft.js';
import type { MatchPrep } from '../server/match/match/prep.js';
import type { MatchCombat } from '../server/match/match/combat.js';
import type { MatchClientCombat } from '../server/match/match/clientCombat.js';
import type { MatchReports } from '../server/match/match/reports.js';
import type { MatchUnite } from '../server/match/match/unitePhase.js';
import type { MatchBoss } from '../server/match/match/bossRounds.js';
import type { MatchSettle } from '../server/match/match/settle.js';
import type { MatchRestart } from '../server/match/match/restart.js';
import type { MatchSurrender } from '../server/match/match/surrender.js';
import type { MatchBandSkill } from '../server/match/match/bandSkill.js';

import type { PlayerBasics } from '../server/match/player/basics.js';
import type { PlayerPieces } from '../server/match/player/pieces.js';
import type { PlayerAcquire } from '../server/match/player/acquire.js';
import type { PlayerEconomy } from '../server/match/player/economy.js';
import type { PlayerPlacement } from '../server/match/player/placement.js';
import type { PlayerItems } from '../server/match/player/items.js';
import type { PlayerPrep } from '../server/match/player/prep.js';
import type { PlayerRound } from '../server/match/player/round.js';
import type { PlayerViews } from '../server/match/player/views.js';
import type { PlayerDiy } from '../server/match/player/diy.js';

declare module '../server/match/Match.js' {
  interface Match extends MatchPlatform, MatchInfra, MatchMessaging, MatchViews, MatchWatch, MatchIntents, MatchPause,
    MatchPhases, MatchDiyChoose, MatchSpDraft, MatchPrep, MatchCombat, MatchClientCombat, MatchReports, MatchUnite,
    MatchBoss, MatchSettle, MatchRestart, MatchSurrender, MatchBandSkill {
    // made on first use by a part, absent until then
    /** playerId → the m.public player row's entries at the last broadcast (match/messaging.js) */
    _pubRowsSent?: Map<string, any>;
    // the AI teammates' reactions (server/match/botEmotes.js): the round whose settle they reacted to, merges per seat
    _botEmotesSettledRound?: number;
    _botEmotesMerges?: Map<string, number>;
    // the console mode of a solo room (server/local-patch.js, server/local-console.js)
    console?: boolean;
    consoleLog?: Array<Record<string, any>>;
    _consoleEnding?: boolean;
    _consoleRevived?: boolean;
    // the console's view (server/local-console.js consoleView, made on first use), its last notice, a retry's cleared flag
    debugCandidates?: ReturnType<typeof import('../server/local-console.js').debugCandidates>;
    debugBountyBosses?: string[];
    debugActiveBands?: boolean;
    consoleNote?: { seq: number, kind: string, round: number } | null;
    consoleCleared?: boolean;
  }
}

declare module '../server/match/PlayerState.js' {
  interface PlayerState extends PlayerBasics, PlayerPieces, PlayerAcquire, PlayerEconomy, PlayerPlacement, PlayerItems,
    PlayerPrep, PlayerRound, PlayerViews, PlayerDiy {
    // 规程's 确定自选编队 (match/diyChoose.js initDiyLineups, from the Match constructor): the picks this match may field,
    // the ones chosen, and the seat's 准备就绪
    diyLineup?: Record<string, any> | null;
    diyChosen?: string[];
    diyChooseReady?: boolean;
    /** a merge held back while an effect hands out several items (effectsMeta.js) */
    _deferItemMerge?: number;
    // server/local-patch.js: the last offer's number, the round's gold gains for the round-start view
    offerSeq?: number;
    _roundGold?: { round: number, gain: number, on: boolean };
    /** console mode: the seat quit with the console's 「끝내기」 (server/local-console.js) */
    _consoleQuit?: boolean;
    // server/local-console.js: the funds pin (con.funds; undefined = the env default) and the real funds under it, the
    // 指令 without limits (con.bandUnlimited), the layers before the first con.setLayers, a preset board's AI seat
    debugFundsPin?: number | null;
    _funds?: number;
    consoleBandUnlimited?: boolean;
    consoleLayersBase?: Record<string, number> | null;
    debugLocked?: boolean;
    /** never set: a SpectatorSeat's flag, read wherever a viewer may be either (match/platform.js handle) */
    spectator?: undefined;
    /** the JSON of the last m.private sent (match/messaging.js _sendPrivate) */
    _lastPriv?: string | null;
    /** the JSON of the last prep scout's m.field of this board (match/watch.js _notifyPrepScouts) */
    _prepScoutSig?: string;
    /** the last m.roundDmg sent, again on a resync (match/settle.js _sendRoundDamage, platform.js) */
    roundDmg?: { t: 'm.roundDmg', round: number, units: ReturnType<typeof import('../shared/roundDamage.js').foldRoundDamage> };
  }
}

declare module '../server/match/effectsMeta.js' {
  interface EffectDispatcher {
    /** a preview's isolated dispatcher (dispatch with `ev.preview`): its own rng, effect data and players */
    preview?: import('../server/match/preview.js').PreviewState;
  }
}

// Fields the lobby's classes get from other files than their own.
declare module '../server/lobby.js' {
  interface Lobby {
    /** the deploy's restart countdown (server/local-restart.js; set by server/index.js) */
    restartNotice?: import('../server/local-restart.js').RestartNotice;
    /** the deploy's generation (server/local-generation.js; set by server/index.js) */
    generation?: import('../server/local-generation.js').Generation;
    // server/local-patch.js feedbackOf / moderationOf: made on first use (or put there by a test)
    feedback?: import('../server/local-feedback.js').FeedbackInbox;
    moderation?: import('../server/local-moderation.js').Moderation;
  }
  interface Room {
    /** the console mode of a solo room (room.setConsole, server/local-patch.js) */
    console?: boolean;
  }
}

declare module '../server/net.js' {
  interface Session {
    // lobby-owned (server/lobby.js): the 공개방 list subscription, the 名片干员 of the seat card
    watchRooms?: boolean;
    card?: string | null;
    // the chat moderation's (server/local-moderation.js Moderation.identify / chatMute): the browser id bound at hello,
    // its issue time, what the last [id] line logged, the ban whose follow-up was last logged
    browserId?: string;
    bidIssuedAt?: number;
    loggedName?: string;
    loggedKey?: string | null;
    netSharedLogged?: string;
    netMuteLogged?: string;
    /** the last room.chat / room.chatFaction (server/local-patch.js, the chat cooldown) */
    lastChatAt?: number;
  }
}
