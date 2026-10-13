# 선발 오퍼레이터

옛 `docs/LOCAL-PATCH.md`에서 2026-10-09에 나눈 파일이다. 옛 절 이름은 `docs/LOCAL-PATCH.md` 색인에서 찾는다.

## 선발 오퍼레이터 (2026-10-05, 0.2.0부터 upstream 自选 틀)
- 원본 甄选 규칙(공식 데이터 + bilibili wiki 盟约): V·VI단계 2칸씩, 경기 전 오퍼레이터 구성 화면에서 고른다. 고른 오퍼레이터는 그
  플레이어 상점에만 나오고(공식 문구 「只出现在自己的商店里」), 일반 E2 Lv1·스킬 4 / 정예 E2 Lv60·스킬 7·모듈 1(V) 또는 3(VI), 가격 4·판매 1·3장 합성. 특질 없음.
  맹약은 진영으로(위키 규칙), 없으면 협방(emptyShip, `constData.fallbackBondId`): 왕·첸 → 염, 나머지 → 협방. 叙拉古·卡西米尔도 공식 표의
  정규 맹약이다 — `activity_table` `autoChessData.bondInfoDict`의 `isPower` 맹약 8개의 `powerIdList`에 叙拉古 [siracusa, chiave]·卡西米尔
  [kazimierz, pinus]가 있다(2026-10-10 대조, 그 전엔 「확장은 [추정]」; `tools/build-data.mjs buildBackups`가 이 표로 정함).
