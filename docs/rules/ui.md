# 화면 UI

옛 `docs/LOCAL-PATCH.md`에서 2026-10-09에 나눈 파일이다. 옛 절 이름은 `docs/LOCAL-PATCH.md` 색인에서 찾는다.
본문의 「캡처 N」·「KR 캡처 N」·「이미지 N」은 관리자가 준 공식 화면 캡처 묶음(비공개)의 번호다.

## 게임 내 디버그 패널 (2026-10-06)
- **로컬 디버그 모드** = `SP_DEBUG_PAGE=1` 또는 올바른 `SP_DEBUG_FUNDS`(0..999), 그리고 `NODE_ENV`가 `production`이 아닐 때
  (`server/local-patch.js debugMode`). 로컬 개발 서버는 둘 다 켜고, 배포 서버는 둘 다 설정하지 않고,
  Docker 이미지는 `NODE_ENV=production`이라 배포 서버는 절대 디버그 모드가 아니다.
  - 이 조건은 `SP_DEBUG_FUNDS` 재화 고정에도 적용된다(예전에는 `SP_DEBUG_FUNDS`만 보고 고정했다).
- 서버: `dbg.funds { on }`, `dbg.addDiy { chessId }`는 `Lobby.onMessage` 첫 줄의 기존 훅(`localPatch.onMessage`)으로 들어온다.
  디버그 모드가 아니면 `BAD_MSG`로 거부(클라이언트를 믿지 않음; `debugMessage`와 `debugIntent`가 각각 확인). 프로토콜 형식(`shared/local.js`)은
  항상 있지만 서버가 거부한다. `privateView` 감싸기(→ `m.private.debug = { fundsPin, pinValue, candidates }`)와 `funds` 접근자는 디버그 모드에서만
  설치되므로 배포 서버의 경로는 원본 그대로다.
  - 재화: 플레이어별 `ps.debugFundsPin`(undefined = 환경 기본값 `SP_DEBUG_FUNDS`, null = 실제 재화, 숫자 = 고정). 켜면 `SP_DEBUG_FUNDS`
    값(없으면 99)으로 고정, 끄면 그 값에서 실제 재화로 이어진다. 봇은 항상 실제 재화.
  - 선발 추가: `chess_diy_<key>_<5|6>_<a|b>`(a 일반, b 정예)를 `PlayerState.acquireChess(id, { source: 'grant', fromPool: false })`로
    정비 구역(hand)에 넣는다 — 상점 구매와 같은 경로라 3장 합성·onGain·`m.private` 갱신이 그대로 된다. 정비 단계만(준비 완료 후에도 허용),
    정비 구역이 가득 차면 합성이 되는 경우가 아니면 `HAND_FULL`(구매와 같은 규칙, 임시 칸으로 넘기지 않음). 전용 풀 복사본을 쓰지 않으므로
    `diyOwned`(오퍼레이터 구성에서 고른 픽 = 상점에 나오는 픽)와 풀은 바뀌지 않는다. 판매하면 풀에 돌려줄 복사본이 없다(0).
  - 스킬·모듈: `dbg.addDiy { chessId, skill?, module? }`. 오퍼레이터 구성(DESIGN §16)과 같은 방식으로, 그 기본 chess id(`_a`)의 loadout 항목
    `{ skill, module }`을 `ps.loadout`에 직접 쓴다(`debugLoadoutEntry`) → `loadoutFor`/`resolveLoadout`를 읽는 전투 입력(`battleInput`)·
    소환물·사거리·`m.private.loadout`이 그대로 따른다. 검사는 `room.loadout`과 같은 `loadoutOptions`(스킬 번호가 그 기록에 있는지, 모듈은 정예
    기록의 `modules` 또는 `none`; 일반 기록에 모듈을 보내면 거부). 생략하면 현재 값. 항목의 `diy`(선발 칸)는 있으면 유지하고 새로 붙이지 않는다
    → 고르지 않은 오퍼레이터는 픽이 되지 않는다(`diyPicks`는 `diy`만 본다, `setLoadout`/`checkLoadout`을 거치지 않아 `diyOwned`도 그대로).
    거부되면 아무것도 바뀌지 않고, 정비 구역이 차서 못 넣으면 loadout을 되돌린다. 일반 기물에만 스킬을 고르면 같은 항목의 모듈(합성된 정예가 쓸 것)은 유지된다.
  - 결산(2026-10-09, 관리자 요청 「디버그용으로 결산화면을 바로 볼 수 있어?」): `dbg.finish { victory }` → `Match.finish({ victory, reason: victory ? 'victory' : 'defeat' })`.
    어느 단계에서나 판을 바로 끝낸다 — 모든 사람 자리에 `m.result`, `onMatchEnd`(`[stats]` 줄, 결산 화면 피드백 허용)가 그대로 돈다. 패널 맨 아래 「정산 [승리] [패배]」.
  - 모든 오퍼레이터 추가(2026-10-11, 관리자 요청 「맹약별, 단계별, 이름 검색으로 필터링 가능하게 해서 모든 오퍼가 추가 가능하게」):
    `dbg.addChess { chessId, golden? }` → `data/chess.json`의 일반 기물 id(숨김 기물 포함, 선발 칸 `isDiy`·정예 id는 거부)를
    `acquireChess(golden ? 정예 : 일반, { source: 'grant', fromPool: false })`로 정비 구역에 넣는다. 정비 단계만, 정비 구역이 차면 합성이 되는 경우가
    아니면 `HAND_FULL` — `dbg.addDiy`와 같은 규칙. 넣을 때 풀 복사본을 쓰지 않지만, 3장 합성이 되면 `_mergeChess`가 정예 몫(`goldenCopies`)을
    풀에서 채운다(모든 합성과 같다). 목록은 서버가 보내지 않고 클라이언트가 자기 `chess.json`으로 만든다(서버는 id만 검사).
    선발 후보(`debugCandidates`)에는 맹약 필터용 `bonds`(`diy.operators[charId].bonds`)가 붙는다.
- 클라이언트: `m.private.debug`가 있을 때만 `DebugPanel`을 그린다(관전석 제외). 위치는 왼쪽 팀 패널 오른쪽, 맹약 줄 아래(`left 2.3rem, top 2.05rem`)
  — 보드·상점·정비 구역과 겹치지 않는다(1920×1080·1280×720 확인, 폭 2.1rem: 그보다 넓으면 보드 왼쪽 날개에 닿는다).
  선택 상자는 현재 loadout 항목(`m.private.loadout`)이나 기본값에서 시작하고, 스킬 이름(「S3 · 그믐달의 여운」)·모듈 이름은 원문을 DOM 번역기가 바꾼다. 맹약 팝업·상세 카드는 같은 자리에 위로 열린다. 머리줄(DEBUG)을 누르면 접힌다.
  문구는 중국어 원문 + `public/i18n/ko/ui.json`(「调试用资金固定 {0}」 → 「디버깅용 재화 {0} 고정」 등).
  오퍼레이터 고르기(2026-10-11): 맹약(전체 / 선발만 / 각 맹약) · 티어(전체 / I–VI) · 검색(표시 이름·중국어 이름·영어 이름·세부 직군·맹약 이름) 필터를 거친
  한 목록(「VI · 이름」, 숨김 기물은 「(숨김)」, 선발은 「(선발)」, 옆에 개수)에서 고른다(`debugEntries`·`filterDebugEntries`). 일반 기물은 일반/정예만,
  선발은 지금처럼 티어(V/VI)·스킬·모듈까지 고른다.
  선발은 티어마다 칸이 2개라, 두 칸의 오퍼레이터가 모두 기물을 갖고 있으면 세 번째 선발은 거부된다(관리자 확인 2026-10-11: 칸 제한은 그대로).
  이때 토스트는 코드 문구(「잘못된 대상」) 대신 「VI티어 선발 칸 2개를 이미 기물이 있는 오퍼레이터(왕, …)가 쓰고 있습니다. 먼저 판매하세요」
  (관리자 요청 2026-10-11: 패널이 아니라 토스트에, 한국어로) — 서버 `detail`을 `diySlotsFullOf`가 읽는다(문장은 테스트로 고정).
- 숨기기·추가 적(2026-10-12, 관리자 요청 「단축키로 패널을 숨기거나 표시」「다음 라운드에 직접 지정한 적들이 추가로 나오게」):
  - **F2**가 패널 전체를 숨기고 다시 보인다(머리줄 접기와 별개; 숨길 때 「F2 키로 다시 표시」 토스트). 브라우저별로 기억한다(`sp.pref.debugPanelHidden`).
    F2는 게임 단축키(`DEFAULT_HOTKEYS`, 다시 지정 가능한 키 목록)와 겹치지 않는다. 머리줄에 「DEBUG F2」.
  - `dbg.addEnemy { enemyKey, count? }`(1–20, 기본 1) → 보낸 플레이어의 **다음 전투**에 그 적을 더 넣는다. 0코인·1전투짜리 현상 수배로
    (`Match.addBounty`, 표시 `debugEnemies`) 넣기 때문에 공식 추가 적(悬赏 카드의 적)과 같은 길을 탄다: 템플릿의 첫 보행/비행 행동에 끼워 넣기
    (`waves.js bountyPlan`), 라운드 배율, 보스 라운드는 그 플레이어 쪽 절반, 敌情 미리보기·효과 목록(「DEBUG · 1전투 남음」)에 표시, 그 전투의
    정산이 지운다. 정비 단계만(전투 중에 넣으면 그 전투의 정산이 나오기 전에 지워 버린다). `dbg.clearEnemies`는 대기 중인 것을 지운다.
    토큰 전용 적(`tokenOnly`, 소환물)은 거부·목록 제외. 패널은 클라이언트 `enemies.json`으로 목록을 만들고(일반 → 정예 → 보스, 이름·중국어 이름·키
    검색), `m.private.debug.enemies`로 대기 목록(「다음 전투: 원석충 ×3 [비우기]」)을 보인다.
  - 확인: `test/local-patch.test.js` 「dbg.addEnemy …」(전투 spec·미리보기·다른 플레이어 제외·1전투 뒤 소멸), Windows Chrome 실제 솔로 판
    (F2 숨김/표시·기억, 원석충 ×3 추가 → 미리보기·효과 목록, 비우기, 2라운드 정비에서 대기 목록 비어 있음).
