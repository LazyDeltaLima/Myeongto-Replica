// server/http/changelog.js — GET /changelog.json: the patch notes players read in the lobby (the 更新 tab of the tips
// panel and its 更新记录 window, public/js/ui/patchNotes.js), parsed from CHANGELOG.md, the one place the release notes
// are written. Only this fork's own releases (1.0.0 and later) are served: the 0.x entries are the upstream's notes.
//
// The subset of Markdown CHANGELOG.md uses: `## <version> — <date>` opens an entry, `### <title>` a group, `- ` a list
// item (an indented line continues it), other lines are paragraphs (a blank line ends one). Inline: **bold** and
// `code`; a [link](url) keeps its text only (the targets are repository paths). A list item may close on the issues and
// pull requests it comes from, ` ([#12](…), [#15](…))`: they stay on GitHub and are left out of the lobby. The file is
// re-read when its mtime changes; a missing file answers an empty list.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.js';

export const CHANGELOG_URL = '/changelog.json';
const ENTRY_RE = /^##\s+(\d+)\.(\d+)\.(\d+)\s*(?:[—–-]\s*(.*))?$/;
/** the issue / pull-request references closing a list item: ` ([#12](url), [#15](url))` */
const REFS_RE = /\s*\(\s*\[#\d+\]\([^)\s]*\)(?:\s*,\s*\[#\d+\]\([^)\s]*\))*\s*\)$/;

/** A list item without the references that close it. @param {string} item */
export const stripRefs = (item) => String(item).replace(REFS_RE, '');

/**
 * Inline Markdown → segments: `{ s }` plain, `{ s, b: true }` bold, `{ s, c: true }` code.
 * @param {string} text
 * @returns {{ s: string, b?: true, c?: true }[]}
 */
export function parseInline(text) {
  const plain = String(text).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  const out = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let at = 0;
  for (let m = re.exec(plain); m; m = re.exec(plain)) {
    if (m.index > at) out.push({ s: plain.slice(at, m.index) });
    out.push(m[1] != null ? { s: m[1], b: true } : { s: m[2], c: true });
    at = re.lastIndex;
  }
  if (at < plain.length) out.push({ s: plain.slice(at) });
  return out;
}

/**
 * CHANGELOG.md → entries, newest first as written. Blocks: `{ h }` a group title, `{ p }` a paragraph, `{ ul }` a list.
 * @param {string} md
 * @param {{ minMajor?: number }} [opts] entries below this major version are left out (default 1)
 * @returns {{ version: string, date: string, blocks: ({ h: string } | { p: object[] } | { ul: object[][] })[] }[]}
 */
export function parseChangelog(md, { minMajor = 1 } = {}) {
  const entries = [];
  let entry = null;
  let para = null;   // lines of the open paragraph
  let list = null;   // raw items of the open list
  const close = () => {
    if (para) entry?.blocks.push({ p: parseInline(para.join(' ')) });
    if (list) entry?.blocks.push({ ul: list.map((item) => parseInline(stripRefs(item))) });
    para = null; list = null;
  };
  for (const raw of String(md).split(/\r?\n/)) {
    const line = raw.trimEnd();
    const head = ENTRY_RE.exec(line);
    if (head) {
      close();
      entry = Number(head[1]) >= minMajor ? { version: `${head[1]}.${head[2]}.${head[3]}`, date: (head[4] || '').trim(), blocks: [] } : null;
      if (entry) entries.push(entry);
      continue;
    }
    if (/^#{1,2}\s/.test(line)) { close(); entry = null; continue; }
    if (!entry) continue;
    if (!line.trim()) { close(); continue; }
    const group = /^###+\s+(.*)$/.exec(line);
    if (group) { close(); entry.blocks.push({ h: group[1].trim() }); continue; }
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (item) {
      if (para) close();
      (list ||= []).push(item[1]);
      continue;
    }
    if (list && /^\s/.test(raw)) { list[list.length - 1] += ` ${line.trim()}`; continue; }
    if (list) close();
    (para ||= []).push(line.trim());
  }
  close();
  return entries;
}

/**
 * The cached reader behind the route.
 * @param {{ file?: string }} [opts]
 * @returns {() => Promise<{ entries: ReturnType<typeof parseChangelog> }>}
 */
export function createChangelogReader({ file = path.join(ROOT, 'CHANGELOG.md') } = {}) {
  let cached = null;
  let mtime = -1;
  return async function read() {
    let st;
    try { st = await fsp.stat(file); } catch { return { entries: [] }; }
    if (!cached || st.mtimeMs !== mtime) {
      const md = await fsp.readFile(file, 'utf8');
      cached = { entries: parseChangelog(md) };
      mtime = st.mtimeMs;
    }
    return cached;
  };
}