- 지금 구현(0.2.0부터): upstream 「自选」 틀이 선발 칸·재고·상점·보상·밴을 맡는다(`server/match/player/diy.js initDiyStock`, `shared/diy.js`, 데이터
  `data/backups.json` `diy`). 맹약이 전부 꺼진 픽은 그 판 재고가 없다(`m.private.diyBanned`). 이 포크는 후보를 구현·대조한 8명으로 줄인다:
  `shared/local-diy.js LOCAL_DIY_PICKS`(望·赤刃明霄陈·维什戴尔·丰川祥子·阿斯卡纶, 2026-10-11부터 凯尔希·思衡托·克莱门莎·予愿安洁莉娜 — 아래
  「선발 추가 3명 (2026-10-11)」) — `tools/build-data.mjs`가 이것으로 `diy.ownedPool`을 만들고, `server/lobby.js`가 다른 픽을 거부한다.
  키트는 `server/sim/content/kits/ops/op-{wang,chen3,wisdel,oblvns,ascln,kalts2,clemnt,aglna2}.js`(등록 `kits/index.js OPERATOR_KIT_FILES`).
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
      _switchToDeadState: false}` — 폭발이 끝나면 돌이 스스로 철수). 철수(손 철수·발동 소모 모두)에 DP 반환은 없다 — 클라 코드
      `Token.get_allowWithdrawGainCost`(RVA 0x762E20)가 늘 false라 `Character.Withdraw`(0x6FF3F0)의 반환 분기를 타지 않는다(돌 프리팹
      `token_10064_wang_stone1`의 `_withdrawCostRecoverRatio` 0.5는 Token이라 쓰이지 않는 값; 2026-10-10 확인). 놓았던 돌은 모드의 재배치와 같은 방식(`Battle.redeploy`, `tokens.js enableRespawn`)으로 돌아온다:
      재배치 시간(E2 2초) 뒤, 자기 칸에, DP(토큰 cost 3, VI 정예는 모듈로 2)만 내고, 그 칸에 적이 없을 때. 망이 필드에 없으면 기다린다
      (구조상 맞음 — 클라 코드 `AutoChessBattleUtil.DestroyEntityToDummy`(RVA 0x7F1460)가 퇴장한 말을 정비 위치의 더미로 남기고,
      `AutoChessBattleTrigger._TryDeployAvailableCharacter`(0x7D6C90)가 0.2초 루프마다 다시 놓아 본다; 호스트 검사 내부는 안 읽음 [추론]).
      **한 번에 하나씩, 0.2초 간격** (2026-10-11): 같은 루프는 한 번 돌 때 하나만 놓고 그 회차를 끝낸다(`AUTO_TRIGGER_INTERVAL` 0.2초) — 그래서
      같은 때 돌아올 돌이 여럿이면 0.2초에 하나씩 차례로 돌아온다(`op-wang.js AUTO_TRIGGER_INTERVAL`, `redeployUsed`가 한 번에 하나). 그 전엔
      0.25초마다 돌아올 수 있는 돌을 한꺼번에 돌려보냈다. [남은 차이: 클라 루프는 그 플레이어의 오퍼레이터 재배치와 같은 루프라 둘이 한 회차를
      나눠 쓰는데, 오퍼레이터 재배치는 엔진 `Battle._checkRedeploys`가 매 틱 따로 한다.] 테스트 `test/local-patch-diy-wang.test.js` 「one per 0.2 s」.
      **돌아올 때 재고를 쓰지 않는다** — 놓은 돌은 전투 내내 소모 → DP 내고 복귀를 되풀이한다(2026-10-08 관리자 결정, `op-wang.js
      RETURN_USES_STOCK`(false)). 근거: PRTS 卫戍协议/帮助 「若召唤物在战斗期间退场，将在满足条件后立即原地再部署1个」(재고 언급 없음), 관리자의 플레이 기억
      (DP를 쓰며 다시 놓이는 바둑돌 때문에 다른 오퍼레이터가 퇴각했다), 아래 영상의 DP 감소. 실제 경기 경로 확인: m04 3·4라운드에서 望(돌 6개) +
      琳琅诗怀雅면 돌 복귀 DP 때문에 行商 지불이 막혀 琳琅诗怀雅가 퇴각한다. 전투 시작 재고 = 배치 한도 − 정비 때 놓은 수(다 놓으면 0) — 손패는
      새 칸에 놓이지 않고(아래 「손패 돌은 새 칸에 놓지 않는다」) 阻回(손패가 가득 차면 S1/S2 SP 정지)·S3 충전·S3 종료 조건에만 쓰인다
      (공식은 복귀도 같은 토큰 카드 1장으로 하고 철수 때 1장이 돌아와 순증감이 없다 — 아래 「돌아올 때 재고를 쓰지 않는다」와 같은 결과 [추론: 카드 반환 코드는 안 읽음]).
      배치 한도는 6, 모듈(`uniequip_002_wang`, VI 정예)이면 7
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
    - 정비 단계에 놓은 자리 그대로 전투를 시작한다. **전투 시작 자동 배치에도 돌마다 跟子 1개** (관리자 결정 2026-10-11 「공식대로」): 클라
      전투 자동 배치는 「수동 배치」로 태어난다 — 클라 코드 `AutoChessBattleTrigger._AutoDeploy`(RVA 0x7D5A60)가 `deck.SpawnCharacterOrToken(…,
      spawnManually: true, freely: false, …)`로 놓고, 재능 `wang_stone1_t_1[trigger]`(ON_OWNER_BORN)에는 수동 한정 필터가 없다. 그래서 모든 돌
      등장(전투 시작 배치, 소모된 돌의 재배치)에 跟子 1개가 붙는다: 돌이 태어나고 0.25초 뒤(아래 「跟子 던지기 지연」), 돌 하나 주변 4칸 중 1칸.
      跟子는 배치 한도에 들지 않아 정비 돌을 퇴각시키지 않는다(그 문제는 跟子를 투사체로 바꾸기 전 일). 전투 시작 배치는 0.2초에 한 말씩
      (`sim.md` 「작전 시작 차례 배치」)이라, 먼저 나온 돌의 跟子가 나중 돌의 정비 칸에 떨어지면 그 돌이 나올 때 그 跟子가 사라진다(아래 「跟子 칸에
      배치하면…」). `op-wang.js` 재능 install의 `deploy` 훅(`ctx.initial`인 그녀의 놓은 돌 → `followAround`). 테스트
      `test/local-patch-diy-wang.test.js` 「W2」(跟子가 이어 주어 활성화), `test/local-patch-diy.test.js` 「battle start = prep layout + each stone's
      跟子」·실제 경기 경로 「seven prep stones」(전투 시작 跟子 > 0, 정비 돌 7개 그대로).
      - **되돌리기** (옛 결정: 「전투 시작 자동 배치에는 跟子 없음」, 관리자 결정 2026-10-07, upstream 0.2.0 이식 때 2026-10-09 유지 — 그때 upstream
        `5a045731`의 전투 시작 跟子 부분을 안 받음; 2026-10-11까지): 옛 동작은 정비 돌이 跟子 없이 서고, 소모된 돌의 재배치와 재고 배치에만 跟子가
        붙었다(근거는 PRTS 铸子 「手动部署棋子时」를 위수협약 자동 배치에 적용하지 않는다는 해석). 되돌리려면 `op-wang.js` 재능 install의 `deploy`
        훅에서 `if (ctx.initial && a.kind === 'token' && a.defId === STONE_ID && a.ownerUnit === unit) followAround(battle, unit, a, 1);` 한 줄을
        지우고, 테스트를 옛 기대로: `local-patch-diy-wang.test.js` 「W2」(옛 판: 외딴 돌 + S1 자동 배치로 활성화 — 아래 손패 되돌리기와 같이),
        `local-patch-diy.test.js` 「battle start = prep layout」(전투 시작에 跟子 0개), 실제 경기 경로 「seven prep stones」의 「battle-start 跟子」 줄,
        그리고 여러 테스트의 `clearStartFollowers`·「battle-start ones cleared」 줄(지워도 통과).
    - 클라이언트 데이터 반영(2026-10-06): 망이 필드를 떠나면(퇴각·쓰러짐) 돌과 跟子가 모두 죽는다(`die_to_kill_token` ON_OWNER_FINISH →
      KillTokens; 놓았던 돌은 망이 다시 서면 제자리로 돌아온다 [추정]). 배치·재배치는 걷는 적만 막는다(`_excludeOccupiedByWalkEnemy`, 비행 적은
      안 막음). 跟子 위치는 아래 「跟子」 줄(클라 `WangTileSelector`). 跟子 발동은 적의 기준 칸으로 판정
      (`_checkTargetRootTile`). S1 지속 피해: 첫 틱은 걸리는 즉시, 1초 간격, 6.5초 → 7회(`waitFirstTriggerInterval: false`); 돌 토큰의
      지속 피해만 무출처, 跟子의 것은 망이 출처.
    - 跟子(E1+)는 망이 쏜 투사체(PRTS): 배치 한도에 안 들고 칸을 차지하지 않는다, 최대 `attack@max_spawn_cnt`개. 위치 우선순위(2026-10-10,
      클라 코드 `WangTileSelector` — 관리자 결정 「공식이랑 동일하게」): 후보(`_FilterWangNormal`: 캐릭터가 선 칸·배치 불가 고지대 제외)를 전투 난수로
      섞은 뒤, 놓을 수보다 많을 때만 정렬 — 비교자 `<_SortCandidates>b__14_0` 오름차순 키 ① 지상 먼저(`!isLowland`) ② 적이 있는 칸 먼저(유효한
      적 아무나, `_CheckContainsEnemies`) ③ 배치 불가 먼저(`buildableType != NONE`이 뒤) ④ 재능 跟子(TALENT)만 방향 `_GetDirectionPriority`
      (row+ 0, col+ 1, row− 2, col− 3 = 위 > 오른쪽 > 아래 > 왼쪽; 결정적), S3 시작(SKILL_3_INSTANT)은 ④ 없음 = 같은 칸끼리 무작위. 재능 跟子는
      돌 하나 주변 4칸 중 1칸(`_maxNum` 1)이라 늘 ④까지 정렬된다. 코드 `op-wang.js followerOrder`. 이전(2026-10-07 ~ 10-10, PRTS 비고 순서):
      적이 있는 칸 > 배치 불가 지상 > 배치 가능 지상 > 배치 가능 고지대 — 적이 있는 고지대 칸(비행 적)이 적 없는 지상보다 앞이었다.
      **좌우 반전된 필드(보스·히든 필드의 오른쪽 플레이어)에서도 필드 좌표 그대로** 위 > col+ > 아래 > col− (관리자 결정 2026-10-11 「공식대로」):
      클라는 맵을 뒤집지 않고 오른쪽 플레이어의 말 위치만 거울로 옮긴다 — 클라 코드 `AutoChessMapAreaManager.ConvertChessPositionInfoToRightMap`
      (RVA 0x832BC0): 왼쪽 일반 맵이면 평행 이동, 보스 맵이면 `dir = OppositeLR(dir)`, `col' = 2·m_mapLRBoundaryCol − col` — 그리고
      `WangTileSelector._GetDirectionPriority`(0x7199D0)는 실제 격자의 오프셋(`tile.pos − m_targetPos`)으로 순서를 매긴다. 시뮬레이션도 같은 모델이다:
      반전 플레이어의 유닛은 필드 좌표(20 − c)에 서고, `buildOne`이 받는 칸은 이미 필드 좌표, 필드 col+ = 화면 오른쪽. 그래서 2순위는 늘 화면
      오른쪽(필드 col+)이다. 테스트 `test/local-patch-diy-wang.test.js` 「on a mirrored field (boss right side) the 跟子 order stays the field's up >
      col+ > down > col−」.
      - **되돌리기** (옛 결정 W8, 관리자 결정 2026-10-07 — 「반전 필드면 그려진 대로 좌우를 바꿈」, upstream `SIDES_MIRRORED`와 같은 생각; 2026-10-10
        클라 순서로 바꿀 때도 「미확정」으로 유지; 2026-10-11까지): 옛 동작은 `battle.getPlayer(owner).mirror`인 플레이어(보스·히든 필드 오른쪽)의
        跟子가 필드 좌표 (+row, **−col**, −row, +col) 순서였다 — 화면 왼쪽이 2순위. 되돌리려면 `op-wang.js`에 상수
        `const ORTHO_MIRRORED = [[1, 0], [0, -1], [-1, 0], [0, 1]];`를 다시 두고 `buildOne`에서 `ORTHO.forEach` 대신
        `(battle.getPlayer(unit.ownerId)?.mirror ? ORTHO_MIRRORED : ORTHO).forEach`로, 테스트 「on a mirrored field…」의 기대를
        `{ r: low.homeR, c: low.homeC - 1 }`(옛 이름 「W8: on a mirrored field (boss right side, drawn col → 20 − col) right and left swap」)로.
      쓰러진 오퍼레이터가 누운 칸(`Battle.downOn`)에도 안 놓인다(upstream과 같게,
      2026-10-07 관리자 결정). 연결에 참여하고 피해 출처는 망. 여러 개를 이어 지을 때(S3 배치의 재능 1 + 추가 ≤ 3)는 **4프레임마다 하나씩**
      (`env_043_stone_trigger` `_stoneBuildDelay` 4, 클라 코드 `WangStoneTriggerManager.OnTick`의 buildStoneRequests — 2026-10-10, 그 전엔 한꺼번에):
      첫 개(재능, 무료)부터 추가분까지 각각 요청 0.25초 뒤에 내려앉고(아래 「跟子 던지기 지연」), 추가분은 지어질 때마다 탄약 1발, 놓을 칸이 없는
      차례는 건너뛴다(클라도 요청 수를 줄임). S3 시작 InstantSpawn 跟子도 한 번에 1칸씩(아래).
    - **跟子 던지기 지연** (2026-10-10 저녁, 관리자 결정 「클라 타이밍」 — 「S3 발동 뒤 돌이 놓이기까지가 너무 짧다」 제보): 跟子는 놓는 게 아니라
      던진다 — 재능의 BuildStone(`skchr_wang_3/SpawnTokenS3/BuildStone`·`…InSkill/BuildStone`)과 S3 시작 InstantSpawn은 둘 다 투사체 능력
      (`projectile_chr_wang_stone3`, `_preDelay` 0.25), InstantSpawn은 시전마다 1칸(`_maxNum` 1)·`_cooldown` 0.25(EN 클라 `[uc]skills.ab`).
      지금: 돌의 跟子는 각 요청 0.25초 뒤(1/30초 틱이라 8번째 틱, 0.267초; 이어서 4프레임 간격), S3 시작 跟子는 0.25초 뒤 첫 개, 그 뒤 0.25초마다
      한 개씩 — 칸은 내려앉을 때마다 새로 고른다 [ASSUMED: 클라는 시전 시작(0.25초 앞)에 고름]. 예전: 돌과 같은 틱(재능), S3 시작분은 한꺼번에.
      `op-wang.js FOLLOWER_PRE_DELAY`·`S3_SPAWN_COOLDOWN`. 테스트 `test/local-patch-diy-wang.test.js` W12(0.25초 뒤 첫 跟子),
      `test/local-patch-diy.test.js` 「none at the cast」.
      - **[열림] 투사체 비행 시간**: `projectile_chr_wang_stone3`의 이동 컴포넌트(속도)를 아직 못 읽어 0.25초에 비행 시간을 더하지 않았다 —
        조사 뒤 더할 것(관리자 결정 2026-10-10: 조사 전까지 제외).
      놓을 수 없는 칸(2026-10-06 관리자 제보): 클라이언트 跟子 선택기 `exceptTileTypes` + tileTypesMask 14. 비트는 클라 enum
      `Torappu.Battle.TileTypesMask`([Flags]: NONE 0, DEFAULT 1, HOLE 2, END 4, START 8, FAKE_HIGHLAND 16; 2026-10-10 확인 — 그 전엔 tileTypeDict
      순서로 END 2·START 4·HOLE 8이라 [추정]했다) → 14 = HOLE·END·START = `tile_end`·`tile_end_cooperate`·`tile_allygoal`(방어 지점),
      `tile_start`·`tile_start_cooperate`·`tile_enemygoal`(적 침입 지점), `tile_hole`(타일 키 → 마스크는 `BattleMiscDB.GetTileTypesMask`; 2026-10-10
      battle_misc_table `tileTypeDict`와 대조: END = tile_end·tile_end_cooperate·tile_allygoal, START = tile_start·tile_start_cooperate·tile_enemygoal,
      HOLE = tile_hole — `op-wang.js FOLLOWER_EXCEPT_TILES` 7키와 같다). 필드 밖 칸은 grid가 거른다 — 클라 `WangTileSelector._CheckMapTileValid`
      (0x7193C0)도 위수협약 전투 중에는 지금 전투 맵 영역(`AutoChessGameMode.FetchValidMapGrids` → `AutoChessMapAreaManager.FetchBattleValidMapGrids`)
      안만 허용한다(联防·보스 필드에서 그 영역이 자기 절반인지 필드 전체인지는 미확인 — 우리는 필드 전체). 배치 불가 고지대도 불가(재능·재배치·S3 시작 초과분·S3 배치 모두 같은 `followerClass`). 비행 적 출현
      칸(`tile_flystart`)은 이 목록에 없다. **깊은 심해(`tile_deepsea`)도 불가** (관리자 제보·결정 2026-10-08 — 공식 마스크 14에는 없음):
      `grid.js DEPLOY_REFUSED_TILES`가 깊은 심해를 「배치 불가 지면」(`build 'NONE'`)으로 만드는데, PRTS 비고의 순서가 그 지면을 跟子 1순위로 두어
      act2 m04 물길(6·14열 10–12행)에 跟子가 먼저 들어갔다(실제 매치 경로 6판 중 5판, 19개). 공식 맵에서는 그 물길에 발판 기물(수상 플랫폼)이 있어야 놓을 수 있는데(관리자 설명), 시뮬레이션은 그 플랫폼이 없으므로(`grid.js` [ASSUMED]) 깊은 심해 전체를 막는다(`op-wang.js FOLLOWER_REFUSED_TILES`).
      재능·S3 「적이 있는 칸」 모두 `followerClass`라 같이 막힌다(손패 돌은 새 칸에 놓이지 않는다 — 아래). 플랫폼을 모델링하면
      그 칸만 다시 열 것. 테스트 `test/local-patch-diy-wang.test.js` 「no 跟子 on a 深水区 tile」. 망 S3 자동 발동: 공식 규칙 「攻击范围扩大」 → 기본 전략(평타 직전 + 3-3 안의 적, `DEFAULT`). 한때 스킬 범위 4-12에 적이 들어오면
      켜지는 `SKILL_RANGE` 예외였으나 관리자 결정(2026-10-06)으로 공식 규칙으로 되돌렸다(트리거 예외 없음).
    - 손패(재고) 상한 maxDeckStackCnt(7)는 **손패만** 센다(클라이언트 `wang_s3_charge_token` max_cnt/remaining_cnt =
      AssignTokenCardCntToBB 카드 수, `_stopSpWhenTokenIsFull`도 카드 수). 전투 시작 때 위수협약이 나눠 준 배치 한도 6장(PRTS
      「根据召唤物部署数量上限…发送等量召唤物至手牌区」) 중 놓지 않은 것이 손패. S1/S2 「즉시 2개 획득」 = min(7 − 손패, 2)장, 손패 7장이면 阻回.
      S3(탄약형): 시작 때 ChargeToken min(7 − 손패, 8)장, 나머지는 InstantSpawn 跟子(살아 있는 跟子 ≤ max_spawn_cnt — 전투 시작 跟子도 센다) — 사거리 안 칸,
      클라 `WangTileSelector` SKILL_3_INSTANT 순서(위 「跟子」 줄: 섞은 뒤 지상 > 적이 선 칸 > 배치 불가, 같은 칸끼리 무작위; 2026-10-10 — 그 전엔
      적이 선 칸을 방어 지점까지 남은 경로가 짧은 적 순으로 먼저 `goalFirst`, 2026-10-06 관리자 결정 [추정]이었으나 클라에 그런 순서가 없어 사용자
      결정으로 뺌), 기존 돌과 붙을 필요 없음. 탄약 20발: S3 중 돌 1개가
      배치되면(= 소모된 돌의 복귀, 아래) **재능 跟子 1개(무료) + S3 跟子 최대 3개(1개당 1발)** — 배치 1번에 최대 3발(PRTS 「第一天赋额外至多部署3枚棋子并消耗等量弹药」,
      나무위키 「최대 3개의 바둑돌은 배치될 때 탄약을 1발씩 소모」; 2026-10-07 관리자 결정, 같은 날 인게임에서 확인; 2026-10-10 클라 코드로 확인 —
      `WangStoneTriggerManager.AddBuildStoneSequence`(0x561A80)가 요청을 `isFreeBuild` true로 만들고 `OnTick`(0x5625A0)이 첫 BuildStone 뒤 false로
      내린다, `WangVisualStoneCtrlAbility.BuildStone`(0xAD61F0)은 무료면 탄약 카운터에 `NotCountTimes`(세지 않음, 여분 탄 소리도 없음) — 첫 개만
      무료, 추가분은 1발씩). 이전(2026-10-06):
      跟子 최대 4개 전부 1발씩(클라이언트 SpawnTokenS3InSkill BuildStone 카운터 `_countEvent 4, _expendPerTrigger 1`).
      끝나는 조건은 재고 소진·탄약 소진·수동 종료뿐이고(클라 코드 `WangS3CastSkillWithLimitTimes.OnTick`: 손패 0 + 지을 跟子 없음
      `!hasRemainingBuildCnt` — 손패가 0이어도 이어 짓는 跟子가 남았으면 그것까지 기다린다, 2026-10-10 `followAround`), 남은 탄약은 돌로 돌아온다(엔진 `end()`가 onEnd 전에 `ammoLeft`를 0으로 만들어 이전엔
      반환이 늘 0이었음 → 킷이 따로 기억, 손패 7장까지). **정비 단계에 돌을 하나도 놓지 않았으면** 아무것도 충전·배치하지 않고 끝나지 않는다
      (관리자의 실제 게임 관찰 2026-10-06; 자료에는 직접 문장 없음). 손패가 새 칸에 나가지 않으니 손패는 S3 중 줄지 않고(복귀는 재고를 안 씀, 위),
      S3는 사실상 탄약 소진(복귀한 돌의 S3 跟子)·수동 종료로 끝난다 — 2026-10-11 전보다 훨씬 오래 간다(실제 경기 경로 m04에서 수십 초).
    - **손패 돌은 새 칸에 놓지 않는다** (관리자 결정 2026-10-11 「공식대로(빼기)」): 클라의 전투 중 배치 경로는
      `AutoChessBattleTrigger._TryDeployAvailableCharacter`(RVA 0x7D6C90) 하나뿐이고, 이것은 `battleChessInsts`(정비 때 필드에 놓인 말)를
      **정비 위치에만** 놓는다(`_AutoDeploy` 0x7D5A60: 대기 더미 칸 또는 `chessInst.pos`). 손패에만 있는 돌(정비 때 안 놓은 것, S1/S2 「즉시 2개
      획득」, S3 ChargeToken)을 새 칸에 놓는 코드는 없다(`AutoChessBattleTrigger` 메서드 전수 — 스킬 발동 판정과 이 둘뿐; 손 드래그 핸들러는 정비·보스
      화면 조작용 [추론]). 그래서 손패는 소모된 돌이 돌아올 재료일 뿐이다: S1/S2는 카드 2장만 받고(가득 차면 阻回), S3의 배치는 소모된 돌이 정비
      위치로 돌아오는 것뿐 — 그녀의 사거리 안이면 적이 선 칸에도 돌아오고(W10) 그때 재능 跟子 1개(무료) + S3 跟子 ≤ 3개(1발씩). S3 시작
      InstantSpawn 跟子는 그대로. 복귀를 그녀의 S3 배치로 세는 근거(2026-10-06 브라우저 재현): 정비 때 다 놓으면 필드가 늘 가득 차 대체 배치가
      한 번도 없어 탄약 막대가 가득 찬 채였다 — 복귀를 배치로 센 뒤 라운드 5 S3 탄약 16 → 12 → 9 → 5 → 2. 필드가 가득 차도 S3는 스스로 끝나지
      않는다(예전의 자체 종료는 근거 없어 삭제 — 일찍 끝나던 원인). 2026-10-08 영상의 「S3 중 0.5–1초 간격 초록 폭발」은 돌아온 돌·그 跟子·InstantSpawn 跟子로 설명된다(모순 없음).
      **남은 가능성** (관리자 요청 2026-10-11로 기록): 위 결론은 「클라에 그런 배치 코드가 없다」는 데서 나온 추론이다. 위수협약 전투는
      서버 스텝(`AutoChessStepModeManager`: 적 등장·퇴장·보스 HP 동기화)과 함께 도는데, 서버가 손패 돌을 새 칸에 놓으라는 배치 명령을 보내고
      클라가 그대로 따르는 경로가 있다면 공식도 손패 돌을 새 칸에 놓을 수 있다. 덤프에서 그런 명령(서버→클라 배치 패킷과 그 처리기)은 찾지
      못했지만, 서버 코드는 볼 수 없으므로 배제하지 않는다. 판별법: 공식 영상에서 S1/S2를 켠 순간 정비 때 없던 칸에 돌이 생기는지, S3 중
      소모된 돌의 정비 위치가 아닌 칸에 돌이 놓이는지. 생기면 아래 「되돌리기」로 옛 자동 배치를 되살린다(배치 칸 규칙은 옛 [추정] 그대로).
      `op-wang.js`: `gain`이 카드만 더함, S3 `onStart`에 대체 배치 없음. 테스트 `test/local-patch-diy-wang.test.js` 「no stone of the hand goes on
      a new tile」(S1/S2/S3, 새 돌 0개·S1/S2 손패 +2), 「W12: S3 deployment (a used stone coming back)」, `test/local-patch-diy.test.js` 「ammo per
      deployment」(복귀로), 「望 stones never share a tile」(실제 경기 경로, 재고 배치 0회).
      - **되돌리기** (옛 규칙 [추정], 2026-10-06 「S3 탄약이 줄지 않는다」 관리자 제보로 생김 — 2026-10-06 ~ 2026-10-11; 그 사이 관리자 결정:
        2026-10-06 빈 칸 대체·`isReservedTile` 예외, 2026-10-06 적 칸 `goalFirst` 순서(2026-10-10에 무작위로), 2026-10-07 W12 跟子 탄약, 2026-10-10
        「S3 첫 돌을 늦출지」 보류): 위수협약 전투에는 수동 배치가 없으니 재고의 돌을 자동으로 놓았다(필드의 놓은 돌 + 복귀 대기 돌이 배치 한도
        미만일 때만, 복귀 대기 돌이 먼저). S1/S2는 「즉시 2개 획득」 직후 기존 돌 옆(적 경로 위, 적이 없는 칸 — 특성, 적에 가까운 칸; `autoTile`),
        S3는 켜는 순간 하나, 그 뒤 1초마다 하나(`WANG_S3_PACE` 1) — 사거리 안 적이 선 배치 가능 칸(전투 난수 순서), 없고 필드에 적이 있으면 사거리 안
        빈 칸(지상 경로 우선, 적에 가까운 순, 걷는 적이 없는 칸), 그녀의 복귀 대기 돌 자리는 막지 않음(`reservedForOthers`). 재고 배치도 돌 DP를
        냈고 재능 跟子 + S3 跟子(탄약)를 붙였다; 손패 0 + 지을 跟子 없음이면 S3 종료. 되돌리려면 `op-wang.js`(2026-10-11 이 결정 바로 앞 판)에서 `deployStone`·`autoTile`·`autoDeploy`(그리고 `gain`의 `autoDeploy` 호출), S3 `onStart`의 `drop`과
        `battle.every(WANG_S3_PACE, …)`, 상수 `WANG_S3_PACE`, `reservedForOthers`, `inRange`·`stoneStats`, `hypot` import를 되살리고, 테스트를 옛
        판으로: `local-patch-diy-wang.test.js` 「W2」(S1 자동 배치로 활성화), 「W12: S3 deployment = … (stand-in drop and returns alike)」,
        `local-patch-diy.test.js` 「望 S3: the stand-in puts its stone on an enemy tile of her range in random order」, 「ammo per deployment」(대체 배치로),
        「hand cap 7 counts the hand only」(손패 2), 「望: only connected 棋子 trigger…」의 S1 자동 배치 줄, 「望 stones never share a tile」의
        `stock > 0`·S2 `one` 사례. 새 「no stone of the hand goes on a new tile」 테스트는 지운다.
    - 취세: 정지 + 망 공격력 × atk_scale 마법/초(발동마다 독립). 연성: 연결 방향(상하 → 세로, 좌우 → 가로, 한번 켜지면 유지) 양쪽 3칸 적에게
      마법 피해 + 감속. 料敌机先: 직선 위 돌 수만큼 피해 +%, 마법 저항 고정 수치 무시(최대 3). 중첩은 돌마다 본 최장 직선으로 고정
      (3개 중 1개가 사라져도 남은 돌은 3중첩). 값은 데이터: 일반·V단계 정예 10%/9, VI단계 정예(모듈 3) 13%/12. 클라 코드로 확인(2026-10-10):
      `StoneTriggerMap.UpdateStoneTriggerCnt` — 칸별 중첩·방향(행/열 수)을 최댓값으로 고정, 돌이 떠나면 `ClearExplodedStones`로 초기화;
      `WangStoneTriggerManager.OnTrigger`가 S1/S3에는 중첩을 bb `cnt`로(프리팹이 `max_trigger_cnt`로 자름), S2에는 `is_row`·`is_col`(가로·세로·십자 폭발).
    - **무장 지연** (2026-10-10, 관리자 결정 「공식이랑 동일하게」): 돌·跟子가 이어지면 연결선은 바로 나오지만 실제로 발동할 수 있게 되는 것(무장)은
      **30프레임 뒤**다 — `env_043_stone_trigger`(`WangStoneTriggerManager`) `_tokenStoneExplodeDelay` 30·`_projectileStoneExplodeDelay` 30, 클라 코드
      `_TryTriggerStones`가 `finishFrame = fixedFrameCnt + 30`, `OnTick`이 `fixedFrameCnt > finishFrame`인 다음 프레임에 `_DoStoneExplode`
      (onStoneTriggered → `wang_stone_triggered` 버프 → 토큰 `SkillTrigger` `_checkContainBuffs`). 그 사이 적이 지나가도 발동하지 않는다. 프레임: 클라
      고정 스텝 1/30 s(`globalgamemanagers` TimeManager `Fixed Timestep` 0.0333333, `GlobalConsts.TIME_ROUGH_LOGIC_RATE` 30) = 시뮬레이션 1틱 →
      이어진 틱 + 31틱(≈1.03 s)에 무장(`op-wang.js STONE_ARM_FRAMES`). 그 전엔 이어진 틱에 바로 무장. 「onStoneTriggered → wang_stone_triggered」
      연결은 환경 시스템 프리팹 `[uc]envsystems.ab` `env_043_stone_trigger` 자체에 있다(2026-10-10 확인, 그 전엔 이름으로 추론): 같은 GameObject의
      env 상태 수신 컴포넌트가 `"onStoneTriggered"`를 받으면 `Nodes.CreateBuffAllowAll`로 버프 `wang_stone_triggered`(INFINITY, maxStack 1)를
      건다(`"onTriggerEffectShow"`는 이어진 순간의 표시용 `wang_stone_triggered[effect]`). 토큰 프리팹에는 이 문자열이 없다. 버프가 INFINITY라 한 번
      무장되면 돌이 있는 동안 유지된다(위 「이어진 돌이 사라져도 활성」과 같음). 테스트 `test/local-patch-diy-wang.test.js` 「W2」(0.95 s엔 아직, 1.1 s엔 발동).
    - 跟子를 진짜 바둑돌이 아닌 투사체로 둔 근거: PRTS 「通过天赋'额外部署的棋子'实为望自身发射的弹道 由此其不具有单位相关的性质（例如占据空位等）」.
      화면에는 바둑돌 모델로 보이고 연결·발동·피해는 같다. 손패를 쓰지 않고 배치 한도 6에 들지 않아 정비 때 놓은 돌을 퇴각시키지 않는다.
    - **跟子 칸에 배치하면 그 跟子가 사라진다 (PRTS 铸子 备注, 관리자 결정 2026-10-09, upstream `5a045731`의 이 부분만 손 이식)**: PRTS 望 铸子
      备注 「跟子所在格进行部署（或进行类似部署的行为）时，该跟子会随之消失」(2026-10-09 upstream 대조 때 원문 확인). 跟子는 칸을 차지하지 않아서
      (`_occ` 비움, PRTS 「不占据空位」) 소모돼 기다리던 놓은 돌이 제자리로 돌아올 때(`Battle.redeploy`는 `_occ`만 본다) 이웃 돌의 등장 때 그
      빈 제자리에 놓인 跟子 위로 돌아올 수 있다(관리자 제보 2026-10-08; 실제 매치 경로 990판 중 292판, 한 칸에 돌 둘). 이제 그 복귀가 그 칸의 배치라서
      跟子가 사라진다: `op-wang.js` 재능 install의 `deploy` 훅이 아군 누구든(돌의 복귀, 재고 돌, 오퍼레이터의 재배치·`moveRedeploy` 이동) 배치된
      칸의 그녀 跟子를 `retreat`로 지운다. 놓은 돌(跟子 아님)이 제자리에 있으면 여전히 기다린다(2026-10-11부터 새 칸 배치가 없어 실제로는 생기지
      않음). 전투 시작 자동 배치에도 跟子가 붙으므로(위, 관리자 결정 2026-10-11 — 그 전엔 2026-10-09에 upstream `5a045731`의 전투 시작 跟子 부분을
      안 받아 없었다) 0.2초 간격의 다음 말이 앞 돌의 跟子 칸에 나오면 그 跟子가 사라진다.
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
    벽 판정은 클라 코드 `_CheckHitConditions`(0x96C610)와 같다(2026-10-10): 맵 밖, `heightType` 1(고지대), `TileTypesMask` START 8·END 4 —
    저지대 통행 불가·장애물 칸에서는 꺾지 않는다(START/END 마스크의 `tile_start_cooperate`·`tile_enemygoal`·`tile_end_cooperate`·`tile_allygoal`은
    우리 맵 데이터에 없다). **한 틱에 한 번만 꺾는다** (2026-10-11, 클라 코드 `ChangeStateWithHighlandBehaviour.OnTick` 0x96C200: 틱마다
    `_CheckHit` → `_ChangeDirection` 한 번) — 앞과 그 오른쪽이 모두 막힌 막다른 곳에서는 틱마다 90°씩 돈다. 그 전엔 한 틱에 최대 4번 꺾은 뒤
    움직여 한 틱에 180°도 돌았다. 테스트 `test/local-patch-diy-chen3.test.js` 「S3: the 剑气 turns at most once per tick」.
    시계 방향은 클라 코드 상수다(2026-10-10 정정 — 예전 「방향 값은 클라이언트에 없다」는 틀림): `ChangeStateWithHighlandBehaviour._ChangeDirection`이
    이동 방향을 상수와 비교해 위 → 오른쪽 → 아래 → 왼쪽 → 위로 바꾼다(PRTS 「顺时针旋转90°」과 같음). 꺾는 조건은 클라 `_CheckHit`
    `_hitDistance >= d && d > _hitEps`(0.02 < d ≤ 0.25 — `_hitEps`는 여유가 아니라 하한; 우리는 ≤ 0.27로 둠, 벽 앞 0.25에 멈추므로 실제 궤적 차이는
    거의 없음 [추론]). 이전 코드와 다른 점: 0.75 앞을 봐서 0.5칸 일찍 꺾었고,
    저지대 통행 불가 칸·장애물이 놓인 칸에서도 꺾었고, 侵入点에서는 꺾지 않았다. 판정 간격 0.03초(이전 0.1초 → 이제 매 틱),
    수명은 스킬 끝까지(`_lifeTimeType` 2 = 클라 enum `LifeType` INFINITY — 2026-10-10 확인, 스킬 종료 버프 `chen3_s3[finish_projectile]`가 지운다).
    **검기가 나가는 때·S3 모드** (공식대로 — 2026-10-11 밤 두 번 다시 확인해 고침): 시작 애니 `Skill_3_Begin`(13프레임 0.433 s, OnAttack 없음 —
    `skchr_chen3_3` `_playSkillBeginAnim` 1, 클라 코드 `BasicSkill.PlayBeginAnimation`이 그 길이만큼 기다린 뒤 `DoStartSkill` → `SkillState` →
    `BasicSkill.Cast`) 동안은 공격하지 않고, 끝나는 순간 **공격과 상관없이** 검기가 그때 그녀가 보는 방향으로 나간다(사거리에 적이 없어도). 그 3틱 뒤
    (시전부터 약 0.533 s) S3 모드가 켜져 **첫 공격부터** S3 공격(atk_scale 1.8·3타·Skill_3_Loop·사거리 3-12)이다. 근거: `skchr_chen3_3`은
    `AbilitySequenceGroup`(`_alwaysNext` 1 — `CastToTarget`이 첫 하위 능력을 곧바로, `_OnSubAbilityFinished`가 하나가 끝나는 즉시 다음 것을 시전,
    그룹은 마지막 것이 끝나야 끝남)이고 하위 능력은 EmitProjectile → SwitchMode(`mode` 3 = `Modes/S3`: `Body/Attack` `_animKey` Skill_3_Loop,
    `_attackBlackboardModeIndex` 3, `_rangeIdModeIndex` 3), 둘 다 `ActiveBuffAbility` `_waitForCasting` 0. EmitProjectile의 투사체는
    `SimpleProjectileEmitter` `_emitEvent` 2 = ON_CAST_START(`AbilityStandard._DoCast`가 전딜 전에 냄, `OnEvent`가 그 이벤트에만 발사).
    `ActiveBuffAbility`는 전딜·후딜을 스스로 덮어써(`<OnWaitForPreDelay>d__33`·`<OnWaitForPostDelay>d__34`) `_waitForCasting` 0이면 각각 고정 틱 하나만
    기다리고 `_waitForAttackEvent` 1은 읽지 않는다 → EmitProjectile 전딜·후딜 2틱 + SwitchMode 전딜 1틱 = 3틱 뒤 `chen3_s3[switch_mode]`. 그동안
    `SkillState`가 공격을 막는다. 그 버프의 템플릿 `switch_mode_restart_fsm`(`Nodes.SwitchMode` `_restartFSM` 1, 버프 시작·끝 둘 다)이 모드를 바꾸며
    상태 기계를 재시작한다: `Unit.SwitchMode` → `ActivateMode`가 S3 모드의 공격 능력을 붙이고(`Ability.DoAttach` → `Reset` →
    `PeriodicTimer.Reset(쿨다운, waitFirstPeriod=false)` = **바로 준비**, 모드마다 공격 능력이 따로라 시전 전 평타 쿨다운을 안 이어받음) →
    `Unit.OnSwitchMode`가 `StateMachine.Stop`(`SkillState.OnExit` → 스킬 `InterruptIfNot`로 시전 끊음) → `Start`(기본 상태 IDLE) → 다음 틱
    `IdleState.OnTick`이 대상을 찾아 ATTACK → `AttackState.OnEnter`가 바로 휘두름. 스킬 끝(버프 끝)에도 같은 재시작 — 진행 중 S3 휘두름은 끊기고 Default
    공격 능력이 새로 붙어 바로 준비. 공식 설명 「技能开启时向前释放一道可转向的剑气」과 맞다. 핫픽스 목록에 관련 메서드 없음.
    구현: `op-chen3.js s3Spec` — 단계 `begin`(공격 없음 `S3_HOLD`) → `S3_BEGIN`에 `releaseQi` → `S3_BEGIN + 3틱`에 `mode`(S3 범위, 아직 공격 없음,
    `restart`: 휘두름 없앰·`atkCd` 0) → `S3_BEGIN + 4틱`에 `attack`(S3 프로필); 스킬이 끝나면(`onEnd`, S3 모드였으면) `restart` 뒤 스펙을 되돌림. 틱 수(클라 코드로 확인): 자동 시전 `AutoChessBattleTrigger`는 코루틴이라 `BattleController.OnTick`에서 유닛 갱신 뒤
    `CoroutineSimulator.SimulateTick` 때 시전한다 → `CastSkill.UseSkill` → `Character.SwitchToSkillState` → `SkillState.OnEnter` →
    `BasicSkill.OnBeforeSkillStart`가 `PlayBeginAnimation`을 띄움(`StartBattleCoroutine`은 첫 단계를 바로 돌리지만 `SimulateTick` 중에 띄운 코루틴은
    다음 틱부터 재개) → `AsyncUtil.WaitForFixedSeconds`가 round(0.433×30)=13번 양보 → 13번째 틱에 `DoStartSkill`이 `m_startSkill`
    (= `SkillState._DoStartSkill`)을 그 자리에서 부르고 같은 호출 안에서 검기 → 14·15틱 EmitProjectile 전딜·후딜 → 16틱 SwitchMode 전딜 끝에 S3 모드.
    16틱에 상태 기계 재시작으로 `SkillState`를 벗어나고 17틱에 첫 휘두름(그룹 끝을 기다리지 않음). 우리 `S3_BEGIN`(13틱)·`+ 3틱`(16틱)·`+ 4틱`(17틱)과 같다.
    (`c858c112`의 「그룹이 17틱 이후 끝나야 벗어남」은 틀렸다 — `restartFSM`을 안 봄. 그 전 우리는 16틱에 휘둘렀고, 시전 직전 평타가 있었으면 그 쿨다운을
    이어 써서 32틱이었다.)
    지난 동작: 2026-10-10 ~ 10-11 시전 0.433 s 뒤 발사·S3 공격은 시전부터(공격 막음 없음); 10-11(`49eb223e`, 결정 13) ~ 10-11 밤 검기가 첫 평타 타격까지
    기다리고 S3 모드는 그다음 공격부터(그녀 범위에 적이 없으면 둘 다 안 나옴); 10-11 밤 `cdc84e33` 검기만 시작 동작 + 1틱, S3 모드는 여전히 Default 첫 평타
    뒤(S3 범위에만 적이 있으면 20 s 내내 평타 없음 — 시뮬 측정). 두 번 다 틀린 원인은 기반 클래스 `EasyToStartAbility.OnWaitForPreDelay`만 읽고 실제
    클래스 `ActiveBuffAbility`가 그 슬롯을 덮어쓰는지 안 본 것(비공개 조사 기록 「남은 의문 조사」). Default 클립 엔진 줄(`ai.js attackClipOf`의 스킬 스펙
    `baseClip`, `'swing'` 다섯째 값 1 → `render/units.js onSwing` → `spine.js baseClip`)은 `49eb223e` ~ `cdc84e33`의 첸 S3 Default 첫 평타용이었고 지금은 쓰는 키트가 없다.
    테스트 `test/local-patch-diy-chen3.test.js` 「S3: the 剑气 leaves as Skill_3_Begin ends」(검기 0.433 s, 첫 스윙 17틱·스킬 클립, 첫 공격 3타·스킬), 「the S3 mode's attack is ready at once」(시전 직전 평타 뒤에도 17틱),
    「S3 end: the switch back restarts」(끝날 때 휘두름 끊김·`atkCd` 0),
    「with enemies only in the S3 range」(10,6에만 적: 검기·S3 범위·S3 공격), 실제 경기 경로 「S3 on m04」(시전 틱 + 13에 검기; 그녀 자리 10,7로 되돌림).
    `op-chen3.js chen3QiAdvance`(테스트용 export). `fx` 'chen3Qi'는 0.1초마다 + 꺾일 때 바로.
    S3 자동 발동: 공식 규칙 「攻击范围扩大」 → 기본 전략(평타 직전 + 1-1 안의 적, `DEFAULT`) — 평타로 칠 수 없는 비행 적만 있으면 켜지지 않는다.
    한때 3-12 안의 적(비행 포함)으로 켜지는 `SKILL_RANGE` 예외였으나 관리자 결정(2026-10-06)으로 공식 규칙으로 되돌렸다. 예외가 다시 필요하면
    `tools/build-data.mjs TRIGGER_DEVIATIONS`(관리자 결정으로만).
  - 위셔델: 여진·잔영 폭발(재능1), 혼령의 그림자 소환과 근처 위장(재능2), S2 과부하(지속시간 후반부), S3 그림자 2개 추가(최대 3).
    S2 과부하 근거(2026-10-10, 그 전엔 [추정]): 스킬 프리팹 `skchr_wisdel_2`가 `_isOverloadSkill` 1이고, 클라 코드 `BasicSkill.get_overloadRatio`
    (0x63DAC0)가 그런 스킬에 0.5 → `OverloadIfNecessary`(0x63ADC0)가 진행도가 0.5를 넘으면 과부하(ON_OVERLOAD → 버프 `wisdel_s_2[overload_start]`,
    `mode 2`) — 25초 중 12.5초부터 끝까지(`op-wisdel.js overload`) [추론: 진행도 = 경과 비율, 보조 함수 하나는 해석 안 함].
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
    회전은 PRTS 「转向速度7/30每帧」 = 30fps에서 7/초. 추적 속도는 고정이다: 클라 코드 `AdvancedMovement.OnTick`(0x97DDC0)은 `_useDynamicSpeed`일
    때만 `_deltaSpeedPerSec`·`_finalSpeed`로 가속하는데 음표의 추적 이동(`ToTraceTarget`)은 모두 `_useDynamicSpeed` 0 — 프리팹의 0.4·4.0은 쓰이지
    않는 값, 2026-10-10 확인.)
    규칙: 자유 비행 방향은 사키코 방향 ±20°(PRTS 「自身朝向左20°至右20°范围内，随机一个角度」; 2026-10-10 클라 코드로 확인 —
    `BasicMovement._InitDirectionByStart`, `_useSourceDirection` + `_useSourceDirectionRandomArcAngleStart`: 전투 난수 `Range(−angle, +angle)`,
    angle = 블랙보드 `angle` = 재능1 `attack@angle` 20. 일반·재능 음표는 확인, S2·S3 음표는 같은 플래그이고 스킬 블랙보드에 `angle`이 없어 재능 값을
    쓴다 — 공격 능력이 쏜 투사체의 블랙보드에 `attack@` 키가 접두사 없이 들어간다: 피아노 음표의 `MovementSwitchControllerOblvns.Init`이
    `projectile.blackboard`에서 `"passby_delay"`(S2 `attack@passby_delay` 0.5)를 읽는다, 2026-10-10 [추론: 합치는 함수 자체는 안 읽음]). **S1 부채꼴** (2026-10-10, 관리자 결정 「공식이랑 동일하게」): 같은 메서드의
    `_useSourceDirectionArcAngleWithRatio` — a = angle × (2·ratio − 1), ratio = `_sourceDirectionArcAngleRatio` (2i+1)/16, angle = S1 블랙보드
    `angle` 15 → 정면 ±13.125°(3.75° 간격, 30° 부채꼴) 8개. 그 전엔 비율을 360°에 곱해 한 바퀴로 뿌렸다 [추정이었음]. **1번 음표(가장 센 1.0배)는
    보는 방향의 왼쪽(반시계)** (관리자 결정 2026-10-11 「공식 부호」): 클라 코드 `LitePhysicsUtil.Rotate`(RVA 0x6ABC70) = `Quaternion.AngleAxis(a, up)
    · dir`, 축 `up` (0,0,−1) — 축이 −z면 +a가 시계 방향이라 1번(a = −13.125°)은 반시계, 8번(+13.125°)이 시계 쪽. 오른쪽을 보면 1번이 화면 위쪽,
    0.06초마다 아래로. 그 전(2026-10-10 ~ 10-11)엔 거울상(1번이 시계 쪽). **[추정]**: 이 부호는 전투 월드 좌표가 x = 열, y = 행(화면 위), 높이 = −z라는
    전제에서만 맞다 — 그 전제는 화면으로 확인 안 함(관리자는 S1을 거의 안 쓰고 이 가정을 받아들임, 2026-10-11). ±20° 무작위는 대칭이라 영향 없음.
    `op-oblvns.js` S1 `deg` 부호. 테스트 `test/local-patch-diy.test.js` 「丰川祥子 S1」, 실제 경기 경로 `test/local-patch-diy-oblvns.test.js`
    「丰川祥子 S1 through the real match path」(오른쪽을 볼 때 1번 +13.125° … 8번 −13.125°). 공격 대상이 있으면 그 적을, 없으면 음표 반경 안에서 음표에
    가장 가까운 선택 가능한 적을 주기마다 찾는다(PRTS 「选择自身一定范围内距离音符自身最近的可选目标」). 최소 자유 시간이 지나고 대상이 있으면
    추적, 대상이 사라지면 현재 방향으로 다시 자유 비행(PRTS 「以当前运动方向重新进入至【自由移动】状态」). 사키코의 공격 범위 밖에서 대상 없이
    연속 `delay`(재능 bb 1초, 클라이언트 `passby_delay` 1.0)초 있으면 사라진다(PRTS 「音符位于自身攻击范围外时，若连续1s以上不存在跟踪目标则消失」)
    — 사거리 끝에서 바로 사라지지 않고 지나서 1초 더 난다(관리자 결정). 사키코가 퇴장하면 추적 중이 아닌 음표는 사라진다(PRTS
    「自身退场时，清除所有不处于【跟踪移动】状态的音符」, charpack `ProjectileElimate` `_keepAliveIfContainsTraceTarget`). 음표 수 = 살아 있는
    음표(클라이언트: 투사체 생성 이벤트에서 `oblvns_t_1[cnt]` +1, 도착·소멸 이벤트에서 −1; `oblvns_t_1`이 cnt × 비율을 max_cnt까지).
    시간 수명은 두지 않는다: 프리팹 `_lifeTime` 10은 `_lifeTimeType` 2 = 클라 enum `LifeType` INFINITY(IMMEDIATELY 0, LIMITED 1, INFINITY 2,
    CUSTOM 3 — 2026-10-10 확인; 그 전엔 `_lifeTime` 0인 같은 유형 투사체 57개로 [추론]). `NOTE_SAFETY`(60초)는 끝없이 쫓는 음표를 막는 시뮬레이션 안전장치일 뿐.
    엔진에서 넘겨받은 일반 공격 음표도 **쏠 때의** 공격력·공격 배율로 맞힌다(2026-10-11; 그 전엔 [추정]으로 도착 때 값): charpack
    `char_4182_oblvns.ab`의 공격 능력 24개(Default `Combat`·`RangedMulti`·`RangedAlways`, S2·S3의 공격들) 모두 `RangedAttack._useCachedAtkOnly` 1 —
    `BattleFormula.CalculateCachedAtkDamageFromProjectile`이 투사체의 캐시 공격력으로 피해를 낸다(PRTS 「所有音符强制使用缓存攻击力与攻击倍率」과 같음).
    키트가 엔진 투사체를 넘겨받을 때 `projectile.cachedAtk`(공격력·攻击倍率 배수)를 적고 엔진 `resolveHit`이 그 값을 쓴다. 트레잇의 원거리 감소(80%)와
    LOR-Y의 「스킬 중 감소 없음」은 지금처럼 도착 때 판정 [추론: 공식은 감소도 캐시에 들어갈 수 있음]. 테스트 `test/local-patch-diy-oblvns.test.js`
    (버프 없이·쏜 직후 공격력 2배 두 판의 같은 음표 피해가 같음, 실제 매치 경로 포함). S2 피아노의 관통은
    그림만(피해는 1명: `_maxHitNum` 1). 사인 비행은 그림만, 시뮬레이션은 직선. 한 음표가 2타(S2 Fever, S3 피아노)면 `w: 2`로 세고 그림도 2개.
    도착 판정 거리는 피아노 0.8(PRTS 「激活0.8半径的碰撞」; 클라 `projectile_chr_oblvns_s2`·`_s2_t` 루트 `CircleCollider2D` m_Radius 0.8 + `_maxHitNum` 1,
    도착하면 `MovementSwitchControllerOblvns`가 3.0칸/s로 `passby_delay` 0.5초 미끄러진 뒤 멈춤 — 2026-10-10 확인. 클라 히트 검사는 0.1초 주기이고
    이동 상태와 무관(`_onlyCheckHitWhenReachTarget` 0)이라 자유 비행 중에도 0.8 안이면 맞을 수 있는데, 우리는 추적 중에만 매 틱 본다 [추론: 히트
    검사 동작 내부는 안 읽음 — 차이는 작음]), 나머지 **0.1** — 추적 이동 `AdvancedMovement.DoCheckReachedInternal`이 대상 위치
    0.1 안이면 도착(2026-10-10, 관리자 결정; 그 전 0.2 [추정], `op-oblvns.js NOTE` `hit`). 화면: `fx.md`의 사키코 음표.
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
  → 기다리는 돌도 자리를 차지(`autoDeploy`와 같음), `redeployUsed`는 한도가 차 있으면 기다린다. (2026-10-11: `drop`·`autoDeploy` 자체를 뺐다 — 위 「손패 돌은 새 칸에 놓지 않는다」.)
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
- 기본 전략의 rangeId 상자(데이터 `DEFAULT` + `customRangeGrid`, 관리자 결정 2026-10-11)는 **선택 가능한** 적만 센다(클라
  `m_findEnemyTargetOptions`, 지상·공중) — 범위에 은신 적만 있으면 켜지지 않는다(첸 S2: 선택 가능한 적이 올 때까지 대기). 엔진 규칙
  `SKILL_RANGE`(지금 데이터에서는 余 S2 예외만)는 선택 가능 여부를 무시하고 켜진다.

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
- 스킬 자동 발동 규칙은 `tools/build-data.mjs resolveTrigger`가 정한다: 공식 표에 없으면 MANUAL + rangeId(공격 범위 변경 포함) →
  `DEFAULT` + `customRangeGrid`(그 상자 안의 적, 치유 스킬도 적), rangeId 없으면 `DEFAULT`(공격 중) — `sim.md` 「스킬 범위 발동」.
  다르게 하려면 `TRIGGER_DEVIATIONS`(의도적 예외, 관리자 결정으로만).

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

