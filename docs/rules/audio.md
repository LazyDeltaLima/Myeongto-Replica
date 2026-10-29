# 소리·음성

옛 `docs/LOCAL-PATCH.md`에서 2026-10-09에 나눈 파일이다. 옛 절 이름은 `docs/LOCAL-PATCH.md` 색인에서 찾는다.

## 오퍼레이터 음성 (2026-10-05, 원본 #73 병합 후 2026-10-06 정리)
원본 #73(`54cdad2`, DESIGN §21.30 「干员战斗语音」)이 전투 음성을 넣어서, 재생 규칙은 원본을 따르고 로컬 패치는 두 가지만 남겼다(관리자 결정 2026-10-06).
- 원본이 하는 것: 전투 중에만 공식 슬롯 12개 — 행동 출발(처음 배치된 오퍼레이터)·배치(나머지)·행동 개시(첫 타격, 엔진 `engage` 이벤트)·
  전투 중 선택(상세 패널)·작전 중 1~4(스킬 번호)·결산 4종. 한 번에 하나, 간격 1.2초, 유닛·슬롯별 쿨다운, 공식 우선순위(VoiceGate).
  (언제 무엇을 말하는지는 아래 로컬 3이 공식 클라대로 바꾼다.)
  음성 음량은 설정의 「干员语音」 슬라이더. 언어는 빌드 때 하나(`fetch-assets --voice-lang`, 원본 기본 cn).
- 로컬 1 — 언어 선택: 빌드 기본을 한국어(`--voice-lang=kr`, `audio.voice`)로 하고, 같은 슬롯의 일본어를 `audio.voiceJp`로 같이 받는다
  (`tools/assets/voice.mjs voiceTwin`, 파일은 `audio/voice/{kr|jp}/{charId}/cn_NNN.mp3`, 원천 `sound_beta_2/voice_kr/`·`voice/`).
  설정의 「语音语言」에서 브라우저마다 한국어/일본어/끄기(`sp.pref.voice`, 기본 한국어) → `audio.voiceTable`이 `audio.voice()`에 고른 표를 준다.
  리소스 미리 받기는 고른 언어만 받는다. 2026-10-06 기준 한국어 124명·일본어 125명, 대사 3,486줄(사키코는 한국어 더빙 없음).
- 로컬 2 — 정비 단계 대사(원본은 휴식기 무음): 말을 **탭(선택)하면** 선택(`select`) — 이미 선택된 말을 다시 탭해도 난다(관리자 제보 2026-10-08,
  실제 게임). **배치하려고 드래그할 때는 대사 없음**, **상점 구매·정예화 보상·특수 제안으로 얻을 때도 배치 대사 없음**
  (배치 효과음만 — 관리자가 2026-10-08 卫戍协议 영상으로 확인; `voiceForBuy` 삭제). 전투 중 유닛 탭도 매번
  선택 대사(`voice.js voiceForUnit`, 오퍼레이터만) — 원본 상세 패널의 「대상당 한 번」(`voice=${combat}`)을 대신함.
  원본 `audio.voice()`의 게이트를 그대로 거친다(`unitKey` `prep:…`/`battle:…`).
  **벤치의 오퍼레이터를 보드에 놓으면 배치 대사**(`place` = PLACE_CHAR; 관리자 제보 2026-10-08, 관리자 결정 2026-10-08: 벤치→보드만):
  방향 휠 확정(`screens/game.js commitFacing`)이 보드 밖에서 온 오퍼레이터를 기억했다가 그 말이 보드에
  떨어질 때(`pieceDeploy`, 3초 안) `voice.js voiceForPlace` — 배치 효과음과 같은 순간. 보드 안 이동·벤치 복귀·전투 뒤 정비 복귀·자동 배치·소환물은
  대사 없음. 근거(2026-10-10 공식 클라): `AutoChessGameModeVoicePlugin._OnCharacterPlacedAtBattle`(이벤트 `ON_PLACE_AT_BATTLE_FIELD`
  1206) — 정비 본 단계(`AutoChessGameStatus.inMainPrepareState`)에서 전장 칸에 놓인 말이 `PLACE_CHAR`(部署); 벤치로 놓는 1207에는 대사 구독이 없다.
  1206/1207을 쏘는 곳은 `AutoChessDummyManager._OnCharacterPlaced`뿐이다(2026-10-11 공식 클라) — 말을 칸·슬롯에 두는
  `SetCharacter` 끝에서 불리고(호출자: 만들기 대기열 `OnTick`·`_DoCreateOnTile`·`CreateDeadLikeDummy`), 전투 상태면 방향만 맞추고 끝
  (대사·배치음 없음), 정비 중이면 전장 칸 1206·손(벤치) 1207. 클라는 「구매」를 따로 가르지 않는다: 상점 구매는 말이 벤치로 가서 1207 → 대사 없음
  (배치음은 남) — 관리자 영상과 같다. 구매한 말이 곧바로 전장 칸에 생기는 경로(우리: 3장 합성으로 정예가 보드의 원래 칸에 서는 경우)는 공식 클라상
  1206 → 部署인데, 우리는 그때도 대사가 없다 [미확인: 공식 화면에서 합성 순간 部署가 나는지].
  확인: 실제 솔로 판(Chrome, 실제 마우스 끌기 + 방향 확정) — 배치음 b_char_set + 배치 대사, 자동 배치·정비 복귀는 대사 없음; 상점 카드 클릭 구매 → 배치음만,
  탭 3번 → 선택 대사 3번, 드래그 → 없음. 단위 `test/local-patch.test.js` 「部署 line」.
  **0.2.0 선발·补位 (2026-10-08)**: 0.2.0의 선발 슬롯 기록(`chess_char_*_diy*`)은 `charId`·`assets`가 비어 있어 정비 탭이 말이 없었고,
  补位 기물은 대체된 원래 오퍼 목소리로 말했다 → `screens/game.js`가 내 기물이 보여 주는 기록(`ownShown`: 선발 픽의 오퍼, 补位는 대체 오퍼 — 预备干员은
  음성 뱅크가 없어 전투 중 탭처럼 조용)을 `voiceForPiece(piece, shown)`에 넘긴다. 스킬 대사 유형(`voicePolicy skillOf`)도 슬롯·원래 오퍼의 스킬을 봐서
  자동 스킬이 모두 수동(70, 쿨다운 없음)이었다 → `voice.js unitSkillOf`: 유닛 모델(`spine`)이 기록의 `charId`와 다르면 그 캐릭터의 기물 상태 폼
  (`data/backups.json`, 스킬 번호)으로 — 望 S1/S2·阿斯卡纶 S1은 SKILL_PASSIVE_IMP, 维什戴尔 S1은 _NOR. `voiceForPlace`는 렌더 정보의 `spine`을 써서 원래 맞음.
  확인: 실제 솔로 판(전부 补位 + 디버그 패널 선발 3명, 마우스 탭, 4라운드), 단위 `test/local-patch.test.js` 「自选 / 补位」.
- 이전 로컬 패치에서 뺀 것: 작전 개시(무작위 한 명)·스킬 대사·자체 겹침 규칙·자체 음량 — 원본 것으로 대체.
- 로컬 3 — 공식 재생 규칙(2026-10-06 관리자 결정, 2026-10-10 공식 클라로 다시 맞춤 — 관리자 결정 「동작 변경 모두 공식이랑 동일하게」;
  `public/js/voicePolicy.js`를 `voice.js`가 설치, `audio.js`에는 훅 몇 줄). 대사 로직은 관리 코드 `Torappu.Battle.UI.VoicePlayer`·
  `AutoChessGameModeVoicePlugin`이다(예전에 「네이티브」로 본 것은 틀림).
  - 게이트 `VoicePlayer._PlayVoice`: 클라이언트 `audio_data.json battleVoice` 값 — 전체 간격 없음, 우선순위(행동출발 100·행동개시 90·
    수동 스킬 70·자동 스킬 60/50(SP 10 이상/미만)·배치 20·선택 10), 마지막 대사보다 높으면 재생(앞 대사를 0.1초 크로스페이드로 끊음), 같은 우선순위는
    유형이 겹침 허용(행동출발·수동 스킬·배치·선택)이면 끊고 아니면 버림 — 「낮은 우선순위는 높은 것을 못 끊는다」는 이제 공식 클라에서 확인. 겹침 불가 요청(`PlayRandomVoice` overlapFlag false)은 `VoiceManager.PlayVoice`가 음성 채널이 울리는 동안만 버린다 — 우리 게이트의 「재생 중 대사와 비교, 대사가 끝나면 비움」(`release`)과 같은 결과.
    **쿨다운은 유형별 전역**(`m_nextPlayableTime`은 유형 8칸 배열 — 모든 오퍼레이터가 공유)이고 **대사가 끝난 뒤부터**: 다음 = 지금 + 대사 길이 + 쿨다운
    (자동 스킬 10초만; `audio.js _playVoice`가 디코드한 길이를 `voiceGate.lineLength`로 넘긴다). 새 대사가 나면 마지막 대사 유형의 쿨다운을
    max(그대로, 지금 + 쿨다운)으로 다시 건다. `VOICE_TYPES_TO_SHARE_CD_WITH_ALL_OTHERS`(.cctor) = [NORMAL_ATTACK]뿐 — 우리는 평타 대사가 없어 무관.
    예전(2026-10-06): 쿨다운이 오퍼레이터별·시작부터였다. 원본 #73의 1.2초 간격·「+10 이상이어야 끊음」·모든 스킬 10초/70도 공식과 다르다.
  - 선택 대사 쿨타임(관리자 질문 2026-10-08): 공식에도 없다 — FOCUS_CHAR `cooldown 0`·`overlapIfSamePriority true`(데이터),
    `AutoChessGameModeVoicePlugin._OnCharacterHighlighted`(이벤트 1208)가 조건 없이 FOCUS_CHAR → 다시 선택하면 재생 중 선택 대사를 끊고 새 대사.
    이벤트가 「같은 말 재선택」에도 오는지는 발생 쪽(드래그 상태) 코드를 안 봐서 [추정: 집을 때마다]. 스킬 대사(70) 재생 중 선택(10)은 버림(관리자 제보
    2026-10-08, 실제 게임과 같음). 테스트 `test/local-patch.test.js` 「official scheduling」.
  - **전투 시작**(라운드마다): `AutoChessGameModeVoicePlugin._OnBattleStarted`(이벤트 `ON_BATTLE_STARTED` 1211) — 전투에 든 자기 말
    (`battleChessInsts`) 중 **무작위 하나의 部署**(PLACE_CHAR). 나머지 첫 배치는 조용 — 근거는 관리자 영상(2026-10-10 「라운드 시작에 部署 한 줄」)이고
    공식 클라에서는 이유를 못 찾았다(2026-10-11). 훅 `HookPlayVoice`는 `PLACE_CHAR`를 MAIN 하위 상태 밖에서만 막는데(`get_inMainSubState`
 = 하위 상태 3), 차례 배치는 BATTLE 상태 MAIN 하위 상태의 할 일 `MainGameInBattle` 안이다(`AutoChessGameMode._RegisterBattleTasks`,
    하위 상태 전환 `AutoChessTaskManager.OnTick`) — 훅은 이 구간을 통과시키고, 막는 것은 정비 시작(PREPARE의 START·BEGIN, 보드 복원)과 각 상태의
    END뿐이다. 코드만 따라가면 `VoicePlayer._OnUnitBorn`(비-predefined 말)이 차례 배치 말마다 部署를 요청해야 한다; 남은 후보는 `_PlayVoice`의
    카메라 층 검사와 `Deck.SpawnCharacterOrToken`(freely) 경로가 `ON_UNIT_BORN`을 내지 않을 가능성(예전 문서의 「훅이 라운드 시작 배치 폭주를 막음」은 틀림).
    **시점**(2026-10-10 공식 클라): `MainGameInBattle._StartBattle`(MoveNext)이 먼저 `_Prebuilt`(MoveNext
 — 말을 하나씩 `Deck.SpawnCharacterOrToken`, 하나마다 `WaitForFixedSeconds(0.2)`)를 끝까지 돌린 **뒤에**
    1211을 쏘고 곧바로 웨이브 스케줄러(`Scheduler.Init`·`DoSchedule`)를 시작한다 — 部署 대사는 첫 배치가 다 떨어진 뒤(관리자가 공식 영상으로 확인
    2026-10-10: 라운드 시작에 部署 한 줄, 말은 하나씩). 2026-10-10 저녁부터 시뮬레이션이 그대로 한다(`sim.md` 「작전 시작 차례 배치」: 0.2게임초마다
    한 묶음, 마지막 뒤 한 간격에 웨이브 시계·`battleStart` 훅 — 클라이언트로 오는 전용 이벤트는 없음). 우리: 필드의 첫 배치 묶음(`audio.js` opening —
    앞 배치에서 `PREBUILT_INTERVAL`/배속 + `OPENING_SLACK_MS` 80 ms 안에 온 아군 deploy들, 장치 제외)의 배치 효과음은 각 'deploy' 이벤트 때 바로 나고,
    마지막 deploy 뒤 그만큼 더 오지 않으면(`_armBattleStartLine`, 배치마다 다시 검) `voicePolicy.battleStart`가 자기 오퍼레이터(`ownerId`, 협동 필드의
    남의 말 제외) 중 하나를 골라 部署 — 공식 1211보다 최대 80 ms 늦음(전달 흔들림 여유). 새 필드가 오면 취소, 그 대사 전까지와 그 뒤 2초 안의 배치는
    조용, 그 뒤 재배치는 部署(`_OnUnitBorn`의 비-predefined 경로). 예전: 첫 배치 순간(2026-10-10 오전), 렌더 차례 낙하 120 ms × 낙하 수 뒤
    (`OPENING_DEPLOY_STAGGER_MS`, 2026-10-10 낮 — 시뮬레이션 차례 배치와 겹쳐 지연이 두 번이 되므로 뺌).
  - **행동출발**(BATTLE_START)·**행동개시**(ENCOUNTER_ENEMY)는 **卫戍协议에서 나지 않는다**(2026-10-10 공식 클라, 사용자 제보 「작전 시작과 적 조우 대사가 겹침」):
    행동출발은 `VoicePlayer.OnGameStart`만 내는데 `_CheckDisableBattleStartVoice`가 `UIController.HasFunction(CARD_LIST)`
    거짓이면 끄고, 행동개시 `VoicePlayer._OnPreviewCursorSpawn`은 맨 앞에서 같은 `HasFunction(CARD_LIST)`가 거짓이면 바로 돌아간다.
    卫戍协议의 `AutoChessUIPlugin.OnGameInit`이 `DisableFunction(0xF07B)` — CARD_LIST(1)·CHARACTER_MENU·SYSTEM_MENU·PAUSE_BUTTON·
    SPEED_SWITCHER·BATTLE_STATUS 등 — 를 부르고(`UIController.OnGameInit`이 첫 마스크 뒤 플러그인 초기화를 부름), 이 플러그인의 `EnableFunction`은 0x80·
    0x4000·0x8000뿐이라 CARD_LIST는 다시 켜지지 않는다. 마스크를 쓰는 곳은 `_UpdateDisableMask`뿐(Enable/Disable/OnGameInit에서). 켜진 Lua 핫픽스
    (`DefinedFix.lua` zh_CN·en_US)에 관련 항목 없음. 우리: `voicePolicy.js CARD_LIST_ON = false` — `battleStart`는 部署만, `encounter`는 늘 null
    (`voice.js voiceForRoutePreview`·`screens/game.js` 'routePreview' 연결은 그대로 둠, 카드 목록이 켜진 모드라면 `cardList: true`로 예전 규칙).
    예전(2026-10-10 오전, 관리자 결정 (2026-10-10)): 매치 첫 전투 시작에 행동출발, 경로 미리보기 커서마다 행동개시 — 이 검사를 놓쳤던 것. 2026-10-06 규칙(전투마다
    행동출발, 첫 교전에 행동개시)도 같은 이유로 공식과 다름. 경로 미리보기 커서 자체(`render.md` 「적 경로 미리보기」)는 그대로.
    확인 필요: 공식 녹화에서 라운드 시작에 部署 한 줄만 나는지(MAIN 하위 상태 훅이 그것마저 막는지는 미확정).
  - 작전중 대사는 1~4 중 무작위(`SKILL_CHARWORD_TYPES`, `_PlayVoice` 점프표). 스킬 대사 유형: `VoicePlayer._OnSkillCasted` — 스킬 플래그
    `playCharWordWithPassiveType`이면 SP ≥ 10 → IMP, 아니면 NOR, 그 밖은 ACTIVE(우리 `skillVoiceType`는 skillType AUTO로 가름 — 보통 같음).
    `playCharWordVoice`가 거짓인 스킬은 무음(스킬 프리팹 `BasicSkill._playCharWordVoice` — 아래 「더빙 효과음」). 데이터의 `NORMAL_ATTACK`(5, 쿨다운 36000초, `_OnCharacterAtkOrCbt`)은 卫戍协议 연결이
    미확인이라 우리는 평타 대사가 없다. 원본 테스트는 원본 `VoiceGate` 그대로라 깨지지 않는다.
- 로컬 4 — 결산 대사는 승리 결산 화면에서만(2026-10-07, 관리자가 공식 게임 플레이로 확인): 원본은 전투가 끝날 때마다 결산 4종 중 하나를
  말하지만, 공식은 라운드가 끝나도 말하지 않고 보스를 처치한 결산 화면에서 작전 종료 대사를 말한다. 도중에 탈락한 플레이어는 말하지 않는다.
  `screens/game.js onResult`는 원본이 고른 대사(`resultVoiceSlot`, 화자 `resultSpeaker` — 자기 전투의 오퍼레이터)를 재생하지 않고
  `voice.js holdResultVoice`로 보관(마지막 전투 것이 남음, 매치를 떠나면 비움) → `screens/result.js`가 결산 화면에서 `playMatchEndVoice`:
  `victory`이고 자기가 살아 있으면 한 번 재생. 승리에 행동 실패 대사는 붙지 않는다(숨은 핵심 라운드를 진 경우) → 비3성 대사.
  서버는 마지막 전투 뒤 3초(`DELAYS.SETTLE`) 후 `m.result`를 보내므로 마지막 전투의 결과가 먼저 보관된다.
  확인: `test/local-patch.test.js` 「结算 lines wait for the won settlement」, 브라우저(game-mock 결산: 승리 1회 재생, 탈락·패배 무음).


