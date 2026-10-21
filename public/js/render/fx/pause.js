// public/js/render/fx/pause.js — the client's effect behaviours that pause or finish their effect (2026-10-21, decompile
// check; docs/rules/fx.md 「이펙트 멈춤·끝 조건」): what each asks of the effect's owner, decided from a unit view as
// render/units.js keeps it (its flags, statuses, facing, sim animation and Spine clip). The extract carries them per node
// (tools/local-extract/fx_extract.py pause_scripts: `pauseIf`, `pauseAnim`, `pauseIdle`, `pauseSpine`, `finishIf`;
// `pauseOther` is played by render/fxgame.js stepPauses, which applies all of them).
// A term the view cannot answer (an immunity, a buff of the client's templates, a mode index, a blackboard key) is left
// out as the client leaves out an unchecked one [ASSUMED: the conditions the remake cannot see are not met].

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

/** One `pauseIf` term on `v`: true / false, or null when the view cannot tell. */
export function pauseTerm(t, v) {
  let on = null;
  if (t.flag != null) on = FLAGS[t.flag]?.(v) ?? null;
  else if (t.combo != null) on = COMBOS[t.combo]?.(v) ?? null;
  else if (t.back) on = facesBack(v);
  if (on == null) return null;
  return t.not ? !on : on;
}

/**
 * PauseEffectIf (`GetCheckResult` RVA 0xE93330): the terms combined in order — OR, AND with `all` (`_CombinePauseFlag`
 * 0xE942C0); null when no term was answered (the client then leaves the pause as it is: `_CheckPause` 0xE940E0).
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
 * PauseEffectWithAnimation (`_CheckPause` RVA 0xE94A70): the owner's clip `clip` asks for the pause when `valid` is given and
 * lacks it or `invalid` holds it (true), for the restore with `restore` (`_noPauseWhenValid`) otherwise (false), else
 * nothing (null); no clip: nothing.
 */
export function animPause(rec, clip) {
  if (!rec || !clip) return null;
  if ((rec.valid?.length && !rec.valid.includes(clip)) || rec.invalid?.includes(clip)) return true;
  return rec.restore ? false : null;
}

/**
 * PauseEffectIfNotIdle (`Update` RVA 0xE91DA0): paused while the owner is not idle (`Character.isInIdletState` — here the
 * sim's animation state, ANIM.IDLE [ASSUMED]), or with the face checks while it faces back / front.
 */
export function idlePause(rec, v) {
  if (!v || typeof v.anim !== 'number') return null;
  if (v.anim !== ANIM.IDLE) return true;
  const back = facesBack(v);
  return !!((rec?.back && back) || (rec?.front && !back));
}
