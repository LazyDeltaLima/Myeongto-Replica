// Lobby screen, laid out like the event's entry after upstream 0.3.3's hub (ported by hand, GPL-3.0; upstream PR #643 /
// #812 by @isomerpoi; maintainer decisions 2026-11-07, docs/rules/ui.md 「upstream 0.3.3 화면 가져오기」): the event's night /
// dusk lobby (ui/allianceScene.js; the entry backdrop sprites until it loads), the emblem in radar rings and the season's
// title in the middle, at the left the 成就统计 card with the Doctor's name and number (statistics, screens/stats.js), the
// 加入同盟 box (key, 加入同盟, 观战, the recent keys) and 作战提示 | 更新, at the right the light S.W.E.E.P.报告 and 干员调配
// plates, and three entries at the bottom right:
//   - 独立模拟 → 选择模拟协议 (ProtocolSelect, roomMode 'solo'): the difficulty cards beside its official picture
//     (`modeChoice/*_rhodes_island`), 规则 (经典 / 休闲 / 自定义 ⚙) above them, then 开始独立模拟 (room.create).
//   - 同盟模拟 → 选择模拟协议 (roomMode 'coop', maintainer decision 2026-11-08; it was upstream's 创建同盟 card, a room made
//     at the remembered difficulty and ruleset and changed in the room): 赛季 (while several are offered: a room keeps the
//     season it is made in), 规则 and 人数 over the cards, then 创建同盟 (room.create); the room's mode bar opens the same
//     dialog to change them. Joining one with a 同盟密钥 as a
//     player (加入同盟) or in a spectator seat (观战: room.spectate, also while its match runs; community report #26, a
//     remake feature — the official room has none) is the left column's box, not this screen's (maintainer decision
//     2026-11-08).
//   - 同盟匹配 (random matchmaking, server/matchmaking.js; ui/matchQueue.js shows the queue and its confirmation) →
//     选择模拟协议 (roomMode 'match'): 规则 (经典 / 休闲; 自定义 locked) and 人数 with their queues' waiting Doctors, each
//     difficulty card with its queue's, then 快速匹配 as the official matching range switch over 开始匹配 (room.queue).
//     快速匹配 on (maintainer decision 2026-11-07): 规则 / 人数 stay, disabled, and each card shows the whole difficulty's
//     waiting Doctors (the quick queue + every ruleset × size queue); room.queue { quick: true }.
// On a short screen (≤ 520 px tall, a landscape phone) the left column narrows to three cards — the 成就统计 strip, 加入同盟,
// and 作战提示 | 更新 as tabs (maintainer decision 2026-11-08) —; on a phone too narrow for it, it gives way, as upstream's:
// 成就统计 and 加入同盟 · 观战 become plates under 干员调配 (the latter opens AllianceSelect: the key alone).
// The top bar: 返回, ping, the 在线 count, 设置, 玩法说明, and at the right the season chip (ui/season.js) and the resume
// button. Not taken from upstream: its own lobby picture / music (ui/lobbyMedia.js, hubScene.js) and its versions.
// 规则 모드 (shared/ruleset.js, maintainer decisions 2026-10-15, 2026-10-18): the 规则 switch picks 经典 / 休闲 / 自定义 for
// 开始独立模拟 / 创建同盟 (room.create ruleset; custom: the settings of ui/customRulesStore.js, edited behind the ⚙ —
// ui/customRules.js) and 经典 / 休闲 for 开始匹配 (room.queue: one queue per difficulty and ruleset), remembered like the
// difficulty (classic the first time). A picked 自定义 adds a line to the brief at the left: the preset in use and how
// many settings differ from the official ones. The 8-player mode (maintainer decisions 2026-10-16, 2026-10-19): 人数 picks a 4- or an 8-seat alliance
// (room.create / room.queue `size`, remembered in `lobby.size`).
//
// 规程 (docs/rules/ui.md 「규정 모드」): 独立模拟 picks 极速模拟 or a 规程等级 1–20 from one row each instead of the cards
// (GRADES, GradeRow; room.create `grade`); 人数 picks 4 or 8 seats as in every season.
//
// Difficulty descriptions come from data/config.json `modes[modeId]` when present, else from the
// official act2autochess `modeDataDict` texts embedded below (desc + effectDescList), so the
// screen is complete before data is generated. Rounds: solo 标准 = 9, everything else 14 (+R15
// hidden core on 险境+), per research 00-INDEX §2. Battlefield pool (`modes[].stages`): 标准 always
// plays 战场#01, 险境 draws one of 8, 绝境 / 终极 one of 7 (m01 excluded).
// Texts go through t() (docs/I18N.md); the module-level tables hold msgids (N_) translated where they are shown, the
// config.json mode texts come localized from data.js.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from '../../vendor/hooks.module.js';
import { DIFFICULTIES, DIFFICULTY_NAMES, DIFFICULTY_COLORS, ROOM_CODE_LEN, MAX_SEATS, LARGE_SEATS, LARGE_MIN_PLAYERS, ROOM_SIZES, MAX_SPECTATORS, modeIdFor, ERR, FAST_GRADE, MAX_GRADE, gradeDifficulty, isGrade } from '../../../shared/constants.js';
import { html, Button, Icon, MicroLabel, Modal, TextField, PingPill, OnlinePill, Tooltip, Spinner, DifficultyIcon, doctorNo, gradeName } from '../ui/components.js';
import { Sprite, Img } from '../ui/gameComponents.js';
import { uiUrl } from '../ui/assetUrls.js';
import { toast, toastError } from '../ui/toasts.js';
import { GuideButton, openGuide } from '../ui/guide.js';
import { useStatsOpen } from './stats.js';
import { SweepReport } from './sweep.js';
import { AchievementDialog, ACHV_RULESET_PREF } from './achievements.js';
import { peekStatsRecords, recordsOfSeason, aggregateStats, trophyMedalOf, selfRowOf, recordsOfRuleset, achievementRuleset } from '../ui/stats.js';
import { levelOf, certTotal } from '../ui/level.js';
import { Emblem } from './title.js';
import { SettingsButton } from '../ui/settings.js';
import { LoadoutButton } from './loadout.js';
import { ResumeMatchButton } from '../ui/resumeMatch.js';
import { MatchQueueDialog, joinQueue, joinQuickQueue } from '../ui/matchQueue.js';
import { SeasonChip, pickedSeason, seasonFields, seasonQueueCounts, seasonQuickCounts, seasonName } from '../ui/season.js';
import { seasonInfo, seasonFeature, DEFAULT_SEASON } from '../../../shared/seasons.js';
import { RulesetSwitch, lobbyRuleset, lobbyQueueRuleset, saveLobbyRuleset, queueCountOf } from '../ui/ruleset.js';
import { QUEUE_PRESETS, PRESET_LABELS, isQueuePreset, customDiffs, officialBans } from '../../../shared/ruleset.js';
import { CustomRulesDialog, openCustomRules } from '../ui/customRules.js';
import { customRulesStore, customDraft } from '../ui/customRulesStore.js';
import { PatchNotesModal, usePatchNotes, isUnseen, markSeen, Inline } from '../ui/patchNotes.js';
import { RadarScene, JoinArt } from '../ui/allyArt.js';
import { ProtocolScene } from '../ui/protocolScene.js';
import { AllianceBackdrop, useLobbyArt } from '../ui/allianceScene.js';
import { seasonBackdrop, seasonLogoSet, logoSizes } from '../ui/seasonArt.js';
import { pickSeasonThroughDark } from '../ui/seasonFade.js';
import { useLang } from '../ui/lang.js';
import { net, identity } from '../net.js';
import { useDocClass, detectFeatures, useMediaQuery, SHORT_SCREEN_QUERY } from '../ui/device.js';
import { store, useStore, shallowEqual, loadPref, savePref } from '../store.js';
import { data, getConfig, getMode, getStage, useData } from '../data.js';
import { t, tc, N_ } from '../../../shared/i18n.js';
import { scriptOf } from '../../../shared/i18nPacks.js';

/** Official mode texts (activity_table act2autochess.modeDataDict), fallback when config.json is absent. */
export const MODE_TEXT = {
  single: {
    FUNNY: { code: 'AC-1', desc: N_('时长较短的模拟训练'), effects: [N_('可以快速完成作战'), N_('常规奖励')] },
    NORMAL: { code: 'AC-2', desc: N_('敌方攻击强度较高的模拟训练'), effects: [N_('可使用盟约数增加'), N_('大幅增加奖励')] },
    HARD: { code: 'AC-3', desc: N_('敌方攻击强度极高的模拟训练'), effects: [N_('作战环境困难'), N_('出现更加危险的敌人')] },
    ABYSS: { code: 'AC-4', desc: N_('敌方攻击强度到达极限的模拟训练'), effects: [N_('作战环境无比困难'), N_('出现极度危险的敌人')] },
  },
  multi: {
    FUNNY: { code: 'AC-1', desc: N_('敌方攻击强度较低的模拟训练'), effects: [N_('作战环境较为温和'), N_('常规奖励')] },
    NORMAL: { code: 'AC-2', desc: N_('敌方攻击强度较高的模拟训练'), effects: [N_('可使用盟约数增加'), N_('大幅增加奖励')] },
    HARD: { code: 'AC-3', desc: N_('敌方攻击强度极高的模拟训练'), effects: [N_('作战环境困难'), N_('出现更加危险的敌人')] },
    ABYSS: { code: 'AC-4', desc: N_('敌方攻击强度到达极限的模拟训练'), effects: [N_('作战环境无比困难'), N_('出现极度危险的敌人')] },
  },
};