**연출 대조** (2026-10-12, 안젤리나 더 멜로우 위시 S2 — 아래 「S2 활공 모션」)
판정 규칙은 테이블·PRTS로 맞춰도 연출은 클라 프리팹에만 있다. 렌더가 스킬마다 begin/loop/end/idle 한 벌만 알아 `Skill_2_Takeoff_*`를 한 번도
틀지 않았고, 몸이 투사체에 실려 가는 것(`_restoreOnEnd`)과 높이 변화(ModifyGraphicHolderHeight)도 빠졌다. 키트를 넣거나 고칠 때 아래를 하나씩 본다.
**선발만이 아니다**(관리자 결정 2026-10-12): 상점 기물·예비 오퍼레이터의 키트·모델·클립을 고칠 때, 그 오퍼레이터의 모션 제보를 볼 때도 같은 항목을 본다.
클립 누락은 모든 오퍼레이터를 테스트가 전수로 잡는다(`render.md` 「Spine 클립 커버리지」).
- **Spine 클립 전수 대조**: `node --test test/render/clip-coverage.test.js`가 `data/assets.json` 모든 오퍼레이터의 앞·뒤 모델 클립을 렌더가 트는 클립
  (역할 `idle`·`deploy`·`die`·`attack`·`move`·`stun`·`run`·`skill`/`skills[i]` — `tools/assets/anim-roles.mjs` + `anim-overrides.mjs SKILL_CLIP_OVERRIDES`,
  `render/units.js FORMS`·`FORTRESS_CLIPS`)과 맞추고, 남는 클립은 `test/render/clip-coverage-list.js`에 상태(`render`/`none`/`todo`)가 있어야 통과한다.
  매니페스트의 `attackDown` 역할과 이름에 `Down`이 든 클립은 렌더가 **안 튼다**(전역 공백, 같은 절). 그 오퍼레이터의 `todo` 항목(`*_Move`, `*_Combat`,
  `*_Restart_*`, `*_Overload_*`, `*_A`/`*_B` 짝, `Start_2`, `Skill_n_Die` 등)은 하나씩 「공식에서 언제 트는지」를 찾아 연결하거나 근거를 붙여 `none`으로
  바꾼다(새로 생긴 클립은 테스트가 실패로 알려 줌). 찾는 곳: 스킬 프리팹(아래), charpack `char_<id>.ab`의 `_modes`(`Modes/<이름>/` 아래 능력의
  `_animKey`·`_endAnimKey`, 모드의 `_replaceAnimPairs` — `tools/local-extract/attack_timing.py`·`char_modes.py`가 읽는 자리), 버프 템플릿(아래).
  앞·뒤 모델 클립 목록이 다를 수 있으니 둘 다 본다.
