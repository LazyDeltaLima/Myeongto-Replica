# 우리 규칙과 근거 (docs/rules)

`nas-local`이 원본(`upstream` = sganggs/Stronghold-Protocol)과 다르게 정한 규칙·기능과 그 **근거**(공식 테이블·EN 클라이언트 데이터·PRTS·사용자 결정과 날짜·[추정] 표시·측정)를 적는 곳이다.
2026-10-09까지는 `docs/LOCAL-PATCH.md` 한 파일이었고, 하드 포크(2026-10-07) 뒤 병합 대비 목록이라는 역할이 없어져 영역별 파일로 나눴다. `docs/LOCAL-PATCH.md`는 옛 참조(「LOCAL-PATCH.md 「절 이름」」, 코드·테스트 주석 약 120곳)를 위한 **색인**으로 남는다.
운영 절차·열린 일은 `STRONGHOLD.md`(§11 열린 일), 세션 인계는 `handoffs/`.

| 파일 | 영역 | 담당 |
|---|---|---|
| `README.md` | 이 안내, 원칙, 기능별 목록, 버전 표기, **테스트(실패 0 기준선)** | 공통 |
| `sim.md` | 전투·경기 규칙: 게임 수치 수정, 상점 칸·보스전 시간, 적 비행 공격, 전투 버그 수정, 스킬 범위 발동(미확정) | sim |
| `diy.md` | 선발 오퍼레이터 — **「새 선발 오퍼레이터 키트 체크리스트」** | sim |
| `ui.md` | 화면 UI: 디버그 패널, 정비 화면 HUD, 상점, 휴식 진입·현상 수배·전투 종료 화면, 배치 UI, 전투 화면 UI, 위장 아이콘, 초대 링크, 휴대폰, 서버 재시작 예고 | ui |
| `render.md` | 보드·유닛 렌더링·연출: 공식 맵, 공식 스테이지 3D 씬, 배치 낙하, 유닛 모델 크기, 보스 경로 미리보기 | render |
| `fx.md` | 공식 전투 이펙트: 추출·재생기·붙는 자리·마운트·방향·정예 금빛·제보별 수정 | render(fx) |
| `audio.md` | 소리·음성: 오퍼레이터 음성, 스킬 효과음·믹서, 작전 종료 효과음, 배치 효과음 | audio |
| `upstream.md` | upstream과의 관계: 0.2.0 병합(옛 경로 대응표 포함), 원본 버그 선반영, 원본이 고치면 뺄 것 | 공통 |

## 쓰는 법
- 규칙을 바꾸거나 새 기능을 넣으면 그 영역 파일의 해당 절에 적는다: 무엇을, 근거(어느 데이터·문서로 확인했는지 / 추론이면 `[추정]`), 사용자 결정은 날짜와 원문, 확인 방법(실제 판·아레나·단위).
- 새 절(`##`)을 만들면 `docs/LOCAL-PATCH.md` 색인에도 한 줄 넣는다.
- 영역 파일은 담당 세션이 하나씩 고친다(여러 세션이 한 파일을 동시에 고치지 않는다). 다른 영역 파일은 담당 세션에 알리거나 끝난 뒤 고친다.
- 아직 안 끝난 일은 여기 말고 `STRONGHOLD.md` §11에 한 줄로.

## 원칙
**2026-10-07부터 하드 포크**: upstream v0.2.0 병합이 마지막이다(사용자 결정, `STRONGHOLD.md` 2·5장). 그래서 예전의
병합용 규칙(원본 파일에는 연결 한 줄만, 원본 테스트는 고치지 않기, 의도된 실패 목록 유지)은 풀었다.
- 원본 파일도 필요한 만큼 고친다. 새 기능은 여전히 따로 된 파일이 읽기 쉬우면 새 파일에 둔다.
- `// local patch` 주석은 새로 달 필요가 없다. 이미 있는 것은 그대로 두거나, 그 줄을 다시 고칠 때 지운다(사용자 결정의 근거 같은 설명은 남긴다).
- 원본 테스트도 우리 것이다. 우리 동작과 다르면 고치거나 지우고, 의도된 실패 목록을 늘리지 않는다.
- upstream의 버그 수정은 골라서 이식한다(`STRONGHOLD.md` 5장, `upstream/ISSUES.md`). 이 문서는 우리가 원본과 다르게 정한 것과 그 근거를 적는 곳으로 남긴다.

## 기능별 목록