/** Battlefield pool per difficulty when config.json is absent (the modes' `stages` lists; same for solo and co-op). */
export const STAGE_POOL = { FUNNY: ['act1autochess_m01'], NORMAL: 8, HARD: 7, ABYSS: 7 };

/**
 * Display name of a stage: stages.json when it is loaded, else derived from the id (act1 m0N → 战场#0N, act2 m0N → 战场#0(N+4)).
 * From the data name only its 战场#NN part (with a (上半) / (下半) mark) — 'Battlefield #NN (First Half)' in English.
 * @param {string} id e.g. 'act1autochess_m01'
 */
export function stageLabel(id) {
  const rec = getStage(id);
  if (rec && typeof rec.name === 'string' && rec.name) {
    const m = rec.name.match(/^(.*?#\d+(?:\s*[(（][^)）]*[)）])?)/);
    return m ? m[1] : rec.name.split(/\s+/)[0];
  }
  const m = String(id || '').match(/^act(\d)autochess_m(\d+)$/);
  return m ? t('战场#{no}', { no: String(Number(m[2]) + (m[1] === '2' ? 4 : 0)).padStart(2, '0') }) : '';
}

/**
 * The battlefield note of a difficulty (official wording): a single-stage pool is fixed ("战场固定为 战场#01"), a larger
 * one is drawn at random ("战场随机（共8张）").
 * @param {string[] | number | null | undefined} stages the mode's `stages` list (or a count)
 * @returns {string} '' when unknown
 */
export function stageNote(stages) {
  if (Array.isArray(stages)) {
    const ids = stages.filter((s) => typeof s === 'string' && s);
    if (ids.length === 1) { const name = stageLabel(ids[0]); return name ? t('战场固定为 {name}', { name }) : t('战场固定'); }
    return ids.length > 1 ? t('战场随机（共{n}张）', { n: ids.length }) : '';
  }
  return Number.isInteger(stages) && stages > 1 ? t('战场随机（共{stages}张）', { stages }) : '';
}

const MODE_CARDS = [
  {
    id: 'solo', name: N_('独立模拟'), en: 'SOLO SIMULATION', icon: 'user',
    desc: N_('独自调配资金与干员，以自己的节奏完成整场模拟。'),
    points: [N_('1 名博士'), N_('不限时')],
  },
  {
    id: 'coop', name: N_('同盟模拟'), en: 'ALLIANCE SIMULATION', icon: 'users',
    desc: N_('与至多 {n} 名博士组成同盟，共享干员池，联防协作抵御敌潮。'), params: { n: MAX_SEATS - 1 },
    points: [N_('1–{n} 名博士 · 可由 AI 队友补位')], pointParams: { n: MAX_SEATS },
  },
  {
    id: 'match', name: N_('同盟匹配'), en: 'ALLIANCE MATCHMAKING', icon: 'signal',
    desc: N_('独自进入公共匹配池，与其他博士组成同盟后开始模拟。'),
    points: [N_('自动匹配')],
  },
];

/** The lobby's remembered alliance size (4 the first time). */
export function lobbySize() {
  const v = loadPref('lobby.size', MAX_SEATS);
  return ROOM_SIZES.includes(v) ? v : MAX_SEATS;
}

/**
 * The room.create / room.queue fields of the lobby's choice: `size` only for an 8-seat alliance (a solo room is never one).
 * @param {'solo'|'coop'|'match'} roomMode @param {number} size
 * @returns {{ size?: number }}
 */
export const sizeFields = (roomMode, size) => (roomMode !== 'solo' && size === LARGE_SEATS ? { size: LARGE_SEATS } : {});

/**
 * Text for a difficulty card, preferring data/config.json.
 * @param {'solo'|'coop'} roomMode
 * @param {string} difficulty
 * @returns {{ code: string, desc: string, effects: string[], rounds: number, hidden: boolean, stageNote: string }}
 */
export function difficultyInfo(roomMode, difficulty) {
  const fallback = MODE_TEXT[roomMode === 'solo' ? 'single' : 'multi'][difficulty] || { code: '', desc: '', effects: [] };
  // modeIdFor() lower-cases the difficulty: never call it with a value the server did not validate.
  const m = DIFFICULTIES.includes(difficulty) ? getMode(modeIdFor(roomMode, difficulty)) : null;
  const effects = Array.isArray(m?.effectDescList)
    ? m.effectDescList.map((e) => String(e).replace(/^[·•・･\s]+/, '')).filter(Boolean)
    : fallback.effects.map((e) => t(e));
  const rounds = Number.isFinite(m?.lastRound) ? m.lastRound : roomMode === 'solo' && difficulty === 'FUNNY' ? 9 : 14;
  return {
    code: typeof m?.code === 'string' ? m.code : fallback.code,
    desc: typeof m?.desc === 'string' ? m.desc : t(fallback.desc),
    effects,
    rounds,
    hidden: difficulty !== 'FUNNY',
    stageNote: stageNote(Array.isArray(m?.stages) && m.stages.length ? m.stages : STAGE_POOL[difficulty]),
  };
}

/**
 * 规程等级 (docs/rules/ui.md 「규정 모드」; maintainer decisions 2026-11-08, 2026-11-12): a season with `soloGrades` offers
 * 独立模拟 at 极速模拟 (FAST_GRADE) or 规程等级 1–20 instead of the four difficulties, every one open, picked from one row
 * each (GradeRow) on 选择模拟协议. Its 人数 row picks 4 or 8 seats (maintainer request 2026-11-16) and its 规则 row has
 * 自定义 (maintainer request 2026-11-15), as in every season.
 */
export const GRADES = Object.freeze([FAST_GRADE, ...Array.from({ length: MAX_GRADE }, (_, i) => i + 1)]);
/** Whether a room of this mode and season picks a 规程等级. @param {string} roomMode @param {unknown} season */
export const gradedRoom = (roomMode, season) => roomMode === 'solo' && seasonFeature(season, 'soloGrades');
/** The lobby's remembered 规程等级 (1 the first time). */
export const lobbyGrade = () => { const g = loadPref('lobby.grade', 1); return isGrade(g) ? g : 1; };
export { gradeName };

/**
 * Text for a 规程等级, from the season's mode record (`mode_single_<grade>` / 极速模拟's `mode_single_funny`), as
 * difficultyInfo; `color` is the record's own (极速模拟 has one of its own).
 * @param {number} grade
 * @returns {{ code: string, desc: string, effects: string[], rounds: number, hidden: boolean, stageNote: string, color: string, difficulty: string }}
 */
export function gradeInfo(grade) {
  const difficulty = gradeDifficulty(grade);
  const m = getMode(modeIdFor('solo', difficulty, grade));
  const effects = Array.isArray(m?.effectDescList) ? m.effectDescList.map((e) => String(e).replace(/^[·•・･\s]+/, '')).filter(Boolean) : [];
  return {
    code: typeof m?.code === 'string' ? m.code : '',
    desc: typeof m?.desc === 'string' ? m.desc : '',
    effects,
    rounds: Number.isFinite(m?.lastRound) ? m.lastRound : grade === FAST_GRADE ? 9 : 14,
    hidden: Number.isInteger(m?.hiddenRound),
    stageNote: Array.isArray(m?.stages) && m.stages.length ? stageNote(m.stages) : '',
    color: typeof m?.color === 'string' && /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : DIFFICULTY_COLORS[difficulty],
    difficulty,
  };
}

const CODE_RE = new RegExp(`^[A-Z0-9]{${ROOM_CODE_LEN}}$`);
/**
 * Normalise user input into a room code: accepts a pasted invite link (`…?room=ABCD`), keeps
 * upper-cased alphanumerics and clamps to the code length.
 * @param {string} v
 * @returns {string}
 */
export function normalizeCode(v) {
  let s = String(v ?? '');
  const m = s.match(/[?&]room=([A-Za-z0-9]+)/);
  if (m) s = m[1];
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LEN);
}

/**
 * A handler that Preact binds as `onClick=${fn}` receives the click EVENT as its first argument, and a default
 * parameter only applies to `undefined` — so `fn(c = code)` would normalise the event target into a nonsense code
 * (`String(el)` → `"[object HTMLElement]"` → "OBJE"). Only a string is ever a code; anything else falls back to the
 * input field. Returns null when neither yields a well-formed code.
 * @param {unknown} arg the argument a handler was called with
 * @param {string} field the current input-field value
 * @returns {string|null}
 */
export function codeArg(arg, field) {
  const k = normalizeCode(typeof arg === 'string' ? arg : field);
  return CODE_RE.test(k) ? k : null;
}

/**
 * Room code from a deep link query string (`?room=CODE`), or null when absent/malformed.
 * Accepts ROOM_CODE_LEN..ROOM_CODE_LEN+2 alphanumerics (the protocol's join limit).
 * @param {string} search e.g. location.search
 * @returns {string|null}
 */
export function parseRoomParam(search) {
  try {
    const raw = new URLSearchParams(search || '').get('room');
    if (!raw) return null;
    const code = raw.trim().toUpperCase();
    if (!/^[A-Z0-9]+$/.test(code)) return null;
    return code.length >= ROOM_CODE_LEN && code.length <= ROOM_CODE_LEN + 2 ? code : null;
  } catch {
    return null;
  }
}

/** Recently joined/created co-op room codes (most recent first). */
export function recentRooms() {
  const list = loadPref('recentRooms', []);
  return Array.isArray(list) ? list.filter((c) => typeof c === 'string' && CODE_RE.test(c)).slice(0, 4) : [];
}

/** @param {string} code */
export function rememberRoom(code) {
  if (!CODE_RE.test(code)) return;
  savePref('recentRooms', [code, ...recentRooms().filter((c) => c !== code)].slice(0, 4));
}

const FALLBACK_TIPS = [
  N_('联合模拟在选择策略时可以进行一次跳过'),
  N_('调度中心即使冻结，依然可以主动刷新'),
  N_('两件同名装备可以合成一件更强力的装备'),
  N_('只有达成完美作战的队友可以进行联防'),
];
const TIP_ROTATE_MS = 5000; // matchingTipRotateInterval

/** The 01/15 counter (when `total` is given) and the previous / next arrows of a hub card's head. */
function TipsPager({ at, total = 0, onStep, prev = t('上一条'), next = t('下一条'), atStart = false, atEnd = false }) {
  return html`<span class="tips__pager">
    ${total ? html`<span class="tips__idx num">${String(at + 1).padStart(2, '0')}<span class="t-dim">/${String(total).padStart(2, '0')}</span></span>` : null}
    <button type="button" class="tips__nav" disabled=${atStart} onClick=${() => onStep(-1)} aria-label=${prev}><${Icon} name="chevronLeft" /></button>
    <button type="button" class="tips__nav" disabled=${atEnd} onClick=${() => onStep(1)} aria-label=${next}><${Icon} name="chevronRight" /></button>
  </span>`;
}

/**
 * The main lines of a release for the hub's 更新 card: the first change of each group (`### heading`), then the
 * further changes in order, up to `n`; the closing 기여 group (credits) is left out.
 * @param {{ blocks?: object[] }} entry
 * @param {number} n
 */
export function newsLines(entry, n) {
  const firsts = [], rest = [];
  const seen = new Set();
  let group = '';
  for (const b of entry?.blocks || []) {
    if (b.h) group = b.h;
    if (!b.ul || group === '기여') continue;
    for (const segs of b.ul) { (seen.has(group) ? rest : firsts).push(segs); seen.add(group); }
  }
  return [...firsts, ...rest].slice(0, n);
}

/** Rotating tactical tips (config.json `tips`, weighted list of { tip, weight }): the list, the shown one, a step. */
function useTips() {
  const cfg = getConfig();
  const fallback = FALLBACK_TIPS.map((x) => t(x));
  const tips = Array.isArray(cfg?.tips)
    ? cfg.tips.map((x) => (typeof x === 'string' ? x : x?.tip)).filter((x) => typeof x === 'string' && x)
    : fallback;
  const list = tips.length ? tips : fallback;
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * list.length));
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => i + 1), TIP_ROTATE_MS);
    return () => clearInterval(id);
  }, []);
  const i = ((idx % list.length) + list.length) % list.length;
  return { list, i, step: (d) => setIdx(i + d + list.length) };
}

