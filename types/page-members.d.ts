// What tsc cannot see in the page's classes (the browser config; the server's are in class-members.d.ts and
// sim-members.d.ts). Type-only: nothing imports this file at run time.
//
// The split class: FxSystem keeps its constructor and pools in public/js/render/fx/system.js and gets its effect
// methods at load time from the part classes beside it (system.js copies their prototype members onto the class, in
// FX_METHOD_ORDER). tsc cannot see that copy, so this file merges the parts into the class type; the other direction
// (`this` inside a part is the whole system) is the `@this {FxSystem}` tag on each part member. Keep the list the same
// as system.js's FX_PARTS.

import type { FxParticles } from '../public/js/render/fx/particles.js';
import type { FxProjectiles } from '../public/js/render/fx/projectiles.js';
import type { FxBeams } from '../public/js/render/fx/beams.js';
import type { FxLocks } from '../public/js/render/fx/locks.js';
import type { FxNumbers } from '../public/js/render/fx/numbers.js';
import type { FxRings } from '../public/js/render/fx/rings.js';
import type { FxArrivals } from '../public/js/render/fx/arrivals.js';
import type { FxSim } from '../public/js/render/fx/simfx.js';
import type { FxZones } from '../public/js/render/fx/zones.js';
import type { StatusFrom } from '../public/js/render/units.js';

declare module '../public/js/render/fx/system.js' {
  interface FxSystem extends FxParticles, FxProjectiles, FxBeams, FxLocks, FxNumbers, FxRings, FxArrivals, FxSim,
    FxZones {}
}

// Fields another file sets on a class (render/app.js keeps its per-view and per-board state on them).
declare module '../public/js/render/board3d/scene.js' {
  interface BoardScene {
    /** set while the board's shaders and textures warm for a stage; not drawn until it is cleared (app.js warm3d) */
    warming?: boolean;
  }
}

