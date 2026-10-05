# nas-local 로컬 패치 목록

`nas-local` 브랜치가 원본(`upstream` = sganggs/Stronghold-Protocol)과 다른 부분을 모두 정리한 문서다. 이 파일은 로컬에서만 만든 파일이라
원본을 병합해도 충돌하지 않는다. 패치를 넣거나 뺄 때 같이 고친다. 운영 절차는 `~/stronghold/STRONGHOLD.md`에 있다.

최종 갱신: 2026-10-05 (커밋 `d85f961` 기준)

## 원칙
- 로컬 코드는 **새 파일**에 둔다. 원본 파일에는 연결용 한 줄만 넣고 `// local NAS patch` 주석을 단다.
- 원본 import 줄에 이름을 덧붙이지 않는다. **별도 import 줄**을 쓴다.
- 원본 테스트 파일은 고치지 않는다. 우리 테스트는 모두 `test/local-patch.test.js`에 있다.
- 원본이 같은 문제를 고치면 로컬 패치를 뺀다. 아래 "원본이 고치면 뺄 것"에 있는 항목은 `test/local-patch.test.js`에 원본의 현재 동작을
  확인하는 테스트가 있어서, 원본 동작이 바뀌면 그 테스트가 실패한다.

## 기능별 목록

| 기능 | 로컬 파일 | 원본 파일에 넣은 연결 |
|---|---|---|
| 한국어 번역 (UI·데이터·공식 문구) | `public/js/i18n/*`, `public/i18n/ko/*`, `tools/i18n/*` | `main.js` import, `richText.js` `tr()`, `settings.js` 언어 선택, `lobby.js` 언어 버튼 |
| 협동 방 채팅 | `server/local-patch.js`, `shared/local.js`, `public/js/ui/chat.js`, `public/css/chat.css` | `server/lobby.js` 훅, `shared/protocol.js` 2줄, `screens/room.js`·`screens/game.js`, `store.js` 1줄, `index.html` |
| 채팅 진영 (8개국, 맹약 아이콘) | `shared/local.js`, `public/js/ui/faction.js` | `components.js` `AvatarFrame`의 `mark`, `gameComponents.js` 아바타 |
| `SP_MAX_BOTS` (방마다 AI 팀원 한도) | `server/local-patch.js` | `server/lobby.js` 훅, `screens/room.js` 한도 표시 |
| 이모티콘 공식/유저 탭 | `shared/emote-art.js`, `public/img/emotes/*` | `ui/emotes.js`(약 100줄, 가장 큰 수정), `emotes.css`, `gameActions.js`, `gameLogic.js`, `teamPanel.js`, `Match.js`·`StubMatch.js` 의 `set` |
| 리소스 미리 받기 | `public/js/resources.js`, `public/resource-worker.js`, `tools/build-browser-resources.mjs`, `public/css/resources.css` | `main.js`, `settings.js`, `index.html` |
| iframe 차단 헤더 | — | `server/index.js` 3줄 |
| 나가기 창에서 「暂离（AI 托管）」 숨김 | — | `ui/matchChrome.js` (`AWAY_OPTION = false`) — 나가면 자리를 포기한다 |
| 맹약 스택 세 자리 줄바꿈 수정 | `public/i18n/ko/ko.css` | — |
| 협동 보스 HP = `bloodPoint` × 생존 인원 | `server/local-patch.js` (`GameData.prototype.bossPoolShare`를 감쌈) | 없음 (`lobby.js`가 이미 import) |
| 제국의 갑주 등장 폭격·3연타 PRTS 수치 | `server/sim/content/local-patch.js` | `server/sim/content/index.js` 1줄 (`DOMAIN_NAMES.push`) |
| 胄 드론 연동 피해를 限伤에서 제외 | `server/sim/content/local-patch.js` | 위와 같음 |