/**
 * The hub's 作战提示 and 更新 (maintainer decision 2026-11-08, replacing the one-line 更新 tab of 2026-10-13): on a desktop
 * two cards in the left column — the tips stepping every TIP_ROTATE_MS (up to three lines), and the newest release's
 * version, date and main lines (newsLines, four) with 查看全部, ‹ › stepping to older releases. On a short screen
 * (`short`) one card with the 作战提示 | 更新 tabs, three lines of the release. A release not seen before (pref
 * `patchNotesSeen`, ui/patchNotes.js) is marked NEW for this visit, and on a short screen opens its tab. Without patch
 * notes (/changelog.json unreachable) only the tips show. 查看全部 asks the hub (`onAll(fresh)`) to open the 更新记录
 * dialog: drawn in here it would stay inside the left column's layer, under the right column and the entry cards.
 */
function HubNotes({ short, notes, onAll }) {
  const tips = useTips();
  const latest = notes?.[0] || null;
  const [tab, setTab] = useState('tips');
  const [fresh, setFresh] = useState(false);
  const [rel, setRel] = useState(0);
  useEffect(() => {
    if (!latest || !isUnseen(latest.version)) return;
    setFresh(true);
    setTab('news');
    markSeen(latest.version);
  }, [latest?.version]);
  const count = notes?.length || 0;
  const r = Math.max(0, Math.min(rel, count - 1));
  const entry = notes?.[r] || null;
  const stepRel = (d) => setRel(Math.max(0, Math.min(count - 1, r + d)));
  const relPager = html`<${TipsPager} at=${r} onStep=${stepRel} prev=${t('较新的版本')} next=${t('较早的版本')} atStart=${r === 0} atEnd=${r >= count - 1} />`;
  const tipPager = html`<${TipsPager} at=${tips.i} total=${short ? 0 : tips.list.length} onStep=${tips.step} />`;
  const tipText = html`<p key=${tips.i} class="tips__text">${tips.list[tips.i]}</p>`;
  const more = html`<button type="button" class="tips__more" onClick=${() => onAll(fresh)}>${t('查看全部')}<${Icon} name="chevronRight" /></button>`;
  const newsBody = entry ? html`<div key=${entry.version} class="tips__news">
      <div class="tips__verline">
        <b class="tips__ver num">v${entry.version}</b>
        ${/^\d{4}-\d\d-\d\d$/.test(entry.date) ? html`<span class="tips__date num">${entry.date}</span>` : null}
        ${fresh && r === 0 && !short ? html`<span class="tips__new">NEW</span>` : null}
        ${short ? more : null}
      </div>
      <ul class="tips__lines">${newsLines(entry, short ? 3 : 4).map((segs, j) => html`<li key=${j}><${Inline} segs=${segs} /></li>`)}</ul>
      ${short ? null : html`<div class="tips__foot">${more}</div>`}
    </div>` : null;
  if (short) {
    const news = tab === 'news' && !!entry;
    return html`<div class="tips tips--tabs brackets" data-testid="hub-notes">
      <div class="tips__head">
        ${latest ? html`<span class="tips__tabs" role="tablist">
            <button type="button" class=${`tips__tab${news ? '' : ' is-on'}`} role="tab" aria-selected=${!news} onClick=${() => setTab('tips')}>${t('作战提示')}</button>
            <button type="button" class=${`tips__tab${news ? ' is-on' : ''}`} role="tab" aria-selected=${news} onClick=${() => setTab('news')}>${t('更新')}${fresh ? html`<span class="tips__new">NEW</span>` : null}</button>
          </span>`
          : html`<${Icon} name="info" /><span class="tips__name">${t('作战提示')}</span>`}
        ${news ? relPager : tipPager}
      </div>
      ${news ? newsBody : tipText}
    </div>`;
  }
  return html`<div class="tips brackets" data-testid="hub-tips">
      <div class="tips__head"><span class="tips__badge"><${Icon} name="info" /></span><span class="tips__name">${t('作战提示')}</span><${MicroLabel}>TIPS<//>${tipPager}</div>
      ${tipText}
    </div>
    ${entry ? html`<div class="tips tips--news brackets" data-testid="hub-news">
      <div class="tips__head"><span class="tips__badge"><${Icon} name="refresh" /></span><span class="tips__name">${t('更新')}</span><${MicroLabel}>PATCH NOTES<//>${relPager}</div>
      ${newsBody}
    </div>` : null}`;
}

/** The hand-drawn ring of the 已选定 stamp (two loose strokes). */
function StampRing() {
  return html`<svg class="pcard__ring" viewBox="0 0 120 100" aria-hidden="true" focusable="false">
    <path pathLength="1" d="M18 62C6 34 34 8 70 10c34 2 48 30 38 54-10 24-46 32-72 22C20 80 10 66 16 50" />
    <path pathLength="1" d="M30 20c22-14 62-12 78 10 12 18 4 44-16 54" />
  </svg>`;
}

/** A difficulty's rounds (+ 隐秘核心) and battlefields: on its card's meta line, and in the brief when the cards show only their names. */
function DifficultyRounds({ info }) {
  return [
    html`<span key="r"><b class="num">${info.rounds}</b> ${tc('rounds', '回合')}${info.hidden ? html` ${t('+ 隐秘核心')}` : null}</span>`,
    info.stageNote ? html`<span key="s" class="pcard__stage"><${Icon} name="rook" />${info.stageNote}</span>` : null,
  ];
}

/**
 * One difficulty of 选择模拟协议: name, text, effects, then code / rounds / 隐秘核心 / battlefields; the selected one slides
 * out with a glow in the difficulty's colour and the 已选定 stamp. `disabled`: shown, not chosen (a room's other doctors).
 * `waiting`: the Doctors waiting in its queue (同盟匹配), else null.
 */
function DifficultyCard({ roomMode, difficulty, selected, onSelect, disabled = false, waiting = null }) {
  const info = difficultyInfo(roomMode, difficulty);
  return html`<button type="button" class=${`pcard diff-card${selected ? ' is-on is-selected' : ''}`} style=${`--d-color:${DIFFICULTY_COLORS[difficulty]}`}
      disabled=${disabled} onClick=${() => onSelect(difficulty)} aria-pressed=${selected ? 'true' : 'false'}>
    <span class="pcard__glow" aria-hidden="true"></span>
    <span class="pcard__head">
      <${DifficultyIcon} difficulty=${difficulty} class="pcard__glyph" />
      <span class="pcard__name">${t(DIFFICULTY_NAMES[difficulty])}</span>
      ${waiting != null ? html`<span class=${`pcard__wait${waiting > 0 ? ' is-on' : ''}`} data-testid=${`queue-count-${difficulty}`}>${t('等待 {n}', { n: waiting })}</span>` : null}
    </span>
    <span class="pcard__desc">${info.desc}</span>
    <span class="pcard__effects">${info.effects.map((e) => html`<span key=${e}>${e}</span>`)}</span>
    <span class="pcard__meta">
      ${info.code ? html`<span class="num">${info.code}</span>` : null}
      <${DifficultyRounds} info=${info} />
    </span>
    <span class="pcard__stamp" aria-hidden="true"><${StampRing} /><span class="pcard__tick"><${Icon} name="check" /></span><span class="pcard__ok">${t('已选定')}</span></span>
  </button>`;
}

