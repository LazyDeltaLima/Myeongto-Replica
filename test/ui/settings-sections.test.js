// The settings modal in tabs by function: the sections of maintainer decision 2026-10-14 — 通用 (language, the resource
// download), 声音 (BGM / voice / SFX volumes, the voice language, mute), 聊天提示 (the chat notification rows), 画面 (damage
// numbers and their style, render quality, UI scale) — then 快捷键 and 问题反馈, one tab each (2026-10-24: the list had
// grown long). Every tab title is a source string with its English and Korean (and the ja / zh-TW packs that carry the
// settings).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

test('the settings rows sit in tabs by function, in this order, the panel of the chosen tab only', () => {
  const js = read('public/js/ui/settings.js');
  assert.match(js, /const SETTINGS_TABS = \[\['general', N_\('通用'\)\], \['sound', N_\('声音'\)\], \['chat', N_\('聊天提示'\)\], \['display', N_\('画面'\)\],\n  \['keys', N_\('快捷键'\)\], \['diag', N_\('问题反馈'\)\]\];/);
  const body = js.slice(js.indexOf('export function SettingsModal('), js.indexOf('export function SettingsButton('));
  const at = (re) => { const m = body.match(re); assert.ok(m, String(re)); return m.index; };
  const panel = (id) => at(new RegExp(`\\$\\{tab === '${id}' \\? html\`<\\$\\{SetPanel\\} id="${id}">`));
  const order = [
    at(/<\$\{Tabs\} class="set-tabs" size="sm" value=\$\{tab\} onChange=\$\{setTab\}/),
    panel('general'), at(/t\('语言'\)/), at(/<\$\{ResourceSetting\} \/>/),
    panel('sound'), at(/t\('背景音乐'\)/), at(/t\('干员语音'\)/), at(/t\('音效'\)/), at(/<\$\{VoiceSetting\} \/>/), at(/t\('静音'\)/),
    panel('chat'), at(/<\$\{ChatSoundSection\} s=\$\{s\} \/>/), at(/t\('常驻最近 3 条消息'\)/),
    panel('display'), at(/t\('显示伤害数字'\)/), at(/<\$\{NumberStyleSetting\} \/>/), at(/t\('画面质量'\)/), at(/t\('对局通知'\)/), at(/<\$\{UiScaleSetting\} \/>/),
    panel('keys'), at(/<\$\{HotkeySection\} /), panel('diag'), at(/<\$\{DiagSection\} \/>/),
  ];
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'in this order');
  assert.match(js, /function SetPanel\(\{ id, children \}\) \{/);
  assert.match(js, /let lastTab = 'general';/, 'the modal reopens on the tab left last');
  const css = read('public/css/screens/game.css');
  assert.match(css, /\.set-sec \{ display: flex; flex-direction: column; gap: \.16rem; min-height: min\(5\.2rem, 50vh\); \}/);
});

test('the tab titles are translated in every pack that carries the settings', () => {
  const titles = ['通用', '声音', '聊天提示', '画面'];
  for (const rel of ['public/i18n/en.json', 'public/i18n/ja.json', 'public/i18n/zh-TW.json', 'public/i18n/ko/ui.json', 'public/i18n/ko.json']) {
    const pack = JSON.parse(read(rel));
    for (const k of titles) assert.ok(typeof pack[k] === 'string' && pack[k].length > 0, `${rel}: ${k}`);
  }
  const ko = JSON.parse(read('public/i18n/ko.json'));
  assert.deepEqual(titles.map((k) => ko[k]), ['일반', '사운드', '채팅 알림', '화면']);
  // 快捷键 / 问题反馈 had their own heads before the tabs: in the packs that carry them (ja / zh-TW fall back to English)
  for (const rel of ['public/i18n/en.json', 'public/i18n/ko.json']) {
    const pack = JSON.parse(read(rel));
    for (const k of ['快捷键', '问题反馈']) assert.ok(typeof pack[k] === 'string' && pack[k].length > 0, `${rel}: ${k}`);
  }
});