- 최종 공세로 이동(2026-10-30, 관리자 요청 「보스전 이펙트 디버깅을 위해 보스 스테이지로 바로 가는 기능」, 관리자 결정 2026-10-30: 바로 이동 ·
  히든 코어 직행은 넣지 않음 · AI 배치 고정 · 기존 기물은 교체(체크 해제 시 유지) · 장비 없음 · 선발 오퍼레이터 없음):
  - `dbg.bossJump { bossId?, bondId?, layers?, preset? }` → 최종 공세보다 앞선 정비 단계 어디서나 `Match.startRound(gd.bossRound)`로 바로 간다.
    그 사이 라운드(수입·결정·현상 수배·전투)는 건너뛴다. `bossId`는 이 모드의 보스(`gd.bossWeights(false)`, 커스텀 금지 반영)만, 생략하면 이 판에 뽑힌 보스.
    이미 최종 공세(또는 그 뒤)면 `WRONG_PHASE`, 모드에 없는 보스·기물이 없는 맹약은 `BAD_TARGET`.
  - 프리셋(`preset`, 기본 켬): 보스 라운드 정비 단계가 열릴 때(`Match.enterPrep` 감싸기 — 배치 맵이 이미 보스 필드이고 배치 이동이 허용되는 때)
    살아 있는 모든 자리(보낸 사람·다른 사람·AI 팀원)의 기물을 돌려보내고(풀 복사본·선발 재고) 맹약 하나를 중심으로 한 보드를 넣는다
    (`server/local-debug-board.js`): 그 맹약의 상점 기물을 높은 티어부터, 배치 가능 인원 안에서 가장 높은 발동 단계까지(모자라면 전부), 남는 칸은
    저지 2·치료 1·대공 1이 모자란 역할 → 맹약을 많이 공유하는 기물 → 높은 티어 순(난수 없음). 모두 정예, 장비 없음, 풀 복사본을 쓰지 않는다(`dbg.addChess`와 같음).
    배치는 AI 배치 계획(`bot.js arrange`, 리허설 없음), 소환물 카드도 놓는다. 보낸 사람의 맹약은 `bondId`(생략하면 뽑기), 나머지 자리는 이 판에 켜진
    핵심 맹약 중 서로 다른 것을 뽑는다(판 시드에서 파생한 난수). 이렇게 놓인 AI 자리는 이후 정비 단계에서 사고팔거나 다시 배치하지 않고 준비 완료만 한다
    (`Match.scheduleBotPrep` 감싸기, `ps.debugLocked`). 두 감싸기는 `dbg.bossJump`를 처음 쓸 때만 설치된다.
  - 중첩 수(`layers`): `keep` 그대로 · `normal` 보드가 발동시키는 맹약마다 BALANCE.md §1.1의 R14 값(핵심 맹약 150, 나머지 90) · `strong` ×1.4
    (히든 코어 중첩 조건을 넘길 정도) · `max` 상한 999. 프리셋을 끄면 보드는 그대로 두고, 그 순간 발동 중인 맹약에만 이 값을 넣는다(가장 많이 모인 맹약이 핵심 값).
    중첩이 바로 들어가므로 발동하면서 밀린 중첩 보상(빅토리아 망치 등)도 공식 규칙대로 지급된다.
  - 패널: 「보스 [이번 판 · 이름 / 모드의 보스들]」, 「맹약별로 다시 배치 (AI 포함)」 체크, 「맹약 [무작위 / 각 맹약]」, 「중첩 수 [현재 유지 / 보통 / 많이 / 최대]」,
    「최종 공세로 이동 (14라운드)」 — 정비 단계이고 아직 보스 라운드 전일 때만 누를 수 있다(`m.private.debug.boss = { round, at, bossId, bosses }`).
  - 확인: `test/local-patch.test.js` 「dbg.bossJump …」(실제 매치 경로: R1 → R14 정비, 선택한 보스·보스 필드 계획, 자리마다 8명·정예·장비 없음·서로 다른 핵심 맹약
    150 중첩, 불변식, AI 준비 완료·배치 그대로, 최종 공세 시작; 프리셋 끔: 기물 유지·중첩 999), Windows Chrome 실제 협동 판(나 + AI 3명, 기본값으로
    버튼 → R14 정비에서 카시미어 6명 150·추가 맹약 90 → 준비 완료 → 최종 공세 진행, 페이지 오류 없음).

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
  - 배치 근거: 같은 번들의 `illust_<charId>_1` RectTransform(`m_SizeDelta` = 그릴 크기, `m_AnchoredPosition` = 프레임 중심에서의 오프셋, y 위)이
    캐릭터마다 얼굴 위치를 맞추는 클라이언트 값이다(古米 953 @ (6, −93) → 눈이 중심 244 위, 波登可 854 @ (0, −81) → 204 위). 카드는 이 값으로 그린다
    (`--fx/--fy/--fw/--fh`): 1단위 = .012rem, 프레임 중심 (3.35rem, 5.53rem) — 얼굴이 능력치 오른쪽 약 2.6rem 아래, 머리 크기 ≈1.7rem.
    KR 캡처의 아트는 플레이어 스킨이라(古米·深巡·波登可) 같은 그림으로 대조할 수 없어 배율·중심은 [추정]: 乌尔比安·古米와 크기·위치가 비슷.
    (`_skinOffset`이라는 또 다른 위치·크기 값도 있으나 어느 화면용인지 확인 못 해 쓰지 않음.) 블록은 원본 `ChessDetail`의 것을 옮겨 실시간 태그·±차이·병합 안내·调配 태그가 남는다. `has-hud-art`일 때만.
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
  - 결석(본판 금지) 구성원은 **목록에서 뺀다**(2026-10-13 관리자 결정, 공식 화면 기억 [추정] — 목록을 만드는 클라 동작은 확인 안 함): 공식
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
- 왼쪽 플레이어 목록: KR 솔로 캡처(정비·전투 모두)에는 목록이 없어 **혼자일 때는 숨긴다** [추정: 멀티는 그대로] — `teamPanel.js` 훅에 `is-solo`.
- 저지 수(阻挡)와 에기르 포식(2026-10-06 확인): 실제 대전 경로(매치 하네스 정비 → `m._normalOpts` → 실제 `Battle`)에서 深巡·幽灵鲨·斯卡蒂 + 앞 칸 오퍼레이터를
  한 줄로 놓으면 深巡 3 → 7(먹은 셋의 기본 저지 2+1+1), 斯卡蒂 1 → 2(관리자 스크린샷의 斯卡蒂 2와 같은 +1). 카드가 읽는 값 — 전투 중 `unitStatsEntry(u, u._s)`,
  정비 중 「开战时」 미리보기 `Match._unitStatsOf`(battleStart 훅까지 실행) — 둘 다 7·2이고 원본 카드도 같은 값(초록 +4)을 보인다. 시뮬레이터 문제 없음.
- 위치 수정(2026-10-06 2차): 라운드 띠 중심을 화면 위에서 34단위로(`player_info_view` 위 고정 156 높이, `group_hud` +44 — 전에는 약 62단위라 위 공백이 컸다),
  🔍 버튼은 띠 중심보다 6.5 위, 맹약 줄은 위에서 55(`bond_list_info_view`, 원 중심 88), matte 96 높이·최소 420 폭, 준비 완료는 틀(161×57) 안에서 판이
  3.1 왼쪽·1.3 아래이고 아이콘·글자는 `panel_content` 기준(글자 중심 판 중심 +17.6, 아이콘은 글자 왼쪽 끝에서 19.7), 플레이어 목록 판은 초상 왼쪽 17(전에는 8.5).
- 그대로 둔 것: 단축키(원본), 준비 완료 아래 플레이어 준비 칸(`panel_player`: `player_bg` + 사람마다 `player_ready` 막대 — 지금은 「준비 완료 n/4」 글자).
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
  프리팹 `garrison_icon`은 그림이 비어 있고 카드 스크립트 `_garrisonIcon`이 실행 중에 채운다(규칙은 네이티브). CN 표는 두 시즌 모두 icon_bond
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
  동결 중 흰 파랑 + 빗금 눈송이(지금 코드 그대로). 어느 그룹을 켜는지는 네이티브 코드라 아이콘 짝으로 판단했다. 비활성(관전 등)은 `bg_lock` +
  회색 아이콘(`*_icon_lock`과 같은 그림이라 CSS 회색 필터로 근사, 갱신 버튼도 같음).
- 아직 없는 것: 접기 상자의 마스코트 Spine(`trap_1096_acshopup`, 텍스처 미추출 — PIXI로 따로 그려야 함), 웹 소재의 `shopPanel/level`이 다른 그림이라
  승급 상자의 "LEVEL"은 글자로 그림.