/**
 * One 规程等级 of 选择模拟协议 (maintainer decision 2026-11-12, 시안 B: a row each, closer to the official list than the
 * cards): the difficulty's glyph, the grade's name with its difficulty (极速模拟: its description), code, rounds; the
 * selected one slides out in its colour with a tick. The brief at the left carries the rest.
 */
function GradeRow({ grade, selected, onSelect, disabled = false }) {
  const info = gradeInfo(grade);
  return html`<button type="button" class=${`grow${selected ? ' is-on' : ''}`} style=${`--d-color:${info.color}`} data-grade=${grade}
      disabled=${disabled} onClick=${() => onSelect(grade)} aria-pressed=${selected ? 'true' : 'false'}>
    <${DifficultyIcon} difficulty=${info.difficulty} class="grow__glyph" />
    <span class="grow__name"><b>${gradeName(grade)}</b><small>${grade === FAST_GRADE ? info.desc : t(DIFFICULTY_NAMES[info.difficulty])}</small></span>
    <span class="grow__code num">${info.code}</span>
    <span class="grow__rounds"><b class="num">${info.rounds}</b> ${tc('rounds', '回合')}${info.hidden ? ` ${t('+ 隐秘核心')}` : ''}</span>
    <span class="grow__tick" aria-hidden="true">${selected ? html`<${Icon} name="check" />` : null}</span>
  </button>`;
}

/** 选择模拟协议's 规程等级 rows (GradeRow): the picked one scrolled into view when the list opens. */
function GradeList({ grade, onGrade, disabled }) {
  const ref = useRef(null);
  useLayoutEffect(() => { ref.current?.querySelector('.grow.is-on')?.scrollIntoView?.({ block: 'center' }); }, []);
  return html`<div ref=${ref} class="proto-list proto-list--grades" role="group" aria-label=${t('规程等级')}>
    ${GRADES.map((g) => html`<${GradeRow} key=${g} grade=${g} selected=${grade === g} onSelect=${onGrade} disabled=${disabled} />`)}
  </div>`;
}

/**
 * How much 选择模拟协议's cards show on a screen taller than 520 px: the first level at which they fit their column —
 * 'full' (the name, the description, the effects, the rounds), 'brief' (the description only in the brief at the left),
 * 'names' (a line each, as on a phone). A list that still does not fit scrolls. [ASSUMED·자료 없음] the levels and their order
 */
export const CARD_FIT_LEVELS = ['full', 'brief', 'names'];
export function pickCardFit(overflows) {
  return CARD_FIT_LEVELS.find((level) => !overflows(level)) || CARD_FIT_LEVELS[CARD_FIT_LEVELS.length - 1];
}

/**
 * Sets 选择模拟协议's `data-fit` (pickCardFit; css/screens/lobby.css) before the screen paints: at every render, when the
 * list's box changes and whenever a font finishes loading. A level only changes what the cards show, never the list's
 * box, so measuring cannot loop.
 */
function ProtoFit() {
  const ref = useRef(null);
  const fit = () => {
    const body = ref.current?.closest('.proto__body');
    const list = body?.querySelector('.proto-list');
    if (!list) return;
    body.dataset.fit = pickCardFit((level) => { body.dataset.fit = level; return list.scrollHeight > list.clientHeight + 1; });
  };
  useLayoutEffect(fit);
  useLayoutEffect(() => {
    const list = ref.current?.closest('.proto__body')?.querySelector('.proto-list');
    if (!list) return undefined;
    let live = true;
    const refit = () => { if (live) fit(); };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(refit) : null;
    ro?.observe(list);
    const fonts = document.fonts;
    fonts?.ready?.then(refit);
    fonts?.addEventListener?.('loadingdone', refit);
    return () => { live = false; ro?.disconnect(); fonts?.removeEventListener?.('loadingdone', refit); };
  }, []);
  return html`<i ref=${ref} class="proto__fit" hidden></i>`;
}

/** The sum of every number in a queue-count table ({ [ruleset]: { [difficulty]: n } } or { [difficulty]: n }). */
export function countAll(c) {
  if (typeof c === 'number') return Number.isFinite(c) && c > 0 ? c : 0;
  return c && typeof c === 'object' ? Object.values(c).reduce((a, v) => a + countAll(v), 0) : 0;
}

/**
 * The Doctors a 快速匹配 player can be grouped with at a difficulty: the quick queue and every ruleset × size queue of that
 * difficulty (docs/rules/ui.md 「빠른 매칭」: the quick side shows the whole difficulty).
 */
export function quickWaiting(counts4, counts8, quick, difficulty) {
  const of = (c) => (c && typeof c === 'object' ? Object.values(c).reduce((a, byD) => a + countAll(byD?.[difficulty]), 0) : 0);
  return of(counts4) + of(counts8) + countAll(quick?.[difficulty]);
}

/**
 * One of the three entries at the bottom right of the hub (独立模拟 / 同盟模拟 / 同盟匹配), with its line above it (and the
 * season's waiting Doctors on 同盟匹配's): opens its dialog.
 */
export function HubEntry({ card, onOpen, waiting = null }) {
  return html`<div class="hub-entry-wrap">
    <span class="hub-entry__group"><${Icon} name=${card.icon} />${card.points.map((p) => t(p, card.pointParams)).join(' · ')}
      ${waiting != null ? html`<b class="hub-entry__wait num" data-testid="hub-queue-total">${t('等待 {n}', { n: waiting })}</b>` : null}</span>
    <button type="button" class=${`mode-card hub-entry hub-entry--${card.id}`} data-mode=${card.id} onClick=${() => onOpen(card.id)}
        title=${t(card.desc, card.params)}>
      <span class="hub-entry__icon" aria-hidden="true"><${Icon} name=${card.icon} /></span>
      <span class="hub-entry__en">${card.en}</span>
      <span class="hub-entry__name">${t(card.name)}</span>
      <span class="hub-entry__corner" aria-hidden="true"></span>
    </button>
  </div>`;
}

/** The 成就统计 label's badge (original drawing). */
function AchBadge({ class: cls }) {
  return html`<svg class=${cls} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 3h14v12l-7 6-7-6zm4 5v2h2V8zm4 0v2h2V8zm-4.5 4.2a4.5 4.5 0 0 0 7 0l-1.3-1a3 3 0 0 1-4.4 0z" fill-rule="evenodd" /></svg>`;
}

/**
 * The hub's top-left 成就统计 card (upstream's, from the event video): a dusk scene with the emblem, the trophy medal and
 * count, and the label strip with the LV and the Doctor's name and number (the top bar's 博士 chip of the earlier lobby,
 * maintainer decision 2026-11-07) — the LV and the trophies from this browser's records of the season on screen
 * (ui/level.js, ui/stats.js aggregateStats: the 成就统计 window's numbers). Read again whenever the window or 统计数据
 * closes (an import or 清空 there changes them). Opens the 成就统计 window (screens/achievements.js).
 */