| 기능 | 로컬 파일 | 원본 파일에 넣은 연결 |
|---|---|---|
| 한국어 번역 (UI·데이터·공식 문구) | `public/js/i18n/*`, `public/i18n/ko/*`, `tools/i18n/*` | `main.js` import, `richText.js` `tr()`, `settings.js` 언어 선택, `lobby.js` 언어 버튼 |
| 협동 방 채팅 | `server/local-patch.js`, `shared/local.js`, `public/js/ui/chat.js`, `public/css/chat.css` | `server/lobby.js` 훅, `shared/protocol.js` 2줄, `screens/room.js`·`screens/game.js`, `store.js` 1줄, `index.html` |
| 서버 재시작 예고 (배포 카운트다운, ui.md) | `server/local-restart.js`, `public/js/ui/restartNotice.js`, `test/local-restart.test.js` | `server/http/boot.js` `SIGUSR2`, `server/index.js` 3줄, `server/http/routes.js` healthz 1줄, `server/lobby.js` welcome 1줄, `shared/local.js` `LOCAL_S2C`, `main.js`·`store.js` 각 1줄, `server/lobby.js start` 1줄(마지막 5분 판 시작 거부), `shared/constants.js` `ERR.RESTARTING`, `shared/local.js RESTART_FINAL_MIN`, `ui/connBanner.js` 마지막 5분 띠, 언어 팩 6문구 |
| 채팅 진영 (8개국, 맹약 아이콘) | `shared/local.js`, `public/js/ui/faction.js` | `components.js` `AvatarFrame`의 `mark`, `gameComponents.js` 아바타 |
| `SP_MAX_BOTS` (방마다 AI 팀원 한도) | `server/local-patch.js` | `server/lobby.js` 훅, `screens/room.js` 한도 표시 |
| 이모티콘 공식/유저 탭 | `shared/emote-art.js`, `public/img/emotes/*` | `ui/emotes.js`(약 100줄, 가장 큰 수정), `emotes.css`, `gameActions.js`, `gameLogic.js`, `teamPanel.js`, `Match.js`·`StubMatch.js` 의 `set` |
| 리소스 미리 받기 | `public/js/resources.js`, `public/resource-worker.js`, `tools/build-browser-resources.mjs`, `public/css/resources.css` | `main.js`, `settings.js`, `index.html` |
| 오퍼레이터 음성 언어 선택(한국어/일본어/끄기)과 정비 단계 대사(선택·배치) — 원본 #73 「干员战斗语音」 위에 | `tools/assets/voice.mjs`(일본어 쌍둥이 `audio.voiceJp`, 정리), `public/js/voice.js` | `tools/fetch-assets.mjs`(기본 `--voice-lang=kr` 1줄, `tidyVoice` 2줄), `tools/assets/plan.mjs` 2줄(import, `audio.voiceJp`), `audio.js voice()` 2줄(`audio.voiceTable`: 고른 언어의 표), 공식 재생 규칙 `public/js/voicePolicy.js` + `audio.js` 훅(`voice()` 유형 인자, 스킬·행동 개시·첫 배치·초기화 각 1~3줄), `screens/game.js`(import, 선택 2줄, `buy`·보상 선택, 결산 대사 보관 `holdResultVoice`), `screens/result.js` 2줄(import, 승리 결산에서 `playMatchEndVoice`), `ui/settings.js`(언어 줄), `resources.js`(언어 필터), `debug.js`(대사 버튼), `public/i18n/ko/ui.json` |
| 선발 오퍼레이터 (0.2.0부터 upstream 自选 틀, 후보 = 望·赤刃明霄陈·维什戴尔·丰川祥子·阿斯卡纶) | `shared/local-diy.js`, `kits/ops/op-{wang,chen3,wisdel,oblvns,ascln}.js` | `server/lobby.js` 2줄(`room.diy` 검사·welcome `diyKitted`), `tools/build-data.mjs DIY_LOCAL_INCLUDED`, `server/match/player/acquire.js` 1줄(정예화 보상) — 위 「0.2.0 병합」 |
| 선발 소환물 모델 (望 바둑돌·维什戴尔 혼령의 그림자: 웹 미러에 기본 모델이 없어 마름모로 보이던 것 → 로컬 클라이언트 추출) | `tools/local-extract/token_spines.py` → `public/assets/local/spine/token/<id>/` + `data/local-assets.json` 그룹 `spine/token/<id>`, `tools/assets/local-token-spines.mjs` → `tools/assets/local-token-spines.json` | `tools/fetch-assets.mjs` 3줄(import, `addDiyTokenAssets`, `addDiyTokenModels` → `data/assets.json tokens[id]` 아바타·`spineLocal`), `public/js/assets.js spineEntry` 토큰 분기 1줄(`spineLocal` 사용) |
| 함정형 소환물 표시 (望 바둑돌은 HP 바 없음, 望 바둑돌·사일런스 의료 드론은 방향 선택 없이 바로 배치·방향 표시 없음) | `shared/trap-tokens.js` | `render/units.js` 3줄(import, HP 바 조건, 방향 표시), `ui/facing.js` 2줄(import, `needsFacing`), `render/fx.js FX_KINDS` 1줄(`wangLink`: 바둑돌 활성화 이벤트의 기본 연출) |
| 정비 화면 HUD 공식 모양 (클라이언트 프리팹 `autochess_hud_panel`·`autochess_hud_bond_item`·`panel_prep_ready`: 라운드 띠 판·양 끝 원·휴식 기간 알약·라운드 숫자판·🔍 버튼 판, 맹약 원 = `bondBoardIcon/<활성 인원>_<현재 인원>`(활성이면 꽉 찬 원) + 숫자 판 + 이름(개수/다음 단계 배지는 숨기고 툴팁에만), 준비 완료 버튼, 맹약 줄 가운데 정렬·접기 버튼, 카운트다운, 왼쪽 플레이어 목록, 맹약 팝업, 배치 기물 정보 창) | `public/js/ui/hudArt.js`, `public/js/ui/detailArt.js`, `public/css/hud-art.css` | `screens/game.js` 3줄(import, 루트 class·style), `ui/bondStrip.js` 15줄(import, 원 판 2곳, 팝업 라벨·알약, 휠 가로 스크롤 `stripWheel` + `onWheel`), `ui/teamPanel.js` 1줄(`has-watched`), `ui/components.js` 문양 크기 변수(`natSizeVars` + `BondDisc` img onLoad), `ui/gameComponents.js` 3줄(import, `Img` onLoad, `BondGlyph`), `ui/detailPanel.js` 3줄(import 2, 카드 선택), `screens/game.js` 배치 중 카드 3줄(import, 렌더), `index.html`·`dev/game-mock.html` 각 1줄, `public/i18n/ko/ui.json` 6줄(休息一下 → 휴식 기간, 剩余可放置角色 → 배치 가능 인원: 한국 서버 표기, 激活所需人数, 法抗·阻挡·费用 → 마항·저지·비용) |
| 상점 화면 공식 모양 (클라이언트 프리팹 `autochess_shop`·`_card_item`·`_cost_item`·`_bond_item` 좌표·글꼴·색, 공식 그림: 카드 테두리·[ NO INFO ]·동결/갱신/잠김 버튼·자금 알약·접기 상자·승급 상자·가격 육각형, 카드 워터마크 = 特质 유형 아이콘, 스킬 아이콘 오른쪽 아래) | `public/js/ui/shopArt.js`, `public/css/shop-art.css` | `ui/shopBar.js` 3줄(import, 워터마크, `<section>` class·style), `index.html`·`dev/game-mock.html` 각 1줄 |
| 배치 UI 공식 모양 (3D 보드: 배치 가능 칸 초록 곱하기 틴트·공격 범위 주황 줄무늬 `sprite_attack_range`, 배치 중 기물 반투명, 방향 선택 = 클라이언트 `panel_direction_selector` 그림·주변 어둡게·취소 태그·「방향을 가운데로 되돌려 취소」 말풍선) | `public/js/render/board3d/tileOverlay.js`, `public/js/ui/placeArt.js`, `public/css/place-art.css`, `test/render/placement-ui.test.js` | `board3d/scene.js` 4줄(import, 생성, update, dispose), `render/app.js`(drawHighlight·clearHl 3D 분기, 줄무늬 그림 로드, ghost·holdPiece, `stripesUnder`), `render/units.js` 2줄(`GHOST_ALPHA`), `ui/facingWheel.js`(import, 공식 그림이 있으면 `PlaceWheelArt`, 3D 줄무늬 중복 방지), `index.html`·`dev/game-mock.html` 각 1줄, `dev/game-mock.js` `?stage=`, `i18n/ko/ui.json` 1줄, `tools/local-extract/extract.py` JOBS 2줄 |
| 전투 화면 UI 공식 모양 (2026-10-07~, 진행 중: ① 아군 체력·SP·탄환 바 + 기물 레벨, ② 적·보스·거대 보스 HP 바, 배치 방향 표시, ③ 원소 원형 바, ④ 데미지·회복 숫자, ⑤ 상태 이펙트) — 바는 발밑 아래·화면 고정 크기(1단위 = min(폭/1920, 높이/1080)), HP `#49b2e3`·SP `#caec46`·스킬 중 `#ffa800`·검정 α.5 받침, 탄환형 스킬은 탄환마다 칸, SP 가득 참 빛 없음, 전투 중 레벨 칩 없음, 정비 중 레벨 칩 = 공식 그림(`img_chess_level_N`, 크기는 `autochess_level_N` 기준), 정비 중 장비 바(장착 아이템이 있을 때만) | `public/js/render/hud-bars.js`, `public/js/render/facing.js`, `public/js/render/num-official.js`, `public/js/render/number-style.js`, `public/js/render/fxstatus.js`, `public/js/ui/numberStyleSetting.js`, `server/sim/local-hud.js`, `test/local-patch-hud.test.js` | `render/units.js`(import 1줄, `_buildHud` 2줄, `sync` 1줄, `_updateHud`의 아군 분기·칩·보호막·원소 줄 위치), `server/sim/Battle.js` 2줄(import, `snapshot()`의 `ammo`), `render/interp.js` 2줄(`ammo` → 샘플), `render/app.js` 2줄(`setEquip` 금색 여부), `server/sim/content/bosses.js`(관·현 공식 SP `skillSp` + 阿利斯泰尔 SP 노출 1줄), `server/sim/damage.js`(import, `dmg.lpNum` 2줄, 'dmg' 이벤트 5번째 칸, `absorbShields` `info` 3줄, 'blk' 2줄), `render/fx.js`(import 2줄, `damage`/`heal`의 공식 숫자 분기, update·clear·destroy 각 1줄, 헤더), `render/app.js` 4줄(`fx.damage(…, e[4])`, `case 'blk'`, import·`syncStatusFx`), `render/fxgame.js`(import 1줄, `playStatus`·`statusReady`/`statusOn`/`statusOff`, update 2줄), `render/interp.js` 1줄(`COSMETIC_EVENTS`에 'blk'), `server/sim/content/enemies.js` 2줄(import, artsBarrier 'blk'), `ui/settings.js` 2줄(import, 설정 줄), `i18n/ko/ui.json` 3줄, `tools/local-extract/extract.py` battlecommon 정규식(장비 바 그림 3개, 보스 문양·바 테·맞을 때 빛 4개, 받침 `sprite_bg`, 원소 링 14개) |
| 휴식 진입·현상 수배·전투 종료 화면 공식 모양 (클라이언트 프리팹 `round_start_dialog`·`autochess_battle_effect_choose_panel`·`card_small_item`·`card_avatar_item`·`round_result_dialog`: 라운드 시작 배너 [라운드 03 · 획득 +6], 机变/悬赏 선택 화면 제목·카드·선택 확인 막대·가져간 카드·「내 차례」, 전투 종료 배너 완벽한 작전/목표 HP 감소) | `public/js/ui/phaseArt.js`, `public/css/phase-art.css` | `screens/game.js` 9줄(import, `useRoundGold`, 결과 배너 4줄, 배너 분기 3줄), `ui/choiceOverlay.js` 7줄(import, `useTurnFlash`, `turnFlash` 2곳, 루트 class·style, 제목 `spov__name`, `spov__notice`, `YourTurn`), `index.html`·`dev/game-mock.html` 각 1줄, `dev/game-mock.js` ROUND_START 5줄, `public/i18n/ko/ui.json` 6줄 |
| 공식 전투 이펙트 (로컬 클라이언트 추출) | `tools/local-extract/fx_extract.py` → `public/assets/local/fx/**`, `public/js/render/fxplayer.js`·`fxgame.js`·`fxmap.js` | `render/app.js` 8줄(이벤트·프레임·정리 훅, 부하 단계·3D 보드 여부·전투 시계 배속 전달, `stats()`의 `fxGame`, `atk`의 화살 종류 `fxGame.arrowKind(e)`, 공식 이펙트로 그린 `fx`는 2D 대체 생략 `fxGame.ownsFx(e)`), `render/fx.js FX_KINDS` 2줄(`oblvnsNote`, `chen3Qi`) |
| 공식 스테이지 3D 씬 (스테이지별 사막·카시미어·시라쿠사 씬, 라이트맵, 필드별 숨김 세트) | `tools/local-extract/scene_extract.py` → `public/assets/local/scene/**`, `public/js/render/board3d/official.js`, `test/render/board3d-official.test.js` | `board3d/scene.js`(로더 옵션·`officialRoot`·`setStage` 분기·`highlandFor`), `render/app.js` 2곳(`loadOfficial`/`onOfficial` 옵션, `setStage`의 높이), `style.js tileTop` + `tiles.js`·`layout.js` 1줄씩 |
| 스킬 효과음 보강 (ON_SKILL_START가 없는 스킬은 ON_ABILITY_START/ON_CUSTOM_TRIGGER [start]/ON_ABILITY_ON/HIT 뱅크) | `tools/assets/skill-sfx.mjs` | `tools/assets/plan.mjs` 2줄 |
| 갱신 버튼 강조 (전략이 다음 수동 갱신에 작용할 때 테두리가 빛남: 두요야 라운드 첫 2회, 梓兰 매번, 佩佩 특수 갱신 대기, 贾维 N번째 갱신 직전) | `server/local-patch.js refreshBoost` (`privateView` 감싸기 → `shop.refreshBoost`), `public/css/refresh-boost.css` | `ui/shopBar.js` 갱신 버튼 class 1줄, `index.html` 1줄 |
| 리소스 미리 받기 카드에서 음성 언어 선택 (처음 접속할 때 한국어/일본어/끄기, 고르면 용량 다시 계산) | `public/js/resources.js` `ResourceHost`, `voice.js setVoiceLang`, `public/css/resources.css` | — |
| 얼린 상점에서 특수 갱신이 바꾼 칸도 얼림 유지 (원본은 `setShopSlot`이 항상 `frozen: false` → 佩佩·杜遥夜가 넣은 칸이 전투 시작 때 사라짐) | — | `server/match/effectsMeta.js` `setShopSlot` 2줄 (바뀌기 전 칸의 얼림 상태, 없으면 상점 얼림 상태) |
| 디버그용 재화 고정 (`SP_DEBUG_FUNDS=<0..999>`일 때 사람 플레이어 재화가 그 값으로 고정, 봇은 그대로. `local.sh`가 기본 99, 배포 서버는 미설정) | `server/local-patch.js debugFunds` (`PlayerState.prototype.funds` 접근자) | 없음 |
| 게임 내 디버그 패널 (로컬 디버그 모드만: 보드 왼쪽·맹약 줄 아래. 「디버깅용 재화 99 고정」 체크박스 = 플레이어별로 재화 고정 켜고 끄기, 선발 오퍼레이터·티어·일반/정예·스킬(S1~S3)·모듈(정예만, 없음 포함)을 골라 정비 구역에 추가) | `server/local-patch.js` `debugMode`·`debugIntent`·`debugView`(`privateView` 감싸기 → `m.private.debug`, 디버그 모드일 때만 설치), `shared/local.js`(`dbg.funds`·`dbg.addDiy` 형식), `public/js/ui/debugPanel.js`, `public/css/debug-panel.css`, `public/i18n/ko/ui.json` 7줄 | `screens/game.js` 2줄(import, 렌더), `index.html` 1줄 |
| 스킬 모드 공격·타격음 + 공식 믹서 그룹 볼륨 (2026-10-07) + 믹서 스냅샷 (2026-10-08) | `public/js/audioOfficial.js`, `public/js/audioSnapshot.js`, `tools/assets/skill-mode-sfx.mjs`, `tools/local-extract/char_modes.py` → `tools/assets/local-char-modes.json`, `test/local-patch-audio.test.js`, `test/local-patch-skill-music.test.js`, `test/local-patch-skill-snapshot.test.js` | `public/js/audio.js`(import, `unit()` 모드·게인, 이벤트 루프 몇 줄, 채널 게인 2줄, 스킬 extras·잡아 둔 'skill'·替身 전환 메서드 2개, unlock의 bus·`sfxOutside` 몇 줄, `_play` 출력·스냅샷 3줄), `tools/assets/audio.mjs` 몇 줄, `plan.mjs` 몇 줄, `skill-sfx.mjs`·`kit-sfx.mjs` 함수 1개씩, `screens/game.js` early 필터 1줄 |
| 스킬 중 매 공격 이펙트(공식 모드 바인딩) + 이펙트 배속 연동 + 투사체 꼬리 + 시전자 이펙트는 유닛 아래 (2026-10-07) | `shared/skill-modes.js`, `public/assets/local/fx/modes.json`(git 밖, `char_modes.py`), `test/local-patch-fxmodes.test.js` | `render/fxgame.js`(로컬 파일), `render/fxmap.js`(로컬 파일) `attackMode`·`boundEffects` |
| 이펙트·사운드 디버그 페이지 = 샌드백 아레나 (`SP_DEBUG_PAGE=1`일 때만, 배포 서버는 404 — `/js/debug/*` 포함) | `public/debug.html`, `public/js/debug.js`, `public/js/debug/arena.js`·`sandbag.js` (`/fxlab.html`은 이리로 넘김), `server/local-patch.js debugPageHidden`, `test/local-patch-debug.test.js` | `server/index.js` 2줄, `render/app.js` `debugFx` 1줄(+헤더 1줄), `render/fxgame.js` `debugPlay` |
| 보스 경로 미리보기 (2026-10-08: 최종 공세·숨겨진 핵심 준비 단계에서 걷는 보스의 이번 판 경로를 공식 경로 미리보기 커서로 반복 표시, 아래 「보스 경로 미리보기」) | `server/match/bossPath.js`, `public/js/render/fxroute.js`, `tools/boss-route-map.mjs`, `test/match/boss-path.test.js`, `public/assets/local/fx/route_cursor/`(git 밖) | `server/match/match/views.js` `nextEnemiesFor` 5줄(import, 보스 항목 `paths`), `render/app.js` 4줄(import, 생성, 프레임 `sync`, 정리), `render/fxgame.js` `playFree`, `tools/local-extract/fx_extract.py` 1줄(`--pack`의 본 번들 = 이름이 맞는 첫 파일) |
| `/healthz` 축소 (프록시를 거친 요청은 `ok`·`version`·`app`·`build`만, 접속자·방 수는 컨테이너 안 확인용) | `server/local-patch.js proxiedRequest` | `server/index.js` 2줄(import, `/healthz` 앞 1줄) |
| 방별 진행 상황 (2026-10-09: 내부 `GET /healthz/rooms` — 방 코드·모드·난이도·단계·라운드·사람/접속/봇 수, 프록시 경유는 404. `deploy.sh` 카운트다운·`--rooms`가 표시, ui.md 「서버 재시작 예고」) | `server/local-rooms.js`, `test/local-patch-rooms.test.js` | `server/http/routes.js` 6줄(import, 경로 분기) |
| 게임 결과 통계 로그 (2026-10-07: 판이 끝날 때마다 `[stats] {JSON}` 한 줄 — 모드·난이도·스테이지·보스·승패·도달 라운드·시간, 플레이어별 닉네임·봇 여부·라운드·LP·편성(id·티어·금색·장비)·맹약·전투 통계. playerId·시드는 뺌. DB·볼륨 없이 `docker logs`/OCI Logging에서 읽음) | `server/local-stats.js`, `test/local-patch-stats.test.js` | 없음 (`server/local-patch.js onMatchEnd` 1줄) |
| 결산 화면 피드백 보내기 (2026-10-09: 버그·제안을 서버 `SP_FEEDBACK_DIR`에 보관, 진단·이번 판 전투 첨부, `ui.md` 「결산 화면 피드백 보내기」) | `server/local-feedback.js`, `public/js/ui/feedback.js`, `public/css/feedback.css`, `test/local-feedback.test.js` | `server/local-patch.js`(onMessage·onMatchEnd 1줄씩, `feedbackOf`·`welcomeInfo`), `server/lobby.js welcomeInfo` 1줄, `shared/local.js` `fb.send`, `diag.js`(전투 보관·오류의 battleId), `battle/runner.js` 1줄, `screens/result.js` `extra`, `main.js` 1줄, `index.html` 1줄 |
| 라운드 작전 종료 효과음 (2026-10-07: 내 일반 전투 결과에 공식 `ui.ON_ACT1AUTOCHESS_BATTLEOVER_*` — 아래 「작전 종료 효과음」) | `public/js/audioOfficial.js battleOverOf` | `screens/game.js` 6줄(import, 결과 배너 분기) |
| ~~스킬 범위 자동 발동~~ → 0.2.0 upstream ACTIVE_RANGE로 대체 (2026-10-07, **사용자 결정·미확정** — 공식 기본 전략과 다름, 아래 「스킬 범위 발동」) | `server/sim/local-skill-range.js` | `server/sim/Battle.js` 2줄(import, `_setupKit`), `server/sim/skills.js` 2줄(`_extraTriggerSatisfied`의 `{ keys, profile }`), `content/kits/diy.js` 1줄(赤刃明霄陈 S3 `hitsFly`) |
| 오퍼레이터 배치 낙하 연출 (2026-10-07: 각 모델의 Start 클립으로 하늘에서 떨어짐 — 페이드·민트 기둥 없음, 아래 「배치 낙하」) | — | `render/units.js`(`onDeploy`, 모델 늦게 로드 시 클립 따라잡기, 어두운 첫 프레임, impostor), `render/fx.js` 1줄(`fx.deploy`가 `bornOfficial`이면 생략), `render/app.js` 6줄(벤치 도착·보드→벤치 복귀도 낙하, 미끄러짐 없이 목표 칸에서) |
| iframe 차단 헤더 | — | `server/http/common.js setSecurityHeaders` 3줄 (0.2.0 분할 전 `server/index.js`) |
| 나가기 창에서 「暂离（AI 托管）」 숨김 | — | `ui/matchChrome.js` (`AWAY_OPTION = false`) — 나가면 자리를 포기한다 |
| 맹약 스택 세 자리 줄바꿈 수정 | `public/i18n/ko/ko.css` | — |
| ~~협동 보스 HP = `bloodPoint` × 생존 인원~~ (0.2.0 upstream이 같은 규칙 — 패치 제거) | — | — |
| 제국의 갑주 등장 폭격·3연타 PRTS 수치 | `server/sim/content/local-patch.js` | `server/sim/content/index.js` 1줄 (`DOMAIN_NAMES.push`) |
| ~~胄 드론 연동 피해를 限伤에서 제외~~ (0.2.0 upstream이 처리 — 패치 제거) | — | — |
| 성당 검사(圣堂剑士) 탄약 소모 스킬·탄약 표시 (2026-10-06) | `server/sim/content/local-patch.js` | 위와 같음 + `server/sim/snapshot.js unitTuple` 1줄(`e.lpAmmo` → SP/SP 최대), `render/units.js` 2줄(SP가 있는 적도 막대 표시, 적은 「준비」 빛 없음) |
| 더블린 그림자 캐스터(·리더) 외 27종은 비행 아군을 공격하지 않음 (2026-10-06, 아래 전수 조사; 자로는 2형태만) | `server/sim/content/local-patch.js` (`NO_AIR_KEYS`, `NO_AIR_FORMS`, `beforeAttack` 재필터) | 위와 같음 |
| 频次(특수 HP, "N회 피해로 격파") 적에게 隐德来希 효과가 한 번에 여러 칸을 깎던 것 (2026-10-06, 원본 버그 — 원본 PR 후보): 萃血 최대 HP 흡수는 频次 적에게 안 걸림(PRTS 萃血 비고 「无法对…拥有特殊生命值机制的敌人…生效」), 心烛가 받은 피해를 원래 적에게 넘길 때 频次 적이면 출처 없는 진실 피해 1회(=1)로(PRTS 비고 「无来源真实伤害…如特殊生命值机制」) | — | `server/sim/content/kits/tier5.js` 隐德来希 2곳(萃血 조건 1줄, 心烛 전달 2줄) |

