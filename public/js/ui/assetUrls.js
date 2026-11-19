// Asset URL resolution against data/assets.json (docs/ASSETS.md). Pure: every function takes the
// manifest object (or null) and returns a URL string or null — callers draw their own fallback
// (glyph, CSS shape) when null. Only URLs present in the manifest are ever returned, so the client
// never requests files the asset pipeline did not produce (no 404 noise in the console).

const str = (v) => (typeof v === 'string' && v ? v : null);
const obj = (v) => (v && typeof v === 'object' ? v : null);

/** @param {any} m manifest @param {string} key 'group/key' */
export function uiUrl(m, key) {
  return str(obj(obj(m)?.ui)?.[key]);
}

/**
 * Operator avatar for a chess record (golden → E2 art when present). A body that only has E2 art (阿米娅's 医疗 form
 * char_1037_amiya3: the form exists from E2 on, its art is `_2` alone) draws it at every level.
 * @param {any} m manifest
 * @param {any} chess chess.json record (or { assets: { avatar } })
 */
export function chessAvatarUrl(m, chess) {
  const chars = obj(obj(m)?.chars);
  const id = str(chess?.assets?.avatar) || str(chess?.charId);
  if (!chars || !id) return null;
  if (id.endsWith('_2') && !chars[id]) {
    const base = chars[id.slice(0, -2)];
    return str(base?.avatarE2) || str(base?.avatar);
  }
  return str(chars[id]?.avatar) || str(chars[id]?.avatarE2) || (chess?.charId ? str(chars[chess.charId]?.avatar) : null);
}

/**
 * Half-body portrait (180×360) for a chess record (golden → E2 portrait when present; a body with E2 art alone draws
 * it at every level, as chessAvatarUrl).
 * @param {any} m
 * @param {any} chess
 */
export function chessPortraitUrl(m, chess) {
  const chars = obj(obj(m)?.chars);
  const id = str(chess?.assets?.portrait);
  if (!chars) return null;
  if (id) {
    if (id.endsWith('_2')) {
      const base = chars[id.slice(0, -2)];
      if (base) return str(base.portraitE2) || str(base.portrait);
    }
    if (id.endsWith('_1')) {
      const base = chars[id.slice(0, -2)];
      if (base) return str(base.portrait) || str(base.portraitE2);
    }
  }
  const byChar = chess?.charId ? chars[chess.charId] : null;
  if (!byChar) return null;
  return (chess?.isGolden ? str(byChar.portraitE2) : null) || str(byChar.portrait);
}

/** Skill icon of a chess record (manifest `skills[iconId]`, else the empty skill sprite). */
export function skillIconUrl(m, chess) {
  const skills = obj(obj(m)?.skills);
  const id = str(chess?.assets?.skillIcon) || str(chess?.skill?.iconId) || str(chess?.skill?.skillId);
  if (skills && id && skills[id]) return str(skills[id]);
  const byId = obj(obj(m)?.skillsById);
  const alt = byId && chess?.skill?.skillId ? byId[chess.skill.skillId] : null;
  if (skills && alt && skills[alt]) return str(skills[alt]);
  return uiUrl(m, 'skillIcon/empty');
}

/**
 * Skill icon of one skill record (DESIGN §16 `skills[]`: iconId / skillId), else the empty skill sprite — or null with
 * `{ empty: false }` (the asset manifest only carries the default skills' icons: callers then draw a lettered S1–S3
 * tile instead of a blank square).
 */
export function skillRecordIconUrl(m, skill, { empty = true } = {}) {
  const skills = obj(obj(m)?.skills);
  for (const id of [str(skill?.iconId), str(skill?.skillId)]) if (skills && id && skills[id]) return str(skills[id]);
  const byId = obj(obj(m)?.skillsById);
  const alt = byId && skill?.skillId ? byId[skill.skillId] : null;
  if (skills && alt && skills[alt]) return str(skills[alt]);
  return empty ? uiUrl(m, 'skillIcon/empty') : null;
}

/**
 * Skill icon of the skill a unit fights with: the loadout's chosen skill (chessLoadout `lo`; null when the manifest
 * lacks its icon) or, for the default skill, the record's own (`body`: the chess or its stand-in).
 */
export function loadoutSkillIconUrl(m, lo, body) {
  return lo?.skill && !lo.defaultSkill ? skillRecordIconUrl(m, lo.skill, { empty: false }) : skillIconUrl(m, body);
}

const PROF_KEY = {
  PIONEER: 'pioneer', WARRIOR: 'warrior', TANK: 'tank', SNIPER: 'sniper', CASTER: 'caster', MEDIC: 'medic',
  SUPPORT: 'support', SPECIAL: 'special',
};