- **스킬 프리팹**(`battle/prefabs/[uc]skills.ab` `skchr_<code>_<n>`, `skill_cast.py`가 같은 번들을 읽음)의 연출 필드: `_playSkillBeginAnim`·`_beginAnim`(시작
  클립과 그동안의 대기 — 첸 더 던스트릭 S3), `_switchToState`, 吟唱(ChantBeforeSkill 계열) `_animation`의 begin/loop/end와 `_afterEndAnim`·
  `_buffOnAfterEndAnim`·`_interruptProjectileOnEndAnim`, 클립 컴포넌트 `_default {beginAnim, loopAnim, endAnim}`, `switch_mode` 버프 → 그 모드의
  클립(`char_modes.py` `skillMode`, charpack `_replaceAnimPairs`). 기본값이 아닌 필드는 렌더가 그것을 하는지 하나씩 확인한다.
- **투사체**(`battle/prefabs/[uc]projectiles.ab`, 스킬 프리팹의 `_projectileKey`): follower 컴포넌트(`_follower`·`_policy`·`_restoreOnEnd`·
  `_faceToMoveDirection`)가 있으면 시전자의 **몸이 투사체에 실려 간다**. `_restoreOnEnd` 1 = 끝나면 원래 자리로(S2 활공), 0 = 도착한 자리에 남음(S3 비행).
  속도·도달 거리(`_speed`, `_distanceMax` Q32)·수명(`_lifeTimeType`)도 함께 읽는다.
