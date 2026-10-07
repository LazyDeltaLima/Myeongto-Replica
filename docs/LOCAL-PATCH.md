# nas-local 로컬 패치 목록

`nas-local` 브랜치가 원본(`upstream` = sganggs/Stronghold-Protocol)과 다른 부분을 모두 정리한 문서다. 이 파일은 로컬에서만 만든 파일이라
원본을 병합해도 충돌하지 않는다. 패치를 넣거나 뺄 때 같이 고친다. 운영 절차는 `STRONGHOLD.md`에 있다.

최종 갱신: 2026-10-06 (게임 내 디버그 패널 추가; 커밋 `d85f961` 기준)

## 원칙
- 로컬 코드는 **새 파일**에 둔다. 원본 파일에는 연결용 한 줄만 넣고 `// local patch` 주석을 단다.
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
| 오퍼레이터 음성 언어 선택(한국어/일본어/끄기)과 정비 단계 대사(선택·배치) — 원본 #73 「干员战斗语音」 위에 | `tools/assets/voice.mjs`(일본어 쌍둥이 `audio.voiceJp`, 정리), `public/js/voice.js` | `tools/fetch-assets.mjs`(기본 `--voice-lang=kr` 1줄, `tidyVoice` 2줄), `tools/assets/plan.mjs` 2줄(import, `audio.voiceJp`), `audio.js voice()` 2줄(`audio.voiceTable`: 고른 언어의 표), 공식 재생 규칙 `public/js/voicePolicy.js` + `audio.js` 훅(`voice()` 유형 인자, 스킬·행동 개시·첫 배치·초기화 각 1~3줄), `screens/game.js`(import, 선택 2줄, `buy`·보상 선택), `ui/settings.js`(언어 줄), `resources.js`(언어 필터), `debug.js`(대사 버튼), `public/i18n/ko/ui.json` |
| 선발 오퍼레이터 (甄选 칸: 왕·첸 더 던스트릭·위셔델·사키코·아스카론) | `tools/build-diy.mjs` → `data/diy.json`, `shared/diy.js`, `public/js/ui/diySlots.js`, `public/css/diy.css`, `tools/assets/diy.mjs` | `tools/build-data.mjs`(스크립트 가드 + export), `server/data.js`·`public/js/data.js`·`public/js/battle/runner.js`(diy.json 병합 각 1줄), `shared/protocol.js`(loadout `diy` 키·검사), `server/match/PlayerState.js` 2줄(`diy` 유지), `server/lobby.js freezeLoadout` 1줄(`diy` 유지 — 없으면 매치가 구성 전체를 버린다), `server/local-patch.js`(전용 풀), `public/js/ui/loadoutModel.js`(`diy` 유지: `parseStored`·`setChoice`·`sanitizeEntries`), `screens/loadout.js` 3줄 + 내보내기 버튼 조건, `index.html` 1줄, `tools/fetch-assets.mjs` 2줄, `server/sim/Battle.js isReservedTile` 2줄(선택 인자 `except`: 望의 재배치 대기 돌 자리 제외) |
| 선발 소환물 모델 (望 바둑돌·维什戴尔 혼령의 그림자: 웹 미러에 기본 모델이 없어 마름모로 보이던 것 → 로컬 클라이언트 추출) | `tools/local-extract/token_spines.py` → `public/assets/local/spine/token/<id>/` + `data/local-assets.json` 그룹 `spine/token/<id>`, `tools/assets/local-token-spines.mjs` → `tools/assets/local-token-spines.json` | `tools/fetch-assets.mjs` 3줄(import, `addDiyTokenAssets`, `addDiyTokenModels` → `data/assets.json tokens[id]` 아바타·`spineLocal`), `public/js/assets.js spineEntry` 토큰 분기 1줄(`spineLocal` 사용) |
| 함정형 소환물 표시 (望 바둑돌은 HP 바 없음, 望 바둑돌·사일런스 의료 드론은 방향 선택 없이 바로 배치·방향 표시 없음) | `shared/trap-tokens.js` | `render/units.js` 3줄(import, HP 바 조건, 방향 표시), `ui/facing.js` 2줄(import, `needsFacing`), `render/fx.js FX_KINDS` 1줄(`wangLink`: 바둑돌 활성화 이벤트의 기본 연출) |
| 정비 화면 HUD 공식 모양 (클라이언트 프리팹 `autochess_hud_panel`·`autochess_hud_bond_item`·`panel_prep_ready`: 라운드 띠 판·양 끝 원·휴식 기간 알약·라운드 숫자판·🔍 버튼 판, 맹약 원 = `bondBoardIcon/<활성 인원>_<현재 인원>`(활성이면 꽉 찬 원) + 숫자 판 + 이름(개수/다음 단계 배지는 숨기고 툴팁에만), 준비 완료 버튼, 맹약 줄 가운데 정렬·접기 버튼, 카운트다운, 왼쪽 플레이어 목록, 맹약 팝업, 배치 기물 정보 창) | `public/js/ui/hudArt.js`, `public/js/ui/detailArt.js`, `public/css/hud-art.css` | `screens/game.js` 3줄(import, 루트 class·style), `ui/bondStrip.js` 15줄(import, 원 판 2곳, 팝업 라벨·알약, 휠 가로 스크롤 `stripWheel` + `onWheel`), `ui/teamPanel.js` 1줄(`has-watched`), `ui/components.js` 문양 크기 변수(`natSizeVars` + `BondDisc` img onLoad), `ui/gameComponents.js` 3줄(import, `Img` onLoad, `BondGlyph`), `ui/detailPanel.js` 3줄(import 2, 카드 선택), `screens/game.js` 배치 중 카드 3줄(import, 렌더), `index.html`·`dev/game-mock.html` 각 1줄, `public/i18n/ko/ui.json` 6줄(休息一下 → 휴식 기간, 剩余可放置角色 → 배치 가능 인원: 한국 서버 표기, 激活所需人数, 法抗·阻挡·费用 → 마항·저지·비용) |
| 상점 화면 공식 모양 (클라이언트 프리팹 `autochess_shop`·`_card_item`·`_cost_item`·`_bond_item` 좌표·글꼴·색, 공식 그림: 카드 테두리·[ NO INFO ]·동결/갱신/잠김 버튼·자금 알약·접기 상자·승급 상자·가격 육각형, 카드 워터마크 = 特质 유형 아이콘, 스킬 아이콘 오른쪽 아래) | `public/js/ui/shopArt.js`, `public/css/shop-art.css` | `ui/shopBar.js` 3줄(import, 워터마크, `<section>` class·style), `index.html`·`dev/game-mock.html` 각 1줄 |
| 배치 UI 공식 모양 (3D 보드: 배치 가능 칸 초록 곱하기 틴트·공격 범위 주황 줄무늬 `sprite_attack_range`, 배치 중 기물 반투명, 방향 선택 = 클라이언트 `panel_direction_selector` 그림·주변 어둡게·취소 태그·「방향을 가운데로 되돌려 취소」 말풍선) | `public/js/render/board3d/tileOverlay.js`, `public/js/ui/placeArt.js`, `public/css/place-art.css`, `test/render/placement-ui.test.js` | `board3d/scene.js` 4줄(import, 생성, update, dispose), `render/app.js`(drawHighlight·clearHl 3D 분기, 줄무늬 그림 로드, ghost·holdPiece, `stripesUnder`), `render/units.js` 2줄(`GHOST_ALPHA`), `ui/facingWheel.js`(import, 공식 그림이 있으면 `PlaceWheelArt`, 3D 줄무늬 중복 방지), `index.html`·`dev/game-mock.html` 각 1줄, `dev/game-mock.js` `?stage=`, `i18n/ko/ui.json` 1줄, `tools/local-extract/extract.py` JOBS 2줄 |
| 휴식 진입·현상 수배·전투 종료 화면 공식 모양 (클라이언트 프리팹 `round_start_dialog`·`autochess_battle_effect_choose_panel`·`card_small_item`·`card_avatar_item`·`round_result_dialog`: 라운드 시작 배너 [라운드 03 · 획득 +6], 机变/悬赏 선택 화면 제목·카드·선택 확인 막대·가져간 카드·「내 차례」, 전투 종료 배너 완벽한 작전/목표 HP 감소) | `public/js/ui/phaseArt.js`, `public/css/phase-art.css` | `screens/game.js` 9줄(import, `useRoundGold`, 결과 배너 4줄, 배너 분기 3줄), `ui/choiceOverlay.js` 7줄(import, `useTurnFlash`, `turnFlash` 2곳, 루트 class·style, 제목 `spov__name`, `spov__notice`, `YourTurn`), `index.html`·`dev/game-mock.html` 각 1줄, `dev/game-mock.js` ROUND_START 5줄, `public/i18n/ko/ui.json` 6줄 |
| 공식 전투 이펙트 (로컬 클라이언트 추출) | `tools/local-extract/fx_extract.py` → `public/assets/local/fx/**`, `public/js/render/fxplayer.js`·`fxgame.js`·`fxmap.js` | `render/app.js` 8줄(이벤트·프레임·정리 훅, 부하 단계·3D 보드 여부·전투 시계 배속 전달, `stats()`의 `fxGame`, `atk`의 화살 종류 `fxGame.arrowKind(e)`, 공식 이펙트로 그린 `fx`는 2D 대체 생략 `fxGame.ownsFx(e)`), `render/fx.js FX_KINDS` 2줄(`oblvnsNote`, `chen3Qi`) |
| 공식 스테이지 3D 씬 (스테이지별 사막·카시미어·시라쿠사 씬, 라이트맵, 필드별 숨김 세트) | `tools/local-extract/scene_extract.py` → `public/assets/local/scene/**`, `public/js/render/board3d/official.js`, `test/render/board3d-official.test.js` | `board3d/scene.js`(로더 옵션·`officialRoot`·`setStage` 분기·`highlandFor`), `render/app.js` 2곳(`loadOfficial`/`onOfficial` 옵션, `setStage`의 높이), `style.js tileTop` + `tiles.js`·`layout.js` 1줄씩 |
| 스킬 효과음 보강 (ON_SKILL_START가 없는 스킬은 ON_ABILITY_START/ON_CUSTOM_TRIGGER [start]/ON_ABILITY_ON/HIT 뱅크) | `tools/assets/skill-sfx.mjs` | `tools/assets/plan.mjs` 2줄 |
| 갱신 버튼 강조 (전략이 다음 수동 갱신에 작용할 때 테두리가 빛남: 두요야 라운드 첫 2회, 梓兰 매번, 佩佩 특수 갱신 대기, 贾维 N번째 갱신 직전) | `server/local-patch.js refreshBoost` (`privateView` 감싸기 → `shop.refreshBoost`), `public/css/refresh-boost.css` | `ui/shopBar.js` 갱신 버튼 class 1줄, `index.html` 1줄 |
| 리소스 미리 받기 카드에서 음성 언어 선택 (처음 접속할 때 한국어/일본어/끄기, 고르면 용량 다시 계산) | `public/js/resources.js` `ResourceHost`, `voice.js setVoiceLang`, `public/css/resources.css` | — |
| 얼린 상점에서 특수 갱신이 바꾼 칸도 얼림 유지 (원본은 `setShopSlot`이 항상 `frozen: false` → 佩佩·杜遥夜가 넣은 칸이 전투 시작 때 사라짐) | — | `server/match/effectsMeta.js` `setShopSlot` 2줄 (바뀌기 전 칸의 얼림 상태, 없으면 상점 얼림 상태) |
| 디버그용 재화 고정 (`SP_DEBUG_FUNDS=<0..999>`일 때 사람 플레이어 재화가 그 값으로 고정, 봇은 그대로. `local.sh`가 기본 99, 배포 서버는 미설정) | `server/local-patch.js debugFunds` (`PlayerState.prototype.funds` 접근자) | 없음 |
| 게임 내 디버그 패널 (로컬 디버그 모드만: 보드 왼쪽·맹약 줄 아래. 「디버깅용 재화 99 고정」 체크박스 = 플레이어별로 재화 고정 켜고 끄기, 선발 오퍼레이터·티어·일반/정예·스킬(S1~S3)·모듈(정예만, 없음 포함)을 골라 정비 구역에 추가) | `server/local-patch.js` `debugMode`·`debugIntent`·`debugView`(`privateView` 감싸기 → `m.private.debug`, 디버그 모드일 때만 설치), `shared/local.js`(`dbg.funds`·`dbg.addDiy` 형식), `public/js/ui/debugPanel.js`, `public/css/debug-panel.css`, `public/i18n/ko/ui.json` 7줄 | `screens/game.js` 2줄(import, 렌더), `index.html` 1줄 |
| 스킬 모드 공격·타격음 + 공식 믹서 그룹 볼륨 (2026-10-07) | `public/js/audioOfficial.js`, `tools/assets/skill-mode-sfx.mjs`, `tools/local-extract/char_modes.py` → `tools/assets/local-char-modes.json`, `test/local-patch-audio.test.js` | `public/js/audio.js`(import, `unit()` 모드·게인, 이벤트 루프 몇 줄, 채널 게인 2줄), `tools/assets/audio.mjs` 3줄, `plan.mjs` 몇 줄, `skill-sfx.mjs`·`kit-sfx.mjs` 함수 1개씩 |
| 스킬 중 매 공격 이펙트(공식 모드 바인딩) + 이펙트 배속 연동 (2026-10-07) | `shared/skill-modes.js`, `public/assets/local/fx/modes.json`(git 밖, `char_modes.py`), `test/local-patch-fxmodes.test.js` | `render/fxgame.js`(로컬 파일), `render/fxmap.js`(로컬 파일) `attackMode`·`boundEffects` |
| 이펙트·사운드 디버그 페이지 = 샌드백 아레나 (`SP_DEBUG_PAGE=1`일 때만, 배포 서버는 404 — `/js/debug/*` 포함) | `public/debug.html`, `public/js/debug.js`, `public/js/debug/arena.js`·`sandbag.js` (`/fxlab.html`은 이리로 넘김), `server/local-patch.js debugPageHidden`, `test/local-patch-debug.test.js` | `server/index.js` 2줄, `render/app.js` `debugFx` 1줄(+헤더 1줄), `render/fxgame.js` `debugPlay` |
| `/healthz` 축소 (프록시를 거친 요청은 `ok`·`version`·`app`·`build`만, 접속자·방 수는 컨테이너 안 확인용) | `server/local-patch.js proxiedRequest` | `server/index.js` 2줄(import, `/healthz` 앞 1줄) |
| iframe 차단 헤더 | — | `server/index.js` 3줄 |
| 나가기 창에서 「暂离（AI 托管）」 숨김 | — | `ui/matchChrome.js` (`AWAY_OPTION = false`) — 나가면 자리를 포기한다 |
| 맹약 스택 세 자리 줄바꿈 수정 | `public/i18n/ko/ko.css` | — |
| 협동 보스 HP = `bloodPoint` × 생존 인원 | `server/local-patch.js` (`GameData.prototype.bossPoolShare`를 감쌈) | 없음 (`lobby.js`가 이미 import) |
| 제국의 갑주 등장 폭격·3연타 PRTS 수치 | `server/sim/content/local-patch.js` | `server/sim/content/index.js` 1줄 (`DOMAIN_NAMES.push`) |
| 胄 드론 연동 피해를 限伤에서 제외 | `server/sim/content/local-patch.js` | 위와 같음 |
| 성당 검사(圣堂剑士) 탄약 소모 스킬·탄약 표시 (2026-10-06) | `server/sim/content/local-patch.js` | 위와 같음 + `server/sim/snapshot.js unitTuple` 1줄(`e.lpAmmo` → SP/SP 최대), `render/units.js` 2줄(SP가 있는 적도 막대 표시, 적은 「준비」 빛 없음) |
| 더블린 그림자 캐스터(·리더) 외 27종은 비행 아군을 공격하지 않음 (2026-10-06, 아래 전수 조사; 자로는 2형태만) | `server/sim/content/local-patch.js` (`NO_AIR_KEYS`, `NO_AIR_FORMS`, `beforeAttack` 재필터) | 위와 같음 |
| 频次(특수 HP, "N회 피해로 격파") 적에게 隐德来希 효과가 한 번에 여러 칸을 깎던 것 (2026-10-06, 원본 버그 — 원본 PR 후보): 萃血 최대 HP 흡수는 频次 적에게 안 걸림(PRTS 萃血 비고 「无法对…拥有特殊生命值机制的敌人…生效」), 心烛가 받은 피해를 원래 적에게 넘길 때 频次 적이면 출처 없는 진실 피해 1회(=1)로(PRTS 비고 「无来源真实伤害…如特殊生命值机制」) | — | `server/sim/content/kits/tier5.js` 隐德来希 2곳(萃血 조건 1줄, 心烛 전달 2줄) |

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

