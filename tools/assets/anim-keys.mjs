// Render roles from the client's clip keys (docs/rules/render.md 「Spine 클립 커버리지」 J). The client plays a clip by key
// only: an ability, a mode or a skill prefab names a key, the mode's animator hooker renames it (`_replaceAnimPairs`) and
// the skin's key table (chararts DefaultSkin SpineAnimator `_animations`) turns it into the skeleton's clip name. The keys
// come from tools/local-extract/anim_keys.py (.cache/anim-keys.json, client-only and never tracked — maintainer decision
// 2026-10-22); anim-roles.mjs's guess by name stays for the models without them (enemies, tokens).
//
// What the roles take from the keys:
//   idle / deploy / die  the Default mode's Idle / Born / Die (after its pairs)
//   attack               the Default mode's attack ability: a ThreePart attack's begin / oneshot / end, else its key; the
//                        begin / end of a plain key are the skin's mix clips from / to Idle (`_mixSettings`)
//   skills[i]            begin = the skill prefab's `_beginAnim` (`_playSkillBeginAnim`); a channel (`_default`) on the
//                        skill gives begin / loop / end; else loop = the skill's own ability key (an instant cast) or the
//                        attack of the mode the skill switches to (shared/skill-modes.js); idle = that mode's Idle pair;
//                        end = the skin's mix clip from the loop / idle to Idle; the finer rules (first-attack begins,
//                        closing abilities, emitted clips, held and facing modes) are at each step below
//   tables               the rows of the anim-overrides.mjs tables that the keys give (keyTables): attack clips taking
//                        turns, the blocked-enemy clip, facing-up clips, the held default mode's resting clips, the skill
//                        mode's Die / Stun / Born pairs, first-attack begins
import { skillModeIndex } from '../../shared/skill-modes.js';
import { putAlts, putCombat, putEquip, putUp, putFirst, putStates } from './anim-overrides.mjs';

const DIRECT = ['Body/Attack', 'Body/Combat', 'Attack', 'Combat', 'Body/Heal'];
const NESTED = ['Body/Attack/', 'Body/Combat/', 'Attack/'];
const NOT_ATTACK = /(^|\/)(GeneralAbilities|Talents|Trigger|Skills|CommonAbilities)(\/|$)/;
// an ability that opens or closes the others (折桠 S2 mode `FirstAttack`, 锏 S3 `EndAttack`, 乌尔比安 S3 `RespawnEnd`)
const FIRST = /(^|\/)First\w*$/;
const END = /(^|\/)\w*End\w*$/;

const clipKeyOf = (ab) => ab?.three?.oneshot || ab?.chan?.loop || (typeof ab?.key === 'string' ? ab.key : null);

/**
 * The normal-attack ability of a mode's abilities ({ path: ability }), as tools/local-extract/attack_timing.py picks it:
 * the direct one with a clip, else the shallowest named attack / combat below Body/Attack …, else another ability named
 * attack outside the talents and triggers; the direct one without a clip last (its key '' = no clip: a stance).
 */
export function attackAbility(abilities) {
  const p = attackPath(abilities);
  return p != null ? abilities[p] : null;
}

