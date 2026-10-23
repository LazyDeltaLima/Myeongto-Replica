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
//                        end = the skin's mix clip from the loop / idle to Idle
import { skillModeIndex } from '../../shared/skill-modes.js';

const DIRECT = ['Body/Attack', 'Body/Combat', 'Attack', 'Combat', 'Body/Heal'];
const NESTED = ['Body/Attack/', 'Body/Combat/', 'Attack/'];
const NOT_ATTACK = /(^|\/)(GeneralAbilities|Talents|Trigger|Skills|CommonAbilities)(\/|$)/;

const clipKeyOf = (ab) => ab?.three?.oneshot || ab?.chan?.loop || (typeof ab?.key === 'string' ? ab.key : null);

/**
 * The normal-attack ability of a mode's abilities ({ path: ability }), as tools/local-extract/attack_timing.py picks it:
 * the direct one with a clip, else the shallowest named attack / combat below Body/Attack …, else another ability named
 * attack outside the talents and triggers; the direct one without a clip last (its key '' = no clip: a stance).
 */
export function attackAbility(abilities) {
  const ab = abilities || {};
  const direct = DIRECT.map((p) => ab[p]).find((a) => a);
  if (direct && clipKeyOf(direct)) return direct;
  for (const pre of NESTED) {
    const sub = Object.keys(ab).filter((r) => r.startsWith(pre) && clipKeyOf(ab[r]));
    sub.sort((x, y) => (x.split('/').length - y.split('/').length)
      || (Number(!/attack|combat/i.test(x.split('/').pop())) - Number(!/attack|combat/i.test(y.split('/').pop())))
      || (x < y ? -1 : x > y ? 1 : 0));
    if (sub.length) return ab[sub[0]];
  }
  const other = Object.keys(ab).filter((r) => clipKeyOf(ab[r]) && /attack|combat/i.test(r) && !NOT_ATTACK.test(r))
    .sort((x, y) => (x.split('/').length - y.split('/').length) || (x < y ? -1 : 1));
  return other.length ? ab[other[0]] : direct || null;
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
  const skillMode = (op?.skills || []).map((s) => (Number.isInteger(s?.mode) ? s.mode : null));
  (op?.skills || []).forEach((s, i) => {
    const m = names.length ? skillModeIndex(names, i, skillMode) : -1;
    const abs = s?.abilities || {};
    // the skill's own ability: its root, else the shallowest with a clip (隐德来希 S2 `Self` beside a clip-less `Ally`)
    const withClip = (p) => !!clipKeyOf(abs[p]) || !!abs[p]?.emit?.length;
    const castPath = Object.hasOwn(abs, '') && withClip('') ? ''
      : Object.keys(abs).filter(withClip).sort((x, y) => x.split('/').length - y.split('/').length || (x < y ? -1 : 1))[0];
    const cast = castPath != null ? abClip(abs[castPath], m > 0 ? m : 0) : null;
    const ma = m > 0 ? abClip(attackAbility(modes[m]?.abilities), m) : null;
    const sIdle = m > 0 && pairs(m).Idle ? J('Idle', m) : null;
    const c = { begin: J(s?.begin), loop: null, end: null, idle: sIdle !== idle ? sIdle : null, index: i };
    let why = [];
    if (cast?.chan) {
      c.begin ??= cast.begin; c.loop = cast.loop; c.end = cast.end; why.push(`chan ${castPath || 'root'}`);
    } else if (cast?.loop) {
      c.loop = cast.loop; why.push(`cast ${castPath || 'root'}`);
    }
    if (!c.loop && ma) {
      if (ma.stance) { c.stance = true; why.push(`mode ${names[m]} stance`); }
      else if (ma.loop && ma.loop !== out.attack?.loop) {
        c.loop = ma.loop; why.push(`mode ${names[m]} attack`);
        if (ma.begin && !c.begin && !ma.first) c.begin = ma.begin;
        if (ma.after && ma.after !== idle && !c.idle) c.idle = ma.after;
      } else if (ma.loop) { c.plain = true; why.push(`mode ${names[m]} plain`); }
    }
    if (cast?.loop && cast.loop === out.attack?.loop && !c.begin) { c.loop = null; why.push('cast = attack'); }
    // the modes around the skill's own (`<mode>_TakeOff` before it, `<mode>_End` / `_Landing` after it: 蒂比 S1, 纯烬艾雅法拉 S3)
    // attack once with its opening / closing clip
    const side = (suffixes) => {
      for (const suf of suffixes) {
        const n = m > 0 ? names.indexOf(`${names[m]}_${suf}`) : -1;
        const a = n > 0 ? abClip(attackAbility(modes[n]?.abilities), n) : null;
        if (a?.loop) return [a.loop, names[n]];
      }
      return [null];
    };
    const [sb, sbm] = side(['TakeOff']);
    if (!c.begin && sb) { c.begin = sb; why.push(`begin ${sbm}`); }
    const [se, sem] = side(['End', 'Landing']);
    if (!c.end && se) { c.end = se; why.push(`end ${sem}`); }
    // a stance (the mode attacks with no clip) or a mode without an attack: its Idle pair is the skill's clip
    if (!c.loop && c.idle && (c.stance || !ma)) { c.loop = c.idle; c.idle = null; }
    if (!c.end) c.end = mix(c.loop, idle) ?? (c.idle ? mix(c.idle, idle) : null);
    if (!c.begin && (c.idle || c.loop)) c.begin = mix(idle, c.idle ?? c.loop) ?? (c.idle && c.loop ? mix(idle, c.loop) : null);
    if (!c.loop && !c.begin && !c.idle) { why.push('attack'); c.via = 'attack'; }
    // no clip of its own for sure: no begin, no ability of its own with a clip but the plain attack's, and no mode or a mode
    // that attacks with the plain key and keeps Idle (白面鸮 S1 skcom_heal_up, 送葬人 S1, 跃跃 S1 — its ability is `Attack`)
    const castPlain = !cast || cast.loop === out.attack?.loop || (!cast.loop && !cast.begin);
    const modePlain = m <= 0 || (ma && !ma.stance && ma.loop === out.attack?.loop && !pairs(m).Idle && !sb && !se);
    if (!s?.begin && castPlain && modePlain && !Object.values(abs).some((a) => a?.emit?.length)) c.clipless = true;
    out.skills[i] = c;
    out.why[i] = why.join(', ') || '-';
  });
  return out;
}