function AchievementCard({ onOpen, openTick }) {
  const me = useStore((s) => s.me, shallowEqual);
  useData('config'); useData('assets');
  const cfg = data.get('config');
  const season = data.season();
  const statsOpen = useStatsOpen();
  // the 规则 模式 成就统计 opens on (maintainer decision 2026-11-08): its LV and trophies, marked with the mode's name
  const { lv, trophies, ruleset } = useMemo(() => {
    const all = recordsOfSeason(peekStatsRecords(), season);
    const rs = achievementRuleset(all, loadPref(ACHV_RULESET_PREF, null));
    const records = recordsOfRuleset(all, rs);
    return { lv: levelOf(certTotal(records, cfg?.rewards, selfRowOf), cfg?.rewards?.milestones).lv, trophies: aggregateStats(records).trophies, ruleset: rs };
  }, [cfg, season, statsOpen, openTick]);
  const medal = trophyMedalOf(trophies, cfg?.trophies?.medals);
  return html`<button type="button" class="hub-ach" onClick=${onOpen} title=${t('成就统计（本机记录）')}>
    <span class="hub-ach__scene" aria-hidden="true">
      <svg class="hub-ach__land" viewBox="0 0 320 110" preserveAspectRatio="none">
        <defs><linearGradient id="hubAchSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2a2114" /><stop offset=".5" stop-color="#b8741c" /><stop offset="1" stop-color="#f0a636" /></linearGradient></defs>
        <rect width="320" height="110" fill="url(#hubAchSky)" />
        <path d="M0 110V80l28-12 22 9 34-27 27 18 30-13 41 23 27-11 31 17 33-21 47 25V110z" fill="#3a2a16" />
        <path d="M0 110V94l46-11 41 8 50-15 44 13 50-9 40 11 49-7V110z" fill="#18120b" />
        <path d="M262 110V70M262 80l-9-8M262 76l8-7M262 86l10-6" stroke="#18120b" stroke-width="2.5" fill="none" />
      </svg>
      <span class="hub-ach__mark"><${Emblem} /></span>
      <span class="hub-ach__rank">
        <${Img} src=${medal ? uiUrl(data.get('assets'), `medalIcon/${medal.iconId}`) : null} class="hub-ach__medal" fallback=${html`<${Icon} name="rook" />`} />
        <small><${Icon} name="crown" /><b class="num">${trophies}</b></small>
      </span>
    </span>
    <span class="hub-ach__label">
      <${AchBadge} class="hub-ach__badge" />
      <span>${t('成就统计')}</span><span class=${`hub-ach__rs rtag--${ruleset}`} data-testid="hub-ach-ruleset">${t(PRESET_LABELS[ruleset])}</span><b class="hub-ach__lv num">LV.${lv}</b>
      <span class="hub-ach__who"><span class="hub-ach__name">${me.name || t('博士')}</span><${MicroLabel}>${me.playerId != null ? `DOCTOR #${doctorNo(me.playerId)}` : 'DOCTOR'}<//></span>
    </span>
  </button>`;
}

/**
 * A plate of the hub's right column on short screens (≤ 520 px tall), where the left column gives way: 成就统计 and
 * 加入同盟 · 观战 (which opens 选择同盟方式, whose join card holds the key) [ASSUMED·자료 없음: a remake layout for small
 * screens; css/screens/lobby.css shows them only then].
 */
function SidePlate({ glyph, label, onClick, class: cls }) {
  return html`<button type="button" class=${`hub-plate ${cls}`} onClick=${onClick}>
    <span class="hub-plate__glyph">${glyph}</span>
    <span class="hub-plate__label">${label}</span>
  </button>`;
}

/** Crossed blades in a hexagon: the S.W.E.E.P. plate's glyph (original drawing). */
function SweepGlyph() {
  return html`<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path d="M16 2.5 27.7 9.2v13.6L16 29.5 4.3 22.8V9.2z" fill="none" stroke="currentColor" stroke-width="1.5" />
    <path d="M9 9l12.5 12.5M23 9 10.5 21.5" stroke="currentColor" stroke-width="2.2" />
    <path d="M19.2 23.8l4.6-4.6M8.2 19.2l4.6 4.6M21.6 21.6l2.2 2.2M10.4 21.6l-2.2 2.2" stroke="currentColor" stroke-width="1.8" />
  </svg>`;
}

/**
 * S.W.E.E.P.报告: a light plate with bracket marks. The report itself is bundle ui-E's; until then the plate keeps its
 * place in the column and says so.
 */
function SweepPlate({ onClick }) {
  return html`<button type="button" class="hub-plate hub-plate--sweep lobby-sweep" onClick=${onClick} title=${t('S.W.E.E.P.报告：盟约、策略与敌方资料')}>
    <span class="hub-plate__glyph"><${SweepGlyph} /></span>
    <span class="hub-plate__label">${t('S.W.E.E.P.报告')}</span>
    <span class="hub-plate__tag">REPORT</span>
  </button>`;
}

/**
 * The event's lobby backdrop: its night map giving way to the dusk dunes on a 20 s cycle (ui/allianceScene.js; still
 * under reduced motion). Until those sprites have loaded, the entry's glow (`entry/entry_bkg_01`) and Rhodes Island
 * hologram (`entry/entry_bkg_02`) over a dark field with a faint grid; without the art pack only the field and the grid.
 * A later season with its own art extracted draws its hub instead (ui/seasonArt.js; maintainer decision 2026-11-08).
 */
function HubBackdrop() {
  const alliance = useLobbyArt();
  useData('local');
  const own = seasonBackdrop(useStore(pickedSeason));
  return html`<div class=${`hub-bg${own ? ' has-season' : ''}`} aria-hidden="true">
    ${own ? html`<img key=${own} class="hub-bg__season" src=${own} alt="" draggable=${false} />`
    : alliance ? html`<${AllianceBackdrop} />` : html`
    <${Sprite} k="entry/entry_bkg_01" class="hub-bg__glow" />
    <${Sprite} k="entry/entry_bkg_02" class="hub-bg__ship" />
    <span class="hub-bg__grid"></span>`}
  </div>`;
}

/** The radar rings behind the emblem (original drawing; the sweep stops under 减少动态效果). */
function HubRadar() {
  return html`<div class="hub-radar" aria-hidden="true">
    <svg viewBox="-240 -240 480 480">
      <circle r="92" /><circle r="152" /><circle class="hub-radar__ticks" r="214" />
      <path d="M-236 0H-176M176 0H236M0 -236V-176M0 176V236" />
    </svg>
    <i class="hub-radar__sweep"></i>
  </div>`;
}

/** The CSS heights of `.hub-center__season` (css/screens/lobby.css), for its srcset's `sizes`. */
const HUB_LOGO_HEIGHTS = [['(max-height: 520px)', '34vh'], ['', 'min(42vh, 26vw)']];

/**
 * The emblem in its radar and the season's title (卫戍协议：<season>, its Latin mark): the 盟约 season shows the official
 * `entry/season_logo`, another season (and a page without the art pack) the title's dot emblem. A later season with its
 * own logo shows that logo alone, as the official hub does (the words stay for screen readers; maintainer decision
 * 2026-11-08).
 */
function HubTitle() {
  const alphabetic = scriptOf(t('卫戍协议')) === 'alphabetic';
  const season = useStore(pickedSeason);
  const lang = useLang();
  useData('local');
  const ownSet = seasonLogoSet(season, lang);
  const own = ownSet?.src ?? null;
  const [bad, setBad] = useState(null); // a listed logo that fails to load gives the words back
  const ownOk = !!own && bad !== own;
  const mark = html`<${Emblem} />`;
  return html`<div class=${`hub-center${ownOk ? ' has-season' : ''}`}>
    <div class="hub-center__mark"><${HubRadar} />${ownOk ? html`<img key=${own} class="hub-center__season" src=${own} srcset=${ownSet.srcset ?? undefined}
      sizes=${ownSet.srcset ? logoSizes(ownSet.aspect, HUB_LOGO_HEIGHTS) : undefined} alt="" draggable=${false} onError=${() => setBad(own)} />`
      : season === DEFAULT_SEASON ? html`<${Sprite} k="entry/season_logo" class="hub-center__logo" fallback=${mark} />` : mark}</div>
    ${alphabetic || ownOk ? null : html`<div class="hub-center__en">STRONGHOLD PROTOCOL <b>${seasonInfo(season).mark}</b></div>`}
    <h1 class=${`hub-center__title${alphabetic ? ' hub-center__title--latin' : ''}${ownOk ? ' sr-only' : ''}`}>${t('卫戍协议')}<span>${alphabetic ? ': ' : '：'}</span><em>${seasonName(season)}</em></h1>
  </div>`;
}

/** File names of the official 选择模拟协议 pictures (assets `modeChoice/<name>_rhodes_island`). */
const PROTOCOL_ART = { FUNNY: 'funny', NORMAL: 'normal', HARD: 'hard', ABYSS: 'abyss' };

/** The selected difficulty's scene (ui/protocolScene.js): the official picture on the drawn grid, squares and cable. */
function ProtocolArt({ difficulty }) {
  useData('assets');
  return html`<${ProtocolScene} difficulty=${difficulty} art=${uiUrl(data.get('assets'), `modeChoice/${PROTOCOL_ART[difficulty]}_rhodes_island`)} />`;
}

/** The ‹ + dotted rook plate at the top left of the full-screen dialogs: back to the hub (or the dialog below). */
function BackPlate({ onClick, class: cls = '' }) {
  return html`<button type="button" class=${`proto-back ${cls}`} onClick=${onClick} title=${t('返回')} aria-label=${t('返回')}>
    <${Icon} name="chevronLeft" /><span class="proto-back__home"><${Icon} name="rook" /></span>
  </button>`;
}

/**
 * The 人数 switch (同盟匹配 on 选择模拟协议; 创建同盟 on 选择同盟方式): a 4-seat or an 8-seat alliance. `counts` = { [size]: n }
 * shows the Doctors waiting in the queues of each size (同盟匹配).
 */
export function SizeSwitch({ value, onPick, counts = null, disabled = false, class: cls = '' }) {
  const tip = t('八人同盟：{n}–{max} 名博士即可开始，没有 AI 队友；卡池、敌方数值和联防人数随开局人数调整', { n: LARGE_MIN_PLAYERS, max: LARGE_SEATS });
  return html`<${Tooltip} text=${tip}>
    <div class=${`dpick rpick lobby-size ${cls}`.trim()} role="radiogroup" aria-label=${t('人数')}>
      ${ROOM_SIZES.map((n) => html`<button key=${n} type="button" role="radio" aria-checked=${value === n ? 'true' : 'false'} data-size=${n} disabled=${disabled}
          class=${`dpick__opt rpick__opt${value === n ? ' is-active' : ''}`} onClick=${(e) => { e.stopPropagation(); if (value !== n) onPick(n); }}>
        ${t('{n}人', { n })}${counts ? html`<span class="rpick__n num" data-testid=${`queue-size-${n}`}>${counts[n] ?? 0}</span>` : null}
      </button>`)}
    </div>
  <//>`;
}

/** A label of the rule rows, its letters spread to the widest label's width (一 span a letter: Korean words have no spaces). */
function RowKey({ text }) {
  return html`<span class="proto-rules__k">${/\s/.test(text) ? text : [...text].map((c, i) => html`<span key=${i}>${c}</span>`)}</span>`;
}

/**
 * The rule rows at the top of 选择模拟协议's right column (maintainer decisions 2026-11-07, 2026-11-08): 规则 (经典 / 休闲 /
 * 自定义 ⚙; 自定义 locked in 同盟匹配) and 人数 (同盟匹配 only), as wide as the cards under them, drawn as the official
 * range track (`rtrack`, css/screens/room.css). With 快速匹配 (`quick`, its switch is QuickRange over the start button) on,
 * 规则 and 人数 stay, disabled. `readOnly`: the room's settings shown to a Doctor who is not its host (screens/room.js), the
 * buttons disabled. A room's (roomMode 'coop' with `onSize`) has the 人数 row too, without queue counts (maintainer
 * decision 2026-11-08: the room's mode bar opens this dialog for every setting); `sizeLocked` keeps it at 8 while more
 * than four seats are taken. No 赛季 row (maintainer decision 2026-11-13): a new room plays the season picked on the
 * lobby's chip, the one place a season is picked. A picked 自定义's summary is CustomBrief, in the brief at the left.
 */
