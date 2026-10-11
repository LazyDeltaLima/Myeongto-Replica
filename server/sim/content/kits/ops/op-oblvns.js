// server/sim/content/kits/ops/op-oblvns.js — 丰川祥子 (char_4182_oblvns) 自选 operator kit — local patch: the nas-local 선발
// kit (formerly kits/diy.js, docs/LOCAL-PATCH.md 「선발 오퍼레이터」) on upstream's 自选 framework. A collab operator upstream
// leaves out of the 自选 pool; the owner takes her in (shared/local-diy.js LOCAL_DIY_PICKS, tools/build-data.mjs). Kit
// contract: ../README.md ("How to add an operator (自选)"); `chess` = the composed 自选 record (shared/diy.js diyRecordOf).
// fx kinds the client draws / sounds from (render/fxgame.js / fxmap.js, audio.js kitHitKey): 'oblvnsNote' (each note's
// born / track / free / hit / gone, its mode `m`), 'sunBurst' (Fever), 'burst' (S1 note hits), 'spGain' (S2 timbre).
//
// 丰川祥子 (领主) — 颂乐音符 / 毋畏遗忘; S1 新月的苏醒, S2 满月的舞会, S3 残月的余响; Fever
//
// Trait (branch): ranged attacks at 80 % ATK. 颂乐音符: her attacks are homing notes; each note alive gives her (the only
// Ave Mujica member on a remake field) def_penetrate_ratio DEF / magic_resist_penetrate_ratio RES ignore, ≤ max_cnt.
// Notes (local patch 2026-10-06, EN client [uc]projectiles.ab projectile_chr_oblvns* + PRTS 备注; NOTE below): every
// note is simulated here (noteStep) — the engine projectile of a normal attack is taken over (its own onHit = the
// engine's resolveHit lands when the note arrives, with the ATK cached at the shot), skill / blank notes are the kit's. A note flies free (her facing ±20°,
// S1: a ±angle fan) for ≥ `switch` s, then traces its target (the attack's target; else the nearest selectable enemy within
// `seek` tiles of the NOTE, searched every `tick` s — PRTS "选择自身一定范围内距离音符自身最近的可选目标"); a target that
// dies sends it back to free flight. It ends on a hit, after `delay` (talent bb, client passby_delay 1 s) continuous s
// outside her attack range without a target (PRTS "音符位于自身攻击范围外时，若连续1s以上不存在跟踪目标则消失" — so notes
// fly past the range edge before they go). No timed lifetime: the prefabs' `_lifeTime` 10 has `_lifeTimeType` 2, a type
// that 57 client projectiles use with `_lifeTime` 0 (shields, rays living until their logic ends) — so not a timer
// [inference]; NOTE_SAFETY only bounds a note that could chase forever (a sim guard, not a game rule).
// When she leaves, every note not tracing is cleared (PRTS "自身退场时，清除所有不处于【跟踪移动】状态的音符"). The note
// count is the live notes (client: oblvns_t_1[cnt] +1 on a note's birth, −1 on its end). One note per attack (S2 Fever /
// S3 piano: 2, their profile hits), 8 per S1 cast, S3 + 2 organ notes. Each note change is a battle.fx 'oblvnsNote' event
// for the client's official note effect (render/fxgame.js).
// 持续攻击 (talent 1, local patch 2026-10-05; namu 4.6 / PRTS 备注): with no enemy in range she keeps attacking at her
// attack interval — each such attack recovers attack-type SP and plays an untargeted note (counts for the stacks), which
// hits whatever it finds near it with the ATK cached at its attack ("所有音符强制使用缓存攻击力与攻击倍率"). No note (and
// no attack) while the tile in front of her has 通行类型 无 (PRTS 备注). Client: 持续攻击 = "RangedAlways" abilities —
// projectile_chr_oblvns_talent (no skill), _s2_t / _s2_slow_t (S2), _s3_phy + _s3_mag (S3).
// Module LOR-Y stage 2+ (talent 1 fromModule): "技能期间远程攻击不再降低攻击力" — no 80 % cut while a skill is active.
// 毋畏遗忘: every damage instance of hers on an enemy (notes too): Fever +cnt; operators inside her current attack range,
// herself included (namu 4.6 "자신을 포함한"; S3's wider range counts), get ASPD +attack_speed (the 范围延伸 to other
// Ave Mujica members has nobody to apply to). Fever (gamedata_const: "Fever累计至450点时，任意一位Ave Mujica成员手动
// 触发技能后，在场所有Ave Mujica成员20秒内会持续释放当前技能"): a skill cast at ≥ 450 starts 20 s in which her skill
// recasts as soon as it ends, SP-free; S2 attacks hit twice; under S3 a fatal hit does not knock her out until it ends.
// S2 满月的舞会 (a mode, no duration): piano (start: ATK +attack@atk, phys) ↔ organ (ASPD +attack@attack_speed, arts);
// each cast switches [ASSUMED: the remake casts automatically, so a cast toggles the timbre].

