# nas-local 로컬 패치 목록

`nas-local` 브랜치가 원본(`upstream` = sganggs/Stronghold-Protocol)과 다른 부분을 모두 정리한 문서다. 이 파일은 로컬에서만 만든 파일이라
원본을 병합해도 충돌하지 않는다. 패치를 넣거나 뺄 때 같이 고친다. 운영 절차는 `STRONGHOLD.md`에 있다.

최종 갱신: 2026-10-07 (upstream v0.2.0 병합 — 바로 아래 「0.2.0 병합」 절. 그 아래 절들의 파일 경로는 분할 전 이름일 수 있다: 대응표 참고)

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
  upstream은 싱글 보스 HP를 bloodPoint ×1로 바꿨지만, **우리는 싱글 ×0.25로 되돌렸다**(91900cf5, 사용자 결정 2026-10-07: 혼자서는
  팀원이 없다 — `server/match/gamedata.js bossPoolShareOf`의 `solo` 기본값, `tools/build-data.mjs` → `data/config.json bossHpScale.solo`).
  협동은 upstream의 × 생존 인원 그대로.
- 스킬 범위 발동(a0da6834, 사용자 결정·미확정) → upstream `ACTIVE_RANGE` 규칙(사용자 결정 2026-10-07: upstream 사용). 「미확정」 표시는 유지.
  `local-skill-range.js`·관련 테스트 삭제. 赤刃明霄陈 S3를 공중 적만으로 켜던 `hitsFly`는 upstream 규칙에 없다 — 읽는 곳이 없던
  남은 플래그는 `kits/ops/op-chen3.js`에서 지웠다(2026-10-08 세션 K, 동작 영향 없음: golden 전부 일치).
