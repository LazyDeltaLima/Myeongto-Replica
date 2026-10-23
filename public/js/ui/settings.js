// Player settings (BGM/SFX/voice volume, mute, the chat notification, damage numbers, render quality, the match notices, the shortcut keys): a tiny observable
// store persisted in localStorage (`sp.pref.settings`), applied to the audio manager on every change, plus
// the settings modal, in sections by function (SetSection: 通用 / 声音 / 聊天提示 / 画面, maintainer decision 2026-10-14) — 通用
// holds the language switch (ui/lang.js; kept apart in `sp.pref.lang`; under it a note
// while the current language's pack is a machine translation, `_meta.machineTranslated`) and the resource download; after
// them come the 快捷键 section that rebinds the in-match shortcuts (the key map: ui/gameLogic/shortcuts.js; the community request
// 「快捷键可不可以自己设置」, the owner's decision of 2026-10-07) and 问题反馈, which copies the diagnostics of this page
// for a bug report (diag.js: the error log, this browser, optionally the battle on screen; nothing is uploaded). The lobby
// and the room open it from a 设置 button next to 玩法说明 (SettingsButton, GitHub #238); the title screen and the match
// have their own gear.

import { useLayoutEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button, Icon, MicroLabel } from './components.js';
import { GIcon } from './gameComponents.js';
import { createStore, useStore, loadPref, savePref, store } from '../store.js';
import { sanitizeSettings, setNumberUnitMode, numberUnitMode, CHAT_COOLDOWN, HOTKEY_ACTIONS, DEFAULT_HOTKEYS, hotkeyLabel, rebindHotkey, isDefaultHotkeys, captureHotkey } from './gameLogic.js';
import { audio } from '../audio.js';
import { openGuide } from './guide.js';
import { detectFeatures } from './device.js';
import { ResourceSetting } from '../resources.js'; // local patch
import { VoiceSetting } from '../voice.js'; // local patch
import { UiScaleSetting } from './hudArt.js'; // local patch: 界面大小 (the PC client's UI_SCALER)
import { NumberStyleSetting } from './numberStyleSetting.js'; // local patch
import { LangToggle, machineTranslationNote } from './lang.js';
import { t, tc, N_, langInfo } from '../../../shared/i18n.js';
import { errorCount, currentBattle, diagnosticsText } from '../diag.js';
import { copyText } from './clipboard.js';
import { GpuNote } from './gpuNotice.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** Settings store: { bgm, sfx, voice, muted, damageNumbers, quality, keys }. */
export const settingsStore = createStore(sanitizeSettings(loadPref('settings', null)));

settingsStore.subscribe((s) => {
  savePref('settings', sanitizeSettings(s));
  audio.setVolumes(s);
  setNumberUnitMode(s.numberUnits);
});
audio.setVolumes(settingsStore.get());
setNumberUnitMode(settingsStore.get().numberUnits);

/** @param {Partial<ReturnType<typeof sanitizeSettings>>} patch */
export function updateSettings(patch) {
  settingsStore.set(sanitizeSettings({ ...settingsStore.get(), ...patch }));
}

/** Preact hook: current settings. */
export const useSettings = () => useStore((s) => s, Object.is, settingsStore);

/**
 * The label of the key a rebindable shortcut has right now ('R', 'Space' …) — the HUD's key hints (shop bar, ready /
 * pause, underframe). Read at render: the game screen re-renders when the settings dialog closes.
 * @param {'refresh'|'freeze'|'levelUp'|'retreat'|'sell'|'ready'} action
 */
export const hotkeyLabelOf = (action) => hotkeyLabel(settingsStore.get().keys?.[action]);

function Slider({ label, micro, value, onInput, icon }) {
  const pct = Math.round(value * 100);
  return html`<label class="set-row">
    <span class="set-row__label"><${Icon} name=${icon} />${label}<${MicroLabel}>${micro}<//></span>
    <input class="set-range" type="range" min="0" max="100" step="5" value=${pct} style=${`--pct:${pct}%`}
      onInput=${(e) => onInput(Number(e.currentTarget.value) / 100)} />
    <span class="set-row__val num">${pct}</span>
  </label>`;
}