### 성당 검사 (圣堂剑士, `enemy_10087_hlchgr`, 수배 - 특이 II) — 2026-10-06
- 공식: enemy_database spData `maxSp 5, initSp 5, increment 0`(= 탄약 5, 프리팹 `_showSpAsBulletMode`), 스킬 `ForeverEnhance` spCost 1
  {`atk_add 0.2`, `move_speed_add 0.2`}, 재능 `SkillTrigger.interval 6`·`max_stack_cnt 10`. 버프 템플릿 `hlchgr_t[skill_trigger]`: 6초마다
  스킬 시전 시도(탄약 있어야 함, 현재 행동 끊고 Skill 모션), 시전마다 공격력 +20%(MULTIPLIER)·이동 속도 최종 ×(1+0.2×횟수)(FINAL_SCALER).
  PRTS: 「每6s尝试触发一次【赐我力量！】，最多成功触发10次」, 침묵 불가.
- 원본: 같은 수치를 그냥 6초 타이머로 5번 — 탄약이 안 보이고 시전 모션도 없어 「탄환을 써서 강해지는」 모습이 보이지 않았다. 기절 중에도 강화, 이동 속도는 기본값 +20%씩.
- 로컬: 탄약 5발을 적 SP 막대로 표시(한 발 쓸 때마다 줄어듦), 6초마다 시전(Skill 모션) → 탄약 −1, 공격력·이동 속도 강화, 탄약 0이면 끝.
  [추정] 기절·빙결·수면 중 시도는 실패(탄약·횟수 그대로, 6초 뒤 다시 시도). 공식은 탄환 모양 칸으로 그리지만 여기서는 막대 하나.
  시전이 진행 중인 공격을 끊는 부분은 넣지 않았다(이 시뮬의 적 공격은 타격 순간 한 번에 처리).

### 더블린 그림자 캐스터 (深池暗影术师, `enemy_1168_dumage`/`_2`, 수배·전술 특훈 - 굴절 II) 「한꺼번에 공격」 제보 — 2026-10-06 조사(타이밍은 수정 없음), 비행 유닛 공격 안 함 추가
- 공식: 원거리 법술, 공격 간격 3.0초, 범위 2.5, 투사체 `projectile_enemy_dumage`(속도 10, 1회 타격), 재능은 굴절(마법 저항 +70)뿐, 스킬 없음.
  우리 시뮬도 같다(단독 30초: 3.0초마다 1발).
- 실제 대전 경로(수배 15_5, 여러 스테이지·라운드)에서 한 마리는 늘 3초 간격. 한꺼번에 들어오는 경우는 「특훈 적·굴절」 라운드의 4마리 무리
  (예: seed 2 R4, 1.75초 간격 4마리 → 두 마리씩 0.5초 차로 같은 오퍼레이터를 노림). 공식 웨이브 구성대로라 버그로 보지 않았다.
  어느 판·화면이었는지 받으면 다시 본다.
- 비행 유닛 공격 안 함 (2026-10-06, 사용자 결정 「공식과 일치하면 넣어」): PRTS 천부 「不会攻击飞行单位」, EN 클라이언트 프리팹
  `Attack/Trigger`의 `_targetMotion 1`(지상만; `_2`도 1). 비교: 비행을 치는 웨이브 캐스터 `enemy_1161_tidmag`·살카즈 왕정군 정예 캐스터
  `enemy_1275_dwlock_2`는 3, 이미 「不会攻击飞行单位」로 구현된 `enemy_10122_uacann_2`·`enemy_10141_xdpeng_2`는 1.
  원본은 굴절만 넣어 비행 아군(炎 6명 맹약의 「炎佑」 `enemy_9012_acloon`)도 쐈다. 로컬: 두 적에게 원본의 같은 규칙
  (`e.profile.canTarget = u => !u.isFlying`, enemies.js `noAirTargets`와 동일)을 붙임. 起飞(이륙) 아군은 원래부터 지상 적이 못 친다(`evadesGround`).
  `enemy_1023_jmage`(은신 캐스터)는 아래 전수 조사에서 같이 넣었다.

### 적 비행 유닛 공격 전수 조사 (2026-10-06, 사용자 「같은 기준으로 적 전체를 훑어봐」)
- 방법: EN 클라이언트 `battle/enm_pfb_*.ab`의 적 프리팹 전부에서 대상 필터(`_targetMotion`)가 있는 능력을 모두 읽고(일반 공격·스킬·재능),
  `data/enemies.json` 249종을 실제 시뮬에서 소환해 `profile.canTarget`(=`noAirTargets`·`NO_AIR_KEYS`)과 비교. 근접(MELEE) 적은 저지한 유닛만 치고
  비행 아군은 저지하지 않으므로 제외. 이 게임의 비행 아군은 炎 6명 맹약의 「炎佑」(`enemy_9012_acloon`)뿐이고, 起飞(이륙)은 지상 적이 원래 못 친다.
- 값: 1 = 지상만, 3 = 지상+공중(이미 「不会攻击飞行单位」로 구현된 적 11종이 전부 1, 공중도 치는 캐스터 `tidmag`·`dwlock_2`는 3). 2(공중만)는
  `enemy_2102_dytmbr`·`enemy_9009_acfort`·`enemy_10148_nsmos`의 「아군 적」 대상 능력(`_targetSide 1`, 비행 적을 삼키는 것 등)뿐이라 아군과 무관.
  0은 오라 선택자. 반대 방향(우리가 비행을 안 치는데 클라이언트 3)은 없었다.
- 고친 것 (`NO_AIR_KEYS`에 추가, 클라이언트 일반 공격 1 + PRTS 천부 「不会攻击飞行单位」, 烹泉·沏虹은 「不可对空」):

| id | 이름 | 클라이언트 | 원본 | PRTS |
|---|---|---|---|---|
| `enemy_1019_jshoot` / `_2` | 은신 석궁병 / 리더 | 1 | 공중 공격 | 「未被阻挡时进行远程途径攻击，不会攻击飞行单位」 |
| `enemy_1023_jmage` | 은신 캐스터 | 1 | 공중 공격 | 「隐匿，不会攻击飞行单位」 |
| `enemy_1050_lslime` | '폼페이' | 1 | 공중 공격 | 「可同时攻击4个目标，不会攻击飞行单位」 |
| `enemy_1158_divman` | 잠수부 | 1 | 공중 공격 | 「免疫水蛇，不会攻击飞行单位」 |
| `enemy_1162_magmot` | 웨이브 캐스터 쾌속정 | 1 | 공중 공격 | 「免疫水蚀，不会攻击飞行单位」(탄도 범위 피해는 「可对空」) |
| `enemy_1183_mlasrt` | 아머레스 유니온 숙청소대 | 1 | 공중 공격 | 「普通攻击与技能不会攻击飞行单位」 |
| `enemy_1203_sfhu` / `_2` | 펑취안 / 치훙 | 1 | 공중 공격 | 「…（无视迷彩，不可对空）」 |
| `enemy_1283_sgkill` / `_2` | 패밀리 멸살자 / 어둠의 멸살자 | 1 | 공중 공격 | 「隐匿（…），不会攻击飞行单位」 |
| `enemy_1501_demonk` | 살카즈 백부장 | 1 | 공중 공격 | 「可最多同时攻击2个目标…，不会攻击飞行单位」 |
| `enemy_1517_xi` | '즈자이' | 1(모든 형태·스킬) | 공중 공격 | 「普通攻击不会攻击飞行单位」 |
| `enemy_2005_axetro` | '버림받은 자' | 1 | 공중 공격 | 「不会攻击飞行单位」 |
| `enemy_9008_acbunn` | 가상적: 골극 | 1 | 공중 공격 | 「不会攻击飞行单位，隐匿…」 |
| `enemy_10027_vtsk` | '제국의 갑옷' | 1 | 공중 공격 | 「未被阻挡时进行远程途径攻击…，不会攻击飞行单位」 |

- 클라이언트 값만 있는 것 (사용자 결정 「공식 클라이언트를 따라 막아」, 2026-10-06 — 이전 [추정 보류]): 일반 공격 대상에서 비행 제외.
  - 클라이언트 1, PRTS 언급 없음: `enemy_2010_csdcr` 스칼릿 싱어, `enemy_1252_lysytb_2` Dor-β호 복제품, `enemy_1427_lrnazg` '영장'(「可同时攻击自身攻击范围内的所有我方单位」),
    `enemy_1509_mousek` 래트킹(PRTS 적 문서 못 찾음), `enemy_1504_cqbw` W(일반 공격 1, PRTS 적 문서 못 찾음).
  - `enemy_1535_wlfmster` 자로: 형태별(`NO_AIR_FORMS`) — 1형태(M1)는 일반 공격 필터가 없어 그대로, 재생 후 2형태(M2 공격 1, `e.form === 'form2'`)만 비행 제외.
  - `enemy_1516_jakill` 제셀톤: 우리 시뮬은 두 형태를 다 쓴다. 1형태(狱警, 원거리, 공격 1 + PRTS 「普通攻击和技能不会攻击飞行单位」)는 비행 제외,
    2형태(杀手)는 근접이라 저지한 유닛만 쳐서 규칙이 있어도 차이 없음(프리팹에 일반 공격 필터 없음).
  - `enemy_10098_crhro` / `enemy_10099_crvln`: 기본 형태 1 → 제외. 사격 형태(3·3 / 3·1)는 이 시뮬에 없음(촬영 구역 미구현).
  - `enemy_9014_acstma` / `enemy_9015_acstmb`: 바깥 공격 선택자 1(안쪽 3) → 제외.
  - `enemy_1404_msnip` 강화 석궁 기습자: 일반 공격 필터 없음, 십자 사격 3 → 그대로.
  - 직접 공격 대상을 고르는 키트(`before`에서 `c.targets`를 바꿈: '영장'은 범위 안 전원, 갑주 칼날은 범위 안 전원)는 엔진 후보 필터를 거치지 않아,
    내용 처리(우선도 50) 뒤 우선도 49 `beforeAttack`에서 대상 목록을 한 번 더 거른다(비면 공격 안 함).
- 테스트: `test/local-patch.test.js` 「sweep」 2개(원본은 모두 공중 허용, 로컬은 지상만), 「client-only」(10종 + 자로 형태별), '영장' 직접 대상 선택 재필터, 실제 대전 경로 2개(굴절 II 캐스터, 은신 I 석궁병 + 炎佑).
- **스킬·범위 피해** (2026-10-06 2차, 같은 사용자 결정): 스킬마다 **대상을 고르는 선택자**(Trigger/Selector)와 **투사체 충돌 선택자**를 따로 읽었다
  (`battle/enm_pfb_*.ab` + `battle/prefabs/[uc]projectiles.ab`의 `_targetMotion` / `_targetOptions.targetMotion`; 1차 조사는 적 프리팹의 Trigger만 봤다).
  결과: 대상 선택은 지상만인데 그 대상 주변을 치는 투사체는 3(공중 포함)인 경우가 있어, 효과별로 따로 맞췄다.

| id | 능력 | 클라이언트 선택자 | 투사체 충돌 | PRTS | 원본 | 로컬 |
|---|---|---|---|---|---|---|
| `enemy_1509_mousek` 래트킹 | 唱沙(DriftSand) 십자 | Trigger 1 (최대 HP) | `projectile_mousek_s1` 3 | 적 문서 없음 | 중심이 비행 아군일 수 있음 | 중심은 지상 아군만, 십자는 비행도 맞음 |
| 〃 | 沙狱(SandStorm) | Trigger 1 (최소 HP) | `projectile_mousek_s2` 3 | (원본 인용) 「弹道可对空」 | 〃 | 중심은 지상만, 원 안 비행은 맞음 |
| `enemy_1516_jakill` 제셀톤 1형태 | 铁砂暴 기절(최대 2명) | Trigger 1, 버프 `stun` | 대상 직격(충돌 선택자 없음) | 「对禁锢装置/飞行单位以外的我方单位…晕眩」 | 범위 안 비행도 기절 | 지상만 기절 |
| `enemy_1517_xi` 즈자이 | 纬地经天 십자 | Selector 1 (가장 가까운) | `projectile_enemy_xi_s` 3 | 「※弹道可击中飞行单位」 | 가장 가까운 비행이 중심 | 중심은 지상만, 십자 줄의 비행은 맞음 |
| 〃 | 破桎而出 폭발(양 형태) | Selector 1 | 없음 | 「对自身半径3.0范围内的所有非飞行我方单位」 | 비행도 맞음 | 비행 제외 |
| `enemy_1512_mcmstr` 거대하고 못생긴 것 | 重生 자폭 | `bomb[reborning]/Trigger` 1, 버프 `stun` | 없음 | 「对半径3.0范围内所有我方单位」(대공 언급 없음) | 비행도 피해·16초 기절 | 비행 제외(클라이언트 따름) |
| `enemy_1183_mlasrt` 숙청소대 | 强力击(PowerAttack) | 자체 선택자 없음 = 일반 공격 대상(1) | `projectile_enemy_mlasrt_s` 충돌 없음 | 「普通攻击与技能不会攻击飞行单位」 | — | 변경 없음(1차의 `NO_AIR_KEYS`로 이미 지상만) |
| `enemy_1272_nhtank` 부패의 전차 | 秽蚀轰击 / 污染秽蚀 | Attack·AttackPolluted Trigger 1 | `projectile_enemy_nhtank_polluted` 3, `ignoreTargetFree` 1 | 「…（可对空，无视无法选择、迷彩…）」 | — | 변경 없음: 대상은 원래 지상(`canTarget`), 구역은 공중 포함이 맞음 |
| `enemy_1050_lslime` '폼페이' | 저지 시 자폭 | `RangeDamageAbility/Trigger` 1 | — | 「…（不可对空）」 | 이미 비행 제외 | 변경 없음 |

