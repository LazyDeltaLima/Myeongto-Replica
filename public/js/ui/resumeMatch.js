// Recover an explicitly selected local seat; nickname and IP never identify a player.
// A seat another live window of this browser still holds is continued here only after the player confirms
// (identity.takeOver → hello.takeover; the other window is disconnected). The dialog opens by itself when this page
// lost its seat to another window (store ui.seatElsewhere, set by main.js).
import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal } from './components.js';
import { identity, net } from '../net.js';
import { store, useStore } from '../store.js';
import { t } from '../../../shared/i18n.js';
import { toast } from './toasts.js';

export function ResumeMatchButton() {
  const [items, setItems] = useState(() => identity.recoverable());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // the item held by another window, waiting for 在此页面继续
  const elsewhere = useStore((s) => !!s.ui.seatElsewhere);
  useEffect(() => {
    const refresh = () => setItems(identity.recoverable());
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    refresh();
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    if (!elsewhere) return;
    store.patch('ui', { seatElsewhere: false });
    const lost = identity.contested()[0];
    if (!lost) return;
    setItems(identity.recoverable());
    setConfirm(lost);
    setOpen(true);
  }, [elsewhere]);
  if (!items.length) return null;
  const reconnectAs = (item) => {
    identity.setEntered(true);
    store.patch('session', { entered: true });
    // Keep the tentative token in this document until welcome persists it. Reloading here
    // would either lose the selection or falsely turn it into an established session claim.
    net.close();
    net.setName(item.name);
    net.connect();
    setOpen(false);
    setConfirm(null);
  };
  const resume = async (item) => {
    if (busy) return;
    setBusy(true);
    const ok = await identity.resume(item.id);
    setBusy(false);
    if (ok) reconnectAs(item);
    else if (identity.recoverable().some((m) => m.id === item.id)) setConfirm(item);
    else toast(t('此对局仍在其他窗口中，或当前浏览器无法安全恢复。请关闭原窗口后重试。'), 'warn');
  };
  const takeOver = (item) => {
    if (busy) return;
    if (identity.takeOver(item.id)) reconnectAs(item);
    else toast(t('此对局仍在其他窗口中，或当前浏览器无法安全恢复。请关闭原窗口后重试。'), 'warn');
  };
  const close = () => { if (!busy) { setOpen(false); setConfirm(null); } };
  // the lobby top bar is narrow: the button says 恢复 and its title the full name (the Korean full name covered the
  // page title, maintainer decision 2026-10-14)
  return html`<${Button} variant="secondary" size="sm" data-testid="resume-local-match" title=${t('恢复本机对局')} aria-label=${t('恢复本机对局')}
    onClick=${() => setOpen(true)}>${t('恢复')}<//>
    <${Modal} open=${open} onClose=${close} title=${t('恢复本机对局')}
      actions=${confirm ? html`<${Button} variant="secondary" disabled=${busy} onClick=${close}>${t('取消')}<//>
        <${Button} variant="primary" icon="check" data-testid="resume-take-over" disabled=${busy} onClick=${() => takeOver(confirm)}>${t('在此页面继续')}<//>` : null}>
      ${confirm ? html`
        <p>${t('此对局正在本浏览器的其他窗口中进行。在此窗口继续后，另一个窗口将断开。')}</p>
        <p><b>${t('{name} · 同盟 {code}', { name: confirm.name || t('博士'), code: confirm.code || '—' })}</b></p>`
      : html`
        <p>${t('选择已关闭窗口的对局。服务器重启或对局过期后无法恢复。')}</p>
        ${items.map((item) => html`<${Button} key=${item.id} variant="secondary" block=${true} disabled=${busy} onClick=${() => resume(item)}>
          ${t('{name} · 同盟 {code}', { name: item.name || t('博士'), code: item.code || '—' })}<//>`)}`}
    <//>`;
}
