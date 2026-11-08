// The hub, 同盟模拟's screen and 选择模拟协议 after the new-season polish (maintainer decision 2026-11-08,
// docs/rules/ui.md 「새 시즌 UI 다듬기 — 허브·연합 입구·협의 선택」): the 更新 card's main lines, the left column sized with the top
// bar's left group, the recent keys on one row, the season menu opening leftwards, 同盟模拟's create and join views, and
// 选择模拟协议's rules and cards as one group.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const EN = JSON.parse(read('public/i18n/en.json'));
const KO = JSON.parse(read('public/i18n/ko.json'));
const seg = (s) => [{ s }];

test('newsLines: the first change of each group, then the rest in order, without the 기여 group', async () => {
  const { newsLines } = await load('public/js/screens/lobby.js');
  const entry = { blocks: [
    { p: seg('summary') },
    { h: '전투' }, { ul: [seg('b1'), seg('b2'), seg('b3')] },
    { h: '새 기능' }, { ul: [seg('f1')] },
    { h: '이펙트' }, { ul: [seg('e1'), seg('e2')] },
    { h: '기여' }, { ul: [seg('c1')] },
  ] };
  const text = (lines) => lines.map((l) => l[0].s);
  assert.deepEqual(text(newsLines(entry, 4)), ['b1', 'f1', 'e1', 'b2']);
  assert.deepEqual(text(newsLines(entry, 3)), ['b1', 'f1', 'e1']);
  assert.deepEqual(text(newsLines(entry, 10)), ['b1', 'f1', 'e1', 'b2', 'b3', 'e2'], 'the credits never show');
  assert.deepEqual(newsLines({ blocks: [{ p: seg('only a paragraph') }] }, 4), []);
  assert.deepEqual(newsLines(null, 4), []);
});

test('hub: tips and 更新 as two cards on a desktop, tabs on a short screen; the join plate opens the join view', () => {
  const src = read('public/js/screens/lobby.js');
  assert.match(src, /<\$\{HubNotes\} short=\$\{shortScreen\} notes=\$\{notes\} onAll=\$\{setNotesFresh\} \/>/);
  assert.doesNotMatch(src, /TipsPanel/);
  const notes = src.slice(src.indexOf('function HubNotes('), src.indexOf('/** The hand-drawn ring'));
  assert.match(notes, /newsLines\(entry, short \? 3 : 4\)/);
  assert.match(notes, /data-testid="hub-tips"/);
  assert.match(notes, /data-testid="hub-news"/);
  assert.match(notes, /role="tablist"/);
  // 查看全部's 更新记录 dialog is drawn by the hub, after <main>: inside the left column (its own z-index layer) the right
  // column and the entry cards were drawn over it
  assert.doesNotMatch(notes, /PatchNotesModal/);
  assert.ok(src.indexOf('<${PatchNotesModal} open=${notesFresh !== null}') > src.indexOf('</main>', src.indexOf('<main class="hub-stage">')), 'the dialog after the hub stage');
  assert.match(src, /class="hub-plate--join"[^\n]*onClick=\$\{\(\) => setOpen\('join'\)\}/);
  assert.match(src, /<\$\{AllianceSelect\} view=\$\{open === 'join' \? 'join' : 'create'\}/);
  for (const k of ['较新的版本', '较早的版本']) {
    assert.ok(EN[k], `en: ${k}`);
    assert.ok(KO[k], `ko: ${k}`);
  }
});

test('同盟模拟: the create view has no join card, the join view no create card; the create button keeps its class', () => {
  const src = read('public/js/screens/lobby.js');
  const ally = src.slice(src.indexOf('export function AllianceSelect('), src.indexOf('function JoinBox('));
  const [joinView, createView] = ally.split("` : html`<section class=\"ally-side ally-side--create\"");
  assert.ok(createView, 'two views');
  assert.match(joinView, /ally-card--join/);
  assert.doesNotMatch(joinView, /ally-create__go|SizeSwitch/);
  assert.doesNotMatch(createView, /ally-card--join|TextField/);
  // the browser suites click '.ally-create__go' (inside [data-testid="alliance-create"]) to create a room
  assert.match(createView, /data-testid="alliance-create"/);
  assert.match(createView, /class="proto-start ally-create__go"[^>]*onClick=\$\{\(\) => onCreate\(\)\}>/);
  assert.match(createView, /<\$\{SeasonSwitch\} class="ally-form__row/);
});

test('lobby.css: the left column = the top bar group, one row of keys, the menu to the left, the protocol group', () => {
  const css = read('public/css/screens/lobby.css');
  assert.match(css, /\.lobby-hub \{[^}]*--hub-side-w: 4\.84rem/);
  assert.match(css, /\.lobby-hub > \.topbar \.topbar__left \{ width: var\(--hub-side-w\)/);
  assert.match(css, /grid-template-columns: minmax\(0, var\(--hub-side-w\)\) minmax\(0, 1fr\)/);
  assert.match(css, /\.hub-join \.join-foot \{[^}]*height: var\(--chip-h\);[^}]*overflow: hidden/);
  assert.match(css, /\.topbar__right \.season-menu \{ left: auto; right: 0; \}/);
  assert.match(css, /\.proto-side > :first-child \{ margin-top: auto; \}/);
  assert.match(css, /\.proto-side > \.proto-foot \{ margin-top: auto; \}/);
  assert.doesNotMatch(css, /\.proto-list > :first-child \{ margin-top: auto; \}/);
  // the phone keeps the left column where it fits beside the entries, its keys touch sized
  assert.match(css, /@media \(max-height: 520px\) and \(min-width: 760px\) \{[^@]*\.hub-side \{ display: flex;[^@]*--chip-h: 32px/);
  assert.doesNotMatch(read('public/css/devices.css'), /\.tips/);
});
