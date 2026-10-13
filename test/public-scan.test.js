// test/public-scan.test.js — tools/public-scan.mjs: the phrases it refuses, the ones it must let through (upstream's
// own wording, dates, the game's 决定/决策 texts), and SP_PUBLIC_SCAN_WORDS (literal and `re:` entries). The sample
// lines below are fixtures: test/public-repo.test.js skips this file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanText, scanWords } from '../tools/public-scan.mjs';

const whats = (text, words = []) => scanText(text, words).map((h) => `${h.line}:${h.what.split(' ')[0]}`);

test('work-process phrases are refused', () => {
  assert.deepEqual(whats([
    'kept (user decision 2026-10-09)',          // 1
    'User decisions 2026-10-07 「…」',          // 2
    '사용자 결정 2026-10-11로 받음',             // 3
    '화면 확인은 메인 세션.',                    // 4
    'claimed by stronghold-e8 at start',        // 5
    '사전 논의: 세션 33f2c5 참고',               // 6
    '관리자 결정 D10으로 받음',                  // 7
    'maintainer decision 2026-10-09 #3',        // 8
  ].join('\n')), ['1:write', '2:write', '3:「관리자', '4:a', '5:a', '6:a', '7:no', '8:no']);
});

test('upstream wording, dates and game texts pass', () => {
  assert.deepEqual(scanText([
    'the owner\'s decision of 2026-10-06',
    'the user\'s settled decisions (2026-10-01)',
    'maintainer decision 2026-10-12; 관리자 결정 2026-10-11 (D1 공식 데이터 갱신)',
    'user request "接下来加漏怪的音效"',
    'sganggs/Stronghold-Protocol, stronghold-protocol-alliance, Stronghold-Protocol_Ko',
    '전투 중 플레이어 결정 대기(전략 차례 50 s)',
    'D1과의 관계: 새 표에도 풀 수 필드는 없어 영향 없음',
  ].join('\n')), []);
});

test('SP_PUBLIC_SCAN_WORDS: literal entries case-insensitive, re: entries as written', () => {
  const words = scanWords({ SP_PUBLIC_SCAN_WORDS: 'Secret-Branch, re:dev\\.sh\\b ,, ' });
  assert.equal(words.length, 2);
  assert.deepEqual(whats('on secret-branch\nrun ./dev.sh\nlocal.shared = 1\ndev.shared = 2', words), ['1:private', '2:private']);
  assert.deepEqual(scanWords({}), []);
});