/** The path of attackAbility's pick in `abilities`, or null. */
export function attackPath(abilities) {
  const ab = abilities || {};
  const direct = DIRECT.find((p) => ab[p]);
  if (direct && clipKeyOf(ab[direct])) return direct;
  for (const pre of NESTED) {
    const sub = Object.keys(ab).filter((r) => r.startsWith(pre) && clipKeyOf(ab[r]));
    sub.sort((x, y) => (x.split('/').length - y.split('/').length) || (Number(FIRST.test(x)) - Number(FIRST.test(y)))
      || (Number(!/attack|combat/i.test(x.split('/').pop())) - Number(!/attack|combat/i.test(y.split('/').pop())))
      || (x < y ? -1 : x > y ? 1 : 0));
    if (sub.length) return sub[0];
  }
  const other = Object.keys(ab).filter((r) => clipKeyOf(ab[r]) && /attack|combat/i.test(r) && !NOT_ATTACK.test(r))
    .sort((x, y) => (x.split('/').length - y.split('/').length) || (x < y ? -1 : 1));
  if (other.length) return other[0];
  // an attack ability without a clip (`_animKey ""` = a stance: 信仰搅拌机 Sk3 `S3Attack`, 小满 S2 `S2`)
  const bare = Object.keys(ab).filter((r) => ab[r]?.key === '' && !ab[r].three && !ab[r].chan && /attack|^Body\/S\d/i.test(r) && !NOT_ATTACK.test(r))
    .sort((x, y) => (x.split('/').length - y.split('/').length) || (x < y ? -1 : 1));
  return direct ?? (bare.length ? bare[0] : null);
}

/**
 * Roles from the keys of one operator for one skeleton.
 * @param {any} op its record in .cache/anim-keys.json (`ops[charId]`)
 * @param {Record<string, number>} durations the skeleton's clips
 * @returns {{ idle: string|null, deploy: string|null, die: string|null, attack: any, skills: Record<string, any>,
 *   why: Record<string, string> }} `why`: per skill index, where its clip came from
 */
