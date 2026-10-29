// Official battle mix and skill-mode sounds (local patch, docs/LOCAL-PATCH.md 「스킬 모드 효과음·믹서 볼륨」), used by
// public/js/audio.js (upstream) through short local-patch lines. Pure: no DOM, no Web Audio.
//
// Mix: the client's AudioMixer `MainMixer` (EN sharedassets1.assets), Default snapshot: each bank plays on its
// `customMixerGroup` (audio_data.json → manifest sfx.units[id].grp / modes[i].grp / sfx.kitGrp) whose volume, summed
// with its parents' (dB), is the linear gain below; a sound's own bank volume (mix.vol, up to 2.0) multiplies it.
// Research 2026-10-07 (maintainer's notes 2026-10-07 §2). The voice channel
// plays at the Voice group's gain; the sfx channel carries no extra factor (the groups already hold SFX_Battle's −3.15 dB).
// A role without a group in the manifest falls back to the group its role uses in the official banks (ROLE_GROUP).
//
// Skill modes: sfx.units[id].modes[skillIndex] = { attack?, on?, hit?, mix?, grp?, deferStart?, noHit? }
// (tools/assets/skill-mode-sfx.mjs) — the attack / impact sounds of the attacks an operator makes while that skill runs.

import { sfxOut } from './audioSnapshot.js'; // local patch: sounds outside the mixer snapshot bus

/** Linear gain of each mixer group (Default snapshot, parents included). */
export const GROUP_GAIN = Object.freeze({
  Battle_P_NAtk: 0.348, Battle_P_NImp: 0.336, Battle_P_SAtk: 0.428, Battle_P_SImp: 0.348, Battle_P_Field: 0.267,
  Battle_E_NAtk: 0.163, Battle_E_NImp: 0.205, Battle_E_SAtk: 0.273, Battle_E_SImp: 0.317,
  Battle_BE_NAtk: 0.343, Battle_BE_NImp: 0.327,
  Battle_UI_Important: 0.614, Battle_UI_Boost: 0.67, Battle_Skill_Important: 0.473,
  Battle_A_Global: 0.696, Independent: 0.526, SFX_Battle: 0.696,
});
/** The Voice group (the voice channel's gain). */
export const VOICE_GAIN = 0.978;
/** A bank without a group (e.g. ON_MODIFIER_HEAL): the battle SFX bus [ASSUMED]. */
const NO_GROUP = GROUP_GAIN.SFX_Battle;

/** The group a role uses in the official banks when the manifest has none (by the unit's model id prefix). */
export function roleGroup(defId, role, mode = false) {
  const enemy = typeof defId === 'string' && defId.startsWith('enemy_');
  switch (role) {
    case 'attack': case 'on': return enemy ? 'Battle_E_NAtk' : mode ? 'Battle_P_SAtk' : 'Battle_P_NAtk'; // 2026-10-10: + on
    case 'hit': return enemy ? 'Battle_E_NImp' : mode ? 'Battle_P_SImp' : 'Battle_P_NImp';
    case 'skill': return enemy ? 'Battle_E_NAtk' : 'Battle_UI_Boost';
    case 'die': case 'born': return enemy ? 'Battle_E_NImp' : 'Battle_UI_Important';
    default: return 'SFX_Battle';
  }
}

/** Gain of a mixer group name (unknown → the battle SFX bus). */
export const groupGain = (g) => (typeof g === 'string' && Object.hasOwn(GROUP_GAIN, g) ? GROUP_GAIN[g] : NO_GROUP);

/**
 * The official gain of a unit's sound: its group's gain × its bank volume (mix.vol, not capped — a bank the official
 * client plays louder than 1 stays louder; audio.js `_play` caps the node gain at 1.5).
 * @param {string} defId the unit's model id (sfx.units key)
 * @param {'attack'|'hit'|'skill'|'die'|'born'} role
 * @param {any} entry sfx.units[defId] (its `grp`)
 * @param {{ vol?: number }|null|undefined} mix the role's bank mix
 * @param {{ grp?: any, skillIndex?: number|null, mode?: boolean }} [o] a mode's own groups / the skill index of a
 *   `skill` start sound
 */
