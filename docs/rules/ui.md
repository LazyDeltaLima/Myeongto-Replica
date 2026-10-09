# 화면 UI

원래 `docs/LOCAL-PATCH.md` 한 파일이던 것을 2026-10-09에 영역별로 나눴다(내용은 그대로 옮김, 색인은 `docs/LOCAL-PATCH.md`). 본문의 「아래」「위」는 옛 한 파일 기준이라 다른 파일에 있을 수 있다 — 절 이름으로 `docs/LOCAL-PATCH.md` 색인이나 `grep -rn "<이름>" docs/rules/`로 찾는다.

## 게임 내 디버그 패널 (2026-10-06)
- **로컬 디버그 모드** = `SP_DEBUG_PAGE=1` 또는 올바른 `SP_DEBUG_FUNDS`(0..999), 그리고 `NODE_ENV`가 `production`이 아닐 때
  (`server/local-patch.js debugMode`). `local.sh`가 둘 다 켠다. OCI(`oci/compose.yml`)·NAS 스택은 둘 다 설정하지 않고,
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
- 클라이언트: `m.private.debug`가 있을 때만 `DebugPanel`을 그린다(관전석 제외). 위치는 왼쪽 팀 패널 오른쪽, 맹약 줄 아래(`left 2.3rem, top 2.05rem`)
  — 보드·상점·정비 구역과 겹치지 않는다(1920×1080·1280×720 확인, 폭 2.1rem: 그보다 넓으면 보드 왼쪽 날개에 닿는다).
  선택 상자는 현재 loadout 항목(`m.private.loadout`)이나 기본값에서 시작하고, 스킬 이름(「S3 · 그믐달의 여운」)·모듈 이름은 원문을 DOM 번역기가 바꾼다. 맹약 팝업·상세 카드는 같은 자리에 위로 열린다. 머리줄(DEBUG)을 누르면 접힌다.
  문구는 중국어 원문 + `public/i18n/ko/ui.json`(「调试用资金固定 {0}」 → 「디버깅용 재화 {0} 고정」 등).

