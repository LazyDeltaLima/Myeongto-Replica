// test/helpers/seasonPicks.js — the 自选 picks each season offers. shared/local-diy.js LOCAL_DIY_PICKS is the whole list;
// a season's build (tools/build-data.mjs) leaves out the operators its own chess field ("不可甄选加入已在名单中的固定干员"):
// 规程 does not offer its chess 淬羽赫默, 赫德雷 and 机械师, 盟约 not its chess 焰影苇草, 新约能天使 and 缇缇 (规程 picks since
// 2026-11-14, maintainer decision).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_DIY_PICKS } from '../../shared/local-diy.js';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));

/** LOCAL_DIY_PICKS less the operators of `chess` (a season's chess.json), in the picker's order. @param {Record<string, any>} chess */
export function seasonPicks(chess) {
  const roster = new Set(Object.values(chess).map((c) => c && c.charId).filter(Boolean));
  return LOCAL_DIY_PICKS.filter((id) => !roster.has(id));
}

/** Every season's { chess, backups } (the default season's data/*.json, then data/seasons/<id>/ over it). */
export function allSeasonData() {
  const base = { chess: read(path.join(DATA_DIR, 'chess.json')), backups: read(path.join(DATA_DIR, 'backups.json')) };
  const out = { act2autochess: base };
  const dir = path.join(DATA_DIR, 'seasons');
  for (const s of existsSync(dir) ? readdirSync(dir) : []) {
    const f = (n) => (existsSync(path.join(dir, s, `${n}.json`)) ? read(path.join(dir, s, `${n}.json`)) : base[n]);
    out[s] = { chess: f('chess'), backups: f('backups') };
  }
  return out;
}

/**
 * Every season's picks, each once, with the season whose data runs it: the default season's in the picker's order, then the
 * picks only a later season offers (规程's 焰影苇草, 新约能天使 and 缇缇) with that season. A sweep over the picks runs each on
 * its season's data (test/helpers/battleHarness.js makeBattle `season`): on the default season's a 规程-only pick is one of
 * its chess and has no 自选 form. @returns {{ charId: string, season: string }[]}
 */
export function seasonPickList() {
  const out = [];
  const seen = new Set();
  for (const [season, d] of Object.entries(allSeasonData())) {
    for (const charId of seasonPicks(d.chess)) if (!seen.has(charId)) { seen.add(charId); out.push({ charId, season }); }
  }
  return out;
}
