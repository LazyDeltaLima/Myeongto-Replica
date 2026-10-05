// Per-round 作战 BGM (local patch, docs/LOCAL-PATCH.md): plan.mjs gives prep and combat the same
// act1autochess_shop track, while the official normal round levels declare their own bgmEvent
// (research 05-maps roundLevels[id].bgm: act1autochess_01–07 bat_kazimierz2_2, h01–h06 bat_kazimierz2_1,
// training bat_act35side_01). This builds `audio.waveBgm[templateId]` for those levels; boss levels stay in
// `bossBgm` and the 联防 levels (escaped_*) in `bgm.unite`. The client picks the entry of the round's template
// (public/js/round-bgm.js).

/** usedBy of a normal round: `mode_single_normal#3` (boss rounds carry `(boss:boss_N)`, 联防 `constData.…`). */
const NORMAL_ROUND = /^mode_\w+#\d+$/;

/**
 * @param {object|null} roundLevels research 05-maps roundLevels
 * @param {(bank: string) => object|null} leaf BGM bank name → `{ loop, intro? }` template leaf (plan.mjs bgmLeaf + flatBgm)
 * @returns {Record<string, object>} templateId → leaf, sorted by id
 */
export function waveBgmTemplate(roundLevels, leaf) {
  const out = {};
  for (const [id, lv] of Object.entries(roundLevels || {}).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))) {
    if (typeof lv?.bgm !== 'string' || !(lv.usedBy || []).some((u) => NORMAL_ROUND.test(String(u)))) continue;
    const l = leaf(`battle.ON_GAME_READY.${lv.bgm}`);
    if (l) out[id] = l;
  }
  return out;
}