function Toggle({ label, micro, value, onChange }) {
  return html`<div class="set-row">
    <span class="set-row__label">${label}<${MicroLabel}>${micro}<//></span>
    <button type="button" class=${`set-toggle${value ? ' is-on' : ''}`} role="switch" aria-checked=${value ? 'true' : 'false'}
      onClick=${() => onChange(!value)}><i></i><span>${value ? tc('toggle', '开启') : tc('toggle', '关闭')}</span></button>
  </div>`;
}

/**
 * 聊天提示音: the notification of the others' chat lines (audio.js chatNotification) — on / off, then, while on, its
 * volume (moving it plays the sound), the gap between two notifications and whether a faction pick rings too.
 * @param {{ s: ReturnType<typeof sanitizeSettings> }} props
 */
function ChatSoundSection({ s }) {
  const previewAt = useRef(0);
  const preview = () => {
    const now = Date.now();
    if (now - previewAt.current < 400) return;
    previewAt.current = now;
    audio.chatNotification({ preview: true });
  };
  const { min, max } = CHAT_COOLDOWN;
  const pct = Math.round(((s.chatCooldown - min) / (max - min)) * 100);
  return html`<${Toggle} label=${t('聊天提示音')} micro="CHAT SOUND" value=${s.chatSound}
      onChange=${(v) => { updateSettings({ chatSound: v }); if (v) preview(); }} />
    ${s.chatSound ? html`<${Slider} label=${t('提示音音量')} micro="CHAT VOLUME" icon="signal" value=${s.chatVolume}
        onInput=${(v) => { updateSettings({ chatVolume: v }); preview(); }} />
      <label class="set-row">
        <span class="set-row__label"><${Icon} name="hourglass" />${t('提示间隔')}<${MicroLabel}>COOLDOWN<//></span>
        <input class="set-range" type="range" min=${min} max=${max} step="1" value=${s.chatCooldown} style=${`--pct:${pct}%`}
          data-testid="chat-cooldown" onInput=${(e) => updateSettings({ chatCooldown: Number(e.currentTarget.value) })} />
        <span class="set-row__val num">${t('{n}秒', { n: s.chatCooldown })}</span>
      </label>
      <${Toggle} label=${t('阵营选择提示')} micro="FACTION ALERTS" value=${s.chatFactionAlerts} onChange=${(v) => updateSettings({ chatFactionAlerts: v })} />
      <p class="set-hint">${t('房间和对局中其他玩家发来新消息时播放表情提示音。提示音播放中或提示间隔内收到的消息不再提示。')}</p>` : null}`;
}

const QUALITY = [['high', N_('高')], ['medium', N_('中')], ['low', N_('低')]];

/**
 * 数字单位: how large numbers are shortened (fmtNum: the damage broadcast, the result screen, HP, the stats) — each choice
 * shows 200000 in its style; 万 / 亿 only in a language that names its own units (the Korean 만 / 억, maintainer decision
 * 2026-10-24). The highlighted choice is the one in effect, the language's own while nothing was picked.
 */
function NumberUnitsSetting() {
  const units = langInfo()?.numberUnits;
  const cur = numberUnitMode();
  const opts = [units ? ['myriad', `20${units[0]}`] : null, ['thousand', '200K'], ['full', '200,000']].filter(Boolean);
  return html`<div class="set-row" data-number-units=${cur}>
    <span class="set-row__label">${t('数字单位')}<${MicroLabel}>NUMBER UNITS<//></span>
    <div class="set-seg" role="radiogroup">
      ${opts.map(([id, label]) => html`<button key=${id} type="button" role="radio" aria-checked=${cur === id ? 'true' : 'false'}
        class=${cur === id ? 'is-on' : ''} onClick=${() => updateSettings({ numberUnits: id })}>${label}</button>`)}
    </div>
  </div>
  <p class="set-hint">${t('伤害播报、结算、生命值等较大数字的显示方式。')}</p>`;
}
/** The rebindable shortcuts' names (msgids), by action. */
const HOTKEY_NAMES = { refresh: N_('刷新商店'), freeze: N_('冻结 / 解冻商店'), levelUp: N_('升级调度中心'), retreat: N_('撤退选中干员'),
  sell: N_('出售选中干员'), ready: N_('准备就绪 / 暂停（独立模拟）') };

