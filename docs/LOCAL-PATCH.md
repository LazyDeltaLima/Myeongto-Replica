# nas-local 로컬 패치 목록

`nas-local` 브랜치가 원본(`upstream` = sganggs/Stronghold-Protocol)과 다른 부분을 모두 정리한 문서다. 이 파일은 로컬에서만 만든 파일이라
원본을 병합해도 충돌하지 않는다. 패치를 넣거나 뺄 때 같이 고친다. 운영 절차는 `STRONGHOLD.md`에 있다.

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
| 오퍼레이터 음성 (작전 개시·선택·배치·스킬 대사 9종, 한국어/일본어/끄기) | `tools/assets/voice.mjs`, `public/js/voice.js` | `tools/assets/plan.mjs` 2줄, `tools/fetch-assets.mjs` 3줄, `audio.js` 1줄(`onUnitSkill`), `settings.js` 2줄, `screens/game.js`(import, 선택 2줄, `buy` 감싸기, 전투 시작 1줄), `resources.js`(언어 필터), `public/i18n/ko/ui.json` |
| 선발 오퍼레이터 (甄选 칸: 왕·첸 더 던스트릭·위셔델·사키코·아스카론) | `tools/build-diy.mjs` → `data/diy.json`, `shared/diy.js`, `public/js/ui/diySlots.js`, `public/css/diy.css`, `tools/assets/diy.mjs` | `tools/build-data.mjs`(스크립트 가드 + export), `server/data.js`·`public/js/data.js`·`public/js/battle/runner.js`(diy.json 병합 각 1줄), `shared/protocol.js`(loadout `diy` 키·검사), `server/match/PlayerState.js` 2줄(`diy` 유지), `server/local-patch.js`(전용 풀), `public/js/ui/loadoutModel.js`(`diy` 유지: `parseStored`·`setChoice`·`sanitizeEntries`), `screens/loadout.js` 3줄 + 내보내기 버튼 조건, `index.html` 1줄, `tools/fetch-assets.mjs` 2줄 |
| 공식 전투 이펙트 (로컬 클라이언트 추출) | `tools/local-extract/fx_extract.py` → `public/assets/local/fx/**`, `public/js/render/fxplayer.js`·`fxgame.js`·`fxmap.js` | `render/app.js` 6줄(이벤트·프레임·정리 훅, 부하 단계 전달, `stats()`의 `fxGame`) |
| 스킬 효과음 보강 (ON_SKILL_START가 없는 스킬은 ON_ABILITY_START/ON_CUSTOM_TRIGGER [start]/ON_ABILITY_ON/HIT 뱅크) | `tools/assets/skill-sfx.mjs` | `tools/assets/plan.mjs` 2줄 |
| 라운드별 작전 BGM (휴식기는 원본 그대로 `act1autochess_shop`, 작전은 공식 라운드 레벨의 bgmEvent: 1~7라운드 `bat_kazimierz2_2`, 8~13라운드 `bat_kazimierz2_1`, 훈련 `bat_act35side_01`) | `tools/assets/round-bgm.mjs` → `data/assets.json audio.waveBgm[템플릿 id]`, `public/js/round-bgm.js` | `tools/assets/plan.mjs` 2줄, `audio.js` 3줄(import, `resolveBgm`의 `wave:` 키, `installAudio` sync) |
| 갱신 버튼 강조 (전략이 다음 수동 갱신에 작용할 때 테두리가 빛남: 두요야 라운드 첫 2회, 梓兰 매번, 佩佩 특수 갱신 대기, 贾维 N번째 갱신 직전) | `server/local-patch.js refreshBoost` (`privateView` 감싸기 → `shop.refreshBoost`), `public/css/refresh-boost.css` | `ui/shopBar.js` 갱신 버튼 class 1줄, `index.html` 1줄 |
| 리소스 미리 받기 카드에서 음성 언어 선택 (처음 접속할 때 한국어/일본어/끄기, 고르면 용량 다시 계산) | `public/js/resources.js` `ResourceHost`, `voice.js setVoiceLang`, `public/css/resources.css` | — |
| 얼린 상점에서 특수 갱신이 바꾼 칸도 얼림 유지 (원본은 `setShopSlot`이 항상 `frozen: false` → 佩佩·杜遥夜가 넣은 칸이 전투 시작 때 사라짐) | — | `server/match/effectsMeta.js` `setShopSlot` 2줄 (바뀌기 전 칸의 얼림 상태, 없으면 상점 얼림 상태) |
| 적이 방어 지점에 들어갈 때 경보음 (공식 `battle.ON_ENEMY_REACHED_EXIT` = `b_ui_alarmenter`) | `tools/assets/leak-sfx.mjs` → `data/assets.json audio.sfx.battle.leak` | `tools/assets/plan.mjs` 2줄, `audio.js` `handleBattleEvents` 2줄(`leak` 이벤트) |
| 이펙트·사운드 디버그 페이지 (`SP_DEBUG_PAGE=1`일 때만, 배포 서버는 404) | `public/debug.html`, `public/js/debug.js` (`/fxlab.html`은 이리로 넘김), `server/local-patch.js debugPageHidden` | `server/index.js` 2줄 |
| `/healthz` 축소 (프록시를 거친 요청은 `ok`·`version`·`app`·`build`만, 접속자·방 수는 컨테이너 안 확인용) | `server/local-patch.js proxiedRequest` | `server/index.js` 2줄(import, `/healthz` 앞 1줄) |
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

