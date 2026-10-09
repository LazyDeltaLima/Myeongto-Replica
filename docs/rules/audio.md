# 소리·음성

옛 `docs/LOCAL-PATCH.md`에서 2026-10-09에 나눈 파일이다. 옛 절 이름은 `docs/LOCAL-PATCH.md` 색인에서 찾는다.

## 오퍼레이터 음성 (2026-10-05, 원본 #73 병합 후 2026-10-06 정리)
원본 #73(`54cdad2`, DESIGN §21.30 「干员战斗语音」)이 전투 음성을 넣어서, 재생 규칙은 원본을 따르고 로컬 패치는 두 가지만 남겼다(관리자 결정 2026-10-06).
- 원본이 하는 것: 전투 중에만 공식 슬롯 12개 — 행동 출발(처음 배치된 오퍼레이터)·배치(나머지)·행동 개시(첫 타격, 엔진 `engage` 이벤트)·
  전투 중 선택(상세 패널)·작전 중 1~4(스킬 번호)·결산 4종. 한 번에 하나, 간격 1.2초, 유닛·슬롯별 쿨다운, 공식 우선순위(VoiceGate).
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
  대사 없음. 근거: 클라이언트 정비 말 관리자 `AutoChessDummyManager._OnCharacterPlaced(placeToBattle, placeToHand)` → `_PlayAudioWhenCharacterPlaced`
  (이름만 — 그 소리에 대사가 들어 있다는 것은 관리자의 플레이 기억 [추정]).
  확인: 실제 솔로 판(Chrome, 실제 마우스 끌기 + 방향 확정) — 배치음 b_char_set + 배치 대사, 자동 배치·정비 복귀는 대사 없음; 상점 카드 클릭 구매 → 배치음만,
  탭 3번 → 선택 대사 3번, 드래그 → 없음. 단위 `test/local-patch.test.js` 「部署 line」.
  **0.2.0 선발·补位 (2026-10-08)**: 0.2.0의 선발 슬롯 기록(`chess_char_*_diy*`)은 `charId`·`assets`가 비어 있어 정비 탭이 말이 없었고,
  补位 기물은 대체된 원래 오퍼 목소리로 말했다 → `screens/game.js`가 내 기물이 보여 주는 기록(`ownShown`: 선발 픽의 오퍼, 补位는 대체 오퍼 — 预备干员은
  음성 뱅크가 없어 전투 중 탭처럼 조용)을 `voiceForPiece(piece, shown)`에 넘긴다. 스킬 대사 유형(`voicePolicy skillOf`)도 슬롯·원래 오퍼의 스킬을 봐서
  자동 스킬이 모두 수동(70, 쿨다운 없음)이었다 → `voice.js unitSkillOf`: 유닛 모델(`spine`)이 기록의 `charId`와 다르면 그 캐릭터의 기물 상태 폼
  (`data/backups.json`, 스킬 번호)으로 — 望 S1/S2·阿斯卡纶 S1은 SKILL_PASSIVE_IMP, 维什戴尔 S1은 _NOR. `voiceForPlace`는 렌더 정보의 `spine`을 써서 원래 맞음.
  확인: 실제 솔로 판(전부 补位 + 디버그 패널 선발 3명, 마우스 탭, 4라운드), 단위 `test/local-patch.test.js` 「自选 / 补位」.
