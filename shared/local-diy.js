// shared/local-diy.js — local patch (docs/LOCAL-PATCH.md 「선발 오퍼레이터」): the 自选 picks this server offers and accepts.
// The owner's decisions (2026-10-05, kept on upstream 0.2.0's 自选 framework 2026-10-07; three more 2026-10-11): only these
// eight owned 6★, in this order — 望, 赤刃明霄陈, 维什戴尔, 丰川祥子 (a collab upstream leaves out), 阿斯卡纶, 凯尔希·思衡托,
// 克莱门莎, 予愿安洁莉娜 — and no prototype (原型干员 / 预备干员) at either tier. Since the hard fork from 0.2.0 (2026-10-07) they are the whole 自选 data: tools/build-data.mjs
// builds data/backups.json `diy.ownedPool` from this list (`diy.prototypes` empty) and only their kits exist
// (kits/index.js OPERATOR_KIT_FILES). The entrance keeps narrowing to them, a guard on top of the data — server/lobby.js
// room.diy (checkDiyPicks `kitted`) and the welcome's `diyKitted` the client's 自选编队 picker offers (ui/diyModel.js
// pickOptions → diyPool `kitted`; the kit list KITTED_CHARS also holds the 补位 stand-ins).

/** The 自选 picks offered and accepted, in the picker's order. */
export const LOCAL_DIY_PICKS = Object.freeze(['char_2027_wang', 'char_1050_chen3', 'char_1035_wisdel', 'char_4182_oblvns', 'char_4132_ascln',
  'char_1052_kalts2', 'char_4231_clemnt', 'char_1015_aglna2']);

/** Whether `charId` may be picked for a 自选 slot here. @param {string} charId */
export function isLocalDiyPick(charId) {
  return LOCAL_DIY_PICKS.includes(charId);
}

/** The local picks among `pool` (upstream's legal picks of a tier), in LOCAL_DIY_PICKS order. @param {string[]} pool */
export function localDiyPool(pool) {
  const have = new Set(pool);
  return LOCAL_DIY_PICKS.filter((id) => have.has(id));
}