export function keyRoles(op, durations) {
  const has = (n) => typeof n === 'string' && Object.hasOwn(durations || {}, n);
  const skin = op?.skin?.keys || {};
  const modes = op?.modes || [];
  const pairs = (m) => modes[m]?.pairs || {};
  // a key through mode m's pairs and the skin table; null when the skeleton lacks the clip
  const J = (key, m = 0) => {
    if (typeof key !== 'string' || !key) return null;
    const k = pairs(m)[key] ?? key;
    const name = skin[k] ?? k;
    return has(name) ? name : null;
  };
  const mix = (from, to) => {
    const e = (op?.skin?.mix || []).find((x) => x[0] === from && x[1] === to && has(x[2]));
    return e ? e[2] : null;
  };
  const idle = J('Idle') ?? (has('Idle') ? 'Idle' : null);
  const out = { idle, deploy: J('Born'), die: J('Die'), attack: null, skills: {}, why: {} };
  const abClip = (ab, m) => {
    if (!ab) return null;
    // a ThreePart attack without an `_endAnim` closes on its ability's `_endAnimKey` as the attacks stop (Idle = none)
    if (ab.three) return { begin: J(ab.three.begin, m), loop: J(ab.three.oneshot, m), end: J(ab.three.end, m) ?? (ab.end !== 'Idle' ? J(ab.end, m) : null), first: !!ab.three.first };
    if (ab.chan) return { begin: J(ab.chan.begin, m), loop: J(ab.chan.loop, m), end: J(ab.chan.end, m), chan: true };
    if (typeof ab.key === 'string') return { begin: null, loop: ab.key ? J(ab.key, m) : null, end: null, after: J(ab.end, m), stance: ab.key === '' };
    return null;
  };
  const a0 = abClip(attackAbility(modes[0]?.abilities), 0);
  if (a0?.loop) {
    out.attack = { begin: a0.begin ?? mix(idle, a0.loop), loop: a0.loop, end: a0.end ?? mix(a0.loop, idle) };
    if (a0.first) out.attack.firstBegin = true;
  }
  const names = modes.map((m) => m.name);
  // per skill: its mode, whether that mode is the one it holds from the deployment, the ability whose clip is its loop
  const meta = {};
  const skillMode = (op?.skills || []).map((s) => (Number.isInteger(s?.mode) ? s.mode : null));
  (op?.skills || []).forEach((s, i) => {
    let m = names.length ? skillModeIndex(names, i, skillMode) : -1;
    // a mode per facing (灰毫 S2(U) / S2(D) / S2(LR)): the first whose attack this skeleton has — the side one on the front
    // skeleton, the up one on the back
    const dir = m > 0 ? /^(.*)\((U|D|LR)\)$/.exec(names[m]) : null;
    if (dir) {
      const n = ['LR', 'U', 'D'].map((d) => names.indexOf(`${dir[1]}(${d})`))
        .find((n) => n > 0 && abClip(attackAbility(modes[n]?.abilities), n)?.loop);
      if (n != null) m = n;
    }
    // a skill whose prefab makes its mode the default one (`_defaultModeIndex`, 望 S2) holds that mode from the deployment on:
    // its pairs are the operator's resting clips (anim-overrides.mjs EQUIP_ROLES), not the skill's
    const held = m > 0 && s?.defaultMode === m;
    const abs = s?.abilities || {};
    // the skill's own ability: its root, else the shallowest with a clip (隐德来希 S2 `Self` beside a clip-less `Ally`);
    // an ability that closes the others (`EndAttack`) is the skill's end
    const withClip = (p) => !!clipKeyOf(abs[p]) || !!abs[p]?.emit?.length;
    const endPath = Object.keys(abs).find((p) => p && END.test(p) && typeof abs[p]?.key === 'string' && abs[p].key);
    const castPath = Object.hasOwn(abs, '') && withClip('') ? ''
      : Object.keys(abs).filter((p) => withClip(p) && p !== endPath).sort((x, y) => x.split('/').length - y.split('/').length || (x < y ? -1 : 1))[0];
    const cast = castPath != null ? abClip(abs[castPath], m > 0 ? m : 0) : null;
    const ma = m > 0 && !held ? abClip(attackAbility(modes[m]?.abilities), m) : null;
    // the mode's first-attack ability beside its attack (折桠 S2 `FirstAttack`)
    const firstPath = m > 0 && !held ? Object.keys(modes[m]?.abilities || {}).find((p) => FIRST.test(p) && modes[m].abilities[p]?.key) : null;
    const sIdle = m > 0 && !held && pairs(m).Idle ? J('Idle', m) : null;
    const c = { begin: J(s?.begin), loop: null, end: endPath ? J(abs[endPath].key, m > 0 ? m : 0) : null, idle: sIdle !== idle ? sIdle : null, index: i };
    let why = [];
    let loopAb = null;
    if (endPath) why.push(`end ${endPath}`);
    if (held) why.push(`held ${names[m]}`);
    // another ability of the skill with a clip of its own (望 S3 `SpawnAnim` beside its channel)
    const other = Object.keys(abs).find((p) => p !== castPath && p !== endPath && clipKeyOf(abs[p]) && !abs[p].chan);
    if (cast?.chan && other && cast.loop && cast.loop === sIdle) {
      // a channel that holds the mode's Idle pair is the stance; the other ability's clip is the attack
      c.begin ??= cast.begin; c.end ??= cast.end; c.idle = cast.loop; c.loop = abClip(abs[other], m > 0 ? m : 0)?.loop ?? null; loopAb = abs[other];
      why.push(`chan ${castPath || 'root'} stance, attack ${other}`);
    } else if (cast?.chan) {
      c.begin ??= cast.begin; c.loop = cast.loop; c.end ??= cast.end; loopAb = abs[castPath]; why.push(`chan ${castPath || 'root'}`);
    } else if (cast?.loop) {
      c.loop = cast.loop; loopAb = abs[castPath]; why.push(`cast ${castPath || 'root'}`);
      // the skill's own ThreePart attack (信仰搅拌机 S1, 雪猎 S2): its begin opens the skill
      if (cast.begin) c.begin ??= cast.begin;
      if (cast.end) c.end ??= cast.end;
      // a one-shot cast before a mode that attacks with a clip of its own (余 S3 `CastAnimation`): the cast is the begin
      if (!cast.begin && !cast.end && !c.begin && sIdle && J(abs[castPath].end, m) === sIdle && ma?.loop && !ma.stance && ma.loop !== out.attack?.loop && ma.loop !== cast.loop) {
        c.begin = cast.loop; c.loop = null; loopAb = null; why.push('cast = begin');
      }
    }
    // the mode attacks with no clip: the skill's clip stays on as the stance (薄绿 S2 / 小满 S2 beside their own channel)
    if (ma?.stance && c.loop) { c.stance = true; why.push(`mode ${names[m]} stance`); }
    if (!c.loop && ma) {
      if (ma.stance) { c.stance = true; why.push(`mode ${names[m]} stance`); }
      else if (ma.loop && ma.loop !== out.attack?.loop) {
        c.loop = ma.loop; loopAb = attackAbility(modes[m]?.abilities); why.push(`mode ${names[m]} attack`);
        // an attack channel of the mode beside the skill's own begin (歌蕾蒂娅 S2): its begin / end frame each spell of attacks
        if (ma.chan && c.begin && ma.begin) { c.attackBegin = ma.begin; if (ma.end) c.attackEnd = ma.end; }
        // a ThreePart attack's begin opens its first attack only (送葬人 S2), else the skill
        if (ma.begin && ma.first) c.firstAttackBegin = ma.begin;
        else if (ma.begin && !c.begin) c.begin = ma.begin;
        // its end key closes a spell of attacks: back to the skill's own idle when it has one (`attackEnd`, 伺夜 S3
        // `Skill3_ABC_Idle_Into`), else the clip the renderer closes the attacks with (`end`, 送葬人 S2 `Skill_Right_End`)
        if (ma.end && ma.end !== c.loop) { if (c.idle) c.attackEnd = ma.end; else c.end ??= ma.end; }
        if (ma.after && ma.after !== idle && !c.idle) c.idle = ma.after;
      } else if (ma.loop) { c.plain = true; why.push(`mode ${names[m]} plain`); }
    }
    // a clip an ability emits as the skill starts (AnimationEmitBehaviour, 缄默德克萨斯 S2 / S3 `Start_n`) opens it
    const emitted = Object.values(abs).flatMap((a) => a?.emit || []).find((k) => k !== 'Idle' && J(k, m > 0 ? m : 0));
    if (emitted && !c.begin) { c.begin = J(emitted, m > 0 ? m : 0); why.push(`emit ${emitted}`); }
    // a first attack of its own (折桠 S2 `FirstAttack`, a whole attack, not a ThreePart begin): the sim times no such
    // attack, so its clip opens the skill [ASSUMED]
    if (firstPath && c.loop && !c.firstAttackBegin && !c.begin) {
      const f = J(modes[m].abilities[firstPath].key, m);
      if (f && f !== c.loop) { c.begin = f; why.push(`first ${firstPath}`); }
    }
    if (cast?.loop && cast.loop === out.attack?.loop && !c.begin) { c.loop = null; loopAb = null; why.push('cast = attack'); }
    // the modes around the skill's own (`<mode>_TakeOff` before it, `<mode>_End` / `_Landing` after it: 蒂比 S1, 纯烬艾雅法拉 S3)
    // attack once with its opening / closing clip
    const side = (suffixes) => {
      for (const suf of suffixes) {
        const n = m > 0 ? names.indexOf(`${names[m]}_${suf}`) : -1;
        const abs2 = modes[n]?.abilities || {};
        const a = n > 0 ? abClip(attackAbility(abs2) ?? Object.values(abs2).find((x) => clipKeyOf(x)), n) : null;
        if (a?.loop) return [a.loop, names[n]];
      }
      return [null];
    };
    const [sb, sbm] = side(['TakeOff']);
    if (!c.begin && sb) { c.begin = sb; why.push(`begin ${sbm}`); }
    const [se, sem] = side(['End', 'Landing']);
    if (!c.end && se) { c.end = se; why.push(`end ${sem}`); }
    // a stance (the mode attacks with no clip) or a mode without an attack: its Idle pair is the skill's clip
    if (!c.loop && c.idle && (c.stance || !ma)) { c.loop = c.idle; if (!c.stance) c.idle = null; }
    if (!c.end) c.end = mix(c.loop, idle) ?? (c.idle ? mix(c.idle, idle) : null);
    if (!c.begin && (c.idle || c.loop)) c.begin = mix(idle, c.idle ?? c.loop) ?? (c.idle && c.loop ? mix(idle, c.loop) : null);
    if (!c.loop && !c.begin && !c.idle) { why.push('attack'); c.via = 'attack'; }
    // no clip of its own for sure: no begin, no ability of its own with a clip but the plain attack's, and no mode or a mode
    // that attacks with the plain key and keeps Idle (白面鸮 S1 skcom_heal_up, 送葬人 S1, 跃跃 S1 — its ability is `Attack`)
    const castPlain = !cast || cast.loop === out.attack?.loop || (!cast.loop && !cast.begin);
    const modePlain = m <= 0 || (ma && !ma.stance && ma.loop === out.attack?.loop && !pairs(m).Idle && !sb && !se);
    if (!s?.begin && !endPath && castPlain && modePlain && !Object.values(abs).some((a) => a?.emit?.length)) c.clipless = true;
    out.skills[i] = c;
    out.why[i] = why.join(', ') || '-';
    meta[i] = { m, held, loopAb: c.loop ? loopAb : null };
  });
  out.tables = keyTables(op, out, meta, { J, pairs, abClip });
  return out;
}

