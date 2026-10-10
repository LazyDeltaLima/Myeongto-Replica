# 선발 오퍼레이터

옛 `docs/LOCAL-PATCH.md`에서 2026-10-09에 나눈 파일이다. 옛 절 이름은 `docs/LOCAL-PATCH.md` 색인에서 찾는다.

## 선발 오퍼레이터 (2026-10-05, 0.2.0부터 upstream 自选 틀)
- 원본 甄选 규칙(공식 데이터 + bilibili wiki 盟约): V·VI단계 2칸씩, 경기 전 오퍼레이터 구성 화면에서 고른다. 고른 오퍼레이터는 그
  플레이어 상점에만 나오고(공식 문구 「只出现在自己的商店里」), 일반 E2 Lv1·스킬 4 / 정예 E2 Lv60·스킬 7·모듈 1(V) 또는 3(VI), 가격 4·판매 1·3장 합성. 특질 없음.
  맹약은 진영으로(위키 규칙, 叙拉古·卡西米尔 확장은 [추정]), 없으면 협방(emptyShip): 왕·첸 → 염, 나머지 → 협방.
- 지금 구현(0.2.0부터): upstream 「自选」 틀이 선발 칸·재고·상점·보상·밴을 맡는다(`server/match/player/diy.js initDiyStock`, `shared/diy.js`, 데이터
  `data/backups.json` `diy`). 맹약이 전부 꺼진 픽은 그 판 재고가 없다(`m.private.diyBanned`). 이 포크는 후보를 직접 구현·대조한 5명으로 줄인다:
  `shared/local-diy.js LOCAL_DIY_PICKS`(望·赤刃明霄陈·维什戴尔·丰川祥子·阿斯卡纶) — `tools/build-data.mjs`가 이것으로 `diy.ownedPool`을 만들고,
  `server/lobby.js`가 다른 픽을 거부한다. 키트는 `server/sim/content/kits/ops/op-{wang,chen3,wisdel,oblvns,ascln}.js`(등록 `kits/index.js OPERATOR_KIT_FILES`).
  틀의 자세한 규칙은 `server/sim/content/kits/README.md`, 병합 경위는 `upstream.md` 「0.2.0 병합」.