`server/sim/content/local-patch.js`는 시뮬레이션 모듈이라 서버와 브라우저(클라이언트가 돌리는 보스·히든 전투) 양쪽에서 실행된다.
`server/local-patch.js`는 서버 전용이다.

## 게임 수치 수정 상세 (2026-10-05)

### 협동 보스 HP
- 원본: 협동은 인원과 관계없이 `bloodPoint[난이도]` 하나, 싱글은 ×0.25. 공식 데이터·PRTS에 인원 계수는 없다(원본 이슈 #113, PR #126 모두 근거 없음을 인정).
- 로컬: 협동 = `bloodPoint` × 최종 공세/히든 코어 시작 때 살아 있는 인원(1~4). 싱글은 원본 그대로.
  - 나간 사람은 서버가 탈락 처리하므로(`Match.onLeave` → `_quit`) 세지 않는다. HP가 0이 돼 탈락한 사람도 빠진다. AI 팀원은 센다.
  - 보스전 도중에 나가도 이미 정해진 풀은 줄지 않는다.

### “帝国的甲胄” (제국의 갑주, `enemy_10027_vtsk`)
- 출처: PRTS 「“帝国的甲胄”」.
- 등장 폭격(回忆里的誓死): 등장 때 전장에서 체력이 가장 높은 아군 위치에 3×3 구역(5.85초). 1.33초 뒤부터 0.53초마다 구역 안의 체력이 가장
  높은 아군 1명에게 공격력 100% 물리 피해, 최대 8번. 원본은 0.5초 뒤 같은 틱에 8발을 모두 넣었다.
- 3연타(回忆里的怒守): 막혔을 때만 발동, 근접 3타 각 100%. 원본은 15초 쿨다운마다 원거리 공격에도 붙었다.
- PRTS에 없는 부분 [추정]: 제국의 갑주가 죽으면 남은 폭격도 멈춘다.

### 假想敌：胄 드론 연동과 限伤
- 드론이 죽으면 리더가 HP 풀의 2%를 잃는다. 원본의 限伤(리더에게 300,000 이상 들어가는 한 방은 무효)에 걸려, 풀이 15,000,000을 넘으면
  드론을 잡아도 아무 일이 없었다. 위의 보스 HP 수정으로 절경 히든 胄 3~4인에서 그렇게 된다.
- 로컬: 胄 드론의 사망 처리 중에 리더가 받는 한도 이상 손실은 한도 아래 조각으로 나눠 넣는다(합계·공로 동일). 다른 공격은 그대로 限伤이 적용된다.

## 원본이 고치면 뺄 것
- 제국의 갑주 폭격·3연타 → `server/sim/content/local-patch.js`의 `patchVtsk`
- 협동 보스 HP 인원 배율 → `server/local-patch.js`의 `bossPoolShare` 감싸기 (원본이 인원 배율을 넣으면 이중으로 곱해진다)
- 드론 限伤 예외 → `exemptDroneLink` (원본이 보스 HP를 바꾸거나 限伤 규칙을 바꾸면 다시 판단)
- 채팅·관전석 등은 원본에 같은 기능이 생기면 비교해서 정리

## 테스트
- `node --test test/local-patch.test.js` — 로컬 테스트 21개.
- 전체 `node --test`에서 원래부터 실패하는 것 (이 개발 사본에 게임 소재가 없음): 소재 manifest·로컬 추출·모듈 아이콘·이모티콘 그림 관련,
  `make-windows-bundle` 대소문자 검사. 2026-10-05 기준 12개.
- 로컬 패치 때문에 실패하는 원본 테스트 (의도한 동작 변경이라 고치지 않음):
  - `test/sim/feedback1f-liftoff.test.js` 「F3 review … “帝国的甲胄” barrage」: 1.5초 안에 8발을 기대한다.
  - `test/sim/playtest6_limits.test.js` 「限伤 vs 【死亡集群】」: 풀이 크면 드론 피해가 무효이길 기대한다.