`server/sim/content/local-patch.js`는 시뮬레이션 모듈이라 서버와 브라우저(클라이언트가 돌리는 보스·히든 전투) 양쪽에서 실행된다.
`server/local-patch.js`는 서버 전용이다.

## 버전 표기 (2026-10-06, 사용자 결정)
- 로컬 판은 **자체 버전**(semver)을 쓴다: `shared/local.js LOCAL_VERSION`, 1.0.0부터(공식 화면 재현판이 첫 정식판). upstream `APP_VERSION`은 「기반」으로만 붙는다.
  처음 안 `0.1.4+mangho.N`은 "원본에 붙은 덧패치"로 읽혀서 사용자가 바꿈.
- 올리는 규칙: 앞자리 = 큰 방향 전환(새 시즌 데이터 등), 가운데 = 기능·화면이 바뀐 배포, 끝자리 = 버그 수정만 있는 배포. upstream 병합은 기반 숫자만 바꾼다.
- 보이는 곳: 타이틀 `v1.0.0 · BASE 0.1.4 · WEB SIMULATION`(title.js 1줄, 옆의 WEB SIMULATION처럼 영어 — 사용자 결정), `/healthz`의 `local`(기반은 원래 `app`), 서버 시작 로그.
- **배포 순서:** `LOCAL_VERSION`을 올려 커밋 → `oci/deploy.sh`. STRONGHOLD.md 배포 기록에 버전도 적는다.

