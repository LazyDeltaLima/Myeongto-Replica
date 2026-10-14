// server/http/boot.js — running the server as a process (`node server/index.js`, npm start, scripts/launch.mjs):
//
//   * the boot banner: release version, the Local URL, the LAN URLs when listening on every interface, the
//     cloudflared command for internet play;
//   * a server that cannot start exits 1 (with a hint when the port is in use); unhandled rejections and uncaught
//     exceptions are logged, not fatal;
//   * graceful shutdown on SIGINT/SIGTERM (rooms get room.closed{reason:'shutdown'}, sockets close 1001); a second
//     signal exits at once, and the process exits anyway 5 s after the first;
//   * SIGUSR2 reads the restart countdown file and announces it (server/local-restart.js), or — when the file holds
//     `accept` / `drain` / `standby` — moves the deploy's generation (server/local-generation.js); a drained generation
//     stops the process the same way as SIGTERM (exit 0).

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

  let stopping = false;
  const stop = (signal) => {
    if (stopping) { console.log('forced exit'); process.exit(1); }
    stopping = true;
    console.log(`\n[${signal}] shutting down…`);
    setTimeout(() => process.exit(0), 5000).unref();
    srv.close().then(() => process.exit(0), () => process.exit(1));
  };
  if (srv.generation) srv.generation.onDrained = () => stop('drained');
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}
