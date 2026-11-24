// public/js/render/fx/pause.js — the client's effect behaviours that pause or finish their effect (2026-10-21, official
// client; docs/rules/fx.md 「이펙트 멈춤·끝 조건」): what each asks of the effect's owner, decided from a unit view as
// render/units.js keeps it (its flags, statuses, facing, sim animation and Spine clip). The extract carries them per node
// (tools/local-extract/fx_extract.py pause_scripts: `pauseIf`, `pauseAnim`, `pauseIdle`, `pauseSpine`, `finishIf`;
// `pauseOther` is played by render/fxgame.js stepPauses, which applies all of them).
// A term the view cannot answer (an operator's immunity, a buff of the client's templates outside SKILL_BUFFS, a mode index,
// a blackboard key) is left out as the client leaves out an unchecked one [ASSUMED: the conditions the remake cannot see are
// not met].

import { UF, ANIM } from '../../../../shared/constants.js';
import { UF_CAMOU } from '../../../../shared/local.js';
import { statusFxKey } from '../fxstatus.js';
import { LR_ADDON, parseDir } from '../face-turn.js';

/**
 * @typedef {{ flag?: string, immune?: string | number, combo?: string, back?: boolean, buff?: unknown, not?: boolean }} PauseTerm
 *   one `pauseIf` term
 */

/** Whether `v` wears a status whose effect key (render/fxstatus.js statusFxKey) is `name`. @param {any} v @param {string} name */
function wears(v, name) {
  if (!v?.statuses) return false;
  for (const k of v.statuses) if (statusFxKey(k) === name) return true;
  return false;
}

/**
 * Torappu.Battle.AbnormalFlag → whether the view's unit has it now; a flag missing here is not answered (null).
 * @type {Readonly<Record<string, (v: any) => boolean>>}
 */
const FLAGS = Object.freeze({
  STUNNED: (v) => !!((v.flags | 0) & UF.STUNNED),
  FROZEN: (v) => !!((v.flags | 0) & UF.FROZEN),
  COLD: (v) => !!((v.flags | 0) & UF.COLD),
  // 隐匿 / 迷彩 share the stealth bit; 迷彩 adds UF_CAMOU (render/fxstatus.js wantedStatusFx)
  INVISIBLE: (v) => ((v.flags | 0) & (UF.STEALTH | UF_CAMOU)) === UF.STEALTH,
  CAMOUFLAGE: (v) => ((v.flags | 0) & (UF.STEALTH | UF_CAMOU)) === (UF.STEALTH | UF_CAMOU),
  SILENCED: (v) => wears(v, 'silence'),
  FEARED: (v) => wears(v, 'fear'),
  DISARMED: (v) => wears(v, 'disarm'),
  DISARMED_COMBAT: (v) => wears(v, 'tremble'),
  LEVITATE: (v) => wears(v, 'levitate'),
});
/**
 * Torappu.Battle.AbnormalCombo (SLEEPING: 沉睡) → whether the unit has it; SHELTERING is not answered.
 * @type {Readonly<Record<string, (v: any) => boolean>>}
 */
const COMBOS = Object.freeze({ SLEEPING: (v) => !!((v.flags | 0) & UF.SLEEP) });

/**
 * 2026-10-27: Torappu.Battle.AbnormalFlag → the immunity an enemy record lists (data/enemies.json `stats.immunities`,
 * `otherImmunities`: the keys server/sim/simdata.js immuneSet makes). The flags missing here have no such key.
 * @type {Readonly<Record<string, string>>}
 */
const IMMUNE_KEYS = Object.freeze({
  STUNNED: 'stun', SILENCED: 'silence', FROZEN: 'frozen', LEVITATE: 'levitate', FEARED: 'feared', DISARMED_COMBAT: 'disarmedcombat',
});
/**
 * Whether enemy record `rec` is immune to AbnormalFlag `flag` (PauseEffectIf `_checkAbnormalImmune`), or null when it
 * cannot tell (no record, a flag without an immunity key) [추정·자료 없음: an immunity an ability or buff gives during the
 * battle is not in the view — the record's own is].
 * @param {any} rec data/enemies.json record
 * @param {string|number} flag
 * @returns {boolean|null}
 */
