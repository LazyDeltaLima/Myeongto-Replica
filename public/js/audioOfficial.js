// Official battle mix and skill-mode sounds (local patch, docs/LOCAL-PATCH.md 「스킬 모드 효과음·믹서 볼륨」), used by
// public/js/audio.js (upstream) through short local-patch lines. Pure: no DOM, no Web Audio.
//
// Mix: the client's AudioMixer `MainMixer` (EN sharedassets1.assets), Default snapshot: each bank plays on its
// `customMixerGroup` (audio_data.json → manifest sfx.units[id].grp / modes[i].grp / sfx.kitGrp) whose volume, summed
// with its parents' (dB), is the linear gain below; a sound's own bank volume (mix.vol, up to 2.0) multiplies it.
// Research 2026-10-07 (research/2026-10-07-official-compare/compare-audio.md §2). The voice channel
// plays at the Voice group's gain; the sfx channel carries no extra factor (the groups already hold SFX_Battle's −3.15 dB).
// A role without a group in the manifest falls back to the group its role uses in the official banks (ROLE_GROUP).
//
// Skill modes: sfx.units[id].modes[skillIndex] = { attack?, hit?, mix?, grp?, deferStart? } (tools/assets/skill-mode-sfx.mjs)
// — the attack / impact sounds of the attacks an operator makes while that skill runs.

/** Linear gain of each mixer group (Default snapshot, parents included). */
export const GROUP_GAIN = Object.freeze({
  Battle_P_NAtk: 0.348, Battle_P_NImp: 0.336, Battle_P_SAtk: 0.428, Battle_P_SImp: 0.348, Battle_P_Field: 0.267,
  Battle_E_NAtk: 0.163, Battle_E_NImp: 0.205, Battle_E_SAtk: 0.273, Battle_E_SImp: 0.317,
  Battle_BE_NAtk: 0.343, Battle_BE_NImp: 0.327,
  Battle_UI_Important: 0.614, Battle_UI_Boost: 0.67, Battle_Skill_Important: 0.473,
  Battle_A_Global: 0.696, Independent: 0.526, SFX_Battle: 0.696,
});
/** The Voice group (the voice channel's gain). */
export const VOICE_GAIN = 0.978;
/** A bank without a group (e.g. ON_MODIFIER_HEAL): the battle SFX bus [ASSUMED]. */
const NO_GROUP = GROUP_GAIN.SFX_Battle;

/** The group a role uses in the official banks when the manifest has none (by the unit's model id prefix). */
export function roleGroup(defId, role, mode = false) {
  const enemy = typeof defId === 'string' && defId.startsWith('enemy_');
  switch (role) {
    case 'attack': return enemy ? 'Battle_E_NAtk' : mode ? 'Battle_P_SAtk' : 'Battle_P_NAtk';
    case 'hit': return enemy ? 'Battle_E_NImp' : mode ? 'Battle_P_SImp' : 'Battle_P_NImp';
    case 'skill': return enemy ? 'Battle_E_NAtk' : 'Battle_UI_Boost';
    case 'die': case 'born': return enemy ? 'Battle_E_NImp' : 'Battle_UI_Important';
    default: return 'SFX_Battle';
  }
}

/** Gain of a mixer group name (unknown → the battle SFX bus). */
export const groupGain = (g) => (typeof g === 'string' && Object.hasOwn(GROUP_GAIN, g) ? GROUP_GAIN[g] : NO_GROUP);

/**
 * The official gain of a unit's sound: its group's gain × its bank volume (mix.vol, not capped — a bank the official
 * client plays louder than 1 stays louder; audio.js `_play` caps the node gain at 1.5).
 * @param {string} defId the unit's model id (sfx.units key)
 * @param {'attack'|'hit'|'skill'|'die'|'born'} role
 * @param {any} entry sfx.units[defId] (its `grp`)
 * @param {{ vol?: number }|null|undefined} mix the role's bank mix
 * @param {{ grp?: any, skillIndex?: number|null, mode?: boolean }} [o] a mode's own groups / the skill index of a
 *   `skill` start sound
 */
export function officialGain(defId, role, entry, mix, o = {}) {
  const grp = o.grp ?? entry?.grp;
  let g = role === 'skill' && Number.isInteger(o.skillIndex) ? grp?.skills?.[o.skillIndex] : grp?.[role];
  if (typeof g !== 'string') g = roleGroup(defId, role, !!o.mode);
  const vol = Number(mix?.vol);
  return groupGain(g) * (Number.isFinite(vol) && vol > 0 ? vol : 1);
}

/** Groups of the named battle sounds (audio.js battle(name); BATTLE_SFX banks / their files' banks). */
export const BATTLE_GROUP = Object.freeze({
  deploy: 'Battle_UI_Important', tokenDeploy: 'Battle_UI_Important', charDie: 'Battle_UI_Important', leak: 'Battle_UI_Important',
  enemyDie: 'Battle_E_NImp', enemyDieHeavy: 'Battle_BE_NImp', enemyHit: 'Battle_E_NImp', killCoin: 'Battle_E_NImp',
  heal: 'SFX_Battle',
});
/** Bank volume of a named battle sound when it differs from 1 (ON_MODIFIER_HEAL p_imp_heal_n 0.8). */
const BATTLE_VOL = Object.freeze({ heal: 0.8 });
/** The official gain of a named battle sound (unknown names: the battle SFX bus). */
export const battleGain = (name) => groupGain(BATTLE_GROUP[name]) * (BATTLE_VOL[name] ?? 1);

/**
 * The skill-mode entry of a unit for its running skill: sfx.units[defId].modes[skillIndex] when it has a sound for the
 * role, else null.
 * @param {any} entry sfx.units[defId]
 * @param {number|null|undefined} skillIndex
 * @param {'attack'|'hit'} [role]
 */
export function modeEntry(entry, skillIndex, role = null) {
  if (!Number.isInteger(skillIndex)) return null;
  const m = entry?.modes?.[skillIndex];
  if (!m || typeof m !== 'object') return null;
  return !role || typeof m[role] === 'string' ? m : null;
}