export function ProtoRules({ roomMode, ruleset, onRuleset, onGear, size, onSize, quick = false, counts4 = null, counts8 = null, readOnly = false, sizeLocked = false }) {
  const matching = roomMode === 'match';
  const roomSize = roomMode === 'coop' && !!onSize;
  const big = matching && size === LARGE_SEATS;
  const counts = big ? counts8 : counts4;
  return html`<div class=${`proto-rules${matching || roomSize ? ' is-grid' : ''}`} data-testid="proto-rules">
    <span class="proto-rules__row">
      <${RowKey} text=${t('规则')} />
      <span class="proto-rules__cell">
        <${RulesetSwitch} value=${ruleset} onPick=${onRuleset} onGear=${onGear} editable=${!quick && !readOnly} class="proto-rules__seg rtrack"
          customLock=${matching ? t('自定义规则不能用于公开匹配，可在独立模拟或用同盟密钥创建的同盟中选择。') : null}
          counts=${roomMode === 'match' ? Object.fromEntries(QUEUE_PRESETS.map((p) => [p, queueCountOf(counts, p)])) : null} />
      </span>
    </span>
    ${matching ? html`<span class="proto-rules__row">
      <${RowKey} text=${t('人数')} />
      <span class="proto-rules__cell">
        <${SizeSwitch} value=${size} onPick=${onSize} disabled=${quick} class="proto-rules__seg rtrack"
          counts=${{ [MAX_SEATS]: queueCountOf(counts4, ruleset), [LARGE_SEATS]: queueCountOf(counts8, ruleset) }} />
      </span>
    </span>` : roomSize ? html`<span class="proto-rules__row" data-testid="proto-size">
      <${RowKey} text=${t('人数')} />
      <span class="proto-rules__cell">
        <${SizeSwitch} value=${size} onPick=${onSize} disabled=${readOnly || sizeLocked} class="proto-rules__seg rtrack" />
        ${sizeLocked && !readOnly ? html`<span class="proto-rules__note">${t('已有 5 名以上成员入座，无法改为 4 人同盟')}</span>` : null}
      </span>
    </span>` : null}
  </div>`;
}

/**
 * A picked 自定义's line at the end of 选择模拟协议's brief (maintainer decision 2026-11-08: out of the rule rows, so the
 * right column stands the same for every 规则): 自定义规则 · the preset in use and how many settings differ from the
 * official ones (CustomSummary; 同盟匹配 has no 自定义, and a solo room is never an 8-seat one).
 */
export function CustomBrief({ roomMode, ruleset, customRules, difficulty, grade = null }) {
  if (roomMode === 'match' || ruleset !== 'custom') return null;
  return html`<span class="proto-brief__rules" data-testid="proto-custom-brief">${t('自定义规则')} · <${CustomSummary} rules=${customRules.draft} store=${customRules} roomMode=${roomMode} difficulty=${difficulty} grade=${grade} size=${MAX_SEATS} /></span>`;
}

/**
 * 快速匹配 as the official matching range switch (auto_chess_mode_choice_pop_view's btn_range_switch, maintainer decision
 * 2026-11-08), over 开始匹配: the official 宽泛 / 精准 range is our 快速匹配 on (the difficulty only) / off (规则 and 人数
 * too). A dark track (range_bg) whose white hatched pill (range_selectbg) covers three quarters of it with the picked
 * side's icon and name; the other side shows its icon alone (wide_icon / accurate_icon, assets `room/*`; its name when
 * the icon is missing).
 */
export function QuickRange({ quick, onQuick }) {
  useData('assets');
  const m = data.get('assets');
  const side = (k, icon, name, on) => {
    const src = uiUrl(m, `room/${icon}`);
    return html`<span class=${`qrange__o qrange__o--${k}${on ? ' is-sel' : ''}`}>
      ${src ? html`<i class="qrange__icon" aria-hidden="true" style=${`--m:url("${src}")`}></i>` : null}
      ${on || !src ? html`<span class="qrange__name">${name}</span>` : null}
    </span>`;
  };
  return html`<button type="button" role="switch" aria-checked=${quick ? 'true' : 'false'} aria-label=${t('快速匹配')}
      class=${`qrange${quick ? ' is-on' : ''}`} data-testid="quick-switch" onClick=${() => onQuick?.(!quick)}>
    <span class="qrange__pill" aria-hidden="true"></span>
    ${side('wide', 'wide_icon', t('快速匹配'), quick)}
    ${side('exact', 'accurate_icon', t('精准匹配'), !quick)}
  </button>`;
}

/**
 * 选择模拟协议 (laid out after the event's second screen): full screen — the selected difficulty's official picture and
 * brief at the left (`brief`, a node at its end: CustomBrief), the rule rows (`rules`, a node) and the four difficulty
 * cards down the right (the chosen one slides out with the 已选定 stamp), the hint, `range` (a node: QuickRange) and the
 * start button below them, as the official auto_chess_mode_choice_pop_view's tips, range switch and button. `roomMode`
 * 'coop' without `action` is 同盟模拟's 创建同盟 (room.create at the picked difficulty, 规则, 人数 and 赛季); its button keeps
 * the class `ally-create__go` the browser suites press. The project's Modal (focus trap, Esc, focus
 * restored) styled to fill the screen. `roomMode`: 'solo' (开始独立模拟), 'match' (开始匹配; `waiting(d)` the Doctors of each
 * card's queue) or 'coop' (a room's host, bundle ui-B: `action` / `hint` replace the button's label and the hint), or
 * `readOnly` — the cards shown, not chosen, and no button.
 */
export function ProtocolSelect({ roomMode, difficulty, onDifficulty, onClose, onStart, busy, online, rules = null, waiting = null,
  action = null, hint = null, readOnly = false, range = null, brief = null, grade = null, onGrade = null }) {
  const card = MODE_CARDS.find((c) => c.id === roomMode) || MODE_CARDS[0];
  // a 规程 solo room (`grade` set): the 规程等级 rows instead of the difficulty cards, the brief and picture the grade's
  const graded = isGrade(grade);
  const ginfo = graded ? gradeInfo(/** @type {number} */ (grade)) : null;
  if (ginfo) difficulty = ginfo.difficulty;
  const info = ginfo || difficultyInfo(roomMode === 'solo' ? 'solo' : 'coop', difficulty);
  const label = action || (roomMode === 'solo' ? t('开始独立模拟') : roomMode === 'match' ? t('开始匹配') : t('创建同盟'));
  const defaultHint = roomMode === 'solo' ? t('创建后即可开始模拟') : roomMode === 'match' ? t('与选择同一难度、规则和人数的博士组成同盟') : t('创建后可邀请好友或添加 AI 队友');
  return html`<${Modal} open=${true} onClose=${onClose} class="proto" veilClass="proto-veil">
    <div class="proto__body" style=${`--d-color:${ginfo ? ginfo.color : DIFFICULTY_COLORS[difficulty]}`} data-difficulty=${difficulty} data-mode=${roomMode}>
      <div class="proto__bg" aria-hidden="true"></div>
      <${ProtoFit} />
      <header class="proto-top">
        <${BackPlate} onClick=${onClose} class="proto__back" />
        <div class="proto-title">
          <h2 class="modal__title">${t('选择模拟协议')}</h2>
          <span class="proto-title__mode"><${Icon} name=${card.icon} />${t(card.name)}<i>${card.en}</i></span>
        </div>
      </header>
      <div class="proto-body">
        <section class="proto-stage">
          <div key=${difficulty} class="proto__pic"><${ProtocolArt} difficulty=${difficulty} /></div>
          <div class="proto-brief">
            <span class="proto-brief__code num">${info.code}</span>
            <b class="proto-brief__name">${graded ? gradeName(/** @type {number} */ (grade)) : t(DIFFICULTY_NAMES[difficulty])}</b>
            <p>${info.desc}</p>
            <div class="proto-brief__more" data-testid="proto-brief-more">
              <span class="proto-brief__effects">${info.effects.map((e) => html`<span key=${e}>${e}</span>`)}</span>
              <span class="proto-brief__meta"><${DifficultyRounds} info=${info} /></span>
            </div>
            ${brief}
          </div>
        </section>
        <section class="proto-side">
          ${rules}
          ${graded ? html`<${GradeList} grade=${grade} onGrade=${onGrade || (() => {})} disabled=${readOnly} />`
            : html`<div class="proto-list" role="group" aria-label=${t('模拟难度')}>
            ${DIFFICULTIES.map((d) => html`<${DifficultyCard} key=${d} roomMode=${roomMode === 'solo' ? 'solo' : 'coop'} difficulty=${d} selected=${difficulty === d}
              onSelect=${onDifficulty} disabled=${readOnly} waiting=${waiting ? waiting(d) : null} />`)}
          </div>`}
          ${readOnly ? html`<div class="proto-foot proto-foot--ro">
            <p class="proto-hint proto-hint--ro"><${Icon} name="info" />${hint || t('由创建者选择')}</p>
          </div>` : html`<div class=${`proto-foot create-box${range ? ' proto-foot--range' : ''}`}>
            <p class="proto-hint">
              ${online ? hint ?? defaultHint : html`<${Spinner} size="sm" label="CONNECTING" /> ${t('正在连接服务器…')}`}
            </p>
            ${range}
            <button type="button" class=${`proto-start${roomMode === 'coop' && !action ? ' ally-create__go' : ''}`} data-testid="proto-start" disabled=${!online || busy === 'create'} aria-busy=${busy === 'create' ? 'true' : 'false'} onClick=${onStart}>
              <span class="proto-start__mark" aria-hidden="true"><span class="proto-start__rook"><i>[</i><${Icon} name="rook" /><i>]</i></span><small>STRONGHOLD<br />PROTOCOL</small></span>
              <span class="proto-start__label">${busy === 'create' ? html`<${Spinner} size="sm" />` : null}${label}</span>
              <span class="proto-start__deco" aria-hidden="true"></span>
            </button>
          </div>`}
        </section>
      </div>
    </div>
  <//>`;
}

