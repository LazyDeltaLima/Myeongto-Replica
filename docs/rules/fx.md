# 공식 전투 이펙트

옛 `docs/LOCAL-PATCH.md`에서 2026-10-09에 나눈 파일이다. 옛 절 이름은 `docs/LOCAL-PATCH.md` 색인에서 찾는다.
공식 이펙트 추출물(`public/assets/local/fx/**`, `modes.json`·`points.json` 포함)은 git 밖이다 — 추출 도구로 만들고, 배포 서버에도 같은 파일을 둔다.

## 공식 전투 이펙트 (2026-10-05)
- `tools/local-extract/fx_extract.py`: EN 클라이언트 `battle/prefabs/effects/<이름>.ab`의 프리팹을 JSON(노드 트리, 파티클 모듈,
  재질, Mecanim 클립 곡선) + PNG 텍스처 + 메시 JSON으로 뽑는다. 텍스처는 다른 번들에 있어 CAB 색인(`--build-cab-index`, 약 15분)이 필요.
  지금 뽑은 것: chen3·wang·wisdel·oblvns·ascln 기본 스킨만 139개, 약 7.5MB(텍스처는 정지 WebP q85·알파 무손실, `--png`로 PNG; 스킨 변형은 `--all-skins`로만).
  望의 棋子 이펙트(`token_wang_*` 10개)는 공용 토큰 팩에 있어 `--pack`으로 따로 뽑는다:
  `fx_extract.py … --bundle wang_token --pack pkgrps/btl_pfb_fx_token_3.ab --match '^token_wang_'`.
  `fxgame.js stoneFx`가 `op-wang.js`의 `zone`(棋子 token, 스킬 1/2/3별 폭발; 2는 연결 축마다 `rotation_z` 0°/90°)·`wangLink`(처음
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
  클라이언트에만 있는 파일이라 공개 미러가 없다 → git 밖(`public/assets/local/fx`)에 두고 서버가 직접 보낸다.
- `render/fxplayer.js`: Unity 파티클 부분집합 + TrailRenderer/파티클 트레일 + 클립(위치·회전·재질 값) 재생, Torappu 셰이더를 흉내 낸 셰이더 1개.
  셰이더 속성·블렌드는 클라이언트 선언에서 확인, custom data·램프·디졸브 해석은 [추정](화면 보고 맞춤).
  성능(2026-10-05, WebAssembly 포팅 검토 — 비공개 조사 기록): 입자 수는 카운터로, 프레임마다 만들던 배열·객체
  제거, 곡선·그라디언트는 로드할 때 Float64Array로 평탄화(계산식과 순서는 그대로), 인스턴스 속성 8개는 interleaved 버퍼 하나(시스템당
  업로드 1번), 꼬리 버퍼는 쓴 구간만 업로드, MAX_INSTANCES로 끝난 인스턴스는 `done`. 렌더 결과는 바꾸지 않는다:
  픽셀 비교 도구(비공개)로 git 판과 비교해 361개 × 4프레임 동일. 빈 꼬리 메시를 숨기면 다른 그리기의 픽셀이 조금
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
- 디버그: `/debug.html` — 샌드백 아레나 (2026-10-07, 관리자 요청 「스킬 효과음·타격음·스킬 이펙트 디버깅」).
  - 손패 기물 (관리자 요청 「望처럼 함정 기물을 쓰는 오퍼레이터 처리」): 고른 오퍼레이터의 `placeable` 기물(tokens.json·`data/backups.json` diy: 望 棋子 6, 赫默
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
    저지된 상태로(`defaultBags`). 샌드백 모드에서 클릭으로 추가(최대 8)/제거. 공격값만 주면 근접 적은 자기를 저지한 아군만 친다
    (`ai.js enemyAttack`) — 앞 칸에 선 샌드백은 저지되지 않으므로 치지 않는다.
  - 아군 공격(2026-10-10, 관리자 요청 「적들이 아군 오퍼를 공격 가능하게」): 켜면 샌드백이 원거리 공격자(applyWay RANGED, 사거리
    `ISLAND_REACH` 9 = 섬 전체)가 되어 섬 어디의 아군이든 친다. 공격값 0이면 그 적의 원래 공격력. 투사체가 있는 적은 자기 투사체가
    날고, 근접 적은 투사체 없이 타격 프레임에 맞는다(`proj: null`). 「오퍼레이터 버티기」(기본 켬): 스텝마다 체력이 25%(`KEEP_OP`)
    아래면 가득 회복하고 로그에 ♥ 줄 — 한 방에 75%를 넘는 피해면 쓰러진다.
  - 스킬 조작: SP 채우기(발동은 원래 규칙대로) / 지금 발동(조건·조작 쿨다운 무시) / SP 자동 회복 끄기(`spGain` 훅) / 아군 부상
    (메딕 확인용: 1.5초마다 최대 체력 20% 고정 피해, 35% 이하로는 안 깎음).
  - 로그: 전투 이벤트마다 매핑되는 공식 이펙트 이름(`fxmap.js effectsFor`), 실제로 시작된 효과음(`audio._play` 감싸기: 공격음/타격음/
    스킬음/키트 타격음…, 이름은 효과음 뱅크 키로 붙인다 — `audio.js _play`의 `bank`, 동시 재생 제한(`SfxLimiter.acquire`가 null)으로
    생략된 것은 빨강)과 대사(`audio.voice` 감싸기: 음성 게이트로 생략, 파일 없음 구분), 빠진
    데이터 경고(공격·타격·스킬 효과음 없음, 스킬 모드 파일이라 일반 공격엔 안 남, 키트 타격음 매핑 없음, 이펙트 번들 없음).
    오디오는 첫 클릭 전엔 이벤트를 버리므로 잠금이 풀리면 필드 유닛을 다시 넘긴다(`audio.setFieldUnits`).
  - 효과음·대사 파일 미리듣기와 추출된 이펙트 목록은 그대로(이펙트는 `view.debugFx` → `fxgame.debugPlay`로 오퍼레이터에, hit는
    샌드백에). 일시정지·0.1초 진행·속도(0.25–2×)·품질·음성 언어·볼륨·사거리 표시. 공식 이펙트는 게임처럼 실시간으로 돈다(속도와 무관).
  - URL: `?op=<charId>&elite=1&skill=<n>&module=<id>&dir=<DIR>&enemy=<key>&terrain=<flat|high>&attack=1&fx=<bundle>/<prefab>`.
  - 2026-10-10: 효과음 제한기가 `tryAcquire`에서 뱅크별 `acquire`로 바뀐 뒤(공식 SoundFXBank) 로그 감싸기가 옛 함수를 찾다 시작 단계에서
    멈춰 모델·전투가 안 떴다 — 감싸기를 `acquire`로 바꿈. 오디오 내부를 감싸는 곳이라 `audio.js` 구조가 바뀌면 함께 확인할 것.
- 荒芜拉普兰德(라플란드 더 데카덴차) S3 늑대 (2026-10-06, 관리자 제보): 원본 sim의 드론은 위치만 있는 가상 유닛이라
  클라이언트에는 시작·공격 때의 `drones`/`drone` 퍼프만 갔다. `kits/ops/chess_char_6_18-whitw2.js` S3 onTick에 한 줄(local patch)로 0.15초마다
  `fx 'whitw2Drones' {id, d: [x, y, …]}`(드론 위치)를 보내고, `fxgame.js wolfFx`가 드론마다 공식 늑대를 띄워 위치를 따라가게 한다.
  근거: EN `[uc]projectiles.ab` `projectile_chr_whitw2_funnel_s3_1…4`의 `_mainEffect` = `whitw2_skill_03_token_trail_01`(늑대, 7초 →
  스킬 동안 반복). 드론 공격은 `whitw2_skill_03_token_hit_01`([추정] 이름 기준 — funnel 프리팹에 hit 목록 없음). 스킬 종료·퇴장에 끝.
  `render/fx.js FX_KINDS.whitw2Drones`는 `none`(이펙트 추출이 없으면 예전처럼 퍼프만). 테스트: local-patch 「荒芜拉普兰德 S3 wolves」.

- (스킬 타격 효과음 · 스킬 모드 효과음·믹서 볼륨은 `docs/rules/audio.md` 「스킬 효과음」으로 옮겼다.)
- 스킬 중 공격 이펙트·이펙트 배속 (2026-10-07, 공식 비교 — 비공개 조사 기록):
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
  - 전 오퍼레이터 추출 (2026-10-07, 공식과의 차이로는 가장 컸던 것): 풀 126명 중 이펙트가 없던 99명의 번들을
    기본 스킨 전체로 추출(`fx_extract.py --bundle …` ×99, 11분, 오류 0). 번들 125개·프리팹 1,955개, `public/assets/local/fx` 25 → 58MB.
    클라이언트에 전용 번들이 없는 2명(엑시아 `char_103_angel`, 피스 `char_616_pithst`)은 절차 이펙트 그대로.
    Chrome 일괄 점검(124명 × 스킬 372개, 페이지 오류 0): 바인딩 시전 이펙트가 있는 187개 중 156개 재생(나머지는 측정 창 2.6초 안에 공격이
    없거나 시뮬레이션에서 스킬이 공격 전에 끝나는 경우). 이 추출로 두 가지를 고쳤다 — ① 자기 스킬 이펙트가 번들에 없는 스킬(저티어 S1 다수: 공식은
    추출 안 된 공용 버프 이펙트)은 발동 표시가 아예 없어졌다 → `ownsSkill`이 그 스킬에 공식 start/buff/모드 이펙트가 있을 때만 참(아니면 절차 금색
    빛기둥), ② 모드 바인딩 없는 스킬의 지속 범위(사리아 `skgoat_skill_01_range`): `fxmap.js effectsFor('skillBuff')`에 `…_range(_0N)` 1개 추가, 모드
    `attach`와 합쳐 중복 없이 한 번.
  - 추출 범위: 바인딩된 이펙트 241개 중 69개가 추출본에 없었다(예전 추출이 스킬 일부만) → 16개 번들(nearl2 siege2 whitw2 blaze2 angel2
    sbell2 dusk yu cello aglina rosmon titi pepe mlynar lemuen pasngr)을 기본 스킨 전체로 다시 추출(`fx_extract.py --bundle …`, 19→25MB). 남은
    3개는 aglina가 다른 번들(`glassb_*`, `common_magic_trail_01`)을 씀.
  - `stats().recent`(최근 시작한 프리팹 24개)를 `/debug.html` 로그가 「✦ 이펙트 재생」으로 보여 준다.
  - 모드 버프 이펙트 `attach` (2026-10-07 관리자 제보): 모드의 Talents 능력이 거는 버프의
    `overrideEffectKey`(丰川祥子 S3 `oblvns_s_3[eff]` → `oblvns_skill_03_range`)를 `char_modes.py`가 모드별 `attach`로 뽑고, `fxgame.js`가 그 스킬이
    켜져 있는 동안 오퍼레이터 아래 층에 버프로 띄운다(스킬 끝에 멈춤). 공격이 대상에 거는 버프(`_activeBuffs`)는 넣지 않는다. 모드 능력이 붙이는
    이펙트도 같다: 시전기의 `_attachEffects`와 능력의 `_effects` 목록(비르투오사 S3 `GeneralAbilities` → `cello_skill_03_buff_01`·`_front_02`·
    `_buff_range`, 阿斯卡纶 S3 `ascln_skill_03_range_01` — 관리자 제보).
  - 검은 사각형 (2026-10-07 관리자 제보): 이펙트 층은 페이지 위의 투명 캔버스인데
    `premultipliedAlpha: false`라, 가산(Additive) 재질도 캔버스 알파를 쌓았다 → 알파 없는(검은 바탕) 텍스처가 검은 사각형으로 합성되고, 밝은
    글로우도 아래를 살짝 가렸다. 캔버스를 premultiplied로 바꾸고(`fxgame.js`) 재질의 알파 채널 블렌드를 따로 지정(`fxplayer.js makeMaterial`:
    가산 = 알파 그대로(Zero, One), 알파 블렌드 = premultiplied over(One, OneMinusSrcAlpha)). 추출본 604개 중 가산 + 알파 없는 텍스처 155개가 해당.
    불투명 캔버스(벤치)의 그림은 그대로 — 픽셀 비교(GPU Chrome) 604개 × 4프레임 차이 0. 알려진 빈 곳: 望의 연결선
    `token_wang_passive_01_line`은 LineRenderer 3개라 추출기가 지원하지 않아 아무것도 안 그린다(양 끝을 코드가 바둑알 위치로 정함 — 별도 작업).
  - 스킬이 끝나면 그 버프·범위 이펙트를 즉시 지운다(`stopBuffs(id, true)` — 예전엔 방출만 멈춰 입자가 약 1초 남았다: 관리자 제보). `stats().buffs` = 지금 켜진 버프 이펙트.
  - `/debug.html`은 시작할 때 게임처럼 리소스 캐시를 목록과 맞춘다(`resources.js installResources` → reconcile). 리소스 워커는 `/assets/`를 경로로
    캐시해 두고 내주므로, 게임 페이지를 다시 열기 전에는 디버그 페이지가 다시 만든 `fx/index.json`·`fx/modes.json`의 옛 사본을 받았다(사키코 S3
    범위가 관리자 브라우저에서만 안 보였던 원인 — 옛 사본을 심어 재현·확인).
  - 확인: `test/local-patch-fxmodes.test.js` 4개, 디버그 아레나(阿斯卡纶·维什戴尔·赤刃明霄陈 S3: 매 공격 S3 시전·타격), 25명×스킬 브라우저 일괄
    (바인딩 시전 이펙트가 있는 48개 중 45개 재생 — 나머지 3개는 키트가 공격을 대신함: 荒芜拉普兰德 S3 늑대, 丰川祥子 S2 음표, 耀骑士临光 S2), 페이지 오류 0.
  - 레이어 (2026-10-07 관리자 제보): 시전자에 붙는 이펙트(버프 루프에 더해 시전·스킬 시작)를 모두 유닛
    캔버스 아래 층에 그린다(오퍼레이터가 위). 대상에 맞는 타격 이펙트·투사체 꼬리·음표·剑气는 위 층 그대로. `/debug.html`의 이펙트 목록 재생도 같다
    (오퍼레이터에 = 아래, 샌드백에 = 위). 2D 보드에서는 예전처럼 둘 다 위. 같은 제보의 나머지 원인: 원본 `fx.js skill()`의 절차 발동 연출(금색
    빛기둥·플래시·충격파 링, 유닛 위 층 — 공식 클라이언트에는 없음)이 공식 이펙트가 있는 오퍼레이터에도 나왔다 → `fxgame.js ownsSkill(view)`가 참이면
    (추출 번들 있음, 품질 low 아님) `app.js`가 `fx.skill(v, on, { burst: false })`로 부르면 아무것도 안 그린다 — 예전엔 바닥 오라(도는 금색 육각형)를 남겼으나 공식에 없어 뺐다(관리자 결정 2026-10-07, `fx.js` 2줄, `app.js` 1줄).

- 투사체 꼬리 (2026-10-07): 공격 모드의 주 투사체 `_mainEffect`(`modes.json` `trail`)가 있으면 `fxgame.js`가 그
  프리팹을 쏜 사람에서 (움직이는) 대상까지 시뮬레이션의 비행 시간(`fx.js projSpeed` — 피해와 같이 도착, 곡사는 fx.js와 같은 포물선)으로 날리고,
  `fx.js`의 절차 탄은 그리지 않는다(`arrowKind` → `'officialTrail'`). 높이: 처음엔 양끝 0.35칸이었으나 지금은 쏜 사람의 공격 마운트 점 → 대상의
  hit 점(29159794, 2026-10-10 「시전 이펙트 시점·붙는 대상」 ⑤), 비행 방향으로 회전, 도착하면 방출을 멈추고 사라진다. 그 꼬리의
  첫 발은 파일을 받는 동안 절차 탄 그대로(안 보이는 탄 없음), 동시에 12개(`MAX_TRAILS`) 넘거나 부하 3단계면 절차 탄. 바인딩된 꼬리가 있는 오퍼레이터:
  추출된 25명 중 14명 이상(일반 공격) + 스킬 모드. `stats().trails`/`trailAt`(디버그). 확인: 디버그 아레나에서 위셔델·아처·르무엔·파싱어·라플란드·
  치우바이 비행 좌표·화면.

- 관리자 제보 묶음 (2026-10-07, 비공개 조사 기록; 그중 두 건은 9ac38090). 고친 것:
  - **스킬 발동 이펙트 고르기** (`fxmap.js activationEffects`): 이름 매핑 ∪ 스킬 자신의 이펙트(아래 `skills[i]`)에서 다음을 뺀다 —
    ① 그 오퍼레이터의 모드가 공격의 cast/hit/trail로 묶은 프리팹(85d83c89 `_range` 규칙의 회귀: 수르트 S3 range는 대상 타격, 무에나 S3 range_01·buff_01은
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
  - **4방향 회전**: `_useFourDirectionalFace: 1`인 이펙트(풀 12명: 野鬃 S2 start 등, `modes.json turn`)는 좌우 반전 대신 프리팹의 `rotation_z`를
    유닛 방향으로 돌린다(RIGHT 0° / UP 90° / LEFT 180° / DOWN 270°, 첸 S3 검기와 같은 `aimMover`). 좌우는 지금 그려진 방향(visFacing).
    `_directionType`의 방향별 사본(위·아래 배치)은 아직 기본 사본만 [남음].
  - **키트 이벤트** (`fxgame.js kitFx`): 余 S3 'firewall' → 벽이 지나는 줄(`fx.js wallTiles`, `app.js` `fieldRect` 옵션 1줄)의 칸마다
    `_root` + 앞 모서리 조각(2026-10-10 디컴파일로 공식 배치 — 아래 「위 S3 화염벽 배치」), 스킬이 끝나면 멈춤;
    'firewallBlock' → `yu_skill3_annex_01`. 르무엔 S3(S3 장착일 때만 — S2 조준도 같은 'lock') 'lock' → 대상에 `crosshair_02`(그 대상의 포탄이 떨어질 때까지,
    잠금 순서 = 착탄 순서), 'bombardShell' → `trail_02`가 3칸 위에서 수직으로 비행 시간 동안 떨어짐 [추정 높이·방향], 'bombard' → `hit_01`. 셋 다
    `ownFx`라 `fx.js` 2D 대역(빨간 조준 원·주황 폭발)은 안 그린다.
  - **셰이더** (`fxplayer.js`): Dissolve … Double 재질(`_DissolveTex_01/_02`, `_Amount_01/_02`, `_BorderWidth_01/_02`; 재질에 남은 `_Amount`는
    쓰지 않음 — 클립도 _01/_02만 움직임) → 무에나 S3 꽉 찬 반원판·데겐블레허 마무리 조각; 메시 정점 색 `col`(알파로 가장자리를 지우는 베기·고리 메시
    446/665) → 실버애쉬 S3 호 끝; `Torappu/Particles/Rim/*`(6개) 법선 계산 + 알파 × (1−|N·V|)^`_RimPower` [추정 식] → 마터호른 S2 보호막(흰 덩어리 → 돔);
    바닥 아래 잘라내기: 노드가 바닥보다 0.25 넘게 아래이고 깊이 비교하는 재질(`_ZTest` 0·8 아님)인 렌더러만, `FxInstance opts.floor`(유닛이 선 땅 높이,
    기본 0) − 0.05 아래 픽셀을 버림 → 수르트 S3 5칸 왼쪽 빛(`gx_glow`), 르무엔 조준 고리. 모든 렌더러에 적용하면 236개 프리팹이 바뀌어(텍사스2 S3
    연기가 가라앉아 사라짐) 좁혔다. 픽셀 비교(GPU): 새 기능을 끈 판 0 차이, 켠 판은 정점 색 568·Double 29·Rim 5·바닥 2 프리팹만 다름.
  - **렌더러별 위/아래 층** (8388f42f의 「시전자 이펙트는 전부 아래」를 바꿈): 공식은 캐릭터 Spine이 깊이를 안 쓰고 Default 레이어 order 0이라 이펙트
    렌더러의 sortingOrder > 0(또는 0이면서 파티클 fudge < 0)이면 캐릭터 앞, 나머지는 뒤다(마터호른 S2 돔 `hudun` order 0 + `hudun_2` order 1). 품질 'high' +
    3D 보드일 때 시전자 이펙트·상태 이펙트(⑤)·바닥 키트 이펙트는 `FxInstance split`으로 렌더러마다 `FX_BACK`/`FX_FRONT` 층을 달고, 공유 장면
    `layers.split`을 아래 캔버스(자기 장면 다음 FX_BACK)와 위 캔버스(FX_FRONT 다음 자기 장면)에 한 번씩 그린다(텍스처 업로드가 두 렌더러에 각각 — 'medium'
    이하·2D 보드는 예전 규칙). 따라서 아스카론 S3 시전 섬광 등 order > 0 조각은 다시 오퍼레이터 위에 온다 — 덮는다는 제보가 오면 공식 캡처와 비교한다.
  - 확인: `test/local-patch-fxmodes.test.js` +2(activationEffects 합성 + 실제 바인딩 9개 — 모드 필터를 빼면 실패), 디버그 아레나(Chrome): 텍사스 S2 range·검, 데겐블레허 S3 start_01/02 → 마무리 end/start_03/04/hit_2, 수르트 S3 range가 대상에, 野鬃 S2 오른쪽·위쪽 배치,
    余 S3 열 전체 벽, 르무엔 S3 표식 5·포탄 5·착탄 5, 마터호른 S2 돔이 위에, 무에나·레인프로스트 반원.
- 관리자 제보 재수정 (2026-10-07 저녁, 공식 인게임 녹화 10개 — 비공개 녹화: 리드 이격·위·데겐블레허·텍사스 이격 S2/S3·첸·수르트·르무엔·
  실버애쉬 이격 S2·블레이즈 이격 S3). 확인은 디버그 아레나 연속 캡처·프리팹 단독 재생·인스턴스/입자 수 측정. 셰이더는 클라이언트
  `[uc]shaders.ab`의 DXBC를 직접 역어셈블해 확인했다.
  - **대상 타격 이펙트가 전부 안 보이던 회귀** (1f5ecd41): `play()`가 대상에 붙는 hit까지 `split`(렌더러를 층 1/2로)으로 만들고 층 0만 그리는 위 캔버스에
    넣어, 품질 high + 3D 보드에서 모든 타격 이펙트가 사라졌다(블레이즈 S3 폭발). split은 split 장면에 들어가는 것(시전자)만.
  - **LineRenderer** (`fx_extract.py lineR`, `fxplayer.js LineRenderer`): 점 목록·폭(widthMultiplier, 클립 `width`)·폭 곡선·색 그라디언트·텍스처 모드
    (Stretch / Tile = 거리 / 구간별)로 시선 정렬 띠. Unity처럼 효과가 끝날 때까지(stop) 남는다. 월드 좌표 선(스크립트가 점을 정함, 르무엔 S2 등)은
    이펙트 공간에 그대로 그림 [추정]. 클립의 텍스처 ST(`_MainTex_ST` 등, 흐르는 점선)도 바인딩. 21개 프리팹.
  - **르무엔 S3**: 'lock'마다 대상에 `trail_01`(하늘에서 내려오는 붉은 빔 4겹) + `crosshair_range`(수축하는 조준 원, 조준 투사체 `_mainEffect`) +
    `crosshair_02`(표식) — 그 대상 포탄이 떨어질 때 즉시 지움(긴 수명 입자 남던 것) + `crosshair_01`(buff lemuen_proj_s3_effect의 한 번 섬광).
    S3 도중 쓰러짐·강제 퇴각('die')이면 포탄이 안 오므로(킷 onEnd 'death') 그때 그의 표식 전부를 지움(관리자 제보 2026-10-10: 대상이 죽거나 30초까지
    남았음) [추정: 조준 투사체는 그의 관리 투사체(FinishManagedProjectiles)라 시전자와 함께 끝남]. 2D 대체 조준 원(`fx/locks.js`)은 원래 그렇게 함.
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
    이펙트만 나왔다 → 공격 때 뷰의 `UF.SKILL` 플래그로 발동·루프·모드를 맞춤. S3 검우: 시뮬레이션 'swordRain'에 `src`(`chess_char_4_16-texas2.js` 1줄) →
    대상에 `texas2_skill_03_hit` [추정: 이름] → 2026-10-08 `texas2_skill_03_hit_02`로 바로잡음(아래 「텍사스 디 오메르토사 S2 발동·S3 검우」).
  - **리드 이격**: 灼痕 'reed2:scorch' → 상태 이펙트 `reed2_debuff_01`(주황 X, 몸 [추정]), 'scorchBurst' → `reed2_debuff_boom_01`. 번들을 전체(21개)로 재추출.
  - **데미지 숫자** (`num-official.js`, 데겐블레허 영상 30fps 프레임별 측정): 피해 계열은 0.87배로 나타나 0.1초에 최종 크기·위로 30, 유지, 마지막 0.13초에
    축소하며 아래로 30(`_downOffset`), 투명해지지 않음. 회복 숫자는 예전(1.5배 팝·페이드).
  - **2차 제보 (같은 날 밤)**: ① 스킬 발동 때 도는 금색 육각형은 `fx.js _aura`(원본 절차 이펙트) — 공식 이펙트가 있는 오퍼레이터는 이제 안 그림.
    ② 위 S3: 벽 조각은 행 벽(위·아래 배치) 기준이라 열 벽(좌·우 배치)은 조각마다 높이축으로 90° 돌림(2026-10-10 폐기: 열 벽은 공식 `_r`/`_l` 조각). ③ 르무엔 재능 표식: 2.5초 루프 프리팹을
    2.0초 시점에 멈춰 유지(`FxInstance opts.hold`, `STATUS_FX` 4번째 칸). ④ 르무엔 S3: 빔은 매 프레임 효과의 +y를 카메라 위쪽으로 돌려 어디서나 화면
    수직(`fxgame.js skyward`); 잠금 섬광 `crosshair_01`(2.65초)도 표식과 함께 포탄 때 지움(폭격 후 ~1초 남던 것); 조준 원 `ring 01/02` =
    Dissolve AB (VertexColor Major) — DXBC대로 amount = 1 − 정점 α, 색 = 2·텍스처·정점색(틴트 rgb 안 곱함). Dissolve(CustomData)의 amount는
    `_DissolveIntensity`. 남은 차이: 원이 공식은 몸 앞에 세워진 원인데 우리는 바닥에 눕는다(정렬 Local의 기준 평면 [추정 불가] — 확인 필요).
    ⑤ 데겐블레허: 늘인 빌보드(stretched)의 길이를 size.y(3D 시작 크기), 폭을 size.x로 — 베기 줄이 길고 가늘게; 天生的武者 165% 발동분은 기대 피해에서
    뺌(`dmg.lpExpectDiv`, damage.js 1줄·`chess_char_6_19-blkkgt.js` 1줄) → S3 베기가 전부 빨간 숫자(영상); 스킬 End 클립(마무리 `Skill_3_End`)은 다음 평타가 끊지 않음
    (`spine.js _endPlaying`). ⑥ 리드 S3: charpack 모드가 Attack→`Skill_3_Attack`, Idle→`Skill_3_Loop` — 공격 클립을 `Skill_3_Attack`, 대기를
    `Skill_3_Loop`로(`anim-overrides.mjs`, `data/assets.json` reed2만). 같은 꼴(`Skill_N_Attack`가 있는데 안 쓰는 모델)은 리드뿐. ⑦ 텍사스 이격 S2:
    스킬이 이벤트로 꺼진 직후 스냅숏 플래그가 한 프레임 남아 `skillByFlag`가 루프를 다시 켜 계속 남던 것 → 이벤트로 켜진 스킬은 플래그로 안 건드리고,
    꺼진 뒤 0.5초는 무시, 프레임마다 확인.
  - 알려진 차이: 수르트 S3 불덩이 크기, 위 S3 구체, 텍사스 S3 검우의 큰 먹 호(영상)는 대략만 맞춤 — 공식과 나란히 비교 필요. 데미지 숫자 색(영상 측정
    ≈ #be361f, 압축 영향 가능 — #ff3a00 유지).

- 관리자 제보 (2026-10-07 밤, 공식 캡처 — 비공개 조사 기록), 이펙트 쪽:
  - **배기 구역의 나뭇잎**: `排气格栅`(`tile_smog`)는 아군에게 隐匿을 줘서 그 위 望 바둑알이 `stealthAlly` 상태 이펙트를 받았고, 그 프리팹
    `common_stealth`(텍스처 `common_leaf`)가 나뭇잎이었다. 클라이언트에서 `common_stealth`를 쓰는 곳은 生息演算 건물 토큰(trap_405/406/459 재능
    overrideEffectKey)뿐, 오퍼레이터 자신의 隐匿(守林人 S1 `skchr_milu_1`, dynamicabilities `Invisible`)은 `common_invisible` → 아군 隐匿도
    `common_invisible`(`fxstatus.js`)이고 그 ColorModifier(회색 α .894)도 아군에 적용(`units.js lpInvis`). [추정] 타일 隐匿도 같은 프리팹(타일 프리팹 못 찾음).
  - **손으로 놓은 돌 / 재능(跟子) 돌**: 跟子는 望의 투사체(PRTS 备注, 클라이언트 `projectile_chr_wang_stone1/2/3`)라 이펙트가 그녀 번들(`wang`)의 것 —
    `_effectsToTileWhenStart` `wang_passive_01_buff`(검·흰·금 고리, andi_lne + 루프 별빛), `_triggeredEffect` `wang_passive_01_buff_02`. 놓은 돌(토큰
    `token_10064_wang_stone1`)은 프리팹 `_startEffect` `token_wang_birth_01_buff`(금빛 루프 별빛), `sktok_wang_N/TriggeredEffect` `token_wang_01_buff`
    [추정: TriggeredEffect = 激活(연결) 때]. 시뮬레이션은 표시용 `follower` 플래그만 붙임(`op-wang.js` 'summon'·'wangLink' 2줄, 규칙 그대로).
    정비에서 놓은 돌은 전투 시작에 'summon' fx 없이 'spawn'만 와서 탄생 이펙트가 없었다 → 같은 배치(batch)에 'summon'이 없는 돌 'spawn'은 놓은 돌로
    보고 `token_wang_birth_01_buff`(`fxgame.js stoneBirth`). 跟子 고리의 검은색(Disturb, `_MainColor` 검정)이 공식 캡처처럼 짙은지는 실제 판 확인 [추정].
  - **공용(절차) 이펙트 제거**: ① 望 돌 이벤트('zone' 폭발·'summon'·'wangLink')는 `stoneFx`가 그리면서 `ownFx`에 안 넣어 `fx.js`가 노란 원(zone)·
    민트 육각+기둥(summon)·파동을 같이 그렸다 → 넣음. ② 공식 이펙트 번들이 있는 오퍼레이터의 키트 'fx' 이벤트는 `fx.js` 절차 대체(blast·zone·wall·
    summon·buff·wave·pillar·element·healAoe·shield·shatter·strike·volley)를 안 그림(`fxgame.js standInOff`; 이벤트의 오퍼레이터 = `src` → `by` → `id`,
    소환물·장치는 예외; 회피·치명·DP·표식·빔·이동 화살표·단일 회복은 남김). 그 순간에 공식 프리팹이 있는 것은 그것으로: 维什戴尔 残影 폭발 'explode' →
    `wisdel_bomb_01_hit` [추정: 이름], 赤刃明霄陈 S2 'swordStorm' → `skchr_chen3_2 _hitGroups[0..5]`(`chen3_skill_02_hit_01~06` 차례로 [추정]),
    丰川祥子 열광 'sunBurst' → Combat 모드 cast `oblvns_combat_01_start` [추정].
    **예외 (2026-10-08)**: 오퍼레이터에게서 0.5칸 넘게 떨어진 오래가는 'zone'(`key`가 있거나 지속 > 1초)은 2D 원을 남긴다
    (`fxgame.js areaAway`) — 그 자리의 공식 프리팹(`…_token`·`…_range`)을 트는 곳이 없어서, 引星棘刺 S2 炼金单元(upstream f1e462ef: 1초마다 `key`로
    다시 보냄)이 품질 low가 아니면 아무것도 안 보였다(실제 판 확인). 전수: 引星棘刺 S1·S2·S3, 锡人, 歌蕾蒂娅 漩涡, 号角 조명, 异客 폭풍 → 2D 원.
    莫斯提马 S2(자기 자리)·纯烬艾雅法拉 방패(shield 유형)는 공식만. 공식 `thorn2_skill_0N_token`/`_range`(引星棘刺·锡人·号角 S1·波登可 S2의 투사체 효과)는
    2026-10-10부터 그 'zone' 자리에서 틀고 2D 원은 안 그린다 — 아래 「시전 이펙트 시점·붙는 대상」 ③. ③ 스킬 발동 금빛 기둥·육각(`fx.skill` burst)·`_aura`: 자기 시작·버프
    이펙트가 없는 스킬(望 S1 `skchr_wang_1` — skills.ab에 이펙트 키 없음)도 공식 번들이 있으면 안 그림(`ownsSkill`) — 발동이 화면상 조용할 수 있다.
    ④ 소환물(토큰) 머리 위 노란 방패(`invuln`) 아이콘 안 그림(공식 캡처의 돌에 없음; 관리자 제보) —
    뷰는 `UF.INVULN` 플래그만 알아 스킬의 짧은 무적과 구분 못 함 [추정: 소환물은 공식도 없음].
  - 확인: 디버그 아레나 望 S1, 돌 3개 수동 배치(돌 칸에 tile_smog 隐匿, 2배 해상도 포함) — 隐匿은 회색 연기·나뭇잎 없음, 跟子 고리·놓은 돌 별빛,
    폭발에 노란 원·민트 육각 없음, 발동 기둥 없음, 첸 S2 타격.
  - **소환물 레벨 칩** (2026-10-08 관리자 요청 「소환물도 본체 오퍼레이터와 같은 레벨 칩」): 정비 화면의 소환물(보드·벤치 스택)이 주인(`ownerUid`)
    오퍼레이터의 칩(`tier`)을 단다(`app.js pieceInfo` `chip`, `units.js` 칩 생성 조건). 주인을 못 찾으면 예전처럼 칩 없음. 전투 중에는 오퍼레이터처럼 칩 없음.
    칩 높이는 오퍼레이터와 같은 화면 고정 위치(발 기준)라 작은 소환물(드론) 위에서는 떠 보인다 — 공식 캡처로 확인할 것 [추정].
    확인: game-mock 정비 화면에 주인 있는 드론을 보드·벤치에 추가.

### 이펙트 붙는 자리 MP_SPECIAL_0 — 비르투오사 S3 (2026-10-08, 관리자 제보)
- 근거: 클라이언트 `global-metadata.dat` 열거형 `SpawnLocation`(필드 순서·기본값): 0 NONE, 1 FOOT_POINT, 2 HIT_POINT, 3 MUZZLE_POINT, 4 HEAD_POINT,
  5 GROUND_CENTER, 6 MUZZLE_POINT_WITHOUT_ROTATION, 7 GROUND_CENTER_WITH_ZERO_HEIGHT, 8 MP_SPECIAL_0, 9 MP_SPECIAL_1, 10 MP_SPECIAL_2, 11 MP_SPECIAL_3,
  12 CAMERA, 13~ MP_SPECIAL_4…, TILE_CENTER …. 위치는 모델 프리팹의 `Torappu.Battle.SingleSpineAnimator`(`_muzzleTransform`·`_hitTransform`·
  `_headTransform`·`_specialPoint0~15`)가 가리키는 Transform — 비르투오사 기본 스킨은 `PersistentData/Bundles/chararts/char_245_cello.ab`
  `DefaultSkin` → `Front`/`Back` 아래 `SpecialPoint0`, Spine 본 추종 컴포넌트가 `F_Weapon_Chord` / `B_Weapon_Chord`(첼로 현)를 따라간다.
- 우리는 1·2·4·5만 알아 8을 바닥에 놓았다 → S3 `cello_skill_03_buff_front_02`(빛나는 원·무지개·음표, `_spawnLocation` 8)가 발밑에 깔렸다.
  `fxgame.js lifted()`: 8이고 `SPECIAL_BONES`에 있는 캐릭터(지금은 `char_245_cello`만)면 매 프레임 그 본의 위치(스켈레톤 좌표 × 모델 표시 배율,
  유닛 root + body 기준 — 임포스터로 그릴 때는 스켈레톤이 다른 컨테이너에 있어 화면 트리를 쓰지 않음)를 `liftFor`로 월드 높이로 바꿔 놓는다.
  본을 못 찾으면 몸 가운데(`bodyZ` 0.5). `SPAWN_FRAC` 표는 그대로 — 다른 프리팹 높이는 안 바뀜.
- 확인: 디버그 아레나 비르투오사 S3 전·후 — 원·빛이 발밑에서
  첼로 위치로. 테스트 `test/local-patch-fxspawn.test.js`(소스 확인 + 추출물 `spawn` 8). 실제 판·공식 영상과의 나란히 비교는 안 함.
- 처음 수정은 비르투오사만이었다(아래 「일반화」가 다른 오퍼레이터로 넓힘). 비르투오사 S3의 `buff_back_02`는 클라이언트가 **튼다** —
  `front_02`의 `SwitchableBackEffect`가 뒤를 볼 때 바꿔 낌(디컴파일 2026-10-10, 아래 「시전 이펙트 시점·붙는 대상」 ④). `buff_03/04/05`는 charpack·
  `[uc]skills.ab`·`cello.ab` 어디에도 이름 참조가 없어 미확정(버프 템플릿 `buff_template_data`는 안 봄).
- **일반화 (2026-10-08, 60681308·f8e91ef0·29159794)** — 이펙트 붙는 자리를 오퍼레이터 전체에:
  - **점 표** `tools/local-extract/char_points.py` → `tools/assets/local-char-points.json`(git, 검토용) + `public/assets/local/fx/points.json`(git 밖, 클라이언트가 읽음).
    근거: chararts `DefaultSkin` 애니메이터의 typetree — 양면 모델은 `_front`/`_back` 레코드(`muzzlaTransform`[원문 오타]·`hitTransform`·`headTransform`·
    `shadowTransform`·`specialPoint0~15`), 한 면 모델(`char_1012_skadi2`)은 자기 필드(`_muzzleTransform`…). 각 점의 BoneFollower `boneName`·`followBoneRotation`,
    고정 위치는 로컬 좌표 ÷ SkeletonDataAsset `scale`(0.01) = 스켈레톤 단위(비르투오사 Muzzle (0.678, 1.902) = `F_Muzzle` Idle (67.8, 190.2) — 데이터로 확인).
    점 이름은 모델마다 다르다(`MuzzlePoint`·`Special_0`·`Special0`) — 이름이 아니라 애니메이터 필드로 찾는다. 126명.
  - **`render/fxpoints.js`** `pointKey`(3·6 → muzzle, MP_SPECIAL_N → spN: 8~11 → 0~3, 13~16 → 4~7, 18~25 → 8~15; 12 CAMERA·17 TILE_CENTER 제외)·`pointOn`
    (그 면의 본 → 다른 면의 본 → 그 면의 고정 위치). `fxgame.js lifted()`가 표에서 점을 찾는다(`SPECIAL_BONES` 삭제 — 비르투오사는 같은 본, 테스트로 고정).
    표에 없는 유닛(적, 근접 모델의 muzzle, 표 없음)은 예전대로 바닥. 본 회전(`followBoneRotation`, 3은 회전 포함·6은 없음)은 적용 안 함 [추정: 프리팹의 `fixed` 자식이 세워진 채].
  - **MP_SPECIAL_1~6** (f8e91ef0): `fx_extract.py spawn_location`이 0~8만 받아 9·10·11·13·14·15인 **66개**가 `spawn` 없이(=바닥) 추출돼 있었다. 값 = 열거형 순서의 근거:
    9~15를 쓰는 오퍼레이터는 정확히 그만큼 특수점을 가진다(`thorn2` sp0~4·값 13, `angel2` sp0~6·값 15, `agoat2` sp0~5·값 14까지). 66개만 `--prefab`로 재추출 — `spawn` 외 변화 없음,
    index.json 그대로.
  - **꼬리 투사체** (29159794): `TRAIL_Z` 0.35칸 고정 대신 발사자의 Muzzle(쏘는 순간 위치) → 대상의 맞는 높이(`SPAWN_FRAC[2]`, 클라이언트 HitPoint [추정]),
    Muzzle이 없으면 fx.js `SHOT_HEIGHT.launch`.
  - **NONE(0) 136개**: 클라이언트가 0을 어디에 놓는지는 메타데이터에 근거 없음(`ParticleEffect`/`SimpleEffect`의 `_spawnLocation`, 문자열 「Unit {0} has no muzzlePoint」 등뿐 — 로직은 네이티브).
    지금대로 바닥 [추정]. 참고: 0인 공격 시작 프리팹(`kroos2_attack_start_01`·`horn_attack_01_start_02` 등)은 노드가 `qiangkou`(총구)처럼 무기 끝 기준으로 짜여 있다 — 호출자가 위치를 주는 것일 수 있음.
  - **GROUND_CENTER_WITH_ZERO_HEIGHT(7) 30개**: 확인만 — 이름대로 바닥, 안 바꿈 [추정].
  - **알려진 빈자리**: `swire_attack_01_start`(3, 근접 모델에 Muzzle 없음 → 바닥), `char_1012_skadi2`(Back 모델 없음), 史尔特尔 S3 `buff_03/04` Back 레코드가 Back 스켈레톤에 없는
    `F_Face_Default_*` 본을 가리킴(클라이언트 데이터 — 고정 위치 사용), `nymph_talent_buff_02` Back은 본 없는 고정 위치.
  - **되돌리는 법**: 바뀐 프리팹은 218개(3: 48, 8: 104, 9~15: 66; 목록은 비공개 조사 기록).
    9 이상만 되돌리기 = f8e91ef0 revert(코드가 9+를 무시 — 재추출 불필요), 꼬리만 = 29159794 revert.
  - **관리자가 확인한 이펙트에 생긴 변화**: 첸(赤刃明霄陈) S2 `chen3_skill_02_buff_01`(9 → `C_Weapon`)은 그녀의 검을 따라가는데, 숨는 동안 `Skill_2_Disappear` 클립이 검 본을 약 1.4칸 앞(+538 단위)으로
    옮겨 둔다 → 예전에는 배치 링 안 바닥에 보이던 붉은 빛이 이제 그 자리에 없다(디버그 아레나에서 본 위치 확인, 실제 판에서도 같음). 클라이언트 BoneFollower도
    같은 본을 따른다 [추정]. 비르투오사 S3·르무엔 S3·余는 전·후 같음(아레나·픽셀 비교), 丰川祥子 음표는 음표 경로(`NOTE_Z`)라 영향 없음.
  - **확인**: 단위(`test/local-patch-fxspawn.test.js` — `pointKey`·`pointOn`, 비르투오사 본, 표의 고정 위치 = Idle 본, 추출 프리팹 218개가 우리 스켈레톤에서 점을 찾음),
    아레나 전·후 비교: 空弦 화살·발사 고리가 발 → 석궁, 新约能天使(angel2) 총구 섬광 발 → 총구,
    이격 니어 S3 시작·`buff_02_a`가 발 → 무기·머리 높이, 비르투오사 S3 그대로, 첸 S2(위 변화). **실제 판**(솔로 판 정비에 维什戴尔 S3·첸 S2 디버그 추가 → 전투):
    维什戴尔 꼬리가 총에서 출발, S3 버프·첸 S2 버프 재생 확인.
  - **스펙터 디 언체인드의 붉은 원형**(관리자 제보 2026-10-08)은 이 수정으로 안 바뀐다 — `ghost2_attack_start_01`은 `_spawnLocation` 1(FOOT)이지만, 같은 루트의
    FollowMountPoint가 5 = SPECIAL_0 = 톱날 링 본이라 공식은 톱날을 따라간다. 원인은 바닥 자르기도 `_spawnLocation`도 아니고, 추출기·바인딩·재생기가 모르던
    FollowMountPoint 컴포넌트와 S2 모드 `GeneralAbilities` 버프 이펙트(`ghost2_skill_02_buff_02`)를 아예 안 틀던 것 — 아래 절.

### 이펙트 마운트 지점 FollowMountPoint — 스펙터 디 언체인드 S2 붉은 원형 (2026-10-08, 관리자 제보)
- 관리자 결정(2026-10-08): S2 발동의 붉은 원형은 무기(톱날)에 붙어 따라가고 적과 겹쳐도 적 위에 떠 있어야 한다. 대역(替身) 전환 뒤 파란 2종(1칸 남짓 원 → 3×3 물결)은 바닥이 맞다.
- 근거(클라이언트 데이터): 이펙트 프리팹 루트의 MonoBehaviour `FollowMountPoint`(MonoScript PathID `0x7b5c342088cfcad4`) — 이름 뒤 int 7개 = global-metadata
  필드 표 순서 `_mountPointType, _followScaleSign, _followScale, _pauseWhenMountPointInvalid, _onlyPauseWhenMountPointInvalid, _keepOriginRotation, _useBehaviourPause`.
  `MountPointType` 상수(메타데이터 필드 기본값): **0 FOOT, 1 HIT, 2 MUZZLE, 3 HEAD, 4 UI, 5 SPECIAL_0, 6 SPECIAL_1, 7 GROUND, 8~21 SPECIAL_2~15** — SpawnLocation과
  번호가 다르다(UI·GROUND는 문자열 중복 제거로 이름 표에 안 보임). 추출 프리팹의 (spawn, mount) 쌍이 모두 맞는다(8↔5 98개, 10↔8 14개, 3↔2 12개 …).
- 스펙터 디 언체인드: S2 모드 `Body/GeneralAbilities/Ability0` 버프 `ghost_s_2[effect]` → `ghost2_skill_02_buff_02`(붉은 원, 마운트 5 = 톱날 링 `B_W_Ring`/`F_W_Ring`,
  `pauseWhenInvalid` 1)·`_buff_03`(눈 빛, 6 = `F_L_Eyeball`/`B_L_Eye`). 평타 `ghost2_attack_start_01`·S3 `skill_03_start_01`·`skill_03_buff_02`도 마운트 5.
- 구현: `fx_extract.py mount_point` → JSON `mount`(4752c24c); `char_modes.py`가 모드 GeneralAbilities 버프의 `overrideEffectKey`를 `attach`에 —
  **`GENERAL_BUFF_CHARS`(ghost2만)**(43538277); `fxpoints.js mountSpawn`(마운트 → 같은 점의 `_spawnLocation`, UI·GROUND는 null)·`boneMissing`, `fxgame.js lifted()`가
  `mount`를 `_spawnLocation`보다 먼저 쓰고(같은 본 getter로 매 프레임 따라감), `pauseWhenInvalid`면 지금 스켈레톤에 그 점의 본이 하나도 없을 때 업데이트를 멈춤
  (끄는 중이면 계속 — d47fd252, 매핑 정정 1caa67d0). 적 앞: `baoshan` 원은 fudge −50, 점 입자는 order 2 → 분할(high)에서 FX_FRONT(기존 규칙). 분할이 꺼진 품질은 예전대로 유닛 아래.
- ghost2만 재추출(마운트 프리팹 5개만 반영; 같이 재추출하면 `skill_02_buff_01`·`beidong_buff_01(_end)`·`skill_01_buff`·`skill_03_buff_01`에 내장 Quad `bg_01`이
  생겨 이전 파일로 둠 — 내장 Quad 재추출은 텍사스 디 오메르토사만 하기로 한 결정, 아래 「텍사스 디 오메르토사 S2 발동·S3 검우」).
- **전체 적용(관리자 결정 2026-10-08 「전체 적용」·「켜줘」)**: `fx_extract.py --mount-only`(d1046024)가 추출된 프리팹 JSON에 `mount`만 넣는다 — 재추출하면 내장 Quad
  같은 다른 변화가 섞이므로. 전 번들: 마운트 프리팹 359개(93 번들), 파일 354개 변경(ghost2 5개는 이미), `mount` 외 키 변화 0. 자리가 바뀌는 것 174개(49 번들 — 텍사스 디
  오메르토사 `buff_02_start`, 무에나, 비질 등). GeneralAbilities 버프 바인딩도 전원(78e4c4fa) — 7명(크루스 더 킨 글린트·라플란드 더 데카덴차·아스트젠 더 라이트체이서·
  락락·미니멀리스트·울피아누스·티피) 바뀜(목록은 비공개 조사 기록). 알려진 빈자리: 비즈왁스 S2 `beewax_skill_02_buff_01`(마운트 특수점 0,
  모델에 없음 — 공식은 멈춤, 우리는 바닥). **이상한 위치가 보이면** 그 프리팹 JSON의 `mount`를 빼거나 `fxgame.js lifted()`의 `mountSpawn(...) ??` 한 줄을 되돌린다.
- **대역(替身)의 파란 이펙트**(관리자 제보 2026-10-08, dc4a7e97 → 공식 녹화로 정정 e453cbdb): 바인딩 `attach[Stand]`는
  있었지만 스킬 모드가 아닌 모드의 attach를 트는 곳이 없어 한 번도 안 나왔다. 첫 수정은 둘 다 대역에 계속 틀었는데, 관리자 녹화(프레임 대조)와
  관리자 제보로 정정:
  - 파란 소용돌이·물보라 = 대역 등장 `[switch2stand]/StandBorn` `_castEffects` `ghost2_birth_01_start` — 1회(공식 약 0.4~1.4초). `char_modes.py` `dollBorn`.
  - 3×3 원형 = `Talents/-1` 버프 `ghost2_standin[switch]`(대역 상태 버프)의 `beidong_buff_01` — 대역 동안. 레거시 `Animation` 클립이 메시 3개를 0.3초에 나타나게만 한다(추출기는
    Mecanim 클립만 읽어 이 페이드인은 없음 — 차이는 처음 0.3초).
  - `beidong_buff_02`는 `Talents/1`(拥抱自我, `_targetOptions.targetSide 2` = 적 대상) 버프 이펙트 — **적에게 붙는 것**이라 대역 본인에게는 안 튼다. `char_modes.py` `attachFoe`.
  - `fxgame.js dollFx`: fx `substitute`에 dollBorn 1회 + Stand 모드 attach − attachFoe 반복, `swap`·`dollEnd`에 끔. 아레나·실제 솔로 판: 전환 순간 본체에 소용돌이 약 0.6초, 3×3 원형 유지.
    알려진 빈 곳: 3×3 원형 메시의 왜곡 텍스처 흐름 컴포넌트(84바이트 MonoBehaviour, `_DisturTex` 속도)는 안 읽음 — 원형이 멈춘 그림처럼 보일 수 있음; `beidong_buff_01_end` 안 틂;
    `beidong_buff_02`를 적에게 붙이는 것은 안 함.
- 안 한 것: `_followScaleSign`·`_followScale`(좌우·크기 따라감). `_keepOriginRotation`(본 회전)은 아래 「이펙트 방향」(57a8bc33)에서 적용.
- **(관리자 제보 2026-10-08, 2026-10-10 디컴파일로 정함 — 아래 「시전 이펙트 시점·붙는 대상」 ②)**: 6명은 본인이 맞고(능력에 `_selector` 없음 = 스펙터 디
  언체인드와 같은 경로) **아스트젠 더 라이트체이서만 적 1명**(`LinkEnemy`의 `_selector` → 범위 선택기 `_targetSide 2`·`_maxNum 1`). 아래는 그때의 기록. GeneralAbilities 버프 바인딩
  전원 적용(78e4c4fa)으로 늘어난 attach 중 일부는 적에게 붙는 버프의 이펙트일 수 있다. `attachFoe`(같은 GameObject의 `targetSide 2`)로 잡히는 것은 스펙터 디 언체인드·인디고뿐이고
  아스트젠 더 라이트체이서(`halo2_skill_03_buff_02`)는 안 잡힌다 — 대상을 다른 방식(선택기·투사체 등)으로 고르는 버프. 대상 7명: 크루스 더 킨 글린트 `kroos2_skill_02_buff_01`, 라플란드 더 데카덴차
  `whitw2_skill_02_buff_01`·`_range_01`·`skill_03_buff_start`·`_buff_01`, 아스트젠 더 라이트체이서 `halo2_skill_03_buff_02`, 락락 `rockr_token_01`, 미니멀리스트 `malist_drone`, 울피아누스
  `ulpia_skill_03_buff_01`, 티피 `tippi_skill_01_buff`·`_skill_02_buff_L`·`common_idle_ground`·`common_land_ground`·`tippi_line_01_1/_2`. 공식 영상과 하나씩 비교한 뒤 오퍼별로 정한다.
- **마운트 전체 적용으로 자리가 바뀐 오퍼레이터**(174 프리팹): 상점에 나오는 44명 — 안젤리나(4)·애쉬락(1)·카넬리안(2)·블레미샤인(11)·백파이프(4)·버블(2)·케이퍼(1)·사리아(2)·
  이그제큐터(1)·스펙터(2)·스펙터 디 언체인드(5)·그레이(1)·가비알 디 인빈서블(5)·혼(18)·호시구마(1)·휴머스(4)·이네스(1)·쉐라(10)·크루스 더 킨 글린트(6)·레이즈(2)·스즈란(3)·리스캄(1)·
  루멘(2)·미니멀리스트(3)·무에나(2)·뮤엘시스(7)·모스티마(3)·파피루스(2)·패신저(7)·파인콘(3)·포덴코(3)·프로방스(2)·치우바이(1)·리드 더 플레임 섀도우(4)·락락(10)·로즈몬티스(9)·
  비나 빅토리아(2)·스카디(2)·산탈라(1)·실버애쉬(1)·스와이어(3)·텍사스 디 오메르토사(2)·비질(7)·라플란드(2); 숨김 기물(`isHidden`, 상점에 안 나옴) 5명 — 비즈왁스(1)·인포서(3)·로즈솔트(2)·
  비그나(2)·샤마르(1). 비즈왁스 S2 버프의 빈 특수점(위)은 숨김 기물이라 화면에 안 나온다.
- 확인: 단위(`test/local-patch-fxspawn.test.js` mountSpawn·boneMissing·ghost2 추출물·바인딩), 아레나(평타 원형·S2 붉은 원이 발이 아니라 톱날 높이에서
  톱날을 따라 움직이고 샌드백 앞에 그려짐), **실제 솔로 판**(S2 발동 뒤 톱날에 붉은 원, 프레임마다 톱날 위치를 따라감). 대역 전환은 S2가 끝날 때 일어난다
  (처음엔 치명 피해로 일으키려다 못 봄 — 위 「대역의 파란 이펙트」에서 확인). 전체 적용의 다른 오퍼 174개는 [화면 미확인](단위 테스트로 우리 모델에서 점을 찾는지만). 공식 녹화 없음.

### 이펙트 방향 — 방향 칸·마운트 회전 (2026-10-08, 관리자 제보, 57a8bc33)
- 관리자 제보: 아르케토 S3 이펙트가 배치 방향과 상관없이 항상 세로로 보인다 → 오퍼레이터 방향을 따라야 한다(다른 오퍼에도 있을 수 있음).
  **관리자 결정(2026-10-08)**: 방향 칸 「13명 전체」, 마운트 회전 「전체 적용」(이상한 이펙트는 나중에 그것만 뺀다).
- **방향 칸** (근거: charpack·skills.ab 이펙트 발생기 항목): `_effects`는 칸 배열 — 0 위, 1 오른쪽, 2 아래, 3 왼쪽(스펙터 디 언체인드 `_up`/`_down`, 백파이프
  `_right`/`_left` 이름으로 확인) — 이고 `_directionType`이 칸을 고른다. `UberEffectEmitter.EffectOptions.DirectionType` = 0 NONE, 1 L_OR_R, 2 U_OR_D, 3 FOUR_DIR,
  4 UD_OR_LR, 5 FOUR_DIR_FIXED(디컴파일 2026-10-10, dump.cs 값; 6 L_OR_R_NOT_UD는 `SelectTileEffectEmitter.DirectionType`의 것). 우리 `char_modes.py`는 칸을 다 펼치고 이름 규칙(`DIRECTIONAL`
  `_up/_down/_left/_back`)으로만 걸러, 아르케토 S3 `start_02`(위)·`start_02_B`(그 밖)를 **동시에** 틀고 이름에 up/down이 있는 사본은 방향과 상관없이 버렸다.
  → `char_modes.py dir_groups`가 칸이 둘 이상 다른 항목을 `dirs: [{ t, s: [위, 오른쪽, 아래, 왼쪽] }]`로 기록(바인딩 목록은 그대로), `fxgame.js dirCopies`/`dirPick`이
  `play()`마다 그 묶음의 이름을 보는 방향의 사본 하나로 바꾼다: NONE 0번, L_OR_R 좌우(위·아래를 볼 때는 그려진 좌우), U_OR_D 위(뒷모습)면 0번·그 밖 2번
  (옆은 앞모습 — 클라 `TryGetEffect` RVA 0xAE1FE0, `faceToBack`), FOUR_DIR·FOUR_DIR_FIXED 보는 방향의 칸, UD_OR_LR은 U_OR_D처럼 고르고 그 칸이 비면 좌우
  (2026-10-10 고침 — 전에는 보는 방향의 칸; 지금 그 묶음은 0개). 빈 칸·enum 밖 값은 안 틂. 좌우 사본이 따로 있는 묶음에서 고른 사본은 다시 뒤집지 않음 [추정]. 사본 프리팹은 이미 전부 추출돼 있었다(재추출 없음).
  대상 14명: 스펙터 디 언체인드, 가비알 디 인빈서블, 이그제큐터 디 엑스 포에데레, 위셔델, 엑시아 더 뉴 커버넌트, 백파이프, 아르케토, 불피스폴리아, 언더플로우,
  르무엔, 산크타 믹사파라토, 비질, 아로마 + 데겐블레허(S2 `start_04_v`/`_h`, skills.ab).
  **선발 오퍼레이터 항목** (a52571b2, 관리자 요청 2026-10-08): 0.2.0 병합 뒤 `data/diy.json`이 없어져 `char_modes.py`가 선발 5명을 다시 만들지 못했다(전체 실행에서
  빠지고 예전 항목이 남음). → `diy_operators()`가 `data/backups.json` `diy.operators`(선발 목록)와 `units.<charId>.forms`의 스킬을 읽는다. 재생성 결과: 토가와
  사키코만 바뀜 — S2 모드 4개(공속·공격·피버·피버 마법)의 기본 능력 버프 이펙트 `oblvns_skill_02_buff`/`_buff_01`이 `attach`에(78e4c4fa의 「모두에게」 규칙),
  아레나에서 S2 동안 몸 뒤 분홍 오라로 보임(공식 대조 안 함). 왕·첸 더 던스트릭·위셔델·아스카론은 그대로.
- **마운트 회전**: FollowMountPoint `_keepOriginRotation` 0 = 효과가 마운트 지점의 회전을 받는다. 아르케토 S3 시전 부채꼴 `archet_skill_03_start`는 마운트 2(MUZZLE)·0이고
  루트에 회전 필드가 없다; 총구 점(`points.json` `F_Muzzle`/`B_Muzzle`, `rot 1` = 본 회전 따라감)의 본은 Skill_3 동안 네 방향 모두 월드 −90°(런타임 값).
  → `fxpoints.js pointTurn`(그 쪽 본이 `rot 1`이면 `getWorldRotationX` 라디안, 아니면 null), `fxgame.js lifted()`의 `rot`(마운트가 있고 `keepOriginRotation === 0`일 때),
  프레임 루프가 프리팹 루트(`nodes[0]`)를 Unity 프레임 z(보드 법선; +x 열·+y 행 — `aimMover`와 같은 축)로 그만큼 돌린다(뒤집기 안쪽이라 왼쪽은 거울).
  축: 깊이 축(y)으로 돌리면 부채꼴이 얇아질 뿐 세로 그대로였고, z로 돌리면 부채꼴이 눕고 고리(`huan`)가 발사 방향에 수직으로 선다 — 단독 렌더(루트 0 / −90 / +90)로
  비교. **부호 정정**(관리자 제보 2026-10-08): 런타임 각도는 y 아래 좌표라 Unity(y 위) 회전은 그 반대 — +90°, 부채꼴은 오퍼레이터 뒤로 열리고 가시·고리가 적 쪽.
  **2026-10-10부터 매 프레임**(디컴파일: `FollowMountPoint._FollowMountPoint` RVA 0xC9E2E0은 `_keepOriginRotation` 0이면 **매 LateUpdate** 점의 회전을 받는다;
  관리자 결정 (2026-10-10)) — `lifted` `rot`가 매 프레임 `pointTurn`. 그 전(2026-10-08 관리자 제보)에는 첫 프레임 값을 두었다: 니어 더 래디언트 나이트 S3
  `nearl2_skill_03_start`의 빛의 창(`qiang`, sp0 = `F_Weapon`, 루트 0°에서 앞으로 찌름)은 시작 때 본 −0.4°인데 0.5초 안에 창이 ~160°로 돌아가, 매 프레임 따라가면
  찌르기가 뒤를 향했다. 공식도 매 프레임이므로 그 차이는 점의 각도·돌리는 축에 있다 [추정: 클라는 스켈레톤의 기울어진 평면(`Graphic` X축 −30°) 안에서 돌리고 우리는 판의
  법선으로 돌림] — **화면 확인 필요**(니어 S3, 아르케토 S3). 아레나(2026-10-08, 첫 프레임 방식): 아르케토 오른쪽·아래(모델 오른쪽) 모두 부채꼴이 왼쪽으로, 니어의 노란 창이 적 쪽으로.
  범위: 마운트 359개 중 `keepOriginRotation` 0이 358개, 그중 점이 본 회전을 따르는 **337개(88명)**가 돈다(각도는 애니메이션마다 — 0°에 가까운 것은 안 바뀜).
- 확인: 단위 `test/render/fx-direction.test.js`(7개: dirs 기록, U_OR_D·FOUR_DIR·L_OR_R·NONE 고르기, pointTurn, 소스 고정, 추출물 mount). **아레나**(아르케토 S3 네 방향, 수정 전 세로 기둥 → 후 활에서 적 쪽으로 가로 부채꼴, 고리가 서 있음; 스펙터 디 언체인드 S2·엑시아 더 뉴 커버넌트 S1·니어 더
  래디언트 나이트 S3 이상한 모습 없음, 니어는 수정 전 세로 기둥 → 눕힌 호/빔). 실제 판·공식 녹화 대조는 안 함(아르케토 공식 녹화 없음). 나머지 85명 [화면 미확인].

### 정예 기물 금빛 (2026-10-08, 관리자 요청 「정예화된 오퍼는 휴식 기간에 황금빛으로 빛나는 이펙트」)
- 근거: zh_CN `gamedata/battle/battle_misc_table.json` `miscConfig.AUTOCHESS.act1autochess`·`act2autochess.effectConfig.goldenEffectId`
  = `trap_acgarm_buff_loop_01`(클래스 `AutoChessBattleMiscConfig.EffectConfig`). 메타데이터: 정비 기물은 더미(`CreateDummyOnTile` → `_DoCreateOnTile` →
  `_CreateGoldEffectIfNeed`) — 전투 유닛은 더미가 아니라 전투 중에는 없음. 프리팹은 `battle/prefabs/effects/trap.ab`(EN 클라이언트), `_spawnLocation` 1(발),
  4초 루프: 금빛 glow(`bg_011_dm`, AlphaBlend)·위로 오르는 불티(`spark_p_02`)는 sortingOrder −1(모델 뒤), 별빛 메시·`bao` 2개는 0.
- 구현: `render/fxgolden.js syncGoldenFx`(매 프레임, `app.js`가 `mode === 'prep'`일 때) → `fxgame.js statusOn(…, 'golden', 0, null, under=true)`.
  `under`는 상태 이펙트와 달리 'high'+3D 보드에서 렌더러별 분할(−1은 모델 뒤), 그 밖에는 유닛 아래 캔버스. `fxstatus.js syncStatusFx`는 자기 키(STATUS_FX)만 끈다.
  공식 이펙트가 도는 동안 원본의 절차 금빛 오라(`units.js aura`)는 숨김(전투 중 오라는 그대로).
- 보이는 모습: 몸 뒤 은은한 금빛 + 머리 위로 오르는 금색 불티. 몸이 glow를 대부분 가린다(데이터대로) — 공식 캡처와 비교 [추정].
  보드와 벤치 모두 [추정](벤치 기물도 더미 `placeToHand`). 소환물·적·장치 제외.
- **위치 수정** (2026-10-08 관리자 제보, 공식 녹화 — 비공개 녹화):
  보이는 빛은 `bao`(Additive, 1초 × speedMul 0.8 = 1.25초 주기)의 금빛 띠 — 로컬 정렬(align 2) 쿼드가 바닥면에 누워 pivot x 0.95·회전 −90°로
  발 앞에서 유닛 뒤로 뻗는다. 우리는 ① 렌더러 `m_Pivot`을 무시해 띠가 노드 자리(발 앞 0.4칸)에 놓였고 ② 프리팹 루트 위치(z −0.25)를 더해 전체가 떴다.
  → `fxplayer.js FxInstance` 옵션 두 개: `pivot`(빌보드·정렬·수평 쿼드가 회전 전 모서리를 pivot × 크기만큼 옮김, 셰이더 `uPivot`; 늘인 빌보드·메시 파티클은
  미적용), `atSpawn`(루트 노드 자기 위치를 버림 — 호출자가 놓는 자리가 대신함). 처음(70430a17)에는 정예 금빛에만 켰고,
  **관리자 결정 2026-10-08 「둘 다 전체 적용」**으로 두 옵션 모두 기본값이 켜짐(`false`를 넘기면 예전 방식, 지금 끄는 호출자 없음).
  영향: pivot 쿼드 412 시스템 / 242 프리팹(전체 pivot 1,836 시스템 중 늘인 빌보드 1,193·메시 94 등은 아직 미구현), 루트 위치 104 프리팹(대부분 투사체 꼬리).
  - 비교(프리팹 단독 current / pivot / pivot+root)와 디버그 아레나 전·후(野鬃 S2, 空弦 공격):
    野鬃 S2 찌르기 빛줄기는 전에는 적 **반대쪽**으로 2칸 넘게 뻗었고 이제 유닛에서 적 쪽으로 뻗는다(pivot x 1.0 × 크기 1.6).
    꼬리(空弦 `archet_attack_01_trail` 루트 (0.39, 0.65), 丰川祥子 음표 등)는 투사체 선에서 떨어져 날다가 이제 선 위로 — 그런데 그 선의 높이가
    그때의 `fxgame.js TRAIL_Z` 0.35칸이라 空弦 화살이 화면에서 발 높이로 낮게 났다(전에는 루트 오프셋 덕에 머리 높이로 보였다).
    → (29159794)에서 TRAIL_Z를 없애고 Muzzle → 대상 hit 점으로, 2026-10-10에 공격의 `_mountPointType` 점으로(「시전 이펙트 시점·붙는 대상」 ⑤). 첸 S2·비르투오사 S3·르무엔 S3·余·취약은 조금만 바뀜.
  - 근거·[추정]: pivot 부호(+)는 녹화에서 띠가 유닛 뒤로 가는 것(−면 발 앞·아래), 루트 버리기는 Unity `Instantiate(prefab, pos, …)` 동작 + 녹화 높이.
    클라이언트 `Torappu.Battle.Effects.ParticleEffect`(메타데이터 필드 기본값)가 자식 이름 `static_offset`·`rotation_y`·`rotation_z`·`flip_x`를 상수로 갖고
    `_overwriteHeight`·`_heightOffset` 필드가 있다 — 이 프리팹 루트 값은 false / 0(원시 필드)이라 `static_offset`(z −0.34)은 그대로 둔다. 그 로직은 C#
    (디컴파일 2026-10-10: `Effect._InitLocationFromEntity`가 켜졌을 때만 `localPosition.z = −(유닛 높이 + offset)`; 풀에서 켜진 것은 `thorn2_skill_01_range`뿐).
    카메라는 공식 값(30°·40°, configBlackBoard 위치 — `projection.js`)이라 높이·깊이 화면 계수 차이는 원인이 아니다.
  - 측정(띠의 세로 무게중심, 발 위 칸 수 — 유닛 양옆 열, 프레임별 밝기에서 조용한 프레임을 뺀 값; 공식 칸 크기는 레벨 칩 73px ÷ 우리 43.3px × 우리 칸 124px
    = 210px, 모델 키 공식 1.14칸 / 우리 1.10칸으로 교차 확인): **공식 0.43** · 수정 전(8aaa9797) 0.0~0.08(최고점이 발 아래 = 제보) · pivot만 0.56 ·
    **pivot + 루트 버리기 0.46~0.48**. 번쩍인 뒤 0.3초 동안의 궤적은 공식과 0.05칸 안(예: +0.1초 0.30 / 공식 0.29). 이전 메모의 「아직 0.2칸 높다」는
    공식 띠를 눈대중(0~0.45칸)으로 잡은 비교였다.
  - **띠는 모델 앞** (2026-10-08 관리자 제보; 녹화도 번쩍일 때 검은 신발·정강이가
    금빛으로 덮인다): `bao`는 sortingOrder 0 — 분할 규칙이 order 0 파티클을 모두 모델 뒤 캔버스에 두었다. 클라이언트는 같은 order(Spine도 0)를
    거리로 정렬하고 `bao` 노드는 발 앞 0.4칸이라 모델 위에 그려진다 → `fxplayer.js FxInstance` 옵션 `ahead`(분할할 때 노드가 유닛보다 0.1칸 넘게
    앞인 order 0 파티클을 FX_FRONT로). `bao (1)`(뒤 0.6칸)·order −1 glow·불티는 그대로 뒤. 처음(c55ce02f)에는 정예 금빛에만 넘겼고,
    **관리자 결정 2026-10-08 「일단 19개에게도 적용해놔. 나중에 이상하면 수정요청할게」**로 기본값 켜짐(`ahead: false`면 예전 방식, 끄는 호출자 없음).
    품질 high + 3D 보드(분할)일 때만 — medium 이하는 예전처럼 전부 유닛 아래. 분할 안 하는 대상 타격·상태 이펙트는 영향 없음.
    [추정] 공식은 유닛마다 거리로 정렬하지만 우리는 「모든 유닛 앞 / 모든 유닛 뒤」 둘뿐이라 옆 칸 유닛까지 덮을 수 있다.
    - 실제로 바뀌는 프리팹(엔진으로 전 1,983개를 만들어 센 것 — 42개 중 분할 경로 25개):
      정예 금빛, 데겐블레허 S3 시작, 라플란드 더 데카덴차 늑대 토큰, 텍사스 디 오메르토사 S3 범위 시작, 프라마닉스 더 프레리타 범위·S3 범위·S3 시작,
      실버애쉬 더 레인프로스트 S3 범위, 비르투오사 S3 버프 04·05(관리자가 전에 확인한 이펙트), 가비알 디 인빈서블 S1 치유·S2 버프, 글래디아 S3 버프,
      마운틴 S3 범위, 비질 토큰 치유, 사리아 자기 버프, 스카디 S3 버프, 스펙터 디 언체인드 패시브 버프·끝·S1 시작, 시 S3 버프, 시빌라이트 에테르나 S3 버프,
      울피아누스 S3 범위, 첸 더 던스트릭 S3 범위, 페페 등장.
      확인: game-mock(모델 보임, 공식 녹화와 나란히)·실제 판(보드·벤치) — 둘 다 번쩍일 때 다리가 금빛에 덮임. 테스트 `test/local-patch-golden.test.js` 「opts.ahead」.
  - 알려진 차이(이 수정 범위 밖): 띠가 공식보다 어둡다(칸당 밝기 합 약 2/3, 녹화 압축·감마 감안 [추정]) — 공식은 번쩍일 때 발 높이에 흰 띠가 뚜렷하다.
  - 테스트 `test/local-patch-golden.test.js`(기본값: 루트 버림·`uPivot` 설정·order 0 앞 분할, `false`면 예전 방식; `fxgame.js`의 어떤 호출도 끄지 않음).
    확인: game-mock 정비 화면(rAF·`performance.now`를 1/30초씩 넘겨 프레임 캡처, 모델 숨김·보임), 실제 솔로 판 정비(`dbg.addDiy golden` 보드 1·벤치 1).
- **판매 뒤 남는 금빛** (2026-10-09 관리자 제보): `syncGoldenFx`는 `views`에 남은 뷰만 보므로
  판매·이동으로 `app.js dropView`가 지운 뷰의 루프는 끄는 쪽이 없어 그 자리에서 계속 돌았다(같은 기물이 `_sig`가 바뀌어 다시 만들어질 때도 하나씩 쌓임).
  → `dropView`가 그 뷰의 상태 이펙트(`_fxStatusOn`)를 모두 `statusOff` — 전투 밖은 즉시(`now`), 전투 중은 남은 파티클 수명대로.
  확인: 실제 솔로 판 정비(`dbg.addDiy golden` 보드 배치 → `g.sell`):
  수정 전 판매 뒤 `trap_acgarm_buff_loop_01` 1개 남음(빈 칸에 금빛 불티) / 수정 후 0개.
- 소재(git 밖): `fx_extract.py --bundle trap --prefab trap_acgarm_buff_loop_01` → `public/assets/local/fx/trap/`, 텍스처 6·메시 1, `fx/index.json`의 `trap`.
- 테스트 `test/local-patch-golden.test.js`. 확인: game-mock 정비 화면(보드·벤치 기물 하나씩 golden), 프리팹 단독 재생.

### 그 밖의 이펙트 수정 (2026-10-08)
  - **나뭇잎 텍스처 폐기** (2026-10-08 관리자 제보): `common_stealth` 프리팹과
    `tex/common_leaf_*.webp`를 추출물·`fx/index.json`에서 지우고, `fx_extract.py DISCARD`로 재추출에서도 뺀다. 예전 추출물에 남은 사본은
    어디서도 참조하지 않는다(지워도 됨).
  - **泥岩 Back 스켈레톤의 S3 시작 클립** (2026-10-08 테스트 정리에서 발견, `assets.test` 「Spine animation roles resolve」): 9ac38090의
    `anim-overrides.mjs`가 앞·뒤 모두에 `Skill_2_Begin`을 넣었는데 Back 스켈레톤에는 `Skill_2_Begin`·`_Awake`·`_Sleep`이 없다 → `applyAnimOverrides`가
    스켈레톤 클립 목록(`spine.mjs`가 넘김)에 없는 덮어쓰기 클립을 null로 둔다(Back S3는 시작 클립 없이 `Skill_2_Attack`·`_Idle`). `fetch-assets --offline`으로
    매니페스트를 다시 만들어 바뀐 것은 이 한 칸(+hash). 테스트 `test/local-patch-battle.test.js`.
  - **望 바둑돌 이펙트 높이** (2026-10-08 관리자 제보): 공식 캡처는 돌의 금빛·십자·연결선이 **공 위**(그림자에서 화면상 0.19칸)인데, 우리는 `_spawnLocation` 5대로 땅에 그려 돌의 루프(`sz` 십자 빛)가
    공 밑 그림자에 묻히고 첫 폭발만 보였다 → 탄생·跟子 이펙트(주인 따라감)와 연결선·활성 섬광을 공 중심(화면상 0.18칸, `fxgame.js STONE_BALL`·`ballZ`)에.
    폭발(`token_wang_skill_0N_hit*`)은 그대로 땅. 확인: 디버그 아레나.
    → **재제보로 일부 되돌림** (아래 「望 바둑돌 이펙트 재제보」): 탄생 십자는 다시 땅, 활성 휘감김·연결선만 공에.
  - 跟子 이펙트를 3초마다 다시 틀던 [추정] 규칙은 지웠다(a2bd93de) — 캡처의 검은 연기는 탄생 이펙트가 아니라 활성 이펙트(`wang_passive_01_buff_02`의 `line` 메시)였다.
  - **望 바둑돌 이펙트 재제보** (관리자 제보 2026-10-08; 비공개 조사 기록):
    - **활성 이펙트 유지** (4dcf30ac): 「루프」로 보여야 하는 것은 활성(연결) 이펙트 — 놓은 돌 `token_wang_01_buff`(sktok_wang_N/TriggeredEffect
      `_buffs[0].overrideEffectKey` = 버프 이펙트), 跟子 `wang_passive_01_buff_02`(투사체 `_triggeredEffect`). 둘 다 `line` 메시(검은·금빛 휘감김)가 클립의
      `_Amount` 1 → 0으로 0.6초에 드러나고 그대로 남는다. 루트 효과 컴포넌트 원시 int #17이 상태 버프 거의 전부와 이 둘·탄생 이펙트 = 1, 폭발 = 0 —
      그 필드는 `_isLoop`가 아니라 **`_holdByOwner`**(디컴파일 2026-10-10: `ParticleEffect` 직렬화 필드 순서 #13 `_spawnLocation`·#17 `_holdByOwner`, `Effect._InitLocationFromEntity`
      끝의 `entity.HoldEffect` — 주인이 쥐고 있어 주인과 함께 끝남; 「돌이 있는 동안 유지」는 이것으로 설명됨). 우리는 클립·파티클이 끝나면(약 1초) 버렸다 → `playAt keep`으로 돌에 붙여 그 돌의 `die`(소모·회수)까지 유지. 그리고 정비에서 붙여 놓은
      돌은 전투 첫 틱에 활성되는데 그 'wangLink'가 화면이 필드에 들어가기 전이라 `screens/game/early.js keepEarly`가 버렸다(fx라서) → 'wangLink'도 남김.
      탄생 이펙트 `token_wang_birth_01_buff`에는 같은 `line` 메시가 꺼져 있다(외톨이 돌은 휘감김 없음 = 공식 캡처 아래쪽 돌).
    - **탄생 십자는 땅** (bc352ecb, 관리자 제보(정정)): 탄생 이펙트의 루프 십자(`sz`/`sz1`: 땅 평면의
      길이 1칸 납작한 쿼드)는 땅 표시 — 공식 캡처에서 팔이 타일 가장자리에서 가장자리까지, 타일 중간보다 8~10px(타일 ~250px) 위. 공 높이로 올리면 화면에서
      약 0.15칸 위로 뜨고 원근 때문에 칸마다 다르게 어긋난다 → STONE_BORN은 돌 뷰의 땅. 활성 휘감김·연결선은 공에(캡처에서 공을 감쌈).
    - **폭발** (e3a80aaa, 5a9138d8): 돌에서는 클라이언트가 트는 것만 — sktok_wang_1/3 `_castEffects`, sktok_wang_2/ExplodeRow·Col·Cross `_effectKey`
      (축마다), 跟子 투사체 `_effectOnTrigger`(`fxgame.js stoneBlastFx`). `_02`는 타격 이펙트(ExplodeRow `_hitEffects`, S3 跟子 `_effectsWhenHit`)라
      같은 순간의 'dmg'로 범위 안 적·터뜨린 적마다(`stoneHit`, `inStoneBlast`). `token_wang_skill_03_hit_03`(모든 시스템 x+2칸 = S3 폭발 사본)은 어디서도
      참조하지 않아(charpack, 토큰 번들, `[uc]` 6개, 표) 안 튼다 — 2칸 옆 두 번째 폭발과 ~9칸 직선 입자의 원인. 그리고 `fxplayer.js shapeSample`이
      BoxShell/BoxEdge(15/16)의 크기를 두 번 곱했다 → S3 `lizi_l`이 ±1×±1.5칸 대신 ±2×±4.5칸. **관리자 결정(2026-10-08): 전체 적용** — 58 시스템·36 프리팹
      (buff_sluggish, buff_autochess_frozen, 첸 S3 범위, 로즈몬티스 S3 …).
      알려진 차이 [추정]: S3 `lizi2 (1)/(2)` 가는 호는 프리팹 자체가 반지름 2.2 원에서 나와 마름모 대각선 모서리를 조금 넘음(공식도 같다고 봄), 늘인 빌보드
      pivot(`lizi2 (2)` 0.5, `sdx_line` 1, `baoci` −0.5) 미구현. 테스트 `test/render/wang-stone-fx.test.js`.
    - **돌아오는 돌 위 금빛 기둥·육각형** (2026-10-08): 실제 판 캡처의 노란 기둥+흰 심지+
      육각형은 소환 대체 그림(민트)이 아니라 **스킬 발동 대체 그림** `fx.skill`이다. 소모된 놓은 돌이 같은 id로 돌아올 때 시뮬레이션은 토큰 패시브의
      `['skill', id, 1]`을 `['deploy', id]`보다 **먼저** 보낸다(`deploy.js` `skill.reset` → 'deploy'; 실제 매치 5판에서 S3 중 `die` 2.0초 뒤가 대부분).
      쓰러지는 뷰는 최대 2.15초 남으므로(`units.js` `dying`) 그 뷰 위에 `render/app.js`가 `burst: !ownsSkill(v)`로 금빛 기둥을 그렸다(토큰은 `isOp`가 아님).
      → `fxgame.js ownsSkill`이 望 돌 뷰에 `stonesOn()`을 돌려줌(돌의 탄생·활성은 stoneFx의 공식 프리팹). 「跟子 'summon'이 뷰보다 먼저 온다」는
      처음 추정은 틀렸다: 실제 매치 경로 124개 summon 모두 spawn 뒤, Chrome 실제 판에서도 소환 대체 그림 0회, 跟子 탄생은 `wang_passive_01_buff`(3/3).
      확인 수준: 실제 판에서 돌의 `fx.skill`이 수정 전 `burst: true` → 후 `false`, 기둥 자체는 실제 판에서
      다시 찍히지 않음(쓰러지는 뷰와 겹치는 타이밍이 이번 판들에 없었음 — 원인은 이벤트 순서 데이터 + 페이드 시간으로 추론).
  - **赤刃明霄陈 S3 용이 그녀를 가림** (관리자 제보 2026-10-07, 공식 캡처·녹화 — 비공개: 용은 그녀 뒤):
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
    - 알려진 차이: 공식 녹화는 용 머리가 그녀 어깨 위로 크게 드러나는데 우리는 그녀 몸에 대부분 가린다. 같은 장면에서 우리 첸이 칸 대비 약 1.3배 크다
      (공식 녹화 키 ≈ 1.07칸, 아레나 ≈ 1.35칸, 관리자 캡처 ≈ 1.6칸) — 유닛 크기 문제로 보임(`render.md` 「유닛 모델 크기」).
  - **赤刃明霄陈 S3 검기가 상자(阻隔工事)를 뚫고 올라감** (`act2autochess_m03` 排气格栅, 상자 = 장치 `trap_1105_accrate`이 `b` 낮은 칸 위에 놓임 —
    「언덕 타일」이 아니다): 시뮬레이션은 그대로 둠 — 클라이언트 상자 프리팹 모드 `_tileOptions.heightType` 0 + `_rewriteTileHeightType` 0
    (`_rewriteTileHeight` 1, `_rewriteHeight` 0.4: 높이 값만 바꾸고 높이 종류는 LOWLAND 그대로)이고, 투사체 `ChangeStateWithHighlandBehaviour`는
    `_checkHitHighland`(높이 종류)·맵 끝·侵入点·保护目标만 본다 → 공식도 검기는 상자를 지나간다 [추정: 높이 종류만 본다는 것은 필드 이름·PRTS 「高度类型为高地」].
    대신 그리기: 공식 맵·장치는 깊이 버퍼에 있는 불투명 메시라 `_ZTest` 4인 렌더러(검기 용 머리 `long_02`·꼬리 리본 대부분, 버프 용 머리 `longtou`)는
    상자 안에서 가려지고 `_ZTest` 0인 것(별빛·빛)만 위에 보인다. 우리 이펙트 캔버스는 보드와 다른 캔버스라 깊이가 없었다 → `fxgame.js` occluders:
    3D 보드일 때 높은 칸(`tiles.grid` 높이, `app.js` `grid` 옵션 1줄)과 전투 장치 상자(`DeviceView` `spec` 크기·높이)를 상자 꼴로 이펙트 캔버스 셋의
    깊이에만 먼저 그리고(색 안 씀), `fxplayer.js`는 재질의 `depthTest`를 `_ZTest`대로 켬(모든 이펙트 렌더러가 깊이를 안 쓰므로 가림막 말고는 차이 없음).
    윗면은 0.05 낮춤(높은 칸 위 유닛 발밑 이펙트, 바닥 자르기와 같은 값). 검기 용은 클립으로 높이 약 0.55~0.6에서 날아 상자(0.74) 안에 들어간다.
    - 디버그 아레나 `arenaStage('stage:<스테이지 id>')`: 실제 스테이지(씬·타일·상자)를 그대로 — 칩 없음, `__debug.st.terrain`으로 지정.
    - 확인(Chrome, 디버그 아레나 평지·실제 스테이지, git HEAD 판과 전후 비교): 평지에서 용이 뒤·한 마리, 수정 전 상자 위로 보이던 용이 수정 후 상자 안에서 가려지고
      꺾은 뒤 다시 보임, 오른쪽 배치에서 뒤 상자 위에 용 없음.
    - [추정]·알려진 차이: 상자 가림막은 칸 크기 상자(0.84×0.74, `DEVICE_BOX.crate`) — 공식 상자 메시 모양과 조금 다름. 전투 밖 정적 상자(전투 칸 밖)는 가림막에
      안 넣음. 2D 보드는 그대로.
    - 관리자 확인(2026-10-08): 제보는 상자를 배치 불가 언덕으로 본 것이고 공식 동작의 기억은 없다. 시뮬레이션(상자를 지나감)은 그대로,
      공식 녹화에서 검기가 상자에서 꺾이는 것이 보이면 다시 연다. 참고: 공식 PC 캡처(사막 맵)에서 전투 중 상자(HP 바 있음)는 칸 위 장치로 보인다.

### 回环射手 부메랑 (2026-10-08, 관리자 제보, 377e50bd)
- **두 번째 부메랑**(2026-10-10): sim이 S2 乐趣加倍의 추가 투척(`_additionalTimes` 1, 0.1초 뒤)을 fx `caperBoomerang2` { id, tgt, n }로 낸다('atk' 없음). 클라
  `projectile_chr_caper_s2_1`은 `projectile_chr_caper_s2`와 같은 꼬리(`caper_skill_02_trail`)·속도 15·돌아옴 0.25에 `_inverseParacurve` 1. ParacurveMovement
  `_raiseHeight` 0.3·`_noRaiseHeightThreshold` 1.3(EN `[uc]projectiles.ab`) → `fxgame.js caperSecond`가 S2 모드 꼬리로 대상까지 갔다 돌아오는 두 번째 비행을 띄우고
  (S2 첫 투척 +0.3, 두 번째 −0.3 높이의 호, 1.3칸 미만은 직선 [추정: 반대 호 = 같은 높이만큼 아래]), 꼬리가 아직 안 읽혔거나 공식 이펙트가 꺼져 있으면 `fx/simfx.js`가
  절차 부메랑을 반대쪽으로 휘게(`attack(…, { inverse })`) 그린다. 손의 바퀴는 날아간 비행 수를 센다(`boomerang.js`, 둘 다 돌아와야 다시 손에).
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
- 확인: 디버그 아레나(Chrome, 수정 전·후 캡처 — 바퀴가 돌아오고 한 번에 하나, 대상 없을 때 손에 바퀴 front·back, S2) + 실제 솔로 판(상점에서
  산 跃跃: 던짐/잡음 전환, 꼬리 복귀). 테스트 `test/local-patch-status-boomerang.test.js`(스킨 데이터 고정 포함).
- 알려진 차이(시뮬레이션): 공식 S2 「每次攻击额外发射1个回旋投射物」은 투사체 2개(`projectile_chr_caper_s2`·`_s2_1`)인데 시뮬레이션은 1개에 2타라
  화면에도 바퀴 1개. 시뮬레이션은 받는 틱에 바로 다음 공격을 던져(공격 쿨다운이 이미 참) 손에 든 모습은 연속 공격 중 거의 안 보인다 — 공식은 받은 뒤
  Attack 클립(OnAttack 0.533초)이 돈 다음 던진다고 봄 [추정]. 둘 다 `server/sim/ai.js` 쪽이라 화면 수정 범위 밖.

### 텍사스 디 오메르토사 S2 발동·S3 검우 (2026-10-08, 관리자 제보: S2 이펙트가 멈춘 그림처럼 남음, S3 지속 중 검이 계속 떨어지지 않음)
원인 조사는 비공개 조사 기록. 관리자 결정 2026-10-08: S2는 재생기 다중 클립만 고치고, S3는 이름 교체 + texas2 번들만 재추출.
- **검우 프리팹 이름** (c9a3755b): 시뮬레이션 'swordRain'(대상마다, `src` = 그녀)이 클라이언트에 없는 이름 `texas2_skill_03_hit`(검 없는 스파크)를
  그렸다. 공식: `[uc]skills.ab` ModeWithSwordRain의 EmitSword가 1초마다 투사체 `projectile_chr_texas2_s3_sword_rain`을 쏘고, 그 `_effectsToTargetWhenStart` =
  `texas2_skill_03_hit_02`(5.5칸 위에서 0.13초 낙하 `luojian` + 착지 `luo`, 2.62초). → `fxgame.js`가 스킬 바인딩의 target(`modes.json skills[2].target`)을 그린다.
- **재생기 다중 클립** (6f3ff734): 프리팹 안의 중첩 서브프리팹은 자기 Animator·클립을 가진다. `FxInstance`가 `clips[0]`(루트 것)만 틀어 S2 발동
  `texas2_birth_02_start`의 베기 4개(메시 16개)가 머티리얼 기본값으로 약 2초 굳어 있었다. 이제 모든 클립의 트랙을 묶어 각 클립 길이까지 재생(끝 프레임 유지),
  `done`·꼬리는 가장 긴 클립 기준. 추출기는 이미 클립 노드를 전체 트리 번호로 풀어 둠 → 재추출 없음. 적용 안 한 것(관리자 결정): 중첩 서브프리팹 `_delayTime` 0~0.3초(지금은 동시 시작),
  루트 `_delayTime`(약 310 이펙트) 보류. `m_IsActive`는 아래 「착지한 낙하 검」에서 나중 결정으로 적용.
  픽셀 비교(HEAD 대비 1983 이펙트 × 4프레임): 바뀐 것은 클립 2개 이상인 11 프리팹뿐(바인딩된 6: 텍사스 디 오메르토사 S2 발동·S3 범위 시작, 무에나 S2,
  위셔델 S2 2종, 불피스폴리아 S2 / 바인딩 안 된 svash2 방패·불피스폴리아 방향별 4), 나머지 1972는 픽셀 동일.
- **내장 Quad/Plane 메시** (e62c0551): 검날 노드(jian / jian1 / add)는 Unity 내장 Quad(FileID → `Library/unity default resources`, PathID 10210)
  MeshFilter라 `fx_extract.py`가 못 풀어 메시가 빠졌다(재질 트랙도 'attr:'로 남음). 클라이언트가 그 파일을 `<Arknights_Data>/Resources/unity default resources`로
  싣고 있어 합성 대신 **실제 메시를 읽는다**(`Extractor.mesh_ref`, 메시 자리만; Quad 10210·Plane 10209만 — Cube 10202·Sphere 10207은 결정 범위 밖).
  재추출은 texas2 번들만: 9 프리팹 69 노드에 메시가 생김(S3 낙하 검·범위 모서리 검·범위 시작 27, S2 버프 메시 5, S1·S3 버프, buff_02_start 2종), 그 밖의 필드는
  재추출 전과 같음. 산출물 `public/assets/local/fx/texas2/*.json`·`mesh/Quad_000027e2.json`은 git 밖. 나머지 ~316 프리팹(65 번들)은 보류.
- 확인: 단위(`test/render/texas2-skill-fx.test.js` — 바인딩·이름, 실제 `birth_02_start`로 베기 4개가 1초에 사라짐, hit_02 검날 메시; `test/local-patch-fxmodes.test.js`
  다중 클립 합성 케이스). **아레나**(Chrome, `/debug.html?op=char_1028_texas2`): S2 발동 베기가 0.2초에 보이고 0.8초에 사라짐(전엔 약 2초 정지);
  S3 범위 시작 낙하 검·모서리 검, 샌드백에 1초마다 먹 검 낙하 + 착지. 무에나·불피스폴리아 S2 이상 없음(위셔델 S2 시작은 아레나에서 안 틀려 픽셀 비교만).
  **실제 솔로 판**(상점 구매 → 배치): S2 발동이 전투 카메라 진입 중 재생·0.6초에 사라지고 버프만 남음; S3 검우
  `hit_02`가 1초 간격(32.18/33.14/34.14/35.14)으로 적 위에 사선 낙하. **공식 녹화**: S2 녹화(3초)는 스킬 중 평타 구간뿐이라 발동 프레임 대조 불가 — 평타 베기는
  0.4초 안에 사라져 멈춘 그림 없음. S3 녹화(확대)의 「위에서 사선으로 내려오는 큰 먹 검」과 우리 낙하 검의 모양·색은 맞음; 크기·각도의 프레임 단위 대조는 안 함.
- **착지한 낙하 검 — `m_IsActive`** (3a0f2490, 관리자 결정 2026-10-08 「공식과 동일하게」): 메시가 생기자 `texas2_skill_03_range_start`(낙하 4)·`_start`의
  검이 착지 뒤에도 클립 끝(1.53초)까지 α 0.5로 남았다 — 공식은 클립의 `m_IsActive` 트랙(Mecanim type 1, crc32 2086281974)으로 0.2초(start 0.37초)에 끈다.
  `FxInstance`가 이 트랙을 묶어 노드 visible을 따르게 하고(메시·라인), 그 아래 파티클은 꺼질 때 비우고 멈추며 다시 켜지면 처음부터(Unity GameObject 비활성 /
  playOnAwake), 꼬리는 꺼질 때 비운다 [추정: 비움]. 이 트랙이 있는 프리팹 83개 전체에 적용 — 픽셀 비교(1983 × 4프레임)에서 43개가 바뀌고 모두 83개 안
  (로즈몬티스 13·라플란드 더 데카덴차 소환물 타격 6·위셔델 4·쉐라·락락 소환물 타격 각 4·엑시아 더 뉴 커버넌트 버프 3 등), 나머지 1940 동일.
  아레나·실제 솔로 판 S3 재확인(오류 없음, 범위 시작 착지 검 9 → 5).
- **처음부터 꺼진 노드** (65bf7da3, 관리자 제보 2026-10-08 — 시험 적용): 트랙 없이 처음부터 꺼진 노드 아래 파티클·꼬리(166 프리팹 51 번들, 파티클 455·꼬리 61)를
  이제 재생하지 않는다(메시는 원래 숨김). 근거: EN 클라이언트 번들 검사(비공개 조사 기록) — 164 프리팹은 그 노드를 켜는 트랙도
  가리키는 컴포넌트도 없음, 1개는 `_inactiveOnFinish`(끝날 때 끄는 목록)만, 1개는 트랙(위). 네이티브 코드가 이름으로 켜는 경우는 배제 못함 [추정].
  표본 아르케토 S3: `archet_skill_03_start`의 꺼진 `smoke`가 대상 위에 큰 연기를 그렸다 — 같은 시스템이 `archet_skill_03_start_01`에 켜진 채 뒤쪽(0.65, 0.63)에
  있고 관리자가 본 연기가 그것(그대로 남음). 픽셀 비교 117/1983 변화(일부는 난수 순서만), 아레나 아르케토 S3 전후.
- 알려진 차이(범위 밖):
  공식 첫 검우 0.4초 + 검마다 0~0.3초 랜덤 지연(시뮬레이션 규칙), 매 공격 `texas2_skill_02_start`·`_start_02` 동시 재생, S3 배치 폭발(AppearSwordRain, `_hitEffects []`)
  대상에도 hit_02를 그리는 `expect` 규칙.

### 시전 이펙트 시점·붙는 대상 — 디컴파일 확인 (2026-10-10, 관리자 결정 「동작 변경 모두 공식이랑 동일하게」)
근거: 클라 코드(Il2CppDumper `dump.cs` + 역어셈, 켜진 Lua 핫픽스 목록에 아래 메서드 없음)와 charpack·`[uc]skills.ab`·`[uc]projectiles.ab`·이펙트 번들 프리팹 값.
- **① 시전 이펙트(`_castEffects`) 시점** — 클라 `AbilityStandard.<_DoCast>` (RVA 0x3505E70)는 behaviour마다 `OnCastStart` → `OnEvent(ON_CAST_START)`를 낸 **다음**
  전딜(`OnWaitForPreDelay`)을 기다린다 = 휘두름 시작. `CastEffectOptions.OnEvent` (0xB17C80): `_startEvent`에 켜고(`_onlyOnce`면 한 시전에 한 번 —
  `OnCastStart` 0xB17C10이 표시를 지움; `_delayIfFirstAttack` > 0이고 첫 공격이면 그 값 ÷ 재생 속도 뒤), 루프형(`_oneshot` 0)은 `_endEvent` 또는 ON_DETACHED에
  끄고 `OnCastFinish` (0xB17BD0)에서도 끈다(한 번형은 끝까지 재생). `AbilityStandard.Event` = 0 ON_ATTACHED, 1 ON_DETACHED, 2 ON_CAST_START, 3 ON_CAST_END,
  4 ON_SPELL_ON, 5 ON_SPELL_END, 6 ON_ATTACK_FINISH, 7 ON_ATTACK_CHECK_POINT, 8 ON_OVERLOAD. 우리 풀(126명) 모드 바인딩 414개: (oneshot, start, end) (0,2,3) 222 ·
  (1,2,3) 115 · (1,4,3) 45 · (0,4,3) 11 · (0,2,6) 11 · (0,4,6) 4 · (1,2,6) 3 · 그 밖 3 → 85 %(352개)가 휘두름 시작. 우리는 전부 'atk'(타격) 때 켰다(STRONGHOLD 「약 0.5초 늦음」의 원인).
  → `char_modes.py`가 모드마다 `castOpt[mode][이름] = { s, e, o, d?, once? }`(항목의 모든 방향 칸 이름)를 쓰고, `fxgame.js`가 시뮬레이션의 휘두름 시작 상태 이벤트
  `['swing', 유닛, windup, kind]`(attack 담당 계약, `windup` = 타격까지 게임 초)에서 ON_CAST_START 것을 켠다(`swingFx`; `app.js`는 손대지 않음 — 모든 상태 이벤트가
  이미 `fxGame.onEvent`로 온다, 다른 호출자용 `onSwing(view, windup, kind)`도 있음). ON_SPELL_ON·ON_SPELL_END 시작은 'atk'에서(`strikeFx`). 루프형의 끝:
  ON_CAST_END·ON_ATTACK_FINISH = 시전 끝 = 휘두름 + windup × 클립 길이 ÷ OnAttack 프레임(시전 길이 = 배율 × 클립 길이, `AbstractAnimatedAbility.UpdatePlaybackSpeed`
  0xA6E070 — Spine 액터의 공격 클립에서 계산, 못 구하면 프리팹 길이), ON_SPELL_END ≈ 타격; 다음 휘두름·스킬 켜짐/꺼짐(모드 분리)·죽음에도 끔(루프형만, tag `castLoop`).
  첫 공격 지연: 재생 속도 = OnAttack 프레임 ÷ windup. 「첫 공격」 = 배치·모드 전환 뒤 그 모드의 첫 휘두름 [추정: 클라 `isFirstAttack`을 다시 세는 때는 안 읽음].
  'swing' 없이 온 'atk'(예전 서버, 알리지 않은 공격)는 예전처럼 그때 휘두름 것까지 켠다. 0.2초 간격 제한(`ATTACK_GAP_S`)·부하 3단계 생략은 그대로(휘두름 기준).
  `castOpt`가 없는 옛 `modes.json`이면 전부 타격 때(예전 동작). 바인딩 없는 이름 매핑(`_attack_start_*`)도 휘두름 때 [추정: 공식 다수가 ON_CAST_START].
- **② 적에게 붙는 모드 버프** — 버프 이펙트의 주인 = 버프를 가진 유닛, 받는 쪽은 능력의 `_selector`(`Ability._selector`)가 정한다. 아스트젠 더 라이트체이서 S3
  `LinkEnemy`: 선택기 → 범위 선택기 `HasBuff`·`NewBuff` 모두 `_targetSide 2`, `_limitTargetNum 1`·`_maxNum 1` → `halo2_skill_03_buff_02`는 **적 1명**에. 나머지 6명
  (크루스 더 킨 글린트·라플란드 더 데카덴차·락락·미니멀리스트·울피아누스·티피)은 선택기 없음 = 본인(그대로). → `char_modes.py`의 `attachFoe` 판정에 「`_selector`의
  범위 선택기가 모두 `_targetSide 2`」를 더하고 `attachFoeMax`(선택기 상한)를 쓴다. `fxmap.js activationEffects`가 그 이펙트를 시전자 루프에서 빼고(이름 매핑 포함),
  `fxgame.js foeFx`가 스킬 중 그녀의 공격이 맞힌 적에 붙여 그 적이 살아 있고 스킬이 켜진 동안 유지, 죽으면 다음에 맞힌 적으로 [추정: 공식은 `halo2_s_3_link` 버프가
  있는 적을 먼저 고르고 그 버프가 언제 옮겨 가는지는 안 읽음]. 결과: `attachFoe` = 스펙터 디 언체인드 Stand·인디고 `_T1` 모드(전과 같음) + 아스트젠.
- **③ 투사체가 멈출 때 끝나는 효과** — 쏜즈 더 로드스타 `thorn2_skill_0N_token`/`_range`는 스킬이 아니라 투사체(`projectile_chr_thorn2_s1/2/3`)의 것:
  `EffectBehaviour.OnProjectileReached` (0x970110)가 `_effectsWhenReached`를 도착 자리에 만들고(`_setReachEffectOnProjectile` 1이면 투사체 몸에 붙어 같이 움직임 — S2),
  `_clearReachedEffectWhenStop`이면 `OnProjectileStop` (0x970650)에서 끈다; `ScalableAuraHitBehaviour` (0x982390 / 0x982620)는 `_effectKey`(`thorn2_skill_02_range`)를
  투사체 몸 아래 범위 반지름에 맞춰 만들고 멈출 때 끈다. 우리는 `_range`를 이름 매핑 루프로 **그녀 몸에** 붙여(순간 스킬이라 꺼짐 이벤트가 없어) 전투 끝까지 남았다.
  → `char_modes.py`가 스킬 투사체의 그 효과를 `skills[i].zone = { fx, aura, onProj }`로 따로 쓰고(대상 `target`에서 뺌), `fxgame.js zoneFx`가 그 스킬 시뮬레이션의
  'zone' fx 이벤트 자리에서 틀고 지속 시간이 끝나면 끈다(`key`로 1초마다 다시 오는 S2는 그 속도로 따라 움직이고 범위는 반지름 비율로 키움 [추정: 프리팹은 처음
  반지름 크기]); 2D 원(`areaAway`)은 그 경우 안 그린다. 같은 구조: 锡人 S1·S2(`tinman_skill_0N_token_01`/`_range_01`), 号角 S1(`horn_skill_01_hit_02(_buff)`),
  波登可 S2(`podego_skill_02_range`) — 전에는 발동 틱 피해 대상에 한 번 틀었다. `thorn2_skill_01_range`의 `_overwriteHeight`(유닛 높이 + offset)는 안 함.
- **④ SwitchableBackEffect** — `SwitchableBackEffect._UpdateFace` (0xCB7E70): 주인의 `faceToBack`이 바뀌면 이 이펙트를 멈추고 `_backEffect`를 주인에게 만들며, 앞으로
  돌아오면 반대(`common_empty` = 뒤를 볼 때 안 보임). → `fx_extract.py switch_back`이 프리팹 JSON에 `back: { effect, predict, oneShot }`(MonoScript PathID
  7599136815520768295, typetree), `--back-only`가 이미 뽑은 프리팹에 그것만 쓴다(`mount-only`와 같은 방식). `fxgame.js`(`play`·`spawn`)가 주인이 Back 모델일 때
  (`UnitView.entryBack`, 모델 전엔 위로 배치) 앞을 멈추고 숨긴 채 뒤 사본을 같은 자리·층에 틀고, 앞이 끝나면 뒤도 끈다 [추정: 멈춘 앞은 안 보임].
  추출된 번들에서 이 컴포넌트가 있는 기본 스킨 프리팹 62개(26명): 로즈몬티스 7(`_B`)·엑시아 더 뉴 커버넌트 7(`_up`)·비질 5·블레미샤인 5·마운틴 4·실버애쉬 더 레인프로스트 3·
  휴머스 3·파투스 3·위셔델 2(`_F`→`_B`)·티피 2·수르트 2·락락 2·니어 더 래디언트 나이트 2·혼 2·아르케토 2, 1개씩 비나 빅토리아·프라마닉스 더 프레리타·산크타 믹사파라토·
  리드 더 플레임 섀도우·필라에·쉐라·아스트젠 더 라이트체이서·스펙터 디 언체인드·첸 더 던스트릭·비르투오사(`cello_skill_03_buff_front_02` → `_back_02`)·에이야퍄들라 더 크비트
  아스카. 그중 5개(에이야퍄들라 S3 시작·스펙터 S2 `buff_03`·프라마닉스 S3 `buff_02`·실버애쉬 S3 전투 시작 2)는 뒤를 볼 때 `common_empty`(안 보임).
- **⑤ 투사체 시작·끝 점** — `RangedAttack._GetMountPoint` (0xA4B4E0) = 쏜 사람의 `GetMountPoint(_mountPointType)`(MUZZLE 210개, 특수점·GROUND 19개 — 풀 전체),
  `GetTargetLocatable` (0xA4A190) = `_projectileDestination` 0이면 대상의 hit 마운트 점. → `char_modes.py`가 모드 주 투사체의 `_mountPointType`이 MUZZLE이 아니면
  `shotFrom[모드]`(우리 풀: 로즈몬티스 S2 GROUND, 포덴코 S2 SPECIAL_0, 토가와 사키코 Default·S1 SPECIAL_3 — 사키코는 음표라 꼬리 경로 밖), `fxgame.js shotFrom`이
  그 점(`fxpoints.js mountSpawn` → `pointKey`; GROUND = 발밑)에서, 없으면 Muzzle에서 쏜다. 끝은 대상의 `points.json` `hit` 점(오퍼레이터), 표가 없는 적은 키의 0.5(근사).
- **⑥ DirectionType 4 UD_OR_LR** — 위 「이펙트 방향」 참고(0번/2번, 비면 좌우). 지금 바인딩에 그 묶음 0개라 화면 변화 없음.
- 확인: 단위 `test/render/fx-cast-timing.test.js`(추출 결과·`castTiming`/`castPhase`·`activationEffects`·UD_OR_LR·소스 고정). 화면 확인은 안 함(브라우저 확인은 메인 세션).
  `modes.json`(공유 `public/assets/local/fx/`)은 `char_modes.py` 재실행으로 다시 씀; 프리팹의 `back`은 `fx_extract.py --game <클라> --back-only` 실행 전에는 없어 ④는 그 뒤에 보인다.
- **2026-10-10에 마저 한 것**(같은 조사의 다른 점, 관리자 결정 (2026-10-10)):
  - FollowMountPoint 회전을 매 프레임 따르기 — 위 「이펙트 방향」.
  - 재생 속도: 클라 `HitEffectOptions.OnCastOnTarget`(0xAE54D0)은 타격 이펙트를 `CreateEffect(…, 1.0)`로 만든다 — 공속과 상관없이 1.0배. 시전 이펙트(`CastEffectOptions`)만
    능력 재생 속도로 → `fxgame.js` `play`/`spawn`의 `speed`(살아 있는 항목 `l.speed`, 프레임마다 `dt × 게임 속도 × speed`): 시전 이펙트 = 그 공격의 `castSpan` 재생 속도
    (OnAttack 프레임 ÷ windup), 타격·그 밖 = 1.0(전과 같음).
  - 언더플로우 S2 `udflow_skill_02_hit_01`의 `_useOwnerToTargetDirection`: `char_modes.py`가 `hitAim`(그 항목이 켜진 타격 이펙트 이름)을 쓰고, `fxgame.js`가 그 이펙트를
    공격자 → 대상 선으로 돌린다(`rotation_z` 축이 있으면 그 각도, 없으면 그 선의 좌우로 거울 [추정: Effect가 `dir`로 도는 방식은 안 읽음]). **`modes.json` 재생성이 필요**
    (`char_modes.py`; 공유 파일이라 이 작업에서 다시 쓰지 않음) — 그 전에는 예전처럼 공격자의 좌우.
  - `_spawnLocation` 2 HIT_POINT·4 HEAD_POINT: `Effect._InitLocationFromEntity`가 엔티티의 hit / head 마운트 점에 놓는다 → `fxpoints.js pointKey` 2 → `hit`, 4 → `head`
    (오퍼 `points.json`, 적 `enemy-modes.json points`), 표가 없는 유닛은 예전 높이(키의 0.5 / 1.1).
  - 쏜즈 더 로드스타 S1 `thorn2_skill_01_range`의 `_overwriteHeight`(풀에서 유일, offset 0.0 — 원시 필드 #18·#19, `fx_extract.py overwrite_height`): 프리팹 `height`,
    `fxgame.js overHeight`가 높이 = 그 유닛의 바닥(점이면 그 칸의 높이) + offset [추정: 엔티티 = 착지한 S1 투사체, 그 칸 위]. `_spawnLocation` 7이 0에 놓은 것을 높은 칸이면
    그 칸 위로 올린다. **`fx_extract.py --game <클라> --bundle thorn2 --height-only` 실행 전에는 `height`가 없어** 화면 변화 없음.

### 사용자 제보 묶음 (2026-10-10, 렌더·이펙트 담당)
- **혼(号角) 저지 중 공격에 원거리 폭발** (제보: 저지 중인 적에게 원거리 공격용 폭발 이펙트가 나오면 안 됨): 모드 바인딩이 한 모드의 근접·원거리 능력을
  하나로 합쳐(`hit` = `horn_attack_01_hit` + 투사체 `projectile_chr_horn`의 `horn_attack_01_hit_02`) 모든 공격에 둘 다 틀었다. 클라 charpack
  `char_4039_horn/Modes/Default/Body/Attack/`: MeleeAttack·BlockedMeleeAttack `_hitEffects` = `horn_attack_01_hit`만(시전 없음), RangedAttack = 시전
  `horn_attack_01_start_02` + 투사체(타격 `horn_attack_01_hit_02`); S3도 같은 나눔(근접 `horn_skill_03_start`/`_hit`, 원거리 `_start_02`/`_hit_02`);
  S2는 저지 중에도 BlockedRangedAttack(투사체 `projectile_chr_horn_s2_melee`)이라 나눔 없음. 고친 것: `char_modes.py`가 근접·원거리 능력이 둘 다 있는
  모드에 `fortress[mode] = { melee: {cast, hit}, ranged: {cast, hit} }`를 쓰고(号角·灰毫 2명, 다시 만든 `local-char-modes.json`·`modes.json`은 이 두 줄만
  늘어남), `fxgame.js boundFor`(`fxmap.js fortressEffects`)가 'swing'·'atk'의 kind(sim `ai.js`: 저지 중 'none')로 고른다 — 근접은 근접 목록만, 나눔이 있으면
  이름 규칙 대역도 없음. 테스트 `test/render/fortress-fx.test.js`. **배포 때 추출 이펙트(`modes.json`) 함께.** [화면 미확인]
  - 참고(sim 담당): 공식 S2는 저지 중에도 원거리(BlockedRangedAttack)인데 sim은 S2 중 저지하면 근접('none')으로 친다 — 렌더는 S2에 나눔이 없어 영향 없음.
- **위(余) S3 화염벽 배치** (제보: 불꽃이 타일 모서리에 붙어야 함 — → 보면 위의 오른쪽 모서리): 칸 가운데에 행 조각을 놓고 열 벽은 90° 돌렸었다.
  클라(디컴파일): 스킬 버프 이펙트 `yu_skill3_range_01_source`(YuS3EffectBehaviour `_effectEachGrid`, OnPlay RVA 0xCC2100)가 그의 줄(맵 전체 높이/너비)의
  칸마다 가운데에 `yu_skill3_range_01_root`를 만들고, root(YuS3EffectWithEdgeBehaviour `_InitPlayersIfNot` 0xCC2F70)가 조각을 칸 가운데
  + `SharedConsts.FOUR_WAYS[방향] × _offset`(0.4)에 둔다 — 위·아래 배치는 행 조각 `yu_skill3_range_01`(HorizontalEffectPlayer.EffectNeedPlay 0xCB0BC0:
  방향 0·2), 좌·우 배치는 화면 쪽 열 조각 `_r`/`_l`(VerticalEffectPlayer.IsWorldRight 0xCC1910: 카메라 x보다 오른쪽이면 `_r`), 줄 끝(다음 칸이
  `Map.CheckTileValid` 실패 또는 `tile_empty`, IsTileInvalid 0xCB02D0)에는 끝 조각도(`_L_end`/`_R_end`, 열은 `_l|_r` + `_U_end`/`_D_end`; 2초마다 다시 봄).
  고친 것: `fxgame.js yuWallPieces`(순수 함수) + `kitFx` 'firewall'(이름은 대소문자 무시 — 추출본은 `_R`). [추정] ① `FOUR_WAYS` 순서 = Direction(UP·RIGHT·
  DOWN·LEFT, 정적 생성자 값은 안 읽음 — 이름 순서와 제보가 맞음), ② 카메라 x = 필드 가운데 열, ③ 끝 = 필드 사각형 끝(빈 칸 모름). 테스트
  `test/render/yu-wall.test.js`. [화면 미확인]
  - 참고(sim 담당): 공식 투사체 차단선 `skchr_yu_3/Aura/EnemyAura`는 `_horizonOffsetFront` 0.5, `_horizonSize` 0.3(그의 칸 앞 모서리)인데 sim
    `crosses`는 그의 칸 가운데 줄로 판정한다.
- **오래 남아야 할 이펙트가 사라지거나 안 나옴** (제보: 첸 S3 자기 버프, 위 S3 화염벽 등): `fxgame.js`가 살아 있는 이펙트를 한 목록에서 24개
  (`fxplayer.js MAX_INSTANCES`)로 자르며 가장 오래된 것을 끝냈다 — 가장 오래된 것은 거의 늘 스킬과 함께 시작한 버프 루프·벽 조각이고, 공격자 몇 명의
  타격·시전이 1초 안에 24개를 채운다(로컬 아레나처럼 유닛이 적으면 안 보이던 이유). 입자 예산(6000)은 원인 아님. 고친 것: 짧은 것(타격·시전·궤적)
  24개와 오래 가는 것(버프, 끝이 없거나 5초 넘게 남은 것: `isLasting`) 48개(`MAX_LASTING`)를 따로 세어 각자 자기 종류의 가장 오래된 것을 끝냄
  (`liveOverCap`); 플레이어 자체 상한은 둘을 넘는 안전선(`PLAYER_CAP` 80). 위 S3 벽은 칸마다 2개 + 끝 2개(보스 필드 한 줄 44개)라 48. 테스트
  `test/render/fx-live-cap.test.js`. 성능(휴대폰)은 상한 숫자로 조정 가능 — 사용자 질문으로 남김. [화면 미확인]
- **望 바둑돌이 겹쳐 보임** (제보; sim 확인: 실제 매치 경로 m01–m04 × S1/S2/S3 × 배치 4 × 시드 4, 매 틱 두 돌이 한 칸에 없음): 돌이 跟子 칸으로
  돌아오면 sim이 같은 틱에 그 跟子를 `retreat`하는데(PRTS 铸子 备注, 2026-10-09 결정), 렌더는 跟子 뷰에 보통 죽음(쓰러짐 클립 ≥0.35초 + 페이드 0.55초)을
  틀어 돌아온 돌과 한 칸에서 겹쳤다. 클라에서 跟子는 투사체(`projectile_chr_wang_stone1/2/3`: `_mainEffect` 없음, 멈출 때 칸 이펙트를 지움
  `_clearEffectsOnTileOnStop` 1) — 쓰러짐·페이드가 없다. 고친 것: `app.js followerIds`('summon' fx `follower`)의 'die'는 다음 프레임에 뷰를 지우고 죽음
  입자도 없음. 날아가는 跟子와 칸 위 돌을 함께 그리는 경로는 없음(우리는 跟子 비행을 안 그림 — 공식도 `_mainEffect`가 없어 날아가는 그림이 없음).
  [추정·남김] 공식 跟子의 돌 그림은 `wang_passive_01_buff`의 `qizi (1)` 노드(클립으로 움직이는 렌더러 — 추출기가 못 옮김, 아마 스프라이트)이고 우리는 대신
  돌 토큰 모델을 그린다. 테스트 `test/render/wang-follower-exit.test.js`. [화면 미확인]

### 적 이펙트 바인딩 (2026-10-10, 관리자 결정 (2026-10-10))
근거: EN 클라 적 프리팹 `battle/enm_pfb_*.ab`, `[uc]projectiles.ab`, `config/buff_template_holder.ab`(버프 템플릿), 이펙트 번들 `pkgrps/btl_pfb_fx_enemy_*.ab`·
`battle/prefabs/effects/*.ab`(비공개 조사 기록 2026-10-10 「적 에셋」). 오퍼와 같은 형식: 루트 `_startEffect`/`_deadEffect`, UnitMode `_overrideStartEffect`/`_overrideDeadEffect`,
능력의 이미터(`_castEffects` + `_startEvent`/`_endEvent`/`_oneshot`, `_hitEffects`·`_inputTargetEffects`·`_castTargetEffects`, `_attachEffects`), `_projectileKey` +
`_mountPointType`, 버프 `overrideEffectKey`/템플릿 `effectKey`, 모델 점(Graphic `_muzzleTransform`·`_hitTransform`·`_headTransform`·`_specialPointN`).
- 추출: `tools/local-extract/enemy_bindings.py` → `tools/assets/local-enemy-bindings.json`(검토용, 적 249종·투사체 93개) + `public/assets/local/fx/enemy-modes.json`(렌더 표,
  git 제외) + `--extract`면 나오는 적(웨이브·보스·랜덤 편성 자리·소환, 167종)의 이펙트 프리팹 365개를 `fx_extract.py`로(번들 `pfx_enemy_N`·`common`·`lazerd` …, 목록은
  `enemy-index.json` — 오퍼 `index.json`은 그대로; `fxgame.js mergeIndex`가 합침). 이름은 대소문자 무시(적 프리팹은 `…_B_hit_01`, 번들 컨테이너는 소문자 [추정: 클라도
  소문자로 찾음]) — `enemy-modes.json $fx`(소문자 → [번들, 프리팹]). 적 점의 `at`은 스케일 0.01 가정 [추정: SkeletonDataAsset이 다른 번들], 뼈 이름은 그대로.
- 렌더(`fxgame.js` 「the enemies' official effects」): 모드 = 지금 클립 세트의 공격 클립이 그 모드 능력의 `_animKey`인 것(폼 전환이 바꿈), 없으면 0. sim 'swing' →
  공격의 ON_CAST_START 시전 이펙트(근접 타격 kind 'none' = `Combat` 능력, 사격 'enemy' = `Attack`), 'atk' → ON_SPELL_ON 것 + 투사체 `_mainEffect` 꼬리(마운트 점 →
  대상 hit 점, 비행 시간 = 거리 ÷ `data/enemies.json proj.speed`(폼별 `projModes`, sim이 그 속도로 날림; `proj` 없으면 sim 적 속도 10, `proj: null`·링크·즉발은 비행 없음), `_raiseHeight`면 호; 꼬리 없는 것·레이/링크형은 절차 구슬), 'dmg' →
  능력 hit 이펙트 + 투사체 `_effectsWhenHit`/`_effectsWhenReached`(≤ 2, `_useOwnerToTargetDirection`은 공격자 → 대상)와 대상에 거는 버프의 자기 이펙트 한 번 [추정: 버프
  지속 동안 유지가 공식], 'spawn' → 시작 이펙트(루트 `_startEffect`만 — 아래 「모드 전환」) + 「이펙트만 있는 버프」(템플릿 `empty`, 특성·CommonAbilities: 가상적: 갑주 `enemy_acstmk_buff_1` 등)
  루프 [추정: 태어날 때 붙음], 'die' → 사망 이펙트(그 자리; 아래 「사망 이펙트」), 'leak' → 루프 끝. 시전 이펙트는 능력 재생 속도, 타격은 1.0(위). 모드가 바뀌면 이전 모드의 루프 시전
  이펙트를 끈다(ON_DETACHED).
- 'dmg'의 공격자: sim의 'dmg' 튜플 6번째 = 공격자 unit id(无来源이면 null, docs/SIM.md)를 읽는다 — 공격자가 있으면 마지막 공격의 주인이 다를 때 그 공격의 타격으로 치지 않고, 그 적의 능력이
  3초 안에 쓰였으면 그 능력의 hit 이펙트를 그린다. 없으면(예전 sim) 예전처럼 대상에 대한 마지막 공격.
- 적 스킬·특수 행동: sim fx `enemySkill` { id, ability, n }(콘텐츠 스킬 시전 때 먼저)과 그 시전의 fx마다 실린 `ability`·`caster`(docs/SIM.md; `prefabKey`, 문자열 `skill`, 'skill' [id, on, prefabKey]도 받음) → 그 이름의 능력(`skills[소문자 이름]`: `Skills/<이름>`·
  하위 경로·마지막 이름) 시전 이펙트, 자기 버프/attach 이펙트('skill'이면 끌 때까지 — 끝 이벤트가 없으면 20초 [추정]; 'fx'면 한 번), `target`이 있으면 투사체 꼬리
  (공식 속도, 6초 넘는 비행은 안 그림)와 `_effectsToTargetWhenStart`. 그 능력을 바인딩한 적의 'fx'면 `standInOff`와 같은 종류(blast·zone·…)의 절차 대체물을 안
  그린다(`ownsFx`), `ownsSkill`은 스킬이 바인딩된 적의 금빛 기둥을 끈다(클라엔 없음). 또 모델이 바인딩된 스킬의 클립(`_animKey`: 'Revive', 'Skill_2' …, 공격 클립 제외)을
  시작하면 그 능력을 튼다(sim이 이름을 안 실어도 렌더가 보여 주는 그 순간; 같은 능력은 1초에 한 번).
- **콘텐츠 스킬 투사체** (2026-10-10 저녁): sim fx `enemyShot` { id, from?, tgt, key, move, speed, t }(`enemies/helpers.js shoot`, docs/SIM.md —
  `kinds.js` 'none')을 `fxgame.js eshotFx`가 그린다: 투사체 `key`의 `_mainEffect` 꼬리를 쏜 적의 `_mountPointType` 점에서(연쇄·튕김처럼 다른 유닛에서
  떠나는 홉은 그 유닛의 hit 점 [추정]) 대상 hit 점까지 sim의 비행 시간 `t` 동안(PARACURVE는 `_raiseHeight` 호, TRACE·FIXED_DIRECTION·HARPOON은 직선
  [추정: HARPOON의 늘어나는 선은 꼬리로 그림]), 떠날 때 `_effectsToTargetWhenStart`, 닿을 때 `_effectsWhenHit`/`_effectsWhenReached`(한 번). 투사체
  기록은 쏜 적의 바인딩에서, 없으면 모든 적의 바인딩에서 키로 찾는다. 닿는 순간(±0.6초)의 그 적 → 그 대상 'dmg'는 능력 자신의 hit만 그린다(투사체 것은
  닿을 때 이미 — 겹침 방지). `t` 0(ATTACH·속도 없음)은 비행 없이 바로 닿음. 꼬리가 뽑혀 있으면 sim이 그 사격 직전에 내는 절차 대체 'beam'
  (`SHOT_BEAMS`: 黑云 fireWeapon, 碎铳之簧 springBullet·springCombo, 管·弦 acdumlStrike·acdummStrike, 陷落雪祀 chainBuff)은 그리지 않는다
  [추정: 꼬리가 MAX_TRAILS로 밀린 사격은 대체 beam도 없이 착탄 이펙트만].
  지금 꼬리가 뽑혀 있는 것: 黑云 FireWeapon·碎铳之簧·管·弦. 凋零骑士·陷落雪祀·杰斯顿·迷路的巨像는 웨이브에 없어 안 뽑혀 있음(`--extract --all`이면 그려짐).
  `shoot`을 안 거치는 콘텐츠 투사체(迷路的巨像 StunAttack·蚀裂 사망 구름·枯朽战车 秽蚀轰击)는 `enemyShot`이 없어 안 그림 — sim이 `shoot`으로 바꾸면
  그대로 그려진다.
  - 직선(FIXED_DIRECTION) 사격 — 重弩突袭者 直击(`enemies/helpers.js lineShot`, docs/rules/sim.md 「FIXED_DIRECTION 투사체」): `enemyShot`에 `dir` [dx, dy]
    (보드 축: +x 오른쪽 열, +y 위 행)·`range`(타일)가 붙고 `tgt`/`t`는 예측한 첫 충돌(아무도 없으면 `tgt` null, `range` = 속도 × 수명). 꼬리는 쏜 점에서
    `dir`로 `range`만큼 `t` 동안 직진(높이는 출발 높이 그대로 [추정]); 맞음 이펙트는 착탄 시각에 미리 그리지 않고 sim의 실제 'dmg'(그 능력의 hit + 투사체
    hit, eskillHit)로.
- **萨米的意志 冰凌** (2026-10-10 저녁, sim fx `column` { x, y, c, id, key, sub, r0, dir, speed, dist, life } — 타격 때 한 번, docs/rules/sim.md
  「萨米的意志 冰凌」): `fxgame.js ecolumnFx`가 칸마다 그린다. 본 투사체 `projectile_enemy_smdeer`(`_mainEffect` 없음 — 있으면 열을 따라 그 꼬리)가 행 `r0`에서
  `dir`로 `speed`에 내려가며 k·`dist` 칸에 하위 투사체 `projectile_enemy_smdeer_2`를 k·dist/speed 초에 놓는다 → 그 칸에 하위 투사체의 `_mainEffect`·
  `_effectsWhenReached`(`enemy_smdeer_attack_01_hit`; AttachToTarget `_immediatelyReach`라 놓일 때 [추정: 닿음 이펙트가 놓이는 순간 남]). `_effectsWhenHit`은
  그 칸 아군의 'dmg' 몫(지금 하위 투사체엔 없음). 하위 투사체 기록은 `enemy_bindings.py`가 렌더 표 `proj.sub` [{ key, trail?, hit?, reached?, life }]로 싣고
  추출 대상에 넣는다. 공식 이펙트가 하나도 안 뽑혀 있으면 fx.js 절차 기둥을 칸마다 그 칸이 맞는 시각(k·dist/speed + `life`)에(`createFxLayer({ standIn })`
  — 예전: 열 하나에 기둥 하나를 바로), 품질 'low'에서도. 그린 필드(`fieldRect`) 밖 칸은 건너뛰고 시각은 그대로. `r0` 없는 예전 모양의 `column`은 fx.js 그대로.
  보스의 'swing'(kind `none`, 'atk' 없음)은 그 모드 원거리 부분의 ON_CAST_START 시전 이펙트(`enemy_smdeer_attack_01_range`·`_start`)를 그대로 튼다.
- **버프의 선 이펙트(`CreateLineEffect`)** (2026-10-10 저녁): 클라 코드 `Nodes.CreateLineEffect.Execute`(RVA 0xB91190) — 이펙트를 `_targetType`(버프 주인)에
  만들고 그 안의 `LineEffectEmitterDynamic`에 시작 주인 = `_sourceType`(버프 출처), 끝 주인 = 대상을 넣음; `LineEffectEmitterDynamic.Update`(0xCA0600) →
  `_UpdateMountPoint`(0xCA26C0): 매 프레임 각 LineRenderer의 점 0 = 시작 주인의 `_startMountPointType` 점 + `_startPosOffset`, 점 1 = 끝 주인의
  `_endMountPointType` 점 + `_endPosOffset`(`_tweenEndPosition`이면 `_tweenDuration` 동안 시작에서 보간), `_TryUpdateEffects`(0xCA1830)가 `_startEffect`/
  `_endEffect`를 두 끝에 둠. 프리팹 값(`fx_extract.py line_dynamic` → 이펙트 JSON `lineDyn`): 가상적: 갑주 `enemy_acstmk_attack_line` = 시작 SPECIAL_0(눈),
  끝 HIT, 시작 이펙트 `enemy_acstmk_attack_start`, `_finishIfBuffNotExists` + `_buffKeyForFinish` `acstmk_line_effect`, `Effect._delayToFinish` 0.5.
  버프 `acstmk_line_effect`는 그 적의 `_activeBuffs`: 원거리 Attack = lifeTimeType LIMITED `lifeTime` 5, 근접 Combat = IMMEDIATELY(시작하자마자 끝 → 선이
  번쩍하고 0.5초에 사라짐) — `enemy_bindings.py` 버프 기록 `life`(LIMITED 초, IMMEDIATELY 0), 렌더 표 `part.line` [{ fx, life? }]. 렌더(`fxgame.js
  elineFx`/`stepLines`, `fxplayer.js FxInstance.setLine`): 그 공격이 대상을 맞히면('dmg') 선을 대상에 만들고 매 프레임 두 점을 다시 놓음; 버프 끝(마지막
  타격 + `life`) → 0.5초 더 그린 뒤 멈춤(`_delayToFinish`), 대상 사망·출처가 사라짐 → 바로 끝; `life` 없음(무한) → 프리팹 길이 [추정]. [추정: 버프는 공격의 타격 때 붙음(`_activeBuffs`
  적용 시점 코드는 안 읽음); 버프가 있을 때 다시 맞으면 연장(maxStackCnt 1); 오프셋 y는 높이로]. 炎佑 `enemy_acloon_skill_loop_1_line`(模式甲 Skill)은 우리가
  模式乙만 써서 안 나옴. 선 프리팹은 아직 안 뽑혀 있다 — `enemy_bindings.py --extract`를 다시 돌려야 보임.
- **모드 전환** (2026-10-10 저녁, 디컴파일): 적에게는 UnitMode `_overrideStartEffect`가 쓰이지 않는다. 태어날 때 `Enemy.States.BornState._PlayAnimation`
  (0x73C6F0)이 `Enemy.get_startEffect`(0x733ED0 = 루트 `_startEffect` 필드 그대로)를 만들고, 그 override를 읽는 코드는 `Character.GetStartEffect`(0x6F74B0,
  오퍼·토큰)뿐(`Unit.get_currentMode` 호출처 18곳 확인). 모드 전환 `Unit.SwitchMode`(0x76E1D0) → `InactiveMode` → `ActivateMode`(0x766E20: 새 모드
  GameObject 켜고 능력 Attach) → `OnSwitchMode`(`Enemy.OnSwitchMode` 0x727200: 스킬 Detach/Attach, `Unit.OnSwitchMode` 0x76C810: 상태 기계 재시작 +
  `BuffContainer.OnUnitSwitchMode`)에도 이펙트 생성이 없다. 그래서 렌더는 태어날 때 루트 시작 이펙트만(이전: 모드 override 우선 — 우리 표에 override를 가진
  적은 없어 화면 차이 없음), 모드 전환 때는 이전 모드 루프 시전 이펙트 끄기만. 그 순간 `audio.enemyMode?.(unitId, defId, mode, prevMode)`를 부른다(3차 계약
  1; `app.js`가 `opts.audio`를 `createFxLayer({ audio })`로 넘김; 모드 판정은 품질 'low'에서도).
- **사망 이펙트** (2026-10-10 저녁, 디컴파일): `Enemy.get_deadEffect`(0x730300; `DeadState._PlayAnimation` 0x73F3D0이 조건 없이 만듦) = 지금 모드의
  `_overrideDeadEffect`, 없으면 루트 `_deadEffect`, 그것도 없으면 `common_enemy_die_01`. 렌더 표 `dead`의 기본값이 `common_enemy_die_01`(`enemy_bindings.py`,
  적 210종), 렌더도 같은 순서. 공식 사망 이펙트가 그려지면(`fxgame.js ownsDeath`) `app.js`가 fx.js의 절차 사망 퍼프를 안 그린다(`common_empty` 19종은
  아무것도 안 보임 — 공식대로). `common_enemy_die_01`은 아직 안 뽑혀 있음 — 그 전에는 절차 퍼프 그대로.
- 위 클래스·메서드는 켜진 Lua 핫픽스(`DefinedFix.lua` en_US·zh_CN)에 없음.
- 안 한 것: 버프 노드의 다른 이펙트(방패 깨짐·끝 이펙트 — 클라 코드에서 언제 나는지 안 읽음), 炎佑 선(우리가 안 쓰는 模式甲), 나오지 않는 적 82종의
  이펙트(`--extract --all`), 소리(audio 담당). 화면 확인 없음.
- 확인: `test/local-patch-fxspawn.test.js`(적이 바인딩한 muzzle/특수점 이펙트가 그 적의 점을 찾음 — 클라 데이터의 빈 곳 2개 목록), `test/render/enemy-fx.test.js`, `test/render/enemy-fx-layer.test.js`(모드 전환 → audio.enemyMode, 사망 이펙트 대체, 대체 beam, 冰凌 칸별 시각, 직선 사격).
