// S.W.E.E.P.报告 (screens/sweep.js) and the enemy codex's letter grades:
//   - factions.json `handbookLevels` is the official enemy handbook table (enemy_handbook_table levelInfoList, generated
//     by tools/build-data.mjs): ten grades E … SS, weakest first, every graded stat with a [min, max) band
//   - enemyGrade puts a value in its band as the official handbook does (min <= value < max, a negative max open-ended:
//     an edge belongs to the band that starts there; the attack interval runs the other way and is the enemy's
//     baseAttackTime as it is); no value or no table reads '—'
//   - the codex lists one enemy per 图鉴 number and no summon-only enemy; a leader's keys are the leader, then its escorts
//   - the report is read-only and a full-screen Modal (focus trap, Esc, focus restored); the lobby hub's S.W.E.E.P. plate
//     opens it; the bonds sit on the official handbook's discs (ui/handbook: the tiles' white img_bond_item_bkg, the
//     left panel's grey img_left_bond_icon_bkg — the event recording shows white, not the briefing's mint)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const factions = JSON.parse(read('data/factions.json'));
const enemies = JSON.parse(read('data/enemies.json'));

const { enemyGrade, codexEnemies, bossEnemyKeys } = await import('../../public/js/screens/sweep.js');

const LEVELS = factions.handbookLevels;
const STATS = ['maxHp', 'atk', 'def', 'res', 'moveSpeed', 'interval', 'elementRes', 'elementDmgRes'];

