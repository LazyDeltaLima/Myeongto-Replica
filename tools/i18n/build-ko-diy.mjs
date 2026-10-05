// tools/i18n/build-ko-diy.mjs — 선발 오퍼레이터(data/diy.json) 한국어 사전 (local NAS patch, docs/LOCAL-PATCH.md)
// build-ko-data-dict.mjs와 같은 생각: data/diy.json(중국어)은 그대로 두고, 같은 빌더(tools/build-diy.mjs buildDiy)를 한국어
// 문자열을 넣은 테이블로 한 번 더 돌려 같은 경로의 문자열끼리 짝지어 public/i18n/ko/diy.json ({ "중국어": "한국어" })을 만든다.
// 숫자·태그는 빌더가 채우므로 원문과 정확히 같다.
//
// 한국어 원천 (원천 문자열마다, 같은 JSON 경로로):
//   1. KR 공식 테이블 (Kengxxiao/ArknightsGameData_YoStar ko_KR: character / skill / uniequip / battle_equip) — 한국 서버에 있는
//      오퍼레이터(위셔델, 아스카론)와 공통 문구
//   2. tools/i18n/diy-ko-manual.json { "중국어 원천 문자열": "한국어" } — 한국 서버에 없는 오퍼레이터(望, 赤刃明霄陈, 丰川祥子).
//      자리표시자({atk:0%} 등)와 <@ba.vup> 태그는 원문 그대로 둔다. 번역은 KR 공식 문체에 맞춘 수동 번역 [비공식].
//
// 사용:
//   KO_DIY_TRACE=1 node tools/i18n/build-ko-diy.mjs   빌드 결과에 쓰이는 원천 문자열 중 KR 테이블에도 수동 사전에도 없는 것을 출력
//   node tools/i18n/build-ko-diy.mjs           public/i18n/ko/diy.json 생성

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext } from '../build-data.mjs';
import { buildDiy, DIY_CANDIDATES } from '../build-diy.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const KR_CACHE = join(ROOT, '.cache', 'gamedata-ko-diy');
const KR_BASE = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData_YoStar/main/ko_KR/gamedata/excel/';
const MANUAL = join(ROOT, 'tools', 'i18n', 'diy-ko-manual.json');
const OUT = join(ROOT, 'public', 'i18n', 'ko', 'diy.json');
const ZH = /[一-鿿]/;
const TRACE = process.env.KO_DIY_TRACE === '1'; // (build-data parses argv at import: no options here)

async function krTable(name) {
  const p = join(KR_CACHE, `${name}.json`);
  if (!existsSync(p)) {
    await mkdir(KR_CACHE, { recursive: true });
    const r = await fetch(KR_BASE + name + '.json');
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
    await writeFile(p, Buffer.from(await r.arrayBuffer()));
  }
  return JSON.parse(await readFile(p, 'utf8'));
}

/** The source objects whose strings reach the records: [cnObject, krObject|null, setter(newObj)] by table. */
function sources(ctx, kr) {
  const out = [];
  const add = (label, cn, ko, set) => { if (cn) out.push({ label, cn, ko: ko || null, set }); };
  const tokens = new Set();
  const skills = new Set();
  const modules = new Set();
  const subProfs = new Set();
  for (const c of DIY_CANDIDATES) {
    const ch = ctx.charTable[c.charId];
    for (const id of Object.keys(ch.displayTokenDict || {})) tokens.add(id);
    for (const s of ch.skills || []) { if (s.skillId) skills.add(s.skillId); if (s.overrideTokenKey) tokens.add(s.overrideTokenKey); }
    for (const id of ctx.uniequip.charEquip?.[c.charId] || []) modules.add(id);
    subProfs.add(ch.subProfessionId);
  }
  for (const id of tokens) for (const s of ctx.charTable[id]?.skills || []) if (s.skillId) skills.add(s.skillId);
  for (const id of [...DIY_CANDIDATES.map((c) => c.charId), ...tokens]) {
    add(`char ${id}`, ctx.charTable[id], kr.char[id], (v) => { ctx.charTable[id] = v; });
  }
  for (const id of skills) add(`skill ${id}`, ctx.skillTable[id], kr.skill[id], (v) => { ctx.skillTable[id] = v; });
  for (const id of modules) {
    add(`module ${id}`, ctx.uniequip.equipDict?.[id], kr.uniequip.equipDict?.[id], (v) => { ctx.uniequip.equipDict[id] = v; });
    add(`equip ${id}`, ctx.battleEquip[id], kr.equip[id], (v) => { ctx.battleEquip[id] = v; });
  }
  for (const id of subProfs) add(`subprof ${id}`, ctx.uniequip.subProfDict?.[id], kr.uniequip.subProfDict?.[id], (v) => { ctx.uniequip.subProfDict[id] = v; });
  return out;
}