export function officialGain(defId, role, entry, mix, o = {}) {
  const grp = o.grp ?? entry?.grp;
  let g = role === 'skill' && Number.isInteger(o.skillIndex) ? grp?.skills?.[o.skillIndex] : grp?.[role];
  if (typeof g !== 'string') g = roleGroup(defId, role, !!o.mode);
  const vol = Number(mix?.vol);
  return groupGain(g) * (Number.isFinite(vol) && vol > 0 ? vol : 1);
}

/** Groups of the named battle sounds (audio.js battle(name); BATTLE_SFX banks / their files' banks). */
export const BATTLE_GROUP = Object.freeze({
  deploy: 'Battle_UI_Important', tokenDeploy: 'Battle_UI_Important', charDie: 'Battle_UI_Important', leak: 'Battle_UI_Important',
  enemyDie: 'Battle_E_NImp', enemyDieHeavy: 'Battle_BE_NImp', enemyHit: 'Battle_E_NImp', killCoin: 'Battle_E_NImp',
  heal: 'SFX_Battle',
});
/** Bank volume of a named battle sound when it differs from 1 (ON_MODIFIER_HEAL p_imp_heal_n 0.8). */
const BATTLE_VOL = Object.freeze({ heal: 0.8 });
/** The official gain of a named battle sound (unknown names: the battle SFX bus). */
export const battleGain = (name) => groupGain(BATTLE_GROUP[name]) * (BATTLE_VOL[name] ?? 1);

/**
 * The skill-mode entry of a unit for its running skill: sfx.units[defId].modes[skillIndex] when it has a sound for the
 * role, else null.
 * @param {any} entry sfx.units[defId]
 * @param {number|null|undefined} skillIndex
 * @param {'attack'|'hit'} [role]
 */
export function modeEntry(entry, skillIndex, role = null) {
  if (!Number.isInteger(skillIndex)) return null;
  const m = entry?.modes?.[skillIndex];
  if (!m || typeof m !== 'object') return null;
  return !role || typeof m[role] === 'string' ? m : null;
}

/**
 * 2026-10-10: the ON sound of a running skill mode — `modes[i].on` (null: the mode has none) when the mode has
 * an attack sound of its own; undefined when no such mode runs (the unit's own `on` then).
 * @param {any} entry sfx.units[defId] @param {number|null|undefined} skillIndex
 * @returns {string|null|undefined}
 */
export function modeOn(entry, skillIndex) {
  const m = Number.isInteger(skillIndex) ? entry?.modes?.[skillIndex] : null;
  if (!m || typeof m !== 'object' || typeof m.attack !== 'string') return undefined;
  return typeof m.on === 'string' ? m.on : null;
}

/**
 * 2026-10-10, docs/rules/audio.md 「스킬 종료음」: the bank a unit's skill sounds as it ends
 * (sfx.units[defId].ends[skillIndex] = { url, grp?, vol? }, tools/assets/skill-mode-sfx.mjs skillEnds) or null.
 */
export const skillEndOf = (entry, skillIndex) => (Number.isInteger(skillIndex) && typeof entry?.ends?.[skillIndex]?.url === 'string' ? entry.ends[skillIndex] : null);

/**
 * 2026-10-10, docs/rules/audio.md 「효과음 재생: 피치·동시 재생 상한」: the play values of a sound file —
 * manifest `sfx.bank[url]` = [minPitch, maxPitch, maxSoundAllowed (0 = no cap), popOldest] (tools/assets/skill-mode-sfx.mjs
 * bankPlayTable; 공식 클라 SoundFXBank.Play, SoundFXBank.SoundFX._SetAudioChannel) or null.
 * @param {any} manifest data/assets.json @param {string} url
 * @returns {[number, number, number, number]|null}
 */
export function bankPlayOf(manifest, url) {
  const v = manifest?.audio?.sfx?.bank?.[url];
  return Array.isArray(v) && v.length >= 4 && v.every(Number.isFinite) ? v : null;
}

