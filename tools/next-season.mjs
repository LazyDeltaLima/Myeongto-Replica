// tools/next-season.mjs — the 卫戍协议【规程】 pieces known before its tables exist (shared/seasons.js `next`, never public).
//
// A chess's status follows its tier alone (the same per tier in both past seasons), its numbers come from character_table and
// the rest is in tools/assets/next-season-roster.json: the operators of the CN preview without a kit yet, each with its announced
// tier and the announced bonds this server already has. So `build-data --season next` can make their pieces and their kits can
// be written and fought now. nextSeasonAct is the current season's section plus those pieces; [ASSUMED·CN: the new tables replace
// it, status and default skill checked against them]. Bonds and 特质 effects of the new season wait for the tables: a new bond is
// listed as `newBonds` only, a piece carries no 特质. When the season's data arrives this file, the roster and `next` go.

/** chess id of a roster operator: its tier, then a letter no official id has, then its code name. */
const pieceId = (charId, tier, golden) => `chess_char_${tier}_n${charId.replace(/^char_\d+_/, '')}_${golden ? 'b' : 'a'}`;

/** The one { evolvePhase, charLevel, … } this section's preset chess have at `tier`, normal or elite. */
function tierStatus(act, tier, golden) {
  const seen = new Map();
  for (const [baseId, shop] of Object.entries(act.charShopChessDatas)) {
    if (shop.chessType !== 'PRESET' || shop.chessLevel !== tier) continue;
    const st = act.charChessDataDict[golden ? shop.goldenChessId : baseId]?.status;
    if (st) seen.set(JSON.stringify(st), st);
  }
  if (seen.size !== 1) throw new Error(`tier ${tier}${golden ? ' elite' : ''}: ${seen.size} statuses, expected one`);
  return { ...[...seen.values()][0] };
}

/**
 * The `next` season's section: a copy of `act` with the roster's pieces added, whose ids no other chess has.
 * @param {any} act the current season's activity section
 * @param {{ ops: Array<{ charId: string, tier: number, bonds?: string[] }> }} roster
 * @param {{ charEquip?: Record<string, string[]> }} uniequip uniequip_table: an operator's modules, in order (the first is its base one)
 * @param {Record<string, unknown>} battleEquip battle_equip_table: which modules have a battle record
 */
export function nextSeasonAct(act, roster, uniequip, battleEquip) {
  const out = {
    ...act,
    charChessDataDict: { ...act.charChessDataDict },
    charShopChessDatas: { ...act.charShopChessDatas },
    chessNormalIdLookupDict: { ...act.chessNormalIdLookupDict },
  };
  let identifier = Math.max(...Object.values(act.charChessDataDict).map((c) => Number(c.identifier) || 0));
  const sort = {};
  for (const s of Object.values(act.charShopChessDatas)) sort[s.chessLevel] = Math.max(sort[s.chessLevel] ?? 0, Number(s.shopLevelSortId) || 0);
  for (const { charId, tier, bonds = [] } of roster.ops) {
    const a = pieceId(charId, tier, false), b = pieceId(charId, tier, true);
    if (out.charChessDataDict[a]) throw new Error(`${a} taken`);
    const modules = (uniequip.charEquip?.[charId] || []).filter((m) => battleEquip[m]);
    const module = modules[0] ?? null;
    out.charShopChessDatas[a] = {
      chessId: a, goldenChessId: b, chessLevel: tier, shopLevelSortId: (sort[tier] = (sort[tier] ?? 0) + 1), chessType: 'PRESET',
      charId, tmplId: null, defaultSkillIndex: 1, defaultUniEquipId: module,
      backupCharId: charId, backupTmplId: null, backupCharSkillIndex: 1, backupCharUniEquipId: module, backupCharPotRank: 0, isHidden: false,
    };
    out.charChessDataDict[a] = { chessId: a, identifier: ++identifier, isGolden: false, status: tierStatus(act, tier, false), upgradeChessId: b, upgradeNum: 3, bondIds: [...bonds], garrisonIds: [] };
    out.charChessDataDict[b] = { chessId: b, identifier: ++identifier, isGolden: true, status: tierStatus(act, tier, true), upgradeChessId: null, upgradeNum: 0, bondIds: [...bonds], garrisonIds: [] };
    out.chessNormalIdLookupDict[a] = a;
    out.chessNormalIdLookupDict[b] = a;
  }
  return out;
}
