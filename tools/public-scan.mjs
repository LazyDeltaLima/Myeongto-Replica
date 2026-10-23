// tools/public-scan.mjs — the public-repository wording scan: test/public-repo.test.js runs it over every tracked
// file, the maintainer's pre-push hook over the pushed range (its files and its commit messages).
//
// It looks for text that records the work process instead of the rule (docs/rules/README.md 「쓰는 법」): a decision
// attributed to a "user" instead of the maintainer (CONTRIBUTING.md §3: "maintainer decision YYYY-MM-DD"), a work
// session's name, an internal decision number; client evidence that says how the client was read instead of what it does
// (CONTRIBUTING.md §3 "Client evidence": code addresses, decompiling / dump wording, disassembly) — and, through
// SP_PUBLIC_SCAN_WORDS, the maintainer's own private names
// (a branch, a script, a host): comma-separated, a `re:` prefix makes an entry a regular expression, the list itself
// lives outside the repository. Hits name the file and line (or the commit), never the matched text.
//
//   node tools/public-scan.mjs                     every tracked file
//   node tools/public-scan.mjs --range <a>..<b>    the range's changed files and its commit messages
//   node tools/public-scan.mjs --range <a>..<b> --all-files   every tracked file + the range's messages
//   SP_PUBLIC_SCAN_WORDS='nas-branch,re:dev\.sh\b' node tools/public-scan.mjs

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { trackedFiles } from './package.mjs';

const CLIENT_READ = 'say what the official client does, not how it was read (CONTRIBUTING.md §3 "Client evidence")';

/** Phrases a public file may not carry, with the fix. Case matters: "User decision" is ours, "user's" is upstream's. */
export const WORDING = [
  [/[Uu]ser decisions?\b/, 'write "maintainer decision YYYY-MM-DD" (CONTRIBUTING.md §3)'],
  [/사용자 (결정|요청|승인)/, '「관리자 결정」 / 「관리자 요청」으로 (docs/rules/README.md 「쓰는 법」)'],
  [/메인 세션|\bstronghold-[0-9a-f]{2}\b|세션 [0-9a-f]{6}\b/, 'a work session is not named in the repository'],
  [/(결정|decision) [A-Z]\d{1,2}\b|decision \d{4}-\d{2}-\d{2} #\d/, 'no internal decision numbers: the date alone'],
  [/디컴파일|역컴파일|디스어셈|역어셈|덤프|클라 코드|decompil|disassembl|il2cpp|dumper|dump\.cs|client code|metadata token|method pointer|gameassembly|global-metadata|objdump|code-gen module/i, CLIENT_READ],
  [/\b(?:RVA|VMA|DXBC)\b|\b[xy]mm\d+\b|\bmovss\b|cvtt?ss2sd|TypeDefIndex|\bcapstone\b/, CLIENT_READ],
  // an address in a comment (a constant in code, 0x9E3779B9, is not one)
  [/(?:^\s*(?:\/\/|\*|#)|\s\/\/\s).*\b0x(?=[0-9A-F]*[A-F])[0-9A-F]{5,9}\b/, CLIENT_READ],
];

/** Hex of five digits or more in a document or a commit message reads as a code address. */
const PROSE = [[/\b0x[0-9A-Fa-f]{5,}\b/, CLIENT_READ]];

// This file quotes the patterns; the fixture test feeds the scanner sample text on purpose.
const SELF = new Set(['tools/public-scan.mjs', 'test/public-scan.test.js']);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** SP_PUBLIC_SCAN_WORDS → regular expressions (literal entries case-insensitive, `re:` entries as written). */
export function scanWords(env = process.env) {
  const out = [];
  for (const raw of String(env.SP_PUBLIC_SCAN_WORDS || '').split(',')) {
    const w = raw.trim();
    if (!w) continue;
    out.push(w.startsWith('re:') ? new RegExp(w.slice(3)) : new RegExp(escapeRe(w), 'i'));
  }
  return out;
}

/** "what" labels of the lines of `text` that match; `words` are the private names; `prose` (a .md file, a commit
 * message) adds the address check of PROSE. */
export function scanText(text, words = [], { prose = false } = {}) {
  const hits = [];
  const lines = text.split('\n');
  const rules = prose ? [...WORDING, ...PROSE] : WORDING;
  lines.forEach((line, i) => {
    for (const [re, fix] of rules) if (re.test(line)) { hits.push({ line: i + 1, what: fix }); if (fix === CLIENT_READ) break; }
    for (const re of words) if (re.test(line)) { hits.push({ line: i + 1, what: 'private name (SP_PUBLIC_SCAN_WORDS)' }); break; }
  });
  return hits;
}

/** "path:line (what)" over text files (a file with a NUL byte is skipped: binaries are tools/package.mjs scanFiles' job). */
export function scanWording(root, files, words = []) {
  const hits = [];
  for (const rel of files) {
    if (SELF.has(rel)) continue;
    let text;
    try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { continue; }
    if (text.includes('\0')) continue;
    for (const h of scanText(text, words, { prose: rel.endsWith('.md') })) hits.push(`${rel}:${h.line} (${h.what})`);
  }
  return hits;
}

const git = (root, args) => {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args[0]}: ${r.stderr.trim()}`);
  return r.stdout;
};

/** "commit <sha> (what)" for the messages of `range` (as `git log` takes it). */
export function scanMessages(root, range, words = []) {
  const hits = [];
  const out = git(root, ['log', '--format=%h%x00%B%x01', range]);
  for (const rec of out.split('\x01')) {
    const [sha, body] = rec.split('\x00');
    if (!sha?.trim() || body === undefined) continue;
    for (const h of scanText(body, words, { prose: true })) hits.push(`commit ${sha.trim()} (${h.what})`);
  }
  return hits;
}

/** The files a range changed that still exist at its end. */
export function rangeFiles(root, range) {
  const end = range.includes('..') ? range.slice(range.lastIndexOf('..') + 2) || 'HEAD' : 'HEAD';
  const changed = git(root, ['log', '--format=', '--name-only', '--diff-filter=ACMR', range]).split('\n').map((s) => s.trim()).filter(Boolean);
  const present = new Set(git(root, ['ls-tree', '-r', '--name-only', end]).split('\n'));
  return [...new Set(changed)].filter((f) => present.has(f));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const i = process.argv.indexOf('--range');
  const range = i > 0 ? process.argv[i + 1] : null;
  const words = scanWords();
  const files = range && !process.argv.includes('--all-files') ? rangeFiles(root, range) : trackedFiles(root);
  const hits = scanWording(root, files, words);
  if (range) hits.push(...scanMessages(root, range, words));
  if (hits.length) {
    console.error(`public-scan: ${hits.length} hit(s)${range ? ` in ${range}` : ''}:`);
    for (const h of hits) console.error(`  ${h}`);
    process.exit(1);
  }
  console.log(`public-scan: clean (${files.length} files${range ? `, messages of ${range}` : ''}, ${words.length} private names)`);
}
