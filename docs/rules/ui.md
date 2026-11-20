# 화면 UI

## 디자인 원칙 (관리자 결정 2026-11-20)

UI를 만들거나 고치는 사람이 모두 같은 기준으로 만들게 하려고 정한 원칙이다. 만드는 사람마다 결과가 달랐고, 같은 지적(정렬, 높이, 부품 재사용, 색)이 매번 관리자에게서 나왔다. 이미 있는 화면은 그 화면을 고칠 때 이 원칙에 맞춘다(관리자 결정 2026-11-20: 한꺼번에 소급하지 않음).

### 부품을 만드는 세 단계

부품(판·단추·꼬리표·아이콘·목록 칸)마다 아래에서 먼저 맞는 단계를 고른다. 시안 설명과 PR 설명에는 부품마다 단계와 근거(프리팹·노드 이름 또는 따른 우리 부품)를 적는다.

1. **공식 프리팹을 쓴다.** 그 화면·부품에 맞는 공식 프리팹이 있고, 위수협의가 실제로 그 프리팹을 쓰는 경우다(바깥 화면 `autochessouter`, 전투 `autochessbattle`, 공용 `autochesscommon`, 시즌 테마 묶음). 그 스프라이트와 프리팹 숫자를 그대로 쓴다.
   - 크기·자리·글자 크기·색·정렬은 `tools/local-extract/ui_inspect.py layout` 값을 `--ui-u` 단위(공식 1280×720 캔버스의 1단위, `css/hud-art.css` 머리)로 옮긴다. 눈대중이나 머리로 푼 RectTransform 값은 쓰지 않는다.
   - 스프라이트의 9-slice 테두리와 preserveAspect는 프리팹 그대로 둔다. 웹 PNG는 투명 여백을 잘라 낸 텍스처라서 sprite rect와 텍스처 크기를 비교해야 한다(`ui_inspect.py sprites`).
   - 흰 스프라이트는 바탕으로 깔지 않는다. 프리팹 Image의 색을 입히거나 `mask-image`로 쓴다.
2. **비슷한 공식 부품을 CSS로 옮긴다.** 그 화면이 공식에 없거나 그 부품이 공식 화면에 없지만, 같은 역할의 공식 부품이 있는 경우다. 그 부품의 치수·색·글자·그림자를 CSS로 옮긴다.
   - 찾는 순서는 같은 묶음의 다른 화면 → 위수협의의 다른 묶음 → 게임 공용 UI다.
   - 아이콘은 공식 스프라이트를 `mask-image`로 빌린다.
   - 본보기: 협의 선택의 규칙·인원 줄 `.rtrack`(`css/screens/room.css`)은 공식 난이도 선택 창의 매칭 범위 스위치(`range_bg`·`range_selectbg`)를 옮긴 것이다.
3. **우리 CSS를 따른다.** 참조할 공식 부품도 없는 경우다. 우리 공용 부품(`js/ui/components.js`의 `Button`·`Icon` 등, `css/components.css`)과 `css/theme.css` 토큰을 쓰고, 가장 가까운 우리 화면 하나를 정해 크기·간격을 따른다.
   - 새 색, 새 단추 모양, 새 그림자는 만들지 않는다. 꼭 필요하면 토큰을 먼저 더한다.

모든 단계에 공통: 공식 그림은 선택 자료다(`public/assets/`는 git 밖, DESIGN §13). 1단계로 만든 부품도 그림이 없을 때는 2·3단계 CSS로 같은 자리와 크기가 나와야 한다. 그림은 그림이 있을 때만 붙는 상위 클래스(`.has-hud-art` 등, `js/ui/hudArt.js`) 아래에서 얹는다.

### 같이 지키는 것

- **있는 부품을 먼저 쓴다.** 같은 개념은 모든 화면에서 같은 부품으로 그린다(장비 알약, 박사 이름 뒤 「#번호」 `doctorNo`, 나가기 단추, 범위 트랙). 새로 그리기 전에 다른 화면에 같은 것이 있는지 찾는다. 지난 지적: 팀원 정보 창의 장비 알약을 새로 그림, 대기실 나가기 단추가 브리핑의 단추와 다름.
- **맞춤선을 맞춘다.**
  - 한 판 안의 왼쪽 시작선은 하나만 둔다.
  - 나란한 단추·카드는 높이를 맞추고, 같은 역할이면 폭도 맞춘다(`grid` `1fr 1fr`).
  - 다른 곳의 폭과 같아야 하는 폭은 변수 하나로 묶는다(본보기 `--hub-side-w`).
  - 패딩은 위아래·좌우를 대칭으로 둔다.
- **색을 아낀다.** 공식 바깥 화면은 어두운 평면에 강조색 하나다.
  - 색은 뜻이 있을 때만 쓴다: 민트는 고름·진행, 금색은 값, 빨강은 위험·끝내기, 등급 색은 등급에만.
  - 항목마다 다른 색 바탕, 알약 속 알약, 그라데이션·빛 번짐, 이모지 아이콘은 쓰지 않는다(관리자 지적 2026-11-08, 배지가 「생성형 AI 느낌」).
  - 아이콘은 공식 스프라이트를 먼저 쓰고, 없으면 우리 SVG 아이콘(`Icon`)을 쓴다.
- **글자가 잘리지 않게 한다.**
  - 가장 긴 언어(한국어·영어)로 확인한다.
  - 짧은 낱말이 든 가로 줄은 `white-space: nowrap`을 준다(아래 「한국어 줄바꿈」).
  - 넘치는 글은 그 부분에만 스크롤을 둔다. 그림·이름·단추까지 한 스크롤 상자에 넣지 않는다.
- **상태를 다 정한다.** 기본·hover·눌림·고름·꺼짐을 모두 정한다. 공식에 고름·꺼짐 스프라이트가 있으면 그것을 쓴다(1단계).
- **휴대폰에서 겹치지 않게 한다.** 가로 휴대폰(844×390 등)에서 부품이 서로 겹치지 않아야 한다.
  - 터치 화면에서 누르는 칸은 44×44 CSS px 이상이다(`css/devices.css` `--tap-min`). 근거는 Apple HIG 44pt와 WCAG 2.5.5의 44px이다.
  - 보이는 크기는 공식대로 두고, 보이지 않는 터치 영역(`devices.css` 「touch targets」 목록이나 `.tapx`)으로 넓힌다.
  - 터치 영역이 이웃 단추 위로 넘어가지 않게 넓힐 방향(`--tap-w`·`--tap-h`·`--tap-top`…)을 정한다(아래 「휴대폰 화면 조정」).
- **숫자로 확인한다.** `tools/ui-check.mjs measure`(잘린 글자, 이웃 칸 높이, 가운데 맞춤, 패딩 대칭, 깨진 그림, 터치 칸)를 돌리고, 공식 화면이나 시안이 있으면 `compare`도 돌린다.
  - 터치 칸 검사는 spec의 `touch: true` 보기마다 저절로 돈다. `roots` 아래 누르는 요소(button·a·input·select·`[role=button|switch|tab|…]`·`.tapx`)의 터치 영역이 가로나 세로로 `--tap-min`보다 작으면 실패다. 터치 영역은 자기 상자와 절대 배치 `::before`·`::after`를 합치고, 그것을 자르는 조상의 `overflow`로 자른 것이다(화면 가장자리는 자르지 않음). 스크롤 목록에 반쯤 가려 작은 것은 `scroll`로 따로 낸다.
  - 알고 두는 것은 spec `tap.except`에 `{ sel, why }`로 적는다. 이웃 단추와 겹치는지는 이 검사가 아니라 `test/ui/devices.e2e.test.js`가 본다.

## 전투 포기 (관리자 결정 2026-11-18, PR #21)

- 전투 중 준비완료와 동일한 우측 상단 자리에 「전투 포기」. 준비완료 단축키로는 실행하지 않는다.
- 개인 전장은 확인창을 거쳐 이번 내 전투만 포기한다. AI와 함께 싸우는 전장에 사람 한 명만 남은 경우도 확인창을 쓴다.
- 공동 전장은 해당 전장에 참여하는 사람 전원 동의. AI·AI 위임 중인 자리·관전자·다른 전장의 플레이어는 투표하지 않는다.
  배너는 재시작 투표와 같은 공용 부품 `MatchVoteBanner`(`ui/restartVote.js`, 제목·설명·아이콘·`onVote`를 받음)라 디자인이 같다(금색 배너·참여자 아이콘·동의 수·남은 시간·반대/동의·제안자 취소).
  투표 중 전투는 계속하고, 반대·30초 만료·취소·접속 끊김·투표자 구성 변경 시 포기하지 않는다. 리방 투표와 겹치면 그 아래 줄에 표시한다.
- 살아 있는 적과 아직 등장하지 않은 적을 누수로 처리하며, 이미 얻은 처치·자금·층수는 보존한다. 연합방어와 생명 차감은 기존 규칙을 따른다.
  보스전도 동의한 전장만 종료한다. 다른 전장은 계속 싸우며, 공유 보스/생명 및 최종 승패 규칙은 그대로 적용한다.
- 경기 규칙(투표자·누수·연합 방어·보스 전장)은 `sim.md` 「전투 포기」.
- 구현: `ui/surrender.js`, `match/surrender.js`. 브라우저 확인: `test/ui/surrender.e2e.test.js`(개인 확인/취소·공동 동의/반대/취소·전장 외 인원·폰 배치·리방 동시 표시).

옛 `docs/LOCAL-PATCH.md`에서 2026-10-09에 나눈 파일이다. 옛 절 이름은 `docs/LOCAL-PATCH.md` 색인에서 찾는다.
본문의 「캡처 N」·「KR 캡처 N」·「이미지 N」은 관리자가 준 공식 화면 캡처 묶음(비공개)의 번호다.

## 콘솔 모드 (2026-11-15; 옛 「게임 내 디버그 패널」 2026-10-06을 합침)
단독 시뮬레이션에서만 켜는 게임 안 콘솔(관리자 요청·결정 2026-11-15). 옛 로컬 디버그 패널을 넓혀 합쳤고(관리자 결정 2026-11-15: 로컬 디버그
모드에선 협동 방에서도 같은 콘솔 패널), 운영 서버에서도 누구나 단독 방에서 켠다. 공식 게임에 없는 기능이다.
- **켜기**: 단독 대기실 「오퍼레이터 설정」(`LoadoutButton`) 오른쪽 「콘솔 모드」 버튼(같은 모양, 켜면 주황, `ui/consoleToggle.js`) → `room.setConsole { on }`
  (`server/local-patch.js setConsole`: 단독 방의 자기 자리만, 판 시작 전만, 협동 방은 `BAD_TARGET`). 방 상태 `room.state.console`(방의 다음 판들에도
  남음, 서버를 옮기는 대기실 인계 `roomSnapshot`/`adoptRoom`도 들고 감). 켜면 브리핑에 한 줄, 위 「1인 전용」 옆에 「CONSOLE」. 규칙(클래식·캐주얼·
  사용자 지정)과 따로 켠다. 판 시작 때 `localPatch.onMatchCreate`가 `match.console = true`(판 동안 고정, 판 도중 켜고 끄기 없음).
- **누가 쓰나** (`server/local-console.js consoleAllowed`·`consoleIntent`, 문 하나): 콘솔 판의 사람 자리, 또는 로컬 디버그 모드의 모든 사람 자리.
  그 밖의 `con.*`는 `BAD_MSG`(서버는 패널을 믿지 않음). **로컬 디버그 모드** = `SP_DEBUG_PAGE=1` 또는 올바른 `SP_DEBUG_FUNDS`(0..999), 그리고
  `NODE_ENV`가 `production`이 아닐 때(`debugMode`; Docker 이미지는 `NODE_ENV=production`이라 배포 서버는 절대 아님). `SP_DEBUG_FUNDS` 재화 고정도 이 조건.
- **화면에 보내는 것**: 그 자리에만 `m.private.console = { console, fundsPin, pinValue, candidates, enemies, boss, rounds, layers, layersEdited,
  layersBase, layerCap, note }`, 콘솔 판이면 `m.public.console = true`(기록 제외에 씀; HUD 난이도 아래 「CONSOLE」 표시는 없앰 — 패널이 표시, 관리자 결정 2026-11-15).
- **명령** (`shared/local.js` C2S, 처리는 `consoleIntent` 한 곳; 정비 단계만인 것은 준비 완료 뒤에도 됨):
  - `con.funds { on }` 재화를 `SP_DEBUG_FUNDS`(없으면 99)로 고정 / 실제 재화로(그 값에서 이어감). 플레이어별 `ps.debugFundsPin`, 봇은 항상 실제 재화.
    기본은 꺼짐(관리자 결정 2026-11-15): `SP_DEBUG_FUNDS`를 주고 서버를 띄울 때만 시작부터 고정된다.
    `funds` 접근자는 처음 고정할 때(또는 시작 때 `SP_DEBUG_FUNDS`가 있으면) 설치된다 — 그 전 서버 경로는 원본 그대로.
  - `con.addChess { chessId, golden? }` `data/chess.json`의 일반 기물(숨김 포함; 선발 칸·정예 id는 거부)을 `acquireChess(…, { source: 'grant', fromPool: false })`로
    정비 구역에. 정비 구역이 차면 합성이 되는 경우가 아니면 `HAND_FULL`. 풀 복사본을 쓰지 않지만 3장 합성이면 `_mergeChess`가 정예 몫을 풀에서 채운다(모든 합성과 같음).
  - `con.addDiy { charId, tier, golden?, skill?, module? }` 선발 후보(`debugCandidates`, 맹약 필터용 `bonds` 포함) V·VI. 그 티어에서 같은 오퍼레이터의 칸 →
    빈 칸 → 기물이 하나도 없는 칸 순으로 고르고(`debugDiySlot`), 그 칸 하나만 `checkDiyPicks`로 검사해 픽을 넣는다(`debugSetPick`; 「소유한 오퍼레이터는 한 칸」
    규칙을 적용하지 않아 같은 오퍼레이터가 두 티어에 설 수 있다). 두 칸 모두 기물을 가진 오퍼레이터면 거부, 패널은 서버 `detail`을 `diySlotsFullOf`로 읽어
    이름과 함께 토스트(관리자 요청 2026-10-11). 스킬 0–2, 모듈은 정예 형태의 모듈 또는 `none`.
  - `con.addItem { itemId, golden? }` 장비(「강화」면 강화형)를 `acquireItem(…, { noPool: true })`로 — 공유 장비 재고를 쓰지 않고(특질 고정 장비와 같은 표시),
    정비 구역(규정은 장비 구역)이 차면 합성이 되는 경우가 아니면 `HAND_FULL`.
  - `con.addEnemy { enemyKey, count? }`(1–20) 보낸 사람의 **다음 전투**에 그 적을 더 넣는다: 0코인·1전투 현상 수배(`Match.addBounty`, `debugEnemies`)라
    공식 추가 적(悬赏)과 같은 길 — 템플릿 첫 보행/비행 행동에 끼움(`waves.js bountyPlan`), 라운드 배율, 敌情 미리보기·효과 목록(「DEBUG」), 그 전투 정산이 지움.
    토큰 전용 적은 거부. `con.clearEnemies { enemyKey? }` 대기 중인 것 전부 / 그 적만 지움.
  - `con.jumpRound { round }` 1..마지막 라운드(히든 코어가 있는 판은 히든 코어 라운드, 없으면 최종 공세) 어느 라운드든 앞뒤로 바로 그 라운드 시작으로
    (`Match.startRound`). 가진 것은 그대로, 리더 라운드 상태(팀 생명·리더 풀·종료 표시·초과 시간)는 지우고, 히든 코어 라운드로 가면 `hiddenReached`.
    그 사이 라운드의 수입·결정·전투는 건너뛴다. 결정 라운드로 가면 그 결정이 열린다. 뒤로 가도 상점 레벨·업그레이드 가격·쌓인 카운터는 그대로
    이어간다(공식에 없는 기능; 도착한 라운드의 수입은 받는다).
  - `con.presetBoard { bondId?, layers }` 완성 보드(관리자 결정 2026-11-15 안 A: 라운드 이동과 따로): 지금 정비 단계에서 살아 있는 모든 자리(AI 포함)의
    기물을 돌려보내고 맹약 하나 중심 보드를 넣는다(`server/local-debug-board.js`): 그 맹약의 상점 기물을 높은 티어부터 배치 인원 안의 가장 높은 발동
    단계까지, 남는 칸은 저지 2·치료 1·대공 1 → 맹약 공유 → 티어 순(난수 없음), 전원 정예·장비 없음·풀 복사본 안 씀, AI 배치 계획(`bot.js arrange`)으로 배치.
    보낸 사람은 `bondId`(없으면 뽑기), 나머지는 이 판의 다른 핵심 맹약. 층수 `keep` 그대로 · `normal` R14 기준(BALANCE.md §1.1: 핵심 150, 그 밖 90) ·
    `strong` ×1.4 · `max` 상한 — 라운드와 상관없이 늘 R14 수준. 이렇게 놓인 AI 자리는 진행 중이던 정비를 멈추고(`_botPrepToken`) 이후 준비 완료만 한다(`ps.debugLocked`).
  - `con.setBoss { final?, hidden? }` 최종 공세 / 히든 코어 리더(이 모드의 리더 목록, `gd.bossWeights`). 다음 리더 라운드부터; 그 리더 라운드 정비 중이면 필드를 다시 계획.
  - `con.setLayers { bondId, layers }`(0..상한) 맹약 하나의 층수를 바로(`ps.layers`), `con.resetLayers {}` 모든 맹약을 0으로(관리자 결정 2026-11-15; 예전엔 첫 `con.setLayers` 전 층수로). 바뀐 줄 표시는 첫 변경 전 층수(`ps.consoleLayersBase`)와 비교.
    중첩이 없는 맹약(`bonds.json` `noStack`: 조화·협동방어·독행·궁극기)은 거부하고, 패널도 조절 칸 대신 「중첩 없음」.
  - `con.end { to: 'lobby' | 'result', victory? }` 콘솔 판은 `reason: 'consoleLobby'`(화면은 결산 없이 바로 대기실) / `'console'`(결산 화면만 보여 줌);
    콘솔이 아닌 로컬 디버그 판의 `'result'`는 옛 디버그 결산(`victory`로 승리 / 패배, 기록도 평소대로).
- **콘솔 판은 규칙으로 끝나지 않는다** (관리자 결정 2026-11-15, `server/local-console.js` 끝의 감싸기들):
  - 리더 클리어·리더 라운드 패배 → `Match.finish` 대신 같은 라운드 정비(`startRound(round)`, 생명이 0이면 시작 값으로) + 알림(`note`: 「최종 공세 클리어 —
    결산 없이 14라운드 정비로 돌아왔습니다」). 최종 공세 클리어가 히든 코어 조건을 넘으면 공식대로 히든 코어로 간다(결산이 아니므로).
  - 일반 라운드에서 생명 0 → 탈락하지 않는다(`PlayerState.eliminate` 감싸기: 생명을 시작 값으로), 그 정산 뒤 같은 라운드를 다시(`afterSettle` 감싸기) + 알림.
    탈락 토스트·티커(정산의 그 문구)는 콘솔 판에서 보내지 않는다.
  - 끝나는 길: `con.end`, 나가기(`Match._quit` — 진짜 탈락), 오류. 결과는 기록에 넣지 않는다: 서버 `[stats]` 줄 없음(`onMatchEnd`가 `summary.console`을 봄),
    화면은 통계·업적·전적(`recordResult`)에 넣지 않음(`main.js`: `reason` 'console*' 또는 `m.public.console`).
  - 성공한 명령은 `m.consoleLog`(라운드·명령·값, 최근 300개)에 남고, 판 도중 「✎ 제보」(결산 화면의 피드백 창 그대로 + 「콘솔 판에서 보내는 제보」 안내)로
    보내면 서버가 `console` 항목으로 붙인다 — `fb.send`의 「끝난 판 1시간 안」 문을 진행 중인 콘솔 판의 자리에도 연다(`local-patch.js liveConsoleFeedback`).
    끝난 콘솔 판에서 결산 화면 피드백을 보내도 같은 기록이 붙는다.
- **패널** (`public/js/ui/consolePanel.js` + `css/console-panel.css`, 목록 함수는 `ui/consoleLists.js`): 데스크톱은 왼쪽(단독은 팀 목록이 비어 자리가 있음),
  탭 5개 가로 — 오퍼레이터(등급 칩 공식 `chessLevelSprite/chess_level_icon_N`, 일반/정예, 종류 전체·선발 + 핵심/부가 맹약 칩 공식 `bondBoardIcon/1_0`·`1_1`
  — 켠 칩 `1_1`은 같은 원판에 빛이 더해진 77px 그림이라 캔버스 비율만큼 키워 원 크기를 맞춘다, 검색, 칸은 `equipReplace/avatart_bg`·`avatart_frame` 위 초상;
  선발은 작은 창: 단계·일반/정예·스킬·모듈, 누른 칸 바로 아래(아래가 모자라면 위)에 뜨고 이름은 페이지의 번역된 `backups`에서) ·
  장비(희귀도 원판 `itemRarity/rN`, 일반/강화 — 강화는 합성되는 장비만: `upgradeNum` 100인 변형 구조체·호출 모듈 등은 맹약 표에 같은 글의
  강화 레코드가 있어도 없는 것으로, `shared/local.js strengthenedItemId`, 서버 `con.addItem`도 같음) ·
  적(일반/정예, 수량, 다음 전투 대기열; 우리 편 유닛 — 모든 적 효과의 `enemy_exclude`가 함께 적는 키: 염의 가호, 규정은 맹약 소환물과 “모의 보물” — 은 빠지고,
  이름이 같은 공식 레코드 둘(덕로드·고프닉·눈물 흘리는 사내·동글이와 전략 '신비한 고객'이 바꿔 넣는 `_2` 형태)은 HP로 구분) · 라운드(1–마지막 네모 칸, 「N라운드 정비로 이동」, 완성 보드 블록, 리더 초상, 「기타」는 누를 수 있는 자금 고정·콘솔 끝내기만 —
  콘솔 판의 고정 규칙(리더 라운드 승리·생명 0도 결산 없이 같은 라운드 정비)은 탭 아래 안내 한 줄, 관리자 결정 2026-11-15) ·
  맹약(HUD 맹약 칸 `.bslot`·`bondBoardOf`를 작게, 핵심/부가 나눔, −10/−/값/+/+10/최대, 「↺ 초기화」; 걸러 보기 전체 · 배치 중 N(보드의 오퍼레이터) ·
  보유 중 N(보드·대기석·임시 구역) — 수는 두 칸에만, 선발은 고른 오퍼레이터의 맹약, 변형 구조체가 주는 맹약 포함, `consoleLists.js ownedBondSets`).
  탭은 글자만(아이콘 없음, 관리자 결정 2026-11-15).
  `` ` `` 키로 접고 펴기, 패널 바깥을 누르면 접힘(누른 것은 그대로 동작 — 대기석에서 끌기·상점 누르기가 한 번에; 제보·콘솔 끝내기 창이 열린 동안은 아님;
  관리자 결정 2026-11-15)(브라우저별 기억), 접으면 왼쪽 위 「CONSOLE」 탭(머리의 태그·글자와 같은 크기·자리). 머리 부제는 「통계·업적·전적에 남지 않음」,
  머리 오른쪽은 제보와 접기(패널 모양 아이콘의 네모 버튼, 단축키는 그 툴팁에; 관리자 결정 2026-11-15 시안 A) 한 높이. 휴대폰(짧은 화면 + 터치)은 왼쪽 전체 높이 시트, 탭은 세로 레일, ±10 없음; 시안이 CSS px라 `--cpx`는 1px
  (데스크톱 단위 1rem/83.33을 쓰면 0.48px가 되어 시트가 반 크기였다), 조작 칸은 34px 이상, 시트가 열린 동안 왼쪽 아래 「소통」·⋯은 숨김.
  「콘솔 끝내기」는 공식 확인 창(`battleArt('confirm')`, `.bcd`) 모양에 취소 / 로비로 / 결산 화면으로. 고른 시안: 관리자 노트 「콘솔 모드 시안」.
  그리기: 매 프레임 비용 없음(`m.private` 바뀔 때만, 아이콘 격자는 열린 탭만).
- 재발 방지: `test/local-console.test.js`(누가 쓰나·대기실 켜기·명령마다 실제 판 경로·규칙으로 안 끝남·끝내기·기록 제외·판 도중 제보).

## 정비 화면 HUD (2026-10-06)
상점과 같은 방식(관리자 요청: 정비 화면 나머지도 실제 게임과 같게). 근거는 EN 클라이언트 `[uc]autochessbattle.ab`의 `autochess_hud_panel`,
`autochess_hud_bond_item`, `panel_prep_ready`와 관리자 스크린샷(한국 서버). 그림은 모두 웹 소재(`hudPanel/*`, `hudBondItem/*`, `prepReady/*`,
`bondBoardIcon/*`)라 모든 플레이어에게 같다. 크기 단위는 클라이언트 값(아래 「크기 단위」): 1단위 = 1920×1080 기준 1.5px(`--u` .015rem).
- 라운드 띠: 판(`bg_board`)·양 끝 원·장식 상자·장식 글자, 그 뒤 어두운 띠(프리팹의 `frame_left` 옆판 — 스크린샷의 어두운 띠를 CSS로),
  가운데 단계 알약(`bg_rest`/`bg_battle`/`bg_coop` + `frame_mid_normal`, 글자 17px #40b196), 라운드 숫자 `bg_round`(20px #171717), LP 20px #a8a8a8,
  🔍 버튼은 `bg_check_btn` 판 위.
- 맹약 원: 판은 프리팹이 실행 중에 고르는 `_imgBoard` = `bondBoardIcon/<최대단계(최대 4)>_<도달 단계>`, 비활성은 `1_0`(스크린샷과 대조). 최고 단계면
  아이콘이 검정, 아니면 밝은 회색. 숫자(층수)는 `matte_num` 위 12.4단위(프리팹 16px는 우리 글꼴에서 링 지름의 .22 높이, CN 캡처는 .17 → 16 × .17/.22,
  관리자 결정 2026-10-12), 이름 14px. 원본의 "개수/다음 단계" 배지는 공식 원에 없어 숨기고 툴팁에만 둔다.
  맹약 줄은 라운드 띠 아래 가운데(`bond_list_info_view`), 뒤에 `matte`.
- 준비 완료: `ready_bg`(+`ready_frame`) + `ready_icon` + 18px 검정, 준비한 뒤(취소)는 `cancel_bg` + `cancel_icon` + #2f2f2f. 단축키 칸은 버튼 아래.
- 번역: 스크린샷의 한국 서버 표기로 「휴식 기간」(休息一下), 「배치 가능 인원」(剩余可放置角色).
- 맹약 원 판은 **단계 기준**(2026-10-06 후속 확인): 판 그림은 `1_0`과 `<최대>_1`…`<최대>_<최대>`뿐이라 층수로는 고를 수 없다. 원 위 숫자는
  층수(`_stackText`, 라운드마다 쌓임)라, 막 활성화된 맹약은 첫 호가 청록인데 숫자는 0 — 스크린샷의 「층수 0 + 청록 호」는 이것이다(지금 코드 그대로).
  비활성 색은 프리팹 `_inactiveColorConfig`대로 이름 #f4f4f4 70 %, 숫자 #b2b2b2.
- **맹약 원 판 고침(2026-10-06 2차, 위 「단계 기준」을 대체)**: 호의 칸 수 = **활성화에 필요한 인원**(공식 `act2autochess bondInfoDict activeCount`
  = `thresholds[0]`: 주요 3, 서브 2, 조화 1·독행 1·투자인 3), 켜진 칸 = 지금 인원, 활성화되면 단계와 관계없이 꽉 찬 원(`<n>_<n>`, 아이콘 검정).
  인원 0(또는 독행 상한 초과)은 `1_0`. KR 캡처: 빅토리아 3칸 중 2칸 + 회색 아이콘 = 2/3 비활성, 3명이면 꽉 찬 원 / 아케인 2칸 중 1칸.
  이전 코드는 칸 수 = 단계 개수(`thresholds.length`: 빅토리아 [3,6] → 2칸, 신속 [2] → 1칸)라 틀렸다. `hudArt.js bondBoardOf`.
  심의 활성 인원은 공식과 같다(23개 모두 `thresholds[0]` = `activeCount`) — 게임 데이터는 안 바꿨다.
- 활성/비활성 원 크기 차이(2026-10-06 2차): 클라이언트의 `bondBoardIcon` 스프라이트는 모두 77×77인데 고리(`1_0`, 덜 찬 `<n>_<k>`)는
  tight 패킹이라 텍스처가 64.86×64.86(가운데)이고 웹 PNG는 그 텍스처(65px)다. 같은 상자에 늘려 그려서 고리가 꽉 찬 원보다 14 % 컸다 →
  고리는 판(80)의 84.2 %, 꽉 찬 원만 100 %(`[data-full]`). 맹약 팝업 원도 같게.
- 맹약 문양 크기·이름 간격, 플레이어 목록 이름(2026-10-07, 관리자 제보: 중국 서버 联防 캡처와 비교): 문양 스프라이트(`[uc]autochesscommon` `icon_<맹약>`)는
  128×128 rect 안에 ~100px 텍스처가 tight 패킹이고 웹 PNG는 그 텍스처라, 36단위 상자를 꽉 채우면 공식보다 약 25 % 컸다 → 원래 px × 36/128단위,
  가운데(`components.js natSizeVars`가 `--nw`/`--nh`를 넣는다: `BondDisc` img, `gameComponents.js` `Img` onLoad·`BondGlyph`; 팝업 원도 같게).
  이름은 `text_name`(14px, UpperCenter, 상자 위가 중심 20 아래)대로 위쪽 정렬 → 원 중심에서 글자 중심 ≈36(전에는 42). 왼쪽 플레이어 목록의 이름은
  공식 항목에 없어 숨김(툴팁에는 남음, DOM에도 남아 e2e 테스트는 그대로).
  층수 숫자는 중국 서버 정비 캡처(고화질)에서 링 지름의 .35 아래(링 아래 끝에 걸침) → 15단위에서 19.5단위로 내림. `matte_num` 받침은
  캡처에서도 보인다(숫자 주위가 위쪽 같은 자리보다 약 40 % 어두움 = 검정 알파 .4) — 그대로 둔다.
- 맹약 줄 가로 스크롤(2026-10-06 2차): `bond_list_info_view` `scroll_view`(ScrollRect 가로) — viewport는 항목만큼 넓어지다 `_limitedWidth` 600에서
  멈추고(RectMask2D, 좌우 softness 15), 항목 폭은 LayoutElement 선호 80(RectTransform 83 아님) → 7개가 다 보이고 8번째부터 잘림(KR 캡처 7개 + 라테 절반).
  matte는 `.gm__bond-list`로 옮기고 `.bstrip`이 스크롤(스크롤바 숨김, 세로 휠도 가로로 — `bondStrip.js stripWheel`).
  마우스 왼쪽 버튼으로 끌어도 넘어간다(ScrollRect 드래그와 같음, #6): 5px 넘게 움직이면 드래그로 보고 놓을 때의 클릭은 막아 상세 창이
  안 열린다(키보드 클릭은 그대로), 터치는 브라우저 기본 스크롤 그대로(`bondStrip.js stripPointerDown` 등).
- 크기 비교(2000×1125, 같은 측정법): 고리 바깥 지름 수정 전 88px·꽉 찬 원 74px → 수정 후 81·82px, 간격 130 → 125px. KR 캡처(3838 폭을 2000으로 환산)는
  고리 73.5px·간격 112.7px — 남은 약 0.9배는 맹약 줄만이 아니라 라운드 띠(🔍 버튼 간격 우리 955px 대 캡처 859px)도 같아서, 그 캡처 전체 UI가
  1단위 ≈ 1.41px(2000 폭 기준, 우리 1.5625)로 그려진 것 = PC판 UI 배율 0.9 → 아래 「PC UI 배율 + 해상도 반응형」으로 해결(2000×1125 간격 113px).
- 오른쪽 위 카운트다운(2026-10-06 후속): **공식에 있다.** `auto_chess_battle_ui_page`의 `panel_countdown`(오른쪽 위 고정, 초기 패널)에
  `[uc]autochesscommon.ab`의 `auto_chess_countdown_view`가 들어간다. 준비 완료 버튼은 멀티일 때 그 아래(`multi_ref` −107.7), 혼자일 때 위(`single_ref` −52)
  — 스크린샷에 없던 것은 [추정] 혼자 하는 판이었기 때문. 원본(7세그 숫자 + COUNTDOWN + 막대)이 이미 같은 배치라 위치는 두고, 로컬 추출 그림이 있으면
  (`has-hud-cd`, ui/common) `countdown` 글자 그림, 막대 `bar_solid`/`bar_shadow`(#00ffc4, 마지막 몇 초 #ef5510 = `_colGreen`/`_colOrange`), 오른쪽 가장자리
  빛(light_green #187d65 2초 / light_orange #b94d22 0.5초 깜빡임 — [추정] 모양은 부드러운 타원, 머티리얼 미추출). 막대는 원본의 5칸 단위 그대로.
- 맹약 줄 접기(2026-10-06 후속, `has-hud-fold`, 웹 소재): `bond_list_info_view` `btn_synergy` — 펼친 동안 matte 아래 가장자리 가운데에 작은 `btn_close`(37×17 「︽」),
  접으면 `btn_open`(102×37) + `btn_open_arrow` 두 개(#94ffe2 50 %/100 %). 접힌 버튼의 자리는 [추정] 라운드 띠 바로 아래. 글자는 화면 낭독용으로만, 터치 영역은 원본 44px.
- 왼쪽 플레이어 목록(2026-10-06 후속, `has-hud-team`, 로컬 추출 ui/battle): `panel_player_status`·`player_status_item` — 80×80 초상 17 간격, 뒤에 `bg_player_list`,
  목록은 왼쪽 가운데에서 34 위. 초상마다 `bg_team_border`(100×100) — 보고 있는 판 #59ffd2, 나머지 흰색([추정] 아이템의 view/other 그룹을 이렇게 읽음),
  자기 칸은 왼쪽 위에 `icon_self`, LP는 초상 아래쪽 `bg_hp`(57×24, icon_hp, 16px #f3f3f3), 상태 아이콘(21×21)은 초상 오른쪽 아래 바깥. 공식 칸에는 이름이 없지만
  원본 기능이라 이름·联防 태그·눈·前往查看은 옆에 남겼다(상점과 같은 원칙). 로컬 추출이 없으면 원본 목록.
- 소통(이모티콘) 버튼: 원본이 이미 공식 `emoji_btn`(151×55)·왼쪽 아래 배치라 그대로.
- 크기 단위(2026-10-06 후속, 관리자 결정 「클라 추출 근거면 공식 단위」): `auto_chess_battle_ui_page`의 Canvas는 ScreenSpace-Camera(`m_RenderMode` 1) +
  CanvasScaler ScaleWithScreenSize, 기준 1280×720, `m_ScreenMatchMode` 0, `m_MatchWidthOrHeight` 0(가로). 그 아래 `panel_ui` → `panel_below`/`panel_hud`/
  `panel_shop` → 프리팹 루트(`autochess_hud_panel`, `autochess_shop`) → `player_info_view`·`bond_list_info_view`까지 localScale은 모두 1(상점 안에서 크기가
  다른 것은 마스코트 Spine 0.42와 말풍선 0.87뿐). → 1920×1080에서 1단위 = 1920/1280 = 1.5px. 이전 값 1.08(= 1.5 × 0.72)은 스크린샷에서 맞춘 것이고
  0.72배 부모는 없다. 관리자 CN 캡처(846×528, 16:10)로 확인: 두 🔍 버튼 중심 간격 457px / 611단위 = 0.75px/단위 ≈ 528/720(세로 기준) — 16:9에서는
  가로·세로 모두 1.5라 같다. 준비 완료 161단위 = 캡처 약 118px(0.73), 카드 간격 약 123px = 164단위(카드 158 + 간격 6). 우리 rem(1920×1080 기준
  `min(vw/19.2, vh/10.8)`)은 16:10에서 가로를 따라 공식보다 약 10 % 작다(16:10 스크린샷 기준 808px 대 915px).
- 프리팹·스프라이트 읽기 도구(2026-10-07): `tools/local-extract/ui_inspect.py` (`src/.venv-extract`, `python -I`).
  `prefab <번들> <GameObject>` = RectTransform 트리(앵커·위치·크기·피벗) + Image 스프라이트·색, Text 글자 크기·정렬·줄 간격·레이아웃 값,
  `sprites <번들> [이름 일부…]` = 스프라이트 rect·텍스처 rect·오프셋(tight 패킹이면 웹 PNG에 여백이 없다 — 맹약 문양 128 rect / 텍스처 ~100).
  번들은 경로 또는 클라이언트 `PersistentData/Bundles` 아래 경로(예: `ui/autochess/[uc]autochessbattle.ab`).
  `layout <번들> <GameObject> [--canvas WxH --match M] [--screen WxH] [--css-px-per-unit K]` = 같은 트리를 앵커·피벗·배율·레이아웃 그룹·자기 조절 순서대로 풀어 칸마다 절대 rect(캔버스 단위, `--screen`이면 화면 px)와 Image·Text 값을 JSON으로(형식은 도구 머리 「Output (layout)」, 못 푼 값은 「모름」) — 공식 치수는 머리로 풀지 않고 이것에서 읽는다(관리자 결정 2026-11-19). 게임이 채우는 목록(GridLayoutGroup — 맹약·기물 칸 같은 `Content`)은 프리팹에 칸이 없으니 `--grid-items <경로>=N`으로 칸 N개를 더해 푼다(빈 그리드는 `unsure`에 그 안내가 나옴).
  `draw <layout.json> <스크린샷> <out.png>` = 그 `screen` rect를 공식 스크린샷 위에 상자로 그려 푼 값이 화면과 맞는지 본다.
- 공식 화면 대조 도구(관리자 결정 2026-11-19): `tools/ui-check.mjs`(실제 Chrome, 머리에 쓰는 법). `compare <spec.json>` = 우리 화면을 공식 스크린샷 크기·배율로 열어 `layout` 칸과 CSS 선택자 짝의 가장자리 차이를 재고 겹친 그림(`overlay.png`)을 냄 — 시안을 보이기 전과 UI 줄 커밋 전에.
  `measure <spec.json>` = 우리 화면만으로 잘린 글자·같은 줄 칸 높이·가운데 맞춤·패딩 대칭·깨진 그림·실패 요청·데이터 칸 채움을 잼 — UI 줄 커밋 전에. 둘 다 종료 0 = 통과.
- **PC UI 배율 + 해상도 반응형(2026-10-06 2차, 관리자 요청 「해상도 기준 반응형」)**: 단위는 한 곳 — `css/hud-art.css` `:root --ui-u`
  = `clamp(.0135rem, .0105rem + .3px, .015rem)`. hud-art `--u`, shop-art `--u`(기존 폭 상한 `min(…)` 유지), phase-art `--pu`(세로 상한 유지)가 모두 이것을 쓴다.
  - 데이터 확인: EN(PC) 클라이언트 — `StandaloneCanvasScaleHelper`(`NotifySettingChange`, `_SetAllCanvasScale`)의 상수
    `MIN_SCALE_FACTOR` 0.9 · `MAX_SCALE_FACTOR` 1.0 · `DEFAULT_SCALE_FACTOR` 1.0(클라 필드 기본값), 설정 키 `UI_SCALER`(SettingManager, SLIDER).
    즉 PC판은 1280×720 캔버스 단위에 **플레이어가 설정하는 UI 배율 0.9~1.0(기본 1.0)**을 곱한다. 적용 방식(2026-10-11 공식 클라): `StandaloneCanvasScaleHelper._SetAllCanvasScale`이 설정값을 `UICanvasScalerHandlerSingleton.SetCanvasScaler`로 넘기고, 캔버스마다 `UICanvasScalerAspects.CalcFactorFloat`가 기본 배율 × 그 값 — **모든 캔버스에 같은 배율을 곱한다**(예전 [추정]과 같음). 예외: `OverrideStandaloneCanvasScalerInfo`가 붙은 캔버스는 자기 기준값에 곱한다(어느 캔버스인지는 프리팹, 미확인). `Reset`은 1.0.
  - KR 캡처(3838×2158, PC)는 🔍 버튼 간격 1649px = 610단위 × 2.70px = 0.9 × 3838/1280 → 그 플레이어는 최소 0.9로 둔 것. 해상도별 공식 표는 못 찾았다.
  - 곡선 [추정]: 1280×720 프레임(rem 66.7px) 이하는 1.0(=지금 크기 — 폰·작은 창은 그대로, 줄이지 않음), 1920×1080(rem 100px)에서 0.9, 그 사이 직선,
    그 위는 0.9. 1단위 = 1280 이하 `.015rem`, 1920×1080 1.35px, 2560×1440 1.8px, 3840×2160 2.7px.
  - **설정 「UI 크기」(관리자 결정 2026-10-06)**: 공식 PC판 UI_SCALER처럼 90~100 % 슬라이더(1 % 단위, 기본 90 = 위 곡선). 값 k는 곡선의 끝값을 바꾼다 —
    1280×720 이하는 늘 1.0, 1920×1080 이상은 k, 사이는 직선: `--ui-u = clamp(.015k rem, (.045k − .03) rem + (3 − 3k) px, .015 rem)`(k .9 = 위 식,
    k 1 = 예전 `.015rem` 고정). 그래서 폰은 어떤 값에서도 지금보다 작아지지 않는다. `ui/hudArt.js` `UiScaleSetting`·`uiScaleStore`(localStorage
    `sp.pref.uiScale`, `loadPref`/`savePref`라 저장소 오류는 무시)이 `<html>`에 `--ui-k`를 바로 넣어 슬라이더를 움직이는 동안 화면이 바뀐다.
    `ui/settings.js` 2줄(import, 화면 품질 아래 행), `i18n/ko/ui.json` 1줄(界面大小 → UI 크기). 확인: 2000×1125에서 90 → 🔍 859px, 95 → 907, 100 → 955, 새로고침 뒤 유지.
  - 「준비 완료 n/4」와 EFFECTS 겹침(모든 크기, 1280×720에서 Space 힌트까지): 효과 목록은 원본의 고정 `top: 2.4rem`이었고 준비 열은 단위로 커져서 겹쳤다.
    준비 열 아래끝 = 1.21rem + 113.3단위(모든 해상도에서 측정)라 `.gm.has-hud-art .gm__effects { top: max(2.4rem, 1.31rem + 114단위) }`(사유 줄이 있으면
    원본처럼 한 줄 더). 간격 1280×720 7px · 1920 11px · 3840 22px · 844×390 5px(이전 −20~−68px 겹침).
  - 맹약 팝업(`.bpop`)의 캡처 맞춤 값은 0.9 캡처 기준이라 `--ui-u`로 환산(.71 → .789, top 132.5 → 147.2): 1920 이상에서 크기 그대로.
  - 바꾸지 않은 것: 배치 기물 정보 창(1920 캔버스, `.01rem` 직접 값)과 이모티콘(`.01rem`)은 스크린샷에 맞춘 rem 값이라 이 단위를 안 쓴다.
  - 확인(headless, 목 화면 맹약 10개): 2000×1125 🔍 간격 860px(캡처 환산 859), 맹약 간격 113px(112.7), 3840×2160 1650px·216px(캡처 3838 폭 1649·216),
    모든 해상도에서 맹약 7개 + 8번째 잘림. 준비 완료 버튼은 맹약 줄과 겹치지 않음.
- 배치 기물 정보 창(2026-10-06 후속, 같은 날 2차로 다시 짬 — 관리자 제보, `ui/detailArt.js`): 상자 없이 화면 왼쪽 끝에
  전체 높이로 오퍼레이터 아트, 오른쪽으로 투명해지는 가로 마스크(55 %→100 %), 글자 뒤·탭 아래는 어둡게. 그 위에 `act2autochess_character_info_subpanel_status`·
  `…_tabgroup`(735단위 폭, 클라이언트 1920×1080 캔버스라 1단위 = .01rem — 스크린샷의 직군 아이콘 중심 x≈79와 일치)과 관리자 스크린샷(深巡·乌尔比安·斯卡蒂·
  盟约·辅助干员) 순서: 금색 틀 직군 아이콘(소환물·보조 오퍼레이터는 청록 틀 [추정]), 이름 33px, 등급 | 정예 아이콘 LV n(`chess.json status`의 phase·level =
  공식 charChessDataDict status, 예: 深巡 LV 55·乌尔比安 LV 1), 능력치 목록(攻击 防御 法抗 阻挡 费用 21px — 원본의 攻击间隔·再部署는 작게 이어서), 攻击范围 칸
  (136×105)과 맹약 칸(112×105, 원본 맹약 칩: 同构·本局禁用·팝업 — 개수는 안 보임, 아래 「상세 카드 세부」), 얇은 파란 체력 막대(555)와 끝의 「生命」+파란 값 상자, 탭 特质 / 技能(+모듈) / 特性 /
  天赋(650 폭, 열린 탭 흰 글자·어두운 칸), 탭 내용(재능 이름은 회색 칩, 特质는 초록 作战能力 칩 + `acbattle_img_bg_bond_desc` 판, 장착 장비). 出售는 공식처럼
  보드의 언더프레임(원본 기능)에만 둔다. 아트: 로컬 추출 `chararts/<charId>`가 있으면 그 立绘, 없으면 웹 소재의 180×360 반신 초상.
  - 立绘 추출(2026-10-06): `.venv-extract/bin/python tools/local-extract/chararts_extract.py`(기본 `--game` = EN 클라이언트 Bundles). 클라이언트
    `chararts/<charId>.ab`의 기본 아트 `<charId>_1`(정사각 1200/2048, BC7 + 때로 `[alpha]` 텍스처 → 알파로 합침)을 캔버스 그대로 긴 변 ≤1024,
    WebP q85(알파 유지)로 `public/assets/local/chararts/<charId>.webp`에, `data/local-assets.json` 그룹 `chararts` → `{ <charId>: { path, w, h,
    kind: 'Illust', frame } }`(쓰기 직전에 다시 읽어 병합). 대상: chess.json의 charId와 backups.json의 선발 오퍼레이터(`diy.ownedPool`), 토큰은 아트 번들이
    있을 때만(2026-10-06 실행: 128명, 합계 18.1MB). 0.2.0 병합으로 `data/diy.json`이 없어진 뒤 기본 대상에서 선발 5명이 빠져 있었다 → 2026-10-09
    `backups.json`을 읽게 고침(선발 5명의 立绘는 병합 전 실행분이 남아 있어 화면에는 빠진 적이 없다).
  - 원본 해상도판(2026-11-16, 관리자 결정 「휴대폰 기본 1024, 데스크톱 기본 원본, q85 그대로」): 카드는 1024판을 데스크톱 배율 1에서도 1.3~2.4배로 늘려
    그려 흐렸다. 추출기(`save_illust`)가 그림이 1024보다 크면 클라 텍스처 크기 그대로(카드 창으로 잘라 낸 판, 아래 「배치 근거」)도 `chararts/full/<charId>.webp`(q85)로
    쓰고 항목에 `full: { path, w, h }`를 단다(틀은 틀 단위라 두 판이 같다). 스킨 일러스트도 같은 함수로 쓴다(`render.md` 「스킨 모델 소재」). 어느 판을 그릴지는
    플레이어가 고른다(2026-11-17 관리자 결정, 시안 A — `public/js/illust-res.js`): 「일러스트 화질 [표준 | 고화질]」(표준 = 1024판, 고화질 = `full`)을
    미리 받기 동의 카드(음성 언어 줄 아래)와 설정 「리소스」 탭(아래 「설정 리소스 탭」)에서 바꾸고, 누르는 즉시 저장한다(`sp.pref.illustRes` 'lo' | 'hi' —
    카드에서 고르고 「나중에」를 눌러도 남고, 그때그때 받는 그림도 그 화질). 고르기 전에는 기기가 정한다: 휴대폰(주 포인터가 거칠고 화면 짧은 변 600 CSS px
    미만 — 창 크기·회전이 아니라 화면으로 재서 방문마다 바뀌지 않음)은 표준, 나머지(데스크톱·태블릿)는 고화질. `cardArt`·`buildSkinCatalog`가 `illustEntry`로
    고르고, 미리 받기 목록은 두 판에 `r: 'lo' | 'hi'`(`tools/build-browser-resources.mjs`: `<폴더>/full/<이름>.webp`와 짝 `<폴더>/<이름>.webp`)를 달아
    `resources.js`가 고른 판만 받고 다른 판은 캐시에서 지운다(페이지는 다른 판을 요청하지 않으므로 그때그때 받은 것을 잃지 않음). 바꾸면 음성 언어를 바꿀 때처럼
    다시 맞춘다(`illustStore` 구독 → `resync`: 동의했으면 새 판을 받고, 동의 카드의 합계가 따라 바뀜). 이미 그린 그림도 곧바로 바뀐다 — 열린 상세 카드
    (`ChessDetailArt`가 `illustStore`를 구독)와 스킨 고르기 미리보기(`skins.js`가 받아 둔 목록 둘로 카탈로그를 다시 만듦).
    재발 방지: `test/ui/illust-res.test.js`(기기 기본·저장·바꾸면 다시 맞춤·카탈로그 다시 만들기·목록 필터), `test/local-extract-skins.test.js`(짝 표시),
    `test/local-extract.test.js`(이 기기의 추출에 원본판).
  - 배치 근거: 그림 프리팹 `illust_<charId>_2`(없으면 `_1`, 스킨은 `illust_<스킨>`)마다 클라가 그 그림을 그릴 크기와 프레임 중심에서의 오프셋(y 위)을
    갖고 있다 — 캐릭터마다 얼굴 위치를 맞추는 값. 전투의 유닛 카드(`UICharacterInfoPanel._LoadIllust`, 공식 클라에서 확인)는 프리팹에
    StoreValueComponent의 `ILLUST_SIZE`·`ILLUST_OFFSET`이 있으면 그 값으로 크기·자리를 덮어쓰고, 없을 때만 프리팹 RectTransform(`m_SizeDelta`,
    `m_AnchoredPosition`)대로 그린다. 추출기(`chararts_extract.py illust_frame`, 스킨은 `skin_extract.py`가 같은 함수로)가 이 순서로 읽어 틀로 적고 카드는
    그 틀로 그린다(`--fx/--fy/--fw/--fh`). 대부분의 2정예화 그림과 스킨 그림에 저장된 쌍이 있고 RectTransform과 다르다(스노우헌터 2정예화: 저장 1770.9 @
    (−112.3, 59.3), RectTransform 2048 @ (−118.4, 56)). 2026-11-17 첫 구현(97107d52b)은 RectTransform만 읽고 카드 단위를 스노우헌터 한 장에 맞춰서
    스노우헌터만 맞고 다른 오퍼레이터·스킨은 틀렸다(같은 날 고침 — 수르트 스킨이 공식보다 10% 작게, 해럴드 스킨이 7% 크게 나옴).
    위치 값(`m_AnchoredPosition`이든 그것을 덮어쓰는 `ILLUST_OFFSET`이든)은 그림 중심이 아니라 RectTransform 기준점(`m_Pivot`)의 자리다 — 틀의 중심 =
    위치 + (0.5 − 기준점) × 크기. 기본 그림 206장 중 무에나(`char_4064_mlynar`) 2정예화 하나만 기준점이 (0.389, 0.271)이고(스킨 그림 533장은 모두 가운데,
    2026-11-20 전수), 기준점을 무시하던 동안 그 그림이 왼쪽으로 약 165·아래로 약 340단위 밀려 카드에 무에나 대신 뒤의 갑옷 팔과 검만 보였다(관리자 제보
    2026-11-20).
    재발 방지: `test/local-extract.test.js` 「illust_frame」·「the frame is the picture's centre」, `test/local-extract-skins.test.js` 「illust_picture」.
  - 2정예화 그림을 클라 2정예화 틀 그대로(2026-11-17, 관리자 결정 — 시안 (가)): 카드 그림은 2정예화 그림 `<charId>_2`를 그 그림의 틀 `illust_<charId>_2`
    그대로 그린다. 2정예화 그림·틀이 없을 때만(2정예화가 없는 오퍼레이터·토큰) `<charId>_1`과 `illust_<charId>_1`. 근거는 관리자가 준 공식 카드
    스크린샷 둘(스노우헌터 `char_4211_snhunt` 2정예화, 1920×1080, 전투 중·정비): 클라 텍스처를 배율별로 맞추면 얼굴 일치 0.96(1정예화 그림은 0.37), 텍스처
    1화소 = 1.001 px — 클라 2정예화 틀 그대로이고 1정예화 얼굴 크기에 맞추지 않는다. 카드 단위·중심은 공식 스크린샷 셋을 위 틀(저장된 쌍)로 맞춰 잰다
    — 스노우헌터 2정예화, 수르트 스킨 「컬러풀 원더랜드 CW03」(전투 중), 해럴드 스킨 「눈의 초대」(정비; 관리자가 준 캡처 2026-11-17): 틀 1단위 = 1.448 px,
    틀 중심 = 화면 (359.3, 605.7) px, 셋 모두 크기 0.5%·자리 2 px 안. 그래서 카드는 `--k` .01448rem, (`--cx`, `--cy`) = (3.593rem, 6.057rem)(1920×1080에서
    1rem = 100 px). 측정: 관리자 노트. 2026-10-06부터 2026-11-17까지는
    2정예화 그림을 웹 초상 맞추기(OpenCV)로 1정예화 얼굴 자리·크기에 맞춰 키워(최대 1.65배, 맞추기가 약하면 1정예화 그림) 그렸고, 단위·중심(.012rem,
    3.35rem·5.53rem)은 KR 캡처(플레이어 스킨)에 눈대중으로 맞춘 값이었다 — 그래서 원본판으로도 1080p에서 늘려 그려 흐렸다(사용자 제보 2026-11-17, 스펙터
    디 언체인드 `char_1023_ghost2`·스노우헌터). 측정·시안: 관리자 노트. 1정예화 그림만 있는 오퍼레이터도 같은 단위·중심과 같은 틀 읽기로 그린다 — 카드가
    같은 함수로 같은 자리에 붙인다 [추정·화면: 공식 1정예화 카드는 재지 않음 — 이 모드의 카드는 2정예화가 있으면 2정예화 그림이라 해당은 2정예화 없는
    오퍼레이터뿐].
  - 카드 창으로 자르기: 추출기(`card_crop`)가 그림마다 카드가 보여 줄 수 있는 부분 — 패널 폭 8.6rem × 4:3 화면의 패널 높이 14.4rem(`theme.css` 1rem
    = min(vw / 19.2, vh / 10.8)라 더 넓은 화면은 덜 보임) — 만 남기고 그 부분의 틀을 적는다(그려지는 자리는 같음). 표준판(긴 변 1024)이 화면 밖 화소에
    해상도를 쓰지 않는다. 창 값(`CARD_*`)은 CSS를 두 번 적은 것이라 `test/local-extract.test.js` 「chararts card window」가 같은지 본다 — 카드 그림의
    단위·중심·패널 폭을 바꾸면 `CARD_*`를 같이 고치고 `chararts_extract.py`를 다시 돌린다(안 하면 잘린 가장자리가 보임).
    (`_skinOffset`이라는 또 다른 위치·크기 값도 있으나 어느 화면용인지 확인 못 해 쓰지 않음.)
    재발 방지: `test/local-extract.test.js` 「chararts card window」·「card_crop」. 블록은 원본 `ChessDetail`의 것을 옮겨 실시간 태그·±차이·병합 안내·调配 태그가 남는다. `has-hud-art`일 때만.
  크기는 KR 캡처(2000×1125, 1rem = 104px) 기준: 직군 아이콘 위 1.97rem·x .24rem, 능력치 줄 .22rem, 체력 막대 0–5.0rem + 「체력」·값 상자(≈1.25rem), 탭 폭 5.86rem,
  아트는 ≈6.7–8.6rem에서 사라짐. 공격 범위 칸 1.1rem·맹약 칸 .91rem 폭(높이 .93rem; 2026-10-14 관리자 결정, 공식 플레이 영상 16:10 화면을 가로 1920
  단위로 잰 ≈110 / ≈91 — 예전 1.2 / 1rem; 같은 영상에서 체력 막대 497·값 상자 125·탭 줄 583×35는 우리와 맞음, 화면이 16:9보다 좁으면 공식·우리 모두
  UI를 가로 폭에 맞춰 줄이고 보드는 높이에 맞추므로 카드가 보드보다 작아 보인다). 한국 서버 표기: 공격 / 방어 / 마항 / 저지 / 비용(ko 「法抗」→마항, 「费用」→비용), 공격 범위, 체력, 특질 / 스킬 / 특성 / 재능.
  **배치 중에도**(드래그 중·방향 고르는 중, `screens/game.js` 2줄 + `detailArt.js placingDetail`) 같은 카드를 띄우고 아트를 더 투명하게(.55), 포인터는 받지 않는다
  (`.dart-placing`) — KR 캡처대로. 보드 쪽(배치 가능 칸·방향 마름모·범위 미리보기)은 다른 작업.
- 맹약 팝업(2026-10-06 후속, 같은 날 다시 짬 — KR 인게임 캡처 21·22): **클라이언트 `autochess_hud_bond_detail_dialog` 그대로.** 처음의 흰 타일·
  「핵심 맹약」·「활성화 필요 인원」 모양(관리자가 준 이미지 1·6)은 도감 화면 것이라 HUD에서는 쓰지 않는다. 캡처 대조: 맹약 줄 간격 170px = 83단위 →
  패널 602×391단위(프리팹 584×379), 위 ≈135(프리팹 132.5).
  - 패널: 위 가운데 고정, 중심이 화면 위에서 322 → 윗변 132.5, 584×379, `detail_bg`. 머리 104 높이(스크롤해도 고정): 맹약 원판(80×80, `bondBoardIcon` +
    아이콘 36, 중심 왼쪽 위에서 43.4 / 49.2), 이름(24, x 80부터), 인원 알약(중심 61.9 아래, x 81.3: 비활성 = `bond_inactive_bg` 빨강 + `title_char_icon`
    #b6b6b6 + 「n/m」 Novecento 18 + 「비활성화」 #fd6969 16, 활성 = `bond_active_bg` + 아이콘 #00f0b4 + `active_icon` ✓),
    오른쪽 위 「중첩 수 n」(25 왼쪽, 34.5 아래, #d0d0d0 / 흰색).
  - 「n/m」(2026-10-10 공식 클라로 확인): n = 그 맹약 인원(`GarrisonBond.charCnt`), m = **맹약마다 하나뿐인 발동 인원** `activeCount`
    (`AutoChessBondItemModel.LoadData`: requireCount = `ActAutoChessBondInfo.activeCount`) — 단계가 여럿인 맹약도 같다(炎 4명 = 「4/3」,
    예전 우리 「4/6」). `AutoChessBattleUIBondDetailView._RenderTitleInfo`가 활성이면 `AUTO_CHESS_BATTLE_BOND_ACTIVE_CHAR_COUNT_FORMAT`, 아니면
    `…INACTIVE_…`을 `String.Format(fmt, n, m)`로 채움; 문자열(CN `main_text`): 활성 `<color=#25FFCD>{0}</color><color=#B0B0B0>/{1}</color>`, 비활성
    `<color=#F0F0F0>{0}</color><color=#A3A3A3>/{1}</color>` — 두 경우 모두 m을 찍는다(색은 hud-art.css `.bpop__needn`/`.bpop__needm`). 공식 HUD 맹약 줄
    (`AutoChessBattleUIBondItemView`)에는 인원 숫자가 없다(중첩 수·이름만 — 공식 모양에서 `.bslot__count`를 숨기는 것과 같음). 같은 m을 upstream 모양의
    줄·팝업 사실 줄·기물 카드 맹약 칩에도 씀(`gameLogic bondRequireCount`); 단계 진행은 단계 칸·점으로 본다.
  - 스크롤 내용(여백 24 / 20 / 30, 간격 19): 맹약 설명 하나(18, 공식 rich text 색 ba.vup #0098DC, ba.vdown #FF6237, ba.rem #F49800, ba.kw #00B0FF,
    ba.acrem #727272, autochess.gray #777777, autochess.dgreen #40B196 — Kengxxiao zh_CN `gamedata_const`)와 구성원 격자
    (`autochess_hud_bond_char_item`: 칸 88, 한 줄 5, 간격 25.5 × 38, 아바타 76 + `avatar_border` 83, 켜진 구성원은 `avatar_active_border` 92×90,
    나머지는 #3b3b3b 50 % 어둡게 — 회색 처리 없음, 등급 배지 30×30 왼쪽 아래 — 스프라이트 rect = 텍스처 45라 상자 그대로, 이름 16 아래). 얇은 스크롤바.
  - 구성원이 켜지는 조건(2026-10-22 공식 클라로 확인, 관리자 제보: 투자자 팝업에서 정비 구역의 실버애쉬 더 레인프로스트가 어둡게): 맹약의
    `activeType`을 따른다 — `AutoChessBattleUIBondCharItemView.Render`가 `AutoChessBondCharModel.isActive`로 `_activeBorderObj`를 켜고
    `_inactiveMaskObj`를 끄며, isActive = `AutoChessBattleUtil.CheckIfCharBondActive`: 그 플레이어의 ChessInst 중 일반 id가 같은 것이
    ALL(투자자·예견·기적)이면 어디에 있든, BATTLE·MANI면 전투 중(필드)일 때. 정예(`_b`)도 일반 id로 맞춘다. 그래서 투자자·예견·기적은 정비 구역
    구성원도 켜진다(전에는 모든 맹약에서 필드 구성원만 켬). 임시 칸 5개도 소유로 켠다 [추정]: 클라는 ChessInst를 전부 도는데 임시 칸이 ChessInst인지는
    안 읽음. 코드 `gameLogic memberLit`.
  - 결석(본판 금지) 구성원은 **목록에서 뺀다**(2026-10-13 관리자 결정, 관리자가 공식 화면에서 확인 2026-11-16): 공식
    `autochess_hud_bond_char_item`·`AutoChessBondCharModel`에 결석 상태가 없다. 맹약이 전부 꺼진 선발 pick(`m.private.diyBanned`)도 같이 빠진다
    (`gameLogic bondMembers`; 예전 빨간 원 ✕ 표시는 없앰). 「成员 x/y」의 y도 그만큼 줄고, 머리의 「n/m」(`activeCount`)은 그대로.
  - 변형 구조체 + 맹약 장비를 낀 선발 오퍼레이터(2026-10-13, 관리자 제보: 그 맹약 목록에 빈 칸 「선」): `bondMembers`의 변형 구조체 행도 선발 행처럼
    오퍼레이터의 합성 기록(일반형)·동료의 pick을 단다 → 그 오퍼레이터 그림·이름, 누르면 그 오퍼레이터 카드.
  - 설명은 **현재 효과만**(2026-10-13, 사용자 KR 캡처 「기민」 + 공식 클라): `_RenderContent`가 `_descText` 하나에
    `AutoChessBattleUtil.GetBondDesc(bondId, stack)`(맹약 효과 문구의 자리표시를 기본값 + 층당 값 × 중첩 수로 채움 = 우리 `formatBondEffect`,
    원본의 当前效果)를 쓴다. 원본의 단계 칸·当前效果 제목·맹약 전체 문구는 공식 모양에서 숨김(本局禁用 맹약은 当前效果가 없어 전체 문구를 남김). 글자색은
    스크립트 `_activeDescColor` 흰색 .9 / `_inactiveDescColor` 흰색 .8, `test_desc` 줄 간격 .9.
  - 패널 밖 < > (`btn_prev`/`btn_next` 100×100, `arrow` 87×86, 중심에서 −344 / +339): 맹약 줄 순서의 이전 / 다음 맹약(`hudArt.js BondNav`, game.js 1줄).
  - 맹약 줄에서 연 원: `group_select` — 좌우 괄호 `select_frame`(21×61, ±34.5, 8.4 위).
  - 그림: 웹 소재(`hudBondItem/select_frame`)와 로컬 추출(ui/battle `detail_bg`, `bond_inactive_bg`, `bond_active_bg`, `title_char_icon`, `active_icon`,
    `avatar_border`, `avatar_active_border`, `arrow`), 없으면 CSS 색. `bondStrip.js` 훅: 원판 style, 알약, 중첩 수. ko 「尚未激活」 → 「비활성화」.
- 전투 HUD(2026-10-06, KR 캡처 18): 라운드 띠 가운데는 `bg_battle` + `icon_battle` + 처치 수 「6/9」(이미 공식 모양, 처치 수만 호박색으로). DP 표시는
  기본 게임의 전투 코스트 패널이라 오토체스 번들에 프리팹·그림이 없어 캡처대로 [추정]: 상자 없이 흰 마름모 「C」 + 숫자(Novecento ≈.66rem) + 흰 밑줄,
  오른쪽 끝 아래쪽 4분의 3 높이(밑에서 2.3rem). 원본 「COST」 글자는 숨김.
- 왼쪽 플레이어 목록: 솔로 모드에서는 **숨긴다** — `teamPanel.js` 훅에 `is-solo`(플레이어 한 명). 공식 클라에서 확인(2026-11-16): 목록 패널
  (`AutoChessBattlePlayerStatusPanel`)은 `AutoChessBattlePlayerStatusGroupModel.isAvatarListVisible` = `canDisplayAvatar`(로딩 중이 아님 등)이고
  모드 종류(`ActAutoChessModeData.modeType`)가 `SINGLE`이 아닐 때만 보인다 — 멀티(AI 팀원이 있는 협동 포함)는 그대로 보임, KR 솔로 캡처(정비·전투)와 같음.
  같은 모델의 관전 패널(`isObPanelVisible`, `_UpdateObPanelVisible`)은 다른 것이다: 연합 방어·보스 전투 상태에서는 그 주 하위 상태일 때, 그 밖에는
  관전 중 보는 플레이어 색인(`playerViewIndex`)이 0보다 클 때만 켜진다(플레이어 수는 안 봄).
- 저지 수(阻挡)와 에기르 포식(2026-10-06 확인): 실제 대전 경로(매치 하네스 정비 → `m._normalOpts` → 실제 `Battle`)에서 深巡·幽灵鲨·斯卡蒂 + 앞 칸 오퍼레이터를
  한 줄로 놓으면 深巡 3 → 7(먹은 셋의 기본 저지 2+1+1), 斯卡蒂 1 → 2(관리자 스크린샷의 斯卡蒂 2와 같은 +1). 카드가 읽는 값 — 전투 중 `unitStatsEntry(u, u._s)`,
  정비 중 「开战时」 미리보기 `Match._unitStatsOf`(battleStart 훅까지 실행) — 둘 다 7·2이고 원본 카드도 같은 값(초록 +4)을 보인다. 시뮬레이터 문제 없음.
- 위치 수정(2026-10-06 2차): 라운드 띠 중심을 화면 위에서 34단위로(`player_info_view` 위 고정 156 높이, `group_hud` +44 — 전에는 약 62단위라 위 공백이 컸다),
  🔍 버튼은 띠 중심보다 6.5 위, 맹약 줄은 위에서 55(`bond_list_info_view`, 원 중심 88), matte 96 높이·최소 420 폭, 준비 완료는 틀(161×57) 안에서 판이
  3.1 왼쪽·1.3 아래이고 아이콘·글자는 `panel_content` 기준(글자 중심 판 중심 +17.6, 아이콘은 글자 왼쪽 끝에서 19.7), 플레이어 목록 판은 초상 왼쪽 17(전에는 8.5).
- 그대로 둔 것: 단축키(원본).
- 관리자 제보 수정(2026-10-06 3차):
  - 왼쪽 벤치 칸 선택 불가: 정보 카드의 탭 내용(`.dart__pane`, pointer-events auto)이 벤치 줄(y ≈ 620–790, 2000×1125)과 겹쳐 0–2번 칸
    (x ≈ 300–630)을 누르면 카드가 받았다(elementFromPoint = `.dgarrison__head` 등). 이제 탭 내용은 누름을 보드로 넘기고 버튼·링크·`[title]`·
    썸네일만 받는다(hud-art.css). 탭 줄·머리·능력치 칸은 그대로 받는다.
    → 2026-10-14 관리자 제보로 머리·능력치 칸도 넘긴다: 협동 보스 정비의 오른쪽 절반은 보드가 좌우로 뒤집혀(열 c → 20 − c) 보드 6–10열이 카드
    밑(화면 x < 8.6rem)에 깔리고, 그 칸의 기물은 누르지도 끌지도 못했다(1920×1080, elementFromPoint = `.dart__head` / `.dart__mid`; 왼쪽 절반·
    일반 정비는 덜 쓰는 0–4열). 공식 플레이 영상에서도 오른쪽 절반의 카드는 왼쪽이라 카드를 옮기지 않는다. 이제 카드에서 누름을 받는 것은 닫기·탭
    줄과 머리·능력치 칸 안의 버튼(맹약 칩)·`[title]`(능력치 툴팁)·썸네일뿐이다. 실제 서버 보스 정비 오른쪽 절반에서 카드를 연 채 카드 밑 기물 선택,
    카드 밑 ↔ 밖 이동(`g.move`), 맹약 칩 팝업, 탭 전환을 확인. 남는 막힘: 탭 줄이 임시 줄(보드 8행) 몇 칸을, 맹약 칩이 9–10행 한두 칸을 덮는다.
    탭 스크롤(관리자 제보 2026-10-12 「장착 아이템 설명이 잘림」): 공식 카드는 탭마다 세로 ScrollRect(`detailedPanels`의 `group_*` `scroll_desc`)라,
    탭 내용(`.dart__pane`)을 카드 남은 높이(최소 1.6rem)에서 따로 스크롤하는 칸으로 바꿨다(스크롤바 없음, 더 있는 쪽 가장자리 흐림, 끝은 왼쪽 아래
    모서리 버튼 위까지 여백). 위 누름 넘김은 그대로 두고, 글이 넘쳐 스크롤이 필요할 때만(`is-scroll`) 탭 내용이 휠·터치를 받는다 — 그때는 그 아래
    벤치 칸을 카드를 닫거나 탭을 바꿔야 누를 수 있다. 세트 효과 줄이 붙은 아이템 두 개면 1920×1080에서도 넘친다.
  - 선택 마름모가 카드를 덮음: `Underframe`이 마름모를 따로 그린다(`.uframe.uframe--dia`, 버튼 없는 층). 공식 모양에서는 z 8로
    카드(z 9) 아래, 撤退·出售 버튼(`.uframe[data-uid]`)은 그대로 z 12. 원본 모양은 둘 다 z 12라 보이는 것은 같다.
  - 채팅 자동 스크롤: 원본 `ChatLog`는 맨 아래에서 24px 넘게 올라가 있으면 새 줄에 따라가지 않는다 → 내가 보낸 줄이면 항상 맨 아래로,
    한 프레임 뒤에 한 번 더(줄바꿈·글꼴이 늦게 잡힐 때). headless에서는 맨 아래에 있을 때 원본도 따라갔으므로 제보 때는 조금 올려 둔 상태였다고 본다 [추정].
    관리자 제보 2026-10-25(협동 방에서 입력하는 동안 남의 새 줄에 스크롤이 안 따라감): 로그가 클라이언트 보관 한도(60줄)에 차면 새 줄마다
    맨 위 줄이 빠지고, Chrome의 스크롤 앵커링이 scrollTop을 옮기면서 생긴 scroll 이벤트를 「읽는 사람이 위로 올림」으로 읽어 따라가기가
    꺼졌다(입력 여부와 무관, 내 줄은 늘 내려 주므로 입력 중에 드러남). `.chat__log`에 `overflow-anchor: none`. Windows Chrome에서 재현·확인
    (`test/ui/chat-scroll.e2e.test.js`: 수정 전 맨 아래에서 200px, 수정 뒤 0px). 위로 올려 읽는 중에는 맨 위 줄이 빠질 때 글이 한 줄씩 위로 밀린다.

## 상점 화면 (2026-10-06)
관리자 요청: 상점을 실제 게임과 같게. 근거는 EN 클라이언트 `ui/autochess/[uc]autochessbattle.ab`의 프리팹(`autochess_shop`, `autochess_shop_card_item`,
`autochess_shop_cost_item`, `autochess_shop_bond_item`)과 관리자가 준 실제 게임 스크린샷 3장.
- 그림: 웹 소재(`data/assets.json` ui `shopPanel/*`·`shopCard/*`·`garrisonTypeIcon/*`)라 로컬 클라이언트가 없는 플레이어도 같다. 가격 육각형
  (`cost_bg_1`/`cost_bg_2`)만 로컬 추출본(ui/battle)이라 없으면 원본 CSS 육각형. 웹 그림이 없으면 `has-shop-art`가 붙지 않아 원본 모양 그대로.
- 크기: 프리팹 단위(카드 158×176, 승급 111×175, 접기 상자 168×184, 버튼 128×55). 1단위 = 1920×1080 기준 1.5px(클라이언트 값, 근거는 「정비 화면 HUD」
  「크기 단위」; 2026-10-06까지 스크린샷으로 맞춘 1.08px). 단 6칸 상점(약 1270단위)이 왼쪽 아래 원본 버튼(소통·채팅·설정·설명·전체 화면, 약 4.4rem —
  공식 정비 화면에는 없음)을 덮지 않도록 `min(.015rem, (100vw − 4.75rem) / 1270)`: 16:9에서 6칸이면 약 1.15px로 그려진다.
- 정렬 수정(2026-10-06 2차, 관리자 제보): 원인 둘. ① 클라이언트에서 9-slice(`m_Type` 1 + `m_Border`)인 그림을 `100% 100%`로 늘려 그렸다 —
  가장자리 빛·여백까지 늘어나 판과 틀이 어긋남. 이제 `border-image`로: `ready_bg` 48×49(테두리 23), `ready_frame` 23×20(l 9 / b 7 / r 10 / t 8),
  `cancel_bg` 51×49, `frame_mid_normal`(t 18 / b 12), `matte`(l·r 178), `bg_player_list`(l·r 30, t·b 25), `acbattle_img_bond_title`(l·r 9, t 8, b 6).
  (`bg_board`도 9-slice지만 균일한 반투명이라 그대로.) 웹 소재 PNG 크기는 `battle_repeatline`·`repeat_line`(1px 작음) 말고 모두 스프라이트 rect와 같다.
  ② 손으로 맞춘 위치가 프리팹과 달랐다: `upgrade_disable`/`upgrade_max` 그림에 LEVEL·잠금 아이콘이 박혀 있는데 우리 LEVEL 글자를 또 그림(→ 그 상태에서는 숨김),
  LEVEL·숫자·「승급」 위치(상자 위에서 51.5 / 75.5 / 157.6, 프레임 안 기준 18.5 / 42.5), 자금 알약(접기 상자 윗변에 중심, −18.8), 접기 상자 그림(3.5 왼쪽·위),
  동결/갱신 아이콘(중심 −26.5)·글자(+18.5, 1 위)·갱신 판(147 폭, 1 왼쪽).
- 카드: 오른쪽 위 초상화, 왼쪽 흐린 워터마크 = 기물의 첫 特质의 유형 아이콘(프리팹 `garrison_icon` 65×65·35 %, `garrisons.json eventTypeIcon`
  → `garrisonTypeIcon/icon_*`; 스크린샷의 에스텔·아르케토·锡人과 맞음. 刺玫는 우리 데이터 icon_bond인데 스크린샷은 icon_gold — 2026-10-06 확인:
  프리팹 `garrison_icon`은 그림이 비어 있고 카드 스크립트 `_garrisonIcon`이 실행 중에 채운다(채우는 규칙은 아직 안 읽음). CN 표는 두 시즌 모두 icon_bond
  (act1 `garrison_25` 获得时 盟约+2, act2 `garrison_154` 休整期结束时 维多利亚+1)이고, 한국 서버 표는 구할 수 없다(Kengxxiao YoStar 저장소는
  2025-11에서 멈췄고 `act1vautochess`만 있음, 클라이언트 표는 `anon/*.bin` 암호화). **해결(2026-10-06, 관리자 KR 캡처):** 지금 시즌 KR 벤델라(刺玫)
  카드 워터마크는 사슬(icon_bond), 정보 카드 特质 칩은 「지속 중첩」 <휴식 기간 종료 시> 활성화된 [빅토리아] 중첩 수 +1 = 우리 데이터(act2 `garrison_154`)와 같음
  → 규칙·데이터 모두 맞다. 처음 스크린샷의 icon_gold는 다른 시즌·다른 카드였던 것으로 본다. 정비 능력 特质(예: 락락 <획득 시>)는 마름모(icon_gold)),
  맹약 줄(14px #b7b7b7) 위에 이름 띠(직군 아이콘 + 이름 16px), 아이템은 설명 없이 그림 + 이름, 팔린 칸 `[ NO INFO ]`, 돈이 모자라면 회색 막.
  업로드 화면에 없는 원본 기능(스킬·모듈 표시, 승진 가능 표시, 두 번 눌러 사기)은 남겼다. 스킬 아이콘은 오른쪽 아래(관리자 요청).
- 동결 카드(2026-10-14, 관리자 제보 「자금이 적을 때 동결 효과가 다르다」): 프리팹에서 `state_fx_frozen`(아래쪽 `ice_matte` 159×67 + `icon_ice`)은
  `disable_matte`(#5b5b5b 60 %)와 따로 있는 층이고 그보다 위(그리고 `group_char`의 이름 띠보다 위, `btn_double_check`보다 아래)다. 우리 CSS는 둘을
  카드의 `::after` 하나에 넣어 살 수 없는 카드(또는 잠긴 상점)에서는 회색 막이 얼음 매트를 덮어썼다 → 얼음은 `.scard__ice`(매트 = 배경, 눈송이 =
  `::before`, z 6)가 그리고 `::after`는 회색 막만. 디버그 자금(넉넉함)에서는 회색 막이 안 붙어 보이지 않았다.
- 카드 테두리(2026-11-10): 공식 카드(`AutoChessBattleShopCardView`)는 오퍼레이터 카드의 `group_frame`(`_charLevelFrame`, 세 상태)을 기물 단계로
  고른다 — VI단계 `frame_lv3`(주황), V단계 `frame_lv2`(금), 그 밖 `frame_lv1`(청록)(공식 클라에서 확인). 우리는 그때까지 금 테두리를 선택 중·
  정예 승진 가능 카드에 썼다 → 단계대로(관리자 결정 2026-11-10). 선택·승진 표시는 원본 표시(game-shop.css의 테두리 빛·「정예 승진 가능」 띠)가 맡는다.
  아이템 카드는 공식이 테두리를 고르지 않아 그 칸의 이전 상태가 남는다 — 우리는 늘 `frame_lv1` [추정·화면: 이전 상태가 남는 화면을 공식에서 못 봄].
- 첫 탭(선택) 상태(2026-10-06, KR 캡처 20): `btn_double_check` group_able — 카드 아래쪽에 `bg_doublecheck1`(158×125, 청록, 카드 중심보다 25.5 아래),
  「구매 확인」 22 Heavy #dcfff7(중심보다 62 아래), 아트 어둡게; 살 수 없을 때 group_disable(`bg_doublecheck2` 회색, #e4e4e4). 원본의 「한 번 더 누르기」와
  들어 올림은 남김. 동시에 왼쪽 기물 정보 카드가 그 오퍼레이터(立绘 포함)로 열린다(원본 동작 그대로). 그림 변수는 `hudArt.js`(`--ha-dc1/2`), CSS는
  hud-art.css. ko 「确认购买」 → 「구매 확인」(ui.json이 official.json의 「구매한다」를 덮음).
- 단축키는 원본 그대로(D 승급 · F 동결 · R 갱신): 스크린샷의 G/S/D/A는 그 플레이어가 바꾼 설정일 수 있다(관리자 판단 2026-10-06).
  → 2026-10-24 확인: G/S/D/A는 공식 기본값이었다 — 기본값을 공식대로 바꿈(관리자 결정 2026-10-24, 「적 미리보기 단축키」 절).
- 갱신 애니메이션(2026-10-09, 관리자 요청 「갱신하면 카드가 아래에서 위로」): 같은 번들의 클립. 카드 프리팹 `autochess_shop_card_item`의 Animation
  `card_item_refresh` = root y −135 → −25.92(4/60초) → 0(14/60초), 접선 0 → 444.3 → 0, `root_layout`의 `card_whole_refresh_normal` =
  `group_slots`(카드 줄, 승급 상자 제외) alpha 0 → 1(0.1초). 60fps Hermite(가중치 1/3)를 구간마다 cubic-bezier로 옮겨 그대로 씀(game-shop.css
  `shop-card-rise`). 공식 계기(공식 클라 `AutoChessBattleShopMainView._RenderUnfoldView`, 2026-10-10 확인): 서버가 보낸
  `refreshSeq`가 바뀌면 카드마다 `card_item_refresh`를 **동시에**(`AutoChessBattleShopCardView.PlayRefreshAnim`, 지연 없음) 틀고, 줄은
  상품이 특수(`isSpecialRecruit` = 서버 `isSpecialGoods` ≠ NORMAL — `AutoChessBattleShopGoodsType` COMB 1 / BUFF 2)면 `card_whole_refresh_special`,
  아니면 `_normal`. 같은 플래그가 켜져 있으면 刷新·冻结은 「请选择奖励」로 거절된다(`AutoChessBattleUIController._OnShopRefresh`) —
  즉 특수 상품 = 골라야 하는 보상 상품. 우리: 수동 갱신(`m.private.shop.refreshes` = `stats.refreshes`, 버튼·R 키 모두 — 전략의 「特殊刷新」
  갱신도 상품은 보통이라 normal) → normal, 보상 제안(`shop.rewardOffer`: 晋升奖励 = COMB, 전략·아이템·특질이 여는 제안 = BUFF)이 새로 상점 줄을
  차지하면 → special(서버 `server/local-patch.js`가 제안마다 번호를 매겨 `shop.rewardOffer.seq`로 보냄; 「稍后」 뒤 다시 펼 때는 같은 번호라 재생
  안 함 — 공식도 접힌 동안 바뀐 것만 펼칠 때 재생). 라운드 시작의 다시 뽑기·상점이 처음 그려질 때는 재생하지 않음: 공식에서 그때 `refreshSeq`가
  바뀌는지는 서버 로직이라 클라에 없다(클라만 보면 첫 펼침에 seq ≠ 0이면 재생하는 쪽) — 우리 동작 유지. 보상 제안 중의 刷新·冻结 거절은 아직 안
  옮김(우리는 「稍后」로 미뤄 두고 상점을 쓸 수 있다).
  - 특수 상품 클립(2026-10-09 관리자 제보로 처음 넣음 — 그때는 전략 「特殊刷新」 수동 갱신에 걸었으나 2026-10-10 위 공식 클라대로 보상 제안으로 옮김):
    클립 = normal + `root_fx`(카드 줄 영역, RectMask2D, 카드처럼 −135 → 0)의 ① `grad`:
    `img_uifx_sweep_03`(arts/ui/[uc]fxcommon.ab)을 180° 돌려 982 × 721.83, × #ffb500, 가산(`m_colordodge2` One One), 2/60 → 34/60초에 켜지고
    y −473 → −143.61(0.1초) → 76.67(0.2초) → 457.5(0.567초) — 그림 세로 단면을 CSS 그라데이션으로 옮겨 그림이 필요 없음(game-shop.css
    `.shopbar__sweep`). ② `particle_ctrl`(UIParticle, 1/60 → 80/60초) 별 3개 시스템, 텍스처 `img_uifx_star_4`(로컬 추출 `ui/fxcommon`, 없으면
    둥근 점): star1 상자 6.64 × 1.25에서 3개씩 5번, star2·star3 줄 왼쪽·오른쪽 끝에 큰 별 1개씩 — 값은 `public/js/ui/shopRollFx.js` 머리말.
    [추정] 파티클 1단위 = 프리팹 100단위(Local 크기 + 0.01 캔버스로 봄), 크기·알파 곡선은 키 사이를 직선으로(접선 안 읽음). 보상 카드 줄
    (`.shopbar__rwcards`)에 그린다.
- 동결 버튼 (2026-10-06 프리팹으로 확인): `btn_frozen`의 3상태 스위치가 `_unselect` = `group_disable`(`bg_lock` + `frozen_icon_lock`),
  `_firstSelect` = `group_lock`(`frozen_bg_normal` 파랑 + `frozen_icon` 눈송이), `_secondSelect` = `group_unlock`(`frozen_bg_unselect` 흰 파랑 + `frozen_icon2`
  빗금 친 눈송이)이다. 그룹 이름은 상태가 아니라 누르면 하는 동작(잠그기·풀기)이고, 원본도 동결 중에 `frozen_icon2`를 쓴다 → 평소 파랑 + 눈송이,
  동결 중 흰 파랑 + 빗금 눈송이(지금 코드 그대로). 어느 그룹을 켜는지는 클라 규칙을 아직 안 읽어 아이콘 짝으로 판단했다. 비활성(관전 등)은 `bg_lock` +
  회색 아이콘(`*_icon_lock`과 같은 그림이라 CSS 회색 필터로 근사, 갱신 버튼도 같음).
- 아직 없는 것: 접기 상자의 마스코트 Spine(`trap_1096_acshopup`, 텍스처 미추출 — PIXI로 따로 그려야 함), 웹 소재의 `shopPanel/level`이 다른 그림이라
  승급 상자의 "LEVEL"은 글자로 그림.

## 휴식 진입·현상 수배·전투 종료 화면 (2026-10-06)
관리자 요청: 휴식 시간 진입, 현상 수배 선택, 전투 종료를 실제 게임(KR 클라이언트 영상 캡처)과 같게. 근거는 EN 클라이언트
`ui/autochess/[uc]autochessbattle.ab`의 프리팹 좌표(1280×720 캔버스, 1단위 = 1920 기준 1.5px, `--pu`)와 9-slice 테두리(스프라이트 `m_Border`).
- 라운드 시작 배너(`round_start_dialog`): ROUND_START의 PhaseBanner 대신. 어두운 판 `round_bg`(9-slice 79/82/75/79) + 등고선 `round_bg_line`(#31543b),
  왼쪽 픽셀 마스코트(`round_emoji_head/body/hand`, 클립보드 `round_emoji_book`은 `book_mask` 상자(11.6° 기울임) 안에서 머리 위에, 떠다니는 #1aad88 네모 5개, 모서리 `round_cross`, `common_frame` 괄호, `round_text_01/02`),
  [回合] 상자(라운드 두 자리, 40 #dfdfdf — 글꼴은 「HUD 숫자 글꼴」) · [获得] 상자(#ffbc09, `round_sources_icon` + `round_plus` + 이번 라운드 시작에 들어온 자금 #ffba00).
  자금은 `useRoundGold`: ROUND_START가 되기 직전 마지막으로 알던 자금과의 차이(소득 + 미지급분 + onRoundStart 지급 — 서버는 `Match.startRound`에서
  한 번에 보냄). 웹 소재(`roundStartDialog/*`)라 모든 플레이어에게 같다. 프리팹의 `round_countdown`(보스까지 남은 라운드 안내)은 넣지 않았다.
  [추정] 금색 입자·글로우(프리팹은 ext 스프라이트·ui_particle)는 CSS로 비슷하게.
- 机变/悬赏 선택 화면(`autochess_battle_effect_choose_panel`): 배경 `bg_grad` + `repeat_line` + #242424 45 %, 제목 40(가족 색 typeTxtColor #35d8b4,
  특수 #f2bd3e) 뒤 `title` 장식, 3단위 세로줄, 설명 18 + 공지 15 「选择后不可更改」(KR 「선택 후 변경 불가」, CN 원문 [추정]). 원본의 시간 안내 줄은
  공식 모양에서는 숨김. 오른쪽 차례 표시는 다른 사람 차례만 #c2c2c2 + `tip_wait`(내 차례는 「내 차례」 오버레이가 알려 주므로 원본의 「내 차례입니다」 띠를 숨김 — KR 캡처에서
  오른쪽 위가 비어 있음; 프리팹의 `root_self`(`tip_glow` + #00ffc4)는 쓰지 않음).
  카드(`card_small_item` 307×271): 판 `card_bg_normal`(종이 겹친 모양), 아이콘 86, 이름 20 흰색, 설명 16 #cecece 80 %.
  긴 설명(관리자 결정 2026-10-12 「공식대로 카드 안 스크롤」): 글은 줄 수로 자르지 않고 카드 안에서 세로 스크롤 — 공식 `group_layout`(286×236, 판 위·아래
  17.5 안쪽)이 아이콘·이름·설명을 함께 담은 세로 ScrollRect(Clamped, 스크롤바 없음, 화살표 칸 `_topArrow`/`_downArrow`는 비어 있음, `_btnExpand`도 비어 있음).
  세트 효과 줄이 붙은 아이템(패밀리 배지·사막 나침반 등)은 데스크톱에서도 넘친다. 글은 공식 원문 그대로(`effectDesc` = 장치 스킬 설명; 한국어도 KR 클라
  `activity_table` 문장과 같음 — 우리가 늘린 글이 아님). 우리 추가: 더 있는 쪽 가장자리를 흐리게 하고 작은 ▲/▼(관리자가 고른 안), 스크롤하면 등급 칩이
  내용과 함께 빠짐(공식은 칩도 스크롤 내용 안). 휠·드래그로 스크롤, 드래그는 카드를 고르지 않음, 탭은 그대로 두 번 탭 선택. 선택(첫 탭)하면 `card_select_glow`
  (9-slice 44) + `card_select_frame`(9-slice 8) + 아래 막대 `card_btn_bg`(9-slice 292|38, 354 폭) + `card_btn_icon` + 「确认选择」(KR 「선택 확인」) — 막대를
  다시 누르면(카드 두 번째 탭) 확정. 막대 위치는 프리팹 −122가 아니라 카드 아래쪽에 맞춤(KR 캡처, `card_small_select` 애니메이션이 올리는 양 [추정]).
  가져간 카드: `card_bg_selected` 회색 판 + 회색 줄무늬, 오른쪽 위 둥근 아바타(`avatar_head_bg` + 청록 고리 `avatar_head_outline`). 헤더의 확인 버튼은 공식
  모양에서는 숨김(카드 막대와 같은 동작). 6장은 3×2(16:9 한 화면에 맞게 `--pu` ≤ .125vh), 3장(혼자)은 한 줄.
  「轮到你了」(KR 「내 차례」, `panel_player_select`): 멀티에서 내 차례가 되면 1.333초(공식 클라에서 확인 2026-11-16: `_PlayPlayerTurnAnim`이 클립
  `panel_your_turn_show`(30 fps, 마지막 키 40프레임 = 1.333초 — 뿌리 알파가 1.167초에서 0으로)를 클립 길이 그대로 선형으로 한 번 틀고 끝나면 패널을 끔;
  전에는 어림한 1.6초) — `bg_circle`, 고리 3개(관리자 결정 2026-11-16: CSS `radial-gradient`로 공식 셰이더 모양을 그림 — 소재 없음.
  공식 클라에서 확인 2026-11-16: 고리는 그림이 아니라 셰이더다 — 스프라이트 `img_uifx_circle`(`arts/ui/[uc]fxcommon.ab`)은 흰 원판이고, 머티리얼
  `m_wipe_circle`(`Torappu/UI/Dissolve/UI-DoubleDissolve-Tex`, `_ImageControl` 1)이 Image 색의 G로 문턱(2G − 1)을 정해 방사 마스크
  `img_uifx_basicmask_07`(`_Revert2` 1, 부드러움 0.015)의 바깥 띠만 남긴다; R = 0이라 첫 마스크는 늘 통과. 색은 머티리얼 `_Color` #18e6b8(Image 색의
  RGB는 문턱으로만 쓰임 — 프리팹의 #00e9ff 등을 칠하면 틀림), 알파는 Image α. 끝 키의 안쪽 반지름은 바깥의 0.823·0.948·0.683(circle1·2·3, 상자
  300.97·206.97·175.47; 마스크를 4000점으로 잘라 잰 값 — 시안의 0.825·0.948·0.685는 600화소 표본), 띠 안쪽 가장자리 폭 ±0.4 %.
  클립 `panel_your_turn_show`(시각 ÷ 1.333초 = 키프레임 %, 키의 Hermite 기울기는 `cubic-bezier`로 그대로): 세 고리 α 0(0.067초) → 0.15(0.167) → 0.102(0.5);
  크기 0.3(0.067) → 0.922 → 1 — circle1 0.2·0.533초, circle2 0.233·0.633초, circle3 0.267·0.733초; circle1·2는 G가 올라(0.700 → 0.915, 0.841 → 0.989)
  안쪽 반지름이 0.50 → 0.823, 0.71 → 0.948로 줄어듦(마스크가 선형이 아니어서 G 곡선을 30 fps로 반지름에 옮겨 키프레임으로; 등록한 `@property`라
  부드럽게 움직이고, 없는 브라우저는 단계로); circle3은 G 키 없음(0.8196); `root_circle` 1 → 1.05(1.167초) → 1.2(1.333초) 선형.
  같은 패널의 빛 번짐 `glow_behind`(655×608, plus 위·큐브 아래)·`glow_front`(333×309, 맨 위): `img_uifx_basicglow_01`(흰색, 알파가 반지름의 가우스꼴
  — 1 · 0.73(¼) · 0.29(½) · 0.06(¾) · 0) + `m_add`(`Torappu/UI/AlphaBlend`: rgb = 텍스처 × Image 색, SrcAlpha + One = 더하기) → CSS 타원
  `radial-gradient` + `mix-blend-mode: plus-lighter`, 색 #004435·#adffed, α 0 → 1 → 0(0.1·0.167·0.833초)·0 → 0.3 → 0(0.1·0.167·0.5초).
  재생 중 `.pcturn` 뿌리가 겹침 층을 만들어 더하기는 그 층 안(배경 원판·고리·plus)에만 더해지고 층 밖 카드 위에는 보통 섞기로 얹힘 — 어두운 바탕이라
  차이가 작아 둠. 움직임 줄이기 설정이면 고리는 끝 키 그대로, 빛 번짐은 안 보임. 재발 방지: `test/ui/turn-flash-rings.test.js`),
  `plus` 4개 #18e6b8, 큐브 `square_1` + `square_2`, 글자 49 #00ffc4, `bottom` 막대. 나머지 요소도 같은 클립의 키 그대로(공식 클라에서 확인
  2026-11-16: `m_FloatCurves`·`m_ScaleCurves`, 첫 키 전은 첫 키 값, 기본 스타일 = 끝 키): 패널 뿌리는 크기 키가 없고 α가 1.167초까지 1(전에는
  어림한 투명 → 불투명·1.12배 → 1로 들어옴); `bg` α 0(0.033) → 0.9(0.1) → 1(0.433), 크기 0 → 0.917(0.133) → 1(0.7); `root_plus` 묶음 α 0(0.067) → 1(0.167),
  `m_SizeDelta` 158×96(0.1) → 228.6×139.9 → 248×152(0.433)이라 모서리 plus가 밖으로 벌어지고, plus 4개 색 흰색(0.167) → #18e6b8(0.833);
  `square2`(불꽃, 프리팹 순서대로 `square1` 아래) 크기 0.164(0.1) → 1.406 → 0.845 → 1(0.3), α 0 → 1(0.1 → 0.133); `square1`(큐브) y 511 → … → −1.2(0.133) →
  17 → 6(0.267)로 위에서 떨어지며 x·y 크기를 따로(0.89×1.12 → 0.55×2.69(0.1) → 1.12×0.92 → 1(0.2); 기울기가 달라 y는 `scale`, x는 `transform`),
  α 0 → 1(0.067); 둘의 자식 `add`(`square_fill_1`·`_2`, `m_add` 더하기) α 0(0.1) → 0.5·0.47(0.133) → 0(0.5) — Image α는 자식에 안 걸려 큐브 상자는 움직임만,
  그림과 `add`가 각자 α; `root_bottom` 묶음 α 0(0.067) → 1(0.167), y −11 → −43.5 → −49.4 → −51.9(0.2) → −50(0.267); `text` 색 #abffec(0.167) → #00ffc4(0.5);
  `bottom/add`(흰 `white_sprite`, `m_add`) α 0.502(0.167) → 0(0.5). `root_bottom`은 프리팹대로 막대 다음에 글자. 공식 모양일 때는 机变 진입의 PhaseBanner 띠를 띄우지 않는다(겹침).
  1인 판에서는 띄우지 않는다(`screens/game.js` `!solo`) — 공식 1인 녹화(3라운드 임기응변에 「轮到你选」 없음, upstream PR #950이 #946에 붙인 것)와 같음.
  웹 소재(`effectChoose/*`, `shopCard/repeat_line`)라 모든 플레이어에게 같다.
- 전투 종료 배너(`round_result_dialog`): 내 일반 전투(COMBAT)의 결과가 오면. 스크립트의 애니메이션 3개(`_allPrefectAnim` panel_perfect,
  `_perfectAnim`·`_missAnim` panel_miss)를 이렇게 맞춤: 완벽한 작전 → panel_perfect(청록 빛 판 `bg_all` 9-slice 95/95/86/85, X 눈 큐브 + 검 #39d3a5,
  「战斗结束」/「完美作战！」 #2ce3b8), 셈하는 누수가 있으면 → panel_miss(어두운 판, 해골 큐브 `miss_emoji_head` + 몸 + 내린 검 #1aad88,
  「目标生命值减少」 #f24549 + `blood_icon` + 잃을 LP #ff3b3b — `Match.settle`처럼 `counted !== false`인 누수 수를 라운드 상한(`lpCapPerRound` 10)으로 자른 값, 联防이 다시 배분하기 전 값;
  2026-10-09 관리자 제보 전까지 상한 없이 누수 수를 그대로 띄워 실제 LP −10인데 배너만 17로 보였다),
  잃은 LP 없이 완벽 아님 → panel_miss 제목만 — 공식 클라 `AutoChessBattleUIRoundResultDialog.OnRender`(2026-10-10 확인):
  `_panelPerfect` = `isAllPrefect`, `_panelMiss` = 그 반대, 잃은 HP 글자는 `lostHp > 0`일 때만; 애니·소리는 완벽 → `_allPrefectAnim` + NOREDUCE,
  완벽 아님·`lostHp ≤ 0` → `_perfectAnim`(panel_miss) + NORMAL, 그 밖 → `_missAnim` + REDUCE(우리 소리 짝 `audioOfficial.js`와 같음). 갈림은 누수
  「셈」이 아니라 잃은 HP — **관리자 결정 2026-10-11: 클라대로 「이번 결과에 든 플레이어별 LP 손실」**(공식 클라
  `AutoChessBattleUIViewModel.GetBattleResultStatus`: `isAllPrefect` = 모든 플레이어 `hpCost ≤ 0`, `lostHp` = 보고 있는 플레이어의 것).
  그래서 panel_perfect는 모두 0일 때만, 셈하지 않는 누수만 있는 솔로 판은 손실 0이라 panel_perfect, **협동에서 나는 0인데 팀원이 잃으면 panel_miss
  제목만 + NORMAL**(옛 동작은 완벽한 작전). 협동 값은 SETTLE의 `m.public.roundLosses`(살아 있는 모든 플레이어의 이번 라운드 차감 [추정: 「결과에 든」
  범위]) — `audio.md` 「작전 종료 효과음」(되돌리기 포함). 공식 결과 창 최대 표시 `MAX_SHOW_TIME` 4초(우리 배너 1.8초 — 애니
  길이 미확인이라 그대로). 공통: 모서리 `left_cross`, `left_frame` 괄호, `doc_text_01/02`(#18e6b8),
  오른쪽 SIGNAL `doc_01` · 점 2×3 `dot_blank`(#28c79f, 알파 .6/1/.2/.6/.4/1) · 오른쪽 위 점(#279481). 보스전(최종 공세·隐秘核心)은 공식에 다른 프리팹
  (`panel_win_*`, `panel_lose_*`)이 있어 이 배너를 띄우지 않는다. **이 그림들은 웹 소재에 없어 로컬 추출(ui/battle)이 있을 때만 배너가 뜬다**(없으면 upstream의
  「作战结束」 상자). 내 전투 결과가 오지 않은 라운드(서버 전투 모드·재접속)는 SETTLE에 띄우고, 라운드마다 한 번만 — `upstream.md` 「0.2.0 병합」.
- 9-slice 판은 `::before`로 그린다(판 자체에 테두리를 주면 자식 위치 기준 상자가 테두리만큼 줄어든다).
- 번역(ui.json): 「选择后不可更改」「轮到你了」「确认选择」(공식표의 「확인」 대신 KR 캡처의 「선택 확인」 — 모든 确认选择에 적용) 「战斗结束」「完美作战！」「目标生命值减少」.
  CN 원문 문자열은 클라이언트 문자열표에서 못 찾아 [추정](KR 캡처 문구로 역추정).
- 개발 목업: `dev/game-mock.html`에 ROUND_START(라운드 3, 자금 +6) 추가.
- 관리자 제보 수정(2026-10-06 3차):
  - [获得]가 늘 0: 서버는 `m.private`(새 자금)를 먼저, 10/s로 묶인 `m.public`(단계 ROUND_START)을 나중에 보낸다 → `useRoundGold`가 단계가
    바뀔 때 잡는 기준값이 이미 새 자금이라 차이 0(디버그 고정 99가 아니어도, 실제 서버에서 1–3라운드 모두 0 확인). 또 배너는 단계가 PREP로 바뀐 뒤에도
    떠 있어 그때 0으로 떨어졌다. 수정: `server/local-patch.js`가 `Match.startRound` 동안의 `addFunds`를 모아 `m.private.roundGold { round, gain }`로
    보내고(자금 고정 중에는 고정 전 금액 합), `useRoundGold`는 이 라운드의 값이 있으면 그것을, 없으면(원본 서버) 예전 차이를 쓴다. 배너는 한 번 받은
    값을 끝까지 유지. 확인: 실제 솔로 판 1–3라운드 +4/+5/+6(고정 없음·`SP_DEBUG_FUNDS=99` 모두).
  - 선택 화면 배경: 원본은 왼쪽 2.8rem(플레이어 목록 칸)을 비운다 → 공식 모양에서는 화면 전체(`.gm > .spov.has-phase-art`).
  - 왼쪽 아래 버튼(소통·채팅·설정·설명·전체 화면): `.gm__corner`를 `.gm__hud`(z 3 쌓임 맥락) 밖, 선택 화면 뒤로 옮겼다(`screens/game.js`).
    평소 z 3(HUD 위 — 정보 카드에 가려지지 않음, 방향 휠 z 6 아래), 선택 화면이 있으면 `is-over-choice`로 z 21. 위치는 안전 영역만큼 띄운다.
- 관리자 제보 수정(2026-10-15, 悬赏 선택 중):
  - 왼쪽 플레이어 목록과 이모티콘 말풍선이 선택 화면 배경(z 20)에 가렸다 — 목록이 `.gm__hud`(z 3 쌓임 맥락) 안에 있었기 때문.
    목록을 HUD 앞의 자기 층 `.gm__side`(HUD와 같은 상자·안전 영역, z 3 — DOM에서 HUD 앞이라 정보 카드 등 HUD 판 아래)로 옮기고,
    선택 화면이 있으면(`.gm.has-sp`, 교편 개인 선택 포함) z 21. 모서리 버튼(z 21, DOM에서 뒤)은 그 위. 선택 중에도 초상을 눌러 볼 수 있다(원본 모양과 같음).
  - 제목이 위에서 1.14rem(원본의 위 띠 자리) 내려와 있었다 → 공식 `panel_choice` 배치: `group_title` 왼쪽 위 (124.2, 0)·800×145, 제목 줄
    (`root_multi`, 56)은 x 124.2 + 400 − 342.9 = 181.3부터, 중심은 위에서 72.5 − 13.3 = 59.2. 플레이어 목록(≈ 123까지) 오른쪽이다.
    우리 차례 줄(공식에 없음)도 181.3부터. 카드(`group_card_small`)는 화면 가운데에서 27 오른쪽.
  - 말풍선이 초상에서 약 50단위 떨어져 떴다(행 폭 — 숨긴 이름·LP·태그 — 의 오른쪽 기준). 공식: `autochess_emoji_pop_item`(112×100, 피벗
    (0.08, 0.52) = 꼬리 끝)을 `player_status_item`의 `emoji_ref_rect`(초상 가운데 87×87)에 — 꼬리 끝을 초상 오른쪽 3.5 바깥, 초상 높이 가운데에
    ([추정] 기준 사각형의 오른쪽 가운데에 피벗을 둔다고 읽음 — 위치를 정하는 곳은 공식 클라에서 못 찾음). 말풍선 크기는 그대로(1.08rem, 공식 112단위보다 작음).

## 배치 UI (2026-10-06)
관리자 요청: 보드에 기물을 배치할 때(드래그·방향 선택)를 실제 게임과 같게. 근거는 관리자가 준 KR 클라이언트 플레이 영상 캡처 2장(2000×1125,
드래그 중 / 방향 선택 중)과 EN 클라이언트 `battle/[pack]common.ab`(`panel_direction_selector`, `range_material`), `arts/ui/[uc]battlecommon.ab`(그림).
- 추출: `tools/local-extract/extract.py` JOBS 2줄 → `assets/local/ui/battlecommon/`(`sprite_direction_arrow`·`sprite_direction_thumb`·
  `sprite_rectangle_frame_triangle`·`btn_cancel`·`btn_drag_back`), `assets/local/battle/common/sprite_attack_range.png`, `data/local-assets.json` 그룹
  `ui/battlecommon`·`battle/common`. 다시 뽑기: `.venv-extract/bin/python tools/local-extract/extract.py --game <…/StreamingAssets/AB/Windows> --only ui/battlecommon --only battle/common`.
- 배치 가능 칸(3D 보드, `board3d/tileOverlay.js` tint): 칸 기둥(윗면 + 높은 칸의 옆면)을 초록으로 **곱한다**(2× modulate, src 0.29·0.55·0.29) —
  바닥 무늬가 그대로 비친다. 캡처에서 회색 높은 칸 윗면 128,125,113 → 66,130,66, 모래 칸 → ≈144,230,89를 맞춘 값(우리 렌더 모래 칸 148,240,98).
  [추정·미조사: 클라 값을 아직 안 읽음] 방식: 클라이언트의 칸 강조는 셰이더 `Torappu/Scene/Special/HighlightTile`에 머티리얼을 실행 중에 만든다. 테두리 없음, 놓을 칸의
  흰 표시·출발 칸 표시도 없음(빨간 불가 표시는 유지). 방향을 고르는 동안에도 초록이 남는다(캡처 그대로, `holdPiece`가 다시 켜고 닫힐 때 끔).
- 공격 범위(3D 보드, stripes: 방향 선택 `facing`, 선택한 기물 `selRange` 등): `range_material`(셰이더 `Torappu/Battle/AttackRange`: 알파 블렌드,
  깊이 쓰기 없음, `_Color.a` 0.749, `_AnimationSpeed` 0.5)대로 `sprite_attack_range`(대각선 흰 줄 3개/칸) × 색, 흐르는 방향 [추정·엔진: 셰이더의 흐름 방향은 안 읽음]. 그림이 없으면 같은 모양의 절차 텍스처. 이전의 Pixi 주황 칠·SVG 줄무늬는 3D에서 안 그린다.
  색(2026-11-11, 공식 클라에서 확인): 전투 씬의 `GridRangeDrawer`가 실행 중에 머티리얼 색을 정한다 — 보여 줄 범위(`Unit.rangeToShow` = 지금 모드의 `_rangeToShow`, 없으면 공격 트리거)의 능력이 치료 능력(`BattleUtil.IsAbilityHeal`: `Abilities.Heal` 계열)이면 `_healRangeColor` (0, 200, 255), 아니면 `_attackRangeColor` (255, 128, 0). 두 시즌 모든 전장 씬이 같은 값(전에 쓰던 주황 255,140,0은 캡처로 맞춘 근사였다). 오퍼레이터의 공격 능력은 그 범위의 부모 오브젝트 `Attack`(또는 `Heal`)의 첫 능력 컴포넌트다: 두 시즌 풀의 오퍼레이터·대체 오퍼레이터 전원을 프리팹으로 대조하니 `Heal`/`RangedHeal`인 것은 정확히 직업 메딕 중 주술 의료(incantationmedic: 공격 능력이 피해 공격)를 뺀 것이고, 바드(스카디 더 커럽팅 하트·이디아)는 `AuraAbility`라 주황이다 → `ui/facing.js healRange`. 방향 선택(`FACING_HEAL_STYLE`)과 상세 카드의 범위(`SEL_RANGE_HEAL`, 정비·전투 모두)가 쓰고, 3D 판은 파란 층(`tileOverlay` `healStripes`)을 하나 더 둔다. CN 「규정」 캡처에서 해럴드(메딕, 공격 오브젝트에 능력 셋 — 첫째가 `RangedHeal`)의 방향 선택 범위가 파랗다(≈ 40,170,230, 초록 칸과 섞임). 필드 메뉴의 스킬 범위 토글(`GridRangeDrawer.TurnOnSkill`)은 직업과 상관없이 늘 `_skillRangeColor` (255, 0, 0) 빨강이다(공식 클라에서 확인) → `SEL_RANGE_SKILL`, 빨간 층 `skillStripes`.
- 끄는 기물과 원래 자리(관리자 확인 2026-11-16, 공식 영상 캡처: 「끌 때 투명해지지 않고 원래 모습 그대로, 필드에 있던 기물이면 원래 자리에 외곽선과 음영」):
  끄는 기물은 불투명 그대로 — 끌 때도 방향을 고를 때도. 전에는 반투명 `GHOST_ALPHA` 0.6(옛 관리자 제보 「배치 중에는 더 투명하다」를 따른 추정)이었는데
  이번 확인과 어긋나 뺐다. 공식 클라에서 확인(2026-11-16): 공식 끌기(`AutoChessDragState`)는 기물을 옮기지 않는다 — 들어올 때(`OnEnter`) 시작 칸의
  캐릭터를 `AutoChessDummyManager.MarkLeaving`으로 받아 `_CreateOutline`이 몸 색에 상태의 `_overlapColor`(회색 .667, 프리팹 값)를 곱하고
  (`Unit.ModifyDefaultColor`) Spine 외곽선(`BattleSpineOutlineManager.ResetMeshByAnimator`)을 켜며, 포인터는 그것으로 만든 더미(`_CreateDummy` →
  `AutoChessDummyManager.CreateDummy` → `BattleController.CreateCharacterDummy` → `Character.MakeDummy`)가 따라간다. 더미 길과 놓은 뒤의 방향 선택
  (`_TryMoveToNextState`: 더미를 놓을 칸에 세움 → `UIDirectionSelector.Show` → `BattleController.OnDummyTouchedToTile`, 이 모드는 플러그인·게임 모드 기본
  구현)에는 알파·머티리얼·색 호출이 없다 — 그래서 방향을 고를 때도 불투명으로 둔다. 상태를 나갈 때(`OnExit`: `MarkReturned` + `_ClearOutline`) 색과
  외곽선이 돌아온다 — 방향 선택도 같은 상태 안이라 그때까지 원래 자리 표시가 남는다. 시작 칸이 대기석이어도 같은 길이다(`MarkLeaving`이 없으면 끌기가
  시작되지 않음).
  우리는 뷰 자체가 움직이므로 끌기 시작 때 그 모습을 한 번 그려 원래 자리에 남긴다(`render/home-mark.js`, `UnitView.markHome`·`clearHome`, `render/app.js
  startDragVisual`·`releaseHome`): 몸(모델·임포스터·초상 마름모)을 스냅숏으로 그리고, 스냅숏을 원 둘레 12곳에 밀어 그려 외곽선 색으로 채운 위에
  회색(170, 170, 170)을 곱한 스냅숏을 얹은 텍스처 하나 — 끄는 동안은 스프라이트 하나를 칸 자리에 놓기만 한다. 놓고 방향 선택이 없거나 끌기를 취소하면
  (`pieceDragEnd` 뒤, 방향 휠이 잡지 않았을 때), 방향을 고르거나 취소하면(`holdPiece(uid, null)`) 지운다.
  외곽선 값: 이 모드의 설정(`AutoChessGameMode.OUTLINE_CONFIG`)은 크기 0.04·색 `#00928388`·8방향이고 셰이더는 `Spine-Skeleton-BattleOutline`인데,
  셰이더의 섞기와 크기 단위는 안 읽었다 [추정·화면: 공식 영상 캡처에서 잼] — 색은 손 칸 장비 고리와 같은 `COLORS.heldOutline`(캡처 외곽선 ≈ 70–100,220–245,190–220),
  두께는 같은 약 1/64칸(캡처 칸 약 170 px에 2–3 px). 원래 자리 표시에는 그림자가 없다(`MarkLeaving`이 그림자와 방향 표시를 끈다, 공식 클라에서 확인).
  - 정비 HUD(티어 칩·장비 막대·소환물 개수·엘리트 표시)는 원래 자리에 남고 끄는 더미에는 없다(2026-11-16 공식 캡처): 표시가 서 있는 동안 `UnitView`가 HUD를
    원래 자리(`_homeAt`, 끌기 들림 뺀 자리)에 그린다(`update` → `_updateHud`의 `at`). 표시가 지워지면 다시 뷰를 따라간다.
  - 다른 캐릭터가 선 전장 칸에 놓아 방향을 고를 때(맞바꾸기, 공식 클라에서 확인 — `_TryMoveToNextState`): 놓을 칸의 캐릭터(`AutoChessDummyManager.GetCharacter`)가
    있고 전장 칸이면 더미를 칸 자리 + `_overlapOffset`(0, 0, −0.45)에 세운다 — 전투 좌표계의 z는 −높이라 0.45칸 **위로** 띄운다. 시작 칸 ≠ 놓을 칸이면
    그 캐릭터의 몸 색에 `_overlapColor`를 곱한다(`_DoBattleOverlap`, 외곽선 없음), 상태를 나갈 때 `_RevertBattleOverlap`이 되돌린다. `MarkLeaving`이 끄는
    캐릭터를 더미 목록에서 빼므로 제 칸에 다시 놓을 때(방향만 바꿈)는 칸이 빈 것으로 보여 띄우지도 어둡게 하지도 않는다. 우리: `render/app.js holdPiece`가
    그 칸의 다른 정비 기물을 찾아 들고 있는 자리(`held`)를 `HOME_MARK.overlapLift`만큼 올리고 그 기물에 `setOverlap(true)`(모델·임포스터·초상 마름모 색 ×
    회색), `holdPiece(uid, null)`이나 다시 부를 때 되돌린다.
  - 손 칸 장비도 같은 끌기 상태라(공식 클라에서 확인) 칸에 남는 장비 모델·아이콘 판에 같은 회색을 곱한다(`ItemView` 끄는 동안, 고리와 끄는 사본은 그대로).
  재발 방지: `test/render/home-mark.test.js`.
- 모듈로 늘어나는 공격 범위(관리자 제보 2026-10-10: 정예 「시」 SPC-X가 방향 선택 줄무늬·배치 중 카드에서 3×3으로 보임): `shared/loadoutRecord.js
  attackRangeGrid`가 중국어 문구(`trait.moduleDesc` 「攻击范围扩大」, 스킬 「被动效果：攻击范围扩大」, `traitRangeExtend`의 「集成战略」)로 판단했는데 클라는
  한국어 등 게임 문구 덮어쓰기(`data/i18n`)를 입힌 기록을 쓰므로 한국어에서 늘 실패. 이제 `tools/build-data.mjs`가 같은 판단을 언어와 상관없는 표시
  (`trait.rangeUp` / `otherMode`, 스킬 `passiveRange`)로 데이터에 넣고 그것을 먼저 읽는다(없으면 예전처럼 문구). 서버·전투는 중국어 데이터라 원래 맞았다
  (배치 뒤 클릭이 맞게 보인 이유: 전투·서버 값). 테스트 `test/ui/range-i18n.test.js`(ko/en/ja/zh-TW 모든 기물·모듈·스킬이 중국어와 같은 범위).
- 방향 선택(`ui/placeArt.js`, 공식 그림이 있을 때만 — 없으면 원본 휠): 클라이언트 `panel_direction_selector` 구성대로
  - 마름모(`offset` 426 회전 −45°, 반대각 301단위)의 네 꼭짓점 쪽 L자 테두리(흰색, 고른 방향은 `_highlightColor` 255,226,176) + 고른 꼭짓점에
    `sprite_direction_arrow`(빛나는 V). 마름모 밖은 검정 39 %(`mask_*`, HUD까지 — 캡처에서 밖이 0.61배).
  - `panel_cancel_hint`(회전한 사각형의 (−327, 0) = 왼쪽 위 변 바깥): 방향이 없을 때 `btn_cancel`(빨간 변 + ✕ 태그, 눌러서 취소), 방향을 고르면
    `btn_drag_back`(검은 말풍선), 0.16초 페이드. EN 그림의 영어 글자는 잘라내고 게임 문자열을 그린다: 取消 → 취소, 拖回中心区域取消 → 「방향을 가운데로
    되돌려 취소」(KR 캡처 문구로 ko 번역 변경).
  - 사분면 테두리는 `sprite_rectangle_frame_triangle`(18², 9-slice 테두리 6) — 흰색이 테두리 6단위 중 바깥 4단위라, 마름모 변에서 2단위 안쪽에
    중심을 둔 4단위 선(2026-10-31, 전에는 변 위 3.6). 고른 방향은 색만 바뀐다(전에 있던 빛 번짐은 프리팹에 없어 뺐다).
  - [추정] 마름모를 바닥 평면에 투영(아래 칸의 화면 모양으로 기울임)하고 반대각 2.6칸(`DIR_HALF_TILES`, 캡처: 약 325 px / 칸 125 px). 말풍선은
    글자가 눌리지 않게 화면에 똑바로. 엄지(`sprite_direction_thumb`)는 캡처에 안 보여 그리지 않음.
- 2D 보드(WebGL2·로컬 그림 없음)는 초록·주황 강조가 원본 그대로(방향 선택 그림만 공식).
- 확인: `public/dev/game-mock.html?stage=act1autochess_m02`(사막)·`act2autochess_m01`, 2000×1125·1920×1080 headless 캡처를 관리자 캡처와 나란히 비교,
  취소 태그 누르기·방향 확정 동작. 테스트 `test/render/placement-ui.test.js`.
- git 밖 생성물: `public/assets/local/ui/battlecommon/`, `public/assets/local/battle/common/`, `data/local-assets.json`(바뀌면 `node tools/build-browser-resources.mjs`).

## 선택 메뉴 — 퇴각·판매 (2026-10-31)
관리자 요청: 기물을 눌렀을 때 나오는 퇴각·판매 버튼을 공식 UI(프리팹)로. 전에는 점선 마름모 + 민트 모서리 + 팔각 판(자체 디자인, `ui/underframe.js`)이었다.
이제 로컬 그림이 있으면 `ui/underframeArt.js`가 그리고, 없으면 예전 모양 그대로(원본 PR 가능).
- 근거: `ui/autochess/[uc]autochessbattle.ab` `act2autochess_panel_character_menu`(`AutoChessCharacterMenuPanel`, 캔버스 `m_RenderMode` 2 = 월드 공간)와
  그것이 필드 기물에 띄우는 `arts/ui/[uc]battlecommon.ab` `underframe_panel`(`UIBattleUnderframePanel`). 공식 클라에서 확인한 분기
  (`_RenderBattleField` / `_RenderHand` / `_RenderDestoryMagic`, `UIBattleUnderframePanel.Render`, `AutoChessUnderFramePanelButton.Render`):
  - 필드 기물 → `underframe_panel`을 발밑(`footMountPoint`)에: 빛나는 흰 마름모 `sprite_character_menu_frame`(그 밑에 검정 35 % 사본), 왼쪽 위 변
    가운데에 퇴각 `btn_escape`(누름 `hotspot` 220², 그림 190²) — 장비·마법 기물이면 그림이 `icon_withdraw_magic`이고 누르면 파기. 판매 판(`util_btn`)은
    소환물이 아니고 정비 중일 때만, `_underFramePanelBtnParamSellPos` (208, 219)에: `btn_bg_yellow` + 검정 `icon_sell`(`_defaultIconColor`) + 「판매」
    (검정 0.9) + 가격 `img_bg_price_enough` 「+N」(#e8e8e8), 누름은 `collider` 155×124. DESTROY는 같은 판을 빨강(`btn_bg_red` + `icon_destory`)으로
    퇴각 자리(−195, 195)에 두고 퇴각 그림자를 끈다. `dontBlockClick`이 켜져 막는 판(`block_mask`)은 꺼진다 — 패널 밑 다른 기물도 눌린다.
  - 스킬 버튼(관리자 요청, 같은 날): `showSkillBtn` = 오퍼레이터 + 정비 중일 때 `group_skill`(`AutoChessUnderFrameSkillButton`, 190²)을
    오른쪽 아래 변 가운데 (195, −195)에. 공식 클라에서 확인(`Show`·`_SetData`·`_UpdateData`·`OnSkillButtonClicked`·`OnSkillRangeToggled`·
    `_DoUpdateRangeToShow`·`_UpdateSkillCount`, `BasicSkill`/`SkillData.get_needToDisplay`, `Character.GetRangeOfSkill`·`get_rangeToShow`,
    `Unit.get_rangeToShow`, `BasicSkill`/`CastSkill`/`NextAttackOrCombatSkill`/`ReplacementSkill.get_rangeToShow`). 이 메뉴 클래스들은
    위수협의 전용(`AutoChess…`)이라 읽은 동작이 곧 위수협의 동작이고, 거기서 부르는 스킬·범위 함수는 전투 공용 코드에 위수협의 분기가 없다.
    켜진 Lua 핫픽스(en_US·zh_CN)도 이 메서드들을 덮지 않는다. 필드 기물 메뉴 전체(`_RenderBattleField`): 퇴각은 늘, 판매 판은 소환물이 아니고
    정비 중일 때, 스킬 버튼은 오퍼레이터이고 정비 중일 때(장비·마법 기물은 퇴각 자리가 파기).
    - 판은 스킬이 있고 `needToDisplay`이고 `skillType`이 PASSIVE가 아닐 때만. `needToDisplay` = 스킬 프리팹의 `_hidden`이 꺼짐 ∧ `skillId`가
      비지 않음 — 풀 스킬 프리팹 전부(302개)에서 `_hidden`이 켜진 것은 없어 패시브가 아니면 늘 그린다. 소환물·아이템·대기석 기물에는 없다.
    - 아이콘 `btn_skill` 168×176 = 로드아웃이 고른 스킬의 아이콘(상세 카드와 같은 계산, `ui/assetUrls.js loadoutSkillIconUrl`). 누름은 아무것도 안 한다
      (`OnSkillButtonClicked`가 빈 함수). 그 밑 준비 안 됨 막대 `sprite_skill_notready`(늘 켜짐)와 SP 글자 `text_sp_progress`(30, 흰색)
      「0/N」(`"{0}/{1}"`에 `"0"`·`spCost`).
    - 범위 토글 `toggle_skill_range`(136×138 @ (165, −10), 왼쪽 끝에 잇는 막대 `image_link`): `Character.GetRangeOfSkill`(= 스킬의
      `rangeToShow`)이 있고 유닛의 `rangeToShow`(지금 모드의 범위)와 **다른 객체**일 때만 보이고 꺼진 채 시작 — 칸 모양이 아니라 객체를 견준다.
      스킬 범위는 `rangeId`가 있으면 프리팹의 `_rangeToShow`(대상 선택기)나 `_trigger`라 유닛 범위와 늘 다른 객체 → 공격 범위와 칸이 같아도
      토글이 나온다(그레인버즈 S2). 없는 경우: `rangeId`가 비었음, CastSkill `_hideRangeToShow`(스와이어 디 엘리건트 위트 S3·이그제큐터 디 엑스
      포에데레 S2·쏜즈 더 로드스타 S3; 실행 중 값은 `AssignData`가 이 프리팹 값을 그대로 옮긴다 — 그 밖에 끄는 것은 버프 노드
      `ForceHideSkillRangeToShow`뿐이고 안젤리나 더 멜로우 위시 S3 모드 버프·풀 밖 재능이 쓴다, 정비 중엔 해당 없음). `_forceUseBaseShowRange`는
      기반 경로: 스킬 능력의 `_selector`(`Ability.rangeToShow`) → `_rangeIdModeIndex` 모드의 범위(`Unit.GetRangeOfMode`) → 기본 모드 범위 — 끝이
      지금 모드면 같은 객체라 토글 없음. 이그제큐터 디 엑스 포에데레 S1·S3은 선택기가 없고 `_rangeIdModeIndex` 1·3(모드 S1·S3, 정비 중 모드는
      Default)이라 **토글이 나오고** 그 모드의 범위를 그린다 [추정·엔진: 모드 범위 = 스킬 `rangeId`(2-5)로 봄 — `UnitMode.rangeToShow`는 안
      읽음]. 켜면 필드 범위
      표시가 스킬 범위(`GridRangeDrawer.TurnOnSkill`), 끄면 공격 범위(`TurnOn`). 우리: 스킬 `rangeGrid`가 있고 `showRange`가 false가 아닐 때
      (`screens/game/range.js skillButton`; `showRange: false`는 `tools/local-extract/skill_cast.py`의 `range` 0 → `tools/build-data.mjs`),
      켬 상태는 그 선택에만(다른 기물을 고르거나 다시 고르면 꺼짐). 상세 카드의 범위 칸은 그대로 공격 범위.
    - 그리지 않는 것: AUTO 표시 `text_auto_mark`·정지 `sprite_skill_stop`은 프리팹에서 GameObject가 꺼져 있고 스크립트는 `enabled`만 바꾼다 → 화면에
      안 나온다. 충전 수 `panel_skill_amount`는 `hasSkill` ∧ 스킬 `IsAvailable` ∧ `maxChargeTime` > 1일 때 켜지고 글자는 「0」(SP 글자
      「0/N」의 「0」도 상수라 유닛 SP와 무관). `IsAvailable` = 다 안 씀 ∧ 능력 `isReady` ∧ skillType ≠ 0 ∧ `spEnough`(유닛 SP ≥ spCost) ∧
      `ownerCanUseSkill`(이상 상태·침묵·`SKILL_NOT_ACTIVATABLE` — 위수협의 정비에 이 표시를 거는 버프 없음). 정비 중 유닛 SP는 기물을 지을 때
      들어간다(공식 클라에서 확인, 2026-11-16): `Character._BuildAtInternal`(`BuildAt`·`BuildAsPredefined`·`BuildAsRuntimeInst`가 모두 지나는 곳)이
      `Entity.Init(…, mainSkill.spData)`를 부르고, 거기서 SP = min(`SpData.maxSp` = spCost × maxChargeTime, initSp)·최대 SP = `maxSp`
      (`Entity.UpdateSpData`·`SpController.Reset`은 소모·증가량만 바꾸고 SP 값은 안 넣음; 켜진 Lua 핫픽스(en_US·zh_CN)에 이 메서드들 없음).
      풀의 충전 스킬 기록 중 initSp ≥ spCost는 비르투오사 정예 S1(`chess_char_6_09_b`, initSp 12·spCost 6·충전 2 → SP 12)뿐 — 지은 그때 SP가
      넉넉한 것은 그 하나다. 그런데 관리자 기억으로 공식은 정비 중에 이 칸을 띄우지 않았다(충전 스킬 오퍼레이터도 정비 중에는 충전 수가
      안 보임) → 어느 기물에도 그리지 않는다(관리자 결정 2026-11-16) [추정·화면: 위 조건대로면 그 기물만 켜질 텐데 기억과 갈리는 까닭은
      모름 — 지은 뒤 정비 동안 SP가 바뀌는지(SP 회복 틱)와 그 스킬 능력의 `isReady`는 안 읽음].
  - 대기석·임시 정비 구역 기물 → 마름모 없이 메뉴 버튼(`btn_panel_root`, `AutoChessCharacterMenuButton`): 검은 깃발 `img_btn_bg_all`
    (325×225 × 0.66) + 같은 판을 0.66배로. 아이템은 빨간 파기 판, 소환물은 아무것도 없다. 두 표시 설정 모두 `needRotate`라 `_RotateIfNeed`가
    `bg_offset`을 90° 돌려(왼쪽을 가리키던 깃발 끝이 아래 = 기물 쪽) `rotatedOffsetPos` (0, 60)에 두고, 판은 돌리지 않고
    `btn_util_root`.TransformPoint(`rotatedPos` (−100, −6)) = (6, 190)에 둔다 — **판은 기물 위**, 깃발 끝(▼)은 기물 위 94단위.
    처음 구현(2026-10-31 오전)은 이 회전을 빼서 판이 기물 오른쪽에 있었다 — 관리자가 공식 영상 캡처로 짚음. 누름은 이 프리팹의 `collider`
    151.89×130(필드 판의 것과 조금 다름).
  - 플랫폼 차이(관리자 질문): 공식 클라에서 확인 — `Render`는 `Follower2D.Follow` 뒤 늘 `_RotateIfNeed`를 부르고 플랫폼 분기가 없다. 갈림은
    프리팹의 `needRotate`뿐이고 EN·CN PC 클라 모두 두 설정이 1(같은 `rotatedPos`·`rotatedOffsetPos`), 켜진 Lua 핫픽스(en_US·zh_CN)도 이 클래스들을
    덮지 않는다 → PC는 늘 위. 모바일 번들은 여기 없어 직접 보지 못했다 [추정·자료 없음: 같은 프리팹이라 모바일도 위로 봄]. 원본(upstream 첫
    가져오기)의 「대기석도 마름모 + 오른쪽 위 판매」는 그쪽 자체 디자인이었고 모바일 화면을 따른 것이 아니다.
  - 단축키: 각 버튼의 `pc_key_holder` 자리에 키 글자(퇴각 Q, 판매 X — 설정의 키). [추정·자료 없음: 키 표시 프리팹이 이 번들에 없어 작은 검은 키 모양]
- 크기·자리: 방향 선택 마름모(위 「배치 UI」)처럼 바닥 평면에 투영한다(공식 영상 캡처에서 대기석 판의 정사각 아이콘이 세로 0.82로 눌려 보임).
  대기석 메뉴의 배율은 그 캡처로 잼: 판의 노란 부분(101단위)이 ≈ 0.99칸(칸 182 px에 180 px) → 1단위 ≈ 0.0098칸(방향 선택 단위의 2.83배);
  같은 배율로 깃발 끝 94단위(165 px)·판 가운데 200단위가 캡처와 맞는다. 필드 하부 패널은 방향 선택과 같은 단위(301단위 × 2.5 = 2.6칸)로 —
  마름모 반대각 ≈ 2.8칸, 판의 노란 부분 1.06칸(대기석 판과 거의 같은 크기). [추정·화면: 필드 기물 메뉴의 공식 캡처가 아직 없음 — 하부 패널을 붙이는
  부모의 배율은 프리팹에 없다] 자리는 프리팹 그대로: `Param.DEFAULT`의 `offset` (0, 0), `Follower2D`가 패널 중심을 발밑에 둔다.
  최종 공세(最终攻势) 정비의 거울 반쪽에서도 퇴각은 왼쪽(뒤집지 않음). 상세 카드·맹약 팝업 자리 계산(`underframeRect`)은 마름모가 아니라 버튼들의 범위를
  쓴다(마름모는 카드 밑 층, 버튼은 위 층 — 예전과 같음).
- 버튼 색 반응은 프리팹 `Button` 전환값: 올림 .96, 누름 .78, 비활성 .78 · 반투명.
- 추출: `tools/local-extract/extract.py` battlecommon 줄에 `sprite_character_menu_frame`·`btn_escape`, 스킬 버튼의 `sprite_skill_notready`·
  `sprite_skill_range_off`·`sprite_skill_range_on`·`sprite_mask` 추가(`--game <…>/PersistentData/Bundles --only ui/battlecommon`; StreamingAssets
  판에는 없다; 스킬 버튼 그림이 없는 예전 추출이면 스킬 버튼만 빠진다). 나머지 판 그림은 이미 `ui/battle`에 있었다.
- 확인: 목업 판 3D 필드(`/dev/game-mock.html?render=engine&phase=PREP`, Windows Chrome 1920×1080) 필드 기물·대기석 기물 선택 캡처를 관리자가 준
  공식 영상 캡처(대기석 판매)와 대조, 스킬 버튼은 같은 판에서 필드 오퍼레이터 7명(토글 있는 3명은 켜고 끔 — 실버애쉬 S3 범위로 바뀜) 캡처
  [화면 미확인: 공식 캡처와의 대조 없음],
  테스트 `test/render/placement-ui.test.js`(배치·거울·버튼 범위·스킬 버튼 자리), `test/ui/inspect-range.test.js`(스킬 버튼 조건·토글 범위 —
  그레인버즈 S2·이그제큐터 디 엑스 포에데레 S1·S3 토글 있음, 쏜즈 더 로드스타 S3 없음).

## 전투 화면 UI (2026-10-07)
관리자 요청 「전투 화면 UI를 공식 인게임과 똑같이」: ① 아군 체력·SP·탄환 바 + 기물 레벨 → ② 적 HP(보스 포함) → ③ 원소 원형 바 → ④ 데미지·회복 숫자 순서,
상태 표시(寒冷 눈꽃·冻结 얼음 블록·战栗 주먹·은신·위장)도 관리자 요청으로 뒤에 추가.
근거: EN 클라이언트 `arts/ui/[uc]battlecommon.ab`(바 프리팹·스프라이트), `battle/[pack]common.ab`(`hud_unit`, `damage_text`, `heal_text`),
`ui/autochess/[uc]autochessbattle.ab`·`battlecommon`의 `act1autochess_battle_dummy_hud_plugin`(정비 칩) — `tools/local-extract/ui_inspect.py`로 읽음 —
과 관리자 중국 서버 캡처(2000×1125, numpy 측정).

**크기 단위 (관리자 결정 2026-10-07 「제시한 기준대로」)**: 공식 유닛 HUD는 화면 공간 캔버스라 카메라·원근과 상관없이 같은 크기다 —
캡처에서 앞뒤 줄(칸 간격 168 / 177 px)의 바가 모두 128~129 px = 프리팹 125단위 × 2000/1920. → 1단위 = `min(폭/1920, 높이/1080)` CSS px
(`hud-bars.js hudUnit`; 16:9가 아닌 화면의 맞춤 방식은 CanvasScaler 값을 못 찾아 [추정]). 해상도에 비례: 1280×720 83px, 1920×1080 125px, 4K 250px.
예전 바는 칸 크기 × 0.64(24~96px 제한)라 뒷줄이 작고 4K에서 공식의 약 40 %였다.

**① 아군 바** (`AllyBars`, 아군 = 오퍼레이터·소환물):
- 위치: 프리팹은 `hud_unit` 중심에서 HP 바 중심이 54.5단위 아래. 공식은 `hud_unit` 중심이 유닛 점(「뜨는 높이」)이고, 오퍼레이터·소환물 모델은
  프리팹 위치값만큼 약 0.16칸(공식 카메라 약 26단위) 아래에 서므로 HP 중심이 신발 밑 약 28단위 — 캡처 5 / 6 / 13에서 링 중심(신발) → HP 중심
  27 / 29 / 33.7단위, 공식 PC 캡처(2026-10-23, 赤刃明霄陈) 29단위. 2026-10-23부터 오퍼레이터·소환물은 `hud_unit` = 유닛 점(`units.js hudAnchor` 0,
  render.md 「모델 위치값·그림자 — 오퍼레이터·토큰 전부」; 적도 2026-10-24부터, 「— 적 전부」). 모델이 점에 서 있는 유닛(장치)은 그대로 점 위 24.5단위(`HUD_ANCHOR`, [캡처]) —
  2026-10-07, 모델이 점에 서 있을 때 점 = `hud_unit`로 54.5 아래에 그렸더니 낮아서(관리자 확인 + 캡처 13) 「신발 밑 약 30단위」에 맞춘 값이다.
  정비 칩·장비 바·원소 고리·피해 숫자도 같은 기준점(캡처 4의 칩도 프리팹 자리보다 약 16단위 위였다 — 모델이 점에 서 있을 때). 예전에는 머리 위.
- HP 125×7 `#49b2e3` α.7, 그 뒤에 최근 깎인 만큼 흰색 α.7(`slider_back`, 예전 잔상 계산 그대로). 30 % 미만 노랑은 공식에 없어 뺐다.
  SP 125×7을 HP 바로 아래(간격 0): 충전 `#caec46` α.7, 지속형 스킬 중 남은 시간 `#ffa800` α.7(`char_sp_cast_slider`).
  받침 = `sprite_bg`(9-slice, 테두리 4/5): 검정 α.70 가운데 + 4~5px 부드러운 그림자, 검정 α.5 틴트 → 가운데 α.35. 프리팹은 받침을 바보다 8.6 × 10.32 크게
  (133.6 × (14 + 10.32)) 두는데 그 여분이 바로 그림자 폭이라, 가운데는 바 밑에 깔리고 바깥엔 부드러운 그림자만 보인다 — 관리자 제보
  (캡처 14). 처음엔 딱딱한 1단위 여백을 줬다가 테두리처럼 보여 없앴었다. 그림(로컬 추출)이 없으면 바 크기 그대로 α.35 사각형.
- SP 가득 참 빛 없음(관리자 결정: 캡처에 없고 자동 발동이라 순간).
- '염의 가호'(炎佑, 炎 맹약 소환물 — 적 기록으로 만든 아군)는 HP 바만, SP 줄 없음(2026-10-23, 관리자 제보 「공식은 SP 바 없이 HP 바만」 — 관리자 기억,
  클라 근거는 안 찾음): 祛恶之焰이 적 스킬 쿨다운으로 돌아 sim이 SP를 보내지만 렌더가 안 그림(`shared/trap-tokens.js NO_SP_TOKENS` → `units.js noSp`).
  [실제 판 이상 없음 2026-10-28]
  그 HP 바도 평소엔 숨기고, HP가 바뀌면(맞거나 치유) 잠깐 보였다가 사라진다(2026-10-23, 관리자 제보 「공격받는 등의 변화가 있을 때 잠깐 보여 주고
  평소엔 안 보임」 — 관리자 기억): `FLASH_HP_TOKENS` → `units.js hpFlash`,
  `HP_FLASH` 2초 보이고 흐려짐 없이 바로 사라짐(관리자 제보 2026-10-23 「흐려지며가 아니라 바로 사라졌다」; 2초는 [추정 시간]). 관리자 화면 확인 2026-10-23 「대충 비슷」.
- 탄환형 스킬(관리자 제보): `char_bullet_bar` 받침 `#e56d00` α.31 위에 남은 탄환마다 칸. 칸은 코드(UIBulletBar)가 만든다(프리팹에 칸 없음).
  칸의 색은 머티리얼 `ui_battle_ally_bullet_bar`의 `_BulletColor` `#ebaa2d` — 셰이더 `Torappu/UI/BulletBar`는 그 색을 그대로 내고(알파 = 칸
  가장자리 부드럽게 × `_BulletColor` α × 정점 α, 정점 색 RGB는 칸 수·간격 값을 나를 뿐), `fill` Image는 흰색 불투명 — 공식 클라에서 확인 2026-11-01
  (그 전엔 캡처로 잰 `#ffa800`, G 168만 맞았다). [추정·화면: 캡처 측정] 간격 2단위(7발: 16~17px 칸 2px 간격, 19발: 약 4.5px 칸 같은 간격). 칸이 1px보다 좁아지면 남은 비율 한 줄.
  탄환 수는 시뮬레이션이 `b.snap.ammo = [[id, 남은, 최대]]`로 넘긴다(`server/sim/local-hud.js`; 시뮬레이션은 브라우저에서 돈다 — `battle/runner.js`).
  - **언제 탄환 칸인가 = 스킬 프리팹의 `_showSpAsBulletMode`** (upstream 0.2.4 이식 2차, 관리자 결정 2026-10-11 「공식대로」): 공식 클라
    `Character.get_hudPluginMask`가 HUD 줄을 고른다 — 스킬이 효과 중(`BasicSkill.isAffecting`)이면 플래그
    (`BasicSkill._showSpAsBulletMode`, `get_showSpAsBulletMode`)가 켜졌을 때 `BULLET`(16, `char_bullet_bar`), 아니면 `SP_CAST`(8,
    남은 시간·탄환 비율 막대), 효과 중이 아니면 `SP`(4)·영창 `CHANT`(32). 탄환 칸(`UIHudCharBulletBar.UpdatePlugin`)은 스킬이 탄환형
    (`CastSkillWithLimitTimes`)이면 남은 탄환 / 전체, **아니면 유닛의 SP / 최대 SP**(`UIBulletBar.ShowBulletCount(maxSp, sp)`)를 한 칸씩.
    플래그는 클라에서 뽑아 추적 파일로: `tools/local-extract/skill_hud.py`(EN 클라 먼저, EN에 없는 선발 오퍼레이터는 CN 클라 `--client` 두 번) →
    `tools/assets/local-skill-hud.json`(풀 스킬 305개 전부 읽힘, 켜진 것 21개) → `tools/build-data.mjs`가 스킬 기록에 `bulletMode` 0/1 →
    `local-hud.js bulletView`. 패시브 스킬은 배치된 동안 늘 효과 중(PASSIVE·ON_DEPLOY, 지속 무한).
  - 그래서 **琳琅诗怀雅(스와이어 디 엘리건트 위트) 금화 = 탄환 칸**: 금화는 그녀의 SP(버프 템플릿 `swire2_tr` `ModifySp` `swire2_add_coin`, `swire2_t_1`
    `ON_SKILL_CAST_SUCCEED` `ClearCharacterSp`), 세 스킬 모두 플래그 켜짐. 칸 수 = 고른 스킬의 블랙보드 `sp`(「携带此技能时金币上限为N」; 표 spCost는 0),
    찬 칸 = 지금 금화(키트 `mem.coins`, 첫 금화 전 0). S1·S2(패시브)는 배치된 내내, S3(千金一掷)는 켜져 있는 동안만 탄환 칸이고 충전 중에는 보통 SP 막대
    (0/5). 칸 수는 표의 스킬 레벨을 따른다: 우리 기물은 스킬 레벨 4(S1 2·S2 3·S3 10)와 7(2·4·10)을 쓰고, 표 마지막 레벨 10은 3·5·10. 1차 이식의 금색
    숫자 줄(`CoinPurse`, `[ASSUMED]`)은 걷어냄(`docs/rules/render.md` 「upstream 0.2.4 이식 — 렌더」).
  - 탄환형인데 플래그가 꺼진 스킬은 탄환 칸이 아니라 남은 비율 막대(`#ffa800`, 스냅숏 SP 그대로): 新约能天使(엑시아 더 뉴 커버넌트) S2 开火成瘾症·S3
    使命必达！, 予愿安洁莉娜(안젤리나 더 멜로우 위시) S3. 전에는 칸으로 그렸다. 플래그를 못 읽은 스킬(`bulletMode` 없음)은 예전처럼 탄환형이면 칸.
  - 칸 그리기(`UIBulletBar.ShowBulletCount`): 40발부터(`IGNORE_GAP_COUNT`) 간격 없음 → 남은 비율 한 줄(`hud-bars.js BULLET_NO_GAP`; 우리 풀에서는
    信仰搅拌机(산크타 믹사파라토) S2 八臂电锯侠 42·45발 — 30발인 S3는 칸). 간격 값은 `(최대/5 + 1) × _gapFactor`를 셰이더에 넘기는 방식이라 우리 2단위 [추정]은 그대로, 10~39발의
    「부드러운 칸」(`USE_SMOOTH_COUNT`, 셰이더) 차이도 안 옮김.
  - 테스트 `test/render/sp-bullets.test.js`. 스와이어 디 엘리건트 위트의 금화 칸(2/2)·S3 충전 중 SP 막대 → 켜진 뒤 10칸은 Windows Chrome 실제 화면으로 확인(2026-10-11).
    **[실제 판 이상 없음 2026-10-28]** 엑시아 더 뉴 커버넌트 S2·S3 비율 막대(코드 근거만 — 공식 화면을 볼 기회가 있을 때).
- **과부하 스킬**(관리자 요청 2026-11-01 「과부하 모드에 들어가면 SP 바가 붉은색 — 공식 클라대로」): 스킬 프리팹의 `_isOverloadSkill`
  (`CastSkillWithLimitTimes`·`CastSkillWithSuspendable`의 `get_isOverloadSkill`)이 켜진 스킬은 진행이 과부하 비율(`BasicSkill.get_overloadRatio`
  0.5)에 닿으면 HUD 줄이 바뀐다 — 공식 클라에서 확인. 우리 풀에서는 혼(포트리스) S2·S3, 락락(메카 캐스터) S2, 위셔델 S2, 탈룰라 S3(`char_4247_oxi`, CN
  클라) 다섯. 남은 진행도 r(지속형 = 남은 시간 / 지속, 탄환형 = 남은 탄 / 전체; 스냅숏 SP 비율과 같다)로:
  - 과부하 전(r > ½): 스킬 막대(`UIHudCharSpCastSlider`, `#ffa800` α.7)가 앞 절반의 남은 몫 clamp01((r − ½) / ½)만, 그 뒤 빈 자리를
    `char_sp_overload_tint_cast_slider`(`UIHudCharOverloadSpTintSlider`, 값 1 − 그 몫, 방향 RightToLeft)가 `#bd5a00` α.4로 오른쪽부터 채운다.
  - 과부하(r ≤ ½, `isOverloaded`): `char_overload_sp_cast_slider`(`UIHudCharOverloadSpCastSlider`, `get_remainingOverloadProgress` = r / ½)가
    `#d04500` 불투명으로 줄어든다. 틴트는 사라진다.
  - 탄환 칸 스킬(혼 S2, `_showSpAsBulletMode` 켜짐): 과부하 전엔 탄환 칸이 (1 − ½)·최대 칸 중 max(0, 남은 − ½·최대)만(`UIHudCharBulletBar.UpdatePlugin`,
    과부하면 숨김), 과부하면 `char_overload_bullet_bar`(`UIHudCharOverloadBulletBar`)가 ½·최대 칸 중 남은 탄을 받침 `#4b4b4b` α.31 위
    `ui_battle_ally_overload_bullet_bar` 머티리얼 `_BulletColor` `#d04500`로(남은 탄 0이면 안 보임).
  - 길: 클라 플래그 → `tools/local-extract/skill_hud.py`(EN, 탈룰라는 CN `--client`) → `tools/assets/local-skill-hud.json` `overload` →
    `tools/build-data.mjs`가 스킬 기록에 `overload: 1` → 시뮬레이션이 켜진 동안 `b.snap.ovl = [[id]]`(`local-hud.js overloadMark`) →
    `hud-bars.js` `AllyBars`(`OVERLOAD_RATIO`)가 비율로 나눠 그린다. 시뮬레이션의 과부하 효과도 다섯 키트 모두 절반에서 시작한다(락락 S2 40초 중 20초,
    `test/render/overload-bar.test.js`). 그리기 호출은 그대로(바 20개 1회, `bench/draw` 장면 `overload`).
  - 혼 S2(탄환형, 스킬 프리팹 `BurstCastSkill`)의 과부하 시점 — 공식 클라에서 확인 2026-11-01: 남은 진행도 = (최대 탄 + 추가 탄 − 쏜 탄) ÷ (최대 탄 +
    추가 탄)(`CastSkillWithLimitTimes.get_remainingProgress` → 주 공격의 `AbilityEventCounter.GetProgress`; 탄은 `_countEvent` 4 `ON_SPELL_ON`,
    사격 순간에 셈), 과부하 판정은 스킬 틱마다(`BasicSkill.OnTick`) 한 번 켜지면 끝까지(`horn_s_2[overload_mark]`는 `ON_CAST_END`까지). 추가 마법 피해는
    S2 원거리 공격(`RangedAttackWithConditionalActions`)의 조건부 동작으로, 주인이 `[overload_mark]`를 가졌는지를 포탄이 생길 때
    (`Projectile.ActionController.Init` → `GetProjectileActions`) 정한다. 그래서 10발이면 6~10발째, 시작 때 탄이 늘면(라테라노 맹약) 그 발동의 전체 탄
    기준, 과부하 중 재장전(장비 `chess_item_4_08_e` 등. 혼에게 탄을 주는 다른 출처는 라테라노 오퍼레이터 몫이라 닿지 않음)으로 남은 탄이 절반을 넘어도 과부하는 그대로.
    그때 HUD도 공식처럼 과부하 탄환 칸을 유지한다: `UIBulletBar.ShowBulletCount`는 칸 수보다 많은 값을 무시하므로 마지막 그림이 남고(칸이 0이 되는 것이 아니다), 다시 절반 아래로 내려오면 그 수를 그린다(`b.snap.ovl` 둘째 칸, 공식 클라에서 확인 2026-11-06). 키트: `chess_char_5_08-horn.js` `ammoUsed`에서 켬
    (`test/content/kits_alt_t5.test.js` 「号角 S2 过载 counts」). 프리팹의 `_burstOnOverload`는 수동 종료 `Full Burst`를 과부하 중에만 허용 — 자동 전투엔 없음.
  - [화면 미확인] 실제 판에서 위 다섯의 바를 아직 못 봤다(그림 비교만).
- 배리어(屏障·护盾, 관리자 요청 2026-10-10 「배리어도 HP 바처럼」): 공식 클라 `UIHudCharHpSlider.UpdatePlugin`이 유닛의 `shieldUIController.shieldToShow`(s)를
  읽어 HP 바를 (HP + s) / (최대 HP + s)로 채우고, 채운 부분 중 끝쪽 s / (HP + s)(`UIHpFillImage.splitValue`)를 바 머티리얼 `ui_battle_ally_hp_bar`(셰이더
  `Torappu/UI/Hp`, 클라 셰이더: uv.x > 1.003 − split이면 `_Color2`)의 `#bcdbdf` 불투명으로 그린다 — 따로 막대가 있는 게 아니라 HP 바가 배리어만큼 늘어난다. 아군만
  (적 HP 바에는 이 호출·머티리얼이 없다). 시뮬레이션이 `b.snap.shield = [[id, 남은 배리어]]`(버프 `shield` 합, `local-hud.js`)를 넘기고
  `hud-bars.js shieldedBar`가 같은 계산. 예: 烛煌(블레이즈 디 이그나이팅 스파크, 프라이멀 캐스터) 绝处重燃 쓰러짐 중 배리어 6000. 횟수형 배리어(`shieldHits`)는
  양이 없어 안 그린다. 예전 「배리어 있음」 띠(HP 바 위 가는 줄)는 이제 아군 공식 바에서는 빼고(횟수형도 — 아래 「횟수형 护盾」), 적·공식 그림 없는 바에만 남김.
  성능(관리자 요청 점검): 유닛 48개 전투에서 `ammoList` 0.5µs/스냅샷 = 스냅샷 전체(22.5µs)의 2.2 %, 칸은 `Texture.WHITE` 스프라이트라 배치가 늘지 않는다.
- 보호막 줄(`UF.SHIELD`)은 공식 근거가 없어 적·옛 바에서만 HP 바 바로 위 얇은 줄로 유지. 상태 아이콘 줄은 머리 위 그대로(상태 표시 단계에서 바꿈).
- 횟수형 护盾(1회 피해를 통째로 막는 층, `shieldHits`; 2026-10-11 사용자 제보 「켈시 에스페란타 실드가 HP 바 위 가는 흰 줄 — 인게임과 다름」): 클라 버프 템플릿의
  `BlockDamage`가 `_showShieldUI` false — 아르케토 `archet_t_2`(EN), 켈시 에스페란타 `kalts2_t_2[shield]`(CN `buff_template_holder`), 머드락 `mudrok_t_1[shield_a/b/c]`,
  니어 더 래디언트 나이트 `nearl2_s_2[shield]` 모두 — 라 HP 바에는 아무것도 안 붙는다. 그래서 아군 공식 바의 띠를 뺐다(`units.js`). 보이는 것은 버프 자체 이펙트와
  막을 때의 이펙트뿐(`docs/rules/fx.md` 「횟수형 护盾 이펙트」).
- 원소 줄은 ③ 전까지 바 받침 아래로만 옮김.

**기물 레벨**: 전투 중에는 없다(캡처 5·6·8 — 관리자 확인 「전투중에는 안나와」). 정비 중은 `shop_hud`의 `chess_level_icon`
(`autochess_level_N`, rect 42 / 텍스처 37.85, 루트 배율 1.25, 발에서 (-45.5, +128)단위). 그 그림은 38px라 1.25배로 키우면 흐렸다(관리자 제보) →
같은 디자인의 상점 카드 칩 `img_chess_level_N`(45px; 숫자가 어두운 안쪽의 0.53 × 0.70 — 두 그림 같고 캡처 4는 0.51 × 0.69)을 쓰고, 안쪽 39px를 공식
30 × 1.25 = 37.5단위에 맞춘다(캡처 4 안쪽 39px = 37.4단위). 웹 manifest `shopCard/` → 로컬 `ui/battle` → `autochess_level_N` → 없으면 원래 그린 칩(PR 가능 유지).
칩 위치·크기는 관리자가 직접 확인하기로 함(2026-10-07 「일단 지금 그대로」).
2026-10-08: 모델이 클라이언트 크기(0.864배, 「유닛 모델 크기」)로 작아진 뒤 관리자 제보 → 발에서 칩까지 높이를
같은 비율로: (24.5 + 128) × 0.864 − 24.5 = 107.3단위(`PREP_CHIP.y`). 프리팹 128과 다르다 [관리자 결정].
같은 날 관리자 비교 캡처(望, 우리 ↔ 공식 영상; 관리자 제보: 칩이 조금 낮다):
칩 크기(화면 고정)를 단위로 재면 칩 중심 → 눈 높이가 공식 53.7 / 우리 45.8단위 → `PREP_CHIP.y` 115. 모델 크기(얼굴 폭 44 / 45단위)·칩 x 오프셋은 같다.
수정 전·후·공식을 나란히 비교. [추정: 공식 프레임은 공격 동작 중이라 머리 위치 ±2px].
2026-10-23: 오퍼레이터·소환물의 `hud_unit`이 유닛 점으로 내려가(24.5단위) 칩도 같이 내려간다 — 모델도 프리팹 위치값만큼(공식 카메라 약 26단위)
내려갔으므로 칩 → 눈 거리는 거의 그대로(약 +1.5단위)라 `PREP_CHIP.y` 115는 두었다. [화면 미확인: 정비 중 칩·장비 바]
2026-11-16: 정비 구역·보드에 놓인 **장비**도 같은 칩을 단다(관리자 공식 스크린샷 2026-11-14, 두 시즌 공통). 공식 클라에서 확인: 정비 중
`AutoChessUIPlugin._SetDummyHud`가 타일·정비 구역에 있는 기물의 더미마다 같은 `shop_hud`를 `DEFAULT_SHOPSTATE_BATTLE`(레벨 칩 켬)과
`GetChessItemLevel`(기물의 `itemLevel`, 장비도)로 채우고, 더미의 변환점에 붙인다(`_SetHandDummy`·`_SetBattleFieldDummy`; 장비 알약만 오퍼레이터일 때). 그래서
그림·크기·자리는 오퍼레이터 칩과 같다 — 장비 점에서 `PREP_CHIP`만큼(`render/units.js ItemView` `chip`, 단계는 `items.json` `tier` = 상점 `itemLevel`),
공식 그림이 없으면 그린 칩을 같은 자리에. 장착된 장비는 자기 더미가 없어(정비 구역에도 타일에도 없음) 칩이 없다. 정예(금색) 장비도 칩은 단계 그림 그대로.
[화면 미확인: 장비 칩 — 장비 모델 위 높이] 재발 방지: `test/render/unitview.test.js` 「hand items wear the operators' prep chip」

**장비 바 (정비 중)**: 관리자 제보(캡처). `shop_hud`의 `equip_bg`(74×30, shop_hud 안 (13, 29.4) —
칩 오른쪽, × 1.25)와 칸 `equip_0`/`equip_1`(23×6, ±12.8 / 13): 아이템마다 흰 알약(`equip_normal_icon`), [추정] 금색 아이템이면 빛나는 금색 알약(`equip_gold_icon` 31×14,
제 크기). 높이는 티어 칩과 같은 줄 — 프리팹에서 막대(29.4)와 칩 `chess_level_icon`(28.2)이 한 줄이고, 칩은 위 「기물 레벨」대로 프리팹 128에서 115로
내려와 있으므로 막대도 칩 높이 + 1.2 × 1.25 = 116.5단위(`render/hud-bars.js PREP_EQUIP.y`; 처음 프리팹 높이 129.5에 두어 칩보다 14.5단위 떠 보였음,
2026-11-16 관리자가 준 공식 영상 캡처에서 흰 알약 막대가 「V」 칩 바로 오른쪽에 같은 높이 — 소환물 묶음 개수 판과 같은 원인).
재발 방지: `test/local-patch-hud.test.js` 「the equip bar fills one slot per item」 이 바가 그려지면 예전 아이템 아이콘(item pips)은 숨긴다(캡처에 아이콘 없음). 그림은 로컬 추출(`extract.py --only ui/battlecommon`)만 있어서
없는 서버는 예전 아이콘 그대로. 금색 여부는 `render/app.js`의 `setItems` 옆 `setEquip` 한 줄씩(2곳)이 넘긴다. 장비 바 그림은 git 밖 로컬 소재(`public/assets/local/ui/battlecommon`)다.
공식은 오퍼레이터 기물이 장비 칸 0·1 중 하나라도 장비를 가졌을 때만 알약을 켠다(공식 클라에서 확인: `AutoChessDummyHud` `displayEquipPart` = 기물이 오퍼레이터, 칸 아이콘 둘).
장비 칸이 둘보다 많은 기물(규정 레이지 아이언하이드 `chess_char_5_22`: 일반 4·정예 6, 기록의 `equipSlots`)은 머리 위 알약을 **아예 그리지 않는다**(예전 아이템 아이콘도 없음) —
CN 플레이 제보, 관리자 결정 2026-11-14(2026-11-12의 「칸 둘마다 알약을 위로 쌓기」를 대신함; 칸 수로 끄는 조건은 CN 전용이라 EN 클라에서 읽지 못함).
`EquipBar`의 여러 알약 그리기는 남아 있으나 필드에서는 쓰지 않는다. 끌기 팝업·교체 창·상세 카드의 칸 수는 그대로.
상세 카드의 장비 절도 그 칸 수로 「EQUIP n/칸 수」·「최대 n개」, WebGL 없는 대체 필드는 장비 점을 모두 그린다.

**재배치 카운트다운 (쓰러진 오퍼레이터)** (2026-10-31, 관리자 요청 「공식처럼 똑같이」): 같은 프리팹의 `battle_state`(공식 클라 `AutoChessDummyHud._UpdateBattleState`).
- 카드를 아직 쓸 수 없는 동안(재배치 시간이 도는 중): `countdown_bg`(`countdown_background` 85×85 × 0.7, (0, 105), 루트 × 1.25 → 지름 74.4단위,
  `hud_unit` 위 131.25단위 — 빨간 원판에 시계 그림) 위에 `countdown_fill`(흰 고리 47×47)을 Image Filled **Radial360·위에서 시작·시계 방향**으로,
  채움 = 1 − 카드의 `respawnProgress` — 남은 시간만큼 고리가 남고 시계 방향 끝에서 위쪽으로 줄어든다. **숫자는 없다**(프리팹에 글자 칸 없음).
- 시간이 끝났지만 카드가 `readyToSpawn`이 아닐 때(DP 부족 — `BattleController.IsCostEnough` —, 또는 배치 수 상한) `cost_lack`(같은 원판에 코스트 그림)만.
  `readyToSpawn`이면 아무것도 안 그린다. 이 판정에 칸 검사는 없어서, 누운 칸이 막혀 기다리는 경우(우리 `DOWN_STATE.WAIT_TILE`)에도 아무것도 안 나온다.
- 구현: `hud-bars.js RespawnHud`(채움은 원소 고리와 같은 `RadialFill` 부채꼴 메시 — 스텐실 마스크 없이 스프라이트와 한 번에 그려짐: 12개 떠 있을 때 그리기 호출 36 → 1), `units.js _updateDownRing`. 그림은 로컬 추출(`extract.py --only ui/battlecommon`)이고,
  없으면 예전에 그리던 링(민트 호 + 남은 초, 「DP」/「!」)을 그대로 쓴다. 단독 그림 캡처(Windows Chrome)로 채움 방향·모양 확인, 디버그 아레나 확인 2026-10-31(관리자: 「공식이랑 거의 비슷」).

**② 적 HP** (`EnemyBars`; 처음엔 맞기 전 숨김 — `_alwaysShowHp`는 圣堂剑士만 켜짐 — 보스는 늘 보임):
- 일반·정예: `enemy_hp_slider` 105×7 `#ea4700` α.7, 흰 α.7 잔상, `sprite_bg` 받침 8 × 8.55 크게(`enemy_slider_background`; 위 그림자 설명), `hud_unit` 아래 55.3(캡처 ≈110px).
- 보스(거대 패널이 아닌 보스 — 铳·卢西恩 등): `enemy_boss_hp_slider` 130×9 `#ea2727` α.85, `hud_unit` 아래 43, `sprite_bg` 받침 10×8 크게
  (처음엔 딱딱한 사각형이라 테두리로 보였다 — 관리자 캡처 14로 그림자 받침임을 확인); 문양 `sprite_enemy_boss_hud_small`(57×65, 바 중심 7 아래)이 바 뒤에;
  SP(`enemy_boss_sp_slider` 130×6 `#ebc9ff` α.7, 받침 10×7 크게)는 HP 바로 아래 [추정 위치] — SP 있는 보스만.
- 거대 보스(관리자 제보): 보스 프리팹에 `_bossHudScale`이 있는 적(`EnemyGiantBoss`)은 `battle/[pack]common.ab`의
  `panel_enemy_boss_info`를 쓴다 — HP 798×10 × x 배율(胄·管·阿利斯泰尔·萨米的意志 0.35, 昆图斯 0.765; 관 캡처 ≈281 × 9.3단위 ✓) `#ff2b2b` α.8,
  흰 α.7 잔상, 검정 α.39 딱딱한 받침(800×12 — 캡처 14의 SP 바 둘레 검은 테가 이것)과 흰 α.39 테(`sprite_enemy_boss_hp_bg` 9-slice 816×28: 회색 가운데 위아래에
  어두운 선; 테두리도 가로 배율로 눌림), SP(`default_sp_slider` 798×8 `#cab2d4` α.8, 받침 800×12, 테 816×24)는 HP 중심 16.3 아래 [캡처 8], 문양 `sprite_enemy_boss_hud_large` 폭 ≈39단위([캡처 8·10]),
  맞을 때 빛(`hit_effect` = `sprite_bar_glow` 9-slice 818×31 `#ff0000` α.78 — 관리자 결정, 0.35초 사라짐 [추정·화면]). 중심 = 보스 발 [추정·미조사: 배치 규칙을 아직 안 읽음,
  캡처에서 발 근처], `_bossHudOffset`만큼 타일 단위로 옮김 [추정·화면: 단위 — 공식 녹화와 대조 전](萨米的意志 위 1.4, 昆图斯 위 1.02, 管 II 오른쪽 1.4). 값은 enemies.json `giantBoss`(프리팹 뿌리가 `EnemyGiantBoss`인 적 전부를 `enemy_bindings.py`가 읽음, 2026-11-20 — 그전 손 표 `GIANT_BOSS`에는 규정의 기계·고치가 빠져 있었다; sim.md 「거대 보스」).
- 圣堂剑士 탄약: HP 바 바로 아래 같은 폭에 아군과 같은 탄환 칸([추정] `enemy_bullet_bar` 105×7).
- **보스 SP 바와 관·현의 공식 SP** (관리자 결정 2026-10-07 「공식과 같은 a안」): 공식은 쿨다운이 아니라 SP다(`enemy_database` spData: 管 INCREASE_WITH_TIME
  0/50 +1/s, 裂管之奏 spCost 50·cooldown 50·initCooldown 40; PRTS 「技力 0/50 自动回复 1.0 SP/s」; 阿利斯泰尔 maxSp 25; 胄·萨米的意志·昆图斯·铳·卢西恩은 spData 없음
  → SP 바 없음). 시뮬레이션 `content/bosses.js skillSp`(공식 클라에서 확인 2026-11-20): 스킬은 쿨다운이 끝나고 **SP ≥ 비용**일 때 발동한다(`EnemySkill.CheckAvailable` —
  켜짐·쿨·횟수·`_ignoreSilence`가 아니면 침묵/기절 아님·스킬 가능·SP 모두), 시전 시작에 비용만큼 소모(`CastToTarget` → `TryReduceSp`). SP는 초당 increment로 오르고
  (`SpController.OnTick`) 멈추는 것은 이상 상태 SP_RECOVER_STOPPED뿐이다 — 기절·失衡은 그것을 걸지 않아 그동안에도 오르고, 그 적의 스킬이 시전 중이면(시전 시작부터
  `_OnCastFinish`까지 `registeredAsModifier`, 적 스킬은 늘 `recoverSpWhenAffecting` 거짓) 멈춘다(`spGain`; 이전: 기절 중 멈춤, 시전 중 오름). 그래서 쿨다운 0인
  SP 스킬(阿利斯泰尔 王权号令, 규정 械 洪流攻势·衰颓与复兴)은 시전이 **끝난 뒤** 비용만큼의 초에 다시 준비된다. 管 첫 발동 40초 → 50초(테스트). 같은 구조의 弦(엘리트,
  spData 0/35, 断弦之奏 25·icd 12)도 같은 규칙(첫 발동 12초 → 25초). 阿利斯泰尔은 키트가 SP를 세고(같은 `spGain`) 값을 노출. 공식 SP 값은 주기 타이머로 1씩 오르는 정수이고
  우리 값은 매끈하게 오른다(준비되는 때는 같음). 공식 막대가 그 정수대로 끊어 차는지는 화면으로 안 봤다 [화면 미확인]. 막대는 `b.snap.bsp`(`local-hud.js hudLists` — `ammo`와 한 번에 돈다).
  성능(관리자 요청 점검): SP 틱 0.06µs = 전투 한 스텝(88µs)의 0.07 %, `hudLists` = 스냅샷의 2.2 %(이전 `ammoList`와 같음).
  [추정] 凋亡 폭발 「15秒内无法开启技能，每秒损失1点技力」(적 쪽)은 아직 없음.
- 맞을 때 흔들림(원본 `shake`)은 새 바에 적용하지 않는다(공식 없음).

**③ 원소 원형 바** (관리자 제보; `hud-bars.js ElementRing`): 클라이언트 `char_ep_slider`·`enemy_ep_slider`. 그 스크립트
(UIHudUnitEpSlider)의 `_elementDatas`가 시뮬레이션 `ELEMENT_ORDER`(neural, erosion, burn, apoptosis) 순서로 원소별 색·아이콘을 갖는다 —
아군: `#00ffd8` + `sprite_ep_icon` / `#3da1ff` + 물 / `#ff4901` + 불 / `#474747` + 어둠, 적: `#149882` / `#266ad0` / `#e3531a` / `#7c7c7c`(폭발 색 `#1c1c1c`).
- 아군: 전체 ×1.2, `hud_unit` 아래 25.9(= 발 근처; 캡처 8에서 링이 HP 바 29단위 위). 아래부터 ep_hit_spread(76×78, 원소 색 — 맞을 때 퍼짐 [추정 애니]),
  ep_center_color(28 원판, 원소 색), ep_back(54, α.784 어두운 고리+그림자), 뒤 슬라이더(slider_ep_fill 28, 흰 α.3 — HP 바 잔상처럼 늦게 따라옴),
  채움(slider_ep_fill 28, 흰색), 아이콘(14×14). 채움은 Image Filled **Radial360, 시작 위(FillOrigin 2), 시계 방향** — 빈 부분이 12시 왼쪽(캡처 8·10과 같음).
  부채꼴 메시(SimpleMesh, 48칸)로 그린다.
- 적: ×1.2, 26.5 아래, ep_back(51), 원판(slider_ep_color_enemy — 51 rect 안 27px), 어두운 바탕(17), 채움(12, `#d5d5d5`), 아이콘 없음(PRTS 「小尺寸图标」과 같음);
  폭발 때 ep_break_spread(41×42, 폭발 색) + ep_break_hint(33) [추정 애니 0.6초].
- 값은 기존 `elementLeft()`(남은 元素值, 爆发冷却 동안 다시 차오름 — PRTS 「以白条显示剩余的元素值」「元素条显示缓慢恢复至上限」); 爆发 중 원소 색 채움·원판 깜빡임
  (예전 줄의 [ASSUMED])은 공식 링에 없어서 흰 채움 그대로.
- 그림(로컬 추출 14개)이나 SimpleMesh가 없으면 예전 줄(원판 + 흰 막대)을 바 아래에 그린다.
- 그림을 아직 받는 중이면 둘 다 그리지 않는다(2026-11-15, 사용자 제보 「원소 손상을 처음 입힐 때 대체 줄이 잠깐 보였다가 공식 게이지」): 그림은 원소가 처음 생길 때에야 요청돼, 디코딩 전 몇 프레임 동안 예전 줄이 먼저 보였다. `hud-bars.js epRingState`가 받음·받는 중·못 씀(설치 안 됨, 받기 실패, `EP_WAIT_MS` 3초 넘게 받는 중 — 게이지가 사라지지 않게)을 가르고, 줄은 「못 씀」일 때만 그린다. 정비·전투에 들어갈 때 `render/app.js`가 두 편의 그림 14개를 미리 요청한다(`prewarmEpRings`). 재발 방지: `test/local-patch-hud.test.js`(받는 중의 첫 원소 손상에 줄·고리 없음 → 받은 뒤 고리, 실패·시간 초과는 줄).
- 디버그 아레나에서 `battle.dealDamage(…, { type: 'element' })`로 凋亡(아군)·灼燃(적) 확인(25 %, 폭발, 회복 중).

**④ 데미지·회복 숫자** (관리자 결정 2026-10-07: 표시 조건은 제안대로, 모양은 공식 프리팹대로, 「지금 표시 방식도 설정에서 고를 수 있게」):
- 프리팹(`battle/[pack]common.ab`): `damage_text`(UIDamageText) Novecentowide 30 `#ff3a00`, Shadow 검정 α.5 (1, −1), `_randomRange` (10, 5), `_lifeTime` 0.5,
  `_upOffset`/`_downOffset` 30, `_fontSizeScale` 1.5; `heal_text`(UIHealText) `#00ff95` "+n", `_floatOffset` 40; `hud_unit`의 `popup`(중심 위 150)에서 생김.
- 언제(데이터 전수 조사 69,123개 컴포넌트, 비공개 조사 기록): 숫자 표시를 데이터가 강제하는 건 극소수 — 로스터에선 蕾缪안 S3 포탄
  (`lemuen_s3_attack` FixedValueDamage `_forceDisplayDamageNum`)과 적 xi·mdrock·mousek 보호막 흡수(`BlockDamage._showDamageNumber`, **아직 안 함**).
  나머지는 코드: `Modifier.isCritical`, `BattleConsts.MODIFIER_CRIT_THRESHOLD = 1.5`, `UIDamageText.CRITICAL_FONT_SIZE_SCALE = 1.1`(메타데이터 기본값).
  치명타 = PRTS 作战机制 「伤害红字（暴击）」 「单位在造成的伤害不低于预期伤害的1.5倍时，会在造成伤害后弹出红色的数字…官方称呼为Critical」 —
  예상 피해 = ATK × 배율을 대상 방어/법저로 깎은 값(穿透 제외), 실제 피해 = 脆弱·피해 배율·穿透까지 넣은 값 → 빨간 숫자는 사실상 脆弱·增伤·穿透와 함께 나온다
  (처음 커밋 ab74515a은 「ATK × 1.5 이상」으로 잘못 봤다 → 고침). 강제 표시는 PRTS 「强制红字」의 蕾缪安 归乡邀约(瞄准射击时 — 우리 S3 'snipe'·'bombard' 태그).
  보호막: PRTS 「强制红字与蓝字」 — 빨간 숫자가 될 타격이 屏障/护盾을 못 뚫으면 그 막기 방식이 허용하면 파란 숫자(클라 `block_text` `#3a35d9`, 나머지는
  damage_text와 같음), 거부하면 노란 「BLOCK」 → 막힌 타격에 빨간 숫자는 없다(관리자 기억과 같음). 허용 플래그 = `BlockDamage._showDamageNumber`(115개 중 17개,
  로스터에선 xi·mdrock·mousek 보호막). **구현(관리자 결정 「파란 숫자랑 BLOCK 넣어줘」)**: 시뮬레이션이 빨간 숫자감(치명타·강제) 타격을 보호막이 전부 막으면
  'blk' 이벤트 [id, 피해, 1 파란 / 0 BLOCK] — `damage.js absorbShields`(흡수한 버프 키를 `info`로 돌려줌)와 `enemies.js artsBarrier`(법술 장벽, 취소 시);
  허용 키 = `local-hud.js BLOCK_SHOWN`(`ab:xiShield`, `ab:sandDef` 鼠王, `ab:rockPower` 泥岩). 렌더: `num-official.js` 파란 숫자 `#3a35d9`(block_text),
  노란 「BLOCK」 `#ff9000`([추정 모양] 클라 그림 못 찾음 — PRTS 색), 공식 숫자 방식에서만. 보호막을 뚫은 타격은 그대로 빨간 숫자(흡수 뒤 HP 감소량).
  「卫戍协议：盟约」 전 동시 10개 제한은 안 함(그 뒤 버전은 제한 없음). 회복 `+n`은 데이터에 끄는 플래그가 없어 늘 표시 [추정;
  PRTS·나무위키 언급 없음]. 전투 공식 정리는 관리자 노트.
- 시뮬레이션: `server/sim/local-hud.js damageNumberFlag(dmg, ss, 예상, 실제)` → `damage.js`(피해 배율까지 계산한 뒤)가 'dmg' 이벤트 5번째 칸(0 / 1 치명타 / 2 강제).
  지속 피해('dot')·무来源은 치명타 아님.
- 렌더: `render/num-official.js` — 피해는 플래그 있을 때만, 회복은 늘. 30단위(화면 고정 hudUnit), 치명타 글자 ×1.1, 흩어짐 ±(10, 5), 0.5초.
  움직임은 공식 클라(DOTween, 2026-10-10 확인): 피해(`UIDamageText.SetTweens`) = 앞 절반(0.25초) OutExpo로 위로 `_upOffset` 30·크기
  1 → `_fontSizeScale` 1.5, 뒤 절반 InExpo로 시작점보다 `_downOffset` 30 아래(두 목표 모두 시작 위치 기준)·크기 1.5 → 0, 투명도 트윈 없음(파란 숫자·
  BLOCK도 같은 움직임). 회복(`UIHealText.SetTweens`) = 0.5초 OutCubic로 위로 `_floatOffset` 40, 글자 알파 1 → 0 InExpo, 크기 트윈 없음
  (예전 1.5배 팝은 없음). 피해 쪽은 2026-10-07 사용자 영상 측정(처음 0.87배, 마지막 0.13초에 줄며 떨어짐 — `fx.md` 「데미지 숫자」)과 같은 모양이고
  그때 「최종 크기」로 잰 것이 최고 크기(30 × 1.5)다 — 크기가 예전보다 1.5배. 핫픽스(DefinedFix.lua) 없음. Bitmap 글꼴(Novecento Wide, 이미
  `public/fonts`에 있음).
- 뜨는 높이(관리자 「좀 높아 보임」, 2026-10-10 공식 클라로 확인 — 바꾸지 않음): `UIUnitHUD.Attach`가 `hud_unit`을 `UIFollower.Follow(unit.uiPoint,
  unit.hudOffset)`로 붙이고, `uiPoint` = 유닛 `_uiMountPoint`(프리팹에서 비어 있으면 `Unit.OnAwake`가 유닛 자신의 transform으로 채움 — 아미야·적 예시 모두 비어
  있음), `hudOffset` 기본 0, 위치는 전투 카메라 뷰포트 → UI 카메라(`UIFollower._GetTargetPosition`). 숫자는 `_ShowDamageText` → `UIController.ShowModifierText` →
  `ShowNumericText`가 UI 글자 층에 붙이고 `UIPopup.InitPosition`이 `popup`(`hud_unit` 중심 위 150, 크기·배율 1)의 위치 + 흩어짐으로 **한 번** 놓는다.
  → HP 바(중심 아래 54.5)와 숫자(위 150)의 거리 204.5단위는 우리와 같다. `hud_unit` 중심은 오퍼레이터·소환물이 유닛 점(2026-10-23부터, 공식대로),
  적도 2026-10-24부터 유닛 점(모델이 프리팹 자리에 섬 — render.md 「모델 위치값·그림자 — 적 전부」); 모델이 점에 서 있는 장치만 점 위 24.5(`HUD_ANCHOR`,
  바 캡처로 맞춤 — 「① 아군 바」).
  달랐던 것 하나: 우리 숫자는 유닛을 따라 움직였다 — 공식은 생긴 자리에 남는다(2026-10-10 고침).
- 설정 「伤害数字样式 / 대미지 숫자 방식」: 공식(기본) / 전부 표시(예전 숫자 — 유형별 색·합산·줄 배치), `sp.pref.dmgNumberStyle`(`render/number-style.js`);
  「대미지 숫자 표시」를 켰을 때만 보인다. 2D 대체 화면(`ui/fallbackField.js`)의 숫자는 그대로.
- 디버그 아레나·mock: 회복 `+180`만 뜨고 일반 피해는 숫자 없음; 테스트: 蕾缪안 S3 강제 표시, 같은 전투에 脆弱 ×1.6을 걸면 빨간 숫자가 생김.

**⑤ 상태 이펙트** (관리자 요청 「冷氣·冻结·战栗·은신·위장 … 그 외 상태도 확인 후 같이」, 방법 1 = 공식 이펙트 그대로; `render/fxstatus.js` → `fxgame.js statusOn/Off`):
공식은 상태를 아이콘 줄이 아니라 이펙트 프리팹으로 보인다(캡처 9·10). 프리팹은 `battle/prefabs/effects/buff.ab`·`common.ab`(`fx_extract.py --bundle buff/common`,
index.json에 두 번들 추가 — 기존 125개 그대로), 전부 루프(`_isLoop` 1), 붙는 곳은 `_spawnLocation`(1 발, 2 몸 HIT, 4 머리, 5 바닥 중앙 — 데이터).
상태 → 프리팹은 이름으로 맞춤 [추정·미조사: 클라 매핑을 아직 안 읽음, 상수 `COMMON_EFFECT_PREFIX`는 `common_`]:
晕眩 `buff_stun`(머리) · 冻结은 아래 「클라 버프 표의 이펙트」 · 寒冷 `buff_cold`(머리 눈꽃 — 冻结 중에도) · 沉睡 `buff_sleep`(몸) · 沉默 `buff_silence`(머리) ·
恐惧 `common_buff_fear` · 战栗 `common_buff_thrill`(머리 주먹 — 캡처 10; 예전엔 공포 아이콘으로 잘못 연결) · 缴械 `common_disarm_icon` · 减速 `buff_slowdown`(발) ·
迟缓 `buff_sluggish`(발) · 攻速下降 `buff_attack_speed_reduction_01`(발) · 虚弱 `buff_weak` · 防御下降 `buff_defdown` · 法抗下降 `buff_magic_resistance_down` ·
脆弱(4종) 없음(관리자 결정 2026-10-31 — 아래 「클라 버프 표의 이펙트」; 클라 버프 `weak[limit]`인 脆弱은 자기 `buff_weak[limit]`(머리) — docs/rules/fx.md 「`weak[limit]`의 이펙트」) · 浮空 `common_levitate_01`(바닥) · 적 隐匿 `common_invisible`(발; 그 ColorModifier대로 모델 회색 .5·α .894 — 예전 45 % 반투명 대신) ·
아군 隐匿 `common_stealth` [추정] · 迷彩 `common_buff_micai_01`(몸) [추정: 세 변형 중 _01].
- **클라 버프 표의 이펙트**(2026-10-31, 공식 클라에서 확인): 冻结·麻痹는 `loadFromDB` 버프라 그 모양은 클라 버프 표(BuffDB) 행의 `overrideEffectKey`다 —
  이름 맞춤을 이것으로 바꿨다. 冻结: 오퍼레이터(적의 寒冷 짝, `e2c_freeze`) `buff_frozen`(발), 적(오퍼레이터의 寒冷 짝, `c2e_freeze`) `buff_frozen_to_enemy` —
  빈 루트에 `OnPlayEmitter` 둘이 재생 순간의 이동 방식을 봐서 지상이면 `buff_frozen_to_walk`(발), 비행이면 `buff_frozen_to_fly`(몸). 예전 `buff_autochess_frozen`은
  어느 버프도 부르지 않는 이름이었다(셋 다 같은 짜임의 발 얼음 덩어리 — 노드 10개가 같고, `_to_walk`는 얼음 재질 셋이 따로). 麻痹: `palsy[stack]` → `common_061_numb_01`(머리)인데,
  그 프리팹의 `SwitchableMultiEffectByBuffStackCnt`가 2층(EQUALS)이면 `_02`, 3층부터(GE) `_03`을 만들고 자기는 멈춘다(멈춘 파티클은 꺼짐) — 한 번에
  하나(`fxstatus.js STACK_FX palsy`; 시뮬이 층이 바뀔 때마다 fx `stacks`를 보냄). 麻痹震颤 0.5 s는 `palsying` → `common_061_numb_hit_01`(HIT 지점, 한 번,
  `_delayToFinish` 0.5; `fxgame.js palsyFx`, 그리면 2D 표시 대신). 缴械 `common_disarm_icon`은 그대로: 이 모드에서 缴械를 거는 것은 `enemy_1525_blkswb`의
  `enemy_blkswb_s[clear_sp]`뿐이고 그 버프가 이 이펙트를 부른다(표의 `disarmed_and_cant_use_skill` → `common_disarm_01`은 `common_disarm_icon`을
  띄우는 껍데기 + 발 부분 — 거는 곳 없음). 战栗 `disarmed_combat` → `common_buff_thrill`, 晕眩·沉默·沉睡·迟缓·恐惧·寒冷도 표와 같다.
  脆弱: 표의 취약 행(`weak`·`weak[phy]`·`weak[magic]`·`weak[ep]`의 `[inf]`/`[limit]`)은 `weak[limit]` 말고 이펙트가 없고, 예전에 모든 脆弱에 그리던
  공용 `buff_ fragile_01`은 클라 전체에서 `sktok_mine`·`sktok_dqmine`(이 모드에 없는 지뢰 토큰)의 `take_damage_scale_up[mine]`만 부른다 → 관리자 결정
  2026-10-31로 지움(이펙트 층이 꺼졌을 때의 아이콘은 그대로).
- 머리 높이 = 모델 높이 × 1.1 [추정 — 캡처 10의 주먹이 머리 위], 몸 .5, 발 0(`fx.js bodyZ`). 늘 위 캔버스(유닛 위)에 그린다: 이펙트 세션의 렌더러별
  위/아래 나누기(1f5ecd41, sortingOrder > 0 또는 0 + fudge < 0 = 위)를 상태 프리팹에 쓰면 冻结 얼음(전부 order 0·fudge 0)이 유닛 뒤로 가서 캡처 9와 달랐다
  — 클라는 order 0을 깊이로 정렬해 덩어리가 모델 앞에 온다 → 상태 이펙트는 나누지 않는다(`playStatus` `split = false`).
  **단 sortingOrder < 0만 모델 뒤**(관리자 제보 2026-10-14 「이네스와 카넬리안 S2의 속박 이펙트가 이질적」, 유튜브 캡처 두 장: 이네스는 몸을 감는 가는 붉은 줄과
  흰 점, 카넬리안은 다리·허리를 감는 금빛 모래 줄기만 앞에 보이고 붉은·금빛 기운은 실루엣 둘레에만): 통째로 위에 그리면 이네스 글로우(-1, 몸통만 한 붉은 Additive)와
  카넬리안 모래 판(-2·-3)·모래 파티클(-5)이 몸 전체를 칠했다. 'high'(나누기 켜짐)에서 음수 순서 렌더러가 있는 상태 프리팹만 `split: 'backOnly'`
  (`fxplayer.js hasBackOrder`; order < 0 → FX_BACK, 나머지는 예전처럼 앞 — 冻结 얼음은 그대로 앞). 바뀌는 상태 프리팹 17개는 바닥 그늘 `andi`(冻结·인디고),
  고리·소용돌이 뒤쪽(`ring_back` 시빌라이트 에테르나, `qixuan_back` 수르트, `ice_back` 실버애쉬 더 레인프로스트), 글로우·바탕판(치우바이 `darkglow`, 뮤엘시스
  `bg_01`, 浮空·迷彩·隐匿·抵抗·감속 꼬리 등) — 이름대로 뒤쪽 것들. 'medium'은 나누기가 없어 예전대로 전부 위. 디버그 아레나 전후 비교(Windows Chrome)로
  이네스·카넬리안 덮개가 사라지고 줄·줄기만 남는 것, 冻结 얼음이 앞에 남는 것 확인. 테스트 `test/render/status-buff-fx.test.js` 「sortingOrder < 0 behind」.
  **키트 이벤트가 유닛에 트는 프리팹도 같다**(2026-10-24, 관리자 아레나 확인 「노시스 S2 충전 1의 푸른 막」): `fxgame.js spawn`(`render/fx/kitofficial.js` 계획)은
  유닛 위 재생을 통째로 위 캔버스에 그려, 노시스 S2 충전 1 `gnosis_skill_02_buff_01`의 어두운 바탕 `andi`(Plane 1.34×1.39칸, AlphaBlend, order −1)가 몸
  전체를 푸르게 덮었다 → 'high'에서 음수 순서 렌더러가 있으면 `split: 'backOnly'`(나머지는 예전처럼 앞), 없으면 그대로 위. 아레나(Windows Chrome) 전후:
  모델이 또렷해지고 바탕은 몸 뒤, 흰 바람 줄기는 앞 — 공식 녹화와 같은 모양. 테스트 같은 파일 「a kit's play on a unit splits the same way」.
- 일부 프리팹은 파티클이 한 번만 돌아(`buff_silence` 1초) 상태가 남아 있으면 다시 시작한다. 파일을 못 읽으면 그 상태는 예전 아이콘.
- **중첩 수정**(관리자 제보 2026-10-08, 26108991): `statusOff`가 멈춘
  인스턴스의 `again`(다시 시작)을 남겨 두어, 파티클이 다 죽은 뒤 상태가 다시 켜져 있으면(다음 기절) 새 인스턴스 옆에 복사본을 하나 더
  틀었다 — 다시 걸릴 때마다 하나씩 늘었다(아레나 1 2 3 4…, 실제 솔로 판 최대 8). 또 방출만 멈춰서 `buff_stun`의 표시(수명 10초 파티클 1개)가
  상태가 끝난 뒤 최대 10초 머리 위에 남았다. → `statusOff`가 `again`을 지우고, `fxstatus.js`는 `now`로 끝낸다(정비 금빛은 예전처럼 서서히).
  **끝내는 시점**(2026-10-11 공식 클라): `Entity.OnBuffFinish` → `RemoveBuffEffect` → `Effect.FinishMe` —
  구성 요소마다 `OnFinish`(방출 정지) 뒤 `delayToRecycle`이 0보다 크고 즉시 끝내기가 아니면 그만큼 뒤에 회수, 아니면 바로 회수. 파티클 이펙트의
  `delayToRecycle`은 프리팹 `_delayToFinish`(`ParticleEffect.get_delayToRecycle`). 그래서 `now`는 「방출을 멈추고 프리팹 `_delayToFinish` 뒤
  제거」(`fxgame.js statusOff`, 프레임마다 `finishAt`; 2026-10-23부터 멈추는 것은 첫 시스템과 `_inactiveOnFinish`만 — docs/rules/fx.md 「투사체 꼬리
  끝내기」 버프 이펙트의 끝)이고, 값이 0이거나 없으면 예전처럼 바로 제거. 값은 `fx_extract.py delay_to_finish`가 프리팹 JSON의
  `finish`로 뽑는다(루트 이펙트 구성 요소의 raw float #5): buff_stun·buff_autochess_frozen(2026-10-31부터 안 씀)·buff_sleep·buff_silence·buff_sluggish·common_buff_fear·
  common_buff_thrill·common_disarm_icon·common_levitate_01 0, buff_cold 0.06, buff_attack_speed_reduction_01 0.3, buff_slowdown·buff_weak·buff_defdown·
  buff_magic_resistance_down·buff_ fragile_01·common_invisible·common_buff_micai_01·lemuen_talent_buff_01 0.5 — 기절 표시는 공식도 바로 사라진다.
  `immediately`(즉시 끝내기)를 고르는 쪽(버프가 끝난 이유)은 안 봄 [추정: 시간이 다 된 상태는 즉시 아님]. `playStatus`는 같은 유닛·같은 키의 살아 있는
  인스턴스가 있으면 새로 만들지 않는다(로드 중 꺼졌다 켜지면 로드가 둘 걸리던 것). 같은 경로라 목록 전체에 적용 — 수정 전 아레나에서
  18종 중 13종이 겹쳤다(기절·冻结·寒冷·沉睡·减速·攻速下降·虚弱·防御下降·法抗下降·脆弱·浮空·隐匿·迷彩; 沉默·恐惧·战栗·缴械·迟缓은 파티클 수명이
  짧아 거의 안 보였음), 수정 후 18종 모두 최대 1개·상태가 끝나면 0개. 테스트 `test/local-patch-status-boomerang.test.js`.
- **상태 아이콘 줄은 대체 표시만**(관리자 결정 2026-10-14 「낮은 품질 옵션용 fallback만 남기고 제거」): 공식 전투 화면에는 상태 아이콘이 없다(아래 「버프 이펙트」).
  머리 위 원형 아이콘 줄(`units.js _iconKeys`, 원본이 만든 것)은 이펙트 층이 꺼졌을 때만 그린다 — 품질 낮음, WebP 없음, 추출 이펙트 없음(`fxgame.js statusLayer`
  → `fxstatus.js syncStatusFx`가 매 프레임 `view._statusIcons`). 층이 켜져 있으면 이펙트가 없는 상태(嘲讽, 无敌, 일반 护盾, 麻痹, 折射, 替身 …)도 아이콘 없이
  아무것도 안 그린다(공식과 같음). 冻结·寒冷 파란 틴트는 그 이펙트가 켜진 동안만 쉰다(예전 그대로). 예전(2026-10-07~10-14)에는 이펙트로 그린 상태만 아이콘이 빠졌다.
  이펙트 색인을 아직 받는 중이면 아이콘도 이펙트도 안 그린다(2026-11-15, 사용자 제보 「대체 그림이 잠깐 보였다가 공식」 — 색인 전에는 층이 꺼진 것으로 보여 아이콘이 먼저 떴다): `fxgame.js statusStandIn`(품질 낮음·층 실패·추출 이펙트 없음일 때만 참)을 `syncStatusFx`가 읽는다. 정예 기물의 바닥 고리(fx.md 「정예 기물 금빛」)도 같은 답을 쓴다. 재발 방지: `test/render/status-stand-in-wait.test.js`.
- **버프 이펙트**(관리자 결정 2026-10-14 「공식 프리팹 연결 시작」): 클라에는 상태별 공용 이펙트 표가 없다 — 버프마다 데이터의 `overrideEffectKey`(템플릿
  `effectKey`)로 자기 이펙트를 정하고(`Entity.AddBuffEffect`, 이름당 하나), 없으면 아무것도 안 그린다. 공식 클라 문자열에 상태 이름 → 프리팹 표는 없고 접두어
  `common_`만 있다. EN 버프 템플릿 전수: INVINCIBLE 버프 46개 중 21개, UNMOVABLE 22개 중 12개, 키에 shield가 든 110개 중 42개, taunt 10개 중 9개가 이펙트 없음;
  공용처럼 보이는 `common_invincible_01~03`·`common_unmovable_01`·`common_shield_01`은 특정 적·장비 하나·케언 S2만 쓴다. 그래서 같은 상태라도 건 쪽에 따라 다르다:
  - 건 쪽별(`fxstatus.js SOURCE_FX`, sim 'status' 켬 이벤트에 건 유닛 id·버프 힌트 `fxTag`·방패 층 `n` — `battle/status.js statusOnEvent`, 골든 다이제스트는 이벤트를 종류별로만 셈):
    束缚 — 인디고 재능 `indigo_buff_01_start`, 카넬리안 S2 강화 `billro_skill_02_buff_03`, 미즈키 S2 `mizuki_skill_02_buff_02`, 시빌라이트 에테르나 S2
    `cetsyr_skill_02_tie`, 이네스 재능 `ines_imprison_01`, 글래디아 S3 `glady_skill_03_buff_to_enemy`(`skchr_glady_3/ChantAttack1`), 뮤엘시스 S3 `token_10030_mlyss_wtrman_c3_debuff_01`,
    치우바이 S1만 `qiubai_skill_01_buff`(재능·모듈 落英 속박은 없음 → 키트가 `fxTag: 's1'`); 안젤리나 더 멜로우 위시 缚地는 없음. 抵抗 — 노시스 재능 2(谢拉格 대상)
    `common_ resistance_01`; 루멘·베토치키·적의 抵抗은 없음. 禁疗 — 수르트 재능 2 `surtr_buff_01_start`.
  - 키트 버프 키별(`KEY_FX`): 파피루스 재능 `papyrs_talent_01`, 실버애쉬 더 레인프로스트 S1 배치 屏障 `svash2_skill_01_shield_01`, 캐서린 장치 `token_cathy_catsld_shield_01`,
    레코드키퍼 S2 `reckpr_skill2_hit_buff`, 산탈라 재능(`sntlla:born`) `common_ resistance_01`, 카넬리안 S3 표식 `billro_skill_03_buff_03_01`([part]; 스택이 가득 찬
    [full] `_03_02`는 스택 수가 이벤트에 없어 안 씀 [추정]), 엑시아 더 뉴 커버넌트 S2 屏障 — 본인 `angel2_skill_2_buff_01`([trigger]), 공속을 뺏긴 팀원 `_02`([select_target])
    [추정: 주인 짝]; 원소 폭발 — 凋亡 양쪽 `common_darkdamage_debuff`, 오퍼레이터의 灼燃 `buff_burn`·侵蚀 방어 감소 `buff_defdown`(적의 灼燃·侵蚀은 타격 이펙트뿐).
    폭발 순간의 타격(2026-10-21, `fxgame.js burstFx`, 시뮬 fx 'burst' {id, element}): EN 버프 템플릿 `ep_break_<원소>_char`/`_enemy`의 ON_BUFF_START
    `CreateEffect`(BUFF_OWNER) — 灼燃 적 `common_firedamage_hit`(오퍼레이터는 없음), 侵蚀 오퍼레이터 `common_waterElementExplosion`·적
    `common_waterdamage_hit`, 凋亡 양쪽 `common_darkdamage_hit`; 神经 오퍼레이터는 `ep_break_sanity[epfree]`의 overrideEffectKey
    `common_nerve_injury_01_hit`(적은 palsy[stack], 없음). 공식 것이 나오면 옛 절차 'burst'는 안 그림. 추출 `--bundle common --prefab …` 5개. [실제 판 이상 없음 2026-10-28]
  - 층별(`LAYER_FX`): 니어 더 래디언트 나이트 S2 `nearl2_s_2[shield][a..d]` = 남은 횟수 ≥ 1..4마다 `nearl2_skill_02_buff_02..05` 하나씩, 'parry' fx마다 하나 줄임.
  - 일반 스킬 보호막(`generic:shield:*`)·아이템·인연 보호막 층·우리 키트의 무적(첸 더 던스트릭 S2, 머드락 S3 闭锁, 데겐블레허 S3, 튤립, 카제마루 교체)·도발(벤델라)·
    메테오 파쇄·비질 늑대 표식(공식 이펙트는 늑대 쪽)은 공식 버프에 이펙트가 없어 아무것도 안 그린다.
  - 아이콘 시절 `statusFxKey`가 'invulnerable'을 `/vulner/`로 脆弱 이펙트에 잇던 것도 막음(그 상태를 거는 곳은 없었음).
  - 추출(git 밖): `fx_extract.py --bundle qiubai --prefab qiubai_skill_01_buff`, `--bundle mlyss_token`·`--bundle cathy_token --pack pkgrps/btl_pfb_fx_token_0.ab
    --match '^token_10030_mlyss_wtrman_c3_debuff_01$'`/`'^token_cathy_catsld_shield_01'`, `--bundle common --prefab 'common_ resistance_01' --prefab common_darkdamage_debuff`,
    `--bundle buff --prefab buff_burn`. 나머지는 이미 뽑혀 있었다(오퍼레이터 번들). 근거 추출: EN `config/buff_template_holder.ab`(관리자 노트의 2026-10-10 추출),
    charpack MonoBehaviour, `[uc]skills.ab`, CN 공개 `battle/buff_template_data.json`.
  - 확인: 단위 `test/render/status-buff-fx.test.js`, `test/local-patch-hud.test.js` ⑤. [실제 판 이상 없음 2026-10-28]
- 디버그 아레나 확인: 寒冷+战栗(눈꽃 위·주먹 아래, 캡처 10과 같음), 冻结+寒冷(캡처 9의 얼음), 沉默 ✕, 脆弱, 沉睡, 迷彩. 아레나에서 WebGL 경고
  `drawElementsInstanced: no buffer is bound` — 상태를 하나도 안 걸어도 나와서 이번 작업과 무관(조사 안 함).
- git 밖 생성물: `public/assets/local/fx/buff/`, `fx/common/`, 새 텍스처·메시, `fx/index.json`.

**배치 방향 표시** (관리자 요청 「배치 방향 표시 화살표도 실제 인게임과 동일하게」, `facing.js`): 오퍼레이터 프리팹의 `Others/Direction/DirectionIndicator` —
땅에 눕힌 SpriteRenderer 2장(배율 0.55): 링 `sprite_direction_ring`(rect 128, ppu 100 → 지름 0.704타일, 흰 α.502)과 화살표 `sprite_direction_arrow`
(rect 128에 65×112가 (31, 8)에 패킹, 바깥쪽 0.333타일, `#FF9900`). 매 프레임 네 모서리를 카메라로 투영한 SimpleMesh라 보드에 눕는다. 그림은 웹 manifest
`ui/battle/sprite_direction_*`(이미 있음); 없으면 예전 주황 셰브런. 청록 링(캡처 13)은 방향을 정할 때 잠깐 뜨는 `common_direction_hint_*` 이펙트로 별개(안 함).

## 위장 아이콘 (2026-10-06, 관리자 결정 「위장에 다른 아이콘을 붙여줘」)
- 迷彩(위장)과 隐匿(은신)은 둘 다 반투명 + 같은 `stealth` 아이콘이라 구분이 안 됐다(위 "은신 아군이 적 스플래시에 맞음" — 迷彩는 스플래시를 맞는 게 공식).
- 서버: b.snap 유닛 플래그에 `UF_CAMOU`(1024, `shared/local.js`)를 더한다 — `server/sim/snapshot.js flagsOf` 1줄. 迷彩이고 효력 있는 隐匿가 없을 때만
  (둘 다면 은신 아이콘). 반투명(`UF.STEALTH`)은 그대로 둘 다 켠다.
- 클라이언트: `render/units.js _iconKeys`가 `UF_CAMOU`면 `camou` 아이콘(올리브색 원판에 위장 무늬, 은신은 회색 눈에 빗금), 상태 이름 `*:camou`는
  `style.js` 추측표에서 `camou`로(이전엔 `stealth`) 가고 플래그가 정하므로 아이콘을 두 번 그리지 않는다. 아이콘 그림 `textures.js drawStatusIcon` `camou`
  (`STATUS_KEYS.push('camou')`, 원본처럼 캔버스에 그린 아이콘).
- 공식 아이콘: 없음. 공식 전투 화면은 오퍼레이터 위에 상태 아이콘을 그리지 않고(이 원본의 아이콘 행은 원본이 만든 것), 클라이언트 UI에서 찾은 것은 적 도감
  유형 아이콘 `enemyTypeIcon/invisible_icon`(隐匿 적)뿐이다. 반투명 표현은 둘 다 유지 [추정: 공식도 迷彩 오퍼레이터를 반투명으로 그린다].
- 한국어 이름표·툴팁: 상태 아이콘에 이름표가 없어서 추가하지 않았다(용어는 `ba.camou` = 위장).
- 2026-10-14부터 상태 아이콘 줄 전체가 이펙트 층이 꺼졌을 때의 대체 표시다(「전투 화면 UI」 ⑤).
- 확인: `test/local-patch-camou.test.js`(寒芒克洛丝 S1 迷彩 → `UF_CAMOU`, 叙拉古 隐匿 → 없음; 유닛 뷰 아이콘), headless Chromium 렌더 데모(포트 3103,
  寒芒克洛丝 S1 옆에 隐匿 오퍼레이터): 위장 무늬 아이콘과 은신 아이콘이 나란히 보임.

## 협동 방 초대 링크 문구 (2026-10-06)
- 「复制链接」이 클립보드에 넣는 문구(`room.js copy`)는 DOM 번역을 거치지 않아 중국어로 나갔다 → `tr()`로 감싸고 ko `patterns.json`에
  「{0}邀请你加入卫戍协议：盟约【{1}】」→「{0} 님이 위수 협의: 맹약【{1}】에 초대했습니다」(난이도 이름은 data.json 번역).
- 2026-10-23(관리자 요청): 문구 다음 줄에 방 크기와 규칙 모드(「4인 연합 · 클래식」), 커스텀 방이면 그 아래 「커스텀 규칙」과 공식과 다른
  설정을 한 줄씩(`- …`, 매치 화면의 커스텀 규칙 요약 `ui/customSummary.js`와 같은 문구; 다른 설정이 없으면 「커스텀 규칙: 공식 규칙과 같음」).
  `room.js inviteMessage`, 확인: `test/client-static.test.js` 「inviteMessage」.

## 링크 미리보기(OG 태그) (2026-10-10, 관리자 결정)
- 증상: 링크를 붙여넣으면 미리보기가 중국어(`index.html`의 `<title>`·`description`, OG 태그 없음). 미리보기 봇은 JS를 돌리지 않아
  `ui/lang.js`의 한국어 전환이 닿지 않는다.
- 처리(관리자 결정 「공개 레포는 기본이 한국어, 배포 url은 노출하지 말고 상대경로」): `index.html` 머리를 한국어로(`<html lang="ko">`,
  title·description·`apple-mobile-web-app-title`, 첫 방문 언어와 같은 문구 — ko 팩의 「卫戍协议：盟约 · STRONGHOLD PROTOCOL」 번역) +
  `og:type/site_name/locale/title/description/image`, `twitter:card`. `og:url`은 넣지 않는다(절대 주소여야 해서). `og:image`는 상대 경로
  `/assets/ui/loading/loading_ac_core.png`(공식 위수 협의 로딩 그림, 에셋 파이프라인 `data/assets.json`; 에셋 없는 체크아웃은 그림 없음).
  탭 제목·`lang`은 지금도 부팅 뒤 `ui/lang.js`가 고른 언어로 바꾼다.
- `[ASSUMED]` OG 규격은 `og:image`를 절대 URL로 요구한다. 카카오톡·디스코드 등이 상대 경로를 페이지 주소 기준으로 풀어 주는지는 미확인 —
  그림이 안 뜨면 서버가 요청 Host로 절대 주소를 채우는 방식이 대안(저장소에는 여전히 주소가 남지 않음).

## 휴대폰 화면 조정 (2026-10-06, 관리자 요청)
- 지원하는 가장 작은 휴대폰은 가로 **740×360** CSS px(관리자 결정 2026-11-08). upstream에서 물려받은 640×360은 폭 640인 16:9 구형 기기 기준이라 뺐다.
  높이 360은 요즘 Android(갤럭시 S 가로 약 780×360)에도 흔해 그대로 둔다. 브라우저 시험의 최소 기기(`devices.e2e`의 `phone-min`,
  `playtest6-ui.e2e`·`hotkeys.e2e`·`bond-collapse.e2e`·`spectator.e2e`)도 740×360이다. 아이폰 SE·8(667×375)은 이 범위 밖이다.
  CSS의 더 좁은 분기(`max-width: 700/720px` 등)는 작은 창을 위해 남긴다. 아래와 다른 절의 640×360 확인 기록은 그때 잰 값이다.
- 맹약 줄 「︽」 접기 탭: 터치 화면(`pointer: coarse` 또는 높이 ≤540)에서는 터치 영역 = 그림(`btn_close` 37×17단위, 최소 폭 24px).
  예전 102×26단위 상자(844×390에서 61×16px)가 12번째 줄 4–6칸 끝을 덮어 그 칸의 오퍼를 누르면 줄이 접혔다 → 24×10px. 접힌 `btn_open`은 그대로. (hud-art.css)
- 리소스 미리 받기 카드: 높이 ≤540에서 화면 전체를 어둡게 막던 대화 상자 → 오른쪽 위 작은 카드(폭 min(240px, 30vw), 글자 11.5px),
  나머지 화면은 그대로 누를 수 있다. 동의해야 받는 동작은 같음. (resources.css)
- 타이틀 설정·전체 화면 버튼(upstream #183): 터치 화면에서 16px 버튼 두 개의 44px 터치 영역이 겹쳐 전체 화면 버튼이 설정 버튼을 가렸다 →
  28px + 간격 14px. (devices.css)
- 타이틀 로그인 상자 아래 연결 줄은 한 줄(관리자 요청 2026-10-13, 시안 중 「접속자 제거 + 연결 글자 숨김 + 휴대폰에서만 상자 넓힘」 선택): 접속자 수 알약은
  타이틀에서 빼고(로비에만), 연결된 뒤 핑이 재지면(이름 입력 전 `connected`에서도 소켓이 핑을 보냄) 「서버에 연결됨」 글자를 숨겨 초록 점 + 핑만
  (글자는 화면 낭독기용 `sr-only`와 툴팁으로 남음), 첫 핑 전과 연결 중·재연결·닫힘은 글자 그대로. 터치 화면은 위 28px 버튼·14px 간격이 커진 만큼 상자를 넓힌다(`--login-w`, 844×390에서 196 → 243px; 전체 화면 안내 폭도 이 값을 읽음).
  한국어 재연결 문구는 「연결 끊김, 재연결 중」으로 줄였다(예전 문구는 한 줄을 5–9px 넘침). 영어 등 다른 언어는 두 줄이 될 수 있다(관리자: 당분간 신경 쓰지 않음).
  (title.js·title.css·devices.css) 확인: Windows Chrome 한국어·중국어 1920×1080·1600×900·1280×720·1180×820(터치)·932×430·844×390·740×360·667×375에서
  연결됨·연결 중·재연결·닫힘·대기 모두 한 줄.
- 타이틀 라이선스 고지(관리자 결정 2026-10-13, 중국 포크 서버들이 로그인 창 아래에 둔 「公告」「关于本服务器」 버튼 줄을 따름): 로그인 상자 **밖** 바로 아래
  글자 버튼 「서버 정보」(`服务器信息`, 아이콘 없음) 하나, 상자 오른쪽 끝에 맞춤(버튼이 하나뿐이라; 관리자 요청 2026-10-13 — 버튼 이름은 「이 서버에 대하여」 →
  「라이선스」 → 「서버 정보」로 정함) — 상자 안 연결 줄에 넣으면 그 줄이 다시 두 줄이 된다. 누르면 모달(`ui/about.js AboutModal`, 제목 「이 서버에 대하여」 `关于本服务器`)에
  NOTICE.md 요약 다섯 항목(비공식·무관 / 비상업 한정: 학습·학술 연구·개인 오락, 수익화 금지 / 게임 소재 저작권은 Hypergryph·Yostar, 코드 라이선스 대상 아님 /
  코드 GPL-3.0-or-later·무보증·LICENSE 등은 저장소에 / 권리자 삭제 요청은 저장소 Issue) + 소스 저장소 링크(관리자: 넣기; 주소는 `settings.js ISSUES_URL`의
  저장소, 공개 저장소 첫 push 전에는 열리지 않음) + 저작권 줄. 「공지」 버튼은 두지 않음(관리자: 라이선스 버튼만). 하단 저작권 한 줄(`title-foot`)은 누르지 않아도 보이는
  고지라 「비공식 팬 복각 · Hypergryph / Yostar와 무관 · 비상업 용도 한정 · 게임 소재 저작권은 원 권리자에게」로 보강(관리자 요청 2026-10-13; ja·zh-TW 팩도 번역).
  휴대폰 가로(높이 ≤600 터치)는 엠블렘을 줄여(844×390에서 높이 68 → 38px) 버튼 줄 자리를 만든다(관리자 지시: 중국 서버도 이 방식). (title.js·title.css·devices.css)
  확인: Windows Chrome 한국어·중국어·영어, 연결 줄 확인과 같은 8개 크기에서 버튼 줄 한 줄·하단 저작권 줄과 안 겹침(740×360에서 간격 3px로 가장 좁음)·연결 줄 한 줄 유지,
  1600·844·667 폭에서 모달이 열리고 Esc로 닫힘(휴대폰은 본문 스크롤).
- 확인: Chrome(GPU) 844×390·740×360·932·430·1920×1080 — 설정 버튼 중심이 자기 버튼, 접기 탭 24×10.
- 터치 영역이 옆 버튼을 가져가지 않음(관리자 제보 2026-10-17 「버튼 그려지는 위치와 눌리는 위치가 어긋남」): 작은 버튼마다 붙는 44px 터치 영역(`devices.css`
  「touch targets」 `::before`)이 붙어 있는 이웃 버튼 상자 위로 넘어가면, 나중 버튼의 영역이 앞 버튼 위에 그려져 그 버튼의 누름을 가져갔다 — 844×390에서 방 화면
  난이도 버튼 아래 절반(54%, 가운데를 눌러도 「클래식/캐주얼」), 음성 언어 「끄기」 가운데(→「한국어」), 정비 위 맹약 칩 가운데(→「적 정보」), 설정 창 아래쪽 줄
  (→「게임 방법」), 맹약 선택 「금지 맹약 보기」 아래쪽, 협동 방 「키 복사」·「오퍼레이터 설정」 아래쪽 등. 공통 규칙을 변수로 바꾸고(`--tap-w`/`--tap-h` 100% = 그
  방향으로 안 넓힘, `--tap-top`·`--tap-ty`·`--tap-left`·`--tap-tx` = 한쪽으로만) 묶음마다 넓힐 방향을 정함: 나란한 줄(난이도·규칙, 음성 언어, 탭, 왼쪽 아래 모서리)은
  옆으로 안 넓힘, 위아래로 쌓인 쌍은 위 버튼은 위로·아래 버튼은 아래로, 상단 「시뮬레이션 정보」·「적 정보」는 위로(아래는 맹약 칩까지 틈 안에서만), 모서리 버튼은
  아래로(좁은 폰에서 두 줄로 접히면 펼친 도구는 세로로 안 넓히고 ⋯는 오른쪽으로), 대화 상자 아래 줄·타이틀 연결 줄·「서버 정보」는 아래로. 목록의 `.uf__btn`은 이미
  없는 이름이라 뺐다(선택한 기물의 撤退/出售 버튼 `.uframe__btn`에는 원래 터치 영역이 없다). 회귀 테스트: `test/ui/devices.e2e.test.js` 「touch areas never take
  a neighbour's press」(iPhone 14·Pixel 7·640×360·iPad, 타이틀·설정 창·협동 방·목업 정비(⋯ 펼침)·전투·맹약 선택·결과 — 버튼 상자 가장자리 3px 안쪽의 모든 점이 자기
  버튼으로 가는지; 고치기 전 CSS면 실패). 목업 `game-mock.html`에 `loadout.css`·`chat.css`를 더함(빠져 있어 「오퍼레이터 설정」 아이콘이 42px로 그려지고 채팅
  버튼이 23×17이던 목업 전용 차이).
- 판 화면 왼쪽 아래 ⚙·📖·⛶ 접기(관리자 요청 2026-10-12): 휴대폰(높이 ≤600 또는 폭 ≤767의 터치 화면)에서는 세 버튼이 ⋯ 하나 뒤로 접히고(기본 접힘, 도구를
  누르면 다시 접힘), 기기와 상관없이 机变/悬赏 화면 위에 있을 때(`is-over-choice`)도 접힘 — 휴대폰에선 아래 줄 카드가 그 밑에 깔렸고 1920×1080에서도 왼쪽 아래
  카드 아래쪽을 가렸다. 소통·채팅 버튼은 그대로. 펼치면 예전 배치. (`screens/game.js toolsOpen`, `game.css`·`devices.css`)

## iPhone 전체 화면 안내 (2026-10-10, 관리자 요청)
- 증상: iOS Safari 가로 모드에서 주소창·탭 막대가 사라지지 않는다. 원인: iPhone Safari에는 요소 전체 화면 API가 없고(전체 화면 버튼은
  `device.js`가 숨김), Safari는 사용자가 문서를 아래로 스크롤할 때만 막대를 접는데 우리 페이지는 스크롤이 없다(`theme.css` html·body
  `height: 100%`, body `overflow: hidden`, `.screen` absolute). 페이지 코드로 막대를 숨길 방법은 없다(`scrollTo`로는 안 접힘).
- 처리(관리자 결정 2026-10-10 「홈 화면에 추가하라고만, iOS 사파리 유저에게만」): 타이틀 로그인 상자 아래 안내 한 줄 「전체 화면으로 즐기려면
  Safari에서 「공유」 → 「홈 화면에 추가」…」(`index.html` `apple-mobile-web-app-capable`로 홈 화면 아이콘은 막대 없이 열림). iPhone·iPod의
  Safari 자체일 때만(`device.js isIosSafari` — 이 파일의 유일한 UA 판별: 다른 iOS 브라우저와 Safari를 가를 기능 감지가 없다), 홈 화면
  실행(standalone)에서는 안 뜸. Chrome·Firefox·Edge for iOS, 카카오톡·네이버 등 앱 내 브라우저, iPad(전체 화면 버튼 있음)는 제외.
  ✕로 닫으면 `sp.pref.fsNoteClosed`에 기억. (title.js·title.css, test/ui/devices.test.js)
- `[ASSUMED]` 홈 화면 실행에서 막대가 실제로 사라지는지, 안내 위치가 실기기 가로에서 가리는 것이 없는지는 iPhone 실기기 미확인.
- 남은 일: rem 배율이 `100svh` 기준이라 막대가 접혀도 UI가 커지지 않는다(`theme.css` html font-size) — 별건.

## 서버 재시작 예고 (2026-10-09, 관리자 결정)
- 관리자 결정(2026-10-09): 배포 때 바로 재시작하지 않고 30분 뒤에 재시작하며, 그동안 진행 중인 판·대기실에 30·10·5·3·1분 전 예고를 보낸다. 카운트가 끝나면 배포한다.
  공식 게임에는 없는 기능(우리 서버 운영용)이다.
- 서버 `server/local-restart.js` `RestartNotice`: `SIGUSR2`(`server/http/boot.js`, 서버 시작 전에 등록 — 처리기 없는 SIGUSR2는 프로세스를 끝내고, 시작 중에 온 신호는 시작 뒤에 읽는다)를 받으면 `SP_RESTART_FILE`(기본 `<tmpdir>/stronghold-restart`, 컨테이너는 tmpfs `/tmp`)에서
  분(`30`) 또는 `0`/`cancel`을 읽는다. 시작할 때와 `RESTART_MARKS_MIN` 30·10·5·3·1분 전에 hello를 마친 **모든 소켓**(타이틀·로비·대기실·판·관전)에
  `server.restart { inMs, mark }`, 취소는 `{ inMs: null }`. 카운트다운 중에 새로 접속하거나 다시 연결하면 `welcome.restart { inMs }`.
  `inMs`는 남은 시간이라 클라이언트 시계가 틀려도 맞다. 서버는 재시작을 직접 하지 않는다. 끝나고 10분이 지나도 재시작이 오지 않으면 취소로 본다.
  내부 `/healthz`에 `restartInSec`(없으면 null, 프록시 경유 응답에는 없음).
- 마지막 5분(`shared/local.js RESTART_FINAL_MIN`, 관리자 제보 2026-10-09):
  - 새 판 시작 막기: `room.start`를 `ERR.RESTARTING`(「서버가 곧 재시작되어 지금은 새 시뮬레이션을 시작할 수 없습니다」)으로 거부. 이미 진행 중인 판은 그대로.
    `SP_RESTART_NO_START_MIN`이 있으면 그 분(0 = 막지 않음). (같은 날 앞서 「일단 구현만 해놓고 활성화하진 마」로 꺼 두었다가 이 결정으로 켬.)
  - 연결 띠(`ui/connBanner.js`): 「서버 재시작까지 m:ss · 진행 중인 시뮬레이션은 종료됩니다」(0이 되면, 그리고 재시작한 서버에 다시 붙는 동안에는 연결 끊김 문구 대신 「서버를 재시작하는 중입니다 · 재시작이 끝나면 페이지가 자동으로 새로고침됩니다」, 관리자 요청 2026-10-11). 판 밖 = 아래 가운데,
    판 안 = 라운드 캡슐 아래 한 줄(토스트는 그 아래로 밀림). 휴대폰 가로(844×390)에서도 한 줄.
  - 이 5분 동안은 토스트를 띄우지 않는다(5·3·1분 표시, 접속 때 토스트 모두 — 관리자 제보 2026-10-09). 서버는 5·3·1분에도 `server.restart`를 보내지만(남은 시간 갱신) 클라이언트가 토스트를 거른다.
- 클라이언트 `public/js/ui/restartNotice.js`: 그 전까지는 **토스트만**(관리자 제보 2026-10-09 — 처음 구현의 30분 내내 띠는 뺐다).
  5분보다 큰 `mark`(30·10분)마다 경고 토스트 「N분 후 서버가 재시작됩니다. 진행 중인 시뮬레이션은 종료됩니다」(6초), 카운트다운 중에 접속한 페이지는 welcome에서 남은 분으로 한 번(남은 시간이 5분보다 클 때만)
  (`ui.restartAt`로 이미 알던 페이지의 재연결은 다시 띄우지 않음), 취소되면 알던 페이지에만 「서버 재시작이 취소되었습니다」. 판 밖에서는 위쪽 가운데, 판 안
  (`html.sp-in-match`)에서는 라운드 캡슐 아래(기존 토스트 자리). 재시작 뒤에는 기존 흐름 그대로: `room.closed shutdown` → 재연결 → buildGuard가 새 빌드로 새로고침. 서버가 브라우저를 밖에서 새로고침시킬 방법은 없고 페이지가 스스로 한다. 카운트다운을 알던 페이지(`ui.restartAt`)가 `restart` 없는 welcome을 받으면 재시작이 끝난 것으로 보고(`onRestarted`) buildGuard가 60초 간격을 기다리지 않고 3초 간격으로 최대 4번 바로 확인한다(`burst()`, 두 번 연속 같은 새 빌드·판 중이면 대기 규칙은 그대로 — 관리자 요청 2026-10-11). 카운트다운 내내 끊겨 있던 페이지는 예전처럼 60초 확인으로 1~2분 뒤.
- 배포 쪽(배포 스크립트, 이 저장소에 없음): 이미지를 먼저 빌드하고(옛 컨테이너는 계속 서비스), 접속자가 있으면 컨테이너 안에서
  `echo 30 > /tmp/stronghold-restart && kill -USR2 1`로 카운트다운을 시작하고, 내부 healthz의 `restartInSec`가 0이 되면 컨테이너를 다시 만든다.
  접속자가 없으면 카운트다운 없이 바로 진행하고, 도중에 모두 나가면 앞당긴다. 실패하면 취소 공지를 보낸다.
- 방별 진행 상황(2026-10-09, 관리자 결정 「방별 진행 상황 정도면 충분해」·방 코드는 그대로 표시): 내부 `GET /healthz/rooms`(`server/local-rooms.js`, 프록시 경유는 404)가
  방마다 `{ code, mode, difficulty, phase, round, stageId, bossId, humans, connected, bots, spectators, ageMin, matchMin, awayMin }`를 준다(진행 중인 판 먼저, 라운드 높은 순).
  `awayMin`(2026-10-12)은 방의 마지막 사람이 연결을 잃은 뒤 지난 분(`lobby.js` onDisconnect의 `seat.awayAt`), 누가 연결돼 있거나 끊긴 시각을 모르면 `null`.
  배포 스크립트는 연결된 사람이 있거나 끊긴 지 10분이 안 된 방만 기다린다(관리자 결정 2026-10-12: 세워 둔 솔로 판은 연결 0, 잠깐 끊긴 판은 곧 돌아옴).
  카운트다운 동안 이 목록을 「ABCD 협동 극한 R7 휴식 기간 · 사람 2(접속 1) 봇 2 · 판 23분」(끊긴 방은 「· 끊긴 지 3분」을 덧붙임)처럼 보여 준다.
  지금 상태만 보여 줄 뿐 로그에는 남기지 않는다(판 결과는 `[stats]` 줄).
  확인: `test/local-patch-rooms.test.js`(실제 서버·실제 Match로 대기실·판 시작 뒤 목록, 프록시 헤더면 404).
- 확인: `test/local-restart.test.js`(시점·취소·만료는 가짜 타이머, 실제 서버의 방송·welcome·healthz·판 시작 거부, 실제 프로세스에 `SIGUSR2`, 클라이언트 토스트 조건).
  Chrome(로컬 서버 + `SIGUSR2`): 로비 30분, 정비 화면 10분 토스트(전투 중 5분 토스트는 그 뒤 뺌), 협동 판(AI 3명) 정비·전투·휴대폰 가로에서 5분 띠 위치 확인(2026-10-09).
  띠는 보드 배치 칸·상점·팀원 목록·준비 완료 버튼을 가리지 않는다 [관리자 화면 미확인].

## 무중단 배포 — 서버 세대 (2026-10-14, 관리자 결정)
- 관리자 결정(2026-10-14): 배포가 진행 중인 판을 끊지 않는다. 옛 서버는 그 위에서 돌던 판이 끝날 때까지 남고(드레인), 새 손님은 처음부터 새 서버로 간다.
  같은 날 정한 것: 옛 서버는 **스스로** 끝난다(상한 3시간 — 2시간 30분에 남은 판에 위 「서버 재시작 예고」 30분 카운트다운), 세워 둔 판(연결 0, 끊긴 지 10분 이상)은 기다리지 않는다(위 절의 2026-10-12 규칙과 같음),
  옛 서버의 대기실은 닫고 새로고침 안내(3초 뒤 자동), 같은 브라우저의 다른 탭이 옛 서버에서 판 중이면 그 판이 끝날 때까지 기다린다.
  30분 재시작 예고는 예비로 남는다(이 기능이 없는 서버에서 넘어오는 첫 배포, 상한, 급한 배포). 공식 게임에는 없는 기능(우리 서버 운영용)이다.
- 서버 `server/local-generation.js` `Generation`: `SP_GEN`(짧은 이름, 예 `a`/`b`)이 없으면 아무것도 하지 않는다(로컬·`npm start`는 지금과 같음).
  상태 `standby`(떴지만 새 손님 없음) → `accept` → `drain`(되돌릴 수 없음). 시작 상태 `SP_GEN_START`(기본 accept). 바꾸기는 재시작 예고와 같은 `SIGUSR2` + 파일, 파일에 `accept`·`drain`·`standby`.
  - 쿠키: 페이지(`/`, `*.html`) 응답에 `sp_gen=<이름>`(1일, `SameSite=Lax`, 프록시가 https면 `Secure`). 리버스 프록시가 이 쿠키와 `?gen=`으로 요청을 그 세대로 보낸다(배포 쪽, 이 저장소에 없음).
  - `GET /healthz/accept`: accept면 200, 아니면 503(프록시의 새 손님 헬스체크, 프록시 경유로도 답함 — 예/아니오뿐). `/healthz` 내부 `gen`·`genState`, 프록시 경유 `gen`·`draining`. welcome `gen { id, state }`.
  - drain이 되면: 진행 중인 판이 없는 방(대기실)을 모두 `room.closed {reason:'newVersion'}`으로 닫고(새 서버에 넘겼으면 `moved: true` — 그때 끊겨 있던 사람도 옛 서버에 다시 붙을 때 같은 표시로 받는다, 아래 「대기실 넘기기」), 랜덤 매칭 대기열을 비우고, 모든 소켓에 `server.gen { id, state }`.
    `room.create`·`join`·`spectate`·`queue`·`queueAccept`와 판 시작(`room.start`, 재투표 새 판, 매칭 완성)은 `ERR.NEW_VERSION`(「새 버전이 나왔습니다. 페이지를 새로고침해 주세요」).
  - 끝내기: 15초마다 「이 서버가 필요한 방」을 센다 — 진행 중인 판은 연결된 사람이 있거나 마지막 끊김이 10분 미만(끊긴 시각을 모르면 판 60분 미만),
    드레인 중에 판이 끝난 방은 정산 화면을 위해 연결된 사람이 있는 동안 10분까지. 0이면 SIGTERM과 같은 정상 종료(exit 0 — 배포 쪽은 컨테이너를 정상 종료 때 다시 띄우지 않는 정책으로 둔다).
    150분에 아직 있으면 30분 재시작 예고를 걸고, 0이 되면 끝낸다(최대 180분).
- **대기실 넘기기**(관리자 결정 2026-10-17: 업데이트로 새로고침된 대기실 사람들을 새 버전의 같은 대기실로 다시 모은다): 서버 `SP_GEN_HANDOFF_DIR`(두 슬롯이 같이 쓰는 폴더, 없으면 넘기지 않음 — 1.4.6까지와 같음).
  드레인하는 서버는 닫는 대기실마다, 그리고 드레인 중에 판이 끝나 대기실로 돌아온 방마다 파일 하나(`<세대>-<ms>-<방 코드>.json`, 0600)에 방을 적는다 — 방 코드·모드·난이도·규칙 모드·「AI 팀원 마지막 선택」·방장·좌석(AI 포함)·관전석, 사람마다 재접속 토큰(`Lobby.roomSnapshot`).
  다른 서버는 모르는 토큰으로 hello가 오면 그 폴더에서 그 토큰이 든 파일을 찾아(`HandoffInbox`, 폴더가 바뀌었거나 2초 지났을 때만 다시 읽음) 지우고 방을 다시 세운다(`Lobby.adoptRoom`):
  같은 방 코드(새 서버에 이미 있으면 새 코드), 같은 방장·좌석·AI 좌석, 준비는 풀림, 사람은 모두 끊긴 상태로 **3분** 동안 자리를 지킨다(보통 대기실 끊김은 60초 [ASSUMED] — 휴대폰 백그라운드 탭의 새로고침이 늦음).
  그 hello는 재접속처럼 자리를 이어받고(같은 playerId), 다른 사람들도 새로고침 뒤 자기 토큰으로 돌아온다. 30분 넘은 파일은 읽지 않고 지운다. 드레인 중인 서버는 받지 않는다.
  드레인 중에 판이 끝난 방은 정산 화면 때문에 옛 서버에도 남지만, 정산을 마치고 옮겨 온 사람부터 새 서버의 같은 방으로 모인다.
- 클라이언트 `public/js/ui/generation.js`: welcome의 `gen`을 기억해 웹소켓 재연결(`/ws?gen=`)과 buildGuard의 `/healthz?gen=`에 붙인다(탭마다 자기 세대; 쿠키는 브라우저 전체).
  `server.gen drain`·draining welcome·`room.closed newVersion`·`NEW_VERSION` 오류를 받으면 닫을 수 없는 창 「서버가 새 버전으로 업데이트됩니다」(「곧 페이지가 자동으로 새로고침됩니다」, 대기실을 넘겼으면 「대기실도 그대로 새 버전으로 옮겨집니다」, 못 넘겼으면 「대기실은 새 버전으로 옮기지 못합니다. 새 버전에서 방을 다시 만들어 주세요」, `public/js/ui/updateNotice.js`), 3초 뒤
  쿠키를 지우고 새로고침(→ 새 서버). 닫힌 대기실은 넘겼든 못 넘겼든 그동안 화면에 그대로 두고 토스트를 띄우지 않는다(관리자 결정 2026-10-17: 창과 토스트가 겹쳐 토스트가 창 뒤로 흐려졌다 — 안내는 창 문구로만). 판 화면(정산 포함)이면 창 없이 판이 끝날 때까지 기다리고, 끝나면 같은 창을 띄워 3초 뒤 옮긴다
  (관리자 결정 2026-10-17: 판 내내 남는 띠가 플레이·관전을 가린다 — 옛 서버가 그 판을 끝까지 돌리니 플레이어가 할 일이 없다. 1.4.5까지는 buildGuard의 「서버가 업데이트되었습니다. 이번 시뮬레이션이 끝나면 새로고침합니다」 띠를 판 내내 띄웠다).
  옮기기 전에 BroadcastChannel `sp-gen`으로 다른 탭에 묻고, 같은 세대에서 판 중인 탭이 있으면 쿠키를 그대로 두고 「다른 탭의 시뮬레이션이 끝나면 자동으로 새로고침됩니다」로 10초마다 다시 묻는다.
  새로고침 직전 sessionStorage `sp-gen-moved`에 옛 버전과 방에 있었는지를 남기고, 새로고침된 페이지는 새 서버가 답한 뒤 1.5초에 창 「새 버전으로 업데이트되었습니다」를 띄운다
  (관리자 결정 2026-10-17: 그냥 새로고침만 되면 연결이 끊긴 것으로 보인다): 「서버 업데이트: v옛 → v새」(같은 판이면 「서버가 최신 버전으로 업데이트되었습니다」), 방에 있었으면
  「대기실을 그대로 새 버전으로 옮겼습니다」 또는 「대기실을 옮기지 못했습니다. 방을 다시 만들거나 참가해 주세요」(옮기는 것은 「대기실」, 다시 할 일은 버튼 이름 「방 만들기」·「방 참가」대로 「방」 — 관리자 결정 2026-10-17), 버튼 「업데이트 내용 보기」(로비의 업데이트 기록 창)·「확인」. 판 화면 위에는 띄우지 않고, 5분 넘은 기록은 버린다.
  토스트 「새 버전이 나왔습니다. 새 버전에서 방을 다시 만들어 주세요」는 세대 없는 서버의 페이지에만 남는다. 새 세대에서 옛 세대 방 코드를 넣으면 「방 없음」(관리자 결정 2026-10-14: 옛 쪽 안내로 충분 — 넘긴 방은 같은 코드로 새 세대에 있다).
  (1.4.6까지: 대기실은 닫기만 하고 아래쪽 연결 띠 「새 버전이 나왔습니다 · 곧 페이지가 자동으로 새로고침됩니다」 3초 뒤 새로고침, 새로고침 뒤 안내 없음. 연결 띠는 이제 「다른 탭의 시뮬레이션이 끝나면 자동으로 새로고침됩니다」만.)
- 로비·대기실 화면의 토스트(이 화면들의 모든 토스트)는 화면 위 가운데가 아니라 위쪽 바(`.topbar`, 대기실은 더 높음) 바로 아래에 뜬다(`html.sp-topbar`·`sp-topbar-tall`,
  관리자 제보 2026-10-17: 위쪽 바의 화면 제목을 덮었다). 1280×800·844×390 로비·대기실에서 확인(2026-10-17).
- 확인: `test/local-generation.test.js`(기다릴 방 판단, 150·180분, 실제 서버의 쿠키·`/healthz/accept`·welcome·거부·대기실 닫기·판 유지, 실제 프로세스의 `SIGUSR2` 단어와 exit 0, 페이지의 3초·판 대기·다른 탭 대기;
  대기실 넘기기: 실제 서버 둘이 폴더를 같이 써서 방 코드·방장·AI·규칙·준비 풀림·같은 playerId·파일 0600과 삭제·넘긴 방에서 판 시작, 판이 끝난 방, 30분 넘은 파일, 새로고침 기록과 창 문구).
  2026-10-17 리허설 경로판(Caddy + 슬롯 컨테이너 둘, 폴더 공유)에서 Windows Chrome 두 탭으로 대기실(방장·손님·AI) → 드레인 → 「업데이트됩니다」 창 → 새로고침 뒤 같은 방 코드·좌석·같은 playerId, 쿠키 b, 「업데이트되었습니다」 창·업데이트 내용 보기, 휴대폰 가로(844×390) 두 창 확인.
  판 화면이 판 끝까지 기다리는 것·다른 탭 대기 띠는 브라우저와 실제 프록시로 아직 [실제 판 이상 없음 2026-10-28].

## upstream 0.2.1·0.2.2 이식 — UI (2026-10-09)

upstream v0.2.0 이후 UI 수정(비공개 비교 기록). 첫 묶음 15건은 대부분 upstream 버그 수정을
그대로 받은 것이고, 우리 규칙과 맞물리는 것만 적는다.
- 준비 완료 시 상점 접기(`7c962241` ← `7fb41f4f`, 관리자 결정 2026-10-09: 공식도 준비 완료 때 상점이 접힌다 — 관리자의 공식 화면 스크린샷,
  「준비 완료, 시뮬레이션 대기 중」 띠 + 대기석만): `gameLogic readyShopFold`가 확정된 `m.private.ready`의 한 정비 안 변화만 본다.
  공식 모양 접기 상자(상점 화면 「접기 상자」)는 같은 `collapsed` 상태라 같이 접힌다. 「준비 완료, 시뮬레이션 대기 중」 띠 자체는 아직 없다.
- 공용 `Modal` 포커스 가두기(`b0718c38` ← `e2503c7f`): 맨 위 대화상자 안에서만 Tab이 돌고, 밖으로 나간 포커스는 첫 버튼으로 돌아온다(가이드가 위에 열려 있으면 양보).
  채팅 패널(z-index 6–40)·디버그 패널은 `.modal` 배경(z 80) 아래라 대화상자가 열린 동안 클릭으로 포커스를 못 가져간다 [추정, CSS로만 판단].
- 방향 선택 중 Enter(`8fb22cca` ← `a1bc37ed`): 공식 선택기(`placeArt.js` `PlaceWheelArt`)의 ✕도 `.fwheel__cancel`이라 `facingEnter`가 두 그림 모두에 맞는다.
  선택기가 열리면 루트가 포커스를 가져가고 테두리는 그리지 않는다(`.fwheel:focus-visible`).
- 진단 복사(`57dd2e62` ← `3f884412`, 관리자 결정 2026-10-09): 설정 → 「문제 제보」. 안내 주소와 PLAYING.md §12는 upstream이 아니라 우리 저장소
  `LazyDeltaLima/Myeongto-Replica/issues`(관리자 결정 2026-10-09).
- 선발 선택 창 테스트(`4c41ab62`·`cafff52f`)는 우리 5명(아스카론·왕)과 필터 칩 없는 선택 창(관리자 결정 2026-10-07)에 맞춰 고쳐 넣었다.
- 브라우저 e2e(`SP_E2E=1`)로 들어온 테스트(`mock` `settings-entry` `diy` `facing` `modal` `loadout` `i18n` `ready-fold`) [실제 판 이상 없음 2026-10-28].

### 두 번째 묶음 — 잠재·练度 UI, 통계 페이지 등

upstream UI 12건 + `66297106`의 테스트 조각(관리자 결정 2026-10-09). **upstream 커밋 순서로** 이식했다(뒤 커밋이 앞 커밋 문맥을 전제): `41fd3c7e` →
`c623550f` → `438a6b52` `51e0e60b` → `0ca2a9c2` → `56a7b918` → `7a0937e3` `519f04e2` `dc336f24` `4f8f5d2a` `9f36db32` `4d63e9d5`.
- 맹약 팝업의 선발 행(`70f7ea01` ← `41fd3c7e`, 관리자 결정: 공식도 사기 전부터 맹약 목록에 흐리게): 「自选」 태그는 없다(`upstream.md` 「0.2.0 병합」).
  우리 선발 다섯은 맹약이 하나씩이라 upstream의 「두 맹약에 다 나오는」 경우가 없다 — 테스트를 赤刃明霄陈(炎)·阿斯卡纶(无)로 바꿈.
- Touch·预备干员-医疗 카드(`bfb6d39c` ← `c623550f` UI 부분): 공식 모양 카드 `ChessDetailArt`는 `ChessDetail`의 블록을 그대로 쓰므로
  恳切福音 아래 PRTS 정정 줄도 공식 모양에서 나온다.
- 통계 페이지(`c9dc046b` ← `438a6b52`, `c7e31c1d` ← `51e0e60b`, 관리자 결정): upstream 화면 그대로(공식 모양은 나중). 결산 다시 보기
  (`ResultView` `quiet`)는 정산 효과음과 우리 결과 음성(`playMatchEndVoice`)을 둘 다 내지 않는다. 대기실 윗줄은 「统计」 다음에 우리
  설정 버튼, 로비에서는 오른쪽 끝 닉네임 칩(`me-chip`, 끝에 차트 표시)이 통계 입구(관리자 결정 2026-10-13; 타이틀·대기실 버튼은 그대로). 판 기록의 마지막 칸은 「정산 보기」 버튼(누르는 곳은 지금처럼 행 전체, 행에 올리면 버튼이 채워짐), 다시 볼 수 없는 판은
  흐린 글자로 이유(「정산 없음」 중도 퇴장 · 「요약만」 최신 30판 밖)(관리자 결정 2026-10-13). PLAYING.md는 우리 §12 「反馈问题」가 있어 통계가 **§13**. 서버가 끝낸 판은 기록하지 않는다(「본판 정보 다시 뽑기」도 이 규칙). 게임 중 재시작 투표로 끝난 판은 중도 퇴장으로 기록한다(이 파일 「게임 중 재시작 투표」).
- 상세 카드 공격 범위(`121d801f` ← `0ca2a9c2`, 관리자 결정): 정비 중 「선택한 기물 범위」 효과를 대체한다. 우리도 탭이 카드를 여므로 정비 중
  범위 표시는 그대로. 같은 `SEL_RANGE` 그룹이라 3D 판은 공식 `tileOverlay` 줄무늬. upstream 테스트의 自由的杰西卡(우리에게 없는 선발 kit)
  경우는 실제 전투(能天使, `unitStatsEntry` `dir`) 경우로 바꿈.
- 교편 3택 클라이언트(`6205800d` ← `56a7b918`, 관리자 결정): 개인 선택에는 「轮到你」(`YourTurn`)를 띄우지 않는다 — `normalizePersonalChoice`가
  `turn` = 자신이라 `useTurnFlash`에서 `personal`을 뺐다. 안내 「从候选中选择一项战术特训」은 `is-personal`(upstream `is-mine`은 우리
  phase-art CSS가 숨기고 game-panels.css가 차례 표시로 깜빡임). 공식 개인 선택 화면 캡처는 없다 [추정: 제목·안내 배치는 upstream대로].
- 잠재·练度 UI(`065019ca` `90d6379d` `dd650a42` `24e43a05` `d1f72488` ← `7a0937e3` `519f04e2` `dc336f24` `4f8f5d2a` `9f36db32`): upstream에 없는
  우리 카드 두 곳도 맞춤 — 공식 모양 카드 `ChessDetailArt`(수치 줄을 스스로 계산)가 `cultOpts`를, 배치 중 카드(`dart-placing`)가 `ops`를
  받는다. 한국어: 潜能 = **잠재능력**, 练度 = **육성도**(공식 KR 클라이언트 「练度和潜能均为…」 → 「육성도와 잠재능력은…」), 未精英化 /
  精英阶段n = 비정예화 / n차 정예화. 「特许干员」 = 특별 허가 오퍼레이터 [추정: KR 표기 근거 못 찾음]. 우리 선발 풀에는 프로토타입이 없어
  (2026-10-07) 「原型干员没有潜能与练度」 줄은 우리 데이터로는 나오지 않는다. 선발 카드 수치 = 전투 합성(维什戴尔 潜能1 583 / 25, 潜能6 615 / 23).
- 고른 스킬 테두리(`963f5584` ← `4d63e9d5`, #398): 첫 묶음에서 넘긴 CSS 1줄 — 로컬 클라이언트 그림 `image_skill_select_outline`이 있을 때만 보임.
- 실제 경기 경로: `test/ui/ui2-real-match.test.js`(`54a1f5ac`) — 교편 제안(서버 m.private) → 클라이언트 선택지 → 준비 거부 → `g.choice` →
  준비 완료, 그리고 `m.private.ops`로 만든 카드 = 같은 판의 전투 수치(팀원 정찰 유닛도). 브라우저 e2e(`SP_E2E=1`: `stats` `inspect-range`
  `mock` `playtest2.real` `loadout*` `teammate-loadout`) [실제 판 이상 없음 2026-10-28].

## 통계 기록의 자리 수 (2026-11-18, 관리자 제보)
- 통계 기록 한 판이 담는 플레이어 줄의 상한(`public/js/ui/stats.js MAX_PLAYERS`)은 게임의 가장 큰 방(`shared/constants.js LARGE_SEATS`, 8인 협동)을 그대로 쓴다.
  예전 상한 6(4인 게임 때 값)은 8인 판의 7·8번 자리를 잘랐고, 그 자리가 본인이면 `selfRowOf`가 다른 사람 줄로 넘어가
  판 기록·전략 통계·결산 다시 보기가 남의 전략(제보: 덕로드를 골랐는데 두요야)과 수치를 보였다. 실시간 결산 화면은 결과를 그대로 그려 잘리지 않았다.
- `selfId`가 있는 기록은 그 줄만 본인으로 본다. 예전 상한으로 저장돼 본인 줄이 없는 기록은 본인 줄 없음(전략·수치 집계에서 빠짐, 잘린 줄은 되살릴 수 없음).
- 재발 방지: 원인 제거 — 상한은 `LARGE_SEATS`를 읽음; `test/ui/stats.test.js` 「an 8-player co-op settlement keeps every seat」.

## upstream 0.2.3 이식 — UI (2026-10-11)
- 대화 상자 안 복사(`8a8db0eb`, GitHub #433): 클립보드 API가 없을 때(LAN) 쓰는 textarea 대체 경로가 모달 포커스 가두기 안에서 선택을 잃어
  「복사됨」인데 실제로는 안 되던 것 → textarea를 열린 모달·안내 안에 두고, 포커스와 전체 선택을 확인한 뒤에만 복사, 성공·실패 모두 정리하고 포커스를
  돌려준다. 실패하면 원래의 손 복사 화면. 브라우저 테스트 `test/ui/modal.e2e.test.js`(SP_E2E) [실제 판 이상 없음 2026-10-28].
- 렌더러를 못 불러온 토스트 문구(`708caf7d`): `sim.md` 「upstream 0.2.3 이식」.
- 공개 이슈 #1 「AI가 내 진영 피하기」: 팀원 주력 핵심 맹약에 −6을 주는 지금 규칙(`server/match/bot.js`)으로 충분하다(관리자 결정 2026-11-05).
- AI 팀원 구매 양보(`f3658a0d` 중 `server/match/bot.js`, upstream PR #407, 관리자 결정 2026-10-11): 공식 규칙이 아니라 AI 휴리스틱(`feat`).
  5·6단계 공용 카드(정예·선발 제외)의 맹약이 살아 있는 다른 팀원의 시작 전략(`gd.bandBondIds`, 모드가 끈 맹약 제외)과 겹치면 구매 점수 −18.
  사람·AI 팀원 같게, 여럿이어도 한 번, 재고를 잡아 두지 않고 바로 되는 자기 합성은 그대로. `[ASSUMED]` 점수 크기.
  확인: `test/match/bot-smarter.test.js`(upstream 두 사례). golden `coop2-NORMAL-14-standins`가 움직인다.
  - 시작 전략 예약(upstream `e376f254` + `3f18347f`, upstream #514, 관리자 결정 2026-10-17, `git cherry-pick -x`): 살아 있는 다른 팀원이 고른 전략의 맹약은
    배치 전부터 AI의 전략 선택(`botPickBand`, 같은 맹약 전략은 가중치 0)과 주력 맹약 계획(`bondPlan`, 팀원 주력 맹약처럼 −6)에서 피한다. 그 팀원이 탈락하면
    풀린다. 같은 AI 휴리스틱(`feat`). 확인: `test/match/bot-smarter.test.js`(upstream #514 두 사례).
  - 홀로 선 가드 옮기기(upstream `0a09b5d6`, PR #452, upstream #315, 관리자 결정 2026-10-17, `git cherry-pick -x`): 배치를 다 짠 뒤 적 길 위의 자기 칸 사거리
    가드(`rangeGrid` 1칸)가 아군 화력 엄호 밖이면, 그 가드 칸과 들어오는 지상 경로마다 앞 칸을 함께 치는 아군이 있는 빈 합법 길 칸으로 옮긴다(경로마다 다른
    아군이어도 됨, 노출 점수가 줄지 않을 때만 `[ASSUMED]`). 확인: `test/match/bot.test.js`(upstream 세 사례 — 두 갈래 경로 사례는 우리 전투 엔진이 upstream과
    달라 같은 배치에서도 100초에 방패병 하나가 지나가므로 「세 마리 처치」 대신 계획이 보장하는 엄호를 확인, 바꾸기 전에는 실패). golden `matches` 18개가 움직인다.
  - 막는 메딕·구매 추정·리허설(upstream `ed44ce4d`, upstream #577·#315, upstream PR #606·#607·#608의 생각, 관리자 결정 2026-10-17, 손 이식): (1) 저지하는 메딕은
    길 밖 칸 → 아군 화력이 그 칸과 들어오는 지상 경로마다 앞 칸을 함께 치는 길 칸 → 아무 합법 칸 순(가드 옮기기와 같은 `supportedContact`), 보스 라운드는 넓은
    치료 범위 먼저·같은 점수면 다른 메딕이 아직 안 덮은 아군 DPS. (2) 구매 추정(`lineupScore`)이 실제 빈 손패 칸 수만큼만 빠지는 판 기물을 손패로 셈하고, 살 카드의
    칸을 먼저 잡고, 1e-9 안의 동점은 싼 카드, 배치 상한보다 많이 가졌을 때만 미리 판다. (3) 리허설은 진짜 정비 입력(`Match._normalOpts`: 전투 시작 효과·鸭爵 적
    교체·팀원 메딕·판 시드·전투 중 층 획득)으로, 후보마다 메타 RNG 복제(`rng.clone`)와 떨어진 사본(`server/match/preview.js previewPlayer`·`previewContext`: 읽기만
    복사해 주고 쓰기는 아무것도 안 함, 오류는 판 진단에 안 들어감) — 진짜 판·손패·방향·더티 표시를 건드리지 않는다. 모두 `[ASSUMED]` AI 휴리스틱(`feat`).
    받지 않은 것: upstream 플러그인(스크립트 예산·DSL) 테스트 둘. 우리 엔진에서 같은 승부가 안 나는 upstream 테스트 하나(鸭爵·팀원 메딕 리허설 비교)는 칸을
    9,9 → 11,7로 바꿈. 확인: `test/match/bot.test.js`·`bot-smarter.test.js`·`test/sim/core.test.js`(`rng.clone`)·`test/golden-standins.test.js`(새 golden
    `coop2-NORMAL-1-unowned-roster`: 일반 오퍼레이터를 하나도 안 가진 자리). golden `matches` 16개가 움직인다.
- AI 팀원 표정 반응(`f3658a0d` 중 `server/match/botEmotes.js`, upstream PR #444, 관리자 결정 2026-10-11): 공식에 없는 기능(`feat`), 서버만.
  사람과 AI가 섞인 판에서만, 기존 `m.emote`(공식 36개 화이트리스트·1초 쿨다운) 그대로. 기본 켜짐, `SP_BOT_EMOTES=0`이면 모든 진입점이 꺼진다.
  사람의 표정에 쿨다운이 아닌 AI 하나만 답함(고마워·미안해 → 没问题, 合作愉快 → 고마워 등 upstream 표), 현상 수배 카드를 고르면 思考,
  연합 방어 도우미가 되면 合作愉快, 결산 때 라운드마다 한 번(이번 라운드 격파 1위 → 欢呼, 누수 → 害怕, 무손실 → 酷, 보상 → 고마워),
  한 라운드 세 번째 합성 때 害怕 한 번, 진짜 플레이어의 선물(CHAR_GIFT)을 받으면 그 플레이어에게 고마워. 난수·타이머·게임 결정에 손대지 않는다.
  우리 쪽 차이: (1) 사람이 **유저 그림 탭**(`shared/emote-art.js`)으로 보낸 표정에도 그 id대로 답한다(관리자 결정 2026-10-11 — 처음 이식은 답하지 않게 했음).
  AI의 답은 늘 공식 그림. (2) upstream은 연합 방어 시작 반응을 서버 전투 경로(`startUnite`)에만 달아 기본값 `SP_COMBAT=client`에서는
  안 나왔다 — 클라이언트 전투 경로(`_startUniteClient`)에도 단다. `[ASSUMED]` 반응 고르기는 사회적 휴리스틱.
  확인: `test/match/bot-emotes.test.js`(upstream 사례 + 유저 그림에도 답하는 사례) [실제 판 이상 없음 2026-10-28].
- 닫은 창의 판 복구(「恢复本机对局」, `f3658a0d` + 경쟁 조건 수정 `ba5b998a`, upstream GitHub #431, 관리자 결정 2026-10-11): 공식에 없는 기능(`feat`).
  같은 브라우저에서 판을 하던 창을 닫아 버렸을 때, 다른 창의 타이틀 아래쪽(저작권 줄 왼쪽)이나 로비 머리(「설정」 왼쪽)의 「이 기기의 판 복구」 →
  저장된 자리(닉네임 · 동맹 코드)를 골라 그 창에서 다시 접속한다. 복구할 것이 없으면 버튼이 없다. `public/js/net.js`·`ui/resumeMatch.js`는 upstream 그대로.
  - 신원: 서버가 준 토큰(`sp.tokens` 최근 4개)만, 닉네임·IP로는 찾지 않는다. 아직 살아 있는 창(새로고침·초기화 중 포함)의 자리는 빼앗지 않는다
    (BroadcastChannel로 묻고, 서버 쪽은 `hello.noReplace`/`claimAt` → `SESSION_IN_USE`). BroadcastChannel이 없는 브라우저는 복구하지 않는다.
  - 우리 재접속 규칙과의 관계: 서버 재접속 창(협동 10분, 솔로 판 24시간 `singleReconnectTime`)은 그대로이고, 복구는 그 창 안에서 같은 토큰으로
    다시 들어가는 것뿐이다. 우리는 나가기 창에 「暂离」가 없어 나가면 자리를 포기하므로(README 기능 목록), 이 창이 방을 떠나면
    (「放弃模拟」·「离开同盟」·자리에서 빠짐) 복구 목록에서 지운다(`main.js` 스토어 구독 — upstream은 로비 복귀·새 세션 때만 지워, 포기한 자리가 목록에 남았다).
  - 버튼 자리: 공식 위수협약 UI 작업(아래 「공식 위수협약 UI」)은 판 안 화면이라 겹치지 않는다. upstream이 같이 넣은 설치 버튼(PWA)은 넣지 않는다(「iPhone 전체 화면 안내」의 결정: 홈 화면 안내만).
  - 확인: `test/client-static.test.js` 「explicit local match recovery」(살아 있는 창 보호·닫힌 창 복구·동시 복구·새로고침 중·welcome 전 저장 안 함),
    `test/client-identity-handshake.test.js`(실제 클라·서버 hello 처리, 늦게 온 welcome). upstream 브라우저 테스트(`followup-023.e2e`)는 가져오지 않았다 [실제 판 이상 없음 2026-10-28].
  - **다른 창이 쥔 자리 가져오기** (관리자 결정 2026-10-25, 제보 「휴대폰에서 튕긴 뒤 재접속이 안 된다」): 같은 브라우저의 다른 창이 아직 자리를 쥐고 있으면
    새 창은 지금까지 말없이 새 플레이어가 됐다(서버 기록: 자리는 「연결됨」인데 새 창은 `token not known, new session`). 이제는
    ① 창 사이 선택에서 가장 최근 자리를 잃었거나 ② `SESSION_IN_USE` 거절이 재시도(2·4·8초) 뒤에도 남으면, 복구 창이 그 자리로 저절로 열려
    「이 시뮬레이션은 이 브라우저의 다른 창에서 진행 중…」과 「이 페이지에서 계속」을 보인다. 누르면 `hello.takeover`로 자리를 가져오고 다른 창은
    4001(「다른 페이지에서 같은 계정으로 접속해…」)로 끊기며, 그 창은 welcome 시각을 버려 새로고침해도 자리를 되찾지 않는다(그 창의 「이 페이지에서 계속」을
    누르면 되찾는다). 누르지 않으면 아무것도 빼앗지 않는다.
  - **잠든 소켓**: 서버는 거절할 때 쥔 소켓에 ping을 보내고, 1.5초 넘게 지난 다음 hello 때까지 답이 없으면 그 소켓을 죽은 것으로 보고 새 창에 넘긴다
    (잠든 휴대폰은 소켓이 열린 채 아무 답도 안 한다 — 10-24 사례는 거절 0.2초 뒤에 옛 소켓이 끊겼다). 서버 로그 `took the session over` /
    `replaced a socket that did not answer a probe`.
  - 확인: `test/connection-log.test.js`(실서버: takeover, 답 없는 소켓은 교체·답하는 소켓은 계속 거절), `test/client-identity-handshake.test.js`
    (재시도 세 번 뒤에만 오류, 새 창의 가져오기·옛 창 새로고침이 되찾지 않음) [실제 판 이상 없음 2026-10-28].

## 누수 때 위 HP 숫자 (2026-10-11, upstream #479, 관리자 결정 「위 방향대로 고쳐」)
- 전에는 적이 파란 문에 들어가면 위 HP 숫자가 바로 `lp − 대기 손실`(빨간 글자)로 내려가고 옆에 「−N」이 붙었다(user playtest #3 item 2).
  공식 클라는 숫자를 깎지 않는다 → 숫자는 정산된 LP 그대로, 「−N」만 늘어나고, 정산된 `m.private`가 오면 새 LP(`ui/hud.js liveLp` `shown` = lp,
  `LpTower`는 `value`를 그대로, 빨간 숫자 CSS 삭제). 팀 칸(`teamPanel.js`)도 같은 `LpTower`라 같이 바뀐다.
- 근거(EN 공식 클라, 관리자 노트 「#479」 + 이번 확인):
  `AutoChessHUDStageInfoModel.UpdateData`는 큰 숫자에 `ScenePlayerData.hp`(보스전은 `bossRoundModel.playerTotalHp`)를,
  「−x」에 `AutoChessBattleStatusDataModel.lostHpDisplay`(= 지금 라운드 상태의 값)를 넣고, 보스전이 아니면 `actData`의 한 값
  (라운드 상한으로 봄 [추정])으로 자른다. `_RenderStatus`에 `hp − lost` 계산이 없다. `_loseHpGrp`는 `lostHpDisplay > 0`일 때만 보인다.
- 보스전(최종 공세·은밀한 핵심): 큰 숫자는 그 보스 단계를 처음 본 때의 합산 LP로 고정, 「−N」 = 그 뒤로 줄어든 팀 LP(누수·초과 시간 감소 모두,
  상한 없음 — 클라 `BossBattleRoundStatus.lostHpDisplay` = `playerTotalHp − battleTeamHp`, 보스전은 상한 분기를 건너뜀). `ui/hud.js bossLp`.
  전투 중 재접속하면 그때 본 값부터 [ASSUMED]. 툴팁 「全队目标生命值 {lp}：本场战斗已损失 {pending} 点，战斗结束后扣除」.
- **공식과 다르게 남긴 것(관리자 결정 2026-10-11, 「공식대로」 삭제를 되돌림)**: 자기 전투(일반 라운드 COMBAT) 중 「−N」. 클라 `SelfBattleRoundStatus.lostHpDisplay`는
  늘 0이라 공식은 자기 전투 동안 「−x」를 아예 띄우지 않고, 联防(`HelpBattleRoundStatus.lostHpDisplay` =
  `selfEnemyEscapedCntInHelpBattleState`, 상한 적용)과 보스전에서만 띄운다. 우리 「−N」은 user playtest #3 item 2 요청이라 그대로 둠(한때 공식대로 지웠다가 관리자 요청으로 복원).
- 확인: `test/ui/playtest3.test.js`(liveLp·LpTower·bossLp), `test/ui/playtest6-unite.test.js` [화면 미확인].
- **팀 칸의 ×N·−N 자리(관리자 결정 2026-10-16, 시안 비교 후 「안 1」)**: 공식 플레이어 칸(`AutoChessBattlePlayerStatusItemView`)의 HP 묶음은
  아이콘·숫자뿐이고(×N 주황 알약 `tag_miss`는 단계 알약에만, −x 판 `_loseHpGrp`는 위쪽 LP에만), 팀 칸의 ×N·−N은 우리 추가(user playtest #3 item 2,
  #6 item 7)다. 예전엔 ×N이 초상 옆 글 줄에 남아 초상과 떨어진 오른쪽 위에 떴고, −N은 HP 알약 바깥에 CSS 빨간 판으로 떠 있었다. 지금:
  ×N(`MissTag`)은 초상 버튼 안에서 **초상 윗변 가운데에 걸침**(공식 모양 64×20 = `bg_miss_enemy` 77×24 축소, 아래 HP 알약과 위아래 짝);
  −N은 **공식 `bg_lose_hp` 판**(웹 소재 `hudPanel/bg_lose_hp`, `--ha-lose-hp`)으로 HP 알약 오른쪽 끝에 틈 없이 붙고(42×24) 둘을 합친 묶음이 초상
  아래 가운데; 위쪽 LP의 −N도 같은 판. **같은 숫자면 −N을 뺌**(`teamPanel.js samePlate`: 联防에서 남은 적 ≤ 라운드 상한이면 ×N = −N) — 숫자는 툴팁에 남음;
  ×13 / −10처럼 다르면 둘 다. 잃을 LP가 있는 동안(전투·联防) HP 아이콘·숫자를 공식 **「줄어드는 중」 색 #ec4645**로, 평소 아이콘은 공식 #3bd8b5로
  (EN 클라 `[uc]autochessbattle.ab` 프리팹 값: `_colorHpIconNormal` #3bd8b5, `_colorHpIconTweening`·`_colorHpTextTweening` #ec4645, `_colorHpTextNormal`
  #f3f3f3, `_hpTweenDuration` 0.8초 — 공식은 정산 때 숫자가 줄어드는 동안만 이 색, 우리는 대기 손실 동안 [추정: 같은 뜻으로 씀]); 아이콘은 `LpTower tint`의
  `icon_hp` 마스크. 내 칸에서는 ×N 알약이 내 표시(`icon_self`)의 오른쪽 아래를 조금 덮는다(시안에서 확인, 그대로 둠).
  확인: `test/ui/playtest6-unite.test.js` 「the ×N tag on the portrait…」, 개발 목업 `?phase=UNITE&variant=leaker` Windows Chrome 데스크톱·휴대폰
  (같은 숫자 = −N 없음, ×13 / −10 = 판 붙음, 위쪽 판 `bg_lose_hp`).

## upstream 0.2.4 이식 — UI (2026-10-11)
- **장치 탭 설명** (upstream `df540b62`, GitHub #228·PR #229 by @rickylxw, + `6bfc0827` §29.14 「같은 전투 재입장 때 장치 카드」, 관리자 결정 2026-10-11):
  阻隔工事·“双眼皮”·射击台·源石流发生装置를 누르면 그때의 지형 카드(#184, 지금은 토스트 — 아래 「보드에서 연 카드가 벤치를 가림」)와 같은 자리에 장치 카드(`gameLogic/terrain.js deviceInfo`·`deviceTipAt`,
  `detailPanel.js DeviceDetail`). 정비·정찰 판은 관 데이터의 장치 위치로, 전투 중에는 상자·포탑이 장치 **유닛**이라 그 유닛이 선 칸으로 찾고(관 밖 포탑은
  다른 칸에 섬), 카드에 실시간 HP, 부서지면 카드가 닫힌다. 같은 전장의 메타가 다시 와도(관전 `g.watch`·`reshow`) 이미 받은 장치 유닛을 렌더러와 카드
  양쪽에 되돌린다(`deviceUnitsForEntry` — 안 그러면 다음 HP 묶음이 모르는 적이 되어 탭을 가로챔). 숨은 포탑(机械援助·机变 전)·机变으로 치운 상자는 안 그려지므로 말하지 않는다.
  - 공식 근거: EN 클라 `btl_pfb_tokens_4.ab`·`_0.ab`의 이 넷 프리팹은 `Character._disableClickCharacterInfo`·`_disableCharInfoPanel`이 0(盟约寒风
    `trap_1112_acblzd`은 `_disableClickCharacterInfo` 1) — 공식 전투에서 누르면 유닛과 같은 정보 패널(`UICharacterInfoPanel`: 이름·HP·공격/방어/
    마법 저항/저지·공격 범위·스킬 탭)이 열린다. 그래서 우리 카드는 upstream 글 위에 **장치 자신의 공식 스킬 글**(관 데이터 `devices[].skill`, 한국어는 데이터
    오버레이의 공식 KR 문구)과 포탑의 **공격 범위**(관 데이터 `rangeGrid`)를 더했다. 모양은 처음엔 우리 적·소환물 카드와 같은 일반 카드였고, 2026-10-14부터
    공식 모양 HUD에서는 오퍼레이터 카드와 같은 공식 모양(아래 「보드에서 연 카드가 벤치를 가림」). `[ASSUMED]` 공식 패널의 실제 배치·정비 단계에서 누를 수 있는지(공식 정비 화면 캡처 없음), upstream의 「装置机制」 설명 글(우리 sim 수치)은 upstream 것.
  - 문구: `en.json`·`ko/ui.json` 16개(ja·zh-TW 팩은 이번에 안 넣음 — 영어로 떨어짐). 한국어 「스테이지 장치」·「장치 효과」(지형 카드의 「지형 효과」에 맞춤).
  - 확인: `test/ui/device-tip.test.js`(upstream v0.2.4 판, 언어는 zh/en/ko + 공식 스킬 글·범위 사례), `test/ui/device-tip.e2e.test.js`(SP_E2E, upstream 그대로 + 공식 글 한 줄),
    dev mock `?variant=devices&stage=act1autochess_m01`·`__MOCK__.hurtDevice(i, dmg)` [실제 판 이상 없음 2026-10-28].
- **간이 보기 재시도** (`6bfc0827`의 `ui/fieldHost.js` + 같은 커밋의 `screens/game.js` 새 view 다시 들어가기): `render.md` 「모바일 3D 보드 복구」.

## 본판 정보 다시 뽑기 (2026-10-09, 관리자 결정)
- 공식에 없는 기능(`feat`). 싱글에서 결석 맹약·리더 적을 보고 나갔다가 새로 시작하는 일이 많아서 넣었다(관리자 2026-10-09).
  2026-10-15부터 **캐주얼 규칙 모드에서만** 있다(이 파일 「규칙 모드 — 클래식·캐주얼」): 클래식 브리핑에는 버튼이 없고 서버가 `BAD_TARGET`으로 거부한다.
  INFO_CHECK(「确认本局信息」, `screens/briefing.js`) 아래쪽, 준비 완료 버튼 왼쪽에 「다시 뽑기」(`重新抽取`, `g.infoReroll`).
- 투표 규칙(`server/match/match/phases.js maybeEndInfo`, 관리자 결정 2026-10-09, 2026-10-13에 바꿈):
  - 준비 완료와 다시 뽑기는 **따로 센다**(관리자 결정 2026-10-13). 한 자리가 둘 다 누를 수 있다(다시 뽑기를 누른 뒤 준비 완료, 준비 완료 뒤 다시 뽑기 모두 됨).
    준비 완료는 바꿀 수 없다. 다시 뽑기는 투표가 끝나기 전까지 취소할 수 있다(관리자 결정 2026-10-12, `g.infoReroll { cancel: true }`): 버튼이 「다시 뽑기 취소」로 바뀐다.
    준비 완료한 자리도 다시 뽑기를 취소할 수 있고, 준비 완료는 그대로 남는다.
  - AI 팀원·나간 자리·AI 대행(`autoplay`) 중인 자리는 투표하지 않는다(AI는 들어오자마자 준비 완료라 넣으면 만장일치가 안 된다). 관전석은 자리가 아니다.
  - **다시 뽑기는 만장일치일 때만**: 투표하는 자리가 모두 다시 뽑기를 누르면 그 순간 다시 뽑는다(준비 완료 여부와 상관없이). **모두 준비 완료하면** 전략 선택으로,
    협동 45초가 끝나도 전략 선택으로(그때까지 만장일치가 아니었으므로). 사람이 혼자면(싱글, AI 팀원만 있는 협동 방) 누르는 즉시 결정된다.
    예전: 둘 중 하나만 누르고, 모두 투표하면 다시 뽑기가 많을 때 다시 뽑음(2026-10-09), 같으면 전략 선택(2026-10-12, 그 전엔 대기실로).
  - 협동 브리핑 시간 45초(`common.js INFO_CHECK_SECONDS`, 관리자 결정 2026-10-12: 25초는 확인하고 팀원과 다시 뽑기를 상의하기에 짧다). 공식 단계는 25초
    (`autoChessData.enterStepList`, `config.timers.infoCheck`)라 리메이크 값이다. 다시 뽑아 새 판이 되면 45초부터 다시. 헤더 게이지 길이는 `m.public.infoSeconds`.
  - 처음 다시 뽑기를 누른 사람 표시(관리자 결정 2026-10-12): 협동이면 발 아래 줄 바로 위에 「{이름} 님이 다시 뽑기를 제안했습니다」와 「다시 뽑기 n/N: 모두 동의하면 다시 뽑습니다」
    (N = 투표하는 자리). 발 아래 줄 안에 절대 위치로 두어 화면 아래쪽 위에 겹쳐 뜬다 — 예전엔 본문과 발 아래 줄 사이의 줄이라 아래쪽이 늘어나 보였다(관리자 제보 2026-10-13).
    발 아래 줄의 준비 완료 x/N(전체 자리)과 별도로 「다시 뽑기 n/N」. 사람 아이콘은 준비 완료면 초록, 다시 뽑기만이면 금색, 둘 다면 초록에 다시 뽑기 아이콘.
    `m.public.rerollBy` = 아직 다시 뽑기에 투표 중인 자리 중 가장 먼저 누른 자리(`phases.js rerollProposer`, 투표 순서 `infoRerollers`).
    그 사람이 취소하면 다음 사람으로 넘어가고, 아무도 없으면 사라진다.
  - 무엇을 다시 뽑나: **새 시드로 판 전체** — 리더 적·숨은 리더·전장·특훈 적·결석 맹약·공유 풀·선발 재고. 표준 난이도는 전장이 하나라(「战场固定」) 전장은 그대로다.
  - 횟수 제한 없음. 브리핑이 시작되고 1초 동안은 `RATE`(`INFO_REROLL_MIN_MS`, 버튼을 계속 눌러 판을 연달아 만들지 않게). 클라이언트 버튼도 1.1초 뒤에 켜진다.
- 서버 경로: 판은 `m.result` 없이 끝나고(`_endInfo`, 마지막 m.public에 `infoOutcome` `reroll`) `onEnd({ reason })`.
  `server/lobby.js onMatchEnd`: 다시 뽑기면 같은 방에서 `startMatch`를 바로 다시 부른다(새 시드, matchNo + 1, `room.start`의 준비 확인 없이 — 투표가 합의).
  남은 일 정리는 보통 판 끝과 같다(나간 자리 비우기 등). `lastSummary`·리플레이를 남기지 않아 `[stats]` 줄도 없다.
  채팅 맹약은 두 경우 모두 지운다(사람들이 결석 맹약을 보고 맹약을 고르므로). 재시작 예고 마지막 5분(`startRefusal`)이면 새 판을 못 만들어 대기실로 돌아간다.
- `room.state.matchNo`(새 필드): 다시 뽑기는 `inMatch`가 true인 채로 판을 바꾸므로, 클라이언트 `main.js onRoomState`가 matchNo가 바뀌면 경기 상태를 비운다(협동이면 토스트 「시뮬레이션 정보를 다시 뽑았습니다」).
  시작 실패(재시작 예고)로 `inMatch`가 false가 되면 「시뮬레이션 종료」 창 없이 바로 대기실로 가고 경고 토스트를 띄운다(동률 → 대기실은 2026-10-12에 없앰).
- 화면: 다시 뽑기를 누른 사람의 칸 아이콘은 금색 새로고침 아이콘, 협동이면 「다시 뽑기 N」 수를 준비 완료 수 옆에 표시한다.
- 확인: `test/match/info-reroll.test.js`(투표 규칙·서로 배타·취소·`rerollBy`·45초·동률 → 전략 선택·AI 제외·나간 자리), `test/lobby-info-reroll.test.js`(실제 서버·실제 Match:
  새 시드·matchNo 2·리플레이/[stats] 없음, 협동 동률 → 같은 판 전략 선택), `test/match/draft.test.js`(45초). 화면: 로컬 Windows Chrome 협동 2인으로 45초·제안 배너·
  취소 버튼·동률 → 전략 선택 확인(2026-10-13).

## 게임 중 재시작 투표 (2026-10-31, 관리자 결정)
- 대기실 복귀 선택지(관리자 결정 2026-11-18, PR #20): 같은 나가기 창에서 「대기실로 돌아가기」(혼자) / 「대기실 복귀 투표」(여럿)를 고른다.
  `g.restart`의 선택 필드 `target: room | restart`로 목적지를 정하며 생략하면 기존 재시작이다. 열린 투표의 목적지는 바꿀 수 없고,
  두 목적지는 한 번에 하나의 투표와 같은 무산 후 대기 시간을 공유한다. 배너와 무산 알림에도 대기실 복귀임을 표시한다.
  `restartVote.target`, 통과 뒤 `restartTarget`으로 목적지를 전달한다. `room`이면 새 판을 시작하지 않고 방·초대 코드·설정·자리·관전석을 유지하며
  준비를 해제한다. 자리 예약도 일반 종료처럼 처리한다. 정산·리플레이 없이 중도 종료로 기록하며, 복귀 성공 토스트를 띄운다.
  PC는 버튼 네 개를 한 줄에 놓고, 터치 환경은 설명 글자 13px 이상·버튼 높이 44px 이상으로 표시한다.
  단추는 설명 문단 순서대로 [취소] 「대기실 복귀」 → 「재시작」 → 「시뮬레이션 포기」(혼자일 때도 같은 순서, 관리자 결정 2026-11-18 — 설명 문구와 그 순서는 PR대로,
  단추만 옮김, 색 라벨 없음) [화면 미확인]. 영어 `RATE` 토스트는 두 목적지에 맞게 「You can propose again in a moment」.
  재발 방지: `test/ui/uiFixes.test.js`(나가기 창 단추·설명 순서), `test/ui/restart-vote.e2e.test.js`(실제 단추 순서).
  검증: `test/lobby-restart-vote.test.js`(실제 서버: 전원 동의 전까지 유지, 목적지 고정, 준비 해제, 방 보존, 수동 재시작),
  `test/ui/restart-vote.e2e.test.js`(PC·휴대폰 가로 화면의 실제 선택지와 투표 배너).
- 공식에 없는 기능(`feat`). 나가지 않고 판을 처음부터(브리핑, 새 시드로 새 풀) 다시 시작한다. **규칙 모드와 상관없이** 있다(편의 기능, 관리자 결정 2026-10-31) —
  브리핑의 「다시 뽑기」는 그대로 캐주얼 전용(관리자 결정 2026-10-31).
- 언제: **1라운드부터**(`BATTLE_CHECK` 이후, 결과 화면 전까지 — 휴식 기간·전투·연합 방어·최종 공세 모두). 브리핑에는 「다시 뽑기」가 있고,
  **전략 선택에서는 열지 않는다**(관리자 결정 2026-10-31: 화면마다 수단 하나, 차례를 시간 안에 고르는 화면을 가리지 않게). 서버가 그 밖의 단계는 `WRONG_PHASE`.
- 여는 곳: 왼쪽 위 나가기 버튼의 「시뮬레이션 나가기」 창(`ui/matchChrome.js ExitModal`). 사람이 혼자면(싱글, AI 팀원만) 「재시작」(`重新开始`) — 누르면 바로 끝나고 새 판,
  협동이면 「재시작 투표」(`发起重新开始投票`). 설명 문단은 금색으로 「재시작」/「재시작 투표」. 투표가 열려 있으면 버튼이 꺼진다. 관전석에는 없다.
- 투표 규칙(`server/match/match/restart.js`, `g.restart { op: propose | yes | no | cancel }`):
  - 투표하는 자리 = 방에 남은 사람 중 AI 대행(`autoplay`)이 아닌 자리, **탈락한 사람도 포함**(관리자 결정 2026-10-31: 방 전체가 다시 시작하므로). AI 팀원·나간 자리·관전석은 없다.
  - 제안한 사람은 동의한 것으로 센다. **모두 동의**하면 그 순간 끝난다. **반대 한 표**면 바로 무산, **30초**(`RESTART_VOTE_MS`)가 지나도 무산,
    제안자가 취소하거나 나가거나 AI 대행으로 바뀌어도 무산. 다른 자리가 나가거나 AI 대행이 되면 다시 센다(남은 사람이 모두 동의했으면 통과).
  - 무산되면 제안자는 **60초**(`RESTART_RETRY_MS`) 동안 다시 제안할 수 없다(`RATE`, 토스트 「잠시 후 다시 제안할 수 있습니다」). 다른 자리는 바로 제안할 수 있다. 투표는 한 번에 하나.
  - 게임은 멈추지 않는다(투표 중에도 휴식 기간·전투 시계가 그대로 간다).
- 화면(`ui/restartVote.js`, 시안을 거쳐 관리자 결정 2026-10-31): 맹약 줄 아래 가운데에 **한 줄 배너** — 금색 새로고침 아이콘, 「{이름} 님이 재시작을 제안했습니다」
  (제안자는 「재시작을 제안했습니다」), 「모두 동의하면 처음부터 다시 시작」(휴대폰 가로에서는 생략), 투표하는 자리마다 사람 아이콘, n/N, 남은 초, 아래쪽 금색 진행 막대.
  사람 아이콘은 공식 본판 정보 화면의 `ui/outer` `img_player_bg`(아직)·`img_player_confirmed`(동의) 모양을 마스크로 써서 배너의 금색으로 칠한다(체크 표시 대신, 관리자 요청 2026-10-31).
  아직 답하지 않은 투표자에게 [반대] [동의], 제안자에게 [투표 취소], 답한 사람에게는 버튼 없음.
- 결과: 무산은 서버 토스트(`m.toast`) — 「{이름} 님이 재시작에 반대했습니다」 / 「{이름} 님이 재시작 제안을 취소했습니다」 / 「재시작 투표가 성립되지 않았습니다」.
  통과하면 마지막 `m.public`에 `restarted`, `onEnd({ reason: 'restart' })` → `server/lobby.js onMatchEnd`가 「다시 뽑기」와 같은 길로 새 판을 바로 시작한다
  (새 시드, matchNo + 1, `m.result`·리플레이·`[stats]` 줄 없음, 재시작 예고 마지막 5분이면 대기실로). 8인 방에서 판 중에 사람이 나가 박사가 5명 아래로
  남았으면 투표는 통과해도 새 판 대신 대기실로 돌아가고(`Room.seatsOpen`, 관리자 결정 2026-11-02 — 시작 조건과 같게) 토스트 「8인 연합은 박사 5명 이상이어야
  시작할 수 있어 대기실로 돌아왔습니다」; 브리핑 「다시 뽑기」도 같다. 거기서 사람을 더 모으거나 4인으로 바꿔 시작한다. 클라이언트 `main.js onRoomState`는 판을 비우기 전에
  **중도 종료로 기록**하고(`ui/stats.js recordQuit`, 관리자 결정 2026-10-31; 라운드를 하나 넘겼으면 통계에 들어간다) 협동이면 토스트 「모두 동의했습니다. 처음부터 다시 시작합니다」.
- `m.public.restartVote` = `{ by, yes, deadline, ms }`(열린 투표), `m.public.restarted`(통과).
- 확인: `test/match/restart-vote.test.js`(단계 제한·싱글 즉시·만장일치·AI 제외·클래식·반대·취소·60초·30초·탈락자 포함·AI 대행·제안자 이탈),
  `test/lobby-restart-vote.test.js`(실제 서버: 새 시드·matchNo 2·브리핑·리플레이/[stats] 없음). 화면: 단독 실제 판(1라운드 재시작 → 새 브리핑, 중도 종료 기록 1건)과
  목업 하네스의 배너·나가기 창(데스크톱·휴대폰 가로)은 Windows Chrome으로 확인(2026-11-02). 8인 판의 투표자 8명 배너(사람 아이콘 8개 — 투표자·제안자·7/8, 1920·1280·휴대폰 가로 844×390)도 목업에
  사람 8명을 넣어 확인(2026-11-02): 한 줄에 들어가고 잘림·겹침 없음, 1920에서 4명보다 48px 넓을 뿐. 사람 둘 이상 협동 판의 투표·토스트 [화면 미확인].

## 결산 화면 피드백 보내기 (2026-10-09, 관리자 결정)
- 공식에 없는 기능(`feat`). 관리자 요청 2026-10-09: 「게임이 종료된 후 결산화면에 버그 제보나 기능 제안 등 피드백을 할 수 있게」.
  설정 → 「문제 제보」(upstream PR #321 이식, 위 「upstream 0.2.1·0.2.2 이식 — UI」)는 클립보드 복사만 하고, 판이 끝나면 전투 실행기가 전투를 지워(`runner.js clear()`)
  결산 화면에서는 전투를 붙일 수 없었다.
- 관리자 결정(2026-10-09): **1단계 = 서버에 보관하고 운영자가 가져간다**. 보관 90일, IP는 저장하지 않고 키 해시만.
  **2단계(같은 날, 관리자 결정: 모든 제보 자동 등록, 창의 안내 문구도 공개에 맞게)**: 공개 저장소 `LazyDeltaLima/Myeongto-Replica`의 issue로
  모든 제보를 자동 등록한다(운영자가 고르는 반자동 아님). 아래 「GitHub issue 자동 등록」.
- 화면(`public/js/ui/feedback.js`, `screens/result.js`): 실시간 결산 화면의 「返回同盟」 옆 「피드백 보내기」(통계 페이지에서 다시 보는 결산에는 없음).
  서버가 `welcome.feedback`을 줄 때만 보인다(`SP_FEEDBACK_DIR`가 없는 로컬 서버는 버튼 없음). 창: 종류(버그·제안·기타), 내용(2000자),
  「진단 정보 첨부」(기본 켬, `diag.js diagnosticsText`), 「이번 판 전투 데이터 첨부(N전)」(버그일 때 기본 켬), 보관·가림 안내.
  보내면 접수 번호(8자)를 보여 준다. 실패하면 이유(너무 자주·1시간 지남·연결 끊김)와 「내용 복사」.
  안내 문구는 서버가 저장소를 알려 줄 때(welcome `feedbackIssues`) 공개 안내(호박색): 내용과 진단 정보가 공개 GitHub 저장소의 issue로 자동 등록되어
  누구나 볼 수 있으니 개인 정보를 쓰지 말 것, 이름·동맹 코드는 바뀜, 전투 데이터는 공개하지 않고 서버에만 90일, IP는 구분 코드만.
  그렇지 않으면 1단계 문구(「서버에 저장되어 개발자만 보고 90일 뒤 삭제」). 공개 안내일 때 접수 화면에 「몇 분 뒤 GitHub에 공개로 등록」 +
  「GitHub에서 보기」(그 저장소 issue 검색 `is:issue <접수 번호>`).
  버튼은 「返回同盟」과 같은 크기로 그 아래에 쌓는다(관리자 제보 2026-10-09; 나란히는 5.6rem 칸에 안 들어감 — 1600×900에서 226 px 중 247 px 필요).
  높이 500 px 이하(휴대폰 가로 844×390)에서는 왼쪽 칸 간격을 줄여 두 번째 버튼이 화면 안에 들어오게 한다. 창은 결산 바닥줄 안에서 그려지므로
  `result.css`의 버튼 최소 폭은 바닥줄 바로 아래 버튼에만(`.result__foot > .btn`) — 전에는 창의 취소·전송까지 3.4rem이 되어 창 밖으로 나갔다(관리자 제보 2026-10-09).
- 전투 데이터(`diag.js rememberBattle`·`matchBattles`): 전투 실행기가 받은 자기 전투(관전 `watch` 제외)의 b.start를 판 끝까지 보관하고, battleId 앞부분
  (`<seed36>[-<matchNo36>]`)이 바뀌면(다음 판) 비운다. 오류 기록에 그때 화면의 battleId를 붙여 전투마다 오류 수(`errors`)를 센다.
  이름·방 코드는 설정의 진단 복사와 같은 방식(값이 정확히 같을 때만)으로 바꾼다. 브라우저 `CompressionStream` gzip + base64로 보내고,
  소켓 수신 한도 64 KB 안(`FEEDBACK_BATTLES_MAX` 38000자)에 안 들어가면 오류 없는 오래된 전투부터 뺀다.
  측정(2026-10-09, 실제 매치 경로 1인+봇 3, 25전): 일반 전투 3–9 KB(gzip 약 1.2 KB), 연합 방어 8–18 KB(약 2 KB), 한 판 약 250 KB(합계 gzip 약 35 KB).
  「오류가 난 전투만」은 따로 고르지 않는다: 규칙이 틀린 버그는 오류 기록이 없어서 빠지기 때문.
- 서버(`server/local-feedback.js`, `fb.send`는 `shared/local.js`): 판이 끝난 사람 자리·관전석(`onMatchEnd`)만 1시간 안에 보낼 수 있다.
  한 판 3건, 주소당 하루 10건, 전체 하루 200건(메모리, 재시작하면 초기화). `SP_FEEDBACK_DIR/inbox/FB-<UTC 날짜>-<id>.json` 하나에
  종류·내용(제어 문자 제거, 줄바꿈 유지)·진단·전투(풀어서, 4 MB 넘으면 버림)·버전·빌드·이 판의 `[stats]` 기록(이름 뺌, 방 코드·판 번호로 로그와 이어짐)·
  `sender`(주소의 HMAC-SHA256 앞 16자, 키는 `SP_FEEDBACK_DIR/.key`)를 쓴다. 90일 지난 파일은 시작할 때와 6시간마다 지운다.
- 확인: `test/local-feedback.test.js`(검증·꺼짐·저장 내용·주소 해시·제한·정리·전투 묶기·실제 서버에서 판 끝난 뒤 전송). [실제 판 이상 없음 2026-10-28]
- **GitHub issue 자동 등록**(2단계, `server/feedback-relay.js`, `node server/feedback-relay.js`): 게임 서버와 따로 도는 프로세스. 게임 서버는 네트워크
  밖으로 나가지 않고 보관함에 쓰기만 하고, relay가 `SP_FEEDBACK_DIR/inbox/`를 읽어(읽기 전용이어도 됨) 올린 기록을 `SP_FEEDBACK_DIR/issues/`에 쓴다.
  작성자는 사람 계정이 아니라 그 저장소 하나에만 설치한 GitHub App(권한 Issues 읽기·쓰기)의 봇. 설정: 두 쪽 모두 `SP_FEEDBACK_REPO=owner/name`,
  relay에만 `SP_GITHUB_APP_ID`·`SP_GITHUB_APP_KEY`(비밀 키 PEM 경로)·선택 `SP_GITHUB_INSTALLATION`·`SP_RELAY_POLL_S`(기본 300초 = 5분, 관리자 결정 2026-10-09 — 검사는 보관함만 읽고 GitHub에는 제보가 있을 때만 묻는다). 키는 저장소에 두지 않는다.
  - 올리는 것: `public: true`로 저장된 제보만 — 창이 공개 안내를 보였을 때만 클라이언트가 `public`을 보내고, 서버는 `SP_FEEDBACK_REPO`가 있을 때만 그 값을
    남긴다. 1단계 안내(「개발자만 봄」)를 보고 보낸 제보, 옛 화면에서 보낸 제보는 공개되지 않는다.
  - issue 내용: 제목 `[버그|제안|기타] <첫 줄 60자>`, 본문은 접수 번호·종류·버전·받은 때·내용·(첨부했으면) 접힌 진단 정보·전투 수 한 줄, 끝에
    `<!-- FB-<날짜>-<id> -->`. 라벨 `feedback`(없으면 만듦) + 버그 `bug`·제안 `enhancement`. 공개하지 않는 것: 전투 데이터, `[stats]` 기록(방 코드),
    보낸 사람 해시. 내용은 GitHub 마크다운이 그대로 보이게 바꾼다(문장 부호 `\` 처리, `<`·`&`는 엔터티, `@` 뒤 폭 없는 공백 — 아무도 멘션하지
    않음, 웹 주소는 그대로 — 자동 링크에 `\`가 끼지 않게). GitHub `/markdown` API로 렌더 확인(2026-10-09).
  - 한 번만 올림: 요청 전 `issues/<id>.posting`(배타 생성), 성공하면 `issues/<id>.json { number, url, at }`. HTTP 응답이 201이 아니거나 연결 자체가
    안 열렸으면 표시를 지우고 기다림을 두 배로 늘려(최대 1시간) 다시. 응답 없이 끊긴 요청(시간 초과 등)과 중단으로 남은 표시는 저장소의 issue 목록에서
    본문의 `<!-- FB-… -->`를 찾아 정리하고, 3분이 지나도 없으면 안 만들어진 것으로 보고 다시 올린다. 기록 파일은 보관함과 같이 90일.
  - 확인: `test/feedback-relay.test.js`(가짜 GitHub API: JWT 서명, 본문 가림, 공개분만·한 번만, 재시도 대기, 응답 없는 요청 정리). 배포 서버에서 App 설치·relay 가동은
    2026-10-09에 했고, 실제 저장소에 첫 issue가 등록되는지는 [미확인].

## 공식 위수협약 UI (2026-10-10, 관리자 요청 「제안대로 진행」)
공식 클라 위수협약 UI 중 빠져 있던 것을 공식 프리팹대로 넣는다. 근거: EN 클라 `ui/autochess/[uc]autochessbattle.ab` 프리팹(`tools/local-extract/ui_inspect.py`,
커스텀 Text의 `m_InputText` = 중국어 원문, `m_TextId` = 번역 키), 프리팹 애니메이션 클립의 마지막 키프레임(표시 길이), 공식 클라의 메서드 이름. 한국어는 관리자가 본 공식 KR 문구, 나머지는 관리자 「적절하게 번역」 지시로 우리가 정함(KR 번역 표는 클라에 없음).
그림은 로컬 추출(`data/local-assets.json` ui/battle)에 있어야 뜨고, 없으면 upstream 배너가 그대로 남는다(`ui/battleArt.js battleArt`).
코드: `public/js/ui/battleArt.js`, `public/css/battle-art.css`, 연결은 `screens/game.js`. 동작 곡선(크기·투명도 변화)은 클립을 키 단위로 옮기지 않은 [추정].
- 로딩 화면(BATTLE_CHECK, 3D 화면 로딩 중 — 엔진이 필드 첫 프레임을 그릴 때까지, render.md 「필드 첫 프레임 미리 올리기」): 공식 일반 전투 로딩 `UIBattleLoading` + `UIStageInfo`(공식 클라 `UIStageInfo.SetData`: 「Operation」 + 코드 + 이름).
  그림 = 모드의 `loadingPicId`(`data/config.json modes[].loadingPic`, 웹 소재 `loading/loading_ac_*` — AC-1 노랑 … AC-4 빨강, 1024² 그림을 공식처럼 16:9로 늘려 그림 — 관리자 확인 2026-10-12),
  글자 배치는 `act2autochess_battle_ui_plugin`의 `panel_battlestart`(Operation 30 · 코드 90 · 이름 60, Novecento wide / Noto), 아래 팁 = 공식 `gameTipsList`
  무작위 하나, 오른쪽 아래 「Loading」 + 점. 이름은 모드 이름 그대로 — 「AC-4 초월 시뮬레이션」(관리자 결정 2026-10-11: 「시뮬레이션」을 붙임. 2026-10-10에는 KR 캡처
  「AC-3 극한」을 보고 「시뮬레이션」을 뺐었음 — 클라가 시작 매개변수로 넘겨 출처를 끝까지 못 따라감). upstream의 BATTLE_CHECK 「协议启动」 띠는 그림이 있으면 띄우지 않는다.
- 시작 배너(`game_start_dialog`, 3.42초, 소리 `target` = ON_ACT1AUTOCHESS_TARGET): BATTLE_CHECK에서 1라운드 ROUND_START로 넘어갈 때 한 번(재접속은 다시 안 띄움),
  라운드 시작 배너는 그 뒤에. 「全局作战目标」(27, #1bf0b1) / 「通过14回合，消灭领袖」(35, 흰색) — KR 「전역 작전 목표」 / 「리더 적 섬멸!」(관리자 KR 캡처).
  라운드 1 배너가 ROUND_START(2초) 뒤에 뜨므로 그 라운드의 「획득」 값을 라운드 단위로 기억해 넘긴다(`roundGoldRef`).
- 아래 안내 띠(`panel_bottom_tips`, 공식 클라 `AutoChessBattleUIBottomTipsViewModel.UpdateData`): 정비 중(남의 판을 보는 중이 아님) — 내가 준비함 →
  PREP_READY(#18a486, `icon_ready`, 「준비 완료, 시뮬레이션 대기 중」), 아니면 임시 정비 구역에 단위 → HAND_OVERFLOW(#d22e2e, `icon_red`, 「정비 구역 초과,
  넘친 자원은 다음 라운드에 파기됩니다」 — 우리 번역), 아니면 정비 구역 가득 → HAND_FULL(#ff9000, `icon_yellow`, 「정비 구역이 가득 차 구매할 수 없습니다」);
  그 밖(전투·联防·관전)에는 내 전투가 끝났고 탈락 전이면 → WAIT_FINISH(#171717, `icon_waiting`, 「전투 종료, 팀원의 전투 대기 중」 — 이때 upstream의
  「作战结束，等待队友完成作战」 글은 숨기고 진행 목록만 둔다). 54 높이 배치 상자(안쪽 여백 30, 아이콘 32 + 글 18, 폭 410~690)에 바탕 `img_bg`(104×54 9분할, 종류 색 입힘)를
  깐다. `img_bg`는 가장자리가 흐린 그림이라 보이는 것은 높이 33의 둥근 띠(54 중 위 10·아래 11, 양 끝 10 안쪽, 흰색 알파 70 %)와 그 둘레 10 폭의 옅은 번짐(25 %에서 0으로, 82 % 회색)뿐이다 —
  상자 54를 통째로 칠하면 띠가 공식보다 1.6배쯤 두꺼워 보인다(관리자 제보 2026-11-16, 공식 KR 영상 캡처: 주황 띠 80px · 글 약 41px · 아이콘 약 75px — 글 18·아이콘 32와 같은 비율이면
  띠 상자 54 ≈ 123px, 보이는 띠 33 ≈ 75~80px). 규정 시즌의 장비·오퍼레이터 가득 띠(종류 5·6)도 같은 패널(CN 프리팹의 같은 `panel_bottom_tips`, `img_bg` 같은 크기)이라 같은 크기. 재발 방지: `test/ui/official-ui-gaps.test.js`. 화면 아래에서 47.7,
  상점이 펼쳐져 있으면 172 위(`battle_bottom_tips_shop_show`). KR 문구는 관리자 KR 캡처(넘침만 우리 번역).
  공식도 시간 제한 없이 조건이 맞는 동안 떠 있고 바뀔 때 0.16초 페이드뿐이다(공식 클라에서 확인 2026-11-13: `UpdateData`·`_RenderWithShowType`·`OnValueChanged`).
  **휴대폰**도 PC와 같은 공식 자리·크기(관리자 결정 2026-11-16 — 관리자가 휴대폰 화면을 보고 정함): 휴대폰 띠도 누름을 받지 않고(공식에 접기 없음), 상점을 펼치면
  172 위로 오른다. 2026-11-13~16에는 공식 자리 띠가 정비 구역 기물(끌어 오는 줄) 위에 놓여(관리자 제보 2026-11-13 「모바일에서 상점 조작·기물 배치 때 거슬림」)
  휴대폰에서 왼쪽 아래 「소통」·「⋯」 위의 접는 칩으로 두었으나(관리자 결정 2026-11-13, 시안 A·B), 띠가 공식 크기(보이는 띠 33)로 줄어 칩을 없앴다.
  재발 방지: `test/ui/official-ui-gaps.test.js`(화면 크기·포인터 질의가 띠를 고치지 않음, 띠에 접기 없음).
- 대기 창(`battle_waiting_dialog`, 공식 클라 `AutoChessBattleUIViewModel.IsWaitingPanelShow` = 정비·전투 상태의 END 단계, 즉 내 몫은 끝났는데 단계가 안 넘어감):
  우리는 정비·机变·라운드 시작·SETTLE의 마감이 0.8초 넘게 지났는데 단계가 그대로일 때(서버·팀원 대기, 재접속 직후). 부드러운 판 `banner_back`(9분할 169/170),
  모래시계 얼굴(`face_main` + `shallow_main`, 모래가 3초 주기로 위 → 아래, `battle_waiting_loop_anim` 키 값대로), 「시뮬레이션이 곧 계속됩니다」(33, #e4e5e8) /
  「현재 단계가 끝나기를 기다리는 중……」(19, #71ccb7) — 둘 다 우리 번역.
- 준비 막대(`panel_prep_ready` → `panel_player`): 내가 준비한 뒤(취소 버튼일 때) 「준비 완료 n/4」 글자 대신 `player_bg` 판 + `player_frame` 괄호 + 사람마다
  `player_ready`(흰색 15 % → 준비한 수만큼 앞에서부터 #00ffc4 72 %, 클라처럼 사람별이 아니라 수로 켬). 그림은 로컬 추출(`has-hud-ready`).
- 연합 방어 배너(`help_battle_dialog`, 3.0초): UNITE에 upstream 띠 대신. `round_result_dialog` 틀의 주황판 — `round_bg` + 등고선 #6c5e48, 왼쪽 괄호·모서리 #ffa421 안에
  픽셀 둘 `assist_emoji_01/02`, 오른쪽으로 가는 화살표 `arrow` 4개(알파 .4/1/.4/.2), 점 #ffb134 · SIGNAL #ffb135, 「联防阶段」(40, #ffaa24) — KR 「연합 방어」(관리자 KR
  캡처; 같은 msgid라 단계 이름 「联防阶段」도 「연합 방어」로 바뀜).
- 보는 판 표시(`panel_ob_info`, 공식 클라 `AutoChessBattleObInfoPanel`): 联防·보스 판의 ‹ › 전환기(클라 전투 모드 `ClientHud`)와 팀원 관전 표시를 공식 모양으로 — 화면
  아래 가운데 84 위 318×40, `bg_ob_self` + `icon_ob_self` + 「你自己」(KR 「자신」, 관리자 KR 캡처 — 팀원 목록 내 칸 툴팁도 같은 msgid) / `bg_ob_other` +
  `icon_ob_other` + 이름(클라의 `#번호`는 우리에게 없음) / 「无人在家」(#cfcfcf 70 %) / 「全景」(공식 「全屏」 자리, 우리 단어 유지), 좌우 `left_arrow_active`(48×68, ±207).
  보는 반쪽의 플레이어가 나갔으면(`status` 'left') `ob_player_lost` 판(589×356) + 「当前玩家已离开」/「可自行切换查看其他玩家」(우리 번역). 「返回战场」은 upstream 버튼을 오른쪽에 둔다.
- 라운드 띠 전환(`player_info_view` `trans_rest/battle/coop/boss`, 4.23/2.67/3.27/4.37초): 단계가 휴식·전투·联防·보스로 바뀔 때 띠 안에서 1단계(전투: 픽셀 전사가 뛰어들고
  벌레가 기어 옴, 칼을 휘두름 / 联防: 전사가 겁먹고 칼을 떨어뜨리면 동료가 뛰어듦 / 보스: 경고 표시 둘이 리더 표시 옆으로 벌어짐 / 휴식: 컵 셋이 통통) → 2단계(칼 아이콘 → 왼쪽,
  글이 주황 받침 위로 오른쪽으로: 「开始作战」 KR 「전투 시작」, 「联防开始」 KR 「연합 방어」 — 관리자 KR 캡처) → 위로 빠지고 띠 원래 내용이 아래에서 올라옴. 키 시각은
  클립 값, 움직임 곡선은 [추정]. 보스 띠의 넓어지는 HP 바 부분(`group_normal`)은 우리 보스 띠가 공식 모양이 아니라 넣지 않았다.
- 맹약 줄 「暂停叠层」(`bond_list_info_view root_pause`: `matte_pause` 157×47, 15 #d7fff3) — KR 「중첩수 사용제한」(관리자 KR 캡처): 联防·보스 라운드(맹약 층이 쌓이지 않는
  때)에 맹약 줄 가운데. upstream의 툴팁 「层数叠加已禁用」은 그대로. 규정의 보스 라운드는 층이 쌓이므로(sim.md 「규정 맹약」) 표시도 툴팁도
  없다 — 공식 규정 보스 영상의 맹약 줄에 이 표시가 없다(관리자 확인 2026-11-13; `gameLogic` `bondLayersPaused`, 연합 방어는 그대로).
- 왼쪽 플레이어 카드 상태(`player_status_item`, `has-hud-card`): 탈락 = `mask_dead`(#565656 80 % + `icon_dead`), 나감(`status` 'left') = `mask_quit`(#303030 80 % +
  `icon_lost_connect`), 연결 끊김(`connected` false) = `mask_reconnect`(#303030 80 % + `icon_reconnect` — 예전에는 끊김에 `icon_lost_connect`를 잘못 씀), 내가 보고 있는 팀원
  카드 오른쪽 위 `icon_observing`(upstream 눈 표시 대신), 카드 오른쪽 아래 밖 `icon_complete`(준비·완료 — 준비도 공식처럼 체크) 또는 `icon_doing` 점 셋(깜빡임
  [추정·화면: `moving_part`의 Animation이 깜빡임인지]), 「返回战场」은 초상 위 공식 사각 버튼(`btn_return_self` 98×98; 「前往查看」은 2026-11-19부터 팀원 정보 창에서 팀원 아바타를 덮는 공식 틀 — 아래 「팀원 정보 창」). 점 셋은 전투(联防 포함)가 아직 진행 중인 플레이어에게만
  (`status` combat / helping), 휴식·机变 중 아직 준비 안 한 플레이어(결정·행동 중)는 아무것도 없음, 점에는 테두리·받침 없음 — 관리자 제보 2026-10-10(공식 카드의
  `ActionState`도 IDLE/MOVING/COMPLETE 셋뿐). 처음 넣을 때(29f65de4)는 결정·행동 중에도 점을 띄우고 upstream 상태 칸의 테두리가 남았다.
- 방송(`broadcast_panel`, 공식 클라 `AutoChessBattleBroadcastPanel`): 로컬 그림이 있으면 upstream 띠 대신 화면 위에서 165 아래, 9분할 `broadcast_bkg`(l/r 20, t 14, b 11)
  + `broadcast_icon` + 18 흰 글, `auto_chess_broadcast`대로 34 아래에서 떠오르고 2.0초부터 사라져 한 줄 2.33초(upstream 5.2초). 문구·우선순위·대기열은 그대로(`ui/ticker.js`).
  - 오퍼레이터 대미지 방송(CHAR_DAMAGE 「…造成的伤害量达到{2}」)의 대미지량은 표 숫자(200000 / 500000 / 1000000) 그대로가 아니라 `fmtNum`으로 줄여
    보인다 — KR 「20만」「50만」「100만」(관리자 결정 2026-10-24; `ui/lang.js tickerText`). 서버가 보내는 `text`·`args`는 그대로 숫자.
  - 큰 숫자의 단위(`fmtNum`: 이 방송, 결산의 입힌 대미지·리더 적 대미지·대미지 탭, 상세 창의 HP, 기록 화면): 한국어 팩은 중국어·일본어처럼
    만 / 억(`_meta.numberUnits`, `tools/i18n/build-ko-pack.mjs`), 10만 미만은 자릿수 쉼표. 설정 → 화면 「숫자 단위」(`numberUnits`)로 만·억 / K·M / 전체 숫자
    (`200,000`)를 고른다 — 고르기 전에는 언어의 방식, 단위가 없는 언어(영어)에서는 만·억 칸이 없다. 줄인 숫자는 소수 한 자리까지, 끝의 「.0」은
    뺀다(98.0만 → 98만, 40.2만은 그대로; 관리자 결정 2026-10-24).
- 보스 라운드 시작 창(혼자 `single_boss_prepare_dialog` / 협동 `multi_boss_prepare_dialog` / 숨은 라운드 `hidden_boss_prepare_dialog`): 보스 라운드(숨은 라운드)의
  **ROUND_START**, 즉 그 라운드의 휴식 전에(관리자 제보 2026-10-10 「보스 라운드의 휴식시간에 들어가기 전」; 공식 클라 `AutoChessGameStateType.BOSS_PREPARE_WAITING`(101)
  상태의 `AutoChessBattleUIController.PendingBossPrepareWaitingTask.CalcTabId`가 `tab_single/multi/hide_boss_prepare`를 고름 — 보스 전투가 아니라 그 앞의 대기),
  BOSSROUND 소리와 함께, 라운드 시작 배너(「라운드 14 / 획득 +N」)는 창이 끝난 뒤(시작 배너와 같은 순서 — 공식도 보스 카드 다음에 라운드 시작 배너: maintainer confirmation 2026-10-10 (official play memory)). 보스 전투
  (FINAL_ASSAULT·HIDDEN_CORE)가 시작될 때는 띠·창 없이 라운드 띠 전환만(`ui/battleArt.js bossOpening`). 처음 넣을 때(8527a6d7)는 보스 전투 시작에 띄웠다.
  그림이 없으면 upstream 띠가 전투 시작에 그대로. 공통 판 `team_boss_start_bg`(숨은 라운드 `bg_type_01`)는 `bg_mask`(RectMask2D 패딩)대로 잘라 띠로 보인다. 혼자: 리더 표시(`icon_boss_normal_white`
  #e6612c) + 열리는 괄호 + 리더 초상(`boss_bg_normal`, 그림은 `bosses.json` 적 아이콘), 「决战回合」(18) / 「迎击首领敌人」(32 #ec6b38) — KR 「최종 공세 / 리더 적 섬멸!」.
  협동(관리자 설명: 남은 팀원 HP를 합산해 보여 주고 같은 배너가 바뀌며 보스가 나옴): `in_01`(1.27초) 살아 있는 플레이어 줄(아바타, 내 표시 `team_boss_player_mine`,
  LP)과 가운데 원(합산 LP), 선이 깜빡이며 들어옴 → `in_02`(1.17초) 팀이 왼쪽(−96)으로, 오른쪽에 리더, 「决战回合」 / 「合力迎击领袖！」(#22e8bd) — KR 「최종 공세 /
  힘을 합쳐 리더 적 섬멸!」. 플레이어 2·3명일 때 줄 자리는 4명 자리에서 [추정]. 숨은 라운드: 경고 표시, `boss_sp_icon`, 「隐藏回合已解锁」(34 #09d7e3) / 「挑战失败不影响
  胜利结算」(19 #a0b2b3) — KR 「히든 코어 개방 / 실패해도 정산에 지장 없음」. 고리(ext 스프라이트)와 선 모양은 [추정].
- 판 끝 연출(`settle_ending_dialog`, 공식 클라 `AutoChessSettleDataModel.EndingStatus` + `_PlayAudio`): `m.result`가 진행 중인 판에 도착하면 결과 화면 전에(필드는 그대로
  두고; 서버는 RESULT 단계의 m.public을 m.result보다 먼저 보내므로 그 사이에도 필드를 둔다 — 전에는 결과 없는 결과 화면이 「模拟失败」를 잠깐 띄우고(숨은 라운드까지 깨도),
  연출 때문에 필드가 다시 마운트되며 로딩 화면(`AC-n`)이 떴다: 관리자 제보 2026-10-10, `screens/game.js GameScreen` `onField`) — 승리·숨은 라운드 없음 = NORM_BOSS_WIN(`panel_win_first_boss`, 소리 `killBossNormal`), 승리·숨은 라운드 실패 = HIDE_BOSS_FAIL(`panel_lose_break_one_boss`,
  `killBoss`), 둘 다 = HIDE_BOSS_WIN(`panel_win_all_boss`, `killBossAll`), 패배·전멸 = GAME_OVER(`panel_lose_all_out`, `disconnect`); 중도 포기·오류는 없음. 글:
  「已击败首个领袖！」 KR 「위수 성공!」(관리자 KR 캡처; 숨은 라운드 실패도 클라 CN 원문이 같아 같은 문구 [추정]), 모두 처치는 클라에선 그림 글자 `img_text_win_all`(EN
  「All Leader Enemies Defeated!」) — 번역하려고 글자로 그림, 우리 CN 「已击败全部领袖！」, KR 「모든 리더 적 처치 완료!」(관리자 KR 캡처), 중단 「模拟中断」 KR 「시뮬레이션
  중단」(우리 번역). 길이는 클립(1.97 / 1.97 / 3.0 / 2.1초) + 머무름 [추정], 공식 최대 4초.
- 탈락 창(`self_dead_dialog`, 공식 클라 `AutoChessBattleUISelfDeadDialog`): 판 도중 내 자리가 탈락하는 순간 한 번(관전석·재접속 제외) — 검정 80 %, 붉은 띠(`bg_type_01`을
  RectMask로 자름), 깨지는 픽셀 얼굴(`icon_01`…`04`), 「防线已被突破」 KR 「방어선이 뚫렸습니다」(기존 번역 재사용), 「继续观战」 「계속 관전」(창 닫기) / 「退出模拟」
  「시뮬레이션 나가기」(나가기 확인 창) — 클라 문구표가 없어 우리 번역.
- 라운드 시작 배너의 보스 예고 줄(`round_countdown`, 공식 클라 `CheckIfNeedRoundRemainTip`): 보스 라운드 − 현재 라운드가 1~`constants.bossTrailerStartRound`(3)일 때
  배너 위 91.6에 「剩余 N 回合」(20 #a6a6a6, 숫자 #ff682d) — KR 「남은 라운드 N」(우리 번역). 예전에 일부러 뺐던 것(위 「휴식 진입…」 절)을 2026-10-10 관리자 요청으로 넣음.
- 로딩 화면은 판 시작(BATTLE_CHECK, 3D 화면 처음 로딩)에만 — RESULT 단계에는 띄우지 않는다(위 판 끝 연출의 제보).
- 전투 시작 띠 없음: COMBAT의 upstream 「作战开始 / 各自行动阶段」 띠를 뺐다(관리자 제보 2026-10-10 「공식은 전투 시작 시 배너가 없음」) — 전투 시작은 라운드 띠의
  `trans_battle`(「전투 시작」)과 소리뿐. 휴식(PREP) 띠를 뺀 2026-10-08 결정과 같은 꼴.
- 남은 자금으로 준비할 때 묻는 창(관리자 제보 2026-10-10 「공식 UI로」): 공식 클라 `AutoChessBattleUIController._GetPreReadyTipGoldDialogTabInput` = 공식 확인 창
  `AutoChessConfirmDialogInPage`(`[uc]autochesscommon.ab` `auto_chess_confirm_with_cancel_view`) — 뒤 화면 흐림, 화면 너비 어두운 띠 `img_confirm_dialog_bg`(9분할
  40/40/42/42, 257 높이, y +39), 글 26 흰색, 그 아래 체크 줄(`img_confirm_dialog_check_box` / `_check_small` 21 + 22 #dcdcdc 「本局不再提示」), 띠 아래(y −140) 화면 반씩
  두 버튼(103 높이): 취소 = 회색 `img_confirm_dialog_btn_gray_bg`(9분할 20/20) + `img_confirm_dialog_cancel`, 확인 = 초록 `img_confirm_dialog_btn_green_bg`(22/322) +
  검게 칠한 `img_confirm_dialog_check` + #051511 글(뷰의 `_colGreenBtnText`/`_colGreenBtnIcon`). 조건은 그대로(클라 `IsNeedToShowPreReadyTipGold` = 자금 > 0, 전략이
  `noMoneyTipsBand` 밖). 체크하고 확인하면 이번 판에는 다시 묻지 않는다(클라 `AutoChessLocalCache.DataInScene.isPrevReadyGoldTipDisable` — 장면(판) 단위). 공식 문구
  (`AUTO_CHESS_BATTLE_PREP_READY_TIP_2` / `…_NOMORE`)는 클라 문구표가 없어 본문은 예전 우리 문장 [추정], 체크 글 「本局不再提示」 KR 「이번 판에는 다시 묻지 않기」는 우리 번역.
  흐림 세기·어둡게 하는 정도 [추정]. 그림(`ui/common`)이 없으면 예전 확인 창.
- 임시 정비 구역이 넘친 채 준비(관리자 결정 2026-10-10 「공식 창을 같은 모양으로, 문구는 우리 번역」): 공식 클라
  `AutoChessBattleUIController._EventOnPrepReadyBtnClick`은 준비를 누르면 `isHandOverflow`면 `tab_pre_ready_tip_hand_overflow`
  (`_GetPreReadyTipHandOverflowDialogTabInput`: 같은 확인 창, `AUTO_CHESS_BATTLE_PREP_READY_TIP_1`, 체크 없음 — 글은 띠 가운데 1080×200) →
  확인하면(`_HandleTabPrepReadyTipHandOverflow`) 이어서 남은 자금 창 조건을 보고 → `ReqPrepareReady`. 즉 공식은 **넘친 채로 준비할 수 있다**
  (아래 띠 HAND_OVERFLOW 「넘친 자원은 다음 라운드에 파기」와 같은 뜻). 그래서 서버 규칙도 바꿨다: `server/match/player/prep.js setReady`의
  `TEMP_NOT_EMPTY` 거절(upstream 원래 규칙, `docs/PLAYING.md` 「临时整备区有单位时不能准备就绪」)을 빼고, `m.private.canReady`도 임시 칸을 안 본다
  (`player/views.js`). 준비할 때 이미 있던 것은 그 휴식이 끝날 때(모두 준비해 일찍 끝나도) 마감 때와 똑같이 처리 — 오퍼레이터는 카드 풀로, 장비는 파기
  (`endPrep → resolveTemp`, 테스트 `test/match/temp.test.js` 실제 대전 경로). 준비 뒤에 들어온 것은 예전처럼 다음 휴식까지. 창 순서도 클라대로 넘침 →
  남은 자금(`screens/game.js toggleReady`). 글 「临时整备区中仍有单位，休整期结束时将被销毁。确定准备就绪吗？」 KR 「임시 정비 구역에 유닛이 남아 있습니다.
  휴식 기간이 끝나면 파기됩니다. 준비 완료하시겠습니까?」(우리 번역). 준비 버튼 아래 「임시 정비 구역 N개 대기」는 알림으로 남기되 버튼은 막지 않고, 판 위 줄
  설명(`underframe.js tempRowRule`)도 새 규칙대로. 감사(`server/match/audit.js`)의 「비지 않은 임시 칸으로 준비」 검사는 뺐다. AI는 예전처럼 스스로 비운 뒤 준비.
  임시 칸 뒤 숨은 대기열(2026-10-17, `sim.md` 「임시 정비 구역 뒤 숨은 대기열」)도 준비를 막지 않는다 — upstream `92b97ecb`의 대기열 준비 거절은 안 받음.
- 재접속 대기 마스크(관리자 요청 2026-10-12, 공식 클라 `AutoChessBattleUIController._reconnectWaitContainer` + common `auto_chess_reconnect_mask`): 판 안에서
  소켓이 다시 붙는 중(`reconnecting`)이면 연결 띠 대신(`ui/connBanner.js`) 화면 전체를 막는 판(`bg_block`) + 아래 `bg_lower_tile`(218) + 바닥에서 80 위 60 높이 띠 —
  양옆 주황 `banner_orange_tile`, 가운데 540 폭 `banner_black_tile`, 옆 선 `banner_frame`(9분할 8|18, 오른쪽 뒤집음, ±197.5), `banner_dec`, 가운데 `icon_waiting`(35,
  #ef7c39) + 「等待重连中......」(22 #ef7c39, 프리팹 원문) — KR 「재연결 대기 중......」(우리 번역). 공식처럼 「立即重连」 버튼이 없다(포커스·온라인 때 즉시 재시도는
  그대로). 아이콘 깜빡임 [추정]. 서버 재시작 카운트다운 뒤의 「재시작하는 중」 띠는 그대로.
- 서버 끊김 창(공식 클라 `_HandleServerLost` → `tab_server_lost_dialog`, `_GetServerLostDialogTabInput`: `AutoChessConfirmDialogInPage` 확인 버튼 하나,
  `AUTO_CHESS_BATTLE_SERVER_LOST_TIP` 또는 비활동 종료 `…_TIP_NEGATIVE_PLAY`, 확인 → `QuitGame`): 진행 중인 판(RESULT 전)에서 `room.closed`가 오거나 새 세션(서버
  재시작)이 되면 바로 로비로 보내지 않고 판 화면 위에 확인 하나짜리 창(`auto_chess_only_confirm_view`: 띠·글은 확인 창과 같고 버튼이 화면 너비 하나, 초록 판
  [추정 — 빨간 판도 있음])에 이유 글(닫힘 이유 문구, 모르면 「与服务器的连接已断开」 KR 「서버와 연결이 끊겼습니다」 — 우리 번역)을 띄우고, 확인해야 로비로
  (`main.js serverLost`). 브리핑·전략 선택 화면에서도 같은 창이 뜬다(`screens/game.js GameScreen`; 판 화면에만 있어서 그 두 화면은 안내 없이 멈춰 있었다, 2026-11-07). 그림이 없으면 예전처럼 로비 + 토스트.
- 혼자 판 이어하기 창(공식 클라 `EventOnShowSingleResumeDialog` → `tab_single_resume_dialog`, `_GetSingleResumeDialogTabInput`: 확인 버튼 하나,
  `AUTO_CHESS_BATTLE_SINGLE_RESUME_DIALOG`, 확인 → `ReqResumeSingleMode`): 판 화면이 이미 진행 중인 혼자 판으로 열릴 때(새로고침·새 탭; INFO_CHECK·BAND_DRAFT·
  BATTLE_CHECK·RESULT 제외, `battleArt.js soloResumeDue`) 같은 창에 「存在进行中的模拟，是否继续？」 KR 「진행 중인 시뮬레이션이 있습니다. 이어서
  진행하시겠습니까?」(우리 번역). 전투 중이면 창이 떠 있는 동안 일시정지(`g.pause`, 일시정지 화면은 창 뒤에 안 띄움)하고 확인하면 이어 감. 서버 규칙은 그대로
  (끊긴 동안 혼자 판은 예전처럼 서버가 이어 감 — 공식은 멈춰 둠 [추정 차이]); 휴식은 시간 제한이 없어 창만.
- 핑 판(`panel_ping`, `AutoChessBattleUIPingPanel`): 위 왼쪽 나가기 버튼 옆 `img_delay_bkg` 76×24, 글 흰색 16(best fit 1–16 — 「9999ms」까지 16에 들어감) — 글은
  숫자와 「ms」만(`autoChessData.constData.pingConds` 「<@ping.low>{0}</>ms」, CN 표 2026-11-01부터, 공식 CN 화면 2026-11-18; 예전 표·KR·EN 클라는
  「当前延迟{0}ms」·「PING {0}ms」·「Current ping: {0}ms」), 숫자 색 `gamedata_const` richTextStyles `ping.low/medium/high` #7fa826 / #ec7a00 / #ff3d3d
  (1 / 60 / 200 ms 기준). 그림이 없으면 upstream 알약. 모드 표시 아래(아래 「규정 전투 HUD 모드 표시」, 두 시즌).
- 위수협약 토스트(`auto_chess_notify_taost`, 공식 클라 `AutoChessUtil.ShowTextToast` — 전투·상점·방·결산의 토스트가 모두 이것): 판 화면이 열려 있고 그림이 있으면
  모든 토스트를 346×114 판(`img_toast_bg`, 「i」 표시 포함, 텍스처는 rect 379×181 안 18/19) + 글 230×80(+40, 20 흰색)으로, 화면 가운데에(위치 [추정] — 클라
  일반 토스트 층). `html.sp-ac-toast`(`screens/game.js`).
- 결산 「战斗中...」(`auto_chess_settle_game_player_item` `panel_battle`, 19 #e4e4e4 on `round_battle_bg`): 공식은 탈락해 먼저 결산으로 나간 사람에게 아직 싸우는
  팀원을 보여 주지만, 우리 서버는 판이 끝날 때 모두에게 한 번 결과를 보내 이 상태가 생기지 않는다 — 넣지 않음(먼저 나간 사람의 중간 결산이 서버 기능으로 생기면 그때).
  결산 좋아요는 서버 기능이 필요해 관리자 결정 2026-10-12로 빼 둠(관리자 노트).

## 본판 정보의 맹약·결장 오퍼레이터를 공식 정보 화면 모양으로 (2026-10-11, 관리자 요청)

브리핑(「1/2 确认本局信息」) 오른쪽 열과 전략 선택의 「本局信息」 창(둘 다 `public/js/ui/matchInfo.js`)을 클라의 정보 화면
(`ui/autochess/[uc]autochessouter.ab` `auto_chess_stage_info_dialog` / `_state` → `prefab_auto_chess_stage_info_view`)대로 그린다. 2단 배치는 그대로
(관리자 결정 2026-10-11 「지금 2단 배치 유지」 — 공식은 적 → 결장 → 핵심 → 부가 세로 한 줄).

- 맹약 칸(`prefab_auto_chess_stage_info_bond_item` 110 × 160): 켜진 맹약은 민트 원판 `img_bond_bkg`(131 × 130, 가운데에서 15 위) 위에 어두운 문양
  (60 칸, 색 #031712), 꺼진 맹약(뽑힌 집합 D)은 회색 `img_bond_banned_bkg` + 회색 문양(#c9c9c9) + 금지 표시 `img_bond_banned`(38, 원판 가운데에서
  (29, 32)), 이름은 가운데 50 아래 19 크기 #f4f4f4 60 %. 예전 upstream 원판(SVG 단계 고리·✕·빨간 결장 인원 배지)은 뺐다 — 인원은 툴팁(`briefingBondTip`)과
  아래 맹약별 목록에 있다. 그림은 로컬 클라 추출물 `ui/outer`, 없으면 CSS 원.
- 제목 줄(`perm_bond_title` = 핵심 맹약 / `temp_bond_title` = 부가 맹약 / `chess_banned_title`): 바 그림 `img_group_title_perm_bond`(핵심, 가로 반복) /
  `img_group_title`(9칸 늘이기 — 경계 L41 R492라 「RHODES ISLAND STRONGHOLD PROTOCOL」 로고가 오른쪽 끝에 한 번; 예전 가로 반복은 로고가 막대 가운데에도 찍혀
  제목 뒤 칩과 겹쳤다)과 아이콘 — **핵심 맹약 = 빛살 `img_title_icon_temp_bond`, 부가 맹약 = 날개 `img_title_icon_perm_bond`**(그림 이름과 반대; 모든 모드,
  브리핑·전략 선택·선발 편성 확정 3/3의 「시뮬레이션 정보」 창 모두). 공식 CN 규정 화면 셋(2026-11-18)이 그렇고, 관리자가 맹약 하반기 공식 화면도 같음을 확인했다
  (관리자 결정 2026-11-18, 공식 화면 확인; 클라가 어느 제목 프리팹을 어느 목록에 붙이는지는 읽지 않음). 예전엔 프리팹 이름대로 핵심 = 날개였다. 결장 수는 제목 바로 뒤(바 그림
  오른쪽 로고와 겹치지 않게). 재발 방지: `test/ui/match-info.test.js`(「the title icons as the official screens」).
- 결장 오퍼레이터는 **맹약별**(`prefab_auto_chess_stage_info_chess_banned_group`): 왼쪽 꺼진 맹약(110 × 130, 문양 45), 구분선 `img_bond_banned_split`, 그 맹약의
  결장 오퍼레이터(130 칸, 7 간격). 오퍼레이터 그림(`matchInfo.js ChessIcon`, 전략 선택의 선발 프리셋 칸과 판 안 「시뮬레이션 정보」 탭도 같은 것)은 공식 `auto_chess_outer_common_chess`(이 항목이 불러오는
  `AutoChessCommonChessView`)와 `chess_banned_item` 값대로: 그림 90, 그 뒤 흰 카드 `img_chess_bkg`(색 변경 없음, 109 × 107 = 카드 96 × 95 + 오른쪽·아래 옅은 그림자, 그림 왼쪽 위에서 2.5 밖),
  단계 그림 35가 그림 왼쪽 아래 모서리에서 9.1씩 밖으로, 결석이면 30 % 회색 `img_chess_banned_mask`(94 × 95)가 그림과 카드를 덮고 `img_chess_banned`(73, 그림 가운데에서 (33, 32))의
  빨간 삼각형(34)이 카드 오른쪽 위 모서리에 닿는다(관리자 요청 2026-10-13, 공식 화면 대조). 공식 클라 근거: `AutoChessStageInfoGroupViewModel._LoadBondDataFromIdRange`가
  `bannedBondList`의 맹약마다 `AutoChessStageInfoChessGroupModel`을 만들고, `LoadData`가 그 맹약 멤버 중 `CalculateBannedChessIdList`에 든 것을 넣는다 →
  두 맹약이 다 꺼진 오퍼레이터는 두 묶음에 다 나온다. `_RefreshChess`는 멤버 수가 0이어도 묶음을 넣고, 6명마다 줄을 나눈다(두 번째 줄부터 맹약 칸 없음 — 우리는
  가로 폭에 맞춰 감싼다).
- 모드가 끄는 맹약(표준 시뮬레이션의 10개 — 라테라노·에기르·카시미어 등, 규정 시즌 모드의 8개)은 맹약 줄에도 결장 묶음에도 **아예 없다**(2026-11-16 공식 클라에서 확인:
  `_LoadBondDataFromIdRange`가 모드 `activeBondIdList`에 없는 맹약을 건너뜀). 그래서 회색은 뽑힌 맹약(D)뿐이고 범례의 「或本模式禁用」도 뺐다. 결장 묶음은 D의 맹약마다
  하나(비어도, 위 `_RefreshChess`), 모드가 끈 맹약으로만 결장된 오퍼레이터는 어느 묶음에도 없어 목록에 안 나온다. 제목 옆 결장 수(공식 `chess_banned_title`에는 수 칸이
  없음 — 우리 것)는 목록에 나온 오퍼레이터 수다(`matchInfoModel` `banned`; 판 안 「시뮬레이션 정보」 탭의 수도 같은 값). D 맹약과 모드가 끈 맹약을 함께 가진 결장 오퍼레이터는
  D 묶음에 나온다 [추정·서버: 공식 서버의 팀 정보 `bannedBond`에 모드 비활성 맹약도 드는지 모름 — 안 들면 `CalculateBannedChessIdList`가 그 오퍼레이터를 결장으로 안 셀 수 있음].
- 순서(같은 날 공식 클라에서 확인, `AutoChessStageInfoBondViewModel.CompareTo`·`AutoChessStageInfoChessGroupModel.CompareTo`): 맹약 줄(핵심·부가 각각)은 안 꺼진 맹약 먼저,
  꺼진(D) 맹약 뒤, 그 안은 표 `identifier` → `bondId`(문자열 순). 결장 묶음도 같은 비교(모두 꺼졌으니 `identifier` → `bondId`) — 핵심·부가가 `identifier`로 이어진다.
  예전엔 `bondOrder` → `identifier`로 꺼진 칸이 제자리였고 조화(`maniShip`, `bondOrder` 1)가 부가 맨 앞이었다. 시즌 갈래 없음 — 읽은 EN 클라는 맹약 시즌 코드이고, 관리자가
  맹약 시즌 옛 공식 영상에서 꺼진 맹약이 뒤인 것을 확인해 두 시즌 모두 클라대로(관리자 결정 2026-11-16).
  재발 방지: `test/ui/match-info.test.js`(`assertClientOrder` — 합성·표준·극한 시뮬레이션 판에서 모드가 끈 맹약이 줄에 없는지, 줄·묶음 순서).
- 판 안 「시뮬레이션 정보」 서랍(`ui/enemyDrawer.js InfoTab`)도 결장 오퍼레이터 묶음을 브리핑과 같은 공식 `chess_banned_group` 모양으로 그린다(`matchInfo.js BannedGroups`:
  꺼진 맹약 원판 → 구분선 → 결장 오퍼레이터, 서랍 폭에 맞춘 작은 단위; 오퍼레이터를 누르면 카드가 열림. 관리자 요청 2026-10-31 — 그날 먼저 넣은 맹약 칩 + 결장 수 배지 모양을 대신함). 서랍은 ✕·왼쪽 돋보기·Esc 말고
  서랍 밖을 눌러도 닫힌다(서랍이 연 카드·맹약 팝업·대화상자 안은 그대로, `gameLogic/shortcuts.js drawerClosesOnPress`; 관리자 요청 2026-10-31).
  결장 오퍼레이터 위에는 핵심 맹약·부가 맹약(관리자 결정 2026-11-18 — 공식 판 안 플레이어 정보 창 `autochess_hud_player_info_dialog`에는 맹약 칸도
  결장 칸도 없어 우리가 더한 것). 같은 날 관리자 결정(시안 A)으로 내 전략 칸 아래는 전략 선택 「맹약 정보」 창의 내용을 그대로 쓴다(`matchInfo.js MatchInfo`
  하나 — 서랍만의 맹약 줄·제목을 없앰): 핵심 맹약·부가 맹약·금지 오퍼레이터가 각각 공식 제목 막대 그림이 있는 칸이고, 회색 범례 줄, 커스텀 판의 규칙 차이,
  1인 규정의 두 핵심 묶음(읽기 전용)도 그 창과 같다. 다른 점은 크기(`--ou` = max(.0064rem, .46px) — 데스크톱에서 맹약 한 줄 9개쯤, 휴대폰은 창과 같은 하한이라
  카시미어·라이타니엔 같은 긴 이름이 옆 이름에 닿지 않음)와 결장 오퍼레이터를 누르면 카드가 열리는 것(`onChess`)뿐. 「전장: …」 줄은 없앴다(관리자 결정
  2026-11-18 — 필드에 이미 보임). 1인 규정 부가 맹약 제목의 「일부 맹약의 오퍼레이터 편성이 불완전함」 칩은 맹약 줄 칸의 단위(`--ou`)로 그린다 — 게임 화면의
  HUD 단위 `--u`가 물려 내려와 칩이 HUD 크기(22 px)로 커지고 제목이 한 글자씩 세로로 밀렸다(관리자 제보 2026-11-18). 제목 줄은 늘 한 줄이다(관리자 결정
  2026-11-18 — 처음엔 휴대폰에서 칩이 다음 줄로 내려갔다): 제목은 줄지 않고, 영문 작은 글자가 먼저 비켜나고, 그래도 넘치면 칩 글자가 줄어들며(`matchInfo.js fitTip`,
  8 px까지) 끝에는 「…」(전체 문구는 툴팁). 휴대폰 740·844 서랍에서 칩 9 px 한 줄. 1인 규정 묶음 칸 [화면 미확인].
  재발 방지: `test/ui/match-info.test.js` 「the drawer on a phone」.
  재발 방지: `test/ui/match-info.test.js`(「the in-game 本局信息 tab on a real match」 — 실제 판 경로에서 서랍이 창과 같은 `MatchInfo`·모델·`onChess`를 쓰는지, 전장 줄 없음).
- 공식 제목·안내 문구는 프리팹에 없고(실행 중 문구표 키로 채움) 클라 문구표도 없어 예전 우리 문구(核心盟约 / 附加盟约 / 本局禁用干员)를 그대로 쓴다.
  `perm/temp_bond_title`의 `text_tip`(`hasBondBanned`일 때 뜨는 안내) 내용은 모른다 — 대신 범례 한 줄. 1인 규정은 공식 화면에 보인 대로 부가 맹약 제목 뒤 칩
  「部分盟约所含干员阵容不完整」이고 범례 줄이 없다(아래 「1인 규정 브리핑 두 단」).
- 창은 이제 데스크톱에서도 본문이 스크롤된다(공식도 스크롤 뷰). 테스트: `test/ui/match-info.test.js`, 브라우저 `test/ui/match-info.e2e.test.js`.
- 맵 미리보기(관리자 요청 「맵 이름 아래에 어떤 맵인지」; 2026-10-15부터 전장 카드 전체가 캐주얼 규칙 모드만 — 클래식은 「미확인 전장」, 이 파일 「규칙 모드 — 클래식·캐주얼」): 공식 일반 스테이지는 `arts/ui/stage_mappreview_*.ab`
  (`dyn/arts/ui/stage/mappreviews/<stage>.png`, 512 × 512, 실제 3D 장면을 위에서 약간 기울여 찍은 그림 + 빨강 침입·파랑 보호 지점 상자)를 쓰는데, EN·CN 클라 모두
  위수협약 전장(`act1autochess_m01`…`act2autochess_m04`)의 그림이 없다(2026-10-11 전수 확인). 관리자 결정(2026-10-11 「도구로 한 번 캡처」):
  `tools/map-previews.mjs`가 실제 Chrome(GPU)로 우리 3D 보드(`render/board3d` + 공식 장면 추출물)를 공식 미리보기처럼 그린다 — 왼쪽 일반 전장
  (프레임 r7–13 c0–10: 행 13은 빨강 침입 상자, 조명 영역 `AREAS.normal[0]`, 그 밖은 게임처럼 어둡게), 피치 30°(클라 전투 카메라), 빨강 침입·파랑 보호 상자 포함.
  공식은 정사각이지만 브리핑 배치 때문에 가로 1024 × 448(16:7) WebP(관리자 결정 2026-10-11 「맵 이미지를 가로로 긴 비율로」; 세로로 길게는 「보기 좋지
  않음」으로 뺐다): 필드는 가운데 3.6:1 띠(`BAND`, 게이트 상자 높이 여유) 안에 맞추고 위아래·좌우는 주변 풍경 — 카드가 잘라도 필드는 안 잘린다.
  결과는 로컬 추출물과 같이 `public/assets/local/stage/preview/<stageId>.webp` + `data/local-assets.json` `stage/preview`(`webp: 'lossy'`, PNG 짝 없음;
  git 밖, deploy.sh가 내용 비교로 복사), 다시 만든 뒤 `tools/build-browser-resources.mjs`. 카메라·범위는 일반 스테이지 그림을 눈으로 맞춘 것 [추정].
- 전장 이름(카드 제목 줄, 「본 판 정보」 탭, 커스텀 규칙의 전장 목록): 공식 표(`stageDatasDict`는 `stageId`·`mode`·`weight`뿐)에도 공식 정보 화면에도 전장 이름이 없다 — 규정 공식 브리핑은 맵 미리보기(돋보기)만 보인다(공식 화면 2026-11-11). 전투 시작 띠 `panel_battlestart`의 `text_stage_name`은 모드 이름(표준 시뮬레이션 등, `UIStageInfo`)이다. 그래서 이름은 PRTS가 붙인 번호 + 그 전장의 특수 지형·환경 장치다: 맹약은 PRTS 卫戍协议 조사 (「战场#05(下半) 源石流发生装置」), 규정은 PRTS 卫戍协议·规程/战场一览(#01–#06·#09–#12, 2026-11-15 확인 — 번호는 장치·타일로 맞춤: m04 활성 오리지늄, m05 오리지늄 기류 발생 장치, m06 늪지대 제어, m09 은신 모듈(`tile_duel_grassland`), m10 염괴포, m12 최적화 모듈(`tile_speedup`); m01–m03·m11은 번호만). 모두 `docs/research/05-maps.json` `stages[id].name`에 두고 `tools/build-data.mjs stageDisplayName`이 읽는다. 한국어는 `public/i18n/ko/manual.json`(규정 타일 이름 「은신 모듈」·「최적화 모듈」은 KR 표에 없어 KR 말투로 — 隐匿 → 은신, 模块 → 모듈), 영어는 `tools/i18n/fallback-remake.json`. 이름 없는 전장은 2026-11-15까지 브리핑 카드에 `act3autochess_m01` 같은 ID를 보였다. 공식 규정 브리핑엔 이름 줄이 없지만 규정 카드도 맹약처럼 이름 줄을 둔다(관리자 결정 2026-11-15: 어느 맵인지 바로 보이고 두 시즌 화면이 같다).
  재발 방지: 원인 제거 — `stageDisplayName`이 조사 목록에 이름이 없는 전장에서 ID로 떨어지지 않고 빌드를 멈춘다(`--no-research`만 ID).
- 브리핑 왼쪽 열(관리자 결정 2026-10-11, 오른쪽 맹약 열과 높이 맞춤): 위에서부터 적 정보 블록(제목·보스·특훈 적) → 전장 카드(라벨과 이름 한 줄, 그 아래 가로
  미리보기). 전장 카드가 열의 남은 높이를 다 차지하고 그림이 그 높이를 채워(`object-fit: cover`), 왼쪽 열 끝이 맹약 열 끝과 같다(1920 × 1080·844 × 390, 보스
  글 길이와 상관없이). 그림 최소 높이 1.82rem(≈ 카드 안쪽 폭 / 3.2)이라 상자가 띠보다 넓어지지 않는다. 그림이 없으면 예전 한 줄 카드. 넘치면 열이 스크롤.
  테스트 `test/map-previews.test.js`(도구 상수·연결만 — 그림은 Chrome과 추출물이 있어야 함).
- 적 정보는 공식 정보 화면대로(관리자 요청 2026-10-11 「공식 UI가 있으면 그거 쓰고」): 제목 줄 `enemy_title`(`img_group_title` + `img_title_icon_enemy`,
  글 「敌方情报」), 보스 칸 `panel_boss`(213 × 208 `img_boss_bkg` 안에 165 아이콘, 그 아래 `img_boss_name_bkg` 이름표 #ffae13 — 공식 이름표 글은 모름, 우리는
  「第 N 回合 · 最终攻势」, 오른쪽에 이름·능력 목록 — 글자는 관리자 요청으로 공식보다 한 단계 크게: 이름 31·능력 17 단위). 예전 upstream 주황 실루엣 원은 뺐다.
- 특훈 적: 공식은 `panel_enemy`(`img_normal_enemy_bkg`) 위 140 × 195 아이템(아이콘 128 + 이름 21, 설명 글 없음)인데 너무 휑하다는 관리자 의견으로, 보스 아래
  가로 3칸 카드(관리자 결정 2026-10-11): `img_content_bkg` 타일 + 보스 이름표의 주황 위쪽 선, 아이콘은 보스와 같은 `img_boss_bkg` 틀, 이름 #f4f4f4는
  「特训敌人·」 앞말을 뺀 종류만(게임 안 적 서랍 `enemyDrawer.js`와 같은 방식, 전체 이름은 툴팁), 설명은 `text_desc`처럼 60 %. 머리글 「SPECIAL ENEMIES 特训敌人」.
  공식 화면은 보스와 특훈 적이 한 줄(670 + 486)이지만 우리 열이 좁아 보스 아래로 내렸다. 글자 크기는 화면 비율대로(px 하한 없음 — 폰에서도 스크롤 없이 들어감).

## 결산 대미지 · 연합 방어 탭 (2026-10-12, 관리자 결정)
- 공식에 없는 기능(`feat`). 관리자 요청 2026-10-12: 「결산화면에 오퍼레이터별로 보스에게 데미지를 입힌 수치를 그래프로」, 이어서 「동맹 유저가 놓친 적들을
  누가 얼마나 많이 잡아줬는지도」, 「보스별 데미지와 전체 데미지도 같이」. 시안 세 개(카드 안 막대·탭 분리·플레이어별 누적 막대) 중 탭 분리로 진행.
- 화면(`public/js/screens/resultCharts.js`, 계산은 `public/js/ui/gameLogic/resultCharts.js`): 결산 오른쪽 머리가 「同盟成员 | 伤害 | 联防」 탭이 된다.
  결과에 오퍼레이터별 수치가 없으면(옛 결과·옛 통계 기록) 지금처럼 머리글만.
  - 伤害: 오퍼레이터 한 줄에 판 전체 「造成伤害」와 「领袖伤害」를 나란히. 리더는 합계 / 최종 공세 / 히든 코어(히든 코어를 치른 판에만 고르는 칸).
    두 값은 크기가 열 배 넘게 차이 나서 열마다 막대 길이를 따로 잰다(한 축에 그리면 리더 막대가 안 보임). 기본은 리더 합계 순(관리자 결정),
    열 머리를 누르면 그 열로 정렬하고 정렬하지 않은 열은 흐리게. 위 막대: 리더 HP를 플레이어 몫으로 나눈 것(입힌 대미지 순이면 동맹 입힌 대미지 몫),
    남은 HP는 빗금. 솔로는 막대 없이 「领袖生命值 400万 / 400万 · 已击败」 글자만(관리자 결정). 상위 10명, 「显示全部」.
  - 联防(협동만, 솔로는 탭을 숨김 — 관리자 결정): 연합 방어 횟수 · 넘어간 적 · 동맹이 처치(%) · 돌파, 「协助方 / 受助方」 둘 다(관리자 결정),
    오퍼레이터별 처치 순위(상위 8). 受助方 막대 = 넘어간 적: 처치한 플레이어 색 칸 + 「其他」(오퍼레이터 외) + 빗금(돌파).
  - 소환물이 준 대미지·처치는 소환한 오퍼레이터에 합치고 「含召唤物」(관리자 결정). 판매된 오퍼레이터도 나오고 흐리게 「已出售」.
  - 결산 화면의 토스트(`html.sp-result`)는 화면 위 가운데가 아니라 왼쪽 큰 제목 칸 위(로고 자리)에, 그 칸 폭까지만 뜬다. 위 가운데의 토스트가 탭 줄을
    덮어 「대미지」·「연합 방어」가 눌리지 않았다(관리자 제보 2026-10-12 — 토스트는 눌러서 닫는 것이라 클릭을 가져감). 실제 앱 협동 방 + 디버그 승리로
    재현·확인(1920·1280·844×390).
  - 플레이어 색: 채팅에서 고른 맹약 색(`shared/local.js CHAT_FACTIONS`, 채팅에 보이는 그대로 — 관리자 결정), 안 고른 플레이어·AI(고를 수 없음)는
    기본 4색을 좌석 순서대로. 앞 좌석 색과 가까우면(OKLab 색차 × 100 < 15: 같은 맹약, 그리고 8색 중 쉐라그–에기르·염국–라테라노·염국–빅토리아·
    사르곤–빅토리아·쉐라그–시라쿠사·에기르–시라쿠사) 뒤 좌석이 기본색. 기본색도 쓰인 맹약 색과 가까우면 다음 기본색, 넷 다 가까우면 보라(맹약에 없는 색).
    좌석 순서로 정한다(관리자 결정: 누가 봐도 같은 색). 기본 4색끼리는 어두운 결산 배경에서 색약 구분을 검사한 묶음. 동맹 멤버 카드의 전략 줄 앞에 같은 색 점.
- 데이터(`server/match/unitTally.js`): sim이 유닛마다 리더 풀에 들어간 피해(`stats.boss`, `damage.js` — 플레이어 `bossDamage`와 같은 자리)와
  연합 방어에서 다른 플레이어가 놓친 적의 처치(`stats.assist`, 놓친 플레이어별 — `sourcePlayerId`가 있고 그 전장이 예약한 적 `inTotal`만, 분열체·
  소환된 적은 빼서 「넘어간 적」을 넘지 않게)를 세고, 결과 `unitStats`에 `boss`·`assist`·`ownerUid`(전투 중에 생긴 유닛의 가장 가까운 보드 소환자)를 싣는다.
  라운드 정산(자기 전투·연합 방어)과 보스 라운드 끝마다 오퍼레이터(기본 체스 ID, 자선은 charId — 정예화·재구매해도 한 줄)별로 판 전체를 모아
  `m.result`의 `players[].units`(최대 24줄)·`unite { sent, through }`·`faction`, `bossPools { final, hidden: { maxHp, dealt } }`, `uniteRounds`로 보낸다.
  새 필드는 `stats` 밖에 둔다(评语 계산과 골든 다이제스트가 `stats`를 읽음 — 이 변경으로 다이제스트는 그대로, `GOLDEN_FULL` 확인).
  - 넘어간 적 = 연합 방어에 다시 들어간 적 + 못 들어간 적, 돌파 = 생명으로 청구된 생존 수(라운드 상한 전). 카드의 「未击倒」(`stats.leaks`)와는 다르다
    (연합 방어가 안 열린 라운드의 누수까지 셈).
  - [ASSUMED] 오퍼레이터가 쓰러뜨리지 않은 적(지형 등)은 처치로 세지 않는다(受助方의 「其他」).
  - 리더 대미지 보정: 브라우저가 돌리는 보스전은 공유 풀의 자기 복제본으로 세므로, 두 필드가 마지막 타를 동시에 치면 남은 HP를 둘 다 센다(서버는 한 번만
    인정). 그 라운드에 풀이 그 플레이어에게 인정한 값보다 오퍼레이터 합이 크면 같은 비율로 줄여, 막대 합이 카드의 「领袖伤害」를 넘지 않게 한다.
    입힌 대미지·처치는 플레이어 합계와 같은 보고에서 나오므로 그대로.
  - 채팅 맹약은 판이 끝나면 서버가 지우므로(`server/local-patch.js onMatchEnd`), 결과를 만들 때 `Match opts.factionOf`(로비 → `chatFactionOf`)로 읽어 싣는다.
  - 통계 페이지 기록(`public/js/ui/stats.js`): 상위 16줄 · unite · faction · bossPools · uniteRounds를 보관해 다시 보기에서도 탭이 나온다(압축된 기록은 없음).
- 확인: `test/match/result-units.test.js`(실제 매치 경로 — 클라이언트 전투, 서버 전투 + 히든 코어 — 합계 일치·연합 방어 처치 ≤ 넘어간 적·맹약;
  보정·소환 합산·정예/판매 한 줄·b.result 검사), `test/ui/result-charts.test.js`(색 배정 9⁴ 경우 전부, 순위, 흐름, 통계 기록).
  모의 화면(`/dev/game-mock.html?phase=RESULT`, `&variant=hidden`)을 Windows Chrome 1920·1280에서 세 탭·정렬·라운드 전환 확인(가로 넘침 없음, 콘솔 오류 없음).
  모의 화면은 언어를 바꾸지 않아 중국어로만 봤다 — 한국어 문구와 실제 판의 결산은 [화면 미확인].

## 랜덤 매칭 (2026-10-13, 관리자 결정)
- 공식 게임에 있는지는 확인하지 않은 우리 기능이다(upstream 설계는 매칭 큐를 v1 범위 밖으로 뺐다, `docs/design/overview.md`). 기존 방 만들기·코드 참가는 그대로 두고, 협동 로비에 「랜덤 매칭」 버튼을 더했다.
- 2026-10-15부터 큐는 **난이도 × 규칙 모드**(관리자 결정: 판 사람들의 규칙이 같아야 하므로, 이 파일 「규칙 모드 — 클래식·캐주얼」): `room.queue { difficulty, ruleset? }`(없으면 클래식), 새로 만드는 방은 큐의 규칙 모드. `room.queueState`·`room.matchFound`에 `ruleset`. 로비의 모든 박사(판 중이 아닌)에게 `lobby.queueCounts { counts: { [규칙 모드]: { [난이도]: 사람 수 } } }`(대기 중 항목만, 수락 중인 그룹 제외; 바뀔 때만, 최대 1초에 한 번 `countsMinGapMs`; 접속(hello)·판이 끝나 돌아올 때 한 번). 로비 「규칙」 스위치의 클래식 / 캐주얼 옆에 그 규칙의 대기 인원 합, 「연합 매칭」의 난이도 카드마다 「n명 매칭 중」, 협동 방 방장의 「빈자리 매칭」 버튼에도 그 방의 난이도 × 규칙 모드 큐 대기 인원 배지(숫자만, 툴팁은 그대로; 관리자 요청 2026-10-15 — 방에 있는 박사도 판 중이 아니면 `lobby.queueCounts`를 받음)(관리자 결정 2026-10-15: 규칙 모드 × 난이도로 보임; 같은 날 관리자 요청으로 앞의 「박사」를 뺌). 로비 대기 인원은 Windows Chrome 확인 2026-10-15(데스크톱·휴대폰 가로), 실제 사람 4명이 규칙 모드별로 모이는 것은 [화면 미확인].
- 관리자 결정(2026-10-13): ① 큐는 **난이도별**로 나눈다. ② **항상 사람 4명이 모여야 시작**한다(처음 결정 「오래 기다리면 AI로 채워 시작 / 2명 이상이면 시작 중 고름」은 같은 날 철회: 60초가 큐에 들어간 때부터 세어져 사람마다 다르게 보였다). ③ 4명이 모이면 **수락 단계**를 둔다. ④ **협동 방의 빈자리를 랜덤 매칭으로 채운다**(처음엔 보류했다가 같은 날 요청): 아는 사람과 방을 만든 뒤 방장이 별도 버튼으로 큐에 넣는다 — 2026-11-20 관리자 결정으로 지움(`room.queueRoom` 없음), 공개방이 그 일을 한다(아래 「공개방」).
- 서버 `server/matchmaking.js` `Matchmaker`(규칙 전체는 파일 머리말, `server/lobby.js`가 메시지와 접속·방 이벤트를 넘김):
  - 큐 항목은 혼자 들어온 사람뿐이다(2026-11-20부터; 그 전에는 방 하나도 항목이었다). `room.queue { difficulty }`로 혼자 들어간다. 로비 방에 있으면 방을 떠나고(`room.create`와 같음), 판 중이면 `ROOM_STARTED`. 다른 난이도로 다시 보내면 그 큐 맨 뒤로 옮긴다.
  - `room.unqueue`로 나간다(`left`). 큐가 바뀔 때마다 대기자 모두에게 `room.queueState { queued, difficulty, count, waitedMs }`(`count` = 그 난이도에서 기다리는 사람 수), 빠질 때는 `{ queued: false, reason }`(`left`·`declined`·`timeout`·`offline`·`restarting`·`full`·`room`). 방 항목이 있던 때의 `party`·`partyDeclined`·`partyTimeout`·`changed`와 `by`는 2026-11-20에 없어졌다.
  - 그룹은 언제나 사람 4명. 큐 순서대로 앞의 넷을 고른다. 연결이 끊긴 사람과 공개방 제안에 답하는 중인 사람은 건너뛴다.
  - 그룹이 생기면 사람마다 `room.matchFound { players, accepted, mine, inMs }`, `room.queueAccept { accept }`를 `queueConfirmMs`(15초) 안에. 모두 수락하면 준비 확인 없이 바로 새 협동 방에서 판을 시작한다(큐 순서대로 앉고 첫 사람이 방장). 거절하거나 시간 안에 답하지 않은 사람의 항목은 큐에서 빠지고, 다른 항목은 원래 순서·대기 시간 그대로 큐 앞으로 돌아간다.
  - 혼자 대기 중 연결이 끊기면 그룹에 넣지 않고 `queueGraceMs`(10초) 뒤 큐에서 뺀다. 그 안에 다시 붙으면 자리를 지키고 상태를 다시 받는다. 재접속 창이 끝나면 바로 뺀다. 공개방 목록·초대 링크·키로 방에 앉거나 방을 직접 만들거나 관전석에 앉은 사람은 그때 큐에서 빠진다(`room`; `Lobby.join`·`Lobby.create`·`Lobby.spectate` → `onSeated`, 새 방의 상태가 큐를 다시 훑기 전에 — 수락 대기 중인 그룹이면 거절로 쳐서 나머지는 큐 앞으로).
  - 한 네트워크의 혼자 대기자는 `maxQueuedPerAddr`(4)까지(인터넷 접속만, `ERR.RATE`). 8인 대기열에 들어갈 때는 그 두 배(8)까지 — 한 네트워크에서 8명이 다 올 수 있게(관리자 결정 2026-10-19; 세는 것은 모든 대기열 합). 배포 카운트다운의 마지막 5분에는 큐 등록과 매칭 시작을 막는다(`ERR.RESTARTING`, 완성된 그룹은 `restarting`으로 해산). 큐는 메모리에만 있어 서버 재시작 때 사라진다. 배포 카운트다운을 건너뛰는 기준(방 단위)에는 혼자 대기자가 들어가지 않는다.
- **빠른 매칭**(快速匹配, 관리자 결정 2026-11-07): 규칙 모드와 인원에 상관없이 난이도(와 시즌)만 보고 기다리는 혼자 항목이다. `room.queue { difficulty, quick: true, season? }`(ruleset·size는 무시). 같은 난이도·시즌의 대기열 전체가 한 풀이고, 풀의 어느 대기열이 바뀌든 다음 차례로 그룹을 만든다(`server/matchmaking.js` 머리말 「快速匹配」, `tryPool`·`pickWith`).
  - ① 일반 대기열(클래식/캐주얼 × 4인/8인)을 가장 오래 기다린 항목이 있는 대기열부터 본다. 그 대기열 사람을 되도록 많이 쓰고, 모자란 만큼만 오래 기다린 빠른 매칭 박사로 채운다. 8인 대기열도 채운다. ② 그다음 빠른 매칭 박사끼리 4명이 모이면 **클래식 4인** 방을 만든다.
  - 그룹의 규칙 모드와 인원은 그 일반 대기열의 것이다. 자리는 일반 박사가 먼저, 빠른 매칭 박사가 뒤에 앉는다(새 방의 방장은 일반 박사).
  - 8인 대기열의 「바로 시작」 투표에는 들어가지 않고 제안도 못 한다(`BAD_TARGET`). 빠른 매칭 박사가 든 8인 판은 정확히 8명이 모일 때만 생긴다.
  - **커스텀 방의 빈자리 매칭**(관리자 결정 2026-11-07)은 2026-11-20에 「빈자리 매칭」과 같이 지웠다. 빠른 매칭 박사만 커스텀 방에 들어가는 규칙은 공개방이 이어받는다(아래 「공개방」).
  - 메시지: 빠른 매칭 항목의 `room.queueState`에는 `quick: true`가 붙고 ruleset·size가 없으며, `count`는 그 풀에서 기다리는 사람 전체다(수락 중인 그룹은 뺌). `room.matchFound`는 그룹의 ruleset·size를 싣고, 빠른 매칭 박사에게는 `quick: true`를 더한다(수락 창에 정해진 규칙·인원을 보이기 위해). `lobby.queueCounts`에 `quick: { [난이도]: 사람 수 }`(빠른 매칭 대기열만 셈, 다른 시즌은 `seasons[id].quick`)가 더해진다. 일반 대기열의 숫자는 그대로이고, 빠른 매칭 쪽 화면에는 그 난이도 전체(빠른 매칭 + 모든 일반 대기열)를 보인다.
  - 한 네트워크 제한은 4인 대기열과 같은 `maxQueuedPerAddr`.
  - 화면(입구, 대기·수락 창의 규칙·인원 표시)은 아직 없다. 새 로비 허브의 협의 선택 화면과 같이 들어간다 [화면 미확인].
  - 확인: `test/lobby-matchmaking-quick.test.js`(실제 서버·StubMatch: 빠른 매칭 4명 → 클래식 4인, 캐주얼 3 + 빠른 1 → 캐주얼·일반 박사가 방장, 일반 대기열 먼저(캐주얼 1 + 빠른 3, 해산된 빠른 매칭 그룹이 8인 대기열을 채움 — 차례를 뒤집으면 실패함을 확인), 가장 오래 기다린 대기열 먼저, 8인 대기열 6 + 빠른 2, 투표 제외·제안 거부, 빠른 매칭 박사의 거절, 빠른 매칭 ↔ 일반 대기열 이동, `lobby.queueCounts`의 `quick`; 대기 방·커스텀 방의 경우는 2026-11-20에 지움).
- 로비 진입(2026-10-13, 관리자 요청 「열려 있는 다른 포크 서버의 UI를 따라」, 그 서버 화면 캡처 기준): 방식 카드가 셋 — 단독 시뮬레이션 · 연합 시뮬레이션 · **연합 매칭**(同盟匹配, ALLIANCE MATCHMAKING, 신호 막대 아이콘). 문구 「혼자 공개 매칭에 들어가 다른 박사들과 동맹을 맺은 뒤 시뮬레이션을 시작합니다.」, 요점 「혼자 참가 · 팀원 자동 매칭」 「사람만 매칭 · 4명이 모이면 시작」(그 서버의 「仅匹配真人 · 满四人后开始」; 결정 ②를 바꾸기 전에는 「오래 기다리면 AI 보충 선택」이었다). 이 카드를 고르면 오른쪽 큰 버튼이 「매칭 시작」이 된다(처음 구현의 별도 버튼은 오른쪽 칸이 길어져 스크롤이 생겨 뺐다).
- 접속자 수(같은 요청): 핑 오른쪽에 「👥 N 접속」(`components.js OnlinePill`, 로비; 타이틀에서는 2026-10-13에 뺐다 — 「휴대폰 화면 조정」의 연결 줄 항목). 서버 `pong`의 `n` = 지금 소켓이 붙어 있는 세션 수(`server/net.js onlineCount`, 1초에 한 번만 셈) — 타이틀·로비·방·판·관전 모두 포함, 끊겨서 재접속을 기다리는 세션은 뺀다. 핑(4초마다)과 같이 갱신.
- 클라이언트 `public/js/ui/matchQueue.js`: 로비의 「연합 매칭」 카드 + 「매칭 시작」(선택한 난이도). 혼자 대기 창은 기다린 시간·대기 인원(`n/4`)·「박사 4명이 모이면 시작합니다」·취소. 그룹이 생기면 수락 창(카운트다운, 사람 수, 수락 수, 수락·거절) — 로비와 방 화면 둘 다. 판의 `room.state`가 오면 닫히고 평소 방·판 화면으로, 새 서버 세션의 welcome이면 지운다. 큐에서 빠진 이유는 토스트(직접 나가거나 거절한 경우는 없음; `party` 「{이름} 박사가 매칭을 취소했습니다」, `partyDeclined` 「{이름} 박사가 수락을 거절해 매칭이 취소되었습니다」, `partyTimeout` 「동맹의 박사가 시간 안에 수락하지 않아 매칭이 취소되었습니다」, `changed` 「{이름} 박사가 동맹을 떠나 매칭이 취소되었습니다」; `by`가 없으면 이름 없는 문구), 그룹이 해산돼 큐로 돌아오면 「수락하지 않은 박사가 있어 매칭을 계속합니다」.
- (2026-11-20 지움 — 아래 「공개방」) 방 화면 `public/js/screens/room.js`: 협동 방 방장(사람 4명 미만)에게 「빈자리 매칭」(신호 아이콘; 다른 박사가 준비 전이면 비활성, 툴팁 「랜덤 매칭으로 박사를 찾아 빈자리를 채웁니다(AI 팀원은 빠집니다)」). 그 사이 「오퍼레이터 설정」과 위아래로 겹쳐 놓는다(셋을 나란히 두면 1600×900에서 오른쪽 칸이 넘쳐 가운데 상태 줄을 덮었다). 이 두 단 묶음이 있으면 「시뮬레이션 시작」은 묶음 높이로 늘어 위아래 끝이 맞는다(관리자 요청 2026-10-15; `.room-bar__right--stack`, 두 단 1.08rem = 0.5 × 2 + 간격). 매칭 중에는 아래 줄 상태가 「빈자리 매칭 중 · m:ss · 대기 중인 박사: n/4」, 큰 버튼이 모두에게 「매칭 취소」, 빈자리 카드는 「랜덤 매칭 중」, 난이도는 읽기 전용(「매칭 중에는 바꿀 수 없음」), AI 추가 버튼은 숨김.
- 서버 부하: 큐 자체는 무시할 만하다. 매칭 판에는 AI가 없다.
- 확인: `test/lobby-matchmaking.test.js`(실제 서버·StubMatch: 4명 매칭·수락·시작, 난이도 분리·나가기·난이도 이동, 거절 뒤 재편성, 3명은 그룹이 안 됨, 방에서 큐로·판 중 거절, 큐에서 방을 만들거나 관전석에 앉으면 빠짐·그룹 해산, 수락 시간 초과, 끊김 유예·재접속; 방 큐의 경우들은 2026-11-20에 지움).
  Chrome(로컬 서버, 2026-10-13 처음 구현): 로비 버튼, 대기 창, 수락 창, 휴대폰 가로 대기 창·취소, 카드 셋·접속 수. 결정 ②·④ 반영 뒤(같은 날, Windows Chrome 1600×900·1280×720·휴대폰 가로 844×390): 2명 방(AI 1) → 준비 전 「빈자리 매칭」 비활성 → 「빈자리 매칭」 → AI 자리 비움·방장·팀원 아래 줄 매칭 상태·「매칭 취소」 → 로비에서 혼자 2명 큐 → 방 화면 수락 창 → 넷 수락 → 그 방(같은 코드, 방장 그대로)에서 판 시작, 휴대폰 가로 방 화면 버튼·매칭 상태·취소(가로 스크롤 없음), 카드 「사람만 매칭 · 4명이 모이면 시작」. 이름 표시 뒤: 3명 방에서 팀원이 취소 → 방장 토스트 「친구B 박사가 매칭을 취소했습니다」(누른 사람은 토스트 없음), 다시 큐 → 한 명이 나감 → 「친구C 박사가 동맹을 떠나 매칭이 취소되었습니다」. 실제 사람 넷의 판은 [관리자 화면 미확인].

### 공개방 (2026-11-20, 관리자 결정)
- 공식 클라에는 방 목록이 없다(`auto_chess_room_select_state`는 키 입력·초대뿐, 시안 조사). 우리 기능이다. 결정 내용과 시안: 관리자 노트의 공개방 시안(구현 명세). 서버 규칙 전체는 `server/lobby.js` 머리말 「공개방」·`server/matchmaking.js` 머리말 「공개방」.
- 용어(관리자 결정 2026-11-20, 시안 「답 열째」 6): 한국어 화면은 공식 KR 클라대로 房间 = **방**(群组 = 단체방, 群主 = 방장, 编号 = 방번호) — 「연합」은 모드 이름(联合模拟 = 연합 시뮬레이션)에만. 그래서 방 하나하나는 「공개방」, 비공개 방 안내도 「비공개 방」(빈 목록·확인 창 방장 줄·연합 시뮬레이션 안내의 「공개 연합」·「비공개 연합」을 고침). 영어도 room(en.json 문구, 공개방 만들기 머리의 장식 글자 `PUBLIC ROOM`). 다만 연합 매칭 **목록 머리**(公开联合)는 목록이라는 자리의 이름이라 「공개 연합」 — 영어 「Public alliances」, 장식 `PUBLIC ALLIANCES`(관리자 결정 2026-11-20, 시안 「답 열째」 7).
- **대기실 「빈자리 매칭」을 지운 까닭**: 공개방이 그 일 대부분을 한다(사람을 찾아 빈자리를 채움). 남는 차이 둘 — 큐 방은 다 차면 확인 뒤 저절로 시작, 큐에 있는 동안 설정이 잠김 — 중 앞의 것은 공개방의 「가득 차면 자동 시작」이 대신하고, 뒤의 것은 필요 없어졌다(공개방 방장이 설정을 바꾸면 목록이 바로 바뀌고 앉은 박사의 준비가 풀린다). 그래서 `room.queueRoom`·`room.state.matching`·`ERR.MATCHING`(대기실 잠금)이 없어지고, 큐는 혼자 든 박사만 남는다.
- 공개 표시: 기본 **비공개**. `room.create { public: true }`(협동만, 1인 방은 `BAD_MSG`) 또는 대기실에서 방장이 `room.setPublic { on }`(판 중에도 됨 — 진행 중인 공개방은 목록에 「진행 중」으로). `room.state.public`.
- 목록: 연합 매칭 화면이 열린 동안 `lobby.watchRooms { on }` → `lobby.rooms { rooms }`(구독할 때 한 번, 그 뒤 바뀔 때만 통째로, 최대 1초에 한 번). 모든 시즌의 공개방(대기실·판 중), 비공개 방과 `playerId`는 절대 안 실림 — 방장은 이름과 「#번호」(`shared/doctorNo.js`, 대기실·팀원 정보 창과 같은 번호). 방 한 줄: `code`·`season?`·`host { name, no }`·`difficulty`·`ruleset { preset }`·`custom?`(커스텀 방의 설정)·`size`·`seats [{ kind: human|bot|empty, host?, card?, skin? }]`(`host`: 방장 자리 — 목록의 왕관; `skin`: 그 박사가 명함 오퍼레이터에 고른 스킨, 대기실 좌석 카드가 입는 `seats[].skins`의 그 몫)·`state: lobby|match`·`round?`·`spectators`·`spectatorSeats`·`since`(공개로 바꾼 때와 판이 끝나 돌아온 때 중 늦은 것). 허브 입구의 「공개방 N」은 `lobby.queueCounts.rooms { [시즌]: 대기실인 공개방 수 }`를 모든 시즌 더한 값(관리자 결정 2026-11-20 — 목록이 모든 시즌의 방을 보이므로; 클라는 `ui/matchQueue.js` → store `ui.queueRooms`).
- 목록의 「참가」 = `room.join`(확인 없음). 큐에 있던 박사는 그때 큐에서 빠진다(`room`).
- 매칭 후보: 같은 시즌(`room.queue { anySeason: true }`면 모든 시즌 — 아래 「매칭 대상 시즌」)·난이도, 대기실, 방장 접속 중, 빈자리 또는 AI 자리(다른 제안이 잡지 않은 것), 그 박사가 10분 안에 강퇴되지 않음, 그 방을 5분 안에 거절하지 않음. 정밀 매칭은 규칙 프리셋·인원까지 같아야 하고, 빠른 매칭은 난이도만 — 커스텀 공개방은 빠른 매칭 박사만 받는다.
- 순서: 큐 사람만으로 그룹이 바로 차면 그 그룹이 먼저. 아니면 남은 대기자를 오래 기다린 순으로, 맞는 공개방 중 사람이 가장 많은 방(같으면 먼저 공개된 방)에 제안한다. 큐가 바뀔 때, 공개방이 생기거나 설정이 바뀌거나 자리가 나거나 방장이 돌아오거나 판이 끝날 때 다시 훑는다.
- 제안: 그 박사에게만 `room.matchFound`(`room { code, host, ruleset, custom?, size, seats }`, `players` 1), `room.queueAccept`로 15초. 제안 하나가 그 방 자리 하나를 매칭 쪽에만 잡는다(목록 참가는 막지 않음). 수락 → `room.join`과 같은 길로 입장, 큐에서 조용히 빠짐; 그 사이 찼거나 시작했으면 그 거절 코드(`ROOM_FULL` 등)가 답이고 큐에 그대로(건너뜀 없음). 거절·시간 초과 → 큐에 남고 그 방만 5분 건너뜀(사람 그룹 거절이 큐에서 빼는 것과 다름). 5분이 끝나면 `Matchmaker.refuseOffer`의 타이머가 자기가 건 건너뜀을 지우고 큐를 다시 훑는다 — 건너뜀 끝은 `lobby.now()`(벽시계)로 재는데 Node 타이머는 이벤트 루프가 캐시한 시각부터 세어 부하가 있으면 그 끝보다 먼저 울리므로, 끝 시각만 보고 고르면 「아직 건너뜀」으로 남고 다시 훑을 일이 없어 그 방을 다시 권하지 않았다(공개 CI의 전체 실행에서 드러남). 재발 방지: `test/lobby-public-rooms.test.js` 「the skip timer ends its own skip」. 방이 비공개가 되거나 설정·판 시작·없어짐으로 안 맞게 되면 제안을 거둔다(`room.queueState` queued:true). 제안이 도는 동안 그 박사에게는 `room.queueState`를 보내지 않는다 — 클라는 그것을 받으면 확인 창을 닫는데 서버는 제안을 쥔 채 시간이 끝나면 거절로 쳐 그 방을 건너뛴다(같은 큐에 다른 박사가 들거나 끊긴 박사의 유예가 끝나 큐 상태를 다시 보낼 때 일어났음). `Matchmaker.broadcastQueue`가 제안을 쥔 항목을 건너뛰고, 그 박사의 대기 인원은 제안이 끝날 때 보낸다. 재발 방지: `test/lobby-public-rooms.test.js` 「holding an offer」.
- AI 비켜 주기: 공개방에 빈자리가 없고 AI 자리가 있으면, 들어오는 박사(매칭·목록·키)에게 가장 늦게 넣은 AI가 자리를 내준다. 비공개 방의 AI 자리는 지금처럼 찬 자리.
- 강퇴 재입장: `room.kick` 뒤 10분 동안 그 박사의 그 방 `room.join`은 `ERR.KICKED`(공개·비공개 모두), 그 방은 그 박사의 목록·매칭에서 빠진다. (2026-10의 「차단 없음」을 바꿈.)
- 가득 차면 자동 시작: `room.setAutoStart { on }`(방장, 공개방만 — 아니면 `BAD_TARGET`; 비공개로 바꾸면 꺼짐) — 「빈자리 매칭」의 저절로 시작을 대신하므로 공개방에서만(구현 명세의 판단, 시안 줄에서 관리자에게 보임). 모든 자리가 차고(AI 포함) 방장 말고 모두 연결·준비면 10초 세고(`room.state.autoStartAt`, 서버 시각) 시작과 같은 길. 준비 해제·나감·설정 바꿈이면 멈추고, 다시 차고 준비되면 새로 센다. 연합 매칭에서 만든 공개방(목록의 「공개방 만들기」, 매칭 대기 창의 「공개방으로 열고 기다리기」)은 **켜진 채로** 만들어진다(관리자 결정 2026-11-20 — 처음엔 목록에서 만든 방은 꺼짐이었다가 같은 날 넘긴 방과 같게 바뀜; 클라가 `room.create { public: true }` 뒤 `room.setAutoStart { on: true }`, `screens/lobby.js openPublicRoom`). 대기실에서 공개로 바꾼 방은 꺼진 채.
- 남용: 한 네트워크(인터넷 접속)의 `room.join`은 30초에 10번까지(`joinRateMax`·`joinRateWindowMs`, 넘으면 `ERR.RATE`; 실패한 시도도 셈 — 공개방 키는 목록에 있으니 키를 맞히려는 반복만 막음).
- 드레인 인계: `public`·`publicSince`·`autoStart`·AI 넣은 차례·남은 강퇴 기록을 싣는다. 강퇴 기록은 `playerId`로 남는데, 강퇴된 박사의 세션은 넘어가지 않아(방에 없음) 새 서버에서는 사실상 풀린다.
- 화면(관리자 결정 2026-11-20, 시안 A 목록형·필터 F2·공개 토글 T3; 구현 명세는 관리자 노트의 공개방 시안):
  - **연합 매칭 목록**(`public/js/ui/publicRooms.js`): 「시뮬레이션 선택」(연합 매칭)의 왼쪽 그림·설명을 흐리게 하고 그 위에 목록. 열려 있는 동안 `lobby.watchRooms`(다시 붙으면 다시 구독), `lobby.rooms` → `ui.publicRooms`. 줄마다 모드 캡슐(대기실 모드 막대와 같은 부품 `ui/modeCapsule.js`, 공식 `group_mode` 그림) · 방장 「이름 #번호」와 그 아래 「매칭 대상」(지금 고른 시즌·난이도·규칙·인원·빠른/정밀로 매칭이 고를 방, 민트 테두리)·「빠른 매칭 대상」·커스텀 방의 「커스텀 · 규칙 N개 다름 ▾」(누르거나 마우스를 올리면 다른 규칙 줄 `CustomRulesInfo`와 「전체 설정 보기」 = 읽기 전용 커스텀 설정 창; 목록 틀에 띄워 스크롤 칸에 잘리지 않고, 아래 자리가 모자라면 위로 — 펼친 모습은 [화면 미확인]) · 자리(명함 오퍼레이터 아바타 — 그 박사가 고른 스킨을 입음(`skin`, 다른 박사 것이라 「다른 플레이어 스킨」이 켜져 있고 스킨 자료를 받았을 때만, 대기실 좌석 카드와 같음; 2026-11-20 전엔 기본 그림), 없으면 사람 아이콘 — 목록엔 `playerId`가 없어 기본 명함을 못 고름; AI·빈자리, 방장 왕관; 캡슐과 같은 높이; 매칭 제안 확인 창의 자리도 같은 부품) · 「대기 n분」/「진행 중 · n라운드」 · 「참가 n/인원」(`room.join`, 확인 없음; 찬 방은 비활성)과 관전(`room.spectate`). 지금 시즌 방이 위(매칭 대상 → 빠른 매칭 대상 → 나머지, 대기실 → 진행 중), 다른 시즌 방은 시즌마다 구분 줄 「<시즌> · 다른 시즌 · 참가하면 「<시즌>」 시즌으로 바뀝니다」 아래, 캡슐 앞에 시즌 칸. 참가하면 초대 링크처럼 클라 시즌이 방 시즌으로 바뀐다(`ui/season.js installSeasons`). 표 머리 없음, 방 표시 문구 없음(보류).
  - **필터 F2**: 시즌 드롭다운(로비 시즌 칩과 같은 모양 — 모든 시즌 / 시즌마다 「방 N」·「지금 시즌」 표시; 목록을 거르고 매칭 대상 시즌도 정함 — 아래 「매칭 대상 시즌」, 클라 시즌은 안 바꿈) + 켬/끔 「매칭 대상만」(드롭다운 시즌의 매칭 대상, 2026-11-20 처음엔 다른 시즌을 고르면 비활성)·「진행 중(관전)」. 휴대폰 가로(높이 520 이하)는 드롭다운 + 「필터 n」 단추가 켬/끔 둘을 펼침.
  - **매칭 대상 시즌**(관리자 결정 2026-11-20, 관리자 노트의 공개방 시안 「답 아홉째」 1–5 — 처음엔 드롭다운이 목록만 걸렀고 매칭·카드 숫자는 로비 칩 시즌): 목록의 시즌 드롭다운이 「매칭 시작」이 찾는 시즌도 정한다(`ui/publicRooms.js queueTarget`). 특정 시즌 = 그 시즌의 공개방 + 그 시즌 사람끼리 큐(`room.queue { season }`). 「모든 시즌」 = 공개방 후보만 모든 시즌(`anySeason: true`)이고 사람끼리 큐는 로비 칩 시즌 그대로. 드롭다운의 처음 값은 로비 칩 시즌이고 매칭 화면을 열 때마다 그 값으로(공개방 만들기에 갔다 돌아오면 그대로; `screens/lobby.js`). 로비 칩은 드롭다운을 따르지 않고, 다른 시즌 방에 앉을 때(제안 수락·그 시즌 큐의 판)만 초대 링크처럼 시즌을 바꾸고 알림(`ui/season.js installSeasons`). 서버: 같은 큐에 `anySeason`만 바꿔 다시 들면 자리는 그대로 두고 범위만 바꾼다. 다른 시즌 공개방이 생기거나 바뀌면 그 난이도의 `anySeason` 박사가 든 큐도 다시 훑는다(`server/matchmaking.js` 「공개방」). 드롭다운 아래 안내 「「매칭 시작」은 여기서 고른 시즌에서 찾습니다 · …」.
  - **매칭 대상 표시**(관리자 결정 2026-11-20, 관리자 노트의 공개방 시안 여섯째 판 「답 열째」 1·5): 「매칭 시작」 단추 둘째 줄(작은 글자, 이름은 굵게; `screens/lobby.js` `targetLine` → `ProtocolSelect` `sub`) — 「모든 시즌」이면 「**모든 시즌** 공개방 · **새 방** 칩 시즌」(맞는 공개방이 없으면 칩 시즌으로 새 방이 꾸려진다는 뜻; 「칩 시즌 박사」는 뜻이 안 와닿아 바꿈), 칩 시즌이면 「**시즌** 시즌」, 다른 시즌이면 「**시즌** 시즌 · 잡히면 시즌이 바뀝니다」. 대기 중에는 아래 대기 칸의 대상 캡슐이 이어 받는다(서버 `room.queueState`에 `anySeason: true` — 큐에 든 때의 대상이라 드롭다운을 바꿔도 그대로).
  - **난이도 카드**: 「대기 N」 옆 「방 N」. 둘 다 드롭다운을 따른다: 「방 N」 = 드롭다운 시즌의 그 난이도 대기실 방 수(「모든 시즌」 = 모든 시즌 합), 「대기 N」과 규칙·인원 줄의 대기 수 = 위 큐 시즌의 사람(「모든 시즌」 = 로비 칩 시즌). 허브 입구 「대기 N명」은 로비 칩 시즌 그대로. 휴대폰과 고른 카드는 「N · 방 N」 배지 하나(휴대폰은 둘이면 고른 카드 이름이 잘림; 데스크톱 1600×900 고른 카드는 머리가 「선택됨」 도장 앞에서 끝나 둘이면 「방 N」이 도장 고리 밑으로 들어감 — `lobby.css` `.pcard.is-on .pcard__head.has-both` — `:has()`는 Firefox ESR 115·Safari 15.4 전이 무시해 클래스로).
  - **대기실 공개 토글 T3**(`screens/room.js PublicToggle`): 바닥 줄 시작 단추 앞, 공식 난이도 선택 창의 매칭 범위 알약(`btn_range_switch`, 트랙 237×50 — 고른 칸 흰 알약에 아이콘 26 + 이름 19 #242424, 안 고른 칸은 회색 아이콘 23만)을 모드 막대와 같은 1280×720 단위로 높이 50, 막대 57과 세로 가운데. 방 만들기 「공개」 줄과 한 부품(`screens/lobby.js PublicSwitch`, 대기실은 `fold` — 관리자 결정 2026-11-20): 트랙 너비는 두 상태 모두 178 단위(비공개 상태의 너비; 공식 237이면 1600×900에서 모드 막대의 난이도 이름이 잘림), 고른 칸이 다른 `.rtrack`처럼 `flex-grow`로 3분의 2까지 늘어나고, 안 고른 칸 이름은 DOM에 남은 채 너비 0으로 접혀 바꿀 때 너비가 툭 바뀌지 않는다. 아이콘은 두 곳 모두 그 칸 글자 색(공식 알약처럼, 호박색 아님). 「비공개」(자물쇠) | 「공개」(신호). 방장만 바꿈(`room.setPublic`), 다른 박사는 읽기 전용. 터치는 칸마다 위쪽으로만 44px(`devices.css`). 공개방 방장의 상태 줄은 「공개방 · 연합 매칭 목록에 보이고, 조건이 맞는 박사가 매칭으로 들어옵니다」. 공식 대기실에는 이 토글이 없다(공식 알약을 공식 크기로 빌림).
  - **두 입구를 공개 여부로 나눔**(관리자 결정 2026-11-20, 시안 다섯째 판 — 공개방 뒤로 두 입구의 경계가 흐려져서): 「연합 시뮬레이션」 = 비공개(초대 코드·AI 팀원) — 시뮬레이션 선택에 「공개」 줄이 없고(2026-11-20 처음 구현엔 있었음), 안내 「비공개 연합 · 만든 뒤 초대 코드로 친구를 부르거나 AI 팀원을 넣습니다」. 「연합 매칭」 = 공개방의 모든 것(목록 · 매칭 · 공개방 만들기). 허브 카드 툴팁(`MODE_CARDS.desc`)도 그 뜻으로: 연합 시뮬레이션 「초대 코드로 친구를 부르거나 AI 팀원과 함께하는 비공개 연합입니다.」, 연합 매칭 「공개방을 찾아 참가하거나, 자동 매칭하거나, 공개방을 열어 다른 박사를 기다립니다.」 비공개 방을 대기실에서 공개로 바꾸는 토글은 그대로.
  - **공개방 만들기**: 연합 매칭 목록 머리(시즌 드롭다운 앞, 늘 보임)의 「＋ 공개방 만들기」 — 필터 토글과 같은 알약(`.dpick__opt.pubrooms__tog`)을 목록의 행동색(「참가」의 호박색)으로, 시즌 칩과 높이·위아래가 같음(부품 단계 ③, 우리 부품 재사용). 공개방이 하나도 없으면 목록 가운데 「지금 열린 공개방이 없습니다」 + 안내 + 큰 「공개방 만들기」(필터로 다 걸러진 때는 예전 한 줄). 누르면 같은 시뮬레이션 선택 화면이 공개방 만들기로 바뀐다(`screens/lobby.js` `open` 'pa'): 머리 「공개방 만들기 PUBLIC ROOM」(신호 아이콘), 규칙에 커스텀 ⚙(연합 매칭과 달리 잠기지 않음), 인원, 왼쪽 설명에 커스텀 요약, 안내 「공개방 · 연합 매칭 목록에 보이고 매칭하는 박사가 들어옵니다」, 큰 단추 「공개방 만들기」 → `room.create { public: true }` + 자동 시작 켬. 매칭 화면의 난이도·규칙(클래식/캐주얼)·인원을 들고 오고, 뒤로(Esc) = 목록. 매칭 화면과 공개방 만들기는 한 창 안에서 내용만 바뀐다(`ProtocolSelect`의 같은 `key`) — 창을 새로 마운트하면 불투명 배경(`.modal.proto-veil`)이 투명에서 다시 페이드 인해(`modal-fade`) 오갈 때마다 허브가 잠깐 비쳤다. 재발 방지: `test/ui/public-rooms-ui.test.js` 「two entries by who plays」. 매칭 화면 안에서 커스텀을 고르는 안(시안 pb)은 안 함 — 큰 단추의 뜻이 상태에 따라 바뀌어서.
  - **대기 표시 W1**(관리자 결정 2026-11-20, 같은 시안 「답 열째」 2·3 — 전엔 화면 가운데 대기 창(모달)이 목록의 「참가」를 덮어 「대기 중에도 목록을 쓰고 참가하면 큐에서 빠짐」과 어긋났다): 연합 매칭 화면이 열려 있으면 대기는 창이 아니라 오른쪽 칸이다(`ui/matchQueue.js` `QueueWait`, `ProtocolSelect` `wait`): 안내 줄 자리에 「매칭 중에도 목록을 쓸 수 있습니다 · 목록에서 참가하면 매칭에서 빠집니다」(휴대폰은 안내 줄이 원래 안 보임), 정밀 스위치 자리에 「매칭 대상」 + 캡슐(목록 줄과 같은 `ModeCapsule` — 「모든 시즌」 칸은 흰 글자, 빠른 매칭이면 규칙 칸이 「빠른 매칭」이고 인원 칸 없음), 시작 단추 자리(같은 상자·테두리·사선, 바탕만 어두운 민트)에 시계 · 「박사를 찾는 중」과 「n/4 · 4명이 모이면 시작」(8인은 「n/8 · 5명부터 투표로 바로 시작」, 빠른 매칭은 「같은 난이도 n명 · 규칙·인원 상관없음」) · 「매칭 취소」. 그동안 규칙·인원 줄과 난이도 카드는 흐리게 잠긴다(`locked`, 바꾸려면 취소 뒤 다시). 확인 창·「바로 시작」 투표는 지금처럼 창(`MatchQueueDialog` `inline`이 대기 가지만 뺌). 화면을 닫았거나(뒤로) 대기 중에 다시 접속해 허브에 있으면 예전 대기 창이 그대로 뜬다 — 시안이 정하지 않은 곳이라 있던 것을 둠. 공식 매칭 화면(`auto_chess_matching`)은 화면을 막는 배너다 — 공식엔 공개방 목록이 없어서, 막지 않는 것은 일부러 다르다.
  - **매칭 대기 → 공개방**(`ui/matchQueue.js` `PUBLIC_OFFER_MS`): 큐는 사람이 정확히 4명(8명) 모여야 시작해 접속자가 적으면 기다리기만 하므로, 대기 칸은 **1분** 뒤 안내 줄이 호박색 「1분 넘게 모이지 않았습니다 · 공개방으로 열어 두면 같은 조건으로 매칭하는 박사가 들어옵니다」로 바뀌고, 상자 안이 시계 · 「공개방으로 열고 기다리기」(primary, 신호 아이콘, 취소와 같은 높이) · 아이콘만 남은 취소가 된다(8인 큐의 「바로 시작 제안」이 있으면 그것이 먼저). 대기 창(위의 화면 밖 경우)은 예전처럼 호박색 안내 줄과 「매칭 취소」 옆 단추. 누르면 `room.unqueue` → 그 큐의 조건(난이도·규칙·인원, 빠른 매칭이면 로비에 기억된 규칙·인원, 그 큐의 시즌)으로 공개방 → 자동 시작 켬: 다음에 매칭하는 박사가 그 방으로 들어오고 빈자리는 AI로 채울 수 있다. 로비 화면의 대기 창에만(`MatchQueueDialog` `onPublic`). 클라가 먼저 `room.unqueue`로 큐에서 뺀다(`openPublicRoom`; `left`라 토스트 없음). 서버도 `room.create`에서 만든 박사를 큐에서 빼지만(`room`, 위 「혼자 대기 중」 줄) 그 길은 「방에 참가해 매칭이 취소되었습니다」 토스트를 낸다.
  - **매칭 확인 창**(`ui/matchQueue.js`): `room.matchFound`에 `room`이 있으면 방장 「이름 #번호 박사의 공개방」·모드 캡슐(시즌 칸이 늘 앞에 — 관리자 결정 2026-11-20 「답 열째」 4: 「모든 시즌」으로 찾으면 어느 시즌인지가 늘 의미 있음; 시즌은 `room.matchFound` `season`)·자리·「수락하면 이 방에 들어가고, 시뮬레이션은 생성자가 시작합니다」, 페이지 시즌과 다른 시즌 방이면 호박색 「수락하면 「시즌」 시즌으로 바뀝니다」, 커스텀이면 설정 요약. 모드 줄 끝에 「모든 시즌」으로 찾았으면 「· 모든 시즌」. 캡슐은 시즌 칸만큼 넓어져도 줄지 않는다(`.queue-dialog__room .rs-mode { max-width: none }`, 목록 줄과 같음 — 없으면 난이도 이름이 잘림). 제안이 거절·시간 초과·철회로 끝나면 알림 없이 대기 창으로. 어떤 `room.state`든 받으면 큐 창을 닫는다(앉았음).
  - **「빈자리 매칭」 지움**: 대기실 단추·매칭 중 상태 줄·「매칭 취소」·잠금 표시(「매칭 중에는 바꿀 수 없음」)·「랜덤 매칭 중」 빈자리 카드·큐 이탈 이유의 파티 문구가 없어졌다.
  - **「AI 팀원은 마지막에 선택」**(관리자 결정 2026-11-20): 앉은 AI 팀원이 있을 때만 보이고(넣으면 나타나고 다 빼면 사라짐, 켜 둔 값은 서버에 남음), 높이는 옆 관전석 수 단추(`.specseats__btn`)와 같다.
  - **강퇴 확인 창** 문구: 「10분 동안 다시 들어올 수 없습니다」(`ERR.KICKED`).
  - **자동 시작 스위치**(관리자 결정 2026-11-20, `screens/room.js AutoStartToggle`): 상태 줄의 「AI 팀원은 마지막에 선택」 바로 뒤, 같은 부품(`.ailast > .dpick__opt.ailast__opt`, 같은 높이), 이름은 화면 크기와 상관없이 「자동 시작」. 공개 협동방의 **방장에게만** 보이고(다른 박사에게는 숨김), 마우스를 올리면 「자리가 다 차고 모든 박사가 준비되면 카운트다운이 끝난 뒤 시뮬레이션이 자동으로 시작됩니다」. 방장의 상태 줄은 켜져 있고 아직 세지 않는 동안 「자동 시작」만(지금 시작할 수 있어도). 서버가 세는 동안(`autoStartAt`)은 모두에게 모래시계 + 「n초 뒤 자동 시작」(서버 시각 보정 `serverNow`, 1초마다, 숫자는 tabular-nums).
  - **허브 「연합 매칭」 입구**(관리자 결정 2026-11-20, 시안 넷째 판 in-chip): 세 입구 카드 위 줄(「박사 1명 · 시간 제한 없음」 등)을 지우고, 연합 매칭 카드 안 왼쪽 위(오른쪽 위 신호 아이콘 맞은편, 아이콘 앞에서 멈춤)에 칩 둘 「대기 N명」(고른 시즌) · 「공개방 N」(모든 시즌 합). 칩은 예전 줄의 배지(`.hub-entry__wait`, 민트 바탕) 그대로, 0이면 그 자리에 흐리게(바탕 없이 흐린 테두리 — 난이도 카드 「방 N」이 0이면 `is-on`이 없는 것과 같은 규칙). 휴대폰(높이 520 이하)은 칩 글자를 예전 줄 크기 `.22·--t`(약 8.8px; 예전 배지는 `.13·--t` 그대로라 5px로 거의 안 읽혔음). 카드 크기는 그대로. 공식에 없는 부품(허브 입구가 우리 것) — 3단계(우리 부품 `.hub-entry__wait`).
- 확인: `test/ui/public-rooms-ui.test.js`(매칭 대상 계산·목록 순서·필터·카드 「방 N」, 드롭다운이 정하는 매칭 대상 시즌, 매칭 대상 표시·대기 칸 W1·잠금·확인 창 시즌 칸, 공개 토글, 두 입구(연합 시뮬레이션에 「공개」 줄 없음·공개방 만들기·`openPublicRoom`이 큐 빼기 → `public` 방 → 자동 시작 켬 차례·대기 창 1분), 자동 시작 스위치(방장만·남은 초·상태 줄 「자동 시작」), 허브 칩(`ui.queueRooms` 모든 시즌 합·0은 흐리게·카드 위 줄 없음), 목록 프레임 → 저장소·제안의 방·`room.state`로 큐 닫힘, 문구), `test/ui/ai-picks-last.test.js`(AI가 앉았을 때만·관전석 단추와 같은 높이 규칙), `test/lobby-public-rooms.test.js`(실제 서버·StubMatch: 공개 표시·권한, 목록 프레임 — 비공개 안 실림·`playerId` 없음·방장 자리 `host`·다른 시즌·커스텀 설정·강퇴된 박사에게 숨김, `queueCounts.rooms`, 후보(정밀·빠른·커스텀), `anySeason`(다른 시즌 방 제안·`room.queueState`의 `anySeason`·같은 큐 자리 유지·시즌 큐는 그 시즌 방만), 순서(사람 많은 방·먼저 공개된 방·잡힌 자리), 사람 그룹 먼저, 거절·시간 초과 5분 건너뜀, 수락·찬 방, 제안이 자리 잡기, AI 비켜 주기(비공개는 아님), 목록 참가로 큐에서 빠짐·제안 거둠, 자동 시작 세기·멈춤, 빈도 제한, 드레인 인계; 실제 경로 한 판: `server/match/Match.js`로 공개방 → 매칭 박사가 AI 자리에 → 방장 시작 → 둘 다 `m.public`), `test/lobby-kick.test.js`(`KICKED` 뒤 풀림).

## 로비 업데이트 소식 (2026-10-13, 관리자 결정)
- 공식 게임과 무관한 이 서버의 기능이다. 관리자가 넣을 곳 세 가지를 화면 시안으로 비교했다(작전 팁 칸의 탭 · 상단 왼쪽 버튼 · 「01 시뮬레이션 방식」 제목 줄의 한 줄 소식). 고른 것은 **작전 팁 칸의 탭**이다. 로비 아래에 카드를 따로 두면 로비가 길어진다(휴대폰 가로 844×390은 지금 스크롤 없이 딱 맞음). 타이틀과 로비 상단에는 두지 않는다.
- 원문은 `CHANGELOG.md` 하나다. 서버가 `GET /changelog.json`(`server/http/changelog.js`, `routes.js`)으로 1.0.0 이상 판만 내준다. 0.x는 원본의 중국어 기록이라 뺀다. 파일이 바뀌면(mtime) 다시 읽고, 파일이 없으면 빈 목록을 준다. Docker 이미지에 `CHANGELOG.md`를 복사한다(`Dockerfile`). 쓰는 Markdown은 `## 버전 — 날짜`·`### 묶음`·`- 항목`(들여쓴 줄은 이어짐)·문단, 그리고 `**굵게**`·`` `코드` ``다. 링크는 글자만 남긴다.
- (2026-11-08까지, 새 허브에서 바뀜 — 아래 「새 시즌 UI 다듬기 — 허브·연합 입구·협의 선택」) 작전 팁 칸(`screens/lobby.js TipsPanel`, `public/js/ui/patchNotes.js`)에는 「작전 팁 | 업데이트」 탭이 있다. 탭은 외곽선 없는 ghost 버튼이라 호버하면 다른 버튼처럼 모서리 브래킷이 나오고(관리자 요청), 고른 탭은 민트 글자에 옅은 바탕이다. 업데이트 탭은 최신 판을 한 줄씩 넘겨 보여 준다(관리자 결정 2026-10-13, 시안 비교 뒤): 첫 장은 `v버전 · 월-일 · 첫 문단 첫 문장`, 다음 장부터 항목마다 `[묶음 이름] **굵은 제목**: 첫 줄 …`(한 줄 말줄임, 칸 높이 고정). 작전 팁과 같은 `01/15 < >`가 있고, 8초마다 다음 장으로 넘어간다. 작전 팁(5초)보다 느린 것은 항목이 팁보다 길어서다. 마우스가 칸 위에 있거나 「업데이트 소식」 창이 열려 있으면 멈추고, `< >`를 한 번 누르면 그 뒤로는 자동으로 넘기지 않는다. 오른쪽 끝에는 늘 「전체 보기 ›」가 있다. 「전체 보기」를 누르면 「업데이트 소식」 창(PATCH NOTES)이 열린다. 판마다 `<details>`를 두고, 최신 판은 펼치고 이전 판은 접는다. 창 안에서만 스크롤된다.
- 새 판이 나온 뒤 처음 로비에 들어오면 업데이트 탭이 열려 있고 「NEW」 표시가 붙는다. 본 판은 브라우저 설정 `patchNotesSeen`에 저장한다. 다음 방문부터는 작전 팁이 열린다. 기록이 없는 새 플레이어에게도 한 번은 그렇게 보인다. 따로 뜨는 창은 없다(배포 뒤 자동 새로 고침마다 방해가 되므로).
- (2026-11-08까지) 휴대폰 가로(높이 460px 이하)에서는 원래 작전 팁 칸을 숨겼다. 업데이트 소식이 있으면 칸을 줄여(여백·한 줄 말줄임) 동맹 참가 아래에 둔다(`devices.css`). `/changelog.json`을 받지 못하면 탭이 없고 예전 그대로다(휴대폰에서도 숨김).
- 확인: `test/changelog.test.js`(인라인·문단·묶음·이어지는 항목, 실제 CHANGELOG의 첫 판 = `APP_VERSION`, 라우트·파일 변경 재읽기·파일 없음, 클라이언트 요약 문장·넘길 줄 목록·본 판·한 번만 받기). Windows Chrome(로컬 서버, 2026-10-13): 1600×900·1280×720·휴대폰 가로 844×390·740×360·667×375에서 로비 스크롤 높이가 넣기 전과 같다(808/808 · 647/647 · 346/346 · 316/316 · 331/331). 첫 방문은 업데이트 탭과 NEW, 다시 들어오면 작전 팁이고 NEW가 없다. 작전 팁 탭 호버 브래킷과 데스크톱·휴대폰 「업데이트 소식」 창도 확인했다. 한 줄씩 넘기기(같은 날): 8.6초 뒤 01→02, 호버 9초 동안 그대로, 마우스가 떠나면 다시 넘김, `>` 두 번 뒤 9초 동안 그대로, `<`로 하나 뒤로. 1600과 휴대폰 844에서 스크롤이 생기지 않는다.

## 보드에서 연 카드가 벤치를 가림 (GitHub #3, 2026-10-14, 관리자 결정)

- 제보(1.4.2, 협동 심연 15라운드 = 숨은 보스 라운드, 3D 보드, 1920×1080): 라운드 개막 연출 중 보드를 연타하다 보스·장치·지형이 눌리면 보드 맨 아랫줄(벤치)과
  상호작용이 안 됨. 원인: 그 누름이 왼쪽에 상세 카드를 연다. 적·장치·지형 카드는 불투명 상자(`.dpanel`, 1920×1080에서 x 230–720·y 210–978)라 그 밑의 벤치 칸
  (왼쪽 절반 플레이어: 6칸 중 4칸)과 배치 칸이 눌리지 않고, 보스(적) 카드는 보드를 눌러도 닫히지 않았다(`closesOnFieldPress`가 `enemy`를 정보 서랍 카드로 봄).
- 결정 1: **보드에서 연 적 카드는 다음 보드 누름에 닫힌다.** 미리보기 적·보스 필드의 라운드 리더를 눌러 연 카드는 `{ kind: 'enemy', fromField: true }`
  (`screens/game.js` `pieceClick`), `gameLogic/shortcuts.js closesOnFieldPress`가 그것도 닫는다. 敌方情报 서랍에서 연 적 카드(`fromField` 없음)는 그대로 남는다.
- 결정 2: **장치 카드는 오퍼레이터 카드와 같은 공식 모양**(`ui/detailArt.js DeviceDetailArt`, `detailPanel.js`가 공식 모양 HUD일 때 `dpanel--chess`
  클래스를 같이 붙임): 상자 없이 화면 왼쪽 전체 높이, 이름·태그·능력치 줄·공격 범위 칸(포탑)·HP 막대·탭 「技能」(장치 자신의 공식 스킬 글)·「装置机制」(우리
  설명 줄 + 이 칸). 누름 통과도 오퍼레이터 카드와 같다(머리·능력치 칸·짧은 탭 내용은 보드로 넘김, 탭·버튼만 받음; 「관리자 제보 수정(2026-10-06 3차)」).
  - 공식 근거(EN 공식 클라): 장치는 `Trap : Token : Character`다. 칸을 누르면 `AutoChessHighlightState._OnTileClicked`가 `AutoChessDummyManager.GetCharacter`
    → `Tile.GetCharacter`로 그 칸의 캐릭터를 찾고(`_disableClickCharacterInfo`면 끝), 보는 쪽이 맞으면 `AutoChessUIPlugin.ReqShowCharacterMenu` →
    `UICharacterInfoPanel.ShowCharacter`. 이 패널의 하위 패널(`UICharacterInfoStatusSubPanelInAutochess`·`…TabGroupSubPanelInAutochess`)은 플러그인이
    캐릭터 종류와 상관없이 건다(`_hookedCharacterInfoSubPanels`, `HookedCharacterInfoType` STATUS/TAB_GROUP/ADDITION) → 오퍼레이터와 같은 틀. 관리자 기억과도 맞음.
  - `[ASSUMED]` 장치에는 그림이 없다(함정은 立绘가 없음 — 클라 패널이 그때 무엇을 그리는지는 안 봄). 직업 칸은 TRAP 직업 그림(아래 「상세 카드 세부」 결정 4). 정비 중
    阻隔工事처럼 관 데이터에 HP 수치가 없는 장치는 HP 막대가 없다(전투 중에는 실시간 HP). 기본 탭은 「技能」(스킬 글이 없으면 「装置机制」).
- 결정 4(관리자 결정 2026-10-14): **특수 지형은 카드가 아니라 화면 위쪽 토스트**(`ui/tileToast.js TileToast`, `screens/game.js` `tileClick` → `tileTip`).
  지형 카드(`TerrainDetail`, `{ kind: 'terrain' }`)는 없앴다. 토스트 = 지형 이름·태그(이름과 같으면 생략)·설명 줄(그 판 수치)·「这一格」 사실, 위쪽 가운데
  — 라운드 캡슐 아래, 공식 모양 HUD에서는 그 아래 맹약 줄 밑(`.ttoast`, `css/screens/game-panels.css`), **누름을 받지 않음**(`pointer-events: none` — 밑의 보드를 그대로 누를 수 있음).
  판 화면의 일반 토스트(`.toast`)도 누름을 받지 않는다(`css/components.css`; 거절 토스트 위에 다시 놓으면 조용히 되돌아가고 방향 휠도 눌리지 않던 것, 2026-11-07). 판 밖에서는 예전처럼 탭으로 닫힌다.
  - 공식 근거(EN 공식 클라): 캐릭터 없는 칸은 `_OnTileClicked`가 거짓이고, 일반 경로 `UIController.OnBottomMaskDown` → `TileInfoController._SelectTile`이
    `Tile.isFunctional`이면 `IGameMode.TryShowTileInfoToast`(위수협약 모드는 덮어쓰지 않아 기본 = 거짓) 뒤 `UIToastController.Show(Options{ name: tileName,
    description: tileDescription, lastTime 0 }, needHide: false)`. 같은 칸을 다시 누르면 아무것도 안 함(그대로), 다른 곳을 누르면 `_ClearSelectedTile` →
    `UIToastController.Hide(popupId)`. 그래서 우리도 **다음 보드 누름에 사라지고**(같은 칸이면 놓을 때 다시 — 등장 애니메이션 없이, `again`), 시간으로는
    안 사라진다. 단계(정비 ↔ 전투)·보는 필드가 바뀌거나 Esc에도 사라진다.
  - `[ASSUMED]` 위수협약 UI 상태가 이 경로의 상태 검사(`stateMachine` 비교)를 통과하는지는 안 읽음. 토스트 프리팹(`UIToastController._infoPanel`)의 크기·모양·
    위치는 못 찾음(전투 UI 프리팹 번들 미확인) — 어두운 띠 + 왼쪽 금색 선, 라운드 캡슐 아래(판 안 일반 토스트 자리). 클라가 고른 칸에 거는 강조
    (`Tile.highlightType`)는 넣지 않음(렌더러 쪽).
- 적 클릭: 공식 `_OnTileClicked`는 `Character`만 찾는다(적 `Enemy : Unit`은 Character가 아님) — 적·보스를 눌러도 아무 패널도 안 열린다(관리자 기억과 같음).
  결정 5(관리자 결정 2026-10-14): **적 카드는 남기되 공식 모양 카드로**. 공식에 없는 카드이므로 관리자 선택이다. 공식 모양 HUD일 때 적 카드(보드의 라운드 리더·
  적 미리보기·전투 중 적, 敌方情报 서랍의 적 줄 모두)는 `ui/detailArt.js EnemyDetailArt` + `dpanel--chess` 클래스(`detailPanel.js` `artEnemy`): 상자 없이
  왼쪽 전체 높이, 누름 통과는 오퍼레이터·장치 카드와 같다. 직업 칸 자리에 적 아이콘(테두리: 일반 회색·정예 금색·리더 빨강), 등급 줄 자리에 등급·지상/공중·
  수(서랍), 그 아래 진영, 능력치 줄(공격+피해 종류·방어·법저·이동 속도·공격 범위·목표 가치·공격 간격, 전투 중 실시간 색), 빨간 HP 막대, 탭 「能力」(면역 +
  능력 줄) / 「说明」(능력이 없을 때 설명). `[ASSUMED]` 배치·색 전부(측정할 공식 적 카드가 없음). 공식 모양이 아닐 때는 예전 상자(`EnemyDetail`).
  서랍에서 연 카드는 서랍(가운데) 왼쪽 일부와 겹친다. 서랍 카드가 닫히는 규칙은 아래 「카드에 닫기 단추 없음」.
- 결정 3(개막 연출 건너뛰기 없음, 연출 중 보드 누름 막기는 보류): 1·2로 제보가 고쳐지지 않을 때만.
- 확인: `test/ui/uiRepair3.test.js`(보드에서 연 적 카드 닫힘·서랍 카드 유지·`fromField` 소스), `test/ui/official-ui-gaps.test.js`(장치 카드 공식 모양·클래스·CSS),
  `test/ui/device-tip.e2e.test.js`(공식 모양에서도 이름·스킬·장치 효과·HP — 탭 전환, `lang=zh`). Windows Chrome(실서버 fastServer `startRound: 'hidden'`,
  협동 심연, 3D 보드): 고치기 전 1920×1080 호스트 — 연타로 장치·적(보스)·지형 카드가 열리고, 적 카드 밑 벤치 4칸 누름·끌기 안 됨, 카드 밖 보드 누름에도 적 카드
  유지. 고친 뒤 — 적 카드가 카드 밖 보드 누름에 닫힘(1920×1080), 장치 카드(`act1autochess_m01`, 3라운드)는 공식 모양·벤치 6칸 모두 캔버스가 받음, 그 밑 기물
  누름 → 선택·그 기물 카드, 끌기 → 방향 단계까지, 카드 밖 누름에 닫힘(1920×1080·1920×940, 호스트·손님).
  결정 4·5 뒤: `test/ui/terrain-detail.test.js`(토스트 내용·게임 화면 연결·누름 통과 CSS), `test/ui/terrain-tip.e2e.test.js`(`.ttoast`, `lang=zh`),
  `test/ui/official-ui-gaps.test.js`(적 카드 공식 모양). Windows Chrome: 목업 보스 정비 1920×1080 — 특수 칸 누름에 토스트(맹약 줄 아래, 그 자리
  `elementFromPoint` = 캔버스), 같은 칸 다시 누름에 그대로(`is-again`), 다른 칸 누름에 사라짐, 상세 카드 안 열림. 실서버 협동 보스 라운드(fastServer
  `startRound: 'boss'`) 1920×1080 호스트 — 리더(卢西恩，“猩红血钻”)를 누르면 공식 모양 적 카드, 카드 밑 보드 칸 35개 중 33개가 캔버스(나머지 2개는 탭 줄 —
  오퍼레이터 카드와 같은 남은 막힘), 카드 밖 보드 누름·카드 밑 보드 누름 모두 닫힘. 서랍 적 카드도 공식 모양(목업).

## 카드에 닫기 단추 없음 (GitHub #3 후속, 2026-10-14, 관리자 결정)

- 결정: **상세 카드(오퍼레이터·장치·적·아이템·소환물, 공식 모양과 예전 상자 모두)에 ✕ 닫기 단추가 없다**(`detailPanel.js`의 `.dpanel__close`를 없앰,
  CSS도). 카드는 단추 없이 닫힌다:
  - 보드에서 연 카드(기물·전투 유닛·장치·보드의 적, `fromField`) — 다음 보드 누름(`gameLogic/shortcuts.js closesOnFieldPress`, 그대로).
  - 상점·보상 카드 — 다른 곳 누름(`ui/shopBar.js`, 그대로).
  - **창에서 연 카드** — 敌方情报 서랍의 적 줄·本局信息의 금지 오퍼레이터(`{ from: 'drawer' }`), 맹약 팝업의 멤버(자기·동료·관전 모두, `{ from: 'bond' }`,
    `screens/game.js`): 카드 자신·다른 카드를 여는 줄(`.erow`·`.ibanned__one`·`.bpop__member`·`button.bpop__harmony`)·대화상자 밖을 누르면 닫힌다
    (`closesOnOutsidePress`, 보드·창의 빈 곳·HUD 모두). 서랍 카드는 그 카드의 맹약 칸이 연 팝업 안을 눌러도 남고, 맹약 팝업 카드는 팝업의 빈 곳을 누르면 닫힌다
    (팝업이 그 카드의 창). **창이 닫히면 같이 닫힌다**(`windowCardGone`: 서랍 닫힘·팝업 닫힘). 맹약 팝업의 바깥 누름 닫기는 카드(`.dpanel`) 안 누름을 바깥으로
    보지 않는다(멤버 카드의 탭을 눌러도 팝업·카드가 남음).
  - Esc는 그대로(맹약 멤버 카드는 팝업보다 먼저 닫힘 — 카드가 위). 터치 기기(Esc 없음)는 위 누름으로 닫는다.
  - 공식 모양 카드는 누를 것이 없는 곳을 통과시키므로 그곳을 누르면 밑(보드·서랍)이 받고, 그 누름이 위 규칙대로 카드를 닫는다.
- 예전 상자(공식 모양 HUD가 아닐 때의 `.dpanel`)도 같은 규칙으로 단추를 없앴다: 위의 닫는 길이 모두 같게 동작하고, 상자 위를 누르면 그대로 남는다(밖을 누르면 닫힘).
- 공식 근거(EN 클라): `UICharacterInfoPanel` 필드는 `m_tweenTime`·`_illustHandler`·`_statusSubPanel`·`_tabGroupSubPanel`·캔버스 그룹·
  하위 패널 사전뿐 — `Button` 필드도 닫기 메서드도 없다(`ShowCard`·`ShowCharacter`·`Hide(Deck.Card)`). 하위 패널 `UICharacterInfoStatusSubPanel(InAutochess)`·
  `UICharacterInfoTabGroupSubPanel(InAutochess)`에도 `Button` 필드가 없고, 프리팹 `act2autochess_character_info_subpanel_status`·`…_tabgroup`
  (`ui/autochess/[uc]autochessbattle.ab`, `tools/local-extract/ui_inspect.py prefab`)의 오브젝트는 직업 아이콘·공격 범위·HP/SP 막대·이름·능력치·맹약 칸과
  탭 단추(`tab_button_autochess_equip`·`_skill`·`_subprofession_trait`·`_trait`·`_talent`)·`detailedPanels`뿐, 닫기 오브젝트가 없다. 관리자 기억과 같음.
  `[추정]` 상위 패널 프리팹(전투 공용 UI 번들)은 안 봄 — 필드에 단추가 없어 거기에도 없다고 봄.
- 확인: `test/ui/card-close.test.js`(누름·창 닫힘 규칙, 게임 화면 연결, ✕ 없음), `test/ui/official-ui-gaps.test.js`(CSS), `test/ui/uiRepair3.test.js`.
  Windows Chrome(목업 정비 화면, 공식 모양 HUD) 1920×1080 마우스·932×430 터치: 서랍 적 줄·本局信息 금지 오퍼레이터·맹약 멤버·상점 아이템·손의 아이템 카드 모두 ✕ 없음.
  서랍 카드 — 카드 탭 누름에 남음, 서랍 빈 곳 누름에 닫힘(서랍은 남음), 보드 누름에 닫힘, 서랍 닫기에 같이 닫힘, Esc 한 번에 카드·두 번에 서랍. 맹약 멤버 카드 —
  카드 탭 누름에 카드·팝업 남음, 팝업 빈 곳 누름에 카드만 닫힘, Esc에 카드 먼저, 팝업 닫기에 같이 닫힘, 보드 누름에 둘 다 닫힘. 상점·손 아이템 카드 — 보드 누름에 닫힘.
## 아이템 카드도 공식 모양 (GitHub #3 후속, 2026-10-14, 관리자 결정)

- 결정: **장비·奇术(아이템) 카드는 오퍼레이터 카드와 같은 공식 모양**(`ui/detailArt.js ItemDetailArt`, `detailPanel.js`가 공식 모양 HUD일 때
  `artItem` → `dpanel--chess` 클래스: 상자 없이 왼쪽 전체 높이, 누름 통과도 같음). 손·임시 칸의 아이템, 상점·보상 카드, 정찰한 보드의 아이템 모두.
  공식 모양이 아닐 때는 예전 상자(`ItemDetail`).
- 공식 근거: 우리 `data/items.json`의 아이템 115개(장비 112·奇术 3)는 모두 `trapId`가 있고, 클라 `character_table`에서 그 함정은 `profession: TRAP`
  (`Trap : Token : Character` — 장치와 같은 경로로 `UICharacterInfoPanel`이 열림, 위 「보드에서 연 카드가 벤치를 가림」 결정 2). 함정 수치는 전부
  1단계 LV 1·HP 100·공격/방어/법저/저지 0, 비용은 장비 0·奇术 5(“神秘顾客”·画卷·教鞭), 사거리 `0-1`(画卷만 `1-1` — 아이템 `rangeGrid`와 같음), 스킬
  `sktok_<id>_1`/`_2`(일반·진급)는 모두 `PASSIVE`이고 이름 = 효과 이름, 글 = 아이템 효과 글. 관리자 캡처(不屈弹射器 = `chess_item_2_01_e_a`, 함정
  `trap_1056_acarm056`)와 같다: 왼쪽 위 검은 네모 직업 칸, 이름, 등급 II | LV 1, 공격·방어·법저·저지·비용 0, 「攻击范围」 칸(한 칸), 파란 HP 막대 「生命
  100/100」, 탭 「技能」 — 아이템 그림을 스킬 아이콘(흰 테)으로, 이름, 회색 「被动」 꼬리표, 효과 글.
- 우리 카드: 위 그대로(`itemTrapStats` = 위 함정 수치, 진급 아이템은 「进阶」 꼬리표), 탭 「技能」(효과 + 맹약을 주는 아이템의 「与变形同构体一同装备时…」
  줄 + `note`), 变形同构体만 「天赋」(짝 목록), 「说明」(flavor 글·쓰는 법·상점에 없는 아이템의 획득 경로). 销毁는 하단 프레임(underframe)의 것 —
  카드는 `editable`·`onDestroy`를 넘기는 호출자에게만 단추를 그린다(게임 화면은 넘기지 않음, 예전과 같음).
- 직업 칸 안 그림: 클라의 TRAP 직업 그림(캡처의 흰 드론 그림, 아래 「상세 카드 세부」 결정 4). `[ASSUMED]` 그 밖의 크기·색은 캡처만 보고 맞춤
  (`css/hud-art.css .dart.is-item`, `.dskill__icon--item`). 진급 아이템이 공식에서 몇 레벨로 보이는지는 안 봄(함정 1단계 LV 1로 둠).
- 확인: `test/ui/item-card-art.test.js`(아이템 115개의 함정 수치·`PASSIVE`·사거리를 공식 표와 대조 — 표가 없으면 건너뜀, 카드 구성·CSS),
  `test/ui/official-ui-gaps.test.js`. Windows Chrome(목업 정비, 손의 아이템을 바꿔 누름) 1920×1080·932×430 터치: 不屈弹射器 카드가 캡처와 같은 배치
  (이름·II|LV 1·능력치 0·攻击范围 한 칸·生命 100/100·技能 탭의 흰 테 아이콘·被动), 变形同构体 「天赋」 탭에 짝 목록, 画卷 비용 5·범위 두 칸, 维式重锤(진급) 「进阶」;
  카드 밑 보드 칸이 캔버스(누름 통과), ✕ 없음, 하단 프레임에 销毁.


## 상세 카드 세부: 맹약 칸·공격 범위 색·소환물 카드 (GitHub #3 후속, 2026-10-14, 관리자 결정)

- 결정 1(**맹약 칸은 아이콘과 이름만**): 공식 모양 오퍼레이터 카드의 맹약 칸에서 활성 개수(`.dbond__count`)와 활성 표시(아래 초록 줄)를 뺐다
  (`css/hud-art.css .dart__tiles .dbond`). 칸을 누르면 그 맹약 팝업이 열리는 것, 同构·本局禁用 꼬리표, 칸의 title(개수·단계·활성 여부)은 그대로.
  - 공식 근거: 관리자 캡처(刺玫 — 维多利亚·助力 칸에 아이콘과 이름뿐). 프리팹 `act2autochess_character_info_subpanel_status`의
    `panel_camp_tag` → `camp_tag_group_basic`·`_extra_1..3` = `camp_tag`(63×63 그림)·`text_camp`(20px) 둘뿐, 둘 다 색 `#d0d0d0` — 우리 아이콘·이름도
    그 색으로. `UICharacterInfoStatusSubPanelInAutochess.SetData`는 `AutoChessBattleUtil.GetCharBondIds`의 맹약마다 `_SetCampIcon(bondId, image, text)`만
    부르고, 맹약이 없으면 칸 배경을 `_campGroupBkgImgColorWhenEmpty`(알파 0)로 지운다. 클라 칸을 눌러 팝업이 열리는지는 안 봄 — 우리 동작 유지.
- 결정 2(**공격 범위 칸 색은 공식대로**): 공식 모양 카드(오퍼레이터·장치·아이템·소환물 — 적 카드에는 범위 칸이 없음)의 「攻击范围」 칸을 민트에서 클라
  색으로(`css/hud-art.css .dart__range .rgrid`): 자기 칸 흰색, 범위 칸 주황 테 `#fe7800` + 안 `rgba(253,122,63,.4)`, 빈 칸은 안 보임. 테 두께는 칸의 1/8.
  예전 상자 카드(공식 모양 HUD가 아닐 때)·干员调配 화면의 범위 칸은 그대로.
  - 공식 근거: 프리팹 `panel_atk_range_grid` = `GridLayoutGroup`(칸 18.7, 간격 1.5) + `UICharacterAttackRangeWidget`의 스프라이트 셋(외부 번들
    `arts/ui/[uc]battlecommon.ab`): `_tileStand` = `attack_range_stand`(16×16 흰색 불투명), `_tileAttack` = `attack_range_attack`(16×16, 가장자리 2px
    `#fe7800`, 안 `rgba(253,122,63,.4)`), `_tileEmpty` = `sprite_mask`. `RenderAttackRange`는 범위 칸을 흰색(1,1,1,1)으로 칠하고 빈 칸은
    `Colors.TRANSPARENT`. 관리자 캡처 두 장(刺玫: 주황 테 칸 + 흰 자기 칸, 不屈弹射器: 흰 칸 하나)과 픽셀이 맞음. 칸 사이 간격은 우리 2px 그대로.
- 결정 3(**소환물 카드도 공식 모양**): 공식 모양 HUD일 때 소환물 카드(벤치·보드의 소환물 말, 전투 중 소환물, 밴드 맵 캐릭터 预备干员-医疗 등 —
  `detail.type === 'token'`)는 `ui/detailArt.js TokenDetailArt` + `dpanel--chess`(`detailPanel.js` `artToken`): 상자 없이 왼쪽 전체 높이, 누름 통과도
  같음. 직업 칸(TOKEN 직업 그림, 결정 4) · 이름 · 등급 | 정예 아이콘 LV n(소환물은 주인 변형의 phase·level) · 공격·방어·법저·저지·비용(+ 작게 공격 간격·재배치,
  전투 중 실시간 색) · 「攻击范围」 칸 · 파란 HP 막대, 맹약 칸 없음. 탭 「技能」(스킬 줄 — 아이콘·태그·글) / 「特性」(캐릭터 설명) / 「天赋」, 그리고 우리
  「说明」(놓은 소환물이 언제 나오는지). 「召唤物」·「干员」(맵 캐릭터: 직군 · 위치)·×개수 꼬리표는 등급 옆. 공식 모양이 아닐 때는 예전 상자(`TokenDetail`).
  - 공식 근거: 소환물은 클라 `character_table`의 캐릭터(`profession: TOKEN`; 맵 캐릭터는 오퍼레이터)라 누르면 오퍼레이터와 같은 `UICharacterInfoPanel`
    (위 「보드에서 연 카드가 벤치를 가림」 결정 2의 경로). 프리팹의 직업 아이콘 쌍(`_professionIcons`)에서 TOKEN(128)과 TRAP(256)은 같은 그림(장비 캡처의
    흰 그림). `SetData`는 맹약이 없는 캐릭터에 맹약 칸을 그리지 않는다(위 결정 1의 `_campGroupBkgImgColorWhenEmpty`). `UpdateData`는 캐릭터의
    블랙보드 `autochess_chess_id`가 없으면 비용 「0」·등급 그림 `_chessLevelSprites[0]`(I), 있으면 그 말의 등급.
  - `[ASSUMED]` 등급은 주인 말의 등급, 주인을 모르면 I(소환물에 `autochess_chess_id`가 붙는지는 안 봄). 비용은 소환물 자신의 비용. 맵 캐릭터의
    직업 칸은 그 직군 아이콘. 그림(立绘) 없음.
- 확인: `test/ui/card-details.test.js`(맹약 칸 CSS·팝업 연결, 범위 칸 색, 소환물 카드 구성·연결), `test/ui/official-ui-gaps.test.js`·`item-card-art.test.js`.
  Windows Chrome(목업 정비 화면, 공식 모양 HUD) 1920×1080 마우스·932×430 터치: 오퍼레이터 카드 — 맹약 칸에 아이콘·이름만(이름 #d0d0d0, 개수 숨김,
  누르면 팝업), 범위 칸 주황 테·흰 자기 칸; 아이템 카드 — 흰 칸 하나; 소환물 카드(손의 소환물 말을 狼群·诅咒娃娃·医疗探机로 바꿔 누름) — 공식 모양
  (`dpanel--chess`), 맹약 칸 없음, 탭 전환, 카드 밑 보드 칸이 캔버스(누름 통과, 오퍼레이터 카드와 같은 비율). `[화면 미확인]` 맵 캐릭터(预备干员-医疗)
  카드·장치(射击台) 카드의 범위 색(같은 CSS).
- 결정 4(관리자 결정 2026-10-14, **TRAP·TOKEN 직업 칸 = 클라의 직업 그림**): 장치·아이템(둘 다 TRAP)·소환물(TOKEN) 카드의 직업 칸은
  `icon_profession_token_lighten`(`ui/detailArt.js ClassBox`, 직업이 TOKEN·TRAP인 말을 오퍼레이터 카드로 열 때도). 이 스프라이트가 칸 전체(빛나는 흰
  테·반투명 검은 바탕·흰 드론 그림, 128)라 우리 칸의 테·바탕·빛은 지움(`css/hud-art.css .dart__prof.is-sprite` — 금빛 아이템·소환물 청록 틀도). 맵
  캐릭터는 그대로 직군 아이콘.
  - 공식 근거: `UICharacterInfoStatusSubPanelInAutochess._professionIcons`에서 TOKEN(128)·TRAP(256)이 같은 스프라이트이고 프리팹
    `act2autochess_character_info_subpanel_status`의 `image_profession`(128×128) 기본 스프라이트도 이것(`arts/ui/[uc]battlecommon.ab`). 관리자 캡처
    (不屈弹射器 카드)의 그림과 같음.
  - 추출: `tools/local-extract/extract.py`의 `ui/battlecommon` 작업(이름 정규식에 추가) → `public/assets/local/ui/battlecommon/` + `data/local-assets.json`
    (`extract.py --only ui/battlecommon`으로 그 묶음만 다시 뽑을 수 있음). 클라이언트에서 뽑은 그림이 없거나 못 읽으면 예전 그림: 장치·아이템은 정보
    아이콘, 소환물은 아바타(테·바탕 그대로).
  - 확인: `test/ui/card-details.test.js`(ClassBox 연결·대체 그림·CSS·추출 작업). Windows Chrome(목업, 1920×1080): 아이템(坚固维式重锤)·소환물(狼群·
    医疗探机)·장치(阻隔工事, 전투 목업) 카드의 직업 칸이 캡처와 같은 그림(96px 칸에 꽉 참, 테 없음), 매니페스트에서 항목을 지우면 정보 아이콘·아바타로 돌아감.

## 설정 창을 기능별 절로 (2026-10-14, 관리자 결정)

- 공식에 없는 화면(우리 설정 창). 단축키·문제 제보만 제목이 있고 나머지 위쪽 줄은 제목 없이 이어져 있었다. 기능별 절로 나눔(`ui/settings.js SetSection`,
  절 머리는 단축키·문제 제보와 같은 모양: 제목 + 작은 영문 + 위 구분선, 첫 절은 구분선 없음 — `css/screens/game.css .set-sec`):
  - 「通用」(일반, GENERAL): 언어(+ 기계 번역 안내), 리소스 미리 받기.
  - 「声音」(사운드, SOUND): 배경 음악·오퍼레이터 음성·효과음 크기, 음성 언어, 음소거.
  - 「聊天提示」(채팅 알림, CHAT ALERTS): PR #4의 채팅 알림음·알림음 크기·알림 간격·맹약 선택 알림.
  - 「画面」(화면, DISPLAY): 대미지 숫자 표시·대미지 숫자 스타일, 화면 품질, UI 크기.
  - 그 뒤 기존 단축키·문제 제보, 맨 아래 조작 안내 한 줄은 그대로.
- 문구: 절 제목 4개 `en.json`·`ja.json`·`zh-TW.json`·`ko/ui.json`(PR #4처럼 설정 문구를 가진 팩 모두). 리소스 미리 받기가 맨 위 「일반」으로 올라감(예전엔 UI 크기 아래).
- 확인: `test/ui/settings-sections.test.js`(절 순서·줄 소속·CSS·팩 4개 번역). Windows Chrome(목업 판 화면, 한국어): 1920×1080, 휴대폰 가로 932×430·640×360(터치)에서
  절 6개 순서대로, 창 본문 세로 스크롤로 끝까지(2026-10-14).
- 2026-10-24부터 절마다 탭 하나(아래 「설정 창을 탭으로」). 절 머리와 위 구분선은 탭이 대신함.
- 2026-11-16부터 리소스 미리 받기는 「일반」이 아니라 「리소스」 탭(아래 「설정 리소스 탭」).

## 설정 창을 탭으로 (2026-10-24, 관리자 결정)

- 항목이 늘어 창이 길어짐 → 위 절 여섯을 탭으로(`ui/settings.js SETTINGS_TABS`, 공용 `Tabs` 작은 크기): 일반 · 사운드 · 채팅 알림 · 화면 · 단축키 · 문제 제보.
  고른 탭의 패널만 그림(`SetPanel`, `role="tabpanel"`). 단축키·문제 제보는 자기 머리(기본값으로·진단 정보 복사 버튼)를 그대로 두고 위 구분선만 뺌.
  맨 아래 조작 안내 한 줄(터치 조작 / 우클릭 상세)은 단축키 탭 아래로.
- 창을 닫았다 열면 마지막 탭(이 페이지 안에서만, 저장 안 함). 창 높이는 보이는 패널을 따라감(관리자 요청 2026-10-24: 처음엔 가장 긴 화면 탭을
  최소 높이로 두었으나 고정된 크기로 보여 뺌; `css/screens/game.css .set-sec`). 넓이는 다른 창처럼 고정(7.4rem). 탭 줄은 길면 줄바꿈(가로 스크롤은 창이 첫 탭에 주는 포커스 테두리를 잘라서 안 씀).
- 문구: 새 문자열 없음(탭 이름 = 절 제목 4개 + 기존 「快捷键」「问题反馈」; ja·zh-TW는 이 둘이 없어 영어로 떨어지는 것도 전과 같음).
- 확인: `test/ui/settings-sections.test.js`(탭 순서·패널 소속·CSS·번역), `SP_E2E` `test/ui/hotkeys.e2e.test.js` 두 건(단축키 탭을 눌러 들어감).
  Windows Chrome(목업 판 화면, 한국어): 1920×1080에서 창 높이 일반 322 · 사운드 562 · 채팅 알림 681 · 화면 801 · 단축키 600 · 문제 제보 416px, 932×430·640×360(터치)에서 탭 한 줄, 가로 스크롤 없음,
  긴 탭(화면·채팅 알림)은 본문 세로 스크롤(2026-10-24).

## 박사 한 명 연합 방어의 첫 카메라 (upstream #635, 2026-10-15, 관리자 결정)

- 연합 방어(联防) 판에 박사가 한 명뿐이면 처음 카메라가 그 박사의 반쪽(‹ › 반쪽 보기와 같은 `half: true`)이다. 박사가 둘이면 예전처럼 全景에서 시작하고
  ‹ LEFT / 全景 / RIGHT › 전환도 그대로. 박사 한 명일 때는 全景 층도 그 반쪽을 비춘다(`battle/observe.js layerCamera` — upstream PR #637 그대로).
  보스 판의 혼자 판(솔로 모드·최종 공세의 남는 한 명)은 예전부터 반쪽으로 시작(아래 진입 코드).
- upstream PR은 `layerCamera`만 바꿨는데, 전장에 들어갈 때(`screens/game.js` 전장 진입)는 층을 全景으로 되돌리고 카메라를 직접 정해서, 층이 이미 全景이면
  `[layer]` 효과가 돌지 않아 첫 카메라가 그대로 전체였다. 그래서 진입 때 联防 판의 카메라도 `layerCamera(field, 'ALL', side)`로 정한다.
- 근거: 관리자 결정 2026-10-15(관리자 기억, 공식 녹화 없음). 공식 클라·녹화로는 확인하지 않음 `[ASSUMED]`.
- 확인: `test/match/observe.test.js`(박사 한 명·둘, `sides` 없는 메타, 보스 판, 진입 코드 고정). [실제 판 이상 없음 2026-10-28] 박사 한 명 연합 방어 첫 카메라.

## 규칙 모드 — 클래식·캐주얼 (2026-10-15, 관리자 결정)
- 방마다 **규칙 모드**를 고른다: **클래식**(经典) = 공식 위수협약 그대로, **캐주얼**(休闲) = 이 리메이크의 편의 기능을 켠다. 공식 게임에는 이런 선택이 없다(공식에 없는 편의 기능을 한곳에서 끄고 켜기 위한 우리 기능).
- 옵션 표는 `shared/ruleset.js` `RULE_OPTIONS` 하나다. 옵션마다 공식 값과 캐주얼 값을 적고, 클래식은 **모든 옵션의 공식 값**으로 만든다(옵션을 더해도 클래식은 저절로 공식 그대로). 나중에 옵션을 하나씩 고르는 「커스텀」을 더할 수 있게 서버·클라가 모두 옵션 이름으로 읽는다(관리자 요청 2026-10-15 「확장성 있게」). 커스텀은 2026-10-18에 더했다(아래 「규칙 모드 — 커스텀」).

| 옵션 | 클래식(공식) | 캐주얼 | 어디서 | 근거 |
|---|---|---|---|---|
| `battlefieldInfo` 브리핑 전장 카드(이름·전장 수·미리보기 그림) | 「미확인 전장」 카드(규정은 보임) | 보임 | `public/js/screens/briefing.js` | 맹약: 공식 정보 화면 입력 `AutoChessStageInfoGroupViewModel.Input`에 전장 값이 없다(actId·bossId·enemyTypes·bannedBondList·trainingBondList·modeId — 공식 클라). 규정: 공식 정보 화면(`auto_chess_stage_info_state`)에 맵 미리보기가 새로 들어가 공식 화면도 늘 보여 준다 → 규정은 모든 규칙 모드에서 카드를 보인다(시즌 기능 `stagePreview` → `shared/ruleset.js seasonOfficialOptions`, 관리자 결정 2026-11-13; 툴팁의 캐주얼 줄에서도 빠짐) |
| `infoReroll` 브리핑 「다시 뽑기」 투표 | 없음(서버가 거부, 버튼 없음) | 있음 | `server/match/match/phases.js voteReroll` | 공식 브리핑에는 准备就绪뿐(이 파일 「본판 정보 다시 뽑기」) |
| `bossRoutePreview` 보스 경로 미리보기 | 없음(서버가 경로를 보내지 않음) | 있음 | `server/match/match/views.js nextEnemiesFor` | 공식에 없는 편의 기능(`render.md` 「보스 경로 미리보기」) |
| `bossHitClamp` 리더 피해 상한 완화(限伤放宽) | 없음(30만 이상 한 방은 통째로 무효) | 있음(30만 이상 한 방은 300,000으로 들어감) | `server/sim/damage.js leaderHitLimit` ← 전투 spec `flags.bossHitClamp` | 공식 限伤(`sim.md` 「캐주얼 규칙 모드의 리더 피해 상한 완화」, `docs/research/11-limits-official.md` §2); 절삭은 공식에 없음 |

- 관리자 결정(2026-10-15): 이름은 클래식 / 캐주얼, 보스 경로 미리보기도 캐주얼 쪽, 처음 기본값은 클래식이고 그 뒤로는 로비에서 마지막에 고른 값을 기억, 공개 매칭은 규칙 모드별로 나눔, 통계는 규칙 모드별로 나누고 이 기능 전의 판 기록은 캐주얼로 셈.
- 브리핑 전장 카드(관리자 결정 2026-10-15, 시안 비교 뒤): 카드를 빼면 왼쪽 열이 비어 보여서, 같은 자리에 **「미확인 전장」** 카드를 둔다 — 제목 줄은 전장 이름 대신 「미확인 전장」(전장 수 문구 없음), 그림 자리에는 줄무늬 어두운 상자와 보스 칸의 「?」와 같은 주황 「?」, 그 아래 「전투가 시작되면 공개됩니다」. 두 모드의 화면 틀이 같다. 비교한 다른 안(결장 오퍼레이터 묶음을 왼쪽 열로 옮겨 공식 순서 적 → 결장 → 핵심 → 부가를 따르기)은 결장이 많은 판에서 왼쪽만 길어지고 오른쪽 아래가 비어 고르지 않았다. 처음 요청한 「공식의 미클리어 스테이지 맵 미리보기」는 없다: 공식 스테이지 정보 패널(`StagePreviewInfoBasicPanel` `_LoadStagePreviewMap`)은 클리어 여부와 상관없이 같은 미리보기를 불러온다.
- 방(`server/lobby.js`): `room.create { ruleset? }`(없으면 클래식), 방장이 판 전에 `room.setRuleset { preset }`로 바꾼다(바꾸면 다른 박사의 준비가 풀림 — 난이도와 같음). `room.state.ruleset = { preset, options }`, 판은 `opts.ruleset`로 받아 `m.public.ruleset`에 싣는다. 다시 뽑기로 새로 시작한 판도 방의 규칙 모드를 그대로 쓴다.
- 리더 피해 상한 완화: 캐주얼이면 보스전 spec의 `flags`에 `bossHitClamp`이 붙고(`shared/ruleset.js simRuleFlags`, 공식 값과 다를 때만), 브라우저 전투와 서버 검증이 같은 spec을 읽는다. 클래식 보스전의 spec은 예전과 같아 골든이 움직이지 않는다.
- 통계(관리자 결정 2026-10-15, `public/js/ui/stats.js`·`screens/stats.js`): 기록마다 `ruleset`(그 판의 `m.public.ruleset` 프리셋)을 남기고(봉투 v2, 저장 예산 85만 자로 — 실제 크기 협동 판 1000개에서 900개 넘게 남게), 통계 페이지 왼쪽 위 「규칙」 스위치(열 때 로비의 현재 값)로 모든 탭이 그 규칙 모드의 기록만 센다. 이 기능 전의 기록(v1 또는 필드 없음)은 캐주얼(`LEGACY_RULESET`: 그때 다시 뽑기와 전장 미리보기가 있었음). 내보내기·가져오기·비우기는 여전히 모든 기록. `test/ui/stats.test.js`. Windows Chrome 확인 2026-10-15(v1 기록이 캐주얼 탭에).
- 로비(`public/js/screens/lobby.js`, `public/js/ui/ruleset.js`): 「시뮬레이션 난이도」 제목 줄 오른쪽 끝에 「규칙」 스위치(클래식 / 캐주얼, 툴팁 같음; 제목 아래 따로 한 줄을 두었더니 데스크톱 모든 크기에서 로비가 약 14px 넘쳐 스크롤이 생겨 제목 줄로 올림, 관리자 요청 2026-10-15) — 방 만들기·단독 시뮬레이션·연합 매칭 모두 이 값으로, `lobby.ruleset`에 기억(처음은 클래식). 매칭 큐와 대기 인원은 「랜덤 매칭」 절.
- 스위치 툴팁(로비·방 같음, `public/js/ui/ruleset.js rulesetTips`; 관리자 요청 2026-10-15): 프리셋마다 한 줄 「[클래식] 공식 규칙과 같음」 · 「[캐주얼] 전장 정보, 다시 뽑기, 이동형 리더 적 경로 미리보기, 리더 적 대미지 상한 완화 사용」 — 줄 안에는 콜론을 쓰지 않는다(예전 「캐주얼: 켜짐: …」은 콜론이 겹쳐 「꺼짐」이 다른 규칙처럼 읽혔다). 그 아래 옵션 표의 `note`가 있는 옵션마다 각주 한 줄 「※ 리더 적 대미지 상한 완화 — 리더 적에게 한 번에 300,000 이상 들어가는 공격은 공식 규칙에선 통째로 무효가 되지만, 완화하면 300,000으로 계산됩니다」(이 상한을 모르는 플레이어가 많아서; 수치는 `BOSS_HIT_LIMIT`). 「이동형」은 걸어 다니는 리더의 경로라는 뜻(관리자 요청 2026-10-15).
- 방 화면(`public/js/screens/room.js`): 아래 줄 난이도 밑에 「규칙」 선택(클래식 / 캐주얼, 방장만, 매칭 중 잠김; 툴팁이 프리셋마다 공식과 다른 옵션을 나열), 위 제목의 난이도 옆에 규칙 모드 표. 아래 줄 왼쪽 옵션 칸은 가장 넓은 줄 폭에 맞추고 모든 줄이 그 폭을 채운다(관리자 요청 2026-10-15): 난이도 넷이 같은 폭으로 나누고, 그 아래 줄은 「규칙」 | 「AI 팀원은 마지막에 선택」 반반(단독 방은 규칙이 한 줄 전체) — 2026-10-18부터는 규칙 스위치가 그 줄 전체이고 AI 팀원 선택은 가운데 준비 완료 수 아래(아래 「규칙 모드 — 커스텀」). 방장 아닌 박사의 「생성자가 설정」은 AI 팀원 버튼 옆 글자에서 툴팁 둘째 줄로 옮겼다(반 칸에서 버튼이 두 줄로 눌렸다).
- 확인: `test/ruleset.test.js`(표·프리셋), `test/lobby-ruleset.test.js`(방), `test/match/ruleset-match.test.js`(실제 판: `m.public.ruleset`, 캐주얼에서 999층 炎 보드의 30만 이상 타격이 300,000으로 리더와 공유 풀에 들어감), `test/match/info-reroll.test.js`(클래식은 투표 거부), `test/match/boss-path.test.js`(클래식은 경로 없음), `test/lobby-matchmaking-ruleset.test.js`(규칙 모드별 큐·방 항목·새 방의 규칙 모드·`lobby.queueCounts`). 화면: Windows Chrome 2026-10-15 — 로비 규칙 스위치·대기 인원, 방 아래 줄 선택·제목 표시·툴팁, 클래식 / 캐주얼 솔로 브리핑(「미확인 전장」·다시 뽑기 없음 / 전장 그림·다시 뽑기), 통계 규칙 탭, 1600×900과 휴대폰 가로 844×390(가로 넘침 없음).

## 규칙 모드 — 커스텀 (2026-10-18, 관리자 결정)
- 규칙 스위치의 세 번째 **커스텀**(自定义): 방장이 항목마다 정한다. 혼자 들어가는 공개 매칭에서는 쓸 수 없다 — 서버가 `room.queue`의 커스텀을 `BAD_MSG`로 거부한다(`shared/ruleset.js QUEUE_PRESETS` = 클래식·캐주얼). 단독 시뮬레이션과 코드로 만드는 대기실에서만 고른다. 커스텀 방의 빈자리 매칭(`room.queueRoom`, 관리자 결정 2026-11-07)은 2026-11-20에 빈자리 매칭과 같이 없어졌고, 커스텀 공개방에 빠른 매칭 박사만 들어가는 것으로 이어진다(「랜덤 매칭」 절의 「공개방」). 공식 게임에는 없다.
- 설정(`shared/ruleset.js CUSTOM_OFFICIAL`, 기본은 모두 공식 값; `sanitizeCustom`이 숫자를 범위에 맞추고 모르는 값·키를 버리며 id 목록을 정렬): **맹약** — 무작위 금지 수(시즌 공식 범위: 맹약 핵심 0–3·보조 0–4, 규정 0–5·0–5 — `customBanLimits`; 비우면 난이도 값), 999중첩 상한 해제, 맹약별 무작위 / 금지 / 허용(금지는 공식 결석 방식: 그 맹약만 가진 오퍼레이터만 상점·선발에서 빠지고, 다른 맹약을 같이 가진 오퍼레이터로는 여전히 발동 — `server/match/pool.js drawDisabledBonds`와 같음). **적 능력치** — 일반 적(특훈 적·호위·부속 포함) 체력·공격력·방어력·마법 저항·이동 속도, 리더 적(최종 공세·히든 코어의 리더 적과 소환물) 체력(공유 풀에 곱함)·공격력·방어력·마법 저항, 각 10–1000%(마법 저항은 곱해도 100을 넘지 않음), 라운드별 상승은 공식 표가 한 단계 오를 때 곱하는 값을 체력·공격력 따로 ×1.00–×2.00, ×0.01 단위(관리자 결정 2026-11-15, `stepHp`·`stepAtk` 백분 정수 — 비우면 공식 값)로 정하고, 그 아래 「빠른 설정」 버튼 공식 / 완만 / 가파름 / 평탄은 두 값을 채우기만 한다(관리자 결정 2026-11-15, 시안 B: 예전의 곡선 선택이 배율 지정과 같은 일을 해서 하나로 합침; `stepPreset` = 그 난이도 공식 단계 배율의 ¾ / 1¼ / 0제곱을 반올림 — 맹약 체력 ×1.15 / ×1.26 / ×1.00, 공격력 ×1.07 / ×1.13 / ×1.00, 거듭제곱 값은 [추정·자료 없음: 이 리메이크의 모양, 관리자 결정 2026-10-18은 이름만 정함]; 두 값이 버튼 값과 같을 때만 그 버튼이 켜짐). 예전 `curve` 필드로 저장된 설정·코드는 읽을 때 같은 버튼 값(맹약 단계 기준)으로 바뀐다(`sanitizeCustom`). **적 유형**(관리자 결정 2026-11-15, 시안 B = 「적 능력치」 아래 자기 탭, 유형 수 + 유형별 3단) — 판마다 뽑는 특훈 적 유형 수 0–5(공식 3, `specialEnemyNum`; 유형 하나가 15라운드 칸 중 3칸이라 5가 끝, 남는 칸은 「특이」), 시즌의 추첨 대상 유형(`factions.json` `involveRandom`: 맹약 6, 규정 8)마다 무작위 / 금지(뽑히지 않음) / 고정(매 판 뽑힘); 다른 공개 시즌에만 있는 유형(맹약 방에서 규정의 치명 `CRITIC`·소생 `REBORN`; 관리자 요청 2026-11-15)은 아래 따로 빠짐(기본) / 무작위(`allow`, 추첨에 넣음) / 고정. **리더 적** — 최종 공세 리더 7·히든 코어 리더 3 금지(묶음마다 1명은 남김, 나머지는 공식 가중치), 대미지 상한 무효(공식) / 상한으로 계산 / 제한 없음, 값 100,000–5,000,000(제목에 「限伤」 한자는 쓰지 않음). **전장** — 전장 정보 미리 보기, 브리핑 「다시 뽑기」, 「상반기 전장 포함」(`stages.firstHalf`, 기본 끔: `CUSTOM_FIRST_HALF_STAGES` = 战场#06 沙尘暴/土石结构를 전장 #01과 같은 가중치로 풀에 넣음 — 공식 act1 표에서 #01–#04·#06이 같은 60 [ASSUMED·자료 없음: 두 시즌을 섞어 뽑은 적은 없음]; 끄면 그 전장 금지도 지움; 기믹은 `sim.md` 「战场#06(上半) 沙尘暴 · 土石结构」), 전장 풀 금지(1곳은 남김; 상반기 #05·#07은 기믹을 구현하기 전이라 목록에 없음, #06은 스위치를 켤 때만), 다른 시즌 전장 추가(`stages.extra`, 관리자 요청 2026-11-15: 눌러 넣고 뺌, 기본은 없음 — 같은 전장은 목록에 없음, 아래; 규정 방에는 맹약 하반기 #05 오리지늄 기류·#07 배기 격자·#08 밀물 제어와 상반기 #06, 맹약 방에는 규정 m05·m09–m12). **진행** — 라운드 수 6–20, 휴식 기간 공식 / ×1.5 / ×2 / 고정 초(연합만: 단독은 공식대로 시간 제한 없음), 목표 HP 라운드당 감소 상한 해제·모든 라운드 공유(연합만), 이동형 리더 경로 미리 보기, 상점 풀(`pool`, 아래 「판 흐름」) — 오퍼레이터 풀·장비 재고 각 10–1000%.
- **판이 읽는 것**: 모든 설정. 캐주얼 편의 기능 넷(전장 정보 미리 보기 → `battlefieldInfo`, 다시 뽑기 → `infoReroll`, 이동형 리더 경로 → `bossRoutePreview`, 대미지 상한 「상한으로 계산」 → `bossHitClamp`, `optionsOfCustom`), 판 흐름 설정(아래 「판 흐름」), 전투 설정(아래 「전투」). 설정 창의 「다음 업데이트에서 적용」 표는 전투 설정까지 들어가면서 없앴다.
- 판 흐름(`server/match/gamedata.js`: `Match`가 커스텀 설정을 `GameData`에 넘기고 접근자가 적용; 설정이 없으면 모든 접근자가 공식 값이라 클래식·캐주얼 판은 그대로):
  - 맹약(`server/match/pool.js drawDisabledBonds`): 「금지」 맹약은 매 판 결석 목록에 들어가고(공식 결석 방식), 「허용」 맹약은 뽑히지 않으며, 무작위 금지 수(`gd.bans`, 비우면 난이도 값)는 「무작위」로 둔 맹약에서만 뽑는다 — 금지 맹약은 그 수에 더해진다. 공식과 같은 목록을 같은 rng로 섞고 앞에서부터 조건에 맞는 것을 고르므로 rng 흐름이 공식과 같다. 결석 맹약이 늘어 상점이 마르는 것을 막는 최소 조건은 없다(공식 추첨과 같음). AI와 전략 선택은 공식처럼 모드의 꺼진 맹약만 본다(결석 맹약은 꺼지지 않으므로).
  - 특훈 적 유형(`server/match/waves.js setupMatchWaves` → `shared/ruleset.js customEnemyTypes`): 고정 유형을 먼저 넣고, 무작위로 둔 유형을 판의 추첨 rng로 섞어 유형 수까지 채운다. 고정이 유형 수보다 많으면 유형 수가 그만큼 늘고(최대 5), 금지 뒤 남은 유형이 모자라면 적게 뽑아 남는 라운드 칸이 「특이」가 된다(공식 일정 `makeTypeSchedule`이 채움). 유형 설정이 없으면(유형 수 공식·고를 것 없음) 공식 추첨을 그대로 타서 rng 흐름도 같다 — 클래식·캐주얼과 다른 커스텀 판 golden이 움직이지 않는다. 브리핑의 유형 셋 자리는 뽑힌 수만큼 보인다 [화면 미확인: 0개·5개 브리핑].
  - 다른 시즌 전장·특훈 적 유형(관리자 요청 2026-11-15, 시안 「각 탭 아래 별도 칸」; `shared/seasonBorrow.js`): 설정이 다른 시즌 것을 고르면(`customBorrowIds`) `Match`가 판 데이터를 그 시즌 데이터와 섞은 것으로 바꾼다(`server/match/borrow.js borrowedData`; 이펙트 레지스트리는 원래 시즌 것). 빌려 오는 것은 이 시즌에 없는 id만(`borrowPlan`) — 전장 기록(장치·지형·룬이 기록 안에 있음, `borrowed: <시즌>`), 유형과 그 `factions.json` 항목, 그리고 이 시즌에 없는 적 기록 전부(그 유형의 적과 소환물); 두 시즌에 다 있는 적은 이 시즌 기록을 쓴다 [ASSUMED·자료 없음: 공식 게임은 두 시즌을 섞은 적이 없음]. 웨이브 템플릿·경로는 두 시즌이 같은 판 모양이라 라운드 것을 그대로 쓴다. 빌린 전장은 모드 자기 전장 중 가장 큰 가중치(두 시즌 모두 50)로 풀에 들고 [ASSUMED·자료 없음: 위와 같음], 이 시즌 전장과 같은 전장은 빌리지 않는다(`sameField`, 관리자 확인 2026-11-15: 규정 m01–m04·m06 = 맹약 #01–#04·하반기 #06 늪지대 제어 — 크기·적 경로·배치 칸·지형 수치·룬·전역 버프·옵션·대기석과 경계 줄(`a`/`A`/`X`/`#`/`I`만인 줄)을 뺀 모든 타일과 그 뜻·장치가 같다. 장치에서 빼는 것: 쉐라그 한풍(자리와 관계없이 구역 전체), 늪지대 제어 장치(숫자만; 늪은 `m` 타일), 숨은 「쌍꺼풀」 포탑(켜는 「기계 지원」 `aceffect_band_43`을 두 시즌의 어떤 전략·기변 카드·주둔·장비도 주지 않음 — 시험이 확인). 다른 것은 3D 배경 장면·대기석 배치·한풍 장치 자리뿐이라 해 보면 같은 맵; 규정 m05는 맹약 하반기 #05에 구역마다 울타리 칸이 2칸 더 있어 다른 전장). 빌린 유형은 공식 추첨 목록(`involveRandom`)에서 빠져 설정이 고른 것만 `customEnemyTypes(…, borrowed)`로 들어간다 — 고르지 않으면 데이터에 있어도 추첨이 클래식과 같다. 브라우저는 같은 병합을 데이터 저장소에서 한다: `main.js`가 방 규칙을 따라 `data.setBorrow`를 부르면 다른 시즌 저장소(`seasonStore`, 같은 언어)의 파일을 받아 `get`·`lookup`·`list`가 빌린 기록까지 읽고, 전투 로더(`battle/runner.js loadBrowserSim`)는 `borrowRaw`로 서버와 같은 기록으로 시뮬레이션한다(빌림이 바뀌면 시뮬레이터를 다시 읽음). 방 밖 요약·설정 창의 이름은 `data.lendable`이 다른 시즌에서 찾는다.
    `stages.extra`에 이 시즌 자기 전장이 들어 있으면 넣지 않는다(2026-11-19, 관리자 요청): 자기 전장은 모드의 전장 풀과 「상반기 전장 포함」으로만 들어오고, 「상반기 전장 포함」도 이 시즌 데이터에 그 전장이 있을 때만 넣는다. 전에는 다른 시즌에서 만든 설정(그 시즌에서 빌린 이 시즌 전장)이 자기 무게로 들어가, 전장이 #01 하나뿐인 쉬움에서 다른 난이도 전장이 뽑혔다(규정 쉬움 + `act3autochess_m09`: 200판 중 101판). 서버 추첨(`waves.js`)·설정 창 전장 탭·브리핑 전장 수(`matchIntel.js`)가 모두 `customStagePool(ids, custom, ownStage)`를 거치고, `ownStage`(이 시즌 자기 기록인가; 빌린 기록은 아님)가 없으면 이 함수가 멈춘다. 재발 방지: 원인 제거 — `customStagePool`이 자기 전장을 `extra`에서 받지 않음; `test/match/custom-borrow.test.js` 「settings made in another season」.
  - 리더 적·전장(`gd.bossWeights`, `server/match/waves.js setupMatchWaves`, `shared/ruleset.js keepUnbanned`): 금지한 것을 가중치 목록에서 빼고 한 번 뽑는다(뽑는 횟수가 같아 그 뒤 추첨이 그대로). 묶음(최종 공세 리더 · 히든 코어 리더 · 전장 풀)마다 모두 금지된 코드라면 금지를 무시하고 공식 목록.
  - 라운드 수(`customRoundPlan` → `gd.plan`, `gd.srcRound(r)`): 라운드마다 원래 라운드(`src`)를 정하고, 라운드 키 표는 모두 그 라운드로 읽는다 — config `rounds[r]`(웨이브 템플릿·전투 제한 시간·휴식 기간·리더 레벨 시간), 수입, 결정 라운드의 기변 일정(`choices.js generateDraft`), 15칸 적 일정의 그 라운드 뽑기(`waves.js roundPick`, 상·하반기 적 풀 포함), 적 배율(`gd.baseEnemyScale`: 원래 라운드 항목에 계획의 체력·공격 배율 — 추가 라운드·뒤로 밀린 최종 공세·히든 코어는 계획대로 오른 값). `gd.lastRound`·`bossRound`(= 라운드 수)·`hiddenRound`(+1)·`spRounds()`(계획의 결정 라운드)가 바뀐다. 전략·주둔 효과의 「n라운드에」·「n라운드마다」는 실제 라운드 번호로 읽는다 [ASSUMED]. `m.public.srcRound`(계획이 있을 때)로 클라의 타이머 게이지가 원래 라운드의 config를 읽고, 최종 공세 라운드 표시(브리핑·적 정보·리더 예고)는 `m.public.bossRound`를 따른다.
  - 휴식 기간(`gd.prepTime`, `customPrepSeconds`): 연합에서 공식 초 × 1.5 / × 2(반올림) 또는 고정 초; 단독 시뮬레이션과 사람이 한 명뿐인 방은 공식대로 시간 제한 없음. `m.public.prepSeconds`가 게이지 길이.
  - 목표 HP 감소 상한 해제(`gd.lpCapPerRound` = Infinity, 연합만): 정산(`settle.js`)·진행 중 −n 표시(`views.js pendingLp`)·연합 방어가 상한 없이 센다. 클라는 `public/js/ui/hud.js matchLpCap`으로 같은 값을 쓰고, 툴팁에서 「라운드당 최대 n」을 뺀다.
  - 상점 풀(관리자 결정 2026-10-20: 오퍼레이터·장비를 하나씩 고르지 않고 풀 크기만 늘리거나 줄임; `gd.poolCopies`·`gd.itemPoolCopies`, `shared/ruleset.js customPoolCount`): 그 판 인원의 공식 수량 — 오퍼레이터는 단독 표(티어별 12/14/18/16/8/5와 오퍼레이터별 예외) × 연합 2 · 8인 연합 4, 장비 재고는 티어별 4/6/7/8/7/3과 예외 × 8인 연합 2 — 에 오퍼레이터 풀 % · 장비 재고 %를 곱해 반올림하고, 공식 수량이 1 이상이면 1 아래로 내려가지 않는다. 같은 설정이 단독·4인·8인에 그대로 맞는다(배율은 인원이 정하고 %는 그 위에). 선발 오퍼레이터의 개인 재고도 오퍼레이터 풀 %를 따른다(`player/diy.js`가 `gd.poolCopies`를 읽음 — 공용 풀과 같은 비율이라 상점에서 선발 오퍼레이터가 나오는 몫이 그대로). 상점 장비가 아닌 효과 전용 장비는 계속 재고 없음. 풀에 드는 오퍼레이터(맹약 결석 규칙)와 추첨 순서는 그대로라 rng 흐름이 공식과 같다. 풀이 작으면 공식처럼 이미 보인 카드·보상·합성이 재고를 넘겨 가져간다(`pool.js` `overdraw`). 설정 창은 「진행」 탭의 「상점 풀」 묶음: 두 %와, 그 방(로비에서는 고른 모드·인원) 기준 티어별 공식 · 커스텀 수량 표 [화면 미확인].
  - 목표 HP 공유(`gd.lpShared`, 연합만): 전략을 모두 고른 뒤(`phases.js enterBattleCheck`) 최종 공세와 같은 방식으로 살아 있는 박사의 목표 HP를 하나로 합친다(`m.teamLp`, 각자의 시작 값은 `lpStart`). 정산은 각자의 감소량(상한·연합 방어 규칙 그대로)을 모두 연합 목표 HP에서 빼고, 각자의 `lp`는 그 몫으로 다시 쓴다(`_syncTeamLp`, 최종 공세와 같음 — AI가 읽는 자기 목표 HP는 연합 값 × 자기 몫, 시작 값이 같으면 ÷ 인원). 혼자 탈락하지 않고, 0이 되면 모두 그 라운드에 탈락한다. 중도 퇴장은 `연합 목표 HP × 그 사람 시작 값 ÷ (아직 남은 사람들의 시작 값 합)`(반올림)을 빼고 — 다른 사람이 남아 있으면 1은 남긴다 [ASSUMED] — 공식 최종 공세는 퇴장해도 풀을 그대로 둔다. 최종 공세는 그 몫들을 다시 합친다(합 = 연합 값). 화면: 위 목표 HP 탑이 연합 값(팀 색)과 자기 전투의 −n, 팀 목록의 줄마다 그 사람의 몫과 −n.
- 전투(`server/match/gamedata.js`·`shared/ruleset.js simRuleFlags`; 설정이 공식 값이면 배율 객체와 전투 spec이 클래식과 같아 골든이 움직이지 않는다):
  - 적 능력치(`gd.enemyScale(r)`): 그 라운드의 공식 배율(`gd.baseEnemyScale`, 라운드 수 계획 포함)의 체력·공격을 설정한 단계 배율로 바꾸고(이동 속도는 단계를 타지 않음) 일반 적 %를 곱한다. 단계 배율은 1라운드 뒤에 오른 공식 단계 수(`kHp`·`kAtk` − 1라운드 값)만큼 공식 단계 배율 대신 설정 배율을 쓴다(`stepScale`: 배율 × (설정 ÷ 공식)^단계 수; 1라운드는 그대로, 단계가 오르는 라운드도 공식 그대로 — 관리자 결정 2026-11-15). 공식 단계 배율은 모드 표에서 읽는다(`officialStep`: 단계가 가장 적은 행과 가장 많은 행; 체력은 보급선 몫 `supplyHp`가 실린 행을 뺌 — 맹약 체력 ×1.2·공격 ×1.1, 규정 공격 ×1.11). 추가 라운드의 단계 상승(`customRoundPlan`)도 이제 그 값을 쓴다(전에는 공격 ×1.1 고정이라 규정 추가 라운드가 조금 낮았다). 방어력·마법 저항은 100%가 아닐 때만 `defMul`·`resMul`로 스폰 배율에 실린다(`waves.js roundMods`) — 마법 저항은 유닛 능력치에서 원래대로 100에서 잘린다(`server/sim/units.js`). 일반 전투·현상금 적·연합 방어로 넘어간 적·최종 공세의 부속·호위가 모두 이 배율이다. AI 판단(`bot.js`)도 같은 값을 읽는다.
  - 리더 적(`gd.leaderScale(r)`, 리더 적 %; 일반 적 %는 닿지 않음): 리더 본체는 공격·방어·마법 저항(`waves.js leaderMods`; 체력은 공식대로 라운드 배율을 받지 않고 공유 풀), 이동 속도는 라운드 값 그대로. 공유 풀은 `bloodPoint × 인원 몫 × 리더 체력 %`(`gd.bossHpMul`, `finalAssault.bossPoolHp`·`GameData.bossPoolHp` 둘 다). 리더의 전투 중 소환물은 보스전 spec의 `flags.enemyScale`(이제 `gd.leaderScale`)로 체력·공격·방어·마법 저항을 받는다(`server/sim/content/bosses.js summonMods`) — 공식에서 소환물이 라운드 배율을 받는 것과 같은 자리에 리더 적 %를 얹은 것 [ASSUMED: 설정 묶음은 관리자 결정, 소환물의 묶음은 그 결정의 「리더 적과 그 소환물」].
  - 대미지 상한(`server/sim/damage.js leaderHitLimit`, `shared/constants.js bossHitLimitOf`): 커스텀 값이 300,000과 다르면 보스전 spec의 `flags.bossHitLimit`에 그 값, 「제한 없음」이면 `bossHitLimit: 0`(상한 없음; spec이 JSON으로 브라우저에 가므로 Infinity 대신 0). 「무효」는 그 값 이상인 한 방을 통째로 무효, 「상한으로 계산」은 `bossHitClamp`과 함께 그 값으로 계산.
  - 중첩 상한 해제(`flags.noLayerCap`, `gd.layerCap` = Infinity, `shared/constants.js layerCapOf`·`layerGainRoom(before, n, cap)`): 휴식 기간 쪽 증가(`player/economy.js`), 정산(`settle.js`), 정산 전 표시(`bondsMeta.bondsWithGains`), 연합 방어 도우미 순서(`unite.js`), 전투 중 실시간 사본(`sim/battle/economy.js`), 클라 결과 검사(`fields.js`, spec의 플래그로), 검사기(`invariants.js`), 클라 맹약 줄(`public/js/ui/watchBonds.js layerCapOfView`)이 모두 같은 상한을 쓴다. 10·100중첩마다 주는 보상(예견·기적 등)은 999를 넘어도 계속 나온다(관리자 결정에서 받아들임).
  - 규칙 플래그(`simRuleFlags`: `bossHitClamp`·`bossHitLimit`·`noLayerCap`, 공식 값과 다른 것만)는 이제 판이 만드는 모든 전투에 붙는다 — 일반(`combat.js`)·연합 방어(`unitePhase.js`)·보스전(`bossRounds.js`)·능력치 미리 보기(`intents.js`). 리더 경로 미리 보기(`bossPath.js`)는 전장별로 캐시하는 경로 계산이라 붙이지 않는다(상한과 무관).
- 라운드 수(관리자 결정): 줄이면 적 능력치 단계가 다른 남은 라운드와 같은 중반 일반 라운드부터 뺀다(결정 라운드·1라운드·최종 공세는 남김). 늘리면 1 … (마지막 − 1)라운드는 공식 그대로, 그 앞 후반 웨이브 셋(극한 연합 11–13)을 돌려 쓰는 추가 라운드를 최종 공세 앞에 붙이고, 추가 라운드의 능력치 단계는 그 세 라운드의 기울기로 이어서 오른다(최종 공세·히든 코어도 그만큼) [ASSUMED]. `customRoundPlan`이 이 표를 만들고 설정 창의 라운드 띠·휴식 기간 표가 쓴다. 곡선은 실제 판이 쓰는 공식 배율(config.json `enemyScale`의 `hp`·`atk`) 위에서: 1라운드 배율 × (그 라운드 공식 배율 ÷ 1라운드 배율)^거듭제곱 — 완만 0.75, 가파름 1.25, 평탄 0(`curveScale`) [ASSUMED]. 처음 0.5 / 1.5는 차이가 너무 커서 같은 날 관리자 의견으로 줄였다(극한 연합 14라운드 공식 4.30배 → 완만 3.13배, 가파름 5.92배). 설정 창 그래프도 이 배율을 그린다(처음엔 `1.2^단계`로 그려 단독·초월에서 실제와 달랐다). 커스텀 선이 공식 선과 같을 때(곡선 공식·체력 100%·공식 라운드 수)는 공식 점선만 그린다(관리자 요청 2026-10-18).
- 전달: `room.create { ruleset: 'custom', custom }`·`room.setRuleset { preset: 'custom', custom }`(평범한 객체, JSON 4096자 이하 — `shared/protocol.js isCustomWire`), `room.state.ruleset = { preset, options, custom }`, 판은 `opts.ruleset`·`m.public.ruleset`에 그대로. 정리한 뒤 같은 설정이면 아무것도 바뀌지 않고, 하나라도 다르면 다른 박사의 준비가 풀린다(`sameRuleset`). 드레인 넘기기(`Lobby.roomSnapshot`)는 `{ preset, custom }`을 적고, 프리셋 이름만 적힌 예전 파일도 읽는다.
- 로비(`public/js/screens/lobby.js`): 스위치의 커스텀 오른쪽 ⚙가 설정 창을 열고, 「이 규칙으로 적용」이 로비 설정(브라우저 저장)을 바꾸며 커스텀을 고른다. 커스텀을 고르면 쓰는 프리셋 이름과 「공식과 다른 항목 n개」(난이도 기본값과 같은 값은 셈에서 뺌)가 협의 선택의 왼쪽 설명판 끝 줄에 나온다. 연합 매칭 모드에서는 커스텀이 🔒로 잠기고 툴팁 맨 위에 이유가 나오며, 매칭은 마지막에 고른 클래식 / 캐주얼로 한다(`lobby.queueRuleset`).
- 대기실(`public/js/screens/room.js`): 방장의 ⚙는 방 설정(방이 커스텀이 아니면 로비 설정)을 열고 적용하면 `room.setRuleset`; 방장이 아닌 박사는 커스텀 방에서만 ⚙가 보이고 보기 전용 창(방장이 바꾸면 따라 바뀜)에 「내 프리셋으로 저장」. 아래 줄은 시안 비교 뒤 관리자가 고른 배치: 규칙 스위치(클래식·캐주얼·커스텀 ⚙)가 난이도 아래 줄 전체를 같은 폭으로 나눠 쓰고, 「AI 팀원은 마지막에 선택」은 가운데 준비 완료 수 바로 아래. 커스텀 방의 「빈자리 매칭」은 꺼지고 툴팁에 이유. 제목 옆 규칙 표시는 보라색 「커스텀」.
- 설정 창(`public/js/ui/customRules.js`): 탭 여섯(맹약 · 적 능력치 · 적 유형 · 리더 적 · 전장 · 진행, 탭마다 공식과 다른 항목 수), 위에 프리셋 줄(프리셋 선택 · 저장 · 새 프리셋 · 이름 · 삭제, 공식과 다른 항목 수와 「저장 안 됨」, 코드 복사 · 코드 붙여넣기), 아래 「캐주얼 값으로」 · 「공식 값으로」 · 취소 · 「이 규칙으로 적용」. 그 난이도에 없는 리더·전장과 그 난이도에서 꺼진 맹약은 흐리게, 단독 방에서는 휴식 기간·목표 HP가 잠긴다. 휴대폰 가로에서는 제목을 빼고 프리셋 버튼을 아이콘만으로. 창을 연 화면을 떠나면 창도 닫힌다.
- 프리셋(관리자 결정: 브라우저 저장 + 공유 코드, 서버·계정 저장 없음; `public/js/ui/customRulesStore.js`): localStorage `sp.pref.customRules = { v, presets: [{ id, name, rules }], active, draft }`(최대 30개, 이름 24자; 읽을 때 모든 설정을 `sanitizeCustom`), `draft` = 로비가 방 만들기·단독에 쓰는 마지막 적용 설정. 설정과 프리셋은 시즌마다 따로 둔다(2026-11-19, 관리자 요청 — 편성·선발 프리셋과 같은 `seasonPref`: 기본 시즌 맹약은 `sp.pref.customRules` 그대로라 전에 저장한 것은 맹약 것, 규정은 `sp.pref.customRules@act3autochess`). 설정이 그 시즌의 맹약·리더 적·전장·유형 id와 다른 시즌에서 빌리는 것을 적으므로, 한 벌을 두 시즌이 같이 쓰면 한 시즌에서 빌린 전장이 다른 시즌에서 자기 전장이 되고, 금지 수가 그 시즌 범위를 넘고, 그 시즌에 없는 id가 목록·요약에 남았다. `main.js`가 화면의 시즌(방이면 방의 시즌)을 따라 `setCustomRulesSeason`을 불러, 로비의 방 만들기와 방의 `room.setRuleset`은 그 방 시즌의 설정을 보낸다. 재발 방지: `test/ui/custom-rules.test.js` 「per season」. 다른 시즌에서 만든 설정은 그 시즌 데이터로 거른다(2026-11-19, 관리자 요청 — `shared/seasonBorrow.js fitCustomToSeason`): 이 시즌에 있는 맹약(`bonds.pick`)·리더 적(`bosses.ban`)만, 금지 수는 이 시즌 범위로(`customBanLimits`), 「상반기 전장 포함」은 이 시즌 데이터에 그 전장이 있을 때만, `stages.extra`는 다른 시즌이 빌려주는 것만(`borrowPlan`: 자기 전장·같은 전장은 아님), `stages.ban`은 자기 전장과 그 추가 전장만, `types.pick`은 자기 추첨 유형의 금지·고정과 빌려 오는 유형의 무작위·고정만 남긴다. 공유 코드는 만든 시즌을 적고(`s`, 모르는 버전은 무시), 다른 시즌 코드에서 그 시즌이 고른 유형은 그 시즌의 자기 유형이었으므로 빌려 오는 유형으로 바꾸지 않고 뺀다(규정에서 고정한 치명 `CRITIC`이 맹약에서 「빌려 와서 고정」이 되던 것); 그 시즌이 빌려 온 이 시즌 유형의 고정은 자기 유형 고정으로 남는다. 시즌을 적지 않은 예전 코드는 데이터로만 거른다. 거르는 곳은 둘: 설정 창의 코드 붙여넣기(뺀 것이 있으면 「이 시즌에서 쓸 수 없는 설정 n개는 뺐습니다」 알림)와 서버의 `room.create`·`room.setRuleset`(`Lobby.seasonRuleset`, 방 시즌 데이터로) — 판은 거른 것을 원래도 무시하므로(모르는 id는 버리고 금지 수는 범위로 깎음) 같은 판이 되고, 방 상태·요약·「공식과 다른 설정 n항」이 판이 실제로 쓰는 것만 보인다. 재발 방지: 원인 제거 — 방의 설정은 서버가 방 시즌으로 거른 것뿐; `test/match/custom-borrow.test.js` 「fitCustomToSeason」·「lobby: room.create」(거르기를 빼면 실패함을 확인), `test/ui/custom-rules.test.js` 「share code」. 공유 코드는 `SPC1.` + 공식과 다른 설정만 담은 JSON을 deflate-raw로 줄인 base64url(대개 100자 안팎; CompressionStream이 없으면 `SPC1j.` 비압축), 붙여 넣은 코드도 `sanitizeCustom`을 거치고, 더 새 버전의 코드는 읽되 경고한다.
- 통계(관리자 결정: 커스텀 판은 별도 탭): 기록은 `ruleset: 'custom'`으로 남고 통계 페이지의 규칙 스위치에 커스텀 탭이 생긴다(⚙ 없음).
- 판 화면(`public/js/ui/customSummary.js`): 브리핑 오른쪽 열 맨 위, 전략 선택의 「본 판 정보」 창(둘 다 `ui/matchInfo.js MatchInfo`), 게임 중 「본 판 정보」 탭(`ui/enemyDrawer.js`, 작은 판)에 「커스텀 규칙」 묶음 — 공식과 다른 설정을 묶음마다 한 줄씩 값과 함께(예: 「일반 적: 체력 150% · 공격력 120%」, 「적 능력치 단계별 상승 배율: 체력 ×1.26 · 공격력 ×1.13」, 「항상 금지 맹약: 염국」, 「금지 최종 공세 리더 적 「가상적: 갑주」 「가상적: 총」」·「금지 히든 코어 리더 적 「가상적: 관」」(가상적 셋은 두 묶음에 같은 이름으로 있어 묶음마다 따로), 「리더 적 대미지 상한: 제한 없음」(설정 창과 같은 말)·「…: 500,000 (상한으로 계산)」·「…: 1,000,000」, 「라운드 수 10」), 설정 창 탭 순서. 칩을 짧게 두려고 공식 값은 적지 않는다(관리자 요청 2026-10-18; 리더 적 이름에는 「：」가 들어 있어 이름마다 「」로 묶고 제목 뒤 콜론을 뺌). 맹약·리더 적·전장은 이름으로, 난이도 기본값과 같은 금지 수·라운드 수는 빼고, 단독 판에서는 연합 전용(휴식 기간·목표 HP)을 뺀다. 모두 공식 값이면 「공식 규칙과 같음」. 맹약별 결석은 아래 맹약 줄의 회색 표시로도 보인다. 전장 정보 미리 보기가 켜진 판의 브리핑 전장 카드 「전장 무작위 (총 n개)」는 커스텀 전장 금지 뒤 남은 수(서버 추첨과 같은 `keepUnbanned`; 하나만 남으면 「전장 고정」, 관리자 요청 2026-10-18). 브리핑·전략 선택의 위 머리줄 난이도 옆에 규칙 표시(캐주얼·커스텀; 클래식은 예전처럼 없음).
- 용어(관리자 요청 2026-10-18): 화면 문구의 领袖는 모두 「리더 적」(KR 공식 용어) — 「리더」만 쓰던 한국어 문구(알 수 없는 리더 적·리더 적 대미지·리더 적 HP·리더 적 전장·히든 코어 리더 적·이동형 리더 적 경로 미리보기·리더 적 대미지 상한(완화)·브리핑 다시 뽑기 설명·지도 범례)를 고쳤다. 限伤은 「대미지 상한」으로 통일(캐주얼 툴팁의 「피해 상한 완화」도). 적 이름의 组长·队长(「유령 리더」 등)은 다른 말이라 그대로.
- 확인: `test/ruleset.test.js`(설정 정리·옵션·`customDiffs`·`sameRuleset`·라운드 표·빠른 설정 값과 예전 곡선 읽기), `test/lobby-ruleset.test.js`(커스텀 방: 설정 전달·준비 풀림·판 opts·빈자리 매칭 대기 중 설정 잠김·드레인 넘기기), `test/match/ruleset-match.test.js`(실제 판: `m.public.ruleset.custom`, 다시 뽑기가 설정을 따름, 적 능력치 설정은 추첨을 바꾸지 않음), `test/match/custom-battle.test.js`(모든 설정이 공식 값이면 모든 모드·라운드의 적·리더 배율과 공유 풀이 클래식과 같음, % × 단계 배율, 예전 평탄 곡선 = ×1.00, 보스 웨이브의 리더·부속 배율, 실제 판 경로의 일반 전투에서 스폰된 적 능력치와 마법 저항 100 상한, 실제 보스 필드의 상한 값·제한 없음·상한으로 계산, 중첩 999 넘김: 휴식 기간·정산·전투 실시간 사본·판의 모든 전투 spec), `test/match/custom-flow.test.js`(실제 판: 모든 설정이 공식 값이면 추첨·라운드·타이머가 클래식과 같음, 맹약 금지·허용·금지 수, 리더 적·전장 금지와 모두 금지일 때, 6·20라운드의 원래 라운드 표와 끝까지 돈 판의 검사기 위반 0, 휴식 기간, 감소 상한 해제, 목표 HP 공유·전원 탈락·퇴장 몫, 8라운드 공유 판 전체), `test/match/custom-enemy-types.test.js`(특훈 적 유형: 설정 정리·차이, 고정·금지·유형 수, 설정이 없으면 클래식과 같은 추첨, 맹약 40판·규정 등급 판의 실제 경로 — 추첨 연결을 빼면 실패함을 확인), `test/match/custom-borrow.test.js`(다른 시즌 전장·유형과 배율 지정: 설정·차이, 이 시즌에 없는 것만 빌림·이 시즌 적 기록 유지·고르지 않은 빌린 유형은 추첨을 안 바꿈, 실제 판 경로 — 맹약 판이 규정 전장 #10(대포 장치)에서 싸움, 고정한 규정 치명 유형의 규정 전용 적이 나옴, 「무작위」로 둔 소생만 40판 중 일부에 나오고 고르지 않은 치명은 안 나옴, 규정 판이 맹약 하반기 #07(배기 격자)에서 싸움, `sameField`가 다섯 짝만 같다고 보고 빌리지 않음(판별을 빼면 실패함을 확인)·「기계 지원」을 주는 기록이 없음; 배율 지정의 체력·공격·리더 배율과 공식 값일 때 클래식과 같음; 브라우저 데이터 저장소의 병합이 서버 판과 같은 전장·적 기록 — waves.js의 빌린 유형 연결을 빼면 실패함을 확인), `test/match/custom-pool.test.js`(상점 풀: 단독·4인·8인 GameData의 모든 오퍼레이터·상점 장비 수량, 100%는 공식과 같음, 실제 판 경로의 공용 풀·장비 재고 수량과 공식과 같은 추첨, 선발 오퍼레이터 재고, 10% 풀로 끝까지 돈 연합 판의 오류·검사기 위반 0), `test/ui/custom-rules.test.js`(프리셋 저장소·공유 코드·화면 연결), `test/ui/custom-summary.test.js`(판 화면의 요약: 줄·값·이름, 난이도 기본값, 단독, 실제 판 경로의 `m.public`), `test/ui/stats.test.js`(커스텀 기록). 골든(`test/golden/matches.json`): `custom-coop2-HARD-11-flow`(연합 9라운드, 맹약·리더 적·전장 금지, 목표 HP 공유·감소 상한 해제, 휴식 ×1.5 — 8라운드에 연합 목표 HP가 바닥나 모두 탈락)·`custom-solo-ABYSS-12-battle-boosted`(단독 16라운드, 적·리더 적 %·단계 배율 ×1.26 / ×1.13, 대미지 상한 없음, 중첩 상한 해제 + 첫 휴식에 맹약마다 1200중첩 — 히든 코어까지 깸); 클래식·캐주얼 시나리오는 그대로. 화면: Windows Chrome 2026-10-18 — 로비 스위치·⚙·요약, 설정 창 다섯 탭(1920×1080, 휴대폰 가로 844×390), 대기실 아래 줄(1920·1280), 손님의 보기 전용 창, 연합 매칭 모드의 잠금 툴팁; 판 화면의 요약 — 단독 커스텀 브리핑(1920×1080, 휴대폰 가로 844×390, 13줄), 연합 커스텀 브리핑·전략 선택의 「본 판 정보」 창·게임 중 「본 판 정보」 탭(1600×900, 6줄), 캐주얼 브리핑의 머리줄 표시(요약 없음); 가로 넘침·페이지 오류 없음.

## 하드웨어 가속 꺼짐 안내 (2026-10-16, 관리자 요청)
- 배경: 「가끔 화면이 안 그려진다」는 제보. 페이지는 브라우저의 「그래픽 가속 사용」 설정을 직접 읽을 수 없어서 두 신호로 판단한다(`public/js/gpu.js`): `failIfMajorPerformanceCaveat`로 만든 WebGL 문맥이 거부되면(가속 꺼짐, 차단된 GPU·드라이버, GPU 없는 원격 데스크톱) 소프트웨어, 렌더러 이름이 SwiftShader·llvmpipe·softpipe·Microsoft Basic Render Driver여도 소프트웨어, WebGL이 아예 없으면 `none`. 공식 게임에는 없는 우리 안내다.
- 안내: 로비에 들어오면 한 번 경고 토스트(15초, 눌러 닫기) — 「브라우저의 하드웨어 가속이 꺼져 있는 것 같습니다 … 「그래픽 가속 사용」을 켠 뒤 브라우저를 다시 시작해 주세요」(WebGL이 없으면 간단한 화면 안내와 최신 브라우저 권유), 같은 문장이 설정 「화면」 절 맨 아래에 경고색으로 계속 남는다(`public/js/ui/gpuNotice.js`). 토스트는 언어 팩을 읽은 뒤(첫 렌더 뒤) 띄운다. 가속이 켜져 있으면 둘 다 없다.
- 진단 보고서(설정 「문제 제보」): `gpu:` 줄에 소프트웨어면 ` | software rendering`, WebGL이 없으면 `gpu: no WebGL`. 3D 보드가 꺼진 이유(`render:` 줄의 `3d off: …`)도 `WebGL2 unavailable: software rendering` / `WebGL2 unavailable: no WebGL2`로 나눈다(예전에는 둘 다 `WebGL2 unavailable`).
- 확인: `test/ui/gpu-notice.test.js`. Windows Chrome 2026-10-16 — 보통 실행은 hardware(안내 없음), `--disable-gpu`는 Microsoft Basic Render Driver로 software, `--disable-gpu --enable-unsafe-swiftshader`는 SwiftShader로 software, `--disable-webgl --disable-3d-apis`는 none; 소프트웨어 실행에서 로비 토스트와 설정 줄이 한국어로 보임.

## upstream 0.2.5–0.3.1 버그 수정 이식 — UI (2026-10-17, 관리자 결정)
upstream v0.2.4 → 0.3.1 사이 버그 수정 커밋 중 우리에게도 있던 클라 결함. 공식 규칙은 바뀌지 않는다(공식과 무관한 결함 수정).
- **마지막 사람의 전략 「跳过」** (upstream `c9197947`, PR #546): 공개 `draft.order`는 이미 고른 사람도 남겨(표시용) 그 길이로 켜던 「跳过」가 마지막으로
  고르는 사람에게도 켜져, 누르면 서버가 `BAD_TARGET 'nobody to pass to'`로 거부했다(`match/phases.js skipBand`). 이제 아직 안 고른 다른 사람이 있을 때만
  켠다(`screens/bandDraft.js draftCanPass`). 확인: `test/ui/bandDraft.test.js` 「skip requires a successor」(2·3·4명, 서버 거부 + 클라 판정). upstream의
  e2e(`band-draft-skip.e2e.test.js`)는 안 옮김 — 단위 시험이 같은 판정을 서버 공개 상태로 본다.
- **갱신 연타 한 번만** (upstream `289a454f`, upstream #501): 지연이 클 때 응답 전에 「刷新」을 다시 누르면 `g.refresh`가 여러 번 가 여러 번 과금됐다. 이제
  앞 요청이 응답을 받을 때까지 같은 요청은 버리고(`ui/gameActions.js actions.refresh`·`onRefreshBusy`), 그동안 갱신 버튼이 꺼지고 툴팁이 「갱신 중…」,
  R 단축키도 같은 함수라 함께 막힌다. upstream은 `screens/game.js`가 상태를 내려 주지만 우리는 `ui/shopBar.js`가 직접 구독한다. 확인:
  `test/ui/refresh-tap.test.js`(upstream 판 + 거부된 갱신도 풀림). upstream e2e(`refresh-tap.e2e.test.js`)는 안 옮김.
- **연결 복구 버튼이 AI 托管 화면 위** (upstream `10e1461c`): 연결 배너(`ui/connBanner.js`, 「在此页面继续」·「重新连接」)의 `--z-conn`이 60이라 AI 托管 화면
  (`.awayov` 70) 아래에 깔려 누를 수 없었다. 75로 올림(창 80·토스트 90 아래 그대로). 같은 변수를 쓰는 재연결 가림막(`.brc`)도 托管 화면 위로 온다.
  우리는 나가기 창의 「暂离」을 숨겼지만(`ui/matchChrome.js AWAY_OPTION`) 서버 자동 托管(`autoplay`)에서도 같은 화면이 뜬다. 확인: `test/ui/mock.e2e.test.js`
  「session replacement」(SP_E2E, 브라우저 — 托管 화면은 `awayStore`로 띄움).
- **선발 데이터 없이 편성 가져오기** (upstream `70151d08`·`52b70434`, PR #538): `ops`(잠재·练度)가 든 편성 파일은 현재 잠재·练度를 통째로 바꾸는데, 선발
  오퍼레이터는 `backups.json`만 이름을 안다. 그 파일이 안 받아진 채 가져오면 선발 오퍼레이터 몫이 버려진 채 저장돼 그들의 练度가 지워졌다. 이제 `ops`가 있으면
  (빈 `ops`도) 선발 편성과 같은 데이터 검사(`screens/loadout.js loadoutOpsImportRefusal` → `importRefusal('diy')`)를 먼저 하고, 모자라면 아무것도 안 바꾼다.
  확인: `test/ui/loadout-ops-import.test.js`(upstream 판).
- **선발 오퍼레이터만 바꾼 편성의 「导出」** (upstream `7a65577c`): 「导出」는 바꾼 오퍼레이터 수(`ui/loadoutModel.js changedCount`, 일반 명단만 셈)가 0이면
  꺼져, 선발 편성 탭에서 선발 오퍼레이터의 잠재·练度만 바꾼 경우 내보낼 수 없었다. 이제 `ops`가 비어 있지 않으면 켠다(`screens/loadout.js`). 「全部恢复默认」는
  그대로 일반 명단만 되돌린다(선발 몫은 선발 편성 탭 것). 확인: `test/ui/loadout-ops-import.test.js` 마지막 사례(소스 검사; upstream e2e는 안 옮김).
- **「全部恢复默认」을 옛 동기화가 덮어씀** (upstream `19c854c1`·`52b70434`, PR #540): 편성 동기화(`ui/loadoutSync.js installPrefSync`)의 `prepare()`가
  `chess`·`backups` 데이터를 기다리는 동안 「全部恢复默认」(또는 다른 수정)이 빈 편성을 먼저 보내도, 늦게 끝난 옛 준비가 옛 편성을 다시 보내 서버 사본을
  되돌렸다. 이제 수정·`welcome`마다 리비전을 올리고, 준비가 끝났을 때 리비전이 바뀌었으면 보내지도 상태를 바꾸지도 않는다(선발 편성·소유 동기화도 같은 함수).
  확인: `test/ui/loadout-sync-stale.test.js`(upstream 판, 수정 전 코드로 7건 실패 확인). 52b70434의 `tools/package.mjs`(#530 #531)는 우리에게 없음.
- **관전 중 팀원 전투의 맹약 팝업에 선발 오퍼레이터** (upstream `1188a980`): 팀원 전투를 볼 때 맹약 팝업의 멤버는 전투 중 유닛 목록(`battle/runner.js ownerOps`)에서
  오는데, 선발 오퍼레이터의 고른 오퍼레이터(`u.def.loadout.diy`)를 버려 `ui/watchBonds.js ownerBoard`가 그 유닛을 빈 선발 칸으로 보고 멤버에서 뺐다. 이제
  `ownerOps`가 선발 유닛에 고른 것의 사본(`diy`)을 싣는다(UnitInfo와 같음). 확인: `test/match/watch-bonds.test.js` 「watched normal/elite DIY operator」
  (upstream 판; 우리 선발 풀에 煌·推进之王이 없어 赤刃明霄陈(炎)·阿斯卡纶으로 바꿈, 수정 전 2건 실패 확인).
- **HEAD 요청의 Range** (upstream `d1d72185`, 서버 정적 파일): `server/http/files.js serveFile`이 HEAD에도 `Range`를 읽어 206·`Content-Range`로 답하고
  gzip 표현을 고르지 않았다(같은 파일의 GET과 ETag가 달라짐). RFC 9110 §14.2대로 `Range`는 GET에서만 읽는다. 우리는 gzip만(`acceptsGzip`, upstream은 br도)이라 손으로
  같은 한 줄. 확인: `test/lobby.test.js` 「HEAD ignores Range」(upstream 판, br 사례 뺌; 수정 전 6건 실패 확인).
- **한국어에서 글래디아·클리프하트·인포서를 고지대에 못 놓음** (upstream #676, PR #694): 고지대 판정(`shared/highGround.js meleeOnHighGround`)은 특성 원문
  「可以放置于远程位」을 읽는데, 클라 배치 판정(`screens/game.js placeCtx`)이 현지화된 기물 레코드(`gd.chess`)를 넘겨, 중국어(간체)가 아닌 언어 — 우리 기본인
  한국어도 — 에서는 칸 강조가 안 되고 놓기가 거부됐다(서버는 원문이라 맞음). 이제 배치 판정은 내려받은 그대로의 레코드를 읽는다(`ui/gameLogic/placement.js
  placementRecords`: `data.lookupRaw`·`getRaw`, 자기 선발 오퍼레이터도 원문으로 조립). 카드·상세는 그대로 현지화 레코드. 모듈 단 정예(`traitBase`)도 같은 길이라
  함께 풀림. 확인: `test/ui/high-ground-i18n.test.js`(한국어 오버레이로 원문 판정 6개 기물, 일반·정예 글래디아의 고지대 `canPlace` — 현지화 레코드로는 거부되던
  것도 확인). upstream의 브라우저 e2e(`high-ground-i18n.e2e.test.js`, 5개 언어 드래그)는 안 옮김.

## 시뮬레이션 알림 끄기 (2026-10-17, 관리자 결정)

- 공식에 없는 설정(플레이어 요청 「토스트 알림이 거슬린다」). 설정 → 「画面」에 「对局通知」(시뮬레이션 알림, MATCH NOTICES) 켜기/끄기, 기본 켜짐
  (`ui/gameLogic/settings.js matchNotices`, 이 기기 `sp.pref.settings`에 저장).
- 끄면 판 중 토스트가 모두 사라진다(`showMatchToast`; 처음엔 경고·오류는 남겼으나 같은 날 관리자 결정으로 전부 끔):
  - 서버가 보내는 토스트(`main.js`의 `m.toast`) 전 종류: 「…：获得…」(특질·맹약·아이템·선택으로 기물을 얻음), 【维多利亚】 维式重锤, 부가 맹약 층수 달성
    자금, 【远见】 구매가 인하, 【奇迹】 다음 새로고침 무료, 소환물 배치 범위 밖이라 정비 구역으로 돌아감, 지형 변화로 철수, 장비 재고 부족, 얻을 同盟约
    오퍼레이터 없음, 탈락.
  - 조작이 거부된 이유: 서버가 거절한 판 중 요청(`gameActions.js act` → `ui/matchToast.js matchToastError`, 자금 부족 등)과 게임 화면이 직접 띄우는
    거부 사유(`screens/game.js matchToast`: 정비 구역 가득, 지급 장비 파괴 불가, 관전 불가, 배치·장착 불가, 준비 완료 불가, 상점 구매 불가).
    거부 효과음은 그대로 나고, 거절된 요청은 문제 제보용 오류 기록(`diag.js`)에 계속 남는다.
- 설정과 무관한 것: 렌더러 간이 화면 전환 안내(`game.js`의 유일한 `toast`), 연결·재시작·복사 등 판 밖 토스트, 지형 칸 안내(`TileToast`).
- 확인: `test/ui/gameLogic.test.js` 「对局通知 …」 두 건(설정 값, 판 중 경로가 스위치를 거치는지), `test/ui/settings-sections.test.js`(「画面」 절 안).
  문구 `en`·`ja`·`zh-TW`·`ko/ui.json`. [실제 판 이상 없음 2026-10-28]

## 충전 스킬 표식 (2026-10-17, 관리자 제보)

- 제보: 블레미샤인·사리아 S1처럼 여러 번 충전되는 스킬(「可充能N次」)이 충전돼도 오퍼레이터 위에 아무 표시가 없어, 쌓였는지 사라졌는지 알 수 없다.
  SP 바는 한 번 충전될 때마다 0부터 다시 차므로 쌓인 충전이 화면에 전혀 안 보였다.
- 공식 클라 `UIHudCharSkillMarkPanel.UpdatePlugin`: 스킬이 AUTO(`SkillData.skillType` 2)이고 `spData.maxChargeTime` > 1이며 스킬
  프리팹의 `_hideHudSkillStackCount`(BasicSkill)가 꺼져 있으면 `_skillCntLabel` = `BasicSkill.availableCnt`(쌓인 충전 수), `_autoSkillMark`는
  그 수가 0보다 클 때만 켠다. 풀 스킬 중 이 플래그를 켠 것은 없다(EN `[uc]skills.ab` 확인 2026-10-17; `_showProgressToNext`·`_hideSkillStackCount`가
  켜진 것은 전부 MANUAL). MANUAL 스킬의 준비 표식은 `UIController.HasFunction(UNIT_HUD_SKILL_CAST_MASK 0x1000)`을 거치는데 卫戍协议는
  `AutoChessUIPlugin.OnGameInit`이 `DisableFunction(0xF07B)`로 끈다 — 그래서 卫戍协议에서 수가 보이는 것은 AUTO 충전 스킬뿐(锡人 S2·锏 S2 같은
  MANUAL 충전 스킬은 표식 없음).
- 모양(`arts/ui/[uc]battlecommon.ab` `char_skill_mark_panel` → `auto_skill_ready`): `sprite_circle` 36×36 `#404040` α.39 위에 화살표 고리
  `sprite_auto` 50×50 `#ffd900`, 가운데 `text_skill_cnt`(크기 26, 3단위 위, `#ffd900`, 글꼴 `Novecentowide-Normal`, Shadow 검정 α.5 (1, −1)).
  고리는 정지 그림이 아니다(2026-10-17 관리자 제보 「공식은 숫자를 둘러싼 화살표가 돈다」): `mark_skill_ready`에 `TweenRotate`(from 0 → to z 360,
  10초, Ease 1 Linear, loop −1 Restart, `_ignoreTimeScale` 켬)가 붙어 있고 `ConstructTweener`는 `DORotate(…, RotateMode 3 LocalAxisAdd)`
  — 10초(실시간, 배속·일시정지와 무관)에 한 바퀴, 화면에서 반시계 방향. 표식이 나타날 때 0°부터 돈다 [추정: 트윈 위상].
  숫자 높이(2026-10-17 관리자 제보 「숫자가 원 가운데에 있지 않다」): 클라 글꼴 자산 `Novecentowide-Normal`(sharedassets1, 크기 16에 `m_Ascent` 16.8·
  `m_LineSpacing` 19.2 = 1.05·1.2 em, 우리 OTF hhea와 같음)으로 Unity가 한 줄을 놓으면 1.2 em 줄 상자가 글 상자 가운데, 기준선은 그 위에서 1.05 em
  아래 — 크기 26이면 글 상자 가운데보다 11.7 아래이고 프리팹의 3 위를 더해 **고리 중심 아래 8.7**, 숫자(대문자 높이 0.7 em)는 거의 정중앙
  [추정: Unity 레거시 Text의 줄 배치를 이 모델로 봄 — 디자이너의 3 위 보정과 맞아떨어짐]. Pixi는 글리프로 잰 ascent와 그림자 크기를 더한 상자를
  가운데 맞춰 숫자가 약 3.7단위 위에 떴다 → `SkillMark._placeLabel`이 기준선(8.7 아래)과 전진 폭 가운데로 놓는다. 자리는 `_FollowPosition`: 유닛 머리 지점의 UI
  위치 + (0, 0.3, 0)(생성자의 `m_defaultSkillMarkLocalPositionOffset` 0.3). 우리는 `fxpoints.js`의 `head`(char_points.py `_headTransform`,
  130명 중 128명이 뼈대 400단위 위)를 그려진 모델에 올리고 30단위 위 [추정: UI 카메라 0.3 = 캔버스 30단위]; 머리 지점·모델이 없으면 프리팹 자리
  (hud_unit 위 154.7).
- 구현: 시뮬 `local-hud.js chargeMark` → `b.snap.charge = [[id, n]]` → `interp.js`가 표본의 `.charge`로 → `units.js` → `hud-bars.js SkillMark`.
  그림은 로컬 추출(`extract.py` ui/battlecommon에 `sprite_auto`·`sprite_circle` 추가); 없으면 어두운 원 위 숫자만.
- 충전이 실제로 쌓이고 이어서 쓰이는지(같은 제보 「저장되지 않고 사라지는지」): 풀의 충전 스킬 전부(chess.json `maxChargeTime` > 1, 63개 기물·스킬 조합)를
  적 없이 80초 → 적을 그녀 칸에 두고(치료 스킬은 아군을 계속 다친 채로) 20초 돌려 봄 — 모두 최대까지 쌓이고, 조건이 서면 AUTO는 공격마다 연달아
  (瑕光·塞雷娅 S1 1.2초 간격), MANUAL은 자동 조작 간격(2.2초, `BLOCK_SKILL_TICK`)으로 쌓인 만큼 쓴다. 공격 SP 스킬(华法琳 S1·锏 S2)은 공격이 없으면
  안 쌓이는 것이 맞음. 조건이 사라지면(치료 뒤 아군이 다 참) 남은 충전은 그대로 남는다. 시뮬 수정 없음.
- 확인: `test/render/charge-mark.test.js`(규칙, 실제 전투의 쌓임·연속 시전·목록, 실제 판 경로 至简 S2, interp, 그림 자리·색, 머리 지점). Windows Chrome
  디버그 아레나(2026-10-17): 瑕光·塞雷娅 정예 S1에 충전 2·1을 넣으면 머리 위 노란 고리 안 2·1, 풀어 두면 瑕光은 2 → 1 → 0으로 연달아 쓰고 표식이
  사라짐(塞雷娅는 다친 아군이 없어 2 유지), 오류 0. 고리 회전(2026-10-17): 같은 아레나에서 사리아·블레미샤인 정예 S1 충전 1, 전투를 멈춘 채
  1.25초 간격 세 장 — 고리가 돌고 「1」이 Novecento 글꼴로 보임, 오류 0. 숫자 높이: 4배 화면에서 숫자 중심이 고리 중심보다 8px(수정 전) → 1.5px(수정 뒤, 약 0.8단위) 위. [화면 미확인: 공식 녹화와 높이·회전 대조]

## 선택을 놓으면 단축키도 놓음 (2026-10-17, 플레이어 제보, 관리자 결정)

- 제보: 「기물을 팔 때 X 단축키가 안 먹히고, 다시 누르면 다른 오퍼레이터가 팔린다」. 撤退·出售 단축키(Q·X, upstream #114)는 마우스 아래 기물이
  아니라 **선택한**(탭한) 기물에 작동한다(`screens/game.js` keydown → `L.sel`). 그런데 선택이 남아 있어도 표시는 언더프레임의 작은 마름모뿐이라,
  Esc로 카드를 닫거나 필드 밖(채팅, 플레이어 목록 등)을 눌러 「선택을 놓았다」고 여긴 기물이 그다음 X에 팔렸다. 아무것도 선택하지 않고 마우스만
  올린 채 누른 X는 아무 일도 하지 않는다(그대로).
- 관리자 결정: 선택을 놓으면 마지막으로 선택된 기물도 지운다. 선택이 풀리는 곳:
  - 필드를 누름(전부터): 같은 기물을 다시 탭하면 해제, 다른 기물을 탭하면 그 기물로, 빈 칸이나 오른쪽 클릭이면 해제.
  - Esc: 카드·팝업 같은 것을 닫을 때 선택도 함께 풀고, 닫을 것이 없으면 선택만 푼다.
  - 필드 밖을 누름: 채팅, 플레이어 목록, 위쪽 줄 등. 선택이 남는 곳은 그 기물의 언더프레임(撤退 / 出售 / 销毁 단추), 그 기물의 카드(맹약 칸 등),
    대화 상자(销毁 확인)뿐(`.uframe, .dpanel, .modal`).
- 공식: 이 규칙(선택을 놓으면 단축키도 놓음)은 우리 단축키의 규칙이다. 공식 PC 클라에도 卫戍协议 단축키가 있지만(아래 「적 미리보기 단축키」), 出售(X)가
  선택 해제와 어떻게 맞물리는지는 확인하지 않았다.
- 확인: `test/ui/select-letgo.e2e.test.js`(목업 판, DOM 필드: Esc 뒤·채팅을 누른 뒤 X는 아무것도 팔지 않음, 카드의 맹약 칸을 눌러도 선택이 남아 X가
  그 기물만 팖, 언더프레임 出售; 수정 전 코드에서는 실패). Windows Chrome 목업 판 3D 필드에서도 같은 결과(선택 → X 판매, 채팅을 누름·Esc 뒤 X 무반응).
  [화면 미확인: 실제 서버 판]

## 적 미리보기 단축키 (2026-10-24, 관리자 요청)

- 요청: 「적 미리보기 단축키를 넣고, 설정창에서도 편집 가능하게」. 적 미리보기 = 위쪽 줄 오른쪽 🔍▶▶(휴식 기간에 카메라를 적 미리보기 구역으로
  옮기고, 거기서 다시 누르면 돌아옴, `ui/hud.js checkButtons`).
- 공식: 공식 표 `display_meta_table.pcKeyData`의 `keySettingData.autoChess`(이름 「卫戍协议」, `gameModeTag` autochess)에 단축키 7개가 있고,
  그중 `autochessViewEnemy` 「查看敌人」 기본 W(`alphaW`, 다시 지정 가능). 공식 클라에서 확인: HUD 프리팹
  `autochess_hud_panel/player_info_view/btn_check_enemy`의 가상 버튼 설정(`KeyBoardVirtualButtonConfig` groupId `autoChess` · funcId
  `autochessViewEnemy`)이 이 키를 그 버튼 누름으로 바꾼다 — 우리 오른쪽 🔍와 같은 버튼이다.
- 구현: 다시 지정 가능한 동작 `viewEnemy`(`gameLogic/shortcuts.js HOTKEY_ACTIONS` 맨 끝, 기본 `KeyW`), 설정 → 단축키 탭에 「查看敌人」(ko 적 미리보기)
  한 줄. `screens/game.js` keydown: 미리보기 중이면 돌아오고, 아니면 버튼을 누를 수 있을 때(`penAvail`: 휴식 기간, 보드 화면이 있음)만 옮긴다 —
  버튼과 같은 동작이고, 회색일 때(전투 중 등) 키는 아무것도 안 한다. 대화 상자·本局信息 서랍 뒤에서는 다른 단축키처럼 막힌다(`shortcutBlocked`).
  🔍 툴팁 끝에 지금 키(「다가오는 적 보기 · W」).
- 저장된 키 배치(0.2.0부터 `sp.pref.settings.keys`)에는 `viewEnemy`가 없다: 기본 W가 비어 있으면 W, 플레이어가 W를 다른 동작에 줬으면 비어 있는 첫
  키(A부터)를 준다(`LATER_ACTIONS`) — 두 동작이 한 키를 나누면 전체를 기본값으로 되돌리는 기존 규칙 때문에 플레이어의 배치가 지워지지 않게.
- 공식 기본값(`pcKeyData`)과 우리 기본값 — 관리자 결정 2026-10-24 「공식대로 수정, 없는 것도 추가」로 같게 맞춤:

  | 동작 | 공식 funcId · 이름 | 공식 기본 | 우리 기본(전 → 지금) |
  |---|---|---|---|
  | 갱신 | `autochessRefresh` 刷新 | D | R → D |
  | 동결 | `autochessFreeze` 冻结 | S | F → S |
  | 승급 | `autochessLevelUp` 升级 | G | D → G |
  | 상점 펼치기/접기 | `autochessShop` 调度中心 | A | (없음) → A |
  | 준비 완료 | `autochessReady` 准备就绪 | C | Space → C |
  | 판매 | `autochessSale` 出售 | X | X |
  | 적 미리보기 | `autochessViewEnemy` 查看敌人 | W | W |
  | 퇴각 | 일반 전투 묶음 `retreatChar` 撤退干员 | Q | Q |
  | 일시정지(단독) | 일반 전투 묶음 `pauseBattle` 暂停 | Space | 준비 키 겸용 → 따로 Space |

  설정 줄 순서도 공식 순서(卫戍协议 묶음 7개 → 퇴각 → 일시정지, `HOTKEY_ACTIONS`). 퇴각·일시정지는 卫戍协议 묶음이 아니라 일반 전투
  묶음(`normalBattle`)에 있어 공식 卫戍协议 안에서도 먹히는지는 모른다 — 우리는 전부터 있던 두 키를 그 기본값으로 둠 [ASSUMED].
- 상점 키(`shop`): 프리팹에서 상점 접기(`btn_close`)·펼치기(`btn_open`) 두 버튼에 붙어 있다 → 우리 상점 줄의 收起 / 展开商店과 같은 상태(`collapsed`)를
  뒤집는다. 상점 줄이 보일 때만(`showShop`), 적 미리보기 중에는 안 함(미리보기가 상점을 따로 접어 둠). 두 단추 툴팁·`aria-keyshortcuts`에 지금 키.
- 일시정지 키(`pause`): 예전에는 준비 키가 단독 전투 일시정지를 겸했다. 이제 따로 — 일시정지 단추 툴팁도 이 키. 휴식 기간에 누르면 아무 일도 없다.
- 옛 저장 배치: 예전 기본값(R·F·D·Q·X·Space, 적 미리보기 W는 있어도 됨)을 그대로 저장한 배치는 한 번도 안 바꾼 것으로 보고 공식 기본값으로 바꾼다
  (`OLD_DEFAULTS`). 직접 바꾼 배치는 그대로 두고, 새 동작(적 미리보기·상점·일시정지)만 기본 키가 비어 있으면 그 키, 아니면 A부터 빈 첫 키
  (예: 준비를 Space로 둔 옛 배치 → 일시정지는 빈 키).
- 확인: `test/ui/feedback5-hotkeys.test.js`(기본값·저장된 옛 배치·game.js 연결), `SP_E2E` `test/ui/hotkeys.e2e.test.js` 2/2(Windows Chrome,
  설정 줄 10개). 공식 기본값으로 바꾼 뒤 실제 단독 판: A → 상점 접힘 → A → 펼침, 휴식 기간 Space 무반응, C → 남은 자금 확인 → 준비·전투,
  전투 중 Space → 일시정지 → Space → 재개. 실제 단독 판(Windows Chrome 1920×1080, 한국어, 3D 보드): 휴식 기간 W → 미리보기(`.gtop.is-pen`, 오른쪽 버튼 회색) → W → 보드,
  툴팁 「다가오는 적 보기 · W」, 설정 단축키 탭에 「적 미리보기 W」.

## 8인 협동 모드 화면 (관리자 결정 2026-10-16·2026-10-19·2026-11-01, 공식에 없는 기능)

규칙·수치는 `sim.md` 「8인 협동 모드」. 공식 화면은 4명까지라 아래 배치는 모두 **[추정]**이고, 클라우드에서 짜서 화면 확인을 못 했다
(**[화면 미확인]** 전부 — 로컬 Windows Chrome에서 1920×1080·1280×720·휴대폰 가로로 볼 것).

- **로비**: 「01 시뮬레이션 방식」 제목 줄 오른쪽 끝에 「인원 4인 | 8인」 스위치(02 줄의 「규칙」과 같은 모양·자리, `lobby.size`에 기억; 툴팁에 8인
  규칙 요약; 관리자 결정 2026-10-19 — 처음의 카드 아래 줄은 「방 참가」를 밀어 옮김, 카드 안 안과 비교 시안을 보고 고름). 단독 시뮬레이션에서는 고를 것이
  없어 스위치를 감추되 자리는 남김(`visibility: hidden`, 관리자 결정 2026-10-23; 처음에는 4인에 잠그고 8인에 자물쇠) — 줄 높이가 늘 같아 두 열의 카드가 같은 높이에서 시작.
  8을 고르면 `room.create`·`room.queue`에 `size: 8`(`screens/lobby.js sizeFields`, 단독은 없음), 카드 문구가 8석 기준(「최대 박사 7명과…」「박사
  5–8명이면 시작 · AI 팀원 없음」「사람만 매칭 · 8명이 모이면 시작」), 툴팁 「…상점 풀·적 수치·연합 방어 인원은 시작 인원에 맞춰집니다」, 만들기 안내
  「만든 뒤 친구를 초대하세요(박사 5–8명)」(2026-11-01부터; 그 전엔 8석을 다 채워야 시작). 매칭에서는 스위치 옆에
  크기별 대기 인원(고른 규칙의 합), 규칙 스위치·난이도 카드의 대기 인원은 고른 크기의 대기열(`lobby.queueCounts` `counts8` → store `ui.queueCounts8`).
  커스텀 요약·설정 창은 8인 공식 밴과 비교(2026-10-22부터 4인과 같은 난이도별 표). 규칙 모드 셋은 크기와 따로 고름(매칭은 클래식·캐주얼).
- **대기 창**(`ui/matchQueue.js`): 8인 대기열의 메시지는 `size: 8`(store `ui.queue.size`), 창 제목에 「8인 연합」, 「대기 중인 박사: n/8」 「박사 8명이
  모이면 시작합니다」 「5명 이상 모이면 투표로 바로 시작할 수 있습니다」.
- **바로 시작 투표**(관리자 결정 2026-11-02, 규칙 `sim.md` 「8인 협동 모드」): 8인 대기열에 5명 이상이면 대기 창(혼자 대기)과 방 아래 줄의 상태 줄(방째 대기,
  `screens/room.js`)에 「바로 시작 제안」(`room.queueVote`, `canProposeStart`). 투표는 수락 창 자리의 「바로 시작 투표」 창(`room.matchFound`의 `vote`):
  제안자 이름, 「찬성 n · 반대 n / 인원」, 「찬성이 5명 이상이면 찬성한 박사끼리 시작하고, 나머지는 매칭을 계속합니다」, 15초 카운트다운, 「계속 기다리기」 ·
  「찬성 · 시작」(답한 뒤에는 「찬성함/계속 기다리기로 함 · 다른 박사의 투표를 기다리는 중…」). 끝난 뒤 남은 사람에게 토스트 — 「찬성한 박사 n명이 먼저
  시작했습니다. 매칭을 계속합니다」(`vote: 'started'`)·「찬성이 5명이 안 되어 매칭을 계속합니다」(`'failed'`). 소리는 그룹 수락 창과 같음
  (`queueCue`: 처음 `room.matchFound`에 matchSucceed, 대기열로 돌아오면 matchFail) [화면 미확인].
- **방**(`screens/room.js`): 연합 방의 아래 줄 「규칙」 스위치 오른쪽에 「4인 | 8인」 스위치(`room.setSize`, 관리자 결정 2026-11-02; 로비의 인원
  스위치와 같은 모양): 방장만 누르고 매칭 중엔 잠김, 다른 사람에겐 툴팁에 「생성자가 설정」. 자리에 5명 이상 앉아 있으면 「4인」이 잠기고 툴팁에
  「자리에 5명 이상 앉아 있으면 4인 연합으로 바꿀 수 없습니다」. AI 팀원이 있는 4인 방을 8인으로 바꿀 때는 「AI 팀원 {n}명이 빠집니다」 확인 창을 먼저
  띄운다(Windows Chrome 2026-11-02 — 1920·1280·휴대폰 가로 844×390, 방장·손님 툴팁). 8석을 4석씩 두 줄(`.seats--8`: 카드 높이 반, 초상·글자 축소), 제목 옆 「8인 연합」 태그. AI 추가 단추·「AI 팀원 마지막
  선택」 없음, 빈자리는 「빈자리」. 박사가 5명(`LARGE_MIN_PLAYERS`) 앉기 전 방장의 「시뮬레이션 시작」은 잠기고 상태 줄·툴팁 「8인 연합은 박사 5명
  이상이 앉아야 시작할 수 있습니다」(서버 `SEATS_OPEN`과 같은 문구, 관리자 결정 2026-11-01) [화면 미확인]. 초과 시간 경고의 초당 LP는
  `m.public.overtimeDrain`(8석 판, 시작 인원의 값)을 먼저 읽는다(`ui/matchStatus.js overtimeDrainPerSec`). 「빈자리 매칭」은 준비 조건만 보고(빈자리가 있어야 하므로) 8인 대기열 인원을 배지로, 매칭 중 상태 줄
  「대기 중인 박사: n/8」.
- **본판**:
  - 왼쪽 플레이어 목록: 5명 이상이면 `is-8` — 공식 그림 모양은 단위(`--u`)를 0.6배로 줄여 초상 48·간격 10(8줄이 위 줄과 상점 줄 사이에 들어감),
    기본 모양은 초상 0.44rem·간격 0.05rem.
  - 좌석 색: 5–8번 좌석에 장미·라임·파랑·주홍(`components.js SEAT_HUES`, 앞 넷은 그대로). 결산 그래프 색: 기본 넷 + 보라 다음에 라임 `#a3e635`·분홍
    `#e88fd0`(기본 넷·보라와 OKLab ΔE ≥ 15), 밝은 회색이 마지막 — 진영 없이 8명이 다 다른 색(`gameLogic/resultCharts.js`).
  - 전략 선택 순서 열: 5명 이상이면 이름 카드를 줄임(카드 높이 0.62rem·초상 0.42rem — 1600×900에서 8줄이 단추 위에 들어감, 칸 넘치면 줄 목록이 스크롤).
  - 기변 선택: 카드 12장은 4열 × 3줄(`spov__grid--12`; 공식 모양은 카드 그림 그대로 단위만 줄여 `min(0.64 × UI 단위, 0.08vh)`), 결정 순서 8명은 줄바꿈.
    카드 정리(`gameLogic/draft.js normalizeSp`)는 12장까지 그대로 넘김(처음엔 6장에서 잘라 8인 판의 7–12번째 카드가 안 보였음, 2026-10-22).
  - 작전 끝난 뒤 팀원 진행: 5명 이상이면 끝난 사람을 「작전 종료 n/N」 한 알약으로 접고 아직 싸우는 사람만 하나씩(`combatHud.js progressRows`).
  - 최종 공세 진입(`battleArt.js BossPrepare` multi): 5명 이상이면 앞 넷은 가운데 고리 왼쪽, 나머지는 오른쪽에 좌우 대칭(LP 판도 뒤집음; 관리자
    결정 2026-10-16 「왼쪽 4명 / 오른쪽 4명」). in_01은 고리를 화면 가운데에, in_02에서 팀이 0.62배로 줄며 왼쪽으로 가 오른쪽 열이 리더 그림 왼쪽에서
    끝남(`@keyframes bbp-team8`).
  - 결산: 카드 등장 지연을 9번째 자식까지(목록은 원래 스크롤), 칭호 6종이라 두 명은 칭호 없음(빈 칸, 그대로).
- 그대로 둔 것: 관전 ‹ › 전환(한 칸씩; 왼쪽 목록에서 바로 고를 수 있음), 결산 대미지 표 10·연합 방어 표 8(「전부 보기」 있음). 29·37열 넓은 필드의
  시점 단추는 도우미마다 절반 하나 + 가운데 全景(`render.md` 「8인 넓은 연합 방어 필드 그리기」).
- 확인: `test/ui/eight-player-ui.test.js`(로비 `size` 필드, 대기 창 크기·`counts8`, 8석 방의 좌석·시작·빈자리 매칭·AI 없음, 좌석 색 8개, 결산 색이
  진영 없이 8개·무작위 진영 배치 400개에서 겹침 없음, 진행 목록 접기, 본판 클래스, en·ko 문구).

## 오퍼레이터 구성 기본 스킬·모듈 (2026-10-22, 관리자 결정)
- 오퍼레이터 구성(干员调配)의 기본 선택을 공식 기본값(`defaultSkillIndex`·`defaultUniEquipId`) 대신 이렇게 둔다: **그라벨(砾) S1·모듈 없음**,
  **스와이어 디 엘리건트 위트(琳琅诗怀雅) S1**(모듈은 공식 기본 그대로). 이격 이그제큐터(圣约送葬人)는 공식 기본이 이미 S2라 그대로.
- 규정(act3autochess, 2026-11-14 관리자 결정): **그레이 더 라이트닝베어러(承曦格雷伊) S1**, **오올헤약(霍尔海雅) S1**, **지마 더 레이징 타이드(怒潮凛冬) S3**,
  **폰사이러스(青枳) S2**, **만트라(真言) S1**, **프로스트리프(霜叶) S1**, **실버애쉬 더 레인프로스트(凛御银灰) S2**(모듈은 모두 공식 기본 그대로), **그라벨(砾) 모듈 없음**(규정 기물 `chess_char_2_06_a`, 스킬은 공식 기본 S1 그대로).
  표는 `shared/protocol.js LOADOUT_DEFAULT_DEVIATIONS`(일반 chess id **와 charId** 기준: 시즌마다 같은 chess id에 다른 오퍼레이터가 오므로 — 규정의
  `chess_char_2_12_a`는 그라벨이 아니라 쿠오라(蛇屠箱) — 항목은 자기가 적은 오퍼레이터의 기록에만 붙는다, `loadoutDeviation`), `loadoutOptions`가 읽는다 — 구성 화면의 「기본」 표시, 저장 때 기본과 같은
  항목 버리기(`checkLoadout`), 경기의 전투 입력(`resolveLoadout`: 따로 고르지 않은 플레이어와 AI 팀원)이 모두 이 기본을 따른다.
- `data/chess.json`(`skill`·`module`·`stats`)과 키트의 기본 스펙은 공식 그대로다: sim은 고른 스킬·모듈을 명시적으로 받고, 공식 기본(그라벨 S2·모듈,
  스와이어 디 엘리건트 위트 S2)은 고를 수 있는 선택으로 남는다. 데이터의 기본을 바꾸지 않은 까닭: 키트는 데이터 기본 스킬을 `skill`, 나머지를
  `skills` 맵으로 쓰고, 소환물 표(`tokens.json`)도 기본 스킬이 만드는 소환물에서 시작한다(스와이어 디 엘리건트 위트 S2의 香槟炸弹).
- 이미 저장된 구성 중 그라벨 S2+모듈·스와이어 디 엘리건트 위트 S2는 예전엔 기본이라 저장되지 않았으므로, 이제 새 기본(S1)으로 열린다.
- 테스트 `test/ui/loadout.test.js` 「LOADOUT_DEFAULT_DEVIATIONS」, `test/match/loadout.test.js`, `test/sim/loadout.test.js`(로비 기본 = 기록 기본, 이 표만 예외).
  재발 방지: `test/ui/loadout.test.js` 「LOADOUT_DEFAULT_DEVIATIONS across seasons」(모든 시즌의 기물을 훑어 항목이 제 오퍼레이터에만 붙는지, 쓰이지 않는 항목이 없는지).

## 채팅 최근 3줄 고정 표시 (2026-10-22, 관리자 결정)

- 공식에 없는 기능(우리 채팅). 설정 「聊天提示」 절에 「常驻最近 3 条消息」(최근 메시지 3개 항상 표시, PIN RECENT) 스위치, 기본 꺼짐
  (`ui/gameLogic/settings.js chatPinRecent`). 켜면 판 중(브리핑·드래프트·결과 화면 포함, `GameChat`) 채팅을 닫아 둔 동안 채팅 버튼 위에
  최근 채팅 3줄이 계속 보인다(`ui/chat.js pinnedLines`). 떠오르는 새 줄(6초 뒤 사라짐)과 같은 자리·모양이고 사라지는 애니메이션만 없다
  (`css/chat.css .gchat__pop.is-pinned`).
- 3줄은 내 줄·입장 때 받은 이전 기록도 포함한 최근 대화 3줄이다(흐름이 보이도록); 맹약 선택 알림 줄은 빠진다. 스위치가 켜져 있으면 6초짜리
  떠오름은 쓰지 않는다(새 줄이 곧 고정 3줄에 들어가므로). 읽음 표시는 그대로: 고정 줄을 본 것은 읽음으로 치지 않아 버튼 배지가 남는다.
  방 화면 채팅(`RoomChat`)은 펼침/접힘뿐이라 바뀌지 않는다.
- 문구: `en.json`·`ja.json`·`zh-TW.json`·`ko/ui.json`(→ `ko.json`).
- 확인: `test/local-patch.test.js` 「chat: … pinnedLines …」, `test/ui/gameLogic.test.js` 「sanitizeSettings」, `test/ui/settings-sections.test.js`
  (스위치가 「聊天提示」 절 안). 화면: 관리자가 로컬에서 확인(2026-10-22).

## 채팅 차단 (2026-11-18, 관리자 결정)

공식에 없는 기능(우리 채팅). 채팅으로 분란을 일으키는 사람을 막는 세 겹이다. IP만으로 막으면 통신사 공유 주소(CGNAT)를 쓰는 휴대폰
사용자가 함께 막히므로, 서버 차단의 기준은 브라우저 ID이고 IP는 보조 신호로만, 하루 동안만 쓴다.

- **개인 차단**(`ui/chat.js` 「Blocking」): 채팅 로그에서 남의 줄을 누르면(이름만이 아니라 줄 전체 — 휴대폰 터치 대상, 글자를 끌어 고르는
  동작은 제외) 그 줄 아래에 「屏蔽 {name}」(ko 「{name} 차단하기」) 단추가 열린다. 차단하면 그 사람의 줄이 로그·떠오르는 줄·고정 3줄·안 읽음
  수·알림음에서 빠지고, 첫 줄이 있던 자리에 「已屏蔽 {name}（{n} 条）· 解除屏蔽」(「{name} 님을 차단했습니다 (n줄) · 차단 해제」) 한 줄만 남는다.
  새로 말해도 이 줄은 하나로 유지되고 줄 수만 는다. 내 화면에서만 적용되고 상대에게는 알리지 않는다. 그 방에 있는 동안 유지되며
  (탭의 sessionStorage `sp.chatBlocked`에 방 코드와 함께 둠), 새로고침해도 같은 탭이면 남는다.
- **기록 고지**: 방에 들어오거나 다시 연결해 지난 대화를 받으면, 그 뒤에 본인에게만 보이는 ⓘ 줄 「聊天内容会在服务器保存 15 天。」
  (「채팅 내역은 서버에 15일 동안 보관됩니다.」)이 붙는다(`logEntries`, store.chat `noticeAfter`; 서버로 가지 않음). 로그 맨 위에
  고정하는 안은 대화가 많은 방에 나중에 들어온 사람이 못 보므로 버렸다.
- **브라우저 ID**(`server/local-moderation.js`): 서버가 서명한 `<id>.<발급 시각>.<MAC>`를 `welcome.bid`로 주고, 페이지는 localStorage `sp.bid`에
  두었다가 매 `hello.bid`로 돌려보낸다. 서명이 맞지 않거나 없으면 새로 발급한다. 시크릿 창·사이트 데이터 삭제·다른 브라우저는 새 ID가 되며,
  이를 막는 장치(새 ID의 채팅 유예 등)는 두지 않는다(관리자 결정). 브라우저 지문은 쓰지 않는다(같은 기종 휴대폰끼리 겹침, 관리자 결정).
- **로그**: 연결의 첫 hello마다 `[id] <playerId> b=<id> net=<네트워크 키> "<이름>"`, 채팅 줄마다 `[chat] <방> <playerId> b=<id> "<이름>": "<글>"`,
  사람이 협동 방에 들어갈 때마다 `[room] <방> <playerId> b=<id> net=<네트워크 키> <경로> "<이름>"`(경로: `created` 방 만들기 · `joined` 입장 ·
  `spectating` 관전석 · `reserved` 예약한 자리 · `matched` 빠른 매칭, 관리자 결정 2026-11-18 — 문제가 된 방의 사람들을 방 코드 하나로 찾는다).
  솔로 방은 채팅도 다른 사람도 없으므로 남기지 않는다(관리자 결정 2026-11-18).
  운영 서버는 이 줄들을 15일 동안 보관한다(관리자 결정 2026-11-18, 처음 30일에서 줄임).
- **서버 차단**(채팅만, 관리자 결정): `SP_MODERATION_DIR/chat-bans.json`에 적힌 브라우저 ID의 채팅은 그림자 처리된다. 보낸 사람(같은 브라우저의
  다른 세션 포함)에게는 평소처럼 보이고 다시 받는 기록에도 있지만, 다른 사람에게는 가지 않는다. 방 입장과 게임은 막지 않는다. 서버는 파일이
  바뀌면 10초 안에 다시 읽으므로 재시작이 필요 없다. 두 배포 칸이 같은 폴더(키 `.key`, 차단 목록)를 쓴다.
- **같은 네트워크 따라가기**: 차단된 브라우저가 나타난 네트워크 키(IPv4 주소 또는 IPv6 /64)를 시각과 함께 차단 항목에 적는다. 차단 뒤에 발급된
  ID가 그 키에서 마지막 목격 후 24시간 안에 채팅하면 그 ID도 그림자 처리하고 `[mod] net mute` 줄을 남긴다(사이트 데이터를 지운 같은 사람일 가능성이
  큼). 차단 전부터 있던 ID — 같은 통신사 주소 뒤의 다른 사용자 — 는 건드리지 않는다. 같은 주소에서 차단 뒤 처음 들어온 다른 사람이 하루 동안
  함께 막힐 수 있으며, 관리자가 그 ID를 `allow`에 넣어 풀 수 있다.
- **공유 주소에서는 따라가지 않음**(2026-11-18, 관리자 결정 「자동 판별로」): PC방·회사·학교·휴대폰 통신사 공유 주소에서 처음 온 다른 사람이 함께
  막히지 않도록, IPv4 키가 공유 주소이면 따라가기를 하지 않고 `[mod] shared net=<키> (<이유>): no follow-up …` 줄만 남긴다. 공유 주소는 셋 중
  하나다. ① **셈**: 지난 24시간 그 키에서 서버가 본 서로 다른 브라우저 ID(차단된 ID는 빼고)가 `SHARED_IDS` = 3개를 넘음(관리자 결정 — 가족이
  같이 쓰는 집은 대개 단독으로 남음). 셈은 `identify` 때 서버 메모리에 하고 24시간이 지나면 버리며, 넘은 때 `[mod] shared net=<키>: n browser ids`
  줄을 남긴다. 두 배포 칸은 따로 세는데, 이 때문에 판단이 보수적으로 될 뿐이다. ② **휴대폰 통신사 대역** `MOBILE_V4`: 출처는 나무위키 「통신사 IP」의
  「목록」 절(2026-11-09 판)이고, 대역마다 소유 기관을 KRNIC WHOIS로 확인했다(2026-11-18). SK텔레콤은 가정 유선이 없어(유선은 SK브로드밴드)
  모두 넣었다. KT·LG U+는 할당 안에 유선과 모바일이 섞여 있어 목록이 모바일 데이터로 적은 블록만 넣었고, 125.188(WHOIS상 LG 파워콤 Xpeed,
  가정 유선)·61.43(3G 종료)·211.235(WHOIS 기록 없음)는 뺐다. 대역을 잘못 넣으면 그곳에서 따라가기를 놓칠 뿐 남을 막지는 않으며, 휴대폰은
  비행기 모드만 켜도 주소가 바뀌어 따라가기가 원래 잘 듣지 않는다. ③ **차단 파일의 `shared` 목록**(IPv4 CIDR): 배포 없이 대역을 더할 때 쓰며,
  10초 안에 다시 읽힌다. IPv6 /64는 가입자 한 명의 것이라 공유로 보지 않는다. 공유 주소에서 차단된 사람이 사이트 데이터를 지우고 오면 놓치고,
  자기 집에서 데이터를 여러 번 지워 집 주소를 공유로 만들 수도 있다. 이 놓침은 받아들였다(관리자 결정 — 운영자가 로그를 보고 새 ID를 직접 차단).
- 재발 방지: `test/local-moderation.test.js`(서명·발급, 차단·네트워크 따라가기·하루 만료·allow, 공유 주소 셈·하루 뒤 초기화·통신사 대역·`shared`
  목록·IPv6 제외, 실제 서버에서 그림자 줄이 방·늦게 온 사람·기록에 가지 않음, 차단 줄·고지 위치). 화면: [화면 미확인] 관리자가 로컬에서 확인.

## 전투 중 팀원 전장 보기 (2026-10-25, 관리자 결정 「편의 기능으로 지금 시즌에도 적용」)

- 공식 지금 시즌은 자기 일반 전투(各自行动)가 도는 동안 팀원을 못 본다(「当前无法查看」, `docs/research/09-ux-official.md` §6.3). 새 시즌
  위수협의(CN 업데이트 방송에서 소개)는 자기 전투 중에도 다른 전장을 본다 — 공식 지금 시즌과 다르지만 편의 기능으로 모든 시즌에 먼저 켠다.
  팀원 아바타 → 팀원 정보 창의 「前往查看」(아래 「팀원 정보 창」) → 그 전장의 표시 사본, 「返回战场」/자기 행으로 돌아온다. 联防·最终攻势의 ‹ › 절반 전환은
  그대로(다른 조 보스 필드는 아래 2026-11-20 줄).
- 최종 공세·히든 코어에서 다른 조(짝)의 보스 필드도 본다(관리자 결정 2026-11-20 「편의 기능으로 모든 시즌에」, 히든 코어 포함). 공식은 못 본다 —
  활동 설명 「最终攻势中，两名参与者会处于同一个战场，但无法查看另一组队友的战场情况」(최종 공세에서 2인 1조로 같은 전장에 위치하지만, 다른 조의 전장
  상황은 확인할 수 없습니다). 위 각자 행동 풀기와 같은 길: 서버 `watch.js`의 `watch`(서버 계산 판)·`_watchClient` 두 곳의 `other group hidden`
  거절, 클라 `observeTarget`·`gameLogic/watch.js watchTarget`·`public/dev/game-mock.js`의 거절을 없앴다(문구 「无法查看另一组队友的战场」는 언어
  파일에 남김). 다른 조 팀원 행에 前往查看 틀이 붙고(`teamPanel.js` goTag ← `observeTarget`), 누르면 그 보스 필드의 표시 사본, 자기 행 「返回战场」으로
  자기 짝 필드에 돌아온다. 자기 보스 전투는 화면 밖에서 돌고(권한이면 끝까지 돌아 보고, 짝의 표시 사본이면 돌아올 때 따라잡음), 리더 HP 막대·팀
  LP·초과 시간 LP 감소는 원래 매치 전체 값(b.pool·m.public)이라 어느 필드를 보든 같다. 일시정지(단독)는 원래 매치 전체를 멈춘다. 새로고침·재연결
  때 서버가 보던 필드를 다시 보내면 화면이 그것을 보는 필드로 받는다(`resumedWatch`가 최종 공세·히든 코어의 다른 조 보스 필드도 받음). 시험:
  `test/match/runner.test.js` 「watching the other pair's boss field」(실제 g.watch 경로, 화면 밖 자기 보스 전투가 끝까지 돌고 결과가 서버 계산과 같음,
  돌아오기), `test/match/finalAssault.test.js`(서버 계산 판), `test/match/observe.test.js`, `test/ui/uiFixes.test.js`, `test/ui/mock.e2e.test.js`
  「the other pair of the Final Assault may be watched」.
- 「放弃战斗」(전투 포기, `ui/surrender.js`)은 늘 자기 필드를 끝내므로 다른 필드를 보는 동안에는 숨긴다(관리자 결정 2026-11-20): 다른 조 보스 필드,
  각자 행동의 팀원 전투 모두(`screens/game.js` `watchingOther` → `ui/hud.js TopBar`). 자기 짝 필드의 반쪽을 ‹ ›로 보는 것은 자기 필드라 그대로 보이고,
  짝이 낸 포기 투표 띠도 그대로 뜬다. 재발 방지: `test/ui/mock.e2e.test.js` 「the other pair of the Final Assault may be watched」.
- 계산은 브라우저만 한다(관리자 결정 2026-10-24: 보는 전투를 서버가 계산해 보내는 안은 버림). 자기 전투는 화면 밖에서 그리지 않고 계속 돌아
  보고하고(`battle/runner.js`: 권한 전투는 `cur`가 아니어도 매 프레임 진행 — 숨은 탭과 같은 길), 보는 전투는 받은 b.start로 따라잡아 그린다.
  비용은 시뮬 하나 더(틱당 0.01–0.058 ms 측정, 2026-10-15)와 보기 시작할 때의 따라잡기(프레임당 ≤ 240틱), 그리는 양은 그대로.
- 자기 전투가 화면 밖에서 끝나도 화면이 알도록 실행기 `state().mine`(가장 최근 자기 전투 `{ battleId, fieldId, kind, done }`)을 내보내고,
  `game.js localDone`이 그것을 읽는다(대기 띠 WAIT_FINISH·일시정지·`myDone`). 보는 동안 자기 전투 진행(처치/총수, 끝나면 ✓,
  `battle/observe.js ownProgress` → `ui/combatHud.js`): 공식 그림이 있으면 관전 캡션(초록 ob_other) 오른쪽 10 간격에 공식 ob_self 모양 칩
  (`bg_ob_self` + `icon_ob_self` + 「你自己」, 숫자는 금색 숫자 글꼴, `ui/battleArt.js ObInfo own`, 관리자 요청 2026-10-25 「공식 UI와 더 비슷하게」)
  — 공식 지금 시즌엔 없는 칩이라 자리·모양은 [추정]; 그림이 없으면 관전 줄 아래 진행 칸. 위 LP 표시의 −N은 원래 자기 필드 기준이라 그대로 보인다.
- 「返回战场」은 팀 패널 자기 행의 공식 버튼(`btn_return_self`)만 — 하단(관전 캡션 옆·联防 ‹ › 줄)의 「返回战场」 버튼은 없앴다(관리자 결정
  2026-10-25). 관전 중이면 자기 행에 늘 있다(`ui/teamPanel.js` `observe.observing`).
- 서버 `server/match/match/watch.js _watchClient`의 「own battle running」 거절과 클라 `observeTarget`의 「作战中无法查看队友」 거절을
  없앴다(그 문구는 언어 파일에 남김 — 한국어 팩은 지운 항목을 upstream 기계 번역으로 채운다). 보는 중 새로고침·끊김은 원래대로 끊길 때
  서버가 그 필드를 넘겨받는다(takeover) — 다시 들어오면 그 필드는 표시 사본.
- 시험: `test/match/runner.test.js` 「watching a teammate while the own battle runs」(화면 밖 진행·결과가 서버 계산과 같음·`mine`·돌아오기),
  `test/match/observe.test.js`, `test/match/clientCombat.test.js` 「observing」, `test/match/watch-bonds.test.js`. 화면: Windows Chrome
  1920×1080·844×390(2026-10-25, 협동+AI 팀원 2라운드) — 전투 중 「前往查看」, 「你自己」 칸, 화면 밖 자기 전투 끝 → WAIT_FINISH 띠·팀 행 ✓,
  「返回战场」으로 끝난 자기 전장; ob_self 칩·하단 버튼 없앰도 같은 두 크기(진행 중 「자신 0/6」, 끝 「자신 ✓」).

## 라운드 대미지 패널 (2026-10-25, 관리자 결정)

- 공식에 없는 기능(`feat`). 관리자 요청 2026-10-25: 「라운드가 끝났을 때 오퍼레이터별로 넣은 대미지를 보여주는 기능」. 시안 비교 뒤 관리자 결정:
  PC는 자세히(초상·이름·막대·대미지·비율), 휴대폰은 간단(초상·막대·대미지), 설정에서 바꿀 수 있게; 기본은 접힘; 소환물은 소환한 오퍼레이터에
  합산; 연합 방어 전투는 넣지 않음; 내 오퍼레이터만; PC 자리는 오른쪽(시안: 효과 아이콘 줄 아래 칩, 왼쪽으로 패널); 휴대폰은 칩이 상점 「갱신」을
  가려서(시안 1차, 관리자 제보) 팀 초상 줄 아래 칩, 오른쪽으로 패널; 설정에서 끄고 켬; 서버는 라운드마다 대미지만 보냄.
- 화면(`public/js/ui/roundDamage.js`, 계산은 `public/js/ui/gameLogic/roundDamage.js`): 「伤害」 칩(교차한 칼 표시)을 누르면 패널이 열리고, 머리의
  「–」이나 칩으로 닫는다. 열림 여부는 브라우저에 기억(`sp.pref.roundDamageOpen`, 기본 닫힘). 보여주는 값의 우선순위: 이번 라운드의 정산 값
  (`m.roundDmg`) > 전투 단계에서 자기 전투의 실시간 값(「实时」 빨간 점, 칩에도 점) > 지난 라운드의 정산 값(「回合 N」). 자기 전투가 끝나 연합 방어를
  기다리는 동안은 브라우저가 끝까지 센 값(점 없음). 라운드 번호가 지금 라운드나 바로 앞이 아닌 메시지(앞 판의 것)는 보이지 않는다. 줄은 대미지
  순, 1위는 금색, PC 8줄·휴대폰 5줄까지(나머지는 「另外 N 名 · 合计」). 팔린 오퍼레이터는 보드에 없어 줄은 없고 합계에만 든다. 숫자는
  `fmtNum`(설정 「숫자 단위」를 따름). 관전자·설정 끔이면 없음, 첫 정산 전에도 칩 없음.
  - PC 자리: `.gm__effects` 안, 첫 효과 아이콘 왼쪽에 칩, 패널은 칩 왼쪽에 위를 맞춰. 시안의 「효과 줄 아래」는 효과가 쌓이면(최대 10개, 판 후반
    결정 등) 칩이 내려가 「동결」·「갱신」에 닿아서 고정 자리로 옮겼다(구현 중 판단, 관리자 확인 필요). 휴대폰(모서리 도구를 ⋯로 접는 `css/devices.css`와 같은 미디어
    쿼리): `ui/teamPanel.js`의 `after` 칸(팀 목록 아래 칩, 목록 오른쪽에 패널). 모양 「自动」은 이 미디어 쿼리로 자세히/간단을 고른다.
    단독 판은 공식 그림이 있으면 팀 목록을 숨기는데(`css/hud-art.css .team.is-solo`, 공식 단독 화면에 목록 없음) 목록 통째로 숨기면 그 안의 칩도
    사라졌다(관리자 제보 2026-10-25 「모바일에서 칩이 안 보임」) — 목록의 행·바탕만 숨기고 빈 목록을 위쪽(나가기 단추 아래)에 두어, 칩은 그 자리,
    패널은 칩 아래로 연다.
  - 설정 → 화면: 「回合伤害统计」(켬/끔, 기본 켬)·「伤害统计样式」(自动 / 详细 / 简洁, 기본 自动; 끔이면 숨김) — `DEFAULT_SETTINGS.roundDamage`
    / `roundDamageStyle`(`ROUND_DAMAGE_STYLES`).
- 데이터: 합산 규칙은 결산 대미지 탭과 같다(`shared/roundDamage.js foldRoundDamage` — 보드 체스 uid, 보드 소환물 말은 `ownerUid`의 체스, 전투 중에
  생긴 유닛은 결과 `unitStats`의 `ownerUid`; 뒤에 오퍼레이터가 없는 유닛(맹약 소환물)은 아무에게도 안 셈).
  - 서버(`server/match/match/settle.js _sendRoundDamage`, 보스 라운드는 `bossRounds.js`): 라운드 정산마다 사람 플레이어에게
    `m.roundDmg { round, units: [[uid, dmg, heal, 물리, 마법, 트루, 원소], …] }`(자기 전투만, 대미지 순). 플레이어에 남겨(`ps.roundDmg`) 다시 연결·재동기화 때 다시 보낸다
    (`platform.js _resync`) — 정비 중 새로고침해도 지난 라운드가 보임. 봇·관전자에게는 없음. `m.private`에 넣지 않은 까닭: `m.private`는 바뀔
    때마다 통째로 가므로(차분 없음) 라운드에 여러 번 같은 값이 실린다.
  - 트래픽(측정 2026-10-25, 봇 매치 험지 — 사람 자리는 AI 대행, 단독 3판·4인 3판·8인 2판): 메시지 평균 106–116 B·최대 154 B(오퍼레이터 7–10명),
    그 라운드에 서버가 플레이어 한 명에게 보내는 양(평균 35.9 / 50.1 / 69.3 KB, 대부분 `m.private`·`b.start`·`m.public`)의 0.17–0.30%, 한 판
    1인 약 1.4–1.5 KB. 웹소켓 압축은 꺼져 있어 그대로 전송량. 처치·치유까지 실으면 최대 464 B(1% 미만)였으나 패널이 대미지만 써서 대미지만(관리자 결정).
  - 실시간(`public/js/battle/runner.js ownDamage`): 가장 최근의 자기 전투(연합 방어 제외, 화면 밖에서 도는 것 포함)의 내 유닛을 `liveUnitDamage`
    (`ownerUnit`을 보드 uid가 있는 소환자까지 거슬러 감)로 읽고 패널이 같은 규칙으로 합산. 전투 단계 동안 0.5초마다 읽는다(읽기만, 전투를 바꾸지 않음).
- 시험: `test/match/round-damage.test.js`(실제 매치 경로 — 클라이언트 전투·서버 전투: 사람에게만 라운드마다 한 번, 최종 공세 라운드 포함, 보드
  오퍼레이터만·한 번씩·대미지 순, 합 ≤ 그 전투의 대미지, 다시 연결 때 재전송; 합산·`liveUnitDamage` 단위), `test/ui/round-damage.test.js`(값 우선순위·
  앞 판 메시지 무시·줄·설정·문구). 화면: 모의 화면(`/dev/game-mock.html` — `m.roundDmg`를 보내고, 모의 전투는 브라우저 시뮬이 아니라
  `ownDamage`를 40초 동안 커지는 값으로 대신함)을 Windows Chrome 1600×900·844×390(2배율) 한국어로: 정비·전투 × 접힘·펼침, 휴대폰 자세히, 설정
  화면 탭; 휴대폰 단독(`&variant=solo`) 칩 y 52–70·패널 그 아래, 휴대폰 칩(y 304–322)이 「갱신」(y 244–274)과 겹치지 않음, PC 칩은 효과 3개·10개 모두 같은 자리(1435–1514, 261–291), 페이지 오류 없음.
  (덤으로 본 것: 효과가 10개면 효과 줄 자체가 「갱신」 아래까지 내려간다 — 이 변경 전부터.) 실제 판(브라우저 시뮬의 실시간 값·연합 방어 라운드·8인
  협동의 긴 팀 목록 아래 칩)은 [화면 미확인].

- **치료 탭과 유형별 막대 (관리자 결정 2026-11-06, 시안 2안)**: 머리의 제목 자리에 「伤害」·「治疗」 탭(고른 탭은 브라우저에 기억, `sp.pref.roundDamageTab`).
  - 대미지 탭: 막대를 피해 유형별로 쌓고(물리·마법·트루·원소, 색은 범례 줄과 같음) 넓이는 오퍼레이터 자기 대미지 안의 비율이다. 유형 값이 없는 보고면 범례 없이 전과 같은 막대.
  - 치료 탭: 치료한 오퍼레이터만, 치료량 순, 초록 막대, 1위 금색 없음. 합계에는 팔린 오퍼레이터의 치료량도 든다.
  - 집계: `u.stats.byType`(`server/sim/damage.js`, `stats.dmg`와 같은 자리에서 같은 값을 더함). 침식 폭발 같은 `elemental`은 원소, 유실(流失)은 트루. 읽기 전용 값이라 전투 결과와 golden은 움직이지 않는다.
  - 브라우저 전투의 보고에도 실린다(`server/sim/spec.js compactResult`, `shared/protocol.js`, `server/match/fields.js`).
  - 트래픽(측정 2026-11-06, 2인+봇 2 협동, 서버 전투 2판 58건, 오퍼레이터 최대 8명): 메시지 평균 221 B·최대 292 B(전: 평균 약 113 B·최대 134 B). 2026-10-25에 「대미지만」으로 줄였던 것을 탭을 위해 되돌렸다.
  - 이 패널은 공식에 없는 기능이다. 근거는 xinhai 포크의 통계 확장(포크의 네 수치 대신 관리자가 고른 2안).

## 기물을 고르고 집을 때의 측면 카메라 (2026-11-06, 측면 카메라 2026-11-07, 시즌별 2026-11-11)

- 공식 동작(공식 클라에서 확인, 비공개 녹화와 대조 — 재투영 오차 1~4 px). 관리자 결정 2026-11-07로 옮겼다. 공식 카메라의 `Offset` 노드가 `Placeholders/SideBy`(위치 (−0.75, −0.5, −1.0), Y축 −10°)로 옮겨 가며 돈다(`render/projection.js SIDE_BY`, `Camera.yaw`). 판의 세로축 기준 회전이라 앞뒤로 숙이는 `tilt`와 달리 판이 옆으로 기운다.

  | 상태 | 조건 | 컨트롤러 | `Offset` |
  |---|---|---|---|
  | 상점 열림 / 접힘 | 기본 | `left_shop` / `left_prepare` | 기본 |
  | 기물 고름 | 자기 기물을 탭함 | 그 칸의 x, y + 상점 상태의 높이 z | SideBy |
  | 기물 집음·방향 휠 | 드래그, 합법 드롭의 방향 휠 | 상점 접힘(`left_prepare`) | SideBy |

- **규정에는 측면 카메라가 없다**(관리자 결정 2026-11-11). CN 「규정」 녹화(1920×1080, 오퍼레이터·장비 끌기와 방향 선택 4장)에서 판이 기울지 않고, 같은 전장의 세 장은 카메라가 같다. 규정을 돌리는 공식 CN 클라에는 측면 카메라를 거는 `AutoChessCameraPlugin._RefreshSideBy`가 없고 플러그인이 새 설정(`AutoChessCameraPlugin.CameraSettings`)을 받는다(공식 클라에서 확인). 카메라 프리팹(`cameracontroller` `SideBy`)·플러그인 프리팹(`act3autochess_battle_camera_plugin` `_moveTween` 12·`_scaleTween` 9)·레벨 카메라 값(`configBlackBoard`)은 맹약과 같다. 맹약은 지금 시즌을 돌리는 EN 클라대로 측면 카메라. 시즌 스위치 `shared/seasons.js` `noSideCamera`, 고르는 곳 `ui/gameLogic/camera.js sideCameraOn`·`sideCamera`(`tilt`).
  - 규정에서도 기물을 집으면 상점이 접히고, 고르면 카메라가 그 칸으로 간다(위 표에서 `Offset`만 기본). 집을 때 접히는 것은 녹화 4장이 모두 접힌 상점이라 맞다. [추정·CN: 고를 때 칸으로 가는 것(`CUSTOM_CHARACTER`)은 CN 클라에도 그 이름이 남아 있지만 규정 코드를 못 읽고 탭으로 고르는 녹화가 없음]
  - 설정 → 화면 「拿起棋子时侧面镜头」(`sideCamera`): 자동(기본, 시즌대로) · 켜짐 · 꺼짐. 두 시즌에 같은 값이 걸린다. 공식에 없는 선택지지만 관리자 요청으로 둔다(관리자 결정 2026-11-11).
- 고쳐 쓴 값은 공식 값에서 나온다: 집은 상태 카메라 5.93열·3.99행·높이 11.10, 상점 카메라 대비 필드 중앙 칸 ×1.116(녹화 측정 ×1.108~1.113), 고른 상태 (6열, 7행) ×0.916(측정 ×0.918). 별도 확대 값은 없다(`test/render/projection.test.js`).
- 비행(공식 클라에서 확인, 녹화의 멈춘 비행 프레임과 맞음): 컨트롤러는 레벨의 `move_time` 0.25초, `Offset`의 위치·회전은 `_moveTime` 0.2초, 둘 다 OutQuart. 둘을 따로 보간한다(`flyRig`, `render/app.js stepCamera`). 손으로 상점을 접고 펼 때(전 0.75초 InOutCubic)와 적 대기열을 오갈 때(전 0.25초 InOutCubic)도 같은 비행이다(관리자 결정 2026-11-07). 고른 뒤 다른 기물을 고르거나 집으면 그 자리에서 새 비행이 시작된다. 방향 휠은 카메라를 더 옮기지 않는다.
- 모델: 공식 모델은 판에 붙은 `Graphic` 평면이라 측면 카메라에서 화면 왼쪽으로 약 5° 기운다(녹화의 대기열 모델과 대조). 우리 모델도 `Unit.body`를 `Camera.lean`만큼 돌린다. 머리 위 표시는 공식처럼 똑바로 선다.
- 집는 동안과 합법 드롭의 방향 휠이 열린 동안 상점이 접히고, 끝나면 플레이어 자신의 접기 상태로 돌아온다(`public/js/ui/gameLogic/camera.js deployFoldsShop`, `sideCamera`, `foldCamera`, `public/js/screens/game.js`). `collapsed`는 쓰지 않고 상호작용에서 유도한다. 관리자 확인 2026-11-06: 공식에서도 접힌다(upstream #602, PR #646과 같은 동작).
- 기물을 고른 동안에도 상점이 접힌다(공식 녹화의 대기열·필드 기물 탭, 관리자 확인 2026-11-07). 카메라 높이만은 상점 상태 그대로다. 필드를 누르면 선택은 곧 풀리지만 상점과 카메라는 손을 뗄 때까지 기다린다(`selectedTile`). 다른 기물을 탭하는 사이에 상점이 손가락 밑에서 열리지 않게 하려는 것으로, 우리 쪽 조작 처리다.
- 고른 동안·집은 동안·방향 휠이 열린 동안에는 상점 펼치기 버튼이 없다(공식 녹화, 관리자 확인 2026-11-07, `ShopBar canExpand`). 자금 표시는 남는다. 공식 상점 키(`autochessShop`)는 그 버튼 노드(`btn_open/entry_enable_hotspot`)에 붙어 있어(공식 클라에서 확인) 우리도 이 동안 키를 받지 않는다. [추정·화면: 버튼이 숨은 동안 키를 눌러 본 공식 화면은 없음]
- 손으로 접는 것(`foldCamera`)은 그대로 드래그가 끝날 때까지 미룬다. 적 대기열 위(`pen`), 팀원 보드, 전투, 준비 완료 뒤에는 접거나 돌리지 않는다.
- 플레이어의 접기 상태로 돌아오는 것은 [추정·화면: 공식에서 상점을 접어 둔 채 집었다 놓는 경우를 화면으로 보지 않음].
- HUD: 공식 비율 그대로이되 `clearHud`가 보드 띠를 HUD 밖에 둔다. 측면 카메라의 줄은 기울어 있어 띠는 시선 축 위의 점으로 잰다(왼쪽 끝이 낮지만 그 위에는 HUD가 없다). 1920×1080 집은 상태에서 위로 5.4 px, 844×390에서 8 px쯤 옮겨진다. 고른 상태는 그 칸만 HUD 밖에 두므로 데스크톱에서는 공식 그대로다.
- 비행 중에 포인터가 멈춰 있어도 잡은 기물과 드롭 칸이 따라오도록 `render/drag.js refresh`가 포인터 아래 칸을 다시 읽는다.
- 설정 「拿起棋子时收起商店」(`deployFold`)은 공식에 없는 선택지라 주석 처리했다(관리자 결정 2026-11-07; 측면 카메라 설정은 위 규정 줄). 토글은 `ui/settings.js`에 주석으로 남고, 저장된 끔도 더는 읽지 않는다.
- 필드 기물 탭의 카메라 위치, 상점을 접어 둔 채 고르기, 보스 라운드, 오른쪽 보드는 공식 클라에서 확인했지만 조사한 녹화에는 없다. [화면 미확인]
- 확인: `test/render/projection.test.js` 「the official side camera」, `test/ui/issue5-fold-camera.test.js`(시즌·설정: 「sideCameraOn」), `test/render/drag.test.js`. Windows Chrome 모의 판(1920×1080, 844×390): 탭·집기·휠·취소 뒤 카메라가 시작값과 정확히 같음, 휠 칸이 측면 카메라의 드롭 칸과 같음. 그림 드로콜 프레임당 17.5(상점)→17.4(측면), 15개 유닛.

## 알뜰살뜰 인형 효과 아이콘 하나 (2026-10-25, 관리자 결정)

- 관리자 요청 2026-10-25: 알뜰살뜰 인형(精打细算玩偶, 장착하면 사라지고 라운드 시작마다 자금 +1, 정예 +2)을 쓴 만큼 오른쪽 효과 줄에 아이콘이
  하나씩 쌓였다 — 하나만 보이고, 툴팁에 실제로 라운드마다 받는 자금을 보여 달라.
- 서버의 효과는 그대로 인형마다 하나(`server/match/builtinMeta.js gain_coin_when_round_start`, 게임 동작 변화 없음). 보이는 목록
  (`server/match/player/views.js effectsView`)만 `effect:builtin_round_coin` 효과들을 첫 인형 자리의 한 항목으로 합치고 `roundFunds`(합한
  라운드당 자금)·`stack`(쓴 개수)을 싣는다. 목록 줄(`public/js/ui/effectsList.js`; 2026-11-12까지는 툴팁)은 아이템 설명 대신 「每回合开始时额外获得 {n} 资金」과, 둘 이상이면
  「已使用 {n} 个」. 아이콘에 숫자 배지는 달지 않는다(배지는 다른 효과에서 남은 횟수라 헷갈림). 효과 줄은 10개까지라 인형이 다른 효과를 밀어내던
  것도 없어진다.
- 시험: `test/content/items.test.js` 「精打细算玩偶 used three times」(일반 둘 + 정예 하나 → 한 항목, `roundFunds` 4 = 다음 라운드 시작에 실제로 받은 자금).

## 위수협의 시즌 고르기 (2026-11-01, 관리자 결정)

- 공식 게임에는 두 시즌이 함께 열린 적이 없어 고르는 화면이 없다 — 이 서버의 기능이다. 새 시즌을 지금 시즌 옆에 방마다 고르게 두기로 한
  관리자 결정(2026-10-24, `shared/seasons.js` 머리말)의 화면 쪽이다. 서버가 시즌을 둘 이상 열 때만 보이고, 하나면 아무것도 보이지 않는다
  (지금 공개 서버는 하나).
- 시즌 이름: 등록부의 `name`(제목 「위수 협의：<이름>」의 시즌 낱말, 번역되는 msgid)과 `mark`(위 라틴 글자). 지금 시즌 `act2autochess`는
  표에서 상·하반기 모두 「卫戍协议:盟约」이고 이 서버에는 하반기만 있어 화면에는 「맹약」만 쓴다(관리자 결정 2026-11-01). 새 시즌
  卫戍协议【规程】은 활동 ID와 데이터가 나오기 전이라 자리표시 `next`(공개 안 됨, 이름 「규정」 — 공식 KR이 없어 임시 번역, `mark`
  REGULATION; 데이터는 지금 시즌 것)로 두고 `SP_SEASONS=next`인 서버만 연다. 데이터가 나오면 이 항목을 진짜 ID로 바꾼다.
- 관리자 결정(2026-11-01): ① 타이틀(닉네임 화면)에서 고른다. ② 오퍼레이터 설정과 통계는 시즌마다 따로. ③ 처음 온 사람은 이전 시즌(지금
  시즌, `DEFAULT_SEASON`). ④ 업데이트 소식과 작전 팁은 같이 쓴다. 나머지(로비 칩, 방 표시, 초대는 방의 시즌, 시즌별 매칭 인원, 지난번
  시즌 기억, 하나면 숨김)는 제안대로. 꼴은 시안 셋 중 **C**(로그인 상자 맨 위 시즌 탭). BGM·배경 그림이 시즌을 따라 바뀔지는 새 시즌
  데이터를 보고 정한다. → 관리자 결정(2026-11-13)으로 ①·③을 바꿈: 시즌은 **로비의 시즌 칩에서만** 고르고(타이틀의 시즌 탭 없앰, 타이틀은
  고른 시즌의 그림·BGM·글자를 그림), 처음 온 사람(고른 적 없음)은 **가장 새 공개 시즌**(`shared/seasons.js newestPublicSeason` — 등록부의
  마지막 공개 항목, 서버 응답 전에 정해져 타이틀이 깜빡이지 않음 — 서버 응답 전의 열린 시즌은 아래 클라이언트 항목). 로비 칩으로 바꾸면 화면 전체가 암전된다(아래 「로비 시즌 전환」).
- 서버: 소켓의 첫 `pong`에 `seasons`(방이 쓸 수 있는 시즌, 둘 이상일 때만; `Lobby.connectInfo` → `server/net.js`). 닉네임 전(hello 전)
  이라 타이틀도 안다. 랜덤 매칭은 시즌마다 따로 큐(`room.queue { season }`, 방 큐는 방의 시즌, 매칭으로 만든 방은 큐의 시즌;
  `server/matchmaking.js` 머리말), `lobby.queueCounts`는 기본 시즌을 지금처럼 `counts`·`counts8`로, 다른 시즌은
  `seasons: { [id]: { counts, counts8 } }`로 더 싣는다.
  오퍼레이터 설정·보유·선발(`room.loadout`·`room.ownership`·`room.diy`)은 어느 시즌의 것인지 `season`을 싣고(기본 시즌이면 없음, 열지 않은
  시즌은 거절) 그 시즌 데이터로 검사해 세션에 시즌별로 둔다(`server/lobby.js settingsOf`: 기본 시즌은 원래 필드, 다른 시즌은
  `session.seasonal`). 좌석은 방 시즌의 설정을 받고, 방과 다른 시즌의 메시지는 세션에만 남아 좌석·경기에 닿지 않는다 — 시즌이 기물 ID를
  바꾸면 다른 시즌 데이터로 검사해 설정이 통째 거절되거나 빠지는 것을 막는다.
- 클라이언트 `public/js/ui/season.js`: 고른 시즌은 브라우저 설정 `season`(서버가 열지 않으면 기본 시즌). 첫 `pong` 전(`ui.seasons`가
  `null` = 아직 모름)에는 공개 시즌과 기억한 시즌을 열린 것으로 보고, `pong`이 그 시즌을 안 싣으면 그때 고친다(`offeredSeasonsOf`; `pong`에
  `seasons`가 없으면 기본 시즌 하나). 예전엔 모를 때 기본 시즌 하나로 봐서, 규정을 고른 사람의 페이지가 처음 몇 순간 맹약이었고
  `main.js`가 부팅 때 정한 입장 영상(맹약)이 시즌이 바뀌자 끊겨 탭 화면·규정 영상이 안 나왔다(2026-11-13 관리자 제보). 화면의 시즌(`activeSeason`) =
  방에 있으면 방의 시즌, 초대 링크를 기다리는 동안은 링크의 시즌, 아니면 고른 시즌 — 그 시즌의 데이터(`data.setSeason`)·오퍼레이터 설정
  (설정·보유·선발 셋, `ui/loadoutSync.js setLoadoutSeason`: 기본 시즌은 원래 키, 다른 시즌은 `<키>@<시즌>`)·통계(기록에 `season`, 기본
  시즌은 없음 = 예전 기록과 같음; 통계 창은 그 시즌 기록만)를 쓴다. 방 만들기는 고른 시즌으로, 랜덤 매칭은 연합 매칭 목록의 시즌 드롭다운 시즌으로 보낸다(처음 값 = 고른 시즌; 「랜덤 매칭」 절 「공개방」의 「매칭 대상 시즌」).
  - 전환 중의 옛 파일(2026-11-16 관리자 제보): `data.setSeason`은 시즌을 바로 바꾸지만 파일은 그 시즌 번역 파일을 받은 뒤 다시 받는다 —
    그 사이 `load()`·조회는 앞 시즌 파일을 돌려주고, 두 시즌은 같은 기물 ID(공식 표의 `chess_char_<등급>_<번호>_<a|b>` 칸)에 다른
    오퍼레이터를 둔다. 맹약 브라우저가 규정 방을 관전하거나 초대 링크로 진행 중인 방에 들어가면(거절 → 고른 시즌으로 잠깐 → 관전 →
    방 시즌) `b.start`가 바로 그 사이에 와서, 브라우저 전투 시뮬레이션이 맹약 파일로 만들어져 규정 것으로 남았고(관전·관전 전투의
    오퍼레이터 모델과 전투 자체가 다른 오퍼레이터), 준비 화면 기물도 그때 읽은 것을 다음 동기화까지 그렸다. 이제
    `battle/runner.js loadBrowserSim`은 `seasonSettled`·`borrowSettled`가 바뀌지 않을 때까지 기다린 뒤 파일을 읽고, `render/app.js`는
    `chess`·`tokens`·`items`·`backups`가 다시 준비되면 준비 화면 기물을 다시 읽으며(`setPrep`), 선발 기록 캐시(`render/app/host.js diy`)는
    기물 기록·`backups` 파일마다 둔다. 재발 방지: `test/seasons.test.js` 「a sim loaded while a season switch waits」.
  - 타이틀: 시즌 탭 없음(2026-11-13) — 고른 시즌(초대를 기다리는 동안은 링크의 시즌)의 제목·그림.
  - 브라우저 탭 제목: 화면의 시즌을 따른다(관리자 결정 2026-11-13; `season.js seasonTitle` → `lang.js setDocTitle`, 언어를 바꿔도) —
    「위수 협의: 규정 · STRONGHOLD PROTOCOL」. `index.html`의 고정 제목은 맹약 것.
  - 로비: 위 막대 왼쪽(접속 수 옆) 시즌 칩 「시즌 맹약 ▾」, 누르면 시즌 목록과 「오퍼레이터 설정·통계는 시즌마다 따로, 작전 팁·업데이트
    소식은 함께 씁니다」. 난이도 카드의 「n명 매칭 중」과 규칙 스위치의 대기 인원은 고른 시즌의 큐(2026-11-20부터 연합 매칭 목록의 시즌 드롭다운의 큐 — 「공개방」 「매칭 대상 시즌」).
  - 방: 제목 아래 「시즌 · 규정」 표시(기본 시즌이 아니면 금색). 빈자리 매칭 배지는 방 시즌의 큐.
  - 초대: 기본 시즌이 아닌 방의 초대 링크는 `&season=<id>`를 붙이고 초대 문구도 그 시즌 이름. 그런 링크로 온 타이틀은 초대
    카드에 「이 연합은 「규정」 시즌입니다 — 그 시즌으로 들어갑니다」. 고른 것과 다른 시즌의 방에 들어가면(링크·키 입력·관전) 막지 않고
    고른 시즌을 그 방 시즌으로 바꾸고 알림 「이 연합은 「규정」 시즌입니다 — 시즌을 바꿨습니다」. `&season`이 없는 방 링크는
    맹약 방으로 읽는다(`ui/season.js inviteSeasonOf`) — 처음 온 사람의 기본이 최신 시즌이어도 맹약 방 초대가 그 시즌으로 보이지 않게.
- 확인: `test/seasons.test.js`(첫 pong에만 `seasons`, 시즌 하나면 없음; 시즌별 큐·대기 인원·매칭으로 만든 방의 시즌; 열지 않은 시즌의
  `room.queue`·`room.ownership` 거절; 설정이 시즌 데이터로 검사되고 시즌마다 따로, 방은 그 시즌 것만), `test/ui/season-picker.test.js`(고른 시즌·화면 시즌·큐 인원·초대 링크·pong·방 시즌 따라 바꿈·설정 키·설정 메시지의 `season`·통계 기록).
  Windows Chrome(로컬 서버 `SP_SEASONS=next`, 2026-11-01, 데스크톱 1920×1080·휴대폰 가로 844×390, 한국어): 타이틀 탭과 고른 뒤 제목,
  로비 칩·메뉴, 방 만들기 → 방 「시즌 · 규정」, 다른 브라우저(기본 시즌)가 초대 링크로 와서 초대 카드의 시즌 줄 → 들어가 알림·시즌 바뀜,
  `/data/s/next/*.json`을 읽음, 페이지 오류 없음. 시즌이 하나인 서버에서 아무것도 안 보이는 것은 시험으로만 확인(`pong`에 `seasons` 없음).

## 플레이 중 관전자 수·명단 (관리자 결정 2026-11-18, PR #19)

- 두 시즌의 플레이 화면 상단, PC·모바일 모두 적 미리보기 버튼 바로 오른쪽에 눈 아이콘과 관전자 수를 표시한다. 관전자가 1명 이상일 때만 그린다(관리자 결정 2026-11-18). 누르면 기존 강화 효과 목록 창과 같은 바탕·테두리·숫자 글꼴의 작은 명단을 연다.
- 서버의 `room.state.spectators`를 그대로 구독한다. 수와 이름의 별도 복사본을 두지 않아 입장·퇴장·재접속 때 함께 갱신된다. 대기실과 같은 관전석 기준이므로, 연결이 끊긴 채 유지되는 좌석은 수에 포함하고 행을 흐리게 표시한다. 다른 팀원의 전장을 보는 플레이어는 관전석 명단에 더하지 않는다.
- 폭과 여백을 줄인 창에서 4명을 한 번에 표시하고, 5명부터 세로 스크롤만 사용한다. 가로 스크롤은 없다. 0명이 되면 단추가 사라지고 열려 있던 창도 함께 닫힌다(다음에 생기면 닫힌 채로). 이름은 텍스트로 그리며 긴 이름은 줄바꿈한다. 닫기·Esc·바깥 누르기로 닫는다.
- 명단은 관전자 아이콘 아래에 오른쪽 끝을 맞춰 열며, 핑·준비 완료·갱신·동결 버튼과 겹치지 않는다. 버튼은 막대 왼쪽 강화 효과 단추의 거울이다(관리자 결정 2026-11-19, 돋보기 높이에 맞추던 2026-11-18 결정을 바꿈): 같은 90×55 칸을 중앙 HUD 오른쪽 끝에 붙이고, 같은 59×37 판을 6단위 위에, 눈 아이콘은 그 판의 큐브 자리, 수는 강화 효과 수 자리. 판은 강화 효과 단추 그림(`buffBtnSprite`)에서 큐브와 그 빛(x 9–33)을 판만 있는 x 40 열로 덮어 만든다(`ui/spectators.js cubeFreePlate`, 캔버스 — 늘리지 않아 테두리가 원본 픽셀 그대로; 59×37이 아닌 그림이면 만들지 않고 우리 모양 상자). 칸이 돋보기 오른쪽 끝 위로 넘어가므로 칸은 누름을 통과시키고 단추·명단만 받는다(휴대폰에서 돋보기 끝 2 px를 삼켰음). 휴대폰 844·740 터치에서 돋보기와 관전 단추의 44 px 누름 영역 사이는 4 px 떨어져 겹치지 않는다(시안 때 1 px씩 잼) [화면 미확인].
- 실제 서버와 관전자 WebSocket 5개를 연결해 두 시즌의 휴식 기간·전투 중 관전자 수/이름, 입퇴장·재접속, 4명 표시·세로 스크롤·가로 스크롤 없음, 휴대폰 가로 화면을 확인한다. PC·모바일 7개 크기(667–1920 px)에서 핑 9999ms, 준비 완료·적 미리보기·상점 버튼과 아이콘/명단이 겹치지 않는지, 단추가 강화 효과 단추의 거울 자리·크기인지, 돋보기 오른쪽 끝을 누르면 돋보기가 받는지 확인한다. 720 px 이하 가로 화면은 단추가 보일 때만 중앙 HUD 폭을 줄여 오른쪽 버튼 공간을 확보한다(`.gtop__center.has-spectators`) — 관전자가 없으면 막대는 PR #19 전과 같은 폭이다 [화면 미확인].
- 재발 방지: `test/ui/spectators-live.e2e.test.js`.

## 관전자의 자리 예약 (2026-11-04, 관리자 결정)

공식 방에는 관전석이 없어 이 포크만의 기능이다. 관전자가 자리를 예약해 두면 시뮬레이션이 끝나거나 재시작될 때 빈자리에 자동으로 앉는다.

- 관전석 수: 방장이 판 시작 전에 2~6석 중에서 고른다(`room.setSpectatorSeats`, 관리자 결정 2026-11-05, 기본 2석 — 그 전까지의 수). 이미 앉은 관전자보다 적게는 안 되고(`ROOM_FULL`), 경기 규칙이 아니므로 준비는 풀리지 않는다. 다음 판과 드레인 인계에 유지된다.

- 메시지: `room.reserveSeat { on }`(`server/lobby.js` 머리말 「Seat reservation」). 먼저 예약한 사람이 먼저 앉고, `room.state.spectators[].reserved`가 그 순번이다. 취소하거나 관전석을 떠날 때까지 유지된다. 플레이어가 보내면 `ALREADY`.
- 앉는 때(`fillReservedSeats`): 판이 끝날 때(나간 사람의 자리를 비운 뒤), 재시작·브리핑 재추첨의 새 판이 시작되기 전(8인 방의 5명 조건도 앉힌 뒤에 센다), 대기실에서 자리가 빌 때(퇴장·강퇴·접속 만료, AI 제거, 4인 → 8인). 대기실에서 빈자리가 있는데 예약하면 바로 앉는다.
- 빈자리만 채운다. AI 자리는 방장이 일부러 넣은 자리라 넘기지 않고, 방장이 AI를 빼면 그 자리에 앉는다.
- 재시작의 새 판에는 준비 확인 없이 바로 참가한다(예약 자체를 동의로 본다). 일반 종료 뒤에는 준비 해제 상태로 앉아, 방장은 다른 박사처럼 그 사람의 준비를 기다린다.
- 접속이 끊긴 예약자는 건너뛰고 순번을 유지한다. 재접속 뒤 다음 시점에 앉거나 「착석」으로 직접 앉는다. 사람이 아무도 남지 않으면 예약이 있어도 방은 닫힌다(관전자는 방을 유지하지 못한다).
- `room.join`을 쓰지 않는 이유: `removeMember`가 `dropReplay`를 불러 재접속 때 다시 보낼 결과 화면이 지워진다. 결과 화면은 그대로 보고 방으로 돌아오면 자리에 앉아 있다.
- 드레인 인계: `roomSnapshot`·`adoptRoom`이 순서(`reservedSeq`)를 넘긴다.
- 화면(관리자 결정 2026-11-05): 대기실 하단 큰 버튼은 빈자리가 있으면 「착석」, 없으면 「자리 예약」/「예약 취소」, 매칭 중이면 비활성 「관전 중」. 관전석 줄에 「예약 n」, 방장은 관전자가 없어도 이 줄이 보이고 여기서 드롭다운으로 관전석 수를 고른다(하단 줄은 자리가 없어 세 줄로 밀리면 아래가 잘림). 드롭다운은 위로 펼치고(아래는 하단 줄·화면 끝), 휴대폰에서 버튼은 작게 두고 터치 영역만 넓힌다(`.tapx`). 다른 사람은 「n/m」으로 읽는다. 관전석 줄은 좌석처럼 채팅창을 피해 좌석 영역 가운데에 놓고, 상태 줄 전체가 관전자 수와 관계없이 한 줄이다(관리자 결정 2026-11-08 — 이름 칩을 줄에 늘어놓으면 여섯 명에서 상태 줄이 세 줄로 꺾여 좌석 카드가 낮아졌다): 이름은 「명단 · 예약 k명 ▴」 단추 하나로 접고(관전자 수는 「관전석 n」에 있고, 폭 700 px 이하에서는 예약 수도 목록에만), 누르면 단추 오른쪽 끝에서 위·왼쪽으로 펼치는 목록에 이름 전체·「예약 n」·방장의 ✕가 있다(Esc·바깥 누르기로 닫힘; 터치 화면은 줄마다 32 px, ✕가 줄 높이를 다 씀). 판 화면에서는 왼쪽 아래 버튼 줄에 전 단계 공통으로 두고, 브리핑·전략 선택 화면에서는 관전 나가기 창에서 누른다. 끝나는 판의 엔딩이 도는 동안 막 앉은 사람은 그 판에 행도 `m.private`도 없으므로 화면은 계속 관전으로 그린다(`screens/game.js` `spectator`).
- 확인: `test/lobby-seat-reserve.test.js`(실제 `Match`), `test/ui/spectator.e2e.test.js`(Windows Chrome: 대기실·판 중 예약, 재시작 뒤 플레이, 결과 화면 뒤 착석).

## 박사 자리에서 관전석으로 옮기기 (2026-11-15, 관리자 결정)

관전석과 같이 이 포크만의 기능이다. 관전자가 「착석」(`room.join`)으로 박사 자리에 앉는 것의 반대 방향이다.

- 서버(`server/lobby.js seatToSpectator`, 머리말 「Spectator seats」): 대기실에서 박사 자리에 앉은 사람이 자기 방 코드로 `room.spectate`를 보내면 박사 자리를 비우고 관전석에 앉는다. 생성자였으면 남은 박사에게 생성자 권한이 넘어가고(`migrateHost`), 자리를 예약한 관전자가 있으면 비운 자리에 바로 앉는다(`fillReservedSeats`). `removeMember`를 쓰지 않아 방에 그대로 있고 결과 화면 재전송(`replay`)도 남는다. 박사 자리로 돌아올 때는 새 자리라 준비가 풀려 있다.
- 거절: 판 진행 중(`ROOM_STARTED`), 1인 방이거나 관전석이 다 참(`ROOM_FULL`), 방에 남은 마지막 박사(`BAD_TARGET` — 관전자는 방을 유지하지 못해 방이 바로 닫힌다. AI 팀원만 남는 경우도 같다).
- 화면(시안 A, 관리자 결정 2026-11-15): 내 좌석 카드의 ⋯ 메뉴에서 「일러스트 변경」 아래 「관전석으로 이동」(눈 아이콘). 두 버튼은 넓은 쪽에 맞춘 같은 폭이고, 아이콘은 왼쪽 같은 자리, 글자는 아이콘 오른쪽 공간의 가운데에 놓는다(`.rseat__menu-list`; 버튼 전체 기준 가운데면 긴 글자가 아이콘에 닿음). 위 거절 조건에서는 항목이 없고(`toSpectateOption`), 관전석이 다 찼으면 비활성에 「관전석이 모두 찼습니다」 툴팁. 생성자가 누르면 「생성자 권한이 다른 박사에게 넘어갑니다」 확인 창을 먼저 띄운다.
- 확인: `test/lobby.test.js`(「a player moves to a spectator seat」), `test/ui/room-to-spectate.test.js`, Windows Chrome에서 박사 두 명 방의 메뉴·이동(데스크톱 1600×900, 휴대폰 844×390 터치).

## 초대 링크로 자리 없는 방에 들어갈 때 관전 제안 (2026-11-14, 관리자 결정)

관전석과 같이 공식 방에는 없는 이 포크만의 기능이다. 초대 링크(`?room=`)의 자동 참가(`main.js schedulePendingJoin`의 `room.join`)가 박사 자리 때문에 거절되면 오류 토스트 대신 관전 제안 창을 띄운다(`ui/inviteSpectate.js`).

- 서버: 협동 방이 `room.join`을 `ROOM_FULL`(자리 없음)·`ROOM_STARTED`(판 진행 중)으로 거절하면 오류 프레임에 `room { players, seats, round, spectators, spectatorSeats }`를 붙인다(`Room.joinRefusalInfo`, `server/net.js errorMsg`). `players`는 AI를 포함해 찬 자리 수, `round`는 대기실이면 0. 1인 방과 없는 방 코드에는 붙이지 않는다(관전석이 없음).
- 창(시안 A, 관리자 결정 2026-11-14): 제목은 거절 이유(「방이 가득 찼습니다」 / 「시뮬레이션이 이미 시작되었습니다」 / 「방이 매칭 중입니다」), 설명 한 줄, 방 정보 줄 「코드 박사 4/4 · 대기실(또는 n라운드) · 관전석 n/m」, 「빈자리가 나면 자동으로 앉기 (자리 예약)」 체크(기본 켜짐; 판 진행 중이면 「작전이 끝나고 빈자리가 나면 자동으로 앉기」, 매칭 중이면 예약이 거절되므로 체크 없음), [닫기] / [관전으로 입장]. 입장은 `room.spectate`, 체크가 켜져 있으면 이어서 `room.reserveSeat { on: true }`.
- 관전석도 다 찼으면 창 없이 「초대받은 방은 박사 자리와 관전석이 모두 찼습니다」 토스트. 다른 오류는 예전처럼 오류 토스트.
- `room.spectate`는 heavy 버킷(초당 2, 최대 6)에서 꺼내는데, 초대 시즌 전환이 방금 `room.loadout`·`ownership`·`diy`로 대부분 썼다. 바로 누르면 `RATE`로 거절되므로 0.7초 뒤 한 번 다시 보낸다(e2e에서 재시도를 빼면 실패하는 것 확인).
- 창이 떠 있는 동안 다른 방에 들어가면 제안은 지워진다(방을 나와도 다시 뜨지 않음).
- 확인: `test/lobby-invite-spectate.test.js`(실제 서버·`Match`: 거절 프레임의 방 정보, 판 중 예약, 1인 방·없는 코드), `test/ui/spectator.e2e.test.js` 「invitation link to a full room」(Windows Chrome: 창·방 정보 줄·체크 기본값, 관전 입장과 예약, `RATE` 재시도).

## upstream 0.3.3 화면 가져오기 — 타이틀·로비 허브·협의 선택 (관리자 결정 2026-11-07)

upstream 0.3.3(`dev` eff7d93ab)의 공식 느낌 화면을 손으로 이식한다(GPL-3.0, 그림·동작의 출처는 upstream PR #878·isomerpoi의 허브 작업). upstream은 병합하지 않으므로(하드 포크) 화면별로 다시 짜고, 우리 요소(시즌, 접속 인원, 연합 매칭, 방 참가·관전, 업데이트 소식)는 유지한다. 새 시즌 「규정」 공개(2.0.0)와 함께 나갔다.

- **타이틀**: 첫 방문은 검은 「탭하여 시작」 화면(소리 재생 허락을 받는 탭) → 공식 행사 입장 영상(`ui/allianceScene.js` `mountAllianceIntro`, 30 fps 공식 녹화를 따라 공식 스프라이트 `entry/*`·`prepareBkg/*`를 움직임) → 타이틀. 영상의 효과음은 공식 `act1autochess_g_ui_load`(녹화 1.686 s), 로비 음악은 녹화 2.144 s에 처음부터 시작(`ui/entryFilm.js`). 탭·키로 건너뛴다. 동작 줄이기 설정, 세로 휴대폰, 스프라이트 하나라도 못 받은 경우, 방·판으로 복귀하는 경우에는 영상 없이 바로 타이틀. 전환 막대·케이블·INPUT 판·글자 줄과 조준 상자의 등고선 고리는 스프라이트가 없어 녹화를 보고 그린 평면 도형이다 [추정·화면].
- **규정 시즌 입장 영상**(관리자 결정 2026-11-13, 「공식처럼」): 시즌마다 자기 행사의 영상을 튼다(`ui/entryFilm.js` `filmFor`: 맹약은 위 영상, 규정은 아래, 영상을 추출하지 않은 시즌은 없음). 규정은 공식 클라에서 확인한 허브 패널 `panel_act3autochess_on_entry`의 진입 클립 `autochess_entry_season_on`(legacy Animation, 3.17 s)을 그대로 재생한다(`ui/clipFilm.js`). `tools/local-extract/season_ui.py`가 영상 노드 `canvas_front/entry_anim_season_on`과 검은 덮개 `cover_black_in`의 RectTransform 트리·Image(스프라이트·종류·색·재질)·CanvasGroup 알파, 재질이 그리는 것(셰이더 속성으로 판별: 숫자·ID 시트, 원, 디졸브, 가산 합성), 클립의 모든 키프레임(접선 포함)을 `season/act3autochess/entry/film`에 쓰고, 재생기는 Unity처럼 배치(1280×720 캔버스를 화면에 Expand)하고 Hermite 곡선으로 값을 구한다.
  - 0–2.57 s: 로딩 화면(로고·안내문·ID 카드 넷·로딩 막대와 숫자) → 지도로 확대 → 원과 로고. 2.57 s에 영상 노드가 꺼진다.
  - 2.23–3.17 s: 클립의 허브 부분을 타이틀에 옮겨 튼다(`data-reveal`, `clipFilm.js` `titleReveal`): `canvas_back` → 시즌 배경(배율 1.4→1, 알파), `title_effect/root_title` → 로고(배율 1.15→1, 아래에서 올라옴), `bottom_view` → 로그인 상자(아래에서 올라옴), `top_menu` → 양쪽 위 모서리, `panel_left` → 소개 글·아래 링크·바닥 줄. 공식 허브의 앞 건물 층 `bg_front`가 검정에서 밝아지는 것(2.43–2.77 s)은 우리 배경이 한 장으로 합성돼 있어 빠진다.
  - 소리: 클립 0 s의 `EventPlayUI ON_AUTOCHESS_LOAD3` = `autochess_b_ui_load_3`(`audio.sfx.ui.load3`)을 녹화대로 영상 0.25 s에 튼다. 로비 음악은 녹화(3.1 s까지)에 들리지 않아 클립이 끝나는 3.17 s에 시작한다 [추정·화면].
  - [추정·화면] 공식 녹화(규정, CN, 2026-11)에 맞춘 것: 원 셰이더 중 `mat_shape_circle_soft`는 제 색의 얇은 선, `mat_shape_circle_tile_add`는 옅은 주사선 띠로 그린다. `mat_entry_map_dissolve`의 주사선 지도는 디졸브가 가운데를 지날 때 가장 밝다. `ui_particle`의 입자는 지도 표식을 지나 도는 청록 빛줄기 셋(1.2–1.85 s)으로 그린다. 다른 번들의 스프라이트인 로딩 막대 섬광은 붉은 빛으로 그린다.
  - 탭하여 시작·건너뛰기·동작 줄이기·세로 휴대폰·방·판 복귀 규칙은 맹약과 같다. 그림을 하나라도 못 받으면 영상 없이 타이틀.
- 타이틀 배경은 행사 로비의 밤·노을 20초 순환(`AllianceBackdrop`, 스프라이트를 다 받은 뒤에만; 그 전과 실패 때는 예전 산맥·레이더 배경). 맹약 시즌에서는 점 문장 대신 공식 로고 `entry/season_logo`를 영상이 끝나는 크기로 둔다. 다른 시즌(규정)은 그 시즌에서 추출한 허브 배경과 로고(`ui/seasonArt.js`), 추출이 없으면 점 문장. 휴대폰에서는 로고가 점 문장과 같은 자리를 쓴다(`devices.css`).
- 영상 건너뛰기: 자동화 브라우저(`navigator.webdriver`)에서는 영상을 틀지 않는다 — 탭을 기다리며 화면을 몇 초 덮어 브라우저 시험이 멈춘다. 화면 확인 스크립트는 페이지가 열리기 전에 `__SP_ENTRY_FILM__ = true`를 두면 영상을 본다.
- **로비 허브**(`screens/lobby.js`): upstream 허브 배치에 우리 요소를 넣은 시안대로(관리자 결정 2026-11-07). 가운데 레이더 속 문장과 시즌 제목, 왼쪽 위 「업적 통계」 카드(박사 이름·번호, LV·트로피, 아래 「업적 통계」 절의 창을 엶), 그 아래 방 참가 칸(초대 코드·방 참가·관전·최근 코드)과 작전 팁 | 업데이트, 오른쪽 위 S.W.E.E.P. 보고서(아래 「S.W.E.E.P. 보고서」 절)·오퍼레이터 설정 판(입구 두 개 폭 그대로), 오른쪽 아래 입구 셋: 단독 / 연합 / 연합 매칭(카드 안 왼쪽 위에 그 시즌 전체 대기 인원과 모든 시즌의 공개방 수 — 「랜덤 매칭」 절 「공개방」; 카드 위 줄은 2026-11-20에 지움). 위 막대: 돌아가기·핑·접속 인원·설정(네모)·전체 화면(네모, 브라우저가 전체 화면을 못 하면 없음 — iPhone Safari), 오른쪽에 시즌 칩. 전체 화면 자리는 게임 방법 단추였다(관리자 요청 2026-11-18, 대기실도 같음). 게임 방법은 타이틀과 판 시작 단계 머리, 판 안 메뉴에 남는다. upstream의 로비 배경·음악 바꾸기(자체 그림)와 판(버전) 고르기는 가져오지 않았다. 높이 520 px 이하(가로 휴대폰)는 upstream처럼 왼쪽 열을 숨기고 오른쪽 판에 「업적 통계」와 「방 참가 · 관전」을 더한다 — 2026-11-08부터는 폭 760 px 미만 휴대폰만(아래 「새 시즌 UI 다듬기」).
- **흐름**: 단독·연합 매칭 → 시뮬레이션 선택(협의 선택, 전체 화면) → 시작. 연합 → 시뮬레이션 선택(연합, 관리자 결정 2026-11-08): 시즌·규칙·인원 줄과 난이도 카드에서 고른 값으로 「방 만들기」(`room.create`), 대기실 아래 막대가 같은 창을 열어 바꾼다(아래 「대기실·협의 가동」). 공식 방 만들기 화면 `auto_chess_room_select_state`는 만들 때 설정이 없고 방에서 고친다 — upstream과 2026-11-08까지의 우리도 기억된 난이도·규칙으로 바로 방을 만들었지만, 방을 만든 뒤 따로 고쳐야 해 바꿈. 방 참가는 허브 왼쪽 칸(2026-11-08까지는 이 화면에도 참가 카드가 있었다 — 아래 「새 시즌 UI 다듬기」).
- **협의 선택의 규칙 줄**(오른쪽 열 위, 관리자 결정 2026-11-08): 단독은 규칙(클래식/캐주얼/커스텀 ⚙), 연합 매칭은 규칙(커스텀 잠김)·인원 두 줄, 대기실의 협의 선택은 규칙·인원. 줄 상자는 난이도 카드 열과 같은 폭(목록의 좌우 여백 .5rem / .06rem)이고 라벨은 가장 긴 라벨 폭에 글자를 벌려 맞춘다. 단추는 공식 난이도 선택 창 `auto_chess_mode_choice_pop_view`의 매칭 범위 스위치(`btn_range_switch`) 모양 — 어두운 캡슐 트랙(`range_bg`: #0d0d0d, 1 px 흰 24 % 테두리) 안에서 고른 칸이 흰 캡슐(아래 그림자)이고 가장 넓다(두 칸이면 공식처럼 약 75 %, 세 칸이면 약 반), 안 고른 칸은 회색 글자(`.rtrack`, css/screens/room.css). 고른 칸의 캡슐은 빗금 없는 흰 80 % 단색 — 공식 허브의 개인/연합 모의 스위치 그림(`panel_act3autochess_on_entry` `btn_select`: `btn_mode_select`)과 같게(관리자 요청 2026-11-18, 공식 CN 허브 스크린샷). 매칭 범위 스위치 자체의 `range_selectbg`에는 옅은 빗금이 있어(CN·EN 같음) 「빠른 매칭」 스위치(`.qrange`)만 그 빗금을 쓴다. 커스텀을 고르면 프리셋 이름·공식과 다른 설정 수는 왼쪽 설명판 끝 줄 「커스텀 규칙 · …」(`CustomBrief`) — 오른쪽 열은 규칙과 관계없이 같은 배치. 규칙·인원·난이도 카드마다 그 대기열의 대기 인원, 단추는 「매칭 시작」.
- **빠른 매칭 스위치**(관리자 결정 2026-11-08): 공식 매칭 범위 「넓게 / 정확」 = 빠른 매칭 켬(난이도만 맞춤) / 끔(규칙·인원까지). 그래서 공식 자리와 모양 그대로 시작 단추 바로 위 가운데의 범위 스위치 「빠른 매칭 | 정밀 매칭」(`QuickRange`, role switch): 고른 쪽 흰 캡슐이 트랙의 74 %에 아이콘·이름, 다른 쪽은 회색 아이콘만(공식 `wide_icon` / `accurate_icon`, 소재 `room/*` — 미러가 대기실 프리팹 아래에 둠; 아이콘이 없으면 이름). 그 위 안내 줄은 공식 tips처럼 가운데: 끔 「같은 난이도·규칙·인원을 고른 박사들과 동맹을 맺습니다」, 켬 「규칙과 인원은 매칭된 대기열을 따릅니다」.
- **빠른 매칭 화면**(서버 규칙은 위 「랜덤 매칭」의 「빠른 매칭」): 켜면(A3, 관리자 결정 2026-11-07) 규칙·인원 줄은 그대로 단추만 비활성, 난이도 카드에는 그 난이도 전체 대기 인원(`lobby.queueCounts`의 `quick` + `counts` + `counts8`, `quickWaiting`), 단추는 「빠른 매칭 시작」(`room.queue { quick: true }`). 켬/끔은 `lobby.quick`에 기억한다. 대기 창은 「같은 난이도 대기 중인 박사: n」, 수락 창은 그룹의 규칙·인원(「클래식 · 4인 · 빠른 매칭」). 스위치만 남긴 A4는 화면을 본 뒤 바꿀 수 있는 후보다.
- 1600×900에서 연합 매칭(규칙·인원 두 줄 + 시작 단추 위 빠른 매칭 스위치)도 난이도 카드 네 장 전체(full)가 들어간다(빠른 매칭이 세 번째 줄이던 2026-11-07 배치는 「설명을 왼쪽 요약으로」 단계였다).

## 전략 선택 중 적 정보·전장 다시 보기 (관리자 결정 2026-11-18, PR #18)

- 왼쪽 결정 순서 아래 한 줄에 「적 정보 | 맹약 정보」 두 단추(관리자 결정 2026-11-18, 시안 2 — 처음 PR의 「시뮬레이션 정보」 위 「적 정보 · 전장」 단추를 바꿈), 그 아래 「오퍼레이터 설정」. 적 정보(`敌方情报`, 아이콘은 그 창의 적 칸 머리 아이콘 `img_title_icon_enemy`를 다른 단추 아이콘 색으로 — 관리자 결정 2026-11-18, 그림이 없는 설치에서는 `target`)는 보스·특훈 적·전장 창을, 맹약 정보(`盟约信息`, 전에는 「시뮬레이션 정보」 `本局信息`)는 지금까지의 핵심·부가 맹약·금지 오퍼레이터 창을 연다. 두 창 제목은 단추 이름을 따르되 화면에는 내지 않고 화면 낭독기에만 남긴다(`Modal`의 `hideTitle` → `sr-only`; 창 안 칸 머리가 이미 「적 정보」 등을 적어 같은 글이 두 번 나오므로, 관리자 결정 2026-11-18). 규정 3/3 「선발 편성 확정」 화면(`diyChoose.js`)도 같은 줄·같은 두 창을 쓴다(`bandDraft.js DraftInfoButtons` 하나를 두 화면이 그림 — 처음에는 3/3에 옛 「시뮬레이션 정보」 단추 하나만 남아 적 정보가 없었다, 관리자 제보 2026-11-18). `MatchInfoDialog`의 `title` 기본은 「시뮬레이션 정보」이고 게임 화면 서랍의 「시뮬레이션 정보」 탭은 그대로. 아래 「오퍼레이터 설정」 단추는 브리핑 화면처럼 아이콘·글을 가운데로(같은 날 결정). 두 단추는 반씩 나눠 좌우 여백을 줄여, 휴대폰 가로에서도 「맹약 정보」가 잘리지 않는다. 적 정보 창은 시뮬레이션 정보 창의 틀·상태 줄·닫기 단추를 같이 쓰되 폭은 `intel-dlg`(`max(8.5rem, 640px)`)로 더 좁고, 보스·특훈 적 아래 전장을 세로로 놓는다.
- `ui/matchIntel.js MatchIntel`을 브리핑과 전략 선택 창에서 같이 사용한다. 최종 공세 라운드·보스 능력·특훈 적·커스텀 전장 풀과 시즌별 공개 규칙은 브리핑과 같다. 맹약 클래식의 전장은 미확인, 규정 시즌은 기존처럼 공개한다. 공개 전장의 그림 리소스가 없으면 「전장 미리보기가 없습니다」를 표시한다.
- 차례 변경·자신의 전략 선택 시 창이 닫히며, 하단에는 기존 시뮬레이션 정보와 같은 차례·남은 시간 또는 선택 완료 상태를 표시한다. 닫기·Esc·바깥 클릭은 기존 `Modal` 동작을 따른다.
- 로컬 화면 확인: `/dev/game-mock.html?phase=BAND_DRAFT&ruleset=casual&variant=intel&lang=ko&shot=1`. `ruleset=classic`으로 전장 비공개를 확인한다. 기존 브리핑과의 표시 일치, 창 열기·닫기·차례 변경, 데스크톱과 휴대폰 가로·세로를 브라우저로 확인했다.
- 휴대폰 가로 화면은 글자·보스 그림·여백을 줄이고 전장 제목과 이름을 한 줄에 놓아, 보스·특훈 적·전체 지도를 스크롤 없이 함께 표시한다. 세로 화면도 작은 보스 그림과 적 유형 목록으로 축소한다. PR 캡처는 창 열림 애니메이션이 끝난 뒤 촬영한다.
- 재발 방지: `test/ui/match-intel.e2e.test.js`, `test/ui/match-info.test.js`(「the briefing, the strategy draft and the in-game 本局信息 tab all read ui/matchInfo.js」 — 전략 선택·3/3 두 화면이 같은 줄과 두 창을 그리고 옛 `本局信息` 단추가 없음).

## upstream 0.3.3 화면 가져오기 — 전략 선택 (관리자 결정 2026-11-07)

전략 선택(BAND_DRAFT, `screens/bandDraft.js`·`css/screens/draft.css`)의 본문을 upstream 행사 화면 배치(upstream PR #643)로 손 이식했다. 시안을 고른 뒤 구현했고, 새 시즌 「규정」 공개(2.0.0)와 함께 나갔다.

- **배치**: 왼쪽 결정 순서는 이름 카드 줄(초상·이름·상태, 옆에 전략 칸 — 결정 중 ⌛, 대기 •••, 고른 전략 — 과 칸 밖 ✓; 결정 중인 줄은 민트 테두리와 ▶; 공식 그림이 있으면 아래 「다듬기」). 가운데는 전략 초상 4열 벽(이름은 아래 띠, 고른 것은 SELECTED 모서리 괄호와 아래 삼각, 팀원이 고른 것은 붉은 띠 「팀원 선택 완료」와 그 팀원 아바타). 오른쪽 상세는 upstream과 달리 **항상 열려** 있고(선택이 처음부터 시간 초과 기본 전략에 있으므로) 괄호 친 큰 그림, 「초기 HP」 칸, 이름, 【효과】 설명, 그 아래 선발 프리셋 줄, 맨 아래 「건너뛰기」(연합)와 「선택 확인」(흰 단추).
- **우리 것 유지**: 위 머리줄은 브리핑과 같이 쓰는 우리 `StepHeader` 그대로(관리자 결정 2026-11-07 — upstream 머리줄의 「전략을 선택하세요」·건너뛰기 줄은 없음). 금지 맹약을 보는 입구는 왼쪽 아래 하나, 이름은 「시뮬레이션 정보」(`本局信息`, 같은 결정; 창은 우리 `MatchInfoDialog` 그대로 — 2026-11-18부터 「적 정보」 옆 「맹약 정보」, 위 「전략 선택 중 적 정보·전장 다시 보기」). 그 아래 오퍼레이터 설정, 연합의 시간 초과 안내. 선발 프리셋 줄·연결 배지(카드 오른쪽 위)·8인 압축 줄·편성 확인 칸도 그대로. 카드의 LP 숫자는 뺐다(상세의 「초기 HP」에 있음).
- **휴대폰**(높이 500 px 이하): 상세의 그림을 줄이고 선발 프리셋 줄은 「선발 프리셋 · <선택>」 드롭다운 한 줄만(시안대로).
- **가져오지 않은 것**: 상세를 누를 때만 여는 동작, 선택 뒤 벽을 「已选定策略」로 바꾸는 화면(선택 뒤에도 선발 프리셋을 바꿀 수 있어야 함), 내 차례 띠(`ui/turnBanner.js`), 전략 업적 배지·통과 횟수(업적 통계와 함께), 선택이 끝난 뒤 잠깐 붙잡는 화면(협의 가동이 BATTLE_CHECK 3초를 다 쓰므로 넣지 않음, 아래 「대기실·협의 가동」).
- **다듬기**(관리자 결정 2026-11-08, 시안 뒤): 상세는 공식 `panel_team_detail`처럼 **설명만** 스크롤하고(아래 끝이 흐려짐) 그림·이름·선발 프리셋은 고정, 프리셋 칸은 조금 작게 해 티어 판 오른쪽에 여백. 「건너뛰기」와 「선택 확인」은 같은 폭 두 칸(우리 단추), 건너뛰기 아이콘만 공식 화살표 — 공식 클라는 이 화살표를 따로 두지 않고 `btn_skip` 캡슐 안에 그려 두므로 그 자리를 한 번 잘라 흰 글리프로 바꿔 쓴다(`cutSkipArrow`). 다 쓴 건너뛰기는 「(사용 완료)」를 이름 아래 작게. 왼쪽 열은 장식·이름 카드·단추·안내문이 한 시작선에서 시작하고, 상태 칸은 카드 높이와 같은 정사각. 결정 중 칸은 누구 차례든 공식 모래시계 `shallow_main`(손가락 `youturn_finger`는 공식에선 위 막대 「당신의 차례」 쪽 그림이라 이 칸에서 뺌; 8인 압축 줄은 모래시계만). 공식 그림(`data/assets.json` ui `bandChoose/*`)이 모두 있을 때만 두 부분을 공식 소재로 그리고, 없으면 위 CSS 모양 그대로: 상세는 `team_info_back` 바탕·`team_icon_frame`(Sliced) 그림 틀·`team_hp_back` HP 칸·`team_id_title`/`team_intro_title` 제목 판, 왼쪽 열은 `prefab_auto_chess_band_choose_player_card_item`대로 줄 배경 #373737 32 %, 카드 81 · 상태 칸 81(줄 100 기준), 대기 = #505050 40 % 위 `player_card_waiting` 점, 결정 중 = `player_card_selecting` 판(111) 위 모래시계와 「결정 중」, 고른 전략 = `player_card_team_frame` 안 + 옆 `player_card_ready`, 내 줄 = `myself_highlight`(`player_card_self_frame` Sliced를 줄 위에, `icon_self_room` 꼬리표, 왼쪽 `team_list_selected_arrow`), 판은 `panel_player`의 `player_list_back`(Sliced)·`player_list_back_dec`·`player_list_dec_back`. 크기는 줄 높이에 맞춘 단위라 휴대폰에서도 같은 비율. [추정·화면: 내 줄 화살표의 방향(오른쪽을 가리키게 90° 돌림)·흔들림, 결정 중 칸 안 모래시계와 글자의 자리, 상세 제목 판의 크기는 공식 화면과 나란히 보지 않음]
- 확인: `test/ui/bandDraft.test.js`·`match-info.test.js`·`eight-player-ui.test.js`·`diy-presets.test.js`, 브라우저(Windows Chrome) `test/ui/mock.e2e.test.js` 「band pick」·`devices.e2e.test.js` 「match HUD … fits」(네 기기). 화면: 단독 실제 판(1600×900, 휴대폰 가로 844×390)과 목업 하네스의 연합 4인(같은 두 크기), 목업 하네스에 8명을 넣은 연합 8인(같은 두 크기; 휴대폰은 줄 목록이 스크롤) — 시안과 같은 배치, 휴대폰의 「건너뛰기」가 넘치던 것을 고침.

## upstream 0.3.3 화면 가져오기 — 대기실·협의 가동 (관리자 결정 2026-11-07)

대기실(`screens/room.js`·`css/screens/room.css`)을 upstream 행사 대기실 배치(upstream PR #643·0.3.3)로 손 이식하고 우리 요소를 시안대로 넣었다. 판 시작에는 upstream 「协议启动！」 화면을 upstream 순서대로(우리 로딩 화면보다 먼저) 붙였다. 새 시즌 공개 때 함께 공개한다.

- **좌석 카드**(관리자 결정 2026-11-08, 4차 시안 A): 공식 좌석 카드 `player_solt_item_room`을 그 배치와 소재로 그린다 — 카드 234×486 단위(room.css `--u`, 열 폭과 줄 높이 안에서 가장 크게; 줄 높이는 `useSeatBox`가 잰다), 칸마다 프리팹 자리·크기: 카드 바탕 `bg_normal2`(9분할), 위 띠 `bg_top_normal`(준비하면 `bg_top_ready`)과 위로 뻗은 선 `select_deco_line`, 초상(명함 오퍼레이터, 공식은 모델) 위 막 `front_matte_normal`과 틀, 카드 아래쪽에 겹친 명함(`btn_card`: 아바타·이름·DOCTOR #번호; 내 것은 `card_deco_self` 틀·왼쪽 `icon_self_room`·오른쪽 위 ⋯ `btn_card_detail`), 방장의 내보내기·AI 빼기 `btn_kick`(오른쪽 위 모서리), 연결 끊김 띠 `bg_disconnect`·`icon_disconnect`. 준비한 카드(그리고 준비하지 않는 방장 카드)는 민트 막(`front_matte_select2`·`front_matte_select1`)·민트 틀·카드 밑 갈래선(`select_deco_down1`·`select_deco_down2`)과 상태 「준비 완료」(`icon_prepared`)·왕관 「생성자」 — 민트는 공식보다 옅게(관리자 결정 2026-11-08). [추정·화면: 프리팹의 막·선 색은 애니메이션 자리표시라 실제 색과 세기는 화면으로만 앎 — 민트는 우리 것] 준비하지 않은 박사는 상태 글자 없음(공식처럼 회색 띠·틀만, 관리자 결정 2026-11-08). 위 「생성자」 배지(`tag_host`)는 두지 않는다(두 번 보였다, 관리자 결정 2026-11-08). 빈자리는 `bg_empty`, 「+ 초대」(`bg_plus`, 초대 코드 복사; 첫 빈자리는 아래에 그 설명 한 줄 — 공식 `variant_first_empty`), 선 `card_line`, 빈 명함 자리 `card_empty` 안에 방장의 「AI 팀원 추가」; 관전자·매칭 중에는 공식 대기 그림 `bg_guest`. 소재가 하나라도 없는 설치는 같은 칸을 CSS로 그린다(`seatArt`). 8인 방은 두 줄 네 장, 짧은 화면(높이 520 px 이하)은 한 줄 여덟 장(두 줄이면 카드 폭 55 px라 못 읽음, 관리자 결정 2026-11-08; 640 px 폭에선 준비 글자 대신 아이콘만).
- **명함 오퍼레이터**(`ui/seatArt.js`, 서버 `room.card`): 내 명함의 ⋯ → 메뉴(공식 `group_unfold`: `unfold_matte`·`unfold_bg_normal`)의 「일러스트 변경」(명함 아이콘 `icon_card`; 관리자 결정 2026-11-08, 그림 위 단추에서 옮김)이 고르기 창(검색·희귀도·「기본」)을 연다. 고른 것은 이 브라우저에 기억하고(`room.card` 설정) `ui/cardSync.js`가 접속할 때마다 보낸다. 고를 수 있는 오퍼레이터는 이 서버가 내놓은 시즌 어느 것이든의 보이는 비선발 기물과 이 서버가 내놓은 선발 오퍼레이터다 — 방의 시즌과 상관없이(관리자 요청 2026-11-18, 스킨 `room.skins`와 같은 방식). 예외로 어느 시즌에도 없는 오퍼레이터를 `shared/cardOperators.js CARD_EXTRA_OPERATORS`에 둔다(관리자 결정 2026-11-20, 플레이어 요청: 로도스 아일랜드 그림자 부대 `char_4215_buddy`) — 모든 시즌의 목록에 들고 기본 풀에는 들지 않는다. 이름·희귀도는 생성기가 캐릭터 표에서 읽고(`cardExtra`, 표에 없으면 생성이 멈춘다), 그림은 아바타·초상(`tools/assets/plan.mjs cardOperators`: 모델·스킬·음성 없이)과 E0 立绘(`chararts_extract.py`가 `cards.json`을 읽는다), 이름 번역은 `tools/build-i18n.mjs`가 이름 표에 넣는다(KR 캐릭터 표에 없는 동안은 `public/i18n/ko/manual.json`, 영어는 `tools/i18n/fallback-remake.json`). 스킨은 시즌 오퍼레이터만 고르므로 기본 그림만 나온다. 목록은 생성기가 한 번 만든다: `tools/build-data.mjs`가 모든 시즌의 기물·선발 자료로 `data/cards.json`을 쓰고(`shared/cardOperators.js buildCards`, docs/DATA.md §19), 서버(`server/lobby.js cardAllowed`, 다른 것은 BAD_MSG)와 고르기 창(`ui/seatArt.js cardOperators`, 이름은 덮어쓰기의 이름 표 `data.localeName` — 기물 기록과 같은 이름, 2026-11-18 네 언어 560개 기록에서 대조)이 그 파일만 읽는다. 세션과 좌석에 두어 방 전체에 `seats[].card`로 보인다. 겉모습뿐이라 판에는 넘기지 않는다. 같은 그림이 전략 선택의 결정 순서 이름 카드 뒤에도 깔린다(upstream처럼, 방의 `seats[].card`, 같은 `ui/seatCards.js useCardOperators`). 고르지 않으면 박사 번호의 해시로 방 시즌의 5★·6★ 기물 하나(`cards.json`의 `pool`) — 모든 화면에서 같다(기본 풀에 다른 시즌을 섞으면 내놓는 시즌에 따라 기본 그림이 달라진다). 재발 방지: 원인 제거 — 목록 규칙은 `buildCards` 한 곳(서버·클라의 손 규칙을 지움); `test/ui/room-cards.test.js`(`cards.json`이 지금 자료와 같은지·기본 풀), `test/lobby-card.test.js`(다른 시즌 오퍼레이터, 예외 오퍼레이터), 예외 목록은 `test/ui/room-cards.test.js` 「CARD_EXTRA_OPERATORS」·`test/assets.test.js` 「buildPlan cardOperators」. [추정·자료 없음: 공식 카드는 계정 비서(名片形象)를 보이는데 이 리메이크엔 계정이 없어 자리에서 고른다; 기본 오퍼레이터 규칙은 리메이크 규칙]
  - 그림(관리자 결정 2026-11-18, 사용자 제보 「너무 크게 확대된다」): 카드는 180×360 반신 초상이 아니라 立绘를 그 그림 프리팹 `illust_*`의 RectTransform(`m_SizeDelta`·`m_AnchoredPosition`) 틀로 그린다 — 상세 카드가 쓰는 저장 쌍(`ILLUST_SIZE`·`ILLUST_OFFSET`)이 아니다. 근거: 관리자가 준 공식 결산 화면(좋아요를 누르는 플레이어 카드 넷, 1920×1080) — 카드 폭 338 px = 234단위, 그림을 맞추면 엑시아 더 뉴 커버넌트의 스킨(`char_1041_angel2@iteration#6`)과 모스티마의 스킨(`char_213_mostma@ambienceSynesthesia#6`)이 RectTransform으로는 같은 배율(틀 1단위 = 카드 .7295단위, 두 장 1% 안)과 같은 중심(그림 칸 중심에서 아래로 39.5단위, 2단위 안)에 오고, 저장 쌍으로는 배율 2%·중심 12단위가 어긋났다. 추출기 `chararts_extract.py illust_rect`(스킨은 `skin_extract.py`가 같은 함수로)가 틀을 `rect`로 적고(상세 카드 창으로 자른 그림이면 그 조각의 자리로 옮겨서, `part_in`), 카드는 `ui/seatArt.js seatIllust`·`cardSkinArt(…, { by: 'rect' })`로 고른다. 고르는 순서: 스킨 立绘(스킨 자료를 받고 그 판이 캐시에 있을 때) → 스킨 초상 → 기본 立绘 → 기본 초상. 초상은 칸 폭에 맞춰 위에 붙인다(초상 자체가 이미 가까이 자른 그림). [추정·화면: 대기실 카드는 결산 카드와 같은 크기·같은 배치로 본다 — 공식 대기실은 모델을 띄워 그림을 재지 못함] 재발 방지: `test/ui/room-cards.test.js` 「seat card 立绘 placement」(측정값), `test/local-extract.test.js` 「illust_rect + part_in」, `test/local-extract-skins.test.js` 「illust_picture」.
- **위 막대**: 나가기(공식 그림, 아래 「판 밖 나가기 단추」), 「연합/단독 시뮬레이션」, 통계·설정·전체 화면(네모 단추, 터치 화면에선 32 px 이상; 전체 화면은 지원하는 브라우저만, 관리자 요청 2026-11-18 전에는 게임 방법), 오른쪽에 초대 코드(복사·링크). 시즌 배지는 두지 않는다 — 아래 모드 막대에 있다(관리자 결정 2026-11-08, 11-07 시안 A의 「위 막대 배지」를 바꿈). 짧은 화면(높이 520 px 이하)에서는 설정 단추들과 「초대 코드」 글자가 빠지고 오퍼레이터 설정 단추(글자 포함)가 초대 코드 왼쪽에 온다.
- **채팅과 오퍼레이터 설정**: 채팅은 좌석 왼쪽 열(좌석이 그만큼 좁아짐), 접으면 그 자리의 단추. 데스크톱은 채팅 아래, 시작 단추와 같은 줄에 채팅 폭의 오퍼레이터 설정 단추(관리자 결정 2026-11-08, 안 A: 오른쪽 위는 방을 공유하는 정보 자리이고, 준비 → 시작이 아래 줄에 모이며, 브리핑도 오퍼레이터 설정이 「준비 완료」 옆이다). 짧은 화면도 채팅은 같은 왼쪽 열(위 막대 단추가 아님), 좌석과 아래 줄은 그 오른쪽, 상태 줄은 가운데 정렬(관리자 결정 2026-11-08).
- **아래**: 준비 수·상태 줄·관전석(방장은 좌석 수 고르기)·「AI 팀원은 마지막에 선택」이 한 줄, 그 아래 모드 막대, 공개 토글(2026-11-20 「빈자리 매칭」 대신 — 「랜덤 매칭」 절 「공개방」)과 큰 「시뮬레이션 시작 / 준비 완료」 단추(관전자는 입석·좌석 예약).
- **모드 막대**(관리자 결정 2026-11-08): 공식 대기실 `auto_chess_room_state`의 `group_mode`를 그 소재로 그린다 — 어두운 캡슐 하나(`bg_mode` 9분할), 흰 20 % 세로선(2×23), 「시즌 | 규칙 | 난이도 | 인원」, 난이도는 공식 아이콘(`icon_easy|normal|hard|abyss`)과 그 색의 글자·빛(`light_mode`; 표준 #ffa015, 험지 #f25203, 극한 #e32525, 초월 #ff0024 — 프리팹의 root_easy·normal·hard·abyss를 난이도 순서대로 맞춤), 끝에 둥근 전환 단추(`btn_switch_mode`). 칸 이름 글자는 없다(공식처럼). 크기는 공식 1280×720 캔버스 단위(.015rem)의 0.8배(칸이 공식 둘 → 넷), 짧은 화면은 단추 옆에 들어가게 .013rem. 막대 전체가 단추 하나다 — 공식 `btn_switch`의 터치 영역이 막대 폭(378×60)이라 어디를 눌러도 협의 선택(`ProtocolSelect`)이 방 위에 열린다. 방장은 규칙·인원·난이도를 고르고 「확인」으로 보내고(규칙 → 인원 → 난이도 순, 인원 4 → 8은 AI 자리가 빠지면 먼저 물음, 서버가 받으면 닫힘), 커스텀 규칙은 규칙 줄의 ⚙로 편집·보기. 다른 박사와 매칭 중인 방장은 읽기만 하고 전환 단추가 없다. [추정·화면: 방장이 아닌 박사의 공식 화면은 녹화가 없다] 인원 줄은 방에서만 쓰는 협의 선택의 줄(5명 이상 앉았으면 8에 고정). 소재가 없는 설치에선 어두운 캡슐과 우리 아이콘. 옛 ⚙ 「연합 설정」 창은 없앴다 — 같은 설정이 막대와 협의 선택에 다 있었다(관리자 결정 2026-11-08).
- **시즌**(관리자 결정 2026-11-07, 시안 A): 방의 시즌은 모드 막대 맨 앞에 보이기만 한다 — 방은 만든 시즌을 끝까지 쓰고, 다른 시즌은 방을 새로 만든다. 연합 방식 선택의 「방 만들기」 칸에 인원 옆 「시즌」 스위치(로비의 시즌 고르기와 같은 값). 공개 시즌이 하나면 둘 다 없다(위 「위수협의 시즌 고르기」).
- **커스텀 방의 빈자리 매칭**(2026-11-20 지움 — 「공개방」; 위 「랜덤 매칭」의 「커스텀 방의 빈자리 매칭」): 커스텀 방에도 「빈자리 매칭」 단추가 켜지고, 배지는 그 난이도의 빠른 매칭 대기 인원(커스텀 방은 빠른 매칭 박사만 채움). 빠른 매칭 박사의 수락 창은 `room.matchFound`의 `custom`으로 「커스텀 · 공식과 다른 설정 n개」와 요약 줄(`ui/customSummary.js`)을 보인다.
- **협의 가동**(`ui/protocolBoot.js`·`css/screens/protocol-boot.css`): 공식 표의 BATTLE_CHECK 단계(「协议启动」, 3초)의 첫 프레임부터 「협의 가동!」 화면(공식 `battleReady/*`·`settle/common_logo` 소재: 로도스 함선, 등고선, 산, 고리, 참가자 카드 「01 COMPLETE ✓」, 「협의 가동!」·STRONGHOLD PROTOCOL·「연결 중…」)이 최소 2.3초, BATTLE_CHECK가 끝날 때까지 덮고(필드는 그 뒤에서 로드) 0.35초에 걸쳐 사라진다. 그 뒤 필드가 아직 로딩 중이면(느린 기기) 우리 로딩 화면(모드 그림)이 이어서 필드가 뜰 때까지 덮는다 — upstream 순서 협의 가동 → 로딩 그림(관리자 결정 2026-11-08; 2026-11-07의 로딩 그림 → 협의 가동 순서를 되돌림). 1라운드 시작 배너는 협의 가동이 사라지기 시작할 때 뜬다. 다시 불러온 화면이 BATTLE_CHECK 중에 열리면 소재가 받아질 때까지 로딩 화면, 받아지면(BATTLE_CHECK 안에서) 협의 가동(`protocolBoot.js whenBootArt`). 소재가 없으면 지금처럼 BATTLE_CHECK 동안 로딩 화면만. [추정·화면: 배치·움직임·길이는 upstream이 행사 영상(7:43–7:51)에서 읽은 것이고, 공식 `AutoChessBattleReadyState` 프리팹은 읽지 않았다; 8인 방 카드 네 줄은 우리가 정함]
- 확인: `test/lobby-card.test.js`(실제 서버의 `room.card`), `test/ui/room-cards.test.js`(명함 규칙·동기화·협의 가동 배치·수락 창 요약), `test/ui/room-seat-card.test.js`(좌석 소재 전부 있을 때만·⋯ 메뉴·준비 안 함 글자 없음·옅은 민트·짧은 화면 8인 한 줄), `test/ruleset.test.js`(빈자리 매칭 배지), `test/ui/custom-rules.test.js`(모드 막대가 단추 하나, ⚙ 없음, 인원은 협의 선택), 화면은 Windows Chrome으로 데스크톱 1600×900·폰 844×390 터치(연합 대기실, 단독 실제 판의 로딩 → 협의 가동 → 1라운드).

## upstream 0.3.3 화면 가져오기 — 오퍼레이터 설정 (관리자 결정 2026-11-07)

위 절과 같은 방식(손 이식, 새 시즌과 함께 공개). 출처는 upstream PR #811(isomerpoi, 카드 보기)과 그 후속 1e89f523·ec9c5ef1·0e455721, PR #610(선발 창을 오퍼레이터 설정 목록으로).

- **연필 아이콘**: 오퍼레이터 설정 탭과 모든 입구 단추(로비 허브·대기실·브리핑·전략 선택)가 공식 `operator_preset` 스프라이트 대신 upstream의 연필(`Icon edit`)을 쓴다.
- **카드 보기**(`screens/loadout.js` `DeckView`·`DeckCard`·`DeckBar`): 오퍼레이터 설정 탭의 목록 위 「카드 보기」로 바꾸는 선택 보기. 티어별 반신 카드가 가로로 흐르고, 왼쪽에 티어 표식(공식 `shopLevelSprite/shop_level_tag_N`, 없으면 CSS 표식), 카드에는 일반·정예 레벨과 승급 단계 아이콘(공식 `elite/elite_N`, 표의 `status.phase`), 장착 스킬·모듈, 잠재능력 점, 맹약. 아래 막대는 티어 이동(5·6티어는 빈 선발 칸 수), 카드를 누르면 왼쪽 서랍에 목록 보기와 같은 상세. 「빠른 설정」은 카드 옆에 스킬 / 모듈 / 잠재능력·육성도 열을 펴고, 바꾼 것은 바로 저장된다. 목록이 기본이고, 고른 보기는 브라우저에 남는다(`sp.pref.loadout.view`). 잠긴 설정은 아래 막대의 칩 한 곳에서만 알린다. 카드 틀·색·두 줄 흐름·아래 막대·빠른 설정 열·전환 효과는 upstream이 행사의 물자 배치 화면을 보고 그린 것이고 공식 화면과 대조하지 않았다 [추정·화면: upstream 자체 그림]. 티어 표식 스프라이트를 공식 화면이 이 자리에 쓰는지도 upstream의 추정이다 [추정·화면].
- 가져오지 않은 것: upstream의 스킨(카드에는 오퍼레이터 기본 그림), 판(버전)별 자료, 文字大小(`var(--t)`; 글자 크기는 이 화면의 다른 곳처럼 rem + px 하한).
- **선발 선택 창**(`screens/diy.js` `DiyPickerView`): 창 모양만 upstream을 따른다(관리자 결정 2026-11-07, 프리셋 오퍼레이터 규칙은 받지 않음 — 선발 후보는 그대로 보유 6★, `shared/local-diy.js`). 왼쪽은 오퍼레이터 설정 목록과 같은 줄(초상·이름·맹약·직군, 스킬 셋, 모듈(미장착 먼저), 잠재능력·육성도)과 직군 칩·검색, 오른쪽은 같은 상세(잠재능력과 육성도, 스킬, 게임 내 수치, 모듈 — `screens/loadoutSections.js`). 줄의 스킬·모듈은 그 오퍼레이터의 항목에 쓰이고(확인으로 저장, 취소·Esc로 버림), 잠재능력·육성도는 목록처럼 바로 저장된다. 전체·프리셋·보유 필터는 없다(보유 6★만 고르므로). 2026-11-19부터 한 칸이 아니라 **티어 하나를 여러 명 고르는 창** — 아래 「선발 편성 탭」.

## 새 시즌 UI 다듬기 — 허브·연합 입구·협의 선택 (관리자 결정 2026-11-08)

관리자가 새 UI를 보고 지적한 것(허브 왼쪽 열 폭, 최근 방이 늘면 방 참가 칸이 커짐, 업데이트가 한 줄, 방 만들기의 시즌·인원 단추, 방 참가가 두 곳, 규칙 줄과 난이도 카드 사이, 시즌 메뉴 잘림)을 시안으로 고르고 그대로 구현했다. 공식 게임과 무관한 이 서버의 배치다.

- **허브 왼쪽 열**(데스크톱, 높이 521 px 이상): 폭 = 위 막대 왼쪽 묶음 폭(공통 변수 `--hub-side-w` 4.84rem). 위 막대의 마지막 단추(전체 화면)는 열 끝에 붙고, 열의 왼쪽 여백도 위 막대와 같은 .44rem이다. 가운데 제목은 이 폭만큼 양쪽을 비운다.
- **방 참가 칸의 최근 방**: 한 줄만. 들어가지 않는 코드는 통째로 숨긴다(칸 높이가 늘지 않는다). 최근 방은 최대 4개.
- **작전 팁·업데이트**(`screens/lobby.js HubNotes`): 데스크톱은 카드 둘 — 작전 팁(넘김 `07/48 ‹ ›`, 5초마다, 최대 3줄)과 업데이트(버전·날짜·NEW, 주요 4줄, 「전체 보기」). 주요 줄은 판의 묶음(`### 전투`·`### 새 기능` …)마다 첫 항목을 먼저, 그다음 나머지를 순서대로 고르고 「기여」 묶음은 빼며(`newsLines`), 한 줄 말줄임이다. 업데이트 카드의 ‹ ›는 이전 판으로 넘긴다(자동으로 넘기지 않음). NEW는 아직 안 본 최신 판에 그 방문 동안 붙는다(`patchNotesSeen`, 위 「로비 업데이트 소식」).
- **휴대폰 허브**(높이 520 px 이하, 폭 760 px 이상): 왼쪽 열에 카드 셋 — 업적 통계 띠(그림 없이 이름 줄만), 방 참가(초대 코드·방 참가·관전 같은 높이 34 px, 최근 방 칩 32 px 한 줄 4개 — 칩은 제 폭(최소 48 px)이라 하나여도 줄을 다 차지하지 않음, 초대 코드 안내 글자 13 px(관리자 요청 2026-11-08), 「최근 방」 글자 없음), 작전 팁 | 업데이트 탭 한 카드(업데이트 탭은 판 3줄, 「전체 보기」는 버전 줄 끝, NEW는 탭에만; 새 판이면 업데이트 탭이 열린 채 시작). 오른쪽 판은 S.W.E.E.P. 보고서·오퍼레이터 설정만. 폭 760 px 미만 휴대폰은 왼쪽 열이 들어가지 않아 예전처럼 오른쪽 판에 「업적 통계」·「방 참가 · 관전」을 둔다. [추정·자료 없음: 236 px 열 폭과 760 px 경계 — 844×390·740×360에서 맞춤]
- **연합 입구 = 시뮬레이션 선택(연합)**(관리자 결정 2026-11-08, 같은 날의 「방 만들기」 카드 — 연합 설정 머리·시즌·인원 두 줄·「난이도·규칙은 방에서 변경」 — 를 바꿈): 단독·연합 매칭과 같은 화면에 규칙·인원(맨 위 「시즌」 줄은 관리자 결정 2026-11-13으로 없앰 — 시즌은 로비 칩 한 곳에서만 고르고, 새 방은 칩에서 고른 시즌; 그 줄을 누르면 창 뒤 로비가 암전 없이 바뀌었다), 난이도 카드, 안내 「만든 뒤 친구를 초대하거나 AI 팀원을 추가할 수 있습니다」, 단추 「방 만들기」(브라우저 시험이 누르는 `.ally-create__go`). 참가 카드는 없다 — 데스크톱과 넓은 휴대폰은 허브 왼쪽 칸에서, 좁은 휴대폰은 「방 참가 · 관전」 판이 참가 화면(`AllianceSelect`, 레이더 + 참가 카드만)을 연다.
- **협의 선택**: 규칙 줄과 난이도 카드를 한 묶음으로 오른쪽 열의 빈 높이 가운데에 두고, 시작 단추는 아래 끝(`.proto-side`의 첫 자식·시작 단추 `margin-top: auto`, 목록은 카드 높이만큼 — 넘칠 때만 줄어들어 스크롤하고 `pickCardFit`이 단계를 고른다). 지금까지는 카드만 목록 상자 가운데여서 규칙 줄 아래가 비었다. 대기실에서 방장이 여는 협의 선택도 같다.
- **시즌 메뉴**: 위 막대 오른쪽의 칩에서는 오른쪽 끝에 맞춰 왼쪽으로 펼친다(오른쪽으로 펼쳐 화면 밖으로 잘렸다).
- 확인: `test/ui/hub-polish.test.js`(주요 줄 고르기, 허브·연합 화면의 두 보기, CSS 배치). Windows Chrome(로컬 서버, 2026-11-08): 1600×900·1280×720·1024×768, 휴대폰 터치 844×390·740×360 — 허브, 시즌 메뉴, 업데이트 탭, 방 만들기, 참가 보기, 단독·연합 매칭의 협의 선택. 근거·시안: 관리자의 작업 노트.

## 새 시즌 「규정」의 타이틀·허브 그림과 로고 (관리자 결정 2026-11-08)

규정(`act3autochess`)은 지난 시즌 그림을 쓰지 않고 입구·허브를 새로 그렸다. 공식 그림을 새 시즌에만 쓴다. 맹약 화면은 그대로다.

- **그림**: 공개 미러에 아직 없어 공식 CN 클라에서 뽑는다(`tools/local-extract/season_ui.py`, 선택; 없으면 맹약 그림·점 문양 그대로 — `public/js/ui/seasonArt.js`). 허브 배경은 행사 입구 패널 `panel_act3autochess_on_entry`(시즌 중; 시즌 밖 패널은 안 씀, 관리자 결정)의 세 층 — `bkg_season_on`·`bg_season_on`·`bg_front_season_on`(가운데에서 아래로 149) — 을 1559×960에 그 순서로 겹친 것이다. 첫 두 층 사이에는 효과 메시 셋(`effect_holder/effect_season_on/mask/mesh_1~3`, 메시 `mesh_trapezoid`·재질 `mat_bg_mesh`)이 만드는 붉은 번개 줄기를 클라가 그리는 대로 넣는다(2026-11-18, 관리자 제보 — 공식 허브 스크린샷 위쪽): 사다리꼴을 노드 폭에 맞추고 y 180° 뒤집기·노드 배율·z 회전(±65°)·위치, 셰이더 `Torappu/UI/UI-Fx-Common`의 키워드 없는 픽셀 단계 — 색 = 그래픽 색 (154, 46, 32), 알파 = 디졸브 텍스처 둘(`bg_mesh_img` 문턱 0·Smooth 0.1, `fxcommon`의 `img_uifx_basicmask_09` 문턱 −0.18·Smooth 0.748)의 smoothstep 곱, 보통 알파 섞기. 메시를 놓는 클래스는 `Torappu.UI.UIMeshImage`(메시 경계 폭을 노드 폭에 맞춤, `_targetRotation` 오일러 회전 — 공식 클라에서 확인, 2026-11-19). 공식은 줄기가 흐른다: 키워드 없는 변형도 디졸브 UV에 `_Dissolve_Speed` × `_Time.y`(UnityPerCamera 시계)를 더해, 첫 텍스처(`bg_mesh_img`, 반복 감기)가 v로 초당 −0.1 = 10초 한 바퀴로 움직인다(둘째는 속도 0). 우리도 흐르게 그린다(2026-11-19): 추출이 합친 JPEG(`backdrop/title`) 말고도 메시 아래 층(`base`, JPEG)·위 층(`front`, 알파 WebP)·메시와 재질 값(`rays`, 메시 하나 + 사본마다 배경 픽셀로 옮기는 행렬)·디졸브 텍스처(`tex_<이름>`)를 내고, 페이지가 배경 크기(1559×960) 캔버스 하나에 WebGL로 `season_ui.py` `draw_mesh`와 같은 셈을 한다(`public/js/ui/seasonRays.js`, 타이틀·허브 공용, 캔버스도 JPEG과 같은 CSS 클래스라 `object-fit`·`object-position`이 같음). 한 프레임에 그리기 세 번(아래 층, 같은 재질의 사본 셋을 한 버퍼로, 위 층), 할당 없음, 초당 60번까지; 화면을 떠나면 컨텍스트를 놓는다. JPEG은 그 고리의 한 순간 `_Time.y` = 2.64 s(`season_ui.py` `time`)를 멈춘 그림 — 관리자의 공식 CN 허브 스크린샷(2026-11-18)의 무늬와 맞는 순간(열린 붉은 칸에서 알파 평균 차 0.04, 0초는 0.42; 줄기·틈 색은 스크린샷과 1단위 안) — 이고 캔버스 밑에 남아 동작 줄이기·WebGL 없음·조각을 받기 전·컨텍스트를 잃었을 때 보인다. 캔버스는 그 순간에서 시작해 바뀌는 것이 보이지 않는다. 같은 조각으로 Python이 그린 판과 WebGL 첫 프레임(헤드리스 Chromium 소프트웨어 GL, 2.64 s·7 s)이 150만 픽셀 중 8 넘게 다른 것 50개(최대 17, 줄기 가장자리) [화면 미확인: 실제 GPU 화면·움직임]. 추출기는 다른 셰이더 설정·키워드·돌린 부모를 만나면 멈춘다. 층 사이의 연기·먼지 입자는 그리지 않는다 [추정·화면: 입자 연출 미재현].
- **로고**: 타이틀·허브 가운데에 공식 로고 `title_season`만 두고, 글자 제목(「STRONGHOLD PROTOCOL REGULATION」·「위수 협의：규정」)은 화면 읽기용으로만 남긴다(관리자 결정 2026-11-08 — 로고 안에 같은 글이 있다). 공식 허브도 로고만 둔다. 한국어 화면은 로고의 중국어 「卫戍协议」·「规程」 두 줄만 그 줄의 판 색으로 지우고 같은 자리에 「위수 협의」·「규정」(`public/i18n/ko.json`의 같은 msgid)을 공식 UI 글꼴(게임 안 Font 자산 중 한글이 있는 유일한 것, EN 클라 `SourceHanSansSC-Bold`)로 쓴 판을 쓴다(관리자 결정 2026-11-08). 러시아어 「РЕГЛАМЕНТ」·작은 영어 줄·문양은 공식 그대로. 다른 언어는 공식 그림. 로고가 안 받아지면 글자 제목이 돌아온다.
  공식 그림은 395×282뿐이라(클라의 같은 시즌 그림 중 이보다 큰 로고는 없다) 1080p 타이틀에서 1.7배 넘게 늘어나 흐렸다: 추출 도구가 2배·3배 판(`title_season_2x`·`_3x`, 한국어 `title_season_ko_2x`·`_3x`)을 더 만들고 — 바탕은 AI 업스케일(Real-ESRGAN `realesrgan-x4plus`)의 윤곽에 공식 그림의 거친 질감(그레인)을 다시 얹은 것, 피라미드와 작은 영어 두 줄은 AI가 글자·점 무늬를 틀리게 그려서 공식 그림을 키운 그대로(관리자 결정 2026-11-13), 한국어 글자는 그 크기에서 글꼴로 새로 쓴다 — `<img srcset>`(너비 기술자, `sizes`는 CSS 높이 × 로고 비율)로 브라우저가 화면 크기와 픽셀 밀도에 맞는 판 하나만 받는다(관리자 요청 2026-11-13; 1080p → 2배, 1440p → 3배, 844×390·밀도 3 휴대폰 → 2배).
- **결과 화면 로고**: 규정 판은 `season_logo_settle_game`(이 시즌 것, 중국어 없음).
- **시즌 탭 그림**(관리자 결정 2026-11-10, 시안 A): 2026-11-13에 타이틀의 시즌 탭과 함께 없앰(`seasonTabArt`도). 규정의 `season_ui.py` `banner` 추출은 지금 쓰는 곳이 없다.
- **크기**: 타이틀 로고 높이 `min(44vh, 28vw)`(터치 휴대폰 30vh), 허브 로고 `min(42vh, 26vw)`(높이 520 px 이하 34vh), 허브의 레이더 원은 로고 뒤에서 뺀다. 배경 위에 위·아래와 로그인 상자 둘레를 어둡게 하는 막. [추정·자료 없음: 크기·막 — 1600×900·844×390·740×360에서 맞춤]
- **로비 시즌 전환**(관리자 결정 2026-11-02 타이틀 → 2026-11-13 로비로 옮기고 화면 전체): 로비 위 막대의 시즌 칩으로 바꾸면 화면 전체가 0.35 s 동안 검게 되고, 검은 동안 고르기가 일어나 그 시즌 데이터가 다 읽히고(`data.seasonSettled`) 새 허브 배경이 디코드되면(최대 3 s) 0.45 s에 밝아진다(`ui/seasonFade.js pickSeasonThroughDark`, 고정 검은 막 하나의 투명도). 새 막은 투명도 0의 스타일을 한 번 계산한 뒤 1로 바꾼다 — 안 그러면 전환의 시작점이 없어 바로 검어진다(requestAnimationFrame 한 번으로는 모자람: 휴대폰 가로 844×390 Windows Chrome에서 매번 바로 검어짐, 2026-11-13). 배경·로고·제목·모드 목록·BGM·오퍼레이터 설정·통계가 검은 동안 한 번에 바뀐다(배경만 암전하면 앞의 글자·카드가 툭 바뀌고 데이터를 다시 읽는 빈칸이 보임 — 제안 근거). 막은 그동안 입력을 막는다(약 0.8 s). 연타는 마지막 고름이 이긴다. 동작 줄이기 설정이면 바로 바뀐다.
- **로딩 그림**: 규정 모드의 `loading_ac_normal`·`loading_ac_funny`는 맹약의 `loading_ac_core`·`loading_ac_prototype`과 픽셀이 같은 그림이라 그 파일을 쓴다(`ui/battleArt.js LOADING_SAME`; `hard`·`abyss`는 이름도 같음). 공식 CN 클라 로딩 그림 번들에서 확인(2026-11-08).
- **아이콘**(관리자 결정 2026-11-08 「새 훈장·아이콘은 새 시즌에만」): 규정 화면은 같은 추출의 시즌 아이콘을 맹약 그림 위에 쓴다 — 전략·맹약은 이 시즌 기록의 `iconId`로(규정은 전략 아이콘 이름이 전략 ID에서 나오지 않음, 예: `band_survive` → `icon_gvial2`), 장비는 기물(trap) ID로, 그리고 훈장(1~8단계 — 6~8은 규정에만)·적 종류·버프·특질 종류·상점/기물 단계 그림(`public/js/data.js`가 시즌 판의 `data.get('assets')`를 `ui/assetUrls.js withSeasonArt`로 만든다; 맹약 판은 파일 그대로). 규정의 모드 문양(흰색, 더 큼)과 맹약 원판 고리(조각 그림, 기본 테마가 그림)는 모양이 달라 덧씌우지 않는다 — 그 화면을 새 프리팹으로 다시 그릴 때(협의 선택 창·HUD 테마).
- **아미야 의료 형태**: 몸 `char_1037_amiya3`은 E2 그림만 있다(형태가 E2부터) — 아바타·초상은 정예화와 관계없이 그 E2 그림, 카드 립화는 몸(`tmplId`)의 것을 쓴다.
- **기본 테마 상점·HUD**(관리자 결정 2026-11-10, 시안대로 — 「크기·그림을 새 시즌에만」 2026-11-08): 규정 판은 기본 테마 `ac_n_initial`(activity_table
  `skinConsts.defaultAutoChessSkinId`)의 그림과 프리팹 크기로 그린다. 테마 번들의 프리팹 14개 중 우리 화면에 닿는 차이는 셋 — 나머지(HUD 판·카운트다운·
  준비 완료·배너 넷)는 배치·그림이 EN과 같다.
  - 상점(`panel_shop_main`·`autochess_shop_card_item`, `ui/shopArt.js` `has-shop-theme`·css/shop-art.css 끝 절): 카드 155×187(테두리 155×191,
    바탕 `bg_black`, 무늬 없음), 초상 112×224를 카드 오른쪽 위로 9.5·29.5 넘겨 놓고 `root_char`의 소프트 마스크(`mask_char` 빨강 채널)로 흐림, 특질
    물자국 70·α 0.2(`skinColorDataDict.garrisonIconColor`), 티어 칩 26, 이름 줄 25 위·직군 아이콘 24, 갱신·동결 144×49(그림 168×72), 접기 상자
    192×213(자금 120×47이 상자 안 위쪽), 승급 칸 112×188. 테두리는 테마도 단계로(`chess_frame_hub`: normal·level_five·level_six — 「상점 화면」 카드 테두리).
    테마의 `level`은 접힌 상점의 LEVEL 칸이라 승급 칸에 쓰지 않는다.
  - 티어 칩은 화면 어디서나 시즌 것(`chessLevelSprite/chess_level_icon_N`, 테마의 `chess_level_icon_hub` — EN과 픽셀이 조금 다름).
  - 🔍 단추: CN `autochess_hud_panel`의 `btn_check_player`·`btn_check_enemy`는 받침(`bg_check_btn`) 없이 `img_normal` 73×41(6 아래)에 테마 그림
    (`skin_config` `img_check_player`·`img_check_enemy`)만 — 테마에 그림이 있는 평소 상태만 그렇고, 돌아가기·회색 상태는 지금 그림(`ui/hud.js` `checkSprite`).
  - 맹약 원판(`bond_icon_view_item`): `bg_active`(활성)/`bg_inactive` 위에 모든 칸 고리(`bg_total`, #a1a1a1 α 0.8)와 켜진 칸(`bg_actual`)을 흰 조각
    `bondboardicon/<칸>_<켜진 수>`로 겹친다 — 추출이 상태마다 한 장으로 합성(`season/<id>/bondboard/<칸>_<n>`, n = 0 포함), 80 판에 93.75 %.
    켜진 칸 색은 테마 표의 `skinDarkColor`(기본 테마 #00FFC4)다. 프리팹은 흰색이고 실행 중에 칠한다. 공식 CN 화면(2026-11-10)에서 확인: 테마 둘이 한
    화면에 함께 보였다. 기본 테마는 #00FFC4, 구매 테마 「“전능한” 클로저」(`ac_s_closur`)는 `skinLightColor` #00D2FF가 아닌 `skinDarkColor` #2E38FF로
    켜졌다. 같은 화면에서 활성 원판의 문양은 `bondIconColor`(기본 #031712, 클로저 #69FDFF), 꺼진 원판의 문양은 두 테마 모두 회색이었다.
  - 추출: 테마 스프라이트는 텍스처를 꽉 잘라 담은 것이 있어(`shop_level_*`·`bg_inactive` 등 10장, `bondboardicon` 10장) 스프라이트 사각형 크기로 되돌려
    저장한다(`textureRectOffset`). 다른 아이콘 폴더는 그대로(맹약 문양 크기 계산이 잘린 텍스처 크기를 쓴다).
  - 안 그린 것: 접힌 상점의 테마 그림(공식 `bg_open`·LEVEL 칸·Spine — 우리 접힌 상점은 두 시즌 모두 원본 CSS 탭), 끌어서 팔기 판(`img_sell_*`, 우리
    게임에 없음), 새 HUD 단추 `btn_check_buff`·아바타의 연승·보스 피해 순위 표시(새 시즌 기능).
- 확인: `test/ui/season-art.test.js`(맹약은 안 씀, 추출 없으면 null, 한국어 로고 고르기, 로딩 그림 잇기, 암전 시간, 전체 추출이 시즌 그룹을 남김, 시즌 아이콘 덧씌우기와 데이터 저장소의 다시 알림, 아미야 의료 형태 그림), `test/ui/season-rays.test.js`(흐르는 줄기의 조각은 다 있거나 없음, 못 그리는 파일은 거부, 같은 재질 사본은 한 묶음, 흐름 오프셋이 [0, 1) 안). Windows Chrome(로컬 서버, 2026-11-08): 1600×900 한국어·중국어, 휴대폰 터치 844×390·740×360 — 타이틀·허브, 탭 전환 중 막의 투명도를 프레임마다 잼(0.37 s에 1, 0.45 s 뒤 0). 2026-11-10: 규정을 고른 페이지에서 전략 61·맹약 26·장비 116개 아이콘과 훈장 1~8이 모두 받아짐.

## upstream 0.3.3 화면 가져오기 — S.W.E.E.P. 보고서 (관리자 결정 2026-11-07)

위 절들과 같은 방식(손 이식, 새 시즌과 함께 공개). 출처는 upstream 0.3.3의 `screens/sweep.js`·`css/screens/sweep.css`(isomerpoi, 행사 영상 2:17–3:03을 보고 그린 것).

- **화면**(`screens/sweep.js`): 로비 허브의 S.W.E.E.P. 판이 여는 전체 화면 창, 읽기 전용. 탭 셋 — 맹약 보고서(핵심 맹약·부가 맹약 타일, 왼쪽에 활성화 필요 인원·단계·설명·해당 오퍼레이터, 보유하지 않은 오퍼레이터는 「대체」 표시), 전략 보고서(전략 타일, 초기 HP·나오는 모드·관련 맹약), 적 자료(리더 적과 전술 특훈 적 타일, 「보기」가 적 도감을 엶: 전체·일반·정예·지도자, 이름·번호 검색, 능력치마다 등급과 실제 수치). ⓘ는 게임 방법의 심화 도감 장을 연다. 보이는 시즌(`data.setSeason`)의 자료를 쓴다. 고른 탭은 브라우저에 남는다(`sp.pref.sweep.tab`).
- **색**: upstream의 밝은 회색 들판 대신 우리 어두운 톤(관리자 결정 2026-11-07 안 B). 맹약 문양은 공식 도감의 원판 위에 그린다(관리자 요청 2026-11-13, 공식 녹화 기준 — 그 전의 민트 원판 `ui/outer` `img_bond_bkg`은 시뮬레이션 정보 화면 것이었다). 공식 클라에서 확인: 이 보고서는 행사 번들(`activity/[uc]act2autochess.ab`)의 `act_auto_chess_handbook_state`이고, 타일 `prefab_act_auto_chess_handbook_bond_item`(148×148)은 흰 원판 `img_bond_item_bkg`(117, 가운데보다 12 위) 위에 72 칸의 짙은 문양(`img_icon_bond` #051b17), 왼쪽 판 `panel_bond_detail`은 회색 원판 `img_left_bond_icon_bkg`(200×184) 위에 150 칸의 흰 문양(원판 가운데에서 왼쪽 3·아래 4). 두 원판은 `extract.py`의 `ui/handbook` 묶음으로 뽑고(없으면 CSS 원), 문양은 128 단위 스프라이트 기준 크기(「공식 UI 크기 맞추기」). 타일 배경 `img_list_item_bkg`·선택 테 `img_item_bkg_selected`·왼쪽 판 배경 `img_left_bkg`은 아직 upstream CSS다.
- **적 도감 등급**: 공식 적 도감 표(enemy_handbook_table `levelInfoList`, E … SS 열 단계)를 `tools/build-data.mjs`가 `data/factions.json` `handbookLevels`로 옮긴다. 한 능력치는 `최소 ≤ 값 < 최대`인 단계를 받고, 최대가 음수면 위가 열려 있다 — 경계값은 거기서 시작하는 단계(공식 클라에서 확인: 적 도감의 능력치 등급 매기기). 공격 간격은 적의 `baseAttackTime`을 그대로 매긴다(공속을 곱하지 않음, 공식 클라에서 확인 — upstream은 공속을 곱해 공속 0인 적 5종이 「—」였다).
- 이름 「S.W.E.E.P.」과 탭 이름(맹약 보고서·전략 보고서·적 자료)은 upstream이 CN 행사 영상에서 옮긴 것이고 act2autochess 표에는 없다. 한국 서버 이름은 모른다 — 한국어는 우리 번역 [추정·화면: KR 화면 미확인].
- 배치·배경·타일·구역 머리는 upstream이 영상을 보고 CSS로 그린 것이고, 공식 프리팹(`ActAutoChessHandbook*`)과 대조하지 않았다 [추정·화면: upstream 자체 그림].

## upstream 0.3.3 화면 가져오기 — 업적 통계 (관리자 결정 2026-11-07)

위 절들과 같은 방식(손 이식, 새 시즌과 함께 공개). 출처는 upstream 0.3.3의 `screens/stats.js` `AchievementDialog`와 로비 카드(upstream PR #643, 행사 영상 1:28–1:43의 「위수 협의: 맹약」 업적 창을 보고 그린 것), 공식 통계 웹페이지 소재(`tools/assets/stats-template.mjs`).

- **창**(`screens/achievements.js`): 허브의 업적 통계 카드와 좁은 휴대폰의 「업적 통계」 판이 연다. 행사 띠(보이는 시즌의 문양·라틴 표기·「위수 협의: 시즌 이름」 — 맹약은 `entry/season_logo`, 다른 시즌은 그 시즌 추출 문양 `season/<id>/logo` `season_logo`; 2026-11-13 전에는 규정에서도 맹약으로 나왔다) 아래 한 장으로 스크롤 — 박사 이름과 트로피(연합 시뮬레이션 정산의 트로피 합, 공식 메달 단계 `config.trophies.medals`), 단독·연합별 총 시뮬레이션·위수 성공·히든 코어 돌파, 평가 여섯 개의 육각 그림(20회에서 가득) / 위수 업적(맹약 중첩이 가장 높았던 판의 라인업 10칸과 그 판의 활성 맹약, 한 판 최다 사용 자금·승급 횟수·처치 수 — 이름은 「최다 사용 자금」처럼 「한 판」 없이, 관리자 결정 2026-11-08) / 맹약 기록(정산 때 활성이었던 횟수 상위 셋, 1위 맹약의 오퍼레이터) / 전략 기록(많이 쓴 전략 셋, 표의 `victorCount`번 이상 이긴 전략의 특별 표식, 입문 협의 제외). 「전체 통계 보기」는 통계 화면을 연다. 이 브라우저의 기록 중 **보이는 시즌의 것만** 센다(통계 화면과 같음). 규칙 모드(클래식·캐주얼·커스텀)도 나눠 센다(관리자 결정 2026-11-08): 창 본문 왼쪽 위(휴대폰은 오른쪽 위)에 모드마다 판 수를 단 규칙 스위치(협의 선택과 같은 공식 범위 트랙 모양 `.rtrack`)가 떠 있고(흐름 밖이라 아래 블록을 밀지 않음), 숫자 전부가 고른 모드의 기록이다. 처음 보이는 모드는 창에서 마지막에 고른 모드와 마지막으로 플레이한 판의 모드 중 나중 것(둘 다 없으면 클래식; `ui/stats.js achievementRuleset`, 고른 것은 `achv.ruleset`). 허브 카드의 LV·트로피도 같은 모드로 세고 LV 앞에 모드 이름을 단다.
- **그림·글꼴**: 공식 행사 전적 웹페이지의 소재(`ui/statistics/*`: 육각 틀·빛, 기록 아이콘, 머리 띠, 등급·정예 표식, 장비 칸, 전략 표식, 라벨 글꼴 Source Han Sans CN Medium). 없으면 글자·CSS로 그린다. 공식 업적 단추는 웹페이지를 열고(`constData.webBusType` `ak_act2autochess`) 그 숫자 글꼴은 Novecento Wide Medium이다(글꼴 파일 이름표로 확인) — 무료 사용권이 웹 삽입을 막아 받지 않고, 숫자는 HUD와 같이 Lexend Exa 500·자간 −0.06em(관리자 결정 2026-11-13, 「HUD 숫자 글꼴」과 같은 이유). 트로피·모드별 판 수(upstream에서 온 줄)도 같은 글꼴, 모드 표의 칸은 가운데 정렬(관리자 요청 2026-11-13). 행사 띠의 시즌 문양은 높이 0.46rem 상자에 맞춰 그린다 — 규정 문양(138×167)은 세로로 길어, 그리드 칸 안 그림의 퍼센트 높이가 먹지 않던 때 제 크기로 띠 아래까지 잘려 나왔다(2026-11-13 고침).
- **LV**(`ui/level.js`): 카드의 LV는 기록의 위수 인증(정산 줄의 `reward`)에, 일일 방어 목표(`config.rewards.daily`: 하루 200을 모으면 300 추가, 04:00 넘김)를 그날 한 번 더해 `config.rewards.milestones`(act2autochess `milestoneList`, 누적) 단계로 센다.
- **저장**: 압축된 옛 기록도 활성 맹약 id·트로피·위수 인증을 남기고(업적·LV가 읽음), 맹약 중첩이 가장 높은 기록은 라인업을 그리기 위해 압축하지 않는다. 그만큼 1000판을 꽉 채운 연합 기록에서 남는 판 수가 줄어든다(활성 맹약 12개인 최악에서 약 4분의 3).
- 공식은 업적을 계정에 서버로 쌓는다. 이 서버에는 계정이 없어 브라우저 기록으로 센다 — 기록을 지우면 LV 0부터 [추정·서버: 공식은 계정 기록]. 어느 판이 위수 업적인지(정산 때의 활성 맹약 중첩), 무엇을 한 판 기록으로 세는지, 육각 그림의 20회 기준, 일일 목표 보너스가 레벨에 들어가는지와 그 점수가 난이도·모드와 무관한지는 upstream이 영상·웹페이지를 보고 정한 것이다 [추정·화면: upstream 해석, 공식 화면과 대조 안 함]. 한 판 최다 처치 수는 우리 정산의 `stats.kills`(upstream은 연합 방어 실제 처치를 더한 값).


## 규정 선발 편성 확정 화면 (관리자 결정 2026-11-11)

새 시즌 「규정」의 판 시작 셋째 단계 「3/3 선발 편성 확정」(`PHASE.DIY_CHOOSE`, 규칙은 `diy.md` 「규정 선발 편성 12칸과 선발 편성 확정 단계」)의 화면이다(`public/js/screens/diyChoose.js`, `public/css/screens/diychoose.css`). 공식 화면 2장(연합 4인 판, 고르기 전·준비 뒤)과 공식 프리팹 `auto_chess_diy_choose_state`·`_level_view`·`_char_view`를 따라 그렸다(관리자 결정 2026-11-11: 공식 배치 그대로, 카드는 판 밖 오퍼레이터 설정의 공용 카드로, 맹약은 민트 원판 위 문양, 준비 인원은 사람 아이콘).

- **맹약 하반기도 이 화면**(관리자 결정 2026-11-19): 맹약에도 이 단계가 생겨(`diy.md` 같은 절) 본문은 규정 3/3 그대로 쓰고 시안은 따로 없다. 그림도 규정 추출물 그대로 — 맹약 클라에는 이 화면이 없어, 맹약 판의 3/3은 `ui/assetUrls.js withDiyChooseArt`가 규정 추출물의 `diychoose`·`diychooselevelsprite` 두 묶음만 맹약 그림 목록 위에 붙여 그린다(전에는 기본 시즌에 `withSeasonArt`가 돌지 않아 CSS 기본 채움이었음). 머리만 맹약 머리(아래 「판 시작 단계 머리」, 규정 캐릭터·말풍선·`pop`은 쓰지 않음). 전략 선택 상세 창의 선발 프리셋 줄은 빠지고 3/3 프리셋 띠로 옮겨 감(규정과 같음, `hasDiyChooseStep`). 곡은 시즌과 상관없이 판 시작 곡(`audio.js bgmKeyFor`). 재발 방지: `test/ui/season-art.test.js` 「the 3/3 确定自选编队 art」.
- **배치**: 위는 전략 선택과 같은 단계 머리(「n/3」 — 시즌의 시작 단계 수는 데이터 `config.timers.enterSteps`에서, 두 시즌 모두 3(맹약은 2026-11-19부터); 브리핑·전략 선택도 같이 1/3·2/3). 왼쪽은 전략 선택의 플레이어 줄(고른 전략, ✓ = 이 단계의 준비)과 「시뮬레이션 정보」. 가운데는 등급 줄 둘(Ⅴ 위·Ⅵ 아래, 공식 `doc_color` 띠): 오른쪽에 큰 등급 문양(`diy_choose_level_icon_<등급>_c`, 편성에 그 등급이 없으면 `_g`)과 「고른 수/한도」(`num_bg`), 카드는 오른쪽부터. 그 등급 편성이 없으면 빈 사람 그림과 「n티어 선발 편성이 없습니다」. 아래는 안내(「*일부 소속 오퍼레이터가 등장하지 않는 맹약은 시뮬레이션에서 활성화하기 어렵습니다」), 준비 인원(브리핑의 사람 아이콘 `img_player_bg` → 준비하면 `img_player_confirmed`), 「준비 완료」/「준비 취소」 단추(`btn_confirm`/`cancel`).
- **카드**: 판 밖 오퍼레이터 설정의 공용 카드 `auto_chess_deploy_char_item_view`(140×266 단위)의 배치 — 바탕 판, 초상 받침·아래 그늘·테두리, 왼쪽 위 직군 칸, 스킬·모듈 칸(비면 `img_module_no`), 등급 문양, 별, 이름, 맹약(`auto_chess_deploy_char_card_bond_item`: 민트 원판 `bkg_char_card_bond_active` 위 #051c17 문양), 왼쪽 기둥(`obj_left_info_part` — 아래 「선발 편성 탭」의 「카드」; 2026-11-11에는 뺐다가 관리자 결정 2026-11-19로 넣음). 이름은 공식 `txt_char_name` bestFit처럼 칸에 맞을 때까지 글자를 줄인다(최소 6 px, 말줄임 없음 — 2026-11-19 전에는 「…」). 카드는 선발 편성 탭과 같은 부품(`ui/diyCard.js DiyCard`). 고른 카드는 공식 선택 테두리를 등급색으로(Ⅴ #ebb85e, Ⅵ #fb752a — 프리팹 `obj_select_outline_5|6`의 색). 맹약이 모두 이번 판에서 꺼진 카드는 「금지」(검정 80 % 덮개와 `ban`)이고 고를 수 없다(서버가 그런 선발을 상점에서 빼므로 — `initDiyStock`).
  - 초상과 직군 칸(관리자 제보 2026-11-19): 초상은 창(80.5)보다 넓은 102 그림이라 `max-width: none` — 없으면 `css/theme.css`의 `img { max-width: 100% }`가 80.5로 줄여 오른쪽에 창 바탕이 보였다. 직군 칸은 공식 `img_profession` 16×16(`panel_profession` 22, Image 색 #999999)이라 정사각 문양 `prof.large`(흰 바탕 검은 문양)를 뒤집어 #999로 낮추고 screen으로 얹는다 — 가로 띠 `prof.icon`(「CASTER 术师」 197×88)을 16×16에 눌러 넣어 깨져 보였다. [추정·미조사: 공식이 이 칸에 런타임에 넣는 스프라이트 이름은 안 봄]. 재발 방지: `test/ui/diy-ui.test.js` 「the card portrait keeps its full width」.
- **고르기**: 카드를 누르면 고르고, 다시 누르면 뺀다. 한도(등급마다 2)가 찬 등급에서 다른 카드를 누르면 그 등급에서 가장 먼저 고른 카드가 빠지고 새 카드가 들어간다(관리자 결정 2026-11-11) [추정·화면: 공식 화면에 찬 등급을 누르는 장면이 없음]. 누를 때마다 고른 칸 전체를 보낸다(`g.diyChoose`). 「준비 완료」 뒤에는 바꿀 수 없고, 가운데가 공식 `panel_team_selected`(「선발 편성 선택 완료」 문양, `select_doc_*`)로 바뀌며 등급 줄에는 고른 카드만 남는다(하나도 없는 등급은 `none` 「⌀NONE」). 「준비 취소」로 다시 고친다.
- **화면은 서버가 가진 선택을 보인다**(플레이어 제보 2026-11-20: 3/3에서 고른 선발이 판에 없음): 누른 카드는 요청이 오가는 동안만 화면 쪽 순서로 바로 보이고, 보낸 요청이 모두 끝나면(답·실패·시간 초과) 서버의 `m.private.diyChoose.chosen`으로 맞춘다 — 둘이 같은 칸은 누른 순서를 지켜 찬 등급의 「가장 먼저 고른 것」이 그대로다(`gameLogic settleDiyChoice`). 실패한 요청은 알림을 띄운다. 「준비 완료」 뒤 등급 줄은 서버 값만 그린다. 전에는 화면이 서버 값이 **바뀔 때만** 다시 읽어서, 연결이 끊기거나 시간이 지나 서버에 닿지 않은 요청은 알림 없이 「골랐음」으로 남았고(서버 값은 계속 빈 채라 고쳐지지 않음) 판은 그 선발 없이 시작했다. 재발 방지: `test/ui/diy.e2e.test.js`(실제 서버: 닿지 않은 `g.diyChoose`의 카드가 다시 빠짐), `test/ui/gameLogic.test.js` 「settled requests」.
- **「고른 수/한도」**: 공식 `text_phase_now`(27, #00ffc4)·`text_phase_total`(19, #959595)은 같은 기준선, 판(`num_bg`) 가운데 줄 — 글꼴은 `Novecentowide-Medium`(Lexend Exa로, 「HUD 숫자 글꼴」). 2026-11-13 전에는 Bender에 위 여백 0.1rem(처음 만들 때 기준선 정렬이 줄을 상자 위에 붙이는 것을 내리려던 값)이라 숫자가 아래로 밀렸다; 이제 여백 없이 줄 하나를 `align-content: center`로 가운데.
- **그림**: 규정 클라의 추출물(`tools/local-extract/season_ui.py`의 `prefabs` — 위 프리팹들이 보여 주는 그림을 그 프리팹의 참조대로: 보통 이미지, 그리고 공식 클라의 아틀라스 이미지(`_initAtlas`·`_initSpriteId`)는 아틀라스 텍스처에서 잘라 냄)이 `diyChooseArt/…`로 들어온다(맹약 판도 같은 추출물, 위). 추출이 없으면 CSS 색으로 그린다.
- 이 단계 동안 「오퍼레이터 설정」은 없다. 편성 바꾸기는 카드 줄 위의 선발 프리셋 띠(준비 완료 전까지, 관리자 결정 2026-11-13 — `diy.md` 「규정 선발 프리셋 — 시즌별 저장과 3/3 선택」).
- 확인: `test/ui/gameLogic.test.js` 「规程's 确定自选编队」(찬 등급에서 가장 먼저 고른 것이 빠짐, 등급 줄·금지, 단계 수). Windows Chrome(로컬 서버, 2026-11-11): 1600×900·휴대폰 터치 844×390, 규정 연합 4인(AI 셋) — 들어가기, 셋 고르기(서버의 `chosen`과 같음), 찬 Ⅴ에서 넷째를 누르면 가장 먼저 고른 칸이 빠짐(2/2·1/2), 준비 화면, 준비하면 다음 단계로. 맹약(2026-11-19, 실제 서버·Windows Chrome, 1600×900 연합 2인·844×390 터치 1인): 규정 3/3과 본문 배치가 같고 그림이 규정 추출물(`--dc-doc` = 규정 `doc_color`), 머리 「3/3 선발 편성 확정」은 맹약 머리, 레이아웃 측정(잘린 글자·그림·요청) 통과. [화면 미확인: 맹약 실제 판]

## 선발 편성 탭 (관리자 결정 2026-11-19 — 시안 3차까지 그대로)

오퍼레이터 설정의 셋째 탭 「선발 편성」(`screens/diy.js`, `css/screens/loadout.css` `.diy*`). 공식 선발 편성 창 `auto_chess_deploy_diy_lineup_state`(CN 클라, 팝업)의 판을 탭 안에 그린다 — 팝업·제목·닫기·흐린 바탕 없이 탭 자리 그대로, 위의 맹약 프리셋 줄·연결된 전략도 그대로(관리자 결정 2026-11-19). 경위: 빈 칸과 찬 칸의 높이가 달라 한 칸이 차면 그 줄만 커져 칸이 어긋났음(관리자 제보 2026-11-19); 공식은 빈 칸·카드가 같은 123×266이라 이 문제가 없다. 시안·공식 치수·검사는 관리자 노트의 연구 문서(2026-11-19 선발 편성).
- **줄 묶음**(`DiyLineup`): 공식 캔버스 단위 × `--lu`. 티어마다 줄(860×250, 위 간격 270) — 띠 `pop_diy_level_tag_bg`(흰 그림 × Ⅴ #ffd600 / Ⅵ #ff7c00, 늘림), 표식 `pop_diy_level_5|6_tag_short`(146×277, 줄 기준 −40, −21.5), 칸 여섯(123×266, x 80부터 143마다, y −10 — `HorizontalLayoutGroup` 간격 20). 묶음 전체 958×547.5를 탭 본문 가로 가운데에. `--lu`는 HUD 단위(`--ui-u`)이고, 본문 높이(·폭)가 모자라면 15 %까지만 줄여 맞추고 그보다 더 모자라면 줄이지 않고 본문이 넘어간다(데스크톱 1600×900은 설명 1줄 덕에 줄이지 않음). 휴대폰(높이 560 px 이하)은 늘 본문에 맞춰 줄인다(두 줄이 넘김 없이; 844×390에서 0.581 px). `DiyPanel`이 본문 크기를 보고 px로 정한다(이 프로젝트 CSS는 컨테이너 쿼리를 쓰지 않음 — `test/client-static.test.js`).
- **칸**: 찬 칸은 3/3 「선발 편성 확정」과 같은 카드(`ui/diyCard.js DiyCard`, 아래 「카드」)를 칸 폭 123으로 — 공식 칸의 `card_view_parent`가 카드를 칸 폭으로 늘리므로 오른쪽에 붙는 별·이름·맹약이 3/3의 140폭 카드보다 8.5단위 왼쪽(이름 오른쪽 18·폭 102.23·가운데 y 206, 별 오른쪽 17.4·가운데 y 187, 맹약 오른쪽 18.5). 빈 칸은 공식 그림 `pop_diy_item_add`(138×255, 칸 기준 −7.5, 10.5) 한 장. 찬 칸에 ✕는 없다(공식 프리팹에 노드 없음 — 빼기는 고르기 창에서, 관리자 결정 2026-11-19). 지금 판에서 쓸 수 없는 저장된 선발은 칸 오른쪽 위 경고 표시(글은 그 `title`). 칸을 누르면 **그 칸의 티어** 고르기 창. 잠재·육성도 선택은 탭에 없고 고르기 창의 줄·상세에만.
- **카드**(`DiyCard`, 3/3과 탭 공용): 공식 `auto_chess_deploy_char_item_view` — 위 「규정 선발 편성 확정 화면」의 카드 + 왼쪽 기둥 `obj_left_info_part`(140폭 카드 좌표 (12, 76) 30×98: `img_char_level_normal_bg`, 일반 레벨 #acacac 16을 `char_elite_base_<단계>` 위에, 정예 레벨 #fff3b6 17을 `char_elite_gold_<단계>` 위에, 잠재 `potential_<잠재−1>_small`을 `potential_bg`(#4f4f4f) 위에). 레벨·단계는 그 칸의 두 형태(`slotRecord` 일반·정예: 2정예 Lv1 / Lv60), 잠재는 오퍼레이터 설정의 값(`opsOf`). 레벨 숫자 글꼴은 시안대로 Bender 굵게 [추정·화면: 공식 `txt_lv_num`의 글꼴 이름은 안 봄]. 이름은 공식 bestFit(1–18)처럼 줄여 다 보인다(`ui/fitLine.js`, 최소 6 px). 그림은 규정 추출물(`season/act3autochess/diylineup`·`diychoose`, `withDiyChooseArt`로 맹약 하반기도 빌림); 없으면 CSS 색.
- **위쪽**: 데스크톱은 설명을 1줄로(긴 원래 글은 마우스를 올리면 보이는 `title`), 연결된 전략은 프리셋 칩 줄 오른쪽 끝, 그 아래 프리셋 안내 한 줄. **휴대폰**(높이 560 px 이하)은 설명·프리셋 줄·연결된 전략을 왼쪽 접기 단추(`DiyFold`, 폭 96 px) 하나로 접는다 — 모양은 공식 줄 표식의 결(세로 가는 줄 판, 민트 ✕◆◇ 표식, 「NO.」 모서리 틀, 세로 영문 「BOND PRESET · LINKED STRATEGY」 — 그림에 티어 글자가 박혀 있어 CSS로) 안에 「맹약 프리셋 / 지금 프리셋 / 연결된 전략 / n개·없음」, 맨 아래 「펼치기 ▾」(관리자 결정 2026-11-19, 시안 가). 누르면 그 셋이 칸 묶음 위에 떠서 열리고(칸을 밀지 않음), 다시 누르거나 바깥 누름·Esc로 접힌다. 처음엔 접힘(저장 안 함).
- **고르기 창**(`DiyPicker`, 모양은 위 「upstream 0.3.3 … 오퍼레이터 설정」의 선발 선택 창): 한 티어를 **여러 명** 고른다. 머리는 공식 `pool_view/panel_title`의 값을 HUD 단위로 — 「선발 편성 [티어]」 #ff9d04 22 · 안내 「오퍼레이터를 n명까지 골라 편성에 넣습니다」 #e4e4e4 60 % 18 · 「선택」 #e68e06 17 · 「n/6」 #ae761f 27(Bold 자리 → Lexend Exa 700). 제목과 안내는 공식처럼 두 줄이 아니라 한 줄에 나란히(줄에 자리가 남음), 머리에 닫기 단추는 없다 — 아래 「취소」와 Esc가 닫는다(관리자 결정 2026-11-19). 줄을 누르면 넣거나 빼고, 넣은 차례 번호가 줄의 스킬 왼쪽에 붙는다(공식 `select_index` 모양: 어두운 굵은 숫자 + 2 px #e9e9e9 테두리, 숫자 높이 = 스킬 아이콘 — 관리자 결정 2026-11-19 「나」). 창을 열 때 그 티어 칸의 오퍼레이터를 칸 차례대로 목록 맨 위에 모으고, 창 안에서 새로 누른 줄은 제자리. **확인**은 그 티어의 칸 1~n을 고른 차례대로 채우고 나머지를 비운다(한 번에 저장·동기화). 「선택 비우기」(공식 `btn_clear`, 왼쪽 아래)는 창 안의 고른 것만 비움(확인 전까지 칸 그대로). 한 티어 6명이 찬 뒤 일곱째를 누르면 **거절**하고 알림 하나(「Ⅴ티어 선발 편성은 6명까지입니다. 고른 오퍼레이터를 다시 눌러 빼세요」), 「n/6」이 한 번 붉게 깜박인다 — 3/3처럼 먼저 고른 사람을 빼지 않는다(관리자 결정 2026-11-19) [추정·화면: 공식 화면에 일곱째를 누르는 장면이 없음]. 같은 티어 다른 칸의 오퍼레이터는 고를 수 있는 줄이고, **다른 티어**에 든 오퍼레이터만 흐리고 못 누른다(「이미 n티어 선발에 있음」) [추정·화면: 공식 고르기 화면에 다른 티어 편성의 카드가 보이지만 누를 수 있는지는 화면에 없음]. 오른쪽 상세는 마지막에 누른 줄. 폭 1000 px 이하(목록만 보이는 폭)는 줄 끝에 「상세 ›」 단추(38 px 띠, 줄 높이 전부)가 있어 그것만 상세를 연다 — 줄 누름은 넣기/빼기라서(관리자 결정 2026-11-19). 상세가 목록을 덮은 동안 바닥 줄은 상세 몫으로 바뀐다 — 「취소」(상세에서 바꾼 그 오퍼레이터의 스킬·모듈·잠재능력·육성도·스킨을 열 때로 되돌림 — 잠재능력·육성도·스킨은 오퍼레이터 설정처럼 누르는 즉시 저장되지만 상세의 취소는 그것까지 되돌린다, 관리자 결정 2026-11-19)·「확인」(바꾼 것을 두고) 둘 다 목록으로 돌아가며 편성을 확정하지 않는다; 「오퍼레이터 목록」 단추는 없고, Esc는 상세의 「취소」(관리자 결정 2026-11-19 — 전에는 목록과 바닥 줄을 같이 써서 상세의 「확인」이 편성을 확정했다).
- **머리 「선택됨 n/12」**: 오퍼레이터 설정 머리의 분모는 칸 수(`diySlotList`; 데이터가 없으면 `DIY_LIMITS.slots`). 2026-11-19 전에는 「/4」가 박혀 있어 12칸인데 「7/4」로 보였다(관리자 제보 2026-11-19).
- 공식과 일부러 다른 것(관리자 결정 2026-11-19): 팝업 대신 탭, 고르기 창은 공식 카드 격자·왼쪽 상세 대신 우리 목록 + 오른쪽 상세(공식 모양은 오퍼레이터 설정 개편과 같이), 찬 칸 ✕ 없음, 일곱째 거절, 별은 `img_rarity` 그림 대신 ★ 글자(3/3 그대로), 차례 번호는 초상 위가 아니라 스킬 왼쪽, 휴대폰 접기 단추와 「상세 ›」 단추(공식은 팝업·카드 격자라 해당 노드 없음). 고르기 화면의 예비 오퍼레이터 꼬리표는 없음(이 서버의 선발에 예비 오퍼레이터가 없음).
- 확인: 커밋 전 Windows Chrome 한 번(1600×900 + 844×390 터치 — 탭·접기 연 모습·고르기 창 5명·휴대폰 상세): 레이아웃 측정 통과, 공식 CN 선발 편성 창 스크린샷과 겹쳐 보기 93짝 모두 2 px 안. [화면 미확인: 맹약 하반기 탭, 실제 판에서 연 고르기 창] 재발 방지: `test/ui/diy-ui.test.js` 「自选编队 tab」(여러 명 고르기·거절·확인으로 칸 채우기·다른 티어만 흐림·공용 카드·bestFit·휴대폰 상세의 바닥 줄·취소가 되돌리는 것), `test/ui/diy.e2e.test.js` 「picker on a phone」(실제 서버·844×390), `test/ui/season-art.test.js` 「the 3/3 确定自选编队 art」(맹약 하반기도 줄 묶음 그림), `test/ui/diy.e2e.test.js`(실제 서버·브라우저).

## 판 밖 나가기 단추 (2026-11-13, 관리자 결정)
- 대기실과 판 시작 단계(브리핑·전략 선택·3/3)의 왼쪽 위 나가기는 공식 그림이다(`ui/matchChrome.js ExitTile`, `css/components.css .exit-tile`). 공식 클라에서 확인: 대기실 프리팹 `auto_chess_prepare_page`의 `outer_top_menu_view` 왼쪽 위(100×100) — 나가기 `leave_btn` 54×56(`img_return`: 회색 둥근 칸에 흰 문·화살표, 아래 그림자), 핑 `ping_part` 63×22(`img_delay_bg`, 흰 글자 16)는 단추 중심 40.4 아래(단추 아래 끝과 1.4 간격). 그림은 EN·CN이 같고 로컬 추출물 `ui/outer`에 있다(없으면 회색 CSS 칸 + 아이콘). 판 시작 단계도 공식 CN 화면(관리자 캡처 2026-11-13)에서 같은 회색 단추에 핑이 아래다. 판 시작 단계에서 단추 오른쪽은 아래 「판 시작 단계 머리」의 사슬(2026-11-18).
- 2026-11-08의 「브리핑과 같은 빨간 정사각 단추」를 되돌린 것이다(upstream의 대기실 회색 단추가 공식에 가까웠음). 전투 HUD의 나가기는 공식대로 빨강 그대로(관리자 결정 2026-11-13).
- 휴대폰(높이 520 이하): 단추 30×31, 핑 38×13으로 줄여 45 px 머리와 대기실 위 막대에 들어가고, 누르는 곳은 투명하게 넓혀 32 px 이상. 대기실 채팅 판은 핑 아래에서 시작(데스크톱 1.24rem, 휴대폰 55 px).
- 확인: Windows Chrome(2026-11-13) 1600×900·844×390 — 대기실·브리핑·3/3, 핑과 단추 간격, 채팅 판과 겹치지 않음. `test/ui/stats.e2e.test.js`가 단계 머리의 나가기를 `.exit-tile__btn`로 누른다.

## 판 시작 단계 머리 (2026-11-18, 관리자 결정 — 시안 1판)
- 공식 클라에서 확인: 브리핑 `auto_chess_stage_info_state`의 `panel_top`(두 클라 같은 틀), 전략 선택 `auto_chess_band_choose_state`·3/3 `auto_chess_diy_choose_state`(CN만)의
  `panel_choose_topbar/group_game_info`. 머리는 왼쪽 74단위(나가기 자리)를 비우고 왼쪽으로 붙은 사슬이다: 모드 판(1단계 `img_title_mode_*`, 2·3단계 `mode_*` —
  문양이 그림 안에, 폭 = max(175, 왼쪽 59/61 + 글자 + 오른쪽 30/43), 글자 21/22) | 구분선(`img_split_line` 2×41; 그림 없는 것은 #e4e4e4 α0.2) | 규정: 캐릭터 칸
  `img_char_spine` 113×96 + 말풍선(1·2단계 `img_chat_babble`, 3단계 `pop`) 안 「n」(40 #4ed8af) 「/3」(28 #9c9c9c) + 제목(흰 24) / 맹약: 「n/2」(우리는 2026-11-19부터 「n/3」, 아래) + 제목(1단계만 39 #23daaf ·
  29, 제목 #e4e4e4 23 — EN `panel_title`). 캐릭터 칸은 이름과 달리 스파인이 아니라 테마 `skin_config.json`의 `char_spine_outer` 정지 그림 한 장(기본 테마
  `ac_n_initial`). 2·3단계 공식 막대는 모드 판과 단계 칸 사이에 「本局信息」 단추(`btn_game_detail`)가 41.6씩 겹쳐 들어간다. 공식 KR 맹약 화면·CN 규정 1/3 화면
  (관리자 2026-11-18): 모드 이름은 문양과 같은 색, 모드 글자의 세로 가운데 = 나가기 단추 가운데, 말풍선 가운데는 그보다 약 8단위 위, 캐릭터는 머리 위 끝부터 머리
  높이를 거의 다 씀.
- 우리(`ui/matchChrome.js StepChain`·`stepHeadArt`, `css/screens/briefing.css .stephead__chain`): 가운데 제목과 그 위 영문 작은 글자를 없애고 나가기 칸
  오른쪽에 위 사슬을 그린다(관리자 결정 2026-11-18). 모드 판 = 이름(규정 등급 n·고속 시뮬레이션·난이도 이름) + 색(표 `modeColor`), 그림은 `modeDifficulty`로
  (입문 = 1단계 `guide`·2단계 `train`). 규칙 모드 꼬리표(캐주얼·커스텀)는 모드 판 바로 뒤 — 모드에 딸린 말이라 구분선 앞에 둠. 「本局信息」 단추는 넣지 않는다
  (관리자 결정 2026-11-18: 2·3단계 모두; 3/3 왼쪽 아래는 전략 선택과 같은 「적 정보 | 맹약 정보」 줄 — 위 「전략 선택 중 적 정보·전장 다시 보기」) — 그래서 2·3단계도 구분선은 판 뒤 3단위, 캐릭터·말풍선은 시안 간격.
  맹약은 2026-11-19부터 「3/3 선발 편성 확정」 단계가 있어(위 「규정 선발 편성 확정 화면」) 「1/3」·「2/3」·「3/3」이고, 3단계도 맹약 머리 그대로 글자만
  「3/3」 + 규정과 같은 제목 — 규정 머리 그림(캐릭터·말풍선·`pop`)은 쓰지 않는다(관리자 결정 2026-11-19). 수는 데이터의 시작 단계 수(`startStepCount`).
  그림: 규정은 시즌 추출물(`season/<id>/stageinfo`·`diychoose`·`skin`), 맹약 1단계는 EN 추출물(`ui/outer`) 다음 공개 사본(`stageInfo/*`), 2·3단계는 공개 사본의 전략 선택 화면 그림(`bandChoose/mode_*`)만 — `ui/outer`는 이름 공간이 하나라 모드 목록의 147×40 단추 `mode_normal`·`mode_abyss`가 같은 이름을 차지해, 그 그림을 68 높이 판으로 9분할해 늘이면 문양이 세로로 늘어나고 배경이 꽉 찬 알약이 됐다(험지·초월, 관리자 제보 2026-11-18); 판 그림이
  없으면 난이도 꼬리표(`DifficultyTag`), 말풍선 그림이 없으면 어두운 둥근 상자, 캐릭터 그림이 없으면 칸 없음.
- 세로 자리: 모든 칸을 나가기 **단추**의 가운데에 맞춘다(관리자 결정 2026-11-18 — 단추+핑 묶음의 가운데가 아님). 나가기 칸(단추 + 그 아래 핑)이 머리
  가운데에 있으므로 단추 가운데 = (머리 높이 − 핑 간격·높이) ÷ 2(`--c`; 핑 크기는 `css/components.css`의 `--exit-ping-gap`·`--exit-ping-h` 하나에서 읽음 —
  휴대폰 높이 520 이하는 1 px·13 px). 모드 판 가운데 = `--c`, 구분선 2 아래, 캐릭터는 머리 위 끝부터(우리 머리는 약 91단위로
  공식 100단위보다 낮고 단추 가운데도 약 11단위 높아, 프리팹의 「사슬 가운데 + 9.7」로 두면 위가 잘림). 말풍선도 같은 까닭으로 공식의 「8 위」를
  옮기지 않는다 — 그대로 두니 데스크톱 1600×900·휴대폰 844×390 모두 말풍선 윗변과 「n」 윗부분이 머리 위 끝에서 잘렸다(구현 화면 2026-11-18). 고른
  시안대로 말풍선 몸통(66 중 위 50, 꼬리는 그 아래)의 가운데 = `--c`, 위 끝은 머리 위 끝 아래(`max(0px, …)`); 「n/3」과 제목은 몸통 가운데 한 줄,
  사이 8단위(프리팹 `panel_icon` 70은 우리 숫자 글꼴의 「n/3」보다 좁아 고정 폭이면 간격이 없어짐). 공식 CN 1/3 화면(관리자 캡처 2026-11-18): 「n」과 제목의 글자 모양은
  몸통 가운데, 「/3」은 「n」과 같은 기준선, 「/」와 「3」은 위아래 끝이 같고 「/3」은 흰 제목보다 작아 보인다. 우리: 아래 여백을 프리팹 15가 아니라 17단위로
  해 줄 상자가 아니라 글자 모양(잉크)의 가운데를 몸통 가운데에 둔다(1600×900에서 「2」·제목 ±0.5 px). 우리 숫자 글꼴의 「/」는 기준선 아래로 0.14em 내려가
  위 끝에서 숫자 높이(0.71em)로 줄이고(`.sh-num__sl`), 숫자가 공식 글꼴보다 넓어 28이면 「/3」이 제목만큼 커 보여 26으로 쓴다(관리자 결정 2026-11-18).
- 테마: 캐릭터는 그 판 테마의 `char_spine_outer` 그림(관리자 결정 2026-11-18 — 우르수스 단결단 테마 `ac_n_iron`은 자기 그림). 우리에는 아직 테마 고르기가
  없어 기본 테마 그림만 그린다; 테마가 생기면 `stepHeadArt`의 `char`를 그 테마 것으로.
- 재발 방지: `test/ui/step-header.test.js`(두 시즌 모든 모드의 판 그림·규정 캐릭터·구분선·말풍선 훑기 — 추출물이 없으면 건너뜀; 판 그림이 이 기계에 있으면 높이 68인지, 맹약 2·3단계는 `bandChoose/` 그림인지; 맹약 「n/3」과 3단계 사슬; 사슬 순서·색·대체 모양·가운데
  제목과 「本局信息」 단추가 없음; 단추 가운데 계산; 말풍선이 뿌리 글자 크기 40–240 px·휴대폰에서 머리 안에 드는지와 「/3」 뒤 간격). 화면 [화면 미확인: 실제 판].

## 임시 중첩 표시 (2026-11-11, 공식 CN 화면)

- 근거: 관리자가 준 CN 서버 전투 화면 한 장(「클로저」 테마, 규정 우르수스 6명). 맹약 줄 원판 숫자는 고정 + 임시 중첩의 합계(우르수스 193)를 **노란 글자**로, 임시 중첩이 없는 맹약(견수 61)은 흰 글자. 맹약 상세 창 오른쪽 위는 「层数 49」(고정) 아래 한 줄에 노란 「+ 144」(임시). 효과 수치(공격력 +180% 등)는 합계 기준.
- 구현: 전투 중 중첩은 브라우저가 돌리는 전투에서 읽는다(`battle/runner.js noteLayers` → `state().bondLayers`). 임시 중첩(`Battle.tempLayerGainsOf`, 결과의 `tempLayerGains`와 같은 장부)을 그 옆에 `state().bondTemp`로 내보내고, `ui/watchBonds.js withLiveLayers`가 그 합계를 쓰는 맹약 항목에 `tempLayers`로 붙인다(보이는 합계를 넘지 않음, 서버 정산이 이미 더 큰 값이면 붙이지 않음). 맹약 줄은 `has-temp`면 숫자가 노란색(#f2c510, 캡처에서 뽑음), 상세 창은 `层数` 뒤에 고정 중첩, 그 아래에 `+ n`(`bpop__temp`, 공식 그림 HUD) — 공식 그림이 없는 화면은 정보 줄에 `层数 49 + 144`. 효과 설명은 합계로 셈. 보고 있는 팀원의 맹약 줄과 카드 맹약 칩에서 연 상세 창도 같다.
- 시험: `test/ui/temp-layers.test.js`, `test/match/watch-bonds.test.js`(runner `bondTemp`).

## HUD 숫자 글꼴 (2026-11-11, 관리자 결정)

- 공식 클라에서 확인: HUD 프리팹의 Text는 글꼴 칸이 비어 있고 같은 오브젝트의 `DynFontLoader._fontName`이 이름으로 글꼴을 정한다. 숫자는 대부분 `Novecentowide-Medium` — 맹약 원판 수(`autochess_hud_bond_item` `text_num` 16), 맹약 상세 창의 중첩 수·인원(`text_cur_stack` 16·`text_char_cnt` 18), 위쪽 라운드·LP·처치 수(`root_round` `text_num`·`root_hp` `text_hp`·`group_battle` `text_num` 20), 상점 비용·자금·레벨, 라운드 시작 창, 보스 준비 창의 체력. 오퍼레이터 카드 스탯·레벨은 `Novecentowide-Normal`, 글자는 `NotoSansHans-Medium`·`SourceHanSansCN-Heavy`, 카운트다운만 비트맵 숫자 글꼴(`auto_chess_num_font`, 테마마다 따로).
- 우리 공개 글꼴(`tools/assets/fonts.mjs`)은 Novecento Wide Normal 하나뿐이고, 무료 배포판에도 Medium은 없다(유료). 무료판의 사용권(Synthview Desktop EULA)은 웹 글꼴 삽입을 금지한다. 그래서 Medium 자리는 **Lexend Exa**(SIL OFL 1.1, google/fonts 커밋 고정, `tools/assets/fonts.mjs`가 다른 공개 글꼴과 함께 받음)로 대신한다(관리자 결정 2026-11-11). 공개 OFL 후보의 숫자를 겹쳐 비교해 가장 가까운 것: 숫자 높이는 같고(0.724 대 0.729 em) 숫자 폭이 0.06 em 넓어 크기는 그대로, 굵기 500, 자간 −0.06 em. 글꼴이 안 오면 Novecento Wide Normal로 그린다. Normal 자리(카드 스탯 등)는 지금 그대로 Novecento Wide Normal.
- 이번에 바꾼 곳(공식 그림 HUD): 맹약 원판 수는 Bender 굵게 12.4 → Medium 자리 글꼴 500 **16**(프리팹 크기 — 12.4는 Bender가 커 보여 줄였던 값, 공식 글꼴로는 캡처의 숫자 폭이 16에서 맞음, 관리자 결정 2026-11-11 시안 B), 상세 창 중첩 수·임시 중첩·인원 400 → 500, 위쪽 라운드·LP·처치 수 Bender → Medium 자리 글꼴 500. 상점·라운드 시작 창·보스 준비 창·카드 스탯은 아직 지금 글꼴.
- 2026-11-13 더 바꾼 곳(관리자 보고 「숫자가 아래로 밀림·공용 글꼴」): 상점 비용 숫자·자금(`autochess_shop_cost_item` `text_num`·자금 `coin_num`), 3/3 선발 편성 확정의 「고른 수/한도」(`text_phase_now`·`text_phase_total`), 업적 통계의 트로피·모드별 판 수 — 모두 프리팹의 `DynFontLoader`가 `Novecentowide-Medium`(`tools/local-extract/ui_inspect.py`가 `dynFont=`로 찍음). 자리: 공식 비용 숫자는 마름모 가운데보다 위(EN 22 px·6 위, 규정 20 px·5 위), 규정 자금은 판 가운데보다 4 위(프리팹 99×39 판 기준) — 클라 글꼴의 MiddleCenter 줄은 숫자를 줄 가운데보다 약 0.09 em 아래에 두므로(Novecento Wide의 올림·내림 105·15) 보이는 숫자는 비용 약 4(EN)·3.2(규정) 위, 규정 자금은 그림의 보이는 판(47 중 위 43) 가운데. 우리 줄은 숫자를 0.02 em 아래에 두어 비용 4.4·3.6, 규정 자금 3(120×47로 그리므로) 단위 올린다; 공식 CN 녹화의 자금 숫자가 판 가운데인 것과 맞음. 맹약 자금(EN `coin_num`은 판과 같은 높이)은 높이 그대로. 전에는 Bender 굵게(가짜 굵기)·상자 가운데라, 규정 판(보이는 부분이 위로 치우침)에서 숫자가 내려가 보였다. [추정·화면: 상점 비용 숫자의 공식 자리 — Unity 줄 배치를 글꼴 높이로 계산했고 공식 상점 화면과 나란히 보지 않음] 레벨 숫자·라운드 시작 창·보스 준비 창·카드 스탯은 아직 지금 글꼴(관리자 노트의 공용 글꼴 조사로).
- **2026-11-13 공식 짝이 없는 화면·Bold 자리**(관리자 결정 2026-11-13, 시안을 보고 정함): ① 공식 위수협의에 같은 화면이 없는 우리 화면(통계·로비·설정·채팅·패치 노트·커스텀 규칙·피드백 등)의 숫자도 Medium 자리와 같은 Lexend Exa 500 — 숫자 글꼴 `--font-num`(`css/theme.css`)이 Bender에서 **`'Lexend Exa 500'`**으로 바뀜. 이 이름은 Lexend Exa 파일을 굵기 100–900 전체에 걸쳐 `font-variation-settings: "wght" 500`으로 고정한 글꼴 정의라, 규칙이 700·900을 달라 해도 500으로 그리고 가짜 굵기도 생기지 않는다(시안의 「모두 500」을 규칙마다 고치지 않고 그대로 옮김). Bender는 이 파일이 안 올 때의 대체로만 남는다. 자간은 `.num`과, `--font-num`을 쓰면서 자간을 따로 정하지 않은 규칙 모두 −0.06 em(Lexend 숫자가 Novecento보다 0.06 em 넓음); 자간을 일부러 벌린 라틴 표식(NEW·SELECTED·단축키 등)은 그대로. ② 공식 `Novecentowide-Bold` 자리는 Lexend Exa **700**(Novecento 굵기 사다리에서 Medium ≈ 500, Bold ≈ 700이라 둘의 차이를 그대로 둠): 상점 승급 숫자(`panel_shop_main` `text_num` 50 — 2026-11-19부터 로마 숫자라 Krona One, 아래 2026-11-19 줄), 정산 클리어 라운드(`text_round` 94 — 「/14」와 줄의 ROUNDS는 Medium), 브리핑 준비 완료 수(`text_confirmed_count` 37 — 「/4」 `text_total_count`는 Medium), 규정 연승 배지(`panel_win_streak` `text_streak_count`). 협의 선택(`auto_chess_room_select_state` `text_degree`·`text_desc_*`)과 오퍼레이터 설정(`auto_chess_deploy_*` `select_index`·`text_info`·`txt_assist_info`)의 Bold 자리는 그 화면이 공식 프리팹대로 바뀔 때 같이 따른다(지금 화면은 우리 배치라 ①). ③ `Novecentowide-Normal` 자리는 Novecento Wide Normal, 자간 0: 오퍼레이터 상세의 LV·스탯 다섯·HP(`act3autochess_character_info_subpanel_status` `text_lvl` 54·`text_lvl_prefix`·스탯 21·`text_hp` 22), 상점 「배치 가능 인원」 수(`panel_remaining_available_character` `text_cnt` 18). (2026-11-19 관리자 결정: 승급 상자의 레벨은 로마 숫자 Ⅰ~Ⅵ(`ui/components.js roman`) — 공식 `text_num`은 그림이 아니라 글자이고, 팀원 정보 창·로비의 상점 레벨 그림(`shop_level_n`·`shop_level_icon_n`·`shop_level_tag_n`)은 로마 숫자; 팀원 정보 창의 그림 없는 대체도 로마 숫자.) ④ 상점 승급 숫자가 「LEVEL」 글자에 겹치던 것: 공식(EN 프리팹, 상자 111×175)은 LEVEL 글자가 위에서 51.5, 숫자 줄(Bold 50, MiddleCenter)이 75.5 가운데 — 클라 줄은 숫자를 줄 가운데보다 0.09 em, 웹 줄은 0.02 em 아래에 두므로 우리 줄은 79(`lvcard__frame` 안에서 46), 크기 50(2026-11-19 Krona One으로 47.5·46, 아래 줄). 전에는 Bender 56을 75.5에 두어 숫자 윗부분이 LEVEL에 닿았다. 캔버스·Pixi로 필드에 그리는 숫자(기물 개수·재배치 카운트다운·티어 칩)는 아래 2026-11-16 줄. [추정·화면: Bold 자리의 굵기 700 — 공식 Bold와 나란히 맞춰 보지 않음, 연승 배지 캡처와 눈으로만 비교]
- **2026-11-16 라운드 시작 창과 필드 숫자**(관리자 결정 2026-11-16, 시안 `1 B · 2 B · 3 예 · 4 그대로`):
  ① 라운드 시작 창(`round_start_dialog`)의 라운드 수 `text_round` 40과 획득 수 `group_sources/text_num` 26은 `Novecentowide-Medium` 자리 → Lexend Exa 500·자간 −0.06 em(위 Medium 자리와 같은 규칙, 전에는 Novecento Wide Normal 자간 +0.04 em). 높이: 클라 줄은 Novecento 숫자를 줄 가운데보다 0.09 em, 웹 줄은 Lexend 숫자를 0.02 em 아래에 두어, 글꼴만 바꾸면 숫자가 0.07 em(획득 수 26에서 1.8 단위) 떠서 왼쪽 `round_plus`·`round_sources_icon`보다 올라가 보였다(관리자가 시안에서 본 「+6의 6이 +보다 높음」 — 시안만이 아니라 구현에서도 같음, Novecento Normal은 클라와 같은 0.09 em이라 전에는 맞았음). 두 숫자를 0.07 em 내리고, 프리팹이 묶음(`group_sources`) 가운데에서 재는 더하기(−9.4, −3.6)·자금 그림(−37.7, −1.5)은 그 가운데에 그대로 둔다. 공식 배치에서도 더하기의 가운데는 숫자 가운데보다 약 1.4 단위 아래(숫자 위끝이 더하기보다 3.6 단위 위)라 완전히 같은 높이는 아니다.
  ② 정비 구역 소환물 묶음 개수(`act1autochess_battle_dummy_hud_plugin` `shop_hud/token_bg/token_cnt`): 공식은 숫자 글꼴이 아니라 `NotoSansHans-Medium` 22, 흰색, MiddleCenter, 글은 `AutoChessDummyHud`의 `"X{0}"`(라틴 대문자 X) — 공식 클라에서 확인. 우리: Noto Sans SC 500(게임 페이지가 이미 받는 글꼴; 필드를 열 때 `render/app.js`가 라틴 부분을 미리 받고, 늦게 오면 다시 그림) 흰색 「X{n}」. ③ 바탕은 공식 `token_cnt_bg`(76×31 × 0.75, 장비 막대와 같은 자리 (13, 29), 루트 배율 1.25 — `render/hud-bars.js PREP_TOKEN`), 글은 그 가운데 22 × 0.75 × 1.25 단위; 높이는 티어 칩과 같은 줄 — 프리팹에서 판(29)과 칩 `chess_level_icon`(28.2)이 한 줄이고, 칩은 「전투 화면 UI」 기물 레벨대로 프리팹 128에서 115로 내려와 있으므로 판도 칩 높이 + 0.8 × 1.25 = 116단위(처음 프리팹 높이 129에 두어 칩보다 14단위 떠 보였음, 관리자 화면 확인 2026-11-16 공식 영상 캡처 「X7」이 칩과 같은 높이); 소재는 로컬 추출(`tools/local-extract/extract.py`의 `ui/battlecommon`). 소재가 없는 서버는 전처럼 검은 외곽선 글을 기물 오른쪽 아래에 그린다(글꼴·글은 ②대로). [추정·화면: 판 안 글자의 세로 자리 — Pixi 글 상자 가운데에 맞췄고 공식 화면과 나란히 보지 않음]
  ④ 재배치 카운트다운 숫자와 정비 중 티어 칩 글자는 Bender 그대로: 공식은 카운트다운에 숫자 칸이 없고(「재배치 카운트다운」) 티어 칩 글자는 그림(`autochess_level_N`)에 박혀 있어 대응 글꼴이 없다 — 둘 다 공식 그림이 없는 서버의 대체 그림에서만 보인다. 공식에 대응 글꼴 없음, 관리자 결정 2026-11-16으로 유지.
- **2026-11-19 상점 레벨 로마 숫자 글꼴**(관리자 결정 2026-11-19): 승급 상자 레벨(`lvcard__num`, 로마 숫자 Ⅰ~Ⅵ)과 팀원 정보 창의 그림 없는 레벨 대체(`.pdetail__shop`)는 **Krona One**(SIL OFL 1.1, Reserved Font Name 「Krona」 — 이름을 그대로 쓰므로 글꼴 자료는 고치지 않는다: WOFF2는 표를 그대로 담는 변환, google/fonts 같은 커밋 고정, `tools/assets/fonts.mjs`). 까닭: 공식 로마 숫자 그림(`shop_level_n`·`shop_level_icon_n`)의 I는 세리프 없는 막대인데 Lexend Exa의 대문자 I는 위아래 가로대가 있어 「Ⅲ」이 「工」 줄로 보였다. OFL 후보 11개를 공식 그림과 획/높이·Ⅱ 틈·폭/높이 일곱 비율로 견줘 Krona One이 가장 가깝다(모두 공식 ±10 % 안, 자간 0 그대로). Krona One은 굵기가 400 하나라 400·자간 0, 대문자 높이 0.763 em(Novecento 0.70)이라 크기 46이 공식 50의 숫자 높이, 줄은 프레임 안 46 → 47.5(Krona One 줄이 대문자를 Lexend보다 1.5 위에 두어 — 데스크톱·휴대폰 승급 상자에서 잼, 숫자 자리는 전과 같음). 대체 상점 표시(`game-shop.css`)는 0.66 → 0.6 rem, 팀원 정보 창 대체는 22 → 20. 아라비아 숫자는 그대로 Lexend Exa. [추정·화면: 공식 Novecento Wide Bold 로마 숫자와 나란히 보지 않음 — 같은 시즌의 공식 로마 숫자 그림과만 견줌] 같은 날 늘 글자로 보이는 우리 화면의 티어 로마 숫자도 같은 글꼴(관리자 결정 2026-11-19): 오퍼레이터 설정의 티어 거르기 단추·티어 막대, S.W.E.E.P. 보고서 오퍼레이터 티어, 커스텀 규칙의 계급 줄, 디버그 콘솔의 티어 표시 — 한 부품 `ui/components.js Roman`(`css/theme.css .roman`: Krona One 400, 칸 크기의 0.92 em, 자간 0). 공식 그림이 있고 글자는 그 대체일 뿐인 곳(티어 칩·필드 티어 칩·오퍼레이터 설정 티어 표식·선발 꼬리표와 문양·규정 맹약 단계)은 그대로(보류).
- 시험: `test/ui/hud-number-font.test.js`(2026-11-13 자리 포함; 숫자 글꼴·Bold·Normal 자리·승급 숫자 높이는 「the numeral face」), `test/ui/official-ui-gaps.test.js`(원판 수 16), `test/stats-template-assets.test.js`(업적 창 숫자 규칙 9개), 라운드 시작 창은 같은 파일 「the round-start banner」, 소환물 묶음 개수는 `test/render/unitview.test.js` 「hand token stack count」.

## 규정 액티브 전략 — 초상·클릭·드래그 (2026-11-12, 공식 CN 화면 3장, 관리자 결정)

- 서버 쪽은 `server/match/match/bandSkill.js`(`g.bandSkill`, 보기 `m.private.bandSkill`), 규칙은 [sim.md](sim.md) 「규정 전략」 「액티브 지령 사용」. 화면은 `ui/bandSkill.js`.
- **공식 클라에서 확인**(CN 전투 HUD 번들의 `autochess_hud_panel` `panel_skill`): 지령 초상 `skill_view`(160×100)는 오른쪽 끝, 정비 중에는 위(`skill_layout_prepare`), 전투 중에는 아래(`skill_layout_battle`, 아래에서 180). 둥근 초상(바탕 원 79, 아이콘 85를 원으로 가림), 왼쪽으로 뻗은 막대(168×60) 위 🔍 + 「查看」, 초상 위 비용 원(`group_cost`), 아래 횟수 알약(`group_counter`: 자물쇠 `ic_skill_lock` / 시계 `ic_skill_cooldown` + 숫자), 테두리 셋(`variant_active`·`variant_passive`·`variant_invalid`), 누르는 곳 둘(`btn_active_no_target` 클릭 지령, `active_target_trigger` 드래그 시작). 설명 창 `autochess_hud_skill_detail_dialog`(폭 375, 초상 왼쪽: 전략 이름 · 줄 · 스킬 설명). 드래그 위젯 `autochess_skill_drag_widget`: 초상에서 포인터까지 청록 띠 + 점 무늬 + 화살촉(촉이 포인터), 위 가운데 안내 칸 `drag_tip`.
- **공식 화면**(관리자가 준 CN 「绝境模拟」 3장, 2026-11-12): 드래그 중 안내 「请指向 战场或整备区的干员」(강조 청록) — 「내 오퍼레이터」 대상은 전장 위와 정비 구역 기물 둘 다. 강조는 **가리킨 대상 하나의 발밑 타일만** 밝게 빛나고 다른 대상은 그대로. 비용 0인 지령은 위 숫자 원이 없다(비용 5인 지령은 「5」, 같은 지령이 우르수스를 사서 내려가면 「1」). 전투 중에는 초상이 오른쪽 아래 자금 숫자 위로 내려가고 테두리가 흐리다. 이름표는 없다.
- 구현: 정비 중 자리는 효과 아이콘 열이 있던 자리(준비 인원 줄 아래)이고 효과 열은 그 아래로 내려간다(`.gm.has-bskill`). 클릭 지령은 초상을 누르면 바로 쓴다(확인 없음, 관리자 결정 2026-11-12). 드래그 지령은 초상에서 끌기 시작(8 px), 대상 판정은 기물 끌기와 같은 판정(`view.pickAt` → render/app.js `pieceAt`·`pickBoardTile`) — 기물은 `m.private`의 `board`·`hand`에 있는 것만(필터 `CHAR`면 오퍼레이터만), 보급센터 카드는 `.shopbar__cards [data-slot]`(보상 카드 줄 아님, 칸 종류 `EQUIP`/`CHAR`), 지형 칸은 전장 칸. 가리킨 대상의 타일만 흰빛(`BAND_SKILL_HL`, 묶음 `bandSkill`), 보급센터 카드는 흰 테두리. **지형 칸 지령**(님프 「붕괴의 영역」·보물 사냥꾼 「宝藏探机」)만은 끌기를 시작할 때 쓸 수 있는 칸 전부를 소환물 배치 끌기와 같은 모양(`'legal'` — 3D 보드는 배치 칸 덧그림, 2D 대체 화면은 같은 칸 색)으로 칠하고, 가리킨 칸은 그 위에 흰빛; 칠하지 않은 칸은 대상이 아니다(관리자 결정 2026-11-13 — 오퍼레이터·보급센터 대상은 공식 화면대로 가리킨 것만). 칸 목록은 서버 판정 `_bandSkillTile`(지상 통행, 켜진 장애 장치 없음 — 기물이 있어도 됨; `PASSABLE_AND_BUILDABLE`은 배치 가능·빈칸·보물 상자 없음)을 브라우저가 같은 입력으로 따라 한 것(`gameLogic/placement.js bandSkillTiles`, 시험이 모든 맵·두 필터·보스 필드 양쪽에서 서버와 같은지 본다). 대상 위에서 놓으면 `g.bandSkill`, 다른 곳에서 놓거나 Esc면 취소. 못 쓰는 지령(쿨·다 씀·자금 부족·잠김·준비 완료 뒤·전투 중)은 테두리가 흐리거나(잠김은 회색) 누르면 설명이 열린다. 비용이 자금보다 크면 비용 숫자가 빨강, 남은 횟수 0은 빨강.
- 폰: 대상은 손가락 바로 밑(띄움 없음, 이름표 없음 — 관리자 결정 2026-11-12). 초상의 `touch-action: none`이 css/devices.css의 `[role="button"] { touch-action: manipulation }`에 지면 첫 이동에서 브라우저가 터치를 가져가 `pointercancel`이 난다(선택자를 한 단계 높임).
- 효과 아이콘 열은 공식에 없는 우리 기능이라 폰에서는 「EFFECTS n」 단추로 접혔다가, 같은 날 두 시즌 모두 공식 규정 HUD의 강화 효과 단추로 바뀌었다(아래 「규정 HUD 새 요소」).
- [ASSUMED·화면] 안내 문구 셋 — 보급센터 오퍼레이터·보급센터 장비·지형 칸(표의 `targetTip` 키만 있고 글은 클라 문자열): 「请指向调度中心的干员」·「请指向调度中心的装备」·「请指向战场的可用地块」로 우리가 씀. 지형 칸 지령에서 공식이 어느 칸을 쓸 수 있게 보이는지도 공식 화면 전 — 지금은 위의 「쓸 수 있는 칸 전부」(관리자 결정 2026-11-13, 공식 화면이 다르면 그쪽으로).
- **패시브 전략·진행·맹약 방향**(관리자 결정 2026-11-12): 공식 초상에는 패시브 테두리 `variant_passive`가 있어, 액티브 지령이 없는 규정 전략도 같은 초상을 띄운다(어두운 청록 테두리, 끌기·사용 없음, 누르면 설명만). 서버는 그때도 `m.private.bandSkill`을 보낸다(`_bandPassiveView`: `usable` false, `blocked` `'passive'`; 단계 표가 없는 기본 시즌은 null). 표의 `showTag`가 `value_target`인 단계는 진행 `tag {value, target}`(`server/sim/content/bands/progress.js` — 각 전략 처리기의 카운터를 읽기만 함): 나란투야 얻은 【사르곤】 수/3, 락락 산 【빅토리아】 수/3, 무에나 이번 라운드 자금/3, 피구리노 이번 라운드 수동 갱신/1, 키아베 갱신/4, 그리고 문구에 「{@tag}」 자리가 없는 시우루스·샤마르·리프레사는 이번 라운드 「라운드마다 첫 ○○」 횟수/1. 다음 단계가 있는 단계는 해제 진행 `unlock`(라운드·보급센터 레벨·사용한 자금·맹약 인원). 보이는 곳: 진행은 **초상 알약과 문구 둘 다** — 알약에 「값/목표」(잠긴 단계는 자물쇠 뒤에, 액티브 단계는 남은 횟수 그대로), 문구의 「{@tag}」·「{@unlock}」 자리에 「(값/목표)」 강조. 단계가 오르는 패시브(와파린 집중 케어 1·2·3단계)의 단계는 **문구에만**(알약 없음). [ASSUMED·화면] 공식이 이 값을 어디에 어떤 꼴로 띄우는지는 표에 없다(값/목표를 알약·문구 자리에 — 관리자 결정 2026-11-12).
- 맹약 방향을 바꾸는 전략(`auto_chess_effect_replace` — 나란투야·쉐라·피구리노·플레임테일·왕, 전투가 그 방향을 돌리는 것만: `_bandBondSwaps`, 서버 `bondSwaps {bondId: effectId}`)을 든 플레이어의 맹약 창은 그 방향 효과(`effects.json`의 이름·문구, `bondStrip.js swappedBond`)를 보이고, 문구 위에 「⇄ 전략 「…」: 이 맹약은 다른 방향 효과로 적용」 한 줄(관리자 결정 2026-11-12). 관전 중인 팀원의 창은 그 팀원의 전략을 모르므로 바꾸지 않는다.
- **지령 변경**(更换指令 — 전략 '추종자들' 「의뢰가 잔뜩!」·투기 주사위, 서버 규칙은 [sim.md](sim.md) 「규정 전략」 「지령 바꾸기」; 관리자 결정 2026-11-12, 시안 A): 개인 선택 `m.private.personalChoice`의 `kind` `'bandSkill'`은 교편 창이 아니라 자기 화면이다(`gameLogic/draft.js normalizePersonalChoice` → `family` `'command'`, `ui/choiceOverlay.js`). 공식 클라에서 확인: CN에 이 선택만의 창은 없고 공용 선택 창 `autochess_battle_effect_choose_panel`과 공용 카드 `card_small_item`(위 가운데 비용 칸 `group_cost`, 아이콘 칸 86, 이름, 설명)뿐이다. 우리: 제목 「更换指令 | 请选择一项指令」, 아래 줄에 연 것(투기 주사위 = 장비 이름, 의뢰가 잔뜩! = 자기 전략 이름)과 「被动效果保留」, 카드 위에 **바뀔 지금 지령**(받은 지령 — 패시브 지령도, 관리자 결정 2026-11-15 —, 없으면 자기 전략의 액티브 단계; 자기 전략이 패시브이고 받은 지령이 없으면 「当前没有指令」 — 관리자 결정 2026-11-12 「넣기」). 패시브 지령 카드는 비용 칸이 없다(서버 `cost` null). 카드는 공식 카드 그대로 아이콘 칸에 전략 초상(청록 테두리), 이름 = 지령 이름, 그 아래 「전략 이름 · n/m阶段」(단계가 둘 이상일 때), 위 가운데 비용 칸에 지령 비용(금색 알약 — `cost_bg_1` 그림은 안 뽑아 CSS), 설명은 단계 문구에서 맨 앞 「【이름】」 줄을 뺀 것. 고르기·자동 선택·준비 막기는 교편과 같다. 고른 뒤 HUD 초상·이름·설명은 받은 전략의 것(`m.private.bandSkill.commandBandId`). [ASSUMED·화면] 공식 화면에서 이 선택 카드에 무엇이 들어가는지는 못 봄(위 배치는 공용 카드 칸에 맞춘 우리 읽기).
- 아직 아님: 공식 그림(테두리·막대·화살표 스프라이트를 그대로 쓰는 것 — 관리자 결정 2026-11-11 후순위), 단계가 오를 때·쓸 때의 연출(`unlock_anim`·`activate_anim`), 다음 전투 표식 이펙트(`m.private.bandSkill.marks`).
- 시험: `test/ui/band-skill.test.js`, `test/ui/band-command-choice.test.js`(지령 변경 화면·HUD), `test/content/band_progress_act3.test.js`(진행 값은 실제 구매·갱신·판매로 — 카운터 이름이 바뀌면 실패).

## 규정 HUD 새 요소 — 강화 효과 단추·완벽 연승·보스 피해 순위·맹약 단계 (2026-11-12, 공식 CN 화면, 관리자 결정)

CN 11-01부터 들어온 전투 HUD 요소 넷(EN 10-14 클라에는 없음). 공식 클라에서 확인: CN 전투 HUD 번들의 `autochess_hud_panel`·`autochess_hud_buff_dialog`·`autochess_hud_buff_item`·`autochess_hud_bond_item`·`boss_damage_stats_panel`·`boss_damage_stats_item`, 기본 테마(`ac_n_initial`)의 `panel_win_streak`·`panel_boss_damage`, 활동 표 `autoChessData.constData`·`bossDamageStatsStyleList`·`skinEffectPreviewDict`.

- **강화 효과 단추·목록 창**(`ui/effectsList.js BuffButton`, 관리자 결정 2026-11-12: **두 시즌 모두** — 오른쪽 효과 아이콘 열을 없앰): 🔍(시뮬레이션 정보) 바로 왼쪽(`btn_check_buff`, 🔍 중심에서 90 왼쪽, 같은 90×55 칸), 테마 그림 `buff_btn_clickable` 59×37(6 위) + 효과 수(19, #03FBB9), 펼치면 `buff_btn_opened` + 수 #02140F. 누르면 아래에 목록 창(417 폭, 최대 410 높이, 넘치면 스크롤, 바탕 `bg_player_info`) — 줄마다 아이콘 바탕(76×75) + 아이콘 · 이름(20) · 설명(16, 흰 60%). 종류·남은 횟수(현상금의 「남은 작전 N」)는 이름 옆 작은 글씨로 우리가 더함. 목록은 `m.private.effects`(관전 중에는 그 팀원의 것). 맹약 하반기는 공식 HUD에 이 단추가 없어 규정 기본 테마 그림을 빌려 쓴다(`buffBtnSprite`: 시즌 테마 그림 → 규정 `season/act3autochess/skin`, 관리자 결정 2026-11-19); 로컬 추출물이 없는 서버는 같은 자리에 우리 모양 단추. [ASSUMED·화면] 효과가 없으면 단추를 숨김(13라운드 공식 화면에 단추가 없음 — 비었을 때만인지는 못 봄). [ASSUMED·CN] 어떤 효과가 목록에 드는지는 CN 코드라, 우리 효과 목록 그대로.
  - 설명 글의 언어: 서버는 기록의 중국어 글을 그대로 보내고, 화면(`effectsList.js effectDesc`)이 그 기록의 현지어 글로 바꾼다. 기록은 항목의 `effectId`(효과 `data.effectId`, `player/views.js effectsView`)·`id`·`iconId` 차례로 찾는다 — 결정(机变) 카드 항목은 `id`가 `<카드>#<번호>`, 아이콘이 카드 종류 그림(`icon_team_buff`·`icon_player_buff`…)이라 둘 다 기록이 아니어서, `effectId` 전에는 팀 버프 「치유」(`allybuff_select_11`) 같은 카드 글이 한국어에서도 중국어로 보였다(관리자 제보 2026-11-16). 관전 중인 전투의 목록(`battle/observe.js spectateEffects`)도 같은 `data.effectId`로 이름·글·아이콘을 찾는다. 재발 방지: `test/i18n-server.test.js` 「every 机变 card's effect entry」(모든 카드를 실제 대전에서 고른 뒤 한국어 목록에 한자가 없는지).
- **완벽 연승 배지**(`ui/avatarBadges.js`, 규정만): 표 `playerAvatarWinStreakThresholds` [3, 5] — 3·4는 노란 삼각(`win_streak_1_base`, 수 검정), 5 이상은 별(`win_streak_2_base`, 수 #F68A25), 왼쪽 팀 목록 초상의 오른쪽 위. 세는 것은 테마 효과 목록 이름 「完美连胜」대로 **완벽 작전(누수 없음)이 이어진 라운드 수**(공식 화면 두 장의 4 삼각·5 별과 맞음; 관리자 2026-11-11 「배지는 연승」). 서버 `PlayerState.winStreak`(정산 `settle.js`에서 자기 전투가 완벽이면 +1, 센 누수가 있으면 0) → `m.public players[].winStreak`(1 이상일 때만, 표에 문턱이 있는 시즌만). 보스전(최후 공세·숨은 핵)은 연승을 더하지도 끊지도 않는다 — 정산 `settle.js`를 타지 않음(공식 규정 녹화 BV13LWM6BEvY와 같음, upstream `98c54d37`이 같은 녹화로 확인).
- **보스 피해**(규정만): 보스 라운드 동안 각 초상이 그 플레이어의 리더 피해 몫으로 빛남 — 표 `playerAvatarBossDamageThresholds` [0.2, 0.5, 0.8](방송 「…超过20%/50%/80%!」와 같은 몫, `SharedBossPool.byPlayer`) 1·2·3단계: `scan_light` #FFC500 / #FFAE51 / #FF9A5E에 `damage_fx_middle_light`, 3단계는 `damage_fx_frame_cross` 틀과 위아래 `damage_fx_dec`. 내 초상 옆에 「✗ n%」. 오른쪽 가운데 순위 창(`boss_damage_stats_panel`): **경기 전체에서 리더에게 피해를 가장 많이 준 오퍼레이터 3**을 줄마다 — 그 플레이어 이름(#5AF2C2) · 그 오퍼레이터의 ✗ n% · 초상과 등급. 나도 들고, 한 플레이어가 두 줄을 가질 수 있다(관리자 결정 2026-11-15: 공식 규정 녹화 BV13LWM6BEvY 1판 46:05의 세 줄 「明久 22% / Lyncis 6% / 明久 4%」 — 그 전의 「나 밖 플레이어별 줄 + 그 플레이어의 1위 기물」을 바꿈; upstream `a7c0dcea`·`f772ae6b`와 같은 결론, 화면은 우리 창 그대로 = 사용자가 고른 시안 A). n%는 그 오퍼레이터 피해 ÷ 리더 풀 최대 HP(녹화의 줄이 전투 중 늘기만 하고 셋의 합이 100에 한참 못 미침), 정수 내림, 줄에 든 오퍼레이터는 1 % 이상 [추정·화면: 공식의 반올림 방식]. 위 「숨김/표시」 단추, 보스전 시작 `bossDamageStatsShowDelayTime` 5초 뒤에 뜸. 서버 `m.public players[].bossPct`(몫, 정수 % 내림 — 20 %에 닿을 때 빛이 켜짐)와 `m.public.leaderTop`(`[{pid, chess, pct}]` 최대 3, `views.js _leaderTopView`). 오퍼레이터별 피해는 전투가 셈(`spec.js bossTopUnits`: 플레이어마다 전체 리더 피해 `s`와 상위 3 기물 `r`, 소환물 피해는 보드 기물에, 결산 차트와 같은 방식) — 브라우저 전투는 보고 `b.progress`의 `top`(바뀔 때만 보냄, 4 Hz 보고에 덧붙임), 서버 전투는 그 전투에서 바로. 서버는 한 플레이어의 줄들을 풀이 그 플레이어에게 인정한 피해(`SharedBossPool.byPlayer`)를 넘지 않게 줄인다(보고는 피해를 나눌 뿐 더하지 못함). 같은 값이면 앞 좌석, 그다음 그 플레이어 안의 순서. 살아 있는 플레이어만. [ASSUMED·CN] 표 `bossDamageStatsStyleList`(30 / 60 / 100 → `bg_1~3`)를 순위 줄의 꾸밈 단계로 씀(어느 노드가 켜지는지는 CN 코드).
- **맹약 단계 Ⅰ·Ⅱ·Ⅲ**(`bondStrip.js bondPhaseOf`, 시즌 스위치 `bondPhase` — 규정만, 관리자 결정 2026-11-12): 켜진 맹약 원판 위(`img_level` 24×24, 그림 `bondphaseicon/bond_level_N`)에 **도달한 문턱 수**, 맹약 창의 인원 알약 뒤에 「단계 Ⅱ」(`bond_phase/phase_text`). 문턱이 둘 이상인 맹약만 — **문턱 하나인 맹약은 표시 없음**(관리자가 공식 화면에서 확인 2026-11-12: 독행). 공식 화면: 우르수스 [3, 6] 6·8명 Ⅱ, 궁극기 [2, 5] Ⅱ·Ⅰ, 아케인 [2, 3] Ⅰ, 견수 Ⅰ, 꺼진 맹약은 없음. [ASSUMED·화면] 문턱 순번으로 읽은 것은 위 화면들과 맞는 읽기(단계 숫자의 정의를 표가 주지 않음).
- 테마 그림은 시즌 그림(`seasonSkin/*`, `bondPhaseIcon/*`)에서 찾고, 없으면 CSS 모양(삼각·별·빛 테두리·글자 Ⅱ).
- 네트워크: `bossPct`는 `m.public` 행 델타로, `leaderTop`은 맨 위 필드로(보스 라운드 ~1 Hz, 바뀐 필드만), `top`은 바뀔 때만 — 플레이어마다 수 몇 개. 따로 줄일 것 없음(관리자 요청으로 검토 2026-11-12). 이 판 전의 페이지가 보내는 `top`(chess id 하나)은 받되 버린다(그 `b.progress`가 거절되지 않게).
- 시험: `test/match/avatar-badges.test.js`(표 상수, 실제 경기 경로로 연승 세기·초기화, 보스 몫 내림·리더 순위 3줄(인정 피해로 줄이기·1 % 아래·살아 있는 플레이어·맹약 하반기 없음), 소환물 귀속·상위 3 기물, `b.progress top` 검사, 화면 단계·맹약 단계).

## 규정 모드 — 규정 등급 1~20·고속 시뮬레이션, 해금 없음, 8인, 커스텀 (2026-11-12, 관리자 결정 2026-11-08·2026-11-11·2026-11-15·2026-11-16)

- **모드**(관리자 결정 2026-11-08): 규정의 다인 모드는 지난 시즌처럼 난이도 넷(`mode_multi_funny`~`abyss`, 혼자·팀). 1인은 공식 규정의 단계식 모드 — 규정 등급 1~20(`mode_single_1`~`20`; 표의 `modeDifficulty`로 1~4 표준·5~8 험지·9~14 극한·15~20 초월)과 고속 시뮬레이션(极速模拟 `mode_single_funny`, 9라운드). 훈련 모드(入门协议)·시즌 상점·주기 보상·칭호는 넣지 않는다. 지금 시즌(맹약)은 난이도 넷 그대로.
- 서버: 시즌 스위치 `soloGrades`(`shared/seasons.js`)가 켜진 시즌의 1인 방은 `grade`(0 = 고속, 1~20)를 갖는다(`room.create`·`room.setDifficulty { grade }`, `room.state`·인계 스냅숏에 실림; 없으면 고른 난이도의 첫 등급). 방의 난이도는 등급의 것, 경기는 `modeIdFor(mode, difficulty, grade)` → `mode_single_<grade>`. 다른 방에 `grade`가 오면 BAD_MSG. 경기의 난이도 규칙(밴·보스 체력·히든 코어)은 모드 기록(`gd.difficulty` = 모드의 `difficulty`)을 따른다 — 고속은 표에서 FAST라 밴 표에 자기 칸(핵심 0·부가 2, 공식 녹화 BV1MyWn6TEBq — `docs/rules/sim.md` 「판마다 결석 맹약 수」)을 둔다; 모드의 `inactiveBondIds` 8개도 적용된다.
- **해금 없음**(관리자 결정 2026-11-08): 모든 등급·난이도를 처음부터 연다. 모드 설명의 해금 문구(「解锁时可开放至【…】」)는 데이터를 만들 때 뺀다(`tools/build-data.mjs modeDescNoUnlock`; 그 문구뿐인 설명은 null). `unlockText`는 화면에 쓰지 않는다.
- **전략 목록**: 규정 전략의 모드별 제외(`bands.json inactiveModeIds`)를 화면 목록도 본다(`bandDraft.js allowedBands`, 서버 `GameData.bandAllowed`와 같게).
- **8인**(관리자 요청 2026-11-16; 2026-11-11부터는 「나중에」로 시즌 스위치 `noLargeRoom`이 막고 있었다 — 그 스위치는 없앴다): 규정의 연합 시뮬레이션·연합 매칭도 맹약처럼 4인·8인을 고른다(`room.create`·`room.setSize`·`room.queue`의 `size` 8). 8인 수치는 시즌 설정의 `eightPlayer`(맹약과 같은 값, `tools/build-data.mjs`가 두 시즌에 같이 넣음)이고 규칙은 `docs/rules/sim.md` 「8인 협동 모드」. 맹약 밴은 8인도 그 시즌의 4인 표(규정 핵심 5·보조 5).
- **커스텀**(관리자 요청 2026-11-15; 2026-11-11까지는 8인과 같이 막혀 스위치 이름이 `noCustomOrLarge`였다): 규정에서도 커스텀 규칙을 고른다 — 단독(규정 등급)·연합 시뮬레이션의 규칙 줄에 클래식·캐주얼·커스텀 ⚙, 연합 매칭은 다른 시즌처럼 커스텀 잠김. 설정 창의 목록은 시즌 데이터를 따른다: 맹약은 규정 핵심 10·보조 11, 특훈 적 유형 8(치명·소생 포함), 리더 적·전장은 규정 표. 규정 등급 방은 그 등급의 모드(`mode_single_<n>`)·난이도와 비교한다(`openCustomRules`·`CustomSummary`의 `grade`). 무작위 금지 수는 그 시즌 공식 범위(`shared/ruleset.js customBanLimits`: 규정 0–5·0–5, 맹약 0–3·0–4 — 판도 `GameData.bans`에서 같은 범위로 자른다). 「상반기 전장 포함」은 맹약 상반기 전장(전장 #06)을 더하는 설정이라 그 전장이 시즌 데이터에 없는 규정에서는 칸과 상·하반기 꼬리표가 없다. 「전장 정보 미리 보기」는 규정 공식 브리핑이 늘 전장을 보이므로(`seasonOfficialOptions`) 켜진 채 잠긴다. 화면: 2026-11-15 Windows Chrome 1600×900 — 규정 단독의 커스텀 스위치·설정 창 여섯 탭·적 유형 탭·전장 탭·금지 수 5 [휴대폰 화면 미확인].
- 한국어 임시 이름(관리자 결정 2026-11-12, KR 서버 출시 때 교체): 「规程等级N」 = 「규정 등급 N」, 「极速模拟」 = 「고속 시뮬레이션」.
- **화면**(관리자 결정 2026-11-12, 시안 B — 실제 화면에 띄운 두 시안 중): 규정의 단독 시뮬레이션은 「시뮬레이션 선택」의 난이도 카드 넷 대신 한 줄짜리 목록 21줄(고속 시뮬레이션 + 규정 등급 1~20, `screens/lobby.js GradeRow`). 줄마다 난이도 문양·이름과 난이도(고속은 설명)·코드·라운드(+ 히든 코어), 왼쪽 띠는 모드 기록의 색, 고른 줄이 그 색으로 밀려 나오고 ✓; 목록은 늘 스크롤되고 열 때 고른 줄이 가운데로. 왼쪽 요약·그림은 고른 등급의 것. 고른 등급은 `lobby.grade`로 기억. 휴대폰(높이 520 이하)은 코드 열을 뺀다. 대기실: 단독 방 요약·모드 막대에 등급 이름과 코드, 방장이 모드 막대로 여는 같은 화면에서 등급을 바꾼다(`room.setDifficulty { grade }`). 경기 화면(브리핑 머리·HUD·결산)의 난이도 꼬리표는 경기의 `modeId`로 등급 이름을 쓴다(`DifficultyTag modeId`, `shared/seasons.js modeGrade`).
- 「시뮬레이션 선택」의 인원 줄은 두 시즌 모두 있다(연합 시뮬레이션·연합 매칭; 기억된 인원 `lobby.size`도 두 시즌이 같이 쓴다). 8인 방·본판 화면은 「8인 협동 모드 화면」 그대로.
- [추정·화면] 줄의 모양·간격·색 띠 — 공식 규정 등급 목록(`auto_chess_mode_choice_view` + `autochess_difficulty_item`)은 아직 그리지 않았다. 그 프리팹 그림·규정 모드 아이콘은 후순위(관리자 결정 2026-11-11).
- 시험: `test/season-grades.test.js`(모드 ID, 프로토콜, 실제 경기 경로의 등급 모드, 로비의 등급·8인 받기·커스텀 받기·인계, 전략 목록, 설명 문구), `test/ui/season-grades-ui.test.js`(등급 목록·모드 기록 읽기·경기 화면 꼬리표), `test/match/custom-enemy-types.test.js`(규정 등급 12 커스텀 판의 실제 경로: 고정 적 유형·금지 수 5, 맹약은 3·4로 자름).

## 1인 규정 브리핑 두 단 (2026-11-18, 관리자 결정 — 시안 2판)

1인 규정(`m.public.bondGroups`가 있는 판 — 서버 규칙은 `sim.md` 「1인 규정 핵심 맹약 두 묶음」)의 판 시작 1/3 「시뮬레이션 정보 확인」은 공식 정보 화면
(`ui/autochess/[uc]autochessouter.ab` `auto_chess_stage_info_state` → `prefab_auto_chess_stage_info_view`)의 두 단으로 그린다(`screens/briefing.js GroupsMain`,
`css/screens/briefing.css` `.brief2`·`.bgrp`). 기준은 공식 CN 화면 셋(규정 등급 5·20·4, 2026-11-18)과 프리팹 값. 맹약 하반기·협동 규정 등 두 묶음이 없는 판은 예전 배치
그대로(위 「본판 정보의 맹약·결장 오퍼레이터를 공식 정보 화면 모양으로」).

- **크기**: 공식 캡처에서 이 화면은 1280 × 720 캔버스의 0.9배로 그려진다(프리팹 단위 = 화면 높이 / 800 — 묶음 판 428.7 → 386 px 등). 왼쪽 880(+ 스크롤 자리 14) ·
  사이 12 · 오른쪽 350(`panel_enemy_info`). 그 배율이면 16:9 화면 좌우 여백이 넓어, 우리 `--u`는 화면 폭 − 좌우 .2rem을 1256단위에 맞추고 화면 높이 / 730에서 멈춘다
  (관리자 결정 2026-11-18 — 공식 배치 비율은 그대로, 크기만 약 1.1배). 휴대폰도 두 단 그대로, 오른쪽 열을 좁히지 않는다(관리자 결정 2026-11-18) — 우리 `html` 글자 크기 하한 때문에 공식 비율보다 큼.
  안내 문구는 한 줄에 맞게 글자를 줄인다(공식 bestFit; 칸이 글 폭만큼 늘지 않게 `min-width: 0`).
- **왼쪽(스크롤)**: 핵심 맹약 제목(`img_group_title` 9칸 + 빛살 아이콘) → 안내 문구(`text_tips`, 한 줄 bestFit — 줄어들다 9 px에서 줄바꿈) → 두 묶음
  (`auto_chess_single_mode_bond_group`: 판 428.7 × 264.64 둘, 바탕 `img_single_choose_bg`; 묶음 목록의 1·3·5번째가 위 줄, 2·4번째가 아래 줄 — `item_container_1…5`;
  고른 판은 `Image_select_text`(「ALLIANCE ACTIVATED」 + 체크, 맹약 칸보다 **뒤** 층) · 아래에서 올라오는 `img_blur_bond` · 아래 막대 `img_bond_group_select` · 왼쪽 위 빗금
  `img_select_decorate`(#01f5bc 20 %), 안 고른 판은 바탕만에 회색 맹약 + 금지 표시) → 부가 맹약 제목(날개 아이콘 + D에 든 부가 맹약이 있으면 칩
  「部分盟约所含干员阵容不完整」, `img_bond_title_tip_bkg`) → 부가 맹약 한 줄 10칸(피치 86, 줄 간격 141) → 금지 오퍼레이터(예전 맹약별 묶음 그대로). 맹약 이름은 켜짐·꺼짐 모두
  #828282(공식 실측). 그림은 CN 클라 추출물 `season/act3autochess/stageinfo`(`tools/local-extract/season_ui.py`의 `prefabs` 한 줄), 없으면 단색.
- **누르기**(관리자 결정 2026-11-18): 묶음 판을 누르면 그 묶음을 고른다(`g.bondGroup`, 준비 완료 전까지 몇 번이든, 서버 답을 기다려 바뀜); 판 안 맹약 아이콘을
  눌러도 그 판을 고르는 것이고, 맹약 상세 창은 열리지 않는다(브리핑의 핵심·부가, 아래 「다른 곳」의 읽기 전용 칸 모두, 관리자 결정 2026-11-18 — 시안 2판의 「아이콘은 상세」를 바꿈; 이름은 툴팁). 처음은 왼쪽 묶음 [추정·화면: 관리자 기억 — 누르는 장면·첫 화면 녹화 없음]. 공식 화면에 「激活第N组」
  단추는 없다.
- **오른쪽**: 전장 미리보기(`map_preview` 330 × 187 + `bg_map` 틀 + 돋보기 `img_check` — 누르면 큰 그림 창), 리더(`enemy_leader`: `img_enemy_frame` 안 초상,
  「敌方领袖」 꼬리표 `bg_enemy_title` #f4a710, 이름), 특훈 적 줄(`enemy_type`: `bg_enemy_type`, 아이콘, 이름). 전장 이름·「전장 무작위 (총 N개)」 꼬리표는 없다(공식처럼, 관리자 결정
  2026-11-18). 리더 줄·특훈 적 줄을 누르면 그 아래에 우리 설명(리더: 「N라운드 · 최종 공세」와 능력, 특훈 적: 설명 글)이 열린다(관리자 결정 2026-11-18 — 공식은 누르면 무엇이
  나오는지 모름 [추정·화면]).
- **다른 곳**: 전략 선택·선발 편성 확정 3/3의 「시뮬레이션 정보」 창(`matchInfo.js MatchInfo`)은 핵심 줄 대신 같은 두 묶음 칸을 읽기 전용으로(고른 판 표시, 상세·
  고르기 없음), 부가 맹약 제목에 칩, 회색 범례 줄 없음. 판 안 서랍 「시뮬레이션 정보」 탭(`enemyDrawer.js InfoTab`)은 그 창과 같은 `MatchInfo`라 같은 칸이 읽기 전용으로 나온다(누르기 없음 — 판 중
  맹약 상세는 맹약 줄에 있음). 모두 관리자 결정 2026-11-18, 1인 규정에서만.
  휴대폰 서랍(740 터치: 서랍 296 px, 칸 걸음 31 px)에서는 9 px 하한의 맹약 이름(4–5글자 36–41 px)이 서로 붙어(「우르수스빅토리아」), 이름이 칸 걸음보다 넓으면
  (`BondGroupsView`가 재서 `.is-narrow`) 묶음마다 다섯 맹약을 목록 순서로 한 줄, 두 묶음을 위아래로 그린다 — 걸음 54 px, 고른 판은 민트 테두리 + 아래 막대,
  ALLIANCE ACTIVATED·흐림·빗금은 뺀다(관리자 결정 2026-11-18, 시안 B: 다른 안은 서랍 넓히기·이름 줄임표). 전략 선택 창(걸음 64 px)과 데스크톱 서랍은 두 줄 그대로.
  재발 방지: `test/ui/match-info.test.js` 「the drawer on a phone」.
- **한국어**: 안내 문구 「이번 시뮬레이션에서 활성화할 맹약 묶음을 하나 선택하세요. 선택하지 않은 맹약은 이번 시뮬레이션에 등장하지 않습니다」, 칩 「일부 맹약의 오퍼레이터 편성이
  불완전함」 — KR 서버에 없는 CN 전용 문구의 손 번역(관리자 결정 2026-11-18) [추정·자료 없음: KR 클라 문구가 나오면 바꿈]. 영어도 우리 번역.
- 공식과 아직 다른 점(이 절 밖): 위 띠(ui-T)·아래 준비 줄·두 열 사이 스크롤 막대·안내 문구 색(프리팹 #1f7663, 캡처가 더 밝아 #4a8a78)·부가 맹약 줄마다 바탕·금지
  오퍼레이터 칸 모양(공식은 「本局禁用干员」 한 칸 — 끝까지 본 공식 화면 없음).
- 시험: `test/ui/match-info.test.js`(실제 경기 경로의 규정 등급 5·4 판 — 모델의 두 묶음과 고르기 뒤, `MatchInfo`의 읽기 전용 칸·칩·범례 없음, 묶음 칸 배치·누르기, 제목 아이콘).
  화면 [화면 미확인].

## 규정 전투 HUD 모드 표시 (2026-11-18, 관리자 결정)

- 공식: CN 클라 전투 화면 `auto_chess_battle_ui_page`의 `panel_info/panel_mode`(왼쪽 위에서 116.2 / −20, 76×24 — 맹약 하반기 EN 클라에서 핑이 있던 자리)에
  `mode_info_panel`, 핑 `panel_ping`은 그 아래(109.7 / −56). EN 클라에는 이 프리팹이 없다. 공식 CN 화면(2026-11-18, 험지 시뮬레이션): 나가기 버튼 오른쪽에
  모드 문양 + 「险境模拟」, 그 아래 「100ms」 — **모드 표시와 핑을 합친 높이가 나가기 버튼 높이와 같고**, 모드 이름은 문양과 같은 색이며, 핑에 「PING」 같은
  말이 없다.
- 프리팹: `img_mode_title` 175×68(scale 0.8, 상자 가운데) + `text_mode_name`(16, best fit 1–16, 폭 86, 가운데에서 오른쪽 25). 그림 `modeinfotitle`
  `img_title_mode_<training|funny|normal|hard|abyss|fast>` 여섯 장 = 표 `modeDataDict[].modeDifficulty` 여섯 값(우리 `config.modes[].difficulty`).
- 우리(`ui/battleArt.js ModePanel`·`modePanelArt`, `ui/hud.js`): 시즌 추출에 그 모드의 그림이 있으면(규정) 작은 난이도 글자(`DifficultyTag`) 대신 이 표시를
  맨 위에, 핑을 아래에 두고 둘을 나가기 버튼 높이에 맞춘다(프리팹 24 + 12 + 24 = 60 단위를 버튼 높이로 — 문양 위가 버튼 위, 핑 아래가 버튼 아래; 터치 화면은
  커진 버튼 높이). 이름은 우리 화면의 모드 이름(규정 등급 n·고속 시뮬레이션·협동 난이도 이름), 색은 표 `modeColor`(`config.modes[].color`). 문양이 상자 왼쪽
  8.8 단위 밖으로 나와 우리 빨간 나가기 버튼에 닿지 않게 상자를 9 단위 안으로. 좁은 휴대폰(740)에서는 글자가 위 가운데 막대 4 px 앞에서 멈추고 줄어든다
  (best fit). 맹약 하반기도 같은 배치(관리자 결정 2026-11-18): EN 클라에는 이 패널이 없어 맹약 자기 난이도 아이콘(`modeIcon/mode_<난이도>_icon`, 최대
  35×35 — 난이도 글자가 쓰던 것)을 규정 그림의 문양 자리(높이 24, 상자 왼쪽에서 3.6 단위가 가운데)에 그리고, 그림의 빛 대신 모드 색 빛을 두른다. 이름은 그
  난이도 이름, 색은 맹약 표 `modeColor`. 아이콘이 없으면 예전 난이도 글자.
- [추정·미조사] 그림을 `modeDifficulty`로, 이름 색을 `modeColor`로 고르는 것: 패널을 채우는 클래스는 읽지 않았다(이름이 맞고, 공식 화면 한 장의 험지 색이 맞음).
- 재발 방지: `test/ui/official-ui-gaps.test.js` 「规程 mode badge over the ping」(모든 규정 모드의 `modeDifficulty`에 그림이, 모든 맹약 모드에 `modeIcon`이 있는지 — 추출물이 없으면 건너뜀,
  HUD 배치·핑 글자·높이 규칙). 시안·공식 화면·구현 캡처는 관리자 기록. 화면 [화면 미확인: 실제 판].

## 규정 특질 문구의 숫자 `{showtag_value_1}` (2026-11-13)

- 규정 표의 특질 8종(일반·정예 16개)과 장비 정기 예금 통장(`chess_item_3_15_e_a`, 효과 `eff_acarm129`·`eff_acgarm129`)은 문구에 숫자 자리 `{showtag_value_1}`를 둔다(표의 `showTag` 'single'). 아스트젠 더 라이트체이서(`garrison_121`) 「이번 라운드에서 자금을 3 소모할 때마다(소모: 자금 N)」, 타락사쿰·클로저·시(`garrison_36`·`125`·`128`) 「획득: N명」, 안젤리나(`garrison_91`·`236`) 「갱신: N회」, 오로라(`garrison_50`) 「+N」, 불피스폴리아(`garrison_74`) 「N회 무료 갱신」, 정기 예금 통장 「자금 N 획득」. 전에는 이 자리를 채우는 곳이 없어 변수 이름이 그대로 보였다.
- **공식 표에서 확인**: 같은 기물의 카드 문구(`charChessDataDict` `desc`)에는 셈 괄호가 없고, 자라는 특질은 첫 값(오로라 +1, 불피스폴리아 1회)이 적혀 있다. 그래서 숫자를 모르는 곳은 그 모양을 따른다.
- 구현(`shared/showTag.js`): 서버가 플레이어의 숫자를 보낸다 — `m.private.showTags {garrisonId: n}`(이번 라운드 `ps.round`의 소모 자금·갱신·획득 수, 자라는 특질은 다음 발동이 줄 값: sim의 `growingValue`와 같은 식), 장비 조각 보기의 `showTag`(정기 예금 통장이 지금 주는 자금: `items/meta.js`가 주는 값과 같은 식). 화면은 자기 기물·자기 상점 카드의 특질(`detailPanel.js garrisonText`, `resolveDetail`이 `showTags`를 붙임)과 장비 카드(`itemText`, 보상 카드는 `choiceOverlay.js`)를 그 숫자로 채운다. 남의 기물·편성 화면처럼 숫자가 없으면 셈 괄호를 빼고 자라는 특질은 첫 값, 정기 예금 통장은 들어온 라운드의 값(0)을 쓴다. 그래도 남은 자리는 `richText.js parseRichText`가 지워 변수 이름은 어디에도 나오지 않는다.
- 시험: `test/ui/show-tag.test.js`(실제 구매·갱신·획득 경로의 숫자, 보이는 값 = 실제로 주는 값, 시즌의 모든 중국어·한국어 문구에 변수 이름이 남지 않음).

## 화면 켜짐 유지 (2026-11-13, 관리자 결정)
- 설정 「일반」 탭 「화면 켜짐 유지」(`保持屏幕常亮`, `screenWakeLock`): 꺼짐 / **전투 중**(기본) / 항상. 공식에 없는 편의 기능이다. upstream PR #574(`e37af906a`·`b21f11869`·`be6f35dad`·`db1998eba`)를 손으로 옮겼는데, upstream의 「전투 중 자동 + 전체 화면에서 켜짐 유지」 토글 대신 세 갈래 하나로 바꿨다(관리자가 고른 시안 B). 이유: iPhone에는 요소 전체 화면이 없어(홈 화면 앱도) upstream 토글이 iPhone에서 아무 일도 하지 않는다. 「항상」은 전체 화면과 상관없이 페이지가 보이는 동안 잡는다.
- 자리: 「화면」 탭이 아니라 「일반」 탭 — 그림이 아니라 기기 동작이라 언어·리소스 받기와 같은 부류이고, 휴대폰에서 탭을 열자마자 보인다(관리자 결정).
- 모든 기기에 같다: PC 브라우저(크롬·엣지 84+, 사파리 16.4+, 파이어폭스 126+)에서도 모니터 절전·화면 보호기를 막는다. 페이지가 숨으면 놓는다.
- 잡는 곳은 앱 하나(`main.js App` → `ui/device.js useScreenWakeLock`): 「전투 중」 = 판 화면이고 결과가 없고 `isCombatPhase`(작전·연합 방어·최후 공세·숨은 핵)인 동안, 자리든 관전이든. `installScreenWakeLock`은 upstream 그대로 — 보일 때 요청, 숨으면 놓고 다시 보이면 새로 요청, 실패하면 다음 터치·포인터에서 한 번 더, 그래도 안 되면 조용히 넘어감, 늦게 온 잠금은 바로 놓음.
- iOS(`ui/device.js isIOS`: iPhone·iPad·iPod, 터치 Mac 모습의 iPadOS)에서는 안내 끝에 「홈 화면에 추가한 앱은 iOS 18.4 이상에서 작동하며, 저전력 모드에서는 작동하지 않을 수 있습니다」. WebKit 버그 254545: 홈 화면 앱에서 Wake Lock이 요청은 받지만 화면이 꺼짐 — iOS 18.4에서 고쳐짐. 저전력 모드는 시스템이 무시한다. [화면 미확인] 실제 iPhone·Android에서 꺼지지 않는지.
- 시험: `test/ui/wake-lock.test.js`(값과 기본, 문구, 일반 탭 자리와 App 연결, 잠금의 생애, `isIOS`), `test/ui/gameLogic.test.js` 「sanitizeSettings」. Windows Chrome(2026-11-13, 1920×1080): 기본 「전투 중」은 판 밖에서 요청하지 않음, 「항상」이 요청, 「꺼짐」이 놓음, 선택이 저장됨.

## 한국어 줄바꿈 (2026-11-14, 관리자 제보)
- 한국어 팩은 `word-break: keep-all; overflow-wrap: anywhere`로 줄을 바꾼다(`public/i18n/ko/ko.css`). `anywhere`에서는 상자의 최소 폭(min-content)이
  글자 하나라, 글이 직접 들어 있는 가로 flex 줄이 1–2 px만 모자라도 항목들이 줄어들며 짧은 낱말을 글자마다 끊는다. 제보 셋: 단계 헤더(브리핑·전략 선택)
  「2 / 2 · 전략 / 선택」(`.stephead__title`), 오퍼레이터 상세 카드 스킬 탭의 「초 / 기」와 SP 숫자(`.dsp__num`), 줄일 수 없는 라벨은 반대로 단추 밖으로
  나감 — 전략 선택에서 팀원이 고른 전략의 「팀원 선택 완료」(队友已选)가 「건너뛰기」 위로. 관리자 화면에서 왜 모자랐는지(글꼴·브라우저)는 재현하지 못함:
  Windows Chrome 목업에서는 1600×900–380 px 폭 모두 헤더가 한 줄이었고, 줄을 1–2 px 좁히면 제보와 똑같이 깨졌다.
- 고침: 짧은 낱말을 담는 flex 줄에 `white-space: nowrap` — `.stephead__title`, `.dsp__num`, 같은 검사가 더 찾은 `.draft-detail__hp`(「초기 HP 45」의
  숫자)와 `.funds__collapse`(「접기」). 「팀원 선택 완료」는 ✓ 없이 작은 글씨로, 낱말 사이에서만 줄을 바꾼다(`.draft-pick--taken`). 목업
  (`public/dev/game-mock.html`)도 `index.html`처럼 `ko.css`를 불러 `?lang=ko`가 한국어 화면 그대로 보인다.
- 함정: 글이 직접 들어 있는 가로 flex 줄(단추·꼬리표·숫자 칸)에 짧은 낱말을 넣을 때는 `white-space: nowrap`을 준다. 화면 폭에서 재현되지 않아도 줄이
  1 px 모자라면 깨진다. 긴 단추 라벨은 nowrap 대신 낱말 사이 줄바꿈을 허락한다.
- 재발 방지: `test/ui/ko-linebreak.e2e.test.js`(SP_E2E; 목업 화면 넷 × 1920·1280·960 폭 — 끊긴 짧은 낱말, 2 px 좁히면 끊기는 flex 줄, 단추 밖 라벨).

## upstream v0.4.0 규정 화면 작은 것들 (2026-11-15, 손 이식)

upstream v0.4.0 대조에서 받은 화면 수정(`docs/rules/upstream.md` 「하드 포크 뒤 손 이식한 기능」).
- **시뮬레이션 포기가 실패하면 판에 남음**(upstream PR #879 `f681850d`·`c6c30652`): `ui/matchChrome.js quitMatch`는 `g.leave`가 받아들여지면(또는 이미 방 밖
  `NOT_IN_ROOM`) 그것으로 끝 — 서버가 그 요청에서 이미 자리를 뺀다(`server/lobby.js routeGame`). `room.leave`는 돌아가는 판이 없을 때(`WRONG_PHASE`)만 보낸다.
  요청이 실패하면(`OFFLINE`·`TIMEOUT` 등) 토스트만 띄우고 화면을 그대로 둔다 — 서버가 자리를 놓았다는 근거가 없으므로 다시 누르거나 재접속하면 된다. 전에는 실패해도
  로비로 보내 자리는 판에 남은 채 화면만 떠났다. 시험: `test/ui/quit-failure.test.js`(upstream 그대로).
- **「클라이언트 버전이 서버와 다릅니다」 문구는 hello 거절에만**(upstream `c3524c1e`): `net.js NetError`는 서버 hello의 프로토콜 검사(`BAD_MSG`
  「version mismatch: server N」)일 때만 새로 고침 문구로 바꾸고, 설명에 「version」이 들어 있을 뿐인 다른 거절은 제 문구를 쓴다. 시험: `test/client-static.test.js` 「errorText / NetError」.
- **적 웨이브 미리보기에서 숨은 맹약 원판이 클릭을 가로챔**(upstream #892 `72caf0888`): 미리보기(`.gm.is-pen`)에서 흐려진 맹약 줄·효과 열은 흐려진 뒤
  `visibility: hidden`(돌아오면 바로 보임). `pointer-events: none`만으로는 Windows Chrome이 흐려진 원판을 눌러 맹약 창이 열렸다.
- 함정: 화면에서 흐리게 숨기는 층(opacity 0)은 `pointer-events: none`만 믿지 말고 흐림이 끝난 뒤 `visibility: hidden`을 함께 준다(위 #892).
- 재발 방지: `test/ui/pen-hidden-hud.e2e.test.js`(CSS 검사는 늘, 두 렌더러의 실제 클릭은 SP_E2E).
- 받지 않음: 리더 순위 글자의 「文字大小」(upstream `fe5b2228`) — 우리 포크에는 글자 크기 설정이 없다(순위 창도 우리 것 `.bdmg`).
- **전략 선택의 「범용형 전략」·「맹약형 전략」 머리**(관리자 결정 2026-11-15, 시안 A; upstream `042f47d3`·`7a52854a`, 공식 녹화 BV11NW869ELq 4부 0:28·
  BV13LWM6BEvY 1판 1:36): 규정 전략은 표 `bandType`이 GENERAL 44 / BONDRELEVANT 17이고 `sortId`가 GENERAL을 앞에 둔다. 전략 격자(`screens/bandDraft.js`
  `BAND_SECTIONS`)는 종류가 바뀌는 자리에 네 칸 너비 머리를 넣는다 — 작은 아이콘 칸(왕관 / 고리) + 대괄호 [ 이름 ]. `bandType`이 없는 시즌(맹약 하반기)은 머리 없음.
  한국어 「범용형 전략」·「맹약형 전략」은 KR 서버 말투로 손 번역(CN 전용; 「泛用」 → 「범용」).
- **임기응변 창 접기·펼치기**(관리자 결정 2026-11-15, 시안대로; upstream `7a9d225f`·`d4dd2318`, 공식 비밀 상점 BV13LWM6BEvY 9판 29:44): 카드 격자 마지막 열 바로
  오른쪽에 「접기」(`ui/choiceOverlay.js`, 격자의 넷째 열(8인은 다섯째)에 0 폭으로 넣어 카드 자리는 그대로). 누르면 창이 사라져 보드가 보이고, 화면 오른쪽 끝
  가운데(휴대폰은 36 %, 상점의 배치 인원 글자 위)에 「펼치기」 단추 — 그 임기응변의 이름, 내가 아직 고를 차례면 민트빛. 새 임기응변(다른 종류·라운드·카드)은 펼친 채로
  열린다. 교편(개인 선택)·지령 바꾸기도 같다. [추정·화면] 공식의 접힌 모양은 녹화에 없어 우리 모양.
- **S.W.E.E.P. 넷째 탭 「장비 보고서」**(관리자 결정 2026-11-15, 시안대로; upstream `377fb09c`·`2f07ea84`, 공식 보고서 BV11NW869ELq 1부 ≈ 33:20): 시즌 스위치
  `equipReport`(규정)일 때만(`screens/sweep.js reportTabs`). 오른쪽은 기본(진급 아님) 장비를 티어 1–6 절로, 절 안은 `shopSortId` 순(상점에서 빠진 것도 넣음 —
  공식 4티어 줄에 상점이 안 파는 것이 있음). 왼쪽은 아이콘(티어 칩)·이름·「기본 효과」·「랭크업 효과」(`goldenId` 기록의 글, 없으면 칸 없음)·설명글. 「进阶」은 KR 공식어
  「랭크업」. 기억된 탭이 장비인데 맹약 하반기를 보면 맹약 보고서로.
- 함정: 그리드 칸(auto 줄) 안 상자의 퍼센트 높이는 auto로 풀려, 그 안 이미지의 `height: 100%`가 듣지 않는다 — 장비 보고서의 세로로 긴 아이콘이 칸 밖으로
  나갔다(Windows Chrome에서 잼, 관리자가 시안에서 「카드 안에 안 잘리게」). 아이콘 상자는 `position: absolute; inset` + flex로 높이를 정한다.
- 재발 방지: `test/ui/sweep.test.js`(장비 보고서 탭·행·아이콘 상자), `test/ui/bandDraft.test.js`(규정 전략의 종류마다 머리 하나), `test/ui/playtest4.test.js`(접기·펼치기).

## 설정 리소스 탭 (2026-11-16, 관리자 결정 — 리소스 받기 2안 시안 그대로)

- 공식에 없는 화면(우리 리소스 받기). 스킨 데이터가 리소스 목록의 묶음이 되어(`docs/rules/render.md` 「스킨 모델 소재」 「리소스 목록의 묶음」) 설정에
  「리소스」 탭을 「일반」 바로 뒤에 둔다(`ui/settings.js SETTINGS_TABS`). 시즌은 나누지 않는다(관리자 결정 2026-11-07·2026-11-13). 음성 언어는 「사운드」 탭 그대로.
  탭은 미리 받기가 되는 곳에서만 보인다 — 보안 연결이 아니거나 서버에 목록이 없으면(`resources.js` `phase: 'off'`) 탭이 없고, 그 탭이 마지막이었으면 「일반」으로 연다.
- 머리 두 개(작은 영문 GAME·SKIN, 둘째부터 위 구분선 — `css/resources.css .res-group`), 줄마다 설명은 조작 열 밑(라벨 열 3.3rem + 간격만큼 들여 씀):
  - 「리소스 미리 받기」(`ResourceSetting`, 「일반」에서 옮김): 묶음 밖 파일만 센다 — 받을 것이 있으면 「받기 N MB」, 받는 중이면 「리소스 받는 중 N%」,
    다 받았으면 「모두 받음」과 전체 크기. 설명: 전장·오퍼레이터·이펙트·음성을 모두 받고 새 시즌도 함께 받는다는 것과 음성 언어는 「사운드」 탭.
  - 「스킨 데이터」(`SkinPackSetting`, 상태는 `skinPackState`): 꺼짐이면 켜기 스위치와 「약 N MB」(묶음 전체). 켜면 `setResourcePack('skin', true)`로
    받고, 받는 중이면 스위치 대신 「스킨 받는 중 N%」·막대·「받은 / 전체 MB」·「일시정지」 단추, 일시정지면 스위치·막대·「계속 받기」, 다 받았으면 스위치와 크기.
    끄면 `setResourcePack('skin', false)`로 받은 스킨 파일을 지운다.
  - 「일러스트 화질」(2026-11-17 관리자 결정, 시안 A, `resources.js IllustChoice`, 위 「정비 화면 HUD」의 원본 해상도판): GAME 머리 아래 「리소스 미리 받기」
    다음 줄, 음성 언어 줄과 같은 두 칸 단추 [표준 | 고화질]. 설명(문구 관리자 확정): 「고화질은 원본 크기로, 표준보다 약 {N} MB를 더 받습니다. 스킨 데이터를
    받았다면 {M} MB가 더 늘어납니다.」 — N·M은 손 숫자가 아니라 리소스 목록에서 계산한다(`illustDiff`: 묶음마다 `r: 'hi'` 크기 − `r: 'lo'` 크기, `resStore.illust`;
    목록에 스킨 묶음의 짝이 없으면 둘째 문장 없음, 짝이 하나도 없으면 줄 자체가 없음). 같은 단추가 미리 받기 동의 카드에도 있다(카드에는 스킨 데이터 줄을
    넣지 않음 — 관리자 결정 2026-11-17, 스킨은 이 탭에서만).
  - 「다른 플레이어 스킨」(설정 `otherSkins`, 기본 켬, upstream 「显示其他玩家的皮肤」과 같은 이름): 스킨 데이터를 고르기 전에는 흐리게 막아 두고 「스킨 데이터를 받으면
    쓸 수 있습니다」. 이 값을 읽어 남의 유닛을 기본 모습으로 그리는 것은 렌더 쪽 일이다(아직 없음 — 묶음 mix-D 렌더 게이트).
- 크기를 나눠 보임: 미리 받기 동의 카드의 크기(`pendingBytes`)는 고른 묶음의 파일도 센다. 탭은 `resStore.sizes`(묶음 밖 `''`과 묶음마다 `{ total, left }`,
  `left` = 목록 해시대로 캐시에 없는 것; 받는 동안 파일마다 줄임)로 둘을 나눠 보인다. 고른 적 없는 묶음도 `total`이 있어 「약 N MB」를 보인다.
- 일시정지(시안의 「일시 중지」 단추, 낱말은 게임의 「일시정지」와 같게): 이 페이지에서만(저장 안 함, 다음 방문은 다시 받음). 받는 중인 대기열에서 그 묶음 파일은
  건너뛰고 남은 것이 그것뿐이면 받기를 끝낸다. 「계속 받기」는 다시 받기를 시작하고, 받는 중이면 끝난 뒤 다시 맞춘다. 묶음을 다시 켜면 일시정지도 풀린다.
  시안에 없던 일시정지 상태에서는 스위치를 함께 보여 받는 도중에도 끌 수 있게 했다. 스킨만 받는 중에 「리소스 미리 받기」를 눌러도 끝난 뒤 이어서 받는다.
- 문구: 탭 이름 「资源」(리소스)과 줄·설명 열둘을 `en.json`·`ko/ui.json`에(ja·zh-TW는 영어로 떨어짐), 한국어는 시안 문구 그대로.
- 확인: `test/ui/settings-sections.test.js`(탭 순서·패널 소속·`resOn` 거르기·「资源」 번역), `test/resource-packs.test.js` 「the resource tab…」(크기 나눔·일시정지·
  계속 받기·동의 뒤 나머지)·「skinPackState」, `test/ui/gameLogic.test.js`(`otherSkins` 기본·정리), `test/ui/illust-res.test.js`(일러스트 화질의 크기 계산·설명 문구). 화면은 관리자가 확인(구현 뒤 전후 캡처 반복 없이).
- 재발 방지: `test/resource-packs.test.js` 「the resource tab: sizes in no pack and per pack apart…」 — 일시정지를 빼면(`held`가 늘 거짓) 실패함을 봄.

## 스킨 고르기 (2026-11-16, 관리자 결정 — 리소스 받기 2안의 시안 s4·s5 그대로)

- 공식 위수협약 모드에는 판 밖에서 스킨을 고르는 화면이 없다. upstream `ui/skinPicker.js`의 배치(상세 패널의 「스킨」 칸, 기본 타일 + 세로 초상화 타일)·크게
  보기 창·폰 얼굴 그림 전환·시험을 옮기고, 목록의 출처와 잠금·받기 상태만 우리 것이다. 고른 스킨은 표시 전용이고 시즌을 나누지 않는다(관리자 결정 2026-11-07,
  서버 쪽은 `docs/rules/upstream.md` 「오퍼레이터 스킨 — 선택·공개·전달」).
- 자리: 오퍼레이터 설정(`screens/loadout.js` 상세)과 선발 편성(`screens/diy.js` 상세)의 맨 위, 「잠재능력과 육성도」 앞(`ui/skinPicker.js SkinSection`). 열쇠는
  기물 ID가 아니라 오퍼레이터 charId — 일반·정예·선발 기물이 한 오퍼레이터다.
- 목록(`ui/skins.js buildSkinCatalog`): 스킨 데이터의 두 목록 — `local/spine/skin/skins.json`(스킨마다 주인·일러스트 `illust`)과 `art.json`(아바타·초상화,
  `docs/rules/render.md` 「스킨 모델 소재」 「그림을 받는 곳」). 둘 다 리소스 목록에 있는 작은 파일이라 스킨 데이터를 안 골랐어도 칸을 처음 열 때 받는다(어떤
  스킨이 있는지는 잠긴 채로도 보여야 함). 주인이 소환물인 스킨은 고르지 않는다 — 주인 오퍼레이터의 스킨을 따라간다. 목록이 없는 서버면 칸이 없다.
- 상태(`skinSectionState`, `resources.js skinPackState`에서):
  - 칸 없음: 리소스 받기가 안 되는 곳(`phase: 'off'` — 보안 연결 아님, 목록 없음), 목록에 스킨 묶음이 없음, 스킨 목록 없음.
  - 잠김(스킨 데이터를 안 고름, 시안 s4): 기본 타일이 「사용」, 스킨 타일은 오퍼레이터 자기 그림을 흐리게(회색) 자물쇠 아래 두고 눌러도 아무것도 안 한다. 머리
    오른쪽 「지금은 기본 스킨만 쓸 수 있습니다」, 밑 상자 「스킨 데이터를 받으면 다른 플레이어가 고른 스킨도 보입니다.」 + 「받기 약 N MB」(`setResourcePack('skin',
    true)`, 묶음 전체 크기). 저장된 선택이 있어도 기본으로 보인다.
  - 받는 중(고름, 남은 파일 있음): 고를 수 있다. 밑 상자는 설정 탭과 같은 「다 받을 때까지는 기본 스킨으로 보이고…」와 받은 %.
  - 다 받음(시안 s5): 머리 오른쪽 「내가 고른 스킨은 스킨 데이터를 받은 플레이어에게 보입니다」, 상자 없음.
- 타일: 아트 상자에 그 모습의 1:2 초상화(머리 쪽으로 잘림)와 1:1 아바타를 함께 싣고, 폰 가로(`max-width: 1000px` 그리고 `max-height: 520px`)에서는 아바타를
  그린다(upstream의 전환 — 그 화면의 상세 패널은 약 200 px). 스킨 그림이 없으면 오퍼레이터 그림을 흐리게. 고른 타일은 민트 테두리와 「사용」. 고른 스킨 타일을 다시
  누르면 그 일러스트를 창으로 크게 본다(기본 타일은 안 열림). 크기는 시안의 작은 타일(`max(.96rem, 66px)` 폭, 그림 `max(1.28rem, 70px)`), upstream의 5칸 1:2보다 작다.
- 이름: 스킨 목록 기록의 `name`을 스킨 ID로 번역해(`data.localeSkinName(id, name)`) 쓰고, 없으면 「스킨 N」(목록 순서). `name`은 공식 스킨 표
  `displaySkin.skinName`(중국어)을 `skin_extract.py`가 싣는다(모든 실행, 이름만은 `--only names` — 클라 없이 몇 초). 다른 언어 이름은 손 표 없이
  `tools/build-i18n.mjs skinNameRows`가 두 언어의 `skin_table.json`을 스킨 ID로 짝지어 겹침 자료의 `skins`(스킨 ID → 이름)에 넣는다(`data/` 기록이 아님;
  `data/assets.json` `chars`의 모든 이름 있는 스킨이라 추출을 기다리지 않음). 중국어로 열쇠를 잡는 `names`에는 넣지 않는다 — 스킨 이름이 데이터 이름과 같으면
  데이터 쪽 번역이 보였다(스카디 더 커럽팅 하트 스킨 「升华」 `char_1012_skadi2@boc#4`가 KR 표의 「서블리메이션」이 아니라 효과 `allybuff_select_6` 이름 「승화」로,
  266벌 중 1벌 — 2026-11-17 고침). 겹침 자료에 `skins`가 없거나 그 스킨이 없으면 중국어 이름 그대로. KR 표에 없는 CN 전용 스킨(2026-11-16: 266벌 중 26벌)은 `public/i18n/ko/manual.json` 「오퍼레이터 스킨 이름」 절에 KR 스킨 이름 말투로 손 번역
  [비공식](docs/I18N.md "CN-only texts in Korean" — 시리즈 이름은 KR 표 그대로: 서머 그라스 FA…, 한가로운 휴일 HD…), KR 출시 때 KR 표 이름으로 바뀐다.
  재발 방지: `test/i18n-data.test.js` 「data/i18n/ko.json names every operator skin」(새 CN 전용 스킨이 사전 줄 없이 오면 실패, 「升华」 스킨이 「서블리메이션」),
  「build-i18n skin names」(스킨 이름이 `names`에 들어가면 실패), 「data.js setLocale」(`localeSkinName`이 ID로), `test/ui/skin-picker.test.js`
  「the real skin lists」(이름 없는 목록이면 실패)·「a tile's name is looked up by the skin id」(타일이 중국어 이름으로 찾으면 실패 — 되돌려 봄).
- 보내기(`ui/loadoutSync.js installSkinsSync`, `main.js`): `room.skins { skins }`를 welcome·고칠 때마다(같은 동기화 엔진), 시즌을 붙이지 않는다(`seasonless`).
  스킨 데이터를 고르지 않았으면 빈 맵을 보낸다 — 잠긴 칸이 「지금은 기본 스킨만」이라 말하는 것이 다른 플레이어 화면에서도 맞도록. 선택은 저장해 두었다가 다시
  고르면 보낸다(`resStore.chosen.skin`을 따라 다시 보냄). 저장 값은 선에 맞는 모양만(`parseStoredSkins`: charId → 스킨 ID, 256쌍).
- 저장 자리: 이 브라우저의 `sp.pref.skins`(`ui/skins.js SKINS_PREF`, 시즌을 나누지 않는 맵 하나 — 오퍼레이터 설정의 시즌별 `loadout` 맞춤과 따로)와 서버
  세션(`session.skins`, 방마다 좌석 `seatSkins`, 경기 `players[].skins`). 고르는 즉시 저장되고 새로 고침·방 다시 만들기·「시뮬레이션 포기」 뒤에도 남는다
  (2026-11-17 관리자 제보 「싱글에서 포기하고 다시 들어가면 기본 스킨」을 서버 실제 경로로 재현해 봄: 두 번째 싱글 방의 좌석·`m.public`에도 그대로 있었다).
  게임에서 기본 모습이던 원인은 렌더 쪽 — 새 경기 필드의 첫 장면이 스킨 목록보다 먼저 시작함(`docs/rules/render.md` 「스킨 렌더 게이트」 「첫 장면 전에 목록」).
- 내보내기·가져오기(관리자 요청 2026-11-17): 오퍼레이터 설정의 「내보내기」(`screens/loadout.js openExport`)가 스킨 선택도 담는다 — 봉투의 `skins`
  (`ui/loadoutModel.js exportPayload`, charId → 스킨 ID, 선에 맞는 쌍만). 창의 글 상자와 「복사」는 한 줄 문자열(`encodeLoadoutCode`:
  `SPL<판>.` + 압축한(`deflate-raw`) JSON `{ v, entries, ops, skins }`의 base64url — CompressionStream이 없는 브라우저는 압축 없이 `SPL<판>j.`; 커스텀 규칙 공유
  코드와 같은 방식)이고, 「파일 다운로드」는 예전처럼 JSON 봉투다. 해시가 아니라 내용 자체라 되돌릴 수 있다. 「가져오기」는 문자열·JSON·파일 모두 받는다
  (`expandLoadoutCode` → `parseImport`; 문자열 안의 빈칸·줄바꿈은 무시 — 채팅 앱이 줄을 접음, 풀어 256 KB를 넘거나 깨진 문자열은 「알 수 없는 내용」으로 거절).
  `skins`가 있으면 스킨 선택을 통째로 바꾸고(빈 맵이면 모두 기본 스킨, 잠재능력·육성도 `ops`와 같은 규칙), 스킨이 담기기 전의 내보내기는 지금 선택을 그대로 둔다.
  스킨만 담긴 것도 가져올 수 있고 그때 스킬·모듈과 잠재능력·육성도는 그대로다. 스킨 ID는 목록과 대조하지 않는다 — 목록에 없는 스킨은 기본 모습으로 그려진다(`chosenSkin`).
  스킨만 골랐어도 「내보내기」가 켜진다. 확인: `test/ui/loadout.test.js` 「the one-line code」, `test/ui/loadout-ops-import.test.js`(켜짐 조건),
  `test/ui/loadout.e2e.test.js`(브라우저, 문자열로 왕복).
- 대기실 좌석 카드(`ui/seatArt.js seatCardSkin`, `screens/room.js`): 카드의 오퍼레이터가 그 좌석이 고른 스킨의 초상화를 입는다 — 내 카드는 이 브라우저 선택을 곧바로,
  남의 카드는 `room.state seats[].skins`를 「다른 플레이어 스킨」이 켜져 있을 때만, 스킨 데이터를 안 골랐으면 아무도 입지 않는다. 그림은 한 장씩 워커가 받으므로
  다 받기를 기다리지 않는다(모델은 다 받아야 그림 — `docs/rules/render.md` 「스킨 렌더 게이트」). 스킨 초상화가 안 열리면 기본 초상화(`seatArtSrc`).
- 게임 안 상세 카드(`ui/detailArt.js ChessDetailArt` → `ui/skins.js cardSkinArt`, 2026-11-17 관리자 제보 「스킨을 골라도 상세 카드는 기본 스킨」):
  내 기물(대기열·보드·배치 중, 전투 중 내 유닛 — 카드가 받는 `piece`)이 입은 스킨(`pieceView.skin` — 서버가 그리는 몸에 붙인 것, 필드가 그리는 스킨과 같음)이
  그 몸(`tmplId`·`charId`)의 스킨이고, 스킨 데이터를 다 받았고(`skinPackState` 'done' — 안 받았거나 받는 중이면 기본 그림, 관리자 결정 2026-11-17) 그
  일러스트(고른 화질 판)가 캐시에 있으면 그 스킨 일러스트를 그 그림의 카드 틀로 그린다(위 「정비 화면 HUD」 배치 근거 — 공식 스크린샷 둘로 잼). 스킨
  일러스트는 카드 창으로 자르지 않는다(고르기 화면의 크게 보기도 같은 파일). 기물 없이 연 내 카드(상점 칸·내 맹약 팝업의 줄 — `resolveDetail`이
  `skin: { own: true }`)는 이 브라우저의 선택을, 유닛 카드는 그 유닛이 입은 스킨(`UnitInfo.skin` → `skin: { id, mine }`)을 쓰되 남의 유닛은 「다른 플레이어
  스킨」이 켜져 있을 때만(필드의 모델과 같은 규칙, `docs/rules/render.md` 「스킨 렌더 게이트」) — `ui/skins.js cardWorn`. 팀원 맹약 팝업의 줄에서 연 카드·금지 목록은 기본 그림.
  재발 방지: `test/ui/skin-picker.test.js` 「detail card skin 立绘」(받기 전·캐시 없음·다른 오퍼레이터면 기본, 카드가 입은 스킨을 몸 ID로 묻는지,
  `cardWorn`)·「resolveDetail hands the card its skin」·「the real skin lists」(카드 틀 없는 스킨 일러스트면 실패).
- 오퍼레이터 그림(2026-11-17 관리자 요청 「스킨을 고르면 상점 카드·아이콘도」): 내 오퍼레이터의 초상(1:2)·아바타(1:1)가 나오는 곳은 고른 스킨의 그림을 쓴다 —
  상점·보상 카드, 맹약 팝업의 내 줄, 장비 교체 창, 라운드 대미지 패널, 결산의 내 진형·대미지 표의 내 줄, 정비 화면 대체 필드(WebGL 없음), 기본 모양 상세 카드,
  오퍼레이터 설정·선발 편성·선발 선택의 목록과 머리 그림, 전략 고르기의 선발 미리보기, 그리고(관리자 요청 2026-11-17 「스킨 설정을 하면 아이콘이나 초상화가
  보이는 모든 곳이 스킨」) 브리핑·판 정보의 금지 오퍼레이터(`ui/matchInfo.js ChessIcon`), 업적 통계의 오퍼레이터 초상·맹약 오퍼레이터, S.W.E.E.P. 보고서의 맹약
  오퍼레이터, 콘솔의 오퍼레이터 목록·선발 창, 명함 오퍼레이터 고르기 목록, 오퍼레이터 보유 목록(오퍼레이터와 대체 오퍼레이터 모두 — 각자 고른 스킨).
  기물이 있으면 그 기물이 입은 스킨(`pieceView.skin`), 없으면 이 브라우저의 선택(`ui/skins.js skinPic`·`skinPicture` — 업적 기록에는 입은 스킨이 남지 않으므로
  지난 판의 오퍼레이터도 지금 선택). 그림은 스킨 데이터의 `art.json`(공개 그림 저장소에서 받은 것, 위 「목록」 — 오퍼레이터 스킨 모두 있음, 추출 불필요)이고,
  스킨 데이터를 다 받았고('done') 그 그림이 캐시에 있을 때만 — 안 받았거나 받는 중이면 기본 그림(관리자 결정 2026-11-17). 전략 고르기 순서 줄의 좌석 초상은 대기실
  좌석 카드와 같은 스킨(`seatCardSkin`)을 같은 'done' 조건으로. 그대로 기본 그림인 곳은 고르기 칸의 「기본」 타일뿐이다(기본 모습을 고르는 칸, 관리자 결정
  2026-11-17).
  남의 오퍼레이터 아이콘(보스 대미지 순위의 남의 줄, 결산의 남의 진형·대미지 표·연합 방어 표의 남의 줄, 지켜보는 팀원의 맹약 팝업 줄)은 「다른 플레이어 스킨」이 켜져
  있으면 그 플레이어가 공개한 선택(`m.public players[].skins` — 서버 `skinFor`와 같이 그려지는 몸의 charId로: 대체 오퍼레이터면 그 몸, 선발이면 고른
  오퍼레이터)을, 꺼져 있으면 기본 그림(관리자 요청 2026-11-17) — `ui/skins.js playerSkins` → `UnitThumb skinsOf`. 기물이 따로 없는 목록이라 지금 선택을 따르고
  (전투 중에 바꾼 스킨은 필드의 유닛은 그대로, 아이콘은 새 선택), 보스 대미지 순위의 내 줄은 이 브라우저 선택. 스킨 데이터를 안 받았으면 모두 기본 그림.
  잎 컴포넌트는 훅 없이 `skinArt()`로 지금 값을 읽고, 앱 뿌리(`main.js App`의 `useSkinArt`)가 선택·목록·받기 상태가 바뀔 때 트리 전체를 다시 그리고 목록을
  받는다(스킨 데이터를 다 받기 전에는 목록도 받지 않음). WebGL 없는 대체 필드는 다음 그리기에서 바뀐다.
  재발 방지: `test/ui/skin-picker.test.js` 「every operator picture goes through the skin」(`chessAvatarUrl`·`chessPortraitUrl`을 부르는 줄은 같은 줄에
  `skinPic`이 있거나 파일이 이유와 함께 예외 목록에 있어야 함 — 상점 카드를 되돌려 실패를 봄; 2026-11-17부터 예외는 부르는 쪽이 기본으로 돌아가는 자리와
  「기본」 타일뿐, S.W.E.E.P. 줄을 되돌려 실패를 봄)·「skinPicture」·「wornSkin / skinPic」·「another player's operator
  icon」·「the leader ranking, the result's lineups and a teammate's bond popup」(`UnitThumb`의 `of: skinsOf`를 빼서 실패를 봄).
- 오퍼레이터 설정의 「기본값으로」·「모두 기본값으로」(관리자 요청 2026-11-17): 스킨 선택도 오퍼레이터의 설정이다 — 스킨을 고른 오퍼레이터는 스킬·모듈·잠재능력·
  육성도와 같이 「조정됨」(목록 표시·상세 머리·「조정된 것만」 거르기·조정 수·입구 단추 숫자, `ui/loadoutModel.js skinSetOf` → `changedCount`·`filterRoster`,
  `screens/loadout.js badgeCount`), 「기본값으로」가 그 오퍼레이터의 스킨을 지우고(`clearSkin`), 「모두 기본값으로」가 그 시즌 오퍼레이터 목록에 있는 오퍼레이터의
  스킨을 지운다(선발 전용 오퍼레이터의 스킨은 잠재능력·육성도처럼 남김 — 선발 편성 탭의 것). 스킨 데이터를 안 받아 기본으로 보이는 동안에도 저장된 선택은 설정으로
  센다(다시 받으면 그대로 보내므로). 재발 방지: `test/ui/potential-ui.test.js` 「a chosen skin is one of the operator's settings」.
- 문구 아홉(`en.json`·`ko/ui.json`), 한국어는 시안 문구 그대로.
- 확인: `test/ui/skin-picker.test.js`(목록·선택·상태·타일·상자·크게 보기·두 화면 자리·폰 전환·보내기·좌석 카드, 그리고 이 체크아웃에 목록이 있으면 실제 목록에서
  고르기 화면이 그리는 그림이 모두 리소스 목록 파일인지). 화면은 관리자가 확인(구현 뒤 전후 캡처 반복 없이).
- 재발 방지: `test/ui/skin-picker.test.js` 「skins sync (room.skins)」 — 보낼 때 시즌을 붙이거나 스킨 데이터 없이 선택을 보내게 되돌리면 실패함을 봄.

## 팀원 정보 창 (2026-11-19, 관리자 결정 2026-11-15 — 시안 그대로)

- 공식 규정의 새 창 `autochess_player_detail_dialog`(CN 전투 번들; 공식 화면 2장 — 표준 11라운드 정비, 극한 1라운드 정비): 왼쪽 플레이어 목록에서
  아바타를 누르면 열린다(공식 영상). 우리는 두 시즌 모두에 넣는다(관리자 결정 2026-11-15 — 맹약 하반기 공식에는 없는 편의 기능). 아바타 누르기가 이 창을
  열고 닫으며, 예전의 「누르면 진지 보기 / 전투 중 「前往查看」 팝오버」는 창이 열린 동안 팀원 아바타의 「前往查看」으로 옮겼다(공식 「前往观战」, 관리자 결정
  2026-11-15). 모양은 공식 규정 `player_status_item`의 `normal_ob_part`(관리자 제보 2026-11-19 「아바타 전체 테두리에 외곽선, 글자는 아이콘 위쪽 폭 전체」):
  흰 틀+위 띠 그림 `btn_ob_other`(CN 87×79 9분할 — EN은 98×98 네모라 다른 그림)를 72 아바타 위 93×84.6, 중심 4 위로 덮고, 띠 안에 `ob_arrow`와 검은 글자를
  아바타 폭 전체로; 누르는 범위는 그 틀 전체(아바타 전체). 틀 색 #03d0fd는 프리팹이 흰색으로 두어 CN 캡처에서 잼 [추정·화면]. 꼬리표가 없는 아바타(자기 줄,
  볼 수 없는 팀원)는 창이 열린 동안 목록 테두리 `bg_team_border`를 #59ffd2로 밝힘 [추정·화면: 공식 11라운드 화면의 자기 줄 테두리로 읽음]. 볼 수 없는
  팀원(같은 전장·다른 조 보스 필드·탈락·나감)과 보고 있는 팀원에게는 틀이 없다. 「返回战场」은 그대로 자기 행(서버 전투 모드에서도 다른 전장을 보는 동안).
  아바타 모서리의 연승 표시(삼각형·별)는 이 틀 위에 그린다 — 공식 `player_status_item`이 `win_streak_holder`를 `normal_ob_part` 뒤(위)에 두고(공식 클라에서
  확인), 보스 라운드 빛(`damage_fx_holder`)은 그 앞(틀 아래)이라 그대로 둔다(관리자 제보 2026-11-19 「연승 삼각형이 더 위로」; `playerDetail.js streakTopStyle`).
  `ui/teamPanel.js`, `ui/playerDetail.js`(`goFrameStyle`), `css/player-detail.css`.
- 줄: 왼쪽 목록 차례 그대로 한 사람 한 줄, 첫 칸은 목록의 아바타 그대로(목록 아바타를 창 위로 올림), 그 다음 명함(이름과 회색 「#번호」, 완벽 연승 n, 보급센터 레벨 그림
  `playerdetailshoplevel/shop_level_n` — 기본 테마 번들, 이름이 상점의 `shop_level_n`과 같아 따로 뽑음), 켜진 맹약, 필드의 오퍼레이터, 고른 전략 초상.
  줄 높이 = 목록 줄 높이 + 줄 간격(줄끼리 틈 없이 닿음 — 관리자 결정 2026-11-15: 공식 줄은 80 높이·간격 4지만 바탕 `row_back`이 120이라 이웃 바탕이
  간격을 덮는다). 명함·맹약 목록·오퍼레이터 목록은 왼쪽 아바타와 높이·위아래가 같다(관리자 제보 2026-11-19 — 공식은 72 아바타 옆 명함 78·목록 82.6이지만
  우리 목록 아바타에 맞춤). 크기는 공식 줄(명함 257×78, 목록 `detail_list_back` #2f2f2f 60 %, 오퍼레이터 칸 64, 전략 칸 88×80)을 아바타 높이/78 배로.
  - 「#번호」: 공식은 계정 번호(「川 #9512」). 우리는 계정이 없어 로비 첫 화면·방 좌석 카드의 「DOCTOR #번호」를 그대로 쓴다(관리자 제보 2026-11-19 「로비에서
    나오는 숫자를 그대로」; 같은 함수 `ui/components.js doctorNo(playerId)` — 접속(세션) 동안 같고, 창이 따로 번호를 만들지 않는다). AI 팀원은 로비에 번호가
    없지만(「AUTONOMOUS UNIT」) 창에서는 같은 함수로 그 id의 번호를 단다.
  - 바탕: 클라가 Image 색으로 칠하는 흰 스프라이트(`detail_list_back`, `char_avatar_frame`, `btn_ob_other`)는 CSS 마스크로 그 색을 칠한다 — 그대로 바탕으로
    깔면 흰 판이 된다(관리자 제보 2026-11-19 「배경이 흰색으로 깨진듯이」, 처음 넣을 때(d50ffb0ee) 목록 바탕이 그랬음).
    `detail_list_back`은 Sliced(64×68, 테두리 왼 7·아래 10·오른 9·위 11)라 9-slice 마스크(`-webkit-mask-box-image`, --k 단위)로 칠한다 — 한 장을 100 % × 100 %로
    늘린 마스크는 5단위 모서리가 상자와 같이 늘어 길고 납작한 곡선이 됐다(관리자 제보 2026-11-19 「모서리 라운드 처리가 이상해」). 그림이 없거나 마스크
    테두리를 못 쓰는 브라우저(Firefox)는 같은 색의 둥근 상자(반지름 5단위). 재발 방지: `test/ui/player-detail.test.js` 「white sprites the client tints are masks」.
- 맹약 칸 = 위 HUD 맹약 칸(`.bslot`: 원판·문양·중첩 수·이름, 같은 글꼴)을 줄 높이의 0.8로 줄인 것, 단계 Ⅰ·Ⅱ와 「n/m」은 뺀다(관리자 결정 2026-11-15 — 공식
  `autochess_player_detail_bond_item`에 단계 노드가 없음). 하나도 없으면 공식 `icon_noinfo`(「NO INFO」).
- 맹약·오퍼레이터 목록이 칸을 넘으면 가로로 넘긴다 — 공식 `part_bond`·`part_operator`는 Scroll View, 넘칠 때 오른쪽에 `list_arrow`. 위 HUD 맹약 칸과 같은 처리기(`ui/bondStrip.js H_SCROLL`)로 세로 휠이 가로로 넘기고 마우스로 끌어 넘기며, 터치는 브라우저 기본 스크롤(관리자 제보 2026-11-20 「맹약이 길어지면 스크롤이 안 됨」 — 전에는 `overflow-x`만 있어 마우스로는 넘길 수 없었다). 재발 방지: `test/ui/player-detail.test.js` 「the bond and operator lists scroll」.
- 오퍼레이터: 서버가 `m.public players[].lineup`으로 보낸다(`server/match/match/views.js _lineupView` — 보이는 몸(补位·선발은 그 오퍼레이터)의 `char`·`avatar`,
  등급, 정예, 장비 `equip`(장비마다 하나, 황금 장비 1)·`slots`(2가 아닐 때만); 보기 전용, 규칙은 안 읽음 — 전투 golden 무관). 칸은 초상 56·
  `char_avatar_frame`(회색, 정예는 #e9871c + `gold_gradient`)·왼쪽 아래 등급 Ⅰ~Ⅵ·초상 위 장비 막대. 장비 막대는 이 창 프리팹의 막대(칸마다 16×5, 찬 칸
  #f9dc27)가 아니라 필드의 정비 장비 막대를 그대로 쓴다(관리자 제보 2026-11-19 「기존 공식 알약 재활용」; `render/hud-bars.js EquipBar` — `equip_bg` 위
  장비마다 흰 알약 `equip_normal_icon`, 황금 장비는 `equip_gold_icon`, 장비가 없거나 칸이 둘보다 많으면 없음)를 0.6배로. 다른 플레이어의 초상은 그 사람이
  공개한 스킨(「다른 플레이어의 스킨」이 켜져 있을 때).
- 그림은 CN 전투 번들의 네 프리팹과 그 첫 칸의 아바타 칸 `player_status_item`이 쓰는 스프라이트(`season/act3autochess/playerdetail`,
  `tools/local-extract/season_ui.py`의 `prefabs`), 기본 테마의 `playerdetailshoplevel`, 장비 막대는 `ui/battlecommon` — 로컬 추출이 없으면 CSS 모양. 명함 그림은 넣지 않음(어두운 판; 우리 명함은 다른 묶음 거리), 맹약 원판은 우리 기본 테마 색만.
- [추정·화면: 켜진 맹약만 나오는지(1라운드 화면의 팀원 NOINFO·내 줄 독행으로 읽음), 오퍼레이터가 필드만인지 정비 구역까지인지와 차례(우리는 필드만, 등급 →
  정예 → 필드 차례), 장비 막대가 장비 없는 오퍼레이터에게도 있는지(우리는 장비 있는 오퍼레이터만), 전략 초상의 🔍(우리는 누르기 없음, 툴팁에 전략 이름),
  닫기(우리는 창 밖·아바타 누르기, 단계·라운드가 바뀌거나 보는 전장이 바뀌면 닫음), 탈락한 줄의 `row_dead_cover`(우리는 어두운 덮개), 1인 판(목록이 숨어 창도
  없음)] — 공식 캡처로 볼 것은 `bundles/` mix-Q 「팀원 정보 화면」 줄.
- 확인: `test/match/player-detail.test.js`(실제 판 길에서 `lineup` — 필드만·등급 차례·정예·장비 알약(황금)·탈락 뒤 빈 목록), `test/ui/player-detail.test.js`(켜진
  맹약만·줄 자리·아바타 높이·#번호 = 로비 번호·완벽 연승·상점 레벨·장비 알약, 아바타 누르기 = 창, 「前往查看」 틀과 그 위 연승 표시, 흰 스프라이트는 마스크로만,
  스타일 연결). 화면:
  Windows Chrome 1600×900·휴대폰 터치 844×390(2026-11-19, 개발 모의 화면 PREP 규정) — 잘린 글자 0(가로로 밀리는 오퍼레이터 목록 밖 칸 제외), 세 카드 높이·위아래 =
  아바타 ±0px, 가운데 맞춤 ±0px, 실패한 요청 0. 실제 판은 관리자가 확인.
  재발 방지: `test/ui/player-detail.test.js` 「white sprites the client tints are masks」
