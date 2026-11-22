// An invitation link's room with no player seat for this page (maintainer decision 2026-11-14, a remake feature like the
// spectator seats themselves): the auto-join of main.js (room.join) is refused with ROOM_FULL / ROOM_STARTED
// and the error frame's `room` summary (server/lobby.js joinRefusalInfo). Instead of the bare error toast the page asks
// whether to watch from a spectator seat (room.spectate), with 「빈자리가 나면 자동으로 앉기」 (room.reserveSeat) on by
// default. A room whose spectator seats are full too gets a toast.
import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal } from './components.js';
import { net } from '../net.js';
import { store, useStore } from '../store.js';
import { t, N_ } from '../../../shared/i18n.js';
import { ERR } from '../../../shared/constants.js';
import { toast, toastError } from './toasts.js';

/** @type {Set<string>} */
const REASONS = new Set([ERR.ROOM_FULL, ERR.ROOM_STARTED]);
const RATE_RETRY_MS = 700;

/**
 * The refused auto-join of an invitation: the offer to show (store ui.inviteSpectate), a toast for a room with no free
 * spectator seat either, or null for any other error (the caller toasts it as before).
 * @param {{ code?: string, room?: any } | null | undefined} err @param {string} code the invitation's room code
 * @returns {{ kind: 'offer', offer: { code: string, reason: string, room: any } } | { kind: 'noSeat' } | null}
 */
export function inviteRefusal(err, code) {
  const room = err?.room;
  if (!err || !REASONS.has(err.code) || !room || typeof room !== 'object') return null;
  if (!(room.spectators < room.spectatorSeats)) return { kind: 'noSeat' };
  return { kind: 'offer', offer: { code, reason: err.code, room } };
}

/** main.js schedulePendingJoin: true when the refusal was taken over here (offer or toast), false to toast it as before. */
export function offerSpectate(err, code) {
  const r = inviteRefusal(err, code);
  if (!r) return false;
  if (r.kind === 'noSeat') toast(t('受邀同盟的博士席位和观战席都已满'), 'warn');
  else store.patch('ui', { inviteSpectate: r.offer });
  return true;
}

/** The room line: 博士 4/4 · 等待室 | 第 3 回合 · 观战席 1/4 */
export function inviteRoomLine(room) {
  const where = room.round > 0 ? t('第 {r} 回合', { r: room.round }) : t('等待室');
  return [t('博士 {n}/{max}', { n: room.players, max: room.seats }), where,
    t('观战席 {n}/{max}', { n: room.spectators, max: room.spectatorSeats })].join(' · ');
}

const TITLE = { [ERR.ROOM_FULL]: N_('房间已满'), [ERR.ROOM_STARTED]: N_('模拟已开始') };
const TEXT = {
  [ERR.ROOM_FULL]: N_('受邀同盟的博士席位已满。可以进入观战席观看。'),
  [ERR.ROOM_STARTED]: N_('受邀同盟的模拟已经开始，无法以博士身份加入。可以进入观战席观看作战。'),
};

export function InviteSpectateHost() {
  const offer = useStore((s) => s.ui.inviteSpectate);
  const inRoom = useStore((s) => !!s.room);
  const [reserve, setReserve] = useState(true);
  const [busy, setBusy] = useState(false);
  // dropped once the page is in a room anyway (another key was joined meanwhile): never shown again on leaving it
  useEffect(() => { if (inRoom && offer && !busy) store.patch('ui', { inviteSpectate: null }); }, [inRoom, offer, busy]);
  if (!offer || inRoom) return null;
  const { code, reason, room } = offer;
  const close = () => { if (!busy) { store.patch('ui', { inviteSpectate: null }); setReserve(true); } };
  const watch = async () => {
    setBusy(true);
    try {
      // room.spectate draws from the heavy bucket the season switch of the invitation just used (server/net.js
      // HEAVY_TYPES: 2 a second): a RATE reply is sent once more after a refill
      await net.request('room.spectate', { code }).catch((err) => (err?.code === ERR.RATE
        ? new Promise((r) => setTimeout(r, RATE_RETRY_MS)).then(() => net.request('room.spectate', { code }))
        : Promise.reject(err)));
      if (reserve) await net.request('room.reserveSeat', { on: true }).catch(toastError);
      store.patch('ui', { inviteSpectate: null });
      setReserve(true);
    } catch (err) {
      toastError(err);
      store.patch('ui', { inviteSpectate: null });
    } finally {
      setBusy(false);
    }
  };
  return html`<${Modal} open=${true} onClose=${close} title=${t(TITLE[reason])} class="invite-spec"
    actions=${html`<${Button} variant="secondary" disabled=${busy} onClick=${close}>${t('关闭')}<//>
      <${Button} variant="primary" icon="eye" data-testid="invite-spectate" disabled=${busy} onClick=${watch}>${t('以观战身份进入')}<//>`}>
    <p>${t(TEXT[reason])}</p>
    <div class="invite-spec__room"><b class="num">${code}</b><span>${inviteRoomLine(room)}</span></div>
    <label class="invite-spec__keep">
      <input type="checkbox" checked=${reserve} disabled=${busy} onChange=${(e) => setReserve(e.currentTarget.checked)} />
      <span>${reason === ERR.ROOM_STARTED ? t('模拟结束后有空位时自动入座') : t('有空位时自动入座')}</span>
      ${reason === ERR.ROOM_STARTED ? null : html`<small>${t('（预约座位）')}</small>`}
    </label>
  <//>`;
}
