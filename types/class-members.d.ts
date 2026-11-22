// What tsc cannot see in our classes. Type-only: nothing imports this file at run time.
//
// The split classes: Match, PlayerState and Battle keep their constructor and fields in one file and get their methods
// at load time from the part classes under server/match/match/, server/match/player/ and server/sim/battle/ (each file
// copies its parts' prototype members onto the class, in a fixed order). tsc cannot see that copy, so this file merges
// the parts into the class type. The other direction (`this` inside a part is the whole class) is the `@this` tag on
// each part method: a part cannot extend the class here as well, the two bases would reference each other.
// Keep each list the same as the class file's install loop.

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

import type { BattlePlayers } from '../server/sim/battle/players.js';
import type { BattleLifecycle } from '../server/sim/battle/lifecycle.js';
import type { BattleHooks } from '../server/sim/battle/hooks.js';
import type { BattleSpawns } from '../server/sim/battle/spawns.js';
import type { BattleDeploy } from '../server/sim/battle/deploy.js';
import type { BattleBlocking } from '../server/sim/battle/blocking.js';
import type { BattleStatus } from '../server/sim/battle/status.js';
import type { BattleCombat } from '../server/sim/battle/combat.js';
import type { BattleQueries } from '../server/sim/battle/queries.js';
import type { BattleSummons } from '../server/sim/battle/summons.js';
import type { BattleTiles } from '../server/sim/battle/tiles.js';
import type { BattleDisplacement } from '../server/sim/battle/displacement.js';
import type { BattleEconomy } from '../server/sim/battle/economy.js';
import type { BattleEvents } from '../server/sim/battle/events.js';

import type { Battle } from '../server/sim/Battle.js';
import type { Unit } from '../server/sim/units.js';

declare module '../server/match/Match.js' {
  interface Match extends MatchPlatform, MatchInfra, MatchMessaging, MatchViews, MatchWatch, MatchIntents, MatchPause,
    MatchPhases, MatchDiyChoose, MatchSpDraft, MatchPrep, MatchCombat, MatchClientCombat, MatchReports, MatchUnite,
    MatchBoss, MatchSettle, MatchRestart, MatchSurrender, MatchBandSkill {}
}

declare module '../server/match/PlayerState.js' {
  interface PlayerState extends PlayerBasics, PlayerPieces, PlayerAcquire, PlayerEconomy, PlayerPlacement, PlayerItems,
    PlayerPrep, PlayerRound, PlayerViews, PlayerDiy {}
}

declare module '../server/sim/Battle.js' {
  interface Battle extends BattlePlayers, BattleLifecycle, BattleHooks, BattleSpawns, BattleDeploy, BattleBlocking,
    BattleStatus, BattleCombat, BattleQueries, BattleSummons, BattleTiles, BattleDisplacement, BattleEconomy,
    BattleEvents {}
}

// SkillRuntime sets `battle` and `unit` with Object.defineProperty (non-enumerable); tsc only sees plain `this.x =`
// assignments.
declare module '../server/sim/skills.js' {
  interface SkillRuntime {
    battle: Battle;
    unit: Unit;
  }
}