## 휴식 진입·현상 수배·전투 종료 화면 (2026-10-06)
관리자 요청: 휴식 시간 진입, 현상 수배 선택, 전투 종료를 실제 게임(KR 클라이언트 영상 캡처)과 같게. 근거는 EN 클라이언트
`ui/autochess/[uc]autochessbattle.ab`의 프리팹 좌표(1280×720 캔버스, 1단위 = 1920 기준 1.5px, `--pu`)와 9-slice 테두리(스프라이트 `m_Border`).
- 라운드 시작 배너(`round_start_dialog`): ROUND_START의 PhaseBanner 대신. 어두운 판 `round_bg`(9-slice 79/82/75/79) + 등고선 `round_bg_line`(#31543b),
  왼쪽 픽셀 마스코트(`round_emoji_head/body/hand`, 클립보드 `round_emoji_book`은 `book_mask` 상자(11.6° 기울임) 안에서 머리 위에, 떠다니는 #1aad88 네모 5개, 모서리 `round_cross`, `common_frame` 괄호, `round_text_01/02`),
  [回合] 상자(라운드 두 자리, Novecento 40 #dfdfdf) · [获得] 상자(#ffbc09, `round_sources_icon` + `round_plus` + 이번 라운드 시작에 들어온 자금 #ffba00).
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
  「轮到你了」(KR 「내 차례」, `panel_player_select`): 멀티에서 내 차례가 되면 1.6초([추정] 길이) — `bg_circle`, 고리 3개([추정] ext 스프라이트 → CSS 원),
  `plus` 4개 #18e6b8, 큐브 `square_1` + `square_2`, 글자 49 #00ffc4, `bottom` 막대. 공식 모양일 때는 机变 진입의 PhaseBanner 띠를 띄우지 않는다(겹침).
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
  [추정] 방식: 클라이언트의 칸 강조는 네이티브(셰이더 `Torappu/Scene/Special/HighlightTile`만 있고 머티리얼은 실행 중 생성). 테두리 없음, 놓을 칸의
  흰 표시·출발 칸 표시도 없음(빨간 불가 표시는 유지). 방향을 고르는 동안에도 초록이 남는다(캡처 그대로, `holdPiece`가 다시 켜고 닫힐 때 끔).
- 공격 범위(3D 보드, stripes: 방향 선택 `facing`, 선택한 기물 `selRange` 등): `range_material`(셰이더 `Torappu/Battle/AttackRange`: 알파 블렌드,
  깊이 쓰기 없음, `_Color.a` 0.749, `_AnimationSpeed` 0.5)대로 `sprite_attack_range`(대각선 흰 줄 3개/칸) × 주황 255,140,0([추정] 실행 중 색 —
  캡처 225,148,20 = 0.75·주황 + 0.25·초록과 맞음), 흐르는 방향 [추정]. 그림이 없으면 같은 모양의 절차 텍스처. 이전의 Pixi 주황 칠·SVG 줄무늬는 3D에서 안 그린다.
- 배치 중인 기물(드래그 중·방향 선택 중) 반투명 `GHOST_ALPHA` 0.6 [추정](관리자 제보: 배치 중에는 더 투명하다).
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
  - [추정] 마름모를 바닥 평면에 투영(아래 칸의 화면 모양으로 기울임)하고 반대각 2.6칸(`DIR_HALF_TILES`, 캡처: 약 325 px / 칸 125 px). 말풍선은
    글자가 눌리지 않게 화면에 똑바로. 엄지(`sprite_direction_thumb`)는 캡처에 안 보여 그리지 않음.
- 2D 보드(WebGL2·로컬 그림 없음)는 초록·주황 강조가 원본 그대로(방향 선택 그림만 공식).
- 확인: `public/dev/game-mock.html?stage=act1autochess_m02`(사막)·`act2autochess_m01`, 2000×1125·1920×1080 headless 캡처를 관리자 캡처와 나란히 비교,
  취소 태그 누르기·방향 확정 동작. 테스트 `test/render/placement-ui.test.js`.
- git 밖 생성물: `public/assets/local/ui/battlecommon/`, `public/assets/local/battle/common/`, `data/local-assets.json`(바뀌면 `node tools/build-browser-resources.mjs`).

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
- 탄환형 스킬(관리자 제보): `char_bullet_bar` 받침 `#e56d00` α.31 위에 남은 탄환마다 칸. 칸은 코드(UIBulletBar)가 만들어
  프리팹에 색이 없다 — [추정] 캡처 측정: 색 ≈ `#ffa800`(G 168 일치), 간격 2단위(7발: 16~17px 칸 2px 간격, 19발: 약 4.5px 칸 같은 간격). 칸이 1px보다 좁아지면 남은 비율 한 줄.
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

**장비 바 (정비 중)**: 관리자 제보(캡처). `shop_hud`의 `equip_bg`(74×30, shop_hud 안 (13, 29.4) —
칩 오른쪽, × 1.25)와 칸 `equip_0`/`equip_1`(23×6, ±12.8 / 13): 아이템마다 흰 알약(`equip_normal_icon`), [추정] 금색 아이템이면 빛나는 금색 알약(`equip_gold_icon` 31×14,
제 크기). 이 바가 그려지면 예전 아이템 아이콘(item pips)은 숨긴다(캡처에 아이콘 없음). 그림은 로컬 추출(`extract.py --only ui/battlecommon`)만 있어서
없는 서버는 예전 아이콘 그대로. 금색 여부는 `render/app.js`의 `setItems` 옆 `setEquip` 한 줄씩(2곳)이 넘긴다. 장비 바 그림은 git 밖 로컬 소재(`public/assets/local/ui/battlecommon`)다.

**② 적 HP** (`EnemyBars`; 처음엔 맞기 전 숨김 — `_alwaysShowHp`는 圣堂剑士만 켜짐 — 보스는 늘 보임):
- 일반·정예: `enemy_hp_slider` 105×7 `#ea4700` α.7, 흰 α.7 잔상, `sprite_bg` 받침 8 × 8.55 크게(`enemy_slider_background`; 위 그림자 설명), `hud_unit` 아래 55.3(캡처 ≈110px).
- 보스(거대 패널이 아닌 보스 — 铳·卢西恩 등): `enemy_boss_hp_slider` 130×9 `#ea2727` α.85, `hud_unit` 아래 43, `sprite_bg` 받침 10×8 크게
  (처음엔 딱딱한 사각형이라 테두리로 보였다 — 관리자 캡처 14로 그림자 받침임을 확인); 문양 `sprite_enemy_boss_hud_small`(57×65, 바 중심 7 아래)이 바 뒤에;
  SP(`enemy_boss_sp_slider` 130×6 `#ebc9ff` α.7, 받침 10×7 크게)는 HP 바로 아래 [추정 위치] — SP 있는 보스만.
- 거대 보스(관리자 제보): 보스 프리팹에 `_bossHudScale`이 있는 적(`EnemyGiantBoss`)은 `battle/[pack]common.ab`의
  `panel_enemy_boss_info`를 쓴다 — HP 798×10 × x 배율(胄·管·阿利斯泰尔·萨米的意志 0.35, 昆图斯 0.765; 관 캡처 ≈281 × 9.3단위 ✓) `#ff2b2b` α.8,
  흰 α.7 잔상, 검정 α.39 딱딱한 받침(800×12 — 캡처 14의 SP 바 둘레 검은 테가 이것)과 흰 α.39 테(`sprite_enemy_boss_hp_bg` 9-slice 816×28: 회색 가운데 위아래에
  어두운 선; 테두리도 가로 배율로 눌림), SP(`default_sp_slider` 798×8 `#cab2d4` α.8, 받침 800×12, 테 816×24)는 HP 중심 16.3 아래 [캡처 8], 문양 `sprite_enemy_boss_hud_large` 폭 ≈39단위([캡처 8·10]),
  맞을 때 빛(`hit_effect` = `sprite_bar_glow` 9-slice 818×31 `#ff0000` α.78 — 관리자 결정, 0.35초 사라짐 [추정]). 중심 = 보스 발 [추정 — 배치는 네이티브 코드,
  캡처에서 발 근처], `_bossHudOffset`만큼 타일 단위로 옮김 [추정 단위](萨米的意志 위 1.4, 昆图斯 위 1.02, 管 II 오른쪽 1.4). 표는 `GIANT_BOSS`(적 프리팹 전수 조사).
- 圣堂剑士 탄약: HP 바 바로 아래 같은 폭에 아군과 같은 탄환 칸([추정] `enemy_bullet_bar` 105×7).
- **보스 SP 바와 관·현의 공식 SP** (관리자 결정 2026-10-07 「공식과 같은 a안」): 공식은 쿨다운이 아니라 SP다(`enemy_database` spData: 管 INCREASE_WITH_TIME
  0/50 +1/s, 裂管之奏 spCost 50·cooldown 50·initCooldown 40; PRTS 「技力 0/50 自动回复 1.0 SP/s」; 阿利斯泰尔 maxSp 25; 胄·萨米的意志·昆图斯·铳·卢西恩은 spData 없음
  → SP 바 없음). 시뮬레이션 `content/bosses.js skillSp`: SP는 행동할 수 있을 때(기절 아님) 초당 increment, 스킬은 쿨다운이 끝나고 **SP ≥ 비용**일 때 발동
  [추정: 둘 다 필요 — 클라 로직은 네이티브], 발동하면 비용만큼 소모. 管 첫 발동 40초 → 50초(테스트). 같은 구조의 弦(엘리트, spData 0/35, 断弦之奏 25·icd 12)도
  같은 규칙(첫 발동 12초 → 25초). 阿利斯泰尔은 원래 SP를 세고 있어 값만 노출. 막대는 `b.snap.bsp`(`local-hud.js hudLists` — `ammo`와 한 번에 돈다).
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
상태 → 프리팹은 이름으로 맞춤(클라 매핑은 네이티브, 메타데이터 `COMMON_EFFECT_PREFIX`) [추정]:
晕眩 `buff_stun`(머리) · 冻结 `buff_autochess_frozen`(발, 얼음 덩어리) · 寒冷 `buff_cold`(머리 눈꽃 — 冻结 중에도) · 沉睡 `buff_sleep`(몸) · 沉默 `buff_silence`(머리) ·
恐惧 `common_buff_fear` · 战栗 `common_buff_thrill`(머리 주먹 — 캡처 10; 예전엔 공포 아이콘으로 잘못 연결) · 缴械 `common_disarm_icon` · 减速 `buff_slowdown`(발) ·
迟缓 `buff_sluggish`(발) · 攻速下降 `buff_attack_speed_reduction_01`(발) · 虚弱 `buff_weak` · 防御下降 `buff_defdown` · 法抗下降 `buff_magic_resistance_down` ·
脆弱(4종) `buff_ fragile_01`(발; 클라 버프 `weak[limit]`인 脆弱은 자기 `buff_weak[limit]`(머리) — docs/rules/fx.md 「`weak[limit]`의 이펙트」) · 浮空 `common_levitate_01`(바닥) · 적 隐匿 `common_invisible`(발; 그 ColorModifier대로 모델 회색 .5·α .894 — 예전 45 % 반투명 대신) ·
아군 隐匿 `common_stealth` [추정] · 迷彩 `common_buff_micai_01`(몸) [추정: 세 변형 중 _01].
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
  `finish`로 뽑는다(루트 이펙트 구성 요소의 raw float #5): buff_stun·buff_autochess_frozen·buff_sleep·buff_silence·buff_sluggish·common_buff_fear·
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
    `room.create`·`join`·`spectate`·`queue`·`queueRoom`·`queueAccept`와 판 시작(`room.start`, 재투표 새 판, 매칭 완성)은 `ERR.NEW_VERSION`(「새 버전이 나왔습니다. 페이지를 새로고침해 주세요」).
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
  흐린 글자로 이유(「정산 없음」 중도 퇴장 · 「요약만」 최신 30판 밖)(관리자 결정 2026-10-13). PLAYING.md는 우리 §12 「反馈问题」가 있어 통계가 **§13**. 서버가 끝낸 판은 기록하지 않는다(「본판 정보 다시 뽑기」도 이 규칙).
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

## upstream 0.2.3 이식 — UI (2026-10-11)
- 대화 상자 안 복사(`8a8db0eb`, GitHub #433): 클립보드 API가 없을 때(LAN) 쓰는 textarea 대체 경로가 모달 포커스 가두기 안에서 선택을 잃어
  「복사됨」인데 실제로는 안 되던 것 → textarea를 열린 모달·안내 안에 두고, 포커스와 전체 선택을 확인한 뒤에만 복사, 성공·실패 모두 정리하고 포커스를
  돌려준다. 실패하면 원래의 손 복사 화면. 브라우저 테스트 `test/ui/modal.e2e.test.js`(SP_E2E) [실제 판 이상 없음 2026-10-28].
- 렌더러를 못 불러온 토스트 문구(`708caf7d`): `sim.md` 「upstream 0.2.3 이식」.
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
  「作战结束，等待队友完成作战」 글은 숨기고 진행 목록만 둔다). 54 높이 알약(`img_bg` 색 입힘, 안쪽 여백 30, 아이콘 32 + 글 18, 폭 410~690), 화면 아래에서 47.7,
  상점이 펼쳐져 있으면 172 위(`battle_bottom_tips_shop_show`). KR 문구는 관리자 KR 캡처(넘침만 우리 번역).
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
  때)에 맹약 줄 가운데. upstream의 툴팁 「层数叠加已禁用」은 그대로.
- 왼쪽 플레이어 카드 상태(`player_status_item`, `has-hud-card`): 탈락 = `mask_dead`(#565656 80 % + `icon_dead`), 나감(`status` 'left') = `mask_quit`(#303030 80 % +
  `icon_lost_connect`), 연결 끊김(`connected` false) = `mask_reconnect`(#303030 80 % + `icon_reconnect` — 예전에는 끊김에 `icon_lost_connect`를 잘못 씀), 내가 보고 있는 팀원
  카드 오른쪽 위 `icon_observing`(upstream 눈 표시 대신), 카드 오른쪽 아래 밖 `icon_complete`(준비·완료 — 준비도 공식처럼 체크) 또는 `icon_doing` 점 셋(깜빡임
  [추정]), 「前往查看」 / 「返回战场」은 초상 위 공식 사각 버튼(`btn_ob_other` / `btn_return_self` 98×98). 점 셋은 전투(联防 포함)가 아직 진행 중인 플레이어에게만
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
  (`main.js serverLost`). 그림이 없으면 예전처럼 로비 + 토스트.
- 혼자 판 이어하기 창(공식 클라 `EventOnShowSingleResumeDialog` → `tab_single_resume_dialog`, `_GetSingleResumeDialogTabInput`: 확인 버튼 하나,
  `AUTO_CHESS_BATTLE_SINGLE_RESUME_DIALOG`, 확인 → `ReqResumeSingleMode`): 판 화면이 이미 진행 중인 혼자 판으로 열릴 때(새로고침·새 탭; INFO_CHECK·BAND_DRAFT·
  BATTLE_CHECK·RESULT 제외, `battleArt.js soloResumeDue`) 같은 창에 「存在进行中的模拟，是否继续？」 KR 「진행 중인 시뮬레이션이 있습니다. 이어서
  진행하시겠습니까?」(우리 번역). 전투 중이면 창이 떠 있는 동안 일시정지(`g.pause`, 일시정지 화면은 창 뒤에 안 띄움)하고 확인하면 이어 감. 서버 규칙은 그대로
  (끊긴 동안 혼자 판은 예전처럼 서버가 이어 감 — 공식은 멈춰 둠 [추정 차이]); 휴식은 시간 제한이 없어 창만.
- 핑 판(`panel_ping`, `AutoChessBattleUIPingPanel`): 위 왼쪽 나가기 버튼 옆 `img_delay_bkg` 76×24, 글 흰색(best fit 1–16 → 12.5 [추정]) — constData
  `pingConds` 원문 「当前延迟<@ping.low>{0}</>ms」, KR 클라 「PING {0}ms」, EN 「Current ping: {0}ms」, 숫자 색 `gamedata_const` richTextStyles
  `ping.low/medium/high` #7fa826 / #ec7a00 / #ff3d3d(1 / 60 / 200 ms 기준). 그림이 없으면 upstream 알약.
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
  (60 칸, 색 #031712), 꺼진 맹약(뽑힌 집합 D·모드가 끄는 맹약)은 회색 `img_bond_banned_bkg` + 회색 문양(#c9c9c9) + 금지 표시 `img_bond_banned`(38, 원판 가운데에서
  (29, 32)), 이름은 가운데 50 아래 19 크기 #f4f4f4 60 %. 예전 upstream 원판(SVG 단계 고리·✕·빨간 결장 인원 배지)은 뺐다 — 인원은 툴팁(`briefingBondTip`)과
  아래 맹약별 목록에 있다. 그림은 로컬 클라 추출물 `ui/outer`, 없으면 CSS 원.
- 제목 줄(`perm_bond_title` / `temp_bond_title` / `chess_banned_title`): 바 그림 `img_group_title_perm_bond` / `img_group_title`(가로 반복)과 아이콘
  `img_title_icon_perm_bond` / `_temp_bond` / `_chess`. 결장 수는 제목 바로 뒤(바 그림 오른쪽 로고와 겹치지 않게).
- 결장 오퍼레이터는 **맹약별**(`prefab_auto_chess_stage_info_chess_banned_group`): 왼쪽 꺼진 맹약(110 × 130, 문양 45), 구분선 `img_bond_banned_split`, 그 맹약의
  결장 오퍼레이터(130 칸, 7 간격). 오퍼레이터 그림(`matchInfo.js ChessIcon`, 전략 선택의 선발 프리셋 칸과 판 안 「시뮬레이션 정보」 탭도 같은 것)은 공식 `auto_chess_outer_common_chess`(이 항목이 불러오는
  `AutoChessCommonChessView`)와 `chess_banned_item` 값대로: 그림 90, 그 뒤 흰 카드 `img_chess_bkg`(색 변경 없음, 109 × 107 = 카드 96 × 95 + 오른쪽·아래 옅은 그림자, 그림 왼쪽 위에서 2.5 밖),
  단계 그림 35가 그림 왼쪽 아래 모서리에서 9.1씩 밖으로, 결석이면 30 % 회색 `img_chess_banned_mask`(94 × 95)가 그림과 카드를 덮고 `img_chess_banned`(73, 그림 가운데에서 (33, 32))의
  빨간 삼각형(34)이 카드 오른쪽 위 모서리에 닿는다(관리자 요청 2026-10-13, 공식 화면 대조). 공식 클라 근거: `AutoChessStageInfoGroupViewModel._LoadBondDataFromIdRange`가
  `bannedBondList`의 맹약마다 `AutoChessStageInfoChessGroupModel`을 만들고, `LoadData`가 그 맹약 멤버 중 `CalculateBannedChessIdList`에 든 것을 넣는다 →
  두 맹약이 다 꺼진 오퍼레이터는 두 묶음에 다 나온다. `_RefreshChess`는 멤버 수가 0이어도 묶음을 넣고, 6명마다 줄을 나눈다(두 번째 줄부터 맹약 칸 없음 — 우리는
  가로 폭에 맞춰 감싼다). 묶음 순서는 핵심 줄 → 부가 줄 순(클라 `CompareTo`의 정확한 키는 안 읽음 [추정]).
- 모드가 끄는 맹약(표준의 10개)은 결장 오퍼레이터가 있을 때만 묶음을 만든다 [추정]: 클라 `bannedBondList`에 모드 비활성 맹약이 들어가는지 안 읽었다.
  뽑힌 맹약(D)은 비어도 묶음을 만든다(위 `_RefreshChess`).
- 공식 제목·안내 문구는 프리팹에 없고(실행 중 문구표 키로 채움) 클라 문구표도 없어 예전 우리 문구(核心盟约 / 附加盟约 / 本局禁用干员)를 그대로 쓴다.
  `perm/temp_bond_title`의 `text_tip`(`hasBondBanned`일 때 뜨는 안내) 내용은 모른다 — 대신 범례 한 줄.
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
- 2026-10-15부터 큐는 **난이도 × 규칙 모드**(관리자 결정: 판 사람들의 규칙이 같아야 하므로, 이 파일 「규칙 모드 — 클래식·캐주얼」): `room.queue { difficulty, ruleset? }`(없으면 클래식), 방 항목은 방의 규칙 모드 큐에 들어가고 매칭 중에는 규칙 모드를 못 바꾼다(`ERR.MATCHING`), 새로 만드는 방은 큐의 규칙 모드. `room.queueState`·`room.matchFound`에 `ruleset`. 로비의 모든 박사(판 중이 아닌)에게 `lobby.queueCounts { counts: { [규칙 모드]: { [난이도]: 사람 수 } } }`(대기 중 항목만, 수락 중인 그룹 제외; 바뀔 때만, 최대 1초에 한 번 `countsMinGapMs`; 접속(hello)·판이 끝나 돌아올 때 한 번). 로비 「규칙」 스위치의 클래식 / 캐주얼 옆에 그 규칙의 대기 인원 합, 「연합 매칭」의 난이도 카드마다 「n명 매칭 중」, 협동 방 방장의 「빈자리 매칭」 버튼에도 그 방의 난이도 × 규칙 모드 큐 대기 인원 배지(숫자만, 툴팁은 그대로; 관리자 요청 2026-10-15 — 방에 있는 박사도 판 중이 아니면 `lobby.queueCounts`를 받음)(관리자 결정 2026-10-15: 규칙 모드 × 난이도로 보임; 같은 날 관리자 요청으로 앞의 「박사」를 뺌). 로비 대기 인원은 Windows Chrome 확인 2026-10-15(데스크톱·휴대폰 가로), 실제 사람 4명이 규칙 모드별로 모이는 것은 [화면 미확인].
- 관리자 결정(2026-10-13): ① 큐는 **난이도별**로 나눈다. ② **항상 사람 4명이 모여야 시작**한다(처음 결정 「오래 기다리면 AI로 채워 시작 / 2명 이상이면 시작 중 고름」은 같은 날 철회: 60초가 큐에 들어간 때부터 세어져 사람마다 다르게 보였다). ③ 4명이 모이면 **수락 단계**를 둔다. ④ **협동 방의 빈자리를 랜덤 매칭으로 채운다**(처음엔 보류했다가 같은 날 요청): 아는 사람과 방을 만든 뒤 방장이 별도 버튼으로 큐에 넣는다.
- 서버 `server/matchmaking.js` `Matchmaker`(규칙 전체는 파일 머리말, `server/lobby.js`가 메시지와 접속·방 이벤트를 넘김):
  - 큐 항목은 혼자 들어온 사람 또는 방 하나. `room.queue { difficulty }`로 혼자 들어간다. 로비 방에 있으면 방을 떠나고(`room.create`와 같음), 판 중이면 `ROOM_STARTED`. 다른 난이도로 다시 보내면 그 큐 맨 뒤로 옮긴다.
  - `room.queueRoom {}`: 협동 로비 방(사람 1~3명)의 방장이 방의 사람들을 방 난이도 큐에 한 항목으로 넣는다. 시작과 같은 조건(다른 사람 모두 연결·준비, 아니면 `NOT_READY`). 방의 AI 자리는 비운다(매칭은 사람으로만 채움; 관리자 결정 2026-10-13). 큐에 있는 동안(`room.state.matching`) 그 방 참가(`room.join`)·난이도 변경·AI 추가·시작은 `ERR.MATCHING`(관전은 됨). 방에서 사람이 나가면(나가기·내보내기·로비 유예·재접속 창 만료) 항목이 취소된다(남은 사람에게 `changed`, 나간 사람 이름 `by`).
  - `room.unqueue`로 나간다. 방 항목은 방의 누구든 취소할 수 있고 방 전체가 빠진다(관리자 결정 2026-10-13: 방장만 취소하게 하면 빠지려는 사람이 방을 나가야 해서). 누른 사람은 `left`, 나머지는 `party`와 누른 사람 이름 `by`(같은 결정: 누가 취소했는지 보여 줌). 큐가 바뀔 때마다 대기자 모두에게 `room.queueState { queued, difficulty, count, waitedMs, party }`(`count` = 그 난이도에서 기다리는 사람 수), 빠질 때는 `{ queued: false, reason, by? }`(`left`·`declined`·`timeout`·`offline`·`restarting`·`full`·`room`·`party`·`partyDeclined`·`partyTimeout`·`changed`).
  - 그룹은 언제나 사람 4명. 큐 순서대로 보며 사람 수 합이 정확히 4가 되는 항목들을 고른다(앞 항목 우선, 크기가 안 맞는 항목은 건너뛸 뿐 빼지 않음: 3명 방 → 2명 방 → 혼자 1명이면 3명 방 + 혼자가 묶이고 2명 방은 계속 기다림). 연결이 끊긴 사람이 있는 항목은 건너뛴다.
  - 그룹이 생기면 사람마다 `room.matchFound { players, accepted, mine, inMs }`, `room.queueAccept { accept }`를 `queueConfirmMs`(15초) 안에. 모두 수락하면 준비 확인 없이 바로 판을 시작한다: 그룹에 방이 있으면 가장 먼저 들어온 방에서(그 방 사람은 자리 그대로, 나머지는 빈자리에 큐 순서대로, 다른 대기 방의 사람은 그 방을 떠나 빈 방은 닫힘, 방장 유지), 없으면 새 협동 방에서(큐 순서대로 앉고 첫 사람이 방장). 거절하거나 시간 안에 답하지 않은 사람의 항목은 큐에서 빠지고(방이면 방 전체: 거절이면 나머지 방 사람에게 `partyDeclined`와 거절한 사람 이름, 시간 초과면 수락했던 사람에게 `partyTimeout`), 다른 항목은 원래 순서·대기 시간 그대로 큐 앞으로 돌아간다.
  - 혼자 대기 중 연결이 끊기면 그룹에 넣지 않고 `queueGraceMs`(10초) 뒤 큐에서 뺀다. 그 안에 다시 붙으면 자리를 지키고 상태를 다시 받는다. 재접속 창이 끝나면 바로 뺀다. 초대 링크 등으로 방에 들어간 사람은 그룹을 만들 때 뺀다(`room`). 대기 방의 끊긴 사람은 방의 로비 유예(60초)가 정리한다(유예가 끝나 빠지면 항목 취소).
  - 한 네트워크의 혼자 대기자는 `maxQueuedPerAddr`(4)까지(인터넷 접속만, `ERR.RATE`; 방 항목은 방 개수 제한이 이미 있음). 8인 대기열에 들어갈 때는 그 두 배(8)까지 — 한 네트워크에서 8명이 다 올 수 있게(관리자 결정 2026-10-19; 세는 것은 모든 대기열 합). 배포 카운트다운의 마지막 5분에는 큐 등록과 매칭 시작을 막는다(`ERR.RESTARTING`, 완성된 그룹은 `restarting`으로 해산). 큐는 메모리에만 있어 서버 재시작 때 사라진다. 배포 카운트다운을 건너뛰는 기준(방 단위)에는 혼자 대기자가 들어가지 않는다.
- 로비 진입(2026-10-13, 관리자 요청 「열려 있는 다른 포크 서버의 UI를 따라」, 그 서버 화면 캡처 기준): 방식 카드가 셋 — 단독 시뮬레이션 · 연합 시뮬레이션 · **연합 매칭**(同盟匹配, ALLIANCE MATCHMAKING, 신호 막대 아이콘). 문구 「혼자 공개 매칭에 들어가 다른 박사들과 동맹을 맺은 뒤 시뮬레이션을 시작합니다.」, 요점 「혼자 참가 · 팀원 자동 매칭」 「사람만 매칭 · 4명이 모이면 시작」(그 서버의 「仅匹配真人 · 满四人后开始」; 결정 ②를 바꾸기 전에는 「오래 기다리면 AI 보충 선택」이었다). 이 카드를 고르면 오른쪽 큰 버튼이 「매칭 시작」이 된다(처음 구현의 별도 버튼은 오른쪽 칸이 길어져 스크롤이 생겨 뺐다).
- 접속자 수(같은 요청): 핑 오른쪽에 「👥 N 접속」(`components.js OnlinePill`, 로비; 타이틀에서는 2026-10-13에 뺐다 — 「휴대폰 화면 조정」의 연결 줄 항목). 서버 `pong`의 `n` = 지금 소켓이 붙어 있는 세션 수(`server/net.js onlineCount`, 1초에 한 번만 셈) — 타이틀·로비·방·판·관전 모두 포함, 끊겨서 재접속을 기다리는 세션은 뺀다. 핑(4초마다)과 같이 갱신.
- 클라이언트 `public/js/ui/matchQueue.js`: 로비의 「연합 매칭」 카드 + 「매칭 시작」(선택한 난이도). 혼자 대기 창은 기다린 시간·대기 인원(`n/4`)·「박사 4명이 모이면 시작합니다」·취소. 그룹이 생기면 수락 창(카운트다운, 사람 수, 수락 수, 수락·거절) — 로비와 방 화면 둘 다. 판의 `room.state`가 오면 닫히고 평소 방·판 화면으로, 새 서버 세션의 welcome이면 지운다. 큐에서 빠진 이유는 토스트(직접 나가거나 거절한 경우는 없음; `party` 「{이름} 박사가 매칭을 취소했습니다」, `partyDeclined` 「{이름} 박사가 수락을 거절해 매칭이 취소되었습니다」, `partyTimeout` 「동맹의 박사가 시간 안에 수락하지 않아 매칭이 취소되었습니다」, `changed` 「{이름} 박사가 동맹을 떠나 매칭이 취소되었습니다」; `by`가 없으면 이름 없는 문구), 그룹이 해산돼 큐로 돌아오면 「수락하지 않은 박사가 있어 매칭을 계속합니다」.
- 방 화면 `public/js/screens/room.js`: 협동 방 방장(사람 4명 미만)에게 「빈자리 매칭」(신호 아이콘; 다른 박사가 준비 전이면 비활성, 툴팁 「랜덤 매칭으로 박사를 찾아 빈자리를 채웁니다(AI 팀원은 빠집니다)」). 그 사이 「오퍼레이터 설정」과 위아래로 겹쳐 놓는다(셋을 나란히 두면 1600×900에서 오른쪽 칸이 넘쳐 가운데 상태 줄을 덮었다). 이 두 단 묶음이 있으면 「시뮬레이션 시작」은 묶음 높이로 늘어 위아래 끝이 맞는다(관리자 요청 2026-10-15; `.room-bar__right--stack`, 두 단 1.08rem = 0.5 × 2 + 간격). 매칭 중에는 아래 줄 상태가 「빈자리 매칭 중 · m:ss · 대기 중인 박사: n/4」, 큰 버튼이 모두에게 「매칭 취소」, 빈자리 카드는 「랜덤 매칭 중」, 난이도는 읽기 전용(「매칭 중에는 바꿀 수 없음」), AI 추가 버튼은 숨김.
- 서버 부하: 큐 자체는 무시할 만하다. 매칭 판에는 AI가 없다.
- 확인: `test/lobby-matchmaking.test.js`(실제 서버·StubMatch: 4명 매칭·수락·시작, 난이도 분리·나가기·난이도 이동, 거절 뒤 재편성, 3명은 그룹이 안 됨, 방 큐 조건(방장·준비·AI 자리 비움·잠금·단독 방 거절), 2명 방 + 혼자 2명 → 그 방에서 시작, 3명 방이 2명 방을 건너뛰고 혼자 1명과 묶임, 2명 방 둘 → 먼저 방에서 시작·다른 방 닫힘, 방 취소(`left`·`party`)·사람이 나가 취소(`changed`), 방 사람 거절, 방에서 큐로·판 중 거절, 수락 시간 초과, 끊김 유예·재접속).
  Chrome(로컬 서버, 2026-10-13 처음 구현): 로비 버튼, 대기 창, 수락 창, 휴대폰 가로 대기 창·취소, 카드 셋·접속 수. 결정 ②·④ 반영 뒤(같은 날, Windows Chrome 1600×900·1280×720·휴대폰 가로 844×390): 2명 방(AI 1) → 준비 전 「빈자리 매칭」 비활성 → 「빈자리 매칭」 → AI 자리 비움·방장·팀원 아래 줄 매칭 상태·「매칭 취소」 → 로비에서 혼자 2명 큐 → 방 화면 수락 창 → 넷 수락 → 그 방(같은 코드, 방장 그대로)에서 판 시작, 휴대폰 가로 방 화면 버튼·매칭 상태·취소(가로 스크롤 없음), 카드 「사람만 매칭 · 4명이 모이면 시작」. 이름 표시 뒤: 3명 방에서 팀원이 취소 → 방장 토스트 「친구B 박사가 매칭을 취소했습니다」(누른 사람은 토스트 없음), 다시 큐 → 한 명이 나감 → 「친구C 박사가 동맹을 떠나 매칭이 취소되었습니다」. 실제 사람 넷의 판은 [관리자 화면 미확인].

## 로비 업데이트 소식 (2026-10-13, 관리자 결정)
- 공식 게임과 무관한 이 서버의 기능이다. 관리자가 넣을 곳 세 가지를 화면 시안으로 비교했다(작전 팁 칸의 탭 · 상단 왼쪽 버튼 · 「01 시뮬레이션 방식」 제목 줄의 한 줄 소식). 고른 것은 **작전 팁 칸의 탭**이다. 로비 아래에 카드를 따로 두면 로비가 길어진다(휴대폰 가로 844×390은 지금 스크롤 없이 딱 맞음). 타이틀과 로비 상단에는 두지 않는다.
- 원문은 `CHANGELOG.md` 하나다. 서버가 `GET /changelog.json`(`server/http/changelog.js`, `routes.js`)으로 1.0.0 이상 판만 내준다. 0.x는 원본의 중국어 기록이라 뺀다. 파일이 바뀌면(mtime) 다시 읽고, 파일이 없으면 빈 목록을 준다. Docker 이미지에 `CHANGELOG.md`를 복사한다(`Dockerfile`). 쓰는 Markdown은 `## 버전 — 날짜`·`### 묶음`·`- 항목`(들여쓴 줄은 이어짐)·문단, 그리고 `**굵게**`·`` `코드` ``다. 링크는 글자만 남긴다.
- 작전 팁 칸(`screens/lobby.js TipsPanel`, `public/js/ui/patchNotes.js`)에는 「작전 팁 | 업데이트」 탭이 있다. 탭은 외곽선 없는 ghost 버튼이라 호버하면 다른 버튼처럼 모서리 브래킷이 나오고(관리자 요청), 고른 탭은 민트 글자에 옅은 바탕이다. 업데이트 탭은 최신 판을 한 줄씩 넘겨 보여 준다(관리자 결정 2026-10-13, 시안 비교 뒤): 첫 장은 `v버전 · 월-일 · 첫 문단 첫 문장`, 다음 장부터 항목마다 `[묶음 이름] **굵은 제목**: 첫 줄 …`(한 줄 말줄임, 칸 높이 고정). 작전 팁과 같은 `01/15 < >`가 있고, 8초마다 다음 장으로 넘어간다. 작전 팁(5초)보다 느린 것은 항목이 팁보다 길어서다. 마우스가 칸 위에 있거나 「업데이트 소식」 창이 열려 있으면 멈추고, `< >`를 한 번 누르면 그 뒤로는 자동으로 넘기지 않는다. 오른쪽 끝에는 늘 「전체 보기 ›」가 있다. 「전체 보기」를 누르면 「업데이트 소식」 창(PATCH NOTES)이 열린다. 판마다 `<details>`를 두고, 최신 판은 펼치고 이전 판은 접는다. 창 안에서만 스크롤된다.
- 새 판이 나온 뒤 처음 로비에 들어오면 업데이트 탭이 열려 있고 「NEW」 표시가 붙는다. 본 판은 브라우저 설정 `patchNotesSeen`에 저장한다. 다음 방문부터는 작전 팁이 열린다. 기록이 없는 새 플레이어에게도 한 번은 그렇게 보인다. 따로 뜨는 창은 없다(배포 뒤 자동 새로 고침마다 방해가 되므로).
- 휴대폰 가로(높이 460px 이하)에서는 원래 작전 팁 칸을 숨겼다. 업데이트 소식이 있으면 칸을 줄여(여백·한 줄 말줄임) 동맹 참가 아래에 둔다(`devices.css`). `/changelog.json`을 받지 못하면 탭이 없고 예전 그대로다(휴대폰에서도 숨김).
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
| `battlefieldInfo` 브리핑 전장 카드(이름·전장 수·미리보기 그림) | 「미확인 전장」 카드 | 보임 | `public/js/screens/briefing.js` | 공식 정보 화면 입력 `AutoChessStageInfoGroupViewModel.Input`에 전장 값이 없다(actId·bossId·enemyTypes·bannedBondList·trainingBondList·modeId — 공식 클라) |
| `infoReroll` 브리핑 「다시 뽑기」 투표 | 없음(서버가 거부, 버튼 없음) | 있음 | `server/match/match/phases.js voteReroll` | 공식 브리핑에는 准备就绪뿐(이 파일 「본판 정보 다시 뽑기」) |
| `bossRoutePreview` 보스 경로 미리보기 | 없음(서버가 경로를 보내지 않음) | 있음 | `server/match/match/views.js nextEnemiesFor` | 공식에 없는 편의 기능(`render.md` 「보스 경로 미리보기」) |
| `bossHitClamp` 리더 피해 상한 완화(限伤放宽) | 없음(30만 이상 한 방은 통째로 무효) | 있음(30만 이상 한 방은 300,000으로 들어감) | `server/sim/damage.js leaderHitLimit` ← 전투 spec `flags.bossHitClamp` | 공식 限伤(`sim.md` 「캐주얼 규칙 모드의 리더 피해 상한 완화」, `docs/research/11-limits-official.md` §2); 절삭은 공식에 없음 |

- 관리자 결정(2026-10-15): 이름은 클래식 / 캐주얼, 보스 경로 미리보기도 캐주얼 쪽, 처음 기본값은 클래식이고 그 뒤로는 로비에서 마지막에 고른 값을 기억, 공개 매칭은 규칙 모드별로 나눔, 통계는 규칙 모드별로 나누고 이 기능 전의 판 기록은 캐주얼로 셈.
- 브리핑 전장 카드(관리자 결정 2026-10-15, 시안 비교 뒤): 카드를 빼면 왼쪽 열이 비어 보여서, 같은 자리에 **「미확인 전장」** 카드를 둔다 — 제목 줄은 전장 이름 대신 「미확인 전장」(전장 수 문구 없음), 그림 자리에는 줄무늬 어두운 상자와 보스 칸의 「?」와 같은 주황 「?」, 그 아래 「전투가 시작되면 공개됩니다」. 두 모드의 화면 틀이 같다. 비교한 다른 안(결장 오퍼레이터 묶음을 왼쪽 열로 옮겨 공식 순서 적 → 결장 → 핵심 → 부가를 따르기)은 결장이 많은 판에서 왼쪽만 길어지고 오른쪽 아래가 비어 고르지 않았다. 처음 요청한 「공식의 미클리어 스테이지 맵 미리보기」는 없다: 공식 스테이지 정보 패널(`StagePreviewInfoBasicPanel` `_LoadStagePreviewMap`)은 클리어 여부와 상관없이 같은 미리보기를 불러온다.
- 방(`server/lobby.js`): `room.create { ruleset? }`(없으면 클래식), 방장이 판 전에 `room.setRuleset { preset }`로 바꾼다(매칭 중이면 `ERR.MATCHING`, 바꾸면 다른 박사의 준비가 풀림 — 난이도와 같음). `room.state.ruleset = { preset, options }`, 판은 `opts.ruleset`로 받아 `m.public.ruleset`에 싣는다. 다시 뽑기로 새로 시작한 판도 방의 규칙 모드를 그대로 쓴다.
- 리더 피해 상한 완화: 캐주얼이면 보스전 spec의 `flags`에 `bossHitClamp`이 붙고(`shared/ruleset.js simRuleFlags`, 공식 값과 다를 때만), 브라우저 전투와 서버 검증이 같은 spec을 읽는다. 클래식 보스전의 spec은 예전과 같아 골든이 움직이지 않는다.
- 통계(관리자 결정 2026-10-15, `public/js/ui/stats.js`·`screens/stats.js`): 기록마다 `ruleset`(그 판의 `m.public.ruleset` 프리셋)을 남기고(봉투 v2, 저장 예산 85만 자로 — 실제 크기 협동 판 1000개에서 900개 넘게 남게), 통계 페이지 왼쪽 위 「규칙」 스위치(열 때 로비의 현재 값)로 모든 탭이 그 규칙 모드의 기록만 센다. 이 기능 전의 기록(v1 또는 필드 없음)은 캐주얼(`LEGACY_RULESET`: 그때 다시 뽑기와 전장 미리보기가 있었음). 내보내기·가져오기·비우기는 여전히 모든 기록. `test/ui/stats.test.js`. Windows Chrome 확인 2026-10-15(v1 기록이 캐주얼 탭에).
- 로비(`public/js/screens/lobby.js`, `public/js/ui/ruleset.js`): 「시뮬레이션 난이도」 제목 줄 오른쪽 끝에 「규칙」 스위치(클래식 / 캐주얼, 툴팁 같음; 제목 아래 따로 한 줄을 두었더니 데스크톱 모든 크기에서 로비가 약 14px 넘쳐 스크롤이 생겨 제목 줄로 올림, 관리자 요청 2026-10-15) — 방 만들기·단독 시뮬레이션·연합 매칭 모두 이 값으로, `lobby.ruleset`에 기억(처음은 클래식). 매칭 큐와 대기 인원은 「랜덤 매칭」 절.
- 스위치 툴팁(로비·방 같음, `public/js/ui/ruleset.js rulesetTips`; 관리자 요청 2026-10-15): 프리셋마다 한 줄 「[클래식] 공식 규칙과 같음」 · 「[캐주얼] 전장 정보, 다시 뽑기, 이동형 리더 적 경로 미리보기, 리더 적 대미지 상한 완화 사용」 — 줄 안에는 콜론을 쓰지 않는다(예전 「캐주얼: 켜짐: …」은 콜론이 겹쳐 「꺼짐」이 다른 규칙처럼 읽혔다). 그 아래 옵션 표의 `note`가 있는 옵션마다 각주 한 줄 「※ 리더 적 대미지 상한 완화 — 리더 적에게 한 번에 300,000 이상 들어가는 공격은 공식 규칙에선 통째로 무효가 되지만, 완화하면 300,000으로 계산됩니다」(이 상한을 모르는 플레이어가 많아서; 수치는 `BOSS_HIT_LIMIT`). 「이동형」은 걸어 다니는 리더의 경로라는 뜻(관리자 요청 2026-10-15).
- 방 화면(`public/js/screens/room.js`): 아래 줄 난이도 밑에 「규칙」 선택(클래식 / 캐주얼, 방장만, 매칭 중 잠김; 툴팁이 프리셋마다 공식과 다른 옵션을 나열), 위 제목의 난이도 옆에 규칙 모드 표. 아래 줄 왼쪽 옵션 칸은 가장 넓은 줄 폭에 맞추고 모든 줄이 그 폭을 채운다(관리자 요청 2026-10-15): 난이도 넷이 같은 폭으로 나누고, 그 아래 줄은 「규칙」 | 「AI 팀원은 마지막에 선택」 반반(단독 방은 규칙이 한 줄 전체) — 2026-10-18부터는 규칙 스위치가 그 줄 전체이고 AI 팀원 선택은 가운데 준비 완료 수 아래(아래 「규칙 모드 — 커스텀」). 방장 아닌 박사의 「생성자가 설정」은 AI 팀원 버튼 옆 글자에서 툴팁 둘째 줄로 옮겼다(반 칸에서 버튼이 두 줄로 눌렸다).
- 확인: `test/ruleset.test.js`(표·프리셋), `test/lobby-ruleset.test.js`(방), `test/match/ruleset-match.test.js`(실제 판: `m.public.ruleset`, 캐주얼에서 999층 炎 보드의 30만 이상 타격이 300,000으로 리더와 공유 풀에 들어감), `test/match/info-reroll.test.js`(클래식은 투표 거부), `test/match/boss-path.test.js`(클래식은 경로 없음), `test/lobby-matchmaking-ruleset.test.js`(규칙 모드별 큐·방 항목·새 방의 규칙 모드·`lobby.queueCounts`). 화면: Windows Chrome 2026-10-15 — 로비 규칙 스위치·대기 인원, 방 아래 줄 선택·제목 표시·툴팁, 클래식 / 캐주얼 솔로 브리핑(「미확인 전장」·다시 뽑기 없음 / 전장 그림·다시 뽑기), 통계 규칙 탭, 1600×900과 휴대폰 가로 844×390(가로 넘침 없음).

## 규칙 모드 — 커스텀 (2026-10-18, 관리자 결정)
- 규칙 스위치의 세 번째 **커스텀**(自定义): 방장이 항목마다 정한다. 공개 매칭에서는 쓸 수 없다 — 서버가 `room.queue`의 커스텀을 `BAD_MSG`로(`shared/ruleset.js QUEUE_PRESETS` = 클래식·캐주얼), 커스텀 방의 `room.queueRoom`(빈자리 매칭)을 `BAD_TARGET`으로 거부한다. 단독 시뮬레이션과 코드로 만드는 대기실에서만 고른다. 공식 게임에는 없다.
- 설정(`shared/ruleset.js CUSTOM_OFFICIAL`, 기본은 모두 공식 값; `sanitizeCustom`이 숫자를 범위에 맞추고 모르는 값·키를 버리며 id 목록을 정렬): **맹약** — 무작위 금지 수(핵심 0–3·보조 0–4, 공식 범위; 비우면 난이도 값), 999중첩 상한 해제, 맹약별 무작위 / 금지 / 허용(금지는 공식 결석 방식: 그 맹약만 가진 오퍼레이터만 상점·선발에서 빠지고, 다른 맹약을 같이 가진 오퍼레이터로는 여전히 발동 — `server/match/pool.js drawDisabledBonds`와 같음). **적 능력치** — 일반 적(특훈 적·호위·부속 포함) 체력·공격력·방어력·마법 저항·이동 속도, 리더 적(최종 공세·히든 코어의 리더 적과 소환물) 체력(공유 풀에 곱함)·공격력·방어력·마법 저항, 각 10–1000%(마법 저항은 곱해도 100을 넘지 않음), 상승 곡선 공식 / 완만 / 가파름 / 평탄. **리더 적** — 최종 공세 리더 7·히든 코어 리더 3 금지(묶음마다 1명은 남김, 나머지는 공식 가중치), 대미지 상한 무효(공식) / 상한으로 계산 / 제한 없음, 값 100,000–5,000,000(제목에 「限伤」 한자는 쓰지 않음). **전장** — 전장 정보 미리 보기, 브리핑 「다시 뽑기」, 「상반기 전장 포함」(`stages.firstHalf`, 기본 끔: `CUSTOM_FIRST_HALF_STAGES` = 战场#06 沙尘暴/土石结构를 전장 #01과 같은 가중치로 풀에 넣음 — 공식 act1 표에서 #01–#04·#06이 같은 60 [ASSUMED: 두 시즌을 섞어 뽑은 적은 없음]; 끄면 그 전장 금지도 지움; 기믹은 `sim.md` 「战场#06(上半) 沙尘暴 · 土石结构」), 전장 풀 금지(1곳은 남김; 상반기 #05·#07은 기믹을 구현하기 전이라 목록에 없음, #06은 스위치를 켤 때만). **진행** — 라운드 수 6–20, 휴식 기간 공식 / ×1.5 / ×2 / 고정 초(연합만: 단독은 공식대로 시간 제한 없음), 목표 HP 라운드당 감소 상한 해제·모든 라운드 공유(연합만), 이동형 리더 경로 미리 보기, 상점 풀(`pool`, 아래 「판 흐름」) — 오퍼레이터 풀·장비 재고 각 10–1000%.
- **판이 읽는 것**: 모든 설정. 캐주얼 편의 기능 넷(전장 정보 미리 보기 → `battlefieldInfo`, 다시 뽑기 → `infoReroll`, 이동형 리더 경로 → `bossRoutePreview`, 대미지 상한 「상한으로 계산」 → `bossHitClamp`, `optionsOfCustom`), 판 흐름 설정(아래 「판 흐름」), 전투 설정(아래 「전투」). 설정 창의 「다음 업데이트에서 적용」 표는 전투 설정까지 들어가면서 없앴다.
- 판 흐름(`server/match/gamedata.js`: `Match`가 커스텀 설정을 `GameData`에 넘기고 접근자가 적용; 설정이 없으면 모든 접근자가 공식 값이라 클래식·캐주얼 판은 그대로):
  - 맹약(`server/match/pool.js drawDisabledBonds`): 「금지」 맹약은 매 판 결석 목록에 들어가고(공식 결석 방식), 「허용」 맹약은 뽑히지 않으며, 무작위 금지 수(`gd.bans`, 비우면 난이도 값)는 「무작위」로 둔 맹약에서만 뽑는다 — 금지 맹약은 그 수에 더해진다. 공식과 같은 목록을 같은 rng로 섞고 앞에서부터 조건에 맞는 것을 고르므로 rng 흐름이 공식과 같다. 결석 맹약이 늘어 상점이 마르는 것을 막는 최소 조건은 없다(공식 추첨과 같음). AI와 전략 선택은 공식처럼 모드의 꺼진 맹약만 본다(결석 맹약은 꺼지지 않으므로).
  - 리더 적·전장(`gd.bossWeights`, `server/match/waves.js setupMatchWaves`, `shared/ruleset.js keepUnbanned`): 금지한 것을 가중치 목록에서 빼고 한 번 뽑는다(뽑는 횟수가 같아 그 뒤 추첨이 그대로). 묶음(최종 공세 리더 · 히든 코어 리더 · 전장 풀)마다 모두 금지된 코드라면 금지를 무시하고 공식 목록.
  - 라운드 수(`customRoundPlan` → `gd.plan`, `gd.srcRound(r)`): 라운드마다 원래 라운드(`src`)를 정하고, 라운드 키 표는 모두 그 라운드로 읽는다 — config `rounds[r]`(웨이브 템플릿·전투 제한 시간·휴식 기간·리더 레벨 시간), 수입, 결정 라운드의 기변 일정(`choices.js generateDraft`), 15칸 적 일정의 그 라운드 뽑기(`waves.js roundPick`, 상·하반기 적 풀 포함), 적 배율(`gd.baseEnemyScale`: 원래 라운드 항목에 계획의 체력·공격 배율 — 추가 라운드·뒤로 밀린 최종 공세·히든 코어는 계획대로 오른 값). `gd.lastRound`·`bossRound`(= 라운드 수)·`hiddenRound`(+1)·`spRounds()`(계획의 결정 라운드)가 바뀐다. 전략·주둔 효과의 「n라운드에」·「n라운드마다」는 실제 라운드 번호로 읽는다 [ASSUMED]. `m.public.srcRound`(계획이 있을 때)로 클라의 타이머 게이지가 원래 라운드의 config를 읽고, 최종 공세 라운드 표시(브리핑·적 정보·리더 예고)는 `m.public.bossRound`를 따른다.
  - 휴식 기간(`gd.prepTime`, `customPrepSeconds`): 연합에서 공식 초 × 1.5 / × 2(반올림) 또는 고정 초; 단독 시뮬레이션과 사람이 한 명뿐인 방은 공식대로 시간 제한 없음. `m.public.prepSeconds`가 게이지 길이.
  - 목표 HP 감소 상한 해제(`gd.lpCapPerRound` = Infinity, 연합만): 정산(`settle.js`)·진행 중 −n 표시(`views.js pendingLp`)·연합 방어가 상한 없이 센다. 클라는 `public/js/ui/hud.js matchLpCap`으로 같은 값을 쓰고, 툴팁에서 「라운드당 최대 n」을 뺀다.
  - 상점 풀(관리자 결정 2026-10-20: 오퍼레이터·장비를 하나씩 고르지 않고 풀 크기만 늘리거나 줄임; `gd.poolCopies`·`gd.itemPoolCopies`, `shared/ruleset.js customPoolCount`): 그 판 인원의 공식 수량 — 오퍼레이터는 단독 표(티어별 12/14/18/16/8/5와 오퍼레이터별 예외) × 연합 2 · 8인 연합 4, 장비 재고는 티어별 4/6/7/8/7/3과 예외 × 8인 연합 2 — 에 오퍼레이터 풀 % · 장비 재고 %를 곱해 반올림하고, 공식 수량이 1 이상이면 1 아래로 내려가지 않는다. 같은 설정이 단독·4인·8인에 그대로 맞는다(배율은 인원이 정하고 %는 그 위에). 선발 오퍼레이터의 개인 재고도 오퍼레이터 풀 %를 따른다(`player/diy.js`가 `gd.poolCopies`를 읽음 — 공용 풀과 같은 비율이라 상점에서 선발 오퍼레이터가 나오는 몫이 그대로). 상점 장비가 아닌 효과 전용 장비는 계속 재고 없음. 풀에 드는 오퍼레이터(맹약 결석 규칙)와 추첨 순서는 그대로라 rng 흐름이 공식과 같다. 풀이 작으면 공식처럼 이미 보인 카드·보상·합성이 재고를 넘겨 가져간다(`pool.js` `overdraw`). 설정 창은 「진행」 탭의 「상점 풀」 묶음: 두 %와, 그 방(로비에서는 고른 모드·인원) 기준 티어별 공식 · 커스텀 수량 표 [화면 미확인].
  - 목표 HP 공유(`gd.lpShared`, 연합만): 전략을 모두 고른 뒤(`phases.js enterBattleCheck`) 최종 공세와 같은 방식으로 살아 있는 박사의 목표 HP를 하나로 합친다(`m.teamLp`, 각자의 시작 값은 `lpStart`). 정산은 각자의 감소량(상한·연합 방어 규칙 그대로)을 모두 연합 목표 HP에서 빼고, 각자의 `lp`는 그 몫으로 다시 쓴다(`_syncTeamLp`, 최종 공세와 같음 — AI가 읽는 자기 목표 HP는 연합 값 × 자기 몫, 시작 값이 같으면 ÷ 인원). 혼자 탈락하지 않고, 0이 되면 모두 그 라운드에 탈락한다. 중도 퇴장은 `연합 목표 HP × 그 사람 시작 값 ÷ (아직 남은 사람들의 시작 값 합)`(반올림)을 빼고 — 다른 사람이 남아 있으면 1은 남긴다 [ASSUMED] — 공식 최종 공세는 퇴장해도 풀을 그대로 둔다. 최종 공세는 그 몫들을 다시 합친다(합 = 연합 값). 화면: 위 목표 HP 탑이 연합 값(팀 색)과 자기 전투의 −n, 팀 목록의 줄마다 그 사람의 몫과 −n.
- 전투(`server/match/gamedata.js`·`shared/ruleset.js simRuleFlags`; 설정이 공식 값이면 배율 객체와 전투 spec이 클래식과 같아 골든이 움직이지 않는다):
  - 적 능력치(`gd.enemyScale(r)`): 그 라운드의 공식 배율(`gd.baseEnemyScale`, 라운드 수 계획 포함)의 체력·공격을 상승 곡선으로 바꾸고(`curveScale`, 1라운드 배율 기준; 이동 속도는 곡선에 넣지 않음) 일반 적 %를 곱한다. 방어력·마법 저항은 100%가 아닐 때만 `defMul`·`resMul`로 스폰 배율에 실린다(`waves.js roundMods`) — 마법 저항은 유닛 능력치에서 원래대로 100에서 잘린다(`server/sim/units.js`). 일반 전투·현상금 적·연합 방어로 넘어간 적·최종 공세의 부속·호위가 모두 이 배율이다. AI 판단(`bot.js`)도 같은 값을 읽는다.
  - 리더 적(`gd.leaderScale(r)`, 리더 적 %; 일반 적 %는 닿지 않음): 리더 본체는 공격·방어·마법 저항(`waves.js leaderMods`; 체력은 공식대로 라운드 배율을 받지 않고 공유 풀), 이동 속도는 라운드 값 그대로. 공유 풀은 `bloodPoint × 인원 몫 × 리더 체력 %`(`gd.bossHpMul`, `finalAssault.bossPoolHp`·`GameData.bossPoolHp` 둘 다). 리더의 전투 중 소환물은 보스전 spec의 `flags.enemyScale`(이제 `gd.leaderScale`)로 체력·공격·방어·마법 저항을 받는다(`server/sim/content/bosses.js summonMods`) — 공식에서 소환물이 라운드 배율을 받는 것과 같은 자리에 리더 적 %를 얹은 것 [ASSUMED: 설정 묶음은 관리자 결정, 소환물의 묶음은 그 결정의 「리더 적과 그 소환물」].
  - 대미지 상한(`server/sim/damage.js leaderHitLimit`, `shared/constants.js bossHitLimitOf`): 커스텀 값이 300,000과 다르면 보스전 spec의 `flags.bossHitLimit`에 그 값, 「제한 없음」이면 `bossHitLimit: 0`(상한 없음; spec이 JSON으로 브라우저에 가므로 Infinity 대신 0). 「무효」는 그 값 이상인 한 방을 통째로 무효, 「상한으로 계산」은 `bossHitClamp`과 함께 그 값으로 계산.
  - 중첩 상한 해제(`flags.noLayerCap`, `gd.layerCap` = Infinity, `shared/constants.js layerCapOf`·`layerGainRoom(before, n, cap)`): 휴식 기간 쪽 증가(`player/economy.js`), 정산(`settle.js`), 정산 전 표시(`bondsMeta.bondsWithGains`), 연합 방어 도우미 순서(`unite.js`), 전투 중 실시간 사본(`sim/battle/economy.js`), 클라 결과 검사(`fields.js`, spec의 플래그로), 검사기(`invariants.js`), 클라 맹약 줄(`public/js/ui/watchBonds.js layerCapOfView`)이 모두 같은 상한을 쓴다. 10·100중첩마다 주는 보상(예견·기적 등)은 999를 넘어도 계속 나온다(관리자 결정에서 받아들임).
  - 규칙 플래그(`simRuleFlags`: `bossHitClamp`·`bossHitLimit`·`noLayerCap`, 공식 값과 다른 것만)는 이제 판이 만드는 모든 전투에 붙는다 — 일반(`combat.js`)·연합 방어(`unitePhase.js`)·보스전(`bossRounds.js`)·능력치 미리 보기(`intents.js`). 리더 경로 미리 보기(`bossPath.js`)는 전장별로 캐시하는 경로 계산이라 붙이지 않는다(상한과 무관).
- 라운드 수(관리자 결정): 줄이면 적 능력치 단계가 다른 남은 라운드와 같은 중반 일반 라운드부터 뺀다(결정 라운드·1라운드·최종 공세는 남김). 늘리면 1 … (마지막 − 1)라운드는 공식 그대로, 그 앞 후반 웨이브 셋(극한 연합 11–13)을 돌려 쓰는 추가 라운드를 최종 공세 앞에 붙이고, 추가 라운드의 능력치 단계는 그 세 라운드의 기울기로 이어서 오른다(최종 공세·히든 코어도 그만큼) [ASSUMED]. `customRoundPlan`이 이 표를 만들고 설정 창의 라운드 띠·휴식 기간 표가 쓴다. 곡선은 실제 판이 쓰는 공식 배율(config.json `enemyScale`의 `hp`·`atk`) 위에서: 1라운드 배율 × (그 라운드 공식 배율 ÷ 1라운드 배율)^거듭제곱 — 완만 0.75, 가파름 1.25, 평탄 0(`curveScale`) [ASSUMED]. 처음 0.5 / 1.5는 차이가 너무 커서 같은 날 관리자 의견으로 줄였다(극한 연합 14라운드 공식 4.30배 → 완만 3.13배, 가파름 5.92배). 설정 창 그래프도 이 배율을 그린다(처음엔 `1.2^단계`로 그려 단독·초월에서 실제와 달랐다). 커스텀 선이 공식 선과 같을 때(곡선 공식·체력 100%·공식 라운드 수)는 공식 점선만 그린다(관리자 요청 2026-10-18).
- 전달: `room.create { ruleset: 'custom', custom }`·`room.setRuleset { preset: 'custom', custom }`(평범한 객체, JSON 4096자 이하 — `shared/protocol.js isCustomWire`), `room.state.ruleset = { preset, options, custom }`, 판은 `opts.ruleset`·`m.public.ruleset`에 그대로. 정리한 뒤 같은 설정이면 아무것도 바뀌지 않고, 하나라도 다르면 다른 박사의 준비가 풀린다(`sameRuleset`). 드레인 넘기기(`Lobby.roomSnapshot`)는 `{ preset, custom }`을 적고, 프리셋 이름만 적힌 예전 파일도 읽는다.
- 로비(`public/js/screens/lobby.js`): 스위치의 커스텀 오른쪽 ⚙가 설정 창을 열고, 「이 규칙으로 적용」이 로비 설정(브라우저 저장)을 바꾸며 커스텀을 고른다. 커스텀을 고르면 스위치 옆에 쓰는 프리셋 이름과 「공식과 다른 항목 n개」(난이도 기본값과 같은 값은 셈에서 뺌). 연합 매칭 모드에서는 커스텀이 🔒로 잠기고 툴팁 맨 위에 이유가 나오며, 매칭은 마지막에 고른 클래식 / 캐주얼로 한다(`lobby.queueRuleset`).
- 대기실(`public/js/screens/room.js`): 방장의 ⚙는 방 설정(방이 커스텀이 아니면 로비 설정)을 열고 적용하면 `room.setRuleset`; 방장이 아닌 박사는 커스텀 방에서만 ⚙가 보이고 보기 전용 창(방장이 바꾸면 따라 바뀜)에 「내 프리셋으로 저장」. 아래 줄은 시안 비교 뒤 관리자가 고른 배치: 규칙 스위치(클래식·캐주얼·커스텀 ⚙)가 난이도 아래 줄 전체를 같은 폭으로 나눠 쓰고, 「AI 팀원은 마지막에 선택」은 가운데 준비 완료 수 바로 아래. 커스텀 방의 「빈자리 매칭」은 꺼지고 툴팁에 이유. 제목 옆 규칙 표시는 보라색 「커스텀」.
- 설정 창(`public/js/ui/customRules.js`): 탭 다섯(맹약 · 적 능력치 · 리더 적 · 전장 · 진행, 탭마다 공식과 다른 항목 수), 위에 프리셋 줄(프리셋 선택 · 저장 · 새 프리셋 · 이름 · 삭제, 공식과 다른 항목 수와 「저장 안 됨」, 코드 복사 · 코드 붙여넣기), 아래 「캐주얼 값으로」 · 「공식 값으로」 · 취소 · 「이 규칙으로 적용」. 그 난이도에 없는 리더·전장과 그 난이도에서 꺼진 맹약은 흐리게, 단독 방에서는 휴식 기간·목표 HP가 잠긴다. 휴대폰 가로에서는 제목을 빼고 프리셋 버튼을 아이콘만으로. 창을 연 화면을 떠나면 창도 닫힌다.
- 프리셋(관리자 결정: 브라우저 저장 + 공유 코드, 서버·계정 저장 없음; `public/js/ui/customRulesStore.js`): localStorage `sp.pref.customRules = { v, presets: [{ id, name, rules }], active, draft }`(최대 30개, 이름 24자; 읽을 때 모든 설정을 `sanitizeCustom`), `draft` = 로비가 방 만들기·단독에 쓰는 마지막 적용 설정. 공유 코드는 `SPC1.` + 공식과 다른 설정만 담은 JSON을 deflate-raw로 줄인 base64url(대개 100자 안팎; CompressionStream이 없으면 `SPC1j.` 비압축), 붙여 넣은 코드도 `sanitizeCustom`을 거치고, 더 새 버전의 코드는 읽되 경고한다.
- 통계(관리자 결정: 커스텀 판은 별도 탭): 기록은 `ruleset: 'custom'`으로 남고 통계 페이지의 규칙 스위치에 커스텀 탭이 생긴다(⚙ 없음).
- 판 화면(`public/js/ui/customSummary.js`): 브리핑 오른쪽 열 맨 위, 전략 선택의 「본 판 정보」 창(둘 다 `ui/matchInfo.js MatchInfo`), 게임 중 「본 판 정보」 탭(`ui/enemyDrawer.js`, 작은 판)에 「커스텀 규칙」 묶음 — 공식과 다른 설정을 묶음마다 한 줄씩 값과 함께(예: 「일반 적: 체력 150% · 공격력 120%」, 「적 능력치 상승 곡선: 가파름」, 「항상 금지 맹약: 염국」, 「금지 최종 공세 리더 적 「가상적: 갑주」 「가상적: 총」」·「금지 히든 코어 리더 적 「가상적: 관」」(가상적 셋은 두 묶음에 같은 이름으로 있어 묶음마다 따로), 「리더 적 대미지 상한: 제한 없음」(설정 창과 같은 말)·「…: 500,000 (상한으로 계산)」·「…: 1,000,000」, 「라운드 수 10」), 설정 창 탭 순서. 칩을 짧게 두려고 공식 값은 적지 않는다(관리자 요청 2026-10-18; 리더 적 이름에는 「：」가 들어 있어 이름마다 「」로 묶고 제목 뒤 콜론을 뺌). 맹약·리더 적·전장은 이름으로, 난이도 기본값과 같은 금지 수·라운드 수는 빼고, 단독 판에서는 연합 전용(휴식 기간·목표 HP)을 뺀다. 모두 공식 값이면 「공식 규칙과 같음」. 맹약별 결석은 아래 맹약 줄의 회색 표시로도 보인다. 전장 정보 미리 보기가 켜진 판의 브리핑 전장 카드 「전장 무작위 (총 n개)」는 커스텀 전장 금지 뒤 남은 수(서버 추첨과 같은 `keepUnbanned`; 하나만 남으면 「전장 고정」, 관리자 요청 2026-10-18). 브리핑·전략 선택의 위 머리줄 난이도 옆에 규칙 표시(캐주얼·커스텀; 클래식은 예전처럼 없음).
- 용어(관리자 요청 2026-10-18): 화면 문구의 领袖는 모두 「리더 적」(KR 공식 용어) — 「리더」만 쓰던 한국어 문구(알 수 없는 리더 적·리더 적 대미지·리더 적 HP·리더 적 전장·히든 코어 리더 적·이동형 리더 적 경로 미리보기·리더 적 대미지 상한(완화)·브리핑 다시 뽑기 설명·지도 범례)를 고쳤다. 限伤은 「대미지 상한」으로 통일(캐주얼 툴팁의 「피해 상한 완화」도). 적 이름의 组长·队长(「유령 리더」 등)은 다른 말이라 그대로.
- 확인: `test/ruleset.test.js`(설정 정리·옵션·`customDiffs`·`sameRuleset`·라운드 표·곡선), `test/lobby-ruleset.test.js`(커스텀 방: 설정 전달·준비 풀림·판 opts·빈자리 매칭 거부·드레인 넘기기), `test/match/ruleset-match.test.js`(실제 판: `m.public.ruleset.custom`, 다시 뽑기가 설정을 따름, 적 능력치 설정은 추첨을 바꾸지 않음), `test/match/custom-battle.test.js`(모든 설정이 공식 값이면 모든 모드·라운드의 적·리더 배율과 공유 풀이 클래식과 같음, % × 곡선, 보스 웨이브의 리더·부속 배율, 실제 판 경로의 일반 전투에서 스폰된 적 능력치와 마법 저항 100 상한, 실제 보스 필드의 상한 값·제한 없음·상한으로 계산, 중첩 999 넘김: 휴식 기간·정산·전투 실시간 사본·판의 모든 전투 spec), `test/match/custom-flow.test.js`(실제 판: 모든 설정이 공식 값이면 추첨·라운드·타이머가 클래식과 같음, 맹약 금지·허용·금지 수, 리더 적·전장 금지와 모두 금지일 때, 6·20라운드의 원래 라운드 표와 끝까지 돈 판의 검사기 위반 0, 휴식 기간, 감소 상한 해제, 목표 HP 공유·전원 탈락·퇴장 몫, 8라운드 공유 판 전체), `test/match/custom-pool.test.js`(상점 풀: 단독·4인·8인 GameData의 모든 오퍼레이터·상점 장비 수량, 100%는 공식과 같음, 실제 판 경로의 공용 풀·장비 재고 수량과 공식과 같은 추첨, 선발 오퍼레이터 재고, 10% 풀로 끝까지 돈 연합 판의 오류·검사기 위반 0), `test/ui/custom-rules.test.js`(프리셋 저장소·공유 코드·화면 연결), `test/ui/custom-summary.test.js`(판 화면의 요약: 줄·값·이름, 난이도 기본값, 단독, 실제 판 경로의 `m.public`), `test/ui/stats.test.js`(커스텀 기록). 골든(`test/golden/matches.json`): `custom-coop2-HARD-11-flow`(연합 9라운드, 맹약·리더 적·전장 금지, 목표 HP 공유·감소 상한 해제, 휴식 ×1.5 — 8라운드에 연합 목표 HP가 바닥나 모두 탈락)·`custom-solo-ABYSS-12-battle-boosted`(단독 16라운드, 적·리더 적 %·가파른 곡선, 대미지 상한 없음, 중첩 상한 해제 + 첫 휴식에 맹약마다 1200중첩 — 히든 코어까지 깸); 클래식·캐주얼 시나리오는 그대로. 화면: Windows Chrome 2026-10-18 — 로비 스위치·⚙·요약, 설정 창 다섯 탭(1920×1080, 휴대폰 가로 844×390), 대기실 아래 줄(1920·1280), 손님의 보기 전용 창, 연합 매칭 모드의 잠금 툴팁; 판 화면의 요약 — 단독 커스텀 브리핑(1920×1080, 휴대폰 가로 844×390, 13줄), 연합 커스텀 브리핑·전략 선택의 「본 판 정보」 창·게임 중 「본 판 정보」 탭(1600×900, 6줄), 캐주얼 브리핑의 머리줄 표시(요약 없음); 가로 넘침·페이지 오류 없음.

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

## 8인 협동 모드 화면 (관리자 결정 2026-10-16·2026-10-19, 공식에 없는 기능)

규칙·수치는 `sim.md` 「8인 협동 모드」. 공식 화면은 4명까지라 아래 배치는 모두 **[추정]**이고, 클라우드에서 짜서 화면 확인을 못 했다
(**[화면 미확인]** 전부 — 로컬 Windows Chrome에서 1920×1080·1280×720·휴대폰 가로로 볼 것).

- **로비**: 「01 시뮬레이션 방식」 제목 줄 오른쪽 끝에 「인원 4인 | 8인」 스위치(02 줄의 「규칙」과 같은 모양·자리, `lobby.size`에 기억; 툴팁에 8인
  규칙 요약; 관리자 결정 2026-10-19 — 처음의 카드 아래 줄은 「방 참가」를 밀어 옮김, 카드 안 안과 비교 시안을 보고 고름). 단독 시뮬레이션에서는 고를 것이
  없어 스위치를 감추되 자리는 남김(`visibility: hidden`, 관리자 결정 2026-10-23; 처음에는 4인에 잠그고 8인에 자물쇠) — 줄 높이가 늘 같아 두 열의 카드가 같은 높이에서 시작.
  8을 고르면 `room.create`·`room.queue`에 `size: 8`(`screens/lobby.js sizeFields`, 단독은 없음), 카드 문구가 8명 기준(「다른 박사 7명과…」「박사 8명이
  모두 앉으면 시작 · AI 팀원 없음」「사람만 매칭 · 8명이 모이면 시작」), 만들기 안내 「만든 뒤 친구를 초대해 8석을 모두 채우세요」. 매칭에서는 스위치 옆에
  크기별 대기 인원(고른 규칙의 합), 규칙 스위치·난이도 카드의 대기 인원은 고른 크기의 대기열(`lobby.queueCounts` `counts8` → store `ui.queueCounts8`).
  커스텀 요약·설정 창은 8인 공식 밴과 비교(2026-10-22부터 4인과 같은 난이도별 표). 규칙 모드 셋은 크기와 따로 고름(매칭은 클래식·캐주얼).
- **대기 창**(`ui/matchQueue.js`): 8인 대기열의 메시지는 `size: 8`(store `ui.queue.size`), 창 제목에 「8인 연합」, 「대기 중인 박사: n/8」 「박사 8명이
  모이면 시작합니다」.
- **방**(`screens/room.js`): 8석을 4석씩 두 줄(`.seats--8`: 카드 높이 반, 초상·글자 축소), 제목 옆 「8인 연합」 태그. AI 추가 단추·「AI 팀원 마지막
  선택」 없음, 빈자리는 「빈자리」. 8명이 다 앉기 전 방장의 「시뮬레이션 시작」은 잠기고 상태 줄·툴팁 「8인 연합은 박사 8명이 모두 앉아야 시작할 수
  있습니다」(서버 `SEATS_OPEN`과 같은 문구). 「빈자리 매칭」은 준비 조건만 보고(빈자리가 있어야 하므로) 8인 대기열 인원을 배지로, 매칭 중 상태 줄
  「대기 중인 박사: n/8」.
- **본판**:
  - 왼쪽 플레이어 목록: 5명 이상이면 `is-8` — 공식 그림 모양은 단위(`--u`)를 0.6배로 줄여 초상 48·간격 10(8줄이 위 줄과 상점 줄 사이에 들어감),
    기본 모양은 초상 0.44rem·간격 0.05rem.
  - 좌석 색: 5–8번 좌석에 장미·라임·파랑·주홍(`components.js SEAT_HUES`, 앞 넷은 그대로). 결산 그래프 색: 기본 넷 + 보라 다음에 라임 `#a3e635`·분홍
    `#e88fd0`(기본 넷·보라와 OKLab ΔE ≥ 15), 밝은 회색이 마지막 — 진영 없이 8명이 다 다른 색(`gameLogic/resultCharts.js`).
  - 전략 선택 순서 열: 5명 이상이면 줄을 줄임(초상 0.42rem, 칸 넘치면 열이 스크롤).
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
  표는 `shared/protocol.js LOADOUT_DEFAULT_DEVIATIONS`(일반 chess id 기준), `loadoutOptions`가 읽는다 — 구성 화면의 「기본」 표시, 저장 때 기본과 같은
  항목 버리기(`checkLoadout`), 경기의 전투 입력(`resolveLoadout`: 따로 고르지 않은 플레이어와 AI 팀원)이 모두 이 기본을 따른다.
- `data/chess.json`(`skill`·`module`·`stats`)과 키트의 기본 스펙은 공식 그대로다: sim은 고른 스킬·모듈을 명시적으로 받고, 공식 기본(그라벨 S2·모듈,
  스와이어 디 엘리건트 위트 S2)은 고를 수 있는 선택으로 남는다. 데이터의 기본을 바꾸지 않은 까닭: 키트는 데이터 기본 스킬을 `skill`, 나머지를
  `skills` 맵으로 쓰고, 소환물 표(`tokens.json`)도 기본 스킬이 만드는 소환물에서 시작한다(스와이어 디 엘리건트 위트 S2의 香槟炸弹).
- 이미 저장된 구성 중 그라벨 S2+모듈·스와이어 디 엘리건트 위트 S2는 예전엔 기본이라 저장되지 않았으므로, 이제 새 기본(S1)으로 열린다.
- 테스트 `test/ui/loadout.test.js` 「LOADOUT_DEFAULT_DEVIATIONS」, `test/match/loadout.test.js`, `test/sim/loadout.test.js`(로비 기본 = 기록 기본, 이 표만 예외).

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

## 전투 중 팀원 전장 보기 (2026-10-25, 관리자 결정 「편의 기능으로 지금 시즌에도 적용」)

- 공식 지금 시즌은 자기 일반 전투(各自行动)가 도는 동안 팀원을 못 본다(「当前无法查看」, `docs/research/09-ux-official.md` §6.3). 새 시즌
  위수협의(CN 업데이트 방송에서 소개)는 자기 전투 중에도 다른 전장을 본다 — 공식 지금 시즌과 다르지만 편의 기능으로 모든 시즌에 먼저 켠다.
  팀원 행 → 「前往查看」 → 그 전장의 표시 사본, 「返回战场」/자기 행으로 돌아온다. 联防·最终攻势의 규칙(다른 조 보스 필드는 못 봄, ‹ › 절반 전환)은
  그대로.
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
    `m.roundDmg { round, units: [[uid, dmg], …] }`(자기 전투만, 대미지 순). 플레이어에 남겨(`ps.roundDmg`) 다시 연결·재동기화 때 다시 보낸다
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

## 알뜰살뜰 인형 효과 아이콘 하나 (2026-10-25, 관리자 결정)

- 관리자 요청 2026-10-25: 알뜰살뜰 인형(精打细算玩偶, 장착하면 사라지고 라운드 시작마다 자금 +1, 정예 +2)을 쓴 만큼 오른쪽 효과 줄에 아이콘이
  하나씩 쌓였다 — 하나만 보이고, 툴팁에 실제로 라운드마다 받는 자금을 보여 달라.
- 서버의 효과는 그대로 인형마다 하나(`server/match/builtinMeta.js gain_coin_when_round_start`, 게임 동작 변화 없음). 보이는 목록
  (`server/match/player/views.js effectsView`)만 `effect:builtin_round_coin` 효과들을 첫 인형 자리의 한 항목으로 합치고 `roundFunds`(합한
  라운드당 자금)·`stack`(쓴 개수)을 싣는다. 툴팁(`public/js/ui/effectsList.js`)은 아이템 설명 대신 「每回合开始时额外获得 {n} 资金」과, 둘 이상이면
  「已使用 {n} 个」. 아이콘에 숫자 배지는 달지 않는다(배지는 다른 효과에서 남은 횟수라 헷갈림). 효과 줄은 10개까지라 인형이 다른 효과를 밀어내던
  것도 없어진다.
- 시험: `test/content/items.test.js` 「精打细算玩偶 used three times」(일반 둘 + 정예 하나 → 한 항목, `roundFunds` 4 = 다음 라운드 시작에 실제로 받은 자금).