- 이전 로컬 패치에서 뺀 것: 작전 개시(무작위 한 명)·스킬 대사·자체 겹침 규칙·자체 음량 — 원본 것으로 대체.
- 로컬 3 — 공식 재생 규칙(2026-10-06, 관리자 결정; `public/js/voicePolicy.js`를 `voice.js`가 설치, `audio.js`에는 훅 몇 줄):
  클라이언트 `audio_data.json battleVoice` 값 그대로 — 전체 간격 없음, 우선순위(행동출발 100·행동개시 90·수동 스킬 70·자동 스킬 60/50(SP 10 이상/미만)·
  배치 20·선택 10), 같은 우선순위는 유형이 겹침 허용(행동출발·수동 스킬·배치·선택)이면 앞 대사를 끊고, 아니면 버림, 쿨다운은 자동 스킬 10초만(오퍼레이터별).
  원본 #73의 1.2초 간격·「+10 이상이어야 끊음」·모든 스킬 10초/70은 공식 값과 달라 스킬 대사가 많이 빠졌다(데이터로 확인).
  선택 대사 쿨타임(관리자 질문 2026-10-08): 공식에도 없다 — `audio_data.json battleVoice`
  FOCUS_CHAR `cooldown 0`·`overlapIfSamePriority true`(데이터), 卫戍协议 `AutoChessGameModeVoicePlugin._OnCharacterHighlighted`(이름) → 다시 선택하면 재생 중
  선택 대사를 0.1초 크로스페이드로 끊고 새 대사. 우리도 같다(원본 #73의 선택 1.5초 쿨다운은 이 규칙으로 이미 빠짐). 선택이 「강조가 바뀔 때만」인지(이미
  강조된 말을 다시 집을 때)는 네이티브라 확인 못 함 [추정: 집을 때마다]. `test/local-patch.test.js` 「official scheduling」.
  대사 우선순위(관리자 제보 2026-10-08, 실제 게임: 스킬 대사 중에는 선택 대사가 나지 않는다): 위 게이트가 이미 그렇다 —
  선택(FOCUS_CHAR 10)은 스킬(70) 재생 중이면 버림, 스킬은 선택을 끊음, 같은 우선순위는 `overlapIfSamePriority`대로(데이터). 클라이언트 이름:
  `BattleVoiceOption`·`BattleVoiceType`·`CheckIfNeedPlayCharVoiceFromSingleSelect`(로직은 네이티브 — 「낮은 우선순위는 높은 것을 못 끊는다」는
  필드 이름 priority/overlap에서 본 [추정]; 데이터에 `NORMAL_ATTACK` 5·쿨다운 36000초도 있으나 우리는 평타 대사 없음). Chrome 확인:
  스킬 대사(4.6초) 중 선택 → 버림, 끝난 뒤 선택 → 재생, 선택 중 스킬 → 끊고 재생.
  클래스·필드 이름으로 추론해 관리자가 공식대로 정한 것: 작전중 대사는 1~4 중 무작위(`LoadRandomVoiceList`), 행동 개시는 전투당 1번
  (`m_encounterFirstEnemyFlag`, 버려진 시도는 3초 뒤 다시), 전투 시작은 한 명만 행동출발이고 나머지 첫 배치는 말하지 않음
  (`AutoChessGameModeVoicePlugin._OnCharacterPlacedAtBattle`; 2초 뒤 재배치는 배치 대사). 원본 테스트는 원본 `VoiceGate` 그대로라 깨지지 않는다.
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
  공격·타격음은 아래 「스킬 모드 효과음·믹서 볼륨」(2026-10-07)에서 구현. 알려진 빈 곳: 荒芜拉普兰德 S1/S2 드론처럼 키트가 직접 주는 피해 중 매핑 안 된 것.

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

  - **평타는 Default 모드 소리만** (관리자 제보 2026-10-07): `tools/assets/skill-mode-sfx.mjs defaultModeBanks` — 모드 정보가 있는
    오퍼레이터는 스킬 모드 번호의 `ON_ABILITY_*.attack|combat.<n>` 뱅크를 평타 후보에서 뺀다(银灰 S3 `p_atk_silver_n`, 号角 S2 포격 시전음, 丰川祥子 S3,
    圣约送葬人 S3_End, 雷蛇 S2가 평타마다 나던 누수). `.0…`(Default `_includeIndexZero`)은 파일 접미사와 상관없이 Default 것(`audio.mjs pickUnitSfx opts.defaultZero`
    — 丰川祥子 `p_atk_mjckyrdnt_h`). Default 투사체(charpack `_projectileKey`, 银灰 `projectile_svrash`)의 BORN/HIT/REACH를 이름 추측보다 먼저(prove·slchan·
    skgoat·vodfox·leizi·rosmon에 타격음이 생김). [추정] Default에 공격 뱅크도 투사체 뱅크도 없는 玛恩纳·蜜蜡·薄绿·卡涅利安·sbell2는 예전 것(스킬 모드 `_n`
    파일)을 남긴다 — 스킬 없이 평타만 치는 공식 영상으로 무음이 확인되면 예외를 뺀다.
  - **르무엔 S3 효과음** (관리자 제보 2026-10-07): `kit-sfx.mjs KIT_HIT_BANKS` `lemuen:mark` = `ON_BUFF_SHOW_EFFECT.char_lemuen_range_aim`(S3 'lock'마다), `lemuen:s3end` =
    `ON_ABILITY_START.char_4193_lemuen.attack.4`(S3_End 모드, 첫 'bombardShell' i 0), `lemuen:shell` = `ON_PROJECTILE_REACH.projectile_chr_lemuen_s3_attack`('bombard'마다),
    `audio.js kitHitKey` 3줄. `lemuen_s3_audio_triggered`(p_atk_lmwlcrstr_s)는 시점이 불확실해 뺐다.
  - **kit 소리 동시 재생 = 공식 popOldest**: kit 뱅크 22개는 공식에서 모두 `popOldest true`, 상한(`maxSoundAllowed`) 1–3. plan이 `kit-sfx.mjs kitHitLimits`로
    `audio.sfx.kitLimit[key] = { max, pop }`에 싣고(`audio.mjs indexAudio limitOf`), `audio.js _play({ pop })`가 같은 파일이 상한에 차면 가장 오래된 복사본을 끊고
    새 소리를 낸다(르무엔 착탄 5발 모두 — 예전엔 셋째부터 빠짐). 상한 1인 키(wang:1·wisdel:s2·whitw2:s2/s3·lemuen:mark)는 겹치던 두 번째 대신 앞 소리를 끊는다.
    일반 유닛·전투 소리는 그대로(`MAX_PER_URL` 2, 넘으면 버림). 유닛별 160 ms 간격은 kit에도 걸려 2× 속도에서는 일부 빠질 수 있다.
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
      `AllLowpass_Reverb`: 归溟幽灵鲨 `ON_BUFF_START.ghost2_switch2stand`(5 초), 浊心斯卡蒂 배치·S1–S3 시작(0.1 초; `@JP` 등 더빙 사본은 같은 훅이라 뺌).
      스냅샷 값(EN `sharedassets1.assets` 믹서 상수, Default와 비교 **[데이터]**): BattleGameSound(Music·Voice·전투 그룹 전부의 부모) Lowpass 22000 → 556 Hz,
      SFX Reverb 켜짐(dry −6696 mB, room 0, room HF −1594 mB, decay 5.7 초, reverb −219 mB, reverb delay 0.0464 초), Music Lowpass 22000 → 5000 Hz.
      훅 뱅크 자신은 `Independent` 그룹(BattleGameSound 밖)이라 또렷하게 남고 나머지가 가라앉는다.
      - 생성: `audio.mjs indexAudio` `snapshots`, `skill-mode-sfx.mjs snapshotSfx` → `sfx.snap = { hook: { url: { snap, dur, delay? } }, outside: [url] }`
        (outside = 매니페스트에서 Independent 그룹인 파일 6개: 훅들 + 대역 sharpstandspell). 매니페스트 diff는 `snap`·hash뿐.
      - 재생: `public/js/audioSnapshot.js`. `audio.js unlock`이 세 채널을 `bus`(BattleGameSound)로 모아 master에 잇고, `sfxOutside`는 bus를 건너뛴다
        (`sfx.snap.outside`와 UI 한 번 소리 — SFX_UI도 bus 밖). 첫 훅에서 bus → lowpass → dry → master, lowpass → convolver(5.7 초 감쇠 잡음, 46 ms 지연) → wet → master를 만든다.
        리버브는 꼬리가 끝나면 입력을 끊는다(convolver 비용).
      - **[추정]**: 시점 규칙 — 훅이 시작되면 `delay` 뒤 `dur` 초 동안 스냅샷으로, 훅 소리가 끝나면 같은 `dur`로 Default로(클라이언트 `SnapshotTransition`·
        `TransitionToDefaultSnapshot`은 네이티브. 浊心斯卡蒂의 0.1 초가 「유지 시간」이면 의미가 없어 전환 시간으로 읽음). 겹치면 마지막 훅이 끝날 때까지 유지.
        리버브는 초기 반사 없는 평탄한 잡음 꼬리. 안 한 것: Music 자체 5000 Hz(556 Hz 안쪽이라 차이 없음), 스냅샷의 그룹 볼륨 차이(몇 dB, 옛 레벨이 남은 것으로 보임).
      - **휘두름 + 타격** (관리자 제보 2026-10-08): 능력에 START 뱅크(휘두름,
        공격 그룹)와 **타격 그룹**(Battle_P_SImp / NImp)의 ON 뱅크가 둘 다 있으면 공식은 둘 다 낸다 — 耀骑士临光 S3 `attack.3` START p_atk_goldspear_s + ON p_imp_goldspear_s.
        생성기는 ON을 START가 없을 때의 대체로만 써서 타격음이 빠졌다(아래 缄默德克萨斯의 `noHit`까지 붙음). `skill-mode-sfx.mjs onImpact`(정확한 키만) → 모드 `hit`(`modeSounds`)과
        평타 `hit`(`audio.mjs pickUnitSfx` `opts.impactOf`, plan 1줄). 바뀐 것(매니페스트 diff 그대로): 모드 — 耀骑士临光 S3, 归溟幽灵鲨 S3, 夕 S2·S3, 卡涅利安 S1–S3(이 7개의 `noHit` 빠짐);
        평타 — 夕·莫斯提马·水月·野鬃. ON만 있는 능력(缄默德克萨斯 S2)·하위 능력에만 START가 있는 것(号角 S2)은 그대로. 새 sfx 10개.
        S3 발동 순간의 소리(b_char_atkboost·p_skill_goldspearboost1·耀阳 검 탄생 p_skill_goldspearset)는 이미 났다 — 이격 니어의 공식 뱅크는 이것으로 전부.
        확인: `test/local-patch-skill-impact.test.js` 3개(실제 매치 경로: S3 공격마다 휘두름·타격 둘 다). [브라우저 미확인]
      - 耀骑士临光 S2: S2는 `kind: 'duration', activateOnDeploy`라 'skill'이 'spawn'보다 먼저 오고,
        배치 전 'skill' 잡아 두기(아래 缄默德克萨斯 ①)로 `p_skill_goldspearboost`가 난다(실제 경로 테스트로 고정).
      - 확인: `test/local-patch-skill-snapshot.test.js` 6개(매니페스트, 공식 데이터 규칙, 가짜 Web Audio 그래프의 램프 556 Hz/5 초·복귀·bus 밖 경로, 실제 매치 경로
        归溟幽灵鲨 S2 → 대역 → 스냅샷 켜짐, 耀骑士临光 S2 배치 소리). [브라우저 미확인] 새 소리 파일 없음.
    - 缄默德克萨斯 S2 타격음: ① 배치 즉시 켜지는 스킬(`activateOnDeploy`: S1–S3)은 'skill'이 그 유닛의 'spawn'보다 먼저 와서(실제 경로 확인) 오디오가 버렸다 →
      `audio.js`가 추적 전 유닛의 'skill'을 잡아 두었다가 'spawn'(같은 묶음에 'deploy'가 있으면 그 'deploy')에서 처리, `screens/game.js` 작전 시작 early 버퍼도 'skill'을
      넘긴다(1줄). ② 모드 능력에 공격 뱅크만 있고 HIT 뱅크가 없으면(S2 `attack.2`는 `ON_ABILITY_ON` p_imp_reticentsword_h뿐) Default의 HIT(p_atk_reticentsword_n)는
      나지 않는다 → `skillModes`가 `noHit: true`, `audio.js unit()`이 그 모드의 타격음을 비운다. 실제로 바뀐 오퍼: texas2 S2, ghost2 S2/S3, gvial2 S2, svash2 S3,
      whitew S2, rosmon S2/S3, pepe S3, mlynar S2/S3(나머지 16명은 Default 타격음이 원래 없음). [추정] 뱅크가 없으면 무음(클라이언트 재생 코드는 네이티브).
    - 확인: `test/local-patch-skill-music.test.js` 6개(수정 전 6개 모두 실패 확인 — 실제 경로 Match → buildBattleSpec → createBattleFromSpec 이벤트를 AudioManager에),
      Chrome Web Audio 계측(AudioBufferSourceNode start/stop을 파일 이름으로): 디버그 아레나 nearl2 S3·cello S3·ghost2 S2·texas2 S2,
      실제 솔로 판(로드아웃 + 재화 고정 + 상점 리롤로 구매) texas2 S2·ghost2 S2. cello·nearl2(6성)는 상점에 안 나와 실제 판 확인 못 함. 새 sfx 21개.

