// shared/local-diy.js — local patch (docs/LOCAL-PATCH.md 「선발 오퍼레이터」): the 自选 picks this server offers and accepts.
// The owner's decision (2026-10-05, kept on upstream 0.2.0's 自选 framework 2026-10-07): only these five owned 6★, in
// this order — 望, 赤刃明霄陈, 维什戴尔, 丰川祥子 (a collab upstream leaves out; tools/build-data.mjs DIY_LOCAL_INCLUDED builds
// her data), 阿斯卡纶 — and no prototype (原型干员 / 预备干员) at either tier. Upstream's data (data/backups.json `diy`:
// the whole owned pool, the prototypes) and its kits stay as they are; shared/diy.js diyPool / validateDiyPicks apply
// this list (one hooked line each), so the server's room.diy / setDiy checks and the client's 自选编队 picker follow it.
// The sim itself (checkDiyPick / diyRecordOf, the battle harness) still fields any legal pick, as upstream's kit tests do.

/** The 自选 picks offered and accepted, in the picker's order. */
export const LOCAL_DIY_PICKS = Object.freeze(['char_2027_wang', 'char_1050_chen3', 'char_1035_wisdel', 'char_4182_oblvns', 'char_4132_ascln']);

/** Whether `charId` may be picked for a 自选 slot here. @param {string} charId */
export function isLocalDiyPick(charId) {
  return LOCAL_DIY_PICKS.includes(charId);
}

/** The local picks among `pool` (upstream's legal picks of a tier), in LOCAL_DIY_PICKS order. @param {string[]} pool */
export function localDiyPool(pool) {
  const have = new Set(pool);
  return LOCAL_DIY_PICKS.filter((id) => have.has(id));
}