## 오퍼레이터 음성 (2026-10-05)
- 소재: ArknightsAssets2 `voice` 브랜치 `sound_beta_2/voice_kr/{charId}/cn_NNN.mp3`(한국어), `voice/…`(일본어). fetch-assets가
  다른 소재와 같이 `public/assets/audio/voice/{kr|jp}/`에 받고 `data/assets.json audio.voice`에 넣는다. 대사 텍스트는 받지 않는다.
  - 줄 번호(charword_table voiceId), 9종: `CN_020` 작전 개시, `CN_021`·`022` 오퍼레이터 선택, `CN_023`·`024` 배치,
    `CN_025`~`028` 작전 중(스킬).
  - 풀 오퍼레이터 120명 전원 9줄 모두 있음(언어당 약 23MB). 예비 오퍼레이터(`char_600`~`615`), `char_616_pithst`, `char_617_sharp2`는 음성이 없다
    (404는 오류가 아니라 누락으로 처리하고, 보고서의 일반 누락 목록에서는 뺀다).
- 재생: 말을 집거나 선택하면 선택 대사, 상점에서 사면 배치 대사, 전투 단계(전투·연합 방어·최종 공세·히든 코어)가 시작되면
  내 보드의 오퍼레이터 중 무작위 한 명의 작전 개시 대사, 전투에서 스킬이 켜지면 스킬 대사. 설정의 「오퍼레이터 음성」에서 한국어/일본어/끄기와 음량을
  고른다(브라우저별 `sp.pref.voice`, 기본 한국어). 음소거는 따르고 효과음 음량과는 별개.
- 겹침 규칙은 공식 `audio_data.json battleVoice`를 따른다: 한 번에 하나, 0.1초 크로스페이드. 우선순위가 더 높으면 끊고 들어가고,
  같으면 `overlapIfSamePriority`일 때만 바꾼다. 아니면 버린다(대기열 없음).
  - 작전 개시 BATTLE_START 100, 배치 PLACE_CHAR 20, 선택 FOCUS_CHAR 10, MANUAL 스킬 SKILL_ACTIVE 70, AUTO 스킬 SKILL_PASSIVE_IMP 60(SP ≥ 10) / _NOR 50(쿨다운 10초).
  - [추정] 쿨다운은 오퍼레이터별로 센다. 엔진이 자동으로 쓰는 MANUAL 스킬도 SKILL_ACTIVE로 친다. 작전 개시는 보드에서
    무작위 한 명이 말한다(공식 데이터에 누가 말하는지는 없음).
- 리소스 미리 받기는 고른 언어의 음성만 받는다. 언어를 바꾸면 다른 언어 파일은 캐시에서 지운다.

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
  - 왕: 바둑돌(손패 소환물, 지상·고지대 아무 배치 칸 — 토큰 position ALL)은 직교로 이어져야 활성화, 적이 칸에 들어오면 발동(돌은 남음).
    재능1 跟子(전투 시작 때 인접 1개, 배치 불가 지상도 가능), 재능2 직선 개수 보너스. S1/S2는 SP가 차면 즉시 돌 2개를 경로 위
    기존 돌 옆에 자동 배치([추정]: 전투 중 손패가 없어서), S3는 사거리 안 적 위치에 돌을 떨어뜨림(탄약 1발/개).
  - 첸: 약점 대미지(물리·마법 중 유리한 쪽), 7초 무피격 시 회복+다음 공격 회피, S1 침묵, S2 0.4초 간격 10회 베기(처치 시 이전·+1회,
    무적) 후 대상 칸으로 이동 + 공격력·회피 버프, S3 검기(1.5칸/초, 반경 1.3, 고지대·벽·출구 앞에서 시계 방향 90° 회전, 직선 구간마다
    적당 1회, 현재 HP 6%·최소 공격력 550%) — PRTS 비고 기준.
  - 위셔델: 여진·잔영 폭발(재능1), 혼령의 그림자 소환과 근처 위장(재능2), S2 과부하([추정] 지속시간 후반부), S3 그림자 2개 추가(최대 3).
  - 사키코: 음표 수만큼 방어·저항 무시, Fever(450, 20초, 스킬 재시전·S2 2연타·S3 퇴각 안 함), S2는 시전마다 피아노↔오르간 전환([추정]).
  - 아스카론: 사망 구금 중첩(이동 −18%/중첩, 현재 공격력 10%/초), S2 둔화·처치 시 확산, S3 범위 내 적 명중률 −30%(회피 시 회복).