## 스킬 효과음 (옛 「공식 전투 이펙트」 절 안에 있던 것)

- 스킬 타격 효과음 (2026-10-06, `tools/assets/kit-sfx.mjs` → manifest `audio.sfx.kit`, `public/js/audio.js kitHitKey`): 키트가 직접 주는
  스킬 피해(바둑돌, 剑气, 음표, 혼령의 그림자, 드론)는 공격 이벤트가 없어 유닛 `hit` 소리가 나지 않았다. 공식 audio_data 뱅크(전부 파일 있음)를
  키트의 fx 이벤트에 연결하고 키마다 동시 재생 제한: 望 `wang_stone1_t[damage_audio]`·`sktok_wang_2.extra.0`·`sktok_wang_3`·`wang_stone1_line_up`,
  赤刃明霄陈 S2 `ON_ABILITY_HIT.skchr_chen3_2`·S3 `projectile_chr_chen3_s3`(새 fx `kitHit`, 剑气가 적을 친 틱마다), 维什戴尔 S2 포격
  `projectile_chr_wisdel_s2`·残影 폭발 `…_s1_shock`(fx `explode`에 `by`)·혼령의 그림자 `…_token`, 丰川祥子 음표 종류별(`projectile_chr_oblvns`·
  `_talent`·`_s2`·`_s2_slow`·`_s3_phy`·`_s3_mag`, S1 `projectile_chr_oblvns_s1_hit`), 荒芜拉普兰德 S3 늑대 `…_funnel_s3`. 그리고 维什戴尔의
  일반 타격음이 없던 것(`projectile_chr_wisdel_default` — 이름 끝 `_default`를 plan.mjs가 몰랐음). 스킬 중 일반 공격의 스킬 모드
  공격·타격음은 아래 「스킬 모드 효과음·믹서 볼륨」(2026-10-07)에서 구현. 알려진 빈 곳: 荒芜拉普兰德 S1/S2 드론처럼 키트가 직접 주는 피해 중 매핑 안 된 것(드론·투사체는 2026-10-29 「스킬·재능 투사체 소리」).

- 스킬 모드 효과음·믹서 볼륨 (2026-10-07, 공식 데이터 비교 — 비공개 조사 기록):
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
  - **효과음 재생: 피치·동시 재생 상한** (2026-10-10, 공식 클라; 관리자 결정 「공식이랑 동일하게」 — 피치는 관리자가 들어 보고 그대로 두기로 함 2026-10-10):
    - 공식: `SoundFXBank.Play` — 뱅크의 소리 수가 `maxSoundAllowed`(> 0)에 차면 `popOldest`일 때 가장 오래된 것을 즉시 끊고 새 소리,
      아니면 새 소리를 버린다(0 = 상한 없음). 상한은 **뱅크 단위**(파일 단위 아님). 재생마다 `SoundFXBank.SoundFX._SetAudioChannel`이
      `pitch = RandomUtil.Range(minPitch, maxPitch)` — 소리별 데이터 범위에서 무작위(zh_CN `audio_data.json` `battle.*` 소리 12,543개 중 0.8–1.2가 8,875개,
      1.0 고정 3,024개, 0.9–1.1 452개). 유닛별·URL별 시간 간격 같은 것은 없다. 데이터의 뱅크 (popOldest, max): (true, 2) 9,950 · (false, 0) 1,977 · (true, 1) 732 …
    - 생성: `tools/assets/audio.mjs bankPlay`·`indexAudio playOf` → `skill-mode-sfx.mjs bankPlayTable` → 매니페스트 `sfx.bank[url] = [minPitch, maxPitch,
      maxSoundAllowed, popOldest]`(재생하는 파일 928개; 두 뱅크가 같은 파일을 쓰면 먼저 나온 뱅크 값). 경로로만 지정한 소리(`BATTLE_SFX` path)는 그 파일을
      내는 첫 `battle.*` 뱅크의 값.
    - 재생: `audio.js _play` — `audioOfficial.js bankPlayOf`/`playPitch`로 `playbackRate`(유니티 pitch처럼 길이도 바뀜), `SfxLimiter.acquire(뱅크 키, max, pop)`.
      뱅크 키 = 유닛 모델 + 역할(+ 스킬 번호·모드) — 같은 모델의 유닛 모두가 한 뱅크를 공유(공식 `battle.<EVENT>.<id>.<ability>`), 이름 있는 전투 소리는
      `b:<이름>`, kit 소리는 `kit:<키>`. 표에 없는 파일은 (2, popOldest), 피치 1. 스킬 루프·끊을 수 있는 한 번 재생(`startSkillLoop`)도 피치만 같은 규칙.
    - 뺀 것(공식 근거 없음): 유닛별 160 ms 간격, 같은 URL 45 ms 간격, 「URL당 2개, 넘으면 새 것을 버림」. 전체 동시 재생은 8 → 32
      [추정: 유니티 기본 real voice 수 32 — 클라 설정값은 데이터에 없음]. 사운드 항목의 `delay`(예: 텍사스 START 0.27초)는 2026-10-10부터 쓴다 —
      `delay / Time.timeScale`(전투 소리 = 배속, UI = 1)만큼 늦게 시작(아래 「공격 소리 신호」).
    - 확인: `test/local-patch-audio.test.js` 「every bank plays like the official SoundFXBank.Play」(3명이 한 뱅크 → 셋째가 가장 오래된 것을 끊음, popOldest
      false는 버림, 피치 범위·무작위), `test/ui/audio.test.js` 「SfxLimiter」. [피치: 관리자 청취 확인 2026-10-10]
  - **스킬 종료음** (2026-10-10, 공식 클라): `BasicSkill.OnSkillEnd`가 `PlayAudioAtPos('ON_SKILL_FINISH', _GenerateSignalId)` — 신호 id는
    스킬 id(스킬 데이터가 자체 신호 id를 주면 그것). 그 밖에 `OnOwnerFinish`·`_OnReceiveAttackFinishEvent`·`ToggleSkill.DoCast`도 같은 신호를 낸다;
    `ON_ABILITY_END`는 `AbilityStandard.OnCastEnd`. 데이터의 두 이름 뱅크 100개 중 우리 로스터 스킬은: 银灰 S2 b_char_tactboost,
    山(f12yin) S2 b_char_atkboost, 玛恩纳 S2·荒芜拉普兰德 S1 b_char_boostclose, 仇白 S2 p_imp_swordcutexplode(烛煌 S3의 `ON_ABILITY_END`는 루프라
    `loops`가 이미 낸다). `skill-mode-sfx.mjs skillEnds` → `sfx.units[id].ends[스킬번호] = { url, grp?, vol? }`, `audio.js`가 'skill' 꺼짐에 낸다.
    안 한 것: 丰川祥子 `ON_SKILL_FINISH.skchr_oblvns_2.1/.2`(신호 id에 번호가 붙는 경로 미확인), 공격 능력의 `ON_ABILITY_END.<id>.attack`(공격마다 끝 —
    이그제큐터 attack.2 장전음 등, 공격 끝 이벤트가 없음), 퇴장 때(`OnOwnerFinish`)의 종료음. 확인: `test/local-patch-audio.test.js` 「skill end」.
    - **끝 모드** (2026-10-29, 공식 클라 + EN 클라 버프 템플릿): 스킬 버프 템플릿의 `ON_BUFF_FINISH`(`Buff.Event` 1)에 고정 `_modeIndex` > 0인
      `SwitchMode`가 있으면 스킬이 끝날 때 그 모드로 바뀌고, 그 모드의 공격 능력이 바로 닫는 클립을 낸다(티피 S2 `tippi_s_2[switch_mode]` → 모드 6
      `S2_Landing`, 공격 능력 `_allowNoTarget`·`Skill_2_End`; 르무엔 S3 `lemuen_s_3` → 모드 4 `S3_End`, `Skill_3_End` = 포격 신호). 그 모드
      신호의 START 뱅크가 종료음이다: 티피 S1·S2 `attack.3`/`attack.6` `p_skill_pmtjtckdw`(Battle_Skill_Important), 르무엔 S3 `attack.4`
      `p_atk_lmwlcrstrst_s`; 이 모드 기물이 안 쓰는 스킬도 같이 실림(이그제큐터 디 엑스 포에데레 S3 `attack.4` `p_atk_bngel` — HIT `p_imp_bngel`은 안 냄,
      스와이어 더 엘리건트 위트 S3 `attack.4`). 추출: `char_modes.py skill_end_modes`(`config/buff_template_holder.ab`) → `local-char-modes.json`
      `skillEnd[스킬]`; 생성: `skillEnds`(자기 `ON_SKILL_FINISH`/`ON_ABILITY_END`가 없을 때만, `ends[i].mode` 1). 재생: 같은 이벤트 묶음에 그 유닛의
      `'die'`(쓰러짐·퇴장)가 있으면 안 낸다(죽은 유닛은 그 모드의 능력을 못 씀). EN 템플릿에 없는 안젤리나 더 멜로우 위시(`S1/S2/S3_Landing`
      `attack.6/7/9` `p_atk_arstrnstfld`)는 안 실림. 확인: `test/audio-skill-end-modes.test.js`. [화면 미확인]
  - 확인: `test/local-patch-audio.test.js` 8개, 전 오퍼레이터×스킬 시뮬+AudioManager 일괄(강제 시전 시 207개 중 185개에서 전용 소리 — 나머지 22개는
    피해를 키트가 직접 주는 스킬: 드론·음표·늑대·치유), 디버그 아레나(阿斯卡纶 S1/S3, 维什戴尔 S3, 赤刃明霄陈 S3 — 검기 타격 `p_imp_hljdswdlng_s`).
    새 효과음 220개(2.4MB)는 `npm run assets`(`fetch-assets`)가 받는다.
  - 스킬 루프음 (2026-10-07, 관리자 제보): 공식 뱅크 중 `loop: true`인 스킬 소리 — 丰川祥子 S3
    `ON_BUFF_START.oblvns_s_3[loop]`(`p_atk_MJCkyrdslnt_lp`, 공식 데이터에 스킬용 BGM 전환은 없음), 장판 `ON_ABILITY_START.skchr_lisa_3` /
    `ON_SKILL_START.skchr_cello_3` 등 풀 17명 — 를 `skill-mode-sfx.mjs skillLoops`가 `sfx.units[id].loops[스킬번호] = { url, grp, vol, start }`로
    싣고(`audio.mjs indexAudio` `loopBanks`), `audioOfficial.js startSkillLoop`가 스킬 동안 반복 재생(그룹 게인 × 볼륨, sfx 채널), 스킬 끝·퇴장·
    새 필드에서 0.25초 페이드아웃. `start`(시작 뱅크 자체가 루프: 铃兰·角峰 등)면 한 번짜리 시작음은 내지 않는다. 같은 제보로: 丰川祥子 S3의
    시작음(`ON_CUSTOM_TRIGGER.skchr_oblvns_3[start]`)이 `deferStart`(공격 능력 소리만 해당)에 잘못 걸려 거의 안 나던 것 수정
    (`skill-sfx.mjs skillStartIsFallback`: 커스텀 시작 트리거는 진짜 시작음). `/debug.html` 일시정지는 AudioContext도 멈춘다(루프가 계속 울리지 않게).
    전투가 끝날 때 켜져 있던 스킬은 'skill' 꺼짐·'die'가 안 오므로, 국면이 전투(COMBAT·UNITE·FINAL_ASSAULT·HIDDEN_CORE) 밖으로 나가면(结算 = 클라
    전투 정지) 잡아 둔 소리를 전부 끊는다(`installAudio`; 관리자 제보 2026-10-10: 薄绿 장판 루프 `p_field_magloop`가 휴식 페이즈에도 계속 남).

  - **평타는 Default 모드 소리만** (관리자 제보 2026-10-07): `tools/assets/skill-mode-sfx.mjs defaultModeBanks` — 모드 정보가 있는
    오퍼레이터는 스킬 모드 번호의 `ON_ABILITY_*.attack|combat.<n>` 뱅크를 평타 후보에서 뺀다(银灰 S3 `p_atk_silver_n`, 号角 S2 포격 시전음, 丰川祥子 S3,
    圣约送葬人 S3_End, 雷蛇 S2가 평타마다 나던 누수). `.0…`(Default `_includeIndexZero`)은 파일 접미사와 상관없이 Default 것(`audio.mjs pickUnitSfx opts.defaultZero`
    — 丰川祥子 `p_atk_mjckyrdnt_h`). Default 투사체(charpack `_projectileKey`, 银灰 `projectile_svrash`)의 BORN/HIT/REACH를 이름 추측보다 먼저(prove·slchan·
    skgoat·vodfox·leizi·rosmon에 타격음이 생김). Default에 공격 뱅크도 투사체 뱅크도 없는 玛恩纳·蜜蜡·薄绿·卡涅利安·圣聆初雪(sbell2)의 평타는 **무음**
    (2026-10-10, 공식 클라: 신호 id = `UnitMode.GenerateSignalId` — Default는 `.attack`/`.attack.0`, 미들웨어 `TorappuAudioMiddleware.PlayEvent`
는 이름이 맞는 뱅크만 내고 접미사를 떼어 다시 찾지 않음; 다섯 명 모두 그 뱅크·`bankAlias`·Default 투사체가 없음). 예전에 남기던 스킬 모드
    `_n` 파일 예외는 뺐다(`defaultModeBanks`).
  - **르무엔 S3 효과음** (관리자 제보 2026-10-07): `kit-sfx.mjs KIT_HIT_BANKS` `lemuen:mark` = `ON_BUFF_SHOW_EFFECT.char_lemuen_range_aim`(S3 'lock'마다), `lemuen:s3end` =
    `ON_ABILITY_START.char_4193_lemuen.attack.4`(S3_End 모드, 첫 'bombardShell' i 0), `lemuen:shell` = `ON_PROJECTILE_REACH.projectile_chr_lemuen_s3_attack`('bombard'마다),
    `audio.js kitHitKey` 3줄. `lemuen_s3_audio_triggered`(p_atk_lmwlcrstr_s)는 시점이 불확실해 뺐다.
  - **kit 소리 동시 재생 = 공식 popOldest**: kit 뱅크 22개는 공식에서 모두 `popOldest true`, 상한(`maxSoundAllowed`) 1–3. plan이 `kit-sfx.mjs kitHitLimits`로
    `audio.sfx.kitLimit[key] = { max, pop }`에 싣고(`audio.mjs indexAudio limitOf`), 상한에 차면 가장 오래된 것을 끊고 새 소리를 낸다(르무엔 착탄 5발 모두 —
    예전엔 셋째부터 빠짐). 2026-10-10부터 모든 소리가 같은 규칙(위 「효과음 재생: 피치·동시 재생 상한」, `sfx.bank`; `kitLimit`은 표에 없을 때의 대체).
  - 확인: `test/local-patch-audio.test.js` +6(수정 전 실패 확인), 매니페스트 diff(위 오퍼레이터만), Chrome Web Audio 계측(银灰 발동 전 평타
    `p_imp_spear_n`만, 르무엔 mark 5·s3end 1·shell 5). 새 sfx 3개(`p_imp_lmwlcrstrmk`, `p_atk_lmwlcrstrst_s`, `p_imp_lmwlcrstr_s`).
    로컬 재생성 때 매니페스트 키가 10개 줄어 `fetch-assets --allow-shrink`.
  - **스킬 특수 음악·대역 전환·모드 타격음** (관리자 제보 2026-10-08; 비공개 조사 기록):
    - 원인(데이터로 확인): plan은 스킬마다 시작음 1개(`skills[i]`)·`loop: true` 뱅크 1개(`loops[i]`)·모드 공격음만 실었다. 공식은 그 밖의 뱅크도 낸다 —
      耀骑士临光 S3 `ON_SKILL_START` b_char_atkboost **+** `ON_ABILITY_START.skchr_nearl2_3` p_skill_goldspearboost1(5.8 초), 塑心 S3 루프
      p_skill_thrill_loop(Battle_P_Field 0.267, 이미 나고 있었음) **+** `ON_ABILITY_START.skchr_cello_3` p_skill_shphrtcltrill **+** 음악
      `ON_BUFF_START.cello_s_3[audio]` p_skill_shphrtcltrillmelody(20.4 초, `ON_SKILL_FINISH.skchr_cello_3` ctrlStop 0.2 초). 塑心은 재생 조건이 아니라 이 두 뱅크가 없었다.
    - `tools/assets/skill-mode-sfx.mjs skillExtras` → `sfx.units[id].extras[i] = [{ url, grp?, vol?, stop? }]`: ① 스킬 자신의 `ON_ABILITY_START.<skillId>`
      (Skill_Important·UI_Boost·P_Field 그룹, 시작음과 다르고 공용 `battle/b_char/*` 아님), ② `ON_SKILL_FINISH|ON_ABILITY_END.<skillId>` ctrlStop이 끊는 뱅크(`stop` =
      그 페이드). [추정] ①은 스킬 시작 순간(대상 15명 모두 「立即…」·시전형). `audio.mjs indexAudio`에 `ctrlStops`·`isLoop`. `skillLoops`는 `ON_ABILITY_END`도 본다
      (烛煌 S3 장판 루프 p_skill_hcnsrfrfld — 빠진 루프는 이것 하나). 새로 생긴 extras: nearl2 S2/S3, cello S3, blaze2 S3, mostma S2(stop 0.7)/S3, gnosis S3,
      mudrok S3, archet S2, surtr S3, bubble S2, sunbr S2, cetsyr S3, rmixer S2, blemsh S3, pasngr S3.
    - `audioOfficial.js startSkillLoop(…, { loop: false, fade })`(끊을 수 있는 한 번 재생), `stopUnitLoops`, `skillExtrasOf`; `audio.js`가 'skill' 켜짐에 extras를
      내고(stop 있는 것은 키 `<id>:x<k>`로 잡아 두고 꺼짐에 끊음), 'die'는 그 유닛의 루프·잡아 둔 소리 전부를 끊는다.
    - 归溟幽灵鲨 S2 종료 후 대역 전환: S2 끝 → <替身> 전환(sim fx 'substitute', professions.js installDollkeeper)의 공식 뱅크 —
      `ON_BUFF_START.ghost2_switch2stand` p_skill_sharpstandborn, `ON_BUFF_SHOW_EFFECT.ghost2_standin[switch]` p_skill_sharpstandspell(11.6 초, ctrlStop
      `ghost2_stand_effect_end` 0.8 초), 본체 복귀(fx 'swap') `ghost2_switch2normal` p_skill_sharpborn. `kit-sfx.mjs` 키 `ghost2:stand|standin|normal`,
      `audioOfficial.js dollSwitchSfx`(오퍼별 표), `audio.js _dollSwitch`. [추정] standin은 전환과 함께 나고 본체 복귀·퇴장·替身 격파에 끊는다(버프 타이밍은 네이티브).
      스냅샷은 아래 「믹서 스냅샷」.
    - **믹서 스냅샷** (2026-10-08): 공식 `snapshotBanks`는 훅 뱅크가 날 때 `MainMixer` 스냅샷을 켠다 — 게임 데이터의 훅은 모두
      `AllLowpass_Reverb`: 归溟幽灵鲨 `ON_BUFF_START.ghost2_switch2stand`(5 초), 浊心斯卡蒂 배치·S1–S3 시작(0.1 초; `@KR`·`@JP` 더빙 사본도 같은 스냅샷 — 아래 「더빙 효과음」).
      스냅샷 값(EN `sharedassets1.assets` 믹서 상수, Default와 비교 **[데이터]**): BattleGameSound(Music·Voice·전투 그룹 전부의 부모) Lowpass 22000 → 556 Hz,
      SFX Reverb 켜짐(dry −6696 mB, room 0, room HF −1594 mB, decay 5.7 초, reverb −219 mB, reverb delay 0.0464 초), Music Lowpass 22000 → 5000 Hz.
      훅 뱅크 자신은 `Independent` 그룹(BattleGameSound 밖)이라 또렷하게 남고 나머지가 가라앉는다.
      - 생성: `audio.mjs indexAudio` `snapshots`, `skill-mode-sfx.mjs snapshotSfx` → `sfx.snap = { hook: { url: { snap, dur, delay? } }, outside: [url] }`
        (outside = 매니페스트에서 Independent 그룹인 파일 6개: 훅들 + 대역 sharpstandspell). 매니페스트 diff는 `snap`·hash뿐.
      - 재생: `public/js/audioSnapshot.js`. `audio.js unlock`이 세 채널을 `bus`(BattleGameSound)로 모아 master에 잇고, `sfxOutside`는 bus를 건너뛴다
        (`sfx.snap.outside`와 UI 한 번 소리 — SFX_UI도 bus 밖). 첫 훅에서 bus → lowpass → dry → master, lowpass → convolver(5.7 초 감쇠 잡음, 46 ms 지연) → wet → master를 만든다.
        리버브는 꼬리가 끝나면 입력을 끊는다(convolver 비용).
      - 시점 규칙(2026-10-11 공식 클라 `Torappu.Audio.Middleware.Data.SnapshotBank`, 필드 delay·duration): `SnapshotBank.Play`가 활성 목록
        `s_activeSnapshotBank`의 맨 뒤에 넣고(이미 있으면 빼서 다시) `AudioManager.TransitionToSnapshot(targetSnapshot, duration, delay)` — `duration`은
        **전환 시간**(유지 시간 아님), `delay`는 켤 때만. `SnapshotAudioAtom.Update`는 훅 뱅크의 소리가 하나라도 난 뒤 그 뱅크의 소리가
        **모두** 끝나면 `ReverseSnapshot`: 목록에서 빼고 남은 뱅크가 있으면 마지막 것의 스냅샷으로, 없으면 `Default`로, **끝나는 뱅크의
        duration**·지연 0. 우리(`audioSnapshot.js holdSnapshot`): 훅이 시작되면 `delay` 뒤 `dur` 초 전환, 훅 소리가 하나라도 남아 있으면 유지(데이터의 훅은
        모두 `AllLowpass_Reverb`라 「남은 뱅크의 스냅샷으로」 = 유지), 마지막 훅이 끝나면 그 훅의 `dur`로 Default(지연 없음 — 켜는 지연이 아직 안 지났으면
        그 시각부터). 예전 [추정]과 같은 결과. 리버브는 초기 반사 없는 평탄한 잡음 꼬리. 안 한 것: Music 자체 5000 Hz(556 Hz 안쪽이라 차이 없음), 스냅샷의 그룹 볼륨 차이(몇 dB, 옛 레벨이 남은 것으로 보임).
      - **START·ON·HIT** (관리자 제보 2026-10-08 「휘두름 + 타격」, 2026-10-10 공식 클라로 바꿈): 신호는 시점마다 따로 나간다 — START(능력 시작),
        ON(`AbilityStandard.DoEmitAudioSignalForSpellOn`, 공격 판정 순간), HIT(`DoEmitAudioSignalForHit`, 대상에) — 그리고
        미들웨어(`TorappuAudioMiddleware.PlayEvent`)는 이름이 맞는 뱅크를 모두 낸다. 뱅크끼리 서로 막는 코드가 없으므로 START와 ON 뱅크가 둘 다
        있으면 **둘 다** 난다(ON의 믹서 그룹과 무관). 예외 `onlyTrigAudioSignalForFirstSpell/FirstHit`(기본 거짓)은 안 다룸.
        생성: `audio.mjs pickUnitSfx`(평타)·`skill-mode-sfx.mjs modeSounds`/`abilitySounds`(스킬 모드)가 START 뱅크 옆의 ON 뱅크를 새 역할 `on`으로(`onBeside`),
        재생: `audio.js`가 'atk'에서 `attack`과 함께 `on`(실행 중 모드에 자체 공격음이 있으면 그 모드의 `on`만 — `audioOfficial.js modeOn`). ON은 START가 없을 때만
        `attack`으로 쓰는 대체가 아니다. 2026-10-08에 「타격 그룹 ON = 타격음(`hit`, 'dmg' 시각)」으로 넣었던 `onImpact`는 폐기 — 그 7개(耀骑士临光 S3,
        归溟幽灵鲨 S3, 夕 S2·S3, 卡涅利安 S1–S3)와 평타(夕·莫斯提马·水月·野鬃)의 ON은 이제 `on`(공격 순간), 그 모드들은 HIT 뱅크가 없어 `noHit`.
        새로 `on`이 생긴 것: 오퍼레이터 16명 평타 + 26개 스킬 모드(阿斯卡纶 p_atk_smksndrtspd_*, 灰毫 등)와 적 19종. 새 sfx 44개(fetch-assets).
        S3 발동 순간의 소리(b_char_atkboost·p_skill_goldspearboost1·耀阳 검 탄생 p_skill_goldspearset)는 그대로.
        확인: `test/local-patch-skill-impact.test.js` 3개(실제 매치 경로: 耀骑士临光 S3 공격마다 휘두름 + ON). [실제 판 이상 없음 2026-10-28]
      - 耀骑士临光 S2: S2는 `kind: 'duration', activateOnDeploy`라 'skill'이 'spawn'보다 먼저 오고,
        배치 전 'skill' 잡아 두기(아래 缄默德克萨斯 ①)로 `p_skill_goldspearboost`가 난다(실제 경로 테스트로 고정).
      - 확인: `test/local-patch-skill-snapshot.test.js` 6개(매니페스트, 공식 데이터 규칙, 가짜 Web Audio 그래프의 램프 556 Hz/5 초·복귀·bus 밖 경로, 실제 매치 경로
        归溟幽灵鲨 S2 → 대역 → 스냅샷 켜짐, 耀骑士临光 S2 배치 소리). [실제 판 이상 없음 2026-10-28] 새 소리 파일 없음.
    - 缄默德克萨斯 S2 타격음: ① 배치 즉시 켜지는 스킬(`activateOnDeploy`: S1–S3)은 'skill'이 그 유닛의 'spawn'보다 먼저 와서(실제 경로 확인) 오디오가 버렸다 →
      `audio.js`가 추적 전 유닛의 'skill'을 잡아 두었다가 'spawn'(같은 묶음에 'deploy'가 있으면 그 'deploy')에서 처리, `screens/game.js` 작전 시작 early 버퍼도 'skill'을
      넘긴다(1줄). ② 모드 능력에 공격 뱅크만 있고 HIT 뱅크가 없으면(S2 `attack.2`는 `ON_ABILITY_ON` p_imp_reticentsword_h뿐) Default의 HIT(p_atk_reticentsword_n)는
      나지 않는다 → `skillModes`가 `noHit: true`, `audio.js unit()`이 그 모드의 타격음을 비운다. 실제로 바뀐 오퍼: texas2 S2, ghost2 S2/S3, gvial2 S2, svash2 S3,
      whitew S2, rosmon S2/S3, pepe S3, mlynar S2/S3(나머지 16명은 Default 타격음이 원래 없음). [추정] 뱅크가 없으면 무음(클라이언트 재생 코드는 네이티브).
    - 확인: `test/local-patch-skill-music.test.js` 6개(수정 전 6개 모두 실패 확인 — 실제 경로 Match → buildBattleSpec → createBattleFromSpec 이벤트를 AudioManager에),
      Chrome Web Audio 계측(AudioBufferSourceNode start/stop을 파일 이름으로): 디버그 아레나 nearl2 S3·cello S3·ghost2 S2·texas2 S2,
      실제 솔로 판(로드아웃 + 재화 고정 + 상점 리롤로 구매) texas2 S2·ghost2 S2. cello·nearl2(6성)는 상점에 안 나와 실제 판 확인 못 함. 새 sfx 21개.

