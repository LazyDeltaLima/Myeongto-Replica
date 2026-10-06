// Operator battle voice — the official scheduling rules (local patch, docs/LOCAL-PATCH.md 「오퍼레이터 음성」), installed
// over upstream's VoiceGate by public/js/voice.js (`audio.voiceGate`, `audio.voicePolicy`). Pure: no DOM, time passed in.
//
// The official numbers (EN client gamedata audio_data.json battleVoice; no global gap field, every delay 0):
//   type               priority  overlapIfSamePriority  cooldown
//   BATTLE_START          100      yes                    0
//   ENCOUNTER_ENEMY        90      no                     0   (+ minTimeDeltaForEnemyEncounter 3 s)
//   SKILL_ACTIVE           70      yes                    0   a MANUAL skill
//   SKILL_PASSIVE_IMP      60      no                    10 s an AUTO skill with spCost ≥ minSpCostForImportantPassiveSkill 10
//   SKILL_PASSIVE_NOR      50      no                    10 s an AUTO skill below it
//   PLACE_CHAR             20      yes                    0
//   FOCUS_CHAR             10      yes                    0
// A line plays when nothing plays, when it outranks the line on air, or at the same priority when its type overlaps
// (it then takes the channel); otherwise it is dropped. Cooldowns are per operator and type.
// Inferred from the client's class / field names (the logic is native — DefaultGamePlugin m_encounterFirstEnemyFlag,
// LoadRandomVoiceList; AutoChessGameModeVoicePlugin _OnCharacterPlacedAtBattle), decided by the owner 2026-10-06:
//   * 作战中: a random line of the operator's 作战中1-4, not the equipped skill's number;
//   * 行动开始: once per battle, on the first enemy encounter (a dropped try may come again ≥ 3 s later);
//   * battle start: one operator says 行动出发, the others of the opening deployment stay silent (no 部署 burst).

/** Official battle voice types (audio_data.json battleVoice.voiceTypeOptions); `cd` in ms. */
export const OFFICIAL_VOICE_TYPES = Object.freeze({
  BATTLE_START: { pri: 100, overlap: true, cd: 0 },
  ENCOUNTER_ENEMY: { pri: 90, overlap: false, cd: 0 },
  SKILL_ACTIVE: { pri: 70, overlap: true, cd: 0 },
  SKILL_PASSIVE_IMP: { pri: 60, overlap: false, cd: 10000 },
  SKILL_PASSIVE_NOR: { pri: 50, overlap: false, cd: 10000 },
  PLACE_CHAR: { pri: 20, overlap: true, cd: 0 },
  FOCUS_CHAR: { pri: 10, overlap: true, cd: 0 },
  // not battle voice types of the official scheduler: upstream's levels, never taking an equal line's place
  RESULT: { pri: 85, overlap: false, cd: 0 },
  PREP: { pri: 30, overlap: false, cd: 0 },
});
export const MIN_SP_IMPORTANT_PASSIVE = 10;   // battleVoice.minSpCostForImportantPassiveSkill
export const ENCOUNTER_MIN_DELTA_MS = 3000;   // battleVoice.minTimeDeltaForEnemyEncounter
export const START_BURST_MS = 2000;           // the opening deployment (all pieces enter at once) after 行动出发

/** The official type of a manifest slot (a skill slot defaults to SKILL_ACTIVE; the caller passes the real type). */
export function slotVoiceType(slot) {
  if (slot === 'start') return 'BATTLE_START';
  if (slot === 'faceEnemy') return 'ENCOUNTER_ENEMY';
  if (/^skill[1-4]$/.test(slot)) return 'SKILL_ACTIVE';
  if (slot === 'place') return 'PLACE_CHAR';
  if (slot === 'select') return 'FOCUS_CHAR';
  if (/^result/.test(slot)) return 'RESULT';
  return 'PREP';
}

/**
 * Voice type of a skill start: SKILL_ACTIVE for a MANUAL skill, SKILL_PASSIVE_IMP / _NOR for an AUTO one by its SP cost.
 * @param {{ skillType?: string, spCost?: number }|null|undefined} skill
 */
