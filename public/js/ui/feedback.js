// Local patch: the settlement screen's 피드백 보내기 (screens/result.js) — a bug report or a suggestion sent to this
// server's feedback inbox (fb.send → server/local-feedback.js). Where the server names a repository (welcome
// `feedbackIssues`, user decision 2026-10-09 stage 2) every report becomes a public issue there (server/feedback-relay.js):
// the window says so, sends `public`, and the receipt links to the issue search; otherwise the report stays on the
// server for the operator (stage 1) and the window says that. The player picks the kind, writes what happened and chooses the
// attachments: the diagnostics of this page (diag.js: version, browser, the error log) and this match's battles as the
// browser received them (diag.js matchBattles: the dev tools replay them; gzip + base64 to fit the socket's 64 KB
// frame — the oldest battles without errors are left out first when it does not). Player names and the room code are
// replaced in both, as in 设置 → 问题反馈 (which only copies). The button shows only while the server says its inbox is
// on (welcome `feedback`) — off on a local server without SP_FEEDBACK_DIR. Only the text and the diagnostics are posted;
// the battles stay on the server.

import { useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button, MicroLabel } from './components.js';
import { createStore, useStore, store } from '../store.js';
import { settingsStore } from './settings.js';
import { diagnosticsText, matchBattles, battleCount as countBattles } from '../diag.js';
import { copyText } from './clipboard.js';
import { t, tc, N_ } from '../../../shared/i18n.js';
import { net } from '../net.js';
import { FEEDBACK_KINDS, FEEDBACK_TEXT_MAX, FEEDBACK_DIAG_MAX, FEEDBACK_BATTLES_MAX } from '../../../shared/local.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** Whether this server keeps feedback (the last welcome's `feedback`) and the issue list reports are posted to, if any. */
export const feedbackStore = createStore({ enabled: false, issues: null });

/** An https://github.com/<owner>/<name>/issues address, or null. @param {unknown} v */
export const issuesUrlOf = (v) => (typeof v === 'string' && /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/issues$/.test(v) ? v : null);

/** @param {{ net: { on: Function } }} deps */
export function installFeedback({ net }) {
  net.on('welcome', (msg) => feedbackStore.set({ enabled: !!msg?.feedback, issues: msg?.feedback ? issuesUrlOf(msg.feedbackIssues) : null }));
}

/** The issue search of a receipt id (the relay writes the id into the issue). @param {string} issues @param {string} id */
export const issueSearchUrl = (issues, id) => `${issues}?q=${encodeURIComponent(`is:issue ${id}`)}`;

/** A kind's label (context `feedback`: 错误 alone is too common a msgid). @param {string} k */
const kindLabel = (k) => (k === 'bug' ? tc('feedback', '错误') : k === 'idea' ? tc('feedback', '建议') : tc('feedback', '其他'));

/** A receipt id: 8 lower-case letters / digits (shared/local.js fb.send). */
export function feedbackId(rand = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return [...rand(8)].map((b) => abc[b % abc.length]).join('');
}