export function immuneTo(rec, flag) {
  const k = IMMUNE_KEYS[flag];
  const st = rec?.stats;
  if (!k || !st) return null;
  /** @param {unknown} x */
  const norm = (x) => String(x).replace(/Immune$/, '').toLowerCase();
  if (st.immunities && typeof st.immunities === 'object' && Object.entries(st.immunities).some(([x, on]) => on && norm(x) === k)) return true;
  return (st.otherImmunities || []).some((/** @type {unknown} */ x) => norm(x) === k);
}

/** The owner faces back: its Back model is drawn (UnitView.entryBack; before the model loads, a deploy facing UP). @param {any} v */
export const facesBack = (v) => !!(v && (v.entryBack ?? v.dir === 'UP'));

/**
 * 2026-11-16 (official client `SwitchableBackEffect._UpdateFace` / `_PredictFaceDirection`; fx_extract.py `back`): whether a
 * back switch `b` takes its owner `v` as facing back. Plain (`predict` 0): the Back model drawn (facesBack — the client's
 * `faceToBack`, the animator's side, which changes half way through a turn). `predict`: the face vector itself,
 * `MapUtil.ParseDirection(faceTo, 0.25)` == UP (render/face-turn.js parseDir with LR_ADDON) — not lagging behind the turn;
 * but while the deploy direction is UP the animator's side as plain (`_predictOnlyWhenDirectionNonBack`, on unless
 * `predictAll`). `preserve` (`_preserveBackWhenPredictingDirection`, only 유키 마코토's S3 casts — CN client only): the back side
 * kept while the face vector parses LEFT / RIGHT, as the model keeps its Back model beside an enemy (face-turn.js turnFace
 * `ud`) [추정·CN: read from the field's name only].
 * @param {{ predict?: unknown, predictAll?: unknown, preserve?: unknown } | null | undefined} b
 * @param {any} v
 */
export function backSide(b, v) {
  if (!b?.predict || !v) return facesBack(v);
  if (!b.predictAll && v.dir === 'UP') return facesBack(v);
  const to = v.face?.to;
  if (!to) return v.dir === 'UP';
  if (b.preserve && v.face.ud) return v.face.ud === 'UP';
  return parseDir(to.x, to.y, LR_ADDON) === 'UP';
}

/**
 * 2026-10-24 (묶음 S5): client buffs a skill gives its operator for its run, which a `buff` term names: key → skill index
 * (0–2). The view holds one while that skill runs (render/fxgame.js `_fxSkillOn`, its selected skill `info.skillIndex`).
 * 凛御银灰's 战鹰 on his arm (svash2_eagle_sit_*) hides through his S3: skchr_svash2_3's `_buffs` svash2_s_3[bird_eff]
 * [추정: INFINITY, it ends with the skill — the eagle_sit_01 the skill's end creates would stay hidden otherwise].
 */
/** @type {Readonly<Record<string, number>>} */
const SKILL_BUFFS = Object.freeze({ 'svash2_s_3[bird_eff]': 2 });
/**
 * 2026-11-16: client buffs a form holds, which a BuffsKeyAnimatorTrigger names: key → whether view `v` holds it.
 * 유키 마코토's makoto_standin — the sim kit (op-makoto.js setMode) puts it on with every <替身> form (`doll`, `orpheus`) and
 * takes it off with the way back to the <本体> (the view's `info.form`); his Stand_S2 attack (makoto_skill_02_start_01) fades
 * out on its `end` trigger when he turns back while it plays.
 */
/** @type {Readonly<Record<string, (v: any) => boolean>>} */
const FORM_BUFFS = Object.freeze({ makoto_standin: (v) => !!v.info?.form });
/** Whether view `v` holds client buff `key` (FORM_BUFFS), or null when the view cannot tell. @param {any} v @param {string} key */
export function viewHoldsBuff(v, key) {
  const f = v ? FORM_BUFFS[key] : null;
  return f ? f(v) : null;
}
/** @param {any} v @param {string[]} keys */
const holdsSkillBuff = (v, keys) => {
  const ks = keys.filter((k) => k in SKILL_BUFFS);
  if (!ks.length) return null;
  const i = Number.isInteger(v.info?.skillIndex) ? v.info.skillIndex : 0;
  return !!v._fxSkillOn && ks.some((k) => SKILL_BUFFS[k] === i);
};

