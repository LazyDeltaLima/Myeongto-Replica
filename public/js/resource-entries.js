// public/js/resource-entries.js — which entries of the resource list (/assets/browser-resources.json) the page acts on,
// and where it downloads each from. No imports: tools/build-browser-resources.mjs runs these same checks on the server,
// where the page's other modules (the UI and its vendored libraries) are not installed. public/js/resources.js
// re-exports them.

const RAW_RE = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/;
const JSDELIVR_RE = /^https:\/\/cdn\.jsdelivr\.net\/gh\//;

/**
 * Download URLs of one list entry: jsDelivr then GitHub raw for upstream art (jsDelivr has no ArknightsAssets2 voice
 * branch, shared with tools/assets/sources.mjs), this server for everything else.
 * @param {{ p: string, u?: string }} f
 */
export function sourcesOf(f) {
  if (typeof f.u !== 'string') return [f.p];
  if (JSDELIVR_RE.test(f.u)) return [f.u];
  const m = RAW_RE.exec(f.u);
  if (!m) return [];
  const [, owner, repo, branch, path] = m;
  const mirror = owner === 'ArknightsAssets' && branch === 'voice' ? null : `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
  return [mirror, f.u].filter(Boolean);
}

/** Paths the list may name: under /assets/ or /img/emotes/, no query / fragment / escapes / backslashes / dot segments. */
const PATH_RE = /^\/(assets|img\/emotes)\/[^?#%\\]+$/;
export const validPath = (p) => typeof p === 'string' && PATH_RE.test(p) && !p.split('/').some((seg) => seg === '.' || seg === '..');

/** List entries the page will act on: a valid path, a size and a sha256 (anything else is ignored). */
export const validEntry = (f) => !!f && validPath(f.p) && Number.isInteger(f.s) && f.s >= 0 && typeof f.h === 'string' && /^[0-9a-f]{64}$/.test(f.h)
  && (f.u === undefined || (typeof f.u === 'string' && sourcesOf(f).length > 0));
