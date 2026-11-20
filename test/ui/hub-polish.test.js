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
  assert.match(src, /\$\{open === 'join' \? html`<\$\{AllianceSelect\} onClose=/);
  for (const k of ['较新的版本', '较早的版本']) {
    assert.ok(EN[k], `en: ${k}`);
    assert.ok(KO[k], `ko: ${k}`);
  }
});

test('同盟模拟 opens 选择模拟协议 (规则, 人数, cards, 创建同盟; no 赛季 row); AllianceSelect is the join card alone', () => {
  const src = read('public/js/screens/lobby.js');
  const ally = src.slice(src.indexOf('export function AllianceSelect('), src.indexOf('function JoinBox('));
  assert.match(ally, /ally-card--join/);
  assert.doesNotMatch(ally, /ally-create__go|SizeSwitch|SeasonPick|onCreate/);
  assert.match(src, /\$\{open === 'solo' \|\| open === 'match' \|\| open === 'coop' \? html`<\$\{ProtocolSelect\} roomMode=\$\{roomMode\}/);
  assert.match(src, /onSize=\$\{roomMode === 'solo' \? null : pickSize\}[^>]* \/>/);
  // room.create carries what the dialog picked
  assert.match(src, /\{ mode: roomMode, \.\.\.gradeFields, ruleset: roomRuleset, \.\.\.sizeFields\(roomMode, big \? LARGE_SEATS : MAX_SEATS\), \.\.\.seasonFields\(season\), \.\.\.publicField \}/);
  // no 赛季 row (maintainer decision 2026-11-13): the lobby's chip is the one place a season is picked
  const rules = src.slice(src.indexOf('export function ProtoRules('), src.lastIndexOf('/**', src.indexOf('export function CustomBrief(')));
  assert.doesNotMatch(rules, /proto-season|SeasonPick|t\('赛季'\)/);
  assert.match(rules, /data-testid="proto-rules">\s*<span class="proto-rules__row">\s*<\$\{RowKey\} text=\$\{t\('规则'\)\} \/>/);
  // the browser suites click '.ally-create__go' to create a room: 创建同盟's start button keeps it, the room's 确认 not
  const select = src.slice(src.indexOf('export function ProtocolSelect('), src.indexOf('export function AllianceSelect('));
  assert.match(select, /class=\$\{`proto-start\$\{roomMode === 'coop' && !action \? ' ally-create__go' : ''\}`\}/);
  assert.match(read('public/js/screens/room.js'), /<\$\{ProtocolSelect\} roomMode=\$\{protoMode\}[\s\S]{0,400}?action=\$\{t\('确认'\)\}/);
  const season = read('public/js/ui/season.js');
  assert.doesNotMatch(season, /export function SeasonPick/);
  assert.doesNotMatch(season, /SeasonSwitch/);
});

test('lobby.css: the left column = the top bar group, one row of keys, the menu to the left, the protocol group', () => {
  const css = read('public/css/screens/lobby.css');
  assert.match(css, /\.lobby-hub \{[^}]*--hub-side-w: 4\.84rem/);
  assert.match(css, /\.lobby-hub > \.topbar \.topbar__left \{ width: var\(--hub-side-w\); min-width: max-content;/);
  // the ping / online pills stay one line: the Korean pack's overflow-wrap: anywhere broke 「ms」 / 「접속」 a letter per
  // line when the touch layout's tool buttons overflowed the group
  const ping = read('public/css/components.css').match(/\n\.ping \{[^}]*\}/)?.[0] ?? '';
  assert.match(ping, /white-space: nowrap;/);
  assert.match(ping, /flex-shrink: 0;/);
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

test('选择模拟协议: 快速匹配 is the official range switch over the start button; 规则 / 人数 are range tracks; 自定义 in the brief', async () => {
  const src = read('public/js/screens/lobby.js');
  const rules = src.slice(src.indexOf('export function ProtoRules('), src.lastIndexOf('/**', src.indexOf('export function CustomBrief(')));
  assert.doesNotMatch(rules, /快速匹配|qswitch|proto-rules__sum|CustomSummary/, 'the rule rows hold 规则 and 人数 only');
  assert.equal((rules.match(/class="proto-rules__seg rtrack"/g) || []).length, 4, '规则, 同盟匹配\'s 人数, a room\'s 人数 and a new room\'s 公开 (no 赛季 row since 2026-11-13)');
  const select = src.slice(src.indexOf('export function ProtocolSelect('), src.indexOf('export function AllianceSelect('));
  // the official order under the cards: the tips line, the range switch, the button
  assert.match(select, /<p class="proto-hint">[\s\S]*?<\/p>\s*\$\{range\}\s*<button type="button" class=\$\{`proto-start/);
  assert.match(select, /<\/div>\s*\$\{brief\}\s*<\/div>/, 'the brief ends with the custom line');
  assert.match(src, /range=\$\{matching \? html`<\$\{QuickRange\} quick=\$\{quick\} onQuick=\$\{pickQuick\} \/>` : null\}/);
  const quick = src.slice(src.indexOf('export function QuickRange('), src.indexOf('/**', src.indexOf('export function QuickRange(')));
  assert.match(quick, /role="switch" aria-checked=\$\{quick \? 'true' : 'false'\}/);
  assert.match(quick, /side\('wide', 'wide_icon', t\('快速匹配'\), quick\)/);
  assert.match(quick, /side\('exact', 'accurate_icon', t\('精准匹配'\), !quick\)/);
  assert.match(quick, /\$\{on \|\| !src \? html`<span class="qrange__name">/, 'the other side shows its name only without its icon');
  for (const k of ['精准匹配', '寻找同一难度、规则和人数的公开联合与博士']) {
    assert.ok(EN[k] && KO[k], `${k} translated`);
  }
  assert.match(read('public/js/screens/room.js'), /brief=\$\{html`<\$\{CustomBrief\} roomMode=\$\{protoMode\} ruleset=\$\{proto\.ruleset\}/);
  assert.match(read('public/js/screens/achievements.js'), /<\$\{RulesetSwitch\} value=\$\{ruleset\}[^>]*class="rtrack" \/>/);
  const room = read('public/css/screens/room.css');
  assert.match(room, /\.dpick\.rtrack \{[^}]*border-radius: 999px/);
  assert.match(room, /\.rtrack \.dpick__opt\.is-active \{[^}]*background: var\(--mode-pill\)/, 'the rule rows take the hub switch\'s plain pill (btn_mode_select), not the hatched range pill');
  assert.match(room, /--mode-pill: rgba\(255, 255, 255, \.8\)/);
  assert.match(read('public/css/screens/lobby.css'), /\.qrange__pill \{[^}]*background: var\(--rtrack-pill\)/, '快速匹配 keeps the range switch\'s hatched pill');
  const css = read('public/css/screens/lobby.css');
  assert.match(css, /\.proto-rules \{[^}]*margin: 0 \.06rem \.02rem \.5rem; padding: \.02rem 0 \.04rem;/, 'the rows\' box is the cards\' column (.proto-list pads .5rem / .06rem)');
  assert.match(css, /\.proto-list \{[^}]*padding: \.07rem \.06rem \.07rem \.5rem;/);
  assert.match(css, /\.qrange__pill \{[^}]*width: 74%/);
  const { UI_EXTRAS } = await load('tools/assets/plan.mjs');
  for (const k of ['wide_icon', 'accurate_icon']) assert.ok(UI_EXTRAS.some(([g, n]) => g === 'room' && n === k), `${k} planned`);
});