- 구현: 대상 고르기는 원본 공용 함수 `allTargets`·`targetsNear`(`content/enemies.js`)에 한 줄씩 — 적에 `lpGroundPicks`가 있으면 비행 아군을 뺀다.
  `content/local-patch.js` `NO_AIR_PICKS`(래트킹·제셀톤·즈자이)가 스폰 때 표시를 단다. 이 세 적이 두 함수를 쓰는 곳은 모두 클라이언트 1인 대상 선택뿐이다.
  범위 쪽(즈자이 破桎而出, 거대하고 못생긴 것 자폭)은 같은 적의 다른 범위가 공중을 쳐서 공용 표시로 못 묶으므로 `enemies.js` 그 자리에서 `isFlying`을 거른다
  (원본 '폼페이' 자폭·`dmgZone`의 `noAir`와 같은 방식). 起飞(이륙) 아군은 원래대로 `areaSelectable`/`evadesGround`가 처리한다.
- 테스트: 「enemy skills with a ground-only client selector」 8개 — 래트킹·제셀톤·즈자이 원본(비행 선택) / 로컬(지상만, 투사체 3인 범위는 비행도 맞음),
  거대하고 못생긴 것 로컬, 실제 대전 경로(“鼠王” 현상 수배 `enemyeffect_b_11` + 炎 6명 → 炎佑: 唱沙·沙狱 중심이 용이 아님; 수정 전에는 용이 중심이 됨).
  자폭 필터는 `enemies.js` 안이라 원본 비교 테스트가 없다(수정 전 실행에서 비행 기절 확인).

## 오퍼레이터 음성 (2026-10-05, 원본 #73 병합 후 2026-10-06 정리)
원본 #73(`54cdad2`, DESIGN §21.30 「干员战斗语音」)이 전투 음성을 넣어서, 재생 규칙은 원본을 따르고 로컬 패치는 두 가지만 남겼다(사용자 결정 2026-10-06).
- 원본이 하는 것: 전투 중에만 공식 슬롯 12개 — 행동 출발(처음 배치된 오퍼레이터)·배치(나머지)·행동 개시(첫 타격, 엔진 `engage` 이벤트)·
  전투 중 선택(상세 패널)·작전 중 1~4(스킬 번호)·결산 4종. 한 번에 하나, 간격 1.2초, 유닛·슬롯별 쿨다운, 공식 우선순위(VoiceGate).
  음성 음량은 설정의 「干员语音」 슬라이더. 언어는 빌드 때 하나(`fetch-assets --voice-lang`, 원본 기본 cn).
- 로컬 1 — 언어 선택: 빌드 기본을 한국어(`--voice-lang=kr`, `audio.voice`)로 하고, 같은 슬롯의 일본어를 `audio.voiceJp`로 같이 받는다
  (`tools/assets/voice.mjs voiceTwin`, 파일은 `audio/voice/{kr|jp}/{charId}/cn_NNN.mp3`, 원천 `sound_beta_2/voice_kr/`·`voice/`).
  설정의 「语音语言」에서 브라우저마다 한국어/일본어/끄기(`sp.pref.voice`, 기본 한국어) → `audio.voiceTable`이 `audio.voice()`에 고른 표를 준다.
  리소스 미리 받기는 고른 언어만 받는다. 2026-10-06 기준 한국어 124명·일본어 125명, 대사 3,486줄(사키코는 한국어 더빙 없음).
- 로컬 2 — 정비 단계 대사(원본은 휴식기 무음): 말을 집거나 선택하면 선택(`select`), 상점에서 사거나 정예화 보상·특수 제안에서 고르면
  배치(`place`). 원본 `audio.voice()`의 VoiceGate를 그대로 거친다(`unitKey` `prep:…`).
- 이전 로컬 패치에서 뺀 것: 작전 개시(무작위 한 명)·스킬 대사·자체 겹침 규칙·자체 음량 — 원본 것으로 대체.
- 로컬 3 — 공식 재생 규칙(2026-10-06, 사용자 결정; `public/js/voicePolicy.js`를 `voice.js`가 설치, `audio.js`에는 훅 몇 줄):
  클라이언트 `audio_data.json battleVoice` 값 그대로 — 전체 간격 없음, 우선순위(행동출발 100·행동개시 90·수동 스킬 70·자동 스킬 60/50(SP 10 이상/미만)·
  배치 20·선택 10), 같은 우선순위는 유형이 겹침 허용(행동출발·수동 스킬·배치·선택)이면 앞 대사를 끊고, 아니면 버림, 쿨다운은 자동 스킬 10초만(오퍼레이터별).
  원본 #73의 1.2초 간격·「+10 이상이어야 끊음」·모든 스킬 10초/70은 공식 값과 달라 스킬 대사가 많이 빠졌다(데이터로 확인).
  클래스·필드 이름으로 추론해 사용자가 공식대로 정한 것: 작전중 대사는 1~4 중 무작위(`LoadRandomVoiceList`), 행동 개시는 전투당 1번
  (`m_encounterFirstEnemyFlag`, 버려진 시도는 3초 뒤 다시), 전투 시작은 한 명만 행동출발이고 나머지 첫 배치는 말하지 않음
  (`AutoChessGameModeVoicePlugin._OnCharacterPlacedAtBattle`; 2초 뒤 재배치는 배치 대사). 원본 테스트는 원본 `VoiceGate` 그대로라 깨지지 않는다.

## 선발 오퍼레이터 (2026-10-05)
- 원본 甄选 규칙(공식 데이터 + bilibili wiki 盟约): V·VI단계 2칸씩, 경기 전 오퍼레이터 구성 화면에서 고른다. 고른 오퍼레이터는 그
  플레이어 상점에만 나오고, 일반 E2 Lv1·스킬 4 / 정예 E2 Lv60·스킬 7·모듈 1(V) 또는 3(VI), 가격 4·판매 1·3장 합성. 특질 없음.
  맹약은 진영으로(위키 규칙, 叙拉古·卡西米尔 확장은 [추정]), 없으면 협방(emptyShip): 왕·첸 → 염, 나머지 → 협방.
- 후보마다 단계별 전용 chess id(`chess_diy_<key>_<5|6>_a/_b`)를 `tools/build-diy.mjs`가 build-data의 빌더로 만든다(공식 슬롯 status 복사).
  `data/chess.json`은 건드리지 않고 `data/diy.json`을 따로 두어 서버·브라우저(데이터 스토어, 전투 시뮬) 로드 때 합친다.
  플래그 `isDiy + diyPick + visible:false` → 공용 풀·금지·봇·원본 데이터 검사에서 빠진다.
- 고르기: loadout 항목에 `diy: 1|2`(칸 번호). 스킬·모듈은 일반 오퍼레이터처럼 상세 패널에서 고른다. 같은 칸 두 번, 같은 오퍼레이터 두 번은 거부.
- 저장·내보내기: `diy`는 localStorage와 내보내기 JSON에 그대로 들어간다. `parseStored`(새로고침·가져오기 공용)가 `diySlotOf`로 칸 번호를 남기고,
  내보내기 버튼은 바꾼 오퍼레이터가 없어도 선발 픽이 있으면 켜진다(`hasDiyPicks`). 원본이 `parseStored`/버튼 조건을 고치면 이 두 줄을 다시 확인한다.
- 상점: `server/local-patch.js`가 SharedPool/PlayerState를 감싼다. 고른 사람 수 × 단계 복사본(V 8 / VI 5)만큼 풀 항목을 만들고,
  상점 굴림에서 고른 사람에게만 나온다. 효과 굴림(기변·신표 등)과 봇은 보지 않는다.
