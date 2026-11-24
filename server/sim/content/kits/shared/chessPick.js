// server/sim/content/kits/shared/chessPick.js — a chess kit fielded as a 自选 pick of another season (ops/op-reed2.js,
// op-angel2.js, op-titi.js: 盟约 chess that 规程 offers as picks, maintainer decision 2026-11-14).
//
// A chess kit writes its chess's default skill as the kit's `skill` and the others under `skills`, and some of its hooks
// ask whether the default skill is the selected one (tier6.js / tier2.js onDefaultSkill: the record's skills[] flag). A 自选
// piece takes its spec from `skills` only (content/index.js selectSkillSpec: the pick chooses any skill) and its record
// flags no default (a backups.json form has none). chessKitAsPick hands the builder the record with the chess's default
// flagged and files the kit's `skill` under `skills[defaultSkillId]`; the other entries are kept as they are (lazy getters
// included). Every number still comes from the 自选 record.

/** @import { KitChess } from './tier1.js' */

/** The record with `skillId` flagged as the default skill, when it flags none. @param {KitChess} rec @param {string} skillId */
function flagDefault(rec, skillId) {
  if (!rec || !Array.isArray(rec.skills) || rec.skills.some((s) => s && s.isDefault)) return rec;
  return { ...rec, skills: rec.skills.map((s) => (s ? { ...s, isDefault: s.skillId === skillId } : s)) };
}

/**
 * The 自选 kit builder of a chess kit builder `build` whose chess's default skill is `defaultSkillId`.
 * @typedef {(bb: any, rec: any, def: any) => any} KitBuilder a chess kit builder (bb, record, def) => Kit
 * @param {KitBuilder} build
 * @param {string} defaultSkillId
 * @returns {KitBuilder}
 */
export function chessKitAsPick(build, defaultSkillId) {
  return (bb, rec, def) => {
    const kit = build(bb, flagDefault(rec, defaultSkillId), def);
    if (!kit || typeof kit !== 'object') return kit;
    const src = kit.skills && typeof kit.skills === 'object' ? kit.skills : {};
    if (Object.prototype.hasOwnProperty.call(src, defaultSkillId) || !kit.skill) return kit;
    const skills = Object.defineProperties({}, Object.getOwnPropertyDescriptors(src));
    Object.defineProperty(skills, defaultSkillId, { enumerable: true, value: kit.skill });
    return { ...kit, skills };
  };
}