/**
 * 快捷键: each shortcut with its key. Click its key (or Enter / Space on it) and press the new one: Esc cancels (the
 * dialog stays open), Tab leaves, a key held with Ctrl / Alt / ⌘ or one the interface keeps is refused, a key another
 * shortcut has is swapped — the line under the list says what happened; 恢复默认 restores the keys of 0.1.4. Esc
 * (cancel / close) is fixed. On a touch-only device the section says the keys need a keyboard and folds the list (an
 * attached keyboard still uses it).
 * @param {{ keys: Record<string, string>, touchUi: boolean }} props
 */
function HotkeySection({ keys, touchUi }) {
  const [waiting, setWaiting] = useState(null); // the action waiting for its new key
  const [note, setNote] = useState(null);       // { text, warn }: the result line
  // a layout effect: the key listener is on as soon as the key shows that it waits (an Esc right after the click must
  // end the wait, never reach the dialog's own Esc)
  useLayoutEffect(() => {
    if (!waiting) return undefined;
    const name = t(HOTKEY_NAMES[waiting]);
    const onKey = (e) => {
      const r = captureHotkey(e);
      if (r.kind === 'leave') { setWaiting(null); return; } // Tab: the focus moves on
      // ahead of the dialog's own Esc (it stays open), a focused button's Enter / Space and every other key handler
      e.preventDefault();
      e.stopImmediatePropagation();
      if (r.kind === 'ignore') return;
      const cur = settingsStore.get().keys;
      if (r.kind === 'cancel') {
        setWaiting(null);
        setNote({ text: t('已取消，「{action}」仍是 {key}', { action: name, key: hotkeyLabel(cur[waiting]) }) });
        return;
      }
      if (r.kind === 'refuse') {
        setNote({ warn: true, text: r.reason === 'modifier' ? t('快捷键只能是单个按键，不能搭配 Ctrl、Alt 或 ⌘')
          : t('{key} 不能设为快捷键：Esc、Tab、Enter、方向键和功能键留给界面使用', { key: r.name }) });
        return;
      }
      const res = rebindHotkey(cur, waiting, r.code);
      updateSettings({ keys: res.keys });
      setWaiting(null);
      const key = hotkeyLabel(r.code);
      setNote({ text: res.swapped
        ? t('「{action}」已改为 {key}；「{other}」原来用 {key}，已换成 {old}', { action: name, key, other: t(HOTKEY_NAMES[res.swapped]), old: hotkeyLabel(res.keys[res.swapped]) })
        : t('「{action}」已改为 {key}', { action: name, key }) });
    };
    // a press anywhere but the waiting key ends the wait (another key starts its own)
    const onDown = (e) => { if (!(e.target instanceof Element) || !e.target.closest('.set-key.is-waiting')) setWaiting(null); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onDown, true); };
  }, [waiting]);

  const status = note ? note.text : waiting ? t('请按下「{action}」的新按键（Esc 取消）', { action: t(HOTKEY_NAMES[waiting]) }) : '';
  const list = html`<ul class="set-keys__list">
    ${HOTKEY_ACTIONS.map((a) => {
      const on = waiting === a;
      const label = hotkeyLabel(keys?.[a]);
      return html`<li key=${a} class="set-keys__row">
        <span class="set-keys__name">${t(HOTKEY_NAMES[a])}</span>
        <button type="button" class=${cx('set-key', on && 'is-waiting')} data-action=${a} aria-pressed=${on ? 'true' : 'false'}
          aria-label=${t('更改「{action}」的快捷键（当前：{key}）', { action: t(HOTKEY_NAMES[a]), key: label })}
          onClick=${() => { setNote(null); setWaiting((w) => (w === a ? null : a)); }}>
          ${on ? html`<span class="set-key__wait">${t('按下新按键…')}</span>` : html`<kbd>${label}</kbd>`}
        </button>
      </li>`;
    })}
    <li class="set-keys__row is-fixed">
      <span class="set-keys__name">${t('取消 / 关闭')}</span>
      <span class="set-key is-fixed"><kbd>Esc</kbd><small>${t('不可更改')}</small></span>
    </li>
  </ul>
  <p class=${cx('set-keys__note', note?.warn && 'is-warn')} role="status" aria-live="polite">${status}</p>`;
  return html`<section class="set-keys" aria-labelledby="set-keys-title">
    <div class="set-keys__head">
      <span class="set-row__label" id="set-keys-title">${t('快捷键')}<${MicroLabel}>HOTKEYS<//></span>
      <${Button} variant="ghost" size="sm" icon="refresh" class="set-keys__reset" disabled=${isDefaultHotkeys(keys)}
        onClick=${() => { setWaiting(null); updateSettings({ keys: DEFAULT_HOTKEYS }); setNote({ text: t('已恢复默认快捷键') }); }}>${t('恢复默认')}<//>
    </div>
    ${touchUi ? html`<p class="set-hint">${t('快捷键需要实体键盘；触屏设备连接键盘后可用')}</p>
      <details class="set-keys__more"><summary>${t('查看 / 更改快捷键')}</summary>${list}</details>` : list}
  </section>`;
}