## 더빙 효과음 — 浊心斯卡蒂 (2026-10-16, 관리자 제보 「S3 대사가 안 나옴 / 효과음에 묻힘」)

- 증상: S3 「潮涌，潮枯」 시작에 바다 효과음(`p_skill_tidesurging`, 12.8 초, Independent 그룹)이 또렷하고, 같은 때의 작전중 대사가 먹먹하게 묻혔다.
  그 시작음이 `AllLowpass_Reverb` 스냅샷을 켜고(위 「믹서 스냅샷」, 2026-10-08부터), 대사 채널은 BattleGameSound 아래라 556 Hz 로우패스·리버브를 받았다.
- 공식 [공식 클라 + 데이터, 2026-10-16]:
  - 믹서 트리(EN `sharedassets1.assets` MainMixer): Master → BattleGameSound → ~Voice_VolumeControl → Voice / UI_Vox — 대사 채널은 공식도
    스냅샷 아래이고, `AllLowpass_Reverb`에서 Voice 그룹은 −0.33 → −5.72 dB로 더 작아진다. 「대사만 필터 밖으로」는 공식이 아니다.
  - 스킬 대사가 없다: S1–S3 스킬 프리팹(`battle/prefabs/[uc]skills.ab`)의 `BasicSkill._playCharWordVoice`가 0 → `VoicePlayer._OnSkillCasted`가
    작전중 대사를 내지 않는다. 풀 285개 스킬 중 이 셋뿐.
  - 대신 소리 뱅크를 더빙판으로 바꾼다: `BattleController.PlayAudioAtPos`가 `VoiceLangManager.TryHookAudioByFxLang`이 참이면
    신호를 그 결과로 바꿔 **그것 하나만** `PlayEvent`. 표는 `audio_data.json soundFxVoiceLang`:
    뱅크 → 캐릭터 → 더빙(JP·KR·EN·CN_MANDARIN) → 뱅크. 浊心斯卡蒂 `ON_SKILL_START.skchr_skadi2_N` → `…@KR` = `Voice_KR/char_1012_skadi2/FX_025_N`…`FX_028_N`
    (가중치 25씩 넷), `ON_UNIT_BORN.char_1012_skadi2` → `FX_023`/`FX_024`. 파일은 시작음·배치음과 길이가 같고 내용이 다르다 — 효과음에 그 대사(작전중1–4,
    部署1–2)를 섞은 것. 그룹 Independent(스냅샷 밖), 그 자신이 스냅샷 훅(snapshotBanks에 `@` 사본 전부). 정비 배치도 같은 길(`PlayAudioSignal` → `PlayAudioAtPos`).
    표의 다른 항목(空 `char_101_sora`, 伊桑 `char_355_ethan` 배치음)은 우리 풀에 없다.
- 우리:
  - 생성: `audio.mjs indexAudio` `dubsOf`·`snapshotOf`(`@` 사본 포함), `skill-mode-sfx.mjs dubbedSfx` → `sfx.units[id].dub = { kr|jp: { born?, skills?: { [번호]: e } } }`,
    e = `{ url: [한 줄씩], grp }`; 파일은 `audio/voice/<lang>/<charId>/fx_0NN[_N].mp3`(`plan.mjs dubLeaf`, 원천 `sound_beta_2/voice_kr/`·`voice/`) — 미리 받기는
    고른 언어만(`voice.js voiceWanted`). `snapshotSfx`가 그 파일들을 `snap.hook`·`snap.outside`에, `sfx.bank`에 그 뱅크 값(피치 1, 둘까지, 오래된 것 끊음). 28개.
  - 재생: `audio.js unitDub` — 설정의 음성 언어(`audio.voiceLang`, `voice.js`)가 한국어/일본어면 시작음(`unit()` 'skill')·배치음(`playDeploySfx`) 대신
    그 더빙판 한 줄(무작위). 음성 「끄기」면 기본 효과음(공식에 없는 설정 — 대사 없는 쪽).
  - 스킬 대사: `skill_cast.py`가 `_playCharWordVoice` 0인 스킬에 `word: 0` → `build-data.mjs skillSilent` → 스킬 기록 `charWord: false` →
    `voicePolicy.skill()`이 `slot: null`(대사 없음).
- 확인: `test/audio-dub.test.js` 7개(공식 audio_data 생성 규칙, 매니페스트, unitDub, 대사 규칙, 실제 매치 경로 S3: 더빙판 한 줄이 bus 밖 + 스냅샷 + 대사 채널 무음,
  음성 끄기면 바다 효과음, 배치). [브라우저 미확인: Chrome에서 들어 보기]

## 공격 소리 신호 (2026-10-10, 공식 클라 + 프리팹 값; 관리자 결정 (2026-10-10) 「공식이랑 동일하게」)
- 공식: 공격 소리는 그 능력의 **신호 id** 이름의 뱅크다 — `battle.ON_ABILITY_START|ON|HIT.<유닛 id>.<신호>`. 신호 = 모드의 `attack`(Body/Attack, 다른
  이름의 Body 능력 하나뿐이면 그것)·`combat`(Body/Combat) + 모드가 `_addIndexToSignalId`면 `.<모드 순번>`(0번은 `_includeIndexZero`일 때만;
  공식 클라 `UnitMode.GenerateSignalId`). 그래서 텍사스 디 오메르토사 S1·S3, 마운틴 S3 등은 Default와 같은 `.attack` 뱅크를 쓴다.
  - 묶음 능력의 자식은 `.<i+1>`(`AbilityRandomGroup.DoSetData`): **Random**(`_selectMethod` 0)은 공격마다 하나를 고르고
    (`_diffFromLastOneIfNotFirst` = 직전과 다르게, `_selectAllAtLeastOnce` = 한 바퀴 다 돈 뒤 반복), **Loop**(1)는 차례로, 조건 묶음(`_abilityConfigs`)은 조건이
    맞는 첫 자식(우리: 이름으로 — 근접 타격이면 `Melee…`, 원거리면 `Common`/`Ranged…`, 모드 첫 공격이면 `First…` [추정: 조건 자체는 안 읽음]),
    `_mainAbility` 묶음은 자식 모두. 실버애쉬 더 레인프로스트·위셔델 평타 `attack.0.1–0.3`, 아스카론 `.0.1/.0.2`, 혼·애쉬락 근접/원거리 자식,
    마운틴 평타 `attack.1–3`(자식 1은 뱅크 없음 → 그 공격은 무음), 플레임테일 `attack.2/3`(조사 때 「모드 번호와 안 맞는 뱅크」였던 것) 등.
  - 연타 공격(`MultiMeleeAttack`)은 ON/HIT 신호 끝에 회차(`_addSpellCntToAllSignalId`/`…LastSignalId`/`…AllHitSignalId`, 0부터):
    첸 더 던스트릭 S1 HIT `attack.1.0`/`.1.1`.
  - 시점: START = 휘두름 시작(`AbilityStandard.OnCastStart`), ON = 공격 판정 순간(주문마다 한 번, 대상마다가 아님), HIT = 대상마다,
    투사체는 BORN = 발사(판정 순간), HIT·REACH = 착탄. 미들웨어는 이름이 맞는 뱅크를 모두 낸다(위 「START·ON·HIT」). 뱅크에 파일이 여럿이면
    가중 무작위 하나(`SoundFXBank._GenerateWeightedRandomSound` — 빈 에셋 몫은 무음), 소리마다 `delay / Time.timeScale` 뒤에 시작(`SoundFXBank.Play`
).
- 추출: `tools/local-extract/char_audio.py` → `tools/assets/local-char-audio.json`(커밋, 오퍼레이터·소환물·적 396종: 모드별 `sig`, 공격 능력 묶음 `ab`,
  능력·자식별 투사체, 스킬 프리팹 투사체 `skillProj`, 적 `Skills/<이름>`의 투사체). 클라 업데이트 때 다시 실행(약 20초, PersistentData 먼저).