## 작전 종료 효과음 (2026-10-07)
- 관리자 제보: 공식 효과음 3개는 이미 웹 매니페스트에 있었다(`sfx.ui.battleOverReduce` / `battleOverNoReduce` /
  `battleOverNormal` = `act1autochess_b_ui_battleover_reduce|noreduce|normal.mp3`, 뱅크 `ui.ON_ACT1AUTOCHESS_BATTLEOVER_*`, 각 1.4초) — 받기만 하고 재생하는
  곳이 없었다.
- 재생: 내 일반 전투(COMBAT)의 결과가 오면(`screens/game.js onResult`, 전투 종료 배너와 같은 자리), 배너 그림(로컬 추출)이 없어도 소리는 낸다.
  결과가 안 온 라운드는 SETTLE에(`settleBattleEnd`), 라운드마다 한 번 — upstream SETTLE 효과음(`battleOverSfx`)은 지움(`upstream.md` 「0.2.0 병합」).
- 어느 소리인지(`audioOfficial.js battleOverOf`): 셈하는 누수(LP 감소) → REDUCE(뱅크 이름 그대로), 누수 없음(완벽한 작전) → NOREDUCE [추정],
  셈하지 않는 누수만 → NORMAL [추정]. 클라이언트 `round_result_dialog`의 애니메이션 3개(`_allPrefectAnim`·`_perfectAnim`·`_missAnim`)와 짝으로 봤다.
  어느 애니메이션이 어느 뱅크를 부르는지는 네이티브 코드라 확인 못 함 — 세 파일은 음색·길이가 거의 같은 변형이다. 공식 영상(소리 있는 것)으로 확인하면 좋다.
