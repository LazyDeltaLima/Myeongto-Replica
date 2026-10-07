// Skill activation sounds (local patch, docs/LOCAL-PATCH.md): the official audio_data files a skill's sound under
// battle.ON_SKILL_START.<skillId> for many skills, but for others only under the ability the skill fires —
// ON_ABILITY_START.<skillId> (often numbered .1 / .2: 缄默德克萨斯 S3, 维什戴尔 S1, 仇白 S2), ON_CUSTOM_TRIGGER.<skillId>[start]
// (丰川祥子 S3), ON_ABILITY_ON / ON_ABILITY_HIT (流星 S2, 古米 S1). plan.mjs took ON_SKILL_START only, so 34 operators had
// no skill sound for their default skill. The fallbacks below keep ON_SKILL_START first; the client plays the first
// path once when the skill starts (public/js/audio.js unit 'skill').

const EVENTS = ['ON_SKILL_START', 'ON_ABILITY_START', 'ON_CUSTOM_TRIGGER', 'ON_ABILITY_ON', 'ON_ABILITY_HIT'];
const SUFFIXES = ['', '.1', '.2', '[start]'];

/**
 * Sound paths of a skill's activation, from the indexed audio_data (tools/assets/audio.mjs indexAudio).
 * @param {{ skillBanks: Map<string, Map<string, string[]>>, bank: (name: string) => string[] }} audio
 * @param {string} skillId
 * @returns {string[]|null}
 */
export function skillStartSounds(audio, skillId) {
  if (!skillId) return null;
  const own = audio.skillBanks?.get(skillId)?.get('ON_SKILL_START');
  if (own?.length) return own;
  for (const ev of EVENTS) {
    for (const suf of SUFFIXES) {
      const p = audio.bank(`battle.${ev}.${skillId}${suf}`);
      if (p && p.length) return p;
    }
  }
  return null;
}

/**
 * local patch (skill-mode-sfx.mjs deferStart): the skill's start sound is not its own start bank but one of its attack
 * ability's (ON_ABILITY_START / ON / HIT — the official client sounds those on the skill's attacks). A custom start trigger
 * (丰川祥子 S3 `ON_CUSTOM_TRIGGER.skchr_oblvns_3[start]`) is a real start sound.
 */
export function skillStartIsFallback(audio, skillId) {
  if (!skillId || audio.skillBanks?.get(skillId)?.get('ON_SKILL_START')?.length) return false;
  const p = skillStartSounds(audio, skillId);
  if (!p?.length) return false;
  for (const suf of SUFFIXES) if (audio.bank(`battle.ON_CUSTOM_TRIGGER.${skillId}${suf}`) === p) return false;
  return true;
}
