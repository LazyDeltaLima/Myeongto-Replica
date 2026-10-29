// server/http/boot.js — running the server as a process (`node server/index.js`, npm start, scripts/launch.mjs):
//
//   * the boot banner: release version, the Local URL, the LAN URLs when listening on every interface, the
//     cloudflared command for internet play;
//   * a server that cannot start exits 1 (with a hint when the port is in use); unhandled rejections and uncaught
//     exceptions are logged, not fatal;
//   * graceful shutdown on SIGINT/SIGTERM (rooms get room.closed{reason:'shutdown'}, sockets close 1001); a second
//     signal exits at once, and a shutdown that has not finished within SP_SHUTDOWN_TIMEOUT_MS (default 5 s) exits 1;
//   * SIGUSR2 reads the restart countdown file and announces it (server/local-restart.js), or — when the file holds
//     `accept` / `drain` / `standby` — moves the deploy's generation (server/local-generation.js); a drained generation
//     stops the process the same way as SIGTERM (exit 0, or 1 when it times out).

import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { APP_VERSION, DEV_BUILD } from '../../shared/constants.js';
import { restartFile, parseRestartFile } from '../local-restart.js';
import { parseGenControl } from '../local-generation.js';

/** Non-internal IPv4 addresses as http URLs. @param {number} port */
export function lanUrls(port) {
  const out = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal) out.push(`http://${a.address}:${port}`);
    }
  }
  return out;
}

/** Is the module whose `import.meta.url` is `metaUrl` the file node was started with? */
export function isProcessEntry(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}

/** Print the boot banner of a started server. @param {{ url: string, host: string, port: number }} srv */
export function printBanner(srv) {
  console.log(`\n  卫戍协议：盟约 · Stronghold Protocol: Alliance v${APP_VERSION}`);
  if (DEV_BUILD) console.log('  ! 开发版（dev 分支）：不稳定，请勿用于公开服务器 · development build — unstable, not for public servers');
  console.log(`  Local:   ${srv.url}`);
  if (srv.host === '0.0.0.0' || srv.host === '::') {
    for (const u of lanUrls(srv.port)) console.log(`  LAN:     ${u}`);
  }
  console.log('  Internet: cloudflared tunnel --url ' + `http://localhost:${srv.port}` + '\n');
}

/**
 * How long a graceful shutdown may take before the process exits 1 anyway: SP_SHUTDOWN_TIMEOUT_MS, default 5 s — the
 * value the old hard-coded timer used. Only an explicit 1000–300000 ms is taken, so a typo keeps the default instead
 * of removing the guard.
 * @param {string | number | undefined} [value]
 * @returns {number} milliseconds
 */
export function shutdownTimeoutMs(value = process.env.SP_SHUTDOWN_TIMEOUT_MS) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1_000 && n <= 300_000 ? n : 5_000;
}

/**
 * The SIGINT / SIGTERM / drained handler: close the server, exit 0 when that finishes and 1 when it rejects or the
 * shutdown times out first. A second call exits at once. Returned as a handler so the caller and the tests drive the
 * same code.
 * @param {{ close: () => Promise<void> }} srv
 * @param {object} [opts]
 * @param {(code: number) => void} [opts.exit] process.exit by default
 * @param {(ms: number, fn: () => void) => any} [opts.setTimer] setTimeout by default
 * @param {{ log?: (m: string) => void, error?: (m: string) => void }} [opts.out] console by default
 * @param {number} [opts.timeoutMs] shutdownTimeoutMs() by default
 * @returns {(signal: string) => void}
 */
export function shutdownHandler(srv, opts = {}) {
  const exit = opts.exit || ((code) => process.exit(code));
  const setTimer = opts.setTimer || ((ms, fn) => setTimeout(fn, ms).unref?.());
  const log = opts.out?.log || ((m) => console.log(m));
  const error = opts.out?.error || ((m) => console.error(m));
  const timeoutMs = opts.timeoutMs ?? shutdownTimeoutMs();
  let stopping = false;
  let finished = false;
  /** Exit once: whichever of the close, the timeout or the second signal gets there first. */
  const finish = (code) => { if (finished) return; finished = true; exit(code); };
  return (signal) => {
    if (stopping) { log('forced exit'); finish(1); return; }
    stopping = true;
    log(`\n[${signal}] shutting down…`);
    setTimer(timeoutMs, () => {
      if (finished) return;
      error(`[shutdown] timeout after ${timeoutMs} ms; exiting`);
      finish(1);
    });
    srv.close().then(() => finish(0), () => finish(1));
  };
}

/**
 * The process main: start the server, print the banner, stop gracefully on SIGINT / SIGTERM.
 * @param {() => Promise<{ url: string, host: string, port: number, close: () => Promise<void>,
 *                         restart?: import('../local-restart.js').RestartNotice,
 *                         generation?: import('../local-generation.js').Generation }>} start index.js startServer
 */
export async function runMain(start) {
  process.on('unhandledRejection', (e) => console.error('[process] unhandled rejection', e));
  process.on('uncaughtException', (e) => console.error('[process] uncaught exception', e));
  let srv;
  // the deploy's restart countdown (server/local-restart.js) — the minutes come from a file, the signal says "read it".
  // Listened for before the server starts: an unhandled SIGUSR2 would end the process; one that comes while it boots is
  // read once it is up.
  let restartSignalled = false;
  const readRestart = () => {
    const file = restartFile();
    fs.promises.readFile(file, 'utf8').then((text) => {
      const gen = parseGenControl(text);
      if (gen) { srv.generation?.set(gen); return; }
      const minutes = parseRestartFile(text);
      if (minutes == null) { console.error(`[restart] ${file}: expected minutes, "cancel" or accept / drain / standby, got ${JSON.stringify(text.slice(0, 40))}`); return; }
      srv.restart?.schedule(minutes);
    }, (e) => console.error(`[restart] cannot read ${file}: ${e.code || e.message}`));
  };
  process.on('SIGUSR2', () => { if (srv) readRestart(); else restartSignalled = true; });
  try {
    srv = await start();
  } catch (e) {
    if (e && e.code === 'EADDRINUSE') console.error(`端口已被占用 / port in use: ${e.port ?? process.env.PORT ?? 3000}. Try PORT=3001 npm start`);
    else console.error('[boot] failed to start', e);
    process.exit(1);
  }
  printBanner(srv);
  if (restartSignalled) readRestart();

  const stop = shutdownHandler(srv);
  if (srv.generation) srv.generation.onDrained = () => stop('drained');
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}
