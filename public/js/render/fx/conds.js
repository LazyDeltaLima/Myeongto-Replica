// public/js/render/fx/conds.js — the binding rows behind a condition the renderer can judge (묶음 K3, docs/rules/fx.md
// 「바인딩 표」 「조건 뒤 행」). tools/build-fx-plays.mjs keeps a cited key's rows whose conditions are not all re-entry
// guards as its `when` rows ({ role, n, b?, if: [condition] }); a plan or a status spec gives the state it knows, and a row
// plays when each of its conditions holds in it. A condition the state cannot tell (an unknown blackboard value, a dice
// roll, a damage filter …) keeps its row off — unless the state says the event stands for every condition (`all`).

/**
 * The conditions a renderer can judge from a state (also test/helpers/fxBindings.js's 'cond' reason): the deployed
 * direction, the skill, the mode, a buff's stack count, the buffs held, the direction a buff was given.
 */
export const JUDGED = /^!?(SwitchDirection|CheckCharacterDefaultDirection|CheckSkillIndex|CheckUnitCurrentMode|FilterByBuffStackCount|CheckContainsBuff|CheckContainsDerviedBuff)\b/;

/**
 * State:
 *   back    the operator was deployed facing UP (CheckCharacterDefaultDirection(UP); another direction is not told)
 *   dir     the direction its buff was given (SwitchDirection)
 *   skill   the skill index 0–2 (CheckSkillIndex) [추정: the client's index from 0]
 *   mode    the unit's charpack mode index (CheckUnitCurrentMode)
 *   stacks  { buff key: stack count } (FilterByBuffStackCount on that buff; a row creating that buff holds while it has a stack)
 *   bb      { blackboard key: value } (a FilterByBuffStackCount bound `@key`)
 *   buffs   the buffs held, besides the ones the key's rows create (CheckContainsBuff / CheckContainsDerviedBuff: a buff
 *           not named is not held — the state names every one the rows ask for)
 *   all     the event stands for every condition of the key's rows (the sim decided them)
 * @typedef {{ back?: boolean, dir?: string, skill?: number, mode?: number, stacks?: Record<string, number>,
 *   bb?: Record<string, number>, buffs?: string[], all?: boolean }} FxState
 */

/**
 * Whether condition `c` holds in `s` (with `held` the buffs held now), or null when the state cannot tell. `m` overrides
 * the stack counts (held rows: some count up to the current one).
 * @param {string} c
 * @param {FxState} s
 * @param {Set<string>} held
 * @param {Record<string, number>} [m]
 * @returns {boolean | null}
 */
export function judge(c, s, held, m = s.stacks || {}) {
  if (s.all) return true;
  if (c.startsWith('!')) {
    const v = judge(c.slice(1), s, held, m);
    return v == null ? null : !v;
  }
  const x = /^(\w+)\((.*)\)$/.exec(c);
  if (!x) return null;
  const [, t, arg] = x;
  switch (t) {
    case 'CheckCharacterDefaultDirection': return arg === 'UP' && s.back != null ? !!s.back : null;
    case 'SwitchDirection': return s.dir ? s.dir === arg : null;
    case 'CheckSkillIndex': return Number.isInteger(s.skill) ? s.skill === Number(arg) : null;
    case 'CheckUnitCurrentMode': return Number.isInteger(s.mode) && /^\d+$/.test(arg) ? s.mode === Number(arg) : null;
    case 'FilterByBuffStackCount': {
      const [op, v, key] = arg.split(' ');
      const n = key != null ? m[key] : undefined;
      const bound = v.startsWith('@') ? s.bb?.[v.slice(1)] : Number(v);
      if (n == null || bound == null || !Number.isFinite(Number(bound))) return null;
      return op === 'GE' ? n >= bound : op === 'EQUALS' ? n === bound : null;
    }
    case 'CheckContainsBuff': case 'CheckContainsDerviedBuff': {
      if (!s.buffs) return null;
      const and = arg.includes('&');
      const keys = arg.split(and ? '&' : '|');
      return and ? keys.every((k) => held.has(k)) : keys.some((k) => held.has(k));
    }
    default: return null;
  }
}

/** The stack keys a row's FilterByBuffStackCount conditions count. */
const stackKeys = (r) => r.if.map((c) => /FilterByBuffStackCount\(\w+ \S+ (.+)\)$/.exec(c)?.[1]).filter(Boolean);

/**
 * The `when` rows of a key's plays (`k`, from plays.json) that hold in `s`: [{ role, n }]. A held row (a buff kept once it
 * is created) holds if its conditions held at some stack count up to the current one; the buffs the held rows create count
 * as held for the others (the client's triggers run again: mlynar_tr's [b] once [a] is there).
 * @param {{ when?: { role: string, n: string, b?: string, if: string[] }[] } | null | undefined} k
 * @param {FxState | null | undefined} s
 * @returns {{ role: string, n: string }[]}
 */
export function whenPlays(k, s) {
  const rows = k?.when;
  if (!rows?.length || !s) return [];
  const held = new Set(s.buffs || []);
  const on = new Set();
  const counted = s.stacks || {};
  const holds = (r) => {
    // the counted buff itself: there while it has a stack (the conditions of its creation are what made the stack)
    if (r.b != null && counted[r.b] != null) return counted[r.b] >= 1;
    const keys = stackKeys(r);
    if (r.role !== 'held' || !keys.length) return r.if.every((c) => judge(c, s, held) === true);
    // some count 1..n of its counted buff (one buff per row)
    const key = keys[0], n = counted[key];
    if (n == null || keys.some((x) => x !== key)) return r.if.every((c) => judge(c, s, held) === true);
    for (let i = 1; i <= Math.min(n, 999); i++) if (r.if.every((c) => judge(c, s, held, { ...counted, [key]: i }) === true)) return true;
    return false;
  };
  for (let round = 0; round < 4; round++) {
    const before = on.size;
    for (const r of rows) {
      if (on.has(r) || !holds(r)) continue;
      on.add(r);
      if (r.role === 'held' && r.b) held.add(r.b);
    }
    if (on.size === before) break;
  }
  return rows.filter((r) => on.has(r)).map((r) => ({ role: r.role, n: r.n }));
}
