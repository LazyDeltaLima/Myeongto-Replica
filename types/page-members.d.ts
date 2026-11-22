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
  interface UnitView {
    /** a bench piece's view of a scouted board (app.js) */
    _bench?: boolean;
    /** the view was seen in a snapshot (app.js: fades in once) */
    _seen?: boolean;
    /** the walk of a prep piece to its tile (app.js) */
    _tween?: { fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, t: number } | null;
    /** a board piece shows its facing wedge (app.js; bench pieces leave it unset) */
    _showFacing?: boolean;
    /** status key → its source (onStatus; made on the first one) */
    statusFrom?: Map<string, any>;
    /** the status effects fxgame.js statusOn started on it, by key */
    _fxStatusOn?: Set<string>;
    /** false while the effect layer is off: the status icons stand in (fxstatus.js, each frame) */
    _statusIcons?: any;
  }
}

declare module '../public/js/render/fxplayer.js' {
  interface FxInstance {
    /** the instances it started from an `OnEmitPlay` / sub-prefab, stopped and moved with it (made on the first one) */
    kids?: FxInstance[];
    /** buff key → its progress 0–1 or null (setBuffProgress; made on the first one) */
    buffProg?: Map<string, number | null>;
  }
}

declare module '../public/js/audio.js' {
  interface AudioManager {
    // set by voice.js on the page's one manager
    /** the dubbed voice table of the chosen language (voice.js voiceTableOf) */
    voiceTable?: () => any;
    /** the chosen voice language ('off' | 'jp' | …) */
    voiceLang?: () => string;
    /** the official battle voice rules (voicePolicy.js createVoicePolicy) */
    voicePolicy?: ReturnType<typeof import('../public/js/voicePolicy.js').createVoicePolicy>;
    // made on first use (`||= new Map()` …), absent until then
    /** chess id → when its prep deploy sound last played */
    _prepDeployAt?: Map<any, number>;
    /** the opening voice's pending timers */
    _openingTimers?: Set<any>;
    /** field → a running acid rain's loop { by, held, until } */
    _acidRains?: Map<any, { by: any, held: any, until: number }>;
    /** unit id → the cancels of its shells' fall sounds still due */
    _shellFalls?: Map<any, Array<() => void>>;
    /** unit id → its pending charge sounds */
    _mcnistCharge?: Map<any, any>;
  }
}