import { COLS } from '../../../constants.js';
import { dirVec } from '../../../dir.js';
import { sortEnemyTargets, canTargetEnemy } from '../../../targeting.js';
import { talentBb, alliesInGridOf, installAura } from '../shared/tier1.js';
import { hypot, atan2, sin, cos } from '../../../detmath.js';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const live = (u) => !!u && u.alive && u.deployed && !u.removed && !u.hidden;
const selectedSkill = (chess, def) => chess?.skill?.skillId ?? def?.skill?.id ?? null;
const instantKind = (def) => ((def?.skill?.maxCharges ?? 1) > 1 ? 'charges' : 'instant');
const skillGridOf = (def) => (def?.skill?.rangeGrid?.length ? def.skill.rangeGrid : null);
const ANY = Object.freeze({ canHitFly: true });
const inRange = (battle, unit) => battle.enemiesInKeys(unit.rangeKeys || [], unit, ANY);
/** Per-battle state of this kit (by battle): the Fever gauge per player. */
const STATE = new WeakMap();
const bstate = (battle) => { let s = STATE.get(battle); if (!s) STATE.set(battle, (s = { fever: new Map() })); return s; };

const FEVER_NEED = 450, FEVER_TIME = 20, NOTE_SAFETY = 60;
/**
 * Note flight per client projectile prefab (tiles/s, s): `free` the free-flight speed (`sine`: its 扩张正弦 amplitude,
 * drawn by the client only — the sim flies straight), tracing at `track` turning `turn`/s (direction lerp; PRTS "转向速度
 * 7/30每帧" = 7 at 30 fps), free for ≥ `switch` s, target search every `tick` s within `seek` tiles of the note (PRTS
 * 跟踪范围半径), hit within `hit` tiles (piano: its 0.8 collision; others 0.1 — the client's tracing movement
 * AdvancedMovement.DoCheckReachedInternal reaches its target within 0.1; until 2026-10-10 0.2 [ASSUMED]), `fx` the client trail.
 * base = projectile_chr_oblvns (an attack with a target), talent = _talent (持续攻击 without a skill), s1 = _s1_1…8,
 * piano = _s2 / _s2_t, organ = _s2_slow / _s2_slow_t, s3 = _s3_phy (piano), s3m = _s3_mag (organ, the same movement).
 */