- 전투: `server/sim/content/kits/diy.js`의 전용 키트(5명 × 스킬 3개, 재능, 모듈 특성), 등록은 `content/index.js` 3줄.
  - 왕 (2026-10-05 재작성, 공식 테이블 + PRTS 「望」 비고): 바둑돌(손패 소환물, 지상·고지대 아무 배치 칸 — 토큰 position ALL)은
    **함정**: 공격 대상이 되지 않고 피해를 받지 않는다(untargetable + invulnerable, 클라이언트 HP 바 없음). 직교로 한 번 이어지면 활성화되고,
    이어진 돌이 사라져도 활성 상태가 유지된다. 적(비행 포함)이 발동 범위에 들어오면 발동(돌은 남음). 발동 범위는 자기 칸, S3를 장착하면(패시브)
    `x-1`(반경 2 마름모 13칸, 2026-10-06 사용자 결정: 공식대로) 전체 → 고지대 돌도 S3면 지상 적을 잡고, S1/S2면 비행 적만 밟는다(S2 폭발은 연결 방향 지상 적도 맞힘).
    - S3 범위의 근거 (2026-10-06 재확인): 넓은 범위는 **S3 장착(패시브) 기준이고 S3 발동 중에만이 아니다.** skill_table 「被动效果：棋子的触发和伤害范围扩大」,
      PRTS 天下劫 비고 「※携带该技能时，棋子与跟子的攻击范围/触发范围为{{popup/range|x-1}}，可响应飞行单位，触发时对范围内所有敌方单位造成伤害（可对空）」.
      EN 클라이언트: 토큰 스킬 `sktok_wang_3.prefab`(숨김 패시브, 발동 상태 조건 없음)의 `SkillTrigger`·`Selector`(폭발) 범위 컴포넌트가 둘 다 `_rangeId "x-1"`,
      S3가 발동 중에 쏘는 돌 `projectile_chr_wang_stone3.prefab` Selector도 `x-1`(S1/S2 돌 `stone1`/`stone2`는 `0-1`). S3 발동은 망의 모드만 바꾼다
      (`skchr_wang_3` SwitchMode `mode 2` = 평타 정지 + 적 칸 배치 버프 `wang_token_deckbuff`) — 범위를 바꾸는 노드는 없다. `x-6`은 skill_table
      `sktok_wang_3.rangeId`에만 있고 프리팹 어디에도 없다(비교: 多萝西 `sktok_doroth_3`은 표 `x-6`, 프리팹은 발동 `0-1`만 있고 폭발 Selector에 범위
      컴포넌트가 없음 → 표 범위는 프리팹에 범위가 없는 노드에 쓰이는 것으로 보인다 [추론]). 따라서 모양도 `x-1`(마름모 13칸) — 예전에
      「너무 넓다」는 피드백으로 `x-6` 십자로 되돌렸으나, 이 근거를 보고 사용자가 공식대로 마름모로 정했다(2026-10-06, `diy.js DIAMOND2`).
      테스트: 대각선으로만 길에 닿는 돌(10,1)이 S3에서 발동(십자로는 실패하는 것 확인).
    - 발동하면 돌은 **소모**된다(陷阱师 함정 공통 「踩上去的第一个敌人会触发其效果」, 토큰에 ON_UNIT_DEAD 소리가 있음 — 바둑돌 자체에 대해
      PRTS가 직접 쓴 문장은 못 찾음). 놓았던 돌은 모드의 재배치와 같은 방식(`Battle.redeploy`, `tokens.js enableRespawn`)으로 돌아온다:
      재배치 시간(E2 2초) 뒤, 자기 칸에, DP(토큰 cost 3, VI 정예는 모듈로 2)만 내고, 그 칸에 적이 없을 때. 망이 필드에 없으면 기다린다 [추정].
      소모된 돌은 카드로 돌아온다(소환물 덱 규칙: 퇴장한 소환물은 재배치 시간 뒤 손패로) — 재고를 쓰지 않는다. 跟子는 소모되면 끝.
      (2026-10-06 사용자 보고 「돌이 다시 놓이지 않는다」: 이전 모델은 재배치마다 재고 1개를 쓰고 재고가 7 − 놓은 수(보통 1)여서 한 번 뒤엔
      S1/S2 전까지 돌아오지 않았다. 실제 경기 경로(Match 보드 → battleInput → BattleSpec → 브라우저 createBattleFromSpec) 테스트 추가.)
    - 은신(隐匿) 적: 선택할 수 없는 적(隐匿 미노출, untargetable)은 돌을 발동시키지도 않고 폭발에도 맞지 않는다(PRTS 작전 메커니즘
      「AOE的判定是对攻击范围内的每个可以被选中的敌人进行判定」, 엔진의 `Battle.foesInRadius`와 같은 규칙).
    - 정비 단계에 놓은 자리 그대로 전투를 시작한다. 전투 시작 자동 배치에는 跟子가 없다(사용자 결정 — 예전엔 돌마다 跟子를 만들었고 그게 배치
      한도 6에 걸려 먼저 놓은 돌을 퇴각시켜 배치가 바뀌었다). 그 외 모든 돌 등장(소모된 돌의 재배치, 재고 배치)에는 跟子 1개
      (클라이언트 `wang_stone1_t_1[trigger]` ON_OWNER_BORN, 수동 한정 필터 없음).
    - 클라이언트 데이터 반영(2026-10-06): 망이 필드를 떠나면(퇴각·쓰러짐) 돌과 跟子가 모두 죽는다(`die_to_kill_token` ON_OWNER_FINISH →
      KillTokens; 놓았던 돌은 망이 다시 서면 제자리로 돌아온다 [추정]). 배치·재배치는 걷는 적만 막는다(`_excludeOccupiedByWalkEnemy`, 비행 적은
      안 막음). 跟子 위치의 동순위는 무작위(`_alwaysRandomInTheEnd`, 시드 고정 battle.rng). 跟子 발동은 적의 기준 칸으로 판정
      (`_checkTargetRootTile`). S1 지속 피해: 첫 틱은 걸리는 즉시, 1초 간격, 6.5초 → 7회(`waitFirstTriggerInterval: false`); 돌 토큰의
      지속 피해만 무출처, 跟子의 것은 망이 출처.
    - 跟子(E1+)는 망이 쏜 투사체(PRTS): 배치 한도에 안 들고 칸을 차지하지 않는다, 최대 `attack@max_spawn_cnt`개. 위치 우선순위: 적이 있는 칸 >
      배치 불가 지상 > 배치 가능 지상 > 고지대, 같으면 무작위(클라이언트; PRTS의 상>우>하>좌가 아님). 연결에 참여하고 피해 출처는 망.
      놓을 수 없는 칸(2026-10-06 사용자 「적 공격 포인트」): 클라이언트 跟子 선택기 `exceptTileTypes` + tileTypesMask 14. 비트는
      battle_misc_table `tileTypeDict` 순서로 해석 [추정: DEFAULT 1, END 2, START 4, HOLE 8, FAKE_HIGHLAND 16, RESPAWN_ABNORMAL 32] →
      14 = END·START·HOLE = `tile_end`·`tile_end_cooperate`·`tile_allygoal`(방어 지점), `tile_start`·`tile_start_cooperate`·`tile_enemygoal`
      (적 침입 지점), `tile_hole`. 배치 불가 고지대도 불가(재능·재배치·S3 시작 초과분·S3 배치 모두 같은 `followerClass`). 비행 적 출현
      칸(`tile_flystart`)은 이 목록에 없다. 망 S3 자동 발동: 공식 규칙 「攻击范围扩大」 → 기본 전략(평타 직전 + 3-3 안의 적, `DEFAULT`). 한때 스킬 범위 4-12에 적이 들어오면
      켜지는 `SKILL_RANGE` 예외였으나 사용자 결정(2026-10-06)으로 공식 규칙으로 되돌렸다(`tools/build-diy.mjs DIY_TRIGGER_DEVIATIONS` 비움).
    - 손패(재고) 상한 maxDeckStackCnt(7)는 **손패만** 센다(클라이언트 `wang_s3_charge_token` max_cnt/remaining_cnt =
      AssignTokenCardCntToBB 카드 수, `_stopSpWhenTokenIsFull`도 카드 수). 전투 시작 때 위수협약이 나눠 준 배치 한도 6장(PRTS
      「根据召唤物部署数量上限…发送等量召唤物至手牌区」) 중 놓지 않은 것이 손패. S1/S2 「즉시 2개 획득」 = min(7 − 손패, 2)장, 손패 7장이면 阻回.
      S3(탄약형): 시작 때 ChargeToken min(7 − 손패, 8)장, 나머지는 InstantSpawn 跟子(살아 있는 跟子 ≤ max_spawn_cnt) — 사거리 안 칸,
      적이 선 칸 우선(방어 지점까지 남은 경로가 짧은 적 순 — 아래), 나머지는 무작위, 기존 돌과 붙을 필요 없음. 탄약 20발: S3 중 배치 1번마다 그 돌의 상하좌우 중 놓을 수 있는 칸에 跟子(최대 4개),
      **실제로 놓은 跟子 1개당 1발**(클라이언트 SpawnTokenS3InSkill의 BuildStone 카운터 `_countEvent 4, _expendPerTrigger 1`, 사용자 확인
      2026-10-06). 충돌: PRTS 스킬 문구 「第一天赋额外至多部署3枚棋子并消耗等量弹药」와 나무위키 「최대 3개의 바둑돌은 배치될 때 탄약을 1발씩
      소모」는 3발로 읽힌다.
      끝나는 조건은 재고 소진·탄약 소진·수동 종료뿐이고, 남은 탄약은 돌로 돌아온다(엔진 `end()`가 onEnd 전에 `ammoLeft`를 0으로 만들어 이전엔
      반환이 늘 0이었음 → 킷이 따로 기억, 손패 7장까지). **정비 단계에 돌을 하나도 놓지 않았으면** 아무것도 충전·배치하지 않고 끝나지 않는다
      (사용자 실제 게임 관찰 2026-10-06; 자료에는 직접 문장 없음). 소모된 돌의 재배치는 카드 자신이 돌아오는 것이라 S3 중에도 계속된다.
    - [추정] 위수협약 전투에는 수동 배치가 없어서, 재고의 돌은 자동으로 배치한다(필드의 돌이 maxDeployCount 6 미만일 때만): S1/S2는
      기존 돌 옆, 적 경로 위, 적이 없는 칸(특성), 적에 가까운 칸; S3는 1초에 1개 — 사거리 안 적이 선 배치 가능 칸(방어 지점까지 남은 경로가 짧은 적 순. [추정] 사용자 결정 2026-10-06: 공식 문구는 「优先部署在范围内敌人所在位置」뿐이고 클라이언트 `WangTileSelector`(SKILL_3_INSTANT, `_tileSortType` DONT_SORT)의 정렬은 네이티브, PRTS는 적 유무·지형 순서만 — 적끼리의 순서는 기본 공격 대상 규칙(`remainingDistance`, 같으면 먼저 나온 적)으로 채움. 이전엔 왕에게 가까운 순), 그런
      칸이 없고 필드에 적이 있으면 사거리 안 빈 칸(지상 경로 우선, 적에 가까운 순, 걷는 적이 없는 칸), 주변 跟子 1개당 탄약 1발.
      (2026-10-06 사용자 보고 「S3 탄약이 줄지 않는다」: 적이 사거리 밖으로만 지나가는 배치에서는 놓을 칸이 없었고, 적이 선 칸은 소모된 돌의
      제자리라 `isReservedTile`에 막혔다 → 그녀의 대기 중인 돌 자리는 막지 않음. UI의 탄약 막대는 엔진 `ammoLeft`를 그대로 쓰고 킷이 같이 갱신한다.)
      S3 중 소모된 돌이 제자리로 돌아오는 것도 그녀의 배치로 친다: 주변 跟子(최대 4개)를 놓고 1개당 탄약 1발(2026-10-06 브라우저 재현 — 정비 때
      6개를 놓으면 필드가 늘 가득 차 S3 대체 배치가 한 번도 일어나지 않아 탄약 막대가 가득 찬 채였고, S3 시작 때 InstantSpawn 跟子 1개만 주변 없이
      보였다. 수정 후 브라우저에서 라운드 5 S3: 탄약 16 → 12 → 9 → 5 → 2, 막대 45.6 → 5.7/57). 필드가 가득 차면 S3는 멈추지 않고 기다린다(이전의 자체 종료는 근거 없어 삭제 — 일찍 끝나던 원인). 소모돼 재배치를 기다리는 돌이 먼저이고, 새 칸은 그다음이다. 재고에서 놓는 돌도 DP를 낸다.
    - 취세: 정지 + 망 공격력 × atk_scale 마법/초(발동마다 독립). 연성: 연결 방향(상하 → 세로, 좌우 → 가로, 한번 켜지면 유지) 양쪽 3칸 적에게
      마법 피해 + 감속. 料敌机先: 직선 위 돌 수만큼 피해 +%, 마법 저항 고정 수치 무시(최대 3). 중첩은 돌마다 본 최장 직선으로 고정
      (3개 중 1개가 사라져도 남은 돌은 3중첩). 값은 데이터: 일반·V단계 정예 10%/9, VI단계 정예(모듈 3) 13%/12.
    - 跟子를 진짜 바둑돌이 아닌 투사체로 둔 근거: PRTS 「通过天赋'额外部署的棋子'实为望自身发射的弹道 由此其不具有单位相关的性质（例如占据空位等）」.
      화면에는 바둑돌 모델로 보이고 연결·발동·피해는 같다. 손패를 쓰지 않고 배치 한도 6에 들지 않아 정비 때 놓은 돌을 퇴각시키지 않는다.
  - 첸: 약점 대미지(물리·마법 중 유리한 쪽), 7초 무피격 시 회복+다음 공격 회피, S1 침묵, S2 0.4초 간격 10회 베기(처치 시 이전·+1회,
    무적) 후 대상 칸으로 이동 + 공격력·회피 버프, S3 검기(1.5칸/초, 반경 1.3, 직선 구간마다 적당 1회, 현재 HP 6%·최소 공격력 530%/정예 550%) — PRTS 비고 기준.
    S3 검기 회전(2026-10-06, EN 클라이언트 `[uc]projectiles.ab`의 `projectile_chr_chen3_s3` → `ChangeStateWithHighlandBehaviour`):
    앞 칸이 고지대·侵入点(빨간 문)·保护目标(파란 문)·필드 밖이고 그 칸 가장자리까지 0.25 이하(+0.02)이면 시계 방향 90°
    (`_hitDistance` 0.25, `_checkHitHighland`·`_checkTileStart`·`_checkTileEnd`·`_checkHitMapEdge`). 꺾이면 맞은 적 목록을 비운다.
    방향 값은 클라이언트에 없다(코드) → 시계 방향은 PRTS 「顺时针旋转90°」. 이전 코드와 다른 점: 0.75 앞을 봐서 0.5칸 일찍 꺾었고,
    저지대 통행 불가 칸·장애물이 놓인 칸에서도 꺾었고, 侵入点에서는 꺾지 않았다. 판정 간격 0.03초(이전 0.1초 → 이제 매 틱),
    수명은 스킬 끝까지(`_lifeTimeType` 2 = 시간 제한 없음 [추정], 스킬 종료 버프 `chen3_s3[finish_projectile]`가 지운다).
    `diy.js chen3QiAdvance`(테스트용 export). `fx` 'chen3Qi'는 0.1초마다 + 꺾일 때 바로.
    S3 자동 발동: 공식 규칙 「攻击范围扩大」 → 기본 전략(평타 직전 + 1-1 안의 적, `DEFAULT`) — 평타로 칠 수 없는 비행 적만 있으면 켜지지 않는다.
    한때 3-12 안의 적(비행 포함)으로 켜지는 `SKILL_RANGE` 예외였으나 사용자 결정(2026-10-06)으로 공식 규칙으로 되돌렸다. 예외가 다시 필요하면
    `tools/build-diy.mjs DIY_TRIGGER_DEVIATIONS` → `data/diy.json` (build-data의 `TRIGGER_DEVIATIONS`는 공용 기물 검사 때문에 못 쓴다).
  - 위셔델: 여진·잔영 폭발(재능1), 혼령의 그림자 소환과 근처 위장(재능2), S2 과부하([추정] 지속시간 후반부), S3 그림자 2개 추가(최대 3).
    S2 수정(2026-10-06): 과부하 본탄의 `attack@atk_scale_ol`(0.7)이 적용되지 않았다(사키코 S2와 같은 원인: `beforeAttack`의 `ctx.profile`
    교체를 엔진이 다시 읽지 않음). 과부하 동안 위셔델 자신의 `unit.profile` 복사본에 `atkScale`을 넣고 끝나면 되돌린다.
  - 사키코: 음표 수만큼 방어·저항 무시, Fever(450, 20초, 스킬 재시전·S2 2연타·S3 퇴각 안 함), S2는 시전마다 피아노↔오르간 전환([추정]).
    재능(2026-10-06, 나무위키 4.6 평가·PRTS 비고): 재능1 「지속 공격」 — 사거리에 적이 없어도 공격 간격마다 공격한다(공격 회복 SP +1,
    음표 1개). 그 음표는 근처에 온 적을 쫓아가 발사 때 공격력으로 맞힌다(아래 음표 시뮬레이션). 정면 1칸의 통행 유형이 「없음」이면 쏘지
    않는다. 음표 수: 공격 1개(S2 Fever 2), S1 시전 8개, S3 공격 4개(피아노 2 + 오르간 2) — 살아 있는 음표 수. 모듈 LOR-Y 2단계
    이상(VI단계 정예)은 「스킬 지속 중 원거리 공격력 감소 없음」. 재능2: Fever는 적에게 준 피해만 센다. 공격 속도 +는 현재 공격 범위(S3
    확대 범위 포함) 안의 오퍼레이터, **자신 포함**(이전: 재능 범위 고정, 자신 제외). 값은 데이터: 모든 단계 정예2 기준 방어 3%·저항 2%·최대
    10, Fever +3, 공격 속도 +12. VI단계 정예(모듈 3단계)는 방어 5%·저항 2.5%·최대 12.
    S2 수정(2026-10-06): 오르간 마법 피해·Fever 2연타가 실제로는 적용되지 않았다(`ai.js performAttack`이 `beforeAttack`의 `ctx.profile`
    교체를 다시 읽지 않음). 엔진은 그대로 두고 kit이 사키코 자신의 `unit.profile` 복사본(`dmgType`·`hits`)을 음색·Fever에 맞춰 바꾼다.
    음표 시뮬레이션(2026-10-06, `diy.js NOTE`·`noteStep`): 음표 하나하나를 키트가 날린다. 일반 공격은 엔진 투사체를 쏜 직후(`attack` 훅)
    투사체 목록에서 빼서 음표로 날리고, 도착하면 그 투사체의 `onHit`(엔진 `resolveHit`: 피해 유형·Fever 2연타·원거리 감소·attackId)을 부른다
    — 피해가 음표가 닿을 때 들어간다(이전: 엔진 화살 14칸/초). S1 8개·S3 오르간 2개·지속 공격 음표는 키트 음표(캐시한 공격력).
    값은 EN 클라이언트 `battle/prefabs/[uc]projectiles.ab`의 `projectile_chr_oblvns*`(이동 컴포넌트 + 컨트롤러)와 charpack
    `char_4182_oblvns.ab`의 `_projectileKey` — 자유 비행(칸/초) → 최소 자유 시간(초) → 추적(칸/초 · 회전/초), 대상 탐색 주기·반경:
    | 프리팹 | 쓰는 곳 | 자유 | 전환 | 추적·회전 | 탐색 |
    |---|---|---|---|---|---|
    | `projectile_chr_oblvns` | 대상이 있는 일반 공격 | 직선 2.0 | 0.1 | 2.0 · 5 | 0.4 · 1.0 |
    | `_talent` | 지속 공격(스킬 없음) | 사인 1.3(진폭 0.3) | 0.1 | 2.0 · 7 | 0.4 · 1.0 |
    | `_s1_1…8` | S1 | 직선 1.7, 방향 비율 (2i+1)/16 | 0.6 | 2.2 · 5 | 0.2 · 1.0 |
    | `_s2`·`_s2_t` | S2 피아노 | 사인 1.9(0.4) | 0.4 | 3.5 · 15, 맞힌 뒤 3.0으로 0.5초 | 0.2 · 0.8 |
    | `_s2_slow`·`_s2_slow_t` | S2 오르간 | 사인 0.7(0.15) | 0.4 | 1.0 · 2.5 | 0.4 · 1.0 |
    | `_s3_phy`·`_s3_mag` | S3 피아노·오르간 | 사인 0.8(0.5) | 0.8 | 1.3 · 7.5 | 0.4 · 1.0 |
    (지속 공격 = charpack `RangedAlways`: 스킬 없음 `_talent`, S2 `_s2_t`·`_s2_slow_t`, S3 `_s3_phy`·`_s3_mag`. 탐색 반경은 PRTS 跟踪范围半径,
    회전은 PRTS 「转向速度7/30每帧」 = 30fps에서 7/초.)
    규칙: 자유 비행 방향은 사키코 방향 ±20°(PRTS 「自身朝向左20°至右20°范围内，随机一个角度」, 스킬 음표도 같다고 [추정]; S1은
    `_sourceDirectionArcAngleRatio` (2i+1)/16 × 360° [추정: 한 바퀴 기준]). 공격 대상이 있으면 그 적을, 없으면 음표 반경 안에서 음표에
    가장 가까운 선택 가능한 적을 주기마다 찾는다(PRTS 「选择自身一定范围内距离音符自身最近的可选目标」). 최소 자유 시간이 지나고 대상이 있으면
    추적, 대상이 사라지면 현재 방향으로 다시 자유 비행(PRTS 「以当前运动方向重新进入至【自由移动】状态」). 사키코의 공격 범위 밖에서 대상 없이
    연속 `delay`(재능 bb 1초, 클라이언트 `passby_delay` 1.0)초 있으면 사라진다(PRTS 「音符位于自身攻击范围外时，若连续1s以上不存在跟踪目标则消失」)
    — 사거리 끝에서 바로 사라지지 않고 지나서 1초 더 난다(사용자 요구). 사키코가 퇴장하면 추적 중이 아닌 음표는 사라진다(PRTS
    「自身退场时，清除所有不处于【跟踪移动】状态的音符」, charpack `ProjectileElimate` `_keepAliveIfContainsTraceTarget`). 음표 수 = 살아 있는
    음표(클라이언트: 투사체 생성 이벤트에서 `oblvns_t_1[cnt]` +1, 도착·소멸 이벤트에서 −1; `oblvns_t_1`이 cnt × 비율을 max_cnt까지).
    시간 수명은 두지 않는다: 프리팹 `_lifeTime` 10은 `_lifeTimeType` 2인데, 이 유형의 클라이언트 투사체 57개가 `_lifeTime` 0(보호막·광선처럼
    로직이 끝낼 때까지)이라 타이머가 아니라고 봤다 [추론]. `NOTE_SAFETY`(60초)는 끝없이 쫓는 음표를 막는 시뮬레이션 안전장치일 뿐.
    [추정] 엔진에서 넘겨받은 일반 공격 음표는 도착 때의 공격력으로 맞힌다(엔진 `resolveHit`; PRTS는 캐시한 공격력). S2 피아노의 관통은
    그림만(피해는 1명: `_maxHitNum` 1). 사인 비행은 그림만, 시뮬레이션은 직선. 한 음표가 2타(S2 Fever, S3 피아노)면 `w: 2`로 세고 그림도 2개.
    도착 판정 거리는 피아노 0.8(PRTS 「激活0.8半径的碰撞」), 나머지 0.2 [추정]. 화면: 아래 "공식 전투 이펙트"의 사키코 음표.
  - 아스카론: 사망 구금 중첩(이동 −18%/중첩, 현재 공격력 10%/초), S2 둔화·처치 시 확산, S3 범위 내 적 명중률 −30%(회피 시 회복).
  - 대미지 감사(2026-10-06): 범위 대상은 모두 선택 가능 규칙(`foesInRadius`/`enemiesInKeys`/`canTargetEnemy`: 미노출 은신·선택 불가 제외).
    고친 것: 첸 S2 첫 대상(`unitsInGrid`는 필터가 없음 → 은신 적을 벰; 은신 적만 있으면 선택 가능한 적이 올 때까지 대기), 아스카론 S2 처치 확산이
    한 번도 안 되던 버그(`rangeKeys`는 배열인데 `.has?.`로 검사), 바둑돌 S2/S3 폭발 `canDodge: false`(원본 함정·폭발과 같은 규칙),
    S1 지속 피해 무출처(PRTS 「以无来源的形式施加给目标」).