- **버프 템플릿**(`config/buff_template_holder.ab`의 `_templates[]`, `SerializedState`가 `$type` JSON — `tools/local-extract/enemy_bindings.py
  read_buff_templates`가 읽는 방식; EN 전체 덤프는 관리자 노트): 그 오퍼레이터 버프(`<code>_s_<n>[…]`, `<code>_t_<n>`)의 ModifyGraphicHolderHeight(그림
  높이·시간), SwitchMode(모드 → 클립), CreateEffect(이펙트 키) 노드. 노드가 거는 블랙보드 값(`height_duration` 등)은 skill_table에서 찾는다.
- **PRTS 备注의 연출 문구**: 「模型」「不改变所在地块」「中心坐标」 같은 말은 모델만 움직이고 판정은 그대로라는 뜻이다. 판정(칸·좌표·사거리)은 시뮬, 모델 위치·높이·
  클립은 렌더로 나눈다(시뮬이 칸을 옮기면 공식과 달라진다). 숨은 주석도 본다(S2 활공의 끝점 규칙이 거기 있었다).
- **어느 클라로 확인했는지**: EN에 있는 클래스는 디컴파일로 「언제 트는지」(어느 메서드가 그 필드를 읽는지)까지 확인한다. CN 전용 클래스(CN
  `GameAssembly.dll`은 덤프 불가)는 필드만 읽고 해석을 [추정]으로 표시한다(이 문서의 근거 줄에 「CN 전용, 필드만」이라고 쓴다).
- **렌더 테스트**: 실제 매니페스트(`data/assets.json`)의 그 항목으로 `SpineActor`를 만들고 클립 순서(`setAnimation`/`addAnimation` 기록), 공격 클립 대기,
  스킬 끝 처리, 뷰 위치·높이를 고정한다(`test/render/aglna2-s2-glide.test.js` 형식, 가짜 PIXI `test/render/fakepixi.js`). 화면 확인(Windows Chrome 디버그
  아레나)은 관리자 노트의 열린 항목 목록에 한 줄로 남긴다.

**테스트** (`test/local-patch.test.js`)
- 범위 피해가 있는 스킬마다 은신 적(예: 隐形弩手)을 맞히지 않는 테스트.
- 함정 소환물은 공격 대상이 안 되는지, 정비 때 놓은 자리가 전투 시작 후에도 같은지.
- 탄약·지속 스킬은 종료 조건과 종료 후 반환값.

## 선발 추가 3명 (2026-10-11, 관리자 결정)
- 관리자 결정 2026-10-11: 선발에 凯尔希·思衡托(`char_1052_kalts2`, 6성 메딕 守望者), 克莱门莎(`char_4231_clemnt`, 6성 가드 本源近卫),
  予愿安洁莉娜(`char_1015_aglna2`, 6성 스페셜리스트 巡空者)를 넣는다(`shared/local-diy.js LOCAL_DIY_PICKS` 끝에 이 순서). 셋 다 한국 서버 출시 전이라
  한국어 이름·문구는 비공식 수동 번역이다(`tools/i18n/diy-ko-manual.json`): 켈시 에스페란타 · 클레멘티아 · 안젤리나 더 멜로우 위시(글로벌 이격
  이름 규칙 「○○ 더 △△」을 따름), 소환물 전술 앵커 · 「이따 봐!」, 직군 守望者 = 파수꾼, 용어 缚地 = 지면 속박 · 对空庇护 = 대공 가호(KR 표에
  없는 용어. 나머지 용어는 KR `gamedata_const` 그대로: 이륙·정지·실드·공중 부양·무중력·이동·침식 손상·[바다 괴물]).
