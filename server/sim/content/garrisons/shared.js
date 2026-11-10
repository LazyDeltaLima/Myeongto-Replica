// server/sim/content/garrisons/shared.js — what garrisons/battle.js and the IN_BATTLE 特质 families of
// garrisons/effects/*.js share. Imports neither, so the tables garrisons/battle.js assembles are whole whichever file
// loads first.

export const ids = (s) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
export const EMPTY = Object.freeze([]);

/** The instances of a list grouped by the unit that carries them. */
export const byUnit = (list) => {
  const m = new Map();
  for (const it of list) {
    let a = m.get(it.unit);
    if (!a) { a = []; m.set(it.unit, a); }
    a.push(it);
  }
  return m;
};