/**
 * The pitch of one play: uniform in [minPitch, maxPitch] (the client's `RandomUtil.Range(minPitch, maxPitch)` →
 * AudioChannel.pitch; most battle sounds 0.8–1.2). 1 without values.
 * @param {[number, number, number, number]|null|undefined} info bankPlayOf
 * @param {() => number} [random]
 */
export function playPitch(info, random = Math.random) {
  if (!info) return 1;
  const [lo, hi] = info;
  if (!(lo > 0) || !(hi >= lo)) return 1;
  return hi > lo ? lo + (hi - lo) * random() : lo;
}

// ---- skill loops (sfx.units[id].loops, tools/assets/skill-mode-sfx.mjs skillLoops) ---------------------------------------
// A skill's looping bank — 丰川祥子 S3's music (ON_BUFF_START.oblvns_s_3[loop]), the fields (ON_ABILITY_START.skchr_lisa_3 …)
// — plays on a loop while the skill runs: started by its 'skill' on, faded out by its 'skill' off, the unit's 'die' or a
// new field. One per unit; the loops live on the manager (`_skillLoops`) and play on its sfx channel.
const LOOP_FADE_S = 0.25;

/**
 * Start unit `key`'s loop of `url` at `gain` (a running one of that unit is replaced). local patch:
 * `o.loop` false = a one-shot held under that key so the skill's end can cut it (塑心 S3's melody: its ctrlStop bank),
 * `o.fade` = the fade (s) stopSkillLoop cuts it with (default LOOP_FADE_S).
 */
export function startSkillLoop(mgr, key, url, gain, o = {}) {
  if (!mgr?.ctx || typeof url !== 'string' || mgr.volumes?.muted) return;
  stopSkillLoop(mgr, key);
  const loops = (mgr._skillLoops ||= new Map());
  const rec = { url, src: null, gain: null, stopped: false, fade: Number.isFinite(o.fade) && o.fade >= 0 ? o.fade : LOOP_FADE_S };
  loops.set(key, rec);
  Promise.resolve(mgr._buffer(url)).then((buf) => {
    if (!buf || rec.stopped || !mgr.ctx || loops.get(key) !== rec) return;
    try {
      const src = mgr.ctx.createBufferSource();
      src.buffer = buf;
      if (src.playbackRate) src.playbackRate.value = playPitch(bankPlayOf(mgr.getManifest?.(), url)); // 2026-10-10: its bank's pitch range
      src.loop = o.loop !== false;
      if (!src.loop) src.onended = () => { if (loops.get(key) === rec) loops.delete(key); };
      const g = mgr.ctx.createGain();
      g.gain.value = Math.max(0, Math.min(1.5, gain));
      src.connect(g); g.connect(sfxOut(mgr, url)); // local patch: 归溟幽灵鲨's held stand-in sound stays outside the snapshot bus
      src.start();
      rec.src = src; rec.gain = g;
    } catch { /* ignore */ }
  }, () => {});
}

/** Fade out and stop unit `key`'s loop (no-op without one). */
export function stopSkillLoop(mgr, key) {
  const rec = mgr?._skillLoops?.get(key);
  if (!rec) return;
  mgr._skillLoops.delete(key);
  rec.stopped = true;
  if (!rec.src || !mgr.ctx) return;
  try {
    const t = mgr.ctx.currentTime;
    rec.gain.gain.cancelScheduledValues(t);
    rec.gain.gain.setValueAtTime(rec.gain.gain.value, t);
    rec.gain.gain.linearRampToValueAtTime(0, t + rec.fade);
    rec.src.stop(t + rec.fade + 0.02);
  } catch { /* ignore */ }
}

/** local patch: stop every held sound of unit `id` — its loop (key `id`) and its held one-shots (keys `id:…`). */
export function stopUnitLoops(mgr, id) {
  const pre = `${id}:`;
  for (const key of [...(mgr?._skillLoops?.keys() || [])]) if (key === id || String(key).startsWith(pre)) stopSkillLoop(mgr, key);
}