/**
 * 加入同盟 · 观战 (laid out after the event's screen after 同盟模拟), opened by the 加入同盟 · 观战 plate of a phone too narrow
 * for the hub's left column: full screen — a radar at the left with 玩法说明 under it, at the right the 加入同盟 card alone
 * (the key field with 观战, the recent keys that only fill it, 加入同盟). 同盟模拟 itself opens 选择模拟协议 (maintainer
 * decision 2026-11-08: the room is made at the difficulty, 规则, 人数 and 赛季 picked there, no second step in the room).
 * `short`: the screen is at most 520 px tall — the key field's placeholder is the field's name alone.
 */
export function AllianceSelect({ onClose, code, onCode, codeOk, online, busy, onJoin, onSpectate, recent, focusKey, short = false }) {
  return html`<${Modal} open=${true} onClose=${onClose} class="ally" veilClass="proto-veil">
    <div class="ally__body">
      <div class="proto__bg ally__bg" aria-hidden="true"></div>
      <header class="proto-top">
        <${BackPlate} onClick=${onClose} class="ally__back" />
        <div class="proto-title">
          <h2 class="modal__title">${t('加入同盟 · 观战')}</h2>
          <span class="proto-title__mode ally__mode"><${Icon} name="users" />${t('同盟模拟')}<i>ALLIANCE SIMULATION</i></span>
        </div>
      </header>
      <div class="proto-body ally-body">
        <section class="ally-stage">
          <${RadarScene} />
          <button type="button" class="ally-guide" onClick=${() => openGuide(0)}><span class="ally-guide__icon"><${Icon} name="book" /></span>${t('玩法说明')}</button>
        </section>
        <section class="ally-side ally-side--join">
          <div class="ally-card ally-card--join ally-join join-row">
            <span class="ally-card__art"><${JoinArt} /></span>
            <div class="ally-key">
              <${TextField} class="ally-key__field" size="code" icon="key" value=${code} transform=${normalizeCode} onInput=${onCode} onEnter=${() => onJoin()}
                placeholder=${short ? t('同盟密钥') : t('输入同盟密钥 / 粘贴邀请链接')} placeholderShort=${t('同盟密钥')} ariaLabel=${t('同盟密钥')}
                modalFocus=${!!focusKey} />
              <button type="button" class="ally-key__spec join-spectate" disabled=${!codeOk || !online || busy === 'spectate'} onClick=${() => onSpectate()}
                title=${t('以观战者身份进入：不占博士席位，只能观看（每个同盟最多 {MAX_SPECTATORS} 名，模拟进行中也可进入）', { MAX_SPECTATORS })}>
                ${busy === 'spectate' ? html`<${Spinner} size="sm" />` : html`<${Icon} name="eye" />`}${t('观战')}</button>
            </div>
            <span class="ally-recent join-foot">
              ${recent.length ? html`<span class="t-lo">${t('最近的同盟')}</span>
                ${recent.map((c) => html`<button key=${c} type="button" class="code-chip num" title=${t('填入密钥（不会直接加入）')}
                  onClick=${() => onCode(c)}>${c}</button>`)}`
                : html`<span class="t-dim">${t('向同伴索取 {ROOM_CODE_LEN} 位同盟密钥，或直接打开邀请链接', { ROOM_CODE_LEN })}</span>`}
            </span>
            <button type="button" class="ally-card__bar ally-card__bar--join" disabled=${!codeOk || !online || busy === 'join'} onClick=${() => onJoin()}>
              <span class="ally-card__icon"><${Icon} name="users" /></span>${t('加入同盟')}${busy === 'join' ? html`<${Spinner} size="sm" />` : null}
            </button>
          </div>
        </section>
      </div>
    </div>
  <//>`;
}

/** The hub's 加入同盟 box (left column): the key, 加入同盟, 观战 and the recent keys, as the earlier lobby's join panel. */
function JoinBox({ code, onCode, codeOk, online, busy, onJoin, onSpectate, recent }) {
  return html`<div class="hub-join brackets" data-testid="hub-join">
    <div class="hub-join__head"><${Icon} name="key" /><span>${t('加入同盟')}</span><${MicroLabel}>JOIN WITH ALLIANCE KEY<//></div>
    <div class="hub-join__row join-row">
      <${TextField} size="code" icon="key" value=${code} placeholder=${t('输入同盟密钥 / 粘贴邀请链接')} placeholderShort=${t('同盟密钥')}
        transform=${normalizeCode} onInput=${onCode} onEnter=${() => onJoin()} />
      <${Button} variant="amber" size="sm" loading=${busy === 'join'} disabled=${!codeOk || !online} onClick=${() => onJoin()}>${t('加入同盟')}<//>
      <${Tooltip} text=${t('以观战者身份进入：不占博士席位，只能观看（每个同盟最多 {MAX_SPECTATORS} 名，模拟进行中也可进入）', { MAX_SPECTATORS })}>
        <${Button} variant="secondary" size="sm" icon="eye" class="join-spectate" loading=${busy === 'spectate'} disabled=${!codeOk || !online} onClick=${() => onSpectate()}>${t('观战')}<//>
      <//>
    </div>
    ${recent.length ? html`<div class="join-foot">
      <span class="t-lo">${t('最近的同盟')}</span>
      ${recent.map((c) => html`<button key=${c} type="button" class="code-chip num" title=${t('填入密钥（不会直接加入）')} onClick=${() => onCode(c)}>${c}</button>`)}
    </div>` : null}
  </div>`;
}