/** gzip + base64 of a text, or null where the browser has no CompressionStream. @param {string} text */
export async function gzipBase64(text) {
  if (typeof CompressionStream !== 'function') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Pack the battles under `max` base64 characters: all of them when they fit, else without the oldest ones that had no
 * error (then the oldest at all) until they do. → { data, kept } (data null when none fits or the browser cannot gzip).
 * @param {object[]} list matchBattles(state).list @param {number} [max]
 * @param {(text: string) => Promise<string|null>} [pack]
 */
export async function packBattles(list, max = FEEDBACK_BATTLES_MAX, pack = gzipBase64) {
  let rest = list.slice();
  while (rest.length) {
    const data = await pack(JSON.stringify(rest));
    if (data == null) return { data: null, kept: 0 };
    if (data.length <= max) return { data, kept: rest.length };
    const quiet = rest.findIndex((b) => !b.errors);
    rest.splice(quiet >= 0 ? quiet : 0, 1);
  }
  return { data: null, kept: 0 };
}

/** The 피드백 보내기 button of the settlement screen (nothing while the server keeps no feedback). */
export function FeedbackButton() {
  const enabled = useStore((s) => s.enabled, Object.is, feedbackStore);
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  return html`<${Button} variant="secondary" size="xl" icon="edit" class="result__feedback" data-testid="feedback-open"
      onClick=${() => setOpen(true)}>${t('发送反馈')}<//>
    ${open ? html`<${FeedbackModal} onClose=${() => setOpen(false)} />` : null}`;
}

/** The send outcome's line (msgids, so a language switch reaches it). */
const SEND_ERRORS = {
  RATE: N_('发送太频繁，请稍后再试'),
  WRONG_PHASE: N_('只能在对局结束后一小时内发送'),
  OFFLINE: N_('未连接到服务器，请稍后再试'),
};

/** @param {{ onClose: () => void }} props */
export function FeedbackModal({ onClose }) {
  const issues = useStore((s) => s.issues, Object.is, feedbackStore);
  const [kind, setKind] = useState('bug');
  const [text, setText] = useState('');
  const [withDiag, setWithDiag] = useState(true);
  const [withBattles, setWithBattles] = useState(null); // null: follow the kind (on for a bug)
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);   // the receipt id once stored
  const [error, setError] = useState(null); // msgid of the failure line
  const [copied, setCopied] = useState(false);
  const battlesOn = withBattles ?? kind === 'bug';
  const battleCount = countBattles();
  const length = [...text.trim()].length;
  const tooLong = length > FEEDBACK_TEXT_MAX;

  const report = () => {
    const state = store.get();
    return withDiag ? diagnosticsText({ state, settings: settingsStore.get() }).slice(0, FEEDBACK_DIAG_MAX) : '';
  };

  const send = async () => {
    if (sending || !length || tooLong) return;
    setSending(true);
    setError(null);
    try {
      const id = feedbackId();
      const fields = { id, kind, text: text.trim() };
      if (issues) fields.public = true;
      const diag = report();
      if (diag) fields.diag = diag;
      if (battlesOn && battleCount) {
        const { match, list } = matchBattles(store.get());
        const { data } = await packBattles(list);
        if (data) { fields.battles = data; if (match) fields.match = match; }
      }
      await net.request('fb.send', fields, { timeout: 15000 });
      setDone(id);
    } catch (err) {
      setError(SEND_ERRORS[err?.code] || N_('发送失败，可以复制内容后通过其他方式反馈'));
    } finally {
      setSending(false);
    }
  };

  const copy = async () => {
    const diag = report();
    const ok = await copyText(`[${kind}]\n${text.trim()}${diag ? `\n\n${diag}` : ''}`);
    setCopied(ok);
  };

  if (done) {
    return html`<${Modal} open=${true} onClose=${onClose} title=${t('反馈')} micro="FEEDBACK" width="6.4rem"
      actions=${html`<${Button} variant="primary" icon="check" onClick=${onClose} data-autofocus>${t('完成')}<//>`}>
      <div class="fb" data-testid="feedback-done">
        <p class="fb__thanks">${t('已收到反馈，谢谢！')}</p>
        <p class="set-hint">${t('受理编号')} <b class="num fb__id">${done}</b></p>
        ${issues ? html`<p class="set-hint">${t('一分钟左右后会公开登记到 GitHub。')}${' '}<a href=${issueSearchUrl(issues, done)} target="_blank" rel="noopener noreferrer" data-testid="feedback-issue">${t('在 GitHub 上查看')}</a></p>` : null}
      </div>
    <//>`;
  }

  return html`<${Modal} open=${true} onClose=${onClose} title=${t('反馈')} micro="FEEDBACK" width="6.4rem"
    actions=${html`<${Button} variant="secondary" onClick=${onClose}>${t('取消')}<//>
      <${Button} variant="primary" iconRight="chevronRight" loading=${sending} disabled=${!length || tooLong} onClick=${send}
        data-testid="feedback-send">${t('发送')}<//>`}>
    <div class="fb">
      <div class="set-seg fb__kinds" role="radiogroup" aria-label=${t('反馈类型')}>
        ${FEEDBACK_KINDS.map((k) => html`<button key=${k} type="button" role="radio" aria-checked=${kind === k ? 'true' : 'false'}
          class=${kind === k ? 'is-on' : ''} onClick=${() => setKind(k)}>${kindLabel(k)}</button>`)}
      </div>
      <textarea class="fb__text" data-testid="feedback-text" data-autofocus rows="6" value=${text}
        placeholder=${kind === 'bug' ? t('发生了什么？本来应该怎样？在第几回合、哪个干员或敌人身上？') : t('想要什么功能或改进？')}
        aria-label=${t('反馈内容')} onInput=${(e) => setText(e.currentTarget.value)}></textarea>
      <p class=${cx('fb__count num', tooLong && 'is-warn')}>${length} / ${FEEDBACK_TEXT_MAX}</p>
      <label class="fb__check"><input type="checkbox" checked=${withDiag} onChange=${(e) => setWithDiag(e.currentTarget.checked)} />
        <span>${t('附上诊断信息')}<${MicroLabel}>DIAGNOSTICS<//></span></label>
      ${battleCount ? html`<label class="fb__check"><input type="checkbox" checked=${battlesOn} onChange=${(e) => setWithBattles(e.currentTarget.checked)} />
        <span>${t('附上本局战斗数据（{n} 场）', { n: battleCount })}<${MicroLabel}>BATTLES<//></span></label>` : null}
      <p class=${cx('set-hint', issues && 'fb__public')} data-testid="feedback-notice">${issues
        ? t('反馈内容和诊断信息会自动登记为公开 GitHub 仓库的 issue，任何人都能看到，请不要写个人信息。玩家名和房间号会被替换；战斗数据只保存在本服务器上（不公开），90 天后删除。IP 地址不会保存，只保存一个无法还原的区分码。')
        : t('反馈保存在本服务器上，只有开发者能看到，90 天后删除。玩家名和房间号会被替换；IP 地址不会保存，只保存一个无法还原的区分码。')}</p>
      ${error ? html`<p class="set-keys__note is-warn" role="status" aria-live="polite">${t(error)}
        <${Button} variant="ghost" size="sm" icon="copy" onClick=${copy}>${copied ? t('已复制') : t('复制内容')}<//></p>` : null}
    </div>
  <//>`;
}
