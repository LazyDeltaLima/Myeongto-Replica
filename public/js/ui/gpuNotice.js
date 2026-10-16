// The notice for a browser that draws without the GPU (gpu.js): hardware acceleration off, a blocklisted GPU / driver,
// or no WebGL at all. Players reported a field that did not draw; the page cannot switch the setting itself, so it says
// where to: a toast once per page when the player enters the lobby (installGpuNotice), and the same line under 画面 in
// the settings for as long as it holds (GpuNote). The bug report says the same on its `gpu:` line (diag.js).

import { html } from './components.js';
import { toast } from './toasts.js';
import { gpuStatus } from '../gpu.js';
import { t, N_ } from '../../../shared/i18n.js';

const NOTICE = {
  software: N_('浏览器的硬件加速似乎已关闭（或显卡被浏览器停用），画面可能无法显示或很卡。请在浏览器设置中开启「使用图形加速」后重启浏览器。'),
  none: N_('此浏览器无法使用 WebGL，战场只能以简化画面显示。请在浏览器设置中开启硬件加速（图形加速），或换用最新版 Chrome / Edge / Firefox。'),
};
const NOTICE_MS = 15000;

/** The notice's msgid for a gpu.js status, or null when the GPU draws. */
export function gpuNoticeText(status) {
  return NOTICE[status?.accel] || null;
}

function noticeOf(status) {
  try { return gpuNoticeText(status()); } catch { return null; }
}

/**
 * Toast the notice once, when the player has entered (the lobby): at once when already entered, else on entering.
 * @param {{ store: any, status?: () => any, show?: (text: string) => void }} deps
 */
export function installGpuNotice({ store, status = gpuStatus, show = (text) => toast(text, 'warn', { ttl: NOTICE_MS }) }) {
  let done = false;
  let off = null;
  const check = (s) => {
    if (done || !s?.session?.entered) return;
    done = true;
    off?.();
    const msg = noticeOf(status);
    if (msg) show(t(msg));
  };
  off = store.subscribe((s) => check(s));
  check(store.get());
}

/** The settings' line under 画面 while the GPU does not draw (nothing otherwise). */
export function GpuNote() {
  const msg = noticeOf(gpuStatus);
  return msg ? html`<p class="set-keys__note is-warn set-gpu-note" data-testid="gpu-note">${t(msg)}</p>` : null;
}
