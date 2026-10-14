// server/http/preload.js — GET /preload.json: the code the match screen loads, as one flat list, for the page to download
// in the background while the player is in the lobby (public/js/preload.js).
//
// The render engine (public/js/render/app.js), the browser battle simulation (/sim/) and three.js are ES modules the page
// imports only when a match screen mounts, and the browser discovers a module's imports only after that module arrived:
// about fifteen dependent request rounds. On a phone line that stalls for a second or more per round, those rounds alone
// outlasted the field view's 12 s limit (ui/fieldHost.js) and the match opened in the simplified view. With every URL
// known up front the page asks for all of them at once (modulepreload), before the match. Pixi and pixi-spine are classic
// scripts (render/app/pixi.js): listed apart, the page only warms the HTTP cache for them.
//
// The list is built from the files on disk once per process (the files only change with a deploy, which restarts the
// server, like buildTag.js), following the imports the way the browser resolves them — under the plain URLs (/js/…,
// /sim/…, /shared/…, /vendor/…, the generated /data.js) — and each entry is written relative to public/js/, so the page
// resolves it beside its own modules: under /b/<tag>/r/ too, where /shared/ is reached one directory higher, as every
// relative import of it overshoots (buildTag.js). Imports built at run time are covered by RUNTIME_DIRS. A file missing
// from the list costs only its own round trip later; one listed in error is only fetched and parsed, never run.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.js';
import { buildTag } from './buildTag.js';

export const PRELOAD_URL = '/preload.json';

/** The module graphs a match screen imports: the render engine, the browser sim (battle/runner.js loadBrowserSim), three.js. */
const ENTRIES = Object.freeze(['/js/render/app.js', '/sim/spec.js', '/sim/simdata.js', '/sim/content/support/index.js', '/vendor/three.module.js']);
/** Classic scripts the render engine injects (render/app/pixi.js). */
const SCRIPTS = Object.freeze(['/vendor/pixi.min.js', '/vendor/pixi-spine.js']);
/**
 * Modules that import a run-time-built path: every .js file of these directories (relative to the module) is a module
 * they may load (content/index.js: its domain modules; content/kits/index.js: one kit per operator).
 */
const RUNTIME_DIRS = Object.freeze({ '/sim/content/index.js': ['.'], '/sim/content/kits/index.js': ['ops'] });
/** Never served (server/http/static.js SIM_PRIVATE): the Node-only data loader. */
const PRIVATE = /\/nodedata\.js$/i;

/** Plain URL path → file on disk (server/http/static.js mounts); null when it is not a served module. */
export function fileOfUrl(p, root = ROOT) {
  if (p.startsWith('/sim/')) return PRIVATE.test(p) ? null : path.join(root, 'server', 'sim', p.slice(5));
  if (p.startsWith('/shared/')) return path.join(root, 'shared', p.slice(8));
  if (p.startsWith('/data/')) return null;
  return path.join(root, 'public', p.slice(1));
}

/** A plain URL path as the page writes it from a module in public/js/ (see the header). */
export const specOfUrl = (p) => (p.startsWith('/shared/') ? `../..${p}` : `..${p}`);

/** Relative import specifiers of a module source: static and literal dynamic imports, and './x.js' strings for a loader. */
function specifiersOf(src) {
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const out = new Set();
  for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g)) out.add(m[2]);
  for (const m of code.matchAll(/(['"])(\.{1,2}\/[^'"\s]+\.js)\1/g)) out.add(m[2]);
  return [...out].filter((s) => s.startsWith('./') || s.startsWith('../'));
}

async function jsFiles(dir) {
  try { return (await fsp.readdir(dir, { withFileTypes: true })).filter((d) => d.isFile() && d.name.endsWith('.js')).map((d) => d.name); } catch { return []; }
}

/**
 * Walk the module graphs from ENTRIES. @param {string} [root]
 * @returns {Promise<{ modules: string[], scripts: string[] }>} specifiers relative to public/js/, sorted
 */
export async function buildPreloadList(root = ROOT) {
  const seen = new Set();
  const stack = [...ENTRIES];
  while (stack.length) {
    const url = stack.pop();
    if (seen.has(url)) continue;
    if (url === '/data.js') { seen.add(url); continue; } // the generated stand-in of server/data.js (static.js)
    if (SCRIPTS.includes(url)) continue; // named by render/app/pixi.js as a URL string: a classic script, no module
    const file = fileOfUrl(url, root);
    if (!file || !file.endsWith('.js')) continue;
    let src;
    try { src = await fsp.readFile(file, 'utf8'); } catch { continue; }
    seen.add(url);
    const specs = specifiersOf(src);
    for (const dir of RUNTIME_DIRS[url] || []) {
      for (const name of await jsFiles(path.join(path.dirname(file), dir))) specs.push(`./${dir === '.' ? '' : `${dir}/`}${name}`);
    }
    for (const spec of specs) {
      const next = new URL(spec, `http://h${url}`).pathname;
      if (!seen.has(next)) stack.push(next);
    }
  }
  return { modules: [...seen].sort().map(specOfUrl), scripts: SCRIPTS.map(specOfUrl) };
}

/** @type {Promise<{ build: string|null, modules: string[], scripts: string[] }>|null} */
let cache = null;

/** The GET /preload.json body, built on first use and kept for the process lifetime. */
export function preloadList() {
  if (!cache) cache = buildPreloadList().then((l) => ({ build: buildTag(), ...l }), (err) => { cache = null; throw err; });
  return cache;
}