- 사야 늑대(PR #225)·와파린·라플란드·페페 등은 upstream 구현으로 대체, PR #225가 바꾼 upstream 테스트는 upstream 판으로 되돌렸다.

**선발 오퍼레이터 → upstream 「自选」 틀 (사용자 결정: 후보는 우리 5명만, 시제품 없음)**
- 슬롯·재고·상점·로드아웃·로비 `room.diy`는 upstream(`shared/diy.js`, `server/match/player/diy.js`, 클라이언트 자선 편성 탭).
- 후보 제한: `shared/local-diy.js LOCAL_DIY_PICKS`(望·赤刃明霄陈·维什戴尔·丰川祥子·阿斯卡纶). `server/lobby.js` 2줄 — `room.diy` 검사와
  welcome의 `diyKitted`(클라이언트 고르기 화면이 이것만 보여 준다)를 이 목록으로 거른다. upstream 데이터(72명 보유 풀, 시제품)·키트·`shared/diy.js`는 그대로라
  매치·시뮬·upstream 테스트는 아무 픽이나 세울 수 있다.
- 丰川祥子: upstream은 콜라보를 뺀다. `tools/build-data.mjs DIY_LOCAL_INCLUDED`로 보유 풀에 넣어 `data/backups.json`에 그녀의 units/operators가 생긴다.
- 키트: `kits/ops/op-wang.js`·`op-chen3.js`·`op-wisdel.js`·`op-ascln.js`는 우리 키트(옛 `kits/diy.js`)로 교체, `op-oblvns.js` 새로 추가.
  upstream 키트와의 동작 차이는 `research/2026-10-07-diy-kit-diff.md`(근거 비교, 사용자 결정 대기).
- 정예화 보상(사용자 결정 2026-10-07): 보상 단계 = 조달 레벨 + 1(최대 6) 그대로, 그 단계의 선발 오퍼도 후보에 든다 — upstream은 상점의
  조달 레벨 조건을 보상에도 걸어 V단계 선발이 보상에 한 번도 안 나왔다. `server/match/player/acquire.js pushRewardOffer` 1줄(`diyStockEntries`),
  테스트 `test/local-patch-diy-reward.test.js`.
- 지운 것: `data/diy.json`, `tools/build-diy.mjs`, `kits/diy.js`, `ui/diySlots.js`, `css/diy.css`, `tools/assets/diy.mjs`, `tools/assets/local-token-spines.mjs`,
  `tools/local-extract/token_spines.py`(upstream `extract.py TOKEN_SPINES` + `--local-spines`가 같은 일), `server/local-patch.js`의 전용 풀·신표 거부 감싸기.
- 디버그 패널 `dbg.addDiy { charId, tier, golden?, skill?, module? }`: 그 단계의 빈 슬롯(또는 같은 오퍼레이터의 슬롯)에 `setDiy`로 픽을 넣고
  슬롯 기물을 손패로. 디버그 페이지(샌드백)는 슬롯 id + `diy` 픽으로 선발을 띄운다.
- 테스트: `test/local-patch-diy.test.js`(옛 선발 키트 테스트 이전 + 제한·데이터·실제 경로).

**언어**: 우리 번역을 upstream 언어 팩으로 옮긴다(사용자 결정, 진행 중) — `tools/i18n/build-ko-pack.mjs` → `public/i18n/ko.json`·`data/i18n/ko.json`.
기본 언어 한국어, 「自选」 = 「선발」, 进阶 = 승급, 上/下(방향) = 위/아래, 全部 = 전체, 攻击/防御 = 공격/방어, 解冻 = 해동(공식 KR 문자열 표 대조).

**기타**
- 우리 설계 문서의 15.1절(공식 스테이지 씬)은 upstream이 설계 문서를 다시 써서 `docs/local/official-scenes.md`로 옮겼다.
- `data/assets.json`은 우리 생성기로 다시 만들었다(`fetch-assets --add-only --allow-shrink`: 공유 `public/assets`에 없는 파일만 받음).
- 0.2.0 개발 의존성(eslint·typescript)이 생겼다: `npm ci`.

**병합 뒤 겹친 기능 정리 — 대사·전투 화면 (2026-10-08 세션 K)** (조사 목록: `STRONGHOLD.md` §11 「0.2.0 병합으로 겹친 기능」)
- K-1·K-2 선발·补位 기물의 정비 탭 대사와 스킬 대사 유형 → 아래 「오퍼레이터 음성」 로컬 2.
- K-3 보스 라운드 정비의 짝 기물(upstream ef101647 `render/app.js syncMates`)도 공식 장비 바(`setEquip`) — 옛 초록 아이콘이 섞이던 것.
  확인: 실제 협동 판(`test/e2e/fastServer.mjs` SP_START_ROUND=boss, 사람 2명이 아이템 장착, `sp-check\k_mates.mjs`), 단위 `test/local-patch-hud.test.js`.
- K-4 引星棘刺 S2 炼金单元 등 떨어진 곳의 오래가는 zone은 2D 원을 남김 → 아래 「공식 전투 이펙트」 7번 예외.
- K-5 埃芒加德·M3茧甲 부활(upstream a3a0ddd2: 쓰러짐 + 그 자리 즉시 무료 재배치)은 지금 일반 자동 재배치와 똑같이 보인다(실제 판 확인: 같은 틱
  'die' → 'deploy', 사망음 + 部署 대사 + 배치음 + `onDeploy` 하늘 낙하). 공식 부활 연출의 클라이언트 근거는 못 찾음 — **사용자 결정 대기**(STRONGHOLD.md §11).
- K-6 문서: 싱글 보스 HP ×0.25(91900cf5) 반영, `op-chen3.js`의 읽는 곳 없는 `hitsFly` 삭제.

## 원칙
**2026-10-07부터 하드 포크**: upstream v0.2.0 병합이 마지막이다(사용자 결정, `STRONGHOLD.md` 2·5장). 그래서 예전의
병합용 규칙(원본 파일에는 연결 한 줄만, 원본 테스트는 고치지 않기, 의도된 실패 목록 유지)은 풀었다.
- 원본 파일도 필요한 만큼 고친다. 새 기능은 여전히 따로 된 파일이 읽기 쉬우면 새 파일에 둔다.
- `// local patch` 주석은 새로 달 필요가 없다. 이미 있는 것은 그대로 두거나, 그 줄을 다시 고칠 때 지운다(사용자 결정의 근거 같은 설명은 남긴다).
- 원본 테스트도 우리 것이다. 우리 동작과 다르면 고치거나 지우고, 의도된 실패 목록을 늘리지 않는다.
- upstream의 버그 수정은 골라서 이식한다(`STRONGHOLD.md` 5장, `upstream/ISSUES.md`). 이 문서는 우리가 원본과 다르게 정한 것과 그 근거를 적는 곳으로 남긴다.

## 기능별 목록

| 기능 | 로컬 파일 | 원본 파일에 넣은 연결 |
|---|---|---|
| 한국어 번역 (UI·데이터·공식 문구) | `public/js/i18n/*`, `public/i18n/ko/*`, `tools/i18n/*` | `main.js` import, `richText.js` `tr()`, `settings.js` 언어 선택, `lobby.js` 언어 버튼 |
| 협동 방 채팅 | `server/local-patch.js`, `shared/local.js`, `public/js/ui/chat.js`, `public/css/chat.css` | `server/lobby.js` 훅, `shared/protocol.js` 2줄, `screens/room.js`·`screens/game.js`, `store.js` 1줄, `index.html` |
| 채팅 진영 (8개국, 맹약 아이콘) | `shared/local.js`, `public/js/ui/faction.js` | `components.js` `AvatarFrame`의 `mark`, `gameComponents.js` 아바타 |
| `SP_MAX_BOTS` (방마다 AI 팀원 한도) | `server/local-patch.js` | `server/lobby.js` 훅, `screens/room.js` 한도 표시 |
| 이모티콘 공식/유저 탭 | `shared/emote-art.js`, `public/img/emotes/*` | `ui/emotes.js`(약 100줄, 가장 큰 수정), `emotes.css`, `gameActions.js`, `gameLogic.js`, `teamPanel.js`, `Match.js`·`StubMatch.js` 의 `set` |
| 리소스 미리 받기 | `public/js/resources.js`, `public/resource-worker.js`, `tools/build-browser-resources.mjs`, `public/css/resources.css` | `main.js`, `settings.js`, `index.html` |
| 오퍼레이터 음성 언어 선택(한국어/일본어/끄기)과 정비 단계 대사(선택·배치) — 원본 #73 「干员战斗语音」 위에 | `tools/assets/voice.mjs`(일본어 쌍둥이 `audio.voiceJp`, 정리), `public/js/voice.js` | `tools/fetch-assets.mjs`(기본 `--voice-lang=kr` 1줄, `tidyVoice` 2줄), `tools/assets/plan.mjs` 2줄(import, `audio.voiceJp`), `audio.js voice()` 2줄(`audio.voiceTable`: 고른 언어의 표), 공식 재생 규칙 `public/js/voicePolicy.js` + `audio.js` 훅(`voice()` 유형 인자, 스킬·행동 개시·첫 배치·초기화 각 1~3줄), `screens/game.js`(import, 선택 2줄, `buy`·보상 선택, 결산 대사 보관 `holdResultVoice`), `screens/result.js` 2줄(import, 승리 결산에서 `playMatchEndVoice`), `ui/settings.js`(언어 줄), `resources.js`(언어 필터), `debug.js`(대사 버튼), `public/i18n/ko/ui.json` |
| 선발 오퍼레이터 (0.2.0부터 upstream 自选 틀, 후보 = 望·赤刃明霄陈·维什戴尔·丰川祥子·阿斯卡纶) | `shared/local-diy.js`, `kits/ops/op-{wang,chen3,wisdel,oblvns,ascln}.js` | `server/lobby.js` 2줄(`room.diy` 검사·welcome `diyKitted`), `tools/build-data.mjs DIY_LOCAL_INCLUDED`, `server/match/player/acquire.js` 1줄(정예화 보상) — 위 「0.2.0 병합」 |
| 선발 소환물 모델 (望 바둑돌·维什戴尔 혼령의 그림자: 웹 미러에 기본 모델이 없어 마름모로 보이던 것 → 로컬 클라이언트 추출) | `tools/local-extract/token_spines.py` → `public/assets/local/spine/token/<id>/` + `data/local-assets.json` 그룹 `spine/token/<id>`, `tools/assets/local-token-spines.mjs` → `tools/assets/local-token-spines.json` | `tools/fetch-assets.mjs` 3줄(import, `addDiyTokenAssets`, `addDiyTokenModels` → `data/assets.json tokens[id]` 아바타·`spineLocal`), `public/js/assets.js spineEntry` 토큰 분기 1줄(`spineLocal` 사용) |
| 함정형 소환물 표시 (望 바둑돌은 HP 바 없음, 望 바둑돌·사일런스 의료 드론은 방향 선택 없이 바로 배치·방향 표시 없음) | `shared/trap-tokens.js` | `render/units.js` 3줄(import, HP 바 조건, 방향 표시), `ui/facing.js` 2줄(import, `needsFacing`), `render/fx.js FX_KINDS` 1줄(`wangLink`: 바둑돌 활성화 이벤트의 기본 연출) |
| 정비 화면 HUD 공식 모양 (클라이언트 프리팹 `autochess_hud_panel`·`autochess_hud_bond_item`·`panel_prep_ready`: 라운드 띠 판·양 끝 원·휴식 기간 알약·라운드 숫자판·🔍 버튼 판, 맹약 원 = `bondBoardIcon/<활성 인원>_<현재 인원>`(활성이면 꽉 찬 원) + 숫자 판 + 이름(개수/다음 단계 배지는 숨기고 툴팁에만), 준비 완료 버튼, 맹약 줄 가운데 정렬·접기 버튼, 카운트다운, 왼쪽 플레이어 목록, 맹약 팝업, 배치 기물 정보 창) | `public/js/ui/hudArt.js`, `public/js/ui/detailArt.js`, `public/css/hud-art.css` | `screens/game.js` 3줄(import, 루트 class·style), `ui/bondStrip.js` 15줄(import, 원 판 2곳, 팝업 라벨·알약, 휠 가로 스크롤 `stripWheel` + `onWheel`), `ui/teamPanel.js` 1줄(`has-watched`), `ui/components.js` 문양 크기 변수(`natSizeVars` + `BondDisc` img onLoad), `ui/gameComponents.js` 3줄(import, `Img` onLoad, `BondGlyph`), `ui/detailPanel.js` 3줄(import 2, 카드 선택), `screens/game.js` 배치 중 카드 3줄(import, 렌더), `index.html`·`dev/game-mock.html` 각 1줄, `public/i18n/ko/ui.json` 6줄(休息一下 → 휴식 기간, 剩余可放置角色 → 배치 가능 인원: 한국 서버 표기, 激活所需人数, 法抗·阻挡·费用 → 마항·저지·비용) |
| 상점 화면 공식 모양 (클라이언트 프리팹 `autochess_shop`·`_card_item`·`_cost_item`·`_bond_item` 좌표·글꼴·색, 공식 그림: 카드 테두리·[ NO INFO ]·동결/갱신/잠김 버튼·자금 알약·접기 상자·승급 상자·가격 육각형, 카드 워터마크 = 特质 유형 아이콘, 스킬 아이콘 오른쪽 아래) | `public/js/ui/shopArt.js`, `public/css/shop-art.css` | `ui/shopBar.js` 3줄(import, 워터마크, `<section>` class·style), `index.html`·`dev/game-mock.html` 각 1줄 |
| 배치 UI 공식 모양 (3D 보드: 배치 가능 칸 초록 곱하기 틴트·공격 범위 주황 줄무늬 `sprite_attack_range`, 배치 중 기물 반투명, 방향 선택 = 클라이언트 `panel_direction_selector` 그림·주변 어둡게·취소 태그·「방향을 가운데로 되돌려 취소」 말풍선) | `public/js/render/board3d/tileOverlay.js`, `public/js/ui/placeArt.js`, `public/css/place-art.css`, `test/render/placement-ui.test.js` | `board3d/scene.js` 4줄(import, 생성, update, dispose), `render/app.js`(drawHighlight·clearHl 3D 분기, 줄무늬 그림 로드, ghost·holdPiece, `stripesUnder`), `render/units.js` 2줄(`GHOST_ALPHA`), `ui/facingWheel.js`(import, 공식 그림이 있으면 `PlaceWheelArt`, 3D 줄무늬 중복 방지), `index.html`·`dev/game-mock.html` 각 1줄, `dev/game-mock.js` `?stage=`, `i18n/ko/ui.json` 1줄, `tools/local-extract/extract.py` JOBS 2줄 |
| 전투 화면 UI 공식 모양 (2026-10-07~, 진행 중: ① 아군 체력·SP·탄환 바 + 기물 레벨, ② 적·보스·거대 보스 HP 바, 배치 방향 표시, ③ 원소 원형 바, ④ 데미지·회복 숫자, ⑤ 상태 이펙트) — 바는 발밑 아래·화면 고정 크기(1단위 = min(폭/1920, 높이/1080)), HP `#49b2e3`·SP `#caec46`·스킬 중 `#ffa800`·검정 α.5 받침, 탄환형 스킬은 탄환마다 칸, SP 가득 참 빛 없음, 전투 중 레벨 칩 없음, 정비 중 레벨 칩 = 공식 그림(`img_chess_level_N`, 크기는 `autochess_level_N` 기준), 정비 중 장비 바(장착 아이템이 있을 때만) | `public/js/render/hud-bars.js`, `public/js/render/facing.js`, `public/js/render/num-official.js`, `public/js/render/number-style.js`, `public/js/render/fxstatus.js`, `public/js/ui/numberStyleSetting.js`, `server/sim/local-hud.js`, `test/local-patch-hud.test.js` | `render/units.js`(import 1줄, `_buildHud` 2줄, `sync` 1줄, `_updateHud`의 아군 분기·칩·보호막·원소 줄 위치), `server/sim/Battle.js` 2줄(import, `snapshot()`의 `ammo`), `render/interp.js` 2줄(`ammo` → 샘플), `render/app.js` 2줄(`setEquip` 금색 여부), `server/sim/content/bosses.js`(관·현 공식 SP `skillSp` + 阿利斯泰尔 SP 노출 1줄), `server/sim/damage.js`(import, `dmg.lpNum` 2줄, 'dmg' 이벤트 5번째 칸, `absorbShields` `info` 3줄, 'blk' 2줄), `render/fx.js`(import 2줄, `damage`/`heal`의 공식 숫자 분기, update·clear·destroy 각 1줄, 헤더), `render/app.js` 4줄(`fx.damage(…, e[4])`, `case 'blk'`, import·`syncStatusFx`), `render/fxgame.js`(import 1줄, `playStatus`·`statusReady`/`statusOn`/`statusOff`, update 2줄), `render/interp.js` 1줄(`COSMETIC_EVENTS`에 'blk'), `server/sim/content/enemies.js` 2줄(import, artsBarrier 'blk'), `ui/settings.js` 2줄(import, 설정 줄), `i18n/ko/ui.json` 3줄, `tools/local-extract/extract.py` battlecommon 정규식(장비 바 그림 3개, 보스 문양·바 테·맞을 때 빛 4개, 받침 `sprite_bg`, 원소 링 14개) |
| 휴식 진입·현상 수배·전투 종료 화면 공식 모양 (클라이언트 프리팹 `round_start_dialog`·`autochess_battle_effect_choose_panel`·`card_small_item`·`card_avatar_item`·`round_result_dialog`: 라운드 시작 배너 [라운드 03 · 획득 +6], 机变/悬赏 선택 화면 제목·카드·선택 확인 막대·가져간 카드·「내 차례」, 전투 종료 배너 완벽한 작전/목표 HP 감소) | `public/js/ui/phaseArt.js`, `public/css/phase-art.css` | `screens/game.js` 9줄(import, `useRoundGold`, 결과 배너 4줄, 배너 분기 3줄), `ui/choiceOverlay.js` 7줄(import, `useTurnFlash`, `turnFlash` 2곳, 루트 class·style, 제목 `spov__name`, `spov__notice`, `YourTurn`), `index.html`·`dev/game-mock.html` 각 1줄, `dev/game-mock.js` ROUND_START 5줄, `public/i18n/ko/ui.json` 6줄 |
| 공식 전투 이펙트 (로컬 클라이언트 추출) | `tools/local-extract/fx_extract.py` → `public/assets/local/fx/**`, `public/js/render/fxplayer.js`·`fxgame.js`·`fxmap.js` | `render/app.js` 8줄(이벤트·프레임·정리 훅, 부하 단계·3D 보드 여부·전투 시계 배속 전달, `stats()`의 `fxGame`, `atk`의 화살 종류 `fxGame.arrowKind(e)`, 공식 이펙트로 그린 `fx`는 2D 대체 생략 `fxGame.ownsFx(e)`), `render/fx.js FX_KINDS` 2줄(`oblvnsNote`, `chen3Qi`) |
| 공식 스테이지 3D 씬 (스테이지별 사막·카시미어·시라쿠사 씬, 라이트맵, 필드별 숨김 세트) | `tools/local-extract/scene_extract.py` → `public/assets/local/scene/**`, `public/js/render/board3d/official.js`, `test/render/board3d-official.test.js` | `board3d/scene.js`(로더 옵션·`officialRoot`·`setStage` 분기·`highlandFor`), `render/app.js` 2곳(`loadOfficial`/`onOfficial` 옵션, `setStage`의 높이), `style.js tileTop` + `tiles.js`·`layout.js` 1줄씩 |
| 스킬 효과음 보강 (ON_SKILL_START가 없는 스킬은 ON_ABILITY_START/ON_CUSTOM_TRIGGER [start]/ON_ABILITY_ON/HIT 뱅크) | `tools/assets/skill-sfx.mjs` | `tools/assets/plan.mjs` 2줄 |
| 갱신 버튼 강조 (전략이 다음 수동 갱신에 작용할 때 테두리가 빛남: 두요야 라운드 첫 2회, 梓兰 매번, 佩佩 특수 갱신 대기, 贾维 N번째 갱신 직전) | `server/local-patch.js refreshBoost` (`privateView` 감싸기 → `shop.refreshBoost`), `public/css/refresh-boost.css` | `ui/shopBar.js` 갱신 버튼 class 1줄, `index.html` 1줄 |
| 리소스 미리 받기 카드에서 음성 언어 선택 (처음 접속할 때 한국어/일본어/끄기, 고르면 용량 다시 계산) | `public/js/resources.js` `ResourceHost`, `voice.js setVoiceLang`, `public/css/resources.css` | — |
| 얼린 상점에서 특수 갱신이 바꾼 칸도 얼림 유지 (원본은 `setShopSlot`이 항상 `frozen: false` → 佩佩·杜遥夜가 넣은 칸이 전투 시작 때 사라짐) | — | `server/match/effectsMeta.js` `setShopSlot` 2줄 (바뀌기 전 칸의 얼림 상태, 없으면 상점 얼림 상태) |
| 디버그용 재화 고정 (`SP_DEBUG_FUNDS=<0..999>`일 때 사람 플레이어 재화가 그 값으로 고정, 봇은 그대로. `local.sh`가 기본 99, 배포 서버는 미설정) | `server/local-patch.js debugFunds` (`PlayerState.prototype.funds` 접근자) | 없음 |
| 게임 내 디버그 패널 (로컬 디버그 모드만: 보드 왼쪽·맹약 줄 아래. 「디버깅용 재화 99 고정」 체크박스 = 플레이어별로 재화 고정 켜고 끄기, 선발 오퍼레이터·티어·일반/정예·스킬(S1~S3)·모듈(정예만, 없음 포함)을 골라 정비 구역에 추가) | `server/local-patch.js` `debugMode`·`debugIntent`·`debugView`(`privateView` 감싸기 → `m.private.debug`, 디버그 모드일 때만 설치), `shared/local.js`(`dbg.funds`·`dbg.addDiy` 형식), `public/js/ui/debugPanel.js`, `public/css/debug-panel.css`, `public/i18n/ko/ui.json` 7줄 | `screens/game.js` 2줄(import, 렌더), `index.html` 1줄 |
| 스킬 모드 공격·타격음 + 공식 믹서 그룹 볼륨 (2026-10-07) | `public/js/audioOfficial.js`, `tools/assets/skill-mode-sfx.mjs`, `tools/local-extract/char_modes.py` → `tools/assets/local-char-modes.json`, `test/local-patch-audio.test.js`, `test/local-patch-skill-music.test.js` | `public/js/audio.js`(import, `unit()` 모드·게인, 이벤트 루프 몇 줄, 채널 게인 2줄, 스킬 extras·잡아 둔 'skill'·替身 전환 메서드 2개), `tools/assets/audio.mjs` 몇 줄, `plan.mjs` 몇 줄, `skill-sfx.mjs`·`kit-sfx.mjs` 함수 1개씩, `screens/game.js` early 필터 1줄 |
| 스킬 중 매 공격 이펙트(공식 모드 바인딩) + 이펙트 배속 연동 + 투사체 꼬리 + 시전자 이펙트는 유닛 아래 (2026-10-07) | `shared/skill-modes.js`, `public/assets/local/fx/modes.json`(git 밖, `char_modes.py`), `test/local-patch-fxmodes.test.js` | `render/fxgame.js`(로컬 파일), `render/fxmap.js`(로컬 파일) `attackMode`·`boundEffects` |
| 이펙트·사운드 디버그 페이지 = 샌드백 아레나 (`SP_DEBUG_PAGE=1`일 때만, 배포 서버는 404 — `/js/debug/*` 포함) | `public/debug.html`, `public/js/debug.js`, `public/js/debug/arena.js`·`sandbag.js` (`/fxlab.html`은 이리로 넘김), `server/local-patch.js debugPageHidden`, `test/local-patch-debug.test.js` | `server/index.js` 2줄, `render/app.js` `debugFx` 1줄(+헤더 1줄), `render/fxgame.js` `debugPlay` |
| `/healthz` 축소 (프록시를 거친 요청은 `ok`·`version`·`app`·`build`만, 접속자·방 수는 컨테이너 안 확인용) | `server/local-patch.js proxiedRequest` | `server/index.js` 2줄(import, `/healthz` 앞 1줄) |
| 게임 결과 통계 로그 (2026-10-07: 판이 끝날 때마다 `[stats] {JSON}` 한 줄 — 모드·난이도·스테이지·보스·승패·도달 라운드·시간, 플레이어별 닉네임·봇 여부·라운드·LP·편성(id·티어·금색·장비)·맹약·전투 통계. playerId·시드는 뺌. DB·볼륨 없이 `docker logs`/OCI Logging에서 읽음) | `server/local-stats.js`, `test/local-patch-stats.test.js` | 없음 (`server/local-patch.js onMatchEnd` 1줄) |
| 라운드 작전 종료 효과음 (2026-10-07: 내 일반 전투 결과에 공식 `ui.ON_ACT1AUTOCHESS_BATTLEOVER_*` — 아래 「작전 종료 효과음」) | `public/js/audioOfficial.js battleOverOf` | `screens/game.js` 6줄(import, 결과 배너 분기) |
| ~~스킬 범위 자동 발동~~ → 0.2.0 upstream ACTIVE_RANGE로 대체 (2026-10-07, **사용자 결정·미확정** — 공식 기본 전략과 다름, 아래 「스킬 범위 발동」) | `server/sim/local-skill-range.js` | `server/sim/Battle.js` 2줄(import, `_setupKit`), `server/sim/skills.js` 2줄(`_extraTriggerSatisfied`의 `{ keys, profile }`), `content/kits/diy.js` 1줄(赤刃明霄陈 S3 `hitsFly`) |
| 오퍼레이터 배치 낙하 연출 (2026-10-07: 각 모델의 Start 클립으로 하늘에서 떨어짐 — 페이드·민트 기둥 없음, 아래 「배치 낙하」) | — | `render/units.js`(`onDeploy`, 모델 늦게 로드 시 클립 따라잡기, 어두운 첫 프레임, impostor), `render/fx.js` 1줄(`fx.deploy`가 `bornOfficial`이면 생략), `render/app.js` 6줄(벤치 도착·보드→벤치 복귀도 낙하, 미끄러짐 없이 목표 칸에서) |
| iframe 차단 헤더 | — | `server/http/common.js setSecurityHeaders` 3줄 (0.2.0 분할 전 `server/index.js`) |
| 나가기 창에서 「暂离（AI 托管）」 숨김 | — | `ui/matchChrome.js` (`AWAY_OPTION = false`) — 나가면 자리를 포기한다 |
| 맹약 스택 세 자리 줄바꿈 수정 | `public/i18n/ko/ko.css` | — |
| ~~협동 보스 HP = `bloodPoint` × 생존 인원~~ (0.2.0 upstream이 같은 규칙 — 패치 제거) | — | — |
| 제국의 갑주 등장 폭격·3연타 PRTS 수치 | `server/sim/content/local-patch.js` | `server/sim/content/index.js` 1줄 (`DOMAIN_NAMES.push`) |
| ~~胄 드론 연동 피해를 限伤에서 제외~~ (0.2.0 upstream이 처리 — 패치 제거) | — | — |
| 성당 검사(圣堂剑士) 탄약 소모 스킬·탄약 표시 (2026-10-06) | `server/sim/content/local-patch.js` | 위와 같음 + `server/sim/snapshot.js unitTuple` 1줄(`e.lpAmmo` → SP/SP 최대), `render/units.js` 2줄(SP가 있는 적도 막대 표시, 적은 「준비」 빛 없음) |
| 더블린 그림자 캐스터(·리더) 외 27종은 비행 아군을 공격하지 않음 (2026-10-06, 아래 전수 조사; 자로는 2형태만) | `server/sim/content/local-patch.js` (`NO_AIR_KEYS`, `NO_AIR_FORMS`, `beforeAttack` 재필터) | 위와 같음 |
| 频次(특수 HP, "N회 피해로 격파") 적에게 隐德来希 효과가 한 번에 여러 칸을 깎던 것 (2026-10-06, 원본 버그 — 원본 PR 후보): 萃血 최대 HP 흡수는 频次 적에게 안 걸림(PRTS 萃血 비고 「无法对…拥有特殊生命值机制的敌人…生效」), 心烛가 받은 피해를 원래 적에게 넘길 때 频次 적이면 출처 없는 진실 피해 1회(=1)로(PRTS 비고 「无来源真实伤害…如特殊生命值机制」) | — | `server/sim/content/kits/tier5.js` 隐德来希 2곳(萃血 조건 1줄, 心烛 전달 2줄) |

`server/sim/content/local-patch.js`는 시뮬레이션 모듈이라 서버와 브라우저(클라이언트가 돌리는 보스·히든 전투) 양쪽에서 실행된다.
`server/local-patch.js`는 서버 전용이다.

## 게임 수치 수정 상세 (2026-10-05)

### 협동 보스 HP
> 0.2.0: upstream이 같은 협동 규칙을 넣어 우리 패치를 뺐다. 싱글은 upstream이 ×1로 바꿨으나 우리는 ×0.25로 되돌렸다(91900cf5,
> 사용자 결정 2026-10-07 — 위 「0.2.0 병합」). 아래는 기록.
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
> 0.2.0: upstream이 드론 몫을 限伤 밖으로 처리해 `exemptDroneLink`를 뺐다. 아래는 기록.
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
- 로컬 2 — 정비 단계 대사(원본은 휴식기 무음): 말을 **탭(선택)하면** 선택(`select`) — 이미 선택된 말을 다시 탭해도(사용자 2026-10-08 실제 게임
  「선택된 오퍼를 재선택해도 대사가 나와」). **배치하려고 드래그할 때는 대사 없음**, **상점 구매·정예화 보상·특수 제안으로 얻을 때도 배치 대사 없음**
  (배치 효과음만 — 사용자 2026-10-08 卫戍协议 영상 확인, 예전 「구매 때 배치 대사」 전달을 바로잡음; `voiceForBuy` 삭제). 전투 중 유닛 탭도 매번
  선택 대사(`voice.js voiceForUnit`, 오퍼레이터만) — 원본 상세 패널의 「대상당 한 번」(`voice=${combat}`)을 대신함(원본 `docs-consistency` 단언 하나가
  이것과 어긋남 — merge-0.2.0 테스트 정리 목록). 원본 `audio.voice()`의 게이트를 그대로 거친다(`unitKey` `prep:…`/`battle:…`).
  **벤치의 오퍼레이터를 보드에 놓으면 배치 대사**(`place` = PLACE_CHAR; 사용자 재제보 2026-10-08 2-5 「오퍼가 보드에 배치될 때 배치 대사가 안 나옴」,
  사용자 결정 2026-10-08: 벤치→보드만): 방향 휠 확정(`screens/game.js commitFacing`)이 보드 밖에서 온 오퍼레이터를 기억했다가 그 말이 보드에
  떨어질 때(`pieceDeploy`, 3초 안) `voice.js voiceForPlace` — 배치 효과음과 같은 순간. 보드 안 이동·벤치 복귀·전투 뒤 정비 복귀·자동 배치·소환물은
  대사 없음. 근거: 클라이언트 정비 말 관리자 `AutoChessDummyManager._OnCharacterPlaced(placeToBattle, placeToHand)` → `_PlayAudioWhenCharacterPlaced`
  (이름만 — 그 소리에 대사가 들어 있다는 것은 사용자 플레이 기억 [추정]). 확인: 실제 솔로 판 실제 마우스 끌기 + 방향 확정
  (`sp-check\sd_check.mjs`) → b_char_set + 배치 대사, 자동 배치·정비 복귀는 대사 없음. 단위 `test/local-patch.test.js` 「部署 line」.
  확인: Windows `sp-check\vr_voice.mjs <port> <out>`(실제 솔로 판: 상점 카드 클릭 구매 → 배치음만, 탭 3번 → 선택 대사 3번, 드래그 → 없음).
  **0.2.0 선발·补位 (2026-10-08 세션 K, K-1·K-2)**: 0.2.0의 선발 슬롯 기록(`chess_char_*_diy*`)은 `charId`·`assets`가 비어 있어 정비 탭이 말이 없었고,
  补位 기물은 대체된 원래 오퍼 목소리로 말했다 → `screens/game.js`가 내 기물이 보여 주는 기록(`ownShown`: 선발 픽의 오퍼, 补位는 대체 오퍼 — 预备干员은
  음성 뱅크가 없어 전투 중 탭처럼 조용)을 `voiceForPiece(piece, shown)`에 넘긴다. 스킬 대사 유형(`voicePolicy skillOf`)도 슬롯·원래 오퍼의 스킬을 봐서
  자동 스킬이 모두 수동(70, 쿨다운 없음)이었다 → `voice.js unitSkillOf`: 유닛 모델(`spine`)이 기록의 `charId`와 다르면 그 캐릭터의 기물 상태 폼
  (`data/backups.json`, 스킬 번호)으로 — 望 S1/S2·阿斯卡纶 S1은 SKILL_PASSIVE_IMP, 维什戴尔 S1은 _NOR. `voiceForPlace`는 렌더 정보의 `spine`을 써서 원래 맞음.
  확인: 실제 솔로 판 `sp-check\k_voice.mjs <port> <out>`(전부 补位 + 디버그 패널 선발 3명, 마우스 탭, 4라운드), 단위 `test/local-patch.test.js` 「自选 / 补位」.
- 이전 로컬 패치에서 뺀 것: 작전 개시(무작위 한 명)·스킬 대사·자체 겹침 규칙·자체 음량 — 원본 것으로 대체.
- 로컬 3 — 공식 재생 규칙(2026-10-06, 사용자 결정; `public/js/voicePolicy.js`를 `voice.js`가 설치, `audio.js`에는 훅 몇 줄):
  클라이언트 `audio_data.json battleVoice` 값 그대로 — 전체 간격 없음, 우선순위(행동출발 100·행동개시 90·수동 스킬 70·자동 스킬 60/50(SP 10 이상/미만)·
  배치 20·선택 10), 같은 우선순위는 유형이 겹침 허용(행동출발·수동 스킬·배치·선택)이면 앞 대사를 끊고, 아니면 버림, 쿨다운은 자동 스킬 10초만(오퍼레이터별).
  원본 #73의 1.2초 간격·「+10 이상이어야 끊음」·모든 스킬 10초/70은 공식 값과 달라 스킬 대사가 많이 빠졌다(데이터로 확인).
  선택 대사 쿨타임(사용자 질문 2026-10-08 「한 오퍼를 여러번 선택시 쿨타임이 없는 것 같은데 공식은?」): 공식에도 없다 — `audio_data.json battleVoice`
  FOCUS_CHAR `cooldown 0`·`overlapIfSamePriority true`(데이터), 卫戍协议 `AutoChessGameModeVoicePlugin._OnCharacterHighlighted`(이름) → 다시 선택하면 재생 중
  선택 대사를 0.1초 크로스페이드로 끊고 새 대사. 우리도 같다(원본 #73의 선택 1.5초 쿨다운은 이 규칙으로 이미 빠짐). 선택이 「강조가 바뀔 때만」인지(이미
  강조된 말을 다시 집을 때)는 네이티브라 확인 못 함 [추정: 집을 때마다]. `test/local-patch.test.js` 「official scheduling」.
  대사 우선순위(사용자 2026-10-08 실제 게임: 「스킬 발동 대사가 나오는 중에는 오퍼 선택 대사가 재생되지 않아」): 위 게이트가 이미 그렇다 —
  선택(FOCUS_CHAR 10)은 스킬(70) 재생 중이면 버림, 스킬은 선택을 끊음, 같은 우선순위는 `overlapIfSamePriority`대로(데이터). 클라이언트 이름:
  `BattleVoiceOption`·`BattleVoiceType`·`CheckIfNeedPlayCharVoiceFromSingleSelect`(로직은 네이티브 — 「낮은 우선순위는 높은 것을 못 끊는다」는
  필드 이름 priority/overlap에서 본 [추정]; 데이터에 `NORMAL_ATTACK` 5·쿨다운 36000초도 있으나 우리는 평타 대사 없음). Chrome 확인 `vr_prio.mjs`:
  스킬 대사(4.6초) 중 선택 → 버림, 끝난 뒤 선택 → 재생, 선택 중 스킬 → 끊고 재생.
  클래스·필드 이름으로 추론해 사용자가 공식대로 정한 것: 작전중 대사는 1~4 중 무작위(`LoadRandomVoiceList`), 행동 개시는 전투당 1번
  (`m_encounterFirstEnemyFlag`, 버려진 시도는 3초 뒤 다시), 전투 시작은 한 명만 행동출발이고 나머지 첫 배치는 말하지 않음
  (`AutoChessGameModeVoicePlugin._OnCharacterPlacedAtBattle`; 2초 뒤 재배치는 배치 대사). 원본 테스트는 원본 `VoiceGate` 그대로라 깨지지 않는다.
- 로컬 4 — 결산 대사는 승리 결산 화면에서만(2026-10-07, 사용자: 공식 게임 플레이 확인): 원본은 전투가 끝날 때마다 결산 4종 중 하나를
  말하지만, 공식은 라운드가 끝나도 말하지 않고 보스를 처치한 결산 화면에서 작전 종료 대사를 말한다. 도중에 탈락한 플레이어는 말하지 않는다.
  `screens/game.js onResult`는 원본이 고른 대사(`resultVoiceSlot`, 화자 `resultSpeaker` — 자기 전투의 오퍼레이터)를 재생하지 않고
  `voice.js holdResultVoice`로 보관(마지막 전투 것이 남음, 매치를 떠나면 비움) → `screens/result.js`가 결산 화면에서 `playMatchEndVoice`:
  `victory`이고 자기가 살아 있으면 한 번 재생. 승리에 행동 실패 대사는 붙지 않는다(숨은 핵심 라운드를 진 경우) → 비3성 대사.
  서버는 마지막 전투 뒤 3초(`DELAYS.SETTLE`) 후 `m.result`를 보내므로 마지막 전투의 결과가 먼저 보관된다.
  확인: `test/local-patch.test.js` 「结算 lines wait for the won settlement」, 브라우저(game-mock 결산: 승리 1회 재생, 탈락·패배 무음).

## 선발 오퍼레이터 (2026-10-05)
> 0.2.0부터 upstream 「自选」 틀 위에서 동작한다(위 「0.2.0 병합」). 이 절의 데이터·풀·UI 설명(`data/diy.json`, 전용 풀, `diySlots.js`)은
> 지난 구현 기록이고, 키트 동작과 사용자 결정은 `kits/ops/op-*.js`로 그대로 옮겨졌다.
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
      **돌아올 때 재고를 쓰지 않는다** — 놓은 돌은 전투 내내 소모 → DP 내고 복귀를 되풀이한다(2026-10-08 사용자 결정, `op-wang.js
      RETURN_USES_STOCK`(false)). 근거: PRTS 卫戍协议/帮助 「若召唤物在战斗期间退场，将在满足条件后立即原地再部署1个」(재고 언급 없음), 사용자 기억
      (「코스트를 소모하면서 놓이는 바둑알 때문에 스와이어 이격이 퇴각했다」), 아래 영상의 DP 감소. 실제 경기 경로 확인: m04 3·4라운드에서 望(돌 6개) +
      琳琅诗怀雅면 돌 복귀 DP 때문에 行商 지불이 막혀 琳琅诗怀雅가 퇴각한다. 전투 시작 재고 = 배치 한도 − 정비 때 놓은 수(다 놓으면 0) — 이제
      S1/S2 「즉시 2개 획득」의 새 돌 자동 배치에만 쓰인다. 배치 한도는 6, 모듈(`uniequip_002_wang`, VI 정예)이면 7
      (토큰 `byModule` stats — 키트가 정규화된 `stats`에서 읽어 늘 6이던 버그를 2026-10-08 `stoneLimits`로 고침; 정비 손패는 이미 7장이었다).
      跟子는 소모되면 끝.
      - 이전 규칙(2026-10-07 ~ 2026-10-08, `RETURN_USES_STOCK = true`): 돌아올 때마다 재고 1개를 썼다(사용자가 기억하던 함정술사 규칙).
        정비 때 다 놓으면 재고 0 → S1(21초)까지 아무 돌도 안 돌아오고, S3면 전투 내내 안 돌아왔다 — 2026-10-08 사용자 제보 「휴식 기간에
        배치된 바둑알 빼고 새로 놓이는 바둑알이 없다」로 되돌림. 그 전(2026-10-06 ~ 2026-10-07)이 지금과 같은 규칙이었고, 더 전 모델(재배치마다
        재고 1개, 재고 7 − 놓은 수)은 2026-10-06 사용자 보고 「돌이 다시 놓이지 않는다」로 바꿨던 것.
      - 영상 확인(2026-10-07~08, 위수협약 플레이 영상 「왕 S3.mp4」, OpenCV 템플릿 추적 + 구간 확대; 레벨 6 VI 정예 왕 = 모듈, 배치 한도 7):
        정비 때 돌 7개 — 아래 줄 왼쪽 2·오른쪽 2, 위 줄 3(사용자 확인 2026-10-08; 처음 분석은 위 줄을 놓쳐 5개로 잘못 셌다). 전투 시작
        (7.5–9.0초)에 돌이 약 0.5초 간격으로 하나씩 나타난다. 아래 오른쪽 2개와 위 오른쪽 1개가 9.5–10.1초에 발동·소모된 뒤 그 칸들은 영상 끝
        (29.7초)까지 비어 있고, 아래 왼쪽 2개·위 왼쪽 1개(적이 오지 않는 칸)는 끝까지 남았다(위 가운데는 오퍼레이터에 가려 판단 못 함).
        한도 7을 다 놓아 재고 0 → 「소모된 돌이 돌아오지 않는다」와 맞다(2026-10-07 해석). 2026-10-08 결정 뒤의 해석 [추정]: 빈 칸으로 보인
        것은 돌아온 돌이 x-1 마름모 안의 적에게 곧바로 다시 발동·소모됐기 때문일 수 있고, 아래 DP 감소가 그 복귀 비용과 맞는다 — 영상만으로는 못 가린다.
        [불확실] 10초부터 DP 카운터가 약 1.5초마다 2–3씩 줄어든다(10→11→9, 10→8, 10→7, 8→6, 8→5 …, S3 중 3→0). 바둑돌 DP(3, 모듈 2)와
        비슷하지만 놓인 돌이 화면에 남지 않고(보스 그림에 가려진 칸이면 안 보임), 다른 오퍼레이터의 소비일 수도 있어 판단하지 않았다.
        S3(24.3초~): 보스 쪽에 마름모 테두리(`x-1`)의 초록 폭발이 0.5–1초 간격으로 반복된다. 이 영상은 S3 판이라 S1/S2 보충은 확인할 수 없다. 실제 경기 경로 테스트: `test/local-patch-diy.test.js` 「six prep stones = no stock」.
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
      배치 불가 지상 > 배치 가능 지상 > 배치 가능 고지대(배치 불가 고지대에는 안 놓임), 모두 같으면 PRTS 순서 위 > 오른쪽 > 아래 > 왼쪽
      (화면 기준, 좌우 반전된 필드에서는 좌우가 바뀜; 2026-10-07 사용자 결정 W8 — 이전엔 클라이언트 `_alwaysRandomInTheEnd`의 무작위였다.
      같은 날 사용자가 인게임에서 이 우선순위를 확인). 쓰러진 오퍼레이터가 누운 칸(`Battle.downOn`)에도 안 놓인다(upstream과 같게,
      2026-10-07 사용자 결정). 연결에 참여하고 피해 출처는 망.
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
      적이 선 칸 우선(방어 지점까지 남은 경로가 짧은 적 순 — 아래), 나머지는 무작위, 기존 돌과 붙을 필요 없음. 탄약 20발: S3 중 돌 1개를
      배치하면 **재능 跟子 1개(무료) + S3 跟子 최대 3개(1개당 1발)** — 배치 1번에 최대 3발(PRTS 「第一天赋额外至多部署3枚棋子并消耗等量弹药」,
      나무위키 「최대 3개의 바둑돌은 배치될 때 탄약을 1발씩 소모」; 2026-10-07 사용자 결정 W12, 같은 날 인게임에서 확인). 이전(2026-10-06):
      跟子 최대 4개 전부 1발씩(클라이언트 SpawnTokenS3InSkill BuildStone 카운터 `_countEvent 4, _expendPerTrigger 1`).
      끝나는 조건은 재고 소진·탄약 소진·수동 종료뿐이고, 남은 탄약은 돌로 돌아온다(엔진 `end()`가 onEnd 전에 `ammoLeft`를 0으로 만들어 이전엔
      반환이 늘 0이었음 → 킷이 따로 기억, 손패 7장까지). **정비 단계에 돌을 하나도 놓지 않았으면** 아무것도 충전·배치하지 않고 끝나지 않는다
      (사용자 실제 게임 관찰 2026-10-06; 자료에는 직접 문장 없음). 소모된 돌의 재배치도 재고를 쓴다(위) — S3 중 재고가 0이면 기다린다.
    - [추정] 위수협약 전투에는 수동 배치가 없어서, 재고의 돌은 자동으로 배치한다(필드의 돌이 maxDeployCount 6 미만일 때만): S1/S2는
      기존 돌 옆, 적 경로 위, 적이 없는 칸(특성), 적에 가까운 칸; S3는 1초에 1개 — 사거리 안 적이 선 배치 가능 칸(방어 지점까지 남은 경로가 짧은 적 순. [추정] 사용자 결정 2026-10-06: 공식 문구는 「优先部署在范围内敌人所在位置」뿐이고 클라이언트 `WangTileSelector`(SKILL_3_INSTANT, `_tileSortType` DONT_SORT)의 정렬은 네이티브, PRTS는 적 유무·지형 순서만 — 적끼리의 순서는 기본 공격 대상 규칙(`remainingDistance`, 같으면 먼저 나온 적)으로 채움. 이전엔 왕에게 가까운 순), 그런
      칸이 없고 필드에 적이 있으면 사거리 안 빈 칸(지상 경로 우선, 적에 가까운 순, 걷는 적이 없는 칸), 주변 跟子 1개당 탄약 1발.
      (2026-10-06 사용자 보고 「S3 탄약이 줄지 않는다」: 적이 사거리 밖으로만 지나가는 배치에서는 놓을 칸이 없었고, 적이 선 칸은 소모된 돌의
      제자리라 `isReservedTile`에 막혔다 → 그녀의 대기 중인 돌 자리는 막지 않음. UI의 탄약 막대는 엔진 `ammoLeft`를 그대로 쓰고 킷이 같이 갱신한다.)
      S3 중 소모된 돌이 제자리로 돌아오는 것도 그녀의 배치로 친다: 재능 跟子 1개 + S3 跟子 최대 3개(1개당 탄약 1발), 그녀의 사거리 안이면
      적이 선 칸에도 돌아온다(W10)(2026-10-06 브라우저 재현 — 정비 때
      6개를 놓으면 필드가 늘 가득 차 S3 대체 배치가 한 번도 일어나지 않아 탄약 막대가 가득 찬 채였고, S3 시작 때 InstantSpawn 跟子 1개만 주변 없이
      보였다. 수정 후 브라우저에서 라운드 5 S3: 탄약 16 → 12 → 9 → 5 → 2, 막대 45.6 → 5.7/57). 필드가 가득 차면 S3는 멈추지 않고 기다린다(이전의 자체 종료는 근거 없어 삭제 — 일찍 끝나던 원인). 소모돼 재배치를 기다리는 돌이 먼저이고, 새 칸은 그다음이다. 재고에서 놓는 돌도 DP를 낸다.
    - 취세: 정지 + 망 공격력 × atk_scale 마법/초(발동마다 독립). 연성: 연결 방향(상하 → 세로, 좌우 → 가로, 한번 켜지면 유지) 양쪽 3칸 적에게
      마법 피해 + 감속. 料敌机先: 직선 위 돌 수만큼 피해 +%, 마법 저항 고정 수치 무시(최대 3). 중첩은 돌마다 본 최장 직선으로 고정
      (3개 중 1개가 사라져도 남은 돌은 3중첩). 값은 데이터: 일반·V단계 정예 10%/9, VI단계 정예(모듈 3) 13%/12.
    - 跟子를 진짜 바둑돌이 아닌 투사체로 둔 근거: PRTS 「通过天赋'额外部署的棋子'实为望自身发射的弹道 由此其不具有单位相关的性质（例如占据空位等）」.
      화면에는 바둑돌 모델로 보이고 연결·발동·피해는 같다. 손패를 쓰지 않고 배치 한도 6에 들지 않아 정비 때 놓은 돌을 퇴각시키지 않는다.
    - **跟子가 제자리에 있으면 돌이 기다린다 (사용자 제보 3차 2-3, 사용자 결정 2026-10-08, [추정])**: 跟子가 칸을 차지하지 않아서
      (`_occ` 비움, PRTS 「不占据空位」), 소모돼 기다리던 놓은 돌이 제자리로 돌아올 때(`Battle.redeploy`는 `_occ`만 본다) 이웃 돌의 등장 때
      그 빈 제자리에 놓인 跟子 위로 돌아왔다 — 한 칸에 돌 둘(실제 매치 경로 990판 중 292판, 겹침은 모두 이 한 종류). 이제 `redeployUsed`가
      제자리에 그녀의 跟子가 있으면 그 돌을 건너뛰고, 跟子가 사라진 뒤 돌아온다(S3 배치가 제자리에 새 돌을 놓았을 때 기다리는 기존 규칙과
      같음). 공식 근거 없음(클라이언트 跟子 선택기에 돌·대기 칸 옵션 없음). 버린 안: 「跟子가 대기 칸을 피함」 — 줄 배치에서 S3 탄약이 거의
      안 줄어 2026-10-06 보고가 재발. 회귀 테스트: `test/local-patch-diy-wang.test.js` 「望 stones never share a tile」(매 틱 「겹침 0」).
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
- 프리팹·스프라이트 읽기 도구(2026-10-07): `tools/local-extract/ui_inspect.py` (`src/.venv-extract`, `python -I`).
  `prefab <번들> <GameObject>` = RectTransform 트리(앵커·위치·크기·피벗) + Image 스프라이트·색, Text 글자 크기·정렬·줄 간격·레이아웃 값,
  `sprites <번들> [이름 일부…]` = 스프라이트 rect·텍스처 rect·오프셋(tight 패킹이면 웹 PNG에 여백이 없다 — 맹약 문양 128 rect / 텍스처 ~100).
  번들은 경로 또는 클라이언트 `PersistentData/Bundles` 아래 경로(예: `ui/autochess/[uc]autochessbattle.ab`).
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

## 공식 맵 렌더링 (2026-10-07)
사용자 제보 「맵 렌더링이 공식 게임 클라와 어긋나는 부분」(KR 캡처 7장: `research/2026-10-07-map-render/`). 근거는 EN 클라이언트
(`battle/prefabs/effects/map.ab`·`common.ab`·`tile.ab`, 셰이더 `[uc]shaders.ab` 바이트코드, `ui/autochess/[uc]autochessbattle.ab`)와 캡처 numpy 측정.
- **활성 오리지늄**(`tile_infection`, act1 m04의 8칸): 바닥은 보통 모래 칸이고 데칼(테두리·점선 원호·결정·WARNING 스티커)은 씬의 `S_patch_hide*` 쿼드라
  이미 그려지고 있었다 → 공식 씬에서는 원본의 절차 크러스트(`infectionMaterial`)를 덧그리지 않는다(`board3d/scene.js _buildTerrain({ infection: false })`).
  - 타일 이펙트 `map_promote_01`(Tile `_effect`): 칸 둘레에 선 쿼드 4장, 머티리얼 `map_promote_04`(Dissolve 셰이더: 붉은 줄 `flow_26`이 벽을 타고 흐름,
    `mask_123`로 위가 사라짐) → `board3d/infection.js`(수치는 파일 머리말). [추정] 늘 켜져 있음(게이트처럼 Tile `_effect`).
  - 버프 표시 `common_acute_infection_buff_01`(타일 버프의 overrideEffectKey): 머리 위 붉은 「!!!」(`kuangre_01` + `star_02` 빛, 0.667초 맥동) →
    `render/infectionMark.js`(Pixi, 유닛 위 `layers.bars`). 사용자: 「해당 타일 위에 오퍼레이터를 배치했을 때」. 시뮬레이션은 이 버프를 클라이언트에 알리지
    않으므로 화면이 위치로 정한다: 정비 = 그 칸에 놓인 기물, 전투 = 이번 전투에 그 칸을 밟은 지상 유닛(버프가 마지막 접촉 뒤 300초 — 전투 끝까지).
    [추정] `_spawnLocation 4` = 유닛 머리 위, 크리스탈 같은 반짝임은 데이터에 없어 오퍼레이터 스킬로 봄.
  - 텍스처 추출: `.venv-extract/bin/python -I tools/local-extract/boardfx_extract.py` → `public/assets/local/board/fx/`(4장) + manifest `board/fx`.
- **외곽 하늘색 점선**(`_buildEdges`): 클라이언트에 해당 오브젝트가 없고 캡처에도 없다 → 공식 씬에서는 그리지 않는다(절차 보드는 원본 그대로).
- **공격·방어 포인트**: 클라이언트가 쓰는 건 `tile.ab`의 `tile_start`/`tile_end`(우리가 읽는 `[pack]map.ab` start_box/end_box는 그림만). tile_start는
  Start_up을 가산 + 알파 블렌드로 두 번, tile_end는 Start_up1을 둘 다, 둘 다 _TintColor 1·색 애니메이션 없음 → 알파 블렌드 패스 추가, 맥동 제거
  (`GATE_ADD` start 0.2 / end 0.5 [추정 — 캡처에 맞춤]). 캡처의 시작 상자는 경고 삼각형·모서리 점선까지 빨강이라(텍스처 변형은 모두 흰색) 붉은 틴트
  `GATE_START_TINT` (1, .22, .25) [추정]. 이전: 시작 = 분홍빛 흰색 255,180,200, 끝 = 진한 파랑 53,162,254 / 공식 229,63,60 · 136,226,249.
- **밝기**: 같은 스테이지 영역 비교에서 중간 톤은 같고(모래 0.964) 밝은 모래 윗면이 하얗게 날아감(R ≥ 250 픽셀 13.6 % vs 공식 5 %) →
  `official.js OFFICIAL_LIGHTING` directGain 0.9·lmGain 0.97 [추정](씬의 `AE_Survivaloasis` 프로필은 네이티브라 못 읽음). 내 캡처 기준 날아간 픽셀 7.9 → 3.9 %.
- **드래그 중 벤치 틴트**: `screens/game.js`가 드래그 시작 때 필드 칸만으로 하이라이트를 덮어써서 벤치가 빠져 있었다 → 놓을 수 있는 벤치 칸(자기 칸 포함)도 넣는다.
  벤치는 청록 2× 곱하기 `tileOverlay.js BENCH_TINT` (0.29, 0.55, 0.65) — 클라이언트 상수 `AUTOCHESS_VALID_HANDTILE_CUSTOM_HIGHLIGHT`는 네이티브라
  값이 없어, 사용자 캡처(아이템 드래그 중 벤치 전체가 청록: 판자 245,198,138 → 140,215,177)에 맞춤. `app.js syncOverlay3d`가 7·8행(일반 정비)을 벤치 틴트로 보낸다.
- **장비 장착 팝업** (`ui/equipHover.js`, `css/equip-hover.css`): 아이템을 장착 가능한 오퍼레이터 위로 끌면 뜨는 2칸 알약 — 프리팹
  `act1autochess_equip_slot_panel`(UIAutoChessDragEquipPanel) 그대로: 루트 배율 .8, 알약 334×152가 기준점 120단위 위, 칸마다 #1e1e1e 상자·아이템 아이콘·
  흰 테두리(`img_EquipSlot_frame2` 9-slice), 아이템이 들어갈 칸(= 장착 수 번째)은 `frame3` + `SlotGlow` × #55ffeb 가산 맥동(1 ↔ .4, .7초), 두 칸 다
  차면 빨간 괄호(`frame1_red`) + 붉은 막(`img_EquipSlot_glow` α.71) + 교체 아이콘 + 「장비 교체」(문구는 실행 중에 정해져 데이터에 없음 [추정]) → 놓으면
  기존 교체 창. 등장(.333초)·닫힘(.4초)·장착 플래시(칸 1.333배 튐 + 청록 채움, .417초)는 프리팹 클립 값. [추정] 기준점 = 칸 화면 깊이의 .7(캡처: 알약 아래 ≈ 칸 뒤쪽 가장자리).
  그림은 `ui/battle` 그룹(extract.py 기존 추출)이고 없으면 팝업 없음(원본 그대로). 정비 중 기물 위 장비 바(전투 UI 세션 `hud-bars.js EquipBar`)와는 별개.
- 확인: Windows Chrome `dev/game-mock.html?stage=act1autochess_m04` 캡처(대기·오퍼레이터 드래그·아이템 드래그 4가지 대상·놓기·「!!!」), 테스트
  `test/local-patch-map.test.js`. 남은 것: 전투 중 「!!!」 실제 대전 확인, 시작 상자 삼각형·점선 색(캡처 해상도 한계), 공식 「장비 교체」 문구.
- 서버에 올릴 것(git 밖): `public/assets/local/board/fx/`, `data/local-assets.json` → `build-browser-resources.mjs`.

## 전투 화면 UI (2026-10-07, 진행 중)
사용자 요청 「전투 화면 UI를 공식 인게임과 똑같이」: ① 아군 체력·SP·탄환 바 + 기물 레벨 → ② 적 HP(보스 포함) → ③ 원소 원형 바 → ④ 데미지·회복 숫자 순서,
항목마다 근거를 보여 주고 사용자 확인 뒤 고친다. 상태 표시(寒冷 눈꽃·冻结 얼음 블록·战栗 주먹·은신·위장)도 사용자 요청으로 뒤에 추가.
근거: EN 클라이언트 `arts/ui/[uc]battlecommon.ab`(바 프리팹·스프라이트), `battle/[pack]common.ab`(`hud_unit`, `damage_text`, `heal_text`),
`ui/autochess/[uc]autochessbattle.ab`·`battlecommon`의 `act1autochess_battle_dummy_hud_plugin`(정비 칩) — `tools/local-extract/ui_inspect.py`로 읽음 —
과 사용자 중국 서버 캡처(2000×1125, numpy 측정). 캡처 원본은 세션 scratchpad `cap/cn-battle-4~8.png`, `cn-status-*.png`.

**크기 단위 (사용자 결정 2026-10-07 「제시한 기준대로」)**: 공식 유닛 HUD는 화면 공간 캔버스라 카메라·원근과 상관없이 같은 크기다 —
캡처에서 앞뒤 줄(칸 간격 168 / 177 px)의 바가 모두 128~129 px = 프리팹 125단위 × 2000/1920. → 1단위 = `min(폭/1920, 높이/1080)` CSS px
(`hud-bars.js hudUnit`; 16:9가 아닌 화면의 맞춤 방식은 CanvasScaler 값을 못 찾아 [추정]). 해상도에 비례: 1280×720 83px, 1920×1080 125px, 4K 250px.
예전 바는 칸 크기 × 0.64(24~96px 제한)라 뒷줄이 작고 4K에서 공식의 약 40 %였다.

**① 아군 바** (`AllyBars`, 아군 = 오퍼레이터·소환물):
- 위치: 프리팹은 `hud_unit` 중심에서 HP 바 중심이 54.5단위 아래. `hud_unit` 중심 = 발(배치 링 중심, 신발이 서는 곳) 위 24.5단위로 둔다(`HUD_ANCHOR`, [캡처]) —
  처음엔 발 = `hud_unit`로 54.5 아래에 그렸더니 낮았다(사용자 확인 + 캡처 13). 캡처 5 / 6 / 13에서 링 중심 → HP 중심 27 / 29 / 33.7단위 → 약 30단위.
  정비 칩·장비 바도 같은 기준점(캡처 4의 칩도 프리팹 자리보다 약 16단위 위). 예전에는 머리 위.
- HP 125×7 `#49b2e3` α.7, 그 뒤에 최근 깎인 만큼 흰색 α.7(`slider_back`, 예전 잔상 계산 그대로). 30 % 미만 노랑은 공식에 없어 뺐다.
  SP 125×7을 HP 바로 아래(간격 0): 충전 `#caec46` α.7, 지속형 스킬 중 남은 시간 `#ffa800` α.7(`char_sp_cast_slider`).
  받침 = `sprite_bg`(9-slice, 테두리 4/5): 검정 α.70 가운데 + 4~5px 부드러운 그림자, 검정 α.5 틴트 → 가운데 α.35. 프리팹은 받침을 바보다 8.6 × 10.32 크게
  (133.6 × (14 + 10.32)) 두는데 그 여분이 바로 그림자 폭이라, 가운데는 바 밑에 깔리고 바깥엔 부드러운 그림자만 보인다 — 사용자 「불투명도가 들어간 바 위에 색 바」
  (캡처 14). 처음엔 딱딱한 1단위 여백을 줬다가 테두리처럼 보여 없앴었다. 그림(로컬 추출)이 없으면 바 크기 그대로 α.35 사각형.
- SP 가득 참 빛 없음(사용자 결정: 캡처에 없고 자동 발동이라 순간).
- 탄환형 스킬(사용자: 「탄환 개수에 따라 bar가 나뉜다」): `char_bullet_bar` 받침 `#e56d00` α.31 위에 남은 탄환마다 칸. 칸은 코드(UIBulletBar)가 만들어
  프리팹에 색이 없다 — [추정] 캡처 측정: 색 ≈ `#ffa800`(G 168 일치), 간격 2단위(7발: 16~17px 칸 2px 간격, 19발: 약 4.5px 칸 같은 간격). 칸이 1px보다 좁아지면 남은 비율 한 줄.
  탄환 수는 시뮬레이션이 `b.snap.ammo = [[id, 남은, 최대]]`로 넘긴다(`server/sim/local-hud.js`; 시뮬레이션은 브라우저에서 돈다 — `battle/runner.js`).
  성능(사용자 요청 점검): 유닛 48개 전투에서 `ammoList` 0.5µs/스냅샷 = 스냅샷 전체(22.5µs)의 2.2 %, 칸은 `Texture.WHITE` 스프라이트라 배치가 늘지 않는다.
- 보호막 줄(`UF.SHIELD`)은 공식 근거가 없어 HP 바 바로 위 얇은 줄로 유지. 상태 아이콘 줄은 머리 위 그대로(상태 표시 단계에서 바꿈).
- 원소 줄은 ③ 전까지 바 받침 아래로만 옮김.

**기물 레벨**: 전투 중에는 없다(캡처 5·6·8 — 사용자 확인 「전투중에는 안나와」). 정비 중은 `shop_hud`의 `chess_level_icon`
(`autochess_level_N`, rect 42 / 텍스처 37.85, 루트 배율 1.25, 발에서 (-45.5, +128)단위). 그 그림은 38px라 1.25배로 키우면 흐렸다(사용자 「화질이 좀 낮아보여」) →
같은 디자인의 상점 카드 칩 `img_chess_level_N`(45px; 숫자가 어두운 안쪽의 0.53 × 0.70 — 두 그림 같고 캡처 4는 0.51 × 0.69)을 쓰고, 안쪽 39px를 공식
30 × 1.25 = 37.5단위에 맞춘다(캡처 4 안쪽 39px = 37.4단위). 웹 manifest `shopCard/` → 로컬 `ui/battle` → `autochess_level_N` → 없으면 원래 그린 칩(PR 가능 유지).
칩 위치·크기는 사용자가 직접 확인하기로 함(2026-10-07 「일단 지금 그대로」).
2026-10-08: 모델이 클라이언트 크기(0.864배, 「유닛 모델 크기」)로 작아진 뒤 사용자 「작아진 크기에 맞춰 레벨칩 높이도 낮춰줘」 → 발에서 칩까지 높이를
같은 비율로: (24.5 + 128) × 0.864 − 24.5 = 107.3단위(`PREP_CHIP.y`). 프리팹 128과 다르다 [사용자 결정]. 확인 `sp-check\chiplow.png`.
같은 날 사용자 비교 캡처(望, 우리 `research/2026-10-07-user-issues-3/wang-chip-9.png` ↔ 공식 영상 `wang-chip-10.png`, 「칩 위치는 약간 더 올려야」):
칩 크기(화면 고정)를 단위로 재면 칩 중심 → 눈 높이가 공식 53.7 / 우리 45.8단위 → `PREP_CHIP.y` 115. 모델 크기(얼굴 폭 44 / 45단위)·칩 x 오프셋은 같다.
비교 `sp-check\wangchip-compare.png`(수정 전 · 후 · 공식), 스크립트 `wangchip.mjs`. [추정: 공식 프레임은 공격 동작 중이라 머리 위치 ±2px].

**장비 바 (정비 중)**: 사용자 캡처 + 설명 「장착된 아이템이 있을 때만 2칸 바, 하나만 장착되면 한 칸만」. `shop_hud`의 `equip_bg`(74×30, shop_hud 안 (13, 29.4) —
칩 오른쪽, × 1.25)와 칸 `equip_0`/`equip_1`(23×6, ±12.8 / 13): 아이템마다 흰 알약(`equip_normal_icon`), [추정] 금색 아이템이면 빛나는 금색 알약(`equip_gold_icon` 31×14,
제 크기). 이 바가 그려지면 예전 아이템 아이콘(item pips)은 숨긴다(캡처에 아이콘 없음). 그림은 로컬 추출(`extract.py --only ui/battlecommon`)만 있어서
없는 서버는 예전 아이콘 그대로. 금색 여부는 `render/app.js`의 `setItems` 옆 `setEquip` 한 줄씩(2곳)이 넘긴다. **배포할 때 로컬 소재(`public/assets/local/ui/battlecommon`)도 올려야 한다.**

**② 적 HP** (`EnemyBars`; 처음엔 맞기 전 숨김 — `_alwaysShowHp`는 圣堂剑士만 켜짐 — 보스는 늘 보임):
- 일반·정예: `enemy_hp_slider` 105×7 `#ea4700` α.7, 흰 α.7 잔상, `sprite_bg` 받침 8 × 8.55 크게(`enemy_slider_background`; 위 그림자 설명), `hud_unit` 아래 55.3(캡처 ≈110px).
- 보스(거대 패널이 아닌 보스 — 铳·卢西恩 등): `enemy_boss_hp_slider` 130×9 `#ea2727` α.85, `hud_unit` 아래 43, `sprite_bg` 받침 10×8 크게
  (처음엔 딱딱한 사각형이라 테두리로 보였다 — 사용자 캡처 14로 그림자 받침임을 확인); 문양 `sprite_enemy_boss_hud_small`(57×65, 바 중심 7 아래)이 바 뒤에;
  SP(`enemy_boss_sp_slider` 130×6 `#ebc9ff` α.7, 받침 10×7 크게)는 HP 바로 아래 [추정 위치] — SP 있는 보스만.
- 거대 보스(사용자 「위수협의 모드에서만 넓게」): 보스 프리팹에 `_bossHudScale`이 있는 적(`EnemyGiantBoss`)은 `battle/[pack]common.ab`의
  `panel_enemy_boss_info`를 쓴다 — HP 798×10 × x 배율(胄·管·阿利斯泰尔·萨米的意志 0.35, 昆图斯 0.765; 관 캡처 ≈281 × 9.3단위 ✓) `#ff2b2b` α.8,
  흰 α.7 잔상, 검정 α.39 딱딱한 받침(800×12 — 캡처 14의 SP 바 둘레 검은 테가 이것)과 흰 α.39 테(`sprite_enemy_boss_hp_bg` 9-slice 816×28: 회색 가운데 위아래에
  어두운 선; 테두리도 가로 배율로 눌림), SP(`default_sp_slider` 798×8 `#cab2d4` α.8, 받침 800×12, 테 816×24)는 HP 중심 16.3 아래 [캡처 8], 문양 `sprite_enemy_boss_hud_large` 폭 ≈39단위([캡처 8·10]),
  맞을 때 빛(`hit_effect` = `sprite_bar_glow` 9-slice 818×31 `#ff0000` α.78 — 사용자 결정, 0.35초 사라짐 [추정]). 중심 = 보스 발 [추정 — 배치는 네이티브 코드,
  캡처에서 발 근처], `_bossHudOffset`만큼 타일 단위로 옮김 [추정 단위](萨米的意志 위 1.4, 昆图斯 위 1.02, 管 II 오른쪽 1.4). 표는 `GIANT_BOSS`(적 프리팹 전수 조사).
- 圣堂剑士 탄약: HP 바 바로 아래 같은 폭에 아군과 같은 탄환 칸([추정] `enemy_bullet_bar` 105×7).
- **보스 SP 바와 관·현의 공식 SP** (사용자 결정 2026-10-07 「공식과 같은 a안」): 공식은 쿨다운이 아니라 SP다(`enemy_database` spData: 管 INCREASE_WITH_TIME
  0/50 +1/s, 裂管之奏 spCost 50·cooldown 50·initCooldown 40; PRTS 「技力 0/50 自动回复 1.0 SP/s」; 阿利斯泰尔 maxSp 25; 胄·萨米的意志·昆图斯·铳·卢西恩은 spData 없음
  → SP 바 없음). 시뮬레이션 `content/bosses.js skillSp`: SP는 행동할 수 있을 때(기절 아님) 초당 increment, 스킬은 쿨다운이 끝나고 **SP ≥ 비용**일 때 발동
  [추정: 둘 다 필요 — 클라 로직은 네이티브], 발동하면 비용만큼 소모. 管 첫 발동 40초 → 50초(테스트). 같은 구조의 弦(엘리트, spData 0/35, 断弦之奏 25·icd 12)도
  같은 규칙(첫 발동 12초 → 25초). 阿利斯泰尔은 원래 SP를 세고 있어 값만 노출. 막대는 `b.snap.bsp`(`local-hud.js hudLists` — `ammo`와 한 번에 돈다).
  성능(사용자 요청 점검): SP 틱 0.06µs = 전투 한 스텝(88µs)의 0.07 %, `hudLists` = 스냅샷의 2.2 %(이전 `ammoList`와 같음).
  [추정] 凋亡 폭발 「15秒内无法开启技能，每秒损失1点技力」(적 쪽)은 아직 없음.
- 맞을 때 흔들림(원본 `shake`)은 새 바에 적용하지 않는다(공식 없음).

**③ 원소 원형 바** (사용자: 「원형 바, 가운데에 원소 유형별 아이콘」; `hud-bars.js ElementRing`): 클라이언트 `char_ep_slider`·`enemy_ep_slider`. 그 스크립트
(UIHudUnitEpSlider)의 `_elementDatas`가 시뮬레이션 `ELEMENT_ORDER`(neural, erosion, burn, apoptosis) 순서로 원소별 색·아이콘을 갖는다 —
아군: `#00ffd8` + `sprite_ep_icon` / `#3da1ff` + 물 / `#ff4901` + 불 / `#474747` + 어둠, 적: `#149882` / `#266ad0` / `#e3531a` / `#7c7c7c`(폭발 색 `#1c1c1c`), 'necrosis'는 凋亡 것 [추정].
- 아군: 전체 ×1.2, `hud_unit` 아래 25.9(= 발 근처; 캡처 8에서 링이 HP 바 29단위 위). 아래부터 ep_hit_spread(76×78, 원소 색 — 맞을 때 퍼짐 [추정 애니]),
  ep_center_color(28 원판, 원소 색), ep_back(54, α.784 어두운 고리+그림자), 뒤 슬라이더(slider_ep_fill 28, 흰 α.3 — HP 바 잔상처럼 늦게 따라옴),
  채움(slider_ep_fill 28, 흰색), 아이콘(14×14). 채움은 Image Filled **Radial360, 시작 위(FillOrigin 2), 시계 방향** — 빈 부분이 12시 왼쪽(캡처 8·10과 같음).
  부채꼴 메시(SimpleMesh, 48칸)로 그린다.
- 적: ×1.2, 26.5 아래, ep_back(51), 원판(slider_ep_color_enemy — 51 rect 안 27px), 어두운 바탕(17), 채움(12, `#d5d5d5`), 아이콘 없음(PRTS 「小尺寸图标」과 같음);
  폭발 때 ep_break_spread(41×42, 폭발 색) + ep_break_hint(33) [추정 애니 0.6초].
- 값은 기존 `elementLeft()`(남은 元素值, 爆发冷却 동안 다시 차오름 — PRTS 「以白条显示剩余的元素值」「元素条显示缓慢恢复至上限」); 爆发 중 원소 색 채움·원판 깜빡임
  (예전 줄의 [ASSUMED])은 공식 링에 없어서 흰 채움 그대로.
- 그림(로컬 추출 14개)이나 SimpleMesh가 없으면 예전 줄(원판 + 흰 막대)을 바 아래에 그린다.
- 디버그 아레나에서 `battle.dealDamage(…, { type: 'element' })`로 凋亡(아군)·灼燃(적) 확인(25 %, 폭발, 회복 중).

**④ 데미지·회복 숫자** (사용자 결정 2026-10-07: 표시 조건은 제안대로, 모양은 공식 프리팹대로, 「지금 표시 방식도 설정에서 고를 수 있게」):
- 프리팹(`battle/[pack]common.ab`): `damage_text`(UIDamageText) Novecentowide 30 `#ff3a00`, Shadow 검정 α.5 (1, −1), `_randomRange` (10, 5), `_lifeTime` 0.5,
  `_upOffset`/`_downOffset` 30, `_fontSizeScale` 1.5; `heal_text`(UIHealText) `#00ff95` "+n", `_floatOffset` 40; `hud_unit`의 `popup`(중심 위 150)에서 생김.
- 언제(데이터 전수 조사 69,123개 컴포넌트, scratchpad dmgnum/NOTES.md): 숫자 표시를 데이터가 강제하는 건 극소수 — 로스터에선 蕾缪안 S3 포탄
  (`lemuen_s3_attack` FixedValueDamage `_forceDisplayDamageNum`)과 적 xi·mdrock·mousek 보호막 흡수(`BlockDamage._showDamageNumber`, **아직 안 함**).
  나머지는 코드: `Modifier.isCritical`, `BattleConsts.MODIFIER_CRIT_THRESHOLD = 1.5`, `UIDamageText.CRITICAL_FONT_SIZE_SCALE = 1.1`(메타데이터 기본값).
  치명타 = PRTS 作战机制 「伤害红字（暴击）」 「单位在造成的伤害不低于预期伤害的1.5倍时，会在造成伤害后弹出红色的数字…官方称呼为Critical」 —
  예상 피해 = ATK × 배율을 대상 방어/법저로 깎은 값(穿透 제외), 실제 피해 = 脆弱·피해 배율·穿透까지 넣은 값 → 빨간 숫자는 사실상 脆弱·增伤·穿透와 함께 나온다
  (처음 커밋 13fdc651은 「ATK × 1.5 이상」으로 잘못 봤다 → 고침). 강제 표시는 PRTS 「强制红字」의 蕾缪安 归乡邀约(瞄准射击时 — 우리 S3 'snipe'·'bombard' 태그).
  보호막: PRTS 「强制红字与蓝字」 — 빨간 숫자가 될 타격이 屏障/护盾을 못 뚫으면 그 막기 방식이 허용하면 파란 숫자(클라 `block_text` `#3a35d9`, 나머지는
  damage_text와 같음), 거부하면 노란 「BLOCK」 → 막힌 타격에 빨간 숫자는 없다(사용자 기억과 같음). 허용 플래그 = `BlockDamage._showDamageNumber`(115개 중 17개,
  로스터에선 xi·mdrock·mousek 보호막). **구현(사용자 결정 「파란 숫자랑 BLOCK 넣어줘」)**: 시뮬레이션이 빨간 숫자감(치명타·강제) 타격을 보호막이 전부 막으면
  'blk' 이벤트 [id, 피해, 1 파란 / 0 BLOCK] — `damage.js absorbShields`(흡수한 버프 키를 `info`로 돌려줌)와 `enemies.js artsBarrier`(법술 장벽, 취소 시);
  허용 키 = `local-hud.js BLOCK_SHOWN`(`ab:xiShield`, `ab:sandDef` 鼠王, `ab:rockPower` 泥岩). 렌더: `num-official.js` 파란 숫자 `#3a35d9`(block_text),
  노란 「BLOCK」 `#ff9000`([추정 모양] 클라 그림 못 찾음 — PRTS 색), 공식 숫자 방식에서만. 보호막을 뚫은 타격은 그대로 빨간 숫자(흡수 뒤 HP 감소량).
  「卫戍协议：盟约」 전 동시 10개 제한은 안 함(그 뒤 버전은 제한 없음). 회복 `+n`은 데이터에 끄는 플래그가 없어 늘 표시 [추정;
  PRTS·나무위키 언급 없음]. 전투 공식 정리: `research/battle-mechanics-reference.md`.
- 시뮬레이션: `server/sim/local-hud.js damageNumberFlag(dmg, ss, 예상, 실제)` → `damage.js`(피해 배율까지 계산한 뒤)가 'dmg' 이벤트 5번째 칸(0 / 1 치명타 / 2 강제).
  지속 피해('dot')·무来源은 치명타 아님.
- 렌더: `render/num-official.js` — 피해는 플래그 있을 때만, 회복은 늘. 30단위(화면 고정 hudUnit), 치명타 ×1.1, 0.5초, 흩어짐 ±(10, 5), 위로 30(회복 40,
  ease-out), 처음 0.2초에 1.5배에서 줄어듦·마지막 30 % 사라짐 [추정 — 애니 코드는 네이티브]. Bitmap 글꼴(Novecento Wide, 이미 `public/fonts`에 있음).
- 설정 「伤害数字样式 / 대미지 숫자 방식」: 공식(기본) / 전부 표시(예전 숫자 — 유형별 색·합산·줄 배치), `sp.pref.dmgNumberStyle`(`render/number-style.js`);
  「대미지 숫자 표시」를 켰을 때만 보인다. 2D 대체 화면(`ui/fallbackField.js`)의 숫자는 그대로.
- 디버그 아레나·mock: 회복 `+180`만 뜨고 일반 피해는 숫자 없음; 테스트: 蕾缪안 S3 강제 표시, 같은 전투에 脆弱 ×1.6을 걸면 빨간 숫자가 생김.

**⑤ 상태 이펙트** (사용자 요청 「冷氣·冻结·战栗·은신·위장 … 그 외 상태도 확인 후 같이」, 방법 1 = 공식 이펙트 그대로; `render/fxstatus.js` → `fxgame.js statusOn/Off`):
공식은 상태를 아이콘 줄이 아니라 이펙트 프리팹으로 보인다(캡처 9·10). 프리팹은 `battle/prefabs/effects/buff.ab`·`common.ab`(`fx_extract.py --bundle buff/common`,
index.json에 두 번들 추가 — 기존 125개 그대로), 전부 루프(`_isLoop` 1), 붙는 곳은 `_spawnLocation`(1 발, 2 몸 HIT, 4 머리, 5 바닥 중앙 — 데이터).
상태 → 프리팹은 이름으로 맞춤(클라 매핑은 네이티브, 메타데이터 `COMMON_EFFECT_PREFIX`) [추정]:
晕眩 `buff_stun`(머리) · 冻结 `buff_autochess_frozen`(발, 얼음 덩어리) · 寒冷 `buff_cold`(머리 눈꽃 — 冻结 중에도) · 沉睡 `buff_sleep`(몸) · 沉默 `buff_silence`(머리) ·
恐惧 `common_buff_fear` · 战栗 `common_buff_thrill`(머리 주먹 — 캡처 10; 예전엔 공포 아이콘으로 잘못 연결) · 缴械 `common_disarm_icon` · 减速 `buff_slowdown`(발) ·
迟缓 `buff_sluggish`(발) · 攻速下降 `buff_attack_speed_reduction_01`(발) · 虚弱 `buff_weak` · 防御下降 `buff_defdown` · 法抗下降 `buff_magic_resistance_down` ·
脆弱(4종) `buff_ fragile_01`(발) · 浮空 `common_levitate_01`(바닥) · 적 隐匿 `common_invisible`(발; 그 ColorModifier대로 모델 회색 .5·α .894 — 예전 45 % 반투명 대신) ·
아군 隐匿 `common_stealth` [추정] · 迷彩 `common_buff_micai_01`(몸) [추정: 세 변형 중 _01].
- 머리 높이 = 모델 높이 × 1.1 [추정 — 캡처 10의 주먹이 머리 위], 몸 .5, 발 0(`fx.js bodyZ`). 늘 위 캔버스(유닛 위)에 그린다: 이펙트 세션의 렌더러별
  위/아래 나누기(e8d62545, sortingOrder > 0 또는 0 + fudge < 0 = 위)를 상태 프리팹에 쓰면 冻结 얼음(전부 order 0·fudge 0)이 유닛 뒤로 가서 캡처 9와 달랐다
  — 클라는 order 0을 깊이로 정렬해 덩어리가 모델 앞에 온다 → 상태 이펙트는 나누지 않는다(`playStatus` `split = false`).
- 일부 프리팹은 파티클이 한 번만 돌아(`buff_silence` 1초) 상태가 남아 있으면 다시 시작한다. 파일을 못 읽으면 그 상태는 예전 아이콘.
- **중첩 수정**(사용자 제보 4차 4-1 「기절이 중첩되면 머리 위 기절 이펙트가 겹쳐 보인다」, 2026-10-08 세션 I, 84e2fc56): `statusOff`가 멈춘
  인스턴스의 `again`(다시 시작)을 남겨 두어, 파티클이 다 죽은 뒤 상태가 다시 켜져 있으면(다음 기절) 새 인스턴스 옆에 복사본을 하나 더
  틀었다 — 다시 걸릴 때마다 하나씩 늘었다(아레나 1 2 3 4…, 실제 솔로 판 최대 8). 또 방출만 멈춰서 `buff_stun`의 표시(수명 10초 파티클 1개)가
  상태가 끝난 뒤 최대 10초 머리 위에 남았다. → `statusOff`가 `again`을 지우고, `fxstatus.js`는 `now`로 끝낸다(파티클 즉시 제거
  [추정: 클라는 버프가 빠질 때 그 이펙트를 같이 없앤다고 봄]; 정비 금빛은 예전처럼 서서히). `playStatus`는 같은 유닛·같은 키의 살아 있는
  인스턴스가 있으면 새로 만들지 않는다(로드 중 꺼졌다 켜지면 로드가 둘 걸리던 것). 같은 경로라 목록 전체에 적용 — 수정 전 아레나에서
  18종 중 13종이 겹쳤다(기절·冻结·寒冷·沉睡·减速·攻速下降·虚弱·防御下降·法抗下降·脆弱·浮空·隐匿·迷彩; 沉默·恐惧·战栗·缴械·迟缓은 파티클 수명이
  짧아 거의 안 보였음), 수정 후 18종 모두 최대 1개·상태가 끝나면 0개. 테스트 `test/local-patch-status-boomerang.test.js`.
- 이펙트로 그리는 상태는 아이콘 줄에서 빠지고(`units.js _iconKeys`, `view._fxStatusOn`), 冻结·寒冷 파란 틴트도 그 동안은 안 쓴다. 클라 프리팹이 없는 상태
  (束缚, 嘲讽, 无敌, 护盾, 麻痹, 원소 폭발, 禁疗, 折射, 替身 …)와 이펙트 층이 꺼진 경우(품질 낮음, WebP 없음, 추출 없음)는 예전 아이콘 그대로.
- 디버그 아레나 확인: 寒冷+战栗(눈꽃 위·주먹 아래, 캡처 10과 같음), 冻结+寒冷(캡처 9의 얼음), 沉默 ✕, 脆弱, 沉睡, 迷彩. 아레나에서 WebGL 경고
  `drawElementsInstanced: no buffer is bound` — 상태를 하나도 안 걸어도 나와서 이번 작업과 무관(조사 안 함).
- **배포 때 git 밖**: `public/assets/local/fx/buff/`, `fx/common/`, 새 텍스처·메시, `fx/index.json`.

**배치 방향 표시** (사용자 요청 「배치 방향 표시 화살표도 실제 인게임과 동일하게」, `facing.js`): 오퍼레이터 프리팹의 `Others/Direction/DirectionIndicator` —
땅에 눕힌 SpriteRenderer 2장(배율 0.55): 링 `sprite_direction_ring`(rect 128, ppu 100 → 지름 0.704타일, 흰 α.502)과 화살표 `sprite_direction_arrow`
(rect 128에 65×112가 (31, 8)에 패킹, 바깥쪽 0.333타일, `#FF9900`). 매 프레임 네 모서리를 카메라로 투영한 SimpleMesh라 보드에 눕는다. 그림은 웹 manifest
`ui/battle/sprite_direction_*`(이미 있음); 없으면 예전 주황 셰브런. 청록 링(캡처 13)은 방향을 정할 때 잠깐 뜨는 `common_direction_hint_*` 이펙트로 별개(안 함).

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
  - 스킬 루프음 (2026-10-07 사용자 제보 「丰川祥子 S3 발동 시 고유 음악이 안 나온다」): 공식 뱅크 중 `loop: true`인 스킬 소리 — 丰川祥子 S3
    `ON_BUFF_START.oblvns_s_3[loop]`(`p_atk_MJCkyrdslnt_lp`, 공식 데이터에 스킬용 BGM 전환은 없음), 장판 `ON_ABILITY_START.skchr_lisa_3` /
    `ON_SKILL_START.skchr_cello_3` 등 풀 17명 — 를 `skill-mode-sfx.mjs skillLoops`가 `sfx.units[id].loops[스킬번호] = { url, grp, vol, start }`로
    싣고(`audio.mjs indexAudio` `loopBanks`), `audioOfficial.js startSkillLoop`가 스킬 동안 반복 재생(그룹 게인 × 볼륨, sfx 채널), 스킬 끝·퇴장·
    새 필드에서 0.25초 페이드아웃. `start`(시작 뱅크 자체가 루프: 铃兰·角峰 등)면 한 번짜리 시작음은 내지 않는다. 같은 제보로: 丰川祥子 S3의
    시작음(`ON_CUSTOM_TRIGGER.skchr_oblvns_3[start]`)이 `deferStart`(공격 능력 소리만 해당)에 잘못 걸려 거의 안 나던 것 수정
    (`skill-sfx.mjs skillStartIsFallback`: 커스텀 시작 트리거는 진짜 시작음). `/debug.html` 일시정지는 AudioContext도 멈춘다(루프가 계속 울리지 않게).

  - **평타는 Default 모드 소리만** (사용자 제보 2026-10-07 7번 「실버애쉬 평타에 S3 소리」): `tools/assets/skill-mode-sfx.mjs defaultModeBanks` — 모드 정보가 있는
    오퍼레이터는 스킬 모드 번호의 `ON_ABILITY_*.attack|combat.<n>` 뱅크를 평타 후보에서 뺀다(银灰 S3 `p_atk_silver_n`, 号角 S2 포격 시전음, 丰川祥子 S3,
    圣约送葬人 S3_End, 雷蛇 S2가 평타마다 나던 누수). `.0…`(Default `_includeIndexZero`)은 파일 접미사와 상관없이 Default 것(`audio.mjs pickUnitSfx opts.defaultZero`
    — 丰川祥子 `p_atk_mjckyrdnt_h`). Default 투사체(charpack `_projectileKey`, 银灰 `projectile_svrash`)의 BORN/HIT/REACH를 이름 추측보다 먼저(prove·slchan·
    skgoat·vodfox·leizi·rosmon에 타격음이 생김). [추정] Default에 공격 뱅크도 투사체 뱅크도 없는 玛恩纳·蜜蜡·薄绿·卡涅利安·sbell2는 예전 것(스킬 모드 `_n`
    파일)을 남긴다 — 스킬 없이 평타만 치는 공식 영상으로 무음이 확인되면 예외를 뺀다.
  - **르무엔 S3 효과음** (10번): `kit-sfx.mjs KIT_HIT_BANKS` `lemuen:mark` = `ON_BUFF_SHOW_EFFECT.char_lemuen_range_aim`(S3 'lock'마다), `lemuen:s3end` =
    `ON_ABILITY_START.char_4193_lemuen.attack.4`(S3_End 모드, 첫 'bombardShell' i 0), `lemuen:shell` = `ON_PROJECTILE_REACH.projectile_chr_lemuen_s3_attack`('bombard'마다),
    `audio.js kitHitKey` 3줄. `lemuen_s3_audio_triggered`(p_atk_lmwlcrstr_s)는 시점이 불확실해 뺐다.
  - **kit 소리 동시 재생 = 공식 popOldest**: kit 뱅크 22개는 공식에서 모두 `popOldest true`, 상한(`maxSoundAllowed`) 1–3. plan이 `kit-sfx.mjs kitHitLimits`로
    `audio.sfx.kitLimit[key] = { max, pop }`에 싣고(`audio.mjs indexAudio limitOf`), `audio.js _play({ pop })`가 같은 파일이 상한에 차면 가장 오래된 복사본을 끊고
    새 소리를 낸다(르무엔 착탄 5발 모두 — 예전엔 셋째부터 빠짐). 상한 1인 키(wang:1·wisdel:s2·whitw2:s2/s3·lemuen:mark)는 겹치던 두 번째 대신 앞 소리를 끊는다.
    일반 유닛·전투 소리는 그대로(`MAX_PER_URL` 2, 넘으면 버림). 유닛별 160 ms 간격은 kit에도 걸려 2× 속도에서는 일부 빠질 수 있다.
  - 확인: `test/local-patch-audio.test.js` +6(수정 전 실패 확인), 매니페스트 diff(위 오퍼레이터만), Windows Chrome `sndB_probe.mjs`(银灰 발동 전 평타
    `p_imp_spear_n`만, 르무엔 mark 5·s3end 1·shell 5). 배포: 새 sfx 3개(`p_imp_lmwlcrstrmk`, `p_atk_lmwlcrstrst_s`, `p_imp_lmwlcrstr_s`) → `oci/deploy.sh --assets`.
    로컬 재생성 때 매니페스트 키가 10개 줄어 `fetch-assets --allow-shrink`.
  - **스킬 특수 음악·대역 전환·모드 타격음** (사용자 제보 4차 4-2·4-4, 2026-10-08, 세션 G — 조사 표 `research/2026-10-08-handoff/G-skill-music-hit-sfx.md` 「결과」):
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
    - 归溟幽灵鲨 「S2 종료 후 대역 전환」: S2 끝 → <替身> 전환(sim fx 'substitute', professions.js installDollkeeper)의 공식 뱅크 —
      `ON_BUFF_START.ghost2_switch2stand` p_skill_sharpstandborn, `ON_BUFF_SHOW_EFFECT.ghost2_standin[switch]` p_skill_sharpstandspell(11.6 초, ctrlStop
      `ghost2_stand_effect_end` 0.8 초), 본체 복귀(fx 'swap') `ghost2_switch2normal` p_skill_sharpborn. `kit-sfx.mjs` 키 `ghost2:stand|standin|normal`,
      `audioOfficial.js dollSwitchSfx`(오퍼별 표), `audio.js _dollSwitch`. [추정] standin은 전환과 함께 나고 본체 복귀·퇴장·替身 격파에 끊는다(버프 타이밍은 네이티브).
      안 한 것: 같은 뱅크에 걸린 스냅샷 `AllLowpass_Reverb`(전체 저역 통과 5 초).
    - 缄默德克萨斯 S2 타격음(4-4): ① 배치 즉시 켜지는 스킬(`activateOnDeploy`: S1–S3)은 'skill'이 그 유닛의 'spawn'보다 먼저 와서(실제 경로 확인) 오디오가 버렸다 →
      `audio.js`가 추적 전 유닛의 'skill'을 잡아 두었다가 'spawn'(같은 묶음에 'deploy'가 있으면 그 'deploy')에서 처리, `screens/game.js` 작전 시작 early 버퍼도 'skill'을
      넘긴다(1줄). ② 모드 능력에 공격 뱅크만 있고 HIT 뱅크가 없으면(S2 `attack.2`는 `ON_ABILITY_ON` p_imp_reticentsword_h뿐) Default의 HIT(p_atk_reticentsword_n)는
      나지 않는다 → `skillModes`가 `noHit: true`, `audio.js unit()`이 그 모드의 타격음을 비운다. 실제로 바뀐 오퍼: texas2 S2, ghost2 S2/S3, gvial2 S2, svash2 S3,
      whitew S2, rosmon S2/S3, pepe S3, mlynar S2/S3(나머지 16명은 Default 타격음이 원래 없음). [추정] 뱅크가 없으면 무음(클라이언트 재생 코드는 네이티브).
    - 확인: `test/local-patch-skill-music.test.js` 6개(수정 전 6개 모두 실패 확인 — 실제 경로 Match → buildBattleSpec → createBattleFromSpec 이벤트를 AudioManager에),
      Windows Chrome Web Audio 계측(`sp-check\snd_g_hook.js` — AudioBufferSourceNode start/stop을 파일 이름으로): 디버그 아레나
      (`snd_g_arena.mjs`) nearl2 S3·cello S3·ghost2 S2·texas2 S2, 실제 솔로 판(`snd_g_real.mjs`: 로드아웃 + 재화 고정 + 상점 리롤로 구매) texas2 S2·ghost2 S2.
      cello·nearl2(6성)는 상점에 안 나와 실제 판 확인 못 함. 배포: 새 sfx 21개 → `oci/deploy.sh --assets`.

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
  3·4는 b7f77ebb). 이번에 고친 것:
  - **스킬 발동 이펙트 고르기** (`fxmap.js activationEffects`, 2·5·8·9·10·11): 이름 매핑 ∪ 스킬 자신의 이펙트(아래 `skills[i]`)에서 다음을 뺀다 —
    ① 그 오퍼레이터의 모드가 공격의 cast/hit/trail로 묶은 프리팹(d0e3e079 `_range` 규칙의 회귀: 수르트 S3 range는 대상 타격, 무에나 S3 range_01·buff_01은
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
  - **렌더러별 위/아래 층** (1·8, 142e0a31의 「시전자 이펙트는 전부 아래」를 바꿈): 공식은 캐릭터 Spine이 깊이를 안 쓰고 Default 레이어 order 0이라 이펙트
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
  - **대상 타격 이펙트가 전부 안 보이던 회귀** (e8d62545): `play()`가 대상에 붙는 hit까지 `split`(렌더러를 층 1/2로)으로 만들고 층 0만 그리는 위 캔버스에
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
- **일반화 (세션 F, 2026-10-08, 9682d45c·baf0d91f·e6dc540c)** — 이펙트 붙는 자리를 오퍼레이터 전체에:
  - **점 표** `tools/local-extract/char_points.py` → `tools/assets/local-char-points.json`(git, 검토용) + `public/assets/local/fx/points.json`(git 밖, 클라이언트가 읽음).
    근거: chararts `DefaultSkin` 애니메이터의 typetree — 양면 모델은 `_front`/`_back` 레코드(`muzzlaTransform`[원문 오타]·`hitTransform`·`headTransform`·
    `shadowTransform`·`specialPoint0~15`), 한 면 모델(`char_1012_skadi2`)은 자기 필드(`_muzzleTransform`…). 각 점의 BoneFollower `boneName`·`followBoneRotation`,
    고정 위치는 로컬 좌표 ÷ SkeletonDataAsset `scale`(0.01) = 스켈레톤 단위(비르투오사 Muzzle (0.678, 1.902) = `F_Muzzle` Idle (67.8, 190.2) — 데이터로 확인).
    점 이름은 모델마다 다르다(`MuzzlePoint`·`Special_0`·`Special0`) — 이름이 아니라 애니메이터 필드로 찾는다. 126명.
  - **`render/fxpoints.js`** `pointKey`(3·6 → muzzle, MP_SPECIAL_N → spN: 8~11 → 0~3, 13~16 → 4~7, 18~25 → 8~15; 12 CAMERA·17 TILE_CENTER 제외)·`pointOn`
    (그 면의 본 → 다른 면의 본 → 그 면의 고정 위치). `fxgame.js lifted()`가 표에서 점을 찾는다(`SPECIAL_BONES` 삭제 — 비르투오사는 같은 본, 테스트로 고정).
    표에 없는 유닛(적, 근접 모델의 muzzle, 표 없음)은 예전대로 바닥. 본 회전(`followBoneRotation`, 3은 회전 포함·6은 없음)은 적용 안 함 [추정: 프리팹의 `fixed` 자식이 세워진 채].
  - **MP_SPECIAL_1~6** (baf0d91f): `fx_extract.py spawn_location`이 0~8만 받아 9·10·11·13·14·15인 **66개**가 `spawn` 없이(=바닥) 추출돼 있었다. 값 = 열거형 순서의 근거:
    9~15를 쓰는 오퍼레이터는 정확히 그만큼 특수점을 가진다(`thorn2` sp0~4·값 13, `angel2` sp0~6·값 15, `agoat2` sp0~5·값 14까지). 66개만 `--prefab`로 재추출 — `spawn` 외 변화 없음,
    index.json 그대로.
  - **꼬리 투사체** (e6dc540c): `TRAIL_Z` 0.35칸 고정 대신 발사자의 Muzzle(쏘는 순간 위치) → 대상의 맞는 높이(`SPAWN_FRAC[2]`, 클라이언트 HitPoint [추정]),
    Muzzle이 없으면 fx.js `SHOT_HEIGHT.launch`.
  - **NONE(0) 136개**: 클라이언트가 0을 어디에 놓는지는 메타데이터에 근거 없음(`ParticleEffect`/`SimpleEffect`의 `_spawnLocation`, 문자열 「Unit {0} has no muzzlePoint」 등뿐 — 로직은 네이티브).
    지금대로 바닥 [추정]. 참고: 0인 공격 시작 프리팹(`kroos2_attack_start_01`·`horn_attack_01_start_02` 등)은 노드가 `qiangkou`(총구)처럼 무기 끝 기준으로 짜여 있다 — 호출자가 위치를 주는 것일 수 있음.
  - **GROUND_CENTER_WITH_ZERO_HEIGHT(7) 30개**: 확인만 — 이름대로 바닥, 안 바꿈 [추정].
  - **알려진 빈자리**: `swire_attack_01_start`(3, 근접 모델에 Muzzle 없음 → 바닥), `char_1012_skadi2`(Back 모델 없음), 史尔特尔 S3 `buff_03/04` Back 레코드가 Back 스켈레톤에 없는
    `F_Face_Default_*` 본을 가리킴(클라이언트 데이터 — 고정 위치 사용), `nymph_talent_buff_02` Back은 본 없는 고정 위치.
  - **바뀐 프리팹 목록**(되돌림용): `research/2026-10-08-fx-spawn/changed-prefabs.tsv` 218개(3: 48, 8: 104, 9~15: 66) — 프리팹마다 앞/뒤 본.
    이상하다는 제보가 오면: 9 이상만 되돌리기 = baf0d91f revert(코드가 9+를 무시 — 재추출 불필요), 꼬리만 = e6dc540c revert.
  - **사용자 확인 이펙트에 생긴 변화**: 첸(赤刃明霄陈) S2 `chen3_skill_02_buff_01`(9 → `C_Weapon`)은 그녀의 검을 따라가는데, 숨는 동안 `Skill_2_Disappear` 클립이 검 본을 약 1.4칸 앞(+538 단위)으로
    옮겨 둔다 → 예전에는 배치 링 안 바닥에 보이던 붉은 빛이 이제 그 자리에 없다(디버그 아레나 `f_probe.mjs`로 본 위치 확인, 실제 판에서도 같음). 클라이언트 BoneFollower도
    같은 본을 따른다 [추정] — 사용자 확인 필요. 비르투오사 S3·르무엔 S3·余는 전·후 같음(아레나·픽셀 비교), 丰川祥子 음표는 음표 경로(`NOTE_Z`)라 영향 없음.
  - **확인**: 단위(`test/local-patch-fxspawn.test.js` — `pointKey`·`pointOn`, 비르투오사 본, 표의 고정 위치 = Idle 본, 추출 프리팹 218개가 우리 스켈레톤에서 점을 찾음),
    아레나 전·후(HEAD 사본 3161 / 작업 트리 3162, Windows `sp-check\f_pair.sh`): 空弦 화살·발사 고리가 발 → 석궁, 新约能天使(angel2) 총구 섬광 발 → 총구,
    이격 니어 S3 시작·`buff_02_a`가 발 → 무기·머리 높이, 비르투오사 S3 그대로, 첸 S2(위 변화). **실제 판**(`f_real.mjs`, 솔로 판 정비에 维什戴尔 S3·첸 S2 디버그 추가 → 전투):
    维什戴尔 꼬리가 총에서 출발, S3 버프·첸 S2 버프 재생 확인. 그림은 `research/2026-10-08-fx-spawn/`.
  - **이격 스펙터 공격 원형(제보 4차 4-7)은 이 수정으로 안 바뀐다**: `ghost2_attack_start_01`은 `_spawnLocation` 1(FOOT)이고 모델에 Muzzle·shadow 점이 없다 — 데이터상 발.
    원형은 `daoguang*` 빌보드(카메라 정면, 재질 `daoguang_21_ab_ZT` `_ZTest` 0 = 깊이 검사 없음). ~~우리 `fxplayer.js` 바닥 자르기가 바닥 아래 반을 버린다~~
    — **기각**(2026-10-08 report-triage 반박 검증, `research/2026-10-08-orchestration/triage-report4.md` 4-7): 자르기는 노드가 원점보다 0.25(`UNDER_FLOOR`)
    넘게 아래이고 **깊이 검사 재질**일 때만 켜지는데(`fxplayer.js` `under`·`setFloor`), daoguang 3노드는 발 원점(−.002, −.006, .028)이고 `_ZTest` 0이라 둘 다 해당 없음.
    4-7의 원인은 다시 조사 중(사용자 교정 2026-10-08: 평타가 아니라 S2 발동의 붉은 원형) — 결론은 그 조사에서 적는다.

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
  미적용), `atSpawn`(루트 노드 자기 위치를 버림 — 호출자가 놓는 자리가 대신함). 처음(6c782d40)에는 정예 금빛에만 켰고,
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
    = 210px, 모델 키 공식 1.14칸 / 우리 1.10칸으로 교차 확인): **공식 0.43** · 수정 전(7d7693ec) 0.0~0.08(최고점이 발 아래 = 제보) · pivot만 0.56 ·
    **pivot + 루트 버리기 0.46~0.48**. 번쩍인 뒤 0.3초 동안의 궤적은 공식과 0.05칸 안(예: +0.1초 0.30 / 공식 0.29). 이전 메모의 「아직 0.2칸 높다」는
    공식 띠를 눈대중(0~0.45칸)으로 잡은 비교였다.
  - **띠는 모델 앞** (2026-10-08 사용자 「금빛 띠가 오퍼레이터 뒤에 있어. 실제 인게임에선 위에 있었어」; 녹화도 번쩍일 때 검은 신발·정강이가
    금빛으로 덮인다): `bao`는 sortingOrder 0 — 분할 규칙이 order 0 파티클을 모두 모델 뒤 캔버스에 두었다. 클라이언트는 같은 order(Spine도 0)를
    거리로 정렬하고 `bao` 노드는 발 앞 0.4칸이라 모델 위에 그려진다 → `fxplayer.js FxInstance` 옵션 `ahead`(분할할 때 노드가 유닛보다 0.1칸 넘게
    앞인 order 0 파티클을 FX_FRONT로). `bao (1)`(뒤 0.6칸)·order −1 glow·불티는 그대로 뒤. 처음(0fe8987e)에는 정예 금빛에만 넘겼고,
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
- 소재(git 밖): `fx_extract.py --bundle trap --prefab trap_acgarm_buff_loop_01` → `public/assets/local/fx/trap/`, 텍스처 6·메시 1, `fx/index.json`의 `trap`.
- 테스트 `test/local-patch-golden.test.js`. 확인: Windows `sp-check\goldglow.mjs`·`goldglow2x.mjs <port> <tag> <ms csv>`(game-mock PREP, 보드·벤치 기물 하나씩
  golden) → `goldfinal-bench.png`, 프리팹 단독 `gold_seq.mjs`(→ `gold_seq.png`).
  - **나뭇잎 텍스처 폐기** (2026-10-08 사용자 「한번도 실제 인게임에서 해당 나뭇잎 텍스처를 못 봤어. 그 텍스처는 폐기해」): `common_stealth` 프리팹과
    `tex/common_leaf_*.webp`를 추출물·`fx/index.json`에서 지우고, `fx_extract.py DISCARD`로 재추출에서도 뺀다. 서버 assets/local/fx에 남은 사본은
    어디서도 참조하지 않는다(rsync `--delete`를 안 쓰면 남음 — 지워도 됨).
  - **泥岩 Back 스켈레톤의 S3 시작 클립** (2026-10-08 테스트 정리에서 발견, `assets.test` 「Spine animation roles resolve」): b7f77ebb의
    `anim-overrides.mjs`가 앞·뒤 모두에 `Skill_2_Begin`을 넣었는데 Back 스켈레톤에는 `Skill_2_Begin`·`_Awake`·`_Sleep`이 없다 → `applyAnimOverrides`가
    스켈레톤 클립 목록(`spine.mjs`가 넘김)에 없는 덮어쓰기 클립을 null로 둔다(Back S3는 시작 클립 없이 `Skill_2_Attack`·`_Idle`). `fetch-assets --offline`으로
    매니페스트를 다시 만들어 바뀐 것은 이 한 칸(+hash). 테스트 `test/local-patch-battle.test.js`.
  - **望 바둑돌 이펙트 높이** (2026-10-08 사용자 「수동, 재능 바둑돌 이펙트가 loop 되지 않고 한번만 나타나고 있어서 모르겠어」): 공식 캡처
    (`cap-231814.png`)는 돌의 금빛·십자·연결선이 **공 위**(그림자에서 화면상 0.19칸)인데, 우리는 `_spawnLocation` 5대로 땅에 그려 돌의 루프(`sz` 십자 빛)가
    공 밑 그림자에 묻히고 첫 폭발만 보였다 → 탄생·跟子 이펙트(주인 따라감)와 연결선·활성 섬광을 공 중심(화면상 0.18칸, `fxgame.js STONE_BALL`·`ballZ`)에.
    폭발(`token_wang_skill_0N_hit*`)은 그대로 땅. 확인: Windows `sp-check\wst5.mjs`(디버그 아레나, `CAST=i`로만 발동) → `wst5b-zoom.png`.
    → **재제보 2-2로 일부 되돌림** (아래 「望 바둑돌 이펙트 재제보」): 탄생 십자는 다시 땅, 활성 휘감김·연결선만 공에.
  - ~~**跟子 이펙트 반복** [추정]~~ (637a43e0, 2026-10-08 재제보 2-1에서 삭제): 跟子의 `wang_passive_01_buff`를 3초마다 다시 틀던 것. 캡처의 검은 연기는
    탄생 이펙트가 아니라 활성 이펙트(`wang_passive_01_buff_02`의 `line` 메시)였다.
  - **望 바둑돌 이펙트 재제보** (세션 B, 2026-10-08, `research/2026-10-08-report3-status.md` 2-1·2-2·2-7, 캡처·스크립트 `research/2026-10-08-wang-stone/`):
    - **2-1 활성 이펙트 유지** (82b1b028): 「루프」로 보여야 하는 것은 활성(연결) 이펙트 — 놓은 돌 `token_wang_01_buff`(sktok_wang_N/TriggeredEffect
      `_buffs[0].overrideEffectKey` = 버프 이펙트), 跟子 `wang_passive_01_buff_02`(투사체 `_triggeredEffect`). 둘 다 `line` 메시(검은·금빛 휘감김)가 클립의
      `_Amount` 1 → 0으로 0.6초에 드러나고 그대로 남는다. 루트 효과 컴포넌트 원시 int #17이 상태 버프 거의 전부와 이 둘·탄생 이펙트 = 1, 폭발 = 0
      [추정: `_isLoop`]. 우리는 클립·파티클이 끝나면(약 1초) 버렸다 → `playAt keep`으로 돌에 붙여 그 돌의 `die`(소모·회수)까지 유지. 그리고 정비에서 붙여 놓은
      돌은 전투 첫 틱에 활성되는데 그 'wangLink'가 화면이 필드에 들어가기 전이라 `screens/game/early.js keepEarly`가 버렸다(fx라서) → 'wangLink'도 남김.
      탄생 이펙트 `token_wang_birth_01_buff`에는 같은 `line` 메시가 꺼져 있다(외톨이 돌은 휘감김 없음 = 공식 캡처 아래쪽 돌).
    - **2-2 탄생 십자는 땅** (bc4a202e, 사용자 정정: 「공이 아니라 공 밑 십자가 모양 이펙트가 타일 위치와 어긋남」): 탄생 이펙트의 루프 십자(`sz`/`sz1`: 땅 평면의
      길이 1칸 납작한 쿼드)는 땅 표시 — 공식 캡처에서 팔이 타일 가장자리에서 가장자리까지, 타일 중간보다 8~10px(타일 ~250px) 위. 공 높이로 올리면 화면에서
      약 0.15칸 위로 뜨고 원근 때문에 칸마다 다르게 어긋난다 → STONE_BORN은 돌 뷰의 땅. 활성 휘감김·연결선은 공에(캡처에서 공을 감쌈).
    - **2-7 폭발** (8ede3fc9, 95c4e8d4): 돌에서는 클라이언트가 트는 것만 — sktok_wang_1/3 `_castEffects`, sktok_wang_2/ExplodeRow·Col·Cross `_effectKey`
      (축마다), 跟子 투사체 `_effectOnTrigger`(`fxgame.js stoneBlastFx`). `_02`는 타격 이펙트(ExplodeRow `_hitEffects`, S3 跟子 `_effectsWhenHit`)라
      같은 순간의 'dmg'로 범위 안 적·터뜨린 적마다(`stoneHit`, `inStoneBlast`). `token_wang_skill_03_hit_03`(모든 시스템 x+2칸 = S3 폭발 사본)은 어디서도
      참조하지 않아(charpack, 토큰 번들, `[uc]` 6개, 표) 안 튼다 — 2칸 옆 두 번째 폭발과 ~9칸 직선 입자의 원인. 그리고 `fxplayer.js shapeSample`이
      BoxShell/BoxEdge(15/16)의 크기를 두 번 곱했다 → S3 `lizi_l`이 ±1×±1.5칸 대신 ±2×±4.5칸. **사용자 결정(2026-10-08): 전체 적용** — 58 시스템·36 프리팹
      (buff_sluggish, buff_autochess_frozen, 첸 S3 범위, 로즈몬티스 S3 …), 전후 `research/2026-10-07-user-issues-3/boxshell-before-after.png`.
      남은 차이 [추정]: S3 `lizi2 (1)/(2)` 가는 호는 프리팹 자체가 반지름 2.2 원에서 나와 마름모 대각선 모서리를 조금 넘음(공식도 같다고 봄), 늘인 빌보드
      pivot(`lizi2 (2)` 0.5, `sdx_line` 1, `baoci` −0.5) 미구현. 테스트 `test/render/wang-stone-fx.test.js`.
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

