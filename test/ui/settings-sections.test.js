// The settings modal in sections by function (maintainer decision 2026-10-14): 通用 (language, the resource download),
// 声音 (BGM / voice / SFX volumes, the voice language, mute), 聊天提示 (the chat notification rows), 画面 (damage numbers
// and their style, render quality, UI scale), then the 快捷键 and 问题反馈 sections that had their own heads already.
// Every section title is a source string with its English and Korean (and the ja / zh-TW packs that carry the settings).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

test('the settings rows sit in sections by function, in this order, before 快捷键 and 问题反馈', () => {
  const js = read('public/js/ui/settings.js');
  const body = js.slice(js.indexOf('export function SettingsModal('), js.indexOf('export function SettingsButton('));
  const at = (re) => { const m = body.match(re); assert.ok(m, String(re)); return m.index; };
  const sec = (id, title, micro) => at(new RegExp(`<\\$\\{SetSection\\} id="${id}" title=\\$\\{t\\('${title}'\\)\\} micro="${micro}">`));
  const order = [
    sec('general', '通用', 'GENERAL'), at(/t\('语言'\)/), at(/<\$\{ResourceSetting\} \/>/),
    sec('sound', '声音', 'SOUND'), at(/t\('背景音乐'\)/), at(/t\('干员语音'\)/), at(/t\('音效'\)/), at(/<\$\{VoiceSetting\} \/>/), at(/t\('静音'\)/),
    sec('chat', '聊天提示', 'CHAT ALERTS'), at(/<\$\{ChatSoundSection\} s=\$\{s\} \/>/),
    sec('display', '画面', 'DISPLAY'), at(/t\('显示伤害数字'\)/), at(/<\$\{NumberStyleSetting\} \/>/), at(/t\('画面质量'\)/), at(/<\$\{UiScaleSetting\} \/>/),
    at(/<\$\{HotkeySection\} /), at(/<\$\{DiagSection\} \/>/),
  ];
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'in this order');
  assert.match(js, /function SetSection\(\{ id, title, micro, children \}\) \{/);
  const css = read('public/css/screens/game.css');
  assert.match(css, /\.set-sec \{ display: flex; flex-direction: column; gap: \.16rem; padding-top: \.1rem; border-top: 1px solid var\(--line\); \}/);
});

test('the section titles are translated in every pack that carries the settings', () => {
  const titles = ['通用', '声音', '聊天提示', '画面'];
  for (const rel of ['public/i18n/en.json', 'public/i18n/ja.json', 'public/i18n/zh-TW.json', 'public/i18n/ko/ui.json', 'public/i18n/ko.json']) {
    const pack = JSON.parse(read(rel));
    for (const k of titles) assert.ok(typeof pack[k] === 'string' && pack[k].length > 0, `${rel}: ${k}`);
  }
  const ko = JSON.parse(read('public/i18n/ko.json'));
  assert.deepEqual(titles.map((k) => ko[k]), ['일반', '사운드', '채팅 알림', '화면']);
});
