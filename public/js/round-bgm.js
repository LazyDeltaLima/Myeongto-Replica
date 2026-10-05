// Per-round 作战 BGM (local NAS patch, docs/LOCAL-PATCH.md). Upstream plays `bgm.combat` — the same
// act1autochess_shop track as 休整期 — in every normal round, so the music never changes between prep and battle.
// The official round levels (wave templates, config.json modes[modeId].rounds[r].template) each declare their own
// bgmEvent: act1autochess_01–07 → bat_kazimierz2_2, h01–h06 → bat_kazimierz2_1, training tr01/tr02 →
// bat_act35side_01. tools/assets/round-bgm.mjs puts them in data/assets.json `audio.waveBgm[templateId]`; here the
// 作战 key becomes `wave:<templateId>`, which audio.js resolveBgm looks up (falling back to `bgm.combat`).

import { getMode } from './data.js';

/**
 * @param {string|null} key bgmKeyFor's result
 * @param {any} pub m.public
 * @returns {string|null} `wave:<templateId>` for a 作战 round with a known template, else `key`
 */
export function roundBgmKey(key, pub) {
  if (key !== 'combat' || !pub) return key;
  const tpl = getMode(pub.modeId)?.rounds?.[String(pub.round)]?.template;
  return typeof tpl === 'string' && tpl ? `wave:${tpl}` : key;
}
