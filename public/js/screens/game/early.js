// public/js/screens/game/early.js — which events are replayed when a field is entered late.

import { fxForm } from '../../../../shared/protocol.js';

export const STATE_EV = new Set(['spawn', 'die', 'deploy', 'status', 'skill']);

/** Event tuples replayed when a field is entered late: the state-bearing kinds and the fx that change an enemy's model
 *  form (shared/protocol.js fxForm — the field meta's UnitInfo `form` predates them), and (maintainer re-report 2026-10-08
 *) 望's 'wangLink' too — a stone's 激活 shows for as long as it stands (render/fxgame.js STONE_ON), and
 *  the stones placed linked in the prep activate in the battle's first ticks, before the view enters the field. */
export const keepEarly = (e) => Array.isArray(e) && (STATE_EV.has(e[0]) || fxForm(e) !== undefined || (e[0] === 'fx' && e[1] === 'wangLink'));
