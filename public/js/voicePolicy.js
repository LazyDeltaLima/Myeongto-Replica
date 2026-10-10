// Operator battle voice — the official scheduling rules (local patch, docs/rules/audio.md 「오퍼레이터 음성」), installed
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
// The client code (2026-10-10 decompile, 클라 코드 `Torappu.Battle.UI.VoicePlayer` / `AutoChessGameModeVoicePlugin`):
//   * VoicePlayer._PlayVoice (RVA 0xD808F0): a type still in its cooldown is refused; a line plays when it outranks the
//     last line, or at the same priority when its type overlaps (it then takes the channel); otherwise it is dropped.
//     The cooldown is per TYPE for every operator (m_nextPlayableTime: one slot per type) and runs from the END of the
//     line: next[type] = now + the line's length + cooldown; when a new line plays, the last line's type gets
//     max(next, now + its cooldown) again. (VOICE_TYPES_TO_SHARE_CD_WITH_ALL_OTHERS = [NORMAL_ATTACK], a type we never play.)
//   * 卫戍协议's round battle start (AutoChessGameModeVoicePlugin._OnBattleStarted RVA 0xD67B80, event ON_BATTLE_STARTED
//     1211): one random piece of the battle (battleChessInsts) says its 部署 (PLACE_CHAR) line. The event comes after the
//     opening deployment: MainGameInBattle._StartBattle (MoveNext RVA 0x872B60) first runs _Prebuilt (MoveNext RVA
//     0x8726E0 — each battle piece spawned in turn, WaitForFixedSeconds(0.2) after each), then emits 1211 and starts the
//     wave scheduler (Scheduler.Init / DoSchedule) — audio.js says the line when its opening drop-in is over.
//   * 行动出发 (BATTLE_START, VoicePlayer.OnGameStart RVA 0xD7EEC0) and 行动开始 (ENCOUNTER_ENEMY,
//     VoicePlayer._OnPreviewCursorSpawn RVA 0xD7FA40 — on an enemy route preview cursor) are both gated on
//     UIController.HasFunction(CARD_LIST): OnGameStart skips the line when _CheckDisableBattleStartVoice (RVA 0xD7F1F0)
//     finds the card list disabled, the cursor handler returns at once. 卫戍协议's AutoChessUIPlugin.OnGameInit (RVA
//     0xD51480) calls DisableFunction(0xF07B) — CARD_LIST (1) among them — and the plugin never enables it again (its
//     EnableFunction calls are 0x80 / 0x4000 / 0x8000; no active Lua hotfix touches these): 卫戍协议 says neither line
//     (`CARD_LIST_ON` false). Until 2026-10-10 we said 行动出发 at the match's first battle and 行动开始 on each cursor.
//   * 作战中: a random line of the operator's 作战中1-4 (SKILL_CHARWORD_TYPES), not the equipped skill's number.

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
export const START_BURST_MS = 2000;           // the opening deployment (all pieces enter at once) after the battle start
/** UIController.HasFunction(CARD_LIST) in 卫戍协议: false (AutoChessUIPlugin.OnGameInit disables it) — no 行动出发 / 行动开始. */
export const CARD_LIST_ON = false;

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
  constructor() {
    this.playing = null;
    this.next = new Map();   // type → ms before which it is refused (its cooldown)
    this.last = null;        // { type, cd, at } of the last line that started
  }

  reset() { this.playing = null; this.next.clear(); this.last = null; }

  /**
   * @param {string} slot manifest slot
   * @param {string|number|null} unitKey unused (the official cooldown is per type, not per operator)
   * @param {number} now ms
   * @param {string} [type] official type (default: the slot's)
   * @returns {'play'|'preempt'|'drop'}
   */
  request(slot, unitKey, now, type) {
    const t = OFFICIAL_VOICE_TYPES[type] ? type : slotVoiceType(slot);
    const opt = OFFICIAL_VOICE_TYPES[t];
    if (opt.cd > 0 && now < (this.next.get(t) || 0)) return 'drop';
    if (!this.playing) return 'play';
    if (opt.pri > this.playing.pri) return 'preempt';
    if (opt.pri === this.playing.pri && opt.overlap) return 'preempt';
    return 'drop';
  }

  start(slot, unitKey, now, type) {
    const t = OFFICIAL_VOICE_TYPES[type] ? type : slotVoiceType(slot);
    const opt = OFFICIAL_VOICE_TYPES[t];
    // the last line's type: its cooldown again from now (VoicePlayer._PlayVoice, max with what it had)
    if (this.last && this.last.cd > 0) this.next.set(this.last.type, Math.max(this.next.get(this.last.type) || 0, now + this.last.cd));
    if (opt.cd > 0) this.next.set(t, now + opt.cd);   // until its length is known (lineLength)
    this.last = { type: t, cd: opt.cd, at: now };
    this.playing = { slot, type: t, pri: opt.pri };
  }

  /** The line that just started is `ms` long: its type's cooldown runs from its end (now + length + cooldown). */
  lineLength(ms) {
    const l = this.last;
    if (!l || !(l.cd > 0) || !Number.isFinite(ms) || ms < 0) return;
    this.next.set(l.type, Math.max(this.next.get(l.type) || 0, l.at + ms + l.cd));
  }

  release() { this.playing = null; }
}