## 테스트
- `node --test test/local-patch.test.js` — 로컬 테스트 109개.
- 전체 `node --test` (2026-10-08, merge-0.2.0 하드 포크 후): **실패 0이 기준.** 하드 포크(「0.2.0 병합」)부터 upstream 테스트도 우리 것이라,
  로컬 동작 변경으로 깨지던 원본 테스트는 「의도한 실패」로 두지 않고 고쳤다. 고친 곳마다 `local patch` 주석이 근거 절을 가리킨다:
  - 동작 변경에 맞춘 것: `render/unitview` 등급 칩(전투 중 없음), `render/playtest6_elembar`(원소 줄은 공식 발밑 바 `lpBars` 아래),
    `render/feedback3-leader-prep`(보스는 `lpBars`), `sim/battle` 'dmg' 5번째 칸(숫자 플래그), `content/enemies_bosses` 管·弦 첫 발동(공식 SP
    50초 / 25초, `firstCast`), `sim/feedback1f-liftoff` 제국의 갑주 포격(1.33초부터 0.53초 간격, 5.5초 동안 8발), `docs-consistency` 음성 경로
    `/voice/kr/`·결산 대사 보관(`holdResultVoice`), `asset-network` 음성 기본 `kr`, `version` 자체 버전 표기, `ui/feedback3-audio-mix`
    공식 믹서 게인(`officialGain`), `ui/standin-ui` 모델 서명 뒤 소환물 칩, `docs-paths`(옛 설계 문서 15.1절 인용을 문장으로).
  - EN 클라이언트에 없는 것 허용: `ui/emotes`·`ui/localArt`(愚人节 이모티콘 테마 — fooldoctor 등 — 번들이 EN에 없음: 추출 안 된 테마는
    건너뜀), `ui/moduleIcons`(INC-Y 아이콘이 EN `ui_equip_type_hub_h2_0.ab`에 없음 → 글자 타일), `render/board3d-extract` 立绘(`chararts`는
    WebP만 — 아래 「立绘 추출」).
  - 고친 버그: `render/board3d-extract` 노멀 맵 — EN 클라이언트의 `TX_autochessi_N`은 Unity DXT5nm(R=1, X는 A, Y는 G)인데 BC5(R=X)로 읽어
    파생 노멀이 평평했다(z 평균 128). `tools/local-extract/extract.py derive_normal_rg`가 R이 전부 255이면 A를 X로 쓴다; 기존 PNG에서 다시
    파생(`run_derived` + `run_webp`, 클라이언트 불필요). 泥岩 뒷모습 S2 클립(`assets.test`, nas-local 4f27dccd).
  - 2026-10-08 nas-local(756319fb)에서 다시 확인: 4716개 중 통과 4712, 실패 0, 건너뜀 4(Chrome·zip·토큰 모델 추출 필요). 새로 받은 노멀
    맵은 B 평균 249. EN 클라이언트에 `emoticon_foolsday_*` 번들이 없고, `ui_equip_type_hub_h2_0.ab`·`ui_equip_type_direction_hub_h2_0.ab`에는
    `inc-x`만 있다(UnityPy로 확인) — fooldoctor·INC-Y는 CN 클라이언트가 있어야 뽑을 수 있다.
  - 가끔 시간 문제로만 실패(단독 실행은 통과): `lobby` 「solo resume window」, `lobby-integration` 재접속, `match/realtime` 「real-time co-op over websockets」.
  - golden 다이제스트는 전투 규칙을 바꾸면 `npm run golden:update`로 다시 만든다(바뀐 결과가 의도한 것인지 먼저 확인).
- `node --test test/local-patch-battle.test.js` — 2026-10-06 플레이 제보 전투 버그 테스트 6개(우타게 S2 그림·저지, 魔王 S3 재분배, 은신·위장 vs 스플래시, 污染秽蚀 vs 은신).
- `node --test test/local-patch-camou.test.js` — 위장 아이콘(`UF_CAMOU`) 테스트 2개.
- `node --test test/local-patch-status-boomerang.test.js` — 상태 이펙트 중첩(제보 4차 4-1)·回环射手 부메랑(4-6) 테스트 9개(跃跃 스킨 데이터는 로컬 Spine 소재가 있을 때만).
- `node --test test/local-patch-hud.test.js` — 전투 화면 UI 테스트 30개(화면 고정 단위, 아군 바 위치·색, 탄환 칸, 전투 중 칩 없음, 정비 칩 그림 고르기, 장비 바, 적·보스·거대 보스 바, 받침 그림, 보스 SP, 관의 공식 SP 발동, 원소 링, 공식 숫자·설정, 상태 이펙트, 방향 표시, `b.snap.ammo`).
