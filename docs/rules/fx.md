# 공식 전투 이펙트

원래 `docs/LOCAL-PATCH.md` 한 파일이던 것을 2026-10-09에 영역별로 나눴다(내용은 그대로 옮김, 색인은 `docs/LOCAL-PATCH.md`). 본문의 「아래」「위」는 옛 한 파일 기준이라 다른 파일에 있을 수 있다 — 절 이름으로 `docs/LOCAL-PATCH.md` 색인이나 `grep -rn "<이름>" docs/rules/`로 찾는다.

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
  성능(2026-10-05, `research/2026-10-05-review-notes.md` "WebAssembly 포팅 검토"): 입자 수는 카운터로, 프레임마다 만들던 배열·객체
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
- 디버그: `/debug.html` — 샌드백 아레나 (2026-10-07, 사용자 요청 「스킬 효과음·타격음·스킬 이펙트 디버깅」).
  - 손패 기물 (사용자 요청 「望처럼 함정 기물을 쓰는 오퍼레이터 처리」): 고른 오퍼레이터의 `placeable` 기물(tokens.json·diy.json: 望 棋子 6, 赫默
    医疗探机, 巫恋 诅咒娃娃, 凯瑟琳 防护单元 2, 斯卡蒂 海嗣, 伺夜 狼群·缪尔赛思 流形 = 공격 범위 안에만)을 보드의 토큰 기물처럼 전투에 넣는다
    (`sandbag.js ownTokens / autoTokens / createSandbagBattle cfg.tokens` — PlayerState battleInput과 같은 `{ kind: 'token', tokenId, ownerUid }`).
    기본은 한도만큼 오퍼레이터 앞쪽 빈칸에 자동 배치, 「기물 놓기/치우기」 모드에서 타일 클릭으로 편집(한도·공격 범위 규칙 적용). 게임의 전투 화면
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

- (스킬 타격 효과음 · 스킬 모드 효과음·믹서 볼륨은 `docs/rules/audio.md` 「스킬 효과음」으로 옮겼다.)
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
  - 전 오퍼레이터 추출 (2026-10-07, 비교 조사 `compare-fx.md` 12번 — 공식과의 차이로는 가장 컸던 것): 풀 126명 중 이펙트가 없던 99명의 번들을
    기본 스킨 전체로 추출(`fx_extract.py --bundle …` ×99, 11분, 오류 0). 번들 125개·프리팹 1,955개, `public/assets/local/fx` 25 → 58MB.
    클라이언트에 전용 번들이 없는 2명(엑시아 `char_103_angel`, 피스 `char_616_pithst`)은 절차 이펙트 그대로. 배포: git 밖이라 서버로 rsync.
    Windows Chrome 일괄 점검(124명 × 스킬 372개, 페이지 오류 0): 바인딩 시전 이펙트가 있는 187개 중 156개 재생(나머지는 측정 창 2.6초 안에 공격이
    없거나 시뮬레이션에서 스킬이 공격 전에 끝나는 경우). 이 추출로 두 가지를 고쳤다 — ① 자기 스킬 이펙트가 번들에 없는 스킬(저티어 S1 다수: 공식은
    추출 안 된 공용 버프 이펙트)은 발동 표시가 아예 없어졌다 → `ownsSkill`이 그 스킬에 공식 start/buff/모드 이펙트가 있을 때만 참(아니면 절차 금색
    빛기둥), ② 모드 바인딩 없는 스킬의 지속 범위(사리아 `skgoat_skill_01_range`): `fxmap.js effectsFor('skillBuff')`에 `…_range(_0N)` 1개 추가, 모드
    `attach`와 합쳐 중복 없이 한 번.
  - 추출 범위: 바인딩된 이펙트 241개 중 69개가 추출본에 없었다(예전 추출이 스킬 일부만) → 16개 번들(nearl2 siege2 whitw2 blaze2 angel2
    sbell2 dusk yu cello aglina rosmon titi pepe mlynar lemuen pasngr)을 기본 스킨 전체로 다시 추출(`fx_extract.py --bundle …`, 19→25MB). 남은
    3개는 aglina가 다른 번들(`glassb_*`, `common_magic_trail_01`)을 씀.
  - `stats().recent`(최근 시작한 프리팹 24개)를 `/debug.html` 로그가 「✦ 이펙트 재생」으로 보여 준다.
  - 모드 버프 이펙트 `attach` (2026-10-07 사용자 제보 「丰川祥子 S3 범위 이펙트가 안 보인다」): 모드의 Talents 능력이 거는 버프의
    `overrideEffectKey`(丰川祥子 S3 `oblvns_s_3[eff]` → `oblvns_skill_03_range`)를 `char_modes.py`가 모드별 `attach`로 뽑고, `fxgame.js`가 그 스킬이
    켜져 있는 동안 오퍼레이터 아래 층에 버프로 띄운다(스킬 끝에 멈춤). 공격이 대상에 거는 버프(`_activeBuffs`)는 넣지 않는다. 모드 능력이 붙이는
    이펙트도 같다: 시전기의 `_attachEffects`와 능력의 `_effects` 목록(비르투오사 S3 `GeneralAbilities` → `cello_skill_03_buff_01`·`_front_02`·
    `_buff_range`, 阿斯卡纶 S3 `ascln_skill_03_range_01` — 사용자 제보 「비르투오사 S3 range도 안 보인다」).
  - 검은 사각형 (2026-10-07 사용자 제보 「비르투오사 공격·望 바둑알 십자 이펙트에 검은 배경」): 이펙트 층은 페이지 위의 투명 캔버스인데
    `premultipliedAlpha: false`라, 가산(Additive) 재질도 캔버스 알파를 쌓았다 → 알파 없는(검은 바탕) 텍스처가 검은 사각형으로 합성되고, 밝은
    글로우도 아래를 살짝 가렸다. 캔버스를 premultiplied로 바꾸고(`fxgame.js`) 재질의 알파 채널 블렌드를 따로 지정(`fxplayer.js makeMaterial`:
    가산 = 알파 그대로(Zero, One), 알파 블렌드 = premultiplied over(One, OneMinusSrcAlpha)). 추출본 604개 중 가산 + 알파 없는 텍스처 155개가 해당.
    불투명 캔버스(벤치)의 그림은 그대로 — `bench/fx/compare.mjs`(Windows GPU Chrome) 604개 × 4프레임 차이 0. 남은 것: 望의 연결선
    `token_wang_passive_01_line`은 LineRenderer 3개라 추출기가 지원하지 않아 아무것도 안 그린다(양 끝을 코드가 바둑알 위치로 정함 — 별도 작업).
  - 스킬이 끝나면 그 버프·범위 이펙트를 즉시 지운다(`stopBuffs(id, true)` — 예전엔 방출만 멈춰 입자가 약 1초 남았다: 사용자 제보 「첸·사키코 S3
    범위가 스킬 끝나고 1초 남는다」). `stats().buffs` = 지금 켜진 버프 이펙트.
  - `/debug.html`은 시작할 때 게임처럼 리소스 캐시를 목록과 맞춘다(`resources.js installResources` → reconcile). 리소스 워커는 `/assets/`를 경로로
    캐시해 두고 내주므로, 게임 페이지를 다시 열기 전에는 디버그 페이지가 다시 만든 `fx/index.json`·`fx/modes.json`의 옛 사본을 받았다(사키코 S3
    범위가 사용자 브라우저에서만 안 보였던 원인 — 옛 사본을 심어 재현·확인).
  - 확인: `test/local-patch-fxmodes.test.js` 4개, 디버그 아레나(阿斯卡纶·维什戴尔·赤刃明霄陈 S3: 매 공격 S3 시전·타격), 25명×스킬 브라우저 일괄
    (바인딩 시전 이펙트가 있는 48개 중 45개 재생 — 나머지 3개는 키트가 공격을 대신함: 荒芜拉普兰德 S3 늑대, 丰川祥子 S2 음표, 耀骑士临光 S2), 페이지 오류 0.
  - 배포: `public/assets/local/fx/`(modes.json과 새 프리팹)를 서버로 rsync한 뒤 배포(git 밖 추출본).
  - 레이어 (2026-10-07 사용자 제보 「스킬 이펙트가 오퍼레이터 위를 덮는다」): 시전자에 붙는 이펙트(버프 루프에 더해 시전·스킬 시작)를 모두 유닛
    캔버스 아래 층에 그린다(오퍼레이터가 위). 대상에 맞는 타격 이펙트·투사체 꼬리·음표·剑气는 위 층 그대로. `/debug.html`의 이펙트 목록 재생도 같다
    (오퍼레이터에 = 아래, 샌드백에 = 위). 2D 보드에서는 예전처럼 둘 다 위. 같은 제보의 나머지 원인: 원본 `fx.js skill()`의 절차 발동 연출(금색
    빛기둥·플래시·충격파 링, 유닛 위 층 — 공식 클라이언트에는 없음)이 공식 이펙트가 있는 오퍼레이터에도 나왔다 → `fxgame.js ownsSkill(view)`가 참이면
    (추출 번들 있음, 품질 low 아님) `app.js`가 `fx.skill(v, on, { burst: false })`로 부르면 아무것도 안 그린다 — 예전엔 바닥 오라(도는 금색 육각형)를 남겼으나 공식에 없어 뺐다(사용자 2026-10-07, `fx.js` 2줄, `app.js` 1줄).

- 투사체 꼬리 (2026-10-07, 비교 조사 `compare-fx.md` 2번): 공격 모드의 주 투사체 `_mainEffect`(`modes.json` `trail`)가 있으면 `fxgame.js`가 그
  프리팹을 쏜 사람에서 (움직이는) 대상까지 시뮬레이션의 비행 시간(`fx.js projSpeed` — 피해와 같이 도착, 곡사는 fx.js와 같은 포물선)으로 날리고,
  `fx.js`의 절차 탄은 그리지 않는다(`arrowKind` → `'officialTrail'`). 높이 0.35칸 [추정], 비행 방향으로 회전, 도착하면 방출을 멈추고 사라진다. 그 꼬리의
  첫 발은 파일을 받는 동안 절차 탄 그대로(안 보이는 탄 없음), 동시에 12개(`MAX_TRAILS`) 넘거나 부하 3단계면 절차 탄. 바인딩된 꼬리가 있는 오퍼레이터:
  추출된 25명 중 14명 이상(일반 공격) + 스킬 모드. `stats().trails`/`trailAt`(디버그). 확인: 디버그 아레나에서 위셔델·아처·르무엔·파싱어·라플란드·
  치우바이 비행 좌표·화면.