/**
 * The rows of the anim-overrides.mjs tables that the keys give (overlayKeyRoles applies them with its appliers, before the
 * hand rows): ATTACK_ALTS (an AbilityRandomGroup / sequential ability group around an attack, an UberAnimationEffectEmitter's
 * `_replaceGroup`), COMBAT_CLIPS (the mode's `_combat` where its clip is not the attack's), UP_CLIPS (an `_upAnimKey`),
 * EQUIP_ROLES (the `_defaultModeIndex` mode's Born / Idle / attack), SKILL_STATE_CLIPS (the skill mode's Die / Stun / Born
 * pairs), FIRST_ATTACK_BEGIN (a ThreePart attack's first-attack begin).
 */
function keyTables(op, out, meta, { J, pairs, abClip }) {
  const modes = op?.modes || [];
  const tables = { alts: {}, combat: {}, up: {}, equip: {}, states: {}, first: {} };
  // the turns of an ability: its emitter's `_replaceGroup`, else the group it is a child of
  const turnsOf = (abs, path, m) => {
    const rec = abs?.[path];
    let alts, how;
    if (rec?.turns) {
      alts = rec.turns.anims.map((k) => J(k, m));
      how = { pick: rec.turns.loop === 1 ? 'random' : 'loop' };
    } else {
      const g = Object.values(abs || {}).find((a) => a?.group?.of?.includes(path))?.group;
      if (!g) return null;
      alts = g.of.map((q) => J(clipKeyOf(abs[q]), m));
      // AbilityRandomGroup `_selectMethod` 0 = random (`_diffFromLastOneIfNotFirst`: never the clip just played), 1 = in
      // turn from its second child (render.md B); a sequential AbilitySelectableGroup = in turn from the first
      how = g.seq ? { pick: 'loop' } : g.method === 0 ? { pick: g.diff ? 'other' : 'random' } : g.method === 1 ? { pick: 'loop', from: 1 } : null;
    }
    alts = [...new Set(alts.filter(Boolean))];
    return how && alts.length > 1 ? { alts, ...how } : null;
  };
  const addAlts = (abs, path, m) => {
    const tr = path != null ? turnsOf(abs, path, m) : null;
    if (tr) for (const n of tr.alts) tables.alts[n] ??= tr;
    return tr;
  };
  // a group's own record (仇白 `Body/Combat`) has no key: its children are the clips
  const combatOf = (m, than) => {
    const ab = modes[m]?.abilities || {};
    const cp = modes[m]?.combat;
    if (!cp || !ab[cp]) return null;
    if (ab[cp].group) {
      const g = ab[cp].group;
      const alts = [...new Set(g.of.map((q) => J(clipKeyOf(ab[q]), m)).filter(Boolean))];
      if (alts.length > 1 && g.method === 0) return { alts, pick: g.diff ? 'other' : 'random' };
      return alts.length === 1 && alts[0] !== than ? alts[0] : null;
    }
    const clip = abClip(ab[cp], m)?.loop;
    return clip && clip !== than ? clip : null;
  };
  modes.forEach((md, n) => addAlts(md.abilities, attackPath(md.abilities), n));
  const a0 = attackAbility(modes[0]?.abilities);
  if (out.attack) {
    const cb = combatOf(0, out.attack.loop);
    if (cb) tables.combat.attack = cb;
    const up = a0?.up ? J(a0.up, 0) : null;
    if (up) tables.up.attack = up;
    if (out.attack.firstBegin) tables.first.attack = { begin: out.attack.begin, end: out.attack.end };
  }
  (op?.skills || []).forEach((s, i) => {
    const c = out.skills[i];
    const { m, held, loopAb } = meta[i] || {};
    const mm = m > 0 ? m : 0;
    for (const p of Object.keys(s?.abilities || {})) if (s.abilities[p]?.turns) addAlts(s.abilities, p, mm);
    if (c?.loop && !c.via && !c.plain) {
      if (m > 0 && !held) {
        const cb = combatOf(m, c.loop);
        if (cb) (tables.combat.skills ||= {})[i] = cb;
      }
      const up = loopAb?.up ? J(loopAb.up, mm) : null;
      if (up && up !== c.loop) (tables.up.skills ||= {})[i] = up;
    }
    // the mode it holds from the deployment (`_defaultModeIndex`): its resting clips
    const dm = Number.isInteger(s?.defaultMode) && s.defaultMode > 0 ? s.defaultMode : null;
    const ap = dm != null && modes[dm] ? attackPath(modes[dm].abilities) : null;
    const at = ap != null ? abClip(modes[dm].abilities[ap], dm) : null;
    if (dm != null && /_TakeOff$/.test(modes[dm]?.name || '')) {
      // a take-off mode (予愿安洁莉娜 S1 `S1_TakeOff`): she deploys on its one attack, the take-off clip
      if (at?.loop && at.loop !== out.deploy) tables.equip[i] = { deploy: at.loop };
    } else if (dm != null && modes[dm]) {
      const e = {};
      const dep = pairs(dm).Born ? J('Born', dm) : null;
      if (dep && dep !== out.deploy) e.deploy = dep;
      const id = J('Idle', dm);
      if (id && id !== out.idle) e.idle = id;
      if (at?.loop && at.loop !== out.attack?.loop) {
        e.attack = { begin: null, loop: at.loop, end: null };
        const tr = turnsOf(modes[dm].abilities, ap, dm);
        if (tr) Object.assign(e.attack, tr);
      }
      if (Object.keys(e).length) tables.equip[i] = e;
    }
    // the skill's mode pairs Die / Stun / Born with clips of its own
    if (m > 0 && !held) {
      const st = {};
      for (const [f, key, base] of [['die', 'Die', out.die], ['stun', 'Stun', null], ['deploy', 'Born', out.deploy]]) {
        // (a Stun→Die pair, 耀骑士临光 S2, is not drawn: a stun keeps the Stun clip)
        const v = pairs(m)[key] && !(key === 'Stun' && pairs(m)[key] === 'Die') ? J(key, m) : null;
        if (v && v !== base && v !== key) st[f] = v;
      }
      if (Object.keys(st).length) tables.states[i] = st;
    }
  });
  return tables;
}

