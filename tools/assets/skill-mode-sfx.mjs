// Skill-mode attack / impact sounds and mixer groups (local patch, docs/LOCAL-PATCH.md 「스킬 모드 효과음·믹서 볼륨」).
//
// The official client sounds an operator's attacks through its current attack mode (research 2026-10-07,
// maintainer's notes 2026-10-07 §1–2):
//   * banks `battle.ON_ABILITY_START|ON|HIT.<charId>.attack.<n>[.<sub>]`, n = the mode's index in the character prefab's
//     `_modes` list (tools/local-extract/char_modes.py → tools/assets/local-char-modes.json). A skill's mode is the one
//     named `S<k>` (or `S<a>-<b>`, `Sk<k>`, `S<k>_…`) for skill k; a ranged mode's impact is its projectile's bank
//     `battle.ON_PROJECTILE_HIT.<key>` (the projectile keys under the mode in the prefab).
//   * a skill that switches no mode but fires an attack ability of its own sounds `battle.ON_ABILITY_*.<skillId>` on
//     those attacks — only banks on the attack / impact mixer groups count as such (a buff skill's one-shot sits on
//     Battle_UI_Boost / Battle_Skill_Important and stays its start sound).
//   * every bank carries a mixer group (`customMixerGroup`): the client mixes by it (public/js/audioOfficial.js).
// plan.mjs (upstream) calls these through short local-patch lines: sfx.units[id].modes / .grp, sfx.kitGrp.
//
//   modes[i] = { attack?, hit?, mix?: { attack?, hit? }, grp?: { attack?, hit? }, deferStart?: true }  (i = skill index)
//   (+ cues / sel, and sub: { [fx kind]: { cues, sel? } } — 2026-10-29, shared/skill-modes.js SKILL_SUB_MODES)
//   deferStart: the skill's start sound is only a fallback (skill-sfx.mjs, no ON_SKILL_START) and the skill has attack /
//   impact sounds of its own — the client plays that start sound only for a skill that ends without an attack.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const LOCAL_CHAR_MODES_FILE = 'tools/assets/local-char-modes.json';
/** Mixer groups of an attack / impact (the banks a skill ability without a mode may sound on its attacks). */
const ATTACK_GROUPS = new Set(['Battle_P_SAtk', 'Battle_P_NAtk']);
const IMPACT_GROUPS = new Set(['Battle_P_SImp', 'Battle_P_NImp']);

/** tools/assets/local-char-modes.json → { [charId]: { modes: string[], proj: string[][] } } ({} when absent). */
export function loadCharModes(root = process.cwd()) {
  const f = join(root, LOCAL_CHAR_MODES_FILE);
  if (!existsSync(f)) return {};
  try {
    const doc = JSON.parse(readFileSync(f, 'utf8'));
    delete doc.$comment;
    return doc;
  } catch { return {}; }
}

export { skillModeIndex } from '../../shared/skill-modes.js'; // the same rule as the effect layer (render/fxgame.js)
import { skillModeIndex, SKILL_SUB_MODES } from '../../shared/skill-modes.js';

/** Sub-ability order: the plain key first, then deeper keys with numeric parts ascending (audio.mjs abilityOrder). */
const order = (a, b) => (a.split('.').length - b.split('.').length) || a.localeCompare(b, 'en', { numeric: true });

/** The first bank of a unit's table under `key` (exact, else its numbered sub-abilities), or null. */
function unitBank(banks, key) {
  if (!banks) return null;
  if (banks.get(key)?.length) return banks.get(key);
  const sub = [...banks.keys()].filter((k) => k.startsWith(key + '.')).sort(order);
  for (const k of sub) if (banks.get(k)?.length) return banks.get(k);
  return null;
}

const firstNonEmpty = (lists) => lists.find((p) => Array.isArray(p) && p.length) || null;

/**
 * (2026-10-10, docs/rules/audio.md 「START·ON·HIT」): the ON bank of an ability that also has a START bank —
 * the client emits START, ON (AbilityStandard.DoEmitAudioSignalForSpellOn) and HIT
 * (DoEmitAudioSignalForHit) each on its own and the middleware (TorappuAudioMiddleware.PlayEvent)
 * plays every bank of the name: both sound, whatever the ON bank's mixer group (耀骑士临光 S3 attack.3
 * p_atk_goldspear_s + p_imp_goldspear_s). Replaces the 2026-10-08 rule that played an impact-group ON bank as the impact.
 * @param {Map<string, string[]>|undefined} banks a unit's bank table
 * @param {string} ability e.g. 'attack.3' or 'attack'
 * @returns {string[]|null}
 */
export function onBeside(banks, ability) {
  if (!banks || !banks.get(`ON_ABILITY_START.${ability}`)?.length) return null;
  const on = banks.get(`ON_ABILITY_ON.${ability}`);
  return on?.length ? on : null;
}

/**
 * Attack / impact sound paths of mode `n` of an operator.
 * @param {{ unitBanks: Map<string, Map<string, string[]>>, bank: (name: string) => string[] }} audio indexed audio_data
 * @param {string} charId
 * @param {number} n mode index (≥ 1)
 * @param {string[]} [projKeys] the projectile keys the mode fires
 * @returns {{ attack?: string[], hit?: string[] }}
 */
export function modeSounds(audio, charId, n, projKeys = []) {
  const banks = audio.unitBanks.get(charId);
  const keys = Array.isArray(projKeys) ? projKeys : [];
  const attack = unitBank(banks, `ON_ABILITY_START.attack.${n}`) ?? unitBank(banks, `ON_ABILITY_ON.attack.${n}`)
    ?? firstNonEmpty(keys.map((k) => audio.bank(`battle.ON_PROJECTILE_BORN.${k}`)));
  const hit = unitBank(banks, `ON_ABILITY_HIT.attack.${n}`) ?? firstNonEmpty(keys.map((k) => audio.bank(`battle.ON_PROJECTILE_HIT.${k}`)));
  const on = onBeside(banks, `attack.${n}`); // 2026-10-10: START and ON both sound
  const out = {};
  if (attack) out.attack = attack;
  if (on) out.on = on;
  if (hit) out.hit = hit;
  return out;
}

/**
 * Attack / impact sound paths of a skill's own ability (a skill switching no mode), kept only on the attack / impact
 * mixer groups.
 * @param {{ bank: (name: string) => string[], groupOf: (p: string[]) => string|null }} audio
 * @param {string} skillId
 */
