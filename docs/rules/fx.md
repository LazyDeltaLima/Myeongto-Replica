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
  (`fxmap.js`, [추정]; 클라는 charpack의 발생기·버프·투사체로 묶는다 — 지금은 `modes.json` 바인딩이 대부분을 대신하고 이름 매핑은 바인딩 없는 경우의
  대체, 2026-10-11 배치 `_startEffect`·클립별 묶음도 바인딩으로 — 아래 「입력 대상·루프 타격·클립별 이펙트·배치 이펙트」). 해당 오퍼레이터가 행동하기 전에는
  아무것도 받지 않는다(2026-10-11부터 배치 이펙트는 배치 때). 품질 '낮음'이면 끈다.
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
    클라이언트에 전용 번들이 없는 2명(엑시아 `char_103_angel`, 盟约·辅助干员 `char_616_pithst`)은 절차 이펙트 그대로였다(2026-10-21 다른 번들에서 `--pack` — 아래 「다른 번들의 바인딩 프리팹」).
    Chrome 일괄 점검(124명 × 스킬 372개, 페이지 오류 0): 바인딩 시전 이펙트가 있는 187개 중 156개 재생(나머지는 측정 창 2.6초 안에 공격이
    없거나 시뮬레이션에서 스킬이 공격 전에 끝나는 경우). 이 추출로 두 가지를 고쳤다 — ① 자기 스킬 이펙트가 번들에 없는 스킬(저티어 S1 다수: 공식은
    추출 안 된 공용 버프 이펙트)은 발동 표시가 아예 없어졌다 → `ownsSkill`이 그 스킬에 공식 start/buff/모드 이펙트가 있을 때만 참(아니면 절차 금색
    빛기둥), ② 모드 바인딩 없는 스킬의 지속 범위(사리아 `skgoat_skill_01_range`): `fxmap.js effectsFor('skillBuff')`에 `…_range(_0N)` 1개 추가, 모드
    `attach`와 합쳐 중복 없이 한 번.
  - 추출 범위: 바인딩된 이펙트 241개 중 69개가 추출본에 없었다(예전 추출이 스킬 일부만) → 16개 번들(nearl2 siege2 whitw2 blaze2 angel2
    sbell2 dusk yu cello aglina rosmon titi pepe mlynar lemuen pasngr)을 기본 스킨 전체로 다시 추출(`fx_extract.py --bundle …`, 19→25MB). 남은
    3개는 aglina가 다른 번들(`glassb_*`, `common_magic_trail_01`)을 씀(2026-10-21 `--pack`으로 넣음).
  - `stats().recent`(최근 시작한 프리팹 24개)를 `/debug.html` 로그가 「✦ 이펙트 재생」으로 보여 준다.
  - 모드 버프 이펙트 `attach` (2026-10-07 관리자 제보): 모드의 Talents 능력이 거는 버프의
    `overrideEffectKey`(丰川祥子 S3 `oblvns_s_3[eff]` → `oblvns_skill_03_range`)를 `char_modes.py`가 모드별 `attach`로 뽑고, `fxgame.js`가 그 스킬이
    켜져 있는 동안 오퍼레이터 아래 층에 버프로 띄운다(스킬 끝에 멈춤). 공격이 대상에 거는 버프(`_activeBuffs`)는 넣지 않는다. 모드 능력이 붙이는
    이펙트도 같다: 시전기의 `_attachEffects`와 능력의 `_effects` 목록(비르투오사 S3 `GeneralAbilities` → `cello_skill_03_buff_01`·`_front_02`·
    `_buff_range`, 阿斯卡纶 S3 `ascln_skill_03_range_01` — 관리자 제보). 기본 모드(0)의 `attach`는 아래 「기본 모드 attach」(2026-10-21).
  - 검은 사각형 (2026-10-07 관리자 제보): 이펙트 층은 페이지 위의 투명 캔버스인데
    `premultipliedAlpha: false`라, 가산(Additive) 재질도 캔버스 알파를 쌓았다 → 알파 없는(검은 바탕) 텍스처가 검은 사각형으로 합성되고, 밝은
    글로우도 아래를 살짝 가렸다. 캔버스를 premultiplied로 바꾸고(`fxgame.js`) 재질의 알파 채널 블렌드를 따로 지정(`fxplayer.js makeMaterial`:
    가산 = 알파 그대로(Zero, One), 알파 블렌드 = premultiplied over(One, OneMinusSrcAlpha)). 추출본 604개 중 가산 + 알파 없는 텍스처 155개가 해당.
    불투명 캔버스(벤치)의 그림은 그대로 — 픽셀 비교(GPU Chrome) 604개 × 4프레임 차이 0. 알려진 빈 곳: 望의 연결선
    `token_wang_passive_01_line`은 LineRenderer 3개라 추출기가 지원하지 않아 아무것도 안 그린다(양 끝을 코드가 바둑알 위치로 정함 — 별도 작업;
    2026-10-22 「추출기가 못 읽던 모양」에서 줄 양 끝에 놓음).
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
    (2026-10-21) 시전자와 같은 편 대상(적이 오퍼레이터에게 준 피해), 'dmg' 6번째 칸(공격자)이 시전자 아닌 다른 오퍼레이터인 피해도 가로채지 않는다 —
    공격자가 시전자·그 소환물(维什戴尔 그림자 `token_10035_wisdel_wward` 등: 소환 관계는 스냅숏에 없어 오퍼레이터만 거름)·무출처(null)면 받는다. 골든 전
    수에서 가로챈 피해의 대부분이 다른 오퍼레이터·적의 것이었다(이벤트 골든의 `- spawn … → ally` 줄, 塑心 S1·夕 S1 등의 `→ enemy` 일부가 빠짐). 공격자를
    시전자와 똑같이 맞추면 소환물·무출처 피해까지 빠졌다(10-21 첫 시도).
  - **4방향 회전**: `_useFourDirectionalFace: 1`인 이펙트(풀 12명: 野鬃 S2 start 등, `modes.json turn`)는 좌우 반전 대신 프리팹의 `rotation_z`를
    유닛 방향으로 돌린다(RIGHT 0° / UP 90° / LEFT 180° / DOWN 270°, 첸 S3 검기와 같은 `aimMover`). 좌우는 지금 그려진 방향(visFacing).
    `_directionType`의 방향별 사본(위·아래 배치)은 아직 기본 사본만 [남음].
  - **키트 이벤트** (`fxgame.js kitFx`): 余 S3 'firewall' → 벽이 지나는 줄(`fx.js wallTiles`, `app.js` `fieldRect` 옵션 1줄)의 칸마다
    `_root` + 앞 모서리 조각(2026-10-10 디컴파일로 공식 배치 — 아래 「위 S3 화염벽 배치」), 스킬이 끝나면 멈춤;
    'firewallBlock' → `yu_skill3_annex_01`. 르무엔 S3(S3 장착일 때만 — S2 조준도 같은 'lock') 'lock' → 대상에 `crosshair_02`(그 대상의 포탄이 떨어질 때까지,
    잠금 순서 = 착탄 순서), 'bombardShell' → `trail_02`를 착탄 지점(바닥)에 돌리지 않고 그대로 틂 — 떨어지는 모양은 프리팹 자체 클립(`pos` 노드 y 7.27 → 0.31, 0.27초,
    `static_offset` X −30° 안이라 30° 카메라에서 화면 수직)이고, 공식 포탄 투사체도 이동 없이 `_lifeTime 0.25` 뒤 도착하는 정지 투사체다
    (관리자 제보 2026-10-22: 예전 「3칸 위에서 수직 낙하」는 루트를 90° 돌린 채 클립의 낙하와 겹쳐 45°로 비스듬히 날아왔음), 'bombard' → `hit_01`. 셋 다
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
    2026-10-10부터 그 'zone' 자리에서 틀고 2D 원은 안 그린다 — 아래 「시전 이펙트 시점·붙는 대상」 ③. 异客 폭풍도 2026-10-16부터 공식 장판(아래 「패신저 S3 폭풍·낙뢰」). ③ 스킬 발동 금빛 기둥·육각(`fx.skill` burst)·`_aura`: 자기 시작·버프
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
  (2026-10-12: 가로 위치는 들린 점 자체의 투영으로 푼다 — 원근 카메라에서 화면 끝일수록 어긋났다. `docs/rules/render.md` 「모델 점 위치·임포스터 상자」)
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
    표에 없는 유닛(적, 근접 모델의 muzzle, 표 없음)은 예전대로 바닥. 본 회전(`followBoneRotation`, 3은 회전 포함·6은 없음)은 적용 안 함 [추정: 프리팹의 `fixed` 자식이 세워진 채] — **2026-10-22 고침**: 3은 만들 때 점의 회전을 받는다(아래 「붙는 자리 — 한 번 놓기·`_holdByOwner`·총구 회전」).
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

### 붙는 자리 — 한 번 놓기·`_holdByOwner`·총구 회전 (2026-10-22, 디컴파일 확인, 관리자 아레나 확인 「엑시아 총구 화염이 총구가 아니라 총기 위」)
- 근거(클라 코드, EN 10-14 덤프): `Effect._InitLocationFromEntity`(RVA 0xE7AF80)는 이펙트를 만들 때 **한 번** `_spawnLocation`의 점에 놓는다.
  3 MUZZLE_POINT는 `muzzleMountPoint` 위치에 놓고 그 Transform의 회전(`get_rotation`)도 준다. 이 점에는 BoneFollower가 붙어 있고, `rot 1`이면 본과 함께 돈다.
  끝에서 `_holdByOwner`(루트 ParticleEffect)면 `Entity.HoldEffect`(0x3A1CB90)가 이펙트를 유닛의 `effectTransform` 아래로 옮긴다
  (`SetParent`, 월드 자리 유지). 그 Transform은 `Unit._effectTransform`(0x1A0)이고, 엑시아 캐릭터 프리팹에서는 루트의 `Effects` 자식이다(모델·본 아래가 아님).
  그래서 붙들린 이펙트는 만든 자리에서 유닛과 함께 움직이고, 본을 따라가지 않는다. 붙들리지 않은 이펙트는 그 자리에 남는다.
  매 프레임 점을 따라가는 것은 FollowMountPoint뿐이다(위 「이펙트 방향」 마운트 회전).
- 우리는 2026-10-08부터 모델 점(2·3·4·8~)에 놓인 이펙트가 마운트 없이도 매 프레임 그 점의 본을 따라갔고, 3의 회전은 받지 않았다. 그래서 엑시아
  (`angle_attack_01_start`: 3, `_rotateType` 0) 총구 화염이 왼쪽을 볼 때도 원래 그려진 오른쪽으로 뻗어 총기 몸통 위에 겹쳤다.
  → `fx_extract.py`가 `_holdByOwner`를 `face.hold`로 옮기고(1,409개), `fxgame.js placedAt`이 처리한다. 마운트 없는 모델 점 이펙트는 첫 읽기(만들 때)의 점에 고정한다.
  `hold`이면 그 뒤 유닛 자리의 움직임만큼 따라간다. 3이면 그때 점의 회전(`fxpoints.js pointTurn`)을 루트에 준다.
  우리 모델은 화면 배율로 좌우를 뒤집으니, 왼쪽으로 그려진 모델은 거울 각도 π − θ로 준다. 클라는 스켈레톤 안에서 뒤집어 본 각도 자체가 거울이고, 이펙트는 뒤집지 않는다.
  6 MUZZLE_POINT_WITHOUT_ROTATION은 회전이 없다.
- 범위(추출물): 마운트 없는 모델 점 이펙트 — 2 HIT 616(붙들림 82), 3 MUZZLE 40(5), 4 HEAD 25(22), 특수점 30(23). 표가 있는 오퍼레이터·토큰에만 해당한다.
- **모든 자리·버프** (2026-10-22, 이펙트 묶음 G 나머지, 디컴파일 확인): `_InitLocationFromEntity`는 `_spawnLocation` 0~25 갈래(발·몸·머리·바닥 포함)가 모두
  같은 끝(0xE7BC34: `_overwriteHeight` → `_holdByOwner`면 `HoldEffect`)으로 모인다 — 표 없는 유닛(적, `SPAWN_FRAC` 높이)과 발·바닥 이펙트도 만들 때 한 번 놓이고
  붙들릴 때만 따라간다. 다만 **버프 이펙트는 늘 붙들린다**: `Entity.AddBuffEffect`(0x3A16C10)는 `CreateEffect` 뒤 `HoldEffect`를 안에 품고 있다(같은 핫픽스 칸
  `__Hotfix0_HoldEffect` 0x6E8 검사 → 가상 76 `effectTransform`에 `SetParent`). 그래서 적에게 거는 디버프(이네스 S1 `ines_skill_01_debuff_01`, 스펙터 디 언체인드
  `ghost2_beidong_buff_02` — `hold` 없음)도 걷는 적을 따라간다. 따로 있는 `FollowOwner`·`FollowOwnerRootTileHeight` 스크립트(이 풀에 없음)도 기본이 「안 따라감」임을 보여 준다.
  → `fxgame.js lifted(v, def, buff)`: 마운트·`hold`·버프가 아니면 `placedOnce`(첫 읽기 자리에 고정), 모델 점은 `placedAt`의 `hold`에 버프를 더함. 버프 = `play`의
  `buff`, 상태 이펙트(`playStatus`), `spawn`의 `entry.buff`(적 오라 등). 시전·타격·뒷면 사본(`SwitchableBackEffect`는 `CreateEffect`)·버프 끝 이펙트는 붙들림대로.
  보이는 차이: 걷는 적 위의 타격·시전 이펙트(`hold` 없는 것)가 적을 따라 미끄러지지 않고 맞은 자리에 남는다. 확인: `test/render/fx-face-switch.test.js`(소스 고정). [화면 미확인]
- 확인: 단위 `test/render/fx-follow-direction.test.js`(소스 고정, 추출물 `hold`). 아레나(Windows Chrome, 수정 전·후, 3배 확대 16장씩).
  엑시아 S1 왼쪽 배치: 전에는 화염 줄기가 총기 위였고, 뒤에는 총구 끝에서 별 모양 섬광이 왼쪽으로 뻗는다. 오른쪽 배치는 전·후 같다.
  첸 S2처럼 숨는 동안 본이 멀리 가는 버프는 다시 만든 자리(배치 링 안)에 남는다 [화면 미확인]. 상태 이펙트(`buff_stun` 머리, 붙들림)는 머리 본의 숨쉬기를 더 따라가지 않는다 [화면 미확인].

### 캐릭터 그림의 기울기 — 유닛에 붙는 이펙트는 X축 −30° (2026-10-22, 관리자 제보 「머드락 보호막처럼 원형으로 그려지는 보호막이 타원형」)
- 증상: 머드락 재능 보호막 `mudrok_buff_0N_start`, 적 머드락 `enemy_mdrock_*`, 엑시아 더 뉴 커버넌트 S2 `angel2_skill_2_buff_01/02`의 원판이 화면에서 타원.
  셋 다 `_spawnLocation` 1(FOOT)이고, 보호막은 노드 XY 평면의 납작한 구·원뿔 메시다(스킬 평면 위 0.57). 기울이지 않으면 판에 누워, 전투 카메라에서 높이÷폭이
  줄마다 0.78–1.08이었다.
- 클라 코드(디컴파일 2026-10-22): `Effect._InitLocationFromEntity`(RVA 0xE7AF80)는 `_spawnLocation` − 1로 분기해 위치와 함께 **회전**도 정한다.
  1 FOOT = `graphicFootTransform`의 회전, 2 HIT·4 HEAD = `graphicTransform`의 회전, 3 MUZZLE = 마운트 점 Transform의 회전, MP_SPECIAL = `_SetPosAndRotToMountPoint`.
  0 NONE·6 MUZZLE_POINT_WITHOUT_ROTATION은 단위 회전이고, 5·7 GROUND_CENTER·17 TILE_CENTER는 엔티티·타일 자체 회전이다.
  Spine 유닛에서는 `Unit.get_graphicFootTransform` → `UnitAnimator.get_graphicFootTransform`이 `graphicTransform`, 곧 `Graphic`을 돌려준다.
- 클라 데이터: `Graphic`의 회전은 X축 −30°다(쿼터니언 (−0.2588, 0, 0, 0.9659)). 확인한 것은 오퍼레이터 `charpack/char_311_mudrok.ab`·`char_1041_angel2.ab`,
  적 `enm_pfb_18.ab` `enemy_1511_mdrock`, 토큰·왕(render 연구 2026-10-17). 프리팹 쪽 근거로, FOOT 33개·HIT 48개는 루트 가까이에 X +30° 노드가 있다.
  바닥에 눕거나 똑바로 서야 하는 부분을 되돌린 것이다. GROUND_CENTER 20개는 X −30° 노드로 스스로 기운다.
  `fixed` 자식은 이름 그대로의 처리가 없고(문자열 참조는 Sirenix뿐), ANY_DIR의 `MapUtil.FaceTo2d`는 `localRotation`이라 기울기 안쪽에서 돈다.
- 적용: `fxplayer.js FxInstance` `tilt`(Unity 프레임 안의 회전 그룹)와 `fxpoints.js GRAPHIC_TILT`·`takesGraphicTurn`(FOOT·HIT·HEAD·MUZZLE·MP_SPECIAL,
  `_keepOriginRotation` 0 FollowMountPoint는 모델 점일 때)을 쓴다. `fxgame.js`는 유닛 위에서 만드는 곳(시전·명중 `play`, 상태 `playStatus`, 버프 끝 `playOnce`,
  SwitchableBackEffect, 키트 `spawn`, 아레나 `debugPlay`)에서만 `tiltOn`으로 준다. 판 위 지점(바둑돌 `playAt`, 꼬리, 음표, RandomEmitter 사본)에는 주지 않는다.
  월드 공간 입자·꼬리는 기울지 않는 Unity 프레임에 남는다(Unity와 같음). 마운트 회전(`pointTurn`)은 기울기 안쪽에서 돈다.
  그래서 「이펙트 방향」 절 [추정]의 돌리는 축 차이는 없어졌다(클라 점 회전 = `Graphic` × 본). 니어·아르케토 화면 확인은 그 절대로 남는다.
- 안 한 것: MUZZLE·MP_SPECIAL 점 자체의 고정 회전(예: 엑시아 더 뉴 커버넌트 `SpecialPoint1` z 약 167°)과 본 회전(`followBoneRotation`이 없는 점)은 여전히 안 받는다.
  (본을 따라 도는 Muzzle 점의 회전은 2026-10-22부터 받는다 — 「붙는 자리 — 한 번 놓기·`_holdByOwner`·총구 회전」.)
  바둑돌(`playAt`)은 이 규칙 밖이다(그 프리팹 `qizi (1)`이 스스로 X −30°).
- 확인: 단위 `test/render/fx-graphic-tilt.test.js`(분기표, 기울기 축, 전투 카메라에서 원판이 모든 줄에서 원(±1%), 추출 보호막 셋이 FOOT, `fxgame.js` 전달 자리).
  이펙트 이벤트 골든 143개 변화 없음. 아레나 전·후 캡처(Windows Chrome)에서 머드락 재능 보호막과 엑시아 더 뉴 커버넌트 S2 보호막이 타원에서 원이 됐다.
  아르케토 S3 부채꼴은 거의 같고, 대상 명중 고리는 둥글어졌다. 적 머드락 보호막은 아레나 샌드백에 안 나와 [화면 미확인].
- 앞뒤 판정은 기울기 전 프레임에서 한다(2026-10-22, 관리자 제보 「비르투오사 S3·뮤엘시스 S3 버프 이펙트가 오퍼레이터를 가림」).
  'high'의 앞뒤 나누기(`FxInstance` split: `wrapsUnit`의 WRAP_H, `aheadOf`의 AHEAD_Y)는 기울기 없는 프레임에 맞춘 값이다.
  기울인 채 판정하자, 그림 평면의 order 0 배경판이 0.6–0.9 높이로 서서 「유닛을 감싸는 돔」으로 잡혀 앞에 그려졌다.
  예: 뮤엘시스 S3 `bg_wave_01`, 비르투오사 S3 `guihun`, 엑시아 더 뉴 커버넌트 S3 `BG_darkglow`.
  전체 추출 프리팹 111개의 렌더러가 기울기 전과 다른 층에 갔다.
  지금은 판정하는 동안만 기울기를 풀고, 판정이 끝나면 되돌린다. 그래서 기울기 유무로 층이 바뀌는 렌더러는 0개다.
  치우바이 S3처럼 결이 가는 텍스처(`trail_148`, 불투명 16%)는 앞으로 와도 덜 가렸다. 확인: `fx-graphic-tilt.test.js`의 배경판 경우.
- 메시 입자의 수명 중 회전은 x·y도 돈다(2026-10-22, 관리자 제보 「맹약 서포터 등 낮은 티어 오퍼레이터의 공용 자가 버프 이펙트가 기울기 커밋 뒤 틀어짐」).
  스킬 발동 버프 `common_ignite_attack`·`_support`가 그 이펙트다. 클라 경로도 기울기를 받는다(디컴파일 2026-10-22).
  `Entity.AddBuffEffect`가 `BattleController.CreateEffect`(0x3972800)를 부르고, 이것이 `Effect.Play`를 거쳐 `_InitLocationFromEntity`에 이른다.
  FOOT는 가상 슬롯 0x3c(`graphicFootTransform`)의 회전을 `set_rotation`으로 넣는다. 머드락 보호막과 같은 길이다.
  휘감는 띠 `liangsechaorao`·`huangsechaorao`는 메시 입자다(`Cylinder001`, z로 두께를 준 220° 호, 정렬 Local).
  기울이면 호의 평면이 시선과 나란해져 선으로 보인다. 시작 회전 y ±60°는 시선 축으로 돌아 X자가 된다.
  기울이지 않은 예전 모습은 몸을 감싸는 닫힌 고리였다. 관리자가 준 공식 화면 녹화(비공개, 맹약·서포터 오퍼레이터 S1)는 둘 다 아니고, 휘어진 열린 호가 몸을 가로지른다.
  빠진 것은 `rotOL`의 x(초당 30–90°)였다. 재생기가 z만 더해, 선으로 보이던 띠가 수명 동안 열리지 않았다.
  지금은 `fxplayer.js`가 x·y도 오일러에 더하고(Unity `angularVelocity3D` → `rotation3D`) 띠가 휘어진 호로 열린다. 기울기는 그대로다.
  영향: 축별 `rotOL` x·y가 있는 메시 입자(렌더 모드 4) 프리팹 116개. 모드 0·1(빌보드·늘인 빌보드)은 셰이더가 z만 써서 그대로다.
  남은 차이 [화면 미확인]: 같은 순간에 보이는 호가 공식(1–2개)보다 많다(2–4개). 원인은 안 봄.
  확인: `fx-graphic-tilt.test.js`의 수명 중 회전 경우(수정 빼면 실패). 아레나 확대 캡처로 기울기 전·지금·고친 뒤를 녹화와 비교했다.

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
  생겨 이전 파일로 둠 — 내장 Quad 재추출은 텍사스 디 오메르토사만 하기로 한 결정, 아래 「텍사스 디 오메르토사 S2 발동·S3 검우」). 2026-10-17 전체 재추출로
  그 `bg_01`도 들어옴(아래 「추출 누락 보고 — fx_coverage」).
- **전체 적용(관리자 결정 2026-10-08 「전체 적용」·「켜줘」)**: `fx_extract.py --mount-only`(d1046024)가 추출된 프리팹 JSON에 `mount`만 넣는다 — 재추출하면 내장 Quad
  같은 다른 변화가 섞이므로. 전 번들: 마운트 프리팹 359개(93 번들), 파일 354개 변경(ghost2 5개는 이미), `mount` 외 키 변화 0. 자리가 바뀌는 것 174개(49 번들 — 텍사스 디
  오메르토사 `buff_02_start`, 무에나, 비질 등). GeneralAbilities 버프 바인딩도 전원(78e4c4fa) — 7명(크루스 더 킨 글린트·라플란드 더 데카덴차·아스트젠 더 라이트체이서·
  락락·미니멀리스트·울피아누스·티피) 바뀜(목록은 비공개 조사 기록). 알려진 빈자리: 비즈왁스 S2 `beewax_skill_02_buff_01`(마운트 특수점 0,
  모델에 없음 — 공식은 멈춤, 우리는 바닥). **이상한 위치가 보이면** 그 프리팹 JSON의 `mount`를 빼거나 `fxgame.js lifted()`의 `mountSpawn(...) ??` 한 줄을 되돌린다.
- **대역(替身)의 파란 이펙트**(관리자 제보 2026-10-08, dc4a7e97 → 공식 녹화로 정정 e453cbdb): 바인딩 `attach[Stand]`는
  있었지만 스킬 모드가 아닌 모드의 attach를 트는 곳이 없어 한 번도 안 나왔다. 첫 수정은 둘 다 대역에 계속 틀었는데, 관리자 녹화(프레임 대조)와
  관리자 제보로 정정:
  - 파란 소용돌이·물보라 = 대역 등장 `[switch2stand]/StandBorn` `_castEffects` `ghost2_birth_01_start` — 1회(공식 약 0.4~1.4초). `char_modes.py` `dollBorn`.
  - 3×3 원형 = `Talents/-1` 버프 `ghost2_standin[switch]`(대역 상태 버프)의 `beidong_buff_01` — 대역 동안. 레거시 `Animation` 클립이 메시 3개를 0.3초에 나타나게만 한다(2026-10-14부터
    읽음 — 아래 「흐르는 텍스처」 3차).
  - `beidong_buff_02`는 `Talents/1`(拥抱自我, `_targetOptions.targetSide 2` = 적 대상) 버프 이펙트 — **적에게 붙는 것**이라 대역 본인에게는 안 튼다. `char_modes.py` `attachFoe`.
  - `fxgame.js dollFx`: fx `substitute`에 dollBorn 1회 + Stand 모드 attach − attachFoe 반복, `swap`·`dollEnd`에 끔. 아레나·실제 솔로 판: 전환 순간 본체에 소용돌이 약 0.6초, 3×3 원형 유지.
    알려진 빈 곳: `beidong_buff_01_end` 안 틂; (3×3 원형 메시의 왜곡 텍스처 흐름 컴포넌트 = `FxUVTweener`, 2026-10-14부터 읽음 — 아래 「흐르는 텍스처」)
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
  (2026-10-10 고침 — 전에는 보는 방향의 칸; 지금 그 묶음은 0개). 빈 칸·enum 밖 값은 안 틂. 좌우 사본이 따로 있는 묶음에서 고른 사본은 다시 뒤집지 않음 — 2026-10-11 디컴파일 2라운드로 확정: 그 사본 3쌍(백파이프 S2/S3 `_left`/`_right`, 불피스폴리아 S2 `_left`/`_right_folder`)의 프리팹은 모두 `_rotateType 0`이고 클라 `ParticleEffect.FaceTo`(RVA 0xCB1DC0)는 0을 뒤집지 않는다. 근거는 「사본이라서」가 아니라 프리팹의 `_rotateType` — 2026-10-11부터 이 예외는 따로 두지 않고 공식 규칙으로 흡수(아래 「좌우 거울·재생 속도·루트 지연」; `unflip`은 `face` 기록이 없는 옛 추출물에만 남음). 사본 프리팹은 이미 전부 추출돼 있었다(재추출 없음).
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
- **FollowDirection** (2026-10-22, 디컴파일 확인): 루트에 클라 `FollowDirection`이 있는 프리팹(운영자 183·적 89, 대부분 스킬 버프 —
  `fx_extract.py follow`)은 재생할 때(`OnPlay` RVA 0xE81060 → `UpdateDirection`, 재생 방향을 덮음)와 그 뒤 매 프레임(`Update` 0xE812F0, `_onlyFollowOnPlay`면
  안 함) 주인(`Behaviour.owner`)의 방향으로 `Effect.Behaviour.FaceTo` → 같은 `ParticleEffect.FaceTo`(`_rotateType`)를 다시 한다. 방향 출처(`_FollowDirection`
  0xE81360, 처음 켜진 것): `_useFourDir` = 주인 `faceTo`(`Entity.m_faceTo`, 공격이 대상 쪽으로 돌림; 우리 `face.to`), `_useOwnerDirection` =
  `FOUR_WAYS[배치 방향]`, `_useOwnerMoveDirection` = 적 이동 방향(`_useDirectionLerp`; 쓰는 프리팹 없음 — 안 함), `_useFaceToInsteadOfFaceVector` =
  `faceTo.x`(`_leftIsDefault`면 ×−1) < 0이면 LEFT(`_flipWhenFaceToVertical`이면 ≤ 0), 아니면 RIGHT, `_useFaceSwitcherFaceLORR` = `faceLOrR`
  (`_leftIsDefault` 없으면 LEFT ↔ RIGHT 거꾸로 — 코드 그대로), 아무것도 없음 = `faceVector`(그려진 좌우, `_leftIsDefault`면 ×−1). 슬롯: `faceTo`는
  Entity 가상 10, `faceLOrR` 57; `SharedConsts.LEFT` 0x10·`RIGHT` 0x18·`FOUR_WAYS` 0x50.
  → `fx/face.js followDir` + `fxgame.js stepFollow`(프레임 루프, `applyTurn`). 주인은 이펙트가 놓인 유닛 [추정: `CreateEffect`에 준 엔티티], 없으면 시전자.
  보이는 차이: FLIP_TWO_SIDE 버프(156개)가 오퍼레이터가 뒤의 적을 보고 돌아설 때 함께 뒤집힌다. 에이야퍄들라 더 크비트 아스카·아스카론의 FOUR_DIRECTION 범위(`owner`, 8개)는
  ±x 대신 배치 방향을 따라 눕는다. 확인: 단위 `test/render/fx-follow-direction.test.js`, 추출 JSON 골든(`follow`). [화면 미확인] — 아레나 샌드백은 제자리라 돌아서는 장면을 못 만듦.
- **방향 전환 사본·무작위 방향·타일 높이** (2026-10-22, 이펙트 묶음 G 나머지, 디컴파일 확인; 모두 루트 스크립트 — `fx_extract.py`가 읽어 `--root-only`로 14개 파일에 씀):
  - `SwitchableEffectByFaceDirection`(`swFace`, 엑시아 더 뉴 커버넌트 공격·S1~S3 시작 5개 — `_down` 사본만): `_UpdateFace`(0xE9C2E0, `OnPlay` 0xE9C030에서만)가
    주인 `faceDirection`(`MapUtil.ParseDirection(faceTo)` 0x882440: FOUR_WAYS와의 내적 최댓값, 같으면 UP·RIGHT·DOWN·LEFT 앞 순서 — 우리 `face.dir4`)이 DOWN·UP·LEFT이고
    그 사본 이름이 있으면 자기를 멈추고 그 사본을 주인에게 `faceVector`로 만든다. `_oneShot`이면 자기는 바로 끝나고 사본은 제 길이대로, 아니면 `OnFinish`(0xE9BE70)가
    사본도 끝낸다. → `fx/face.js faceSwitchCopy` + `fxgame.js play()`(사본이 그 자리에서 재생, 시전 연결 `cast`는 `_oneShot`이면 끊음).
  - `SwitchableThreeFaceEffect`(`three`, 위셔델 S3 `wisdel_skill_03_start`): `_UpdateFace`(0xEB3800, `Update` 0xEB3440로 매 프레임)가 주인 `faceToBack`(Entity 가상 44,
    뒷모델)이면 `_upEffect`, `faceToDown`(가상 45 — `ThreeFaceAnimator`의 `_down` 면, `CharacterAnimator.activeFace`)이면 `_downEffect`, 아니면 자기를 보이고 나머지는 멈춘다.
    `_createEffectOnStart`는 처음에 둘 다 멈춘 채 만든다. → 위 사본은 `SwitchableBackEffect`와 같은 뒷면 전환(`backSwitch`)으로. 아래 면은 공식에서도 안 나온다
    (2026-10-23): 기반 `UnitAnimator.get_faceToDown`은 늘 거짓이고 참을 돌려주는 것은 세 번째 면 모델이 있는 `ThreeFaceAnimator`뿐인데, 이 서버의 오퍼레이터 chararts
    애니메이터(EN 전부·CN 전용 둘)는 모두 `_front`/`_back` 둘만 있다 — 그래서 `three.down`은 잇지 않고 앞 이펙트가 그대로 돈다. 앞모델의 `*_Down*` 클립은 세 번째
    면이 아니라 능력·스킬 키로 트는 것(render.md 「Spine 클립 커버리지」 아래 방향).
  - `RandomDirection`(`rdir`, 데겐블레허 S2 `blkkgt_skill_02_hit_2`): `OnPlay`(0xE95760)가 주인이 유효하면 `RandomUtil.RandomVector3(from, to)`(0x5A81410: 축마다
    `Random.Range`, 정규화 없음)로 `FaceTo`. → `FxInstance`가 그 범위의 무작위 벡터로 `faceTurn`(FLIP_TWO_SIDE: 반반 뒤집힘). 이 프리팹은 S2 대상 버프 `blkkgt_s_2[blocked]`·`[not_blocked]`가 트는데 `_delayToFinish` 0이라 클라에서 거의 바로 끝나 그리지 않는다 [추정](「키트 이벤트의 공식 이펙트」 锏 S2).
  - `FollowTileHeight`(`tileH`, 이네스 표식·범위 3, 프라마닉스 더 프레리타 눈 3(속도 1000), 실버애쉬 더 레인프로스트 S3 범위 1): `_UpdateHeight`(0xE834B0)가 이펙트의 월드
    높이를 제 자리 타일 높이(`MapUtil.GetTileHightByMapPosition`)로 프레임마다 최대 `_followTileHeightSpeed` × 시간만큼 옮긴다. 재생 때(`OnPlay` 0xE833B0, force)는
    차이를 한 번에 더하는데 그 갈래는 부호를 곱하지 않는다(|차이|) — 만든 높이가 타일 높이면 0이라, 우리는 바로 타일 높이에 둔다 [추정: 공식도 타일 높이에서 만듦]. → `fxgame.js stepTileHeight`.
  - CN 전용 둘(EN 덤프에 클래스 없음, 필드 이름으로만 판단 [추정]): 안젤리나 더 멜로우 위시 S2 꼬리 `_rotateIfFaceLeft`는 `_rotation`이 두 프리팹 다 (0, 0, 0)이라
    어느 해석이든 돌릴 것이 없음(안 함). 클레멘티아 S2 탄 `_flipYWhenLeft`는 왼쪽으로 날 때 180° 돌린 그림을 위아래로 뒤집는 것으로 보여, 지금의 좌우 거울과 같은 그림(그대로).
  - 확인: 단위 `test/render/fx-face-switch.test.js`, 추출 JSON 골든 EN(`ines_label_01` `tileH`만). 아레나(Windows Chrome, 재생 이름 기록): 엑시아 더 뉴 커버넌트 S1 아래 배치
    → `angel2_attack_down_loop_start_01`, 오른쪽 → 원래 것; 위셔델 S3 위 배치 → `wisdel_skill_03_up_start`, 오른쪽 → 없음. 공식 대조 [화면 미확인].

### 정예 기물 금빛 (2026-10-08, 관리자 요청 「정예화된 오퍼는 휴식 기간에 황금빛으로 빛나는 이펙트」)
- 근거: zh_CN `gamedata/battle/battle_misc_table.json` `miscConfig.AUTOCHESS.act1autochess`·`act2autochess.effectConfig.goldenEffectId`
  = `trap_acgarm_buff_loop_01`(클래스 `AutoChessBattleMiscConfig.EffectConfig`). 메타데이터: 정비 기물은 더미(`CreateDummyOnTile` → `_DoCreateOnTile` →
  `_CreateGoldEffectIfNeed`) — 전투 유닛은 더미가 아니라 전투 중에는 없음. 프리팹은 `battle/prefabs/effects/trap.ab`(EN 클라이언트), `_spawnLocation` 1(발),
  4초 루프: 금빛 glow(`bg_011_dm`, AlphaBlend)·위로 오르는 불티(`spark_p_02`)는 sortingOrder −1(모델 뒤), 별빛 메시·`bao` 2개는 0.
- 구현: `render/fxgolden.js syncGoldenFx`(매 프레임, `app.js`가 `mode === 'prep'`일 때) → `fxgame.js statusOn(…, 'golden', 0, null, under=true)`.
  `under`는 상태 이펙트와 달리 'high'+3D 보드에서 렌더러별 분할(−1은 모델 뒤), 그 밖에는 유닛 아래 캔버스. `fxstatus.js syncStatusFx`는 자기 키(STATUS_FX)만 끈다.
  원본의 절차 금빛 오라(`units.js aura`)는 2026-10-17에 없앴다(아래 「낮음 고리·정예 표시」).
- 보이는 모습: 몸 뒤 은은한 금빛 + 머리 위로 오르는 금색 불티. 몸이 glow를 대부분 가린다(데이터대로) — 공식 캡처와 비교 [추정].
  보드와 벤치 모두 [추정](벤치 기물도 더미 `placeToHand`). 소환물·적·장치 제외.
- **위치 수정** (2026-10-08 관리자 제보, 공식 녹화 — 비공개 녹화):
  보이는 빛은 `bao`(Additive, 1초 × speedMul 0.8 = 1.25초 주기)의 금빛 띠 — 로컬 정렬(align 2) 쿼드가 바닥면에 누워 pivot x 0.95·회전 −90°로
  발 앞에서 유닛 뒤로 뻗는다. 우리는 ① 렌더러 `m_Pivot`을 무시해 띠가 노드 자리(발 앞 0.4칸)에 놓였고 ② 프리팹 루트 위치(z −0.25)를 더해 전체가 떴다.
  → `fxplayer.js FxInstance` 옵션 두 개: `pivot`(빌보드·정렬·수평 쿼드가 회전 전 모서리를 pivot × 크기만큼 옮김, 셰이더 `uPivot`; 늘인 빌보드·메시 파티클은
  2026-10-22부터 — 「추출기가 못 읽던 모양」), `atSpawn`(루트 노드 자기 위치를 버림 — 호출자가 놓는 자리가 대신함). 처음(70430a17)에는 정예 금빛에만 켰고,
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
- **낮음 고리·정예 표시** (2026-10-17, 관리자 제보 「정예화된 오퍼가 잘 구분이 안 간다」 — 품질 낮음은 공식 이펙트를 끈다):
  - 원본의 절차 오라(금색 glow, 알파 0.35~0.47)는 공식 금빛이 안 도는 동안 대신 보였는데, 흐려서 밝은 칸·폰에서 거의 안 보였고 **전투 중에도**
    품질과 무관하게 떠 있었다(공식 전투 유닛에는 금빛이 없음 — 위 근거). → 오라를 없앴다. 옵션이 꺼져 있으면 공식대로: 정비 = 공식 금빛, 전투 = 없음
    (관리자 결정 2026-10-17).
  - **발밑 고리**(`render/elite-mark.js EliteRing`): 정비 중 공식 금빛을 못 틀 때(`fxgame.statusReady` 거짓 = 품질 낮음, 또는 프리팹 미설치)
    `syncGoldenFx`가 뷰에 `goldenFallback`을 켜고 `units.js`가 바닥에 금색 고리(반지름 0.46칸 — 공식 방향 고리 0.35칸 바깥, 천천히 밝기 변화)를 깐다.
    공식 금빛도 발 이펙트라 대체도 발밑에(관리자 결정 2026-10-17: 낮음 대체 전용, 전투 없음).
  - **설정 「精锐干员标记 / 정예 오퍼레이터 표시」**(`eliteBadge`, 기본 끔): 켜면 정비 중 정예 기물의 레벨 칩 오른쪽에 공식 2차 정예화 셰브론
    (ui `eliteLarge/elite_2_large`)을 금색 그라데이션 + 얇은 어두운 외곽선으로(시안 S1). 판 없음, 전투 중 없음(관리자 결정 2026-10-17). 고리와는 별개 —
    높음에서 켜면 공식 금빛 + 휘장, 낮음에서 켜면 고리 + 휘장.
  - [추정] 없음(공식에 없는 표시, 공식 금빛은 그대로). 알려진 점: 폰에서 보드 윗줄 기물의 휘장이 맹약 이름 줄과 조금 겹친다.
  - 테스트 `test/local-patch-golden.test.js`(`goldenFallback` 조건, 고리 반지름·휘장 소재·설정 기본값). 확인: Windows Chrome game-mock
    1600×900·844×390, 정비(높음·낮음 × 표시 끔·켬)와 전투(높음·낮음, 표시 켬) — 결정대로 나옴.
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
      알려진 차이 [추정]: S3 `lizi2 (1)/(2)` 가는 호는 프리팹 자체가 반지름 2.2 원에서 나와 마름모 대각선 모서리를 조금 넘음(공식도 같다고 봄); 늘인 빌보드
      pivot(`lizi2 (2)` 0.5, `sdx_line` 1, `baoci` −0.5)은 2026-10-22에 넣음(「추출기가 못 읽던 모양」). 테스트 `test/render/wang-stone-fx.test.js`.
    - **돌아오는 돌 위 금빛 기둥·육각형** (2026-10-08): 실제 판 캡처의 노란 기둥+흰 심지+
      육각형은 소환 대체 그림(민트)이 아니라 **스킬 발동 대체 그림** `fx.skill`이다. 소모된 놓은 돌이 같은 id로 돌아올 때 시뮬레이션은 토큰 패시브의
      `['skill', id, 1]`을 `['deploy', id]`보다 **먼저** 보낸다(`deploy.js` `skill.reset` → 'deploy'; 실제 매치 5판에서 S3 중 `die` 2.0초 뒤가 대부분).
      쓰러지는 뷰는 최대 2.15초 남으므로(`units.js` `dying`) 그 뷰 위에 `render/app.js`가 `burst: !ownsSkill(v)`로 금빛 기둥을 그렸다(토큰은 `isOp`가 아님).
      → `fxgame.js ownsSkill`이 望 돌 뷰에 `stonesOn()`을 돌려줌(돌의 탄생·활성은 stoneFx의 공식 프리팹). 「跟子 'summon'이 뷰보다 먼저 온다」는
      처음 추정은 틀렸다: 실제 매치 경로 124개 summon 모두 spawn 뒤, Chrome 실제 판에서도 소환 대체 그림 0회, 跟子 탄생은 `wang_passive_01_buff`(3/3).
      확인 수준: 실제 판에서 돌의 `fx.skill`이 수정 전 `burst: true` → 후 `false`, 기둥 자체는 실제 판에서
      다시 찍히지 않음(쓰러지는 뷰와 겹치는 타이밍이 이번 판들에 없었음 — 원인은 이벤트 순서 데이터 + 페이드 시간으로 추론).
      2026-10-21 일반화: 같은 순서('skill' → 'deploy')는 배치 때 패시브가 켜지는 **모든 재배치 유닛**에 있어(공식 이펙트가 없는 토큰 등은
      `ownsSkill`이 거짓이라 금빛 기둥이 그대로 났다) `render/app.js`가 아직 쓰러지는 뷰(`alive` 거짓)에 온 'skill' 켜짐을 그 뷰에 맡겨 두고
      (`_skillAtDeploy`) 그 id의 'deploy'에서 뷰가 되살아난 뒤 튼다(`skillEvent` — 스킬 상태·절차 시작 그림). 꺼짐은 바로 처리하고 맡긴 것을 지움.
      쓰러졌다 일어나는 유닛도 'deploy'로 돌아오므로 시작을 잃지 않는다(`units.js setDown`).
  - **赤刃明霄陈 S3 용이 그녀를 가림** (관리자 제보 2026-10-07, 공식 캡처·녹화 — 비공개: 용은 그녀 뒤):
    ① 용 버프는 클라이언트가 **한쪽만** 튼다 — `skchr_chen3_3/SwitchMode` `overrideEffectKey` = `chen3_skill_03_buff_L_01`이고, 그 프리팹 루트의 두 번째
    컴포넌트 `_rightEffect` = `chen3_skill_03_buff_R_01`(`_onlyCheckOnPlay` 0)은 오른쪽을 볼 때 대신 트는 사본이다. 우리는 이름 규칙(`effectsFor
    skillBuff`)으로 L·R을 둘 다 틀어 용이 두 마리였다. → `fx_extract.py right_effect`가 L 프리팹 JSON에 `right`를 쓰고(전 번들 15쌍: chen3 1, mlynar
    12(기본 스킨 추출분 3), texas2 1(미추출 스킨), tippi 1 — 추출된 L 5개만 다시 뽑음), `fxgame.js play()`는 오른쪽이면 R, 왼쪽이면 L을 **뒤집지 않고**
    한 번만 튼다(R은 목록에 같이 있어도 건너뜀). 뒤집지 않음(2026-10-11 디컴파일 2라운드로 확정: `chen3_skill_03_buff_L_01`은 `_rotateType 0` — `ParticleEffect.FaceTo`가 안 뒤집음): L을 뒤집으면 왼쪽을 볼 때 용 머리가 그녀 앞(진행 방향)에 오는데 공식 녹화는 뒤.
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
    `_checkHitHighland`(높이 종류)·맵 끝·侵入点·保护目标만 본다 → 공식도 검기는 상자를 지나간다 (2026-10-11 디컴파일 2라운드로 확정: `ChangeStateWithHighlandBehaviour._CheckNextTileHighland`(RVA 0x96CB80) = `tile.heightType == 1`(HIGHLAND), 그 밖의 검사는 `_checkHitMapEdge`·`_checkTileEnd`·`_checkTileStart` 필드뿐).
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
  절차 부메랑을 반대쪽으로 휘게(`attack(…, { inverse })`) 그린다. 손의 바퀴는 날아간 비행 수를 센다(`heldWheel.js`, 둘 다 돌아와야 다시 손에).
回环射手는 풀에 跃跃(케이퍼 `char_4100_caper`, `chess_char_1_09`)뿐이다(`data/chess.json` loopshooter). 시뮬레이션(`ai.js throwBoomerang`)은 이미 한 개를
던지고 받은 뒤 다시 공격한다 — 화면만 고쳤다.
- 근거(EN 클라이언트, 2026-10-08 UnityPy): `projectile_chr_caper`(`battle/prefabs/[uc]projectiles.ab`) `_speed` 15, `_comeBack` 1,
  `_comeBackSpeedScale` 0.25(= 3.75, 시뮬레이션 `BOOMERANG_RETURN_SPEED`), `_mainEffect` `caper_attack_01_trail`, `_clearMainEffectWhenReached` 0 —
  돌아올 때도 같은 이펙트. 그 이펙트의 `wheel` 파티클(텍스처 `caper_wheel`, 수명 5초 1개)이 던진 바퀴다. 스켈레톤(`.skel`, front·back)은 그
  바퀴(영역 `C_Weapon_03`, 같은 그림)를 기본 스킨에 두지 않고 Spine 스킨 **`Bullet`**(첨부 1개)에만 둔다. 특성 능력(`Others/Direction/Trait`,
  「持有回旋投射物时才能够攻击」)의 `_skinKey`가 `"Bullet"` → 투사체를 들고 있으면 `Bullet` 스킨이 켜진다(2026-10-11 디컴파일 2라운드로 확정 — 전에 「네이티브」라 적은 것은 틀림, C# 코드다:
  `BoomberangTrait.OnCreateProjectile`(RVA 0xAB05A0)이 던질 때 `Unit.SetSpineSkin`으로 스킨을 바꾸고 `_OnProjectileComeBack`(0xAB0920)이 돌아오면 `SetSpineSkin(_skinKey)` = `Bullet`.
  던질 때 바꾸는 조건(다 던졌을 때인지)은 안 읽음 [추정]. 애니메이션은 모두 `C_Weapon_03`를 키로 갖고, 숨기는 키는 없다). 우리 Spine 중 기본 외 스킨은 이것 하나뿐(전수).
- 수정 전: 공식 꼬리(`trailShot`)가 대상까지만 날아가 멈췄고 바퀴 파티클(5초)이 대상 위에 남아 공격마다 하나씩 늘었다. 꼬리 파일 로드 중 첫 공격은
  절차 부메랑(두 갈래 그림)이었다. 손에는 바퀴가 한 번도 안 보였다(`Bullet` 스킨을 안 씀).
- 수정: `fxgame.js` — `'boomerang'` 꼬리는 맞은 자리에서 돌아서 쏜 자리(Muzzle)로 `projSpeed('boomerangReturn')`로 돌아오고(진행률 k를 1→0, 방향은
  그녀 쪽 = `_rotateToTarget`), 받거나 그녀가 없어지면 즉시 지운다(`stop(true)`), `clear()`는 날던 것을 돌려준다. 새 `render/heldWheel.js` —
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
  루트 `_delayTime`(약 310 이펙트) 보류 — 2026-10-11 디컴파일 2라운드: 정체는 `Torappu.Fx.FxDelay`(그 GameObject를 끄고 `_delayTime ÷ 재생 속도` 뒤 켬, `OnEnable` RVA 0x34C1650), 묶인 시전 이펙트 383개 중 233개에 있다. 2026-10-11 관리자 결정으로 적용(루트·중첩 서브프리팹 모두, 아래 「좌우 거울·재생 속도·루트 지연」). `m_IsActive`는 아래 「착지한 낙하 검」에서 나중 결정으로 적용.
  픽셀 비교(HEAD 대비 1983 이펙트 × 4프레임): 바뀐 것은 클립 2개 이상인 11 프리팹뿐(바인딩된 6: 텍사스 디 오메르토사 S2 발동·S3 범위 시작, 무에나 S2,
  위셔델 S2 2종, 불피스폴리아 S2 / 바인딩 안 된 svash2 방패·불피스폴리아 방향별 4), 나머지 1972는 픽셀 동일.
- **내장 Quad/Plane 메시** (e62c0551): 검날 노드(jian / jian1 / add)는 Unity 내장 Quad(FileID → `Library/unity default resources`, PathID 10210)
  MeshFilter라 `fx_extract.py`가 못 풀어 메시가 빠졌다(재질 트랙도 'attr:'로 남음). 클라이언트가 그 파일을 `<Arknights_Data>/Resources/unity default resources`로
  싣고 있어 합성 대신 **실제 메시를 읽는다**(`Extractor.mesh_ref`, 메시 자리만; Quad 10210·Plane 10209만 — Cube 10202·Sphere 10207은 결정 범위 밖).
  재추출은 texas2 번들만: 9 프리팹 69 노드에 메시가 생김(S3 낙하 검·범위 모서리 검·범위 시작 27, S2 버프 메시 5, S1·S3 버프, buff_02_start 2종), 그 밖의 필드는
  재추출 전과 같음. 산출물 `public/assets/local/fx/texas2/*.json`·`mesh/Quad_000027e2.json`은 git 밖. 나머지 ~316 프리팹(65 번들)은 보류 —
  2026-10-16 프라마닉스 더 프레리타 눈 타일 `sbell2_ground_01~03`만 더 재추출(관리자 결정, 「키트 이벤트의 공식 이펙트」). 2026-10-17 운영자 이펙트 전체
  재추출(관리자 결정)로 나머지도 들어옴: 314 프리팹 737 노드(아래 「추출 누락 보고 — fx_coverage」).
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
  가리키는 컴포넌트도 없음, 1개는 `_inactiveOnFinish`(끝날 때 끄는 목록)만, 1개는 트랙(위). (2026-10-11 디컴파일 2라운드: Effect/ParticleEffect가 이름으로 찾는 자식은 상수 `body`·`rotation_y`·`rotation_z`·`static_offset`·`flip_x`뿐 — 이름으로 켜는 코드는 없다. 늦게 켜는 것은 `FxDelay`(2026-10-11 적용 — 그 가지만 늦게 켬), `FxLODSetting._disableObjects`는 저사양에서 끈다. 처음부터 꺼진 노드 가운데 FxDelay가 붙은 것은 대조 안 함 [확인 필요].)
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
  (2026-10-21: 인디고 것 `indigo_buff_01_start`는 공격 대상에게 주는 버프(`_additiveActiveBuffs`)라 `attach`·`attachFoe`에서 빠짐 — 아래 「기본 모드 attach」.)
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
- 확인: 단위 `test/render/fx-cast-timing.test.js`(추출 결과·`castTiming`/`castPhase`·`activationEffects`·UD_OR_LR·소스 고정). [화면 미확인]
  `modes.json`(공유 `public/assets/local/fx/`)은 `char_modes.py` 재실행으로 다시 씀; 프리팹의 `back`은 `fx_extract.py --game <클라> --back-only` 실행 전에는 없어 ④는 그 뒤에 보인다.
- **2026-10-10에 마저 한 것**(같은 조사의 다른 점, 관리자 결정 (2026-10-10)):
  - FollowMountPoint 회전을 매 프레임 따르기 — 위 「이펙트 방향」.
  - 재생 속도: 클라 `HitEffectOptions.OnCastOnTarget`(0xAE54D0)은 타격 이펙트를 `CreateEffect(…, 1.0)`로 만든다 — 공속과 상관없이 1.0배. 시전 이펙트(`CastEffectOptions`)만
    능력 재생 속도로 → `fxgame.js` `play`/`spawn`의 `speed`(살아 있는 항목 `l.speed`, 프레임마다 `dt × 게임 속도 × speed`): 시전 이펙트 = 그 공격의 `castSpan` 재생 속도
    (OnAttack 프레임 ÷ windup), 타격·그 밖 = 1.0(전과 같음). 2026-10-11부터 프리팹의 `_usePlaybackSpeed`·`_limitedPlaybackSpeed`를 따른다(아래 「좌우 거울·재생 속도·루트 지연」).
  - 언더플로우 S2 `udflow_skill_02_hit_01`의 `_useOwnerToTargetDirection`: `char_modes.py`가 `hitAim`(그 항목이 켜진 타격 이펙트 이름)을 쓰고, `fxgame.js`가 그 이펙트를
    공격자 → 대상 선으로 돌린다(`rotation_z` 축이 있으면 그 각도, 없으면 그 선의 좌우로 거울. 2026-10-11 디컴파일 2라운드: 공식은 `ParticleEffect.FaceTo`가 프리팹의 `_rotateType`대로 돌린다 — `udflow_skill_02_hit_01`은 1(FLIP_TWO_SIDE)이라 대상 쪽 x 부호로 뒤집기만 하고 각도로 돌리지 않음 → 2026-10-11 관리자 결정으로 공식대로: 방향 = 대상 − 공격자, 뒤집기만(아래 「좌우 거울·재생 속도·루트 지연」)). **`modes.json` 재생성이 필요**
    (`char_modes.py`; 공유 파일이라 이 작업에서 다시 쓰지 않음) — 그 전에는 예전처럼 공격자의 좌우.
  - `_spawnLocation` 2 HIT_POINT·4 HEAD_POINT: `Effect._InitLocationFromEntity`가 엔티티의 hit / head 마운트 점에 놓는다 → `fxpoints.js pointKey` 2 → `hit`, 4 → `head`
    (오퍼 `points.json`, 적 `enemy-modes.json points`), 표가 없는 유닛은 예전 높이(키의 0.5 / 1.1).
  - 쏜즈 더 로드스타 S1 `thorn2_skill_01_range`의 `_overwriteHeight`(풀에서 유일, offset 0.0 — 원시 필드 #18·#19, `fx_extract.py overwrite_height`): 프리팹 `height`,
    `fxgame.js overHeight`가 높이 = 그 유닛의 바닥(점이면 그 칸의 높이) + offset [추정: 엔티티 = 착지한 S1 투사체, 그 칸 위]. `_spawnLocation` 7이 0에 놓은 것을 높은 칸이면
    그 칸 위로 올린다. **`fx_extract.py --game <클라> --bundle thorn2 --height-only` 실행 전에는 `height`가 없어** 화면 변화 없음.
  - `_delayToFinish`(2026-10-11, 원시 float #5 — ParticleEffect 필드 순서 #4 `_delayToPlay`·#5 `_delayToFinish`·#6 `_maxLifetime`, `fx_extract.py delay_to_finish`):
    0보다 크면 프리팹 `finish`. `Effect.FinishMe`(RVA 0xC88FE0)가 끝내는 이펙트를 그만큼 뒤에 회수한다(`ParticleEffect.get_delayToRecycle` RVA 0xCB3470).
    지금 쓰는 곳은 상태 이펙트 끝(`ui.md` ⑤ 「끝내는 시점」, `fxgame.js statusOff`). **`fx_extract.py --game <클라> --finish-only` 실행 전에는 `finish`가 없어**
    예전처럼 바로 제거. 연결선 이펙트(`stepLines`)의 0.5초는 그대로 상수.

### 입력 대상·루프 타격·클립별 이펙트·배치 이펙트 — 디컴파일 2라운드 (2026-10-11, 관리자 결정 「동작 변경 모두 공식이랑 동일하게」)
근거: 클라 코드(`dump.cs` + 역어셈, 아래 메서드는 켜진 Lua 핫픽스 목록에 없음)와 charpack·`[uc]skills.ab`·이펙트 번들 프리팹 값. 조사 기록은 관리자 노트(디컴파일 2라운드 fx).
- **① 입력 대상 이펙트(`_inputTargetEffects`)** — `InputTargetEffectOptions`는 `CastEffectOptions`의 하위(켜는 때 `_startEvent`, `_oneshot`/`_endEvent`/`_onlyOnce`/
  `_delayIfFirstAttack` 그대로)이고 `CreateEffect`(RVA 0xB1B5F0)만 다르다: 능력의 입력 대상(주 대상 1명)에, 시전자의 방향·능력 재생 속도로; 대상이 죽었고
  `_useInputPos`면 그 자리(`CreateEffectAtMapPos`). 우리는 타격 이펙트로 묶어 'dmg' 때 맞은 대상마다 1.0배속으로 틀었다(시 `dusk_attack_01_hit_02`처럼 휘두름 동안
  대상에 붙는 루프가 타격 때 한 번). → `char_modes.py`가 모드의 `input[모드]`로 따로 쓰고(타격 `hit`에서 뺌) 시점을 `castOpt`에 `t: 1`(+ `_useInputPos`면 `p: 1`)로,
  `fxgame.js inputFx`가 시전 이펙트와 같은 시계로 주 대상에 튼다: 시작 4(타격) = 그 타격의 첫 'atk' 대상, 시작 2(휘두름) = 그 유닛이 지난번에 친 대상이 살아 있으면
  그 대상 [추정: 시뮬레이션의 'swing'에 대상이 없음], 없으면 타격 때. 끝 4 = 타격, 3·6 = 시전 끝. 풀 12개: 시 기본·S3(+ 스킬 묶음 S1), 모스티마, 산탈라,
  레온하르트(`_onlyOnce`), 페페 S2, 위셔델 S3(`_useInputPos` 0). 스킬 묶음(`skills[i].target`) 쪽 입력 대상(시 S1 등)은 발동 경로라 그대로.
- **② 루프형 타격 이펙트·마비** — `HitEffectOptions.OnEvent`(0xAE5C60): 루프형(`_oneshot` 0)은 `_endEvent`에 끄고, `OnCastFinish`(0xAE5490)는 루프형을 끄며 이유가
  PALSY(4)면 그 옵션이 만든 이펙트 전부(한 번형 포함)를 끈다(`CastEffectOptions.OnCastFinish` 0xB17BD0 → `EffectOptions.OnCastFinish` 0xAE1ED0도 같음).
  → `char_modes.py hitLoop { 이름: _endEvent }`(풀: 엑시아 `angle_attack_01_hit`·`_02_hit`, 끝 6 — 그 발생기는 `_convertCastEndToAttachFinish`라 시전 끝),
  `fxgame.js hitFx`가 그 이펙트를 시전 끝(`castSpan`)에 끄고 다음 휘두름·모드 전환·주인 사망에도 끈다(`castLoop` 표시; 이미 시전이 끝난 뒤 온 피해면 프리팹 길이).
  마비: 시뮬레이션이 적의 공격을 마비로 끊을 때 내는 fx `'palsy'` `{ id }`에서 `cutCast`가 그 시전의 이펙트를 전부 끄고(아직 로드 중인 것·첫 공격 지연 대기 포함) 시전을 닫는다.
- **③ 시전 대상 이펙트(`_castTargetEffects`)** — `CastTargetEffectOptions.PlayEffect`(0xB18810): 시전 대상마다·능력 재생 속도. 대상은 우리 「맞은 대상마다」와 같고
  속도만 달랐다 → `castTgt`(실버애쉬 더 레인프로스트 `svash2_attack_hit_01`)는 'dmg' 때 그 시전의 재생 속도로.
- **④ 클립별 이펙트 변형** — `UberAnimationEffectEmitter.OnCastStart`(0xAED700): 능력의 애니 키가 `_sourceAnimKey`면 `_replaceGroup`에서 한 묶음을 골라
  (`_CalculatePlayIndex` 0xAEDDB0: `_loopType` 0 LOOP 순환, 1 RANDOM 무작위) 그 `anim`을 틀고 그 묶음의 시전·타격 옵션을 이번 시전에 쓴다. 비나 빅토리아 기본 공격
  `Attack_1`/`Attack_2`(RANDOM) → `siege2_attack_start_01`/`_02`가 우리 바인딩에 없었다. → `char_modes.py clipFx[모드] = { src, loop, groups: [{ anim, cast, hit }] }`
  (시점은 `castOpt`), `fxgame.js castGroup`이 모델이 지금 트는 공격 클립과 이름이 같은 묶음을, 없으면 `_loopType`대로 고른다(`fxmap.js clipGroup`). 묶음 이펙트는
  기본 옵션에 더한다 [추정: 왕처럼 묶음이 비어 있으면 기본 옵션만]. 클립 고르기는 Spine 쪽(2026-10-14, `render.md` 「Spine 클립 커버리지」 B): 모델이 휘두를 때마다
  `alts`에서 고르고(`spine.js _nextAlt`), 'swing' 이벤트는 뷰가 먼저 받아(`app.js processEvents`) 이펙트가 그 클립의 묶음을 쓴다.
- **⑤ 배치·쓰러짐 이펙트** — `Character.get_startEffect`(0x7085E0) = 프리팹 루트 `_startEffect`, 없으면 오퍼 `common_char_birth_01`, 토큰 `common_call_start_01`
  (`DefaultEffects.CHARACTER_BORN`/`TOKEN_BORN`); 모드의 `_overrideStartEffect`가 먼저(`GetStartEffect` 0x6F74B0); 사망은 `_deadEffect` 또는 `common_char_die_01`.
  우리는 오퍼 배치 이펙트가 없었다('birth' 이름 매핑은 부르는 곳이 없었음). → `char_modes.py`가 `start`·`startOnce`(`_onlyPlayStartEffectOnce`)·`modeStart`·`dead`를 쓰고
  (풀 18명 `start`, 울피아누스 S3 `S3_Respawn_A`/`_Restore`의 `ulpia_skill_03_bith_01`, 비질 `vigil_token_die`), `fxgame.js flushDeploys`가 'deploy'(【移动】 포함) 때
  자기 번들 → 공용 `common` 번들 순으로 찾아 틀고, `allyDeathFx`가 쓰러짐('killed') 때 사망 이펙트를 그 자리에 틀며 그때는 `render/fx.js`의 절차 사망 연기를 안 그림
  (`ownsDeath`). 퇴각·만료('retreat'·'expired')는 안 틂 [추정]. 스킬 중 재배치는 그 스킬 모드의 덮어쓰기, 없으면 이름이 `<모드>_`로 시작하는 모드의 것
  (울피아누스 S3 → `S3_Respawn_A`) [추정: 이름으로]. `startOnce`는 루트 이펙트만 첫 배치에 [추정]. 토큰 프리팹의 자기 `_startEffect`는 안 읽음(토큰은 공용 것만) [추정].
  공용 프리팹 3개는 `fx_extract.py --bundle common --prefab …`로 뽑아야 보인다(그 전에는 공용 것이 필요한 오퍼는 아무것도 안 틂).
- **⑥ 적이 대상에 거는 버프 표식** — `Entity.AddBuffEffect`(0x35F3CA0)/`RemoveBuffEffect`(0x36001C0): 버프 이펙트는 버프 동안 주인에게, 이름당 하나(`BuffEffectHolder.refCounter`).
  → `enemy_bindings.py`가 공격 부분에 `hitBuffLife { 이름: life }`(LIMITED `lifeTime`, IMMEDIATELY 0)를 쓰고 `fxgame.js eholdBuff`가 `life`초 유지(유지 중 다시 맞으면
  연장 [추정: 갱신]), 같은 대상·같은 이름은 하나만. 수명이 표에 없는 버프(INFINITY·CUSTOM — 기절 등, 끝은 시뮬레이션이 앎)는 예전처럼 프리팹 길이로 한 번이되 이름당 하나 [추정].
  지금 수명이 있는 것은 `enemy_vtsk_skill_01_marker_01`(5.8초) 하나.
- **⑦ 추출기 `spawn` 인식** — `fx_extract.py`가 루트 이펙트 컴포넌트를 「#6 = −1(`_maxLifetime`) 그리고 #10 = 2.0(`_limitedPlaybackSpeed`)」로 알아봐 제한 속도가 다른
  묶인 프리팹 51개(예: 텍사스 디 오메르토사 `texas2_skill_02_start` −1)에 `spawn`이 없었고, `_subFXDelayConfigs`(#3 목록)가 비어 있지 않으면 뒤 필드가 4×n칸 밀렸다.
  → `root_effect`가 모양으로 알아본다(목록 길이 보정, `_maxLifetime` −1 또는 (0, 100), 불 값 0/1, `_rotateType` ≤ 8, `_spawnLocation` < 64 — 조사 기록의 이펙트 번들
  13,204개 판독과 6개 번들 전수 일치). `--root-only`가 이미 뽑은 프리팹의 `spawn`·`height`·`face`만 다시 쓴다.
- 확인: 단위 `test/render/fx-round2.test.js`(추출 결과·`clipGroup`/`deployEffect`·소스 고정·스텁 표로 쓰러짐 이펙트 판정). [화면 미확인]

### 좌우 거울·재생 속도·루트 지연 (관리자 결정 2026-10-11 「공식대로」, 디컴파일 2라운드)
근거: 클라 코드 `Effect.Play`(RVA 0xC8A5D0)·`Effect._PlayInternal`(0xC8C4F0)·`ParticleEffect.FaceTo`(0xCB1DC0)·`FxDelay.OnEnable`(0x34C1650)·`Effect.UpdatePlaybackSpeed`(0xC8AE50)과
이펙트 번들 프리팹 값(루트 ParticleEffect 직렬 필드; 이 메서드들은 켜진 Lua 핫픽스 목록에 없음). 조사 기록은 관리자 노트(디컴파일 2라운드 fx).
- **방향**: 이펙트는 「방향」 하나를 받아 재생된다 — 시전·대상·타격 이펙트 = 시전자의 그려진 좌우(`faceVector`, 위·아래를 볼 때도 ±x), `_useFourDirectionalFace`
  항목(`modes.json turn`) = 네 방향, `_useOwnerToTargetDirection`(`hitAim`) = 대상 − 공격자, 프리팹의 `_useBodyRotation`(`face.body`) = 그 이펙트가 붙는 유닛의 네 방향.
  그다음 프리팹 루트의 `_rotateType`(`face.rot`)이 정한다: **1 FLIP_TWO_SIDE** 방향이 왼쪽(`_leftIsDefault`면 오른쪽)이면 자식 `rotation_y`를 y축 180°·`rotation_z`를
  z축 180°(아니면 둘 다 0), **2 FOUR_DIRECTION** `rotation_z`를 `_mainDir`에서 그 방향까지 90° 단위, **3 FIXED_DIRECTION** RIGHT에서 `_mainDir`까지, **4 ANY_DIR**
  `body` 자식을 그 방향으로, **0 NONE**(그 밖의 값) 뒤집지도 돌리지도 않음. 거울(스케일 −1)은 FollowMountPoint `_followScaleSign`(스파인 좌우 반전의 부호)일 때만.
  → `render/fx/face.js faceTurn`·`fxplayer.js FxInstance`(`dir`·`body` 옵션, `applyTurn`), `fxgame.js play()`/`spawn()`이 방향을 넘긴다. 예전 예외(방향 칸 좌우 사본
  `unflip`, `right` 짝, `turn` 항목의 `aimMover`, `hitAim`의 `aimAlong`)는 이 규칙으로 흡수 — 좌우 사본 3쌍·`right` 짝 5개는 모두 rotate 0, `turn` 항목 20개 중 18개는
  rotate 2(`_mainDir` RIGHT = 예전 `aimMover`와 같은 각), 언더플로우 S2 `udflow_skill_02_hit_01`은 rotate 1(대상 쪽 x 부호로 뒤집기만). `rotation_y` 축은 추출 JSON의
  부모 회전을 곱해 보면 744개 중 741개가 전투 좌표 y(판의 행 축)라 y축 180° = 좌우 거울 + 높이 부호 반전(판 위 평면 내용은 거울과 같음).
- 범위(추출된 이펙트 2,356개 중 `face`가 있는 2,122개): rotate 0 = 1,244, 1 = 788(`rotation_y`·`rotation_z`가 없는 43개는 공식도 아무것도 안 함), 2 = 87, 4 = 3.
  풀 바인딩(`modes.json`) 1,095개 중 rotate 0이 549개 — 이것들이 **왼쪽을 볼 때 더는 거울이 아니다**(대칭이면 차이 없음). rotate 2인데 `turn`이 아닌 것은 왼쪽을 볼 때
  거울 대신 z축 180° 회전. `face`가 없는 프리팹(루트에 ParticleEffect가 없음: 투사체 꼬리·선 234개)은 예전처럼 거울 [추정: 다른 Effect 하위 클래스의 FaceTo는 안 읽음].
- **재생 속도**: `_usePlaybackSpeed`(`face.speed` 0 = 끔)일 때만 받은 속도를 쓰고, 끄면 1.0(풀 바인딩 시전 이펙트 383개 중 75개 — 르무엔 `lemuen_attack_start_01`,
  첸 더 던스트릭 용 등). `_limitedPlaybackSpeed`(`face.limit`, 없으면 2.0; 음수 = 상한 없음)가 0 이상이면 속도 ≤ 상한 ÷ 전투 배속 → `fx/face.js playSpeed`, `play`/`spawn`의
  살아 있는 항목 `speed`. 타격 이펙트(1.0)는 2배속에서도 1.0이라 변화 없고, 공속이 빨라진 시전 이펙트가 2배속에서 ×1로 묶인다.
- **시작 지연**: 루트 FxDelay `_delayTime`(`face.fxDelay`)은 이펙트 전체를 끄고 `_delayTime ÷ 재생 속도`(게임 시간) 뒤 켠다(`UpdatePlaybackSpeed`가 속도를 넣는 것은
  `_usePlaybackSpeed`일 때뿐), `_delayToPlay`(`face.delay`, `_randomPlayDelay`면 0~그 값)는 게임 시간으로 그만큼 뒤 재생. 중첩 서브프리팹의 FxDelay(노드 `delay`, 그
  컴포넌트의 속도는 기본 1.0이라 게임 시간 [추정: 루트 것만 속도를 받음])와 루트 `_subFXDelayConfigs`(노드 `sdelay`, ÷ 속도)는 그 가지만 늦게 켠다 — 켜질 때 파티클·클립이
  처음부터. → `FxInstance`가 지연 동안 아무것도 그리지·돌리지 않고(`wait`), 가지는 노드를 숨겼다가 켠다(`branches`, 그 가지 클립은 켜진 때부터 `off`). `done`은 지연이 남은 동안
  거짓, 지연 중에 `stop()`(시전 끝 `until`·주인 사망)이면 **보이지 않고 끝남**(클라 `FinishMe`가 이긴다). 한 번형의 기본 끝(`until`)은 프리팹 길이 + 지연(`inst.lead`).
  묶인 시전 이펙트 383개 중 233개에 루트 지연이 있다(로즈몬티스 `rosmon_attack_A_start_02` 1.5초, 페페 S3 `pepe_skill_03_start_01` 1.05, 아스카론 `ascln_*_start_*` 0.75~1.1,
  시 `dusk_attack_01_start` 0.9, 스카디 `skadi_attack_0N_start` 0.8, 텍사스 디 오메르토사 S2 `texas2_skill_02_start` 0.17 / `_start_02` 0.30). 가지 지연: 텍사스 디 오메르토사 S2
  발동 `texas2_birth_02_start` 베기 0 / 0.1 / 0.15 / 0.3초, 티티 S3 `titi_skill_03_hit_02` 0.23초 3개, 왕 `wang_birth_01`/`_02` 0.2초.
- 추출: `fx_extract.py root_face`가 `face: { rot, left?, body?, dir?, speed?, limit?, delay?, rnd?, fxDelay? }`, `prefab()`이 노드 `delay`·`sdelay`를 쓴다. 이미 뽑은 프리팹에는
  `--root-only`(`body`가 새로 생김)와 `--delay-only`(노드 지연; 노드 이름 순서가 번들과 다르면 건너뜀). 그 전에는 `body`·가지 지연이 없어 `_useBodyRotation` 이펙트는 ±x로,
  가지는 동시에 켜진다(루트 `face`는 이미 기록돼 있음).
- **되돌리기**(예전 동작: 2026-10-05~2026-10-11 「왼쪽을 볼 때 모든 이펙트를 거울」 + 위 예외, 시전 이펙트 = 능력 재생 속도 그대로, 지연 없음): `FxInstance`의 `mirror`를
  `facing`으로, `faceTurn` 호출을 null로 하면 거울만 남고(`fxgame.js play()`의 `turnOld`·`aimAlong` 분기가 예전 돌림), `playSpeed`를 받은 속도 그대로, `FxInstance` 옵션
  `delays: false`면 지연이 없다.
- 확인: 단위 `test/render/fx-face-delay.test.js`(`faceTurn`·`playSpeed`·`startLead`, 거울/회전, 루트·가지 지연, 지연 중 끝, 텍사스 디 오메르토사 S2 0.17/0.30초 ÷ 속도, 소스 고정),
  `test/render/texas2-skill-fx.test.js`(S3 범위 시작의 루트 지연 0.5초 뒤 낙하 검). [화면 미확인] — 왼쪽을 보는 비대칭 이펙트(크루스 더 킨 글린트·실버애쉬 더 레인프로스트·
  스카디·아스카론 일반 공격 시작 등 rotate 0), 지연이 긴 시전 이펙트(로즈몬티스·페페·아스카론·시).

### 위수 협의 템플릿 이펙트 (관리자 결정 2026-10-11 「넣음」, 디컴파일 2라운드)
- 공식: 맹약·장비·밴드 버프 템플릿(`act1autochess_*`·`act2autochess_*`)의 그래프 노드 `Nodes.CreateEffect`(RVA 0xB90880, 유닛에)·`CreateEffectAtScreenPos`(화면 위치)가 그
  노드가 실행될 때 한 번 만든다(전용 엔진 코드 없음). 라테라노 클립 `bond_laterano_reload_01`(ON_AFTER_ATTACK), 신속 맹약·사막 나침반 `bond_charge_battle_01`(ON_SKILL_FINISH),
  에기르 맹약 `bond_aegir_eat_01`, 증원·M3 고치 갑옷·골리앗 투구·증기의 마음 `map_act1autochess_reinforce_02`, 쉐라그 맹약 `map_snow_left_2_right`(화면 위치), 시라쿠사 맹약
  `common_071_bond_siracusa_hit_01`(ON_OUTPUT_DAMAGE, 적에게).
- sim이 그 순간 상태 이벤트 `['tplfx', 대상 id | null, 프리팹 키, 출처 id | null]`을 낸다(`docs/SIM.md` 이벤트 표). → `fxgame.js tplFx`: 추출 목록에서 이름으로 찾고(대소문자 무시,
  `bond`·`map`·`common`·`buff` 번들 먼저), 대상이 있으면 그 유닛에 붙여 따라가고(프리팹 `_spawnLocation`, 대상 사망 때 끔; 같은 순간 사라지는 유닛 — 에기르 맹약에 먹힌
  오퍼레이터 — 은 그 자리에), 대상이 null이면 전투 필드 가운데에 [추정: 클라의 화면 위치 = 화면 가운데]. 방향은 대상의 좌우 [추정: 노드의 방향 옵션은 이벤트에 없음].
  프리팹이 안 뽑혔거나 대상이 없으면 아무것도 안 함. `render/app.js`는 그대로(모든 상태 이벤트가 이미 `fxGame.onEvent`로 온다).
- 추출: `fx_extract.py --bundle bond --bundle map --match '^(bond_|map_act1autochess_|map_act1vautochess_|map_snow_)'`(bond 8개·map 18개) +
  `--bundle common --prefab common_071_bond_siracusa_hit_01` — 그 전에는 안 보인다.
- 템플릿 노드 이펙트를 이벤트별로: `enemy_bindings.py template_info`가 버프 템플릿의 `fx`에 시작(ON_BUFF_START 0) 노드만 남기고 그 밖은 `onEvent { 이벤트 번호: [이펙트] }`
  (전에는 모든 이벤트를 `fx` 하나로 섞음 — 머드락 방패의 `common_heal_hit_01`(ON_TAKE_DAMAGE)·티티 재우기의 `titi_attack_hit_01`(ON_BUFF_TRIGGER) 같은 것). 렌더는 버프의 자기
  이펙트(`overrideEffectKey` / 템플릿 `effectKey` = `key`)만 틀고 노드 이펙트는 틀지 않았으므로 화면 변화는 없다(`enemy-modes.json` 결과 동일, 검토용
  `tools/assets/local-enemy-bindings.json`의 템플릿 72개만 바뀜). `char_modes.py`는 템플릿을 읽지 않는다(오퍼레이터 쪽은 `overrideEffectKey`만). 버프 끝·피격 같은 다른 이벤트를
  렌더에 알리는 sim 이벤트는 없어 `onEvent`는 아직 쓰지 않는다.
- 확인: `test/render/fx-face-delay.test.js`(`tplfx` 처리·번들 순서·`onEvent` 분리 소스 고정). [화면 미확인] — 쉐라그 눈바람 위치·크기, 에기르 맹약 삼킴.

### 战场#06 沙尘暴 연출 (2026-10-18, 상반기 전장 m06 — 규칙은 `sim.md` 「战场#06(上半) 沙尘暴 · 土石结构」)
- 공식(EN 버프 템플릿 `sand_storm[ally]`·`[trap]`·`[camera_effect]`, 노드 `SwitchDirection`이 폭풍 방향으로 고름 — 참고 덤프 「공식 버프 템플릿 추출」):
  - 바람 맞는 오퍼레이터·소환물: `storm[attr_to_ally]` → `map_desert_03_<바람이 오는 쪽>`(DOWN → `_up`, HIT 점, 몸 주변 모래 소용돌이)와
    `storm[attr_to_ally_mark]` → `buff_desert_01`(머리 위 아이콘). 가려지는 트리거에 둘 다 끝남. → `fxstatus.js KEY_FX['terrain:sandstorm']`, 방향은 sim 버프의
    `fxTag`(상태 이벤트 `fx`).
  - 적: `sand_storm[enemy]`가 만드는 `sand_storm[slow_down]`은 이펙트 이름이 없다 → `terrain:sandstormSlow`는 아무것도 안 그림(전에는 이름의 `slow`로 `buff_slowdown`이 나왔음).
  - 土石结构: 바람 쪽에 다른 구조물이 없는 것(sim 가림 규칙과 같음)에 `storm_ally_mark` → `map_desert_02_<방향>`(구조물 위를 넘어 바람 반대쪽 면으로 흘러내리는 모래).
    강화 상태는 피해만 막고 표시는 막지 않는다(템플릿의 피해 분기와 표시 분기가 따로). → `fxgame.js stormMarks`. 붙는 자리 SpecialPoint0(칸 가운데 바닥)의 **회전**
    (−0.5, −0.5, 0.5, 0.5)을 이펙트 루트에 준다(`MOUND_SP0_TURN`, 배율 0.01은 안 받음) — 네 방향 사본은 `static_offset` 회전만 다르고, 이 회전 아래서만 down·up이 행,
    left·right가 열 방향으로 흐른다(관리자 제보 2026-10-18: 회전 없이 위치만 쓰니 `_down`이 오른쪽→왼쪽으로 흘렀음).
  - 화면: 폭풍 장치의 `sand_storm[camera_effect]` → `screen_desert_up_to_down_empty`(`_effects` 감싸개) 안의 `screen_desert_up_to_down`(`_spawnLocation` 12 CAMERA,
    루프): 카메라 앞 1.32에 22° 기운 모래 판(`Plane001` × 8.56, 셰이더 Optimize/Dissolve AB MultiTex) + 화면 위쪽에서 내려오는 먼지 입자. → `fxgame.js setStorm`이
    카메라 자세를 매 프레임 복사(Unity 카메라 +z ↔ three −z는 이펙트 Unity 그룹의 z 거울이 맞춤), 카메라 효과가 있으면 near 0.3.
    **[ASSUMED]** 카메라의 위치·회전을 따름(부모로 붙임), 우리 카메라 시야각이 공식 40°와 다르면 카메라 기준 x·y를 tan(fov/2) ÷ tan 20°로 줄임(입자 크기는 그대로),
    어느 절반에서든 폭풍이 불면 켬.
- 폭풍 상태: sim `content/devices.js stormView` → `Battle.fieldMeta().storm` = `[{ c0, c1, dir }]`(한 사람 판은 전체, 둘이면 절반마다 맵 카드 「모래 폭풍 정지」를 반영,
  폭풍 없는 스테이지는 키 없음). `render/app.js enterBattle` → `fxGame.setStorm(storm, 활성 토석 구조물)`; `clear()`가 끝냄. 고정(`pinned`)이라 개수 상한에 안 잘림.
- Optimize/Dissolve AB MultiTex(클라 DXBC + 변형별 파라미터 표의 이름·오프셋으로 확인): 키워드 `_DISSOLVE_ONE/TWO/THREE` = 재질 `_Dissolve` 0/1/2 [ASSUMED: 키워드 열거 순서],
  `_Amount`·`_BorderWidth`는 벡터(.x/.y/.z = 디졸브 텍스처 A/B/C), `_TexSpeed` = (메인 uv .xy, 디졸브 A .zw), `_TexSpeed2` = (B .xy, C .zw), 흐름 = frac(2 · _Time.y · 속도);
  `_MainTexSpeed`는 선언만 있고 어느 변형도 안 읽음. 색 = 2 · 메인 · 정점색 × `_TintColor` / `B` / `C`, 각 알파 = saturate(알파 × 자르기) — A 위에 B를 B 알파로 lerp,
  그 위에 C × C 알파를 더함(네 채널 모두). → `fxplayer.js` FRAG `uMulti`.
- 土石结构 모델: 프리팹 `pkgrps/btl_pfb_tokens_0.ab` `trap_032_mound/Graphic/Mesh/S_desert_wall/S_desert_wall_01`의 조각 9개(Unlit/Texture, 죽을 때 `Wall06`로 무너짐 —
  m06에선 안 죽음) + 강화 버프 `mound_s_1[mesh_effect]`의 `S_desert_wall_02_start_Mesh`(`s.ab`, SpecialPoint0 위치만 — 루트 위치·점의 회전·0.01 배율은 안 받음)를
  장치 모델 하나로 구움(`scene_extract.py --devices`, `DEVICE_EFFECT_MESHES`; 효과 묶음의 의존 번들은 `.cache/fx-cab-index.json`). 텍스처가 나무 틀·파란 마름모·모래 덩어리라
  얼핏 阻隔工事와 비슷하다. `official.js`는 Unity 내장 Unlit/Texture를 불투명·조명 없음·뒷면 컬링으로(특制水上平台 배도 같은 셰이더 — 전에는 셰이더를 못 찾아 조명 받는
  표준으로 그려짐). 2D 보드는 예전 모래 더미 그림 그대로.
- 안 한 것: 강화 시작 이펙트 `S_desert_wall_02_start`(한 번, 2.5 s — 클라는 구조물이 강화될 때, m06은 전투 시작 [추정]), `S_desert_wall_die`(m06 구조물은 안 죽음),
  `map_desert_01_line`·방향 없는 `map_desert_02`/`_03`(템플릿이 안 씀), `screen_sandstorm_01/02`(m06 아님).
  fx_coverage는 `shader:Unlit/Texture`를 `hand`로 둔다(2026-10-20): 그 셰이더를 쓰는 효과 프리팹은 `S_desert_wall_02_start_Mesh` 하나이고 효과
  플레이어는 그것을 틀지 않는다(장치 모델로 구워 `official.js`가 그림). 플레이어에는 이 셰이더 규칙이 없어 틀면 재질에 남은 Standard의
  `_Color`(1,1,1,1)를 ×2 색으로 쓰고 텍스처 알파를 그대로 쓴다 — 강화 시작 이펙트 `S_desert_wall_02_start`를 플레이어로 틀게 되면 먼저 불투명·×1
  규칙을 넣을 것.
- 추출: `fx_extract.py --bundle map --match '^map_desert_0[23]'` · `--bundle buff --match '^buff_desert_01$'` · `--bundle screen --match '^screen_desert_[a-z]+_to_[a-z]+$'` ·
  `--bundle s --match '^S_desert_wall'`(EN 클라) → `scene_extract.py --devices` → `node tools/build-browser-resources.mjs`(서비스 워커 목록).
- 커스텀 설정 창·브리핑의 전장 #06 미리보기(`stage/preview`, git 밖)는 구조물 모델이 바뀐 뒤 `node tools/map-previews.mjs --only act1autochess_m06`으로 다시 찍음.
- 확인: `test/render/sandstorm-fx.test.js`(구조물 표시 선정·SP0 회전 아래 네 사본의 흐름 방향·방향별 이름·MultiTex 유니폼·장치 모델), `status-buff-fx.test.js`(오퍼레이터 둘·적 없음),
  `test/content/tokens_devices.test.js` 「沙尘暴」(상태 `fx`·`fieldMeta().storm`·카드로 꺼짐), `test/match/custom-first-half.test.js`(실제 판 경로·보스 필드 두 절반).
  화면: Windows Chrome 커스텀 단독 m06 판(3D·2D 보드) — 바람 맞는 구조물 위 모래, 오퍼레이터 머리 위 아이콘, 위쪽에 구조물이 있는 칸은 없음, 적 감속 이펙트 없음.
  [화면 미확인] 화면 모래 판의 진하기·먼지 위치, 오퍼레이터 몸 모래 소용돌이 크기 — 공식 녹화와 대조 전.

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
- **자기 버프가 사라짐 — 상한 말고 다른 원인** (관리자 결정 「오래 가는 상한 48 유지」 + 재제보: 이격 리드(焰影苇草)도 같음): 스킬 활성 루프 354개(126명,
  `fxmap.js activationEffects`)를 실제 프리팹으로 FxInstance에 15초 돌려 봄(작업용 감사 스크립트). 리드 S3 `reed2_skill_03_buff_01~04`·첸 S3·위 S3 버프는
  모두 반복 입자가 있어 상한 분리(위)만으로 남는다. 따로 고친 것 두 가지(`fxplayer.js`): ① **메시** — 반복 입자 없이 메시만 있는 프리팹은 첫 프레임에
  `done`이라 바로 지워졌다(浊心斯卡蒂 S2 `skadi2_skill_02_buff`, 寒芒克洛丝 S2, 号角 S3 `_buff_02`, 耀骑士临光 S3 `_a`, 伊内丝 S2, 信仰搅拌机 S3 …;
  추출본 전체에서 클립·입자 없는 메시 프리팹 28개). Unity의 MeshRenderer는 이펙트 오브젝트가 있는 동안 그려지므로 메시가 있으면 멈출 때까지 산다
  (`holdMeshes`; 버프는 주인과 함께, 한 번짜리는 호출 쪽 `until`로 끝남). ② **반복 클립** — 클립의 Unity 반복 플래그(`m_LoopTime` → fx_extract.py `loop`,
  추출 720개 중 188개)를 무시하고 마지막 프레임에 멈췄다 → `t % len`으로 반복하고 이펙트를 끝내지 않음(`clipLoops`). 남은 13개는 공식도 한 번만 터지는
  반복 없는 입자 프리팹(`_call`, `_start`, `_range` 펄스, 아스카론 S3 `ascln_skill_03_buff_02` 등)이거나 빈 프리팹, 또는 꺼진 노드 아래 입자(님프 S3 range,
  백파이프·치우바이·비질 S3 일부 — 2026-10-08 시험 적용 「꺼진 노드 아래 입자 안 그림」(65bf7da3) 대상, 그 결정 대기). 테스트 `test/render/fx-held-effects.test.js`. [화면 미확인]
- **望 바둑돌이 겹쳐 보임** (제보; sim 확인: 실제 매치 경로 m01–m04 × S1/S2/S3 × 배치 4 × 시드 4, 매 틱 두 돌이 한 칸에 없음): 돌이 跟子 칸으로
  돌아오면 sim이 같은 틱에 그 跟子를 `retreat`하는데(PRTS 铸子 备注, 2026-10-09 결정), 렌더는 跟子 뷰에 보통 죽음(쓰러짐 클립 ≥0.35초 + 페이드 0.55초)을
  틀어 돌아온 돌과 한 칸에서 겹쳤다. 클라에서 跟子는 투사체(`projectile_chr_wang_stone1/2/3`: `_mainEffect` 없음, 멈출 때 칸 이펙트를 지움
  `_clearEffectsOnTileOnStop` 1) — 쓰러짐·페이드가 없다. 고친 것: `app.js followerIds`('summon' fx `follower`)의 'die'는 다음 프레임에 뷰를 지우고 죽음
  입자도 없음. 날아가는 跟子와 칸 위 돌을 함께 그리는 경로는 없음(우리는 跟子 비행을 안 그림 — 공식도 `_mainEffect`가 없어 날아가는 그림이 없음).
  [추정·남김] 공식 跟子의 돌 그림은 `wang_passive_01_buff`의 `qizi (1)` 노드(클립으로 움직이는 렌더러 — 추출기가 못 옮김, 아마 스프라이트)이고 우리는 대신
  돌 토큰 모델을 그린다. 테스트 `test/render/wang-follower-exit.test.js`. [화면 미확인]
  2026-10-17 정정: `qizi (1)`은 내장 Quad 메시(재질 `wang_14`, 그림자 `andi`도 Quad)이고 2026-10-17 재추출로 그려진다 — 시작 이펙트 `wang_passive_01_start`의
  낙하 돌 `qizi`(0.2333초에 꺼짐)도 함께. 돌 토큰 모델과 겹쳐서 **跟子는 이펙트의 돌만 그린다**(관리자 결정 2026-10-17 — 공식: 跟子는 투사체라
  모델이 없음): 'summon' `follower`에 `fxgame.js`가 `units.js drawnByFx(stonesOn)`을 걸어, 공식 돌 이펙트가 도는 동안(품질 낮음·추출물 없음이면
  모델로 돌아감) 그 뷰는 모델·마름모·그림자를 안 그린다. 칸 이펙트 `wang_passive_01_buff`(쉬는 돌 `qizi (1)`·그림자 `andi`, 클립 반복이라 跟子가
  떠날 때까지)는 던짐이 닿는 `THROW_S` 0.25초 뒤 — 클라 순서(`_preDelay` 뒤 착지, 그때 `_effectsToTileWhenStart`) [추정: 시뮬의 'summon' = 던짐 시작].
  놓은 棋子(`token_10064_wang_stone1` 배치)는 모델 그대로. 확인: Windows Chrome 디버그 아레나(S1, 자동 棋子) — 跟子 뷰 6개 모두 모델·그림자 꺼짐,
  칸마다 돌 하나(跟子 = 이펙트 돌, 棋子 = 모델), `wang_passive_01_start` → 0.25초 뒤 `wang_passive_01_buff`. 테스트 `local-deploy-drop.test.js`·
  `wang-stone-fx.test.js`. [화면 미확인: 실제 판]
  같은 날 관리자 확인(아레나) 「재능 추가 바둑돌과 같이 그려지는 이펙트가 불일치」: 활성 휘감김(`wang_passive_01_buff_02`)·연결선(`token_wang_passive_01_line`)이
  공 높이(`STONE_BALL` 0.18)로 올라가 이펙트 돌 위에 떠 있었다. 그 올림은 놓은 棋子 모델의 공(뿌리 위 0.18)에 맞춘 것 — 跟子의 공은 칸 점의 `qizi (1)`이고,
  클라는 활성 이펙트를 그 투사체 위에 만든다(`WangStoneHitBehaviour.PlayStoneTriggeredEffect` RVA 0xA935C0 → `CreateEffect`, 투사체 `_triggeredEffect`),
  프리팹이 휘감김을 제 높이(`line` 0.13–0.2)에 둔다. 공식도 跟子는 모델이 없다: `projectile_chr_wang_stone1/2/3`의 `Body`는 빈 노드, 렌더러 없음, 그림은
  `EffectBehaviour`(`_effectsToTileWhenStart` 칸 이펙트·`_effectOnTrigger`·`_effectsWhenHit`)와 던짐 `WangVisualStoneMarkAbility`(ProjectileToTile)의
  `_startEffect`뿐. 고친 것: 跟子(`follower`, 공식 돌 이펙트가 돌 때)의 연결선·활성 이펙트는 칸 점에(올림 없음), 놓은 棋子는 그대로 공에. 확인: 아레나
  2배 픽셀 잘라 보기 — 휘감김이 공을 감싸고 연결선 십자가 공 중심을 지나 공식 캡처(비공개 조사 기록 2026-10-07 「공식 바둑알 빛 위치」)와 같은 배치.
  2026-10-22: 놓은 棋子 모델이 프리팹의 FaceSwitcher 자리로 내려가(render.md 「모델 위치값·그림자」) 공이 칸 점 ±0.05칸 — 跟子의 공과 같은 높이.
  `ballAt`은 옮긴 모델 뿌리에서 `STONE_BALL` 0.18을 올리므로 놓은 棋子의 활성 이펙트·연결선 끝도 같이 내려간다(跟子 쪽은 그대로).

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
  능력 hit 이펙트 + 투사체 `_effectsWhenHit`/`_effectsWhenReached`(≤ 2, `_useOwnerToTargetDirection`은 공격자 → 대상)와 대상에 거는 버프의 자기 이펙트(2026-10-11: 버프 동안 유지·이름당 하나 — 아래 「입력 대상·루프 타격·클립별 이펙트·배치 이펙트」 ⑥), 'spawn' → 시작 이펙트(루트 `_startEffect`만 — 아래 「모드 전환」) + 평생 붙는 자기 버프의 이펙트(`aura` — 2026-10-21부터 클라 능력 클래스로 고름, 아래 「적 상태의 버프 이펙트」; 가상적: 갑주 `enemy_acstmk_buff_1` 등)
  루프(2026-10-11 디컴파일 2라운드로 확정: `AttachEffectOptions.OnEvent`(RVA 0xB14330) — ON_ATTACHED(태어날 때·모드 전환으로 능력이 붙을 때)부터 ON_DETACHED까지, 재생 속도 1.0), 'die' → 사망 이펙트(그 자리; 아래 「사망 이펙트」), 'leak' → 루프 끝. 시전 이펙트는 능력 재생 속도, 타격은 1.0(위). 모드가 바뀌면 이전 모드의 루프 시전
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
  2026-10-21(이펙트 묶음 F)부터 모든 적의 이펙트가 뽑혀 있다(`--extract --all`, 아래 「적 상태의 버프 이펙트」) — 凋零骑士·陷落雪祀·杰斯顿·迷路的巨像
  스킬 탄 꼬리도 그려진다(그 전: 黑云 FireWeapon·碎铳之簧·管·弦만).
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
  타격 + `life`) → 0.5초 더 그린 뒤 멈춤(`_delayToFinish`), 대상 사망·출처가 사라짐 → 바로 끝; `life` 없음(무한) → 프리팹 길이 — 2026-10-11 디컴파일 2라운드: 공식 무한은 「버프가 없어질 때까지」(`_finishIfBuffNotExists`)라 다름(작음), 남김(그 버프의 끝을 렌더가 모름). [추정: 버프는 공격의 타격 때 붙음(`_activeBuffs`
  적용 시점 코드는 안 읽음); 버프가 있을 때 다시 맞으면 연장(maxStackCnt 1); 오프셋 y는 높이로]. 炎佑 `enemy_acloon_skill_loop_1_line`(模式甲 Skill)은 우리가
  模式乙만 써서 안 나옴. 선 프리팹은 2026-10-21 전체 추출로 뽑혔다.
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
  아무것도 안 보임 — 공식대로). `common_enemy_die_01`은 2026-10-21 전체 추출로 뽑혀, 이제 자기 사망 이펙트가 없는 적은 모두 절차 퍼프 대신 그것.
- 위 클래스·메서드는 켜진 Lua 핫픽스(`DefinedFix.lua` en_US·zh_CN)에 없음.
- 안 한 것: 버프 노드의 다른 이펙트(방패 깨짐·끝 이펙트 — 2026-10-11 디컴파일 2라운드: 전용 코드는 없고 템플릿 노드 `Nodes.CreateEffect`(RVA 0xB90880)가 그 노드의 이벤트(ON_BUFF_FINISH·ON_TAKE_DAMAGE …) 때 한 번 만든다; 2026-10-11: 추출기가 이벤트별로 나눠 기록 — 아래 「위수 협의 템플릿 이펙트」; 2026-10-21: ON_BUFF_FINISH 것은 상태가 끝날 때 한 번 — 아래 「적 상태의 버프 이펙트」, 피격(ON_TAKE_DAMAGE) 것은 아직), 炎佑 선(우리가 안 쓰는 模式甲), 소리(audio 담당). 화면 확인 없음.
- (2026-10-14, 상태 아이콘 정리 — docs/rules/ui.md ⑤ 「버프 이펙트」; 2026-10-21 하나씩 대조함 → 아래 「적 상태의 버프 이펙트」) 머리 위 상태
  아이콘이 빠지면서 적·보스의 아래 sim 버프는 바인딩이 그 버프의 이펙트를 그릴 때만 보인다: `ab:warden`(enemy_1516_jakill)·`ab:xiShield`
  (enemy_1517_xi)·`ab:wolfGuard`(enemy_1535_wlfmster)·`kitLeaderMisc`의 `ab:burnDot`·`ab:sandDef`·`ab:rockPower`, `ab:artsBarrier`, 부활·KO 무적(`reborn` `…:inv`),
  `ab:exposed`, `boss:helmGuard`(enemy_9013_acstmk)·`boss:hover`(enemy_9014/9015)·`boss:dash`(enemy_9017_achunt)·`boss:springShield`(enemy_9018~9020)·`boss:eternal`
  (enemy_9022_acdumm)·`boss:equip`(enemy_10028~10030), 굴절(EN 템플릿에 refract 버프 없음 — 적 프리팹 쪽은 안 봄). EN 템플릿에서 이펙트가 있는 적 무적: `common_invincible_01`
  (enemy_amiy·wdslm·trcerb·cstlrs·bsnake·pppdth 등 10개 버프), `_02`(mmamiy), `_03`(mirbst), 전용(fthlgj·ldevil·ubbphw·lrking·ristar …) — 이 적들이 우리 웨이브에 나오는지도 안 봄.
- 확인: `test/local-patch-fxspawn.test.js`(적이 바인딩한 muzzle/특수점 이펙트가 그 적의 점을 찾음 — 클라 데이터의 빈 곳 2개 목록), `test/render/enemy-fx.test.js`, `test/render/enemy-fx-layer.test.js`(모드 전환 → audio.enemyMode, 사망 이펙트 대체, 대체 beam, 冰凌 칸별 시각, 직선 사격).

### 적 상태의 버프 이펙트 — 평생 버프·상태가 가리키는 클라 버프·재생 无敌·隐匿·끝 이펙트 (2026-10-21, 이펙트 묶음 F, 디컴파일 확인)
근거: EN 클라 적 프리팹 `battle/enm_pfb_*.ab`(능력 컴포넌트의 MonoScript, BuffData `abnormalFlags`), 버프 템플릿 덤프(관리자 노트의 2026-10-10 덤프),
디컴파일(10-14 EN 덤프) `PassiveBuffAbility.GetPassiveBuffs`(RVA 0xC3FEF0)·`AuraAbility.DoAttach`(0xC21750)·`Unit._InitUnitModes`(0x856350)·
`UnitMode.InitOnce`(0x86FA00)·`UnitMode.OnInit`(0x86FF90). 클라는 상태를 그 버프의 이펙트로 그린다(위 「적 이펙트 바인딩」, docs/rules/ui.md ⑤).
- **평생 버프(`aura`)를 능력 클래스로 고름**: 예전에는 특성·CommonAbilities의 템플릿 `empty` 버프를 다 태어날 때부터 그려, 재생 뒤에만 붙는 无敌
  (`common_invincible_01` — '즈자이'·데겐블레허·'어벤져'), 체력 절반 아래 분노(`skulsr_buff_01_start` — '폼페이'·'즈자이'), 오라가 오퍼레이터에게
  거는 버프(자로, '늑대 군주'의 `enemy_wlfmster_B_buff_02_02`, 디펜더-4·프로스트 등)가 처음부터 붙어 있었다(대부분 안 뽑혀 있어 안 보였을 뿐).
  이제 `enemy_bindings.py`가 버프를 가진 컴포넌트의 클래스(`BUFF_CLASSES`)를 기록하고, `aura`는 `PassiveBuffAbility`의 패시브 버프(Attach부터
  Detach까지 주인에게 — 그래서 모드 밖이면 평생)와 `AuraAbility`의 `_passiveBuffs`·`_selfOption` INCLUDE인 `_buffs`·자기 `_effects`(범위 표시,
  DoAttach가 주인에 만듦) 중 끝나지 않는 것만: INFINITY이고, 자기 템플릿이 스스로 끝내지 않고(`FinishBuff`), 다른 버프 템플릿이
  `FinishBuffsById`로 끝내지 않으며, 다른 능력 밑에 붙은 능력(`ActiveAbilityWrapper` 아래 — 자로의 FearAura, 더블린 계열의 traitAbility)이 아닌 것.
  ToggleablePassiveBuffAbility(조건부: 체력 절반·隐匿)·RebornTalent·BuffAfterAffecting·AuraAbility가 남에게 거는 것은 빠진다. 모드가 하나뿐인 적의 모드
  안 버프도 평생. 바뀐 적(쓰는 것): 새로 그림 — 디펜더-4·프로스트·후회하는 영혼의 성배 범위 표시, 가상적: 총 방패 `enemy_achunt_shield`, 패밀리
  멸살자 눈 `enemy_sgkill_eye_01`, 센구안·배리어 등 20여 종(불타는 덩굴 `enemy_ftsjc_buff`는 첫 공격이 끝내 빠짐); 뺌 — 위 无敌·분노, 첸사 공격 단계(`enemy_sfji_atkup[effect1..4]` — 공격
  수로 바뀜, 넷을 한꺼번에 그리던 것), 패밀리 멸살자·가상적: 골극 隐匿(아래). 여러 모드인 적의 모드 안 버프(`modes[i].aura`)는 공격 클립으로 모드를
  가를 수 없어(거의 다 `Attack`) 그리지 않고, 시뮬 상태가 가리키면 아래 `buffFx`로 그린다(가리키는 상태가 없는 평범한 죄수 계열 해방 모드,
  무덤지기 석상 모드별, '거대하고 못생긴 것' 기계 모드 등은 안 그림).
- **시뮬 상태 → 그 적의 클라 버프(`buffFx`)**: 렌더 표 `buffFx` { 클라 버프 키: [이펙트] }(적이 가진 모든 자기 이펙트 버프 + 템플릿 `CreateBuff`가
  만드는 파생 버프, 한 키가 여러 모드에 있으면 `<키>#<모드 번호>`), `buffEnd`(그 버프 템플릿의 ON_BUFF_FINISH `CreateEffect`). 시뮬 적 버프의 `fxTag`
  `'buff:<클라 버프 키>|…'`(docs/SIM.md)를 상태 켬 이벤트가 `fx`로 싣고, `fxstatus.js wantedStatusFx`가 `fxgame.js enemyBuffFx`로 그 적의 이펙트를
  고른다(맨 키는 모든 모드의 것). 끝 이펙트는 살아 있는 유닛에서 그 상태가 꺼질 때 한 번(`statusOnce`) — 죽거나 떠날 때는 아님 [추정: 죽을 때
  ON_BUFF_FINISH가 도는지는 안 읽음]. 개별 대조(2026-10-14 목록):
  | 시뮬 상태 | 적 | 클라 버프 → 그리는 것 |
  |---|---|---|
  | `ab:warden` / `ab:killer` | 제셀톤 윌리엄스 | `Modes/Default/Talents/Enhance` `jakill_enhance#0` → `enemy_jakill_buff_01_start` / R 모드 `jakill_enhance#1`·`[eff1]`·`[eff2]` → `_02_start`·`_02`·`_03` |
  | `ab:xiShield[a]`·`[b]`·`[c]`(층마다 상태 하나) | '즈자이' | `ShieldBurst(Reborn)` `enemy_xi_s2[shield][a]`·`[b]`·`[c]` → `enemy_xi_skill_02_buff`·`_01`·`_02` — 층마다 깨지면 그 층 이펙트만 꺼짐(rules/sim.md 「리더 방벽 층 셋」) |
  | `ab:xiReborn` | '즈자이' | RebornTalent `reborn_up` → `skulsr_buff_01_start` |
  | `ab:wolfGuard` / `ab:wolfRage` | 자로, '늑대 군주' | M1 `enemy_wlfmster_reduce_damage` → `enemy_wlfmster_A_buff_01` / `enemy_wlfmster_m2_eff` → `_B_buff_01` [추정: 클라는 재생 시작(M1 Reborn의 BuffToOwner)부터, 우리는 재생 끝부터] |
  | `ab:sandDef[1..3]` / `ab:lowhp` | 래트킹 | `Talents/shield` `mousek_shield[a/b/c]` → `mousek_buff_01/02/03_start`(층마다 `fxTag` 하나, 그 층이 깨지면 꺼짐; DEF 보너스 `ab:sandDef`는 안 그림) / `mousek_t` → `skulsr_buff_01_start` |
  | `ab:rockPower[1..3]` | 머드락(적) | `[shield][refresh]`가 만드는 `enemy_mdrock_s_2[shield_a/b/c]` → `enemy_mdrock_skill_buff_01/02/03`(층마다 하나; HP·공속 보너스 `ab:rockPower`는 안 그림) |
  | `ab:lowhp` | 스컬슈레더·'폼페이'·리벤져·'어벤져' | `skulsr_t_1`·`lslime_t_buff`·`reveng_t_atkup`·`enemy_reid_atkup_effect`(토글 버프) |
  | `ab:rage` | 부패한 기사 | `dekght[trigger_rage]`의 끝이 만드는 `dekght[rage]` → `dekght_buff_04_start` |
  | `boss:hover` | '갑주를 베는 검' 둘 | 떠 있는 모드 GeneralAbilities `acstma/acstmb_passive[unmovable]` → `enemy_acstma_invincible` |
  | `boss:springShield` | '총을 부수는 리드' 셋 | `actrpa/b/c_t_1`(깨지면 `[regenerate]` 끝이 다시 만듦) → `enemy_actrpa/b/c_shield` |
  | `ab:reborn:inv`(재생 뒤 无敌) | 재생하는 적 전부 | 그 적의 INVINCIBLE 플래그 버프(`inv`, 재생 뒤에 붙는 것): 대개 `common_invincible_01`(자로는 M2 Passive2 `p2_invincible`) |
  | 隐匿(플래그) | 隐匿 적 | 그 적의 INVISIBLE 플래그 버프(`stealth`): 대부분 `common_invisible`(그대로), 가상적: 골극 `enemy_acbunn_buff`, 패밀리 멸살자 `enemy_sgkill_buff`, 데겐블레허 둘째 형태 `enemy_blkswb_buff_03` |
  | `boss:eternal` | 가상적: 현 | 평생 `acdumm_passive` → `enemy_acdumm_invincible`(전부터 `aura`) |
  | 굴절 | 더블린 계열 | 평생 `enemy_refracting` → `enemy_dushdo_2_buff_01`/`_03`(전부터 `aura`; 침묵 때 끝나는지는 안 봄) |
  | `boss:helmGuard`·`ab:exposed`·`boss:equip`·`ab:burnDot` | 가상적: 갑주·중장갑 정찰병/천리안·알리스테어 장비·'폼페이' | 클라 버프에 이펙트 없음(`enemy_acstmk[low_hp]`, `enemy_tgshd_exposed_mark`·`weak[limit]` 모두 `empty`) — 그대로 안 그림 |
  `ab:artsBarrier`(기본 키)는 지금 쓰는 적이 없다(둘 다 자기 키). 끝 이펙트(`buffEnd`)가 있는 것은 자로의 `enemy_wlfmster_fearcage`(오퍼레이터 쪽,
  시뮬 상태가 안 가리킴)뿐 — 아래 오퍼레이터 둘이 같은 길(`END_FX`).
- **버프 노드의 끝 이펙트(오퍼레이터)**: `fxstatus.js END_FX` — 캐서린 장치 `catsld_t_1[shield_mark]` ON_BUFF_FINISH `CreateEffect` `token_cathy_catsld_shield_01_end`
  (방패가 깨지거나 시간이 다 돼 표식이 끝날 때), 머드락 마지막 층 `mudrok_t_1[shield_c]` — [shield_a]·[shield_b]가 없을 때 맞으면 `mudrok_buff_01_end`
  (렌더: `LAYER_FX` 첫 층 `mudrok_buff_03_start`가 꺼질 때). 층을 다시 얻을 때의 `mudrok_buff_01_begin`, 맞을 때마다의 `common_heal_hit_01`은 안 그림.
- **모드 번호 = 프리팹 `_modes` 순서(확인)**: `Unit._InitUnitModes`가 `_modes[i].InitOnce(this, i)`(가상 슬롯 6)를 부르고 `InitOnce`가 `index`(0xB0)에 i를
  넣으며, `UnitMode.OnInit`의 `GenerateSignalId`가 그 `index`를 쓴다 — 렌더 표·소리 표(`local-char-audio.json modes`)의 번호와 같다. (렌더가 공격
  클립으로 모드를 가르는 한계는 위대로.)
- **전체 추출·떠난 것**: `used_enemies`가 首领 이벤트(`data/choices.json`)의 리더 14종을 빠뜨려 그들 이펙트가 안 뽑혀 있었다 — 넣음. 그리고
  `enemy_bindings.py --extract --all`로 모든 적의 이펙트(지금 797개, 전: 384)를 뽑음 — 凋零骑士·陷落雪祀·迷路的巨像 스킬 탄, 리더 전부, 가상적: 갑주 선,
  `common_enemy_die_01`(이제 자기 사망 이펙트가 없는 적은 절차 퍼프 대신 그것).
- 안 한 것: '즈자이' 방벽의 마지막 층 `_buff_03`·맞을 때마다 `_specifyBlockEffect` `_buff_hit`(층 양·깨지는 순서는 rules/sim.md 「리더 방벽 층 셋」),
  래트킹 마지막 층 뒤 NoShield 모드 `mousek_buff_01_end`, '리드' 추적의 `achunt_dog_silence`(`enemy_actrpa_skill_a`, IMMEDIATELY), 자로 【远古威慑】가
  오퍼레이터에게 거는 `_B_buff_02_02`, 재생 중 이펙트(RebornTalent `_effects` — 제셀톤 `enemy_jakill_reborn_01~03_start` 등, 만드는 순간 안 읽음),
  천리안 사망 `enemy_hummbd_die_02`(ON_OWNER_KILLED, 침묵이 아닐 때), 불타는 덩굴 `SwitchableEffectByBlackboardValue`(아래 「추출 누락 보고」),
  더블린 불꽃 전사 재생 无敌 `enemy_duskls_revive_2`. 화면 확인: 아래.
- 확인: `test/render/enemy-buff-fx.test.js`(enemyBuffFx·wantedStatusFx·끝 이펙트), `test/sim/enemy-buff-tags.test.js`(상태 이벤트의 `fx`, 重弩突袭者 줄),
  `enemy_bindings.py` 재생성 diff(위 `aura` 바뀐 적 목록을 하나씩 클래스로 확인).

### 보스 토큰·장비 이펙트 — 子代·黄金回响·알리스테어 장비 (2026-10-15)
근거: EN 클라(2026-10-14 판) 토큰 프리팹 `pkgrps/btl_pfb_tokens_0`(子代 `trap_039_dstnta`)·`_1`(黄金回响 `trap_185_vtlntw`), 스킬 프리팹
`battle/prefabs/[uc]skills.ab` `sktok_dstnta`, 버프 템플릿(`trap_tentac_triggergrow`, `enemy_vtmstr_equip_A/B/C[char]`), 디컴파일 `Buff.OverrideGroup._DoAddInternal`
(새 덤프 RVA 0x39DF310). 규칙은 docs/rules/sim.md 「盐风主教昆图斯 【断裂生殖】 子代」·「阿利斯泰尔 王权号令 장비 줍기·【莫非王土】 黄金回响」.
- **추출**: `enemy_bindings.py`가 웨이브 템플릿·enemies.json `devices[]`의 적 진영 토큰(`trap_*`)도 읽는다 — 토큰 프리팹(적과 같은 방식) + 그 토큰 스킬의
  프리팹(`skill.prefabId`, 능력 경로 `Skills/<prefab>`; 이미터가 프리팹 루트에 있음), 모델 점은 토큰 번들에서. 렌더 표 키는 토큰 키(`fxgame.js ebindOf`가 defId로 찾음).
  사망 이펙트 기본값: Character 토큰은 `common_char_die_01`(`Character.get_deadEffect`, 위 「입력 대상·루프 타격·클립별 이펙트·배치 이펙트」의 배치·사망 이펙트),
  **`Trap` 토큰은 없음** — `Trap.get_deadEffect`(0x84C240)는 `_deadEffect`를 그대로 돌려준다(2026-10-15, 공식 대조 fx-c). 子代·黄金回响은 둘 다 `Trap`(루트에
  `Trap`만의 필드 `_withdrawable`·`_hitRangeId`)이라 `enemy_bindings.py`가 기록에 `trap: 1`을 달고 `dead` 기본값을 ''로 쓴다; 렌더 `edeadOf`는 ''면 아무것도
  안 틀고, `ownsDeath`가 참이라 2D 사망 연기도 안 그린다. 子代(`_deadEffect` '')는 사망 이펙트 없음(옛: `common_char_die_01`), 黄金回响은 자기 것.
- **子代**: 시작 `trap_dstnta_birth_01_start`(루트 `_startEffect`). 天赋 `Talents/1` 버프 `tentac_grow`(LIMITED `grow_duration`)의 `trap_dstnta_idle_01_start`는
  버프가 끝나며 Grow를 시전하므로(템플릿 ON_BUFF_FINISH `TriggerAbility` Grow) **Grow가 시작될 때까지** 유지 — 렌더 표 `auraEnd` { 이펙트: 능력 }, `eskillFx`가 그
  능력이 시작될 때 끈다. 隐匿 `common_invisible`은 상태 레이어가 sim 은신으로 그린다(그대로). Grow(`Modes/Default/Body/Grow`, `_animKey` Start_02)의
  `trap_dstnta_birth_02_start` — 모드 본체의 공격 아닌 능력도 이름으로 스킬 표에 넣어(`skill_keys`) 모델이 Start_02를 틀 때 나온다. 摄食(`sktok_dstnta`): 시전 이펙트
  `trap_dstnta_attack_01_start`(ON_CAST_START → ON_CAST_END 루프)는 붙잡기 끝까지, 타격 `trap_dstnta_attack_01_hit`(`_onlyOnce`, 끝 이벤트 ON_CAST_END)는 첫 타에
  붙잡힌 오퍼레이터 위에 놓여 끝까지(렌더 표 `hopt`). 끝은 sim이 알린다: fx `enemySkill`에 `hold: 1`, 놓을 때 `enemySkillEnd` { id, ability }(docs/SIM.md) —
  [추정] 끝 이벤트를 놓치면 40 s(`ESKILL_HOLD_CAP`, 子代 수명 35 s)에 끊는다. 기절 `buff_stun`(`trap_tentac_s[stun]`)은 상태 레이어가 sim 기절로 그리므로 타격
  버프로는 안 묶는다(`STATUS_HIT_DRAWN` — 한 유닛에 두 개가 되던 것).
- **黄金回响**: 공통 능력(루트 `_commonAbilities` = `Others/Direction/commonAbility` — CommonAbilities 경로 밖)의 이펙트만 있는 버프 두 개 `trap_vtlntw_buff_01`·`_02`가
  늘 붙어 있다: 같은 키 `trap_vtlntw_effectA`지만 `overrideType` DEFAULT는 `_DoAddInternal`이 큐에 그냥 넣으므로 둘 다 남는다. 이제 루트 `_commonAbilities`면 경로와
  상관없이 aura로 본다(덤: 이 모드에 안 나오는 enemy_1513_dekght `Common/EffectBuff`, enemy_2008_flking `PassiveEffect`도 aura가 됨 — 추출 안 됨). 일반 공격
  `Attack`: 시전 `trap_vtlntw_attack_start_01`(ON_SPELL_ON → ON_CAST_END), 탄 `projectile_trap_vtlntw` 꼬리·맞음, 사망 `trap_vtlntw_die_01`.
- **알리스테어 장비를 든 오퍼레이터**: 장비 `Talents/2`의 `…[char]` 템플릿이 거는 `enemy_vtmstr_equip_char[A/C/B]`(INFINITY)의 `overrideEffectKey` —
  未装配刀片 `enemy_vtswd_buff_01`, 防护背心 `enemy_vtshld_buff_01`, 冲击式施术单元 `enemy_vtwand_buff_01`(`_spawnLocation` 2 = HIT 점) — 를 그 전투 동안
  (`fxstatus.js KEY_FX` 'boss:heldSword'·'boss:heldVest'·'boss:heldWand'). 추출 목록: 렌더 표 `handed`(天赋의 `…[char]` 버프 템플릿 이펙트 — 이름 규칙으로 고르지만
  템플릿 `enemy_vtmstr_equip_A/B/C[char]` CreateBuff의 `overrideEffectKey`와 같음을 확인, 공식 대조 fx-b). 子代 摄食이 매 타 대상을 다시 고르면(docs/rules/sim.md)
  새 대상 위에도 첫 타에 `_onlyOnce` 타격이 놓이고 앞 대상의 것은 채널 끝까지 남는다(`eskillHit` 대상별 — 클라도 ON_CAST_END까지).
- 확인: `test/render/enemy-fx-layer.test.js`(지속 스킬: `hold` → 3 s 넘어도 그 스킬의 타격, `_onlyOnce` 타격 유지, `enemySkillEnd` 뒤 끝),
  `test/content/enemies_bosses.test.js` 「子代: the nearest operator first…」(sim fx), `Trap` 사망 이펙트 없음(같은 렌더 테스트 `enemy_trap`). [화면 미확인]

### 선발 추가 3명 — CN 클라이언트 (2026-10-11)
- 켈시 에스페란타(凯尔希·思衡托)·클레멘티아(克莱门莎)·안젤리나 더 멜로우 위시(予愿安洁莉娜)는 EN 클라이언트에 없어 CN 클라이언트(운영 노트 「CN 클라이언트」)에서
  뽑았다. 도구·형식은 EN과 같고(번들 이름·Unity 버전·LZ4AK 같음), 세 명만 골라 기존 EN 추출물은 건드리지 않았다:
  - 이펙트 번들: `fx_extract.py --game <CN> --cab-index .cache/fx-cab-index-cn.json --bundle kalts2 --bundle clemnt --bundle aglna2`
    (33·27·43개). CAB 색인은 CN 전용 파일(EN 색인은 절대 경로라 따로, 만드는 데 약 17분). 「이따 봐!」 표식 이펙트 `token_aglna2_agairp_01`은
    공용 토큰 팩에서 `--bundle aglna2_token --pack pkgrps/btl_pfb_fx_token_3.ab --match '^token_aglna2_'`.
  - 모드·붙는 자리·소리 신호: `char_modes.py`·`char_points.py`·`char_audio.py --client <CN> --id <세 명>` — 세 파일 모두 세 명만 추가(다른 항목 그대로, JSON 비교).
  - 공격 타이밍: `attack_timing.py`는 `--id`가 없어 CN 전체를 임시 파일(`--out`)로 뽑고 세 명만 `tools/assets/local-attack-timing.json`에 합쳤다
    (CN 값은 EN에서 뽑은 기존 143명과 전부 같았다).
  - 战术锚点 모델: `extract.py TOKEN_SPINES`에 추가, `--only spine/token/<id>`로 그것만 뽑음. `fetch-assets --local-spines`가 디스크에 있는 모델로
    메타데이터를 다시 쓰므로, 이 컴퓨터에 없던 4개(爬行号·风雪之眼 3개)도 CN에서 뽑아 기존 6개 항목이 그대로임을 확인했다. 클립 역할은 upstream 고침
    (`tools/assets/spine.mjs LOCAL_SPINE_ROLES`: Start/Idle/Die가 그림을 숨겨 0초 Default 자세에 머묾 [추정]).
  - 정비 카드 일러스트: `chararts_extract.py --game <CN>/StreamingAssets/AB/Windows --id …`(CN은 새 설치라 번들이 `StreamingAssets`에 있다).
- 자동으로 붙는 것: 공격·스킬 시전·타격·투사체 꼬리·스킬 버프(`modes.json`). 방향별 사본이 있는 오퍼레이터가 14 → 16명(클레멘티아·안젤리나 더 멜로우 위시).
- **CN 클라이언트의 이펙트 컴포넌트는 구조가 다르다**(2026-10-11, 관리자 제보 2건의 원인): 루트 이펙트 컴포넌트(`_spawnLocation` 등, `fx_extract.py root_effect`)는
  EN이 `_subFXDelayConfigs` 뒤 28칸, CN이 30칸 — `_rotateType` 앞에 한 칸(int, 비교한 것 전부 0)과 끝에 한 칸이 더 있어 `_rotateType`부터 한 칸씩 밀린다.
  FollowMountPoint(`mount_point`)는 EN 7칸, CN 9칸 — `_followScale` 뒤에 float 1.0과 int 0. 같은 프리팹을 두 클라이언트에서 읽어 맞춰 봄(이펙트 158개:
  texas2·etlchi·chen3·swire 전부 일치, 마운트: swire·texas2·horn·svash2·etlchi). 그 전엔 CN 추출물의 `spawn`이 `_rotateType` 값이었다(클레멘티아 S3 범위 7 → 2로 읽혀
  몸 높이로 떠 보임 — 제보 「S3 직사각형이 본인 칸과 앞 3칸에 딱 맞아야」). 고친 뒤 CN에서 다시 뽑은 첸 더 던스트릭·스와이어·엔텔레키아·텍사스 디 오메르토사 125개 중
  123개가 EN 추출물과 같다(나머지 2개는 CN 쪽에만 `lineDyn`이 있음 — EN 추출물이 그 필드보다 오래됨). 세 명의 번들을 다시 뽑았다.
- 키트 사건 연결(`fxgame.js pickFx`, 근거 = CN `[uc]projectiles.ab`의 `_mainEffect`·`_effectsWhenReached`와 버프 템플릿(`battle/buff_template_data`)의
  `overrideEffectKey`·`_effectKey`): 클레멘티아 S2 방축선 = `projectile_chr_clemnt_s2_lr`/`_ud`의 `bullet_01`(가로)/`bullet_02`(세로)가 멈출 자리까지 이동,
  소용돌이 = `_s2_range`의 `bullet_range_01` [추정: 그 투사체가 소용돌이], 운반 중인 적 머리 위 `mark_enemy`(`clemnt_s2[projectile_hit]`); S3 포격 = `_s3`의
  `Mark_all_01`(3번 파동이 프리팹 안에 있어 포격 하나에 한 번, 시뮬 `lock`), 시뮬 `blast` 3번은 대체 그림 없음. 켈시 에스페란타 S2 착탄 = `_s2_dmg`/`_s2_heal`의
  `range_damage_01`/`range_heal_01`(적/아군 — 시뮬 `aoe`의 `ally`); S3 비행 = `teleport_01`(떠남, [추정: 이름]) + `_s3_2`의 `teleport_trail_01`(날아가는 방향으로
  돌림) + `teleport_end_01`(착지, [추정: 이름]). 안젤리나 더 멜로우 위시 S2 = `aglna2_s_2[flying]`의 방향별 활공 꼬리·`fly_range_01`(吟唱 동안), `[chant_end]`의
  `fly_end_01–03`; 「이따 봐!」 표식 = `token_aglna2_agairp_01`. 이 프리팹들은 `KIT_OWNED` — 이름 규칙(`_range` 루프)이 시전자에게 또 틀던 것을 막는다.
  시뮬 쪽은 fx 내용만 늘었다(`aoe.ally`, `disappear.tx/ty/t`, `dash.chant`; golden 그대로). 디버그 아레나에서 확인: S2 방축선·적 표시, 켈시 S2·S3, 안젤리나 S2
  (클레멘티아 S3 포격은 침식 폭발이 필요해 화면 확인 못 함).
- 안 붙였던 것(켈시 S3 待投放 오퍼레이터의 `teleport_02`·머리 위 표시 `[indicator_fx]`, 클레멘티아 `mark_01`/`mark_02`)은 2026-10-21에 붙임 → 아래
  「안 나오던 공식 이펙트 메우기 … (2026-10-21, 이펙트 묶음 D)」.
- (2026-10-11 뒤) 안젤리나 더 멜로우 위시 S3 비행: `aglna2_skill_03_fly_trail_01` + `aglna2_skill_03_buff_right_01`/`_left_01`이 sim fx `aglnaFlight` 켜기~끄기 동안
  붙는다. 「이따 봐!」 표식 유닛은 몸이 없어(프리팹 `EmptyAnimator`) 이펙트만 그린다 → `diy.md` 「안젤리나 더 멜로우 위시 S3 이동 · 「이따 봐!」 표식」.
- (2026-10-12) 안젤리나 더 멜로우 위시 S2 활공 꼬리·`fly_range_01`은 吟唱 내내가 아니라 **모델이 끝점에 닿을 때까지**(`dash.t`)만 붙는다 — `[flying]`은
  투사체 `projectile_chr_aglna2_s2_fly`가 출발할 때 만들고(이벤트 5) 도착할 때 끝낸다(이벤트 3), 두 이펙트는 그 파생 버프. 모델이 날아가므로 꼬리도 모델을 따라간다
  → `diy.md` 「안젤리나 더 멜로우 위시 S2 활공 모션」.
- (2026-10-12, 관리자 제보 「바닥 타일에 붙는 이펙트가 오퍼와 함께 움직임」) 활공 중에는 **모델만** 날아가고 유닛(엔티티)은 제 타일에 있다. 그래서
  FollowMountPoint 없는 이펙트는 타일에 남는다: `fly_range_01`(`_spawnLocation` 5, 땅 위 줄기 — x −0.5~4.3, `_mainDir` RIGHT·FOUR_DIRECTION)은 출발 타일에
  고정하고 활공 방향으로 돌리며 [추정: 투사체의 진행 방향으로 재생], 발밑의 스킬 버프 `aglna2_skill_02_buff_01` 등 유닛에 붙은 다른 이펙트도 `glideS`의 타일에
  둔다(`fxgame.js` `ex`/`ey` — `lifted`의 땅·몸·이륙 갈래 모두) [추정: 클라이언트 Effect는 모델이 아니라 엔티티에 붙음]. 마운트 이펙트(활공 꼬리,
  `buff_weapon_01/02`, `fly_end_01–03`)는 모델 위 점을 따른다. 실제 판(Windows Chrome)에서 위치 기록으로 확인: 모델 (7,9)일 때 `fly_range_01`·`buff_01`은 (3,9).
  참고: 빈 캐시에선 꼬리·`fly_range_01`이 활공 0.67 s 안에 다 받아지지 않아 안 보일 때가 있다(미리 받기 없음, 그대로).

### 투사체 꼬리 끝내기 — 착탄 뒤 늦게 사라짐 (2026-10-11, 사용자 제보 「언더플로우·애쉬락 투사체가 적에 닿은 뒤 늦게 사라짐」)
- 원인: 날아가는 공식 꼬리(투사체의 `_mainEffect`, 위 「투사체 꼬리」)가 도착하면 `fxgame.js stepTrails`가 `stop()`(방출만 멈춤)만 하고, 인스턴스는 남은 입자가
  다 죽을 때까지 그 자리에 남았다. 언더플로우 평타 `udflow_attack_01_trail_01`의 탄 `bullet`은 수명 5초·반복·1개짜리 입자라 대상 위에 최대 5초,
  애쉬락 `ashlok_attack_01_trail`/`ashlok_skill_02_trail`은 포탄 메시 `gonggaoban`이 불꽃(`xindian`, 수명 ≤ 1.5초)이 다 죽을 때까지 남았다.
- 공식(EN 클라 디컴파일, 아래 메서드는 켜진 Lua 핫픽스 목록에 없음): 투사체가 멈추면 `Projectile.OnProjectileStop`(RVA 0x5FC1A0) → `ClearMainEffectIfNot`(0x5F9550)
  → `Effect.FinishMe`(0xC88FE0). 꼬리의 루트 컴포넌트는 `ProjectileEffect`(추출 프리팹 202개, CN 11개 — `fx_extract.py PROJECTILE_EFFECT_SCRIPT`)이고
  `OnFinish`(0xCB42B0)가 ① `Awake`(0xCB3A00)에서 잡은 첫 파티클 시스템(`GetComponentInChildren<ParticleSystem>` — 활성인 것 중 깊이 우선 첫 번째)을
  자식째 `Stop(true)`(방출만 멈춤), ② `_inactiveOnFinish` 노드를 모두 `SetActive(false)`(탄두·포탄·화살촉 등 — 그 아래 입자도 같이 사라짐). 그리고 풀이
  `delayToRecycle` = `_delayToFinish`(`get_delayToRecycle` 0xCB4E40)초 뒤 이펙트 전체를 거둔다(0이면 바로). 나머지 꼬리·입자는 그동안 계속 돈다.
  `_clearMainEffectWhenReached`가 꺼져 있어도 멈출 때 같은 경로다.
- 값(직렬 필드 순서 — 이름 뒤 `_bodyTransofrm` PPtr, `_subFXDelayConfigs`, 그다음 `_resetMainDir`·`_mainDir`·`_rotate180Y`·`_randomAngle`·`_delayToFinish`·
  `_allowAutoReuse`·`_preloadCnt`·`_flipIfLeft`·`_inactiveOnFinish`·`_inactiveOnHit`; EN·CN 같음): 202개 중 `_delayToFinish` 0.5초 154개, 0초 23개, 1.0초 19개,
  그 밖 1.2·0.35·0.2·0.1(언더플로우)·0.8·3.0초 하나씩. `_inactiveOnFinish`가 있는 것 108개. `_inactiveOnHit`은 0개.
- 고친 것: `fx_extract.py projectile_effect`/`off_on_finish` → 프리팹 `finish`(기존 ParticleEffect `_delayToFinish`와 같은 키)·`offFinish`(노드 번호),
  `--finish-only`가 이미 뽑은 프리팹에 둘 다 쓴다(`--index`도 받음). `fxplayer.js FxInstance.finishMain`(첫 시스템 정지 + `offFinish` 노드 끔·그 입자 제거, 다시 켜지지 않음),
  `fxgame.js finishShot`(finishMain 뒤 `finish`초 뒤 `stop(true)`, 없으면 바로) — 도착한 꼬리(`stepTrails`: 오퍼레이터·적·르무엔 S3 포탄), 토가와 사키코 음표(`endNote`),
  켈시 에스페란타 S3 비행(`shotEnd`). 케이퍼 부메랑(돌아오면 바로 끝, `_delayToFinish` 0)·라플란드 더 데카덴차 늑대(버프로 붙음)는 그대로.
- 영향(바인딩된 꼬리가 예전에 공식보다 늦게 사라지던 것 — 남은 입자 수명 기준 추정 ≤, 공식): 오퍼레이터 50명 — 틴맨·언더플로우·아스트젠 더 라이트체이서·인디고 ≤ 5초,
  파투스 4초, 굼 3초, 비르투오사·패신저·라플란드 더 데카덴차·크루스 더 킨 글린트·스즈란·루멘 2초, 치우바이·르무엔·위셔델·레이즈·혼·님프·티피·애쉬락·토가와 사키코 1.5초,
  왕·포덴코·티티·라플란드·락락·해럴드 1.2–1.3초, 리드 더 플레임 섀도우·인사이더·블레이즈 디 이그나이팅 스파크·아르케토·에이야퍄들라 더 크비트 아스카·사일런스·
  프로방스·노시스·뮤엘시스·샤마르·쉐라·이네스·글래디아·벤델라·비질 0.9–1초, 프라마닉스·에이어스카르페·산크타 믹사파라토·안젤리나·그레이·스노우헌터·
  클리프하트·어스스피릿 0.55–0.8초(대부분 공식 0.5초, 탄두 노드는 공식이 바로 끔). 적 41종 — 웨이브 캐스터·웨이브 리더(반복 입자, 꼬리 상한 시간까지),
  가상적: 흑운 10초, 방문단 공격수 챔피언·살카즈 부패의 전차·최첨단 살카즈 부패의 전차 5초, '염의 가호' 2초, 가상적: 골극·관·현, 제국 아틸러리 타게티어 ×2 1.5초,
  '총을 부수는 리드'·가상적: 총 1.2초, 은신 캐스터·Dor-β호 복제품·아츠 마스터 A1/A2·부유의 표류체·군단 중형 화포·가상적: 갑주·살카즈 왕정군 정예 캐스터·'영장' 1초,
  패밀리 멸살자 ×2·'산크타의 눈'·폭탄새·작열/폭염 원석충·더블린 그림자 캐스터 ×2·무덤지기 석상 ×2·알리스테어·스칼릿 싱어·잠수부(탄두 노드만) 0.15–0.8초.
- 첫 시스템 (2026-10-21, 이펙트 묶음 E, 디컴파일 확인 — 10-14 EN 덤프): `ProjectileEffect.Awake`(0xEADE10)는 `includeInactive` 없는
  `GetComponentInChildren<ParticleSystem>()`(켜진 노드만, 깊이 우선), `ParticleEffect.Awake`(0xEABEB0)는 `includeInactive` 참 — 둘 다 재질 없는 시스템도 센다
  (대부분 루트 아래 `fixed`·`rotation_y` 같은 빈 그릇이 첫 시스템이다). OnFinish(0xEAE6C0 / 0xEACD20)는 그것을 `Stop(true)`(0x5F1B440: 자식째, 방출만)하고
  ParticleEffect는 자기 `_inactiveOnFinish`(0xF0)도 끈다. 그래서 그 전에는 첫 *추출된* 시스템만 멈춰 그릇 아래 다른 가지(애쉬락 포탄의 불꽃 등)가 회수까지
  계속 뿜었다. 고친 것: `fx_extract.py main_ps` → 프리팹 `mainPs`(클라가 멈추는 노드, 플레이어의 기본 선택과 다를 때만), ParticleEffect의
  `_inactiveOnFinish`도 `offFinish`로; `FxInstance.finishMain`이 `mainPs`를 쓴다(ParticleEffect 루트 꼬리 — 그레인버즈 등 — 도 같은 길). 2026-10-21
  `--finish-only` 전체 재추출(운영자 EN·CN, 적): 2,583개 파일에 `mainPs`만 더해짐, ParticleEffect `_inactiveOnFinish`가 있는 추출 프리팹은 없음.
  확인 `test/render/projectile-finish.test.js`(애쉬락: 그릇 `fixed` → 연기·불꽃 모두 방출 멈춤), 추출 JSON 골든 47개(`mainPs`만). 버프 이펙트의 끝
  (`statusOff` — 모든 시스템 방출 멈춤)은 그대로 [추정: 클라는 같은 첫 시스템 규칙 — 차이는 `_delayToFinish` 동안 다른 가지가 뿜는 것뿐].
- 재추출: `fx_extract.py --game <EN> --finish-only`(index.json 번들, CN 번들 aglna2·kalts2·clemnt는 `--game <CN>`), 적 번들은 `--index enemy-index.json
  --bundle <b>`(`pfx_enemy_N`은 `--pack pkgrps/btl_pfb_fx_enemy_N.ab`). 2026-10-11 실행: 204개 파일, `finish`·`offFinish` 말고 바뀐 것 없음(JSON 비교).
  적 번들은 처음 돌려 ParticleEffect `finish`도 새로 들어갔다(상태 이펙트 끝 `statusOff`에만 쓰임).
- 확인: `test/render/projectile-finish.test.js`(소스 계약, 추출 값, FxInstance: 애쉬락 포탄이 꺼지고 다른 가지 불꽃은 돎, 언더플로우 탄 시스템 정지). [화면 미확인]

### 횟수형 护盾 이펙트 (2026-10-11, 사용자 제보 「켈시 에스페란타 실드가 HP 바 위 가는 흰 줄 — 아르케토 재능 실드와 같은 유형, 인게임대로」)

- 클라 데이터: 아르케토(空弦) T2 铁弦 버프 `archet_t_2`는 EN charpack `char_332_archet` Talents/2에서 `overrideEffectKey` **`archet_buff_01_start`**
  (archet 번들, 고리 메시가 도는 루프 클립 4.73 s, `_spawnLocation` 1 = 발밑)를 갖는다 → 층이 남아 있는 동안 그 이펙트. 켈시 에스페란타 T2 医者丰碑의
  `kalts2_t_2[shield]`(CN `config/buff_template_holder.ab`, `kalts2_t_2` / `kalts2_t_2[s2]`의 CreateBuff)는 템플릿 `effectKey` ""·`overrideEffectKey` null
  → **버프 이펙트 없음**. 켈시 번들의 `kalts2_talent_01`은 땅의 고리(재능 범위 쪽)이고 어디서도 이름으로 참조되지 않아 붙이지 않음.
- 막을 때(둘 다 같은 노드): `Nodes.BlockDamage.Execute`(RVA 0xBB6960) — `_showDamageNumber` false면 타격을 취소(`Modifier.Cancel`)하고, 블랙보드
  `effect`(=`_specifyBlockEffect`)가 비어 있으면 **`common_buff_parry_01`**을 맞은 유닛에 만든다(`BattleController.CreateEffect`), 소리 신호 `ON_DAMAGE_BLOCK`.
  `_specifyBlockEffect`는 archet_t_2 null, kalts2_t_2[shield] ""(니어 더 래디언트 나이트 층도 비어 있음). 2026-10-16 정정: 노드는 블랙보드 `effect`를
  `GetStringOrDefault`로 먼저 읽고 `_specifyBlockEffect`는 기본값(10-14 덤프 RVA 0xD949D0) — 머드락 층은 charpack Talents/1 `_buffs`
  ([recharge]·[init])의 블랙보드 `effect` = **`mudrok_buff_01_hit`**을 물려받는다(층 버프를 그 둘의 CreateBuff가 만듦 [추정: 블랙보드 상속 —
  같은 층 버프의 HealViaMaxHpRatio도 재능 블랙보드 `hp_ratio`를 씀]) → 아래 「키트 이벤트의 공식 이펙트」 묶음 2.
- 구현: 시뮬 `damage.js absorbShields`가 횟수형 층이 막을 때 fx `'parry'` {id, buff}를 낸다(모든 `shieldHits` 버프) → `fxgame.js parryFx`가
  common/common_buff_parry_01을 그 유닛에(따라감, `_spawnLocation`대로); 추출이 없으면 아무것도 안 그림(`kinds.js` parry `none`). 아르케토 루프는
  `fxstatus.js STATUS_FX.archet_shield`(상태 키 `talent:archet_shield`, 층이 다하면 꺼짐). 켈시 진입 fx 'shield'는 `src`를 켈시로 달아
  옛 육각형 대역을 안 그림(`standInOff`). HP 바 띠 제거는 `docs/rules/ui.md` 「횟수형 护盾」.
- golden: 층이 막는 전투마다 `events.fx`·`fx.parry`만 늘었다(roster 13·bonds 6·fields 5·diy 1 시나리오, 상태 변화 없음).
- 추출: `fx_extract.py --game <EN> --cab-index .cache/fx-cab-index.json --bundle archet --prefab archet_buff_01_start`, `--bundle common --prefab
  common_buff_parry_01`.
- [미구현] 막을 때 소리 `battle.ON_DAMAGE_BLOCK` = `Enemy/e_atk/e_atk_soldiershield`(audio_data) — sfx 항목·에셋 받기가 필요. [화면 미확인] 루프 높이·크기, parry 위치.

### 흐르는 텍스처 — FxUVTweener · Disturb Origin / Anchor (2026-10-14, 사용자 제보 「이펙트가 재생되지 않고 멈춰있는 것들이 많아」)

- 원인 대조(추출된 프리팹 2,005개 × EN 클라 번들, 비공개 조사 기록): 추출기는 파티클·메시·Mecanim 클립만 읽고 렌더러에 붙은 스크립트를 읽지 않았다.
  멈춤의 주원인은 둘이다. ① 텍스처 오프셋을 움직이는 스크립트 `Torappu.Fx.FxUVTweener`(268개 프리팹)·`FxUVTweenerAdvance`(98개).
  ② 왜곡 셰이더 `Torappu/Particles/Disturb/Disturb Origin`(재질 213개)·`Disturb Anchor`(204개)는 노이즈 텍스처 이름이 `_DisturTex`인데
  플레이어는 `_DisturbTex`·`_NoiseTex`만 읽어 **왜곡이 통째로 꺼져** 있었고, Anchor의 흐름 벡터 `_UVTween`도 안 읽었다.
- **FxUVTweener**(클라 코드 `FxUVTweener.Update` RVA 0x34C5F90, `OnEnable` 0x34C5ED0; Advance `Update` 0x34C5780): 매 프레임 렌더러 재질의
  `_MainTex` 오프셋에 (xspeed, yspeed) × 2 × dt(`SPEED_SCALE` 2), `useSecondMap`이면 `secondMapName` 텍스처의 `_ST.zw`에 (secondXSpeed,
  secondYSpeed) × 2 × dt를 더한다(두 속도가 모두 0인 텍스처는 건드리지 않음). Advance는 `extraMapSettings`의 켜진 텍스처도 같은 식이고,
  `tweenRepeat`이 꺼져 있으면 `tweenAnmTime` 초 뒤 멈춘다(추출분은 모두 켜짐). `OnEnable`은 `keepInitOffset`이면 재질의 오프셋에서, 아니면 0에서
  시작한다. `protect*UV`·`tweenRepeat`의 소수부 처리는 반복 래핑 텍스처에서 결과가 같다. 두 번째 텍스처 이름(컴포넌트 수)은 `_DissolveTex` 277·`_DisturTex`
  228·`_DissolveTex_01` 14·`_RamTex` 20·`_DissolveTex_02` 3, extra는 `_DisturTex`·`_DisturTex_02`·`_DissolveTex(_02)`.
  - 구현: `fx_extract.py uv_tween` → 노드 `uvt` { maps: [[텍스처, 2·sx, 2·sy], …], keep?, until? }(스크립트 id가 아니라 필드로 찾음),
    `--uvt-only`로 이미 추출된 프리팹에 그것만 씀. `fxplayer.js uvTween`/`setTime`이 그 노드의 렌더러 재질(메시 → 파티클 → 선 → 꼬리 순, Unity
    `GetComponent<Renderer>`)의 `_ST` 유니폼을 렌더러 시간으로 움직인다. 재질에 없는 텍스처는 무시(클라도 없는 속성은 효과 없음). 같은 텍스처를
    클립 트랙이 움직이면 클립이 이긴다 [추정: Animator의 프로퍼티 블록이 재질 값을 덮음]. `useSharedMaterial`(컴포넌트 72개)도 개별 재질처럼 움직임 [추정:
    공유 재질이면 동시에 켜진 개수만큼 빨라지는 클라 특성은 따르지 않음].
  - 추출(2026-10-14): 운영자 이펙트 347개 프리팹(EN `index.json` 340 + CN 켈시 에스페란타 2·클레멘티아 4·안젤리나 더 멜로우 위시 1), 적
    이펙트 51개(`--index enemy-index.json`, `pfx_*`는 `--pack pkgrps/btl_pfb_fx_*.ab`), 흐름 1,133개. `uvt` 말고 바뀐 키 0.
- **Disturb Origin**(클라 셰이더 DXBC): 노이즈 = `_DisturTex`(uv × `_DisturTex_ST`).r, 렌더러 uv에 노이즈 × (`_IntensityU`, `_IntensityV`)를
  **메인 타일링 앞에** 더한 뒤 `_MainTex_ST`; 색 = 텍스처 × `_MainColor` × 정점색 × `_MainColor.a` × 2(알파를 한 번 더 곱함). 중심 맞춤 없음.
- **Disturb Anchor**(DXBC): 메인 uv는 `frac(_UVTween.xy × 시간)`, 노이즈 uv는 `frac(_UVTween.zw × 시간)`만큼 흐른다. 노이즈는
  `.r − (_AnchorU, _AnchorV)`(중심), `_ToggleUseDisturb2`면 `_DisturTex_02`.r − (`_AnchorU_02`, `_AnchorV_02`)도, `_WEIGHT_ON` 키워드면 둘 다
  `_WeightTex`.rg를 곱함. 렌더러 uv + 노이즈 × (`_IntensityU`, `_IntensityV`) + 노이즈2 × (`_IntensityU_02`, `_IntensityV_02`) → `_MainTex_ST`.
  색 × 2 × lerp(1, `_MainColor.a`, `_MainColorACtrl`). `_ToggleUseDissolve`면 디졸브(다른 셰이더와 같은 식, 그 이동된 uv × `_DissolveTex_ST`).
  예전 코드가 `_ToggleUseDisturb2`로 첫 노이즈를 끄던 것은 틀림(그 값은 두 번째 노이즈 스위치). [추정: `_DisturTex_02`·`_WeightTex`의 uv는 정점
  셰이더가 각 `_ST`로 만든 것 — 정점 셰이더 상수 이름은 RDEF가 지워져 확인 못 함]
  - 구현: `fxplayer.js` 셰이더 `uDisMode`(0 그대로 · 1 Origin · 2 Anchor), `uDisAnchor`, `uACtrl`, 두 번째 노이즈·가중치 유니폼; 다른 셰이더 경로는 바뀌지 않음.
- **2차 — 셰이더별 흐름 속성**(2026-10-14, 클라 셰이더 속성 목록 + DXBC 전수): 재질에 남은 흐름 값 중 셰이더가 실제로 선언·사용하는 것만 읽는다.
  - `_UVTween`을 선언하는 것은 Disturb Anchor(1차)와 **Dissolve AB UVTween·Dissolve Add UVTween**뿐 — 정점 셰이더가 `_UVTween × _Time.y`를 넘기고
    픽셀 셰이더가 메인 uv(타일링 뒤)에 `.xy`, 디졸브 uv에 `.zw`를 더해 `frac`. 플레이어가 이 둘을 안 읽어 그 재질(재질 282개, 프리팹 186개 — 그중
    오퍼레이터 몸에 붙는 버프 54개: 라플란드 더 데카덴차·노시스·카넬리안·위셔델·인디고·크루스 더 킨 글린트 …)이 멈춰 있었다. Additive·AlphaBlend·
    Disturb(CustomData) 등의 0 아닌 `_UVTween`(수백 재질)은 다른 셰이더에서 남은 값 — 클라 셰이더에 속성이 없다.
  - `_Speed`는 Flipbook 셰이더만, `_NoiseSpeed`·`_MaskSpeed`는 GrabPass 셰이더만 선언하고 추출된 재질 중 그 셰이더를 쓰는 것은 없다. `_FlowStrength`는
    어떤 셰이더도 선언하지 않음. → 둘 다 안 읽음.
  - `_Main` / `_Dissolve` / `_DisturbU·VSpeed`는 (CustomData) 계열만 선언한다. 예전 플레이어는 Additive·AlphaBlend 등에 남은 값(재질 수십 개)으로도
    텍스처를 흘렸다 — 이제 (CustomData) 셰이더에서만 읽음(공식은 그 재질이 안 흐름).
  - **Mask (AlphaBlend)**(사리아 버프 `demkni_buff_01_self`의 방패): 색 = (메인 + 2 · `_AddFactor` · `_AddTex`(`_AddTex_ST` uv) · `_MaskTex`.a(메인
    uv)) × 2 · 정점색 · `_TintColor`; 클립이 `_AddTex_ST` 오프셋을 3초에 (2, −1)만큼 흘림. 예전엔 메인만 그렸다. [추정: 샘플러 셋 중 어느 것이
    `_AddTex`·`_MaskTex`인지 — 두 번째 uv의 `_ST`가 클립이 움직이는 `_AddTex_ST`라는 데서 맞춤]
  - Double 계열의 두 번째 디졸브도 첫 번째처럼 경계 항 `bw · (1 − roundEven(amount + .5))`을 더한다(DXBC; 예전엔 빠짐).
  - 클립 트랙 중 받는 유니폼이 없어 버려지던 것 연결: `_DissolveTex_02_ST`(Double, 36트랙 — 안젤리나 더 멜로우 위시 `aglna2_skill_03_range_01`·가비알
    디 인빈서블 S3·캐서린), `_IntensityU/V`(Origin·Anchor 노이즈 세기, 로즈몬티스·미즈키·비질), `_AnchorU/V`(Anchor만 — 비질), `_RimPower`(켈시 에스페란타
    S2 구), `_AddTex_ST`(위 Mask).
  - 확인: 단위 `test/render/fx-uv-tween.test.js`(UVTween 두 셰이더·남은 값 무시·(CustomData) 속도·Mask·클립 트랙). Windows Chrome 디버그 페이지에서
    HEAD와 새 코드를 같은 소재로 띄워 재생 0.5초 뒤 렌더러 재질의 uv를 읽음: 라플란드 더 데카덴차 S2 `white01`·`black01`, 카넬리안 `xx`, 위셔델
    `trail_hong1`, 노시스 `qixuan`이 HEAD 0 → 새 코드에서 흐름, 사리아 `_AddTex` 흐름, 나머지 재질 값 그대로. 스펙터 디 언체인드 S2 `ghost2_skill_02_buff_01`·
    글래디아 `glady_skill_03_range_02`는 HEAD(1차)에서 이미 흐름. 셰이더 컴파일 오류 0(D3D 정밀도 경고 X4122 하나 — 상수 접기, 동작 무관).
    [화면 미확인: 공식 녹화 대조, 실제 판에서 눈으로]
- **3차 — 레거시 `Animation` 클립·`SkinnedMeshRenderer`**(2026-10-14, 클라 번들 대조): Mecanim `Animator` 말고 옛 `Animation` 컴포넌트가 돌리는 클립과
  뼈로 휘는 메시를 읽지 않아, 반복 회전·흔들림이 멈춰 있거나 메시가 아예 안 그려졌다.
  - 레거시 클립(`m_Legacy`, 추출된 프리팹 39개 중 클립이 있는 37개): 기본 클립 `m_Animation`(모두 `m_PlayAutomatically`)의 곡선은 Mecanim 근육 클립이
    아니라 키프레임(시간·값·in/out 기울기)이다. 위치·크기·쿼터니언·오일러 곡선은 변환 경로로, float 곡선은 `material.<속성>[.r…/.x…]` → 그 렌더러
    재질, `m_IsActive` → GameObject 켜고 끄기로 묶는다. 경로는 `Animation`이 붙은 GameObject 기준이라 그 아래가 아닌 이름은 Unity에서도 안 묶인다
    (프라마닉스 더 프레리타 S3 `sbell2_skill_03_range`의 `spin`은 형제 노드를 가리켜 공식에서도 안 돎 — 클립 없음). 길이 = 모든 곡선의 마지막 키
    (레거시 클립의 `m_StopTime`은 안 씀), 클립의 `m_WrapMode` 2(Loop) 또는 그것이 0이면 `Animation`의 값이 Loop면 반복. Once·ClampForever는 Mecanim
    클립처럼 마지막 키에서 멈춤 [추정: Once는 Unity가 그 자리에서 클립을 멈춤]. 가중 키는 가중치 없이 읽음 [추정: 추출분에 없음]. 대상: 시빌라이트
    에테르나 궤적·원의 회전(2초·8초 반복), 노시스 S2·S3 돌의 흔들림, 첸 더 던스트릭 S3 용, 패신저 S2, 크루스 더 킨 글린트 S2 궤적, 스펙터 디 언체인드
    3×3 원의 0.3초 나타나기·끝, 카넬리안 버프 색, 비질 소환, 엔텔레키아 등장·필라에 S1 시작, 아래 스킨드 메시의 뼈.
  - `SkinnedMeshRenderer`(9개 프리팹, 렌더러 24개 — 미즈키 S2 촉수, 스카디 S3 상어, 스카디 더 커럽팅 하트 S3, 스즈란 S3 꼬리, 호시구마 S3 귀신, 글래디아
    S2): 정점마다 뼈 인덱스(채널 13)·가중치(채널 12, 없으면 첫 뼈에 1), 뼈마다 바인드 포즈. Unity는 Σ 가중치 · 뼈 localToWorld · 바인드 포즈 · 정점으로
    월드 공간에서 그리고 **렌더러 자신의 트랜스폼은 안 쓴다** — 미즈키 S2의 촉수 노드 `2`는 크기 y가 0이라, 그 행렬을 거치면 메시가 사라진다.
  - 구현: `fx_extract.py legacy_clip`(키프레임 → 구간별 3차식, 클립 트랙 형식 그대로, `legacy: 1`)·`skin`(노드 `skin` { mesh, mat, order, bones },
    메시 파일 `…_skin.json`에 `bi`·`bw`·`bind`), 이미 추출된 프리팹에는 `--legacy-only`·`--skin-only`. `fxplayer.js`는 클립을 기존 트랙대로 재생하고, 스킨
    노드를 `THREE.SkinnedMesh`(항등 바인드 행렬, 월드 행렬 = 이펙트 루트)로 그린다 — 노드의 켜고 끄기·재질 클립·텍스처 흐름은 메시와 같다.
  - 확인: 단위 `test/render/fx-legacy-skin.test.js`(반복 쿼터니언 트랙, 뼈 회전 → 정점 이동·노드 트랜스폼 무시, 추출본 값). 키프레임 변환은 무작위 곡선에서
    Unity Hermite 식과 대조. Windows Chrome 디버그 페이지에서 재생 2.6초·3.2초 사이 이동: 스킨드 메시 24개 모두 보이고 정점이 0.02~0.7 움직임, 시빌라이트
    에테르나 원 27°, 노시스 돌 56~108°, 첸 더 던스트릭 용 위치 이동. 셰이더 컴파일 오류 0. 이번 변경 전에는 스킨드 메시가 그려지지 않고 이 노드들이
    정지. [화면 미확인: 공식 녹화와의 대조, 실제 판]
  - **서브 이미터**(파티클 `SubModule`): 모듈이 켜진 145개 프리팹 중 대상이 비어 있는 것(PathID 0, Unity도 아무것도 안 함)을 빼면 78개(EN 운영자) +
    켈시 에스페란타·적 이펙트, 서브 이미터 397개 모두 Birth. Birth 대상은 혼자 재생하지 않고 부모 입자마다 자기 방출 모듈(초당 방출·버스트)을 그 입자의
    나이로 돌려 그 입자 위치(+ 대상의 모양)에서 낸다; `emitProbability`, 상속 비트(1 색 × 부모의 현재 색, 2 크기 × 현재 크기, 4 회전 + 부모 회전, 8 수명
    × 부모의 남은 비율). 예전엔 대상이 자기 노드 원점에서 한 번 재생 — 부모 입자가 여럿이거나 움직이는 65개 시스템(가비알 디 인빈서블 전기톱, 백파이프
    탄피 연기, 무에나 별, 위셔델 S1 폭발, 첸 더 던스트릭 S3 동전의 별 …)이 제자리에 한 번만 나왔다. [추정: 상속 수명은 남은 비율, 대상의 시작 값은
    부모 입자 나이 ÷ 대상 지속 시간에서 평가 — 클라 네이티브 코드라 확인 못 함]
    - 구현: `fx_extract.py sub_emitters`(`mods.sub` = [{ node, type, props, p }], `--sub-only`), `fxplayer.js ParticleSystem.setSubs`·`emitSubs`.
    - 확인: 단위 `test/render/fx-legacy-skin.test.js` 「Birth sub emitters」. Windows Chrome 디버그 페이지에서 대상 시스템의 입자 수·위치 개수: 위셔델
      `wisdel_skill_01_hit_02` 폭발 11종이 부모 입자 자리에서, 첸 더 던스트릭 `chen3_skill_03_trail_01` 별 9개가 동전 9곳에서, 무에나 별이 부모 별 자리에서.
      오류 0. [화면 미확인: 공식 녹화 대조, 실제 판]
  - **FxUVRotation**(움직임이 아니라 텍스처의 고정 회전, 추출본 96개 프리팹·노드 228): 클라 코드 `_Initialize`(RVA 0x34C4C70)가
    키워드 `_HG_UV_ROTATION`을 켜고 `_Rotation0..3`을 항등 (1, 0, 0, 1)(정적 필드, `.cctor` 0x34C4EE0)로 두며, `Update`(0x34C4870)가 켜진 것
    (`_rotateTex1..4`)만 `_CalculateMatrix`(0x34C4B80) = 각도(도 × 0.0174533)의 (cos, −sin, sin, cos)로 바꾼다 [추정: cos·sin — 이름 없는 CRT 함수
    둘, 각도 0이 항등이라는 데서]. 이 변형은 Disturb(CustomData) 계열(Disturb·Ram/Disturb·ZDistort … — 회전된 재질 전부가 이 둘)에만 있다. 정점
    셰이더(DXBC)가 텍스처마다 타일링(+ 메인은 커스텀 오프셋) 뒤 uv를 (0.5, 0.5) 둘레로 u' = x·u + z·v, v' = y·u + w·v 돌린 다음 흐름을 더한다:
    0 메인, 1 디졸브, 2 셋째 텍스처(Ram은 `_RamTex`, Disturb는 `_WeightTex`), 3 노이즈 [추정: 2·3의 짝은 상수 슬롯 순서 — 셰이더 이름이 지워짐;
    켜진 2번 72개 중 62개는 그 재질에 해당 텍스처가 없어 결과가 같음]. 예전엔 회전 없이 그려 그 텍스처들의 방향이 틀렸다(각도 −90°~270°; 첸 더
    던스트릭·비나 빅토리아·아스트젠 더 라이트체이서·쏜즈 더 로드스타 …).
    - 구현: `fx_extract.py uv_rotation` → 노드 `uvr` [각도 4개, 꺼진 것 0](`--uvt-only`가 함께 씀), `fxplayer.js uvRotation`·셰이더 `rotUV`.
    - 확인: 단위 `test/render/fx-uv-tween.test.js` 「FxUVRotation」. Windows Chrome 디버그 페이지에서 HEAD와 새 코드: 새 코드의 재질 유니폼이 첸 더
      던스트릭 `quan2` −90° → (0, 1, −1, 0), 비나 빅토리아 `slash_bg_01_wave` 90° → (0, −1, 1, 0), 셰이더 컴파일 오류 0. 두 서버의 맵·재생 시점이
      달라 눈 비교는 약함. [화면 미확인: 공식 녹화 대조]
- 확인: 단위 `test/render/fx-uv-tween.test.js`(흐름 식·keep·until·없는 텍스처·클립 우선, Origin·Anchor 유니폼). Windows Chrome 디버그 페이지에서
  HEAD와 나란히 0.4초 간격 3프레임: 스펙터 디 언체인드 `ghost2_beidong_buff_01`(3×3 원)이 굳은 밝은 고리 → 흐르는 물결 고리, 글래디아
  `glady_skill_03_range_02`가 오퍼레이터를 덮는 흰 고리 → 도는 반투명 소용돌이, 프레임 간 차이 2.5→4.0·0.8→3.9. 셰이더 컴파일 오류 0
  (WebGL `drawElementsInstanced: no buffer` 경고는 HEAD와 같은 기존 것). [화면 미확인: 공식 녹화와의 대조, 실제 판]
- 안 한 것: 파티클 충돌 모듈. `FxUVRotation`·레거시 클립·스킨드 메시·서브 이미터는 위 3차.
- **글래디아 S3 회오리**: 키트 fx `'tornado'`가 `zoneFx`(그 스킬 투사체의 도달 이펙트 `glady_skill_03_range`·`_02`, 「시전 이펙트 시점·붙는 대상」
  zone)를 타지 않아 2D 원(`areaAway`)이 대신 그려지던 것 → `fxgame.js`가 `'zone'`과 같이 공식 프리팹을 회오리 자리에 지속 시간 동안 튼다.
  테스트 `test/render/fx-cast-timing.test.js` 「歌蕾蒂娅 S3」. [화면 미확인: 실제 판에서 회오리 자리·크기]

### 텍스처 반복 방식 — Clamp·Mirror (2026-10-22, 관리자 제보 「이격 블레이즈 S3 불기둥이 약 1초 남고 둘 사이 간격이 너무 짧다」)

- **증상**: 블레이즈 디 이그나이팅 스파크(烛煌) S3의 솟는 불길(`blaze2_skill_03_start`)과 떨어지는 불길(`blaze2_skill_03_hit`)이 공식 영상처럼 한 줄기씩
  지나가지 않고, 길이 약 5의 불기둥 둘이 통째로 나란히 서서 1초쯤 남았다.
- **원인**: 플레이어(`fxplayer.js FxLibrary.texture`)가 모든 텍스처를 Repeat로 그렸다. 공식 Texture2D의 `m_TextureSettings` `m_WrapU`/`m_WrapV`
  (Unity TextureWrapMode 0 Repeat · 1 Clamp · 2 Mirror · 3 MirrorOnce)는 텍스처마다 다르다 — 추출 텍스처 2,554개 중 382개가 Repeat가 아님(Clamp 양축
  331·한 축 50·Mirror 1). 그 불기둥 메시는 u가 길이 방향(0→1)이고 주 텍스처 `blaze2_02`(Clamp)가 타일링 ×4, 클립이 `_MainTex_ST.z`를 −0.13 → 1로 민다.
  Clamp면 기둥의 1/4 길이 불꽃 머리만 보이며 기둥을 따라 지나가 빠지고(시전은 위로 0.7초, 피격은 `fixed`가 10 → 0으로 0.47초 떨어지며 아래로),
  Repeat면 무늬가 기둥 전체를 덮는다. 위치·크기·시점(공격 0.3초 뒤 주 대상만, `projectile_chr_blaze2_s3` AttachToTarget `_delayToStart` 0.3·
  `_onlyPlayHitEffectOnTraceTarget`)은 원래 공식과 같았다.
- **고친 것**: `fx_extract.py`가 텍스처마다 wrap을 읽어 `tex/wrap.json`({ 파일: [u, v] }, Repeat가 아닌 것만)에 합치고(추출할 때마다, 또는 `--wrap-only`가
  두 색인의 출처 팩 전부에서), `FxLibrary`가 첫 이펙트 전에 한 번 받아 텍스처마다 ClampToEdge / MirroredRepeat를 준다(MirrorOnce는 three.js에 없어
  MirroredRepeat [추정: 거울 한 번 밖에서만 다름]).
- **함께 고친 소수부 처리**(Repeat에서는 결과가 같아 빼 두었던 것):
  - 클라 셰이더 DXBC: (CustomData) 계열·MultiTex·Disturb Anchor는 흐름 항(속도 × 시간)의 소수부(`frc`)만 더하고, Dissolve AB / Add UVTween은 흐른 uv 전체의
    소수부를 쓴다(`frac(uv + _UVTween × t)`, 위 「흐르는 텍스처」 2차의 DXBC). → FRAG의 모든 흐름 항 `fract`, `uFracUV`(UVTween 계열).
  - 클라 코드: FxUVTweener `Update`(RVA 0x38DB890)는 `protectMainUV`면 `_MainTex` 오프셋을, `protectSecondUV`면 두 번째 맵 오프셋을 매 프레임
    x − floorf(x)로 줄이고, FxUVTweenerAdvance `Update`(0x38DB0A0)는 `tweenRepeat`면 모든 맵을 그렇게 줄인다. → `uvt.maps[i]` 넷째 칸 1
    (`--uvt-only`로 다시 씀: 맵 1,387개 중 691개), `setTime`이 그 오프셋을 [0, 1)로.
- 영향: Clamp 텍스처의 uv가 0–1을 벗어나는(타일링·오프셋, 클립 `_ST`, uv 트위너, 셰이더 흐름, 메시 uv, Tile 꼬리·선) 프리팹 712개(묶음 112개, 관리자 노트에 목록).
  테스트 `test/render/fx-texture-wrap.test.js`; 추출 JSON 골든은 `uvt.maps` 7개만 바뀜(EN 5·CN 2). [화면 미확인]

### 입자 모듈·셰이더 패스 상태 — 충돌·속도 상속·속도별 크기, 컬링·깊이 쓰기·블렌드 (2026-10-22, 추출 누락 기준선의 todo)

- **입자 모듈 셋**(`fx_extract.py particle_system` → `fxplayer.js ParticleSystem`). 추출된 모든 프리팹이 한 가지 설정만 쓴다(클라 전수 158 프리팹 —
  다른 설정이 나오면 `fx_coverage`가 `module:… mode 1` / `type 1`로 알림):
  - `InheritVelocityModule` 운영자 95·적 16 — 전부 mode 0(Initial: 태어날 때 한 번), 배율 대부분 상수(−0.2~1, 곡선 6). → `mods.inherit` { mode, k }.
    월드 공간 계만 이미터 속도 × k를 더한다(Unity 매뉴얼: 이 모듈은 World 시뮬레이션 공간에서만 작동 — 로컬 계 33개는 아무것도 안 함). 이미터 속도 =
    그 노드의 직전 프레임 대비 월드 이동을 루트 좌표로(날아가는 투사체의 루트 이동 포함).
  - `SizeBySpeedModule` 민트 넷·적 둘(`xingdian` 별 입자) → `mods.sizeBySpeed` { x(, y, z), range }: 속도가 `range`에서 차지하는 자리의 곡선 값을
    크기에 곱한다. 속도는 시뮬레이션 속도(VelocityOverLifetime·노이즈 오프셋 제외) [추정]. 민트 S1·S2 범위의 별은 시작 속도 0.2–0.5 / 범위 0–10이라
    시작 크기의 0.08–0.15배 — 예전엔 시작 크기(최대 3) 그대로 커다란 검은 조각으로 보였다.
  - `CollisionModule` 운영자 28·적 14 — 전부 type 0(평면), 평면은 프리팹 안 노드(대개 하나), 중력 0이 대부분. → `mods.collide` { planes(노드 번호 —
    `collide_planes`), dampen, bounce, lifeLoss(`m_EnergyLossOnCollision`), minKill, maxKill, radius }; 평면이 없는 계 2개는 모듈을 뺌(충돌할 것 없음).
    평면 = 그 노드 위치·로컬 +y. 입자(반지름 = 그린 크기 × ½ × `radius`)가 평면 쪽으로 움직이며 반지름 안에 들면 표면으로 되돌리고 법선 성분을
    × `bounce`로 뒤집은 뒤 속도의 `dampen`만큼 잃고, 수명의 `lifeLoss`를 잃고, 속도가 `minKill` 미만·`maxKill` 초과면 죽는다(`maxKill` 10인 계 14개 —
    부딪히면 사라짐). [추정: Unity 매뉴얼의 설명대로 — 엔진 코드는 못 읽음; 평면 뒤의 입자도 앞으로 밀림(한쪽 면)] 애쉬락·백파이프 탄피·첸 더
    던스트릭 S3 동전·머드락 돌 등.
- **셰이더 패스 상태**(클라 `[uc]shaders.ab` Shader `m_ParsedForm` — Torappu 입자 셰이더 전부의 패스별 Cull·ZWrite·ZTest·Blend와 그것이 읽는 속성;
  `fxplayer.js renderState`):
  - 컬링(Unity CullMode 0 끔·1 앞면·2 뒷면): `_CullMode`를 읽는 것은 Disturb 계열(GrabPass 제외)·(CustomData) 계열·AlphaBlend(ZWrite)·Common·
    Dissolve Double뿐. Rim·Flipbook·MatCap·Toon/Outline·Dissolve Cutout은 늘 뒷면 컬링, 나머지(Additive·AlphaBlend·Dissolve·Mask …)는 늘 양면 — 이들
    재질의 `_CullMode`는 다른 셰이더에서 남은 값. 메시(MeshRenderer·스킨 메시·메시 입자)에만 적용(`meshSide`; Unity 프레임의 z 뒤집기로 three.js
    앞면 = Unity 앞면); 빌보드·트레일·선은 카메라를 보게 만들어지므로 양면 그대로(Unity도 뒷면 컬링에 안 걸림). 보이는 차이: 쿠오라·마터호른 S2
    돔 등 Rim 돔이 앞 반구만(예전엔 뒤 반구까지 겹쳐 그려 육각 무늬가 두 겹), Ram/Disturb(CustomData) 앞면 컬링 메시 입자(님프·클레멘티아 …)는 안쪽 면만.
  - 깊이 쓰기: `_ZWrite`를 읽는 것은 AlphaBlend(ZWrite)·Common·Cutout뿐 — Disturb Origin / Anchor 재질의 `_ZWrite` 1은 패스가 안 읽는다. 쓰이는 것은
    라플란드 더 데카덴차 소환물(`whitw2_token*`) 메시 입자와 첸 더 던스트릭 S3 꼬리(값 0).
  - 원본 블렌드: Disturb Origin / Anchor·Cutout만 `_SrcBlend`를 읽고 나머지는 SrcAlpha 고정. Disturb Origin 둘(노시스 S2·S3 버프의 돌 `shitou`)은
    One Zero = 불투명 덮어쓰기(뒷면 컬링·ZTest와 함께).
  - Unity 레거시 입자 셰이더: Additive(SrcAlpha One)·Alpha Blended(SrcAlpha OneMinusSrcAlpha)는 2 × `_TintColor` × 정점 × 텍스처로 이름대로 섞는다
    (재질에 남은 `_DstBlend` 0은 안 읽음). **Unity 기본 입자 재질** `Default-Particle`(= Legacy Alpha Blended Premultiply: One OneMinusSrcAlpha, 정점 ×
    텍스처 × 정점 알파, 색조 없음)은 이제 방출하는 계에서 읽는다(운영자 7·적 1 — 블레이즈 디 이그나이팅 스파크 S3 버프·텍사스 디 오메르토사 S1 시전·
    스펙터 디 언체인드 등); 방출하지 않는 빈 그릇 227개는 예전처럼 재질 없음.
- 추출: 묶음 46·적 묶음 18을 다시 뽑아 전후 대조 — 새 키 `inherit` 111·`collide` 38·`sizeBySpeed` 6 파일, 기본 재질 계 8(재질·`duration` 2); 그 밖은 이전
  재추출에서 빠졌던 `face.hold` 7(공용 `common_ignite_attack` 사본)·`fly` 1(실버애쉬 더 레인프로스트 독수리)뿐. 추출 JSON 골든 EN 1·CN 2(`inherit`만).
  테스트 `test/render/fx-particle-modules.test.js`. 아레나: 민트 S1 범위 별·쿠오라 S2 돔 확인, 충돌·속도 상속은 단위 시험만 [화면 미확인].

### 추출기가 못 읽던 모양 — 望 연결선·상자 표면·늘인 빌보드와 메시 pivot·메시 방출·클립이 움직이는 값 (2026-10-22, 추출 누락 기준선의 todo)

- **望 연결선** `token_wang_passive_01_line`(월드 공간 LineRenderer 셋 `andi`·`add`·`hei`, 1초 클립이 폭·알파를 움직임): 추출은 10-10부터 됐지만 점이
  저작값 (5, 2)–(7, 2) 그대로라 엉뚱한 곳에 그렸다. 클라 `WangStoneTriggerManager._TryTriggerStones`(RVA 0x5D3080)는 돌이 태어날 때 그 돌의 행·열에서
  돌을 모아 정렬하고 그 돌을 지나는 끊김 없는 줄만 남긴 뒤(`_CollectTmpTiles` 0x5D17E0 → `_FilterContinuousCharacters` 0x5D2210), 줄마다(2개 이상)
  `_PlayTriggeredLineEffect`(0x5D29F0)로 선을 태어난 돌에 한 번 만들고 모든 LineRenderer의 점 0·1 = 줄 첫 돌·끝 돌의 `worldPosition`(ILocatable
  슬롯 2)으로 한 번 놓는다. → `fxgame.js linkLines`/`linkRun`: 시뮬 'wangLink'(이웃이 생긴 돌마다 — 태어난 돌과 이웃 모두)마다 그 돌에 새로 생긴
  방향의 줄을 찾아 `FxInstance.setLine`으로 양 끝을 놓고, 같은 순간 같은 줄은 한 번만. 끝점: 跟子는 칸 점, 놓은 棋子는 공(활성 이펙트와 같은 자리,
  2026-10-08) [추정: 클라 점은 그 아래 땅]. 던지는 중인 跟子가 끝에 있으면 착지(`THROW_S`) 뒤에 놓는다(클라 선은 돌의 탄생 때 — 시뮬은 던짐 시작에
  잇는다 [추정]). 예전엔 활성(`first`) 때만 저작 점으로 틀었다. 아레나(Windows Chrome, 望 S1 자동 棋子): 선이 이웃 돌 사이에만, 1초 뒤 사라짐.
- **'wangLink'는 상태**: 돌의 활성 이펙트가 돌이 서 있는 동안 남으므로(STONE_ON) 늦게 들어온 화면 버퍼(`keepEarly`)만이 아니라 따라잡기·숨긴 탭
  (`runner.js keepsState`)·밀린 이벤트 버림(`interp.js isCosmeticEvent`)도 남긴다 — 세 곳이 `shared/protocol.js stateFx` 하나를 씀.
- **상자 표면·모서리** (`fxplayer.js boxSurface`): BoxShell(15)은 면 한 쌍을 넓이로 골라 그 축을 ±½에, BoxEdge(16)는 모서리를 길이로 골라 나머지 두 축을
  ±½에 둔다; `boxThickness`(축마다 0–1)는 반 크기 중 안쪽으로 들어갈 수 있는 몫. 예전엔 둘 다 부피(Box)처럼 뽑았다. 클라 상자는 거의 납작해(한 축 0 —
  BoxShell 50·BoxEdge 30 시스템 중 4개만 아님) Shell은 전과 같은 직사각형, **Edge는 직사각형 테두리**(불피스폴리아 버프 `fangkuai` 네모·플레임테일 S2 범위 등).
  [추정: 넓이·길이 가중 — Unity 샘플링 코드는 공개 안 됨]
- **늘인 빌보드(mode 1)·메시 입자(mode 4)의 pivot** (`fxplayer.js` 셰이더 `uPivot` vec3): 늘인 빌보드 1,669 시스템·메시 입자 179 시스템이 pivot을 갖는데
  2026-10-08 전체 적용 때 빌보드·정렬·수평 쿼드만 했다. 늘인 빌보드: 늘인 쿼드의 틀에서 y = 늘인 방향(길이 단위 — y ±0.5면 한 끝이 입자에: 爆刺 `baoci`
  −0.5 + 음수 lengthScale), x = 가로(폭 단위). 메시: 빌보드와 같은 + 부호로 메시 축의 pivot × 크기를 회전 전에 더함. [추정: Unity의 늘인 y는 속도 반대
  방향 — 그러면 클라 줄기(|pivot y| 0.2–0.75, 부호 = lengthScale 부호)가 입자 뒤로 끌려 속도선·불꽃의 머리가 입자에 온다; Unity는 이 쿼드를 CPU에서
  만들어 클라에서 못 읽음] [화면 미확인]
- **메시 방출** (Shape type 6, 클라 79 시스템·운영자 36·적 4 프리팹 — 대부분 범위 윤곽 메시 `general_range_08`·`FX_m_range_03_*`·`lap_s2range02` 위의
  반짝임): 추출 `shape.mesh`(메시 파일)·`place`(placementMode 0 꼭짓점·1 변·2 삼각형)·`meshCol`(m_UseMeshColors); 클라는 모두 m_MeshSpawn mode 0
  (무작위)·법선 오프셋 0 — 다른 값이면 `fx_coverage`가 알림. 플레이어 `meshShape`/`meshSample`: 꼭짓점 균등, 변은 길이·삼각형은 넓이 가중 [추정],
  방향 = 그 자리 법선(메시 파일엔 법선이 없어 three가 삼각형으로 계산 — 감은 방향이 Unity 앞면과 같음), 정점 색이 있으면 시작 색에 곱함(없으면 흰색 —
  Unity 매뉴얼의 「재질 색」은 MeshRenderer 모양에만 해당). 예전엔 한 점에서 뿜었다(범위 반짝임이 범위 가운데 한 점).
- **클립이 움직이는 값** (`fx_extract.py ANIMATED_VALUES` → `fxplayer.js PS_ANIM`/`UVT_ANIM`): Mecanim 바인딩(경로의 crc32)·레거시 곡선(경로 이름)이
  ParticleSystem의 `EmissionModule.rateOverTime.scalar`/`minScalar`(운영자 13)·`ShapeModule.radius.value`(5)·`SizeModule.curve.scalar`·
  `InitialModule.gravityModifier.scalar`·`InitialModule.startColor.maxColor.*`·`TrailModule.colorOverLifetime.maxColor.*`·`looping`·`simulationSpeed`(2026-10-22, 묶음 J —
  에이야퍄들라 더 크비트 아스카 S2 범위의 단계 클립이 처음 나옴), TrailRenderer `m_Time`,
  MeshRenderer `m_Enabled`, FxUVTweener `xspeed`/`yspeed`/`secondXSpeed`/`secondYSpeed`를 움직이면 트랙 `ps:<경로>`·`trail:time`·`mr:enabled`·`uvt:<필드>`.
  플레이어는 그 시스템·트레일만의 사본에 매 프레임 쓰고(정의는 인스턴스끼리 공유), 움직이는 UV 속도는 프레임마다 속도 × 시간을 더한다(클라 `Update`).
  남은 것: 꺼진 VelocityModule을 켜는 클립 하나(적 `mcmstr_buff_04_start` — 꺼진 모듈은 추출에 없음). 기본 상태 밖 Animator 클립은 아래 「애니메이터 상태」.
- 추출: 운영자 32·적 10 묶음(+ 보고가 꼽은 `ghost2`)을 다시 뽑아 전후 대조 — 3,060 파일 중 73개, 새 키 `shape.mesh`·`place`·`meshCol` 40 파일과
  트랙 이름(`attr:` → `ps:`·`trail:`·`mr:`·`uvt:`) 36 파일뿐. 추출 JSON 골든 EN 2·CN 1 갱신. 보고 todo 운영자 26 → 17·적 21 → 8.
  테스트 `test/render/wang-stone-fx.test.js`(연결선·stateFx·상자 표면)·`fx-mesh-shape.test.js`·`fx-clip-values.test.js`. 아레나(Windows Chrome, 전후):
  아스카론 S3 범위의 붉은 점이 오퍼레이터 몸 → 범위 윤곽 꼭짓점, 에이야퍄들라 더 크비트 아스카 S2 범위 반짝임이 윤곽 변에. 늘인 빌보드 pivot·클립 값·BoxEdge는 작아서
  판단 못 함 [화면 미확인].

### 애니메이터 상태 — 상태 기계·끝날 때 트리거·버프 진행 단계·무작위 그룹·모듈 변형 (2026-10-22, 추출 누락 기준선의 todo, 디컴파일 확인)
- **무엇이 틀렸나**: 추출이 컨트롤러의 `m_AnimationClips[0]` 하나만 틀었다. 클립이 둘 이상인 컨트롤러 운영자 23·적 3 프리팹(+ 한 상태뿐인 니어 더 래디언트 나이트·
  머드락 버프 둘)에서 그것은 대개 기본 상태의 클립이 아니었다 — 에이야퍄들라 더 크비트 아스카 S2 범위는 기본 0단계 대신 2단계, 파투스 S3 버프·루멘 버프는 시작 대신
  루프. 그리고 기본 상태 다음 상태(시작 → 루프, 루프 → 끝)로는 넘어가지 않았다.
- **상태 기계** (`fx_extract.py state_machine` → 정의 `sms`: 상태·클립·전이·조건·파라미터 기본값, 첫 층만): 상태가 둘 이상이면 그 상태들의 클립을 모두 뽑고(`clips[].sm`),
  한 상태면 그 상태의 클립 하나. 플레이어(`fxplayer.js stepSm`/`applySm`)는 Mecanim처럼 돈다 — 현재 상태의 클립을 들어간 때부터 틀고, 매 프레임 그 상태에서 나가는
  전이(아무 상태 전이 먼저, 그다음 컨트롤러 순서)를 본다: exit time(정규화 시간; 루프 상태의 1 미만 값은 루프마다 그 지점을 지나는 프레임에만 — Unity 매뉴얼,
  루프 아닌 상태는 그 뒤 계속 [추정]), 조건(`if`·`ifnot`·`gt`·`lt`·`eq`·`ne`; 트리거는 그 전이가 시작될 때 소모). 전이 길이(초, `norm`이면 원래 상태 길이 배수) 동안 두
  상태의 클립을 무게로 섞고(둘 다 시간이 흐름), 어느 클립도 안 움직이는 값은 기본값으로 섞는다(WriteDefaultValues — 클라 상태 모두 켜짐). 이펙트의 클립 시간
  (`duration`·`clipLen`)은 기본 상태 클립만 센다. 블렌드 트리·둘째 층·속도 파라미터·상태 기계 밖 전이는 안 읽음 — 나오면 `fx_coverage`가 알림(지금 0).
- **끝날 때 거는 값** (`animFin`, 이펙트의 끝 = 클라 `Effect.FinishMe` → 행동마다 `OnFinish` = 우리 `FxInstance.stop`, 10-14 EN 덤프):
  - `TriggerAnimatorWhenFinish`(`OnFinish` 0xEB6980·`Awake` 0xEB68C0): 자기 GameObject의 Animator에 트리거 `_customKey`, 없으면 `OnFinish`(`.cctor` 0xEB6B10).
    **`delayToRecycle` > 0일 때만**(가상 16 = `_delayToFinish`, 우리 `finish`) — 글래디아 S1~S3 줄·버프·S3 작살 머리, 루멘 S1 범위·버프.
  - `OnFinishAnime`(`Init` 0xE8F700 GetComponentInChildren, `OnFinish` 0xE8F7F0): `_isTrigger` → 트리거, `_isInt` → 정수 0/1, 아니면 bool — 실버애쉬 더 레인프로스트 S1 방패·S3 범위.
  - `SwitchAnimatorStateWhenFinish`(`OnFinish` 0xEB2760): `delayToRecycle` > 0이면 `Animator.Play(_stateName)` — 이네스 S3 표식 비행 끝.
  - `SetAnimatorTriggerOnEvent`(`OnFinish` 0xE97C90, `_event` ON_FINISH 0): 트리거 — 켈시 에스페란타 S3 순간이동 꼬리(CN).
  - `SetAnimatorTriggerByCondition`(`_UpdateAnimator` 0xE8AF70) + `AuraProjectileSetAnimatorTrigger`(`GetValue` 0xE75200·`SetTriggerValue` 0xE75270): 오라 투사체가 멈출
    때(`ScalableAuraHitBehaviour.OnProjectileStop` 0xA84170 — `ThrowEffect` 0x3985560은 부모만 바꿈 — 그다음 `FinishMe` 대신 `SetTriggerValue`) `OnFinish` → 쏜즈 더 로드스타 S2
    오라의 1.47초 끝 클립. 우리는 `zoneFx`가 그 오라를 끝내는 순간(`until`)에 건다. [추정: 클라는 그 뒤 입자가 다 사라질 때 회수 — 우리도 방출을 멈추고 끝 클립·입자가 끝나면 지움]
  - 끝난 뒤(`stop`) 이펙트는 그 끝 상태의 클립(루프 아님)이 다 틀릴 때까지 남는다(`smSettled`) — 전엔 멈추는 순간 클립을 끝난 것으로 쳤다. 대개 `finish`(풀 회수)가 먼저 온다.
- **코드가 거는 값**: 라플란드 더 데카덴차 S3 드론 꼬리 — 스킬 끝 `Whitw2Skill3FunnelRangedAttack.OnDetached`(0xBFFC90)가 각 드론 투사체 `_mainEffect`의 Animator에
  정수 `OnEnd` = 1(`s3_idle` → `s3_end01`), 투사체가 멈춰 0.35초(`finish`) 뒤 회수 → `fxgame.js endWolves`(전엔 스킬 끝에 바로 지움). 문자열 `OnEnd`를 쓰는 코드는
  이것뿐(xref) — 첸 더 던스트릭 S3 궤적의 `OnEnd` 트리거와 적 셋(`smdeer`·방호 조끼·머드락)의 둘째 상태는 거는 곳이 없어 공식도 기본 상태 그대로 [추정: 문자열·스크립트 검색 기준].
- **버프 진행 단계** (`animSrc`): `SetAnimatorFloatByCondition`(`OnPlay` 0xE8A600 · `Update` 0xE8A740 — 바뀌면 정수/실수로)에 `BuffProgressFloatSource`(`GetValueOnPlay`
  0xE768B0 = `_defaultVal`, `GetValue` 0xE76910 = 끝나면 `_finishedVal`, 아니면 `_curve`(주인 첫 버프 `_buffKey`의 블랙보드 `_progressKey` ÷ `_maxKey`, [0, 1]))를
  `fxplayer.js srcValue`(Hermite 곡선, 무한 접선 = 계단). 하나뿐: 에이야퍄들라 더 크비트 아스카 S2 범위 — `agoat2_s_2[shield]` `value`/`dynamic` → 단계 2(≥ 0.5)·1(> 0.01)·0. 시뮬
  키트가 장벽 흡수 때마다 남은 몫(100분의 1, 올림)이 바뀌면 키트 fx `buffProgress` { id, key, r }(그림 없음, `fxgame.js buffProgress`); 알림 전엔 가득 찬 것으로 [추정].
  같이 고침: 그 범위 이펙트를 즉발 스킬의 시전 창(~1초) 루프로 틀어 곧 사라졌다 → 키트 fx `shield` { duration }(장벽 12초) 동안(`kitofficial.js shield`, `KIT_OWNED`).
  2026-10-23(바인딩 표 대조): 그 범위 이펙트는 버프가 아니라 버프를 쥔 능력 `skchr_agoat2_2/Shield/Aura`의 `_effects`이고, `agoat2_s_2[shield]`의
  ON_BUFF_TRIGGER가 `value`가 다 깎이면(`< 0`) 그 능력을 끊는다(`InterruptAbility` `Shield`, 공개 템플릿 데이터) → 남은 몫 0의 `buffProgress`에 범위 이펙트도 끝냄
  (`fxgame.js buffProgressOn`; 전엔 깨진 뒤에도 `duration` 동안 남았다). 화면 확인 없음.
- **무작위 그룹** (`rgroup`, `EmitterRandomGroup` `_PickOneEmitter` 0xE7E180): 틀 때 `_selfExcluded`가 아니면 1/(n+1) 확률로 자기, 아니면 자기를 멈추고 `_effectPickFrom` 중
  하나(`BattleController.randomTrivial`)를 주인에게 만들고 자기는 끝냄(`_finishEffectWhenSelfFinish` 0) — 로즈몬티스 S3 명중 A/B → `fxgame.js randomPick`(`play`·`spawn`).
- **모듈 변형** (`equipFx`, `SwitchableWhenContainsEquipment` `_TrySpawnHookEffect` 0xEB4B60·`OnFinish` 0xEB46F0): 주인이 그 모듈(`UniqueEquipPair` key·level)을 달았으면 hook 이펙트를
  주인에게 같이 만들고(`_pauseWhenSwitch` 0 — 원래 것도 계속) 끝날 때 같이 끝냄 — 모스티마 S2 범위 둘(`uniequip_003_mostma` 1~3단계 모두 `_equipment_01`) →
  `fxgame.js equipVariant` + `FxInstance.adopt`. 렌더는 모듈 단계를 모름 [추정: 클라 hook이 모두 세 단계를 다 적음]. 정예 모스티마가 그 모듈일 때만.
- 무작위 그룹 후보·모듈 변형은 `index.json emitted`(이름 규칙이 따로 틀지 않음).
- 추출: 운영자 14·적 3 묶음 다시 뽑음 — 3,060 파일 중 31개, `sms`·`clips`·`animFin`·`animSrc`·`rgroup`·`equipFx`와 파투스 넷의 `duration`만. 추출 JSON 골든 EN 2
  (`agoat2_skill_02_range_01`·`whitw2_skill_03_token_trail_01`), CN 그대로. 시뮬 골든 `roster-048`의 `buffProgress` 4개만, 이벤트 골든 `roster-048`(범위가 키트 이벤트로).
  테스트 `test/render/fx-animator-states.test.js`. 아레나(Windows Chrome, 전후 캡처): 루멘 S1 범위가 시작 끝 모습에 멈춰 있던 것 → 대기 루프로 깜빡임, 에이야퍄들라 더 크비트 아스카
  S2 범위가 0단계에서 2단계로 섞여 들어감(2단계의 흰 안개가 전과 조금 다름), 쏜즈 더 로드스타 S2 오라가 끝 클립 뒤 사라짐; 끝 클립 장면 자체·공식 대조는 [화면 미확인].

### 패신저 S3 폭풍·낙뢰 (2026-10-16, 관리자 제보 「패신저 S3 이펙트가 안 나와」)

- 원인: 키트 fx `'storm'`이 `zoneFx`를 타지 않아(위 글래디아 회오리와 같은 꼴) 2D 원(`areaAway`)만 그려졌고, 낙뢰 `'lightning'`은 절차 번개선
  (`fx.js` bolt)이 매번 패신저에게서 대상으로 나갔다 — 공식 프리팹은 시전 루프 `pasngr_skill_03_start`만 나왔다.
- 클라(EN `[uc]skills.ab` `skchr_pasngr_3`, `[uc]projectiles.ab` `projectile_chr_pasngr_s3`): 투사체가 바로 도착(`_immediatelyReach`)해
  `_effectsWhenReached` `pasngr_skill_03_range`를 멈출 때까지 두고(`_clearReachedEffectWhenStop`), 낙뢰마다 연쇄 그래픽이 첫 대상에
  `_specialHitEffect` `pasngr_skill_03_hit`(`_playSpecialEffectOnFirstOne`), 맞은 대상에서 다음 대상으로 `_mainEffect` `pasngr_attack_line`,
  맞는 대상마다 `_effectsWhenHit` `pasngr_attack_hit`.
- 고친 것: `char_modes.py`가 연쇄 그래픽을 `skills[i].chain` { line, first }로 기록(지금은 패신저만 다시 추출). 키트의 'lightning'에 `i`(그 낙뢰의
  몇 번째 대상)·`from`(앞 대상)을 실음(그림 전용 — golden은 fx 종류별 개수만 셈). `fxgame.js`: `'storm'` → `zoneFx`, `'lightning'` → `chainFx`
  (첫 대상 `first` + `target`, 다음 대상부터 선). 선은 2026-10-16 아래 「연쇄 공격」의 대조로 낙뢰 한 번에 **한 줄**, 맞은 대상들의 **발밑**
  (`projectile_chr_pasngr_s3` `_playEffectOnHitPoint` 0 → `skills[i].chain.hit` 0; 그 전에는 튕김마다 HIT 점 → HIT 점 한 토막씩, `startLine`).
  공식 번들이 없거나 품질 low면 절차 번개선이 `from`에서 나간다.
- 확인: 단위 `test/render/fx-cast-timing.test.js` 「패신저 S3」, `test/content/kits_t6.test.js` 「异客: S3 storm」(i·from). Windows Chrome 디버그
  아레나(샌드백 1·2개, 지금 발동): 13칸 마름모 장판 `pasngr_skill_03_range`, 낙뢰 8번 `pasngr_skill_03_hit`, 두 샌드백 사이 `pasngr_attack_line`,
  오류 0. 한 줄 고침 뒤(아래 「연쇄 공격」 확인 줄) 낙뢰 16번에 선 18개, 점 3개·높이 0. [화면 미확인: 실제 판·공식 녹화 대조(장판 크기, 선 높이)]
- 장판 끝 (2026-10-17, 관리자 제보 「패신저 S3 이펙트가 스킬이 끝났는데도 안 사라짐」): 폭풍 4초가 끝나면 `zoneFx`가 장판을 방출만 멈춰,
  `pasngr_skill_03_range`의 먹구름 `wuyun`(수명 50 s 입자 하나)이 살아 있는 동안 장판 전체(테두리 메시 포함)가 46초 더 남았다. 클라
  `EffectBehaviour.OnProjectileStop`(10-14 덤프 RVA 0xA6EDB0)은 `_effectsWhenReached`에 `Effect.FinishMe` — 프리팹의 `_delayToFinish`
  뒤(없으면 바로) 회수. 고친 것: `zoneEnd` — 장판(`zone.fx`)은 끝 시각 + `finish`에 바로 지움(`finishAt`); 쏜즈 더 로드스타·글래디아 등 같은
  길의 장판도 같다. 오라(`zone.aura`, `ScalableAuraHitBehaviour.OnProjectileStop` 0xA84170)도 `FinishMe`지만 `AuraProjectileSetAnimatorTrigger`가
  있으면 애니메이터 트리거로 끝나 이번에는 그대로(방출만 멈춤). 확인: `test/render/fx-cast-timing.test.js` 「패신저 S3」, Windows Chrome 디버그
  아레나(샌드백 3개, 지금 발동, 매초 살아 있는 FxInstance): 옛 코드 시전 14초 뒤에도 `_range` 1, 고친 뒤 폭풍 끝(약 4초)에 0, 오류 0.

### 모드 없는 스킬의 투사체 꼬리 — 스킬 자체 투사체·Default 꼬리 (2026-10-16, 이펙트 연결 전수)

- 원인: 공격 모드를 바꾸지 않는 스킬(`modeNow` −1 — 号角 S1, 歌蕾蒂娅 S1, 流星 S1·S2, 异客 S1, 维什戴尔 S1 …)이 켜져 있는 동안 `trailShot`이
  모드 −1의 꼬리를 찾지 못해 공식 꼬리 없이 `fx.js`의 절차 투사체만 나갔다. 스킬 프리팹이 쏘는 투사체(`[uc]skills.ab` 능력의
  `_projectileKey`)의 `_mainEffect`(`horn_skill_01_trail_02` 등)는 추출되고도 아무도 틀지 않았고, 지속 스킬(焰影苇草 S2 등) 동안의 일반 공격도
  Default 꼬리 대신 절차 투사체였다.
- 클라: 이런 스킬은 공격 모드가 그대로라 일반 공격은 Default 모드의 투사체를 쏜다. 지속 없는 스킬(표 `duration` ≤ 0 — 즉시 시전·충전·다음 공격)은
  발동하면 스킬 프리팹 능력이 자기 투사체를 쏜다. 시뮬은 그런 스킬의 'skill' 켜짐 창을 그 공격('atk')에서 닫는다(디버그 아레나 이벤트 순서로 확인:
  号角 S1·歌蕾蒂娅 S1·流星 S1·异客 S1·维什戴尔 S1·断崖 S1·崖心 S1·至简 S2·伊内丝 S1·跃跃 S1·小满 S1·妮芙 S2·锡人 S1·雪猎 S1·溯光星源 S2).
- 고친 것: `char_modes.py`가 스킬 프리팹 능력의 투사체 `_mainEffect`를 `skills[i].shot`으로 기록 — 연쇄 그래픽의 선(`chain.line`)은 빼고, 이름이
  `_line`인 것(밧줄·연결선: `glady_skill_01_line`, `halo2_skill_02_line_01`)은 뒤로 [추정: 이름으로 가름 — 프리팹 필드로는 구별 안 됨]. 표 지속이
  있는 스킬은 기록하지 않는다(焰影苇草 S2의 불덩이는 쿨다운 20 s짜리 따로 도는 능력, 키트 'strike'). `fxmap.js modelessTrail` + `fxgame.js
  skillTrail`: 모드 없는 스킬 동안 'skill' 켜짐 뒤 첫 'atk'(같은 순간의 'atk'들 — 断崖 S1의 두 대상)은 `shot[0]`, 나머지는 Default 모드 꼬리.
  붙는 자리는 그 모드의 `shotFrom`(스킬 투사체는 Muzzle) [추정: 스킬 능력의 `_mountPointType`은 안 읽음].
- 스킬 창 안에 'atk'이 없는 스킬(流星 S2 'volley', 崖心 S2 'pull', 波登可 S2·锡人·引星棘刺 'zone')의 `shot`은 2026-10-21부터 키트 이벤트가
  날린다 → 아래 「키트 이벤트가 쏘는 스킬 투사체」.
- 남은 것: charpack 모드의 두 번째 투사체(耶拉·洛洛·至简 드론)와 다른 필드로 이어진 투사체(伺夜 S3, 魔王 재능, 丰川祥子 S1 음표 2~8, 号角 S2
  `_full`)는 이 기록에 없다(관리자 노트 「이펙트 연결 전수」). 寒芒克洛丝 재능 화살·琳琅诗怀雅 S3·伊内丝 S3 되돌림·凯尔希·思衡托 S2는 2026-10-21 →
  아래 「다른 필드 투사체」·「대상 쪽별 능력」.
- 확인: 단위 `test/render/skill-shot-trail.test.js`. Windows Chrome 디버그 아레나(지금 발동 3번, `FxInstance` 프리팹 집계): 号角 S1
  `horn_skill_01_trail_02` 3, 歌蕾蒂娅 S1 `glady_skill_01_trail` 5, 流星 S1 3, 异客 S1 `pasngr_skill_01_trail` 2(첫 발은 불러오는 중), 维什戴尔 S1 2,
  断崖 S1 3, 焰影苇草 S2 일반 공격 `reed2_attack_trail` 7(불덩이 꼬리 없음), 오류 0. [화면 미확인: 공식 녹화와 꼬리 모양·속도 대조]

### 투사체 정지 이펙트·스킬 투사체 명중 (2026-10-16, 이펙트 연결 전수)

- 원인: `char_modes.py Projectiles`가 투사체의 `_effectsWhenStop`(클라 `EffectBehaviour.OnProjectileStop`: 투사체가 멈춘 자리)을 읽지 않아
  维什戴尔의 착탄 폭발(`wisdel_attack_01_hit_02`, S1·S2·S3 `_hit_02`)이 안 나왔다. 위 절의 스킬 투사체(`shot`) 공격도 명중은 이름 규칙
  ('skillHit')이라 그 투사체의 명중(`pasngr_skill_01_hit`, `ayer_skill_01_hit` …)이 안 나왔다.
- 고친 것: 남는 투사체가 아닌 것(`_clearReachedEffectWhenStop` 0 — 맞은 자리에서 멈춤)의 `_effectsWhenStop`은 그 투사체의 `hit` [추정: 멈춘
  자리 = 맞은 대상]. 남는 투사체(장판)의 것은 끝날 때 나오는데 풀의 모드·스킬에는 없어 읽지 않는다(伊内丝의 것은 재능 장치). `skills[i].shotHit`
  = `shot[0]`을 쏘는 능력의 `_hitEffects` + 그 투사체의 시작·명중(维什戴尔 S1은 S1_Common의 것 — 여진 S1_Shock 것이 아님); 없으면 기록 안 함
  (号角 S1 포탄은 자기 명중이 없고 뒤의 조명탄이 맞음 → 이름 규칙 그대로). `fxgame.js takeShot`이 그 공격을 `lastAtk`에 `shot`으로 남기고
  'dmg'에서 `shotHit`을 튼다.
- 안 한 것: 한 공격의 하위 투사체 명중(`_additionalProjectile(s)`·재능 `_projectileKey` — 伺夜 S3, 至简 S2, 寒芒克洛丝 재능 …). 시뮬은 한 'atk'의
  피해를 같은 틱의 여러 'dmg'로 보내는데 그 순서가 하위 투사체와 1:1이 아니다(寒芒克洛丝의 두 번째 피해는 특성 이중 사격이지 재능 화살이 아님) —
  오퍼마다 키트와 맞춰야 한다. 号角 S2 `_burstProjectiles`(Full Burst)는 수동 조기 종료 때만 나가 자동 전투에는 없다. 迷迭香 Attack_A/B는
  `_selectMethod` 0 선택기 아래라 번갈아인지 둘 다인지 디컴파일 확인 필요(지금은 A만 「대안 공격」으로 읽음).
- 확인: 단위 `test/render/skill-shot-trail.test.js`. Windows Chrome 디버그 아레나: 维什戴尔 S1 `wisdel_skill_01_hit` 3·`_hit_02` 3, 일반 공격
  `wisdel_attack_01_hit_02` 3, S3 `wisdel_skill_03_hit_02` 2, 异客 S1 `pasngr_skill_01_hit` 3, 歌蕾蒂娅 S1 `glady_skill_01_hit` 7, 断崖 S1
  `ayer_skill_01_hit` 3, 오류 0. [화면 미확인: 폭발 크기·자리 공식 녹화 대조]

### 상시 능력 버프 — 공통 능력의 영구 버프 이펙트 (2026-10-16, 이펙트 연결 전수)

- 원인: 오퍼레이터 프리팹 루트의 `_commonAbilities`(charpack `Others/Direction/CommonAbilities/…`)가 자기에게 거는 영구 버프의 이펙트를 아무도
  읽지 않아 新约能天使의 날개 6개·후광(`angel2_R/L_wing_01~03`, `angel2_Halo_01`), 引星棘刺의 무기 빛(`thorn2_weapon_buff_01~04`)이 추출되고도
  안 나왔다. 모드의 `Talents`·`GeneralAbilities` 버프(`attach`)는 그 모드 동안만이라 이 경로가 아니다.
- 클라: 클라 코드 `Unit.AttachCommonAbilities`가 `_commonAbilities`의 능력을 조건 없이 `Ability.Attach` — 모드 밖이라 모드·스킬이 바뀌어도 그대로다.
  이 능력들의 버프는 `lifeTimeType` 2(INFINITY), 템플릿 `empty`, 대상 고르기 없음 — 이펙트만 붙이는 버프.
- 고친 것: `char_modes.py`가 클립·시전 이펙트·선택기·대상 검증이 없는(`_animKey`·`_castEffects`·`_selector`·`_targetValidator`·
  `_waitForAttackEvent` 없음) 공통 능력의 INFINITY 버프 `overrideEffectKey`를 `common`으로 기록 — 6명: 新约能天使 7, 引星棘刺 4, 圣聆初雪
  `sbell2_idle`, 魔王 `cetsyr_buff_range_01`, 夕 `dusk_buff_02_start`·`_05_start`, 塑心 `cello_common_fx01/03/05`(塑心의 셋과 夕의 `_02`는 추출물이 빈
  프리팹이라 그려지는 것 없음). 凯尔希·思衡托의 RespawnBorn은 클립·시전 이펙트가 있는 시전 능력이라 빠진다(순간이동 끝은 키트 몫). `fxgame.js
  alwaysOn`: 'deploy'마다 그 오퍼에 붙여 'die'(stopOwned)까지 — 【이동】 재배치면 옛것을 끄고 새로. `buff` 항목이 아니다(stopBuffs가 스킬이 끝날 때
  끔). 살아 있는 이펙트 상한(`liveOverCap`)에서 빠진다(`pinned` — 배치 때 붙어 늘 가장 오래된 지속 이펙트라 먼저 잘림).
- 안 한 것: 조건이 있는 것은 이 경로가 아니다 — 新约能天使 재능 폭발 꼬리 `angel2_buff_01_trail_01`(TalentBomb 명중), 烛煌 재생 끝
  `blaze2_revive_end_start`·归溟幽灵鲨 替身 → 본체 `ghost2_birth_empty_03`(공통 능력의 시전 이펙트, 상태 전환 때), 隐现 `inside_buff_01_start`(라테라노
  아군 하나에게 거는 재능 버프 — 공통 능력 목록에 없음). 오퍼가 몸을 돌릴 때 이미 켜진 이펙트의 좌우는 켤 때 것 그대로 [추정: 다른 버프 루프와 같음].
- 확인: 단위 `test/render/common-ability-fx.test.js`, `char_modes.py` 전체 재추출 diff는 `common` 6명뿐. Windows Chrome 디버그 아레나(배치 뒤,
  지금 발동 3번 뒤 갱신 중인 프리팹): 新约能天使 S3·引星棘刺 S3·圣聆初雪 S2·魔王 S2·夕 S2 모두 발동 전후 그대로, 오류 0; 3배 확대 캡처로 新约能天使
  머리 위 후광·등의 날개, 引星棘刺 무기 쪽 빛. [화면 미확인: 공식 녹화와 모양·자리 대조]

### 기본 모드 attach — 모드가 붙이는 능력의 이펙트 (2026-10-21, 관리자 결정 2026-10-21, 디컴파일 확인)

- 원인: 모드의 `attach`(그 모드 능력이 가진 버프·오라의 이펙트)는 스킬 모드 것만 그 스킬이 켜질 때 틀었다(위 「모드 버프 이펙트 `attach`」). 기본
  모드(0)의 것은 아무도 안 틀어 薄绿 재능 범위 `mint_buff_01_range`가 추출되고도 안 나왔고, 阵法术师 특성 이펙트(卡涅利安 `billro_beidong_buff_03`·蜜蜡
  `beewax_buff_01_start`)는 `char_modes.py`가 읽지도 않았다. 관리자 결정 2026-10-21: 판정할 일이 아니라 클라대로 — 클라는 이 이펙트를 기본 모드에 묶는다.
- 클라: `UnitMode._InitAbilities`가 `_generalAbilities`를 모드 능력 목록에 넣고 `OnActivate`가 모드 재능(유효한 것)과 그 능력을 붙이며 `OnInactivate`가
  뗀다 — 모드가 바뀌면(`Unit.SwitchMode`) 옛 모드 것이 떨어지고 새 모드 것이 붙는다. 능력이 떨어지면 이펙트도 끝: 오라 자신의 `_effects`는
  `AuraAbility.DoDetach` → `_ClearEffects`가 `Effect.FinishMe(false)`(서서히), 버프 것은 버프가 지워질 때. 그래서 기본 모드 이펙트는 배치돼 있고
  모드를 바꾸는 스킬이 돌지 않을 때 켜져 있다. 모드를 안 바꾸는 스킬(attackMode −1)은 기본 모드 그대로라 계속, 기절은 능력을 떼지 않아 그대로.
  - 薄绿: `Modes/Default/Talent/1`(모드 재능) AuraAbility `_effects` `mint_buff_01_range`(`_createEffectOnDummy` 1) — 地质学者 범위. S1·S2 모드엔 없다.
  - 卡涅利安: 기본 모드 `_generalAbilities` = [무장 해제 버프, `Trait_Eff`(버프 `billro_trait_eff` → `billro_beidong_buff_03`)], `S1_Enhance` = [`Trait_Eff`]만
    (다른 스킬 모드는 `Trait_Override`). `billro_s_1`의 ON_BUFF_START가 `billro_talent_enhance_mark`(충전 둘 이상)면 모드 2(`S1_Enhance`), 아니면 1(`S1`)로
    바꾼다 → 충전 S1 동안은 특성 모습이 그대로: 시뮬 'shell' `charged` 1에 `fx/kitofficial.js`가 `billro_beidong_buff_03`을 스킬 동안(`life: 'skill'`).
  - 蜜蜡: 기본 모드 GameObject 자신의 PassiveBuffAbility(무장 해제 버프 `beewax_c_disarmed` → `beewax_buff_01_start`). S1·S2 모드엔 없다.
  - 山 `buff_weak`: 모든 모드 `Body/Attack/Talents/1`의 PassiveAttachmentAbility `_additiveActiveBuffs` — 필드 설명 "These buffs would be added to the
    target ability as active buffs", `DoAttach`가 공격 쪽 AbilityAttachment에 넘김 = 공격 대상(적)에게 가는 버프(재능 확률, `duration`), 그녀 것이 아니다.
    적에게는 시뮬 'weaken' 상태가 그린다(fxstatus). 그녀에게 그려진 적은 없다 — `buff_weak`는 그녀 묶음이 아니라 공용 `buff` 묶음이라 `boundEffects`가
    걸렀다. 深靛 `indigo_buff_01_start`(`_T1` 모드, 속박)도 같은 것이라 `attachFoe`에서도 빠짐(렌더가 `_T1` 모드를 고르지 않아 화면 변화 없음; 적에게는
    'bind' 상태).
  - 洛洛 `rockr_token_01`·至简 `malist_drone`·耶拉 `kjera_token_default`: 기본 모드 `Effect` 버프 = 드론 모습 — `droneIdle`이 그린다(아래 「驭械术师
    드론」), 여기서는 빼 두 번 안 그린다.
- 고친 것: `char_modes.py` — 모드 UnitMode의 `_generalAbilities`를 경로와 상관없이 읽어 그 능력 버프의 이펙트를 `attach`(적을 고르면 `attachFoe`)에,
  능력이 남에게 주는 버프(`_activeBuffs`·`_additiveActiveBuffs`, `TARGET_BUFF_KEYS`)는 뺀다. EN 전체 재추출 diff = `attach`(+ 深靛 `attachFoe`)만, 9명:
  위 넷(山·深靛은 빠짐) + 浊心斯卡蒂 기본 `skadi2_buff_01_range`(HealAura `_passiveBuffs`, 吟游者 범위), 魔王 기본 `cetsyr_buff_01`(`Body/CommonAbility/Effect`),
  瑕光 S2 `blemsh_skill_02_range_02`(S2 Heal 오라 `_passiveBuffs` — 그 스킬 루프에 더해짐), 耶拉 기본 `kjera_token_default`(드론), 安洁莉娜 `Disarmed`
  모드 `aglina_skill_02_gather`(렌더가 그 모드를 안 고름 — 변화 없음). `fxmap.js defaultModeEffects` = `attach[0]` − 드론(`funnels[0]` idle/back) −
  상시(`common`) − `attachFoe[0]` − 키트 몫; `fxgame.js defaultModeFx`: 'deploy'마다 다시 켜고(【移动】 포함), 'skill' 켜짐/꺼짐마다 지금 모드가 기본(0)
  이거나 모드 없는 스킬(−1)이면 켬, 아니면 서서히 끔, 'die'에 끝(stopOwned). `buff` 항목이 아니라(stopBuffs가 안 끔) `pinned`; `stats().mode0`.
- [추정] 모드 전환 때 옛 이펙트가 끝나고 새 것이 처음부터(卡涅利安 기본 → `S1_Enhance` → 기본) — `ActivateMode`의 떼고 붙이는 순서는 안 읽음. 薄绿 모드
  재능이 붙는 조건(`BasicTalent.get_isValid`)은 안 읽음 — 시뮬이 재능을 늘 깔아 늘 켬.
- 확인: 단위 `test/render/default-mode-fx.test.js`(추출값, `defaultModeEffects`, 卡涅利安 충전 S1 계획, dry 레이어로 배치·스킬 켜짐/꺼짐·모드 없는 스킬·재배치).
  전투 골든 그대로, 이벤트 기록 골든 + 줄만(薄绿·卡涅利安·浊心斯卡蒂·魔王 `mode0`, 瑕光 S2 루프, 卡涅利安 충전 S1 한 번). Windows Chrome 디버그 아레나(정예,
  오류 0, `stats().mode0`): 薄绿·卡涅利安·蜜蜡·浊心斯卡蒂·魔王 배치 약 1.3초 뒤 켜짐 → 스킬 시작에 꺼짐 → 끝에 다시(薄绿 19.7초·蜜蜡 19.9초·浊心斯卡蒂 32.7초),
  卡涅利安 충전 S1 동안 스킬 버프로 켜짐·이어 친 충전 없는 S1에는 없음·끝에 다시, 山 S3 그녀에게 `buff_weak` 없음(적 'weaken' 상태만), 洛洛·至简 드론 모습은
  `droneIdle` 그대로(`mode0` 없음). 관리자 확인 2026-10-21(디버그 아레나, 공식과 비교): 꺼졌다 다시 켜짐, 모양 문제 없음.

### 키트 이벤트의 공식 이펙트 — 버프 템플릿이 그리는 순간 (2026-10-16, 이펙트 연결 전수)

- 원인: 공식 이펙트가 있는 오퍼의 키트 이벤트는 `standInOff`가 절차 대체(2D 원·고리·반짝임)를 끈다. 그 순간 대부분은 스킬 시작이나 공격이라
  'skill'·'atk'·'dmg' 바인딩이 그리지만, 재능·버프 순간(치명상 버팀, 층 깨짐, 쓰러짐·일어남, 영구 표식)은 아무도 안 그려 빈 화면이었다. 이
  이펙트들은 캐릭터 번들이 아니라 클라 **버프 템플릿**(`config/buff_template_holder.ab`, 8,072개: CreateBuff의 `overrideEffectKey`·CreateEffect
  노드)이 만든다 — 이펙트 연결 전수(관리자 노트)의 「클라 연결 없는 후보」 대부분이 여기 있었다.
- 고친 것: `render/fx/kitofficial.js KIT_OFFICIAL`(이벤트 → 오퍼 번들 → 계획)을 `fxgame.js officialKitFx`가 실행 — 그 오퍼의 프리팹이 하나라도
  추출돼 있을 때만 절차 대체를 가져간다. 수명은 템플릿대로: 한 번(`once`) · 초 · 스킬 끝까지(`buff` 항목) · 배치 동안 · 그 유닛의 'die'까지 · 다음
  이벤트가 끌 때까지(`tag`).
  - 号角 T2 血战(`horn_t_1[muso]` → `[reborn_effect]`): `convert_start`·`_02` 4초, `_03`·`horn_buff_01_start_front` 배치 동안. S2·S3 过载
    (`[overload_switch_effect]`): 기본 방향이 UP이면 `_back`, 아니면 `_front`(`CheckCharacterDefaultDirection`), 스킬 끝까지.
  - 泥岩 T1 마지막 층이 깨질 때 `mudrok_buff_01_end`(`[shield_c]` BlockDamage). 키트 'shieldBreak'에 남은 층 `left`를 실음.
  - 伊内丝 T2 影哨: `projectile_chr_ines_guard`의 `_effectsWhenReached` `label_start_01`(한 번)·`label_01`·`range_01`을 놓인 자리에 — 새 影哨나
    S3 회수('beam', 그 2D 선은 그대로)가 끈다.
  - 烛煌 T2 绝处重燃: 'downed'에 `blaze2_revive_buff`·`_03`(`[reborn_state]`·`[vfx1]`) — 일어남('revive')이나 퇴장까지 [추정: `_03`은 클라에서 그
    상태의 护盾이 다하면 꺼지는데 시뮬이 알리지 않음], 'revive'에 `blaze2_revive_end_start`.
  - 圣聆初雪 T2(`sbell2_t2[heal]`) `sbell2_revive`; 阿罗玛 S2 띄운 적 착지(`aroma_s_2`) 그 적에 `aroma_skill_02_hit_02`; 寒芒克洛丝 S2 예열 끝
    (`[warming_counter]` → `[warmed_effect_01~03]`) `kroos2_skill_02_buff_01~03` 스킬 끝까지; 妮芙 T1 凋亡 폭발 중인 적(`[ep_damage]`)에
    `nymph_talent_buff_01` 폭발 끝(`t`)까지; 隐德来希 S3 心烛(`etlchi_s3[to_enemy]` → `entlec_effect`) 그 적에 `ghosting_01`, 베낀 적과 잇는 선
    `etlchi_skill_03_line_01` [추정: 선의 방향] — 心烛이 서 있는 동안. 키트 'splash'·'soul'·'candle'에 오퍼 `src`(妮芙는 `t`도)를 실음.
  - 2026-10-16 미판정 쌍 정리(클라 버프 템플릿·charpack·`[uc]skills`·`[uc]projectiles` 대조):
    - 魔王 微尘(`projectile_chr_cetsyr_talent*`, 그녀 둘레를 도는 투사체): 오퍼에 닿으면 `_effectsWhenHit` `cetsyr_hit_01`, S2에서 적에 닿으면
      `cetsyr_skill_02_hit_01`(묶임의 `cetsyr_skill_02_tie`는 'bind' 상태가 그림); S3 HP 나눔마다(`cetsyr_s_3[collect_hp_ratio]`)
      `cetsyr_skill_03_burst_01`. S3 시작의 버프 셋(charpack S3 AuraHeal·`skchr_cetsyr_3` Encourage)은 이름 규칙 활성이 이미 그림. 키트
      'mote'에 `src`.
    - 卡涅利安: 스킬 N 동안 `billro_s_N[eff_cond]`(0.1초마다)가 파생 버프를 유지 — 충전을 다 써서 쓰면 [full]+[half](S3는 [full2]+[half2]까지),
      아니면 [half](S3 [half]+[half2]). 'shell'(S1)·'sandChains'/'sandChainsCharged'(S2, 그 절차 대체 유지)·'devour'(S3)에 스킬 끝까지; 이름
      규칙이 스킬 중에 틀린 `_buff_01`(스킬 밖 충전 1칸 표시)을 틀던 것은 `KIT_OWNED`로 막음. 키트 'shell'·'devour'에 `charged`.
    - 缇缇 S3: 잠든 적이 깨면(`titi_s_3[dmg_ticker]`) 그 적에 `titi_skill_03_hit_02`, 그 적이 재운 적마다 `titi_s_3[effect_line]`의 선
      `titi_skill_03_line_01`(선 프리팹 자기 수명). 키트 'wake'에 재운 적 `to`(이벤트 뒤에 채움), S3 동료 수면 'sleepGuard'에 `src`.
    - 泥岩 S3: `skchr_mudrok_3/SleepAura`가 `mudrok_skill_03_sleep`(`_castEffects` 시작 2 → 끝 6)과 Aura `_effects` `mudrok_skill_03_range`를
      잠든 동안('stone' → 'rockfall'), 깰 때 `mudrok_skill_03_awake`·`_02` 한 번, Awake의 `mudrok_s_3` 버프 `mudrok_skill_03_buff`를 스킬
      끝까지. 활성이 이 넷을 시작에 한꺼번에 틀던 것은 `KIT_OWNED`로 막음(`mudrok_skill_03_buff_02`는 클라 참조 없음).
    - 新约能天使: S3 좌표 포격(`signal` fireToToken)은 `projectile_chr_angel2_s3_start`의 `_mainEffect` `angel2_skill_3_begin_trail_01`이
      그녀에게서 좌표로 `_speed` 10으로 날고 닿으면 `_effectsWhenReached` `angel2_skill_3_begin_range_01`(이름 규칙이 그녀에게 스킬 내내 틀던 것을
      `KIT_OWNED`로 막음); 재능 포탄(`CommonAbilities/TalentBomb`)은 표식 적에 `angel2_buff_01_trail_01`. 키트 재능 'airstrike'에 `tgt`.
    - 缪尔赛思 流形이 오퍼를 베낄 때(`mlyss_wtrman_switch_melee_trigger`/`_range_trigger`) 토큰에 `token_10030_mlyss_wtrman_c1_to_c2`/`_c3`
      (`mlyss_token` 묶음, 이 둘만 추출). 'copy'의 오퍼는 `by`(그 `src`는 베낀 오퍼) — `kitOperator`·`standInOff` 같이.
    - 焰影苇草 S2: 운반자 둘레를 도는 불덩이(`projectile_chr_reed2_fire` `_mainEffect` `reed2_skill_02_fireball_01`, `_projectileAroundRadius` 1,
      `_aroundSpeed` 150°/초) 스킬 끝까지 [추정: 도는 방향; 쿨다운 모양 `_02`·타격별 이펙트는 안 그림].
    - 隐德来希 T2 重盈 `etlchi_innate_hit_01` 3초(charpack Talents/2 `_unmanagedBuffsWhenToggleOn`); 流明 S1 치유 비(`lumen_s_1[effect]`) 대상에
      `lumen_skill_01_range` 수명(`t`)만큼 [추정: 틱마다 `lumen_skill_01_hit`은 안 그림], 키트에 `tgt`·`t`; 寒檀 S2 고드름 자리에
      `sntlla_skill_02_start_01`(`_effectsWhenReached`); 洛洛 S2 过载 드론 `_overloadIdleEffect` `rockr_token_overload_01` 스킬 끝까지; 蕾缪安 T2
      引渡 `lemuen_talent_buff_02` 배치 동안; 歌蕾蒂娅 S3 회오리 당김마다 `projectile_chr_glady_s3_2`의 `_castEffect` `glady_skill_03_range_03`.
    - (2026-10-21) 歌蕾蒂娅 S3 'tornado': 시작 능력 `skchr_glady_3/Chant`의 `_activeBuffs` `glady_s3[effect]`(INFINITY, overrideEffectKey
      `glady_skill_03_buff` — 그 OnPlayEmitter가 `_02`)를 키트가 속박하는 대상(`tgt`, 키트가 새로 실음)에 스킬 끝까지 [추정: 끝 = 능력 끝]. 'tornado'는
      `zoneFx`가 먼저 그리고 그 뒤 `officialKitFx`도 본다. 속박의 `glady_skill_03_buff_to_enemy`(`glady_s_3[unmovable]`, `ChantAttack1`)는 상태 층 것.
      전에는 `_02`만 이름 규칙으로 그녀에게 나왔다(27f5fef5에서 빠짐). 아레나 확인: 대상 위 `buff`·`_02`, 오류 0.
    - 판정만: 圣聆初雪 S1 'frostNova'·缇缇 S2 'sleepGuard'·魔王 'reweave'(S3 이름 규칙, S2 `cetsyr_skill_02_trail_start`) = 스킬; 圣约送葬人 T1
      추가 사격 = 공격(charpack 모드마다 Talents/1의 cast·hit이 모드 바인딩에 들어 있음); 史尔特尔 余烬 = 'healFree' 상태(`surtr_buff_01_start`),
      丰川祥子 S1 음표 적중 = 'oblvnsNote', 流明 정화 = 그 치유의 타격 = 다른 이벤트; 荒芜拉普兰德 T1 단계 = 없음.
    - 계획 형식에 더한 것: `on`이 이벤트 필드 이름(`tgt` …), 다른 묶음 `bundle`, 유닛 둘레 `orbit`, 오퍼→지점 비행 `fly`와 착지 뒤 `after: 'fly'`,
      선 목록(`to`)·한 번 선.
  - 圣聆初雪 T1 눈 타일(관리자 결정 2026-10-16): charpack `Talents/1/SnowAccumulation`은 `AttachListenerToTileAbility` — 칸마다 이펙트 하나,
    `_effectSettings`에서 castedTimeThreshold가 그 칸 층수와 **같은** 항목(1 → `sbell2_ground_01`, 2·3·4 → `_02`, 5 → `_03`)을 고르고
    (`_HoldCastedEffectOnTile` RVA 0xBEE550), `_dontCreateNewEffectWhenCastedTimesSame` 1이라 떠 있는 이펙트와 키가 같으면 그대로 둔다(2→3→4층은
    `_02` 유지, 1→2·4→5만 교체); 맞는 항목이 없으면(0층) 끈다. 그녀가 떠나면 `OnDetached` → `_ClearEffects`로 모두 꺼진다. 시뮬은 눈 지도가 바뀔
    때마다(재능 쌓임·S2 퍼짐·출구 冻结·S1 직선·적이 떠나 지움) 기존 'snow'에 바뀐 칸 `cells` [[x, y, 층수]…]를 싣고(재능 쌓임만 `tiles` 유지 —
    `cells`만 있는 'snow'는 절차 대체 원을 그리지 않음, `kinds.js fxSpec`), `KIT_OFFICIAL.snow.sbell2`가 칸별 `slot` 재생(오퍼·칸마다 하나, 같은
    프리팹이면 유지, `off`로 끔 — `fxgame.js officialKitFx`)으로 그린다. 골든은 'snow' 이벤트 수만 바뀜(로스터 016·018·035·036·046, 필드
    boss_3·boss_5·boss_9 — 피해·결과 같음). 바닥 눈 그림은 세 프리팹의 Unity 내장 Quad 메시 노드(`1`·`2`·`3`, 재질 `sbell_01_ground_12`·
    `sbell_02_ground_34`)라 추출물에서 빠져 있었다 — 이 세 프리팹만 내장 Quad로 재추출(관리자 결정 2026-10-16, 아래 「내장 Quad/Plane 메시」:
    바뀐 것은 Quad 노드의 메시·재질과 텍스처 `sbell2_010` 1장, 다른 필드 같음). 세 프리팹의 `fixed` 노드도 ParticleSystem이지만 그 렌더러가 꺼져
    있어(`ParticleSystemRenderer.m_Enabled` 0, 클라 프리팹 확인 2026-10-21) 클라도 아무것도 안 그린다 — 추출물에 없는 것이 맞다(자식 `ptc` 들을 묶는
    통). 확인: Windows Chrome 디버그 아레나(S1, 30초) — 15칸 `_01` →
    2층에 `_02`로 13칸 교체, 3·4층은 새로 안 만듦(유지), 5층에 `_03` 13칸, 칸마다 살아 있는 이펙트 하나, 칸마다 눈이 보임, 오류 0. [화면 미확인: 적이
    떠나 지워지는 칸 — 아레나 샌드백이 안 움직임] 이펙트를 새로 만들 때의 소리는 rules/audio.md 「버프·커스텀 트리거 소리」.
- 판정: `test/render/kit-event-fx.test.js`가 절차 대체가 꺼지는 모든 (이벤트, 키트) 쌍에 규칙이나 판정을 요구한다 — 새 키트 이벤트가 말없이 안
  그려지지 않게. 판정은 스킬(그 스킬 바인딩이나 활성의 이름 규칙이 그림 — 이름 규칙은 추출물이 있을 때만 검사)·공격·없음(클라도 안 그림:
  耀骑士临光 모듈 骑士家族의 `undying`)·다른 이벤트가 그림·절차 대체 유지(토큰·적이 보내는 것)·**미판정**. 미판정은 圣聆初雪 눈 타일('snow':
  `SnowAccumulation` `_effectSettings` 칸별 층수 → `sbell2_ground_01`(1)·`_02`(2~4)·`_03`(5), 적이 떠나면 지워짐)
  하나였고 2026-10-16 위 규칙으로 닫힘 — 지금 미판정 없음.
- 2026-10-16 묶음 2 — 시뮬이 수를 알리는 이펙트(층·스택·충전·微尘). 키트가 새 fx 이벤트 셋을 낸다(`kinds.js` 셋 다 `none`: 절차 대체 없음; 골든은
  이 셋의 이벤트 수만 — 로스터 11·본드 11·필드 5 시나리오, 피해·결과 같음):
  - `'stacks'` {id, buff, n}: 버프의 층·스택 수 → `app.js`가 `UnitView.onStatusCount`로 상태의 `n`을 바꾸고 `fxstatus.js`가 그 수대로 그림.
    - 泥岩 T1(`mudrok_t_1[init]`·`[recharge]`, max_times 3): 층 버프가 아래부터 `[shield_c]` `mudrok_buff_03_start` · `[shield_b]` `_02_start` ·
      위 `[shield_a]` `_01_start`(max_times가 1이면 `[shield_c]`가 `_01_start` — 이 모드 데이터는 3뿐), 맞으면 위층부터 깨짐 → `LAYER_FX`(층 수 = 상태
      `n`, 'parry'마다 하나 줄고 층이 생길 때 'stacks'로 다시 맞춤). 층이 생길 때마다(배치 포함) `mudrok_buff_01_begin` 한 번(`KIT_OFFICIAL.stacks`).
      막을 때는 `common_buff_parry_01` 대신 블랙보드 `effect` `mudrok_buff_01_hit`(위 「횟수형 护盾 이펙트」 정정, `fxgame.js parryFx` `BLOCK_FX`).
    - 卡涅利安 S3 충전 표식(`billro_s_3[mark_effect]`, 적에게): `[charge][enhance]` 스택 1 이상 `[part]` `billro_skill_03_buff_03_01`, 5에 `[full]`
      `_03_02`를 더함(`[part]`는 남음) → `STACK_FX`. 'stacks'는 스택이 바뀔 때만(1…5).
  - `'charges'` {id, n}: 卡涅利安 스킬 밖 충전(`billro_s_N[eff_cond]`의 스킬 밖 가지, 0.1초마다 `CompareCharSkillAvailableCnt`): 2 → `[full]`
    `billro_skill_0N_buff_02` + `[half]` `_buff_01_02`(S3 `_03_buff_01_02` + `_03_buff_01_01_02`), 1 → `[half]` `_buff_01`(S3 `_03_buff_01_01`), 0 → 없음;
    스킬 중엔 `n` −1(스킬 가지는 위 'shell'·'devour'). 키트의 재능 2 루프(0.1초)가 수가 바뀔 때 냄, 렌더는 그녀 몸의 `slot` 둘(`chargeA`·`chargeB`).
  - `'motes'` {id, n, cap, sk, r, spd}: 魔王 微尘 상시 — 클라에서 微尘은 그녀 둘레를 도는 투사체(`projectile_chr_cetsyr_talent` `_mainEffect`
    `cetsyr_trail_01`, S1 `_talent_s1` 같음, S2 `_talent_s2` `cetsyr_skill_02_trail_01`, S3 `_talent_s3` `cetsyr_skill_03_trail_01`), 돌아올 때
    `_coolDownReadyEffectOnProjectilePos` `cetsyr_trail_start`(S2 `cetsyr_skill_02_trail_start`). 키트(4·5티어 둘 다)가 남은 수 `n`·상한 `cap`·스킬 모양
    `sk`(2·3, 0 재능)·궤도 반지름 `r`·속도 `spd`(°/초, 재능 블랙보드 range_radius 1.15·dynamic_spd 30, S2 outside_radius 2·dynamic_spd 0.9)를 바뀔 때
    냄(S3는 사라지지 않아 `n` = `cap`) → 렌더가 微尘마다 `slot` 하나를 그녀 둘레로 돌림(`orbit` `phase` = 360°·i/cap, 같은 유닛의 궤도는 시작
    시각을 나눠 씀), 빈 슬롯이 다시 차면 `ready` 한 번. [추정: 블랙보드 값이 프리팹의 `_projectileAroundRadius` 1·`_aroundSpeed` 150(S2 0.01)을
    대신함, 고르게 퍼짐·도는 방향, 쓰일 때 사라지는 微尘이 어느 것인지, 배치 때도 `ready`]
  - 锏 S2 「베기 횟수」(`blkkgt_s_2[add_cnt]`·`[shield]` → `blkkgt_skill_02_shield_01/02`)는 판정 「없음」: 그 버프를 만드는 템플릿·charpack·스킬
    프리팹이 없고(이 모드 S2 블랙보드에 `shield_max`도 없음 — 본편 S2의 것) 이펙트 번들에도 그 둘이 없다. S2 대상 버프 `[blocked]`·`[not_blocked]`
    (`blkkgt_s_2[dot]`, 0.01초 간격 2·3번)의 `blkkgt_skill_02_hit_2`는 `_delayToFinish` 0이라 클라에서 거의 바로 끝남 → 안 그림 [추정]. 대신 锏 S1·S2의
    바인딩 프리팹 13개가 추출에서 빠져 있었다(S1 `blkkgt_skill_01_*`, S2 `blkkgt_skill_02_start_01~06`·`hit_1`) — 같은 꼴로 빠진 空弦 S1·S2
    11개(같은 이름 틀의 `_B`·`trail_02`까지 13개)와 仇白 S2 `qiubai_skill_02_hit_01`까지 그 프리팹만 추출(`fx_extract.py --bundle … --match`/`--prefab`,
    `index.json`엔 더해지기만 함). 그 뒤 `local-char-modes.json` 바인딩 이름 중 자기 번들에 추출이 없는 것은 없음(대체 스킬도 고를 수 있어 그려짐).
- 안 한 것: 心烛 선의 방향 확인.
- 新约能天使 S3 (2026-10-21): 모드 바인딩이 `S3FireToToken`의 cast `angel2_skill_3_begin_start_001`(빈 프리팹 — 화면 차이 없음)을 S3 공격마다 틀었다.
  클라 charpack에서 `S3FireToToken`은 S3·S3_Down 모드 `Body/Attack/`의 평소 공격 `Common`(`Skill_3_Loop`) 옆 능력으로 `_animKey` `Skill_3_Skill`
  — S3 첫 사격(투사 좌표 포격)이고 시뮬은 그것을 키트 이벤트 'airstrike' `signal: 'fireToToken'`으로 따로 보낸다. 쿨다운 키(`duration`)·
  `_selectTargetSource`(1)는 다른 오퍼레이터의 평소 공격에도 흔해 구분이 안 됨 → `char_modes.py TOKEN_FIRE`(이름이 `…FireToToken`인 능력, 지금 클라엔
  이 둘뿐)의 시전은 모드 공격 목록에서 빼고(`proj`엔 그대로), `kitofficial.js` 'airstrike' fireToToken이 그 cast를 그녀 위에 한 번 튼다.
  `char_modes.py --id char_1041_angel2`로 다시 뽑아 바뀐 것은 S3·S3_Down의 `cast`·`castOpt`에서 그 이름뿐(같은 코드로 먼저 다시 뽑아 차이 없음 확인).
- 확인: 단위 `test/render/kit-event-fx.test.js`. Windows Chrome 디버그 아레나(지금 발동 3번 동안 만들어진 프리팹): 号角 S2
  `horn_skill_02_buff_03_front` 1(스킬 끝에 꺼짐)·S3 `horn_skill_03_buff_02_03_front`, 寒芒克洛丝 S2 `kroos2_skill_02_buff_01~03`, 隐德来希 S3
  `etlchi_skill_03_ghosting_01` 2·`etlchi_skill_03_line_01` 2, 妮芙 S2 `nymph_talent_buff_01`, 오류 0. 阿罗玛 S2 착지는 허수아비가 안 떠 못 봄.
  [화면 미확인: 재능 순간(号角·圣聆初雪 치명상, 泥岩 층 깨짐, 烛煌 쓰러짐, 伊内丝 影哨)과 阿罗玛 착지 — 아레나에서 바로 못 만듦; 모양·자리 공식 녹화 대조]
  2026-10-16 정리분(같은 아레나): 魔王 S2 `cetsyr_skill_02_hit_01` 30, 卡涅利安 S1·S3 충전 사용 → [full]+[half] 뒤 [half](`_buff_01` 없음),
  泥岩 S3 `sleep`·`range` → `awake`·`awake_02`·`mudrok_skill_03_buff`, 新约能天使 S3 `begin_trail_01` 2·`begin_range_01` 2(포격 2번)·재능
  `angel2_buff_01_trail_01`, 焰影苇草 `reed2_skill_02_fireball_01`(스킬 끝에 꺼짐), 寒檀 `sntlla_skill_02_start_01`, 洛洛 `rockr_token_overload_01`,
  歌蕾蒂娅 `glady_skill_03_range_03` 15, 蕾缪安 `lemuen_talent_buff_02`, 流明 `lumen_skill_01_range`, 오류 0. [화면 미확인: 缇缇 S3 깨어남·선,
  魔王 동료 微尘·S3 나눔, 缪尔赛思 流形 전환, 隐德来希 重盈 — 아레나에서 못 만듦; 焰影苇草 불덩이의 도는 모양 공식 녹화 대조]
  묶음 2(단위 `test/sim/fx-count-events.test.js`·`kit-event-fx` 「slots on and around a unit」·`status-buff-fx`; 같은 아레나, 5초마다 살아 있는 프리팹):
  泥岩 `mudrok_buff_03_start` → 9초에 `_01_begin`과 `_02_start` 더함 → 18초에 `_01_start` 더함(`_01_begin` 3번: 배치·층 둘); 卡涅利安 S1·S3 충전 1칸
  `billro_skill_01_buff_01`·`billro_skill_03_buff_01_01` 뒤 자동 발동으로 스킬 가지; 魔王 `cetsyr_trail_01` 3(돌아가며)·`cetsyr_trail_start` 3, S2 발동
  → `cetsyr_skill_02_trail_01` 6·`cetsyr_skill_02_trail_start`(빈 슬롯·돌아오는 微尘마다); 锏 S1 `blkkgt_skill_01_start_01~03`·S2 `start_01~06`(방향
  `_04_h`)·`hit_1`, 空弦 S1 전부·S2 `start`·`_02`·`_03`, 仇白 S2 `qiubai_skill_02_hit_01`; 오류 0. [화면 미확인: 卡涅利安 충전 2칸·S3 표식 5스택(아레나는
  1칸에서 자동 발동, 충전 S3 표식은 단위만), 泥岩 막을 때 `mudrok_buff_01_hit`(샌드백이 안 때림), 微尘 궤도의 모양·방향 공식 녹화 대조, 空弦 S2 꼬리·명중
  `archet_skill_02_trail_01`·`_hit`(샌드백 하나 아레나에서 안 나옴)]

### 연쇄 공격 — 체인 캐스터·체인 메딕의 튕김 선과 타격 (2026-10-16, 관리자 요청 「일반 공격 연쇄를 공식 클라 데이터와 대조」)

- 원인 셋: ① `char_modes.py`가 투사체의 연쇄 그래픽(`ChainLightningEffectBehaviour`) `_mainEffect`(선)까지 모드 `trail`에 넣어, 컴포넌트 순서에
  따라 선이 날아가는 투사체로 그려짐 — 패신저 일반·S2 공격에 `pasngr_attack_line`, 레이즈 S2에 `leizi_skill_02_line`. ② 시뮬의 튕김
  `['atk', 앞 대상, 다음 대상, 'chain' | 'chainHeal']`(`ai.js`)을 `fxgame.js`가 「앞 대상의 공격」으로 받아, 앞 대상이 적이면 그 적 자신의 공격
  시전 이펙트(`estrikeFx`), 아군이면(체인 메딕) 치료받은 아군의 시전 이펙트(`strikeFx`)를 틀었다(단위 테스트로 재현: 옛 코드에서 튕김 한 번에
  적의 `_attack_start`). ③ 대상 사이는 `fx.js`의 절차 보라색 빔이었고, 튕긴 대상에는 공식 타격 이펙트가 없었다.
- 클라(EN `[uc]projectiles.ab` `projectile_leizi`·`_s2`, `projectile_chr_pasngr`·`_s2`; 디컴파일 10-14 덤프): 투사체 `_mainEffect`(`*_trail`)가
  초당 15칸으로 첫 대상에 날아가고, 도착하면 `ChainLightningHitBehaviour`(`OnProjectileReached` RVA 0xA69C10 → `SelectorHitBehaviour`)가 연쇄
  대상 전원을 한꺼번에 때린다 — 대상마다 `Projectile.OnHitTarget`(0x67A360)이 `_effectsWhenHit`. 그 뒤 연쇄 그래픽 `PlayLineEffect`(0xA68660)가
  `_mainEffect` 선 **하나**의 LineRenderer 점을 맞은 대상들 위치로 차례로 놓는다(시전자는 선에 없음, 대상 1명이면 보이지 않음).
  `_playChainEffectAndAudioAfterSelectTarget`(패신저 S3만 1)이면 대상 고를 때 바로(`DoSelectTargetToHit` 0xA690F0). `_useChainPrefix`는 블랙보드 키
  접두사 `chain.`(`chain.atk_scale` 등)일 뿐 그림·소리와 무관. 레이즈 S2 `_atkScale` 1.0(감쇠 없음, 키트와 같음), 나머지 0.85.
- 고친 것: `char_modes.py` — 연쇄 그래픽 선은 `trail`에서 빼고 모드별 `chain[mode]`로(전체 재추출 diff: 레이즈·패신저·파피루스(체인 메딕)·
  아스트젠 더 라이트체이서 S1 모드만). `fxgame.js chainHop` — 튕김은 공격 경로를 타지 않고 시전자의 모드 `chain` 선을 그린다; 다음 대상의
  'dmg'는 그 모드의 타격 이펙트. 선이 그려지면 `arrowKind`가 절차 빔을 끈다(시전자를 모르거나 선이 없으면 빔 그대로). 모드가 없는 스킬(−1)은
  Default 모드의 선. 아스트젠 더 라이트체이서 S1 키트는 튕김을 'atk' 'chain'으로 알린다(그림·소리 전용).
- 선 한 줄·자리 (2026-10-16 2차, 관리자 요청 「추정 먼저 공식 데이터와 대조」): 처음 고침은 튕김마다 앞 대상 HIT 점 → 다음 대상 HIT 점 한
  토막씩, 두 유닛을 따라 그렸고 [추정], 연쇄의 시전자를 「첫 대상을 노린 마지막 오퍼레이터 공격」으로 짐작했다 [추정]. 클라 대조:
  `PlayLineEffect`(0xA68660)는 선 효과를 투사체 몸체에 한 번 만들고, 효과 안 LineRenderer 전부의 `positionCount` = 맞은 대상 수, 점 i = 대상 i의
  위치를 **한 번** 놓는다(따라가지 않음). 위치는 그래픽의 `_playEffectOnHitPoint`가 1이면 `Entity.hitPoint`(vtable 슬롯 72), 0이면
  `VisualObject.worldPosition`(0x871A30 = 유닛 `transform.position`, 발밑). 투사체가 멈출 때 `OnProjectileStop`(0xA68470)이 선을
  `ThrowEffect` + `FinishMe`. 그리는 그래픽은 `ChainLightningHitBehaviour.get_effect`(0xA6A130) = `GetComponent` — 루트의 첫
  ChainLightningEffectBehaviour. 값(EN `[uc]projectiles.ab`, 컴포넌트 순서는 GameObject `m_Component`): 레이즈 `projectile_leizi`·`_s2`, 패신저
  `projectile_chr_pasngr`·`_s2`·`_s3` = 0(발밑); 파피루스 `projectile_chr_papyrs`·`_s1` = 1(HIT 점); 아스트젠 더 라이트체이서 `projectile_chr_halo2_s1`은
  그래픽이 둘(같은 선, 컴포넌트 3번째 = 1·6번째 = 0)이고 첫 것 = 1(HIT 점). 선 프리팹은 LineRenderer 2~3개뿐(입자 없음) — 한 줄과 토막의 차이는
  Stretch(`texMode` 0) 텍스처가 선 전체에 한 번 늘어나는 것(레이즈 S2 선은 RepeatPerSegment라 같음)과 자리·따라감.
  고친 것: `char_modes.py`가 첫 그래픽만 골라(`load_tree(comp_index)`의 `$comp`) 모드별 `chainHit[mode]`·스킬 `chain.hit`(1 HIT 점, 0 발밑)을 싣는다
  (전체 재추출 diff: 이 10개 값만). 시뮬의 튕김 'atk'에 시전자와 연쇄 첫 대상을 실음 — `['atk', 앞 대상, 다음 대상, kind, null, 시전자, 첫 대상]`
  (`ai.js` 연쇄·연쇄 치료, 아스트젠 더 라이트체이서 S1 키트; 필드만 늘어 golden 그대로) — 시전자 짐작이 없어짐. `fxgame.js chainLine`: (시전자, 첫
  대상)마다 한 순간의 튕김을 모아 선 하나(`FxInstance.setPath`, `fxplayer.js` LineRenderer가 점 최대 16개를 차례로 지남), 점은 그 순간에 고정,
  `chainHit` 1이면 HIT 점, 0이면 유닛이 선 자리(`ex`/`ey`, 칸 높이 — [추정: 비행 적·이륙 오퍼레이터도 엔티티는 칸에 있고 그림만 뜸, 「이륙 높이」의
  ModifyGraphicHolderHeight]). 모드는 그 시전자가 첫 대상을 노린 공격의 것(`aimed`, 시전자·대상 쌍), 없으면 지금 모드. 패신저 S3 낙뢰도 같은
  `chainLine`(낙뢰마다 한 줄). 선은 0.5 s 남음 [추정: `_delayToFinish` — 예전 `startLine`과 같은 값; 패신저 S3의 `_finishMainEffectsBeforePlay` 1(다음
  낙뢰가 앞 선을 끝냄)은 안 옮김].
- 확인: `test/render/chain-attack-fx.test.js`(추출 데이터, 튕김 선·적/아군 시전 없음·연쇄 치료 — 옛 코드에서 실패 확인). Windows Chrome 디버그
  아레나(샌드백 3개, 일반 공격 9 s + S2 9 s, FxInstance 집계): 레이즈 `leizi_attack_01_trail` 3·`leizi_attack_02_line` 8·`_hit` 12, S2
  `leizi_skill_02_trail` 3·`_line` 8·`_hit` 12; 패신저 `pasngr_attack_trail` 3·`pasngr_attack_line` 8·`_hit` 12, S2 `pasngr_skill_02_trail` 6·
  `pasngr_attack_line` 14·`_hit` 21; 절차 빔 0, 오류 0. 2차(한 줄): 단위 `chain-attack-fx` 「setPath」(점 순서, Stretch u 0·⅓·1, Repeat u 0·1·2)·
  추출값, `kits_t1t2` 「1_03 惊蛰」·`kits_alt_t6` 「6_16 溯光星源 S1」(튕김의 시전자·첫 대상); 아레나(`FxInstance.setPath` 집계, 샌드백 3개): 레이즈 일반
  선 4개(전에는 8토막)·S2 4개 점 3개 높이 0, 패신저 S2 6개 점 3개 높이 0, 아스트젠 더 라이트체이서 S1 6개 점 4개(왕복) 높이 1.14(HIT 점), 패신저 S3
  낙뢰 16번에 18개 점 3개 높이 0, 오류 0. 파피루스는 아레나에 치료할 아군이 없어 못 봄. [화면 미확인: 실제 판에서 선 모양·높이·사라지는
  시간, 공식 녹화 대조; 아스트젠 더 라이트체이서 S1·파피루스 선]
- 치료 대상의 타격 이펙트는 아래 「치료 명중」(2026-10-16 3차).

### 치료 명중 — 치료 투사체가 아군에게 닿을 때 (2026-10-16, 이펙트 연결 전수)

- 원인: 메딕의 치료 투사체(赫默 `projectile_silent`, 莎草 `projectile_chr_papyrs` …)의 `_effectsWhenHit`는 모드 `hit[mode]`로 추출돼 있는데(메딕 13명
  전원), 시뮬은 치료에 'dmg'를 보내지 않고 'heal' `[아군, 양]`만 보내 렌더가 그 순간을 공격과 이을 길이 없었다 — 치료받는 아군에게 아무것도
  안 나왔다(연쇄 치료는 선만).
- 클라: 치료 투사체도 피해 투사체와 같은 `Projectile.OnHitTarget`(RVA 0x67A360)으로 닿은 대상에게 `_effectsWhenHit`를 튼다(위 「연쇄 공격」).
- 고친 것: 시뮬 'heal'에 넷째 칸으로 치료한 유닛 id(`damage.js heal`, 없으면 null — 필드만 늘어 golden 그대로, docs/SIM.md). `fxgame.js`가
  오퍼레이터의 아군 대상 'atk'와 연쇄 치료 튕김('chainHeal')을 `healAtk`(아군 → 그 치료 공격)에 두고, 'heal'이 오면 같은 치료자의 2.5 s 안 기록이면
  그 모드의 명중을 튼다(`healHit` → 피해 명중과 같은 `attackHit`, 공격마다 한 번). 다른 유닛의 치료(재생·재능·장판)는 그 투사체의 명중이 아니다.
  치료가 0.5 미만이면 시뮬이 'heal'을 안 보내므로 이펙트도 없다 [추정: 공식은 닿으면 양과 관계없이 틀 것 — 메딕은 다친 아군만 노려 드묾].
- 확인: 단위 `test/render/heal-hit-fx.test.js`(`createFxLayer` `trace`로 트는 이름: 첫 대상·튕긴 대상, 다른 치료자·공격 없는 치료는 없음),
  `test/sim/op-shot.test.js` 실제 판 경로 'heal'의 치료자. Windows Chrome 디버그 아레나(관리자 노트의 확인 스크립트, FxInstance 첫 update로 프리팹 수, 오류 0): 莎草(다친 아군 옵션 — 자기 치료) `papyrs_hit_01` 4.
  赫默의 명중 프리팹 `myrrh_attack_01_hit`은 末药 번들(`myrrh.ab`)에 있어 안 나왔다 → 2026-10-21 그 하나만 赫默 묶음으로 추출
  (`fx_extract.py --bundle silent --pack battle/prefabs/effects/myrrh.ab --prefab myrrh_attack_01_hit`, EN 클라; `index.json` `silent`에 더해짐) —
  이벤트 기록 골든에 `char_108_silent attackHit myrrh_attack_01_hit → ally`가 생김(3판). 묶음 전체를 다시 뽑는 도구는 이 프리팹을 `silent.ab`에서
  못 찾으니 같은 `--pack`으로. [화면 미확인: 실제 판의 다른 아군, 공식 녹화]

### 다른 번들의 바인딩 프리팹 — 자기 묶음에 `--pack`으로 (2026-10-21)

- 원인: 렌더는 오퍼레이터의 바인딩 이름(`modes.json`의 cast·hit·trail·attach·skills)을 **자기 묶음**(`index.json bundles[codename]`)에서만 찾는다
  (`fxgame.js bundleOf` → `b.prefabs.includes`). 클라가 다른 번들의 프리팹을 바인딩한 이름은 어디에도 추출되지 않아 아무것도 안 나왔다 — 赫默
  명중(위)과 같은 꼴이 45개 묶음 66개(번들 이름 목록을 두 클라에서 읽어 모두 찾음, EN·CN 같은 번들):
  - 전용 번들이 없는 둘: 能天使 `angle_*` 7개(`angle.ab` — 번들 이름이 오타 그대로), 盟约·辅助干员 `csuppo_attack_01_hit`·`_trail`(`csuppo.ab`) —
    새 묶음 `angel`·`pithst`가 생겨 둘 다 절차 이펙트 대신 공식 이펙트(`ownsSkill` 참: 금색 빛기둥 없음).
  - 다른 오퍼레이터 번들: 安洁莉娜 `Disarmed` 모드 `glassb_attack_01_start`·`_hit`(`glassb.ab`), 凯尔希·思衡托 모드 2 `kalts_attack_01_hit`·`_trail`
    (`kalts.ab`)·모드 4 시전 `folnic_skill_02_start`(`folnic.ab`).
  - `common.ab`: 스킬 발동 버프 `common_ignite_attack`·`_defense`·`_support`(낮은 티어 S1 등 36명 — 그 스킬은 지금까지 발동 표시가 없었다),
    일반 타격 `common_hit_01`(4명), 치료 시전·명중 `common_heal_start_01`·`common_heal_hit_01`(白面鸮·调香师·波登可), 충전 시전
    `common_charge_cost_start_01`(德克萨斯 S1 등 5명), 安洁莉娜 `Disarmed` 꼬리 `common_magic_trail_01`, 蒂比 이륙 `common_idle_ground`·`common_land_ground`.
    공용 프리팹이 묶음마다 사본으로 들어간다(파일은 작고 텍스처는 공유) — 렌더의 이름 찾기를 바꾸지 않으려고.
- 고친 것: `fx_extract.py --bundle <자기> --pack <번들> --prefab …`로 그 이름들만 자기 묶음에 추출(EN 클라, 출처는 색인 `sources`에 저절로;
  묶음 전체 재추출 `reextract_sources.py`도 그대로 따라감). 코드 변경 없음. 이벤트 기록 골든에 그 줄들이 더해짐 —
  白面鸮의 공격 시전은 이름 매핑의 `plosis_attack_01_start` 대신 바인딩된 `common_heal_start_01`.
- 이름 규칙은 가져온 프리팹을 안 고른다 (2026-10-21, 관리자 확인 「낮은 티어 오퍼레이터의 불꽃 버프가 스킬 없이 붙어 있음」): 가져온 이름도 이름
  규칙(`fxmap.js effectsFor`)에는 자기 묶음 이름처럼 보여, `_attack` 규칙이 스킬 발동 버프 `common_ignite_attack`을 일반 공격 시전으로 골랐다 —
  바인딩된 공격 시전이 없는 오퍼레이터(艾丝黛尔·地灵 등)가 공격마다 틂. 같은 길로 凯尔希·思衡托의 명중 바인딩이 빈 모드 공격에 모드 2의
  `kalts_attack_01_hit`이 나왔다. → `fxgame.js packedIn`: 색인 `sources`에 `pack`이 있는 이름은 `play()`의 이름 규칙에서 뺀다(`emitted`와 같은 자리);
  바인딩이 그 이름을 넘기면 그대로 튼다. 스킬 발동(`activationEffects`)의 이름 규칙은 그대로 [추정: 가져온 이름 중 `_skill_0N`이 든 것은
  `folnic_skill_02_start`뿐이고 그것은 모드 시전이라 이미 빠짐]. 확인: 이펙트 골든 5줄만 빠짐(艾丝黛尔 attackStart 4판, 凯尔希·思衡托 명중 1줄),
  디버그 아레나에서 艾丝黛尔 S1·S2·地灵 S2를 SP 없이 12초 — `common_ignite_attack` 0회, SP를 채운 S1은 발동 버프로 1회.
- 넣지 않은 것: `buff_*`(공용 `buff` 묶음 — 상태 이상 층 `fxstatus.js`가 모든 유닛에 그리므로 자기 묶음에 넣으면 두 번), `common_empty`(빈 프리팹),
  塞雷娅 S3 모드 명중 `common_heal_hit_01` — 클라 S3 모드의 공격은 **아군**을 고른다(charpack `Modes/S3/Body/Attack/Trigger._targetSide` 1:
  치료 펄스가 그 모드의 공격)인데 시뮬은 S3 중에도 적을 쳐서, 넣으면 적 위에 치료 십자가 뜬다. 시뮬이 맞춰지면 넣는다.
- 추출 보고에 새로 나온 것: `RandomEmitter`(`common_charge_cost_start_01`이 0.1 s 뒤 `common_charge_cost_01` 3개를 상자 안 무작위 자리에 틂 —
  아래 「RandomEmitter · FlyToPredefinedLocation」에서 구현), 셰이더 `Torappu/Particles-L2D/AlphaBlend`(盟约·辅助干员 명중: 선언 속성·태그·블렌드가 `Particles/AlphaBlend`와 같음 —
  확인 목록에 넣음), 클립 `rateOverTime.minScalar`(todo).
- 확인: Windows Chrome 디버그 아레나(SP 채우기, 오류 0)에서 能天使 일반 공격 시전·명중·S1 꼬리·S2 버프, 盟约·辅助干员 명중·꼬리·발동 버프,
  艾丝黛尔·安洁莉娜 S1 `common_ignite_attack`, 德克萨斯 S1 충전 시전, 白面鸮 치료 시전·명중·발동 버프, 雷蛇 명중·발동 버프, 蒂比 S1 `common_idle_ground`가
  틀어짐. 能天使 S1의 `angle_skill_01_start`(castLoop)·`angle_attack_02_hit`(target)은 안 나왔다 — (2026-10-21 고침) 클라 `skchr_angel_1`은
  `projectile_angel`을 쏘는 능력과 같은 GameObject의 UberEffectEmitter가 `_hitEffects`·`_castEffects`를 가져, `char_modes.py`가 쏘는 능력 자신의
  hit만 모으던 `shotHit`이 비었다 → 같은 GameObject 컴포넌트의 hit을 더함(바뀐 건 能天使 S1 `shotHit` 하나). 시전은 `fxmap.js activationEffects`가
  모든 모드의 공격 시전 이름을 빼서 S2·S3 모드 시전과 같은 이름이 빠졌다 → 모드를 바꾸지 않는 스킬(−1)은 기본 모드(0)의 이름만 뺌(歌蕾蒂娅 S1
  castLoop `glady_skill_01_buff`도 S2 모드 시전과 같은 이름이라 같이 나오게 됨). [화면 미확인: 安洁莉娜 `Disarmed`(아레나에서
  못 일으킴), 凯尔希·思衡托 모드 2·4, 공식 녹화]

### RandomEmitter · FlyToPredefinedLocation (2026-10-21, 디컴파일 확인)

- 원인: `common.ab`의 충전 시전 `common_charge_cost_start_01`(德克萨斯 S2 등, 묶음 5개: texas·svash2·mlyss·flamtl·vigil)은
  본체만 그렸다. 클라는 그 루트의 `RandomEmitter`가 구슬 `common_charge_cost_01` 3개를 더 틀고, 구슬은 `FlyToPredefinedLocation`으로 DP 칸까지
  날아가 사라진다.
- 클라: `RandomEmitter._DoEmit`(RVA 0xE9EDF0)이 `_preDelay`(0.1 s, WaitForSeconds = 게임 시간)를 기다린 뒤 `_count`(3)번, 상자
  `_randomRangeFrom`(−0.5, −0.5, −0.5)–`_randomRangeTo`(0.5, 0.5, −1)의 무작위 점(`RandomUtil.RandomVector3`)을 그 GameObject의
  `Transform.TransformPoint`로 월드에 옮겨 `BattleController.CreateEffectAtWorldPos`로 `_effect`를 만든다(`_delayPerEffect` 0 간격). 구슬의
  `FlyToPredefinedLocation.OnPlay`(0xE7FBC0)는 `GetPredefinedLocationPosition(_location)` — UI 요소의 화면 점을 맵 높이로 내린 월드 점
  (`UIController.GetPredefinedLocationByUI` 0xF0DFE0 → `ScreenPointToWorldPositionAtMapHeight`) — 으로 `DOMove(_duration 0.5)`·`SetEase(_easeType
  5 = InQuad)`·`SetUpdate(_isIndependentUpdate 1: 배속 무관)`·`OnComplete → Effect.FinishMe`. 卫戍协议의 HUD 플러그인
  (`AutoChessUIPlugin.HookPredefinedUILocation` 0xF20300)은 `AUTOCHESS_BOUND_BAR`(8)만 답하므로 `COST`(0)는 기본 전투 UI의 코스트 칸 = 우리
  DP 표시(rules/ui.md 「전투 HUD」). 이펙트의 진영이 보는 쪽과 다르면(`_ignorePlayerSide` 0) 날지 않는다.
- 고친 것: `fx_extract.py random_emitter`가 노드에 `emit` {effect, count, pre, per, from, to}, `fly_location`이 루트에 `fly` {loc, dur, ease,
  real}을 쓰고(필드 이름으로만), 묶음 5개의 두 프리팹을 `--pack`으로 다시 뽑음. `FxInstance.emitters`가 `emit` 노드를 모으고 `fxgame.js
  stepEmitters`가 그 노드 시간(이펙트 시간 ÷ 속도 = 게임 시간)이 `pre + i·per`에 이르면 상자 점을 노드 행렬로 옮겨 같은 묶음의 구슬을 그 자리에
  둔다(`emitCopy`, 주인을 따라가지 않음); `fly`가 있으면 `startFly`가 `.dpbox` 가운데의 화면 점을 땅(z 0)으로 내린 점까지 실제 시간으로
  InQuad 이동, 끝나면 멈춤. [추정: 상자 점은 축마다 균등, 날아갈 자리는 `.dpbox`의 가운데, 보고 있는 판은 보는 사람 쪽 — 다른 사람 판을 볼 때도
  날림] 클라 스크립트 둘은 `fx_coverage.py SCRIPTS_READ`로 옮김(`RandomEmitter`의 todo 삭제). `common_charge_cost_01_white`(MAX_COST로 남)와
  `common_V050_hint_2`는 우리 묶음에 없음.
- 재질에 저장 안 된 셰이더 속성을 움직이는 클립 트랙(같은 날, 추출 누락 보고의 「쉬운 것」): `material_prop`이 재질에서 못 찾으면 그 렌더러
  셰이더가 선언한 속성(`declared_props`, 텍스처는 `_ST`)에서 찾는다 — Unity는 재질에 없어도 렌더러의 속성 블록으로 값을 넣고 셰이더는 같게
  읽는다. 함께 `skin`(SkinnedMeshRenderer) 노드의 재질도 찾게 함(플레이어 `meshMats`는 이미 둘 다 묶음). 다시 뽑은 7개(lisa S3 buff_02
  `_AddTex_ST`, mizuki S3 start `_DissolveTex_ST`·S2 buff_02 `_MainTex_ST`, hsguma S3 buff, skadi S3 buff, skadi2 S3 buff_03·`_XZ`): 바뀐 것은 트랙의
  `prop`뿐. 남은 둘(mostma `fangkuai`, nearl2 `add2`)은 MeshFilter가 비어 클라도 아무것도 안 그리는 노드 — 보고는 「material property on a node
  with nothing drawn」(none).
- 확인: `test/render/random-emitter-fx.test.js`(추출물·`FxInstance.emitters`·`stepEmitters` 시점·`stepFly`). Windows Chrome 디버그 아레나
  (텍사스 S2, 오른쪽 아래에 대역 `.dpbox`를 넣음): 시전 1·구슬 3, 구슬이 꼬리를 끌며 그 상자 쪽으로 날아가 약 0.5 s 안에 사라짐, 오류 0. 대역이
  없는 아레나에서는 제자리에서 0.5 s 뒤 끝남. 水月 S2·S3, 铃兰 S3, 斯卡蒂 S3 재생 오류 0. [화면 미확인: 실제 판의 DP 칸으로 나는 모양, 공식 녹화]

### OnPlayEmitter · OnFinishEmitter (2026-10-21, 디컴파일 확인)

- 원인: 이펙트가 시작·끝날 때 다른 프리팹을 트는 두 클라 스크립트를 안 읽어(추출 누락 기준선의 todo: 운영자 49개·적 6개, 모두 루트), child
  프리팹이 아예 안 나오거나(파투스 S3 `fartth_skill_03_buff_02` → 바닥 사본 `_XZ`, 스카디 더 커럽팅 하트 S3 `_XZ`, 범위 원의 `_end` 사본 —
  비르투오사·시빌라이트 에테르나·클레멘티아·틴맨 S1·S2·라플란드 더 데카덴차 S2 …), `_buff` 이름 규칙이 스킬 시작 때 같이 틀었다(글래디아 S2 `buff_02_front`,
  수르트 S3 `buff_02`, 望 S3 `buff_02`·`range`, 와파린 S2 `buff_end`가 스킬 내내, 글래디아 S3 `buff_02`는 대상 버프 `glady_skill_03_buff`의
  child인데 그녀에게).
- 클라: `OnPlayEmitter._OnPlayInternal`(RVA 0xE90F50)은 `_instant`면 바로, 아니면(GameObject가 켜져 있을 때) `_preDelay` 뒤
  (`<_DoEmitWithPreDelay>d__16` 0xE9F160) `_DoEmit`(0xE90B10): `_effects` 하나씩 `BattleController.CreateEffect` — `_useSourceEffectPos`면 그
  노드 자리, 주인(`Behaviour.owner`, 이펙트가 만들어진 유닛)이 없으면 그 transform의 부모, 있으면 주인 위(`_useFaceVector`면 주인 faceVector로; 아니면
  방향 없는 오버로드 0x3972670이 대상에게 방향을 물어 같은 오버로드로 넘김). `_clearWhenFinish`면 만든 것을 들고 있다가 `OnFinish`(0xE90810)에서
  끝낸다. `OnFinishEmitter.OnFinish`(0xE8FA40): 주인이 있으면 `_useEffectPosition`일 때 이펙트 위치의 맵 좌표에(`CreateEffectsAtMapPos`), 아니면
  주인 위에(`_useFaceVector`면 faceVector로) `_effects`를 만들고, 주인이 없으면 부모 transform에.
- 고친 것: `fx_extract.py on_emitters`가 노드에 `onPlay` {effects, pre(`_instant`면 0), face, clear, srcPos}·`onFinish` {effects, face, effPos}를
  필드 이름으로 쓰고, `set_emitted`가 묶음마다 다른 프리팹이 트는 이름을 `index.json`/`enemy-index.json`의 `emitted`에 적는다(추출 때마다, 또는
  `--emitted-only`; SwitchableBackEffect의 뒷면 사본 `back`도 — 이름 규칙이 앞면 옆에 따로 틀던 파투스 S3 `fartth_skill_03_buff_02_B`, 블레미샤인
  S1·로즈몬티스 S1·아르케토 S1 시작 `_B`, 위셔델 S3 `buff_02_B`; 뒷면 전환(「SwitchableBackEffect」)이 방향 따라 트는 것은 그대로). 53개 다시 뽑음(전후 비교: 바뀐 키는 `onPlay`/`onFinish`뿐), 빠져 있던 적 child 6개(`enemy_sfji_buff_end_01~04`·
  `enemy_syufo_C1_buff_02`·`enemy_vtsk_birth_02`) 추출. `FxInstance.onEmit`이 그 노드를 모으고 `fxgame.js stepOnEmit`이 이펙트가 기다림을
  끝내고 `pre`(게임 초)에 이르면 같은 묶음에서 child를 이펙트가 붙은 유닛 위에(그 유닛이 없으면 이펙트 자리) 그 프리팹의 `_spawnLocation`대로
  틀고(`onEmitPlay` → `spawn`, 주인 방향), 이펙트가 끝날 때(`stopping`/`done`) `clear` child를 멈추고 `onFinish` 목록을 튼다(`effPos`면 이펙트
  자리). 이름 규칙(`play()`의 `effectsFor`, `activation`의 skillBuff·skillStart)은 `emitted` 이름을 건너뛴다 — 클라 바인딩(modes.json)이 직접 부르는
  이름은 그대로. 예외 손 연결 둘: 안젤리나 더 멜로우 위시 S2 착지의 `fly_end_02`는 `fly_trail_rightAndLeft_01`이 끝날 때 트므로 활강 복귀 목록에서
  뺌, 머드락 S3 `buff_02`(KIT_OWNED)는 이제 `mudrok_skill_03_buff`가 튼다. [추정: 방향 없는 오버로드도 주인 방향; 주인이 없는 이펙트는 이펙트
  자리 — 클라의 「부모 transform」]
- 안 한 것: (글래디아 S3 대상 버프 `glady_skill_03_buff`는 같은 날 「키트 이벤트의 공식 이펙트」에서 넣음.)
  `OnPlayEmitterIf`(`_checkType` MOTION_MODE·버프·Spine 방향 조건)·`RandomFinishEmitter`는 지금 추출물에 없다.
- 확인: `test/render/on-emitter-fx.test.js`(추출물·`emitted`·`stepOnEmit` 시점·지우기·이름 규칙 제외), 이벤트 골든(child·뒷면 사본이 이름 규칙
  줄에서 빠짐 — 불러온 뒤 트는 child 자체는 그날 뒤 `dryFollow`부터 `spawn:emit` 줄로 보임: 아래 「이벤트 기록 골든」), 추출 JSON 골든 갱신. Windows Chrome 디버그 아레나: 수르트 S3 buff → `_02`·`_03`·`_04`,
  파투스 S3 `buff_02` → `_XZ`(`_B`·`_B_XZ` 없음), 글래디아 S2 `buff` → `_02_front`·`_02_back`·`_03`, 스펙터 S2 `buff_02`, 비르투오사 S3·엔텔레키아 S3의
  `_end`가 끝날 때 나옴, 틴맨 S1·S2 범위 원 → `_end`(이펙트 자리), 페이지 오류 0 — 틴맨 S1은 디버그 아레나가 숨은 1티어 항목(`chess_char_1_16`, S1
  키트 없음·선택 불가)을 골라 범위가 안 나왔었다: `debug.js`가 보이는 항목을 고르게 함(레코드키퍼도 4_15 → 5_23). [화면 미확인: 실제 판, 공식 녹화와 모양 대조]

### 이펙트 멈춤·끝 조건 — PauseEffectIf 등 (2026-10-21, 디컴파일 확인)

- 원인: 이펙트를 스스로 멈추거나 끝내는 클라 스크립트 여섯과 EmptyEffect 루트를 안 읽어(추출 누락 기준선 todo: 운영자 85개·적 12개), 클라가
  숨기는 동안에도 늘 보였다 — 비르투오사 S3 장판 중에도 재능 `cello_buff_01`, 머드락 층 이펙트 셋이 겹쳐서, 한기(`buff_cold`)가 빙결 중에도,
  혼 S2·S3 버프가 기절 중에도.
- 클라: 멈춤은 이펙트 전체 — `Effect.Behaviour.set_isPaused` → `Effect.set_isPaused`(RVA 0xE7DBC0) → `ParticleEffect.OnPausedUpdated`(0xEACFD0)가
  파티클 GameObject를 끄고 `Pause`, 풀리면 켜고 `Play`(이어서). `Effect.get_isPaused`(0xE7D4D0) = 자기 플래그 ∨ 남이 건 멈춤 ∨ 동작별 멈춤 목록.
  - PauseEffectIf(`GetCheckResult` 0xE93330, `Update` 0xE93DE0 매 프레임, `_checkOnPlay`면 틀 때도): 주인의 조건들을 순서대로 OR(`_requireAllConditions`면
    AND — `_CombinePauseFlag` 0xE942C0)로 합쳐 하나라도 검사했으면 멈춤을 그 값으로(`_CheckPause` 0xE940E0). 조건: 이상 상태 플래그(목록 포함)·그
    플래그 면역·콤보(SLEEPING/SHELTERING, `CHECK_YES`/`CHECK_NO` — `_CheckPauseIfFlag` 0xE94030)·모드 번호·사라짐·버프 보유·플래그 없음·뒤 보기·
    오른쪽 보기·상태 번호·공유 블랙보드. `_disableMeshRendererWhenPause`는 `Init`(0xE93C70)이 `GetComponentsInParent<MeshRenderer>`로 모은 것만.
  - PauseAnotherEffect: 틀 때(`_preDelay` 뒤 — `OnPlay` 0xE911B0·`Update` 0xE91270) 주인의 버프 이펙트 중 `_effect` 이름(`Entity.GetBuffEffect`)을
    `SetPausedByOthers`로 멈추고(`_OnPause` 0xE91370) 끝날 때 푼다(`OnFinish` 0xE91140); `_checkUpdate`면 매 프레임 다시 잡고, 자기가 멈춰 있으면 돌려줌.
  - PauseEffectWithAnimation(`_CheckPause` 0xE94A70): 주인의 현재 애니메이션이 `_validAnimation`에 없거나 `_invalidAnimation`에 있으면
    `_delayToPause` ÷ 재생 속도 뒤 멈춤, `_finishIfPause`면 그때 끝냄(`_DoPause` 0xE94CE0); 아니면 `_noPauseWhenValid`일 때 `_delayToRestore` 뒤 풂.
  - PauseEffectIfNotIdle(`Update` 0xE91DA0): 주인이 Idle 상태가 아니면(`Character.isInIdletState`) 멈춤, `_needCheckFaceSwitch`면 뒤/앞 볼 때도.
  - PauseEffectIfSpineEvent: 주인 모델의 Spine 이벤트 OnDeactivateEffect / OnActivateEffect(`Entity.Event` 38 / 37 → `_OnPauseEffect` 0xE93110 /
    `_OnPlayEffect` 0xE93190)로 멈춤/풂(`_invertSpineEventMapping`이면 반대), `onlyCheckedAnimations` 밖의 클립이면 풂(`Update` 0xE92FA0).
  - FinishEffectIf(`Update` 0xE7F2E0): 주인이 없어지면 / 주인이 더미가 아니면 / 자기 GameObject의 Animator가 현재 상태 클립을 한 번 다 틀면(루프 아님)
    끝냄. EmptyEffect는 `_delayToFinish`가 재활용 지연(`get_delayToRecycle` 0xEA47C0).
- 고친 것: `fx_extract.py pause_scripts`가 노드에 `pauseIf` {when: [조건…], all, onPlay, meshOff}(조건 이름은 클라 열거형 그대로, EN 덤프 범위
  밖 값 — CN 안젤리나 더 멜로우 위시 `aglna2_levitate_01_emit`의 46 — 은 숫자)·`pauseOther` [{effect, pre, update}](머드락 `mudrok_buff_01_start`은
  둘)·`pauseAnim`·`pauseIdle`·`pauseSpine`·`finishIf`를 필드 이름으로 쓰고, `delay_to_finish`가 EmptyEffect 루트의 `_delayToFinish`도 `finish`로
  (선 이펙트들 0.5 — 렌더에 [추정]으로 둔 `CHAIN_LINE_S` 0.5와 같음). 대상 96개만 다시 뽑음(전후 비교: 바뀐 키는 새 키뿐). `FxInstance.pausers`가
  모으고 `fxgame.js stepPauses`가 프레임마다(이펙트 갱신 전) 주인 뷰로 판정해 멈춘 이펙트는 안 그리고 안 돌린다(`paused`; 뒷면 전환·드론과 같은
  숨김 길). 판정은 `render/fx/pause.js`: 플래그 = 뷰의 `UF`(기절·빙결·한기·은신 — 迷彩는 따로)와 상태 키(침묵·공포·무장 해제·战栗·부유), 수면 콤보 =
  `UF.SLEEP`, 뒤 보기 = 뒷면 모델(뒷면 전환과 같은 `facesBack`), Idle = 시뮬 동작 `ANIM.IDLE` [추정], 애니메이션 = Spine 트랙 0의 클립 이름. Spine
  이벤트는 `units.js`의 클립 이벤트(`app.js ctx.spineEvent`)를 `fxGame.spineEvent`로도 넘김. 다른 이펙트 멈춤은 같은 주인(`owner`)의 같은 이름 항목.
  [추정: 렌더가 모르는 조건(면역·클라 버프 키·모드 번호·블랙보드·SHELTERING·`SP_MODIFY_STOPPED` 등)은 검사 안 한 것으로 — 그 조건만 가진
  모스티마 S2·시빌라이트 에테르나 S2 묶기·무장 해제 표시 등은 그대로 늘 보임]
- 화면에서 바뀌는 것: 비르투오사 S3 장판 동안 재능 `cello_buff_01` 숨김, 머드락 층 이펙트가 한 겹(가장 높은 층만), 민트 S2 시작 0.2 s 뒤 범위가
  시작 이펙트가 끝날 때까지 숨음, 퍼퓨머 S2·아스카론·시·스와이어 디 엘리건트 위트의 같은 꼴(소스 이펙트가 틀릴 때), 한기는 빙결 중,
  혼 S2·S3 버프는 기절 중, 은신 버프(이네스 S2·은신 표시)는 은신이 깨지면, 수면 표시는 깨면 숨음, 안젤리나 더 멜로우 위시 S2 무기 이펙트는
  `Skill_2_Takeoff_End` 클립 0.3 s 뒤 멈추고 활공 꼬리는 그 클립에 끝남, 실버애쉬 더 레인프로스트 S3 무기 버프는 `Skill_3_Combat`의
  OnDeactivateEffect~OnActivateEffect 사이 숨음, 쏜즈 더 로드스타 무기 버프 `_05`·비질 늑대 `sub_start`는 Idle이 아닐 때 숨음.
- 확인: `test/render/fx-pause.test.js`(추출 키·판정·`stepPauses`의 멈춤/재개·다른 이펙트·지연·끝냄·Spine 이벤트·끝 조건), 추출 JSON 골든 3개 갱신
  (새 키뿐), 이벤트 기록 골든 그대로(멈춤은 「트는」 줄이 아님). Windows Chrome 디버그 아레나(`stats().fxGame.paused`): 비르투오사 S3 `cello_buff_01`
  멈춤, 머드락 층 03 → 02(03 멈춤) → 01(02·03 멈춤), 민트 S2 범위 0.2 s 뒤 멈춤·시작 이펙트 끝에 풀림, 혼 S2(기절 없음) 그대로, 페이지 오류 0.
  [화면 미확인: 실제 판 — 상태 이상(빙결·기절·수면)이 걸린 경우, 공식 녹화와 대조]

### 타격별 명중 — MultiHitUberEffectEmitter `_hitGroups` (2026-10-16, 이펙트 연결 전수, 디컴파일 확인)

- 원인: `char_modes.py`가 `_hitGroups`를 읽지 않아 그 이미터만 명중을 가진 모드(锏 일반·S1, 赤刃明霄陈 S1·S3, 德克萨斯 S2, 玛恩纳 S2)와 스킬
  (阿斯卡纶 S1)은 명중 바인딩이 비어 이름 규칙의 명중을 틀었고, 한 공격의 여러 타격 중 첫 타격만 이펙트가 나왔다(공격마다 한 번).
- 클라(10-14 덤프): `MultiHitUberEffectEmitter.OnCastOnTarget`(RVA 0xCBB0B0)은 `_keepBaseHitEffect`이면 자기 `_hitEffects`도 틀고, 시전의 n번째
  타격(`AbilityStandard.spellCnt` — `_DoCast`(0x391FAE0)가 시전 시작에 0, 타격마다 +1)에 `_hitGroups[n].effects`를 그 대상에게 튼다; 범위를 넘으면
  마지막 그룹(`TrySafeGet` 실패 → `Last`), `_useLoopHitEffect`이면 n % 그룹 수, `_useRandomHitEffect`이면 무작위. 값(EN charpack·`[uc]skills.ab`):
  锏 Default·S1 [`blkkgt_attack_hit_1`, `_hit_2`](`_oneshot` 0 — 시전 끝까지), 赤刃明霄陈 S1 [`_skill_01_hit_01`, `_02`]·S3 [`_hit_01`~`_03`] 순환·
  S2(`skchr_chen3_2`) [`_hit_01`~`_06`] 순환, 德克萨斯 S2 [`_skill_02_hit`, `_hit_02`], 玛恩纳 S2 [`_skill_02_hit_01`], 阿斯卡纶 S1 [`_skill_01_hit_01`,
  `_02`], 锏 S1 스킬 프리팹 [`_skill_01_hit_01`, `_02`]. `_keepBaseHitEffect`·`_useRandomHitEffect`는 이 풀에 없음.
- 고친 것: `char_modes.py hit_groups` → 모드별 `hitGroups[mode]`·스킬 `skills[i].hitGroups` = `{ g: [그룹마다 이름], loop?, rand?, keep? }`, 그룹 항목의
  `_oneshot` 0·`_useOwnerToTargetDirection`은 `hitLoop`·`hitAim`에도(전체 재추출 diff: 이 값들 + 锏 `hitLoop` 둘만). 시뮬은 한 공격의 타격을 'atk'
  하나 + 같은 틱의 'dmg' 여럿으로 보낸다(디버그 아레나로 확인: 锏·赤刃明霄陈 S1·德克萨斯 S2·阿斯卡纶 S1 2개, 赤刃明霄陈 S3 3개) — 각 'dmg'의 8번째 칸이
  타격 번호(`docs/rules/sim.md` 「'dmg' 이벤트 8번째」). `fxgame.js strikeGroups`: 번호 i의 'dmg'가 타격 i(번호 없는 옛 시뮬이면 같은 틱의 i번째), 같은
  틱의 번호 없는 'dmg'(재능 추가 피해)·DoT 틱은 타격 아님, 마지막 번호보다 큰 번호는 다음 틱이어도(轰击术师 여진 0.3 s) 그 공격의 타격, 기록은 그 밖에서
  지움. 모드가 없는 스킬(−1)은 그 스킬의 그룹. 锏 S1 스킬 프리팹의 그룹은 S1 모드가 있어 안 씀 [추정: 스킬 프리팹 능력의 따로 도는 타격].
  赤刃明霄陈 S2의 剑气 타격은 키트 'swordStorm'이 그대로 그림. [추정: 시뮬은 타격들을 한 틱에 보내 이펙트가 동시에 나옴 — 공식은 클립의 타격 시점마다.]
- 확인: 단위 `test/render/strike-groups-fx.test.js`(추출값, 锏 셋째 타격 = 마지막 그룹·다음 틱 DoT 없음·번호 없는 피해 건너뜀, 赤刃明霄陈 S3 순환,
  阿斯卡纶 일반·S1), `test/sim/official-event-fields.test.js` 「'dmg' [7]」. Windows Chrome 디버그 아레나(관리자 노트의 확인 스크립트, FxInstance 첫 update로 프리팹 수, 오류 0): 锏 일반 `blkkgt_attack_hit_1`·`_hit_2` 5씩,
  赤刃明霄陈 S3 `_hit_01`~`_03` 18씩, 阿斯卡纶 S1 `_hit_01`·`_02` 7씩, 德克萨斯 S2 `_skill_02_hit`·`_hit_02` 9씩. [화면 미확인: 공식 녹화와 타격 시점]

### 타격별 투사체·쏠 때 대상 이펙트 — MultiRangedAttack·`_effectsToTargetWhenStart` (2026-10-16, 이펙트 연결 전수, 디컴파일 확인)

- 원인 둘: ① `char_modes.py`가 모드의 투사체는 첫 키(`proj[i][0]`)의 꼬리·명중만 읽어, 한 공격의 뒤 타격이 쏘는 다른 투사체(伺夜 S3 둘째·셋째 화살
  `vigil_skill_03_trail_02`/`_03`·`_hit_2`/`_3`, 至简 S2 `malist_skill_hit_2`, 迷迭香 여진)가 안 나왔다. ② 투사체의 `_effectsToTargetWhenStart`(쏠 때
  대상에게)를 스킬에서만 읽어 모드 공격에는 없었다 — 银灰 `svrash_attack_01_trail`, 迷迭香 `rosmon_attack_A_hit_01`·S3 `rosmon_skill_03_B_hit_01`(+`_stone`),
  溯光星源 S3 `halo2_skill_03_trail_01`; 迷迭香 S2 `rosmon_skill_02_range`는 이름 규칙(`_range`)이 스킬 내내 그녀에게 틀었다.
- 클라(10-14 덤프): `MultiRangedAttack.GetProjectileKey`(RVA 0xBF5730) — 타격 n(`spellCnt`, `_additionalTimes` + 1번)의 투사체 = 마지막 타격이면
  `_hookTheLastProjectile`(있으면), 아니면 `_useMultiAdditionalProjectiles`일 때 `_additionalProjectiles[n − 1]`(끝에서 고정), 아니면 n > 0에
  `_additionalProjectile`, 그 밖은 `_projectileKey`. 값: 伺夜 S3 `projectile_chr_vigil_s3_1`/`_2`/`_3`, 至简 S2 `projectile_chr_malist_s1s2` → `_s2_2`, 迷迭香
  일반·S1·S3 본탄 → `projectile_chr_rosmon_after_shock`, S2 본탄 → `_s2_after_shock` ×3, 新约能天使 S1 모드 8발, 跃跃 S2 부메랑 2, 缇缇 S2 3, 丰川祥子
  S1 음표 8(음표는 `noteFx`가 이미 `trail_0N`으로 그림).
- 고친 것: `char_modes.py strike_projectiles`/`shot_groups` → 모드 `hitGroups[mode]`·스킬 `skills[i].hitGroups`에 `{ g: 타격별 투사체 명중, shots: 타격별
  꼬리, starts?: 타격별 쏠 때 대상 이펙트, base: 능력 자신의 명중 }`(이미터 `_hitGroups`가 있으면 그것); 모드 `tgtStart[mode]` = 첫 투사체의
  `_effectsToTargetWhenStart`(전체 재추출 diff: 이 키들만). `fxgame.js`: 'atk'에 `shotStartFx`(타격별 `starts`가 있으면 그 전부, 없으면 `tgtStart`)를 대상에,
  `trailShot`이 뒤 타격의 꼬리도 함께 날림 [추정: 시뮬은 타격들이 한 번에 닿음 — 공식은 `_triggerDelta` 간격, 跃跃 부메랑은 `caperSecond` 그대로],
  명중은 타격 번호의 투사체 명중 + `base`. 모드 없는 스킬의 첫 공격(`takeShot`)은 스킬 꼬리가 없어도 타격별 투사체가 있으면 그 스킬의 것(迷迭香 S1).
  `activationEffects`는 `tgtStart`를 시전자 이펙트에서 뺌. 시뮬: 轰击术师 여진 피해에 타격 번호(`strike: i`).
- 迷迭香 `Attack_A`/`Attack_B`(같은 모드의 대안 공격)와 `projectile_chr_rosmon_B`의 `rosmon_attack_B_hit_01`은 2026-10-21부터 → 아래 「능력 묶음의
  자식·COMBAT 상태 공격」. [추정: 뒤 타격 꼬리를 첫 꼬리와 같은 자리·시각에 날림.]
- 확인: 단위 `test/render/strike-shots-fx.test.js`(추출값, 迷迭香 쏠 때 이펙트·여진 0.3 s 뒤 명중, 伺夜 S3 화살마다 명중, 银灰). Windows Chrome 디버그 아레나(관리자 노트의 확인 스크립트, FxInstance 첫 update로 프리팹 수, 오류 0): 迷迭香
  일반 `rosmon_attack_A_hit_01` 2(쏠 때)·`_A_hit_02` 7(본탄 + 여진)·S1 `rosmon_skill_01_A_hit_01` 1, S2 `rosmon_skill_02_range` 9(사격마다 대상에 — 그녀
  몸에 안 남음), 伺夜 S3 `vigil_skill_03_trail_01`/`_02`/`_03` 22~23·`_hit_1`/`_2`/`_3` 24씩, 银灰 `svrash_attack_01_trail` 3, 新约能天使 S1
  `angel2_skill_1_close_trail_01` 84(0.05 s 간격). [화면 미확인: 실제 판, 공식 녹화와 꼬리 간격·모양]

### 키트 이벤트가 쏘는 스킬 투사체 — 공격 없는 스킬의 꼬리 (2026-10-21, 이펙트 연결 전수 ①)

- 원인: 위 「모드 없는 스킬의 투사체 꼬리」의 `shot`은 스킬 창 안의 첫 'atk'이 날린다. 공격 없이 키트 `onStart`에서 끝나는 스킬은 'atk'이 없어
  공식 투사체가 안 나갔다 — 流星 S2(즉시 화살 ≤ 5발, 'volley'), 崖心 S2(작살로 끌어옴, 'pull'), 波登可 S2·锡人 S1·S2·引星棘刺 S1·S3(던진
  장치가 떨어진 자리의 장판, 'zone'). 2026-10-21 아레나에서 锡人 S2 `tinman_skill_02_trail_02`가 안 나온 것이 이것.
- 고친 것: `fxgame.js skillShotOut` — 그 스킬의 `shot[0]`을 오퍼레이터의 Muzzle에서 대상(유닛이면 따라감) 또는 땅 한 점으로, 시뮬이 그 스킬
  투사체에 쓰는 속도(data/chess.json `shot.skills[i]`: 流星 S2 6칸/s·锡人 3칸/s·崖心 작살 10칸/s, 읽은 값이 없으면 10칸/s [추정])와 PARACURVE
  `height` 포물선으로 날린다. 착지에:
  - 'volley' { id, targets }·'pull' { src, id }: 그 투사체의 명중(`shotHit`, 없으면 `target`)을 그 적에게 — 같은 순간의 피해('dmg')가 아니라 착지
    때. 그래서 키트가 피해보다 이벤트를 먼저 보낸다(流星 S2 키트 순서만 바꿈); `pendingHit`은 그 적을 「이미 받음」으로 본다. 崖心 'pull'에 시전자
    `src`를 더함(전엔 끌린 적 `id`뿐).
  - 'zone': 장판 이펙트(`zone.fx`·`aura`)가 착지 때 나온다(클라 `OnProjectileReached`) — 시뮬의 장판 피해는 이벤트 순간부터라 그림이 비행 시간만큼 늦다
    [추정: 시뮬 시간은 그대로 둠]. 그 스킬의 `shot`을 이미 'atk'이 가져간 장판(号角 S1 조명탄: 'atk' 뒤 명중 때 'zone')은 다시 안 날림(`_fxShot`).
    키 있는 장판의 갱신(引星棘刺 S2 표류)은 첫 이벤트만 날린다.
  - 목록의 `_line`(崖心 `slchan_skill_02_line`)은 그녀와 날아가는 머리를 잇는다(2026-10-21부터 — 아래 「다른 필드 투사체」 밧줄; 전엔 착지부터).
- 같은 꼴인 다른 필드 투사체(寒芒克洛丝 재능 화살, 琳琅诗怀雅 S3 동전 `RandomGold`, 伊内丝 S3 `guard_back`, 歌蕾蒂娅 S3 작살 `_harpoonEffect`)와
  'atk'으로 나가는 스킬 투사체의 `_line`(歌蕾蒂娅 S1·崖心 S1·溯光星源 S2)은 2026-10-21 → 아래 「다른 필드 투사체」.
- 확인: 단위 `test/render/skill-shot-alt-fx.test.js`(流星 S2 꼬리 2·착지 명중, 崖心 S2, 锡人 S2 장판이 착지 뒤), 이벤트 기록 골든에 `- spawn
  shotst_skill_02_trail`·`podego_skill_02_trail`·`tinman_skill_02_trail_02`·`thorn2_attack_trail`이 더해지고 `- spawn shotst_skill_01_hit`이 착지
  명중으로 바뀜. [화면 미확인: 꼬리 모양·포물선 높이·착지 시각]

### 능력 묶음의 자식·COMBAT 상태 공격 — 공격마다 하나 고르는 능력, 저지한 적을 치는 능력 (2026-10-21, 이펙트 연결 전수 ②, 디컴파일 확인)

- 원인 둘: ① `char_modes.py`가 같은 모드의 대안 공격(`Attack_A/B/C` …)을 첫 자식만 읽어, 迷迭香 `Attack_B`의 시전 `rosmon_attack_B_start`·쏠 때
  대상 `rosmon_attack_B_hit_01`, 凛御银灰 `AttackB/C`의 시전, 维什戴尔 `Attack_B/C`, 隐德来希 S3 `Skill_3_Loop_B`의 시전이 안 나오고 A의 것이 매번
  나왔다. ② 仇白처럼 모드에 Body/Combat(저지한 적을 치는 COMBAT 상태 능력, `UnitMode._combat`)과 Body/Attack이 함께 있으면 둘의 이펙트가 한
  목록에 섞여, 원거리 화살에 검 시전·명중이 함께 나왔다.
- 클라(10-14 덤프, 직접 확인): `AbilityRandomGroup._GetAbilityInternal`(RVA 0xC19A50)이 공격마다 자식 **하나**를 골라 `CastToTarget`(0xC186A0)으로
  시전. `_selectMethod` Random 0 = `_SelectAbilityForRandom`(0xC1A140, 앞 `m_randomRangeNum`개 중 균등), `_diffFromLastOneIfNotFirst`면
  `_SelectAbilityDifferentFromLastOne`(0xC19C30, 지난 것과 **같은 객체**를 빼고 균등 — 山의 [Attack_1, Attack_2, Attack_1]은 같은 Attack_1 두 번이라 번갈아),
  `_selectAllAtLeastOnce`면 셔플 백(0xC1A340); Loop 1 = `m_loopIndex`(0x168)를 **먼저 +1** 하고 읽음 — `Reset`(0xC197A0, 붙을 때마다: 모드 전환)이 0으로
  돌려 첫 공격은 두 번째 자식. 「IfNotFirst」의 첫 공격 초기화는 묶음이 기반 `CastToTarget`을 부르지 않아 사실상 안 된다 [추정: `firstAttack` 0x10C를
  쓰는 곳이 기반 Cast뿐]. `AbilitySelectableGroup`(伺夜 S3 `_selectAbilitySequentially`)은 `_DoCastInternal`(0xC49C50) — 0번부터, 성공 때만 다음.
  XLua 핫픽스 다리(정적 0xA0)는 안 봄.
- 고친 것:
  - `char_modes.py ability_groups` → 모드 `altFx[mode]` = { pick: 'random' | 'other' | 'loop', from?: 1, combat?: 1, groups: [{ anim, cast, hit, start }] } —
    자식마다 자기만의(모든 자식에 있지 않은) 시전·명중(그 투사체 명중 포함)·쏠 때 대상 이펙트, `anim` = 자식의 `_animKey`(없으면
    ThreePartOneshotAnimation `_oneshotAnim`). 모드 목록(`cast`·`hit`·`tgtStart`·`hitGroups`)에서는 그 이름을 뺀다(전엔 첫 자식 것이 들어 있었음).
    전체 재추출 diff: 维什戴尔·凛御银灰·迷迭香·隐德来希 S3·仇白뿐(山·阿斯卡纶은 자식 이펙트가 같음). `fxmap.js altGroup` + `fxgame.js castGroup`: 모델이
    휘두르는 클립(아래 렌더 규칙이 같은 방식으로 고름)의 자식, 클립을 모르면 `pick`대로. `shotStartFx`가 그 자식의 `start`도 대상에.
  - 모드에 Body/Combat과 Body/Attack이 함께 있으면 `combatSplit[mode]` = { attack, combat } 각 { cast, hit }(투사체 명중 포함) — 'swing' 7번째 칸
    (주 대상이 그 유닛이 저지한 적, render.md 「Spine 클립 커버리지」 A와 같은 판정)이 1이면 combat, 아니면 attack(`fxmap.js combatEffects`, `boundFor`;
    명중은 그 공격의 표시로). COMBAT 묶음(仇白 `Combat_A/B`, `combat: 1`)은 그런 휘두름에만. 대상: 拉普兰德(기본·S2)·银灰·断崖·伊内丝(기본·S2·S3)·
    丰川祥子(기본·음색 모드)·仇白(기본·S2)·予愿安洁莉娜 S3(CN).
- 렌더 클립도 같은 규칙으로 고침(render.md 「Spine 클립 커버리지」 B): 维什戴尔·迷迭香 `other`, 阿斯卡纶·隐德来希 S3 Loop는 두 번째 클립부터.
- 확인: 단위 `test/render/skill-shot-alt-fx.test.js`(추출값, `altGroup`, 迷迭香 B 클립 → B 시전·`rosmon_attack_B_hit_01`, 仇白 저지 → 검 B만·원거리 →
  화살만), `test/render/attack-alts.test.js`. 이벤트 기록 골든: 위 다섯 명의 B/C 시전·명중이 더해지고 拉普兰德·银灰·断崖·伊内丝의 COMBAT 시전이
  저지 없는 판에서 빠짐(维娜·维多利亚 한 줄은 시나리오 난수 순서가 밀린 것). [화면 미확인: 실제 판에서 클립과 시전 이펙트가 같은 자식인지]

### 다른 필드 투사체 — 재능 화살·동전·되돌아오는 影哨·작살·밧줄 (2026-10-21, 이펙트 연결 전수 ①)

- 원인: 공격 모드의 첫 투사체도 스킬 프리팹의 `shot`도 아닌 투사체는 아무도 날리지 않았다. 寒芒克洛丝 재능 화살 `projectile_chr_kroos2_2`는
  시뮬이 치명을 착탄 때 굴려 꼬리를 고를 수 없었고(그 재능의 시전 `kroos2_attack_start_02`는 모드 시전 목록에 섞여 모든 일반 공격에 나왔다),
  琳琅诗怀雅 S3 끝 동전·伊内丝 S3 되돌림·歌蕾蒂娅 S3 捕网 작살은 키트 이벤트에 그릴 것이 없었고, 'atk'으로 나가는 작살의 밧줄 `_line`은 버려졌다.
- 클라(EN charpack·`[uc]projectiles.ab`):
  - 寒芒克洛丝: Default 모드의 `Body/Talents/1`은 `_isModeTalent` 1·`_probKey` prob인 공격 능력(`_projectileKey` `projectile_chr_kroos2_2` 18칸/s —
    꼬리 `kroos2_attack_trail_02`, `_effectsWhenHit` `kroos2_attack_hit_02`, `_castEffects` `kroos2_attack_start_02` 휘두름 시작, `_atkScaleKey`·stun) —
    클라가 그 확률로 공격 대신 이것을 시전한다. 스킬 모드(S1·S2·S2_Sub)의 재능은 버프 `kroos2_t_1[critical]`(ON_CALCULATE_DAMAGE Dice →
    AtkScaleUp·stun·`overrideEffectKey` `kroos2_attack_hit_02` 0.5 s) — 화살은 그 모드의 것, 피해 계산 때 굴림. 圣约送葬人의 `Talents/1`도 모드 재능
    (受选之人 추가 사격, 시뮬 `forceAttack` 'T.1').
  - 琳琅诗怀雅 S3: 공용 능력 `Others/Direction/CommonAbilities/RandomGold`(`_projectileKey` `projectile_chr_swire2_s_3` 8칸/s, `_randomOffset` 0.3,
    `_triggerDelta` 0.07 s, 선택기 `swire2_s_3[mark_to_enemy]`) — 꼬리 `swire2_skill_03_trail`, `_effectsWhenHit` `swire2_skill_03_hit_02`.
  - 伊内丝 S3: `projectile_chr_ines_guard_back`(10칸/s, `_maxHitNum` 블랙보드) — 꼬리 `ines_skill_03_label_trail_01`, 선 컴포넌트 `_mainEffect`
    `ines_skill_03_pullLabel_line_01`(`_useEndPointAsStartPos`), 지나며 친 적에게 `ines_skill_03_label_hit_01`, 닿으면 `_useTraceTargetWhenReach`로
    그녀에게 `ines_skill_03_getLabel_01`·`getLabel_range_01`.
  - 歌蕾蒂娅 S3 끝: `projectile_chr_glady_s3_3`(`_attachToMountPoint`, `_hookedStartPointType` 2 = Muzzle) — `_harpoonEffect` `glady_skill_03_line`,
    `_firstPartTime` 0.3 s 나가고 `_secondPartTime` 1 s 당겨 옴, `_effectsWhenReached` `glady_skill_03_range_05`, `_movingEffectsWhenReached` `_range_04`.
  - 밧줄: 歌蕾蒂娅 S1 `projectile_chr_glady_s1`·崖心 `projectile_slchan_s1`/`_s2`의 둘째 선 컴포넌트(`_mainEffect` `_line`, `_throwEffect`)와
    `_linkDuration` 1 s, 溯光星源 S2는 따로 나가는 `projectile_chr_halo2_s2_link`(1000칸/s, `_onlyUpdateEnd`) [추정: 컴포넌트 클래스는 디컴파일 안 함 —
    필드로 보아 쏜 이에서 날아가는 머리까지 이어지는 선].
- 고친 것:
  - 추출: `char_modes.py mode_parts` → 모드 `talentAtk[mode]` = { 'T.<n>': { cast, trail, hit } }(`Body/Talents/<n>`의 `_isModeTalent` 1 능력), 그
    이름은 모드 목록(cast·hit·trail)에서 뺀다. 전체 재추출 diff: 寒芒克洛丝(`kroos2_attack_start_02`가 Default 시전에서 빠짐)·圣约送葬人
    (`excu2_beidong_hit`이 일반 공격 명중에서 빠지고 T.1 사격의 것)뿐.
  - 시뮬: 모드 재능은 휘두름 시작에 고른다 — 훅 'swing'(`ai.js updateAlly`)이 `signal`을 정하면 'swing' 9번째 칸·그 'atk' 5번째 칸·그 피해의
    `dmg.signal`에 실린다(`docs/rules/sim.md` 「재능이 고르는 공격」). 寒芒克洛丝 키트가 스킬 밖 휘두름에서 굴림.
  - 렌더: `fxmap.js modePart`(신호의 재능, `replace`) → `fxgame.js castGroup`이 그 휘두름의 시전을 재능 것**만**(공격 대신 시전), `trailShot`이 재능
    꼬리, `attackHit`이 'atk' 신호의 재능 명중. 스킬 모드의 치명은 그대로 'crit' 표시.
  - 키트 이벤트(`render/fx/kitofficial.js`, 문법: 비행 `fly`에 `to`(유닛 필드마다, `gap` 간격, 착지 때 `hit`)·`from: 'point'`(그 점에서 오퍼레이터로)·
    `rope`·`pass`(지나는 유닛에), `harpoon` { out, back, moving }): 琳琅诗怀雅 'coin'(S3 끝, 키트가 동전마다 대상 `targets`를 보냄)·伊内丝 'beam'(키트가
    지나며 친 적 `hits`를 보냄; 그 전엔 절차 빔)·歌蕾蒂娅 'pull'(捕网, `range_05`는 작살이 닿을 때). `fxgame.js planShots`·`planHarpoon`.
  - 밧줄: `fxgame.js ropeLine` — `_line`을 쏜 이의 Muzzle에서 날아가는 머리까지, 착지 뒤 맞은 유닛까지 1 s(`_linkDuration`). 'atk' 스킬 투사체
    (`trailShot`의 스킬 `shot`)와 `skillShotOut`(崖心 S2 — 전엔 착지부터 프리팹 길이) 모두.
- [추정] 동전은 시뮬 피해가 한순간이라 그림만 0.07 s씩 늦게·비행 시간만큼 늦게 닿는다; 동전의 `_randomOffset`은 안 씀. 되돌아오는 影哨의 명중은 적이
  비행선에 비친 자리를 지날 때, 높이는 그녀의 명중점 높이. 작살 머리는 Muzzle 높이에서 땅으로 직선. 溯光星源의 연결은 그녀의 꼬리와 같이 날아감.
- 확인: 단위 `test/sim/talent-shot-events.test.js`(寒芒克洛丝 'T.1' 휘두름·화살·치명 1:1, 스킬 중엔 착탄 굴림, 동전 대상, 되돌림 `hits`),
  `test/render/talent-side-fx.test.js`(추출값, `modePart`, T.1 시전·명중, 동전 간격·착지 명중, 되돌림 지남·착지), `test/render/kit-event-fx.test.js`.
  이벤트 기록 골든: `kroos2_attack_hit_02`, `glady_skill_03_line`·`_range_04`·`_range_05`가 더해지고 圣约送葬人 일반 명중에서 `excu2_beidong_hit`이
  빠짐(나머지 두 줄은 시나리오 난수 순서). [화면 미확인: 꼬리·밧줄·동전·작살 모양과 시각을 공식 녹화와]

### 대상 쪽별 능력·뒤따르는 투사체 — 凯尔希·思衡托 S2 (2026-10-21, 이펙트 연결 전수 ②, CN 클라)

- 원인: S2 모드의 공격은 묶음(`_abilityConfigs`) 안의 두 능력인데 `char_modes.py`가 한 목록에 섞어, 적에게도 치료 투사체 꼬리
  (`kalts2_skill_02_trail_heal_01`)가 나가고 시전 `start_damage_01`·`start_heal_01`이 매번 둘 다 나왔다. 착지 뒤 따라 나가는 투사체의 표시도 없었다.
- 클라(charpack — 지금 EN 클라에도 있어 EN에서 다시 뽑음, 나머지 값은 CN 추출과 같음 — 와 CN `[uc]projectiles.ab`):
  `Modes/s2/Body/Attack/HealAlly`(Trigger `_targetSide` 1, 치료 대상 — `projectile_chr_kalts2_s2_heal`, `start_heal_01`)·`AttackEnemy`(Trigger `_targetSide` 2 — `projectile_chr_kalts2_s2_dmg`, `start_damage_01`). 두
  투사체 모두 착지(`ProjectileActionBehaviour` `_ev` ON_HIT_OBJECT)에 반대쪽 반을 `EmitProjectile`로 투사체 자리에서 쏜다: 피해 탄 → `_sub_heal`,
  치료 탄 → `_sub_dmg`(0.4 s, `_onlyCheckHitWhenStop`) — 그 `_effectsToTargetWhenStart`가 `indicator_damage_01`+`range_heal_01_delay` /
  `indicator_heal_01`+`range_damage_01_delay`(이름은 데이터 그대로).
- 고친 것: `char_modes.py mode_parts` → 모드 `sideFx[mode]` = { ally, foe } 각 { cast, trail, hit } — 공격 아래 자식 중 자기 Trigger가 한쪽만 고르는
  것이 양쪽 다 있을 때. 그 이름은 모드 목록에서 빠짐(diff: 凯尔希·思衡托 s2만). `fxmap.js modePart`(쪽, 더함) → `castGroup`이 휘두름의 대상
  (그 6번째 칸 — 돌아볼 대상, 없으면 지난 대상; 치료 탄은 'atk' 대상) 쪽 시전을, `trailShot`이 그 쪽 꼬리. 명중은 그대로 'aoe' 표시(`pickFx`, 시뮬
  `ally`)가 착지 이펙트 + 뒤따르는 투사체의 두 이펙트를 그 자리에.
- [추정] 시뮬은 두 반을 한순간에 내는데 클라는 둘째 반이 0.4 s 뒤(뒤따르는 투사체가 멈출 때). 시뮬 시간은 그대로.
- 확인: `test/render/talent-side-fx.test.js`(추출값, 적 → `start_damage_01`, 아군 → `start_heal_01`, 착지 세 이펙트). [화면 미확인: 실제 판]

### 버프 스택 수로 바뀌는 이펙트 — 스택 단계·최대 스택·회피 준비 (2026-10-21)

- 원인: 공식 버프 템플릿은 STACK 버프의 `overrideEffectKey`를 첫 스택부터 띄우고, `FilterByBuffStackCount`가 정한 수에 이른 순간 다른 효과의
  파생 버프를 만든다. 시뮬은 그 버프들을 클라에 알리지 않거나(`visible` 없음) 스택 수를 안 보내 아무것도 안 나왔다. 조사·표는 관리자 노트(스택 단계
  버프 이펙트, 2026-10-17).
- 클라(EN 버프 템플릿 `config/buff_template_holder.ab`, charpack):
  - 信仰搅拌机 T1 `rmixer_t1[attr_stack]` `rmixer_buff_01` — 그 프리팹의 `SwitchableEffectByBuffStackCnt`(`_stackCnt` 3, GE)가 3스택에 `rmixer_buff_02`로
    바꾼다(앞 것은 멈춤, 역어셈 0xE9B9B0). 琳琅诗怀雅 T1 `swire2_tr` 스킬 중 결제마다 `swire2_t_1[atk]` `swire2_buff_01_start`, `max_stack_cnt`에
    `[max]` `_01_start_02`. 阿斯卡纶 T1 적의 `ascln_t_1[debuff]` `ascln_buff_01`, 최대에 `[max_eff]` `ascln_buff_02`(1초마다 판정, 내려가면
    `FinishDerivedBuff`). 夕 T1 `dusk_t_1[atk]` `dusk_buff_03_start`, 최대(EQUALS)에 `[effect]` `_03_start_02`. 塞雷娅 T1 `demkni_t_1[stack]`
    `demkni_buff_01_self`. 妮芙 T2 최대(모듈 판 `nymph_e_002_t_2`는 `stack_cnt_check`)에 `nymph_t_2[atk][effect]` `nymph_talent_buff_02`. 洛洛 T1
    최대(EQUALS)에 `[effect_1]` `rockr_buff_01`.
  - 玛恩纳 解放者 특성 `mlynar_tr`: 초마다 `mlynar_tr_atk` 한 스택, 스킬 밖에서만 이펙트를 고침 — 1스택 `[a]` `mlynar_attack_01_buff_L_01`,
    `mid_stack_cnt`(20) `[b]` `_L_02`, `max_stack_cnt`(40) `[c]` `_L_03`, 아래로 내려가면 b·c 끔; 스킬 끝 `mlynar_s_cast` ON_BUFF_FINISH가 스택과 셋을
    함께 끝냄(S2 `[killmark]`가 있으면 그것만 — 스택·이펙트 유지).
  - 佩佩 S2 `pepe_s_2[attack_speed]`: 첫 시전은 `first_skill`만 지우고, 둘째부터 `cnt`(= `max_stack_cnt`에서 시전마다 1씩 줄임)로 `≤ 0` `[effect_3]`
    `pepe_buff_level_03` · `≤ 1` `[effect_1]` `_01` · 그 밖 `[effect_2]` `_02`; 스킬 끝에 `FinishDerivedBuff`. (데이터 `max_stack_cnt` 2: 둘째 시전 `_01`,
    셋째부터 `_03`, `_02`는 안 나옴.) 佩佩 S3: `Modes/S3/Body/Attack`의 `_activeBuffsToMainTarget` [`pepe_s_3_fx`, `pepe_s_3_range[active]`, …] — 앞의
    `pepe_s_3_fx`가 그녀의 `pepe_s3_range[atk]` 스택(이번 공격이 더하기 **전**)으로 주 대상 발밑에 `≥ max_stack_cnt` `_hit_range_03` · `≥ 2` `_02` ·
    그 밖 `_01`(`_constDirection` UP) [추정: 목록 순서대로 적용].
  - 회피 준비: 赤刃明霄陈 T2 `chen3_t2[timer]`가 `stack_time`에 `chen3_buff_start_01`(CreateEffect)·`[evade]` `chen3_Shield_buff_01`(Evade에 끝)·회복의
    `chen3_Shield_buff_02`; 蒂比 `tippi_t[evade]` `tippi_buff_01`(Evade에 끝).
- 고친 것: 키트가 그 버프를 `visible`로 만들고, 스택 수가 바뀔 때마다 fx 'stacks' { id, buff, n, max, mid? }(`max`·`mid`는 키트가 읽는 공식 블랙보드)를
  보낸다(泥岩·卡涅利安과 같은 길). `fxstatus.js STACK_FX` 항목이 [from, spec, below?] — `from` 이상(이고 `below` 미만)일 때 켬, 경계에 `'max'`/`'mid'`
  (그 이벤트의 값, 없으면 안 켬); 키 끝 `:<id>`(阿斯卡纶 적용자별)는 떼고 찾음. `UnitView.onStatusCount`가 `max`·`mid`를 함께 둠.
  - 키: `rmixer:t1`(01은 3 미만만)·`talent:swire2_buyer`·`ascln:judg:<id>`·`dusk:realm`·`saria:suit`·`nymph:key`·`rockr:rock`·`trait:libratorRamp`
    (해방자 램프를 공식처럼 초 = 스택으로 환산: `n` = 램프 ÷ (최대 ÷ `max_stack_cnt`), 모듈 시작 +100 %는 20스택; 玛恩纳 S2가 지킨 램프도 다시 보냄).
  - 佩佩 S2 `pepe:rage`(둘째 시전부터의 버프)에 단계 `fxTag` 1/2/3 → `KEY_FX` 함수. 佩佩 S3는 공격마다 'stacks' { buff 'pepe:tremor', n: 이번 전
    스택, max, tgt: 주 대상 } → `kitofficial.js stacks.pepe`가 `tgt`에.
  - 赤刃明霄陈 `chen3:evade`(쥔 동안, 다시 배치되면 다시 켬)·蒂比 `tippi:evade`(준비된 순간부터 피해가 가져갈 때까지) → `KEY_FX`; 赤刃明霄陈의 순간 둘은
    새 키트 이벤트 'evadeReady' → `kitofficial.js`(대체 그림 없음 `a: 'none'`).
  - `fx_coverage.py`: `SwitchableEffectByBuffStackCnt` todo → hand(信仰搅拌机만).
- 안 한 것: 阿斯卡纶의 `[max_eff]` 판정 주기(1초)는 안 따름 — 스택이 바뀌는 순간. 蒂比 회피 준비는 시뮬 그대로(배치 즉시 준비, 피하지 못하는 피해도
  준비를 되돌림 — 공식 `tippi_t[evade]`는 `FilterDamageModifer`를 거친 피해에만 끝남 [추정]); 赤刃明霄陈의 쥔 회피는 시뮬처럼 퇴각에도 남는다.
- 확인: 시뮬 `test/sim/stack-buff-fx-events.test.js`(키트마다 'status'·'stacks' 수와 경계, 佩佩 S2 단계, S3 `tgt`, 'evadeReady'), 렌더
  `test/render/stack-buff-fx.test.js`(구간·`max`/`mid`·적용자 키·단계·회피 준비·佩佩 S3 명중 단계). 골든: 표시 이벤트 수(`status`·`fx`·`stacks`·
  `evadeReady`)만; 이벤트 기록 골든 + 줄만(첫 단계들, 信仰搅拌机 `_02`, 佩佩 S3 `_01`~`_03`, 赤刃明霄陈 셋, 蒂比). Windows Chrome 디버그 아레나(정예,
  오류 0, 전투 시계로 첫 재생): 信仰搅拌机 `_01` 2.0 s → `_02` 4.2 s, 佩佩 S3 `_01`·`_02`·`_03`, 佩佩 S2 둘째 시전에 `pepe_buff_level_01`, 玛恩纳
  `_L_01`·`_L_02`(모듈 시작 +100 % = 20스택이라 배치 즉시), 赤刃明霄陈 8.3 s에 셋, 蒂比 `tippi_buff_01`, 塞雷娅 21.7 s, 琳琅诗怀雅 S3 `_01_start`, 阿斯卡纶
  `_01`·`_02`, 洛洛 `rockr_buff_01`. [화면 미확인: 실제 판, 공식 녹화와 모양·자리 — 夕·妮芙·琳琅诗怀雅의 최대 단계, 玛恩纳 `_L_03`은 아레나에서 안 봄]

### 안 나오던 공식 이펙트 메우기 — 얼린 보호 목표·전투 독수리·S3_End 시전·待投放 표시·운반선 표시·저장 에너지 (2026-10-21, 이펙트 묶음 D)

바인딩이 없어 렌더가 한 번도 틀지 않던 공식 이펙트. 클라 필드를 찾아 키트 이벤트(`render/fx/kitofficial.js`)·`fxgame.js`·`modes.json`에 이었다.

- **圣聆初雪 S2 얼린 보호 목표**: 토큰 `token_10058_sbell2_icetgt`(EN `pkgrps/btl_pfb_tokens_4.ab`)의 `Modes/Default/Body/GeneralAbilities/Effect`가 INFINITY
  버프 `icetgt_a[effect]`(`overrideEffectKey` `sbell2_tile_frozen`)를 들고, 그 템플릿의 ON_OWNER_FINISH가 `CreateEffect sbell2_tile_defrost`(TARGET =
  토큰). → 키트의 'summon'에 `token`을 싣고 `kitofficial.js summon.sbell2` = 토큰 위 `sbell2_tile_frozen`(그 유닛의 'die'까지) + 새 문법 `end`(그 유닛이
  'die'할 때 선 자리에 한 번 — `fxgame.js unitEndFx`). 얼음 마름모(`units.js ICE_TOKENS`)는 그대로.
- **凛御银灰 S3 전투 독수리**(디컴파일): S3 모드 공격의 `_activeBuffs` `svash2_s_3[trigger_self]` → `skchr_svash2_3/BirdAttack`의 `svash2_s_3[bird_on_self]` →
  `Nodes.Svash2EmitProjectileFixedDirection.Execute`(RVA 0xE2B070)가 `projectile_chr_svash2_s3_bird_self`를 그(`_startPositionType` BUFF_OWNER)에서 range_id
  상자의 첫 적(`_GetTargetMountPoint` 0xE2B7C0) 쪽으로 `emit_count`칸(블랙보드에 없으면 3.0 — 상수 0x62c9d38) 쏜다(10칸/s, `_lifeTime` 0.3 s).
  그 `Svash2ProjectileEffectBehaviour`(`Init` 0xA8DFF0 · `OnProjectileBorn` 0xA8E280 · `_CreateAlignToProjectileEffect` 0xA8E900 · `OnTick` 0xA8E5B0 ·
  `OnProjectileStop` 0xA8E300): `_useTargetAsMountPoint`가 없으면 출발점의 발 마운트에 `_effectsAlignToProjectileDirection`을 출발 → 목표 방향으로 만들고
  (`…WhenDirRight`가 있고 그 방향 x > 0이면 그 목록), 투사체가 멈출 때 `FinishMe`. → `fxgame.js svashBird`: S3(스킬 3번) 중 그의 'atk'마다
  `svash2_skill_03_trail_02`를 그에게 대상 쪽으로 0.3 s, 그 뒤 프리팹 `finish`. [추정: 첫 적 = 공격 대상, 시뮬 타격 순간에]. 다른 오퍼레이터 위
  독수리(`BirdAttack_Ally` → `projectile_chr_svash2_s3_bird`, 오른쪽 `_trail_right_01`·그 밖 `_trail_left_01`)는 독수리가 카드(오퍼레이터)에 앉는 공식
  기능이 시뮬에 없어 안 나온다.
- **琳琅诗怀雅 S3 끝 `S3_End` 모드**: 스킬 끝(`swire2_skill_3` ON_BUFF_FINISH SwitchMode)의 `Modes/S3_End/Body/Trigger`(`Skill_3_End`)가 ON_CAST_START에
  `swire2_skill_03_start_03`·`_start_03_02`·`swire2_skill_03_range`(`_useFourDirectionalFace`)를 시전 — 동전이 없어도. → `kitofficial.js coin.swire2`가
  'coin' { skill 'swire2_3' }에 새 문법 `cast`(`fxgame.js play` — 그 오퍼레이터의 시전처럼, `turn` 적용)로 셋을 튼다 [추정: 프리팹 길이만큼 —
  클라는 그 행동의 ON_CAST_END에 끝냄].
  판에서는 안 나옴(관리자 결정 2026-10-22): 이 모드에서 S3는 닫히지 않아 키트가 S3 끝 'coin'을 보내지 않는다 — 이 셋과 위 `RandomGold` 동전은 렌더 연결만 남음(`sim.md` 「琳琅诗怀雅 S3」).
- **凯尔希·思衡托 S3**(CN 버프 템플릿·`[uc]skills.ab`): `kalts2_s_3[on_token_born]`이 `S3OperatorSelector`가 고른 오퍼레이터에 `kalts2_s_3[withdraw]`를
  거는데 그 ON_BUFF_START가 `CreateEffect kalts2_skill_03_teleport_02`(BUFF_OWNER). → 'kalts2Takeoff'에 `picks`(시뮬 `withdrawPicks`), `kitofficial.js`가
  각자에. 머리 표시: S3를 고르면 그 스킬의 `_extraAbilities` `skchr_kalts2_3/Indicator`가 `kalts2_s_3[indicator]`(0.1 s마다)로 — 그녀가 모드 2
  (`s3_transporting`)가 아니고 카드가 RESPAWNING이 아닐 때 — 선택기의 대상에 `[indicator_fx]`(0.1 s) → `[indicator_fx][fx]`
  `kalts2_skill_03_indicator_head_01`(0.15 s마다 `[indicator_fx]`를 확인해 끝). → 시뮬 새 fx 'kalts2Mark' { ids, off }(S3를 골랐을 때 0.1 s마다 계산,
  바뀔 때만; 비행 중 [추정: 이륙 클립은 아직 모드 s3]·자리에 없을 때 비움) → `kitofficial.js`가 대상마다 slot(새 문법 `unit`: id 하나), 'die'에 끝.
- **克莱门莎 S2 운반선 표시**(CN 버프 템플릿): S2 모드 GeneralAbilities `EmitProjectile`의 `clemnt_s2[emit_projectile]` 시작이 그녀에게 `[mass_not_full_effect]`
  `clemnt_skill_02_mark_01`, 태운 질량이 `max_passenger_mass`에 이르면(`[sync_passenger_info]`) 그것을 끝내고 `[mass_full_effect]` `_mark_02`, 운반선이 멈출
  때(트리거) 둘 다 끝. → 'anchor'에 `_mark_01`(멈출 시각까지), 시뮬 새 fx 'cabinFull'(남은 무게 0이 되는 순간 한 번)에 `_mark_02`로, 'tide'에 끝(`fxgame.js
  cabinMark`).
- **秘术师 저장 에너지**(upstream #633 — 숫자 표시 PR #636은 안 받음, 관리자 결정 2026-10-15; 디컴파일): charpack `Trait/ChargableAttackGroup`의
  MultiChargeUberEffectEmitter — `OnEvent`(0xCBA450)가 색인을 `GetChargeTimes()`(0xCB9DD0)로 두고 저장 행동 중이면 `CreateChargeEffects`(0xCB84B0)가
  `_chargeEffectGroups[색인]`을 틀며, ChargeEffectOptions(`CreateEffect` 0xCB25F0)는 만든 것을 들고 있다가 `ClearChargeEffects`(0xCB2490): 저장이 아닌 공격이
  대상에 시전할 때(`OnCastOnTarget` 0xCBA1D0 — 방출) 또는 ON_DETACHED. 深靛: [0] `indigo_attack_charge_02`(SpecialPoint 1) · [1] `_03` · [2] `_04` · [3] `_05`
  — 저장 투사체가 나가는 자리 `_mountPointForProjectiles` [6, 8, 9, 5]와 같은 순서 [추정: 색인 = 저장 전 개수]; 저장 능력 각자의 그룹은
  `indigo_attack_charge_01_start`(ON_CAST_START). → `char_modes.py charge_effects` → `modes.json charge` { hold, cast }(EN 전체 재추출: 深靛만),
  'mysticStore'에 `n`(지금 개수), `fxgame.js chargeStore`가 `cast` + `hold[n − 1]`을 들고 그 유닛의 다음 'atk'(`chargeRelease`)·'die'에 끝. 정예 4개째는
  `_05`(SPECIAL 0).
- **덤 — 卡涅利安 `billro_beidong_buff_03`·蜜蜡 `beewax_buff_01_start`(출처 찾음)**: 둘 다 기본 모드(`Modes/Default`, 卡涅利安은 `S1_Enhance`도)의
  `_generalAbilities` 버프 `overrideEffectKey`(阵法术师 특성 — 스킬 밖 방어). 그 능력이 `Body/GeneralAbilities/` 밖(`Modes/Default/Trait_Eff`, 蜜蜡은
  `Modes/Default` 자신)에 있어 `char_modes.py`가 `attach`로 안 읽었다 → 같은 날 붙임: 아래 「기본 모드 attach」(관리자 결정 2026-10-21).
- 확인: 시뮬 `test/sim/kit-mark-fx-events.test.js`(picks·'kalts2Mark' 켜고 끔·S1/S2 없음, 'cabinFull' 한 번·안 참, `n` 1~4), 렌더
  `test/render/kit-marks-fx.test.js`(추출값, 계획, dry 레이어 여섯). 골든: diy-009 `kalts2Mark` 13·diy-010 `cabinFull` 1(표시 이벤트 수만); 이벤트 기록 골든 + 줄만.
  Windows Chrome 디버그 아레나(정예, 오류 0): 凛御银灰 S3 `trail_02` 31번(명중과 함께), 琳琅诗怀雅 S3 끝 셋 + 동전, 克莱门莎 `_mark_01`·소용돌이, 그리고
  아레나가 못 만드는 순간은 시뮬 이벤트를 넣어(深靛 저장 셋 → `_02`~`_04`, 凯尔希·思衡托 표시·`teleport_02`, 圣聆初雪 `frozen` → 'die'에 `defrost`).
  [화면 미확인: 실제 판 — 공식 녹화와 모양·자리, 克莱门莎 `_mark_02`]

### 재능 버프·시전 이펙트 — 재능이 거는 버프와 시전 순간 (2026-10-16, 이펙트 연결 전수 묶음 3)

- 원인: 재능의 버프 이펙트(`overrideEffectKey`)·시전 이펙트(`_castEffects`)·오라 이펙트(`_effects`)를 아무도 안 틀었다. 시뮬은 재능 버프를 클라에
  알리지 않거나(`visible` 없음) 그 순간 이벤트가 없었다. 후보는 이펙트 연결 전수(관리자 노트)의 「재능 버프·시전」 20개.
- 클라(EN charpack `Talents/N`, 버프 템플릿): 이벤트 번호 — 버프 `ON_BUFF_START` 0 · `ON_BUFF_FINISH` 1 · `ON_BUFF_TRIGGER` 2 · `ON_TARGET_KILLED` 9 ·
  `ON_TAKE_DAMAGE` 10 · `ON_OUTPUT_DAMAGE` 11 · `ON_ABILITY_SPELL_ON` 18 · `ON_OTHER_BUFF_START` 36; 능력(`AbilityStandard.Event`, `_castEffects`
  `_startEvent`/`_endEvent`) `ON_CAST_START` 2 · `ON_CAST_END` 3 · `ON_SPELL_ON` 4. `lifeTimeType` 1 LIMITED · 2 INFINITY.
- 고친 것 — 세 길:
  - **상시**(배치 동안 조건 없이, `fxmap.js TALENT_ALWAYS` → 「상시 능력 버프」의 `alwaysOn`): 블레미샤인 仁慈 `blemsh_t_2`(INFINITY, 자기) `blemsh_buff_01_start`,
    비르투오사 无词哀歌 `cello_t_1` `cello_buff_01`, 퍼퓨머 熏衣草 `_passiveBuffs` `flower_t_1[eff]` `flower_buff_01_range`, 비나 빅토리아 诸王的叹息
    AuraAbility `_effects` `siege2_buff_01`.
  - **시뮬 버프 = 클라 버프**(`visible: true` → 'status' 이벤트 → `fxstatus.js KEY_FX`, 높이는 프리팹 자신의 `_spawnLocation`: `OWN` — 특수점
    `sp0`·`sp1` 포함, `fxgame.js playStatus`가 `lifted`로): 에이야퍄들라 더 크비트 아스카 氤氲 `agoat2_t_1` 치료받은 아군에 `agoat2_recover_01`(지속
    `duration`), 패신저 机理分析 `pasngr_t_1[enhance]` 적에 `pasngr_beidong_buff_01`, 언더플로우 T1 `udflow_t_1` 적에 `udflow_debuff_01`, 로즈몬티스 感知稳定
    `rosmon_t_2` 그녀와 고른 术师에 `rosmon_buff_01_start`, 인사이더 火力支援(정예) `inside_t_1[active]` 고른 라테라노 아군에 `inside_buff_01_start` —
    인사이더가 떠나면 꺼짐(`_removeBuffWhenAbilityDetached`), 시 点睛 `dusk_t_2[spawn]` 배치부터 소환까지 `dusk_buff_04_start`(sp0), 아스트젠 더
    라이트체이서 数据建模 `halo2_t_2[fx]` `halo2_talent_01` 배치부터 층이 다 찰 때까지 → `[full]` `halo2_talent_02`, 텍사스 디 오메르토사 剑术 `texas2_t_2`
    `texas2_buff_01_start`(첫 처치 `ON_TARGET_KILLED`에 끝)·传统 `texas2_t_1[recast_effect]`·`[recast_effect_02]` `texas2_buff_02_start`(sp0)·
    `_02_start_02`(sp1) 첫 처치 재시전까지. 적용자마다 따로인 키(`…:<id>`)는 끝 번호를 떼고 찾고, 버프 하나가 프리팹 여럿이면 목록.
  - **시전 순간**(키트 이벤트 → `kitofficial.js`): 카넬리안 生命之餐 스킬 시작 회복 'talent' `meal` — `Billro_Heal_Self`/`_Enhance`의 oneshot
    `_castEffects`(ON_SPELL_ON) `billro_beidong_buff_01`, 충전 다 찬 시전 `_02`(짝은 컴포넌트의 `m_GameObject`로 확인: `Billro_Heal_Self`와 같은
    GameObject의 시전 컴포넌트가 `_01`, `Billro_Heal_Self_Enhance`(`billro_t_1[enhance].`)와 같은 것이 `_02`);
    백파이프 精密填弹 'talent' `splash` — `bpipe_t_1` SplashDamage의 `_createEffect`(블랙보드 `effect` `bpipe_attack_02_hit`)를 강화 타격의 추가
    피해를 받은 적에(2026-10-16부터 공격 대상이 아니라 일반 명중은 안 겹침, rules/sim.md 「风笛 精密填弹」); 그노시스 殊途同归 'kitHit'(배치 10초 뒤) — 감싸는 능력 `gnosis_t_2_buff`의 `_castEffects` `gnosis_beidong_buff`(ON_CAST_START → ON_CAST_END)를
    배치 동안(그 능력이 `_isInfinity`라 `ActiveAbilityWrapper._GetLifeTime`(0xC20080)이 블랙보드 `duration` 대신 무한을 돌려주고, 감싼 능력은
    `OnCastEnd`(0xC1FB70)에야 떼짐 — 시전이 배치 동안 안 끝남); 블레이즈 디 이그나이팅 스파크 S2 불 붙은 칸 'burnTiles' `cells` [[x, y, 1|0]] —
    `Modes/S2/Body/Talents/3` DoTile(AttachListenerToTileAbility)의 `_effectSettings` `blaze2_skill_02_hit_plot`(castedTimeThreshold 1)을 칸마다, 스킬
    끝(능력 떼짐: `AttachListenerToTileAbility.OnDetached`(0xBED740)가 `_ClearEffects`(0xBEE130)로 넘어감)에 모두 끔. RVA는 2026-10-14 EN 클라.
- 텍사스 디 오메르토사 S3 창 (2026-10-21, 이펙트 묶음 E, EN `[uc]skills.ab`·charpack·버프 템플릿): S3 `skchr_texas2_3`의 시작 능력 AppearSwordRain이
  즉시 버프(lifeTimeType 0) `texas2_s_3[create_no_effect_02]`를 걸어 그 ON_BUFF_FINISH에 `texas2_s[no_effect_02]`(INFINITY)를 만들고, ModeWithSwordRain의
  `texas2_s_3`(수명 `duration`)가 끝날 때 `[finish_no_effect_02]`가 지운다. 재능 버프 `texas2_t_1[recast_effect_02]`(Talents/1, `triggerInterval` 0.1·첫
  대기 없음)는 트리거마다 기절(STUNNED)이면 `_02_start_02`를 그리는 파생 버프를 만들고, 아니면 `no_effect_02`가 있을 때 그 파생 버프를 끝내고(FinishMe) 없을 때
  만든다 → `fxstatus.js KEY_FX 'texas2:recast'`가 S3가 켜져 있고 기절이 아니면 `_02_start_02`를 빼서 끝낸다(statusOff, 끝 이펙트 `finish`), 창이 닫히면
  다시 튼다. [추정: 0.1초 트리거 지연은 따르지 않음(그 틱에 바로)]. 확인 `test/render/status-buff-fx.test.js`.
- 안 한 것: `pasngr_beidong_buff_02`·
  `billro_beidong_buff_03`·`wang_birth_02`는 클라 참조 없음. `common_ resistance_01`은 이미 `SOURCE_FX resist`(이름 안 공백 때문에 집계 오탐).
- 확인: 시뮬 `test/sim/talent-fx-events.test.js`(키트마다 'status' 켜짐·꺼짐, 'talent'·'burnTiles'), 렌더 `status-buff-fx`(키 → 프리팹, `OWN`, 아이콘
  없음)·`common-ability-fx`(`TALENT_ALWAYS`)·`kit-event-fx`(새 규칙). 골든: 표시 이벤트 수(`status`·`fx`·`talent`·`burnTiles`)만. Windows Chrome
  디버그 아레나(관리자 노트의 확인 스크립트, FxInstance 첫 update로 프리팹 수, 오류 0): 블레미샤인 `blemsh_buff_01_start`·비르투오사 `cello_buff_01`·
  퍼퓨머 `flower_buff_01_range`·비나 빅토리아 `siege2_buff_01`·아스트젠 더 라이트체이서 `halo2_talent_01`·시 `dusk_buff_04_start`·텍사스 디 오메르토사
  `texas2_buff_01_start`·`_02_start`·`_02_start_02`·그노시스(10초 뒤) `gnosis_beidong_buff` 각 1, 카넬리안 충전 시전 `billro_beidong_buff_02` 1, 블레이즈
  디 이그나이팅 스파크 S2 `blaze2_skill_02_hit_plot` 1(움직이지 않는 샌드백 한 칸). 에이야퍄들라 더 크비트 아스카·패신저·언더플로우·로즈몬티스·인사이더·
  백파이프는 단위 시험만. [화면 미확인: 실제 판, 공식 녹화와 모양·자리]

### 驭械术师 드론 — FunnelEffectEmitter (2026-10-16, 이펙트 연결 전수 묶음 3, 디컴파일 확인)

- 원인: 쉐라·락락·라플란드 더 데카덴차·至简의 드론(浮游单元)이 안 보였다 — 드론은 그녀 몸의 이펙트이고, 그 이펙트를 내는 `Funnel*` 능력과 그 이미터를 아무도
  읽지 않았다. 드론 탄(`projectile_chr_kjera_funnel`·`_rockr_funnel` …)의 꼬리·명중도 안 나왔다(그녀 자신의 탄만).
- 클라: `FunnelEffectEmitter.OnEvent`(RVA 0xCB4EB0) — ON_ATTACHED에 `_idleEffect`(뒤를 보면 `_idleBackEffect`로: `_UpdateIdleEffect` 0xCB6180),
  ON_CAST_START에 `_disappearEffect` + 대기 일시정지(`_setActiveFalseWhenPause`면 숨김), ON_ATTACK_FINISH에 `_appearEffect` + 재개, ON_DETACHED에 끝.
  `_PlayEffect`(0xCB5EF0)는 그녀 위치에 그녀 방향으로 만든다(프리팹이 특수점 SPECIAL_0~2 = 드론 뼈를 따라감). 이미터가 없는 기본 모드의 드론은 그 모드
  `Effect` GameObject의 버프 모습(쉐라 `kjera_token_default`, 락락 `rockr_token_01`, 至简 `malist_drone`). 공격마다 `Funnel` 능력이 드론 탄을 쏜다
  (`_mountPointType` 5·6 = 드론 자리, 쉐라·락락 기본 `_speed` 10). 라플란드 더 데카덴차는 공격 능력이 `_funnelActions` 3기를 거느리고 드론 공격 끝은 탄이
  사라질 때(`_waitForProjectileInvalid`).
- 고친 것: `char_modes.py funnel_entries` → 모드별 `funnels[mode]` = [{ idle, back, hide, show, over, off, proj, from, speed, trail, hit, wait }…]
  (`hit`에 `_effectGroups[0]` [추정: 묶음 순서]; 전체 재추출 diff: 이 키만, 쉐라·락락·至简·라플란드 더 데카덴차). `fxgame.js droneIdle`: 배치·스킬
  켜짐/꺼짐마다 지금 모드의 대기 루프(뒷모습은 SwitchableBackEffect 전환 장치 `backSw`), `droneShot`: 'atk'마다 퇴장 이펙트 + 대기 멈춤(`off`면
  숨김) → 드론 탄 꼬리를 드론 자리에서 대상까지, 닿을 때 명중, `wait`면 그때(아니면 0.2초 뒤) 등장 이펙트 + 재개. 같은 순간의 공격은 다음 드론(쉐라
  S2 두 고정). 라플란드 더 데카덴차 일반 공격(기본·S1 모드)은 활성 드론 전부 — 수는 1 + S1 패시브 + 头狼 3단계(시뮬 `profile.hits`, 'talent' alpha
  `stage`). 2026-10-21 디컴파일 확인(이펙트 묶음 E): `MultiFunnelsNormalAttack.UpdateActiveCntIfAdded`(RVA 0xBF3290, `DoSetData` 0xBF2FC0도 같은 식) =
  min(`_funnelActions` 수, 1 + 능력 블랙보드 `cnt` + `MultiFunnelExtraActiveCntAbility.GetExtraFunnelActiveCnt(능력 이름)`), 그 추가는 버프 노드
  `AddFunnelAbilityActiveCnt`(Execute 0xE01800 — 붙어 있는 능력에는 `RuntimeAddActiveCnt`로 바로도) — `whitw2_s1[passive]` M0·M1 +1, `whitw2_t[extra_ability]`의
  세 번째 트리거 M0·M1·M2·WolvesDispersed +1. `cnt`는 M0_1·S1 `attack@cnt` 0, S2 3, S3 2, `_funnelActions`는 M0·M1 3, M2 6, S3 4 → 시뮬의 일반 공격·S2·S3
  수와 같고 렌더 `funnelCount`도 그대로 맞다.
- 퇴장 시점 (2026-10-21, 이펙트 묶음 E, 디컴파일 확인): 드론의 ON_CAST_START는 드론 능력 자신의 것이고, 그 능력은 그녀의 공격이 `DoCastOnTargets`에서
  자기 탄(`RangedAttack.DoCastOnTargets`) 다음에 `CastToTarget`(가상 슬롯 33)으로 시전한다 — `MultiFunnelsNormalAttack.DoCastOnTargets`(0xBF2CC0, 활성 수만큼)·
  `MultiFunnelRemoteAttack.DoCastOnTargets`(0xBF2080, 아직 잠그지 않은 것만 `MultiFunnelTrait.SetFunnelActive`). 쉐라·락락 S2 Attack도 `_funnelActions`를 가진
  이 꼴이다. 그래서 퇴장 = 그녀의 타격 순간 = 시뮬 'atk' — 지금 그대로 맞다(「클라는 휘두르기 시작」은 드론 능력 자신의 휘두르기였다).
- [추정]: 등장은 `wait` 없으면 0.2초 뒤(숨는 드론은 지금 모두 `wait`), `speed` 없는 탄은 10칸/초.
- 명중 무작위 자리 (2026-10-21, 이펙트 묶음 E, 디컴파일 확인): `FunnelHitEffect.OnPlay`(RVA 0xE83830)가 이펙트를 맵 평면의 무작위 방향
  (`RandomUtil.RandomDirectionV2` 0x5A81160: x·y 각 `Random.value`×2−1을 정규화)으로 `Effect.Behaviour.FaceTo`하고, 위치를 `RandomVector3(_randomRange)`
  (0x5A814D0: 축마다 `Random.Range(−r, r)`)만큼 월드에서 옮긴다. 루트에 이 스크립트가 있는 추출 프리팹 5개: 쉐라 S2 `kjera_token_skill_02_hit_F_L_01`·`_02`·
  `_F_R_01`·`_02`(0.2, 0.05, 0), 루멘 S2 `lumen_skill_02_hit`(0 — 방향만). `fx_extract.py funnel_hit` → 프리팹 `jitter`, `FxInstance`가 무작위 방향으로
  `faceTurn`(FLIP_TWO_SIDE면 반반 뒤집힘)·Unity 월드 그대로 오프셋(`Math.random` — 클라도 표시용 `UnityEngine.Random`). `fx_coverage` todo → 읽음.
  확인 `test/render/funnel-hit-fx.test.js`.
- 잠금 (2026-10-16 묶음 3 재점검, 디컴파일 확인): 처음엔 쉐라·락락 S2와 라플란드 더 데카덴차 S1·S2 드론이 'atk'마다 숨었다 나타나 깜빡였고, 그녀의
  일반 공격 드론은 날지 않는데 거리÷10만큼 늦게 물었다. 클라의 이 탄들은 이동이 AttachToTarget(dump.cs 451030 — 틱마다 대상 위치에 둠, 날지 않음)이고,
  S1·S2·쉐라·락락 S2는 SimpleProjectile `_hitNumType` INFINITY(LifeType 2)라 대상에 붙은 채 공격마다 맞히다 대상이 사라지거나 스킬이 끝날 때(`_stopWhenSourceInvalid`)
  끝난다 — 그때 ON_ATTACK_FINISH(`_waitForProjectileInvalid`)로 등장. 일반 공격 탄(`whitw2_funnel_1~3`)은 맞힌 뒤 `_delayAfterReached` `_delayTime` 0.5초를 더
  산다(OnTick 0xA98890: CheckReached 뒤 `EnsureLifeTime(_delayTime)`). 명중은 `SequenceEffectBehaviour.OnHitTarget`(0xA88320)이 맞힐 때마다 새로 만들고
  `_effectGroups`의 다음 묶음으로 넘어간다(끝 뒤 0으로) — 쉐라 S2 `_F_L_01`/`_02`, 락락 S2 왼쪽/오른쪽, 과부하 중엔 `_overloadGroups`; 잠금 탄의 명중은
  `_clearHitEffectOnStop`으로 탄과 함께 끝. 고친 것: `char_modes.py funnel_entries`에 `attach`·`delay`·`lock`·`seq`·`overSeq`(전체 재추출 diff: 이 셋의 `funnels`만),
  `fxgame.js droneShot`은 `attach`면 꼬리 없이 바로 명중·`delay` 뒤 등장, `lock`이면 드론별 잠금(`droneLock`: 같은 대상이면 명중만, 다른 대상이면 이전 잠금을
  끝내고 다시 숨김, 대상이 사라지면 등장 `droneBack`); 같은 순간의 공격은 그 대상을 이미 잠근 드론 → 빈 드론 순. 락락 과부하는 kitofficial `overload` 계획의
  `skillFlag` 'overDrones'(스킬 끝에 지움). [추정: 스킬 끝에 잠긴 드론의 등장 이펙트는 안 틂(모드가 바뀌며 새 모드 대기로 다시 시작)]
- 멈춘 대기 드론은 숨는다 (2026-10-21, 관리자 확인 「쉐라 S2 드론이 그녀에게 그림처럼 고정되어 보임」): 시전 시작의 대기 멈춤
  (`set_isPaused`)은 `ParticleEffect.OnPausedUpdated`(0xEACFD0)가 주 입자 시스템의 GameObject를 끄는 것이고, 드론 대기 프리팹은 모두 그림 전부가 그
  노드 아래다(`mainPs` — 쉐라 F·B·기본·락락·至简 2 `fixed`, 라플란드 더 데카덴차 4 `wolf (1)`). 우리는 `_setActiveFalseWhenPause`(`off`)일 때만 숨겨
  쉐라 S2 드론이 잠긴 동안 그녀 몸에 멈춘 채 보였다 → `fxgame.js holdDrone`: 멈춤이면 숨김. 적 옆의 드론은 잠금 명중 `_F_L_*`/`_F_R_*` 자신이
  그린다(`token` 노드의 머리·꼬리 메시와 꼬리, 클립이 0.5초에 나타나 대상 옆 −0.51·0.33에서 떠 있음; 탄 `projectile_chr_kjera_funnel_s2_*`은
  `_mainEffect` 없음, `Body`는 빈 Transform — 직접 확인). `SequenceEffectBehaviour.OnHitTarget`은 맞힐 때마다 새로 만들고 앞의 것을 끝내지 않는다
  (탄이 멈출 때 `_clearHitEffectOnStop`) — 우리도 잠금 동안 쌓인다 [추정: 클라에서 그 이펙트가 저절로 끝나는지(입자 `loop`인 빛 둘)는 안 읽음].
  아레나 기본 샌드백은 바로 옆 칸이라 그 드론이 그녀 쪽 0.5칸에 떠 그녀 위처럼 보인다. 확인: 단위 `funnel-fx.test.js` 「a paused idle drone is hidden」,
  디버그 아레나(샌드백 3칸·2칸 앞): 잠근 드론은 그녀에게서 사라지고 적 옆에, 안 잠근 둘째는 그녀에게.
- 잠금 드론은 키트의 드론 신호로 움직인다 (2026-10-21, 관리자 확인 「쉐라 S2 드론 하나가 여전히 머리 오른쪽에 고정」): 렌더는 잠금을 그녀
  본체의 'atk'에서 정해 공격 하나에 드론 하나만 잠갔다 — 적이 하나면 둘째 드론은 끝까지 그녀에게. 클라 S2 모드의 공격은 `Funnel_0`·`Funnel_1`
  두 능력이 각자 대상을 고르고(`_maxNum` 1, `_alwaysIncludeTarget` — 적이 하나면 둘 다 그 적), 시뮬 키트(`chess_char_3_20-kjera.js`·`_4_03`·
  `chess_char_2_10-rockr.js`)도 잠근 드론마다 주기에 `fx 'drone'`(대상 위치)을 낸다. → `fxgame.js lockDroneFx`: 그 신호마다 그 자리의 적에
  그 순간의 다음 잠금 드론(`droneShot(…, 'lock')`), 본체 공격은 잠금 아닌 드론만(`'free'`) — 쉐라·락락(`LOCK_BY_FX`); 라플란드 더 데카덴차는 그대로
  (키트가 잠금 동안 그 신호를 안 냄). 확인: `funnel-fx.test.js`(두 드론이 한 적에, 본체 공격은 드론을 안 움직임, 적이 쓰러지면 둘 다 등장), 이펙트 골든은
  쉐라 둘째 드론 줄만 더해짐(퇴장·등장·`_F_R_*` 4판), 디버그 아레나: 두 드론이 적 양옆, 그녀에게는 없음.
- 확인: 단위 `test/render/funnel-fx.test.js`. 디버그 아레나(오류 0): 쉐라 기본 `kjera_token_default` 1·드론 꼬리·명중 14씩, S2 `kjera_token_F_01`/`_02`
  + 퇴장·등장·S2 명중 7씩(기본 모습은 꺼짐); 락락 `rockr_token_01`(기본·S2)·드론 꼬리·명중 8씩·S2 퇴장·등장 11씩; 라플란드 더 데카덴차 S1
  `whitw2_token_01`·`_02`(드론 둘)·드론 명중 13씩. [화면 미확인: 실제 판, 드론 자리·뒷모습·숨김 시점을 공식 녹화와]

### 伺夜 늑대 무리 — 토큰의 버프 템플릿 (2026-10-16, 이펙트 연결 전수 묶음 3)

- 원인: 늑대 무리(`token_10028_vigil_wolf`)의 이펙트 19개가 안 나왔다 — 토큰엔 모드 바인딩이 없고, 클라는 추가 늑대를 모델이 아니라 이펙트로 그린다.
- 클라(`pkgrps/btl_pfb_tokens_0` 토큰 프리팹 + 버프 템플릿): `vigil_wolf_t_1_enhance[holder]` — 첫 추가 늑대 `vigil_token_sub_start_1`, 둘째 `_2`(INFINITY);
  `vigil_wolf_t_1[listener]` — 하나를 잃으면(ON_TAKE_DAMAGE·41) `vigil_token_sub_die_2`(둘째가 있으면) 아니면 `_1`, 마지막은(ON_BEFORE_TRY_SET_HP_ZERO)
  `vigil_token_die` + Recharge 모드(`vigil_wolf_t_1[trigger]` `vigil_token_ghost`) → 돌아올 때 `vigil_wolf_switch` 시전 `vigil_token_start`;
  `[block_cnt]` `vigil_token_buff_1~4`(머리·몸·두 손 SPECIAL_0~3); 물기 `vigil_wolf_hit_effect` — 추가 늑대 0·1·2에 `_attack_hit_1`/`_2`/`_3`, 伺夜 S2 선물
  (`vigil_wolf_s_2`)이 있으면 `_extra`; 추가 늑대의 시전 `_vigilWolfCastEffects` `vigil_token_sub_attack_1`/`_2`; S2 시전 `vigil_token_skill_02_hint`,
  선물 동안 `_ready`; S1 ③·S2 회복 `vigil_token_heal`.
- 고친 것: `fxgame.js` `packEvent`·`packDeploy`·`packAtk` — 늑대 수는 시뮬의 'summon'·'revive'·'wolfShadow'·'wolfShadowLost'·'wolfCount'(`wolves`/`n`)에서
  (시뮬 변경 없음). 0이면 전술점 형태: 쓰러진 칸에 `die` + `ghost`(돌아오는 배치까지), 돌아오면 `start`. 칸(점)에 트는 둘은 늑대 뷰가 있으면 그
  늑대가 바라보던 쪽으로 튼다(2026-10-21 — 전엔 점이라 늘 +1; `vigil_token_die`는 `_rotateType` 1 FLIP_TWO_SIDE라 왼쪽을 보던 늑대면 뒤집힘,
  `ghost`는 0이라 안 바뀜; `test/render/funnel-fx.test.js`, `trace`의 spawn에 `facing`).
- 장식 자리 (2026-10-16 묶음 3 재점검): `vigil_token_buff_1~4`가 발밑에 겹쳐 있었다 — 프리팹의 FollowMountPoint(`mount` 5·6·8·9 = SPECIAL_0~3)는 맞았는데
  `points.json`에 토큰 항목이 없었다(`char_points.py`는 오퍼의 chararts만 읽음). 토큰 모델은 `pkgrps/btl_pfb_tokens_*.ab`의 프리팹이고 한 번들에 여럿이라
  뿌리 이름으로 그 애니메이터를 고름 → `char_points.py TOKENS`(지금은 늑대만 — 다른 토큰은 점을 대조하기 전까지 렌더 대체 그대로): sp0 `C_Head`·sp1
  `C_Body_a`·sp2/sp3 `IK_C_L_Hand`/`IK_C_R_Hand`, 우리가 그리는 스킨(`_epoque_27`) 스켈레톤에도 네 뼈가 다 있음(`test/local-patch-fxspawn.test.js`).
- 시점 (2026-10-21, 이펙트 묶음 E): 판에 놓은 늑대 무리(`tokens.js` 판 기물)는 새 배치마다 첫 수를 새 시뮬 fx 'wolfCount' { n }로 알린다(전엔 렌더가
  初始两只로 2를 가정). 伺夜가 떠나 전술점 형태가 돌아오지 않고 끝나면 새 fx 'wolfTacEnd'(`installWolfTacticalPoint`, 두 무리 모두 — 클라는 Recharge 모드가
  토큰과 함께 떠남) → 렌더가 `ghost`를 끝내고 다음 배치를 귀환(`vigil_token_start`)으로 보지 않는다; 40초 상한은 안전장치로만 남음. S2의 회복과
  `vigil_token_heal`은 선물 물기 때(`vigil_wolf_s_2` ON_ABILITY_CAST_ON_TARGET — 시뮬도 옮김: rules/sim.md 「伺夜 S2 领袖的馈赠 회복은 물 때」) → `packAtk`,
  시전 때는 `_skill_02_hint`·`_ready`만. 확인 `test/render/funnel-fx.test.js`.
- [추정]: 쓰러질 때 토큰의 일반 사망 이펙트도 남음.
- 확인: 단위 `test/render/funnel-fx.test.js`. 디버그 아레나(오류 0): `vigil_token_buff_1~4`·`sub_start_1`(늑대 둘), S2 `_skill_02_hint`·`_heal` 2·`_ready` 1
  (아레나에선 늑대가 샌드백에 닿지 않아 물기는 단위만). [화면 미확인: 실제 판, 추가 늑대 자리·물기·전술점 모양을 공식 녹화와]
- 덤: 왕의 跟子를 던질 때 `wang_passive_01_start`(charpack SpawnToken/BuildStone·`skchr_wang_3` InstantSpawn `_startEffect`)는 **돌이 놓일 칸에**
  (2026-10-16 관리자 제보로 고침 — 처음엔 왕에게 붙였다): `CastOnTileAbility.OnCastStart`(RVA 0xC06B40)가 `CreateEffect(_startEffect, 시전 칸, 시전자)`로
  만들고(디컴파일 확인, 프리팹 클립도 돌이 하늘에서 그 점으로 떨어지는 모양), 돌이 칸에 닿으면(`_finishStartEffectsOnCastOnTile`, `_preDelay` 0.25초)
  Effect.FinishMe로 끝(방출 멈춤, `finish` 0.5초 뒤 제거). 렌더 `fxgame.js throwStart` [추정: 시뮬의 'summon'이 착지라 거기서 시작해 0.25초 뒤 끝].
  같은 날 재제보 둘: ① 공 위 이펙트(활성 휘감김·연결선·활성 섬광)가 판 가장자리로 갈수록 공에서 비껴남 — 월드 z만 올려 원근 카메라에서 화면 중심
  밖으로 밀렸다(중심에서 한 칸마다 약 0.04칸). 공은 뿌리 바로 위에 그려지는 그림이라 `fxgame.js ballAt`이 모델 포인트처럼 `liftedPoint`로 그 화면 점의
  월드 점을 구함. ② 跟子가 토큰 배치(0.1초 대기·어두운 첫 프레임·`Start` 0.333초)로 들어와 시작 이펙트의 낙하(`ctrl` 0.1667초)보다 두 배 느렸다 —
  클라에서 跟子는 투사체라 토큰 배치가 없고 돌은 그 이펙트의 `qizi` 그림이 떨어진다(2026-10-16 정정: SpriteRenderer가 아니라 Unity 내장 Quad
  메시의 MeshRenderer — 추출기는 2026-10-08부터 읽지만 디스크의 `wang` 추출물이 그 전 것이라 없었다 — 2026-10-17 재추출로 그려져 이 토큰 낙하와 겹침, 위 「望 바둑돌이
  겹쳐 보임」, 아래 「추출 누락 보고」) → 'summon' `follower`에
  `units.js throwIn(2)`: `Start`를 2배속으로, 대기·어두운 프레임 없이 [추정: 토큰의 `Start` = 돌이 떨어져 들어오는 모양]. 2026-10-17 없앰: 跟子는 이제
  모델을 안 그리고 이펙트의 돌만(관리자 결정, 위 「望 바둑돌이 겹쳐 보임」 정정).

### 소환물 스킬 오라 — 저주인형·스카디의 시본 (2026-10-22, upstream `5209873f`의 증상 — 우리 방식)

- 원인: 소환물 뷰는 `fxBundleOf`가 토큰 id를 그대로 번들 이름으로 써서 번들이 없고, `modes.json`에도 토큰 키가 없어 스킬 이펙트가 하나도 안 나왔다.
  시뮬은 지속 패시브에 스킬 이벤트를 보내지 않는다.
- 클라(2026-10-22 직접): 소환물 스킬은 `battle/prefabs/[uc]skills.ab`의 자기 프리팹 — 그 AuraAbility `_effects`가 서 있는 동안의 오라.
  저주인형(`token_10006_vodfox_doll`, 샤마르 S2) `sktok_vodfox_token/Aura` → `vodfox_skill_02_buff`(번들 `vodfox`); 스카디의 시본(`token_10017_skadi2_dedant`)
  `sktok_skadi2_<n>/Aura` → `token_skadi2_skill_0<n>_buff`, n = 스카디 더 커럽팅 하트가 고른 스킬(`data/tokens.json` 변형 `skill`/`bySkill[i].skill`의
  `index` = 주인의 스킬 번호, 시뮬 스냅숏 `skillIndex`가 그 값). 시본 프리팹 루트 `_startEffect` `token_skadi2_birth_01_start`(그동안은 공용
  `common_call_start_01`). 프리팹 넷은 `pkgrps/btl_pfb_fx_token_2.ab` → 새 번들 `skadi2_token`(그것만 추출). 전 토큰을 훑어 오라가 있는 소환물은 이 둘뿐.
- 고친 것: `char_modes.py token_auras` → `modes.json[토큰 id] = { owner, aura: { 주인 스킬 번호: [프리팹] }, start? }`; `fxgame.js tokenAura` — 배치마다
  다시, 프레임마다 확인(배치 이벤트 없이 만든 뷰도 시작), 'die'·뷰가 사라지면 끝; 프리팹은 주인 번들 → `<주인>_token` 순으로 찾음(`tokenBundle`, 시작
  이펙트도). 테스트 `test/render/token-aura-fx.test.js`(시뮬 스냅숏의 `skillIndex`까지).
- 안 한 것: 시본 Default 모드 HealAura의 `token_skadi2_buff_01_range`(패시브 버프 `skadi2_heal[effect]` overrideEffectKey — 스킬이 모드를 바꾸면 사라지는
  범위 표시)는 안 넣음. [화면 미확인]

### 진법·블래스트 캐스터 범위 공격에 옛 선 안 그림 (2026-10-22, 관리자 제보 「민트·아로마에게 옛날 버전 투사체가 적에게 날아감」)

- 원인: 锁定攻击范围 공격(진법 캐스터·블래스트 캐스터, `server/sim/professions.js` rangeAoe)은 시뮬이 'atk' 종류를 `beam`(범위 안 모두 동시 타격)으로
  보내고, 렌더 `fx/projectiles.js attack`이 `beam`을 공식 투사체 자료를 보기 전에 대상마다 절차형 선으로 그렸다.
- 공식: 이 여섯(민트·비즈왁스·카넬리안·프라마닉스 더 프레리타·아로마·아코르트)의 모든 모드 공격에 `_projectileKey`가 없다(`data/chess.json` `shot` 모두
  `move NONE`, `tools/local-extract/op_projectiles.py`).
- 고친 것: 오퍼레이터의 `beam`은 그 모드의 shot이 날지 않으면(`shotSpeedOf` 0) 선을 그리지 않음 — 다른 무투사체 공격과 같은 규칙. 자료가 없는
  오퍼레이터와 적의 `beam`은 그대로. 테스트 `test/render/fxproj.test.js`. [화면 미확인]

### 적 포탄 — 帝国炮火先兆者 (2026-10-22, 관리자 요청 「공식 포탄으로 수정」)

- 시뮬: 제국 아틸러리 타게티어·코어 타게티어(`enemy_1112_emppnt`/`_2`, `content/enemies/fly.js kitShell`)는 쏠 때 대상 자리에 fx 'bombardShell'
  { id, x, y, t: 3 }, 3초 뒤 같은 자리에 'bombard' { kind: 'emppnt' } + 무출처 피해. 예전 렌더는 공식 이펙트 없이 `fx/projectiles.js mortar`(쏜 적에게서
  솟아 3초 동안 떨어지는 절차형 포탄)와 붉은 고리를 그렸다.
- 공식: `projectile_enemy_emppnt`는 AttachToTarget `_delayToStart` 3(rules/sim.md) — `_effectsToTargetWhenStart` `enemy_emppnt_attack_01_start`(3초 조준
  표시), `_mainEffect` `enemy_emppnt_attack_01_trail`(노드 `fixed`가 클립으로 y 3.73 → 0.22·높이 5.27 → 0.28을 0.27초에 — 르무엔 S3 포탄처럼 스스로
  떨어짐, 화면 수직), `_effectsWhenReached` `enemy_emppnt_attack_01_hit`. 쏠 때 시전 `_start_02`는 예전부터 공격 이펙트로 나옴.
- 고친 것 (`fxgame.js emortarFx`/`emortarLand`): 'bombardShell'에 조준 표시를 그 자리에, 착탄 0.27초 전에 포탄 프리팹을 그 자리에 돌리지 않고 틀고,
  'bombard'에 포탄을 끝내고(`finishShot`) 조준 표시를 멈추고 착탄 이펙트. 둘 다 `ownFx`라 절차형 포탄·고리·폭발은 안 그림. 투사체는 그 적의 `proj.key`로
  찾으므로(`enemyShot` → `eprojByKey`) 데이터만 맞으면 같은 꼴의 다른 적에도 같음; 아무 이펙트도 추출 안 된 적은 절차형 그대로.
  [추정: 공식은 지연 3초 뒤 꼬리를 틀고 도착 시점은 안 읽음 — 착탄에 맞춰 0.27초 앞당김] 소리는 rules/audio.md 「적 소리」. 테스트
  `test/render/enemy-mortar-fx.test.js`. [화면 미확인]

### 추출 누락 보고 — fx_coverage (2026-10-16, 관리자 요청 「이펙트를 추출해 적용할 때마다 공식과 어긋나는 근본 원인」)

- **원인**: 이펙트가 공식처럼 보이는지는 프리팹의 그림 데이터, 그것을 재생하는 로직(`fxplayer.js`), 언제·어디에 트는지(바인딩) 셋이 정하는데
  클라에서 그대로 오는 것은 그림 데이터의 일부뿐이다. 추출기(`fx_extract.py`)와 플레이어는 아는 컴포넌트·필드만 옮기고 모르는 것은 **말없이
  버렸다** — 그래서 어긋남은 제보로만 드러났다(10-14 「흐르는 텍스처」: `FxUVTweener`·`_DisturTex`를 아무도 안 읽고 있었음). 그 밖에 클라 스크립트
  필드를 원시 바이트 칸 번호로 읽는 곳(`root_effect`·`projectile_effect`·`mount_point`)은 클라 판이 바뀌면 조용히 밀린다(CN 30칸 대 EN 28칸,
  10-11 「선발 추가 3명」).
- **보고**(`tools/local-extract/fx_coverage.py`): 추출이 끝날 때마다 그 실행이 만난 것 중 파이프라인이 안 받는 것을 종류별로 찍는다 — 읽지 않는
  컴포넌트, 클라 스크립트(MonoScript PathID → 이름, 모르는 것은 il2cpp 덤프의 직렬화 필드로 이름을 찾음), 원시 리더가 못 알아본 배치 또는 타입
  트리와 다른 값, 옮기지 않는 파티클 모듈, 플레이어에 방출기가 없는 Shape 종류, 셰이더가 선언하고 재질이 쓰는데 플레이어가 안 읽는 텍스처·값(셰이더
  기본값과 다를 때만), 처음 보는 셰이더, 풀지 못한 클립 바인딩(입자 모듈·트레일 길이를 움직이는 트랙 등), CAB 색인이 못 찾는 의존 번들. 상태는
  `new`(아무도 안 봄 — `NOT HANDLED`로 찍힘) · `todo`(알고 안 함) · `hand`(손으로 짠 렌더 코드가 대신 그림) · `none`(그리는 것 없음). 기준선
  (`KNOWN`)은 2026-10-16 전수: 운영자 이펙트 2,071개(130 묶음) — todo 58 · hand 4 · none 7(2026-10-21부터 CN·팩·적 묶음까지 — 아래 「출처 기록」). `fx_extract.py --coverage <out.json>`은 아무 이펙트
  파일도 쓰지 않고 이미 추출된 프리팹 전부를 같은 경로로 다시 걸어 목록 전체와 **디스크 파일 대 지금 추출기의 차이**(`stale`)를 낸다(약 3분).
  플레이어가 읽는 텍스처·값 목록과 Shape·모듈 목록은 `test/fx-coverage.test.js`가 `fxplayer.js`·`fx_extract.py` 소스와 같게 묶어 둔다.
- **첫 전수에서 나온 것**:
  - **CAB 색인이 클라 갱신(2026-10-14)보다 오래됨**: 핫 업데이트 번들이 PersistentData에서 StreamingAssets로 옮겨 색인 항목 2,595개가 없는 파일을
    가리켰고, 로더는 그 의존 번들을 말없이 건너뛰었다 → 그날 이후 새로 추출한 이펙트는 텍스처가 빠진다(엑시아 더 뉴 커버넌트 재질에서 확인). 색인을
    다시 만들고, 이제 로더가 `dependency`로 알린다. 색인 빌더는 `.ab`만 읽어 `anon/*.bin` 번들(112개)을 몰랐다 — 거기 있는 Unity 기본 입자 재질
    (`Default-Particle`·`Default-ParticleSystem`)을 이제 찾지만, 예전과 같은 출력을 위해 재질 없음으로 둔다(쓰는 계 234개 중 227개는 방출하지
    않는 빈 그릇, 방출하는 7개는 todo).
  - **FollowMountPoint 원시 읽기가 EN 클라 갱신으로 밀림**: 갱신이 `_followScale` 뒤에 `_pauseWhenFollowScaleNearlyZero`를 더해(8칸) 372개 중
    332개에서 `pauseWhenInvalid`·`onlyPauseWhenInvalid`를 바꿔 읽었다 — 갱신 뒤 다시 추출된 아르케토·블랙나이트·함정 이펙트 11개의 `mount`가
    틀려 있었다(`fxgame.js`가 `pauseWhenInvalid`를 읽음). 이제 타입 트리가 읽히면 필드 이름으로 읽고(원시는 7·8·9칸만), `--mount-only`로 고쳐 씀.
    ParticleEffect 1,859개·ProjectileEffect 177개의 원시 읽기는 타입 트리와 같다(전수 대조) — 앞으로는 보고가 매 추출마다 대조한다.
  - **디스크 추출물이 추출기보다 오래됨**(`stale`): 추출기를 고친 뒤 일부 묶음만 다시 뽑아, 고친 결과가 없는 파일이 남았다 — 내장 Quad 메시
    (2026-10-08)가 없는 노드 244개 프리팹(望 `qizi`, 엑시아 더 뉴 커버넌트 `Quad`·`glow` 등), `lineDyn`(2026-10-10)이 없는 4개, `right` 2개,
    `finish` 4개, 아로마 `spawn` 1개. 재질 값 차이 대부분(`_MainTexChannel` 등 새 속성, 모두 기본값)은 클라 갱신 쪽이다.
  - **전체 재추출 (2026-10-17, 관리자 결정)**: `index.json`의 운영자 묶음 136개를 같은 프리팹 목록 그대로 지금 추출기로 다시 뽑음(EN 클라, CN 묶음
    `kalts2`·`clemnt`·`aglna2`·`aglna2_token`은 CN 클라, `*_token`은 각 `pkgrps/btl_pfb_fx_token_N.ab` 팩). 파일 2,541개 중 1,981개 변경: 내장 Quad 노드
    737개(314 프리팹, 모두 텍스처·플레이어가 아는 셰이더가 있음), 10-14 뒤 추출에서 빠졌던 텍스처(28 프리팹 — 아르케토·블랙나이트·치우바이·뮤엘시스 토큰·프라마닉스 더 프레리타의 `_MainTex`·`_DissolveTex`·`_DisturbTex`),
    `lineDyn` 4·`right` 2·아로마 `spawn` 1, 클립 트랙 `prop` 62·입자 메시 60. 클라 갱신(10-14)에서 온 것: 새 재질 속성(기본값), 키워드 `_HG_UV_ROTATION`
    빠짐 25(플레이어는 셰이더 이름으로 고름 — 영향 없음), 불피스폴리아 S3 `start_02` 3종 `_delayToFinish` 0.5 → 0·`start_01` 0.3(타입 트리로 확인).
    CN 묶음은 바뀐 것 없음. 뒤 `--coverage`의 `stale`은 `kalts2` `_PremultiplyAlpha` 33뿐(EN으로 걷는 CN 추출물 — 클라 차이). 테스트 기대값 고침:
    `status-buff-fx.test.js` 이네스 `bg_01`·미즈키 `an`/`bg`(order −1)가 뒤 렌더러.
- **출처 기록 — 모든 추출물을 걷는 보고 (2026-10-21)**: `--coverage`는 묶음마다 자기 번들(`battle/prefabs/effects/<묶음>.ab`)을 `--game` 한
  클라에서만 걸어, 공유 팩에서 뽑은 묶음(`wang_token`·`cathy_token`·`mlyss_token`·`aglna2_token` — `pkgrps/btl_pfb_fx_token_N.ab`)과 적 묶음
  (`enemy-index.json`, `pkgrps/btl_pfb_fx_enemy_N.ab` 16개)은 「번들 없음」 한 줄로 건너뛰었고, 다른 오퍼레이터 번들에서 뽑은 프리팹(赫默
  `silent/myrrh_attack_01_hit` ← `myrrh.ab`)은 말없이 빠졌으며, CN 클라에서 뽑은 묶음(`kalts2`·`clemnt`·`aglna2`)은 건너뛰거나 EN으로 걸었다
  (10-17 보고의 `kalts2` `stale` 33이 그 클라 차이). 출처가 어디에도 적혀 있지 않았기 때문이다. 이제 추출이 쓴 프리팹마다 출처를 색인(`index.json`·
  `enemy-index.json`)의 `sources`에 적는다 — `{ pack, client }`, 기본(자기 번들·EN 클라)과 다를 때만, 묶음 전부가 같으면 `<묶음>` 한 줄, 아니면
  `<묶음>/<이름>`마다. 클라는 `Arknights_Data/app.info`의 회사 이름(HyperGryph = cn, 그 밖 en; `--client`로 덮음). `--coverage`는 그 기록대로
  묶어 걷고, `--other-game`·`--other-cab-index`로 두 번째 클라를 같은 보고에 넣는다. 그래도 못 걸은 프리팹(그 클라를 안 줌, 번들 없음, 번들에 이름
  없음, `--all-skins` 없는 스킨 변형)은 새 종류 `unwalked`(`NOT WALKED` 줄)로 남아 보고가 말없이 좁아지지 않는다. 브라우저는 색인의 `bundles`만
  읽는다. 이미 있던 추출물의 출처는 두 클라의 이펙트 번들 이름 목록으로 한 번 채움(운영자 9줄·적 16줄, 못 찾은 것 0; `route_cursor`는
  `fxroute.js`대로 `battle/[pack]common.ab`).
  - **`stale`이 프리팹마다 20경로에서 잘렸다**: `json_diff`의 기본 상한 20이 재질 경로를 `materials.*`로 합치기 전에 걸려, 재질이 많은 프리팹은
    뒤쪽 차이를 못 셌다(10-16 보고의 입자 메시 47·클립 `prop` 62 = 실제로는 60·90 프리팹). 이제 상한 없이 센다.
  - **그 입자 메시·`prop` 차이의 원인**(10-17 재추출로 이미 사라짐, 재추출 전 백업과 대조): 둘 다 내장 Quad / Plane(2026-10-08) 이전 추출이
    남은 것 — 입자 렌더 모드 4(메시)인데 `mesh`가 빈 노드 153개, 그리고 내장 Quad 노드에 `mesh`가 없어 `material_prop`이 묶인 렌더러의 재질을
    못 찾고 `attr:<crc32>`로 남긴 트랙 765개(`_TintColor`·`_MainColor`·`_Amount`·`_MainTex_ST`·`_AddTex_ST` …, 플레이어가 재생하지 않았음).
    나머지 트랙 24개는 아르케토(10-16 추출)의 재질에서 텍스처가 빠져(낡은 CAB 색인) `_ST` 트랙의 이름을 못 지은 것. 추출물 파일 날짜는
    `--root-only`·`--uvt-only`·`--mount-only` 같은 부분 갱신이 바꿔서 추출한 날이 아니다.
  - **처음 걸린 묶음에서 나온 것**: CN CAB 색인(2026-10-11)이 `anon/*.bin`을 몰라 Unity 기본 입자 재질 번들을 `dependency`로 냄 → 다시 만듦
    (`anon` 150개만 더해짐, CN 추출 JSON 골든 12개 그대로). CN 전용 스크립트 둘(予愿安洁莉娜 S2 날기 꼬리 `_rotateIfFaceLeft`·克莱门莎 S2 탄
    `_flipYWhenLeft` — EN 덤프에 클래스 없음)과 적의 `EffectData_Projectile`·`LineEffectEmitter`·`SwitchableEffectByBlackboardValue`·클립
    `MonoBehaviour.yspeed`/`secondYSpeed`·`InitialModule.startColor`는 todo, 경로 커서의 `PreviewCursor`(`fxroute.js`)와 战场#06 벽의
    `SimpleEffect`는 hand. 2026-10-21 전수: 운영자 2,179 프리팹(두 클라) — `new`·`stale`·`unwalked` 0, todo 60 · hand 7 · none 7; 적 382
    프리팹 — todo 24 · none 4, `stale` 368 프리팹(10-10 추출: 10-11에 뺀 `face.speed` 56, 클라 갱신의 새 재질 속성, 텍스처가 빠진 14 프리팹 —
    子代·黄金回响·防护背心·未装配刀片·冲击式施术单元, 셰이더가 바뀐 深池逐火护卫 방패 1).
  - **적 이펙트 전체 재추출 (2026-10-21, 관리자 결정)**: `enemy-index.json` 27 묶음 382 프리팹을 같은 목록 그대로 기록된 출처(`sources`)에서 지금
    추출기로 다시 뽑음(EN 클라). 바뀐 파일은 위 `stale`과 같은 368개 — 텍스처가 돌아온 14 프리팹(`_MainTex`·`_DissolveTex`·`_DisturbTex`·
    `_DisturTex`), 深池逐火护卫 방패 꼬리 재질의 셰이더 없음 → `Legacy Shaders/Particles/Alpha Blended`(todo: `_DstBlend`로 섞음), `face.speed`
    빠짐, 새 재질 속성(기본값)·키워드 `_HG_UV_ROTATION` 빠짐(플레이어가 안 읽음). 새 텍스처 파일 2장. 뒤 `--coverage`의 적 `stale` 0.
  - **적 전체 추출 (2026-10-21, 이펙트 묶음 F)**: `enemy_bindings.py --extract --all` → 적 800 프리팹(위 「적 상태의 버프 이펙트」). 뒤 `--coverage`: 새
    종류 9개를 `KNOWN`에 todo로(클립 `MeshRenderer.m_Enabled`·`ParticleSystem.looping`·`gravityModifier`·`VelocityModule.enabled`·`startColor.a`, 셰이더
    `Legacy Shaders/Particles/Additive`, 스크립트 `EffectImportData`·`SyncEffectScaleWithAuraRangeRadius`·`PauseEffectIfNotMove`) → `NOT HANDLED` 0, 적 todo 33 ·
    hand 2 · none 7. `EffectData_Projectile`은 none(Effects.Data의 SourceData — 필드 둘과 생성자뿐, 런타임 코드가 그 TypeInfo를 안 씀, 10-14 EN 덤프),
    `LineEffectEmitter`(炎佑 `projectile_enemy_acloon_line` 꼬리 — 링크 투사체라 지금은 절차 대체)·`SwitchableEffectByBlackboardValue`(`_UpdateEffect` RVA
    0xE9A690: 주인 버프 `_buffKey`의 블랙보드 정수 v로 `_effects[v − 1]`, 1 ≤ v ≤ 개수 — 불타는 덩굴 첫 공격 전 공격력 단계 `effect_level`, 시뮬이 그
    단계를 안 알림)는 todo 그대로. 직렬화 필드가 없어 이름을 몰랐던 운영자 쪽 스크립트 셋도 클라 MonoScript 번들(모든 `m_Script`가 가리키는 CAB의
    `m_Namespace`·`m_ClassName`)로 이름을 찾음 — `PauseEffectIfDisappeared`·`FollowOwner`·`FollowOwnerRootTileHeight`(todo, 하는 일은 이름으로만 [추정]).
- **필드 이름 먼저, 원시 칸은 대비책 (2026-10-20)**: `root_effect`(ParticleEffect·루트의 FxDelay)·`projectile_effect`·`right_effect`·`fx_delay`
  (가지의 FxDelay)·`mount_point`는 컴포넌트의 타입 트리가 읽히면 필드 이름으로 읽고, 원시 칸은 타입 트리가 안 읽힐 때만 쓴다(EN·CN 클라 모두 지금은
  다 읽힘). `check_readers`가 매 추출마다 같은 컴포넌트에서 대비책도 돌려 비교하고, 타입 트리가 안 읽혀 대비책을 대조 없이 쓴 때(`no type tree: read
  by raw words, unchecked`), 대비책이 배치를 못 알아볼 때, 값이 다를 때(필드 이름과 함께) `reader`로 찍는다 — 전에는 타입 트리가 안 읽히면 대조가
  조용히 꺼졌다. 새로 대조하는 필드: `_subFXDelayConfigs`(가지 지연)·ProjectileEffect `_inactiveOnFinish`·FxDelay `_delayTime`(루트와 가지)·
  `_rightEffect`. 확인: EN 2,090 프리팹의 루트와 모든 가지에서 바꾸기 전과 읽은 값이 같고 `--coverage` 72항목도 같음, CN 묶음(`kalts2`·`clemnt`·
  `aglna2`, 103 프리팹)도 같음. 대조가 바로 찾은 것: SwitchableRightEffect의 원시 대비책은 두 클라 모두에서 이미 아무것도 못 읽고 있었다 — 문자열 뒤
  정수가 EN은 10-14 갱신으로 2개(`_reverseLeftRight`), CN은 3개(`_reactivationMode`까지)라 1~3개를 받게 고침. 타입 트리를 먼저 읽어 왔기에 출력은
  그대로다. 새 두 필드는 본 사본 모두 0이고 옮기지 않는다.
- **미검증 표시 — 이펙트 골든 세트 (2026-10-20, 관리자 결정)**: 보고는 「파이프라인이 버린 것」만 보고, 옮기긴 했지만 아무도 화면으로 공식과 대조한
  적 없는 것은 몰랐다. 이제 추출한 프리팹마다 **기능 서명**(`fx_coverage.signature`)을 만든다 — 플레이어가 쓰는 것을 지금까지 버그가 났던 값까지
  (붙는 자리·`spawn`·`face.rot`·입자 렌더 모드·공간·Shape 종류·모듈·셰이더·텍스처 칸·`_CullMode` 같은 블렌드/깊이/컬링 스위치·키워드·재생하는 클립
  트랙) 더하고, 재질 밖의 **추출 JSON 필드 경로 전부**(`key:…`)를 자동으로 더한다. 그래서 추출기가 새 필드를 옮기기 시작하면 아무도 목록에 안 넣어도
  그 필드가 미검증으로 뜬다. 플레이어가 재생하지 않는 `attr:<crc32>` 트랙은 서명에 넣지 않는다(`clip` 종류가 보고). 검증 목록
  `tools/local-extract/fx-verified.json` = 관리자가 화면에서 공식 인게임과 대조한 프리팹 — `by`(`arena` = 디버그 아레나 `/debug.html`, 기본 /
  `match` = 실제 판: 마운트 지점에 붙거나 바라보는 방향으로 바뀌는 것), 대조 날의 서명(`features`), 그 프리팹에 걸린 fx_coverage todo(`todo`, 자동),
  화면에서 본 차이(`notes`)를 적는다. 서명을 그날 것으로 고정해 두므로 나중에 새로 옮긴 필드는 다시 볼 때까지 미검증이다. 보고의 새 종류
  `unverified` = 그 실행의 프리팹 기능 중 검증 목록 어느 프리팹에도 없는 것(기능 → 그 기능을 쓰는 프리팹), 추출 끝 요약에 한 줄. 클라 없이 디스크
  추출물로: `python3 tools/local-extract/fx_coverage.py unverified`(미검증 기능과, 그것을 **가장 드문 기능부터** 덮는 프리팹 — 10~15개씩 묶어 대조,
  관리자 결정 2026-10-20), `… verify <bundle/name>… --by arena|match [--note …]`(`.cache/fx-coverage.json`의 todo를 같이 적음). 2026-10-20 디스크
  기준: 프리팹 2,178 · 기능 370 · 3개 이하 프리팹에만 있는 기능 36 · 드문 쪽부터 덮기 47개(탐욕 덮기 48). 다음 층은 아래 둘.
- **추출 JSON 골든 (2026-10-20)**: `tools/local-extract/fx_golden.py check|update <폴더> --game … --cab-index …` — 고정한 프리팹 묶음을 지금의
  `fx_extract.py`로 다시 걸어(dry: 텍스처·메시 파일을 안 씀) 저장해 둔 추출 JSON과 `json_diff`로 경로별 비교, 다르거나 못 뽑으면 종료 코드 1.
  추출기를 고치거나 CAB 색인·클라이언트가 바뀔 때 화면보다 먼저 「무엇이 바뀌었나」를 본다(필드가 한 칸 밀린 리더, 엉뚱한 칸에서 읽은 플래그).
  폴더 = `golden.json`(`{"prefabs": {"묶음/이름": {"client": "en", "pack": null}}}`) + `<묶음>/<이름>.json`(들여쓰기·키 정렬); 추출 JSON은 게임
  데이터 파생물이라 공개 저장소 밖(관리자 폴더). 한 번에 한 클라이언트(`--client cn` + CN 클라·CN CAB 색인), `update --add 묶음/이름`으로 더함,
  `--only`로 일부만. 텍스처·메시 내용은 비교 안 함(JSON이 주는 이름만). 묶음 = `unverified`의 드문 쪽부터 덮기 전체(2026-10-20 47개: EN 35 · CN
  12 — 관리자 결정 2026-10-20: 추출 골든은 추출기 회귀 장치라 화면 대조와 따로 가고, 대조 여부는 `fx-verified.json`이 표시).
- **이벤트 기록 골든 (2026-10-20)**: 서명과 추출 JSON 골든은 프리팹 그림만 보고 「언제·누구에게 트나」(바인딩: `fxgame.js`·`fxmap.js`·추출
  `modes.json`/`index.json`)는 못 본다. `tools/fx-golden.mjs`가 골든 전투 묶음(`tools/golden.mjs`의 roster·standins·diy·fields 94판, 2026-10-21부터 bonds·fxpaths 더해 143판)을
  실제 판 경로(`battleOf` → BattleSpec)로 돌리며 3틱마다 이벤트를 브라우저처럼 `createFxLayer({ dry: true, trace })`에 흘린다(`dry`: 아무것도
  불러오지 않고 레이어가 실패하지도 않음 — node에는 WebP가 없어 첫 로드에서 레이어가 꺼지던 것을 막음). 한 판의 기록 = 서로 다른 줄
  `<유닛> <이벤트 종류> <프리팹> → self|ally|foe`의 **집합**(횟수·시각·맞은 적의 정체는 빼서 전투 규칙이 바뀌어도 거의 안 움직이고, 바인딩이
  바뀌면 더해진 줄(+)·빠진 줄(−)이 곧 화면에서 볼 목록). 유닛 이름은 모델(spine), 적은 def id. 모델 없는 뷰에서 클립 변형을 고르는
  `Math.random`(`castGroup`)은 판마다 고정 시드. `test/golden/fx-events.json`과 비교하는 `test/render/fx-golden.test.js`(기본 = 골든 빠른 묶음,
  `GOLDEN_FULL=1` 전부, 추출물 없으면 건너뜀), 의도한 바인딩 변경 뒤 `node tools/fx-golden.mjs --update`(`--print <id>`로 한 판의 줄). 못 보는
  것: 丰川祥子의 음표(WebP 확인 뒤에만 시작), 뒷면 사본(SwitchableBackEffect
  `_backEffect` — 프레임마다 주인 방향을 보고 틂). 프리팹이 틀린 뒤 스스로 만드는 것은 2026-10-21부터 본다:
  `dry` 레이어가 틀린 프리팹의 추출 JSON만 읽어(`fxgame.js dryFollow`) OnPlayEmitter / OnFinishEmitter 프리팹을 `spawn:emit`(부모가 붙은
  유닛 기준), RandomEmitter 사본을 `spawn:random`(점)으로 실제 길과 같은 줄로 남기고, 그것들이 만드는 것도 따라간다 — 부모가 끝까지 사는지는
  안 따지므로 OnFinishEmitter 프리팹도 틀 때 같이 적힌다. 실제 길의 RandomEmitter 사본(`emitCopy`)도 같은 날부터 `trace`에 나온다. 드문 쪽부터
  상태 이상 이펙트도 같은 날부터: 도구가 뷰에 `app.js`처럼 상태(`'status'`·fx `parry`/`stacks`)를 넣고 프레임마다 `fxstatus.js
  syncStatusFx`를 돌려 `statusOn`의 trace를 남긴다 — 그 오퍼레이터 자기 묶음의 프리팹이면 `<유닛> status <프리팹>`, 아니면(기절·감속·남이 건
  버프) 입은 유닛의 편만 `- status <프리팹> → ally|enemy`(누가 맞는지는 전투 규칙). 드문 쪽부터 덮기 47개 중 기록에 나오는 것: 2026-10-20
  31개 → 2026-10-21 34개(니어 더 래디언트 나이트 S3 `buff_03_a`·에이야퍄들라 더 크비트 아스카 S3 `weapon_04`·战栗 `common_buff_thrill`) → 같은 날 39개:
  - 보드 연출: 판이 열릴 때 `app.js enterBattle`처럼 `setStorm`을 불러 전장 #06 모래폭풍(`- storm <프리팹>`: 카메라 모래·토석 구조물 표시)을 남긴다.
    `setStorm`·라플란드 더 데카덴차 S3 늑대(`wolfFx`, `spawn:wolf`)는 브라우저에서 불러온 뒤에 틀던 길이라 `dry`가 trace 전에 막혔다 — 이제
    불러오기 전에 trace(늑대는 8판에 이미 있었음).
  - bonds 묶음(맹약 문턱·최고 단계 판): 위수 협의 템플릿 이펙트(`tplfx`)가 거기서만 남(에기르 맹약 `bond_aegir_eat_01`).
  - `fxpaths`(`tools/golden.mjs fxPathScenarios`, 전투 골든 `FAMILY_NAMES` 밖 — 전투 다이제스트 없음): 골든 판이 안 지나는 이펙트 길의 전용 판 —
    켈시 에스페란타 S3 앵커 비행·착지(diy 묶음은 소환물을 안 놓음), 안젤리나 더 멜로우 위시 S2 위·아래 활공(배치가 오른쪽만 봄)·S3 비행(범위
    안 막히지 않은 비행 적이 필요).
  - 남은 8개는 골든이 아니라 렌더가 안 트는 것: 프라마닉스 더 프레리타 `sbell2_tile_defrost`·사리아 `demkni_buff_01_self`·카넬리안
    `billro_beidong_buff_03`·엔텔레키아 `etlchi_skill_03_line_01_end`, 실버애쉬 더 레인프로스트 S3 `svash2_skill_03_trail_02`(클라 투사체
    `_effectsAlignToProjectileDirection`, `_trail_left/_right_01`과 함께 렌더에 바인딩 없음), `map_act1autochess_place_01`(클라 데이터·코드
    문자열 어디에도 없음), `S_desert_wall_02_start_Mesh`(장치 모델로 구워 `official.js`가 그림 — 아래 「战场#06 沙尘暴 연출」),
    `screen_desert_down_to_up`(m06의 위 방향 폭풍 장치 `#2`는 어디서도 켜지지 않음; 서명은 기록되는 `up_to_down`과 같음 107개).
- 기준선의 큰 todo(비공개 조사 기록에 전체 목록): ~~`FollowDirection` 183개~~(2026-10-22 읽음 — 위 「이펙트 방향」) · ~~셰이더 `_CullMode`·`_ZWrite`·Disturb
  Origin `_SrcBlend`·`InheritVelocityModule`·`CollisionModule`·`SizeBySpeedModule`·Unity 기본 입자 재질·레거시 셰이더~~(2026-10-22 — 위 「입자 모듈·셰이더
  패스 상태」) · `FxLODSetting` 37 · Shape Mesh 36(점으로 대체) · 기본 상태 밖 Animator 클립 23 · 클립이 움직이는 입자 모듈 값·트레일 길이·UV 흐름 속도(`EmptyEffect`·`OnPlayEmitter` /
  `OnFinishEmitter`·`PauseEffectIf` 등 멈춤·끝 스크립트는 2026-10-21에 읽음 — 위 「OnPlayEmitter · OnFinishEmitter」·「이펙트 멈춤·끝 조건」). 재질에 저장 안 된 셰이더 속성을 움직이는 트랙은 2026-10-21에 고침(아래
  「RandomEmitter · FlyToPredefinedLocation」의 셋째 항목).

### 바인딩 표 — 손 표를 클라 키로 대조 (2026-10-22, 관리자 결정 2026-10-22)

- 무엇: 손으로 쓴 이펙트 표의 항목마다 그 항목이 가리키는 클라 키를 `cite`(`render/fx/cite.js`)로 단다 — `kitofficial.js KIT_OFFICIAL`, `fxstatus.js`
  (`STATUS_FX`의 오퍼 버프 셋·`SOURCE_FX`·`KEY_FX`·`LAYER_FX`·`STACK_FX`·`END_FX`), `fxmap.js`(`TALENT_ALWAYS`·`NOTE_FX`·`DEPLOY_FX`). 렌더는 `src`를
  읽지 않는다(동작·이펙트 골든 그대로). `fxgame.js` 함수 안의 프리팹 이름은 테스트의 옆 목록 `FXGAME`(이름 → 클라 키)에 둔다. 키는 버프 템플릿·버프
  키(`horn_t_1[muso]` — 그 템플릿이 만드는 버프까지), 투사체(`projectile_chr_ines_guard`), 프리팹 경로(`char_1046_sbell2/Others/Direction/Talents/1/
  SnowAccumulation` — 그 아래 GameObject까지).
- 표는 출처로 나눈다(관리자 결정 2026-10-22):
  - 버프 템플릿 행: `tools/build-fx-templates.mjs`가 공개 데이터셋 Kengxxiao ArknightsGameData `gamedata/battle/buff_template_data.json`(en_US에 있으면
    그것, 없으면 zh_CN — 행에 `cn: true`)에서 만든다 → `tools/assets/fx-templates.json`(추적; 클라 없이 테스트가 돈다). build-data와 따로 둔 까닭: 게임이 읽는
    데이터가 아니라 검사용이고 원본이 둘 합쳐 약 45 MB. 범위는 풀 오퍼·토큰 코드로 시작하는 템플릿, 스킬·재능·모듈 블랙보드가 가리키는 템플릿, 모드 공통
    (원소 폭발·战场#06 沙尘暴·알리스테어 장비), 그리고 그것들이 부르는 템플릿·소환하는 적의 템플릿. 행 `{ key, src, moment, kind, fx, target, life, conds }` —
    `conds`는 조건 노드 이름만(방향·스킬 번호·모드·스택 수·버프 키는 괄호에 하나), 노드 트리는 옮기지 않는다. 조건 노드는 같은 목록에서 **뒤의** 노드만
    막는다(2026-10-23 고침: 추출기가 앞 노드의 행에도 뒤 조건을 붙여 15행이 틀렸다 — 夕 T1 `dusk_t_1[atk]`·琳琅诗怀雅 T1 `swire2_t_1[atk]`·信仰搅拌机 T1
    `[attr_stack]`·焰尾 T1 섬광은 조건 없는 행, 泥岩·耀骑士临光 S2 층의 조건 수, 圣聆初雪 T1 적 타격의 `CheckSkillIndex`).
  - 클라 전용 행(`abilityBuff` 능력이 쥔 버프 · `ability` 이미터와 이펙트 필드 · `projectile` · `token`): `tools/local-extract/fx_bindings.py`가 로컬 클라
    (EN, EN에 없는 것은 `--cn`)에서 `public/assets/local/fx/bindings.json`으로 — git이 무시하고 공개하지 않는다.
- 검사(`test/render/fx-bindings.test.js`, 판단은 `test/helpers/fxBindings.js`): 인용한 키의 행(그 키가 만드는 버프, 그 버프의 템플릿까지 따라감)에 항목의
  프리팹이 있고, 수명(한 번 / 지속, LIMITED 초)과 쪽(능력 버프의 OWNER / TARGET)이 맞는가. 어긋남은 `KNOWN`에 종류와 이유로 — 고치면 그 줄을 지운다.
  클라 전용 표가 없으면(클라우드·CI) 템플릿 행으로 보이는 것만 판단한다.
- 아무것도 안 트는 행: 같은 테스트의 `UNPLAYED`(템플릿 행, `key|prefab` → 조건 없음 / 렌더가 판단할 수 있는 조건 / 그 밖 조건 / 방향 사본 / 다른 프리팹이
  내보냄) — 추출 이펙트 목록(`index.json`)이 있을 때만 돈다. 렌더 코드의 이름, 공격 모드 바인딩, 이름 규칙, 손 표가 만드는 이름을 「튼다」로 센다.
  클라 전용 행의 목록은 관리자 노트에.
- 갱신: `node tools/build-fx-templates.mjs`(`--offline`은 캐시로), `.venv-extract/bin/python tools/local-extract/fx_bindings.py --cn <CN Arknights_Data>`,
  그다음 `node tools/build-fx-plays.mjs`(계획의 인용 키를 바꿨을 때도).
- 템플릿이 쏘는 투사체(2026-10-23): `fx_bindings.py`는 풀 프리팹이 부르는 투사체에 더해 풀 템플릿(`fx-templates.json templates`)이 이름을 부르는 투사체도
  읽는다 — 실버애쉬 더 레인프로스트 S3 `svash2_s_3[bird_on_self]` → `projectile_chr_svash2_s3_bird_self`(`_effectsAlignToProjectileDirection` = 렌더가 트는
  `svash2_skill_03_trail_02`). 그 행의 `char`는 부른 템플릿 키.
- 클라 키로 재생(묶음 K2, 2026-10-23, 관리자 결정 2026-10-23: 키는 렌더 표에 단다 — 시뮬은 그대로): `kitofficial.js` 계획의 재생은 프리팹 `n` 대신 그 계획이
  인용한 키 `tpl`을 줄 수 있다 → `tools/build-fx-plays.mjs`가 두 표에서 인용 키마다 조건 없는 행(추출된 프리팹만)을 역할로 나눠
  `public/assets/local/fx/plays.json`(git 무시, 추출 이펙트와 함께 배포)에 쓰고, `fxgame.js`가 `modes.json`처럼 불러 `kitOfficialPlan`이 펼친다(`tplPlays`).
  역할: `held` 버프가 만드는 이펙트·능력 `_effects`·끝까지 가는 시전·주인이 쥐는 템플릿 이펙트(계획의 `life` 동안; 없으면 그 키의 LIMITED 초) · `once`
  ON_BUFF_START CreateEffect·한 번 시전·IMMEDIATELY 버프 · `end` ON_BUFF_FINISH/ON_OWNER_FINISH(`life: 'unit'`의 `end`) · 투사체 키의 `trail`
  `_mainEffect`·`reach` `_effectsWhenReached`·`hit` `_effectsWhenHit`(있을 때만). 다른 시점의 행(공격 명중, 투사체의 다른 필드, ON_TAKE_DAMAGE …)은 키의
  재생이 아니다. 파일이 없으면 그 재생은 없고 이벤트는 대체 그림으로 남는다(상태 이펙트·상시 재능은 안 그려지고, 토가와 사키코 음표는 화살로 남는다).
  범위는 손 표 전부가 인용한 키(`citedKeys`: `KIT_OFFICIAL`·`fxstatus.js` 표·`TALENT_ALWAYS`·`NOTE_FX`).
  - 계획: 투사체 키 `tpl`에 `fly`가 있으면 비행 = 그 투사체의 `_mainEffect` 하나(둘 이상이면 재생 없음), `to`로 유닛에 날면 `_effectsWhenHit`가 `hit`,
    `_effectsWhenReached`는 착지점에 한 번(`after: 'fly'`); `fly`가 없으면 그것들을 `on`에 한 번.
  - 상태 스펙(`fxstatus.js keyed`): 프리팹 자리에 `{ tpl: 키 }` — 그 키의 `held` 프리팹을 버프가 있는 동안, 키의 `end`는 그 이펙트가 끝날 때 한 번
    (`END_FX`와 같은 길, `specsOf`). `fxgame.js`는 `plays()`로 넘기고, 색인은 `plays.json`과 함께 준비된다(상태·배치 때 상시 이펙트·음표가 먼저 색인을 봄).
  - 옮긴 것 — 첫 조각(계획 7): 에이야퍄들라 더 크비트 아스카 S2 범위, 프라마닉스 더 프레리타 보호점(언 칸·녹음), 켈시 에스페란타 S3 이송, 엔텔레키아 T2,
    루멘 S1 치유 비, 르무엔 T2, 글래디아 S3 대상. 둘째 조각: 상태 스펙 22(`SOURCE_FX` 束缚 5·抵抗·禁疗, `KEY_FX` 13 — 凯瑟琳 장치 표지는 끝 이펙트까지 키에서라
    `END_FX` 줄이 빠짐 —, `STACK_FX` 사리아 T1, `STATUS_FX` 空弦 铁弦), 상시 재능 4(`TALENT_ALWAYS`), 음표 7(`NOTE_FX`: 투사체 키별 궤적·명중, S1은 부채꼴
    번호의 투사체), 계획 3(琳琅诗怀雅 S3 끝 시전·동전, 新约能天使 S3 공습, 寒檀 S2 고드름). 이벤트 골든 그대로(전체 코퍼스).
  - 조건 뒤 행(묶음 K3, 2026-10-23): `plays.json`의 키마다 조건이 재진입 막기(`!CheckContainsBuff(<그 버프>)`)뿐인 행은 조건 없는 행으로 치고, 나머지는
    `when` `[{ role, n, b?: 만드는 버프, if: [조건] }]`으로 둔다. 계획의 재생·상태 스펙이 아는 상태를 주면 `render/fx/conds.js`가 행의 조건을 모두 따져 참인
    것만 튼다 — 상태가 모르는 조건(블랙보드 값·주사위·피해 필터 …)이 하나라도 있으면 그 행은 안 튼다. 렌더가 따지는 조건: 배치 방향
    `CheckCharacterDefaultDirection(UP)`(`back`), `SwitchDirection`(`dir`), `CheckSkillIndex`(`skill`, [추정: 0부터]), `CheckUnitCurrentMode`(`mode`),
    `FilterByBuffStackCount`(`stacks`, 경계 `@키`는 `bb`), `CheckContainsBuff`/`CheckContainsDerviedBuff`(`buffs` — 이름이 없는 버프는 없는 것). 지속 행(만든
    버프가 남는 것)은 「지금까지의 어느 스택 수에서 참이었나」로 보고, 그 행이 만든 버프는 다음 행의 `CheckContainsBuff`에 든다(玛恩纳 [b]는 [a] 다음);
    센 버프 자신을 만드는 행은 스택이 1 이상인 동안 참(그 행의 조건이 스택을 만든 것). `{ all: true }`는 「이 이벤트·상태가 그 키 행의 조건 전부를 뜻한다」(시뮬이
    이미 따짐) — 키의 조건 행이 조건 묶음 하나이거나 프리팹 하나일 때만(프리팹 사이를 고르지 않음, `fx-conds.test.js`).
    - `all` 해석은 관리자 결정 2026-10-23: 그대로 두되, 실제 플레이에서 이펙트가 시뮬 판단과 어긋나 보이면(나와야 할 때 안 나옴·안 나와야 할 때 나옴) 그
      항목만 손 이름으로 되돌린다. 되돌리기는 한 줄 — 상태 스펙 `keyedAll(key, bundle, frac)` → `cite(key, [bundle, '<프리팹>', frac])`, 계획의
      `{ tpl, when: ALL, …나머지 }` → 프리팹마다 `{ n: '<프리팹>', …나머지 }`(키 인용 `cite`는 그대로). 손 이름(지금 표가 주는 것, `fx-conds.test.js`가 항목마다
      고정): 계획 — 寒芒克洛丝 S2 `quadShot` `kroos2_skill_02_buff_01`·`_02`·`_03`, 烛煌 T2 `downed` `blaze2_revive_buff`·`blaze2_revive_buff_03`, 妮芙 T1 `soul`
      `nymph_talent_buff_01`; 상태 — 焰影苇草 `scorch` `reed2_debuff_01`, 束缚 伊内丝 `ines_imprison_01`·缪尔赛思 `token_10030_mlyss_wtrman_c3_debuff_01`·仇白 S1
      `qiubai_skill_01_buff`, 莎草 `papyrs_talent_01`, 异客 `pasngr_beidong_buff_01`, 溯光星源 가득 `halo2_talent_02`, 赤刃明霄陈 회피 `chen3_Shield_buff_01`, 蒂比
      회피 `tippi_buff_01`(12항목). 되돌린 항목은 여기서 지우고 「손 이름으로 남는 것」에 이유와 함께 적는다.
    - 옮긴 것: 계획 — 号角 S2/S3 과부하(방향), 佩佩 S3 범위(스택·`max`), 寒芒克洛丝 S2·烛煌 T2 쓰러짐·妮芙 T1(`all`), 凯尔希·思衡托 S3 머리 표시(재진입 막기뿐),
      缪尔赛思 복사(이벤트의 `mode`로 키를 고름); 스택 스펙 `stacked` — 卡涅利安 S3 표지·阿斯卡纶·夕·洛洛·玛恩纳(스택 수와 `max`/`mid`를 블랙보드
      `max_stack_cnt`/`mid_stack_cnt`로); 상태 스펙 `keyedAll` — 束缚 伊内丝·缪尔赛思·仇白 S1, 莎草 보호막, 异客 T1, 溯光星源 T2 가득, 赤刃明霄陈·蒂比 회피,
      焰影苇草 灼痕; `keyed` — 蕾缪安 수배(재진입 막기뿐). 이벤트 골든 그대로(전체 코퍼스).
    - 손 이름으로 남는 것(이유): 키 하나가 두 프리팹을 갖고 잡는 쪽으로 고르는 新约能天使 S2 방벽, 렌더가 모르는 조건이 프리팹을 고르는 행(텍사스 디
      오메르토사 재시전 둘째 — `CheckAbnormalFlag`에 어느 플래그인지가 없음, 佩佩 S2 단계 — 블랙보드 값, 沙尘暴 — 바람막이 `HasCertainCharacterInFrontOfMe`,
      琳琅诗怀雅 T1 [max] — `CheckCost`, 妮芙 T2 — 凋亡 종류, 泥岩 층 — 블랙보드 값, 卡涅利安 S1–S3 `[eff_cond]` — 충전 수 비교에 수가 없음), 信仰搅拌机 T1(바뀜은
      프리팹의 `SwitchableEffectByBuffStackCnt`), 충전·층·칸으로 고르는 계획(卡涅利安 T1, 圣聆初雪 T1 눈, 烛煌 S2 칸), `_mainEffect`가 둘인 伊内丝 S3 회수(선과
      궤적), 끝 이펙트를 `once`로 트는 圣聆初雪 T2, 赤刃明霄陈 T2 회피 준비(ON_BUFF_TRIGGER의 한 번 이펙트 — 역할 밖), 조건 없는 행이 없는 키.
  검사: 인용한 키만 `tpl`로, 그 키에 재생이 있음(상태 스펙·상시 재능·음표도), `plays.json`이 최신(클라 전용 행이 있을 때) — `fx-bindings.test.js`. 렌더 테스트는
  클라 전용 행 없이도 돌도록 고정 사본 `test/helpers/fxPlays.js`(손 표가 전에 직접 적던 키·프리팹 짝만)를 쓰고, 클라 전용 행이 있으면 같은 테스트가 사본을 표와 맞춘다.
  `bindings.json`은 검사용이라 사전 내려받기 목록(`build-browser-resources.mjs`)·배포에서 뺀다.
- K1 대조의 버그 후보 넷 판정(2026-10-23): 에이야퍄들라 더 크비트 아스카 S2 범위 — 고침(위 「버프 진행 단계」). 실버애쉬 더 레인프로스트 S3 — 렌더가 맞고 인용 키가
  틀렸다(`[bird_on_target]`는 다른 오퍼 위 독수리의 투사체 `projectile_chr_svash2_s3_bird`) → `FXGAME` 인용만 고침; `svash2_eagle_*`(카드 위 战鹰)는 `UNPLAYED` 그대로.
  战场#06 沙尘暴 화면 — 손이 맞음: `screen_desert_*_empty`는 이 루프 프리팹을 `_effects`로 감싼 껍데기(추출 안 됨, 위 「战场#06 沙尘暴 연출」). 엔텔레키아 S3 선 —
  손이 맞음: CreateLineEffect는 ON_BUFF_START에 한 번 만들고 프리팹이 `_holdByOwner`(추출 `face.hold`)라 둘이 서 있는 동안 남는다. 뒤의 둘은 `KNOWN`에 판정 이유로 남음.
- 한계 [추정]: 정적 추출이라 「이 키가 이 순간 (이 조건에서) 이 프리팹을 만들 수 있다」까지만 안다. 코드 접두사 범위에는 같은 코드의 다른 모드 템플릿이
  섞일 수 있다(`UNPLAYED`는 풀 번들의 추출 프리팹인 행만 센다).