/**
 * Skills whose clips the keys do not settle yet: the guess by name and the hand tables (anim-overrides.mjs) stay. charId →
 * 0-based skill indices.
 */
export const KEY_ROLE_HOLD = Object.freeze({
  // 乌尔比安 S3: the cast `AOEAttack` (Skill_3_Begin), then the respawn modes S3_Respawn_A (Attack→Skill_3_Loop, Idle→Skill_3_Idle)
  // / S3_Restore, which no skill names; RespawnEnd closes it (anim-overrides.mjs SKILL_STATE_CLIPS deploys)
  char_4145_ulpia: [2],
  // 予愿安洁莉娜 S3 (CN client): `RestoreAbility` (Skill_3_Restart_Begin) is her restart after a knock-out, not the cast; the
  // take-off / 吟唱 / landing modes around S3 carry the clips
  char_1015_aglna2: [2],
  // 卡涅利安: every skill has a mode and an `_Enhance` mode (Skill_Loop / Skill_2_Loop and their Idle pairs) that the charge
  // stages switch between; which one the sim's stage is waits for the charge rule
  char_426_billro: [0, 1, 2],
});

/**
 * Lay the roles from the keys (keyRoles) over the resolver's guess by name (`anims`, mutated): idle / deploy / die where the
 * keys give a clip (they agree with the guess on every operator; the attack's exceptions — 玛恩纳's non-damaging Idle_2,
 * 丰川祥子's Combat first, 灰毫's melee / ranged pair — stay with the guess and units.js), and every skill but KEY_ROLE_HOLD's:
 * one without a clip of its own (`via: 'attack'`, no begin) or whose mode attacks with the plain clip attacks with the attack
 * role; else its begin / loop / end / idle, a mode attack's first-attack begin and spell end; then the table rows of
 * keyTables through the anim-overrides.mjs appliers. The hand tables (anim-overrides.mjs) and the mode-attack rule come after.
 * @param {any} anims resolveRoles output
 * @param {ReturnType<typeof keyRoles>} kr
 * @param {string} [charId]
 */
