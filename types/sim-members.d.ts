// What tsc cannot see in the sim's classes; the match classes are in class-members.d.ts. Type-only: nothing imports
// this file at run time.
//
// The split class: Battle keeps its constructor and fields in server/sim/Battle.js and gets its methods at load time
// from the part classes under server/sim/battle/ (Battle.js copies their prototype members onto the class, in a fixed
// order). tsc cannot see that copy, so this file merges the parts into the class type. The other direction (`this`
// inside a part is the whole class) is the `@this {Battle}` tag on each part method: a part cannot extend the class
// here as well, the two bases would reference each other. Keep the list the same as Battle.js's install loop.

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

declare module '../server/sim/Battle.js' {
  interface Battle extends BattlePlayers, BattleLifecycle, BattleHooks, BattleSpawns, BattleDeploy, BattleBlocking,
    BattleStatus, BattleCombat, BattleQueries, BattleSummons, BattleTiles, BattleDisplacement, BattleEconomy,
    BattleEvents {
    /** the spec's battle id, set by spec.js createBattleFromSpec (null without one) */
    battleId?: string | null;
    // made on first use by a part (`??= new Set()`), absent until then
    /** units an enemy may target although they are allies (battle/queries.js setAllyTarget) */
    _allyTargets?: Set<Unit>;
    /** tiles (row * COLS + col) a raised obstacle made high ground (battle/summons.js) */
    _elevated?: Set<number>;
    /** route indices the wave has spawned on so far (battle/tiles.js groundPathTiles) */
    _pathRoutesUsed?: Set<number>;
    /** the last fear application's number (fear.js stampFear) */
    _fearSeq?: number;
  }
}

// Unit fields the constructor does not assign with `this.x =`: the heavy references it makes non-enumerable with
// Object.defineProperty, and the fields a battle part or a kit sets on one kind of unit only (an enemy as it spawns,
// a board piece as it is placed, a summoned obstacle).
declare module '../server/sim/units.js' {
  interface Unit {
    // Object.defineProperty in the constructor
    player: any;
    route: any;
    carry: any;
    // the skill's animation and state windows (skills.js), the birth clip (battle/lifecycle.js, skills.js)
    skillAnimUntil?: number;
    skillStateUntil?: number;
    bornUntil?: number;
    // a 【移动】 that only lands where the unit flew itself (battle/tiles.js moveRedeploy `inPlace`): no deploy animation
    quietDeployAt?: number | null;
    // range: the grid relative to the unit and the absolute tile keys (row * COLS + col) it covers
    // (battle/queries.js, skills.js)
    rangeGrid?: ReadonlyArray<ReadonlyArray<number>>;
    rangeKeys?: number[];
    baseRangeKeys?: number[];
    // the same keys as a set (battle/queries.js, the summons and walkers that set their own range), read by range tests
    rangeKeySet?: Set<number>;
    // battle/queries.js _refreshRange: the extends the range was built with, the content's extra keys (setExtraRange,
    // `extraRangeShown`: they join the card's grid) and the grid of the 攻击范围 the detail card shows
    _rangeExtend?: number;
    _baseExtend?: number;
    extraRangeKeys?: number[] | null;
    extraRangeShown?: boolean;
    liveRangeGrid?: ReadonlyArray<ReadonlyArray<number>>;
    // its profession's install ran (battle/players.js _setupUnit: once per unit)
    _profInstalled?: boolean;
    // the natural HP regeneration not healed yet (battle/status.js _tickUnitBuffs)
    _regenAcc?: number;
    // set while its removal bookkeeping runs (battle/deploy.js _remove): no redeploy from a skill's onEnd meanwhile
    _removing?: boolean;
    // a board piece (battle/players.js)
    items?: any[];
    reserve?: boolean;
    handSlot?: number | null;
    deferDeploy?: boolean;
    ground?: boolean;
    removeReason?: string;
    // an enemy (battle/spawns.js and the enemy kits)
    tag?: string | null;
    counted?: boolean;
    blockWeight?: number;
    hitArea?: any;
    colR?: number;
    lpr?: any;
    mods?: any;
    bounty?: any;
    sourcePlayerId?: string | null;
    spawnX?: number;
    spawnY?: number;
    pauseUntil?: number;
    atkStandUntil?: number;
    atkStandCutAt?: number;
    unbalanceUntil?: number;
    uniteRuntime?: boolean;
    // an enemy whose skill casts spend bullets (content/local-patch.js): its bullets, sent as its SP bar (snapshot.js)
    lpAmmo?: { left: number, max: number };
    // a summon that walks and holds no tile (content/bonds/walker.js; battle/deploy.js, battle/blocking.js)
    walks?: boolean;
    // a summoned obstacle (battle/summons.js)
    obstacle?: boolean;
    obstacleKind?: 'block' | 'crate';
    blockRadiusSq?: number;
  }
}

// SkillRuntime sets `battle` and `unit` with Object.defineProperty (non-enumerable); tsc only sees plain `this.x =`
// assignments.
declare module '../server/sim/skills.js' {
  interface SkillRuntime {
    battle: Battle;
    unit: Unit;
  }
}