declare module '../public/js/render/units.js' {
  /** What render/app.js keeps on each view of its `views` map (a unit, a hand item or a device alike). */
  interface AppViewFields {
    /** the piece's look the view was built for: a new one rebuilds it (app.js setPrep, syncChests, syncMates) */
    _sig?: string;
    /** a prep piece's tile or slot (app.js setPrep) */
    _home?: { x: number, y: number, z: number };
    /** the walk of a prep piece to its tile (app.js) */
    _tween?: { fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, t: number } | null;
    /** a bench piece's view of a scouted board (app.js) */
    _bench?: boolean;
    /** the view was seen in a snapshot (app.js: fades in once) */
    _seen?: boolean;
    /** when the battle view was built (performance clock; app.js: one never seen goes after 8 s) */
    _born?: number;
    /** its unit is in no snapshot or info the view knows (app.js unknownUnit: rebuilt from its info) */
    _unknown?: boolean;
    /** the down list it was last on (app.js syncBattle) */
    _downSeq?: number;
    /** its swing turned it already (app.js faceEvent): the strike's 'atk' does not turn it again */
    _swingTurn?: boolean;
    /** the game time of the attack that last turned it (app.js faceEvent) */
    _atkTurnAt?: number;
    /** a 'skill' event that came while it was not up yet, played at its deploy (app.js handleEvent) */
    _skillAtDeploy?: unknown[] | null;
    /** the update time it took since the last census (app.js census) */
    _perfMs?: number;
    /** a board piece shows its facing wedge (app.js; bench pieces leave it unset) */
    _showFacing?: boolean;
  }
  interface UnitView extends AppViewFields {
    /** status key → its source (onStatus; made on the first one) */
    statusFrom?: Map<string, StatusFrom>;
    /** the status effects fxgame.js statusOn started on it, by key */
    _fxStatusOn?: Set<string>;
    /** false while the effect layer is off: the status icons stand in (fxstatus.js, each frame) */
    _statusIcons?: boolean;
  }
  // app.js tells the views of its map apart by their members (`typeof v.setDir === 'function'`, `v.onSwing?.()`,
  // `if (!v.face) return`): the UnitView members a hand item or a device lacks are declared absent on it, so such a test
  // narrows the map's `UnitView | ItemView | DeviceView` to the class that has the member. tsc reports no clash when
  // the class has a listed member (its own member wins, checked): take a member out of the list when the class gains it.
  /** UnitView members the class lacks, each as `?: undefined`. */
  type Lacks<K extends PropertyKey> = { [P in K]?: undefined };
  interface ItemView extends AppViewFields, Lacks<'setDir' | 'onDeploy' | 'setSkill' | 'setCount' | 'setItems' | 'setEquip'
    | 'clearHome' | 'setOverlap' | 'markHome' | 'hover' | 'setTokenMode' | 'windUp' | 'face' | 'faceDeploy' | 'dir'
    | 'turnTo' | 'turnToward' | 'onSwing' | 'onAttack' | 'die' | 'dying' | 'dieDur' | 'onStatus' | 'onStatusHit'
    | 'onStatusCount' | 'slideTo' | 'onEnemySkill' | 'onEnemySkillEnd' | 'onSignal' | 'glide' | 'setForm' | 'fadeIn'
    | 'setDown' | 'down' | 'actor' | 'spineReady' | 'culled' | 'isBoss' | 'imp' | '_spineBusy'> {
    /** the status effects fxgame.js statusOn started on it, by key (the elite glow of a hand item) */
    _fxStatusOn?: Set<string>;
  }
  interface DeviceView extends AppViewFields, Lacks<'shadow' | 'setDir' | 'lift' | 'dimmed' | 'setIcon' | 'setCount'
    | 'setItems' | 'setEquip' | 'clearHome' | 'setOverlap' | 'markHome' | 'hover' | 'setTokenMode' | 'face'
    | 'faceDeploy' | 'dir' | 'turnTo' | 'turnToward' | 'onSwing' | 'dieDur' | 'onStatusHit' | 'onStatusCount'
    | 'slideTo' | 'onEnemySkill' | 'onEnemySkillEnd' | 'onSignal' | 'glide' | 'setForm' | 'fadeIn' | 'setDown' | 'down'
    | 'root' | 'actor' | 'spineReady' | 'culled' | 'isBoss' | 'imp' | '_spineBusy' | 'retryAssets'> {
    /** the status effects fxgame.js statusOn started on it, by key */
    _fxStatusOn?: Set<string>;
  }
  interface UnitView extends Lacks<'setIcon'> {}
}

declare module '../public/js/render/fxplayer.js' {
  interface FxInstance {
    /** the instances it started from an `OnEmitPlay` / sub-prefab, stopped and moved with it (made on the first one) */
    kids?: FxInstance[];
    /** buff key → its progress 0–1 or null (setBuffProgress; made on the first one) */
    buffProg?: Map<string, number | null>;
    /** its depth along the camera, set by FlightBatch.sync before it sorts the copies it merges */
    flightDepth?: number;
  }
}

declare module '../public/js/audio.js' {
  interface AudioManager {
    // set by voice.js on the page's one manager
    /** the dubbed voice table of the chosen language (voice.js voiceTableOf) */
    voiceTable?: () => ReturnType<typeof import('../public/js/voice.js').voiceTableOf>;
    /** the chosen voice language ('off' | 'jp' | …) */
    voiceLang?: () => string;
    /** the official battle voice rules (voicePolicy.js createVoicePolicy) */
    voicePolicy?: ReturnType<typeof import('../public/js/voicePolicy.js').createVoicePolicy>;
    // made on first use (`||= new Map()` …), absent until then
    /** chess id → when its prep deploy sound last played */
    _prepDeployAt?: Map<unknown, number>;
    /** the opening voice's pending timers */
    _openingTimers?: Set<ReturnType<typeof setTimeout>>;
    /** field → a running acid rain's loop { by, held, until } */
    _acidRains?: Map<string, { by: unknown, held: Array<() => void>, until: number }>;
    /** unit id → the cancels of its shells' fall sounds still due */
    _shellFalls?: Map<unknown, Array<() => void>>;
    /** unit id → its pending charge sounds */
    _mcnistCharge?: Map<unknown, unknown>;
  }
}