/**
 * Where a report goes (shown as text the player can select; a link may open nothing): our own repository's tracker, not
 * upstream's — this fork's reports are ours to triage (maintainer decision 2026-10-09: this address, before the repository
 * exists — it opens once the repository is created).
 */
export const ISSUES_URL = 'https://github.com/LazyDeltaLima/Myeongto-Replica/issues';

/**
 * 问题反馈: copy the diagnostics of this page (diag.js) for a GitHub issue — the errors recorded since the page opened,
 * this browser and device, where the player is, and, switched on by default while a battle is on screen, that battle's
 * spec (the dev tools replay it). Player names, the room code and the token are replaced; nothing is uploaded. Laid out
 * like 快捷键 above it (a head with its button, a hint, the result line); the battle switch is the settings' Toggle, and
 * when the clipboard refuses (some in-app browsers), the report is shown selected in a box styled like 干员调配's 导出.
 */
/** The result line of 复制诊断信息, by outcome (msgids: translated when shown, so a language switch reaches it). */
const DIAG_NOTES = { copied: N_('已复制诊断信息，可以粘贴到 GitHub issue 中'), refused: N_('无法写入剪贴板，请手动复制下面的内容') };

function DiagSection() {
  const [attach, setAttach] = useState(true);
  const [note, setNote] = useState(null);       // 'copied' | 'refused' | null: the result line
  const [manual, setManual] = useState(null);   // the report, when the clipboard refused it
  const boxRef = useRef(null);
  // the box opens selected for a manual copy, scrolled to its first line (select() leaves it at the end)
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (manual && el) { el.focus(); el.select(); el.scrollTop = 0; }
  }, [manual]);
  const n = errorCount();
  const battle = currentBattle();
  const copy = async () => {
    const text = diagnosticsText({ state: store.get(), settings: settingsStore.get(), attachBattle: attach && !!battle });
    const ok = await copyText(text);
    setManual(ok ? null : text);
    setNote(ok ? 'copied' : 'refused');
  };
  return html`<section class="set-diag" aria-labelledby="set-diag-title">
    <div class="set-keys__head">
      <span class="set-row__label" id="set-diag-title">${t('问题反馈')}<${MicroLabel}>DIAGNOSTICS<//></span>
      <${Button} variant="ghost" size="sm" icon="copy" class="set-diag__copy" data-testid="diag-copy" onClick=${copy}>${t('复制诊断信息')}<//>
    </div>
    <p class="set-hint">${t('遇到问题时，复制诊断信息并粘贴到 GitHub issue 中，开发者就能看到出错时的情况。诊断信息只在本机生成，不会自动上传；玩家名和房间号会被替换。')}</p>
    <div class="set-diag__meta">
      <span class="set-diag__stat">${t('已记录的错误')}<b class=${cx('set-diag__count num', n > 0 && 'is-warn')} data-testid="diag-count">${n}</b></span>
      <span class="set-diag__url">${ISSUES_URL.replace(/^https:\/\//, '')}</span>
    </div>
    ${battle ? html`<${Toggle} label=${t('附上本场战斗')} micro="BATTLE DATA" value=${attach} onChange=${setAttach} />
      <p class="set-hint set-diag__battle-hint">${t('开发者可以用附上的战斗数据重现这场战斗。')}</p>` : null}
    ${note ? html`<p class=${cx('set-keys__note', note === 'refused' && 'is-warn')} role="status" aria-live="polite">${t(DIAG_NOTES[note])}</p>` : null}
    ${manual ? html`<textarea ref=${boxRef} class="set-diag__text" data-testid="diag-text" spellcheck=${false} readOnly
      aria-label=${t('诊断信息')} value=${manual}></textarea>` : null}
  </section>`;
}

