# 전투·경기 규칙 (시뮬레이션·서버)

원래 `docs/LOCAL-PATCH.md` 한 파일이던 것을 2026-10-09에 영역별로 나눴다(내용은 그대로 옮김, 색인은 `docs/LOCAL-PATCH.md`). 본문의 「아래」「위」는 옛 한 파일 기준이라 다른 파일에 있을 수 있다 — 절 이름으로 `docs/LOCAL-PATCH.md` 색인이나 `grep -rn "<이름>" docs/rules/`로 찾는다.

## 게임 수치 수정 상세 (2026-10-05)

### 협동 보스 HP
> 0.2.0: upstream이 같은 협동 규칙을 넣어 우리 패치를 뺐다. 싱글은 upstream이 ×1로 바꿨으나 우리는 ×0.25로 되돌렸다(cfadd871,
> 사용자 결정 2026-10-07 — 위 「0.2.0 병합」). 아래는 기록.
- 원본: 협동은 인원과 관계없이 `bloodPoint[난이도]` 하나, 싱글은 ×0.25. 공식 데이터·PRTS에 인원 계수는 없다(원본 이슈 #113, PR #126 모두 근거 없음을 인정).
- 로컬: 협동 = `bloodPoint` × 최종 공세/히든 코어 시작 때 살아 있는 인원(1~4). 싱글은 원본 그대로.
  - 나간 사람은 서버가 탈락 처리하므로(`Match.onLeave` → `_quit`) 세지 않는다. HP가 0이 돼 탈락한 사람도 빠진다. AI 팀원은 센다.
  - 보스전 도중에 나가도 이미 정해진 풀은 줄지 않는다.

### 상점 칸 배치 (2026-10-09, 사용자 제보 「업그레이드로 추가되는 새 칸은 비워둬야함 … 실제 인게임은 아이템이 항상 왼쪽」)
- 원본(0.2.0, `464a823b`): 조달 센터 업그레이드로 늘어난 칸을 즉시 새 레벨 카드로 채움(2026-10-06 중국 커뮤니티 제보 19번 「用新卡补上，而不是空着」),
  배치는 [오퍼레이터…][아이템].
- 로컬 — **사용자 2026-10-09 (실제 인게임)**: 리롤(수동 갱신·라운드 시작) 뒤에는 아이템 칸이 맨 왼쪽, 그다음 오퍼레이터. 업그레이드로 생긴 칸은
  **왼쪽에 빈 칸**으로 열리고, 보이던 카드는 다음 리롤까지 제자리. → `server/match/player/economy.js` `rollShop`(배열 = 표시 순서, 뽑는 순서는
  예전처럼 오퍼레이터 먼저라 상점 난수 순서 그대로), `_openLevelSlots`(빈 칸을 앞에 끼움), `shop.kinds`(빈 칸 포함 칸별 종류, `_shopKinds`),
  `effectsMeta.js setShopSlot`·`player/round.js`·`player/views.js`(`m.private.shop.kinds`), `audit.js`(규칙 감사). 동결된 카드는 같은 종류 칸 안에서 자리 유지.
  클라이언트 `public/js/ui/shopBar.js`: 칸을 배열 순서대로 한 줄에(아이템 카드도 `.shopbar__cards` 안), 빈 칸은 공식 빈 카드(`EmptyCard`, 「NO INFO」 그림).
- 확인: 실제 솔로 판(Windows `shoplayout.mjs`) — 리롤 [아이템, 오퍼×3] → 업그레이드 [빈 칸, 아이템, 오퍼×3] → 리롤 [아이템, 오퍼×4].
  테스트 `test/match/feedback5-shop-levelslots.test.js`(다시 씀), `test/match/hardening.test.js`, 0번 칸을 오퍼레이터로 가정하던 테스트들
  (`economy`·`feedback5-hand`·`bot-smarter`), e2e 선택자(`.scard:not(.scard--item)`), `test/e2e/fastServer.mjs` SP_START_SHOP(첫 오퍼레이터 칸들).
  골든 `matches` 전부 갱신(업그레이드가 더 이상 상점 난수를 쓰지 않음). 문서: META §3·§7, PLAYING.

### 보스전 초과 시간 (2026-10-09, 사용자 제보 「카운트다운 종료 후 바로 HP가 깎이기 시작했는데 지금은 30초 유예」)
- 원본: 카운트다운 = 보스 레벨 `maxPlayTime` 120초, 팀 생명 감소 = 활동 테이블 `bossTurnHpReduceTime` 150초부터(둘 다 실제 초). 그 사이 30초 유예.
- 로컬: 감소를 카운트다운이 끝나는 순간(120초)부터 — `server/match/gamedata.js bossOvertimeStartReal(r)`(레벨 시간 없을 때만 150), `match/bossRounds.js`
  (`overtimeStartReal`, `m.public.overtimeAt` = `deadline`). 근거: **사용자 결정 2026-10-09** — 공식 플레이 영상에서 120초 카운트다운이 끝나자
  유예 없이 감소 시작(팀 생명 50이면 보스전 최대 170초); PRTS 卫戍协议/帮助 「计时结束后战斗仍然会继续，但每超时1秒扣除1目标生命值」. `bossTurnHpReduceTime`
  150이 무엇을 세는지는 모른다 [추정 없음 — 미확인].
- 테스트: `test/match/finalAssault.test.js` 「overtime」, `test/match/clientCombat.test.js` 「Final Assault: leaks…」, `test/docs-consistency.test.js`.
  골든 `matches` 3개(보스전 생명) 갱신. 문서: design/geometry-time·match, META, DATA, SIM, PLAYING, BALANCE.
- 미반영 (정리만, 사용자 2026-10-09): 공식은 보스전 진입 후 처음 약 6초를 오퍼레이터 배치 모션과 보스 등장 모션이 차지해 체감 전투 시간이 약 114초다.
  우리는 이 연출 시간이 없다(카운트다운과 전투가 바로 시작). 나중에 연출을 넣을 때 카운트다운 시작 시점을 함께 볼 것.

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
| `enemy_9008_acbunn` | 가상적: 골극 | 1 | 공중 공격 → upstream `c250ff66`이 막음(2026-10-09 `NO_AIR_KEYS`에서 뺌) | 「不会攻击飞行单位，隐匿…」 |
| `enemy_10027_vtsk` | '제국의 갑옷' | 1 | 공중 공격 | 「未被阻挡时进行远程途径攻击…，不会攻击飞行单位」 |

- 클라이언트 값만 있는 것 (사용자 결정 「공식 클라이언트를 따라 막아」, 2026-10-06 — 이전 [추정 보류]): 일반 공격 대상에서 비행 제외.
  - 클라이언트 1, PRTS 언급 없음: `enemy_2010_csdcr` 스칼릿 싱어, `enemy_1252_lysytb_2` Dor-β호 복제품, `enemy_1427_lrnazg` '영장'(「可同时攻击自身攻击范围内的所有我方单位」),
    `enemy_1509_mousek` 래트킹(PRTS 적 문서 못 찾음), `enemy_1504_cqbw` W(일반 공격 1, PRTS 적 문서 못 찾음).
  - `enemy_1535_wlfmster` 자로: 형태별(`NO_AIR_FORMS`) — 1형태(M1)는 일반 공격 필터가 없어 그대로, 재생 후 2형태(M2 공격 1, `e.form === 'form2'`)만 비행 제외.
  - `enemy_1516_jakill` 제셀톤: 우리 시뮬은 두 형태를 다 쓴다. 1형태(狱警, 원거리, 공격 1 + PRTS 「普通攻击和技能不会攻击飞行单位」)는 비행 제외,
    2형태(杀手)는 근접이라 저지한 유닛만 쳐서 규칙이 있어도 차이 없음(프리팹에 일반 공격 필터 없음).
  - `enemy_10098_crhro` / `enemy_10099_crvln`: 기본 형태 1 → 제외. 사격 형태(3·3 / 3·1)는 이 시뮬에 없음(촬영 구역 미구현).
  - `enemy_9014_acstma` / `enemy_9015_acstmb`: 바깥 공격 선택자 1(안쪽 3) → 제외. 2026-10-09: upstream `977215e1`(PRTS 「不可对空」)이 `canTarget`과
    키트의 `before` 대상까지 막아 `NO_AIR_KEYS`에서 뺌(골극도 같음, `c250ff66`) — 테스트 「now upstream's own rule」.
  - `enemy_1404_msnip` 강화 석궁 기습자: 일반 공격 필터 없음, 십자 사격 3 → 그대로.
  - 직접 공격 대상을 고르는 키트(`before`에서 `c.targets`를 바꿈: '영장'은 범위 안 전원, 갑주 칼날은 범위 안 전원)는 엔진 후보 필터를 거치지 않아,
    내용 처리(우선도 50) 뒤 우선도 49 `beforeAttack`에서 대상 목록을 한 번 더 거른다(비면 공격 안 함).
- 테스트: `test/local-patch.test.js` 「sweep」 2개(원본은 모두 공중 허용, 로컬은 지상만), 「client-only」(8종 + 자로 형태별; 갑주 칼날 2종은 2026-10-09부터 「now upstream's own rule」), '영장' 직접 대상 선택 재필터, 실제 대전 경로 2개(굴절 II 캐스터, 은신 I 석궁병 + 炎佑).
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
    `render/units.js` `enemyModelScaleY`(골격 Y 스케일·HP 바 높이·임포스터), 반전은 `flip`에 곱함. 491235e4의 `UNIT.modelScale` 0.0027·
    `TOKEN_MODEL_K`는 그대로(보정은 그 위의 비율). 연구 문서 `docs/research/12-flying-visuals-official.md`도 가져옴. 테스트
    `test/render/playtest6-enemies.test.js`(upstream 그대로, 수정 전 렌더러로 2개 실패 확인). merge-0.2.0에는 v0.2.0으로 이미 있다(stronghold-79 확인).

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

## upstream 0.2.1·0.2.2 이식 sim-1: detmath · 잠재(潜能)·练度 (2026-10-09, 사용자 결정 — research/2026-10-09-upstream-compare/README.md 「정해진 것」 2·4·5차)
- **detmath** (`03b1e20e` ← upstream `ae22335c`, PR #373, 결정 8): `server/sim/detmath.js`(hypot·powi·sin·cos·atan2, fdlibm)로 전투 수학을
  엔진에 무관하게 — 서버(Node)·Chrome·Firefox·Safari 클라이언트가 같은 결과. eslint가 `server/sim/**`에서 근사 `Math.*`·`**`를 막는다.
  우리 키트 손 수정: 望 hypot·powi(이동 속도 중첩), 丰川祥子 atan2·sin·cos·hypot, 维什戴尔 hypot, 赤刃明霄陈 hypot. golden 변화 없음.
- **잠재·练度** (upstream #252 → 0.2.2 R22-LOADOUT): 오퍼레이터마다 플레이어가 潜能 1–6·练度 0–3을 정한다(브라우저 저장·「干员调配」 표는 ui-2).
  설정 없음·봇 = **潜能 6, 练度 3(精英2 Lv.60 = 공·방·HP ×1.1)**.
  - `26fb88ff` ← `806a0477`: build-data가 character_table `potentialRanks`의 능력치 단계(코스트·재배치·공·HP·방·저항·공속)를 더하고
    재능 후보를 requiredPotentialRank 5까지 고른다(만잠). 근거: upstream 대회 영상 刺玫 ATK 435 / 코스트 15.
  - `c5cdcf55` ← `7e09c63d`: data가 낮은 潜能을 `potDown`·사슬 재능(`potMin`/`potBelow`)으로 함께 싣는다(`shared/potential.js`). 주석을 뺀 데이터는 직전과 같음(확인).
  - `440b90df` ← `ec0a2fc6`: 전투 입력의 `potential`·`cultivate` → 그 潜能의 기록, 练度는 ×ATK/×DEF/×최대 HP를 **따로 곱한다**
    (PRTS 盟约记录 「…与自持有干员的属性加成独立」; 공식 activity_table cultivateEffectList / effects CHAR_MAP aceffect_char_1…4).
    대역(补位)·소환물은 안 받음(소환물 [ASSUMED], upstream 그대로). 望 키트 `stoneLimits`가 棋子 변형을 그녀의 潜能으로 맞춤(우리 키트만 손).
  - `54a7e951` ← `96d9441f`: `room.loadout`의 `ops`, 좌석·PlayerState·battleInput·정찰 UnitInfo. 공식 근거: 调度手册 「卫戍协议中干员潜能由自身已持有干员潜能决定」.
    golden: roster·bonds·fields·matches·diy 전부 이동(806a0477의 만잠 + 练度 ×1.1), 대역 10개는 그대로.
  - 이식 때 우리 쪽에 맞춘 것: upstream 테스트의 凯尔希·Mon3tr·원형(原型) 선발 → 우리 다섯 명(望·赤刃明霄陈·阿斯卡纶), 선발 폼 수 256 → 58.
    望은 기본 潜能에서 棋子 7(모듈 8) — 정비·디버그·실제 경기 경로 테스트가 돌 7개를 놓는다(`diy.md` 望 절).
    维什戴尔 폭발 스모크 테스트는 15 % 판정이 운이었다(만잠 ATK로 시드 5에서 안 나옴) → 튼튼한 더미 + 판정 고정.
  - 한국어: 잠재 단계가 붙은 모듈 재능 4줄(공식 KR 템플릿 없음)을 `public/i18n/ko/manual.json`에 추가(잠재 0 줄은 낮은 潜能용으로 그대로).
- **#400** (`11a417d5` ← `66297106`): 이그제큐터 디 엑스 포에데레 REA-Y 특성 문구 「HP 12 회복」 → 50(전투는 원래 50). 데이터 문구만.

## upstream 0.2.1·0.2.2 이식 sim-2: 联防 전장 · 보스 포털 · 失衡 · 정수 프레임 (2026-10-09, 이식은 사용자 결정 — research/2026-10-09-upstream-compare/README.md 「범위 밖(이미 결정)」)
upstream 순서(联防 → 포털 → 失衡 → 정수 프레임)로 이식했다 — 뒤 커밋의 문맥이 앞 커밋을 전제해서. 커밋마다 golden 재생성.
- **联防 = 그 라운드 전장** (`cf400175` ← `75202776`, GitHub #244, upstream 주인 결정 2026-10-07 「官服保留地形，改回去」): 0.2.0의
  escaped 템플릿 맵은 모든 웨이브 템플릿 레벨이 같은 칸을 갖는 빈 길(자리표시 격자)이었다. `unitePhase.js _uniteOpts`가 `this.stageId`,
  `unite.js uniteStageId` 삭제, `data/stages.json`의 `kind: 'unite'` 두 레코드는 남음(아무 필드도 안 씀). 실제 경기 경로
  `test/match/feedback5-unite-map.test.js`: 필드 meta·리커의 spec·`publicView()` 모두 경기 stageId.
  → 우리 `205159bc`(联防 sceneId 우회, `render.md` 「联防 화면」)는 이로써 실행되지 않는 코드가 되어 render-2 `84c17a5b`에서 걷어냈다
  (upstream `game.js` hunk 포함).
- **보스 필드 포털** (`f0dcaab7` ← `a87cc1e9`, `583a0fa0` ← `1205336a`, GitHub #336 / PR #337, 공식 녹화): 경로가 모서리 포털 입구([1,3]/[1,17])에서
  끝나면 누수가 아니라 가장 먼 출구 [5,10]으로 나와 그쪽 파란 문까지 걸어가 누수. 포털 안 3초는 [ASSUMED](데이터 명시 통과 95개 중 85개가 3초).
  APPEAR 없는 통과 4개(h07_02 #4, h08_02 #5/#9, act2 h07_05 #6)에 출구 APPEAR 추가(`simdata.js portalAppear`). 짝짓기(입구→가장 먼 출구)도 [ASSUMED].
- **失衡** (`23c475f0` ← `cdf2bd5c`, `56431c36` ← `1db84d79`, PR #392 아이디어; PRTS 失衡位移机制·失衡免疫·推力-位移近似对应表·推与拉·特殊机制 静态刚体):
  밀린 적은 受力等级별 位移时间(−2 0.2 s … 3 35/30 s), 당긴 적은 1 s(−2 이하 0.5 s) 동안 걷지 않고(恐惧·诱导 포함) 평타를 시작하지 않으며
  스킬·순간이동·스크립트 이동도 멈춘다. 静态刚体는 밀기 0.1 s·당기기 그 창 전체, 이동 0. 浮空·重生·逐火 余烬·경로 APPEAR가 끝낸다.
  弧光锋卫 출혈은 失衡 동안 0.066 s마다 400. 기절이 아님(상태 없음, SP·쿨다운 흐름). [ASSUMED]: 벽에 막힌 밀기도 그 행의 시간, 첫 칸에서
  막히면 0.1 s; 적 능력의 전역 잠금 범위. `_unbalance`의 `_cutAttackStand`(upstream 문맥, `8a64edc9`)는
  render-2 `7fc265eb`에서 다시 넣음. 클라이언트 슬라이드는 displace fx의 `dur`(render-2 `d1ba043b`, `render.md` 「upstream 이식 render-2」).
- **정수 프레임** (`cc0bd82f` ← `227ab9e7` + `6de5dec3`, PR #402; PRTS 作战机制/sandbox 「帧对齐机制对攻速的影响」 1프레임 = 1/30 s):
  `ai.js attackCountdown`(0에서 1e-9 이내 = 0) — 오퍼레이터·적 공격 간격, 双眼皮 포탑, 寒檀 S2 고드름; `SkillRuntime.gainSp`가 코스트에서
  1e-9 이내면 충전. 1 s = 30프레임(전엔 31). 정수가 아닌 간격은 여전히 ⌈30 × t⌉(공식 四舍五入과 다른 옛 차이, 그대로).
  golden 전 가족 이동: solo-ABYSS-1 패배(13R) → 승리(LP 5), coop3-ABYSS-5 한 라운드 일찍 탈락.

## upstream 0.2.1·0.2.2 이식 sim-3: 오퍼레이터·엔진 규칙 (2026-10-09, research/2026-10-09-upstream-compare/README.md 「이식 추천」·「정해진 것」 3·6차)
커밋마다 하나(#298 두 커밋만 하나로), 커밋마다 golden 재생성. 근거는 각 커밋 본문(upstream이 인용한 PRTS 비고)이고, 우리 corpus는 upstream과 달라 이동한
시나리오 이름이 다를 수 있다(해당 오퍼레이터·적이 나오는 판인지 확인함).
- 키트: 耀骑士临光 卡西米尔 재배치 감소 5 % 하한 없음 `3d2334f6` ← `f14b3a06`(#370) · 信仰搅拌机 S1 보충 = 마지막 배치 `d495b434` ← `7e8b435f`(#325) ·
  歌蕾蒂娅 S3 捕网 반경 1 `36d4c306` ← `b2510524`(#324) · 异客 S3 雷暴 x-1 마름모 `2b051c40` ← `a0cd6826`(#322) · 伊内丝 S3 突袭 착지 후 재발동
  `04e510b3` ← `6d6fbe92` · 凋亡이 저장 충전 SP도 깎음 `23ed1897` ← `c225559d`(PR #262) · 引星棘刺 S1/S2 회복 = 생명 회복 속도 `244dce8a` ← `42caca3b`,
  DEF 중첩 `d3d8b3b8` ← `1a67ecc3`, 동률 = 마지막 배치 `5ff604ca` ← `03688c82`(#388; 사이의 白铁 `69d791f9` 줄은 안 받음) · 공격 없는 즉발 스킬은
  공격 간격마다 한 번 `7d6943ac` ← `4128965a` + `db29acf9`(#298, [ASSUMED] 한 간격 — 우리 望 테스트는 수정 불필요) · 外勤医疗 Touch ACTIVE_RANGE
  `33b99a8f` ← `c623550f`(sim만, 카드 UI는 ui-2; 「스킬 범위 발동」 미확정 상태 그대로) · 香槟炸弹 은신·수면 적에 안 터짐 `6e861775` ← `e733171b`
  (손 이식, `5f98baec` 무적·禁疗은 안 받음 — 결정 1).
- 望 跟子: `dfad1795` ← `5a045731` (b)만(결정 3) — `diy.md` 「跟子 칸에 배치하면 그 跟子가 사라진다」. (a) 전투 시작 跟子는 안 받음(결정 2), (c)는 이미 PRTS대로.
- 엔진: 同名效果取最高 3개 이상 `80d0ccb1` ← `3356b340`(#342; upstream content 테스트는 우리에게 없는 선발 3명이라 버림, sim 단위 테스트가 대신) ·
  帝国炮火先兆者 포탄 3×3 `904bec38` ← `895653fc`(#364, **[ASSUMED]** 충돌 반경 0.25 더함) · 假想敌：骨刺 대상 `ce3f5a73` ← `c250ff66`(#365 —
  우리 `NO_AIR_KEYS`의 acbunn은 뺌) · 碎铳之簧 5초 추적 `28380a5d` ← `f2aec39e`(PR #347, `unbalancedNow` 조건 유지) · 战场#08 보스 경로
  `3e7ed9e2` ← `8d896e40`(#375, 보스 경로 미리보기도 따라감) · 大帝 加急调派 무한 `dadf5255` ← `ca671f2f`(#328) · 不可对空 효과가 炎佑에 안 닿음
  `708670a4` ← `977215e1`(위 「적 비행 유닛 공격 전수 조사」 표 밖의 다섯 효과: 죽음 폭발·水遁忍者 漩涡·鼎沸·祈祷邀约·胄 칼날 — 갑주 칼날은
  `NO_AIR_KEYS`에서 뺌, 골극과 함께 따로 커밋) · 刷新时 특질 시점 `8af7a705` ← `ce2bd75b` · 속사 저격수 비행 우선 `d1748531` ← `4bd154e3`(#205, 결정 6,
  `upstream.md` 「일부러 안 가져온 것」 줄 고침) · 频次 器物·보스 소환물에 라운드 적 효과 `57869f6b` ← `e33ee3db`(PR #272, 반올림 **[ASSUMED]**,
  `data/config.json`은 build-data로 재생성 — supplyHp 키만; golden roster 36·bonds 1·fields 11·matches 15).
- 안 받음: `5f98baec`(香槟炸弹 무적, 결정 1) · `38d4c3e4`(余 文火慢炖 층 없는 맹약, 결정 5 — PRTS 「仍然对其生效」대로) · `5a50f7b5`(REA-Y 공속 엔진화, 보류).

## upstream 0.2.1·0.2.2 이식 sim-4: 기습 · 아이템 · 진행 · 서버 도구 (2026-10-09, research/2026-10-09-upstream-compare/README.md 「이식 추천」·「정해진 것」 2차 4·7)
커밋마다 하나, 바뀐 커밋만 golden 재생성. 우리 corpus가 upstream과 달라 이동한 시나리오 이름이 다를 수 있다(해당 규칙이 나오는 판인지 확인함).
- 기습(突袭 맹약): 양쪽 절반이 다 찬 필드(2인 연합방어·최종 공세/숨겨진 핵심 2인 필드)에서는 팀원 절반에도 착지 `6a6f4024` ← `cfd3c672`
  (`Battle.onFieldBoard`, upstream 관리자 결정 2026-10-07 — **[ASSUMED]**, 데이터 근거 없음; 혼자인 연합방어의 빈 절반·솔로 보스 필드의 다른 절반·손패/임시 정비
  구역 줄은 그대로 막힘; 울피아누스 S3 【移动】은 `onOwnBoard` 유지. upstream의 0.2.1 설계 절(§26.1)·`docs/history/0.2.1.md`는 우리에게 없어 주석은 이 절을 가리킴) ·
  은신(隐匿) 지상 적에게도 점프, 사거리 안 은신 지상 적은 「范围内没有敌人」을 깸 `a8d4938e` ← `48a2d37e`(GitHub #316, upstream 관리자의 공식 게임 관찰
  2026-10-08 — **[ASSUMED]**, 맹약 문구는 「敌人/地面敌人」뿐). 사용자 결정 2026-10-09 #4 (a)(b).
- 소모 아이템도 교체 창 `c00fa419` ← `8cef750e`(GitHub #263, 사용자 결정 2026-10-09 #7): PRTS 卫戍协议/帮助 §装备 「达到上限强行佩戴会改为替换装备：指定一件已佩戴装备
  替换为将要佩戴的装备，并销毁被指定的装备」 — 装备时销毁 예외 없음. 고른 장비(없으면 가장 오래된 것)를 효과 전에 떼고, 효과가 통하면 파괴, 거부되면(정예에 박사
  투영) 되돌림. 우리 `7635caa8`(일반 박사 투영만)을 대체 — `upstream.md`의 그 줄에 「대체됨」. 금빛 박사 투영도 꽉 찬 일반 오퍼레이터에는 이제 창을 띄움.
- 두루마리(画卷) `69c42e7d` ← `19c7b268`(#389) · `13084d1b` ← `ac423184`(PRTS 画卷 备注 「获得的装备为未装备状态」) · 소환사 판매 칸 `53047bf6` ← `d07d97dc`
  (PR #309) · 아무것도 못 준 소모 아이템 알림 `dd171826` ← `8c763097`(#401, ko 2줄 `ko/ui.json`).
- 윗줄 캡슐 = 공식 「처치+누수 / 예정 수」 `87f61517` ← `b4bc89ad`(PR #308; 분열·소환·보스 소환은 분자·분모 밖이나 LP·완벽 작전에는 그대로; golden은 total
  열·snaps만, 결과 동일) · 연합방어/보스 2인 필드는 필드 자체 resolved `ed071308` ← `1a880699`.
- 도베르만(전략) 교편(教鞭) 공식 3택 — **서버만** `a844690f` ← `56a7b918`(act2autochess choice_event hunter_band_1 PERSONAL_CHOOSE, PRTS 「于3个战术特训的
  悬赏任务中选择一项」); 클라이언트·문구 6개는 ui-2. 최종 공세·숨겨진 핵심에서 전술 특훈 완벽 보상 `d231ff6b` ← `05eb2b80`(조건 **[ASSUMED]**: 승리·실제 결과·
  자기 필드 누수 0) · 그 지급을 b.progress `leaksBy`와 대조 `4e25d495` ← `66a228c6` · 봇이 사거리 0 중장을 길 칸에 먼저 `06e601e1` ← `e6321457`(PR #339,
  range_table 「0-1」 = (0,0) 한 칸).
- 서버·도구: 빌드 태그에 server/sim·shared·data `5805abd5` ← `8597b66d` · b.start를 sim 로드 전 pending `ab642315` ← `d84b961c`(우리 진단 `recordError` 줄 유지) ·
  build-data --refresh 실패 시 옛 캐시 안 씀 `be86b1e8` ← `063408e4` · SP_VERIFY 8 ms 조각 `df5b2b34` ← `a2a3f524`.