export function overlayKeyRoles(anims, kr, charId = '') {
  if (!anims || !kr) return anims;
  for (const f of ['idle', 'deploy', 'die']) if (kr[f]) anims[f] = kr[f];
  if (!anims.attack) return anims;
  const hold = KEY_ROLE_HOLD[charId] || [];
  for (const [i, k] of Object.entries(anims.skills ? kr.skills || {} : {})) {
    if (!k || hold.includes(Number(i)) || !Object.hasOwn(anims.skills, i)) continue;
    let c;
    if (k.via === 'attack' || k.plain || (!k.loop && !k.idle)) {
      c = { ...anims.attack, via: 'attack', index: Number(i), idle: null };
      if (k.begin) c.begin = k.begin;
      if (k.end && !k.clipless) c.end = k.end;
    } else {
      c = { begin: k.begin, loop: k.loop, end: k.end, idle: k.idle, index: Number(i) };
      for (const f of ['firstAttackBegin', 'attackBegin', 'attackEnd']) if (k[f]) c[f] = k[f];
      // the mode attacks with no clip (anim-overrides.mjs applyModeAttacks reads the same from the attack timing file, which
      // has nothing where the mode's attack is not `Body/Attack`: 信仰搅拌机 Sk3, 小满 S2, 薄绿 S2)
      if (k.stance) c.stance = true;
    }
    anims.skills[i] = c;
    if (anims.skill && anims.skill.index === Number(i)) anims.skill = c;
  }
  // the table rows the keys give; a row of the attack role only where the keys' attack is the resolver's (玛恩纳, 丰川祥子,
  // 灰毫 and the 阵法术师 without a Default attack differ: the attack role stays the guess)
  const tb = kr.tables || {};
  const same = !!(kr.attack && anims.attack.loop === kr.attack.loop);
  const skillsOnly = (row) => (row && !same ? { ...row, attack: undefined } : row);
  putAlts(anims, tb.alts || {});
  putCombat(anims, skillsOnly(tb.combat) || {});
  putEquip(anims, tb.equip || {});
  putUp(anims, skillsOnly(tb.up) || {});
  putFirst(anims, skillsOnly(tb.first) || {});
  putStates(anims, tb.states || {});
  return anims;
}