### 回环射手 부메랑 (2026-10-08, 사용자 제보 4차 4-6 「투사체는 하나만 있고 부메랑처럼 돌아온다. 공격하지 않을 때는 오퍼 손에 들려 있어야 한다」, 세션 I 521a00dc)
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
- **4-5 A — 검우 프리팹 이름** (26e57300): 시뮬레이션 'swordRain'(대상마다, `src` = 그녀)이 클라이언트에 없는 이름 `texas2_skill_03_hit`(검 없는 스파크)를
  그렸다. 공식: `[uc]skills.ab` ModeWithSwordRain의 EmitSword가 1초마다 투사체 `projectile_chr_texas2_s3_sword_rain`을 쏘고, 그 `_effectsToTargetWhenStart` =
  `texas2_skill_03_hit_02`(5.5칸 위에서 0.13초 낙하 `luojian` + 착지 `luo`, 2.62초). → `fxgame.js`가 스킬 바인딩의 target(`modes.json skills[2].target`)을 그린다.
- **4-3 — 재생기 다중 클립** (602d2fac): 프리팹 안의 중첩 서브프리팹은 자기 Animator·클립을 가진다. `FxInstance`가 `clips[0]`(루트 것)만 틀어 S2 발동
  `texas2_birth_02_start`의 베기 4개(메시 16개)가 머티리얼 기본값으로 약 2초 굳어 있었다. 이제 모든 클립의 트랙을 묶어 각 클립 길이까지 재생(끝 프레임 유지),
  `done`·꼬리는 가장 긴 클립 기준. 추출기는 이미 클립 노드를 전체 트리 번호로 풀어 둠 → 재추출 없음. 적용 안 한 것(결정): 중첩 서브프리팹 `_delayTime` 0~0.3초(B,
  지금은 동시 시작), `m_IsActive` 가시성 트랙(C, 83 프리팹), 루트 `_delayTime`(①-b, 약 310 이펙트) 보류.
  `bench/fx/compare.mjs`(HEAD 대비 1983 이펙트 × 4프레임): 바뀐 것은 클립 2개 이상인 11 프리팹뿐(바인딩된 6: 텍사스 디 오메르토사 S2 발동·S3 범위 시작, 무에나 S2,
  위셔델 S2 2종, 불피스폴리아 S2 / 바인딩 안 된 svash2 방패·불피스폴리아 방향별 4), 나머지 1972는 픽셀 동일.