- 0.2.0 전(2026-10-05 ~ 10-07)에는 전용 데이터·풀·UI를 직접 만들었다. 그 구현은 지웠고, 그때 정한 키트 동작과 관리자 결정은 `op-*.js`로 옮겨져 아래에 남는다.
- 키트:
  - 왕 (2026-10-05 재작성, 공식 테이블 + PRTS 「望」 비고): 바둑돌(손패 소환물, 지상·고지대 아무 배치 칸 — 토큰 position ALL)은
    **함정**: 공격 대상이 되지 않고 피해를 받지 않는다(untargetable + invulnerable, 클라이언트 HP 바 없음). 직교로 한 번 이어지면 활성화되고,
    이어진 돌이 사라져도 활성 상태가 유지된다. 적(비행 포함)이 발동 범위에 들어오면 발동(돌은 남음). 발동 범위는 자기 칸, S3를 장착하면(패시브)
    `x-1`(반경 2 마름모 13칸, 2026-10-06 관리자 결정: 공식대로) 전체 → 고지대 돌도 S3면 지상 적을 잡고, S1/S2면 비행 적만 밟는다(S2 폭발은 연결 방향 지상 적도 맞힘).
    - S3 범위의 근거 (2026-10-06 재확인): 넓은 범위는 **S3 장착(패시브) 기준이고 S3 발동 중에만이 아니다.** skill_table 「被动效果：棋子的触发和伤害范围扩大」,
      PRTS 天下劫 비고 「※携带该技能时，棋子与跟子的攻击范围/触发范围为{{popup/range|x-1}}，可响应飞行单位，触发时对范围内所有敌方单位造成伤害（可对空）」.
      EN 클라이언트: 토큰 스킬 `sktok_wang_3.prefab`(숨김 패시브, 발동 상태 조건 없음)의 `SkillTrigger`·`Selector`(폭발) 범위 컴포넌트가 둘 다 `_rangeId "x-1"`,
      S3가 발동 중에 쏘는 돌 `projectile_chr_wang_stone3.prefab` Selector도 `x-1`(S1/S2 돌 `stone1`/`stone2`는 `0-1`). S3 발동은 망의 모드만 바꾼다
      (`skchr_wang_3` SwitchMode `mode 2` = 평타 정지 + 적 칸 배치 버프 `wang_token_deckbuff`) — 범위를 바꾸는 노드는 없다. `x-6`은 skill_table
      `sktok_wang_3.rangeId`에만 있고 프리팹 어디에도 없다(비교: 多萝西 `sktok_doroth_3`은 표 `x-6`, 프리팹은 발동 `0-1`만 있고 폭발 Selector에 범위
      컴포넌트가 없음 → 표 범위는 프리팹에 범위가 없는 노드에 쓰이는 것으로 보인다 [추론]). 따라서 모양도 `x-1`(마름모 13칸) — 예전에
      「너무 넓다」는 피드백으로 `x-6` 십자로 되돌렸으나, 이 근거를 보고 관리자가 공식대로 마름모로 정했다(2026-10-06, `op-wang.js DIAMOND2`).
      테스트: 대각선으로만 길에 닿는 돌(10,1)이 S3에서 발동(십자로는 실패하는 것 확인).
    - 발동하면 돌은 **소모**된다(陷阱师 함정 공통 「踩上去的第一个敌人会触发其效果」, 토큰에 ON_UNIT_DEAD 소리가 있음; 2026-10-10 클라 프리팹으로
      확인: `sktok_wang_1`·`_2`(ExplodeRow/Col/Cross)·`_3` 모두 `_runActionOnEvent` 5 = ON_SPELL_END에 `Withdraw {_withdrawSource: true,
      _switchToDeadState: false}` — 폭발이 끝나면 돌이 스스로 철수). 놓았던 돌은 모드의 재배치와 같은 방식(`Battle.redeploy`, `tokens.js enableRespawn`)으로 돌아온다:
      재배치 시간(E2 2초) 뒤, 자기 칸에, DP(토큰 cost 3, VI 정예는 모듈로 2)만 내고, 그 칸에 적이 없을 때. 망이 필드에 없으면 기다린다 [추정].
      **돌아올 때 재고를 쓰지 않는다** — 놓은 돌은 전투 내내 소모 → DP 내고 복귀를 되풀이한다(2026-10-08 관리자 결정, `op-wang.js
      RETURN_USES_STOCK`(false)). 근거: PRTS 卫戍协议/帮助 「若召唤物在战斗期间退场，将在满足条件后立即原地再部署1个」(재고 언급 없음), 관리자의 플레이 기억
      (DP를 쓰며 다시 놓이는 바둑돌 때문에 다른 오퍼레이터가 퇴각했다), 아래 영상의 DP 감소. 실제 경기 경로 확인: m04 3·4라운드에서 望(돌 6개) +
      琳琅诗怀雅면 돌 복귀 DP 때문에 行商 지불이 막혀 琳琅诗怀雅가 퇴각한다. 전투 시작 재고 = 배치 한도 − 정비 때 놓은 수(다 놓으면 0) — 이제
      S1/S2 「즉시 2개 획득」의 새 돌 자동 배치에만 쓰인다. 배치 한도는 6, 모듈(`uniequip_002_wang`, VI 정예)이면 7
      (토큰 `byModule` stats — 키트가 정규화된 `stats`에서 읽어 늘 6이던 버그를 2026-10-08 `stoneLimits`로 고침; 정비 손패는 이미 7장이었다).
      **2026-10-09 잠재 이식 뒤**: 배치 한도·보유 상한은 플레이어의 潜能을 따른다 — 潜能3 이상(기본 6) 7 / 8, 모듈이면 배치 한도 8(보유 8); 潜能1–2면
      6 / 7, 모듈 7 / 7 (望 潜能3 「第一天赋效果增强」: 棋子 토큰 재능 후보 requiredPotentialRank 2; upstream 806a0477·ec0a2fc6, `stoneLimits`가
      변형을 `atPotential`로 그녀의 潜能에 맞춤). 아래 영상의 VI 정예(모듈) 「돌 7개」는 그 계정의 潜能이 3 미만이라서다 —
      잠재에 따라 돌 수가 달라지는 것이 맞다(관리자 확인 2026-10-09).
      跟子는 소모되면 끝.
      - 이전 규칙(2026-10-07 ~ 2026-10-08, `RETURN_USES_STOCK = true`): 돌아올 때마다 재고 1개를 썼다(관리자가 기억하던 함정술사 규칙).
        정비 때 다 놓으면 재고 0 → S1(21초)까지 아무 돌도 안 돌아오고, S3면 전투 내내 안 돌아왔다 — 2026-10-08 관리자 제보로 되돌림. 그 전(2026-10-06 ~ 2026-10-07)이 지금과 같은 규칙이었고, 더 전 모델(재배치마다
        재고 1개, 재고 7 − 놓은 수)은 2026-10-06 관리자 제보로 바꿨던 것.
      - 영상 확인(2026-10-07~08, 공식 플레이 녹화 — 비공개 녹화, OpenCV 템플릿 추적 + 구간 확대; 레벨 6 VI 정예 왕 = 모듈, 배치 한도 7):
        정비 때 돌 7개 — 아래 줄 왼쪽 2·오른쪽 2, 위 줄 3(관리자 확인 2026-10-08; 처음 분석은 위 줄을 놓쳐 5개로 잘못 셌다). 전투 시작
        (7.5–9.0초)에 돌이 약 0.5초 간격으로 하나씩 나타난다. 아래 오른쪽 2개와 위 오른쪽 1개가 9.5–10.1초에 발동·소모된 뒤 그 칸들은 영상 끝
        (29.7초)까지 비어 있고, 아래 왼쪽 2개·위 왼쪽 1개(적이 오지 않는 칸)는 끝까지 남았다(위 가운데는 오퍼레이터에 가려 판단 못 함).
        한도 7을 다 놓아 재고 0 → 「소모된 돌이 돌아오지 않는다」와 맞다(2026-10-07 해석). 2026-10-08 결정 뒤의 해석 [추정]: 빈 칸으로 보인
        것은 돌아온 돌이 x-1 마름모 안의 적에게 곧바로 다시 발동·소모됐기 때문일 수 있고, 아래 DP 감소가 그 복귀 비용과 맞는다 — 영상만으로는 못 가린다.
        [불확실] 10초부터 DP 카운터가 약 1.5초마다 2–3씩 줄어든다(10→11→9, 10→8, 10→7, 8→6, 8→5 …, S3 중 3→0). 바둑돌 DP(3, 모듈 2)와
        비슷하지만 놓인 돌이 화면에 남지 않고(보스 그림에 가려진 칸이면 안 보임), 다른 오퍼레이터의 소비일 수도 있어 판단하지 않았다.
        S3(24.3초~): 보스 쪽에 마름모 테두리(`x-1`)의 초록 폭발이 0.5–1초 간격으로 반복된다. 이 영상은 S3 판이라 S1/S2 보충은 확인할 수 없다. 실제 경기 경로 테스트: `test/local-patch-diy.test.js` 「six prep stones = no stock」.
    - 은신(隐匿) 적: 선택할 수 없는 적(隐匿 미노출, untargetable)은 돌을 발동시키지도 않고 폭발에도 맞지 않는다(PRTS 작전 메커니즘
      「AOE的判定是对攻击范围内的每个可以被选中的敌人进行判定」, 엔진의 `Battle.foesInRadius`와 같은 규칙).
    - 정비 단계에 놓은 자리 그대로 전투를 시작한다. 전투 시작 자동 배치에는 跟子가 없다(관리자 결정 — 예전엔 돌마다 跟子를 만들었고 그게 배치
      한도 6에 걸려 먼저 놓은 돌을 퇴각시켜 배치가 바뀌었다). 그 외 모든 돌 등장(소모된 돌의 재배치, 재고 배치)에는 跟子 1개
      (클라이언트 `wang_stone1_t_1[trigger]` ON_OWNER_BORN, 수동 한정 필터 없음).
    - 클라이언트 데이터 반영(2026-10-06): 망이 필드를 떠나면(퇴각·쓰러짐) 돌과 跟子가 모두 죽는다(`die_to_kill_token` ON_OWNER_FINISH →
      KillTokens; 놓았던 돌은 망이 다시 서면 제자리로 돌아온다 [추정]). 배치·재배치는 걷는 적만 막는다(`_excludeOccupiedByWalkEnemy`, 비행 적은
      안 막음). 跟子 위치는 아래 「跟子」 줄(클라 `WangTileSelector`). 跟子 발동은 적의 기준 칸으로 판정
      (`_checkTargetRootTile`). S1 지속 피해: 첫 틱은 걸리는 즉시, 1초 간격, 6.5초 → 7회(`waitFirstTriggerInterval: false`); 돌 토큰의
      지속 피해만 무출처, 跟子의 것은 망이 출처.
    - 跟子(E1+)는 망이 쏜 투사체(PRTS): 배치 한도에 안 들고 칸을 차지하지 않는다, 최대 `attack@max_spawn_cnt`개. 위치 우선순위(2026-10-10,
      클라 코드 `WangTileSelector` — 사용자 결정 「공식이랑 동일하게」): 후보(`_FilterWangNormal`: 캐릭터가 선 칸·배치 불가 고지대 제외)를 전투 난수로
      섞은 뒤, 놓을 수보다 많을 때만 정렬 — 비교자 `<_SortCandidates>b__14_0` 오름차순 키 ① 지상 먼저(`!isLowland`) ② 적이 있는 칸 먼저(유효한
      적 아무나, `_CheckContainsEnemies`) ③ 배치 불가 먼저(`buildableType != NONE`이 뒤) ④ 재능 跟子(TALENT)만 방향 `_GetDirectionPriority`
      (row+ 0, col+ 1, row− 2, col− 3 = 위 > 오른쪽 > 아래 > 왼쪽; 결정적), S3 시작(SKILL_3_INSTANT)은 ④ 없음 = 같은 칸끼리 무작위. 재능 跟子는
      돌 하나 주변 4칸 중 1칸(`_maxNum` 1)이라 늘 ④까지 정렬된다. 코드 `op-wang.js followerOrder`. 이전(2026-10-07 ~ 10-10, PRTS 비고 순서):
      적이 있는 칸 > 배치 불가 지상 > 배치 가능 지상 > 배치 가능 고지대 — 적이 있는 고지대 칸(비행 적)이 적 없는 지상보다 앞이었다. 좌우 반전된
      필드에서 좌우를 바꾸는 것(`ORTHO_MIRRORED`, 2026-10-07 관리자 결정 W8)은 그대로 — 공식은 격자 열(col+) 기준이라 반전 필드를 격자째 뒤집어
      그리는지에 따라 맞을 수도 있어 미확정. 쓰러진 오퍼레이터가 누운 칸(`Battle.downOn`)에도 안 놓인다(upstream과 같게,
      2026-10-07 관리자 결정). 연결에 참여하고 피해 출처는 망. 여러 개를 이어 지을 때(S3 배치의 재능 1 + 추가 ≤ 3)는 **4프레임마다 하나씩**
      (`env_043_stone_trigger` `_stoneBuildDelay` 4, 클라 코드 `WangStoneTriggerManager.OnTick`의 buildStoneRequests — 2026-10-10, 그 전엔 한꺼번에):
      첫 개(재능, 무료)는 돌과 함께 [추정: 첫 빌드 프레임은 안 봄], 추가분은 지어질 때마다 탄약 1발, 놓을 칸이 없는 차례는 건너뛴다(클라도 요청 수를
      줄임). S3 시작 InstantSpawn 跟子는 아직 한꺼번에 [추정: 클라 InstantSpawn은 `_preDelay`·`_cooldown` 0.25에 시전마다 1칸 — 나눠 놓는지 안 봄].
      놓을 수 없는 칸(2026-10-06 관리자 제보): 클라이언트 跟子 선택기 `exceptTileTypes` + tileTypesMask 14. 비트는 클라 enum
      `Torappu.Battle.TileTypesMask`([Flags]: NONE 0, DEFAULT 1, HOLE 2, END 4, START 8, FAKE_HIGHLAND 16; 2026-10-10 확인 — 그 전엔 tileTypeDict
      순서로 END 2·START 4·HOLE 8이라 [추정]했다) → 14 = HOLE·END·START = `tile_end`·`tile_end_cooperate`·`tile_allygoal`(방어 지점),
      `tile_start`·`tile_start_cooperate`·`tile_enemygoal`(적 침입 지점), `tile_hole`(타일 키 → 마스크는 `BattleMiscDB.GetTileTypesMask`; 이 키 목록이
      tileTypeDict 값과 맞는지는 다시 대조하지 않음). 배치 불가 고지대도 불가(재능·재배치·S3 시작 초과분·S3 배치 모두 같은 `followerClass`). 비행 적 출현
      칸(`tile_flystart`)은 이 목록에 없다. **깊은 심해(`tile_deepsea`)도 불가** (관리자 제보·결정 2026-10-08 — 공식 마스크 14에는 없음):
      `grid.js DEPLOY_REFUSED_TILES`가 깊은 심해를 「배치 불가 지면」(`build 'NONE'`)으로 만드는데, PRTS 비고의 순서가 그 지면을 跟子 1순위로 두어
      act2 m04 물길(6·14열 10–12행)에 跟子가 먼저 들어갔다(실제 매치 경로 6판 중 5판, 19개). 공식 맵에서는 그 물길에 발판 기물(수상 플랫폼)이 있어야 놓을 수 있는데(관리자 설명), 시뮬레이션은 그 플랫폼이 없으므로(`grid.js` [ASSUMED]) 깊은 심해 전체를 막는다(`op-wang.js FOLLOWER_REFUSED_TILES`).
      재능·S3 「적이 있는 칸」 모두 `followerClass`라 같이 막히고, S3 손패 배치·S1/S2 자동 배치는 이미 `build 'NONE'`을 건너뛴다. 플랫폼을 모델링하면
      그 칸만 다시 열 것. 테스트 `test/local-patch-diy-wang.test.js` 「no 跟子 on a 深水区 tile」. 망 S3 자동 발동: 공식 규칙 「攻击范围扩大」 → 기본 전략(평타 직전 + 3-3 안의 적, `DEFAULT`). 한때 스킬 범위 4-12에 적이 들어오면
      켜지는 `SKILL_RANGE` 예외였으나 관리자 결정(2026-10-06)으로 공식 규칙으로 되돌렸다(트리거 예외 없음).
    - 손패(재고) 상한 maxDeckStackCnt(7)는 **손패만** 센다(클라이언트 `wang_s3_charge_token` max_cnt/remaining_cnt =
      AssignTokenCardCntToBB 카드 수, `_stopSpWhenTokenIsFull`도 카드 수). 전투 시작 때 위수협약이 나눠 준 배치 한도 6장(PRTS
      「根据召唤物部署数量上限…发送等量召唤物至手牌区」) 중 놓지 않은 것이 손패. S1/S2 「즉시 2개 획득」 = min(7 − 손패, 2)장, 손패 7장이면 阻回.
      S3(탄약형): 시작 때 ChargeToken min(7 − 손패, 8)장, 나머지는 InstantSpawn 跟子(살아 있는 跟子 ≤ max_spawn_cnt) — 사거리 안 칸,
      클라 `WangTileSelector` SKILL_3_INSTANT 순서(위 「跟子」 줄: 섞은 뒤 지상 > 적이 선 칸 > 배치 불가, 같은 칸끼리 무작위; 2026-10-10 — 그 전엔
      적이 선 칸을 방어 지점까지 남은 경로가 짧은 적 순으로 먼저 `goalFirst`, 2026-10-06 관리자 결정 [추정]이었으나 클라에 그런 순서가 없어 사용자
      결정으로 뺌), 기존 돌과 붙을 필요 없음. 탄약 20발: S3 중 돌 1개를
      배치하면 **재능 跟子 1개(무료) + S3 跟子 최대 3개(1개당 1발)** — 배치 1번에 최대 3발(PRTS 「第一天赋额外至多部署3枚棋子并消耗等量弹药」,
      나무위키 「최대 3개의 바둑돌은 배치될 때 탄약을 1발씩 소모」; 2026-10-07 관리자 결정, 같은 날 인게임에서 확인). 이전(2026-10-06):
      跟子 최대 4개 전부 1발씩(클라이언트 SpawnTokenS3InSkill BuildStone 카운터 `_countEvent 4, _expendPerTrigger 1`).
      끝나는 조건은 재고 소진·탄약 소진·수동 종료뿐이고(클라 코드 `WangS3CastSkillWithLimitTimes.OnTick`: 손패 0 + 지을 跟子 없음
      `!hasRemainingBuildCnt` — 손패가 0이어도 이어 짓는 跟子가 남았으면 그것까지 기다린다, 2026-10-10 `followAround`), 남은 탄약은 돌로 돌아온다(엔진 `end()`가 onEnd 전에 `ammoLeft`를 0으로 만들어 이전엔
      반환이 늘 0이었음 → 킷이 따로 기억, 손패 7장까지). **정비 단계에 돌을 하나도 놓지 않았으면** 아무것도 충전·배치하지 않고 끝나지 않는다
      (관리자의 실제 게임 관찰 2026-10-06; 자료에는 직접 문장 없음). 소모된 돌의 재배치도 재고를 쓴다(위) — S3 중 재고가 0이면 기다린다.
    - [추정] 위수협약 전투에는 수동 배치가 없어서, 재고의 돌은 자동으로 배치한다(필드의 돌이 maxDeployCount 6 미만일 때만): S1/S2는
      기존 돌 옆, 적 경로 위, 적이 없는 칸(특성), 적에 가까운 칸; S3는 1초에 1개 — 사거리 안 적이 선 배치 가능 칸(적끼리는 무작위 순서, 전투
      난수 — 2026-10-10: 클라 코드에 이 대체 규칙은 없고(손으로 놓는 것; `WangTileSelector.SKILL_3`은 어느 프리팹도 안 씀), 그 전의 「방어 지점까지
      남은 경로가 짧은 적 순」(`goalFirst`, 2026-10-06 관리자 결정 [추정])은 S3 시작 순서와 함께 뺐다. 더 전엔 왕에게 가까운 순), 그런
      칸이 없고 필드에 적이 있으면 사거리 안 빈 칸(지상 경로 우선, 적에 가까운 순, 걷는 적이 없는 칸), 주변 跟子 1개당 탄약 1발.
      (2026-10-06 관리자 제보: 적이 사거리 밖으로만 지나가는 배치에서는 놓을 칸이 없었고, 적이 선 칸은 소모된 돌의
      제자리라 `isReservedTile`에 막혔다 → 그녀의 대기 중인 돌 자리는 막지 않음. UI의 탄약 막대는 엔진 `ammoLeft`를 그대로 쓰고 킷이 같이 갱신한다.)
      S3 중 소모된 돌이 제자리로 돌아오는 것도 그녀의 배치로 친다: 재능 跟子 1개 + S3 跟子 최대 3개(1개당 탄약 1발), 그녀의 사거리 안이면
      적이 선 칸에도 돌아온다(2026-10-06 브라우저 재현 — 정비 때
      6개를 놓으면 필드가 늘 가득 차 S3 대체 배치가 한 번도 일어나지 않아 탄약 막대가 가득 찬 채였고, S3 시작 때 InstantSpawn 跟子 1개만 주변 없이
      보였다. 수정 후 브라우저에서 라운드 5 S3: 탄약 16 → 12 → 9 → 5 → 2, 막대 45.6 → 5.7/57). 필드가 가득 차면 S3는 멈추지 않고 기다린다(이전의 자체 종료는 근거 없어 삭제 — 일찍 끝나던 원인). 소모돼 재배치를 기다리는 돌이 먼저이고, 새 칸은 그다음이다. 재고에서 놓는 돌도 DP를 낸다.
    - 취세: 정지 + 망 공격력 × atk_scale 마법/초(발동마다 독립). 연성: 연결 방향(상하 → 세로, 좌우 → 가로, 한번 켜지면 유지) 양쪽 3칸 적에게
      마법 피해 + 감속. 料敌机先: 직선 위 돌 수만큼 피해 +%, 마법 저항 고정 수치 무시(최대 3). 중첩은 돌마다 본 최장 직선으로 고정
      (3개 중 1개가 사라져도 남은 돌은 3중첩). 값은 데이터: 일반·V단계 정예 10%/9, VI단계 정예(모듈 3) 13%/12. 클라 코드로 확인(2026-10-10):
      `StoneTriggerMap.UpdateStoneTriggerCnt` — 칸별 중첩·방향(행/열 수)을 최댓값으로 고정, 돌이 떠나면 `ClearExplodedStones`로 초기화;
      `WangStoneTriggerManager.OnTrigger`가 S1/S3에는 중첩을 bb `cnt`로(프리팹이 `max_trigger_cnt`로 자름), S2에는 `is_row`·`is_col`(가로·세로·십자 폭발).
    - **무장 지연** (2026-10-10, 사용자 결정 「공식이랑 동일하게」): 돌·跟子가 이어지면 연결선은 바로 나오지만 실제로 발동할 수 있게 되는 것(무장)은
      **30프레임 뒤**다 — `env_043_stone_trigger`(`WangStoneTriggerManager`) `_tokenStoneExplodeDelay` 30·`_projectileStoneExplodeDelay` 30, 클라 코드
      `_TryTriggerStones`가 `finishFrame = fixedFrameCnt + 30`, `OnTick`이 `fixedFrameCnt > finishFrame`인 다음 프레임에 `_DoStoneExplode`
      (onStoneTriggered → `wang_stone_triggered` 버프 → 토큰 `SkillTrigger` `_checkContainBuffs`). 그 사이 적이 지나가도 발동하지 않는다. 프레임: 클라
      고정 스텝 1/30 s(`globalgamemanagers` TimeManager `Fixed Timestep` 0.0333333, `GlobalConsts.TIME_ROUGH_LOGIC_RATE` 30) = 시뮬레이션 1틱 →
      이어진 틱 + 31틱(≈1.03 s)에 무장(`op-wang.js STONE_ARM_FRAMES`). 그 전엔 이어진 틱에 바로 무장. 「onStoneTriggered → wang_stone_triggered」
      연결은 토큰 프리팹 쪽이라 이름으로 추론. 테스트 `test/local-patch-diy-wang.test.js` 「W2」(0.95 s엔 아직, 1.1 s엔 발동).
    - 跟子를 진짜 바둑돌이 아닌 투사체로 둔 근거: PRTS 「通过天赋'额外部署的棋子'实为望自身发射的弹道 由此其不具有单位相关的性质（例如占据空位等）」.
      화면에는 바둑돌 모델로 보이고 연결·발동·피해는 같다. 손패를 쓰지 않고 배치 한도 6에 들지 않아 정비 때 놓은 돌을 퇴각시키지 않는다.
    - **跟子 칸에 배치하면 그 跟子가 사라진다 (PRTS 铸子 备注, 관리자 결정 2026-10-09, upstream `5a045731`의 이 부분만 손 이식)**: PRTS 望 铸子
      备注 「跟子所在格进行部署（或进行类似部署的行为）时，该跟子会随之消失」(2026-10-09 upstream 대조 때 원문 확인). 跟子는 칸을 차지하지 않아서
      (`_occ` 비움, PRTS 「不占据空位」) 소모돼 기다리던 놓은 돌이 제자리로 돌아올 때(`Battle.redeploy`는 `_occ`만 본다) 이웃 돌의 등장 때 그
      빈 제자리에 놓인 跟子 위로 돌아올 수 있다(관리자 제보 2026-10-08; 실제 매치 경로 990판 중 292판, 한 칸에 돌 둘). 이제 그 복귀가 그 칸의 배치라서
      跟子가 사라진다: `op-wang.js` 재능 install의 `deploy` 훅이 아군 누구든(돌의 복귀, 재고 돌, 오퍼레이터의 재배치·`moveRedeploy` 이동) 배치된
      칸의 그녀 跟子를 `retreat`로 지운다. 놓은 돌(跟子 아님)이 제자리에 있으면(S3가 놓은 돌) 여전히 기다린다. 전투 시작 자동 배치에는
      跟子가 없으므로(위, 관리자 결정 유지 2026-10-09 — upstream `5a045731`의 전투 시작 跟子 부분은 안 받음) 그때 지울 跟子도 없다.
      이전 규칙(2026-10-08 – 2026-10-09, [추정] 공식 근거 없음): 제자리에 跟子가 있으면 돌이 기다리고 跟子가 사라진 뒤 돌아왔다. 잠정 —
      관리자 메모(2026-10-09): 테스트 뒤 되돌릴 수 있음. 클라 코드로 확인(2026-10-10, 되돌릴 근거 없음): `StoneTriggerMap.UpdateStoneMap`을
      `_OnUnitBorn`이 태어난 모든 캐릭터에 부르고, 그 칸에 살아 있는 돌이 아닌 표시(跟子)가 있으면 `RemoveStoneMark(pos, isOverlapped: true)`로 지운다 —
      PRTS 문구와 같다. 이동 재배치(`moveRedeploy`)가 공식에서 born을 내는지는 미확인. 회귀 테스트: `test/local-patch-diy-wang.test.js` 「a deployment on a 跟子's tile removes it」(돌 복귀·
      오퍼레이터 이동, 옛 규칙에서 실패 확인), 「望 stones never share a tile」(실제 매치 경로, 매 틱 겹침 0 + 배치가 跟子를 지운 횟수 > 0 —
      옛 규칙에서 4판 중 3판 실패 확인).
  - 첸: 약점 대미지(물리·마법 중 유리한 쪽), 7초 무피격 시 회복+다음 공격 회피, S1 침묵, S2 0.4초 간격 10회 베기(처치 시 이전·+1회,
    무적) 후 대상 칸으로 이동 + 공격력·회피 버프, S3 검기(1.5칸/초, 반경 1.3, 직선 구간마다 적당 1회, 현재 HP 6%·최소 공격력 530%/정예 550%) — PRTS 비고 기준.
    S3 검기 회전(2026-10-06, EN 클라이언트 `[uc]projectiles.ab`의 `projectile_chr_chen3_s3` → `ChangeStateWithHighlandBehaviour`):
    앞 칸이 고지대·侵入点(빨간 문)·保护目标(파란 문)·필드 밖이고 그 칸 가장자리까지 0.25 이하(+0.02)이면 시계 방향 90°
    (`_hitDistance` 0.25, `_checkHitHighland`·`_checkTileStart`·`_checkTileEnd`·`_checkHitMapEdge`). 꺾이면 맞은 적 목록을 비운다.
    시계 방향은 클라 코드 상수다(2026-10-10 정정 — 예전 「방향 값은 클라이언트에 없다」는 틀림): `ChangeStateWithHighlandBehaviour._ChangeDirection`이
    이동 방향을 상수와 비교해 위 → 오른쪽 → 아래 → 왼쪽 → 위로 바꾼다(PRTS 「顺时针旋转90°」과 같음). 꺾는 조건은 클라 `_CheckHit`
    `_hitDistance >= d && d > _hitEps`(0.02 < d ≤ 0.25 — `_hitEps`는 여유가 아니라 하한; 우리는 ≤ 0.27로 둠, 벽 앞 0.25에 멈추므로 실제 궤적 차이는
    거의 없음 [추론]). 이전 코드와 다른 점: 0.75 앞을 봐서 0.5칸 일찍 꺾었고,
    저지대 통행 불가 칸·장애물이 놓인 칸에서도 꺾었고, 侵入点에서는 꺾지 않았다. 판정 간격 0.03초(이전 0.1초 → 이제 매 틱),
    수명은 스킬 끝까지(`_lifeTimeType` 2 = 클라 enum `LifeType` INFINITY — 2026-10-10 확인, 스킬 종료 버프 `chen3_s3[finish_projectile]`가 지운다).
    **검기가 나가는 때** (2026-10-10, 사용자 결정 「공식이랑 동일하게」): 스킬이 켜지는 순간이 아니라 시작 애니 `Skill_3_Begin`이 끝난 뒤 —
    `skchr_chen3_3` `_playSkillBeginAnim` 1·`_beginAnim` Skill_3_Begin, 클라 코드 `BasicSkill.PlayBeginAnimation`이 그 클립 길이만큼 기다린 뒤
    `DoStartSkill`(능력 시작), 첫 능력 EmitProjectile(`projectile_chr_chen3_s3`, `_waitForAttackEvent` 1). 그녀의 스켈레톤 Skill_3_Begin은 13프레임
    (0.433 s, front·back)이고 OnAttack 이벤트가 없다(`tools/assets/skel.mjs`로 확인) → 0.433 s에 발사(`op-chen3.js S3_BEGIN`). [추정]: 그 뒤 기다리는
    공격 이벤트(`ActiveBuffAbility`는 최대 버프 `duration`까지 기다림)는 다음에 재생되는 클립에서 올 텐데, 어느 클립인지 추적하지 않아 더 기다리지 않음.
    테스트 `test/local-patch-diy-chen3.test.js` 「S3: the 剑气 leaves」.
    `op-chen3.js chen3QiAdvance`(테스트용 export). `fx` 'chen3Qi'는 0.1초마다 + 꺾일 때 바로.
    S3 자동 발동: 공식 규칙 「攻击范围扩大」 → 기본 전략(평타 직전 + 1-1 안의 적, `DEFAULT`) — 평타로 칠 수 없는 비행 적만 있으면 켜지지 않는다.
    한때 3-12 안의 적(비행 포함)으로 켜지는 `SKILL_RANGE` 예외였으나 관리자 결정(2026-10-06)으로 공식 규칙으로 되돌렸다. 예외가 다시 필요하면
    `tools/build-data.mjs TRIGGER_DEVIATIONS`(관리자 결정으로만).
  - 위셔델: 여진·잔영 폭발(재능1), 혼령의 그림자 소환과 근처 위장(재능2), S2 과부하([추정] 지속시간 후반부), S3 그림자 2개 추가(최대 3).
    S2 수정(2026-10-06): 과부하 본탄의 `attack@atk_scale_ol`(0.7)이 적용되지 않았다(사키코 S2와 같은 원인: `beforeAttack`의 `ctx.profile`
    교체를 엔진이 다시 읽지 않음). 과부하 동안 위셔델 자신의 `unit.profile` 복사본에 `atkScale`을 넣고 끝나면 되돌린다.
  - 사키코: 음표 수만큼 방어·저항 무시, Fever(450, 20초, 스킬 재시전·S2 2연타·S3 퇴각 안 함), S2는 시전마다 피아노↔오르간 전환(클라 프리팹
    `skchr_oblvns_2` 토글형 — `_useAbilityHandleToggle` 1·`_switchToMode` 1·`_defaultModeIndex` 2, 시작·끝 애니 `Skill_2_Trans_B`; 2026-10-10 [추론: 토글
    처리 코드 `ToggleInternal`은 안 봄]).
    재능(2026-10-06, 나무위키 4.6 평가·PRTS 비고): 재능1 「지속 공격」 — 사거리에 적이 없어도 공격 간격마다 공격한다(공격 회복 SP +1,
    음표 1개). 그 음표는 근처에 온 적을 쫓아가 발사 때 공격력으로 맞힌다(아래 음표 시뮬레이션). 정면 1칸의 통행 유형이 「없음」이면 쏘지
    않는다. 음표 수: 공격 1개(S2 Fever 2), S1 시전 8개, S3 공격 4개(피아노 2 + 오르간 2) — 살아 있는 음표 수. 모듈 LOR-Y 2단계
    이상(VI단계 정예)은 「스킬 지속 중 원거리 공격력 감소 없음」. 재능2: Fever는 적에게 준 피해만 센다. 공격 속도 +는 현재 공격 범위(S3
    확대 범위 포함) 안의 오퍼레이터, **자신 포함**(이전: 재능 범위 고정, 자신 제외). 값은 데이터: 모든 단계 정예2 기준 방어 3%·저항 2%·최대
    10, Fever +3, 공격 속도 +12. VI단계 정예(모듈 3단계)는 방어 5%·저항 2.5%·최대 12.
    S2 수정(2026-10-06): 오르간 마법 피해·Fever 2연타가 실제로는 적용되지 않았다(`ai.js performAttack`이 `beforeAttack`의 `ctx.profile`
    교체를 다시 읽지 않음). 엔진은 그대로 두고 kit이 사키코 자신의 `unit.profile` 복사본(`dmgType`·`hits`)을 음색·Fever에 맞춰 바꾼다.
    음표 시뮬레이션(2026-10-06, `op-oblvns.js NOTE`·`noteStep`): 음표 하나하나를 키트가 날린다. 일반 공격은 엔진 투사체를 쏜 직후(`attack` 훅)
    투사체 목록에서 빼서 음표로 날리고, 도착하면 그 투사체의 `onHit`(엔진 `resolveHit`: 피해 유형·Fever 2연타·원거리 감소·attackId)을 부른다
    — 피해가 음표가 닿을 때 들어간다(이전: 엔진 화살 14칸/초). S1 8개·S3 오르간 2개·지속 공격 음표는 키트 음표(캐시한 공격력).
    값은 EN 클라이언트 `battle/prefabs/[uc]projectiles.ab`의 `projectile_chr_oblvns*`(이동 컴포넌트 + 컨트롤러)와 charpack
    `char_4182_oblvns.ab`의 `_projectileKey` — 자유 비행(칸/초) → 최소 자유 시간(초) → 추적(칸/초 · 회전/초), 대상 탐색 주기·반경:
    | 프리팹 | 쓰는 곳 | 자유 | 전환 | 추적·회전 | 탐색 |
    |---|---|---|---|---|---|
    | `projectile_chr_oblvns` | 대상이 있는 일반 공격 | 직선 2.0 | 0.1 | 2.0 · 5 | 0.4 · 1.0 |
    | `_talent` | 지속 공격(스킬 없음) | 사인 1.3(진폭 0.3) | 0.1 | 2.0 · 7 | 0.4 · 1.0 |
    | `_s1_1…8` | S1 | 직선 1.7, 방향 ±angle·(2·(2i+1)/16 − 1) | 0.6 | 2.2 · 5 | 0.2 · 1.0 |
    | `_s2`·`_s2_t` | S2 피아노 | 사인 1.9(0.4) | 0.4 | 3.5 · 15, 맞힌 뒤 3.0으로 0.5초 | 0.2 · 0.8 |
    | `_s2_slow`·`_s2_slow_t` | S2 오르간 | 사인 0.7(0.15) | 0.4 | 1.0 · 2.5 | 0.4 · 1.0 |
    | `_s3_phy`·`_s3_mag` | S3 피아노·오르간 | 사인 0.8(0.5) | 0.8 | 1.3 · 7.5 | 0.4 · 1.0 |
    (지속 공격 = charpack `RangedAlways`: 스킬 없음 `_talent`, S2 `_s2_t`·`_s2_slow_t`, S3 `_s3_phy`·`_s3_mag`. 탐색 반경은 PRTS 跟踪范围半径,
    회전은 PRTS 「转向速度7/30每帧」 = 30fps에서 7/초.)
    규칙: 자유 비행 방향은 사키코 방향 ±20°(PRTS 「自身朝向左20°至右20°范围内，随机一个角度」; 2026-10-10 클라 코드로 확인 —
    `BasicMovement._InitDirectionByStart`, `_useSourceDirection` + `_useSourceDirectionRandomArcAngleStart`: 전투 난수 `Range(−angle, +angle)`,
    angle = 블랙보드 `angle` = 재능1 `attack@angle` 20. 일반·재능 음표는 확인, S2·S3 음표는 같은 플래그이고 스킬 블랙보드에 `angle`이 없어 재능 값을
    쓴다 [추론: 블랙보드 합치는 경로는 안 봄]). **S1 부채꼴** (2026-10-10, 사용자 결정 「공식이랑 동일하게」): 같은 메서드의
    `_useSourceDirectionArcAngleWithRatio` — a = angle × (2·ratio − 1), ratio = `_sourceDirectionArcAngleRatio` (2i+1)/16, angle = S1 블랙보드
    `angle` 15 → 정면 ±13.125°(3.75° 간격, 30° 부채꼴) 8개. 그 전엔 비율을 360°에 곱해 한 바퀴로 뿌렸다 [추정이었음]. 회전 축이 (0,0,−1)이라 1번
    음표가 화면의 어느 쪽인지는 확인 안 함 [추정: ±20°와 같은 부호]. 테스트 `test/local-patch-diy.test.js` 「丰川祥子 S1」. 공격 대상이 있으면 그 적을, 없으면 음표 반경 안에서 음표에
    가장 가까운 선택 가능한 적을 주기마다 찾는다(PRTS 「选择自身一定范围内距离音符自身最近的可选目标」). 최소 자유 시간이 지나고 대상이 있으면
    추적, 대상이 사라지면 현재 방향으로 다시 자유 비행(PRTS 「以当前运动方向重新进入至【自由移动】状态」). 사키코의 공격 범위 밖에서 대상 없이
    연속 `delay`(재능 bb 1초, 클라이언트 `passby_delay` 1.0)초 있으면 사라진다(PRTS 「音符位于自身攻击范围外时，若连续1s以上不存在跟踪目标则消失」)
    — 사거리 끝에서 바로 사라지지 않고 지나서 1초 더 난다(관리자 결정). 사키코가 퇴장하면 추적 중이 아닌 음표는 사라진다(PRTS
    「自身退场时，清除所有不处于【跟踪移动】状态的音符」, charpack `ProjectileElimate` `_keepAliveIfContainsTraceTarget`). 음표 수 = 살아 있는
    음표(클라이언트: 투사체 생성 이벤트에서 `oblvns_t_1[cnt]` +1, 도착·소멸 이벤트에서 −1; `oblvns_t_1`이 cnt × 비율을 max_cnt까지).
    시간 수명은 두지 않는다: 프리팹 `_lifeTime` 10은 `_lifeTimeType` 2 = 클라 enum `LifeType` INFINITY(IMMEDIATELY 0, LIMITED 1, INFINITY 2,
    CUSTOM 3 — 2026-10-10 확인; 그 전엔 `_lifeTime` 0인 같은 유형 투사체 57개로 [추론]). `NOTE_SAFETY`(60초)는 끝없이 쫓는 음표를 막는 시뮬레이션 안전장치일 뿐.
    [추정] 엔진에서 넘겨받은 일반 공격 음표는 도착 때의 공격력으로 맞힌다(엔진 `resolveHit`; PRTS는 캐시한 공격력). S2 피아노의 관통은
    그림만(피해는 1명: `_maxHitNum` 1). 사인 비행은 그림만, 시뮬레이션은 직선. 한 음표가 2타(S2 Fever, S3 피아노)면 `w: 2`로 세고 그림도 2개.
    도착 판정 거리는 피아노 0.8(PRTS 「激活0.8半径的碰撞」), 나머지 **0.1** — 추적 이동 `AdvancedMovement.DoCheckReachedInternal`이 대상 위치
    0.1 안이면 도착(2026-10-10, 사용자 결정; 그 전 0.2 [추정], `op-oblvns.js NOTE` `hit`). 화면: `fx.md`의 사키코 음표.
  - 아스카론: 사망 구금 중첩(이동 −18%/중첩, 현재 공격력 10%/초), S2 둔화·처치 시 확산, S3 범위 내 적 명중률 −30%(회피 시 회복).
  - 대미지 감사(2026-10-06): 범위 대상은 모두 선택 가능 규칙(`foesInRadius`/`enemiesInKeys`/`canTargetEnemy`: 미노출 은신·선택 불가 제외).
    고친 것: 첸 S2 첫 대상(`unitsInGrid`는 필터가 없음 → 은신 적을 벰; 은신 적만 있으면 선택 가능한 적이 올 때까지 대기), 아스카론 S2 처치 확산이
    한 번도 안 되던 버그(`rangeKeys`는 배열인데 `.has?.`로 검사), 바둑돌 S2/S3 폭발 `canDodge: false`(원본 함정·폭발과 같은 규칙),
    S1 지속 피해 무출처(PRTS 「以无来源的形式施加给目标」).