- 생성: `tools/assets/skill-mode-sfx.mjs soundSet` → 매니페스트 `sfx.units[id].cues`/`sel`(Default)과 `modes[스킬].cues`/`sel`:
  큐 = `{ at: 's'|'a'|'d', u, g?, v?, p?, dl?, or?, ab?, k?, sp? }`(휘두름/타격/착탄, 소리, 믹서 그룹, 뱅크 볼륨, 재생 확률, 지연, 여러 파일, 능력, 자식, 회차).
  - 모드가 있는 스킬은 그 모드의 신호 — 뱅크도 소리 나는 투사체도 없으면 `cues: []` = **그 스킬 중 공격은 무음**(관리자 결정 (2026-10-10); 미들웨어에 대체 경로 없음 —
    사리아 S3, 마운틴 S2·S3, 첸 더 던스트릭 S2, 캐서린 S2, 스카디 더 커럽팅 하트 S1–S3 등 20개. 예전에는 Default 소리가 났다).
  - 모드 없는 스킬은 자기 능력 `ON_ABILITY_*.<skillId>`의 **모든** 하위 키(예전 고정 목록 `'' .0 .1 .2 .0.1 .1.0` 대신; 혼 S1 `.2.1`, 데겐블레허 S3
    `.1.1`/`.2`/`.extra.0`; 공격·타격 믹서 그룹만 — `abilityCues`).
  - 파일 이름 거름(`_d/_h/_s` = 스킬 모드 파일)은 큐에는 안 쓴다(신호로 Default를 정확히 알므로: 라플란드 더 데카덴차 평타 착탄 `p_imp_whtolfdrksl_d`,
    토가와 사키코 ON `_h`). 큐가 없는 유닛(추출본 없음)만 예전 역할(`attack`/`on`/`hit`)과 거름 — 그 필드는 디버그 화면·이전 경로용으로 남김.
  - 스킬 피해 착탄 `kd[스킬]`(`skillHitCues`): 스킬 프리팹 투사체의 HIT·REACH, 그다음 스킬 능력 HIT.
  - 스파인 이벤트 `spine[이벤트]`(`ON_SPINE_EVENT_TRIGGER.<id>.<이벤트>`: 마운틴 S2·S3 주먹, 파투스 `Attact_1`·`Skill_1`, 필라에 `philae_shield`).
  - 소환물: 자기 `Default` 모드(유동체는 모드 1)의 큐 + `data/tokens.json` 스킬의 시작음. 새 효과음 194개(2.4 MB, `fetch-assets --add-only`).
- 재생(`public/js/audio.js`, `audioOfficial.js cueSetOf/pickVariant/cuesAt/cueFile`): sim `'swing'`에서 자식을 고르고 START, 그 휘두름의 `'atk'`에서
  ON·BORN(같은 순간의 여러 대상 `'atk'`은 한 번), `'dmg'`에서 HIT·REACH(회차는 휘두름마다 0부터). 휘두름 없는 `'atk'`(kit 공격)은 그때 START도.
  근접(`'none'`)이면 `combat`, 원거리면 `attack`(둘 다 있을 때 — 이네스·치우바이·라플란드). 큐가 있으면 예전 역할 경로(`unit()`)는 안 탄다.
  - `'dmg'`의 공격자(sim 계약: 튜플 6번째, `docs/SIM.md`): 그 공격자가 이 대상에 낸 평타면 그 착탄, 같은 순간(0.1초)의 다른 대상은 스플래시로 착탄,
    아니면 **스킬 자체 피해**(kit `dealDamage`) — 스킬 중이면 `kd[스킬]` 첫 소리(없으면 모드 착탄). `sfx.kit`으로 이미 소리 내는 kit(望·첸 더 던스트릭·
    위셔델·토가와 사키코·라플란드 더 데카덴차·르무엔·스펙터 디 언체인드)은 빼고, 공격자마다 0.12초에 한 번 [추정: 지속 피해 틱은 공식 착탄 신호가 아님].
    공격자가 없는 `'dmg'`(옛 sim)는 예전처럼 「2.5초 안에 그 대상을 겨눈 'atk'」.
  - 지연 ÷ 배속: `audio.setGameSpeed(x)`가 있으면 그 값, 없으면 휘두름 → 첫 타격의 실제 간격으로 잰 값, 그것도 없으면 2 [추정].
  - 스파인 이벤트 (2026-10-10 저녁, 2026-10-22 고침): 공식은 `SpineAnimator._OnEvent`가 이벤트 **이름**이 오디오 이벤트
    (`AnimationConsts` `OnPlayAudio`·`OnPlayAudio_1~3`)일 때만 그 이벤트의 **문자열 값**(Spine `Event.String`)을 `_PlayBattleAudio`
    (빈 문자열이면 없음)에 넘기고, 이것이 신호 `<엔티티 id>.<문자열>`로 `ON_SPINE_EVENT_TRIGGER`를 낸다(뱅크가 있는 것만 소리).
    매니페스트 `spine` 키(마운틴 `Skill_2_1`…`Skill_3_2`, 필라에 `philae_shield`, 파투스 `Attact_1`·`Skill_1`, 적 13종)는 모두 모델의 `OnPlayAudio`
    문자열 값이다(`test/audio-skill-hit-signals.test.js`가 모델 파일로 고정). 2026-10-22 전에는 이벤트 이름(`OnPlayAudio`)을 넘겨 모델이 그려진
    유닛에서는 이 소리가 하나도 나지 않았다(관리자 제보 「마운틴 S3 타격음 없음」; 모델 없는 유닛의 대체음만 났음). 우리: `render/spine.js`의
    AnimationState 리스너(`SpineActor.onEvent(이름, 문자열)`) → `render/units.js`(모델이 만들어지면 `spineEvent(id, null)`로 「이 유닛은 이벤트를 보고함」을
    먼저 알림) → `render/app.js` ctx `spineEvent`(전투 화면만, 정탐 보드·적 미리보기 제외) → `audio.spineEvent(unitId, 이름, 문자열)`. [화면 미확인] 이벤트를 보고하는 유닛은 대체음이 없고, 모델이 없는 유닛(마름모·혼잡한 저품질 필드)만
    스킬 k 중 타격마다 `Skill_<k>_<n>`을 차례로, 평소엔 `Attack_<n>`/`Attact_<n>`을 대신 낸다(유닛마다 — 예전에는 아무 이벤트 하나로 전체가 꺼졌다)
    [추정: 대체음 시점 = 타격]. 적도 `spine`(신호 `battle.ON_SPINE_EVENT_TRIGGER.<적 id>.<이벤트>`, 변형 `_2`는 자기 id 먼저 — 14종).
- **스킬 중 바뀌는 모드** (2026-10-29, 공식 클라 + EN 클라 버프 템플릿): 스킬이 도는 중에 버프가 모드를 한 번 더 바꾸면 그 뒤 공격은 그 모드의 신호다 —
  위셔델 S2 과부하(`wisdel_s_2[overload_start]` → 모드 2 `S2_Overload`: ON `attack.2` `p_atk_dkmrcaygnfrh_h`, 착탄은 S2와 같은 투사체 `_h`),
  울피아누스 S3 닻 뒤(`ulpia_s3_switch_mode[born]`: 닻 자리에서 다시 태어날 때 — 옮겨 가든 제자리든 — 모드 3 `S3_Respawn_A`: START `attack.3`
  `p_atk_wtrbatnchr`·HIT `p_imp_wtrbatnchr`, Battle_P_SAtk/SImp; 모드 2 `S3`의 `attack.2`는 평타와 같은 `_n`). 표 `shared/skill-modes.js
  SKILL_SUB_MODES`(오퍼레이터 → sim fx 종류 → 모드 이름: 'wisdelOverload'·'anchor') → 생성 `modes[스킬].sub[fx] = { cues, sel? }` → 재생: 그 스킬 중
  그 fx가 오면 스킬이 끝날 때까지 `cueSetOf(entry, 스킬, sub)`. sim 이벤트는 그대로(golden 무변화). 확인: `test/audio-skill-end-modes.test.js`. [화면 미확인]
- 묶음 E(2026-10-29, 「모드 공격 뱅크 미사용」 7명) 중 할 것 없음: 이그제큐터 디 엑스 포에데레 `attack.4`(S3_End — 이 모드 기물은 S2), 그의
  `ON_BUFF_START.excu2_multi_attack[audio]`/`[s3][audio]`(그 버프 키를 만드는 곳이 EN 클라 캐릭터·스킬 프리팹·버프 템플릿 어디에도 없음 — 재능 추가 사격은
  `T.1` `p_atk_shotgunxdouble`로 이미 남, 아래 「재능·소환물 능력 소리」), 미니멀리스트 `attack.1`(`_d`: 그녀의 `_modes`는 Default 하나이고 그 신호는
  `.attack` — `attack.1`을 내는 모드·자식이 없음; S2는 자기 능력 `skchr_malist_2` `_h`), 엑시아 더 뉴 커버넌트 `attack.5.Burst`(S1 모드 — 기물은 S2),
  혼 `attack.1.Burst.*`(아래).
- 혼 S2 `Full Burst`(`attack.1.Burst.1–3`)는 **수동으로 끌 때** 남은 탄을 모두 쏘는 능력이다(skill_table skchr_horn_2: 「主动关闭时发射剩余全部弹药」) —
  卫戍协议 자동 전투에는 수동 종료가 없어(`ON_SKILL_SPECIAL_POINT`와 같은 이유) 안 낸다.
- 안 한 것: 재능 투사체(재능 능력·스킬 투사체 BORN·소환물 모드는 아래 「재능·소환물 능력 소리」, 2026-10-11), 스노우헌터 장전(`Reload` 자식 — sim에 탄수 없음), 아래 「버프·커스텀 트리거 소리」의 「안 한 것」. `ON_SKILL_SPECIAL_POINT`는 수동으로 스킬을 끊을 때(`CastSkillWithLimitTimes.DiscardRemainingCountInternal` —
  `_canDiscardRemainingCount`, 그 밖에 `CastSkillWithSuspendable.TriggerSpecialAudioSignal`·`ToggleSkillWithEndAnimation.PlayBeginEffectAndAudio`)라
  卫戍协议에는 그 순간이 없다 — 안 낸다. 우리 sim의 영주(치우바이·라플란드 등)는 항상 원거리로 쏴서 근접 `combat` 소리는 실제로는 거의 안 난다(sim 쪽).
- 확인: `test/local-patch-attack-signals.test.js` 13개(추출값, 공식 audio_data 위 `soundSet`, 매니페스트, 재생: 휘두름/타격/착탄·지연·근접·원거리·무음 모드·
  스파인·공격자 계약·적 스킬, 실제 매치 경로 애쉬락 START가 타격보다 먼저) + 2026-10-10 저녁 10개(유닛별 스파인 대체음·렌더 연결(소스)·적 스파인,
  적 모드, 버프·커스텀 트리거). [브라우저 미확인 — 마운틴 S2·S3 주먹, 파투스 평타 장전음이 실제 클립 이벤트에서 나는지 들어 볼 것]

## 재능·소환물 능력 소리 (2026-10-11, 클라 신호 규칙 + EN 클라 버프 템플릿; 관리자 결정 「공식이랑 동일하게」)
- 공식: 재능도 자기 능력이다 — 신호 `<charId>.T.<n>`(`UnitMode.GenerateSignalId`), START = 능력 시작(`AbilityStandard.OnCastStart`),
  ON = 판정 순간. 스킬 프리팹의 투사체는 발사 순간 `ON_PROJECTILE_BORN.<키>`. 소환물도 자기 프리팹 `_modes`의 신호(위 「공격 소리 신호」). 뱅크는 zh_CN
  `audio_data.json`. 소리는 `sfx.kit` 키(`tools/assets/kit-sfx.mjs`), 소환물 모드는 매니페스트 `sfx.units[토큰].tm[모드 이름]`(`skill-mode-sfx.mjs tokenModeSets`).
  - 크루스 더 킨 글린트 재능 「中的」(T.1, 따로 고르는 공격 능력): START p_atk_krossbow_d·ON p_imp_krossbow_d. sim은 확률을 착탄 때 굴리므로(`chess_char_4_06-kroos2.js`)
    그 표시 fx `crit`에 **`by`(그녀 id)**를 더하고, 오디오가 그 순간 START+ON을 같이 낸다 [추정: 공식은 휘두름 시작에 T.1을 골라 START를 휘두름에, 그 사격의 평타
    큐 대신 낸다 — 우리는 평타 큐도 이미 났고 START가 휘두름 길이만큼 늦음]. 2026-10-21부터 sim은 스킬 밖에선 휘두름 시작에 고르고 'swing'·'atk'에
    'T.1'을 싣는다(`sim.md` 「재능이 고르는 공격」) — 오디오는 아직 'crit' 그대로(스킬 모드의 치명은 버프 템플릿이라 T.1 능력 소리가 없을 수도 [미확인]).
  - 이그제큐터 디 엑스 포에데레 재능 「受选之人」 추가 사격(T.1): START p_atk_shotgunxdouble(ON·HIT 뱅크 없음). sim은 그 사격을 `forceAttack(…, { signal: 'T.1' })`로
    쏘고 그 'atk' 이벤트 끝에 `'T.1'`을 단다(`ai.js performAttack`, `docs/SIM.md`) → `audio.js talentAttackKeys`: 그 순간 T.1 START 한 번, 평타 큐(p_atk_shotgunx_n)·
    착탄음 없음. 버프 `excu2_multi_attack[audio]`(p_atk_shotgunxdouble_2)·`[s3][audio]`(p_atk_shotgunxdouble3)는 붙는 곳이 버프 템플릿에 없다(캐릭터 프리팹 능력
    쪽 — 안 읽음) — 안 냄 [미확인].
  - 노시스 재능 「殊途同归」(T.2, 배치 10초 뒤): START p_skill_iceprickbuff. sim이 배치마다 한 번 `['fx', 'kitHit', x, y, { id, k: 'gnosis:t2' }]`
    (`chess_char_4_13-gnosis.js`, 조건이 처음 참이 되는 틱 — `unit.mem.gnosisT2`에 그 배치 시각).
  - 실버애쉬 더 레인프로스트: S2(기본 스킬 `skchr_svash2_2`)의 베기는 kit 피해라 공격 이벤트가 없다 → 기존 fx `aoe`(`skill: 'svash2'`, 그가 벤 것만 — 대기 오퍼의
    재배치 베기는 아님)에 그 능력의 ON p_atk_snwlprdg_h(START는 스킬 시작음, HIT는 `kd`로 이미 남). S3(`skchr_svash2_3`)는 공격마다 스킬 프리팹 투사체
    `projectile_chr_svash2_s3`를 쏜다 → 그 BORN p_skill_snwfld_s를 S3 중 타격 순간마다(`signalAttackKey`, sim 변경 없음). 조사 보고의 「S3 베기 = aoe」는 틀림 —
    `aoe` svash2는 S2 베기다.
  - 뮤엘시스의 유동체(流形, `token_10030_mlyss_wtrman`, 모드 Recharge·Default·Melee·Range·Range_S2·Melee_S3): 버프 템플릿 `mlyss_wtrman_switch_melee`/`_range`가
    복제할 때 주인이 `mlyss_s_3[buff]`/`mlyss_s_2[buff]`를 가지고 있으면 모드 5/4(Melee_S3/Range_S2), 아니면 2/3(Melee/Range)으로 `SwitchMode`; 스킬이 끝나면
    `mlyss_s_3[token_buff_melee_finish]`/`mlyss_s_2[token_buff_range_finish]`가 2/3으로 되돌림. sim fx `copy`에 **`mode`('Melee'|'Range')·`by`(그녀 id)**
    (`chess_char_6_11-mlyss.js`) → `audio.js tokenModeName`: 그녀 S3(번호 2)/S2(번호 1)가 켜져 있으면 `_S3`/`_S2`, 분열 복제(fx `split`)는 원본 모드.
    그 모드 큐(`tm`): Melee·Range_S2·Melee_S3 = START p_atk_wtrlime_n·HIT p_imp_wtrlime_remote, Range = attack/combat 둘(근접 combat.3은 p_imp_wtrlime_n).
    복제 순간 `mlyss_wtrman_s_begin`의 소리 버프 `mlyss_wtrman_s_melee_audio`/`_range_audio`(p_skill_wtrlimetrans_melee/range, fx `copy`), S3 근접 복제의
    끌어당김마다 `mlyss_s_3[melee_audio]`(ON_BUFF_TRIGGER, p_atk_wtrlimepull, fx `pulse`). 안 한 것: S3 원거리 복제 `mlyss_s_3[range_audio]`(p_skill_wtrlimesplit,
    `token_range_trigger` — 그 순간을 sim에서 못 얻음), 가짜 죽음·부활(`mlyss_wtrman_t_1`).
- 소리 파일: 새 키의 파일 대부분이 아직 없다 → 메인이 `node tools/fetch-assets.mjs --add-only`(매니페스트 `sfx.kit`·`tm` 재생성 + 새 파일만 받음).
- 확인: `test/local-patch-talent-sounds.test.js`(공식 데이터 위 키·모드 표, 순간별 키, AudioManager 재생, 실제 매치 경로: 크루스 `crit.by`·이그제큐터 'atk' T.1·
  노시스 kitHit 한 번·뮤엘시스 `copy.mode`). [브라우저 미확인]

## 스킬 시전 능력 소리 (2026-10-29, 공식 클라 + 스킬 프리팹)
- 공식: 시전형 스킬(`CastSkill`, `tools/assets/local-skill-cast.json` cls `cast`)은 켜질 때 자기 스킬 능력을 시전하고(`CastSkill.DoCast`), 그 능력이 보통
  능력처럼 START(시전 시작)·ON(시전 클립의 OnAttack 순간, `_waitForAttackEvent` 0이면 바로)·HIT(대상마다)를 낸다(`AbilityStandard`, 위 「START·ON·HIT」). 뱅크 이름은
  `battle.ON_ABILITY_START|ON|HIT.<skillId>[.<k>]`, 믹서 그룹은 상관없다. 능력이 묶음(`_abilities`)이면 `.<k>` = k번째 자식(묶음의 `DoSetData`, 위 「공격 소리
  신호」의 묶음 자식 `.<i+1>`과 같음); 순차 묶음(`AbilitySequenceGroup`)은 한 자식이 끝날 때 다음을 바로 시전하므로 클립이 있는 자식 뒤의 자식은 시전이 끝날 때
  시작한다. 묶음 구조는 `tools/local-extract/skill_cast.py`의 `group`('seq'|'par')·`subs`(자식마다 `anim`·`wait`).
