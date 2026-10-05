// 선발 오퍼레이터 (甄选 / DIY picks, local NAS patch, docs/LOCAL-PATCH.md): asset-plan entries of the candidates of
// data/diy.json (tools/build-diy.mjs), in the shape of docs/research/07-assets.json `operators[charId]` — avatars and
// portraits (E0/E1 + E2), the skill icons of every skill, the Front / Back battle Spine and the sub-profession icon —
// from the same sources (yuanyan3060, fexli, ArknightsAssets2). tools/fetch-assets.mjs adds them before buildPlan, so
// their art, unit SFX (audio_data banks by charId), skill SFX and voice lines are fetched like a pool operator's.

const YUAN = 'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/';
const FEXLI = 'https://raw.githubusercontent.com/fexli/ArknightsResource/main/spine/';
const SUBPROF = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/cn/assets/dyn/arts/ui/subprofessionicon/';
const enc = (s) => String(s).replace(/\[/g, '%5B').replace(/\]/g, '%5D').replace(/#/g, '%23');

/** 07-style operator entries of the diy.json candidates (by charId). */
export function diyOperators(diy) {
  const out = {};
  for (const c of Object.values(diy?.chess || {})) {
    if (!c || c.isGolden || !c.charId || out[c.charId]) continue;
    const id = c.charId;
    const spine = (side) => ({
      skel: { url: `${FEXLI}${id}/${id}/${side}/${id}.skel` },
      atlas: { url: `${FEXLI}${id}/${id}/${side}/${id}.atlas` },
      png: { url: `${FEXLI}${id}/${id}/${side}/${id}.png` },
    });
    out[id] = {
      name: c.name, rarity: `TIER_${c.rarity || 6}`, profession: c.profession, subProfessionId: c.subProfessionId, nationId: c.nationId,
      chess: [], diy: true,
      avatar: { e0e1: { url: `${YUAN}avatar/${id}.png` }, e2: { url: `${YUAN}avatar/${id}_2.png` } },
      portrait: { e0e1: { url: `${YUAN}portrait/${id}_1.png` }, e2: { url: `${YUAN}portrait/${id}_2.png` } },
      skills: (c.skills || []).map((s) => ({ index: s.index, skillId: s.skillId, iconId: s.iconId || s.skillId,
        icon: { url: `${YUAN}skill/skill_icon_${enc(s.iconId || s.skillId)}.png` } })),
      battleSpine: { front: spine('Front'), back: spine('Back') },
      subProfessionIcon: `${SUBPROF}sub_${c.subProfessionId}_icon.png`,
    };
  }
  return out;
}

/** Add the candidates to a loaded 07-assets.json (mutates `assets07.operators`). */
export function addDiyOperators(assets07, diy) {
  if (!assets07 || !diy) return assets07;
  assets07.operators = { ...(assets07.operators || {}), ...diyOperators(diy) };
  return assets07;
}
