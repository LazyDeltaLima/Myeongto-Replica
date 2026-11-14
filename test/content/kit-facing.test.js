// test/content/kit-facing.test.js — what a new 自选 kit must not leave to a reader's memory (docs/rules/diy.md 「새 선발 오퍼레이터
// 키트 체크리스트」 「화면·배치」; maintainer report 2026-11-04, 涤火杰西卡):
//  - a kit setting `.dir` in mid-battle tells the view (kits/shared/tier1.js tellDir), or the snapshot-less view keeps the old model
//    and facing ring while the range turns;
//  - an operator whose text says she turns (转向) has such a kit;
//  - every placement restriction a pick's text states is a rule the prep enforces, never only a comment in the kit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_DIY_PICKS } from '../../shared/local-diy.js';
import { allSeasonData } from '../helpers/seasonPicks.js';
import { fxDir, stateFx } from '../../shared/protocol.js';
import { tellDir } from '../../server/sim/content/kits/shared/tier1.js';
import { fxPathScenarios } from '../../tools/golden.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KITS = path.join(ROOT, 'server/sim/content/kits');
const OPS = path.join(KITS, 'ops');
const BACKUPS = JSON.parse(readFileSync(path.join(ROOT, 'data/backups.json'), 'utf8'));
const strip = (s) => String(s || '').replace(/<[^>]*>/g, '');

/** Kits that set `.dir` without tellDir, and why the view still follows. */
const DIR_WITHOUT_TELL = Object.freeze({
  'op-aglna2.js': "her flight's end: fx 'aglnaFlight' { on: 0, dir } sets the view's direction (render/fxgame.js)",
  'op-monstr.js': 'S3 【返回】 only: back to the tile and direction she left, which never changed',
});

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = path.join(d, f);
  return statSync(p).isDirectory() ? walk(p) : f.endsWith('.js') ? [p] : [];
});
const setsDir = (src) => /\.(?:dir|facing)\s*=(?!=)/.test(src);

