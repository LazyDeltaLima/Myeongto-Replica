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
