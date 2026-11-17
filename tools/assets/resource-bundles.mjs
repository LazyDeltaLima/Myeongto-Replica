// Resource bundles (tools/build-browser-resources.mjs): this server's files of the browser resource list joined into
// files of about 8 MB, so the pre-download fetches a few hundred bundles instead of thousands of small files (each
// one a round trip; measured 2026-11-17: small files arrive at 1/3–1/30 of one large file's speed).
//
// A bundle is its members' bytes one after another, in the list's order; a member's place is the sum of the sizes
// before it (the list's `s`) and it is checked by its own `h`, as a single file is: the bundle has no header and no
// format to read. The list names them:
//   bundles: [{ p: '/assets/bundles/<kind>-<group>-<hash12>.pack', s: bytes, m: [index into files…] }]
// Only the files without `u` (served by this server); jsDelivr / raw files stay one by one. The members of one bundle
// are the same kind (text-like files apart from pictures and sounds, so the server gzips only the text bundles,
// server/http/files.js) and the same choice of the page (one optional pack, one 立绘 copy `r`, one voice language),
// so a browser that wants one member wants them all. Grouping: a folder whose files (of that kind and choice) are at
// most BUNDLE_BYTES is one group, a bigger folder is its own files plus its subfolders' groups; a group is cut in path
// order into bundles of at most BUNDLE_BYTES. A file over BUNDLE_BYTES and a bundle of one file are left to the files.
// The name is the members' `path:hash` list's hash, so a bundle whose members did not change keeps its file, and a
// change in one folder renames only that folder's bundles.

import { readFile, writeFile, readdir, rename, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname } from 'node:path';
import { BUNDLE_DIR, BUNDLE_EXT, TEXT_BUNDLE, COMPRESSIBLE } from '../../server/http/files.js';

/** At most this many bytes in a bundle: what the server's gzip cache keeps whole (files.js GZIP_CACHE_MAX_FILE). */
export const BUNDLE_BYTES = 8 << 20;
export const BUNDLE_URL = `/assets/${BUNDLE_DIR}/`;

const VOICE = /^\/assets\/audio\/voice\/([^/]+)\//;

/** What a browser chooses about a file (one bundle holds one choice): its pack, its 立绘 copy, its voice language. */
function choiceOf(f, packs) {
  let pack = '';
  for (const [name, prefixes] of Object.entries(packs || {})) if (prefixes.some((x) => f.p.startsWith(x))) { pack = name; break; }
  return `${pack}|${f.r ?? ''}|${VOICE.exec(f.p)?.[1] ?? ''}`;
}

