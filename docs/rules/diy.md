# 선발 오퍼레이터

옛 `docs/LOCAL-PATCH.md`에서 2026-10-09에 나눈 파일이다. 옛 절 이름은 `docs/LOCAL-PATCH.md` 색인에서 찾는다.

## 선발 오퍼레이터 (2026-10-05, 0.2.0부터 upstream 自选 틀)
- 원본 甄选 규칙(공식 데이터 + bilibili wiki 盟约): V·VI단계 2칸씩, 경기 전 오퍼레이터 구성 화면에서 고른다. 고른 오퍼레이터는 그
  플레이어 상점에만 나오고(공식 문구 「只出现在自己的商店里」), 일반 E2 Lv1·스킬 4 / 정예 E2 Lv60·스킬 7·모듈 1(V) 또는 3(VI), 가격 4·판매 1·3장 합성. 특질 없음.
  맹약은 진영으로(위키 규칙), 없으면 협방(emptyShip, `constData.fallbackBondId`): 왕·첸 → 염, 나머지 → 협방. 叙拉古·卡西米尔도 공식 표의
  정규 맹약이다 — `activity_table` `autoChessData.bondInfoDict`의 `isPower` 맹약 8개의 `powerIdList`에 叙拉古 [siracusa, chiave]·卡西米尔
  [kazimierz, pinus]가 있다(2026-10-10 대조, 그 전엔 「확장은 [추정]」; `tools/build-data.mjs buildBackups`가 이 표로 정함).
- 지금 구현(0.2.0부터): upstream 「自选」 틀이 선발 칸·재고·상점·보상·밴을 맡는다(`server/match/player/diy.js initDiyStock`, `shared/diy.js`, 데이터
  `data/backups.json` `diy`). 맹약이 전부 꺼진 픽은 그 판 재고가 없다(`m.private.diyBanned`). 이 포크는 후보를 구현·대조한 24명으로 줄인다:
  `shared/local-diy.js LOCAL_DIY_PICKS`(왕·첸 더 던스트릭·위셔델·토가와 사키코·아스카론, 2026-10-11부터 켈시 에스페란타·클레멘티아·안젤리나 더 멜로우 위시 — 아래
  「선발 추가 3명 (2026-10-11)」, 2026-10-26부터 트라고디아 — 아래 「선발 추가 酒神 (2026-10-26)」, 2026-11-01부터 토스카·탈룰라 — 아래 「선발 추가 토스카
  (2026-11-01)」·「선발 추가 탈룰라 (2026-11-01)」, 2026-11-02부터 팔라스·헬라그, 2026-11-03부터 만트라·스테인리스·하루카·나이팅게일·페넌스·로고스·비비아나·벨로네·비이·지마 더 레이징 타이드·Mon3tr, 2026-11-04부터 슈·리·유넥티스·에벤홀츠·제시카 더 리버레이티드·파죰카·에이야퍄들라·쏜즈·아이린·위디 — 아래 「선발 추가 팔라스 (2026-11-02)」·「선발 추가 헬라그 (2026-11-02)」·「선발 추가 만트라 (2026-11-03)」·「선발 추가 스테인리스·하루카·나이팅게일 (2026-11-03)」·「선발 추가 페넌스·로고스·비비아나 (2026-11-03)」·「선발 추가 벨로네·비이·지마 더 레이징 타이드·Mon3tr (2026-11-03)」·「선발 추가 슈·리·유넥티스·에벤홀츠 (2026-11-04)」·「선발 추가 제시카 더 리버레이티드·파죰카·에이야퍄들라 (2026-11-04)」·「선발 추가 쏜즈·아이린·위디 (2026-11-04)」) — `tools/build-data.mjs`가 이것으로 `diy.ownedPool`을 만들고, `server/lobby.js`가 다른 픽을 거부한다.
  키트는 `server/sim/content/kits/ops/op-{wang,chen3,wisdel,oblvns,ascln,kalts2,clemnt,aglna2,phatm2,tocka,oxi,pallas,helage,mantra,ironmn,haruka,cgbird,judge,logos,vvana,demetr,veen,headb2,monstr,shu,lmlee,zumama,ebnhlz,jesca2,bgsnow,amgoat,thorns,irene,weedy}.js`(등록 `kits/index.js OPERATOR_KIT_FILES`).
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
      _switchToDeadState: false}` — 폭발이 끝나면 돌이 스스로 철수). 철수(손 철수·발동 소모 모두)에 DP 반환은 없다 — 공식 클라
      `Token.get_allowWithdrawGainCost`가 늘 false라 `Character.Withdraw`의 반환 분기를 타지 않는다(돌 프리팹
      `token_10064_wang_stone1`의 `_withdrawCostRecoverRatio` 0.5는 Token이라 쓰이지 않는 값; 2026-10-10 확인). 놓았던 돌은 모드의 재배치와 같은 방식(`Battle.redeploy`, `tokens.js enableRespawn`)으로 돌아온다:
      재배치 시간(E2 2초) 뒤, 자기 칸에, DP(토큰 cost 3, VI 정예는 모듈로 2)만 내고, 그 칸에 적이 없을 때. 망이 필드에 없으면 기다린다
      (구조상 맞음 — 공식 클라 `AutoChessBattleUtil.DestroyEntityToDummy`가 퇴장한 말을 정비 위치의 더미로 남기고,
      `AutoChessBattleTrigger._TryDeployAvailableCharacter`가 0.2초 루프마다 다시 놓아 본다; 호스트 검사 내부는 안 읽음 [추론]).
      **한 번에 하나씩, 0.2초 간격** (2026-10-11): 같은 루프는 한 번 돌 때 하나만 놓고 그 회차를 끝낸다(`AUTO_TRIGGER_INTERVAL` 0.2초) — 그래서
      같은 때 돌아올 돌이 여럿이면 0.2초에 하나씩 차례로 돌아온다(`op-wang.js AUTO_TRIGGER_INTERVAL`, `redeployUsed`가 한 번에 하나). 그 전엔
      0.25초마다 돌아올 수 있는 돌을 한꺼번에 돌려보냈다. [남은 차이: 클라 루프는 그 플레이어의 오퍼레이터 재배치와 같은 루프라 둘이 한 회차를
      나눠 쓰는데, 오퍼레이터 재배치는 엔진 `Battle._checkRedeploys`가 매 틱 따로 한다.] 테스트 `test/local-patch-diy-wang.test.js` 「one per 0.2 s」.
      **돌아올 때 재고 하나를 쓴다**(관리자 결정 2026-11-11 「공식대로」, 2026-11-11 공식 클라에서 확인): 발동으로 철수한 돌의 카드 장수는 돌아오지
      않고(`Deck.RecycleCard` → `Card.OnRecycle`은 재배치 타이머만, `TokenCard.OnRecycle`은 필드 수만 — 「선발 추가 스테인리스·하루카·나이팅게일」
      소환물 복귀 줄), 자동 재배치는 `Card.Draw`(`freely` 거짓, 돌 프리팹은 무한 카드 아님)로 한 장을 쓴다. 재고가 0이면 S1/S2 「立即获得两枚棋子」·S3
      충전까지 기다린다. DP도 그대로 낸다(관리자의 플레이 기억 — DP를 쓰며 다시 놓이는 바둑돌 때문에 다른 오퍼레이터가 퇴각했다 — 과 맞음).
      **전투 시작 재고 = 재능 铸子의 `cnt`**(潜能3 이상 7, 아래 잠재 줄; 보유 상한까지): 망이 설 때마다 공식 `wang_t_1` = `charge_token[refresh]`
      (ON_OWNER_BORN `RechargeToken` `_refreshRemainingCnt` → `TokenCard.Recharge`가 장수를 min(cnt, 보유 상한)으로 덮어씀) — 전투 시작과 망이 쓰러졌다
      다시 설 때 모두. 정비 때 놓은 돌은 재고를 안 쓴다: 전투 시작 배치(`MainGameInBattle._Prebuilt` → `Deck.SpawnCharacterOrToken`)가 `freely` 참이라
      `Card.Draw`가 장수를 줄이지 않는다. 손패는 새 칸에 놓이지 않고(아래 「손패 돌은 새 칸에 놓지 않는다」) 복귀·阻回(손패가 가득 차면 S1/S2 SP
      정지)·S3 충전·S3 종료 조건에 쓰인다. 예전 규칙(2026-10-08 – 2026-11-11, 관리자 결정 2026-10-08): 복귀는 재고를 안 씀(PRTS 卫戍协议/帮助
      「若召唤物在战斗期间退场，将在满足条件后立即原地再部署1个」, 재고 언급 없음), 전투 시작 재고 = 배치 한도 − 정비 때 놓은 수. 그보다 앞(2026-10-07)은
      복귀가 재고를 쓰되 시작 재고가 배치 한도 − 놓은 수라 다 놓으면 S1 전까지 돌이 하나도 돌아오지 않았다.
      배치 한도는 6, 모듈(`uniequip_002_wang`, VI 정예)이면 7
      (토큰 `byModule` stats — 키트가 정규화된 `stats`에서 읽어 늘 6이던 버그를 2026-10-08 `stoneLimits`로 고침; 정비 손패는 이미 7장이었다).
      **2026-10-09 잠재 이식 뒤**: 배치 한도·보유 상한은 플레이어의 潜能을 따른다 — 潜能3 이상(기본 6) 7 / 8, 모듈이면 배치 한도 8(보유 8); 潜能1–2면
      6 / 7, 모듈 7 / 7 (望 潜能3 「第一天赋效果增强」: 棋子 토큰 재능 후보 requiredPotentialRank 2; upstream 806a0477·ec0a2fc6, `stoneLimits`가
      변형을 `atPotential`로 그녀의 潜能에 맞춤). 아래 영상의 VI 정예(모듈) 「돌 7개」는 그 계정의 潜能이 3 미만이라서다 —
      잠재에 따라 돌 수가 달라지는 것이 맞다(관리자 확인 2026-10-09).
      跟子는 소모되면 끝.
      - 이전 규칙(2026-10-07 ~ 2026-10-08, `RETURN_USES_STOCK = true`): 돌아올 때마다 재고 1개를 썼다(관리자가 기억하던 함정술사 규칙).
        정비 때 다 놓으면 재고 0 → S1(21초)까지 아무 돌도 안 돌아오고, S3면 전투 내내 안 돌아왔다 — 2026-10-08 관리자 제보로 되돌림. 그 전(2026-10-06 ~ 2026-10-07)은
        2026-10-08 ~ 2026-11-11과 같은 규칙(복귀가 재고를 안 씀)이었고, 더 전 모델(재배치마다 재고 1개, 재고 7 − 놓은 수)은 2026-10-06 관리자 제보로
        바꿨던 것. 2026-11-11의 공식 규칙은 둘 다 아니다: 복귀는 재고를 쓰지만 시작 재고가 놓은 수와 상관없이 铸子 `cnt`(위).
      - 영상 확인(2026-10-07~08, 공식 플레이 녹화 — 비공개 녹화, OpenCV 템플릿 추적 + 구간 확대; 레벨 6 VI 정예 왕 = 모듈, 배치 한도 7):
        정비 때 돌 7개 — 아래 줄 왼쪽 2·오른쪽 2, 위 줄 3(관리자 확인 2026-10-08; 처음 분석은 위 줄을 놓쳐 5개로 잘못 셌다). 전투 시작
        (7.5–9.0초)에 돌이 약 0.5초 간격으로 하나씩 나타난다. 아래 오른쪽 2개와 위 오른쪽 1개가 9.5–10.1초에 발동·소모된 뒤 그 칸들은 영상 끝
        (29.7초)까지 비어 있고, 아래 왼쪽 2개·위 왼쪽 1개(적이 오지 않는 칸)는 끝까지 남았다(위 가운데는 오퍼레이터에 가려 판단 못 함).
        한도 7을 다 놓아 재고 0 → 「소모된 돌이 돌아오지 않는다」와 맞다(2026-10-07 해석). 2026-10-08 결정 뒤의 해석 [추정]: 빈 칸으로 보인
        것은 돌아온 돌이 x-1 마름모 안의 적에게 곧바로 다시 발동·소모됐기 때문일 수 있고, 아래 DP 감소가 그 복귀 비용과 맞는다 — 영상만으로는 못 가린다.
        [불확실] 10초부터 DP 카운터가 약 1.5초마다 2–3씩 줄어든다(10→11→9, 10→8, 10→7, 8→6, 8→5 …, S3 중 3→0). 바둑돌 DP(3, 모듈 2)와
        비슷하지만 놓인 돌이 화면에 남지 않고(보스 그림에 가려진 칸이면 안 보임), 다른 오퍼레이터의 소비일 수도 있어 판단하지 않았다.
        S3(24.3초~): 보스 쪽에 마름모 테두리(`x-1`)의 초록 폭발이 0.5–1초 간격으로 반복된다. 이 영상은 S3 판이라 S1/S2 보충은 확인할 수 없다.
        2026-11-11 공식 클라 확인(시작 재고 = 铸子 `cnt`, 복귀마다 1장)으로는 돌이 돌아오므로 빈 칸은 2026-10-08 쪽 해석(돌아오자마자 다시 소모)과 맞다.
        실제 경기 경로 테스트: `test/local-patch-diy.test.js` 「seven prep stones … stock 铸子 cnt 7」.
    - 은신(隐匿) 적: 선택할 수 없는 적(隐匿 미노출, untargetable)은 돌을 발동시키지도 않고 폭발에도 맞지 않는다(PRTS 작전 메커니즘
      「AOE的判定是对攻击范围内的每个可以被选中的敌人进行判定」, 엔진의 `Battle.foesInRadius`와 같은 규칙).
    - 정비 단계에 놓은 자리 그대로 전투를 시작한다. **전투 시작 자동 배치에도 돌마다 跟子 1개** (관리자 결정 2026-10-11 「공식대로」): 클라
      전투 자동 배치는 「수동 배치」로 태어난다 — 공식 클라 `AutoChessBattleTrigger._AutoDeploy`가 `deck.SpawnCharacterOrToken(…,
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
      공식 클라 `WangTileSelector` — 관리자 결정 「공식이랑 동일하게」): 후보(`_FilterWangNormal`: 캐릭터가 선 칸·배치 불가 고지대 제외)를 전투 난수로
      섞은 뒤, 놓을 수보다 많을 때만 정렬 — 비교자 `<_SortCandidates>b__14_0` 오름차순 키 ① 지상 먼저(`!isLowland`) ② 적이 있는 칸 먼저(유효한
      적 아무나, `_CheckContainsEnemies`) ③ 배치 불가 먼저(`buildableType != NONE`이 뒤) ④ 재능 跟子(TALENT)만 방향 `_GetDirectionPriority`
      (row+ 0, col+ 1, row− 2, col− 3 = 위 > 오른쪽 > 아래 > 왼쪽; 결정적), S3 시작(SKILL_3_INSTANT)은 ④ 없음 = 같은 칸끼리 무작위. 재능 跟子는
      돌 하나 주변 4칸 중 1칸(`_maxNum` 1)이라 늘 ④까지 정렬된다. 코드 `op-wang.js followerOrder`. 이전(2026-10-07 ~ 10-10, PRTS 비고 순서):
      적이 있는 칸 > 배치 불가 지상 > 배치 가능 지상 > 배치 가능 고지대 — 적이 있는 고지대 칸(비행 적)이 적 없는 지상보다 앞이었다.
      **좌우 반전된 필드(보스·히든 필드의 오른쪽 플레이어)에서도 필드 좌표 그대로** 위 > col+ > 아래 > col− (관리자 결정 2026-10-11 「공식대로」):
      클라는 맵을 뒤집지 않고 오른쪽 플레이어의 말 위치만 거울로 옮긴다 — 공식 클라 `AutoChessMapAreaManager.ConvertChessPositionInfoToRightMap`
: 왼쪽 일반 맵이면 평행 이동, 보스 맵이면 `dir = OppositeLR(dir)`, `col' = 2·m_mapLRBoundaryCol − col` — 그리고
      `WangTileSelector._GetDirectionPriority`는 실제 격자의 오프셋(`tile.pos − m_targetPos`)으로 순서를 매긴다. 시뮬레이션도 같은 모델이다:
      반전 플레이어의 유닛은 필드 좌표(20 − c)에 서고, `buildOne`이 받는 칸은 이미 필드 좌표, 필드 col+ = 화면 오른쪽. 그래서 2순위는 늘 화면
      오른쪽(필드 col+)이다. 테스트 `test/local-patch-diy-wang.test.js` 「on a mirrored field (boss right side) the 跟子 order stays the field's up >
      col+ > down > col−」.
      - **되돌리기** (옛 결정, 관리자 결정 2026-10-07 — 「반전 필드면 그려진 대로 좌우를 바꿈」, upstream `SIDES_MIRRORED`와 같은 생각; 2026-10-10
        클라 순서로 바꿀 때도 「미확정」으로 유지; 2026-10-11까지): 옛 동작은 `battle.getPlayer(owner).mirror`인 플레이어(보스·히든 필드 오른쪽)의
        跟子가 필드 좌표 (+row, **−col**, −row, +col) 순서였다 — 화면 왼쪽이 2순위. 되돌리려면 `op-wang.js`에 상수
        `const ORTHO_MIRRORED = [[1, 0], [0, -1], [-1, 0], [0, 1]];`를 다시 두고 `buildOne`에서 `ORTHO.forEach` 대신
        `(battle.getPlayer(unit.ownerId)?.mirror ? ORTHO_MIRRORED : ORTHO).forEach`로, 테스트 「on a mirrored field…」의 기대를
        `{ r: low.homeR, c: low.homeC - 1 }`(옛 이름 「W8: on a mirrored field (boss right side, drawn col → 20 − col) right and left swap」)로.
      쓰러진 오퍼레이터가 누운 칸(`Battle.downOn`)에도 안 놓인다(upstream과 같게,
      2026-10-07 관리자 결정). 연결에 참여하고 피해 출처는 망. 여러 개를 이어 지을 때(S3 배치의 재능 1 + 추가 ≤ 3)는 **4프레임마다 하나씩**
      (`env_043_stone_trigger` `_stoneBuildDelay` 4, 공식 클라 `WangStoneTriggerManager.OnTick`의 buildStoneRequests — 2026-10-10, 그 전엔 한꺼번에):
      첫 개(재능, 무료)부터 추가분까지 각각 요청 0.25초 뒤에 내려앉고(아래 「跟子 던지기 지연」), 추가분은 지어질 때마다 탄약 1발, 놓을 칸이 없는
      차례는 건너뛴다(클라도 요청 수를 줄임). S3 시작 InstantSpawn 跟子도 한 번에 1칸씩(아래).
    - **跟子 던지기 지연** (2026-10-10 저녁, 관리자 결정 「클라 타이밍」 — 「S3 발동 뒤 돌이 놓이기까지가 너무 짧다」 제보): 跟子는 놓는 게 아니라
      던진다 — 재능의 BuildStone(`skchr_wang_3/SpawnTokenS3/BuildStone`·`…InSkill/BuildStone`)과 S3 시작 InstantSpawn은 둘 다 투사체 능력
      (`projectile_chr_wang_stone3`, `_preDelay` 0.25), InstantSpawn은 시전마다 1칸(`_maxNum` 1)·`_cooldown` 0.25(EN 클라 `[uc]skills.ab`).
      지금: 돌의 跟子는 각 요청 0.25초 뒤(1/30초 틱이라 8번째 틱, 0.267초; 이어서 4프레임 간격), S3 시작 跟子는 0.25초 뒤 첫 개, 그 뒤 0.25초마다
      한 개씩. 칸은 던질 때(시전 시작) 고른다(2026-10-31, 공식 클라에서 확인: `CastOnTileAbility.OnCastStart`가 시전 칸 `m_castTiles`에 던짐
      `_startEffect`를 만듦 — 그 전엔 내려앉을 때 골랐음): 시뮬 키트 fx 'wangThrow' { r, c } → 0.25초 뒤 그 칸에 'summon'(`op-wang.js throwFollower`).
      날아가는 跟子도 상한(`max_spawn_cnt`)에 세고 그 칸은 다른 跟子가 못 고른다. 내려앉을 때 그 칸이 못 받게 됐으면(돌이 돌아옴·오퍼레이터 배치)
      그 跟子는 없음(2026-10-31, 공식 클라에서 확인: 두 능력은 `WangVisualStoneMarkAbility`이고, 시전(`_selectTargetTiming` 0 = 시전 시작에 고른
      `m_castTiles` 그대로)의 `CreateProjectileOnTile`이 `WangStoneTriggerManager.TryMarkVisualStone`으로 그 칸을 표시할 수 있을 때만 투사체를
      만든다 — 그 칸에 표시된 돌·跟子가 없고(`CheckStoneMarkable`) 캐릭터가 없을 때(`Tile.GetCharacter`); 못 하면 `_actionsOnMarkFailed`(둘 다 빔)뿐).
      우리 `followerClass`의 쓰러진 오퍼레이터 칸 제외(관리자 결정 2026-10-07)는 내려앉을 때도 그대로. 내려앉는 때는 그대로. 예전: 돌과 같은 틱(재능),
      S3 시작분은 한꺼번에. `op-wang.js FOLLOWER_PRE_DELAY`·`S3_SPAWN_COOLDOWN`. 테스트 `test/local-patch-diy-wang.test.js` W12(0.25초 뒤 첫 跟子)·
      「thrown at its tile」·「does not land when a unit takes its tile」, `test/local-patch-diy.test.js` 「none at the cast」.
      - **투사체 비행 시간 없음** (2026-10-31, 공식 클라에서 확인 — 관리자 결정 2026-10-10 「조사 전까지 제외」를 닫음): `projectile_chr_wang_stone3`의
        이동 컴포넌트는 `AttachToTarget`(`_immediatelyReach` 1, `_delayToStart` 0) — 만들어질 때 그 칸에 놓이고 날아가지 않는다. 그래서 0.25초
        (`_preDelay`) 뒤 = 내려앉음 그대로; 떨어지는 모습은 던짐 `_startEffect` `wang_passive_01_start`(렌더 'wangThrow')가 그 0.25초 동안 보여 준다.
      놓을 수 없는 칸(2026-10-06 관리자 제보): 클라이언트 跟子 선택기 `exceptTileTypes` + tileTypesMask 14. 비트는 클라 enum
      `Torappu.Battle.TileTypesMask`([Flags]: NONE 0, DEFAULT 1, HOLE 2, END 4, START 8, FAKE_HIGHLAND 16; 2026-10-10 확인 — 그 전엔 tileTypeDict
      순서로 END 2·START 4·HOLE 8이라 [추정]했다) → 14 = HOLE·END·START = `tile_end`·`tile_end_cooperate`·`tile_allygoal`(방어 지점),
      `tile_start`·`tile_start_cooperate`·`tile_enemygoal`(적 침입 지점), `tile_hole`(타일 키 → 마스크는 `BattleMiscDB.GetTileTypesMask`; 2026-10-10
      battle_misc_table `tileTypeDict`와 대조: END = tile_end·tile_end_cooperate·tile_allygoal, START = tile_start·tile_start_cooperate·tile_enemygoal,
      HOLE = tile_hole — `op-wang.js FOLLOWER_EXCEPT_TILES` 7키와 같다). 필드 밖 칸은 grid가 거른다 — 클라 `WangTileSelector._CheckMapTileValid`
도 위수협약 전투 중에는 지금 전투 맵 영역(`AutoChessGameMode.FetchValidMapGrids` → `AutoChessMapAreaManager.FetchBattleValidMapGrids`)
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
      나무위키 「최대 3개의 바둑돌은 배치될 때 탄약을 1발씩 소모」; 2026-10-07 관리자 결정, 같은 날 인게임에서 확인; 2026-10-10 공식 클라로 확인 —
      `WangStoneTriggerManager.AddBuildStoneSequence`가 요청을 `isFreeBuild` true로 만들고 `OnTick`이 첫 BuildStone 뒤 false로
      내린다, `WangVisualStoneCtrlAbility.BuildStone`은 무료면 탄약 카운터에 `NotCountTimes`(세지 않음, 여분 탄 소리도 없음) — 첫 개만
      무료, 추가분은 1발씩). 이전(2026-10-06):
      跟子 최대 4개 전부 1발씩(클라이언트 SpawnTokenS3InSkill BuildStone 카운터 `_countEvent 4, _expendPerTrigger 1`).
      끝나는 조건은 재고 소진·탄약 소진·수동 종료뿐이고(공식 클라 `WangS3CastSkillWithLimitTimes.OnTick`: 손패 0 + 지을 跟子 없음
      `!hasRemainingBuildCnt` — 손패가 0이어도 이어 짓는 跟子가 남았으면 그것까지 기다린다, 2026-10-10 `followAround`), 남은 탄약은 돌로 돌아온다(엔진 `end()`가 onEnd 전에 `ammoLeft`를 0으로 만들어 이전엔
      반환이 늘 0이었음 → 킷이 따로 기억, 손패 7장까지). **정비 단계에 돌을 하나도 놓지 않았으면** 아무것도 충전·배치하지 않고 끝나지 않는다
      (관리자의 실제 게임 관찰 2026-10-06; 자료에는 직접 문장 없음). 손패는 S3 중 복귀한 돌마다 하나씩 줄어
      (위 「돌아올 때 재고 하나를 쓴다」, 2026-11-11부터), S3는 탄약 소진(복귀한 돌의 S3 跟子)·손패 소진·수동 종료로 끝난다.
    - **손패 돌은 새 칸에 놓지 않는다** (관리자 결정 2026-10-11 「공식대로(빼기)」): 클라의 전투 중 배치 경로는
      `AutoChessBattleTrigger._TryDeployAvailableCharacter` 하나뿐이고, 이것은 `battleChessInsts`(정비 때 필드에 놓인 말)를
      **정비 위치에만** 놓는다(`_AutoDeploy`: 대기 더미 칸 또는 `chessInst.pos`). 손패에만 있는 돌(정비 때 안 놓은 것, S1/S2 「즉시 2개
      획득」, S3 ChargeToken)을 새 칸에 놓는 코드는 없다(`AutoChessBattleTrigger` 메서드 전수 — 스킬 발동 판정과 이 둘뿐; 손 드래그 핸들러는 정비·보스
      화면 조작용 [추론]). 그래서 손패는 소모된 돌이 돌아올 재료일 뿐이다: S1/S2는 카드 2장만 받고(가득 차면 阻回), S3의 배치는 소모된 돌이 정비
      위치로 돌아오는 것뿐 — 그녀의 사거리 안이면 적이 선 칸에도 돌아오고(W10) 그때 재능 跟子 1개(무료) + S3 跟子 ≤ 3개(1발씩). S3 시작
      InstantSpawn 跟子는 그대로. 복귀를 그녀의 S3 배치로 세는 근거(2026-10-06 브라우저 재현): 정비 때 다 놓으면 필드가 늘 가득 차 대체 배치가
      한 번도 없어 탄약 막대가 가득 찬 채였다 — 복귀를 배치로 센 뒤 라운드 5 S3 탄약 16 → 12 → 9 → 5 → 2. 필드가 가득 차도 S3는 스스로 끝나지
      않는다(예전의 자체 종료는 근거 없어 삭제 — 일찍 끝나던 원인). 2026-10-08 영상의 「S3 중 0.5–1초 간격 초록 폭발」은 돌아온 돌·그 跟子·InstantSpawn 跟子로 설명된다(모순 없음).
      **남은 가능성** (관리자 요청 2026-10-11로 기록): 위 결론은 「클라에 그런 배치 코드가 없다」는 데서 나온 추론이다. 위수협약 전투는
      서버 스텝(`AutoChessStepModeManager`: 적 등장·퇴장·보스 HP 동기화)과 함께 도는데, 서버가 손패 돌을 새 칸에 놓으라는 배치 명령을 보내고
      클라가 그대로 따르는 경로가 있다면 공식도 손패 돌을 새 칸에 놓을 수 있다. 공식 클라에서 그런 명령(서버→클라 배치 패킷과 그 처리기)은 찾지
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
      (3개 중 1개가 사라져도 남은 돌은 3중첩). 값은 데이터: 일반·V단계 정예 10%/9, VI단계 정예(모듈 3) 13%/12. 공식 클라로 확인(2026-10-10):
      `StoneTriggerMap.UpdateStoneTriggerCnt` — 칸별 중첩·방향(행/열 수)을 최댓값으로 고정, 돌이 떠나면 `ClearExplodedStones`로 초기화;
      `WangStoneTriggerManager.OnTrigger`가 S1/S3에는 중첩을 bb `cnt`로(프리팹이 `max_trigger_cnt`로 자름), S2에는 `is_row`·`is_col`(가로·세로·십자 폭발).
    - **무장 지연** (2026-10-10, 관리자 결정 「공식이랑 동일하게」): 돌·跟子가 이어지면 연결선은 바로 나오지만 실제로 발동할 수 있게 되는 것(무장)은
      **30프레임 뒤**다 — `env_043_stone_trigger`(`WangStoneTriggerManager`) `_tokenStoneExplodeDelay` 30·`_projectileStoneExplodeDelay` 30, 공식 클라
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
      관리자 메모(2026-10-09): 테스트 뒤 되돌릴 수 있음. 공식 클라로 확인(2026-10-10, 되돌릴 근거 없음): `StoneTriggerMap.UpdateStoneMap`을
      `_OnUnitBorn`이 태어난 모든 캐릭터에 부르고, 그 칸에 살아 있는 돌이 아닌 표시(跟子)가 있으면 `RemoveStoneMark(pos, isOverlapped: true)`로 지운다 —
      PRTS 문구와 같다. 이동 재배치(`moveRedeploy`)가 공식에서 born을 내는지는 미확인. 회귀 테스트: `test/local-patch-diy-wang.test.js` 「a deployment on a 跟子's tile removes it」(돌 복귀·
      오퍼레이터 이동, 옛 규칙에서 실패 확인), 「望 stones never share a tile」(실제 매치 경로, 매 틱 겹침 0 + 배치가 跟子를 지운 횟수 > 0 —
      옛 규칙에서 4판 중 3판 실패 확인).
  - 첸: 약점 대미지(물리·마법 중 유리한 쪽), 7초 무피격 시 회복+다음 공격 회피, S1 침묵, S2 0.4초 간격 10회 베기(처치 시 이전·+1회,
    무적) 후 대상 칸으로 이동 + 공격력·회피 버프, S3 검기(1.5칸/초, 반경 1.3, 직선 구간마다 적당 1회, 현재 HP 6%·최소 공격력 530%/정예 550%) — PRTS 비고 기준.
    S3 검기 회전(2026-10-06, EN 클라이언트 `[uc]projectiles.ab`의 `projectile_chr_chen3_s3` → `ChangeStateWithHighlandBehaviour`):
    앞 칸이 고지대·侵入点(빨간 문)·保护目标(파란 문)·필드 밖이고 그 칸 가장자리까지 0.25 이하(+0.02)이면 시계 방향 90°
    (`_hitDistance` 0.25, `_checkHitHighland`·`_checkTileStart`·`_checkTileEnd`·`_checkHitMapEdge`). 꺾이면 맞은 적 목록을 비운다.
    벽 판정은 공식 클라 `_CheckHitConditions`와 같다(2026-10-10): 맵 밖, `heightType` 1(고지대), `TileTypesMask` START 8·END 4 —
    저지대 통행 불가·장애물 칸에서는 꺾지 않는다(START/END 마스크의 `tile_start_cooperate`·`tile_enemygoal`·`tile_end_cooperate`·`tile_allygoal`은
    우리 맵 데이터에 없다). **한 틱에 한 번만 꺾는다** (2026-10-11, 공식 클라 `ChangeStateWithHighlandBehaviour.OnTick`: 틱마다
    `_CheckHit` → `_ChangeDirection` 한 번) — 앞과 그 오른쪽이 모두 막힌 막다른 곳에서는 틱마다 90°씩 돈다. 그 전엔 한 틱에 최대 4번 꺾은 뒤
    움직여 한 틱에 180°도 돌았다. 테스트 `test/local-patch-diy-chen3.test.js` 「S3: the 剑气 turns at most once per tick」.
    시계 방향은 공식 클라의 상수다(2026-10-10 정정 — 예전 「방향 값은 클라이언트에 없다」는 틀림): `ChangeStateWithHighlandBehaviour._ChangeDirection`이
    이동 방향을 상수와 비교해 위 → 오른쪽 → 아래 → 왼쪽 → 위로 바꾼다(PRTS 「顺时针旋转90°」과 같음). 꺾는 조건은 클라 `_CheckHit`
    `_hitDistance >= d && d > _hitEps`(0.02 < d ≤ 0.25 — `_hitEps`는 여유가 아니라 하한; 우리는 ≤ 0.27로 둠, 벽 앞 0.25에 멈추므로 실제 궤적 차이는
    거의 없음 [추론]). 이전 코드와 다른 점: 0.75 앞을 봐서 0.5칸 일찍 꺾었고,
    저지대 통행 불가 칸·장애물이 놓인 칸에서도 꺾었고, 侵入点에서는 꺾지 않았다. 판정 간격 0.03초(이전 0.1초 → 이제 매 틱),
    수명은 스킬 끝까지(`_lifeTimeType` 2 = 클라 enum `LifeType` INFINITY — 2026-10-10 확인, 스킬 종료 버프 `chen3_s3[finish_projectile]`가 지운다).
    **검기가 나가는 때·S3 모드** (공식대로 — 2026-10-11 밤 두 번 다시 확인해 고침): 시작 애니 `Skill_3_Begin`(13프레임 0.433 s, OnAttack 없음 —
    `skchr_chen3_3` `_playSkillBeginAnim` 1, 공식 클라 `BasicSkill.PlayBeginAnimation`이 그 길이만큼 기다린 뒤 `DoStartSkill` → `SkillState` →
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
    `restart`: 휘두름 없앰·`atkCd` 0) → `S3_BEGIN + 4틱`에 `attack`(S3 프로필); 스킬이 끝나면(`onEnd`, S3 모드였으면) `restart` 뒤 스펙을 되돌림. 틱 수(공식 클라로 확인): 자동 시전 `AutoChessBattleTrigger`는 코루틴이라 `BattleController.OnTick`에서 유닛 갱신 뒤
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
    한때 3-12 안의 적(비행 포함)으로 켜지는 `SKILL_RANGE` 예외였으나 관리자 결정(2026-10-06)으로 공식 규칙으로 되돌렸다. 공식 행과 다른
    규칙은 관리자 결정으로만 `tools/build-data.mjs resolveTrigger`에 넣는다(2026-10-28부터 남은 예외 없음).
  - 위셔델 탄이 닿는 때(2026-11-07, 공식 클라에서 확인, 투사체 프리팹): 일반 공격·S1·S3 탄은 닿을 때 본 타격, 멈출 때(닿고 `_delayAfterReached` 0.15초 뒤) 여진 — 모듈의 `enable_third_attack` 여진도 같은 순간이다(전에는 0.3초 간격). S1은 `S1_Shock`의 두 탄이 함께 날아 닿고 0.5초·0.65초 뒤 여진을 낸다. S2 과부하의 추가 3발은 모드 `S2_Overload`의 `MultiRangedAttack`(`_additionalTimes` 3): 발 사이 `_triggerDelta` 0.1초 × 그 휘두름의 배율(`attackTiming().scale`), 발마다 대상을 다시 고르고(`_selectTargetTiming` 1), 고른 자리에 `_delayToStart` 0.1초 뒤 닿는다(`_followTarget` 0). 기절이면 남은 발이 사라진다. 시험 `test/local-patch-diy-wisdel.test.js`.
  - 위셔델: 여진·잔영 폭발(재능1), 혼령의 그림자 소환과 근처 위장(재능2), S2 과부하(지속시간 후반부), S3 그림자 2개 추가(최대 3).
    S2 과부하 근거(2026-10-10, 그 전엔 [추정]): 스킬 프리팹 `skchr_wisdel_2`가 `_isOverloadSkill` 1이고, 공식 클라 `BasicSkill.get_overloadRatio`
가 그런 스킬에 0.5 → `OverloadIfNecessary`가 진행도가 0.5를 넘으면 과부하(ON_OVERLOAD → 버프 `wisdel_s_2[overload_start]`,
    `mode 2`) — 25초 중 12.5초부터 끝까지(`op-wisdel.js overload`). 진행도(2026-10-31 공식 클라에서 확인): `get_remainingOverloadProgress` =
    `get_remainingProgress` ÷ 0.5(0–1로 자름, 남은 진행도가 0.5보다 크면 0)이고, 남은 진행도 = 1 − 능력의 `cooldownProgress`(스킬에 `SkillProgressHooker`도
    SP 비율 표시도 없을 때) → 남은 진행도가 절반 이하일 때, 곧 시전의 뒤 절반(시뮬과 같음).
    S2 수정(2026-10-06): 과부하 본탄의 `attack@atk_scale_ol`(0.7)이 적용되지 않았다(사키코 S2와 같은 원인: `beforeAttack`의 `ctx.profile`
    교체를 엔진이 다시 읽지 않음). 과부하 동안 위셔델 자신의 `unit.profile` 복사본에 `atkScale`을 넣고 끝나면 되돌린다.
  - 사키코: 음표 수만큼 방어·저항 무시, Fever(450, 20초, 스킬 재시전·S2 2연타·S3 퇴각 안 함), S2는 시전마다 피아노↔오르간 전환(클라 프리팹
    `skchr_oblvns_2` 토글형 — `_useAbilityHandleToggle` 1·`_switchToMode` 1·`_defaultModeIndex` 2, 시작·끝 애니 `Skill_2_Trans_B`; 2026-10-10 [추론: 토글
    처리 코드 `ToggleInternal`은 안 봄]).
    **사키코 S2** (2026-10-29 공식 클라에서 확인, 보류 — 관리자 결정 2026-10-29: 이 모드에서 잘 안 쓰는 스킬): 卫戍协议 자동 조작은 S2를 **한 번만** 켠다 — `ToggleSkill.DoCast`가 시전마다 `toggled`를
    뒤집고, `AutoChessBattleTrigger._DoDefaultCheck` → `_CheckToggleSkill`이 켜진 토글 스킬을 거절한다(피아노 → 오르간 뒤 그대로). 우리는 아직 시전마다
    바꾼다: 오르간이 계속되면 오르간 음표(`NOTE.organ`, 추적 1.0칸/초·회전 2.5/초)가 회전 반경(약 0.4칸)보다 가까운 대상 둘레를 돌기만 하고 도착
    0.1에 닿지 못해, 사키코 가까이 선 적을 못 맞힌다 **[추정·미조사: 공식 추적 이동의 방향 전환 계산을 안 읽음 — 같은 모델인지, 오르간 음표가 실제로
    맞히는지]**. 보류를 풀면 그 확인 뒤 S2를 한 번만 켜는 토글로 바꾼다.
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
    회전은 PRTS 「转向速度7/30每帧」 = 30fps에서 7/초. 추적 속도는 고정이다: 공식 클라 `AdvancedMovement.OnTick`은 `_useDynamicSpeed`일
    때만 `_deltaSpeedPerSec`·`_finalSpeed`로 가속하는데 음표의 추적 이동(`ToTraceTarget`)은 모두 `_useDynamicSpeed` 0 — 프리팹의 0.4·4.0은 쓰이지
    않는 값, 2026-10-10 확인.)
    규칙: 자유 비행 방향은 사키코 방향 ±20°(PRTS 「自身朝向左20°至右20°范围内，随机一个角度」; 2026-10-10 공식 클라로 확인 —
    `BasicMovement._InitDirectionByStart`, `_useSourceDirection` + `_useSourceDirectionRandomArcAngleStart`: 전투 난수 `Range(−angle, +angle)`,
    angle = 블랙보드 `angle` = 재능1 `attack@angle` 20. 일반·재능 음표는 확인, S2·S3 음표는 같은 플래그이고 스킬 블랙보드에 `angle`이 없어 재능 값을
    쓴다 — 공격 능력이 쏜 투사체의 블랙보드에 `attack@` 키가 접두사 없이 들어간다: 피아노 음표의 `MovementSwitchControllerOblvns.Init`이
    `projectile.blackboard`에서 `"passby_delay"`(S2 `attack@passby_delay` 0.5)를 읽는다, 2026-10-10 [추론: 합치는 함수 자체는 안 읽음]). **S1 부채꼴** (2026-10-10, 관리자 결정 「공식이랑 동일하게」): 같은 메서드의
    `_useSourceDirectionArcAngleWithRatio` — a = angle × (2·ratio − 1), ratio = `_sourceDirectionArcAngleRatio` (2i+1)/16, angle = S1 블랙보드
    `angle` 15 → 정면 ±13.125°(3.75° 간격, 30° 부채꼴) 8개. 그 전엔 비율을 360°에 곱해 한 바퀴로 뿌렸다 [추정이었음]. **1번 음표(가장 센 1.0배)는
    보는 방향의 왼쪽(반시계)** (관리자 결정 2026-10-11 「공식 부호」): 공식 클라 `LitePhysicsUtil.Rotate` = `Quaternion.AngleAxis(a, up)
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
    도착하면 `MovementSwitchControllerOblvns`가 3.0칸/s로 `passby_delay` 0.5초 미끄러진 뒤 멈춤 — 2026-10-10 확인. 클라 히트 검사는 0.1초 주기의
    `SelectorHitBehaviour`(2026-10-31 공식 클라에서 확인: 루트 컴포넌트의 필드가 그 클래스와 같음)이고 `_hitPasserby` 0이라 도착한 뒤에만 타이머가
    돈다 → 자유 비행 중에는 안 맞는다. 우리도 추적 중 도착 거리 안에서만 맞음 — 같음), 나머지 **0.1** — 추적 이동 `AdvancedMovement.DoCheckReachedInternal`이 대상 위치
    0.1 안이면 도착(2026-10-10, 관리자 결정; 그 전 0.2 [추정], `op-oblvns.js NOTE` `hit`). 화면: `fx.md`의 사키코 음표.
    음표 프리팹마다 있는 이동 `Emtpy`(속도 0.1 → 2.0)는 쓰이지 않는다(2026-10-31 공식 클라에서 확인): 이동 목록 0번(상태 NONE)이고,
    `MovementSwitchControllerOblvns.Init`이 곧바로 1번(추적 `ToTraceTarget`)이나 2번(자유 비행)으로 바꾸며, 대상을 잃으면 2번, 맞힌 뒤는 미끄러짐.
  - 아스카론: 사망 구금 중첩(이동 −18%/중첩, 현재 공격력 10%/초), S2 둔화·처치 시 확산, S3 범위 내 적 명중률 −30%(회피 시 회복).
  - 대미지 감사(2026-10-06): 범위 대상은 모두 선택 가능 규칙(`foesInRadius`/`enemiesInKeys`/`canTargetEnemy`: 미노출 은신·선택 불가 제외).
    고친 것: 첸 S2 첫 대상(`unitsInGrid`는 필터가 없음 → 은신 적을 벰; 은신 적만 있으면 선택 가능한 적이 올 때까지 대기), 아스카론 S2 처치 확산이
    한 번도 안 되던 버그(`rangeKeys`는 배열인데 `.has?.`로 검사), 바둑돌 S2/S3 폭발 `canDodge: false`(원본 함정·폭발과 같은 규칙),
    S1 지속 피해 무출처(PRTS 「以无来源的形式施加给目标」).
- 소환물 모델(望 바둑돌·维什戴尔 혼령의 그림자): fexli 미러에 望 바둑돌은 아예 없고 혼령의 그림자는 스킨 변형만 있어 아바타 마름모로 보였다.
  EN 클라이언트 `PersistentData/Bundles/pkgrps/btl_pfb_tokens_*.ab`의 `<id>_SkeletonData`에서 기본 모델을 뽑는다 — 0.2.0부터 upstream
  `tools/local-extract/extract.py TOKEN_SPINES`(→ `public/assets/local/spine/token/<id>/`) + `node tools/fetch-assets.mjs --local-spines`
  (→ `tools/assets/local-token-spines.json`, `data/assets.json tokens[id].spineLocal`). 적 로컬 모델과 같은 방식이라 `assets/local`이 없으면 아바타로 돌아간다.
- 信标(비콘): 공식 「无法装备给自编干员」(KR 「선발 오퍼레이터는 장착 불가」, 일반·금색 둘 다 설명 마지막 줄). 선발 조각에 장착하면
  `BAD_TARGET`으로 거절하고 아이템은 손패에 남는다. 그 문장을 `tools/build-data.mjs`가 읽어 아이템에 `noDiy`를 쓰고(두 시즌 — 규정은
  효과 키가 `equip_tier_recr_gift`로 바뀌었다), 장착 관문 `player/items.js equip`, 클라이언트 `gameLogic/placement.js equipCheck`
  (「无法装备给自编干员」), AI 托管 `bot.js itemTarget`이 모두 키가 아니라 `noDiy`를 읽는다(upstream `ae8ed5eb` 이식 —
  전에는 서버만 키 별칭으로 거절하고 클라 표시·봇은 기본 시즌 키만 알았다). AI 托管의 아이템 판단은 다른 시즌이 이름만
  바꾼 키를 기본 시즌 키로 읽는다(`items/aliases.js canonicalBuffKey`, upstream `efee57c7`). 처음 선발 구현(`shared/diy.js diyEquipRefused`)에 있던 거절이 0.2.0 upstream 틀로 옮길 때 빠졌고,
  upstream 0.2.0은 「선발 조각은 팀원에게 보내지 않음 [ASSUMED]」만 있어 선발 오퍼레이터가 파괴되고 2명 중 1명 특수 갱신이 열렸다
  (2026-10-22 수정, 테스트 `feedback3-gift.test.js`·`gameLogic.test.js`·`feedback5-we2-bot-diy.test.js`). [실제 판 이상 없음 2026-10-28]
  재발 방지: 원인 제거 — build-data가 문장을 읽어 `noDiy`
- 모듈: 공식 甄选 칸에는 기본 모듈이 없어(게임에서 직접 장착) 처음엔 미장착이었다. 2026-10-05부터 후보의 첫 모듈(`uniequip_002`, X 타입)을
  기본으로 장착한다(상점 `defaultUniEquipId`). 오퍼레이터 구성 화면에서 「없음」을 고를 수 있다.
- 한국어: `public/i18n/ko/diy.json` — KR 서버에 있는 오퍼레이터는 KR 공식 테이블(ArknightsAssets `kr/`, 2026-11-01부터 수동 사전보다 먼저: 왕·첸 더
  던스트릭·켈시 에스페란타·토가와 사키코도 이날 KR 출시분으로 바뀜), 아직 CN에만 있는 오퍼레이터는 `tools/i18n/diy-ko-manual.json` 수동 번역
  (`docs/I18N.md` 「CN-only texts in Korean」; 관리자 결정 2026-11-01). 옛 원칙 「나무위키 표기」는 KR 출시 오퍼레이터의 공식 표기를 옮긴 것이었다.
  `tools/i18n/build-ko-diy.mjs`가 `backups.json` 빌더(`build-data.mjs` `buildBackups`)를 한국어 테이블로 한 번 더 돌려(잠재 1–6 모두) 같은 경로의
  문자열을 짝짓는다. 0.2.0 병합으로 옛 빌더(`build-diy.mjs`)가 없어져 멈춰 있던 것을 2026-10-09 이렇게 고쳤다. 사전에 없는 문자열은
  `KO_DIY_TRACE=1`로 확인하고, 다시 만든 뒤에는 `build-ko-pack.mjs`로 팩을 다시 빌드한다(커밋된 사전을 읽는다).

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

**시전 시점**
- 프리팹이 `_switchToState` 1이고 클립이 있는 즉발·충전 스킬의 효과는 `onStrike`에 둔다(공격 없는 스킬; `sim.md` 「즉발 스킬의 시전」, `test/sim/skill-strike.test.js`가 전수로 잡음). `_selectTargetTiming` 0이면 대상은 `onStart`에서 `skill.castPick`에 골라 둔다. 지속 스킬은 `castHolds`와 묶음 값(`castCarriesOn`·`modsAfterCast`·`durationAfterCast`)을 프리팹대로 본다.

**대상 선택**
- 범위 피해·범위 효과는 선택 가능한 적만 고른다: `battle.foesInRadius`, `battle.enemiesInKeys`, `canTargetEnemy`(targeting.js).
  PRTS 「AOE的判定是对攻击范围内的每个可以被选中的敌人进行判定」 — 미노출 은신(隐匿)·선택 불가는 빠진다.
  - 쓰면 안 되는 것: `battle.enemiesInRadius`(숨은 적만 뺌), `battle.unitsInGrid`(필터 없음), `battle.enemies`를 직접 돌며 피해 주기.
    `battle.enemies` 순회는 거리·칸 계산 같은 판단에만 쓴다.
  - 실제 사례: 첸 S3 검기·S2 첫 대상, 왕 바둑돌 발동·폭발이 은신 적을 때렸다.
- 범위 칸 판정은 둘로 나뉜다(관리자 결정 2026-10-17, `sim.md` 「적 충돌 반경 0.1 — 평타·스킬 공격 범위」): 공격 범위·스킬이 치거나 고르는 범위는
  적의 0.1 충돌 원(`battle.enemiesInKeys`·`unitsInGrid`·`bodyInRange`), 스킬 자동 발동의 rangeId 칸·칸 규칙(지형·장판·함정·「所在格」)은 위치의 칸
  (`battle.enemiesOnTiles`·`anyEnemyOnTiles`·`bodyInKeys`·`bodyOnTile`). 키트가 자기 발동 조건을 rangeId 칸으로 직접 볼 때도 칸 쪽.
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

**소리** (2026-11-04, 소리 오류 원인 정리 — `audio.md` 「공격 소리 신호」 「재발 방지」)
- 공격 묶음(`_abilityConfigs`)이 있으면 `link_sheet.py --id`의 「attack groups」로 자식의 조건을 읽고 `test/audio-cond-group-list.js`에 한 줄: 조건 없는 자식이 평소 소리, 조건 자식은 키트 `swing` 훅의 `c.signal`·`forceAttack`의 `signal`·키트 사건 중 하나로 낸다. 이름으로 넘겨짚지 않는다.
- 맞지 않는 피해는 `battle.loseHp`로(사건 7번째 칸 3, 착탄음 없음)·틱은 `dot` 태그로. 소리·이펙트가 다 필요 없으면 `silent`.
- 소리 시험은 `includes`만 보지 않고 횟수·안 나야 할 소리를 함께 본다. 스킬 시전에 소환물 등 조건이 필요하면 `test/helpers/audio-sweep.js` `NEEDS`에 넣는다(시전 안 되면 시험이 실패한다).
- 스킬 타격이 들어가는데 타격음이 안 나면 `test/audio-skill-silence.test.js`가 실패한다: 소리를 잇거나, 뱅크를 읽고 `test/audio-skill-silence-list.js`에 근거를 적는다(`audio.md` 「스킬 타격음 전수」). 평타 없는 스킬(`noAttack`)은 모드 소리가 돌지 않으니 망치·장판처럼 키트가 직접 내는 타격에 소리를 직접 잇는다.

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
  공식 표의 행은 그대로 따른다(중장은 `TAKE_DAMAGE`; 2026-10-28 관리자 결정으로 예외 없음).

**화면·배치** (관리자 제보 2026-11-04, 제시카 더 리버레이티드에서 난 문제. 앞의 넷은 시험이 잡는다)
- 전투 중 `unit.dir`을 바꾸면 `tellDir(battle, unit)`을 부른다(`kits/shared/tier1.js`). `b.snap`에 방향이 없어 안 부르면 사거리만 돌고 모델·방향 원은 처음 방향에 남는다(`test/content/kit-facing.test.js`).
- 문구의 배치 제한(「只能部署…」·「只能放置于…」)은 주석이 아니라 규칙이다: 토큰 필드와 서버 `_legal`·클라 `gameLogic` 둘 다에 넣는다. 새 문구는 시험이 실패한다(같은 파일).
- 다른 오퍼레이터의 fx 사건을 빌려 쓰면 그 사람의 대체 그림이 나온다: `kitofficial.js`에 계획을 넣거나 `test/render/pick-event-list.js`에 무엇이 그리는지 적는다. 투사체 `_mainEffect`·`_effectsWhenStop`은 `fx-unplayed-local-list.js`의 `todo`로 두면 안 보이는 채 남으니 묶음 안에서 잇거나 관리자의 할 일 목록에 올린다.
- 조건이 붙은 자식 능력의 시전 이펙트는 공격마다 틀면 안 된다: `fxmap.js KIT_CAST` + 키트 순간(`test/render/cond-cast-fx.test.js`).
- golden·키트 시험은 소환물을 규칙대로 놓는다(`tools/golden.mjs`의 `ownerBeside`·`ownerRange`). 먼 칸에 놓으면 돌아서기·표식·오라·포탄을 아무 시험도 지나지 않는다.
- 화면 확인은 아레나에서 네 방향으로: 샌드백을 사거리 밖에 두고 모델·방향 원을 본 뒤, 앞에 두고 투사체를 본다(공격 때 몸을 돌리는 동작이 방향 전달 누락을 가린다). 비행 시각은 1배속에서 판단한다.

**동작 근거**
- 출처 순서: 공식 테이블(skill_table blackboard, character_table 재능, battle_equip_table 모듈) → PRTS 비고 → 나무위키 평가.
  PRTS·나무위키는 요약·기계 번역이 틀릴 수 있다(사키코 공격 속도 「자신 제외」 오독). 원문 문장을 인용한다.
- 수치는 단계별 레코드(`data/backups.json` `diy`의 폼)의 레벨 값을 그대로 쓴다. 만렙 값(나무위키)을 박지 않는다.
- 자료에 없는 종료·정지 조건을 만들지 않는다(왕 S3 「놓을 칸 없으면 종료」 → 일찍 끝나는 버그). 추정은 코드와 이 문서에 [추정]으로 남긴다.
- 위수협약에 없는 원작 조작(수동 배치, 수동 스킬 종료)을 옮길 때는 대체 규칙을 [추정]으로 적는다.

**한국어 문구**
- KR 서버에 없는 오퍼레이터의 이름·스킬·재능·특성은 `tools/i18n/diy-ko-manual.json`에 KR 서버 문체로 옮긴다(관리자 결정 2026-11-01) — 방법과
  자주 쓰는 표현은 `docs/I18N.md` 「CN-only texts in Korean」, 대조는 `node tools/i18n/kr-style.mjs <중국어 표현>`. 그 뒤 `build-ko-diy.mjs`·`build-ko-pack.mjs --offline`.

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
  read_buff_templates`가 읽는 방식; EN 전체 추출은 관리자 노트): 그 오퍼레이터 버프(`<code>_s_<n>[…]`, `<code>_t_<n>`)의 ModifyGraphicHolderHeight(그림
  높이·시간), SwitchMode(모드 → 클립), CreateEffect(이펙트 키) 노드. 노드가 거는 블랙보드 값(`height_duration` 등)은 skill_table에서 찾는다.
- **PRTS 备注의 연출 문구**: 「模型」「不改变所在地块」「中心坐标」 같은 말은 모델만 움직이고 판정은 그대로라는 뜻이다. 판정(칸·좌표·사거리)은 시뮬, 모델 위치·높이·
  클립은 렌더로 나눈다(시뮬이 칸을 옮기면 공식과 달라진다). 숨은 주석도 본다(S2 활공의 끝점 규칙이 거기 있었다).
- **소리 뱅크 전수 대조**(2026-11-01, 탈룰라 S3 簇火가 무음이던 원인): `node --test test/audio-bank-coverage.test.js`가 그 오퍼레이터의 공식 뱅크
  (이름에 코드네임이 단어로 든 `battle.` 뱅크 — 투사체·커스텀 트리거·버프 신호도 잡힌다)가 매니페스트에서 나는지 보고, 안 나는 것은
  `test/audio-bank-coverage-list.js`에 상태(`none`/`todo`)가 있어야 통과한다(`audio.md` 「선발 소리 뱅크 커버리지」). 새 오퍼레이터의 표를 옛 캐시에
  옮겨 넣었다면 그 표에 뱅크가 다 들어갔는지부터(옮길 때 빠진 뱅크는 이 시험에도 안 보인다).
- **어느 클라로 확인했는지**: EN 클라에 있는 클래스는 「언제 트는지」(어느 메서드가 그 필드를 읽는지)까지 확인한다. CN 전용 클래스(CN
  클라에서는 메서드를 볼 수 없음)는 필드만 읽고 해석을 [추정]으로 표시한다(이 문서의 근거 줄에 「CN 전용, 필드만」이라고 쓴다).
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
  한국어 이름·문구는 비공식 수동 번역이다(`tools/i18n/diy-ko-manual.json`; 켈시 에스페란타는 2026-11-01부터 KR 공식 테이블): 켈시 에스페란타 · 클레멘티아 · 안젤리나 더 멜로우 위시(글로벌 이격
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
  재배치 등), 클레멘티아 4(S2 放逐 조합·운반 여유 0.4·틱마다 갱신·소용돌이 스킬과 함께 끝; 그 밖에 확산 대상 동률 순서), 予愿安洁莉娜 4(S3 비행 이동
  속도·0.1 s 재선택 등). 클레멘티아 S3는 2026-10-29부터 추정이 없다(아래).
- 클레멘티아 S3 포격(2026-10-29, CN 클라의 스킬 프리팹 `skchr_clemnt_3`·버프 템플릿·포탄 프리팹 `projectile_chr_clemnt_s3`, 공식 클라에서 확인):
  - 발사: 능력 `RocketTrigger`의 버프 `clemnt_s3[rocket_trigger]`가 0.03초마다(`triggerInterval`, `INFINITY`) S3 모드·남은 탄약을 보고
    `ShipLaunchedRocket`(선딜레이·애니메이션·쿨다운 없음)을 쓴다 → **표식 다음 틱에 발사**. 대상은 그녀가 단 `clemnt_s3[ep_break_mark]`가 있고
    `clemnt_s3[hurt_mark]`(맞힌 적, `ep_break_duration`)가 없는 적 1명, **그녀에게 가까운 순**(`_postFilter` DIST_TO_SOURCE_ASC), 포탄이 이미 있는 칸은
    뺀다(`_sameGridBanProjectileKey`, 포탄 수명 `projectile_life_time` 5초). 키트는 쏜 표식을 지워 같은 결과.
  - 포탄: **적이 서 있던 칸에 고정**(`clemnt_s3[emit_projectile]` `_useTileAsTarget`·`_useTargetRootTile`, `_followTarget` 0), 쏘자마자 도착
    (`_immediatelyReach`)하고 타격 타이머가 첫 주기를 기다려(`_waitFirstPeriod`, `_interval` 1) **1초 뒤부터 1초마다 `audio_trigger_cnt`(3)번**
    (키트 `SHELL_FIRST`; 전에는 0.5초 뒤로 추정).
  - 끝: **그녀가 쓰러지거나 퇴각하면 남은 포격이 멈춘다**(`_stopWhenSourceInvalid` 1 — 키트 `shellsStop`; 착탄 이펙트 `clemnt_skill_03_Mark_all_01`도
    `_clearReachedEffectWhenStop`대로 그녀의 'die'에 지우고, 아직 안 난 낙하음도 취소 — `audio.md` 「스킬·재능 투사체 소리」). **스킬이 끝나도 쏜 포탄은
    남는다**: `_managedBySource` 1은 그녀의 관리 투사체 목록에 넣기만 하고, 그 목록을 끝내는 것은 템플릿 노드 `FinishManagedProjectiles`뿐인데
    S2(`clemnt_s2[emit_projectile]` 버프 끝 — 객차)만 쓰고 S3에는 없다.
  - 화면: 포격 자리는 공식 `clemnt_skill_03_Mark_all_01`(fx `lock`, 세 번의 파동을 스스로 가짐), 타격마다의 fx `blast`는 따로 그리지 않는다
    (`public/js/render/fxgame.js`). upstream 공용 폭발 자리표시 `blast`(`public/js/render/fx/kinds.js`)는 그녀의 이펙트 번들이 없을 때만 나온다.
- 공식 이펙트·소리·공격 타이밍·소환물 모델: EN 클라이언트에 없어 CN 클라이언트에서 뽑았다(2026-10-11, `fx.md` 「선발 추가 3명 — CN 클라이언트」).
  공격 타이밍(`tools/assets/local-attack-timing.json`)이 들어가며 세 명의 타격 시점이 공식대로 바뀌었다(golden `diy-009`…`diy-011`만 움직임).
  스킬 시전(`cast`, `skill_cast.py`)과 투사체(`shot`, `op_projectiles.py`)는 그때 손 합치기에서 빠져 클레멘티아·안젤리나 더 멜로우 위시는
  2026-11-01에야 받았다(네 도구가 EN 다음 CN을 읽게 된 뒤, `fx.md` 「선발 추가 토스카·탈룰라」): 클레멘티아 S1 `replace`(다음 공격을 대신함)·
  S2 `state`·S3 `state`(방향 안 바꿈), 안젤리나 더 멜로우 위시 S1 `free`·S2 `state`·S3 `free`(이륙 클립 `Skill_3_Restart_Begin`)와 평타·S1~S3 공식
  투사체(`projectile_chr_aglna2*`; 클레멘티아는 근접이라 투사체 없음). golden은 `diy-011`(안젤리나 더 멜로우 위시) 방향 사건 수만 움직였다(피해·처치 같음).
  클레멘티아 일본어 음성: 우리 음성 색인(`charword_table`, 10-06)이 그녀보다 오래돼 계획에 없었다 → `fetch-assets --refresh-index`로 12칸 모두 들어옴
  (한국어 음성은 셋 다 없음 — 한국 서버 출시 전).
- 키트 사건 이펙트는 2026-10-11 연결(`fx.md` 「선발 추가 3명 — CN 클라이언트」). 그때 CN 추출기 버그(이펙트 컴포넌트 구조 차이)를 고쳐 클레멘티아 S3 범위가
  제자리에 놓였다. 안젤리나 더 멜로우 위시 S3 원(`aglna2_skill_03_range_01`)이 한 칸 아래에 보이던 것은 이륙(起飞) 오퍼레이터를 공중 높이로 그리지 않아서였다
  → 이륙한 오퍼레이터를 비행 높이로 그린다(관리자 결정 2026-10-11, `render.md` 「이륙 높이」). 결과 화면 이름(upstream #469 — 클라이언트 전투 결과에서 선발이 「甄选干员」으로 나옴, `server/match/fields.js`)은 기존 선발에도 있는 별개 버그라 따로 — 2026-10-11 upstream 0.2.4 이식에서 고침(`sim.md` 「upstream 0.2.4 이식」).
- 켈시 에스페란타 S3 운반 이륙(2026-10-14, `7e508db6`): 운반 시작 뒤 `op-kalts2.js TAKEOFF_PRE` 0.667 s(CN 클라 이륙 클립 `Skill_3_Restart_Begin` 1 s의
  OnAttack — 비행 투사체가 나가는 순간) 동안 제자리에서 이륙 클립, 그 뒤 숨고 비행(그 전엔 즉시 숨음) → `render.md` 「Spine 클립 커버리지」 G.
  그동안 공격 없음은 공식과 같다(2026-11-17, 공식 클라 프리팹에서 확인): `StartTransporting` 능력(charpack `Others/Direction/Talents/-1`) 옆의 `BuffDuringCastingFixed`가
  시전 동안(`_timeMode` 1 = 클립 1초, `TAKEOFF_CLIP`) `kalts2_s_3[disarm]`(FORCE_DISARMED·INVINCIBLE)을 건다 — 휘두름이 끊기고, 떠나기 전 0.667초에도 피해를 받지 않는다(전에는 무적이 없었다).
  착지 뒤에는 스킬을 되살리는 `kalts2_s_3[restore]`가 `RespawnBorn`(클립 `Skill_3_Restart_End` 1초, `OnAttack` 없음 → 대기 상한까지)을 틀고, 그 `BuffDuringCastingFixed`
  `kalts2_s_3[respawn_anim]`(FORCE_DISARMED)이 1초 동안 공격을 막는다(`LAND_CLIP`; 전에는 착지하자마자 쳤다). 같은 꼴 훑기는 `sim.md` 「즉발 스킬의 시전」 벨로네 줄 아래.
- 테스트: `test/content/op_{kalts2,clemnt,aglna2}.test.js`(체크리스트의 은신 적 범위 피해 3개 포함), `test/content/heal-triggers-023.test.js`(S2 발동),
  `test/match/feedback5-we2-placement.test.js`(#26 战术锚点), `test/content/feedback5-we2-summon-hand.test.js`(#24 표식), golden `diy-009`…`diy-011`(새 시나리오, 다른 가족 변화 없음).

## 선발 추가 酒神 (2026-10-26, 관리자 결정)
- 관리자 결정 2026-10-26: 선발에 酒神(`char_1042_phatm2`, 6성 서포터 巫役)을 넣는다(`LOCAL_DIY_PICKS` 끝). 새 시즌에 오퍼레이터가 늘 때 지금 절차로
  넣으면 이펙트 손작업이 얼마나 드는지 보려는 시험이기도 하다(이펙트 쪽 결과 → `fx.md` 「선발 추가 酒神 — EN 클라이언트」). 한국 서버에 있어 이름·문구는
  KR 공식 표 그대로다(트라고디아, 의식술사, 밤의 메아리 · 본능의 부름 · 빈 극장, 소환물 광란의 감옥; `tools/i18n/build-ko-diy.mjs`).
- 데이터: CN 표 그대로. 모듈 RIT-X 酒神之心. 맹약 빅토리아(`victoriaShip`). 소환물 本能的召唤(S2를 고르면 손패 1개, 근접 칸), 迷狂牢笼(S3가 만드는 것, 손패 아님,
  Spine 모델 없음 — 이펙트로만 보임).
- 키트·테스트: upstream `master`(`f07b8965`)의 `op-phatm2.js`·`test/content/op_phatm2.test.js`. 0.2.0 때 우리 트리에도 있던 것을 하드 포크 정리
  (`1fc07616`)에서 지웠다. 바꾼 것:
  - import `attack.js` → `damage.js`(upstream 0.3.2가 정산 모듈을 옮김). 범위 판정은 upstream도 적 0.1 충돌 원(`bodyInRange`)이라 우리 규칙
    (`sim.md` 「적 충돌 반경 0.1」 — 공격·스킬이 치는 범위)과 같다.
  - S3 자동 발동은 `sim.md` 「스킬 범위 발동」: upstream 테스트의 `ACTIVE_RANGE` 단언을 `DEFAULT` + y-8 상자(`triggerGrid`)로 고침. 동작은 같다.
  - 화면용 필드만 더함: 유인 `lure`의 `t`(남은 유인 시간), S2 퇴장 틱 피해의 `moment: 'phatm2_s_2[damage]'`. golden 숫자 영향 없음.
- PRTS 대조(2026-10-26, 酒神·本能的召唤·迷狂牢笼 문서): 溅射半径1.3（中点判定）·S2 1.5, 堕梦 「于敌人成功普通攻击前之前触发」, 召唤 0.4 도착·10초 퇴장·「缓存攻击力」,
  牢笼 「受到3次来自阻挡目标的攻击后消失」「酒神技能结束后额外持续30秒」 — 키트 주석과 같다. S1 「提升至1.5倍」의 대상은 PRTS도 적지 않는다(키트: 속박 동안 받는
  神经损伤).
- [추정] 키트 머리 주석의 `[ASSUMED]` 그대로: T1 손상은 타격 판정 뒤 회피돼도 남음, S1 두 타격 각각 T1, 속박은 두 타격 뒤, 유인 대상 동률은 정예·리더 → 가까운 순.
- 테스트: `test/content/op_phatm2.test.js`(19), 선발 수를 세는 테스트 8 → 9명, golden `diy-012`·`diy-013`(새 시나리오, 다른 가족 변화 없음).
  화면: Windows Chrome 디버그 아레나에서 세 스킬의 이펙트 재생 기록(`fx.md` 같은 절). 실제 판은 아직 → 관리자 노트의 열린 항목.

## 선발 추가 토스카 (2026-11-01, 관리자 결정)
- 관리자 결정 2026-11-01: 선발에 토스카(冻河 `char_4244_tocka`, 6성 서포터 유격수)를 넣는다(`LOCAL_DIY_PICKS` 끝). 다음 위수협의 시즌 대비로 CN에 새로 들어온
  오퍼레이터를 미리 넣되, 지금 시즌 선발에도 공개한다. 모듈·소환물 없음. 맹약: 우르수스는 핵심 맹약이 없어 협방(`emptyShip`).
- 한국어 이름·문구는 한국 서버 출시 전이라 비공식 수동 번역(`tools/i18n/diy-ko-manual.json`): 토스카 · 유격수 · 가진 것 없는 자(一无所有之人) ·
  포효하려는 마음(意欲呼啸之心) · 외로이 걷는 봄(踽踽独行之春) · 밤의 침묵 · 눈의 흔적, 용어 触发型效果 = 발동형 효과(KR 표에 없음. 나머지 용어는 KR 표
  그대로: 보호막·기절·약화). 문구는 KR 서버 스킬 설명 문체(「대미지를 입힘」·「피격 시」·「광역 대미지」·「지속해서 소멸」)에 맞춤(관리자 결정 2026-11-01).
  S3의 晕眩은 기절(나무위키 팬 번역의 「정지」가 아님).
- 데이터: CN 표(79.0) 그대로. 그때 받아 둔 옛 표에는 그녀가 없어, 옛 표에 그녀 항목만 더한 표로 만들었다(관리자 노트). 미러에 모델·그림·스킬 아이콘이 있어
  `tools/fetch-assets.mjs`가 그대로 받는다. 한국어 음성 없음.
- 근거: 표(skill_table 블랙보드, character_table 재능), PRTS 비고(S2 「“自动开启”的实现逻辑为自动触发该技能，不改变其手动触发性质；切换类技能也可触发此效果」 하나뿐),
  CN 클라 전투 데이터(charpack `char_4244_tocka`, 스킬 프리팹 `skchr_tocka_1/2/3`, 투사체 `projectile_chr_tocka_t2`·`_s2`·`_s3`, 버프 템플릿 `tocka_*`).
  그 데이터가 쓰는 클래스·노드는 전부 EN 클라에도 있어 동작이 알려져 있다 — 예외는 S3 고르기의 정렬 `FilterType` 81(CN에만). 키트는 upstream 것 없이
  우리가 새로 썼다(`op-tocka.js` 머리 주석에 규칙 전부).
- 규칙 요약(수치는 단계별 레코드 그대로):
  - 발동형 효과 = 스킬이 아군 오퍼레이터에게 거는 버프. 걸 때마다 토스카에게 재능 2 표식, 발동할 때마다 재능 1(SP +2, 그녀 범위에서 가장 다친 다른
    아군 오퍼레이터 1명 공격력 100% 치유). 소환물·장치 제외(직업 마스크 639), 고립 제외.
  - 재능 2: 표식이 있으면 다음 일반 공격이 `T2Attack` — 맞은 자리 반경 `attack@projectile_range`(1.5) 안 적 전부(공중 포함)에 그 공격 피해 + 약화 20%와
    매초 공격력 80% 마법 지속 피해 8초. **2026-11-01 확인**: 투사체 `projectile_chr_tocka_t2`의 `HitBehaviour` + `CircleRange`(도착 때 원 안 전부),
    `CacheAtkToBBBehaviour`(지속 피해의 공격력을 쏠 때 기록). S3 모드에서는 공격이 S3 것이라 표식이 S3 뒤 공격까지 기다린다.
  - S1·S2(AUTO): SP가 차고 **고를 대상이 있을 때만** 켜진다(`SelectorTrigger` `_minTargetNum` 1, `_recoverSpIfNoTarget`) — 없으면 SP를 찬 채 기다림.
    S1 = 범위 안 효과 없는 아군 오퍼레이터 최대 2명(자신 포함, HP 비율 낮은 순 → 늦게 배치된 순), 첫 피해(원소·지속 피해 제외)에 보호막(걸 때의 공격력 × 배율,
    원소 피해만 통과, 10초에 걸쳐 1초마다 감소, 더 큰 옛 보호막은 그대로)·공격자 기절 3초. S2 = 전장의 패시브 아닌 스킬을 가진 가장 늦게 배치된 아군(자신은
    마지막), 투사체(속도 10)로 걸림, 그 아군 스킬이 켤 수 있게 되면(0.2초마다) 또는 스킬을 켜면 공격 속도 버프 15초 — 그동안 MANUAL 스킬은 0.2초마다
    곧바로 켜진다(`TriggerSkill` → `Character.RemoteTrigSkill`, 위수협의 자동 조작 조건을 거치지 않음 — 공식 클라에서 확인, PRTS 비고와 같음).
  - S3(MANUAL, 데이터 DEFAULT): 공격 4명·기절 0.5초. 시작 때 그녀의 S3 효과가 누군가에게 있으면 그것을 발동, 없으면 범위 안 다른 아군 1명에게
    (패시브 아닌 스킬·스킬 안 켜짐 → 패시브 아닌 스킬 → 아무나, 각 단계 SP 비율 높은 순). 효과를 가진 아군이 스킬을 켜면 그 아군과 토스카에 공격력 버프
    (초기값에서 매초 줄어 15초), 효과는 범위 안 다른 아군에게 옮겨가고 재능 1. SP +1/초는 S3가 켜진 동안만. 효과는 S3 패시브(`S3Passive`)라 그녀가
    퇴장하면 사라진다.
  - **로직 정리 문서와 다른 점**(관리자 노트, 2026-11-01): 거기서는 「옮김은 S3가 켜진 동안만(`is_tocka_use_skill`)」으로 읽었으나, 그 값은 S3 시작
    경로(`tocka_s3[add_trigger]`가 1로 둠)와 옮김 경로를 가르는 것이고 옮김 갈래는 그녀의 스킬을 보지 않는다(`tocka_s3[trigger_listener]` 실패 갈래 —
    SP 증가만 `CheckCharSkillAffecting`을 봄). 스킬 설명에도 조건이 없다. → 옮김은 S3가 꺼져 있어도 일어난다.
- 추정 셋(키트 머리 주석에도 같은 표시): ① `[추정·CN]` S3 고르기 정렬 81 = SP 비율 높은 순(EN enum에 없음, 설명 「技力比例最高」), 같으면 배치 순.
  ② `[추정·엔진]` S1 효과는 그 피해의 보호막 단계 전에 발동해 새 보호막이 그 피해도 막고, 뒤에 회피된 공격도 발동시킴(한 피해 안의 이벤트 순서).
  ③ 같은 토스카가 다시 건 지속 피해는 새 8초 + 둘 중 큰 값. 시간은 공식 클라에서 확인(2026-11-01): 버프가 그녀마다 따로(`independentCharacterSource`)
  덮어쓰기 EXTEND라, 있던 버프가 남고 남은 시간을 새것으로 다시 채운다(값을 새것으로 옮기는 것은 버프 표의 `takeSnapshotWhenExtend`가 켜졌을 때만).
  `[추정·CN]` 큰 값: 그녀 템플릿의 MAX 대입(`AssignBuffBlackboard`의 `_assignMode`·`_includeDisableBuffs`)이 EN 클라에 없는 CN 필드.
- 이펙트·공격 타이밍·투사체·스킬 시전 데이터: CN 클라에서 뽑음(2026-11-01, `fx.md` 「선발 추가 토스카·탈룰라」) — 평타·스킬 시전·타격·꼬리는
  공식 이펙트, 공격 타이밍은 공식 값(golden `diy-013`·`014` 이동). 키트 사건 연결(2026-11-01, 같은 절 「손으로 이은 것」): 발동형 효과의 시작
  이펙트(사건 `tockaFx`)·S2 도착 타격·S3 효과의 이동(`tockaMove`)·재능 1 치유(치유의 `moment` `tocka_t1[heal_core]`)·재능 2 공격(휘두름 신호
  `T2Attack` — 그 능력의 투사체·타격)·아군 쪽 屏障·S2 공격 속도·S3 공격력과 S3 효과가 다녀간 표시(보이는 버프 `tocka:shield`·`:auto`·`:bonus`·
  `:visit` — 표시만, 시뮬 결과 그대로). 화면 확인 전.
- 테스트: `test/content/op_tocka.test.js`(9 — 모든 폼, 세 스킬, 두 재능, 실제 매치 경로 하나), 선발 수를 세는 테스트 9 → 10명, golden `diy-013`
  (그녀의 5티어 행이 함께 실림)·`diy-014`(새 시나리오), 다른 가족 변화 없음.

## 선발 추가 탈룰라 (2026-11-01, 관리자 결정)
- 관리자 결정 2026-11-01: CN 클라이언트에 새로 들어온 탈룰라(塔露拉 `char_4247_oxi`, 6성 가드 本源近卫)를 새 시즌 대비로 미리 넣고, 지금 시즌 선발에도
  공개한다(`LOCAL_DIY_PICKS` 끝). 모듈·소환물 없음. EN·KR 서버에 아직 없어 이름·스킬·재능 문구는 비공식 번역(`tools/i18n/diy-ko-manual.json`): 탈룰라,
  찰나의 백야(照霎白夜) · 단절의 폭설(阂断骤雪) · 맹렬한 코로나(日冕重烈), 재능 타협은 없다(绝不妥协) · 나는 곧 불꽃(我即火焰); 문구는 KR 서버 스킬 설명
  문체에 맞추고 특성은 KR 표의 프라이멀 가드 특성문 그대로(관리자 결정 2026-11-01: 이대로 — 한국 서버 출시 때 공식 이름으로 바꾼다).
- 데이터: CN 79.0 표(2026-10-28)의 그녀 항목만 옛 캐시에 더해 만든다(다른 데이터는 그대로; 다음 정식 표 갱신 때 같이 들어온다). 맹약: 우르수스에 이번 시즌
  핵심 맹약이 없어 협방(`emptyShip`).
- 근거: 공식 표(skill_table·character_table 블랙보드) + CN 클라의 전투·스킬 프리팹과 버프 템플릿(`oxi_*`). 그녀만 쓰는 클래스 — 발자국의
  `TimedTileLeaseAbility`, S2의 `TargetCenteredAreaMeleeAttack`·`LinearDecayBuffToOwnerDuringAbility`, S3의 `OxiFireRainSlotBehaviour`·
  `CheckOxiFireRainSlot`·`EmitDirectionalMapEdgeProjectileVolley` — 는 CN 클라에만 있어 직렬화된 필드 이름·값과 스킬 문구로 옮겼다. 나머지 노드는 EN 클라에도
  있는 클래스다. PRTS 비고는 아직 없다(2026-11-01). 키트 `server/sim/content/kits/ops/op-oxi.js`(이 포크가 처음 쓴 것 — upstream에 없음).
- **특성·재능 1 「결코 타협하지 않는다」**: 기본 공격은 마법(Default 모드 `MeleeAttack` `_damageType` 2). 그녀가 주는 지속이 아닌 마법 대미지마다 그 대미지 ×
  `ep_damage_ratio`(13%, 잠재 5 미만 11%)의 소각 손상(`oxi_t_1_burning_damage` `ApplyElementDamageBasedOnDamageValue` FIRE — 손상량 기준은 정산 뒤 HP 대미지,
  `SIM.md` §7.2 원소 관례). 「奥术」 중첩(`oxi_t_1_arcane_manager`): 배치 때와 평타마다 「최근 공격」 표시가 `arcane_idle_delay`(3초) 붙고, 표시가 없으면
  `arcane_step_interval`(0.5초)마다 +1, 최대 round(`arcane_max` / `arcane_step`) = 6. 평타 한 번에 −1(`oxi_t_1_attack_completed`는 Default 모드의 두 공격에만 붙음
  — S1·S2 스킬 공격은 줄이지 않음). 중첩마다 그녀의 지속 아닌 마법·원소 대미지 × (1 + `arcane_step` × 중첩): 층이 쌓이는 `DamageScale`은
  1 + 값 × 유효 층 수를 곱한다(공식 클라에서 확인, 2026-11-01 — 최대 +18%, 잠재 5 미만 +15%).
- **재능 2 「나는 곧 불꽃」**: 그녀가 배치돼 있는 동안 아무 적(은신 포함)의 소각 손상 폭발이 **시작될 때**(`ON_BEFORE_EP_BREAK_START`, 엔진 `elementBurst`)
  그 적에 5초 「흔적」(`oxi_t_2_trail`): 0.5초마다와 서 있는 칸이 바뀔 때마다 그 칸(통행 가능한 지면만, `TileSelector`)을 `field_duration`(4초, 잠재 3
  미만 3초) 동안 발자국으로 잡는다. 최대 `max_count` 25칸, 꽉 차면 새 칸은 받지 않는다(CN 프리팹 `_rejectNewWhenFull` 1 — 관리자 기억 「오래된 칸이 지워짐」
  (추정)과 엇갈려 필드를 따르기로 함, 관리자 결정 2026-11-01 [추정·CN: 필드의 동작은 클래스가 CN에만 있어 이름으로 읽음]). 발자국 위의 지상 적(은신·선택 불가·무적 제외)은
  들어온 때부터 `field_interval`(0.3초)마다 탈룰라 공격력 × `field_atk_scale`(15%, 잠재 3 미만 12%) 마법 대미지(지속 피해 — 재능 1 손상·奥术 대상 아님),
  발자국 여러 칸을 밟아도 타이머 하나(EXTEND 버프 하나), 발자국을 벗어나면 끊긴다. 그녀가 쓰러지거나 물러나면 흔적·발자국이 모두 사라진다.
  [추정·자료 없음: 이미 잡힌 칸을 다시 잡으면 4초가 새로 시작 — 관리자 기억 「아마 새로 시작」(2026-11-01), `TimedTileLeaseAbility`는 CN에만] [추정·CN: 피해의 공격력은 그 틱의 공격력
  — 공식은 `_cachedAtkKey atk`로 기록한 값인데 기록 시점을 모름]
- **S1 「백야를 비추는 섬광」**(AUTO, SP 8): 다음 공격이 목표 칸의 모든 지상 적에게 `atk_scale` 마법 대미지 + `fear` 초 공포. 발동은 데이터의 `DEFAULT`(프리팹
  발동기 = 1-1 안 저지 중이거나 범위 안 지상 적 1명 — 같은 조건).
- **S2 「가로막는 눈보라」**(AUTO, 충전 5, 발동기 `NeverTrigger`): 스스로 켜지지 않고 `oxi_s_2_guard_manager`(HIGH 우선순위)가 켠다 — 키트 `trigger: 'NEVER'` +
  피격 훅. 조건: 피해 마스크 `ANY_ATTACK`(물리·마법·순수·원소 대미지), 지속·BUFF 종류·환경 피해가 아니고, 출처가 있는 적, 회피된 공격도 포함(MISS·HIT_FAILED —
  엔진 `hit` 훅이 회피 판정 전에 돈다), 직전 시전의 보호 시간(`skill_duration` 1.3초) 밖, 충전·행동 가능·침묵 아님. 시전되면 그 피해가 물리·마법이면
  × `damage_remaining_scale`(10%, 노드 목록은 앞 노드가 실패하면 멈춰 시전에 성공했을 때만). 시전: ① `oxi_s_2_stack`(공격력·방어력 + `atk`/`def`, 최대 5층,
  `stack_duration` 5초 — STACK 그룹이라 쌓을 때마다 시간 갱신, INDEX 직접 확인 항목과 같음)을 능력 시작에 받고 ② 공격자 중심 반경 `ability_range_radius`(1)의
  적에게 `retaliate_atk_scale` 마법 대미지(공격자가 사라졌거나 선택 불가면 1-1 안 저지/범위 적 중심, 없으면 피해 없음), 준 대미지마다 `heal_ratio`(5%) 자기
  치유 ③ 가호 `damage_resistance` 90%를 `shelter_hold_duration` 0.2초 유지한 뒤 `skill_duration` 1.3초에 0이 되도록 직선 감소 — 버프 목록이 이중 버퍼라
  시전시킨 그 피해에는 안 걸린다(다음 단계부터). 중첩이 있는 동안 평타는 `BuffedAttack`: 저지 중인 적 전부(`_limitedMaxTargetNumToBlockedCnt` = 엔진
  `hitAllBlocked`). 반격 대상은 피해의 근원(`TriggerAutoSkill` 입력 대상 = 피해 출처, 없으면 투사체 주인), 그녀의 사거리와 상관없이 전장 어디서든
  [추정·CN: 입력 대상 검증기 `CircleRange`의 반경을 모름 — 제한 없음으로 둠; 관리자 기억 「아마 맵 전체」(2026-11-01)와 같음]. [추정·자료 없음: 반격 피해는
  시전 즉시 — 공식은 `Skill_2_Cambat`의 공격 이벤트일 수 있음; 관리자 기억 「공격받았을 때」(2026-11-01)]. 시전 동안 평타를 멈춘다: 스킬 프리팹이
  `CastSkill` `_switchToState` 1, 스킬 능력 시간 `_timeMode` 3 = `skill_duration` 1.3초(공식 클라에서 확인 — CN 스킬 시전 표가 들어온 뒤로 엔진의
  `sim.md` 「즉발 스킬의 시전」 'state' 규칙이 하던 휘두름을 끊고 1.3초 동안 공격하지 않음; 공식 플레이 영상에서도 같음, 관리자 확인 2026-11-01).
- **S3 「코로나의 맹렬」**(MANUAL 36초, 과부하 스킬): 공격력 + `atk`, 공격하지 않음(모드 `S3NoAttack` → `disarm`, 저지는 함). 시작에 `normal_interval`(2.67초)마다,
  과부하(진행 절반)부터 `overload_interval`(2초)마다 물결 — 각 물결 버프는 시작하자마자 한 번 쏜다(`waitFirstTriggerInterval` 꺼짐). 물결: 배치 방향을
  가로지르는 줄 `normal_half_width` 2 → 5줄(과부하 `overload_half_width` 6 → 13줄), 그녀 줄 가운데, 전장 끝에서는 묶음을 안으로 민다
  [추정·CN: 필드 `_shiftLaneWindowAtMapEdge` 켜짐을 이름대로 읽음, 관리자 기억 「아마 밀림」(2026-11-01)과 같음], 줄마다 簇火 하나(`_emitSingleTileLane`), 속도 `wave_speed` 2.3칸/초. 簇火는 판정 반경 `projectile_range` 0.5 안에 적이
  들어오면 터져 반경 `range_radius` 1.5의 적에게 `heatwave_atk_scale` 마법 대미지(대상이 소각 손상 폭발 냉각 중이면 원소 대미지), 같은 물결에 이미 맞은 적은
  `same_wave_repeat_damage_scale`(15%); 터진 簇火는 사라진다. 피해의 공격력은 그 물결을 쏜 때의 값. 「언제든 끌 수 있음」은 위수협의에 수동 종료가 없어
  옮기지 않는다. 자동 발동은 SP가 차면 바로(키트 `trigger: 'ALWAYS'` = 엔진 `SP_FULL`, 0.2초 패스·블록은 같음): 새 시즌 `act3autochess`의
  `skillTriggerDataList`에 탈룰라 S3 행(`char_4247_oxi`, 스킬 3)이 `ALWAYS`로 생겼고(공식 CN 표 2026-11-06 판), 공식 클라의 `AutoChessBattleTrigger`는
  `ALWAYS`를 수동(MANUAL) 스킬 확인 뒤 다른 조건 없이 시전한다(집기병·전술가·음유시인 분과·위셔델 S3와 같은 형). 지금 시즌 표에는 그녀 행이 없어(선발
  오퍼레이터) 두 시즌 모두 이 행을 쓴다(관리자 결정 2026-11-08). 2026-11-01~11-08에는 「필드에 적 1명 이상」(`GDGLOW_SKILL_2`)으로 추정했었다. [추정·CN: 簇火는 배치 방향 반대쪽 맵 끝에서 출발(클래스 이름 `EmitDirectionalMapEdgeProjectileVolley`, 관리자 기억 2026-11-01과 같음),
  그녀 뒤 최대 11칸(`_maxBackDistance` — 보통 전장은 이보다 좁아 늘 맵 끝); 적에 안 닿으면 앞쪽 맵 끝 + `wave_exit_distance` 5칸에서 사라짐(관리자 기억
  「아마 맵 끝」)] [추정·자료 없음: 공중 적도 맞음 — 문구에 「地面」이 없음(S1에는 있음)·관리자 기억(2026-11-01), 투사체 프리팹 안 읽음] [추정·CN: 스킬이
  끝나도 날던 簇火는 계속 — 끝낼 노드가 스킬에 없음] [추정·CN: 첫 물결 시점 = 스킬 시작(공식은 능력 이벤트 4), `CheckOxiFireRainSlot`(여러 탈룰라·물결
  제한으로 보임)은 옮기지 않음]
- 簇火 그림(관리자 결정 2026-11-15, 두 시즌): 날아가는 길 전부를 필드 밖까지, 보스 필드의 장비 구역(규정)·임시 정비 구역(맹약 하반기) 줄(1행)
  위로도 그린다(공식에 가까움) — **보스 필드의 정비 구역 줄(0행)만 빼고**. 그 줄 위 줄은 그리지 않고, 세로로 나는 簇火는 그 줄의 가장자리(0.5)에서
  나타나거나(`d`초 늦게) 거기서 사라진다(`op-oxi.js drawRows`, `fxgame.js` 'oxiWave'). 시뮬의 簇火(피해·시간)는 위처럼 맵 끝에서 맵 끝까지 그대로다.
  같은 날 잠시 필드 안만, 그다음 0·1행을 빼고 그렸다가 이 꼴로 정했다. 재발 방지: `test/content/op_oxi.test.js`.
- 자산: 미러에 모델(앞·뒤)·그림·스킬 아이콘·효과음·CN 음성이 있어 `tools/fetch-assets.mjs`가 그대로 받는다. S2의 클립은 프리팹이 정한
  `Skill_2_Cambat`(`skchr_oxi_2` `TargetCenteredAreaMeleeAttack` `_animKey` — 이름 추측의 `Skill_2_Attack`이 아님; `tools/assets/anim-overrides.mjs`),
  `Skill_2_Attack`은 어느 클라 키도 부르지 않아 `none`(CN 클라 키를 2026-11-01에 메타데이터에 반영, `test/render/clip-coverage-list.js`).
  같은 반영으로 토스카는 아래 방향 평타(`Attack_Down_*`)와 첫 공격 시작 클립을 얻음. 이펙트·공격 타이밍·
  스킬 시전 데이터는 CN 클라에서 뽑음(2026-11-01, `fx.md` 「선발 추가 토스카·탈룰라」 — 공격 타이밍 공식 값, golden `diy-014`·`015` 이동);
  발자국(`zone`, 다시 잡을 때도 보냄)·S3 簇火(`oxiWave`, 폭발 `blast`에 물결·줄 번호)·奥术 중첩(`stacks`에 `max`)·S2 중첩(보이는 버프
  `oxi_s_2_stack`)은 2026-11-01에 공식 이펙트로 이음(같은 절 「손으로 이은 것」).
- 테스트: `test/content/op_oxi.test.js`(12: 모든 폼·잠재, 재능 둘, 세 스킬, 은신 적, 실제 경기 경로 S2), 선발 수를 세는 테스트 10 → 11명, golden
  `diy-014`(토스카 다음 칸들과 다시 묶임)·`diy-015`(새 시나리오). 화면·공식 화면 대조는 아직 — 관리자 노트의 열린 항목.

## 선발 추가 팔라스 (2026-11-02, 관리자 결정)
- 관리자 결정 2026-11-02: 선발에 팔라스(帕拉斯 `char_485_pallas`, 6성 가드 교관)를 넣는다(`LOCAL_DIY_PICKS` 끝). 다음 위수협의 시즌에 나올 오퍼레이터를
  upstream 선발 키트로 미리 넣는 첫 시험이고, 지금 시즌 선발에도 공개한다. 한국 서버에 있어 이름·문구는 KR 공식 표 그대로(팔라스 · 교관 · 승리의 연타 ·
  신념의 채찍 · 용감의 축복, 재능 영웅의 탄생 · 여신의 진작, 모듈 '고향의 바위'(INS-X) · '헬리아의 빛'(INS-Y); `tools/i18n/build-ko-diy.mjs`).
- 데이터: CN 표 그대로. 모듈 둘, 소환물 없음. 맹약: 미노스는 이번 시즌 어느 핵심 맹약에도 없어 협방(`emptyShip`).
- 키트·테스트: upstream의 순서형 피해 판정 커널 직전 판(`9a3a12ee9^`, 2026-10-21)의 `op-pallas.js`·`test/content/op_pallas.test.js`. 그 뒤 upstream이
  이 두 파일을 바꾼 커밋은 없다. 바꾼 것:
  - S2 자동 발동은 `sim.md` 「스킬 범위 발동」: S2 레벨에 rangeId가 없어 공격·저지 상태일 때 켜진다. upstream 테스트의 `ACTIVE_RANGE` 단언(늘어난 범위에만
    적이 있어도 켜짐)을 `DEFAULT` + `triggerGrid` 없음으로 고치고, 늘어난 범위에만 적이 있으면 켜지지 않음을 확인한다.
  - S1 둘째 타격: upstream은 두 타격을 한 공격 안에 함께 넣고 0.1초를 추정으로 남겼다. 공식 클라에서 확인된 `MultiMeleeAttack` 구조(1 + `_additionalTimes`번,
    `_triggerDelta` 간격)대로 둘째 타격을 0.1초 뒤 같은 공격(`attackId`)으로 넣는다 — 그때 대상이 죽었거나 그녀가 행동할 수 없으면 없음. 이 키트에 남은 추정은 없다.
  - 모듈 INS-Y 「원거리 위치에 추가로 배치 가능」: 배치 효과라 위수협의가 끈다(`shared/highGround.js`, PRTS 卫戍协议/帮助 §战斗部署 「干员或召唤物的部署效果在此部署时不生效
    （…携带Y模组的教官仍无法部署至高台位）」 — 2026-11-15 플레이 제보 「Y 모듈인데 고지에 못 놓음」에 다시 확인, 그대로). 키트 주석의 upstream 쪽
    결정 인용을 이 근거로 바꿈. 동작은 같다(근접 칸만).
  - 화면용: S3 효과를 가진 아군의 버프에 상태 키 `pallas:blessing`을 붙여 공식 이펙트(`pallas_s_3[effect]` → `pallas_skill_03_buff_02`)를 그 아군에게 그린다
    (`public/js/render/fxstatus.js`). 시뮬 결과 그대로.
  - 화면용(2026-11-16): 기운 충만(精力充沛) 버프 `talent:pallas:peak`를 보이는 상태로 내고, `fxTag` 비트에 어느 출처의 조건이 맞는지(1 재능 1, 2 S3)를 싣는다. 공격력은
    그대로 높은 쪽 하나. 이펙트는 rules/fx.md 「팔라스 기운 충만 — 출처별 이펙트 (2026-11-16)」.
- 「미노스」 판정: 재능 1·INS-Y 추가 치유의 대상은 맹약이 아니라 소속 태그(국적·그룹·팀·하위 세력, `kits/shared/powers.js` `hasPower`; `sim.md` 「진영 판정은
  소속 태그」) — 팔라스 말고 하위 세력으로 미노스인 퍼퓨머(`char_181_flower`)·티티(`char_4056_titi`)도 받는다.
- 이펙트·공격 타이밍·투사체·스킬 시전 데이터: EN 클라에서 뽑음(2026-11-02, `tools/local-extract/add_operator.py --id char_485_pallas`). 화면 확인 전.
- 테스트: `test/content/op_pallas.test.js`(10 — 모든 폼, 세 스킬, 두 재능, 특성, 두 모듈, 실제 매치 경로 하나), 선발 수를 세는 테스트 11 → 12명, golden
  `diy-015`(그녀의 5티어 일반 칸이 함께 실림)·`diy-016`·`diy-017`(새 시나리오), 다른 가족 변화 없음.

## 선발 추가 헬라그 (2026-11-02, 관리자 결정)
- 관리자 결정 2026-11-02: 선발에 헬라그(赫拉格 `char_188_helage`, 6성 가드 솔로블레이드)를 넣는다(`LOCAL_DIY_PICKS` 끝). 팔라스에 이어 다음 위수협의 시즌에
  나올 오퍼레이터를 upstream 선발 키트로 미리 넣는 둘째이고, 지금 시즌 선발에도 공개한다. 한국 서버에 있어 이름·문구는 KR 공식 표 그대로(헬라그 · 솔로블레이드 ·
  초승달 · 그믐달 · 보름달, 재능 달이 차면 별이 진다 · 운주유악, 모듈 '드러내지 않은 칼'(SBL-X) · '뜨거운 눈'(SBL-Y); `tools/i18n/build-ko-diy.mjs`).
- 데이터: CN 표 그대로. 모듈 둘, 소환물 없음. 맹약: 소속 태그는 우르수스(`powers`)인데 이번 시즌 우르수스 핵심 맹약이 없어 협방(`emptyShip`).
- 키트·테스트: upstream 순서형 피해 판정 커널 직전 판(`9a3a12ee9^`)의 `op-helage.js`·`test/content/op_helage.test.js`. 그 뒤 upstream이 두 파일을 바꾼 커밋은
  없다. 바꾼 것:
  - S3 자동 발동은 `sim.md` 「스킬 범위 발동」: S3 레벨에 rangeId가 없어 공격·저지 상태일 때 켜진다. upstream 테스트의 `ACTIVE_RANGE` 단언(늘어난 범위에만
    적이 있어도 켜짐)을 `DEFAULT` + `triggerGrid` 없음으로 고치고, 늘어난 칸에만 적이 있으면 켜지지 않음을 확인한다.
  - S1·S2의 둘째 타격: upstream은 두 타격을 한 순간에 넣었다. 공식 클라에서 둘 다 `MultiMeleeAttack`(S1 `skchr_helage_1`, S2 모드의 공격)이고
    `_additionalTimes` 1·`_waitAttackEventForAllAttacks` 켜짐, 클립에 OnAttack 이벤트가 둘씩 있다(`Skill` 0.567·0.7초, `Skill_2` 0.6·0.667초) → 둘째
    타격을 둘째 이벤트 때(S1 0.133초, S2 0.067초 뒤) 같은 공격(`attackId`)으로, 그때 대상이 살아 있고 그가 행동할 수 있을 때만 넣는다(팔라스 S1과 같은 틀)
    — 공식 클라에서 확인(2026-11-03): 플래그가 켜지면 타격 사이 대기는 `_triggerDelta`가 아니라 클립의 다음 공격 이벤트(`MultiMeleeAttack`의
    전딜·타격 간격 대기, 상한 클립 길이).
  - 재능 2 운주유악의 회복은 공식 클라에서 확인: 재능 2가 `ToggleablePassiveBuffAbility`, 검사기 `BlockedToggleChecker`(저지 수 0~0일 때 켜짐 — `_CheckCondition`
    `LoadData`), 버프 `helage_t_2[a]` 하나가 블랙보드 값으로 속성 `HP_RECOVERY_PER_SEC`(13)를 올린다 → 치료가 아니라 생명 회복 속도(`SIM.md` §4). upstream의
    추정 표시를 지움.
  - SBL-Y 3단계 「적을 저지하지 않거나 HP 30% 미만일 때」: 둘이 동시에 성립해도 90/초 한 번 — 공식 클라에서 확인(2026-11-03): 모듈이 재능 키 `10`을
    덮어쓰는 장비 프리팹 `helage_equip_2_2_p2`·`_2_3_p2`(`[uc]equips`)가 재능 2와 같은 버프 `helage_t_2[a]`(속성 `HP_RECOVERY_PER_SEC`, 최대 1중첩) 하나를
    검사기 하나로 켜고 끈다 — 두 조건이 한 버프.
  - 화면용: S2 버프의 공식 이펙트 `common_ignite_attack`(공용 번들, `overrideEffectKey`)을 그의 이펙트 묶음에 넣음(`fx_extract.py --pack`). S2와 S3는 공식에서 같은 버프
    키 `helage_s_2`를 쓰고 이펙트만 다르다(S3 `helage_skill_03_buff`).
- 이펙트·공격 타이밍·투사체·스킬 시전 데이터: EN 클라에서 뽑음(2026-11-02, `tools/local-extract/add_operator.py --id char_188_helage`). SBL-Y 「쓰러지지 않음」의
  공식 이펙트(`helage_trait_e[heal]` → `uniequip_002_musha_02`)와 모듈 장비 배치 이펙트(`equipment_system_musha_buff_x`·`_y`)는 2026-11-03부터 그린다
  (`fx.md` 「모듈 장비 배치 이펙트·선발 키트 순간 이펙트」). 화면 확인 전.
- 테스트: `test/content/op_helage.test.js`(11 — 모든 폼, 세 스킬, 두 재능, 특성, 두 모듈, 실제 매치 경로 하나), 선발 수를 세는 테스트 12 → 13명, golden
  `diy-017`(그의 5티어 칸이 함께 실림)·`diy-018`·`diy-019`(새 시나리오), 다른 가족 변화 없음.

## 선발 추가 만트라 (2026-11-03, 관리자 결정)
- 관리자 결정 2026-11-02(새 시즌 알려진 명단의 upstream 선발 키트를 차례로 넣고 지금 시즌에도 공개): 선발에 만트라(真言 `char_4204_mantra`, 6성 캐스터
  프라이멀 캐스터)를 넣는다(`LOCAL_DIY_PICKS` 끝). 팔라스·헬라그에 이은 셋째. 한국 서버에 있어 이름·문구는 KR 공식 표 그대로(만트라 · 공명붕괴 · 의식 연계 ·
  침묵이 곧 진실, 재능 묵음의 속박 · 전반적 통찰, 모듈 '중추신경 탐지 모듈'(PRI-X); `tools/i18n/build-ko-diy.mjs`).
- 데이터: CN 표 그대로. 모듈 하나, 소환물 없음. 맹약: 사르곤(`sargonShip`, 소속 태그 `sargon`).
- 키트·테스트: upstream 순서형 피해 판정 커널 직전 판(`9a3a12ee9^`)의 `op-mantra.js`·`test/content/op_mantra.test.js`. 그 뒤 upstream이 두 파일을 바꾼 커밋은
  없다. 바꾼 것:
  - S3 자동 발동은 `sim.md` 「스킬 범위 발동」: S3 레벨의 rangeId `3-17` 상자에 선택 가능한 적이 있으면 켜진다(데이터 `DEFAULT` + `customRangeGrid`). 동작은
    upstream과 같고, 테스트의 `ACTIVE_RANGE` 단언을 `DEFAULT` + `triggerGrid` = 그 상자로 고쳤다.
  - S3 【마비 부여】(麻痹付与)는 그녀가 **선택할 수 있는** 적만 받는다: PRTS 비고 「在范围内不存在可选敌方单位时保留可付与次数」, 이 문서 체크리스트 「대상
    선택」(`canTargetEnemy`). upstream은 범위 칸의 숨지 않은 적 모두(선택 불가·수면 포함)에게 주었다. 은신 적은 S3 중 범위에서 드러나므로(【反隐】) 받는다.
    테스트에 선택 불가 적 하나를 더해 확인.
  - 재능 1 묵음의 속박 「麻痹不消耗效果在同类效果中取概率最高」 — 만트라 둘이 한 적에게 걸면 한 번만, 높은 확률로 굴리고 피해는 각자: 공식 클라에서 확인 →
    upstream의 추정 표시를 지움. 마비 템플릿 `palsy[stack]`이 끊긴 공격마다 `DiceByBuffKeys`(`palsy_prob_retain`, `prob`, 반전) 하나를 굴린다
    (`Entity.GetBuffValueMultiplierByKeyFromAllBuffs` — 켜진 버프만 곱함). 그녀의 `palsy_prob_retain`은 덮어쓰기 그룹 DEFAULT(`overrideType` 0)라 한 그룹에 켜진
    버프가 하나(`Buff.OverrideGroup._DoUpdateInternal`: 큐 순서로 끝나지 않은 첫 버프만 켬)이고 `priorityBBKeys` `prob`로 줄을 세운다(그 정렬은 확인 안 함 —
    PRTS 「取概率最高」와 같음). 피해 버프 `mantra_t_1`(`ON_TRIGGER_PALSY` → `AdvancedApplyDamage` ELEMENT)은 `disableOverride`라 만트라마다 하나씩 켜진다.
  - S2 의식 연계의 첫 탄은 S2 모드의 공식 투사체(`projectile_chr_mantra_s2`, 초당 10칸 — 추출 데이터 `shot`, 비고와 같음). upstream은 엔진 기본 탄(11)이었다.
  - S2 튕김의 다음 대상 = 2.0칸 안에서 아직 안 맞은 가장 가까운 적: 공식 클라에서 확인 → upstream의 추정 표시를 지움. 투사체 `projectile_chr_mantra_s2`의
    `BounceHitBehaviour.DoSelectTargetToHit`가 마지막 대상 자리에서 자기 선택기를 부르고, 그 선택기는 `NearestRangeSelector`(적·지상공중)로
    `DoFindTargets_DISPOSE`가 범위의 적을 그 자리와의 거리로 정렬(`LegacySort`, 자리를 잡은 비교 — 비교 함수 본문은 안 읽음)한 뒤 수를 자른다. 이 키트에 남은 추정은 없다.
- 이펙트·공격 타이밍·투사체·스킬 시전 데이터: EN 클라에서 뽑음(2026-11-03, `tools/local-extract/add_operator.py --id char_4204_mantra`). 재능 1 피해는
  공식 이펙트를 그린다: 템플릿 `mantra_t_1`(ON_TRIGGER_PALSY)의 `mantra_bounce_hit_01`을 마비가 끊은 적에게(키트 피해 `moment` → `render/fx/kitofficial.js` `hit`).
  키트 사건 `mantraGate`·`mantraGrant`·`mantraArc`는 지금 절차 이펙트(`render/fx/kinds.js`). 그녀의 맞춤 트리거 소리 6개(`mantra_t_tile`·`mantra_s_1_proj_*`·
  `mantra_s_2_proj_*`·`mantra_s_3_element`)는 아직 안 울린다(`test/audio-bank-coverage-list.js` `todo`). 화면 확인 전.
- 테스트: `test/content/op_mantra.test.js`(11 — 모든 폼, 세 스킬, 두 재능, 특성, 모듈, 실제 매치 경로 하나), 선발 수를 세는 테스트 13 → 14명(설정 가능한 오퍼레이터 수의 범위 `test/match/potential.test.js` 110~135), golden
  `diy-019`(그녀의 칸이 함께 실림)·`diy-020`(새 시나리오), 다른 가족 변화 없음.

## 선발 추가 스테인리스·하루카·나이팅게일 (2026-11-03, 관리자 결정)
- 관리자 결정 2026-11-02(새 시즌 알려진 명단의 upstream 선발 키트를 차례로 넣고 지금 시즌에도 공개)·2026-11-03(될 수 있으면 묶어서): 선발에 스테인리스(白铁
  `char_4072_ironmn`, 6성 서포터 기능공)·하루카(遥 `char_4202_haruka`, 6성 서포터 비호자)·나이팅게일(夜莺 `char_179_cgbird`, 6성 메딕 멀티 타겟 메딕)을 넣는다
  (`LOCAL_DIY_PICKS` 끝). 한 묶음으로 넣은 까닭: 스테인리스 S3의 게(글룸핀서호 - 프로토타입)를 자동 발동이 적으로 세는지 한 번에 확인(하루카 키트에 그 표시가
  있었음), 나이팅게일은 단순해서 얹음. 셋 다 한국 서버에 있어 이름·문구는 KR 공식 표 그대로(`tools/i18n/build-ko-diy.mjs`): 스테인리스 · 극한 화력 · 고효율 보급 ·
  글룸핀서호 - 프로토타입, 재능 전장 엔지니어 · 경비 절약, 모듈 글룸핀서호 - 크롤러(CRA-X) · 하이버리의 낙인(CRA-Y), 소환물 스테인리스™ 멀티 플랫폼 ·
  글룸핀서호 - 프로토타입 / 하루카 · 밤의 파울비스트 · 틈새의 반딧불 · 늦여름의 린수, 재능 빛나는 비눗방울 · 솟구치는 불꽃, 모듈 뒤늦은 기념(BLS-Y) /
  나이팅게일 · 치료 강화 γ · 아츠 실드 · 성역, 재능 하얀 악마의 가호 · 덧없는 환상, 모듈 '갇혀버린 희망'(RIN-X) · '밤의 노래'(RIN-Y), 소환물 환영.
- 데이터: CN 표 그대로. 맹약: 스테인리스 빅토리아(`victoriaShip`), 하루카(소속 태그 `higashi`)·나이팅게일(국적 없음)은 이번 시즌 핵심 맹약이 없어 협방(`emptyShip`).
  소환물 4(환영, 장치 셋) — 웹 모델이 없어 EN 클라에서 뽑음(`tools/local-extract/extract.py TOKEN_SPINES`).
- 키트·테스트: upstream 순서형 피해 판정 커널 직전 판(`9a3a12ee9^`)의 `op-ironmn.js`·`op-haruka.js`·`op-cgbird.js`와 테스트 셋. 그 뒤 upstream이 이 파일들을
  바꾼 커밋은 없다. 나이팅게일 키트는 upstream 샤이닝 키트(`op-shining.js`, 우리 선발 아님)의 도우미 둘(사거리 오라·보호막)을 가져다 써서 그 둘만
  `kits/shared/barrier.js`로 옮겼다. 바꾼 것:
  - **게를 적처럼 세는 자동 발동**(공식 클라에서 확인 — `sim.md` 「스킬 범위 발동」의 게 줄): 게 토큰 프리팹이 `_sideType` ENEMY·`_category` DEFAULT라 자동
    조작 상자의 적 옵션에 걸린다 → rangeId 상자는 치유 스킬도 게를 세고, rangeId가 없으면 게를 치는 유닛(공격 상태)이 켠다. 엔진 `skills.js _allyTargetIn`.
    upstream의 「치유 스킬·자기 공격 아닌 스킬은 빼고 키트가 `allyTargets`로 고름」(그쪽 관리자 규칙)과 하루카 키트의 `allyTargets: false` 셋은 받지 않음.
    시험은 스테인리스 테스트의 새 줄(백철 S3·나이팅게일 S3 y-4 상자·하루카 S1은 켜지고, 나이팅게일 S1은 환자가 없어 안 켜짐 — 엔진 변경 없이 실패하는 것 확인).
  - 하루카 S3(rangeId y-8)·나이팅게일 S3(y-4)의 자동 발동: 데이터 `DEFAULT` + 그 상자. upstream 테스트의 `ACTIVE_RANGE`(그쪽 관리자 규칙 — 나이팅게일 S3는 「상자
    안 다친 아군」)를 고침: 나이팅게일 S3도 상자 안 **선택 가능한 적**이 있어야 켜진다(치유 스킬도 적을 셈 — 위 규칙). 하루카 S1·S2, 나이팅게일 S1·S2(AUTO)는
    그대로.
  - 하루카 S2 틈새의 반딧불의 추가 아츠 피해 대상 순서: 스킬 프리팹 `skchr_haruka_2`의 능력 `ExtraSelect` 선택기가 `_postFilter` HATRED_DES(4)라
    도발 높은 적, 그다음 출구에 가까운 적(`Enemy.get_hatred` — `sim.md`에 이미 있는 정의). upstream은 「치유 대상에 가까운 순」 추정이었다. 테스트에 도발이
    높은 먼 적을 하나 더해 확인. 같은 위협도의 순서(출현 순)는 그 정의대로 [추정·엔진].
  - 나이팅게일 S2 아츠 실드: 보호막마다 버프 `cgbird_s_2` 하나(템플릿 `shield_magic` — 아츠 피해 `BlockDamage`, 0이 되면 `FinishBuff`)에 마법 저항 속성
    (`attributeType` 3, 블랙보드 값)이 함께 들어 있고 덮어쓰기 그룹은 DEFAULT(`maxStackCnt` 1) — 그룹에서 큐 순서로 끝나지 않은 첫 버프만 켜지므로
    (`Buff.OverrideGroup._DoUpdateInternal`, 위 「선발 추가 만트라」와 같은 근거) 저항 보너스는 보호막이 하나라도 남아 있는 동안 하나: 공식 클라에서 확인 → upstream의 추정 표시를 지움(동작 같음).
- 하루카의 비눗방울은 그녀가 떠나도 남는다(공식 클라에서 확인, 2026-11-03): 재능 능력(`Talents/1`)의 버프 `haruka_t_1`는 수명 `INFINITY`, 버프 템플릿에
  주인 쪽 이벤트가 없고, 능력은 제 주인에게 건 패시브 버프만 들고 있어(`Ability.m_passiveBuffUids`) 남에게 준 버프를 주인 퇴장 때 걷는 길이 없다.
- 키트 주석에 남은 추정:
  - 스테인리스 장치 재고: 배치마다 재능 +cnt(`charge_token[born]`, ON_OWNER_BORN), 그 뒤 CRA-X의 특성 능력이 붙으며 +1(`trigger_charge_token`), 상한 cnt + CRA-X 1, 상한을 넘는 수는 버림(`Deck.TokenCard.Recharge`가 상한으로 자름) — 공식 클라에서 확인(2026-11-11, 차례는 로베르타 줄). 배치 전 카드에서 도는 CRA-X 한 번은 배치 때 상한에 묻힌다.
  - 게가 SP를 받는 공격: 게를 고른 평타만이 아니라 우리 편의 모든 적 선택자(범위 스킬·스플래시·소환물 공격)가 게를 고른다 — 공식 클라에서 확인
    (2026-11-11, `TargetOptions.VerifyTarget`은 유닛의 `_side`만 봄; 관리자 결정 2026-11-11 「공식대로」, 엔진 변경은 `sim.md` 「스킬 범위 발동」 게 줄).
    게는 `untargetable` 대신 `enemyCamp` 깃발로 적의 선택에서 빠진다.
- 쓰러진 소환물의 복귀(관리자 결정 2026-11-03 「공식대로」, 공식 클라에서 확인): 위수협의 자동 배치(`AutoChessBattleTrigger._TryDeployAvailableCharacter`)는
  정비 때 놓인 말마다 그 카드의 `readyToSpawn`을 묻는다 — 토큰 카드(`Deck.TokenCard`)는 최대 배치 수 미만, 그리고 기본 카드 검사: 숨김 아님(남은 장수
  `remainingCnt` > 0, 주인 생존 `m_hostIsAlive`), 상태 READY·QUEUING(재배치 시간이 지남), DP 충분 — 이면 `_AutoDeploy`가 `freely: false`로 한 장을 쓴다.
  장치 셋·환영·사일런스 드론·망의 바둑돌 모두 카드 정책 `DEFAULT`(토큰 프리팹 `_cardPolicy` 0). 그래서 스테인리스 장치·나이팅게일 환영은 **재고 하나를 쓰고
  DP를 내며 재배치 시간 뒤, 주인이 서 있을 때만** 자기 칸에 돌아온다. 바꾼 것: 나이팅게일 환영이 그녀가 쓰러져 있어도 돌아오던 것(upstream) → 그녀가
  다시 설 때까지 기다림(사일런스 드론·스테인리스 장치와 같음). 떠난 토큰의 카드 장수는 어떤 이유로 떠나도(쓰러짐·철수·발동 소모) 돌아오지 않는다
  (2026-11-11 공식 클라에서 확인): `BattleController.OnCharacterFinished` → `Deck.RecycleCard` → 카드의 `OnRecycle` — `Card.OnRecycle`은 재배치 타이머만
  다시 걸고, `TokenCard.OnRecycle`은 필드 수(`m_spawnedCnt`)만 줄인다; 위수협 모드(`AutoChessGameMode`)는 카드 회수 훅을 덮어쓰지 않는다. 장수는
  `Card.Draw`가 무한 카드(`isInfinity`)가 아니고 무료 배치(`freely`)가 아닐 때 하나 줄인다. 그래서 망의 바둑돌도 복귀 때 재고 하나를 쓴다(관리자 결정
  2026-11-11 「공식대로」 — 아래 「망」 줄).
- 이펙트·공격 타이밍·투사체·스킬 시전·모드·HUD 데이터: EN 클라에서 뽑음(2026-11-03, `tools/local-extract/add_operator.py --id …` 세 명 한 번). 장치 이펙트
  (`token_ironmn_pile*`)는 공용 토큰 팩에서, 나이팅게일 S1의 `common_ignite_support`는 공용 번들에서 따로(`fx_extract.py --pack`). 화면 확인 전.
  하루카 비눗방울 깨짐의 `haruka_talent_02_hit`·스테인리스 장치 회수의 `ironmn_beidong_buff`는 2026-11-03부터 그린다(`fx.md` 「모듈 장비 배치 이펙트·선발 키트
  순간 이펙트」 — 회수 사건은 `spGift`에서 `kitHit` `ironmn_t_2`로).
- 테스트: `test/content/op_ironmn.test.js`(13)·`op_haruka.test.js`(10)·`op_cgbird.test.js`(11) — 모든 폼, 세 스킬, 두 재능, 특성, 모듈, 소환물, 실제 매치 경로 하나씩(upstream 테스트에 없어 더함);
  선발 수를 세는 테스트 14 → 17명(소환물 6 → 10, 폼 85 → 94), golden `diy-021`~`diy-026`(새 시나리오), 다른 가족 변화 없음.

## 선발 추가 페넌스·로고스·비비아나 (2026-11-03, 관리자 결정)
- 관리자 결정 2026-11-02(새 시즌 알려진 명단의 upstream 선발 키트를 차례로 넣고 지금 시즌에도 공개)·2026-11-03(될 수 있으면 묶어서): 선발에 페넌스(斥罪
  `char_4065_judge`, 6성 디펜더 불굴자)·로고스(逻各斯 `char_4133_logos`, 6성 캐스터 코어 캐스터)·비비아나(薇薇安娜 `char_4098_vvana`, 6성 가드 아츠 파이터)를
  넣는다(`LOCAL_DIY_PICKS` 끝). 한 묶음으로 넣은 까닭: upstream의 순서형 피해 판정 커널에 묶인 7명 중 셋 — 커널 직전 판을 우리 `damage.js`로 돌릴 때 같은 덫·같은
  피해 경로를 한 번에 대조. 셋 다 한국 서버에 있어 이름·문구는 KR 공식 표 그대로(`tools/i18n/build-ko-diy.mjs`): 페넌스 · 최종 판결 · 결의에 찬 고행 · 고난 극복,
  재능 율법 수호자 · 가시의 고리, 모듈 계속되는 가시밭길(UNY-X) · '무죄'(UNY-Y) / 로고스 · 몰망 · 제유 · 확장 시야, 재능 어휘의 진화 · 영혼을 도려내는 말, 모듈
  협곡에서 온 필통(CCR-Δ) · 《의미 범주 백과사전》(CCR-Y) / 비비아나 · 찰나의 그림자 칼날 · 촛불의 그림자 · '명멸', 재능 캔들라이트 · 노바, 모듈 눈이 닿지 않는
  곳(AFT-D) · '마지막 한 줄'(AFT-Y).
- 데이터: CN 표 그대로. 맹약: 페넌스 시라쿠사(`siracusaShip`), 비비아나 카시미어(`kazimierzShip`), 로고스(소속 태그 로도스·엘리트·바벨)는 이번 시즌 핵심 맹약이
  없어 협방(`emptyShip`). 소환물 없음.
- 키트·테스트: upstream 커널 직전 판(`9a3a12ee9^`)의 `op-judge.js`·`op-logos.js`·`op-vvana.js`와 테스트 셋. 커널 직전 판은 우리 `damage.js`의 `dealDamage`로
  돌고, 실패한 6개는 모두 우리 규칙·엔진과 다른 테스트 쪽이었다(피해 경로 차이 없음). 바꾼 것:
  - **자동 발동**(`sim.md` 「스킬 범위 발동」·「중장 스킬 공식 TAKE_DAMAGE」): 페넌스 S2·S3는 중장 TANK 행 `TAKE_DAMAGE`(upstream 테스트의 「중장 예외 →
    DEFAULT」는 그쪽 관리자 규칙 — 관리자 결정 2026-10-28로 예외 없음). S3는 SP를 채우는 피격이 바로 켬(사거리 무관). 로고스 S3는 데이터 `DEFAULT` + rangeId
    3-4 상자(upstream 테스트의 `ACTIVE_RANGE`). 비비아나 S3는 **모든 시전이** 데이터 `DEFAULT` + rangeId 1-1 상자: 공식 `_DefaultTriggerSkill`은 스킬 데이터의
    rangeId를 보고(공식 클라에서 확인), 둘째 시전부터의 3-2는 모드 4의 범위라 상자를 바꾸지 않는다 → upstream의 「첫 시전 뒤 3-2에서 `ACTIVE_RANGE`」(그쪽 관리자
    규칙)를 지움.
  - 페넌스 재능 1 보호막은 **다른 보호막을 다 쓴 뒤에** 깎인다: PRTS 「生效优先级为-1000」, 공식 클라는 버프를 우선순위 내림차순·같으면 얻은 순으로 돌린다
    (`Buff.CompareTo`, 공식 클라에서 확인). 엔진에 버프 `shieldLast`(`buffs.js`, `damage.js absorbShields`의 둘째 차례)를 더함 — 다른 보호막은 그대로 먼저 얻은 순.
    upstream은 엔진 순서(먼저 얻은 순)로 두고 추정 표시.
  - 페넌스 재능 2 가시의 고리의 반사 피해는 **적의 회피에 걸린다**: 공식 `InverseDamage`가 만드는 조정값은 `ignoreMissFlag`·`ignoreCancelReasonMask`가 0(공식
    클라에서 확인 — 레이드 「碎铳之簧」 반격과 같은 결론, `sim.md`). upstream은 「호시구마 반격처럼 회피 불가」 추정.
  - 페넌스 S1 대상이 사라진 시전: 엔진 규칙 그대로(`ai.js dropNextAttack` — 헛친 휘두름은 소모, 다시 고르는 공격이 아무도 못 찾으면 충전 반환). upstream 주석의
    「근접 시전과 공격이 한 틱에 끝나 반환 미구현」은 휘두름 모델 이전 이야기라 지움.
  - **로고스 재능 1 어휘의 진화의 추가 타격은 투사체**: charpack 재능 버프 `logos_t_1`의 블랙보드가 투사체 `projectile_chr_logos_t`(PARACURVE, 초당 8칸)와 능력
    `LogosT1Attack`을 이름으로 주고, 그 능력의 선택기는 `RandomSelector`(적, 지상·공중, 하나)·`_excludeTarget` 꺼짐 → 사거리 안 선택 가능한 적 중 무작위,
    방금 공격한 적도 뽑힘(upstream 추정 표시를 지움). 피해는 쏠 때의 공격력(`_cacheAtkToActions`), 맞을 때 법술 피해 + 정지. upstream은 즉시 타격.
  - **로고스 S1 몰망의 후속 타격**: 버프 `logos_s_1[kill]` 순서 = 처형 → 적이 **쓰러졌을 때만**(`CheckUnitAlive` → `IfNot`) 재능 1 굴림(`TriggerBuffsByKeys`) →
    쓰러진 적의 자리에서 투사체 `projectile_chr_logos_s1_2`(PARACURVE, 초당 3칸)가 사거리 안 무작위 적(`LogosS1KillAttack`, `RandomSelector`)에게 남은 HP만큼
    법술 피해. upstream은 버틴 적(불사·횟수 제한)에게도 후속 타격을 즉시 쐈다.
  - 로고스 S2 제유의 고정 공격은 투사체 없는 즉시 타격: S2 모드 공격 능력에 투사체 키가 없다(upstream 「조준 광선」 추정 → 확인).
  - 로고스 S2의 휘두름 시점: S2 모드 공격 능력은 클립이 없고 `_preDelay` 0.466초뿐 — 공식 `UpdatePlaybackSpeed`는 클립 없는 능력을 공격 간격에 맞춰 늘이지 않는다
    (공식 클라에서 확인). 엔진은 그 자리 기록(길이 1)을 간격 1.6초로 늘여 타격이 0.75초 뒤·휘두름 1.6초가 되어 「간격
    0.5초 고정」이 깨진다 → 키트가 S2 휘두름마다 타격을 0.466초 뒤, 길이를 0.5초로 고정하고, 다음 휘두름을 앞 휘두름 시작 0.5초 뒤에(공격 속도 무관). 클립 없는 공격
    능력은 다른 오퍼레이터에도 29개(만트라 S2 등) — 엔진 전반으로 바꾸면 golden이 움직여 관리자 결정 거리로 남김.
  - 로고스 S3 확장 시야가 늦추는 투사체는 적 쪽 투사체 전부: 스킬 프리팹 `ProjectileAura` 검사기가 적 쪽만 보고 종류·키를 거르지 않는다(upstream 추정 → 확인). 늦춰진 탄의 수명·이동 조정 가능 여부는 `sim.md` 「`moveScale`」.
  - 비비아나 재능 2 노바의 근접 전용 보호막: 적 콘텐츠가 직접 쏘는 투사체(가상적 비행기 폭탄·리더 곡사 등)도 원거리 경로로 셈 — 엔진이 투사체가 맞을 때 준
    피해에 `isProjectile`을 붙인다(`projectiles.js landing`, `damage.js`; PRTS 작전 기제 「有弹道的攻击固定为10，无弹道的攻击固定为01」). upstream은 엔진 사격만
    표시하고 나머지는 근접 추정. `isProjectile`을 읽는 곳은 이 보호막뿐이라 다른 전투는 그대로.
  - 테스트 쪽: 비비아나 테스트의 칸 번호를 열 수 21 고정 → `COLS`(우리 넓은 판), 로고스의 枯朽之种 시험을 우리 모델(자폭이 일반 공격 — 휘두름 동안은 표적이 되는
    적)로 다시 씀. 셋 다 실제 매치 경로 시험을 더함(upstream 테스트에 없음).
- 남은 추정: 로고스 S3 [추정·엔진: 그가 쓰러질 때 늦춘 투사체를 지우는지 — 스킬 버프의 끝(`CheckCanUseAtkOrCbt` 갈래)이 쓰러짐에서 어느 쪽을 타는지 안 읽음;
  지금은 지우지 않음(무장 해제와 같음)].
- 이펙트·공격 타이밍·투사체·스킬 시전·모드·HUD 데이터: EN 클라에서 뽑음(2026-11-03, `tools/local-extract/add_operator.py --id …` 세 명 한 번). 화면 확인 전.
  키트 순간 이펙트(장벽 시작·깨짐, 반사, S2 펄스, 처형, 두 투사체, 고정 선, 디버프, S3 끝, 근접 보호막)는 `fx.md` 「선발 페넌스·로고스·비비아나 키트 순간 이펙트」.
- 테스트: `test/content/op_judge.test.js`(10)·`op_logos.test.js`(15)·`op_vvana.test.js`(14) — 모든 폼, 세 스킬, 두 재능, 특성, 모듈, 실제 매치 경로 하나씩(추출한 공격
  타이밍 뒤에는 「시전 뒤 N틱」이 아니라 「타격이 들어올 때까지」 기다림); 선발 수를 세는 테스트 17 → 20명(폼 94 → 103), 방향 슬롯 오퍼레이터 17 → 20.

## 선발 추가 벨로네·비이·지마 더 레이징 타이드·Mon3tr (2026-11-03, 관리자 결정)
- 관리자 결정 2026-11-02(새 시즌 알려진 명단의 upstream 선발 키트를 차례로 넣고 지금 시즌에도 공개)·2026-11-03(될 수 있으면 묶어서): 선발에 벨로네(贝洛内
  `char_4037_demetr`, 6성 가드 파이터)·비이(维伊 `char_4226_veen`, 6성 캐스터 미스틱 캐스터)·지마 더 레이징 타이드(怒潮凛冬 `char_1051_headb2`, 6성 가드
  어스셰이커)·Mon3tr(`char_4179_monstr`, 6성 메딕 체인 메딕)를 넣는다(`LOCAL_DIY_PICKS` 끝). 알려진 명단의 남은 upstream 선발 키트 넷을 한 묶음으로(같은 생성
  사슬·golden·선발 수 세는 곳). 넷 다 한국 서버에 있어 이름·문구는 KR 공식 표 그대로(`tools/i18n/build-ko-diy.mjs`): 벨로네 · 가주의 여유 · 참모의 수단 · 청산,
  재능 패밀리의 수법 · 거리의 직감, 모듈 실용적인 도구(FGT-Y) / 비이 · '부르짖음에서 탄생하라' · '선혈로 정화하라' · '적철에 새겨라', 재능 '칼을 휘두르기 전에' ·
  전쟁 기술, 모듈 무기고(MSC-Y) / 지마 더 레이징 타이드 · 굽힘 없는 긍지 · 꺾임 없는 집념 · 거침없는 기세, 재능 소용돌이 치는 분노 · 만인의 해일, 모듈 언이슈드
  메달(HAM-X) / Mon3tr · 책략: 초연결 · 책략: 과부하 · 책략: 용해, 재능 자가 복구 · 전술 협동, 모듈 기억 파일(XAH-X).
- 데이터: CN 표 그대로. 맹약: 벨로네 시라쿠사(`siracusaShip`), 비이·지마(우르수스)·Mon3tr(로도스)는 이번 시즌 핵심 맹약이 없어 협방(`emptyShip`). 소환물:
  벨로네의 결속(`token_10065_demetr_dmtpos`, S3가 두는 자기 물건 — 손패 아님, Spine 없음·이펙트 `demetr_skill3_token_01`), Mon3tr의 재구성체(`token_10050_monstr_prosts`,
  손패 1, 모델은 EN 클라 토큰 팩 `btl_pfb_tokens_0`, 이펙트는 `btl_pfb_fx_token_1`).
- 키트·테스트: upstream 커널 직전 판(`9a3a12ee9^`)의 `op-demetr.js`·`op-veen.js`·`op-headb2.js`·`op-monstr.js`와 테스트 넷. 실패 6개(1·2·0·3)는 모두 우리 자동 발동·
  시전 시점과 다른 테스트 쪽이었다. 바꾼 것:
  - **자동 발동**(`sim.md` 「스킬 범위 발동」): 벨로네 S2는 데이터 `DEFAULT` + rangeId 3-13 상자(upstream 테스트의 `ACTIVE_RANGE`), Mon3tr S2는 `DEFAULT` + y-2
    상자(upstream `SKILL_RANGE`), S3는 `DEFAULT` + x-4 상자 — 치료 스킬도 상자 안 **적**을 센다(upstream 테스트는 적 없이 켬). S3의 상자 중심은 2026-11-15부터
    그녀가 아니라 **재구성체 칸**(그녀가 옮겨 갈 칸): CN 유저가 공식 규정에서 「재구성체 주변 3×3에 적이 오면 켜짐」을 겪었다는 관리자 전달(2026-11-15)을 따라
    두 시즌 모두, 그녀 주변 상자 대신(관리자 결정 2026-11-15). 기본 전략만이면 공식 클라는 그녀 칸이 중심(`get_gridPosition`)이고, 규정 메딕 줄
    (`ATTACK_RANGE_ALLY + SKILL_RANGE_ALLY`)은 CN 클라만 읽는다. 엔진 `skills.js` `triggerAt`(키트가 상자 중심을 줌). 재발 방지: `test/content/op_monstr.test.js`
    「S3 automatic cast」. 다친 아군만 있고 상자에 적이 없으면 켜지 않는다 — 관리자 잠정 판단(2026-11-15, 추정), 메딕 줄의 아군 조건은 넣지 않음
    (같은 시험 파일 S3 줄의 「an injured ally, no enemy」). 상자는 2026-11-17부터 **지상 적만** 센다: S3 공격은 지상 적만 치므로 공중 적만 든 상자에서
    켜면 칠 대상 없이 스킬이 돈다(관리자 결정 2026-11-17 — 기본 전략의 상자는 지상·공중을 다 센다). 엔진 `skills.js` `triggerProfile`(키트가 상자의 적 조건을 줌).
    재발 방지: 같은 시험 파일 「S3 automatic cast counts ground enemies only」. [화면 미확인: 공식 녹화]
    비이 S2·S3는 rangeId 없는 `DEFAULT` → 공격 상태가 되는 순간(적이 사거리에 들어올 때), 그녀의 공격과 저장 에너지 발사 **앞**이다(테스트의 시점을 그에 맞춤).
    비이 S1·지마 S2는 자기에게 거는 AUTO 스킬이라 SP가 차면 바로(키트 README 체크리스트 5) — 두 스킬 프리팹 모두 `_trigger` 탐색이 없다(공식 클라에서 확인).
  - **벨로네 패밀리의 수법은 벨로네마다 따로 쌓인다**: 버프 템플릿 `demetr_t1[def_dec]`가 층·남은 시간을 출처별로 읽고(`CheckContainsBuff`·
    `AssignBuffBlackboardFromOthers`의 출처 거르기), 방어력 감소인 파생 버프 `demetr_t1[def_dec_core]`는 적마다 하나(`priorityBBKeys` def)라 가장 큰 감소만 듣는다
    (PRTS 「多个贝洛内之间的【手段】间仅防御减少量最高者生效」, 공식 클라에서 확인). 정지(停顿)는 누구든 S2 상한에 닿아 있는 동안. upstream은 층을 함께 쌓고
    큰 쪽 값으로 두고 추정 표시. 같은 판에 벨로네 둘은 공유 필드에서만.
  - 벨로네 S1 가주의 여유의 둘째 타격은 첫 타격 0.2초 뒤(스킬 프리팹 `MultiMeleeAttack` `_additionalTimes` 1·`_waitAttackEventForAllAttacks`, 클립 Skill_1의
    OnAttack 0.233·0.433초 — 헬라그 S1과 같은 꼴). upstream은 두 타격을 한 번에.
  - 벨로네 S2 참모의 수단의 공격은 투사체(`projectile_chr_demetr_s2`, 초당 10칸 — 추출한 S2 모드 사격)로 날아가 닿을 때 맞힌다(티피와 같은 꼴, `sim.md` 「오퍼레이터
    공격 형태」). upstream은 즉시 타격(추정 표시).
  - 벨로네 S3 청산이 끝나 돌아올 때(2026-11-11, 공식 클라에서 확인 — `DemetrS3CastSkill._RespawnToLocatedPos`): 정위치 칸에 서 있거나 그 칸에 자기 결속이 있으면
    그 자리에서 `RespawnEnd` 능력을 시전하고, 아니면 강제 철수. 시전 동안(클립 `Skill_3_ReStart_Begin` 0.2초 — `_timeMode` 0·`_maxAnimScale` 1이라 그의 공격 시간이
    더 짧을 때만 그 시간, `AbstractAnimatedAbility.UpdatePlaybackSpeed`) 버프 `demetr_s3[respawn_end]`(`BuffToOwnerDuringAbility` 시전 시작 → 시전 끝)로 무적·저지 없음·
    SP 회복 정지·스킬 사용 불가·기절과 빙결 면역(`abnormalImmunes`·`abnormalAntis`), 공격 없음. 시전 끝(`ActionToOwner` ON_CAST_END)에 결속을 거두고 정위치로 다시
    배치(SP 비움, 실패하면 즉사 — 결속이나 그가 칸을 지키므로 일어나지 않음)하며 보호도 그때 끝난다: 옮긴 뒤에는 보호가 없다. 이펙트·소리(`demetr_s3[effect_1]`, 'teleport'
    `back`)는 시전 시작에 그가 선 자리에서. 2026-11-03~11-11에는 끝나는 순간 옮기고 그 뒤 0.5초 보호(upstream은 0.5초 불사).
  - 비이 S3 '적철에 새겨라'의 튕김: 이 탄이 **맞힌 횟수가 가장 적은** 적부터, 지금 맞은 적은 다른 적이 닿는 곳에 없을 때만, 같으면 가까운 순
    (투사체 `projectile_chr_veen_s3` `_sortTargetsByHitCountAsc`·`_allowRepetitionIfNoTarget`, 공식 클라에서 확인). upstream은 「아직 안 맞은 적 → 다른 적 → 같은 적」
    (순서를 추정 표시).
  - 비이 재능 2 전쟁 기술의 5초는 중첩마다 새로(`veen_t_2[damage]` overrideType STACK·`clearAllStackCntWhenTimeUp`·`refreshRemainingTimeWhenStackMax`, `Buff._AddStack`은
    남은 시간을 큰 쪽으로 — 공식 클라에서 확인). 그녀는 자기 표식이 있는 적을 고르지 않는다(모든 모드 공격 선택기의 `_buffKeyExcluded` `veen_t_2[damage]`, 출처 거르기).
  - 비이의 저장 에너지와 지마 S2 꺾임 없는 집념의 「둘째 시전부터」는 배치마다 처음부터: 공식은 배치마다 새 유닛(`sim.md` 「누가 막나」 주기 — `OnAllocate` →
    `Character.OnReset`)이고, 지마 S2는 능력 `ActiveOneOfBuffAbility`가 시전 수(`m_spellCnt`)를 센다(공식 클라에서 확인). upstream은 둘 다 추정 표시.
  - **Mon3tr 치료 연쇄는 치료가 닿을 때 이어진다**: 그녀의 치료는 투사체(`projectile_chr_monstr`, 초당 10칸)라 연쇄도 그 착탄에서 — 엔진에 프로필 `afterHeal`(공격
    치료가 대상에 닿고 그 직군 연쇄가 끝난 뒤, `ai.js doHeal`)을 더하고 키트가 거기서 연쇄를 시작. upstream은 공격 순간(투사체 비행 전)에 연쇄.
  - Mon3tr 재구성체: 퇴장하면 재배치 시간 뒤 자기 칸에 DP를 내고 다시 놓인다 — 이 모드의 놓은 소환물 복귀(위 「선발 오퍼레이터」의 망 바둑돌 복귀, 0.2초 루프
    `AUTO_TRIGGER_INTERVAL`; upstream은 0.1초, 추정 표시). 주변 아군 공격력 오라는 매 틱(재구성체 Talents/1 `AuraAbility`에 간격 필드 없음, `AuraAbility.OnTick`;
    upstream 0.1초, 추정 표시).
  - Mon3tr S3 책략: 용해의 路标形态 표식(2026-11-15 고침, 관리자 제보 「에벤홀츠 S2 소환물이 Mon3tr 원래 칸을 차지하면 돌아가지 못함」): 공식은 이동을 마칠 때
    원래 칸에 路标形态 재구성체를 둔다(PRTS S3 비고 「完成移动时在原位置部署另一个路标形态的重构体作为【返回】移动的标志物」; PRTS 재구성체: 무적, 어느 진영도 고를 수
    없고 저지 0). 시뮬은 그 표식이 판에 하는 일만 둔다: 그녀가 떠나 있는 동안 그 칸을 그녀 몫으로 잡아(`Battle.holdTile` → `isReservedTile`) 소환물·장치·재배치가
    그 칸을 못 쓴다 — 에벤홀츠 S2 旧日残影도 적이 선 그 칸에 놓이지 않는다. 그래도 돌아갈 칸이 막히면 그녀는 쓰러진다(같은 비고 「不能返回的场合（地块已不合法/
    标志物已不存在）自身将被击倒」). 2026-11-03~11-15에는 표식이 없어 그 칸을 다른 소환물이 차지했고 그녀는 제자리에 남았다.
    재발 방지: `test/content/op_monstr.test.js` 「S3 路标形态」.
  - 테스트 쪽: 넷의 upstream 테스트가 살아 있는 유닛을 `assert.deepEqual`/`equal`에 넘기던 곳을 id·`===` 비교로(CONTRIBUTING §6), 추출한 공격 타이밍·투사체 뒤에는
    「N초 뒤」가 아니라 「타격·치료가 들어올 때까지」 기다림. 넷 다 실제 매치 경로 시험을 더함(upstream 테스트에 없음).
- 남은 추정:
  - 벨로네 S1 둘째 타격 시점은 공식 클라에서 확인(2026-11-03, 위 「선발 추가 헬라그」와 같은 `_waitAttackEventForAllAttacks` — 클립의 다음 공격 이벤트); S3 이동은 클립 `Skill_3_ReStart_Begin` 끝(0.2초, `sim.md` 「즉발 스킬의 시전」, 2026-11-05 공식 클라에서 확인); 복귀 보호의 길이와 차례는
    위 「돌아올 때」(2026-11-11 공식 클라에서 확인).
  - 지마 S3 거침없는 기세: 망치 스플래시 몫은 블랙보드 `atk_scale_2`(없으면 `_splashAtkScale` 1) × 능력의 `atk_scale`(곱 — `MultiMeleeAttackWithSplashDmg.DoSetData`,
    2026-11-11 공식 클라에서 확인). 확산의 「인접」은 상하좌우 4칸(`Headb2AttackHighlandAOEBase._GetNeighborTiles`, 같은 날 확인 — 키트 그대로).
    [추정·미조사: 특성의 `attack@atk_scale_2`(0.5)가 S3 능력의 블랙보드에 들어가는지 — 그 블랙보드는 스킬 표 블랙보드 + 재능의 `skill@` 키인데, 같은 능력의 고지대 AoE가
    재능 1의 `attack@splash_atk_scale`을 거기서 읽으므로 들어가는 길이 따로 있을 것; 못 들어가면 몫은 1(지금의 두 배). 그 타격이 일반 공격으로 세는지(`useDynamicAttackType`)도 안 읽음]
    기절·빙결·수면은 스킬을 끝내고 남은 망치도 사라진다(2026-11-05, 공식 클라에서 확인): 망치 다섯은 묶음이 아니라 능력 하나(`headb2_s3`, `_additionalTimes` 4)라, `SkillState.OnTick` → `BasicSkill.InterruptIfNot`이 그 능력을 끊으면 다음 망치가 없고, 능력이 시전 중이 아니니 `BasicSkill.OnTick`이 스킬을 끝낸다(`rules/sim.md` 「즉발 스킬의 시전」의 순차 묶음과 다름). 끊겼을 때 표시·동작은 공식 화면과 대조 안 함.
- Mon3tr의 연쇄 튕김은 치료 금지(禁疗)·고립(孤立) 아군도 고르고 치료한다(2026-11-03, 공식 클라에서 확인): 그녀 치료 투사체의 튕김 선택기
  `ChainedSelectorWithFilter`는 `_ignoreHealFree`·`_ignoreAllyTargetFree`가 켜져 있고, 대상 검사(`TargetOptions`)는 그 옵션이 켜지면 禁疗(치료 목적일 때)·
  아군 대상 불가(이상 상태 `ALLY_TARGET_FREE`) 거름을 건너뛴다 → 엔진 `ai.js chainHealNext`의 옵션 `ignoreAllyTargetFree`(키트 `JUMP_OPTS`)로 孤立 아군을
  고른다. 禁疗 쪽도 같다: 옵션 `ignoreHealFree`로 `noHeal` 깃발 아군을 고르고 치료한다(2026-11-07, `rules/sim.md` 「치료 금지와 孤立」).
- 이펙트·공격 타이밍·투사체·스킬 시전·모드·HUD·모듈 배치 이펙트 데이터: EN 클라에서 뽑음(2026-11-03, `tools/local-extract/add_operator.py --id …` 네 명 한 번,
  `fx_extract.py --equips`). 화면 확인 전. 미연결 이펙트 11줄·비이 저장 탄·`Charge` 클립은 2026-11-03에 이음(`fx.md` 「선발 벨로네·비이·Mon3tr 키트 순간 이펙트」); 소리(20)·클립(14)은 목록 시험의 todo.
- 테스트: `test/content/op_demetr.test.js`(12)·`op_veen.test.js`(9)·`op_headb2.test.js`(11)·`op_monstr.test.js`(11) — 모든 폼, 세 스킬, 두 재능, 특성, 모듈, 실제 매치
  경로 하나씩, 벨로네 둘의 패밀리의 수법; 선발 수를 세는 테스트 20 → 24명(폼 103 → 115), 소환사 7 → 9(손패 시험에 Mon3tr), 토큰 모델 15 → 16, 방향 슬롯
  오퍼레이터 20 → 21(지마 S3 다섯째 망치).

## 선발 추가 슈·리·유넥티스·에벤홀츠 (2026-11-04, 관리자 결정)
- 관리자 결정 2026-11-02(새 시즌 명단의 upstream 선발 키트를 차례로 넣고 지금 시즌에도 공개)·2026-11-03(될 수 있으면 묶어서)·2026-11-04(새 시즌 핵심
  맹약 명단에서 새로 나온 upstream 선발 키트 열 명 가운데 실패가 적은 넷부터): 선발에 슈(黍 `char_2025_shu`, 6성 디펜더 가디언)·리(老鲤 `char_322_lmlee`,
  6성 스페셜리스트 상인)·유넥티스(森蚺 `char_416_zumama`, 6성 디펜더 결전자)·에벤홀츠(黑键 `char_4046_ebnhlz`, 6성 캐스터 미스틱 캐스터)를 넣는다
  (`LOCAL_DIY_PICKS` 끝). 한 묶음으로 넣은 까닭: 넷 다 손볼 곳이 자동 발동 덮어쓰기뿐이고 실패가 적었다(2·1·1·0). 이름·문구는 KR 공식 표 그대로
  (`tools/i18n/build-ko-diy.mjs`): 슈 · 은택 받은 초목 · 가득 쌓인 곡식 · 우거진 성쇠, 재능 백곡장청 · 천유사시, 모듈 '시간 제정에 관해'(GUA-X) / 리 · 일벌백계 ·
  축귀벽사 · 귀빈내방, 재능 화기생재 · 유비무환, 모듈 '길흉불문'(MER-X) · '단사선악'(MER-Y) / 유넥티스 · 경량형 도끼 · 위압적인 내려찍기 · 강철의 의지, 재능
  용감무쌍 · 임전무퇴, 모듈 주마마 공구 상자(HES-X) · '작고 못생긴 것'(HES-Y) · 유넥티스의 특별 한정 배지(RA-A) / 에벤홀츠 · 급속 변주 · 황량한 메아리 · 침묵의
  소리, 재능 셈여림표 · 꾸밈음, 모듈 오리지늄 주사위 수납함(MSC-X) · '음악이론 해설자'(MSC-Y) · 부패의 전승(MSC-D), 소환물 지난날의 잔상. 슈의 둘째 모듈
  (`uniequip_003_shu`)은 KR 서버에 아직 없어 이름·문구 넷을 KR 문체로 옮김(`tools/i18n/diy-ko-manual.json`, 「좋은 시절」(GUA-Y) — 같은 재능의 KR 문구 「천유사시」
  ·「피격 대미지 -15%」에 맞춤).
- 데이터: CN 표 그대로. 맹약: 슈(염국·세 `yan`·`sui`)·리(용문 `lungmen`) 염국(`yanShip`), 유넥티스 사르곤(`sargonShip`), 에벤홀츠(라이타니엔)는 이번 시즌 핵심
  맹약이 없어 협방(`emptyShip`). 소환물: 에벤홀츠의 지난날의 잔상(`token_10024_ebnhlz_rcube`) — 웹 모델이 없어 EN 클라에서 뽑음(`extract.py TOKEN_SPINES`).
- 키트·테스트: upstream 순서형 피해 판정 커널 직전 판(`9a3a12ee9^`)의 `op-shu.js`·`op-lmlee.js`·`op-zumama.js`·`op-ebnhlz.js`와 테스트 넷. 바꾼 것:
  - 슈 S2·유넥티스 S2·S3의 자동 발동: 중장 행 `TAKE_DAMAGE`(`sim.md` 「중장 스킬 공식 TAKE_DAMAGE」, 관리자 결정 2026-10-28). upstream 키트·테스트의 「중장 예외
    DEFAULT」를 고침(페넌스와 같음).
  - 슈 S1 은택 받은 초목은 사리아 S1 급구와 같은 꼴: 데이터 `DEFAULT` + 스킬 범위 x-4에 HP 절반 이하 아군이 있으면 그 공격이 가장 낮은 아군의 치료가 된다(키트
    명세가 사리아 키트와 같음 — 공식 클라의 스킬 프리팹도 같은 것, 관리자 의견 2026-11-04와도 같음). 치료는 공격의 타격 시점에 들어간다(추출한 공격 타이밍).
  - 슈 재능 2 천유사시의 「세(岁) 오퍼레이터 4명」: charId 목록 대신 소속 태그 `sui`(`kits/shared/powers.js hasPower`, `sim.md` 「진영 판정은 소속 태그」). 시험의 넷째
    세 오퍼레이터는 우리 선발에 없는 총웨 대신 망.
  - 슈 S3 우거진 성쇠의 파종 표식: 적에게 붙는 버프로 옮김. 공식은 표식 버프(`shu_s_3[enemy][mark]`)의 `ON_OWNER_ROOT_TILE_CHANGED`가 기준 칸이 바뀔 때마다
    표식 칸과의 거리를 보고(`FilterRootTileOffset` ≥ max_distance) 바로 되돌린다(`ForceSetToTilePosition`) — 적 자신의 이동 안이라, 그 적이 max_distance 칸에서
    한 틱을 끝내는 일이 없다. upstream은 슈의 스킬 틱에서 봤고, 유닛이 한 줄로 차례대로 도는 지금(`sim.md` 「유닛 틱 차례」)은 먼저 배치된 슈가 적보다 먼저 돌아
    한 틱 늦었다. 이제 표식 버프의 틱(적의 틱 안, 이동 뒤)에서.
  - 리 재능 1 화기생재의 「주위 8칸에 적이 하나뿐」: 템플릿 `lmlee_t_1`이 범위 x-4의 적 수를 센다(`CheckHasEnemyInRange` EQUALS cnt) — 그가 막는 적도 위치대로
    들어간다 → upstream 추정 표시를 지움(동작 같음). S3 귀빈내방의 밀치기 방향: 템플릿 `knockback[relative]`(`_useSourceDirection` false) — 리에게서 바깥쪽 →
    추정 표시를 지움(동작 같음).
  - 에벤홀츠의 저장 에너지는 본공격과 한 대상에(엔진의 미스틱 캐스터 규칙, 비이와 같음), 재배치 때는 0(공식은 배치마다 새 유닛 — 위 「선발 추가 벨로네·비이…」
    비이 줄). 엔진 `professions.js installMystic`의 같은 추정 표시도 지움.
  - 에벤홀츠 S2 황량한 메아리는 「대체」 시전(스킬 시전 데이터 `replace`, 능력 `Skill_2` 1초·타격 0.367초): 다음 공격을 스킬로 바꾸므로 공격 쿨다운(3초)을
    기다리고 잔상은 그 타격에 나온다. upstream 테스트의 「시전 즉시」를 그 타격까지 기다리게 고침.
  - 에벤홀츠 S1 급속 변주는 적이 사거리에 들어오면 바로 켜지는데, 그때 돌던 공격 쿨다운(3초 간격의 남은 몫)이 그대로라 첫 S1 공격이 그만큼 늦다. 공식은 S1 모드의
    공격 능력이 따로 쿨다운을 가진다 — 엔진이 유닛당 쿨다운 하나인 알려진 차이(`sim.md` 「일반 공격 타이밍」 「아직 공식과 다른 것」). 시험은 그 차이만큼 기다림.
- 공식 클라에서 확인해 고친 것(2026-11-11):
  - 리 S2 축귀벽사의 표식이 세는 타격: `lmlee_s_2[paper]` ON_TAKE_DAMAGE에는 피해 거르기 노드가 없고, 공식 클라는 대상에서 취소된 피해(무적·빗나감·
    회피·보호막이 다 막음)도 모든 버프의 ON_TAKE_DAMAGE를 돌린다(`Entity.OnTakeDamage` → `BuffContainer.OnTakeDamage`). 그래서 보호막이 막은 타격
    (전에도 셈)에 더해 **회피된 타격·무적인 적에 맞은 타격도 센다**. 원소 손상은 다른 길(ON_TAKE_DAMAGE 없음)이라 안 센다. 엔진은 `dealDamage`의
    취소 출구마다 훅 `voidHit`(이유 `why`: invulnerable·cancel·dodge·limit, 듣는 키트가 없으면 내지 않음)을 내고 리 키트가 그것도 센다.
  - 유넥티스 S2: 공식 `BlockedToggleChecker`는 적이 저지 목록에 들어올 때 `_buffsToBlockee`를 한 번 붙이고 빠질 때(또는 스킬 모드가 끝날 때) 뗀다.
    그래서 저지된 채로 무적 + 선택 불가가 된 적도 기절이 **남는다**. 엔진은 그런 유닛에 새 상태를 안 붙이므로 키트가 들고 있는 기절을 늘인다.
  - 에벤홀츠 S2 잔상 칸 순서: 스킬 프리팹 `EbnhlzS2SpawnTokenAbility` + `TileSelector`(`_filterType` 7, `_alwaysRandomInTheEnd`) — ① 적이 선 빈 칸을
    그 칸 적의 가장 높은 위협도(HATRED_DES = 엔진의 기본 오퍼레이터 대상 순서) 순 ② **그의 범위 안** 지상 적을 위협도 순으로, 각 적에게 가장 가까운
    칸(이미 고른 칸이면 건너뜀, 같은 거리는 앞 칸) ③ 남은 칸 무작위. 예전 키트는 ②를 필드 전체 적까지의 거리로 정렬했다. W S2와 같은 선택기
    (`kits/shared/tier1.js betterEnemyTiles`, 위 W 절).
  - 잔상은 정비 구역·장비 구역(`tile_achand`·`tile_acbag`)에 놓이지 않는다(2026-11-15 고침, 관리자 제보 「에벤홀츠 S2 소환물이 장비 구역에도 설치됨」):
    보스 필드의 시뮬 영역(0~5행)에는 정비 구역(0행)·장비 구역(1행)이 들어 있고, 그 타일은 레벨 표에 「높은 지형·전부 배치」로 적혀 있어 모든 자동 배치
    (`grid.canStand` — 소환물 칸·돌격 착지)가 빈 원거리 칸으로 봤다. 공식 `AutoChessBattleUtil.IsBattleField`는 정비 구역 타일을 전장에서 뺀다. 원인 제거:
    격자가 두 타일을 심해 구역처럼 실효 배치 NONE으로 읽는다(`server/sim/grid.js` `HAND_TILES` → `normalizeLegendEntry`) — 다른 키트의 자동 배치도 같이
    막힌다. 재발 방지: `test/content/op_ebnhlz.test.js`(두 시즌 모든 맵의 정비·장비 구역 타일 + 보스 필드 잔상).
  - 잔상: 공격의 `_selectTargetTiming` 1 BEFORE_SPELL_START — 0.93초 뒤 닿을 때 대상을 고른다(키트 그대로). 토큰 프리팹 `_category` 2 TRAP_OR_ITEM이라
    적 선택기(`_targetCategory` 1 DEFAULT)에 걸리지 않는다 — **적이 잔상을 노리지 않게** 고침(W 「적 방향」과 같음).
- 키트 주석에 남은 추정:
  - 리 S2 축귀벽사 [추정·미조사: 리가 쓰러진 뒤의 폭발이 그의 마지막 공격력을 쓰는지 — 폭발은 표식 버프 ON_BUFF_FINISH의 `EmitProjectile`(출처 = 리,
    출처가 없으면 안 쏨)이고 공격력은 투사체 피해 쪽에서 읽음, 죽은 출처의 속성은 안 읽음].
- 이펙트·공격 타이밍·투사체·스킬 시전·모드·HUD 데이터: EN 클라에서 뽑음(2026-11-04, `tools/local-extract/add_operator.py --id …` 네 명 한 번). 잔상 이펙트
  (`token_ebnhlz_*` 7개)는 공용 토큰 팩 `pkgrps/btl_pfb_fx_token_0.ab`에서 따로. 화면 확인 전.
- 테스트: `test/content/op_shu.test.js`(10)·`op_lmlee.test.js`(9)·`op_zumama.test.js`(9)·`op_ebnhlz.test.js`(11) — 모든 폼, 세 스킬, 두 재능, 특성, 모듈, 소환물,
  실제 매치 경로 하나씩(upstream 테스트에 없어 더함); 선발 수를 세는 테스트 24 → 28명(폼 115 → 127), 소환사 9 → 10, 토큰 모델 16 → 17. 유넥티스의 RA-A(생식 연산
  전용)는 편성에서 거부된다(`shared/diy.js validateDiyPicks`: 다른 게임 모드에서만 듣는 ISW·SO·RA 모듈, upstream 0.2.0의 그쪽 관리자 결정 — 우리 선발에서 처음). golden `diy-039`~`diy-047`(새 시나리오), 다른 가족 변화 없음.

## 선발 추가 제시카 더 리버레이티드·파죰카·에이야퍄들라 (2026-11-04, 관리자 결정)
- 관리자 결정 2026-11-02·2026-11-03·2026-11-04(새 시즌 핵심 맹약 명단의 upstream 선발 키트 열 명을 묶음으로): 선발에 제시카 더 리버레이티드(涤火杰西卡
  `char_1034_jesca2`, 6성 디펜더 센티넬 프로텍터)·파죰카(鸿雪 `char_4055_bgsnow`, 6성 스나이퍼 헤비슈터)·에이야퍄들라(艾雅法拉 `char_180_amgoat`, 6성 캐스터
  코어 캐스터)를 넣는다(`LOCAL_DIY_PICKS` 끝). 한 묶음으로 넣은 까닭: 셋 다 손볼 곳이 자동 발동(업스트림 키트·테스트의 `ACTIVE_RANGE`·`SKILL_RANGE`)이라 고치는
  방식이 같다. 이름·문구는 KR 공식 표 그대로(`tools/i18n/build-ko-diy.mjs`, 손 번역 없음): 제시카 더 리버레이티드 · 전선 고수 · 엄폐 호위 · 집중 사격, 재능 유연한
  대응 · 저장 및 방출, 모듈 '나만의 영웅'(SPT-X) · 풍화되지 않은(SPT-Y), 소환물 기동 방패 / 파죰카 · 약강격 · 요약 · 날카로운 스케치, 재능 자동 타자기 · 약점
  속기, 모듈 타자기 리본(ARC-Y) · 의식감(ARC-X), 소환물 '타자기' / 에이야퍄들라 · 듀엣 아리아 · 이그니션 · 볼케이노, 재능 플레임 브레스 · 카오스 플레임, 모듈
  '놓친 소리'(CCR-X) · 애완동물 대회 1위(CCR-Y).
- 데이터: CN 표 그대로. 맹약: 제시카(콜롬비아·블랙스틸·빅토리아) 빅토리아(`victoriaShip`), 파죰카(로도스·사르곤) 사르곤(`sargonShip`), 에이야퍄들라(라이타니엔)는 이번
  시즌 핵심 맹약이 없어 협방(`emptyShip`). 소환물: 기동 방패(`token_10032_jesca2_jckshd`)·'타자기'(`token_10026_bgsnow_subbow`) — 둘 다 손패 소환물(배치 1),
  웹 모델이 없어 EN 클라에서 뽑음(`extract.py TOKEN_SPINES`).
- 키트·테스트: upstream 순서형 피해 판정 커널 직전 판(`9a3a12ee9^`)의 `op-jesca2.js`·`op-bgsnow.js`·`op-amgoat.js`와 테스트 셋. 바꾼 것:
  - 자동 발동: 제시카 S2·S3는 중장 행 `TAKE_DAMAGE`(`sim.md` 「중장 스킬 공식 TAKE_DAMAGE」, 관리자 결정 2026-10-28) — 스킬 범위에만 있는 적으로는 안 켜지고 피격(또는
    자기 사거리의 공격 대상)으로 켜진다. 파죰카 S2·S3·에이야퍄들라 S3는 자기 행이 없어 `DEFAULT` + 스킬 범위 상자(3-1·x-3; `_DefaultTriggerSkill`). upstream
    테스트의 `ACTIVE_RANGE`·`SKILL_RANGE` 단언을 고침. 제시카 S1(AUTO, 자신·방패 강화)은 키트의 `SP_FULL` 그대로(kits/README 체크리스트 5).
  - 제시카 S3 포탄: 공식 템플릿 `jesca2_s_3[bomb]`의 `InterruptCharacterAttack`(`_resetCD` 뒤 `_resetAndClearCD`)는 그녀의 공격을 끊고 공격 쿨다운을 **비운다**
    (`Ability.ResetCooldown(false)` → `PeriodicTimer.Reset(waitFirstPeriod false)` = 남은 시간 0, 공식 클라에서 확인) — 포탄 뒤 바로 공격한다. upstream은 「쿨다운
    다시 시작」 추정이었다. 테스트가 포탄 순간의 쿨다운 0을 본다.
  - 제시카가 기동 방패 쪽으로 돌아설 때(재능 1, 방패가 사라져 돌아올 때도)와 방패 자신의 방향: 키트가 `unit.dir`만 바꾸면 사거리만 돌고 모델·방향 원 표시는 처음 방향에
    남았다(관리자 제보 2026-11-04). `b.snap`에는 방향이 없으므로 fx `turnDir`(`shared/protocol.js fxDir`, `stateFx`라 숨은 탭·늦은 입장에도 남음)로 알리고 뷰가
    `setDir`로 따른다. 판정은 그대로, golden 변화 없음. 아레나에서 네 방향과 복귀를 화면으로 확인.
  - 기동 방패 배치: 재능 1 문구 「只能放置于涤火杰西卡四周」대로 그녀의 상하좌우 칸에만 놓는다(관리자 결정 2026-11-04). 토큰 필드 `ownerBeside`(`tools/build-data.mjs`가 재능 문구에서),
    서버 `summonRange`·클라 `gameLogic` 같은 규칙, 그녀의 방향과 무관. 준비 화면의 방향·사거리는 방패를 따라 돌리지 않고 전투 시작 때 돈다(관리자 결정 2026-11-04).
  - S3 포탄 그림: 키트 사건 `bombardShell`·`bombard`에 공식 이펙트 연결(`kitofficial.js`). `ExtraBomb`의 `_castEffects` `jesca2_skill_03_start_02`(바라보는 방향 사본), 투사체
    `projectile_chr_jesca2_s3_bomb`의 `_mainEffect` `jesca2_skill_03_trail_02`가 초당 5칸으로 끝점까지 날고, 먼저 터지면 그 자리에서 끝나며 `_effectsWhenStop` `jesca2_skill_03_hit_02`.
    전엔 범용 포탄이 어느 방향이든 하늘에서 떨어졌다(관리자 제보 2026-11-04). `start_02`는 일반 공격 때 안 튼다(`fxmap.js KIT_CAST`). golden `fx-events` 제시카 세 줄만 변함.
  - 파죰카 '타자기'의 요약(복사본 S2): 그녀의 S2처럼 「즉시」(시전이 다음 공격을 바로 낸다) — 복사본에 없던 `atkCd = 0` 시작을 더함. `DEFAULT` 시전(0.2초 회차)이
    공격 사이에 오면 한 공격 간격을 기다리던 것.
  - 에이야퍄들라 재능 2 카오스 플레임 CCR-Y 3단계: 공속 버프는 배치 동안 계속(템플릿 `amgoat_e_t_2`: `ON_OWNER_LOCATE`에 `amgoat_e_t_2[attack_speed]`, 수명
    INFINITY), 범위에 정예·보스 적이 있으면 SP·공속 = `|최댓값 − factor|`(`CalculateBlackboardValueViaParams` `_finalAbs`) — 19·15, 공식 클라에서 확인. 키트가
    `factor`를 읽게 고침(결과 같음).
  - 파죰카 ARC-Y 특성의 공격력 증가는 그녀의 모든 피해(요약의 지속 피해 두 번 포함)에 걸린다 — 템플릿 `bgsnow_e_trait`가 `ON_CALCULATE_DAMAGE`에서 대상의
    `bgsnow_focus[mark]`만 본다. 재능 2 약점 속기의 「옆 칸」 강화는 타자기가 그녀의 `bgsnow_t[def_down]`을 가질 때(`bgsnow_subbow_token[debuff]`) — 그녀가 필드에
    있을 때만. 제시카의 방패 재배치(PRTS 卫戍协议/帮助 소환물 재배치)·방패 禁疗(PRTS 「持有禁疗」·토큰 프리팹 `jckshd_t`) 추정 표시도 지움.
  - 에이야퍄들라 S3 시험: 그녀가 이미 자기 3-1을 공격하던 중에 켜지므로(`DEFAULT`) 시전 순간 돌던 쿨다운(엔진은 남은 초 그대로 — `sim.md` 「일반 공격 타이밍」
    「아직 공식과 다른 것」)을 지나 첫 용암부터 공격 수를 센다.
- 남았던 추정 9개를 공식 클라에서 확인함(2026-11-11, 능력·투사체·토큰·모듈 프리팹과 투사체 명중 처리):
  - 에이야퍄들라 S2 이그니션: 마법 저항 감소는 **주 대상에게만** 붙는다. S2의 `RangedAttack`이 `_activeBuffs`(감소)를 투사체 `projectile_amgoat_s2`에 넘기고,
    그 투사체의 행동 컨트롤러가 `_onlyAddBuffsToTraceTarget`라 추적 대상 말고는 버프를 안 붙인다. 투사체는 맞힌 대상에 버프를 먼저 붙이고 그 뒤 공격의 피해
    동작을 돌린다 — 주 대상은 감소 뒤 첫 피해(PRTS 비고와 같음), 폭발에 든 다른 적은 감소 없이 ½. 스킬 문구 「命中目标周围的敌人…法术抗性」는 둘레 적의 감소로
    읽히지만 클라와 PRTS 비고는 주 대상만이다. 전엔 둘레 적도 피해 뒤에 감소를 받았다.
  - 에이야퍄들라 CCR-Y 특성 SP: 그녀가 정예·보스 적에게 주는 **피해마다** 1 — 모듈 특성 버프 `v035_common_addsp`가 `ON_CALCULATE_DAMAGE`에서 대상 등급
    (`ELITE_AND_BOSS`)만 보고 공격·범위 거르기가 없다. 그래서 S2 폭발이 정예에게 준 ½과 주 대상의 둘째 ½(`amgoat_s_2`의 `AdvancedApplyDamage`, 출처로 계산 —
    `BattleFormula.CalculateDamage`가 출처의 피해 계산 이벤트를 돌림)도 센다. 피해를 계산하는 때라 회피 전(`hit`)에 센다. 전엔 공격의 첫 타격만 셌다.
  - 에이야퍄들라 S3 볼케이노: 용암에 범위 피해가 없다 — S3 모드 공격(`RandomSelector`)의 투사체 `projectile_amgoat_s3`에 범위 타격(`HitBehaviour`)이 없고 대상
    하나만 친다. 지금 규칙 그대로.
  - 제시카 S3 포탄: 회피한 폭발에도 **기절이 붙는다** — 기절은 `ExtraBomb` 능력의 `_activeBuffs`이고, 포탄 자신은 버프를 안 붙이며(`_dontAddBuffs`) 명중 때
    `projectile_chr_jesca2_s3_explosion`을 내고, 그 폭발 투사체가 맞힌 적마다 기절을 먼저 붙인 뒤 피해를 돌린다. 회피는 피해만 취소한다(빗나감으로 거르는
    `isDamageMissable` 버프는 시전 때 그녀 자신의 명중률 굴림 `damageMissFlag` 기준이지 대상의 회피가 아님). 전엔 회피한 적에게 기절을 안 붙였다.
  - 파죰카 「정면」(ARC-Y 특성·S3 날카로운 스케치가 보는 `bgsnow_focus[mark]`): 그녀의 공통 능력 `Focus` 오라 `ConstBoxRange` `5-1` — **자기 칸과 앞 5칸**. 그녀
    사거리(3-6, S3 3-1)는 앞 3칸까지라 지금 판정(행 0·열 0 이상, S3는 3-2 줄)과 결과가 같고, 키트가 앞 5칸에서 자름.
  - 파죰카 '타자기' 재배치: 그녀가 필드에 있을 때만 — 그녀가 퇴장하면 `BattleController.OnCharacterFinished` → `Deck.RecycleCard`가 소환물 카드의
    `m_hostIsAlive`를 끄고(`TokenCard.OnHostRecycled`), 그 카드는 숨겨진다(`TokenCard.get_isHiddenByCardState`); 그녀가 다시 서면 켜짐(`OnHostSpawned`). 지금 규칙 그대로.
  - 파죰카 '타자기' 禁疗: 없다 — 토큰 프리팹 `token_10026_bgsnow_subbow`에 이상 상태 버프가 없다(수명 퇴장 `bgsnow_subbow_t_1[withdraw]`·카드 재충전·방향·방어 감소뿐).
    공격받지 않아 체력이 안 변하니 치료될 일도 없다. 키트도 禁疗를 걸지 않는다(`startCountdown`은 `COUNTDOWN_SUMMONS`가 아닌 타자기를 건드리지 않음) — 주석만 고침.
- 이펙트·공격 타이밍·투사체·스킬 시전·모드·HUD 데이터: EN 클라에서 뽑음(2026-11-04, `tools/local-extract/add_operator.py --id …` 셋 한 번). 소환물 이펙트
  (`token_jesca2_*` 6개·`token_bgsnow_*` 17개)는 공용 토큰 팩 `pkgrps/btl_pfb_fx_token_1.ab`·`_0.ab`에서 따로. 화면 확인 전.
- 테스트: `test/content/op_jesca2.test.js`(10)·`op_bgsnow.test.js`(8)·`op_amgoat.test.js`(8) — 모든 폼, 세 스킬, 두 재능, 특성, 모듈, 소환물; 선발 수를 세는 테스트
  28 → 31명(폼 127 → 136), 소환사 10 → 12, 손패 소환물 검사 94 → 142, 토큰 모델 17 → 19. golden `diy-048`~`diy-053`(새 시나리오; `diy-047`은 덜 찬 마지막 판에 제시카가 들어와 바뀜 — 동작 변화 아님), 다른 가족 변화 없음.

## 선발 추가 쏜즈·아이린·위디 (2026-11-04, 관리자 결정)
- 관리자 결정 2026-11-02·2026-11-03·2026-11-04(새 시즌 핵심 맹약 명단의 upstream 선발 키트 열 명을 묶음으로, 이베리아 맹약): 선발에 쏜즈(棘刺 `char_293_thorns`,
  6성 가드 로드)·아이린(艾丽妮 `char_4009_irene`, 6성 가드 소드마스터)·위디(温蒂 `char_400_weedy`, 6성 스페셜리스트 푸셔)를 넣는다(`LOCAL_DIY_PICKS` 끝). 한 묶음으로
  넣은 까닭: 같은 새 맹약(이베리아). 쏜즈는 upstream 순서형 피해 판정 커널에 묶인 7명 중 하나라 커널 직전 판(`9a3a12ee9^`)을 씀(「선발 추가 페넌스·로고스·비비아나」와
  같음). 이름·문구는 KR 공식 표 그대로(`tools/i18n/build-ko-diy.mjs`, 손 번역 없음): 쏜즈 · 공격 강화 γ · 호신용 가시 · 데스트레자, 재능 신경 부식 · 고향 땅의
  파도소리, 모듈 '소금과 모래'(LOR-X) · 모래 침식(LOR-D) / 아이린 · 불어오는 바람 · 갈라지는 파도 · 판결, 재능 심판의 불꽃 · 정화의 검, 모듈 두껍고 무거운
  경전(SWO-Y) · 재판관의 보급(SWO-X) · 아이린의 특별 한정 배지(ISW-A) / 위디 · 포관 타격 · 물대포 모드 · 액체 질소 대포, 재능 공학용 저수포 · 저수포 강화, 모듈
  시드래곤 개량형(PUS-X) · 신형 바이오닉 프로토타입(PUS-Y), 소환물 공학용 저수포.
- 데이터: CN 표 그대로. 맹약: 이베리아는 이번 시즌 핵심 맹약이 없어 셋 다 협방(`emptyShip`; 위디는 로도스·이베리아). 소환물: 공학용 저수포
  (`token_10009_weedy_cannon`, 손패 소환물, 배치 1) — 웹 모델이 없어 EN 클라에서 뽑음(`extract.py TOKEN_SPINES`). 아이린의 ISW-A(통합 전략 전용)는 편성에서
  거부된다(`shared/diy.js validateDiyPicks`, 유넥티스 RA-A와 같음).
- 키트·테스트: 커널 직전 판의 `op-thorns.js`·`op-irene.js`·`op-weedy.js`와 테스트 셋. 바꾼 것:
  - 자동 발동: 셋의 MANUAL 스킬(쏜즈 S2 3-1·S3 3-3, 아이린 S2 3-12·S3 x-1, 위디 S3 4-1)은 자기 행이 없어 `DEFAULT` + 스킬 범위 상자(`_DefaultTriggerSkill`).
    upstream 테스트의 `SKILL_RANGE`·`ACTIVE_RANGE` 단언을 고침. 아이린 S2의 「지상 적이 없으면 안 켜짐」 막이(`guardActivation`)는 그대로 — 상자 안 게(铁钳号)는
    지상 대상으로 센다(2026-11-11, 아래 「공식 클라에서 확인한 것」). upstream 아군 대상 깃발(`allyTargets`)은 우리 `skills.js`가 읽지 않아 지움(하루카와 같음).
  - 아이린 재능 1 심판의 불꽃 + SWO-Y(고정 방어 무시 70) 시험: 공식 물리 피해식 `A − (1 − 백분율 관통)·max(0, 방어 − 고정 관통)` — 고정 몫을 먼저 뺀다
    (`research/reference/battle-mechanics-reference.md`); upstream 시험식(백분율 먼저)을 고침, 엔진은 그대로.
  - 아이린 S2 두 번째 충전: 자동 운영의 시전 막이(`BLOCK_SKILL_TICK` 회차 × 0.2초, ≈ 2초 남짓)만큼 떨어짐 — upstream 시험의 「3초」를 우리 규칙으로.
  - 위디: 합성 기록의 `placeOnRanged` 필드는 우리 포크에 없고 고대 규칙은 `shared/highGround.js meleeOnHighGround`(시험이 이미 봄) — 그 단언을 지움. 저수포의
    강제 스킬은 `DEFAULT`라 첫 일반 공격과 같은 틱에 나가 두 밀치기가 겹친다 — 시험은 거리 대신 그 탄의 밀치기 힘(저수포 힘 + 1)을 본다.
  - upstream 시험이 살아 있는 유닛을 `assert.deepEqual`에 넘기던 곳(아이린 넷·쏜즈 하나·위디 하나)은 id로(CONTRIBUTING §6).
- 공식 클라에서 확인한 것(2026-11-11 — 2026-11-04 판의 추정 15개):
  - **쏜즈** 재능 1 신경 부식의 독은 그의 모든 능력의 타격에 붙는다(`PassiveAttachmentAbility` `_targetFamilyMask` 31 = 공격·스킬 등 모든
    갈래 — S2 가시 능력 `Thorn`도). LOR-X 법술 추가 피해는 그 타격의 피해 계산(ON_CALCULATE_DAMAGE) 안의 몫이라 따로 독을 붙이지 않는다 — 키트와 같음.
    그가 떠난 뒤에도 독은 남는다(버프의 틱은 출처를 보지 않고, `FixedValueDamage`는 출처가 없어도 피해를 냄) — 키트와 같음.
    재능 2 고향 땅의 파도소리는 **배치 뒤 2초부터** 켜진다(`AdvancedCompoundToggleChecker`에 `_isInitToggled`가 없어 꺼진 채 붙고, 붙을 때 다음 켜짐
    시각 = 배치 + `_restoreDelay` 2초) — 예전 키트는 배치하자마자 켰다(고침).
  - **아이린** S2의 발동·타격 선택자(`BlockedOrAdvancedSelector`: 쪽 ENEMY·지상만 WALK_ONLY·카테고리 DEFAULT, `_minTargetNum` 1, 수동에서도 씀
    `_useTriggerInManualMode`)는 지상 대상이 없으면 안 켜진다 — 그대로. 스테인리스의 게(글룸핀서호 - 프로토타입)는 프리팹이 쪽 ENEMY·카테고리
    DEFAULT라(`sim.md` 「스킬 범위 발동」) 이 선택자에 걸린다: 게만 있어도 S2가 켜지고 게를 친다(고침, 적 뒤에 — 일반 공격의 차례).
    S3는 묶음 능력(`AbilitySequenceGroup`): 첫 타격(Skill_3_Start 클립의 OnAttack) 뒤 **그 클립이 끝날 때 첫 폭격**, 이어 `multi_hit_interval`마다
    (`MultiRangedAttack`이 `multi_` 접두사로 `times`·`hit_interval`을 읽음) 모두 `multi_times`발. 폭격 대상은 스킬 범위의 적 쪽 대상 가운데 무작위
    (`_postFilter` 14 RANDOM, 공중 포함) — 게도 적과 같이 뽑힌다(예전 키트는 적이 없을 때만 게, 고침). 투사체는 바로 닿는다(`_immediatelyReach`).
    대상이 없는 발은 아무도 안 맞고 수에 든다. 기절하면 남은 폭격이 없다(묶음이 지금 하위 능력도 끊음 `_alsoInterruptCurrentSubAbility`, 0·1번;
    예전 키트는 기절 중에도 쐈다, 고침) — 스킬 3.5초는 그대로 흐른다. 첫 폭격 시각은 0.267초(클립 끝)로 예전 0.3초와 틱으로 같다.
  - **위디** S2 물대포는 지상만(모드의 선택자·투사체 스플래시 모두 `_targetMotion` WALK_ONLY; 예전 키트는 공중도, 고침). S3 액체 질소 탄은 날아간다
    (`projectile_weedy_s3` 속도 8, `_alwaysHitTraceTargetInTheEnd`, 닿을 때 스플래시; 예전 키트는 바로, 고침) — 저수포의 S3 탄도 같다. 탄이 시전보다
    늦게 닿으므로 그 탄의 이펙트(`_effectsWhenReached` `weedy_skill_03_hit`·`_effectsWhenHit` `weedy_skill_01_hit`, 쫓던 대상에만)는 피해의 `moment`로
    튼다(`render/fx/kitofficial.js` `hit.weedy`).
    밀치기는 쏜 쪽의 방향(`knockback[dir]` `_useSourceDirection`: 대상이 그 방향 45° 안이고 0.25칸보다 멀면 그 방향, 아니면 쏜 쪽에서 멀어지는 쪽으로
    힘 −2 — 엔진 `Battle.push`가 이미 그렇게 함), 저수포 탄은 저수포의 방향. 공학용 저수포: 일반 공격은 지상만(`_targetMotion` WALK_ONLY; 예전 키트는
    공중도, 고침), 무적 표시는 없다(프리팹 이상 상태는 禁疗 7뿐, 적이 못 노리는 것은 `_category` 2 — 키트 주석만 고침), 재배치는 위디가 필드에 있을 때만
    (토큰 카드 `TokenCard.m_hostIsAlive`, 파죰카 '타자기'와 같음), 재능 2 SP 시계는 위디가 둘레에 있는 동안만 돌고 들어올 때마다 새로 시작
    (`AuraAbility` `periodic_sp`, `_removeBuffWhenTargetLeave`) — 키트와 같음. 저수포 S3 피해는 위디의 공격력(`SetAtkScaleAsHostBased`: 시전 때 `atk_scale`
    × 위디 공격력) — 키트와 같음.
- 키트 주석에 남은 추정:
  - 쏜즈 S2 [추정·엔진: 가시가 스킬 끝·퇴장·행동 불가 때 취소되는지 — 공식 `Thorn` 능력은 배치 때 붙고(`_extraAbilities`, 스킬 끝에 안 뗌) 발동 노드
    `TriggerAbility`는 기절을 안 봄; 기절이나 스킬의 모드 전환이 0.5초 대기를 끊는지는 못 봄]·LOR-X [추정·엔진: 어떤 피해가 ON_CALCULATE_DAMAGE를 도는지 —
    가시는 돌고 독 틱은 안 도는 것으로 봄].
  - 위디 [추정·엔진: 저수포 S3 피해를 누구 것으로 세는지 — 공식은 저수포 능력의 피해(공격력만 위디 기준), 키트는 위디 것으로 셈(맹약·재능 반응)].
- 이펙트·공격 타이밍·투사체·스킬 시전·모드·HUD 데이터: EN 클라에서 뽑음(2026-11-04, `tools/local-extract/add_operator.py --id …` 셋 한 번). 저수포 이펙트
  (`token_weedy_*` 3개)는 공용 토큰 팩 `pkgrps/btl_pfb_fx_token_2.ab`에서 따로. 화면 확인 전.
- 테스트: `test/content/op_thorns.test.js`(12)·`op_irene.test.js`(10)·`op_weedy.test.js`(10) — 모든 폼, 세 스킬, 두 재능, 특성, 모듈, 소환물, 실제 매치 경로 하나씩
  (upstream 테스트에 없어 더함); 선발 수를 세는 테스트 31 → 34명(폼 136 → 145), 소환사 12 → 13, 손패 소환물 검사 142 → 166, 토큰 모델 19 → 20. golden `diy-054`~`diy-059`(새 시나리오; `diy-053`은 덜 찬 마지막 판에 쏜즈가 들어와 바뀜 — 동작 변화 아님), 다른 가족 변화 없음.


## 선발 추가 W·오올헤약·클로저 (2026-11-06, 관리자 결정)
- 관리자 결정 2026-11-02·2026-11-03·2026-11-06(새 시즌 카시미어·핵심 맹약 없음 명단의 upstream 선발 키트 셋을 묶음으로): 선발에 W(`char_113_cqbw`, 6성 스나이퍼 포격수)·오올헤약(霍尔海雅 `char_4027_heyak`, 6성 캐스터 코어)·클로저(可露希尔 `char_4228_closur`, 6성 뱅가드 전술가)를 넣는다(`LOCAL_DIY_PICKS` 끝). 이름·문구는 KR 공식 표 그대로(`tools/i18n/build-ko-diy.mjs`). 소환물은 W 「적 방향」(`token_10008_cqbw_box`)·클로저 「지휘 센터」(`token_10066_closur_ourbase`, 손패 소환물).
- 맹약: 지금 시즌은 셋 다 협방(`emptyShip`). 오올헤약의 ISW-A(통합 전략 전용)는 편성에서 거부된다.
- 키트·테스트: 커널 직전 판(`9a3a12ee9^`)의 키트와 테스트에서 가져와 공식 클라에서 확인한 값으로 바꿨다. PRTS 인용은 upstream 키트 머리 주석 그대로이고 이번에 다시 대조하지 않았다.
- **W**
  - S1 하트 K·S3 D12는 `CastSkill` `_switchToState` 1: 시전이 휘두름을 끊고 대상은 시전 시작에 고른 뒤(`_selectTargetTiming` 0) 클립의 OnAttack 프레임에 효과가 난다(`onStart` + `onStrike`). upstream은 `_shouldCastLikeAttack`을 「다음 공격이 스킬이 됨」으로 읽었으나, 이 값은 공격 트리거 재능용 표시일 뿐이다.
  - S1 유탄: `projectile_chr_cqbw_s1` 속도 8, `_alwaysHitTraceTargetInTheEnd`라 대상이 쓰러져도 그 자리에서 터진다. 대상 선택은 `_postFilter` 4 HATRED_DES, 공중 포함.
  - S2 깜짝 상자: `ReplacementSkill`(`replace`). 지뢰는 다음 공격의 타격 순간에 놓인다.
  - S3 D12: 폭탄은 날지 않는다(`projectile_chr_cqbw_s3` `_immediatelyReach`·`_delayAfterReached`·`_delayTime` 3). 대상은 `_postFilter` 15 HP_DES, 공격력은 시전 시작에 저장(`_useCachedAtkOnly`). upstream의 포탄 비행 추정을 지웠다.
  - 적 방향: 프리팹 `_category` 2 TRAP_OR_ITEM이라 적 선택기(`_targetCategory` 1 DEFAULT)에 걸리지 않는다. upstream의 추정을 공식 값으로 바꿨다.
  - S2 지뢰 칸(2026-11-11, 공식 클라에서 확인): 스킬 프리팹의 `TileSelector`(`_filterType` 7 BETTER_ENEMY_WITH_COLLIDER, `_alwaysRandomInTheEnd`)
    순서 — ① 사람 없는 칸 가운데 선택 가능한 지상 적이 선 칸, 그 칸 적의 가장 높은 위협도(HATRED_DES) 순 ② 모자라면 **그녀 범위 안의** 지상 적을
    위협도 순으로 하나씩, 각 적에게 가장 가까운 칸(이미 고른 칸이면 그 적은 건너뜀, 같은 거리면 앞 칸) ③ 그래도 모자라면 남은 칸 무작위. 예전 키트는
    ②를 필드 전체 적까지의 거리로 봤다. 에벤홀츠 S2와 같은 선택기라 공용 함수 하나(`kits/shared/tier1.js betterEnemyTiles`).
  - ART-Y 3단계 숨은 재능의 공격력 층(2026-11-11, 공식 클라에서 확인): `cqbw_e_003_t` ON_TAKE_DAMAGE가 `IfModifierTarget`(이미 취소된 피해는
    거름) → 층 지움. 버프는 같은 이벤트 우선순위면 얻은 차례로 도는데 이 버프는 배치 때 얻으므로, 나중에 얻는 보호막이 다 막은 타격과 재능 1
    설복이 회피한 타격도 **층을 지운다**. 무적(버프보다 먼저 취소)과 유실·원소 손상(ON_TAKE_DAMAGE 없음)은 안 지운다. 예전 키트는 회피를 뺐다.
  - 쓰러질 때도 지뢰를 거둔다: 그녀의 공통 능력 버프 `cqbw_c`(템플릿 `die_to_kill_token`)가 ON_OWNER_FINISH에 KillTokens — 이유를 가리지 않고
    필드를 떠날 때(동작은 그대로, 추정 표시만 지움).
- **오올헤약**
  - S2 굽이쳐 흐르는 별들: 모드 `MultiRangedAttack` `_additionalTimes` 8·`_triggerDelta` 0.05 — 9발이 타격부터 0.05초 간격으로 나가고, 각 발이 나갈 때 무작위로 대상을 고른다(`_selectNum` 1, `_selectTargetTiming` 1). 기절하면 남은 발은 없다.
  - S3 박식한 자의 광언: `DEFAULT` + 스킬 범위 상자 3-10(자기 행 없음). 공격은 공격 클립의 타격에 회오리 셋을 낸다(upstream은 타이머로 직접 냄). 회오리는 속도 1·수명 4초라 **4칸**을 난다: PRTS 「5格远处中心点」은 자기 칸을 세는 값이다. 배율 곡선 `_scaleCurve`가 수명의 0.4428에서 1이 되어 PRTS의 1.77초와 맞는다. 함께 닿은 적은 `_postFilter` 4 HATRED_DES 차례, 공중 포함.
- **클로저**: S1의 `trigger: 'SP_FULL'`은 그대로 둔다(아군·자신에게만 듣는 AUTO 스킬은 SP가 차면 켠다, kits README 체크리스트 5). S2·S3은 표의 전술가 행(`ALWAYS`). S1 보호막 버프 키를 클라 키 `closur_s_1[block]`으로 지어 상태 경로가 `closur_skill_01_shied_01`을 튼다.
- 소환물 이펙트 규칙(`fx.md` 「소환물이 서 있는 동안의 버프」): 소환물 재능의 기간제 버프 `token_*_born[withdraw]`가 서 있는 동안의 이펙트로 이어진다. 이 규칙으로 에벤홀츠 소환물 `token_ebnhlz_buff`와 비즈왁스 소환물 `token_beewax_skill_02_buff`도 켜졌다. 끝 이펙트는 이미 있던 `dead`(`_deadEffect`) 경로로 난다.
- 키트 주석에 남은 추정:
  - W [추정·자료 없음: 지뢰 수 상한].
  - 오올헤약 [추정·엔진: 회피와 부양 버프의 차례]·[추정·자료 없음: 「模组加成」을 모듈 특성으로 봄]·[추정·엔진: 아직 나오지 않은 회오리는 그녀가 떠나면 안 나옴].
  - 클로저 [추정·자료 없음: 배치 비용 하한은 여기에 대응이 없음]·[추정·엔진: 둔화가 적 능력 쿨다운·상태 시간에 주는 영향은 넣지 않음].
- 이펙트·공격 타이밍·투사체·스킬 시전·모드·HUD: EN 클라에서 뽑음(`add_operator.py --id …` 셋 한 번). 소환물 이펙트는 두 오퍼레이터의 번들에 있어 토큰 팩 추출이 필요 없다. 화면 확인 전이다.
- 테스트: `test/content/op_cqbw.test.js`(12)·`op_heyak.test.js`(11)·`op_closur.test.js`(10) — 모든 폼, 세 스킬, 두 재능, 특성, 모듈, 소환물, 실제 매치 경로 하나씩(upstream 테스트에 없어 더함). 선발 수 34 → 37명(폼 145 → 154), 소환사 13 → 15, 손패 소환물 검사 166 → 184, 토큰 모델 20 → 22. golden `diy-060`~`diy-065`·`diy-summon-closur`(새 시나리오), 다른 가족 변화 없음. 이펙트 golden은 새 시나리오 외에 `diy-045`~`diy-047`에 `token_ebnhlz_buff` 한 줄씩 더해짐.

## 선발 추가 테리토리야 (2026-11-08, 관리자 결정)
- 관리자 결정 2026-11-08: 国度(`char_4246_dminon`, 6성 스페셜리스트 앰부셔)는 새 시즌 「규정」의 기물 명단에 없어 선발로만 넣는다(`LOCAL_DIY_PICKS` 끝). 키트·테스트는 upstream `dev`의 2026-11-03 판(키트 `4cd22a655` + S3 확산 피해 `2ed8de24a`; 화면 커밋 `b3f13f315`의 「국가」 바닥 그림은 받지 않음 — 이펙트는 CN에서 뽑음)에서 가져왔다. 맹약은 협방(우르수스는 핵심 맹약이 없음).
- 이름·문구: KR 서버에 아직 없는 오퍼레이터라 KR 문체로 손 번역(`tools/i18n/diy-ko-manual.json`) [비공식]. 이름은 비공식 번역에서 널리 쓰는 「테리토리야」(관리자 결정 2026-11-08; KR 출시 때 KR 이름으로 바꿈), 필드 “国度”는 KR 표가 같은 낱말을 옮긴 대로 “국가”(적 스킬 문구 「[국가] 영역」; 관리자 결정 2026-11-08).
- upstream 키트는 순서형 피해 판정 커널 뒤 판이라 우리 엔진에 맞춰 바꿨다(규칙은 같음):
  - 피해 호출 `dealDamage({ source, target, … })` → `dealDamage(source, target, { … })`, 피해를 받은 때 판정 `byEnemyDamage` → `tier1.js byEnemyAttack`(반격·반사 피해는 빠짐 — 우리 규칙).
  - S2 처형(受戮)의 「회피 불가」: upstream의 취소 사유 표시(`ignoreCancelReasons`) → 그 피해의 `canDodge`를 끔.
  - S3 아무도 없는 국가(无人的国度)의 부상 관찰(버프 `observeInjury`, upstream 엔진 기능): 그 버프를 든 아군이 받는 적 피해를 `damaged`·`dodge` 훅으로 본다(회피된 피해도 — PRTS 「伤判效果」 문서: 대부분의 효과는 그대로 처리).
  - 자동 발동: act2autochess 표에 행이 없어 S2·S3 모두 `DEFAULT` + 스킬 범위 상자(y-3·y-10, `sim.md` 「스킬 범위 발동」). upstream은 `ACTIVE_RANGE`.
- 키트 주석에 남은 추정은 모두 [추정·CN: CN에만 있는 오퍼레이터라 클라 로직을 못 읽음] — 국가 위 판정이 칸 기준인지, 공격 속도 감소의 최강값 선택, 재능 1 첫 틱 시점, 기절 중에도 피해, 철수·기습 점프를 퇴장으로 봄, 피해 뒤 기절 순서, S1 매 틱 검사·공중 포함, S2 2회차를 배치마다 셈, S3 다른 테리토리야의 국가 위 적 동시 공격·확산 피해의 공중 포함, S3 버프 수명(18곳).
- 테스트: `test/content/op_dminon.test.js`(12) — 모든 폼, 세 스킬, 두 재능, 특성, 모듈, 실제 매치 경로 하나(upstream 테스트에 없어 더함). 선발 수 37 → 38명(폼 154 → 157). golden `diy-066`·`diy-067`(새 시나리오), 다른 가족 변화 없음.
- 이펙트·공격 타이밍·투사체·스킬 시전·모드·HUD·그림: CN 클라에서 뽑음(`add_operator.py`). 연결이 남은 이펙트(`fx-wiring-report.mjs`)는 fx 묶음 몫이다. 화면 확인 전이다.

## 유키 마코토 (2026-11-12, 관리자 결정)
- 관리자 결정 2026-11-12: 结城理(`char_4217_makoto`, 6성 스페셜리스트 인형사, 페르소나 3 리로드 콜라보, CN에만 있음)를 선발에 넣는다(`LOCAL_DIY_PICKS` 끝). upstream은 콜라보 6성을 선발에서 빼고 키트도 없다. 공개 키트가 하나 있으나 출처·라이선스가 밝혀지지 않아 쓰지 않고, 키트 `op-makoto.js`는 공식 CN 표·CN 클라의 프리팹(`char_4217_makoto`·`skchr_makoto_1~3`)과 버프 템플릿 34개(`makoto_*`)로 새로 썼다.
- 공식 규정 표(`act3autochess skillTriggerDataList`)에 그의 S3 행(`INVALID_IN_SKILL + ATTACK_RANGE_ENEMY + SKILL_RANGE_ENEMY`)이 있다 — 규정에서도 공식으로 고를 수 있는 오퍼레이터로 보인다. 이 행은 다른 새 목록 행처럼 읽지 않고 기본 전략(스킬 범위 x-1 상자)으로 둔다 [추정·CN: 목록 조건을 어떻게 합치는지는 CN 클라만 읽음]. 맹약 표에는 행이 없어 세 스킬 모두 `DEFAULT` + x-1 상자.
- 맹약: 맹약은 세력으로 받는다 — 맹약에서는 라테라노(`laterano` 부세력), 규정에서는 라테라노가 없어 협방(`fallbackBondId`). 이를 위해 빌드의 선발 맹약 계산을 그 시즌의 맹약만 보게 고쳤다(`tools/build-data.mjs buildBackups`: 규정의 전역 `bondInfoDict`에는 맹약 시즌의 라테라노가 남아 있어 규정 데이터 검사가 실패했음).
- 특성은 공용 인형사(`professions.js installDollkeeper`, 2초 교체·<대역> 20초·저지 0·교체 때 상태 이상과 기력 비움). 그만의 것:
  - 모든 스킬이 「패시브: <대역> 상태에서 페르소나 소환 / 액티브: 즉시 <대역>으로 교체」 — 발동하면 곧바로 교체(`makoto_s<n>_trigger`), 치명상으로 들어가도 같은 페르소나가 싸운다. 페르소나 범위는 모든 스킬의 x-1(반지름 2 마름모).
  - 재능 1 얽매이지 않는 힘: <대역>에서 공격력 +atk, 공격 딜레이 +0.4초, HP +max_hp_t1(PUM-Y 특성의 +max_hp가 더해짐 — 두 MULTIPLIER의 합). 본체에서 <대역>으로 바뀔 때(`makoto_switchbegin`의 모드 0 검사) x-1 안 적(지상·공중) 정지 sluggish초.
  - S1 오르페우스: 범위에 HP 50% 미만 아군(지상·공중)이 있으면 가장 낮은 비율을 heal_scale×공격력 치료, 없으면 지상 적 1명에 atk_scale×공격력 마법(`AbilitySelectableGroup`의 차례).
  - S2 타나토스: 지상 적 최대 max_target명에 atk_scale×공격력 마법, 맞은 적마다 prob 확률로 공포 fear초. 0.1초마다 범위(지상·공중)의 공포 상태 적 중 HP < kill_atk_scale×공격력이면 kill_damage 무출처 트루 대미지(로고스 S1과 같은 처형).
  - S3 타나토스: 지상·공중 적 최대 max_target명에 약점 대미지(`common_weak_damage` — 물리·마법 중 덜 막는 쪽), 공격 속도 +talent@attack_speed. 타나토스로 치명상을 입으면(`makoto_tr`의 모드 3 분기) 남은 <대역> 시간 동안 오르페우스: 공격 없음, 저지 block_cnt, 범위 안 오퍼레이터(소환물·장치 제외, `professionMask` 639; 자신 포함) 물리·마법 회피 prob, interval초마다 가장 다친 아군 최대 max_target_heal명을 0.5초 뒤 heal_scale×공격력 치료. 이 교체는 1.5초(`Doll_Skill_3_P1toP2_ChangeBegin` 0.5초 + `ChangeEnd` 1초 — 모델 클립 길이, 공용 교체와 같은 순서)이고 남은 시간을 쓰지 않는다(`makoto_assign_standing_time`).
  - S1·S2 페르소나나 오르페우스로 치명상을 입으면 쓰러진다(`makoto_tr`에 갈래 없음).
  - 재능 2 S.E.E.S. 리더: <대역> 시간이 끝나 돌아올 때(쓰러질 때는 아님) 교체 시작 1.6초 뒤(`makoto_allout_attack_damage` triggerInterval) 필드의 모든 유키 마코토(협동의 다른 플레이어 것 포함, 「중첩 가능」) 주변 x-1의 모든 적(지상·공중)에 그의 공격력 × atk_scale 트루 대미지.
- 키트 주석에 남은 추정:
  - [추정·CN: `SetCastSkillManualTriggerOnly`는 CN에만 있는 노드] S3 타나토스에서 스킬로 오르페우스로 바꾸는 길은 수동 발동 전용이라 자동 조작은 쓰지 않는다고 봄 — 치명상으로만 바뀐다(공용 특성의 기력 정지로 어차피 준비되지 않음).
  - [추정·CN] 돌아오는 교체와 총공격 자세(`Switch2Normal` 모드, `enter_normal_duration`) 길이는 표에 값이 없어 공용 2초 교체 안에 넣음. <대역>으로 들어가는 교체는 클립(`SwitchOut` 1초 + `Doll_Skill_<n>_SwitchIn` 1초)으로 공용 2초와 같다.
  - 규정 S3 목록 행은 위.
- 테스트: `test/content/op_makoto.test.js`(10) — 모든 폼·잠재, 세 스킬, 두 재능, 특성, PUM-Y 모듈, 실제 매치 경로(세 스킬). 선발 수 38 → 39명.
- 그림(2026-11-12): 페르소나 클립은 render.md, 이펙트는 fx.md 「유키 마코토 페르소나」. 그 때문에 키트가 S3 오르페우스 교체에 form 'orpheus'(fx `persona`)와 치료마다 `kitHit`을 보내고, 페르소나 공격 피해에 이펙트 순간(`moment`)을 단다.
- 소리(2026-11-13): audio.md 「유키 마코토 페르소나 소리」 — 같은 순간들(교체 fx `substitute`·`persona`·`swap`, `kitHit` `makoto:heal`, 처형·약점 피해의 `moment`, S1 치료 휘두름 신호 `HealAlly_Lt50Per`)에 이었다. 키트는 바꾸지 않았다.

## 선발 추가 사일런스 더 패러디그매틱·외드레르·메커니스트 (2026-11-12, 관리자 결정)
- 관리자 결정 2026-11-12: 규정 기물 셋(사일런스 더 패러디그매틱 `char_1031_slent2`·외드레르 `char_4088_hodrer`·메커니스트 `char_4230_mcnist`)을 선발에도 넣는다(`LOCAL_DIY_PICKS` 끝). 빌드는 시즌마다 그 시즌의 기물 명단을 선발에서 빼므로(`tools/build-data.mjs buildBackups` `roster`) **맹약 시즌 선발에만** 나오고, 규정에서는 지금처럼 기물이다. 키트는 하나: upstream 선발 키트(아래 「새 시즌 사일런스 더 패러디그매틱·외드레르·메커니스트」)를 `SEASON_KIT_FILES`에서 `OPERATOR_KIT_FILES`로 옮겼고, 규정 기물도 `kitKeyOfChar`로 같은 키트를 쓴다.
- 선발 폼: 일반(E2 Lv1, 스킬 4, 모듈 없음)·5티어 정예(E2 Lv60, 스킬 7, 모듈 1단계)·6티어 정예(모듈 3단계). 6티어에서는 규정에 없던 3단계 효과가 온다 — 사일런스 BLS-X 최대 HP·BLS-Y 보호막, 외드레르 CRU-X 가호 31%·물리 대미지 +10%·CRU-Y 첫 타격 기절. 메커니스트의 유일한 모듈 SO-A는 통합 전략 모듈이라 선발로는 고를 수 없다(다른 모드 모듈 거부 규칙, `shared/diy.js isDiyModule` — 아이린·오올헤약 ISW-A와 같음): 선발 메커니스트는 모듈 없음. 키트는 SO-A를 1·3단계 모두 능력치만으로 읽는다(특성·재능 변경은 통합 전략 [몰락자의 흑류수해] 전용).
- 맹약: 세 명 모두 맹약 시즌에서 협방(사일런스 콜롬비아·라인 생명, 외드레르 바벨, 메커니스트 로도스·엘리트·콜롬비아 — 맹약 핵심 맹약에 없음).
- 자동 발동은 맹약 데이터대로(`resolveTrigger`): 외드레르 S3 `DEFAULT`(upstream 선발 시험의 `ACTIVE_RANGE`는 이 엔진에서 해당 없음, 규정과 같음), 메커니스트 S2·S3 `TAKE_DAMAGE`(중장 행).
- 한국어: 사일런스·외드레르는 KR 공식 표. 메커니스트(KR 이름 없음)는 KR 서버 말투 손 번역 [비공식] `tools/i18n/diy-ko-manual.json` — 이름 「메커니스트」(예비 오퍼레이터 Mechanist와 다름), 소환물 「구조적 원리」(KR 표의 같은 중국어 번역), 스킬 「군집 분석」·「협동방어 술식」·「공학 십자성」, 재능 「생명 방정식」, 모듈 「메커니스트의 배지」·「메커니스트의 특근 배지」, 통합 전략 이름 [몰락자의 흑류수해].
- 소리(2026-11-12, 버프 템플릿·투사체 — `audio.js seasonSounds`, `tools/assets/kit-sfx.mjs`): 사일런스 S3 불사 = `slent2_s_3`이 거는 버프의 `audioSignal` `slent2_shallow_grave_audio`(`ON_BUFF_START`, `p_imp_slblessbuff`) — sim `undying`. 메커니스트 S2 보호막이 S2 중에 깨질 때 = `mcnist_s_2_shield` ON_TAKE_DAMAGE의 폭발 갈래(`mcnist_s_2`가 있을 때)의 `PlayAudio mcnist_s_2_shield`(`p_imp_megnrshd`) — sim `shieldBreak` `on` 1, S2가 끝난 뒤 깨지는 갈래엔 소리가 없다. S3 구조적 원리의 돌진 = 투사체 BORN(`p_atk_megnrlgrfspt`)·착지 'aoe'의 REACH(`p_imp_megnrlgrfspt`): `mcnist_s_3_projectile_real`이 배치 방향과 좌우(`CheckFaceLOrR`)로 고르는 여섯 투사체 중 뱅크가 있는 넷은 같은 파일, 위·아래로 놓여 오른쪽을 보는 `_up_right`·`_down_right`엔 뱅크가 없어 무음 — sim `charge`에 좌우 `left`(공격한 대상 쪽, 없으면 배치 방향; 렌더가 돌리는 것과 같은 규칙, `op-mcnist.js chargeGraf`)를 실었다. S3 십자 = 던진 뒤 0.8초 착지에 `ON_CUSTOM_TRIGGER.mcnist_skill_attack_hit`(`p_imp_megnrlg_s`) 한 번 [추정·CN: 그 신호를 내는 노드를 버프 템플릿·프리팹·투사체에서 못 찾음 — CN 전용 클래스로 보임, 피해가 나는 착지에 냄]. 확인: `test/audio-season-sounds-third.test.js`, 목록 `audio-bank-coverage-list.js`·`audio-skill-silence-list.js`의 todo 줄을 지움.
- 시험 `test/content/op_slent2_pick.test.js`(12)·`op_hodrer_pick.test.js`(9)·`op_mcnist_pick.test.js`(10): upstream 선발 시험(`9a3a12ee9^`)을 이 엔진에 맞춤(판 칸 번호 `COLS`, 위 자동 발동) — 모든 선발 폼·모듈, 세 스킬, 재능, 3단계 효과, 소환물, 실제 대전 경로(`test/helpers/diyPickMatch.js`, 세 스킬). 선발 수 39 → 42명.

## 규정 선발 추가 리드 더 플레임 섀도우·엑시아 더 뉴 커버넌트·티티 (2026-11-14, 관리자 결정)
- 관리자 결정 2026-11-14: 맹약에는 기물로 있고 규정에는 기물이 아닌 6성 중 셋(리드 더 플레임 섀도우 `char_1020_reed2`·엑시아 더 뉴 커버넌트 `char_1041_angel2`·티티 `char_4056_titi`)을 선발에 넣는다(`LOCAL_DIY_PICKS` 끝). 위 「선발 추가 사일런스 더 패러디그매틱·외드레르·메커니스트」의 반대 방향이다: 빌드가 시즌마다 그 시즌의 기물을 선발에서 빼므로 **규정 시즌 선발에만** 나오고, 맹약에서는 지금처럼 기물이다. 맹약의 나머지 6성 기물(14명)은 요청이 있을 때만 넣는다(같은 결정).
- 키트: 맹약 기물 키트를 그대로 쓴다 — `ops/op-reed2.js`·`op-angel2.js`·`op-titi.js`는 각 기물 키트(`chess_char_6_08`·`6_13`·`5_02`)를 `shared/chessPick.js chessKitAsPick`으로 감싼 것뿐이다. 기물 키트는 그 기물의 기본 스킬을 키트의 `skill`에, 나머지를 `skills`에 쓰는데 선발 기물은 `skills`에서만 명세를 받으므로(`content/index.js selectSkillSpec`) 기본 스킬(리드 S3·엑시아 S2·티티 S3)을 `skills`에 옮겨 넣고, 선발 기록에는 기본 스킬 표시가 없으므로(백업 폼) 기물의 기본을 표시해 넘긴다 — 리드의 「작열 흔적은 스킬 종료까지」를 S3에만 붙이는 판정(`onDefaultSkill`)이 그 표시를 본다. 수치는 모두 선발 기록에서 읽는다.
- 선발 폼과 기물 폼: 세 기물 모두 E2 Lv1 스킬 4 / E2 Lv60 스킬 7이라 선발 폼과 같다. 리드·엑시아는 6티어 기물이라 모듈 3단계까지 키트에 있고, 5티어 선발 정예의 1단계는 기록이 그 단계 부분만 준다. 티티는 5티어 기물(모듈 1단계)이라 6티어 선발 정예에서 처음 3단계가 오는데, 3단계에서 바뀌는 것은 제1재능의 수치뿐(정지한 적 추가 피해 16% → 31%, 잠든 적 피해 32% → 42%, `talentChanges` 0번)이고 키트는 그 재능 수치를 기록에서 읽는다. 특성은 단계마다 같다.
- 규정 핵심 맹약: 티티 사르곤(세력 태그대로, 공식과 같음), 리드·엑시아 협동방어(`emptyShip`; `backups.json diy.operators[…].bonds`). 관리자 결정 2026-11-15(공식 규정 판에서 확인, 셋 모두): 세력 태그대로면 리드는 빅토리아(`victoria`), 엑시아는 염국(`lungmen`)이지만 공식은 둘 다 협동방어다. 표에는 이를 정하는 필드가 없고 서버가 어떤 규칙으로 정하는지 모르므로 빌드의 예외 표 `tools/build-data.mjs DIY_BOND_OVERRIDES`(시즌별, 그 시즌 선발이 아니거나 시즌에 없는 맹약이면 빌드가 멈춤)에 적었다. 재발 방지: `test/content/diy_act2_chess_picks.test.js` 첫 시험(맹약 확인). 엑시아의 소환물(`token_10056_angel2_target`)은 선발 폼마다 변형이 생긴다.
- 그림·소리·이름: 맹약 기물과 같은 오퍼레이터라 새로 뽑은 것은 없다 [화면 미확인: 규정 선발 화면과 전투에서 확인할 것]. 이름·스킬·재능 설명은 시즌 번역 덮개(`data/i18n/<lang>.act3autochess.json`)에 있어야 보인다 — 선발을 더하면 `node tools/i18n/build-ko-pack.mjs --offline`과 `node tools/build-i18n.mjs --lang <en|ja|zh-TW> --offline`으로 다시 만든다(처음 추가 때 빠져 중국어로 보였음). 재발 방지: `test/i18n-ko-season.test.js` 「every season's 自选 picks read in Korean」(모든 시즌 선발의 이름·스킬·재능·특성).
- 시험 `test/content/diy_act2_chess_picks.test.js`(4): 규정에서만 제공, 키트 일치와 기본 스킬 표시, 모든 선발 폼(6티어 일반, 5·6티어 정예 × 모듈 각각·없음) × 세 스킬을 규정 실제 대전 경로로(`test/helpers/diyPickMatch.js`에 시즌·슬롯·확정 자선 편대 단계를 더함), 티티 3단계 재능 수치. 시즌마다 선발 목록이 다른 것을 보는 시험은 `test/helpers/seasonPicks.js`(목록에서 그 시즌 기물을 뺀 것)를 쓴다. 재발 방지: `test/content/kits_layout.test.js` 「a 自选 kit file op-<codename>.js」가 모든 시즌의 선발을 그 시즌 데이터로 훑어 모든 스킬이 `skills`에 있는지 본다(감싸기를 빼면 티티 S3에서 실패함을 확인). 선발 수 42 → 45명(맹약 42, 규정 12).
- 선발 훑기 시험(2026-11-17): 모든 오퍼레이터 × 스킬을 도는 소리·이펙트 훑기(`test/helpers/audio-sweep.js`를 쓰는 `test/audio-impact-sweep.test.js`·`audio-skill-silence.test.js`·`audio-late-entry.test.js`·`sim/skill-strike.test.js`, `test/render/op-sweep-fx.test.js`)는 맹약 데이터로만 돌아 규정 전용 선발 셋을 뺐었다 — 맹약에서는 셋이 기물이라 선발 폼이 없다. 이제 모든 시즌의 선발을 한 번씩, 그 선발을 처음 내놓는 시즌(맹약 먼저)의 데이터로 돈다: `test/helpers/seasonPicks.js seasonPickList`, 시험 하네스 `makeBattle`의 `season`(그 시즌 데이터 위에 `defs`, 선발·대체 오퍼레이터도 그 데이터로 만듦; 없으면 전과 같이 기본 시즌). 고르기 화면 시험(`test/ui/diy-ui.test.js`)은 시즌마다 모든 슬롯이 그 시즌 선발을 세 스킬로 내놓는지 본다. 소리 훑기(`sweepCases`)의 대체 오퍼레이터 쪽도 같다(2026-11-17): 맹약 기물은 전과 같이 기물 키 이름으로, 그 뒤 앞 시즌이 돌리지 않은 대체 오퍼레이터 × 스킬만 그 시즌 데이터로 `<시즌>/<기물 키>` 이름으로 돈다(규정의 47건: 맹약에 없는 44명, 예 `act3autochess/chess_char_1_05_b` 무스, 그리고 규정에서 S1을 쓰는 에스텔·스펙터·그라벨 — 맹약 기물은 S2). 규정은 맹약의 기물 키를 다른 오퍼레이터에 다시 쓰므로(44명 중 37명) 시즌을 빼면 오류 없이 맹약의 다른 오퍼레이터가 깔린다. 새로 잡힌 넷은 목록에 근거와 함께 적음: 프로스트리프 S2·“레이지 아이언하이드” S1(`test/audio-skill-silence-list.js`), Miss.Christine S2·브리지드 S2(`test/audio-impact-sweep.test.js REPEATED` — 키트 소리 위에 스킬 피해 대체 타격음이 겹침, 둘 다 `audio.js KIT_SOUND_DEF`에 없음, 공식과는 아직 안 맞춰 봄). 재발 방지: `test/render/op-sweep-fx.test.js` 「the sweep fields every season's picks」(시즌을 빼면 규정 선발에서 실패함을 확인), `test/ui/diy-ui.test.js` 「each season's picker lists that season's picks」, `test/audio-impact-sweep.test.js` 「the sweep fields every season's backup operators and skills, each on its season's data」(시즌을 빼면 규정 47건 모두에서 실패함을 확인).

## 안젤리나 더 멜로우 위시 S3 이동 · 「이따 봐!」 표식 (2026-10-11, 관리자 제보)
- 제보 2건: ① S3로 공중 적에게 갈 때 처음 칸에 남는 「이따 봐!」(“一会儿见！”)가 대체 마름모로 보임, ② 공식은 공중 적에게 **직접 날아가는데** 우리는 그 칸에
  **배치**(낙하)됨.
- 근거(CN 클라 데이터, 2026-10-11 설치본 — 이 클래스들은 EN 클라에 없어 데이터 필드만 읽음):
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
  [추정·CN: 이 필드의 뜻 — CN 전용 클래스 `MoveLikeRespawnByProjectileBehaviour`라 메서드를 볼 수 없음; 메서드 이름 `_CheckInAttackAllowProgress`는 「공격 진행도가 허용 범위일 때」로 읽힘, 「착지 뒤 공격 쿨다운을 85%로 둠」일 가능성도 있음]. S3 모드의 공격 능력은 붙을 때 준비 상태라(`Ability.DoAttach` → `Reset`, EN) 이륙 클립 뒤 첫 판정에서 이동이 첫 공격보다 먼저다 [추정·CN: 이동 판정과 공격 상태의 같은 프레임 차례는 그 클래스의 것 — 공식 녹화 요청].
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
- [추정·CN: 吟唱 컴포넌트는 `ChantBeforeSkill`을 이은 CN 전용 `ChantWithProjectileBeforeSkill`(`StartChant`를 덮어씀, 필드 `m_waitByProjectile`·`m_buffOnAfterEndAnim`)이라 메서드를 볼 수 없음. EN `ChantBeforeSkill.StartChant`는 begin·loop·end 클립 뒤 `DoStartSkill`을 부르고 `_afterEndAnim`은 없다] 복귀 = 끝 클립이 끝날 때(`_interruptProjectileOnEndAnim` + `_afterEndAnim` — 도착 0.67 + 1 + `Skill_2_Begin` 1 ≈ 吟唱 2.5초와 맞음), `Skill_2_Begin`이 吟唱 안이고 스킬 시작(공격)이 그 뒤라고 둠(공식 녹화 요청),
  `height_offset`이 칸(월드) 단위(비행 적의 0.35는 0.27 캐릭터 공간), 속도 일정(이동 컴포넌트의 속도 곡선 ≈0.95–1.13·`_speed` 4.8은 안 씀, PRTS 6.0), 복귀는 순간 이동(`_restoreOnEnd`), 활공 중 바닥 높이는 그녀 칸 기준,
  `Skill_2_Begin`(1초)의 마지막 0.17초 남짓 동안 시뮬은 이미 공격할 수 있음(吟唱 2.5초 뒤).
- 테스트: `test/content/op_aglna2.test.js`(맵 끝에서 2칸·열린 곳 4칸, 위치 불변), `test/render/aglna2-s2-glide.test.js`(클립 순서·공격 대기·스킬 끝 처리,
  뷰 이동·도착 즉시 끝 클립·도착 + 1초 복귀·0.8까지 1초 상승).

## 맹약별 선발 프리셋 (2026-10-09, 관리자 결정)
- 공식에 없는 기능(`feat`). 채팅 맹약(`shared/local.js CHAT_FACTIONS`, 8개 국가)마다 브라우저에 자선 편성 프리셋을 하나씩 둔다(`public/js/ui/diyPresets.js`).
  저장 `localStorage sp.pref.diyPresets = { v: 3, presets: { [맹약]: picks }, base, active, links }`(각 편성은 선발 편성과 같은 `cleanPicks`, 빈 맹약 편성은 저장하지 않음;
  `base` 없는 v1은 「프리셋 없음」이 보이던 경우 지금 편성을 `base`로 읽음; `links`는 아래 「전략별 선발 프리셋」, v2에는 없음).
- 관리자 결정(2026-10-09): 채팅에서 맹약을 고르면 그 맹약 프리셋을 자동 적용하고, 입력칸 위에 「염국 프리셋을 선발 편성에 적용했습니다 · 되돌리기」(10초, `PRESET_NOTICE_MS`)를 띄운다.
  프리셋이 없는 맹약을 고르면 아무것도 바꾸지 않는다(남아 있던 알림도 지움). 브리핑에서 선발 편성을 바꾸는 기능은 넣지 않음(프리셋으로 충분) — 같은 날 아래 「적용 시점」 결정으로 바뀜.
  기본 프리셋은 없고, 플레이어가 맹약별로 만든다.
- 자선 편성 탭(`screens/diy.js DiyPresetBar`) 위의 「맹약 프리셋」 줄: 「프리셋 없음」 + 8개 맹약. 저장된 맹약은 테두리·색이 차고, 빈 맹약은 점선.
  - 「프리셋 없음」과 각 맹약은 **서로 다른 편성**을 갖는다(관리자 제보 2026-10-09: 처음 구현은 빈 맹약을 누르면 지금 편성을 복사했다 — `base`로 고침).
    칩을 누르면 그 편성을 보여 준다. 프리셋이 없는 맹약은 빈 편성에서 시작하고, 거기에 넣으면 그 맹약 프리셋이 된다(다 비우면 다시 프리셋 없음).
  - 보이는 편성을 바꾸면(칸·비우기·모두 비우기·가져오기) 그 칩의 편성에 저장된다(`installDiyPresets`가 `loadoutStore.diy`를 따라감). 다른 칩의 편성은 그대로.
  - 「염국 프리셋 삭제」(그 맹약에 편성이 있을 때만) → 프리셋을 지우고 「프리셋 없음」 편성으로 돌아감.
- 적용 시점(관리자 결정 2026-10-09, 두 번째 — 「사람들은 보통 전략 선택 단계에서 맹약을 고른다」): 맹약 선택이 프리셋을 적용하는 것은 **대기실, 그리고 경기의 브리핑·전략 선택 단계**뿐이고,
  그때는 **지금 판에도** 바로 반영된다(`room.diy` → `server/lobby.js` → `match.setDiy`, `server/match/match/platform.js`). 선발 재고는 정비 단계의 상점·보상·효과에서 처음 쓰이므로
  다시 만들어도 무작위 결과가 달라지지 않는다. 그래도 재고에서 한 장이라도 나갔으면 거부한다. 정비 단계부터는 맹약을 바꿔도 **태그만** 바뀌고 그 판의 선발·저장된 편성·프리셋은 그대로다
  (`ui/factionPick.js presetPickLive`). 자선 편성 탭에서 직접 고친 편성도 같은 규칙(브리핑·전략 선택이면 지금 판, 그 뒤면 다음 판).
  처음 구현은 「판 시작 때 고정, 다음 판·다시 뽑기부터」였다 — 그때의 「브리핑에서 선발 편성 변경은 안 함」은 이 결정으로 바뀜.
- 전략 선택 화면 선택 순서 아래 「맹약 선택」 줄(`DraftFactionPicker`)은 2026-10-13에 뺐다(관리자 요청: 전략별 선발 프리셋 줄이 대신한다, 아래 절).
  그때까지는 협동이면 채팅 맹약과 같은 선택, 싱글은 프리셋만 적용했다.
- 경기 중 맹약 선택기: 이번 판에 꺼진 맹약(`m.public.disabledBonds`)은 흐리게 하고 「금지」 표시. 고를 수는 있다.
- 데이터 사정: 선발 5명 중 국가 맹약이 있는 것은 염국(왕·첸 더 던스트릭)뿐이고 위셔델·토가와 사키코·아스카론은 `emptyShip`이라, 「추천 프리셋」을 데이터로 만들 수 없었다(기본 프리셋이 없는 이유).
- 확인: `test/ui/diy-presets.test.js`(저장 형식, 막대로 만들기·적용·연결·삭제, 연결된 편성 따라가기, 채팅 적용·되돌리기·프리셋 없는 맹약, 막대 그리기, 적용 단계,
  「switching never copies them」), `test/match/diy-midmatch.test.js`(브리핑·전략 선택에서 setDiy → 선발·재고·m.private, 정비 단계·재고 나감 → 거부),
  `test/lobby-info-reroll.test.js`(실제 서버로 room.diy). Chrome: 탭 막대의 맹약 전환(편성이 서로 섞이지 않음), 협동 전략 선택 줄에서 맹약 선택 →
  그 판 선발·채팅 태그·채팅 선택기가 함께 바뀜, 정비 단계 맹약 선택 → 태그만, 싱글 전략 선택 줄 → 그 판 적용, 대기실 맹약 선택 → 편성 적용·알림,
  꺼진 맹약 흐림 + 결석, 휴대폰 가로(844×390). 결석 카드 깨짐(관리자 제보 2026-10-09)은 선택기 칸 `minmax(0, 1fr)`·글자 줄임으로 고침.

## 전략별 선발 프리셋·편성 확인 (2026-10-12, 관리자 결정; 편성 확인은 2026-10-13에 끔)
- 공식에 없는 기능(`feat`). 관리자 제보: 전략 선택에서 마지막 사람이 고르면 바로 다음 단계라 선발 프리셋을 고를 시간이 없다. 관리자 결정(2026-10-12):
  전략과 맹약 프리셋을 묶고, 마지막 선택 뒤에 편성 확인 10초를 둔다. 시안을 보고 정함(2026-10-12).
- 연결: `diyPresets.js links = { [bandId]: 맹약 | 'base' | 'keep' }`(브라우저별, 프리셋과 같은 저장). 전략 하나는 프리셋 하나에만 연결된다. 맹약 프리셋은 그대로 맹약별로 하나.
  `'keep'`은 끈 추천이다(관리자 요청 2026-10-13: 추천으로 연결된 전략도 해제할 수 있게) — 그 전략은 추천 맹약 대신 기본값(2026-10-29부터 「프리셋 없음」), 전략 선택 화면에서도
  연결이 없는 것으로 보인다(「연결됨」·「추천」 태그 없음, 카드 맹약 배지 없음; 관리자 결정 2026-10-13).
- 전략이 고를 편성(`bandPresetChoice`): 이번 판에 고른 값 → 저장된 연결 → **추천**(전략 중심 국가 맹약: `bands.json bondIds` ∩ 채팅 맹약, 40개 중 9개 — 파가니니 → 라테라노 등,
  `bandRecommendation`; 추천을 끈 전략은 건너뜀. 그 맹약 프리셋이 있을 때만) → **「프리셋 없음」**(관리자 결정 2026-10-29). 그전 마지막 단계는 「지금 편성 유지」(`keep`, 아무것도 안 바꿈)였는데,
  판 전에 탭에서 고른 맹약(예: 염국)이 자기 편성이 없는 모든 전략에 그대로 나왔다(관리자 제보 2026-10-29). 「지금 편성 유지」는 이제 그 판 선택 상자에서 고를 때만.
  기본값으로 정해진 「프리셋 없음」은 「이 전략에 기억」이 켜져 있어도 연결로 저장하지 않는다(선택 상자에서 직접 골랐을 때만) — 나중에 추천 맹약 프리셋을 채우면 그게 적용되도록.
  저장된 연결이 빈 맹약을 가리키면 그건 플레이어 설정이라 그대로 두고, 그 맹약의 빈 편성을 적용한다(아래).
- 전략 선택 화면 상세 창 「선발 프리셋」 줄(`screens/bandDraft.js DraftPresetRow`): 선택 상자(`PresetPicker` — 맹약마다 앞에 아이콘을 넣으려고 직접 만든 드롭다운, 관리자 요청 2026-10-13; 목록은 상세 창 위에 떠서 열림 — 버튼 아래, 아래 자리가 없으면 위. 창이 커지지 않게, 관리자 요청 2026-10-13. 스크롤·창 크기 변경이면 닫힘. 지금 편성 유지(✓) · 프리셋 없음(−) · 8개 맹약.
  글자 대신 아이콘 상태로(관리자 결정 2026-10-13): 빈 맹약은 아이콘에 맹약 색을 칠하지 않음(회색, 관리자 요청 2026-10-13 — 처음엔 흐림 + 점선 테두리), 결석 맹약은 브리핑과 같은 공식 `img_bond_banned`를
  아이콘 오른쪽 위에(공식 배치, 로컬 소재가 없으면 이름만 흐림). 뜻은 툴팁), 태그(연결됨 · 추천 · 금지), 그 편성의 4칸 미리보기(칸마다 오퍼레이터 아이콘을 공식 정보 화면처럼, 칸 상자 대신 공식 흰 카드 `img_chess_bkg` 위에, 이름은 툴팁 — 관리자 요청 2026-10-13; 단계 그림은 아래 티어 묶음에 한 번. 그 오퍼레이터의 맹약이 이번 판에 전부 꺼져 있으면 서버 `initDiyStock`과 같은 판정(`diyPickOff`)으로 결석 표시: 오른쪽 위 빨간 `img_chess_banned`, 툴팁 「금지」, 관리자 요청 2026-10-13), 「이 전략에 기억」
  (기본 켬: 적용할 때 그 값이 연결로 저장, 「지금 편성 유지」는 저장 안 함). 연결된 전략 카드 오른쪽 아래에 맹약 배지.
  이 줄이 있어도 상세 창은 스크롤되지 않는다(관리자 요청 2026-10-13): 효과 글 상자가 남는 높이를 받아 제 안에서 스크롤하고, 휴대폰처럼 낮은 화면(높이 500 이하)은
  「초기 HP」 줄을 빼고(격자 카드에 있음) 큰 아이콘을 더 줄인다. 창 자체의 스크롤은 그래도 모자랄 때만.
  내 선택이 확정된 뒤에는 그 전략의 줄에서 값을 바꾸면 **바로 적용**(편성 확인 중 덮어쓰기도 이것으로). 다른 전략의 줄은 잠긴다. 전략 선택 화면에는 「…프리셋을 적용했습니다 · 되돌리기」 알림을 두지 않는다
  (관리자 요청 2026-10-13: 필요 없음 — 채팅의 맹약 선택 알림은 그대로).
  4칸은 티어별 두 묶음 `[V ▢ ▢] [VI ▢ ▢]`(관리자 결정 2026-10-13, 시안 넷 중 고름 — 아이콘마다 같은 배지가 되풀이되고 빈 칸만 모양이 달라 어색했음): 묶음마다 판 하나 —
  공식 정보 화면의 묶음 띠(`prefab_auto_chess_stage_info_chess_banned_group`의 `img_content_bkg` = rgb(31, 31, 31) 40 %)를 클라에서 그 띠가 깔리는 어두운 목록 판(브리핑
  `.brief-banned`과 같은 색) 위에 깔아 상세 창 위에서 상자로 보이게 함(공식에 칸마다 상자를 그리는 스프라이트는 없음) — 과 그 아래 티어 색 줄. 티어 배지는 묶음 앞에 한 번,
  아이콘 아래 끝에 맞춤(다른 화면에서 아이콘마다 배지가 붙는 왼쪽 아래 자리), 툴팁은 「N티어 선발 · 보급센터 레벨 N부터 상점에 등장」. 아이콘 자체에는 배지를 안 붙인다.
  빈 칸은 흐린 카드에 「+」 — 누르면 선발 편성 탭이 열리며 그 칸의 오퍼레이터 선택 창(그 티어 목록)이 바로 뜬다. 편성된 칸은 마우스를 올리면 바꾸기 아이콘이 뜨고(어두운 막과 민트 틀은 초상만이 아니라 흰 카드 전체를 덮음, 관리자 요청 2026-10-13), 누르면
  그 칸의 「바꾸기」와 같은 선택 창(지금 오퍼레이터가 골라진 채)이 뜬다(둘 다 「선발 편성 수정」처럼 선택 상자의 편성으로 탭을 엶, 잠긴 줄에서는 안 됨; `openLoadout`의
  `diySlot` → 스토어 `diyPick`을 `DiyPanel`이 한 번 받음. 관리자 요청 2026-10-13). 이렇게 연 선택 창은 「확인」이든 「취소」(×)든 닫으면 오퍼레이터 구성 화면도 닫고
  전략 선택으로 바로 돌아온다(관리자 요청 2026-10-13, 처음엔 확인만; 탭 안에서 직접 연 칸은 그대로 탭에 남음). 편성된 칸에서 연 선택 창에는
  「비우기」도 있어 그 칸을 비우고 같은 식으로 돌아온다(탭 안에서 연 선택 창도 같음). 편성된 칸의 오른쪽 위 ×(아이콘 모서리 안의 네모 칩, 아이콘의 약 28 %; 마우스를 올리거나 포커스일 때. 터치 화면에는 없음 — 휴대폰에서 아이콘 26 px·칩 12 px라 손가락으로 못 맞히고 3 px 빗나가면 선택 창이 열려서, 거기서는 칸 → 선택 창 「비우기」, 관리자 결정 2026-10-13)는
  탭을 열지 않고 선택 상자의 편성에서 그 칸만 비운다(`clearRosterSlot`: 지금 보이는 편성이면 지금 편성을 고쳐 방에 동기화, 다른 맹약·프리셋 없음이면 그 저장본만 고치고
  지금 편성은 그대로 — 맹약의 마지막 칸을 비우면 탭의 「비우기」처럼 그 프리셋이 없어짐; 잠긴 줄에서는 없음. 관리자 요청 2026-10-13: 그전엔 「선발 편성 수정」으로만
  뺄 수 있었다). 선택 상자의 맹약은 비어 있어도 **그 맹약의 편성**이다(`diyPresets.js choiceRoster`, 관리자 결정 2026-10-29): 빈 칸 넷으로 보이고, 칸의 +·바꾸기·×와 「선발 편성 수정」은 그 맹약 프리셋을 고치고(채우면 프리셋이 생김), 확정하면 그 빈 편성이 적용되어 선발이 비워진다(`applyFactionPreset` `orEmpty` — 채팅의 맹약 선택은 그대로 「아무것도 안 바꿈」). 선택 상자가 곧 보이고 고쳐지는 편성이라 저장 위치를 따로 적지 않는다(관리자 요청 2026-10-29 — 하루 동안 칸 아래 「수정 저장 위치: …」 줄이 있었음). 경위: 2026-10-28 제보 두 건(사르곤 칸이 비어 보였는데 지금 편성의 첸 더 던스트릭이 상점에 나옴; 다른 맹약 줄의 빈 칸에 넣은 클레멘티아가 적용되지 않은 그 맹약 프리셋에 들어가 있었음) — 빈 맹약이 「안 바꿈」이라 판에 들어간 것은 지금 편성이었다. 같은 날 빈 맹약 줄이 지금 편성을 보여 주고 고치게 했더니, 연결된 빈 맹약(페페 → 사르곤)과 선택 상자로 고른 빈 맹약이 탭에 남은 다른 맹약(빅토리아)을 보여 주고 저장 위치도 바뀌지 않아(관리자 제보 2026-10-29) 지금처럼 바꿨다. 좁은 창(폭 1000 이하 30 px, 900 이하 26 px — 휴대폰 가로 상세 창은 약 200 px)에서는 아이콘·간격을 줄여 네 칸이 판 안에 들어간다.
  아래 줄 오른쪽 「선발 편성 수정」은 오퍼레이터 구성 화면의 선발 편성 탭을 선택 상자의 편성으로 연다(맹약·프리셋 없음이면 `selectPreset` — 그 탭의 맹약 줄을 누른 것과 같아서
  지금 편성도 그 편성으로 바뀌고 판에 바로 들어감, 지금 편성 유지면 지금 편성; 다른 전략 줄처럼 잠긴 줄에서는 꺼짐. 관리자 요청 2026-10-13).
  선택 순서 목록 아래에는 브리핑처럼 「오퍼레이터 설정」 입구(`LoadoutButton`, `from: 'draft'`)가 있다 — 전략 선택이 끝나면 닫힌다(`shouldAutoClose`). 이때 선발 편성 탭의
  안내는 「전략 선택이 끝나기 전까지는 수정하면 이번 판에 바로 적용」(서버 `match.setDiy`가 브리핑·전략 선택 동안 받음). 오퍼레이터 설정(스킬·모듈·잠재능력·육성도, 선발 오퍼의 잠재·육성도 포함)도 같은 창이다:
  서버 `match.setLoadout`이 브리핑·전략 선택 동안 받고, 내 선택을 확정한 뒤에도 전략 선택이 끝날 때까지 이번 판에 들어간다(관리자 결정 2026-10-14 —
  전에는 브리핑이 끝나면 잠겨서, 전략 선택 중 선발 오퍼를 바꾸면 오퍼는 이번 판·그 잠재·육성도는 다음 판으로 갈렸다). 그 뒤 고친 것은 다음 판(화면은 막지 않고 잠김 안내만).
- 적용 시점: **내 선택이 확정될 때**. 「선택 확인」은 적용 → `room.diy` 즉시 전송(`loadoutSync.js flushDiySync`, 싱글은 이 선택으로 전략 선택이 끝나므로) → `g.band` 순서.
  시간 초과·AI 대행으로 정해진 선택도 확정되는 순간 적용(판마다 한 번, `presetAppliedFor`). 강조만 해서는 적용하지 않는다(미리보기만).
- 맹약을 적용하면 **채팅 맹약도 같이 바뀐다**(관리자 결정 2026-10-12, 채팅의 맹약 선택과 같은 `chooseFaction`). 「프리셋 없음」 연결은 `applyBasePreset`(알림 「선발 편성을 「프리셋 없음」으로
  바꿨습니다」, 채팅 맹약은 그대로). 이번 판 결석 맹약도 **그대로 적용**하고 알림에 「금지」(관리자 결정 2026-10-12). 프리셋이 빈 맹약은 그 빈 편성을 적용한다(선발 비움, 관리자 결정 2026-10-29 — 그전엔 편성은 그대로, 채팅 맹약만 바뀜).
  협동에서 서버가 채팅 맹약을 거절해도(재사용 대기·오프라인) 그 맹약 프리셋은 적용한다(`factionPick.js applyPresetChoice`, 2026-10-28 — 전에는 거절되면 편성이 말없이 그대로였다).
- **꺼짐(관리자 결정 2026-10-13)**: 협동에서 전략 선택이 끝난 뒤의 편성 확인 10초를 뺐다. 지우지 않고 `phases.js startDraftTurn`의 호출만 주석 처리 —
  마지막 선택이 끝나면 바로 다음 단계. 함수·`g.draftReady`·화면 코드(`m.public.draft.confirm`이 없으면 아무것도 안 그림)·테스트(`test.skip`)는 그대로 두어 되살릴 수 있다.
  아래는 켜져 있던 때의 동작.
- 편성 확인(`server/match/match/phases.js enterDraftConfirm`, `common.js DRAFT_CONFIRM_SECONDS` 10): 시간 제한 있는 전략 선택(사람 2명 이상)에서 모두가 고른 뒤
  BAND_DRAFT를 10초 더 유지한다 — `match.setDiy`가 그대로 받으므로 선발 프리셋 줄로 편성을 덮어쓸 수 있다. 연결된 사람 중 AI 대행이 아닌 사람이 모두 「준비 완료」(`g.draftReady`)
  하면 바로 끝. 나가기·연결 끊김·AI 대행 전환도 다시 확인. `m.public.draft.confirm { deadline, seconds }`, `players[].confirmReady`, 헤더 카운트다운 = 이 창.
  싱글·사람 혼자인 판은 시간 제한이 없어 이 창도 없다(자기 차례에 시간 제한 없이 고르고, 확인 순간 적용되므로).
- 판 밖 선발 편성 탭(`screens/diy.js PresetBandLinks`): 맹약 프리셋 줄 아래 「연결된 전략」 — 보이는 편성(맹약·프리셋 없음)을 적용하는 전략 칩(전략 아이콘 + 이름, × 해제),
  그중 연결 없이 추천으로 적용되는 것은 점선 「추천」 칩이고 ×로 추천을 끈다(`toggleBandLink` → `'keep'`, 관리자 요청 2026-10-13). 「+ 전략 연결 ▾」는 전략 40개의
  아이콘 격자를 탭 위에 띄운다(관리자 결정 2026-10-13, 시안 A(아이콘 목록)·B(아이콘 격자) 중 B; 버튼 아래, 자리가 없으면 위 — 아래 칸을 밀지 않음. 바깥 누름·Esc·스크롤·창 크기
  변경이면 닫힘, Esc는 오퍼레이터 구성 화면을 닫지 않음). 타일 하나가 켜고 끄는 단추: 이 편성을 적용하는 전략은 민트 테두리 + ✓(추천이면 점선) — 누르면 해제(추천은 끔),
  다른 편성을 적용하는 전략은 아이콘을 흐리게 하고 오른쪽 위에 그 맹약 아이콘(프리셋 없음은 −) — 누르면 이쪽으로 옮김(이 맹약 추천 전략은 연결을 지워 다시 추천으로), 나머지는
  누르면 연결. 아래에 범례 한 줄(낮은 화면 — 높이 500 이하 — 에서는 빼고 툴팁만). 좁은 창(폭 900 이하)은 10열.
- 확인: `test/ui/diy-presets.test.js`(연결 저장·v2 호환·해제·추천 9개·선택 순서·프리셋 없음 적용·되돌리기·탭 칩·프리셋 없는 맹약 줄의 미리보기·저장 위치·× (2026-10-28)·채팅 맹약 거절 때 적용), `test/ui/bandDraft.test.js`(미리보기·태그·편성 확인 헤더),
  `test/match/draft.test.js`(편성 확인: 10초·준비 완료·AI 대행·끊김·혼자면 없음·`setDiy` 허용). 화면: 로컬 Windows Chrome(2026-10-13) — 협동 2인에서
  추천 적용(그 판 선발·채팅 맹약·결석 알림)·카드 배지·편성 확인 중 맹약 덮어쓰기·준비 완료 → 협의 시작, 솔로 연결 적용(선택 즉시 그 판 선발), 휴대폰 가로(상세 창 스크롤,
  처음엔 효과 문구가 사라져 `57a46f47`로 고침), 선발 편성 탭 연결 칩. 아이콘 격자(2026-10-13): 1600×900·1280×720·844×390에서 격자 위치·스크롤 없음,
  추천 타일 끄기/켜기·추천 칩 ×·다른 맹약 연결 옮기기·Esc(구성 화면은 그대로)·바깥 누름, 빅토리아 편성의 추천 칩.

## 규정 선발 프리셋 — 시즌별 저장과 3/3 선택 (2026-11-13, 관리자 결정)
- 공식에 없는 기능(`feat`). 위 두 절(맹약별·전략별 선발 프리셋)을 규정의 12칸 편성과 「3/3 선발 편성 확정」에 맞춘 것이다. 맹약 시즌의 화면·동작은 그대로.
- **시즌별 저장**: 프리셋·연결은 시즌마다 따로다 — 기본 시즌은 지금 키 `sp.pref.diyPresets`, 다른 시즌은 `sp.pref.diyPresets@<시즌>`(편성 `diy`와 같은 `seasonPref`). 보이는 시즌이 바뀌면 `ui/diyPresets.js setPresetSeason`이 그 시즌 것을 읽고, 그다음에 편성이 바뀐다(`main.js` — 순서가 바뀌면 편성 따라가기가 한 시즌의 편성을 다른 시즌의 프리셋에 저장한다). 규정은 프리셋 없이 시작한다.
- **시즌별 맹약**: 채팅 맹약과 프리셋 맹약은 그 시즌의 나라 맹약(`bonds.json` `bondType` SEASON)이다 — 맹약 8개(라테라노 포함), 규정 10개(라테라노 없음, 우르수스·이베리아·라이타니엔 있음; `shared/local.js chatFactionsOf`). 새 셋의 색은 우리 것이다(우르수스 #c8ccd2·이베리아 #2fb67a·라이타니엔 #9a6ae0). 서버는 방 시즌의 맹약만 받는다(`server/local-patch.js`, 다른 시즌 맹약은 `BAD_MSG`). 전략의 추천 맹약(`bandRecommendation`)도 그 시즌 목록에서 찾는다.
- **3/3에서 고름**(관리자 결정 2026-11-13, 안 B): 규정의 전략 선택 상세 창에는 프리셋 줄이 없다(공식처럼; 12칸 미리보기가 상세 창을 옆으로 늘이던 관리자 제보). 전략을 고르면 그 전략의 프리셋(연결 → 추천 맹약 프리셋 → 프리셋 없음)이 지금처럼 적용되고, 「3/3 선발 편성 확정」 화면의 카드 줄 위 띠(`screens/diyChoose.js DiyPresetBox`)에 그 값이 골라져 있다. 목록은 「프리셋 없음」과 시즌 맹약(「지금 편성 유지」 없음 — 카드가 지금 편성). 바꾸면 그 편성을 적용하고 바로 보내며(채팅 맹약도 같이 바뀜), 서버는 준비 완료 전까지 새 편성을 받는다(위 「규정 선발 편성 12칸과 선발 편성 확정 단계」). 고른 카드는 같은 오퍼레이터가 그 칸에 남을 때만 남는다. 「이 전략에 기억」(기본 켬, 맹약 시즌과 같음, 관리자 결정 2026-11-13)이면 고른 값이 그 전략의 연결이 된다. 준비 완료 뒤에는 잠긴다. 채팅에서 맹약을 골라도 이 단계(준비 전)에는 프리셋이 적용된다(`ui/factionPick.js presetPickLive`).
- 확인: `test/ui/diy-presets.test.js`(시즌별 저장·시즌 맹약·전환 순서·3/3 적용 단계), `test/local-patch.test.js`(시즌 맹약 = 시즌 나라 맹약, 맹약 방에서 우르수스 거부), `test/match/diy-choose.test.js`(3/3 동안 새 편성·같은 오퍼레이터만 고른 채로·준비 뒤 거부). 화면: 로컬 Windows Chrome(2026-11-13) 1600×900·휴대폰 터치 844×390, 규정 연합 4인(AI 셋) — 전략 선택에 줄 없음, 3/3 상자(연결·추천 태그, 목록 10개 맹약), 우르수스로 바꾸면 서버 편성이 바뀌고 고른 카드는 그대로인 「왕」만 남음, 연결 저장·채팅 맹약 전환, 규정 방 채팅 맹약 10개. 준비 뒤 잠김은 화면으로 못 봄(사람 혼자면 준비하자마자 단계가 끝남).

## 선발 기본 스킬 (2026-10-11, 관리자 결정)
- 자선 편성 칸에서 오퍼레이터를 새로 고르면 시작 스킬은 마지막 스킬(S3)이다(`public/js/ui/diyModel.js defaultPick`). 관리자 결정(2026-10-11): 위셔델(维什戴尔)·
  아스카론(阿斯卡纶)·켈시 에스페란타(凯尔希·思衡托)는 **S2**에서 시작한다(`shared/local-diy.js LOCAL_DIY_DEFAULT_SKILL`). 시작 선택만 바뀌고 다른 스킬은 그대로 고를 수 있다.
  이미 저장된 편성(`sp.pref.diy`·프리셋)의 스킬은 바꾸지 않는다. 테스트 `test/ui/diy-ui.test.js` 「defaultPick」.

## upstream 0.2.4 이식 — 선발 선택 창 상세 (2026-10-11, 관리자 결정)
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
- 우리 것 유지: 맹약 프리셋 줄, 선발 드래그 카드, 슬롯 카드의 잠재·육성도 선택, 필터 칩 없음(원형 없음, 관리자 결정 2026-10-07), 목록은 카드 격자
  그대로(upstream은 같은 커밋에서 목록을 구성 화면처럼 한 줄씩 늘어놓는 표로 바꿨다 — 우리 선발은 8명이라 받지 않음), 글자 크기 변수(`--t`)는
  우리 CSS에 없어 그 hunk는 받지 않음.
- 테스트: `test/ui/diy-ui.test.js` 「the picker detail (upstream 0.2.4)」(일반/정예화 전환마다 S1 수치·SP가 sim def와 같음, Lv 표기, 잠재·육성도 줄),
  `test/ui/loadout-stats.test.js`(upstream: `LoadoutStats`가 `ui/loadoutStats.js`에서 옴). [실제 판 이상 없음 2026-10-28]

## 아스카론 死亡拘审 틱 간격 (2026-10-11 확인)
- 키트 `op-ascln.js`의 `interval: 1`(1초마다)은 공식과 같다. 클라 버프 템플릿 `ascln_t_1[debuff]`의 `triggerInterval` 2.0은 기본값일 뿐이다:
  공식 클라 `Buff.Reset`이 틱 타이머 주기를 버프 블랙보드의 `interval`로 읽고(없을 때만 템플릿 값), 재능 블랙보드에 `interval` 1.0이 있다
  (설명 「每秒受到…」과 같음). 이 메서드는 en_US·zh_CN Lua 핫픽스 목록 밖. 다른 키트에서 템플릿 `triggerInterval`을 볼 때도 블랙보드 `interval`을 먼저 확인할 것.

## 새 시즌 기물을 표 전에 만들기 (2026-11-05, 관리자 결정)
- 새 시즌 「규정」의 표가 나오기 전에 키트 없는 오퍼레이터를 미리 만들었다. 기물은 그 시즌에만 두고 선발에는 넣지 않는다.
- 2026-11-08 표가 들어와 임시 시즌 `next`·명단·`tools/next-season.mjs`를 지우고 실제 시즌 `act3autochess`로 바꿨다(`node tools/build-data.mjs --offline --season act3autochess` → `data/seasons/act3autochess/`, 표 읽기는 `docs/DATA.md` 「Seasons」).
  명단의 기물 68개(두 형태)는 모두 실제 기물이 있고, 티어·정예화·레벨·스킬 레벨은 그대로 맞았다. 다른 것은 기본 스킬(예: 바이슨·프랜카·블루포이즌·안드레아나·아스트젠은 1번 스킬)과 새 맹약(이베리아·우르수스·라이타니엔 등)뿐이라, 키트는 스킬을 모두 쓰는 그대로 둔다.
- 키트: `ops/op-<코드명>.js`, 키는 charId, `SEASON_KIT_FILES`에 적는다. 선발 후보(`KITTED_CHARS`)에는 들어가지 않는다.
- 규정은 지난 시즌의 기물 ID를 다른 오퍼레이터에 쓴다(두 시즌에 다 있는 오퍼레이터 기물 ID 128개 중 125개). 기물 키트 파일은 그 파일을 쓴 오퍼레이터에게만 간다(`kitOf`·`chessKitCode`); 다른 오퍼레이터의 기물은 그 오퍼레이터의 키트(`kitKeyOfChar`)를 받는다 → `test/seasons-act3.test.js`.
- 아레나에서 보기: `/debug.html?season=act3autochess&op=<charId>`. 시즌 파일은 화면과 전투가 함께 읽고, 공개 시즌만 고르는 방 목록과 달리 `SP_SEASONS`가 필요 없다.
- 실제 대전 경로 시험(`test/helpers/seasonPieces.js realMatch`)은 규정의 기물·맹약·장비·특질을 지금 시즌의 전장·모드·웨이브·적에 놓는다: 키트 시험이 규정 방의 모드 ID(지금 시즌과 다름)나 새 적의 동작에 묶이지 않게. 규정 자기 전장·웨이브·적의 실제 판은 `test/seasons-act3-stages.test.js`(rules/sim.md 「규정 전장을 19×21 틀로」).
- 규정 상점 기물 143명 × 두 형태를 그 시즌 스킬로 세운 시험(`test/seasons-act3-pieces.test.js`): 키트가 있는 136명은 모두 스킬 명세를 키트에서 받고, 시전하고, 적에게 피해를 주거나 아군을 치료하며 처리기 오류가 없다. 키트가 없는 7명은 시험의 목록에 있다(2026-11-08 사일런스 더 패러디그매틱·외드레르·메커니스트의 키트로 10 → 7).
  - 티어가 바뀌며 기본 스킬이 바뀐 오퍼레이터 11명(예: 그라벨 S1, 스카디 S2, 사리아 S1, 실버애쉬 더 레인프로스트 S3)은 모두 키트가 스킬마다 명세를 쓴다. 스킬 하나만 쓴 키트는 지난 시즌 기본 스킬용이라, 규정이 같은 스킬을 줄 때만 그 키트를 쓴다(시험이 지킨다).
  - 모듈은 기물 기록의 블랙보드를 읽어 단계가 바뀌어도(예: 6티어에서 4티어로 내려간 정예의 3단계 → 1단계) 키트를 고칠 곳이 없다. 수르트는 규정에서 모듈 AFT-Y(`uniequip_003_surtr`)로 바뀌는데, 키트가 이미 그 특성(저지한 적 법술 취약)을 읽는다. 실버애쉬 더 레인프로스트가 새로 받은 모듈 CSR-X(`uniequip_002_svash2`)는 배치 비용과 대기 구역 「风雪之眼」 효과뿐이라 이 모드에서는 하는 일이 없다(첫 배치는 무료, 대기 구역 없음 — 팽 더 파이어 샤픈드 재능 1과 같다).
  - 클레멘티아 S3의 `projectile_life_time`은 2026-11-01 표부터 3.5초다(그 전 5초). 키트가 블랙보드를 읽는다. 규정 기물은 S2라 그 값은 선발에서만 쓰이고, 규정의 선발 후보에 그녀는 없다.

## 2026-11-01 표의 오퍼레이터 변화를 지금 시즌에도 (2026-11-08, 관리자 결정)
- 지금 시즌 데이터도 2026-11-01 뒤의 공식 표로 만든다. 전 결정(2026-11-06)은 「그 업데이트의 변화는 새 시즌에만」이었는데, 오퍼레이터 쪽은 두 시즌 모두로 바꿨다. 적 표(`enemy_handbook_table`·`enemy_database`)는 활동 표처럼 그 전 커밋에 고정해 가상적: 총(`enemy_9017_achunt`·`_2`, 저지 불가는 돌진 중에만, 무게 8 → 10)은 지금 시즌에서 옛 동작 그대로다(`tools/gamedata-url.mjs PINNED_GAMEDATA`).
- 그 표로 바뀌는 것은 둘뿐이다(다시 만든 `data/` 대조): 클레멘티아 S3 투사체 수명 5 → 3.5초(선발), 정예 기물이 고를 수 있는 새 모듈 넷.
  - 혼 ISW-A(「혼의 특별 한정 배지」, `uniequip_004_horn`): 특성은 통합전략에서만 효과가 있어 이 모드에서는 능력치만 더한다.
  - 실버애쉬 더 레인프로스트 CSR-X(「초대」, `uniequip_002_svash2`): 배치 비용 효과라 능력치만(위 절). 지금 시즌 정예 기물은 기본 모듈이 없어 「모듈 없음」이 기본이고, CSR-X는 고를 수 있는 것으로만 더해진다.
  - 뮤엘시스 TAC-D(「'뮤엘시스와 친구들'」, `uniequip_004_mlyss`): 그녀와 유동체(그녀의 지원군)가 준 대미지의 12%를 침식 손상으로 더 준다. 재능 「청정수는 생명」 변경: 그녀나 유동체의 공격 범위 안 적이 침식 손상 폭발하면 그 적에게 그녀 공격력의 400% 원소 대미지. 「유동체가 SP 80 획득」은 그녀의 모든 유동체에 주는데 [추정·CN: 어느 유동체인지 문구에 없음, CN에만 있는 모듈], 이 모드의 유동체는 복사 스킬이 전투 내내 켜져 있고(켜진 스킬은 SP를 받지 않음) 분열한 유동체는 스킬이 없어 실제로는 아무 일도 없다. TAC-D의 숨은 `sp`는 TAC-Y의 「라인 랩 복사 SP」가 아니다(키트가 `sp_other`가 함께 있는 부분만 읽음).
  - 아스트젠 더 라이트체이서 DEC-X(「먼 곳의 인사」, `uniequip_003_halo2`): 특성 「공격 범위에 적이 있을 경우 SP 자연 회복 속도 +0.2/초」. 재능 「에너지원 해석」 변경: 그녀와 주변 4칸(모듈 부분의 칸 표)의 오퍼레이터에게 아츠 충만(`ba.magicarcane`, 「造成的法术伤害提升（同名效果取最高）」) 12% — 마법 대미지 ×1.12, 같은 이름은 한 번만. 취약은 12% → 5초 뒤 21%(표).
  - 시험 `test/content/kits_alt_t5.test.js`·`kits_alt_t6.test.js` 끝. 한국어는 KR 서버에 아직 없는 모듈이라 KR 표의 말투로 손으로 옮겼다(`public/i18n/ko/data.json`, `docs/I18N.md` 「CN-only texts in Korean」; 术法 = KR 표의 「아츠」).

## 규정 선발 편성 12칸과 선발 편성 확정 단계 (2026-11-11, 관리자 결정)
- 새 시즌 「규정」(`act3autochess`)만의 규칙이다. 지금 시즌 「맹약」은 그대로(선발 4칸, 브리핑·전략 선택의 선발 프리셋이 그대로 그 판의 선발) — 관리자 결정 2026-11-11.
- 선발 편성은 등급 5·6에 칸 6개씩, 12칸이다(표 `diyChessDict`의 `chess_char_5|6_diy1~6`, 공식 판 밖 「选择自选编队」 창). `room.diy`의 구조 한도는 12칸(`shared/protocol.js` `DIY_LIMITS.slots`).
- 판 시작이 세 단계다: 「1/3 确认本局信息」 → 「2/3」 전략 선택 → 「3/3 确定自选编队」. 셋째 단계는 공식 표 `enterStepList`의 `CUSTOM_CHECK`(「选择自编」, 30초, 안내 10초)이고, 편성에서 등급마다 최대 2명(`constData.diyCharLimitForLevels` {5: 2, 6: 2}; 편성 창 안내 「每次模拟开始时，可从中选择每等阶各2名，至多4名干员进入模拟」)을 골라 「准备就绪」, 「取消准备」로 다시 고칠 수 있다(공식 화면). 이 단계의 시간은 원작 값 30초 그대로다(협력. 다른 시작 단계처럼 혼자 하는 판은 시간 제한 없음).
- 구현: `PHASE.DIY_CHOOSE`(`server/match/match/diyChoose.js`). 시즌에 이 단계가 있는지는 데이터가 정한다(`GameData.diyChoose`: `CUSTOM_CHECK` 단계와 `diyCharLimitForLevels`가 둘 다 있을 때). 그런 시즌에서 `room.diy`는 편성이고, 판은 이 단계가 끝날 때까지 선발을 하나도 쓰지 않는다(재고도 없음). 고른 칸만 그 판의 선발이 되고 재고를 받는다(`PlayerState.setDiy` + `initDiyStock`, 난수 없음). 브리핑·전략 선택 동안, 그리고 이 단계에서 준비 완료 전까지 바꾼 편성은 그 판의 편성이 되고(고른 칸은 같은 오퍼레이터가 그 칸에 남을 때만 남음 — 이 단계의 프리셋 상자, 관리자 결정 2026-11-13), 준비 완료 뒤·이 단계가 끝난 뒤에는 다음 판에 적용된다. 메시지 `g.diyChoose { slots }`(고른 칸 전체)·`g.diyReady { cancel? }`, `m.private.diyChoose { lineup, chosen, ready, perTier }`, `m.public.diyChoose { seconds }`.
- [추정·서버·화면: 공식 화면은 연합 4인 판의 시작만 봄] 처음엔 아무도 안 고른 채(공식 화면 「0/2」), 시간이 다 되거나 AI 托管·AI 팀원인 자리는 고른 그대로(안 골랐으면 선발 없음), 혼자 하는 판(1인·AI 팀원만 있는 연합)에도 이 단계가 있다. 확인 → mix-Q.
- 화면: 「3/3 선발 편성 확정」 화면(`public/js/screens/diyChoose.js`) — `ui.md` 「규정 선발 편성 확정 화면」. 고르지 않고 준비하면 그 판은 선발 없이 시작한다(공식 화면 「0/2」에서 시작).
- 시험 `test/match/diy-choose.test.js`(실제 대전 경로: 규정 연합·1인, 맹약 흐름 그대로), `test/ui/gameLogic.test.js` 「规程's 确定自选编队」.

## 새 시즌 바이슨·쥐·타락사쿰·우요우 (2026-11-06, 관리자 결정 2026-11-05)
규정의 기물(`chess_char_1_14`, `chess_char_2_18`, `chess_char_3_06`, `chess_char_3_20` — 2026-11-08 표 전에는 `next`의 임시 ID). 네 키트는 `SEASON_KIT_FILES`에 있고 선발 후보가 아니다. 수치는 기물 기록의 블랙보드를 읽는다. 시험 `test/content/op_bison.test.js`·`op_ju`·`op_taraxa`·`op_nothin`(두 형태·두 스킬·모듈, 실제 대전 경로).
- 그림·소리: `tools/fetch-assets.mjs`가 규정 기물 가운데 키트가 있는 오퍼레이터의 황금 기록도 계획에 넣는다(`dataExtras`의 셋째 인자, `data/seasons/act3autochess/chess.json`). 공격 클립(`attackAnim`)·소리(`audio.sfx.units`)는 이 매니페스트에서 나온다. 기본 시즌 항목은 그대로이고 더해지기만 한다.

### 바이슨 `char_325_bison` (T1, 프로텍터)
- 재능 交叉掩护: 자신 방어력 +N(ADDITION). 공식 클라에서 확인: 재능 `AuraAbility`가 자신을 넣고(`_selfOption`), 판정기 `professionMask` 513 = 근위 | 선봉이라 자기 뒤 칸의 근위·선봉에게만 간다. 칸 판정은 재능 `rangeGrid`(방향과 함께 돈다).
- S1 `skcom_def_up[3]`(방어 강화 γ): 방어력 +N%. S2 `skchr_bison_2`(深化阵线): 공격 안 함(PRTS 「자신은 시야를 전부 잃음」, S2 모드의 공격 트리거가 아무도 고르지 않음), 방어력·조롱 등급 `bison_s_2[self]`, 스킬 범위 x-5 안 다른 아군 방어력 `bison_s_2[ally]`. 발동 규칙은 표의 `TAKE_DAMAGE`.
- 모듈 PRO-X: 저지 중 방어력 +20%(특성 bb `def`). 값은 (기본 + 재능 ADDITION) × 비율.
- 이펙트: 두 버프의 상태 키로 재생(`fx.md` 「클라 키로 재생」). 이름 규칙이 S2 시전자에게도 `bison_skill_02_buff`를 켜므로 `KIT_OWNED`에 넣었다.

### 쥐 `char_4221_ju` (T2, 공성 저격수)
- 특성: 공격 선택기 `_postFilter` MASS_DES(우선순위 `heaviest`), `_buffKeyExcluded` cripple(`skipEnemy`). 모듈 SIE-X(재능 변경 bb `atk_scale`, `value`): 무게 등급 3 이상에게 그의 모든 피해의 공격력 ×1.15(`ju_e_002[atk]` ON_CALCULATE_DAMAGE, DEF 앞). 2·3단계의 `ju_e_002_t_scale`은 기록에 값이 있을 때만(이 시즌 기물은 1단계).
- 재능 墨守: `ju_t_1`이 모든 피해를 치명 불가로 하고(`fatal`), HP ≤ 1이면 `cripple`(重伤): 이동 속도 ×(1 + `move_speed`), 禁疗, 저지 불가, 회복 0, `interval`초 뒤 무출처 사망(消失 중에는 아니고 돌아오는 즉시), 처치자 SP +`sp`. 그는 重伤 적을 공격하지 않는다. [추정·서버: 보스 공유 체력 대상에는 重伤을 걸지 않음 — 공식은 보스 피해를 서버로 보내 처리]
- S1 `skchr_ju_1`(良弓难张, AUTO, 충전 2): 공식 클라에서 확인: `ReplacementSkill`, 발동 조건은 자기 선택기(HP 비율 ≤ 0.5, cripple 제외)이고 SP를 그 순간 쓴다. `_cancelIfSearchTargetFailed`가 꺼져 있어 그 선택기가 공격 선택기를 대신한다: 조건에 맞는 적이 없어지면 공격하지 않고 기다린다. 키트는 `trigger: 'NEVER'` + 틱 시전. 선택기 `_maxNum` 2라 두 명까지 친다. [추정·화면: 문구·PRTS에 둘째 대상이 없음, 공식 화면 확인 필요]
- S2 `skchr_ju_2`(良翼难乘): 공격력 +N%, `attack@max_target_s2` 명. 추가 피해(`ju_s_2*`): 범위 안 적마다 0.2초 간격(들어온 때부터) 검사 → 스킬 중·HP 비율 < `hp_ratio`·표지(`ju_s_2[done]`, 모든 쥐 공용, 사라지지 않음) 없음 → 표지 + 0.6초 뒤 대기열 → 쥐마다 0.3초에 하나 시작(`ju_s_2[source]`), 시작 0.3초 뒤 착탄. 스킬이 끝나도 진행하고, 쥐가 떠나면 대기열은 없어진다. 착탄 때 대상이 선택 불가면 없음. 공격력은 착탄 때 값: 공식 클라에서 확인, `AdvancedApplyDamage`의 `_cachedAtkKey`는 `_forceUseProjectileCachedAtk`·`_getCachedAtkFromBlackboard`가 켜질 때만 읽히고 이 노드에서는 꺼져 있다. [추정·엔진: 대기 순서는 먼저 온 순 — 공식은 버프 갱신 순서]
- 이펙트: S1 `ReadySkillEffect`의 `totter_skill_01_weapon_01`·`_buff_01`(충전이 있는 동안, `fx.md` 「스킬 준비 이펙트」), `ju_skill_02_start_02`·`_trail_01`은 EN·CN 클라의 어느 프리팹·템플릿도 안 가리켜 그리지 않는다. S2는 시작 때 `ju_skill_02_hit_01`·`_04`를 번갈아(`ju_s_2[host]` `isFront`, 키트 사건 `juExtra`), 착탄 때 `_hit_02`(moment `ju_s_2[damage]`). 조건 뒤의 프리팹이 둘이라 손 계획. 重伤은 `saga_buff_01_start`만 뽑아 쓴다(키에 밑줄이 없어 `KEY_FX` 한 줄).

### 타락사쿰 `char_4222_taraxa` (T3, 워치맨)
- 모드: `S1_FlyStart`·`S1_FlyLoop`·`S1_FlyEnd`·`S2_…`. 공격하는 모드는 `Loop`: `skillModeIndex`가 `S<k>…Loop` 변형을 다른 변형보다 앞에 둔다(이 이름의 모드는 지금 그녀뿐). `attackAnim.skills`·`shot.skills`·소리 모드가 여기서 나온다.
- 起飞(`taraxa_fly_mode`, 플래그 `liftoff` + `blockFly`): 시전부터 끝 클립이 끝날 때까지. 시작·끝 클립(각 1초, `FLY_CLIP`) 동안 치료 없음(`skillStateUntil`). 끝 클립 중에도 공중.
- 재능 定风絮(`taraxa_t[aura]`): 현재 범위 안 아군(자신 포함) 가운데 차단 모드가 공중인 유닛에게 庇护(공용 `protect`, 같은 효과는 최고값)와 저지 +1(`taraxa_t[block]`). 매 틱 다시 판정(공식은 차단 모드 변경 때 즉시). 실제 비행 유닛은 아니다(PRTS).
- S1 `skchr_taraxa_1`(何处着): 공격 간격 × `attack@base_attack_time`(FINAL_SCALER), 투사체 없는 `Heal` `attack@heal_scale` × 공격력, 대상은 다친 유닛 무작위(`_postFilter` HP_NOT_FULL_RANDOM).
- S2 `skchr_taraxa_2`(扶风起): 공격력 +N%. 주 대상: 공식 클라에서 확인, `_Filter_HpRatioNotFullAscFlyFirst`가 `Character.blockMode`를 읽어 공중 차단 먼저, 그다음 HP 비율. 둘째 치료: `taraxa_s2[second_heal]`의 `CheckBlockMode TARGET FLY` — **주 대상이 공중 차단일 때만** 나가고, 대상은 나머지 다친 유닛 중 HP 비율 최저(`SecondSelector`, 차단 모드를 보지 않음). PRTS 비고 「额外治疗条件」이 이것이다. 주 치료가 닿으면 그 대상 3×3의 다른 다친 유닛 최대 `attack@splash_num` 명에게 `attack@heal_scale_2`(`projectile_chr_taraxa_s2_2`, 속도 5). 둘째 치료에는 퍼짐이 없다(`_activeBuffs`는 공격 능력의 것).
- 높이: `LIFTOFF_HEIGHT` 0.4(`attack@fly_height`). 시작·끝 효과는 키트 사건 `taraxaFly`, 둘째 치료는 `taraxaSecond`, 퍼짐은 `taraxaSplash`(주 치료 대상에서 출발해 궤적 `taraxa_skill_02_trail_02`, 닿으면 `taraxa_skill_02_hit_01`). 이륙 소리는 FlyStart 모드 능력의 시작 뱅크(키트 `kitHit`), 착륙 소리는 FlyEnd의 뱅크(`ends`).

### 우요우 `char_455_nothin` (T3, 상인)
- 특성: 3초마다 DP −3, 모듈 MER-X −2(직업 `merchant`, 특성 bb). 못 내면 퇴각.
- 재능 出其不意: 공식 클라에서 확인: `AdvancedCompoundToggleChecker`(`_isInitToggled` 꺼짐, `_disableWhenAttack`). 배치 때 꺼져 있고 `delay`초 뒤 켜진다. 그가 피해를 줄 때마다 꺼지고 다음 켜짐이 `delay`초 뒤로 밀린다(꺼져 있을 때도). 켜진 채 준 피해는 공격력 ×`atk_scale` + `stun`초 기절. 켜져 있는 동안 `nothin_t_1`·`nothin_t_1[eff]`의 이펙트.
- S1 `skchr_nothin_1`(知难而退, AUTO): 가지고 있으면 저지 +1. HP 비율 ≤ `max_hp_ratio`일 때 시전(선택기 `_checkHpRatioCondition`): 공격·저지 없음, 조롱 등급 −1, 생명 회복 속도(%) `hp_recovery_per_sec_by_max_hp_ratio`, 5초.
- S2 `skchr_nothin_2`(阴晴圆缺, 지속 무한): 토글. 이 모드에서는 저절로 닫지 않아(PRTS 卫戍协议/帮助) 떠날 때까지 간다. 시작 클립(`Skill_2_Begin` 1.1초, 엔진 — `sim.md` 「스킬 시작 클립」) 끝에 셋 중 하나: 공식 클라에서 확인, `PassiveOneOfBuffAbility` `_selectMethod` RANDOM_BUT_NOT_LAST — 이번 배치의 직전 것을 뺀 균등(재배치 때 기억 지움). `nothin_s_2[a]` 피해 직전 대상 공격 속도 감소(5초, 연장·중첩 없음), `[b]` 공격 속도, `[c]` 물리 회피 + 저지 +1. 모두 공격력 +N%. 이펙트는 고른 버프의 상태 키, 이름 규칙은 `KIT_OWNED`로 끈다. 시작 소리 `ON_SKILL_SPECIAL_POINT`(프리팹 `_playExtraSignalAtSkillBegin`)는 시전 때, 스파인 이벤트 `lottery`는 클립 재생 때.

## 새 시즌 레토·이스티나·우쿠시크 (2026-11-06, 관리자 결정 2026-11-05)
규정(`act3autochess`)의 기물(`chess_char_1_16`, `chess_char_2_21`, `chess_char_3_03`). 키트는 `SEASON_KIT_FILES`, 선발 후보 아님. 시험 `test/content/op_leto.test.js`·`op_glassb`·`op_turdus`(두 형태·두 스킬·모듈, 실제 대전 경로). 우쿠시크의 특질과 임시 중첩은 표가 나온 뒤(맹약·특질 묶음)에 한다.

### 레토 `char_194_leto` (T1, 로드)
- 특성: 프로필 `lord`(근접 100%, 원거리 `atk_scale`). 모듈 LOR-Y(재능 bb `cnt`·`attack_speed`, `leto_e_002_tr`): 0.1초마다 초기 범위 3-12의 칸으로 적 수를 세어 `cnt`명 이상이면 공격 속도 +. 칸 판정이고 선택 가능 여부를 보지 않는다(공식 클라에서 확인, `CheckHasEnemyInRange` `_useAttackRange` 꺼짐; PRTS 비고).
- 이펙트: `leto_skill_01_buff_01`(S1은 공용 스킬 `skcom_quickattack[3]`)·`leto_skill_02_start_01_B`는 EN·CN 클라의 어느 프리팹·템플릿도 안 가리켜 그리지 않는다.
- 재능(`leto_t_1[attack_speed]`): 스킬이 켜져 있는 동안(`leto_skill_judge`의 스킬 시작·끝) 필드 전체의 소속 태그 `student`(우르수스 학생 자치단) 아군과 자신에게 공격 속도 +N. 스킬 중 배치된 아군도 받고(PRTS), 그가 떠나면 끝난다(`_removeBuffWhenAbilityDetached`). 판정은 맹약이 아니라 소속 태그다(`sim.md` 「진영 판정은 소속 태그」).
- S1 `skcom_quickattack[3]`: 공격력·공격 속도. S2 `skchr_leto_2`: 공격력 +N%, 대상 `attack@max_target`명, 모드 S2에는 `UpdateAtkScaleByTraitData`가 없어 원거리도 100%.
- S2 시작에 다른 학생의 스킬을 켠다: 공식 클라에서 확인, `leto_s_2[filter_tag]`가 `TriggerSkill`(`_checkBeforeTrigger` 꺼짐) → `Character.RemoteTrigSkill` → `IsTriggerable`. 이 모드의 자동 조작 조건을 거치지 않는다. 토스카 S2의 같은 노드처럼 수동 스킬만(PRTS 「수동 스킬이라는 성질은 바꾸지 않음」). 침묵·충전 중·스킬 진행 중인 아군은 켜지 않는다.

### 이스티나 `char_195_glassb` (T2, 감속자)
- 특성: 프로필 `slower`, 정체 시간은 특성 bb `sluggish`(0.8초, 모듈 DEC-Y 1.2초). 재능은 2정예부터라 일반 형태에는 없다: `glassb_t_1` 방어력 −35%, 공격 속도 +N.
- S1 `skchr_glassb_1`: 기본 공격 간격 + `base_attack_time`초. S2 `skchr_glassb_2`: 공격력 +N%, 범위 x-2, 대상 `attack@max_target`명. S2 모드의 공격은 자기 클립이 없고(`ThreePartChannelingAnimation`이 스킬 내내) `_preDelay` 0.5초에 나간다.

### 우쿠시크 `char_4224_turdus` (T3, 체인 메딕)
- 재능: 자신이 `turdus[free_jump]`·`turdus[atk_scale_up]`을 지니고, 치료 연쇄가 대상의 그 버프를 본다. 그래서 다른 우쿠시크에게도 듣는다(PRTS). 공식 클라에서 확인(`ChainLightningHitBehaviour.DoSelectTargetToHit`, `ChainedSelectorWithFilter`, `ai.js chainHealWalk`): 배율은 도약마다 이어진다. `atk_scale_up` 대상에서 × `chain.atk_scale_2`(그 대상과 이후 도약 모두, PRTS 「이번 연쇄의 이후 도약 전부」, 주 대상이어도), 앞 대상이 `free_jump`면 이번 도약은 감쇠 없음, `free_jump` 대상은 도약 수를 쓰지 않는다. PRTS의 예 100% → 114.75% → 114.75% → 97.54%(135%, 감쇠 85%)와 같다.
- S1 `skchr_turdus_1`: 시작 클립 `Skill_1_Begin` 동안 공격 없음(시전이 휘두름을 끊음), 공격 속도 +N, 연쇄 대상 +`attack@chain.extra_value`. 스킬과 지속 시간은 클립 뒤부터(엔진, `sim.md` 「스킬 시작 클립」 — 2026-11-11 전에는 키트가 공격만 막고 휘두름은 두었으며 지속 시간을 클립만큼 덜 셌다).
- S2 `skchr_turdus_2`(즉발, `Skill_2` 클립): 시전 시작에 현재 HP의 `hp_ratio`를 잃되 죽지 않는다(`ON_CAST_START`, `_isUndeadable`, SP 없음). OnAttack 프레임에 범위 안 HP 비율 최저 > 자신과 가까운 순으로 대상을 고른다(`HP_RATIO_ASC_DIST_TO_SOURCE_ASC_FIRST`, 만피도 대상, 대상 없어도 시전). 투사체(속도 10)가 닿으면 연쇄 치료 100%.
- 연쇄의 모든 대상이 받는 두 버프(`_activeBuffs`): `turdus_s2[continues_heal]`은 1초마다 `heal_scale` × 버프가 시작될 때의 그녀 공격력(첫 틱은 1초 뒤, 시전자별로 따로, 다시 걸면 다시 시작). `turdus_s2[try_camouflage]`는 0.1초마다 저지 중이면 위장을 풀고 아니면 건다(`turdus_s2[camouflage]`, 버프가 끝나면 함께 끝, 다시 걸면 위장이 바로 풀렸다가 다음 검사에서 돌아옴).
- [추정·화면: 지속 치료가 주 대상에게만 가는지. PRTS 문구는 「대상」과 「치료의 모든 대상」을 나눠 적지만, 프리팹은 두 버프를 같은 `_activeBuffs`에 두어 조건 없이 함께 건다 — 프리팹대로 구현] → `mix-Q`

## 새 시즌 블루포이즌·하이모어·홈바운드·안드레아나 (2026-11-06, 관리자 결정 2026-11-05)
규정(`act3autochess`)의 기물(선발 아님). 형태 둘, 스킬 둘, 재능, 특성, 첫 모듈을 기록의 표·클라 프리팹·버프 템플릿·PRTS로 구현했다. 맹약 효과는 표 뒤. 키트 `ops/op-bluep.js`·`op-highmo.js`·`op-hbound.js`·`op-cuttle.js`, 시험 `test/content/op_*.test.js`.

### 블루포이즌 `char_129_bluep` (T2, 속사수)
- 재능: 공격마다 대상에 `bluep_t_1`(`_additiveActiveBuffs`, 템플릿 `poison`). 지속 `duration`초, 1초마다 `poison_damage` 마법 대미지, 첫 틱은 1초 뒤, 출처 없는 지속 피해(PRTS 비고). 적마다 하나이고 이미 걸린 적을 맞히면 시간만 처음으로 돌아가고 값은 처음 그대로(PRTS).
- S1 `skchr_bluep_1`(다음 공격 대체): 대상 2명(`_maxNum` 2), `atk_scale`. 독이 없는 적에게 새로 거는 독은 값 × `atk_scale`(PRTS 스킬 비고).
- S2 `skchr_bluep_2`: 공격력 +N%, 모드 S2 대상 3명. 표의 `attack@times` 1은 추가 사격이 아니다: 공식 클라에서 확인, `MultiRangedAttack.DoSetData`가 `times − 1`을 추가 횟수로 삼는다.
- MAR-Y: 범위에 지상 적이 있는 동안 공격 속도 +8(공중 적만 있으면 안 켜짐).

### 하이모어 `char_4066_highmo` (T3, 리퍼)
- 특성은 분과 공통(`professions.js` `reaper`), 값은 기록의 50, REA-X 60. 재능 2 「罹患，浸染」은 `rogue_mizuki` 태그가 있어야 하므로(`_oneOfTags`) 이 모드에서 꺼짐.
- 재능 1: 공격한 적마다, 저지 수까지 자신의 원소 손상 `value` 회복(`highmo_t_2`, `FixedValueElementHeal`, 특성과 같은 꼴, PRTS 「특성과 같다」).
- S1 `skchr_highmo_1`(다음 공격 대체): `atk_scale`, 범위 전체를 두 번 친다(`_additionalTimes` 1, 간격 없음).
- S2 `skchr_highmo_2`: 공격력 +N%, 물리 회피 `prob`. 시작 클립 `Skill_2_Begin`이 프리팹에 있어도 공격을 멈추지 않는다: 공식 클라에서 확인, `CastSkill.UseSkill`은 `_switchToState` 0이면 스킬 상태 없이 바로 시작한다. 켜진 동안 범위 안의 지상 적이나 자신이 저지한 적이 쓰러지면 최대 HP의 `hp_ratio` 회복(`highmo_s_2` `ON_OWNER_KILLED`, PRTS 비고). 누가 쓰러뜨렸든 상관없고, 선택 불가 적도 든다(`ignoreTargetFree`).

### 홈바운드 `char_4232_hbound` (T3, 연금술사, CN 클라)
- 던지기: `Skill_N` 클립의 OnAttack 프레임에 범위 안 첫 지상 적의 자리로. 지상 적이 없으면(공중 적만 있어 발동한 경우) 정면 가장 먼 칸: 쏜즈 더 로드스타와 같은 선택기(`DIST_DES_FRONT_FIRST`)이고 그쪽 PRTS 비고가 이 결과를 적는다. 연금 유닛은 속도 10으로 그 지점까지 날아가 사람을 따라가지 않으며, 착지부터 `projectile_delay_time`초 작동한다. 공격력은 던질 때 값(`CacheAtkToBBBehaviour`; `_increaseByTime`이 꺼져 있어 S2의 `value`가 범위를 키우지 않는다). 그녀가 쓰러진 뒤에도 작동한다(PRTS 재능 비고).
- 대상: `projectile_range` 안 지상 적, 10프레임마다 들어오고 나감을 본다(`_tickInterval`). 나가거나 유닛이 멈추면 효과가 끝난다.
- S1 `skchr_hbound_1`(`hbound_s_1[dot]`): 이동 속도 감소(유닛마다 곱함, PRTS 「중첩」), 첫 틱 0.9초 뒤 1초마다 `atk_scale` 마법 대미지, 출처 없음. 충전 수는 표대로 일반 1, 정예 2.
- S2 `skchr_hbound_2`(`hbound_s_2[buff]`): `atk_scale` 같은 주기. 0.1초마다 무게 `value` 이상을 확인해(PRTS 3프레임) 이상이면 `hbound_s_2[heavy_damage]`: 이동 속도 감소와 1초마다(첫 틱 1초 뒤) `heavy_atk_scale` 마법 대미지. 무게가 내려가면 풀린다.
- 재능 `hbound_t_1`: 범위 안 지상 적의 물리·마법 명중률 × (1 + `hitrate`), 무게 `value` 이상이면 `heavy_hitrate`, 0.1초마다 다시 본다. 값은 던질 때 고정. 적마다 하나, 여러 홈바운드면 배율이 가장 높은 쪽(PRTS). 공격 하나에 한 번 굴린다(PRTS 명중률, `standin-acsupo.js`의 재능과 같음).
- ALC-X: 연금 유닛이 전장에 있으면(날아가는 중 포함) SP 자연 회복 +0.1/초. 출처를 가리지 않으므로(PRTS) 쏜즈 더 로드스타·틴맨의 유닛도 센다.
- 한국어 이름·문구는 KR 표에 없어 손 번역(`public/i18n/ko/manual.json`, `docs/I18N.md` 「CN-only texts in Korean」). KR 출시 때 바꾼다.

### 안드레아나 `char_218_cuttle` (T2, 신궁)
- 재능 `cuttle_t_1`(`_deckBuffs`, `filterTag` `abyssal`, `disableOverride`): 자기 플레이어의 어비설 헌터 모두와 자신에게 전투 내내 공격 속도 +N. 배치 여부를 보지 않고, 둘이면 더해진다.
- S1 `skcom_atk_up[3]`: 공격력 +N%.
- S2 `skchr_cuttle_2`(`_switchToState` 1): 시작 클립 `Skill2_Begin` 동안 공격 없음(시전이 휘두름을 끊음, 스킬과 지속 시간은 클립 뒤부터 — 엔진, `sim.md` 「스킬 시작 클립」, 2026-11-11), 공격력 +N%, 모드 S2 선택기가 HP 비율 0.5 이상만 고른다(`_filterMinHp`·`_minHpRatio`). 그런 적이 없으면 쏘지 않는다. 맞은 적은 `attack@duration`초 이동 속도 감소(적마다 하나).
- DEA-X `cuttle_e_trait`: 거리 `min_dist`~`max_dist`에서 피해 × 최대 1 + `damage_scale`, 선형. 표 값이 4.5이고 PRTS 비고는 「4칸 이상」이라 다르지만 표대로 한다.

### 표 전 기물의 만드는 차례
`add_operator.py --id …`로 추출하고 키트를 쓴 뒤, `add_operator.py --finish --id …`가 키트를 읽는 재생성을 의존 순서대로 돌리고(`FINISH_ORDER`) 오퍼레이터마다 클립 키·소재 목록·공격 클립이 들어왔는지, 다른 오퍼레이터의 행이 움직였는지 알린다. 키트가 없거나 목록에 없으면 시작하지 않는다.
`anim_keys.py`는 이제 기물 데이터의 오퍼레이터를 모두 읽는다(2026-11-06). 전에는 소재 목록에 있는 오퍼레이터만 읽어, 키트 등록 전에 돌리면 행이 빠지고 클립 역할이 이름 규칙으로 남았다(바이슨·쥐·타락사쿰·우요우가 그랬고 src ffe4bcd3b에서 바로잡음: 바이슨 S1은 공격 클립, 타락사쿰·우요우의 사망·대기 클립). 타락사쿰의 이착륙 클립은 `S<k>_FlyStart`·`S<k>_FlyEnd` 모드에서 온다(`tools/assets/anim-keys.mjs`, `<stem>Loop` 옆의 `<stem>Start`·`<stem>End`).

## 새 시즌 디아만테·리프레사·체르니·아오스타 (2026-11-06, 관리자 결정 2026-11-05)
규정(`act3autochess`)의 기물(선발 아님). 형태 둘, 스킬 둘, 재능, 특성, 첫 모듈을 기록의 표·클라 프리팹·버프 템플릿·PRTS로 구현했다. 맹약 효과(라이타니엔·시라쿠사)는 표 뒤. 키트 `ops/op-kaitou.js`·`op-liesel.js`·`op-pianst.js`·`op-aosta.js`, 시험 `test/content/op_*.test.js`.

### 디아만테 `char_499_kaitou` (T2, 프라이멀 캐스터)
- 재능 `kaitou_t_1[check_ep]`: 범위 안 적 하나라도 쇠약 손상(凋亡损伤) 폭발 중이면 공격력 +N%, 여럿이어도 하나(`AuraAbility`, `ignoreTargetFree`라 선택 불가 적도 센다).
- S1 `skchr_kaitou_1`: 공격력 +N%, 모드 S1. 맞을 때마다 그 피해의 `attack@ep_damage_ratio`만큼 쇠약 손상 게이지(`ep_damage_based_on_damage_value`), 폭발 중이면 공격력의 `attack@extra_ep_damage_scale`만큼 원소 대미지(`kaitou_s_1[ep_damage]`, 스킬이 켜진 동안만).
- S2 `skchr_kaitou_2`: 공격 속도 +N, 모드 S2 대상 2명(`_maxNum` 2), 같은 추가 원소 대미지. 게이지는 쌓지 않는다.
- 폭발 판정은 그 타격 **전** 상태다. 공식 클라에서 확인: `Projectile.ActionController.OnHitTarget`이 `_activeBuffs`를 먼저 붙이고 피해 행동을 뒤에 돌린다. 그래서 게이지를 채워 막 폭발시킨 타격에는 추가 대미지가 없고 다음 타격부터 붙는다. 님프 S1 「디얄 일격」(`chess_char_5_22`, 지금 시즌에도 있음)도 같은 꼴이라 같이 고쳤다(2026-11-11, 프리팹 `Modes/S1/Body/Attack`의 `_activeBuffs` `nymph_s_1[ep_damage]`, 같은 ON_BUFF_START 템플릿; 전에는 게이지를 채운 뒤 폭발을 봤다).
- PRI-X: 원소 폭발 중인 적에게 주는 모든 피해 × `damage_scale`(특성 bb, `kaitou_e_002_tr[dmg_up]`).

### 리프레사 `char_4031_liesel` (T2, 스플래시 캐스터)
- 재능 `liesel_t`: 스플래시 안 적이 `min_target_cnt`(3) 이상인 공격의 피해 × `damage_scale`. 지속 피해는 안 받는다(수정자 키 `dot`).
- S1 `skchr_liesel_1`(다음 공격 대체, 충전은 표대로 일반 1·정예 2): `atk_scale`, 스플래시 반경 1.7(PRTS).
- S2 `skchr_liesel_2`: 클립의 OnAttack 프레임에 세 발(`_additionalTimes` 2, `_triggerDelta` 0). 발마다 주 대상을 새로 고르고, 고른 적은 1.5초 동안 그 리프레사의 주 대상이 못 된다(`liesel_s_2[exclude]`). 적이 셋보다 적으면 그만큼 적게 쏜다(`_allowNoTarget`). 공식 클라에서 확인: 선택기 `_filterBuffSource`가 시전자 자신이 건 버프만 보므로 잠금은 리프레사마다 따로다. PRTS 문구는 「어느 리프레사든」이지만 클라대로 한다.
- 착탄: 발사 1.2·1.6·2.0초 뒤(PRTS, 프리팹 `_delayToStart` 1.1·1.5·1.9), 대상을 따라간 자리, 반경 1.7. 그 전에 리프레사가 쓰러지면 없다(`CheckUnitAlive`). 피해는 착탄 때 공격력의 `atk_scale`(PRTS: 캐시 안 씀), 맞은 적이 3 이상이면 × `damage_scale`(수정자 키 `damage_up`, 아니면 `ignore_damage_up`).
- 맞은 적마다 `liesel_s_2[dot]`: 1초마다 발사 때 공격력의 `atk_scale` 마법 대미지, 출처 없음, 재능 배율 없음(PRTS), 시간 연장 + 값 갱신(`EXTEND`, `takeSnapshotWhenExtend`), 리프레사마다 하나(`independentCharacterSource`).
- SPC-Y 1단계: 재능 변경은 2단계부터라 기물에서는 스탯만.

### 체르니 `char_4047_pianst` (T3, 중장 분과 驭法铁卫, 사전에 한국어 이름 없음)
- 특성: 스킬이 켜진 동안 공격이 마법(모드 S1·S2 `_damageType` 2).
- 재능 `pianst_t_1`: 마법 저항 +N, 공격 종류 NORMAL·SPLASH의 마법 피해를 받으면 그 출처에게 그녀 공격력의 `atk_scale` 마법 대미지(PRTS 「普通/溅射」만).
- S1 `skchr_pianst_1`: 공격력 +N%, 마법 저항 ×(1 + N).
- S2 `skchr_pianst_2`: 최대 HP +N%, 도발 +1. NORMAL·SPLASH 공격을 받으면 피해 종류와 상관없이 공격력 +N% 한 겹, `max_stack_cnt`까지, 재능 뒤에(PRTS). 프리팹 값은 20이지만 표와 문구대로 10으로 한다.
- 최종 공격: `interval`(18.6)초에 모드 `Empty`(공격 안 함), 그때 행동할 수 있으면 `_preDelay` 0.5초 뒤 공격력의 `atk_scale` 마법 대미지를 `x-1` 안 모두에게(공중 포함, PRTS). 스턴에 걸려 있거나 그사이 걸리면 없다(`_checkCanUseAblityFlag`).
- 최종 공격의 이펙트·클립 시점은 `fx.md` 「W·클로저·브리지드·크리스틴·체르니·리프레사 키트 순간 이펙트」, `render.md` 「선발 클립 판정」.
- `skill_cast.py`가 이 스킬의 나중 능력을 시전 능력으로 읽어 시작에 1.7초 멈췄다: 빼냄(2026-11-11부터 손 목록 대신 일반 규칙 — `sim.md` 「즉발 스킬의 시전」의 `_extraAbilities`, 같은 꼴 9개도 같이). 클립은 `anim-keys.mjs`가 `FinalAttack`을 끝 클립으로 읽는다.
- AST-X 1단계(`common_damage_on_*`, 수정자 키 `artsprotector_e_002_tr`): 스킬이 켜진 동안 그녀의 공격과 받는 적 피해마다 상대에게 공격력의 `atk_scale` 마법 대미지.

### 아오스타 `char_346_aosta` (T2, 산탄사수)
- 특성은 분과 공통(`professions.js` `reaperrange`). 값은 표의 1.5, RPR-X 1.6.
- 재능 `aosta_t_1`: 공격이 맞힌 적 모두에게 걸린다. 적마다 하나(`EXTEND`). 새로 맞으면 시간과 값(그때 공격력)이 새로워진다(`takeSnapshotWhenExtend`). 1초마다 그때 저지되어 있지 않으면 `atk_scale` 마법 대미지(`CheckBlocked`, 출처 있음, PRTS 지속 마법 피해). 저지된 적도 걸려 있고 풀리면 그때부터 받는다. 특성 배율은 안 받는다.
- S1 `skcom_quickattack[3]`: 공격력 +N%, 공격 속도 +N.
- S2 `skchr_aosta_2`: 공격 간격 ×(1 + `base_attack_time`)(버프 MULTIPLIER, PRTS +50%), 공격력 +N%, 맞은 적 모두 `attack@frozen_duration`초 속박(`aosta_s_2[unmovable]`), 재능 배율 × `talent_scale`(`_applyTalentScale`).

## 새 시즌 미틈·로베르타·클릭·퀘르쿠스 (2026-11-06, 관리자 결정 2026-11-05)
규정(`act3autochess`)의 기물(선발 아님). 형태 둘, 스킬 둘, 재능, 특성, 첫 모듈과 소환물 둘을 기록의 표·클라 프리팹·버프 템플릿·PRTS로 구현했다. 맹약 효과(예견·아케인·조력·고수)는 표 뒤. 키트 `ops/op-mitm.js`·`op-robrta.js`·`op-cammou.js`·`op-quercu.js`, 시험 `test/content/op_*.test.js`. `next` 소환물은 `data/seasons/next/tokens.json`에 생기고 `test/helpers/nextSeason.js`가 그 표로 세운다.

### 미틈 `char_4147_mitm` (T2, 전술가) · 체리 3호 `token_10037_mitm_trshrb`
- 특성: 미틈의 피해는 자기 소환물이 저지한 적에게 공격력 × `atk_scale`(`mitm_tr_1` ON_CALCULATE_DAMAGE, 방어 앞). 공식 클라에서 확인: `CheckBlocked._checkBlockedBySourceToken`은 저지자가 그 주인의 소환물인지 보므로 잔해가 저지한 적도 든다.
- 체리 3호: 전차 형태는 저지 `block_cnt`, 치료 불가. 쓰러지거나 철수하면 전술 포인트 형태로 `interval`초(1정예 17, 2정예 15, 소환물 재능)를 기다리고, 복귀 능력 `trshrb_switch`의 클립 `ReBorn` 1초(`_preDelay`, 공식 클라에서 확인) 뒤 체력을 채워 그 칸에 돌아온다. 배치도 같은 능력을 거친다(공식 클라에서 확인: 루트 `_category` 2, 모드 0이 `Reborn`, `Passive`의 `trshrb_state_1`이 `ability_name` `trshrb_switch`를 배치 때 바로 시전): 처음 1초 동안 저지 없음, 표적이 안 됨, 공격 안 함이고, S1·S2도 이 동안의 전차를 건너뛴다(`CheckUnitCurrentMode` 1). 다음 프레임에 x-5의 빈 근접 칸 하나에 잔해가 선다(`SpawnTrash`, 선택기 `_alwaysRandomInTheEnd`). 잔해: 공격력·방어력 −100%, 최대 HP −50%, 저지 1, 공격 안 함, 떠나면 끝(`trshrb_t_1[trash_born]`). 미틈이 떠나면 함께 떠난다(`die_to_kill_token`).
- S1 `skchr_mitm_1`: 시작에 코스트 +`cost`. 타격 시점에 전차가 있으면 x-5의 지상 적에게 미틈 공격력 × `aoe_damage_scale` 물리(`mitm_s_1` AOEDamage `targetMotion` WALK_ONLY, 특성 곱함), 그 뒤 철수: 잔해는 피해 뒤(PRTS). 전차가 없으면 코스트만.
- S2 `skchr_mitm_2`: 공격력 +`atk`, `mitm_s_2[cost].interval`초마다 코스트 1(모두 `display`). 시작에 선 전차만 공격을 멈추고 저지 2·방어력 +`def`, 끝나면 철수(`mitm_s_2[to_token]`). 스킬 중에 돌아온 전차는 보통 전차다. 표의 `mitm_s_2[to_token].hp`는 프리팹 속성에 없어 쓰지 않는다.
- TAC-Y: 소환물이 저지한 적은 저지 동안 조롱 +`taunt_level`(비질 TAC-Y와 같은 방식). 1단계라 잔해 체력 변화·`mitm_e_002_[sp]`는 없다.

### 로베르타 `char_484_robrta` (T3, 기능공) · 전자동 스타일러 `token_10018_robrta_mach`
- 재능: 배치 때 보유 수를 `cnt`로 **맞춘다**. 공식 클라에서 확인: `charge_token[refresh]`의 `_refreshRemainingCnt`면 `Deck.TokenCard.Recharge`가 더하지 않고 cnt로 놓는다(상한 안에서). CRA-X는 상한 +1, 비용 −2(소환물 표). CRA-X의 `trigger_charge_token`(모듈의 TRAIT 부분 `robrta_equip_1_*_p1`)은 특성 능력이 붙을 때마다 +`cnt`: 배치 전 카드에서 한 번(`_attachPassiveBuffsOnDummy`), 그리고 배치마다 맞추기 **뒤**. 공식 클라에서 확인(2026-11-11): `Ability.DoAttach`는 주인이 더미이고 그 플래그가 꺼졌을 때만 패시브 버프를 건너뛰고, `Character.OnBorn`은 `Entity.OnBorn` → `BuffContainer.OnOwnerBorn`(재능 `charge_token[refresh]`, ON_OWNER_BORN)을 먼저 돌린 뒤 `m_traitAbility`를 붙인다. 그래서 CRA-X면 배치마다 보유 cnt + 1(= 상한). 놓인 기계는 전투 시작에 무료로 서고, 떠난 기계는 재배치 시간 뒤 보유 1·비용을 내고 제자리로(`deviceReturn`, 스테인리스와 같음).
- 기계: 공격 안 함, 치료 불가·무적, 지정 안 됨. 배치마다 `duration`초 뒤 떠난다(`robrta_mach_withdraw`). 바라보는 칸의 근접 칸 유닛(오퍼레이터·소환물, 장치 아님 — `professionMask`·PRTS)에게 방어력 +`def`(한 기계 것만: 다른 기계가 뒤를 잇는다), 실드 횟수는 **기계의 것**이라 다음 유닛은 남은 만큼만 받는다(PRTS). 횟수는 재능 문구의 것(표 칸 없음, 프리팹 `Talents/1`·`1+`). 두 기계가 한 유닛을 보면 실드는 둘 다 붙고 먼저 붙은 것부터 쓴다: 프리팹의 두 버프(`robrta_mach_t`·`robrta_mach_t[def]`)가 `disableOverride` 0·`overrideType` 0이라 같은 키 버프를 줄 세우고 끝나지 않은 첫 것만 켠다(`Buff.OverrideGroup._DoUpdateInternal`, 공식 클라에서 확인) — 엔진의 「먼저 생긴 횟수 실드부터」(`absorbShields`)와 같다.
- S1 공격력·방어력. S2 공격 안 함, 저지 +`block_cnt`, 방어력 +`def`, 끝날 때 보유 +1(`trigger_charge_token`).
- 봇은 캐서린 장치처럼 오퍼레이터를 향해 놓는다(`bot.js FRONT_SUPPORT_TOKENS`).

### 클릭 `char_328_cammou` (T1, 메카 캐스터)
- 재능: 공격 속도 +N, 드론은 그의 간격으로 친다. 특성 드론 경사 상한은 FUN-Y에서 120%(특성 bb).
- S1 공격력만(모드 S1은 그림만 다름). S2: 범위 3-3, 공격력 +N. 드론은 그의 대상을 잠가 범위 밖이어도 그 적이 죽거나 스킬이 끝날 때까지 친다. 그동안 붙은 드론 추가 피해는 꺼진다. 자기 공격과 드론 타격이 각각 `attack@prob`로 `attack@stun`초 기절(`cammou_s_2`가 두 능력에 있음). 그의 상태 이상으로 멈추지 않는다(PRTS). 공식 클라에서 확인(2026-11-12, `FunnelRemoteAttack`의 `_funnelAction` → 투사체 `projectile_chr_cammou_funnel_s2`의 `FunnelHitbehaviour`): 드론은 그의 공격이 나갈 때(`DoCastOnTargets`) 그 공격의 대상에게, 나가 있는 드론이 없을 때만 풀린다. 그 적이 죽거나 대상 조건(`_targetOptions`)에서 벗어나거나 그가 쓰러지면 드론이 멈추고, 다음 드론은 그의 다음 공격을 기다린다(전에는 곧바로 그의 첫 대상에게 다시 붙었다). 타격은 드론 자신의 타이머로: 붙자마자 한 번(`_waitFirstPeriod` 0), 그 뒤 그의 공격 간격(`Entity.attackTime`)마다, 그 간격이 바뀌면 남은 시간 × 새 간격 ÷ 옛 간격(`RangedAttack.OnAttackTimeChanged` → `PeriodicTimer.ResetButKeepProgress`, 일반 공격 쿨다운과 같음 — sim.md 「일반 공격 타이밍」; 전에는 타격 때 정한 대기 그대로). 타격마다 특성 경사(`CammouTrait.SetFunnelAtkScale`: 대상이 바뀌면 처음 값, 같으면 한 단계씩 상한까지).

### 퀘르쿠스 `char_492_quercu` (T1, 비호자)
- 특성: 스킬 중 공격은 범위에서 HP 비율이 가장 낮은 아군 치료(공격력 × `heal_scale`, BLS-X 1.0, 모드 S1·S2 `_postFilter` 3).
- 재능: 범위 안 아군(자신 포함) HP 비율 ≥ `hp_ratio`이면 공통 가호 `damage_resistance`(가장 센 값), 0.1초마다 검사(`damage_resistance_GE[aura]`, PRTS).
- S1 공격력 +N, 끝 없음(`lifeTimeType` 2, 자동 전투는 안 끔). S2 공격 속도 +N, 치료마다 대상 SP +`sp`(`demkni_t_2`).

## 새 시즌 팽 더 파이어 샤픈드·폰사이러스·프로스트리프·바르카리스 (2026-11-06, 관리자 결정 2026-11-05)
규정(`act3autochess`)의 기물(선발 아님). 형태 둘, 스킬 둘, 재능, 첫 모듈을 기록의 표·클라 프리팹·버프 템플릿·PRTS로 구현했다. 맹약 효과(카시미어·고수·신속·불굴)는 표 뒤. 키트 `ops/op-fang2.js`·`op-buildr.js`·`op-frostl.js`·`op-varkis.js`, 시험 `test/content/op_*.test.js`(두 형태·두 스킬, 실제 대전 경로). 묶음의 물음이던 「코스트 스킬」은 다른 기물과 같다: 이 모드에도 재배치 비용이 있어 `battle.addDp`로 그대로 준다.

### 팽 더 파이어 샤픈드 `char_1036_fang2` (T3, 차저)
- 특성: 처치 때 코스트 +`cost`(일반 1, 돈틀리스 CHG-X 2). 분기 공통(`installCharger`).
- 재능 가벼운 무장·특성의 철수 환급: 효과 없음. 첫 배치는 전투에서 공짜이고(`fang2_t_1`의 값은 첫 배치 비용뿐), 환급과 「다음 오퍼레이터 비용 −1」은 철수(`WITHDRAW`)에서만 나는데 이 모드에는 수동 철수가 없고 그의 맹약에 철수시키는 효과도 없다. 텍사스·그라벨과 같은 판단.
- S1 적을 뚫는 창 `skchr_fang2_1`(충전 1 / 2회): 다음 공격이 `atk_scale`로 두 번 친다. 공식 클라에서 확인: `MultiMeleeAttack`, `_additionalTimes` 1, `_triggerDelta` 0.25(`_waitAttackEventForAllAttacks` 없음 — 클립 `Skill_1`의 둘째 프레임 0.5가 아니라 첫 타격 0.25초 뒤). 대상이 살아 있고 그가 움직일 수 있을 때만. 이 공격의 처치는 특성과 별도로 `cost`를 더 준다(`fang2_s_1` ON_TARGET_KILLED). PRTS 비고대로 머리 위 숫자는 없다.
- S2 전선 사수 `skchr_fang2_2`(패시브, `ON_DEPLOY`): 배치마다 처음부터 `duration`(14 / 18초) 동안 공격력·방어력·저지 수 증가, 저지한 적 모두 공격. 끝나면 다음 배치까지 없다. PRTS 「배치 보호 무효」는 이 시뮬에 배치 보호가 없어 할 일이 없다.

### 폰사이러스 `char_488_buildr` (T3, 파이오니어)
- 재능 철거팀 수칙(`buildr_t_1`): 배치 `interval`초 뒤 한 번, 떠날 때까지 최대 HP ×(1 + `max_hp`). 【이동】도 배치라 기다림과 보너스가 처음으로 돌아간다(공식 이동 = 철수 + 배치, 다른 키트와 같음).
- S1 돌격 지령 γ: 코스트 `cost`, 텍사스와 같은 무대상 AUTO(`SP_FULL`).
- S2 공사자의 소원 `skchr_buildr_2`: 공식 클라에서 확인: `ActiveOneOfBuffAbility`가 시전 횟수로 묶음을 고른다. 첫 시전: 코스트 `cost`, 공격력·방어력, `duration`초. 둘째부터: 같은 값에 끝이 없고(`buildr_s_2[b].duration` −1) `buildr_s_2[b].interval`초마다 코스트 `buildr_s_2[b].cost`; 시전 코스트도 다시 준다(`buildr_s_2[c]`). 횟수는 배치마다 새로 센다(PRTS 비고). 쏜즈 S3·헤드브레이커 이격 S2와 같은 꼴(`kind: 'toggle'` + `onTick`).
- 모듈 SOL-X: 저지 중 공격력·방어력 ×(1 + 특성 `atk`·`def`)(`buildr_trait[e_002]` ON_OWNER_BLOCKEE_CHANGED).

### 프로스트리프 `char_193_frostl` (T1, 로드)
- 특성: 분기 공통(근접 범위 밖이면 ×`atk_scale`). 재능 엄호 공격은 2정예(정예 형태)만: 공격 간격 +`base_attack_time`, 재능 범위(3-1)가 기본 범위(3-12)를 대신한다(`_overrideDefaultRangeId`, PRTS 비고). 공식 클라에서 확인: 모드마다 범위를 정할 때 스킬 범위가 없으면 이 재능의 범위를 쓴다(`Character.GetModeRangeId`). 규정 표(2026-11-08)에는 기물의 범위가 따로 없어 기록의 범위는 캐릭터 표의 3-12 그대로 두고, 재능에 `attackRange` 표시를 단다: 추출기가 캐릭터 팩 `Talents/<prefabKey>`의 `_overrideDefaultRangeId`를 읽어(`tools/local-extract/char_modes.py` `rangeTalents`) `tools/build-data.mjs`가 범위가 있는 그 재능에 붙인다. 정비 화면 카드·판의 범위·배치 미리보기·AI 배치(`shared/loadoutRecord.js attackRangeGrid`)가 전투 유닛과 같은 3-1을 보인다(전투는 키트의 `unit.rangeGrid`). 두 시즌 기물 전부(EN·CN 팩)에서 이 표시가 켜진 재능은 셋이고, 표의 재능에 범위가 있는 것은 프로스트리프뿐이다(프틸롭시스 `Talents/2`·이그제큐터 `Talents/1`은 표에 범위 있는 재능이 없어 아무것도 바뀌지 않음; 프틸롭시스 모듈 RIN-X의 범위는 `rangeUp`이 이미 그림). 재발 방지: `test/content/op_frostl.test.js`.
- 모듈 LOR-X: 타격마다 공격력 × `atk_scale_m` 법술 추가 피해(`frostl_e_002_tr`, PRTS 「예계산 추가 피해」). 쏜즈·화이트위시와 같은 처리. 한기는 모듈 2단계부터라 이 시즌 기물(1단계)에 없다.
- S1 서리창 `skchr_frostl_1`: 다음 공격이 사거리와 상관없이 `atk_scale`, 특성의 ×0.8 없음(PRTS 비고), `duration`초 이동 속도 ×(1 + `move_speed`). 공식 클라에서 확인: 스킬 능력이 `RangedAttack`이라 저지 중인 적에게도 투사체로 날아간다.
- S2 빙결창 `skchr_frostl_2`: 공격 속도 +`attack_speed`, 타격마다 `debuff`초 이동 속도 감소(`frostl_s_2[slow]`), 확률 `prob`로 `debuff`초 속박(`frostl_s_2[frozen]`, `UNMOVABLE`). 근접·원거리 공격 모두(`_targetFamilyMask` 3), ×0.8은 그대로. 모드가 바뀔 때 진행 중이던 휘두름은 끊기지 않아(`sim.md` 「모드가 바뀌면」, 그의 `det` 0) 시전 직후 두 번 치는 일이 있다.

### 바르카리스 `char_4166_varkis` (T1, 센추리온)
- 특성: 분기 공통(저지한 적 모두 공격). 모듈 귀갓길 CEN-Y: HP 비율이 `hp_ratio` 초과면 받는 물리 피해 ×(1 − `damage_resistance`)(`varkis_e_002_trait` ON_TAKE_DAMAGE).
- 재능 영세불망(`varkis_t1[minos_atk_up]`): 그가 서 있는 동안 미노스 오퍼레이터(그 자신 포함, 소환물 제외)의 모든 피해가, 대상의 HP 비율이 자기 이하일 때 공격력 × `talent_atk_scale`(방어 앞, 피해마다 그 순간 비율, PRTS 비고). 여럿이면 곱하지 않고 먼저 배치한 바르카리스의 값 하나이고, 값이 더 높아도 나중 것은 꺼져 있다가 먼저 것이 떠나면 켜진다: 같은 키 버프는 덮어쓰기 그룹 DEFAULT의 큐에서 끝나지 않은 첫 버프만 켜지고(`Buff.OverrideGroup._DoUpdateInternal`), 이 버프는 `priority` −1에 `priorityBBKeys`와 속성 수정이 없어 우선순위가 같으므로 `instanceUid`가 작은 것, 곧 먼저 붙은 버프가 앞선다(`Buff._CalculatePriority`·`Buff.CompareTo`, 공식 클라에서 확인). 어느 오라가 먼저 붙는지도 공식 클라에서 확인(2026-11-12, `GlobalAuraAbility`): 재능은 `Character.OnInit`에서 붙어 `DoAttach`가 이미 선 유닛 모두에게 버프를 주고, 그 뒤 `ON_UNIT_BORN`(`Unit.OnBorn`이 유닛을 등록한 다음 냄)을 들어 새로 선 유닛에게 곧바로 준다. 듣는 쪽은 더한 차례로 불리므로(`EventPool`의 콜백 모음 `HashSet`, 지운 칸이 없을 때) 먼저 배치한 바르카리스의 버프가 모든 대상에 먼저 붙는다 — 이미 선 기물, 둘이 다 선 뒤 배치한 기물, 나중 바르카리스 자신(자기 오라는 붙을 때 아직 등록되지 않은 자신을 못 본다). 키트 그대로. 공식은 전투 중 떠난 유닛이 비운 콜백 칸을 나중 것이 다시 쓰면 그 뒤 선 유닛에게는 차례가 뒤집힐 수 있는데, 이 모드는 기물이 전투 시작에 다 서므로 따르지 않는다.
- S1 급류 `skchr_varkis_1`: 다음 공격이 저지한 대상마다 `atk_scale`로 세 번. 공식 클라에서 확인: `_additionalTimes` 2, `_waitAttackEventForAllAttacks`라 간격은 클립 `Skill`의 공격 프레임(0.467·0.5·0.533).
- S2 동포의 의지 `skchr_varkis_2`(`_switchToState` 1, `_beginAnim` `Skill_2_Begin` 0.333초): 시전이 휘두름을 끊고 시작 클립 동안 공격하지 않으며 스킬과 지속 시간은 그 뒤부터(엔진, `sim.md` 「스킬 시작 클립」). 공격 배율 `attack@s2_atk_scale`, 공격마다 한 번 자신 최대 HP의 `attack@hp_ratio` 치료(ON_SPELL_ON, PRTS 「반드시 치료」).
- 보호막: S2 중 자신에게 들어온 치료의 넘친 양(생명 복원 제외)이 보호막으로(`varkis_s2[shield]` `HEAL_CAN_GENERAL_SHIELD`, `ON_ES_OVER_ZERO`), 상한 최대 HP × `max_hp_ratio`. 다른 보호막 뒤에 소모(우선순위 −1000, PRTS 비고, `shieldLast`). 스킬이 끝나도 남고 스킬 밖에서 1초마다 `dynamic_dec_per_sec`씩 준다.

## 새 시즌 그레이스롯·아스트젠·그레이 더 라이트닝베어러·키치세이 (2026-11-07, 관리자 결정 2026-11-05)
규정(`act3autochess`)의 기물(선발 아님). 형태 둘, 스킬 둘, 재능, 첫 모듈을 기록의 표·클라 프리팹·버프 템플릿·PRTS로 구현했다. 맹약 효과(정밀·기민·조력)는 표 뒤. 키트 `ops/op-swllow.js`·`op-halo.js`·`op-greyy2.js`·`op-kichi.js`, 시험 `test/content/op_*.test.js`(두 형태·두 스킬, 실제 대전 경로).

### 그레이스롯 `char_367_swllow` (T1, 명사수)
- 재능 순풍: 공격 속도 +`attack_speed`. 정예에서 피해 하나마다 따로 확률 `prob`로 공격력 ×`atk_scale`(`critical_atkscale`, 방어 앞). 어느 피해든 된다(PRTS 비고). 일반 형태는 `prob` 0.
- S1 날개깃(충전 `ct`): 다음 공격 2연사, 한 발마다 `atk_scale`. S2 역류: 공격력, 공격마다 3연사. 공식은 화살이 따로 날아가지만(`_additionalTimes`, S1 간격 0.05초) 여기서는 한 도착에 몰린다. 엑시아 S1·S2와 같은 처리.
- 모듈 MAR-Y(`swllow_equip_1_1_p1`, 재능 10): 범위 안에 지상 적이 있으면 공격 속도 +`attack_speed`. 선택기가 지상 + `ignoreTargetFree`라 은신 적도 센다. 적이 여럿이어도 한 번(파생 버프 하나).

### 아스트젠 `char_135_halo` (T2, 체인 캐스터)
- 특성: 분기 공통. 일반 형태 3명·감쇠 15%, 정예 CHA-Y 4명·감쇠 없음(`attack@chain.atk_scale`, 문구의 명수).
- 재능 연구 열정(`halo_t_1`): 배치 뒤 `interval`초마다 공격 속도 +`attack_speed`, 최대 `max_stack_cnt`번. 첫 중첩은 `interval`초 뒤, 새 배치면 처음부터. 다 차면 버프 `halo_t_1[effect]`.
- S1 양단 유도(충전 `ct`): 다음 공격 `atk_scale`, `max_target`명, 대상마다 사슬 `chain.max_target`명. 투사체가 대상마다 하나라 두 사슬이 같은 적을 칠 수 있다. 감쇠는 특성 것(CHA-Y의 `skill@chain.atk_scale` 1).
- S2 별무리 집결(범위 3-3): 공격력, `attack@max_target`명, 대상마다 특성의 사슬.

### 그레이 더 라이트닝베어러 `char_1027_greyy2` (T2, 투척수)
- 특성: 분기 공통 + 여진. 공식 클라에서 확인: `projectile_chr_greyy2`의 둘째·셋째 타격은 둘 다 투사체가 멈출 때(도착 0.15초 뒤) 난다. 그래서 BOM-X의 여진 둘은 같은 순간이다(`shockTogether`, 로즈몬티스의 0.15초 간격과 다름). 셋째 타격은 `enable_third_attack`일 때만.
- 재능 빛의 사슬(`greey2_t_1`): 일반 공격만. 첫 피해와 여진을 맞은 적마다 따로 굴려(PRTS 비고) 확률 `attack@prob`로 `attack@sluggish`초 정지.
- S1 신속 공격 γ: 공격력·공격 속도.
- S2 햇살의 지표(충전 `ct`): 스킬 클립의 타격 프레임에 범위 안 지상 적에게 구체를 쏜다(속도 8, 도착까지 대상을 따라감). 그때 대상이 없으면 SP를 돌려준다(`_recoverSpIfNoTarget`). 도착하면 그 자리에서 `projectile_delay_time`초 동안 바로 한 번, 그 뒤 `interval`초마다(`SelectorHitBehaviour`, `_waitFirstPeriod` 꺼짐) 반경 1칸(PRTS)의 지상 적에게 지금 공격력 × `atk_scale` 법술 피해, 확률 `prob`로 `sluggish`초 정지. 8초면 6번, 10초면 7번이다. 오퍼레이터가 나가도 끝까지 남는다(PRTS 비고). 화면은 사건 `zone`으로 쏠 때 대상 자리로 공식 구체를 날리고(`fxgame.js zoneFx`, 홈바운드와 같은 길), 판정은 대상을 따라간 도착 자리라 대상이 움직이면 조금 어긋날 수 있다.
- 모듈 BOM-X의 「정지 중인 적에게 주는 피해 증가」는 2단계부터라 이 기물(1단계)에는 없다.

### 키치세이 `char_4203_kichi` (T3, 산탄사수)
- 특성: 분기 공통(범위 안 적 모두, 앞줄 칸 `atk_scale`, RPR-X 1.6).
- 재능 행운 연타!(`kichi_t`): 처치한 적의 ID가 새로우면 중첩 +1, 최대 `max_stack_cnt`. 자신의 모든 피해 × (1 + `damage_scale` × 중첩)(`DamageScale` `_isStackable`). 퇴각하면 기록을 지운다(PRTS 비고).
- S1 어서 오세요!: 공격 간격 +`base_attack_time`초. 공격이 끝날 때마다 공격력 +`atk` 중첩, 최대 `max_stack_cnt`. 스킬이 끝나면 모두 사라진다(`_decCntIfStack` 꺼짐).
- S2 운수대통!: 공격력, 공격 간격 +`base_attack_time`초. 한 공격에 맞은 적 모두에게 같은 상태를 걸고, 공격이 끝나면 다음으로 바뀐다: 정지 → 속박(`attack@unmoveable`) → 기절. 시전마다 정지부터(PRTS 비고, `kichi_skchr_02[listener]`의 플래그).

## 새 시즌 아스테시아·콘트레일·에단 (2026-11-07, 관리자 결정 2026-11-05)
규정(`act3autochess`)의 기물(선발 아님). 형태 둘, 스킬 둘, 재능, 첫 모듈(콘트레일은 모듈 없음)을 기록의 표·클라 프리팹·버프 템플릿·PRTS로 구현했다. 맹약 효과(기적·아케인·기습)는 표 뒤. 키트 `ops/op-astesi.js`·`op-ctrail.js`·`op-ethan.js`, 시험 `test/content/op_*.test.js`(두 형태·두 스킬, 실제 대전 경로). 묶음의 물음이던 「S1이 패시브인 특수 직군」은 둘이 다르다: 콘트레일 S1은 배치마다 켜지는 기간제, 에단 S1은 기간 없이 배치 내내 도는 패시브다.

### 아스테시아 `char_274_astesi` (T2, 아츠 파이터)
- 재능 거친 하늘의 몸짓(`astesi_t_1`): 배치 뒤 `interval`초마다 공격 속도 +`attack_speed`, 최대 `max_stack_cnt`번. 첫 중첩은 `interval`초 뒤, 새 배치면 처음부터. 간격은 표의 20초다. 프리팹의 30은 블랙보드 `interval`이 없을 때의 기본값이다(공식 클라에서 확인). 템플릿의 둘째 수정자(방어력)는 표에 키가 없어 0이다.
- S1 성좌의 수호자: 공격력·방어력. S2 빛나는 별의 검: 공격력·방어력·저지 수 +`block_cnt`, 저지한 적 모두 공격(선택기 `_limitedMaxTargetNumToBlockedCnt`).
- 모듈 AFT-Y 예측 불가능한 별자리표: 저지한 적에게 마법 취약 `damage_scale` − 1(`astesi_e_002_trait`, 저지가 끝나면 사라짐). 비비아나 AFT-Y와 같은 처리.

### 콘트레일 `char_4165_ctrail` (T2, 스카이레인저)
- 티피·안젤리나 더 멜로우 위시와 같은 이륙이다: 플래그 `liftoff` + `blockFly`, 사건 `takeoff`, `render/units.js LIFTOFF_HEIGHT`(0.8, `attack@height_offset`), 클립은 `tools/assets/anim-keys.mjs`의 `_TakeOff`·`_Landing`. 모드 구성은 티피와 같고 `Default_S1`이 더 있다.
- 다른 점은 클립 시간이다. 프리팹에서 이륙·착륙 모드의 공격 능력은 그 클립이라(`_timeMode` 1, `_allowNoTarget`) 그동안 공격하지 않는다. 그래서 타락사쿰처럼 `FLY_CLIP`(네 클립 모두 1초) 동안 공격을 막고, 착륙 클립이 끝날 때 지상으로 돌아온다. 배치 때의 이륙 클립은 배치 직후 상태(`bornUntil`)가 끝난 뒤에 돈다. 티피(S1·S2 이륙·착륙 1초)와 안젤리나 더 멜로우 위시(S1·S2·S3 착륙, S3 이륙 1초)도 같다(2026-11-11, `kits/shared/liftoff.js`): 클립 동안 공격하지 않고, 이륙·착륙 모드로 바뀌며 휘두름이 끊기고(모든 모드 공격 능력 `_interruptAbilityOnDetach`), 착륙 클립 동안은 아직 공중이다. 안젤리나 더 멜로우 위시 S2에는 이륙 모드가 없고 시작 클립 `Skill_2_Begin`이 그 자리다(엔진, `sim.md` 「스킬 시작 클립」). 그녀 S1의 배치 때 이륙(`S1_TakeOff`, 클립 `Start_2`)은 배치 직후 상태 뒤에 1초 돈다(2026-11-11, 공식 클라에서 확인): S1의 `_defaultModeIndex` 5 = `S1_TakeOff`라 그 모드로 배치되고, 그 모드는 `Born` 클립을 바꾸지 않으며(`_excludeAnimKeys` Born, 배치 이펙트만 `aglna2_birth_type_02_01`) 이륙 클립은 그 모드의 공격 능력이라 배치 직후 상태가 끝나야 돈다. 공중 저지는 처음부터다(`aglna2_tr`: Default 모드가 아니면 FLY). 콘트레일·타락사쿰의 이륙·착륙도 같은 도우미다: 이륙·착륙 모드로 바뀌며 진행 중 휘두름이 끊긴다(전에는 두 키트가 착륙 때 안 끊었다; 이륙 때는 스킬 공격 모드로 바뀌며 엔진이 끊었다). S3이 끝나 집으로 날아가면 착륙 클립은 도착한 뒤다.
- 지상에서는 지상 적만, 공중에서는 공중 적만 저지한다. 모든 모드의 공격이 투사체다(`projectile_chr_ctrail`, `_s2`).
- 재능 저공 난류(`ctrail_t_1`): 지상 모드(`Default`·`Default_S1`)에서 방어력 +`def`, 그 밖의 모드에서 모든 피해의 공격력 ×`atk_scale`(방어 앞).
- S1 긴급 이륙(패시브, `_castOnLocate`): 배치마다 `duration`초 동안 공격력·물리 회피 `prob`(`ctrail_s_1` Evade). 공식 클라에서 확인: `_defaultModeIndex` 7이고 `_extraRangeIdModeIndices`에 7이 있어, S1을 고르면 착륙 뒤 지상(`Default_S1`)에서도 사거리가 스킬 범위 2-3이다. 키트는 `unit.rangeGrid`로 둔다. 정비 화면 카드·판 범위·배치 미리보기·AI 배치도 S1을 고르면 2-3이다(2026-11-16): 추출기 `char_modes.py range_skill_modes`가 스킬 프리팹의 `_defaultModeIndex`가 그 스킬의 범위 모드(`_rangeIdModeIndex`·`_extraRangeIdModeIndices`)인 스킬을 `local-char-modes.json` `rangeSkills`로 적고, `build-data.mjs skillDeployRange`가 표 범위가 있는 그 스킬 기록에 `passiveRange`를 달아 `shared/loadoutRecord.js attackRangeGrid`가 그 범위를 그린다(프로스트리프 재능 `attackRange`와 같은 길). 풀 전체(두 시즌·선발, EN 먼저 CN)에서 표시가 붙는 것은 콘트레일 S1, 안젤리나 더 멜로우 위시 S1(3-6: `S1_TakeOff`로 배치, 스킬 60초 동안), 쏜즈 더 로드스타 S3(3-9, 문구 「被动效果：攻击范围扩大」로 이미 표시)이고, 벨로네 S3은 표 범위가 없어 그대로다. 공식 정비 카드가 이 범위를 보이는지는 공식 화면 확인 전이다(전투 범위와 같게 맞춘 것). 재발 방지: `test/content/op_ctrail.test.js` 「the prep card and the board draw the range she fights with」.
- S2 하늘을 가르는 비행(범위 3-1): 공격력. 대상은 PRTS 비고대로 공중 최대 3·지상 최대 2를 고른 뒤 그중 3명(자신이 저지한 적 먼저, 그다음 어그로). 엔진에 `attack.pickEnemies`를 더했고 쓰는 키트는 이것뿐이다. 맞은 공중 적은 `attack@sluggish`초 정지(`ctrail_s_2[sluggish]`, 지상 적은 없음).

### 에단 `char_355_ethan` (T3, 매복자)
- 특성: 분기 공통(범위 안 적 모두, 회피 50%, 어그로 −1).
- 재능 휘감기(`ethan_t_1`): 맞은 대상마다 확률 `prob`로 `frozen_duration`초 속박. S2 모드에서 확률 ×`talent_scale`(`_applyTalentScale`).
- S1 요요(패시브, `_defaultModeIndex` 1): 공격에 맞은 대상에게 `attack@duration`초 동안 초당 `attack@poison_damage` 법술 피해, 첫 틱은 1초 뒤, 무출처. 다시 맞으면 시간만 처음으로 돌아가고 값은 그대로다(PRTS 비고). 블루포이즌과 같은 처리.
- S2 크로스 훅: 공격력. 독은 없다(S2 모드 공격에 `ethan_s_1`이 없음).
- 모듈 AMB-X 슈퍼 스프레이 페인트 세트: 범위 안 적 이동 속도 ×(1 + `move_speed`). 에단마다 따로 겹친다(PRTS 비고). 미즈키와 같은 처리. 모듈 재능 프리팹은 안 읽었고 표·PRTS 문구대로다.

## 새 시즌 무스·미스 크리스틴·브리지드·오로라 (2026-11-06, 관리자 결정 2026-11-05)
규정(`act3autochess`)의 기물(선발 아님). 형태 둘, 스킬 둘, 재능, 특성, 첫 모듈을 기록의 표·클라 프리팹·버프 템플릿·PRTS로 구현했다. 맹약 효과(빅토리아·쉐라그)는 표 뒤. 키트 `ops/op-frncat.js`·`op-christ.js`·`op-brigid.js`·`op-aurora.js`, 시험 `test/content/op_*.test.js`.

### 무스 `char_185_frncat` (T1, 아츠 파이터)
- 재능 연속 공격(`ProbReplaceNextAtkTalent`, `_probKey`): `prob` 확률로 그 공격이 재능의 `MultiMeleeAttack`(`_additionalTimes` 1)이 된다. 휘두름을 시작할 때 굴린다(`OnBeforeAttack`). 클립 `Attack_2`의 OnAttack 두 프레임(0.367·0.633초)에 한 공격의 두 타격이 나간다.
- 그 공격은 `_timeMode` 1이라 시간이 클립 길이(1.2초)다. 공격 속도가 올라도 빨라지지 않는다. 그래서 `swing` 훅에 `timing { strike, action, cooldown }`을 더했다(`ai.js`, 다른 키트는 쓰지 않아 움직인 것 없음). 클립은 `SIGNAL_CLIPS`의 `T.1`.
- S1 할퀴기! `skchr_frncat_1`(`PassiveAttachmentAbility`): PRTS 「특수한 패시브, 자동 발동이 아니고 시작·끝 사건이 없음. 공격 전에 SP를 쓰고 그 공격이 끝나면 사라짐, 그 공격은 SP를 안 줌」. 공격력 +N%는 그 공격의 타격 동안만(두 타격이면 둘 다), 맞은 적은 `frncat_s_1[debuff]` 공격력 −N%, 무스마다 하나(`independentCharacterSource`).
- S2 고양이의 분노 `skchr_frncat_2`: 공격력·방어력 +N%.
- AFT-X 1단계: 저지하는 적이 없으면 공격 속도 +8(특성 bb).

### 미스 크리스틴 `char_4198_christ` (T2, 프라이멀 캐스터)
- 재능 진수성찬(`christ_t_1[damage]`, 사거리 안 적에게 `AuraAbility`): 적이 PALSYING이 되는 순간 그녀 공격력의 `atk_scale` 원소 대미지. PRTS 「마비를 얻을 때가 아니라 마비가 공격을 끊을 때」라 엔진 훅 `palsyTrigger`로 잇는다. 크리스틴마다 따로.
- S1 식사 에티켓 `skchr_christ_1`: 공격력 +N%, 대상 2, 맞을 때마다 그 피해의 `attack@ep_damage_ratio`만큼 신경 손상 게이지(`ActiveEP`, 원소 SANITY).
- S2 과음의 연회 `skchr_christ_2`(`ProjectileToTileAbility`, 모드 S2는 공격 없음): `_preDelay` 0.267초 뒤 정령이 대상이 있는 칸으로 날아간다(`PARACURVE`, 속도 8, `_fixOnProjectileReached`). `SelectorHitBehaviour` `_hitPasserby`가 꺼져 있어 도착 전에는 아무도 안 맞는다. 도착부터 `interval`초마다 `projectile_range`(PRTS 1.5) 안 모두에게 공격력의 `atk_scale` 마법 대미지, 신경 폭발 중인 적에게는 그 앞에 `atk_scale_ep` 원소 대미지(`christ_s_2`, `IsTargetInEPBreakRecovery`). 머무는 시간은 `projectile_delay_time`, 대상이 없어져도 그 칸에 남고, 그녀가 쓰러져도 남는다(`_stopWhenSourceInvalid` 꺼짐). 사전 지연 중에 쓰러지면 안 나간다.
- PRI-X: 원소 폭발 중인 적에게 주는 피해 × `damage_scale`(원소 대미지 제외, `burstDamageUp`).

### 브리지드 `char_4177_brigid` (T3, 루프슈터)
- 특성은 분과 공통(`professions.js` `loopshooter`).
- 재능 매듭 고수(`brigid_t[evade_trigger]`): 그녀가 준 피해를 모두 센다(PRTS 「모든 피해」). `trigger_damage_count`에 이르면 물리 회피 `prob`, 그 배치 동안 유지.
- S1 익숙한 것 `skchr_brigid_1`(`ReplacementSkill`): 다음 공격이 `atk_scale`, 그 뒤 투사체가 `times`번 튕긴다(`BounceHitBehaviour.m_bounceTimes`, 첫 타격 + 그 수). 튕김 속도 6(`_speedAfterFirstReach`), 반경 1.7(선택기 콜라이더), 안 맞은 적 중 가장 가까운 적, 없으면 다시 가장 가까운 적(`_allowRepetitionIfNoTarget`·`_fixAllowRepetitionIfNoTarget`), 타격마다 `atk_scale`(`_atkScaleRatePerBounce` 1). 마지막 타격 자리에서 돌아온다.
  [추정·화면: 혼자 있는 적에게 되풀이 타격이 바로 이어지는지. 프리팹 `_keepAlreadyHitTime` 0.7이 그 사이를 벌리는지 읽지 않았다]
- S2 조련 가능한 것 `skchr_brigid_2`: 공격력 +N%. 맞은 적에게 `attack@sluggish`초 정지와 `brigid_s2[cut]`: `attack@cut_duration`초 동안 `attack@interval`초마다 공격력의 `attack@cut_scale` 물리 대미지(첫 틱은 간격 뒤, 4회). 그녀를 선택할 수 없는 적이 되거나 그녀가 쓰러지면 끝(`VertifyTarget`). 투사체는 `attack@projectile_delay_time`초 머문 뒤 돌아오므로 다음 공격도 그만큼 늦다.
- LPS-X 1단계: 주위 8칸의 적을 공격할 때 공격력 × `atk_scale`(특성 bb, `chess_char_1_09` 키트와 같은 규칙).

### 오로라 `char_422_aurora` (T3, 듀얼리스트)
- 특성: 저지 중이 아니면 SP 회복 없음(`SP_RECOVER_STOPPED`). HES-X는 대신 SP 회복 ×(1 + `sp_recover_ratio`)(PRTS).
- 재능 저온 휴식(Default 모드의 `ToggleablePassiveBuffAbility` + `SpRatioToggleChecker`): 스킬이 꺼져 있고 SP가 최대치의 `sp_ratio` 이하(같아도)이면 공격 불가(`DISARMED`)와 최대 HP의 N% 초당 회복. PRTS 「생명 회복 속도 속성, 치료 보너스·치료 불가와 무관」이라 `hpRegenRatio`.
- S1 터전 고수 `skchr_aurora_1`(`_switchToState` 1, `_beginAnim` `Skill_Begin` 0.5초): 저지 수 +2, 방어력 +N%, 저항(`one_minus_status_resistance`). 시전이 진행 중인 휘두름을 끊고 시작 클립 동안 공격하지 않으며, 스킬(수치·저항)과 지속 시간은 그 뒤부터(`BasicSkill.PlayBeginAnimation`, 엔진 — `sim.md` 「스킬 시작 클립」; 2026-11-11 전에는 수치가 시전 때부터). 클립 동안 기절하면 시전이 사라져 끝의 자기 기절도 없다. 끝나면 자신 `stun`초 기절.
- S2 인공 강설 `skchr_aurora_2`(`Skill_2_Begin` 0.667초, 9회: `_triggerTimeCount`): 공격력 +N%, 공격 간격 ×(1 + `base_attack_time`). 빙결이 아닌 적에게는 그 타격에 `attack@cold`초 한기(`aurora_s_2[freezeattack]`, 두 번째 한기는 엔진 규칙대로 빙결), 빙결 중인 적에게는 그 공격의 공격력 × `atk_scale`(`aurora_s_2[freezeattack2]`, `AtkScaleUp`: 방어력 앞에서).

## 새 시즌 사일런스 더 패러디그매틱·외드레르·메커니스트 (2026-11-08, 관리자 결정)
- 2026-11-12부터 맹약 시즌 선발이기도 하다 → 위 「선발 추가 사일런스 더 패러디그매틱·외드레르·메커니스트」. 이 절은 규정 기물로서의 키트다.
규정의 기물 사일런스 더 패러디그매틱(淬羽赫默 `char_1031_slent2`, `chess_char_4_20`, 4티어)·외드레르(赫德雷 `char_4088_hodrer`, `chess_char_4_21`, 4티어)·메커니스트(机械师 `char_4230_mcnist`, `chess_char_6_15`, 6티어 — 예비 오퍼레이터 Mechanist `char_610_acfend`와 다름). 키트는 upstream 선발 키트(커널 직전 `9a3a12ee9^`)를 가져와 `SEASON_KIT_FILES`에 둔다 — 선발 추가는 나중(관리자 결정 2026-11-08). 수치는 기물 기록의 블랙보드를 읽는다. 메커니스트는 KR 이름이 없어 국내 사이트의 이름을 쓴다(관리자 결정 2026-11-08; KR 출시 때 KR 이름으로 바꿈) [비공식].
- 폼: 일반 A(E2 Lv1, 스킬 4, 모듈 없음)·정예 B(E2 Lv60, 스킬 7). B의 모듈은 1단계에서 고른다(사일런스 BLS-X 기본·BLS-Y·없음, 외드레르 CRU-X 기본·CRU-Y·없음), 메커니스트는 SO-A 3단계 기본·없음. 사일런스·외드레르의 2·3단계 효과(BLS-X 최대 HP, BLS-Y 보호막, CRU-X 가호 31%·물리 대미지, CRU-Y 첫 타격 기절)는 규정에 없어 나오지 않는다(키트는 그대로 둠).
- 자동 발동은 규정 표대로: 외드레르 S3 `DEFAULT`(규정 표에 그의 행이 없음 — 선발 표의 `ACTIVE_RANGE`는 해당 없음), 메커니스트 S2·S3 중장 행 `TAKE_DAMAGE`.
- 키트에서 바꾼 것: upstream의 `allyTargets: false`(스테인리스 게를 자동 발동의 적으로 안 셈)를 지웠다 — 게는 공식 상자 판정에 걸린다(「선발 추가 스테인리스·하루카·나이팅게일」). 메커니스트 구조성 원리의 수명은 토큰 재능 자신의 `skill@duration`(30초)으로: 규정 정예의 토큰 변형에는 SO-A 3단계가 바꾼 값(−1, 통합전략 전용 「무한」)만 있어 일반 기물의 변형에서 읽는다.
- 키트 주석에 남은 추정:
  - 외드레르 [추정·미조사: 회피된 타격에도 S2·S3 기절이 먼저 붙는지]·[추정·미조사: S3 매초 생명 손실이 그를 쓰러뜨릴 수 있는지].
  - 사일런스 [추정·미조사: BLS-Y 보호막을 소환물은 안 받음 — 3단계라 규정에 없음]·[추정·미조사: 스킬 시작 때 이미 서 있는 야등이 그 스킬의 드론인지].
  - 메커니스트 [추정·CN: CN에만 있는 오퍼레이터라 클라 로직을 못 읽음] — 구조성 원리 금지 치료 깃발, 자동 재배치, S2 회피된 타격의 전율, 그녀가 쓰러진 사이의 돌진, 착지할 칸이 없을 때(5곳).
- 시험 `test/content/op_slent2.test.js`(11)·`op_hodrer.test.js`(8)·`op_mcnist.test.js`(9): 두 폼·모듈 선택, 세 스킬, 두 재능, 특성, 소환물, 실제 대전 경로(`seasonPieces.js realMatch`). 선발 시험을 규정 기록으로 옮기는 틀은 `seasonPieces.js pieceForms`. 소환물 모델 야등(`token_10029_slent2_protrb`, EN)·구조성 원리(`token_10069_mcnist_mcgraf`, CN)를 `extract.py TOKEN_SPINES`에 더했다.

## 새 시즌 메테오라이트·올가·아미야 (2026-11-08, 관리자 결정 2026-11-05)
규정의 기물 메테오라이트(陨星 `char_219_meteo`, `chess_char_1_17`, 1티어)·올가(奥尔佳 `char_4245_alga`, `chess_char_3_26`, 3티어, CN에만 있는 오퍼레이터)·아미야(阿米娅 `char_002_amiya`, `chess_char_5_26`, 5티어, 의료 형태). 세 키트는 `SEASON_KIT_FILES`(`op-meteo.js`·`op-alga.js`·`op-amiya3.js`)에 있고 선발 후보가 아니다. 수치는 기물 기록의 블랙보드를 읽는다. 시험 `test/content/op_meteo.test.js`(5)·`op_alga.test.js`(6)·`op_amiya3.test.js`(6): 두 폼, 두 스킬, 재능, 특성·모듈, 실제 대전 경로.

### 메테오라이트 `char_219_meteo` (T1, 포격사수)
- 특성 「공격 시 범위 물리 대미지」: 분과 프로필 `aoesniper`(`professions.js`)가 맞은 적 둘레 1.0 안의 모든 적에게 같은 대미지를 준다. 공식 클라에서 확인: 포격사수 평타 투사체(`projectile_meteo`, W의 `projectile_chr_cqbw`)의 폭발 범위 `Range` CircleCollider2D 반경 1.0(PRTS 溅射半径一览 1.0과 같음). 프로필은 그전 1.1(스플래시 캐스터 값)이었다 — 지금 시즌에 포격사수 기물이 없고 선발 W 키트는 1.0을 따로 써서 드러나지 않았다. 고쳐도 W와 지금 시즌 전투는 그대로다.
- 모듈 ART-Y: 공격 시 적 방어력 100 무시(특성 bb `def_penetrate_fixed`, 정예 폼만).
- 재능 폭발물 부착 개조(`ProbAdditionNextAtkTalent`, `_probKey` prob, 계열 마스크 15 — 평타와 스킬): 공격마다 한 번 굴려 성공하면 그 공격(범위 대미지 포함, S2 포탄도)이 `meteo_t_1`(공격력 +atk, MULTIPLIER)을 지닌 채 나간다.
- S1 `skchr_meteo_1`(다음 공격, 공격 SP): 공격력 × `atk_scale`, 투사체 `projectile_meteo_s1`의 폭발 반경 2.0(「폭발 범위 확대」).
- S2 `skchr_meteo_2`(즉발, `_switchToState` 1, `_shouldCastLikeAttack`): 클립의 OnAttack 프레임에 평타가 고를 적 하나에게 포탄(`projectile_meteo_s2`, 속도 8)을 쏘고, 떨어진 곳 1.2 안의 모든 적에게 공격력 × `atk_scale` 물리 대미지와 `meteo_s_2`(방어력 +def — 음수 고정값, `duration`초, 메테오라이트마다 따로: `independentCharacterSource`).

### 올가 `char_4245_alga` (T3, 교관, CN 클라)
- 특성 「자신이 저지하지 않은 적 공격 시 공격력 120%」(`alga_tr`): 분과 프로필 `instructor`. 모듈 INS-X가 130%로(특성 bb). 공격 선택기는 지상만(`_targetMotion` 1).
- 재능 선제 기선(先声夺人): 재능 칸(자신과 주변 8칸, 방향과 함께 돎)의 오퍼레이터(`professionMask` 639 = 모든 직군, 소환물·장치 제외)에게 0.1초마다 `alga[check_enemy]`: 공격력 +`alga[atk_up].atk`(MULTIPLIER), 그녀의 공격 범위에 정예·리더 적이 있거나 그녀가 그런 적을 저지 중이면 + `alga[check_enemy].atk`(`CheckEnemyLevelMaskInRange`·`CheckBlockEnemysLevelType`). 올가마다 따로(`independentCharacterSource`).
- 그녀는 공격력이 가장 높은 정예·리더 적을 먼저 친다(대상 순서 `eliteAtk`, `targeting.js`; 저지한 적이 먼저인 규칙은 그대로). [추정·CN: 공격 선택기의 `_postFilter` 80은 EN 클라에 없는 새 필터라 이름을 못 봄 — 순서는 재능 문구대로]
- S1 교차 압박(交叉施压, `ReplacementSkill`, 공격 SP, `MultiMeleeAttack` `_additionalTimes` 1, `_triggerDelta` 0.1): 다음 공격이 공격력 × `atk_scale`로 0.1초 간격 두 번(같은 대상, 그 대상이 살아 있고 그녀가 움직일 수 있을 때).
- S2 오직 나의 답을 위해(只为我的答案, 15초): 모드 Skill2(스킬 범위 3-2 — 「공격 범위 확대」), 공격력 +atk(`alga_2[mode]`), 재능 값 × `talent_scale`(Skill2 모드 재능의 `_applyTalentScale`). 그녀의 물리 공격 대미지(`alga_2[try_add]` ON_AFTER_OUTPUT_DAMAGE)가 대상에게 `alga_2`를 `debuff_duration`초: 정지(`sluggish`)와 `alga_2[taunt]`(도발 등급 + `attack@taunt_level` — 「아군에게 더 쉽게 공격받음」). 그 도발은 그녀가 건 다른 적에게서 사라진다(`FinishBuffsOfEveryEnemyById`, 출처 확인). 도발 등급은 그녀 자신의 대상 순서에도 들어가므로, 그 적이 범위에 있는 동안 그녀도 계속 그 적을 친다.
- 그녀의 프리팹은 S2 모드를 `S2`가 아니라 `Skill2`로 부른다(모드 Default·Skill2). 스킬 모드 이름 규칙(`shared/skill-modes.js skillModeIndex`, `char_modes.py SKILL_MODE_NAME`)이 `S<n>`·`Sk<n>`에 더해 `Skill<n>`도 읽게 해, S2의 공격 클립 `Skill_2_Loop`·이펙트·모드 전환이 그 모드에서 나온다. 이런 이름은 지금 그녀뿐이다(숫자 없는 `Skill`인 미틈은 그대로).
- 한국어 이름·문구는 KR 서버에 아직 없어 KR 표의 말투로 손으로 옮겼다(`public/i18n/ko/manual.json`, `docs/I18N.md` 「CN-only texts in Korean」).

### 아미야 `char_002_amiya` 의료 형태 `char_1037_amiya3` (T5, 주술 메딕)
- 템플릿 기물: 기물은 오퍼레이터 `charId` `char_002_amiya`(이름·맹약·소유)를 들고, 몸은 템플릿 `tmplId` `char_1037_amiya3`(char_patch_table: 능력치·스킬·재능·모듈·모델)이다. 공식 클라는 그 몸의 charpack·이펙트·스킬 프리팹·버프 템플릿을 템플릿 ID로 찾는다. 그래서 키트는 몸의 ID로 둔다(`op-amiya3.js`, 키 `char_1037_amiya3`; `content/index.js kitOf`가 `tmplId`를 먼저 본다). 추출·생성 도구도 기물을 몸으로 읽는다(`shared/standIn.js chessBody`, `char_modes.py body_id` — `fetch-assets`·`build-fx-templates`·`add_operator.py`). 그녀의 기물은 PRESET이라 대체 기물(补位) 경로를 타지 않고, 대체 기록(`backup.tmplId`)이 기물과 같은지는 `build-data`의 짝 검사가 본다.
- 특성 「법술 대미지, 공격 시 범위 안 아군 1명을 대미지의 50%만큼 치료」(`amiya3_tr` + `TraitHealRange`): 분과 프로필 `incantationmedic`. 모듈 INC-X가 60%로(특성 bb `scale`).
- 재능 诚挚期许(KR 이름은 KR 표의 char_patch_table에 있음 — 시즌 한국어 덧씌우기 때): 그녀가 전장에 있는 동안 모든 아군 유닛 최대 HP +`max_hp`(`amiya3_t_1`, MULTIPLIER, 범위 없음). 그녀의 스킬이 켜진 동안(S1·S2 모드의 Talents/1) 모든 아군 유닛이 초당 최대 HP의 `hp_recovery_per_sec_by_max_hp_ratio`를 회복(`amiya3_t_1[s]`). [추정·엔진: 오라 갱신 주기 0.2초 — 나중에 배치된 유닛도 곧바로 받게]
- S1 슬픔의 공감(哀恸共情, 50초, 모드 S1): 공격 속도 +`attack_speed`. 그녀의 공격 대미지마다(`amiya3_s_1` ON_CALCULATE_DAMAGE, 계열 ATTACK) 스킬 범위 x-1 안의 다른 아군 유닛 모두를 공격력 × `heal_scale`만큼 치료(`amiya3_s_1[heal]`, 능력 `amiya3_skill1`; `_excludeTargetType` SOURCE라 자신은 아님).
- S2 자비의 비전(慈悲愿景, 32초, 전투당 한 번 — `skill_max_trigger_time` 1, `_limitGlobalTriggerTime`): 클립(`S2Attack`, `Skill_2_Begin`)의 OnAttack 프레임에 공격 범위 안 모든 적에게 공격력 × `atk_scale` 법술 대미지와 `amiya3_s_2[debuff]`(공격 속도 + `…attack_speed`, 이동 속도 ×(1 + `…move_speed`), 그 지속 시간). 맞힌 적 하나마다 공격력 +atk(최대 `max_stack_cnt`번, `amiya3_s_2[atk]` — 스킬이 끝날 때 사라짐: `amiya3_s_2[passive]` ON_SKILL_FINISH). 남은 시간은 모드 S2: 공격이 트루 대미지(`_damageType` 3)이고 적 2명을 동시에 친다(그 선택기 `_maxNum` 2). 한 번 쓴 뒤로는 SP가 다시 차지 않는다.

## 새 시즌 재키·체스트넛·시데로카·레이지 아이언하이드 (2026-11-10, 관리자 결정 2026-11-05)
규정의 기물 재키(杰克 `char_347_jaksel`, `chess_char_1_12`, 1티어)·체스트넛(褐果 `char_4041_chnut`, `chess_char_1_15`, 1티어)·시데로카(铸铁 `char_333_sidero`, `chess_char_2_22`, 2티어)와 숨김 기물 레이지 아이언하이드(“暴躁铁皮” `char_618_acrbot`, `chess_char_5_22`, 5티어 — 유넥티스 리더 전략 【暴躁铁皮】 `band_mech`이 1라운드에 줌, CN에만 있는 오퍼레이터). 네 키트는 `SEASON_KIT_FILES`(`op-jaksel.js`·`op-chnut.js`·`op-sidero.js`·`op-acrbot.js`)에 있고 선발 후보가 아니다. 수치는 기물 기록의 블랙보드를 읽는다. 시험 `test/content/op_jaksel.test.js`(5)·`op_chnut.test.js`(5)·`op_sidero.test.js`(5)·`op_acrbot.test.js`(7): 두 폼, 스킬, 재능, 특성·모듈, 실제 대전 경로.

### 재키 `char_347_jaksel` (T1, 파이터)
- 재능 급속 회피(极速闪避): 물리 회피 `prob`(`jaksel_t_1[evade]`, `evade_physical`). 물리 공격을 회피할 때마다 공격 속도 +N, `duration`초(`charge_atk_speed_on_evade`, 겹치지 않고 다시 시작). 모듈 FGT-X(정예): 특성의 물리 회피 15%는 따로 굴리는 회피다(합 = 1 − Π(1 − p)).
- S1 한 방 먹여주마!(给你一拳！): 다음 공격이 공격력 × `atk_scale`.
- S2 정신 집중!(全神贯注！): 시작 클립 `Skill_Start`(0.333초) 뒤 모드 S2. 그 모드의 능력은 `StrikeBack` 하나라 공격하지 않는다. 물리 회피 +`prob`(`jaksel_skill_2[evade]`). 물리 공격을 회피하면 `StrikeBack`을 시전한다(`charge_ability_on_evade`, 쓸 수 있을 때만): 평타가 고를 적 1명에게 공격력 × `attack@atk_scale` 물리 대미지, 클립 `Skill_Loop`의 타격 프레임(0.333초)에. 다음 반격은 공격 간격 × `base_attack_time` 뒤부터(스킬 버프가 공격 간격에 `BASE_ATTACK_TIME` FINAL_SCALER로 곱함 — 문구 「반격 빈도는 공격 간격의 N% 이상」).

### 체스트넛 `char_4041_chnut` (T1, 방랑 메딕)
- 특성: 치료와 함께 원소 손상을 공격력 × `ep_heal_ratio` 회복(분과 프로필 `wandermedic`, WDM-X가 0.6으로).
- 재능 차근차근(脚踏实地): 낮은 지대에 선 아군에게 주는 원소 손상 회복 × `ep_heal_scale`(`chnut_t_1`: `IsElementHeal` + 대상 칸의 `CheckHeightTypeOfCharacterRootTile` LOWLAND).
- S1 적미성저(积微成著): 충전(일반 1·정예 2). 스킬 클립 `Skill`의 타격 프레임에 스킬 선택기가 고른 아군 1명(HP 비율 먼저, 다음 원소 손상 — `_postFilter` HP_RATIO_ASC_EP_MIN_ASC_FIRST_NOT_ALL_FULL)에게 공격력만큼 치료, 원소 손상 회복 × `trait_scale`(`chnut_s_1`). 재능도 붙는다.
- S2 후토분출(厚土迸发): 모드 S2(아래를 향하면 S2(Down) — 같은 공격), 스킬 범위 3-2, 공격 속도 +N. 공격은 `ContinuouslyRangedHeal`이다: 바로 앞 치료와 같은 아군이면 HP 치료와 원소 손상 회복 × `attack@heal_continuously_scale`. 공식 클라에서 확인: `ContinuouslyRangedHeal.OnCastStart`가 입력 대상이 지난 대상과 같을 때만 그 배율을 치료와 원소 치료(`_applyScaleForEPHeal`)에 넣고, 다르면 원래 배율로 두고 지난 대상을 바꾼다. 모드가 붙을 때 능력의 `Reset`이 지난 대상을 비우므로 스킬마다 첫 치료는 배율이 없다.
- 엔진: 치료 프로필의 `heal.scaleOn(battle, unit, target)`(`ai.js doHeal`)이 그 치료의 HP·원소 회복 배율을 준다.

### 시데로카 `char_333_sidero` (T2, 아츠 파이터)
- 특성: 마법 공격(분과 프로필 `artsfghter`). 모듈 AFT-Y(정예): 저지한 적이 마법 취약 `damage_scale` − 1(`sidero_e_002_trait`: 저지 대상이 바뀔 때 다시 붙는 파생 버프, 아스테시아의 AFT-Y와 같은 꼴).
- 재능 용병의 근성(佣兵之韧, 정예만 — 일반 폼 기록에 재능이 없음): 적을 `times`명 처치하면(`sidero_t_1[stack]`이 처치마다 한 겹 줄고 다 줄면) 공격 속도 +N과 저항(`status_resistance[inf]`, −`one_minus_status_resistance`), 그 배치 끝까지, 한 번.
- S1 HP 회복 γ(`skcom_heal_self[3]`): 즉시 최대 HP × `heal_scale` 회복(`_isHpRatio`).
- S2 파도 가르기(破浪回神): 모드 S2, 스킬 범위 0-1(자기 칸 — 저지한 적만 친다), 공격력 +N, 초당 최대 HP × `hp_recovery_per_sec_by_max_hp_ratio`(생명 회복 속도 속성).

### 레이지 아이언하이드 `char_618_acrbot` (T5 숨김, 저거너트, CN 클라)
- 특성 「아군의 치료를 받을 수 없음」: 분과 프로필 `unyield`(`noHeal`; 클라는 `acrbot[equip-vfx]`의 HEAL_FREE). 모듈 UNY-X(정예): 자신이 저지한 유닛에게 받는 대미지 × `damage_scale`(`acrbot_e_002_tr`: `CheckBlocked` + `DamageScale`).
- 공격: Default·Sk1의 `Combat`·`Attack` 선택기가 모두 대상 수 제한 없이(`_limitTargetNum` 0) `_limitedMaxTargetNumToBlockedCnt`를 단다 → 저지 가능 수만큼 동시에 친다(저지한 적 먼저 — 공격수 규칙, `hitAllBlocked`). 같은 분과 머드락의 기본 공격 선택기에는 이 표시가 없다(그녀 S2에만 있음).
- 재능 야만의 심장(荒蛮之心, `acrbot[t2]`): 쓰러지면 제 칸에서 `projectile_chr_acrbot_t2`가 터져 `projectile_range`(1.7) 안 모든 적에게 쓰러질 때의 공격력 × `atk_scale` 마법 대미지(`_forceUseProjectileCachedAtk`)와 기절 `stun`초.
- 재능 족장의 위엄(酋长之威, `acrbot[t1]`): 저지 가능 수 +`block_cnt`, 공격 범위가 앞으로 `ability_range_forward_extend`칸(일반 1·정예 2). 장비 칸(4·6, 기록 `equipSlotNum`)은 이 키트가 아니라 장비 규칙 쪽이다.
- S1 거대하고 못생긴 것의 분노(大丑的愤怒, 20초, `acrbot[sk1]` → 모드 Sk1): 기본 공격 시간 −0.6초(ADDITION), 공격력 +N, 최대 HP +N, 기절·동결·침묵·공중 띄우기·수면·혼수 면역(`abnormalImmunes` STUNNED FROZEN SILENCED LEVITATE DOZE, 콤보 SLEEPING; 이 엔진에 혼수 상태는 없음). 모드 Sk1의 선택기는 자신 말고 양쪽 진영을 고른다(`_targetSide` ALL, `_excludeOwner`): 범위 안 아군도 치고, 적이 없어도 친다. 엔진: 공격 프로필 `alliesToo`(`ai.js acquireTargets`)가 범위의 아군을 적 뒤에 붙인다. [추정·CN: 적과 아군이 한 목록일 때의 순서(`_postFilter` HATRED_DES)는 CN에만 있는 선택기 클래스라 읽지 못함 — 적 먼저. 대상 수가 저지 가능 수(4)라 2~3칸 범위에서는 보통 모두 맞는다]
- 한국어: KR 표에 있는 이름(레이지 아이언하이드, 거대하고 못생긴 것, 「…의 배지」)과 말투로 손 번역했다(`public/i18n/ko/manual.json`, `docs/I18N.md` 「CN-only texts in Korean」).