/**
 * One section of the settings modal, headed like 快捷键 / 问题反馈 (a title with its micro label over a rule): the rows
 * grouped by what they set — 通用 (language, the resource download), 声音, 聊天提示, 画面 (maintainer decision 2026-10-14).
 * @param {{ id: string, title: string, micro: string, children?: any }} props
 */
function SetSection({ id, title, micro, children }) {
  return html`<section class=${`set-sec set-sec--${id}`} aria-labelledby=${`set-sec-${id}`} data-testid=${`set-sec-${id}`}>
    <div class="set-sec__head"><span class="set-row__label" id=${`set-sec-${id}`}>${title}<${MicroLabel}>${micro}<//></span></div>
    ${children}
  </section>`;
}

/**
 * Settings modal.
 * @param {{ open: boolean, onClose: Function }} props
 */
export function SettingsModal({ open, onClose }) {
  const s = useSettings();
  const [tested, setTested] = useState(false);
  const [touchUi] = useState(() => detectFeatures().coarse && !detectFeatures().fine);
  const mtNote = machineTranslationNote(); // a pack marked as machine translation says so under the switch
  return html`<${Modal} open=${open} onClose=${onClose} title=${t('设置')} micro="SETTINGS" width="7.4rem"
    actions=${html`<${Button} variant="secondary" icon="book" class="set-guide" onClick=${() => openGuide(0)}>${t('玩法说明')}<//>
      <${Button} variant="primary" icon="check" onClick=${onClose}>${t('完成')}<//>`}>
    <div class="set-list">
      <${SetSection} id="general" title=${t('通用')} micro="GENERAL">
        <div class="set-row">
          <span class="set-row__label">${t('语言')}<${MicroLabel}>LANGUAGE<//></span>
          <${LangToggle} class="set-lang" />
        </div>
        ${mtNote ? html`<p class="set-hint set-lang-note" data-testid="lang-mt-note">${mtNote}</p>` : null}
        <${ResourceSetting} />${/* local patch */ ''}
      <//>
      <${SetSection} id="sound" title=${t('声音')} micro="SOUND">
        <${Slider} label=${t('背景音乐')} micro="BGM" icon="play" value=${s.bgm} onInput=${(v) => updateSettings({ bgm: v })} />
        <${Slider} label=${t('干员语音')} micro="VOICE" icon="mic" value=${s.voice} onInput=${(v) => updateSettings({ voice: v })} />
        <${Slider} label=${t('音效')} micro="SFX" icon="signal" value=${s.sfx}
          onInput=${(v) => { updateSettings({ sfx: v }); if (!tested) { setTested(true); setTimeout(() => setTested(false), 400); audio.sfx('click'); } }} />
        <${VoiceSetting} />${/* local patch */ ''}
        <${Toggle} label=${t('静音')} micro="MUTE" value=${s.muted} onChange=${(v) => updateSettings({ muted: v })} />
      <//>
      <${SetSection} id="chat" title=${t('聊天提示')} micro="CHAT ALERTS">
        <${ChatSoundSection} s=${s} />
        <${Toggle} label=${t('常驻最近 3 条消息')} micro="PIN RECENT" value=${s.chatPinRecent} onChange=${(v) => updateSettings({ chatPinRecent: v })} />
        <p class="set-hint">${t('开启后对局中聊天收起时，最近 3 条聊天消息一直显示在聊天按钮上方，不再几秒后消失。')}</p>
      <//>
      <${SetSection} id="display" title=${t('画面')} micro="DISPLAY">
        <${Toggle} label=${t('显示伤害数字')} micro="DAMAGE NUMBERS" value=${s.damageNumbers} onChange=${(v) => updateSettings({ damageNumbers: v })} />
        ${s.damageNumbers ? html`<${NumberStyleSetting} />` : ''}${/* local patch: 官方 / 全部 numbers */ ''}
        <div class="set-row">
          <span class="set-row__label">${t('画面质量')}<${MicroLabel}>QUALITY<//></span>
          <div class="set-seg" role="radiogroup">
            ${QUALITY.map(([id, label]) => html`<button key=${id} type="button" role="radio" aria-checked=${s.quality === id ? 'true' : 'false'}
              class=${s.quality === id ? 'is-on' : ''} onClick=${() => updateSettings({ quality: id })}>${t(label)}</button>`)}
          </div>
        </div>
        <${NumberUnitsSetting} />
        <${Toggle} label=${t('精锐干员标记')} micro="ELITE BADGE" value=${s.eliteBadge} onChange=${(v) => updateSettings({ eliteBadge: v })} />
        <${Toggle} label=${t('对局通知')} micro="MATCH NOTICES" value=${s.matchNotices} onChange=${(v) => updateSettings({ matchNotices: v })} />
        <p class="set-hint">${t('关闭后对局中不再弹出任何通知：获得干员、盟约资金等提示，干员退回整备区、淘汰等警告，以及操作无法执行的原因。')}</p>
        <${UiScaleSetting} />${/* local patch */ ''}
        <${GpuNote} />
      <//>
      <${HotkeySection} keys=${s.keys} touchUi=${touchUi} />
      <${DiagSection} />
      <p class="set-hint">${touchUi ? t('触屏操作：点击单位选中（撤退 / 出售）· 长按单位或卡牌查看详情 · 拖动部署后滑动选择朝向') : t('右键查看详情')}</p>
    </div>
  <//>`;
}

/**
 * The 设置 button of the lobby and the room (GitHub #238 — before it the settings were reachable only from the title
 * screen and a running match): the twin of the 玩法说明 button (ui/guide.js GuideButton), with the settings modal behind it
 * (mounted only while open). The same modal as the title screen's and the match's: nothing in it is match-only.
 * @param {{ class?: string, size?: 'sm'|'md'|'lg'|'xl', variant?: string, label?: string }} props
 */
export function SettingsButton({ class: cls, size = 'sm', variant = 'ghost', label = t('设置') }) {
  const [open, setOpen] = useState(false);
  return html`<${Button} variant=${variant} size=${size} class=${cx('settings-btn', cls)} onClick=${() => setOpen(true)}
      title=${t('设置')} aria-label=${t('设置')} data-testid="settings-btn"><${GIcon} name="gear" class="btn__icon" />${label}<//>
    ${open ? html`<${SettingsModal} open=${true} onClose=${() => setOpen(false)} />` : null}`;
}