- 소환물 모델(望 바둑돌·维什戴尔 혼령의 그림자): fexli 미러에 望 바둑돌은 아예 없고 혼령의 그림자는 스킨 변형만 있어 아바타 마름모로 보였다.
  EN 클라이언트 `PersistentData/Bundles/pkgrps/btl_pfb_tokens_*.ab`의 `<id>_SkeletonData`에서 기본 모델을 뽑는다 — 0.2.0부터 upstream
  `tools/local-extract/extract.py TOKEN_SPINES`(→ `public/assets/local/spine/token/<id>/`) + `node tools/fetch-assets.mjs --local-spines`
  (→ `tools/assets/local-token-spines.json`, `data/assets.json tokens[id].spineLocal`). 적 로컬 모델과 같은 방식이라 `assets/local`이 없으면 아바타로 돌아간다.
- 信标(비콘): 공식 「无法装备给自编干员」(KR 「선발 오퍼레이터는 장착 불가」) — 0.2.0 upstream 틀이 같은 규칙을 가진다.
- 모듈: 공식 甄选 칸에는 기본 모듈이 없어(게임에서 직접 장착) 처음엔 미장착이었다. 2026-10-05부터 후보의 첫 모듈(`uniequip_002`, X 타입)을
  기본으로 장착한다(상점 `defaultUniEquipId`). 오퍼레이터 구성 화면에서 「없음」을 고를 수 있다.
