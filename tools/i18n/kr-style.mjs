#!/usr/bin/env node
// tools/i18n/kr-style.mjs — how the Korean server words a Chinese phrase, for translating CN-only texts by hand
// (docs/I18N.md "CN-only texts in Korean").
//
// Pairs every string of the CN tables with the string at the same path of the KR tables (same skill id and level, same
// talent candidate, same item …) and prints the pairs whose Chinese contains each phrase, shortest first. `--count`
// counts a Korean phrase over the KR tables instead, to choose between two wordings.
//
//   node tools/i18n/kr-style.mjs 受到攻击后触发 范围法术伤害      CN phrase → KR wording
//   node tools/i18n/kr-style.mjs -n 8 可充能                     more pairs per phrase (default 3)
//   node tools/i18n/kr-style.mjs --count '대미지를 입힘' '대미지를 줌'
//
// Tables: .cache/gamedata-ko/excel (tools/build-i18n.mjs --lang ko; --refresh there for the newest KR tables) against the
// CN tables the KR client translates — the CN cache at tools/gamedata-url.mjs TRANSLATED_GAMEDATA (build-i18n downloads
// it), else .cache/gamedata/excel (tools/build-data.mjs): the current CN tables rewrote texts under ids the KR tables
// keep (规程's equipment skills), and those pairs would show a translation of another sentence. Tags (<@ba.vup>,
// <$ba.stun> …) are stripped from what is matched and shown.

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRANSLATED_CACHE } from '../gamedata-url.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CN_DIR = join(ROOT, '.cache', 'gamedata', 'excel');
const CN_TRANSLATED_DIR = join(ROOT, TRANSLATED_CACHE, 'excel');
const KR_DIR = join(ROOT, '.cache', 'gamedata-ko', 'excel');
const ZH = /[一-鿿]/;
const strip = (s) => s.replace(/<[^>]*>/g, '').replace(/\\n|\n/g, ' / ');

const args = process.argv.slice(2);
let n = 3;
const ni = args.indexOf('-n');
if (ni >= 0) { n = Number(args[ni + 1]) || n; args.splice(ni, 2); }
const count = args[0] === '--count';
if (count) args.shift();
if (!args.length) {
  console.error('usage: node tools/i18n/kr-style.mjs [-n N] <Chinese phrase>… | --count <Korean phrase>…');
  process.exit(2);
}
for (const dir of [KR_DIR, ...(count ? [] : [CN_DIR])]) {
  if (!existsSync(dir)) { console.error(`missing ${dir} (see the header of this file)`); process.exit(1); }
}

/** Walks the CN and KR tables side by side and collects [cn, kr] for every CN string with Chinese in it. */
function pairs(cn, kr, out) {
  if (typeof cn === 'string') {
    if (typeof kr === 'string' && kr && ZH.test(cn) && !ZH.test(kr)) out.push([cn, kr]);
    return;
  }
  if (!cn || !kr || typeof cn !== 'object' || typeof kr !== 'object') return;
  for (const k of Object.keys(cn)) if (k in kr) pairs(cn[k], kr[k], out);
}

const files = (await readdir(KR_DIR)).filter((f) => f.endsWith('.json'));
if (count) {
  const text = (await Promise.all(files.map((f) => readFile(join(KR_DIR, f), 'utf8')))).join('\n');
  for (const p of args) console.log(`${String(text.split(p).length - 1).padStart(6)}  ${p}`);
} else {
  const all = [];
  for (const f of files) {
    const cnDir = existsSync(join(CN_TRANSLATED_DIR, f)) ? CN_TRANSLATED_DIR : CN_DIR;
    if (!existsSync(join(cnDir, f))) continue;
    const [cn, kr] = await Promise.all([join(cnDir, f), join(KR_DIR, f)].map((x) => readFile(x, 'utf8').then(JSON.parse)));
    pairs(cn, kr, all);
  }
  const seen = new Set();
  const uniq = all.filter(([a, b]) => !seen.has(a + '\u0000' + b) && seen.add(a + '\u0000' + b));
  for (const p of args) {
    const hits = uniq.filter(([a]) => strip(a).includes(p)).sort((x, y) => x[0].length - y[0].length);
    console.log(`### ${p}  (${hits.length})`);
    for (const [a, b] of hits.slice(0, n)) console.log(`  CN: ${strip(a)}\n  KR: ${strip(b)}`);
  }
}