/**
 * Lay the roles from the keys (keyRoles) over the resolver's guess by name (`anims`, mutated). First step (2026-10-23):
 * idle / deploy / die where the keys give a clip (they agree with the guess on every operator; the attack's exceptions —
 * 玛恩纳's non-damaging Idle_2, 丰川祥子's Combat first, 灰毫's melee / ranged pair — stay with the guess and units.js), and
 * every skill that surely has no clip of its own (`clipless`) attacks with the attack role (`via: 'attack'`) instead of the
 * guess's clips of another skill. The other skills keep the guess; the hand tables (anim-overrides.mjs) and the mode-attack
 * rule come after.
 * @param {any} anims resolveRoles output
 * @param {ReturnType<typeof keyRoles>} kr
 */
export function overlayKeyRoles(anims, kr) {
  if (!anims || !kr) return anims;
  for (const f of ['idle', 'deploy', 'die']) if (kr[f]) anims[f] = kr[f];
  if (!anims.attack || !anims.skills) return anims;
  for (const [i, k] of Object.entries(kr.skills || {})) {
    if (!k?.clipless || !Object.hasOwn(anims.skills, i)) continue;
    const c = { ...anims.attack, via: 'attack', index: Number(i), idle: null };
    anims.skills[i] = c;
    if (anims.skill && anims.skill.index === Number(i)) anims.skill = c;
  }
  return anims;
}