- 한국어: `public/i18n/ko/diy.json` — 위셔델·아스카론은 KR 공식 테이블, 왕·첸 더 던스트릭·사키코는 `tools/i18n/diy-ko-manual.json` 수동 번역(이름·스킬·재능·모듈 이름은 나무위키 표기).
  `tools/i18n/build-ko-diy.mjs`가 `backups.json` 빌더(`build-data.mjs` `buildBackups`)를 한국어 테이블로 한 번 더 돌려(잠재 1–6 모두) 같은 경로의
  문자열을 짝짓는다. 0.2.0 병합으로 옛 빌더(`build-diy.mjs`)가 없어져 멈춰 있던 것을 2026-10-09 이렇게 고쳤다. 사전에 없는 문자열은
  `KO_DIY_TRACE=1`로 확인하고, 다시 만든 뒤에는 `build-ko-pack.mjs`로 팩을 다시 빌드한다(커밋된 `nas-local`의 사전을 읽는다).

### 처음 5명 키트에서 고친 버그 (2026-10-06)
코드 리뷰에서 나온 9개를 공식 자료와 대조해 고쳤다. 각 항목은 회귀 테스트가 고치기 전 코드에서 실패하는 것을 확인했다.
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
  `test/render/boardart.test.js` 「sim fx coverage」 정규식이 숫자 든 이름(`chen3Qi`)을 놓쳐 고침.
