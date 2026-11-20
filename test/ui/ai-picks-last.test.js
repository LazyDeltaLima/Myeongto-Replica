// The room screen's 「AI 队友最后选择」 switch (GitHub #338; server: room.setAiPicksLast, room.state.aiPicksLast): co-op
// rooms only, the host toggles it, everybody else sees its state read-only; the texts go through t() with English in
// public/i18n/en.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/screens/room.js'), 'utf8');
const EN = JSON.parse(readFileSync(path.join(ROOT, 'public/i18n/en.json'), 'utf8'));
const mod = () => import(pathToFileURL(path.join(ROOT, 'public/js/screens/room.js')).href);

const room = (o = {}) => ({
  code: 'ABCD', hostId: 'h', mode: 'coop', difficulty: 'NORMAL', aiPicksLast: false,
  seats: [{ seat: 0, playerId: 'h', name: 'Host', isBot: false, ready: false, connected: true }, { seat: 1, playerId: 'g', name: 'G', isBot: false, ready: false, connected: true },
    { seat: 2, playerId: 'b2', name: 'AI', isBot: true, ready: true, connected: true }, null],
  ...o,
});

test('aiLastOption: hidden in solo, editable by the host only, the state from room.state (off when absent)', async () => {
  const { aiLastOption } = await mod();
  assert.equal(aiLastOption(room({ mode: 'solo' }), 'h'), null, 'solo: no AI teammates');
  assert.deepEqual(aiLastOption(room(), 'h'), { on: false, editable: true });
  assert.deepEqual(aiLastOption(room({ aiPicksLast: true }), 'h'), { on: true, editable: true });
  assert.deepEqual(aiLastOption(room({ aiPicksLast: true }), 'g'), { on: true, editable: false });
  assert.deepEqual(aiLastOption(room({ aiPicksLast: undefined }), 'g'), { on: false, editable: false }, 'an older server');
  assert.equal(aiLastOption(null, 'h'), null);
  // only while an AI teammate is seated (maintainer decision 2026-11-20): the first AI added shows it, the last removed
  // hides it; the setting stays the server's
  const noBot = room({ aiPicksLast: true });
  noBot.seats = noBot.seats.map((s) => (s?.isBot ? null : s));
  assert.equal(aiLastOption(noBot, 'h'), null, 'no AI seated');
  assert.equal(aiLastOption({ ...noBot, size: 8 }, 'h'), null);
});

test('the switch is as tall as the 观战席 count beside it (room.css: the same height rule)', () => {
  const css = readFileSync(path.join(ROOT, 'public/css/screens/room.css'), 'utf8');
  const height = (sel) => new RegExp(`${sel.replace(/\./g, '\\.')} \\{[^}]*height: (max\\(\\.3rem, 20px\\))`).exec(css)?.[1];
  assert.equal(height('.ailast__opt'), height('.specseats__btn'));
  assert.ok(height('.specseats__btn'));
});

test('room.js sends room.setAiPicksLast { on } and shows the switch through t(); en.json has the English', () => {
  assert.match(SRC, /net\.request\('room\.setAiPicksLast', \{ on \}\)/);
  for (const zh of ['AI 队友最后选择', '策略与机变轮选时，所有博士先于 AI 队友选择', '由创建者设置']) {
    assert.ok(SRC.includes(`t('${zh}')`), zh);
    assert.equal(typeof EN[zh], 'string', `en.json: ${zh}`);
    assert.ok(EN[zh].length > 0 && !/[一-鿿]/.test(EN[zh]), `English for ${zh}`);
  }
});
