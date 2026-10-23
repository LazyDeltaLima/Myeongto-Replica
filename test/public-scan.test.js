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

test('client evidence that says how the client was read is refused', () => {
  const read = (text, opts) => scanText(text, [], opts).map((h) => h.line);
  assert.deepEqual(read([
    '(2026-10-23, 디컴파일 확인 — 10-14 EN 덤프)',               // 1
    '2026-10-16, decompile check — client `FunnelEffectEmitter`', // 2
    '클라 코드 `AbilityStandard.CastToTarget` → …',               // 3
    '`Enemy.States.MoveState.OnTick`(RVA 0x82E340)',             // 4
    'the field at dump.cs line 451030; Il2CppDumper',            // 5
    'movss xmm0, [rax+0x20]',                                     // 6
    '  // `_DoCastInternal` 0xC49C50 casts the first config',     // 7
    'const GOLDEN = 0x9E3779B9;',                                 // 8: a constant in code
    'tint: 0xFF6A4A, alpha 0.5',                                  // 9: a colour in code
    'shop slot 9 on the bench',                                   // 10
    '공식 클라에서 확인: `Unit.SwitchMode`가 옛 모드를 먼저 끈다', // 11
    '픽셀 셰이더(DXBC): uv.x > 1.003이면 `_Color2`',               // 12
    'names from global-metadata.dat, bodies from GameAssembly.dll', // 13
    'bundles read with UnityPy (docs/ASSETS.md)',                  // 14
  ].join('\n')), [1, 2, 3, 4, 5, 6, 7, 12, 13]);
  assert.deepEqual(read('`ScenePlayerData.AddBondCount`(0x856930)는', { prose: true }), [1]);
  assert.deepEqual(read('`ScenePlayerData.AddBondCount`(0x856930)는'), []);
});

test('SP_PUBLIC_SCAN_WORDS: literal entries case-insensitive, re: entries as written', () => {
  const words = scanWords({ SP_PUBLIC_SCAN_WORDS: 'Secret-Branch, re:dev\\.sh\\b ,, ' });
  assert.equal(words.length, 2);
  assert.deepEqual(whats('on secret-branch\nrun ./dev.sh\nlocal.shared = 1\ndev.shared = 2', words), ['1:private', '2:private']);
  assert.deepEqual(scanWords({}), []);
});
