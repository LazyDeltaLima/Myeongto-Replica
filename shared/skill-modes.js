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
 * 2026-10-29, official client: the modes a running skill switches its owner to on the way (a SwitchMode of its buffs), by
 * the sim fx that marks that moment — 维什戴尔 S2's 过载 (wisdel_s_2[overload_start] → S2_Overload; fx 'wisdelOverload'),
 * 乌尔比安 S3 once the anchor lands (ulpia_s3_switch_mode[born]: his redeploy there, moved or in place, → S3_Respawn_A;
 * fx 'anchor'). From then until the skill ends its attacks sound that mode's signals (tools/assets/skill-mode-sfx.mjs
 * `modes[i].sub`, public/js/audio.js). A name is a `_modes` entry of the skill's own mode (`<its name>_…`), or a sibling
 * cast mode of the same skill (`S3_1` → `S3_2`).
 */
export const SKILL_SUB_MODES = Object.freeze({
  char_1035_wisdel: Object.freeze({ wisdelOverload: 'S2_Overload' }),
  char_4145_ulpia: Object.freeze({ anchor: 'S3_Respawn_A' }),
  // 寒芒克洛丝 S2 after attack@max_stack_count hits: four shots of S2_Sub (projectile_chr_kroos2_s2_2; kit fx 'quadShot')
  char_1021_kroos2: Object.freeze({ quadShot: 'S2_Sub' }),
  // 2026-11-03: 薇薇安娜 S3 from her second cast of a deployment (vvana_s_3[check]: mode 4 instead of 3; kit fx 'vvanaS3Later')
  char_4098_vvana: Object.freeze({ vvanaS3Later: 'S3_2' }),
  // 2026-11-03: 贝洛内 S3 — demetr_s3[switch_mode] (ON_BUFF_START) switches him to the mode its blackboard names, S3_Resapwn,
  // and triggers FlyToTarget (its first 【移动】, in place without a target; kit fx 'teleport'): the prefab's `S3` mode is
  // the one demetr_s3[restore] puts him in after the 【返回】
  char_4037_demetr: Object.freeze({ teleport: 'S3_Resapwn' }),
  // 2026-11-03: Mon3tr S3 — monstr_s_3_buff[respawn]'s RespawnCharacter puts her on her 重构体's tile in S3_Reborn (the
  // melee mode; kit fx 'teleport')
  char_4179_monstr: Object.freeze({ teleport: 'S3_Reborn' }),
});

/**
 * 2026-11-03, official client: a skill whose own attack ability is a group of casts (`ON_ABILITY_*.<skillId>.<k>`), the
 * child each cast sounds picked by the sim's swing signal (the 'swing' hook's `signal`, ai.js) — `def` without one. Such a
 * skill sounds its ability, not the `_modes` entry its name matches: 薇薇安娜 S1's `S1` mode is her 蓄力 state
 * (vvana_s_1[mode]), not the cast's; skchr_vvana_1.1 is the plain cast, .2 the 蓄力 one (kit signal 'vvanaCharged').
 * skill index → { def, sig: { [signal]: child } }.
 */
export const SKILL_CAST_KIDS = Object.freeze({
  char_4098_vvana: Object.freeze({ 0: Object.freeze({ def: 1, sig: Object.freeze({ vvanaCharged: 2 }) }) }),
});

/**
 * The mode index of skill `i` (0-based) in a `_modes` name list, or -1: the mode named exactly `S<k>` / `Sk<k>` (any case) first,
 * then a range `S<a>-<b>` holding k, then a variant `S<k>…Loop` (the one that attacks of a Start / Loop / End chain: 타락사쿰's
 * S1_FlyStart, S1_FlyLoop, S1_FlyEnd), then the first `S<k>…` variant (S2_Overload, S2Respawn, S3(D) …).
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
    const r = up === `S${k}` || up === `SK${k}` ? 0 : a !== b ? 1 : up.endsWith('LOOP') ? 2 : 3;
    if (r < rank) { rank = r; best = n; }
  });
  return best >= 0 ? best : own;
}