- 확인: 실제 대전 경로(정비 배치 → `buildBattleSpec` → `createBattleFromSpec`)로 祥子 S3·陈 S3 전투를
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
- 새 `battle.fx` 종류를 추가하면 `public/js/render/fx/kinds.js FX_KINDS`에 한 줄을 넣는다(테스트 "sim fx coverage").
- 스킬 자동 발동 규칙은 `tools/build-data.mjs resolveTrigger`가 정한다: 공식 표에 없으면 MANUAL + 자기 스킬 범위 → `SKILL_RANGE`,
  「攻击范围扩大」 같은 공격 범위 변경 → `DEFAULT`. 다르게 하려면 `TRIGGER_DEVIATIONS`(의도적 예외, 관리자 결정으로만).

**동작 근거**
- 출처 순서: 공식 테이블(skill_table blackboard, character_table 재능, battle_equip_table 모듈) → PRTS 비고 → 나무위키 평가.
  PRTS·나무위키는 요약·기계 번역이 틀릴 수 있다(사키코 공격 속도 「자신 제외」 오독). 원문 문장을 인용한다.
- 수치는 단계별 레코드(`data/backups.json` `diy`의 폼)의 레벨 값을 그대로 쓴다. 만렙 값(나무위키)을 박지 않는다.
- 자료에 없는 종료·정지 조건을 만들지 않는다(왕 S3 「놓을 칸 없으면 종료」 → 일찍 끝나는 버그). 추정은 코드와 이 문서에 [추정]으로 남긴다.
- 위수협약에 없는 원작 조작(수동 배치, 수동 스킬 종료)을 옮길 때는 대체 규칙을 [추정]으로 적는다.

