// Operator attack modes (local patch, docs/LOCAL-PATCH.md 「스킬 모드 효과음·믹서 볼륨」 / 「스킬 중 공격 이펙트」): the character
// prefab's `_modes` list (tools/local-extract/char_modes.py → tools/assets/local-char-modes.json, public/assets/local/fx/
// modes.json) holds Default first, then the skill modes, named after their skill. Shared by the asset plan
// (tools/assets/skill-mode-sfx.mjs: sounds) and the effect layer (public/js/render/fxgame.js). Pure ESM.

/**
 * Allies built from an enemy record (PRTS 敌人类我方单位) fight in one mode of their enemy prefab, drawn and heard with that
 * enemy's own bindings (render/fxgame.js enemy-modes.json, audio.js sfx.units[id].em / sk): `mode` = its `_modes` index,
 * `skill` = the ability its kit runs. 炎佑: the 炎 bond summons 模式乙 (PRTS "由核心盟约-炎召唤时为模式乙", the sim's
 * content/tokens.js yanyouKit) — its prefab holds Skill_2 under Modes/2, whose Body/Attack is the only attack with sound
 * banks (`attack.2`).
 */
export const ENEMY_RECORD_MODES = Object.freeze({ enemy_9012_acloon: Object.freeze({ mode: 2, skill: 'Skill_2' }) });
/** @param {unknown} id @returns {{ mode: number, skill: string }|null} */
export const enemyRecordMode = (id) => (typeof id === 'string' && Object.hasOwn(ENEMY_RECORD_MODES, id) ? ENEMY_RECORD_MODES[id] : null);

/**
 * The mode index of skill `i` (0-based) in a `_modes` name list, or -1: the mode named exactly `S<k>` / `Sk<k>` (any case) first,
 * then a range `S<a>-<b>` holding k, then the first `S<k>…` variant (S2_Overload, S2Respawn, S3(D) …).
 * `skillMode` (char_modes.py: per skill, the mode its own prefab's switch_mode buff selects, or null) overrides names
 * where they mislead: a mode another skill's prefab claims is never this skill's, and a skill the names leave without a
 * mode takes its prefab's (莫斯提马 [Default, S2]: S3 → 1, S2 → none; 水月 [Default, T1, S1, S2]: S2 → 2, S3 → 3).
 * @param {string[]} modes
 * @param {number} i
 * @param {(number|null)[]|null} [skillMode]
 */
export function skillModeIndex(modes, i, skillMode = null) {
  const k = i + 1;
  const own = Array.isArray(skillMode) && Number.isInteger(skillMode[i]) ? skillMode[i] : -1;
  const taken = new Set(Array.isArray(skillMode) ? skillMode.filter((x, j) => j !== i && Number.isInteger(x)) : []);
  let best = -1, rank = 9;
  (Array.isArray(modes) ? modes : []).forEach((name, n) => {
    if (n === 0 || taken.has(n)) return;
    // (any case: 凯尔希·思衡托's prefab names its modes default / s1 / s2 / s3)
    const m = /^Sk?(\d)(?:-(\d))?/i.exec(String(name));
    if (!m) return;
    const a = Number(m[1]), b = Number(m[2] || m[1]);
    if (k < a || k > b) return;
    const up = String(name).toUpperCase();
    const r = up === `S${k}` || up === `SK${k}` ? 0 : a !== b ? 1 : 2;
    if (r < rank) { rank = r; best = n; }
  });
  return best >= 0 ? best : own;
}