export function skillVoiceType(skill) {
  if (skill?.skillType === 'AUTO') return (Number(skill.spCost) || 0) >= MIN_SP_IMPORTANT_PASSIVE ? 'SKILL_PASSIVE_IMP' : 'SKILL_PASSIVE_NOR';
  return 'SKILL_ACTIVE';
}

/** Same interface as upstream's VoiceGate (request / start / release / reset), with the official rules above. */
export class OfficialVoiceGate {
  constructor(o = {}) {
    this.maxUnits = Number.isFinite(o.maxUnits) ? o.maxUnits : 400;
    this.playing = null;
    this.unitUntil = new Map();
  }

  reset() { this.playing = null; this.unitUntil.clear(); }

  /**
   * @param {string} slot manifest slot
   * @param {string|number|null} unitKey cooldown key (a battle unit id)
   * @param {number} now ms
   * @param {string} [type] official type (default: the slot's)
   * @returns {'play'|'preempt'|'drop'}
   */
  request(slot, unitKey, now, type) {
    const t = OFFICIAL_VOICE_TYPES[type] ? type : slotVoiceType(slot);
    const opt = OFFICIAL_VOICE_TYPES[t];
    if (unitKey != null && now < (this.unitUntil.get(`${unitKey}:${t}`) || 0)) return 'drop';
    if (!this.playing) return 'play';
    if (opt.pri > this.playing.pri) return 'preempt';
    if (opt.pri === this.playing.pri && opt.overlap) return 'preempt';
    return 'drop';
  }

  start(slot, unitKey, now, type) {
    const t = OFFICIAL_VOICE_TYPES[type] ? type : slotVoiceType(slot);
    const opt = OFFICIAL_VOICE_TYPES[t];
    this.playing = { slot, type: t, pri: opt.pri };
    if (unitKey != null && opt.cd > 0) {
      if (this.unitUntil.size > this.maxUnits) this.unitUntil.clear();
      this.unitUntil.set(`${unitKey}:${t}`, now + opt.cd);
    }
  }

  release() { this.playing = null; }
}

/**
 * The battle-level rules (audio.js handleBattleEvents hooks).
 * @param {{ skillOf?: (u: any) => any, slotsOf?: (charId: string) => string[], random?: () => number }} deps
 *   skillOf: the unit's equipped skill record ({ skillType, spCost }); slotsOf: the 作战中 slots an operator has.
 */
export function createVoicePolicy(deps = {}) {
  const random = typeof deps.random === 'function' ? deps.random : Math.random;
  const st = { encountered: false, encounterTry: -Infinity, startAt: -Infinity };
  return {
    reset() { st.encountered = false; st.encounterTry = -Infinity; st.startAt = -Infinity; },
    /** A skill started: { slot, type } — a random 作战中 line of the operator, typed by the equipped skill. */
    skill(u) {
      const have = (deps.slotsOf ? deps.slotsOf(u.def) : []).filter((s) => /^skill[1-4]$/.test(s));
      const slot = have.length ? have[Math.min(have.length - 1, Math.floor(random() * have.length))] : 'skill1';
      return { slot, type: skillVoiceType(deps.skillOf ? deps.skillOf(u) : null) };
    },
    /** May the battle's 行动开始 be tried now? (once per battle; a dropped try again ≥ 3 s later) */
    encounter(now) {
      if (st.encountered || now - st.encounterTry < ENCOUNTER_MIN_DELTA_MS) return false;
      st.encounterTry = now;
      return true;
    },
    encountered(played) { if (played) st.encountered = true; },
    /** 行动出发 was said (or tried) at `now`: the opening deployment's 部署 lines are skipped. */
    started(now) { st.startAt = now; },
    /** May a deployment say its 部署 line? (no: the opening burst right after 行动出发) */
    place(now) { return now - st.startAt >= START_BURST_MS; },
  };
}
