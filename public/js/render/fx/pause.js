// public/js/render/fx/pause.js — the client's effect behaviours that pause or finish their effect (2026-10-21, official
// client; docs/rules/fx.md 「이펙트 멈춤·끝 조건」): what each asks of the effect's owner, decided from a unit view as
// render/units.js keeps it (its flags, statuses, facing, sim animation and Spine clip). The extract carries them per node
// (tools/local-extract/fx_extract.py pause_scripts: `pauseIf`, `pauseAnim`, `pauseIdle`, `pauseSpine`, `finishIf`;
// `pauseOther` is played by render/fxgame.js stepPauses, which applies all of them).
// A term the view cannot answer (an immunity, a buff of the client's templates outside SKILL_BUFFS, a mode index, a
// blackboard key) is left out as the client leaves out an unchecked one [ASSUMED: the conditions the remake cannot see are
// not met].

import { UF, ANIM } from '../../../../shared/constants.js';
import { UF_CAMOU } from '../../../../shared/local.js';
import { statusFxKey } from '../fxstatus.js';

/** Whether `v` wears a status whose effect key (render/fxstatus.js statusFxKey) is `name`. */
function wears(v, name) {
  if (!v?.statuses) return false;
  for (const k of v.statuses) if (statusFxKey(k) === name) return true;
  return false;
}

/** Torappu.Battle.AbnormalFlag → whether the view's unit has it now; a flag missing here is not answered (null). */
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
/** Torappu.Battle.AbnormalCombo (SLEEPING: 沉睡) → whether the unit has it; SHELTERING is not answered. */
const COMBOS = Object.freeze({ SLEEPING: (v) => !!((v.flags | 0) & UF.SLEEP) });

/** The owner faces back: its Back model is drawn (UnitView.entryBack; before the model loads, a deploy facing UP). */
export const facesBack = (v) => !!(v && (v.entryBack ?? v.dir === 'UP'));

/**
 * 2026-10-24 (묶음 S5): client buffs a skill gives its operator for its run, which a `buff` term names: key → skill index
 * (0–2). The view holds one while that skill runs (render/fxgame.js `_fxSkillOn`, its selected skill `info.skillIndex`).
 * 凛御银灰's 战鹰 on his arm (svash2_eagle_sit_*) hides through his S3: skchr_svash2_3's `_buffs` svash2_s_3[bird_eff]
 * [추정: INFINITY, it ends with the skill — the eagle_sit_01 the skill's end creates would stay hidden otherwise].
 */
const SKILL_BUFFS = Object.freeze({ 'svash2_s_3[bird_eff]': 2 });
const holdsSkillBuff = (v, keys) => {
  const ks = keys.filter((k) => k in SKILL_BUFFS);
  if (!ks.length) return null;
  const i = Number.isInteger(v.info?.skillIndex) ? v.info.skillIndex : 0;
  return !!v._fxSkillOn && ks.some((k) => SKILL_BUFFS[k] === i);
};

/** One `pauseIf` term on `v`: true / false, or null when the view cannot tell. */
export function pauseTerm(t, v) {
  let on = null;
  if (t.flag != null) on = FLAGS[t.flag]?.(v) ?? null;
  else if (t.combo != null) on = COMBOS[t.combo]?.(v) ?? null;
  else if (t.back) on = facesBack(v);
  else if (Array.isArray(t.buff)) on = holdsSkillBuff(v, t.buff);
  if (on == null) return null;
  return t.not ? !on : on;
}

/**
 * PauseEffectIf (`GetCheckResult`): the terms combined in order — OR, AND with `all` (`_CombinePauseFlag`); null when no term was answered (the client then leaves the pause as it is: `_CheckPause`).
 * @param {{ when: object[], all?: boolean }} rec node `pauseIf`
 * @returns {boolean|null}
 */
export function pauseIfNow(rec, v) {
  let r = null;
  for (const t of rec?.when || []) {
    const x = pauseTerm(t, v);
    if (x == null) continue;
    r = r == null ? x : rec.all ? r && x : r || x;
  }
  return r;
}

/** The owner's current Spine clip (track 0), or null without a model. */
export function clipOf(v) {
  try { return v?.actor?.spine?.state?.getCurrent?.(0)?.animation?.name ?? null; } catch { return null; }
}

/**
 * PauseEffectWithAnimation (`_CheckPause`): the owner's clip `clip` asks for the pause when `valid` is given and
 * lacks it or `invalid` holds it (true), for the restore with `restore` (`_noPauseWhenValid`) otherwise (false), else
 * nothing (null); no clip: nothing.
 */
export function animPause(rec, clip) {
  if (!rec || !clip) return null;
  if ((rec.valid?.length && !rec.valid.includes(clip)) || rec.invalid?.includes(clip)) return true;
  return rec.restore ? false : null;
}

/**
 * PauseEffectIfNotMove (`Update`, 2026-10-25): paused while its owner, an Enemy, is not moving by itself
 * (`Enemy.isMovingBySelf` false — here the sim's animation state, ANIM.MOVE [ASSUMED]); any other owner: nothing (null).
 */
export function movePause(v) {
  if (!v || v.info?.side !== 'enemy' || typeof v.anim !== 'number') return null;
  return v.anim !== ANIM.MOVE;
}

/**
 * PauseEffectIfNotIdle (`Update`): paused while the owner is not idle (`Character.isInIdletState` — here the
 * sim's animation state, ANIM.IDLE [ASSUMED]), or with the face checks while it faces back / front.
 */
export function idlePause(rec, v) {
  if (!v || typeof v.anim !== 'number') return null;
  if (v.anim !== ANIM.IDLE) return true;
  const back = facesBack(v);
  return !!((rec?.back && back) || (rec?.front && !back));
}
