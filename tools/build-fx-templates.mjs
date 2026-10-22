#!/usr/bin/env node
// tools/build-fx-templates.mjs — the effect rows of the official buff templates this server's operators use
// (docs/rules/fx.md 「바인딩 표」, maintainer decision 2026-10-22).
//
// The client creates most talent / buff effects from its buff templates: a template is a small program, per event
// (ON_BUFF_START, ON_BUFF_TRIGGER, ON_BUFF_FINISH …) a list of nodes. This script reads them from the public community
// dataset (Kengxxiao/ArknightsGameData `gamedata/battle/buff_template_data.json`: en_US from ArknightsGameData_YoStar
// where the template exists there, else zh_CN — those rows carry `cn: true`) and writes, per template, the effects it
// may create, statically: tools/assets/fx-templates.json. The renderer reads it only through tools/build-fx-plays.mjs (the
// plays of the keys its kit plans name); test/render/fx-bindings.test.js
// checks the hand-written effect tables of render/ against it. A row:
//   { key, src: 'template', moment, kind, fx, target, life, conds, by?, cn? }
//     key     the client key: the template (an effect node, the template's own `effectKey`) or the buff a CreateBuff
//             creates (`buffKey`; `by` = the template whose node creates it)
//     moment  the template event the node runs on (ON_BUFF_START …); 'BUFF' for the template's own effectKey
//     kind    'effect' (CreateEffect: plays once), 'line' (CreateLineEffect), 'tile' (CreateTileEffect …), 'buff' (the
//             created buff's overrideEffectKey or its template's effectKey: held as long as that buff)
//     target  the node's `_targetType` / the buff's `_buffOwner` (BUFF_OWNER, TARGET, BUFF_SOURCE …)
//     life    'once' | 'hold' (an effect held by its source) | 'INFINITY' | 'LIMITED:<s>' | 'LIMITED:@<blackboard key>' |
//             'IMMEDIATELY' (the buff's own lifeTimeType)
//     conds   the condition nodes the row sits behind, by node type ('!' = the failing branch / IfNot), with the one
//             parameter a renderer could judge: CheckCharacterDefaultDirection(UP), CheckSkillIndex(1),
//             CheckUnitCurrentMode(2), FilterByBuffStackCount(GE 3), CheckContainsBuff(key) … — never the node trees.
// Scope: the templates whose key starts with an operator's / token's code (data/chess.json, data/backups.json,
// data/tokens.json: char_4039_horn → horn_…, horn[…]), the skill / talent / module blackboards' template references
// (character_table, skill_table, battle_equip_table), a few mode-wide prefixes (MODE_PREFIXES) and every template those
// templates name or whose enemy they summon (closure).
//
// Usage:  node tools/build-fx-templates.mjs [--refresh | --offline] [--out <file>]
//   downloads into .cache/gamedata/battle/ (zh_CN, like tools/build-data.mjs) and .cache/gamedata-en/battle/ (en_US);
//   --offline never downloads. A separate script, not a build-data step: data/*.json is what the game loads, this table
//   is for the tests only, and its two sources are ~45 MB.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REL = 'battle/buff_template_data.json';
const SOURCES = {
  cn: { url: `https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/${REL}`, cache: join(ROOT, '.cache/gamedata', REL) },
  en: { url: `https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData_YoStar/main/en_US/gamedata/${REL}`, cache: join(ROOT, '.cache/gamedata-en', REL) },
};
const EXCEL = join(ROOT, '.cache/gamedata/excel');
const OUT_DEFAULT = join(ROOT, 'tools/assets/fx-templates.json');

/** Mode-wide templates the battle draws (element bursts, the battlefields' terrain, the boss pieces an operator holds). */
const MODE_PREFIXES = ['ep_break_', 'ep_fire_', 'ep_water_', 'sand_storm', 'storm[', 'enemy_vtmstr_equip_'];

function args(argv) {
  const o = { refresh: false, offline: false, out: OUT_DEFAULT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--refresh') o.refresh = true;
    else if (a === '--offline') o.offline = true;
    else if (a === '--out') o.out = resolve(argv[++i] || '');
    else throw new Error(`unknown option ${a}\nusage: node tools/build-fx-templates.mjs [--refresh | --offline] [--out <file>]`);
  }
  if (o.refresh && o.offline) throw new Error('--refresh and --offline exclude each other');
  return o;
}

