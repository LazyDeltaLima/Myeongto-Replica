# upstream과의 관계 — 0.2.0 병합·원본 버그 선반영·원본이 고치면 뺄 것

원래 `docs/LOCAL-PATCH.md` 한 파일이던 것을 2026-10-09에 영역별로 나눴다(내용은 그대로 옮김, 색인은 `docs/LOCAL-PATCH.md`). 본문의 「아래」「위」는 옛 한 파일 기준이라 다른 파일에 있을 수 있다 — 절 이름으로 `docs/LOCAL-PATCH.md` 색인이나 `grep -rn "<이름>" docs/rules/`로 찾는다.

## 0.2.0 병합 (2026-10-07)
upstream v0.2.0(0.1.4 이후 350커밋)을 병합했다. 충돌은 UI·이펙트·선발 등 우리 기능은 우리 쪽, upstream이 나눈 파일과 같은 문제를 고친
곳은 upstream 쪽으로 풀었다(사용자 결정). 병합 브랜치 `merge-0.2.0`.

**upstream이 나눈 파일 → 우리 연결이 옮겨 간 곳** (아래 절들의 옛 경로를 읽을 때)
| 옛 파일 | 새 파일 | 옮긴 local patch |
|---|---|---|
| `server/sim/Battle.js` | `server/sim/battle/*.js` | `battle/events.js` snapshot의 `hudLists`(+ import), `battle/tiles.js isReservedTile(r, c, except)` |
| `server/sim/content/enemies.js` | `content/enemies/*.js` | `enemies/helpers.js targetsNear·allTargets`(lpGroundPicks), `enemies/archetypes.js artsBarrier`(blocked 숫자), `enemies/leaders.js`(기계 폭탄·破桎而出 비행 제외) |
| `server/sim/content/kits/tier1~6.js` | `kits/ops/chess_char_<t>_<n>-<code>.js` + `kits/shared/tier*.js` | `4_16-texas2`(swordRain src), `4_25-cetsyr`(魔王 S3 재분배 대상), `5_06-etlchi`(频次 2곳), `6_18-whitw2`(드론 위치 fx), `6_19-blkkgt`(lpExpectDiv) |
| `server/match/PlayerState.js` | `server/match/player/*.js` | (우리 선발 loadout `diy` 줄은 upstream 자선으로 대체되어 없어짐) |
| `server/match/Match.js` | `server/match/match/*.js` | `match/intents.js` 이모티콘 세트(`emote(ps, id, set)` + import) |
| `server/index.js` | `server/http/*.js` | `http/common.js`(iframe 차단 헤더), `http/routes.js`(/healthz `local`·프록시 축소), `http/static.js`(SP_DEBUG_PAGE), `http/boot.js`(배너 버전) |
| `public/js/render/fx.js` | `public/js/render/fx/*.js` | `fx/numbers.js`(공식 숫자 import·분기), `fx/kinds.js`, `fx/system.js`, `fx/rings.js`, `fx/arrivals.js` |
| `public/js/ui/gameLogic.js` | `public/js/ui/gameLogic/*.js` | `gameLogic/watch.js activeBubbles`(이모티콘 `set`) |