/**
 * The battle-level rules (audio.js handleBattleEvents hooks, voice.js voiceForRoutePreview).
 * @param {{ skillOf?: (u: any) => any, slotsOf?: (charId: string) => string[], own?: (u: any) => boolean,
 *   random?: () => number, cardList?: boolean }} deps
 *   skillOf: the unit's equipped skill record ({ skillType, spCost }); slotsOf: the 作战中 slots an operator has;
 *   own: whether a tracked battle unit is the player's own piece (default: every allied one);
 *   cardList: UIController.HasFunction(CARD_LIST) (default CARD_LIST_ON — off in 卫戍协议: no 行动出发 / 行动开始).
 */
export function createVoicePolicy(deps = {}) {
  const random = typeof deps.random === 'function' ? deps.random : Math.random;
  const own = typeof deps.own === 'function' ? deps.own : () => true;
  const cardList = typeof deps.cardList === 'boolean' ? deps.cardList : CARD_LIST_ON;
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  const st = { gameStarted: false, encountered: false, lastEncounter: null, startAt: -Infinity };
  return {
    /** A new game (a match entered or left — OnGameReset): 行动出发 and the first 行动开始 again. */
    newGame() { st.gameStarted = false; st.encountered = false; st.lastEncounter = null; },
    /** A new field. */
    reset() { st.startAt = -Infinity; },
    /** A skill started: { slot, type } — a random 作战中 line of the operator, typed by the equipped skill. */
    skill(u) {
      const have = (deps.slotsOf ? deps.slotsOf(u.def) : []).filter((s) => /^skill[1-4]$/.test(s));
      const slot = have.length ? pick(have) : 'skill1';
      return { slot, type: skillVoiceType(deps.skillOf ? deps.skillOf(u) : null) };
    },
    /**
     * The battle starts (the field's opening deployment is over, `units` = its allied operators): the lines to request in
     * order — 部署 by a random own one (ON_BATTLE_STARTED), after 行动出发 at the game's first battle only where the card
     * list is on (`cardList`; never in 卫戍协议). The rest of the opening deployment stays silent (place()).
     * @param {number} now @param {Array<{ id: any, def: string }>} units
     * @returns {Array<{ id: any, def: string, slot: string, type: string }>}
     */
    battleStart(now, units) {
      st.startAt = now;
      const mine = (Array.isArray(units) ? units : []).filter((u) => u && typeof u.def === 'string' && own(u));
      if (!mine.length) return [];
      const lines = [];
      if (cardList && !st.gameStarted) {
        st.gameStarted = true;
        const u = pick(mine);
        lines.push({ id: u.id, def: u.def, slot: 'start', type: 'BATTLE_START' });
      }
      const u = pick(mine);
      lines.push({ id: u.id, def: u.def, slot: 'place', type: 'PLACE_CHAR' });
      return lines;
    },
    /** May a deployment say its 部署 line? (no: the opening deployment right after the battle start) */
    place(now) { return now - st.startAt >= START_BURST_MS; },
    /**
     * An enemy route preview cursor appeared (VoicePlayer._OnPreviewCursorSpawn): the operator to say 行动开始, or null —
     * the first time at once, later after ≥ 3 s without an enemy; a random card but the last one who said it. Never
     * without the card list (`cardList` — 卫戍协议: the handler's HasFunction(CARD_LIST) check returns at once).
     * @param {string[]} cards the own operators (charIds) @param {number} noEnemyMs time without an enemy on the field
     */
    encounter(cards, noEnemyMs) {
      if (!cardList) return null;
      if (st.encountered && !(noEnemyMs >= ENCOUNTER_MIN_DELTA_MS)) return null;
      const list = (Array.isArray(cards) ? cards : []).filter((c) => typeof c === 'string');
      if (!list.length) return null;
      const others = list.length > 1 && st.lastEncounter != null ? list.filter((c) => c !== st.lastEncounter) : list;
      return pick(others.length ? others : list);
    },
    /** The 行动开始 attempt is over (`said` = who said it, null = nobody): later cursors wait for 3 s without an enemy. */
    encountered(said) { st.encountered = true; st.lastEncounter = said ?? null; },
    /** A random card (the client's retry without a voice query: _LoadRandomVoiceList). */
    anyCard(cards) { const list = (Array.isArray(cards) ? cards : []).filter((c) => typeof c === 'string'); return list.length ? pick(list) : null; },
  };
}
