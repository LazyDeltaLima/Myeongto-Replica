// Lobby screen: pick 独立模拟 / 同盟模拟 / 同盟匹配 and a difficulty (标准/险境/绝境/终极), then create a room or — 同盟匹配, the
// random matchmaking — queue for a co-op match of that difficulty (ui/matchQueue.js shows the queue and its confirmation,
// server/matchmaking.js has the rules; the card follows another fork's lobby the maintainer showed, 2026-10-13),
// or join one with a 同盟密钥 (recent codes remembered) — as a player (加入同盟) or in one of its MAX_SPECTATORS
// spectator seats (观战: room.spectate, also while its match runs; community report #26, a remake feature — the
// official room has none). Shows connection status + ping. The tips panel has an 更新 tab beside the tips: the patch
// notes one line at a time (ui/patchNotes.js, maintainer decision 2026-10-13).
// 규칙 모드 (shared/ruleset.js, maintainer decisions 2026-10-15, 2026-10-18): the 规则 switch under the difficulty label
// picks 经典 / 休闲 / 自定义 for 创建 / 开始独立模拟 (room.create ruleset, custom: the settings of ui/customRulesStore.js,
// edited behind the ⚙ — ui/customRules.js) and 经典 / 休闲 for 开始匹配 (room.queue: one queue per difficulty and
// ruleset; 自定义 is locked there with its reason in the tooltip), remembered like the difficulty (classic the first time).
// In 同盟匹配 the switch shows each ruleset's waiting Doctors and every difficulty card those of its queue
// (lobby.queueCounts, ui/ruleset.js queueCountOf). Beside a picked 自定义: the preset in use and how many settings
// differ from the official ones.
// The 8-player mode (maintainer decisions 2026-10-16, 2026-10-19): under the mode cards of 同盟模拟 / 同盟匹配 the 人数 switch
// picks a 4-seat or an 8-seat alliance (room.create / room.queue `size`, remembered in `lobby.size`); with 8 the queue
// counts are those of the 8-player queues (lobby.queueCounts `counts8`), the cards and hints name 8 Doctors, the
// custom rules compare with the 8-player bans (config.eightPlayer), and 同盟模拟 has no AI teammates.
//
// Difficulty descriptions come from data/config.json `modes[modeId]` when present, else from the
// official act2autochess `modeDataDict` texts embedded below (desc + effectDescList), so the
// screen is complete before data is generated. Rounds: solo 标准 = 9, everything else 14 (+R15
// hidden core on 险境+), per research 00-INDEX §2. Battlefield pool (`modes[].stages`): 标准 always
// plays 战场#01, 险境 draws one of 8, 绝境 / 终极 one of 7 (m01 excluded).
// Texts go through t() (docs/I18N.md); the module-level tables hold msgids (N_) translated where they are shown, the
// config.json mode texts come localized from data.js.

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { DIFFICULTIES, DIFFICULTY_NAMES, DIFFICULTY_COLORS, ROOM_CODE_LEN, MAX_SEATS, LARGE_SEATS, ROOM_SIZES, MAX_SPECTATORS, modeIdFor, ERR } from '../../../shared/constants.js';
import { html, Button, Icon, MicroLabel, Panel, TextField, PingPill, OnlinePill, AvatarFrame, Tooltip, Spinner, DifficultyIcon, doctorNo } from '../ui/components.js';
import { toast, toastError } from '../ui/toasts.js';
import { GuideButton } from '../ui/guide.js';
import { openStats } from './stats.js';
import { SettingsButton } from '../ui/settings.js';
import { LoadoutButton } from './loadout.js';
import { ResumeMatchButton } from '../ui/resumeMatch.js';
import { MatchQueueDialog, joinQueue } from '../ui/matchQueue.js';
import { RulesetSwitch, lobbyRuleset, lobbyQueueRuleset, saveLobbyRuleset, queueCountOf } from '../ui/ruleset.js';
import { QUEUE_PRESETS, isQueuePreset, customDiffs, officialBans } from '../../../shared/ruleset.js';
import { CustomRulesDialog, openCustomRules } from '../ui/customRules.js';
import { customRulesStore, customDraft } from '../ui/customRulesStore.js';
import { PatchNotesModal, usePatchNotes, isUnseen, markSeen, slidesOf, Inline } from '../ui/patchNotes.js';
import { net, identity } from '../net.js';
import { useDocClass } from '../ui/device.js';
import { store, useStore, shallowEqual, loadPref, savePref } from '../store.js';
import { getConfig, getMode, getStage, useData } from '../data.js';
import { t, tc, N_ } from '../../../shared/i18n.js';

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
    points: [N_('1 名博士'), N_('休整期与机变阶段不限时')],
  },
  {
    id: 'coop', name: N_('同盟模拟'), en: 'ALLIANCE SIMULATION', icon: 'users',
    desc: N_('与至多 {n} 名博士组成同盟，共享干员池，联防协作抵御敌潮。'), params: { n: MAX_SEATS - 1 },
    points: [N_('1–{n} 名博士 · 可由 AI 队友补位'), N_('联防阶段 · 最终攻势合并生命值')], pointParams: { n: MAX_SEATS },
    // the 8-seat alliance: every seat a Doctor
    big: { desc: N_('与另外 {n} 名博士组成同盟，共享干员池，联防协作抵御敌潮。'), params: { n: LARGE_SEATS - 1 },
      points: [N_('{n} 名博士坐满后开始 · 没有 AI 队友'), N_('联防阶段 · 最终攻势合并生命值')], pointParams: { n: LARGE_SEATS } },
  },
  {
    id: 'match', name: N_('同盟匹配'), en: 'ALLIANCE MATCHMAKING', icon: 'signal',
    desc: N_('独自进入公共匹配池，与其他博士组成同盟后开始模拟。'),
    points: [N_('单人加入 · 自动匹配队友'), N_('仅匹配真人 · 满 {n} 人后开始')], pointParams: { n: MAX_SEATS },
    big: { points: [N_('单人加入 · 自动匹配队友'), N_('仅匹配真人 · 满 {n} 人后开始')], pointParams: { n: LARGE_SEATS } },
  },
];
const MODE_IDS = MODE_CARDS.map((c) => c.id);

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
const NEWS_ROTATE_MS = 8000; // the 更新 tab's lines are longer than a tip