/**
 * local patch: the extra one-shots of a unit's skill (sfx.units[defId].extras[skillIndex], tools/assets/
 * skill-mode-sfx.mjs skillExtras) — [{ url, grp?, vol?, stop? }], `stop` = cut with that fade when the skill ends.
 */
export const skillExtrasOf = (entry, skillIndex) => {
  const l = Number.isInteger(skillIndex) ? entry?.extras?.[skillIndex] : null;
  return Array.isArray(l) ? l.filter((x) => typeof x?.url === 'string') : [];
};

/**
 * 2026-10-29, docs/rules/audio.md 「스킬 시전 능력 소리」: a CastSkill's own ability cues (sfx.units[def].castCues[skillIndex],
 * skill-mode-sfx.mjs castCues), each with its wait in game seconds from the 'skill' event's `[strike, end]` (`at` 's' 0,
 * 'a' the strike, 'e' the end; without timing 0). [{ cue, after }]
 */
export const castCuesOf = (entry, skillIndex, timing) => {
  const l = Number.isInteger(skillIndex) ? entry?.castCues?.[skillIndex] : null;
  if (!Array.isArray(l)) return [];
  const t = Array.isArray(timing) ? timing : [];
  const after = (at) => { const v = at === 'a' ? t[0] : at === 'e' ? t[1] : 0; return Number.isFinite(v) && v > 0 ? v : 0; };
  return l.filter((c) => c && typeof c.u !== 'undefined').map((c) => ({ cue: c, after: after(c.at) }));
};

/** Stop every skill loop (a new field). */
export function stopSkillLoops(mgr) {
  for (const key of [...(mgr?._skillLoops?.keys() || [])]) stopSkillLoop(mgr, key);
}

/** The loop entry of a unit's skill (sfx.units[defId].loops[skillIndex]) or null. */
export const skillLoopOf = (entry, skillIndex) => (Number.isInteger(skillIndex) && entry?.loops?.[skillIndex]?.url ? entry.loops[skillIndex] : null);
/** Its gain: the bank's mixer group × its volume. */
export const loopGain = (loop) => groupGain(loop?.grp) * (Number.isFinite(loop?.vol) && loop.vol > 0 ? loop.vol : 1);

/**
 * local patch (maintainer report 2026-10-08 「이격 스펙터 S2 종료 후 대역 전환」): the sounds of a dollkeeper's form switch (sim
 * professions.js installDollkeeper: fx 'substitute' = to the <替身>, 'swap' = back to the 本体, 'dollEnd' = the 替身 knocked
 * out) as sfx.kit keys (tools/assets/kit-sfx.mjs): `play` one-shots, `hold` a one-shot held so the switch back cuts it
 * (`fade` s: its ctrlStop bank ghost2_stand_effect_end 0.8 s), `stop` = cut the held one. [추정] the stand-in's show
 * effect sounds with the switch (the buff's own timing is native code) and stops when she leaves the 替身.
 * @param {string} def the unit's model id
 * @param {string} fx the fx kind
 * @returns {{ play: string[], hold: { key: string, fade: number }|null, stop: boolean }|null}
 */
export function dollSwitchSfx(def, fx) {
  const d = DOLL_SFX[def];
  if (!d) return null;
  if (fx === 'substitute') return { play: d.on, hold: d.hold, stop: false };
  if (fx === 'swap') return { play: d.off, hold: null, stop: true };
  if (fx === 'dollEnd') return { play: [], hold: null, stop: true };
  return null;
}
const DOLL_SFX = Object.freeze({
  char_1023_ghost2: { on: ['ghost2:stand'], hold: { key: 'ghost2:standin', fade: 0.8 }, off: ['ghost2:normal'] },
});

/**
 * What one player's own normal battle costs at settlement outside a 联防: its counted leaks cut to the round's cap,
 * min(cap, counted) as Match.settle charges them — never the raw leak count (user report 2026-10-09: 17 leaks showed
 * 目标生命值减少 17 while the LP fell by 10). Uncounted leaks cost nothing.
 * @param {{ leaked?: Array<{ counted?: boolean }|null> }|null|undefined} pp that battle's perPlayer
 * @param {number} [cap] lpCapPerRound (no cap known → the official 10; Infinity: a custom 「解除上限」)
 * @returns {number}
 */