- 전에는 안 났다: `abilityCues`는 공격·타격 그룹만 스킬 중 공격에, `skillExtras`는 하위 키 없는 START만 시작에 냈고, 모드가 있는 스킬은 스킬 능력 뱅크를 아예 안 봤다.
- 구현: 빌더 `skill-mode-sfx.mjs castCues` → 매니페스트 `sfx.units[id].castCues[스킬 번호]` = 큐 목록, `at` 's' 시전 시작·'a' 타격·'e' 시전 끝. 다른 길이 이미
  내는 뱅크는 뺀다(스킬 시작음, `skillExtras`, 루프, 모드 없는 스킬의 공격 큐 `abilityCues`, 타격 그룹 HIT = `kd`). sim은 시전형 스킬의 'skill' 켜짐 이벤트 5번째
  칸에 `[타격, 끝]`(게임 초, `castTiming()`)을 싣고(`server/sim/skills.js _evOn`, 클립 변형이 없으면 4번째 칸 null; 표시용 — 판정은 안 바뀜, golden 그대로),
  `audio.js`가 그만큼 기다려 낸다(`audioOfficial.js castCuesOf`, 뱅크 자신의 지연은 더함).
  - 이 모드 기물이 쓰는 것: 첸 더 던스트릭 S2 START p_atk_hljdswd_h(시작) · 플레임테일 S2 ON p_skill_lightsword · 인포서 S2 `.1` ON p_imp_fgun_s ·
    글래디아 S3 `.1` START p_atk_seasword_h(시작)·`.2` ON p_skill_seasummon(회오리가 생길 때 — 아래) · 노시스 S2 ON p_atk_iceprick_h·HIT
    p_imp_iceprick_h(타격 + 뱅크 지연 0.1초 — 클립 없는 능력이라 대상마다의 HIT가 판정 순간과 같음, 뱅크 `maxSoundAllowed` 1) · 레온하르트 S2 ON p_skill_magblast ·
    모스티마 S2 ON p_skill_blacktimewand_shot · 산크타 믹사파라토 S3 START p_atk_ftmxbrtlm_skiiop(버프 능력 — 시작) · 울피아누스 S3 `.2` START
    p_atk_wtrbatnchr_s(시작, 앞 자식이 버프)·ON p_atk_wtrbatnchrfr_s · 벤델라 S2 `.2` START p_imp_brmblhl_h(앞 자식 `MaxHpMark` 클립이 끝날 때).
    같은 규칙으로 기물이 안 쓰는 스킬(쏜즈 더 로드스타 S3, 위 S2, 아르케토 S2, 티티 S2, 치우바이 S2, 이네스 S3, 블레미샤인 S2)도 매니페스트에 들어가지만 나지 않는다.
  - 민트 S2: `ON_ABILITY_ATTACK_FINISH.skchr_mint_2` p_skill_magend는 **스킬이 끝나는 순간**(끝 클립 `Skill_2_End`이 시작할 때) 난다. 이 신호는
    `AbilityStandard.OnAttackFinished`가 엔티티의 공격 끝 이벤트(0x14)를 받았을 때 그 인자가 자기 능력이면 한 번 내고, 민트 스킬 루트의 세 단계 애니
    (`ThreePartChannelingAnimation`, `_fireAttackFinishEvent` 1·`_delayToFireAttackSkillEvent` 1·`_delaySecond` 0)가 끝 클립을 틀자마자 그 이벤트를 **스킬 루트
    능력**(신호 이름 `skchr_mint_2`)을 인자로 낸다(공식 클라에서 확인). 끝 폭발 `FinalAttack`은 0.6초 뒤 터지지만(`sim.md` 「민트 S2 끝 폭발」) 자기 공격 끝
    소리가 없다(클립이 없고 그 이벤트의 인자가 아님). 구현: `audio.js`가 그녀의 S2 'skill' 꺼짐에 `sfx.kit mint:s2end`(같은 묶음에서 쓰러지면 안 냄 — 끝 클립이
    안 돎). 2026-10-29 처음 구현은 끝 폭발 fx `aoe`에 붙여 [추정·엔진: 공격 끝 이벤트를 판정 직후로 봄]이었고, 그때는 sim 폭발이 스킬 끝이라 시점은 같았다.
  - 글래디아 S3 `.2`(회오리 `Chant`의 ON p_skill_seasummon)는 순차 묶음의 첫 자식 `FinalAttack`(클립 없는 끌어당김 — `OnAttack` 이벤트를 기다림) 다음이라
    빌더가 시점을 모른다 → `castCues`는 클립 없는 공격 자식 뒤의 자식을 빼고, 회오리가 생기는 sim fx `tornado`에 `sfx.kit glady:s3`로 낸다(시작 0.3초 뒤 —
    `sim.md` 「글래디아 S3 시작 순서」). `.1` START p_atk_seasword_h(첫 `FinalAttack`)는 시작에.
  - 인포서 S2: 시전 능력은 묶음의 첫 클립 자식 `knock_back`(클립 `Skill`, 타격 0.4초, 배치 방향을 봄). 2026-10-29까지 `skill_cast.py`가 경로 이름순 첫 자식
    (클립 없는 `aura`)을 골라 시전 기록에 클립이 없었고 타격이 공격 간격 끝이었다 — 이제 묶음 순서의 첫 클립 자식을 고른다(바뀐 것은 이 스킬 하나).
- 확인: `test/audio-skill-cast-cues.test.js`(빌더·매니페스트 11건, 다른 길이 내는 뱅크 제외, `castCuesOf` 대기, 벤델라 `e`·노시스 HIT 지연, 실제 매치 경로: 레온하르트 S2
  이벤트의 `[타격, 끝]` = `castTiming()`과 그 대기, 민트 키). [화면 미확인]

## 스킬·재능 투사체 소리 (2026-10-29, 공식 클라 — 캐릭터·스킬·투사체 프리팹)
- 공식: 스킬·재능·드론이 쏘는 투사체도 자기 뱅크를 낸다 — BORN(발사)·HIT(맞힌 대상마다)·REACH(도착)·STOP(멈춤)·
  BEHAVIOUR_TRIGGER(투사체 동작이 낼 때). 뱅크 이름은 투사체 키, 프리팹에 `_overrideAudioSignal`이 있으면 그 이름(라플란드 더 데카덴차의 늑대
  `…_funnel_1~3` → `projectile_chr_whitw2_funnel`, `…_funnel_s3_<n>` → `…_funnel_s3`, `…_funnel_s3_<n>_attach` → `…_funnel_s3_attach`).
  우리 도구는 이 필드를 읽지 않고 이름으로 맞춰 왔다(지금까지 결과는 같음). 소리는 `sfx.kit` 키(`tools/assets/kit-sfx.mjs`), 재생은 `public/js/audio.js`.
  sim 이벤트는 개수가 그대로(새 이벤트 없음 — 기존 fx·'dmg'에 필드만 더함)라 golden 무변화.
  - 크루스 더 킨 글린트(오퍼레이터) S2: 40타 뒤 모드 `S2_Sub`(4연사, `projectile_chr_kroos2_s2_2` HIT `p_imp_krossbow_s`/`_h` 가중 무작위) —
    위 「공격 소리 신호」의 스킬 중 바뀌는 모드 표에 키트 fx `quadShot`으로 넣음.
  - 미니멀리스트(오퍼레이터) S2: 스킬 프리팹 `skchr_malist_2`의 다음 공격이 두 발 — 첫 발 `_projectileKey` `…_malist_s1s2`(뱅크 없음),
    둘째 발 `_additionalProjectile` `…_malist_s2_2` HIT `p_imp_staffcannon_h` → 그 휘두름의 둘째 착탄(`strikeImpactKey`, 키 `malist:s2`).
  - 驭械术师의 풀어 놓지 않은 드론(쉐라·라플란드 더 데카덴차·락락·미니멀리스트 평타): 공식은 Default 모드 `Body/Funnel`(라플란드는 공격 아래
    `Funnel1~3`)이 따로 쏘는 투사체 — 그 HIT(`p_imp_funnel_d`·`p_imp_whtolfdrkslfnl_n`·`p_atk_elecwandfunnel_n`, 미니멀리스트 것은 뱅크 없음).
    sim은 드론 추가 피해를 공격 착탄과 같은 순간에 주므로(`ai.js resolveHit`, 태그 `funnel`) **'dmg' 7번째 칸 2**(`damage.js dotFlag`,
    `docs/SIM.md`)로 표시하고, 오디오는 그것을 공격 착탄 회차에서 빼고 `funnelHitKey`로 낸다(전에는 「스플래시」로 잡혀 평타 착탄음이 한 번 더 났다).
    [추정·자료 없음: 드론을 붙인 채 쓰는 스킬 중에는 소리를 내지 않음 — 스킬 모드의 드론 투사체를 안 대조함]
  - 쉐라(오퍼레이터) S2: 풀어 놓은 드론 `Funnel_0`(`…_kjera_funnel_s2_1`)만 뱅크가 있다(`Funnel_1`의 `…_s2_2`는 없음) → 키트 fx `drone`에
    드론 번호 `i`를 실어 `i` 0의 타격마다 HIT `p_imp_funnel_h`, 그리고 그 투사체의 `TriggerAudioSignalBehaviour`(OnHitTarget: `_preDelay` 0.6초
    ÷ 능력 재생 속도 뒤 `PlayBehaviourAudio`, 공식 클라에서 확인)로 0.6초 뒤 `p_imp_funnel_end_h` [추정·엔진: 능력 재생 속도를 1로 봄].
  - 라플란드 더 데카덴차 S3: 풀려나는 늑대(순항 투사체) BORN `p_atk_whtolfdrksltr_s`(fx `drones` n마다), 돌아다니던 늑대가 적을 찾으면 그
    MovementController의 버프 `whitw2_find_target_mark`(SHOW_EFFECT `p_imp_whtolfdrkslfnlmrk` — fx `droneLock`), 붙은 늑대의 타격은
    `…_attach` HIT `p_imp_whtolfdrkslfnl_s`(fx `drone`에 `lock` 1; 전에는 순항 투사체 HIT `p_imp_whtolfdrksltr_s`가 났다 — 그것은 이제 돌아다니는 늑대의
    1초 펄스만).
  - 쏜즈 더 로드스타 S3: 스킬 프리팹 `Token` 능력이 오퍼레이터마다 던지는 `projectile_chr_thorn2_s3`(수명 0.5초)의 STOP `p_atk_trshldacyd_h` →
    S3 시전의 fx `zone`에 `thrown` 1. 다각형 `projectile_chr_thorn2_s3_polygon`의 `_audioSignal` `thorn2_polygon_appear`는 sim에 다각형이 없어 안 냄.
  - 위셔델(선발) S3: 공격 묶음(`_mainAbility`, 자식 모두)의 `AimEff`가 대상에 `wisdel_s_3_mark[target]`(audioSignal `WISDEL_S3_MARK`, `p_atk_dkmrcaygnam`)
    → 휘두름마다 [추정·엔진: 클립 없는 자식의 버프는 시전 순간에 붙음]. `WISDEL_S3_BOMB_EFF`는 그 신호를 내는 곳이 EN 클라 캐릭터·스킬·투사체
    프리팹과 버프 템플릿에 없다 — 안 냄.
  - 아스트젠 더 라이트체이서(오퍼레이터) S3: `LinkEnemy`가 적을 하나 더 연결할 때마다 `halo2_s_3_link`(audioSignal 같은 이름, `p_imp_strbsvrmk_s`) →
    S3 fx `link`의 `ids` 중 이번 스킬에서 처음인 적마다(`haloLinkCount`). `_lineAudio` `halo2_line_appear`는 뱅크가 없다.
  - 엑시아 더 뉴 커버넌트(오퍼레이터) 재능 「화력 무전」: `TalentBomb` 폭격 `projectile_chr_angel2_t1` REACH `p_imp_tlsrhgns_n` → 폭격이 터지는 fx
    `airstrike`(`tgt` 있음; S3의 토큰 사격은 `signal`).
  - 클레멘티아(선발, CN 클라 버프 템플릿·투사체 프리팹): S2 켜질 때 `clemnt_s2[emit_projectile]`가 객차 `…_clemnt_s2_lr`(좌우 방향)/`_ud`를 쏘고
    (BORN `p_atk_wtfyswrsp` — fx `anchor`), 그것이 멈추면(ON_PROJECTILE_STOP → 그 버프 TRIGGER) 소용돌이 `…_s2_range`(BORN `p_imp_wtfyswrsp` — fx `tide`).
    S3는 침식 붕괴한 적에 `clemnt_s3[emit_projectile]`가 `projectile_chr_clemnt_s3`를 그 발밑에 쏘고 — REACH `p_atk_wtrbmcn`(fx `lock`), 그 프리팹의
    소리 동작 둘이 도착 뒤 0.5초에 낙하음 `clemnt_s3_projectile_tick_fall_audio`(`p_atk_wtrbmsl`), 1.0초에 착탄음 `…_tick_reach_audio`(`p_imp_wtrbmsl`),
    그 뒤 1초마다(횟수 = 타격 수 `audio_trigger_cnt`, 타격도 1초 뒤부터 1초마다 — rules/diy.md). 피해는 버프 `clemnt_s3[rocket_damage]`(HIT 신호 없음)라 S3 키트 피해는 무음(`SKILL_DAMAGE_KEYS` '';
    전에는 S3 모드 착탄음이 났다). 우리: 착탄음은 키트 폭발 fx `blast`마다, 낙하음은 각 폭발 0.5초 전(`lock`의 `dur` − 0.5 + k초, `n`번). 재능 1 굴림이
    이기면 `clemnt_t1[dice_damage]` ON_AFTER_OUTPUT_DAMAGE의 PlayAudio `clemnt_t1_power_attack_audio`(`p_imp_wtsdrvrtl`) — 'dmg' 9번째 칸 moment.
  - 할 것 없음: 혼 S2 `…_horn_s2_full*`(수동 종료 `Full Burst`의 탄 — 위 「공격 소리 신호」; 이 모드 기물은 S3). 남김(§11 ③ 소리): 실버애쉬 더 레인프로스트 S3
    새(`svash2_s_3[bird_on_self]`/`[bird_on_target]` — 이 모드에서 어느 쪽이 도는지 미조사).
- 확인: `test/audio-skill-projectiles.test.js`(뱅크·매니페스트, 키, AudioManager 재생, 실제 매치 경로: 쉐라 드론 피해의 7번째 칸 2와 S2 드론 `i`; 클레멘티아 2026-10-29 같은 날 추가). [화면 미확인]