/** The 01/15 counter and the previous / next arrows shared by both tabs of the tips panel. */
function TipsPager({ at, total, onStep }) {
  return html`<span class="tips__idx num">${String(at + 1).padStart(2, '0')}<span class="t-dim">/${String(total).padStart(2, '0')}</span></span>
    <button type="button" class="tips__nav" onClick=${() => onStep(-1)} aria-label=${t('上一条')}><${Icon} name="chevronLeft" /></button>
    <button type="button" class="tips__nav" onClick=${() => onStep(1)} aria-label=${t('下一条')}><${Icon} name="chevronRight" /></button>`;
}

/**
 * Rotating tactical tips (config.json `tips`, weighted list of { tip, weight }), and beside them the 更新 tab: the newest
 * release one line at a time — its summary, then each change with its group (ui/patchNotes.js slidesOf) — stepping every
 * NEWS_ROTATE_MS, held while the pointer is over the panel and for good once the player steps by hand (maintainer decision
 * 2026-10-13); 查看全部 opens the 更新记录 window. The 更新 tab opens by itself, marked NEW, on the first lobby visit after a
 * release; without patch notes (/changelog.json unreachable) the panel has no tabs.
 */
function TipsPanel() {
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
  const notes = usePatchNotes();
  const latest = notes?.[0] || null;
  const [tab, setTab] = useState('tips');
  const [fresh, setFresh] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [newsIdx, setNewsIdx] = useState(0);
  const [hover, setHover] = useState(false);
  const [held, setHeld] = useState(false); // the player stepped by hand: no more auto stepping
  useEffect(() => {
    if (!latest || !isUnseen(latest.version)) return;
    setFresh(true);
    setTab('news');
    markSeen(latest.version);
  }, [latest?.version]);
  const news = tab === 'news' && !!latest;
  useEffect(() => {
    if (!news || hover || held || notesOpen) return undefined;
    const id = setInterval(() => setNewsIdx((n) => n + 1), NEWS_ROTATE_MS);
    return () => clearInterval(id);
  }, [news, hover, held, notesOpen]);
  const slides = latest ? slidesOf(latest) : [];
  const i = ((idx % list.length) + list.length) % list.length;
  const n = slides.length ? ((newsIdx % slides.length) + slides.length) % slides.length : 0;
  const slide = slides[n];
  const stepNews = (d) => { setHeld(true); setNewsIdx(n + d + slides.length); };
  return html`<div class=${`tips brackets${latest ? ' has-news' : ''}`} onMouseEnter=${() => setHover(true)} onMouseLeave=${() => setHover(false)}>
    <div class="tips__head">
      <${Icon} name="info" />
      ${latest ? html`<span class="tips__tabs" role="tablist">
          <${Button} variant="ghost" size="sm" class=${`tips__tab${news ? '' : ' is-on'}`} role="tab" aria-selected=${!news}
            onClick=${() => setTab('tips')}>${t('作战提示')}<//>
          <${Button} variant="ghost" size="sm" class=${`tips__tab${news ? ' is-on' : ''}`} role="tab" aria-selected=${news}
            onClick=${() => setTab('news')}>${t('更新')}${fresh ? html`<span class="tips__new">NEW</span>` : null}<//>
        </span>`
        : html`<span>${t('作战提示')}</span><${MicroLabel}>TACTICAL TIPS<//>`}
      ${news ? html`<${TipsPager} at=${n} total=${slides.length} onStep=${stepNews} />`
        : html`<${TipsPager} at=${i} total=${list.length} onStep=${(d) => setIdx(i + d + list.length)} />`}
    </div>
    ${news ? html`<p key=${`n${n}`} class="tips__text tips__news">
        ${slide.summary != null ? html`<span class="tips__ver num">v${latest.version}</span>
          ${/^\d{4}-\d\d-\d\d$/.test(latest.date) ? html`<span class="tips__date num">${latest.date.slice(5)}</span>` : null}
          <span class="tips__sum">${slide.summary}</span>`
        : html`${slide.group ? html`<span class="tips__group">${slide.group}</span>` : null}
          <span class="tips__sum"><${Inline} segs=${slide.segs} /></span>`}
        <button type="button" class="tips__more" onClick=${() => setNotesOpen(true)}>${t('查看全部')}<${Icon} name="chevronRight" /></button>
      </p>`
      : html`<p key=${i} class="tips__text">${list[i]}</p>`}
    <${PatchNotesModal} open=${notesOpen} onClose=${() => setNotesOpen(false)} entries=${notes} fresh=${fresh} />
  </div>`;
}

function ModeCard({ card, selected, onSelect, big = false }) {
  const v = big && card.big ? { ...card, ...card.big } : card;
  return html`<button type="button" class=${`mode-card brackets${selected ? ' is-selected' : ''}`} onClick=${() => onSelect(card.id)}
      aria-pressed=${selected ? 'true' : 'false'}>
    <span class="mode-card__bg" aria-hidden="true"></span>
    <span class="mode-card__icon"><${Icon} name=${card.icon} /></span>
    <span class="mode-card__text">
      <${MicroLabel} tone=${selected ? 'mint' : undefined}>${card.en}<//>
      <span class="mode-card__name">${t(card.name)}</span>
      <span class="mode-card__desc">${t(v.desc, v.params)}</span>
      <span class="mode-card__points">${v.points.map((p) => html`<span key=${p}>${t(p, v.pointParams)}</span>`)}</span>
    </span>
    <span class="mode-card__check" aria-hidden="true"><${Icon} name="check" />${t('已选定')}</span>
  </button>`;
}

function DifficultyCard({ roomMode, difficulty, selected, onSelect, waiting = null }) {
  const info = difficultyInfo(roomMode, difficulty);
  return html`<button type="button" class=${`diff-card${selected ? ' is-selected' : ''}`}
      style=${`--d-color:${DIFFICULTY_COLORS[difficulty]}`} onClick=${() => onSelect(difficulty)} aria-pressed=${selected ? 'true' : 'false'}>
    <span class="diff-card__bar" aria-hidden="true"></span>
    <span class="diff-card__head">
      <${DifficultyIcon} difficulty=${difficulty} class="diff-card__glyph" />
      <span class="diff-card__name">${t(DIFFICULTY_NAMES[difficulty])}</span>
      <span class="diff-card__code num">${info.code}</span>
      <span class="diff-card__meta">
        <span class="num">${info.rounds}</span> ${tc('rounds', '回合')}${info.hidden ? html`<span class="diff-card__hidden">${t('+ 隐秘核心')}</span>` : null}
      </span>
      ${waiting != null ? html`<span class=${`diff-card__wait${waiting > 0 ? ' is-on' : ''}`} data-testid=${`queue-count-${difficulty}`}>${t('{n} 人匹配中', { n: waiting })}</span>` : null}
    </span>
    <span class="diff-card__desc">${info.desc}</span>
    <span class="diff-card__effects">${info.effects.map((e) => html`<span key=${e}>${e}</span>`)}${info.stageNote ? html`<span key="stage" class="diff-card__stage"><${Icon} name="rook" />${info.stageNote}</span>` : null}</span>
    <span class="diff-card__check" aria-hidden="true"><${Icon} name="check" /><span>${t('已选定')}</span></span>
  </button>`;
}

/**
 * The 人数 switch of 同盟模拟 / 同盟匹配: a 4-seat or an 8-seat alliance (styled like the rules switch). `counts` = { [size]: n }
 * shows the Doctors waiting in the queues of each size (同盟匹配).
 */
function SizeSwitch({ value, onPick, counts = null }) {
  return html`<div class="lobby-size">
    <span class="lobby-rules__k">${t('人数')}</span>
    <${Tooltip} text=${t('八人同盟：{n} 名博士坐满后开始，没有 AI 队友；联防最多 4 名博士同时迎战', { n: LARGE_SEATS })}>
      <div class="dpick rpick" role="radiogroup" aria-label=${t('人数')}>
        ${ROOM_SIZES.map((n) => html`<button key=${n} type="button" role="radio" aria-checked=${value === n ? 'true' : 'false'} data-size=${n}
            class=${`dpick__opt rpick__opt${value === n ? ' is-active' : ''}`} onClick=${() => value !== n && onPick(n)}>
          ${t('{n} 人同盟', { n })}${counts ? html`<span class="rpick__n num" data-testid=${`queue-size-${n}`}>${counts[n] ?? 0}</span>` : null}
        </button>`)}
      </div>
    <//>
  </div>`;
}

/** Lobby screen component. */
export function LobbyScreen() {
  useDocClass('sp-topbar'); // toasts sit under the top bar instead of over its title (components.css)
  const me = useStore((s) => s.me, shallowEqual);
  const conn = useStore((s) => s.connection, shallowEqual);
  useData('config');
  // 'solo' | 'coop' (room.create) | 'match' (room.queue, co-op)
  const [roomMode, setRoomMode] = useState(() => { const m = loadPref('lobby.mode', 'coop'); return MODE_IDS.includes(m) ? m : 'coop'; });
  const [difficulty, setDifficulty] = useState(() => {
    const d = loadPref('lobby.difficulty', 'FUNNY');
    return DIFFICULTIES.includes(d) ? d : 'FUNNY';
  });
  const [ruleset, setRuleset] = useState(lobbyRuleset);
  const [queueRuleset, setQueueRuleset] = useState(lobbyQueueRuleset);
  const customRules = useStore((s) => s, Object.is, customRulesStore);
  const [size, setSize] = useState(lobbySize);
  const queueCounts4 = useStore((s) => s.ui.queueCounts);
  const queueCounts8 = useStore((s) => s.ui.queueCounts8);
  const big = roomMode !== 'solo' && size === LARGE_SEATS;
  // the waiting Doctors of the queues of the chosen size
  const queueCounts = big ? queueCounts8 : queueCounts4;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(null);
  const [recent] = useState(recentRooms);
  const alive = useRef(true);
  const inFlight = useRef(false); // synchronous guard against double clicks (state updates are async)
  useEffect(() => () => { alive.current = false; }, []);

  const online = conn.status === 'online';
  const codeOk = CODE_RE.test(code);

  const pickMode = (m) => { setRoomMode(m); savePref('lobby.mode', m); };
  const pickDifficulty = (d) => { setDifficulty(d); savePref('lobby.difficulty', d); };
  const pickSize = (n) => { setSize(n); savePref('lobby.size', n); };
  const pickRuleset = (p) => { setRuleset(p); if (isQueuePreset(p)) setQueueRuleset(p); saveLobbyRuleset(p); };
  const matching = roomMode === 'match';
  // 同盟匹配 has no 自定义 (QUEUE_PRESETS): it queues with the last of 经典 / 休闲 picked
  const shownRuleset = matching ? queueRuleset : ruleset;
  const editCustom = () => openCustomRules({ rules: customDraft(), roomMode: roomMode === 'solo' ? 'solo' : 'coop', difficulty,
    size: big ? LARGE_SEATS : MAX_SEATS, onApply: () => pickRuleset('custom') });

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
  const create = () => run('create', () => net.request('room.create', ruleset === 'custom'
    ? { mode: roomMode, difficulty, ruleset, custom: customDraft(), ...sizeFields(roomMode, size) }
    : { mode: roomMode, difficulty, ruleset, ...sizeFields(roomMode, size) }));
  const queue = () => run('create', () => joinQueue(difficulty, queueRuleset, big ? LARGE_SEATS : MAX_SEATS));
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

  return html`<div class="screen lobby-screen">
    <header class="topbar">
      <div class="topbar__left">
        <${Button} variant="ghost" size="sm" icon="chevronLeft" onClick=${backToTitle} title=${t('返回标题')}>${t('返回')}<//>
        <${PingPill} ms=${conn.ping} online=${online} />
        ${online ? html`<${OnlinePill} n=${conn.online} />` : null}
      </div>
      <div class="topbar__center">
        <${MicroLabel} tone="mint">SIMULATION PROTOCOL SELECT<//>
        <h1 class="topbar__title">${t('选择模拟协议')}</h1>
      </div>
      <div class="topbar__right">
        <${ResumeMatchButton} />
        <${SettingsButton} class="lobby-settings" variant="secondary" label=${t('设置')} />
        <${GuideButton} class="lobby-guide" variant="secondary" label=${t('玩法说明')} />
        <${LoadoutButton} from="lobby" size="sm" class="lobby-loadout" label=${t('干员调配')} />
        <button type="button" class="me-chip" onClick=${openStats} title=${t('统计数据')}>
          <${AvatarFrame} size="sm" name=${me.name} seat=${0} self=${true} />
          <span class="me-chip__text">
            <span class="me-chip__name">${me.name || t('博士')}</span>
            <${MicroLabel}>${me.playerId != null ? `DOCTOR #${doctorNo(me.playerId)}` : 'DOCTOR'}<//>
          </span>
          <span class="me-chip__go" aria-hidden="true"><${Icon} name="chart" /></span>
        </button>
      </div>
    </header>

    <div class="lobby-body screen__scroll">
      <section class="lobby-left">
        <div class="section-label"><span class="section-label__idx num">01</span>${t('模拟方式')}<${MicroLabel}>MODE<//></div>
        <div class="mode-cards">
          ${MODE_CARDS.map((c) => html`<${ModeCard} key=${c.id} card=${c} selected=${roomMode === c.id} onSelect=${pickMode} big=${big} />`)}
        </div>
        ${roomMode !== 'solo' ? html`<${SizeSwitch} value=${size} onPick=${pickSize}
          counts=${matching ? { [MAX_SEATS]: queueCountOf(queueCounts4, queueRuleset), [LARGE_SEATS]: queueCountOf(queueCounts8, queueRuleset) } : null} />` : null}

        <div class="section-label"><span class="section-label__idx num">03</span>${t('加入同盟')}<${MicroLabel}>JOIN WITH ALLIANCE KEY<//></div>
        <${Panel} class="join-panel" tone="amber">
          <div class="join-row">
            <${TextField} size="code" icon="key" value=${code} placeholder=${t('输入同盟密钥 / 粘贴邀请链接')}
              transform=${normalizeCode} onInput=${(v) => setCode(normalizeCode(v))} onEnter=${() => join()} />
            <${Button} variant="amber" size="lg" icon="users" loading=${busy === 'join'} disabled=${!codeOk || !online} onClick=${() => join()}>${t('加入同盟')}<//>
            <${Tooltip} text=${t('以观战者身份进入：不占博士席位，只能观看（每个同盟最多 {MAX_SPECTATORS} 名，模拟进行中也可进入）', { MAX_SPECTATORS })}>
              <${Button} variant="secondary" size="lg" icon="eye" class="join-spectate" loading=${busy === 'spectate'} disabled=${!codeOk || !online} onClick=${spectate}>${t('观战')}<//>
            <//>
          </div>
          <div class="join-foot">
            ${recent.length ? html`<span class="t-lo">${t('最近的同盟')}</span>
              ${recent.map((c) => html`<button key=${c} type="button" class="code-chip num" title=${t('填入密钥（不会直接加入）')}
                onClick=${() => setCode(c)}>${c}</button>`)}`
              : html`<span class="t-dim">${t('向同伴索取 {ROOM_CODE_LEN} 位同盟密钥，或直接打开邀请链接', { ROOM_CODE_LEN })}</span>`}
          </div>
        <//>
        <${TipsPanel} />
      </section>

      <section class="lobby-right">
        <div class="section-label section-label--rules"><span class="section-label__idx num">02</span>${t('模拟难度')}<${MicroLabel}>DIFFICULTY<//>
          <div class="lobby-rules">
            <span class="lobby-rules__k">${t('规则')}</span>
            <${RulesetSwitch} value=${shownRuleset} onPick=${pickRuleset} onGear=${editCustom}
              customLock=${matching ? t('自定义规则不能用于公开匹配，可在独立模拟或用同盟密钥创建的同盟中选择。') : null}
              counts=${matching ? Object.fromEntries(QUEUE_PRESETS.map((p) => [p, queueCountOf(queueCounts, p)])) : null} />
            ${!matching && ruleset === 'custom' ? html`<${CustomSummary} rules=${customRules.draft} store=${customRules} roomMode=${roomMode} difficulty=${difficulty} size=${big ? LARGE_SEATS : MAX_SEATS} />` : null}
          </div>
        </div>
        <div class="diff-list">
          ${DIFFICULTIES.map((d) => html`<${DifficultyCard} key=${d} roomMode=${roomMode} difficulty=${d} selected=${difficulty === d} onSelect=${pickDifficulty}
            waiting=${matching ? queueCountOf(queueCounts, queueRuleset, d) : null} />`)}
        </div>
        <div class="create-box">
          <${Tooltip} block=${true} text=${online ? null : t('正在连接服务器…')}>
            <${Button} variant="primary" size="xl" block=${true} iconRight="chevrons" loading=${busy === 'create'} disabled=${!online}
              onClick=${roomMode === 'match' ? queue : create}>
              ${roomMode === 'solo' ? t('开始独立模拟') : roomMode === 'match' ? t('开始匹配') : t('创建同盟')}
            <//>
          <//>
          <div class="create-box__hint">
            ${online
              ? html`<span>${roomMode === 'solo' ? t('创建后即可开始模拟') : roomMode === 'match' ? t('与选择同一难度和规则的博士组成同盟') : big ? t('创建后邀请好友坐满 {n} 个席位', { n: LARGE_SEATS }) : t('创建后可邀请好友或添加 AI 队友')}</span>`
              : html`<${Spinner} size="sm" label="CONNECTING" />`}
          </div>
        </div>
      </section>
    </div>
    <${MatchQueueDialog} />
    <${CustomRulesDialog} />
  </div>`;
}

/**
 * Beside a picked 自定义: the preset whose settings are in use (none when they were changed after it) and how many
 * settings differ from the official ones of the chosen difficulty (and room size: an 8-seat room's official bans).
 */
export function CustomSummary({ rules, store: st, roomMode, difficulty, size }) {
  const mode = DIFFICULTIES.includes(difficulty) ? getMode(modeIdFor(roomMode === 'solo' ? 'solo' : 'coop', difficulty)) : null;
  const n = customDiffs(rules, { bans: officialBans(getConfig(), difficulty, size), rounds: mode?.lastRound ?? null }).length;
  const p = st.presets.find((x) => x.id === st.active && JSON.stringify(x.rules) === JSON.stringify(rules));
  return html`<span class="lobby-rules__sum" data-testid="custom-summary">${p ? html`<b>${p.name}</b> · ` : null}${t('与官方不同的设置 {n} 项', { n })}</span>`;
}
