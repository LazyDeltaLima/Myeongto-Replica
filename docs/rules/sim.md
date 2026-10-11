# 전투·경기 규칙 (시뮬레이션·서버)

옛 `docs/LOCAL-PATCH.md`에서 2026-10-09에 나눈 파일이다. 옛 절 이름은 `docs/LOCAL-PATCH.md` 색인에서 찾는다.

## 게임 수치 수정 상세 (2026-10-05)

### 협동 보스 HP
> 0.2.0: upstream이 같은 협동 규칙을 넣어 우리 패치를 뺐다. 싱글은 upstream이 ×1로 바꿨으나 우리는 ×0.25로 되돌렸다(f11bdabc,
> 관리자 결정 2026-10-07 — `upstream.md` 「0.2.0 병합」). 아래는 기록.
- 원본: 협동은 인원과 관계없이 `bloodPoint[난이도]` 하나, 싱글은 ×0.25. 공식 데이터·PRTS에 인원 계수는 없다(원본 이슈 #113, PR #126 모두 근거 없음을 인정).
- 로컬: 협동 = `bloodPoint` × 최종 공세/히든 코어 시작 때 살아 있는 인원(1~4). 싱글은 원본 그대로.
  - 나간 사람은 서버가 탈락 처리하므로(`Match.onLeave` → `_quit`) 세지 않는다. HP가 0이 돼 탈락한 사람도 빠진다. AI 팀원은 센다.
  - 보스전 도중에 나가도 이미 정해진 풀은 줄지 않는다.

### 상점 칸 배치 (2026-10-09, 관리자 제보)
- 원본(0.2.0, `464a823b`): 조달 센터 업그레이드로 늘어난 칸을 즉시 새 레벨 카드로 채움(2026-10-06 중국 커뮤니티 제보 19번 「用新卡补上，而不是空着」),
  배치는 [오퍼레이터…][아이템].
- 로컬 — **관리자 제보 2026-10-09 (실제 인게임)**: 리롤(수동 갱신·라운드 시작) 뒤에는 아이템 칸이 맨 왼쪽, 그다음 오퍼레이터. 업그레이드로 생긴 칸은
  **왼쪽에 빈 칸**으로 열리고, 보이던 카드는 다음 리롤까지 제자리. → `server/match/player/economy.js` `rollShop`(배열 = 표시 순서, 뽑는 순서는
  예전처럼 오퍼레이터 먼저라 상점 난수 순서 그대로), `_openLevelSlots`(빈 칸을 앞에 끼움), `shop.kinds`(빈 칸 포함 칸별 종류, `_shopKinds`),
  `effectsMeta.js setShopSlot`·`player/round.js`·`player/views.js`(`m.private.shop.kinds`), `audit.js`(규칙 감사). 동결된 카드는 같은 종류 칸 안에서 자리 유지.
  클라이언트 `public/js/ui/shopBar.js`: 칸을 배열 순서대로 한 줄에(아이템 카드도 `.shopbar__cards` 안), 빈 칸은 공식 빈 카드(`EmptyCard`, 「NO INFO」 그림).
- 확인: 실제 솔로 판 — 리롤 [아이템, 오퍼×3] → 업그레이드 [빈 칸, 아이템, 오퍼×3] → 리롤 [아이템, 오퍼×4].
  테스트 `test/match/feedback5-shop-levelslots.test.js`(다시 씀), `test/match/hardening.test.js`, 0번 칸을 오퍼레이터로 가정하던 테스트들
  (`economy`·`feedback5-hand`·`bot-smarter`), e2e 선택자(`.scard:not(.scard--item)`), `test/e2e/fastServer.mjs` SP_START_SHOP(첫 오퍼레이터 칸들).
  골든 `matches` 전부 갱신(업그레이드가 더 이상 상점 난수를 쓰지 않음). 문서: META §3·§7, PLAYING.

### 보스전 초과 시간 (2026-10-09, 관리자 제보)
- 원본: 카운트다운 = 보스 레벨 `maxPlayTime` 120초, 팀 생명 감소 = 활동 테이블 `bossTurnHpReduceTime` 150초부터(둘 다 실제 초). 그 사이 30초 유예.
- 로컬: 감소를 카운트다운이 끝나는 순간(120초)부터 — `server/match/gamedata.js bossOvertimeStartReal(r)`(레벨 시간 없을 때만 150), `match/bossRounds.js`
  (`overtimeStartReal`, `m.public.overtimeAt` = `deadline`). 근거: **관리자 결정 2026-10-09** — 공식 플레이 영상에서 120초 카운트다운이 끝나자
  유예 없이 감소 시작(팀 생명 50이면 보스전 최대 170초); PRTS 卫戍协议/帮助 「计时结束后战斗仍然会继续，但每超时1秒扣除1目标生命值」.
- `bossTurnHpReduceTime` 150 = 초과 시간의 길이(2026-10-10 클라 코드로 확인): `AutoChessBattleUICountdownViewModel._GetBossBattleTimeInfo`(RVA 0x1FE75C0)가
  카운트다운 끝을 「서버가 준 상태 강제 종료 시각 − `turnInfoDataDict[mode][round].bossTurnHpReduceTime`」으로 잡는다 → 카운트다운이 끝나고 150초 뒤
  서버가 보스전을 끝낸다(관리자 결정의 감소 시작과도 맞음). 로컬: `gamedata.js bossOvertimeWindowReal(r)`(`rounds[r].bossOvertimeAfter`, 150) ·
  `bossOvertimeDue(gt, start, window)`가 감소를 150초분(최대 150 LP)에서 멈추고, `match/bossRounds.js _applyOvertime`이 그때 `overtimeOver`를 세워
  보스 필드를 팀 생명 0 때처럼 강제 종료(`_bossTick` / `_checkFinalEnd` → 'forced') — 리더가 서 있으니 패배(隐秘核心이면 그 판은 「미격파」). 강제 종료 때
  공식 서버가 무엇으로 셈하는지는 서버 로직이라 클라에 없다 — 패배로 둔다(**관리자 결정 2026-10-10**: 어떤 전략으로도 팀 생명 합이 150을 넘을
  수 없어 실제 판에서는 강제 종료 전에 생명이 먼저 0이 된다; 상한은 생명 부스트 같은 디버그·테스트 판에서만 닿는다). 팀 생명이 150 이하이면 전과 차이
  없음. 핫픽스 없음.
- 테스트: `test/match/finalAssault.test.js` 「overtime」, `test/match/clientCombat.test.js` 「Final Assault: leaks…」, `test/docs-consistency.test.js`.
  골든 `matches` 3개(보스전 생명) 갱신. 문서: design/geometry-time·match, META, DATA, SIM, PLAYING, BALANCE.
- 미반영 (정리만, 관리자 2026-10-09): 공식은 보스전 진입 후 처음 약 6초를 오퍼레이터 배치 모션과 보스 등장 모션이 차지해 체감 전투 시간이 약 114초다.
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

### 더블린 그림자 캐스터 (深池暗影术师, `enemy_1168_dumage`/`_2`, 수배·전술 특훈 - 굴절 II) — 2026-10-06
관리자 제보(여러 마리가 한꺼번에 공격)를 조사했다 — 공격 타이밍은 수정 없음, 비행 유닛 공격 안 함을 추가.
- 공식: 원거리 법술, 공격 간격 3.0초, 범위 2.5, 투사체 `projectile_enemy_dumage`(속도 10, 1회 타격), 재능은 굴절(마법 저항 +70)뿐, 스킬 없음.
  우리 시뮬도 같다(단독 30초: 3.0초마다 1발).
- 실제 대전 경로(수배 15_5, 여러 스테이지·라운드)에서 한 마리는 늘 3초 간격. 한꺼번에 들어오는 경우는 「특훈 적·굴절」 라운드의 4마리 무리
  (예: seed 2 R4, 1.75초 간격 4마리 → 두 마리씩 0.5초 차로 같은 오퍼레이터를 노림). 공식 웨이브 구성대로라 버그로 보지 않았다.
- 비행 유닛 공격 안 함 (2026-10-06, 관리자 결정 「공식과 일치하면 넣어」): PRTS 천부 「不会攻击飞行单位」, EN 클라이언트 프리팹
  `Attack/Trigger`의 `_targetMotion 1`(지상만; `_2`도 1). 비교: 비행을 치는 웨이브 캐스터 `enemy_1161_tidmag`·살카즈 왕정군 정예 캐스터
  `enemy_1275_dwlock_2`는 3, 이미 「不会攻击飞行单位」로 구현된 `enemy_10122_uacann_2`·`enemy_10141_xdpeng_2`는 1.
  원본은 굴절만 넣어 비행 아군(炎 6명 맹약의 「炎佑」 `enemy_9012_acloon`)도 쐈다. 로컬: 두 적에게 원본의 같은 규칙
  (`e.profile.canTarget = u => !u.isFlying`, enemies.js `noAirTargets`와 동일)을 붙임. 起飞(이륙) 아군은 원래부터 지상 적이 못 친다(`evadesGround`).
  `enemy_1023_jmage`(은신 캐스터)는 아래 전수 조사에서 같이 넣었다.

### 적 비행 유닛 공격 전수 조사 (2026-10-06, 관리자 제보)
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

- 클라이언트 값만 있는 것 (관리자 결정 「공식 클라이언트를 따라 막아」, 2026-10-06 — 이전 [추정 보류]): 일반 공격 대상에서 비행 제외.
  - 클라이언트 1, PRTS 언급 없음: `enemy_2010_csdcr` 스칼릿 싱어, `enemy_1252_lysytb_2` Dor-β호 복제품, `enemy_1427_lrnazg` '영장'(「可同时攻击自身攻击范围内的所有我方单位」),
    `enemy_1509_mousek` 래트킹(PRTS 적 문서 못 찾음), `enemy_1504_cqbw` W(일반 공격 1, PRTS 적 문서 못 찾음).
  - `enemy_1535_wlfmster` 자로: 형태별(`NO_AIR_FORMS`) — 1형태(M1)는 일반 공격 필터가 없어 그대로, 재생 후 2형태(M2 공격 1, `e.form === 'form2'`)만 비행 제외.
  - `enemy_1516_jakill` 제셀톤: 우리 시뮬은 두 형태를 다 쓴다. 1형태(狱警, 원거리, 공격 1 + PRTS 「普通攻击和技能不会攻击飞行单位」)는 비행 제외,
    2형태(杀手)는 근접이라 저지한 유닛만 쳐서 규칙이 있어도 차이 없음(프리팹에 일반 공격 필터 없음).
  - `enemy_10098_crhro` / `enemy_10099_crvln`: 기본 형태 1 → 제외. 사격 형태(3·3 / 3·1)는 이 시뮬에 없음(촬영 구역 미구현).
  - `enemy_9014_acstma` / `enemy_9015_acstmb`: 바깥 공격 선택자 1(안쪽 3) → 제외. 2026-10-09: upstream `977215e1`(PRTS 「不可对空」)이 `canTarget`과
    키트의 `before` 대상까지 막아 `NO_AIR_KEYS`에서 뺌(골극도 같음, `c250ff66`) — 테스트 「now upstream's own rule」.
  - `enemy_1404_msnip` 강화 석궁 기습자: 일반 공격 필터 없음, 십자 사격 3 → 그대로.
  - `enemy_1305_mhslim` 작열 원석충 / `_2` 폭염 원석충 (2026-10-10 재확인, 관리자 제보 「공중을 못 칠 텐데 염의 가호를 친다」): 일반 공격
    `Modes/Default/Body/Attack/Selector` `_targetMotion 3`(dump.cs `MotionMask` WALK_ONLY 1·FLY_ONLY 2·ALL 3), 능력 문구도 灼燃损伤뿐 → 비행을 치는 것이 맞다, 그대로
    (본편의 근접 원석충과 다른 원거리 변종).
  - 직접 공격 대상을 고르는 키트(`before`에서 `c.targets`를 바꿈: '영장'은 범위 안 전원, 갑주 칼날은 범위 안 전원)는 엔진 후보 필터를 거치지 않아,
    내용 처리(우선도 50) 뒤 우선도 49 `beforeAttack`에서 대상 목록을 한 번 더 거른다(비면 공격 안 함).
- 테스트: `test/local-patch.test.js` 「sweep」 2개(원본은 모두 공중 허용, 로컬은 지상만), 「client-only」(8종 + 자로 형태별; 갑주 칼날 2종은 2026-10-09부터 「now upstream's own rule」), '영장' 직접 대상 선택 재필터, 실제 대전 경로 2개(굴절 II 캐스터, 은신 I 석궁병 + 炎佑).
- **스킬·범위 피해** (2026-10-06 2차, 같은 관리자 결정): 스킬마다 **대상을 고르는 선택자**(Trigger/Selector)와 **투사체 충돌 선택자**를 따로 읽었다
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
  참고: S2 blackboard `respawn_time 1`(클라이언트 `utage_s_2[respawn]`, 재배치 시간)은 키트에 없다 — 이번 범위 밖.
  - 후속 제보(S2에서 적을 저지하지 못함): 재현 안 됨. 실제 경로(정비 loadout 0/1/없음 = 상점 기본 S2, 일반·정예)에서 저지 수는 S2 중·후 모두 1, S1 分神 중에만 0.
    S2를 고르면 저지 테스트(大鲍勃)도 통과. m04에서 S2일 때 저지 0회였던 판은 적(灼热源石虫)이 앞 칸에서 그녀의 공격 + 지형 지속 피해로 먼저 죽어 닿지 않은 것이다.
    공식에도 S2는 저지 수를 바꾸지 않는다(skill_table·클라이언트 S2 모드). 화면에서는 S2 15초 동안 分神 자세(이번 그림 버그)였고, S2는 HP 50%를 잃고 회복이
    안 되어 일찍 쓰러질 수 있다 [추정: 제보의 원인].
- **스킬 클립·스킬 모드 번호 교정 (2026-10-07 관리자 제보; 비공개 조사 기록)**: S1이 클립 없는 공용 버프라
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
  아직 하나씩 확인하지 않았다(비공개 조사 기록).
- **시빌라이트 에테르나(魔王) S3 HP 재분배**: 키트(`kits/ops/chess_char_4_25-cetsyr.js`)가 재분배 대상에서 「다른 역할의 치료 대상이 되지 않음」(武者 우타게 등)·禁疗 아군을 뺐다 →
  그 아군은 HP가 그대로였다. PRTS 비고 「重新分配生命为计算攻击范围内所有友方单位的(当前生命值和/生命上限和)得到平均比例，随后平均分配友方单位生命值使得分配后
  各个友方单位的生命比例等于该平均比例」; EN 클라이언트 S3 모드 AuraHeal 능력(재분배 버프 `cetsyr_s_3[collect_hp_ratio]`/`[cal_hp_ratio]`를 붙이는 능력)의
  선택기 `ignoreHealFree: 1`. 재분배는 치료가 아니므로 범위 안 아군 전부(본인 포함)로 바꿨다(`// local patch` 1줄). [추론: `ignoreHealFree`의 의미는
  이름과 원본 tier5 키트(숨김 魔王, 필터 없음)로 판단.] 공식대로 S3 오라 회복(공격력 75%/초)이 커서 회복 가능한 아군끼리는 재분배가 잘 안 보인다.
- **은신 아군이 적 스플래시에 맞음**: 엔진은 이미 대칭이다 — 적의 범위 효과는 `targeting.js areaSelectable`(隐匿 제외, 원본 GitHub #97)로 고른다.
  `enemy_1500_skulsr`(碎骨) 수류탄으로 확인: 隐匿 이웃은 스플래시 0, 迷彩(위장) 이웃은 맞는다. 공식: PRTS 术语释义 迷彩 「不阻挡时不成为敌方普通攻击的目标
  （无法躲避溅射类攻击）」, 异常效果 迷彩 「所有光环类能力、以及涉及中点判定/格子判定的效果均不受迷彩制约」; 隐匿 「不阻挡时不成为敌方攻击的目标」. 화면은 迷彩도
  은신과 같은 반투명·`stealth` 아이콘(`public/js/render/style.js`)이라 구분이 안 된다 — 제보 오퍼레이터는 迷彩일 가능성이 크다 [추정]. 아군 隐匿: 伪装服(첫 피격 후),
  叙拉古 6, 伊内丝 S2, 排气格栅(연기) 타일. 아군 迷彩: 维什戴尔(선발, 그림자 근처), 寒芒克洛丝 S1, 忍冬 S3 후. 코드 변경 없음, 테스트로 고정.
  - 후속 제보(시라쿠사 6의 은신 오퍼레이터가 부패의 전사 계열에게 범위 피해로 쓰러짐): 살카즈 부패의 전사 = 萨卡兹枯朽战士(`enemy_1267_nhpbr`, `_2` 리더)는 쓰러질 때
    【污染秽蚀】 지대를 남긴다(스플래시가 아니라 지속 피해 지대). PRTS: 「【污染秽蚀】：范围内位于低地/高地的我方干员和召唤物每秒受到50/25点真实普通伤害（可对空，
    无视无法选择、迷彩；同名效果不叠加）」 — 隐匿은 无法选择의 하나라서 공식으로 맞는다(`enemies.js pollution` `ignoreSelect`). 부패의 전차(`enemy_1272_nhtank`)의
    秽蚀轰击 지대도 같다. 叙拉古 6은 隐匿(`bonds/core.js` `flags.stealth`, 迷彩 아님)이고 배치 후 공속 버프와 같은 시간만 지속된다. 아군 隐匿은 저지해도
    풀리지 않고, 저지당한 적 하나만 그 오퍼를 공격한다(PRTS 「敌人会在自身被干员阻挡情况下强行无视对方可选性发动攻击」). 코드 변경 없음, 테스트로 고정.
- **炎佑가 지상 유닛처럼 타일을 차지함 (2026-10-08 관리자 제보)**: 炎 6명 맹약의 「炎佑」(`enemy_9012_acloon`, 키트가 `motion 'FLY'`)는
  비행 유닛인데 `Battle._deploy`가 생성 칸을 `_occ`에 넣어, 날아간 뒤에도 그 칸이 막혀 있었다(배치·소환·재배치·쓰러진 오퍼 복귀 대기).
  화면도 지상 유닛처럼 배치 방향 링·화살표를 그렸다. 수정: `_deploy`·`relocate`는 `motion === 'FLY'` 아군을 `_occ`에 넣지 않고 그 칸의 점유도
  따지지 않는다; `render/units.js`는 비행 아군에 방향 표시를 그리지 않는다. 테스트: `test/content/playtest4_summons.test.js`(생성 칸이 비어 있고
  지상 유닛이 그 칸에 설 수 있음), `test/ui/unitFacing.test.js`, `test/helpers/battleHarness.js checkInvariants`(비행 아군은 어느 칸도 차지하지 않음).
  - **공중 판정 (2026-10-08 후속, 관리자 제보)**: ① 비행 아군은 `unit.ground = false`
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
    버프 템플릿은 자기 칸 높이만 본다(비행 여부 무관) — 비행 아군은 아래 칸으로 판정 — 클라 코드 `Enemy.get_rootTile`(0x733920) = `m_currentTile`(지금 서 있는 칸), 炎佑는 Enemy 클래스
    (`Character.get_rootTile` 0x708030은 배치 칸; `Nodes.CheckHeightTypeOfCharacterRootTile.Execute` 0xBA48F0가 rootTile의 `heightType`을 읽음).
    아군 쪽 `ground` 사용처(隐德来希 S2, 赫默 재능 치료 배율, 焰影苇草 S2 순서)는 炎佑를 원래 고르지 않는다(孤立·禁疗·오퍼레이터만).
    테스트: `playtest4_summons.test.js` 「炎佑 is an air unit」(ground false, 칸이 위치를 따라감, 격자 범위), 「【污染秽蚀】 on 炎佑」(m02, 저지대 50).
- **비행 유닛 높이 (2026-10-08 관리자 제보)**: 0.2.0 병합 전에는
  `FLY_HOVER`가 0.32칸이었다. upstream `66ae86b9`(PR #211 by @xcdoge, 연구 `docs/research/12-flying-visuals-official.md`,
  아래 모델 보정 때 함께 가져옴)를 골라 이식: 공식 클라이언트의 비행 오프셋은 모델과 무관한 상수 `Vector3(0, 0.35, 0)`(캐릭터 공간, 단위 0.27) ≈ **1.3칸**, 공식 스크린샷
  실측 1.2~1.4칸. `render/units.js FLY_HOVER = 1.3`; 몸체·HP 바·데미지 숫자·이펙트 기준점은 `hover`를 따라 올라가고 그림자는 땅에 남는다(이미
  그렇게 되어 있었음). 炎佑도 같은 높이. 테스트: `test/render/unitview.test.js`(upstream 3개 + 炎佑).
  - 모델 보정 2개도 이식 (2026-10-08 관리자 요청 「모델 보정 두 개도 이식해줘」, 같은 upstream 커밋): 帝国炮火先兆者·帝国炮火中枢先兆者는 세로
    1.263배(`modelScaleY`), 木制瑞印은 좌우 반전(`mirrorX`). EN 클라이언트로 다시 확인(`tools/local-extract/enemy_model_offsets.py`, upstream에서 가져옴):
    `Graphic` 스케일 (0.19, 0.24, 0.24) → sy/sx 1.263, 木制瑞印 (−0.4, 0.4, 0.24) → 반전; 비교용 妖怪 (0.2, 0.2, 0.2). `tools/build-data.mjs`
    `MODEL_STRETCH_Y`·`MIRRORED_PREFABS` → `data/enemies.json`(오프라인 재생성 — 바뀐 것은 이 3개 레코드뿐, 다른 data 파일은 바이트 동일),
    `render/units.js` `enemyModelScaleY`(골격 Y 스케일·HP 바 높이·임포스터), 반전은 `flip`에 곱함. 053283a1의 `UNIT.modelScale` 0.0027·
    `TOKEN_MODEL_K`는 그대로(보정은 그 위의 비율). 연구 문서 `docs/research/12-flying-visuals-official.md`도 가져옴. 테스트
    `test/render/playtest6-enemies.test.js`(upstream 그대로, 수정 전 렌더러로 2개 실패 확인).

## 스킬 범위 발동 — 관리자 결정 2026-10-11 확정 (클라 `AutoChessBattleTrigger` 그대로)
- 규칙(관리자 결정 2026-10-11 「공식대로」, **확정**): MANUAL 스킬의 자동 시전은 클라 위수협약 자동 조작을 그대로 따른다.
  0.2 s마다(`AutoTrigger` → `WaitForFixedSeconds(0.2)`, `constants.js AUTO_TRIGGER_INTERVAL`) 한 번 배치 순서대로 캐릭터를 돈다
  (`_TryTriggerAvailableSkills` 0x7D8230): 블록이 남은 캐릭터는 1 줄이고 건너뛰고, 처음으로 시전한 캐릭터에 `BLOCK_SKILL_TICK` 10틱 블록을 걸고
  그 패스를 끝낸다 → 한 패스에 전투 전체에서 자동 시전 하나, 같은 캐릭터는 11번째 패스(≈ 2.2 s)에 다시 검사. AUTO 스킬은 자동 조작을 타지 않는다
  (`_DoDefaultCheck` 0x7D61F0: `skillType` MANUAL만) — 스킬 자신의 트리거로 켜진다.
- 기본 전략(`_DefaultTriggerSkill` 0x7D5E10): 스킬 레벨에 **rangeId가 있으면** 그 칸을 캐릭터 방향으로 돌린 상자 안에 선택 가능한 적(지상·공중, `m_findEnemyTargetOptions`
  `targetMotion` 3 = ALL)이 하나라도 있으면, **없으면** 캐릭터가 공격·저지 상태(`isInAttackState || isInCombatState`)이면 그 자리에서 `UseSkill`.
  상자에 사거리 연장은 더하지 않는다(`LitePhysicsUtil.FindTargetsInBox`). 치유 스킬도 rangeId 갈래는 **적**을 센다(같은 옵션). 데이터:
  `tools/build-data.mjs resolveTrigger` — MANUAL + rangeId → `{ rule: 'DEFAULT', customRangeGrid: rangeGrid }`; 엔진 `server/sim/skills.js autoTrigger`·`_autoDefault`,
  `server/sim/battle/lifecycle.js _autoTriggerPass`.
- TAKE_DAMAGE(12): 배치 때 버프 `autochess_trigger_skill[on_take_damage]`(`_OnUnitBorn` 0x7D6B30, 형 12일 때 `AddBuffById`)가 피격 순간 스킬을 켠다
  → 엔진 `onDamaged`가 그 자리에서 시전(패스를 기다리지 않음). 그리고 클라 패스의 점프표(0x7D8B70, 바이너리에서 직접 읽음)는 12를 SEARCH(2)와 같은
  갈래(`_DoDefaultCheck` + `_TrySearchTarget`, 0x7D8AE9)로 보낸다. `_TrySearchTarget`(0x7D6E70)은 스킬이 아니라 캐릭터의 **공격 트리거**를 묻는다:
  `Character.attackTrigger`(대체 공격 `IReplacement` 반영)의 `TargetTrigger.Search(false)`가 참이면 시전, 공격 트리거가 없거나 `NeverTrigger`면
  `rangeToShow`의 `TargetSelector.FindTargets`가 하나라도 찾으면 시전. 그래서 TAKE_DAMAGE 스킬은 피격 **또는** 공격할 적(초기 범위 안·저지 중)이 있으면
  0.2 s 패스에서 켜진다 — 엔진 `autoTrigger`: `hurt || _defaultCondition()`(SEARCH와 같은 조건). 이전(2026-10-11 sim6)은 피격만 [추정]이었다.
  핫픽스(DefinedFix.lua en/zh)에 `AutoChessBattleTrigger` 없음. 결과: 근접 重装은 적을 저지하면 맞기 전에 시전(瑕光·蛇屠箱 S1 등),
  `TRIGGER_DEVIATIONS`(重装 6개 → DEFAULT)와의 차이는 rangeId 상자 쪽뿐이다.
- 전투 시작 배치 블록: `AUTO_OP_COOLDOWN` = 10틱 × 0.2 s = 2 s(`battle.flags.startOpCooldown`). [추정] 클라 `_OnUnitBorn`은 TAKE_DAMAGE 버프만 붙이고
  시작 블록은 코드로 못 찾음 — PRTS 「作战开始时部署的单位将进入冷却」를 블록 길이로 읽음.
- 알려진 결과: 패스가 휘두름 시작 뒤에 오면 그 휘두름은 원래 쿨다운을 그대로 지닌다(`AbilityStandard.CastToTarget`이 휘두름 시작에 타이머를 다시 검) —
  공속 스킬의 첫 몇 타가 느리다. 결정 1(즉발 시전)의 `cast` 모드(replace/state/free)는 「즉발 스킬의 시전」 절.
- 근거 기록: 비공개 조사 기록 round2 §7, upstream 0.2.3 대조(스킬 발동). 테스트 `test/sim/skills.test.js`, `test/sim/instant-cast.test.js`, `test/local-patch-diy-chen3.test.js`(첸 S3 3-12 공중).
- **되돌리기(옛 잠정 규칙, 2026-10-07 관리자 결정 — 미확정이었음)**: 스킬로 공격 범위가 넓어지는 오퍼레이터는 넓어진 실행 범위 안의 적으로 매 틱 발동
  (`resolveTrigger`가 MANUAL 기본 전략·SEARCH 행 중 실행 범위가 자기 범위를 엄격히 포함하면 `ACTIVE_RANGE` + 실행 범위 grid, MANUAL + 자기 技能范围면
  `SKILL_RANGE`; 나머지 DEFAULT = `onAboutToAttack` 「다음 공격 직전」), 자동 조작 간격 `AUTO_OP_COOLDOWN` 3 s(PRTS 「自动操作具有3s冷却」, `opReadyAt`),
  틱당 시전 수 제한 없음, TAKE_DAMAGE는 피격 즉시. 되돌리려면 `tools/build-data.mjs resolveTrigger`(ACTIVE_RANGE·SKILL_RANGE 부여, `activeAttackGrid`·
  `strictlyContains`), `server/sim/skills.js`(`autoOp`이면 tick/onAboutToAttack 시전 안 함 → 되살림, `blockTicks` → `opReadyAt`), `battle/lifecycle.js _autoTriggerPass`
  삭제, `constants.js AUTO_OP_COOLDOWN` 3. 엔진 규칙 `ACTIVE_RANGE`·`SKILL_RANGE`는 키트용으로 남아 있다(Touch `content/tokens.js` 등).

## upstream 0.2.1·0.2.2 이식 (2026-10-09, 관리자 결정)
upstream v0.2.0 이후 수정 가운데 고른 것(비공개 비교 기록). 근거는 각 upstream 커밋(과 그 커밋이 인용한 PRTS 비고)이다. golden은 바뀐 커밋마다 다시 만들었고,
우리 corpus는 upstream과 달라 이동한 시나리오 이름이 다를 수 있다(해당 규칙이 나오는 판인지 확인함).

### detmath · 잠재(潜能)·练度
- **detmath** (`bf4f2399` ← upstream `ae22335c`, PR #373): `server/sim/detmath.js`(hypot·powi·sin·cos·atan2, fdlibm)로 전투 수학을
  엔진에 무관하게 — 서버(Node)·Chrome·Firefox·Safari 클라이언트가 같은 결과. eslint가 `server/sim/**`에서 근사 `Math.*`·`**`를 막는다.
  우리 키트 손 수정: 望 hypot·powi(이동 속도 중첩), 丰川祥子 atan2·sin·cos·hypot, 维什戴尔 hypot, 赤刃明霄陈 hypot. golden 변화 없음.
- **잠재·练度** (upstream #252 → 0.2.2 R22-LOADOUT): 오퍼레이터마다 플레이어가 潜能 1–6·练度 0–3을 정한다(브라우저 저장·「干员调配」 표는 UI 쪽 이식).
  설정 없음·봇 = **潜能 6, 练度 3(精英2 Lv.60 = 공·방·HP ×1.1)**.
  - `2b89cd8e` ← `806a0477`: build-data가 character_table `potentialRanks`의 능력치 단계(코스트·재배치·공·HP·방·저항·공속)를 더하고
    재능 후보를 requiredPotentialRank 5까지 고른다(만잠). 근거: upstream 대회 영상 刺玫 ATK 435 / 코스트 15.
  - `0ba0c20c` ← `7e09c63d`: data가 낮은 潜能을 `potDown`·사슬 재능(`potMin`/`potBelow`)으로 함께 싣는다(`shared/potential.js`). 주석을 뺀 데이터는 직전과 같음(확인).
  - `16dc67a2` ← `ec0a2fc6`: 전투 입력의 `potential`·`cultivate` → 그 潜能의 기록, 练度는 ×ATK/×DEF/×최대 HP를 **따로 곱한다**
    (PRTS 盟约记录 「…与自持有干员的属性加成独立」; 공식 activity_table cultivateEffectList / effects CHAR_MAP aceffect_char_1…4).
    대역(补位)·소환물은 안 받음(소환물 [ASSUMED], upstream 그대로). 望 키트 `stoneLimits`가 棋子 변형을 그녀의 潜能으로 맞춤(우리 키트만 손).
  - `48399a17` ← `96d9441f`: `room.loadout`의 `ops`, 좌석·PlayerState·battleInput·정찰 UnitInfo. 공식 근거: 调度手册 「卫戍协议中干员潜能由自身已持有干员潜能决定」.
    golden: roster·bonds·fields·matches·diy 전부 이동(806a0477의 만잠 + 练度 ×1.1), 대역 10개는 그대로.
  - 이식 때 우리 쪽에 맞춘 것: upstream 테스트의 凯尔希·Mon3tr·원형(原型) 선발 → 우리 다섯 명(望·赤刃明霄陈·阿斯卡纶), 선발 폼 수 256 → 58.
    望은 기본 潜能에서 棋子 7(모듈 8) — 정비·디버그·실제 경기 경로 테스트가 돌 7개를 놓는다(`diy.md` 望 절).
    维什戴尔 폭발 스모크 테스트는 15 % 판정이 운이었다(만잠 ATK로 시드 5에서 안 나옴) → 튼튼한 더미 + 판정 고정.
  - 한국어: 잠재 단계가 붙은 모듈 재능 4줄(공식 KR 템플릿 없음)을 `public/i18n/ko/manual.json`에 추가(잠재 0 줄은 낮은 潜能용으로 그대로).
- **#400** (`33bc22f2` ← `66297106`): 이그제큐터 디 엑스 포에데레 REA-Y 특성 문구 「HP 12 회복」 → 50(전투는 원래 50). 데이터 문구만.

### 联防 전장 · 보스 포털 · 失衡 · 정수 프레임
upstream 순서(联防 → 포털 → 失衡 → 정수 프레임)로 이식했다 — 뒤 커밋의 문맥이 앞 커밋을 전제해서.
- **联防 = 그 라운드 전장** (`f5293092` ← `75202776`, GitHub #244, upstream 주인 결정 2026-10-07 「官服保留地形，改回去」): 0.2.0의
  escaped 템플릿 맵은 모든 웨이브 템플릿 레벨이 같은 칸을 갖는 빈 길(자리표시 격자)이었다. `unitePhase.js _uniteOpts`가 `this.stageId`,
  `unite.js uniteStageId` 삭제, `data/stages.json`의 `kind: 'unite'` 두 레코드는 남음(아무 필드도 안 씀). 실제 경기 경로
  `test/match/feedback5-unite-map.test.js`: 필드 meta·리커의 spec·`publicView()` 모두 경기 stageId.
  → 우리 `187ec1bf`(联防 sceneId 우회, `render.md` 「联防 화면」)는 이로써 실행되지 않는 코드가 되어 `640ddd93`에서 걷어냈다
  (upstream `game.js` 부분 포함).
- **보스 필드 포털** (`5d8180f2` ← `a87cc1e9`, `47b73f1a` ← `1205336a`, GitHub #336 / PR #337, 공식 녹화): 경로가 모서리 포털 입구([1,3]/[1,17])에서
  끝나면 누수가 아니라 가장 먼 출구 [5,10]으로 나와 그쪽 파란 문까지 걸어가 누수. 포털 안 3초는 [ASSUMED](데이터 명시 통과 95개 중 85개가 3초).
  APPEAR 없는 통과 4개(h07_02 #4, h08_02 #5/#9, act2 h07_05 #6)에 출구 APPEAR를 넣던 보정(`simdata.js portalAppear`)은 2026-10-11 관리자 결정으로 뺐다
  (아래 「관리자 결정 2026-10-11」 보스 포털). 짝짓기(입구→가장 먼 출구)는 [ASSUMED].
- **失衡** (`6824d528` ← `cdf2bd5c`, `36470218` ← `1db84d79`, PR #392 아이디어; PRTS 失衡位移机制·失衡免疫·推力-位移近似对应表·推与拉·特殊机制 静态刚体):
  밀린 적은 受力等级별 位移时间(−2 0.2 s … 3 35/30 s), 당긴 적은 1 s(−2 이하 0.5 s) 동안 걷지 않고(恐惧·诱导 포함) 평타를 시작하지 않으며
  스킬·순간이동·스크립트 이동도 멈춘다. 静态刚体는 밀기 0.1 s·당기기 그 창 전체, 이동 0. 浮空·重生·逐火 余烬·경로 APPEAR가 끝낸다.
  弧光锋卫 출혈은 失衡 동안 0.066 s마다 400. 기절이 아님(상태 없음, SP·쿨다운 흐름). 벽에 막힌 밀기는 막힌 곳에서 끝남(아래 「盟约·특질·장비·생성기 2라운드」 失衡 항목,
  최소 0.1 s). [ASSUMED]: 적 능력의 전역 잠금 범위. `_unbalance`의 `_cutAttackStand`(upstream 문맥, `8a64edc9`)는
  `511b9db6`에서 다시 넣음. 클라이언트 슬라이드는 displace fx의 `dur`(`f989dc29`, `render.md` 「upstream 0.2.1·0.2.2 이식 — 렌더」).
- **정수 프레임** (`7813ef43` ← `227ab9e7` + `6de5dec3`, PR #402; PRTS 作战机制/sandbox 「帧对齐机制对攻速的影响」 1프레임 = 1/30 s):
  `ai.js attackCountdown`(0에서 1e-9 이내 = 0) — 오퍼레이터·적 공격 간격, 双眼皮 포탑, 寒檀 S2 고드름; `SkillRuntime.gainSp`가 코스트에서
  1e-9 이내면 충전. 1 s = 30프레임(전엔 31). 정수가 아닌 간격은 여전히 ⌈30 × t⌉(공식 四舍五入과 다른 옛 차이, 그대로).
  golden 전 가족 이동: solo-ABYSS-1 패배(13R) → 승리(LP 5), coop3-ABYSS-5 한 라운드 일찍 탈락.

### 오퍼레이터·엔진 규칙
커밋마다 하나(#298 두 커밋만 하나로).
- 키트: 耀骑士临光 卡西米尔 재배치 감소 5 % 하한 없음 `28ad2980` ← `f14b3a06`(#370) · 信仰搅拌机 S1 보충 = 마지막 배치 `a2fa6e82` ← `7e8b435f`(#325) ·
  歌蕾蒂娅 S3 捕网 반경 1 `4c7eed16` ← `b2510524`(#324) · 异客 S3 雷暴 x-1 마름모 `ea08c23a` ← `a0cd6826`(#322) · 伊内丝 S3 突袭 착지 후 재발동
  `4b739035` ← `6d6fbe92` · 凋亡이 저장 충전 SP도 깎음 `54692ccd` ← `c225559d`(PR #262) · 引星棘刺 S1/S2 회복 = 생명 회복 속도 `a753baa7` ← `42caca3b`,
  DEF 중첩 `95dea8a0` ← `1a67ecc3`, 동률 = 마지막 배치 `e8cc138c` ← `03688c82`(#388; 사이의 白铁 `69d791f9` 줄은 안 받음) · 공격 없는 즉발 스킬은
  공격 간격마다 한 번 `a71bb1e8` ← `4128965a` + `db29acf9`(#298 — 2026-10-11 관리자 결정으로 클라 스킬 클래스대로 바뀜: 아래 「즉발 스킬의 시전」) · 外勤医疗 Touch ACTIVE_RANGE
  `a254e00e` ← `c623550f`(sim만, 카드 UI는 UI 쪽 이식; 「스킬 범위 발동」은 당시 미확정 — 2026-10-11 확정) · 香槟炸弹 은신·수면 적에 안 터짐 `c59e05a7` ← `e733171b`
  (손 이식, `5f98baec` 무적·禁疗은 그때 안 받음 — 관리자 결정, 2026-10-11에 뒤집혀 받음: 아래 「upstream 0.2.3 이식」).
- 望 跟子: `d0031e33` ← `5a045731` 중 跟子 칸 배치 부분만(관리자 결정) — `diy.md` 「跟子 칸에 배치하면 그 跟子가 사라진다」. 전투 시작 跟子는 안 받음(관리자 결정 — 2026-10-11에 뒤집힘: 클라대로 전투 시작에도 붙음, `diy.md` 「되돌리기」), 나머지 하나는 이미 PRTS대로.
- 엔진: 同名效果取最高 3개 이상 `f17d705c` ← `3356b340`(#342; upstream content 테스트는 우리에게 없는 선발 3명이라 버림, sim 단위 테스트가 대신) ·
  帝国炮火先兆者 포탄 3×3 `4e463805` ← `895653fc`(#364, **[ASSUMED]** 충돌 반경 0.25 더함) · 假想敌：骨刺 대상 `e55366ad` ← `c250ff66`(#365 —
  우리 `NO_AIR_KEYS`의 acbunn은 뺌) · 碎铳之簧 5초 추적 `81bbc3c1` ← `f2aec39e`(PR #347, `unbalancedNow` 조건 유지) · 战场#08 보스 경로
  `13e12ca7` ← `8d896e40`(#375, 보스 경로 미리보기도 따라감) · 大帝 加急调派 무한 `9ecabb80` ← `ca671f2f`(#328) · 不可对空 효과가 炎佑에 안 닿음
  `0561223d` ← `977215e1`(위 「적 비행 유닛 공격 전수 조사」 표 밖의 다섯 효과: 죽음 폭발·水遁忍者 漩涡·鼎沸·祈祷邀约·胄 칼날 — 갑주 칼날은
  `NO_AIR_KEYS`에서 뺌, 골극과 함께 따로 커밋) · 刷新时 특질 시점 `ea8f8790` ← `ce2bd75b` · 속사 저격수 비행 우선 `d2522a11` ← `4bd154e3`(#205, 관리자 결정,
  `upstream.md` 「일부러 안 가져온 것」 줄 고침) · 频次 器物·보스 소환물에 라운드 적 효과 `b27cebc2` ← `e33ee3db`(PR #272, 반올림은 2026-10-10 올림으로 바뀜 — 아래 「卫戍协议 버프 그래프」,
  `data/config.json`은 build-data로 재생성 — supplyHp 키만; golden roster 36·bonds 1·fields 11·matches 15).
- 안 받음(관리자 결정): `5f98baec`(香槟炸弹 무적 — 2026-10-11 관리자 결정으로 받음, 「upstream 0.2.3 이식」) · `38d4c3e4`(余 文火慢炖 층 없는 맹약 — PRTS 「仍然对其生效」대로) · `5a50f7b5`(REA-Y 공속 엔진화, 보류).

### 기습 · 아이템 · 진행 · 서버 도구
커밋마다 하나.
- 기습(突袭 맹약): 양쪽 절반이 다 찬 필드(2인 연합방어·최종 공세/숨겨진 핵심 2인 필드)에서는 팀원 절반에도 착지 `9bcdc98d` ← `cfd3c672`
  (`Battle.onFieldBoard`, upstream 주인 결정 2026-10-07 — 2026-10-10 클라 코드로 확인·일부 바뀜, 아래 「卫戍协议 버프 그래프」; 혼자인 연합방어의 빈 절반·솔로 보스 필드의 다른 절반·손패/임시 정비
  구역 줄은 그대로 막힘; 울피아누스 S3 【移动】은 `onOwnBoard` 유지. upstream의 0.2.1 설계 절(§26.1)·`docs/history/0.2.1.md`는 우리에게 없어 주석은 이 절을 가리킴) ·
  은신(隐匿) 지상 적에게도 점프, 사거리 안 은신 지상 적은 「范围内没有敌人」을 깸 `350de2c0` ← `48a2d37e`(GitHub #316, upstream 주인의 공식 게임 관찰
  2026-10-08 — 은신 쪽은 2026-10-10 클라 코드로 확인, 「사거리 안」은 공식 「자기 칸+앞 칸」으로 바뀜). 관리자 결정 2026-10-09(두 가지 모두 받음).
- 소모 아이템도 교체 창 `4976cf69` ← `8cef750e`(GitHub #263, 관리자 결정 2026-10-09): PRTS 卫戍协议/帮助 §装备 「达到上限强行佩戴会改为替换装备：指定一件已佩戴装备
  替换为将要佩戴的装备，并销毁被指定的装备」 — 装备时销毁 예외 없음. 고른 장비(없으면 가장 오래된 것)를 효과 전에 떼고, 효과가 통하면 파괴, 거부되면(정예에 박사
  투영) 되돌림. 우리 `7cf09006`(일반 박사 투영만)을 대체 — `upstream.md`의 그 줄에 「대체됨」. 금빛 박사 투영도 꽉 찬 일반 오퍼레이터에는 이제 창을 띄움.
- 두루마리(画卷) `36738089` ← `19c7b268`(#389) · `6cefc0f1` ← `ac423184`(PRTS 画卷 备注 「获得的装备为未装备状态」) · 소환사 판매 칸 `539f7cd7` ← `d07d97dc`
  (PR #309) · 아무것도 못 준 소모 아이템 알림 `7deda2c5` ← `8c763097`(#401, ko 2줄 `ko/ui.json`).
- 윗줄 캡슐 = 공식 「처치+누수 / 예정 수」 `d9ab4e92` ← `b4bc89ad`(PR #308; 분열·소환·보스 소환은 분자·분모 밖이나 LP·완벽 작전에는 그대로; golden은 total
  열·snaps만, 결과 동일) · 연합방어/보스 2인 필드는 필드 자체 resolved `ea192a77` ← `1a880699`.
- 도베르만(전략) 교편(教鞭) 공식 3택 — **서버만** `5bcc4ccd` ← `56a7b918`(act2autochess choice_event hunter_band_1 PERSONAL_CHOOSE, PRTS 「于3个战术特训的
  悬赏任务中选择一项」); 클라이언트·문구는 UI 쪽 이식(`ui.md`). 최종 공세·숨겨진 핵심에서 전술 특훈 완벽 보상 `0f8995f7` ← `05eb2b80`(조건 **[ASSUMED]**: 승리·실제 결과·
  자기 필드 누수 0) · 그 지급을 b.progress `leaksBy`와 대조 `b73b9f91` ← `66a228c6` · 봇이 사거리 0 중장을 길 칸에 먼저 `7b398771` ← `e6321457`(PR #339,
  range_table 「0-1」 = (0,0) 한 칸).
- 서버·도구: 빌드 태그에 server/sim·shared·data `53379078` ← `8597b66d` · b.start를 sim 로드 전 pending `d1319c71` ← `d84b961c`(우리 진단 `recordError` 줄 유지) ·
  build-data --refresh 실패 시 옛 캐시 안 씀 `fdb7a109` ← `063408e4` · SP_VERIFY 8 ms 조각 `683d7b71` ← `a2a3f524`.

## upstream 0.2.3 이식 (2026-10-11)
upstream v0.2.3과 그 뒤 미병합 PR 가운데, 우리에게도 같은 버그가 있고 공식 근거와 어긋나지 않는 것(비공개 비교 기록 — 클라 디컴파일 대조와 디컴파일
5차 구현과의 중복 점검 포함). 커밋 메시지에 upstream 해시를 적는다. 5차가 이미 고친 것(赤刃明霄陈 S3 공중 발동, 赫德雷 S2 원소 손상, 克莱门莎 전략의
켜진 맹약 조건)과 사용자 결정 대기(전략 차례 50 s 등)는 뺐다.
- **`708caf7d` 중 전투 4건 + 문구** (PRTS 근거, upstream 설계 기록 28.25):
  - 「N번째 공격마다 기절」 적(粉碎攻坚手·码头水手, `archetypes.js nthAttackStatus`)이 그 타격으로 쓰러져 곧바로 다시 배치된 오퍼레이터(不屈·M3茧甲)에는 기절을 걸지 않는다 —
    `ai.js enemyAttack`이 `attack` 훅에 `targetDeployments`(타격 순간의 `deploySeq`)를 넘김.
  - 음유시인 지속 회복(`professions.js installBard`, 浊心斯卡蒂 키트의 특성 전환)은 기절 중에도 계속된다(오라). 클라 근거: 회복은 프리팹 능력
    `AuraAbility`가 붙이는 버프이고, `Entity.OnTick`·`AuraAbility.OnTick`에 기절 검사가 없다(비공개 디컴파일 기록, 가상 호출 2개는 이름 미확인).
  - 黄沙罗盘(+萨尔贡浓茶)의 SP는 阻回(`noSp`)와 지속 스킬 중 잠금을 무시한다 — `skills.js gainSp(…, { ignoreLock })`. 클라: 템플릿
    `act1autochess_acarm103_buff`의 `ModifySp` 셋 모두 `_forceFlag` → `SpController`가 `spRecoverStopped` 검사를 건너뜀. `init_sp`는 원래 `'init'`이라 같음.
  - 가상적 铳 【未尽的告解】: 다른 铳이나 碎铳之簧 중 하나라도 있으면 감쇠, 없으면 바로 해제, 피격 때도 다시 판정(첫 타격·동료가 사라진 직후).
  - 렌더러를 못 불러온 토스트: 「기기가 3D 불가」 → 「잠시 못 불러옴, 새로고침」(en·ja·zh-TW·ko).
  - golden: `fields` boss-boss_4-solo(음유시인 회복이 기절 중에도). 테스트 `test/content/community-round26.test.js`(upstream), `enemies_bosses` 铳 감쇠.
- **蕾缪安 수배** (`85b694f2`, GitHub #428, PRTS): 수배 타이머는 이 오퍼레이터마다(출처별) 따로 돌고, 처음 셀 때만 선택 가능해야 하며, 붙은 뒤에는 이어서
  라테란 범위 안에 있는지만 본다. 그녀가 퇴각·쓰러지면 그녀의 타이머·표식만 지운다. 수배 칸은 공격 범위(엔진 추가 사거리)와 함께 스킬 발동 범위
  (`addTriggerRange`)에도 들어간다. 스킬 자동 발동(위 절)은 초기 사거리만 보므로, 이 줄이 없으면 수배 대상만 있을 때 공격 중이어도 스킬이 켜지지 않는다.
  upstream이 뒤에 붙인 `attackOnly`(다음 평타 때만 확인, `f3658a0d`)는 공식 「0.2 s마다 곧바로」와 반대라 받지 않았다.
  golden: roster 016·018·035·036·045, fields boss_1·5·7-pair·hidden-boss_9-pair(모두 蕾缪安이 있는 판). 테스트 `test/content/lemuen-wanted-023.test.js`(upstream).
- **远牙가 준 특질의 傀儡师 몸 바꿈** (`3f19b598`, GitHub #415·#429, 플레이어 확인): 远牙가 준 `garrison_108_a/b`는 傀儡师가 <替身>으로 바뀔 때·<本体>로
  돌아올 때(`dollSwap`)도 층을 얻는다(부여량·배치당 상한·켜진 맹약 확인은 그대로). **[추정 — 미확인]** 비공개 디컴파일 기록: 공식에는 「远牙가 준 것만」이라는
  구분이 없고, 배치 때 발동하는 특질 템플릿 `act2autochess_gar_event_onstart`(ON_BUFF_START)는 몸 바꿈 때 버프가 다시 시작되면 다른 배치 때 특질(106·107·124·143·155)도
  다시 발동할 수 있다. 버프 재시작 여부는 C#에서 못 읽어 upstream 범위대로 둠. golden 변화 없음. 테스트 `test/content/fartooth-doll-swap.test.js`(upstream).
- **塞雷娅 S1 急救는 적이 없어도** (`e86c7c83`, GitHub #406, PRTS): 스킬 범위의 HP ≤ 절반 아군이 있으면 적이 없어도 그녀의 공격 간격에 시전하고 그 공격이 치료가 된다
  (`ai.js updateAlly`가 대상이 없을 때 `trigger.allies` 스킬을 먼저 시도, `skills.js onAboutToAttack`은 아군 규칙이면 적 조건을 보지 않음). 침묵·무장해제·공격 간격은 그대로.
  클라: AUTO 스킬이라 모드 자동 발동을 타지 않고 `NextAttackOrCombatSkill`이 아군만 찾는다(적·공격 상태 조건 없음). 다른 점 하나 **[ASSUMED]**: 공식은 조건이
  맞는 순간 SP를 쓰고 우리는 공격 때 시전한다(치료는 같고 SP 시점이 공격 한 번 안쪽으로 다름). upstream의 黍·凯尔希·思衡托 부분(`triggerEnemies`)은 우리 풀에 없어 뺐다.
  golden 변화 없음. 테스트 `test/content/heal-triggers-023.test.js`(upstream의 塞雷娅 케이스).
- **假想敌：管의 “余音” 펄스 큐** (`f3658a0d` 중 `bosses.js echoHit`): 피격 펄스 ↔ 반격(벤델라 등)이 서로 동기로 불러 훅 깊이 32 제한에 걸리던 것 → 펄스를 쌓아
  지금 펄스 뒤에 FIFO로 처리(치명타가 만든 펄스도 유지, 타이머·난수 추가 없음). **[ASSUMED]** 순서(upstream도 [ASSUMED]). golden: `fields` hidden-boss_10-solo.
  테스트 `test/content/echo-counter-023.test.js`(upstream).
- **浊心斯卡蒂 S1 × 坚守 2단계 되넘김 금지** (upstream PR #464 by @HappyTanuki, 원본 커밋 `e9a2e27c`): 한쪽이 옮긴 피해는 다른 쪽이 다시 옮기지 않는다(전에는 둘이
  서로 넘겨 훅 깊이 제한까지 갈라져 전투가 멈춤). 클라 근거: 두 분담(`DamageSplit` 0xBBE1B0, `AutoChessDamageSplit`)이 옮긴 몫에 `SharedFlag 7 SKIP_MODIFIER_EVENT`를
  붙여 어느 ON_TAKE_DAMAGE 그래프도 다시 보지 않는다. upstream v0.2.4가 손본 판(`6bfc0827`: 분담 효과마다 첫 적용은 허용, 몫 보존)은 이 점에서 공식과
  달라 원본 PR을 가져왔다. golden 변화 없음. 테스트 `test/content/skadi2-stead-loop.test.js`(PR).
- **밀린 적은 미는 쪽을, 당긴 적은 원래 방향을** (`4980ee78`, GitHub #418·#427을 클라 코드로 고침, 렌더만): upstream은 밀기·당김 모두 「원래 방향 유지」
  (기여자 영상 野鬃 S2·莫斯提马 S3·歌蕾蒂娅 S1/S2)였다. 클라 코드: `Enemy.KnockBack`(0x7248B0)은 changeFaceByDirection이면 `FaceTo(-direction)` — 미는 쪽을
  봄. 밀기 노드 `Nodes.Knockback`(0xC1E850)·`KnockBackWithDirection`은 true, `KnockBackWithCharacterDirection`은 `!_dontChangeFaceByDirection`(기본 false)을
  넘긴다. 당김 `Nodes.DragTowardSource`(0xC16CE0)는 false, 갈고리 `Enemy.BeginPull`/`StillPull`/`EndPull`은 방향을 안 바꾼다. 그래서 `displace` fx의
  `face`: 밀기 'push'(미는 쪽 = 이동 반대, 좌우 성분이 없으면 그대로), 당김 'keep', 그 밖의 직접 이동은 없음(이동 방향). 미끄러지는 동안 스냅숏 속도로
  뒤집지 않는다(`render/units.js slideTo`). upstream 영상은 적이 원래 미는 쪽을 보고 있던 경우라 두 규칙이 같아 보였다. 전에는 밀기·당김 모두 이동 방향을
  봤다(둘 다 공식과 반대). **[ASSUMED]** 薄绿 S2의 안쪽 밀기도 같은 노드(그녀 반대쪽을 봄). golden 변화 없음. 테스트 `test/render/unitview.test.js`·
  `test/sim/displace-fx.test.js`.
- **松果 S2 공격 단계는 배치마다 처음부터** (upstream PR #462 by @Xinglan233, `8ebdcf5d`, PRTS 松果 S2 备注): 단계 카운터를 `unit.mem.pinecnS2Uses`로 따로 두고
  배치 때 0으로(엔진 `activations`는 누적 그대로). 클라: 카운터 `PassiveOneOfBuffAbility.m_attachCnt`가 `DoSetData`에서 0이 된다(재배치 때 다시 불리는지는
  추적 안 함, 비공개 디컴파일 기록). golden 변화 없음. 테스트 `test/content/kits_pinecn.test.js`(PR).
- **家族徽章 + 叙拉古正装: 은신이 풀린 직후 첫 타** (upstream PR #461 by @Xinglan233, `a173a470`): 은신 해제를 0.25 s 성장 주기가 아니라 피해 순간에 읽는다.
  전에는 해제 직후 첫 타가 다음 주기 전에 들어가면 추가 진피해가 빠졌다. 연속 타격이 같은 처리에 다시 들어오기 전에 보너스를 먼저 소모한다.
  golden 변화 없음. 테스트 `test/content/family-crest-timing.test.js`(PR), `items.test.js`.
- **深池逐火 余烬/火灰: 막힌 채 쓰러져도 새 余烬은 은신으로 시작** (upstream PR #465 by @CXUtk, `78032541`): 전사의 저지를 먼저 풀고 余烬의 은신 버프를
  붙인다(`archetypes.js husk`). 전에는 반대 순서라 그 저지 끝이 새 은신을 3 s 꺼서, 막아 주던 오퍼레이터가 다음 적을 잡아도 원거리·스플래시가 余烬을
  약 2 s 칠 수 있었다(0.1.2 §22.8의 **[ASSUMED]** 순서, 「죽지 않는 은신 적」 제보 대응). 클라 근거(EN 클라, 레포에는 이름만):
  `Enemy.DoFakeDeath`(0x721DC0)가 `Enemy.ReleaseFromBlocker`(→ `Character.RemoveBlockee`)를 먼저 부르고, `Enemy.States.RebornState`는 그동안
  BLOCK_FREE·INVINCIBLE·UNBALANCE_IMMUNE(마스크 0x128)을 준다. 余烬 모드(`enemy_1288_duskls` 프리팹 `Modes/Prop`)는 재생이 끝날 때 `Unit.DoReborn` →
  `SwitchMode`로 켜지고, 거기 달린 재능 `Invisible`(`ToggleablePassiveBuffAbility` + `AdvancedCompoundToggleChecker`: `_isInitToggled` 1,
  `_disableWhenBlocked` 1, `_restoreDelay` 3, `_disableDuringReborn` 0, 버프 `common_t_invisible` = INVISIBLE)이 붙는 순간 켜진다. 막혀 있으면 매 틱
  끄고 풀린 뒤 3 s에 다시 켠다. 그래서 전사의 옛 저지는 새 은신에 창을 열지 못하고, 余烬 자신의 저지만 3 s 창을 연다. 이어서 余烬의 `BornAnim`(Start)
  버프가 무적·저지 불가·失衡 면역을 주고, 그것이 끝나면 빈 자리가 있는 저지 오퍼레이터가 다시 막아 보이게 된다. 사용자 기억(「저지된 채 쓰러지면 아주
  잠깐 은신되었다가 다시 보였다」 = 은신으로 시작 → 같은 오퍼레이터가 다시 막음)과 맞는다. 0.1.1 제보(아무도 못 치는 余烬)는 돌아오지 않는다: 余烬은 걷고
  막을 수 있으며, 막히면 보이고 죽는다. 공식에서도 余烬을 잡는 방법은 빈 저지 자리·반은신(反隐)·많은 타격이다.
  남은 차이 **[미확인]**: 공식은 「재생(RebornState) 시간 → 余烬 모드 + Start」 두 단계로 보이는데 우리는 1 s 하나(`HUSK_REBIRTH`)이고, 재생 중에도
  은신 표시가 켜져 있다(공식은 그때 아직 전사 모드라 불투명). RebornData의 시간 값은 못 읽었다.
  golden: roster 001·003·025·034·048, bonds bond-maniShip-high, matches solo-ABYSS-1·coop4-FUNNY-6·solo-HARD-9-boosted. 테스트
  `test/sim/ember-initial-stealth.test.js`(PR), `test/sim/feedback2-surtr-stealth.test.js`(PR로 갱신), `test/match/ember-stealth-real.test.js`(실제 대전 경로).
- **香槟炸弹: 무적(HP 손실 없음)·禁疗·아군 선택 제외** (upstream `5f98baec` + PR #476 by @Siornya, v0.2.4 `6bfc0827`이 받은 판; **관리자 결정 2026-10-11**
  「무적도 넣고 적용」 — 2026-10-09 「공식대로 HP 손실·禁疗 있음」 결정을 뒤집음): `tokens.js champagneHold`를 토큰 키트와 琳琅诗怀雅 자신의 폭탄(`chess_char_3_04-swire2.js`)
  둘 다 건다. 禁疗(치료가 안 닿고 치료사가 안 고름), 모든 피해 취소(活性源石 틱·원소 피해 포함) + 流失는 쓰러짐 판정 전에 되돌림 → HP 때문에 사라지지 않고
  「见面礼」을 쓸 때만 사라짐. 무적 깃발은 안 씀(배지가 뜨므로 — upstream 그대로). 그리고 내부 `isolated` 깃발로 아군 선택(`Battle.allySelectable`: 安洁莉娜 오라,
  浊心斯卡蒂 鼓舞, 치료)에서 빠진다 — PRTS 香槟炸弹 「装置」. 일반 禁疗 소환물은 그대로 선택된다. PR #476 원본과 v0.2.4 판은 코드가 같고(깃발 한 개),
  v0.2.4는 테스트를 더함 → v0.2.4 테스트를 가져옴. PR의 원래 스킨 모델 부분(`7ecc80d5`)은 범위 밖(우리는 로컬 클라 추출).
  **공식과 다른 점**: PRTS는 HP 1000에 「即使自身生命值未满，模型下方也不会显示生命值槽」 — 공식은 HP를 잃을 수 있다(upstream의 일부러 다른 결정을 관리자가 받음).
  装置 분류의 클라 근거는 반쯤: 卫戍协议 아군 대상 노드는 보통 `targetCategory "NONE,DEFAULT"`이고 엔진 `EntityCategory`는 DEFAULT 1 / TRAP_OR_ITEM 2이다.
  폭탄 전투 프리팹의 category 값은 못 봄(비공개 디컴파일 기록 — **[추정]** TRAP_OR_ITEM).
  sim-3 이식 「은신·수면 적 위에서 안 터짐」(`CHAMPAGNE_TRIGGER`)은 그대로다(`test/content/feedback7-champagne-stealth.test.js` 통과).
  golden: bonds bond-yanShip-high(活性源石 위 폭탄에 치료사가 치료를 쓰던 판). 테스트 `test/content/feedback7-champagne-hold.test.js`(upstream v0.2.4 판 + 실제 대전 경로 1건).
- **외근 의료(外勤医疗, 전략)의 맵 캐릭터는 어그로 순서가 오퍼레이터보다 앞** (upstream PR #451 by @YinqiMargatroid, `3b57f727`): 예비 오퍼레이터-메딕(预备干员-医疗)
  또는 Touch(정예 2명 이상)는 우리 sim에서 `battleStart` 때(정예 수를 센 뒤) 만들어지지만 `aggroSeq`를 맨 앞(−1)으로 둔다(`Battle.spawnToken preBattleAggro`,
  `tokens.js spawnMapChar`, `bands/battle.js installMapChars`) → 같은 도발 단계면 적이 오퍼레이터를 먼저 고른다. 배치 이벤트·`deploySeq`는 그대로.
  upstream v0.2.4는 표시 부분만 받고 「어그로 순서는 그대로」였다 — 사용자 결정 D10으로 PR 원본을 받음. 클라 근거(EN 클라, 레포에는 이름만): 이 둘은 레벨
  predefine이고 `BattleController._CreatePredefinedCharacter` → `Character.BuildAsPredefined` → `Character._BuildAtInternal`(0x700A50)이 `m_createdTime =
  fixedPlayTime`을 찍은 뒤 `Character.UpdateHatred`(0x6FEFA0, 아군 위협도 = 생성 시각 기반 + 도발 단계)를 부른다. predefine은 레벨을 불러올 때
  (`_LoadPredefinedData`) 지어지고 오퍼레이터는 그 뒤 자동 배치로 들어오므로 생성 시각이 앞 = 위협도가 낮음 = 나중에 맞음. **[추정]** Touch 교체본이 언제
  지어지는지(`auto_chess_change_map`이 불러올 predefine 목록을 바꾸는지)는 추적 못 함 — 정확한 순위는 [ASSUMED]. 공용 필드에서 두 플레이어의 맵 캐릭터끼리는 동률.
  golden 변화 없음. 테스트 `test/content/bands.test.js`(PR: 두 변형의 우선순위, “萨米的意志” 冰凌 선택), `test/match/touch-aggro-real.test.js`(실제 대전 경로).
  표시 부분은 `render.md` 「upstream 0.2.3 이식 — 렌더」.

### 관리자 결정 2026-10-11 (D1 공식 데이터 갱신 · D2 전략 차례 50 s · D8 공용 카드 풀)
- **공식 표 갱신 + 乌尔比安 모듈 「前路」 CRU-Y** (upstream `2e122873`의 乌尔比安 키트 부분, 손 이식): `node tools/build-data.mjs --refresh`로 zh_CN 표를
  2026-10-05 판에서 2026-10-11 판(Kengxxiao/ArknightsGameData master)으로 바꿨다. `data/*.json`에서 바뀐 것은 `chess_char_5_05_b` 모듈 `uniequip_003_ulpia`와
  그 모듈의 从不混淆的方向(소환물) 변형뿐이다. battle_equip_table: 단계 1 = 최대 HP +360·공격력 +100, 특성 `damage_scale` 1.1(「对被阻挡的敌人伤害提升至110%」).
  키트: 그의 모든 피해(스킬·닻 포함)가 **어느 아군에게든** 저지된 적에게 ×1.1(`hit` 훅 `dmg.mul`). 단계 2·3의 재능 변경(다른 深海猎人의 처치도 층,
  9층에서 저지 +1, `add_block_cnt_stack_cnt`·`block_cnt`)도 키트에 넣었지만, 모드의 5단계 정예는 모듈 단계 1이라 재능 판이 그대로여서 작동하지 않는다
  (upstream과 같음). 클레멘티아(오퍼레이터)는 `LOCAL_DIY_PICKS`에 없어 `data/backups.json`에 들어가지 않았다(선발 추가는 관리자 결정 대기).
  표의 다른 변화(새 오퍼레이터·적·이벤트, 阿兰娜 재배치 80→70, 行箸 특성 문구, `sortIndex`·`sortId`)는 우리 데이터에 닿지 않는다. 모듈 이름 한국어는
  KR 클라에 아직 없어 우리 번역 「'앞길'」(`public/i18n/ko/data.json`), 모듈 아이콘 `cru-y`는 `data/assets.json`에 추가.
  golden: roster-019(로스터 변형 순서상 그 판의 乌尔比安이 CRU-Y)·roster-038(같은 오퍼레이터의 모듈 변형이 한 칸씩 밀림) — upstream과 같은 두 사례.
  테스트 `test/content/ulpia-cruy-023.test.js`.
- **협동 전략(분대장) 선택 차례 30 s → 50 s** (upstream `708caf7d`의 `common.js`·`build-data` 부분): `BAND_TURN_SECONDS` 50 = `data/config.json timers.bandTurn`.
  근거: upstream 관리자의 공식 협동 플레이 보고(2026-10-10, upstream 설계 기록 28.25) — 차례마다 50 s. 클라 근거는 간접: 차례 마감 시각은 서버 값(stepTs)이라
  클라에 없고, 클라 막대는 표 `autoChessData.enterStepList` `BAND_CHECK` `time` 50 / `hintTime` 15로 그린다(비공개 디컴파일 대조 기록). 그전 30 s는 플레이 제보
  #4로 정한 [ASSUMED]였다. 클라 카운트다운은 서버의 `m.public.draft.turnSeconds`를 쓰고, 그 값이 없을 때의 기본값(`gameLogic/phases.js`·`server/match/gamedata.js`)도 50.
  golden 변화 없음(협동 golden 매치의 차례는 AI 좌석이라 곧바로 고름). 테스트 `test/match/draft.test.js`·`test/ui/bandDraft.test.js`·`test/docs-consistency.test.js`.
- **공용 카드 풀 = 공식 측정 표, 협동 ×2, 拟态物质는 풀이 비어도** (GitHub #430·#485; upstream PR #477 `fa9da2d8`과 v0.2.4 `6bfc0827`의 풀 부분을 비교해 섞음).
  근거: 路标档案馆 「路标月报 #2」(bilibili BV1eLXXBqEgF, 2026-03-29) 표 — 두 upstream 판이 같은 영상, 같은 숫자를 인용. 공식 표(activity_table act2autochess)와
  클라 코드에는 풀 수가 없다(서버 규칙. 클라의 `chessPool`은 자기 분대 설정).
  - 수: 独立模拟(솔로) 12/14/18/16/8/5 + 예외 Ⅰ 普罗旺斯·德克萨斯·跃跃·古米·格雷伊 10, Ⅱ 风丸 8, Ⅱ 赫默·休谟斯·砾·蒂比·调香师 12. 同盟模拟(협동)은 그 ×2(예외 포함,
    인원과 무관, `economy.coopPoolMultiplier` 2). 缪尔赛思 4 예외는 시즌 1 영상(BV1JWy3BkEpt, 2025-11-18)에서 온 것이라 뺐다(이번 시즌 표는 Ⅵ 모두 5).
    예외는 `tools/build-data.mjs`가 이름 → 일반 말 id로 찾는다(이름이 없으면 빌드 실패). 두 판 모두 같음.
  - 선발(自选) 슬롯의 개인 재고: **v0.2.4를 따름** — 협동에서도 8/5(PR은 협동에서 16/10으로 같이 늘림). 영상의 ×2는 공용 풀의 수라는 upstream 관리자의 영상 판독을
    따랐다 **[ASSUMED]**(선발 재고 자체가 원래 [ASSUMED], `diy.md`).
  - 소유는 늘 정해진 수를 차지: 일반 1·정예 3(风丸의 2장 합성 정예도 3), 지급·합성·승급이 재고를 넘어도 다 차지하고(`take(…, { overdraw: true })`) 내부 잔량은 음수가
    될 수 있다. 상점·굴림·`left()`는 0으로 자른다. 그래서 한 장 팔아도 소유가 상한 위면 다시 안 열린다. **v0.2.4를 따름**(영상 2:30–4:00 「소유·특수 지급」, upstream 기록 29.8).
    PR은 이 부분이 없어, 풀이 다 차면 의태 물질이 여전히 아무것도 못 준다(솔로 Ⅵ 정예 3 + 일반 2 = 5).
  - 拟态物质(아이템): 2장 가졌으면 3장째를, 아니면 같은 맹약 오퍼레이터를 **재고와 상관없이** 준다 — 같은 맹약 후보는 남은 장수 가중이 아니라 이 판에 있는(보이고
    금지 아님) 정체 중 균등(`rollChess` `ignoreCounts`), 6단계까지. 「다른 오퍼레이터로 바꾸지 않음」(#207)은 그대로. **v0.2.4를 따름**(영상 ~3:00, #485 제보 주장과 같음).
    후보 정체가 하나도 없을 때만 「같은 맹약 오퍼레이터 없음」 알림. 「풀에 X가 없음」 알림 문구는 쓸 곳이 없어 지웠다(en·ko).
  - 풀 확률 곡선은 그대로(재고 수만 바뀜).
  - **장비 공용 재고 — 관리자 결정 2026-10-11로 받음** (v0.2.4 `6bfc0827`의 장비 부분, 처음 D8 이식에서 뺀 것; GitHub #466). 근거는 같은 영상
    ~1:30(upstream 기록 29.8 표). 재고는 **솔로·협동 같음**(×2 없음): 단계별 4/6/7/8/7/3, 예외 简易通讯机 5 · 蜂鸣器·防暴盾·浓缩嗅盐 6 ·
    寻呼模块·伪装服·拉特兰桥夹 7 · 商业包装方案 2(`economy.itemPoolCopies`·`itemPoolCopiesOverrides`, 이름 → 일반 장비 id는 `tools/build-data.mjs`,
    이름이 없으면 빌드 실패). `pool.js SharedItemPool`이 모든 플레이어의 손·임시 칸·장착 장비를 그때그때 센다(일반 1, 고급 2). 표시는 아무것도 잡지 않음.
    재고가 못 대는 획득은 일어나지 않는다: 상점 장비 칸·장비 굴림(`rollItemId`·choices 장비 풀)·보상 제시·机变 장비 카드 생성에서 빠지고, 구매·보상 선택은
    돈을 쓰기 전에 `SOLD_OUT`, 앞 사람이 재고를 다 쓴 机变 장비 카드는 「库存不足」(재고 부족)로 못 고름(차례 시간 초과·AI·하네스도 건너뜀), 효과 지급은
    「装备库存不足，未获得该装备」 알림 후 없음, 整备는 고급의 두 번째 칸이 없으면 산 장비를 일반으로 두고 충전을 쓰지 않는다(재고 없는 장비는 그대로 고급).
    상업 포장 계획 「한 판 최대 2번」(#466 영상)은 **동시에 2개**로 읽음 — 하나가 소유를 떠나면 세 번째를 살 수 있다(upstream과 같음).
    **[ASSUMED]** 소모·파괴·탈락으로 소유가 끝나면 재고가 풀림(영상은 소유 모형만 보여 줌). 상점 장비가 아닌 효과 전용 장비는 상한 없음. 장비 확률은 그대로(재고는 자격만 거름).
    공식 근거 확인: 공식 표(activity_table act2autochess `trapChessDataDict`·`trapShopChessDatas`·`constData`)에 재고 필드 없음, 클라 코드의 상점 상태
    (`PlayerAutoChessV1Activity.AutoChessGame.Store` — `charGoods`·`trapGoods`가 각 상품의 id·가격만)에도 없음 → 서버 규칙이라 영상이 유일한 근거.
    우리 쪽 차이: upstream에 없는 것 — AI가 재고가 떨어진 상점 장비 칸·보상 장비를 고르지 않음(`bot.js`; 그 전엔 구매 실패로 쇼핑을 멈췄다),
    「库存不足」 띠는 선택 중 띠의 움직이는 막대 없이(`.spcard__busy--soldout`). 테스트 `test/match/shared-stock.test.js`(upstream 그대로),
    `test/match/item-stock-real.test.js`(실제 대전 경로: 협동 2인 商业包装方案, 실제 전투 뒤에도 장착분이 셈, 파괴 뒤 세 번째 구매, 상점 굴림), 재고에 걸린 기존 테스트는
    upstream처럼 채우는 장비를 바꿈(board·feedback1-placement·morph-bonds·scroll-copy-merge·sell-capacity·choices).
    golden: matches 2개만 — coop2-NORMAL-8-serverrun(9라운드 ai_1 판부터, 여전히 승리, 팀 LP 38 → 24), coop4-ABYSS-7(12라운드 ai_2 맹약, 결말 같음).
    대부분의 판은 재고 상한에 닿지 않는다(upstream은 공용 카드 풀과 함께 받아 18판이 모두 움직였다).
  - D1과의 관계: 새 표(10-11)에도 풀 수 필드는 없어 영향 없음.
  golden: matches 18개 전부(솔로 8 — Ⅰ/Ⅱ 예외·缪尔赛思 5 / 협동 10 — ×2). 테스트 `test/match/pool.test.js`(수·overdraw·선발 재고·风丸), `test/content/items.test.js`(拟态物质),
  `test/data.test.js`.

## upstream 0.2.4 이식 (2026-10-11)

upstream v0.2.4(`bc50cac0`)·그 뒤 PR과 새 이슈 중 관리자 결정(2026-10-11)으로 받은 sim 쪽. 영상 근거는 路标档案馆 「路标月报 #2」(bilibili BV1eLXXBqEgF, 2026-03-29).

### 특질이 직접 주는 장비는 공용 장비 재고 밖 (upstream PR #496 `1d1ff3b1`, GitHub #488·#491·#495)
- 회귀: 장비 공용 재고(위 D8 「장비 공용 재고」)가 효과 지급도 모두 `itemPool.canGain`으로 막아, 缪尔赛思(오퍼레이터)의 〈获得时〉 变形同构体(6단계, 재고 3)가
  네 번째부터, '变形者集群'(전략)의 5·10·15라운드 지급도 재고가 차면 「装备库存不足」 알림만 띄우고 안 줬다.
- 근거: 영상 「卡池相关机制」 7번 — 诗怀雅·卡涅利安·耶拉·缪尔赛思가 얻는 장비 수에는 상한이 없다. 공식 표·클라 코드에는 재고가 없다(서버 규칙, 위 D8).
- 동작(PR 그대로): 표의 `SERVER_GAIN_EQUIP` 특질이 주는 장비 — 盟约之币(诗怀雅, 특질 133) · 迅捷作战粮(卡涅利安·蜜蜡, 같은 특질 49) · 谢拉格不融冰(耶拉, 92) ·
  变形同构体(缪尔赛思, 76)와 그 고급 — 를 `GameData.isTraitFixedItem`으로 알아보고, 그 특질의 지급과 같은 장비를 주는 전략 지급
  (`preparation_start_gain_chess_from_round`, 곧 变形者集群)은 재고 검사를 건너뛰고 말에 `noPool`을 달아 재고를 차지하지 않는다(`SharedItemPool.held()`가 건너뜀).
  상점 구매·다른 효과 지급은 같은 장비라도 그대로 재고에 묶인다. 전략의 `requirePool: false`를 장비에 그대로 넘기지 않는 것도 PR 그대로 — 그러면
  马克维茨(전략)의 商业包装方案 세 번째가 풀린다(#466).
- 蜜蜡(오퍼레이터)는 卡涅利安과 같은 특질(`garrison_49`)이라 같이 면제된다. 영상 7번 목록에는 蜜蜡가 없다 — PR은 특질 정체로 정해 넷 + 蜜蜡가 된다 **[ASSUMED]**
  (영상 목록이 卡涅利安만 든 것은 같은 특질의 대표로 읽음).
- **[ASSUMED]**(PR): 면제 장비끼리만 합친 고급이 면제를 이어받고, 산 것과 섞어 합치면 재고를 센다(2칸). 면제 장비의 整备는 두 번째 재고 칸을 기다리지 않는다.
- 풀에서 뽑는 특질(洛洛 91 `SERVER_POOL_EQUIP`, 焰尾 149 `SERVER_POOL_CHAR`)과 R11 상점 이벤트의 盟约之币 칸 등 다른 경로는 그대로 재고에 묶인다(PR 그대로).
- 테스트 `test/match/shared-stock.test.js`(PR의 셋 + 다섯 오퍼레이터가 바닥난 재고에서 각자 장비를 받음). golden 변화 없음.

## 卫戍协议 버프 그래프·클라 코드 맞춤 (2026-10-10, 관리자 결정 「동작 변경 모두 공식이랑 동일하게」)
출처: EN 클라(2026-08) 버프 템플릿 `config/buff_template_holder.ab`의 그래프와 클라 코드(디컴파일, RVA는 EN 판). 핫픽스(DefinedFix.lua en/zh)에 아래 메서드 없음.
- **기습(突袭 `raidShip`)** — 그래프 `act1autochess_bond_eff_raid`(+`[attack]`·`[trig]`·`[skill]`·`[all]`), 착지 노드 `AutoChessRebuildCharacterOnTile.Execute`(0xB4FF20).
  코드 `server/sim/content/bonds/addon/battle.js` 「突袭 relocation」. 뛰는 경우 넷:
  - PASSIVE 스킬 멤버: `[spawn]` 표시가 없으면(아무 점프나 붙임) 범위와 상관없이 → 배치마다 한 번(缄默德克萨斯의 배치 후 스킬은 표에서 PASSIVE).
    `[spawn]`은 durable 버프라 점프 자체(MoveLikeRespawnSelf)에서는 남고, 멤버가 다른 이유로 필드를 떠나면 지움 **[ASSUMED]**(2026-10-06 제보 44 「부활하면 바로 突袭」과 맞춤).
  - MANUAL 스킬: 스킬 준비됨(CheckCharSkillAvailable)·안 켜짐·자기 칸과 앞 칸에 적 없음(`CheckHasEnemyInRange` 0xB8C7F0: `_useAttackRange` false면 범위 `1-1`, 적이면 은신·비행 가리지 않고 셈).
  - AUTO 스킬: 스킬 시작 때 `[spawn]` 없음·저지 중 아님(CheckBlocked = 지금 막는 적 있음 [추정: 노드 이름])이면 0.3초 뒤(그 뒤 0.3초마다, 스킬 동안) 점프.
  - 10초 무공격(`[attack]`): 범위·스킬 조건 없음(범위에 적이 있어도 10초 동안 공격하지 않았으면 뜀 — 커뮤니티 16.1의 「범위에 적이 있으면 안 뜀」을 되돌린 것, 관리자 결정 2026-10-10 「공식대로, 필요하면 나중에 수정」), SP 비율 유지. 착지 후 10초를 다시 셈 **[ASSUMED]**. 스킬 세 경우는 SP 가득(`[spawn]` = `modify_sp[ratio]` sp 1.0, `ModifySp` 0xB80BC0: RoundToInt(maxSp×비율)).
  - 후보: 진영 ENEMY·WALK_ONLY, 고급 옵션 꺼짐(`TargetOptions._VerifyAdvanced` 0x6DEF10가 바로 true) → 은신·잠듦·선택 불가·기절 지상 적 모두 후보, 비행만 빠짐. 순서 `FilterUtil` HATRED_DES, 128명까지:
    `Enemy.get_hatred`(0x731300) = 도발 단계 × 큰 상수 − 남은 경로 → 도발 높은 적, 그다음 가장 앞선 적. 같은 위협도의 순서(우리: 출현 순)는 **[ASSUMED]**. 자기 필드 우선 없음(이전 [ASSUMED] 삭제).
  - 착지 칸: 후보마다 그 적의 칸(거대 적은 몸 칸)에서 `LitePhysicsUtil.FindTilesInBox("1-1", 칸, 멤버 방향의 반대)` — range_table 순서라 **적의 칸 먼저, 그다음 멤버가 볼 때 적 뒤 칸**(멤버가 서면 적이 자기 칸이나 앞 칸). 사거리 검사 없음(GitHub #51 이후의 「사거리로 덮는 칸·저지 칸 우선·가장 가까운 칸·RAID_SEARCH 2·8명」 [ASSUMED] 규칙 삭제). 두 칸 다 못 서면 다음 적, 아무도 없으면 그대로.
    설 수 있는 칸: 전장 칸 + 그 말의 배치 가능 칸(`grid.canStand`, 深水区 아님) + 다른 말·쓰러진 오퍼레이터 없음(`isReservedTile`). 적이 서 있어도 됨(근접은 적 칸에 내려 바로 저지). 자기 칸은 고르지 않음(공식은 제자리 재배치 가능 — 차이 미미).
  - 전장 칸: `AutoChessBattleUtil.IsBattleField` = TileIndexer의 BATTLE_FIELD(`tile_achand` 아닌 모든 칸)를 `AutoChessMapAreaManager.ResetTileIndexer`(0x8334E0)가 상태별로 좁힘 — BATTLE: 왼쪽(자기) 일반 구역, HELP_BATTLE: 여러 명이 도우면(isMultiPlayerHelp) 일반 두 절반·아니면 한쪽, BOSS_BATTLE: 보스 맵 전체.
    그래서 **혼자인 연합방어의 빈 절반은 막힘(확인)**, **솔로 보스 필드의 다른 절반은 열림(바뀜)**, 손패/임시 정비 줄(tile_achand)은 막힘(확인). 우르피안 S3 【移动】은 그대로 `onOwnBoard`.
  - 공격력·최대 HP +(0.25+0.01·층)(`[skill]`, MULTIPLIER = 우리 가산 %)은 **스킬이 켜져 있는 동안 모든 멤버**(점프와 무관, 이전: 점프 뒤 필드를 떠날 때까지). 패시브는 켜진 것으로 봄 **[ASSUMED]**(클라는 `Ability.isAffecting`).
- **频次 器物**(14종) — `PropLikeEnemy.DoApplyModifier`(0x75C4B0): 피해 한 번에 HP 1, 최대 HP는 반올림 없는 고정소수점(`Attributes._CalculateAttributeValue`) → 필요 타수 = **올림**(2×1.08 = 2.16 → 3타; 이전 반올림 [ASSUMED]). `enemies/helpers.js setHits`. 막대는 정수 타수로 그림(공식은 1/2.16 단위 — 표시만 다름). 사망 판정 hp ≤ 0은 엔진 일반 규칙으로 봄. 2라운드 재확인: `Modifier.finalDelta < 0`이면 피해량과 무관하게 `hp −= 1`(FP 1) — 「频次」 여부는 적 프리팹의 `PropLikeEnemy` 컴포넌트.
- **불굴(不屈 `indomShip`)** — `[lowland]` 그래프의 `DicePRD`(`Nodes.DicePRD.Execute` 0xC163B0): C = battle_misc_table `miscConfig.prdBaseProbs[RoundToInt(p×100)]`(101개, 끝을 넘으면 마지막), 마지막 성공 뒤 N번째 굴림은 N×C로 성공, 성공하면 N을 0으로.
  N은 전투 전역 블랙보드 `prd#act1autochess_bond_eff_indom[lowland]` 하나 — 그 전투의 모든 지상 오퍼레이터(두 플레이어 필드면 둘 다)가 함께 씀. `dicePRD` / `prdBase`. 이전: 매번 독립 확률.
- **迅捷(`swiftShip`)** — `act1autochess_bond_eff_swift` ON_SKILL_FINISH: `Dice` 한 번 → 멤버면 +normal_sp → AlwaysNext → 층 ≥ 40이면 +power_sp. 이전 「멤버는 두 번 따로 굴림」 [ASSUMED]를 한 번 굴림으로.
- **坚守(`steadShip`) 반격** — `[ex]` ON_TAKE_DAMAGE 순서가 쿨다운 → `weak[limit]`(취약) → `FixedValueDamage`라 반격 피해 자체가 방금 건 취약(×1.4)을 받음(이전: 피해 뒤 취약).
- 2라운드(아래 「盟约·특질·장비·생성기 2라운드」)에서 炎·萨尔贡·维多利亚·谢拉格·拉特兰·阿戈尔·精准·灵巧·助力·协防, 주둔 이벤트, 乐队, 장비 일부를 대조했다.
  아직 대조 안 함(템플릿 목록은 `autochess_templates_summary.tsv`, 조사 노트): act2 맹약(叙拉古·卡西米尔·奥术·独行·绝技) 그래프, 적 디버프(`act1autochess_debuff_*` 일부), 不屈 3명 SP(`AutochessCreateBuffToSpecifiedChar _filterByMinSp`·`_excludeOwner` — 자기 빼고 SP 가장 낮은 한 명일 수 있음, 미확정).


## 盟约·특질·장비·생성기 2라운드 (2026-10-11, 관리자 결정 「동작 변경 모두 공식이랑 동일하게」)
출처: EN 클라(2026-08) 버프 템플릿 그래프와 클라 코드(디컴파일, RVA는 EN 판; 레포에는 클래스·메서드 이름만). 핫픽스(DefinedFix.lua en/zh)에 아래 클래스 없음.
이때 관리자 결정이 필요했던 세 가지(阿戈尔 吞噬가 팀원 오퍼를 먹는가, 특질 `attrByBond`의 배치 때 고정, 桑葚 미러 판 「가장 오른쪽」)는 관리자 결정 2026-10-11로 정했다(아래 「阿戈尔 吞噬 팀원」·「特质 attrByBond」·「桑葚」).
- **谢拉格 6명 寒风 = 필드당 하나**: 그래프 `act1autochess_bond_eff_kjerag`의 `[env]`는 맵 컨트롤러에 붙는 하나 — `AutoChessAssignBondCharCntToBB(_filterAllSides)`
  = 플레이어별 인원의 최대(0xB49840) ≥ 6이면 `[storm]` 하나, 지속 20 + 0.1 × 층의 층은 `AutoChessAssignBondStackCntToBB(_assignAllPlayerIndex)` = 플레이어별 층의
  최대(0xB49C80). 그래서 공동 필드(联防·보스)에서 둘 다 6명이어도 바람은 25초마다 한 번(이전: 플레이어마다 하나 → 寒冷 두 번 = 冻结), 6명이 아닌 팀원의 층이 더 높으면
  그 층. `bonds/core.js installKjerag`(전투 저장소에 하나), `devices.js kjeragColdWind`. 테스트 `test/content/bonds_core.test.js` 「谢拉格 6 on a shared field」.
- **拉特兰 탄약**: `AmmoSkillCountModifier`(`_modifyMaxCount`·`_addCountUsePercent`) → `CastSkillWithLimitTimes.SetMaxAdditionCountPercent`(0x643030) →
  `_UpdateMaxAdditionCount`(0x644190): 더하는 탄 = `MathUtil.RoundToInt(f32(원래 최대 탄) × f32(Σ비율))`, `FP.Round`(0x54E1D20)는 .5에서 짝수로. 즉 원래 최대 탄 기준·반올림·
  최대 탄에 더함(이전: floor(남은 탄 × (1.05 + 0.015·층))). 8발·10층: +2(이전 +1), 10발·0층: 0.5 → +0. `bonds/core.js lateranoAmmo`.
  모델 안 함: 공식은 층이 바뀔 때마다(`_checkDiffWithOldStoreCnt`) 최대 탄을 다시 정함 — 우리는 스킬 시작 순간의 층.
- **灵巧 오라 = 배치 때 한 번 판정**: 그래프 `act1autochess_bond_eff_skillful` ON_BUFF_START의 `AutoChessFilterCharacterBondIds(_checkTargetInRangeId "x-4")`(0xB4E810:
  `LitePhysicsUtil.FindTilesInBox`로 받는 쪽 칸 둘레 3×3, 칸마다 `AutoChessBattleUtil.GetChessInstByPos`의 말 → 맹약) — 멤버 말이 없으면 버프 끝, 있으면 `x-5`(십자, 자기 칸
  포함)로 `in_normal_range`. ON_BUFF_TRIGGER(층 변화)는 층 ≥ 40이면 공속, 아니면 `in_normal_range`일 때만. 그래서 받는 쪽이 **배치될 때** 판정하고 필드에 있는 동안
  유지 — 멤버가 물러나거나 쓰러지거나 옮겨도 이미 받은 쪽은 그대로, 값은 지금 층. 멤버 말 위치 = 서 있는 칸, 아니면 기다리는 칸(쓰러졌으면 몸 칸, 아니면 집 칸) —
  작전 시작 차례 배치에서 먼저 나온 오퍼도 아직 안 나온 멤버의 말을 봄. 이전: 0.25초마다 다시 계산(쓰러진 멤버만 몸 칸에서 계속, 물러난 멤버는 끔).
  **[추정]**: 물러난(쓰러짐 아닌) 멤버의 말도 집 칸에 있는 것으로 셈; 재배치·기습 착지는 새 배치라 다시 판정, `relocate`(deploy move)는 판정 유지; 받는 쪽은 오퍼레이터만.
  `bonds/addon/battle.js judgeAura`. 테스트 `test/content/bonds_addon.test.js` 「灵巧」.
- **特质 `gar_event_selfkillenemy` 처치 수**: 그래프가 `current_cnt`를 ON_BUFF_START(배치마다)에 0으로 — 재배치하면 처음부터 셈(이전: 전투 내내 이어짐).
  `garrisons/battle.js`(`deploy`, move 제외). 테스트 `garrisons_battle.test.js` 「selfkillenemy」.
- **特质 `respawnTimeByBond`(耀骑士临光 garrison_144)**: EN 템플릿에 이 키가 없고 비슷한 `act1autochess_gar_eff_respawnByBond`(퇴장 때 카드 버프, 층/divide **floor 없음**)만
  있다. CN의 새 템플릿일 수 있어 그대로(floor 단계 + 상시 재배치 배율).
- **炎 9명 炎佑 ATK ×1.5 = 전체 ATK**: `bond_eff_yan[long]`이 ATK FINAL_SCALER(`content/tokens.js spawnYanyou`의 [ASSUMED] 삭제).
- **突袭手雷·催泪瓦斯·战栗维式重锤 = 모든 피해 출력**: `acarm064[core]` ON_OUTPUT_DAMAGE, `acarm058` ON_OUTPUT_MODIFIER `IsDamage` → Dice, `acarm045` ON_OUTPUT_DAMAGE `IsDamage`
  + `CheckBuildableType MELEE` → Dice — 스킬 피해·광역의 각 대상·지속 피해도(이전: 일반 공격 대상만). 원소 손상(게이지)·장비 발동 피해·막타는 뺌 [추정: 원소 손상은
  `IsDamage` 아님]. `items/battle.js onDamageEnemies`. 테스트 `test/content/items.test.js` 「every damage instance procs」.
- **浓缩嗅盐 면역 목록**: `acarm059` `abnormalImmunes` FROZEN·SILENCED·STUNNED·LEVITATE + `abnormalComboImmunes` SLEEPING → 冻结·沉默·晕眩·浮空·睡眠(麻痹 빼고 沉默 넣음).
  모델 안 함 [추정]: 공식 면역은 버프라 HP가 70 % 위인 동안 이미 걸린 기절도 눌릴 수 있음(우리는 새로 걸리는 것만 막음).
- **拉特兰桥夹**: `acarm057` ON_SKILL_START에 `triggered = 0`, ON_AFTER_ATTACK에서 스킬 중·`triggered == 0`·남은 탄 ≤ 1이면 먼저 `triggered = 1` 후 Dice → 성공 시
  `AmmoSkillCountModifier.Execute`(0xC29580) = `RecoverEventCount(MathUtil.CeilToInt(f32(maxCount) × 0.4))`(maxCount = 拉特兰 탄 포함 그 시전의 최대), 배치당 최대 3회.
  즉 **스킬 한 번에 한 번만 굴림**(이전: 1발이 될 때마다).
- **失衡 — 벽에 막힌 밀기**: `Enemy.States.UnbalanceState`는 시간표가 아니라 물리 — `OnTick`(0x752380) → `_UpdateFriction`(0x752C60)이 매 프레임 마찰로 속도를 줄이고
  속력 ≤ 0.1이면 끝. 벽(고지대·맵 끝)이 막으면 그 자리에서 멈춰 끝난다 → 우리 길이 = 막히기까지 걸린 시간(행의 位移时间 T 동안 균등 감속으로 멈추는 운동에서
  `T·(1 − √(1 − 간 거리/거리))` [ASSUMED: 균등 감속]), 최소 0.1 s(PRTS 失衡硬直; 클라의 최소 시간 출처는 다 읽지 못함). `displacement.js wallHold`. 이전 [ASSUMED]
  「벽에 막혀도 그 행의 시간」 삭제. 테스트 `test/sim/unbalance.test.js`.
- **적 생성기 예외** (`server/match/waves.js`, 지금 데이터에서는 안 일어남): 클라 `_GenerateRandomEnemyData`(0x83A2B0) — 그 유형 후보가 없으면 그 라운드는 뽑기 없음(이전:
  SPECIAL로 다시 뽑기); `_DoReplaceActionDataClient`(0x839A30) — 뽑기가 없거나 뽑힌 키에 적 데이터가 없으면(`LogError` 후 false) 자리표시 액션은 `isValid = false`
  (이전: 자리표시 적 그대로 소환); 새 키의 P/f = 0이면 0마리(이전: 1마리, 우리는 무효 처리). 테스트 `test/match/waves-official.test.js` 「the client generator's exceptions」.
  `docs/research/05-enemies-levels.md` §3.2·§6 `k` 열·§7, `05-enemies.json generation.recommendedAlgorithm`, `00-INDEX.md` #12에 「08이 대체」 표시.
- **桑葚(`band17`) 「가장 오른쪽」 — 관리자 결정 2026-10-11(두 번째 답) 「클라대로」**: 반전 판(최후 공세 오른쪽)에서도 **원시 필드 열**이 가장 큰 유닛
  (`bands/battle.js` `boardCol = u.tileC`). 근거: 클라 버프 템플릿 `act1autochess_band17_buff[self]`·`[check]`가 `AssignGridPositionToBlackboard`의 열을 그대로 비교
  ([추정] GridPosition은 쪽마다 뒤집히지 않음). 같은 날 첫 답은 「반전을 따라감」이었다. **되돌리기**: 그 플레이어 판 기준(반전 판은 필드 왼쪽이 오른쪽)은
  `boardCol = (u) => (ps.mirror ? -u.tileC : u.tileC)` — 2026-10-11 전까지의 동작. 테스트 `bands.test.js` 「桑葚 … mirrored half」.
- **桑葚 재배치 재판정**: 템플릿 ON_BUFF_START가 배치마다 `[core]`와 `[self]`를 주고, `[self]`는 0.1 s 뒤(`triggerInterval 0.1`, `AutoChessIsInBattle`) 같은 플레이어 쪽
  유닛 모두에 `[check]` → 둘 중 왼쪽 것의 `[core]`를 지움. 그래서 전투 시작 뒤의 배치(재배치·기습 착지·【移动】·소환물)도 0.1 s 뒤 다시 판정한다 — 그 플레이어의 유닛 중
  더 오른쪽이 없으면 유지하고 자기보다 왼쪽 유닛의 것을 지우며, 있으면 자기 것을 잃는다(이미 잃은 유닛은 되찾지 않음). 이전: 전투 시작 때 한 번. [추정] 소환물·【移动】도
  새 배치로 봄; 전투 시작 판정은 battleStart 순간 그대로(공식은 0.1 s 뒤 — 그 사이 공격이 없어 차이 없음). 테스트 `test/content/bands.test.js` 「桑葚」(실제 경로 포함).
- **克莱门莎(`band13`) — 켜진 맹약만, 调和 멤버 포함**: 그래프 `act1autochess_band13_buff` ON_OWNER_KILLED → `AutoChessFilterCharacterBondIds(_considerManiShip)` →
  `AutoChessTriggerGarrisonAbility` → 클라 코드 `AutoChessGarrisonManager._TriggerGarrisonStatusRefresh`(RVA 0x81C8B0) → `ScenePlayerData.AddBondCount`(0x856930)는
  켜지지 않은 맹약(`GarrisonBond.isActive` false)에 층을 주지 않는다 → `requireActive: true`, 调和 멤버(调和가 켜져 있을 때 — `support isMember`)도 쓰러지면 셈. 이전: 켜짐
  확인 없음(위 2라운드 D1은 그래프 노드만 본 판정), 자기 맹약만. 전투 중 층 증가 중 `requireActive: false`였던 곳은 이것뿐(특질 `gar_event_*`는 이미 true). 준비 단계의
  층(서버 규칙 SERVER_PREP_*: `bands/meta.js` prep_finish_char_bond_add_layer, `choices.js` addLayer, `server/match/builtinMeta.js` 장비, 특질 「无需激活盟约」)은 클라
  경로가 아니라 그대로. 테스트 `bands.test.js` 「克莱门莎」(실제 경로 포함).
- **特质 attrByBond = 배치 때 계산 — 관리자 결정 2026-10-11 「클라대로」**: 클라 버프 템플릿 `act1autochess_gar_eff_attrByBond`는 노드가 모두 ON_BUFF_START에 있다
  (`AutoChessAssignBondStackCntToBB` → 층 ÷ divide_num `_finalFloor` → 능력치마다 × 단계, 상한 `max_stack` 999999) — ON_BUFF_TRIGGER가 없어 전투 중 층이 늘어도 다시
  계산하지 않는다. 그래서 그 오퍼레이터가 다시 배치될 때(쓰러진 뒤 재배치·기습 착지 — 【移动】은 유지 [추정])만 그 순간의 층으로 다시 정한다. `act2autochess_gar_eff_attrByBond_add_onstart`도
  ON_BUFF_START뿐이라 같은 방식(이전에는 층이 늘면 돌고 있는 시한 버프를 다시 계산; 관리자 결정 2026-10-11 「공식이 배치 때만 계산하면 그대로」 — 화면 확인 항목). `ab_damageScaleByBond`(ON_BUFF_TRIGGER)와 `respawnTimeByBond`(EN 템플릿 없음)는 계속 층을
  따라감. `garrisons/battle.js installReaders`. **되돌리기**: `installReaders`의 `layerGain` 재계산 목록 `live`에 attrByBond·add_onstart를 다시 넣으면 2026-10-11 전 동작
  (층이 늘 때마다 다시 계산; bonds.md T1). 테스트 `test/content/garrisons_battle.test.js` 「attrByBond」(실제 경로 포함).
- **阿戈尔 吞噬 팀원 — 관리자 결정 2026-10-11 「지금 규칙 유지(A)」**: 에기르 멤버는 앞 칸의 오퍼레이터를 주인과 상관없이 먹는다(#140 결정 그대로, `bonds/core.js devour`).
  그래프 읽기(bonds.md B9: 맹약이 안 켜진 팀원은 `eat_calculated`로 안 먹음)와 다르지만, 联防·보스 필드는 두 플레이어 구역 경계에 공격 지점·배치 불가 칸이 있어 팀원
  오퍼레이터가 에기르 멤버 앞 칸에 설 수 없으므로 결과가 같다(관리자 설명). 동작 변경 없음.
- **黄沙罗盘 「첫 스킬 끝」 = 배치마다**: 클라 버프 템플릿 `act1autochess_acarm103_buff` ON_BUFF_START가 `has_used_skill`을 0으로, ON_SKILL_FINISH는 그 값이 0일 때만
  萨尔贡 운반자에게 `sp`(그다음 1) → 재배치하면 다시 받는다(이전: 전투당 한 번). `items/battle.js` `doneSeq`(배치 번호). [추정] 기습 착지·【移动】도 새 배치로 봄.
  테스트 `test/content/items.test.js` 「黄沙罗盘」.
- **맹약·장비·전략 템플릿 이펙트 — 관리자 결정 2026-10-11 「넣음」**: 템플릿 그래프의 `CreateEffect`·`CreateEffectAtScreenPos` 노드가 도는 순간 상태 이벤트
  `['tplfx', 대상 id | null, effectKey, 출처 id | null]` 한 번(목록·조건은 `docs/SIM.md` 이벤트 표, 코드 `content/support tplFx`). 표시만 — 상태·rng를 바꾸지 않는다.
  EN 템플릿(卫戍协议 201개)의 노드 이펙트 16개 중 우리 sim이 모델하는 것 전부: 拉特兰桥夹(채울 때만), 黄沙罗盘, 迅捷(줄마다), 阿戈尔 표식·5 부활, 埃芒加德·M3茧甲 부활,
  歌利亚头盔(앞 칸이 비었을 때), 蒸汽之心(维多利亚 운반자), 叙拉古 6 발동, 谢拉格 바람(화면 가운데). 뺀 것: `act1vautochess_acarm024`·`trap_acspell004`(다른 모드, 우리 데이터에
  없음); 버프 자체 이펙트(`overrideEffectKey`: 은신 `common_invisible` 등)는 노드가 아니라 버프가 붙어 있는 동안의 것이라 이 이벤트가 아님. 테스트 `test/content/tplfx.test.js`.

## 일반 공격 타이밍 (2026-10-10, 관리자 결정 「동작 변경 모두 공식이랑 동일하게」)
오퍼레이터·적의 일반 공격을 EN 클라 코드(Il2CppDumper → 역어셈, 비공개 조사 기록)대로 맞췄다. 코드 `server/sim/ai.js` `attackTiming`·`updateAlly`·`enemyAttack`,
데이터 `tools/local-extract/attack_timing.py` → `tools/assets/local-attack-timing.json` → `tools/build-data.mjs` `opAttackAnim`·`enemyAttackAnim` →
`data/chess.json`·`data/backups.json`(오퍼레이터) / `data/enemies.json`(적) `attackAnim`. 아래 메서드는 모두 켜진 Lua 핫픽스 목록(en_US·zh_CN `DefinedFix.lua`)에 없다.
- **클립 배율**: 클라 코드 `AbstractAnimatedAbility.UpdatePlaybackSpeed`(RVA 0xA6E070) — 배율 = 공격 간격 ÷ 클립 길이를 [0.1(상수 `MIN_ANIM_SCALE`),
  `_maxAnimScale`]로 자름(−1 = 상한 없음), 휘두름 길이 = 배율 × 클립, 재생 속도 = 1/배율. 상한 1(오퍼 공격 능력의 다수, 적 대부분)이면 느린 공격자는 클립을
  제 속도로 휘두르고 남은 간격은 대기. 값은 공격 능력 프리팹(`<id>/Modes/<mode>/Body/Attack` 등)의 `_maxAnimScale`·`_preDelay`·`_waitForAttackEvent`·
  `_selectTargetTiming`. 오퍼레이터는 모드마다: Default 모드 = `attackAnim.base`, 스킬이 바꾸는 모드(`shared/skill-modes.js skillModeIndex`) =
  `attackAnim.skills[i]`(스킬이 켜져 있을 때). 클립 길이·OnAttack 프레임은 `data/assets.json` Front 골격. 적은 막혔을 때 쓰는 Combat(근접) / Attack(원거리) 능력.
  이전: 적은 상한 1과 같았고(간격이 클립보다 짧을 때만 빨리), 오퍼레이터는 sim에 휘두름이 없었다.
- **타격 시점**: 휘두름 시작 뒤 OnAttack 프레임 × 배율. 클립에 OnAttack이 없으면 휘두름이 끝날 때(`EasyToStartAbility.<WaitForNextEvent>` 0xA7A580: 이벤트 또는
  휘두름 전체 `m_cachedDuration`까지 기다림 — 이전에는 클립 절반). `_waitForAttackEvent` 0이면 `_preDelay` × 배율(휘두름 길이 이하; `UpdatePlaybackSpeed`의
  `m_preDelay`) — 오퍼 15개 능력(어스스피릿 0.5 등). 클립을 모르면(소환물, 매니페스트에 없는 모델) 휘두름 시작에 바로 타격(이전 규칙).
- **쿨다운은 휘두름 시작에서 다시 건다**: `AbilityStandard.CastToTarget`(0x34EE170) → `m_cooldownTimer.Reset(true)`. 다음 휘두름은 쿨다운이 끝나고 지난 휘두름(후딜
  포함, `castLeft`)도 끝났을 때(`Character.States.AttackState.OnTick` 0x71AAD0: 공격 능력이 `isReady`일 때만). HALF_FRAME(`_CheckNeedResetCooldown` 0xA72BC0, 프리팹
  전부 1): 휘두름 길이 = 간격이면 끝에서 남은 쿨다운 반 프레임을 0으로 — 우리 틱 카운트다운은 두 값이 같은 틱에 시작해 같은 틱에 0이 되므로(1e-9 허용,
  `attackCountdown`) 다음 휘두름이 그 틱에 이어진다(따로 코드 없음). 이전: 적은 쿨다운이 타격 프레임까지 셌다.
- **끊긴 휘두름은 쿨다운을 돌려주지 않는다**: 기절·빙결·수면·浮空·失衡, 숨음(적), 缴械·恐惧·战栗(막힘), 퇴각 — `Ability.InterruptIfNot`(0x34F5280) =
  `FinishIfNot(INTERRUPTED, false)`, 쿨다운 그대로 → 끊긴 휘두름 시작부터 간격 한 번 뒤 다음 휘두름. 이전: 적은 기절이 풀리면 곧바로 새 휘두름.
- **쿨다운은 기절 중에도 흐른다(확정)**: `Entity.OnTick`(0x35FF650)은 `get_alive`(슬롯 38: 상태기계 동작 중 + HP > 0)일 때 능력마다(첫 캐스트 프레임만 빼고) 가상
  `OnTick`(슬롯 54)을 부르고, `AbilityStandard.OnTick`(0x34F1DD0) → `Ability.OnTick`(0x34F5660) → `PeriodicTimer.Update`(0x1AF6CD0)는 조건 없이 남은 시간을 줄인다
  (`Attributes.GetValue` 분기는 `m_epController` 트윈 속도 ← `EP_BREAK_RECOVER_SPEED`(0x23)만 정함 — 원소 막대 회복, 능력 틱을 막지 않음, 2라운드 확인). 오퍼레이터·적 모두 필드에 있으면(적은 숨지 않았으면) 기절 중에도 센다.
  이전: 오퍼레이터는 `canAct`일 때만, 적은 기절 중엔 멈춤.
- **대상이 휘두름 중 죽으면 헛휘두름**: 대상은 휘두름 시작에 정해지고(`CastToTarget`의 `m_inputTarget`), 타격 때 `AbilityStandard.DoCastOnTargets`(0x34EE9D0)가
  `ValidAndAlive`인 대상만 친다 → 아무도 없으면 피해 없음, 휘두름·후딜은 끝까지, 쿨다운 환불 없음(`_interuptIfTargetDead` 0 = 오퍼 480/481, 적 513/519).
  `_selectTargetTiming` 1(BEFORE_SPELL_START: 오퍼 97·적 41 능력)·3은 타격 순간 다시 고르고, 아무도 없으면 `FinishIfNot(TARGET_DEAD)` → 타격 전이라
  `Reset(false)` = 쿨다운 환불(바로 다시 휘두를 수 있음). 2(RESELECT_IF_TARGET_DEAD)는 첫 대상이 죽었을 때만 다시 고름. 사거리 밖으로 나가도 휘두름은
  끊기지 않는다(`AttackState.OnTick`에 사거리 검사 없음). 이전: 적은 매 틱 사거리 안 대상이 있어야 했고 타격 때 다시 골랐다([ASSUMED] 삭제).
- **麻痹**: 타격 순간 `Enemy.CanDoAbilitySpellOn`(0x720DD0)이 PALSY로 거부 → `FinishIfNot(PALSY, false)`: 피해 없음, 쿨다운은 휘두름 시작부터 그대로(이전: 타격
  시각부터 간격 한 번 다시).
- **휘두름 이벤트**: 휘두름을 시작하는 틱에 `['swing', unitId, windup, projKind]`(타격까지 게임 초, 그 타격 'atk'의 kind). 렌더는 이것으로 Spine 휘두름을
  공식 속도로 시작한다(`render.md` 「공격 모션」). fx 담당도 같은 이벤트를 쓴다.
- [추정] 휘두름 중 스킬이 켜지거나 꺼지면(공격 프로필이 바뀜) 타격 때 대상을 다시 고른다 — 클라는 모드를 바꾸고 새 모드의 공격 능력이 따로 대상·쿨다운을
  가진다(아래 차이). [추정] 클립 이름: `ThreePartOneshotAnimation`의 `_oneshotAnim`(`_beginAnim`은 안 셈), 골격에 없는 `_animKey`는 `<key>_Loop`, 그래도 없으면
  렌더가 그 모드에 쓰는 클립(`anims.attack`/`anims.skills[i]`) — 왕 Default, 마운틴 S2·S3, 시·수르트·민트·플레임테일·파투스 스킬 모드 등 10개 능력. 적은 Default 모드의 능력 하나(형태별 클립은 기존 [ASSUMED]).
- 아직 공식과 다른 것: 공속이 바뀔 때 쿨다운 진행 비율 유지(`OnAttackTimeChanged` → `ResetButKeepProgress`) — 우리 `atkCd`는 남은 초 그대로. 모드·능력마다 따로인
  쿨다운(적 Combat/Attack, 스킬 모드) — 우리는 유닛당 하나. 저지가 생기면 오퍼레이터의 Attack 상태가 COMBAT으로 바뀌며 휘두름이 끊기는 것(`AttackState.OnTick`)과
  르무엔 S2의 `_interuptIfTargetDead` 1 — 모델 안 함. `_timeMode` 1·2(오퍼 9개, 적 7개)도 공격 간격으로 계산. `_escapeTime` = 대상이 없어진 뒤 공격 자세(Attack 상태)에 머무는 시간 — `AttackState.<_StartAttack>b__5_0`(0x71ADA0)이 `fixedPlayTime + escapeTime`을
  적고 `_NextAttackOrExit`(0x71B210)는 대상이 없으면 그 뒤에야 IDLE로; 다음 공격 조건(대상·쿨다운)은 같아 시뮬 영향 없음(렌더 대기 자세 후보), 스킬 쪽
  `BasicSkill.get_escapeTime`(0x63CF80)은 `_useEscapeTime`이 1인 스킬만 — 우리 풀 296개에 없음. 소환물(token)은 데이터가
  없어 휘두름 시작에 바로 타격.
- 테스트: `test/sim/attack-timing.test.js`(오퍼레이터·데이터), `test/sim/feedback5-enemy-swing.test.js`(적: 끊김·헛휘두름·재선택·麻痹), `test/render/attack-swing.test.js`.
  일반 공격 시각이 바뀌어 golden 전부가 움직이고, 첫 공격·스킬 공격 시각을 같은 틱으로 보던 키트 테스트를 「타격까지 기다림」으로 고쳤다.

## 오퍼레이터 키트 — 클라 코드·프리팹대로 (2026-10-10, 관리자 결정 「동작 변경 모두 공식이랑 동일하게」)
근거: EN 클라(2026-08) 프리팹 값과 클라 코드(디컴파일 — 레포에는 클래스·메서드 이름만). 켜진 Lua 핫픽스(`DefinedFix.lua` en_US·zh_CN)에 아래 메서드 없음.
- **跃跃(케이퍼, `char_4100_caper`) S2 乐趣加倍** (`chess_char_1_09-caper.js`): 공격마다 부메랑 `cnt`개 — 공격의 것(`projectile_chr_caper_s2`) 하나와,
  0.1 s 간격으로 같은 대상에 `cnt − 1`개 더(charpack `Modes/S2/Body/Attack` `_additionalTimes` 1, `_triggerDelta` 0.1, `_additionalProjectile`
  `projectile_chr_caper_s2_1` = `_inverseParacurve` 반대쪽 호). 각 1타(`_hitNumType` LIMITED, `_maxHitNum` 1), 각자 돌아오고, 다 돌아와야 다음 공격.
  총 spell 수 = 1 + `_additionalTimes`, 사이 `_triggerDelta`(클라 코드 `MultiRangedAttack.CheckAnotherSpell` 0xA43920: `spellCnt > _additionalTimes`면 끝).
  추가 부메랑은 같은 시전의 다음 spell이라 같은 대상(`_selectTargetTiming` 0)이고, 그때 죽은 대상에는 안 던짐(클라 코드 `AbilityStandard._DoCast`
  → `CheckAnotherSpell` → `OnWaitForTriggerDelta` → `OnSpellStart` → `DoCastOnTargets`는 살아 있는 대상만). 기절·퇴장 중이면 안 던짐 [추정: 상태 전환이 능력을 끊음].
  같은 공격(attackId)이다. 그 전(~2026-10-10): 부메랑 하나가 `cnt`타를 싣고 함께 날았다. 엔진은 `ai.js throwBoomerang`을 export만 했다(키트가 부름).
  화면: 두 번째 부메랑은 fx `caperBoomerang2` { id, tgt, n } — 아직 그리지 않음(`kinds.js` 'none'; 공격 'atk'의 부메랑만 보임). 풀의 回环射手는 跃跃뿐
  (`data/chess.json` loopshooter). 테스트 `test/content/kits_t1t2.test.js` 「1_09」.
- **缄默德克萨斯(텍사스 디 오메르토사, `char_1028_texas2`) S3 剑雨滂沱** (`chess_char_4_16-texas2.js`): 프리팹 `skchr_texas2_3`은 `AbilitySequenceGroup`
  (1Frame → AppearSwordRain → ModeWithSwordRain; 앞 능력이 끝나야 다음 — 클라 코드 `AbilitySequenceGroup._OnSubAbilityFinished` → `_MoveToNextActiveAbility`).
  배치 폭발 AppearSwordRain: `_preDelay` 0.6 s 뒤, 0.2 s 간격 2타(`_additionalTimes` 1, `_triggerDelta` 0.2), 타마다 대상 다시 고름(`_selectTargetTiming` 1)·
  기절(`_activeBuffs` stun). 그다음 ModeWithSwordRain이 검우 버프 `texas2_s_3[sword]`(`triggerability_tick_trigger`, `firstTriggerInterval` 0.4,
  `triggerInterval` 1, 수명 `duration`)를 붙인다 → 첫 검우는 둘째 타 0.4 s 뒤(배치 1.2 s), 그 뒤 1 s마다. 검우 대상은 그 순간 고르고(EmitSword
  `_selectTargetTiming` 1, `max_target`), 검마다 `_randomDelayToBorn` 0–0.3 s(전투 난수 `battle.rng`; 클라 `Projectile._InitInline` 0x5FE450은 0–최댓값 균등 지연 뒤 투사체를 탄생시킴, 난수는
  `randomTrivial`) 뒤 피해·기절(`projectile_chr_texas2_s3_sword_rain`).
  패시브 길이: 검우 버프부터 `duration` → 스킬 지속 = `duration` + 0.8 s [추론: `texas2_s_3`·`[sword]` 버프(수명 `duration`)를 마지막 단계가 붙임] —
  검우 횟수는 그대로 `duration`번. [추정]: 1Frame 단계(1프레임)는 넣지 않음, 검이 생긴 뒤 `_lifeTime` 0.1 끝(`_alwaysHitTraceTargetInTheEnd`)에 맞는지는
  안 봄(생길 때 피해로 둠), AppearSwordRain `_preDelay`가 공속 배율을 받는지 안 봄(0.6 s 고정). 첫 처치 재시전(德克萨斯传统)은 남은 배치 타·검을 지우고
  새로 시작한다. 그 전: 배치 2타 동시, 첫 검우 1 s(배치 기준), 검 동시. 테스트 `test/content/kits_t4.test.js`·`kits_alt_t4.test.js` 「缄默德克萨斯」.

## 적 투사체·공식 바인딩용 이벤트 필드 (관리자 결정 (2026-10-10) 「동작 변경 모두 공식이랑 동일하게」)
근거: EN 클라(2026-08) 적 프리팹 `battle/enm_pfb_*.ab`·투사체 `battle/prefabs/[uc]projectiles.ab`의 값과 클라 코드(디컴파일 — 레포에는 클래스·메서드 이름만,
RVA는 EN 판). 켜진 Lua 핫픽스(`DefinedFix.lua` en_US·zh_CN)에 아래 클래스 없음. 렌더·소리(공식 이펙트·뱅크 바인딩)가 쓰는 계약이다.
- **적 투사체 데이터**: `tools/local-extract/enemy_projectiles.py` → `tools/assets/local-enemy-projectiles.json`(커밋) → `tools/build-data.mjs enemyProjectiles` →
  `data/enemies.json` `proj`·`projModes`·`skills[i].proj`/`projAlt`·`talentProj`(형식은 `docs/DATA.md` §enemies). 공격 능력(`Modes/<m>/Body/Attack`, 없으면
  `Combat`; 자식 능력이면 가장 얕은 것 — 假想敌：管 `Body/Attack/AttackEnemy`)의 `_projectileKey`·`_mountPointType`(Entity.MountPointType), 스킬은
  `Skills/<이름>`(gamedata prefabKey와 대소문자만 다름), 특성은 `Talents/<이름>`의 버프 블랙보드가 부르는 키. 투사체의 이동 behaviour는 직렬화 필드로 가림:
  AdvancedMovement(`_moveType`), ParacurveMovement(`_raiseHeight` → PARACURVE), HarpoonMovement(`_extendLenth` → HARPOON), AttachToTarget(`_immediatelyReach` →
  ATTACH). 적이 쓰는 83개 중 PARACURVE 14, HARPOON 6, ATTACH 12, 이동 behaviour 없음 2(`Talents/Boom`의 `projectile_bslime`·`projectile_snslime`), 나머지
  AdvancedMovement.
- **비행 시간**: TRACE_TARGET_WITH_SPEED는 대상을 쫓아 `_speed`(타일/초). PARACURVE는 클라 코드 `ParacurveMovement.Init`(0x9A6840: `m_speed = _speed`)·
  `OnInit`(0x9A6970: 시간 = 수평 거리 ÷ `m_speed`, 높이는 중력 계산에만)·`_CalculateNextPosition`(0x9A6FB0: 매 틱 대상 현재 위치로 목표 갱신) → 우리 2D 추적
  투사체와 같은 시간. HARPOON은 대상까지 `_speed`로 뻗음(`_acceleration` 0). 그래서 sim은 셋 다 `speed`로 날린다(`server/sim/ai.js enemyShot`·`shotSpeed`).
  공격 능력에 투사체가 없으면(`proj: null`: 妖怪MKII, 萨卡兹百夫长, “邪魔的利刃”, 盐风主教昆图斯 …; 프리팹은 대상에 `hitEffects`만) 피해는 타격 순간 — 远程途径
  아님(`isProjectile` false), 'atk' kind `none`. 데이터에 없는 적(테스트 유닛 등)은 예전 `PROJECTILE_SPEEDS.enemy` 10.
  이전: 원거리 적 모두 10 — 바뀐 적(PARACURVE): 萨卡兹枯朽战车 ×2·高准度伦蒂尼姆城防自行炮·“帝国的甲胄”·集团军重型火炮 4, 烹泉·沏虹·灼热源石虫·炽焰源石虫·碎骨·W·
  “墓碑” 5, “庞贝” 6, 自制投石机 8; (TRACE) 法术大师A1·A2·陷落雪祀 15, “灵幛” 18; (HARPOON) “独轮车玩具” 30; 투사체 없는 원거리 적 40종은 즉시.
  모드별: 守墓石像 Fly 모드(`setForm` 'fly' ↔ `_modes` `Fly`).
- **콘텐츠 스킬 투사체**: 重弩突袭者 直击 12 → 5(`projectile_enemy_msnip`, FIXED_DIRECTION — 아래 「FIXED_DIRECTION 투사체」),
  迷路的巨像 StunAttack 8 → 10, 假想敌：蚀裂 사망 독구름 8 → 5(PARACURVE), 萨卡兹枯朽战车 秽蚀轰击 구역은 공격 순간 → 포탄 착지(공격 때 대상 위치,
  `projectile_enemy_nhtank_polluted` 4 타일/초; 착지 뒤 머무는 시간 `_delayTime` 20은 블랙보드 `projectile_delay_time`이 덮음 — 클라 코드 `ParacurveMovement.OnInit`이
  그 키를 읽음). 帝国炮火先兆者의 3초는 `projectile_enemy_emppnt` = AttachToTarget `_delayToStart` 3으로 확인(콘텐츠 그대로).
- **FIXED_DIRECTION 투사체** (관리자 결정 2026-10-10, 클라 코드 EN): 적이 쓰는 것은 둘 — 重弩突袭者 直击 `projectile_enemy_msnip`, 萨米的意志 冰凌
  `projectile_enemy_smdeer`(아래). 둘 다 `FarthestPointMovement`(AdvancedMovement 하위). `AdvancedMovement.OnInit`(0x97D710)의 moveType 분기에서
  FIXED_DIRECTION은 도착점을 두지 않아(`m_hasTarget` 0) `DoCheckReachedInternal`(0x97CF70)로 「도착」하지 않는다 — 대상 추적 없음. 방향은
  `FarthestPointMovement._SetTargetPosAndDirection`(0x999B50): `_useDirToTarget`이면 `MapUtil.NormalizeDirectionToFourWays(대상 − 출발)` = 가까운 네 방향
  축, `_useConstDirection`이면 고정 방향. 투사체는 `Projectile.OnTick`(0x5FC420)에서 수명(`_lifeTime`)이 다할 때만 멈추고(도착 처리
  `DealProjectileReached` 0x5F99F0는 멈추지 않음), 맞을 수(`_hitNumType` LIMITED·`_maxHitNum`)를 채우면 `_stopAfterMaxHit`로 멈춘다.
  - 重弩突袭者 直击(`enemies/invisible.js kitCrossbow` → `enemies/helpers.js lineShot`, 이전: 겨눈 대상에 유도): 1.4 s 충전 뒤 시전 때 겨눈 칸
    쪽 축으로 5 타일/초 직진, `SelectorHitBehaviour`(`_hitPasserby` 1, `_interval` 0.03 — 우리는 매 틱) 원 반경 0.3(Selector0/1의 CircleCollider2D)에
    충돌체(ALLY_COLLIDER_RADIUS 0.25)가 닿는 첫 아군 1명(`_maxHitNum` 1, `_stopAfterMaxHit` 1)에 법술 피해·기절 후 멈춤. 겨눈 대상이 사라지면 그 뒤의
    아군에, 축 위에 아무도 없으면 10 s(50타일) 날다 사라짐. 충돌 선택은 `areaSelectable`(투사체 충돌은 迷彩 무시 — Selector1 `_forceIgnoreCamouflage`).
    [추정] 충전 중 겨눈 대상이 죽어도 쏨(스킬 `_allowNoTarget` 1), 출발점은 몸 중심(MUZZLE 높이 무시), 축 고르기의 동률(대각선 정확히 45°)은 가로.
    스킬 대상 고르기(`AdvancedSelectorWithTrapSheltr` `_checkOnTheSameLine`, 오프셋 X ±0.5·Y −0.5~0.1 — 우리는 ±0.5)와 사거리 CROSS_REACH 6
    [ASSUMED]은 그대로.
- **萨米的意志 冰凌** (`content/bosses.js kitDeer`, 이전: 공격 순간 열 전체 즉시): 공격 능력은 `ProjectileToTileAbility`, 휘두름의 OnAttack 프레임
  (`_waitForAttackEvent`, `attackAnim.hit` 1 s — 'swing' 이벤트 냄, 쿨다운은 휘두름 시작부터, 타격 때 대상 다시 고름 `_selectTargetTiming` 1, 아무도
  없으면 쿨다운 돌려받음)에 열마다(최대 1, 체력 절반 아래 2) 냄. 타일 선택기 `SmdeerTileSelector._TryGetTile`(0x6DD990)은 대상 열의 **맨 위 칸**
  (GridPosition(row = Map.height − 1, col) — 공식 맵 19행이라 행 18). `projectile_enemy_smdeer`는 AttachToTarget(`_immediatelyReach`)로 그 칸에 놓이고
  FarthestPointMovement(고정 방향 DOWN, 5 타일/초)로 내려가며, `SmdeerAttackHitBehaviour`(Init 0x988590, `_CheckDistanceToEmitProjectile` 0x988960)가 맨
  위 칸에서 k·`dist`(블랙보드에 없음 → 1) 이상 내려오면 k번째 칸에 하위 투사체 `projectile_enemy_smdeer_2`를 놓고, 다음 칸이 맵 밖이면 멈춘다.
  하위 투사체: AttachToTarget 즉시, `_lifeTime` 1, `HitBehaviour` `_onlyCheckHitWhenStop` 1·원 0.25·`_maxHitNum` 1 → 놓인 뒤 1 s에 그 칸(중심에서
  0.25 + 아군 충돌체 0.25)의 아군 1명에 ATK × `atk_scale_2`(블랙보드에 없음 → 1) 물리. 그래서 행 r의 아군은 타격 뒤 (18 − r)/5 + 1 s에 맞고(보스
  전장 행 2–5: 3.6–4.2 s), 그때 그 칸에 선 아군이 맞는다. 본 투사체 자체는 아무도 안 맞힘(`_hitNumType` INFINITY, hit behaviour 없음). fx 'column'에
  `key`·`sub`·`r0`·`dir`·`speed`·`dist`·`life`를 실음(docs/SIM.md). [추정] 런타임 Map.height = 레벨 맵 19행(보스전도 같은 맵), 칸마다 시각을 k·dist/speed로
  계산(클라는 틱마다 한 칸까지라 5 타일/초에선 같음).
- **`stay`**(`_delayAfterReached`, 닿은 뒤 남는 시간 — `AdvancedMovement.DoCheckReached` 0x97D0A0 → `Projectile.EnsureLifeTime` 0x5F9C90: 남은 수명을
  그 시간으로): 남아 있는 동안 같은 대상을 다시 맞히는 것은 `_keepAlreadyHitTime` > 0인 것뿐(`Projectile.CheckTargetAlreadyHit` 0x5F93C0: 기록값 < 0 =
  다시 안 맞음, 아니면 그 시각까지). 우리 적 중 해당: 萨卡兹枯朽战车 秽蚀轰击 `projectile_enemy_nhtank_polluted`(1 s)·假想敌：蚀裂 독구름
  `projectile_enemy_actoxi`(1 s) — 둘 다 이미 콘텐츠 구역(`enemies/dot.js` pollution·dmgZone, 1 s 간격)으로 구현. `projectile_enemy_actrpb`(0.7 s)는 stay
  0.01이라 한 번. 나머지(acstmk·acstmr·lrnazg·wintun_range)는 −1 → 반복 없음. 고칠 것 없음.
- **`moveScale`**(투사체 속도 배율): `Projectile.RegisterMoveScale`(0x5FCEE0)을 부르는 것은 `ProjectileMoveScaleBehaviour`(ProjectileAuraAbility)와
  이벤트 전용 `Act43sideMoveScaleBehaviour`뿐. 클라 묶음(charpack·enm_pfb·skills·traps·tokens) 중 그 오라는 逻各斯 S3(`skchr_logos_3`)뿐이고 우리
  명단에 없음 → 우리 적 투사체에 걸리는 것 없음.
- **콘텐츠 스킬 투사체 2차** (`enemies/helpers.js shoot(b, from, t, shot, onHit)`: 위와 같은 비행 시간으로 `addProjectile`, 날지 않는 shot은 즉시; fx
  `enemyShot` { id, from?, tgt, key, move, speed, t }를 냄 — `kinds.js` 'none'): 데이터 `skills[i].proj`대로, 효과는 투사체가 닿을 때(이전: 시전 순간).
  - 假想敌：黑云 FireWeapon(`projectile_enemy_acfort_skill` 10): 연타마다 한 발, 닿을 때 피해. [추정] 연타 사이 간격은 안 읽음 — 모두 시전 때 출발.
  - 凋零骑士 TripleAttack(`projectile_enemy_dekght_s` 10): 화살이 닿은 대상의 칸에 표시, `interval` 뒤 십자 폭발. [추정] 지연은 착지부터 셈(`dekght_2[aoe]` 버프가
    맞은 대상에 붙는다고 봄).
  - 陷落雪祀 ChainBuff(`projectile_enemy_smsha_s` 15): 적마다 닿을 때 버프, 다음 도약은 거기서 그때 고름. [추정] 도약도 같은 투사체·속도.
  - 杰斯顿·威廉姆斯 IronSandStorm(`projectile_enemy_jakill_s1` 10): 대상마다 한 발, 닿을 때 기절(본 공격 피해는 엔진의 일반 공격 투사체 10).
  - “碎铳之簧” `1`: 元素护盾 탄(`projectile_enemy_actrpb` 15)은 닿을 때 침식, 튕김은 맞은 대상에서 출발 [추정: 같은 투사체]; 频次护盾 10연타
    (`projectile_enemy_actrpc` 10)는 닿을 때 10타 [추정: 10타 사이 간격은 안 읽음].
  - 假想敌：管 `1`(`projectile_enemy_acduml` 10): 0.4 s 간격 세 발이 余音에 닿을 때 폭발·余音 피격. 假想敌：弦 `1`(`projectile_enemy_acdumm` 10): 金 余音에
    닿을 때 폭발·暗 전환. 둘의 일반 공격(余音 타격)도 공식 `proj`(같은 키, 10)로 날아 닿을 때 余音 피격.
- **'dmg' 이벤트 6번째 = 공격자 unit id** (`server/sim/damage.js attackerId`): 일반 공격, 키트가 `battle.dealDamage`로 넣는 스킬 피해('atk' 없음 — 키트
  약 60개), DoT(건 유닛), 소환물(자기 id). 无来源(원소 폭발, `periodicDamage`)·출처 없는 피해는 null. 원소 게이지
  채움도 같은 자리(5번째는 0). 기존 원소 위치·뜻은 그대로.
- **적 스킬 이벤트에 공식 능력 이름**: 콘텐츠의 쿨다운 스킬이 시전되면(`content/enemies.js onTick`) fx `enemySkill` `{ id, ability, n }`을 먼저 내고, 그 시전
  호출 안에서 나는 fx에는 `ability`·`caster`가 붙는다(`battle/events.js fx`; 나중 예약(`battle.after`)된 fx에는 없음). `ability` = gamedata 스킬
  `prefabKey`(`enemies/helpers.js abOf`의 `sk[*].name`; 보스 키트의 수동 능력 객체도 `name`). 렌더(`kinds.js` `enemySkill` 'none' — 그리지 않음)·소리가
  `enemy-bindings`의 `Skills/<이름>`·`ON_ABILITY_*.<신호>`를 대소문자 무시로 찾는다. 이름 없는 콘텐츠 능력(특성 반응, 일반 공격 변형)은 표시 없음.
- 테스트 `test/sim/official-event-fields.test.js`(`shoot` 포함), `enemies_bosses.test.js`의 黑云·凋零骑士·陷落雪祀·杰斯顿·碎铳之簧·管·弦 시각을 비행 시간만큼 늦춤. 투사체 속도로 적 원거리 피해 시각이 바뀌어 golden이 움직인다(roster 44·bonds 6·fields 20·matches 6·
  standins 5·diy 2 사례 — 갱신은 메인 세션), `enemies_bosses.test.js`의 重弩突袭者·集团军重型火炮 시각을 공식 속도로 고침.

## 작전 시작 차례 배치 (2026-10-10, 관리자 결정 「공식처럼 한 개씩, 部署 대사는 한 번」)
- 근거(클라 코드, 오디오 담당이 찾음 — `audio.md` 「전투 시작」): `MainGameInBattle._StartBattle`이 먼저 `_Prebuilt`를 끝까지 돌린다 — 말 하나마다
  `Deck.SpawnCharacterOrToken` 뒤 `WaitForFixedSeconds(0.2)`(.rdata 상수). 그 **뒤에** ON_BATTLE_STARTED(1211)를 쏘고 웨이브 스케줄러
  (`Scheduler.Init`·`DoSchedule`)를 시작한다.
- 지금(`battle/lifecycle.js start`·`_prebuiltStep`·`_beginWave`): 배치 순서(열마다 위→아래, 왼쪽 열부터, 오퍼레이터 다음 소환물; 공유 필드는 플레이어마다
  i번째끼리 한 묶음 [ASSUMED])대로 **0.2게임초마다 한 묶음**, 첫 묶음은 0초. 마지막 묶음 뒤 0.2초에 웨이브 시계(`battle.waveT0`)가 시작하고, 그때
  联防 강제 퇴장 → `battleStart`. 스테이지 출현 시각은 `waveT0`부터 센다(그 전엔 출현 없음). **제한 시간은 전투 시작(첫 배치)부터** 센다 —
  관리자 확인 2026-10-10, 공식 영상: 100초 카운트다운이 배치와 함께 시작하고 오퍼레이터 8명이 다 놓였을 때 약 98초가 남아 있다(처음 넣은
  판(47694f78)은 제한 시간도 `waveT0`부터 셌다). 먼저 내려온 유닛은 그동안 SP가 차고
  오라도 켜진다(적은 아직 없음). 상수 `constants.js PREBUILT_INTERVAL`, 전투 플래그 `prebuiltInterval`; 테스트 하네스(`battleHarness`)는 0을
  넘겨 예전처럼 한꺼번에(단위 테스트용) — 실제 매치 경로(spec → `createBattleFromSpec`)는 0.2.
- 매치 쪽: 화면 제한 시간(`m.public.deadline`)과 클라 필드 시계 한도는 그대로 전투 시작부터(위 관리자 확인). 결과 검증(`fields.js specBounds
  maxTime`)·봇 리허설 상한에만 배치 시간 여유(`spec.js prebuiltSeconds`, 묶음 수 × 0.2)를 더해 둔다.
- **[열림] 배치에 걸리는 시간**: 위 영상에서 8명 배치에 약 2초(100 → 약 98)가 지났는데, 0.2게임초 × 8 = 1.6게임초 = 배속 2에서 약 0.8실시간초다.
  영상의 2초에는 낙하 연출이나 첫 웨이브 앞부분이 들어 있을 수 있다 — 고치지 않았다(근거 없는 보정 금지).
- 예전(2026-10-10 저녁 전): 모두 0초 배치·웨이브 0초 시작, 화면만 0.12초 간격 차례 낙하(`render.md` 「배치 낙하」 — 지움).
- 테스트 `test/prebuilt-deploy.test.js`(0.2초 간격·`battleStart`·첫 출현·제한 시간, 실제 매치 경로).

## 炎佑 등장 위치 (2026-10-10, 관리자 결정 「클라 칸대로」)
- 관리자 제보: 「아래쪽 적 공격 지점 근처에 나와야」. 클라: 염국 맹약 버프 `bondeffect_yan`(ON_AUTO_CHESS_MODE_CHANGED)이
  `SummonEnemiesFollowBranchRoute` `_defaultBranchId "dragon"`을 부른다(진영별 1번 — `side_a_dragon`/`side_b_dragon`, 9명이면 2번 호출) →
  클라 코드 `Scheduler.SpawnSummonedEnemyWithBranchRoute`(`TryGetEnemyRouteFromBranch` → `Map.GetRouteOrNull`) → 웨이브 레벨의
  `branches.dragon` 출현 = `extraRoutes[routeIndex]`의 시작점. 버프 템플릿: 비공개 조사 기록(2026-10-10 buff templates).
- 값(`data/waves.json`): 일반·1인 联防(`escaped_single`) (행 11, 열 7) — 4줄 필드의 위에서 둘째 줄 가운데쯤; 2인 联防(`escaped_multi`) (11, 16)
  ±0.5(`spawnRandom`); 보스·숨은 핵심 (4, 10)(솔로 `h07_01_s` (4, 9), `h08_01_s` (4, 8); `h07_03`·`h08_03`은 routeIndex 1, 같은 (4, 10)). 관리자가
  기억한 아래 적 출입구 (9, 10)와는 다르다 — 등장 직후 위협도 높은 적을 쫓아가므로 아래 출입구로 들어오는 적 곁에 곧 가 있는 모습일 수 있다.
- 지금(`content/tokens.js yanyouSpawnPoint`): 전투의 웨이브 템플릿(`opts.waveId` — 매치가 넘김; 하네스는 `waveTemplate`)에서 위 점을 읽어 모든 炎佑를 거기에
  (두 번째는 옆에 떠 있음 `hoverDy`), 보스 짝의 반전된 오른쪽은 열을 뒤집음, `spawnRandom`은 전투 난수로 ±범위 균등 [ASSUMED: 클라의 분포].
  템플릿이 없으면 예전 규칙(`airTile`: 반쪽 중앙의 배치 불가 칸, 대개 (10, 6)).
- 테스트 `test/content/yanyou-spawn.test.js`.

## 관리자 결정 2026-10-11 — 즉발 스킬의 시전 · 보스 포털 · 자작 원소 · 저항 · 麻痹震颤
근거: 클라 코드(EN 클라 2026-08, Il2CppDumper 덤프)와 스킬 프리팹(`battle/prefabs/[uc]skills.ab`). 결정 번호는 관리자 노트의 2라운드 결정 목록.

### 즉발 스킬의 시전 (결정 1, GitHub #298)
- **규칙**: 자기 공격(`spec.attack`)이 없는 즉발·충전 스킬은 클라 스킬 클래스대로 시전한다 — 데이터 `skills[i].cast`
  (`tools/local-extract/skill_cast.py` → `tools/assets/local-skill-cast.json` → `tools/build-data.mjs skillCast`, 클립 길이는 `data/assets.json`).
  - `replace` = `ReplacementSkill`(풀 49개; 공격 없는 것: 引星棘刺 S1·锡人 S1·伺夜 S1/S2·华法琳 S1): 시전 때 SP를 쓰고 **다음 공격이 스킬로 나간다** —
    그 주기에 일반 공격 없음, 스킬 자신의 대상 선택(적이 없어도 나감), 효과는 그 휘두름의 OnAttack 프레임, 다음 공격은 그 휘두름 시작부터 공격 간격 한 번 뒤.
    클라 코드 `ReplacementSkill.ApplyModification`(0x678690) → `Character.RegisterReplacement`(0x6FC950), `Character.get_attack`(0x7053C0),
    `Character._SearchAttackTarget`(0x703DE0) → `TryHookSearchTarget`, 공격 뒤 `ReplacementSkill.CancelAfterAttack`(0x678870) →
    `Character.ClearReplacement`(0x6F4FB0)(스킬 능력 쿨다운을 공격 능력으로). 구현: `skills.js activate`(`replacing`)·`fireReplacement`, `ai.js startReplacement`.
    휘두름이 끊기면(기절·缴械) 시전은 다음 공격을 기다린다. 华法琳 S1 두 키트는 키트가 「막 나갈 치료」를 스킬 치료로 바꾸는 방식이라(대체되는 공격을 키트가
    직접 모델) SkillSpec `inAttack: true`로 엔진 대기를 끈다.
  - `state` = `CastSkill` `_switchToState` 1(풀 149개; 공격 없는 즉발 약 20개): 곧바로 시전하고 Skill 상태 — 진행 중 휘두름은 끊기고(쿨다운 유지,
    계속 흐름) 스킬 능력이 끝날 때까지(`unit.skillStateUntil`) 공격하지 않는다. 기절·빙결·수면은 상태를 끝낸다.
    클라 코드 `Character.States.SkillState._StartSkill`(0x7379B0: `BasicSkill.Cast`의 끝 콜백 = 상태 끝), `SkillState.OnTick`(0x737660).
  - `free` = `_switchToState` 0(사일런스 S2·플레임테일 S1·와파린 S2·텍사스 S1 `skcom_charge_cost`): 곧바로 시전, 공격과 무관.
  - **다음 시전**: 스킬 능력이 다시 준비돼야 한다 — `CastSkill.IsAvailable`(0x6459A0) → `Ability.get_isReady`(0x34F6F80: 쿨다운 타이머 + 시전 중 아님).
    능력 시간(`SkillRuntime.castTiming`): `AbstractAnimatedAbility.get_cooldown`(0xA6E680) — `_timeMode` 0 FROM_ATTACK_SPEED = 주인의 공격 간격,
    1 FROM_ANIMATION = `DoAttach`(0xA6D470)가 `_cooldown`에 쓰는 `Entity.GetAnimationTime(_animKey)`(클립 길이), 2 = `_cooldown`, 3 = 블랙보드 `_cooldownKey`;
    행동 길이 = `UpdatePlaybackSpeed`(0xA6E070) 배율(시간 ÷ 클립, [0.1, `_maxAnimScale`]) × 클립(골격에 클립이 없으면 그 시간 그대로).
    `state`는 행동 끝과 쿨다운 둘 다(`_resetAbilityCooldownWhenCastEnd` 1이면 `CastSkill.OnCastFinish` 0x645C10가 능력을 되돌려 행동 끝만), `free`는 쿨다운만.
    버프만 거는 능력(`ActiveBuffAbility`: 쿨다운 = `SetLifeTime` 0xA4CE50의 버프 수명, 여기 해당 스킬은 즉시형)은 SP만 기다린다.
  - 텍사스 S1(`skcom_charge_cost[3]`)은 프리팹 덤프에서 찾음: `CastSkill` sw0 + `ActiveBuffAbility`(`charge_cost` 즉시 버프) → `free`, 간격 = SP뿐.
  - [ASSUMED] `state` 스킬의 효과(키트 `onStart`)는 시전 순간에 둔다 — 클라는 스킬 클립의 OnAttack 프레임(`_waitForAttackEvent` 1)에 낸다. 클립에 없는
    FROM_ANIMATION 키(패신저 S3 `Skill_3` — 골격은 `Skill3`)는 공격 간격으로 셈.
  - 데이터에 `cast`가 없는 스킬(클라 프리팹을 못 읽은 것)은 옛 규칙(틱 시전 뒤 공격 간격 한 번)을 쓴다.
  - 범위 밖: `spec.attack`이 있는 `CastSkill` sw1 4개(솔방울 S1·첼로 S1·머드락 S2·님프 S2)는 지금처럼 「다음 공격에 스킬 공격」.
  - **옛 동작**(2026-10-09 upstream #298 이식, [ASSUMED]): 모든 공격 없는 즉발이 틱 시전 뒤 `nextCastAt = now + 공격 간격`, 시전은 공격이 아니고 공격 리듬은
    그대로. 되돌리려면 `skills.js _paceInstant`에서 `this.cast` 갈래를 빼고(`!c` 갈래만), `_replacesAttack`이 false를 돌려주게 한다.
  - 테스트: `test/sim/instant-cast.test.js`(세 부류 + 실제 경기 경로 引星棘刺 S2), `test/content/bonds_addon.test.js` #298(迅捷 + 引星棘刺 S1 = 매 공격이 투척).

### 보스 포털 (결정 3)
- **규칙**: APPEAR가 없는 네 경로(act1autochess_h07_02 #4, act1autochess_h08_02 #5·#9, act2autochess_h07_05 #6)는 데이터 그대로 —
  DISAPPEAR → WAIT 3 → MOVE … 를 숨은 채로 가고, 경로 끝은 다른 경로 끝과 같다(누수). 숨은 적에는 우리 `portalPickup`(입구 끝 → 출구 3 s)도 적용하지 않는다.
  근거: 클라 코드에 위수 협의 포털 클래스가 없고(경로는 레벨 데이터의 체크포인트 형만으로 움직임) 그 네 경로의 레벨 파일에 APPEAR_AT_POS가 없다.
- **옛 동작**(upstream PR #337, 2026-10-09 이식): `simdata.js normalizeRoute`의 `portalAppear`가 DISAPPEAR(→WAIT) 다음 MOVE 앞에 그 MOVE 목표([5,10])로
  APPEAR를 넣었다(upstream 제보 「进传送门后被判定进蓝门，全程隐身」). 되돌리려면 그 함수(git 이력의 `portalAppear`)를 `normalizeRoute`의 두 반환 앞에
  다시 부르고 `ai.js portalPickup`의 `if (e.hidden) return false;`를 뺀다. 테스트: `test/sim/portal-appear.test.js`.

### 자작 원소 `necrosis` 삭제 (결정 4)
- 엔진이 만든 다섯 번째 원소(12 s 진실 100/s, ATK −20 %)는 공식에 없다(클라 `Torappu.ElementType` = SANITY·WATER·FIRE·DARK; 괴사 = `apoptosis`) — 거는 데이터·콘텐츠도
  없어 지웠다: `constants.js ELEMENTS`·`ELEMENT_ORDER`·`ELEMENT.necrosis`, `damage.js` 폭발 갈래, `buffs.js necrosisBurst`, 유닛 게이지, 원소 합계(锡人 凋敝魂灵 태그,
  哈洛德·纯烬艾雅法拉 합계), 렌더 막대 색·아이콘·링·피해 숫자 종류. 렌더 아이콘 아틀라스 키 `necrosis`(凋亡 아이콘 이름)는 그대로.

### 저항 대상 (결정 4 조사)
- **규칙**: 抵抗이 줄이는 상태 = 晕眩·冻结·寒冷·恐惧·诱导(`buffs.js RESIST_STATUSES`). 클라 코드 `Buff._InitIsStatusResistable`(0x3594440): 버프마다
  `statusResistable` NO/YES/AUTOMATIC, AUTOMATIC은 이상 플래그가 STUNNED·FROZEN·DOZE·ATTRACTED이면 저항 — 우리 풀 스킬 프리팹 버프 586개가 모두 AUTOMATIC.
  寒冷·恐惧는 클라 버프 표(DB, 우리가 읽은 번들에 없음) 값이라 PRTS 「可抵抗状态」를 따른다; 같은 근거로 沉睡·停顿·战栗은 뺐다. 浮空·束缚·沉默·缴械·减速·缚地는
  플래그 없는 AUTOMATIC(데이터)이라 저항 안 됨. 티티 小睡(DOZE, 아군)는 키트의 `addBuff`라 저항 경로 밖(그대로).
- 감쇠: `Buff._PreprocessDeltaTime`(0x35956F0) = dt ÷ max(0.001, 1 − 저항) → 걸 때 지속 × max(0.001, 1 − 저항)과 같다(저항이 도중에 바뀌면 다름 — 작은 차이,
  그대로). `resistOf` 상한 0.95는 그대로 [ASSUMED].
- **옛 동작**: 14개(위 + 沉睡·战栗·浮空·束缚·沉默·缴械·停顿·减速·缚地) [ASSUMED 「키트가 주는 抵抗을 따름」]. 되돌리려면 그 Set에 다시 넣는다.

### 麻痹震颤 (결정 4 조사)
- **규칙**: 麻痹로 공격이 끊긴 적은 모두(막힘·근접·원거리·「不停止移动」) `PALSY_STOP` 0.5 s 동안 움직이지 않고 새 공격을 시작하지 않는다(`ai.js` `palsyUntil`·
  `atkStandUntil`); 기절·빙결·수면·浮空이 오면 끝. 클라 코드 `Enemy.OnTriggerPalsy`(0x727C70) → `Enemy.States.PalsyState.OnTick`(0x74BBC0: `palsying` 버프가
  있는 동안 머묾). [ASSUMED] 0.5 s — `palsying`은 클라 버프 표 값이라 PRTS 术语释义 麻痹 「进入0.5秒的麻痹震颤状态」. `_PlayShaking`의 5 s는 흔들림 연출 길이일 뿐.
- **옛 동작**: 막히지 않은 원거리 적만 `ATTACK_PAUSE` 0.35 s 섬. 되돌리려면 `ai.js enemyAttack`의 麻痹 갈래 두 줄을 옛 `atkStandUntil` 식으로.
- 미구현: PRTS 「或开始动作2秒时被打断」(선딜 2 s 넘는 공격의 2 s 시점 끊김).

### 괴사 손상의 SP 감소와 지속형 스킬 (결정 4 조사, 동작 그대로)
- 클라 코드 `Entity.DoApplyModifier`(0x35F6B50)의 SP 갈래: `SP_MODIFY_STOPPED`면 거부, `spRecoverStopped`(지속형 스킬 중 주인 플래그)는 **증가만** 막는다 →
  감소는 지속 중에도 들어가지만 깎이는 것은 남은 SP뿐이고 지속 시간은 능력 타이머라 줄지 않는다. 1회 충전 지속형은 시전 때 SP가 0이라 결과가 같다 —
  `damage.js`의 「지속 중엔 건너뜀」은 그대로(차이: 충전 2회 이상 지속형의 남은 충전, 스와이어 디 엘리건트 위트 스킬 중 `SP_MODIFY_STOPPED` — 미구현).

