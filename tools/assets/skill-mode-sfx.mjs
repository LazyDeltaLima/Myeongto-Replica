// Skill-mode attack / impact sounds and mixer groups (local patch, docs/LOCAL-PATCH.md 「스킬 모드 효과음·믹서 볼륨」).
//
// The official client sounds an operator's attacks through its current attack mode (research 2026-10-07,
// research/2026-10-07-official-compare/compare-audio.md §1–2):
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
import { skillModeIndex } from '../../shared/skill-modes.js';

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
  const out = {};
  if (attack) out.attack = attack;
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
  if (attack) out.attack = attack;
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
export function skillModes(audio, charId, skills, info, soundLeaf, startIsFallback = () => false) {
  const out = {};
  for (const s of Array.isArray(skills) ? skills : []) {
    if (!s || !Number.isInteger(s.index)) continue;
    const n = info ? skillModeIndex(info.modes, s.index, info.skillMode) : -1;
    const found = n > 0 ? modeSounds(audio, charId, n, info.proj?.[n]) : s.skillId ? abilitySounds(audio, s.skillId) : {};
    if (!found.attack && !found.hit) continue;
    const e = {};
    const mix = {}, grp = {};
    for (const r of ['attack', 'hit']) {
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
    // local patch (user report 4 #4-4, 2026-10-08): a mode ability with its own attack bank and no impact bank (缄默德克萨斯 S2
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
 * Normal attacks sound from the Default mode only (user report 2026-10-07 #7: 银灰's S3 p_atk_silver_n on every attack):
 * a unit bank table without the attack banks of its skill modes (`ON_ABILITY_*.attack|combat.<n>…`, modes[n] a skill's
 * mode). `.attack.0…` (Default with `_includeIndexZero`) and talent modes stay. Unchanged without mode info — and, [ASSUMED]
 * conservative, when the Default mode would keep no attack bank at all and has no projectile bank (`projectile`): 玛恩纳 /
 * 蜜蜡 / 薄绿 / 卡涅利安 / sbell2 keep their old pick rather than go silent until the official sound is confirmed.
 * @param {Map<string, string[]>|undefined} banks audio.unitBanks.get(charId)
 * @param {{ modes?: string[] }|undefined} info local-char-modes.json entry
 * @param {{ projectile?: boolean }} [o] projectile: a Default projectile bank sounds the attack
 */
export function defaultModeBanks(banks, info, { projectile = false } = {}) {
  if (!banks || !Array.isArray(info?.modes) || info.modes.length < 2) return banks;
  const out = new Map([...banks].filter(([k]) => {
    const m = ATTACK_BANK.exec(k);
    return !m || m[1] == null || !SKILL_MODE.test(info.modes[+m[1]] || '');
  }));
  const kept = [...out.keys()].some((k) => ATTACK_BANK.test(k) && out.get(k)?.length);
  return kept || projectile ? out : banks;
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
  for (const r of ['attack', 'hit', 'die', 'born']) { const g = roles?.[r] ? audio.groupOf(roles[r]) : null; if (g) out[r] = g; }
  const sk = {};
  for (const [i, p] of Object.entries(skillPaths || {})) { const g = audio.groupOf(p); if (g) sk[i] = g; }
  if (Object.keys(sk).length) out.skills = sk;
  return Object.keys(out).length ? out : null;
}

/** Events of a skill's looping bank (the loop runs while the skill does). */
const LOOP_EVENTS = 'ON_SKILL_START|ON_ABILITY_START|ON_ABILITY_ON|ON_ABILITY_END|ON_BUFF_START|ON_CUSTOM_TRIGGER'; // ON_ABILITY_END: 烛煌 S3's field after its cast (report 4 #4-2)

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
 * local patch (user report 4 #4-2, 2026-10-08: 耀骑士临光 S3, 塑心 S3 「스킬 음악이 안 나온다」) sfx.units[charId].extras: per skill
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
