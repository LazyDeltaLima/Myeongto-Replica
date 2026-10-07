// Operator attack modes (local patch, docs/LOCAL-PATCH.md 「스킬 모드 효과음·믹서 볼륨」 / 「스킬 중 공격 이펙트」): the character
// prefab's `_modes` list (tools/local-extract/char_modes.py → tools/assets/local-char-modes.json, public/assets/local/fx/
// modes.json) holds Default first, then the skill modes, named after their skill. Shared by the asset plan
// (tools/assets/skill-mode-sfx.mjs: sounds) and the effect layer (public/js/render/fxgame.js). Pure ESM.

/**
 * The mode index of skill `i` (0-based) in a `_modes` name list, or -1: the mode named exactly `S<k>` / `Sk<k>` first,
 * then a range `S<a>-<b>` holding k, then the first `S<k>…` variant (S2_Overload, S2Respawn, S3(D) …).
 * @param {string[]} modes
 * @param {number} i
 */
export function skillModeIndex(modes, i) {
  const k = i + 1;
  let best = -1, rank = 9;
  (Array.isArray(modes) ? modes : []).forEach((name, n) => {
    if (n === 0) return;
    const m = /^Sk?(\d)(?:-(\d))?/.exec(String(name));
    if (!m) return;
    const a = Number(m[1]), b = Number(m[2] || m[1]);
    if (k < a || k > b) return;
    const r = name === `S${k}` || name === `Sk${k}` ? 0 : a !== b ? 1 : 2;
    if (r < rank) { rank = r; best = n; }
  });
  return best;
}