/** Copy of `cn` with every Chinese string replaced by fn(cnString, krStringAtSamePath | undefined, path). */
function mapStrings(cn, ko, fn, path = '') {
  if (typeof cn === 'string') return ZH.test(cn) ? fn(cn, typeof ko === 'string' ? ko : undefined, path) : cn;
  if (Array.isArray(cn)) return cn.map((x, i) => mapStrings(x, Array.isArray(ko) ? ko[i] : undefined, fn, `${path}[${i}]`));
  if (cn && typeof cn === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(cn)) o[k] = mapStrings(v, ko && typeof ko === 'object' ? ko[k] : undefined, fn, `${path}.${k}`);
    return o;
  }
  return cn;
}

/** Pairs of strings at the same path in two records. */
function pairs(cn, ko, out) {
  if (typeof cn === 'string') { if (ZH.test(cn) && typeof ko === 'string' && ko !== cn) out.set(cn, ko); return; }
  if (Array.isArray(cn)) { cn.forEach((x, i) => pairs(x, Array.isArray(ko) ? ko[i] : undefined, out)); return; }
  if (cn && typeof cn === 'object') for (const [k, v] of Object.entries(cn)) pairs(v, ko && typeof ko === 'object' ? ko[k] : undefined, out);
}

async function main() {
  const base = await loadContext();
  const kr = {
    char: await krTable('character_table'), skill: await krTable('skill_table'),
    uniequip: await krTable('uniequip_table'), equip: await krTable('battle_equip_table'),
  };
  // the tables write some line breaks as a literal backslash-n and a no-break space inside "Ave Mujica": the manual
  // dictionary is matched on a normalized form, and its Korean keeps the table's own line-break spelling
  const norm = (x) => x.replace(/\\n/g, '\n').replace(/\u00a0/g, ' ');
  const manualRaw = existsSync(MANUAL) ? JSON.parse(await readFile(MANUAL, 'utf8')) : {};
  const manualMap = new Map(Object.entries(manualRaw).map(([k, v]) => [norm(k), v]));
  const manualFor = (zh) => {
    const ko = manualMap.get(norm(zh));
    if (ko == null) return null;
    return zh.includes('\\n') ? ko.replace(/\n/g, '\\n') : ko;
  };
  const cnBuild = await buildDiy(base);

  // a context whose candidate strings are Korean (KR table at the same path, else the manual dictionary, else a marker)
  const ctx = { ...base, charTable: { ...base.charTable }, skillTable: { ...base.skillTable },
    uniequip: { ...base.uniequip, equipDict: { ...base.uniequip.equipDict }, subProfDict: { ...base.uniequip.subProfDict } },
    battleEquip: { ...base.battleEquip } };
  const missing = new Map();
  const markers = new Map();
  let n = 0;
  for (const src of sources(ctx, kr)) {
    src.set(mapStrings(src.cn, src.ko, (zh, ko, path) => {
      const man = manualFor(zh);
      if (man) return man;
      if (ko && !ZH.test(ko)) return ko;
      const m = `⟦${n++}⟧`;
      markers.set(m, { zh, where: `${src.label}${path}` });
      return m;
    }));
  }
  const koBuild = await buildDiy(ctx);
  const dict = new Map();
  pairs({ c: cnBuild.chess, t: cnBuild.tokens }, { c: koBuild.chess, t: koBuild.tokens }, dict);
  // markers that reached the records = source strings still needing a translation
  const used = new Set();
  for (const ko of dict.values()) for (const m of ko.match(/⟦\d+⟧/g) || []) used.add(m);
  for (const m of used) missing.set(markers.get(m).zh, markers.get(m).where);
  if (TRACE || missing.size) {
    console.log(`[ko-diy] ${missing.size} source string(s) without a translation (add them to tools/i18n/diy-ko-manual.json):`);
    for (const [zh, where] of missing) console.log(JSON.stringify({ zh, where }));
    if (TRACE) return;
  }
  const out = {};
  for (const [zh, ko] of [...dict].sort(([a], [b]) => a.localeCompare(b))) if (!/⟦\d+⟧/.test(ko)) out[zh] = ko;
  await writeFile(OUT, JSON.stringify(out, null, 0).replace(/","/g, '",\n"') + '\n');
  console.log(`[ko-diy] ${Object.keys(out).length} strings -> ${OUT}`);
}

main().catch((e) => { console.error('build-ko-diy failed:', e?.stack || e); process.exitCode = 1; });