export function abilitySounds(audio, skillId) {
  const SUBS = ['', '.0', '.1', '.2', '.0.1', '.1.0'];
  const find = (events, groups) => {
    for (const ev of events) {
      for (const s of SUBS) {
        const p = audio.bank(`battle.${ev}.${skillId}${s}`);
        if (p && p.length && groups.has(audio.groupOf(p))) return p;
      }
    }
    return null;
  };
  const out = {};
  const attack = find(['ON_ABILITY_START', 'ON_ABILITY_ON'], ATTACK_GROUPS);
  const hit = find(['ON_ABILITY_HIT'], IMPACT_GROUPS);
  // 2026-10-10: a START swing's ON bank sounds too (onBeside), on an attack or an impact group
  const on = attack && find(['ON_ABILITY_START'], ATTACK_GROUPS) === attack ? find(['ON_ABILITY_ON'], new Set([...ATTACK_GROUPS, ...IMPACT_GROUPS])) : null;
  if (attack) out.attack = attack;
  if (on && on !== attack) out.on = on;
  if (hit) out.hit = hit;
  return out;
}

/**
 * sfx.units[charId].modes: per skill index, its attack / impact sounds (mode banks, else its own attack ability).
 * @param {object} audio indexed audio_data (audio.mjs indexAudio)
 * @param {string} charId
 * @param {{ index: number, skillId?: string }[]} skills the character's skills (research 07 operators[id].skills)
 * @param {{ modes?: string[], skillMode?: (number|null)[], proj?: string[][] }|undefined} info local-char-modes.json entry
 * @param {(paths: string[]) => any} soundLeaf plan.mjs leaf builder
 * @param {(skillId: string) => boolean} startIsFallback the skill's start sound is not its own ON_SKILL_START
 */
export function skillModes(audio, charId, skills, info, soundLeaf, startIsFallback = () => false, ca = null) {
  const out = {};
  for (const s of Array.isArray(skills) ? skills : []) {
    if (!s || !Number.isInteger(s.index)) continue;
    const n = info ? skillModeIndex(info.modes, s.index, info.skillMode) : -1;
    const found = n > 0 ? modeSounds(audio, charId, n, info.proj?.[n]) : s.skillId ? abilitySounds(audio, s.skillId) : {};
    // 2026-10-10, docs/rules/audio.md 「공격 소리 신호」: the mode's attack signals as cues (soundSet) — a skill mode
    // whose signal has no bank and fires no sounding projectile attacks in silence (`cues: []`, the client's middleware has no
    // fallback; 안젤리나 S2 / S3, 사리아 S3 … used to sound the Default); a skill without a mode: its own ability's banks, every
    // sub-key (abilityCues — 혼 S1 skchr_horn_1.2.1, 데겐블레허 S3 .1.1 / .2 / .extra.0)
    const set = ca && n > 0 ? soundSet(audio, charId, ca, n, soundLeaf) : ca && s.skillId ? { cues: abilityCues(audio, s.skillId, soundLeaf) } : null;
    if (!found.attack && !found.hit && !(set && (n > 0 || set.cues.length))) continue;
    const e = {};
    if (set && (n > 0 || set.cues.length)) { e.cues = set.cues; if (set.sel) e.sel = set.sel; }
    // 2026-10-29: the modes the skill switches to on the way (SKILL_SUB_MODES), by the sim fx that marks the switch
    if (set && n > 0) {
      const sub = {};
      for (const [fx, name] of Object.entries(SKILL_SUB_MODES[charId] || {})) {
        const m = info.modes.indexOf(name);
        if (m <= 0 || !name.startsWith(`${info.modes[n]}_`)) continue;
        const ss = soundSet(audio, charId, ca, m, soundLeaf);
        sub[fx] = ss.sel ? { cues: ss.cues, sel: ss.sel } : { cues: ss.cues };
      }
      if (Object.keys(sub).length) e.sub = sub;
    }
    const mix = {}, grp = {};
    for (const r of ['attack', 'on', 'hit']) { // 2026-10-10: + on
      if (!found[r]) continue;
      e[r] = soundLeaf(found[r]);
      const m = typeof audio.mixOf === 'function' ? audio.mixOf(found[r]) : null;
      if (m) mix[r] = m;
      const g = typeof audio.groupOf === 'function' ? audio.groupOf(found[r]) : null;
      if (g) grp[r] = g;
    }
    if (Object.keys(mix).length) e.mix = mix;
    if (Object.keys(grp).length) e.grp = grp;
    if (s.skillId && startIsFallback(s.skillId)) e.deferStart = true;
    // local patch (maintainer report 2026-10-08): a mode ability with its own attack bank and no impact bank (缄默德克萨斯 S2
    // attack.2: ON_ABILITY_ON only) — the Default ability's HIT bank does not fire while the mode runs: no impact sound
    if (n > 0 && found.attack && !found.hit) e.noHit = true;
    out[String(s.index)] = e;
  }
  return Object.keys(out).length ? out : null;
}

/** A unit bank of an attack ability: `ON_ABILITY_START|ON|HIT.attack|combat[.<n>…]`. */
const ATTACK_BANK = /^ON_ABILITY_(?:START|ON|HIT)\.(?:attack|combat)(?:\.(\d+))?(?:\.|$)/;
/** A skill's mode name (`S<k>…`, `Sk<k>…`); talent modes (靛 Default_T1) are normal attacks. */
const SKILL_MODE = /^Sk?\d/i;

/**
 * Normal attacks sound from the Default mode only (maintainer report 2026-10-07: 银灰's S3 p_atk_silver_n on every attack):
 * a unit bank table without the attack banks of its skill modes (`ON_ABILITY_*.attack|combat.<n>…`, modes[n] a skill's
 * mode). `.attack.0…` (Default with `_includeIndexZero`) and talent modes stay. Unchanged without mode info. A Default
 * mode with no attack bank and no projectile bank sounds nothing — 玛恩纳 / 蜜蜡 / 薄绿 / 卡涅利安 / sbell2 (2026-10-10:
 * the client builds the signal id from the mode index, UnitMode.GenerateSignalId, and the middleware
 * has no fallback — their old pick, a skill mode's `_n` file, is gone).
 * @param {Map<string, string[]>|undefined} banks audio.unitBanks.get(charId)
 * @param {{ modes?: string[] }|undefined} info local-char-modes.json entry
 */
export function defaultModeBanks(banks, info) {
  if (!banks || !Array.isArray(info?.modes) || info.modes.length < 2) return banks;
  return new Map([...banks].filter(([k]) => {
    const m = ATTACK_BANK.exec(k);
    return !m || m[1] == null || !SKILL_MODE.test(info.modes[+m[1]] || '');
  }));
}

