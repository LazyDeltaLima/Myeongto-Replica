# upstream과의 관계 — 0.2.0 병합·미리 가져온 원본 수정·이식할 때 비교할 우리 패치

옛 `docs/LOCAL-PATCH.md`에서 2026-10-09에 나눈 파일이다. 옛 절 이름은 `docs/LOCAL-PATCH.md` 색인에서 찾는다.
2026-10-07부터 하드 포크라 upstream을 다시 병합하지 않는다. upstream의 수정은 골라서 이식한다(`git cherry-pick -x` 또는 손으로).

## 0.2.0 병합 (2026-10-07)
upstream v0.2.0(0.1.4 이후 350커밋)을 병합했다. 충돌은 UI·이펙트·선발 등 우리 기능은 우리 쪽, upstream이 나눈 파일과 같은 문제를 고친
곳은 upstream 쪽으로 풀었다(관리자 결정).

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
- 미리 가져온 원본 수정 10건(아래 절) — 0.2.0에 모두 들어 있다(#199 울피안은 upstream 방식 `downAtHome`).
- 협동 보스 HP × 생존 인원, 胄 드론 몫 限伤 통과 — upstream이 PR #209를 채택(`gamedata.js bossPoolShareOf`, `Battle.loseHp noHitLimit`).
  upstream은 싱글 보스 HP를 bloodPoint ×1로 바꿨고, 우리는 ×0.25로 되돌렸다가(f11bdabc, 관리자 결정 2026-10-07) 다시 upstream과 같은
  ×1로 맞췄다(관리자 결정 2026-10-12, `sim.md` 「협동 보스 HP」). 협동은 upstream의 × 생존 인원 그대로.
- 스킬 범위 발동(748a79fb, 관리자 결정·미확정) → upstream `ACTIVE_RANGE` 규칙(관리자 결정 2026-10-07: upstream 사용) → 2026-10-11 클라 `AutoChessBattleTrigger` 규칙으로 확정·대체(`sim.md` 「스킬 범위 발동」, 옛 규칙은 그 절 「되돌리기」).
  `local-skill-range.js`·관련 테스트 삭제. 赤刃明霄陈 S3를 공중 적만으로 켜던 `hitsFly`는 upstream 규칙에 없다 — 읽는 곳이 없던
  남은 플래그는 `kits/ops/op-chen3.js`에서 지웠다(2026-10-08, 동작 영향 없음: golden 전부 일치).
- 사야 늑대(PR #225)·와파린·라플란드·페페 등은 upstream 구현으로 대체, PR #225가 바꾼 upstream 테스트는 upstream 판으로 되돌렸다.

**선발 오퍼레이터 → upstream 「自选」 틀 (관리자 결정: 후보는 우리가 고른 오퍼레이터만 — 처음 5명, 2026-10-11부터 8명 — 시제품 없음)**
- 슬롯·재고·상점·로드아웃·로비 `room.diy`는 upstream(`shared/diy.js`, `server/match/player/diy.js`, 클라이언트 자선 편성 탭).
- 후보 제한: `shared/local-diy.js LOCAL_DIY_PICKS`(望·赤刃明霄陈·维什戴尔·丰川祥子·阿斯卡纶, 2026-10-11부터 凯尔希·思衡托·克莱门莎·予愿安洁莉娜). `server/lobby.js` 2줄 — `room.diy` 검사와
  welcome의 `diyKitted`(클라이언트 고르기 화면이 이것만 보여 준다)를 이 목록으로 거른다. 하드 포크 뒤(1fc07616, 2026-10-07) 데이터도 이 목록뿐이다 —
  `tools/build-data.mjs`가 `data/backups.json diy.ownedPool`을 이 목록으로 만들고 `diy.prototypes`는 비어 있으며, 나머지 67명의 키트(`kits/ops/op-<code>.js`·
  `OPERATOR_KIT_FILES` 항목·`kits/shared/summoner.js`)와 그 테스트(`test/content/op_<code>.test.js`)는 지웠다. 로비 검사는 데이터 위에 한 겹 더 거르는 것이다.
  `shared/diy.js`(upstream 틀)는 그대로.
- 丰川祥子: upstream은 콜라보를 뺀다. `tools/build-data.mjs DIY_LOCAL_INCLUDED`로 보유 풀에 넣어 `data/backups.json`에 그녀의 units/operators가 생긴다.
- 키트: `kits/ops/op-wang.js`·`op-chen3.js`·`op-wisdel.js`·`op-ascln.js`는 우리 키트(옛 `kits/diy.js`)로 교체, `op-oblvns.js` 새로 추가.
  upstream 키트와의 동작 차이(근거 비교는 비공개 조사 기록)는 관리자 승인(2026-10-07)으로 반영했다:
  维什戴尔 16571145, 赤刃明霄陈 57f456a9, 望 dd5589d1, 阿斯卡纶 b458241e. 그 뒤 바뀐 望 규칙은 `diy.md`.
- 정예화 보상(관리자 결정 2026-10-07): 보상 단계 = 조달 레벨 + 1(최대 6) 그대로, 그 단계의 선발 오퍼도 후보에 든다 — upstream은 상점의
  조달 레벨 조건을 보상에도 걸어 V단계 선발이 보상에 한 번도 안 나왔다. `server/match/player/acquire.js pushRewardOffer` 1줄(`diyStockEntries`),
  테스트 `test/local-patch-diy-reward.test.js`.
- 지운 것: `data/diy.json`, `tools/build-diy.mjs`, `kits/diy.js`, `ui/diySlots.js`, `css/diy.css`, `tools/assets/diy.mjs`, `tools/assets/local-token-spines.mjs`,
  `tools/local-extract/token_spines.py`(upstream `extract.py TOKEN_SPINES` + `--local-spines`가 같은 일), `server/local-patch.js`의 전용 풀·신표 거부 감싸기.
- 디버그 패널 `dbg.addDiy { charId, tier, golden?, skill?, module? }`: 그 단계에서 같은 오퍼레이터의 슬롯 → 빈 슬롯 → 기물이 하나도 없는 슬롯
  (방의 자선 편대 픽이라도) 순으로 골라 픽을 넣고 슬롯 기물을 손패로. 픽은 `debugSetPick`이 **그 슬롯 하나만** 검사해(`checkDiyPicks`) 넣는다 —
  `setDiy`(편성 전체 검사)를 쓰던 때는 "보유 오퍼레이터는 슬롯 하나" 규칙이 같은 오퍼레이터의 두 번째 단계 픽을 조용히 버려
  「정비 구역이 가득 찼습니다」(HAND_FULL)로 실패했다(관리자 제보 2026-10-08). 디버그에서는 한 오퍼레이터를 V·VI단계에 함께 둘 수 있다.
  디버그 페이지(샌드백)는 슬롯 id + `diy` 픽으로 선발을 띄운다.
- 테스트: `test/local-patch-diy.test.js`(옛 선발 키트 테스트 이전 + 제한·데이터·실제 경로).

**언어**: 우리 번역을 upstream 언어 팩으로 옮겼다(관리자 결정) — `tools/i18n/build-ko-pack.mjs` → `public/i18n/ko.json`·`data/i18n/ko.json`.
처음 접속 언어 한국어, 「自选」 = 「선발」, 进阶 = 승급, 上/下(방향) = 위/아래, 全部 = 전체, 攻击/防御 = 공격/방어, 解冻 = 해동(공식 KR 문자열 표 대조).

**기타**
- 우리 설계 문서의 15.1절(공식 스테이지 씬)은 upstream이 설계 문서를 다시 써서 `docs/local/official-scenes.md`로 옮겼다.
- `data/assets.json`은 우리 생성기로 다시 만들었다(`fetch-assets --add-only --allow-shrink`: 공유 `public/assets`에 없는 파일만 받음).
- 0.2.0 개발 의존성(eslint·typescript)이 생겼다: `npm ci`.

**병합 뒤 겹친 기능 정리 — 대사·전투 화면 (2026-10-08)**
- 선발·补位 기물의 정비 탭 대사와 스킬 대사 유형 → `audio.md` 「오퍼레이터 음성」 로컬 2.
- 보스 라운드 정비의 짝 기물(upstream ef101647 `render/app.js syncMates`)도 공식 장비 바(`setEquip`) — 옛 초록 아이콘이 섞이던 것.
  확인: 실제 협동 판(`test/e2e/fastServer.mjs` SP_START_ROUND=boss, 사람 2명이 아이템 장착), 단위 `test/local-patch-hud.test.js`.
- 引星棘刺 S2 炼金单元 등 떨어진 곳의 오래가는 zone은 2D 원을 남김 → `fx.md` 「공용(절차) 이펙트 제거」의 예외.
- 埃芒加德·M3茧甲 부활(upstream a3a0ddd2: 쓰러짐 + 그 자리 즉시 무료 재배치)은 일반 자동 재배치와 똑같이 보였다(실제 판 확인: 같은 틱
  'die' → 'deploy', 사망음 + 部署 대사 + 배치음 + `onDeploy` 하늘 낙하). 공식 부활 연출의 클라이언트 근거는 못 찾음.
  **관리자 결정 2026-10-08**: 낙하·사망음·배치음은 그대로, 部署 대사만 뺀다 — `audio.js` 'deploy'가 같은 묶음에 그 유닛의 'revive' fx
  (`reviveNow` 뒤 `fxOn`)가 있으면 대사를 건너뛴다. 확인: 실제 솔로 판(fastServer SP_START_ROUND=boss, M3茧甲 금색) 부활 2번 모두
  `b_char_dead`·`b_char_set`·`onDeploy`만, 대사 없음; 단위 `test/local-patch-audio.test.js`.

**병합 뒤 겹친 기능 정리 — 화면 UI (2026-10-08)** (확인: 실제 솔로·협동 판 — `test/e2e/fastServer.mjs`로 라운드·레벨을 당기고 补位·선발·정예를 넣음, 서버 전투 모드
(`SP_COMBAT=server`), 협동 보스 라운드, 협동 탈락자(`SP_ELIMINATE=1`); 단위 `test/local-patch-merge-ui.test.js`·`test/ui/diy-ui.test.js`·`test/ui/gameLogic.test.js`)
- 「선발」 이름표(upstream 0def7bab `screens/game/standInTags.js diyPieces`) 삭제(관리자 제보). 补位 「替补」 이름표는 그대로.
- 「선발」 배지 두 곳 — 상점·보상 카드 `ui/shopBar.js scard__diy`, 맹약 팝업 멤버 `ui/bondStrip.js bpop__diy` — 삭제(**관리자 결정 2026-10-08 「빼야 해」**).
  공식 모양이 아닌 상세 카드(`ui/detailPanel.js ChessDetail`, HUD 공식 모양을 못 쓸 때)의 「自选」 태그는 남김.
- 전투 종료 배너·효과음이 두 번(우리 「완벽한 작전!」 + NOREDUCE, 이어서 SETTLE에 upstream 「작전 종료 / 전원 무사!」 + NORMAL — 실제 판에서 재현)
  → **우리 것만**(관리자 결정 2026-10-08). `screens/game.js announceBattleEnd`가 라운드마다 한 번: 솔로 판은 내 일반 전투 결과가 오면(그대로).
  **협동 판(살아 있는 팀원이 있을 때)은 누수든 완벽한 작전이든 결과를 잡아 두고 SETTLE에** 띄운다(`ui/gameLogic/phases.js holdsBattleEnd`) —
  관리자 기억(2026-10-08): 联防이 이어지면 내 전투가 끝났을 때 배너가 없고, 联防이 끝난 뒤 막은 수에 따라 감소량 배너 또는 완벽한 작전 배너,
  완벽한 작전 쪽(돕는 쪽)도 联防이 끝난 뒤. 联防이 없는 협동 라운드(팀원 누수 없음)도 팀원의 작전이 끝난 뒤에야 완벽한 작전 배너(관리자 확인 2026-10-08:
  공식은 내 방어가 성공해도 바로 띄우지 않고 팀원을 기다린다) — 서버가 모든 전투가 끝나면 넘어가는 SETTLE에 뜬다.
  SETTLE의 판단(`settleBattleEnd`): 서버가 실제로 깎은 LP — 2026-10-11부터 联防 여부와 상관없이 `m.public.roundLosses`(살아 있는 모든 플레이어,
  联防이 있으면 그 재배분 값 = `uniteResult.losses`와 같음)로 `battleOverOf`(관리자 결정 2026-10-11, `audio.md` 「작전 종료 효과음」): 내가 N 잃음 →
  「목표 HP 감소 N」 + REDUCE, 모두 0 → 「완벽한 작전!」 + NOREDUCE, 나는 0인데 다른 플레이어가 잃음 → panel_miss 제목만 + NORMAL(옛 규칙은
  `uniteResult.losses[나]`만 보아 0이면 돕는 쪽도 「완벽한 작전!」 — 되돌리기는 `audio.md`); 값이 없으면 잡아 둔 결과 그대로; 결과가 안 온 라운드(서버
  전투 모드·재접속·클라이언트가 안 돌린 전투)는 라운드 동안 센 누수 수. 관전 좌석·탈락자·보스 라운드는 없음.
  확인(실제 협동 판, 2026-10-08 규칙 — 2026-10-11부터 이 경우 돕는 쪽은 제목만 + NORMAL): 联防에서 12마리 통과 → 누수 쪽 SETTLE에 「목표 HP 감소 6」 + REDUCE(서버 감소량 6), 돕는 쪽 「완벽한 작전!」;
  联防이 다 막음 → 둘 다 「완벽한 작전!」; 联防 없는 협동 라운드 → 둘 다 SETTLE에 「완벽한 작전!」; 전투가 끝난 순간에는 어느 쪽도 배너 없음.
  SETTLE 경로에서 셈하지 않는 누수만 있는 판은 LP 0이라 완벽한 작전(NOREDUCE) — 클라와 같음(2026-10-11, `GetBattleResultStatus`는 hpCost만 본다).
  배너 그림(로컬 추출)이 없는 클라이언트는 upstream 상자(`ResultDialog`·`roundResultBox`)를 같은 순간에 대신 띄운다.
  지운 것: `battleOverSfx`·`uniteResultBox`·`battleResultBox`와 그 테스트, `test/ui/resultbox.e2e.test.js`(upstream SETTLE 상자 브라우저 테스트).
- PREP의 upstream 「休整期」 띠(`ui/gameLogic/phases.js phaseBanner`) 삭제 — **관리자 확인 2026-10-08: 공식은 휴식 기간 띠가 없고 라운드·획득 배너만**.
  PREP 진입 효과음(`rest`)은 그대로.
- 탈락자·관전 좌석의 라운드 시작 배너: upstream 7d97b80b(#236)처럼 「获得 +0」 대신 「观战中」(`ui/phaseArt.js RoundStartBanner watching`, [获得] 상자 자리에
  [回合] 상자 모양으로 [추정: 관전자 캡처 없음]).
- 보스 라운드 짝 아바타 테두리 두 겹(우리 `bg_team_border` + upstream ef101647 `.team__frame`, 화면 확인) → 공식 HUD 모양에서는 upstream 테두리를 숨기고
  우리 테두리를 짝 두 명 모두 초록(#59ffd2)으로(`css/hud-art.css`, [추정]: 보스 라운드 플레이어 목록 캡처 없음). 공식 HUD가 아닐 때는 upstream 그대로.
- 补位 기물의 공식 모양 상세 카드(`ui/detailArt.js ChessDetailArt`)가 원래 오퍼(갖고 있지 않은 오퍼)의 그림·이름·스탯을 보였다 → upstream `ChessDetail`처럼
  대체 오퍼의 그림·직군·이름·스탯·사거리(그의 고정 스킬·모듈), 「替补」 태그와 「X의 대체」 줄. 등급·정예 레벨·맹약·특질은 기물 것.
- 드래그 카드(관리자 제보 2026-10-08): `placingDetail`이 m.private 없이 기물을 풀어서 선발 슬롯 기록 그대로
  「선발 오퍼레이터」(스탯 —)를 보였다 → 탭과 같은 `resolveDetail(…, { priv, backups })`. 补位 기물도 드래그 중 대체 오퍼 카드.
- (의심) 선발 정예 카드 스탯: 확인만 — 공식 모양 카드·0.2.0 카드·전투 유닛(`simdata.js getDiy`)의 스탯·스킬·모듈이 望·赤刃明霄陈·阿斯卡纶·维什戴尔 모두 같다.
  카드도 0.2.0 카드와 같은 조회(`pickGetter`)를 쓰게 맞추고 테스트로 고정.

## 0.2.0 전에 미리 가져온 원본 수정 (2026-10-07)
관리자 요청 「upstream에 보고된 버그 중 쉬운 것 바로 수정」(2026-10-07)으로 upstream 0.1.4 위에 원본의 버그 수정 10건을 먼저 가져왔다(원본 코드·테스트 그대로).
10건 모두 upstream 0.2.0에 들어 있어 병합 때 upstream 구현을 택했다(정예화 보상의 선발 조건만 우리 결정으로 다시 고침 — 위 「0.2.0 병합」).
- #200 페페 전략 2/4/6본 승급 뒤 첫 갱신이 무료 → 특수 갱신(일반 가격) — PR #226.
- #202 사야(伺夜) 늑대가 배치 안 해도 자동 배치, 연합방어 때 위치가 바뀜 — PR #225.
- #199 울피안 S3 이동 중 쓰러지면 부활·재배치가 닻 칸 → 원래 칸 — upstream은 9738bb82 `downAtHome`으로 같은 결과(그쪽을 택함).
- #175 와파린 특성 층 상한 7/14 — PR #192(upstream 269d7b0b가 채택).
- #169 #201 라플란드 금카 합성 뒤 그 라운드 첫 갱신에 시라쿠사 층 안 오름 — upstream 661f1c07.
- #207 의태물질: 같은 초기 오퍼레이터 2장 + 풀 소진이면 아무것도 안 줌(같은 맹약 다른 오퍼레이터 지급 금지) — upstream 463352d9. (2026-10-11: 풀 소진이어도 주는 것으로 바뀜 — `sim.md` 「upstream 0.2.3 이식」 D8. 다른 오퍼레이터로 바꾸지 않는 점은 그대로.)
- #107 침사·신형(沉沙/新硎) 断刃: 공격마다 ATK 층이 쌓이던 것 → 칼날이 남아 있는 동안 1층, 마지막에 해제 + 공격 간격 초기화 — upstream ebfda7e6.
- #49 돌격 맹약: 켜져 있는 패시브 스킬을 「技能就绪」로 침 — upstream 696085ac.
- #116 琳琅诗怀雅 S2 香槟 폭탄: 공격 범위 1-1에 무작위 → x-6 범위, 적이 선 칸 우선, 적 없어도 던짐(공격 차례를 씀) — upstream e9b6f7e7.
- #216 연합방어 1인일 때 돌격 오퍼레이터가 오른쪽 반(남의 보드)으로 점프, 울피안 S3도 같은 문제 — upstream 219ab31a + 9b164fdc(`Battle.onOwnBoard`).
- 그때 일부러 안 가져온 것: #190 팀원 표시(PR #227 — upstream 0.2.0은 다른 방식 ef101647), #205 원거리 우선순위(PR #220 — 재현 못 함; **2026-10-09 이식함**:
  upstream 주인 결정 2026-10-08로 `4bd154e3`이 우선도 'fly'(속사 저격수 특성·스킬의 비행 우선)만 저지보다 앞에 둠 — PRTS 索敌 「阻挡（近战限定）→特殊优先级→…」,
  관리자 결정 2026-10-09), #187 #170 짧은 기절이 적 공격을 끊음, #181 비술사 충전 타이밍, #96 #137 생명 회복 속도 ≠ 치료, #214 #82 #140 — 모두 0.2.0 병합 때 함께 들어왔다.

## 하드 포크 뒤 손 이식한 기능
- **「AI 팀원은 마지막에 선택」 방 옵션** (upstream `fd791a66`, PR #368 by @anAtheist987, 관리자 요청 2026-10-10): 동맹 방에서 방장만 켜고 끄는
  스위치(기본 꺼짐, 다른 사람은 읽기 전용). 켜면 전략 선택·결정(机变) 차례에서 사람 좌석이 모두 AI 좌석보다 앞 — 섞은 순서를 그대로 둔 채
  나누기만 해서 난수를 더 뽑지 않는다(꺼져 있으면 순서·난수 흐름이 이전과 같다). 건너뛰기는 남은 사람 뒤·AI 앞으로 [ASSUMED, upstream 그대로].
  AI 托管·연결 끊긴 사람도 사람으로 센다. 바꾸면 다른 사람의 준비가 풀린다(난이도 변경과 같음). 리롤로 새로 만든 판도 `startMatch`를 거쳐 같은 값을 받는다.
  코드: `server/lobby.js setAiPicksLast`·`room.state.aiPicksLast`, `shared/protocol.js room.setAiPicksLast`, `server/match/match/phases.js humansFirst`
  (`enterBandDraft`·`skipBand`), `spDraft.js enterSpDraft`, `public/js/screens/room.js AiLastToggle`. 우리 판과 문맥이 달라 손으로 옮김(`git apply`
  거부 4곳), 문서는 `docs/PLAYING.md`·`docs/design/{match,client,network}.md`. #338의 봇별 진영·금지 프리셋은 upstream도 넣지 않았다.
  테스트: `test/lobby-ai-last.test.js`, `test/match/ai-picks-last.test.js`, `test/ui/ai-picks-last.test.js`(upstream 그대로).

- **선발 키트 3개** (upstream `master` 0.2.4-dev `6bfc0827` 시점의 `kits/ops/op-{kalts2,clemnt,aglna2}.js`와 테스트, 관리자 결정 2026-10-11):
  凯尔希·思衡托·予愿安洁莉娜는 `1fc07616`에서 지운 것을 되살리고(upstream `0451860c`·`5029b646`과 그 뒤 수정), 克莱门莎는 upstream `2e122873`·`ba5b998a`·
  `708caf7d`·`6bfc0827`. 우리 「스킬 범위 발동」에 맞춰 凯尔希·思衡托 S2의 키트 발동 규칙과 克莱门莎 S2의 #467 공중 발동 범위는 받지 않음. 관련 upstream
  테스트 묶음(`heal-triggers-023`의 S2 발동, `feedback5-we2-placement` #26, `feedback5-we2-summon-hand` #24, `community-round27`의 予愿 2개)도 옮김.
  #469(결과 화면 선발 이름, `server/match/fields.js`)는 이때 안 받고 0.2.4 이식에서 받음(`sim.md` 「upstream 0.2.4 이식」). 자세한 것은 `diy.md` 「선발 추가 3명 (2026-10-11)」.

- **멈춘 Spine 자세·재배치 링 글자 텍스처 재사용** (upstream `2fdc565c`, PR #434 by @Cloudnyco, `git cherry-pick -x` + 브라우저 테스트 후속 `584cedc1`·`6036e6a4`,
  관리자 결정 2026-10-11): 충돌 4곳(`app.js` import, `spine.js` 머리 주석·생성자 필드, `units.js` 생성자 주석·impostor 분기)은 양쪽 다 넣고, impostor 분기는 우리
  낙하 조건(`a8277c09`)에 upstream `held`를 더함. upstream의 `docs/history/0.2.3.md`는 우리에게 없어 건너뜀, `docs/design/client.md`는 한 절 덧붙임. 우리 보강
  2개(跃跃 부메랑 스킨 변경 시 다시 그림, 멈춘 자세도 240프레임마다 다시 그림)와 자세한 것은 `render.md` 「upstream 0.2.3 이식 — 렌더」.

- **upstream 0.2.4 이식 — sim** (관리자 결정 2026-10-11): PR #496 `1d1ff3b1`(`git cherry-pick -x`, 특질 고정 장비는 공용 장비 재고 밖, #488·#491·#495),
  `6bfc0827`의 #473(白面鸮 복사 증정의 줄 조건)·#469(클라 전투 결과의 선발·보충 이름) 부분(손 이식), 그리고 upstream에 없는 우리 수정 둘 — 이미 뜬 오퍼레이터 카드는
  재고 0이어도 구매(#498, 路标月报#2 ~2:55), 谢拉格不融冰은 피해 출력마다(#489, 클라 템플릿). 자세한 것은 `sim.md` 「upstream 0.2.4 이식」.

- **upstream 0.2.4 이식 — 장치 탭 설명·간이 보기 재시도** (관리자 결정 2026-10-11): 0.2.2 묶음에서 보류했던 `df540b62`(장치 탭 설명, #228·PR #229)를
  그 뒤 수정 `6bfc0827`(§29.14 같은 전장 재입장 때 장치 유닛 유지, `deviceUnitsForEntry`)과 함께 손 이식, `6bfc0827`의 `ui/fieldHost.js` 재시도(그대로 적용)와
  그것을 받는 `screens/game.js` 새 view 다시 들어가기. `render/app.js`의 `retryBoard`는 우리 `retry3d`(`670d916a`)가 이미 하는 일이라 안 받음.
  우리 카드에는 공식 정보 패널처럼 장치 자신의 스킬 글과 포탑 공격 범위를 더함. 자세한 것은 `ui.md` 「upstream 0.2.4 이식 — UI」, `render.md` 「모바일 3D 보드 복구」.

- **upstream 버그 이슈 이식 (2026-10-15)** (관리자 결정 2026-10-15, 0.2.6 무렵의 버그 이슈와 그 수정 PR만): upstream #641(PR #644, 맹약코인 바로 파괴
  자금 — 관리자 결정 2026-10-17로 되돌림: upstream이 PR을 닫음, 공식 설명은 장착 때만), #627(PR #642, 리롤 때 특질 먼저 — 순서 [ASSUMED]), #631(PR #634, 캐서린 【定向投放】 돌연변이 세포), #557(`347343d7` 손 이식, 위셔델 魂灵之影은 자기
  필드 보드에만), #510(`221e6b8d` 일부, “自在” 부활 뒤 무적은 대상 불가), #611(PR #612를 PRTS 枯朽之种 문구대로 바꿔 — 자폭은 초속 10칸 평타 탄, 공격이
  끝날 때 자멸), #481(PR #613, 假想敌：镜膜 HP +100% 첫 침묵에 영구 상실 + 멈춘 팬 B 클립), #600(PR #559, 假想敌：淤困 부착 때 막은 칸 중심으로 순간이동 + 自缚)은
  `sim.md` 「upstream 버그 이슈 이식 (2026-10-15)」·`render.md` 「upstream 버그 이슈 이식 — 렌더 (2026-10-15)」. #506(`221e6b8d` 일부, 공격 대체 경로도
  공격마다 클립 한 번)은 `render.md` 「공격 모션」, #635(PR #637, 박사 한 명 联防 첫 카메라 — upstream PR은 필드 첫 입장에 안 불려 입장 경로도 고침)는
  `ui.md` 「박사 한 명 연합 방어의 첫 카메라」, #482(`221e6b8d` 일부, 맹약 층 오를 때 `bondUp` — upstream `_playBondCue`를 우리 `SoundFXBank` 제한기 한
  채널로)는 `audio.md` 「맹약 층 효과음」. 받지 않음: PR #636(저장 에너지 숫자 표시, 공식 몸 이펙트를 따로 찾음), #624(재고 0 장비 회색, 보류),
  PR #612의 逻各斯 감속(우리 풀에 없음).

- **upstream 0.3.0 이슈 결정 (2026-10-17)** (관리자 결정 2026-10-17): #584 `84860f60`(손 이식, 상점 수동 갱신은 성공하면 유료·무료 모두 동결을 풀고
  새 카드는 동결 안 됨, 실패한 갱신은 그대로 — upstream 관리자의 공식 실기 2026-10-14), #641은 위 2026-10-15 이식을 되돌림. 받지 않음: #624 0.3.0 해법
  (재고 바닥난 장비를 빚으로 사기, 보류), #677(캐서린 돌연변이 세포 두 번째, upstream 판정 대기).