**upstream이 같은 것을 넣어서 뺀 local patch**
- 원본 버그 수정 선반영 10건(아래 절) — 0.2.0에 모두 들어 있다(#199 울피안은 upstream 방식 `downAtHome`).
- 협동 보스 HP × 생존 인원, 胄 드론 몫 限伤 통과 — upstream이 PR #209를 채택(`gamedata.js bossPoolShareOf`, `Battle.loseHp noHitLimit`).
  upstream은 싱글 보스 HP를 bloodPoint ×1로 바꿨지만, **우리는 싱글 ×0.25로 되돌렸다**(cfadd871, 사용자 결정 2026-10-07: 혼자서는
  팀원이 없다 — `server/match/gamedata.js bossPoolShareOf`의 `solo` 기본값, `tools/build-data.mjs` → `data/config.json bossHpScale.solo`).
  협동은 upstream의 × 생존 인원 그대로.
- 스킬 범위 발동(3063e90c, 사용자 결정·미확정) → upstream `ACTIVE_RANGE` 규칙(사용자 결정 2026-10-07: upstream 사용). 「미확정」 표시는 유지.
  `local-skill-range.js`·관련 테스트 삭제. 赤刃明霄陈 S3를 공중 적만으로 켜던 `hitsFly`는 upstream 규칙에 없다 — 읽는 곳이 없던
  남은 플래그는 `kits/ops/op-chen3.js`에서 지웠다(2026-10-08 세션 K, 동작 영향 없음: golden 전부 일치).
- 사야 늑대(PR #225)·와파린·라플란드·페페 등은 upstream 구현으로 대체, PR #225가 바꾼 upstream 테스트는 upstream 판으로 되돌렸다.

**선발 오퍼레이터 → upstream 「自选」 틀 (사용자 결정: 후보는 우리 5명만, 시제품 없음)**
- 슬롯·재고·상점·로드아웃·로비 `room.diy`는 upstream(`shared/diy.js`, `server/match/player/diy.js`, 클라이언트 자선 편성 탭).
- 후보 제한: `shared/local-diy.js LOCAL_DIY_PICKS`(望·赤刃明霄陈·维什戴尔·丰川祥子·阿斯卡纶). `server/lobby.js` 2줄 — `room.diy` 검사와
  welcome의 `diyKitted`(클라이언트 고르기 화면이 이것만 보여 준다)를 이 목록으로 거른다. 하드 포크 뒤(1f92d3cc, 2026-10-07) 데이터도 이 5명뿐이다 —
  `tools/build-data.mjs`가 `data/backups.json diy.ownedPool`을 이 목록으로 만들고 `diy.prototypes`는 비어 있으며, 나머지 67명의 키트(`kits/ops/op-<code>.js`·
  `OPERATOR_KIT_FILES` 항목·`kits/shared/summoner.js`)와 그 테스트(`test/content/op_<code>.test.js`)는 지웠다. 로비 검사는 데이터 위에 한 겹 더 거르는 것이다.
  `shared/diy.js`(upstream 틀)는 그대로.
- 丰川祥子: upstream은 콜라보를 뺀다. `tools/build-data.mjs DIY_LOCAL_INCLUDED`로 보유 풀에 넣어 `data/backups.json`에 그녀의 units/operators가 생긴다.
- 키트: `kits/ops/op-wang.js`·`op-chen3.js`·`op-wisdel.js`·`op-ascln.js`는 우리 키트(옛 `kits/diy.js`)로 교체, `op-oblvns.js` 새로 추가.
  upstream 키트와의 동작 차이는 `research/2026-10-07-diy-kit-diff.md`(근거 비교) — 사용자 승인(2026-10-07)으로 반영했다:
  维什戴尔 4225a201, 赤刃明霄陈 ef896103, 望 1f074a94, 阿斯卡纶 de3067f5. 그 뒤 바뀐 望 규칙은 `docs/rules/diy.md`.
- 정예화 보상(사용자 결정 2026-10-07): 보상 단계 = 조달 레벨 + 1(최대 6) 그대로, 그 단계의 선발 오퍼도 후보에 든다 — upstream은 상점의
  조달 레벨 조건을 보상에도 걸어 V단계 선발이 보상에 한 번도 안 나왔다. `server/match/player/acquire.js pushRewardOffer` 1줄(`diyStockEntries`),
  테스트 `test/local-patch-diy-reward.test.js`.
- 지운 것: `data/diy.json`, `tools/build-diy.mjs`, `kits/diy.js`, `ui/diySlots.js`, `css/diy.css`, `tools/assets/diy.mjs`, `tools/assets/local-token-spines.mjs`,
  `tools/local-extract/token_spines.py`(upstream `extract.py TOKEN_SPINES` + `--local-spines`가 같은 일), `server/local-patch.js`의 전용 풀·신표 거부 감싸기.
- 디버그 패널 `dbg.addDiy { charId, tier, golden?, skill?, module? }`: 그 단계에서 같은 오퍼레이터의 슬롯 → 빈 슬롯 → 기물이 하나도 없는 슬롯
  (방의 자선 편대 픽이라도) 순으로 골라 픽을 넣고 슬롯 기물을 손패로. 픽은 `debugSetPick`이 **그 슬롯 하나만** 검사해(`checkDiyPicks`) 넣는다 —
  `setDiy`(편성 전체 검사)를 쓰던 때는 "보유 오퍼레이터는 슬롯 하나" 규칙이 같은 오퍼레이터의 두 번째 단계 픽을 조용히 버려
  「정비 구역이 가득 찼습니다」(HAND_FULL)로 실패했다(사용자 제보 2026-10-08). 디버그에서는 한 오퍼레이터를 V·VI단계에 함께 둘 수 있다.
  디버그 페이지(샌드백)는 슬롯 id + `diy` 픽으로 선발을 띄운다.
- 테스트: `test/local-patch-diy.test.js`(옛 선발 키트 테스트 이전 + 제한·데이터·실제 경로).

**언어**: 우리 번역을 upstream 언어 팩으로 옮긴다(사용자 결정, 진행 중) — `tools/i18n/build-ko-pack.mjs` → `public/i18n/ko.json`·`data/i18n/ko.json`.
기본 언어 한국어, 「自选」 = 「선발」, 进阶 = 승급, 上/下(방향) = 위/아래, 全部 = 전체, 攻击/防御 = 공격/방어, 解冻 = 해동(공식 KR 문자열 표 대조).

**기타**
- 우리 설계 문서의 15.1절(공식 스테이지 씬)은 upstream이 설계 문서를 다시 써서 `docs/local/official-scenes.md`로 옮겼다.
- `data/assets.json`은 우리 생성기로 다시 만들었다(`fetch-assets --add-only --allow-shrink`: 공유 `public/assets`에 없는 파일만 받음).
- 0.2.0 개발 의존성(eslint·typescript)이 생겼다: `npm ci`.

**병합 뒤 겹친 기능 정리 — 대사·전투 화면 (2026-10-08 세션 K)** (조사 목록: `handoffs/2026-10-08.md` 「0.2.0 병합으로 겹친 기능」)
- K-1·K-2 선발·补位 기물의 정비 탭 대사와 스킬 대사 유형 → 아래 「오퍼레이터 음성」 로컬 2.
- K-3 보스 라운드 정비의 짝 기물(upstream ef101647 `render/app.js syncMates`)도 공식 장비 바(`setEquip`) — 옛 초록 아이콘이 섞이던 것.
  확인: 실제 협동 판(`test/e2e/fastServer.mjs` SP_START_ROUND=boss, 사람 2명이 아이템 장착, `sp-check\k_mates.mjs`), 단위 `test/local-patch-hud.test.js`.
- K-4 引星棘刺 S2 炼金单元 등 떨어진 곳의 오래가는 zone은 2D 원을 남김 → 아래 「공식 전투 이펙트」 7번 예외.
- K-5 埃芒加德·M3茧甲 부활(upstream a3a0ddd2: 쓰러짐 + 그 자리 즉시 무료 재배치)은 일반 자동 재배치와 똑같이 보였다(실제 판 확인: 같은 틱
  'die' → 'deploy', 사망음 + 部署 대사 + 배치음 + `onDeploy` 하늘 낙하). 공식 부활 연출의 클라이언트 근거는 못 찾음.
  **사용자 결정 2026-10-08 「C」**: 낙하·사망음·배치음은 그대로, 部署 대사만 뺀다 — `audio.js` 'deploy'가 같은 묶음에 그 유닛의 'revive' fx
  (`reviveNow` 뒤 `fxOn`)가 있으면 대사를 건너뛴다. 확인: 실제 솔로 판(fastServer SP_START_ROUND=boss, M3茧甲 금색, `k_revive.mjs`) 부활 2번 모두
  `b_char_dead`·`b_char_set`·`onDeploy`만, 대사 없음; 단위 `test/local-patch-audio.test.js`.
- K-6 문서: 싱글 보스 HP ×0.25(cfadd871) 반영, `op-chen3.js`의 읽는 곳 없는 `hitsFly` 삭제.

**병합 뒤 겹친 기능 정리 — 화면 UI (2026-10-08 세션 J)** (같은 조사 목록. 확인: 실제 솔로 판 `test/e2e/fastServer.mjs` 3127(SP_START_ROUND=2·
SP_START_LEVEL=5·补位 3명 `room.ownership`·`room.diy` 赤刃明霄陈·`dbg.addDiy` 望 정예, `sp-check\j_repro.mjs`), 서버 전투 모드 3129(`SP_COMBAT=server`),
협동 보스 라운드 3128(`j7.mjs`), 협동 탈락자 3130(`SP_ELIMINATE=1`, `j6.mjs`); 단위 `test/local-patch-merge-ui.test.js`·`test/ui/diy-ui.test.js`·`test/ui/gameLogic.test.js`)
- J-1 「선발」 이름표(upstream 0def7bab `screens/game/standInTags.js diyPieces`) 삭제(사용자 제보). 补位 「替补」 이름표는 그대로.
- J-2 「선발」 배지 두 곳 — 상점·보상 카드 `ui/shopBar.js scard__diy`, 맹약 팝업 멤버 `ui/bondStrip.js bpop__diy` — 삭제(**사용자 결정 2026-10-08 「빼야 해」**).
  공식 모양이 아닌 상세 카드(`ui/detailPanel.js ChessDetail`, HUD 공식 모양을 못 쓸 때)의 「自选」 태그는 남김.
- J-3·J-4 전투 종료 배너·효과음이 두 번(우리 「완벽한 작전!」 + NOREDUCE, 이어서 SETTLE에 upstream 「작전 종료 / 전원 무사!」 + NORMAL — 실제 판에서 재현)
  → **우리 것만**(사용자 결정 2026-10-08). `screens/game.js announceBattleEnd`가 라운드마다 한 번: 솔로 판은 내 일반 전투 결과가 오면(그대로).
  **협동 판(살아 있는 팀원이 있을 때)은 누수든 완벽한 작전이든 결과를 잡아 두고 SETTLE에** 띄운다(`ui/gameLogic/phases.js holdsBattleEnd`) —
  사용자 기억(2026-10-08): 联防이 이어지면 내 전투가 끝났을 때 배너가 없고, 联防이 끝난 뒤 막은 수에 따라 감소량 배너 또는 완벽한 작전 배너,
  완벽한 작전 쪽(돕는 쪽)도 联防이 끝난 뒤. 联防이 없는 협동 라운드(팀원 누수 없음)도 팀원의 작전이 끝난 뒤에야 완벽한 작전 배너(사용자 확인 2026-10-08:
  공식은 내 방어가 성공해도 바로 띄우지 않고 팀원을 기다린다) — 서버가 모든 전투가 끝나면 넘어가는 SETTLE에 뜬다.
  SETTLE의 판단(`settleBattleEnd`): 联防이 있었으면 서버가 실제로 깎은 LP(`m.public.uniteResult.losses[나]`, upstream 규칙) — 감소 N이면 「목표 HP 감소 N」 +
  REDUCE, 0이면 「완벽한 작전!」 + NOREDUCE(구해진 누수 쪽·돕는 쪽 모두); 없으면 잡아 둔 결과 그대로; 결과가 안 온 라운드(서버 전투 모드·재접속·
  클라이언트가 안 돌린 전투)는 라운드 동안 센 누수 수. 관전 좌석·탈락자·보스 라운드는 없음.
  확인(실제 협동 판 3131, `j_unite.mjs`): 联防에서 12마리 통과 → 누수 쪽 SETTLE에 「목표 HP 감소 6」 + REDUCE(서버 감소량 6), 돕는 쪽 「완벽한 작전!」;
  联防이 다 막음 → 둘 다 「완벽한 작전!」; 联防 없는 협동 라운드 → 둘 다 SETTLE에 「완벽한 작전!」; 전투가 끝난 순간에는 어느 쪽도 배너 없음.
  SETTLE 경로는 셈하지 않는 누수만 있는 판을 완벽한 작전과 구분하지 못한다 — LP 0이면 완벽한 작전(NOREDUCE) [추정].
  배너 그림(로컬 추출)이 없는 클라이언트는 upstream 상자(`ResultDialog`·`roundResultBox`)를 같은 순간에 대신 띄운다.
  지운 것: `battleOverSfx`·`uniteResultBox`·`battleResultBox`와 그 테스트, `test/ui/resultbox.e2e.test.js`(upstream SETTLE 상자 브라우저 테스트).
- J-5 PREP의 upstream 「休整期」 띠(`ui/gameLogic/phases.js phaseBanner`) 삭제 — **사용자 확인 2026-10-08: 공식은 휴식 기간 띠가 없고 라운드·획득 배너만**.
  PREP 진입 효과음(`rest`)은 그대로.
- J-6 탈락자·관전 좌석의 라운드 시작 배너: upstream 7d97b80b(#236)처럼 「获得 +0」 대신 「观战中」(`ui/phaseArt.js RoundStartBanner watching`, [获得] 상자 자리에
  [回合] 상자 모양으로 [추정: 관전자 캡처 없음]).
- J-7 보스 라운드 짝 아바타 테두리 두 겹(우리 `bg_team_border` + upstream ef101647 `.team__frame`, 화면 확인) → 공식 HUD 모양에서는 upstream 테두리를 숨기고
  우리 테두리를 짝 두 명 모두 초록(#59ffd2)으로(`css/hud-art.css`, [추정]: 보스 라운드 플레이어 목록 캡처 없음). 공식 HUD가 아닐 때는 upstream 그대로.
- J-8 补位 기물의 공식 모양 상세 카드(`ui/detailArt.js ChessDetailArt`)가 원래 오퍼(갖고 있지 않은 오퍼)의 그림·이름·스탯을 보였다 → upstream `ChessDetail`처럼
  대체 오퍼의 그림·직군·이름·스탯·사거리(그의 고정 스킬·모듈), 「替补」 태그와 「X의 대체」 줄. 등급·정예 레벨·맹약·특질은 기물 것.
- 드래그 카드(사용자 제보 2026-10-08 「선발 오퍼를 드래그-유지하면 0.2.0 카드」): `placingDetail`이 m.private 없이 기물을 풀어서 선발 슬롯 기록 그대로
  「선발 오퍼레이터」(스탯 —)를 보였다 → 탭과 같은 `resolveDetail(…, { priv, backups })`. 补位 기물도 드래그 중 대체 오퍼 카드.
- J-9 (의심) 선발 정예 카드 스탯: 확인만 — 공식 모양 카드·0.2.0 카드·전투 유닛(`simdata.js getDiy`)의 스탯·스킬·모듈이 望·赤刃明霄陈·阿斯卡纶·维什戴尔 모두 같다.
  카드도 0.2.0 카드와 같은 조회(`pickGetter`)를 쓰게 맞추고 테스트로 고정.

## 원본 버그 수정 선반영 (2026-10-07, 사용자 요청 「upstream에 보고된 버그 중 쉬운 것 바로 수정」)
> 0.2.0 병합으로 정리됨: 아래 10건은 모두 upstream 0.2.0에 들어 있어 병합에서 upstream 쪽을 택했다(정예화 보상의 선발 조건만 우리 결정으로 다시 고침 — 「0.2.0 병합」).
upstream 0.1.4 위에 원본의 버그 수정을 먼저 가져왔다. **원본 코드·테스트를 그대로** 옮기는 것이 목적이라 `// local patch` 주석을 달지 않고,
"원본 테스트 파일은 고치지 않는다" 원칙의 예외로 원본이 같이 고친 테스트도 그대로 가져왔다(0.2.0 병합 때 같은 줄이 되어 사라진다).
분류 기록: `upstream/ISSUES.md` 「로컬 패치함」.

| 이슈 | 내용 | 가져온 것 | 0.2.0 병합 때 |
|---|---|---|---|
| #200 | 페페 전략 2/4/6본 승급 뒤 첫 갱신이 무료 → 특수 갱신(일반 가격) | PR #226 cherry-pick (`bands/meta.js`) | PR 병합 여부 확인, 아니면 그대로 유지 |
| #202 | 사야(伺夜) 늑대가 배치 안 해도 자동 배치, 연합방어 때 위치가 바뀜 | PR #225 cherry-pick (`kits/tier3.js`, `tokens.js`, 테스트 6개) | 〃 |
| #199 | 울피안 S3 이동 중 쓰러지면 부활·재배치가 닻 칸 → 원래 칸 | PR #221 cherry-pick (`Battle.js _layBody`, `kits/tier5.js`) | 원본은 다른 방식(9738bb82 `downAtHome`)으로 같은 결과 — **원본 쪽을 택하고 PR 변경은 버린다** |
| #175 | 와파린 특성 층 상한 7/14 | PR #192 cherry-pick (`match/fields.js`, `garrisons/battle.js`) | 원본 269d7b0b가 PR #192를 채택 — 원본 쪽 |
| #169 #201 | 라플란드 금카 합성 뒤 그 라운드 첫 갱신에 시라쿠사 층 안 오름 | 원본 661f1c07 이식: `PlayerState._mergeChess`가 회차 카운터를 넘기지 않음(+ 주석, `feedback1-meta` 테스트) | 원본 쪽(파일 분할 `player/acquire.js`) |
| #207 | 의태물질: 같은 초기 오퍼레이터 2장 + 풀 소진이면 아무것도 안 줌(같은 맹약 다른 오퍼레이터 지급 금지) | 원본 463352d9 이식 (`builtinMeta.js`, `bot.js` 운반자 선택 — 0.1.4는 `m.pool` 하나라 `poolOf` 대신 `m.pool`) | 원본 쪽 |
| #107 | 침사·신형(沉沙/新硎) 断刃: 공격마다 ATK 층이 쌓이던 것 → 칼날이 남아 있는 동안 1층, 마지막에 해제 + 공격 간격 초기화 | 원본 ebfda7e6 이식 (`content/enemies.js kitBlades`; 원본은 `enemies/times.js`) | 원본 쪽 |
| #49 | 돌격 맹약: 켜져 있는 패시브 스킬을 「技能就绪」로 침 | 원본 696085ac 이식 (`bonds/addon/battle.js raidPoll`). 원본 테스트 중 缄默德克萨斯 케이스는 0.2.0 데이터(기본 스킬 종류)에 기대어 빼고 합성 패시브 케이스만 | 원본 쪽 |
| #116 | 琳琅诗怀雅 S2 香槟 폭탄: 공격 범위 1-1에 무작위 → x-6 범위, 적이 선 칸 우선, 적 없어도 던짐(공격 차례를 씀) | 원본 e9b6f7e7 이식 (`kits/tier3.js`; 원본은 `kits/ops/chess_char_3_04-swire2.js`) | 원본 쪽 |
| #216 | 연합방어 1인일 때 돌격 오퍼레이터가 오른쪽 반(남의 보드)으로 점프, 울피안 S3도 같은 문제 | 원본 219ab31a + 9b164fdc 이식: `Battle.onOwnBoard`(보드 영역 → 필드 칸), `raidTile`·울피안 착지 조건 | 원본 쪽(`battle/players.js`). 테스트는 0.2.0 연합방어 전용 맵 대신 0.1.4 방식(라운드 스테이지 양쪽 절반) — 돌격 m01, 울피안 m04 |

- 원본 테스트도 같이 고친 것: `test/match/bot-smarter.test.js` 「坎诺特 (利滚利 …)」(원본 3bfe17bd — #226 뒤 시드 7의 R7 레벨업 가격이 9 → 10),
  `test/sim/facing-invariance.test.js`(원본 9b164fdc·master판 돌격 착지 테스트: 판 없는 열린 필드), `test/match/feedback1-meta.test.js`(#169).
- 일부러 안 가져온 것: #190 팀원 표시(PR #227 — 원본 0.2.0은 다른 방식 ef101647, UI), #205 원거리 우선순위(PR #220 — 관리자 재현 못 함; **2026-10-09 이식함**: upstream 관리자 결정 2026-10-08로 `4bd154e3`이 우선도 'fly'(속사 저격수 특성·스킬의 비행 우선)만 저지보다 앞에 둠 — PRTS 索敌 「阻挡（近战限定）→特殊优先级→…」, 사용자 결정 2026-10-09 #6),
  #187 #170 짧은 기절이 적 공격을 끊음(원본 89f730d0: 모든 적 공격 타이밍·골든 대부분 변경), #181 비술사 충전 타이밍(ai.js·직업·키트 3개),
  #96 #137 생명 회복 속도 ≠ 치료(키트 다수), #214 #82 #140 (원본 대규모 병합에 묶임). 0.2.0 병합 때 함께 들어온다.

## 원본이 고치면 뺄 것
- 원본 버그 수정 선반영(위 표, 2026-10-07) → 0.2.0 병합 때 충돌은 **원본 쪽**으로 푼다(#199는 PR #221 변경을 버림)
- 제국의 갑주 폭격·3연타 → `server/sim/content/local-patch.js`의 `patchVtsk`
- ~~협동 보스 HP 인원 배율~~ — 0.2.0에서 뺐다(upstream이 넣음)
- ~~드론 限伤 예외~~ — 0.2.0에서 뺐다(upstream이 처리)
- 频次 적 × 隐德来希 → `tier5.js`의 `// local patch` 2곳 (원본이 고치면 되돌린다. 테스트: 「频次 enemies lose exactly 1 HP per damage instance」)
- 얼린 상점의 특수 갱신 칸 → `effectsMeta.js setShopSlot`의 `prev` 2줄 (원본이 고치면 되돌린다)
- 채팅·관전석 등은 원본에 같은 기능이 생기면 비교해서 정리
- (대체됨, 2026-10-09 sim-4) upstream `8cef750e`(GitHub #263, 사용자 결정 2026-10-09 #7)이 이 수정을 덮는다: 꽉 찬 오퍼레이터에는 소모 아이템
  전부(박사 투영·맹약의 동전 등)가 교체 창을 띄우고 고른 장비를 먼저 파괴한다(PRTS 「达到上限强行佩戴会改为替换装备」). `itemAttaches`는 없어지고
  `equipReplaces`가 대신한다. 테스트 「博士投影 and 盟约之币 on a full operator」. 아래는 옛 기록 —
  일반 박사 투영(博士投影, 장비)이 꽉 찬 오퍼레이터의 장비를 말없이 파괴 (2026-10-09 사용자 제보 「구성체 아이템 장착 후 정예화 아이템 장착시, 구성체가
  증발」): `consume_on_equip_or_delayed`의 일반본은 다음 라운드 시작까지 장착된 채 남는데(`builtinMeta.js equip_round_start_upgrade_char` `keep`),
  클라이언트 `placement.js itemAttaches`는 `consume_on_equip*` 전부를 「칸을 안 씀」으로 보고 교체 창을 띄우지 않았고, 서버 `player/items.js equip`의
  `keep` 경로는 `replaceUid`를 넘기지 않아 가장 먼저 장착한 장비(변형 구조체)를 버렸다. → 일반 박사 투영도 교체 창을 띄우고, 서버는 고른 장비를 바꾼다
  (금빛 박사 투영은 즉시 정예화·소모라 그대로 창 없음). 테스트 `test/ui/leftovers.test.js` 「a normal 博士投影 on a full operator asks too」.
- (뺐음, 2026-10-06) 방어 지점 경보음: 원본 #134(d5829258)가 같은 `ON_ENEMY_REACHED_EXIT`를 넣어 로컬 `leak-sfx.mjs`·`audio.js` 2줄·테스트를 지웠다(사용자 결정: 원본 사용)