## 정비 화면 HUD (2026-10-06)
상점과 같은 방식(사용자 요청: 정비 화면 나머지도 실제 게임과 같게). 근거는 EN 클라이언트 `[uc]autochessbattle.ab`의 `autochess_hud_panel`,
`autochess_hud_bond_item`, `panel_prep_ready`와 사용자 스크린샷(한국 서버). 그림은 모두 웹 소재(`hudPanel/*`, `hudBondItem/*`, `prepReady/*`,
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
- 맹약 문양 크기·이름 간격, 플레이어 목록 이름(2026-10-07, 사용자: 중국 서버 联防 캡처와 비교): 문양 스프라이트(`[uc]autochesscommon` `icon_<맹약>`)는
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
- 크기 단위(2026-10-06 후속, 사용자 결정 「클라 추출 근거면 공식 단위」): `auto_chess_battle_ui_page`의 Canvas는 ScreenSpace-Camera(`m_RenderMode` 1) +
  CanvasScaler ScaleWithScreenSize, 기준 1280×720, `m_ScreenMatchMode` 0, `m_MatchWidthOrHeight` 0(가로). 그 아래 `panel_ui` → `panel_below`/`panel_hud`/
  `panel_shop` → 프리팹 루트(`autochess_hud_panel`, `autochess_shop`) → `player_info_view`·`bond_list_info_view`까지 localScale은 모두 1(상점 안에서 크기가
  다른 것은 마스코트 Spine 0.42와 말풍선 0.87뿐). → 1920×1080에서 1단위 = 1920/1280 = 1.5px. 이전 값 1.08(= 1.5 × 0.72)은 스크린샷에서 맞춘 것이고
  0.72배 부모는 없다. 사용자 CN 캡처(846×528, 16:10)로 확인: 두 🔍 버튼 중심 간격 457px / 611단위 = 0.75px/단위 ≈ 528/720(세로 기준) — 16:9에서는
  가로·세로 모두 1.5라 같다. 준비 완료 161단위 = 캡처 약 118px(0.73), 카드 간격 약 123px = 164단위(카드 158 + 간격 6). 우리 rem(1920×1080 기준
  `min(vw/19.2, vh/10.8)`)은 16:10에서 가로를 따라 공식보다 약 10 % 작다(스크린샷 `u15-1610.png` 기준 808px 대 915px).
- 프리팹·스프라이트 읽기 도구(2026-10-07): `tools/local-extract/ui_inspect.py` (`src/.venv-extract`, `python -I`).
  `prefab <번들> <GameObject>` = RectTransform 트리(앵커·위치·크기·피벗) + Image 스프라이트·색, Text 글자 크기·정렬·줄 간격·레이아웃 값,
  `sprites <번들> [이름 일부…]` = 스프라이트 rect·텍스처 rect·오프셋(tight 패킹이면 웹 PNG에 여백이 없다 — 맹약 문양 128 rect / 텍스처 ~100).
  번들은 경로 또는 클라이언트 `PersistentData/Bundles` 아래 경로(예: `ui/autochess/[uc]autochessbattle.ab`).
- **PC UI 배율 + 해상도 반응형(2026-10-06 2차, 사용자 요청 「해상도 기준 반응형」)**: 단위는 한 곳 — `css/hud-art.css` `:root --ui-u`
  = `clamp(.0135rem, .0105rem + .3px, .015rem)`. hud-art `--u`, shop-art `--u`(기존 폭 상한 `min(…)` 유지), phase-art `--pu`(세로 상한 유지)가 모두 이것을 쓴다.
  - 데이터 확인: EN(PC) 클라이언트 `global-metadata.dat` — `StandaloneCanvasScaleHelper`(`NotifySettingChange`, `_SetAllCanvasScale`)의 상수
    `MIN_SCALE_FACTOR` 0.9 · `MAX_SCALE_FACTOR` 1.0 · `DEFAULT_SCALE_FACTOR` 1.0(필드 기본값 표에서 직접 읽음), 설정 키 `UI_SCALER`(SettingManager, SLIDER).
    즉 PC판은 1280×720 캔버스 단위에 **사용자 설정 UI 배율 0.9~1.0(기본 1.0)**을 곱한다. 적용 방식(모든 캔버스 배율 곱)은 메서드 이름으로 본 [추정](로직은 네이티브).
  - KR 캡처(3838×2158, PC)는 🔍 버튼 간격 1649px = 610단위 × 2.70px = 0.9 × 3838/1280 → 그 플레이어는 최소 0.9로 둔 것. 해상도별 공식 표는 못 찾았다.
  - 곡선 [추정]: 1280×720 프레임(rem 66.7px) 이하는 1.0(=지금 크기 — 폰·작은 창은 그대로, 줄이지 않음), 1920×1080(rem 100px)에서 0.9, 그 사이 직선,
    그 위는 0.9. 1단위 = 1280 이하 `.015rem`, 1920×1080 1.35px, 2560×1440 1.8px, 3840×2160 2.7px.
  - **설정 「UI 크기」(사용자 결정 2026-10-06)**: 공식 PC판 UI_SCALER처럼 90~100 % 슬라이더(1 % 단위, 기본 90 = 위 곡선). 값 k는 곡선의 끝값을 바꾼다 —
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
- 배치 기물 정보 창(2026-10-06 후속, 같은 날 2차로 다시 짬 — 사용자: 「박스 카드가 아니라 아트만」, `ui/detailArt.js`): 상자 없이 화면 왼쪽 끝에
  전체 높이로 오퍼레이터 아트, 오른쪽으로 투명해지는 가로 마스크(55 %→100 %), 글자 뒤·탭 아래는 어둡게. 그 위에 `act2autochess_character_info_subpanel_status`·
  `…_tabgroup`(735단위 폭, 클라이언트 1920×1080 캔버스라 1단위 = .01rem — 스크린샷의 직군 아이콘 중심 x≈79와 일치)과 사용자 스크린샷(深巡·乌尔比安·斯卡蒂·
  盟约·辅助干员) 순서: 금색 틀 직군 아이콘(소환물·보조 오퍼레이터는 청록 틀 [추정]), 이름 33px, 등급 | 정예 아이콘 LV n(`chess.json status`의 phase·level =
  공식 charChessDataDict status, 예: 深巡 LV 55·乌尔比安 LV 1), 능력치 목록(攻击 防御 法抗 阻挡 费用 21px — 원본의 攻击间隔·再部署는 작게 이어서), 攻击范围 칸
  (136×105)과 맹약 칸(112×105, 원본 맹약 칩: 개수·同构·本局禁用·팝업), 얇은 파란 체력 막대(555)와 끝의 「生命」+파란 값 상자, 탭 特质 / 技能(+모듈) / 特性 /
  天赋(650 폭, 열린 탭 흰 글자·어두운 칸), 탭 내용(재능 이름은 회색 칩, 特质는 초록 作战能力 칩 + `acbattle_img_bg_bond_desc` 판, 장착 장비). 出售는 공식처럼
  보드의 언더프레임(원본 기능)에만 둔다. 아트: 로컬 추출 `chararts/<charId>`가 있으면 그 立绘, 없으면 웹 소재의 180×360 반신 초상.
  - 立绘 추출(2026-10-06): `.venv-extract/bin/python tools/local-extract/chararts_extract.py`(기본 `--game` = EN 클라이언트 Bundles). 클라이언트
    `chararts/<charId>.ab`의 기본 아트 `<charId>_1`(정사각 1200/2048, BC7 + 때로 `[alpha]` 텍스처 → 알파로 합침)을 캔버스 그대로 긴 변 ≤1024,
    WebP q85(알파 유지)로 `public/assets/local/chararts/<charId>.webp`에, `data/local-assets.json` 그룹 `chararts` → `{ <charId>: { path, w, h,
    kind: 'Illust', frame } }`(쓰기 직전에 다시 읽어 병합). 대상: chess.json·diy.json의 charId 128명(토큰은 아트 번들이 없으면 건너뜀), 합계 18.1MB.
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
  「핵심 맹약」·「활성화 필요 인원」 모양(사용자가 준 이미지 1·6)은 도감 화면 것이라 HUD에서는 쓰지 않는다. 캡처 대조: 맹약 줄 간격 170px = 83단위 →
  패널 602×391단위(프리팹 584×379), 위 ≈135(프리팹 132.5).
  - 패널: 위 가운데 고정, 중심이 화면 위에서 322 → 윗변 132.5, 584×379, `detail_bg`. 머리 104 높이(스크롤해도 고정): 맹약 원판(80×80, `bondBoardIcon` +
    아이콘 36, 중심 왼쪽 위에서 43.4 / 49.2), 이름(24, x 80부터), 인원 알약(중심 61.9 아래, x 81.3: 비활성 = `bond_inactive_bg` 빨강 + `title_char_icon`
    #b6b6b6 + 「n/m」 Novecento 18 + 「비활성화」 #fd6969 16, 활성 = `bond_active_bg` + 아이콘 #00f0b4 + `active_icon` ✓ — m은 다음 단계 인원 [추정]),
    오른쪽 위 「중첩 수 n」(25 왼쪽, 34.5 아래, #d0d0d0 / 흰색).
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
  한 줄로 놓으면 深巡 3 → 7(먹은 셋의 기본 저지 2+1+1), 斯卡蒂 1 → 2(사용자 스크린샷의 斯卡蒂 2와 같은 +1). 카드가 읽는 값 — 전투 중 `unitStatsEntry(u, u._s)`,
  정비 중 「开战时」 미리보기 `Match._unitStatsOf`(battleStart 훅까지 실행) — 둘 다 7·2이고 원본 카드도 같은 값(초록 +4)을 보인다. 시뮬레이터 문제 없음.
- 위치 수정(2026-10-06 2차): 라운드 띠 중심을 화면 위에서 34단위로(`player_info_view` 위 고정 156 높이, `group_hud` +44 — 전에는 약 62단위라 위 공백이 컸다),
  🔍 버튼은 띠 중심보다 6.5 위, 맹약 줄은 위에서 55(`bond_list_info_view`, 원 중심 88), matte 96 높이·최소 420 폭, 준비 완료는 틀(161×57) 안에서 판이
  3.1 왼쪽·1.3 아래이고 아이콘·글자는 `panel_content` 기준(글자 중심 판 중심 +17.6, 아이콘은 글자 왼쪽 끝에서 19.7), 플레이어 목록 판은 초상 왼쪽 17(전에는 8.5).
- 그대로 둔 것: 단축키(원본), 준비 완료 아래 플레이어 준비 칸(`panel_player`: `player_bg` + 사람마다 `player_ready` 막대 — 지금은 「준비 완료 n/4」 글자).
- 사용자 제보 수정(2026-10-06 3차):
  - 왼쪽 벤치 칸 선택 불가(제보 10): 정보 카드의 탭 내용(`.dart__pane`, pointer-events auto)이 벤치 줄(y ≈ 620–790, 2000×1125)과 겹쳐 0–2번 칸
    (x ≈ 300–630)을 누르면 카드가 받았다(elementFromPoint = `.dgarrison__head` 등). 이제 탭 내용은 누름을 보드로 넘기고 버튼·링크·`[title]`·
    썸네일만 받는다(hud-art.css). 탭 줄·머리·능력치 칸은 그대로 받는다.
  - 선택 마름모가 카드를 덮음(제보 14): `Underframe`이 마름모를 따로 그린다(`.uframe.uframe--dia`, 버튼 없는 층). 공식 모양에서는 z 8로
    카드(z 9) 아래, 撤退·出售 버튼(`.uframe[data-uid]`)은 그대로 z 12. 원본 모양은 둘 다 z 12라 보이는 것은 같다.
  - 채팅 자동 스크롤(제보 3): 원본 `ChatLog`는 맨 아래에서 24px 넘게 올라가 있으면 새 줄에 따라가지 않는다 → 내가 보낸 줄이면 항상 맨 아래로,
    한 프레임 뒤에 한 번 더(줄바꿈·글꼴이 늦게 잡힐 때). headless에서는 맨 아래에 있을 때 원본도 따라갔으므로 사용자가 조금 올려 둔 상태였다고 본다 [추정].

## 상점 화면 (2026-10-06)
사용자 요청: 상점을 실제 게임과 같게. 근거는 EN 클라이언트 `ui/autochess/[uc]autochessbattle.ab`의 프리팹(`autochess_shop`, `autochess_shop_card_item`,
`autochess_shop_cost_item`, `autochess_shop_bond_item`)과 사용자가 준 실제 게임 스크린샷 3장.
- 그림: 웹 소재(`data/assets.json` ui `shopPanel/*`·`shopCard/*`·`garrisonTypeIcon/*`)라 로컬 클라이언트가 없는 플레이어도 같다. 가격 육각형
  (`cost_bg_1`/`cost_bg_2`)만 로컬 추출본(ui/battle)이라 없으면 원본 CSS 육각형. 웹 그림이 없으면 `has-shop-art`가 붙지 않아 원본 모양 그대로.
- 크기: 프리팹 단위(카드 158×176, 승급 111×175, 접기 상자 168×184, 버튼 128×55). 1단위 = 1920×1080 기준 1.5px(클라이언트 값, 근거는 「정비 화면 HUD」
  「크기 단위」; 2026-10-06까지 스크린샷으로 맞춘 1.08px). 단 6칸 상점(약 1270단위)이 왼쪽 아래 원본 버튼(소통·채팅·설정·설명·전체 화면, 약 4.4rem —
  공식 정비 화면에는 없음)을 덮지 않도록 `min(.015rem, (100vw − 4.75rem) / 1270)`: 16:9에서 6칸이면 약 1.15px로 그려진다.
- 정렬 수정(2026-10-06 2차, 사용자 「박스가 어긋남」): 원인 둘. ① 클라이언트에서 9-slice(`m_Type` 1 + `m_Border`)인 그림을 `100% 100%`로 늘려 그렸다 —
  가장자리 빛·여백까지 늘어나 판과 틀이 어긋남. 이제 `border-image`로: `ready_bg` 48×49(테두리 23), `ready_frame` 23×20(l 9 / b 7 / r 10 / t 8),
  `cancel_bg` 51×49, `frame_mid_normal`(t 18 / b 12), `matte`(l·r 178), `bg_player_list`(l·r 30, t·b 25), `acbattle_img_bond_title`(l·r 9, t 8, b 6).
  (`bg_board`도 9-slice지만 균일한 반투명이라 그대로.) 웹 소재 PNG 크기는 `battle_repeatline`·`repeat_line`(1px 작음) 말고 모두 스프라이트 rect와 같다.
  ② 손으로 맞춘 위치가 프리팹과 달랐다: `upgrade_disable`/`upgrade_max` 그림에 LEVEL·잠금 아이콘이 박혀 있는데 우리 LEVEL 글자를 또 그림(→ 그 상태에서는 숨김),
  LEVEL·숫자·「승급」 위치(상자 위에서 51.5 / 75.5 / 157.6, 프레임 안 기준 18.5 / 42.5), 자금 알약(접기 상자 윗변에 중심, −18.8), 접기 상자 그림(3.5 왼쪽·위),
  동결/갱신 아이콘(중심 −26.5)·글자(+18.5, 1 위)·갱신 판(147 폭, 1 왼쪽). 크롭: 스크래치 `hud/align/c2000-*`, `c1920-*`.
- 카드: 오른쪽 위 초상화, 왼쪽 흐린 워터마크 = 기물의 첫 特质의 유형 아이콘(프리팹 `garrison_icon` 65×65·35 %, `garrisons.json eventTypeIcon`
  → `garrisonTypeIcon/icon_*`; 스크린샷의 에스텔·아르케토·锡人과 맞음. 刺玫는 우리 데이터 icon_bond인데 스크린샷은 icon_gold — 2026-10-06 확인:
  프리팹 `garrison_icon`은 그림이 비어 있고 카드 스크립트 `_garrisonIcon`이 실행 중에 채운다(규칙은 네이티브). CN 표는 두 시즌 모두 icon_bond
  (act1 `garrison_25` 获得时 盟约+2, act2 `garrison_154` 休整期结束时 维多利亚+1)이고, 한국 서버 표는 구할 수 없다(Kengxxiao YoStar 저장소는
  2025-11에서 멈췄고 `act1vautochess`만 있음, 클라이언트 표는 `anon/*.bin` 암호화). **해결(2026-10-06, 사용자 KR 캡처):** 지금 시즌 KR 벤델라(刺玫)
  카드 워터마크는 사슬(icon_bond), 정보 카드 特质 칩은 「지속 중첩」 <휴식 기간 종료 시> 활성화된 [빅토리아] 중첩 수 +1 = 우리 데이터(act2 `garrison_154`)와 같음
  → 규칙·데이터 모두 맞다. 처음 스크린샷의 icon_gold는 다른 시즌·다른 카드였던 것으로 본다. 정비 능력 特质(예: 락락 <획득 시>)는 마름모(icon_gold)),
  맹약 줄(14px #b7b7b7) 위에 이름 띠(직군 아이콘 + 이름 16px), 아이템은 설명 없이 그림 + 이름, 팔린 칸 `[ NO INFO ]`, 돈이 모자라면 회색 막.
  업로드 화면에 없는 원본 기능(스킬·모듈 표시, 승진 가능 표시, 두 번 눌러 사기)은 남겼다. 스킬 아이콘은 오른쪽 아래(사용자 요청).
- 첫 탭(선택) 상태(2026-10-06, KR 캡처 20): `btn_double_check` group_able — 카드 아래쪽에 `bg_doublecheck1`(158×125, 청록, 카드 중심보다 25.5 아래),
  「구매 확인」 22 Heavy #dcfff7(중심보다 62 아래), 아트 어둡게; 살 수 없을 때 group_disable(`bg_doublecheck2` 회색, #e4e4e4). 원본의 「한 번 더 누르기」와
  들어 올림은 남김. 동시에 왼쪽 기물 정보 카드가 그 오퍼레이터(立绘 포함)로 열린다(원본 동작 그대로). 그림 변수는 `hudArt.js`(`--ha-dc1/2`), CSS는
  hud-art.css. ko 「确认购买」 → 「구매 확인」(ui.json이 official.json의 「구매한다」를 덮음).
- 단축키는 원본 그대로(D 승급 · F 동결 · R 갱신): 스크린샷의 G/S/D/A는 그 유저가 바꿨을 수 있다(사용자 판단 2026-10-06).
- 동결 버튼 (2026-10-06 프리팹으로 확인): `btn_frozen`의 3상태 스위치가 `_unselect` = `group_disable`(`bg_lock` + `frozen_icon_lock`),
  `_firstSelect` = `group_lock`(`frozen_bg_normal` 파랑 + `frozen_icon` 눈송이), `_secondSelect` = `group_unlock`(`frozen_bg_unselect` 흰 파랑 + `frozen_icon2`
  빗금 친 눈송이)이다. 그룹 이름은 상태가 아니라 누르면 하는 동작(잠그기·풀기)이고, 원본도 동결 중에 `frozen_icon2`를 쓴다 → 평소 파랑 + 눈송이,
  동결 중 흰 파랑 + 빗금 눈송이(지금 코드 그대로). 어느 그룹을 켜는지는 네이티브 코드라 아이콘 짝으로 판단했다. 비활성(관전 등)은 `bg_lock` +
  회색 아이콘(`*_icon_lock`과 같은 그림이라 CSS 회색 필터로 근사, 갱신 버튼도 같음).
- 아직 없는 것: 접기 상자의 마스코트 Spine(`trap_1096_acshopup`, 텍스처 미추출 — PIXI로 따로 그려야 함), 웹 소재의 `shopPanel/level`이 다른 그림이라
  승급 상자의 "LEVEL"은 글자로 그림.

## 휴식 진입·현상 수배·전투 종료 화면 (2026-10-06)
사용자 요청: 휴식 시간 진입, 현상 수배 선택, 전투 종료를 실제 게임(KR 클라이언트 영상 캡처)과 같게. 근거는 EN 클라이언트
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
  2026-10-09 사용자 제보 전까지 상한 없이 누수 수를 그대로 띄워 실제 LP −10인데 배너만 17로 보였다),
  셈하지 않는 누수만 있으면 → panel_miss 제목만([추정], 캡처 없음). 공통: 모서리 `left_cross`, `left_frame` 괄호, `doc_text_01/02`(#18e6b8),
  오른쪽 SIGNAL `doc_01` · 점 2×3 `dot_blank`(#28c79f, 알파 .6/1/.2/.6/.4/1) · 오른쪽 위 점(#279481). 보스전(최종 공세·隐秘核心)은 공식에 다른 프리팹
  (`panel_win_*`, `panel_lose_*`)이 있어 이 배너를 띄우지 않는다. **이 그림들은 웹 소재에 없어 로컬 추출(ui/battle)이 있을 때만 배너가 뜬다**(없으면 upstream의
  「作战结束」 상자). 내 전투 결과가 오지 않은 라운드(서버 전투 모드·재접속)는 SETTLE에 띄우고, 라운드마다 한 번만 — 위 「0.2.0 병합」 J-3.
- 9-slice 판은 `::before`로 그린다(판 자체에 테두리를 주면 자식 위치 기준 상자가 테두리만큼 줄어든다).
- 번역(ui.json): 「选择后不可更改」「轮到你了」「确认选择」(공식표의 「확인」 대신 KR 캡처의 「선택 확인」 — 모든 确认选择에 적용) 「战斗结束」「完美作战！」「目标生命值减少」.
  CN 원문 문자열은 클라이언트 문자열표에서 못 찾아 [추정](KR 캡처 문구로 역추정).
- 개발 목업: `dev/game-mock.html`에 ROUND_START(라운드 3, 자금 +6) 추가.
- 사용자 제보 수정(2026-10-06 3차):
  - [获得]가 늘 0(제보 4): 서버는 `m.private`(새 자금)를 먼저, 10/s로 묶인 `m.public`(단계 ROUND_START)을 나중에 보낸다 → `useRoundGold`가 단계가
    바뀔 때 잡는 기준값이 이미 새 자금이라 차이 0(디버그 고정 99가 아니어도, 실제 서버에서 1–3라운드 모두 0 확인). 또 배너는 단계가 PREP로 바뀐 뒤에도
    떠 있어 그때 0으로 떨어졌다. 수정: `server/local-patch.js`가 `Match.startRound` 동안의 `addFunds`를 모아 `m.private.roundGold { round, gain }`로
    보내고(자금 고정 중에는 고정 전 금액 합), `useRoundGold`는 이 라운드의 값이 있으면 그것을, 없으면(원본 서버) 예전 차이를 쓴다. 배너는 한 번 받은
    값을 끝까지 유지. 확인: 실제 솔로 판 1–3라운드 +4/+5/+6(고정 없음·`SP_DEBUG_FUNDS=99` 모두).
  - 선택 화면 배경(제보 12): 원본은 왼쪽 2.8rem(플레이어 목록 칸)을 비운다 → 공식 모양에서는 화면 전체(`.gm > .spov.has-phase-art`).
  - 왼쪽 아래 버튼(소통·채팅·설정·설명·전체 화면, 제보 13): `.gm__corner`를 `.gm__hud`(z 3 쌓임 맥락) 밖, 선택 화면 뒤로 옮겼다(`screens/game.js`).
    평소 z 3(HUD 위 — 정보 카드에 가려지지 않음, 방향 휠 z 6 아래), 선택 화면이 있으면 `is-over-choice`로 z 21. 위치는 안전 영역만큼 띄운다.

## 배치 UI (2026-10-06)
사용자 요청: 보드에 기물을 배치할 때(드래그·방향 선택)를 실제 게임과 같게. 근거는 사용자가 준 KR 클라이언트 플레이 영상 캡처 2장(2000×1125,
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
- 배치 중인 기물(드래그 중·방향 선택 중) 반투명 `GHOST_ALPHA` 0.6 [추정](사용자: "배치할 때는 투명도가 더 들어가는 것 같아").
- 방향 선택(`ui/placeArt.js`, 공식 그림이 있을 때만 — 없으면 원본 휠): 클라이언트 `panel_direction_selector` 구성대로
  - 마름모(`offset` 426 회전 −45°, 반대각 301단위)의 네 꼭짓점 쪽 L자 테두리(흰색, 고른 방향은 `_highlightColor` 255,226,176) + 고른 꼭짓점에
    `sprite_direction_arrow`(빛나는 V). 마름모 밖은 검정 39 %(`mask_*`, HUD까지 — 캡처에서 밖이 0.61배).
  - `panel_cancel_hint`(회전한 사각형의 (−327, 0) = 왼쪽 위 변 바깥): 방향이 없을 때 `btn_cancel`(빨간 변 + ✕ 태그, 눌러서 취소), 방향을 고르면
    `btn_drag_back`(검은 말풍선), 0.16초 페이드. EN 그림의 영어 글자는 잘라내고 게임 문자열을 그린다: 取消 → 취소, 拖回中心区域取消 → 「방향을 가운데로
    되돌려 취소」(KR 캡처 문구로 ko 번역 변경).
  - [추정] 마름모를 바닥 평면에 투영(아래 칸의 화면 모양으로 기울임)하고 반대각 2.6칸(`DIR_HALF_TILES`, 캡처: 약 325 px / 칸 125 px). 말풍선은
    글자가 눌리지 않게 화면에 똑바로. 엄지(`sprite_direction_thumb`)는 캡처에 안 보여 그리지 않음.
- 2D 보드(WebGL2·로컬 그림 없음)는 초록·주황 강조가 원본 그대로(방향 선택 그림만 공식).
- 확인: `dev/game-mock.html?stage=act1autochess_m02`(사막)·`act2autochess_m01`, 2000×1125·1920×1080 headless 캡처를 사용자 캡처와 나란히 비교,
  취소 태그 누르기·방향 확정 동작. 테스트 `test/render/placement-ui.test.js`.
- 서버에 올릴 것(git 밖): `public/assets/local/ui/battlecommon/`, `public/assets/local/battle/common/`, `data/local-assets.json` → `build-browser-resources.mjs`.

## 전투 화면 UI (2026-10-07, 진행 중)
사용자 요청 「전투 화면 UI를 공식 인게임과 똑같이」: ① 아군 체력·SP·탄환 바 + 기물 레벨 → ② 적 HP(보스 포함) → ③ 원소 원형 바 → ④ 데미지·회복 숫자 순서,
항목마다 근거를 보여 주고 사용자 확인 뒤 고친다. 상태 표시(寒冷 눈꽃·冻结 얼음 블록·战栗 주먹·은신·위장)도 사용자 요청으로 뒤에 추가.
근거: EN 클라이언트 `arts/ui/[uc]battlecommon.ab`(바 프리팹·스프라이트), `battle/[pack]common.ab`(`hud_unit`, `damage_text`, `heal_text`),
`ui/autochess/[uc]autochessbattle.ab`·`battlecommon`의 `act1autochess_battle_dummy_hud_plugin`(정비 칩) — `tools/local-extract/ui_inspect.py`로 읽음 —
과 사용자 중국 서버 캡처(2000×1125, numpy 측정). 캡처 원본은 세션 scratchpad `cap/cn-battle-4~8.png`, `cn-status-*.png`.

**크기 단위 (사용자 결정 2026-10-07 「제시한 기준대로」)**: 공식 유닛 HUD는 화면 공간 캔버스라 카메라·원근과 상관없이 같은 크기다 —
캡처에서 앞뒤 줄(칸 간격 168 / 177 px)의 바가 모두 128~129 px = 프리팹 125단위 × 2000/1920. → 1단위 = `min(폭/1920, 높이/1080)` CSS px
(`hud-bars.js hudUnit`; 16:9가 아닌 화면의 맞춤 방식은 CanvasScaler 값을 못 찾아 [추정]). 해상도에 비례: 1280×720 83px, 1920×1080 125px, 4K 250px.
예전 바는 칸 크기 × 0.64(24~96px 제한)라 뒷줄이 작고 4K에서 공식의 약 40 %였다.

**① 아군 바** (`AllyBars`, 아군 = 오퍼레이터·소환물):
- 위치: 프리팹은 `hud_unit` 중심에서 HP 바 중심이 54.5단위 아래. `hud_unit` 중심 = 발(배치 링 중심, 신발이 서는 곳) 위 24.5단위로 둔다(`HUD_ANCHOR`, [캡처]) —
  처음엔 발 = `hud_unit`로 54.5 아래에 그렸더니 낮았다(사용자 확인 + 캡처 13). 캡처 5 / 6 / 13에서 링 중심 → HP 중심 27 / 29 / 33.7단위 → 약 30단위.
  정비 칩·장비 바도 같은 기준점(캡처 4의 칩도 프리팹 자리보다 약 16단위 위). 예전에는 머리 위.
- HP 125×7 `#49b2e3` α.7, 그 뒤에 최근 깎인 만큼 흰색 α.7(`slider_back`, 예전 잔상 계산 그대로). 30 % 미만 노랑은 공식에 없어 뺐다.
  SP 125×7을 HP 바로 아래(간격 0): 충전 `#caec46` α.7, 지속형 스킬 중 남은 시간 `#ffa800` α.7(`char_sp_cast_slider`).
  받침 = `sprite_bg`(9-slice, 테두리 4/5): 검정 α.70 가운데 + 4~5px 부드러운 그림자, 검정 α.5 틴트 → 가운데 α.35. 프리팹은 받침을 바보다 8.6 × 10.32 크게
  (133.6 × (14 + 10.32)) 두는데 그 여분이 바로 그림자 폭이라, 가운데는 바 밑에 깔리고 바깥엔 부드러운 그림자만 보인다 — 사용자 「불투명도가 들어간 바 위에 색 바」
  (캡처 14). 처음엔 딱딱한 1단위 여백을 줬다가 테두리처럼 보여 없앴었다. 그림(로컬 추출)이 없으면 바 크기 그대로 α.35 사각형.
- SP 가득 참 빛 없음(사용자 결정: 캡처에 없고 자동 발동이라 순간).
- 탄환형 스킬(사용자: 「탄환 개수에 따라 bar가 나뉜다」): `char_bullet_bar` 받침 `#e56d00` α.31 위에 남은 탄환마다 칸. 칸은 코드(UIBulletBar)가 만들어
  프리팹에 색이 없다 — [추정] 캡처 측정: 색 ≈ `#ffa800`(G 168 일치), 간격 2단위(7발: 16~17px 칸 2px 간격, 19발: 약 4.5px 칸 같은 간격). 칸이 1px보다 좁아지면 남은 비율 한 줄.
  탄환 수는 시뮬레이션이 `b.snap.ammo = [[id, 남은, 최대]]`로 넘긴다(`server/sim/local-hud.js`; 시뮬레이션은 브라우저에서 돈다 — `battle/runner.js`).
  성능(사용자 요청 점검): 유닛 48개 전투에서 `ammoList` 0.5µs/스냅샷 = 스냅샷 전체(22.5µs)의 2.2 %, 칸은 `Texture.WHITE` 스프라이트라 배치가 늘지 않는다.
- 보호막 줄(`UF.SHIELD`)은 공식 근거가 없어 HP 바 바로 위 얇은 줄로 유지. 상태 아이콘 줄은 머리 위 그대로(상태 표시 단계에서 바꿈).
- 원소 줄은 ③ 전까지 바 받침 아래로만 옮김.

**기물 레벨**: 전투 중에는 없다(캡처 5·6·8 — 사용자 확인 「전투중에는 안나와」). 정비 중은 `shop_hud`의 `chess_level_icon`
(`autochess_level_N`, rect 42 / 텍스처 37.85, 루트 배율 1.25, 발에서 (-45.5, +128)단위). 그 그림은 38px라 1.25배로 키우면 흐렸다(사용자 「화질이 좀 낮아보여」) →
같은 디자인의 상점 카드 칩 `img_chess_level_N`(45px; 숫자가 어두운 안쪽의 0.53 × 0.70 — 두 그림 같고 캡처 4는 0.51 × 0.69)을 쓰고, 안쪽 39px를 공식
30 × 1.25 = 37.5단위에 맞춘다(캡처 4 안쪽 39px = 37.4단위). 웹 manifest `shopCard/` → 로컬 `ui/battle` → `autochess_level_N` → 없으면 원래 그린 칩(PR 가능 유지).
칩 위치·크기는 사용자가 직접 확인하기로 함(2026-10-07 「일단 지금 그대로」).
2026-10-08: 모델이 클라이언트 크기(0.864배, 「유닛 모델 크기」)로 작아진 뒤 사용자 「작아진 크기에 맞춰 레벨칩 높이도 낮춰줘」 → 발에서 칩까지 높이를
같은 비율로: (24.5 + 128) × 0.864 − 24.5 = 107.3단위(`PREP_CHIP.y`). 프리팹 128과 다르다 [사용자 결정]. 확인 `sp-check\chiplow.png`.
같은 날 사용자 비교 캡처(望, 우리 `research/2026-10-07-user-issues-3/wang-chip-9.png` ↔ 공식 영상 `wang-chip-10.png`, 「칩 위치는 약간 더 올려야」):
칩 크기(화면 고정)를 단위로 재면 칩 중심 → 눈 높이가 공식 53.7 / 우리 45.8단위 → `PREP_CHIP.y` 115. 모델 크기(얼굴 폭 44 / 45단위)·칩 x 오프셋은 같다.
비교 `sp-check\wangchip-compare.png`(수정 전 · 후 · 공식), 스크립트 `wangchip.mjs`. [추정: 공식 프레임은 공격 동작 중이라 머리 위치 ±2px].

**장비 바 (정비 중)**: 사용자 캡처 + 설명 「장착된 아이템이 있을 때만 2칸 바, 하나만 장착되면 한 칸만」. `shop_hud`의 `equip_bg`(74×30, shop_hud 안 (13, 29.4) —
칩 오른쪽, × 1.25)와 칸 `equip_0`/`equip_1`(23×6, ±12.8 / 13): 아이템마다 흰 알약(`equip_normal_icon`), [추정] 금색 아이템이면 빛나는 금색 알약(`equip_gold_icon` 31×14,
제 크기). 이 바가 그려지면 예전 아이템 아이콘(item pips)은 숨긴다(캡처에 아이콘 없음). 그림은 로컬 추출(`extract.py --only ui/battlecommon`)만 있어서
없는 서버는 예전 아이콘 그대로. 금색 여부는 `render/app.js`의 `setItems` 옆 `setEquip` 한 줄씩(2곳)이 넘긴다. **배포할 때 로컬 소재(`public/assets/local/ui/battlecommon`)도 올려야 한다.**

**② 적 HP** (`EnemyBars`; 처음엔 맞기 전 숨김 — `_alwaysShowHp`는 圣堂剑士만 켜짐 — 보스는 늘 보임):
- 일반·정예: `enemy_hp_slider` 105×7 `#ea4700` α.7, 흰 α.7 잔상, `sprite_bg` 받침 8 × 8.55 크게(`enemy_slider_background`; 위 그림자 설명), `hud_unit` 아래 55.3(캡처 ≈110px).
- 보스(거대 패널이 아닌 보스 — 铳·卢西恩 등): `enemy_boss_hp_slider` 130×9 `#ea2727` α.85, `hud_unit` 아래 43, `sprite_bg` 받침 10×8 크게
  (처음엔 딱딱한 사각형이라 테두리로 보였다 — 사용자 캡처 14로 그림자 받침임을 확인); 문양 `sprite_enemy_boss_hud_small`(57×65, 바 중심 7 아래)이 바 뒤에;
  SP(`enemy_boss_sp_slider` 130×6 `#ebc9ff` α.7, 받침 10×7 크게)는 HP 바로 아래 [추정 위치] — SP 있는 보스만.
- 거대 보스(사용자 「위수협의 모드에서만 넓게」): 보스 프리팹에 `_bossHudScale`이 있는 적(`EnemyGiantBoss`)은 `battle/[pack]common.ab`의
  `panel_enemy_boss_info`를 쓴다 — HP 798×10 × x 배율(胄·管·阿利斯泰尔·萨米的意志 0.35, 昆图斯 0.765; 관 캡처 ≈281 × 9.3단위 ✓) `#ff2b2b` α.8,
  흰 α.7 잔상, 검정 α.39 딱딱한 받침(800×12 — 캡처 14의 SP 바 둘레 검은 테가 이것)과 흰 α.39 테(`sprite_enemy_boss_hp_bg` 9-slice 816×28: 회색 가운데 위아래에
  어두운 선; 테두리도 가로 배율로 눌림), SP(`default_sp_slider` 798×8 `#cab2d4` α.8, 받침 800×12, 테 816×24)는 HP 중심 16.3 아래 [캡처 8], 문양 `sprite_enemy_boss_hud_large` 폭 ≈39단위([캡처 8·10]),
  맞을 때 빛(`hit_effect` = `sprite_bar_glow` 9-slice 818×31 `#ff0000` α.78 — 사용자 결정, 0.35초 사라짐 [추정]). 중심 = 보스 발 [추정 — 배치는 네이티브 코드,
  캡처에서 발 근처], `_bossHudOffset`만큼 타일 단위로 옮김 [추정 단위](萨米的意志 위 1.4, 昆图斯 위 1.02, 管 II 오른쪽 1.4). 표는 `GIANT_BOSS`(적 프리팹 전수 조사).
- 圣堂剑士 탄약: HP 바 바로 아래 같은 폭에 아군과 같은 탄환 칸([추정] `enemy_bullet_bar` 105×7).
- **보스 SP 바와 관·현의 공식 SP** (사용자 결정 2026-10-07 「공식과 같은 a안」): 공식은 쿨다운이 아니라 SP다(`enemy_database` spData: 管 INCREASE_WITH_TIME
  0/50 +1/s, 裂管之奏 spCost 50·cooldown 50·initCooldown 40; PRTS 「技力 0/50 自动回复 1.0 SP/s」; 阿利斯泰尔 maxSp 25; 胄·萨米的意志·昆图斯·铳·卢西恩은 spData 없음
  → SP 바 없음). 시뮬레이션 `content/bosses.js skillSp`: SP는 행동할 수 있을 때(기절 아님) 초당 increment, 스킬은 쿨다운이 끝나고 **SP ≥ 비용**일 때 발동
  [추정: 둘 다 필요 — 클라 로직은 네이티브], 발동하면 비용만큼 소모. 管 첫 발동 40초 → 50초(테스트). 같은 구조의 弦(엘리트, spData 0/35, 断弦之奏 25·icd 12)도
  같은 규칙(첫 발동 12초 → 25초). 阿利斯泰尔은 원래 SP를 세고 있어 값만 노출. 막대는 `b.snap.bsp`(`local-hud.js hudLists` — `ammo`와 한 번에 돈다).
  성능(사용자 요청 점검): SP 틱 0.06µs = 전투 한 스텝(88µs)의 0.07 %, `hudLists` = 스냅샷의 2.2 %(이전 `ammoList`와 같음).
  [추정] 凋亡 폭발 「15秒内无法开启技能，每秒损失1点技力」(적 쪽)은 아직 없음.
- 맞을 때 흔들림(원본 `shake`)은 새 바에 적용하지 않는다(공식 없음).

**③ 원소 원형 바** (사용자: 「원형 바, 가운데에 원소 유형별 아이콘」; `hud-bars.js ElementRing`): 클라이언트 `char_ep_slider`·`enemy_ep_slider`. 그 스크립트
(UIHudUnitEpSlider)의 `_elementDatas`가 시뮬레이션 `ELEMENT_ORDER`(neural, erosion, burn, apoptosis) 순서로 원소별 색·아이콘을 갖는다 —
아군: `#00ffd8` + `sprite_ep_icon` / `#3da1ff` + 물 / `#ff4901` + 불 / `#474747` + 어둠, 적: `#149882` / `#266ad0` / `#e3531a` / `#7c7c7c`(폭발 색 `#1c1c1c`), 'necrosis'는 凋亡 것 [추정].
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

**④ 데미지·회복 숫자** (사용자 결정 2026-10-07: 표시 조건은 제안대로, 모양은 공식 프리팹대로, 「지금 표시 방식도 설정에서 고를 수 있게」):
- 프리팹(`battle/[pack]common.ab`): `damage_text`(UIDamageText) Novecentowide 30 `#ff3a00`, Shadow 검정 α.5 (1, −1), `_randomRange` (10, 5), `_lifeTime` 0.5,
  `_upOffset`/`_downOffset` 30, `_fontSizeScale` 1.5; `heal_text`(UIHealText) `#00ff95` "+n", `_floatOffset` 40; `hud_unit`의 `popup`(중심 위 150)에서 생김.
- 언제(데이터 전수 조사 69,123개 컴포넌트, scratchpad dmgnum/NOTES.md): 숫자 표시를 데이터가 강제하는 건 극소수 — 로스터에선 蕾缪안 S3 포탄
  (`lemuen_s3_attack` FixedValueDamage `_forceDisplayDamageNum`)과 적 xi·mdrock·mousek 보호막 흡수(`BlockDamage._showDamageNumber`, **아직 안 함**).
  나머지는 코드: `Modifier.isCritical`, `BattleConsts.MODIFIER_CRIT_THRESHOLD = 1.5`, `UIDamageText.CRITICAL_FONT_SIZE_SCALE = 1.1`(메타데이터 기본값).
  치명타 = PRTS 作战机制 「伤害红字（暴击）」 「单位在造成的伤害不低于预期伤害的1.5倍时，会在造成伤害后弹出红色的数字…官方称呼为Critical」 —
  예상 피해 = ATK × 배율을 대상 방어/법저로 깎은 값(穿透 제외), 실제 피해 = 脆弱·피해 배율·穿透까지 넣은 값 → 빨간 숫자는 사실상 脆弱·增伤·穿透와 함께 나온다
  (처음 커밋 e071dde8은 「ATK × 1.5 이상」으로 잘못 봤다 → 고침). 강제 표시는 PRTS 「强制红字」의 蕾缪安 归乡邀约(瞄准射击时 — 우리 S3 'snipe'·'bombard' 태그).
  보호막: PRTS 「强制红字与蓝字」 — 빨간 숫자가 될 타격이 屏障/护盾을 못 뚫으면 그 막기 방식이 허용하면 파란 숫자(클라 `block_text` `#3a35d9`, 나머지는
  damage_text와 같음), 거부하면 노란 「BLOCK」 → 막힌 타격에 빨간 숫자는 없다(사용자 기억과 같음). 허용 플래그 = `BlockDamage._showDamageNumber`(115개 중 17개,
  로스터에선 xi·mdrock·mousek 보호막). **구현(사용자 결정 「파란 숫자랑 BLOCK 넣어줘」)**: 시뮬레이션이 빨간 숫자감(치명타·강제) 타격을 보호막이 전부 막으면
  'blk' 이벤트 [id, 피해, 1 파란 / 0 BLOCK] — `damage.js absorbShields`(흡수한 버프 키를 `info`로 돌려줌)와 `enemies.js artsBarrier`(법술 장벽, 취소 시);
  허용 키 = `local-hud.js BLOCK_SHOWN`(`ab:xiShield`, `ab:sandDef` 鼠王, `ab:rockPower` 泥岩). 렌더: `num-official.js` 파란 숫자 `#3a35d9`(block_text),
  노란 「BLOCK」 `#ff9000`([추정 모양] 클라 그림 못 찾음 — PRTS 색), 공식 숫자 방식에서만. 보호막을 뚫은 타격은 그대로 빨간 숫자(흡수 뒤 HP 감소량).
  「卫戍协议：盟约」 전 동시 10개 제한은 안 함(그 뒤 버전은 제한 없음). 회복 `+n`은 데이터에 끄는 플래그가 없어 늘 표시 [추정;
  PRTS·나무위키 언급 없음]. 전투 공식 정리: `research/battle-mechanics-reference.md`.
- 시뮬레이션: `server/sim/local-hud.js damageNumberFlag(dmg, ss, 예상, 실제)` → `damage.js`(피해 배율까지 계산한 뒤)가 'dmg' 이벤트 5번째 칸(0 / 1 치명타 / 2 강제).
  지속 피해('dot')·무来源은 치명타 아님.
- 렌더: `render/num-official.js` — 피해는 플래그 있을 때만, 회복은 늘. 30단위(화면 고정 hudUnit), 치명타 ×1.1, 0.5초, 흩어짐 ±(10, 5), 위로 30(회복 40,
  ease-out), 처음 0.2초에 1.5배에서 줄어듦·마지막 30 % 사라짐 [추정 — 애니 코드는 네이티브]. Bitmap 글꼴(Novecento Wide, 이미 `public/fonts`에 있음).
- 설정 「伤害数字样式 / 대미지 숫자 방식」: 공식(기본) / 전부 표시(예전 숫자 — 유형별 색·합산·줄 배치), `sp.pref.dmgNumberStyle`(`render/number-style.js`);
  「대미지 숫자 표시」를 켰을 때만 보인다. 2D 대체 화면(`ui/fallbackField.js`)의 숫자는 그대로.
- 디버그 아레나·mock: 회복 `+180`만 뜨고 일반 피해는 숫자 없음; 테스트: 蕾缪안 S3 강제 표시, 같은 전투에 脆弱 ×1.6을 걸면 빨간 숫자가 생김.

**⑤ 상태 이펙트** (사용자 요청 「冷氣·冻结·战栗·은신·위장 … 그 외 상태도 확인 후 같이」, 방법 1 = 공식 이펙트 그대로; `render/fxstatus.js` → `fxgame.js statusOn/Off`):
공식은 상태를 아이콘 줄이 아니라 이펙트 프리팹으로 보인다(캡처 9·10). 프리팹은 `battle/prefabs/effects/buff.ab`·`common.ab`(`fx_extract.py --bundle buff/common`,
index.json에 두 번들 추가 — 기존 125개 그대로), 전부 루프(`_isLoop` 1), 붙는 곳은 `_spawnLocation`(1 발, 2 몸 HIT, 4 머리, 5 바닥 중앙 — 데이터).
상태 → 프리팹은 이름으로 맞춤(클라 매핑은 네이티브, 메타데이터 `COMMON_EFFECT_PREFIX`) [추정]:
晕眩 `buff_stun`(머리) · 冻结 `buff_autochess_frozen`(발, 얼음 덩어리) · 寒冷 `buff_cold`(머리 눈꽃 — 冻结 중에도) · 沉睡 `buff_sleep`(몸) · 沉默 `buff_silence`(머리) ·
恐惧 `common_buff_fear` · 战栗 `common_buff_thrill`(머리 주먹 — 캡처 10; 예전엔 공포 아이콘으로 잘못 연결) · 缴械 `common_disarm_icon` · 减速 `buff_slowdown`(발) ·
迟缓 `buff_sluggish`(발) · 攻速下降 `buff_attack_speed_reduction_01`(발) · 虚弱 `buff_weak` · 防御下降 `buff_defdown` · 法抗下降 `buff_magic_resistance_down` ·
脆弱(4종) `buff_ fragile_01`(발) · 浮空 `common_levitate_01`(바닥) · 적 隐匿 `common_invisible`(발; 그 ColorModifier대로 모델 회색 .5·α .894 — 예전 45 % 반투명 대신) ·
아군 隐匿 `common_stealth` [추정] · 迷彩 `common_buff_micai_01`(몸) [추정: 세 변형 중 _01].
- 머리 높이 = 모델 높이 × 1.1 [추정 — 캡처 10의 주먹이 머리 위], 몸 .5, 발 0(`fx.js bodyZ`). 늘 위 캔버스(유닛 위)에 그린다: 이펙트 세션의 렌더러별
  위/아래 나누기(5ca3807e, sortingOrder > 0 또는 0 + fudge < 0 = 위)를 상태 프리팹에 쓰면 冻结 얼음(전부 order 0·fudge 0)이 유닛 뒤로 가서 캡처 9와 달랐다
  — 클라는 order 0을 깊이로 정렬해 덩어리가 모델 앞에 온다 → 상태 이펙트는 나누지 않는다(`playStatus` `split = false`).
- 일부 프리팹은 파티클이 한 번만 돌아(`buff_silence` 1초) 상태가 남아 있으면 다시 시작한다. 파일을 못 읽으면 그 상태는 예전 아이콘.
- **중첩 수정**(사용자 제보 4차 4-1 「기절이 중첩되면 머리 위 기절 이펙트가 겹쳐 보인다」, 2026-10-08 세션 I, 79fbda88): `statusOff`가 멈춘
  인스턴스의 `again`(다시 시작)을 남겨 두어, 파티클이 다 죽은 뒤 상태가 다시 켜져 있으면(다음 기절) 새 인스턴스 옆에 복사본을 하나 더
  틀었다 — 다시 걸릴 때마다 하나씩 늘었다(아레나 1 2 3 4…, 실제 솔로 판 최대 8). 또 방출만 멈춰서 `buff_stun`의 표시(수명 10초 파티클 1개)가
  상태가 끝난 뒤 최대 10초 머리 위에 남았다. → `statusOff`가 `again`을 지우고, `fxstatus.js`는 `now`로 끝낸다(파티클 즉시 제거
  [추정: 클라는 버프가 빠질 때 그 이펙트를 같이 없앤다고 봄]; 정비 금빛은 예전처럼 서서히). `playStatus`는 같은 유닛·같은 키의 살아 있는
  인스턴스가 있으면 새로 만들지 않는다(로드 중 꺼졌다 켜지면 로드가 둘 걸리던 것). 같은 경로라 목록 전체에 적용 — 수정 전 아레나에서
  18종 중 13종이 겹쳤다(기절·冻结·寒冷·沉睡·减速·攻速下降·虚弱·防御下降·法抗下降·脆弱·浮空·隐匿·迷彩; 沉默·恐惧·战栗·缴械·迟缓은 파티클 수명이
  짧아 거의 안 보였음), 수정 후 18종 모두 최대 1개·상태가 끝나면 0개. 테스트 `test/local-patch-status-boomerang.test.js`.
- 이펙트로 그리는 상태는 아이콘 줄에서 빠지고(`units.js _iconKeys`, `view._fxStatusOn`), 冻结·寒冷 파란 틴트도 그 동안은 안 쓴다. 클라 프리팹이 없는 상태
  (束缚, 嘲讽, 无敌, 护盾, 麻痹, 원소 폭발, 禁疗, 折射, 替身 …)와 이펙트 층이 꺼진 경우(품질 낮음, WebP 없음, 추출 없음)는 예전 아이콘 그대로.
- 디버그 아레나 확인: 寒冷+战栗(눈꽃 위·주먹 아래, 캡처 10과 같음), 冻结+寒冷(캡처 9의 얼음), 沉默 ✕, 脆弱, 沉睡, 迷彩. 아레나에서 WebGL 경고
  `drawElementsInstanced: no buffer is bound` — 상태를 하나도 안 걸어도 나와서 이번 작업과 무관(조사 안 함).
- **배포 때 git 밖**: `public/assets/local/fx/buff/`, `fx/common/`, 새 텍스처·메시, `fx/index.json`.

**배치 방향 표시** (사용자 요청 「배치 방향 표시 화살표도 실제 인게임과 동일하게」, `facing.js`): 오퍼레이터 프리팹의 `Others/Direction/DirectionIndicator` —
땅에 눕힌 SpriteRenderer 2장(배율 0.55): 링 `sprite_direction_ring`(rect 128, ppu 100 → 지름 0.704타일, 흰 α.502)과 화살표 `sprite_direction_arrow`
(rect 128에 65×112가 (31, 8)에 패킹, 바깥쪽 0.333타일, `#FF9900`). 매 프레임 네 모서리를 카메라로 투영한 SimpleMesh라 보드에 눕는다. 그림은 웹 manifest
`ui/battle/sprite_direction_*`(이미 있음); 없으면 예전 주황 셰브런. 청록 링(캡처 13)은 방향을 정할 때 잠깐 뜨는 `common_direction_hint_*` 이펙트로 별개(안 함).

## 위장 아이콘 (2026-10-06, 사용자 결정 「위장에 다른 아이콘을 붙여줘」)
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

## 휴대폰 화면 조정 (2026-10-06, 사용자 요청)
- 맹약 줄 「︽」 접기 탭: 터치 화면(`pointer: coarse` 또는 높이 ≤540)에서는 터치 영역 = 그림(`btn_close` 37×17단위, 최소 폭 24px).
  예전 102×26단위 상자(844×390에서 61×16px)가 12번째 줄 4–6칸 끝을 덮어 그 칸의 오퍼를 누르면 줄이 접혔다 → 24×10px. 접힌 `btn_open`은 그대로. (hud-art.css)
- 리소스 미리 받기 카드: 높이 ≤540에서 화면 전체를 어둡게 막던 대화 상자 → 오른쪽 위 작은 카드(폭 min(240px, 30vw), 글자 11.5px),
  나머지 화면은 그대로 누를 수 있다. 동의해야 받는 동작은 같음. (resources.css)
- 타이틀 설정·전체 화면 버튼(upstream #183): 터치 화면에서 16px 버튼 두 개의 44px 터치 영역이 겹쳐 전체 화면 버튼이 설정 버튼을 가렸다 →
  28px + 간격 14px. (devices.css)
- 확인: Windows PowerShell 서버 + Windows Chrome(GPU) 844×390·740×360·932·430·1920×1080 — 설정 버튼 중심이 자기 버튼, 접기 탭 24×10.

## 서버 재시작 예고 (2026-10-09, 사용자 결정)
- 사용자 결정(2026-10-09): 배포는 이제 늘 진행한다(`--force` 폐지). 바로 재시작하지 않고 30분 뒤에 재시작하며, 그동안 진행 중인 판·대기실에 30·10·5·3·1분 전 예고를 보낸다. 카운트가 끝나면 배포한다.
  공식 게임에는 없는 기능(우리 서버 운영용)이다.
- 서버 `server/local-restart.js` `RestartNotice`: `SIGUSR2`(`server/http/boot.js`, 서버 시작 전에 등록 — 처리기 없는 SIGUSR2는 프로세스를 끝내고, 시작 중에 온 신호는 시작 뒤에 읽는다)를 받으면 `SP_RESTART_FILE`(기본 `<tmpdir>/stronghold-restart`, 컨테이너는 tmpfs `/tmp`)에서
  분(`30`) 또는 `0`/`cancel`을 읽는다. 시작할 때와 `RESTART_MARKS_MIN` 30·10·5·3·1분 전에 hello를 마친 **모든 소켓**(타이틀·로비·대기실·판·관전)에
  `server.restart { inMs, mark }`, 취소는 `{ inMs: null }`. 카운트다운 중에 새로 접속하거나 다시 연결하면 `welcome.restart { inMs }`.
  `inMs`는 남은 시간이라 클라이언트 시계가 틀려도 맞다. 서버는 재시작을 직접 하지 않는다. 끝나고 10분이 지나도 재시작이 오지 않으면 취소로 본다.
  내부 `/healthz`에 `restartInSec`(없으면 null, 프록시 경유 응답에는 없음).
- 마지막 5분(`shared/local.js RESTART_FINAL_MIN`, 사용자 2026-10-09 「재시작 직전 5분 전에 판을 막고, 5분부터는 띠도 표시」):
  - 새 판 시작 막기: `room.start`를 `ERR.RESTARTING`(「서버가 곧 재시작되어 지금은 새 시뮬레이션을 시작할 수 없습니다」)으로 거부. 이미 진행 중인 판은 그대로.
    `SP_RESTART_NO_START_MIN`이 있으면 그 분(0 = 막지 않음). (같은 날 앞서 「일단 구현만 해놓고 활성화하진 마」로 꺼 두었다가 이 결정으로 켬.)
  - 연결 띠(`ui/connBanner.js`): 「서버 재시작까지 m:ss · 진행 중인 판은 종료됩니다」(0이 되면 「서버를 재시작하는 중입니다」). 판 밖 = 아래 가운데,
    판 안 = 라운드 캡슐 아래 한 줄(토스트는 그 아래로 밀림). 휴대폰 가로(844×390)에서도 한 줄.
  - 이 5분 동안은 토스트를 띄우지 않는다(5·3·1분 표시, 접속 때 토스트 모두 — 사용자 2026-10-09 「실시간 카운트다운 띠가 있으면 토스트는 더 안보내줘도
    될 것 같아. 5분부터의 토스트는 제거해」). 서버는 5·3·1분에도 `server.restart`를 보내지만(남은 시간 갱신) 클라이언트가 토스트를 거른다.
- 클라이언트 `public/js/ui/restartNotice.js`: 그 전까지는 **토스트만**(사용자 2026-10-09 「기존 메세지 토스트처럼 잠깐 나왔다가 사라지는 걸」 — 처음 구현의 30분 내내 띠는 뺐다).
  5분보다 큰 `mark`(30·10분)마다 경고 토스트 「N분 후 서버가 재시작됩니다. 진행 중인 판은 종료됩니다」(6초), 카운트다운 중에 접속한 페이지는 welcome에서 남은 분으로 한 번(남은 시간이 5분보다 클 때만)
  (`ui.restartAt`로 이미 알던 페이지의 재연결은 다시 띄우지 않음), 취소되면 알던 페이지에만 「서버 재시작이 취소되었습니다」. 판 밖에서는 위쪽 가운데, 판 안
  (`html.sp-in-match`)에서는 라운드 캡슐 아래(기존 토스트 자리). 재시작 뒤에는 기존 흐름 그대로: `room.closed shutdown` → 재연결 → buildGuard가 새 빌드로 새로고침.
- 배포 쪽(`oci/deploy.sh`): 이미지를 먼저 빌드하고(옛 컨테이너는 계속 서비스), 접속자가 있으면 `docker exec stronghold sh -c 'echo 30 > /tmp/stronghold-restart && kill -USR2 1'`로
  카운트다운을 시작한다. 내부 healthz를 15초마다 보고 0이 되면 재생성한다. 접속자가 없으면 카운트다운 없이 바로 진행하고, 도중에 모두 나가면 앞당긴다.
  Ctrl-C나 실패가 나면 취소 공지를 보낸다. `--now`는 카운트다운 없음, `--notice N`은 N분, `--rollback`은 기본으로 바로 진행한다(비상용).
  이 기능이 없는 옛 서버(healthz에 `restartInSec` 없음)에 접속자가 있으면 멈춘다. 그때는 `--now`로 진행한다.
- 방별 진행 상황(2026-10-09, 사용자 결정 「방별 진행 상황 정도면 충분해」·방 코드는 그대로 표시): 내부 `GET /healthz/rooms`(`server/local-rooms.js`, 프록시 경유는 404)가
  방마다 `{ code, mode, difficulty, phase, round, stageId, bossId, humans, connected, bots, spectators, ageMin, matchMin }`를 준다(진행 중인 판 먼저, 라운드 높은 순).
  `deploy.sh`는 카운트다운 시작 때와, 분이 바뀔 때 목록이 달라졌으면 「ABCD 협동 극한 R7 휴식 기간 · 사람 2(접속 1) 봇 2 · 판 23분」처럼 찍고,
  `oci/deploy.sh --rooms`는 배포 없이 지금 목록만 보여 준다. 지금 상태만 보여 줄 뿐 로그에는 남기지 않는다(판 결과는 `[stats]` 줄).
  확인: `test/local-patch-rooms.test.js`(실제 서버·실제 Match로 대기실·판 시작 뒤 목록, 프록시 헤더면 404).
- 확인: `test/local-restart.test.js`(시점·취소·만료는 가짜 타이머, 실제 서버의 방송·welcome·healthz·판 시작 거부, 실제 프로세스에 `SIGUSR2`, 클라이언트 토스트 조건).
  Windows Chrome(로컬 서버 + `SIGUSR2`): 로비 30분, 정비 화면 10분 토스트(전투 중 5분 토스트는 그 뒤 뺌), 협동 판(AI 3명) 정비·전투·휴대폰 가로에서 5분 띠 위치 확인(2026-10-09).
  띠는 보드 배치 칸·상점·팀원 목록·준비 완료 버튼을 가리지 않는다(사용자 확인 대기).

## upstream 이식 ui-1 (2026-10-09)

upstream v0.2.0 이후 UI 수정 15건(`research/2026-10-09-upstream-compare/ui.md`, 기록 `upstream/ISSUES.md` 「이식함」). 대부분 upstream 버그 수정을
그대로 받은 것이고, 우리 규칙과 맞물리는 것만 적는다.
- 준비 완료 시 상점 접기(`2b236081` ← `7fb41f4f`, 사용자 결정 2026-10-09: 공식도 준비 완료 때 상점이 접힌다 — 사용자 공식 화면 스크린샷,
  「준비 완료, 시뮬레이션 대기 중」 띠 + 대기석만): `gameLogic readyShopFold`가 확정된 `m.private.ready`의 한 정비 안 변화만 본다.
  공식 모양 접기 상자(상점 화면 「접기 상자」)는 같은 `collapsed` 상태라 같이 접힌다. 「준비 완료, 시뮬레이션 대기 중」 띠 자체는 아직 없다.
- 공용 `Modal` 포커스 가두기(`a6ee32fd` ← `e2503c7f`): 맨 위 대화상자 안에서만 Tab이 돌고, 밖으로 나간 포커스는 첫 버튼으로 돌아온다(가이드가 위에 열려 있으면 양보).
  채팅 패널(z-index 6–40)·디버그 패널은 `.modal` 배경(z 80) 아래라 대화상자가 열린 동안 클릭으로 포커스를 못 가져간다 [추정, CSS로만 판단].
- 방향 선택 중 Enter(`102c96a1` ← `a1bc37ed`): 공식 선택기(`placeArt.js` `PlaceWheelArt`)의 ✕도 `.fwheel__cancel`이라 `facingEnter`가 두 그림 모두에 맞는다.
  선택기가 열리면 루트가 포커스를 가져가고 테두리는 그리지 않는다(`.fwheel:focus-visible`).
- 진단 복사(`05330d9e` ← `3f884412`, 사용자 결정 2026-10-09): 설정 → 「문제 제보」. 안내 주소와 PLAYING.md §12는 upstream이 아니라 우리 저장소
  `LazyDeltaLima/Stronghold-Protocol-KR/issues`(사용자 결정 2026-10-09: 이 주소 유지 — 저장소는 아직 안 만들어서 만들 때까지 열리지 않음).
- 선발 선택 창 테스트(`ac82143e`·`d45b56f1`)는 우리 5명(아스카론·왕)과 필터 칩 없는 선택 창(사용자 결정 2026-10-07)에 맞춰 고쳐 넣었다.
- 브라우저 e2e(`SP_E2E=1`)로 들어온 테스트(`mock` `settings-entry` `diy` `facing` `modal` `loadout` `i18n` `ready-fold`)는 여기서 돌리지 않았다 — 화면 확인 때 함께.
