// 선발 오퍼레이터 (甄选 / DIY picks, local NAS patch, docs/LOCAL-PATCH.md) — shared by the server and the browser.
//
// data/diy.json (tools/build-diy.mjs) holds the chess records of the candidates (chess_diy_<key>_<tier>_a/_b, flagged
// isDiy + diyPick + visible: false) and their tokens. It is merged into the chess / tokens tables at load time
// (server/data.js loadData, public/js/data.js), so every lookup by chess id works and data/chess.json stays the
// official build.
//
// A player picks them in the 干员调配 loadout (DESIGN §16): a loadout entry of a candidate's tier-V or tier-VI normal
// chess id carrying `diy: 1|2` (the slot) means "in my 甄选 slot"; at most DIY_SLOTS per tier, one operator once.

/** 甄选 slots per tier (act2autochess diyChessDict: two at tier V, two at tier VI). */
export const DIY_SLOTS = 2;
export const DIY_TIERS = Object.freeze([5, 6]);

/** Whether a chess record is a 甄选 pick (normal or elite). */
export const isDiyPick = (c) => !!(c && c.diyPick);

/**
 * Merge data/diy.json into a loaded data object (server: every data file by basename).
 * @param {Record<string, any>} out mutable data object (`chess`, `tokens`, `diy`)
 */
export function mergeDiyData(out) {
  const d = out && out.diy;
  if (!d || typeof d !== 'object') return out;
  if (d.chess && out.chess && typeof out.chess === 'object') out.chess = { ...out.chess, ...d.chess };
  if (d.tokens && out.tokens && typeof out.tokens === 'object') out.tokens = { ...out.tokens, ...d.tokens };
  return out;
}

/**
 * Browser data store: the chess / tokens file with the diy records merged in (other files unchanged).
 * @param {string} name data file key
 * @param {any} json the file's parsed content
 * @param {() => Promise<any>} loadDiy resolves data/diy.json (or null)
 */
export async function mergeDiyFile(name, json, loadDiy) {
  if ((name !== 'chess' && name !== 'tokens') || !json || typeof json !== 'object') return json;
  let d = null;
  try { d = await loadDiy(); } catch { d = null; }
  const add = d && d[name];
  return add && typeof add === 'object' ? { ...json, ...add } : json;
}

/**
 * The 甄选 picks of a checked loadout: { 5: [chessId|null, chessId|null], 6: [...] } by slot.
 * @param {Record<string, { diy?: number }>|null|undefined} loadout
 * @param {(id: string) => any} getChess
 */
export function diyPicks(loadout, getChess) {
  const out = { 5: [null, null], 6: [null, null] };
  for (const [id, e] of Object.entries(loadout || {})) {
    const c = typeof getChess === 'function' ? getChess(id) : null;
    if (!isDiyPick(c) || !e || !Number.isInteger(e.diy) || e.diy < 1 || e.diy > DIY_SLOTS || !out[c.tier]) continue;
    out[c.tier][e.diy - 1] = id;
  }
  return out;
}

/**
 * Loadout rule for the picks (checkLoadout): a slot holds one chess, an operator (charId) is picked once, only a
 * candidate's normal chess of the slot's tier.
 * @returns {string|null} the reason it is refused, else null
 */
export function diyPickProblem(entries, getChess) {
  const slots = new Set(), chars = new Set();
  for (const [id, e] of Object.entries(entries || {})) {
    if (!e || e.diy === undefined) continue;
    const c = getChess(id);
    if (!isDiyPick(c) || c.isGolden) return `${id} is no 甄选 operator`;
    if (!Number.isInteger(e.diy) || e.diy < 1 || e.diy > DIY_SLOTS) return `bad 甄选 slot ${e.diy}`;
    const slot = `${c.tier}:${e.diy}`;
    if (slots.has(slot)) return `甄选 slot ${slot} taken twice`;
    if (chars.has(c.charId)) return `${c.charId} picked twice`;
    slots.add(slot);
    chars.add(c.charId);
  }
  return null;
}