- 사용자 제보 11건 (2026-10-07, 조사 `research/2026-10-07-user-issues/` issues-fx.md·issues-sound.md·issues-anim.md;
  3·4는 793a6539). 이번에 고친 것:
  - **스킬 발동 이펙트 고르기** (`fxmap.js activationEffects`, 2·5·8·9·10·11): 이름 매핑 ∪ 스킬 자신의 이펙트(아래 `skills[i]`)에서 다음을 뺀다 —
    ① 그 오퍼레이터의 모드가 공격의 cast/hit/trail로 묶은 프리팹(d8681af6 `_range` 규칙의 회귀: 수르트 S3 range는 대상 타격, 무에나 S3 range_01·buff_01은
    매 공격 시전, 르무엔 S3 crosshair_range는 조준 투사체 — 17개 스킬이 발동 때 시전자 몸에 한 번 더 틀었다), ② 스킬이 대상에 거는 것·끝에 트는 것
    (target / targetBuff / end), ③ 키트 이벤트가 그리는 것(`fxgame.js KIT_OWNED`: 余 `yu_skill3_range_01`). 스킬이 스스로 시전하는 프리팹(`_castEffects`)은
    이름이 `_buff`/`_range`여도 루프가 아니라 한 번. `ownsSkill`도 같은 목록으로 판단.
  - **스킬 단위 바인딩** (`char_modes.py skill_effects` → `modes.json`·`local-char-modes.json` `skills[i]`, 스킬 순서): 그 스킬 프리팹(`[uc]skills.ab`)의
    `_castEffects`(`_oneshot` 1 → `cast`, 0 → `castLoop`; 둘 다 발동 때 한 번, 프리팹 길이만큼), `_buffs[].overrideEffectKey`(`buff`, 시전자 루프),
    `_activeBuffs`(`targetBuff`, 대상 표식), `_hitEffects` + 능력 투사체의 `_effectsToTargetWhenStart`/`_effectsWhenHit`/`_effectsWhenReached`(`target`),
    이름이 `End…`인 능력은 `end: { cast, hit }`(풀에서 데겐블레허 S3 하나). 텍사스 S2는 파일 이름이 `_skill_01_`이라 이름 매핑으로는 0개였다.
    공격 이벤트 없이 피해를 주는 순간은 `fxgame.js expect()`/`pendingHit()`: 발동 틱의 'dmg'(텍사스 S2 검 2발 — 대상당 한 번)에 `target`,
    키트 fx 'slash'(데겐블레허 연속 베기)의 'dmg'에 `targetBuff`(대상당 한 번, 스킬 끝·대상 사망에 멈춤), 'finale'(마무리 일격, 시뮬레이션이 onEnd에서
    'skill' off 전에 냄)에 `end.cast`(시전자) + 그 틱 'dmg'에 `end.hit`. 다른 유닛이 1초 안에 공격한 대상, 4.5칸 밖 대상은 가로채지 않는다.
  - **4방향 회전** (6): `_useFourDirectionalFace: 1`인 이펙트(풀 12명: 野鬃 S2 start 등, `modes.json turn`)는 좌우 반전 대신 프리팹의 `rotation_z`를
    유닛 방향으로 돌린다(RIGHT 0° / UP 90° / LEFT 180° / DOWN 270°, 첸 S3 검기와 같은 `aimMover`). 좌우는 지금 그려진 방향(visFacing).
    `_directionType`의 방향별 사본(위·아래 배치)은 아직 기본 사본만 [남음].
  - **키트 이벤트** (`fxgame.js kitFx`, 9·10): 余 S3 'firewall' → 벽이 지나는 줄(`fx.js wallTiles`, `app.js` `fieldRect` 옵션 1줄)의 칸마다
    `yu_skill3_range_01` + 그의 칸에 `_root`, 스킬이 끝나면 멈춤 [추정 배치 — 좌우·끝 조각 `_R`/`_l`/`*_end`는 쓰지 않음, 공식 캡처로 확정 필요];
    'firewallBlock' → `yu_skill3_annex_01`. 르무엔 S3(S3 장착일 때만 — S2 조준도 같은 'lock') 'lock' → 대상에 `crosshair_02`(그 대상의 포탄이 떨어질 때까지,
    잠금 순서 = 착탄 순서), 'bombardShell' → `trail_02`가 3칸 위에서 수직으로 비행 시간 동안 떨어짐 [추정 높이·방향], 'bombard' → `hit_01`. 셋 다
    `ownFx`라 `fx.js` 2D 대역(빨간 조준 원·주황 폭발)은 안 그린다.
  - **셰이더** (`fxplayer.js`, 1·5·8·11): Dissolve … Double 재질(`_DissolveTex_01/_02`, `_Amount_01/_02`, `_BorderWidth_01/_02`; 재질에 남은 `_Amount`는
    쓰지 않음 — 클립도 _01/_02만 움직임) → 무에나 S3 꽉 찬 반원판·데겐블레허 마무리 조각; 메시 정점 색 `col`(알파로 가장자리를 지우는 베기·고리 메시
    446/665) → 실버애쉬 S3 호 끝; `Torappu/Particles/Rim/*`(6개) 법선 계산 + 알파 × (1−|N·V|)^`_RimPower` [추정 식] → 마터호른 S2 보호막(흰 덩어리 → 돔);
    바닥 아래 잘라내기: 노드가 바닥보다 0.25 넘게 아래이고 깊이 비교하는 재질(`_ZTest` 0·8 아님)인 렌더러만, `FxInstance opts.floor`(유닛이 선 땅 높이,
    기본 0) − 0.05 아래 픽셀을 버림 → 수르트 S3 5칸 왼쪽 빛(`gx_glow`), 르무엔 조준 고리. 모든 렌더러에 적용하면 236개 프리팹이 바뀌어(텍사스2 S3
    연기가 가라앉아 사라짐) 좁혔다. `bench/fx/compare.mjs`(Windows GPU): 새 기능을 끈 판 0 차이, 켠 판은 정점 색 568·Double 29·Rim 5·바닥 2 프리팹만 다름.
  - **렌더러별 위/아래 층** (1·8, 1104473f의 「시전자 이펙트는 전부 아래」를 바꿈): 공식은 캐릭터 Spine이 깊이를 안 쓰고 Default 레이어 order 0이라 이펙트
    렌더러의 sortingOrder > 0(또는 0이면서 파티클 fudge < 0)이면 캐릭터 앞, 나머지는 뒤다(마터호른 S2 돔 `hudun` order 0 + `hudun_2` order 1). 품질 'high' +
    3D 보드일 때 시전자 이펙트·상태 이펙트(⑤)·바닥 키트 이펙트는 `FxInstance split`으로 렌더러마다 `FX_BACK`/`FX_FRONT` 층을 달고, 공유 장면
    `layers.split`을 아래 캔버스(자기 장면 다음 FX_BACK)와 위 캔버스(FX_FRONT 다음 자기 장면)에 한 번씩 그린다(텍스처 업로드가 두 렌더러에 각각 — 'medium'
    이하·2D 보드는 예전 규칙). 따라서 아스카론 S3 시전 섬광 등 order > 0 조각은 다시 오퍼레이터 위에 온다 — 사용자가 「덮는다」고 하면 공식 캡처와 비교.
  - 확인: `test/local-patch-fxmodes.test.js` +2(activationEffects 합성 + 실제 바인딩 9개 — 모드 필터를 빼면 실패), 디버그 아레나(Windows Chrome
    `fxA_cast2.mjs`): 텍사스 S2 range·검, 데겐블레허 S3 start_01/02 → 마무리 end/start_03/04/hit_2, 수르트 S3 range가 대상에, 野鬃 S2 오른쪽·위쪽 배치,
    余 S3 열 전체 벽, 르무엔 S3 표식 5·포탄 5·착탄 5, 마터호른 S2 돔이 위에, 무에나·레인프로스트 반원. 전후 캡처 `research/2026-10-07-user-issues/fx-captures/fix_*.png`.
  - 배포: `modes.json`이 바뀌었으니(`skills`·`turn`) `public/assets/local/fx/`를 서버로 rsync(이번에 새 프리팹은 없음).