**소환물·표시**
- 토큰 모델은 미러에 없을 수 있다 → `tools/local-extract/extract.py TOKEN_SPINES`에 추가해 클라이언트에서 뽑고 `fetch-assets --local-spines`로 매니페스트에 싣는다.
- 함정·방향 없는 소환물은 `shared/trap-tokens.js`(`noHpBar`, `facingless`)에 등록한다.
- 공식 이펙트: 오퍼레이터 번들은 `fx_extract.py --bundle <key>`, 소환물 이펙트는 공용 팩에서 `--pack pkgrps/btl_pfb_fx_token_N.ab --match`.
  게임 이벤트 연결은 `fxgame.js`(왕 `stoneFx` 참고).

**테스트** (`test/local-patch.test.js`)
- 범위 피해가 있는 스킬마다 은신 적(예: 隐形弩手)을 맞히지 않는 테스트.
- 함정 소환물은 공격 대상이 안 되는지, 정비 때 놓은 자리가 전투 시작 후에도 같은지.
- 탄약·지속 스킬은 종료 조건과 종료 후 반환값.

## 진영별 선발 프리셋 (2026-10-09, 관리자 결정)
- 공식에 없는 기능(`feat`). 채팅 진영(`shared/local.js CHAT_FACTIONS`, 8개 국가 맹약)마다 브라우저에 자선 편성 프리셋을 하나씩 둔다(`public/js/ui/diyPresets.js`).
  저장 `localStorage sp.pref.diyPresets = { v: 2, presets: { [진영]: picks }, base, active }`(각 편성은 선발 편성과 같은 `cleanPicks`, 빈 진영 편성은 저장하지 않음;
  `base` 없는 v1은 「프리셋 없음」이 보이던 경우 지금 편성을 `base`로 읽음).