/** Lobby screen component. */
export function LobbyScreen() {
  useDocClass('sp-topbar'); // toasts sit under the top bar instead of over its title (components.css)
  const conn = useStore((s) => s.connection, shallowEqual);
  useData('config', 'assets', 'factions'); // factions: the 特训敌人 names of a custom room's summary (matchQueue.js customFound)
  const [difficulty, setDifficulty] = useState(() => {
    const d = loadPref('lobby.difficulty', 'FUNNY');
    return DIFFICULTIES.includes(d) ? d : 'FUNNY';
  });
  const [ruleset, setRuleset] = useState(lobbyRuleset);
  const [queueRuleset, setQueueRuleset] = useState(lobbyQueueRuleset);
  const customRules = useStore((s) => s, Object.is, customRulesStore);
  const [size, setSize] = useState(lobbySize);
  const [quick, setQuick] = useState(() => loadPref('lobby.quick', false) === true);
  const [grade, setGrade] = useState(lobbyGrade);
  // the open dialog: 'solo' | 'match' (选择模拟协议) | 'coop' (选择模拟协议 → 创建同盟) | 'join' (加入同盟 · 观战, AllianceSelect)
  const [open, setOpen] = useState(null);
  const [sweepOpen, setSweepOpen] = useState(false);
  const [achOpen, setAchOpen] = useState(false);
  const [achTick, setAchTick] = useState(0);
  const closeAch = () => { setAchOpen(false); setAchTick((n) => n + 1); };
  const notes = usePatchNotes();
  // the 更新记录 dialog (HubNotes' 查看全部): null when closed, else whether the newest release is marked NEW
  const [notesFresh, setNotesFresh] = useState(/** @type {boolean | null} */ (null));
  // the picked 卫戍协议 season (ui/season.js): rooms are created and queued in it, its queues' Doctors are shown
  const season = useStore(pickedSeason);
  const queueCounts4 = useStore((s) => seasonQueueCounts(s, pickedSeason(s), false));
  const queueCounts8 = useStore((s) => seasonQueueCounts(s, pickedSeason(s), true));
  const queueQuick = useStore((s) => seasonQuickCounts(s, pickedSeason(s)));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(null);
  const [recent] = useState(recentRooms);
  const [coarse] = useState(() => detectFeatures().coarse);
  const shortScreen = useMediaQuery(SHORT_SCREEN_QUERY);
  const alive = useRef(true);
  const inFlight = useRef(false); // synchronous guard against double clicks (state updates are async)
  useEffect(() => () => { alive.current = false; }, []);

  const online = conn.status === 'online';
  const codeOk = CODE_RE.test(code);
  // the dialog's mode: 'solo' (选择模拟协议 of 独立模拟), 'match' (of 同盟匹配), 'coop' (同盟模拟's screen)
  const roomMode = open === 'solo' ? 'solo' : open === 'match' ? 'match' : 'coop';
  const matching = roomMode === 'match';
  // 规程 (header of GRADES): a solo room picks a 规程等级
  const graded = gradedRoom(roomMode, season);
  const big = roomMode !== 'solo' && size === LARGE_SEATS;
  const roomRuleset = ruleset;

  const pickGrade = (g) => { setGrade(g); savePref('lobby.grade', g); };
  const pickDifficulty = (d) => { setDifficulty(d); savePref('lobby.difficulty', d); };
  const pickSize = (n) => { setSize(n); savePref('lobby.size', n); };
  const pickQuick = (on) => { setQuick(on); savePref('lobby.quick', on); };
  const pickRuleset = (p) => { setRuleset(p); if (isQueuePreset(p)) setQueueRuleset(p); saveLobbyRuleset(p); };
  // 同盟匹配 has no 自定义 (QUEUE_PRESETS): it queues with the last of 经典 / 休闲 picked
  const shownRuleset = matching ? queueRuleset : roomRuleset;
  const editCustom = () => openCustomRules({ rules: customDraft(), roomMode: roomMode === 'solo' ? 'solo' : 'coop', difficulty,
    grade: graded ? grade : null, size: big ? LARGE_SEATS : MAX_SEATS, onApply: () => pickRuleset('custom') });

  const run = async (kind, fn) => {
    if (inFlight.current) return;
    if (!online) { toast(t('尚未连接到服务器，请稍候'), 'warn'); return; }
    inFlight.current = true;
    setBusy(kind);
    try { await fn(); } catch (err) { toastError(err); } finally {
      inFlight.current = false;
      if (alive.current) setBusy(null);
    }
  };
  // 独立模拟 at the difficulty and ruleset picked on 选择模拟协议; 创建同盟 at the remembered ones, changed in the room
  const gradeFields = graded ? { difficulty: gradeDifficulty(grade), grade } : { difficulty };
  const create = () => run('create', () => net.request('room.create', roomRuleset === 'custom'
    ? { mode: roomMode, ...gradeFields, ruleset: roomRuleset, custom: customDraft(), ...sizeFields(roomMode, big ? LARGE_SEATS : MAX_SEATS), ...seasonFields(season) }
    : { mode: roomMode, ...gradeFields, ruleset: roomRuleset, ...sizeFields(roomMode, big ? LARGE_SEATS : MAX_SEATS), ...seasonFields(season) }));
  const queue = () => run('create', () => (quick ? joinQuickQueue(difficulty, season)
    : joinQueue(difficulty, queueRuleset, big ? LARGE_SEATS : MAX_SEATS, season)));
  const join = (c = code) => {
    // `onClick=${join}` hands the click EVENT as the first argument, and a default parameter only applies to
    // `undefined` — codeArg keeps an event target out of the key and falls back to the input field
    const k = codeArg(c, code);
    if (!k) { toast(t('同盟密钥为 {ROOM_CODE_LEN} 位字母或数字', { ROOM_CODE_LEN }), 'warn'); return; }
    run('join', () => net.request('room.join', { code: k }));
  };
  // a spectator seat: no player seat taken, nothing to do but watch (also a match already running)
  const spectate = (c = code) => {
    // same guard as join: `onClick=${spectate}` passes the click event, not a code
    const k = codeArg(c, code);
    if (!k) { toast(t('同盟密钥为 {ROOM_CODE_LEN} 位字母或数字', { ROOM_CODE_LEN }), 'warn'); return; }
    run('spectate', () => net.request('room.spectate', { code: k }).catch((err) => {
      // Clearer than the bare ERR_TEXT: the usual cause is a code that is not the host's (a remembered one from an
      // earlier room, or another machine's) — the server can only answer "no such room".
      if (err?.code === ERR.ROOM_NOT_FOUND) {
        toast(t('没有找到密钥 {k} 对应的同盟：请和房主核对密钥（同盟结束后密钥即失效）', { k }), 'warn');
        return;
      }
      if (err?.code === ERR.ALREADY) {
        toast(t('你已经是该同盟的博士：先离开同盟，才能以观战身份进入'), 'warn');
        return;
      }
      throw err;
    }));
  };
  const backToTitle = () => {
    identity.setEntered(false);
    store.set((s) => ({ session: { ...s.session, entered: false } }));
  };
  const onCode = (v) => setCode(normalizeCode(v));
  // the queue's waiting Doctors per difficulty card: its ruleset × size queue, or with 快速匹配 the whole difficulty
  const waiting = matching ? (d) => (quick ? quickWaiting(queueCounts4, queueCounts8, queueQuick, d) : queueCountOf(big ? queueCounts8 : queueCounts4, queueRuleset, d)) : null;
  const totalWaiting = countAll(queueCounts4) + countAll(queueCounts8) + countAll(queueQuick);

  return html`<div class="screen lobby-screen lobby-hub">
    <${HubBackdrop} />
    <header class="topbar">
      <div class="topbar__left">
        <${Button} variant="ghost" size="sm" icon="chevronLeft" onClick=${backToTitle} title=${t('返回标题')}>${t('返回')}<//>
        <${PingPill} ms=${conn.ping} online=${online} />
        ${online ? html`<${OnlinePill} n=${conn.online} />` : null}
        <span class="topbar__sep" aria-hidden="true"></span>
        <div class="topbar__tools">
          <${SettingsButton} class="lobby-settings" variant="secondary" square=${true} />
          <${GuideButton} class="lobby-guide" variant="secondary" square=${true} />
        </div>
      </div>
      <div class="topbar__right">
        <${SeasonChip} onPick=${pickSeasonThroughDark} />
        <${ResumeMatchButton} />
      </div>
    </header>

    <main class="hub-stage">
      <${HubTitle} />
      <aside class="hub-side">
        <${AchievementCard} onOpen=${() => setAchOpen(true)} openTick=${achTick} />
        <${JoinBox} code=${code} onCode=${onCode} codeOk=${codeOk} online=${online} busy=${busy} onJoin=${join} onSpectate=${spectate} recent=${recent} />
        <${HubNotes} short=${shortScreen} notes=${notes} onAll=${setNotesFresh} />
      </aside>
      <aside class="hub-right">
        <${SweepPlate} onClick=${() => setSweepOpen(true)} />
        <${LoadoutButton} from="lobby" size="lg" class="hub-plate hub-plate--loadout lobby-loadout" label=${t('干员调配')} />
        <${SidePlate} class="hub-plate--ach" glyph=${html`<${AchBadge} />`} label=${t('成就统计')} onClick=${() => setAchOpen(true)} />
        <${SidePlate} class="hub-plate--join" glyph=${html`<${Icon} name="key" />`} label=${t('加入同盟 · 观战')} onClick=${() => setOpen('join')} />
      </aside>
      <section class="hub-entries" aria-label=${t('模拟方式')}>
        ${MODE_CARDS.map((c) => html`<${HubEntry} key=${c.id} card=${c} onOpen=${setOpen} waiting=${c.id === 'match' ? totalWaiting : null} />`)}
      </section>
    </main>

    ${open === 'join' ? html`<${AllianceSelect} onClose=${() => setOpen(null)}
      code=${code} onCode=${onCode} codeOk=${codeOk} online=${online} busy=${busy}
      onJoin=${join} onSpectate=${spectate} recent=${recent} focusKey=${!coarse} short=${shortScreen} />` : null}
    ${open === 'solo' || open === 'match' || open === 'coop' ? html`<${ProtocolSelect} roomMode=${roomMode} difficulty=${difficulty} onDifficulty=${pickDifficulty}
      grade=${graded ? grade : null} onGrade=${pickGrade}
      onClose=${() => setOpen(null)} onStart=${matching ? queue : create} busy=${busy} online=${online} waiting=${waiting}
      action=${matching && quick ? t('开始快速匹配') : null}
      hint=${matching && quick ? t('规则与人数随匹配到的队列而定') : null}
      range=${matching ? html`<${QuickRange} quick=${quick} onQuick=${pickQuick} />` : null}
      brief=${html`<${CustomBrief} roomMode=${roomMode} ruleset=${shownRuleset} customRules=${customRules} difficulty=${difficulty} grade=${graded ? grade : null} />`}
      rules=${html`<${ProtoRules} roomMode=${roomMode} ruleset=${shownRuleset} onRuleset=${pickRuleset} onGear=${editCustom}
        size=${big ? LARGE_SEATS : MAX_SEATS} onSize=${roomMode === 'solo' ? null : pickSize} quick=${matching && quick} counts4=${queueCounts4} counts8=${queueCounts8} />`} />` : null}
    ${sweepOpen ? html`<${SweepReport} onClose=${() => setSweepOpen(false)} />` : null}
    ${achOpen ? html`<${AchievementDialog} onClose=${closeAch} />` : null}
    <${PatchNotesModal} open=${notesFresh !== null} onClose=${() => setNotesFresh(null)} entries=${notes} fresh=${!!notesFresh} />
    <${MatchQueueDialog} />
    <${CustomRulesDialog} />
  </div>`;
}

/**
 * Beside a picked 自定义: the preset whose settings are in use (none when they were changed after it) and how many
 * settings differ from the official ones of the chosen difficulty (and room size: an 8-seat room's official bans).
 */
export function CustomSummary({ rules, store: st, roomMode, difficulty, grade = null, size }) {
  // a 规程 solo room compares with its 规程等级's mode and difficulty
  const graded = roomMode === 'solo' && isGrade(grade);
  const diff = graded ? gradeDifficulty(grade) : difficulty;
  const mode = DIFFICULTIES.includes(diff) ? getMode(modeIdFor(roomMode === 'solo' ? 'solo' : 'coop', diff, graded ? grade : null)) : null;
  const n = customDiffs(rules, { bans: officialBans(getConfig(), diff, size), rounds: mode?.lastRound ?? null }).length;
  const p = st.presets.find((x) => x.id === st.active && JSON.stringify(x.rules) === JSON.stringify(rules));
  return html`<span class="lobby-rules__sum" data-testid="custom-summary">${p ? html`<b>${p.name}</b> · ` : null}${t('与官方不同的设置 {n} 项', { n })}</span>`;
}