- 데이터: CN 표 그대로(`tools/build-data.mjs`, 克莱门莎는 2026-10-11 온라인 갱신 `c01e2531`부터 표에 있음). 셋 다 모듈 없음. 맹약: 凯尔希·思衡托 협방,
  克莱门莎 에기르, 予愿安洁莉娜 시라쿠사. 소환물: 战术锚点(S3, 손패 1개, 「攻击范围外的远程位」만 — 서버·클라이언트 배치 규칙은 upstream 그대로 남아 있었음),
  “一会儿见！”(S3가 처음 배치 칸에 두는 표식, 손패 아님).
- 키트: upstream `master`(0.2.4-dev `6bfc0827`)의 `op-kalts2.js`·`op-clemnt.js`·`op-aglna2.js`와 그 테스트를 가져왔다(앞의 둘은 하드 포크 때
  `1fc07616`에서 지운 것). 엔진 쪽(缚地, 起飞 범위 피해 제외, 战术锚点 배치 칸)은 우리에게 이미 있었다. 우리 규칙에 맞춘 것:
  - 자동 발동은 `sim.md` 「스킬 범위 발동」(관리자 결정 2026-10-11 확정) 그대로: 데이터 `DEFAULT` + 스킬 rangeId 상자 안의 **선택 가능한 적**.
    upstream 테스트의 `ACTIVE_RANGE` 단언은 `DEFAULT` + `triggerGrid`로 고쳤다. 凯尔希·思衡托 S2: upstream 키트의 `trigger: ACTIVE_RANGE` +
    `enemies`(upstream 주인 규칙 「치유 스킬은 범위 안 다친 아군」)를 뺐다 — 다친 아군만 있으면 켜지지 않는다(치유 스킬도 적을 센다).
    upstream도 #406 뒤로는 「적으로만 켜짐」을 테스트한다(`heal-triggers-023`). 克莱门莎 S2: upstream #467의 공중 적 추가 발동 범위(사거리 연장 포함
    `addTriggerRange`)는 받지 않았다 — 기본 전략 상자가 이미 공중 적을 세고, 연장은 더하지 않는다.
  - 받은 upstream 0.2.4-dev 수정: 克莱门莎 S2 확산 반경 1.1·공격력 100%(PRTS 2026-10-10).
  - 凯尔希·思衡托 특성 「Mon3tr(凯尔希의 소환물)는 禁疗를 무시하고 치료」: 키트에 그대로 있지만 이 서버에 凯尔希가 없어 쓰일 일이 없다(테스트는 키트 함수만 확인).
  - 소환·스킬 시전이 기본 전략 패스를 타서, 스킬 직전에 한 공격이 먼저 나올 수 있다 — upstream 테스트 중 「시전과 같은 틱의 공격」을 세던 두 곳
    (凯尔希·思衡托 S3 2인 치료, 予愿安洁莉娜 S3 탄약 수)을 시전 뒤부터 세게 고쳤다.
- [추정] 각 키트 머리 주석의 `[ASSUMED]`(upstream 것 그대로): 凯尔希·思衡托 5(S1 오라 전장 전체, S2 의료 유닛 속도·적 사망 시 소멸, S3 待投放 자동
  재배치 등), 克莱门莎 5(S2 放逐 조합·운반 여유 0.4·틱마다 갱신·소용돌이 스킬과 함께 끝, S3 첫 포격 0.5 s 뒤 1 s 간격 2회, 확산 대상 동률 순서),
  予愿安洁莉娜 4(S3 비행 이동 속도·0.1 s 재선택 등). 克莱门莎 S3 포격 화면은 upstream 공용 폭발 자리표시 `blast`(`public/js/render/fx/kinds.js`) [추정].
- 공식 이펙트·소리·공격 타이밍·소환물 모델: EN 클라이언트에 없어 CN 클라이언트에서 뽑았다(2026-10-11, `fx.md` 「선발 추가 3명 — CN 클라이언트」).
  공격 타이밍(`tools/assets/local-attack-timing.json`)이 들어가며 세 명의 타격 시점이 공식대로 바뀌었다(golden `diy-009`…`diy-011`만 움직임).
  클레멘티아 일본어 음성: 우리 음성 색인(`charword_table`, 10-06)이 그녀보다 오래돼 계획에 없었다 → `fetch-assets --refresh-index`로 12칸 모두 들어옴
  (한국어 음성은 셋 다 없음 — 한국 서버 출시 전).
