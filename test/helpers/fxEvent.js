// test/helpers/fxEvent.js — a sim 'fx' event tuple made by the sim's own Battle.fx (server/sim/battle/events.js), for
// tests that feed the client an event by hand: x / y go to the tuple's 3rd / 4th slots and never into the extra, as in a
// real battle. Hand tuples with x / y in the extra hid a handler that read them there (规程 萨尔贡 6's 流沙, 2026-11-14);
// test/render/fx-event-shape.test.js refuses them.
import { BattleEvents } from '../../server/sim/battle/events.js';

/**
 * @param {string} kind
 * @param {Record<string, any>} [params] Battle.fx params: x, y and the extra's keys
 * @returns {any[]} ['fx', kind, x, y, extra]
 */
export function fxEvent(kind, params = {}) {
  const out = [];
  BattleEvents.prototype.fx.call({ _castAbility: null, _ev: (t) => out.push(t) }, kind, params);
  return out[0];
}