/**
 * sfx.units[id].grp: the mixer group of each role's bank ({ attack, hit, die, born } of pickUnitSfx, and
 * `skills: { [index]: group }` for the skill start sounds), or null.
 * @param {{ groupOf: (p: string[]) => string|null }} audio
 * @param {Record<string, string[]>} roles pickUnitSfx result
 * @param {Record<string, string[]>} [skillPaths] skill index → start sound paths
 */
export function unitGroups(audio, roles, skillPaths = {}) {
  if (typeof audio.groupOf !== 'function') return null;
  const out = {};
  for (const r of ['attack', 'on', 'hit', 'die', 'born']) { const g = roles?.[r] ? audio.groupOf(roles[r]) : null; if (g) out[r] = g; } // 2026-10-10: + on
  const sk = {};
  for (const [i, p] of Object.entries(skillPaths || {})) { const g = audio.groupOf(p); if (g) sk[i] = g; }
  if (Object.keys(sk).length) out.skills = sk;
  return Object.keys(out).length ? out : null;
}

/** Events of a skill's looping bank (the loop runs while the skill does). */
const LOOP_EVENTS = 'ON_SKILL_START|ON_ABILITY_START|ON_ABILITY_ON|ON_ABILITY_END|ON_BUFF_START|ON_CUSTOM_TRIGGER'; // ON_ABILITY_END: 烛煌 S3's field after its cast

/**
 * sfx.units[charId].loops: per skill index, the official looping bank the skill keeps playing while it runs (丰川祥子 S3's
 * music `ON_BUFF_START.oblvns_s_3[loop]`, the fields `ON_ABILITY_START.skchr_lisa_3` / `ON_SKILL_START.skchr_cello_3` …):
 * { url, grp?, vol?, start? } — `start` = it is also the skill's start sound (the client then plays it only as the loop).
 * @param {{ loopBanks?: { name: string, paths: string[] }[], groupOf?: Function, mixOf?: Function }} audio
 * @param {string} charId
 * @param {{ index: number, skillId?: string }[]} skills
 * @param {(paths: string[]) => any} soundLeaf
 * @param {Record<string, string[]>} [startPaths] skill index → its start sound paths (plan.mjs skillPaths)
 */
export function skillLoops(audio, charId, skills, soundLeaf, startPaths = {}) {
  const banks = Array.isArray(audio.loopBanks) ? audio.loopBanks : [];
  if (!banks.length) return null;
  const short = String(charId).replace(/^char_\d+_/, '');
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const out = {};
  for (const s of Array.isArray(skills) ? skills : []) {
    if (!s || !Number.isInteger(s.index)) continue;
    const res = [];
    if (s.skillId) res.push(new RegExp(`^battle\\.(${LOOP_EVENTS})\\.${esc(s.skillId)}(\\.\\d+)?(\\[.*\\])?$`));
    res.push(new RegExp(`^battle\\.ON_BUFF_START\\.${esc(short)}_s_${s.index + 1}(\\[.*\\])?$`));
    const b = banks.find((x) => res.some((re) => re.test(x.name)));
    if (!b) continue;
    const e = { url: soundLeaf(b.paths) };
    const g = typeof audio.groupOf === 'function' ? audio.groupOf(b.paths) : null;
    if (g) e.grp = g;
    const m = typeof audio.mixOf === 'function' ? audio.mixOf(b.paths) : null;
    if (m && Number.isFinite(m.vol)) e.vol = m.vol;
    if (startPaths[String(s.index)] === b.paths) e.start = true;
    out[String(s.index)] = e;
  }
  return Object.keys(out).length ? out : null;
}

/** Mixer groups of a skill's own one-shot (not an attack / impact): its start-like sounds. */
const EXTRA_GROUPS = new Set(['Battle_Skill_Important', 'Battle_UI_Boost', 'Battle_P_Field']);
/** The shared start cues (b_char_atkboost / tactboost …): every skill's generic sound, never a skill's own extra. */
const GENERIC_CUE = /^battle\/b_char\//;

/**
 * local patch (maintainer report 2026-10-08: 耀骑士临光 S3, 塑心 S3 「스킬 음악이 안 나온다」) sfx.units[charId].extras: per skill
 * index, the official one-shot banks the skill plays as it starts besides its start sound (`skills[i]`) and its loop
 * (`loops[i]`), which plan.mjs never picked:
 *   - its own ability's start `ON_ABILITY_START.<skillId>` on a skill mixer group when the skill also has its own
 *     ON_SKILL_START (耀骑士临光 S3: ON_SKILL_START b_char_atkboost + ON_ABILITY_START p_skill_goldspearboost1, 5.8 s;
 *     塑心 S3 p_skill_shphrtcltrill) — the client fires the skill's ability as the skill starts [추정: same moment];
 *   - a bank a control bank cuts at the skill's end (`ON_SKILL_FINISH|ON_ABILITY_END.<skillId>` ctrlStop): 塑心 S3's
 *     melody `ON_BUFF_START.cello_s_3[audio]` (p_skill_shphrtcltrillmelody 20.4 s, cut 0.2 s), 莫斯提马 S2's layer.
 * [{ url, grp?, vol?, stop? }] — `stop` = the fade (s) the client cuts it with when the skill ends.
 * @param {{ bank: (n: string) => string[], groupOf?: Function, mixOf?: Function, isLoop?: Function, ctrlStops?: { name: string, by: string, fade: number }[] }} audio
 * @param {string} charId
 * @param {{ index: number, skillId?: string }[]} skills
 * @param {(paths: string[]) => any} soundLeaf
 * @param {Record<string, string[]>} [startPaths] skill index → its start sound paths (plan.mjs skillPaths)
 */