- 사용자 제보 재수정 (2026-10-07 저녁, 공식 인게임 녹화 10개 `녹화\stronghold fx\` — 리드 이격·위·데겐블레허·텍사스 이격 S2/S3·
  첸·수르트·르무엔·실버애쉬 이격 S2·블레이즈 이격 S3). 확인 도구 Windows `sp-check\rf_cap.mjs`(아레나 연속 캡처, `op:skill!` = 배치 직후),
  `rf_seq.mjs`(프리팹 단독, `only:노드`), `rf_probe.mjs`(살아 있는 인스턴스·입자 수; `app.js __fxDbg` 임시 훅은 커밋 전에 뺌). 셰이더는 클라이언트
  `[uc]shaders.ab`의 DXBC를 직접 역어셈블해 확인(스크래치 `dxbc.py` — 저장소 밖).
  - **대상 타격 이펙트가 전부 안 보이던 회귀** (616407b4): `play()`가 대상에 붙는 hit까지 `split`(렌더러를 층 1/2로)으로 만들고 층 0만 그리는 위 캔버스에
    넣어, 품질 high + 3D 보드에서 모든 타격 이펙트가 사라졌다(블레이즈 S3 폭발). split은 split 장면에 들어가는 것(시전자)만.
  - **LineRenderer** (`fx_extract.py lineR`, `fxplayer.js LineRenderer`): 점 목록·폭(widthMultiplier, 클립 `width`)·폭 곡선·색 그라디언트·텍스처 모드
    (Stretch / Tile = 거리 / 구간별)로 시선 정렬 띠. Unity처럼 효과가 끝날 때까지(stop) 남는다. 월드 좌표 선(스크립트가 점을 정함, 르무엔 S2 등)은
    이펙트 공간에 그대로 그림 [추정]. 클립의 텍스처 ST(`_MainTex_ST` 등, 흐르는 점선)도 바인딩. 21개 프리팹.
  - **르무엔 S3**: 'lock'마다 대상에 `trail_01`(하늘에서 내려오는 붉은 빔 4겹) + `crosshair_range`(수축하는 조준 원, 조준 투사체 `_mainEffect`) +
    `crosshair_02`(표식) — 그 대상 포탄이 떨어질 때 즉시 지움(긴 수명 입자 남던 것) + `crosshair_01`(buff lemuen_proj_s3_effect의 한 번 섬광).
    재능 通缉 'lemuen:wanted' → 상태 이펙트 `lemuen_talent_buff_01`(char_lemuen_range_aim[effect], 머리 [추정]).
  - **Ram 계열 셰이더** (DXBC): `_RamTex`는 디졸브 경계 색 램프가 아니라 렌더러 uv × `_RamTex_ST`로 샘플해 rgba에 **곱하는** 텍스처 → 첸 S3 범위 벽이
    흰색 → 황갈색(모래 바닥에서는 거의 안 보임). **디졸브** = sat((d − amount + border·(1 − roundEven(amount + .5))) / border) — amount 0이면 아무것도
    안 잘림(어두운 텍셀이 구멍·점무늬로 보였음). **디스터브** = 노이즈 .r × 세기(−.5 중심 없음). `_ToggleUse*`는 Disturb Anchor만, `_UseDissolveTex`는
    Dissolve(CustomData)만 선언 — 나머지 셰이더에서는 재질에 남은 값일 뿐이라 무시(항상 켬). **Rim**: rim 항이 색에도 곱해지고 Rim Tint는 ×2 없음
    (Rim Texture·Additive는 ×2) → 쿠오라 S2 돔이 반투명.
  - **order 0 입체 메시는 앞** (`FxInstance split`, `WRAP_H` 0.3칸): sortingOrder 0·fudge 없는 메시 중 높이가 있는 것(돔·껍질)은 유닛 앞(공식은 order 0을
    거리로 정렬 — 쿠오라 S2 육각 돔이 그녀를 덮음, 영상), 평평한 바닥 데칼은 뒤.
  - **`_spawnLocation`** (`fx_extract.py spawn`: 루트 컴포넌트 원시 필드 #13, buff_stun 4·buff_slowdown 1·buff_sleep 2로 검증): 2(몸 HIT)·4(머리)인 이펙트를
    유닛에 붙일 때 그 높이로 올림(`fxgame.js lifted`) — 수르트 S3 타격 불덩이가 몸에. 1 발·5 바닥 중앙·8(미확인)은 땅. 전 번들 재추출(목록 그대로 `--prefab`).
  - **지속형 패시브의 스킬 상태** (`fxgame.js skillByFlag`): 텍사스 이격 S1~S3는 'skill' 이벤트 없이 켜져(시뮬레이션 skills.js) 모드가 Default로 남아 평타
    이펙트만 나왔다 → 공격 때 뷰의 `UF.SKILL` 플래그로 발동·루프·모드를 맞춤. S3 검우: 시뮬레이션 'swordRain'에 `src`(tier4.js 1줄) →
    대상에 `texas2_skill_03_hit` [추정: 이름] → 2026-10-08 `texas2_skill_03_hit_02`로 바로잡음(아래 「사용자 제보 4차 텍사스」).
  - **리드 이격**: 灼痕 'reed2:scorch' → 상태 이펙트 `reed2_debuff_01`(주황 X, 몸 [추정]), 'scorchBurst' → `reed2_debuff_boom_01`. 번들을 전체(21개)로 재추출.
  - **데미지 숫자** (`num-official.js`, 데겐블레허 영상 30fps 프레임별 측정): 피해 계열은 0.87배로 나타나 0.1초에 최종 크기·위로 30, 유지, 마지막 0.13초에
    축소하며 아래로 30(`_downOffset`), 투명해지지 않음. 회복 숫자는 예전(1.5배 팝·페이드).
  - **2차 제보 (같은 날 밤)**: ① 스킬 발동 때 도는 금색 육각형은 `fx.js _aura`(원본 절차 이펙트) — 공식 이펙트가 있는 오퍼레이터는 이제 안 그림.
    ② 위 S3: 벽 조각은 행 벽(위·아래 배치) 기준이라 열 벽(좌·우 배치)은 조각마다 높이축으로 90° 돌림. ③ 르무엔 재능 표식: 2.5초 루프 프리팹을
    2.0초 시점에 멈춰 유지(`FxInstance opts.hold`, `STATUS_FX` 4번째 칸). ④ 르무엔 S3: 빔은 매 프레임 효과의 +y를 카메라 위쪽으로 돌려 어디서나 화면
    수직(`fxgame.js skyward`); 잠금 섬광 `crosshair_01`(2.65초)도 표식과 함께 포탄 때 지움(폭격 후 ~1초 남던 것); 조준 원 `ring 01/02` =
    Dissolve AB (VertexColor Major) — DXBC대로 amount = 1 − 정점 α, 색 = 2·텍스처·정점색(틴트 rgb 안 곱함). Dissolve(CustomData)의 amount는
    `_DissolveIntensity`. 남은 차이: 원이 공식은 몸 앞에 세워진 원인데 우리는 바닥에 눕는다(정렬 Local의 기준 평면 [추정 불가] — 확인 필요).
    ⑤ 데겐블레허: 늘인 빌보드(stretched)의 길이를 size.y(3D 시작 크기), 폭을 size.x로 — 베기 줄이 길고 가늘게; 天生的武者 165% 발동분은 기대 피해에서
    뺌(`dmg.lpExpectDiv`, damage.js 1줄·tier6.js 1줄) → S3 베기가 전부 빨간 숫자(영상); 스킬 End 클립(마무리 `Skill_3_End`)은 다음 평타가 끊지 않음
    (`spine.js _endPlaying`). ⑥ 리드 S3: charpack 모드가 Attack→`Skill_3_Attack`, Idle→`Skill_3_Loop` — 공격 클립을 `Skill_3_Attack`, 대기를
    `Skill_3_Loop`로(`anim-overrides.mjs`, `data/assets.json` reed2만). 같은 꼴(`Skill_N_Attack`가 있는데 안 쓰는 모델)은 리드뿐. ⑦ 텍사스 이격 S2:
    스킬이 이벤트로 꺼진 직후 스냅숏 플래그가 한 프레임 남아 `skillByFlag`가 루프를 다시 켜 계속 남던 것 → 이벤트로 켜진 스킬은 플래그로 안 건드리고,
    꺼진 뒤 0.5초는 무시, 프레임마다 확인.
  - 남은 것: 수르트 S3 불덩이 크기, 위 S3 구체, 텍사스 S3 검우의 큰 먹 호(영상)는 대략만 맞춤 — 공식과 나란히 비교 필요. 데미지 숫자 색(영상 측정
    ≈ #be361f, 압축 영향 가능 — #ff3a00 유지).

- 사용자 제보 3차 (2026-10-07 밤, 캡처 `research/2026-10-07-user-issues-3/`) — 이펙트 쪽 3·4·7번 (세션 stronghold-1d 포크):
  - **3. 배기 구역의 나뭇잎**: `排气格栅`(`tile_smog`)는 아군에게 隐匿을 줘서 그 위 望 바둑알이 `stealthAlly` 상태 이펙트를 받았고, 그 프리팹
    `common_stealth`(텍스처 `common_leaf`)가 나뭇잎이었다. 클라이언트에서 `common_stealth`를 쓰는 곳은 生息演算 건물 토큰(trap_405/406/459 재능
    overrideEffectKey)뿐, 오퍼레이터 자신의 隐匿(守林人 S1 `skchr_milu_1`, dynamicabilities `Invisible`)은 `common_invisible` → 아군 隐匿도
    `common_invisible`(`fxstatus.js`)이고 그 ColorModifier(회색 α .894)도 아군에 적용(`units.js lpInvis`). [추정] 타일 隐匿도 같은 프리팹(타일 프리팹 못 찾음).
  - **4. 손으로 놓은 돌 / 재능(跟子) 돌**: 跟子는 望의 투사체(PRTS 备注, 클라이언트 `projectile_chr_wang_stone1/2/3`)라 이펙트가 그녀 번들(`wang`)의 것 —
    `_effectsToTileWhenStart` `wang_passive_01_buff`(검·흰·금 고리, andi_lne + 루프 별빛), `_triggeredEffect` `wang_passive_01_buff_02`. 놓은 돌(토큰
    `token_10064_wang_stone1`)은 프리팹 `_startEffect` `token_wang_birth_01_buff`(금빛 루프 별빛), `sktok_wang_N/TriggeredEffect` `token_wang_01_buff`
    [추정: TriggeredEffect = 激活(연결) 때]. 시뮬레이션은 표시용 `follower` 플래그만 붙임(kits/diy.js 'summon'·'wangLink' 2줄, 규칙 그대로).
    정비에서 놓은 돌은 전투 시작에 'summon' fx 없이 'spawn'만 와서 탄생 이펙트가 없었다 → 같은 배치(batch)에 'summon'이 없는 돌 'spawn'은 놓은 돌로
    보고 `token_wang_birth_01_buff`(`fxgame.js stoneBirth`). 跟子 고리의 검은색(Disturb, `_MainColor` 검정)이 공식 캡처처럼 짙은지는 실제 판 확인 [추정].
  - **7. 공용(절차) 이펙트 제거**: ① 望 돌 이벤트('zone' 폭발·'summon'·'wangLink')는 `stoneFx`가 그리면서 `ownFx`에 안 넣어 `fx.js`가 노란 원(zone)·
    민트 육각+기둥(summon)·파동을 같이 그렸다 → 넣음. ② 공식 이펙트 번들이 있는 오퍼레이터의 키트 'fx' 이벤트는 `fx.js` 절차 대체(blast·zone·wall·
    summon·buff·wave·pillar·element·healAoe·shield·shatter·strike·volley)를 안 그림(`fxgame.js standInOff`; 이벤트의 오퍼레이터 = `src` → `by` → `id`,
    소환물·장치는 예외; 회피·치명·DP·표식·빔·이동 화살표·단일 회복은 남김). 그 순간에 공식 프리팹이 있는 것은 그것으로: 维什戴尔 残影 폭발 'explode' →
    `wisdel_bomb_01_hit` [추정: 이름], 赤刃明霄陈 S2 'swordStorm' → `skchr_chen3_2 _hitGroups[0..5]`(`chen3_skill_02_hit_01~06` 차례로 [추정]),
    丰川祥子 열광 'sunBurst' → Combat 모드 cast `oblvns_combat_01_start` [추정].
    **예외 (2026-10-08 세션 K, K-4)**: 오퍼레이터에게서 0.5칸 넘게 떨어진 오래가는 'zone'(`key`가 있거나 지속 > 1초)은 2D 원을 남긴다
    (`fxgame.js areaAway`) — 그 자리의 공식 프리팹(`…_token`·`…_range`)을 트는 곳이 없어서, 引星棘刺 S2 炼金单元(upstream f1e462ef: 1초마다 `key`로
    다시 보냄)이 품질 low가 아니면 아무것도 안 보였다(실제 판 확인). 전수: 引星棘刺 S1·S2·S3, 锡人, 歌蕾蒂娅 漩涡, 号角 조명, 异客 폭풍 → 2D 원.
    莫斯提马 S2(자기 자리)·纯烬艾雅法拉 방패(shield 유형)는 공식만. 공식 `thorn2_skill_0N_token`/`_range`를 그 자리에서 움직이며 트는 것은 남은 일
    (클라이언트 배치 로직은 네이티브라 [추정]이 많음). ③ 스킬 발동 금빛 기둥·육각(`fx.skill` burst)·`_aura`: 자기 시작·버프
    이펙트가 없는 스킬(望 S1 `skchr_wang_1` — skills.ab에 이펙트 키 없음)도 공식 번들이 있으면 안 그림(`ownsSkill`) — 발동이 화면상 조용할 수 있다.
    ④ 소환물(토큰) 머리 위 노란 방패(`invuln`) 아이콘 안 그림(공식 캡처의 돌에 없음; 사용자 「소환물 위에 붙어 있는 노란 방패 모양 아이콘을 제거」) —
    뷰는 `UF.INVULN` 플래그만 알아 스킬의 짧은 무적과 구분 못 함 [추정: 소환물은 공식도 없음].
  - 확인: Windows `sp-check\wst2.mjs`·`wst3.mjs`(`SMOG=1` = 돌에 tile_smog 隐匿)·`wst4.mjs`(2배 해상도) — 디버그 아레나 望 S1, 돌 3개 수동 배치.
    결과 jpg `wstB-*`(隐匿: 회색 연기, 나뭇잎 없음), `wstD-*`(跟子 고리·놓은 돌 별빛, 폭발에 노란 원·민트 육각 없음, 발동 기둥 없음), `c3s2-*`(첸 S2 타격).
  - **소환물 레벨 칩** (2026-10-08 사용자 요청 「소환물도 본체 오퍼레이터와 같은 레벨 칩」): 정비 화면의 소환물(보드·벤치 스택)이 주인(`ownerUid`)
    오퍼레이터의 칩(`tier`)을 단다(`app.js pieceInfo` `chip`, `units.js` 칩 생성 조건). 주인을 못 찾으면 예전처럼 칩 없음. 전투 중에는 오퍼레이터처럼 칩 없음.
    칩 높이는 오퍼레이터와 같은 화면 고정 위치(발 기준)라 작은 소환물(드론) 위에서는 떠 보인다 — 공식 캡처로 확인할 것 [추정].
    확인: Windows `sp-check\tokchip.mjs <port>`(game-mock PREP에 주인 있는 드론을 보드·벤치에 추가) → `tokchip3.png`.

### 이펙트 붙는 자리 MP_SPECIAL_0 — 비르투오사 S3 (2026-10-08, 사용자 「인게임은 비르투오사가 들고있는 악기에서 이펙트가 나와야 해」)
- 근거: 클라이언트 `global-metadata.dat` 열거형 `SpawnLocation`(필드 순서·기본값): 0 NONE, 1 FOOT_POINT, 2 HIT_POINT, 3 MUZZLE_POINT, 4 HEAD_POINT,
  5 GROUND_CENTER, 6 MUZZLE_POINT_WITHOUT_ROTATION, 7 GROUND_CENTER_WITH_ZERO_HEIGHT, 8 MP_SPECIAL_0, 9 MP_SPECIAL_1, 10 MP_SPECIAL_2, 11 MP_SPECIAL_3,
  12 CAMERA, 13~ MP_SPECIAL_4…, TILE_CENTER …. 위치는 모델 프리팹의 `Torappu.Battle.SingleSpineAnimator`(`_muzzleTransform`·`_hitTransform`·
  `_headTransform`·`_specialPoint0~15`)가 가리키는 Transform — 비르투오사 기본 스킨은 `PersistentData/Bundles/chararts/char_245_cello.ab`
  `DefaultSkin` → `Front`/`Back` 아래 `SpecialPoint0`, Spine 본 추종 컴포넌트가 `F_Weapon_Chord` / `B_Weapon_Chord`(첼로 현)를 따라간다.
- 우리는 1·2·4·5만 알아 8을 바닥에 놓았다 → S3 `cello_skill_03_buff_front_02`(빛나는 원·무지개·음표, `_spawnLocation` 8)가 발밑에 깔렸다.
  `fxgame.js lifted()`: 8이고 `SPECIAL_BONES`에 있는 캐릭터(지금은 `char_245_cello`만)면 매 프레임 그 본의 위치(스켈레톤 좌표 × 모델 표시 배율,
  유닛 root + body 기준 — 임포스터로 그릴 때는 스켈레톤이 다른 컨테이너에 있어 화면 트리를 쓰지 않음)를 `liftFor`로 월드 높이로 바꿔 놓는다.
  본을 못 찾으면 몸 가운데(`bodyZ` 0.5). `SPAWN_FRAC` 표는 그대로 — 다른 프리팹 높이는 안 바뀜.
- 확인: 디버그 아레나 비르투오사 S3 전·후(Windows `a2arena.mjs` `vc-bef-*`/`vc-aft-*`, `research/2026-10-08-elite-glow/cello-s3-spawn8.png`) — 원·빛이 발밑에서
  첼로 위치로. 테스트 `test/local-patch-fxspawn.test.js`(소스 확인 + 추출물 `spawn` 8). 실제 판·공식 영상과의 나란히 비교는 안 함.
- **다른 세션에 인계 (사용자 2026-10-08 「붙는 자리 값이 다른 경우가 꽤 많은 것 같아. 비르투오사까지만 수정하고 나머지는 다른 세션에 인계」)**:
  추출 프리팹 기준 8(MP_SPECIAL_0) 104개·3(MUZZLE) 48개·0(NONE) 136개가 지금 바닥(또는 발)에 놓인다. 7(GROUND_CENTER_WITH_ZERO_HEIGHT) 30개는 바닥 그대로가 맞을
  것으로 보임 [추정]. 오퍼레이터마다 `chararts/<charId>.ab`(스킨은 `skinpack/`) `SingleSpineAnimator`의 Muzzle·SpecialPoint 본을 뽑아 표로 만들면
  `SPECIAL_BONES`를 일반화할 수 있다(추출 스크립트 초안: `research/2026-10-08-elite-glow/sp1.py`·`chain.py`). 비르투오사 S3의 `buff_back_02`
  (모델 뒤 짝)·`buff_03/04/05`는 우리 바인딩에 없어 안 튼다 — 클라이언트가 트는지 확인 필요.
- **일반화 (세션 F, 2026-10-08, 6433658c·51601c12·492e154b)** — 이펙트 붙는 자리를 오퍼레이터 전체에:
  - **점 표** `tools/local-extract/char_points.py` → `tools/assets/local-char-points.json`(git, 검토용) + `public/assets/local/fx/points.json`(git 밖, 클라이언트가 읽음).
    근거: chararts `DefaultSkin` 애니메이터의 typetree — 양면 모델은 `_front`/`_back` 레코드(`muzzlaTransform`[원문 오타]·`hitTransform`·`headTransform`·
    `shadowTransform`·`specialPoint0~15`), 한 면 모델(`char_1012_skadi2`)은 자기 필드(`_muzzleTransform`…). 각 점의 BoneFollower `boneName`·`followBoneRotation`,
    고정 위치는 로컬 좌표 ÷ SkeletonDataAsset `scale`(0.01) = 스켈레톤 단위(비르투오사 Muzzle (0.678, 1.902) = `F_Muzzle` Idle (67.8, 190.2) — 데이터로 확인).
    점 이름은 모델마다 다르다(`MuzzlePoint`·`Special_0`·`Special0`) — 이름이 아니라 애니메이터 필드로 찾는다. 126명.
  - **`render/fxpoints.js`** `pointKey`(3·6 → muzzle, MP_SPECIAL_N → spN: 8~11 → 0~3, 13~16 → 4~7, 18~25 → 8~15; 12 CAMERA·17 TILE_CENTER 제외)·`pointOn`
    (그 면의 본 → 다른 면의 본 → 그 면의 고정 위치). `fxgame.js lifted()`가 표에서 점을 찾는다(`SPECIAL_BONES` 삭제 — 비르투오사는 같은 본, 테스트로 고정).
    표에 없는 유닛(적, 근접 모델의 muzzle, 표 없음)은 예전대로 바닥. 본 회전(`followBoneRotation`, 3은 회전 포함·6은 없음)은 적용 안 함 [추정: 프리팹의 `fixed` 자식이 세워진 채].
  - **MP_SPECIAL_1~6** (51601c12): `fx_extract.py spawn_location`이 0~8만 받아 9·10·11·13·14·15인 **66개**가 `spawn` 없이(=바닥) 추출돼 있었다. 값 = 열거형 순서의 근거:
    9~15를 쓰는 오퍼레이터는 정확히 그만큼 특수점을 가진다(`thorn2` sp0~4·값 13, `angel2` sp0~6·값 15, `agoat2` sp0~5·값 14까지). 66개만 `--prefab`로 재추출 — `spawn` 외 변화 없음,
    index.json 그대로.
  - **꼬리 투사체** (492e154b): `TRAIL_Z` 0.35칸 고정 대신 발사자의 Muzzle(쏘는 순간 위치) → 대상의 맞는 높이(`SPAWN_FRAC[2]`, 클라이언트 HitPoint [추정]),
    Muzzle이 없으면 fx.js `SHOT_HEIGHT.launch`.
  - **NONE(0) 136개**: 클라이언트가 0을 어디에 놓는지는 메타데이터에 근거 없음(`ParticleEffect`/`SimpleEffect`의 `_spawnLocation`, 문자열 「Unit {0} has no muzzlePoint」 등뿐 — 로직은 네이티브).
    지금대로 바닥 [추정]. 참고: 0인 공격 시작 프리팹(`kroos2_attack_start_01`·`horn_attack_01_start_02` 등)은 노드가 `qiangkou`(총구)처럼 무기 끝 기준으로 짜여 있다 — 호출자가 위치를 주는 것일 수 있음.
  - **GROUND_CENTER_WITH_ZERO_HEIGHT(7) 30개**: 확인만 — 이름대로 바닥, 안 바꿈 [추정].
  - **알려진 빈자리**: `swire_attack_01_start`(3, 근접 모델에 Muzzle 없음 → 바닥), `char_1012_skadi2`(Back 모델 없음), 史尔特尔 S3 `buff_03/04` Back 레코드가 Back 스켈레톤에 없는
    `F_Face_Default_*` 본을 가리킴(클라이언트 데이터 — 고정 위치 사용), `nymph_talent_buff_02` Back은 본 없는 고정 위치.
  - **바뀐 프리팹 목록**(되돌림용): `research/2026-10-08-fx-spawn/changed-prefabs.tsv` 218개(3: 48, 8: 104, 9~15: 66) — 프리팹마다 앞/뒤 본.
    이상하다는 제보가 오면: 9 이상만 되돌리기 = 51601c12 revert(코드가 9+를 무시 — 재추출 불필요), 꼬리만 = 492e154b revert.
  - **사용자 확인 이펙트에 생긴 변화**: 첸(赤刃明霄陈) S2 `chen3_skill_02_buff_01`(9 → `C_Weapon`)은 그녀의 검을 따라가는데, 숨는 동안 `Skill_2_Disappear` 클립이 검 본을 약 1.4칸 앞(+538 단위)으로
    옮겨 둔다 → 예전에는 배치 링 안 바닥에 보이던 붉은 빛이 이제 그 자리에 없다(디버그 아레나 `f_probe.mjs`로 본 위치 확인, 실제 판에서도 같음). 클라이언트 BoneFollower도
    같은 본을 따른다 [추정] — 사용자 확인 필요. 비르투오사 S3·르무엔 S3·余는 전·후 같음(아레나·픽셀 비교), 丰川祥子 음표는 음표 경로(`NOTE_Z`)라 영향 없음.
  - **확인**: 단위(`test/local-patch-fxspawn.test.js` — `pointKey`·`pointOn`, 비르투오사 본, 표의 고정 위치 = Idle 본, 추출 프리팹 218개가 우리 스켈레톤에서 점을 찾음),
    아레나 전·후(HEAD 사본 3161 / 작업 트리 3162, Windows `sp-check\f_pair.sh`): 空弦 화살·발사 고리가 발 → 석궁, 新约能天使(angel2) 총구 섬광 발 → 총구,
    이격 니어 S3 시작·`buff_02_a`가 발 → 무기·머리 높이, 비르투오사 S3 그대로, 첸 S2(위 변화). **실제 판**(`f_real.mjs`, 솔로 판 정비에 维什戴尔 S3·첸 S2 디버그 추가 → 전투):
    维什戴尔 꼬리가 총에서 출발, S3 버프·첸 S2 버프 재생 확인. 그림은 `research/2026-10-08-fx-spawn/`.
  - **이격 스펙터 공격 원형(제보 4차 4-7)은 이 수정으로 안 바뀐다**: `ghost2_attack_start_01`은 `_spawnLocation` 1(FOOT)이고 모델에 Muzzle·shadow 점이 없다 — ~~데이터상 발~~
    (**틀림**, 세션 L: 같은 루트의 FollowMountPoint가 5 = SPECIAL_0 = 톱날 링 본이라 공식은 톱날을 따라간다 — 아래 「이펙트 마운트 지점」).
    원형은 `daoguang*` 빌보드(카메라 정면, 재질 `daoguang_21_ab_ZT` `_ZTest` 0 = 깊이 검사 없음). ~~우리 `fxplayer.js` 바닥 자르기가 바닥 아래 반을 버린다~~
    — **기각**(2026-10-08 report-triage 반박 검증, `research/2026-10-08-orchestration/triage-report4.md` 4-7): 자르기는 노드가 원점보다 0.25(`UNDER_FLOOR`)
    넘게 아래이고 **깊이 검사 재질**일 때만 켜지는데(`fxplayer.js` `under`·`setFloor`), daoguang 3노드는 발 원점(−.002, −.006, .028)이고 `_ZTest` 0이라 둘 다 해당 없음.
    4-7의 원인은 다시 조사 중(사용자 교정 2026-10-08: 평타가 아니라 S2 발동의 붉은 원형) — 결론은 그 조사에서 적는다.
    → **결론(세션 L)**: 원인은 바닥 자르기도 `_spawnLocation`도 아니고, 추출기·바인딩·재생기가 모르던 **FollowMountPoint 컴포넌트**와 S2 모드
    `GeneralAbilities` 버프 이펙트(`ghost2_skill_02_buff_02`)를 아예 안 틀던 것 — 아래 절.

### 이펙트 마운트 지점 FollowMountPoint — 스펙터 디 언체인드 S2 붉은 원형 (세션 L, 2026-10-08, 사용자 제보 4차 4-7)
- 사용자(2026-10-08): S2 발동의 붉은 원형은 무기(톱날)에 붙어 따라가고 적과 겹쳐도 적 위에 떠 있어야 한다. 대역(替身) 전환 뒤 파란 2종(1칸 남짓 원 → 3×3 물결)은 바닥이 맞다.
- 근거(클라이언트 데이터): 이펙트 프리팹 루트의 MonoBehaviour `FollowMountPoint`(MonoScript PathID `0x7b5c342088cfcad4`) — 이름 뒤 int 7개 = global-metadata
  필드 표 순서 `_mountPointType, _followScaleSign, _followScale, _pauseWhenMountPointInvalid, _onlyPauseWhenMountPointInvalid, _keepOriginRotation, _useBehaviourPause`.
  `MountPointType` 상수(메타데이터 필드 기본값): **0 FOOT, 1 HIT, 2 MUZZLE, 3 HEAD, 4 UI, 5 SPECIAL_0, 6 SPECIAL_1, 7 GROUND, 8~21 SPECIAL_2~15** — SpawnLocation과
  번호가 다르다(UI·GROUND는 문자열 중복 제거로 이름 표에 안 보임). 추출 프리팹의 (spawn, mount) 쌍이 모두 맞는다(8↔5 98개, 10↔8 14개, 3↔2 12개 …).
- 스펙터 디 언체인드: S2 모드 `Body/GeneralAbilities/Ability0` 버프 `ghost_s_2[effect]` → `ghost2_skill_02_buff_02`(붉은 원, 마운트 5 = 톱날 링 `B_W_Ring`/`F_W_Ring`,
  `pauseWhenInvalid` 1)·`_buff_03`(눈 빛, 6 = `F_L_Eyeball`/`B_L_Eye`). 평타 `ghost2_attack_start_01`·S3 `skill_03_start_01`·`skill_03_buff_02`도 마운트 5.
- 구현: `fx_extract.py mount_point` → JSON `mount`(04ba53aa); `char_modes.py`가 모드 GeneralAbilities 버프의 `overrideEffectKey`를 `attach`에 —
  **`GENERAL_BUFF_CHARS`(ghost2만)**(3fdaa4c1); `fxpoints.js mountSpawn`(마운트 → 같은 점의 `_spawnLocation`, UI·GROUND는 null)·`boneMissing`, `fxgame.js lifted()`가
  `mount`를 `_spawnLocation`보다 먼저 쓰고(같은 본 getter로 매 프레임 따라감), `pauseWhenInvalid`면 지금 스켈레톤에 그 점의 본이 하나도 없을 때 업데이트를 멈춤
  (끄는 중이면 계속 — e695be7a, 매핑 정정 9c6250f7). 적 앞: `baoshan` 원은 fudge −50, 점 입자는 order 2 → 분할(high)에서 FX_FRONT(기존 규칙). 분할이 꺼진 품질은 예전대로 유닛 아래.
- ghost2만 재추출(마운트 프리팹 5개만 반영; 같이 재추출하면 `skill_02_buff_01`·`beidong_buff_01(_end)`·`skill_01_buff`·`skill_03_buff_01`에 세션 H 내장 Quad `bg_01`이
  생겨 이전 파일로 둠 — H-3 「텍사스만」). **배포 때 `oci/deploy.sh --fx`**(ghost2 JSON·modes.json).
- **전체 적용(사용자 결정 2026-10-08 「전체 적용」·「켜줘」)**: `fx_extract.py --mount-only`(1d73340a)가 추출된 프리팹 JSON에 `mount`만 넣는다 — 재추출하면 세션 H 내장 Quad
  같은 다른 변화가 섞이므로. 전 번들: 마운트 프리팹 359개(93 번들), 파일 354개 변경(ghost2 5개는 이미), `mount` 외 키 변화 0. 자리가 바뀌는 것 174개(49 번들 — 텍사스 디
  오메르토사 `buff_02_start`, 무에나, 비질 등). GeneralAbilities 버프 바인딩도 전원(bb36bf2d) — 7명(크루스 더 킨 글린트·라플란드 더 데카덴차·아스트젠 더 라이트체이서·
  락락·미니멀리스트·울피아누스·티피) 바뀜. 목록 `research/2026-10-08-mount-points/`(작업 공간 루트). 알려진 빈자리: 비즈왁스 S2 `beewax_skill_02_buff_01`(마운트 특수점 0,
  모델에 없음 — 공식은 멈춤, 우리는 바닥). **이상한 위치가 보이면** 그 프리팹 JSON의 `mount`를 빼거나 `fxgame.js lifted()`의 `mountSpawn(...) ??` 한 줄을 되돌린다.
- **대역(替身)의 파란 이펙트**(사용자 2026-10-08 「대역 전환시 파란 이펙트는 안 보이는데」, e98d9cee → 공식 녹화로 정정 e82b59b8): 바인딩 `attach[Stand]`는
  있었지만 스킬 모드가 아닌 모드의 attach를 트는 곳이 없어 한 번도 안 나왔다(세션 L 이전부터). 첫 수정은 둘 다 대역에 계속 틀었는데, 사용자 녹화(`화면 녹화 중 2026-10-08 211902.mp4`,
  프레임 보드)와 사용자 설명(「파란 소용돌이가 잠깐 나왔다가 사라지고, 3x3칸짜리 원형 이펙트도 따로 있어」)으로 정정:
  - 파란 소용돌이·물보라 = 대역 등장 `[switch2stand]/StandBorn` `_castEffects` `ghost2_birth_01_start` — 1회(공식 약 0.4~1.4초). `char_modes.py` `dollBorn`.
  - 3×3 원형 = `Talents/-1` 버프 `ghost2_standin[switch]`(대역 상태 버프)의 `beidong_buff_01` — 대역 동안. 레거시 `Animation` 클립이 메시 3개를 0.3초에 나타나게만 한다(추출기는
    Mecanim 클립만 읽어 이 페이드인은 없음 — 차이는 처음 0.3초).
  - `beidong_buff_02`는 `Talents/1`(拥抱自我, `_targetOptions.targetSide 2` = 적 대상) 버프 이펙트 — **적에게 붙는 것**이라 대역 본인에게는 안 튼다. `char_modes.py` `attachFoe`.
  - `fxgame.js dollFx`: fx `substitute`에 dollBorn 1회 + Stand 모드 attach − attachFoe 반복, `swap`·`dollEnd`에 끔. 아레나·실제 솔로 판: 전환 순간 본체에 소용돌이 약 0.6초, 3×3 원형 유지.
    남은 것: 3×3 원형 메시의 왜곡 텍스처 흐름 컴포넌트(84바이트 MonoBehaviour, `_DisturTex` 속도)는 안 읽음 — 원형이 멈춘 그림처럼 보일 수 있음; `beidong_buff_01_end` 안 틂;
    `beidong_buff_02`를 적에게 붙이는 것은 안 함.
- 안 한 것: `_followScaleSign`·`_followScale`(좌우·크기 따라감). `_keepOriginRotation`(본 회전)은 아래 「이펙트 방향」(세션 stronghold-99, abc7263e)에서 적용.
- **확인 필요(사용자 2026-10-08 「아스트젠 같은 일부 오퍼는 적에게 붙어야 하는 이펙트가 오퍼 본인에게 붙어 있어 — 직접 비교해 봐야 하니 문서로만」)**: GeneralAbilities 버프 바인딩
  전원 적용(bb36bf2d)으로 늘어난 attach 중 일부는 적에게 붙는 버프의 이펙트일 수 있다. `attachFoe`(같은 GameObject의 `targetSide 2`)로 잡히는 것은 스펙터 디 언체인드·인디고뿐이고
  아스트젠 더 라이트체이서(`halo2_skill_03_buff_02`)는 안 잡힌다 — 대상을 다른 방식(선택기·투사체 등)으로 고르는 버프. 대상 7명: 크루스 더 킨 글린트 `kroos2_skill_02_buff_01`, 라플란드 더 데카덴차
  `whitw2_skill_02_buff_01`·`_range_01`·`skill_03_buff_start`·`_buff_01`, 아스트젠 더 라이트체이서 `halo2_skill_03_buff_02`, 락락 `rockr_token_01`, 미니멀리스트 `malist_drone`, 울피아누스
  `ulpia_skill_03_buff_01`, 티피 `tippi_skill_01_buff`·`_skill_02_buff_L`·`common_idle_ground`·`common_land_ground`·`tippi_line_01_1/_2`. 공식 영상과 하나씩 비교한 뒤 오퍼별로 정한다.
- **마운트 전체 적용으로 자리가 바뀐 오퍼레이터**(174 프리팹): 상점에 나오는 44명 — 안젤리나(4)·애쉬락(1)·카넬리안(2)·블레미샤인(11)·백파이프(4)·버블(2)·케이퍼(1)·사리아(2)·
  이그제큐터(1)·스펙터(2)·스펙터 디 언체인드(5)·그레이(1)·가비알 디 인빈서블(5)·혼(18)·호시구마(1)·휴머스(4)·이네스(1)·쉐라(10)·크루스 더 킨 글린트(6)·레이즈(2)·스즈란(3)·리스캄(1)·
  루멘(2)·미니멀리스트(3)·무에나(2)·뮤엘시스(7)·모스티마(3)·파피루스(2)·패신저(7)·파인콘(3)·포덴코(3)·프로방스(2)·치우바이(1)·리드 더 플레임 섀도우(4)·락락(10)·로즈몬티스(9)·
  비나 빅토리아(2)·스카디(2)·산탈라(1)·실버애쉬(1)·스와이어(3)·텍사스 디 오메르토사(2)·비질(7)·라플란드(2); 숨김 기물(`isHidden`, 상점에 안 나옴) 5명 — 비즈왁스(1)·인포서(3)·로즈솔트(2)·
  비그나(2)·샤마르(1). 비즈왁스 S2 버프의 빈 특수점(위)은 숨김 기물이라 화면에 안 나온다.
- 확인: 단위(`test/local-patch-fxspawn.test.js` mountSpawn·boneMissing·ghost2 추출물·바인딩), 아레나(`l_arena.mjs` — 평타 원형·S2 붉은 원이 발이 아니라 톱날 높이에서
  톱날을 따라 움직이고 샌드백 앞에 그려짐), **실제 솔로 판**(`l_real.mjs` — S2 발동 뒤 톱날에 붉은 원, 프레임마다 톱날 위치를 따라감). 대역 전환은 S2가 끝날 때 일어난다
  (처음엔 치명 피해로 일으키려다 못 봄 — 위 「대역의 파란 이펙트」에서 확인). 전체 적용의 다른 오퍼 174개는 화면 확인 안 함(단위 테스트로 우리 모델에서 점을 찾는지만). 공식 녹화 없음.

### 이펙트 방향 — 방향 칸·마운트 회전 (세션 stronghold-99, 2026-10-08, 사용자 제보 5차 5-2, abc7263e)
- 제보: 아르케토 S3 이펙트가 배치 방향과 상관없이 항상 세로로 보인다 → 오퍼레이터 방향을 따라야 한다(다른 오퍼에도 있을 수 있음).
  **사용자 결정(2026-10-08)**: 방향 칸 「13명 전체」, 마운트 회전 「전체 적용」(이상한 이펙트는 나중에 그것만 뺀다).
- **방향 칸** (근거: charpack·skills.ab 이펙트 발생기 항목): `_effects`는 칸 배열 — 0 위, 1 오른쪽, 2 아래, 3 왼쪽(스펙터 디 언체인드 `_up`/`_down`, 백파이프
  `_right`/`_left` 이름으로 확인) — 이고 `_directionType`이 칸을 고른다. global-metadata `DirectionType` 선언 순서 0 NONE, 1 L_OR_R, 2 U_OR_D, 3 FOUR_DIR,
  4 UD_OR_LR, 5 FOUR_DIR_FIXED, 6 L_OR_R_NOT_UD [추정: 값 = 선언 순서, 모든 항목과 맞음]. 우리 `char_modes.py`는 칸을 다 펼치고 이름 규칙(`DIRECTIONAL`
  `_up/_down/_left/_back`)으로만 걸러, 아르케토 S3 `start_02`(위)·`start_02_B`(그 밖)를 **동시에** 틀고 이름에 up/down이 있는 사본은 방향과 상관없이 버렸다.
  → `char_modes.py dir_groups`가 칸이 둘 이상 다른 항목을 `dirs: [{ t, s: [위, 오른쪽, 아래, 왼쪽] }]`로 기록(바인딩 목록은 그대로), `fxgame.js dirCopies`/`dirPick`이
  `play()`마다 그 묶음의 이름을 보는 방향의 사본 하나로 바꾼다: NONE 0번, L_OR_R 좌우(위·아래를 볼 때는 그려진 좌우), U_OR_D 위면 0번·그 밖 2번 [추정: 옆은
  앞모습], 나머지 보는 방향의 칸. 빈 칸은 안 틂. 좌우 사본이 따로 있는 묶음에서 고른 사본은 다시 뒤집지 않음 [추정]. 사본 프리팹은 이미 전부 추출돼 있었다(재추출 없음).
  대상 14명: 스펙터 디 언체인드, 가비알 디 인빈서블, 이그제큐터 디 엑스 포에데레, 위셔델, 엑시아 더 뉴 커버넌트, 백파이프, 아르케토, 불피스폴리아, 언더플로우,
  르무엔, 산크타 믹사파라토, 비질, 아로마 + 데겐블레허(S2 `start_04_v`/`_h`, skills.ab).
  **선발 오퍼레이터 항목** (b2583174, 사용자 요청 2026-10-08): 0.2.0 병합 뒤 `data/diy.json`이 없어져 `char_modes.py`가 선발 5명을 다시 만들지 못했다(전체 실행에서
  빠지고 예전 항목이 남음). → `diy_operators()`가 `data/backups.json` `diy.operators`(선발 목록)와 `units.<charId>.forms`의 스킬을 읽는다. 재생성 결과: 토가와
  사키코만 바뀜 — S2 모드 4개(공속·공격·피버·피버 마법)의 기본 능력 버프 이펙트 `oblvns_skill_02_buff`/`_buff_01`이 `attach`에(bb36bf2d의 「모두에게」 규칙),
  아레나에서 S2 동안 몸 뒤 분홍 오라로 보임(공식 대조 안 함). 왕·첸 더 던스트릭·위셔델·아스카론은 그대로. 이전 바인딩 백업 `research/2026-10-08-diy-bindings/before/`(작업 공간 루트).
- **마운트 회전**: FollowMountPoint `_keepOriginRotation` 0 = 효과가 마운트 지점의 회전을 받는다. 아르케토 S3 시전 부채꼴 `archet_skill_03_start`는 마운트 2(MUZZLE)·0이고
  루트에 회전 필드가 없다; 총구 점(`points.json` `F_Muzzle`/`B_Muzzle`, `rot 1` = 본 회전 따라감)의 본은 Skill_3 동안 네 방향 모두 월드 −90°(런타임 값).
  → `fxpoints.js pointTurn`(그 쪽 본이 `rot 1`이면 `getWorldRotationX` 라디안, 아니면 null), `fxgame.js lifted()`의 `rot`(마운트가 있고 `keepOriginRotation === 0`일 때),
  프레임 루프가 프리팹 루트(`nodes[0]`)를 Unity 프레임 z(보드 법선; +x 열·+y 행 — `aimMover`와 같은 축)로 그만큼 돌린다(뒤집기 안쪽이라 왼쪽은 거울).
  축: 깊이 축(y)으로 돌리면 부채꼴이 얇아질 뿐 세로 그대로였고, z로 돌리면 부채꼴이 눕고 고리(`huan`)가 발사 방향에 수직으로 선다 — 단독 렌더
  `sp-check\w52cmp.mjs`(루트 0 / −90 / +90). **부호 정정**(사용자 2026-10-08 「좌우를 보고 배치되었을 때 지금과는 방향이 반대로」, 「아래를 보고 있는데
  적이 오른쪽에 있으면 부채꼴이 왼쪽을 향해 열려」): 런타임 각도는 y 아래 좌표라 Unity(y 위) 회전은 그 반대 — +90°, 부채꼴은 오퍼레이터 뒤로 열리고 가시·고리가 적 쪽.
  **시작 때 한 번** [추정] (사용자 「이격 니어 S3 — 빛으로 된 창으로 찌르는 이펙트가 허전해」): 니어 더 래디언트 나이트 S3 `nearl2_skill_03_start`의 빛의 창(`qiang`,
  sp0 = `F_Weapon`, 루트 0°에서 앞으로 찌름)은 시작 때 본 −0.4°인데 0.5초 안에 창이 ~160°로 돌아가, 매 프레임 따라가면 찌르기가 뒤를 향했다 → 회전은 첫 프레임 값을
  두고 위치만 매 프레임 따라감(`lifted` `turn0`). 아레나: 아르케토 오른쪽·아래(모델 오른쪽) 모두 부채꼴이 왼쪽으로, 니어의 노란 창이 적 쪽으로.
  범위: 마운트 359개 중 `keepOriginRotation` 0이 358개, 그중 점이 본 회전을 따르는 **337개(88명)**가 돈다(각도는 애니메이션마다 — 0°에 가까운 것은 안 바뀜).
- 확인: 단위 `test/render/fx-direction.test.js`(7개: dirs 기록, U_OR_D·FOUR_DIR·L_OR_R·NONE 고르기, pointTurn, 소스 고정, 추출물 mount). **아레나**(`w52_bone.mjs`
  — 아르케토 S3 네 방향, 수정 전 세로 기둥 → 후 활에서 적 쪽으로 가로 부채꼴, 고리가 서 있음; `w52_op.mjs` — 스펙터 디 언체인드 S2·엑시아 더 뉴 커버넌트 S1·니어 더
  래디언트 나이트 S3 이상한 모습 없음, 니어는 수정 전 세로 기둥 → 눕힌 호/빔). 실제 판·공식 녹화 대조는 안 함(아르케토 공식 녹화 없음). 나머지 85명 화면 확인 안 함.
- 배포: `public/assets/local/fx/modes.json`(git 밖, `dirs` 추가)을 올려야 한다 → `oci/deploy.sh --fx`.

### 정예 기물 금빛 (2026-10-08, 사용자 요청 「정예화된 오퍼는 휴식 기간에 황금빛으로 빛나는 이펙트」)
- 근거: zh_CN `gamedata/battle/battle_misc_table.json` `miscConfig.AUTOCHESS.act1autochess`·`act2autochess.effectConfig.goldenEffectId`
  = `trap_acgarm_buff_loop_01`(클래스 `AutoChessBattleMiscConfig.EffectConfig`). 메타데이터: 정비 기물은 더미(`CreateDummyOnTile` → `_DoCreateOnTile` →
  `_CreateGoldEffectIfNeed`) — 전투 유닛은 더미가 아니라 전투 중에는 없음. 프리팹은 `battle/prefabs/effects/trap.ab`(EN 클라이언트), `_spawnLocation` 1(발),
  4초 루프: 금빛 glow(`bg_011_dm`, AlphaBlend)·위로 오르는 불티(`spark_p_02`)는 sortingOrder −1(모델 뒤), 별빛 메시·`bao` 2개는 0.
- 구현: `render/fxgolden.js syncGoldenFx`(매 프레임, `app.js`가 `mode === 'prep'`일 때) → `fxgame.js statusOn(…, 'golden', 0, null, under=true)`.
  `under`는 상태 이펙트와 달리 'high'+3D 보드에서 렌더러별 분할(−1은 모델 뒤), 그 밖에는 유닛 아래 캔버스. `fxstatus.js syncStatusFx`는 자기 키(STATUS_FX)만 끈다.
  공식 이펙트가 도는 동안 원본의 절차 금빛 오라(`units.js aura`)는 숨김(전투 중 오라는 그대로).
- 보이는 모습: 몸 뒤 은은한 금빛 + 머리 위로 오르는 금색 불티. 몸이 glow를 대부분 가린다(데이터대로) — 공식 캡처와 비교 [추정].
  보드와 벤치 모두 [추정](벤치 기물도 더미 `placeToHand`). 소환물·적·장치 제외.
- **위치 수정** (2026-10-08 사용자 「빛은 뒤에 있는게 맞는데 glow 효과가 오퍼보다 아래에 있어」, 공식 녹화 `research/2026-10-07-user-issues-3/official-elite-glow.mp4`):
  보이는 빛은 `bao`(Additive, 1초 × speedMul 0.8 = 1.25초 주기)의 금빛 띠 — 로컬 정렬(align 2) 쿼드가 바닥면에 누워 pivot x 0.95·회전 −90°로
  발 앞에서 유닛 뒤로 뻗는다. 우리는 ① 렌더러 `m_Pivot`을 무시해 띠가 노드 자리(발 앞 0.4칸)에 놓였고 ② 프리팹 루트 위치(z −0.25)를 더해 전체가 떴다.
  → `fxplayer.js FxInstance` 옵션 두 개: `pivot`(빌보드·정렬·수평 쿼드가 회전 전 모서리를 pivot × 크기만큼 옮김, 셰이더 `uPivot`; 늘인 빌보드·메시 파티클은
  미적용), `atSpawn`(루트 노드 자기 위치를 버림 — 호출자가 놓는 자리가 대신함). 처음(48758a36)에는 정예 금빛에만 켰고,
  **사용자 결정 2026-10-08 「둘 다 전체 적용」**으로 두 옵션 모두 기본값이 켜짐(`false`를 넘기면 예전 방식, 지금 끄는 호출자 없음).
  영향: pivot 쿼드 412 시스템 / 242 프리팹(전체 pivot 1,836 시스템 중 늘인 빌보드 1,193·메시 94 등은 아직 미구현), 루트 위치 104 프리팹(대부분 투사체 꼬리).
  - 비교 자료(`research/2026-10-08-elite-glow/a2-pivot.png`·`a2-root.png`, 프리팹 단독 current / pivot / pivot+root — Windows `fxcmp.mjs`)와
    디버그 아레나 전·후(`a2arena.mjs`: 野鬃 S2 `a2w-*`, 空弦 공격 `a2a-*`):
    野鬃 S2 찌르기 빛줄기는 전에는 적 **반대쪽**으로 2칸 넘게 뻗었고 이제 유닛에서 적 쪽으로 뻗는다(pivot x 1.0 × 크기 1.6).
    꼬리(空弦 `archet_attack_01_trail` 루트 (0.39, 0.65), 丰川祥子 음표 등)는 투사체 선에서 떨어져 날다가 이제 선 위로 — 그런데 그 선의 높이가
    `fxgame.js TRAIL_Z` 0.35칸([추정])이라 空弦 화살이 화면에서 발 높이로 낮게 난다(전에는 루트 오프셋 덕에 머리 높이로 보였다).
    TRAIL_Z를 공식 발사 지점 높이로 맞추는 것은 따로 할 일. 첸 S2·비르투오사 S3·르무엔 S3·余·취약은 조금만 바뀜.
  - 근거·[추정]: pivot 부호(+)는 녹화에서 띠가 유닛 뒤로 가는 것(−면 발 앞·아래), 루트 버리기는 Unity `Instantiate(prefab, pos, …)` 동작 + 녹화 높이.
    클라이언트 `Torappu.Battle.Effects.ParticleEffect`(메타데이터 필드 기본값)가 자식 이름 `static_offset`·`rotation_y`·`rotation_z`·`flip_x`를 상수로 갖고
    `_overwriteHeight`·`_heightOffset` 필드가 있다 — 이 프리팹 루트 값은 false / 0(원시 필드)이라 `static_offset`(z −0.34)은 그대로 둔다 [추정: 로직은 네이티브].
    카메라는 공식 값(30°·40°, configBlackBoard 위치 — `projection.js`)이라 높이·깊이 화면 계수 차이는 원인이 아니다.
  - 측정(띠의 세로 무게중심, 발 위 칸 수 — 유닛 양옆 열, 프레임별 밝기에서 조용한 프레임을 뺀 값; 공식 칸 크기는 레벨 칩 73px ÷ 우리 43.3px × 우리 칸 124px
    = 210px, 모델 키 공식 1.14칸 / 우리 1.10칸으로 교차 확인): **공식 0.43** · 수정 전(4da8cec5) 0.0~0.08(최고점이 발 아래 = 제보) · pivot만 0.56 ·
    **pivot + 루트 버리기 0.46~0.48**. 번쩍인 뒤 0.3초 동안의 궤적은 공식과 0.05칸 안(예: +0.1초 0.30 / 공식 0.29). 이전 메모의 「아직 0.2칸 높다」는
    공식 띠를 눈대중(0~0.45칸)으로 잡은 비교였다.
  - **띠는 모델 앞** (2026-10-08 사용자 「금빛 띠가 오퍼레이터 뒤에 있어. 실제 인게임에선 위에 있었어」; 녹화도 번쩍일 때 검은 신발·정강이가
    금빛으로 덮인다): `bao`는 sortingOrder 0 — 분할 규칙이 order 0 파티클을 모두 모델 뒤 캔버스에 두었다. 클라이언트는 같은 order(Spine도 0)를
    거리로 정렬하고 `bao` 노드는 발 앞 0.4칸이라 모델 위에 그려진다 → `fxplayer.js FxInstance` 옵션 `ahead`(분할할 때 노드가 유닛보다 0.1칸 넘게
    앞인 order 0 파티클을 FX_FRONT로). `bao (1)`(뒤 0.6칸)·order −1 glow·불티는 그대로 뒤. 처음(f30f9d03)에는 정예 금빛에만 넘겼고,
    **사용자 결정 2026-10-08 「일단 19개에게도 적용해놔. 나중에 이상하면 수정요청할게」**로 기본값 켜짐(`ahead: false`면 예전 방식, 끄는 호출자 없음).
    품질 high + 3D 보드(분할)일 때만 — medium 이하는 예전처럼 전부 유닛 아래. 분할 안 하는 대상 타격·상태 이펙트는 영향 없음.
    [추정] 공식은 유닛마다 거리로 정렬하지만 우리는 「모든 유닛 앞 / 모든 유닛 뒤」 둘뿐이라 옆 칸 유닛까지 덮을 수 있다.
    - 실제로 바뀌는 프리팹(엔진으로 전 1,983개를 만들어 센 것 — `research/2026-10-08-elite-glow/ahead-in-engine-42-prefabs.txt` 42개 중 분할 경로 25개):
      정예 금빛, 데겐블레허 S3 시작, 라플란드 더 데카덴차 늑대 토큰, 텍사스 디 오메르토사 S3 범위 시작, 프라마닉스 더 프레리타 범위·S3 범위·S3 시작,
      실버애쉬 더 레인프로스트 S3 범위, 비르투오사 S3 버프 04·05(사용자가 전에 확인한 이펙트), 가비알 디 인빈서블 S1 치유·S2 버프, 글래디아 S3 버프,
      마운틴 S3 범위, 비질 토큰 치유, 사리아 자기 버프, 스카디 S3 버프, 스펙터 디 언체인드 패시브 버프·끝·S1 시작, 시 S3 버프, 시빌라이트 에테르나 S3 버프,
      울피아누스 S3 범위, 첸 더 던스트릭 S3 범위, 페페 등장. 처음 결정 때 보여 준 「19개」는 노드 회전을 뺀 오프라인 계산이라 조금 달랐다
      (`gvial2_skill_2_start_03`은 실제로는 뒤 그대로, 비르투오사·사리아·스펙터 패시브·프라마닉스 범위가 더해짐).
      샘플 비교 `ahead-sample-gvial2-s2.png`·`ahead-sample-blkkgt-s3.png`(사용자: 차이를 잘 모르겠다). 확인: mock `gg17s-*`(모델 보임, 공식과 나란히 `research/2026-10-08-elite-glow/official-vs-ours-front.png`),
    실제 판 `ggreal-*`(보드·벤치) — 둘 다 번쩍일 때 다리가 금빛에 덮임. 테스트 `test/local-patch-golden.test.js` 「opts.ahead」.
  - 남은 차이(이 수정 범위 밖): 띠가 공식보다 어둡다(칸당 밝기 합 약 2/3, 녹화 압축·감마 감안 [추정]) — 공식은 번쩍일 때 발 높이에 흰 띠가 뚜렷하다.
  - 테스트 `test/local-patch-golden.test.js`(기본값: 루트 버림·`uPivot` 설정·order 0 앞 분할, `false`면 예전 방식; `fxgame.js`의 어떤 호출도 끄지 않음).
    확인: Windows `sp-check\gg14.mjs <port> <tag> hide|show [frames]`(game-mock PREP, rAF·`performance.now`를 스크립트가 1/30초씩 넘김)
    → `gg15h-*`(모델 숨김)·`gg14s-*`(모델 보임), `gg_real.mjs`(실제 솔로 판 정비, `dbg.addDiy golden` 보드 1·벤치 1) → `ggreal-*`.
- **판매 뒤 남는 금빛** (2026-10-09 사용자 제보 「정예화된 오퍼 판매시, 정예화 이펙트가 사라지지 않음」): `syncGoldenFx`는 `views`에 남은 뷰만 보므로
  판매·이동으로 `app.js dropView`가 지운 뷰의 루프는 끄는 쪽이 없어 그 자리에서 계속 돌았다(같은 기물이 `_sig`가 바뀌어 다시 만들어질 때도 하나씩 쌓임).
  → `dropView`가 그 뷰의 상태 이펙트(`_fxStatusOn`)를 모두 `statusOff` — 전투 밖은 즉시(`now`), 전투 중은 남은 파티클 수명대로.
  확인: Windows `sp-check\goldsell.mjs <port> <tag>`(실제 솔로 판 정비, `dbg.addDiy golden` 보드 배치 → `g.sell`):
  수정 전 판매 뒤 `trap_acgarm_buff_loop_01` 1개 남음(빈 칸에 금빛 불티) / 수정 후 0개.
- 소재(git 밖): `fx_extract.py --bundle trap --prefab trap_acgarm_buff_loop_01` → `public/assets/local/fx/trap/`, 텍스처 6·메시 1, `fx/index.json`의 `trap`.
- 테스트 `test/local-patch-golden.test.js`. 확인: Windows `sp-check\goldglow.mjs`·`goldglow2x.mjs <port> <tag> <ms csv>`(game-mock PREP, 보드·벤치 기물 하나씩
  golden) → `goldfinal-bench.png`, 프리팹 단독 `gold_seq.mjs`(→ `gold_seq.png`).
  - **나뭇잎 텍스처 폐기** (2026-10-08 사용자 「한번도 실제 인게임에서 해당 나뭇잎 텍스처를 못 봤어. 그 텍스처는 폐기해」): `common_stealth` 프리팹과
    `tex/common_leaf_*.webp`를 추출물·`fx/index.json`에서 지우고, `fx_extract.py DISCARD`로 재추출에서도 뺀다. 서버 assets/local/fx에 남은 사본은
    어디서도 참조하지 않는다(rsync `--delete`를 안 쓰면 남음 — 지워도 됨).
  - **泥岩 Back 스켈레톤의 S3 시작 클립** (2026-10-08 테스트 정리에서 발견, `assets.test` 「Spine animation roles resolve」): 793a6539의
    `anim-overrides.mjs`가 앞·뒤 모두에 `Skill_2_Begin`을 넣었는데 Back 스켈레톤에는 `Skill_2_Begin`·`_Awake`·`_Sleep`이 없다 → `applyAnimOverrides`가
    스켈레톤 클립 목록(`spine.mjs`가 넘김)에 없는 덮어쓰기 클립을 null로 둔다(Back S3는 시작 클립 없이 `Skill_2_Attack`·`_Idle`). `fetch-assets --offline`으로
    매니페스트를 다시 만들어 바뀐 것은 이 한 칸(+hash). 테스트 `test/local-patch-battle.test.js`.
  - **望 바둑돌 이펙트 높이** (2026-10-08 사용자 「수동, 재능 바둑돌 이펙트가 loop 되지 않고 한번만 나타나고 있어서 모르겠어」): 공식 캡처
    (`cap-231814.png`)는 돌의 금빛·십자·연결선이 **공 위**(그림자에서 화면상 0.19칸)인데, 우리는 `_spawnLocation` 5대로 땅에 그려 돌의 루프(`sz` 십자 빛)가
    공 밑 그림자에 묻히고 첫 폭발만 보였다 → 탄생·跟子 이펙트(주인 따라감)와 연결선·활성 섬광을 공 중심(화면상 0.18칸, `fxgame.js STONE_BALL`·`ballZ`)에.
    폭발(`token_wang_skill_0N_hit*`)은 그대로 땅. 확인: Windows `sp-check\wst5.mjs`(디버그 아레나, `CAST=i`로만 발동) → `wst5b-zoom.png`.
    → **재제보 2-2로 일부 되돌림** (아래 「望 바둑돌 이펙트 재제보」): 탄생 십자는 다시 땅, 활성 휘감김·연결선만 공에.
  - ~~**跟子 이펙트 반복** [추정]~~ (e98f7e23, 2026-10-08 재제보 2-1에서 삭제): 跟子의 `wang_passive_01_buff`를 3초마다 다시 틀던 것. 캡처의 검은 연기는
    탄생 이펙트가 아니라 활성 이펙트(`wang_passive_01_buff_02`의 `line` 메시)였다.
  - **望 바둑돌 이펙트 재제보** (세션 B, 2026-10-08, `research/2026-10-08-report3-status.md` 2-1·2-2·2-7, 캡처·스크립트 `research/2026-10-08-wang-stone/`):
    - **2-1 활성 이펙트 유지** (452183c5): 「루프」로 보여야 하는 것은 활성(연결) 이펙트 — 놓은 돌 `token_wang_01_buff`(sktok_wang_N/TriggeredEffect
      `_buffs[0].overrideEffectKey` = 버프 이펙트), 跟子 `wang_passive_01_buff_02`(투사체 `_triggeredEffect`). 둘 다 `line` 메시(검은·금빛 휘감김)가 클립의
      `_Amount` 1 → 0으로 0.6초에 드러나고 그대로 남는다. 루트 효과 컴포넌트 원시 int #17이 상태 버프 거의 전부와 이 둘·탄생 이펙트 = 1, 폭발 = 0
      [추정: `_isLoop`]. 우리는 클립·파티클이 끝나면(약 1초) 버렸다 → `playAt keep`으로 돌에 붙여 그 돌의 `die`(소모·회수)까지 유지. 그리고 정비에서 붙여 놓은
      돌은 전투 첫 틱에 활성되는데 그 'wangLink'가 화면이 필드에 들어가기 전이라 `screens/game/early.js keepEarly`가 버렸다(fx라서) → 'wangLink'도 남김.
      탄생 이펙트 `token_wang_birth_01_buff`에는 같은 `line` 메시가 꺼져 있다(외톨이 돌은 휘감김 없음 = 공식 캡처 아래쪽 돌).
    - **2-2 탄생 십자는 땅** (8da36a4d, 사용자 정정: 「공이 아니라 공 밑 십자가 모양 이펙트가 타일 위치와 어긋남」): 탄생 이펙트의 루프 십자(`sz`/`sz1`: 땅 평면의
      길이 1칸 납작한 쿼드)는 땅 표시 — 공식 캡처에서 팔이 타일 가장자리에서 가장자리까지, 타일 중간보다 8~10px(타일 ~250px) 위. 공 높이로 올리면 화면에서
      약 0.15칸 위로 뜨고 원근 때문에 칸마다 다르게 어긋난다 → STONE_BORN은 돌 뷰의 땅. 활성 휘감김·연결선은 공에(캡처에서 공을 감쌈).
    - **2-7 폭발** (1b272025, cc903fdb): 돌에서는 클라이언트가 트는 것만 — sktok_wang_1/3 `_castEffects`, sktok_wang_2/ExplodeRow·Col·Cross `_effectKey`
      (축마다), 跟子 투사체 `_effectOnTrigger`(`fxgame.js stoneBlastFx`). `_02`는 타격 이펙트(ExplodeRow `_hitEffects`, S3 跟子 `_effectsWhenHit`)라
      같은 순간의 'dmg'로 범위 안 적·터뜨린 적마다(`stoneHit`, `inStoneBlast`). `token_wang_skill_03_hit_03`(모든 시스템 x+2칸 = S3 폭발 사본)은 어디서도
      참조하지 않아(charpack, 토큰 번들, `[uc]` 6개, 표) 안 튼다 — 2칸 옆 두 번째 폭발과 ~9칸 직선 입자의 원인. 그리고 `fxplayer.js shapeSample`이
      BoxShell/BoxEdge(15/16)의 크기를 두 번 곱했다 → S3 `lizi_l`이 ±1×±1.5칸 대신 ±2×±4.5칸. **사용자 결정(2026-10-08): 전체 적용** — 58 시스템·36 프리팹
      (buff_sluggish, buff_autochess_frozen, 첸 S3 범위, 로즈몬티스 S3 …), 전후 `research/2026-10-07-user-issues-3/boxshell-before-after.png`.
      남은 차이 [추정]: S3 `lizi2 (1)/(2)` 가는 호는 프리팹 자체가 반지름 2.2 원에서 나와 마름모 대각선 모서리를 조금 넘음(공식도 같다고 봄), 늘인 빌보드
      pivot(`lizi2 (2)` 0.5, `sdx_line` 1, `baoci` −0.5) 미구현. 테스트 `test/render/wang-stone-fx.test.js`.
    - **돌아오는 돌 위 금빛 기둥·육각형** (세션 B 범위 밖 ①, 2026-10-08 세션 stronghold-99): 세션 B 캡처 `real-after-s3-blast.png` f2의 노란 기둥+흰 심지+
      육각형은 소환 대체 그림(민트)이 아니라 **스킬 발동 대체 그림** `fx.skill`이다. 소모된 놓은 돌이 같은 id로 돌아올 때 시뮬레이션은 토큰 패시브의
      `['skill', id, 1]`을 `['deploy', id]`보다 **먼저** 보낸다(`deploy.js` `skill.reset` → 'deploy'; 실제 매치 5판에서 S3 중 `die` 2.0초 뒤가 대부분).
      쓰러지는 뷰는 최대 2.15초 남으므로(`units.js` `dying`) 그 뷰 위에 `render/app.js`가 `burst: !ownsSkill(v)`로 금빛 기둥을 그렸다(토큰은 `isOp`가 아님).
      → `fxgame.js ownsSkill`이 望 돌 뷰에 `stonesOn()`을 돌려줌(돌의 탄생·활성은 stoneFx의 공식 프리팹). 세션 B의 「跟子 'summon'이 뷰보다 먼저 온다」는
      추정은 틀렸다: 실제 매치 경로 124개 summon 모두 spawn 뒤, Windows Chrome 실제 판에서도 소환 대체 그림 0회, 跟子 탄생은 `wang_passive_01_buff`(3/3).
      확인 수준: 실제 판에서 돌의 `fx.skill`이 수정 전 `burst: true` → 후 `false`(Windows `sp-check\w4_real.mjs`), 기둥 자체는 실제 판에서
      다시 찍히지 않음(쓰러지는 뷰와 겹치는 타이밍이 이번 판들에 없었음 — 원인은 이벤트 순서 데이터 + 페이드 시간으로 추론).
  - **6. 赤刃明霄陈 S3 용이 그녀를 가림** (세션 stronghold-1d 첸 포크, 공식 캡처 `cap-230329.png` + 공식 녹화 `첸 S3.mp4`: 용은 그녀 뒤):
    ① 용 버프는 클라이언트가 **한쪽만** 튼다 — `skchr_chen3_3/SwitchMode` `overrideEffectKey` = `chen3_skill_03_buff_L_01`이고, 그 프리팹 루트의 두 번째
    컴포넌트 `_rightEffect` = `chen3_skill_03_buff_R_01`(`_onlyCheckOnPlay` 0)은 오른쪽을 볼 때 대신 트는 사본이다. 우리는 이름 규칙(`effectsFor
    skillBuff`)으로 L·R을 둘 다 틀어 용이 두 마리였다. → `fx_extract.py right_effect`가 L 프리팹 JSON에 `right`를 쓰고(전 번들 15쌍: chen3 1, mlynar
    12(기본 스킨 추출분 3), texas2 1(미추출 스킨), tippi 1 — 추출된 L 5개만 다시 뽑음), `fxgame.js play()`는 오른쪽이면 R, 왼쪽이면 L을 **뒤집지 않고**
    한 번만 튼다(R은 목록에 같이 있어도 건너뜀). [추정] 뒤집지 않음: L을 뒤집으면 왼쪽을 볼 때 용 머리가 그녀 앞(진행 방향)에 오는데 공식 녹화는 뒤.
    `_onlyCheckOnPlay` 0(방향이 바뀌면 다시 고름)은 구현 안 함 — 발동 때만 고름.
    ② order 0 입체 메시 「앞」 규칙(`WRAP_H`, 쿠오라·마터호른 돔)에 조건 추가: 메시가 유닛 칸 줄에 닿아야(`min.y` ≤ 0.5행) 감싼다고 본다(`fxplayer.js
    wrapsUnit`). 용 머리 `longtou`(order 0, 높이 0.56)는 그녀 뒤 0.8~1.6행에 놓여 뒤로 간다; 돔은 −0.1행부터라 그대로 앞. 전 프리팹 중 바뀐 메시는 7개
    (chen3 buff_L/R longtou·range 뒤 벽, pepe S2 hit trail, texas2 S3 range_start 2, philae S1 start) — 모두 유닛보다 뒤에 놓인 것.
    [추정] 클라이언트는 order 0을 거리로 정렬(Spine의 정렬 기준점은 모름) — 「뒤에 떨어져 있으면 뒤」만 반영.
    - 남은 차이: 공식 녹화는 용 머리가 그녀 어깨 위로 크게 드러나는데 우리는 그녀 몸에 대부분 가린다. 같은 장면에서 우리 첸이 칸 대비 약 1.3배 크다
      (공식 녹화 키 ≈ 1.07칸, 아레나 ≈ 1.35칸, 사용자 캡처 ≈ 1.6칸) — 유닛 크기 문제로 보임, 이 수정 범위 밖(확인 필요).
  - **8. 赤刃明霄陈 S3 검기가 상자(阻隔工事)를 뚫고 올라감** (`act2autochess_m03` 排气格栅, 상자 = 장치 `trap_1105_accrate`이 `b` 낮은 칸 위에 놓임 —
    「언덕 타일」이 아니다): 시뮬레이션은 그대로 둠 — 클라이언트 상자 프리팹 모드 `_tileOptions.heightType` 0 + `_rewriteTileHeightType` 0
    (`_rewriteTileHeight` 1, `_rewriteHeight` 0.4: 높이 값만 바꾸고 높이 종류는 LOWLAND 그대로)이고, 투사체 `ChangeStateWithHighlandBehaviour`는
    `_checkHitHighland`(높이 종류)·맵 끝·侵入点·保护目标만 본다 → 공식도 검기는 상자를 지나간다 [추정: 높이 종류만 본다는 것은 필드 이름·PRTS 「高度类型为高地」].
    대신 그리기: 공식 맵·장치는 깊이 버퍼에 있는 불투명 메시라 `_ZTest` 4인 렌더러(검기 용 머리 `long_02`·꼬리 리본 대부분, 버프 용 머리 `longtou`)는
    상자 안에서 가려지고 `_ZTest` 0인 것(별빛·빛)만 위에 보인다. 우리 이펙트 캔버스는 보드와 다른 캔버스라 깊이가 없었다 → `fxgame.js` occluders:
    3D 보드일 때 높은 칸(`tiles.grid` 높이, `app.js` `grid` 옵션 1줄)과 전투 장치 상자(`DeviceView` `spec` 크기·높이)를 상자 꼴로 이펙트 캔버스 셋의
    깊이에만 먼저 그리고(색 안 씀), `fxplayer.js`는 재질의 `depthTest`를 `_ZTest`대로 켬(모든 이펙트 렌더러가 깊이를 안 쓰므로 가림막 말고는 차이 없음).
    윗면은 0.05 낮춤(높은 칸 위 유닛 발밑 이펙트, 바닥 자르기와 같은 값). 검기 용은 클립으로 높이 약 0.55~0.6에서 날아 상자(0.74) 안에 들어간다.
    - 디버그 아레나 `arenaStage('stage:<스테이지 id>')`: 실제 스테이지(씬·타일·상자)를 그대로 — 칩 없음, 확인 스크립트가 `__debug.st.terrain`으로 지정.
    - 확인(Windows Chrome): `sp-check\chen_cap.mjs`(평지, 2배 해상도), `chen_cap2.mjs <port> <prefix> <op:skill:row.col.DIR> <n> <ms> 1
      [terrain]`(`HEADFX=1` = git HEAD의 fxgame/fxplayer로 바꿔 끼워 전후 비교). 결과 `chenR/L-*`(평지, 용 뒤·한 마리), `chenUh-*`(HEAD: 상자 위로 용) ↔
      `chenFinU-*`(수정: 상자 안에서 가려짐, 꺾은 뒤 다시 보임), `chenFinR-*`(오른쪽 배치, 뒤 상자 위에 용 없음).
    - [추정]·남은 것: 상자 가림막은 칸 크기 상자(0.84×0.74, `DEVICE_BOX.crate`) — 공식 상자 메시 모양과 조금 다름. 전투 밖 정적 상자(전투 칸 밖)는 가림막에
      안 넣음. 2D 보드는 그대로. 사용자가 「상자에서 꺾여야 한다」고 기억하면 시뮬레이션 변경이 필요(공식 녹화로 확인 후 결정).
    - 사용자 답(2026-10-08): 「해당 맵은 기억이 안나. 일단 배치 불가 언덕처럼 보여서 그렇게 판단했으니, 이건 문서에 기록해놔」 — 제보는 상자를
      배치 불가 언덕으로 본 것이고 공식 동작 기억은 없다. 시뮬레이션(상자를 지나감)은 그대로, 공식 녹화에서 검기가 상자에서 꺾이는 것이 보이면 다시 연다.
      참고: 공식 PC 캡처 `research/2026-10-07-user-issues-3/official-pc-round8.png`(사막 맵)에서 전투 중 상자(HP 바 있음)는 칸 위 장치로 보인다.

### 回环射手 부메랑 (2026-10-08, 사용자 제보 4차 4-6 「투사체는 하나만 있고 부메랑처럼 돌아온다. 공격하지 않을 때는 오퍼 손에 들려 있어야 한다」, 세션 I bd2ebe3f)
回环射手는 풀에 跃跃(케이퍼 `char_4100_caper`, `chess_char_1_09`)뿐이다(`data/chess.json` loopshooter). 시뮬레이션(`ai.js throwBoomerang`)은 이미 한 개를
던지고 받은 뒤 다시 공격한다 — 화면만 고쳤다.
- 근거(EN 클라이언트, 2026-10-08 UnityPy): `projectile_chr_caper`(`battle/prefabs/[uc]projectiles.ab`) `_speed` 15, `_comeBack` 1,
  `_comeBackSpeedScale` 0.25(= 3.75, 시뮬레이션 `BOOMERANG_RETURN_SPEED`), `_mainEffect` `caper_attack_01_trail`, `_clearMainEffectWhenReached` 0 —
  돌아올 때도 같은 이펙트. 그 이펙트의 `wheel` 파티클(텍스처 `caper_wheel`, 수명 5초 1개)이 던진 바퀴다. 스켈레톤(`.skel`, front·back)은 그
  바퀴(영역 `C_Weapon_03`, 같은 그림)를 기본 스킨에 두지 않고 Spine 스킨 **`Bullet`**(첨부 1개)에만 둔다. 특성 능력(`Others/Direction/Trait`,
  「持有回旋投射物时才能够攻击」)의 `_skinKey`가 `"Bullet"` → 투사체를 들고 있으면 `Bullet` 스킨이 켜진다고 봄 [추정: 켜고 끄는 코드는 네이티브.
  애니메이션은 모두 `C_Weapon_03`를 키로 갖고, 숨기는 키는 없다]. 우리 Spine 중 기본 외 스킨은 이것 하나뿐(전수).
- 수정 전: 공식 꼬리(`trailShot`)가 대상까지만 날아가 멈췄고 바퀴 파티클(5초)이 대상 위에 남아 공격마다 하나씩 늘었다. 꼬리 파일 로드 중 첫 공격은
  절차 부메랑(두 갈래 그림)이었다. 손에는 바퀴가 한 번도 안 보였다(`Bullet` 스킨을 안 씀).
- 수정: `fxgame.js` — `'boomerang'` 꼬리는 맞은 자리에서 돌아서 쏜 자리(Muzzle)로 `projSpeed('boomerangReturn')`로 돌아오고(진행률 k를 1→0, 방향은
  그녀 쪽 = `_rotateToTarget`), 받거나 그녀가 없어지면 즉시 지운다(`stop(true)`), `clear()`는 날던 것을 돌려준다. 새 `render/boomerang.js` —
  그려진 비행(공식 꼬리, `fx/projectiles.js` 절차 부메랑)이 `view._boomOut`을 세고, `units.js`가 하나도 없을 때 `Bullet` 스킨을 켠다(`heldStats()`는
  확인용). S2 `caper_skill_02_trail`도 같은 길.
- 확인: 디버그 아레나(Windows Chrome, 수정 전·후 캡처 — 바퀴가 돌아오고 한 번에 하나, 대상 없을 때 손에 바퀴 front·back, S2) + 실제 솔로 판(상점에서
  산 跃跃: 던짐/잡음 전환, 꼬리 복귀). 테스트 `test/local-patch-status-boomerang.test.js`(스킨 데이터 고정 포함).
- 남은 것(범위 밖, 시뮬레이션): 공식 S2 「每次攻击额外发射1个回旋投射物」은 투사체 2개(`projectile_chr_caper_s2`·`_s2_1`)인데 시뮬레이션은 1개에 2타라
  화면에도 바퀴 1개. 시뮬레이션은 받는 틱에 바로 다음 공격을 던져(공격 쿨다운이 이미 참) 손에 든 모습은 연속 공격 중 거의 안 보인다 — 공식은 받은 뒤
  Attack 클립(OnAttack 0.533초)이 돈 다음 던진다고 봄 [추정]. 둘 다 `server/sim/ai.js`라 이 세션에서 안 고침.

### 사용자 제보 4차 텍사스 — 텍사스 디 오메르토사 S2 발동·S3 검우 (2026-10-08, 4-3 「S2 이펙트가 이미지처럼 멈춤」·4-5 「S3 지속 중 검이 계속 떨어져야」, 세션 H)
원인 조사·반박 검증은 `research/2026-10-08-orchestration/triage-report4.md`(워크스페이스 루트). 사용자 결정 2026-10-08: ① 4-3은 A만, ② 4-5는 이름 교체 + texas2 번들만 재추출.
- **4-5 A — 검우 프리팹 이름** (b71bd9a8): 시뮬레이션 'swordRain'(대상마다, `src` = 그녀)이 클라이언트에 없는 이름 `texas2_skill_03_hit`(검 없는 스파크)를
  그렸다. 공식: `[uc]skills.ab` ModeWithSwordRain의 EmitSword가 1초마다 투사체 `projectile_chr_texas2_s3_sword_rain`을 쏘고, 그 `_effectsToTargetWhenStart` =
  `texas2_skill_03_hit_02`(5.5칸 위에서 0.13초 낙하 `luojian` + 착지 `luo`, 2.62초). → `fxgame.js`가 스킬 바인딩의 target(`modes.json skills[2].target`)을 그린다.
- **4-3 — 재생기 다중 클립** (537869d2): 프리팹 안의 중첩 서브프리팹은 자기 Animator·클립을 가진다. `FxInstance`가 `clips[0]`(루트 것)만 틀어 S2 발동
  `texas2_birth_02_start`의 베기 4개(메시 16개)가 머티리얼 기본값으로 약 2초 굳어 있었다. 이제 모든 클립의 트랙을 묶어 각 클립 길이까지 재생(끝 프레임 유지),
  `done`·꼬리는 가장 긴 클립 기준. 추출기는 이미 클립 노드를 전체 트리 번호로 풀어 둠 → 재추출 없음. 적용 안 한 것(결정): 중첩 서브프리팹 `_delayTime` 0~0.3초(B,
  지금은 동시 시작), 루트 `_delayTime`(①-b, 약 310 이펙트) 보류. `m_IsActive`(C)는 아래 「착지한 낙하 검」에서 나중 결정으로 적용.
  `bench/fx/compare.mjs`(HEAD 대비 1983 이펙트 × 4프레임): 바뀐 것은 클립 2개 이상인 11 프리팹뿐(바인딩된 6: 텍사스 디 오메르토사 S2 발동·S3 범위 시작, 무에나 S2,
  위셔델 S2 2종, 불피스폴리아 S2 / 바인딩 안 된 svash2 방패·불피스폴리아 방향별 4), 나머지 1972는 픽셀 동일.
- **4-5 B — 내장 Quad/Plane 메시** (7865972c): 검날 노드(jian / jian1 / add)는 Unity 내장 Quad(FileID → `Library/unity default resources`, PathID 10210)
  MeshFilter라 `fx_extract.py`가 못 풀어 메시가 빠졌다(재질 트랙도 'attr:'로 남음). 클라이언트가 그 파일을 `<Arknights_Data>/Resources/unity default resources`로
  싣고 있어 합성 대신 **실제 메시를 읽는다**(`Extractor.mesh_ref`, 메시 자리만; Quad 10210·Plane 10209만 — Cube 10202·Sphere 10207은 결정 범위 밖).
  재추출은 texas2 번들만: 9 프리팹 69 노드에 메시가 생김(S3 낙하 검·범위 모서리 검·범위 시작 27, S2 버프 메시 5, S1·S3 버프, buff_02_start 2종), 그 밖의 필드는
  재추출 전과 같음. 산출물 `public/assets/local/fx/texas2/*.json`·`mesh/Quad_000027e2.json`은 git 밖 → **배포 때 `oci/deploy.sh --fx`**. 나머지 ~316 프리팹(65 번들)은 보류.
- 확인: 단위(`test/render/texas2-skill-fx.test.js` — 바인딩·이름, 실제 `birth_02_start`로 베기 4개가 1초에 사라짐, hit_02 검날 메시; `test/local-patch-fxmodes.test.js`
  다중 클립 합성 케이스). **아레나**(Windows Chrome, `/debug.html?op=char_1028_texas2`): S2 발동 베기가 0.2초에 보이고 0.8초에 사라짐(전엔 약 2초 정지);
  S3 범위 시작 낙하 검·모서리 검, 샌드백에 1초마다 먹 검 낙하 + 착지. 무에나·불피스폴리아 S2 이상 없음(위셔델 S2 시작은 아레나에서 안 틀려 픽셀 비교만).
  **실제 솔로 판**(`sp-check\h_real.mjs`, 상점 구매 → 배치): S2 발동이 전투 카메라 진입 중 재생·0.6초에 사라지고 버프만 남음; S3 검우
  `hit_02`가 1초 간격(32.18/33.14/34.14/35.14)으로 적 위에 사선 낙하. **공식 녹화**: S2 녹화(3초)는 스킬 중 평타 구간뿐이라 발동 프레임 대조 불가 — 평타 베기는
  0.4초 안에 사라져 멈춘 그림 없음. S3 녹화(확대)의 「위에서 사선으로 내려오는 큰 먹 검」과 우리 낙하 검의 모양·색은 맞음; 크기·각도의 프레임 단위 대조는 안 함.
- **착지한 낙하 검 — `m_IsActive`** (409a3869, 사용자 결정 2026-10-08 「공식과 동일하게」): 메시가 생기자 `texas2_skill_03_range_start`(낙하 4)·`_start`의
  검이 착지 뒤에도 클립 끝(1.53초)까지 α 0.5로 남았다 — 공식은 클립의 `m_IsActive` 트랙(Mecanim type 1, crc32 2086281974)으로 0.2초(start 0.37초)에 끈다.
  `FxInstance`가 이 트랙을 묶어 노드 visible을 따르게 하고(메시·라인), 그 아래 파티클은 꺼질 때 비우고 멈추며 다시 켜지면 처음부터(Unity GameObject 비활성 /
  playOnAwake), 꼬리는 꺼질 때 비운다 [추정: 비움]. 이 트랙이 있는 프리팹 83개 전체에 적용 — 픽셀 비교(1983 × 4프레임)에서 43개가 바뀌고 모두 83개 안
  (로즈몬티스 13·라플란드 더 데카덴차 소환물 타격 6·위셔델 4·쉐라·락락 소환물 타격 각 4·엑시아 더 뉴 커버넌트 버프 3 등), 나머지 1940 동일.
  아레나·실제 솔로 판 S3 재확인(오류 없음, 범위 시작 착지 검 9 → 5).
- **처음부터 꺼진 노드** (13925b31, 사용자 2026-10-08 「일단 꺼봐」 — 시험 적용): 트랙 없이 처음부터 꺼진 노드 아래 파티클·꼬리(166 프리팹 51 번들, 파티클 455·꼬리 61)를
  이제 재생하지 않는다(메시는 원래 숨김). 근거: EN 클라이언트 번들 검사(워크스페이스 루트 `research/2026-10-08-inactive-nodes/`) — 164 프리팹은 그 노드를 켜는 트랙도
  가리키는 컴포넌트도 없음, 1개는 `_inactiveOnFinish`(끝날 때 끄는 목록)만, 1개는 트랙(위). 네이티브 코드가 이름으로 켜는 경우는 배제 못함 [추정].
  표본 아르케토 S3: `archet_skill_03_start`의 꺼진 `smoke`가 대상 위에 큰 연기를 그렸다 — 같은 시스템이 `archet_skill_03_start_01`에 켜진 채 뒤쪽(0.65, 0.63)에
  있고 사용자가 실제 게임에서 본 「S3 공격마다 뒤로 보이는 연기」가 그것(그대로 남음). 픽셀 비교 117/1983 변화(일부는 난수 순서만), 아레나 아르케토 S3 전후.
- 남은 것: 범위 밖(보고만):
  공식 첫 검우 0.4초 + 검마다 0~0.3초 랜덤 지연(시뮬레이션 규칙), 매 공격 `texas2_skill_02_start`·`_start_02` 동시 재생, S3 배치 폭발(AppearSwordRain, `_hitEffects []`)
  대상에도 hit_02를 그리는 `expect` 규칙.
