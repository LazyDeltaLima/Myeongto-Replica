// server/http/routes.js — the node:http request listener. Every response gets the security headers (common.js), then:
// (i18n-ignore-file: the error pages are bilingual by design, 中文 · English — docs/I18N.md)
//
//   * a URL longer than 4096 characters → 414; one that does not parse → 400;
//   * any method but GET / HEAD → 405 with `Allow: GET, HEAD`;
//   * GET /healthz → JSON status (protocol `version`, release `app`, uptime, the served `build`, sockets, sessions,
//     rooms, matches), never cached; GET /healthz/rooms → the per-room status list (server/local-rooms.js), inside only;
//   * GET /healthz/accept → 200 while this server takes new visitors, else 503 (server/local-generation.js — the proxy's
//     health check), and every page (/ and *.html) carries the generation cookie of a named server;
//   * GET /changelog.json → the lobby's patch notes parsed from CHANGELOG.md (changelog.js);
//   * GET /preload.json → the match screen's modules and scripts, for the lobby to download ahead (preload.js);
//   * everything else → the static files (static.js).
// A route that throws is logged and answers 500.

import { PROTOCOL_VERSION, APP_VERSION } from '../../shared/constants.js';
import { buildTag } from './buildTag.js';
import { setSecurityHeaders, sendError, sendJson, splitUrl } from './common.js';
import { localVersion } from '../../shared/local.js'; // local patch: version label
import { proxiedRequest } from '../local-patch.js'; // local patch: /healthz through the proxy
import { roomList } from '../local-rooms.js';
import { CHANGELOG_URL, createChangelogReader } from './changelog.js';
import { PRELOAD_URL, preloadList } from './preload.js';

const MAX_URL_LENGTH = 4096;

/**
 * The GET /healthz body.
 * @param {{ startedAt: number, network: import('../net.js').Network, registry: import('../net.js').SessionRegistry,
 *           lobby: import('../lobby.js').Lobby, restart?: import('../local-restart.js').RestartNotice,
 *           generation?: import('../local-generation.js').Generation }} health
 */
export function healthReport({ startedAt, network, registry, lobby, restart, generation }) {
  return {
    ok: true, version: PROTOCOL_VERSION, app: APP_VERSION, local: localVersion() /* local patch */, uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    // the runtime the server is serving right now (public/js/ui/buildGuard.js): a page whose own build is
    // older than this reloads itself, so a deploy reaches clients that never reload
    build: buildTag(),
    sockets: network.connectionCount, sessions: registry.size, ...lobby.stats(),
    restartInSec: restart ? (restart.inMs() == null ? null : Math.ceil(restart.inMs() / 1000)) : null, // the deploy's restart countdown (local-restart.js)
    gen: generation?.id ?? null, genState: generation ? generation.state : null, // the deploy's generation (local-generation.js)
  };
}

/**
 * The request listener for `http.createServer`.
 * @param {{ serveStatic: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse,
 *             rawPath: string, query: string) => Promise<void>,
 *           health: Parameters<typeof healthReport>[0], log: object,
 *           changelog?: ReturnType<typeof createChangelogReader> }} deps
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}
 */
export function createRequestHandler({ serveStatic, health, log, changelog = createChangelogReader() }) {
  async function handleRequest(req, res) {
    const url = req.url || '/';
    if (url.length > MAX_URL_LENGTH) { sendError(req, res, 414, '请求地址过长 · URI too long'); return; }
    const parts = splitUrl(url);
    if (!parts) { sendError(req, res, 400, '请求地址无效 · Bad request'); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      sendError(req, res, 405, '不支持的请求方法 · Method not allowed');
      return;
    }
    const gen = health?.generation;
    if (parts.rawPath === '/healthz' && proxiedRequest(req)) { sendJson(req, res, 200, { ok: true, version: PROTOCOL_VERSION, app: APP_VERSION, local: localVersion(), build: buildTag(), gen: gen?.id ?? null, draining: !!gen?.draining }); return; } // local patch: no counters through the proxy; `local` = shared/local.js localVersion
    if (parts.rawPath === '/healthz') {
      sendJson(req, res, 200, healthReport(health));
      return;
    }
    if (parts.rawPath === '/healthz/accept') { // answered through the proxy too: it only says yes or no
      const yes = !gen || gen.state === 'accept';
      sendJson(req, res, yes ? 200 : 503, { accept: yes });
      return;
    }
    if (parts.rawPath === '/healthz/rooms') { // per-room status (local-rooms.js), 404 through the proxy
      if (proxiedRequest(req)) sendError(req, res, 404, '页面不存在 · Not found');
      else sendJson(req, res, 200, { rooms: roomList(health.lobby) });
      return;
    }
    if (parts.rawPath === CHANGELOG_URL) {
      sendJson(req, res, 200, await changelog());
      return;
    }
    if (parts.rawPath === PRELOAD_URL) {
      sendJson(req, res, 200, await preloadList());
      return;
    }
    const cookie = gen && (parts.rawPath === '/' || parts.rawPath.endsWith('.html')) ? gen.cookie(req.headers['x-forwarded-proto'] === 'https') : null;
    if (cookie) res.setHeader('Set-Cookie', cookie);
    await serveStatic(req, res, parts.rawPath, parts.query);
  }

  return (req, res) => {
    setSecurityHeaders(res);
    handleRequest(req, res).catch((e) => {
      log.error('[http] request failed', e);
      sendError(req, res, 500, '服务器内部错误 · Internal error');
    });
  };
}