const NOTE = Object.freeze({
  base: { free: 2.0, track: 2.0, turn: 5, switch: 0.1, tick: 0.4, seek: 1.0, hit: 0.1 },
  talent: { free: 1.3, sine: 0.3, track: 2.0, turn: 7, switch: 0.1, tick: 0.4, seek: 1.0, hit: 0.1 },
  s1: { free: 1.7, track: 2.2, turn: 5, switch: 0.6, tick: 0.2, seek: 1.0, hit: 0.1 },
  piano: { free: 1.9, sine: 0.4, track: 3.5, turn: 15, switch: 0.4, tick: 0.2, seek: 0.8, hit: 0.8 },
  organ: { free: 0.7, sine: 0.15, track: 1.0, turn: 2.5, switch: 0.4, tick: 0.4, seek: 1.0, hit: 0.1 },
  s3: { free: 0.8, sine: 0.5, track: 1.3, turn: 7.5, switch: 0.8, tick: 0.4, seek: 1.0, hit: 0.1 },
  s3m: { free: 0.8, sine: 0.5, track: 1.3, turn: 7.5, switch: 0.8, tick: 0.4, seek: 1.0, hit: 0.1 },
});
/**
 * Free-flight spread around her facing (PRTS: "自身朝向左20°至右20°范围内，随机一个角度"). Skill notes too: the S2 / S3
 * blackboards carry no `angle`, and an attack's `attack@` keys reach its projectile's blackboard unprefixed (the piano
 * note's MovementSwitchControllerOblvns.Init reads `passby_delay` from projectile.blackboard — S2 `attack@passby_delay`),
 * so they read talent 1's `attack@angle` 20 (2026-10-10 client check; the merge itself not read).
 */
const NOTE_ARC = 20;
let noteSeq = 0;
/** The note flight table (render/fxmap.js NOTE_FLIGHT draws with a copy; test/local-patch-diy.test.js compares them). */
export const OBLVNS_NOTE = NOTE;