export function battleLossOf(pp, cap = 10) {
  const counted = (Array.isArray(pp?.leaked) ? pp.leaked : []).filter((l) => l && l.counted !== false).length;
  return Math.min(cap === Infinity ? Infinity : Number.isFinite(cap) && cap > 0 ? Math.trunc(cap) : 10, counted);
}

/**
 * The own battle's end (round_result_dialog, ui/phaseArt.js BattleEndBanner) as its official state + sound
 * (`ui.ON_ACT1AUTOCHESS_BATTLEOVER_*`, act1autochess custom SE — already in the manifest as sfx.ui.battleOver*), from
 * every player's LP loss in this result — the client's AutoChessBattleUIViewModel.GetBattleResultStatus
 * over the server's per-player hpCost list (maintainer decision 2026-10-11: match the client): every player lost 0 ⇒
 * 'perfect' / BATTLEOVER_NOREDUCE (panel_perfect); the viewer lost 0 but another player lost LP ⇒ 'done' /
 * BATTLEOVER_NORMAL (panel_miss, no number); the viewer lost LP ⇒ 'miss' / BATTLEOVER_REDUCE. The pairs are the
 * client's AutoChessBattleUIRoundResultDialog.OnRender. Leak counts and `perfect` play no part: a solo
 * battle with uncounted leaks only costs 0 ⇒ 'perfect'.
 * Who is in the result: the viewer alone when its own battle ends in a solo match (`{ [me]: battleLossOf(pp) }`), every
 * alive player's settlement charge at SETTLE (m.public.roundLosses) [추정: the client reads the dict from the server
 * packet; ours holds every alive player of the match].
 * @param {Record<string, number>|null|undefined} losses playerId → LP lost in this result
 * @param {string|null|undefined} selfId the viewer's playerId
 * @returns {{ kind: 'perfect'|'miss'|'done', lost: number, sfx: 'battleOverNoReduce'|'battleOverReduce'|'battleOverNormal' }}
 */
export function battleOverOf(losses, selfId) {
  const n = (v) => Math.max(0, Math.trunc(Number(v) || 0));
  const all = losses && typeof losses === 'object' ? Object.values(losses) : [];
  const lost = selfId != null && losses && typeof losses === 'object' ? n(losses[selfId]) : 0;
  if (lost > 0) return { kind: 'miss', lost, sfx: 'battleOverReduce' };
  if (all.every((v) => n(v) === 0)) return { kind: 'perfect', lost: 0, sfx: 'battleOverNoReduce' };
  return { kind: 'done', lost: 0, sfx: 'battleOverNormal' };
}

// ---- attack sound signals (2026-10-10, docs/rules/audio.md 「공격 소리 신호」) -----------------------------------
// sfx.units[id].cues / .sel (the Default mode) and modes[i].cues / .sel (a skill's mode or its own ability), written by
// tools/assets/skill-mode-sfx.mjs soundSet: cue = { at: 's' swing | 'a' strike | 'd' impact, u, g?, v?, p?, or?, ab?, k?, sp? }.

/**
 * The cue set an attack of unit entry `entry` sounds while skill `mode` (its index, null = none) runs: the mode's own
 * (`modes[mode].cues`, [] = it attacks in silence), else the Default's; null when the manifest has no cues (the role path).
 * @returns {{ cues: any[], sel?: any, mode: boolean }|null}
 */
export function cueSetOf(entry, mode, sub = null) {
  const m = Number.isInteger(mode) ? entry?.modes?.[mode] : null;
  // 2026-10-29: the mode the running skill switched to on the way (`modes[i].sub[fx]`, shared/skill-modes.js SKILL_SUB_MODES)
  const s = m && typeof sub === 'string' ? m.sub?.[sub] : null;
  if (s && Array.isArray(s.cues)) return { cues: s.cues, sel: s.sel, mode: true };
  if (m && Array.isArray(m.cues)) return { cues: m.cues, sel: m.sel, mode: true };
  return Array.isArray(entry?.cues) ? { cues: entry.cues, sel: entry.sel, mode: false } : null;
}

