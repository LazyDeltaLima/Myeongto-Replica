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

## 정비 화면 HUD (2026-10-06)
상점과 같은 방식(관리자 요청: 정비 화면 나머지도 실제 게임과 같게). 근거는 EN 클라이언트 `[uc]autochessbattle.ab`의 `autochess_hud_panel`,
`autochess_hud_bond_item`, `panel_prep_ready`와 관리자 스크린샷(한국 서버). 그림은 모두 웹 소재(`hudPanel/*`, `hudBondItem/*`, `prepReady/*`,
`bondBoardIcon/*`)라 모든 플레이어에게 같다. 크기 단위는 클라이언트 값(아래 「크기 단위」): 1단위 = 1920×1080 기준 1.5px(`--u` .015rem).
- 라운드 띠: 판(`bg_board`)·양 끝 원·장식 상자·장식 글자, 그 뒤 어두운 띠(프리팹의 `frame_left` 옆판 — 스크린샷의 어두운 띠를 CSS로),
  가운데 단계 알약(`bg_rest`/`bg_battle`/`bg_coop` + `frame_mid_normal`, 글자 17px #40b196), 라운드 숫자 `bg_round`(20px #171717), LP 20px #a8a8a8,
  🔍 버튼은 `bg_check_btn` 판 위.
- 맹약 원: 판은 프리팹이 실행 중에 고르는 `_imgBoard` = `bondBoardIcon/<최대단계(최대 4)>_<도달 단계>`, 비활성은 `1_0`(스크린샷과 대조). 최고 단계면
  아이콘이 검정, 아니면 밝은 회색. 숫자(층수) 16px는 `matte_num` 위, 이름 14px. 원본의 "개수/다음 단계" 배지는 공식 원에 없어 숨기고 툴팁에만 둔다.
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
  - 데이터 확인: EN(PC) 클라이언트 `global-metadata.dat` — `StandaloneCanvasScaleHelper`(`NotifySettingChange`, `_SetAllCanvasScale`)의 상수
    `MIN_SCALE_FACTOR` 0.9 · `MAX_SCALE_FACTOR` 1.0 · `DEFAULT_SCALE_FACTOR` 1.0(필드 기본값 표에서 직접 읽음), 설정 키 `UI_SCALER`(SettingManager, SLIDER).
    즉 PC판은 1280×720 캔버스 단위에 **플레이어가 설정하는 UI 배율 0.9~1.0(기본 1.0)**을 곱한다. 적용 방식(2026-10-11 클라 코드): `StandaloneCanvasScaleHelper._SetAllCanvasScale`(RVA 0xDEC3B0)이 설정값을 `UICanvasScalerHandlerSingleton.SetCanvasScaler`(RVA 0x552B5C0)로 넘기고, 캔버스마다 `UICanvasScalerAspects.CalcFactorFloat`(RVA 0x553F260)가 기본 배율 × 그 값 — **모든 캔버스에 같은 배율을 곱한다**(예전 [추정]과 같음). 예외: `OverrideStandaloneCanvasScalerInfo`가 붙은 캔버스는 자기 기준값에 곱한다(어느 캔버스인지는 프리팹, 미확인). `Reset`(RVA 0xDEC330)은 1.0.
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
  (136×105)과 맹약 칸(112×105, 원본 맹약 칩: 개수·同构·本局禁用·팝업), 얇은 파란 체력 막대(555)와 끝의 「生命」+파란 값 상자, 탭 特质 / 技能(+모듈) / 特性 /
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
  아트는 ≈6.7–8.6rem에서 사라짐. 한국 서버 표기: 공격 / 방어 / 마항 / 저지 / 비용(ko 「法抗」→마항, 「费用」→비용), 공격 범위, 체력, 특질 / 스킬 / 특성 / 재능.
  **배치 중에도**(드래그 중·방향 고르는 중, `screens/game.js` 2줄 + `detailArt.js placingDetail`) 같은 카드를 띄우고 아트를 더 투명하게(.55), 포인터는 받지 않는다
  (`.dart-placing`) — KR 캡처대로. 보드 쪽(배치 가능 칸·방향 마름모·범위 미리보기)은 다른 작업.
- 맹약 팝업(2026-10-06 후속, 같은 날 다시 짬 — KR 인게임 캡처 21·22): **클라이언트 `autochess_hud_bond_detail_dialog` 그대로.** 처음의 흰 타일·
  「핵심 맹약」·「활성화 필요 인원」 모양(관리자가 준 이미지 1·6)은 도감 화면 것이라 HUD에서는 쓰지 않는다. 캡처 대조: 맹약 줄 간격 170px = 83단위 →
  패널 602×391단위(프리팹 584×379), 위 ≈135(프리팹 132.5).
  - 패널: 위 가운데 고정, 중심이 화면 위에서 322 → 윗변 132.5, 584×379, `detail_bg`. 머리 104 높이(스크롤해도 고정): 맹약 원판(80×80, `bondBoardIcon` +
    아이콘 36, 중심 왼쪽 위에서 43.4 / 49.2), 이름(24, x 80부터), 인원 알약(중심 61.9 아래, x 81.3: 비활성 = `bond_inactive_bg` 빨강 + `title_char_icon`
    #b6b6b6 + 「n/m」 Novecento 18 + 「비활성화」 #fd6969 16, 활성 = `bond_active_bg` + 아이콘 #00f0b4 + `active_icon` ✓),
    오른쪽 위 「중첩 수 n」(25 왼쪽, 34.5 아래, #d0d0d0 / 흰색).
  - 「n/m」(2026-10-10 클라 코드로 확인): n = 그 맹약 인원(`GarrisonBond.charCnt`), m = **맹약마다 하나뿐인 발동 인원** `activeCount`
    (`AutoChessBondItemModel.LoadData` RVA 0x1FEE850: requireCount = `ActAutoChessBondInfo.activeCount`) — 단계가 여럿인 맹약도 같다(炎 4명 = 「4/3」,
    예전 우리 「4/6」). `AutoChessBattleUIBondDetailView._RenderTitleInfo`(0x1FE32B0)가 활성이면 `AUTO_CHESS_BATTLE_BOND_ACTIVE_CHAR_COUNT_FORMAT`, 아니면
    `…INACTIVE_…`을 `String.Format(fmt, n, m)`로 채움; 문자열(CN `main_text`): 활성 `<color=#25FFCD>{0}</color><color=#B0B0B0>/{1}</color>`, 비활성
    `<color=#F0F0F0>{0}</color><color=#A3A3A3>/{1}</color>` — 두 경우 모두 m을 찍는다(색은 hud-art.css `.bpop__needn`/`.bpop__needm`). 공식 HUD 맹약 줄
    (`AutoChessBattleUIBondItemView`)에는 인원 숫자가 없다(중첩 수·이름만 — 공식 모양에서 `.bslot__count`를 숨기는 것과 같음). 같은 m을 upstream 모양의
    줄·팝업 사실 줄·기물 카드 맹약 칩에도 씀(`gameLogic bondRequireCount`); 단계 진행은 단계 칸·점으로 본다.
  - 스크롤 내용(여백 24 / 20 / 30, 간격 19): 맹약 설명(18, 공식 rich text 색 ba.vup #0098DC, ba.vdown #FF6237, ba.rem #F49800, ba.kw #00B0FF,
    ba.acrem #727272, autochess.gray #777777, autochess.dgreen #40B196 — Kengxxiao zh_CN `gamedata_const`), 원본의 단계 칸·当前效果, 구성원 격자
    (`autochess_hud_bond_char_item`: 칸 88, 한 줄 5, 간격 25.5 × 38, 아바타 76 + `avatar_border` 83, 필드에 있는 구성원은 `avatar_active_border` 92×90,
    나머지는 #3b3b3b 50 % 어둡게 — 회색 처리 없음, 등급 배지 30 왼쪽 아래, 이름 16 아래). 얇은 스크롤바.
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
  - 선택 마름모가 카드를 덮음: `Underframe`이 마름모를 따로 그린다(`.uframe.uframe--dia`, 버튼 없는 층). 공식 모양에서는 z 8로
    카드(z 9) 아래, 撤退·出售 버튼(`.uframe[data-uid]`)은 그대로 z 12. 원본 모양은 둘 다 z 12라 보이는 것은 같다.
  - 채팅 자동 스크롤: 원본 `ChatLog`는 맨 아래에서 24px 넘게 올라가 있으면 새 줄에 따라가지 않는다 → 내가 보낸 줄이면 항상 맨 아래로,
    한 프레임 뒤에 한 번 더(줄바꿈·글꼴이 늦게 잡힐 때). headless에서는 맨 아래에 있을 때 원본도 따라갔으므로 제보 때는 조금 올려 둔 상태였다고 본다 [추정].

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
- 첫 탭(선택) 상태(2026-10-06, KR 캡처 20): `btn_double_check` group_able — 카드 아래쪽에 `bg_doublecheck1`(158×125, 청록, 카드 중심보다 25.5 아래),
  「구매 확인」 22 Heavy #dcfff7(중심보다 62 아래), 아트 어둡게; 살 수 없을 때 group_disable(`bg_doublecheck2` 회색, #e4e4e4). 원본의 「한 번 더 누르기」와
  들어 올림은 남김. 동시에 왼쪽 기물 정보 카드가 그 오퍼레이터(立绘 포함)로 열린다(원본 동작 그대로). 그림 변수는 `hudArt.js`(`--ha-dc1/2`), CSS는
  hud-art.css. ko 「确认购买」 → 「구매 확인」(ui.json이 official.json의 「구매한다」를 덮음).
- 단축키는 원본 그대로(D 승급 · F 동결 · R 갱신): 스크린샷의 G/S/D/A는 그 플레이어가 바꾼 설정일 수 있다(관리자 판단 2026-10-06).
- 갱신 애니메이션(2026-10-09, 관리자 요청 「갱신하면 카드가 아래에서 위로」): 같은 번들의 클립. 카드 프리팹 `autochess_shop_card_item`의 Animation
  `card_item_refresh` = root y −135 → −25.92(4/60초) → 0(14/60초), 접선 0 → 444.3 → 0, `root_layout`의 `card_whole_refresh_normal` =
  `group_slots`(카드 줄, 승급 상자 제외) alpha 0 → 1(0.1초). 60fps Hermite(가중치 1/3)를 구간마다 cubic-bezier로 옮겨 그대로 씀(game-shop.css
  `shop-card-rise`). 공식 계기(클라 코드 `AutoChessBattleShopMainView._RenderUnfoldView`, RVA 0x201B500, 2026-10-10 확인): 서버가 보낸
  `refreshSeq`가 바뀌면 카드마다 `card_item_refresh`를 **동시에**(`AutoChessBattleShopCardView.PlayRefreshAnim` 0x2018760, 지연 없음) 틀고, 줄은
  상품이 특수(`isSpecialRecruit` = 서버 `isSpecialGoods` ≠ NORMAL — `AutoChessBattleShopGoodsType` COMB 1 / BUFF 2)면 `card_whole_refresh_special`,
  아니면 `_normal`. 같은 플래그가 켜져 있으면 刷新·冻结은 「请选择奖励」로 거절된다(`AutoChessBattleUIController._OnShopRefresh` 0x1FD0930) —
  즉 특수 상품 = 골라야 하는 보상 상품. 우리: 수동 갱신(`m.private.shop.refreshes` = `stats.refreshes`, 버튼·R 키 모두 — 전략의 「特殊刷新」
  갱신도 상품은 보통이라 normal) → normal, 보상 제안(`shop.rewardOffer`: 晋升奖励 = COMB, 전략·아이템·특질이 여는 제안 = BUFF)이 새로 상점 줄을
  차지하면 → special(서버 `server/local-patch.js`가 제안마다 번호를 매겨 `shop.rewardOffer.seq`로 보냄; 「稍后」 뒤 다시 펼 때는 같은 번호라 재생
  안 함 — 공식도 접힌 동안 바뀐 것만 펼칠 때 재생). 라운드 시작의 다시 뽑기·상점이 처음 그려질 때는 재생하지 않음: 공식에서 그때 `refreshSeq`가
  바뀌는지는 서버 로직이라 클라에 없다(클라만 보면 첫 펼침에 seq ≠ 0이면 재생하는 쪽) — 우리 동작 유지. 보상 제안 중의 刷新·冻结 거절은 아직 안
  옮김(우리는 「稍后」로 미뤄 두고 상점을 쓸 수 있다).
  - 특수 상품 클립(2026-10-09 관리자 제보로 처음 넣음 — 그때는 전략 「特殊刷新」 수동 갱신에 걸었으나 2026-10-10 위 클라 코드대로 보상 제안으로 옮김):
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
  카드(`card_small_item` 307×271): 판 `card_bg_normal`(종이 겹친 모양), 아이콘 86, 이름 20 흰색, 설명 16 #cecece 80 %. 선택(첫 탭)하면 `card_select_glow`
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
  잃은 LP 없이 완벽 아님 → panel_miss 제목만 — 클라 코드 `AutoChessBattleUIRoundResultDialog.OnRender`(RVA 0x1FECE70, 2026-10-10 확인):
  `_panelPerfect` = `isAllPrefect`, `_panelMiss` = 그 반대, 잃은 HP 글자는 `lostHp > 0`일 때만; 애니·소리는 완벽 → `_allPrefectAnim` + NOREDUCE,
  완벽 아님·`lostHp ≤ 0` → `_perfectAnim`(panel_miss) + NORMAL, 그 밖 → `_missAnim` + REDUCE(우리 소리 짝 `audioOfficial.js`와 같음). 갈림은 누수
  「셈」이 아니라 잃은 HP — **관리자 결정 2026-10-11: 클라대로 「이번 결과에 든 플레이어별 LP 손실」**(클라 코드
  `AutoChessBattleUIViewModel.GetBattleResultStatus` RVA 0x1FD2350: `isAllPrefect` = 모든 플레이어 `hpCost ≤ 0`, `lostHp` = 보고 있는 플레이어의 것).
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
- 위치: 프리팹은 `hud_unit` 중심에서 HP 바 중심이 54.5단위 아래. `hud_unit` 중심 = 발(배치 링 중심, 신발이 서는 곳) 위 24.5단위로 둔다(`HUD_ANCHOR`, [캡처]) —
  처음엔 발 = `hud_unit`로 54.5 아래에 그렸더니 낮았다(관리자 확인 + 캡처 13). 캡처 5 / 6 / 13에서 링 중심 → HP 중심 27 / 29 / 33.7단위 → 약 30단위.
  정비 칩·장비 바도 같은 기준점(캡처 4의 칩도 프리팹 자리보다 약 16단위 위). 예전에는 머리 위.
- HP 125×7 `#49b2e3` α.7, 그 뒤에 최근 깎인 만큼 흰색 α.7(`slider_back`, 예전 잔상 계산 그대로). 30 % 미만 노랑은 공식에 없어 뺐다.
  SP 125×7을 HP 바로 아래(간격 0): 충전 `#caec46` α.7, 지속형 스킬 중 남은 시간 `#ffa800` α.7(`char_sp_cast_slider`).
  받침 = `sprite_bg`(9-slice, 테두리 4/5): 검정 α.70 가운데 + 4~5px 부드러운 그림자, 검정 α.5 틴트 → 가운데 α.35. 프리팹은 받침을 바보다 8.6 × 10.32 크게
  (133.6 × (14 + 10.32)) 두는데 그 여분이 바로 그림자 폭이라, 가운데는 바 밑에 깔리고 바깥엔 부드러운 그림자만 보인다 — 관리자 제보
  (캡처 14). 처음엔 딱딱한 1단위 여백을 줬다가 테두리처럼 보여 없앴었다. 그림(로컬 추출)이 없으면 바 크기 그대로 α.35 사각형.
- SP 가득 참 빛 없음(관리자 결정: 캡처에 없고 자동 발동이라 순간).
- 탄환형 스킬(관리자 제보): `char_bullet_bar` 받침 `#e56d00` α.31 위에 남은 탄환마다 칸. 칸은 코드(UIBulletBar)가 만들어
  프리팹에 색이 없다 — [추정] 캡처 측정: 색 ≈ `#ffa800`(G 168 일치), 간격 2단위(7발: 16~17px 칸 2px 간격, 19발: 약 4.5px 칸 같은 간격). 칸이 1px보다 좁아지면 남은 비율 한 줄.
  탄환 수는 시뮬레이션이 `b.snap.ammo = [[id, 남은, 최대]]`로 넘긴다(`server/sim/local-hud.js`; 시뮬레이션은 브라우저에서 돈다 — `battle/runner.js`).
  - **언제 탄환 칸인가 = 스킬 프리팹의 `_showSpAsBulletMode`** (upstream 0.2.4 이식 2차, 관리자 결정 2026-10-11 「공식대로」): 클라 코드
    `Character.get_hudPluginMask`(RVA 0x7068B0)가 HUD 줄을 고른다 — 스킬이 효과 중(`BasicSkill.isAffecting`, 가상 슬롯 25)이면 플래그
    (`BasicSkill._showSpAsBulletMode` 0x20, `get_showSpAsBulletMode` 가상 슬롯 15)가 켜졌을 때 `BULLET`(16, `char_bullet_bar`), 아니면 `SP_CAST`(8,
    남은 시간·탄환 비율 막대), 효과 중이 아니면 `SP`(4)·영창 `CHANT`(32). 탄환 칸(`UIHudCharBulletBar.UpdatePlugin` 0xD5AD60)은 스킬이 탄환형
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
  - 칸 그리기(`UIBulletBar.ShowBulletCount` 0xD6E800): 40발부터(`IGNORE_GAP_COUNT`) 간격 없음 → 남은 비율 한 줄(`hud-bars.js BULLET_NO_GAP`; 우리 풀에서는
    信仰搅拌机(산크타 믹사파라토) S2 八臂电锯侠 42·45발 — 30발인 S3는 칸). 간격 값은 `(최대/5 + 1) × _gapFactor`를 셰이더에 넘기는 방식이라 우리 2단위 [추정]은 그대로, 10~39발의
    「부드러운 칸」(`USE_SMOOTH_COUNT`, 셰이더) 차이도 안 옮김.
  - 테스트 `test/render/sp-bullets.test.js`. **[화면 미확인]** 스와이어 디 엘리건트 위트 S1 2칸·S2 3칸(정예 4칸)·S3 켜진 뒤 10칸과 금화 증감, S3 충전 중 SP 막대,
    엑시아 더 뉴 커버넌트 S2·S3 비율 막대.
- 배리어(屏障·护盾, 관리자 요청 2026-10-10 「배리어도 HP 바처럼」): 클라 코드 `UIHudCharHpSlider.UpdatePlugin`이 유닛의 `shieldUIController.shieldToShow`(s)를
  읽어 HP 바를 (HP + s) / (최대 HP + s)로 채우고, 채운 부분 중 끝쪽 s / (HP + s)(`UIHpFillImage.splitValue`)를 바 머티리얼 `ui_battle_ally_hp_bar`(셰이더
  `Torappu/UI/Hp`, DXBC: uv.x > 1.003 − split이면 `_Color2`)의 `#bcdbdf` 불투명으로 그린다 — 따로 막대가 있는 게 아니라 HP 바가 배리어만큼 늘어난다. 아군만
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
  PRTS·나무위키 언급 없음]. 전투 공식 정리는 비공개 조사 기록(`research/battle-mechanics-reference.md`).
- 시뮬레이션: `server/sim/local-hud.js damageNumberFlag(dmg, ss, 예상, 실제)` → `damage.js`(피해 배율까지 계산한 뒤)가 'dmg' 이벤트 5번째 칸(0 / 1 치명타 / 2 강제).
  지속 피해('dot')·무来源은 치명타 아님.
- 렌더: `render/num-official.js` — 피해는 플래그 있을 때만, 회복은 늘. 30단위(화면 고정 hudUnit), 치명타 글자 ×1.1, 흩어짐 ±(10, 5), 0.5초.
  움직임은 클라 코드(DOTween, 2026-10-10 확인): 피해(`UIDamageText.SetTweens` RVA 0xD6F6C0) = 앞 절반(0.25초) OutExpo로 위로 `_upOffset` 30·크기
  1 → `_fontSizeScale` 1.5, 뒤 절반 InExpo로 시작점보다 `_downOffset` 30 아래(두 목표 모두 시작 위치 기준)·크기 1.5 → 0, 투명도 트윈 없음(파란 숫자·
  BLOCK도 같은 움직임). 회복(`UIHealText.SetTweens` 0xD73E20) = 0.5초 OutCubic로 위로 `_floatOffset` 40, 글자 알파 1 → 0 InExpo, 크기 트윈 없음
  (예전 1.5배 팝은 없음). 피해 쪽은 2026-10-07 사용자 영상 측정(처음 0.87배, 마지막 0.13초에 줄며 떨어짐 — `fx.md` 「데미지 숫자」)과 같은 모양이고
  그때 「최종 크기」로 잰 것이 최고 크기(30 × 1.5)다 — 크기가 예전보다 1.5배. 핫픽스(DefinedFix.lua) 없음. Bitmap 글꼴(Novecento Wide, 이미
  `public/fonts`에 있음).
- 뜨는 높이(관리자 「좀 높아 보임」, 2026-10-10 클라 코드로 확인 — 바꾸지 않음): `UIUnitHUD.Attach`(RVA 0xD7AF90)가 `hud_unit`을 `UIFollower.Follow(unit.uiPoint,
  unit.hudOffset)`로 붙이고, `uiPoint` = 유닛 `_uiMountPoint`(프리팹에서 비어 있으면 `Unit.OnAwake`가 유닛 자신의 transform으로 채움 — 아미야·적 예시 모두 비어
  있음), `hudOffset` 기본 0, 위치는 전투 카메라 뷰포트 → UI 카메라(`UIFollower._GetTargetPosition`). 숫자는 `_ShowDamageText` → `UIController.ShowModifierText` →
  `ShowNumericText`(0xD41E90)가 UI 글자 층에 붙이고 `UIPopup.InitPosition`(0xD7A140)이 `popup`(`hud_unit` 중심 위 150, 크기·배율 1)의 위치 + 흩어짐으로 **한 번** 놓는다.
  → HP 바(중심 아래 54.5)와 숫자(위 150)의 거리 204.5단위는 우리와 같다. 우리 쪽 추정은 `hud_unit` 중심 = 발 위 24.5(`HUD_ANCHOR`, 바 캡처로 맞춤)뿐이다.
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
脆弱(4종) `buff_ fragile_01`(발) · 浮空 `common_levitate_01`(바닥) · 적 隐匿 `common_invisible`(발; 그 ColorModifier대로 모델 회색 .5·α .894 — 예전 45 % 반투명 대신) ·
아군 隐匿 `common_stealth` [추정] · 迷彩 `common_buff_micai_01`(몸) [추정: 세 변형 중 _01].
- 머리 높이 = 모델 높이 × 1.1 [추정 — 캡처 10의 주먹이 머리 위], 몸 .5, 발 0(`fx.js bodyZ`). 늘 위 캔버스(유닛 위)에 그린다: 이펙트 세션의 렌더러별
  위/아래 나누기(1f5ecd41, sortingOrder > 0 또는 0 + fudge < 0 = 위)를 상태 프리팹에 쓰면 冻结 얼음(전부 order 0·fudge 0)이 유닛 뒤로 가서 캡처 9와 달랐다
  — 클라는 order 0을 깊이로 정렬해 덩어리가 모델 앞에 온다 → 상태 이펙트는 나누지 않는다(`playStatus` `split = false`).
- 일부 프리팹은 파티클이 한 번만 돌아(`buff_silence` 1초) 상태가 남아 있으면 다시 시작한다. 파일을 못 읽으면 그 상태는 예전 아이콘.
- **중첩 수정**(관리자 제보 2026-10-08, 26108991): `statusOff`가 멈춘
  인스턴스의 `again`(다시 시작)을 남겨 두어, 파티클이 다 죽은 뒤 상태가 다시 켜져 있으면(다음 기절) 새 인스턴스 옆에 복사본을 하나 더
  틀었다 — 다시 걸릴 때마다 하나씩 늘었다(아레나 1 2 3 4…, 실제 솔로 판 최대 8). 또 방출만 멈춰서 `buff_stun`의 표시(수명 10초 파티클 1개)가
  상태가 끝난 뒤 최대 10초 머리 위에 남았다. → `statusOff`가 `again`을 지우고, `fxstatus.js`는 `now`로 끝낸다(정비 금빛은 예전처럼 서서히).
  **끝내는 시점**(2026-10-11 클라 코드): `Entity.OnBuffFinish`(RVA 0x35FCC10) → `RemoveBuffEffect`(RVA 0x36001C0) → `Effect.FinishMe`(RVA 0xC88FE0) —
  구성 요소마다 `OnFinish`(방출 정지) 뒤 `delayToRecycle`이 0보다 크고 즉시 끝내기가 아니면 그만큼 뒤에 회수, 아니면 바로 회수. 파티클 이펙트의
  `delayToRecycle`은 프리팹 `_delayToFinish`(`ParticleEffect.get_delayToRecycle` RVA 0xCB3470). 그래서 `now`는 「방출을 멈추고 프리팹 `_delayToFinish` 뒤
  제거」(`fxgame.js statusOff`, 프레임마다 `finishAt`)이고, 값이 0이거나 없으면 예전처럼 바로 제거. 값은 `fx_extract.py delay_to_finish`가 프리팹 JSON의
  `finish`로 뽑는다(루트 이펙트 구성 요소의 raw float #5): buff_stun·buff_autochess_frozen·buff_sleep·buff_silence·buff_sluggish·common_buff_fear·
  common_buff_thrill·common_disarm_icon·common_levitate_01 0, buff_cold 0.06, buff_attack_speed_reduction_01 0.3, buff_slowdown·buff_weak·buff_defdown·
  buff_magic_resistance_down·buff_ fragile_01·common_invisible·common_buff_micai_01·lemuen_talent_buff_01 0.5 — 기절 표시는 공식도 바로 사라진다.
  `immediately`(즉시 끝내기)를 고르는 쪽(버프가 끝난 이유)은 안 봄 [추정: 시간이 다 된 상태는 즉시 아님]. `playStatus`는 같은 유닛·같은 키의 살아 있는
  인스턴스가 있으면 새로 만들지 않는다(로드 중 꺼졌다 켜지면 로드가 둘 걸리던 것). 같은 경로라 목록 전체에 적용 — 수정 전 아레나에서
  18종 중 13종이 겹쳤다(기절·冻结·寒冷·沉睡·减速·攻速下降·虚弱·防御下降·法抗下降·脆弱·浮空·隐匿·迷彩; 沉默·恐惧·战栗·缴械·迟缓은 파티클 수명이
  짧아 거의 안 보였음), 수정 후 18종 모두 최대 1개·상태가 끝나면 0개. 테스트 `test/local-patch-status-boomerang.test.js`.
- 이펙트로 그리는 상태는 아이콘 줄에서 빠지고(`units.js _iconKeys`, `view._fxStatusOn`), 冻结·寒冷 파란 틴트도 그 동안은 안 쓴다. 클라 프리팹이 없는 상태
  (束缚, 嘲讽, 无敌, 护盾, 麻痹, 원소 폭발, 禁疗, 折射, 替身 …)와 이펙트 층이 꺼진 경우(품질 낮음, WebP 없음, 추출 없음)는 예전 아이콘 그대로.
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
- 확인: `test/local-patch-camou.test.js`(寒芒克洛丝 S1 迷彩 → `UF_CAMOU`, 叙拉古 隐匿 → 없음; 유닛 뷰 아이콘), headless Chromium 렌더 데모(포트 3103,
  寒芒克洛丝 S1 옆에 隐匿 오퍼레이터): 위장 무늬 아이콘과 은신 아이콘이 나란히 보임.

## 협동 방 초대 링크 문구 (2026-10-06)
- 「复制链接」이 클립보드에 넣는 문구(`room.js copy`)는 DOM 번역을 거치지 않아 중국어로 나갔다 → `tr()`로 감싸고 ko `patterns.json`에
  「{0}邀请你加入卫戍协议：盟约【{1}】」→「{0} 님이 위수 협의: 맹약【{1}】에 초대했습니다」(난이도 이름은 data.json 번역).

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
- 확인: Chrome(GPU) 844×390·740×360·932·430·1920×1080 — 설정 버튼 중심이 자기 버튼, 접기 탭 24×10.

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
  - 연결 띠(`ui/connBanner.js`): 「서버 재시작까지 m:ss · 진행 중인 판은 종료됩니다」(0이 되면 「서버를 재시작하는 중입니다」). 판 밖 = 아래 가운데,
    판 안 = 라운드 캡슐 아래 한 줄(토스트는 그 아래로 밀림). 휴대폰 가로(844×390)에서도 한 줄.
  - 이 5분 동안은 토스트를 띄우지 않는다(5·3·1분 표시, 접속 때 토스트 모두 — 관리자 제보 2026-10-09). 서버는 5·3·1분에도 `server.restart`를 보내지만(남은 시간 갱신) 클라이언트가 토스트를 거른다.
- 클라이언트 `public/js/ui/restartNotice.js`: 그 전까지는 **토스트만**(관리자 제보 2026-10-09 — 처음 구현의 30분 내내 띠는 뺐다).
  5분보다 큰 `mark`(30·10분)마다 경고 토스트 「N분 후 서버가 재시작됩니다. 진행 중인 판은 종료됩니다」(6초), 카운트다운 중에 접속한 페이지는 welcome에서 남은 분으로 한 번(남은 시간이 5분보다 클 때만)
  (`ui.restartAt`로 이미 알던 페이지의 재연결은 다시 띄우지 않음), 취소되면 알던 페이지에만 「서버 재시작이 취소되었습니다」. 판 밖에서는 위쪽 가운데, 판 안
  (`html.sp-in-match`)에서는 라운드 캡슐 아래(기존 토스트 자리). 재시작 뒤에는 기존 흐름 그대로: `room.closed shutdown` → 재연결 → buildGuard가 새 빌드로 새로고침.
- 배포 쪽(배포 스크립트, 이 저장소에 없음): 이미지를 먼저 빌드하고(옛 컨테이너는 계속 서비스), 접속자가 있으면 컨테이너 안에서
  `echo 30 > /tmp/stronghold-restart && kill -USR2 1`로 카운트다운을 시작하고, 내부 healthz의 `restartInSec`가 0이 되면 컨테이너를 다시 만든다.
  접속자가 없으면 카운트다운 없이 바로 진행하고, 도중에 모두 나가면 앞당긴다. 실패하면 취소 공지를 보낸다.
- 방별 진행 상황(2026-10-09, 관리자 결정 「방별 진행 상황 정도면 충분해」·방 코드는 그대로 표시): 내부 `GET /healthz/rooms`(`server/local-rooms.js`, 프록시 경유는 404)가
  방마다 `{ code, mode, difficulty, phase, round, stageId, bossId, humans, connected, bots, spectators, ageMin, matchMin }`를 준다(진행 중인 판 먼저, 라운드 높은 순).
  배포 스크립트는 카운트다운 동안 이 목록을 「ABCD 협동 극한 R7 휴식 기간 · 사람 2(접속 1) 봇 2 · 판 23분」처럼 보여 준다.
  지금 상태만 보여 줄 뿐 로그에는 남기지 않는다(판 결과는 `[stats]` 줄).
  확인: `test/local-patch-rooms.test.js`(실제 서버·실제 Match로 대기실·판 시작 뒤 목록, 프록시 헤더면 404).
- 확인: `test/local-restart.test.js`(시점·취소·만료는 가짜 타이머, 실제 서버의 방송·welcome·healthz·판 시작 거부, 실제 프로세스에 `SIGUSR2`, 클라이언트 토스트 조건).
  Chrome(로컬 서버 + `SIGUSR2`): 로비 30분, 정비 화면 10분 토스트(전투 중 5분 토스트는 그 뒤 뺌), 협동 판(AI 3명) 정비·전투·휴대폰 가로에서 5분 띠 위치 확인(2026-10-09).
  띠는 보드 배치 칸·상점·팀원 목록·준비 완료 버튼을 가리지 않는다 [관리자 화면 미확인].

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
- 브라우저 e2e(`SP_E2E=1`)로 들어온 테스트(`mock` `settings-entry` `diy` `facing` `modal` `loadout` `i18n` `ready-fold`) [화면 미확인].

### 두 번째 묶음 — 잠재·练度 UI, 통계 페이지 등

upstream UI 12건 + `66297106`의 테스트 조각(관리자 결정 2026-10-09). **upstream 커밋 순서로** 이식했다(뒤 커밋이 앞 커밋 문맥을 전제): `41fd3c7e` →
`c623550f` → `438a6b52` `51e0e60b` → `0ca2a9c2` → `56a7b918` → `7a0937e3` `519f04e2` `dc336f24` `4f8f5d2a` `9f36db32` `4d63e9d5`.
- 맹약 팝업의 선발 행(`70f7ea01` ← `41fd3c7e`, 관리자 결정: 공식도 사기 전부터 맹약 목록에 흐리게): 「自选」 태그는 없다(`upstream.md` 「0.2.0 병합」).
  우리 선발 다섯은 맹약이 하나씩이라 upstream의 「두 맹약에 다 나오는」 경우가 없다 — 테스트를 赤刃明霄陈(炎)·阿斯卡纶(无)로 바꿈.
- Touch·预备干员-医疗 카드(`bfb6d39c` ← `c623550f` UI 부분): 공식 모양 카드 `ChessDetailArt`는 `ChessDetail`의 블록을 그대로 쓰므로
  恳切福音 아래 PRTS 정정 줄도 공식 모양에서 나온다.
- 통계 페이지(`c9dc046b` ← `438a6b52`, `c7e31c1d` ← `51e0e60b`, 관리자 결정): upstream 화면 그대로(공식 모양은 나중). 결산 다시 보기
  (`ResultView` `quiet`)는 정산 효과음과 우리 결과 음성(`playMatchEndVoice`)을 둘 다 내지 않는다. 로비·대기실 윗줄은 「统计」 다음에 우리
  설정 버튼. PLAYING.md는 우리 §12 「反馈问题」가 있어 통계가 **§13**. 서버가 끝낸 판은 기록하지 않는다(「본판 정보 다시 뽑기」도 이 규칙).
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
  `mock` `playtest2.real` `loadout*` `teammate-loadout`) [화면 미확인].

## upstream 0.2.3 이식 — UI (2026-10-11)
- 대화 상자 안 복사(`8a8db0eb`, GitHub #433): 클립보드 API가 없을 때(LAN) 쓰는 textarea 대체 경로가 모달 포커스 가두기 안에서 선택을 잃어
  「복사됨」인데 실제로는 안 되던 것 → textarea를 열린 모달·안내 안에 두고, 포커스와 전체 선택을 확인한 뒤에만 복사, 성공·실패 모두 정리하고 포커스를
  돌려준다. 실패하면 원래의 손 복사 화면. 브라우저 테스트 `test/ui/modal.e2e.test.js`(SP_E2E) [화면 미확인].
- 렌더러를 못 불러온 토스트 문구(`708caf7d`): `sim.md` 「upstream 0.2.3 이식」.
- AI 팀원 구매 양보(`f3658a0d` 중 `server/match/bot.js`, upstream PR #407, 관리자 결정 2026-10-11): 공식 규칙이 아니라 AI 휴리스틱(`feat`).
  5·6단계 공용 카드(정예·선발 제외)의 맹약이 살아 있는 다른 팀원의 시작 전략(`gd.bandBondIds`, 모드가 끈 맹약 제외)과 겹치면 구매 점수 −18.
  사람·AI 팀원 같게, 여럿이어도 한 번, 재고를 잡아 두지 않고 바로 되는 자기 합성은 그대로. `[ASSUMED]` 점수 크기.
  확인: `test/match/bot-smarter.test.js`(upstream 두 사례). golden `coop2-NORMAL-14-standins`가 움직인다.
- AI 팀원 표정 반응(`f3658a0d` 중 `server/match/botEmotes.js`, upstream PR #444, 관리자 결정 2026-10-11): 공식에 없는 기능(`feat`), 서버만.
  사람과 AI가 섞인 판에서만, 기존 `m.emote`(공식 36개 화이트리스트·1초 쿨다운) 그대로. 기본 켜짐, `SP_BOT_EMOTES=0`이면 모든 진입점이 꺼진다.
  사람의 표정에 쿨다운이 아닌 AI 하나만 답함(고마워·미안해 → 没问题, 合作愉快 → 고마워 등 upstream 표), 현상 수배 카드를 고르면 思考,
  연합 방어 도우미가 되면 合作愉快, 결산 때 라운드마다 한 번(이번 라운드 격파 1위 → 欢呼, 누수 → 害怕, 무손실 → 酷, 보상 → 고마워),
  한 라운드 세 번째 합성 때 害怕 한 번, 진짜 플레이어의 선물(CHAR_GIFT)을 받으면 그 플레이어에게 고마워. 난수·타이머·게임 결정에 손대지 않는다.
  우리 쪽 차이: (1) 사람이 **유저 그림 탭**(`shared/emote-art.js`)으로 보낸 표정에도 그 id대로 답한다(관리자 결정 2026-10-11 — 처음 이식은 답하지 않게 했음).
  AI의 답은 늘 공식 그림. (2) upstream은 연합 방어 시작 반응을 서버 전투 경로(`startUnite`)에만 달아 기본값 `SP_COMBAT=client`에서는
  안 나왔다 — 클라이언트 전투 경로(`_startUniteClient`)에도 단다. `[ASSUMED]` 반응 고르기는 사회적 휴리스틱.
  확인: `test/match/bot-emotes.test.js`(upstream 사례 + 유저 그림에도 답하는 사례) [화면 미확인].
- 닫은 창의 판 복구(「恢复本机对局」, `f3658a0d` + 경쟁 조건 수정 `ba5b998a`, upstream GitHub #431, 관리자 결정 2026-10-11): 공식에 없는 기능(`feat`).
  같은 브라우저에서 판을 하던 창을 닫아 버렸을 때, 다른 창의 타이틀 아래쪽(저작권 줄 왼쪽)이나 로비 머리(「통계」 오른쪽)의 「이 기기의 판 복구」 →
  저장된 자리(닉네임 · 동맹 코드)를 골라 그 창에서 다시 접속한다. 복구할 것이 없으면 버튼이 없다. `public/js/net.js`·`ui/resumeMatch.js`는 upstream 그대로.
  - 신원: 서버가 준 토큰(`sp.tokens` 최근 4개)만, 닉네임·IP로는 찾지 않는다. 아직 살아 있는 창(새로고침·초기화 중 포함)의 자리는 빼앗지 않는다
    (BroadcastChannel로 묻고, 서버 쪽은 `hello.noReplace`/`claimAt` → `SESSION_IN_USE`). BroadcastChannel이 없는 브라우저는 복구하지 않는다.
  - 우리 재접속 규칙과의 관계: 서버 재접속 창(협동 10분, 솔로 판 24시간 `singleReconnectTime`)은 그대로이고, 복구는 그 창 안에서 같은 토큰으로
    다시 들어가는 것뿐이다. 우리는 나가기 창에 「暂离」가 없어 나가면 자리를 포기하므로(README 기능 목록), 이 창이 방을 떠나면
    (「放弃模拟」·「离开同盟」·자리에서 빠짐) 복구 목록에서 지운다(`main.js` 스토어 구독 — upstream은 로비 복귀·새 세션 때만 지워, 포기한 자리가 목록에 남았다).
  - 버튼 자리: 공식 위수협약 UI 작업(아래 「공식 위수협약 UI」)은 판 안 화면이라 겹치지 않는다. upstream이 같이 넣은 설치 버튼(PWA)은 넣지 않는다(「iPhone 전체 화면 안내」의 결정: 홈 화면 안내만).
  - 확인: `test/client-static.test.js` 「explicit local match recovery」(살아 있는 창 보호·닫힌 창 복구·동시 복구·새로고침 중·welcome 전 저장 안 함),
    `test/client-identity-handshake.test.js`(실제 클라·서버 hello 처리, 늦게 온 welcome). upstream 브라우저 테스트(`followup-023.e2e`)는 가져오지 않았다 [화면 미확인].

## 누수 때 위 HP 숫자 (2026-10-11, upstream #479, 관리자 결정 「위 방향대로 고쳐」)
- 전에는 적이 파란 문에 들어가면 위 HP 숫자가 바로 `lp − 대기 손실`(빨간 글자)로 내려가고 옆에 「−N」이 붙었다(user playtest #3 item 2).
  공식 클라는 숫자를 깎지 않는다 → 숫자는 정산된 LP 그대로, 「−N」만 늘어나고, 정산된 `m.private`가 오면 새 LP(`ui/hud.js liveLp` `shown` = lp,
  `LpTower`는 `value`를 그대로, 빨간 숫자 CSS 삭제). 팀 칸(`teamPanel.js`)도 같은 `LpTower`라 같이 바뀐다.
- 근거(EN 클라 역어셈, `research/2026-10-11-upstream-023/decompile-render-ui.md` 「#479」 + 이번 확인):
  `AutoChessHUDStageInfoModel.UpdateData`(0x2024B50)는 큰 숫자에 `ScenePlayerData.hp`(보스전은 `bossRoundModel.playerTotalHp`)를,
  「−x」에 `AutoChessBattleStatusDataModel.lostHpDisplay`(0x84AB10 = 지금 라운드 상태의 값)를 넣고, 보스전이 아니면 `actData.<+0xF0>.<+0x2C>`
  (라운드 상한으로 봄 [추정])로 자른다. `_RenderStatus`에 `hp − lost` 계산이 없다. `_loseHpGrp`는 `lostHpDisplay > 0`일 때만 보인다.
- 보스전(최종 공세·은밀한 핵심): 큰 숫자는 그 보스 단계를 처음 본 때의 합산 LP로 고정, 「−N」 = 그 뒤로 줄어든 팀 LP(누수·초과 시간 감소 모두,
  상한 없음 — 클라 `BossBattleRoundStatus.lostHpDisplay`(0x850590) = `playerTotalHp − battleTeamHp`, 보스전은 상한 분기를 건너뜀). `ui/hud.js bossLp`.
  전투 중 재접속하면 그때 본 값부터 [ASSUMED]. 툴팁 「全队目标生命值 {lp}：本场战斗已损失 {pending} 点，战斗结束后扣除」.
- **공식과 다르게 남긴 것(관리자 결정 2026-10-11, 「공식대로」 삭제를 되돌림)**: 자기 전투(일반 라운드 COMBAT) 중 「−N」. 클라 `SelfBattleRoundStatus.lostHpDisplay`(0x8576B0)는
  늘 0이라 공식은 자기 전투 동안 「−x」를 아예 띄우지 않고, 联防(`HelpBattleRoundStatus.lostHpDisplay`(0x856860) =
  `selfEnemyEscapedCntInHelpBattleState`, 상한 적용)과 보스전에서만 띄운다. 우리 「−N」은 user playtest #3 item 2 요청이라 그대로 둠(한때 공식대로 지웠다가 관리자 요청으로 복원).
- 확인: `test/ui/playtest3.test.js`(liveLp·LpTower·bossLp), `test/ui/playtest6-unite.test.js` [화면 미확인].

## upstream 0.2.4 이식 — UI (2026-10-11)
- **장치 탭 설명** (upstream `df540b62`, GitHub #228·PR #229 by @rickylxw, + `6bfc0827` §29.14 「같은 전투 재입장 때 장치 카드」, 사용자 결정 2026-10-11):
  阻隔工事·“双眼皮”·射击台·源石流发生装置를 누르면 지형 카드(#184)와 같은 자리에 장치 카드(`gameLogic/terrain.js deviceInfo`·`deviceTipAt`,
  `detailPanel.js DeviceDetail`). 정비·정찰 판은 관 데이터의 장치 위치로, 전투 중에는 상자·포탑이 장치 **유닛**이라 그 유닛이 선 칸으로 찾고(관 밖 포탑은
  다른 칸에 섬), 카드에 실시간 HP, 부서지면 카드가 닫힌다. 같은 전장의 메타가 다시 와도(관전 `g.watch`·`reshow`) 이미 받은 장치 유닛을 렌더러와 카드
  양쪽에 되돌린다(`deviceUnitsForEntry` — 안 그러면 다음 HP 묶음이 모르는 적이 되어 탭을 가로챔). 숨은 포탑(机械援助·机变 전)·机变으로 치운 상자는 안 그려지므로 말하지 않는다.
  - 공식 근거: EN 클라 `btl_pfb_tokens_4.ab`·`_0.ab`의 이 넷 프리팹은 `Character._disableClickCharacterInfo`·`_disableCharInfoPanel`이 0(盟约寒风
    `trap_1112_acblzd`은 `_disableClickCharacterInfo` 1) — 공식 전투에서 누르면 유닛과 같은 정보 패널(`UICharacterInfoPanel`: 이름·HP·공격/방어/
    마법 저항/저지·공격 범위·스킬 탭)이 열린다. 그래서 우리 카드는 upstream 글 위에 **장치 자신의 공식 스킬 글**(관 데이터 `devices[].skill`, 한국어는 데이터
    오버레이의 공식 KR 문구)과 포탑의 **공격 범위**(관 데이터 `rangeGrid`)를 더했다. 모양은 우리 적·소환물 카드와 같은 일반 카드(공식 모양 `ChessDetailArt`는
    오퍼레이터 전용). `[ASSUMED]` 공식 패널의 실제 배치·정비 단계에서 누를 수 있는지(공식 정비 화면 캡처 없음), upstream의 「装置机制」 설명 글(우리 sim 수치)은 upstream 것.
  - 문구: `en.json`·`ko/ui.json` 16개(ja·zh-TW 팩은 이번에 안 넣음 — 영어로 떨어짐). 한국어 「스테이지 장치」·「장치 효과」(지형 카드의 「지형 효과」에 맞춤).
  - 확인: `test/ui/device-tip.test.js`(upstream v0.2.4 판, 언어는 zh/en/ko + 공식 스킬 글·범위 사례), `test/ui/device-tip.e2e.test.js`(SP_E2E, upstream 그대로 + 공식 글 한 줄),
    dev mock `?variant=devices&stage=act1autochess_m01`·`__MOCK__.hurtDevice(i, dmg)` [화면 미확인].
- **간이 보기 재시도** (`6bfc0827`의 `ui/fieldHost.js` + 같은 커밋의 `screens/game.js` 새 view 다시 들어가기): `render.md` 「모바일 3D 보드 복구」.

## 본판 정보 다시 뽑기 (2026-10-09, 관리자 결정)
- 공식에 없는 기능(`feat`). 싱글에서 결석 맹약·리더 적을 보고 나갔다가 새로 시작하는 일이 많아서 넣었다(관리자 2026-10-09).
  INFO_CHECK(「确认本局信息」, `screens/briefing.js`) 아래쪽, 준비 완료 버튼 왼쪽에 「다시 뽑기」(`重新抽取`, `g.infoReroll`).
- 투표 규칙(`server/match/match/phases.js maybeEndInfo`, 관리자 결정 2026-10-09):
  - 사람 자리마다 준비 완료와 다시 뽑기 중 **하나만**, 바꿀 수 없다. 하나를 누르면 두 버튼이 다 꺼진다. 다른 쪽을 보내면 `ALREADY`.
  - AI 팀원과 나간 자리는 투표하지 않는다(AI는 들어오자마자 준비 완료라 넣으면 만장일치가 안 된다). 관전석은 자리가 아니다.
  - 모두 투표하면, 또는 협동 25초가 끝나면(투표 안 한 자리 = 준비 완료): 준비 완료가 많으면 맹약 선택으로, **다시 뽑기가 많으면 다시 뽑기**(만장일치가 아니어도), 같으면 대기실로.
    사람이 혼자면(싱글, AI 팀원만 있는 협동 방) 누르는 즉시 결정된다.
  - 무엇을 다시 뽑나: **새 시드로 판 전체** — 리더 적·숨은 리더·전장·특훈 적·결석 맹약·공유 풀·선발 재고. 표준 난이도는 전장이 하나라(「战场固定」) 전장은 그대로다.
  - 횟수 제한 없음. 브리핑이 시작되고 1초 동안은 `RATE`(`INFO_REROLL_MIN_MS`, 버튼을 계속 눌러 판을 연달아 만들지 않게). 클라이언트 버튼도 1.1초 뒤에 켜진다.
- 서버 경로: 판은 `m.result` 없이 끝나고(`_endInfo`, 마지막 m.public에 `infoOutcome` `reroll`|`split`) `onEnd({ reason })`.
  `server/lobby.js onMatchEnd`: 다시 뽑기면 같은 방에서 `startMatch`를 바로 다시 부른다(새 시드, matchNo + 1, `room.start`의 준비 확인 없이 — 투표가 합의).
  남은 일 정리는 보통 판 끝과 같다(나간 자리 비우기 등). `lastSummary`·리플레이를 남기지 않아 `[stats]` 줄도 없다.
  채팅 진영은 두 경우 모두 지운다(사람들이 결석 맹약을 보고 진영을 고르므로). 재시작 예고 마지막 5분(`startRefusal`)이면 새 판을 못 만들어 대기실로 돌아간다.
- `room.state.matchNo`(새 필드): 다시 뽑기는 `inMatch`가 true인 채로 판을 바꾸므로, 클라이언트 `main.js onRoomState`가 matchNo가 바뀌면 경기 상태를 비운다(협동이면 토스트 「이번 판 정보를 다시 뽑았습니다」).
  동률·시작 실패로 `inMatch`가 false가 되면 「시뮬레이션 종료」 창 없이 바로 대기실로 가고 경고 토스트를 띄운다.
- 화면: 다시 뽑기를 누른 사람의 칸 아이콘은 금색 새로고침 아이콘, 협동이면 「다시 뽑기 N」 수를 준비 완료 수 옆에 표시한다.
- 확인: `test/match/info-reroll.test.js`(투표 규칙·서로 배타·25초·AI 제외·나간 자리), `test/lobby-info-reroll.test.js`(실제 서버·실제 Match: 새 시드·matchNo 2·리플레이/[stats] 없음, 협동 동률 → 대기실·진영 지움).
  [화면 미확인]

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
- 확인: `test/local-feedback.test.js`(검증·꺼짐·저장 내용·주소 해시·제한·정리·전투 묶기·실제 서버에서 판 끝난 뒤 전송). [화면 미확인]
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
커스텀 Text의 `m_InputText` = 중국어 원문, `m_TextId` = 번역 키), 프리팹 애니메이션 클립의 마지막 키프레임(표시 길이), 클라 코드(il2cpp 덤프의 메서드 이름 —
아래 「클라 코드」). 한국어는 관리자가 본 공식 KR 문구, 나머지는 관리자 「적절하게 번역」 지시로 우리가 정함(KR 번역 표는 클라에 없음).
그림은 로컬 추출(`data/local-assets.json` ui/battle)에 있어야 뜨고, 없으면 upstream 배너가 그대로 남는다(`ui/battleArt.js battleArt`).
코드: `public/js/ui/battleArt.js`, `public/css/battle-art.css`, 연결은 `screens/game.js`. 동작 곡선(크기·투명도 변화)은 클립을 키 단위로 옮기지 않은 [추정].
- 로딩 화면(BATTLE_CHECK, 3D 화면 로딩 중): 공식 일반 전투 로딩 `UIBattleLoading` + `UIStageInfo`(클라 코드 `UIStageInfo.SetData`: 「Operation」 + 코드 + 이름).
  그림 = 모드의 `loadingPicId`(`data/config.json modes[].loadingPic`, 웹 소재 `loading/loading_ac_*` — AC-1 노랑 … AC-4 빨강, 1024² 그림을 16:9로 늘려 그림),
  글자 배치는 `act2autochess_battle_ui_plugin`의 `panel_battlestart`(Operation 30 · 코드 90 · 이름 60, Novecento wide / Noto), 아래 팁 = 공식 `gameTipsList`
  무작위 하나, 오른쪽 아래 「Loading」 + 점. 이름은 모드 이름 그대로 — 「AC-4 초월 시뮬레이션」(관리자 결정 2026-10-11: 「시뮬레이션」을 붙임. 2026-10-10에는 KR 캡처
  「AC-3 극한」을 보고 「시뮬레이션」을 뺐었음 — 클라가 시작 매개변수로 넘겨 출처를 끝까지 못 따라감). upstream의 BATTLE_CHECK 「协议启动」 띠는 그림이 있으면 띄우지 않는다.
- 시작 배너(`game_start_dialog`, 3.42초, 소리 `target` = ON_ACT1AUTOCHESS_TARGET): BATTLE_CHECK에서 1라운드 ROUND_START로 넘어갈 때 한 번(재접속은 다시 안 띄움),
  라운드 시작 배너는 그 뒤에. 「全局作战目标」(27, #1bf0b1) / 「通过14回合，消灭领袖」(35, 흰색) — KR 「전역 작전 목표」 / 「리더 적 섬멸!」(관리자 KR 캡처).
  라운드 1 배너가 ROUND_START(2초) 뒤에 뜨므로 그 라운드의 「획득」 값을 라운드 단위로 기억해 넘긴다(`roundGoldRef`).
- 아래 안내 띠(`panel_bottom_tips`, 클라 코드 `AutoChessBattleUIBottomTipsViewModel.UpdateData`): 정비 중(남의 판을 보는 중이 아님) — 내가 준비함 →
  PREP_READY(#18a486, `icon_ready`, 「준비 완료, 시뮬레이션 대기 중」), 아니면 임시 정비 구역에 단위 → HAND_OVERFLOW(#d22e2e, `icon_red`, 「정비 구역 초과,
  넘친 자원은 다음 라운드에 파기됩니다」 — 우리 번역), 아니면 정비 구역 가득 → HAND_FULL(#ff9000, `icon_yellow`, 「정비 구역이 가득 차 구매할 수 없습니다」);
  그 밖(전투·联防·관전)에는 내 전투가 끝났고 탈락 전이면 → WAIT_FINISH(#171717, `icon_waiting`, 「전투 종료, 팀원의 전투 대기 중」 — 이때 upstream의
  「作战结束，等待队友完成作战」 글은 숨기고 진행 목록만 둔다). 54 높이 알약(`img_bg` 색 입힘, 안쪽 여백 30, 아이콘 32 + 글 18, 폭 410~690), 화면 아래에서 47.7,
  상점이 펼쳐져 있으면 172 위(`battle_bottom_tips_shop_show`). KR 문구는 관리자 KR 캡처(넘침만 우리 번역).
- 대기 창(`battle_waiting_dialog`, 클라 코드 `AutoChessBattleUIViewModel.IsWaitingPanelShow` = 정비·전투 상태의 END 단계, 즉 내 몫은 끝났는데 단계가 안 넘어감):
  우리는 정비·机变·라운드 시작·SETTLE의 마감이 0.8초 넘게 지났는데 단계가 그대로일 때(서버·팀원 대기, 재접속 직후). 부드러운 판 `banner_back`(9분할 169/170),
  모래시계 얼굴(`face_main` + `shallow_main`, 모래가 3초 주기로 위 → 아래, `battle_waiting_loop_anim` 키 값대로), 「시뮬레이션이 곧 계속됩니다」(33, #e4e5e8) /
  「현재 단계가 끝나기를 기다리는 중……」(19, #71ccb7) — 둘 다 우리 번역.
- 준비 막대(`panel_prep_ready` → `panel_player`): 내가 준비한 뒤(취소 버튼일 때) 「준비 완료 n/4」 글자 대신 `player_bg` 판 + `player_frame` 괄호 + 사람마다
  `player_ready`(흰색 15 % → 준비한 수만큼 앞에서부터 #00ffc4 72 %, 클라처럼 사람별이 아니라 수로 켬). 그림은 로컬 추출(`has-hud-ready`).
- 연합 방어 배너(`help_battle_dialog`, 3.0초): UNITE에 upstream 띠 대신. `round_result_dialog` 틀의 주황판 — `round_bg` + 등고선 #6c5e48, 왼쪽 괄호·모서리 #ffa421 안에
  픽셀 둘 `assist_emoji_01/02`, 오른쪽으로 가는 화살표 `arrow` 4개(알파 .4/1/.4/.2), 점 #ffb134 · SIGNAL #ffb135, 「联防阶段」(40, #ffaa24) — KR 「연합 방어」(관리자 KR
  캡처; 같은 msgid라 단계 이름 「联防阶段」도 「연합 방어」로 바뀜).
- 보는 판 표시(`panel_ob_info`, 클라 코드 `AutoChessBattleObInfoPanel`): 联防·보스 판의 ‹ › 전환기(클라 전투 모드 `ClientHud`)와 팀원 관전 표시를 공식 모양으로 — 화면
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
- 방송(`broadcast_panel`, 클라 코드 `AutoChessBattleBroadcastPanel`): 로컬 그림이 있으면 upstream 띠 대신 화면 위에서 165 아래, 9분할 `broadcast_bkg`(l/r 20, t 14, b 11)
  + `broadcast_icon` + 18 흰 글, `auto_chess_broadcast`대로 34 아래에서 떠오르고 2.0초부터 사라져 한 줄 2.33초(upstream 5.2초). 문구·우선순위·대기열은 그대로(`ui/ticker.js`).
- 보스 라운드 시작 창(혼자 `single_boss_prepare_dialog` / 협동 `multi_boss_prepare_dialog` / 숨은 라운드 `hidden_boss_prepare_dialog`): 보스 라운드(숨은 라운드)의
  **ROUND_START**, 즉 그 라운드의 휴식 전에(관리자 제보 2026-10-10 「보스 라운드의 휴식시간에 들어가기 전」; 클라 코드 `AutoChessGameStateType.BOSS_PREPARE_WAITING`(101)
  상태의 `AutoChessBattleUIController.PendingBossPrepareWaitingTask.CalcTabId`가 `tab_single/multi/hide_boss_prepare`를 고름 — 보스 전투가 아니라 그 앞의 대기),
  BOSSROUND 소리와 함께, 라운드 시작 배너(「라운드 14 / 획득 +N」)는 창이 끝난 뒤(시작 배너와 같은 순서 — 공식도 보스 카드 다음에 라운드 시작 배너: maintainer confirmation 2026-10-10 (official play memory)). 보스 전투
  (FINAL_ASSAULT·HIDDEN_CORE)가 시작될 때는 띠·창 없이 라운드 띠 전환만(`ui/battleArt.js bossOpening`). 처음 넣을 때(8527a6d7)는 보스 전투 시작에 띄웠다.
  그림이 없으면 upstream 띠가 전투 시작에 그대로. 공통 판 `team_boss_start_bg`(숨은 라운드 `bg_type_01`)는 `bg_mask`(RectMask2D 패딩)대로 잘라 띠로 보인다. 혼자: 리더 표시(`icon_boss_normal_white`
  #e6612c) + 열리는 괄호 + 리더 초상(`boss_bg_normal`, 그림은 `bosses.json` 적 아이콘), 「决战回合」(18) / 「迎击首领敌人」(32 #ec6b38) — KR 「최종 공세 / 리더 적 섬멸!」.
  협동(관리자 설명: 남은 팀원 HP를 합산해 보여 주고 같은 배너가 바뀌며 보스가 나옴): `in_01`(1.27초) 살아 있는 플레이어 줄(아바타, 내 표시 `team_boss_player_mine`,
  LP)과 가운데 원(합산 LP), 선이 깜빡이며 들어옴 → `in_02`(1.17초) 팀이 왼쪽(−96)으로, 오른쪽에 리더, 「决战回合」 / 「合力迎击领袖！」(#22e8bd) — KR 「최종 공세 /
  힘을 합쳐 리더 적 섬멸!」. 플레이어 2·3명일 때 줄 자리는 4명 자리에서 [추정]. 숨은 라운드: 경고 표시, `boss_sp_icon`, 「隐藏回合已解锁」(34 #09d7e3) / 「挑战失败不影响
  胜利结算」(19 #a0b2b3) — KR 「히든 코어 개방 / 실패해도 정산에 지장 없음」. 고리(ext 스프라이트)와 선 모양은 [추정].
- 판 끝 연출(`settle_ending_dialog`, 클라 코드 `AutoChessSettleDataModel.EndingStatus` + `_PlayAudio`): `m.result`가 진행 중인 판에 도착하면 결과 화면 전에(필드는 그대로
  두고; 서버는 RESULT 단계의 m.public을 m.result보다 먼저 보내므로 그 사이에도 필드를 둔다 — 전에는 결과 없는 결과 화면이 「模拟失败」를 잠깐 띄우고(숨은 라운드까지 깨도),
  연출 때문에 필드가 다시 마운트되며 로딩 화면(`AC-n`)이 떴다: 관리자 제보 2026-10-10, `screens/game.js GameScreen` `onField`) — 승리·숨은 라운드 없음 = NORM_BOSS_WIN(`panel_win_first_boss`, 소리 `killBossNormal`), 승리·숨은 라운드 실패 = HIDE_BOSS_FAIL(`panel_lose_break_one_boss`,
  `killBoss`), 둘 다 = HIDE_BOSS_WIN(`panel_win_all_boss`, `killBossAll`), 패배·전멸 = GAME_OVER(`panel_lose_all_out`, `disconnect`); 중도 포기·오류는 없음. 글:
  「已击败首个领袖！」 KR 「위수 성공!」(관리자 KR 캡처; 숨은 라운드 실패도 클라 CN 원문이 같아 같은 문구 [추정]), 모두 처치는 클라에선 그림 글자 `img_text_win_all`(EN
  「All Leader Enemies Defeated!」) — 번역하려고 글자로 그림, 우리 CN 「已击败全部领袖！」, KR 「모든 리더 적 처치 완료!」(관리자 KR 캡처), 중단 「模拟中断」 KR 「시뮬레이션
  중단」(우리 번역). 길이는 클립(1.97 / 1.97 / 3.0 / 2.1초) + 머무름 [추정], 공식 최대 4초.
- 탈락 창(`self_dead_dialog`, 클라 코드 `AutoChessBattleUISelfDeadDialog`): 판 도중 내 자리가 탈락하는 순간 한 번(관전석·재접속 제외) — 검정 80 %, 붉은 띠(`bg_type_01`을
  RectMask로 자름), 깨지는 픽셀 얼굴(`icon_01`…`04`), 「防线已被突破」 KR 「방어선이 뚫렸습니다」(기존 번역 재사용), 「继续观战」 「계속 관전」(창 닫기) / 「退出模拟」
  「시뮬레이션 나가기」(나가기 확인 창) — 클라 문구표가 없어 우리 번역.
- 라운드 시작 배너의 보스 예고 줄(`round_countdown`, 클라 코드 `CheckIfNeedRoundRemainTip`): 보스 라운드 − 현재 라운드가 1~`constants.bossTrailerStartRound`(3)일 때
  배너 위 91.6에 「剩余 N 回合」(20 #a6a6a6, 숫자 #ff682d) — KR 「남은 라운드 N」(우리 번역). 예전에 일부러 뺐던 것(위 「휴식 진입…」 절)을 2026-10-10 관리자 요청으로 넣음.
- 로딩 화면은 판 시작(BATTLE_CHECK, 3D 화면 처음 로딩)에만 — RESULT 단계에는 띄우지 않는다(위 판 끝 연출의 제보).
- 전투 시작 띠 없음: COMBAT의 upstream 「作战开始 / 各自行动阶段」 띠를 뺐다(관리자 제보 2026-10-10 「공식은 전투 시작 시 배너가 없음」) — 전투 시작은 라운드 띠의
  `trans_battle`(「전투 시작」)과 소리뿐. 휴식(PREP) 띠를 뺀 2026-10-08 결정과 같은 꼴.
- 남은 자금으로 준비할 때 묻는 창(관리자 제보 2026-10-10 「공식 UI로」): 클라 코드 `AutoChessBattleUIController._GetPreReadyTipGoldDialogTabInput` = 공식 확인 창
  `AutoChessConfirmDialogInPage`(`[uc]autochesscommon.ab` `auto_chess_confirm_with_cancel_view`) — 뒤 화면 흐림, 화면 너비 어두운 띠 `img_confirm_dialog_bg`(9분할
  40/40/42/42, 257 높이, y +39), 글 26 흰색, 그 아래 체크 줄(`img_confirm_dialog_check_box` / `_check_small` 21 + 22 #dcdcdc 「本局不再提示」), 띠 아래(y −140) 화면 반씩
  두 버튼(103 높이): 취소 = 회색 `img_confirm_dialog_btn_gray_bg`(9분할 20/20) + `img_confirm_dialog_cancel`, 확인 = 초록 `img_confirm_dialog_btn_green_bg`(22/322) +
  검게 칠한 `img_confirm_dialog_check` + #051511 글(뷰의 `_colGreenBtnText`/`_colGreenBtnIcon`). 조건은 그대로(클라 `IsNeedToShowPreReadyTipGold` = 자금 > 0, 전략이
  `noMoneyTipsBand` 밖). 체크하고 확인하면 이번 판에는 다시 묻지 않는다(클라 `AutoChessLocalCache.DataInScene.isPrevReadyGoldTipDisable` — 장면(판) 단위). 공식 문구
  (`AUTO_CHESS_BATTLE_PREP_READY_TIP_2` / `…_NOMORE`)는 클라 문구표가 없어 본문은 예전 우리 문장 [추정], 체크 글 「本局不再提示」 KR 「이번 판에는 다시 묻지 않기」는 우리 번역.
  흐림 세기·어둡게 하는 정도 [추정]. 그림(`ui/common`)이 없으면 예전 확인 창.
- 임시 정비 구역이 넘친 채 준비(관리자 결정 2026-10-10 「공식 창을 같은 모양으로, 문구는 우리 번역」): 클라 코드
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
- 아직 안 넣은 것: 재접속 대기 마스크(`auto_chess_reconnect_mask`)·서버 끊김·혼자 판 이어하기 창, 핑 판(`panel_ping`), 위수협약 토스트, 결산 화면 좋아요(서버 기능 필요)·
  「战斗中...」 — `research/2026-10-10-autochess-ui-gap/README.md`.

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
  결장 오퍼레이터(130 칸, 7 간격, 어둡게 + 오른쪽 위 `img_chess_banned`). 클라 코드 근거: `AutoChessStageInfoGroupViewModel._LoadBondDataFromIdRange`가
  `bannedBondList`의 맹약마다 `AutoChessStageInfoChessGroupModel`을 만들고, `LoadData`가 그 맹약 멤버 중 `CalculateBannedChessIdList`에 든 것을 넣는다 →
  두 맹약이 다 꺼진 오퍼레이터는 두 묶음에 다 나온다. `_RefreshChess`는 멤버 수가 0이어도 묶음을 넣고, 6명마다 줄을 나눈다(두 번째 줄부터 맹약 칸 없음 — 우리는
  가로 폭에 맞춰 감싼다). 묶음 순서는 핵심 줄 → 부가 줄 순(클라 `CompareTo`의 정확한 키는 안 읽음 [추정]).
- 모드가 끄는 맹약(표준의 10개)은 결장 오퍼레이터가 있을 때만 묶음을 만든다 [추정]: 클라 `bannedBondList`에 모드 비활성 맹약이 들어가는지 안 읽었다.
  뽑힌 맹약(D)은 비어도 묶음을 만든다(위 `_RefreshChess`).
- 공식 제목·안내 문구는 프리팹에 없고(실행 중 문구표 키로 채움) 클라 문구표도 없어 예전 우리 문구(核心盟约 / 附加盟约 / 本局禁用干员)를 그대로 쓴다.
  `perm/temp_bond_title`의 `text_tip`(`hasBondBanned`일 때 뜨는 안내) 내용은 모른다 — 대신 범례 한 줄.
- 창은 이제 데스크톱에서도 본문이 스크롤된다(공식도 스크롤 뷰). 테스트: `test/ui/match-info.test.js`, 브라우저 `test/ui/match-info.e2e.test.js`.
- 맵 미리보기(관리자 요청 「맵 이름 아래에 어떤 맵인지」): 공식 일반 스테이지는 `arts/ui/stage_mappreview_*.ab`
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