- **4-5 B — 내장 Quad/Plane 메시** (fe9dce69): 검날 노드(jian / jian1 / add)는 Unity 내장 Quad(FileID → `Library/unity default resources`, PathID 10210)
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
- 남은 것: ① **S3 낙하 검이 착지 뒤에도 남음** — `texas2_skill_03_range_start`(클립 4개)·`_start`의 jian/jian1은 공식이 `m_IsActive`로 0.2초(start 0.37초)에
  끄는데 C를 안 해서 클립 끝(1.53초)까지 α 0.5로 남는다(메시가 생기며 새로 보이게 된 것). C를 이 둘만이라도 할지 사용자 결정 필요. ② 범위 밖(보고만):
  공식 첫 검우 0.4초 + 검마다 0~0.3초 랜덤 지연(시뮬레이션 규칙), 매 공격 `texas2_skill_02_start`·`_start_02` 동시 재생, S3 배치 폭발(AppearSwordRain, `_hitEffects []`)
  대상에도 hit_02를 그리는 `expect` 규칙.

## 공식 스테이지 3D 씬 (2026-10-06)
- 3D 보드는 원래 시즌 1 아틀라스(`map_autochess`)로 모든 스테이지를 그렸다. 지금 클라이언트는 스테이지마다 완성된 씬(`scenes/activities/act*autochess/level_*`)과 라이트맵을 갖고 있고, 테마는 사막(`map_autochesssand`), 카시미어(`map_kxmr`), 시라쿠사 지하철(`map_syracuse_metro`)이다. 자세한 내용은 docs/local/official-scenes.md.
- 추출: `.venv-extract/bin/python tools/local-extract/scene_extract.py` (기본 클라이언트 경로 `/mnt/d/YostarGames/Arknights_EN/Arknights_Data`, `--stage`로 일부만) → `public/assets/local/scene/**`, `data/local-assets.json`의 `scene/*` 그룹. CAB 색인은 `logs/scene-cab-index.json`에 캐시(`--rebuild-index`).
- WebP (2026-10-06, upstream #186과 같은 방식): 텍스처·라이트맵마다 PNG 옆에 WebP를 쓰고 manifest가 WebP를 가리킨다. 컬러 맵(머티리얼의 `_MainTex`)만 손실 q95, 노멀·러프니스·발광·RGBM 라이트맵·섀도마스크는 무손실(43MB → 26MB). 클라이언트 없이 기존 PNG에서 만들려면 `scene_extract.py --webp`, 끄려면 `--no-webp`.
- 지오메트리 압축 (2026-10-06, `geom.bin` 버전 2): 위치는 씬 하나에 공통 격자 u16(`quant.pos`, 축 하나의 span이라 메시 행렬이 균일 배율 → 법선 그대로, 그룹 사이 같은 정점은 같은 점 → 틈 없음), 법선 i8×4, uv0·uv1은 그룹별 범위 u16(`q.uv0`·`q.uv1`, 그룹 재질의 `uMainST`·`uUv1ST`에 합침), 색이 하나인 그룹은 `colConst`, 정점 65,536개 이하면 인덱스 u16. pos·uv1·idx는 델타+지그재그+바이트 셔플(`quant.dzs`, `official.js unDzs`)이라 크기는 같고 gzip이 잘 줄인다. 11개 스테이지 37.2 → 18.2MB, gzip 10.8 → 3.8MB(act2 m01 8.1 → 4.1MB, gzip 2.1 → 0.71MB). 디코드 오차 위치 ≤ 0.0006칸·법선 0.4°·uv 5e-5, 시간 고정 headless 비교에서 평균 픽셀 차이 0.16~0.49(가장자리 1px·비스듬한 줄무늬 샘플링만). 읽는 쪽은 버전 1(f32·u32)도 그대로 읽는다. 기존 추출물 변환은 클라이언트 없이 `python3 tools/local-extract/scene_extract.py --requantize`(버전 1만 다시 쓰고 manifest `geom` bytes 갱신). act2 m01이 큰 것은 지하철 씬이 정점 157k로 원래 촘촘해서다(LOD 없음, 중복 정점 0.5% 미만).
- 그리기: `public/js/render/board3d/official.js`. 공식 씬이 있으면 절차 타일·배경·물 대신 그리고, 게이트·기기·지형 효과는 그대로 쓴다(필드 테두리와 활성 오리지늄 크러스트는 2026-10-07부터 안 그림 — 「공식 맵 렌더링」). 필드별 숨김 세트(HIDDEN@1/2/3)는 현재 영역에 맞춰 켠다. `?officialBoard=0`이면 예전 보드.
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
- **스킬 클립·스킬 모드 번호 교정 (2026-10-07 사용자 제보 3·4번, `research/2026-10-07-user-issues/issues-anim.md`)**: S1이 클립 없는 공용 버프라
  클립 번호가 스킬 번호와 하나씩 밀린 모델. ① 머드락(泥岩) S2가 S3의 휴면 클립(`Skill_2_Begin` 웅크림)을 틀어 "모델이 왼쪽 아래로 내려갔다 돌아옴" →
  공식 S2는 `Skill_1`(`[uc]skills.ab` skchr_mudrok_2 공격 `_animKey "Skill_1"`), `strike: true` = 강화 공격의 클립이라 시전 순간엔 아무것도 안 틀고
  그 공격(windUp/attack)이 한 번 튼다(`render/spine.js` local patch 5곳; 같은 묶음의 'skill' 끔이 그 클립을 끊지 않음). `Skill_2_*`는 S3로(휴면 10초
  자체는 미구현 — `Skill_2_Idle`로 서 있음). ② 모스티마 S3가 S2의 채널 자세(`Skill_Loop`, 공격 이벤트 없음)에 서서 공격 모션이 없었다 → S2↔S3 교환
  (S3 = charpack 모드 1의 `Skill_2_Loop`/`Skill_2_Idle`). 둘 다 `tools/assets/anim-overrides.mjs`의 클립 객체 오버라이드. ③ 같은 원인으로 스킬 모드
  (효과음·이펙트)도 이름(`S2`)으로 찾아 모스티마 S3 전용 공격음 `p_atk_whitetimewand_s`·`mostma_skill_03_*` 이펙트가 S2에 붙어 있었다 →
  `char_modes.py`가 `[uc]skills.ab`의 switch_mode 버프 `mode` 값을 스킬별 `skillMode`로 뽑고, `shared/skill-modes.js skillModeIndex`는 다른 스킬의
  프리팹이 가진 모드를 이름으로 고르지 않으며 이름으로 못 찾으면 자기 프리팹 값을 쓴다(수정: 모스티마 S2·S3, 미즈키 S2·S3; 이름과 다른 나머지 하나 —
  新约能天使 S3 → `S2_Down` — 은 이름 규칙 유지). 호출부 `fxmap.js attackMode`, `skill-mode-sfx.mjs skillModes` 각 1줄. 테스트
  `test/local-patch-skill-clips.test.js`, `test/local-patch-audio.test.js`. 같은 꼴 후보 13건(bpipe S2·S3 뒤바뀜, gnosis S3, billro S2 등)은
  `research/2026-10-07-user-issues/clip_mismatch.txt` — 하나씩 확인 필요.
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
- **炎佑가 지상 유닛처럼 타일을 차지함 (2026-10-08 사용자 제보)**: 炎 6명 맹약의 「炎佑」(`enemy_9012_acloon`, 키트가 `motion 'FLY'`)는
  비행 유닛인데 `Battle._deploy`가 생성 칸을 `_occ`에 넣어, 날아간 뒤에도 그 칸이 막혀 있었다(배치·소환·재배치·쓰러진 오퍼 복귀 대기).
  화면도 지상 유닛처럼 배치 방향 링·화살표를 그렸다. 수정: `_deploy`·`relocate`는 `motion === 'FLY'` 아군을 `_occ`에 넣지 않고 그 칸의 점유도
  따지지 않는다; `render/units.js`는 비행 아군에 방향 표시를 그리지 않는다. 테스트: `test/content/playtest4_summons.test.js`(생성 칸이 비어 있고
  지상 유닛이 그 칸에 설 수 있음), `test/ui/unitFacing.test.js`, `test/helpers/battleHarness.js checkInvariants`(비행 아군은 어느 칸도 차지하지 않음).
  - **공중 판정 (2026-10-08 후속, 사용자 「공식 규칙을 확인하고 고쳐줘. 공중 유닛이 맞아」)**: ① 비행 아군은 `unit.ground = false`
    (`_deploy`·`relocate`, 맵 카드 플랫폼 훅 `devices.js`는 비행 아군을 건너뜀). ② 炎佑가 날아가도 `tileR/tileC`가 생성 칸에 남아 적의 격자 판정
    (`alliesInTiles` 등 칸 기준 선택)이 엉뚱한 칸에서 炎佑를 잡았다 → 이동할 때마다 `tileR/tileC` = 지금 아래 칸(반올림, 점유는 안 함).
    ③ EN 클라이언트로 확인한 적 능력별 규칙(UnityPy로 `battle/enm_pfb_*.ab`·`[uc]projectiles.ab`, 버프 템플릿은 CN `buff_template_data.json`):

| 능력 | 클라이언트 | PRTS | 비행 아군 | 시뮬 |
|---|---|---|---|---|
| 【污染秽蚀】 `nhpbr`·`nhtank` | 투사체 충돌 `targetMotion 3`; 버프 `polluted_area` = `IfElse(CheckHeightTypeOfCharacterRootTile LOWLAND)` → `polluted_damage_low` / `_high`, 이동 방식 검사 없음 | 「位于低地/高地的…50/25…（可对空…）」 | 맞는다, 값은 **아래 칸 높이**로(저지대 50) | `pollution`: 비행이면 아래 칸 `isLow`(플랫폼 칸은 고지대 [추정]), 아니면 `ground` — 수정 |
| 리드 `enemy_1539_reid` 【冲锋】 | `Rush/Selector` `_targetMotion 1` | 「…距离自身最近的我方单位」 | 대상 아님 | `u.ground` 필터 — `ground=false`로 맞음 |
| 假想敌：铳 `enemy_9017_achunt` 【最终之罚】 | `TraceEnemy` `_targetMotion 1`, `tileOptions heightType 0`(저지대); 돌진 접촉 피해 `targetMotion 3` | 「位于低地且防御力最高…（不会选择飞行单位…）」「（包括飞行单位）」 | 대상 아님, 접촉 피해는 맞음 | `groundTargets`·`areaAllies` — 맞음 |
| 부패의 전차 `nhtank` 일반 공격·秽蚀轰击 | Trigger `_targetMotion 1` + `_heightType 0` | 「只攻击位于低地的我方单位，且不会攻击飞行单位」 | 대상 아님 | `canTarget` `ground && !isFlying` — 맞음 |

    일반 규칙: 선택자는 공중(`targetMotion`)과 칸 높이(`heightType`)를 따로 거르고, 높이를 거르는 선택자는 전부 `targetMotion 1`이라 비행은 늘 빠진다.
    버프 템플릿은 자기 칸 높이만 본다(비행 여부 무관) — 비행 아군은 아래 칸으로 판정 [추정: 런타임의 「root tile」 = 지금 아래 칸].
    아군 쪽 `ground` 사용처(隐德来希 S2, 赫默 재능 치료 배율, 焰影苇草 S2 순서)는 炎佑를 원래 고르지 않는다(孤立·禁疗·오퍼레이터만).
    테스트: `playtest4_summons.test.js` 「炎佑 is an air unit」(ground false, 칸이 위치를 따라감, 격자 범위), 「【污染秽蚀】 on 炎佑」(m02, 저지대 50).
- **비행 유닛 높이 (2026-10-08 사용자 제보 「적 드론이 거의 지상 유닛처럼 땅에 붙어서 나온다」)**: nas-local은 0.2.0을 병합하지 않아
  `FLY_HOVER`가 0.32칸이었다. upstream `66ae86b9`(PR #211 by @xcdoge, 연구 `docs/research/12-flying-visuals-official.md`,
  아래 모델 보정 때 함께 가져옴)를 골라 이식: 공식 클라이언트의 비행 오프셋은 모델과 무관한 상수 `Vector3(0, 0.35, 0)`(캐릭터 공간, 단위 0.27) ≈ **1.3칸**, 공식 스크린샷
  실측 1.2~1.4칸. `render/units.js FLY_HOVER = 1.3`; 몸체·HP 바·데미지 숫자·이펙트 기준점은 `hover`를 따라 올라가고 그림자는 땅에 남는다(이미
  그렇게 되어 있었음). 炎佑도 같은 높이. 테스트: `test/render/unitview.test.js`(upstream 3개 + 炎佑).
  - 모델 보정 2개도 이식 (2026-10-08 사용자 요청 「모델 보정 두 개도 이식해줘」, 같은 upstream 커밋): 帝国炮火先兆者·帝国炮火中枢先兆者는 세로
    1.263배(`modelScaleY`), 木制瑞印은 좌우 반전(`mirrorX`). EN 클라이언트로 다시 확인(`tools/local-extract/enemy_model_offsets.py`, upstream에서 가져옴):
    `Graphic` 스케일 (0.19, 0.24, 0.24) → sy/sx 1.263, 木制瑞印 (−0.4, 0.4, 0.24) → 반전; 비교용 妖怪 (0.2, 0.2, 0.2). `tools/build-data.mjs`
    `MODEL_STRETCH_Y`·`MIRRORED_PREFABS` → `data/enemies.json`(오프라인 재생성 — 바뀐 것은 이 3개 레코드뿐, 다른 data 파일은 바이트 동일),
    `render/units.js` `enemyModelScaleY`(골격 Y 스케일·HP 바 높이·임포스터), 반전은 `flip`에 곱함. 2ec78a6d의 `UNIT.modelScale` 0.0027·
    `TOKEN_MODEL_K`는 그대로(보정은 그 위의 비율). 연구 문서 `docs/research/12-flying-visuals-official.md`도 가져옴. 테스트
    `test/render/playtest6-enemies.test.js`(upstream 그대로, 수정 전 렌더러로 2개 실패 확인). merge-0.2.0에는 v0.2.0으로 이미 있다(stronghold-79 확인).

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

## 작전 종료 효과음 (2026-10-07)
- 사용자 제보 「라운드별 작전 종료 효과음이 빠져 있다」: 공식 효과음 3개는 이미 웹 매니페스트에 있었다(`sfx.ui.battleOverReduce` / `battleOverNoReduce` /
  `battleOverNormal` = `act1autochess_b_ui_battleover_reduce|noreduce|normal.mp3`, 뱅크 `ui.ON_ACT1AUTOCHESS_BATTLEOVER_*`, 각 1.4초) — 받기만 하고 재생하는
  곳이 없었다. 외부 저장소를 따로 찾을 필요 없음.
- 재생: 내 일반 전투(COMBAT)의 결과가 오면(`screens/game.js onResult`, 전투 종료 배너와 같은 자리), 배너 그림(로컬 추출)이 없어도 소리는 낸다.
- 어느 소리인지(`audioOfficial.js battleOverOf`): 셈하는 누수(LP 감소) → REDUCE(뱅크 이름 그대로), 누수 없음(완벽한 작전) → NOREDUCE [추정],
  셈하지 않는 누수만 → NORMAL [추정]. 클라이언트 `round_result_dialog`의 애니메이션 3개(`_allPrefectAnim`·`_perfectAnim`·`_missAnim`)와 짝으로 봤다.
  어느 애니메이션이 어느 뱅크를 부르는지는 네이티브 코드라 확인 못 함 — 세 파일은 음색·길이가 거의 같은 변형이다. 공식 영상(소리 있는 것)으로 확인하면 좋다.
- 联防·보스 라운드에는 내지 않는다(공식 결과 창이 다른 프리팹). `killBoss*`·`defenceStart`도 아직 연결 안 됨.
- 테스트: `test/local-patch-battleover.test.js`.

## 스킬 범위 발동 (2026-10-07, 사용자 결정 — 미확정)
> 0.2.0 병합에서 upstream `ACTIVE_RANGE` 규칙으로 대체(사용자 결정 2026-10-07). `local-skill-range.js`는 지웠다. 「미확정」은 그대로.
- 사용자: 「스킬 범위가 공격 범위보다 넓은 오퍼레이터는 기본 공격을 못하더라도 스킬 범위 안에 적이 들어오면 자동으로 스킬을 사용해야 한다. 본체가 공중을
  못 쳐도 스킬이 공중을 치면(赤刃明霄陈 S3) 공중 적도 발동 조건」. 근거는 사용자 기억과 다른 플레이어의 제보이고 **공식 자료와 다르다** — 공식 기본 전략
  (`skillTriggerDataList`가 없는 MANUAL 스킬, PRTS 卫戍协议/帮助 「技能就绪，且即将进行普通攻击」, 「攻击范围扩大」 같은 공격 범위 변경은 기본 전략)이
  맞을 수도 있어 사용자가 별도 기록을 요청했다(STRONGHOLD.md §11). 끄기: `local-skill-range.js WIDE_SKILL_RANGE_TRIGGER = false`(테스트 몇 개는 다시 맞춰야 함).
- 대상: 아군 기물(chess)의 MANUAL 스킬 중 데이터 규칙이 DEFAULT(직업 행·공식 SKILL_RANGE·키트 지정 규칙 아님)이고, 치유 스킬이 아니며, 스킬 범위에
  공격 범위(기물 `rangeGrid`)에 없는 칸이 하나라도 있는 것. 데이터(`chess.json`·`diy.json`의 `trigger`)는 공식 그대로 두고 시뮬레이션에서 덧붙인다.
  2026-10-07 데이터 기준 36개(白面鸮 S2 같은 치유 스킬은 빠짐; 深巡 S2 같은 DEFAULT 예외도 포함. 莫斯提马 S3, 烛煌 S2·S3, 望 S3, 赤刃明霄陈 S3, 百炼嘉维尔 S2, 伊内丝 S2, 银灰 S3, 夕 S2·S3, 铃兰 S3 …). 예전 일시 예외였던
  望 S3·赤刃明霄陈 S3 SKILL_RANGE(2026-10-06에 공식으로 되돌림)를 일반 규칙으로 다시 켠 셈.
- 동작: 스킬 범위를 DEFAULT의 추가 발동 범위(`SkillRuntime.addTriggerRange`, 매 틱)로 건다 — 공격 범위 안의 적이 평타 직전에 켜는 원래 규칙도 그대로.
  자동 조작 3초 쿨다운 유지. 세는 적: 선택 가능한 적(미노출 은신·선택 불가 제외), 공중 적은 스킬이 공중을 칠 때만 — 키트 스펙 `hitsFly`, 없으면
  `targeting.canHitFly`, 없으면 유닛 프로필(근접 「攻击范围扩大」는 공중 적으로 안 켜짐). 공식 SKILL_RANGE(「无视其不可选中」)와 다르게 선택 가능 여부를 본다 [추정 — 사용자 결정 범위 밖].
- 바뀐 테스트: `feedback1e-skillrange`(烛煌 S3 발동·사격 대기 `untilS3Shot`), `kits_t5`(烛煌 S3·百炼嘉维尔 S2 시간창), `feedback1-transform`(실전 라운드 2개:
  莫斯提马 S3가 먼 적에 먼저 켜져 결과가 달라짐 → 스킬·자리 조정), `local-patch`(望 S3·陈 S3 규칙 테스트를 새 규칙으로, 望 棋子 대각 테스트는 S3를 안 켬).
- 알려진 차이: 틱에서 켜지므로 이미 나간 일반 공격의 쿨다운(BAT 그대로)이 끝나야 첫 스킬 공격이 나간다(엔진 그대로, 공식 SKILL_RANGE 스킬과 같음).

## 배치 낙하 (2026-10-07)
- 사용자: 「인게임에서는 하늘에서 떨어지듯이 배치된다」. 조사 `research/2026-10-07-deploy-drop/`(사용자 캡처 프레임 시트,
  `start-clip-survey.tsv`). 낙하는 코드가 아니라 각 모델의 Spine `Start` 클립이다(143명 중 103명: 몸 높이 0.6–7배 위에서, 착지 중앙값 0.2초, 가속·튐 없음,
  `OnStart` 이벤트 = 착지). 나머지 40명(赤刃明霄陈·蕾缪安 등)은 자기 등장 동작.
- 원본도 배치 때 `Start`를 틀었지만 가려졌다: 0.25초 투명도 페이드, 전투 시작처럼 모델이 로드되기 전에 'deploy'가 오면 `Start`를 건너뜀(그냥 Idle로
  서 있음), 새 모델 0.2초 크로스페이드, impostor 슬롯이 서 있는 자세 크기, `fx.deploy` 민트 기둥·링·입자.
- 고친 것(아군 + Spine 모델이 있는 유닛만, `UnitView.onDeploy`가 true를 돌려줌 → `bornOfficial`): 페이드 없음, 기둥 없음, 로드 전 배치는 로드되면 그만큼
  지난 시점부터 `Start` 재생(크로스페이드 없이), 클리핑 없는 모델은 낙하 중 impostor를 쓰지 않음(클리핑 모델은 위로 7배 넓힌 슬롯), 첫 0.1초 RGB×0.6
  [추정: 캡처 첫 프레임이 어둡다(≤66ms), 클라이언트 `_disableBornTweenColor`]. 정비 단계: 보드 배치·벤치 도착(구매·반환)·보드→벤치 복귀 모두 낙하, 목표 칸으로
  미끄러지지 않고 그 자리에서. 보드→보드 이동은 예전처럼 미끄러짐(캡처에서 높은 낙하는 안 보였다 — 카메라 이동 중이라 불확실). 적·모델 없는 마름모는 원본 그대로.
- 확인: Windows Chrome `sp-check\drop.mjs <port> <charId> <out> [quality]`(디버그 아레나 재시작 직후 14장) — 텍사스가 타일 위에서 떨어짐,
  high·low 모두. 원본은 같은 자리에 민트 기둥 + 이미 선 모델. 단위 테스트 `test/render/local-deploy-drop.test.js`.
- 라운드 시작 (2026-10-07 후속): 실제 솔로 판 1라운드를 재 보니(`sp-check\roundstart.mjs <port> <out>` — autoplay, CDP 스크린캐스트,
  UnitView 훅 로그) 전투 시작 때 'deploy'가 온 뒤 모델이 0.17–0.31초 늦게 들어왔고(뷰마다 SpineActor를 새로 만듦), 클립을 그만큼 따라잡아 대부분 이미
  착지한 채 나타났다(낙하 안 보임). → 모델이 없을 때 배치되면 링(방향 표시)·그림자만 먼저, 몸·마름모·바는 감춘 채 최소 `BORN_LEAD_S` 0.1초 + 모델이
  들어올 때까지 기다렸다가 `Start`를 처음부터(1초 안에 안 오면 예전처럼 마름모). 모델이 이미 보이는 배치(정비 배치·재배치)는 바로 떨어진다.
  다시 잰 결과: 그림자 0.09초, 몸 0.23–0.41초(클립 0.02–0.07초 지점부터) — 공식 캡처(링 → 약 0.1초 뒤 몸)보다 링이 먼저 보이는 시간이 모델 준비만큼
  길다. 공식 캡처의 0.1초도 실제로는 배너 뒤·화면 밖의 낙하 앞부분일 수 있다(링 → 착지 170ms ≈ 클립 착지 시간).
- 전투 시작 낙하 (사용자 2026-10-08 「작전 시작할때 배치 효과음은 나오는데 배치 연출이 안나오고 있어」): 여기서는 재현 안 됨 — `roundstart.mjs` 계열
  (솔로·협동 봇 3, 1·2라운드, 품질 high·low, 1280×720·1920×1080: `roundstart2.mjs`·`roundstart_coop.mjs`, env `Q`·`VW`·`VH`)에서 모두 몸이 클립 0.01초
  지점부터 보이고 프레임에 낙하가 찍힘. 낙하를 삼킬 수 있는 길을 막음 [추정: 사용자 화면의 원인]: 긴 프레임(전투 전환)이 기다림(`_bornWait`, 한 프레임 최대
  0.25초)을 다 쓰거나 `Start`를 건너뛰지 않게 낙하 중에는 한 프레임 최대 1/30초(`DEPLOY_MAX_STEP_S`), 화면 밖에 있던 시간(`_offDt`)도 낙하 중에는 더하지 않음.
  단위 테스트 「a long frame (the battle switch) …」(수정 전 실패 확인). 사용자 화면에서 또 안 보이면 품질·창 크기·첫 판 여부를 받아 다시 잴 것.
- 처음 나타날 때 검은 실루엣인 오퍼레이터(아스카론·赤刃明霄陈 등)는 `Start` 클립 자체의 슬롯 색이 검정 → 원래 색이다(0초 0.0, 0.3초 0.78) — 공식 등장 연출.
- 작전 시작 낙하가 한 명씩 (사용자 재제보 2026-10-08 2-4 「작전 시작 낙하가 보이지만 위수협의보다 빠름」; 사용자 결정 2026-10-08: 화면만):
  공식 영상 `녹화\stronghold fx\왕 S3.mp4`(30fps 실시간 — 전투 카운트다운이 정확히 30프레임마다 바뀜)의 전투 시작에서
  오퍼레이터는 **차례로** 내려온다: 링이 나타나는 프레임 204·207·211·215·219·222·…·230 = **약 0.12초 간격**, 9명에 약 0.9초, 한 명의 낙하는
  약 0.17–0.2초. 우리는 모두 같은 순간에 배치되고 `Start`가 전투 배속으로 정확히 2배(실제 판 계측 `sp-check\dropspeed.mjs`:
  6.25ms 프레임마다 클립 0.0125초) → 낙하 전체가 약 0.1초에 끝났다. 클립 배속 자체는 공식 望(검은 실루엣 → 색 0.69–0.83초)으로 재면 약 1.6배지만
  녹화에 같은 프레임이 최대 4장 반복돼(게임 끊김) 1.3–2.0배까지 범위가 넓어 판정 못 함 → **2배 그대로**.
  고친 것: `render/app.js` 전투 'deploy'가 전투 시계 1초 안(`OPENING_DROP_GT`)의 아군(정탐 보드·장치 제외)에 차례 번호(`openingDrops`)를 매기고,
  `units.js onDeploy({ order })`가 번호 × `BORN_STAGGER_S` 0.12초 동안 링·그림자·몸·바를 모두 숨겼다가(`_bornHold`, 긴 프레임은 한 번에 최대 0.25초)
  보통 낙하를 시작한다. 배치 효과음(과 행동출발 다음 사람들의 대사 판단)도 같은 간격으로 미룬다(`audio.js OPENING_DEPLOY_STAGGER_MS`; 필드의 첫 deploy부터
  0.4초 안, 첫 전투 이벤트 atk·dmg·heal·die·leak 전까지 — 한 번에 들어오는 따라잡기 묶음의 나중 소환은 미루지 않음; 새 필드면 남은 차례 취소).
  시뮬레이션은 그대로라 숨어 있는 동안(최대 약 1초) 유닛이 이미 행동할 수 있다 — 시뮬레이션 차례 배치는 별도 항목. 차례 = 시뮬레이션의 배치 순서
  [추정: 공식 순서는 놓은 순서도 왼쪽→오른쪽도 아닌 것으로 보였다]. 확인: 실제 솔로 판 COMBAT:2(`sp-check\sd_check.mjs <port> <out>`)
  말 4개의 몸이 배치 후 +96/+114/+233/+353ms, 프레임 `sd1-c2-*`에 차례 낙하. 단위 `test/render/local-deploy-drop.test.js` 「one by one」,
  `test/local-patch-audio.test.js` 「opening deployment sounds one by one」.
- 남은 차이: 착지 전에 시뮬레이션이 이미 공격하는 것(텍사스가 공중에서 첫 공격 — 공식은 `CHARACTER_BORN_TIME` 동안 못 하는 듯 [추정], 시뮬레이션
  변경이라 따로 — 위 차례 배치도 시뮬레이션에서 하면 같이), 배치 효과음 시점(캡처에 소리 없음).

## 배치 효과음 — 어떤 경로로 놓이든 (사용자 제보 2026-10-07 #1·#2)
- 사용자: 「상점 구매, 정예화 보상, 전장에 배치 등 어떤 방식으로 배치되든 배치 효과음이 나와야 함」, 「일부 오퍼레이터(왕·위 등)는 전용 배치음」.
  소환물도 배치음이 있고, 왕의 바둑돌은 수동 배치·재능 배치 모두 소리가 난다(사용자 확인).
- 원래: 전투의 'deploy' 이벤트에서만 났다(라운드 시작 배치는 실제 판에서 확인함 — b_char_set 7 + 자기 소리). 정비 단계 배치·구매·보상·벤치 복귀는 무음,
  구매는 상점 소리 `ON_ACT1AUTOCHESS_MAGIC_PLACE_HAND`(b_char_tokenset = 소환물 배치음)였다.
- 공식 자료(EN `audio_data.json`): 유닛 탄생 `battle.ON_UNIT_BORN.<id>`(전용) → `.char` b_char_set / `.token` b_char_tokenset, 그룹 Battle_UI_Important.
  우리 로스터의 전용 배치음은 매니페스트에 이미 다 있다(`sfx.units[id].born`): 오퍼레이터 15명(望 b_char_stwctpbn, 余 p_skill_frbytrtn_bn, 斯卡蒂2 등),
  소환물 11종(望 棋子 p_imp_stwctptkin, 维什戴尔 wward, 诅咒娃娃 등). 卫戍协议에는 「말 놓기」 전용 뱅크가 없다(`act1vautochess` SHOP_DROP=b_char_set은 다른 모드)
  → 정비 단계도 유닛 탄생 소리를 쓴다 [추정: 공식 정비 화면이 유닛을 전투 유닛처럼 그리고, 놓일 때 Start 낙하가 나온다 — 「배치 낙하」].
- 고친 것: 소리는 정비 화면의 **낙하 연출과 같은 곳**에서 난다 — `render/app.js` setPrep이 내 보드·벤치 상태를 이전과 비교해 낙하(onDeploy)를 틀 때
  `pieceDeploy` 이벤트(`prepDeployed`) → `screens/game.js` → `audio.prepDeploy` → `playDeploySfx`(전투 'deploy'와 같은 함수: 전용 소리 → 공용, 공식 믹스).
  서버가 넣어 주는 보상(정예화 보상·결산 보상)도 상태 비교라 잡힌다. 경우별:
  - 소리 남: 구매·보상으로 벤치 도착, 벤치→보드, 소환물(전용 또는 b_char_tokenset), **전투 뒤 정비로 돌아올 때 보드의 말**(`backFromBattle` — 사용자
    2026-10-08 「라운드 종료 후, 배치 단계 진입할때도 배치음이 나오는게 맞아」), **협동 정비에서 남의 보드를 보러 갈 때 그 보드의 말**(사용자 2026-10-08:
    남의 보드도 소리 남)과 내 보드로 돌아올 때 [추정: 돌아올 때도 같은 규칙]. 벤치 말은 낙하만.
  - 소리 없음: 보드→벤치 복귀(낙하는 함 — 사용자 2026-10-08 「벤치로 되돌릴 때는 배치음이 안나오는게 일단 맞는 것 같아」), 판매, 페이지 로드·재접속
    첫 동기화, 전투 뒤 벤치 복원, 3장 합성 엘리트(합성 연출·`merge` 소리), 장비, 남의 보드(정탐은 전투 화면).
  - 낙하(사용자 2026-10-08 「공식은 배치 연출이 있어. 협동 모드 중 휴식 기간에 다른 사람을 확인하려 갈때도 배치 연출이 보여」): 전투 뒤·정탐 뒤 내 정비로
    돌아올 때 말 전부(벤치 포함 [추정: 클라이언트 정비 말은 칸·슬롯에 새로 만드는 더미]), 정탐한 보드(`enterBattle({prep})` → `battleView`)의 말 전부가
    떨어진다. 같은 보드에 다시 들어오면(팀원이 말을 옮겨 m.field가 새로 옴, `scoutSeen`) 새로 왔거나 옮긴 말만. 실제 협동 판(`sp-check\dv_coop.mjs
    <port> <out>`: 봇 3, 2라운드 — 팀원 줄 클릭 → 「보러 가기」 → 내 줄)에서 ROUND_START:2·정탐·복귀 모두 onDeploy + b_char_set, 프레임 `dvc4-scout-*`에 낙하.
  - 벤치→보드를 실제 UI로(끌어 놓기 → 방향 휠 → 확정) 하면 소리·낙하가 없었다(사용자 2026-10-08 「오퍼를 벤치에서 보드에 배치시, 배치 효과음이 안나와」):
    휠의 `holdPiece`가 그 칸을 뷰의 집(`_home`)으로 만들어 `moved`가 false라, 놓은 지 1.3초(`DROP_PENDING_MS`) 안에 온 상태는 「서버 적용 전」 분기로
    빠졌다(snd_prep.mjs는 `actions.move`를 직접 불러 이 경로를 안 탔다). 상태에 보드로 새로 나타난 말은 그 분기에서 뺀다. 확인 `sp-check\dv_drag.mjs
    <port> <out> [확정까지 ms]`(실제 마우스 끌기 + 방향키): 0.3초·2초 확정 모두 onDeploy + b_char_set.
  - 한 틱에 여럿(서버 자동 배치가 8~12개를 한 번에): 기존 제한기(같은 소리 45ms 간격·동시 2개)가 1~2번으로 줄인다.
  - 라운드 시작: 정비에서 막 놓은(1.5초 안, `PREP_DEPLOY_OVERLAP_MS`) 같은 모델의 전투 'deploy'는 다시 울리지 않는다.
- 함께 고친 것: 1라운드처럼 보드·벤치가 비어 있을 때 **첫 말이 낙하하지 않던 것**(`before.length` 조건) — 동기화를 한 번 마친 뒤(`prepSynced`, 모든 말이 자리를 찾음)면
  빈 상태 다음 말도 새로 온 것. 오퍼레이터 구매는 상점 소리(b_char_tokenset)를 빼고 배치음만(장비 구매는 그대로).
- 확인: 단위 `test/local-patch-audio.test.js` 「deploy sounds on every placement」, 소스 `test/render/local-deploy-drop.test.js`. 실제 판(Windows Chrome,
  `sp-check\snd_prep.mjs <port> <out>`: 솔로 판, 1라운드 정비에서 구매 → 보드 → 벤치, 자동 배치, 전투 시작) — 세 경로 모두 b_char_set,
  전용 소리(b_char_tpartclce·snwlprdg·p_skill_frbytrtn_bn) 확인, 전투 뒤 정비 시작에 전체가 울리지 않음.

### 望 棋子 효과음 (사용자 제보 2026-10-07 #5 「터질 때 뭔가 빠진 느낌」, #1 재능 바둑돌 배치음)
- 공식(EN `audio_data.json` + zh_CN `buff_template_data.json`): 놓은 바둑돌(토큰)이 터지면 그 토큰 능력 `ON_ABILITY_START.sktok_wang_<n>`
  = **p_atk_stwctp_d / _h / _s**(Battle_P_SAtk) + 타격 p_imp_stwctp_*(Battle_P_SImp). 우리는 타격음만 냈다(빠진 쪽 = 터지는 소리 자체).
  - S1 取势 타격 `wang_stone1_t[damage_audio]`: 적에게 거는 `wang_stone1_t[damage]`(지속 `sluggish`, `triggerInterval 1`, 첫 발 즉시)의 자식 버프가
    **매 틱** p_imp_stwctp_d를 튼다 → 6.5초 동안 7번. 우리는 터질 때 1번이었다.
  - 재능 바둑돌(跟子 = 望의 투사체, PRTS): S1·S3는 같은 파일(`ON_PROJECTILE_HIT.projectile_chr_wang_stone1`, `BEHAVIOUR_TRIGGER.…stone3`),
    S2는 `ON_PROJECTILE_BEHAVIOUR_TRIGGER.projectile_chr_wang_stone2` = p_atk_stwctps_h.
  - 배치음: 수동(놓은·재배치) 바둑돌 = 토큰 탄생 `ON_UNIT_BORN.token_10064_wang_stone1` p_imp_stwctptkin, 재능 바둑돌 = 투사체 탄생
    `ON_PROJECTILE_BORN.projectile_chr_wang_stone1~3` **p_imp_stwctptkpa** — 두 소리가 다르다(사용자: 둘 다 소리 남).
- 고친 것: `tools/assets/kit-sfx.mjs` 키 5개(`wang:1s/2s/2fs/3s`, `wang:thrown`, 파일 5개 새로 받음), `audio.js kitStartKey`(터지는 소리 → 그다음 `kitHitKey` 타격),
  S1의 `wang:1`은 `kits/diy.js` DoT 틱마다 소리 전용 fx `kitHit`(`zone`에서는 S1 타격음을 빼 이중 재생 없음). 재능 바둑돌은 같은 틱의 `summon` fx `follower`
  (이펙트 세션이 넣은 플래그)로 알아보고 토큰 탄생음 대신 `wang:thrown`.
- 안 한 것 [추정]: 다 쓴 바둑돌의 `ON_UNIT_DEAD`(b_char_tokendead) — 우리 시뮬레이션은 터진 바둑돌을 퇴장시키지만 `consumed`라 무음으로 둔다(공식이 이때 죽음 소리를
  내는지 자료로 확인 못 함 — 사용자 귀로 확인 필요). 동시에 여럿 터질 때 공식 popOldest(최대 1~2)보다 우리 제한기(키별 160ms)가 더 줄인다.
- 확인: `test/local-patch.test.js` 「望 client-data rules」(틱 수 = kitHit 수, 시뮬 수정 전 실패 확인), 「望 (user report 2026-10-07 #5)」, `test/local-patch-audio.test.js`
  「望 stone pop」·跟子 배치. 디버그 아레나(Windows `sp-check\snd_wangpop.mjs <port> <skill> <ms>`: 샌드백을 활성 바둑돌 칸으로 옮김) —
  S1 p_atk_stwctp_d + p_imp_stwctp_d, 이후 1초마다 p_imp_stwctp_d(총 7), S2 _h, S3 _s, 재배치 바둑돌 tkin, 재능 바둑돌 tkpa(tkin 없음).
- 望 S3 발동음 (사용자 제보 2026-10-08 「S3 발동할 때 전용 사운드가 안나와」): 공식 `battle.ON_SKILL_START.skchr_wang_3` = **p_skill_stwctp_s**
  (Battle_UI_Boost; S1·S2는 시작 뱅크 없음). `tools/assets/plan.mjs`가 소리 있는 스킬이 하나뿐이고 그게 풀의 기본 스킬 번호가 아니면 `skill`도 `skills`도
  안 넣어 통째로 빠졌다 → 그 경우도 `skills`에 넣음. 같은 이유로 무음이던 琳琅诗怀雅 S3·普罗旺斯 S2·华法琳 S2(b_char_atkboost / healboost)도 같이 생김.
  매니페스트 재생성(fetch-assets)으로 바뀐 것은 이 4명 + 파일 1개(p_skill_stwctp_s.mp3). 디버그 아레나에서 S3 발동 때 p_skill_stwctp_s 재생 확인
  (`sp-check\snd_wangs3f.mjs <port>` — 아레나는 샌드백이 범위 밖이라 S3가 저절로 안 켜져서 `skill.activate`로 켬). 테스트 `test/local-patch-audio.test.js`.

## 유닛 모델 크기 (2026-10-08, 사용자 제공 공식 PC 캡처)
- 근거(클라이언트 EN): 오퍼레이터 전투 스킨 `chararts/<char>.ab defaultskin.prefab` FaceSwitcher 스케일 0.27 × SkeletonDataAsset 0.01(호시구마·첸 등
  확인), 적도 같은 0.27 표준(`enemy_scales.py`), 타일 = Unity 1단위. 캐릭터 프리팹 `Graphic`이 X축 −30°로 기울어 30° 카메라(`projection.js OFFICIAL`)를 정면으로
  보므로 화면에서 스켈레톤 1단위 = 발 위치의 타일당 px × 0.0027. 원본은 `UNIT.modelScale` 1/320(≈ 16 % 큼) → **0.0027**(`style.js`),
  머리 높이 `UNIT.headroom` 1.18 → 1.02(같은 비율; 이펙트 head/body 앵커·숫자 위치가 따라감).
- 소환물: 프리팹마다 곱이 달라(`pkgrps/btl_pfb_tokens_*.ab`) 적처럼 0.27 대비 계수 `units.js TOKEN_MODEL_K`: 医疗探机·诅咒娃娃 0.4, 香槟炸弹·
  银灰(svash2) 독수리 3종 0.25, 나머지 0.27(tokens.json 전부 확인; char_605/613·acloon은 프리팹 못 찾음 → 1).
- 화면 대조(타일 폭 대비 키, 머리 끝~발): 琳琅诗怀雅 공식(`research/2026-10-07-user-issues-3/official-pc-round8.png`, 공격 중) 1.14 · 수정 전 1.24 · 수정 후 1.08;
  赤刃明霄陈 S3 공식 녹화 1.07 · 수정 전 아레나 1.35 · 수정 후 ≈ 1.17(계산). 자세가 달라 ±8 % 오차 [추정] — 판단은 클라이언트 수치로 했다.
  공식 이펙트(월드 단위)는 바뀌지 않으므로 모델 대비 이펙트 크기도 공식에 가까워진다(첸 S3 용 머리가 몸에 가리던 것).
- 확인: Windows `sp-check\usz_arena.mjs <port> <out> <charId> <row,col> [stage:<id>]`(디버그 아레나 m03), `usz_mock.mjs`(game-mock 페이즈) →
  `usz-swire*.png`, `usz-prep-after.png`. `unitview.test.js` 머리 높이 기대값 1.02.

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
- 일부러 안 가져온 것: #190 팀원 표시(PR #227 — 원본 0.2.0은 다른 방식 ef101647, UI), #205 원거리 우선순위(PR #220 — 관리자 재현 못 함),
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
- (뺐음, 2026-10-06) 방어 지점 경보음: 원본 #134(d5829258)가 같은 `ON_ENEMY_REACHED_EXIT`를 넣어 로컬 `leak-sfx.mjs`·`audio.js` 2줄·테스트를 지웠다(사용자 결정: 원본 사용)

## 테스트
- `node --test test/local-patch.test.js` — 로컬 테스트 109개.
- 전체 `node --test` (2026-10-08, merge-0.2.0 하드 포크 후): **실패 0이 기준.** 하드 포크(「0.2.0 병합」)부터 upstream 테스트도 우리 것이라,
  로컬 동작 변경으로 깨지던 원본 테스트는 「의도한 실패」로 두지 않고 고쳤다. 고친 곳마다 `local patch` 주석이 근거 절을 가리킨다:
  - 동작 변경에 맞춘 것: `render/unitview` 등급 칩(전투 중 없음), `render/playtest6_elembar`(원소 줄은 공식 발밑 바 `lpBars` 아래),
    `render/feedback3-leader-prep`(보스는 `lpBars`), `sim/battle` 'dmg' 5번째 칸(숫자 플래그), `content/enemies_bosses` 管·弦 첫 발동(공식 SP
    50초 / 25초, `firstCast`), `sim/feedback1f-liftoff` 제국의 갑주 포격(1.33초부터 0.53초 간격, 5.5초 동안 8발), `docs-consistency` 음성 경로
    `/voice/kr/`·결산 대사 보관(`holdResultVoice`), `asset-network` 음성 기본 `kr`, `version` 자체 버전 표기, `ui/feedback3-audio-mix`
    공식 믹서 게인(`officialGain`), `ui/standin-ui` 모델 서명 뒤 소환물 칩, `docs-paths`(옛 설계 문서 15.1절 인용을 문장으로).
  - EN 클라이언트에 없는 것 허용: `ui/emotes`·`ui/localArt`(愚人节 이모티콘 테마 — fooldoctor 등 — 번들이 EN에 없음: 추출 안 된 테마는
    건너뜀), `ui/moduleIcons`(INC-Y 아이콘이 EN `ui_equip_type_hub_h2_0.ab`에 없음 → 글자 타일), `render/board3d-extract` 立绘(`chararts`는
    WebP만 — 아래 「立绘 추출」).
  - 고친 버그: `render/board3d-extract` 노멀 맵 — EN 클라이언트의 `TX_autochessi_N`은 Unity DXT5nm(R=1, X는 A, Y는 G)인데 BC5(R=X)로 읽어
    파생 노멀이 평평했다(z 평균 128). `tools/local-extract/extract.py derive_normal_rg`가 R이 전부 255이면 A를 X로 쓴다; 기존 PNG에서 다시
    파생(`run_derived` + `run_webp`, 클라이언트 불필요). 泥岩 뒷모습 S2 클립(`assets.test`, nas-local 7fcaec09).
  - 2026-10-08 nas-local(ccf3058e)에서 다시 확인: 4716개 중 통과 4712, 실패 0, 건너뜀 4(Chrome·zip·토큰 모델 추출 필요). 새로 받은 노멀
    맵은 B 평균 249. EN 클라이언트에 `emoticon_foolsday_*` 번들이 없고, `ui_equip_type_hub_h2_0.ab`·`ui_equip_type_direction_hub_h2_0.ab`에는
    `inc-x`만 있다(UnityPy로 확인) — fooldoctor·INC-Y는 CN 클라이언트가 있어야 뽑을 수 있다.
  - 가끔 시간 문제로만 실패(단독 실행은 통과): `lobby` 「solo resume window」, `lobby-integration` 재접속, `match/realtime` 「real-time co-op over websockets」.
  - golden 다이제스트는 전투 규칙을 바꾸면 `npm run golden:update`로 다시 만든다(바뀐 결과가 의도한 것인지 먼저 확인).
- `node --test test/local-patch-battle.test.js` — 2026-10-06 플레이 제보 전투 버그 테스트 6개(우타게 S2 그림·저지, 魔王 S3 재분배, 은신·위장 vs 스플래시, 污染秽蚀 vs 은신).
- `node --test test/local-patch-camou.test.js` — 위장 아이콘(`UF_CAMOU`) 테스트 2개.
- `node --test test/local-patch-status-boomerang.test.js` — 상태 이펙트 중첩(제보 4차 4-1)·回环射手 부메랑(4-6) 테스트 9개(跃跃 스킨 데이터는 로컬 Spine 소재가 있을 때만).
- `node --test test/local-patch-hud.test.js` — 전투 화면 UI 테스트 30개(화면 고정 단위, 아군 바 위치·색, 탄환 칸, 전투 중 칩 없음, 정비 칩 그림 고르기, 장비 바, 적·보스·거대 보스 바, 받침 그림, 보스 SP, 관의 공식 SP 발동, 원소 링, 공식 숫자·설정, 상태 이펙트, 방향 표시, `b.snap.ammo`).