async function fetchCached({ url, cache }, opts) {
  if (existsSync(cache) && !opts.refresh) return JSON.parse(readFileSync(cache, 'utf8'));
  if (opts.offline) throw new Error(`missing cached file ${cache} (offline mode)`);
  mkdirSync(dirname(cache), { recursive: true });
  let last;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      console.log(`  download ${url}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
      const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const obj = JSON.parse(text);   // refuse to cache a truncated file
      writeFileSync(`${cache}.tmp-${process.pid}`, text);
      renameSync(`${cache}.tmp-${process.pid}`, cache);
      return obj;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  if (existsSync(cache)) { console.warn(`download failed (${last.message}), using the cached copy`); return JSON.parse(readFileSync(cache, 'utf8')); }
  throw new Error(`cannot obtain ${url}: ${last && last.message}`);
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const typeOf = (o) => String(o?.$type || '').split(',')[0].split('+').pop();

/** The codes of the server's operators and tokens: 'char_4039_horn' → 'horn', 'token_10030_mlyss_wtrman' → 'mlyss_wtrman', 'wtrman'. */
function poolCodes() {
  const chars = new Set();
  const chess = readJson(join(ROOT, 'data/chess.json'));
  for (const c of Object.values(chess.chess || chess)) if (typeof c?.charId === 'string' && c.charId.startsWith('char_')) chars.add(c.charId);
  const backups = readJson(join(ROOT, 'data/backups.json'));
  for (const id of Object.keys(backups.diy?.operators || {})) if (id.startsWith('char_')) chars.add(id);
  const tokens = new Set([...Object.keys(readJson(join(ROOT, 'data/tokens.json'))), ...Object.keys(backups.tokens || {})]);
  const codes = new Set();
  for (const id of chars) codes.add(id.replace(/^char_\d+_/, ''));
  for (const id of tokens) {
    const m = /^token_\d+_(.+)$/.exec(id);
    if (!m) continue;
    codes.add(m[1]);
    codes.add(m[1].split('_').pop());
  }
  return { chars: [...chars].sort(), codes: [...codes].filter((c) => c.length >= 3).sort() };
}

/** Template keys named in the blackboards (`valueStr`) of the operators' skills, talents, traits and modules. */
function blackboardRefs(chars, isKey) {
  const out = new Set();
  const take = (o) => {
    if (typeof o === 'string') { if (isKey(o)) out.add(o); }
    else if (Array.isArray(o)) o.forEach(take);
    else if (o && typeof o === 'object') Object.values(o).forEach(take);
  };
  const ct = readJson(join(EXCEL, 'character_table.json'));
  const st = readJson(join(EXCEL, 'skill_table.json'));
  const be = existsSync(join(EXCEL, 'battle_equip_table.json')) ? readJson(join(EXCEL, 'battle_equip_table.json')) : {};
  const ue = existsSync(join(EXCEL, 'uniequip_table.json')) ? readJson(join(EXCEL, 'uniequip_table.json')) : {};
  const equipOf = ue.charEquip || {};
  for (const id of chars) {
    const c = ct[id];
    if (!c) continue;
    take(c.talents); take(c.trait);
    for (const s of c.skills || []) take(st[s.skillId]);
    for (const e of equipOf[id] || []) take(be[e]);
  }
  return out;
}

const COND = /^(If(?!Else$|Conditions$|Not$)|Check|Filter|Compare|Is|Dice)/;

/** A condition node as a short string: its type, plus the one parameter a renderer could judge. */
function condName(o) {
  const t = typeOf(o);
  switch (t) {
    case 'CheckCharacterDefaultDirection': return `${t}(${o._useBB ? `@${o._bbKey}` : o._direction})`;
    case 'CheckSkillIndex': return `${t}(${o._skillIndex})`;
    case 'CheckUnitCurrentMode': return `${t}(${o._loadCurModeBbKey ? `@${o._loadCurModeBbKey}` : o._checkCurModeIndex})`;
    case 'FilterByBuffStackCount': return `${t}(${o._condType} ${o._stackCountKey ? `@${o._stackCountKey}` : o._stackCount}${o._buffKey ? ` ${o._buffKey}` : ''})`;
    case 'CheckContainsBuff': return `${t}(${(o._buffKeys || []).join(o.isAND ? '&' : '|')})`;
    case 'CheckContainsDerviedBuff': return `${t}(${o._derviedBuffKey})`;
    default: return t;
  }
}

const neg = (c) => (c.startsWith('!') ? c.slice(1) : `!${c}`);

/** The buff's lifetime as a row's `life`. */
function buffLife(b) {
  const t = b.lifeTimeType;
  if (t === 'LIMITED') return b.durationKey ? `LIMITED:@${b.durationKey}` : `LIMITED:${b.lifeTime}`;
  return String(t || '');
}

/**
 * The rows of one event's node list. A condition node gates the nodes after it in its list (IfNot turns the one
 * before it round); IfElse / IfConditions gate their branches.
 */
function walkNodes(list, conds, ctx, rows, refs) {
  let cur = [...conds];
  for (const o of Array.isArray(list) ? list : [list]) {
    if (!o || typeof o !== 'object') continue;
    const t = typeOf(o);
    if (t === 'IfNot') { if (cur.length > conds.length) cur[cur.length - 1] = neg(cur[cur.length - 1]); continue; }
    if (t === 'IfElse' || t === 'IfConditions') {
      const cs = t === 'IfElse' ? [o._conditionNode] : (Array.isArray(o._conditionsNode) ? o._conditionsNode : [o._conditionsNode]);
      const names = cs.filter(Boolean).map(condName);
      const c = names.length === 1 ? names[0] : `${o._isAnd === false ? 'Any' : 'All'}(${names.join(',')})`;
      walkNodes(o._succeedNodes || [], [...cur, c], ctx, rows, refs);
      walkNodes(o._failNodes || [], [...cur, neg(c)], ctx, rows, refs);
      continue;
    }
    if (COND.test(t)) { cur.push(condName(o)); continue; }
    node(o, t, cur, ctx, rows, refs);
  }
}

function node(o, t, conds, ctx, rows, refs) {
  const base = { key: ctx.key, src: 'template', moment: ctx.moment };
  const fxOf = (v, bb) => (typeof v === 'string' && v ? v : bb ? `@${bb}` : null);
  if (t.startsWith('Create') && t.includes('Effect') && !t.startsWith('CreateBuff') && !t.startsWith('CreateCard')) {
    const kind = t.includes('Line') ? 'line' : t.includes('Tile') ? 'tile' : 'effect';
    const fxs = Array.isArray(o._effectKeys) ? o._effectKeys : [fxOf(o._effectKey, o._blackboardKey)];
    const life = o._createEffectHoldBySource || o._holdIt ? 'hold' : 'once';
    for (const fx of fxs) if (fx) rows.push({ ...base, kind, fx, target: o._targetType || o._ownerType || null, life, conds, node: t });
  }
  if (t.startsWith('CreateBuff') && o._buff && typeof o._buff === 'object') {
    const b = o._buff;
    if (b.templateKey && b.templateKey !== 'empty') refs.add(b.templateKey);
    const fx = (t === 'CreateBuffWithOverrideEffect' && o._effectKey) || b.overrideEffectKey || null;
    const row = { key: b.buffKey || ctx.key, src: 'template', moment: ctx.moment, kind: 'buff', fx, target: o._buffOwner || null,
      life: buffLife(b), conds, by: ctx.key, tpl: b.templateKey && b.templateKey !== 'empty' ? b.templateKey : null, node: t };
    rows.push(row);
  }
  for (const [k, v] of Object.entries(o)) {
    if (k === '$type' || k === '_buff') continue;
    // buffs a node hands out other than by CreateBuff (SummonEnemiesOnAttackRange `_buffs` on what it summons …)
    for (const b of (Array.isArray(v) ? v : [v])) {
      if (!b || typeof b !== 'object' || b.$type || typeof b.buffKey !== 'string' || !('lifeTimeType' in b)) continue;
      if (b.templateKey && b.templateKey !== 'empty') refs.add(b.templateKey);
      rows.push({ key: b.buffKey, src: 'template', moment: ctx.moment, kind: 'buff', fx: b.overrideEffectKey || null, target: o._target || o._targetType || null,
        life: buffLife(b), conds, by: ctx.key, tpl: b.templateKey && b.templateKey !== 'empty' ? b.templateKey : null, node: `${t}.${k}` });
    }
    if (typeof v === 'string' && ctx.isKey(v) && v !== ctx.key) refs.add(v);
    if (v && typeof v === 'object') {
      const sub = Array.isArray(v) ? v : [v];
      // a branching node's branch (SwitchDirection `_rightNodes` …) runs only on its case
      const branch = /^_([a-zA-Z]+)Nodes$/.exec(k);
      if (sub.some((x) => x && typeof x === 'object' && x.$type)) walkNodes(sub, branch ? [...conds, `${t}(${branch[1].toUpperCase()})`] : conds, ctx, rows, refs);
    }
  }
}

/** The rows of template `key` ({ effectKey, eventToActions }) and the template keys it names. */
function templateRows(key, tpl, isKey) {
  const rows = [], refs = new Set();
  if (tpl.effectKey) rows.push({ key, src: 'template', moment: 'BUFF', kind: 'buff', fx: tpl.effectKey, target: 'BUFF_OWNER', life: null, conds: [] });
  for (const [moment, list] of Object.entries(tpl.eventToActions || {})) walkNodes(list || [], [], { key, moment, isKey }, rows, refs);
  return { rows, refs };
}

async function main() {
  const opts = args(process.argv.slice(2));
  const cn = await fetchCached(SOURCES.cn, opts);
  const en = await fetchCached(SOURCES.en, opts);
  const isKey = (s) => Object.prototype.hasOwnProperty.call(cn, s) || Object.prototype.hasOwnProperty.call(en, s);
  const { chars, codes } = poolCodes();
  const all = [...new Set([...Object.keys(en), ...Object.keys(cn)])];
  const startsWithCode = (k) => {
    const lk = k.toLowerCase();
    return codes.some((c) => lk === c || lk.startsWith(`${c}_`) || lk.startsWith(`${c}[`) || lk.startsWith(`char_${c}_`) || lk.startsWith(`skchr_${c}_`));
  };
  const seeds = new Set(all.filter((k) => startsWithCode(k) || MODE_PREFIXES.some((p) => k.startsWith(p))));
  for (const k of blackboardRefs(chars, isKey)) seeds.add(k);
  // closure: the templates the scope's templates name (a CreateBuff's templateKey, a FinishBuffsById's key …), and the
  // templates of the enemies they summon (`_enemyKey` enemy_5601_entlec → entlec_…: 隐德来希's 心烛)
  const scope = new Map(), queue = [...seeds], summoned = new Set();
  while (queue.length) {
    const k = queue.shift();
    if (scope.has(k)) continue;
    const t = en[k] || cn[k];
    if (!t) continue;
    const r = templateRows(k, t, isKey);
    scope.set(k, { rows: r.rows, cn: !en[k], refs: [...r.refs].filter((x) => x !== 'empty').sort() });
    for (const x of r.refs) if (!scope.has(x) && !seeds.has(x) && x !== 'empty') { seeds.add(x); queue.push(x); }
    for (const m of JSON.stringify(t).matchAll(/"_enemyKey":"enemy_\d+_([a-z0-9]+)"/g)) {
      if (summoned.has(m[1])) continue;
      summoned.add(m[1]);
      for (const x of all) if ((x.startsWith(`${m[1]}_`) || x.startsWith(`${m[1]}[`)) && !seeds.has(x)) { seeds.add(x); queue.push(x); }
    }
  }
  const rows = [];
  for (const k of [...scope.keys()].sort()) {
    for (const r of scope.get(k).rows) {
      if (!r.fx && r.kind === 'buff' && !r.tpl) continue;   // a plain buff: no effect, no template to follow
      const out = { key: r.key, src: 'template', moment: r.moment, kind: r.kind, fx: r.fx, target: r.target, life: r.life, conds: r.conds };
      if (r.by && r.by !== r.key) out.by = r.by;
      if (r.tpl) out.tpl = r.tpl;
      if (scope.get(k).cn) out.cn = true;
      rows.push(out);
    }
  }
  // a created buff without an overrideEffectKey shows its template's own effectKey
  const own = new Map();
  for (const r of rows) if (r.moment === 'BUFF' && r.fx) own.set(r.key, r.fx);
  for (const r of rows) if (r.kind === 'buff' && !r.fx && r.tpl && own.has(r.tpl)) r.fx = own.get(r.tpl);
  const kept = rows.filter((r) => r.fx);
  const doc = {
    $comment: 'Generated by tools/build-fx-templates.mjs from Kengxxiao/ArknightsGameData battle/buff_template_data.json (en_US where present, else zh_CN: cn). Effect rows of the buff templates this server\'s operators use; checked against the render effect tables by test/render/fx-bindings.test.js. Do not edit by hand.',
    count: scope.size,
    cnOnly: [...scope.entries()].filter(([, v]) => v.cn).length,
    rows: kept,
    // every template of the scope → the templates it names (which templates a used one brings along)
    templates: Object.fromEntries([...scope.keys()].sort().map((k) => [k, scope.get(k).refs])),
  };
  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, `${JSON.stringify(doc).replace(/\},\{"key"/g, '},\n{"key"').replace(/\],"/g, '],\n"')}\n`);
  console.log(`${scope.size} templates (${doc.cnOnly} zh_CN only), ${kept.length} rows → ${opts.out}`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