- 联防·보스 라운드에는 내지 않는다(공식 결과 창이 다른 프리팹). `killBoss*`·`defenceStart`도 아직 연결 안 됨.
- 테스트: `test/local-patch-battleover.test.js`.

## 배치 효과음 — 어떤 경로로 놓이든 (관리자 제보 2026-10-07)
- 관리자 제보: 정비 단계 배치·구매·보상에서 배치음이 나지 않았다. 소환물도 배치음이 있고, 望 바둑돌은 수동 배치·재능 배치 모두 소리가 난다(관리자 확인).
- 원래: 전투의 'deploy' 이벤트에서만 났다(라운드 시작 배치는 실제 판에서 확인함 — b_char_set 7 + 자기 소리). 정비 단계 배치·구매·보상·벤치 복귀는 무음,
  구매는 상점 소리 `ON_ACT1AUTOCHESS_MAGIC_PLACE_HAND`(b_char_tokenset = 소환물 배치음)였다.
- 공식 자료(EN `audio_data.json`): 유닛 탄생 `battle.ON_UNIT_BORN.<id>`(전용) → `.char` b_char_set / `.token` b_char_tokenset, 그룹 Battle_UI_Important.
  우리 로스터의 전용 배치음은 매니페스트에 이미 다 있다(`sfx.units[id].born`): 오퍼레이터 15명(望 b_char_stwctpbn, 余 p_skill_frbytrtn_bn, 斯卡蒂2 등),
  소환물 11종(望 棋子 p_imp_stwctptkin, 维什戴尔 wward, 诅咒娃娃 등). 卫戍协议에는 「말 놓기」 전용 뱅크가 없다(`act1vautochess` SHOP_DROP=b_char_set은 다른 모드)
  → 정비 단계도 유닛 탄생 소리를 쓴다 [추정: 공식 정비 화면이 유닛을 전투 유닛처럼 그리고, 놓일 때 Start 낙하가 나온다 — `render.md` 「배치 낙하」].