function sakiko(bb, chess, def) {
  const t0 = talentBb(chess, 0), t1 = talentBb(chess, 1);
  const sid = selectedSkill(chess, def);
  const perDef = num(t0.def_penetrate_ratio, 0.03), perRes = num(t0.magic_resist_penetrate_ratio, 0.02), maxNotes = num(t0.max_cnt, 10);
  const noteDelay = num(t0.delay, 1);
  /** The movement key of her current attack notes (the client's projectile of the ability she attacks with). */
  const modeOf = (unit, blank = false) => (s3On(unit) ? 's3' : sid === 'skchr_oblvns_2' ? (unit.mem.timbre === 'organ' ? 'organ' : 'piano') : blank ? 'talent' : 'base');
  const skillNoRangedCut = !!(chess?.talents ?? []).find((t) => t && t.index === 0)?.fromModule; // LOR-Y stage 2+
  const s3On = (unit) => !!unit.skill?.active && unit.skill.id === 'skchr_oblvns_3';
  const feverOf = (battle, unit) => {
    const m = bstate(battle).fever;
    let f = m.get(unit.ownerId);
    if (!f) m.set(unit.ownerId, (f = { gauge: 0, until: -1 }));
    return f;
  };
  const inFever = (battle, unit) => feverOf(battle, unit).until > battle.time;
  const startFeverIfFull = (battle, unit) => {
    const f = feverOf(battle, unit);
    if (f.gauge >= FEVER_NEED && f.until <= battle.time) {
      f.gauge = 0; f.until = battle.time + FEVER_TIME;
      battle.fx('sunBurst', { x: unit.x, y: unit.y, id: unit.id });
    }
  };
  // Fever "持续释放当前技能": the skill is cast again, SP-free, as soon as its skill ability is available again (client
  // `CastSkill.IsAvailable` → `Ability.isReady`: S1's cooldown of one attack interval and its Skill_1 action — the engine's
  // `skill.nextCastAt`, set right after this onEnd), not on a fixed short delay (that recast S1 every 0.05 s, cutting
  // every swing in its skill state and doubling the casts)
  const recastInFever = { onEnd({ battle, unit, reason }) {
    if (reason === 'stopped' || !inFever(battle, unit) || !live(unit)) return;
    const seq = unit.deploySeq;
    const tryCast = () => {
      if (unit.deploySeq !== seq || !live(unit) || !unit.skill || unit.skill.active || !inFever(battle, unit)) return;
      const wait = (unit.skill.nextCastAt ?? 0) - battle.time;
      if (wait > 1e-9) { battle.after(wait, tryCast, { owner: unit }); return; }
      unit.skill.gainSp(999, 'fever');
      unit.skill.activate?.('fever');
    };
    battle.after(0.05, tryCast, { owner: unit });
  } };
  // ---- notes (local patch 2026-10-06): see the header. A note: { id, mode, x, y, dx, dy, age, state 'free'|'track',
  // target, seekT, outT, w (count: 2 = a two-hit note), hit(target) }
  const notesOf = (unit) => unit.mem.noteList || (unit.mem.noteList = []);
  const noteFx = (battle, unit, n, e, extra = null) => battle.fx('oblvnsNote', {
    x: n.x, y: n.y, id: unit.id, n: n.id, e, m: n.mode, a: Math.round((atan2(n.dy, n.dx) * 180) / Math.PI),
    ...(n.target ? { t: n.target.id } : null), ...(n.w > 1 ? { w: n.w } : null), ...(n.fan ? { i: n.fan } : null), ...extra,
  });
  /**
   * A new note from her position: `deg` its free-flight heading off her facing (default: random ±NOTE_ARC), `target`
   * the attack's target (traced after the free flight), `hit(target)` its damage, `w` how many notes it stands for.
   */
  const spawnNote = (battle, unit, { mode, target = null, hit, w = 1, deg = null, fan = 0 }) => {
    const [dr, dc] = dirVec(unit.dir);
    const off = ((deg ?? (battle.rng() * 2 - 1) * NOTE_ARC) * Math.PI) / 180;
    const base = atan2(dr, dc);
    const n = { id: ++noteSeq, mode, x: unit.x, y: unit.y, dx: cos(base + off), dy: sin(base + off), age: 0, state: 'free',
      target: target && target.alive ? target : null, seekT: 0, outT: 0, w, hit, fan };
    notesOf(unit).push(n);
    noteFx(battle, unit, n, 'born');
    return n;
  };
  const noteTargetOk = (t) => !!t && t.alive && !t.hidden && t.deployed !== false && canTargetEnemy(null, t, ANY);
  /** One sim step of her notes (the 'tick' hook, after the projectiles phase). */
  const noteStep = (battle, unit, dt) => {
    const list = unit.mem.noteList;
    if (!list || !list.length) return;
    const home = live(unit);
    const keys = home ? unit.rangeKeySet || new Set(unit.rangeKeys || []) : null;
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i], mv = NOTE[n.mode];
      const end = (e, extra) => { list.splice(i, 1); noteFx(battle, unit, n, e, extra); };
      if (!home && n.state !== 'track') { end('gone'); continue; }   // she left: only the tracing notes stay
      n.age += dt;
      if (n.target && !noteTargetOk(n.target)) {   // its target is gone: free flight on in the current direction
        n.target = null;
        if (n.state === 'track') { n.state = 'free'; noteFx(battle, unit, n, 'free'); }
        if (!home) { end('gone'); continue; }
      }
      if (!n.target && (n.seekT -= dt) <= 0) {
        n.seekT = mv.tick;
        let best = null, bd = Infinity;
        for (const e of battle.foesInRadius(n.x, n.y, mv.seek, true)) {
          if (!noteTargetOk(e)) continue;
          const d = hypot(e.x - n.x, e.y - n.y);
          if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && best && e.spawnSeq < best.spawnSeq)) { bd = d; best = e; }
        }
        n.target = best;
      }
      if (n.state === 'free' && n.target && n.age >= mv.switch) { n.state = 'track'; noteFx(battle, unit, n, 'track'); }
      let speed = mv.free;
      if (n.state === 'track') {
        speed = mv.track;
        const tx = n.target.x - n.x, ty = n.target.y - n.y, d = hypot(tx, ty);
        if (d <= Math.max(mv.hit, speed * dt)) { const t = n.target; end('hit'); battle._safe(() => n.hit(t, n), 'oblvns.note', unit); continue; }
        const k = Math.min(1, mv.turn * dt);
        let ndx = n.dx + (tx / d - n.dx) * k, ndy = n.dy + (ty / d - n.dy) * k;
        const l = hypot(ndx, ndy);
        if (l > 1e-6) { n.dx = ndx / l; n.dy = ndy / l; } else { n.dx = tx / d; n.dy = ty / d; }
      }
      n.x += n.dx * speed * dt; n.y += n.dy * speed * dt;
      if (n.age >= NOTE_SAFETY) { end('gone'); continue; }   // the sim guard only (see the header)
      const inside = home && keys.has(Math.round(n.y) * COLS + Math.round(n.x));
      n.outT = inside || n.target ? 0 : n.outT + dt;
      if (n.outT >= noteDelay) end('gone');
    }
  };
  /** S3: the 2 organ notes of an attack (_s3_mag, arts, attack@atk_scale with the ATK of the attack), 0.1 s apart. */
  const s3Organ = (battle, unit, target) => {
    const seq = unit.deploySeq, amount = unit.s.atk * num(bb['attack@atk_scale'], 1.8);
    for (let i = 0; i < 2; i++) {
      battle.after(0.1 * (i + 1), () => {
        if (unit.deploySeq !== seq || !live(unit)) return;
        spawnNote(battle, unit, { mode: 's3m', target: target && target.alive ? target : null,
          hit: (t) => battle.dealDamage(unit, t, { amount, type: 'arts', isAttack: true, tags: ['note'] }) });
      }, { owner: unit });
    }
  };
  /** Live notes (the 颂乐音符 count). */
  const noteCount = (unit) => (unit.mem.noteList || []).reduce((a, n) => a + n.w, 0);
  return {
    skills: {
      // 新月的苏醒 (charges 2): 8 notes, arts, decreasing scales, fanned over the enemies of her range
      skchr_oblvns_1: {
        kind: instantKind(def),
        onStart({ battle, unit }) {
          startFeverIfFull(battle, unit);
          const scales = [bb.atk_scale, bb.atk_scale_2, bb.atk_scale_3, bb.atk_scale_4, bb.atk_scale_5, bb.atk_scale_6, bb.atk_scale_7, bb.atk_scale_8].map((v) => num(v));
          const seq = unit.deploySeq, fanAngle = num(bb.angle, 15);
          // local patch 2026-10-06: 8 notes (client projectile_chr_oblvns_s1_1…8), each at an enemy of her range, the
          // damage (ATK cached at the cast) when it arrives. Their free flight fans around her facing (2026-10-10, client
          // code BasicMovement._InitDirectionByStart with `_useSourceDirectionArcAngleWithRatio`): angle × (2·ratio − 1),
          // ratio = `_sourceDirectionArcAngleRatio` (2i+1)/16, angle = the skill blackboard `angle` (15) → ±13.125° in
          // 3.75° steps (until then (2i+1)/16 of a full turn [ASSUMED]). The side: client code LitePhysicsUtil.Rotate
          // (RVA 0x6ABC70) = Quaternion.AngleAxis(a, up) · dir with up (0,0,−1), so a negative a turns counter-clockwise —
          // note 1 (a = −13.125°, the 1.0× one) leaves to the LEFT of her facing, note 8 to the right (maintainer decision
          // 2026-10-11: the official sign; until then the mirror image). [ASSUMED: battle world x = column, y = row (screen
          // up), height −z — the premise of that sign, not checked on screen.] Here + = counter-clockwise (spawnNote).
          scales.forEach((s, i) => battle.after(0.06 * i, () => {
            if (unit.deploySeq !== seq || !live(unit)) return;
            const pool = inRange(battle, unit);
            if (pool.length) sortEnemyTargets(battle, unit, pool, null);
            const amount = unit.s.atk * s;
            spawnNote(battle, unit, { mode: 's1', target: pool.length ? pool[i % pool.length] : null, deg: -fanAngle * (2 * ((2 * i + 1) / 16) - 1), fan: i + 1,
              hit: (t) => {
                battle.fx('burst', { x: t.x, y: t.y, id: unit.id });
                battle.dealDamage(unit, t, { amount, type: 'arts', isSkill: true, tags: ['skill', 'note'] });
              } });
          }, { owner: unit }));
        },
        ...recastInFever,
      },
      // 满月的舞会: a cast switches the timbre (piano first)
      skchr_oblvns_2: {
        kind: 'instant',
        onStart({ battle, unit }) {
          startFeverIfFull(battle, unit);
          unit.mem.timbre = unit.mem.timbre === 'piano' ? 'organ' : 'piano';
          unit.mem.applyTimbre?.();
          battle.fx('spGain', { x: unit.x, y: unit.y, id: unit.id });
        },
      },
      // 残月的余响: range 3-21; each attack: 2 piano notes (phys) at the highest-RES enemy + 2 organ notes (arts) at the
      // highest-DEF one, attack@atk_scale each
      skchr_oblvns_3: {
        kind: 'duration',
        targeting: { rangeGrid: skillGridOf(def), showOwnRange: true },
        attack: { atkScale: num(bb['attack@atk_scale'], 1.8), hits: 2, dmgType: 'phys' },
        onStart({ battle, unit }) { startFeverIfFull(battle, unit); },
        ...recastInFever,
      },
    },
    talents: [
      { install(battle, unit) { // 颂乐音符: DEF / RES ignore per live note; 持续攻击; module: no ranged cut during a skill
        // local patch 2026-10-06: her attack's engine projectile becomes a note — taken off the projectile list the moment
        // it is fired (ai.js performAttack emits 'attack' right after adding it) and flown by noteStep; its own onHit
        // (resolveHit: profile damage type, hits, ranged cut, attackId) lands when the note arrives, on the note's target
        // then, with her ATK and 攻击倍率 multiplier at the shot (`projectile.cachedAtk`): every attack ability of her
        // charpack (all 24: Default Combat / RangedMulti / RangedAlways, the S2 and S3 attacks) has RangedAttack
        // `_useCachedAtkOnly` 1 — damage from the ATK cached when the projectile is fired (2026-10-10 client check; until
        // then [ASSUMED] her ATK at arrival).
        battle.on('attack', (c) => {
          if (c.attacker !== unit) return;
          const P = battle.projectiles;
          const mine = P.list.filter((p) => p.source === unit && p.age === 0 && p.onHit);
          if (!mine.length) return;
          P.list = P.list.filter((p) => !mine.includes(p));
          const mode = modeOf(unit), w = Math.max(1, num(battle.effectiveProfile(unit)?.hits, 1)); // S3's hits: 2 is a skill override
          const cachedAtk = { atk: unit.s.atk, atkScaleMul: unit.s.atkScaleMul };
          for (const p of mine) {
            p.cachedAtk = cachedAtk;
            spawnNote(battle, unit, { mode, target: p.target, w, hit: (t, n) => p.onHit({ battle, projectile: p, target: t, x: n.x, y: n.y }) });
          }
        }, { owner: unit });
        // 持续攻击 (local patch): the step's attack loop (ai.js updateAlly, before 'tick') found no target — attack anyway.
        // The notes fly every step here (owner-bound hooks stay after she leaves: tracing notes still land).
        battle.on('tick', () => {
          noteStep(battle, unit, battle.dt);
          if (!live(unit) || !unit.canAct || !unit.profile) return;
          if (unit.blocking.length || unit.atkCd > 0 || unit.s.flags.disarm || inRange(battle, unit).length) return;
          const [dr, dc] = dirVec(unit.dir);
          const fr = unit.tileR + dr, fc = unit.tileC + dc;
          if (!battle.grid.inRect(fr, fc) || battle.grid.tile(fr, fc).pass === 'NONE') return;   // PRTS: no note to play
          unit.atkCd = unit.s.interval;
          // the skill-applied profile (ai.js effectiveProfile — S3's atk_scale / hits / phys are a skill override; review
          // 2026-10-06: unit.profile is the base one, so S3 blank notes were 1 hit at 1.0 × ATK)
          const prof = battle.effectiveProfile(unit);
          battle._ev(['atk', unit.id, null, prof.projectile || 'arrow']);   // the attack clip, no target
          // the cached ATK × attack scale of this attack; S2 organ: arts (its profile copy); S2 Fever / S3: two hits
          const atk = unit.s.atk * num(prof.atkScale, 1) * num(unit.s.atkScaleMul, 1);
          const type = prof.dmgType === 'arts' ? 'arts' : 'phys', hits = Math.max(1, num(prof.hits, 1));
          spawnNote(battle, unit, { mode: modeOf(unit, true), w: hits, hit: (t) => {
            const dm = prof.dmgMul;
            const cut = skillNoRangedCut && unit.skill?.active ? 1 : num(typeof dm === 'function' ? dm(battle, unit, t) : dm, 1);
            for (let h = 0; h < hits && t.alive; h++) battle.dealDamage(unit, t, { amount: atk * cut, type, isAttack: true, tags: ['note', 'blankNote'] });
          } });
          if (s3On(unit)) s3Organ(battle, unit, null);   // S3: + 2 organ notes (_s3_mag)
          const sk = unit.skill;   // attack-type SP, as for any attack that is not a skill attack (skills.js onAttackPerformed)
          if (sk && !sk.noSkill && sk.spType === 'attack' && !(sk.active && sk.isTimed)) sk.gainSp(1, 'attack');
        }, { owner: unit });
        // LOR-Y stage 2+: "技能期间远程攻击不再降低攻击力" — undo the trait's ranged cut on her attacks while a skill runs
        if (skillNoRangedCut) battle.on('hit', (c) => {
          const d = c.dmg;
          if (c.source !== unit || !d?.isAttack || !unit.skill?.active || d.tags?.includes('note')) return;
          const dm = unit.profile?.dmgMul;
          const m = num(typeof dm === 'function' ? dm(battle, unit, c.target) : dm, 1);
          if (m > 0 && m < 1) d.amount /= m;
        }, { owner: unit });
        battle.every(0.25, () => {
          const n = Math.min(maxNotes, noteCount(unit));
          if (unit.mem.notes === n) return;
          unit.mem.notes = n;
          battle.addBuff(unit, { key: 'oblvns:notes', duration: Infinity, mods: { defIgnorePct: perDef * n, resIgnorePct: perRes * n } });
        }, { owner: unit });
      } },
      { install(battle, unit) { // 毋畏遗忘: Fever per damage instance on an enemy; ASPD to the operators of her range
        const gain = num(t1.cnt, 3);
        battle.on('damaged', (c) => {
          if (c.source !== unit || !(c.amount > 0) || c.target?.side !== 'enemy') return;
          const f = feverOf(battle, unit);
          if (f.until <= battle.time) f.gauge = Math.min(FEVER_NEED, f.gauge + gain);
        }, { owner: unit });
        // local patch: her current attack range (S3's wider one too), herself included (namu 4.6)
        installAura(battle, unit, {
          key: 'oblvns:aspd', mods: { aspd: num(t1.attack_speed, 12) }, value: num(t1.attack_speed, 12),
          select: (a) => a.kind === 'op' && alliesInGridOf(battle, unit, null).includes(a),
        });
      } },
    ],
    install(battle, unit) {
      // module trait: ASPD while 2+ enemies are in range
      const mAspd = num(chess?.trait?.bb?.attack_speed, 0);
      if (mAspd) {
        battle.every(0.25, () => {
          if (!live(unit)) return;
          const want = inRange(battle, unit).length >= 2;
          const has = unit.buffs.some((b) => b.key === 'oblvns:mod');
          if (want && !has) battle.addBuff(unit, { key: 'oblvns:mod', duration: Infinity, mods: { aspd: mAspd } });
          else if (!want && has) battle.removeBuff?.(unit, 'oblvns:mod');
        }, { owner: unit });
      }
      if (sid === 'skchr_oblvns_2') {
        // the timbre (piano by default once she is on the field): mods + damage type; Fever: two hits.
        // local patch 2026-10-06: the damage type / hits live on her own profile (a copy of the resolved one, like
        // tier5.js) — ai.js performAttack never reads back a `beforeAttack` ctx.profile, so organ stayed phys and the
        // Fever double hit never happened. Re-applied when Battle._setupUnit resolves a fresh profile.
        unit.mem.timbre = 'piano';
        // every step (scheduled phase, before the allies attack) and at once when S2 switches (review 2026-10-06: at
        // 0.2 s the first attacks after a switch kept the old damage type)
        const applyTimbre = unit.mem.applyTimbre = () => {
          if (!live(unit)) return;
          const piano = unit.mem.timbre !== 'organ';
          const fever = inFever(battle, unit);
          const k = `${piano ? 'p' : 'o'}${fever ? 'F' : ''}`;
          if (unit.mem.timbreKey === k && unit.profile === unit.mem.timbreProfile) return;
          if (unit.mem.timbreKey !== k) {
            unit.mem.timbreKey = k;
            battle.addBuff(unit, { key: 'oblvns:timbre', duration: Infinity, mods: piano ? { atkPct: num(bb['attack@atk'], 0.75) } : { aspd: num(bb['attack@attack_speed'], 110) } });
          }
          if (unit.profile !== unit.mem.timbreProfile) unit.mem.timbreBase = unit.profile;
          const base = unit.mem.timbreBase;
          if (!base) return;
          unit.profile = unit.mem.timbreProfile = { ...base, dmgType: piano ? 'phys' : 'arts', hits: fever ? 2 : (base.hits ?? 1) };
        };
        battle.every(battle.dt, applyTimbre, { owner: unit, immediate: true });
      }
      if (sid === 'skchr_oblvns_3') {
        // S3 targets: the piano notes at the highest-RES enemy; the organ notes (arts) at the highest-DEF one
        battle.on('beforeAttack', (ctx) => {
          if (ctx.attacker !== unit || !unit.skill?.active || unit.skill.id !== 'skchr_oblvns_3') return;
          const pool = inRange(battle, unit);
          if (!pool.length) return;
          const byRes = [...pool].sort((a, b) => num(b.s?.res) - num(a.s?.res))[0];
          const byDef = [...pool].sort((a, b) => num(b.s?.def) - num(a.s?.def))[0];
          ctx.targets = [byRes];
          s3Organ(battle, unit, byDef);
        }, { owner: unit });
        // Fever: a fatal hit does not knock her out while S3 runs in Fever; she leaves when the Fever ends
        battle.on('fatal', (c) => {
          if (c.unit !== unit || !unit.skill?.active || unit.skill.id !== 'skchr_oblvns_3' || !inFever(battle, unit)) return;
          c.prevented = true;
          if (!unit.mem.feverLeave) {
            unit.mem.feverLeave = true;
            const f = feverOf(battle, unit);
            battle.after(Math.max(0.05, f.until - battle.time), () => { unit.mem.feverLeave = false; if (live(unit)) battle.retreat(unit, { reason: 'retreat' }); }, { owner: unit });
          }
        }, { owner: unit });
      }
    },
  };
}

export default {
  char_4182_oblvns: (bb, chess, def) => sakiko(bb, chess, def),
};
