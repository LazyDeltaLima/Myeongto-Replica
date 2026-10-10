// test/content/feedback5-we2-raid-148.test.js — 0.2.0 WE2 #3 (GitHub #148 「突袭近战干员部署在高台」, a battle screenshot on the
// 深水区 map): reproduced on every battle stage — a melee 突袭 member's jump (content/bonds/addon/battle.js raidTile:
// grid.canStand for its position) lands on low ground only, never on a 高台; on 战场#08 (act2 m04) it may land on a 围墙 tile
// (tile_fence_bound: LOW, buildable ALL — deployable, it attacks from there and blocks no ground enemy, DESIGN §21.23), which
// the board draws as a raised concrete area inside an orange railing: what the screenshot most likely shows.
// 0.2.0 WV #3 (the owner's decision of 2026-10-06) preferred a tile where its block applies; replaced 2026-10-10 by the
// client code (AutoChessRebuildCharacterOnTile): the first standable tile of the box "1-1" turned against the member's
// direction — the enemy's own tile, else the one behind it — with no block preference.
// Run: node --test test/content/feedback5-we2-raid-148.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';
import { getData } from '../../server/data.js';

const D = getData({ log: { warn() {}, error() {}, info() {} } });
const STAGES = Object.keys(D.stages).filter((id) => D.stages[id].kind !== 'unite');
const defs = {
  chess: { m: chessRec({ id: 'm', bonds: ['raidShip'], position: 'MELEE', range: [[0, 0], [0, 1]] }) },
  enemies: { e: enemyRec({ key: 'e', hp: 1e9, speed: 0, mass: 0 }) },
};
const RAID = { raidShip: { count: 3, active: true, tier: 1, layers: 1 } };
/** The official landing box of an enemy on (er, ec) for a RIGHT-facing member: range "1-1" turned LEFT — its tile, then (er, ec − 1). */
function landingTiles(b, er, ec) {
  const out = [];
  for (const [dr, dc] of [[0, 0], [0, 1]]) {
    const r = er + dr, c = ec - dc;
    if (b.grid.inRect(r, c) && b.grid.canStand(r, c) && !b.isReservedTile(r, c)) out.push([r, c]);
  }
  return out;
}
const same = (t, r, c) => t[0] === r && t[1] === c;

test('#3 / GitHub #148: a melee 突袭 member never lands on a 高台 (any stage, any enemy tile of the field); it takes the first standable tile of the official box — the enemy\'s own, else the one behind it (no block preference since 2026-10-10)', () => {
  let jumps = 0, fence = 0, behind = 0;
  for (const stageId of STAGES) {
    const st = D.stages[stageId];
    const tileAt = (r, c) => st.tiles[st.rows[r]?.[c]];
    // the member's start: the first deployable melee tile of the field
    let home = null;
    for (let r = 12; r >= 9 && !home; r--) for (let c = 2; c <= 10 && !home; c++) {
      const t = tileAt(r, c);
      if (t && t.height === 'LOW' && (t.buildable === 'ALL' || t.buildable === 'MELEE') && t.tileKey === 'tile_road') home = [r, c];
    }
    if (!home) continue;
    for (let er = 9; er <= 12; er++) for (let ec = 2; ec <= 10; ec++) {
      const t = tileAt(er, ec);
      if (!t || t.height !== 'LOW' || (er === home[0] && ec === home[1])) continue;
      const h = makeBattle({ stageId, defs, bonds: RAID, enemies: [{ key: 'e', pos: [er, ec] }], units: [{ chessId: 'm', row: home[0], col: home[1] }], autoFinish: false, timeLimit: 60 });
      const u = h.unit('m');
      h.step();
      const tiles = landingTiles(h.b, er, ec);
      h.run(12);
      if (u.tileR === home[0] && u.tileC === home[1]) continue;   // it attacked (its 10 s never met) or the box had no tile
      jumps++;
      const at = `${stageId}: enemy ${er},${ec} → ${u.tileR},${u.tileC}`;
      const lt = tileAt(u.tileR, u.tileC);
      assert.ok(lt && lt.height === 'LOW' && (lt.buildable === 'ALL' || lt.buildable === 'MELEE'), `${at} ${lt?.tileKey}/${lt?.height}`);
      assert.ok(tiles.length && same(tiles[0], u.tileR, u.tileC), `${at}: the first standable tile of the box (${JSON.stringify(tiles)})`);
      if (!same(tiles[0], er, ec)) behind++;
      if (lt.tileKey === 'tile_fence_bound') fence++;
    }
  }
  assert.ok(jumps > 50, `${jumps} jumps checked`);
  assert.ok(behind > 0, `${behind} landings behind an enemy whose own tile was not standable`);
  assert.ok(fence > 0, 'some land on a 围墙 tile (the #148 look) when the box offers one first');
});