/** The ability of a strike: 'combat' for a melee one when the set has both, 'attack' for a ranged one; null with one kind. */
export function cueAbility(set, melee) {
  const kinds = new Set((set?.cues || []).map((c) => c?.ab).filter(Boolean));
  if (kinds.size < 2) return kinds.size ? [...kinds][0] : null;
  return melee ? 'combat' : 'attack';
}

/**
 * The group child an attack sounds (1-based) — the client's AbilityRandomGroup (Random: uniform, `diff` never the last one
 * twice, `once` each before any repeats; Loop: in turn) or a conditional group (`cond`: the melee / ranged child, `first` on
 * the mode's first attack); null without a group.
 * @param {any} sel the set's sel (by ability) @param {string|null} ab @param {{ melee: boolean, mem: any, random: => number }} o
 *   `mem` = this unit's memory for the set ({ last, bag, loop, first })
 */
export function pickVariant(sel, ab, o) {
  const s = sel ? (ab && sel[ab]) || (!ab ? Object.values(sel)[0] : null) : null;
  if (!s || !(s.n > 0)) return null;
  const mem = o.mem;
  const first = !mem.used;
  mem.used = true;
  let k;
  if (s.how === 'loop') k = (mem.loop ?? 0) % s.n + 1;
  else if (s.how === 'cond') k = first && s.first ? s.first : o.melee ? (s.melee ?? s.ranged ?? 1) : (s.ranged ?? 1);
  else if (s.how === 'rand') {
    if (s.once) {
      if (!mem.bag?.length) mem.bag = Array.from({ length: s.n }, (_, i) => i + 1);
      k = mem.bag.splice(Math.min(mem.bag.length - 1, Math.floor(o.random() * mem.bag.length)), 1)[0];
    } else {
      k = Math.min(s.n, Math.floor(o.random() * s.n) + 1);
      if (s.diff && s.n > 1 && k === mem.last) k = ((k - 1 + 1 + Math.floor(o.random() * (s.n - 1))) % s.n) + 1;
    }
  } else k = 1;
  mem.loop = k;
  mem.last = k;
  return k;
}

/** The cues of one moment of an attack: `at` of the chosen ability / child / spell (a cue without one belongs to every). */
export function cuesAt(set, at, ab, k, sp) {
  const hasK = (set?.cues || []).some((c) => c?.k != null && (c.ab == null || c.ab === ab));
  const kk = k ?? (hasK ? 1 : null);
  return (set?.cues || []).filter((c) => c && c.at === at && (c.ab == null || ab == null || c.ab === ab) && (c.k == null || c.k === kk)
    && (c.sp == null || c.sp === sp));
}

/**
 * The file one play of a cue sounds, its bank volume and its delay (s): one of `or` drawn by weight
 * (SoundFXBank._GenerateWeightedRandomSound), else `u`. null when the cue has none.
 */
export function cueFile(c, random = Math.random) {
  const or = Array.isArray(c?.or) ? c.or.filter((x) => typeof x?.u === 'string') : [];
  if (or.length) {
    const tot = or.reduce((a, x) => a + (x.w > 0 ? x.w : 0), 0);
    let r = random() * (tot || or.length);
    let x = or[or.length - 1];
    for (const y of or) { r -= tot ? (y.w > 0 ? y.w : 0) : 1; if (r < 0) { x = y; break; } }
    return { url: x.u, vol: Number.isFinite(x.v) ? x.v : (Number.isFinite(c.v) ? c.v : 1), delay: Number(x.dl) > 0 ? Number(x.dl) : 0 };
  }
  return typeof c?.u === 'string' ? { url: c.u, vol: Number.isFinite(c.v) ? c.v : 1, delay: Number(c.dl) > 0 ? Number(c.dl) : 0 } : null;
}