## 버프·커스텀 트리거 소리 (2026-10-10 저녁, 공식 클라 + EN 클라 버프 템플릿)
- 공식: 버프가 붙을 때 `Entity.OnBuffStart`가 그 버프의 `audioSignal`(빈 값이면 없음)로 `ON_BUFF_START`를 낸다(`OnBuffTrigger`·
  `OnBuffShowEffect`/`AddBuffEffect`·`ON_BUFF_FINISH`도 같은 방식). `ON_CUSTOM_TRIGGER`는 버프 그래프의 `Action.Nodes.PlayAudio.Execute`와
  투사체 동작(`CoolDownAfterHitBehaviour.OnTick` 등)이 낸다. 그래서 「언제」는 버프 템플릿(EN 클라 `buff_template_holder.ab`, 연구 메모
  「공식 버프 템플릿 추출」)의 이벤트가 정한다. 소리는 `sfx.kit` 키(`tools/assets/kit-sfx.mjs`), 재생은 `public/js/audio.js signalAttackKey`/`signalFxKey`.
  - 혼 S2·S3: `horn_s_<n>[signal_melee|signal_ranged]`의 `ON_ABILITY_SPELL_ON`(= 공격 판정 순간)마다 `[overload_mark]`가 있으면
    `horn_s_<n>[overload][melee|ranged].attack`, 없으면 `[normal]…`(audioSignal을 가진 즉시 버프) → 우리 'atk'(근접 = `none`)마다. 과부하 시작
    `horn_s_<n>[overload_start]`은 sim fx `overload`(S3 = 지속시간 절반, S2 = 탄 절반 [ASSUMED, kit]); 과부하는 스킬 끝에 풀림.
  - 락락 S2: 과부하 시작 `rockr_overload_start`(fx `overload`), 끝 `rockr_overload_finish`(`rockr_s_2[overload]`의 ON_BUFF_FINISH → 과부하 중 스킬이 끝날 때),
    자기 공격 `rockr_s2_common_attack_start`/`_hit`(+`_overload`) → 'atk'/자기 대상 착탄 (2026-10-21 클라 확인: start는 S2 Attack의
    BuffToOwnerDuringAbility(OnEvent) `_startEvent` ON_SPELL_ON(4)이 그녀에게 거는 `rockr_s_2[start_audio_trigger]` = 타격 순간 — 그 전엔
    'swing'에 냈다; hit는 그 Attack의 `_activeBuffs` `rockr_s_2[hit_audio_trigger]` = 대상에 닿을 때).
  - 티티 S3: `titi_s_3[dmg_ticker]`가 깨어난 적에 PlayAudio `titi_s_3[awake]` → sim fx `wake`(적 id; 글래디아 등 아군이 자기 id로 내는 `wake`는 아님).
  - 페페 S3 (2026-10-22, 관리자 제보 「S3 타격음 없음」): 공격마다 주 대상에 붙는 `pepe_s_3_fx`의 `ON_BUFF_START`가 그녀의 `pepe_s3_range[atk]` 스택
    (이번 공격이 더하기 전)으로 `≥ max_stack_cnt` PlayAudio `pepe_s3_hit_03` · `≥ 2` `_02` · 그 밖 `_01`(대상 위치, `p_imp_ctmnyhmr_s1~s3`)을 같은 단계의
    `pepe_skill_03_hit_range_0N`과 함께 낸다(EN 클라 버프 템플릿). S3 모드에는 HIT 뱅크가 없어(`noHit`) 이것이 그녀 S3의 타격음 전부다. 우리: 키트의
    'stacks' { buff 'pepe:tremor', n, max }(이펙트와 같은 이벤트) → `signalFxKey` → `pepe:s3:1~3`. 새 sfx 3개. [화면 미확인]
  - 아스카론 S2: `ascln_s_2[enemy]`의 `ON_OWNER_KILLED`(그 효과를 단 적이 처치됨) → PlayAudio `ASCLN_S_2_BOMB`(그녀 위치) → **새 sim 이벤트**
    `['fx', 'kitHit', x, y, { id: 아스카론, k: 'ascln:s2bomb' }]`(`op-ascln.js`, 처치된 적이 그녀 범위 안일 때 — 기존 확산 조건과 같음; `docs/SIM.md`).
  - 프라마닉스 더 프레리타 T1 눈 타일(2026-10-16): `AttachListenerToTileAbility._HoldCastedEffectOnTile`이 칸 이펙트를 **새로 만든
    뒤에만** `_playAudioWhenEffectChanged` 1이면 `_audioSignal` `sbell2_snow_refresh_audio`를 그녀 자리에서 `ON_CUSTOM_TRIGGER`로 낸다(같은 프리팹
    유지·0층으로 비움은 무음; 뱅크 `p_imp_swcvr`, maxSoundAllowed 1·popOldest 없음, Battle_P_SImp). sim fx `snow`의 `cells`를 오디오 유닛 기록의 칸별
    구간(1·2~4·5층)과 비교해 구간이 새로 생기거나 바뀐 칸이 있으면 한 번(`audio.js snowRefreshed`, 키 `sbell2:snow`); 기록은 배치마다 새로 —
    떠날 때 클라가 칸 이펙트를 모두 지우는 것과 같음. 실버애쉬의 'snow'(S2)는 해당 없음.
  - 2026-10-22 (스킬 타격 소리 묶음 A — 연구 메모 「연결 안 된 스킬 타격음」, EN 클라 버프 템플릿; sim 이벤트는 그대로라 golden 무변화). 새 sfx 7개:
    - 벤델라 S2: 보호 대상이 맞을 때마다 `vendla_s_2`의 ON_TAKE_DAMAGE가 공격자에 즉시 버프 `vendla_s_2[extra_damage]`(audioSignal 같은 이름, 반격 피해 +
      `vendla_skill_02_hit_01`) → 키트 fx `counter`(그녀 id) → `signalFxKey` `vendla:s2` `p_imp_brmblhldmg`.
    - 락락 S2: 풀어 놓은 드론이 칠 때 대상에 `rockr_s_2[funnel_hit_audio]` — 그녀에게 `rockr_s_2[overload]`가 있으면 audioSignal
      `rockr_s2_funnel_attack_hit_overload`, 아니면 `…_hit` → 키트 fx `drone` → `kitHitKey` `rockr:funnel`/`rockr:funnelo`(과부하 = fx `overload` 뒤).
    - 아코르트 S2: 공격마다 범위 안 다른 오퍼레이터에 `akkord_s_2[aoe_damage]` — 그 자리 AOEDamage 뒤 `AlwaysNext` 다음 PlayAudio `akkord_aoe_audio`(적이 안
      맞아도 남) → 키트 fx `sonic`(오퍼레이터마다) → `akkord:s2` `p_imp_mlysndvbm`. [미확인] 음파 피해가 그녀 공격·착탄 0.1초 안이면 「스플래시」로 잡혀
      평타 착탄음도 맞은 적마다 날 수 있다(공식은 버프 AOEDamage라 HIT 신호 없음 — 'dmg'에 태그가 없어 오디오에서 못 가름).
    - 엔텔레키아 S2: 피의 낫 `etlchi_s_2`의 ON_BUFF_TRIGGER AOEDamage가 맞힌 적마다 즉시 버프 `etlchi_s_2[audio]`(audioSignal) → 그녀의 공격 없는 스킬
      피해(S2 중)를 `_skillImpact`가 `skillDamageKey` `etlchi:s2` `p_imp_vmprsckl_h`로(공격자마다 0.12초에 한 번 — 위 「공격 소리 신호」).
    - 틴맨 S2 「大拉里」: 연금 유닛 안 적마다 `tinman_s_2[buff]`의 ON_BUFF_TRIGGER(초마다)가 PlayAudio `tinman_s_2[audio]` 뒤 피해 → 그녀 id가 실린 지속 피해
      틱('dmg' 7번째 = 1)에 `dotTickKey` `tinman:s2` `p_imp_stmpnklchbm`(아래 「지속 피해 틱」의 예외). S1 `tinman_s_1[audio]`는 신호를 내는 템플릿이 없고
      이 모드 키트에 S1도 없다.
    - 르무엔 S3: 잠금(모드 3 능력)의 ON_ABILITY_CAST_ON_TARGET이 대상에 `lemuen_s3_audio_triggered`(UNIQUE·INFINITY, audioSignal 같은 이름) → fx `lock`
      (`hold`, src 그녀)마다 그 적의 첫 잠금에만 `signalFxKey` `lemuen:s3lock` `p_atk_lmwlcrstr_s`(기존 `lemuen:mark`와 함께) [추정: 버프가 스킬 끝에도
      남아 같은 적은 다시 안 남 — 오디오 유닛 기록 `lemS3`]. S2 조준 잠금(`hold` 없음)은 아님.
    - 확인: `test/audio-skill-hit-signals.test.js` 「buff / custom-trigger hit sounds wired 2026-10-22」(뱅크·매니페스트, 키, 실제 매치 경로 틴맨 틱). [화면 미확인]
  - 카넬리안 충전 단계 (2026-10-22, 묶음 B): 장착 스킬 N의 `billro_s_N[eff_cond]`(0.1초마다)이 스킬 밖에서 충전 2회면 파생 버프 [full](audioSignal
    `billro_s_N_reach_enhance`)+[half](소리 없음)를 [full]이 없을 때만, 1회면 [half](`billro_s_N_reach_half`)를 [half]가 없을 때만 만들고, 0회면 지운다;
    스킬 중엔 [half](충전 시전이면 [full]도)를 소리 없이 둔다. 우리: 키트 fx `charges`(n, 스킬 중 -1) → `audio.js billroChargeKey`가 그녀 오디오 기록에
    가진 버프를 따라 만들 때만 `billro:sN:half`/`:full`(`p_skill_goldexplobuff[1]normal`/`p_skill_goldexplobuff[1]`, S3은 `…buff1…`). [추정: 이벤트에
    충전 시전 여부가 없어 스킬 중은 [half]만 가진 것으로 침 — 충전 시전 직후 2회에 다시 닿으면 소리가 남]. 새 sfx 4개.
    확인: 같은 테스트 파일 「卡涅利安」(키 순서·실제 매치 경로).
  - 노시스·루멘 S2 충전 단계 (2026-10-22): `gnosis_s_2[eff_cond]`/`lumen_s_2[eff_cond]`(0.1초마다)이 충전 1회면 [effect1](audioSignal `[audio1]`)을,
    2회면 그것을 지우고 [effect2](`[audio2]`)를 그 버프가 없을 때만 만들고, 시전마다 `*_enhance_judge`가 둘 다 지운다(루멘은 0회에도). **새 sim fx**
    `charges` { n }(두 키트, S2를 골랐을 때만: 0.1초마다 수가 바뀌면, 시전 때 n −1 — 카넬리안과 같은 이벤트) → `audio.js chargeStageKey` →
    `gnosis:s2:1/2` `p_skill_iceprickbuff2/1`, `lumen:s2:1/2` `p_skill_fishhealbuff1/2`(루멘은 SHOW_EFFECT 뱅크). 이펙트는 rules/fx.md
    「키트 이벤트의 공식 이펙트」 `'charges'`(2026-10-23).
  - 프라마닉스 더 프레리타 눈 피해 (2026-10-22): 재능 진입 피해(`sbell2_t1[enemy_enter]`/`[enemy_character]` — 피해 뒤 그 적에 PlayAudio
    `sbell2_snow_tile_enter_damage_audio`, 뱅크 파일은 그녀 평타 착탄음 `p_imp_swlprdbl_n`)와 S2 눈 틱(`sbell2_t1[s2_dot]` — 초마다 적마다 PlayAudio
    `sbell2_skill2_dot_audio` `p_imp_swcvr_h`)이 **새 sim fx** `kitHit` { k `sbell2:enter` }(맞은 적마다)·{ k `sbell2:s2dot`, n 맞은 적 수 }(틱마다 하나)
    → `kitHitKey`; n이면 적마다 한 번씩 뱅크 상한(2, popOldest)까지. S2 중 그녀의 공격 없는 피해는 `_skillImpact`가 따로 소리 내지 않는다(`skillDamageKey` ''
    — 예전엔 S2 모드 착탄음이 났음). 확인: 같은 테스트 파일 「灵知 / 流明 … 圣聆初雪」(키·단계 순서·실제 매치 경로 노시스 `charges`·프라마닉스 진입).
    sim 결과는 그대로, golden은 fx 이벤트 수만 26개 시나리오 이동(`charges`·`kitHit`).
  - 소리 없음 (2026-10-25, 묶음 U): 有限加速器(장비) 템플릿 `act1vautochess_acarm037_buff`의 PlayAudio `trap_acgarm_buff_03`, 炎国短刀(장비)
    `act1vautochess_acarm024_buff`의 `trap_acgarm_buff_02`(그 갈래는 이 시즌에 돌지도 않음 — rules/sim.md), 迅捷 맹약 `act1autochess_bond_eff_swift`의
    `bond_charge_battle_01`·`bond_charge_battle_01[all]` — 공식 audio_data에 `battle.ON_CUSTOM_TRIGGER.<신호>` 뱅크가 없어 공식에서도 소리가 나지
    않는다(신호 이름만 있음). 같은 점검에서 叙拉古 맹약 [ex]의 `siracusa_ex_attack`(`act2autochess_bond_eff_siracusa[ex][buff]`, 뱅크 `a_bat_xscthrtcl`)은
    뱅크가 있는데 우리가 내지 않는다 — 할 일로 남김.
- 안 한 것 [시점·조건을 sim에서 못 얻음]: 티티 `titi_s_3[spread_from]`(연쇄 수면 선 — sim 이벤트 없음)·재능 `titi_t_1`(잠든 적 틱), 시빌라이트 에테르나
  재능 미진 재생성 `projectile_chr_cetsyr_talent[_s1|_s2]_cooldown_ready`(재생성 순간 이벤트가 없음 — 로스터 kit라 이벤트를 넣으면 golden이 넓게 바뀜),
  위셔델 `WISDEL_S_OVERLOAD`(S3 표식은 위 「스킬·재능 투사체 소리」), 필라에 `philae_aoe`, 카넬리안·노시스·루멘 `[eff_cond]` 단계 버프, 뮤엘시스·비질 가짜 죽음, 실버애쉬 더 레인프로스트
  S2·S3의 버프 소리(`svash2_s_2[show]`·`[range]`·`[hit]`, `svash2_eagle_token[locate]`), 쏜즈 더 로드스타, 르무엔 `lemuen_attack_end_audio` 등
  (관리자 메모 「오퍼레이터 효과음」 조사의 H·I 묶음), 적 버프·커스텀 트리거(적 91·122개 뱅크 — 적 스킬처럼 sim이 그 순간을 알려야 함).
- 확인: `test/local-patch-attack-signals.test.js` 「buff and custom-trigger sounds」(표·혼 S3·락락 S2·티티·프라마닉스 더 프레리타 눈 타일·실제 매치 경로 아스카론 S2).
  [브라우저 미확인 — 혼 S3 과부하 후 공격음이 바뀌는지 들어 볼 것]

## 적 소리 (2026-10-10, 위 「공격 소리 신호」와 같은 규칙)
- 평타: 적 프리팹 모드 0의 신호(`battle/enm_pfb_*.ab`, `_2` 변형은 기본 id 프리팹) — 예전 `pickUnitSfx`가 다른 모드·능력 뱅크를 먼저 집던 3종이
  공식대로: 무덤지기 석상 `e_imp_rockhit`(모드 0 Walk의 combat), 최첨단 살카즈 부패의 전차 근접 `e_atk_shotgun_n`(원거리는 `e_atk_cannonrot`),
  보스 제셀톤 윌리엄스 `e_atk_magic_ice`. 원거리 적은 자기 투사체의 HIT가 착탄음 — 착탄음이 새로 생긴 적 44종(가상적: 총·갑주, 알리스테어,
  '염의 가호' 등). '염의 가호'의 모드 0에는 START 뱅크가 없지만 그 소환물은 모드 0으로 싸우지 않는다 — 아래 「적 기록으로 만든 아군」.
- 적 기록으로 만든 아군 (2026-10-23, 관리자 제보 「'염의 가호' 공격할 때 소리가 안 남(착탄음은 남)」): 炎佑(`enemy_9012_acloon`, 炎 맹약
  소환물)는 아군이라 `enemyMode`(적만 받음)가 오지 않아 늘 모드 0 큐(착탄 'd'뿐)를 냈다. 공식 소리 표에서 평타 뱅크는 모드 2의 것뿐이고
  (`ON_ABILITY_START/ON.enemy_9012_acloon.attack.2` = `e_atk_frlgblck` → `e_atk_frlgblckfr`), 프리팹에서 模式乙 `Skill_2`가 `Modes/2/Body/Skills`에
  있다(`local-enemy-bindings.json`; PRTS "由核心盟约-炎召唤时为模式乙", sim `tokens.js yanyouKit`도 `Skill_2`). 이제 `shared/skill-modes.js
  ENEMY_RECORD_MODES`(炎佑 → 모드 2, `Skill_2`)를 `audio.js _track`이 읽어 처음부터 `emode` 2(`em['2']` 큐: 휘두름 START·발사 ON·착탄).
  祛恶之焰: `char_audio.py`가 모드 안의 스킬(`Modes/<n>/Body/Skills/<이름>`)도 기록 → `sk.skill_2` = START `e_atk_frlgblckh`, 반복 ON
  `e_atk_frlgblcklp`(`loop: 1`, `enemySkillCues`가 반복 뱅크에 표시), 착탄 `e_imp_mortar_n`. sim이 스킬을 켜면(`'skill' on`) START 한 번 + 반복음을
  키 `<id>:esk`로 붙잡고, 끄면 0.2초 페이드로 끊음(`_enemyRecordSkill`; 공식 `ON_ABILITY_END…Skill_2`는 그 반복의 ctrlStop 0.2초뿐). 분사 1초
  틱마다 착탄음은 안 냄 [추정: 링크 투사체 HIT는 연결될 때 한 번]. 확인: `test/local-patch-attack-signals.test.js` 「炎佑」.
  [브라우저 미확인 — 실제 판에서 휘두름·발사음, 분사 시작·반복·끝을 들어 볼 것]
- 스킬: `sfx.units[id].sk[능력 이름 소문자]` = 그 능력(`Skills/<이름>`) 뱅크 + 투사체 소리. sim이 적 스킬 시전에 `fx 'enemySkill' { id, ability }`를 내면
  START·ON·BORN을 내고, 3초 안의 그 적의 공격 없는 피해에 HIT·REACH(`_skillImpact`).
- 모드 전환 (2026-10-10 저녁): 공식 `Unit.SwitchMode`는 이전 모드 `InactiveMode`·새 모드 `ActivateMode`(능력 Detach/Attach)뿐 자기 소리가
  없다(적 뱅크에 모드 전환 이벤트도 없음). 바뀌는 것은 그 모드 능력의 신호(`<능력>.<모드 번호>`, `UnitMode.GenerateSignalId`)와 전환 클립의 스파인 이벤트다.
  → plan이 적의 모드 1 이후 공격 신호를 `sfx.units[id].em[n] = { cues, sel? }`로(모드 0과 같으면 생략, 뱅크 없으면 `cues: []` = 그 모드 공격은 무음 — 37종),
  렌더가 공식 모드가 바뀐 것을 보면 `audio.enemyMode(unitId, defId, 모드 번호, 이전 번호)`(fx 담당 계약) → 그 뒤 공격은 그 모드의 큐. 모드 번호 = 프리팹
  `_modes` 순서(local-char-audio.json `modes`) — 2026-10-21 공식 클라로 확인(`Unit._InitUnitModes`가 `_modes[i]`에 i를 `UnitMode.index`로 주고 신호 id가
  그 index를 씀, docs/rules/fx.md 「적 상태의 버프 이펙트」); 렌더 표 `enemy-modes.json`의 모드도 같은 순서라 번호가 같다. 렌더가 모드를 공격 클립으로
  가르므로 두 모드가 같은 클립(`Attack`)이면 바뀐 것을 못 본다(그 적은 모드 0 큐 그대로). 확인: `test/local-patch-attack-signals.test.js` 「enemy modes」(직접 호출).
- 제국 아틸러리 타게티어·코어 타게티어 포탄 (2026-10-22, 관리자 요청): 포탄 피해는 3초 뒤 무출처라 유닛 큐(공격 HIT `e_atk_energyshotcast`·투사체 HIT
  `e_imp_grenade_n`, 둘 다 착탄 'd')가 한 번도 안 났고, 쏠 때는 대체 `enemyHit`만 났다. 이제 `sfx.kit`(`tools/assets/kit-sfx.mjs`, `audio.js kitHitKey`/
  `kitStartKey`): 쏠 때(fx 'bombardShell') `ON_ABILITY_END.enemy_1112_emppnt.attack` `e_atk_aim` [추정: 공식은 시전 끝 `OnCastEnd`, 우리는 쏘는 순간],
  착탄 때 맞은 유닛마다(fx 'bombard' kind `emppnt`와 같은 묶음의 무출처 'dmg', `AudioManager._shellAt`) `ON_ABILITY_HIT…attack` `e_atk_energyshotcast` +
  `ON_PROJECTILE_HIT.projectile_enemy_emppnt` `e_imp_grenade_n` — 공식 HIT 신호는 맞은 유닛마다(뱅크당 동시 2개, popOldest), 아무도 안 맞으면 무음
  (REACH 뱅크 없음). 처음엔 포탄마다 한 번이었는데 관리자 청취 「기억보다 약함」(2026-10-22) — 파일은 EN 클라 `enmy_snd_imp_2.ab`의 원본과 같은 길이(2.54초),
  음량은 공식 믹서 그룹(`Battle_E_NImp` 0.205). 'mortar' 공격에는 대체 `enemyHit`를 안 내고 `lastAttacker`도 안 남김(남기면 배속이 빨라 3초가
  실제 2.5초 안에 지날 때 무출처 착탄 피해가 그 공격의 'd' 큐를 또 냈다). `_2`의 뱅크도 같은 파일. 확인:
  `test/local-patch-audio.test.js` 「帝国炮火先兆者」.