- 소환물 모델: `data/diy.json`의 토큰은 `data/tokens.json`에 없어서 원래 `data/assets.json`에 빠져 있었다(아바타·모델 없음 → 마름모). fexli에 望
  바둑돌은 아예 없고 혼령의 그림자는 스킨 변형만 있다. EN 클라이언트 `PersistentData/Bundles/pkgrps/btl_pfb_tokens_*.ab`의 `<id>_SkeletonData`에서
  기본 모델을 뽑는다. 적 로컬 모델(`spineLocal`)과 같은 방식이라 `assets/local`이 없으면 아바타 마름모로 돌아간다. 다시 뽑는 법:
  `.venv-extract/bin/python tools/local-extract/token_spines.py --game <Bundles>` → `node tools/assets/local-token-spines.mjs` → `node tools/fetch-assets.mjs`.
  배포: `public/assets/local/spine/token/`와 `data/local-assets.json`(gitignore)을 서버로 복사한다.
- 밴: 공식 밴 규칙(`pool.js drawDisabledBonds`: 맹약이 전부 비활성인 오퍼레이터는 풀에서 빠짐)은 공개 오퍼레이터만 보므로, 선발 픽에는
  `server/local-patch.js diyBanned`가 같은 규칙을 적용한다. 예: 염국이 밴된 판에서는 望·赤刃明霄陈 픽이 상점에 나오지 않는다(2026-10-05).
- 나오는 곳: 고른 사람을 위한 굴림에서만 전용 풀이 열린다(사용자 결정 2026-10-05, 밴되지 않는 한): 상점(`_rollChessSlot`), 정예화 보상·풀에서 뽑는
  보상 제안(`pushRewardOffer`), 그 사람에게 실행되는 모든 효과(`Match.dispatch`·`dispatchItem`·`_applyCard` 감싸기 → 특질(余 SERVER_MOST_BOND 등)·전략·
  아이템·기변 카드의 `ctx.rollChess`/`rollPool`). 다른 사람의 굴림에는 나오지 않는다. 공식 문구는 「只出现在自己的商店里」뿐이다.
- 信标(비콘): 공식 「无法装备给自编干员」(KR 「선발 오퍼레이터는 장착 불가」). `shared/diy.js diyEquipRefused`를 서버(`PlayerState.equip` 감싸기)와
  클라이언트(`gameLogic.js equipCheck` 1줄)가 함께 쓴다.
- 모듈: 공식 甄选 칸에는 기본 모듈이 없어(게임에서 직접 장착) 처음엔 미장착이었다. 2026-10-05부터 후보의 첫 모듈(`uniequip_002`, X 타입)을
  기본으로 장착한다(`build-diy.mjs diyDefaultModule` → 상점 `defaultUniEquipId`). 오퍼레이터 구성 화면에서 「없음」을 고를 수 있다.
- 소재: `tools/assets/diy.mjs`가 07-assets 형식 항목을 만들어 fetch-assets가 초상·Spine·스킬 아이콘·효과음·음성을 같이 받는다.
- 한국어: `tools/i18n/build-ko-diy.mjs` → `public/i18n/ko/diy.json`. 위셔델·아스카론은 KR 공식 테이블, 왕·첸 더 던스트릭·사키코는 `tools/i18n/diy-ko-manual.json` 수동 번역(이름·스킬·재능·모듈 이름은 나무위키 표기).

### 커밋 전 전체 리뷰에서 고친 것 (2026-10-06)
`/code-review`(diff 전체 + 새 파일 6개)에서 나온 9개를 공식 자료와 대조해 고쳤다. 각 항목은 회귀 테스트가 고치기 전 코드에서 실패하는 것을 확인했다.
- 望: S3 자동 배치(`drop`)가 재배치를 기다리는 돌을 세지 않아, 그 돌이 돌아올 때 배치 한도(tokens.js)가 정비 돌을 영구 퇴장시켰다(시드 4개 모두 2~3개).
  → 기다리는 돌도 자리를 차지(`autoDeploy`와 같음), `redeployUsed`는 한도가 차 있으면 기다린다.
- 望 S3 시작 넘침 跟子: PRTS 技能3 备注 「触发第一天赋时，按照有敌人的>没有敌人的；不可部署地块>可部署地面地块>可部署高台地块的优先级生成」대로
  적 칸 → 지형 등급 순(같으면 적 칸은 방어 지점 가까운 순, 빈 칸은 무작위). 이전엔 빈 칸이 등급 없이 무작위였다.
- 望 돌 피해: `battle.enemies`를 직접 돌던 S3 십자·S2 직선을 `Battle.enemiesInKeys`(canTargetEnemy) 칸 선택으로(체크리스트). 거대 적은 몸이 걸친 칸 기준.
- 丰川祥子: 지속 공격(적 없음)의 음표와 음표 개수가 스킬 적용 전 프로필(`unit.profile`)을 읽어 S3(「各自演奏2个…{attack@atk_scale}…音符」)가
  1.0배·1타·음표 1개였다 → `battle.effectiveProfile`.
- 丰川祥子 S2 음색·维什戴尔 S2 과부하: 프로필 교체가 0.2초 간격이라 경계에서 최대 0.2초 어긋났다 → 매 스텝(공격 전 단계), 祥子는 전환 즉시도.
  维什戴尔 4연발 판정은 적용된 프로필을 따른다.
- 화면: 祥子 음표 이펙트가 못 불러와지면 화살·맞는 이펙트로 돌아간다(이전엔 공격이 안 보임), 이벤트 배열은 바꾸지 않는다.
  陈 S3 `chen3Qi`에 `FX_KINDS` 항목(공식 이펙트를 못 쓸 때만 2D 파동), 공식 이펙트로 그릴 때는 2D 대체 생략.
  `test/render/boardart.test.js` 「sim fx coverage」 정규식이 숫자 든 이름(`chen3Qi`)을 놓쳐 고침(원본 테스트 파일 수정, 원본 PR 후보).
- 확인: 로컬 테스트 81개 통과, 전체는 예상 실패만. 실제 대전 경로(정비 배치 → `buildBattleSpec` → `createBattleFromSpec`)로 祥子 S3·陈 S3 전투를
  기록해 렌더 데모(headless Chromium, 로컬 서버)에서 재생: 콘솔 오류 0, 음표·검기 공식 이펙트 표시.

### 새 선발 오퍼레이터 키트 체크리스트 (2026-10-06)
선발 키트는 전부 로컬 코드라 원본 테스트가 잡아 주지 않는다. 처음 5명에서 실제로 난 버그를 정리했다. 키트를 추가하거나 고칠 때 하나씩 확인한다.

**대상 선택**
- 범위 피해·범위 효과는 선택 가능한 적만 고른다: `battle.foesInRadius`, `battle.enemiesInKeys`, `canTargetEnemy`(targeting.js).
  PRTS 「AOE的判定是对攻击范围内的每个可以被选中的敌人进行判定」 — 미노출 은신(隐匿)·선택 불가는 빠진다.
  - 쓰면 안 되는 것: `battle.enemiesInRadius`(숨은 적만 뺌), `battle.unitsInGrid`(필터 없음), `battle.enemies`를 직접 돌며 피해 주기.
    `battle.enemies` 순회는 거리·칸 계산 같은 판단에만 쓴다.
  - 실제 사례: 첸 S3 검기·S2 첫 대상, 왕 바둑돌 발동·폭발이 은신 적을 때렸다.
- 이미 걸린 디버프의 틱 피해는 `ignoreSelect`(선택 규칙을 다시 보지 않음).
- 스킬 범위 발동 규칙(`SKILL_RANGE`)은 선택 가능 여부를 무시하고 켜진다(공식). 범위에 은신 적만 있을 때 스킬이 헛돌지 않게 한다
  (첸 S2: 선택 가능한 적이 올 때까지 대기).

**피해 설정** (`battle.dealDamage` 옵션 — 공식 계산은 `damage.js`가 한다. 방어·저항·배율을 키트에서 직접 계산하지 않는다)
- `type`(phys/arts/true), `isSkill`, `isAttack`, `isSplash`, `tags`를 비슷한 원본 키트(tier*.js, professions.js)와 맞춘다.
- 함정·폭발은 `canDodge: false`(원본 tier3.js 함정, tokens.js 폭발과 같음).
- 미리 계산해 거는 지속 피해는 `sourceless: true`(PRTS 「以无来源的形式施加」 같은 문구가 있을 때).
- 고정 저항 무시는 피해 정보의 `resIgnoreFlat`, 피해 증가는 배율로. 피해 출처(공격자)가 누구인지 PRTS 비고로 확인한다(예: 바둑돌 폭발은 돌,
  跟子는 망).

**엔진 함정** (원본 엔진은 고치지 않고 키트에서 피한다)
- 키트 `install`은 배치 전에 돈다. 아직 살아 있지 않은 유닛에 건 버프는 `Battle.addBuff`가 버린다 → 영구 버프는 `persist: true, allowDead: true`.
- `unit.rangeKeys`는 배열이다. 포함 검사는 `unit.rangeKeySet`(없으면 `new Set(rangeKeys)`). `.has?.()`는 조용히 항상 실패한다(아스카론 S2).
- `SkillRuntime.end()`는 `onEnd` 전에 `ammoLeft`를 0으로 만든다 → 남은 탄약을 쓰려면 키트가 따로 기억한다(왕 S3).
- `beforeAttack`에서 `ctx.profile`을 새 객체로 바꿔도 `ai.js performAttack`은 다시 읽지 않는다 → 유닛 자신의 `unit.profile` 복사본을 바꾼다(사키코 S2).
- 엔진 투사체의 도착 시점·경로를 바꾸려면 엔진을 고치지 않고 `attack` 훅에서 방금 쏜 투사체(`battle.projectiles.list`, `source`·`age 0`)를
  빼서 키트가 날리고 도착 때 그 `onHit`을 부른다(사키코 음표).
- `fromTokens`로 만든 토큰은 소유자별 배치 한도(tokens.js)에 걸려 먼저 놓은 토큰을 퇴각시킨다. 한도에 들면 안 되는 것(투사체 성격)은 `fromTokens` 없이.
- 새 `battle.fx` 종류를 추가하면 `public/js/render/fx.js FX_KINDS`에 한 줄을 넣는다(원본 테스트 "sim fx coverage").
- 스킬 자동 발동 규칙은 `tools/build-data.mjs resolveTrigger`가 정한다: 공식 표에 없으면 MANUAL + 자기 스킬 범위 → `SKILL_RANGE`,
  「攻击范围扩大」 같은 공격 범위 변경 → `DEFAULT`. 다르게 하려면 `TRIGGER_DEVIATIONS`(의도적 예외, 사용자 결정으로만).

**동작 근거**
- 출처 순서: 공식 테이블(skill_table blackboard, character_table 재능, battle_equip_table 모듈) → PRTS 비고 → 나무위키 평가.
  PRTS·나무위키는 WebFetch 요약이 틀릴 수 있다(사키코 공격 속도 「자신 제외」 오독). 원문 문장을 인용한다.
- 수치는 단계별 레코드(`data/diy.json`)의 레벨 값을 그대로 쓴다. 만렙 값(나무위키)을 박지 않는다.
- 자료에 없는 종료·정지 조건을 만들지 않는다(왕 S3 「놓을 칸 없으면 종료」 → 일찍 끝나는 버그). 추정은 코드와 이 문서에 [추정]으로 남긴다.
- 위수협약에 없는 원작 조작(수동 배치, 수동 스킬 종료)을 옮길 때는 대체 규칙을 [추정]으로 적는다.

**소환물·표시**
- 토큰 모델은 `data/assets.json`에 자동으로 안 들어온다 → `token_spines.py` 목록(`TOKEN_SPINES`)에 추가해 클라이언트에서 뽑는다.
- 함정·방향 없는 소환물은 `shared/trap-tokens.js`(`noHpBar`, `facingless`)에 등록한다.
- 공식 이펙트: 오퍼레이터 번들은 `fx_extract.py --bundle <key>`, 소환물 이펙트는 공용 팩에서 `--pack pkgrps/btl_pfb_fx_token_N.ab --match`.
  게임 이벤트 연결은 `fxgame.js`(왕 `stoneFx` 참고).