export function skillExtras(audio, charId, skills, soundLeaf, startPaths = {}) {
  const groupOf = (p) => (typeof audio.groupOf === 'function' ? audio.groupOf(p) : null);
  const isLoop = (n) => (typeof audio.isLoop === 'function' ? audio.isLoop(n) : false);
  const out = {};
  for (const s of Array.isArray(skills) ? skills : []) {
    if (!s || !Number.isInteger(s.index) || !s.skillId) continue;
    const start = startPaths[String(s.index)];
    const found = new Map(); // bank name → { paths, stop? }
    const own = `battle.ON_ABILITY_START.${s.skillId}`;
    const op = audio.bank(own);
    if (op?.length && op !== start && EXTRA_GROUPS.has(groupOf(op)) && !GENERIC_CUE.test(op[0]) && !isLoop(own)) found.set(own, { paths: op });
    const ends = new Set([`battle.ON_SKILL_FINISH.${s.skillId}`, `battle.ON_ABILITY_END.${s.skillId}`]);
    for (const c of Array.isArray(audio.ctrlStops) ? audio.ctrlStops : []) {
      if (!ends.has(c.by) || isLoop(c.name)) continue;
      const p = audio.bank(c.name);
      if (!p?.length || p === start || GENERIC_CUE.test(p[0])) continue;
      found.set(c.name, { paths: p, stop: Math.max(0, Number(c.fade) || 0) });
    }
    const list = [];
    for (const { paths, stop } of found.values()) {
      const e = { url: soundLeaf(paths) };
      const g = groupOf(paths);
      if (g) e.grp = g;
      const m = typeof audio.mixOf === 'function' ? audio.mixOf(paths) : null;
      if (m && Number.isFinite(m.vol)) e.vol = m.vol;
      if (stop != null) e.stop = stop;
      list.push(e);
    }
    if (list.length) out[String(s.index)] = list;
  }
  return Object.keys(out).length ? out : null;
}

/** The mixer groups outside the BattleGameSound bus a snapshot filters (MainMixer: Independent / _2 under ~FX_VolumeControl). */
const OUTSIDE_GROUPS = new Set(['Independent', 'Independent_2']);
// a plan.mjs template leaf ({ alts: [{ rel }] }, resolved by fetch-assets to `/assets/<rel>` of the alternative it keeps) or
// an already resolved url / list of urls
const leafUrls = (l) => (typeof l === 'string' ? [l] : Array.isArray(l) ? l.flatMap(leafUrls)
  : Array.isArray(l?.alts) ? l.alts.map((a) => (typeof a?.rel === 'string' ? `/assets/${a.rel}` : null)).filter(Boolean) : []);

/** VOICE_DIRS key (tools/assets/audio.mjs) → the dub id of audio_data soundFxVoiceLang. */
const DUB_IDS = Object.freeze({ cn: 'CN_MANDARIN', jp: 'JP', en: 'EN', kr: 'KR' });
const dubBanks = new WeakMap(); // a dub entry → its bank name (snapshotSfx: the dub's own snapshot hook)

/**
 * docs/rules/audio.md 「더빙 효과음」: sfx.units[charId].dub = { [lang]: { born?: e, skills?: { [index]: e } } },
 * e = { url, grp? } — the bank the client plays in place of the character's deploy (ON_UNIT_BORN) / skill start
 * (ON_SKILL_START) sound when its voice is in that dub (audio_data soundFxVoiceLang; the client's
 * BattleController.PlayAudioAtPos → VoiceLangManager.TryHookAudioByFxLang replaces the signal, one bank plays). 浊心斯卡蒂:
 * the tide / deploy sound with her 作战中 / 部署 line mixed in (Voice_KR/char_1012_skadi2/FX_025_3 …), Independent group.
 * @param {{ dubsOf?: (bank: string, charId: string) => Record<string, string>|null, bank: (n: string) => string[],
 *   groupOf?: (paths: string[]) => string|null }} audio audio.mjs indexAudio
 * @param {string} charId
 * @param {{ index: number, skillId?: string }[]} skills
 * @param {string[]} langs the planned dubs (VOICE_DIRS keys)
 * @param {(paths: string[], lang: string) => any} dubLeaf plan.mjs: the dub's files under audio/voice/<lang>/
 */