- 안 한 것: 적 버프·커스텀 트리거 소리(위 「버프·커스텀 트리거 소리」), `ON_BOSS_ENTER`(우리 보스엔 뱅크 없음). 적 스파인 이벤트는 위 「공격 소리 신호」의 스파인 이벤트로 남.

## 지속 피해 틱 (2026-10-11, 사용자 제보 「아스카론 S2 지속 피해 소리가 공격 소리와 같음」)
- 원인: 아스카론 재능 「死亡拘审」의 틱(`op-ascln.js` `battle.dealDamage(unit, t, { tags: ['dot', …] })`)은 'dmg'에 공격자(그녀 id)가 실리고 'atk'가 없어,
  위 「공격 소리 신호」의 「스킬 자체 피해」로 처리됐다 — S2 중이면 `_skillImpact`가 S2 모드 착탄음 p_imp_smksndrt_h(= 그녀의 S2 공격 착탄)를 틱마다 냈다.
  그 [추정](「지속 피해 틱은 공식 착탄 신호가 아님」)은 0.12초 간격 제한으로만 구현돼 있었다. 또 그 틱이 그녀가 막 공격한 대상에 오면 그 공격의 착탄 자리를
  가져갈 수 있었다(`lastAttacker`).
- 공식(EN 클라 버프 템플릿 + 공식 클라): 틱은 버프 `ascln_t_1[debuff]`의 ON_BUFF_TRIGGER `Nodes.DamageViaAttr`(attackType BUFF) — 그 템플릿에 PlayAudio 노드도
  `audioSignal`도 없고, `DamageViaAttr.Execute`는 피해 계산·`ApplyModifier`뿐 소리를 내지 않는다. 능력의 HIT 신호도 아니다 → **틱은 무음**.
  같은 꼴(버프 트리거 피해 노드, 소리 없음): 인디고 S2 `indigo_s_2[damage]`(DamageViaAttr), 이네스 S1 출혈 `ines_s_1[damage]`, 텍사스 디 오메르토사 S1
  `texas2_s_1[dot]`(FixedValueDamage), 언더플로우 재능 `udflow_t_1`, 엔텔레키아 재능 `etlchi_t_1[magic_dot]`.
- 고친 것: sim 'dmg' 이벤트에 7번째 필드 = 지속 피해 틱 1(태그 `'dot'` — 우리 sim에서 持续伤害 = attackType BUFF, `professions.js`), 아니면 0
  (`server/sim/damage.js dotFlag`, `docs/rules/sim.md`·`docs/SIM.md`; 이벤트 수·전투 결과 그대로라 golden 무변화). `public/js/audio.js`는 그 틱을 착탄으로 치지 않는다
  (공격 착탄·스플래시·스킬 착탄 모두 아님, `lastAttacker`도 안 건드림).
- 같은 경로로 함께 무음이 된 것(예전에는 그 스킬 중 틱마다 스킬 착탄음): 위 다섯 + 포덴코 S2 포자 구역·틴맨 구역(`'dot', 'zone'`)·클레멘티아 S2 소용돌이.
  포덴코·클레멘티아(2026-10-23, 클라 프리팹·`audio_data` 확인): 포덴코 S2 피해는 버프 틱이 아니라 투사체 `projectile_chr_podego_s2`가 장판 안 적을
  1초마다 다시 치는 것(`_keepAlreadyHitTime` 1.0, `_hitAfterReached`; 스킬 능력 `skchr_podego_2`의 버프는 침묵·停顿뿐) — 그 능력의 소리 뱅크는
  `battle.ON_ABILITY_START.skchr_podego_2`·`ON_SKILL_START`뿐이고 `ON_ABILITY_HIT.skchr_podego_2`·`ON_PROJECTILE_HIT.projectile_chr_podego_s2`가
  없어(착지 `ON_PROJECTILE_REACH` 하나뿐) 타격마다 소리가 없다. 클레멘티아 S2 소용돌이도 `ON_PROJECTILE_BORN.projectile_chr_clemnt_s2_*`·
  `ON_SKILL_START.skchr_clemnt_2`뿐, HIT 뱅크 없음 → 둘 다 틱 무음이 공식(지금 그대로). 틴맨 `tinman_s_2[buff]`는 ON_BUFF_TRIGGER에 자기 PlayAudio가 있어(구역 맥동음) 공식은 틱마다
  그 소리를 낸다 → 2026-10-22부터 그 틱만 `dotTickKey`로 `tinman:s2`(위 「버프·커스텀 트리거 소리」). 라플란드 더 데카덴차 드론·望 바둑돌은 원래 `sfx.kit`로
  따로 내서 변화 없음. 无来源 틱(深水区·원소 등)은 원래 착탄음 없음.
- 확인: `test/local-patch-attack-signals.test.js` 「damage-over-time ticks」(틱 무음·같은 피해 플래그 없으면 착탄음, 틱이 공격 착탄을 가져가지 않음, 실제 매치 경로
  아스카론 S2: 틱 7번째 = 1·공격 = 0·틱 무음). [실제 판 이상 없음 2026-10-28]

## 작전 종료 효과음 (2026-10-07)
- 관리자 제보: 공식 효과음 3개는 이미 웹 매니페스트에 있었다(`sfx.ui.battleOverReduce` / `battleOverNoReduce` /
  `battleOverNormal` = `act1autochess_b_ui_battleover_reduce|noreduce|normal.mp3`, 뱅크 `ui.ON_ACT1AUTOCHESS_BATTLEOVER_*`, 각 1.4초) — 받기만 하고 재생하는
  곳이 없었다.
- 재생: 내 일반 전투(COMBAT)의 결과가 오면(`screens/game.js onResult`, 전투 종료 배너와 같은 자리), 배너 그림(로컬 추출)이 없어도 소리는 낸다.
  결과가 안 온 라운드는 SETTLE에(`settleBattleEnd`), 라운드마다 한 번 — upstream SETTLE 효과음(`battleOverSfx`)은 지움(`upstream.md` 「0.2.0 병합」).
- 어느 소리인지(`audioOfficial.js battleOverOf(losses, 나)`) — **관리자 결정 2026-10-11: 클라대로**. 입력은 「이번 결과에 든 플레이어별 LP 손실」:
  모두 0 → NOREDUCE(완벽한 작전), 나는 0인데 다른 플레이어가 잃음 → NORMAL, 내가 잃음 → REDUCE. 누수 수·`perfect`는 보지 않는다.
  근거: 공식 클라 `AutoChessBattleUIViewModel.GetBattleResultStatus` — 서버 패킷의 플레이어별 `hpCost` 목록(`lastBattleResult`)을 돌며
  `isAllPrefect` = 모두 `hpCost ≤ 0`, `lostHp` = 보고 있는 플레이어의 `hpCost`; 짝은 `AutoChessBattleUIRoundResultDialog.OnRender` —
  `isAllPrefect`면 allPerfect 애니 + BATTLEOVER_NOREDUCE, 아니고 `lostHp ≤ 0`이면 perfect 애니 + NORMAL, `lostHp > 0`이면 miss 애니 + REDUCE(결과 창 최대 4초).
  - 솔로: 결과에 나만 — 내 손실 = `battleLossOf(내 perPlayer)` = min(라운드 상한, 셈하는 누수). 셈하지 않는 누수만이면 손실 0 → NOREDUCE(옛 규칙은 NORMAL
    [추정]이었지만 sim이 `perfect`를 「셈하는 누수 없음」으로 다시 계산해 실제로는 이미 NOREDUCE였다).
  - 협동: SETTLE에 서버가 `m.public.roundLosses` = 살아 있는 모든 플레이어의 이번 라운드 LP 차감(联防 재배분 포함, `settle.js`)을 보내고, 클라
    `settleBattleEnd`가 그것으로 정한다 — 팀원만 잃으면 내 화면도 NORMAL(panel_miss 숫자 없음). 「결과에 든 플레이어」 = 살아 있는 모든 플레이어
    [추정: 클라는 dict를 서버 패킷에서 받기만 해 범위를 알 수 없다 — 우리 매치에서 가장 단순한 읽기. 같은 판(联防)·짝 단위일 수도 있음].
  - 되돌리기(옛 규칙, 2026-10-07~10-10): 셈하는 누수 > 0 → REDUCE, `pp.perfect` → NOREDUCE, 나머지 → NORMAL, 협동 SETTLE은 `uniteResult.losses[나]`만
    (0이면 돕는 쪽도 완벽한 작전 — 관리자 기억 2026-10-08). 되돌리려면 `battleOverOf`를 내 값만 보게(`{ [나]: n }`만 넘김) — `screens/game.js`
    SETTLE 호출에서 `pub.roundLosses` 대신 `{ [myId]: pub.uniteResult?.losses?.[myId] }`, 테스트 `test/ui/gameLogic.test.js` 「settleBattleEnd co-op」.
- 联防·보스 라운드에는 내지 않는다(공식 결과 창이 다른 프리팹). `killBoss*`·`defenceStart`도 아직 연결 안 됨.
- 테스트: `test/local-patch-battleover.test.js`(세 상태·솔로), `test/ui/gameLogic.test.js` 「settleBattleEnd」, 실제 매치 경로
  `test/match/playtest6-matchflow.test.js` 「#235」·「solo round」(联防 뒤 돕는 쪽 NORMAL, 联防 없음 모두 0, 솔로 내 손실).

## 배치 효과음 — 어떤 경로로 놓이든 (관리자 제보 2026-10-07)
- 관리자 제보: 정비 단계 배치·구매·보상에서 배치음이 나지 않았다. 소환물도 배치음이 있고, 望 바둑돌은 수동 배치·재능 배치 모두 소리가 난다(관리자 확인).
- 원래: 전투의 'deploy' 이벤트에서만 났다(라운드 시작 배치는 실제 판에서 확인함 — b_char_set 7 + 자기 소리). 정비 단계 배치·구매·보상·벤치 복귀는 무음,
  구매는 상점 소리 `ON_ACT1AUTOCHESS_MAGIC_PLACE_HAND`(b_char_tokenset = 소환물 배치음)였다.
- 공식 자료(EN `audio_data.json`): 유닛 탄생 `battle.ON_UNIT_BORN.<id>`(전용) → `.char` b_char_set / `.token` b_char_tokenset, 그룹 Battle_UI_Important.
  우리 로스터의 전용 배치음은 매니페스트에 이미 다 있다(`sfx.units[id].born`): 오퍼레이터 15명(望 b_char_stwctpbn, 余 p_skill_frbytrtn_bn, 斯卡蒂2 등),
  소환물 11종(望 棋子 p_imp_stwctptkin, 维什戴尔 wward, 诅咒娃娃 등). 卫戍协议에는 「말 놓기」 전용 뱅크가 없다(`act1vautochess` SHOP_DROP=b_char_set은 다른 모드)
  → 정비 단계도 유닛 탄생 소리를 쓴다 — 공식 클라로 확인(2026-10-10): `AutoChessDummyManager._PlayAudioWhenCharacterPlaced`가 말 종류
  (`AutoChessBattleUtil.GetChessType`)가 MAGIC이 아니면 `PlayAudioSignal("ON_UNIT_BORN", unit)`, MAGIC이면 손으로 `ON_ACT1AUTOCHESS_MAGIC_PLACE_HAND` /
  전장으로 `…_MAGIC_PLACE_BATTLE`. 우리 「장비」가 EQUIP(→ ON_UNIT_BORN)인지 MAGIC인지는 데이터 대조 전 [미확인].
- 고친 것: 소리는 정비 화면의 **낙하 연출과 같은 곳**에서 난다 — `render/app.js` setPrep이 내 보드·벤치 상태를 이전과 비교해 낙하(onDeploy)를 틀 때
  `pieceDeploy` 이벤트(`prepDeployed`) → `screens/game.js` → `audio.prepDeploy` → `playDeploySfx`(전투 'deploy'와 같은 함수: 전용 소리 → 공용, 공식 믹스).
  서버가 넣어 주는 보상(정예화 보상·결산 보상)도 상태 비교라 잡힌다. 경우별:
  - 소리 남: 구매·보상으로 벤치 도착, 벤치→보드, 소환물(전용 또는 b_char_tokenset), **전투 뒤 정비로 돌아올 때 보드의 말**(`backFromBattle` — 관리자 결정
    2026-10-08 「라운드 종료 후, 배치 단계 진입할때도 배치음이 나오는게 맞아」). 벤치 말은 낙하만.
  - 소리 없음: 보드→벤치 복귀(낙하는 함 — 관리자 제보 2026-10-08), 판매, 페이지 로드·재접속
    첫 동기화, 전투 뒤 벤치 복원, 3장 합성 엘리트(합성 연출·`merge` 소리), 장비, **협동 정비에서 남의 보드를 보러 갈 때 그 보드의 말과 내 보드로 돌아올 때**
    (낙하는 함) — **관리자 결정 2026-10-11 「코드대로」(확인 항목)**: 클라는 배치음을 `SetCharacter`(말이 만들어지거나 옮겨질 때)에서만 낸다
    (공식 클라 `AutoChessDummyManager._PlayAudioWhenCharacterPlaced`, 호출자는 만들기 대기열·`_DoCreateOnTile`·`CreateDeadLikeDummy`뿐) —
    카메라가 보드를 바꾸는 쪽은 `SetCharacter`를 부르지 않는다. 관리자가 공식 협동 영상(보드 전환 순간에 배치음이 나는지)으로 나중에 확정한다.
    구현: `render/app.js SCOUT_DEPLOY_SFX = false` — 정탐 보드 말의 `pieceDeploy`를 내지 않고, 정탐 뒤 내 정비로 돌아올 때는 `battleSincePrep`
    (그 사이 실제 전투에 들어갔는지)가 거짓이면 낙하만.
  - 되돌리기(옛 관리자 결정 2026-10-08 「남의 보드도 소리 남」, 돌아올 때 [추정: 같은 규칙]): `render/app.js`의 `SCOUT_DEPLOY_SFX`를 `true`로 —
    정탐 보드의 보드 말(벤치 제외)이 처음 보일 때·옮겨졌을 때와 정탐 뒤 복귀 때 다시 소리. 테스트 `test/render/local-deploy-drop.test.js`의
    `SCOUT_DEPLOY_SFX = false` 단언을 같이 바꾼다.
  - 낙하(관리자 제보 2026-10-08): 전투 뒤·정탐 뒤 내 정비로
    돌아올 때 말 전부(벤치 포함 [추정: 클라이언트 정비 말은 칸·슬롯에 새로 만드는 더미]), 정탐한 보드(`enterBattle({prep})` → `battleView`)의 말 전부가
    떨어진다. 같은 보드에 다시 들어오면(팀원이 말을 옮겨 m.field가 새로 옴, `scoutSeen`) 새로 왔거나 옮긴 말만. 실제 협동 판(봇 3, 2라운드 — 팀원 줄 클릭 →
    「보러 가기」 → 내 줄)에서 ROUND_START:2·정탐·복귀 모두 onDeploy + b_char_set, 낙하 확인(2026-10-08 기준 — 2026-10-11부터 정탐·복귀는 낙하만, 위).
  - 벤치→보드를 실제 UI로(끌어 놓기 → 방향 휠 → 확정) 하면 소리·낙하가 없었다(관리자 제보 2026-10-08):
    휠의 `holdPiece`가 그 칸을 뷰의 집(`_home`)으로 만들어 `moved`가 false라, 놓은 지 1.3초(`DROP_PENDING_MS`) 안에 온 상태는 「서버 적용 전」 분기로
    빠졌다(`actions.move`를 직접 부르는 확인은 이 경로를 타지 않는다). 상태에 보드로 새로 나타난 말은 그 분기에서 뺀다. 확인: 실제 마우스 끌기 + 방향키로
    0.3초·2초 뒤 확정 모두 onDeploy + b_char_set.
  - 한 틱에 여럿(서버 자동 배치가 8~12개를 한 번에): 공용 배치음 뱅크(`ON_UNIT_BORN.char`, 상한 2·popOldest — 2026-10-10)가 앞 소리를 끊어 마지막 두 개가 남는다.
  - 라운드 시작: 정비에서 막 놓은(1.5초 안, `PREP_DEPLOY_OVERLAP_MS`) 같은 모델의 전투 'deploy'는 다시 울리지 않는다.
- 함께 고친 것: 1라운드처럼 보드·벤치가 비어 있을 때 **첫 말이 낙하하지 않던 것**(`before.length` 조건) — 동기화를 한 번 마친 뒤(`prepSynced`, 모든 말이 자리를 찾음)면
  빈 상태 다음 말도 새로 온 것. 오퍼레이터 구매는 상점 소리(b_char_tokenset)를 빼고 배치음만(장비 구매는 그대로).
- 확인: 단위 `test/local-patch-audio.test.js` 「deploy sounds on every placement」, 소스 `test/render/local-deploy-drop.test.js`. 실제 솔로 판(Chrome:
  1라운드 정비에서 구매 → 보드 → 벤치, 자동 배치, 전투 시작) — 세 경로 모두 b_char_set,
  전용 소리(b_char_tpartclce·snwlprdg·p_skill_frbytrtn_bn) 확인, 전투 뒤 정비 시작에 전체가 울리지 않음.

### 望 棋子 효과음 (관리자 제보 2026-10-07: 터지는 소리, 재능 바둑돌 배치음)
- 공식(EN `audio_data.json` + zh_CN `buff_template_data.json`): 놓은 바둑돌(토큰)이 터지면 그 토큰 능력 `ON_ABILITY_START.sktok_wang_<n>`
  = **p_atk_stwctp_d / _h / _s**(Battle_P_SAtk) + 타격 p_imp_stwctp_*(Battle_P_SImp). 우리는 타격음만 냈다(빠진 쪽 = 터지는 소리 자체).
  - S1 取势 타격 `wang_stone1_t[damage_audio]`: 적에게 거는 `wang_stone1_t[damage]`(지속 `sluggish`, `triggerInterval 1`, 첫 발 즉시)의 자식 버프가
    **매 틱** p_imp_stwctp_d를 튼다 → 6.5초 동안 7번. 우리는 터질 때 1번이었다.
  - 재능 바둑돌(跟子 = 望의 투사체, PRTS): S1·S3는 같은 파일(`ON_PROJECTILE_HIT.projectile_chr_wang_stone1`, `BEHAVIOUR_TRIGGER.…stone3`),
    S2는 `ON_PROJECTILE_BEHAVIOUR_TRIGGER.projectile_chr_wang_stone2` = p_atk_stwctps_h.
  - 배치음: 수동(놓은·재배치) 바둑돌 = 토큰 탄생 `ON_UNIT_BORN.token_10064_wang_stone1` p_imp_stwctptkin, 재능 바둑돌 = 투사체 탄생
    `ON_PROJECTILE_BORN.projectile_chr_wang_stone1~3` **p_imp_stwctptkpa** — 두 소리가 다르다(관리자 확인: 둘 다 소리 남).