- 고친 것: 소리는 정비 화면의 **낙하 연출과 같은 곳**에서 난다 — `render/app.js` setPrep이 내 보드·벤치 상태를 이전과 비교해 낙하(onDeploy)를 틀 때
  `pieceDeploy` 이벤트(`prepDeployed`) → `screens/game.js` → `audio.prepDeploy` → `playDeploySfx`(전투 'deploy'와 같은 함수: 전용 소리 → 공용, 공식 믹스).
  서버가 넣어 주는 보상(정예화 보상·결산 보상)도 상태 비교라 잡힌다. 경우별:
  - 소리 남: 구매·보상으로 벤치 도착, 벤치→보드, 소환물(전용 또는 b_char_tokenset), **전투 뒤 정비로 돌아올 때 보드의 말**(`backFromBattle` — 관리자 결정
    2026-10-08 「라운드 종료 후, 배치 단계 진입할때도 배치음이 나오는게 맞아」), **협동 정비에서 남의 보드를 보러 갈 때 그 보드의 말**(관리자 결정 2026-10-08:
    남의 보드도 소리 남)과 내 보드로 돌아올 때 [추정: 돌아올 때도 같은 규칙]. 벤치 말은 낙하만.
  - 소리 없음: 보드→벤치 복귀(낙하는 함 — 관리자 제보 2026-10-08), 판매, 페이지 로드·재접속
    첫 동기화, 전투 뒤 벤치 복원, 3장 합성 엘리트(합성 연출·`merge` 소리), 장비, 남의 보드(정탐은 전투 화면).
  - 낙하(관리자 제보 2026-10-08): 전투 뒤·정탐 뒤 내 정비로
    돌아올 때 말 전부(벤치 포함 [추정: 클라이언트 정비 말은 칸·슬롯에 새로 만드는 더미]), 정탐한 보드(`enterBattle({prep})` → `battleView`)의 말 전부가
    떨어진다. 같은 보드에 다시 들어오면(팀원이 말을 옮겨 m.field가 새로 옴, `scoutSeen`) 새로 왔거나 옮긴 말만. 실제 협동 판(봇 3, 2라운드 — 팀원 줄 클릭 →
    「보러 가기」 → 내 줄)에서 ROUND_START:2·정탐·복귀 모두 onDeploy + b_char_set, 낙하 확인.
  - 벤치→보드를 실제 UI로(끌어 놓기 → 방향 휠 → 확정) 하면 소리·낙하가 없었다(관리자 제보 2026-10-08):
    휠의 `holdPiece`가 그 칸을 뷰의 집(`_home`)으로 만들어 `moved`가 false라, 놓은 지 1.3초(`DROP_PENDING_MS`) 안에 온 상태는 「서버 적용 전」 분기로
    빠졌다(`actions.move`를 직접 부르는 확인은 이 경로를 타지 않는다). 상태에 보드로 새로 나타난 말은 그 분기에서 뺀다. 확인: 실제 마우스 끌기 + 방향키로
    0.3초·2초 뒤 확정 모두 onDeploy + b_char_set.
  - 한 틱에 여럿(서버 자동 배치가 8~12개를 한 번에): 기존 제한기(같은 소리 45ms 간격·동시 2개)가 1~2번으로 줄인다.
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
  내는지 자료로 확인 못 함 — 공식 녹화로 확인할 것). 동시에 여럿 터질 때 공식 popOldest(최대 1~2)보다 우리 제한기(키별 160ms)가 더 줄인다.