export function dubbedSfx(audio, charId, skills, langs, dubLeaf) {
  if (typeof audio?.dubsOf !== 'function') return null;
  const entry = (base, lang) => {
    const name = audio.dubsOf(base, charId)?.[DUB_IDS[lang]];
    const paths = typeof name === 'string' ? audio.bank(name) : [];
    const url = paths.length ? dubLeaf(paths, lang) : null;
    if (!url) return null;
    const e = { url };
    const g = typeof audio.groupOf === 'function' ? audio.groupOf(paths) : null;
    if (g) e.grp = g;
    dubBanks.set(e, name);
    return e;
  };
  const out = {};
  for (const lang of [...new Set(langs || [])]) {
    const d = {};
    const born = entry(`battle.ON_UNIT_BORN.${charId}`, lang);
    if (born) d.born = born;
    const sk = {};
    for (const s of Array.isArray(skills) ? skills : []) {
      if (!s?.skillId || !Number.isInteger(s.index)) continue;
      const e = entry(`battle.ON_SKILL_START.${s.skillId}`, lang);
      if (e) sk[String(s.index)] = e;
    }
    if (Object.keys(sk).length) d.skills = sk;
    if (Object.keys(d).length) out[lang] = d;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * local patch (maintainer report follow-up, 归溟幽灵鲨's switch to her 替身): sfx.snap = { hook, outside } —
 *   hook: url → { snap, dur, delay? } for the files of the banks that turn a mixer snapshot on while they play
 *     (audio_data snapshotBanks, audio.mjs indexAudio `snapshots`; only files the manifest plays: built `sfx`);
 *   outside: the urls whose bank sits on a group outside the filtered bus (Independent: the hooks themselves, 浊心斯卡蒂's
 *     deploy / skill starts and their dubs (dubbedSfx), the 替身's held sharpstandspell) — public/js/audioOfficial.js routes them around the snapshot.
 * @param {{ snapshots?: Array<{ hook: string, snap: string, delay: number, dur: number }>, bank: (n: string) => string[] }} audio
 * @param {(paths: string[]) => any} soundLeaf plan.mjs leaf builder
 * @param {{ units?: Record<string, any>, kit?: Record<string, any>, kitGrp?: Record<string, string> }} sfx the built sfx tree
 * @returns {{ hook: Record<string, { snap: string, dur: number, delay?: number }>, outside: string[] }|null}
 */
export function snapshotSfx(audio, soundLeaf, sfx) {
  const outside = new Set();
  const add = (g, l) => { if (OUTSIDE_GROUPS.has(g)) for (const u of leafUrls(l)) outside.add(u); };
  for (const u of Object.values(sfx?.units || {})) {
    const g = u?.grp || {};
    for (const r of ['attack', 'on', 'hit', 'die', 'born']) add(g[r], u[r]);
    for (const [i, gi] of Object.entries(g.skills || {})) add(gi, u.skills ? u.skills[i] : u.skill);
    for (const m of Object.values(u?.modes || {})) for (const r of ['attack', 'on', 'hit']) add(m?.grp?.[r], m?.[r]);
    for (const l of Object.values(u?.loops || {})) add(l?.grp, l?.url);
    for (const list of Object.values(u?.extras || {})) for (const e of list || []) add(e?.grp, e?.url);
    for (const e of Object.values(u?.ends || {})) add(e?.grp, e?.url);
    for (const d of Object.values(u?.dub || {})) for (const e of [d?.born, ...Object.values(d?.skills || {})]) if (e) add(e.grp, e.url);
  }
  for (const [k, g] of Object.entries(sfx?.kitGrp || {})) add(g, sfx?.kit?.[k]);
  const known = new Set();
  const walk = (o) => { if (typeof o === 'string' || o?.alts) for (const u of leafUrls(o)) known.add(u); else if (o && typeof o === 'object') for (const v of Object.values(o)) walk(v); };
  walk(sfx);
  const hook = {};
  for (const s of Array.isArray(audio?.snapshots) ? audio.snapshots : []) {
    const paths = audio.bank(s.hook);
    if (!paths?.length) continue;
    for (const url of leafUrls(soundLeaf(paths))) {
      if (!known.has(url) || hook[url]) continue;
      hook[url] = { snap: s.snap, dur: s.dur, ...(s.delay > 0 ? { delay: s.delay } : {}) };
    }
  }
  // a dub's copy of a hook bank (`…@KR`) turns the same snapshot on (snapshotBanks lists every dub)
  for (const u of Object.values(sfx?.units || {})) {
    for (const d of Object.values(u?.dub || {})) {
      for (const e of [d?.born, ...Object.values(d?.skills || {})]) {
        const s = e && typeof audio?.snapshotOf === 'function' ? audio.snapshotOf(dubBanks.get(e)) : null;
        if (s) for (const url of leafUrls(e.url)) if (!hook[url]) hook[url] = { snap: s.snap, dur: s.dur, ...(s.delay > 0 ? { delay: s.delay } : {}) };
      }
    }
  }
  if (!Object.keys(hook).length) return null;
  return { hook, outside: [...outside].sort() };
}

/**
 * (2026-10-10, docs/rules/audio.md 「스킬 종료음」) sfx.units[charId].ends: per skill index, the bank the client
 * plays as the skill ends — `battle.ON_SKILL_FINISH.<skillId>` (the client's BasicSkill.OnSkillEnd →
 * BattleController.PlayAudioAtPos('ON_SKILL_FINISH', _GenerateSignalId = the skillId unless the skill data names its own
 * signal id) at the owner; also OnOwnerFinish / _OnReceiveAttackFinishEvent / ToggleSkill.DoCast) and the skill ability's
 * own `battle.ON_ABILITY_END.<skillId>` (AbilityStandard.OnCastEnd) unless that is a looping bank (烛煌 S3's
 * field: skillLoops). { url, grp?, vol? }. 银灰 S2 b_char_tactboost, 玛恩纳 S2 / 荒芜拉普兰德 S1 b_char_boostclose, …
 * 2026-10-29, official client: without such a bank, the START bank of the mode the skill's buff switches to as it ends
 * (local-char-modes.json `skillEnd`, char_modes.py skill_end_modes) — that mode's attack runs its closing clip at once:
 * 蒂比 S2 S2_Landing `attack.6` p_skill_pmtjtckdw, 蕾缪安 S3 S3_End `attack.4` (the bombardment's call).
 * @param {{ bank: (n: string) => string[], groupOf?: Function, mixOf?: Function, isLoop?: Function }} audio
 * @param {{ index: number, skillId?: string }[]} skills
 * @param {(paths: string[]) => any} soundLeaf
 * @param {string} [charId]
 * @param {{ skillEnd?: (number|null)[] }} [info] local-char-modes.json entry
 * @param {{ sig?: number[][] }} [ca] local-char-audio.json entry
 */
export function skillEnds(audio, skills, soundLeaf, charId = null, info = null, ca = null) {
  const isLoop = (n) => (typeof audio.isLoop === 'function' ? audio.isLoop(n) : false);
  const out = {};
  for (const s of Array.isArray(skills) ? skills : []) {
    if (!s || !Number.isInteger(s.index) || !s.skillId) continue;
    const n = info?.skillEnd?.[s.index];
    const endMode = charId && Number.isInteger(n) && n > 0 ? `battle.ON_ABILITY_START.${charId}.${signalBase('attack', n, ca?.sig)}` : null;
    const name = [`battle.ON_SKILL_FINISH.${s.skillId}`, `battle.ON_ABILITY_END.${s.skillId}`, endMode].find((x) => x && audio.bank(x)?.length && !isLoop(x));
    if (!name) continue;
    const paths = audio.bank(name);
    const e = { url: soundLeaf(paths) };
    const g = typeof audio.groupOf === 'function' ? audio.groupOf(paths) : null;
    if (g) e.grp = g;
    const m = typeof audio.mixOf === 'function' ? audio.mixOf(paths) : null;
    if (m && Number.isFinite(m.vol)) e.vol = m.vol;
    if (name === endMode) e.mode = 1; // an ability of the end mode: a unit knocked out / withdrawn casts none (audio.js)
    out[String(s.index)] = e;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * (2026-10-10, docs/rules/audio.md 「효과음 재생: 피치·동시 재생 상한」) sfx.bank: url → [minPitch, maxPitch,
 * maxSoundAllowed, popOldest] of the bank each played sound file comes from (audio.mjs bankPlay; the client's
 * SoundFXBank.Play, SoundFXBank.SoundFX._SetAudioChannel). Every sfx leaf of the built tree
 * whose paths `leafPaths` knows (plan.mjs soundLeaf) — the bank's own list, else the bank that sounds its first path.
 * A file two banks share keeps the first bank's values.
 * @param {{ playOf?: (paths: string[]) => [number, number, number, number]|null }} audio
 * @param {WeakMap<object, string[]>} leafPaths leaf → the path list it was built from
 * @param {object} sfx the built sfx tree (template.audio.sfx)
 * @returns {Record<string, [number, number, number, number]>|null}
 */
export function bankPlayTable(audio, leafPaths, sfx) {
  if (typeof audio.playOf !== 'function') return null;
  const out = {};
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o.alts)) {
      const v = audio.playOf(leafPaths.get(o));
      if (v) for (const u of leafUrls(o)) if (!out[u]) out[u] = v;
      return;
    }
    for (const x of Object.values(o)) walk(x);
  };
  walk(sfx);
  return Object.keys(out).length ? Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : null;
}

// ---- attack sound signals (2026-10-10, docs/rules/audio.md 「공격 소리 신호」) -----------------------------------
//
// The client sounds an attack through its ability's signal id (UnitMode.GenerateSignalId): the mode's
// `attack` / `combat` + `.<mode index>` when the mode sets `_addIndexToSignalId` (index 0 only with `_includeIndexZero`;
// 텍사스 디 오메르토사 S1 / S3 use the Default's `.attack`); a child of a random / loop / conditional group adds `.<i + 1>`
// (AbilityRandomGroup.DoSetData — Random picks one per attack, Loop in turn); a multi-hit attack adds its spell
// count to ON / HIT (MultiMeleeAttack.DoEmitAudioSignalForSpellOn / ForHit). START sounds as the swing
// starts (AbilityStandard.OnCastStart), ON at the strike, HIT on each target hit, a projectile's BORN as it is fired
// and HIT / REACH as it lands; the middleware plays every bank of the name (TorappuAudioMiddleware.PlayEvent).
// tools/local-extract/char_audio.py → tools/assets/local-char-audio.json has the prefab facts (flags, groups, projectiles).
//
//   set = { cues: [{ at: 's' | 'a' | 'd', u, g?, v?, p?, dl?, or?, ab?, k?, sp? }], sel?: { attack?|combat?: { n, how, … } } }
//   at: 's' the swing (b.ev 'swing'), 'a' the strike ('atk'), 'd' an impact ('dmg'); u = the sound, g its mixer group, v its bank
//   volume, p its play chance (empty assets), dl its delay (s), or = [{ u, w, v?, dl? }] a bank of several files (one drawn by
//   weight); ab 'attack' |
//   'combat' when the mode has both (combat = a melee strike); k = the group child it belongs to (1-based); sp = the spell index.
//   sel[ab] = { n, how: 'rand' | 'loop' | 'all' | 'cond' | 'spell', diff?, once?, melee?, ranged?, first?, def? } (public/js/audio.js).

export const LOCAL_CHAR_AUDIO_FILE = 'tools/assets/local-char-audio.json';

/** tools/assets/local-char-audio.json → { [unitId]: { modes, sig, ab, proj, skillProj, talentProj, skills? } } ({} when absent). */
export function loadCharAudio(root = process.cwd()) {
  const f = join(root, LOCAL_CHAR_AUDIO_FILE);
  if (!existsSync(f)) return {};
  try {
    const doc = JSON.parse(readFileSync(f, 'utf8'));
    delete doc.$comment;
    return doc;
  } catch { return {}; }
}

/**
 * The signal id of mode `n`'s `ab` ability (UnitMode.GenerateSignalId): `ab.<n>` when the mode adds its index (and n > 0
 * or it includes index 0), else `ab`.
 * @param {'attack'|'combat'} ab @param {number} n @param {number[][]} [sig] [[add, zero]] per mode
 */
export function signalBase(ab, n, sig) {
  const f = Array.isArray(sig?.[n]) ? sig[n] : [n > 0 ? 1 : 0, 0];
  return f[0] && (n > 0 || f[1]) ? `${ab}.${n}` : ab;
}

const EV_AT = Object.freeze({ ON_ABILITY_START: 's', ON_ABILITY_ON: 'a', ON_ABILITY_HIT: 'd' });
const PROJ_AT = Object.freeze({ ON_PROJECTILE_BORN: 'a', ON_PROJECTILE_HIT: 'd', ON_PROJECTILE_REACH: 'd' });

/**
 * One cue of bank `name` (null without a sound): its leaf, mixer group, bank volume and chance; a bank of several files
 * lists them with their weights (`or`) — SoundFXBank._GenerateWeightedRandomSound draws one per play.
 */
export function bankCue(audio, name, at, soundLeaf, extra = {}) {
  const paths = audio.bank(name);
  if (!paths?.length) return null;
  const c = { at, u: soundLeaf(paths) };
  const g = typeof audio.groupOf === 'function' ? audio.groupOf(paths) : null;
  if (g) c.g = g;
  const m = typeof audio.mixOf === 'function' ? audio.mixOf(paths) : null;
  if (m && Number.isFinite(m.vol)) c.v = m.vol;
  if (m && Number.isFinite(m.p)) c.p = m.p;
  const snd = typeof audio.soundsOf === 'function' ? audio.soundsOf(name).filter((x) => x.path) : [];
  const files = [...new Set(snd.map((x) => x.path))];
  // the sound's own delay (s; SoundFXBank.Play waits delay / timeScale — 텍사스 디 오메르토사's START 0.27 s): this bank's, not
  // the first bank that shares the file (sfx.bank)
  const d0 = snd.find((x) => x.path === paths[0])?.delay;
  if (d0 > 0) c.dl = d0;
  if (files.length > 1) {
    c.or = files.map((p) => {
      const xs = snd.filter((x) => x.path === p);
      const o = { u: soundLeaf([p]), w: Math.round(xs.reduce((a, x) => a + x.w, 0) * 1000) / 1000 };
      if (xs[0].vol !== 1) o.v = xs[0].vol;
      if (xs[0].delay > 0) o.dl = xs[0].delay;
      return o;
    });
  }
  return Object.assign(c, extra);
}

/** The pick rule of a conditional group's children by name (public/js/audio.js: melee strike / ranged / the mode's first attack). */
function condPick(names) {
  const at = (re, not = null) => { const i = names.findIndex((x) => re.test(x) && !(not && not.test(x))); return i >= 0 ? i + 1 : null; };
  const SPECIAL = /blocked|self|special|first|reload|token|fire_?to/i;
  const out = {};
  const melee = at(/melee/i, /blocked/i) ?? at(/melee/i);
  if (melee) out.melee = melee;
  out.ranged = at(/^common$/i) ?? at(/ranged/i, SPECIAL) ?? (names.findIndex((x) => !SPECIAL.test(x) && !/melee/i.test(x)) + 1 || 1);
  const first = at(/^first/i);
  if (first) out.first = first;
  return out;
}

/**
 * The attack sound set of mode `n` of a unit (see above), from its bank table and its local-char-audio.json entry.
 * @param {ReturnType<import('./audio.mjs').indexAudio>} audio
 * @param {string} owner the id its banks are named after (an enemy's sound owner)
 * @param {any} entry local-char-audio.json entry
 * @param {number} n mode index
 * @param {(paths: string[]) => any} soundLeaf
 * @returns {{ cues: any[], sel?: Record<string, any> }}
 */
export function soundSet(audio, owner, entry, n, soundLeaf) {
  const ab = entry?.ab?.[n] || {};
  const hasFacts = Object.keys(ab).length > 0;
  const kinds = Object.keys(ab).filter((k) => k === 'attack' || k === 'combat');
  if (!kinds.length) kinds.push('attack', 'combat');
  const per = {};
  const sel = {};
  // 2026-10-16, official client (docs/rules/audio.md 「연쇄 공격 소리」): a chain shot hits every unit of its chain
  // (Projectile.OnHitTarget: ON_PROJECTILE_HIT at each), but ON_PROJECTILE_REACH sounds once, as the shot
  // reaches its first unit (`r`); with two units or more its chain plays ON_PROJECTILE_BEHAVIOUR_TRIGGER once at the last
  // one (ChainLightningHitBehaviour.PlayChainAudio → Projectile.PlayBehaviourAudio): cue `at` 'c'
  const projCues = (keys, extra) => {
    const out = [];
    for (const key of keys || []) {
      for (const [ev, at] of Object.entries(PROJ_AT)) {
        const c = bankCue(audio, `battle.${ev}.${key}`, at, soundLeaf, ev === 'ON_PROJECTILE_REACH' ? { ...extra, r: 1 } : extra);
        if (c) out.push(c);
      }
      const c = bankCue(audio, `battle.ON_PROJECTILE_BEHAVIOUR_TRIGGER.${key}`, 'c', soundLeaf, extra);
      if (c) out.push(c);
    }
    return out;
  };
  for (const kind of kinds) {
    const info = ab[kind] || {};
    const base = signalBase(kind, n, entry?.sig);
    const cues = [];
    const abilityCues = (sig, extra) => {
      for (const [ev, at] of Object.entries(EV_AT)) {
        const c = bankCue(audio, `battle.${ev}.${owner}.${sig}`, at, soundLeaf, extra);
        if (c) cues.push(c);
      }
    };
    abilityCues(base, {});
    const kids = Number.isInteger(info.n) && info.n > 0 && ['rand', 'loop', 'all', 'cond'].includes(info.g) ? info.n : 0;
    if (kids) {
      for (let j = 1; j <= kids; j++) {
        abilityCues(`${base}.${j}`, info.g === 'all' ? {} : { k: j });
        const kp = Array.isArray(info.kidProj) ? info.kidProj[j - 1] : null;
        if (kp) cues.push(...projCues(kp, info.g === 'all' ? {} : { k: j }));
      }
      if (!Array.isArray(info.kidProj)) cues.push(...projCues(info.proj, {}));
      if (info.g !== 'all') {
        const s = { n: kids, how: info.g };
        if (info.diff) s.diff = 1;
        if (info.once) s.once = 1;
        if (info.g === 'cond') Object.assign(s, condPick(info.names || []));
        if (info.seq) s.how = 'loop';
        sel[kind] = s;
      }
    } else {
      // numbered sub-banks of the signal: a multi-hit attack's spell counts (`spell` / `hitSpell`), else (no prefab facts,
      // only for a signal that carries a mode index — `attack.<k>` of an index-less Default is another mode's) taken in turn
      const subs = new Set();
      for (const ev of Object.keys(EV_AT)) {
        for (const name of typeof audio.namesWithPrefix === 'function' ? audio.namesWithPrefix(`battle.${ev}.${owner}.${base}.`) : []) {
          const rest = name.slice(`battle.${ev}.${owner}.${base}.`.length);
          if (/^\d+$/.test(rest)) subs.add(Number(rest));
        }
      }
      const spell = info.spell || info.hitSpell;
      if (subs.size && (spell || /\.\d+$/.test(base))) {
        for (const k of [...subs].sort((a, b) => a - b)) {
          for (const [ev, at] of Object.entries(EV_AT)) {
            if (spell && at === 's') continue;
            const c = bankCue(audio, `battle.${ev}.${owner}.${base}.${k}`, at, soundLeaf, spell ? { sp: k } : { k: k - Math.min(...subs) + 1 });
            if (c) cues.push(c);
          }
        }
        if (!spell) sel[kind] = { n: subs.size, how: 'loop' };
      }
      // its own shots; without prefab facts for the mode, the mode's main shot by name (projectile_chr_<name>[_default|_s<n>])
      const main = new RegExp(`^projectile_chr_${String(owner).replace(/^char_\d+_/, '')}(_default|_s\d+)?$`);
      cues.push(...projCues(hasFacts ? info.proj : kind === 'attack' ? (entry?.proj?.[n] || []).filter((k) => main.test(k)) : null, {}));
    }
    per[kind] = cues;
  }
  const sounding = Object.keys(per).filter((k) => per[k].length);
  const both = sounding.length > 1;
  const cues = [];
  for (const k of sounding) for (const c of per[k]) cues.push(both ? { ...c, ab: k } : c);
  const out = { cues };
  const s = Object.fromEntries(Object.entries(sel).filter(([k]) => sounding.includes(k)));
  if (Object.keys(s).length) out.sel = s;
  return out;
}

/**
 * The cues of a skill's own attack ability (a skill that switches no mode, `ON_ABILITY_*.<skillId>[.<sub>…]` — every sub-key,
 * not a fixed list): START on an attack group at the swing, ON on an attack / impact group at the strike, HIT on an impact
 * group on the hit. Banks on a skill / UI group are its start sounds (skill-sfx.mjs), not these.
 */
export function abilityCues(audio, skillId, soundLeaf) {
  if (!skillId || typeof audio.namesWithPrefix !== 'function') return [];
  const out = [];
  for (const [ev, at] of Object.entries(EV_AT)) {
    const names = [`battle.${ev}.${skillId}`, ...audio.namesWithPrefix(`battle.${ev}.${skillId}.`)].filter((nm) => !nm.includes('@'));
    const ok = at === 's' ? ATTACK_GROUPS : at === 'a' ? new Set([...ATTACK_GROUPS, ...IMPACT_GROUPS]) : IMPACT_GROUPS;
    for (const name of names) {
      const p = audio.bank(name);
      if (!p?.length || !ok.has(audio.groupOf?.(p))) continue;
      const c = bankCue(audio, name, at, soundLeaf);
      if (c) out.push(c);
    }
  }
  return out;
}

/**
 * The impact sounds of a skill's own damage — damage a kit deals with no attack of its own ('dmg' carrying its attacker,
 * docs/SIM.md): the HIT / REACH banks of the skill prefab's projectiles (local-char-audio.json skillProj), then its ability's
 * HIT banks. [cue] in that order (public/js/audio.js plays the first).
 */
export function skillHitCues(audio, skillId, projKeys, soundLeaf) {
  const out = [];
  for (const key of projKeys || []) for (const ev of ['ON_PROJECTILE_HIT', 'ON_PROJECTILE_REACH']) {
    const c = bankCue(audio, `battle.${ev}.${key}`, 'd', soundLeaf);
    if (c) out.push(c);
  }
  if (skillId) out.push(...abilityCues(audio, skillId, soundLeaf).filter((c) => c.at === 'd'));
  return out;
}

/**
 * A unit's spine-event sounds (`battle.ON_SPINE_EVENT_TRIGGER.<id>.<event>`, played when its Spine clip reaches that
 * event — 마운틴 S2 / S3 punches, 파투스 reload): { [event]: cue } or null.
 */
export function spineCues(audio, owner, soundLeaf) {
  const banks = audio.unitBanks?.get(owner);
  if (!banks) return null;
  const out = {};
  for (const k of banks.keys()) {
    if (!k.startsWith('ON_SPINE_EVENT_TRIGGER.') || k.includes('@')) continue;
    const ev = k.slice('ON_SPINE_EVENT_TRIGGER.'.length);
    const c = bankCue(audio, `battle.ON_SPINE_EVENT_TRIGGER.${owner}.${ev}`, 'a', soundLeaf);
    if (c) { delete c.at; out[ev] = c; }
  }
  return Object.keys(out).length ? out : null;
}

/** data/tokens.json → { [tokenId]: its skill id } ({} when absent): a summon's skill start sound (plan.mjs tokens). */
export function loadTokenSkills(root = process.cwd()) {
  const f = join(root, 'data/tokens.json');
  if (!existsSync(f)) return {};
  try {
    const doc = JSON.parse(readFileSync(f, 'utf8'));
    const out = {};
    for (const [id, t] of Object.entries(doc.tokens || doc)) if (typeof t?.skill?.skillId === 'string') out[id] = t.skill.skillId;
    return out;
  } catch { return {}; }
}

/**
 * An enemy's skill sounds by ability name (lower case: data/enemies.json `skills[].prefabKey` names the prefab's `Skills/<Name>`
 * — 'boomb' ↔ Boomb): its `battle.ON_ABILITY_START|ON|HIT.<owner>.<Name>[.<sub>…]` banks (any mixer group) and its projectiles'
 * BORN / HIT / REACH, as cues (public/js/audio.js plays them when the sim names the skill — docs/SIM.md). null without any.
 */
export function enemySkillCues(audio, owner, entry, soundLeaf) {
  const out = {};
  for (const [name, proj] of Object.entries(entry?.skills || {})) {
    const cues = [];
    for (const [ev, at] of Object.entries(EV_AT)) {
      const names = [`battle.${ev}.${owner}.${name}`, ...(typeof audio.namesWithPrefix === 'function' ? audio.namesWithPrefix(`battle.${ev}.${owner}.${name}.`) : [])];
      // `loop`: a looping bank (炎佑 Skill_2's ON), held while the skill runs (public/js/audio.js enemyRecordSkill)
      for (const nm of names) { const c = bankCue(audio, nm, at, soundLeaf, typeof audio.isLoop === 'function' && audio.isLoop(nm) ? { loop: 1 } : {}); if (c) cues.push(c); }
    }
    for (const key of proj || []) for (const [ev, at] of Object.entries(PROJ_AT)) {
      const c = bankCue(audio, `battle.${ev}.${key}`, at, soundLeaf);
      if (c) cues.push(c);
    }
    if (cues.length) out[name.toLowerCase()] = cues;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * 2026-10-11, docs/rules/audio.md 「재능·소환물 능력 소리」: a summon's attack sound sets by prefab mode name (`_modes`,
 * local-char-audio.json `modes`) for the modes other than its Default whose set differs from it — 뮤엘시스's 流形 switches
 * to Melee / Range on its copy and to Melee_S3 / Range_S2 while her S3 / S2 runs (buff templates mlyss_wtrman_switch_melee /
 * _range: SwitchMode 5 / 4 when its owner holds mlyss_s_3[buff] / mlyss_s_2[buff], else 2 / 3). { [name]: { cues, sel? } } or
 * null (public/js/audio.js: the sim names the mode — fx 'copy' `mode`, docs/SIM.md).
 */
export function tokenModeSets(audio, owner, entry, soundLeaf, base = null) {
  const names = Array.isArray(entry?.modes) ? entry.modes : [];
  if (names.length < 2) return null;
  const d = Math.max(0, names.indexOf('Default'));
  const same = JSON.stringify(base ?? soundSet(audio, owner, entry, d, soundLeaf));
  const out = {};
  names.forEach((name, i) => {
    if (i === d || typeof name !== 'string') return;
    const set = soundSet(audio, owner, entry, i, soundLeaf);
    if (!set.cues.length || JSON.stringify(set) === same) return;
    out[name] = set.sel ? { cues: set.cues, sel: set.sel } : { cues: set.cues };
  });
  return Object.keys(out).length ? out : null;
}

/**
 * An enemy's attack sound sets of its prefab modes after mode 0 (`_modes` order, local-char-audio.json `modes`): { [n]: { cues,
 * sel? } } for the modes whose set differs from mode 0's (`cues: []` = that mode attacks in silence — its signal has no bank,
 * as for an operator's skill mode), null when none differs. The client switches modes in `Unit.SwitchMode` (:
 * InactiveMode → ActivateMode, no sound of its own); the mode's abilities then signal `<ability>.<n>` (UnitMode.GenerateSignalId).
 */
export function enemyModeSets(audio, owner, entry, soundLeaf, base = null) {
  const n = Array.isArray(entry?.modes) ? entry.modes.length : 0;
  if (n < 2) return null;
  const same = JSON.stringify(base ?? soundSet(audio, owner, entry, 0, soundLeaf));
  const out = {};
  for (let i = 1; i < n; i++) {
    const set = soundSet(audio, owner, entry, i, soundLeaf);
    if (JSON.stringify(set) === same) continue;
    out[String(i)] = set.sel ? { cues: set.cues, sel: set.sel } : { cues: set.cues };
  }
  return Object.keys(out).length ? out : null;
}