/**
 * One `pauseIf` term on `v`: true / false, or null when the view cannot tell. `immune(v, flag)` answers an `immune` term
 * (render/fxgame.js: immuneTo of an enemy owner's record).
 * @param {PauseTerm} t
 * @param {any} v
 * @param {((v: any, flag: string|number) => boolean|null)|null} [immune]
 */
export function pauseTerm(t, v, immune = null) {
  let on = null;
  if (t.flag != null) on = FLAGS[t.flag]?.(v) ?? null;
  else if (t.immune != null) on = immune ? immune(v, t.immune) : null;
  else if (t.combo != null) on = COMBOS[t.combo]?.(v) ?? null;
  else if (t.back) on = facesBack(v);
  else if (Array.isArray(t.buff)) on = holdsSkillBuff(v, t.buff);
  if (on == null) return null;
  return t.not ? !on : on;
}

/**
 * PauseEffectIf (`GetCheckResult`): the terms combined in order — OR, AND with `all` (`_CombinePauseFlag`); null when no term was answered (the client then leaves the pause as it is: `_CheckPause`).
 * @param {{ when: PauseTerm[], all?: boolean }} rec node `pauseIf`
 * @param {any} v the owner's view
 * @param {((v: any, flag: string|number) => boolean|null)|null} [immune] see pauseTerm
 * @returns {boolean|null}
 */
export function pauseIfNow(rec, v, immune = null) {
  let r = null;
  for (const t of rec?.when || []) {
    const x = pauseTerm(t, v, immune);
    if (x == null) continue;
    r = r == null ? x : rec.all ? r && x : r || x;
  }
  return r;
}

/** The owner's current Spine clip (track 0), or null without a model. @param {any} v */
export function clipOf(v) {
  try { return v?.actor?.spine?.state?.getCurrent?.(0)?.animation?.name ?? null; } catch { return null; }
}

/**
 * PauseEffectWithAnimation (`_CheckPause`): the owner's clip `clip` asks for the pause when `valid` is given and
 * lacks it or `invalid` holds it (true), for the restore with `restore` (`_noPauseWhenValid`) otherwise (false), else
 * nothing (null); no clip: nothing.
 * @param {{ valid?: string[], invalid?: string[], restore?: unknown } | null | undefined} rec
 * @param {string | null | undefined} clip
 */
export function animPause(rec, clip) {
  if (!rec || !clip) return null;
  if ((rec.valid?.length && !rec.valid.includes(clip)) || rec.invalid?.includes(clip)) return true;
  return rec.restore ? false : null;
}

/**
 * PauseEffectIfNotMove (`Update`, 2026-10-25): paused while its owner, an Enemy, is not moving by itself
 * (`Enemy.isMovingBySelf` false — here the sim's animation state, ANIM.MOVE [ASSUMED]); any other owner: nothing (null).
 * @param {any} v
 */
export function movePause(v) {
  if (!v || v.info?.side !== 'enemy' || typeof v.anim !== 'number') return null;
  return v.anim !== ANIM.MOVE;
}

/**
 * PauseEffectIfNotIdle (`Update`): paused while the owner is not idle (`Character.isInIdletState` — here the
 * sim's animation state, ANIM.IDLE [ASSUMED]), or with the face checks while it faces back / front.
 * @param {{ back?: unknown, front?: unknown } | null | undefined} rec
 * @param {any} v
 */
export function idlePause(rec, v) {
  if (!v || typeof v.anim !== 'number') return null;
  if (v.anim !== ANIM.IDLE) return true;
  const back = facesBack(v);
  return !!((rec?.back && back) || (rec?.front && !back));
}

/**
 * 2026-11-16 (official client, SpecifyUnitModeEffect `OnPlay`): whether an effect whose root carries `unitMode` { i, pause? }
 * (fx_extract.py owner_follow) finishes at once because its owner's unit mode index `mode` is another — null `mode`: not
 * known, played. The pause variant (`pause`: paused instead, played again in mode `i` — `Update`) is not played: no extracted
 * prefab with an owner uses it, so it is played as it is.
 * @param {Record<string, any> | null | undefined} def
 * @param {unknown} mode
 */
export function unitModeFinishes(def, mode) {
  const u = def?.unitMode;
  return !!u && !u.pause && mode != null && mode !== u.i;
}
