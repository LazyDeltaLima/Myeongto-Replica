#!/usr/bin/env node
// 선발 오퍼레이터 (甄选 / DIY picks, local NAS patch, docs/LOCAL-PATCH.md): data/diy.json — the chess records of the
// operators a player may put into the official 甄选 slots (act2autochess diyChessDict: two tier V and two tier VI slots,
// a 6★ operator not in the pool).
//
// Each candidate gets its own chess ids per tier — chess_diy_<key>_<tier>_a (normal) / _b (elite) — built by
// tools/build-data.mjs's own builders from the official tables, with the slot's status copied from
// chess_char_<tier>_diy1_a/_b (normal E2 Lv1 skill 4; elite E2 Lv60 skill 7, module level 1 at tier V / 3 at tier VI),
// its price (4 / sell 1) and merge (3). Bond by faction (bilibili wiki 盟约: "根据干员阵营自动分配盟约", extended to
// the act2 nation bonds叙拉古 / 卡西米尔 [ASSUMED]), else 协防干员 (constData fallbackBondId emptyShip); no 特质.
// The records are flagged isDiy + diyPick + visible: false, so the shared pool, bans, bots and the upstream data checks
// never see them; server/local-patch.js gives each player's picks a private shop pool.
//
//   node tools/build-diy.mjs        (official tables from build-data's cache, downloaded when missing)

import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { loadContext, buildChess, buildTokens } from './build-data.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, 'data', 'diy.json');

/** The candidates (owner's choice 2026-10-05): charId → short key (also the effect bundle name). */
export const DIY_CANDIDATES = Object.freeze([
  { charId: 'char_2027_wang', key: 'wang' },
  { charId: 'char_1050_chen3', key: 'chen3' },
  { charId: 'char_1035_wisdel', key: 'wisdel' },
  { charId: 'char_4182_oblvns', key: 'oblvns' },
  { charId: 'char_4132_ascln', key: 'ascln' },
]);
const TIERS = [5, 6];

/** Faction → bond (nation, then group / team, e.g. 深海猎人 → 阿戈尔), else the fallback bond. */
const NATION_BONDS = { yan: 'yanShip', sargon: 'sargonShip', victoria: 'victoriaShip', kjerag: 'kjeragShip', laterano: 'lateranoShip',
  egir: 'egirShip', siracusa: 'siracusaShip', kazimierz: 'kazimierzShip' };
const GROUP_BONDS = { abyssal: 'egirShip', glasgow: 'victoriaShip', lungmen: 'yanShip', sui: 'yanShip', lee: 'yanShip' };
export function diyBond(char, fallback = 'emptyShip') {
  const p = char?.mainPower || {};
  return NATION_BONDS[p.nationId || char?.nationId] || GROUP_BONDS[p.groupId] || GROUP_BONDS[p.teamId] || fallback;
}

export const diyChessId = (key, tier, golden = false) => `chess_diy_${key}_${tier}_${golden ? 'b' : 'a'}`;

/**
 * Build the candidates' chess / token records from a build-data context (tools/i18n/build-ko-diy.mjs passes one whose
 * strings are Korean).
 * @returns {Promise<{ meta: object[], chess: Record<string, any>, tokens: Record<string, any> }>}
 */
export async function buildDiy(ctx) {
  const { act, charTable } = ctx;
  const fallback = act.constData?.fallbackBondId || 'emptyShip';
  const chessData = {}, shopData = {}, normalOf = { ...act.chessNormalIdLookupDict };
  const meta = [];
  let sort = 900;
  for (const c of DIY_CANDIDATES) {
    const char = charTable[c.charId];
    if (!char) throw new Error(`${c.charId} missing from character_table`);
    const ids = {};
    for (const tier of TIERS) {
      const slotA = act.charChessDataDict[`chess_char_${tier}_diy1_a`], slotB = act.charChessDataDict[`chess_char_${tier}_diy1_b`];
      const slotShop = act.charShopChessDatas[`chess_char_${tier}_diy1_a`];
      if (!slotA || !slotB || !slotShop) throw new Error(`act2autochess has no tier ${tier} 甄选 slot`);
      const a = diyChessId(c.key, tier), b = diyChessId(c.key, tier, true);
      const bonds = [diyBond(char, fallback)];
      chessData[a] = { ...slotA, chessId: a, upgradeChessId: b, bondIds: bonds, garrisonIds: null };
      chessData[b] = { ...slotB, chessId: b, upgradeChessId: null, bondIds: bonds, garrisonIds: null };
      normalOf[b] = a;
      shopData[a] = { ...slotShop, chessId: a, goldenChessId: b, chessType: 'DIY_PICK', charId: c.charId, tmplId: null,
        shopLevelSortId: sort++, defaultSkillIndex: slotShop.defaultSkillIndex ?? 0, defaultUniEquipId: null, isHidden: false };
      ids[tier] = a;
    }
    meta.push({ charId: c.charId, key: c.key, name: char.name, appellation: char.appellation, ids });
  }
  // build only the candidates: a context whose chess tables hold just them
  const sub = { ...ctx, act: { ...act, charChessDataDict: chessData, charShopChessDatas: { ...act.charShopChessDatas, ...shopData }, chessNormalIdLookupDict: normalOf } };
  const { chess, tokenOwners } = buildChess(sub);
  for (const rec of Object.values(chess)) {
    rec.isDiy = true;
    rec.diyPick = true;
    rec.visible = false;
    rec.isHidden = false;
  }
  let enemies = {};
  try { enemies = JSON.parse(await readFile(join(ROOT, 'data', 'enemies.json'), 'utf8')); } catch { /* summons that are enemies: none here */ }
  const all = buildTokens(sub, chess, tokenOwners, enemies);
  // buildTokens also adds the season's extra summons (炎佑 …): keep the candidates' own
  const tokens = Object.fromEntries(Object.entries(all).filter(([id]) => tokenOwners.has(id)));
  // 望's 棋子 go on any deployable tile, ground or high ground (owner's decision 2026-10-05; the table says MELEE)
  if (tokens.token_10064_wang_stone1) tokens.token_10064_wang_stone1.position = 'ALL';
  return { meta, chess, tokens };
}

async function main() {
  const ctx = await loadContext();
  const { meta, chess, tokens } = await buildDiy(ctx);
  const doc = {
    about: 'Chess records of the 甄选 (DIY) picks — tools/build-diy.mjs (local NAS patch). Merged into chess / tokens by server/data.js and public/js/data.js.',
    candidates: meta, chess, tokens,
  };
  await writeFile(OUT, JSON.stringify(doc) + '\n');
  console.log(`[diy] ${meta.length} candidates, ${Object.keys(chess).length} chess, ${Object.keys(tokens).length} tokens -> ${OUT}`);
  for (const m of meta) {
    const r = chess[m.ids[6]];
    console.log(`  ${m.charId} ${m.name}: bonds ${r.bonds.join(',')} · skills ${r.skills.map((s) => s.index + ':' + s.name).join(' / ')} · tokens ${r.tokens.join(',') || '-'}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((e) => { console.error('build-diy failed:', e?.stack || e); process.exitCode = 1; });
}
