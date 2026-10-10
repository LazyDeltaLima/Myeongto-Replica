// public/js/render/fx/speeds.js — sim projectile speeds (one module-level table) and the flight-time lookup.

import { PROJ } from '../style.js';

/**
 * The sim's projectile speeds (server/sim/constants.js PROJECTILE_SPEEDS — pure data, served read-only at
 * /sim/constants.js with the rest of the client-side sim, DESIGN §14): a shot's visual flight ends when the sim lands it,
 * i.e. with its damage number. Loaded once in a browser (the game already has the module from its battle runner);
 * until it arrives — and in Node, where '/sim/' is no module path — style.js PROJ speeds (a copy the unit tests keep
 * equal to the sim's) stand in.
 */
let simSpeeds = null;

/**
 * Use the sim's speeds (tiles per game second): `table` = PROJECTILE_SPEEDS by kind, `boomerangReturn` =
 * BOOMERANG_RETURN_SPEED (the sim's visual kind of a boomerang flying back); null = style.js PROJ only.
 */
export function setSimProjectileSpeeds(table, boomerangReturn = null) {
  if (!table || typeof table !== 'object') { simSpeeds = null; return; }
  simSpeeds = Object.assign({}, table);
  if (Number(boomerangReturn) > 0) simSpeeds.boomerangReturn = Number(boomerangReturn);
}

if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
  import('/sim/constants.js').then((m) => { if (m?.PROJECTILE_SPEEDS) setSimProjectileSpeeds(m.PROJECTILE_SPEEDS, m.BOOMERANG_RETURN_SPEED); }, () => {});
}

/**
 * Tiles per game second of a projectile kind ('boomerangReturn': a boomerang's way back): the sim's value, else
 * style.js PROJ (`speed`; the boomerang's `back`), else 15 for a boomerang (the sim's outbound speed) / 12.
 */
export function projSpeed(kind) {
  const v = simSpeeds ? Number(simSpeeds[kind]) : NaN;
  if (v > 0) return v;
  if (kind === 'boomerangReturn') return PROJ.boomerang?.back > 0 ? PROJ.boomerang.back : projSpeed('boomerang');
  const f = PROJ[kind]?.speed;
  return f > 0 ? f : kind === 'boomerang' ? 15 : 12;
}

/**
 * 2026-10-10: an enemy's normal-attack shot record — data/enemies.json `proj` ({ key, mount, move, speed, … },
 * the client's projectile prefab), `projModes[<mode>]` for a later mode (its name = the sim form, matched without case).
 * `null` = a ranged attack with no projectile (instant hit), undefined = not read (the old orb).
 * @param {any} def data/enemies.json record
 * @param {string|null} [form] the unit's current form (UnitInfo `form`)
 */
export function enemyShot(def, form = null) {
  if (!def || typeof def !== 'object') return undefined;
  const pm = def.projModes;
  if (form != null && pm && typeof pm === 'object') {
    const f = String(form).toLowerCase();
    const k = Object.keys(pm).find((x) => x.toLowerCase() === f);
    if (k && pm[k] && typeof pm[k] === 'object') return pm[k];
  }
  return def.proj;
}

/**
 * 2026-10-10: the speed of an enemy's shot (tiles per game second; a PARACURVE's over the horizontal distance)
 * the sim flies it at — enemyShot's `speed` — or null (none read, a link / instant one: the sim's PROJECTILE_SPEEDS.enemy).
 * @param {any} def data/enemies.json record
 * @param {string|null} [form]
 * @returns {number|null}
 */
export function enemyProjSpeed(def, form = null) {
  const p = enemyShot(def, form);
  const v = p && typeof p === 'object' ? Number(p.speed) : NaN;
  return v > 0 ? v : null;
}