- 키트 사건 이펙트는 2026-10-11 연결(`fx.md` 「선발 추가 3명 — CN 클라이언트」). 그때 CN 추출기 버그(이펙트 컴포넌트 구조 차이)를 고쳐 클레멘티아 S3 범위가
  제자리에 놓였다. 안젤리나 더 멜로우 위시 S3 원(`aglna2_skill_03_range_01`)이 한 칸 아래에 보이던 것은 이륙(起飞) 오퍼레이터를 공중 높이로 그리지 않아서였다
  → 이륙한 오퍼레이터를 비행 높이로 그린다(관리자 결정 2026-10-11, `render.md` 「이륙 높이」). 결과 화면 이름(upstream #469 — 클라이언트 전투 결과에서 선발이 「甄选干员」으로 나옴, `server/match/fields.js`)은 기존 선발에도 있는 별개 버그라 따로 — 2026-10-11 upstream 0.2.4 이식에서 고침(`sim.md` 「upstream 0.2.4 이식」).
- 테스트: `test/content/op_{kalts2,clemnt,aglna2}.test.js`(체크리스트의 은신 적 범위 피해 3개 포함), `test/content/heal-triggers-023.test.js`(S2 발동),
  `test/match/feedback5-we2-placement.test.js`(#26 战术锚点), `test/content/feedback5-we2-summon-hand.test.js`(#24 표식), golden `diy-009`…`diy-011`(새 시나리오, 다른 가족 변화 없음).

## 안젤리나 더 멜로우 위시 S3 이동 · 「이따 봐!」 표식 (2026-10-11, 관리자 제보)
- 제보 2건: ① S3로 공중 적에게 갈 때 처음 칸에 남는 「이따 봐!」(“一会儿见！”)가 대체 마름모로 보임, ② 공식은 공중 적에게 **직접 날아가는데** 우리는 그 칸에
  **배치**(낙하)됨.
- 근거(CN 클라 데이터, 2026-10-11 설치본 — 이 클래스들은 EN 디컴파일에 없어 데이터 필드만 읽음):
  - 표식 프리팹(`pkgrps/btl_pfb_tokens_5.ab` `token_10071_aglna2_agairp`): 그림이 `EmptyAnimator`(Spine 없음), 그림자 없음, `_alwaysHideHp`·`_alwaysHideSp` 1.
    보이는 것은 이펙트 `token_aglna2_agairp_01`(오렌지 스프라이트 + 바닥 메시, 이미 추출·연결됨)뿐 → **뽑을 모델이 없다**. 대신 마름모·그림자·HP 바·방향 표시를
    그리지 않는다(`shared/trap-tokens.js BODYLESS_TOKENS`, `render/units.js`).
  - 이동(`[uc]skills.ab skchr_aglna2_3`의 재생성 컴포넌트 `_projectileKey projectile_chr_aglna2_s3_fly`, `_tileSelectorAbilityName TileSelectAbility`,
    `_placeholderTokenKey`, `_respawnTargetRow/ColBBKey`): 그녀가 투사체에 실려 날아가고(투사체의 follower 컴포넌트 `_faceToMoveDirection` 1), 도착한 칸에서
    재생성된다. 투사체 컨트롤러가 `_selectorRefreshInterval` 0.1초마다 목표 칸을 다시 고른다(움직이는 공중 적을 따라감). 이동 3종: StrightForward·TurnTarget
    `_speed` 2.4, Comback(복귀) 2.0(`_useDynamicSpeed` 0), 각자 속도 곡선(≈0.8–1.06)과 옆·높이 호(최대 ≈0.3·0.14칸). 비행 중
    `aglna2_s_3[move_mode]`(FORCE_DISARMED, 0.1초 트리거) → 모드 S3Move(`Skill_3_Move` 클립, `aglna2_s_3[fly_passive]` 꼬리 `aglna2_skill_03_fly_trail_01`)
    + 좌우 `aglna2_skill_03_buff_right_01`/`_left_01`(CheckFaceLOrR). 재생성 뒤 `[mode]`는 `aglna2_respawn` > 0이면 이륙 클립 없이 S3 모드로 바로 감.
- 고친 것(`kits/ops/op-aglna2.js`): 비행 중 몸이 매 틱 목표 칸으로 움직이고(2.4칸/초) 0.1초마다 목표 칸을 다시 고른다. 도착하면 【移动】
  (`Battle.moveRedeploy` 새 옵션 `inPlace`: 'deploy' 이벤트에 1, 스냅샷 배치 클립 없음 → 낙하·배치 링·배치음 없음). 스킬이 끝나면 날아서 돌아온다(2.0칸/초,
  그동안 이륙·무적·무장해제, 표식은 착지 때 사라짐). 비행 중 스냅샷 anim = MOVE(플래그 `kitMove`) → 렌더가 `Skill_3_Move`를 틀고 이동 방향을 본다.
  비행 중 0.1초 재선택에서 조건 맞는 칸이 없으면 지금 서 있는 칸으로 되돌아간다(备注 「若已不存在满足条件的目标格，会转而选择当前实际所在位置为目标」).
  착지하면 배치 방향이 마지막 이동 방향에 가까운 쪽(상하좌우)으로 바뀌고(备注 「改变部署方向为与最近一次移动方向接近一致，不影响攻击范围」 — 원래 3-9는
  처음 방향 그대로), 처음 칸으로 돌아오면 처음 방향(`aglna2_located_dir`). 렌더는 fx `aglnaFlight` 끄기의 `dir`로 방향을 맞춘다.
- 실기 제보(2026-10-11, 관리자 「공중 적이 많으면 계속 이동하느라 공격을 안 할 때가 있다 — 공식 의도인지, 이동에 쿨타임은 없는지」): 공식 이동 조건은
  「원래 스킬 범위에 저지되지 않은 저지 가능한 공중 적 + 자신이 아무것도 저지하지 않음」뿐이고(PRTS 备注, `TileSelectAbility` `_cooldown` 0, `_checkOwnerCanBlockEnemy`·
  `_excludeInCombat`), 이동 쿨타임은 없다. 비행 중에는 공식도 무장해제(`[move_mode]` FORCE_DISARMED)라 그동안 공격이 없는 것은 의도. 다만 이동 스킬
  컴포넌트(그녀만 가진 CN 전용 클래스)의 `_availableValidator` 바로 뒤에 `_attackCooldownProgress` 0.85가 있다 → 「공격 쿨다운이 85% 이상 찼을 때만
  이동 시작」으로 읽고 넣었다(`MOVE_ATTACK_PROGRESS`; 그 전엔 0.1초마다 바로 떠서 시작된 공격 동작을 끊고 쿨다운도 처음부터 다시 기다렸다).
  [추정] 이 필드의 뜻(CN `GameAssembly.dll`은 보호돼 Il2CppDumper가 메타데이터 등록부를 못 찾음 — 디컴파일 못 함; 「착지 뒤 공격 쿨다운을 85%로 둠」일
  가능성도 있음).
  렌더 fx `aglnaFlight`(켜기/끄기)가 공식 꼬리·좌우 이펙트를 붙이고, `KIT_OWNED`에 S3 세 이펙트를 넣어 `_buff_` 이름 규칙이 좌우 이펙트를 스킬 내내 틀던 것을 막음.
- [추정] 속도 곡선·옆/높이 호 미구현(직선·일정 속도), 착지 직전에 그 칸이 막히면 다음 공중 적 칸, 없으면 제자리로 되돌아감, 좌우 이펙트는 이륙 때 방향 한 번,
  `_attackCooldownProgress`의 뜻(위),
  복귀 비행 중 새 S3 시전이면 그 자리에서 바로 착지.
- 테스트: `test/content/op_aglna2.test.js`(공격 쿨다운 85% 뒤 이륙·비행 중간 위치·2.4/2.0칸/초·'deploy' 1·움직이는 적 추적·착지 방향·목표 소실 시 복귀·
  비행 중 퇴각·표식 'summon' fx). golden 변화 없음(S3 이동 시나리오 없음).
- 실기 제보(2026-10-11 「S3 범위가 3×3으로 줄어 보임」): 공격 판정은 그대로(원래 3-9 + 주변 8칸)였고 상세 카드 범위 표시만 3×3이었다 — 처음 칸을 떠나면
  원래 3-9가 `setExtraRange`의 절대 칸으로 붙는데 카드(`liveRangeGrid`)는 상대 격자만 그렸다(이번 비행 수정 전부터). `setExtraRange(…, { show: true })`면 그 칸을
  지금 칸·방향 기준 오프셋으로 카드 격자에 더한다(`battle/queries.js`; 다른 키트의 추가 칸 — 레뮤엔 표적 등 — 은 그대로 표시 안 함).
- 표식 이펙트가 그동안 한 번도 안 나왔던 이유: 렌더 연결(`fxgame.js` 'summon' + `token`)은 있었지만 표식은 `spawnToken`으로 나오고 이 경로는 'summon' fx를
  내지 않는다 → 키트가 표식을 둘 때 직접 낸다.

## 안젤리나 더 멜로우 위시 S2 활공 모션 (2026-10-12, 관리자 제보)
- 제보: 우리는 S2를 쓰면 제자리에서 이륙한 뒤 공격한다. 공식은 스킬 범위만큼 앞으로 지팡이를 타고 날아가고, 범위 끝에서 위로 이륙한 뒤 원래 자리로 돌아와 공격을 시작한다.
- 근거(CN 클라 데이터, `[uc]skills.ab skchr_aglna2_2`·`[uc]projectiles.ab projectile_chr_aglna2_s2_fly`·CN 버프 템플릿 — 스킬 클래스는 CN 전용이라 필드만 읽음):
  - 스킬의 吟唱 컴포넌트(EN의 `ChantBeforeSkill`을 이은 CN 클래스): `_animation` = `Skill_2_Takeoff_Begin`(0.333초)·`_Loop`(0.5초)·`_End`(1초),
    `_projectileKey projectile_chr_aglna2_s2_fly`, `_finishWhenProjectileInvalid` 1, `_afterEndAnim Skill_2_Begin`, `_interruptProjectileOnEndAnim` 1,
    `_buffOnAfterEndAnim` = `aglna2_s_2[chant_end]`(`height_duration` 1).
  - 투사체: follower 컴포넌트 `_follower` 0·`_policy` 2·**`_restoreOnEnd` 1**·`_faceToMoveDirection` 0 — S3 비행 투사체와 같은 컴포넌트(그쪽은
    `_restoreOnEnd` 0)로 몸을 싣고 가서, 끝나면 **원래 자리로 되돌린다**. 수명 INFINITY(`_lifeTimeType` 2), 속도 6, 도달 거리 4(`_distanceMax` Q32 4.0,
    `_ignoreInitialTile`), 꼬리 `[flying]`은 출발 때 만들고 도착 때 끝냄.
  - `[chant_end]`: 그녀의 그림 높이를 `height_offset`(이륙 높이)까지 `height_duration` 1초에 올리고 `fly_end_01–03`. 즉 활공 동안은 낮게, 돌아와서 1초에 걸쳐 뜬다.
  - PRTS 备注: 「触发技能后进入持续2.5s的吟唱（滑翔）：期间模型向前方移动（**不改变所在地块及中心坐标**）」, 숨은 주석 「该弹道会沿对于飞行单位可通行的地块至多向前飞行4格
    （不包括本格），弹道终点位于最后可通过的地块的中心」.
- 고친 것: 시뮬은 그녀의 칸·좌표를 그대로 둔다(공식과 같음). `op-aglna2.js glide`가 끝점을 비행 통과 가능 칸(`grid.flyPassable`)을 따라 최대 4칸으로
  계산해 쓸기 길이와 fx `dash`(`tx`/`ty`/`t`)에 같이 쓴다(전에는 맵 끝이어도 4칸). 렌더: `app.js`가 `dash`(`chant` > 0)에서 `UnitView.glide`를 부르고,
  뷰가 모델을 6칸/초로 끝점까지 보내고, 닿자마자 Takeoff_End(1초, 위로 이륙)를 그 자리에서 튼 뒤 그 클립이 끝나면 원래 칸으로 되돌린다
  (`fx/kinds.js aglGlideBack` = 도착 + 1초, 吟唱 2.5초를 넘지 않음; 뷰 위치를 바꾸므로 HP 바·그림자·붙은 이펙트도 따라감). 그동안 높이 0, 돌아온 뒤 그녀의
  이륙 높이(아래)까지 1초에 걸쳐 일정하게 오른다. 클립은 `SpineActor.chant`: Takeoff_Begin → Takeoff_Loop → 도착 때 Takeoff_End → 돌아와서 `Skill_2_Begin`
  → 스킬 Idle/Loop. 吟唱 동안 공격 클립은 기다린다(시뮬도 무장해제). 활공 꼬리·`fly_range_01`은 도착까지만, `fly_end_01–03`은 돌아올 때(`fx.md`).
- 실기 후속(2026-10-12 관리자: 「끝점에 닿자마자 이륙」, 「제자리에 돌아왔을 때 이륙 고도가 지금보다 낮다」): 처음 판(`777f8df6`)은 Takeoff_End가 2.5초의 마지막
  1초였고(끝점에서 약 0.8초 머묾) 복귀도 2.5초였다 → 위처럼 도착 즉시·도착 + 1초로. 높이: 그녀의 특성 블랙보드 `height_offset` 0.8(character_table, `[chant_end]`가
  `aglna2_tr`에서 가져와 그 높이로 올림; S3 `[mode]`는 고지대 칸이면 0.4)을 칸 단위로 써서, 비행 적 높이 `FLY_HOVER` 1.3 대신 0.8(S3 고지대 0.4)로 그린다 —
  `render/units.js LIFTOFF_HEIGHT`, S1·S3 이륙에도 적용(`render.md` 「이륙 높이」). 아레나에서 S3 범위 원이 여전히 그녀 칸에 있음을 확인.
- [추정] 복귀 = 끝 클립이 끝날 때(`_interruptProjectileOnEndAnim` + `_afterEndAnim`; CN 클래스 디컴파일 불가 — 도착 0.67 + 1 + `Skill_2_Begin` 1 ≈ 吟唱 2.5초와 맞음),
  `height_offset`이 칸(월드) 단위(비행 적의 0.35는 0.27 캐릭터 공간), 속도 일정(이동 컴포넌트의 속도 곡선 ≈0.95–1.13·`_speed` 4.8은 안 씀, PRTS 6.0), 복귀는 순간 이동(`_restoreOnEnd`), 활공 중 바닥 높이는 그녀 칸 기준,
  `Skill_2_Begin`(1초) 동안 시뮬은 이미 공격할 수 있음(첫 공격이 그 클립을 끊을 수 있음).
- 테스트: `test/content/op_aglna2.test.js`(맵 끝에서 2칸·열린 곳 4칸, 위치 불변), `test/render/aglna2-s2-glide.test.js`(클립 순서·공격 대기·스킬 끝 처리,
  뷰 이동·도착 즉시 끝 클립·도착 + 1초 복귀·0.8까지 1초 상승).

## 진영별 선발 프리셋 (2026-10-09, 관리자 결정)
- 공식에 없는 기능(`feat`). 채팅 진영(`shared/local.js CHAT_FACTIONS`, 8개 국가 맹약)마다 브라우저에 자선 편성 프리셋을 하나씩 둔다(`public/js/ui/diyPresets.js`).
  저장 `localStorage sp.pref.diyPresets = { v: 3, presets: { [진영]: picks }, base, active, links }`(각 편성은 선발 편성과 같은 `cleanPicks`, 빈 진영 편성은 저장하지 않음;
  `base` 없는 v1은 「프리셋 없음」이 보이던 경우 지금 편성을 `base`로 읽음; `links`는 아래 「전략별 선발 프리셋」, v2에는 없음).
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
- 전략 선택 화면 선택 순서 아래 「진영 선택」 줄(`DraftFactionPicker`)은 2026-10-13에 뺐다(관리자 요청: 전략별 선발 프리셋 줄이 대신한다, 아래 절).
  그때까지는 협동이면 채팅 진영과 같은 선택, 싱글은 프리셋만 적용했다.
- 경기 중 진영 선택기: 이번 판에 꺼진 맹약(`m.public.disabledBonds`)의 진영은 흐리게 하고 「결석」 표시. 고를 수는 있다.
- 데이터 사정: 선발 5명 중 국가 맹약이 있는 것은 염국(왕·첸 더 던스트릭)뿐이고 위셔델·토가와 사키코·아스카론은 `emptyShip`이라, 「추천 프리셋」을 데이터로 만들 수 없었다(기본 프리셋이 없는 이유).
- 확인: `test/ui/diy-presets.test.js`(저장 형식, 막대로 만들기·적용·연결·삭제, 연결된 편성 따라가기, 채팅 적용·되돌리기·프리셋 없는 진영, 막대 그리기, 적용 단계,
  「switching never copies them」), `test/match/diy-midmatch.test.js`(브리핑·전략 선택에서 setDiy → 선발·재고·m.private, 정비 단계·재고 나감 → 거부),
  `test/lobby-info-reroll.test.js`(실제 서버로 room.diy). Chrome: 탭 막대의 진영 전환(편성이 서로 섞이지 않음), 협동 전략 선택 줄에서 진영 선택 →
  그 판 선발·채팅 태그·채팅 선택기가 함께 바뀜, 정비 단계 진영 선택 → 태그만, 싱글 전략 선택 줄 → 그 판 적용, 대기실 진영 선택 → 편성 적용·알림,
  꺼진 맹약 진영 흐림 + 결석, 휴대폰 가로(844×390). 결석 카드 깨짐(관리자 제보 2026-10-09)은 선택기 칸 `minmax(0, 1fr)`·글자 줄임으로 고침.

## 전략별 선발 프리셋·편성 확인 (2026-10-12, 관리자 결정; 편성 확인은 2026-10-13에 끔)
- 공식에 없는 기능(`feat`). 관리자 제보: 전략 선택에서 마지막 사람이 고르면 바로 다음 단계라 선발 프리셋을 고를 시간이 없다. 관리자 결정(2026-10-12):
  전략과 진영 프리셋을 묶고, 마지막 선택 뒤에 편성 확인 10초를 둔다. 시안을 보고 정함(2026-10-12).
- 연결: `diyPresets.js links = { [bandId]: 진영 | 'base' }`(브라우저별, 프리셋과 같은 저장). 전략 하나는 프리셋 하나에만 연결된다. 진영 프리셋은 그대로 진영별로 하나.
- 전략이 고를 편성(`bandPresetChoice`): 이번 판에 고른 값 → 저장된 연결 → **추천**(전략 중심 국가 맹약: `bands.json bondIds` ∩ 채팅 진영, 40개 중 9개 — 파가니니 → 라테라노 등,
  `bandRecommendation`) → 「지금 편성 유지」(`keep`, 아무것도 안 바꿈).
- 전략 선택 화면 상세 창 「선발 프리셋」 줄(`screens/bandDraft.js DraftPresetRow`): 선택 상자(`PresetPicker` — 진영마다 앞에 아이콘을 넣으려고 직접 만든 드롭다운, 관리자 요청 2026-10-13; 목록은 상세 창 위에 떠서 열림 — 버튼 아래, 아래 자리가 없으면 위. 창이 커지지 않게, 관리자 요청 2026-10-13. 스크롤·창 크기 변경이면 닫힘. 지금 편성 유지(✓) · 프리셋 없음(−) · 8진영.
  글자 대신 아이콘 상태로(관리자 결정 2026-10-13): 빈 진영은 아이콘에 진영 색을 칠하지 않음(회색, 관리자 요청 2026-10-13 — 처음엔 흐림 + 점선 테두리), 결석 맹약의 진영은 브리핑과 같은 공식 `img_bond_banned`를
  아이콘 오른쪽 위에(공식 배치, 로컬 소재가 없으면 이름만 흐림). 뜻은 툴팁), 태그(연결됨 · 추천 · 결석), 그 편성의 4칸 미리보기(칸마다 오퍼레이터 아이콘을 공식 정보 화면처럼, 칸 상자 대신 공식 흰 카드 `img_chess_bkg` 위에, 이름은 툴팁 — 관리자 요청 2026-10-13; 단계 그림은 아래 티어 묶음에 한 번. 그 오퍼레이터의 맹약이 이번 판에 전부 꺼져 있으면 서버 `initDiyStock`과 같은 판정(`diyPickOff`)으로 결석 표시: 오른쪽 위 빨간 `img_chess_banned`, 툴팁 「이번 판 결석」, 관리자 요청 2026-10-13), 「이 전략에 기억」
  (기본 켬: 적용할 때 그 값이 연결로 저장, 「지금 편성 유지」는 저장 안 함). 연결된 전략 카드 오른쪽 아래에 진영 배지.
  이 줄이 있어도 상세 창은 스크롤되지 않는다(관리자 요청 2026-10-13): 효과 글 상자가 남는 높이를 받아 제 안에서 스크롤하고, 휴대폰처럼 낮은 화면(높이 500 이하)은
  「초기 HP」 줄을 빼고(격자 카드에 있음) 큰 아이콘을 더 줄인다. 창 자체의 스크롤은 그래도 모자랄 때만.
  내 선택이 확정된 뒤에는 그 전략의 줄에서 값을 바꾸면 **바로 적용**(편성 확인 중 덮어쓰기도 이것으로). 다른 전략의 줄은 잠긴다. 전략 선택 화면에는 「…프리셋을 적용했습니다 · 되돌리기」 알림을 두지 않는다
  (관리자 요청 2026-10-13: 필요 없음 — 채팅의 진영 선택 알림은 그대로).
  4칸은 티어별 두 묶음 `[V ▢ ▢] [VI ▢ ▢]`(관리자 결정 2026-10-13, 시안 넷 중 고름 — 아이콘마다 같은 배지가 되풀이되고 빈 칸만 모양이 달라 어색했음): 묶음마다 판 하나 —
  공식 정보 화면의 묶음 띠(`prefab_auto_chess_stage_info_chess_banned_group`의 `img_content_bkg` = rgb(31, 31, 31) 40 %)를 클라에서 그 띠가 깔리는 어두운 목록 판(브리핑
  `.brief-banned`과 같은 색) 위에 깔아 상세 창 위에서 상자로 보이게 함(공식에 칸마다 상자를 그리는 스프라이트는 없음) — 과 그 아래 티어 색 줄. 티어 배지는 묶음 앞에 한 번,
  아이콘 아래 끝에 맞춤(다른 화면에서 아이콘마다 배지가 붙는 왼쪽 아래 자리), 툴팁은 「N티어 선발 · 보급센터 레벨 N부터 상점에 등장」. 아이콘 자체에는 배지를 안 붙인다.
  빈 칸은 흐린 카드에 「+」 — 누르면 선발 편성 탭이 열리며 그 칸의 오퍼레이터 선택 창(그 티어 목록)이 바로 뜬다. 편성된 칸은 마우스를 올리면 바꾸기 아이콘이 뜨고, 누르면
  그 칸의 「바꾸기」와 같은 선택 창(지금 오퍼레이터가 골라진 채)이 뜬다(둘 다 「선발 편성 수정」처럼 선택 상자의 편성으로 탭을 엶, 잠긴 줄에서는 안 됨; `openLoadout`의
  `diySlot` → 스토어 `diyPick`을 `DiyPanel`이 한 번 받음. 관리자 요청 2026-10-13). 이렇게 연 선택 창은 「확인」이든 「취소」(×)든 닫으면 오퍼레이터 구성 화면도 닫고
  전략 선택으로 바로 돌아온다(관리자 요청 2026-10-13, 처음엔 확인만; 탭 안에서 직접 연 칸은 그대로 탭에 남음). 프리셋이 없는 진영은 글자 대신 빈 칸 넷(「…선발 편성은 그대로」는 툴팁, 관리자 요청 2026-10-13). 좁은 창(폭 1000 이하 30 px, 900 이하 26 px — 휴대폰 가로 상세 창은 약 200 px)에서는 아이콘·간격을 줄여 네 칸이 판 안에 들어간다.
  아래 줄 오른쪽 「선발 편성 수정」은 오퍼레이터 구성 화면의 선발 편성 탭을 선택 상자의 편성으로 연다(진영·프리셋 없음이면 `selectPreset` — 그 탭의 진영 줄을 누른 것과 같아서
  지금 편성도 그 편성으로 바뀌고 판에 바로 들어감, 지금 편성 유지면 지금 편성; 다른 전략 줄처럼 잠긴 줄에서는 꺼짐. 관리자 요청 2026-10-13).
  선택 순서 목록 아래에는 브리핑처럼 「오퍼레이터 구성」 입구(`LoadoutButton`, `from: 'draft'`)가 있다 — 전략 선택이 끝나면 닫힌다(`shouldAutoClose`). 이때 선발 편성 탭의
  안내는 「전략 선택이 끝나기 전까지는 수정하면 이번 판에 바로 적용」(서버 `match.setDiy`가 브리핑·전략 선택 동안 받음), 스킬·모듈 탭은 브리핑 뒤라 잠김(다음 판부터) 그대로.
- 적용 시점: **내 선택이 확정될 때**. 「선택 확인」은 적용 → `room.diy` 즉시 전송(`loadoutSync.js flushDiySync`, 싱글은 이 선택으로 전략 선택이 끝나므로) → `g.band` 순서.
  시간 초과·AI 대행으로 정해진 선택도 확정되는 순간 적용(판마다 한 번, `presetAppliedFor`). 강조만 해서는 적용하지 않는다(미리보기만).
- 진영을 적용하면 **채팅 진영도 같이 바뀐다**(관리자 결정 2026-10-12, 채팅의 진영 선택과 같은 `chooseFaction`). 「프리셋 없음」 연결은 `applyBasePreset`(알림 「선발 편성을 「프리셋 없음」으로
  바꿨습니다」, 채팅 진영은 그대로). 이번 판 결석 맹약의 진영도 **그대로 적용**하고 알림에 「결석」(관리자 결정 2026-10-12). 프리셋이 빈 진영은 편성은 그대로, 채팅 진영만 바뀐다.
- **꺼짐(관리자 결정 2026-10-13)**: 협동에서 전략 선택이 끝난 뒤의 편성 확인 10초를 뺐다. 지우지 않고 `phases.js startDraftTurn`의 호출만 주석 처리 —
  마지막 선택이 끝나면 바로 다음 단계. 함수·`g.draftReady`·화면 코드(`m.public.draft.confirm`이 없으면 아무것도 안 그림)·테스트(`test.skip`)는 그대로 두어 되살릴 수 있다.
  아래는 켜져 있던 때의 동작.
- 편성 확인(`server/match/match/phases.js enterDraftConfirm`, `common.js DRAFT_CONFIRM_SECONDS` 10): 시간 제한 있는 전략 선택(사람 2명 이상)에서 모두가 고른 뒤
  BAND_DRAFT를 10초 더 유지한다 — `match.setDiy`가 그대로 받으므로 선발 프리셋 줄로 편성을 덮어쓸 수 있다. 연결된 사람 중 AI 대행이 아닌 사람이 모두 「준비 완료」(`g.draftReady`)
  하면 바로 끝. 나가기·연결 끊김·AI 대행 전환도 다시 확인. `m.public.draft.confirm { deadline, seconds }`, `players[].confirmReady`, 헤더 카운트다운 = 이 창.
  싱글·사람 혼자인 판은 시간 제한이 없어 이 창도 없다(자기 차례에 시간 제한 없이 고르고, 확인 순간 적용되므로).
- 판 밖 선발 편성 탭(`screens/diy.js PresetBandLinks`): 진영 프리셋 줄 아래 「연결된 전략」 — 보이는 편성(진영·프리셋 없음)에 연결된 전략 칩(× 해제), 그 진영 중심 전략은
  연결이 없을 때 점선 「추천」 칩, 「+ 전략 연결」 선택 상자(다른 편성에 연결된 전략을 고르면 이쪽으로 옮김).
- 확인: `test/ui/diy-presets.test.js`(연결 저장·v2 호환·해제·추천 9개·선택 순서·프리셋 없음 적용·되돌리기·탭 칩), `test/ui/bandDraft.test.js`(미리보기·태그·편성 확인 헤더),
  `test/match/draft.test.js`(편성 확인: 10초·준비 완료·AI 대행·끊김·혼자면 없음·`setDiy` 허용). 화면: 로컬 Windows Chrome(2026-10-13) — 협동 2인에서
  추천 적용(그 판 선발·채팅 진영·결석 알림)·카드 배지·편성 확인 중 진영 덮어쓰기·준비 완료 → 협의 시작, 솔로 연결 적용(선택 즉시 그 판 선발), 휴대폰 가로(상세 창 스크롤,
  처음엔 효과 문구가 사라져 `57a46f47`로 고침), 선발 편성 탭 연결 칩.

## 선발 기본 스킬 (2026-10-11, 관리자 결정)
- 자선 편성 칸에서 오퍼레이터를 새로 고르면 시작 스킬은 마지막 스킬(S3)이다(`public/js/ui/diyModel.js defaultPick`). 관리자 결정(2026-10-11): 위셔델(维什戴尔)·
  아스카론(阿斯卡纶)·켈시 에스페란타(凯尔希·思衡托)는 **S2**에서 시작한다(`shared/local-diy.js LOCAL_DIY_DEFAULT_SKILL`). 시작 선택만 바뀌고 다른 스킬은 그대로 고를 수 있다.
  이미 저장된 편성(`sp.pref.diy`·프리셋)의 스킬은 바꾸지 않는다. 테스트 `test/ui/diy-ui.test.js` 「defaultPick」.

## upstream 0.2.4 이식 — 선발 선택 창 상세 (2026-10-11, 관리자 결정 W3)
- 선발 칸 선택 창의 오른쪽 상세를 upstream `6bfc0827`(0.2.4-dev §29.6)처럼 바꿨다: 고른 오퍼레이터 아래에 「잠재와 육성도」 선택(`screens/cultivation.js
  CultivationSelects`, 슬롯 카드와 같은 설정), 오퍼레이터 구성 화면과 같은 「인게임 능력치」(`public/js/ui/loadoutStats.js LoadoutStats` — 구성 화면에서
  이 파일로 옮김: 능력치 표·공격 범위·특성·재능, 일반/정예화 전환, 정예화가 기본), 스킬 줄마다 SP 줄(회복 방식·초기·소모·지속). 선발 기록은
  `ui/diyModel.js slotRecord(…, { potential })`(그 오퍼레이터의 잠재)로 만들고, 육성도 배수는 `chessLoadout`이 붙인다 — 경기 상세 카드와 같은 길.
- **스킬 수치 = 그 말이 실제로 싸우는 스킬 레벨**: 이전 상세는 스킬 설명을 늘 일반 기록(`s.normal`)으로 보여 줘서 첸 더 던스트릭 S1이 공격력 +65%로만
  나왔다(upstream 0.2.4 화면은 +80%). 둘 다 맞는 값이고 말에 따라 다르다 — 칸의 `_a`(일반) 말은 `status` `2/1/4/0`(스킬 4), `_b`(정예) 말은
  `2/60/7/1`(V단계)·`2/60/7/3`(VI단계)(스킬 7)이고(`data/chess.json` `chess_char_{5,6}_diy{1,2}_{a,b}.status`, `activity_table` diyChessDict),
  sim은 `simdata.getDiy` → `shared/diy.js diyRecordOf` → `unitForm(backups, charId, slot.status)`로 그 칸 형태의 스킬을 쓴다. 赤霄·奔夜:
  `_a` atk 0.65·SP 6/27, `_b` atk 0.8·SP 7/24. 잠재(`atPotential`: 비용·공격력·재배치·재능)와 육성도(`char_attribute_mul`: ATK/DEF/HP 배수)는
  스킬 레벨을 바꾸지 않는다(`shared/potential.js`). 그래서 스킬 줄은 「인게임 능력치」 전환을 따른다 — 일반 = 스킬 4, 정예화 = 스킬 7 — 그리고
  「스킬」 제목 옆에 그 레벨(「정예화 Lv.7」)을 적는다(우리 추가, upstream엔 없음; 구성 화면 스킬 전환의 「일반 Lv.4 / 정예화 Lv.7」과 같은 표기).
- 우리 것 유지: 진영 프리셋 줄, 선발 드래그 카드, 슬롯 카드의 잠재·육성도 선택, 필터 칩 없음(원형 없음, 관리자 결정 2026-10-07), 목록은 카드 격자
  그대로(upstream은 같은 커밋에서 목록을 구성 화면처럼 한 줄씩 늘어놓는 표로 바꿨다 — 우리 선발은 8명이라 받지 않음), 글자 크기 변수(`--t`)는
  우리 CSS에 없어 그 hunk는 받지 않음.
- 테스트: `test/ui/diy-ui.test.js` 「the picker detail (upstream 0.2.4)」(일반/정예화 전환마다 S1 수치·SP가 sim def와 같음, Lv 표기, 잠재·육성도 줄),
  `test/ui/loadout-stats.test.js`(upstream: `LoadoutStats`가 `ui/loadoutStats.js`에서 옴). 화면 확인은 메인 세션.

## 아스카론 死亡拘审 틱 간격 (2026-10-11 확인)
- 키트 `op-ascln.js`의 `interval: 1`(1초마다)은 공식과 같다. 클라 버프 템플릿 `ascln_t_1[debuff]`의 `triggerInterval` 2.0은 기본값일 뿐이다:
  클라 코드 `Buff.Reset`이 틱 타이머 주기를 버프 블랙보드의 `interval`로 읽고(없을 때만 템플릿 값), 재능 블랙보드에 `interval` 1.0이 있다
  (설명 「每秒受到…」과 같음). 이 메서드는 en_US·zh_CN Lua 핫픽스 목록 밖. 다른 키트에서 템플릿 `triggerInterval`을 볼 때도 블랙보드 `interval`을 먼저 확인할 것.