**테스트** (`test/local-patch.test.js`)
- 범위 피해가 있는 스킬마다 은신 적(예: 隐形弩手)을 맞히지 않는 테스트.
- 함정 소환물은 공격 대상이 안 되는지, 정비 때 놓은 자리가 전투 시작 후에도 같은지.
- 탄약·지속 스킬은 종료 조건과 종료 후 반환값.

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
  「目标生命值减少」 #f24549 + `blood_icon` + 잃을 LP #ff3b3b — `Match.settle`처럼 `counted !== false`인 누수 수, 联防이 다시 배분하기 전 값),
  셈하지 않는 누수만 있으면 → panel_miss 제목만([추정], 캡처 없음). 공통: 모서리 `left_cross`, `left_frame` 괄호, `doc_text_01/02`(#18e6b8),
  오른쪽 SIGNAL `doc_01` · 점 2×3 `dot_blank`(#28c79f, 알파 .6/1/.2/.6/.4/1) · 오른쪽 위 점(#279481). 보스전(최종 공세·隐秘核心)은 공식에 다른 프리팹
  (`panel_win_*`, `panel_lose_*`)이 있어 이 배너를 띄우지 않는다. **이 그림들은 웹 소재에 없어 로컬 추출(ui/battle)이 있을 때만 배너가 뜬다**(없으면 원본처럼 배너 없음).
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

## 공식 전투 이펙트 (2026-10-05)
- `tools/local-extract/fx_extract.py`: EN 클라이언트 `battle/prefabs/effects/<이름>.ab`의 프리팹을 JSON(노드 트리, 파티클 모듈,
  재질, Mecanim 클립 곡선) + PNG 텍스처 + 메시 JSON으로 뽑는다. 텍스처는 다른 번들에 있어 CAB 색인(`--build-cab-index`, 약 15분)이 필요.
  지금 뽑은 것: chen3·wang·wisdel·oblvns·ascln 기본 스킨만 139개, 약 7.5MB(텍스처는 정지 WebP q85·알파 무손실, `--png`로 PNG; 스킨 변형은 `--all-skins`로만).
  望의 棋子 이펙트(`token_wang_*` 10개)는 공용 토큰 팩에 있어 `--pack`으로 따로 뽑는다:
  `fx_extract.py … --bundle wang_token --pack pkgrps/btl_pfb_fx_token_3.ab --match '^token_wang_'`.
  `fxgame.js stoneFx`가 kits/diy.js의 `zone`(棋子 token, 스킬 1/2/3별 폭발; 2는 연결 축마다 `rotation_z` 0°/90°)·`wangLink`(처음
  활성화될 때 금색 선)·`summon`(배치)에 붙인다. 어떤 프리팹이 어떤 장면인지는 이름으로 정했다 [추정].
  토큰 Spine 텍스처에 `[alpha]` 텍스처가 없으면(`_AlphaTex` 비어 있음: 棋子, 魂灵之影) 본 텍스처의 알파를 쓴다(`extract.py merge_alpha`).
  WebP를 못 읽는 브라우저(iOS Safari 14 미만)는 공식 이펙트를 건너뛰고 기존 절차 이펙트를 쓴다(`fxgame.js webpOk`).
  풀 오퍼레이터 20명은 지정 스킬만(`--match`): 치우바이·라플란드 더 데카덴차(드론 `_token` 포함)·데겐블레허·르무엔·페페·
  프라마닉스 더 프레리타·비르투오사·비나 빅토리아·리드 더 플레임 섀도우·니어 더 래디언트 나이트·패신저·위·안젤리나·무에나·티티·
  블레이즈 디 이그나이팅 스파크·아르케토 S3, 로즈몬티스·엑시아 더 뉴 커버넌트 S2, 시 S1. 합계 291개(25명), 약 17MB.
  이름 규칙: `_skill_03_` / `_skill_3_`(엑시아) / `skill3_`(위) 모두 `fxmap.js`가 인식, 방향별 사본(`_up/_down/_left/_back`)은 쓰지 않음.
  일반 공격 이펙트: 위 20명(프라마닉스 더 프레리타는 공격 이펙트가 번들에 없음) + 선발 5명. 합계 361개, 약 19MB.
  공격 이름 규칙: `_attack_start_01` / `_attack_01_start` / `yu_attack_01`(시작), `_attack_hit_01` / `_attack_01_hit` / `yu_hit_01`(타격);
  대체 버전(`_a/_b/_c`, `_A/_B`)은 첫 번째만, 모드 변형(`_combat_`)은 기본 공격이 없을 때만, 오퍼레이터 키 안의 글자는 판정에서 뺀다.
  텍스처 29개는 이름에 `#`가 있어 `FxLibrary`가 URL 조각을 `encodeURIComponent`로 인코딩한다(서버 `serveStatic`이 되돌린다).
  클라이언트에만 있는 파일이라 공개 미러가 없다 → NAS/OCI `assets/local/fx`로 복사해 서버가 직접 보낸다.
- `render/fxplayer.js`: Unity 파티클 부분집합 + TrailRenderer/파티클 트레일 + 클립(위치·회전·재질 값) 재생, Torappu 셰이더를 흉내 낸 셰이더 1개.
  셰이더 속성·블렌드는 클라이언트 선언에서 확인, custom data·램프·디졸브 해석은 [추정](화면 보고 맞춤).
  성능(2026-10-05, `STRONGHOLD.md` 10장 "WebAssembly 포팅 검토"): 입자 수는 카운터로, 프레임마다 만들던 배열·객체
  제거, 곡선·그라디언트는 로드할 때 Float64Array로 평탄화(계산식과 순서는 그대로), 인스턴스 속성 8개는 interleaved 버퍼 하나(시스템당
  업로드 1번), 꼬리 버퍼는 쓴 구간만 업로드, MAX_INSTANCES로 끝난 인스턴스는 `done`. 렌더 결과는 바꾸지 않는다:
  `bench/fx/compare.mjs`(git 판과 픽셀 비교, 361개 × 4프레임 동일). 빈 꼬리 메시를 숨기면 다른 그리기의 픽셀이 조금
  달라져(GL 상태) 숨기지 않는다.
- `render/fxgame.js`: 전투 화면의 투명 캔버스 2장. 스킬 유지(buff) 이펙트는 유닛 캔버스 아래(오퍼레이터가 위에 보이게, 2D 보드는
  배경이 불투명해서 위로), 나머지는 유닛 위. 스킬 시작/유지(buff)/스킬 중 타격, 일반 공격 시작/타격을 프리팹 이름으로 매핑
  (`fxmap.js`, [추정]). 해당 오퍼레이터가 행동하기 전에는 아무것도 받지 않는다. 품질 '낮음'이면 끈다.
  화면의 부하 단계(`app.js adaptLoad`)가 2 이상이면 '높음'을 '중간'으로, 3이면 일반 공격 이펙트를 생략한다(원본 `fx.js`가 2 이상에서
  장식을 끄는 것과 같은 규칙). 동시 인스턴스 상한은 `fxplayer.js MAX_INSTANCES`(24). `view.stats().fxGame` = 살아 있는 수, update·render ms,
  드로우콜, 입자 수.
  사키코 음표(2026-10-06): 키트가 음표 상태가 바뀔 때마다 `battle.fx('oblvnsNote', { n: 음표 id, e: born|track|free|hit|gone, m: 모드, a: 방향°,
  t: 대상, w, i: S1 번호 })`를 낸다. `fxgame.js`가 클라이언트 프리팹(`fxmap.js NOTE_FX` = 투사체의 `_mainEffect`/`_effectsWhenHit`: 기본
  `oblvns_attack_01_trail`, 지속 공격 `oblvns_talent_trail`, S1 `oblvns_skill_01_trail(_02…_08)`, S2 피아노 `_skill_02_trail_02`·오르간
  `_skill_02_trail`, S3 피아노 `_skill_03_trail_02`·오르간 `_skill_03_trail`; 맞으면 각 `_hit`)을 이벤트 사이에서 시뮬레이션과 같은 속도
  (`NOTE_FLIGHT`, 시뮬레이션 `NOTE`의 사본 — 테스트가 비교)로 날린다: 자유 비행은 방향대로 + 사인 흔들림(그림만, [추정] 모양: 초당 1.5번,
  0.6초에 걸쳐 진폭 `sine`까지), 추적은 대상 뷰를 향해 회전, 맞으면 맞은 프리팹(피아노는 0.5초 더 지나감). 이벤트마다 위치를 시뮬레이션 값으로
  맞춘다. 음표 이펙트는 전투 시계로 돈다(`createFxLayer`의 `rate` = `interp.rate`, 꼬리 길이 = 속도 × 시간). 음표가 그려질 때는 그 공격의
  `atk` 이벤트 투사체 종류를 `'oblvnsNote'`로 바꿔 `fx.js`의 화살을 그리지 않는다(`fxgame`이 `handleEvent`보다 먼저 받음). 공식 이펙트가
  없으면(품질 낮음, WebP 없음, 번들 없음, 부하 3단계의 스킬 밖 음표) 화살 그대로. `fx.js FX_KINDS`에 `oblvnsNote`(그리지 않음) 1줄.
  `view.stats().fxGame.notes` = 날고 있는 음표 수. 같은 생성 이벤트를 쓰는 일반 공격 `oblvns_attack_01_hit`의 `dmg` 매핑은 사키코에게는 끈다.
  첸 S3 剑气 꼬리(`chen3_skill_03_trail_01`)는 `fx` 이벤트 방향으로 프리팹의 `rotation_z` 노드를 돌린다(`aimMover`, 좌우 반전 대신.
  용 머리는 0°에서 +x, 프리팹 기본 90° = UP). 벽에서 꺾일 때도 다시 맞춘다.
- 디버그: `/debug.html` — 샌드백 아레나 (2026-10-07, 사용자 요청 「스킬 효과음·타격음·스킬 이펙트 디버깅」). 게임의 전투 화면
  (`render/app.js createFieldView`: 3D 보드·Spine 모델·`fx.js`·공식 이펙트 `fxgame.js`)과 오디오(`audio.js handleBattleEvents` + `voice.js`
  규칙)를 그대로 쓰고, 전투는 페이지 안에서 공유 시뮬레이션(`/sim/`, `battle/runner.js loadBrowserSim`의 사본 — runner.js를 import하면
  소켓에 묶인 러너가 생겨서)으로 돌린다 → 매치와 같은 이벤트 경로.
  - 지형: 7×7 타일 섬(행 7–13 × 열 2–8, 나머지 `#`)인 합성 스테이지 `debug_sandbag_<지형>` (평지 / 고지대 섞기 = 8·12행 `h`). 공식
    씬이 없는 id라 3D 보드는 클라이언트 아틀라스 타일로 절차 생성. 카메라는 섬에 맞춤(`setCamera('normal', { rect, fit })`).
  - 오퍼레이터: 일반/정예, 스킬, 모듈(정예), 방향. 빈 타일 클릭 = 이동, 오퍼레이터 클릭 = 방향 회전.
  - 샌드백(`sandbag.js sandbagRecord`): 고른 적 모델(기본 重装防御者), 체력 1e9, 이동 0, 능력·스킬·특성 없음, 공격 0(=dmgType NONE,
    공격 안 함) 또는 지정값, 방어/저항 지정(기본 0), 정적 강체(밀리지 않음, 끌 수 있음). 절반 아래면 만피(`keepSandbags`), 즉사해도
    그 자리에 재생성(`reviveSandbags`). 기본 위치는 사거리 기준 앞 칸, 사거리가 자기 칸뿐(重装 护卫 등)이면 오퍼레이터 칸 0.35 앞에
    저지된 상태로(`defaultBags`). 샌드백 모드에서 클릭으로 추가(최대 8)/제거.
  - 스킬 조작: SP 채우기(발동은 원래 규칙대로) / 지금 발동(조건·조작 쿨다운 무시) / SP 자동 회복 끄기(`spGain` 훅) / 아군 부상
    (메딕 확인용: 1.5초마다 최대 체력 20% 고정 피해, 35% 이하로는 안 깎음).
  - 로그: 전투 이벤트마다 매핑되는 공식 이펙트 이름(`fxmap.js effectsFor`), 실제로 시작된 효과음(`audio._play` 감싸기: 공격음/타격음/
    스킬음/키트 타격음…, 동시 재생 제한으로 생략된 것은 빨강)과 대사(`audio.voice` 감싸기: 음성 게이트로 생략, 파일 없음 구분), 빠진
    데이터 경고(공격·타격·스킬 효과음 없음, 스킬 모드 파일이라 일반 공격엔 안 남, 키트 타격음 매핑 없음, 이펙트 번들 없음).
    오디오는 첫 클릭 전엔 이벤트를 버리므로 잠금이 풀리면 필드 유닛을 다시 넘긴다(`audio.setFieldUnits`).
  - 효과음·대사 파일 미리듣기와 추출된 이펙트 목록은 그대로(이펙트는 `view.debugFx` → `fxgame.debugPlay`로 오퍼레이터에, hit는
    샌드백에). 일시정지·0.1초 진행·속도(0.25–2×)·품질·음성 언어·볼륨·사거리 표시. 공식 이펙트는 게임처럼 실시간으로 돈다(속도와 무관).
  - URL: `?op=<charId>&elite=1&skill=<n>&module=<id>&dir=<DIR>&enemy=<key>&terrain=<flat|high>&fx=<bundle>/<prefab>`.
- 荒芜拉普兰德(라플란드 더 데카덴차) S3 늑대 (2026-10-06, 사용자 제보 「S3 늑대 이펙트가 안 나온다」): 원본 sim의 드론은 위치만 있는 가상 유닛이라
  클라이언트에는 시작·공격 때의 `drones`/`drone` 퍼프만 갔다. `kits/tier6.js` whitw2 S3 onTick에 한 줄(local patch)로 0.15초마다
  `fx 'whitw2Drones' {id, d: [x, y, …]}`(드론 위치)를 보내고, `fxgame.js wolfFx`가 드론마다 공식 늑대를 띄워 위치를 따라가게 한다.
  근거: EN `[uc]projectiles.ab` `projectile_chr_whitw2_funnel_s3_1…4`의 `_mainEffect` = `whitw2_skill_03_token_trail_01`(늑대, 7초 →
  스킬 동안 반복). 드론 공격은 `whitw2_skill_03_token_hit_01`([추정] 이름 기준 — funnel 프리팹에 hit 목록 없음). 스킬 종료·퇴장에 끝.
  `render/fx.js FX_KINDS.whitw2Drones`는 `none`(이펙트 추출이 없으면 예전처럼 퍼프만). 테스트: local-patch 「荒芜拉普兰德 S3 wolves」.

- 스킬 타격 효과음 (2026-10-06, `tools/assets/kit-sfx.mjs` → manifest `audio.sfx.kit`, `public/js/audio.js kitHitKey`): 키트가 직접 주는
  스킬 피해(바둑돌, 剑气, 음표, 혼령의 그림자, 드론)는 공격 이벤트가 없어 유닛 `hit` 소리가 나지 않았다. 공식 audio_data 뱅크(전부 파일 있음)를
  키트의 fx 이벤트에 연결하고 키마다 동시 재생 제한: 望 `wang_stone1_t[damage_audio]`·`sktok_wang_2.extra.0`·`sktok_wang_3`·`wang_stone1_line_up`,
  赤刃明霄陈 S2 `ON_ABILITY_HIT.skchr_chen3_2`·S3 `projectile_chr_chen3_s3`(새 fx `kitHit`, 剑气가 적을 친 틱마다), 维什戴尔 S2 포격
  `projectile_chr_wisdel_s2`·残影 폭발 `…_s1_shock`(fx `explode`에 `by`)·혼령의 그림자 `…_token`, 丰川祥子 음표 종류별(`projectile_chr_oblvns`·
  `_talent`·`_s2`·`_s2_slow`·`_s3_phy`·`_s3_mag`, S1 `projectile_chr_oblvns_s1_hit`), 荒芜拉普兰德 S3 늑대 `…_funnel_s3`. 그리고 维什戴尔의
  일반 타격음이 없던 것(`projectile_chr_wisdel_default` — 이름 끝 `_default`를 plan.mjs가 몰랐음). 스킬 중 일반 공격의 스킬 모드
  공격·타격음은 아래 「스킬 모드 효과음·믹서 볼륨」(2026-10-07)에서 구현. 남은 것: 荒芜拉普兰德 S1/S2 드론처럼 키트가 직접 주는 피해 중 매핑 안 된 것.

- 스킬 모드 효과음·믹서 볼륨 (2026-10-07, 공식 비교 조사 `research/2026-10-07-official-compare/compare-audio.md` 1·2번):
  - 공식: 오퍼레이터 공격 소리는 공격 모드 단위 뱅크 `battle.ON_ABILITY_START|ON|HIT.<charId>.attack.<n>`이고 n = 캐릭터 프리팹(charpack) `_modes`
    목록 순번(Default 0, 이후 스킬 모드: 维什戴尔 [Default, S2, S2_Overload, S3] → S3 공격 = `attack.3`). 스킬 k의 모드는 이름이 `S<k>`(또는 `S<a>-<b>`,
    `Sk<k>`, `S<k>_…`)인 것. 원거리 모드의 타격음은 그 모드 투사체의 `ON_PROJECTILE_HIT.<key>`. 모드를 바꾸지 않는 스킬은 자기 공격 능력
    `ON_ABILITY_*.<skillId>`(공격·타격 믹서 그룹일 때만 — UI_Boost·Skill_Important는 시작음 그대로). 뱅크마다 믹서 그룹(`customMixerGroup`)이 있다.
  - `tools/local-extract/char_modes.py` → `tools/assets/local-char-modes.json`(커밋, 126명: 모드 이름 순서 + 모드별 투사체 키; 클라이언트 업데이트 때
    다시 실행, 약 6초). `tools/assets/skill-mode-sfx.mjs`가 매니페스트에 `sfx.units[id].modes[스킬번호] = { attack, hit, mix, grp, deferStart }`,
    `grp`(역할별 믹서 그룹), `skillMix`(시작음 뱅크 볼륨), `sfx.kitGrp`를 더한다(원본 `mix`는 그대로). 오퍼레이터 103명, 315개 스킬 중 207개에 전용 소리.
    원본 연결: `tools/assets/audio.mjs indexAudio` `groupOf` 3줄, `plan.mjs` 몇 줄, `skill-sfx.mjs skillStartIsFallback`, `kit-sfx.mjs kitHitGroups`.
  - 클라이언트 `public/js/audioOfficial.js` + `audio.js` 연결: `skill` 이벤트로 유닛의 스킬 진행을 기억하고, 그동안의 `atk`와 그 `dmg` 타격음은
    `modes[skillIndex]` 소리(스킬 모드 파일이라 `normalAttackSfx` 거름 없음). `deferStart`(시작음이 ON_SKILL_START가 아닌 대체음이고 스킬에 공격 소리가
    있음: 阿斯卡纶 S1 등)면 시작음은 공격 없이 끝난 스킬에서만 낸다(공식은 그 소리를 공격에서 낸다).
  - 볼륨: 클라이언트 `MainMixer`(EN `sharedassets1.assets`) Default 스냅샷의 그룹 게인(부모 합산) × 뱅크 볼륨(1 초과도 그대로, 노드 상한 1.5):
    오퍼레이터 공격 0.348·타격 0.336, 스킬 공격 0.428·타격 0.348, 적 공격 0.163·타격 0.205, 보스 0.343·0.327, 스킬 시작 0.67, 배치·사망·이탈 0.614,
    대사 채널 0.978, sfx 채널의 ×0.9 제거(그룹이 SFX 버스를 포함). 그룹 없는 뱅크(치유)는 SFX_Battle 0.696 [추정]. 이전(오퍼레이터·적 모두 0.55,
    1 초과 잘림)보다 적 소리가 약 9 dB 작다. UI 효과음·BGM은 그대로.
  - 확인: `test/local-patch-audio.test.js` 8개, 전 오퍼레이터×스킬 시뮬+AudioManager 일괄(강제 시전 시 207개 중 185개에서 전용 소리 — 나머지 22개는
    피해를 키트가 직접 주는 스킬: 드론·음표·늑대·치유), 디버그 아레나(阿斯卡纶 S1/S3, 维什戴尔 S3, 赤刃明霄陈 S3 — 검기 타격 `p_imp_hljdswdlng_s`).
  - 배포: 새 효과음 220개(2.4MB)는 서버의 `fetch-assets`가 받는다(`oci/deploy.sh --assets`).

- 스킬 중 공격 이펙트·이펙트 배속 (2026-10-07, 공식 비교 조사 `compare-fx.md` 1·9번):
  - 공식: 스킬 모드의 공격 능력에 `_castEffects`가 붙어 `*_skill_0N_start`는 스킬 중 **매 공격**(CAST_START)에 나오고, 발동 순간은 Begin
    애니 + 버프 루프뿐이다. 스킬 모드가 일반 공격 이펙트를 그대로 쓰는 경우도 많다. 이펙트는 전부 scaled time(배속을 따름).
  - `tools/local-extract/char_modes.py`가 모드별 `cast`(시전자, Attack_A/B/C 같은 대안 능력은 첫 것만, `_down_` 등 방향 사본 제외)·`hit`(모드의
    `_hitEffects`/`_inputTargetEffects`/`_castTargetEffects` + 모드 주 투사체의 `_effectsWhenHit`/`_effectsWhenReached`)·`trail`(주 투사체
    `_mainEffect`, 다음 단계용)을 `local-char-modes.json`과 `public/assets/local/fx/modes.json`(git 밖, 이펙트 추출본과 함께 동기화)에 쓴다.
    `proj`는 모드 자신의 탄(`projectile_chr_<이름>[_default|_s<n>|_<X>]`)이 먼저 — 드론·재능 탄 앞(효과음 쪽도 이 순서를 씀: 라플란드 S1 본탄 타격음).
    스킬→모드 규칙은 `shared/skill-modes.js`(효과음 도구와 공유).
  - `render/fxgame.js`: `modes.json`에 있는 오퍼레이터는 공격마다 그 공격의 모드(스킬 중이면 스킬 모드, 아니면 Default) 바인딩 `cast`를
    공격자에(ATTACK_GAP 0.2초), 타격 때 `hit`(최대 2개)를 대상에 튼다. 바인딩된 시전 이펙트가 있는 스킬은 발동 때 start 일회성을 틀지 않는다
    (버프 루프는 그대로 이름 매핑). 바인딩이 없거나(모드 없는 스킬 = 능력형) 추출본에 없으면 예전 이름 매핑(`fxmap.js effectsFor`). 판단은
    `fxmap.js attackMode`/`boundEffects`. 타격 이펙트는 공격 1회당 1번(첫 피해 — 표식·지속 피해 틱마다 뜨던 것 제거, `audio.js`와 같은 규칙).
  - 배속: 이펙트 시계(`clockS`: 간격·종료)와 모든 이펙트 갱신이 전투 시계(`rate` = 보간 버퍼의 게임 속도)를 따른다(예전엔 음표만). 확인:
    같은 프리팹이 0.25×에서 1×보다 약 4배 길게 재생.
  - 추출 범위: 바인딩된 이펙트 241개 중 69개가 추출본에 없었다(예전 추출이 스킬 일부만) → 16개 번들(nearl2 siege2 whitw2 blaze2 angel2
    sbell2 dusk yu cello aglina rosmon titi pepe mlynar lemuen pasngr)을 기본 스킨 전체로 다시 추출(`fx_extract.py --bundle …`, 19→25MB). 남은
    3개는 aglina가 다른 번들(`glassb_*`, `common_magic_trail_01`)을 씀.
  - `stats().recent`(최근 시작한 프리팹 24개)를 `/debug.html` 로그가 「✦ 이펙트 재생」으로 보여 준다.
  - 확인: `test/local-patch-fxmodes.test.js` 4개, 디버그 아레나(阿斯卡纶·维什戴尔·赤刃明霄陈 S3: 매 공격 S3 시전·타격), 25명×스킬 브라우저 일괄
    (바인딩 시전 이펙트가 있는 48개 중 45개 재생 — 나머지 3개는 키트가 공격을 대신함: 荒芜拉普兰德 S3 늑대, 丰川祥子 S2 음표, 耀骑士临光 S2), 페이지 오류 0.
  - 배포: `public/assets/local/fx/`(modes.json과 새 프리팹)를 서버로 rsync한 뒤 배포(git 밖 추출본).

## 공식 스테이지 3D 씬 (2026-10-06)
- 3D 보드는 원래 시즌 1 아틀라스(`map_autochess`)로 모든 스테이지를 그렸다. 지금 클라이언트는 스테이지마다 완성된 씬(`scenes/activities/act*autochess/level_*`)과 라이트맵을 갖고 있고, 테마는 사막(`map_autochesssand`), 카시미어(`map_kxmr`), 시라쿠사 지하철(`map_syracuse_metro`)이다. 자세한 내용은 DESIGN §15.1.
- 추출: `.venv-extract/bin/python tools/local-extract/scene_extract.py` (기본 클라이언트 경로 `/mnt/d/YostarGames/Arknights_EN/Arknights_Data`, `--stage`로 일부만) → `public/assets/local/scene/**`, `data/local-assets.json`의 `scene/*` 그룹. CAB 색인은 `logs/scene-cab-index.json`에 캐시(`--rebuild-index`).
- WebP (2026-10-06, upstream #186과 같은 방식): 텍스처·라이트맵마다 PNG 옆에 WebP를 쓰고 manifest가 WebP를 가리킨다. 컬러 맵(머티리얼의 `_MainTex`)만 손실 q95, 노멀·러프니스·발광·RGBM 라이트맵·섀도마스크는 무손실(43MB → 26MB). 클라이언트 없이 기존 PNG에서 만들려면 `scene_extract.py --webp`, 끄려면 `--no-webp`.
- 지오메트리 압축 (2026-10-06, `geom.bin` 버전 2): 위치는 씬 하나에 공통 격자 u16(`quant.pos`, 축 하나의 span이라 메시 행렬이 균일 배율 → 법선 그대로, 그룹 사이 같은 정점은 같은 점 → 틈 없음), 법선 i8×4, uv0·uv1은 그룹별 범위 u16(`q.uv0`·`q.uv1`, 그룹 재질의 `uMainST`·`uUv1ST`에 합침), 색이 하나인 그룹은 `colConst`, 정점 65,536개 이하면 인덱스 u16. pos·uv1·idx는 델타+지그재그+바이트 셔플(`quant.dzs`, `official.js unDzs`)이라 크기는 같고 gzip이 잘 줄인다. 11개 스테이지 37.2 → 18.2MB, gzip 10.8 → 3.8MB(act2 m01 8.1 → 4.1MB, gzip 2.1 → 0.71MB). 디코드 오차 위치 ≤ 0.0006칸·법선 0.4°·uv 5e-5, 시간 고정 headless 비교에서 평균 픽셀 차이 0.16~0.49(가장자리 1px·비스듬한 줄무늬 샘플링만). 읽는 쪽은 버전 1(f32·u32)도 그대로 읽는다. 기존 추출물 변환은 클라이언트 없이 `python3 tools/local-extract/scene_extract.py --requantize`(버전 1만 다시 쓰고 manifest `geom` bytes 갱신). act2 m01이 큰 것은 지하철 씬이 정점 157k로 원래 촘촘해서다(LOD 없음, 중복 정점 0.5% 미만).
- 그리기: `public/js/render/board3d/official.js`. 공식 씬이 있으면 절차 타일·배경·물 대신 그리고, 게이트·필드 테두리·기기·지형 효과는 그대로 쓴다. 필드별 숨김 세트(HIDDEN@1/2/3)는 현재 영역에 맞춰 켠다. `?officialBoard=0`이면 예전 보드.
- 색 (2026-10-06, 사용자: 사막 모래가 어둡고 주황·물이 너무 청록): 클라이언트는 **Gamma 색공간** 프로젝트다(globalgamemanagers PlayerSettings `m_ActiveColorSpace` 0). 그래서 셰이더도 텍스처·재질 색·빛 색을 저장된 값 그대로 쓰고(sRGB→선형 변환 없음) 결과를 변환 없이 쓴다. 라이트맵은 LightmapRGBM(`m_LightmapFormat` 2)이라 감마식 5·a·rgb로 푼다(선형식 34.49·a^2.2였음). 씬 셰이더(`Torappu/Scene/StandardRealtimeShadow` 등)는 Unity Standard 속성 세트라 BRDF1 감마판을 따른다: 확산 ×0.779, 유전체 정반사 0.2209, 직접광 정반사, 반사 프로브. 반사는 `scene.json reflection`이다(섬의 ReflectionProbe, 없으면 생성된 스카이박스 반사 × `m_ReflectionIntensity`, 면별 평균색). `_HG_VERTEX_COLOR_BLEND_ON`은 정점색만큼 `_BlendColor`로 **덮는다**(× 2 틴트였음): 정점에 칠한 모래라서 바닥 무늬 타일이 반쯤 모래에 덮인다. 물은 `_DeepWaterColor` × `_WaterColor` × `_WaterColorIntensity`, 알파는 깊은 색의 a(0.672). act1 m03을 같은 카메라의 한국 서버 전투 화면(사용자 18.png)과 비교한 평균 RGB: 보도 191/180/167(공식 191/179/166), 바닥 216/186/139(208/176/132), 바위 블록 192/149/103(200/153/106), 먼 바다 34/61/71(38/61/73). 수정 전에는 바위 150/108/64, 보도 143/134/123, 물 43/106/100이었다. 기존 추출물에 반사를 넣으려면 `scene_extract.py --reflections`(클라이언트 필요, 지오메트리·텍스처는 그대로, scene.json만 바뀜). 반사가 없는 예전 scene.json은 주변광 하늘색으로 대신한다.
- 높이: 공식 씬의 `highlandHeight`(사막 0.4, 카시미어 0.3)를 HIGH 타일 전부에 쓴다(`style.js tileTop`). 공식 씬이 없으면 예전 `TILE_H`.
- 기기 모델 (2026-10-06, 사용자: act1 m03의 사격대 칸이 펜스 친 지상 칸·배치 불가 칸처럼 보임): 씬에는 기기의 자리(빈 틀, 지그재그 표시)만 있고,
  클라이언트는 레벨의 함정 기기를 실행 중에 프리팹으로 올린다(`pkgrps/btl_pfb_tokens_*.ab`의 `trap_1106_achplat` 射击台·`trap_1105_accrate` 阻隔工事,
  메시·텍스처는 `arts/maps/common/trap`). 공식 씬을 그릴 때는 절차 보드 메시(사격대 판이 들어 있던)를 그리지 않아서 사격대가 빠져 있었다.
  `scene_extract.py --devices` → `scene/devices/scene.json`·`geom.bin` + `scene/tex/TX_trap_*`(전체 추출 때도 함께), `official.js`가 모든 스테이지와 함께
  읽어 `built.devices`로 만들고, `board3d/scene.js`가 활성 사격대 칸마다 사격대 모델, 정적·전투 阻隔工事에 공식 상자 모델을 놓는다. 조명은
  Torappu/Scene/Trap/Shadow 머티리얼 값(`_Ambient`·`_Diffuse` × 주광 N·L, 라이트맵 없음 — 셰이더 원문은 못 읽어 [추정]). 사격대 위 유닛은 판 높이
  0.393에 선다(`stage.platformHeight` → `style.js tileTop('platform')`). 18.png(공식)과 같은 회색 금속 판 + 2×2 격자 모양, 판 평균색 공식 128,124,112 ↔ 우리 129,130,124.
  남은 것: 土石结构(act1 m06 `trap_032_mound`)와 “双眼皮” 포탑은 절차 상자 그대로.
- 남은 것: 공식 물 셰이더는 근사(깊은 색 하나 — 공식은 해안 근처가 깊이에 따라 청록으로 얕아짐, 거품·커스틱·하늘 반사 없음), m04 밀물 연출 미구현, `_HG_VERTEX_COLOR_BLEND`의 노이즈 항(`_BlendNoiseStrength`·`_BlendMaskNoiseSkew`)은 읽지 않음.

## 전투 버그 수정 (2026-10-06 플레이 제보)
테스트: `test/local-patch-battle.test.js`(실제 대전 경로: Match 보드 → `m._normalOpts` → `buildBattleSpec` → `createBattleFromSpec`).
- **우타게(宴) S2가 S1처럼 보임**: 전투 계산은 맞다(실제 경로에서 스킬 0 = 分神, 스킬 1 = 배치 즉시 HP 50% 유실 + ATK, 표와 같음). 원인은 그림:
  모델에 번호 없는 `Skill_Start/Loop/End` 한 벌만 있어 `tools/assets/anim-roles.mjs`가 S2에도 그것을 줬고, S2가 켜진 15초 동안 S1 分神 자세(휴대폰)를
  틀었다. 근거(EN 클라이언트): `[uc]skills.ab` `skchr_utage_1`에만 애니 컴포넌트 `_default {Skill_Start, Skill_Loop, Skill_End}`, `skchr_utage_2`는
  애니 컴포넌트 없음(switch_mode 2); charpack S2 모드 공격 `_animKey "Attack"`, `_damageType 2`(법술). 수정: 새 파일 `tools/assets/anim-overrides.mjs`
  (`op:char_337_utage:` S2 → 공격 클립 `via: 'attack'`) + `tools/assets/spine.mjs` 연결 2줄, `data/assets.json`은 같은 결과로 宴 front/back과 hash만 갱신.
  원본 render 테스트 2개가 옛 그림을 기대해 실패한다(위 "테스트"). 참고: S2 blackboard `respawn_time 1`(클라이언트 `utage_s_2[respawn]`, 재배치 시간)은 키트에 없다 — 이번 범위 밖.
  - 후속 제보 「S2로 해놔도 적을 저지 못했었어」: 재현 안 됨. 실제 경로(정비 loadout 0/1/없음 = 상점 기본 S2, 일반·정예)에서 저지 수는 S2 중·후 모두 1, S1 分神 중에만 0.
    S2를 고르면 저지 테스트(大鲍勃)도 통과. m04에서 S2일 때 저지 0회였던 판은 적(灼热源石虫)이 앞 칸에서 그녀의 공격 + 지형 지속 피해로 먼저 죽어 닿지 않은 것이다.
    공식에도 S2는 저지 수를 바꾸지 않는다(skill_table·클라이언트 S2 모드). 화면에서는 S2 15초 동안 分神 자세(이번 그림 버그)였고, S2는 HP 50%를 잃고 회복이
    안 되어 일찍 쓰러질 수 있다 [추정: 제보의 원인]. 다시 보이면 판(스테이지·라운드·적)을 받아 재현한다.
- **시빌라이트 에테르나(魔王) S3 HP 재분배**: `kits/tier4.js`가 재분배 대상에서 「다른 역할의 치료 대상이 되지 않음」(武者 우타게 등)·禁疗 아군을 뺐다 →
  그 아군은 HP가 그대로였다. PRTS 비고 「重新分配生命为计算攻击范围内所有友方单位的(当前生命值和/生命上限和)得到平均比例，随后平均分配友方单位生命值使得分配后
  各个友方单位的生命比例等于该平均比例」; EN 클라이언트 S3 모드 AuraHeal 능력(재분배 버프 `cetsyr_s_3[collect_hp_ratio]`/`[cal_hp_ratio]`를 붙이는 능력)의
  선택기 `ignoreHealFree: 1`. 재분배는 치료가 아니므로 범위 안 아군 전부(본인 포함)로 바꿨다(`// local patch` 1줄). [추론: `ignoreHealFree`의 의미는
  이름과 원본 tier5 키트(숨김 魔王, 필터 없음)로 판단 — 사용자 확인 필요.] 공식대로 S3 오라 회복(공격력 75%/초)이 커서 회복 가능한 아군끼리는 재분배가 잘 안 보인다.
- **은신 아군이 적 스플래시에 맞음**: 엔진은 이미 대칭이다 — 적의 범위 효과는 `targeting.js areaSelectable`(隐匿 제외, 원본 GitHub #97)로 고른다.
  `enemy_1500_skulsr`(碎骨) 수류탄으로 확인: 隐匿 이웃은 스플래시 0, 迷彩(위장) 이웃은 맞는다. 공식: PRTS 术语释义 迷彩 「不阻挡时不成为敌方普通攻击的目标
  （无法躲避溅射类攻击）」, 异常效果 迷彩 「所有光环类能力、以及涉及中点判定/格子判定的效果均不受迷彩制约」; 隐匿 「不阻挡时不成为敌方攻击的目标」. 화면은 迷彩도
  은신과 같은 반투명·`stealth` 아이콘(`public/js/render/style.js`)이라 구분이 안 된다 — 제보 오퍼레이터는 迷彩일 가능성이 크다 [추정]. 아군 隐匿: 伪装服(첫 피격 후),
  叙拉古 6, 伊内丝 S2, 排气格栅(연기) 타일. 아군 迷彩: 维什戴尔(선발, 그림자 근처), 寒芒克洛丝 S1, 忍冬 S3 후. 코드 변경 없음, 테스트로 고정.
  - 후속 제보 「시라쿠사 6 은신 오퍼가 스플래시에 죽었다(부패 전사 계열)」: 살카즈 부패의 전사 = 萨卡兹枯朽战士(`enemy_1267_nhpbr`, `_2` 리더)는 쓰러질 때
    【污染秽蚀】 지대를 남긴다(스플래시가 아니라 지속 피해 지대). PRTS: 「【污染秽蚀】：范围内位于低地/高地的我方干员和召唤物每秒受到50/25点真实普通伤害（可对空，
    无视无法选择、迷彩；同名效果不叠加）」 — 隐匿은 无法选择의 하나라서 공식으로 맞는다(`enemies.js pollution` `ignoreSelect`). 부패의 전차(`enemy_1272_nhtank`)의
    秽蚀轰击 지대도 같다. 叙拉古 6은 隐匿(`bonds/core.js` `flags.stealth`, 迷彩 아님)이고 배치 후 공속 버프와 같은 시간만 지속된다. 아군 隐匿은 저지해도
    풀리지 않고, 저지당한 적 하나만 그 오퍼를 공격한다(PRTS 「敌人会在自身被干员阻挡情况下强行无视对方可选性发动攻击」). 코드 변경 없음, 테스트로 고정.

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

## 버전 표기 (2026-10-06, 사용자 결정)
- 로컬 판은 **자체 버전**(semver)을 쓴다: `shared/local.js LOCAL_VERSION`, 1.0.0부터(공식 화면 재현판이 첫 정식판). upstream `APP_VERSION`은 「기반」으로만 붙는다.
  처음 안 `0.1.4+mangho.N`은 "원본에 붙은 덧패치"로 읽혀서 사용자가 바꿈.
- 올리는 규칙: 앞자리 = 큰 방향 전환(새 시즌 데이터 등), 가운데 = 기능·화면이 바뀐 배포, 끝자리 = 버그 수정만 있는 배포. upstream 병합은 기반 숫자만 바꾼다.
- 보이는 곳: 타이틀 `v1.0.0 · BASE 0.1.4 · WEB SIMULATION`(title.js 1줄, 옆의 WEB SIMULATION처럼 영어 — 사용자 결정), `/healthz`의 `local`(기반은 원래 `app`), 서버 시작 로그.
- **배포 순서:** `LOCAL_VERSION`을 올려 커밋 → `oci/deploy.sh`. STRONGHOLD.md 배포 기록에 버전도 적는다.

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

## 원본이 고치면 뺄 것
- 제국의 갑주 폭격·3연타 → `server/sim/content/local-patch.js`의 `patchVtsk`
- 협동 보스 HP 인원 배율 → `server/local-patch.js`의 `bossPoolShare` 감싸기 (원본이 인원 배율을 넣으면 이중으로 곱해진다)
- 드론 限伤 예외 → `exemptDroneLink` (원본이 보스 HP를 바꾸거나 限伤 규칙을 바꾸면 다시 판단)
- 频次 적 × 隐德来希 → `tier5.js`의 `// local patch` 2곳 (원본이 고치면 되돌린다. 테스트: 「频次 enemies lose exactly 1 HP per damage instance」)
- 얼린 상점의 특수 갱신 칸 → `effectsMeta.js setShopSlot`의 `prev` 2줄 (원본이 고치면 되돌린다)
- 채팅·관전석 등은 원본에 같은 기능이 생기면 비교해서 정리
- (뺐음, 2026-10-06) 방어 지점 경보음: 원본 #134(d5829258)가 같은 `ON_ENEMY_REACHED_EXIT`를 넣어 로컬 `leak-sfx.mjs`·`audio.js` 2줄·테스트를 지웠다(사용자 결정: 원본 사용)

## 테스트
- `node --test test/local-patch.test.js` — 로컬 테스트 108개.
- 전체 `node --test`에서 원래부터 실패하는 것 (이 개발 사본에 게임 소재가 없음): 소재 manifest·로컬 추출·모듈 아이콘·이모티콘 그림 관련,
  `make-windows-bundle` 대소문자 검사. 2026-10-05 기준 12개. (`lobby-integration` 재접속 테스트와 `match/realtime.test.js` 「real-time co-op over websockets」가 가끔 시간 문제로 실패하는데, 단독으로 돌리면 통과한다. 2026-10-06 전체 실행: 최상위 실패 10개 = 소재·로컬 추출 관련 + 아래 의도한 실패 + 단독으로는 통과하는 realtime 1개)
- 로컬 패치 때문에 실패하는 원본 테스트 (의도한 동작 변경이라 고치지 않음):
  - `test/match/playtest6_summons.test.js` 「manually deployable summons」: 왕의 장기말이 손패 소환물로 추가됨.
  - `test/render/issue25-downback.test.js`: 사키코 Front 스켈레톤에 쓰러짐 클립이 없다(공식 데이터, 예외 목록에 한 명 추가).
  - `test/sim/feedback1f-liftoff.test.js` 「F3 review … “帝国的甲胄” barrage」: 1.5초 안에 8발을 기대한다.
  - `test/sim/playtest6_limits.test.js` 「限伤 vs 【死亡集群】」: 풀이 크면 드론 피해가 무효이길 기대한다.
  - `test/docs-consistency.test.js` 「干员战斗语音 (DESIGN §21.30)」: 음성 경로가 원본 기본 `/voice/cn/`이길 기대한다(로컬은 한국어 빌드 + 일본어 쌍둥이).
  - `test/render/feedback3-skill-idle.test.js` 「unchanged: … (宴: its loop stays the stance)」, `test/render/feedback4-texas-skill-clip.test.js`
    「unchanged: a Begin clip …」: 宴 S2(skillIndex 1)가 Skill_Start → Skill_Loop(=S1 分神 자세)를 틀길 기대한다 — 아래 "전투 버그 수정" 우타게 항목(2026-10-06).
  - `test/asset-network.test.js` 「CLI source defaults to direct …」(upstream 0.1.4): 음성 기본값 `cn`을 기대한다(로컬은 `kr`).
  - `test/version.test.js` 「the release version is what players see」: 타이틀·시작 로그가 `v${APP_VERSION}`이길 기대한다 — 로컬은 자체 버전(「버전 표기」).
  - `test/ui/feedback3-audio-mix.test.js` 「a dog barks … at most the old gain」, 「妖怪 plays at 0.55 × 0.7 …」: 옛 고정 게인(0.55, 1 초과 잘림)을
    기대한다 — 로컬은 공식 믹서 그룹 게인 × 뱅크 볼륨(위 「스킬 모드 효과음·믹서 볼륨」, 2026-10-07).
  - `test/golden.test.js` 「golden roster / bonds / fields / matches」 4개(upstream 0.1.4): 원본 시뮬레이터 결과의 다이제스트를 기대한다 — 로컬 전투 패치(제국의 갑주, 限伤, 성당 검사, 비행 공격 규칙 등)가 결과를 바꾸므로 실패가 정상.
- `node --test test/local-patch-battle.test.js` — 2026-10-06 플레이 제보 전투 버그 테스트 6개(우타게 S2 그림·저지, 魔王 S3 재분배, 은신·위장 vs 스플래시, 污染秽蚀 vs 은신).
- `node --test test/local-patch-camou.test.js` — 위장 아이콘(`UF_CAMOU`) 테스트 2개.