- 고친 것: `tools/assets/kit-sfx.mjs` 키 5개(`wang:1s/2s/2fs/3s`, `wang:thrown`, 파일 5개 새로 받음), `audio.js kitStartKey`(터지는 소리 → 그다음 `kitHitKey` 타격),
  S1의 `wang:1`은 `server/sim/content/kits/ops/op-wang.js` DoT 틱마다 소리 전용 fx `kitHit`(`zone`에서는 S1 타격음을 빼 이중 재생 없음). 재능 바둑돌은 같은 틱의 `summon` fx `follower`
  플래그로 알아보고 토큰 탄생음 대신 `wang:thrown`.
- 안 한 것 [추정]: 다 쓴 바둑돌의 `ON_UNIT_DEAD`(b_char_tokendead) — 우리 시뮬레이션은 터진 바둑돌을 퇴장시키지만 `consumed`라 무음으로 둔다(공식이 이때 죽음 소리를
  내는지 자료로 확인 못 함 — 공식 녹화로 확인할 것). 동시에 여럿 터질 때는 공식 popOldest(최대 1~2) 그대로(2026-10-10, 키별 160ms 간격 삭제).
- 확인: `test/local-patch.test.js` 「望 client-data rules」(틱 수 = kitHit 수, 시뮬 수정 전 실패 확인), 「望 (maintainer report 2026-10-07)」, `test/local-patch-audio.test.js`
  「望 stone pop」·跟子 배치. 디버그 아레나(샌드백을 활성 바둑돌 칸으로 옮김) —
  S1 p_atk_stwctp_d + p_imp_stwctp_d, 이후 1초마다 p_imp_stwctp_d(총 7), S2 _h, S3 _s, 재배치 바둑돌 tkin, 재능 바둑돌 tkpa(tkin 없음).
- 望 S3 발동음 (관리자 제보 2026-10-08): 공식 `battle.ON_SKILL_START.skchr_wang_3` = **p_skill_stwctp_s**
  (Battle_UI_Boost; S1·S2는 시작 뱅크 없음). `tools/assets/plan.mjs`가 소리 있는 스킬이 하나뿐이고 그게 풀의 기본 스킬 번호가 아니면 `skill`도 `skills`도
  안 넣어 통째로 빠졌다 → 그 경우도 `skills`에 넣음. 같은 이유로 무음이던 琳琅诗怀雅 S3·普罗旺斯 S2·华法琳 S2(b_char_atkboost / healboost)도 같이 생김.
  매니페스트 재생성(fetch-assets)으로 바뀐 것은 이 4명 + 파일 1개(p_skill_stwctp_s.mp3). 디버그 아레나에서 S3 발동 때 p_skill_stwctp_s 재생 확인
  (아레나는 샌드백이 범위 밖이라 S3가 저절로 안 켜져서 `skill.activate`로 켬). 테스트 `test/local-patch-audio.test.js`.

## 랜덤 매칭·방 알림음 (관리자 결정 2026-10-14)
- 공식(EN 공식 클라): 매칭 화면 `AutoChessMatchingView.Render`가 결과(`AutoChessMultiMatchResult` NONE·CANCEL·SUCCESS·TIMEOUT)로 연출을 켜고,
  성공 연출 `_OnSucAnimChanged`가 `ON_ACT1AUTOCHESS_MATCH_SUCCEED`(act1autochess_g_ui_match_succeed, 2.0초), 시간 초과(`matchTimeMax` 120초) 연출
  `_OnFailAnimChanged`가 `ON_ACT1AUTOCHESS_MATCH_FAIL`을 낸다. 취소(CANCEL)는 소리 없음 — `MATCH_CANCEL` 뱅크는 데이터에 있지만 C# 코드에 재생하는 곳이 없다.
  방은 `AutoChessRoomState._HandlePlayersDeltaResult`가 새로 들어온 플레이어가 있으면 `ON_ACT1AUTOCHESS_PLAYER_JOINROOM`을 한 번(입장 토스트는 사람마다).
- 우리(`public/js/ui/matchQueue.js queueCue`): 4명이 모여 수락 창이 뜨는 첫 `room.matchFound` → `matchSucceed`(수락 수 갱신은 무음). 매칭이 본인 탓 없이
  깨짐 → `matchFail`: 그룹이 해산돼 큐로 돌아옴, 큐에서 빠진 이유가 `left`·`declined`가 아닌 모든 것(동료 거절·확인 시간 초과·방 변동·서버). 리메이크에는
  검색 시간 초과가 없어 이것들이 공식 TIMEOUT 자리. 본인 취소·거절 → `matchCancel` [추정: 공식 코드에 재생처 없음, 관리자가 취소음도 원함].
  수락 창 카운트다운(5초)도 아래 경고음을 낸다 — 아직 답하지 않은 사람만(리메이크 창, 공식에 없음).
- 방(`public/js/screens/room.js joinedDoctors`): 방 화면에서 room.state 사이에 자리에 앉은 박사(본인·AI 제외, 관전석에서 자리로 옮긴 사람 포함)가 있으면
  `joinRoom` 한 번. 다른 방(코드가 바뀜)이나 판이 시작된 room.state는 세지 않는다. 입장 토스트는 넣지 않았다.
- 숨은 탭: 오디오는 탭이 숨으면 멈추는데(`audio.js _onVis`), 대기 중(`ui.queue`가 있는 동안) `audio.keepAwake(true)` — 숨은 탭에서도 컨텍스트를 유지하고
  BGM·음성 채널은 0, UI 효과음만 난다. 큐가 끝나면 원래대로. 숨은 탭에서 그룹이 생기면 탭 제목이 1초마다 「匹配成功」과 번갈아 깜빡이고, 탭으로 돌아오거나
  그룹이 끝나면 멈춘다(`flashTitle`). 브라우저가 첫 클릭 전에는 오디오를 못 켜므로 매칭 시작 버튼을 누른 페이지에서만 확실하다.
- 확인: 단위 `test/ui/match-sounds.test.js`. 실제 판 확인 2026-10-14(관리자, 로컬 여러 탭): 다른 탭에서 성사음·제목 깜빡임, 실패음·취소음, 방 입장음(기존 인원만 들음).

## 카운트다운 경고음 (관리자 결정 2026-10-14)
- 공식(EN 공식 클라 `AutoChessCountDownView.SetCountDownNum`): 남은 초가 바뀔 때 `남은 초 ≤ 경고 시간`이면 위급 상태(막대·숫자 주황)이고, 위급이 아니다가
  위급이 된 순간 **한 번** `ON_ACT1AUTOCHESS_COUNTDOWN`(act1autochess_g_ui_countdown, 0.62초)을 낸다(처음 그릴 때 이미 위급이어도 한 번). 준비 여부는 보지 않는다
  — 정비·전투 막대(`AutoChessBattleUICountdownPanel.OnTick`)와 입장 단계 막대(`AutoChessOuterTopMenu`) 모두 같은 함수.
  경고 시간: 입장 단계는 `autoChessData.enterStepList` `hintTime`(INFO_CHECK 5·BAND_CHECK 15·BATTLE_CHECK 0, `config.timers`), 그 밖은
  `constData.hintTime{Normal,Special,Fight,Dot}Phase` 모두 10.
- 우리: `gameLogic countdownWarnAt`(위 값) → HUD(`hud.js TopBar`)·입장 단계 머리(`matchChrome.js StepHeader`, 정보 확인·전략 선택)의 `Countdown`이
  그 값에서 주황으로 바뀌고 `onWarn`으로 `timer` 한 번(`components.js warnCue`; 일시 정지 시계는 상태 유지). 기물 단계·전투·联防·보스전 모두.
- 예전(원본): 정비에서 준비 안 한 사람과 자기 机变 차례일 때만, 남은 10초부터 **매초** `timer`(음량 0.6). 주황 기준도 모든 단계 10초였다(정보 확인 5·전략 15로 바뀜).
- 확인: 단위 `test/ui/match-sounds.test.js`. 실제 판 확인 2026-10-14(관리자, 로컬): 경고음이 한 번만 남.

## 채팅 알림음 (관리자 결정 2026-10-14)
- 공식에 없는 기능(`feat`). 협동 방 채팅(방 화면·판 진행 중)에서 **다른 박사**의 새 줄이 오면 알림음을 낸다. 채팅창이 열려 있든 접혀 있든 같다.
  내 줄, 입장·재동기화 때 받는 기록(`room.chatlog`), 이미 받은 seq는 울리지 않는다(`public/js/ui/chat.js notifiesChat`).
- 소리는 하나: 공식 이모티콘 효과음(`sfx.ui.emote` = `ui.ON_ACT1AUTOCHESS_EMOJIDIALOGUE`, 받는 이모티콘과 같은 파일). 따로 음원을 저장소에 넣지 않는다.
  이 소리는 전투 믹스가 아니라서 자기 채널(`chatGain`, 스냅숏 버스 밖에서 마스터로 바로)로 내고, 음소거·탭 숨김을 따른다.
  숨은 탭에서는 랜덤 매칭 대기(`keepAwake`) 중이어도 울리지 않는다.
- 관리자 결정 2026-10-14: 기본 켜짐, 숨은 탭에서는 울리지 않음, 이모티콘 효과음을 그대로 씀(판 중에는 받는 이모티콘과 소리로 구분되지 않음).
- 설정(`ui/settings.js` 「채팅 알림음」): 켜기/끄기(기본 켜짐), 켜져 있을 때만 「알림음 볼륨」(기본 50, 움직이면 미리 듣기), 「알림 간격」 1~5초(기본 2초,
  정수), 「맹약 선택 알림」(기본 꺼짐: `kind: 'faction'` 줄은 이 스위치가 켜져 있을 때만 울림). 저장은 다른 설정과 같이 `sp.pref.settings`.
- 겹침 막기(`audio.js chatNotification`): 한 번에 하나, 마지막 알림이 **시작한** 때부터 간격(그리고 적어도 소리 길이 + 0.5초) 안에 온 줄은 **버린다**(쌓아 두었다가
  늦게 울리지 않음). 처음 불러오기가 2초보다 오래 걸려도 버린다. 미리 듣기는 꺼져 있어도 울리고, 울리던 것을 끊으며, 간격은 세지 않는다.
- 확인: `test/ui/audio.test.js` 「chat notification」, `test/ui/gameLogic.test.js` 「sanitizeSettings」, `test/local-patch.test.js` 「chat: … notifiesChat」.

## 맹약 층 효과음 (upstream #482, 2026-10-15)
- upstream `221e6b8d`(0.2.5-dev, upstream #482)를 손으로 옮겼다. 맹약의 층이 오르면 `bondUp` — 공식 뱅크 `battle.ON_ACT1AUTOCHESS_ADD_BOND`
  (`act1autochess_b_ui_buffup`, `tools/assets/audio.mjs UI_SFX`). 그 전에는 정비 중 켜진 맹약 수가 늘 때만 났다.
- 언제: 回合开始·机变·休整期에 자기 맹약 층이 오름 → 서버가 그 플레이어에게만 `m.layer {playerId, bondId, add}`(`server/match/player/economy.js
  addLayers`, `shared/protocol.js` S2C) → `main.js`가 자기 것이고 게임 화면일 때 `audio.layerGain`. 전투 중에는 화면의 필드가 보내는 `layer` 튜플
  (`server/sim/battle/economy.js addLayers`) → `audio.js handleBattleEvents`. 한 번에 몇 층이 오르든, 꺼진 맹약이어도 한 번. 맹약이 새로 켜질 때의 소리는
  그대로이고 같은 채널을 쓴다 — 같은 갱신에서 층도 오르고 맹약도 켜지면(400 ms 안, `bondCueRecent`) 한 번만 난다.
- 재생: 공식 뱅크 값(zh_CN `audio_data.json`) `maxSoundAllowed` 1·`popOldest` true·피치 1.0·믹서 그룹 `Battle_UI_Important` → 매니페스트 `sfx.bank`의 그 파일 값
  `[1, 1, 1, 1]`로 `SfxLimiter` 채널 `ui:bondUp` 하나(위 「효과음 재생: 피치·동시 재생 상한」과 같은 규칙; 매니페스트에 값이 없어도 1·popOldest). 새 소리가
  재생 중이거나 아직 불러오는 소리를 바로 끊는다. 쿨다운 없음. 음량은 예전 맹약 켜짐 소리의 0.7 그대로(UI 효과음 — 믹서 그룹 게인은 안 씀).
- 안 나는 것: 재접속·재동기화(뷰에는 소리 신호가 없다), 전투 층의 결산 합산(`settle.js`가 층을 직접 더함 — 그 층은 전투 중에 이미 소리가 났다), 늦게 들어간 필드의 이벤트
  재생(`screens/game/early.js keepEarly`에 `layer` 없음)과 클라 전투 따라잡기 프레임(`battle/runner.js`도 상태 이벤트만), AI 자리.
- 끊는 때: 새 필드에 들어감(`setFieldUnits`), 게임 화면을 떠남, 음소거·효과음 0. 전투 국면이 끝나거나 정비 화면으로 돌아오면 전투에서 난 소리만 끊는다 —
  回合开始의 `m.layer`가 그 국면의 `m.public`보다 먼저 올 수 있어서 정비 쪽 소리는 남긴다(`installAudio`, `screens/game.js`).
- 옮긴 방식: upstream은 `_playBondCue`가 노드·토큰을 따로 들고 있었는데, 우리 오디오는 `8a279320`부터 공식 `SoundFXBank` 구조(`_play` + `SfxLimiter`)라 뱅크 채널
  하나로 옮겼다(`_play`의 `channel`, `SfxLimiter.cut`). upstream의 브라우저 e2e(`test/ui/bond-audio.e2e.test.js`)는 옮기지 않았다.
- [ASSUMED] 공식이 이 소리를 내는 순간: EN 공식 클라에 이벤트 이름 상수(`AudioSignals.ON_ACT1AUTOCHESS_ADD_BOND`)만 있고 그 문자열을 쓰는 곳을 찾지 못했다
  (2026-10-15). 어느 단계에서 나는지, 전투 중 같은 필드의 다른 박사(联防·보스전) 층에도 나는지는 upstream 판단을 따랐다 — 전투에서는 화면 필드의 모든
  `layer`에 난다(렌더의 층 팝업과 같음).
- 확인: `test/ui/bond-audio.test.js`(채널·끊기·디코딩 경합·되채움 없음·한 갱신 한 번), `test/match/bond-audio.test.js`(실제 `Match`로 `m.layer`: 단계별·상한·AI 없음).
  [실제 판 이상 없음 2026-10-28] 回合开始·机变·정비 구매(예: 마터호른 두 장 — 쉐라그·고수 층)·전투 중 층 얻음에 소리, 재접속 때 안 남.

### 연쇄 공격 소리 (2026-10-16, 관리자 요청 「레이즈 효과음이 기억과 달라」)

- 공식 클라(`audio_data.json`): 연쇄 투사체는 맞힌 대상마다 `Projectile.OnHitTarget`이
  `ON_PROJECTILE_HIT.<투사체 키>`를 그 대상 자리에서, `ON_PROJECTILE_REACH`는 첫 대상 도착 때 한 번, 대상이 2명 이상이면
  `ChainLightningHitBehaviour.PlayChainAudio`(→ `Projectile.PlayBehaviourAudio`)가 마지막 대상 자리에서
  `ON_PROJECTILE_BEHAVIOUR_TRIGGER.<키>`를 한 번 낸다(`_overrideAudioSignal`이 없으면 키 = 투사체 이름).
  - 레이즈: 타격 `ON_PROJECTILE_REACH.projectile_leizi` `p_imp_elecmag_n`(S2 `_s2` → `_s`) 한 번 + 연쇄음 `p_imp_elecmag_n_combine`(S2
    `_s_combine`, 뱅크 동시 1, 지연 0.1 s). S2 모드는 `_addIndexToSignalId`라 공격 신호가 `char_306_leizi.attack.1` — 뱅크 없음, 시전음 없음.
  - 패신저: 타격 `ON_PROJECTILE_HIT.projectile_chr_pasngr` `p_imp_thunder_n`(S2 `_s`)이 대상마다(뱅크 동시 2, 오래된 것부터 끊음), 연쇄음 뱅크 없음.
- 예전: 연쇄음이 매니페스트에 없었고(파일도 안 받음), 튕긴 대상의 피해가 「같은 순간의 스플래시」로 처리돼 레이즈의 도착음이 대상마다 났다.
- 고친 것: `tools/assets/skill-mode-sfx.mjs soundSet` — 모드 투사체의 `ON_PROJECTILE_BEHAVIOUR_TRIGGER` 뱅크를 단서 `at: 'c'`로, REACH 단서에
  `r: 1`(한 발에 한 번). `public/js/audio.js` — 튕김 'atk'('chain')이 친 대상을 기억하고(`chainStruck`), 그 대상의 'dmg'에서는 `r` 단서를 빼고
  타격음을 내며 연쇄음 `'c'`를 그 순간 시전자당 한 번. 매니페스트 재생성(`fetch-assets --add-only`): 레이즈만 `'c'` 단서, 19명은 REACH 단서에 `r`만.
- 확인: `test/local-patch-attack-signals.test.js` 「a chain shot's sounds」(옛 코드에서 실패 확인). [브라우저 미확인: 실제 판에서 레이즈 연쇄음·패신저 대상별 타격음]