- 관리자 결정(2026-10-09): 채팅에서 진영을 고르면 그 진영 프리셋을 자동 적용하고, 입력칸 위에 「염국 프리셋을 선발 편성에 적용했습니다 · 되돌리기」(10초, `PRESET_NOTICE_MS`)를 띄운다.
  프리셋이 없는 진영을 고르면 아무것도 바꾸지 않는다(남아 있던 알림도 지움). 브리핑에서 선발 편성을 바꾸는 기능은 넣지 않음(프리셋으로 충분) — 같은 날 아래 「적용 시점」 결정으로 바뀜.
  기본 프리셋은 없고, 플레이어가 진영별로 만든다.
- 자선 편성 탭(`screens/diy.js DiyPresetBar`) 위의 「진영 프리셋」 줄: 「프리셋 없음」 + 8진영. 저장된 진영은 테두리·색이 차고, 빈 진영은 점선.
  - 「프리셋 없음」과 각 진영은 **서로 다른 편성**을 갖는다(관리자 제보 2026-10-09: 처음 구현은 빈 진영을 누르면 지금 편성을 복사했다 — `base`로 고침).
    칩을 누르면 그 편성을 보여 준다. 프리셋이 없는 진영은 빈 편성에서 시작하고, 거기에 넣으면 그 진영 프리셋이 된다(다 비우면 다시 프리셋 없음).
  - 보이는 편성을 바꾸면(칸·비우기·모두 비우기·가져오기) 그 칩의 편성에 저장된다(`installDiyPresets`가 `loadoutStore.diy`를 따라감). 다른 칩의 편성은 그대로.
  - 「염국 프리셋 삭제」(그 진영에 편성이 있을 때만) → 프리셋을 지우고 「프리셋 없음」 편성으로 돌아감.