const kindOf = (p) => (COMPRESSIBLE.has(extname(p).toLowerCase()) ? 'text' : 'media');
const dirOf = (p) => p.slice(0, p.lastIndexOf('/'));
const slug = (dir) => dir.replace(/^\/assets\//, '').replace(/^\//, '').replace(/[^A-Za-z0-9_./-]/g, '_').replace(/\//g, '.') || 'root';

/**
 * The bundles of a list (pure): files sorted by path, as the list holds them.
 * @param {{ p: string, s: number, h: string, u?: string, r?: string }[]} files
 * @param {{ packs?: Record<string, string[]>, max?: number }} [opts]
 * @returns {{ p: string, s: number, m: number[] }[]} in name order
 */
export function planBundles(files, { packs = {}, max = BUNDLE_BYTES } = {}) {
  /** @type {Map<string, number[]>} partition (kind + choice) → indices */
  const parts = new Map();
  files.forEach((f, i) => {
    if (f.u || f.s > max) return;
    const key = `${kindOf(f.p)}|${choiceOf(f, packs)}`;
    if (!parts.has(key)) parts.set(key, []);
    parts.get(key).push(i);
  });
  const out = [];
  for (const [key, members] of parts) {
    const kind = key.slice(0, key.indexOf('|'));
    // the folder tree of this partition: bytes under each folder, the files right in it, its subfolders
    /** @type {Map<string, { bytes: number, own: number[], subs: Set<string> }>} */
    const dirs = new Map();
    const node = (d) => { let n = dirs.get(d); if (!n) dirs.set(d, (n = { bytes: 0, own: [], subs: new Set() })); return n; };
    for (const i of members) {
      const p = files[i].p;
      let d = dirOf(p);
      node(d).own.push(i);
      for (;;) {
        node(d).bytes += files[i].s;
        if (!d) break;
        const up = dirOf(d);
        node(up).subs.add(d);
        d = up;
      }
    }
    const under = (d) => { const n = dirs.get(d); return [...n.own, ...[...n.subs].flatMap(under)]; };
    /** @type {[string, number[]][]} */
    const groups = [];
    const split = (d) => {
      const n = dirs.get(d);
      if (n.bytes <= max) { groups.push([d, under(d)]); return; }
      if (n.own.length) groups.push([d, n.own]);
      for (const s of n.subs) split(s);
    };
    split('');
    for (const [d, idx] of groups) {
      idx.sort((a, b) => a - b); // the list's (path) order
      let cur = []; let bytes = 0;
      const flush = () => {
        if (cur.length > 1) {
          const id = createHash('sha256').update(cur.map((i) => files[i].p + ':' + files[i].h).join('\n')).digest('hex').slice(0, 12);
          out.push({ p: `${BUNDLE_URL}${kind === 'text' ? TEXT_BUNDLE : 'media-'}${slug(d)}-${id}${BUNDLE_EXT}`, s: bytes, m: cur });
        }
        cur = []; bytes = 0;
      };
      for (const i of idx) {
        if (bytes + files[i].s > max) flush();
        cur.push(i); bytes += files[i].s;
      }
      flush();
    }
  }
  return out.sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : 0));
}

/**
 * Write the bundles into `<assets>/bundles/`: a bundle already there is kept as it is (its name is its content), a new
 * one is written to a temporary name and renamed (a deploy's slot tree is a hard-link copy of the live one, so a file
 * is never rewritten in place), and the bundles no longer planned are deleted — after the list is written: call the
 * returned `prune` then.
 * @param {{ p: string, s: number, m: number[] }[]} bundles @param {{ p: string, s: number, h: string }[]} files
 * @param {string} assets public/assets @param {(p: string) => string} fileOf a list path → its file on disk
 */
export async function writeBundles(bundles, files, assets, fileOf) {
  const dir = join(assets, BUNDLE_DIR);
  await mkdir(dir, { recursive: true, mode: 0o755 });
  const names = new Set(bundles.map((b) => b.p.slice(BUNDLE_URL.length)));
  let written = 0; let writtenBytes = 0;
  for (const b of bundles) {
    const name = b.p.slice(BUNDLE_URL.length);
    const out = join(dir, name);
    if (existsSync(out)) continue;
    const parts = [];
    for (const i of b.m) {
      const buf = await readFile(fileOf(files[i].p));
      // the file changed since the list hashed it: a bundle would carry bytes its member's hash refuses
      if (buf.length !== files[i].s || createHash('sha256').update(buf).digest('hex') !== files[i].h) throw new Error(`${files[i].p} changed while the list was built — run node tools/build-browser-resources.mjs again`);
      parts.push(buf);
    }
    const tmp = out + '.tmp';
    await writeFile(tmp, Buffer.concat(parts), { mode: 0o644 });
    await rename(tmp, out);
    written++; writtenBytes += b.s;
  }
  return {
    written, writtenBytes,
    /** delete the bundles (and temporary files) no longer planned; returns how many */
    async prune() {
      let n = 0;
      for (const e of await readdir(dir)) {
        if (names.has(e)) continue;
        if (!e.endsWith(BUNDLE_EXT) && !e.endsWith(BUNDLE_EXT + '.tmp')) continue;
        try { await unlink(join(dir, e)); n++; } catch { /* gone already */ }
      }
      return n;
    },
  };
}
