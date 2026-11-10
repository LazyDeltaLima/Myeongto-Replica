// server/sim/content/coverage.js — how much of a season's bond, equipment and 特质 data the content code acts on.
//
// coverage(data, prep) → { bonds, items, garrisons, totals }: one row per (bond, buff template), per (item key,
// buff key) and per (特质 event type, effect key), each `ok` / `partial` (`missing` names what is not done) / `none`.
// It asks "is the buff key the handler expects in the record", not "is there a handler for the id": a season that
// reuses an id with other buffs shows up (`wrong` lists the handler keys that run on a record without their buff).
// Battle side: the tables the handler files export; prep side: the season's registry (server/match/effectsMeta.js
// registryFor(data) — passed in, the sim does not import the match). Used by tools/season-coverage.mjs and
// test/content/coverage.test.js. Node only (it reads handler sources to find the buff keys item handlers ask for).
//
//   bonds      a buff's template is its bbStr.key, else its key; sub-keys (`…[enemy]`, `…[share]`, `…[tile_listener]`)
//              belong to their parent template, `…_power` is a template of its own. BOND_TEMPLATES below lists what
//              the bond files (bonds/dispatch.js) and the match engine handle, for which bonds
//   items      battle runes (env_gbuff_new*, char_dynamic_ability_new) by bbStr.key: items/battle.js stat buffs,
//              behaviour buffs, the hammers, or the item-keyed behaviour that asks for that key; the other buffs (prep)
//              by key: a built-in buff-key handler (server/match/builtinMeta.js) or the item's registered content
//              handler that asks for that key (items/meta.js buffP)
//   garrisons  IN_BATTLE: garrisons/battle.js BATTLE_GARRISON_KEYS, and the option values it reads (GARRISON_OPTIONS);
//              SERVER_*: a `garrison:<effectKey>` handler in the registry and a hook for the event type

import { buffsOf, itemKeyOf } from './support/index.js';
import { HANDLED as ITEM_BATTLE } from './items/battle.js';
import { BATTLE_GARRISON_KEYS, GARRISON_OPTIONS } from './garrisons/battle.js';
import { bondTemplate } from './bonds/shared.js';
import { handledTemplates } from './bonds/dispatch.js';

export { bondTemplate };

/**
 * Bond buff templates the code handles: template → { bonds (null: any bond), side, where, partial?, registry?, src? },
 * from the TEMPLATES of the bond files (bonds/dispatch.js handledTemplates) and the match engine's rules. `partial` lists what of the template is
 * not written yet; `registry: false`: a prep rule of the match engine, not a registered handler.
 */
export const BOND_TEMPLATES = Object.freeze({
  ...handledTemplates(),
  // the match engine — prep (投资人's ×2 / ×3 获得时 in the dispatcher, 调和's +1 core count in bondsMeta.js)
  bond_layer_char_garrison_bonus: { bonds: ['investShip'], side: 'prep', where: '../../match/effectsMeta.js', src: 'investShip', registry: false },
  other_bond_add_trigger_cnt: { bonds: ['maniShip'], side: 'prep', where: '../../match/bondsMeta.js', src: 'maniShip', registry: false },
});

const RUNE_KEYS = new Set(['env_gbuff_new', 'env_gbuff_new_with_verify', 'char_dynamic_ability_new']);