/** Profession icon (small white glyph). */
export function profIconUrl(m, profession) {
  const k = PROF_KEY[String(profession || '').toUpperCase()];
  return k ? str(obj(obj(obj(m)?.prof)?.icon)?.[k]) : null;
}

/** Square profession glyph (manifest `prof.large`: a black glyph on white, drawn as a white one by loadout.css). */
export function profGlyphUrl(m, profession) {
  const v = obj(obj(obj(m)?.prof)?.large)?.[String(profession || '').toLowerCase()];
  return str(v);
}

/** Sub-profession icon from a chess record (`assets.subProfIcon` = 'sub_<id>_icon'). */
export function subProfIconUrl(m, chess) {
  const sub = obj(obj(obj(m)?.prof)?.sub);
  if (!sub) return null;
  const raw = str(chess?.assets?.subProfIcon);
  const id = raw ? raw.replace(/^sub_/, '').replace(/_icon$/, '') : str(chess?.subProfessionId);
  return id ? str(sub[id]) : null;
}

/** Bond glyph (white; tint in CSS). */
export function bondIconUrl(m, bondId) {
  return bondId ? str(obj(obj(m)?.bonds)?.[bondId]) : null;
}

/** Band (strategy) icon. */
export function bandIconUrl(m, bandId) {
  return bandId ? str(obj(obj(m)?.bands)?.[bandId]) : null;
}

/** Item icon for an items.json record (by trapId / iconId) or a raw trap id. */
export function itemIconUrl(m, item) {
  const items = obj(obj(m)?.items);
  if (!items) return null;
  if (typeof item === 'string') return str(items[item]);
  return str(items[item?.iconId]) || str(items[item?.trapId]);
}

/** Enemy icon (manifest keeps fallbacks resolved). */
export function enemyIconUrl(m, enemyKey) {
  const e = enemyKey ? obj(obj(obj(m)?.enemies)?.[enemyKey]) : null;
  if (e?.icon) return str(e.icon);
  // `_2` / `_3` variants fall back to their base enemy
  const base = typeof enemyKey === 'string' ? enemyKey.replace(/_\d+$/, '') : null;
  return base && base !== enemyKey ? str(obj(obj(obj(m)?.enemies)?.[base])?.icon) : null;
}

/** Token avatar, falling back to its owner operator's avatar. */
export function tokenAvatarUrl(m, tokenId) {
  const tokens = obj(obj(m)?.tokens);
  const t = tokenId ? obj(tokens?.[tokenId]) : null;
  if (t?.avatar) return str(t.avatar);
  if (t?.owner) return str(obj(obj(obj(m)?.chars)?.[t.owner])?.avatar);
  return null;
}

/** Faction (特训敌人 type) icon: `enemyTypeIcon/<icon>`. */
export function factionIconUrl(m, iconId) {
  return iconId ? uiUrl(m, `enemyTypeIcon/${iconId}`) : null;
}

/** Title (评语) icon: `titleIcon/<picId>`. */
export function titleIconUrl(m, picId) {
  return picId ? uiUrl(m, `titleIcon/${picId}`) : null;
}

/** Greek type letters of some modules (ISW-α, …) → the Latin letter of the client's icon file names (isw-a). */
const GREEK = { 'α': 'a', 'β': 'b', 'γ': 'g', 'δ': 'd', 'Δ': 'd' };
/** Lower-cased key → path index of a local `groups.module` object (built once per manifest object). */
const moduleIconIndex = new WeakMap();

/**
 * Official module (uniequip) TYPE icon from the local-client art (DESIGN §13 / §16): `data/local-assets.json`
 * `groups.module[<type>]`, matched case-insensitively against the module's typeName ('MAR-X' → key 'mar-x', 'PRI-X' →
 * key 'PRI-X' — the client's file names are mixed case). null when the manifest, the group or the entry is missing
 * (callers draw the lettered tile / type text instead).
 * @param {any} local the local-art manifest (`data.get('local')`) or null
 * @param {string} typeName e.g. 'MAR-X'
 */
export function moduleTypeIconUrl(local, typeName) {
  const g = obj(obj(obj(local)?.groups)?.module);
  const t = str(typeName)?.trim();
  if (!g || !t) return null;
  const exact = str(obj(g[t])?.path);
  if (exact) return exact;
  let idx = moduleIconIndex.get(g);
  if (!idx) {
    idx = new Map();
    for (const [k, v] of Object.entries(g)) {
      const p = str(obj(v)?.path);
      if (p && !idx.has(k.toLowerCase())) idx.set(k.toLowerCase(), p);
    }
    moduleIconIndex.set(g, idx);
  }
  const key = t.replace(/[αβγδΔ]/g, (c) => GREEK[c]).toLowerCase();
  return idx.get(key) || null;
}