test('a kit setting a unit\'s direction tells the view (tellDir), or is listed with the reason', () => {
  const bad = [];
  const listed = new Set();
  for (const p of walk(KITS)) {
    const name = path.basename(p);
    if (name === 'tier1.js') continue;
    const src = readFileSync(p, 'utf8');
    if (!setsDir(src) || /\btellDir\(/.test(src)) continue;
    if (DIR_WITHOUT_TELL[name]) listed.add(name); else bad.push(name);
  }
  assert.deepEqual(bad, [], 'call tellDir(battle, unit) after setting the direction (kits/shared/tier1.js)');
  assert.deepEqual([...listed].sort(), Object.keys(DIR_WITHOUT_TELL).sort(), 'no stale entry in DIR_WITHOUT_TELL');
});

test('tellDir sends state: a hidden tab, a catch-up frame or a field entered late keeps the direction', () => {
  const sent = [];
  tellDir({ fx: (kind, o) => sent.push(['fx', kind, o.x, o.y, o]) }, { x: 1, y: 2, id: 7, dir: 'UP' });
  assert.equal(fxDir(sent[0]), 'UP');
  assert.ok(stateFx(sent[0]));
});

/** Picks whose 转向 is something else's. */
const TURN_TEXT_NOT_HERS = Object.freeze({ char_1050_chen3: 'S3: her 剑气 turns, not she' });

test('a pick whose text says it turns (转向) has a kit that tells the view', () => {
  const missing = [];
  // every season's picks with that season's forms (盟约's own chess are 规程 picks: test/helpers/seasonPicks.js)
  const units = Object.assign({}, ...Object.values(allSeasonData()).map((d) => d.backups.units));
  for (const id of LOCAL_DIY_PICKS) {
    if (TURN_TEXT_NOT_HERS[id]) continue;
    const forms = Object.values(units[id].forms);
    const texts = forms.flatMap((f) => [...(f.talents || []), ...(f.skills || [])].map((t) => strip(t.desc)));
    if (!texts.some((d) => /转向/.test(d))) continue;
    const code = id.replace(/^char_\d+_/, '');
    let src = readFileSync(path.join(OPS, `op-${code}.js`), 'utf8');
    // a chess kit fielded as a pick (kits/shared/chessPick.js): the chess kit file it wraps
    for (const [, f] of src.matchAll(/from '\.\/(chess_char_[^']+\.js)'/g)) src += readFileSync(path.join(OPS, f), 'utf8');
    if (!/\btellDir\(/.test(src)) missing.push(id);
  }
  assert.deepEqual(missing, []);
});

/** A restriction a text states, as the rule that enforces it; a wording not listed fails below until it has one. */
const PLACEMENT_RULES = Object.freeze([
  { text: /只能部署在\S*攻击范围内/, holds: (t) => t.ownerRange === true },
  { text: /只能放置于\S*四周/, holds: (t) => t.ownerBeside === true },
  { text: /仅可以部署在\S*攻击范围外\S*远程位/, holds: (t) => t.ownerRangeOutside === true && t.rangedTilesOnly === true },
  { text: /只能部署在近战位/, holds: (t) => t.position === 'MELEE' },
]);
const RESTRICTION = /(?:只能|仅能|仅可以?)[^，。；]*(?:部署|放置)/g;

test('every placement restriction a pick\'s text states is a rule of its summon piece', () => {
  const tokens = Object.values(BACKUPS.tokens).filter((t) => t.placeable && (t.owners || []).some((o) => LOCAL_DIY_PICKS.includes(o.split('@')[0])));
  const bad = [];
  let checked = 0;
  for (const t of tokens) {
    const owner = (t.owners || []).map((o) => o.split('@')[0]).filter((o) => LOCAL_DIY_PICKS.includes(o));
    const name = t.name;
    const ownerTexts = owner.flatMap((id) => Object.values(BACKUPS.units[id].forms).flatMap((f) => (f.talents || []).map((x) => strip(x.desc))))
      .flatMap((d) => d.split(/[。；]/)).filter((d) => d.includes(name));
    for (const d of new Set([strip(t.desc), ...ownerTexts])) {
      for (const m of d.matchAll(RESTRICTION)) {
        const clause = d.slice(m.index);
        const rule = PLACEMENT_RULES.find((r) => r.text.test(clause));
        checked++;
        if (!rule) bad.push(`${t.tokenId}: no rule for 「${clause.slice(0, 40)}」 — add one (shared with server/match/player/placement.js _legal and its client mirror)`);
        else if (!rule.holds(t)) bad.push(`${t.tokenId}: 「${clause.slice(0, 40)}」 is not enforced by its data`);
      }
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(checked >= 3, `${checked} statements checked: the scan still finds them`);
});

test('every pick with a hand-placed summon has an effect golden battle with the piece placed by its rules', () => {
  const scenarios = new Map(fxPathScenarios().map((sc) => [sc.id, sc]));
  const stored = JSON.parse(readFileSync(path.join(ROOT, 'test/golden/fx-events.json'), 'utf8')).scenarios;
  const picks = LOCAL_DIY_PICKS.filter((id) => Object.values(BACKUPS.tokens).some((t) => t.placeable && (t.owners || []).some((o) => o.split('@')[0] === id)));
  assert.ok(picks.length >= 9, 'the scan still finds them');
  for (const id of picks) {
    if (id === 'char_1052_kalts2') { assert.ok(scenarios.has('fxpath-kalts2-s3')); continue; }
    const sid = `fxpath-summon-${id.replace(/^char_\d+_/, '')}`;
    const sc = scenarios.get(sid);
    assert.ok(sc, `${sid}: tools/golden.mjs fxPathScenarios`);
    assert.ok(stored[sid], `${sid} is in test/golden/fx-events.json`);
    const units = sc.players[0].units;
    const owner = units.find((u) => u.diy?.charId === id);
    for (const t of units.filter((u) => u.kind === 'token')) {
      if (BACKUPS.tokens[t.tokenId].ownerBeside) assert.equal(Math.abs(t.row - owner.row) + Math.abs(t.col - owner.col), 1, `${t.tokenId} next to her`);
    }
  }
  // the moment that went unseen: the shell draws its own flight and stop effect
  const jesca2 = JSON.stringify(stored['fxpath-summon-jesca2']);
  for (const n of ['jesca2_skill_03_trail_02', 'jesca2_skill_03_hit_02']) assert.ok(jesca2.includes(n), n);
});