- 확인: `test/local-patch.test.js` 「望 client-data rules」(틱 수 = kitHit 수, 시뮬 수정 전 실패 확인), 「望 (user report 2026-10-07 #5)」, `test/local-patch-audio.test.js`
  「望 stone pop」·跟子 배치. 디버그 아레나(샌드백을 활성 바둑돌 칸으로 옮김) —
  S1 p_atk_stwctp_d + p_imp_stwctp_d, 이후 1초마다 p_imp_stwctp_d(총 7), S2 _h, S3 _s, 재배치 바둑돌 tkin, 재능 바둑돌 tkpa(tkin 없음).
- 望 S3 발동음 (관리자 제보 2026-10-08): 공식 `battle.ON_SKILL_START.skchr_wang_3` = **p_skill_stwctp_s**
  (Battle_UI_Boost; S1·S2는 시작 뱅크 없음). `tools/assets/plan.mjs`가 소리 있는 스킬이 하나뿐이고 그게 풀의 기본 스킬 번호가 아니면 `skill`도 `skills`도
  안 넣어 통째로 빠졌다 → 그 경우도 `skills`에 넣음. 같은 이유로 무음이던 琳琅诗怀雅 S3·普罗旺斯 S2·华法琳 S2(b_char_atkboost / healboost)도 같이 생김.
  매니페스트 재생성(fetch-assets)으로 바뀐 것은 이 4명 + 파일 1개(p_skill_stwctp_s.mp3). 디버그 아레나에서 S3 발동 때 p_skill_stwctp_s 재생 확인
  (아레나는 샌드백이 범위 밖이라 S3가 저절로 안 켜져서 `skill.activate`로 켬). 테스트 `test/local-patch-audio.test.js`.