test('handbookLevels: the official ten grades, weakest first, each stat a [min, max) band that meets the next', () => {
  assert.deepEqual(LEVELS.map((l) => l.level), ['E', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS']);
  for (const l of LEVELS) for (const k of STATS) assert.ok(Array.isArray(l[k]) && l[k].length === 2, `${l.level} ${k}`);
  for (const k of STATS) {
    const bands = LEVELS.map((l) => l[k]);
    if (k === 'interval') {
      // shorter is stronger: SS starts at 0, E is open-ended
      assert.equal(bands.at(-1)[0], 0);
      assert.equal(bands[0][1], null);
      for (let i = 1; i < bands.length; i++) assert.equal(bands[i][1], bands[i - 1][0], `${k} ${LEVELS[i].level}`);
    } else {
      assert.equal(bands[0][0], 0);
      assert.equal(bands.at(-1)[1], null);
      for (let i = 1; i < bands.length; i++) assert.equal(bands[i][0], bands[i - 1][1], `${k} ${LEVELS[i].level}`);
    }
  }
  // spot checks against the table (enemy_handbook_table.json levelInfoList)
  assert.deepEqual(LEVELS.find((l) => l.level === 'B').maxHp, [5000, 8000]);
  assert.deepEqual(LEVELS.find((l) => l.level === 'A+').def, [1200, 2000]);
  assert.deepEqual(LEVELS.find((l) => l.level === 'S+').interval, [0.5, 0.8]);
});

test('enemyGrade: the band a value falls in; an edge starts the next band; the interval runs the other way', () => {
  assert.equal(enemyGrade('maxHp', 999, LEVELS), 'E');
  assert.equal(enemyGrade('maxHp', 1000, LEVELS), 'D');
  assert.equal(enemyGrade('maxHp', 7999, LEVELS), 'B');
  assert.equal(enemyGrade('maxHp', 500000, LEVELS), 'SS');
  assert.equal(enemyGrade('atk', 0, LEVELS), 'E');
  assert.equal(enemyGrade('res', 50, LEVELS), 'A');
  assert.equal(enemyGrade('moveSpeed', 1.9, LEVELS), 'S+');
  assert.equal(enemyGrade('interval', 0.4, LEVELS), 'SS');
  assert.equal(enemyGrade('interval', 1.7, LEVELS), 'B+');
  assert.equal(enemyGrade('interval', 9, LEVELS), 'E');
  assert.equal(enemyGrade('atk', null, LEVELS), '—', 'never attacks');
  assert.equal(enemyGrade('moveSpeed', undefined, LEVELS), '—');
  assert.equal(enemyGrade('atk', -5, LEVELS), '—', 'in no band');
  assert.equal(enemyGrade('atk', 300, undefined), '—', 'no table loaded');
  assert.equal(enemyGrade('nope', 300, LEVELS), '—');
});

test('enemyGrade grades every codex enemy\'s numbers (no gaps in the table)', () => {
  for (const e of codexEnemies(Object.values(enemies))) {
    for (const k of ['maxHp', 'atk', 'def', 'res', 'elementRes', 'elementDmgRes']) {
      const v = e.stats?.[k] ?? 0;
      assert.notEqual(enemyGrade(k, v, LEVELS), '—', `${e.key} ${k}=${v}`);
    }
  }
});

test('codexEnemies: one per 图鉴 number, no summon-only enemy, by number; bossEnemyKeys: the leader, then its escorts', () => {
  const list = codexEnemies(Object.values(enemies));
  assert.ok(list.length > 50);
  assert.ok(list.every((e) => !e.tokenOnly));
  const ids = list.map((e) => (e.handbookIndex ? `${e.handbookIndex}|${e.name}` : e.key));
  assert.equal(new Set(ids).size, ids.length);
  const boss = { enemyKey: 'a', escortsByTemplate: { t1: [{ key: 'b' }, { key: 'a' }], t2: [{ key: 'c' }, null] } };
  assert.deepEqual(bossEnemyKeys(boss), ['a', 'b', 'c']);
  assert.deepEqual(bossEnemyKeys(null), []);
});

test('the report is read-only and a full-screen Modal; the lobby opens it (source contract)', () => {
  const src = read('public/js/screens/sweep.js');
  assert.match(src, /<\$\{Modal\} open=\$\{true\} onClose=\$\{onClose\} class="sw"/);
  assert.match(src, /<\$\{Modal\} open=\$\{true\} onClose=\$\{onClose\} class="sw-codex"/);
  assert.doesNotMatch(src, /openLoadout|savePref\((?!TAB_PREF)|net\.|room\./, 'nothing but the remembered tab is written');
  assert.doesNotMatch(src, /name="box"|name="dice"/, 'only icons of the project\'s set');
  const lobby = read('public/js/screens/lobby.js');
  assert.match(lobby, /import \{ SweepReport \} from '\.\/sweep\.js';/);
  assert.match(lobby, /\$\{sweepOpen \? html`<\$\{SweepReport\} onClose=\$\{\(\) => setSweepOpen\(false\)\} \/>` : null\}/);
  assert.match(read('public/index.html'), /<link rel="stylesheet" href="\/css\/screens\/sweep\.css" \/>/);
  assert.match(lobby, /<\$\{SweepPlate\} onClick=\$\{\(\) => setSweepOpen\(true\)\} \/>/, 'the hub plate opens the report');
  assert.match(src, /localAsset\('ui\/handbook', hero \? 'img_left_bond_icon_bkg' : 'img_bond_item_bkg'\)/, 'the bond glyphs on the handbook\'s own discs');
  assert.doesNotMatch(src, /'img_bond_bkg'/, 'not the briefing\'s mint disc');
  const jobs = read('tools/local-extract/extract.py');
  assert.match(jobs, /\('activity\/\[uc\]act2autochess\.ab', 'ui\/handbook', \{'Sprite'\}, r'\^\(img_bond_item_bkg\|img_left_bond_icon_bkg\)\$'\)/, 'extracted from the event bundle');
});

test('the attack interval is graded by baseAttackTime as it is (the official handbook), also for an enemy whose attack speed is 0', () => {
  const zero = Object.values(enemies).find((e) => e.stats?.aspd === 0 && Number(e.stats?.bat) > 0);
  assert.ok(zero, 'an enemy with attack speed 0 is in the data');
  const src = read('public/js/screens/sweep.js');
  assert.match(src, /return key === 'atk' \? s\.atk \?\? 0 : s\.bat \?\? null;/);
  assert.notEqual(enemyGrade('interval', zero.stats.bat, LEVELS), '—', `${zero.key} bat=${zero.stats.bat}`);
});
