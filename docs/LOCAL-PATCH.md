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
| 오퍼레이터 음성 언어 선택(한국어/일본어/끄기)과 정비 단계 대사(선택·배치) — 원본 #73 「干员战斗语音」 위에 | `tools/assets/voice.mjs`(일본어 쌍둥이 `audio.voiceJp`, 정리), `public/js/voice.js` | `tools/fetch-assets.mjs`(기본 `--voice-lang=kr` 1줄, `tidyVoice` 2줄), `tools/assets/plan.mjs` 2줄(import, `audio.voiceJp`), `audio.js voice()` 2줄(`audio.voiceTable`: 고른 언어의 표), `screens/game.js`(import, 선택 2줄, `buy`·보상 선택), `ui/settings.js`(언어 줄), `resources.js`(언어 필터), `debug.js`(대사 버튼), `public/i18n/ko/ui.json` |
| 선발 오퍼레이터 (甄选 칸: 왕·첸 더 던스트릭·위셔델·사키코·아스카론) | `tools/build-diy.mjs` → `data/diy.json`, `shared/diy.js`, `public/js/ui/diySlots.js`, `public/css/diy.css`, `tools/assets/diy.mjs` | `tools/build-data.mjs`(스크립트 가드 + export), `server/data.js`·`public/js/data.js`·`public/js/battle/runner.js`(diy.json 병합 각 1줄), `shared/protocol.js`(loadout `diy` 키·검사), `server/match/PlayerState.js` 2줄(`diy` 유지), `server/lobby.js freezeLoadout` 1줄(`diy` 유지 — 없으면 매치가 구성 전체를 버린다), `server/local-patch.js`(전용 풀), `public/js/ui/loadoutModel.js`(`diy` 유지: `parseStored`·`setChoice`·`sanitizeEntries`), `screens/loadout.js` 3줄 + 내보내기 버튼 조건, `index.html` 1줄, `tools/fetch-assets.mjs` 2줄, `server/sim/Battle.js isReservedTile` 2줄(선택 인자 `except`: 望의 재배치 대기 돌 자리 제외) |
| 선발 소환물 모델 (望 바둑돌·维什戴尔 혼령의 그림자: 웹 미러에 기본 모델이 없어 마름모로 보이던 것 → 로컬 클라이언트 추출) | `tools/local-extract/token_spines.py` → `public/assets/local/spine/token/<id>/` + `data/local-assets.json` 그룹 `spine/token/<id>`, `tools/assets/local-token-spines.mjs` → `tools/assets/local-token-spines.json` | `tools/fetch-assets.mjs` 3줄(import, `addDiyTokenAssets`, `addDiyTokenModels` → `data/assets.json tokens[id]` 아바타·`spineLocal`), `public/js/assets.js spineEntry` 토큰 분기 1줄(`spineLocal` 사용) |
| 함정형 소환물 표시 (望 바둑돌은 HP 바 없음, 望 바둑돌·사일런스 의료 드론은 방향 선택 없이 바로 배치·방향 표시 없음) | `shared/trap-tokens.js` | `render/units.js` 3줄(import, HP 바 조건, 방향 표시), `ui/facing.js` 2줄(import, `needsFacing`), `render/fx.js FX_KINDS` 1줄(`wangLink`: 바둑돌 활성화 이벤트의 기본 연출) |
| 정비 화면 HUD 공식 모양 (클라이언트 프리팹 `autochess_hud_panel`·`autochess_hud_bond_item`·`panel_prep_ready`: 라운드 띠 판·양 끝 원·휴식 기간 알약·라운드 숫자판·🔍 버튼 판, 맹약 원 = `bondBoardIcon/<최대단계>_<단계>` + 숫자 판 + 이름(개수/다음 단계 배지는 숨기고 툴팁에만), 준비 완료 버튼, 맹약 줄 가운데 정렬) | `public/js/ui/hudArt.js`, `public/css/hud-art.css` | `screens/game.js` 3줄(import, 루트 class·style), `ui/bondStrip.js` 4줄(import, 원 판 2곳), `index.html`·`dev/game-mock.html` 각 1줄, `public/i18n/ko/ui.json` 2줄(休息一下 → 휴식 기간, 剩余可放置角色 → 배치 가능 인원: 한국 서버 표기) |
| 상점 화면 공식 모양 (클라이언트 프리팹 `autochess_shop`·`_card_item`·`_cost_item`·`_bond_item` 좌표·글꼴·색, 공식 그림: 카드 테두리·[ NO INFO ]·동결/갱신/잠김 버튼·자금 알약·접기 상자·승급 상자·가격 육각형, 카드 워터마크 = 特质 유형 아이콘, 스킬 아이콘 오른쪽 아래) | `public/js/ui/shopArt.js`, `public/css/shop-art.css` | `ui/shopBar.js` 3줄(import, 워터마크, `<section>` class·style), `index.html`·`dev/game-mock.html` 각 1줄 |
| 공식 전투 이펙트 (로컬 클라이언트 추출) | `tools/local-extract/fx_extract.py` → `public/assets/local/fx/**`, `public/js/render/fxplayer.js`·`fxgame.js`·`fxmap.js` | `render/app.js` 8줄(이벤트·프레임·정리 훅, 부하 단계·3D 보드 여부·전투 시계 배속 전달, `stats()`의 `fxGame`, `atk`의 화살 종류 `fxGame.arrowKind(e)`, 공식 이펙트로 그린 `fx`는 2D 대체 생략 `fxGame.ownsFx(e)`), `render/fx.js FX_KINDS` 2줄(`oblvnsNote`, `chen3Qi`) |
| 공식 스테이지 3D 씬 (스테이지별 사막·카시미어·시라쿠사 씬, 라이트맵, 필드별 숨김 세트) | `tools/local-extract/scene_extract.py` → `public/assets/local/scene/**`, `public/js/render/board3d/official.js`, `test/render/board3d-official.test.js` | `board3d/scene.js`(로더 옵션·`officialRoot`·`setStage` 분기·`highlandFor`), `render/app.js` 2곳(`loadOfficial`/`onOfficial` 옵션, `setStage`의 높이), `style.js tileTop` + `tiles.js`·`layout.js` 1줄씩 |
| 스킬 효과음 보강 (ON_SKILL_START가 없는 스킬은 ON_ABILITY_START/ON_CUSTOM_TRIGGER [start]/ON_ABILITY_ON/HIT 뱅크) | `tools/assets/skill-sfx.mjs` | `tools/assets/plan.mjs` 2줄 |
| 갱신 버튼 강조 (전략이 다음 수동 갱신에 작용할 때 테두리가 빛남: 두요야 라운드 첫 2회, 梓兰 매번, 佩佩 특수 갱신 대기, 贾维 N번째 갱신 직전) | `server/local-patch.js refreshBoost` (`privateView` 감싸기 → `shop.refreshBoost`), `public/css/refresh-boost.css` | `ui/shopBar.js` 갱신 버튼 class 1줄, `index.html` 1줄 |
| 리소스 미리 받기 카드에서 음성 언어 선택 (처음 접속할 때 한국어/일본어/끄기, 고르면 용량 다시 계산) | `public/js/resources.js` `ResourceHost`, `voice.js setVoiceLang`, `public/css/resources.css` | — |
| 얼린 상점에서 특수 갱신이 바꾼 칸도 얼림 유지 (원본은 `setShopSlot`이 항상 `frozen: false` → 佩佩·杜遥夜가 넣은 칸이 전투 시작 때 사라짐) | — | `server/match/effectsMeta.js` `setShopSlot` 2줄 (바뀌기 전 칸의 얼림 상태, 없으면 상점 얼림 상태) |
| 적이 방어 지점에 들어갈 때 경보음 (공식 `battle.ON_ENEMY_REACHED_EXIT` = `b_ui_alarmenter`) | `tools/assets/leak-sfx.mjs` → `data/assets.json audio.sfx.battle.leak` | `tools/assets/plan.mjs` 2줄, `audio.js` `handleBattleEvents` 2줄(`leak` 이벤트) |
| 디버그용 재화 고정 (`SP_DEBUG_FUNDS=<0..999>`일 때 사람 플레이어 재화가 그 값으로 고정, 봇은 그대로. `local.sh`가 기본 99, 배포 서버는 미설정) | `server/local-patch.js debugFunds` (`PlayerState.prototype.funds` 접근자) | 없음 |
| 게임 내 디버그 패널 (로컬 디버그 모드만: 보드 왼쪽·맹약 줄 아래. 「디버깅용 재화 99 고정」 체크박스 = 플레이어별로 재화 고정 켜고 끄기, 선발 오퍼레이터·티어·일반/정예·스킬(S1~S3)·모듈(정예만, 없음 포함)을 골라 정비 구역에 추가) | `server/local-patch.js` `debugMode`·`debugIntent`·`debugView`(`privateView` 감싸기 → `m.private.debug`, 디버그 모드일 때만 설치), `shared/local.js`(`dbg.funds`·`dbg.addDiy` 형식), `public/js/ui/debugPanel.js`, `public/css/debug-panel.css`, `public/i18n/ko/ui.json` 7줄 | `screens/game.js` 2줄(import, 렌더), `index.html` 1줄 |
| 이펙트·사운드 디버그 페이지 (`SP_DEBUG_PAGE=1`일 때만, 배포 서버는 404) | `public/debug.html`, `public/js/debug.js` (`/fxlab.html`은 이리로 넘김), `server/local-patch.js debugPageHidden` | `server/index.js` 2줄 |
| `/healthz` 축소 (프록시를 거친 요청은 `ok`·`version`·`app`·`build`만, 접속자·방 수는 컨테이너 안 확인용) | `server/local-patch.js proxiedRequest` | `server/index.js` 2줄(import, `/healthz` 앞 1줄) |
| iframe 차단 헤더 | — | `server/index.js` 3줄 |
| 나가기 창에서 「暂离（AI 托管）」 숨김 | — | `ui/matchChrome.js` (`AWAY_OPTION = false`) — 나가면 자리를 포기한다 |
| 맹약 스택 세 자리 줄바꿈 수정 | `public/i18n/ko/ko.css` | — |
| 협동 보스 HP = `bloodPoint` × 생존 인원 | `server/local-patch.js` (`GameData.prototype.bossPoolShare`를 감쌈) | 없음 (`lobby.js`가 이미 import) |
| 제국의 갑주 등장 폭격·3연타 PRTS 수치 | `server/sim/content/local-patch.js` | `server/sim/content/index.js` 1줄 (`DOMAIN_NAMES.push`) |
| 胄 드론 연동 피해를 限伤에서 제외 | `server/sim/content/local-patch.js` | 위와 같음 |
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
    토큰 사거리 x-6(반경 2 십자) 전체 → 고지대 돌도 S3면 지상 적을 잡고, S1/S2면 비행 적만 밟는다(S2 폭발은 연결 방향 지상 적도 맞힘).
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
`bondBoardIcon/*`)라 모든 플레이어에게 같다. 크기 단위도 상점과 같다(1단위 ≈ 1920 기준 1.08px).
- 라운드 띠: 판(`bg_board`)·양 끝 원·장식 상자·장식 글자, 그 뒤 어두운 띠(프리팹의 `frame_left` 옆판 — 스크린샷의 어두운 띠를 CSS로),
  가운데 단계 알약(`bg_rest`/`bg_battle`/`bg_coop` + `frame_mid_normal`, 글자 17px #40b196), 라운드 숫자 `bg_round`(20px #171717), LP 20px #a8a8a8,
  🔍 버튼은 `bg_check_btn` 판 위.
- 맹약 원: 판은 프리팹이 실행 중에 고르는 `_imgBoard` = `bondBoardIcon/<최대단계(최대 4)>_<도달 단계>`, 비활성은 `1_0`(스크린샷과 대조). 최고 단계면
  아이콘이 검정, 아니면 밝은 회색. 숫자(층수) 16px는 `matte_num` 위, 이름 14px. 원본의 "개수/다음 단계" 배지는 공식 원에 없어 숨기고 툴팁에만 둔다.
  맹약 줄은 라운드 띠 아래 가운데(`bond_list_info_view`), 뒤에 `matte`.
- 준비 완료: `ready_bg`(+`ready_frame`) + `ready_icon` + 18px 검정, 준비한 뒤(취소)는 `cancel_bg` + `cancel_icon` + #2f2f2f. 단축키 칸은 버튼 아래.
- 번역: 스크린샷의 한국 서버 표기로 「휴식 기간」(休息一下), 「배치 가능 인원」(剩余可放置角色).
- 그대로 둔 것: 오른쪽 위 카운트다운(스크린샷에 없음 — 확인 필요), 단축키(원본), 맹약 줄 접기 버튼(원본 #149 모양).

## 상점 화면 (2026-10-06)
사용자 요청: 상점을 실제 게임과 같게. 근거는 EN 클라이언트 `ui/autochess/[uc]autochessbattle.ab`의 프리팹(`autochess_shop`, `autochess_shop_card_item`,
`autochess_shop_cost_item`, `autochess_shop_bond_item`)과 사용자가 준 실제 게임 스크린샷 3장.
- 그림: 웹 소재(`data/assets.json` ui `shopPanel/*`·`shopCard/*`·`garrisonTypeIcon/*`)라 로컬 클라이언트가 없는 플레이어도 같다. 가격 육각형
  (`cost_bg_1`/`cost_bg_2`)만 로컬 추출본(ui/battle)이라 없으면 원본 CSS 육각형. 웹 그림이 없으면 `has-shop-art`가 붙지 않아 원본 모양 그대로.
- 크기: 프리팹 단위(카드 158×176, 승급 111×175, 접기 상자 168×184, 버튼 128×55). 1단위 ≈ 1920 기준 1.08px(`--u` .0108rem) — 스크린샷에서
  카드 폭이 상단 라운드 띠의 약 1/4인 것으로 맞춤.
- 카드: 오른쪽 위 초상화, 왼쪽 흐린 워터마크 = 기물의 첫 特质의 유형 아이콘(프리팹 `garrison_icon` 65×65·35 %, `garrisons.json eventTypeIcon`
  → `garrisonTypeIcon/icon_*`; 스크린샷의 에스텔·아르케토·锡人과 맞음, 刺玫는 우리 데이터 icon_bond인데 스크린샷은 icon_gold — 시즌 차이로 추정),
  맹약 줄(14px #b7b7b7) 위에 이름 띠(직군 아이콘 + 이름 16px), 아이템은 설명 없이 그림 + 이름, 팔린 칸 `[ NO INFO ]`, 돈이 모자라면 회색 막.
  업로드 화면에 없는 원본 기능(스킬·모듈 표시, 승진 가능 표시, 두 번 눌러 사기)은 남겼다. 스킬 아이콘은 오른쪽 아래(사용자 요청).
- 단축키는 원본 그대로(D 승급 · F 동결 · R 갱신): 스크린샷의 G/S/D/A는 그 유저가 바꿨을 수 있다(사용자 판단 2026-10-06).
- [추정] 동결 버튼: 평소 `frozen_bg_normal`(파랑), 동결 중 `frozen_bg_unselect`(흰 파랑) — 프리팹 그룹 이름(lock/unlock)과 반대로 읽었다(스크린샷이 둘 다 파랑).
- 아직 없는 것: 접기 상자의 마스코트 Spine(`trap_1096_acshopup`, 텍스처 미추출 — PIXI로 따로 그려야 함), 웹 소재의 `shopPanel/level`이 다른 그림이라
  승급 상자의 "LEVEL"은 글자로 그림.

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
- 디버그: `/debug.html` — 오퍼레이터별 이펙트(대상 위치 포함)·효과음·음성, 스킬 버튼(이펙트+소리+대사 동시).

## 공식 스테이지 3D 씬 (2026-10-06)
- 3D 보드는 원래 시즌 1 아틀라스(`map_autochess`)로 모든 스테이지를 그렸다. 지금 클라이언트는 스테이지마다 완성된 씬(`scenes/activities/act*autochess/level_*`)과 라이트맵을 갖고 있고, 테마는 사막(`map_autochesssand`), 카시미어(`map_kxmr`), 시라쿠사 지하철(`map_syracuse_metro`)이다. 자세한 내용은 DESIGN §15.1.
- 추출: `.venv-extract/bin/python tools/local-extract/scene_extract.py` (기본 클라이언트 경로 `/mnt/d/YostarGames/Arknights_EN/Arknights_Data`, `--stage`로 일부만) → `public/assets/local/scene/**`, `data/local-assets.json`의 `scene/*` 그룹. CAB 색인은 `logs/scene-cab-index.json`에 캐시(`--rebuild-index`).
- WebP (2026-10-06, upstream #186과 같은 방식): 텍스처·라이트맵마다 PNG 옆에 WebP를 쓰고 manifest가 WebP를 가리킨다. 컬러 맵(머티리얼의 `_MainTex`)만 손실 q95, 노멀·러프니스·발광·RGBM 라이트맵·섀도마스크는 무손실(43MB → 26MB). 클라이언트 없이 기존 PNG에서 만들려면 `scene_extract.py --webp`, 끄려면 `--no-webp`.
- 그리기: `public/js/render/board3d/official.js`. 공식 씬이 있으면 절차 타일·배경·물 대신 그리고, 게이트·필드 테두리·기기·지형 효과는 그대로 쓴다. 필드별 숨김 세트(HIDDEN@1/2/3)는 현재 영역에 맞춰 켠다. `?officialBoard=0`이면 예전 보드.
- 높이: 공식 씬의 `highlandHeight`(사막 0.4, 카시미어 0.3)를 HIGH 타일 전부에 쓴다(`style.js tileTop`). 공식 씬이 없으면 예전 `TILE_H`.
- 남은 것: 공식 물 셰이더는 근사(거품·커스틱·하늘 반사 없음), m04 밀물 연출 미구현.

## 원본이 고치면 뺄 것
- 제국의 갑주 폭격·3연타 → `server/sim/content/local-patch.js`의 `patchVtsk`
- 협동 보스 HP 인원 배율 → `server/local-patch.js`의 `bossPoolShare` 감싸기 (원본이 인원 배율을 넣으면 이중으로 곱해진다)
- 드론 限伤 예외 → `exemptDroneLink` (원본이 보스 HP를 바꾸거나 限伤 규칙을 바꾸면 다시 판단)
- 频次 적 × 隐德来希 → `tier5.js`의 `// local patch` 2곳 (원본이 고치면 되돌린다. 테스트: 「频次 enemies lose exactly 1 HP per damage instance」)
- 얼린 상점의 특수 갱신 칸 → `effectsMeta.js setShopSlot`의 `prev` 2줄 (원본이 고치면 되돌린다)
- 채팅·관전석 등은 원본에 같은 기능이 생기면 비교해서 정리

## 테스트
- `node --test test/local-patch.test.js` — 로컬 테스트 82개.
- 전체 `node --test`에서 원래부터 실패하는 것 (이 개발 사본에 게임 소재가 없음): 소재 manifest·로컬 추출·모듈 아이콘·이모티콘 그림 관련,
  `make-windows-bundle` 대소문자 검사. 2026-10-05 기준 12개. (`lobby-integration` 재접속 테스트와 `match/realtime.test.js` 「real-time co-op over websockets」가 가끔 시간 문제로 실패하는데, 단독으로 돌리면 통과한다. 2026-10-06 전체 실행: 최상위 실패 10개 = 소재·로컬 추출 관련 + 아래 의도한 실패 + 단독으로는 통과하는 realtime 1개)
- 로컬 패치 때문에 실패하는 원본 테스트 (의도한 동작 변경이라 고치지 않음):
  - `test/match/playtest6_summons.test.js` 「manually deployable summons」: 왕의 장기말이 손패 소환물로 추가됨.
  - `test/render/issue25-downback.test.js`: 사키코 Front 스켈레톤에 쓰러짐 클립이 없다(공식 데이터, 예외 목록에 한 명 추가).
  - `test/sim/feedback1f-liftoff.test.js` 「F3 review … “帝国的甲胄” barrage」: 1.5초 안에 8발을 기대한다.
  - `test/sim/playtest6_limits.test.js` 「限伤 vs 【死亡集群】」: 풀이 크면 드론 피해가 무효이길 기대한다.
  - `test/docs-consistency.test.js` 「干员战斗语音 (DESIGN §21.30)」: 음성 경로가 원본 기본 `/voice/cn/`이길 기대한다(로컬은 한국어 빌드 + 일본어 쌍둥이).