/**
 * Icon folders of a later season's own extract (tools/local-extract/season_ui.py `icons`: data/local-assets.json
 * groups `season/<id>/<folder>`) → the data/assets.json `ui` group whose slot they fill. The season's pictures take that
 * slot when its screens are up (maintainer decision 2026-11-08: the new medals and icons in the new season only); the
 * folders come out of the same autochess bundles as the EN ones, so a name means the same thing in both. Two folders
 * keep the EN art: `modeicon` (the 规程 glyphs are white and larger, tinted by its new 协议 choice view) and
 * `bondboardicon` (its bond ring comes in white pieces: the extract composes them into `bondboard`, below) — those
 * screens are still drawn after 盟约's prefabs.
 */
export const SEASON_UI_FOLDERS = Object.freeze({
  garrisontypeicon: 'garrisonTypeIcon', medalicon: 'medalIcon', enemytypeicon: 'enemyTypeIcon', bufficon: 'buffIcon',
  shoplevelsprite: 'shopLevelSprite', chesslevelsprite: 'chessLevelSprite',
  // the season's default UI theme (ac_n_initial for 规程; maintainer decision 2026-11-10): the shop and the 🔍 buttons
  // (ui/shopArt.js, ui/hud.js), and the bond disc boards composed from its pieces (ui/hudArt.js bondBoardStyle)
  skin: 'seasonSkin', bondboard: 'seasonBondBoard',
  // the 3/3 确定自选编队 screen (screens/diyChoose.js): its tier marks, and the sprites its prefabs and the 干员调配 card show
  // (season_ui.py 'prefabs': plain and atlas images)
  diychooselevelsprite: 'diyChooseLevelSprite', diychoose: 'diyChooseArt',
  // the 自选编队 window's lineup (screens/diy.js: the row bands and tags, the empty slot) and the card's level column
  // (ui/diyCard.js: the promotion phases and the 潜能 icons the client sets at run time — season_ui.py 'named')
  diylineup: 'diyLineupArt',
  // no screen of ours draws these yet (模式说明 titles, bond phase marks)
  modeinfotitle: 'modeInfoTitle', bondphaseicon: 'bondPhaseIcon',
});

/**
 * The asset manifest as a later season's screens read it: `m` with the season's own icons (local-client extract
 * `local`, groups `season/<season>/…`) over the 盟约 ones — strategies by the season's band records' iconId, bonds by
 * theirs, items (equipment) by icon / trap id, and the ui groups of SEASON_UI_FOLDERS. `m` itself when the extract has
 * none of them (a server without the season's art draws what it always drew; a record the extract lacks keeps its
 * 盟约 icon or none). Pure: a new object, `m` is never changed.
 * @param {any} m data/assets.json
 * @param {any} local data/local-assets.json
 * @param {string} season a season id other than the default
 * @param {{ bands?: any[], bonds?: any[] }} [records] the season's band and bond records ({ bandId|bondId, iconId })
 */
export function withSeasonArt(m, local, season, records = {}) {
  const groups = obj(obj(local)?.groups);
  if (!obj(m) || !groups || !str(season)) return m;
  const group = (folder) => obj(groups[`season/${season}/${folder}`]);
  const at = (g, name) => (g && name && Object.hasOwn(g, name) ? str(obj(g[name])?.path) : null);
  const bandIcons = group('bandicon');
  const bondIcons = group('bondicon');
  const itemIcons = group('shopitemicon');
  const ui = Object.entries(SEASON_UI_FOLDERS).map(([folder, key]) => [group(folder), key]).filter(([g]) => g);
  if (!bandIcons && !bondIcons && !itemIcons && !ui.length) return m;
  const out = { ...m, bands: { ...obj(m.bands) }, bonds: { ...obj(m.bonds) }, items: { ...obj(m.items) }, ui: { ...obj(m.ui) } };
  for (const b of Array.isArray(records.bands) ? records.bands : []) {
    const p = at(bandIcons, str(b?.iconId));
    if (!p) continue;
    if (str(b?.bandId)) out.bands[b.bandId] = p;
    // an effect names its strategy by the icon (effectIconUrl 'band'), which 规程 no longer derives from the band id
    if (!Object.hasOwn(out.bands, b.iconId)) out.bands[b.iconId] = p;
  }
  for (const b of Array.isArray(records.bonds) ? records.bonds : []) {
    const p = at(bondIcons, str(b?.iconId));
    if (p && str(b?.bondId)) out.bonds[b.bondId] = p;
  }
  for (const name of Object.keys(itemIcons ?? {})) {
    const p = at(itemIcons, name);
    if (p) out.items[name] = p;
  }
  for (const [g, key] of ui) {
    for (const name of Object.keys(g)) {
      const p = at(g, name);
      if (p) out.ui[`${key}/${name}`] = p;
    }
  }
  return out;
}