- **upstream 0.2.5–0.3.1 버그 수정 이식 — 매치** (관리자 결정 2026-10-17, upstream 버그 수정 커밋 중 우리에게도 있는 것):
  - `2018b2de`(`git cherry-pick -x`): 공개 상태(m.public) 전송 간격을 스냅샷 만들기 시작 시각이 아니라 실제로 보낸 시각부터 셈 — 느린 스냅샷 뒤 다음
    프레임이 간격보다 일찍 가던 것(`server/match/match/messaging.js _maybeSendPublic`). 테스트 `test/match/connection.test.js`(upstream 그대로).
  - `e53b8d52`(손 이식, 데이터 다시 생성): 娜仁图亚 【见者有份】 장비 2개가 상점 레벨 이하 단계만 — `pool_equip_narant`의 `maxTier` 뺌, 凯瑟琳의 `plus`는 안 넣음.
    `sim.md` 「upstream 0.2.5–0.3.1 버그 수정 이식 — 매치」.
  - `16567bbe`(`git cherry-pick -x`, 충돌 손 정리): 꺼진 동안 밀린 빅토리아 해머·远见·奇迹 자금이 맹약이 켜지는 즉시 — 새 훅 `onActiveBonds`. 우리 AI 리허설은
    진짜 판을 쓰던 동안 `recompute({ quiet: true })`를 더했다가 `ed44ce4d` 이식(떨어진 사본)에서 뺌. upstream `docs/history/0.3.0.md`·CHANGELOG 줄은 안 받음. `sim.md` 같은 절.
  - `92b97ecb` `ae1c21d9`(`git cherry-pick -x` + 손 정리, 대기열만 — 관리자 결정 2026-10-17): 임시 정비 구역 5칸 뒤 숨은 대기열, 지급·정예·보상·돌려받는
    장비를 반환·버림·파기 대신 대기열로. 안 받음: 대기열이 있으면 준비 거절·`Ready is refused` 문장(우리 `ui.md` 2026-10-10 규칙), 플러그인 DSL 지급 테스트, `docs/img/bench-overflow.png`·`docs/history`. `sim.md` 「임시 정비 구역 뒤 숨은 대기열」.
  - `0a09b5d6`(PR #452, `git cherry-pick -x`; 그 머지 `4210fcb9`의 나머지는 upstream CI·로비 테스트): AI의 홀로 선 가드를 아군 엄호 칸으로 — AI 휴리스틱(`feat`),
    `ui.md` 「AI 팀원 구매 양보」 아래.
  - `ed44ce4d`(손 이식, upstream PR #606·#607·#608의 생각): 막는 메딕 칸, 실제 손패 용량의 구매 추정, 떨어진 사본(`preview.js`)으로 도는 리허설 — AI 휴리스틱
    (`feat`). `server/sim/rng.js`에 `rng.clone()`을 더함. 플러그인 예산 테스트·`docs/history`는 안 받음. 같은 `ui.md` 절.
- **upstream 0.2.5–0.3.1 버그 수정 이식 — UI·렌더** (관리자 결정 2026-10-17, v0.2.4 → 0.3.1 버그 수정 커밋 중 우리에게도 있던 것): UI — `c9197947`(PR #546,
  마지막 사람의 전략 「跳过」), `289a454f`(#501, 갱신 연타 한 번만 — busy 표시는 game.js 대신 ShopBar가 구독), `10e1461c`(연결 복구 버튼이 AI 托管 화면 위),
  `70151d08`·`52b70434`(PR #538, 선발 데이터 없이 편성 가져오기 거부), `7a65577c`(선발만 바꾼 편성의 「导出」), `19c854c1`·`52b70434`(PR #540, 「全部恢复默认」을
  옛 동기화가 덮어씀 — `tools/package.mjs` 부분은 해당 없음), `1188a980`(관전 맹약 팝업의 선발 오퍼레이터 — 시험은 우리 선발 풀로), `d1d72185`(HEAD + Range,
  손으로: 우리는 gzip만), `b5d0c3f9`(e2e가 글꼴 호스트 실패를 거름), upstream #676·PR #694(비중국어에서 고지대 판정 — `placementRecords` 도움 함수로)는
  `ui.md` 「upstream 0.2.5–0.3.1 버그 수정 이식 — UI」. 렌더 — `7b4f512c`(원점이 몸 가운데인 적의 HP바 — 우리 `UNIT.modelScale`로 기대값), `1df530f2`(처음 그리기
  전 기물의 화면 사각형), `205f3bb7`의 장치 부분(특제 수상 플랫폼 — upstream의 절차 판 대신 클라 모델 `trap_040_canoe`를 추출; 봉인된 지면은 클라 모델이 없어
  안 그림), `43a5b571`(#647, 스텐실 없을 때 영역 눈알)은 `render.md` 「upstream 0.2.5–0.3.1 버그 수정 이식 — 렌더」. upstream의 브라우저 e2e 중 옮기지 않은 것:
  `band-draft-skip`·`refresh-tap`·`loadout-ops-export`·`loadout-ops-import`·`high-ground-i18n`(단위 시험이 같은 판정을 봄).
- **upstream 0.2.5–0.3.1 버그 수정 이식 — 전투** (관리자 결정 2026-10-17, v0.2.4 뒤 버그 수정 커밋 중 우리에게도 같은 버그): `b87fcb3a`(忍冬 追凶 첫 타), `e54ac351` 중 风丸(<替身> 대공), `ad7e3e98`(detmath `powi` −0), `119a0488`(점 적의 칸 짝수 반올림·가장자리 안쪽), `5bf337a5` + `cf229a9c`(적 충돌 반경 0.1 — 평타·스킬 공격 범위만, 스킬 자동 발동 검사는 점 유지), `823e3d0a` `e0f37718` `a451ddcf` `7434e9ea` `f567e804`(驭械术师 본체 + 부유 추가 피해·재배치 초기화·洛洛 S2 고정), `31a172e2`(自制投石机 돌 3개 0.3 s 간격), `18cb28fe` 중 “越长尘”(승객 최대 4·감속 없음·칸 중심 하차·자기 경로).
  자세한 것은 `sim.md` 「upstream 0.2.5–0.3.1 버그 수정 이식 — 전투」.
- **upstream 0.3.1–0.3.2 버그 수정 — 렌더·이펙트** (관리자 결정 2026-10-21 「render/fx는 우리와 관련 있는지 점검」): upstream의 0.3.x 이펙트 런타임은 우리에
  없어 코드가 아니라 같은 증상을 우리 클라 데이터로 고침 — `2b461767` `60d182c3`(스킬 중 공격 클립) + `ad9aa983` `72cb65a6`(begin/loop/end 스킬의 자세)는
  `render.md` 「스킬 중 공격 클립」, `5209873f`(소환물 스킬 이펙트)는 `fx.md` 「소환물 스킬 오라」.
- **upstream 0.3.1–0.3.2 버그 수정 — 전투·도구** (관리자 결정 2026-10-22): PR #798(upstream 미병합, 손 이식 — 관통은 고정 먼저, 클라
  `BattleFormula.CalculateDamageInternal`), `126f0bc0`(`git cherry-pick -x`, `removeBuff` 다시 찾아 지우기), PR #749 중 凛御银灰 S3 대공(손, 트리거
  범위 부분은 안 받음), `4d11e97d` 중 琳琅诗怀雅 S3(손, 상한 닫힘·금화 사격 철회 — 같은 커밋의 瑕光 S2 테스트 파일은 우리에 없어 안 받음)는 `sim.md`
  「upstream 0.3.1·0.3.2 대조 이식 — 전투」. `20c4327a`(PR #728, `git cherry-pick -x`): `tools/setup.mjs`가 디렉터리를 받은 파일로 세지 않음 — 테스트의
  고정 파일 목록과 `--no-scenes`는 우리 setup에 맞춤.
- **upstream 0.3.1–0.3.2 버그 수정 — 매치** (관리자 결정 2026-10-22): `f8bca717` `83ccfcd7`(凯瑟琳 突变细胞 한 판 1번, 손 — 우리 풀 키는
  `also`가 아니라 `plus`, 효과를 물려받는 전략 `effectRef`는 우리에 없어 그 부분과 시험 콘솔 재생 테스트는 안 받음), upstream #845(upstream 미수정, 우리
  구현 — 4인 보스전 짝을 보스 웨이브마다 무작위), `fc9323c3` `212a796e`(PR #675, 손 — 联防에서 태어난 적은 누수자 LP·×N에서 빠짐, 클라 결과 검증은
  우리 `validateClientResult`에)는 `sim.md` 「upstream 0.3.1·0.3.2 대조 이식 — 매치」.

## upstream에서 이식할 때 비교할 우리 패치
upstream이 같은 곳을 고치면 비교해서 정리한다.
- 제국의 갑주 폭격·3연타 → `server/sim/content/local-patch.js`의 `patchVtsk`(`sim.md` 「“帝国的甲胄”」).
- 频次 적 × 隐德来希 → `server/sim/content/kits/ops/chess_char_5_06-etlchi.js`의 `// local patch` 2곳(테스트: 「频次 enemies lose exactly 1 HP per damage instance」).
- 얼린 상점의 특수 갱신 칸 → `server/match/effectsMeta.js setShopSlot`의 `prev` 2줄(#584 이식 뒤 佩佩·杜遥夜는 수동 갱신이 동결을 먼저 풀어 이 경로를 안 탐).
- 채팅·관전석 등은 원본에 같은 기능이 생기면 비교해서 정리.
- (대체됨, 2026-10-09) 일반 박사 투영(博士投影)이 꽉 찬 오퍼레이터의 장비를 말없이 파괴하던 것(관리자 제보 2026-10-09, 우리 `7cf09006`) — upstream `8cef750e`
  이식으로 대체: 꽉 찬 오퍼레이터에는 소모 아이템 전부가 교체 창을 띄운다(`sim.md` 「upstream 0.2.1·0.2.2 이식」).
- (뺐음, 2026-10-06) 방어 지점 경보음: upstream #134(d5829258)가 같은 `ON_ENEMY_REACHED_EXIT`를 넣어 로컬 구현을 지웠다(관리자 결정: 원본 사용).
