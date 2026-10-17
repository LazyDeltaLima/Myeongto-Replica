// The deploy's move onto the new version, told as an update (ui/generation.js; docs/rules/ui.md 「무중단 배포」, maintainer
// decision 2026-10-17: a plain reload read as a lost connection, and the players of a waiting room did not know where
// their room went). Mounted once by main.js.
//
//   * MoveDialog — while the page is about to reload onto the new server (ui.genMove 'soon' / 'room'): a dialog that
//     cannot be closed (the reload comes MOVE_DELAY_MS later anyway) saying the server updates; 'room' adds that the
//     room moves along.
//   * UpdatedDialog — the reloaded page (ui.updated, from generation.js takeMoved): the version it came from and the one
//     it runs now, whether its room came along (the room is back on screen) or could not (create or join one again), and
//     更新内容 (the 更新记录 window of ui/patchNotes.js). It waits until the new server answered and the room had a
//     moment to come back (SETTLE_MS), and never shows over a match.

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button, Spinner } from './components.js';
import { store, useStore, selectRoute } from '../store.js';
import { PatchNotesModal, usePatchNotes, markSeen } from './patchNotes.js';
import { APP_VERSION } from '../../../shared/constants.js';
import { t } from '../../../shared/i18n.js';

/** After the welcome, the room.state of a resumed seat has this long to arrive before the dialog shows. */
export const SETTLE_MS = 1500;

/** The text of the reloaded page's dialog (UpdatedDialog). @param {{ from: string, room: boolean }} moved @param {boolean} hasRoom */
export function updatedLines(moved, hasRoom, to = APP_VERSION) {
  const lines = [moved.from && moved.from !== to
    ? t('服务器已更新：v{from} → v{to}', { from: moved.from, to })
    : t('服务器已更新到最新版本')];
  if (moved.room) lines.push(hasRoom ? t('同盟已一起转移到新版本') : t('未能转移同盟，请重新创建或加入同盟'));
  return lines;
}

function MoveDialog() {
  const genMove = useStore((s) => s.ui.genMove ?? null);
  const entered = useStore((s) => s.session.entered);
  if (!entered || (genMove !== 'soon' && genMove !== 'room')) return null;
  return html`<${Modal} open=${true} micro="SERVER UPDATE" title=${t('服务器正在更新到新版本')} closeOnBackdrop=${false} class="update-notice">
    <p class="modal__text">${genMove === 'room' ? t('同盟将一起转移到新版本') : t('新版本已上线')}</p>
    <${Spinner} size="sm" label=${t('页面即将自动刷新')} />
  <//>`;
}

function UpdatedDialog() {
  const moved = useStore((s) => s.ui.updated ?? null);
  const online = useStore((s) => s.connection.status === 'online' && !!s.me.playerId);
  const hasRoom = useStore((s) => !!s.room);
  const inGame = useStore((s) => selectRoute(s) === 'game');
  const [settled, setSettled] = useState(false);
  const [notes, setNotes] = useState(false);
  const entries = usePatchNotes();
  useEffect(() => {
    if (!moved || !online || settled) return undefined;
    const h = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(h);
  }, [moved, online, settled]);
  const close = () => store.patch('ui', { updated: null });
  if (notes) {
    return html`<${PatchNotesModal} open=${true} onClose=${() => setNotes(false)} entries=${entries} fresh=${true} />`;
  }
  if (!moved || !settled || inGame) return null;
  const openNotes = () => { markSeen(APP_VERSION); close(); setNotes(true); };
  return html`<${Modal} open=${true} micro="UPDATE" title=${t('已更新到新版本')} onClose=${close} class="update-notice"
    actions=${html`
      ${entries?.length ? html`<${Button} variant="secondary" icon="book" onClick=${openNotes}>${t('查看更新内容')}<//>` : null}
      <${Button} variant="primary" icon="check" data-autofocus onClick=${close}>${t('确认')}<//>`}>
    ${updatedLines(moved, hasRoom).map((line) => html`<p class="modal__text">${line}</p>`)}
  <//>`;
}

export function UpdateNotice() {
  return html`<${MoveDialog} /><${UpdatedDialog} />`;
}