- 모듈: 공식 甄选 칸에는 기본 모듈이 없어(게임에서 직접 장착) 처음엔 미장착이었다. 2026-10-05부터 후보의 첫 모듈(`uniequip_002`, X 타입)을
  기본으로 장착한다(`build-diy.mjs diyDefaultModule` → 상점 `defaultUniEquipId`). 오퍼레이터 구성 화면에서 「없음」을 고를 수 있다.
- 소재: `tools/assets/diy.mjs`가 07-assets 형식 항목을 만들어 fetch-assets가 초상·Spine·스킬 아이콘·효과음·음성을 같이 받는다.
- 한국어: `tools/i18n/build-ko-diy.mjs` → `public/i18n/ko/diy.json`. 위셔델·아스카론은 KR 공식 테이블, 왕·첸 더 던스트릭·사키코는 `tools/i18n/diy-ko-manual.json` 수동 번역(이름·스킬·재능·모듈 이름은 나무위키 표기).

## 공식 전투 이펙트 (2026-10-05)
- `tools/local-extract/fx_extract.py`: EN 클라이언트 `battle/prefabs/effects/<이름>.ab`의 프리팹을 JSON(노드 트리, 파티클 모듈,
  재질, Mecanim 클립 곡선) + PNG 텍스처 + 메시 JSON으로 뽑는다. 텍스처는 다른 번들에 있어 CAB 색인(`--build-cab-index`, 약 15분)이 필요.
  지금 뽑은 것: chen3·wang·wisdel·oblvns·ascln 기본 스킨만 139개, 약 7.5MB(텍스처는 정지 WebP q85·알파 무손실, `--png`로 PNG; 스킨 변형은 `--all-skins`로만).
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
- `render/fxgame.js`: 전투 화면 위 투명 캔버스. 스킬 시작/유지(buff)/스킬 중 타격, 일반 공격 시작/타격을 프리팹 이름으로 매핑
  (`fxmap.js`, [추정]). 해당 오퍼레이터가 행동하기 전에는 아무것도 받지 않는다. 품질 '낮음'이면 끈다.
  화면의 부하 단계(`app.js adaptLoad`)가 2 이상이면 '높음'을 '중간'으로, 3이면 일반 공격 이펙트를 생략한다(원본 `fx.js`가 2 이상에서
  장식을 끄는 것과 같은 규칙). 동시 인스턴스 상한은 `fxplayer.js MAX_INSTANCES`(24). `view.stats().fxGame` = 살아 있는 수, update·render ms,
  드로우콜, 입자 수.
- 디버그: `/debug.html` — 오퍼레이터별 이펙트(대상 위치 포함)·효과음·음성, 스킬 버튼(이펙트+소리+대사 동시).

## 원본이 고치면 뺄 것
- 제국의 갑주 폭격·3연타 → `server/sim/content/local-patch.js`의 `patchVtsk`
- 협동 보스 HP 인원 배율 → `server/local-patch.js`의 `bossPoolShare` 감싸기 (원본이 인원 배율을 넣으면 이중으로 곱해진다)
- 드론 限伤 예외 → `exemptDroneLink` (원본이 보스 HP를 바꾸거나 限伤 규칙을 바꾸면 다시 판단)
- 얼린 상점의 특수 갱신 칸 → `effectsMeta.js setShopSlot`의 `prev` 2줄 (원본이 고치면 되돌린다)
- 채팅·관전석 등은 원본에 같은 기능이 생기면 비교해서 정리

## 테스트
- `node --test test/local-patch.test.js` — 로컬 테스트 42개.
- 전체 `node --test`에서 원래부터 실패하는 것 (이 개발 사본에 게임 소재가 없음): 소재 manifest·로컬 추출·모듈 아이콘·이모티콘 그림 관련,
  `make-windows-bundle` 대소문자 검사. 2026-10-05 기준 12개. (`lobby-integration` 재접속 테스트가 가끔 시간 문제로 실패하는데, 단독으로 돌리면 통과한다)
- 로컬 패치 때문에 실패하는 원본 테스트 (의도한 동작 변경이라 고치지 않음):
  - `test/match/playtest6_summons.test.js` 「manually deployable summons」: 왕의 장기말이 손패 소환물로 추가됨.
  - `test/render/issue25-downback.test.js`: 사키코 Front 스켈레톤에 쓰러짐 클립이 없다(공식 데이터, 예외 목록에 한 명 추가).
  - `test/sim/feedback1f-liftoff.test.js` 「F3 review … “帝国的甲胄” barrage」: 1.5초 안에 8발을 기대한다.
  - `test/sim/playtest6_limits.test.js` 「限伤 vs 【死亡集群】」: 풀이 크면 드론 피해가 무효이길 기대한다.