- 적용 시점(관리자 결정 2026-10-09, 두 번째 — 「사람들은 보통 전략 선택 단계에서 진영을 고른다」): 진영 선택이 프리셋을 적용하는 것은 **대기실, 그리고 경기의 브리핑·전략 선택 단계**뿐이고,
  그때는 **지금 판에도** 바로 반영된다(`room.diy` → `server/lobby.js` → `match.setDiy`, `server/match/match/platform.js`). 선발 재고는 정비 단계의 상점·보상·효과에서 처음 쓰이므로
  다시 만들어도 무작위 결과가 달라지지 않는다. 그래도 재고에서 한 장이라도 나갔으면 거부한다. 정비 단계부터는 진영을 바꿔도 **태그만** 바뀌고 그 판의 선발·저장된 편성·프리셋은 그대로다
  (`ui/factionPick.js presetPickLive`). 자선 편성 탭에서 직접 고친 편성도 같은 규칙(브리핑·전략 선택이면 지금 판, 그 뒤면 다음 판).
  처음 구현은 「판 시작 때 고정, 다음 판·다시 뽑기부터」였다 — 그때의 「브리핑에서 선발 편성 변경은 안 함」은 이 결정으로 바뀜.
- 전략 선택 화면 선택 순서 아래 「진영 선택」 줄(`ui/factionPick.js DraftFactionPicker`): 협동은 채팅 진영과 같은 선택(`room.chatFaction`, 채팅 선택기와 서로 따라감),
  싱글은 채팅 진영이 없어 프리셋만 적용(선택 표시는 이 판에서만 기억). 프리셋이 있는 진영은 모서리 점, 꺼진 맹약의 진영은 흐림. 적용 알림·되돌리기는 줄 아래에도(채팅이 닫혀 있으므로).
- 경기 중 진영 선택기: 이번 판에 꺼진 맹약(`m.public.disabledBonds`)의 진영은 흐리게 하고 「결석」 표시. 고를 수는 있다.
- 데이터 사정: 선발 5명 중 국가 맹약이 있는 것은 염국(왕·첸 더 던스트릭)뿐이고 위셔델·토가와 사키코·아스카론은 `emptyShip`이라, 「추천 프리셋」을 데이터로 만들 수 없었다(기본 프리셋이 없는 이유).
- 확인: `test/ui/diy-presets.test.js`(저장 형식, 막대로 만들기·적용·연결·삭제, 연결된 편성 따라가기, 채팅 적용·되돌리기·프리셋 없는 진영, 막대 그리기, 적용 단계,
  「switching never copies them」), `test/match/diy-midmatch.test.js`(브리핑·전략 선택에서 setDiy → 선발·재고·m.private, 정비 단계·재고 나감 → 거부),
  `test/lobby-info-reroll.test.js`(실제 서버로 room.diy). Chrome: 탭 막대의 진영 전환(편성이 서로 섞이지 않음), 협동 전략 선택 줄에서 진영 선택 →
  그 판 선발·채팅 태그·채팅 선택기가 함께 바뀜, 정비 단계 진영 선택 → 태그만, 싱글 전략 선택 줄 → 그 판 적용, 대기실 진영 선택 → 편성 적용·알림,
  꺼진 맹약 진영 흐림 + 결석, 휴대폰 가로(844×390). 결석 카드 깨짐(관리자 제보 2026-10-09)은 선택기 칸 `minmax(0, 1fr)`·글자 줄임으로 고침.