/** The buff-key literals `fn`'s source asks a record for through `call` (items: `bp(rec, …)`, prep: `buffP(ctx, x, …)`). */
function askedKeys(fn, call, constants = {}) {
  const src = typeof fn === 'function' ? Function.prototype.toString.call(fn) : '';
  const re = call === 'bp' ? /\bbp\(\s*rec\s*,\s*(?:'([^']+)'|([A-Z_][A-Z0-9_]*))\s*\)/g : /\bbuffP\(\s*ctx\s*,[^,()]*(?:\([^()]*\))?[^,()]*,\s*'([^']+)'\s*\)/g;
  const out = new Set();
  for (const m of src.matchAll(re)) {
    const k = m[1] ?? constants[m[2]];
    if (k) out.add(k);
  }
  return out;
}

/** The buff keys a registered prep handler asks its item record for (every hook's source). */
function prepAsked(handler) {
  const out = new Set();
  if (!handler || typeof handler !== 'object') return out;
  for (const fn of Object.values(handler)) for (const k of askedKeys(fn, 'buffP')) out.add(k);
  return out;
}

function row(domain, fields) {
  return { domain, missing: [], wrong: [], ...fields };
}

function bondRows(data, { registry }) {
  const rows = [];
  for (const [bondId, rec] of Object.entries(data?.bonds ?? {})) {
    const seen = new Map();
    for (const b of Array.isArray(rec?.buffs) ? rec.buffs : []) {
      const t = bondTemplate(b);
      if (!t || seen.has(t)) continue;
      const decl = BOND_TEMPLATES[t];
      const mine = decl && (!decl.bonds || decl.bonds.includes(bondId)) ? decl : null;
      const r = row('bonds', { id: bondId, key: t, side: mine?.side ?? (RUNE_KEYS.has(b.key) ? 'battle' : 'prep'), where: mine?.where ?? null, status: 'none' });
      if (mine) {
        r.status = mine.partial?.length ? 'partial' : 'ok';
        if (mine.partial) r.missing.push(...mine.partial);
        if (mine.side === 'prep' && mine.registry !== false && registry && !registry.get(`bond:${bondId}`)) {
          r.status = 'none';
          r.missing.push(`no bond:${bondId} handler in the registry`);
        }
      } else if (decl) r.missing.push(`the template is handled for ${decl.bonds.join(', ')} only`);
      seen.set(t, r);
      rows.push(r);
    }
  }
  return rows;
}

function itemRows(data, { registry, builtinItemBuffKeys }) {
  const rows = [];
  const items = data?.items ?? {};
  const builtin = new Set(builtinItemBuffKeys ?? []);
  /** item key → { ids, battle: Map(bbKey → true), prep: Set(key) } */
  const byKey = new Map();
  for (const [id, rec] of Object.entries(items)) {
    if (!rec) continue;
    const key = itemKeyOf(id, data);
    let e = byKey.get(key);
    if (!e) { e = { ids: [], battle: new Set(), prep: new Set() }; byKey.set(key, e); }
    e.ids.push(id);
    for (const b of buffsOf(rec)) {
      if (RUNE_KEYS.has(b.key)) { if (b.bbKey) e.battle.add(b.bbKey); } else if (b.key) e.prep.add(b.key);
    }
  }
  for (const [key, e] of byKey) {
    const byItem = ITEM_BATTLE.byItem[key];
    const battleAsked = byItem ? askedKeys(byItem, 'bp', ITEM_BATTLE.constants) : new Set();
    const hammer = ITEM_BATTLE.hammerOf(key, data);
    const handler = registry ? registry.get(`item:${key}`) : null;
    const prepAsk = prepAsked(handler);
    const wrongBattle = byItem && battleAsked.size && ![...battleAsked].some((k) => e.battle.has(k))
      ? [`items/battle.js ${key} asks for ${[...battleAsked].join(', ')}`] : [];
    const wrongPrep = prepAsk.size && ![...prepAsk].some((k) => e.prep.has(k))
      ? [`item:${key} asks for ${[...prepAsk].join(', ')}`] : [];
    const ids = e.ids.slice().sort();
    for (const bb of [...e.battle].sort()) {
      // an item-keyed behaviour that asks for no buff (双模机械臂: an empty blackboard) is the item's own: it handles what
      // the buff tables do not
      const ok = ITEM_BATTLE.statBuffs.has(bb) || ITEM_BATTLE.byBuff.includes(bb) || battleAsked.has(bb) || hammer?.bbKey === bb
        || (!!byItem && !battleAsked.size);
      rows.push(row('items', { id: key, key: bb, side: 'battle', ids, status: ok ? 'ok' : 'none', wrong: wrongBattle }));
    }
    for (const k of [...e.prep].sort()) {
      const ok = (builtin.has(k) && !!handler) || prepAsk.has(k);
      rows.push(row('items', { id: key, key: k, side: 'prep', ids, status: ok ? 'ok' : 'none', wrong: wrongPrep }));
    }
  }
  return rows;
}

function garrisonRows(data, { registry, garrisonHooks }) {
  const rows = new Map();
  const battleKeys = new Set([...BATTLE_GARRISON_KEYS, 'NONE']);
  const hooks = garrisonHooks ?? {};
  for (const [gid, g] of Object.entries(data?.garrisons ?? {})) {
    if (!g || !g.effectKey) continue;
    const inBattle = g.eventType === 'IN_BATTLE';
    const rk = `${g.eventType}|${g.effectKey}`;
    let r = rows.get(rk);
    if (!r) {
      let status, missing = [];
      if (inBattle) status = battleKeys.has(g.effectKey) ? 'ok' : 'none';
      else if (!hooks[g.eventType]) { status = 'none'; missing = [`no hook for ${g.eventType}`]; } else status = registry?.get(`garrison:${g.effectKey}`) ? 'ok' : 'none';
      r = row('garrisons', { id: g.effectKey, key: g.eventType, side: inBattle ? 'battle' : 'prep', ids: [], status, missing });
      rows.set(rk, r);
    }
    r.ids.push(gid);
    if (!inBattle || r.status === 'none') continue;
    const s = g.bbStr ?? {};
    for (const opt of ['bond_type', 'bond_add_type', 'conditionkey', 'range_id']) {
      const v = s[opt];
      if (v == null || v === '') continue;
      const known = opt === 'range_id' ? GARRISON_OPTIONS.range_id[g.effectKey] ?? [] : GARRISON_OPTIONS[opt];
      if (known.includes(v)) continue;
      const m = `${opt}=${v}`;
      const at = r.missing.find((x) => x.startsWith(`${m} `));
      if (at) r.missing[r.missing.indexOf(at)] = `${at.slice(0, -1)}, ${gid})`;
      else r.missing.push(`${m} (${gid})`);
      r.status = 'partial';
    }
  }
  return [...rows.values()];
}

function tally(rows) {
  const t = { ok: 0, partial: 0, none: 0, wrong: 0 };
  for (const r of rows) { t[r.status]++; if (r.wrong.length) t.wrong++; }
  return t;
}

/**
 * The coverage of a season's data. The prep side comes from the match (passed in: the sim does not import it):
 * `registry` the season's prep registry (effectsMeta.js registryFor(data)), `builtinItemBuffKeys` the buff keys the
 * built-in item handlers act on (builtinMeta.js BUILTIN_ITEM_BUFF_KEYS), `garrisonHooks` the 特质 event types with a
 * hook (effectsMeta.js GARRISON_HOOK) — tools/season-coverage.mjs coverageOf passes all three. Without them the prep
 * side reads as not handled.
 * @param {object} data a season's data (gamedata getData / shared/seasons.js)
 * @param {{ registry?: { get(key: string): object | null } | null, builtinItemBuffKeys?: readonly string[], garrisonHooks?: Record<string, string> }} [prep]
 */
export function coverage(data, prep = {}) {
  const p = { registry: prep.registry ?? null, builtinItemBuffKeys: prep.builtinItemBuffKeys ?? [], garrisonHooks: prep.garrisonHooks ?? {} };
  const bonds = bondRows(data, p);
  const items = itemRows(data, p);
  const garrisons = garrisonRows(data, p);
  return { bonds, items, garrisons, totals: { bonds: tally(bonds), items: tally(items), garrisons: tally(garrisons) } };
}