/** The season whose 3/3 确定自选编队 art (SEASON_UI_FOLDERS diychoose, diychooselevelsprite) a season without its own
 * draws: 盟约's client has no such screen, and since 盟约 took the step it shows 规程's (maintainer decision 2026-11-19).
 * The 自选编队 tab's lineup art (diylineup) comes with it: the tab draws the same card in both seasons. */
const DIY_CHOOSE_ART_SEASON = 'act3autochess';
const DIY_CHOOSE_FOLDERS = Object.freeze(['diychoose', 'diychooselevelsprite', 'diylineup']);
/** @type {WeakMap<object, { local: any, value: any }>} */
const diyChooseMemo = new WeakMap();

/**
 * The manifest as the 3/3 screen and the 自选编队 tab read it (screens/diyChoose.js, screens/diy.js): `m` with 规程's
 * 3/3 and lineup art (withSeasonArt of the folders above, from its extract `season/act3autochess/…`) when `m` has none of its own — the default season, whose
 * manifest the data store hands over as the file (data.js ownSeasonAssets). `m` itself when it has the art (规程's view)
 * or the extract lacks it (the CSS then draws plain fills). Built once per manifest and extract.
 * @param {any} m data/assets.json (or a season's view of it) @param {any} local data/local-assets.json
 */
export function withDiyChooseArt(m, local) {
  if (!obj(m)) return m;
  const hit = diyChooseMemo.get(m);
  if (hit && hit.local === local) return hit.value;
  const own = Object.keys(obj(m.ui) ?? {}).some((k) => k.startsWith('diyChooseArt/'));
  const groups = obj(obj(local)?.groups) ?? {};
  const keys = DIY_CHOOSE_FOLDERS.map((f) => `season/${DIY_CHOOSE_ART_SEASON}/${f}`).filter((k) => obj(groups[k]));
  const value = own || !keys.length ? m : withSeasonArt(m, { groups: Object.fromEntries(keys.map((k) => [k, groups[k]])) }, DIY_CHOOSE_ART_SEASON);
  diyChooseMemo.set(m, { local, value });
  return value;
}

/**
 * The icon of a 特训敌人 type another season lends (shared/seasonBorrow.js): the manifest's own (factionIconUrl), else
 * the lending season's extract (`season/<season>/enemytypeicon`, local-assets.json) — 规程's CRITIC / REBORN icons
 * exist only there. @param {any} m @param {any} local @param {string} season @param {string} iconId
 */
export function lentTypeIconUrl(m, local, season, iconId) {
  const own = factionIconUrl(m, iconId);
  if (own || !iconId || !str(season)) return own;
  return str(obj(obj(obj(obj(local)?.groups)?.[`season/${season}/enemytypeicon`])?.[iconId])?.path);
}

/**
 * The manifest with the icons of the 特训敌人 types a match borrows (`types`: [season, iconId]) where it lacks them
 * (lentTypeIconUrl) — what the briefing and the enemy drawer read in a match that borrows them. `m` itself when none
 * is missing. @param {any} m @param {any} local @param {[string, string][]} types
 */
export function withLentTypeIcons(m, local, types) {
  if (!obj(m)) return m;
  const add = types.filter(([, icon]) => icon && !factionIconUrl(m, icon))
    .map(([season, icon]) => [icon, lentTypeIconUrl(m, local, season, icon)]).filter(([, p]) => p);
  if (!add.length) return m;
  const ui = { ...obj(m.ui) };
  for (const [icon, p] of add) ui[`enemyTypeIcon/${icon}`] = p;
  return { ...m, ui };
}

/**
 * Icon for an m.private.effects entry: { iconKind: 'band'|'choice'|'team'|'item'|'garrison', iconId }.
 * @param {any} m
 * @param {{ iconKind?: string, iconId?: string }} eff
 */
export function effectIconUrl(m, eff) {
  const kind = eff?.iconKind;
  const id = str(eff?.iconId);
  if (kind === 'band') return bandIconUrl(m, id) || (id && id.startsWith('icon_') ? bandIconUrl(m, `band_${id.slice(5)}`) : null);
  if (kind === 'item') return itemIconUrl(m, id);
  if (kind === 'garrison') return uiUrl(m, `garrisonTypeIcon/${id || 's_icon_bond'}`) || uiUrl(m, 'garrisonTypeIcon/s_icon_bond');
  if (kind === 'team') return uiUrl(m, `buffIcon/${id && id.startsWith('icon_') ? id : 'icon_team_buff'}`);
  if (kind === 'choice') return uiUrl(m, `buffIcon/${id && id.startsWith('icon_') ? id : 'icon_player_buff'}`);
  return id ? uiUrl(m, `buffIcon/${id}`) : null;
}
