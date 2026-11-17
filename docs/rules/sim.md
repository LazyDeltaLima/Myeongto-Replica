# 전투·경기 규칙 (시뮬레이션·서버)

옛 `docs/LOCAL-PATCH.md`에서 2026-10-09에 나눈 파일이다. 옛 절 이름은 `docs/LOCAL-PATCH.md` 색인에서 찾는다.

## 게임 수치 수정 상세 (2026-10-05)

### 협동 보스 HP
> 0.2.0: upstream이 같은 협동 규칙을 넣어 우리 패치를 뺐다. 싱글은 upstream이 ×1로 바꿨고, 우리는 ×0.25로 되돌렸다가(f11bdabc,
> 관리자 결정 2026-10-07) 2026-10-12에 다시 ×1로 맞췄다(관리자 결정 2026-10-12, 아래 「싱글 보스 HP」). 아래는 기록.
- 원본: 협동은 인원과 관계없이 `bloodPoint[난이도]` 하나, 싱글은 ×0.25. 공식 데이터·PRTS에 인원 계수는 없다(원본 이슈 #113, PR #126 모두 근거 없음을 인정).
- 로컬: 협동 = `bloodPoint` × 최종 공세/히든 코어 시작 때 살아 있는 인원(1~4). 싱글은 원본 그대로.
  - 나간 사람은 서버가 탈락 처리하므로(`Match.onLeave` → `_quit`) 세지 않는다. HP가 0이 돼 탈락한 사람도 빠진다. AI 팀원은 센다.
  - 보스전 도중에 나가도 이미 정해진 풀은 줄지 않는다.
- 싱글 보스 HP (관리자 결정 2026-10-12): `bloodPoint[난이도]` ×1 — upstream(0.2.0~, PR #209)과 같다. 협동이 표 값을 「한 명 몫」으로
  보므로(× 생존 인원) 혼자일 때도 ×1이어야 앞뒤가 맞는다. ×0.25(f11bdabc)일 때는 싱글 보스가 협동에서 혼자 남은 경우의 ¼이라
  인게임보다 빨리 죽는다는 관리자 제보가 있었다.
  - 근거: 공식 `bossInfoDict.bloodPoint*`와 PRTS 「卫戍协议：盟约 下半/PRTS盟约记录」 § 领袖 표는 난이도별 값 하나로 같고,
    싱글/협동·인원 구분이 없다. 풀은 서버 값이라 공식 클라로는 확정할 수 없다(클라에는 `ActAutochessBossEntry` 필드만). 인원 비례
    자체는 플레이어 관찰(PR #209)과 커뮤니티 글 하나(巴哈姆特 12294, 비율 없음)뿐이다 **[ASSUMED]**.
  - 골든: `fields` 싱글 보스 10개, `matches` 싱글 8개 이동. 봇 싱글 험지 1·2와 극한 1이 최종 공세에서 진다.

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
- `bossTurnHpReduceTime` 150 = 초과 시간의 길이(2026-10-10 공식 클라로 확인): `AutoChessBattleUICountdownViewModel._GetBossBattleTimeInfo`가
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
    `Modes/Default/Body/Attack/Selector` `_targetMotion 3`(클라 열거형 `MotionMask` WALK_ONLY 1·FLY_ONLY 2·ALL 3), 능력 문구도 灼燃损伤뿐 → 비행을 치는 것이 맞다, 그대로
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
  참고: S2 blackboard `respawn_time 1`(클라이언트 `utage_s_2[respawn]`, 재배치 시간)은 키트에 없다 — 공식에서도 바뀌는 것이 없어서다(아래 「오퍼레이터 시점·차례 묶음 B」).
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
    秽蚀轰击 지대도 같다. 叙拉古 6은 隐匿(`bonds/nation/siracusa.js` `flags.stealth`, 迷彩 아님)이고 배치 후 공속 버프와 같은 시간만 지속된다. 아군 隐匿은 저지해도
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
| 假想敌：铳 `enemy_9017_achunt` 【最终之罚】 | `TraceEnemy` `_targetMotion 1`, `tileOptions heightType 0`(저지대); 돌진 접촉 피해 `targetMotion 3`; 시전 선택기 `Skills/1` `targetMotion 3` | 「位于低地且防御力最高…（不会选择飞行单位…）」「（包括飞行单位）」 | 추적 대상 아님(비행 유닛뿐이면 시전만 하고 돌진 없음, 2026-10-18), 접촉 피해는 맞음 | `groundTargets`·`areaAllies` — 맞음 |
| 부패의 전차 `nhtank` 일반 공격·秽蚀轰击 | Trigger `_targetMotion 1` + `_heightType 0` | 「只攻击位于低地的我方单位，且不会攻击飞行单位」 | 대상 아님 | `canTarget` `ground && !isFlying` — 맞음 |

    일반 규칙: 선택자는 공중(`targetMotion`)과 칸 높이(`heightType`)를 따로 거르고, 높이를 거르는 선택자는 전부 `targetMotion 1`이라 비행은 늘 빠진다.
    버프 템플릿은 자기 칸 높이만 본다(비행 여부 무관) — 비행 아군은 아래 칸으로 판정 — 공식 클라 `Enemy.get_rootTile` = `m_currentTile`(지금 서 있는 칸), 炎佑는 Enemy 클래스
    (`Character.get_rootTile`은 배치 칸; `Nodes.CheckHeightTypeOfCharacterRootTile.Execute`가 rootTile의 `heightType`을 읽음).
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
  0.2 s마다(`AutoTrigger` → `WaitForFixedSeconds(0.2)`, `constants.js AUTO_TRIGGER_INTERVAL`) 한 번 캐릭터를 돈다
  (`_TryTriggerAvailableSkills`): 블록이 남은 캐릭터는 1 줄이고 건너뛰고, 처음으로 시전한 캐릭터에 `BLOCK_SKILL_TICK` 10틱 블록을 걸고
  그 패스를 끝낸다 → 한 패스에 전투 전체에서 자동 시전 하나, 같은 캐릭터는 11번째 패스(≈ 2.2 s)에 다시 검사. AUTO 스킬은 자동 조작을 타지 않는다
  (`_DoDefaultCheck`: `skillType` MANUAL만) — 스킬 자신의 트리거로 켜진다.
- 기본 전략(`_DefaultTriggerSkill`): 스킬 레벨에 **rangeId가 있으면** 그 칸을 캐릭터 방향으로 돌린 상자 안에 선택 가능한 적(지상·공중, `m_findEnemyTargetOptions`
  `targetMotion` 3 = ALL)이 하나라도 있으면, **없으면** 캐릭터가 공격·저지 상태(`isInAttackState || isInCombatState`)이면 그 자리에서 `UseSkill`.
  상자에 사거리 연장은 더하지 않는다(`LitePhysicsUtil.FindTargetsInBox`). 치유 스킬도 rangeId 갈래는 **적**을 센다(같은 옵션). 데이터:
  `tools/build-data.mjs resolveTrigger` — MANUAL + rangeId → `{ rule: 'DEFAULT', customRangeGrid: rangeGrid }`; 엔진 `server/sim/skills.js autoTrigger`·`_autoDefault`,
  `server/sim/battle/lifecycle.js _autoTriggerPass`.
- TAKE_DAMAGE(12): 배치 때 버프 `autochess_trigger_skill[on_take_damage]`(`_OnUnitBorn`, 형 12일 때 `AddBuffById`)가 피격 순간 스킬을 켠다
  → 엔진 `onDamaged`가 그 자리에서 시전(패스를 기다리지 않음). 그리고 클라 패스는 12를 SEARCH(2)와 같은
  갈래(`_DoDefaultCheck` + `_TrySearchTarget`)로 보낸다. `_TrySearchTarget`은 스킬이 아니라 캐릭터의 **공격 트리거**를 묻는다:
  `Character.attackTrigger`(대체 공격 `IReplacement` 반영)의 `TargetTrigger.Search(false)`가 참이면 시전, 공격 트리거가 없거나 `NeverTrigger`면
  `rangeToShow`의 `TargetSelector.FindTargets`가 하나라도 찾으면 시전. 그래서 TAKE_DAMAGE 스킬은 피격 **또는** 공격할 적(초기 범위 안·저지 중)이 있으면
  0.2 s 패스에서 켜진다 — 엔진 `autoTrigger`: `hurt || _defaultCondition()`(SEARCH와 같은 조건). 이전(2026-10-11 sim6)은 피격만 [추정]이었다.
  핫픽스(DefinedFix.lua en/zh)에 `AutoChessBattleTrigger` 없음. 결과: 근접 重装은 적을 저지하면 맞기 전에 시전(瑕光·蛇屠箱 S1 등),
  중장 편차(深巡·雷蛇·号角·灰毫 → DEFAULT, 余 S2 → SKILL_RANGE, 补位·자선 중장 → DEFAULT)는 2026-10-28 관리자 결정으로 없앴다 — 아래
  「중장 스킬 공식 TAKE_DAMAGE」.
- 패스 순서와 협동 필드(2026-10-29 공식 클라에서 확인): 트리거는 전투당 하나이고 `BattleController.unitManager.characters`(`UnorderedArray`)를
  편을 가리지 않고 돈다 → 联防·협동의 공용 필드는 모든 플레이어의 유닛이 한 패스. 순서는 그 목록 순서 — 배치할 때 끝에 붙고, 빠지는 유닛 자리에는
  마지막 유닛이 옮겨 온다(`UnorderedArray.Remove`). 엔진 `Battle._chars`(`_deploy`가 붙이고 `_remove`가 같은 방식으로 뺌). 패스 중 캐릭터 수는
  시작 때 값으로 돈다. 나머지 갈래(`_TryTriggerSkill`): 1 ALWAYS·2 SEARCH·12 TAKE_DAMAGE·5–9·기본 모두 `_DoDefaultCheck`(MANUAL만) 뒤 조건, 성공은
  `UseSkill`이 참일 때만(실패하면 패스는 다음 캐릭터로).
- 배치 직후(BORN) — 전투 시작 블록 없음(2026-10-29 공식 클라에서 확인, 관리자 요청으로 卫戍协议와 일반 스테이지 차이도 확인): `StartBattle`은
  `m_blockSkillTicker`를 비우기만 하고, 블록은 시전에 성공했을 때만 걸린다. `_OnUnitBorn`은 TAKE_DAMAGE(12)에 버프만 붙인다. 대신 모든 모드 공용인
  `Character.States.BornState`가 배치마다 Born 클립 시간(`PlayBornAnimationAndEffect`; `Consts.CHARACTER_BORN_TIME` 1)을 세고, `CastSkill.UseSkill`은
  주인이 BORN이면 거절한다 — 단 프리팹 표시가 꺼진 스킬만(상태 전환 시전 `_switchToState` 1은 `_canSwitchDuringBorn`, 그 밖은 `_canCastDuringBorn`).
  卫戍协议 배치(`_AutoDeploy` →
  `Deck.SpawnCharacterOrToken(spawnManually: true)`)는 BORN을 건너뛰지 않는다 — 건너뛰는 것은 미리 놓인 유닛(`m_isBuiltPredefined`)이 전투
  재생 전일 때뿐이고, `m_overrideBornTime`은 `ResetBornAnimationAndEffect`만 쓴다. 卫戍协议 스킬 프리팹 전부(2026-10-29 공식 클라에서 확인,
  `tools/local-extract/skill_cast.py` `born`): `CastSkill` 계열 229개 가운데 표시가 꺼진 것은 상태 전환 시전 5개뿐 — 비르투오사 S1 '골든 엑스터시'
  (`skchr_cello_1`), 시빌라이트 에테르나 S2 아득한 미래(`skchr_cetsyr_2`), 노시스 S2 영도 폭발(`skchr_gnosis_2`), 위셔델 S2 가득한 복수심·S3 작열하는
  여명(`skchr_wisdel_2`·`_3`). 나머지 `CastSkill`은 두 표시가 다 켜져 있고, 다른 스킬 클래스(`ReplacementSkill`·`ToggleSkill`·`AppearSkill`·
  `AttachOrDetachSkill`)의 `UseSkill`은 BORN을 보지 않는다. 자동 조작 쪽(`_DoDefaultCheck` → `IsAvailable`·`get_isAffecting`·`get_canCastCheck`,
  `ownerCanUseSkill`)에도 BORN 검사는 없다. 그래서 전투 시작·재배치·소환 모두, 그 5개만 배치 뒤 `BORN_TIME` 1 s 동안 안 켜지고 패스는 다음 캐릭터로
  넘어가며(엔진 데이터 `cast.bornWait`, `skills.js _born`; TAKE_DAMAGE 피격 시전도), 다른 스킬은 첫 패스에 켜진다. 상태 전환 시전은
  `Character.SwitchToSkillState`가 상태 기계를 SKILL로 바꾸므로 BORN을 끝낸다(`SkillState`는 끝나면 IDLE) — 엔진은 그 시전 때 `bornUntil`을 지금으로
  당긴다. 다음 공격 대체형(`ReplacementSkill`)은 BORN 동안 켜져도 그 공격이 BORN 뒤에 나간다. 첫 패스는 0.2 s(코루틴이 먼저 기다림)이고 같은
  패스에서 배치(`_TryDeployAvailableCharacter`, 한 패스에 하나) 다음 시전 검사. PRTS 「作战开始时部署的单位将进入冷却」는 이 BORN이다.
  공식 클라에서 확인(2026-11-07): `PlayBornAnimationAndEffect`는 `_useRealBornTimeFromAnim`이 꺼졌으면 Born 클립을 제 길이의 속도로 틀고, 남은 시간은 재생 함수가 돌려주는 클립 길이 ÷ 속도라 1초다. 켜졌으면 속도 1로 클립 길이만큼이다: 풀의 오퍼레이터(울피아누스·스카디 더 커럽팅 하트·시빌라이트 에테르나·벨로네)는 클립이 1초라 같고, 소환물은 `attackAnim.born`(`token_10012_rosmon_shield` 0.133초·`token_10008_cqbw_box` 0.5초·`token_10015_dusk_drgn` 0.667초 등, `battle/deploy.js`). 공격 기록이 없는 소환물은 공격을 안 하므로 값이 쓰이지 않는다. Born 클립이 없는 모델은 등장 상태가 없다(2026-11-07, 공식 클라에서 확인): `PlayBornAnimationAndEffect`가 `GetAnimationTime` 거짓일 때 `noBornAnimationFallBack`을 바로 부르고, 그것이 `BornState`의 `_OnLocate`라 그 자리에서 IDLE로 간다(`attackAnim.born` 0). 공격하는 소환물 중에는 사일런스의 의료 드론(`token_10000_silent_healrb`, 키 표에 `Born`이 없음)뿐이다. 2026-10-29 같은 날 이 조사 전에는
  모든 수동 스킬이 BORN 동안 기다렸다. BORN 동안은 공격도 시작하지 않는다 — `BornState.OnTick`은
  시간이 다 되어야 IDLE로 넘기고 공격은 IDLE부터라서(2026-10-29 공식 클라에서 확인): 엔진 `ai.js updateAlly`가 `bornUntil` 전에는 휘두름을 시작하지
  않고, 공격 쿨다운은 그동안에도 돈다(배치 때 0이라 BORN이 끝나는 틱에 첫 휘두름). 저지는 건드리지 않음. 2026-10-29 전에는 전투 시작 배치만 2 s 블록이었고
  BORN 동안에도 공격했다.
- 특수 형(2026-10-29 공식 클라에서 확인): GDGLOW_SKILL_2(9, 荒芜拉普兰德·纯烬艾雅法拉 S3) = `_GdglowSearchEnemy` → `UnitManager.enemyCnt > 0`
  — 필드에 적이 하나라도 있으면(선택 가능 여부·은신·공중 무관), 아군 갈래 없음(전에는 선택 가능한 적, 치유 스킬은 다친 아군). CUSTOM_RANGE_SEARCH_ENEMY(7)
  = `_TrySearchWithCustomRange_FindEnemy` → `act2autochess skillRangeDict`의 스킬 범위를 캐릭터 방향으로 돌린 상자 안 적(지상·공중, 같은 `mapLayer`) —
  기존 구현 그대로, 사전에 없는 스킬은 효과 중이 아니면 바로 시전(데이터 10개는 모두 사전에 있음). 「캐릭터 방향」은 배치 방향이다(2026-11-17, 공식 클라에서 확인):
  상자는 `Entity.direction`(`m_direction`)으로 돌리는데, 오퍼레이터가 공격 대상·막은 적 쪽으로 몸을 돌리는 `Entity.FaceTo`는 `m_faceTo`만 바꾸고
  `Character`는 `OnFaceChanged`로 몸 방향을 바꾸지 않는다(그렇게 하는 것은 `Enemy`). 막은 적을 따로 세는 갈래도 없다. 그래서 등 뒤 칸에서 막힌 적은
  이 스킬을 켜지 않는다 — 순찰 경로의 보스가 지마 더 레이징 타이드 옆을 지나 꺾어 들어와 등 뒤 칸에서 막히면, 보스를 막고 있어도 S3 「거침없는 기세」가
  안 켜지는 것은 공식과 같다(#16: 걸어와 닿은 적은 닿은 자리에 붙잡혀 그 칸에 남는다 — 아래 「저지된 적의 자리」). `_FindAlly`(8)는 다치고 치유 가능한 아군 — 쓰는 행 없음.
  MLYSS_WTRMAN(3, 缪尔赛思 모든 스킬) = 본인은 `_DoDefaultCheck` 뒤 공격·저지 상태(`isInAttackState || isInCombatState`)면 시전 — 스킬 범위도 流形 범위도
  안 본다(전에는 流形 범위 안 적도 조건이던 추정). 유동체(流形, 토큰) 갈래는 다르다(2026-10-29 공식 클라에서 확인, 엔진 `content/tokens.js`
  유동체 스킬의 `autoTrigger` → `skills.js autoTrigger`): 스킬이 아직 안 켜졌으면 `_DoDefaultCheck` 뒤 조건 없이 `UseSkill`(SP가 차고 BORN이 끝난 첫 패스),
  켜져 있는데 변신 버프(`mlyssWtrmanTransformBuff`)가 없으면 복사 — `_TryUsingMlyssWtrmanSkill`이 대상 카드의 더미를 유동체 칸에 짓는다
  (`Tile.OnEntityWillBuild`; 공식에서 대기 중인 오퍼레이터를 켜진 유동체 위로 끌어다 놓는 것과 같은 길). 복사도 시전으로 세므로 복사는 시전보다 블록
  (10패스 = 2 s) 뒤에 온다(전에는 스킬이 켜지는 순간 복사). 복사 대상 = `_GetMlyssCopiedTargetInstId`: 정비 말(`battleChessInsts`의 캐릭터 — 필드에
  있든 쓰러졌든, 뮤엘시스 자신도, 공용 필드면 모든 플레이어의 말 — 클라는 플레이어를 거르지 않는다) 중 정비 칸(`ChessInst.pos`, 엔진 `homeR`/`homeC`)이
  `_GetMlyssTokenToGridPosPriority` 최소인 것, 같으면 `battleChessInsts`의 앞(아래 순서):
  우선순위 = |x| + |y|, x = 유동체 행 − 대상 행이 0 이하면 그 값, 아니면 대상 행 + 맵 높이; y = (열도 같은 식, 맵 너비) × 맵 높이 — 유동체의 위·오른쪽
  칸이 먼저, 아래·왼쪽은 가장자리부터 센다. 고른 대상은 유동체 칸마다 전투 내내 고정(`mlyssCopiedChessUid2CopiedChessInstId`: 그 칸에 다시 선 유동체도
  같은 대상). 전에는 필드에 서 있는 가장 가까운 아군(뮤엘시스 제외)이었고 없으면 기다렸다. 클라는 시전 뒤 다음 패스의 자동 배치를 건너뛰지만
  (`m_disableDeployNextFrame`) 이 엔진에서 패스 안 배치는 왕의 바둑돌뿐이라 막지 않는다. 더미를 받는 유동체 스킬 버프(`buff_template_data`
  `mlyss_wtrman_s_begin`의 ON_ENTITY_WILL_OVERLAP)는 그 카드의 스냅숏(`_useCardSnapshot`)에서 생명·공격·방어·마법 저항(비율)과 저지 수·공격 간격을 옮기고
  누구도 거르지 않는다 — 뮤엘시스 자신도 복사된다(공식 테이블에서 확인). `battleChessInsts`의 순서(공식 클라에서 확인 2026-11-12,
  `AutoChessBattleDataModel._LoadBattleChessInsts`: 맵 위 말을 모아 `ChessInst.CompareTo`로 정렬): 캐릭터가 소환물 앞, 그다음 열이 낮은 쪽, 같은 열은
  행이 높은(위) 쪽 — 보스전(`inBossBattleState`)은 좌우 경계 열(레벨 `player_map_lr_boundary_col`, 규정 전 맵 10)에서 먼 쪽이 먼저, 같으면 열이 낮은 쪽.
  곧 이 엔진의 배치 차례(「작전 시작 차례 배치」)와 같다. 맵 너비·높이는 그 전투 맵의 것(8인 넓은 연합 방어 필드는 넓힌 열 수 — 전에는 여기서 계산이
  깨져 유동체 왼쪽의 말이 후보에서 빠졌다). 전에는 같은 우선순위에서 `allyUnits`(만든 차례), 공용 필드는 유동체 주인의 말만이었다.
- 스테인리스 S3 게(글룸핀서호 - 프로토타입, `token_10027_ironmn_pile3`, 2026-11-03 공식 클라에서 확인): 우리 편 소환물이지만 토큰 프리팹이 `_sideType` 2(ENEMY)·
  `_category` 1(DEFAULT)이라 위 상자의 적 옵션(쪽 2·카테고리 1)에 그대로 걸린다 → rangeId 상자에 게가 있으면 적처럼 시전, **치유 스킬도**(같은 옵션);
  rangeId 없는 갈래는 공격 상태 — 우리 공격은 게를 고르므로(적이 다 빠진 뒤, 도발 −2) 게를 치는 유닛은 시전, 치유 공격만 하는 유닛은 아님(禁疗라 환자가
  아님). CUSTOM_RANGE 상자도 같다. 엔진 `skills.js _allyTargetIn`(`Battle.setAllyTarget`으로 등록한 유닛; 지금은 게뿐). upstream(2026-10-08 그쪽 관리자
  규칙)은 치유 스킬과 「자기 공격으로 작용하지 않는 스킬」을 빼고 키트가 `allyTargets`로 고르게 했으나 공식 상자에는 그런 구분이 없어 받지 않음.
  GDGLOW_SKILL_2(`enemyCnt`)도 게를 센다(2026-11-03 공식 클라에서 확인): `UnitManager.Register`가 유닛을 쪽(`side`)으로 나눠 ENEMY면 `_enemies`에
  넣고 `enemyCnt`는 그 수이며, 카드로 놓는 말의 쪽은 `Character.BuildAt`이 `initSideType`(토큰은 프리팹 `_sideType`)으로 정한다 → 게만 있어도
  필드 전체 조건이 참(엔진 `skills.js _anyAllyTarget`).
  발동 판정만이 아니라 **우리 편의 모든 적 선택자가 게를 고른다**(2026-11-11 공식 클라에서 확인, 관리자 결정 2026-11-11 「공식대로」): 선택자는 유닛을
  충돌체로 모은 뒤 `TargetOptions.VerifyTarget`이 `m_targetSideMask & 유닛의 _side`로 쪽만 본다(유닛 종류는 안 봄) → 범위 스킬·스플래시·투사체
  범위·소환물 공격이 모두 게를 고르고, 맞을 때마다 게는 피해를 취소하고 SP 1(受击回复)을 얻는다. 엔진: `battle/queries.js`의 `enemiesInKeys`·
  `enemiesOnTiles`·`unitsInGrid`(적 쪽)·`foesInRadius`가 아군 공격자에게 등록된 게를 더해 돌려주고(`_pushAllyTargets`, 평타는 `ai.js
  acquireTargets`가 게를 적들 뒤로), 적 쪽 선택은 버프 깃발 `enemyCamp`로 막는다(`targeting.js canTargetAlly`·`auraSelectable`; 예전엔
  `untargetable`로 막아 아군 쪽 거르기에서도 빠졌다). 남은 차이: 키트가 `battle.enemies`를 직접 도는 곳(필드 전체 적 등)은 게를 안 넣는다.
  확인 시험 `test/content/op_ironmn.test.js` 「every enemy selection of our side」, 전수(모든 오퍼레이터×스킬을 게 옆에서) 오류 0.
- 알려진 결과: 패스가 휘두름 시작 뒤에 오면 그 휘두름은 원래 쿨다운을 그대로 지닌다(`AbilityStandard.CastToTarget`이 휘두름 시작에 타이머를 다시 검) —
  공속 스킬의 첫 몇 타가 느리다. 결정 1(즉발 시전)의 `cast` 모드(replace/state/free)는 「즉발 스킬의 시전」 절.
- 근거 기록: 비공개 조사 기록 round2 §7, upstream 0.2.3 대조(스킬 발동). 테스트 `test/sim/skills.test.js`, `test/sim/instant-cast.test.js`, `test/local-patch-diy-chen3.test.js`(첸 S3 3-12 공중).
- **되돌리기(옛 잠정 규칙, 2026-10-07 관리자 결정 — 미확정이었음)**: 스킬로 공격 범위가 넓어지는 오퍼레이터는 넓어진 실행 범위 안의 적으로 매 틱 발동
  (`resolveTrigger`가 MANUAL 기본 전략·SEARCH 행 중 실행 범위가 자기 범위를 엄격히 포함하면 `ACTIVE_RANGE` + 실행 범위 grid, MANUAL + 자기 技能范围면
  `SKILL_RANGE`; 나머지 DEFAULT = `onAboutToAttack` 「다음 공격 직전」), 자동 조작 간격 `AUTO_OP_COOLDOWN` 3 s(PRTS 「自动操作具有3s冷却」, `opReadyAt`),
  틱당 시전 수 제한 없음, TAKE_DAMAGE는 피격 즉시. 되돌리려면 `tools/build-data.mjs resolveTrigger`(ACTIVE_RANGE·SKILL_RANGE 부여, `activeAttackGrid`·
  `strictlyContains`), `server/sim/skills.js`(`autoOp`이면 tick/onAboutToAttack 시전 안 함 → 되살림, `blockTicks` → `opReadyAt`), `battle/lifecycle.js _autoTriggerPass`
  삭제, `constants.js AUTO_OP_COOLDOWN` 3. 엔진 규칙 `ACTIVE_RANGE`·`SKILL_RANGE`는 키트용으로 남아 있다(비비아나 S3 등; 외근 의료 Touch는 2026-10-29부터 데이터 DEFAULT — 「오퍼레이터 스킬 발동 시점 묶음 C」).

### 스킬 프리팹의 대상 트리거 (2026-11-17, 공식 클라에서 확인)

「오퍼레이터 키트」 절 「글래디아 S3는 범위 안에 고를 적이 있어야 켜진다」의 전수. 자동 조작(`_DoDefaultCheck`)은
발동 규칙이 무엇이든(DEFAULT·SEARCH·ALWAYS(SP_FULL)·스킬 범위 모두) `CastSkill.get_canCastCheck`를 묻고, 스킬 프리팹 `CastSkill`의 `_trigger`가
있으면 그 `Search(false)`가 거짓일 때 켜지 않는다. `SelectorTrigger`는 같은 게임오브젝트의 첫 선택자 컴포넌트(`Awake`의 `GetComponent<TargetSelector>`)로
찾고 `_minTargetNum`보다 적으면 거짓, `NeverTrigger`는 늘 거짓이다. 범위 상자 `AutoLoadBoxRange`는 스킬 능력의 범위(`Ability.rangeId` =
`BasicSkill.AssignData`의 스킬 `rangeId`, 없으면 유닛 기본 범위)를 충돌체로 보고, `_extendable`일 때만 공격 범위 확장을 더한다(`ConstBoxRange`는 제 `_rangeId`).
풀 `CastSkill` 가운데 `_trigger`가 있는 것 36개(수동 24개; 자동 스킬은 자동 조작을 타지 않음): 적 선택자(`AdvancedSelector` 계열, 적·`_targetMotion` 지상 1/공중 2)가
대부분이고, `BlockedOrAdvancedSelector`(데겐블레허 S2·S3, 아이린 S2, 리 S2)는 막은 적을 범위와 상관없이 먼저 넣으므로 등 뒤에서 막은 적도 대상이다.
홈바운드 S1·S2, 쏜즈 더 로드스타 S2, 틴맨 S2는 첫 선택자가 `SelfSelector`라 늘 참, 이그제큐터 디 엑스 포에데레 S2·S3은 `SelfSelectorInCertainCondition`(자기에게
`excu2_in_multi_attack` 버프가 없을 때). sim: `tools/local-extract/skill_cast.py` `trig` → `tools/build-data.mjs` `cast.trig` → `skills.js _trigFound`
(키트 `castCheck`가 있으면 그것). 트리거가 잡은 첫 대상(선택자 `_postFilter` 순서, `trig.post`)은 스킬 능력을 시전하는 대상이기도 하다 — 몸 돌리기,
render.md 「공격 방향」(`skills.js trigTarget`). 엔진이 따라 하지 않는 선택자는 참으로 둔다 — 아군 선택자(체스트넛 S1, 파피루스 S2, 쏜즈 더 로드스타 S3)·타일 선택자
(Miss.Christine S2)·하위 클래스 필터·다른 자기 조건, 목록과 이유는 시험 파일에 [추정·미조사: 선택자 필터를 읽지 않음]. 선택자의 `_abnormalFlag` 조건과
능력 범위를 바꾸는 모듈(`UnitDataFlowConfig.Delta` `rangeId`)도 안 봄 [추정·미조사]. 이 전수로 바뀐 것은 규정 시즌의 ALWAYS 스킬(데겐블레허 S3·패신저 S3·
아이린 S3 등)이 SP가 차도 범위 안 대상(데겐블레허는 막은 적 포함)이 생길 때까지 켜지 않는 것이다 — 맹약 시즌 DEFAULT 스킬은 규칙이 이미 같은 대상을 요구했다.
재발 방지: `test/sim/skill-trigger.test.js`(전수 + 예외 목록), 추출기에 모르는 모양이 오면 `build-data.mjs`가 멈춤(원인 제거 — `skill_cast.py trigger_entry`가 읽음).

## 중장 스킬 공식 TAKE_DAMAGE — 관리자 결정 2026-10-28 「공식대로」
- 규칙: 수동(MANUAL) 중장 스킬은 모두 공식 `act2autochess skillTriggerDataList`의 TANK 행 `TAKE_DAMAGE`를 따른다 — 선발(자선) 중장과
  补位 预备干员-重装·Mechanist도. 시전 조건은 위 「스킬 범위 발동」의 TAKE_DAMAGE: 피격 순간(방향 무관) **또는** 0.2 s 패스에서 공격할
  적(초기 공격 범위 안, 저지 중인 적 — 범위·방향 무관). `tools/build-data.mjs resolveTrigger`에 공식 행과 다른 규칙은 이제 없고,
  `validateAll`이 TAKE_DAMAGE 행을 다른 규칙으로 바꾼 기록을 막는다.
- 없앤 편차와 바뀐 점:
  - 深巡(언더플로우) S2 행동능력 박탈: 스킬 범위 3-2(정면 4칸) 상자 → 피격·2-2 안 적·저지. 관리자 제보(2026-10-28): 뒤에서 맞거나 뒤쪽 적을
    저지해도 안 켜졌다 — 뒤에서 온 적은 중심에서 약 0.7칸 뒤(뒤 칸)에서 저지돼 상자 밖이었다. 정면 4번째 칸만 있는 적으로는 이제 안 켜진다.
  - 雷蛇(레이즈) S2, 灰毫(애쉬락) S1·S2, 号角(혼) S2·S3, 补位 预备干员-重装·Mechanist 전 스킬: rangeId 없음 → 공격 상태 조건은 같고 피격 시전만 더해짐.
    雷蛇 S2 키트의 `trigger: 'DEFAULT'`(PR #12 줄)도 지움.
  - 余(위) S2 厚礼上宾: 스킬 범위 x-1 안의 적(SKILL_RANGE, 2026-10-04 GitHub #32 item 1) → 피격·자기 칸(0-1) 안 적·저지. 공식처럼 원거리
    피격으로 끌어올 적 없이 켜질 수 있다(#32 item 1이 불평한 그 동작).
- 근거: 편차들(2026-10-03 issue #4·PR #12, 2026-10-04 #32, 2026-10-05 补位)은 TAKE_DAMAGE를 「맞을 때까지 기다림」으로 읽던 때 만들었다.
  2026-10-11 공식 클라 확인으로 TAKE_DAMAGE도 공격할 적이 있으면 켜진다는 것이 밝혀져(위 절), 편차는 피격 시전을 빼는 것만 남았다.
- 테스트: `test/sim/feedback1-tank-triggers.test.js`(데이터 전부 TAKE_DAMAGE, 深巡 뒤쪽 피격·저지 실제 대전 경로), `test/data.test.js`,
  `test/backups.test.js`, `test/content/standin*.test.js`. 되돌리려면 git에서 `TRIGGER_DEVIATIONS`·`STANDIN_TRIGGER_DEVIATIONS`를 되살림.

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
  弧光锋卫 출혈은 失衡 동안 0.066 s마다 400 — 失衡을 1초마다 확인해 켜고 끔(2026-11-14, 아래 「새 종류 정예」 빙원 가드 줄). 기절이 아님(상태 없음, SP·쿨다운 흐름). 벽에 막힌 밀기는 막힌 곳에서 끝남(아래 「盟约·특질·장비·생성기 2라운드」 失衡 항목,
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
  (`Battle.onFieldBoard`, upstream 주인 결정 2026-10-07 — 2026-10-10 공식 클라로 확인·일부 바뀜, 아래 「卫戍协议 버프 그래프」; 혼자인 연합방어의 빈 절반·솔로 보스 필드의 다른 절반·손패/임시 정비
  구역 줄은 그대로 막힘; 울피아누스 S3 【移动】은 `onOwnBoard` 유지. upstream의 0.2.1 설계 절(§26.1)·`docs/history/0.2.1.md`는 우리에게 없어 주석은 이 절을 가리킴) ·
  은신(隐匿) 지상 적에게도 점프, 사거리 안 은신 지상 적은 「范围内没有敌人」을 깸 `350de2c0` ← `48a2d37e`(GitHub #316, upstream 주인의 공식 게임 관찰
  2026-10-08 — 은신 쪽은 2026-10-10 공식 클라로 확인, 「사거리 안」은 공식 「자기 칸+앞 칸」으로 바뀜). 관리자 결정 2026-10-09(두 가지 모두 받음).
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
upstream v0.2.3과 그 뒤 미병합 PR 가운데, 우리에게도 같은 버그가 있고 공식 근거와 어긋나지 않는 것(비공개 비교 기록 — 공식 클라 대조와 그
5차 구현과의 중복 점검 포함). 커밋 메시지에 upstream 해시를 적는다. 5차가 이미 고친 것(赤刃明霄陈 S3 공중 발동, 赫德雷 S2 원소 손상, 克莱门莎 전략의
켜진 맹약 조건)과 플레이어 결정 대기(전략 차례 50 s 등)는 뺐다.
- **`708caf7d` 중 전투 4건 + 문구** (PRTS 근거, upstream 설계 기록 28.25):
  - 「N번째 공격마다 기절」 적(粉碎攻坚手·码头水手, `archetypes.js nthAttackStatus`)이 그 타격으로 쓰러져 곧바로 다시 배치된 오퍼레이터(不屈·M3茧甲)에는 기절을 걸지 않는다 —
    `ai.js enemyAttack`이 `attack` 훅에 `targetDeployments`(타격 순간의 `deploySeq`)를 넘김.
  - 음유시인 지속 회복(`professions.js installBard`, 浊心斯卡蒂 키트의 특성 전환)은 기절 중에도 계속된다(오라). 클라 근거: 회복은 프리팹 능력
    `AuraAbility`가 붙이는 버프이고, `Entity.OnTick`·`AuraAbility.OnTick`에 기절 검사가 없다(관리자 노트, 그 밖의 호출 2개는 이름 미확인).
  - 黄沙罗盘(+萨尔贡浓茶)의 SP는 阻回(`noSp`)와 지속 스킬 중 잠금을 무시한다 — `skills.js gainSp(…, { ignoreLock })`. 클라: 템플릿
    `act1autochess_acarm103_buff`의 `ModifySp` 셋 모두 `_forceFlag` → `SpController`가 `spRecoverStopped` 검사를 건너뜀. `init_sp`는 원래 `'init'`이라 같음.
  - 가상적 铳 【未尽的告解】: 다른 铳이나 碎铳之簧 중 하나라도 있으면 감쇠, 없으면 바로 해제, 피격 때도 다시 판정(첫 타격·동료가 사라진 직후).
    → 2026-10-17 공식 클라대로 바뀜: 아래 「假想敌：铳 【未尽的告解】 감쇠 대상」.
  - 렌더러를 못 불러온 토스트: 「기기가 3D 불가」 → 「잠시 못 불러옴, 새로고침」(en·ja·zh-TW·ko).
  - golden: `fields` boss-boss_4-solo(음유시인 회복이 기절 중에도). 테스트 `test/content/community-round26.test.js`(upstream), `enemies_bosses` 铳 감쇠.
- **蕾缪安 수배** (`85b694f2`, GitHub #428, PRTS): 수배 타이머는 이 오퍼레이터마다(출처별) 따로 돌고, 처음 셀 때만 선택 가능해야 하며, 붙은 뒤에는 이어서
  라테란 범위 안에 있는지만 본다. 그녀가 퇴각·쓰러지면 그녀의 타이머·표식만 지운다. 수배 칸은 공격 범위(엔진 추가 사거리)와 함께 스킬 발동 범위
  (`addTriggerRange`)에도 들어간다. 스킬 자동 발동(위 절)은 초기 사거리만 보므로, 이 줄이 없으면 수배 대상만 있을 때 공격 중이어도 스킬이 켜지지 않는다.
  upstream이 뒤에 붙인 `attackOnly`(다음 평타 때만 확인, `f3658a0d`)는 공식 「0.2 s마다 곧바로」와 반대라 받지 않았다.
  golden: roster 016·018·035·036·045, fields boss_1·5·7-pair·hidden-boss_9-pair(모두 蕾缪安이 있는 판). 테스트 `test/content/lemuen-wanted-023.test.js`(upstream).
- **远牙가 준 특질의 傀儡师 몸 바꿈** (`3f19b598`, GitHub #415·#429, 플레이어 확인): 远牙가 준 `garrison_108_a/b`는 傀儡师가 <替身>으로 바뀔 때·<本体>로
  돌아올 때(`dollSwap`)도 층을 얻는다(부여량·배치당 상한·켜진 맹약 확인은 그대로). **[추정 — 미확인]** 관리자 노트: 공식에는 「远牙가 준 것만」이라는
  구분이 없고, 배치 때 발동하는 특질 템플릿 `act2autochess_gar_event_onstart`(ON_BUFF_START)는 몸 바꿈 때 버프가 다시 시작되면 다른 배치 때 특질(106·107·124·143·155)도
  다시 발동할 수 있다. 버프 재시작 여부는 C#에서 못 읽어 upstream 범위대로 둠. golden 변화 없음. 테스트 `test/content/fartooth-doll-swap.test.js`(upstream).
- **塞雷娅 S1 急救는 적이 없어도** (`e86c7c83`, GitHub #406, PRTS): 스킬 범위의 HP ≤ 절반 아군이 있으면 적이 없어도 시전하고 그녀의 다음 공격이 치료가 된다.
  침묵·공격 간격은 그대로. 클라: AUTO 스킬이라 모드 자동 발동을 타지 않고 `NextAttackOrCombatSkill`이 아군만 찾는다(적·공격 상태 조건 없음).
  upstream의 黍·凯尔希·思衡托 부분(`triggerEnemies`)은 우리 풀에 없어 뺐다. 테스트 `test/content/heal-triggers-023.test.js`(upstream의 塞雷娅 케이스).
  **시전 시점은 2026-10-29부터 공식대로** — 아래 「오퍼레이터 스킬 발동 시점 묶음 B」 B1.
- **假想敌：管의 “余音” 펄스 큐** (`f3658a0d` 중 `bosses.js echoHit`): 피격 펄스 ↔ 반격(벤델라 등)이 서로 동기로 불러 훅 깊이 32 제한에 걸리던 것 → 펄스를 쌓아
  지금 펄스 뒤에 FIFO로 처리(치명타가 만든 펄스도 유지, 타이머·난수 추가 없음). **[ASSUMED]** 순서(upstream도 [ASSUMED]). golden: `fields` hidden-boss_10-solo.
  테스트 `test/content/echo-counter-023.test.js`(upstream).
- **浊心斯卡蒂 S1 × 坚守 2단계 되넘김 금지** (upstream PR #464 by @HappyTanuki, 원본 커밋 `e9a2e27c`): 한쪽이 옮긴 피해는 다른 쪽이 다시 옮기지 않는다(전에는 둘이
  서로 넘겨 훅 깊이 제한까지 갈라져 전투가 멈춤). 클라 근거: 두 분담(`DamageSplit`, `AutoChessDamageSplit`)이 옮긴 몫에 `SharedFlag 7 SKIP_MODIFIER_EVENT`를
  붙여 어느 ON_TAKE_DAMAGE 그래프도 다시 보지 않는다. upstream v0.2.4가 손본 판(`6bfc0827`: 분담 효과마다 첫 적용은 허용, 몫 보존)은 이 점에서 공식과
  달라 원본 PR을 가져왔다. golden 변화 없음. 테스트 `test/content/skadi2-stead-loop.test.js`(PR).
- **밀린 적은 미는 쪽을, 당긴 적은 원래 방향을** (`4980ee78`, GitHub #418·#427을 공식 클라대로 고침, 렌더만): upstream은 밀기·당김 모두 「원래 방향 유지」
  (기여자 영상 野鬃 S2·莫斯提马 S3·歌蕾蒂娅 S1/S2)였다. 공식 클라: `Enemy.KnockBack`은 changeFaceByDirection이면 `FaceTo(-direction)` — 미는 쪽을
  봄. 밀기 노드 `Nodes.Knockback`·`KnockBackWithDirection`은 true, `KnockBackWithCharacterDirection`은 `!_dontChangeFaceByDirection`(기본 false)을
  넘긴다. 당김 `Nodes.DragTowardSource`는 false, 갈고리 `Enemy.BeginPull`/`StillPull`/`EndPull`은 방향을 안 바꾼다. 그래서 `displace` fx의
  `face`: 밀기 'push'(미는 쪽 = 이동 반대, 좌우 성분이 없으면 그대로), 당김 'keep', 그 밖의 직접 이동은 없음(이동 방향). 미끄러지는 동안 스냅숏 속도로
  뒤집지 않는다(`render/units.js slideTo`). upstream 영상은 적이 원래 미는 쪽을 보고 있던 경우라 두 규칙이 같아 보였다. 전에는 밀기·당김 모두 이동 방향을
  봤다(둘 다 공식과 반대). **[ASSUMED]** 薄绿 S2의 안쪽 밀기도 같은 노드(그녀 반대쪽을 봄). golden 변화 없음. 테스트 `test/render/unitview.test.js`·
  `test/sim/displace-fx.test.js`.
- **松果 S2 공격 단계는 배치마다 처음부터** (upstream PR #462 by @Xinglan233, `8ebdcf5d`, PRTS 松果 S2 备注): 단계 카운터를 `unit.mem.pinecnS2Uses`로 따로 두고
  배치 때 0으로(엔진 `activations`는 누적 그대로). 클라: 카운터 `PassiveOneOfBuffAbility.m_attachCnt`가 `DoSetData`에서 0이 된다(재배치 때 다시 불리는지는
  추적 안 함, 관리자 노트). golden 변화 없음. 테스트 `test/content/kits_pinecn.test.js`(PR).
- **家族徽章 + 叙拉古正装: 은신이 풀린 직후 첫 타** (upstream PR #461 by @Xinglan233, `a173a470`): 은신 해제를 0.25 s 성장 주기가 아니라 피해 순간에 읽는다.
  전에는 해제 직후 첫 타가 다음 주기 전에 들어가면 추가 진피해가 빠졌다. 연속 타격이 같은 처리에 다시 들어오기 전에 보너스를 먼저 소모한다.
  golden 변화 없음. 테스트 `test/content/family-crest-timing.test.js`(PR), `items.test.js`.
- **深池逐火 余烬/火灰: 막힌 채 쓰러져도 새 余烬은 은신으로 시작** (upstream PR #465 by @CXUtk, `78032541`): 전사의 저지를 먼저 풀고 余烬의 은신 버프를
  붙인다(`archetypes.js husk`). 전에는 반대 순서라 그 저지 끝이 새 은신을 3 s 꺼서, 막아 주던 오퍼레이터가 다음 적을 잡아도 원거리·스플래시가 余烬을
  약 2 s 칠 수 있었다(0.1.2 §22.8의 **[ASSUMED]** 순서, 「죽지 않는 은신 적」 제보 대응). 클라 근거(EN 클라, 레포에는 이름만):
  `Enemy.DoFakeDeath`가 `Enemy.ReleaseFromBlocker`(→ `Character.RemoveBlockee`)를 먼저 부르고, `Enemy.States.RebornState`는 그동안
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
  폭탄 전투 프리팹의 category 값은 못 봄(관리자 노트 — **[추정]** TRAP_OR_ITEM).
  sim-3 이식 「은신·수면 적 위에서 안 터짐」(`CHAMPAGNE_TRIGGER`)은 그대로다(`test/content/feedback7-champagne-stealth.test.js` 통과).
  golden: bonds bond-yanShip-high(活性源石 위 폭탄에 치료사가 치료를 쓰던 판). 테스트 `test/content/feedback7-champagne-hold.test.js`(upstream v0.2.4 판 + 실제 대전 경로 1건).
- **香槟炸弹은 琳琅诗怀雅와 함께 떠난다** (upstream `23b1279d` — PR #872 by @zasx77771의 좁은 이식, upstream #871; 관리자 결정 2026-11-15 「받음」, 손 이식):
  스와이어 디 엘리건트 위트(琳琅诗怀雅, `char_1033_swire2`)가 쓰러지거나 철수하거나 영구 철수하거나 연합 방어 시작 때 강제 퇴장(`FORCED_EXIT`)하면, 필드에
  남은 그녀의 샴페인 폭탄(`token_10031_swire2_gdtrap`)이 모두 `expired`로 떠난다(`tokens.js champagneLeavesWithOwner` — 폭탄마다 걸어 그녀의 키트 폭탄과
  소환물 키트 폭탄 둘 다). 그녀가 떠난 같은 틱 뒤에 놓인 폭탄은 `death`를 못 받으므로 제 배치 때 바로 떠난다. 다른 플레이어의 폭탄은 그대로.
  근거(공식 클라에서 확인 — upstream은 근거 없는 추정으로 둠): S2 스킬 프리팹 `skchr_swire2_2`의 추가 능력(`ExtraAbility0`)이 그녀에게 버프 `swire2_skill_2[kill]`(템플릿
  `die_to_kill_token` — ON_OWNER_FINISH → KillTokens, 조건 없음)을 건다. 망·미틈·에벤홀츠·W와 같은 길이다. 스킬의 추가 능력은 배치 때 붙고 스킬이 끝나도
  떼지 않으며(`BasicSkill.OnBorn`·`OnSkillEnd`), ON_OWNER_FINISH는 퇴장 이유와 상관없이 돈다(`Entity.OnFinish` → `Buff.OnOwnerFinish`). 내구 규칙(위 줄)은 그대로다.
  upstream의 엔진 전체 소환물 회수(`_recallSummons` + `KEPT_ON_OWNER_EXIT`)는 키트들의 주인 퇴장 훅과 겹쳐 받지 않음(upstream과 같은 판단).
  golden: roster-008(폭탄이 끝까지 남지 않음 — upstream도 같은 판이 움직임), 규정 golden 그대로. 재발 방지: `test/content/r81-champagne-owner-exit.test.js`(upstream 판, 규정 선발 건 뺌 + 실제 대전 경로 1건).
- **외근 의료(外勤医疗, 전략)의 맵 캐릭터는 어그로 순서가 오퍼레이터보다 앞** (upstream PR #451 by @YinqiMargatroid, `3b57f727`): 예비 오퍼레이터-메딕(预备干员-医疗)
  또는 Touch(정예 2명 이상)는 우리 sim에서 `battleStart` 때(정예 수를 센 뒤) 만들어지지만 `aggroSeq`를 맨 앞(−1)으로 둔다(`Battle.spawnToken preBattleAggro`,
  `tokens.js spawnMapChar`, `bands/battle.js installMapChars`) → 같은 도발 단계면 적이 오퍼레이터를 먼저 고른다. 배치 이벤트·`deploySeq`는 그대로.
  upstream v0.2.4는 표시 부분만 받고 「어그로 순서는 그대로」였다 — 관리자 결정 2026-10-11로 PR 원본을 받음. 클라 근거(EN 클라, 레포에는 이름만): 이 둘은 레벨
  predefine이고 `BattleController._CreatePredefinedCharacter` → `Character.BuildAsPredefined` → `Character._BuildAtInternal`이 `m_createdTime =
  fixedPlayTime`을 찍은 뒤 `Character.UpdateHatred`(아군 위협도 = 생성 시각 기반 + 도발 단계)를 부른다. predefine은 레벨을 불러올 때
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
  클라에 없고, 클라 막대는 표 `autoChessData.enterStepList` `BAND_CHECK` `time` 50 / `hintTime` 15로 그린다(관리자 노트의 공식 클라 대조). 그전 30 s는 플레이 제보
  #4로 정한 [ASSUMED]였다. 클라 카운트다운은 서버의 `m.public.draft.turnSeconds`를 쓰고, 그 값이 없을 때의 기본값(`gameLogic/phases.js`·`server/match/gamedata.js`)도 50.
  golden 변화 없음(협동 golden 매치의 차례는 AI 좌석이라 곧바로 고름). 테스트 `test/match/draft.test.js`·`test/ui/bandDraft.test.js`·`test/docs-consistency.test.js`.
- **공용 카드 풀 = 공식 측정 표, 협동 ×2, 拟态物质는 풀이 비어도** (GitHub #430·#485; upstream PR #477 `fa9da2d8`과 v0.2.4 `6bfc0827`의 풀 부분을 비교해 섞음).
  근거: 路标档案馆 「路标月报 #2」(bilibili BV1eLXXBqEgF, 2026-03-29) 표 — 두 upstream 판이 같은 영상, 같은 숫자를 인용. 공식 표(activity_table act2autochess)와
  공식 클라에는 풀 수가 없다(서버 규칙. 클라의 `chessPool`은 자기 분대 설정).
  - 수: 独立模拟(솔로) 12/14/18/16/8/5 + 예외 Ⅰ 普罗旺斯·德克萨斯·跃跃·古米·格雷伊 10, Ⅱ 风丸 8, Ⅱ 赫默·休谟斯·砾·蒂比·调香师 12. 同盟模拟(협동)은 그 ×2(예외 포함,
    인원과 무관, `economy.coopPoolMultiplier` 2). 缪尔赛思 4 예외는 시즌 1 영상(BV1JWy3BkEpt, 2025-11-18)에서 온 것이라 뺐다(이번 시즌 표는 Ⅵ 모두 5).
    예외는 `tools/build-data.mjs`가 이름 → 일반 말 id로 찾는다(이름이 없으면 빌드 실패). 두 판 모두 같음.
  - 선발(自选) 슬롯의 개인 재고: 협동에서 공용 풀과 같이 ×2 = 16/10(관리자 결정 2026-10-11, PR #477과 같음 — 처음 이식은 v0.2.4대로 8/5였음).
    공용 풀만 ×2면 협동 상점에서 선발 몫이 솔로의 약 절반이 되므로, 선발 몫을 솔로와 같게 둔다. 영상 표에는 선발 행이 없고(upstream 0.2.4 기록 §29.8),
    공식 클라에도 풀·재고 수가 없다(상점은 서버, `GetChessSquad(chessId, playerIndex)`는 플레이어별 오퍼 대응만) → **[ASSUMED]**(선발 재고 자체가 원래 [ASSUMED], `diy.md`).
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
    공식 근거 확인: 공식 표(activity_table act2autochess `trapChessDataDict`·`trapShopChessDatas`·`constData`)에 재고 필드 없음, 공식 클라의 상점 상태
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
- 근거: 영상 「卡池相关机制」 7번 — 诗怀雅·卡涅利安·耶拉·缪尔赛思가 얻는 장비 수에는 상한이 없다. 공식 표·클라에는 재고가 없다(서버 규칙, 위 D8).
- 동작(PR 그대로): 표의 `SERVER_GAIN_EQUIP` 특질이 주는 장비 — 盟约之币(诗怀雅, 특질 133) · 迅捷作战粮(卡涅利安·蜜蜡, 같은 특질 49) · 谢拉格不融冰(耶拉, 92) ·
  变形同构体(缪尔赛思, 76)와 그 고급 — 를 `GameData.isTraitFixedItem`으로 알아보고, 그 특질의 지급과 같은 장비를 주는 전략 지급
  (`preparation_start_gain_chess_from_round`, 곧 变形者集群)은 재고 검사를 건너뛰고 말에 `noPool`을 달아 재고를 차지하지 않는다(`SharedItemPool.held()`가 건너뜀).
  상점 구매·다른 효과 지급은 같은 장비라도 그대로 재고에 묶인다. 전략의 `requirePool: false`를 장비에 그대로 넘기지 않는 것도 PR 그대로 — 그러면
  马克维茨(전략)의 商业包装方案 세 번째가 풀린다(#466).
- 蜜蜡(오퍼레이터)는 卡涅利安과 같은 특질(`garrison_49`)이라 같이 면제된다. 영상 7번 목록에는 蜜蜡가 없다 — PR은 특질 정체로 정해 넷 + 蜜蜡가 된다 **[ASSUMED]**
  (영상 목록이 卡涅利安만 든 것은 같은 특질의 대표로 읽음).
- **[ASSUMED]**(PR): 면제 장비끼리만 합친 고급이 면제를 이어받고, 산 것과 섞어 합치면 재고를 센다 — 산 것의 몫만(1칸, 고급 말의 `poolHeld`,
  `SharedItemPool.copiesOf`; 2026-10-22까지는 2칸이라 재고 상한 1인 맞춤 규칙 판(`custom-pool.test.js` 협동 판, 谢拉格不融冰)에서 상한을 넘었다).
  면제 장비의 整备는 두 번째 재고 칸을 기다리지 않는다.
- 풀에서 뽑는 특질(洛洛 91 `SERVER_POOL_EQUIP`, 焰尾 149 `SERVER_POOL_CHAR`)과 R11 상점 이벤트의 盟约之币 칸 등 다른 경로는 그대로 재고에 묶인다(PR 그대로).
- 테스트 `test/match/shared-stock.test.js`(PR의 셋 + 다섯 오퍼레이터가 바닥난 재고에서 각자 장비를 받음). golden 변화 없음.

### 상점에 이미 뜬 오퍼레이터 카드는 재고가 0이어도 산다 (관리자 결정 2026-10-11, GitHub #498)
- 근거: 영상 ~2:55 — 넷이 함께 한 상점 갱신 실험에서 星源(오퍼레이터) 카드가 아홉 장 동시에 떴고 모두 사서 팀이 13장 이상을 가졌다(재고를 넘음).
  재고는 상점이 새로 뽑는 것만 거르고, 이미 뜬 카드의 구매는 막지 않는 것으로 읽음. 공식 표·클라에 재고가 없다(서버 규칙, 위 D8).
- 동작: `economy.js buy`의 오퍼레이터 칸 재고 검사(`pool.left < need` → `SOLD_OUT`)를 뺐다. 구매는 지급과 같이 `acquireChess`의
  `take(…, { overdraw: true })`로 복사본을 차지해, 내부 잔고가 음수가 되고 `left + 소유 = 상한` 불변식은 그대로(위 D8 「소유는 늘 정해진 수를 차지」와 같은 길,
  `pool.js` 머리 주석). 공개 `left()`·굴림은 0으로 자르므로 재고가 바닥난 카드는 새로 뜨지 않고, 한 장 팔아도 소유가 상한 위면 다시 안 뜬다. 얼려 둔 칸도 이미 뜬 카드.
- **[ASSUMED]** 영상에 없는 것: 선발(自选) 칸과 그 개인 재고(`DiyStock`)에도 같은 규칙. 보상 제시(승급 보상·특수 갱신·아이템 제시, `prep.js pickReward`)의
  오퍼레이터 카드는 바꾸지 않음 — 재고가 0이면 그대로 `SOLD_OUT`(영상은 상점 카드만 보여 줌).
- 바꾸지 않음(보고만): 상점에 뜬 **장비** 카드는 재고가 0이면 그대로 `SOLD_OUT`(#498 댓글의 「장비도 같을 것」은 개인 의견, 영상 근거 없음).
- AI: 전에는 재고가 0인 오퍼레이터 칸을 사려다 `SOLD_OUT`으로 그 준비 단계의 쇼핑을 멈췄는데, 이제 산다(`bot.js`는 바꾸지 않음).
- 테스트 `test/match/shared-stock.test.js`(협동 둘이 같은 카드를 마지막 한 장에서 둘 다 삼, 내부 잔고 −1, 그 카드는 더 안 뜸, 보상 제시는 그대로 `SOLD_OUT`),
  `test/match/economy.test.js`(재고 0에서 구매 → 잔고 −1, 팔아도 다시 안 열림)·`test/match/diy-shop.test.js`(선발 재고 0에서 구매)는 맞는 쪽으로 고침. golden 변화 없음.

### 谢拉格不融冰(쉐라그 만년빙)은 모든 피해 출력에서 굴림 (GitHub #489)
- 근거: 클라 버프 템플릿 `act1vautochess_acarm003_buff` = `ON_OUTPUT_DAMAGE` → `Dice(prob)` → `c2e_cold`(대상에게). 평타 이벤트가 아니라 피해 출력마다다.
  제보는 阿斯卡纶(선발 오퍼레이터) 재능의 초당 피해에 안 걸린다는 것. upstream은 아직 안 고침.
- 동작: `items/effects/status.js chess_item_5_02_e`가 `onAttackEnemies`(평타 대상마다) 대신 `onDamageEnemies`(피해 한 번마다 — 평타·스킬·범위 피해의 대상마다·지속 피해,
  元素损伤·아이템 발동 피해·처치타는 빼는 우리 공용 도우미, 催泪瓦斯·突袭手雷와 같음)로 굴린다. 확률·寒冷 시간(일반 12 % / 1.5 s, 고급 20 %)은 그대로.
  회피된 평타는 피해가 없으니 이제 안 굴림.
- 테스트 `test/content/items.test.js`(「every damage instance procs」에 일반·고급 추가 — 평타 없이 스킬 범위 피해 두 번에 寒冷). golden은 이 장비를 든 전투가 움직임
  (커밋 메시지·보고에 사례 목록). 그중 roster-047(仇白이 일반·고급 둘 다 듦)은 초반 37 s의 동결 한 번에서 갈라져 판이 뒤집힌다(처치 140 → 77) — 장비 동작의
  오류가 아니라 같은 시드의 연쇄 차이로 확인(寒冷 적용 10 → 23회, 동결 적 시간 0.4 s → 7 s).

### 白面鸮(프틸롭시스)가 복사한 歌蕾蒂娅·余의 준비 시작 증정은 「같은 줄 세 명」을 건너뜀 (GitHub #473, upstream `6bfc0827`)
- 근거: 제보자의 공식 플레이 영상(bilibili BV1XJSoBzEFB 2:30–2:38)을 upstream 관리자가 확인 — 白面鸮가 앞 칸 歌蕾蒂娅(오퍼레이터)·余(오퍼레이터)의 특질을
  복사하면, 白面鸮 줄에도 원래 오퍼레이터 줄에도 세 명이 없는데 증정이 나온다.
- 동작(upstream 그대로): 디스패처가 복사 실행에 `copiedFrom`(원래 오퍼레이터의 말)을 기록하고, `garrisons/prep/shared.js rowCondition`은 「복사한 쪽이 白面鸮,
  원본이 歌蕾蒂娅·余, 준비 시작(`SERVER_PREP_START`)」일 때만 조건을 통과시킨다. 원래 오퍼레이터의 자기 증정은 여전히 자기 줄을 검사한다.
  塞雷娅(오퍼레이터)의 복사·다른 특질·다른 줄 조건은 바꾸지 않음(영상이 이 두 경우만 보여 줌 — upstream도 넓히지 않음).
- 테스트 `test/content/garrisons_meta.test.js`(두 원본 × 白面鸮 줄 · 원본 줄 있음/없음 8가지, upstream 그대로).

### 클라 전투 결과의 선발·보충 오퍼레이터 이름 (GitHub #469, upstream `6bfc0827`)
- 문제: 클라이언트가 돌린 전투의 결과(`fields.js validateClientResult`)가 유닛 이름을 말 기록에서 가져와, 선발(自选) 오퍼레이터는 빈 칸 기록의
  「甄选干员」으로, 补位(보충) 오퍼레이터는 원래 말 이름으로 나왔다. 서버가 돌린 전투는 맞았다.
- 동작(upstream 그대로): `specBounds`가 서버의 편성(전투 스펙)에서 보드 유닛마다 이름을 정한다 — 선발은 그 선택(`diyRecordOf`), 보충은 `gd.standIn`.
  결과의 보드 유닛 이름은 이것을 쓰고, 클라가 보낸 이름은 여전히 믿지 않는다. 표시만이고 전투 규칙과 무관.
- 테스트 `test/match/clientCombat-review.test.js`(선발 克莱门莎·보충 하나, 위조 이름 무시 — upstream 그대로).

### 洛洛의 定制品·焰尾의 오퍼레이터 풀은 영상 실측 가중치 (관리자 결정 2026-10-11, upstream PR #497 `b612487b`)
- 근거: 영상 「卡池相关机制」 6번 — 洛洛(오퍼레이터) 〈获得时〉 「洛洛的定制品」 = 维式重锤 10 · 战栗/坚固/加速/灼燃维式重锤 각 2 · 有限加速器 1 · 护盾无人机 4 ·
  激光发射器 4, 焰尾(오퍼레이터) 〈获得时〉 오퍼레이터 = 野鬃 10 · 灰毫 10 · 远牙 3. 풀 내용은 서버 규칙이라 공식 표·클라에는 없다(`SERVER_POOL_EQUIP`·`SERVER_POOL_CHAR`).
- 전: `pool_equip_rockr` = 특수 维式重锤 넷 균등(플레이테스트 #4 「특수 维式重锤는 洛洛나 维多利亚에서 얻는다」의 읽기), `pool_char_pinus` = 45/45/10 추정.
- 동작(PR 그대로): `tools/build-data.mjs buildChoices`의 두 풀만 `weighted`로 바꿈(`data/choices.json`에서 이 두 풀만 움직임). 특수 维式重锤 넷은 여전히 상점에서
  안 팔고(`SHOP_EXCLUDED_ITEMS`) 이 풀과 `pool_equip_vict`(维多利亚 25층, 넷 균등 그대로)에만 있다 — 플레이테스트 #4의 말은 그대로 맞고, 洛洛 풀이 그 넷만은 아닐 뿐.
  상점에서 파는 넷(维式重锤·有限加速器·护盾无人机·激光发射器)은 `rollItemId`의 `weighted` 길에서 공용 장비 재고(`itemPool.canGain`)에 걸리고, 焰尾 풀은 공용 오퍼레이터
  재고에 남은 복사본이 있는 것만 뽑는다(둘 다 전과 같음; 위 「특질이 직접 주는 장비」의 면제 대상이 아님).
- 영상은 가중치(상대 빈도)만 준다 — 표에는 `assumed: true`를 남김(PR 그대로).
- 테스트 `test/match/pool.test.js`(维多利亚 풀 넷 균등 / 洛洛 8종 가중 표·모두 나옴·维式重锤가 특수 해머보다 확실히 많음 / 焰尾 10·10·3). golden은 洛洛·焰尾를 얻는
  매치가 움직임(커밋 메시지에 사례 목록).

## upstream 버그 이슈 이식 (2026-10-15)

upstream 새 버그 이슈와 거기 붙은 수정 PR 중 이식한 sim 쪽(관리자 결정 2026-10-15). upstream PR은 병합 전 브랜치의 diff를 손으로 붙였다.

### 盟约之币·骑士储蓄罐는 장착 때만 자금 — 바로 销毁는 0 (upstream #641, PR #644 되돌림)
- 10-15에 PR #644를 붙여 정비 구역(손패·임시)에서 바로 销毁해도 장착과 같은 자금을 줬다가 되돌렸다(관리자 결정 2026-10-17).
- 근거: 그 커밋이 근거로 든 「upstream 관리자의 공식 확인」은 PR 작성자의 주장이었고, upstream 관리자는 PR을 병합하지 않고 닫았다(2026-10-15).
  공식 설명은 「装备时销毁，并获得……资金」(장착할 때 파괴되며 자금), #641 댓글에서 일본 서버 플레이어 둘이 바로 销毁하면 자금이 없다고 적었다.
- 동작: `builtinMeta.js`의 `equip_destory_gain_random_coin`은 `onEquip`만(무작위 자금 `min`–`max`). 바로 销毁·넘침 파괴·임시 칸 정리·합성은 모두 0.
- 테스트 `test/content/items.test.js`(바로 销毁는 손패·임시 모두 0, 장착 경로 테스트는 그대로). golden 변화 없음(10-15 이식 때도 없었음).

### 刷新时 특질이 贾维 증정보다 먼저 (upstream #627, PR #642)
- 문제: 贾维(전략) 【团伙行动】의 6번째 수동 刷新 증정 拉普兰德(오퍼레이터)가 이미 있던 일반 拉普兰德 둘과 정예로 합성되면, 디스패처가 전략(밴드)을 특질보다
  먼저 돌려 두 일반 복사본이 이미 사라진 뒤라 그들의 「本回合首次主动刷新」 叙拉古 +4층이 없어졌다.
- 근거: PRTS 「卫戍协议：盟约_下半/PRTS盟约记录」(PR이 인용 — 일반 拉普兰德 첫 刷新 +4 · 정예 +8, 贾维 증정은 수동 刷新 6번째마다). 그 둘의 내부 순서는 PRTS에 없다 — **[ASSUMED]**(PR 그대로):
  刷新 순간 판·손패에 있던 말의 특질이 먼저 정산된다.
- 동작(PR 그대로): `effectsMeta.js` 디스패처가 `onRefresh`에서만 특질(`_garrisons`, 刷新 시작 때 찍은 말 목록)을 전역·전략·맹약보다 먼저 돌린다.
  아직 첫 刷新을 안 쓴 일반 拉普兰德마다 +4가 그 刷新에 들어오고, 증정이 만든 새 정예는 다음 수동 刷新에 +8(새 말은 카운터 0 — 위 GitHub #169 결정 그대로),
  이미 쓴 복사본은 다시 안 준다. `onPrice`(특질 먼저)와 그 밖의 훅 순서(전역 → 전략 → 맹약 → 특질 → 장비 → 효과)는 그대로.
- 테스트 `test/match/feedback1-meta.test.js`(실제 `g.refresh` 경로, 쓴 일반 0·1·2장 × 증정 합성 → 정예 다음 刷新 +8 → 같은 라운드 반복 없음; 옛 순서에서 0·1장
  경우가 실패함을 확인), `test/match/meta.test.js`(`onRefresh`는 특질 먼저, `onPrepEnd`·`onPrepStart`는 전역 → 전략 → 맹약 → 특질). golden 변화 없음.

### 凯瑟琳 【定向投放】은 突变细胞도 준다 (upstream #631, PR #634)
- 문제: 凯瑟琳(전략) 【定向投放】(조달 센터를 올릴 때마다 장비 3개 중 1개, `pool_equip_kathe`)이 상점 판매 장비만 뽑아, 상점이 팔지 않는 突变细胞(돌연변이
  세포)가 절대 안 나왔다(제보자 20판).
- 근거: #631 댓글의 공식 플레이 영상 3개 — https://www.bilibili.com/video/BV1XmUhBhEtw/ ·
  https://www.bilibili.com/video/BV1sUSQBLE93/ (「凯瑟琳分队甚至能发突变细胞，无敌了」) · https://www.bilibili.com/video/BV1WRQeBNEqW/ .
  제보 본문: 조달 센터 레벨과 무관하게 나오고, 突变细胞를 얻는 전략은 凯瑟琳·昆图斯 둘뿐. 첫 댓글의 스크린숏은 결과 화면뿐이라(11라운드 보상일 수 있다는 반론)
  영상이 근거다. 영상 내용은 이 이식에서 직접 열어 보지 못했다(댓글의 주소·제목 그대로).
- 동작(PR 그대로): `tools/build-data.mjs`의 `pool_equip_kathe`에 `plus: ['chess_item_5_08_e_a']`(`data/choices.json`에서 이 풀만 바뀜), `spDraft.js rollItemId`가
  `items`·`tiers`·전체 단계 목록 뒤에 `plus`를 붙여 균등하게 뽑는다(`weighted` 풀에는 안 씀). 突变细胞는 여전히 상점(`SHOP_EXCLUDED_ITEMS`)·다른 상점 풀·机变
  보급에는 안 나오고, 효과 전용이라 공용 장비 재고가 없다(`itemPool.cap` null). 카드의 출처 표시(`shopExcludedBy`)는 昆图斯 그대로(PR 그대로).
- **[ASSUMED]**(PR): 풀 안 가중치는 균등(52개 중 1개), 이 풀의 효과 전용 장비는 突变细胞뿐(특수 维式重锤 넷은 없음).
- 테스트 `test/match/pool.test.js`·`test/match/feedback5-cathy-pool.test.js`(실제 `g.levelUp` 경로 40판 × 5번 — 突变细胞가 나오고 다른 효과 전용 장비는 안 나옴)·
  `test/content/bands.test.js`·`test/ui/feedback1-offers.test.js`·`test/data.test.js`·`test/docs-consistency.test.js`(PLAYING 문장). golden: `matches` coop4-ABYSS-7만 —
  ai_3이 凯瑟琳이라 R4·R5·R7의 【定向投放】 제시가 풀이 한 칸 늘어난 만큼 같은 시드에서 다른 장비를 뽑았다(그 판에서 突变细胞는 안 나옴).

### 维什戴尔 魂灵之影은 그 필드의 판 위에만 (upstream #557, upstream `347343d7`)
- 문제: 维什戴尔(선발 오퍼레이터)의 재능 死魂灵的余息·S3 爆裂黎明이 魂灵之影(소환물)을 놓는 칸이 「범위 안 + 설 수 있음 + 빈 칸」뿐이라, 보스 필드(최종 공격·숨은 핵심)에서
  아래 줄에 서면 손패·临时整备区 줄(보스 필드 0–1행, `BOSS_RECT` 안)에 소환됐다.
- 근거: 제보 화면(upstream #557)과 upstream 관리자 수정(`347343d7`, PR #558 각색). 공식에서 소환물은 「범위 안의 배치 가능한 칸」(PRTS 备注)이고 손패·임시 줄은
  전투 칸이 아니다(`tile_achand`, 위 「卫戍协议 버프 그래프」 突袭 전장 칸).
- 동작(upstream 그대로): `op-wisdel.js placeWard`의 칸 조건에 `Battle.onFieldBoard(r, c)`(이 필드에 선 플레이어 누구든의 판, `battle/players.js`) — 같은 필드
  팀원의 반쪽은 됨, 보스 필드의 손패·临时整备区 줄과 혼자인 보스 필드의 빈 반쪽은 안 됨, 맞는 칸이 없으면 소환하지 않음(S3 추가 소환도 같음).
- **[ASSUMED]**(upstream 그대로): 혼자인 보스 필드의 빈 반쪽 제외. 突袭 착지는 클라 `IsBattleField`(BOSS_BATTLE = 보스 맵 전체)라 그 반쪽이 열려 있는데,
  魂灵之影 소환이 클라에서 같은 검사를 쓰는지는 대조하지 않았다 — 같다면 빈 반쪽도 공식은 허용.
- 테스트 `test/local-patch-diy.test.js`(upstream 테스트 각색: 보스·숨은 핵심 × 좌우 × 자리 있음/없음 — 재능·S3 모두 临时整备区 줄에 안 감; 팀원 반쪽은 됨·혼자면 빈
  반쪽 안 됨), `test/local-patch-diy-wisdel.test.js`(실제 경기 경로: Match 판 → `battleInput` → `buildBattleSpec` → `createBattleFromSpec`, 혼자인 m02 보스 필드 —
  고치기 전에는 临时整备区 줄에 소환됨을 확인).

### “自在” 부활 뒤 무적은 선택도 안 됨 (upstream #510, upstream `221e6b8d` 일부)
- 문제: “自在”(보스)가 첫 击败 뒤 5초 重生을 마치고 받는 10초 无敌 동안 오퍼레이터가 계속 그를 공격 대상으로 골라(피해는 0) 공격·스킬을 허비했다.
- 근거: PRTS 「“自在”」 천부 「重生结束后进入第二形态，反转自身明晦属性，并获得10s无敌」, PRTS 异常效果 无敌(INVINCIBLE) 「无法被不同阵营选中（属于无法选择类效果）；
  受到的伤害与元素值变为0」(이 이식에서 PRTS API로 직접 확인).
- 동작(upstream 그대로): `archetypes.js reborn`에 `invincibleUntargetable` 선택지 — 켜면 부활 뒤 무적 버프(`ab:reborn:inv`)가 `invulnerable`에 `untargetable`도 단다.
  `leaders.js kitXi`만 켠다. 이미 날아가는 탄은 맞아도 피해 0(무적), 무적이 끝나면 다시 대상이 된다. 스킬 발동은 각 규칙 그대로 — 대상이 필요한
  DEFAULT·ACTIVE_RANGE는 안 켜지고, 범위 안 존재·SP만 보는 SKILL_RANGE·SP_FULL은 켜진다.
- 엔진의 `invulnerable` 일반 의미(피해만 막음)는 그대로다. 부활 뒤 无敌가 있는 다른 적 — 데이터에서 0보다 큰 것은 같은 悬赏 리더인 锏(`Reborn.invincible` 10)과
  扎罗，“狼之主”(`Passive2.invincible_time` 10, PRTS 「获得10s无敌」) 둘뿐 — 도 같은 PRTS 无敌 정의로 선택 불가를 켠다(관리자 결정 2026-10-15). 主角阵营角色는
  `reborn.invincible` 0이라 해당 없다. 锏은 2형태가 隐匿이라 무적이 끝나도 隐匿를 보는 오퍼레이터만 노린다(기존 그대로).
- 테스트 `test/content/xi-post-reborn.test.js`(upstream 테스트 + 실제 경기 경로: Match 판 → `buildBattleSpec` → `createBattleFromSpec`, 무적 10초 동안 공격 0 →
  끝나면 다시 공격; 고치기 전에는 모두 실패함을 확인) + 锏·扎罗 무적 동안 선택 불가. golden: 锏·扎罗를 추가 소환하는 roster-012·013·047.

### 枯朽之种 자폭 = 일반 공격의 탄환 (upstream #611, upstream PR #612 — 각색)
- 문제: 枯朽之种(枯朽萃聚使徒가 소환하는 비행 적)이 대상을 정하면 이동 속도로 걸어가 부딪혀 터져서, 그동안 공격 대상이 되고 느렸다.
- 근거: PRTS 「枯朽之种」 천부 「普通攻击结束时，若自身未持有晕眩/冻结/浮空/沉睡，强制击杀自身」·「攻击弹道飞行速度10」, 공격 범위 반경 2.0(이 이식에서 PRTS API로 직접 확인).
  data(`data/enemies.json`): `rangeRadius` 2, `attackAnim` Attack 0.367 s(타격 0.367), `proj` `projectile_enemy_nhfly` TRACE_TARGET_WITH_SPEED 10.
- 동작(**PR과 다름**, 관리자 결정 2026-10-15 「유지」 — 클라 프리팹이 이 적에 공식 탄 `projectile_enemy_nhfly`를 묶어 둔 것과 PRTS 천부가 근거): 자폭은 그 적의 **일반 공격**이다 — 엔진의 원거리 적 공격 그대로(선딜 0.367 s, 적 공격 대상 순서, 공식 탄환 10칸/s, 물리 피해는 맞을 때,
  쏜 적이 없어도 맞음), 그리고 공격이 끝나는 순간(`attack` 훅) 晕眩·冻结·浮空·沉睡가 없으면 스스로 죽는다(`enemies/fly.js`). 그래서 탄이 나는 동안 노릴 씨앗이
  없다. 기절 등으로 선딜이 끊기면 공격도 자폭도 없고 풀리면 다시 공격한다. 失衡 동안은 공격을 시작하지 않는다(엔진 규칙). 탄환 그림은 공식 프리팹
  (`projectile_enemy_nhfly`, 일반 적 탄환 경로)이라 렌더 작업이 필요 없다.
  upstream PR은 대상을 고르자마자(선딜 없음, 가장 가까운 오퍼레이터) 씨앗 모델 자체를 탄환에 붙여 날리고(무적·선택 불가) 맞을 때 죽였다 — 위 PRTS 천부
  「普通攻击结束时…强制击杀自身」와 다르고, 표적을 잃으면 마지막 자리에서 피해 없이 터지는 `[ASSUMED]`이 따로 필요했다. 우리 방식에서 표적을 잃은 탄은 엔진의
  일반 적 탄환처럼 사라진다. 로고스(우리 풀에 없음) S3 감속 부분은 버렸다.
- 그 판의 마지막 적이 씨앗이면 자폭과 함께 전투가 끝나 날던 탄은 맞지 않는다(엔진: 모든 적이 정리되면 끝, 탄환 정리) — 공식도 마지막 적이 사라지면 전투가 끝난다.
- 테스트 `test/content/enemies_bosses.test.js`(반경 2에서 공격 → 탄 속도 10·대상·발사 순간 씨앗 사라짐·착탄 시간; 기절 중엔 공격·자폭 없음; 실제 경기 경로 Match 판 →
  `buildBattleSpec` → `createBattleFromSpec`), `test/sim/unbalance.test.js`(PR의 失衡 중 발사 없음).

### 假想敌：镜膜 HP +100%는 첫 침묵에 영구 상실 (upstream #481, upstream PR #613)
- 문제: 假想敌：镜膜(REFLECTION 적)의 折射가 법술 저항 +70과 최대 HP +100%를 한 버프로 묶어 침묵 동안 끄고 침묵이 끝나면 다시 켜서, HP 보너스가 되돌아왔다.
- 근거: PRTS 「假想敌：镜膜」 천부 「最大生命值+100%（受沉默影响后失效，无法恢复）」, 능력 수정 「生命值大幅提升，被沉默后永久失效」(PRTS API로 직접 확인).
  저항 +70(`ba.refraction` 「生效时，法术抗性+70」)은 다른 折射 적과 같이 침묵 동안만 꺼진다.
- 동작(PR 그대로): `archetypes.js refraction(res, hpPct)` — HP 보너스가 있는 적(镜膜만)이 처음 침묵되는 순간 `hpLost`를 영구로 세우고 `setForm('stopped')`
  (fx `phase` `{ id, kind: 'stopped', form: 'stopped' }`; 늦게 들어온 관전자는 `fieldMeta()` UnitInfo `form`)를 낸다. 침묵이 끝나면 저항 +70만 다시 붙는다.
  최대 HP가 바뀔 때 엔진이 HP 비율을 유지하므로(`units.js` 「Changing maxHp keeps the HP ratio」) 보너스를 잃어도 현재 HP 비율은 그대로이고, 다시 늘지 않는다.
  다른 镜膜은 제 보너스를 그대로 가진다. 멈춘 팬 모습(B 모델)은 `docs/rules/render.md`.
- 테스트 `test/content/enemies_bosses.test.js`(PR 테스트: 첫 침묵 → HP 보너스·저항 꺼짐·HP 비율 60% 유지·폼 `stopped`·fieldMeta; 침묵 끝 → 저항만 돌아옴; 두 번째 침묵에도
  폼 이벤트 한 번; + 실제 경기 경로 Match 판 → `buildBattleSpec` → `createBattleFromSpec`). golden: `diy` diy-003만 — 그 판(R13 `act1autochess_h06`)의 镜膜들이
  침묵을 맞은 뒤 침묵이 끝나도 HP 보너스가 안 돌아와(10번 상실) 오퍼레이터 피해·처치 숫자가 바뀐다.

### 假想敌：淤困은 부착 때 저지자 칸 중심으로 闪现 + 自缚 (upstream #600, upstream PR #559)
- 문제(제보): 假想敌：淤困(ELEMENT 적)이 저지한 오퍼레이터에게 「달라붙지 않는다」. 우리 엔진에서도 부착(저지자 `ab:parasite` — 매초 법술 피해·元素损伤 ×)은 됐지만
  적은 일반 저지처럼 접촉 지점(저지자 중심에서 약 0.7칸 앞)에 서 있었다 — 실제 경기 경로로 확인(고치기 전: 角峰 앞 x 6.7에 멈춘 채 부착). 제보의 「안 붙음」이
  이 위치 차이라는 것은 PR 작성자 댓글과 위 확인에서 미루어 본 것 **[추정]**.
- 근거: PRTS 「假想敌：淤困」 천부 「附着开始时闪现至阻挡者所在地块中心，附着期间持有自缚」·「附着效果在解除阻挡时解除」(PRTS API로 직접 확인).
- 동작(PR 그대로, 이동만 직접 대입으로 줄임): `element.js kitParasite`가 부착하는 순간 적을 저지자 칸 중심(`tileC`, `tileR`)으로 옮기고 경로 캐시(`route.pts`)를 지우며
  `ab:parasiteAttached`(`noMove` + `selfBound` = 自缚)를 붙이고 fx `teleport` `{ id, fromX, fromY, kind: 'parasite' }`를 낸다(그 다음 기존 `beam`). 저지가 풀리거나
  (저지자 퇴각·사망·저지 해제 — 키트 틱 0.2초 안) 적이 죽으면 자박도 지운다 — 경로는 그 칸에서 다시 짠다. 자박라 余 S2 등 「자박 불가」 규칙도 그동안 따른다.
  클라는 `kind: 'parasite'`인 teleport만 짧은 거리라도 미끄러지지 않게 끊어 그린다(`render.md`). 부착 동안 폼 `parasitic`(클라 프리팹 모드 Parasitic, 관리자 결정
  2026-10-15 「공식대로」), 풀리면 폼 null — 모습만이고 판정은 그대로(`render.md` 같은 절).
- **부착 시점과 闪现**(2026-11-03, 공식 클라에서 확인 — 프리팹 `enemy_9007_acelem`·버프 템플릿): 가상적: 정체는 일반 공격이 없고(applyWay NONE, 기본 모드 `_attack` 없음)
  저지되면 기본 모드의 `Combat` 능력을 저지자에게 시전한다 — 클립 `Parasitic`(1.2초, `_timeMode` FROM_ANIMATION)에 공격 이벤트가 없어 시전은 클립 끝까지 기다린 뒤
  닿고(`_waitForAttackEvent`), 그때 천부 `Talents/1`(`PassiveAttachmentAbility`, 대상에게 `enemy_acelem[to_parasitic]`; `AbilityStandard.OnCastOnTarget` →
  `AbilityAttachment.Apply`)이 저지자를 숙주로 만든다. 그 버프 시작: 적을 모드 Parasitic으로(그 모드에도 공격 없음), 숙주에 `enemy_acelem[parasitic]`(1초마다 법술 피해),
  숙주 칸을 블랙보드에 두고 `BlinkNode`(`_forceToMapPosition`) → `Enemy.Blink(GridPosition)`: 갈 수 있는 칸이면 저지에서 풀고(`ReleaseFromBlocker` — 미끄러짐도 끝)
  칸 가운데에 바로 놓음 → 저지자의 다음 탐색이 거리 0에서 다시 막음(offset 0이라 그 자리). 그리고 `enemy_acelem[check_block]`이 부착 0.2초 뒤부터 0.2초마다 숙주가
  아직 막고 있는지 보고 아니면 부착을 끝냄(모드 Default로, `Reborn` 능력 = 클립 `Start`). 우리: `kitParasite`가 저지된 뒤 1.2초(`PARASITIC_CLIP`)에 부착,
  `_unblock` 뒤 칸 가운데, 부착 시각부터 0.2초(`CHECK_BLOCK_INTERVAL`)마다 확인. 전에는 저지 뒤 키트 틱(0.2초) 안에 부착하고 저지를 그대로 두었다.
  `Combat` 시전의 시작과 끊김(2026-11-03, 공식 클라에서 확인 — 적 상태 기계의 COMBAT 상태): 막히면 COMBAT 상태로 들어가는 그 순간(`CombatState.OnEnter`) 시전을
  시작하고, 시전 중에는 상태가 기다리기만 해서(`OnTick`이 능력이 시전 중이면 돌아감) 저지가 풀려도 끊기지 않고 시작한 오퍼레이터에게 닿는다(그가 필드에 있어야 함 —
  쓰러지거나 퇴각하면 끝) — 닿은 뒤 0.2초 저지 확인이 부착을 끝낸다. 기절(빙결·공중에 뜸·마비도)은 상태를 바꾸고 `OnExit`이 시전을 끊는다(`InterruptIfNot`) →
  다시 막히면 클립 하나를 처음부터. 우리도 같게(전에는 저지가 풀리면 끊고, 다른 저지자로 바뀌면 다시 시작).
  闪现이 실패하면(숙주 칸이 갈 수 없는 칸 — 우리 `groundPassable` 거짓, 2026-11-03 확인): `BlinkNode`가 `Enemy.Blink`의 거짓을 그대로 돌려주고 버프 동작 목록은
  앞 노드가 실패하면 멈추므로(`ActionUtil.RunActions`) `check_block`이 생기지 않는다 — 모드 Parasitic·숙주 피해는 이미 걸렸고, 적은 그 자리에서 막힌 채 붙는다.
  그 부착은 저지가 풀려도 이어지고, 숙주가 필드를 떠나거나(아래) 가상적: 정체가 죽을 때만 끝난다(`to_parasitic`은 `lifeTimeType` INFINITY, 0.03초마다 출처 생존 확인).
  숙주가 필드를 떠나면(퇴각·사망, 闪现 성공·실패 모두) 그 순간 끝난다: `Entity.OnFinish` → `BuffContainer.Clear`가 버프마다 `_FinishBuff` → `to_parasitic`의
  `ON_BUFF_FINISH`(모드 Default·`Reborn`). 우리 `kitParasite`: 闪现 실패면 0.2초 확인 없음, 숙주가 떠난 것은 매 틱 확인(전에는 闪现 실패도 0.2초 확인으로 떼고,
  퇴각한 숙주는 다음 0.2초 확인까지 붙어 있었다). 렌더는 시전 중 클립 `Parasitic`을 아직 틀지 않음(부착 때 한 번).
- 테스트 `test/content/enemies_bosses.test.js`(PR 테스트: 접촉 지점 → 저지 1.2초 뒤 부착·闪现이 저지를 풂·다음 탐색에 다시 막음·저지자 칸 중심·자박·teleport fx·퇴각 뒤 다시 걸음;
  + 실제 경기 경로 Match 판 → `buildBattleSpec` → `createBattleFromSpec`, 角峰이 저지 → 칸 중심·3초 동안 그 자리에서 피해·퇴각 뒤 걸음 — 고치기 전에는 칸 중심 확인이 실패;
  闪现 실패 = 저지 확인 없이 붙어 있다 숙주가 떠날 때 끝, 퇴각한 숙주는 그 틱에 떨어짐).

## upstream 0.2.5–0.3.1 버그 수정 이식 — 매치 (2026-10-17)

upstream 버그 수정 커밋 중 우리에게도 있던 매치(상점·맹약·손패) 쪽(관리자 결정 2026-10-17). 목록은 `upstream.md` 같은 이름 절.

### 娜仁图亚 【见者有份】 장비는 상점 레벨과 무관 (upstream `e53b8d52`)
- 문제: 娜仁图亚(전략) 【见者有份】(짝수 라운드 정비 시작에 장비 2개 중 1개 무료, `pool_equip_narant`)가 상점 레벨 이하 단계만 뽑아, 레벨 1–2 상점에서는
  III단계 이상이 절대 안 나왔다.
- 근거: 커뮤니티 제보 2026-10-14(upstream, 「给的装备都没有超过当前等级的，正常可以刷出更高等级的装备」) + 블랙보드
  `preparation_start_add_special_goods_every_n_round`에 단계 제한이 없음 — 凯瑟琳 【定向投放】(`pool_equip_kathe`)과 같은 꼴.
- 동작: `tools/build-data.mjs`의 `pool_equip_narant`에서 `maxTier: 'shopLevel'`을 뺌(`data/choices.json`에서 이 필드만 바뀜). 상점 판매 장비 전체(I–VI)에서
  서로 다른 둘. 凯瑟琳의 `plus`(突变细胞)는 넣지 않음 — 이 전략이 突变细胞를 준다는 근거가 없다.
- **[ASSUMED]**: 풀 안 가중치는 균등(풀 자체가 서버 쪽).
- 테스트 `test/match/r40a-narant-pool.test.js`(upstream 그대로: 실제 경기 경로 16판, 상점 레벨 1의 R2에서 II단계 이상·VI단계가 나옴),
  `test/content/bands.test.js`(상점 레벨 3에서 상점 장비 둘, 단계 제한 없음).

### 빅토리아 해머·远见·奇迹 밀린 지급은 맹약이 켜지는 즉시 (upstream `16567bbe`)
- 문제: 维多利亚(맹약)가 꺼져 있는 동안(「无需激活」 출처 — 烛煌 등) 25층을 넘긴 维式重锤(빅토리아 해머)가 맹약이 켜져도 바로 안 오고, 다음 구매·획득·판매·합성·
  정비 시작/끝 훅 때까지 밀렸다(흔히 정비 끝). 远见·奇迹(맹약)의 층수 자금도 같은 규칙이라 같이 밀렸다.
- 근거: upstream 관리자의 공식 실기 2026-10-15 — 공식은 맹약이 켜지는 순간(정비 중 세 번째 멤버를 놓을 때) 해머가 온다.
- 동작(upstream 그대로): 새 메타 훅 `onActiveBonds` `{ activated, deactivated }`. `PlayerState.recompute`(`player/round.js`)가 지난 계산과 켜진 맹약
  집합이 다르면 보낸다 — 맹약 셈을 바꾸는 모든 길(정비 중 놓기·옮기기·바꾸기·빼기, 구매·판매·합성·변이, 임시 → 손패, 장비, 효과, 축출)이 거기로 끝난다.
  죽은 플레이어·떨어진 사본에는 안 보냄. `bonds/templates.js HAMMER_HOOKS`·`SETTLE_HOOKS`가 이 훅을 들어 밀린 이정표를 바로 정산하고,
  이정표마다 카운터라 맹약을 껐다 켜도 한 번만. `audit.js`의 지출 효과 키에도 넣음.
- AI 팀원의 배치 리허설(`bot.js createRehearsalSteps`)은 떨어진 사본(`preview.js previewPlayer`)으로 돌아 진짜 상태의 `recompute`를 거치지 않는다 — 리허설
  배치가 맹약을 켜도 아무것도 안 보내고 해머도 안 준다(upstream `ed44ce4d` 이식 전에는 진짜 판에 놓았다 되돌려서 조용한 `recompute`가 따로 있었다).
- **[ASSUMED]**(upstream 그대로): 远见·奇迹 자금과 远见 할인 걸쇠도 해머와 같은 시점(같은 규칙을 쓰므로 — 공식 확인은 해머뿐).
- 테스트 `test/match/bond-light-up.test.js`(upstream: 세 번째 멤버 배치 즉시 해머 한 개·토스트 한 번, 뺐다 다시 놓아도 더 없음, 밀린 이정표 둘 = 해머 둘,
  이벤트 목록·탈락자 없음, 远见·奇迹 임시 → 손패로 켜질 때 자금, AI 배치; 우리: 리허설이 맹약을 켜는 배치를 시험해도 이벤트·해머 없음),
  `test/match/feedback3-prep-end-item.test.js`(정비 끝 해머는 정비 끝 층 획득이 넘긴 이정표로 바꿈, upstream). golden 변화 없음.

### 임시 정비 구역 뒤 숨은 대기열 (관리자 결정 2026-10-17, upstream `92b97ecb` `ae1c21d9`의 대기열만)
- 문제: 손패(정비 구역 10칸)와 임시 정비 구역 5칸이 다 찬 뒤 들어온 것을 잃었다 — 지급·보상 오퍼레이터는 카드 풀로 반환(「整备区已满，获得的干员已返还」),
  합성 정예는 버리고 사본 반환, 아이템 지급은 파기(「…获得的装备已销毁」), 합성·판매·변이로 돌아온 장비는 정예 칸 2개까지 붙이고 나머지 파기, 판매는 장비 둘 곳이
  없으면 `HAND_FULL`로 거절, 범위 밖으로 밀린 소환물은 판에서 빠져 다음 라운드에.
- 근거: PRTS 卫戍协议/帮助 §手牌区 「类似的，临时手牌区也存在溢出，溢出单位无法查看，在临时手牌区出现空位时自动移入」. 클라도 같은 구조 — 가진 기물 목록
  (`PlayerBattleData` charChesses·equipChesses·magicChesses)과 칸 위치(`chessPositionInfos`)가 따로 오고, `ChessMapInfo.UpdateData` →
  `OptimizeHandMap`(임시 → 정규) → `_CheckNoPositionChess`/`_AddNoPositionChess`가 위치 없는 기물을 첫 빈 손패 칸(`GetFirstEmptyHand`: 정규 → 임시)에
  넣고, 빈 칸이 없으면 지우지도 알리지도 않고 위치 없이 둔다(다음 갱신에 다시). 넘친 기물을 지우는 클라 동작·「파기됨」 토스트 키는 없다.
- 동작(upstream 그대로 받은 것): `ps.temp`가 5칸보다 길어질 수 있다 — 앞 5칸이 보이는 칸(오른쪽 → 왼쪽으로 참), 그 뒤가 숨은 꼬리. `stow({ allowTemp })`는
  늘 자리를 찾고(`player/pieces.js`), 오퍼레이터 지급·보상·변이(`acquireChess`), 합성 정예와 돌려받는 장비(`_mergeChess`), 아이템 지급·합성 황금 장비
  (`acquireItem`·`_mergeItem`), 판매·변이·`destroyPiece`의 장비, 지형 변화로 밀린 기물, 범위 밖 소환물 모두 꼬리로 간다. `recompute → _fillHandFromTemp`가
  빈 정규 칸을 보이는 칸(오른쪽 → 왼쪽) → 꼬리(도착 순) 순으로 채우고 꼬리를 앞 5칸으로 당긴다. 꼬리 기물도 합성·재고 계산·마감 처리에 그대로 들어간다.
  `checkItemMerges` 한도는 가진 수만큼(옛 20번 제한은 큰 정비 끝 보상 묶음을 덜 합쳤다). 불변식: 임시 ≥ 5칸, 꼬리가 있으면 빈 칸 없음.
- 보이는 것(관리자 결정 2026-10-17, upstream 그대로): `m.private.temp`는 숨은 꼬리까지 전부 보내고, 클라가 그릴 때 앞 5칸만 그린다(`render/app.js`
  `addList`, 대체 화면 `ui/fallbackField.js`는 원래 5칸만 돎). 정찰 화면(`prepFieldMeta`)은 앞 5칸만 보낸다(upstream도 같음). 꼬리가 있으면 앞 5칸이 차
  있으므로 준비 넘침 확인 창·아래 띠 HAND_OVERFLOW는 그대로 뜨고, 「临时整备区 N 个单位待处理」의 N은 꼬리까지 센다.
  - 나중에 다시 볼 것: 이식 처음(같은 날)에는 「无法查看」대로 `m.private`에도 앞 5칸만 보냈다. 그쪽이 상태까지 숨기는 대신, 꼬리 기물의 uid가 클라에 가므로
    고친 클라는 숨은 기물을 팔거나 옮길 수 있다(서버는 임시 칸 어디든 받는다). 숨은 기물 조작을 막으려면 5칸만 보내거나, 서버가 `idx ≥ 5`인 임시 기물
    조작을 거절하게 한다.
- 받지 않은 것: 대기열(임시 칸)이 있으면 준비 거절(`TEMP_NOT_EMPTY`)과 upstream 문서의 「Ready is refused」 문장 — 공식 클라는 확인 창 뒤 준비한다
  (`ui.md` 「임시 정비 구역이 넘친 채 준비」, 관리자 결정 2026-10-10). 우리 `tempDue` 마감(준비 전 정비 중 = 그 정비 끝, 준비 뒤·정비 밖 = 다음 정비 끝)은
  꼬리 기물에도 조각마다 그대로. 손패가 꽉 찼을 때 상점 구매·모집 카드·보상 고르기를 막는 규칙도 그대로(PRTS 「当常规手牌区全满无空位时，玩家将无法执行使手牌
  溢出的操作」). upstream의 플러그인(DSL) 지급 테스트는 우리에게 플러그인이 없어 안 받음.
- **[ASSUMED]**: 꼬리 안 순서 = 도착 순(upstream 그대로). 클라는 오퍼레이터 전부 → 장비 → 마법 순이고 각 목록 안은 서버 순서라 조금 다를 수 있다. 숨은 꼬리가
  정비 마감에 보이는 칸과 같이 처리되는지(서버 쪽)는 어디에도 없어 우리 `tempDue`를 그대로 씀.
- 테스트 `test/match/bench-overflow.test.js`(upstream 각색: 지급 40명이 모두 남고 판매로 차례로 채워짐·구매는 계속 `HAND_FULL`·대기열이 있어도 준비 가능,
  숨은 기물 합성, 마감이 압축 뒤에도 유지, 큰 장비 묶음 합성, 재접속 때 `m.private`는 5칸·서버는 전체, 탈락 때 사본 반환, AI가 긴 대기열을 비움, 정비 시작 지급
  12개 유지), `test/ui/bench-overflow.e2e.test.js`(SP_E2E, 15칸만 그려지고 빈 칸이 나면 다음이 보임 — 이 이식에서는 안 돌림), upstream이 바꾼 기존 테스트 9개
  (`economy`·`feedback1-meta`·`feedback1-placement`·`feedback3-prep-end-item`·`hardening`·`merge`·`playtest6-elite-to-board`·`scroll-copy-merge`·`sell-capacity`:
  반환·파기 대신 대기열). golden 변화 없음.

## 卫戍协议 버프 그래프·공식 클라 맞춤 (2026-10-10, 관리자 결정 「동작 변경 모두 공식이랑 동일하게」)
출처: EN 클라(2026-08) 버프 템플릿 `config/buff_template_holder.ab`의 그래프와 공식 클라(EN 판). 핫픽스(DefinedFix.lua en/zh)에 아래 메서드 없음.
- **기습(突袭 `raidShip`)** — 그래프 `act1autochess_bond_eff_raid`(+`[attack]`·`[trig]`·`[skill]`·`[all]`), 착지 노드 `AutoChessRebuildCharacterOnTile.Execute`.
  코드 `server/sim/content/bonds/addon/battle.js` 「突袭 relocation」. 뛰는 경우 넷:
  - PASSIVE 스킬 멤버: `[spawn]` 표시가 없으면(아무 점프나 붙임) 범위와 상관없이 → 배치마다 한 번(缄默德克萨斯의 배치 후 스킬은 표에서 PASSIVE).
    `[spawn]`은 durable 버프라 점프 자체(MoveLikeRespawnSelf)에서는 남고, 멤버가 다른 이유로 필드를 떠나면 지움 **[ASSUMED]**(2026-10-06 제보 44 「부활하면 바로 突袭」과 맞춤).
  - MANUAL·AUTO 스킬: 스킬 준비됨(CheckCharSkillAvailable)·안 켜짐·자기 칸과 앞 칸에 적 없음(`CheckHasEnemyInRange`: `_useAttackRange` false면 범위 `1-1`, 적이면 은신·비행 가리지 않고 셈). `[spawn]`과 무관해 적이 그 칸을 벗어나면 또 뜀. AUTO는 2026-10-19부터(아래 「突袭 AUTO 스킬도 준비되면 점프」).
    **저지 중에도 뜀**(2026-11-02, 제보 「기습이 적을 저지하는 중에도 점프시킨다」, 공식 클라에서 확인 — 동작 변경 없음): 저지를 보는 경로는 AUTO 스킬 시작의 `CheckBlocked`뿐이다. 이 경로·PASSIVE·10초 무공격에는 저지 조건이 없다(10초 무공격의 `IfTarget`은 `_checkTargetUnitType`이 꺼져 있어 주인이 살아 있는지만 봄). 저지된 적은 다가온 쪽에 남는다 — `BlockBalancer.CalculateBlockOffset`이 저지자까지의 offset을 그대로 두고(최소 저지 거리보다 가까울 때만 늘림) `Enemy.RegisterBlocker`가 적을 저지자 + offset에 둔다. 그래서 뒤·옆에서 막은 적은 `1-1` 상자 밖이고, 스킬이 준비되면 막은 채로 그 적의 칸으로 뛴다(블레미샤인 S1 `skchr_blemsh_1`, 아래 방향 배치 + 등 뒤에서 온 적으로 재현; 앞에서 막은 적은 상자 안이라 안 뜀).
  - AUTO 스킬: 스킬 시작 때 `[spawn]` 없음·저지 중 아님(CheckBlocked = 지금 막는 적 있음 [추정: 노드 이름])이면 0.3초 뒤(그 뒤 0.3초마다, 스킬 동안) 점프.
  - 10초 무공격(`[attack]`): 범위·스킬 조건 없음(범위에 적이 있어도 10초 동안 공격하지 않았으면 뜀 — 커뮤니티 16.1의 「범위에 적이 있으면 안 뜀」을 되돌린 것, 관리자 결정 2026-10-10 「공식대로, 필요하면 나중에 수정」), SP 비율 유지. 착지 후 10초를 다시 셈 **[ASSUMED]**. 스킬 세 경우는 SP 가득(`[spawn]` = `modify_sp[ratio]` sp 1.0, `ModifySp`: RoundToInt(maxSp×비율)).
  - 후보: 진영 ENEMY·WALK_ONLY, 고급 옵션 꺼짐(`TargetOptions._VerifyAdvanced`가 바로 true) → 은신·잠듦·선택 불가·기절 지상 적 모두 후보, 비행만 빠짐. 순서 `FilterUtil` HATRED_DES, 128명까지:
    `Enemy.get_hatred` = 도발 단계 × 큰 상수 − 남은 경로 → 도발 높은 적, 그다음 가장 앞선 적. 같은 위협도의 순서(우리: 출현 순)는 **[ASSUMED]**. 자기 필드 우선 없음(이전 [ASSUMED] 삭제).
  - 착지 칸: 후보마다 그 적의 칸(거대 적은 몸 칸)에서 `LitePhysicsUtil.FindTilesInBox("1-1", 칸, 멤버 방향의 반대)` — range_table 순서라 **적의 칸 먼저, 그다음 멤버가 볼 때 적 뒤 칸**(멤버가 서면 적이 자기 칸이나 앞 칸). 사거리 검사 없음(GitHub #51 이후의 「사거리로 덮는 칸·저지 칸 우선·가장 가까운 칸·RAID_SEARCH 2·8명」 [ASSUMED] 규칙 삭제). 두 칸 다 못 서면 다음 적, 아무도 없으면 그대로.
    설 수 있는 칸: 전장 칸 + 그 말의 배치 가능 칸(`grid.canStand`, 深水区 아님) + 다른 말·쓰러진 오퍼레이터 없음(`isReservedTile`). 적이 서 있어도 됨(근접은 적 칸에 내려 바로 저지). 자기 칸은 고르지 않음(공식은 제자리 재배치 가능 — 차이 미미).
  - 전장 칸: `AutoChessBattleUtil.IsBattleField` = TileIndexer의 BATTLE_FIELD(`tile_achand` 아닌 모든 칸)를 `AutoChessMapAreaManager.ResetTileIndexer`가 상태별로 좁힘 — BATTLE: 왼쪽(자기) 일반 구역, HELP_BATTLE: 여러 명이 도우면(isMultiPlayerHelp) 일반 두 절반·아니면 한쪽, BOSS_BATTLE: 보스 맵 전체.
    그래서 **혼자인 연합방어의 빈 절반은 막힘(확인)**, **솔로 보스 필드의 다른 절반은 열림(바뀜)**, 손패/임시 정비 줄(tile_achand)은 막힘(확인). 우르피안 S3 【移动】은 그대로 `onOwnBoard`.
  - 공격력·최대 HP +(0.25+0.01·층)(`[skill]`, MULTIPLIER = 우리 가산 %)은 **스킬이 켜져 있는 동안 모든 멤버**(점프와 무관, 이전: 점프 뒤 필드를 떠날 때까지). 패시브는 켜진 것으로 봄 **[ASSUMED]**(클라는 `Ability.isAffecting`).
- **频次 器物**(14종) — `PropLikeEnemy.DoApplyModifier`: 피해 한 번에 HP 1, 최대 HP는 반올림 없는 고정소수점(`Attributes._CalculateAttributeValue`) → 필요 타수 = **올림**(2×1.08 = 2.16 → 3타; 이전 반올림 [ASSUMED]). `enemies/helpers.js setHits`. 막대는 정수 타수로 그림(공식은 1/2.16 단위 — 표시만 다름). 사망 판정 hp ≤ 0은 엔진 일반 규칙으로 봄. 2라운드 재확인: `Modifier.finalDelta < 0`이면 피해량과 무관하게 `hp −= 1`(FP 1) — 「频次」 여부는 적 프리팹의 `PropLikeEnemy` 컴포넌트.
- **불굴(不屈 `indomShip`)** — `[lowland]` 그래프의 `DicePRD`(`Nodes.DicePRD.Execute`): C = battle_misc_table `miscConfig.prdBaseProbs[RoundToInt(p×100)]`(101개, 끝을 넘으면 마지막), 마지막 성공 뒤 N번째 굴림은 N×C로 성공, 성공하면 N을 0으로.
  N은 전투 전역 블랙보드 `prd#act1autochess_bond_eff_indom[lowland]` 하나 — 그 전투의 모든 지상 오퍼레이터(두 플레이어 필드면 둘 다)가 함께 씀. `dicePRD` / `prdBase`. 이전: 매번 독립 확률.
  - **불굴 — 같은 틱에 다시 쓰러져도 굴림**(2026-11-15, 플레이 제보 「불굴 확률 100%인데 그라벨이 퇴각 후 바로 부활하지 않음」): 쓰러질 때마다 굴린다. 우리 재배치는 쓰러짐 처리 안에서 곧바로 일어나서, 그 틱에 남은 타격(근접 일격·범위 피해·여러 번 때리는 공격 — 투사체는 노린 배치를 기억해 새 배치를 안 침)이 새로 선 오퍼레이터에 들어간다. 원본(upstream)부터 있던 「같은 전투 시각에 이미 굴렸으면 안 굴림」 막음 때문에 그 두 번째 쓰러짐은 100%여도 보통 재배치 대기(그라벨 16초)로 갔다. 공식 근거 없는 막음이라 지우고, 무한 반복은 불굴이 세우는 도중(배치 훅 안)의 쓰러짐만 다시 안 굴려 막는다(`addon/battle.js` 불굴 `death` 훅). 쓰러지기 전에 시작한 근접 일격이 새 배치를 치는 것 자체는 그대로 둔다 [추정·엔진: 공식은 쓰러진 캐릭터가 끝나고 새로 배치되므로 그 일격이 안 닿을 수 있음 — 바꾸면 엔진 전반 golden이 움직여 관리자 결정 2026-11-15로 보류]. 재발 방지: `test/content/indom-same-tick.test.js`.
- **迅捷(`swiftShip`)** — `act1autochess_bond_eff_swift` ON_SKILL_FINISH: `Dice` 한 번 → 멤버면 +normal_sp → AlwaysNext → 층 ≥ 40이면 +power_sp. 이전 「멤버는 두 번 따로 굴림」 [ASSUMED]를 한 번 굴림으로.
- **坚守(`steadShip`) 반격** — `[ex]` ON_TAKE_DAMAGE 순서가 쿨다운 → `weak[limit]`(취약) → `FixedValueDamage`라 반격 피해 자체가 방금 건 취약(×1.4)을 받음(이전: 피해 뒤 취약).
- 2라운드(아래 「盟约·특질·장비·생성기 2라운드」)에서 炎·萨尔贡·维多利亚·谢拉格·拉特兰·阿戈尔·精准·灵巧·助力·协防, 주둔 이벤트, 乐队, 장비 일부를 대조했다.
  아직 대조 안 함(템플릿 목록은 `autochess_templates_summary.tsv`, 조사 노트): 적 디버프(`act1autochess_debuff_*` 일부), 不屈 3명 SP(`AutochessCreateBuffToSpecifiedChar _filterByMinSp`·`_excludeOwner` — 자기 빼고 SP 가장 낮은 한 명일 수 있음, 미확정). act2 맹약·이 시즌 장비는 아래 「act2 맹약·장비 템플릿 대조」.


## 저지된 적의 자리 (2026-11-02, 공식 클라에서 확인)
출처: 공식 클라(EN 판) `Character._AddBlockee` → `BlockBalancer.CalculateBlockOffset` → `Enemy.RegisterBlocker` → `Enemy._MoveToBlockPosition`.
코드 `server/sim/battle/blocking.js` `blockOffset`·`_moveToBlockPosition`·`_tickBlockMove`, 상수 `constants.js` `BLOCK_MIN_DIST`·`BLOCK_MOVE_TIME`.
- **자리**: 막힌 적은 저지자 중심에서 닿을 때의 offset(적 위치 − 저지자 위치) 그대로 붙잡힌다 — 다가온 쪽에 남고 저지자 앞으로 끌려오지 않는다.
  offset이 0.5(`Character.minBlockDistToTarget`, 이 모드의 저지자 전부 — 장치도 `Trap` → `Token` → `Character`라 같음)보다 짧으면 같은 방향으로 0.5까지
  늘인다(정확히 중심이면 영벡터라 그 자리). 걸어와 닿은 적(접촉 ≈ 0.71)은 움직이지 않는다. 0.5까지 밀려나는 경우: 적 위에 배치·재배치·기습 착지,
  기절·빙결로 멈춘 적 옆에 놓음, 장치 저지(반경 0.4472). 0.5는 칸 경계라 그 적의 칸·사거리·스플래시·기습 `1-1` 상자가 바뀐다.
- **둘 이상 막을 때**: 새 자리가 그 저지자가 이미 막은 적 하나와 0.1 안(거리² < 0.01)이면, 막은 적마다 거리 d < 0.1 → (그 적 − 저지자)에 수직인 단위
  벡터, 0.1 ≤ d < 0.4 → 그 적에서 멀어지는 단위 벡터 × (0.4 − d) × 50을 더해 정규화하고, offset 방향 + 0.2 × 그것의 방향으로 꺾는다(길이는 그대로).
  막은 적의 자리는 `Enemy.stableBlockPosition` = 미끄러지는 중이면 그 목표, 아니면 지금 위치. 한 길로 차례로 걸어오는 적은 같은 접촉점에 닿으므로
  둘째부터는 늘 이렇게 꺾인다(같은 칸에서 옆으로 약 0.19칸).
- **옮김**: 지금 위치에서 목표로 0.2초 동안 직선 보간(`BattleTweenMgr`, 감속 없음). `BattleTweenMgr.Tick`은 `BattleController.OnTick` 맨 앞, 유닛 틱보다
  먼저 돌아 위치를 덮어쓴다 — 우리도 적 루프에서 그 적의 갱신 전에(`_tickBlockMove`).
- **미끄러짐이 일찍 끝나는 때**(2026-11-03, 공식 클라에서 확인): 적 쪽 해제 `Enemy.ReleaseFromBlocker` = 저지자에게서 빠지고 트윈을 `Kill(false)`(그 자리에서
  멈춤, 끝값으로 안 보냄). 부르는 곳: 밀기·당기기(`UnbalanceState.OnEnter`), 블링크(`Blink`·`BlinkWithDirection`), 강제 위치(`ForceSetPositionByWorldCoords`·
  노드 `ForceSetToTilePosition`), `TransportInternal`, 이동 방식 바꿈(`ChangeMotionMode`·`ResetMotionMode`), 浮空(`LevitateState`), 쓰러짐·가짜 죽음·죽음·출구,
  그리고 `Enemy.OnTick`이 매 틱 저지 불가(`isBlockFree` — 不可阻挡·恐惧·诱导·沉睡)를 보면. 우리 `_unblock`이 이것이고(막혀 있지 않아도 미끄러짐을 끝냄),
  `_tickBlockMove`도 그 플래그·숨음을 보면 멈춘다. 저지자 쪽 해제(`Character.RemoveBlockee` → `Enemy.UnregisterBlocker`: 저지자 사망·퇴각·기절, 저지 수 감소)는
  트윈을 두므로 **미끄러짐이 계속된다** — 풀린 적이 걸어도 다음 틱의 미끄러짐이 덮어써 목표까지 간 뒤(끝나는 그 틱에 한 걸음) 걷는다. 우리 `_unregisterBlocker`
  (`releaseBlocked`·`enforceBlockCapacity`·`ai.js` 저지자 쪽 조건). 가상적: 정체(`enemy_9007_acelem`)가 부착하며 저지자 칸 가운데로 闪现하는 것은 적 쪽 해제다
  (2026-11-03, 공식 클라에서 확인: 버프 `enemy_acelem[to_parasitic]`의 `BlinkNode` → `Enemy.Blink(GridPosition)` → `ReleaseFromBlocker`) — 미끄러짐이 끝나고 저지도
  풀리며, 저지자가 다음 탐색(3틱 안)에서 칸 가운데의 그 적을 다시 막는다(아래 「假想敌：淤困」 절).
  이전: 밀기·재배치·풀린 뒤 제 걸음 등 다른 것이 적을 옮기면 그 자리에서 끝냄(옛 추정) — 풀린 뒤 걸음만 달라짐.
- 풀릴 때 남은 적의 자리는 다시 계산하지 않는다(공식도 같음).
- 바뀐 것: 전에는 닿은 그 자리에 바로 두었다(0.5 미만이어도, 여럿이 겹쳐도). golden 이동은 커밋 메시지.
- 테스트 `test/sim/block-position.test.js`(offset 계산, 걸어온 적 그대로, 0.5까지 0.2초 직선, 같은 자리 둘 분리, 미끄러지는 중 밀기·저지 불가가 됨(멈춤)·저지자 퇴각(계속), 실제 대전 경로에서 마터호른(`chess_char_1_02_a`) 칸 위 원석충 둘), 옛 위치를 가정하던 시험 5개(`playtest5_blocking`·`feedback5-frozen-reblock`·`combat`·`feedback1d-push`·`feedback4-sleep-unblock`)를 새 자리에 맞춤.

## 누가 막나 (2026-11-03, 공식 클라에서 확인, 관리자 결정 2026-11-03 「전부 공식대로」)
출처: 공식 클라(EN 판) `Character.OnTick` → `m_findBlockeeTicker.Tick()` → `Character._SearchBlockee` → `FilterUtil.FilterWithVolume`(`Character._CheckBlockable`, `WeightedTarget.CompareTo`, `PriorityQueue.Add`) → `_AddBlockee`.
코드 `server/sim/battle/blocking.js` `_searchBlockees`·`_addBlockee`(아군 틱 `battle/lifecycle.js`), 상수 `constants.js` `BLOCK_SEARCH_TICKS`·`BLOCK_WEIGHT_GAP`.
- **찾는 쪽은 저지자**: 적이 저지자를 고르지 않고, 저지자가 자기 원 안의 적을 찾는다. `Character.OnTick`이 자기 차례(`Unit.OnTick` 뒤)에 티커를 한 칸 돌리고
  `_SearchBlockee`를 부른다 — 우리도 그 아군의 차례에서 공격·버프·스킬 지속시간 뒤, 스킬 틱 앞(아래 「유닛 틱 차례」).
- **주기**: `Character.FIND_BLOCKEE_TICK` 3 — 생성자가 `PeriodicTicker(3, false)`를 만들어 처음 틱에 바로 찾고, 그 뒤 3틱마다(우리 틱 1/30초라 0.1초).
  배치마다 처음부터: 유닛은 풀에서 꺼낼 때 `BObject.OnAllocate` → `Character.OnReset` → 티커 `Reset(false)`(다음 틱에 바로 찾음). 재배치도, 【이동】도
  새 유닛이다(울피아누스 S3의 이동은 `ulpia_s3_switch_mode[born]`의 `ON_OWNER_BORN`이 다시 오고 진행을 공유 블랙보드 `ulpia_respawn`으로 넘김) — 우리
  `deploy.js`·`tiles.js moveRedeploy`(2026-11-03에 【이동】도 맞춤). 걸어오는 적은 닿은 뒤 다음 탐색까지 최대 두 틱을 더 걷는다(속도 1이면 약 0.07칸).
- **차례**: 원 안의 후보 중 `Enemy.CheckBlockable`(저지자 없음·不可阻挡/浮空/恐惧/沉睡 아님 등)과 남은 저지 수를 통과한 적을, 저지자와의 거리²를 0.01 단위로 내림한
  값(`FilterUtil.DEFAULT_SMALL_ENOUGH_GAP` = 0.01, `CompareTo`의 `floor(무게 / 간격)`) 작은 순으로 — 가까운 적 먼저. 차례대로 그 적의 저지 무게(`Enemy.blockVolume`)가
  남은 수에 들어가면 막고, 안 들어가면 건너뛰고 다음 적. 같은 단위끼리는 필드에 나온 차례: `Entity.CompareTo` = `instanceUid` 비교, 그 번호는
  `BObject.OnAllocate`가 전역 카운터로 매김(아군·적·투사체 한 줄) — 우리 `deploySeq`(같은 카운터로 적·아군에 매김).
- **저지자 둘이 한 적에 닿을 때**: 먼저 찾은 저지자가 막는다(가까운 쪽이 아님). 탐색 위상은 저지자마다 배치 시각에 따르고, 같은 틱이면 **먼저 배치된 쪽**:
  유닛은 `ObjectManager.OnFixedUpdate`가 `BObject.CompareTo` 차례로 틱한다 — `priority` 큰 것 먼저, 같으면 `instanceUid` 작은 것 먼저이고, 전투 유닛은 아무도
  `priority`를 재정의하지 않는다. 우리도 모든 유닛을 `deploySeq` 한 줄로 틱한다(`lifecycle.js` `_tickUnits`, 아래 「유닛 틱 차례」). 재배치하면 번호가 새로라 뒤로 간다.
- **저지자가 기절·不可阻挡이면** 그 틱에 막은 적을 모두 풂(`OnTick` → `_ClearAllBlockees`) — 우리는 적 쪽에서 `noBlock`·`sleep`을 보고 품(전과 같음).
- **저지 수가 줄면**(2026-11-03 확인) `Character.UpdateBlockees`가 무게 합이 새 저지 수에 들어갈 때까지 하나씩 푼다 — `BlockedEnemyManager.TryPickOneToRemoveIfVolumeExceeded`는
  목록의 **마지막**(목록은 `Add` 차례 = 막은 차례, `Remove`가 차례를 지킴) = 가장 나중에 막은 적을 고르고, `RemoveBlockee`꼴(`Enemy.UnregisterBlocker`, 저지자 쪽 해제)로
  풀어 미끄러짐은 계속. 우리 `ai.js enforceBlockCapacity`(`blocking.pop()`, `blockMove`를 안 건드림)가 같음 — 시험만 더함(`block-position` 「block count drop」).
- **즉시 탐색**(`Character.SearchBlockeeImmediate` = 살아 있으면 `_SearchBlockee(true)`: 티커를 기다리지 않고, 마침 차례였으면 티커를 새로 돌림) — 우리
  `searchBlockeeImmediate`(틱 전의 칸 색인이 낡아 필드의 적 전부를 훑음). 부르는 곳:
  - 당기는 투사체가 살아 있는 대상에 붙은 채 멈출 때(`HarpoonProjectile`·`NetCatcherProjectile`·`PullHitTargetBehaviour` `.OnProjectileStop`) **쏜 유닛**이 찾는다.
    이 모드에서 그 투사체(프리팹 컴포넌트로 확인)를 쓰는 당기기: 클리프하트 S2(`projectile_slchan_s2`), 글래디아 S1·S2·S3 마지막 捕网(`projectile_chr_glady_s1`·
    `_s2`·`_s3_3`), 가비알 디 인빈서블 S2(`projectile_chr_gvial2_s2`, S2 공격 버프), 울피아누스 S1 닻(`projectile_chr_ulpia_s1`), 데겐블레허 S3(`projectile_chr_blkkgt_s3`·
    `[end]`) — 각 키트가 당긴 뒤 부름. 우리 당기기는 순간이라 「멈출 때」 = 당긴 직후.
  - 노드 `CharSearchBlockeeImmediate`: 무에나(해방자) `mlynar_s_cast`의 `ON_BUFF_START` — 스킬을 켜면 그 자리에서 막는다(`professions.js installLibrator`).
    다른 쓰는 곳(`takila_s_cast`·`leizi2_s_cast`)은 이 모드에 없고, 트라고디아 牢笼 둘은 아래.
- **트라고디아 S3 「광란의 감옥」(迷狂牢笼, `token_10055_phatm2_mndclv`)** = 클라 `PropLikeStaticBlockToken`(핫픽스 `Phatm2TokenHitRangeProvider`가 그 안의 클래스):
  `_SearchBlockee`는 한 번만(`m_checkedBlock`), 다시는 강제일 때만 — 갱신 버프(`FilterId` 牢笼 → `CharSearchBlockeeImmediate`)와 `token_phatm2_mndclv[passive]`
  (`ON_OWNER_BLOCK_MODE_CHANGED`). 찾을 때마다 막던 적을 모두 풀고(`_ClearAllBlockees` — 그 적들의 미끄러짐은 계속), HP를 채우고(`hp + maxHp`), 적 전부를
  `_CheckBlockable`(무게·부피 0 → 엔티티 차례, 남은 수 128)로 걸러 통과한 적을 모두 막는다 — `Enemy.CheckBlockable`: 저지자 없음, `CheckInBlockRange`(지상
  저지 원 0.7071: 표 문구 「本格」과 달리 옆 칸 0.21까지), 살아 있음, 저지 불가 아님, 이동 방식은 안 봄(프리팹 `_ignoreBlockMode` 1, `_blockMode` 0 → 공중도).
  저지 수 = 막은 적 무게 합(`get_blockCnt` = `blockedTotalVolumn`), 막은 적이 없으면 그 틱에 스스로 사라짐(`OnTick` → `Suicide`). 자리는 `BlockeeOffsetPosSet`:
  중심에서 0.2(`DIST_MAX`)보다 멀면 같은 방향으로 무작위 [0, 0.2) 거리(전투 난수 `Range`), 가까우면 그 자리 — 0.2초 미끄러짐으로 끌려옴. 우리 `op-phatm2.js cageBlock`
  (2026-11-03): 이전엔 그 칸(반올림) 위의 적만, 끌어당김 없음, 갱신 때 새 적만 더함. 클라는 牢笼의 첫 틱에 찾고 우리는 생기는 그 틱에 찾음.
  그 밖의 장치(`Trap` → `Token` → `Character`)는 오퍼레이터와 같이 찾는다.
- 바뀐 것: 전에는 적마다 매 틱, 닿은 저지자 중 가장 가까운 저지자(옛 추정)가 막았고, 한 저지자에 여럿이 같은 틱에 닿으면 적 업데이트 차례가 먼저인 적이 들어갔다.
  golden 이동은 커밋 메시지.
- 함께 고친 것: 앞으로 뛰는 적 스킬(`blinkForward`, 卢西恩 `enemy_2016_csphtm`의 블링크 등)이 경로가 비어 있으면(밀기·저지 자리 미끄러짐 뒤 `route.pts` = null)
  다음 체크포인트로 곧장 뛰다 벽 칸에 떨어져 매번 취소되던 것 — 이제 그 자리에서 경로를 다시 짜고 길을 따라 뛴다(`archetypes.js blinkForward` → `ai.js planLeg`).
  0.5 밀림 뒤 「余 S2로 끌려온 卢西恩이 余에게 막혀 영영 못 뜀」으로 드러남(`feedback2-whitw2-yu` 실제 보스 판).
- 테스트 `test/sim/block-search.test.js`(3틱 주기, 가까운 적 먼저, 무거운 적 건너뜀, 같은 단위면 필드 차례, 즉시 탐색), `playtest5_blocking`의 「먼저 찾은 저지자」(재배치로 위상을
  어긋나게)·「같은 틱이면 먼저 배치된 쪽」, `op_phatm2`의 牢笼 저지 원·끌어당김·갱신, 다음 탐색을 기다리게 바꾼 시험들(`block-position`·`playtest5_blocking`·`feedback5-frozen-reblock`·`feedback4-sleep-unblock`).

## 유닛 틱 차례 (2026-11-03, 공식 클라에서 확인, 관리자 결정 2026-11-03 「공식대로 바꿈」)
출처: 공식 클라(EN 판) `BattleController.OnTick`(맨 앞 `BattleTweenMgr.Tick`, 그 뒤 `ObjectManager.OnFixedUpdate`), `ObjectManager.OnFixedUpdate`·`Register`, `BObject.CompareTo`·
`get_validAndBorned`·`OnAllocate`, `Entity.OnTick`, `Unit.OnTick`, `Character.OnTick`, `BasicSkill.Tick`·`OnTick`·`UpdateSpRecovery`·`get_isAffecting`·`OnSkillEnd`, `CastSkill.OnTick`·`OnCastFinish`,
`Abilities.ActiveBuffAbility.OnTick`·`<OnWaitForPostDelay>`·`_ResetCooldownTimerIfNeeded`·`_CheckNotAllFinished`, `Buff.BuffContainer.Tick`, `DoubleBufferedList.GetEnumerator`·`Add`,
`Buff.SortedDoubleBufferedBuffList.Add`, `LitePhysicsUtil.FindTargetsInBox`.
코드 `server/sim/battle/lifecycle.js` `_tickUnits`·`_tickAlly`, `skills.js` `tickActive`·`tick`, `battle/status.js` `_tickUnitBuffs`, `battle/queries.js` `_indexEnemy`.
- **한 줄**: 전투 객체는 모두(적·오퍼레이터·소환물·장치, 투사체도 `BObject`) `ObjectManager`의 한 줄에서 `BObject.CompareTo` 차례로 각자 틱한다 — `priority`(전투 객체는 아무도
  바꾸지 않음) 다음 `instanceUid` 작은 것 먼저. 번호는 풀에서 꺼낼 때(`BObject.OnAllocate`) 하나의 카운터로 — 재배치·【이동】은 새 번호. 우리 `deploySeq`(같은 카운터로 적·아군에 매김).
  틱을 시작할 때 `validAndBorned`(태어났고 번호가 있음)인 것만 `m_cachedList`에 옮겨 그 차례로 돈다 → 그 틱 안에 생긴 것(배치·출현·소환)은 다음 틱부터, 차례 전에 쓰러진 것은 건너뜀.
- **트윈 먼저**: 저지 자리 미끄러짐(「저지된 적의 자리」의 0.2초 트윈)은 어느 객체보다 먼저 — 우리는 줄을 돌기 전에 모든 적의 `_tickBlockMove`.
- **적의 틱**(`Enemy.OnTick` → `Unit.OnTick` → `Entity.OnTick`): 상태 기계(이동·공격) → `BuffContainer.Tick` → HP 회복 → SP → 능력들. 우리 `updateEnemy` → `_tickUnitBuffs`(버프, HP 회복).
- **아군의 틱**(`Character.OnTick`): `Unit.OnTick`(위와 같이 공격 → 버프 → HP 회복) → 저지 불가·기절이면 막던 적을 풂 → 저지 탐색(「누가 막나」) → `BasicSkill.Tick`
  (`OnTick`: SP 회복 `UpdateSpRecovery`, 스킬 끝 기다림·침묵·과부하; 그 뒤 스킬 동작들). 우리 `updateAlly`(장치는 공격 없음) → `_tickUnitBuffs` → `skill.tickActive`
  (진행 중 스킬의 `onTick`·지속시간) → `_searchBlockees` → `skill.tick`(SP, 자동 시전).
- **스킬 지속시간**: 지속 스킬의 능력(`ActiveBuffAbility`)은 수명 = 쿨다운(그 버프들 지속시간의 최댓값)이고, 쿨다운 타이머는 `Entity.OnTick` 끝의 능력 틱(`Ability.OnTick`)에서,
  스킬 버프는 그 앞 `BuffContainer.Tick`에서 줄어든다 — 둘 다 저지 탐색 앞. 능력이 더는 효과 중(`isAffecting` = 시전 중이거나 쿨다운이 남음)이 아니면 `BasicSkill.OnTick`이
  (`m_waitForSkillEnd`일 때) `OnSkillEnd`를 부른다. 그래서 끝나는 틱의 저지 탐색은 스킬 효과 없이 한다. 우리는 지속시간이 다 되는 순간 끝(`end('duration')`)까지 한 번에 하므로
  스킬의 끝 처리(`onEnd`)도 저지 탐색 앞(공식 `OnSkillEnd`는 탐색 뒤 — 스킬 버프는 이미 끝난 뒤라 효과는 같음). 진행 중 스킬의 `onTick`도 같은 자리(스킬 버프의 틱 자리).
- **투사체**: `Projectile`도 `BObject`라 쏠 때 같은 카운터로 번호를 받아 같은 줄에서 자기 차례에 날고 맞힌다(`ObjectManager.Register`가 `projectiles` 목록에도 넣음).
  쏜 틱에는 줄에 없어 다음 틱부터 난다. 우리 `projectiles.js` `seq`·`firedAt`·`step` — 줄 앞의 타이머(`battle.after`)나 줄 뒤의 자동 발동에서 쏜 것도 쏜 다음 틱부터
  (공식은 쏘는 쪽이 자기 틱 안에서 쏨). 전에는 아군 단계 뒤 투사체 단계에서 전부 옮긴 뒤 몰아서 맞혔고, 아군이 그 틱에 쏜 것도 그 틱에 한 칸 날았다.
- **버프**: 주인의 틱 안에서. 목록을 도는 동안 붙은 버프만 다음 틱부터 돌고(`DoubleBufferedList.GetEnumerator`가 바깥 순회를 시작할 때 목록을 `m_cachedBuffer`로 베껴 그것을
  돌고, `Add`는 원래 목록에 — 버프 목록은 `onEventPriority` 자리에 끼움), 앞 차례 유닛이 붙인 버프는 주인 차례인 그 틱에 바로 한 번 준다.
- **칸 색인**: 공식 범위 질의(`LitePhysicsUtil.FindTargetsInBox`)는 색인 없이 그 진영 유닛(`UnitManager.GetUnitsBySingleSide`)마다 지금 자리를 본다(`_CheckContainsPosition`).
  우리 칸 색인은 그와 같게 — 줄을 돌기 전에 모든 적을 지금 자리에 두고, 적마다 자기 틱 뒤에, 다른 유닛이 옮기면 그 자리에서(`displacement.js displace`의 밀기·당기기, 위 `char_2026_yu`의
  순간 이동, 숨김·드러남 `_setHidden`) 다시 둔다 → 앞 차례 적은 이번 틱에 간 자리, 뒤 차례 적은 서 있던 자리로 보인다.
- 그대로 둔 것: `battle.after` 타이머·출현·DP는 줄 앞, 자동 발동(`AutoChessBattleTrigger`, 코루틴)·재배치는 줄 뒤.
- 바뀐 것: 전에는 단계로 — 버프(전원) → 적(전원) → 칸 색인 → 저지 탐색 → 아군(전원, 스킬 틱 → 공격) → 자동 발동 → 투사체(전부). 보이는 차이: 배치 차례(보드 위치, 「작전 시작 차례 배치」)가 틱 차례라서
  보드를 돌리면 같은 틱의 경쟁 차례가 바뀐다(에이야퍄들라 더 크비트 아스카 `char_1016_agoat2`의 치료가 도우미들 틱과 겨룸 — `facing-invariance` 예외); 아군의 첫 휘두름은 첫 저지
  탐색보다 먼저; 앞 차례 저지자가 막은 적은 그 틱 자기 차례에 바로 공격(상자를 막힌 그 틱에 부숨); 다른 유닛 차례에 생긴 버프는 그 틱에 한 번 줄어듦. golden 이동은 커밋 메시지.
- 테스트 `test/sim/tick-order.test.js`(한 줄 차례, 그 틱에 생긴 유닛, 칸 색인·밀린 적, 스킬 지속시간 → 저지 탐색, 투사체), 고친 시험 `battle`·`pathing`(상자: `blocked` 이벤트로 봄)·`attack-timing`(둘째 휘두름)·`feedback1-transform`(重生 한 틱)·`facing-invariance`·`robustness`(강제 종료 시각), 투사체가 한 틱 늦게 떨어져 세는 창을 늘린 시험(`attack-forms` 라플란드 S2, `kits_alt_t4` 산크타 믹사파라토, `kits_t4` 그노시스 坚冰(오라 0.1초 주기), `standin_acsupo` 三形, `standin_sharp2` 샤프 S1).

## 적이 걷는 법 (2026-11-04, 공식 클라에서 확인, 관리자 결정 2026-11-04)
제보: 전장#04 활성 오리지늄(`act1autochess_m04`), 아래쪽 침입 포인트 (9,10), (9,8)·(10,8)에 오퍼레이터, (9,9)는 비었음. 위쪽이 쓰러지면 아래쪽이 살카즈 대검사(`enemy_1010_demon`)를 막지 못하고 통과시켰다.
원인: 8~13라운드 웨이브(`act1autochess_h01`~`h06`)의 이 침입 포인트 경로는 체크포인트 (9,9)를 거친다. 우리 적은 칸 중심에서 칸 중심으로 걸어 (9,9) → (10,8)을 정확히 대각선으로 갔고, (9,8)까지 거리²가 0.50005라 저지 원(0.49999)에 닿지 않았다. 체크포인트 없는 1~7라운드 경로는 막혔다.
출처: 공식 클라(EN 판) `Enemy._MoveByCursor`, `DirectionCursor`(`PredictReached`·`GetNextDirection`·`OnTick`·`CheckReached`), `BasicCursor.MoveCheckpoint`(`GetNextDirection`·`CheckReached`), `Route.CheckReached`, `MoveController`(`CalculateMoveDelta`·`CalculateTotalForce`·`_CalculateSteeringForce`·`CalculateIsHanging`·`_CalculateObstacleAvoidForce`·`Reset`), 레벨 파일 `options.steeringEnabled`·경로 `visitEvery*`, 적 프리팹 `MoveController`. 코드 `server/sim/ai.js` `walkRoute`·`obstacleAvoidForce`·`advanceRoute`.
- **방향**: 매 틱 지금 칸의 `next[칸]` 중심을 향한다(이 모드의 모든 경로 `visitEveryTileCenter`·`visitEveryNodeCenter`·`visitEveryCheckPoint` false). 칸에 들어서는 순간 꺾고, 칸 중심을 거치지 않는다. 그래서 위 경로의 적은 (10,8) 칸에 들어서며 (10,4)로 꺾어 (9,8)의 저지 원을 지난다. 우리 `next`는 그대로(바닥을 덜 지나는 선호 포함, 「`grid.js`」 머리말).
- **체크포인트·도착**: 목표까지 0.05 안이면 다음 다리로(`reachDistance`는 이 모드 전부 0, 공식은 max(0.05, 값)), 경로 끝도 그 칸 안 0.05면 도착. 다음 체크포인트·끝이 한 걸음 안이면 그 자리에 놓는다(속도는 그대로). 끝난 다리는 그 틱에 다음 다리가 이어 받는다(WAIT 하나가 한 틱).
- **속도(조향)**: 모든 레벨 `steeringEnabled` true. 힘 = 벽의 힘 + (방향 × 속력 − 속도) × 조향 계수, 크기 최대 `_maxSteeringForce`. 새 속도 = 속도 + 힘 × dt, 크기 최대 속력. 이 모드 프리팹은 계수 8·최대 10이 기본, 비행 적 10종(`enemy_1005_yokai`·`_2`·`_3`, `enemy_1017_defdrn`, `enemy_1040_bombd`, `enemy_1041_lazerd`·`_2`, `enemy_1042_frostd`, `enemy_1112_emppnt`·`_2`)은 20·100, `enemy_2050_smsha`는 8·100. 속도는 출현 때(`Enemy.OnReset` → `MoveController.Reset`) 0이고, 저지·공격으로 서도 지워지지 않는다. `SeparateMoveController`(적끼리 밀어내기)를 쓰는 적은 이 모드에 없다.
- **벽의 힘**: 이동하는 틱 3번마다 읽어(첫 이동 틱에 바로) 방향에 수직인 성분만 남기고, 매 틱 max(0.5, 속도/속력)배로 더한다. 이웃 8칸 중 걸을 수 없거나 상자(지상만)인 칸에 대해, 발 위치의 몸 가장자리(좌우로 `_halfBodyWidth` 0.2, 상하로 0)가 칸 중심에서 그쪽으로 0.25를 넘으면 민다. 옆 칸은 그 축으로, 모서리 칸은 두 축이 다 넘을 때. 합을 길이 1로. 걸을 수 없는 칸에 서 있으면 가장 가까운 걸을 수 있는 이웃 쪽으로.
- **발 위치**(2026-11-07, 공식 클라에서 확인): 위 가장자리는 위치가 아니라 `MoveController._GetFootMapPosition`(위치 + `m_footOffset`, `OnStart`에서 `footMapPosition` − 위치)에서 잰다. 서 있는 칸은 위치로 정한다. 발 점은 애니메이터의 `footTransform`(Spine)이고, 값은 프리팹 `Graphic` y다: 이 모드 적 249종 중 203종 −0.2, 25종 −0.202, 8종(`msf` 계열) −0.33·−0.45, 비행 적 등 12종 0(`server/sim/walk.js` `FOOT_BY_ENEMY`). 그래서 지상 적은 아래쪽 벽에 더 일찍, 위쪽 벽에 더 늦게 밀린다: 복도 가운데 줄에서는 양쪽 다 밀지 않고, 위치가 칸 중심 아래로 0.05를 넘으면 위로, 위로 0.45를 넘으면 아래로 민다. 위쪽 벽에 얕게 다가가면 튕김(칸 중심 방향 기준 반사)을 지나 벽 칸에 0.02칸쯤 들어갈 수 있다. 공식 식도 같다. 맵 앵커(`Map.anchorTransform`)의 축척은 1로 본다 [추정·엔진: 씬의 앵커 값은 안 읽음].
- **체크포인트 `reachOffset`**(2026-11-07, 공식 클라에서 확인): `MoveCheckpoint.OnBegin`이 `m_offset`을 값으로 두고(`randomizeReachOffset`은 이 모드 전부 false), 목표는 칸 중심 + 오프셋이다(`get_targetPos`, 다음 칸이 목표 칸일 때의 `GetNextDirection`, `CheckReached`). 값이 있는 경로는 `act1autochess_escaped_single` 3경로(비행, 칸 가장자리까지 ±0.5)와 `act2autochess_h07_05` 1경로·`_s` 1경로(지상, 네 체크포인트의 `(9,5)` 근처). 데이터는 `[행, 열, d행, d열]`, 단계는 `{ t: 'move', p, o }`(`tools/build-data.mjs resolveRoute`). 경로 미리보기와 남은 거리의 뒤쪽 다리는 칸 사슬 그대로 둔다.
- **튕김**: 한 걸음이 걸을 수 없는 칸으로 넘어가면 그 칸 중심 방향을 기준으로 걸음을 반사한다. 전에 있던 「칸 중심으로 돌아갔다 가기」는 공식에 없어 지웠다.
- **벽 칸**(2026-11-15, 공식 클라에서 확인): 걸을 수 없는 칸에 선 지상 적(벽 가장자리를 튕김으로 스친 몸, 밀리거나 끌린 뒤 남은 속도로 넘어간 몸)은 그 칸의 경로 노드에 거리가 없어(`Route.Node.isValid` = 거리 ≥ 0이 거짓) `MoveCheckpoint.GetNextDirection`이 방향 0을 준다. 그래서 조향은 속도를 줄이기만 하고 벽의 힘이 가장 가까운 걸을 수 있는 이웃 칸으로 꺼낸다(`server/sim/walk.js` `inWallTile`, `ai.js walkRoute`·`walkCursor` 둘 다). `Enemy._MoveByCursor`의 「무효 칸」(`Map.CheckGridValid`)은 맵 밖만이다(`GetDirectionToGoBackFromInvalidPos`). 전에는 그런 칸에서 다리 목표(경로 끝)로 곧장 걸어 벽을 뚫었다 — 제보: 전장 #05 오리지늄 기류 발생 장치(`act2autochess_m01`, 규정 `act3autochess_m05`도 같은 꼴)에서 방어 포인트 오른쪽 (9,3)–(9,5)에 오른쪽을 보게 둔 글래디아(`char_474_glady`) S3의 마지막 捕网(자기 앞으로 당기기)이 벽 (9,6) 건너편 적을 벽에 붙이고, 그 적과 그 사망 소환물(모룽 `enemy_1195_sfyin`의 목제 인장 `enemy_1196_msfyin` 등, 아래 「사망 소환물의 자리」)이 벽 칸에 들어가 벽을 지나 글래디아 쪽으로 왔다. 재발 방지: `test/sim/wall-tile-walk.test.js`.
- **저지 원 경계**: `Character.CheckInBlockRange`는 거리² ≤ 반경²(우리 `<`를 `≤`로).
- 恐惧·诱导·추적(2026-11-07, 공식 클라에서 확인): `Enemy.FearController`·`AttractController`·`TracePositionCursor`가 각자 `DirectionCursor`를 들고 같은 `_MoveByCursor`로 걷는다. 그래서 경로 걸음과 같은 한 걸음(`server/sim/walk.js` `walkCursor`·`steerStep`)을 쓴다: 다음 칸 중심, 조향, 벽의 힘, 튕김, 한 걸음 안이면 그 자리에 놓임. 고른 지점의 칸에 들어서면 그 지점(칸 중심 + `reachOffset`)으로 향한다. 恐惧는 지점까지 0.05 안이면 다음 지점을 고른다. 속도는 경로 걸음과 이어진다(恐惧가 끝나도 지우지 않는다). 밀려난 뒤에는 남은 속도 때문에 벽 칸에 몸이 0.08칸쯤 들어갔다 벽의 힘으로 돌아올 수 있다. 전에는 직선 걸음에 조향이 없었다.
- 그대로 둔 것: 경로 미리보기(`routePreview.js`)는 칸 사슬 그대로. 화면으로는 아직 확인하지 않았다 [화면 미확인].
- 예전 판: v0.1.0은 이 경로에서 9행을 따라 걸어 막혔고, v0.2.5부터 대각선 경로로 못 막았다(표본 태그만 돌림).
- 테스트 `test/sim/enemy-walk.test.js`(제보 재현 + 실제 판 경로, 칸 재계산, 조향, 벽의 힘, 전 스테이지 경로 도착). 제보 재현 네 건은 고치기 전에 실패함을 확인.

## 사망 소환물의 자리 (2026-11-15, 공식 클라에서 확인)
- 공식: 사망 소환 템플릿 `enemy_dead_spawn`(모룽·첸사 등의 `DeadSpawn`, `enemy_dead_spawn[sfji]`도 같음)은 `SummonEnemiesFollowMyRoute`(`_useMapPosition` 1, `_randomOffsetBound` 0.5, `_passableMask` WALK_ONLY, `_useRandomDelay` 0.7)다 — 본체 자리에서 흩뿌린 점을 경로가 닿는 칸일 때만 쓰고 아니면 본체 자리(sim.md 「규정 적·보스」의 소환 노드와 같은 `Route.CheckReachable`).
- 우리: 흩뿌림은 예전대로 0.2 간격 나란히(무작위 0.5와 지연 0.7은 모델 안 함 → `bundles/` sim-D 줄)지만, 지상 본체의 소환물은 그 점이 걸을 수 있는 칸일 때만 쓰고 아니면 본체 자리, 본체 자리마저 벽 칸이면(벽을 스친 몸) 가장 가까운 걸을 수 있는 칸 안으로 0.45까지 당긴다 [추정·엔진: 공식 본체는 벽 칸에 서지 않는다고 봄] (`content/enemies/helpers.js` `groundSpot`). 비행 본체(枯朽萃聚使徒)의 소환은 그대로.
- 전에는 벽에 붙어 죽은 본체의 소환물이 0.1 옆 벽 칸에 생겨 위 「적이 걷는 법」 벽 칸의 옛 걸음으로 벽을 뚫었다. 재발 방지: `test/sim/wall-tile-walk.test.js`(두 시즌 모든 지상 적을 벽에 붙여 쓰러뜨려 소환물이 걸을 수 있는 칸에 서는지 훑음, 제보 판 재현).

## 盟约·특질·장비·생성기 2라운드 (2026-10-11, 관리자 결정 「동작 변경 모두 공식이랑 동일하게」)
출처: EN 클라(2026-08) 버프 템플릿 그래프와 공식 클라(EN 판; 레포에는 클래스·메서드 이름만). 핫픽스(DefinedFix.lua en/zh)에 아래 클래스 없음.
이때 관리자 결정이 필요했던 세 가지(阿戈尔 吞噬가 팀원 오퍼를 먹는가, 특질 `attrByBond`의 배치 때 고정, 桑葚 미러 판 「가장 오른쪽」)는 관리자 결정 2026-10-11로 정했다(아래 「阿戈尔 吞噬 팀원」·「特质 attrByBond」·「桑葚」).
- **谢拉格 6명 寒风 = 필드당 하나**: 그래프 `act1autochess_bond_eff_kjerag`의 `[env]`는 맵 컨트롤러에 붙는 하나 — `AutoChessAssignBondCharCntToBB(_filterAllSides)`
  = 플레이어별 인원의 최대 ≥ 6이면 `[storm]` 하나, 지속 20 + 0.1 × 층의 층은 `AutoChessAssignBondStackCntToBB(_assignAllPlayerIndex)` = 플레이어별 층의
  최대. 그래서 공동 필드(联防·보스)에서 둘 다 6명이어도 바람은 25초마다 한 번(이전: 플레이어마다 하나 → 寒冷 두 번 = 冻结), 6명이 아닌 팀원의 층이 더 높으면
  그 층. `bonds/nation/kjerag.js installKjerag`(전투 저장소에 하나), `devices.js kjeragColdWind`. 테스트 `test/content/bonds_core.test.js` 「谢拉格 6 on a shared field」.
- **拉特兰 탄약**: `AmmoSkillCountModifier`(`_modifyMaxCount`·`_addCountUsePercent`) → `CastSkillWithLimitTimes.SetMaxAdditionCountPercent` →
  `_UpdateMaxAdditionCount`: 더하는 탄 = `MathUtil.RoundToInt(f32(원래 최대 탄) × f32(Σ비율))`, `FP.Round`는 .5에서 짝수로. 즉 원래 최대 탄 기준·반올림·
  최대 탄에 더함(이전: floor(남은 탄 × (1.05 + 0.015·층))). 8발·10층: +2(이전 +1), 10발·0층: 0.5 → +0. `bonds/nation/laterano.js lateranoAmmo`.
  모델 안 함: 공식은 층이 바뀔 때마다(`_checkDiffWithOldStoreCnt`) 최대 탄을 다시 정함 — 우리는 스킬 시작 순간의 층.
- **灵巧 오라 = 배치 때 한 번 판정**: 그래프 `act1autochess_bond_eff_skillful` ON_BUFF_START의 `AutoChessFilterCharacterBondIds(_checkTargetInRangeId "x-4")`(
  `LitePhysicsUtil.FindTilesInBox`로 받는 쪽 칸 둘레 3×3, 칸마다 `AutoChessBattleUtil.GetChessInstByPos`의 말 → 맹약) — 멤버 말이 없으면 버프 끝, 있으면 `x-5`(십자, 자기 칸
  포함)로 `in_normal_range`. ON_BUFF_TRIGGER(층 변화)는 층 ≥ 40이면 공속, 아니면 `in_normal_range`일 때만. 그래서 받는 쪽이 **배치될 때** 판정하고 필드에 있는 동안
  유지 — 멤버가 물러나거나 쓰러지거나 옮겨도 이미 받은 쪽은 그대로, 값은 지금 층. 멤버 말 위치 = 서 있는 칸, 아니면 기다리는 칸(쓰러졌으면 몸 칸, 아니면 집 칸) —
  작전 시작 차례 배치에서 먼저 나온 오퍼도 아직 안 나온 멤버의 말을 봄. 이전: 0.25초마다 다시 계산(쓰러진 멤버만 몸 칸에서 계속, 물러난 멤버는 끔).
  **[추정]**: 물러난(쓰러짐 아닌) 멤버의 말도 집 칸에 있는 것으로 셈; 재배치·기습 착지는 새 배치라 다시 판정, `relocate`(deploy move)는 판정 유지; 받는 쪽은 오퍼레이터만.
  `bonds/addon/battle.js judgeAura`. 테스트 `test/content/bonds_addon.test.js` 「灵巧」.
- **特质 `gar_event_selfkillenemy` 처치 수**: 그래프가 `current_cnt`를 ON_BUFF_START(배치마다)에 0으로 — 재배치하면 처음부터 셈(이전: 전투 내내 이어짐).
  `garrisons/effects/events.js`(`deploy`, move 제외). 테스트 `garrisons_battle.test.js` 「selfkillenemy」.
- **特质 `respawnTimeByBond`(耀骑士临光 garrison_144)**: EN 템플릿에 이 키가 없고 비슷한 `act1autochess_gar_eff_respawnByBond`(퇴장 때 카드 버프, 층/divide **floor 없음**)만
  있다. CN의 새 템플릿일 수 있어 그대로(floor 단계 + 상시 재배치 배율).
- **炎 9명 炎佑 ATK ×1.5 = 전체 ATK**: `bond_eff_yan[long]`이 ATK FINAL_SCALER(`content/tokens.js spawnYanyou`의 [ASSUMED] 삭제).
- **突袭手雷·催泪瓦斯·战栗维式重锤 = 모든 피해 출력**: `acarm064[core]` ON_OUTPUT_DAMAGE, `acarm058` ON_OUTPUT_MODIFIER `IsDamage` → Dice, `acarm045` ON_OUTPUT_DAMAGE `IsDamage`
  + `CheckBuildableType MELEE` → Dice — 스킬 피해·광역의 각 대상·지속 피해도(이전: 일반 공격 대상만). 원소 손상(게이지)·장비 발동 피해·막타는 뺌 [추정: 원소 손상은
  `IsDamage` 아님]. `items/shared.js onDamageEnemies`. 테스트 `test/content/items.test.js` 「every damage instance procs」.
- **浓缩嗅盐 면역 목록**: `acarm059` `abnormalImmunes` FROZEN·SILENCED·STUNNED·LEVITATE + `abnormalComboImmunes` SLEEPING → 冻结·沉默·晕眩·浮空·睡眠(麻痹 빼고 沉默 넣음).
  모델 안 함 [추정]: 공식 면역은 버프라 HP가 70 % 위인 동안 이미 걸린 기절도 눌릴 수 있음(우리는 새로 걸리는 것만 막음).
- **拉特兰桥夹**: `acarm057` ON_SKILL_START에 `triggered = 0`, ON_AFTER_ATTACK에서 스킬 중·`triggered == 0`·남은 탄 ≤ 1이면 먼저 `triggered = 1` 후 Dice → 성공 시
  `AmmoSkillCountModifier.Execute` = `RecoverEventCount(MathUtil.CeilToInt(f32(maxCount) × 0.4))`(maxCount = 拉特兰 탄 포함 그 시전의 최대), 배치당 최대 3회.
  즉 **스킬 한 번에 한 번만 굴림**(이전: 1발이 될 때마다).
- **失衡 — 벽에 막힌 밀기**: `Enemy.States.UnbalanceState`는 시간표가 아니라 물리 — `OnTick` → `_UpdateFriction`이 매 프레임 마찰로 속도를 줄이고
  속력 ≤ 0.1이면 끝. 벽(고지대·맵 끝)이 막으면 그 자리에서 멈춰 끝난다 → 우리 길이 = 막히기까지 걸린 시간(행의 位移时间 T 동안 균등 감속으로 멈추는 운동에서
  `T·(1 − √(1 − 간 거리/거리))`), 최소 0.1 s(PRTS 失衡硬直). 2026-10-31 공식 클라에서 확인: `_UpdateFriction`은 매 프레임 속력 −= 마찰 계수 × 중력 × 질량 × 0.5 × dt
  (균등 감속), 끝은 속력 ≤ 0.1이면서 `OnEnter`가 둔 최소 시각(그때 시각 + 0.1 s)이 지났을 때 — 둘 다 시뮬과 같음. `displacement.js wallHold`. 이전 추정
  「벽에 막혀도 그 행의 시간」 삭제. 테스트 `test/sim/unbalance.test.js`.
- **적 생성기 예외** (`server/match/waves.js`, 지금 데이터에서는 안 일어남): 클라 `_GenerateRandomEnemyData` — 그 유형 후보가 없으면 그 라운드는 뽑기 없음(이전:
  SPECIAL로 다시 뽑기); `_DoReplaceActionDataClient` — 뽑기가 없거나 뽑힌 키에 적 데이터가 없으면(`LogError` 후 false) 자리표시 액션은 `isValid = false`
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
  `AutoChessTriggerGarrisonAbility` → 공식 클라 `AutoChessGarrisonManager._TriggerGarrisonStatusRefresh` → `ScenePlayerData.AddBondCount`는
  켜지지 않은 맹약(`GarrisonBond.isActive` false)에 층을 주지 않는다 → `requireActive: true`, 调和 멤버(调和가 켜져 있을 때 — `support isMember`)도 쓰러지면 셈. 이전: 켜짐
  확인 없음(위 2라운드 D1은 그래프 노드만 본 판정), 자기 맹약만. 전투 중 층 증가 중 `requireActive: false`였던 곳은 이것뿐(특질 `gar_event_*`는 이미 true). 준비 단계의
  층(서버 규칙 SERVER_PREP_*: `bands/meta.js` prep_finish_char_bond_add_layer, `choices.js` addLayer, `server/match/builtinMeta.js` 장비, 특질 「无需激活盟约」)은 클라
  경로가 아니라 그대로. 테스트 `bands.test.js` 「克莱门莎」(실제 경로 포함).
- **特质 attrByBond = 배치 때 계산 — 관리자 결정 2026-10-11 「클라대로」**: 클라 버프 템플릿 `act1autochess_gar_eff_attrByBond`는 노드가 모두 ON_BUFF_START에 있다
  (`AutoChessAssignBondStackCntToBB` → 층 ÷ divide_num `_finalFloor` → 능력치마다 × 단계, 상한 `max_stack` 999999) — ON_BUFF_TRIGGER가 없어 전투 중 층이 늘어도 다시
  계산하지 않는다. 그래서 그 오퍼레이터가 다시 배치될 때(쓰러진 뒤 재배치·기습 착지 — 【移动】은 유지 [추정])만 그 순간의 층으로 다시 정한다. `act2autochess_gar_eff_attrByBond_add_onstart`도
  ON_BUFF_START뿐이라 같은 방식(이전에는 층이 늘면 돌고 있는 시한 버프를 다시 계산; 관리자 결정 2026-10-11 「공식이 배치 때만 계산하면 그대로」 — 화면 확인 항목). `ab_damageScaleByBond`(ON_BUFF_TRIGGER)와 `respawnTimeByBond`(EN 템플릿 없음)는 계속 층을
  따라감. `garrisons/effects/stats.js installReaders`. **되돌리기**: `installReaders`의 `layerGain` 재계산 목록 `live`에 attrByBond·add_onstart를 다시 넣으면 2026-10-11 전 동작
  (층이 늘 때마다 다시 계산; bonds.md T1). 테스트 `test/content/garrisons_battle.test.js` 「attrByBond」(실제 경로 포함).
- **阿戈尔 吞噬 팀원 — 관리자 결정 2026-10-11 「지금 규칙 유지(A)」**: 에기르 멤버는 앞 칸의 오퍼레이터를 주인과 상관없이 먹는다(#140 결정 그대로, `bonds/nation/egir.js devour`).
  그래프 읽기(bonds.md B9: 맹약이 안 켜진 팀원은 `eat_calculated`로 안 먹음)와 다르지만, 联防·보스 필드는 두 플레이어 구역 경계에 공격 지점·배치 불가 칸이 있어 팀원
  오퍼레이터가 에기르 멤버 앞 칸에 설 수 없으므로 결과가 같다(관리자 설명). 동작 변경 없음.
- **黄沙罗盘 「첫 스킬 끝」 = 배치마다**: 클라 버프 템플릿 `act1autochess_acarm103_buff` ON_BUFF_START가 `has_used_skill`을 0으로, ON_SKILL_FINISH는 그 값이 0일 때만
  萨尔贡 운반자에게 `sp`(그다음 1) → 재배치하면 다시 받는다(이전: 전투당 한 번). `items/effects/bond.js` `doneSeq`(배치 번호). [추정·미조사: 기습 착지·【移动】 때 클라가 이 글로벌 버프를 다시 붙이는지 확인 안 함] 기습 착지·【移动】도 새 배치로 봄.
  테스트 `test/content/items.test.js` 「黄沙罗盘」.
- **炎国短刀·有限加速器 = 이 시즌 장비, 쌓임은 배치마다** (2026-10-25, 묶음 U): 이 시즌 활동 표 `eff_acarm040`·`eff_acarm052`(`env_gbuff_new_with_verify`)가 다른 모드
  이름의 전역 버프 `act1vautochess_equip_acarm024_global_buff`·`…acarm037_global_buff`를 붙인다(이름만 다른 모드). 두 전역 버프의 셈(`buff_cnt` 0)은 버프 자신의
  것이고 배치마다 새로 붙으므로(黄沙罗盘과 같음) 쌓임은 그 배치 동안만 간다(이전: 전투 내내).
  - 炎国短刀: 템플릿 `act1vautochess_acarm024_buff` ON_SKILL_START — `Dice(prob)` 뒤 `buff_cnt < atk_buff_cnt`면 `acarm_024_buff[atk]`(INFINITY, 최대 10겹,
    `trap_acarm40_buff`)와 `buff_cnt` +1. 마지막 갈래(`buff_cnt == get_gold_cnt` → `trap_acgarm_buff_02`·소리)는 이 시즌 어느 블랙보드에도 `get_gold_cnt`가 없어
    돌지 않는다.
  - 有限加速器: 템플릿 `act1vautochess_acarm037_buff` ON_OUTPUT_MODIFIER — `acarm037_cd == 0`일 때, 소지자가 내는 **피해 중 공격 종류가 ADDITION(附加伤害)이
    아닌 것** 또는 **치료**마다, 60겹 미만이면 파생 버프 `autochess_acarm037_buff[attack_speed]`를 끝내고 새 합으로 다시 만든 뒤 `buff_cnt` +1, `acarm037_cd` = 1.
    전역 버프(`triggerLifeType` INFINITY, `triggerInterval` 0.2, `waitFirstTriggerInterval`)의 ON_BUFF_TRIGGER가 0.2초마다 `acarm037_cd`를 0으로 →
    **배치 시각부터 0.2초 칸마다 한 번까지**. 이전: 일반 공격 동작마다, 쿨다운 없이(스킬 피해·치료는 안 셈, 0.2초 안 연타는 더 셈).
    우리: `hit` 이벤트(회피 판정 전 = 피해가 나가는 순간)와 `heal`(재생 틱 제외). ADDITION = 태그 `addition`(모듈·재능 추가 피해, 드론 추가 피해, 그리고
    이번에 단 叙拉古 6 진실 피해·卡西米尔 [ex] 진실 피해 — 두 템플릿 피해 노드가 `_attackType` ADDITION; 다른 규칙은 이 태그를 보는 곳이 일반 공격뿐이라
    결과가 같다)와 장비 발동 피해(이 포크 규칙: 발동은 장비 발동을 다시 부르지 않음). 지속 피해(BUFF)는 셈. 원소 손상은 피해 출력이 아님.
    [추정] 무적·수면으로 막힌 대상에 낸 피해와 금지된 치료(禁疗 대상)는 셈하지 않음(우리 `hit`/`heal`이 그 전에 끊김). 템플릿의 `atk`는 이 시즌 0.
  - 코드 `items/effects/stacks.js` `chess_item_3_04_e`·`chess_item_4_03_e`(`isAddition`, `ACCEL_STEP`), `bonds/nation/siracusa.js`·`kazimierz.js`(태그 둘). 이펙트는 rules/fx.md, 소리는
    rules/audio.md 「버프·커스텀 트리거 소리」. 테스트 `test/content/items.test.js` 「炎国短刀」·「有限加速器」. golden: 두 장비를 든 전투(로스터 14·맹약 4·필드 12·
    매치 9·스탠드인 2).
- **맹약·장비·전략 템플릿 이펙트 — 관리자 결정 2026-10-11 「넣음」**: 템플릿 그래프의 `CreateEffect`·`CreateEffectAtScreenPos` 노드가 도는 순간 상태 이벤트
  `['tplfx', 대상 id | null, effectKey, 출처 id | null]` 한 번(목록·조건은 `docs/SIM.md` 이벤트 표, 코드 `content/support tplFx`). 표시만 — 상태·rng를 바꾸지 않는다.
  EN 템플릿(卫戍协议 201개)의 노드 이펙트 16개 중 우리 sim이 모델하는 것 전부: 拉特兰桥夹(채울 때만), 黄沙罗盘, 迅捷(줄마다), 阿戈尔 표식·5 부활, 埃芒加德·M3茧甲 부활,
  歌利亚头盔(앞 칸이 비었을 때), 蒸汽之心(维多利亚 운반자), 叙拉古 6 발동, 谢拉格 바람(화면 가운데). 뺀 것: `act1vautochess_acarm024`의 `trap_acgarm_buff_02`(이 시즌 장비 炎国短刀의
  것이지만 그 갈래가 돌지 않음 — 위 「炎国短刀·有限加速器」), `trap_acspell004`(다른 모드, 우리 데이터에 없음); 버프 자체 이펙트(`overrideEffectKey`: 은신 `common_invisible` 등)는 노드가 아니라 버프가 붙어 있는 동안의 것이라 이 이벤트가 아님. 테스트 `test/content/tplfx.test.js`.

## act2 맹약·장비 템플릿 대조 (2026-10-31, 관리자 결정 「동작 변경 모두 공식이랑 동일하게」)
출처: EN 클라(2026-08) 버프 템플릿 그래프와 공식 클라에서 확인한 노드 본문(`FilterDamageModifer`·`ModifySpData`·`AutoChessFilterChess`·
`AutoChessAssignChessCntToBB`). 수치는 활동 표 블랙보드.
- **공격 종류 거르기**: 공식 클라에서 확인 — `FilterDamageModifer`의 공격 종류 검사는 비트 마스크 `(종류 & 필터) == 필터`(NORMAL 1·SPLASH 2·
  BUFF 4(지속 피해)·ADDITION 8), `_sharedFlag`는 `_filterSharedMask`가 켜졌을 때만 본다(이 시즌 템플릿은 모두 꺼짐). 그래서 NORMAL 필터 = 「일반 피해」
  (스킬 피해 포함, 溅射·지속·부가 피해 빼고, `_filterModifierCancelled`면 회피된 것도 뺌) — 시라쿠사(맹약 `siracusaShip`) 6 발동이 쓰던 판정을
  `damage.js isNormalDamage`로 옮겨 카시미어·패밀리 배지도 쓴다.
- **아케인(맹약 `arcaneShip`)**: `act2autochess_bond_eff_arcane` ON_OUTPUT_DAMAGE — 법술 피해면(공격 종류 상관없음) 대상에 그 멤버가 건 `[weak]`가
  있는지 보고(`CheckContainsBuff _checkBuffSource`) **없을 때만** 새로 건다 → 자기 것이 남아 있는 동안 다시 맞혀도 시간을 새로 하지 않는다(이전 추정:
  같은 값이면 3초로 새로). 2단계 값은 대상 HP 비율 **50 % 이하**(`FilterByTargetHpRatio LE`, 이전: 미만). 두 플레이어 필드의 「가장 센 것 하나」는 그대로.
  `bonds/addon/battle.js`.
- **시라쿠사 6 발동**: `[ex][buff]`의 `DicePRD` — C는 클라 표 `prdBaseProbs`(3 % → 0.00139, 이전: 같은 값을 계산으로 구함), 횟수는 전투 전역 블랙보드
  하나 → **두 플레이어 필드면 둘이 함께 셈**(불굴과 같음, 이전: 플레이어마다). `[ex]`를 붙이는 곳(2026-10-31 확인): 템플릿이 아니라 전역 버프 프리팹
  `battle/prefabs/[uc]globalbuffs`의 `act2autochess_bond_eff_siracusa` — `_buffs`에 본 버프(0.5초 틱)와 `[ex]`(0.3초 틱)를 함께 두고, 대상은 아군 오퍼레이터
  (직업 마스크 639, 소환물 없음) → 지금 구현(멤버마다 본 버프와 함께, `[ex]` ON_BUFF_START가 6명 판정)과 같음, 코드 변경 없음. `bonds/nation/siracusa.js installSiracusa`.
- **카시미어(맹약 `kazimierzShip`) 6**: `[ex]` ON_OWNER_BLOCKEE_CHANGED가 저지를 시작할 때 `[ex][damage]`를 만들고 저지가 없어지면 끝낸다. 틱 간격은 블랙보드
  `interval`(= `damage_interval` 2), `waitFirstTriggerInterval` 꺼짐 → **저지 시작 순간 한 번, 그 뒤 저지하는 동안 2초마다**, 멤버마다 따로(이전: 전투 시계
  2초마다 그때 저지 중인 멤버). 저지하지 않을 때의 30 % 진실 피해는 **모든 일반 피해**(스킬 피해 포함; 이전: 일반 공격만). 배치 수 `kazimierz_born`은
  전역 버프가 시작될 때마다(멤버 거르기 앞) `AddGlobalBlackboard`가 전역 블랙보드 `CHARACTER` 채널에 1을 더한다 — 공식 클라에서 확인: 전역 블랙보드
  (`BattleGlobalBlackboard`)는 채널마다 블랙보드 하나이고 노드는 키에 플레이어를 붙이지 않음 → **필드 하나에 한 수**, 두 플레이어 필드에서 둘 다 카시미어면
  서로의 배치를 함께 센다(2026-10-31, 이전: 플레이어마다). 이 전역 버프의 대상(전역 버프 프리팹 `act2autochess_bond_eff_kazimierz`, 1초 틱)은 아군 오퍼레이터,
  직업 마스크 639 → **소환물 배치는 안 셈**(지금과 같음). 대상 검사 `GlobalBuff._VerifyTarget` → `TargetOptions.VerifyTargetWithPlayerSide`는 출처 플레이어
  마스크로 거르고 그 마스크는 `GlobalBuff.OnInit`이 전역 버프 데이터의 `playerSideMask`로 채운다. 그 값은 맹약 플레이어 쪽이다 — 공식 클라에서 확인
  (2026-10-31): `AutoChessBattleDataModel._AppendBattlePlayerRunes`가 전투 플레이어마다 활성 맹약의 룬을 `_AddPackedRuneData(룬, 그 플레이어 쪽, 플레이어)`로
  넣고(쪽 = 왼쪽·오른쪽 맵 절반), `_AddPackedRuneData`가 룬마다 선택자 `playerSideMask` = 그 쪽 마스크로 쓰며, `LGlobalBuffNew.OnPreprocessFinished`가 그
  선택자 마스크를 전역 버프 데이터로 옮긴다 → **맹약 전역 버프는 그 플레이어 쪽 말에만**, 상대 플레이어의 배치는 상대도 카시미어일 때만 같은 수에 들어온다(지금과
  같음, 코드 변경 없음). `bonds/nation/kazimierz.js installKazimierz`, 테스트 `bonds_core.test.js` 「卡西米尔: the deploy count is one for the field」.
- **궁극기(맹약 `suntShip`) 5**: `ModifySpData`(`_onlyUpdateSpCost`, `_updateSpCostViaMaxRatioKey sp_ratio`) = **올림**(float32 곱 `ceil`)을 캐릭터 스킬
  데이터에 씀(이전: 내림). 25 × 0.7 → 18. 2단계 공격력·「정예 수」 셈(`AutoChessAssignChessCntToBB _assignGoldenChess`: 같은 플레이어의 전장 말 중 정예)은 같음.
  소환물: `AutoChessFilterChess`는 그 캐릭터의 카드가 전장 말(`GetInstIdByCardUid` ≥ 0)이고 정예일 때만 통과하는데, 공식 클라에서 확인 —
  `GetInstIdByCardUid`는 `AutoChessDataIndexer.runtimeCard2ChessDict`를 찾고, `ConstructRunTimeIndexer`는 이 표에 **오퍼레이터 카드만** 넣는다(소환물
  카드는 `runtimeToken2CardDict`에 따로) → **정예의 소환물은 SP 소모 감소를 받지 않음**(2026-10-31, 이전: 받음 — upstream 때부터의 추정).
  `bonds/addon/battle.js`, 테스트 `bonds_addon.test.js` 「绝技」.
- **독행(맹약 `soloShip`)**: 그래프(ON_BUFF_START 공격력·HP MULTIPLIER, ON_BUFF_LATE_ENABLE `ModifySp _forceFlag` +sp)가 지금과 같음 — 코드 변경 없음.
- **위장복(장비 `chess_item_4_04_e`)**: `act2autochess_equip_acarm055_global_buff` ON_TAKE_DAMAGE → 은신 → 자기 끝. 전역 버프는 배치마다 새로 붙으므로
  **배치마다 첫 피해에 한 번**(이전: 전투당 한 번).
- **잠자는 후예(장비 `chess_item_4_06_e`)**: `act1vautochess_acarm025_buff` ON_OUTPUT_DAMAGE → `HealViaMaxHpRatio _skipModifierEvent` — **주는 피해 한 번마다**
  (스킬·광역 각 대상·지속 피해·회피된 것도; 이전: 공격한 대상마다), 회복은 치료 이벤트를 내지 않는다(`heal` `noEvent`: 제한 가속기가 세지 않음). 원소 손상과
  장비 발동 피해는 이 포크 규칙대로 뺌.
- **카시미어 스포츠 깃발(장비 `chess_item_4_07_e`)**: 본 버프의 첫 틱(배치 15초 뒤)이 `[ending]`으로 넘기고, `[ending]`은 0.5초마다(`waitFirstTriggerInterval`)
  −0.04 하다 1 아래면 끝 → **첫 감소는 창이 끝나고 0.5초 뒤**(이전: 창이 끝나자마자).
- **해구 실험체(장비 `chess_item_6_04_e`)**: 반격 조건 맹약 거르기에 `_considerManiShip`이 없음 → **자기 맹약이 에기르일 때만**(조화 멤버 제외, 이전: 조화 포함).
  `[lock]`이 피해 노드보다 먼저라 출처 없는 피해도 0.5초를 씀. 받은 지속 피해도 반격(거르기 없음 — 이전과 같음), 流失은 뺌.
- **쉐라간드의 눈물(장비 `chess_item_6_06_e`)**: 능력 `act2autochess_equip_acarm102_ability`가 사거리 안 적마다 붙고, 寒冷·冻结이면 `[buff]`가 틱(`interval` 1,
  `waitFirstTriggerInterval` 꺼짐) → **그 적이 얼어붙은 순간 한 번, 그 뒤 1초마다, 적마다 따로**; 풀리거나 사거리를 벗어나면 멈춤. 피해는 무출처(`_noSource`,
  처치·통계는 운반자). 이전: 전투 시계 1초마다, 출처 있음.
- **페가수스의 투구(장비 `chess_item_5_09_e`)**: 짝(페가수스의 랜스)이 있으면 `[ex]` 속성 `HP_RECOVERY_PER_SEC_BY_MAX_HP_RATIO` → **자기 생명 회복 속성**
  (`hpRegenRatio`, 연속, 치료 이벤트 없음; 배치 때·빌려줄 때 판정). 이전: 1초마다 치료 한 번.
- **페가수스의 랜스(장비 `chess_item_6_01_e`)**: 거르기가 공격 종류(ADDITION → IfNot)뿐이고 `_filterModifierCancelled`가 없음 → 회피된 피해에도 붙음(아래 절의
  [추정·엔진] 해소). 코드 변경 없음.
- **기사 계율(장비 `chess_item_6_10_e`) + 깃발**: `[ex]` UNDEADABLE, ON_BEFORE_TRY_SET_HP_ZERO 뒤 ON_BUFF_FINISH(스킬 끝)에 `InstantKill _noSource _skipReborn`
  → **스킬이 끝날 때 쓰러짐**(`battle.kill`, 죽인 쪽 없음 — 쓰러짐 효과·불굴·에기르가 봄; 이전 추정: `dying` 철수).
- **패밀리 배지(장비 `chess_item_6_11_e`)**: 은신에 들어가면 `[buff]`가 1초마다(`waitFirstTriggerInterval`) +0.02 → **은신 한 번의 온전한 1초마다**(이전: 0.25초마다
  매끄럽게), 은신이 풀리면 `[end]`(+짝이면 `[ex]`)가 **첫 일반 피해**에 끝남(이전: 아무 피해). 
- **특질 `act1autochess_gar_event_consume_ammo`** (2026-10-31): 본 능력은 버프 템플릿이 아니라 동적 능력 프리팹(`battle/prefabs/[uc]dynamicabilities`,
  룬 `char_dynamic_ability_new`, 클래스 `ListenAmmoConsumeAbility`). 공식 클라에서 확인: `ON_AMMO_CONSUME`은 탄약 계수기(`AbilityEventCounter.DealCountEvent`
  → `OnEventCountConsumed`)가 **세는 이벤트 한 번마다**(공격·조준 한 번, 그때 쓴 발 수 `consumeCnt`는 이 특질이 안 씀) 나고, 검사기는 오퍼레이터만(직업 마스크에
  소환물·장치 없음). 소비자에게 `[consume]`(바로 끝남)를 붙이고, `[consume]`는 사거리 안이면 보유자에게 그 소비자 출처의 0.1초 `[cnt]`를 주되 이미 있으면
  안 주며, `[cnt]`가 1을 더함 → **한 소비자는 0.1초에 한 번까지 셈**(엑시아 더 뉴 커버넌트 S3의 한 공격 5발 = 1). 문턱은 `[self]`가 **0.3초마다**
  (`waitFirstTriggerInterval`, 배치부터) 보고 한 틱에 하나만 넘김(`target_count += consume_count`). 이전: 발마다 세고 넘는 순간 바로. 센 수
  (`consumed_cnt`)는 본 버프의, 문턱(`target_count`)은 `[status]`의 블랙보드에 있다. 공식 클라에서 확인(2026-10-31): 철수(`Entity.OnFinish`)는
  `BuffContainer.Clear`로 **지속 버프(`isDurableBuff`)까지** 모두 지우고 능력도 지운다 — 지속 버프를 남기는 것은 `ClearWithWhiteList`뿐이고 그 호출처는 가짜
  죽음(`Unit.DoFakeDeath`, 부활)·`ClearAllBuffs` 노드·`RallyPoint.SwitchCategory` → **재배치마다 0부터 다시 셈**(이전: 이어 셈). 【移动】은 이어 셈(지금
  규칙: 버프 유지 — 공식에서 버프가 다시 시작하는지는 묶음 라). `garrisons/effects/events.js`, 테스트 `garrisons_battle.test.js` 「consume_ammo」 셋.
- **시라쿠사 정장(장비 `chess_item_3_01_e`)** `act2autochess_equip_acarm121_ability`는 템플릿이 아니라 동적 능력 프리팹(2026-10-31 대조): 오라 능력, 범위 `0-2`(방향으로 돌린 좌우 두 칸 + 자기 칸), `_selfOption` EXCLUDE(자신 제외), 검사기는 오퍼레이터만(소환물 제외)·은신도 받음, 버프는 범위 안에 있는 동안 공격 속도 +`attack_speed` → 지금 구현(`items/effects/bond.js`, 좌우 두 칸의 오퍼레이터)과 같음 — 코드 변경 없음. [추정·엔진: 오라를 다시 보는 간격 — 우리는 0.5초마다 0.6초 버프]
- 테스트: `test/content/bonds_core.test.js` 「叙拉古 6: the PRD count is one for the battle」·「卡西米尔 6」, `bonds_addon.test.js` 「奥术 with two players」·「绝技」,
  `items.test.js` 「伪装服」·「休眠子裔」·「卡西米尔竞技旗」·「天马之盔 + 天马之枪」·「海沟实验体」·「耶拉冈德之泪」·「骑士戒律」·「家族徽章」, `garrisons_battle.test.js`
  「consume_ammo」.

## 일반 공격 타이밍 (2026-10-10, 관리자 결정 「동작 변경 모두 공식이랑 동일하게」)
오퍼레이터·적의 일반 공격을 EN 공식 클라(관리자 노트)대로 맞췄다. 코드 `server/sim/ai.js` `attackTiming`·`updateAlly`·`enemyAttack`,
데이터 `tools/local-extract/attack_timing.py` → `tools/assets/local-attack-timing.json` → `tools/build-data.mjs` `opAttackAnim`·`enemyAttackAnim` →
`data/chess.json`·`data/backups.json`(오퍼레이터) / `data/enemies.json`(적) `attackAnim`. 아래 메서드는 모두 켜진 Lua 핫픽스 목록(en_US·zh_CN `DefinedFix.lua`)에 없다.
- **어느 자식·어느 모드의 클립인가** (2026-11-05, 공식 클라 프리팹에서 확인 — 시뮬·화면 클립 비교를 상점 기물·예비까지 넓혀 찾음): 공격 묶음은 자식마다 클립이 다른데 추출은 하나만 읽었다. 세 경우를 고침.
  베토치키 S2: `FirstAttack`(`branch_s_2[first]`가 있을 때만) `Skill_2_Begin` 1초/0.6 → 나머지 공격의 `AbilityName` `Skill_2_Loop` 1.533초/0.8, `_selectTargetTiming` 1. 첫 공격은 피해가 없고(공격 배율 없는 능력), 그 타격 순간 `TriggerAbility`가 스킬의 `SpAttack`(스킬 범위 지상 적에게 전율)을 낸다(2026-11-07, 공식 클라에서 확인, 전에는 스킬 시작에 전율 + 첫 공격도 피해). 범위에 적이 없으면 첫 공격도 전율도 없다. 화면은 그 휘두름을 신호 `FirstAttack`으로 받아 `Skill_2_Begin` 전체를 튼다(`render.md` 「Spine 클립 커버리지」, 이펙트는 `fx.md` 「공격 묶음의 조건 자식 이펙트」).
  요새(애쉬락·혼): `pick`이 근접 자식을 골라 원거리 공격도 근접 클립으로 쟀다 → `attackAnim.base.ranged`(`Body/Attack/RangedAttack`, 클립 길이나 타격이 다를 때만). 저지 중이 아니면 애쉬락 `Attack01` 1.167초/0.533, 혼 `Attack_B` 1.2초/0.3; 저지 중이면 `Attack02` 1.467초/0.7, `Attack_A` 1.067초/0.3. 공격 쿨다운·모드 판정은 그대로 한 기록이다(`attackTiming` 네 번째 인자).
  울피아누스 S3: 닻 뒤 다시 태어나는 모드 `S3_Respawn_A`의 `Skill_3_Loop` 2.5초/0.633(`S3` 모드 `Attack`은 타격 0.533, 그 모드에서는 공격하지 않음) — `attackModeIndex`가 `SKILL_SUB_MODES` `anchor`도 본다. 시험: `test/sim/attack-clip-view.test.js`. [화면 미확인: 공식과 나란히]
- **클립 배율**: 공식 클라 `AbstractAnimatedAbility.UpdatePlaybackSpeed` — 배율 = 공격 간격 ÷ 클립 길이를 [0.1(상수 `MIN_ANIM_SCALE`),
  `_maxAnimScale`]로 자름(−1 = 상한 없음), 휘두름 길이 = 배율 × 클립, 재생 속도 = 1/배율. 상한 1(오퍼 공격 능력의 다수, 적 대부분)이면 느린 공격자는 클립을
  제 속도로 휘두르고 남은 간격은 대기. 값은 공격 능력 프리팹(`<id>/Modes/<mode>/Body/Attack` 등)의 `_maxAnimScale`·`_preDelay`·`_waitForAttackEvent`·
  `_selectTargetTiming`. 오퍼레이터는 모드마다: Default 모드 = `attackAnim.base`, 스킬이 바꾸는 모드(`shared/skill-modes.js skillModeIndex`) =
  `attackAnim.skills[i]`(스킬이 켜져 있을 때). 클립 길이·OnAttack 프레임은 `data/assets.json` Front 골격. 적은 막혔을 때 쓰는 Combat(근접) / Attack(원거리) 능력.
  이전: 적은 상한 1과 같았고(간격이 클립보다 짧을 때만 빨리), 오퍼레이터는 sim에 휘두름이 없었다.
- **타격 시점**: 휘두름 시작 뒤 OnAttack 프레임 × 배율. 클립에 OnAttack이 없으면 휘두름이 끝날 때(`EasyToStartAbility.<WaitForNextEvent>`: 이벤트 또는
  휘두름 전체 `m_cachedDuration`까지 기다림 — 이전에는 클립 절반). `_waitForAttackEvent` 0이면 `_preDelay` × 배율(휘두름 길이 이하; `UpdatePlaybackSpeed`의
  `m_preDelay`) — 오퍼 15개 능력(어스스피릿 0.5 등). 기록이 없으면(장치, 매니페스트에 없는 모델) 휘두름 시작에 바로 타격(이전 규칙).
  소환물도 같은 규칙이다(2026-11-05, 공식 클라 프리팹에서 확인): `pkgrps/btl_pfb_tokens_*.ab`의 `Modes/Default` 공격 능력을 `attack_timing.py`가 뽑아(`tokens` 표) `build-data.mjs tokenAttackAnim`이
  `data/tokens.json`·`backups.json` `tokens`의 `attackAnim`에 넣는다. 전에는 '염의 가호'(적 기록을 쓰는 2026-10-23 제보 건)만 있어, 나머지는 휘두름 시작에 타격했고 렌더는 그 틈에 맞춰 클립을 빨리 돌렸다.
  소환물 35개 중 공격 능력이 있는 것 21개, 없는 것 14개(기록 없음, 키트가 공격하지 않음). 예: '작은 즈자이'(`Attack` 1초/0.433, 상한 없음, 간격 1.9초면 타격 0.823초), 황금의 맹세(`Attack` 1.267초/0.5, 상한 1).
  클립을 틀지 않는 능력(`noClip`: 저주인형 등 `_animKey`가 비었거나 골격에 없는 것)은 `UpdatePlaybackSpeed`가 `m_attackTime`을 쿨다운 그대로 두므로 휘두름 길이가 공격 간격이고, `_waitForAttackEvent` 1이면 오지 않는 이벤트를 `GetDuration` = `m_attackTime`까지 기다려 **간격 끝에 타격**한다(0이면 `_preDelay`, 배율 없음).
  유동체는 `Default` 모드 값을 쓴다: `Attack`·`Melee`·`Range`의 클립이 모두 0.8초, 타격 0.3으로 같다. 전에는 `Default`가 0.833초로 0.033초 길었는데, 모드 차이가 아니라 웹 소재의 스킨 모델(`ambienceSynesthesia_6`) 값이었다.
  **소환물 시간은 공식 기본 모델에서만 잰다** (관리자 결정 2026-11-16 「기본 모델 추출」): 웹 소재에 스킨 변형만 있는 소환물(`data/assets.json tokens[id].spineVariant`)은 `tokenAttackAnim`이 그 스킨 골격으로 공격·출생 시간을 쟀다. 이제 공식 클라의 기본 모델(`spineLocal`, `extract.py TOKEN_SPINES`)만 읽고, 웹 모델은 스킨 변형이 아닐 때만 읽는다. 스킨 변형만 있고 기본 모델이 없으면 생성기가 멈춘다. 그때는 그 소환물을 `TOKEN_SPINES`에 넣어 뽑는다. 숫자가 바뀐 것은 유동체 `Attack` 0.833 → 0.8초뿐이다(나머지 11개는 재는 키가 같음, 공식 클라 기본·스킨 골격 대조). 오퍼레이터 스킨은 시뮬레이션을 바꾸지 않는다. 재발 방지: 원인 제거 — `tokenAttackAnim`이 기본 모델을 읽고 스킨 변형에서 멈춤, `test/sim/token-attack-timing.test.js`. `Range_S2`만 `_selectTargetTiming` 1이라 뮤엘시스 S2 중 원거리 복제는 타격 순간 대상을 고른다(키트 `strikeSel`, 2026-11-07).
  뮤엘시스 S3 시작, 원거리 복제 유동체(2026-11-07, 공식 클라에서 확인, `mlyss_s_3[token_range_trigger]`·유동체 스킬 `sktok_mlyss_wtrman_3`): 분열 복제가 아닌 원거리 유동체마다 `SpawnTokenS3`을 `x-5` 다섯 칸(자기 칸과 상하좌우, `_maxNum` 5)에 쓴다. 빈 칸에는 분열 복제가 나고, 유동체나 복제가 이미 있는 칸은 체력을 채우고 복제의 시간을 처음부터 다시 잰다(`_buffsToExistToken` `mlyss_wtrman_[summon_refresh]`). `EmitProjectileS3` 4발은 `_atkScale`이 없어 피해가 없다. 쓰러진 유동체는 건드리지 않는다. 전에는 살아 있는 모두를 회복하고 쓰러진 유동체를 바로 되살렸다. 시험 `kits_alt_t6.test.js` 「缪尔赛思 S3, ranged」.
  타자기(`token_10026_bgsnow_subbow`, 공식 한국어 이름 없음) S2 복사는 `CastSkill` `_switchToState` 1이라 시전이 휘두름의 남은 시간을 끊는다(키트). 확인: `test/sim/token-attack-timing.test.js`, `test/content/playtest4_summons.test.js` 「OnAttack frame」.
- **쿨다운은 휘두름 시작에서 다시 건다**: `AbilityStandard.CastToTarget` → `m_cooldownTimer.Reset(true)`. 다음 휘두름은 쿨다운이 끝나고 지난 휘두름(후딜
  포함, `castLeft`)도 끝났을 때(`Character.States.AttackState.OnTick`: 공격 능력이 `isReady`일 때만). HALF_FRAME(`_CheckNeedResetCooldown`, 프리팹
  전부 1): 휘두름 길이 = 간격이면 끝에서 남은 쿨다운 반 프레임을 0으로 — 우리 틱 카운트다운은 두 값이 같은 틱에 시작해 같은 틱에 0이 되므로(1e-9 허용,
  `attackCountdown`) 다음 휘두름이 그 틱에 이어진다(따로 코드 없음). 이전: 적은 쿨다운이 타격 프레임까지 셌다.
- **공속이 바뀌면 남은 쿨다운은 진행 비율을 유지한다** (2026-11-04, 공식 클라에서 확인): 공격 시간이 바뀌면 `AbstractAnimatedAbility.OnAttackTimeChanged`가
  (`_timeMode` 0 능력) `PeriodicTimer.ResetButKeepProgress(새 쿨다운)` — 진행 = 1 − 남은 ÷ 옛 주기(0이면 1)를 [0, 1]로 자르고, 남은 = (1 − 진행) × 새 주기
  = 남은 × 새 ÷ 옛. 엔진 공통 `units.js _recalc`(간격이 바뀌는 재계산에서 `atkCd` × 새 ÷ 옛; `updateAlly`는 카운트다운 전에 재계산), 오퍼레이터·적 모두.
  이전: 남은 초 그대로(假想敌：铳 키트만 따로 곱했다 — 이제 엔진이 함). 예: 2 s 간격의 0.5 s째에 공속 +100 → 남은 1.5 s가 0.75 s.
- **모드가 바뀌면 그 모드의 공격 능력이 따로, 준비된 채 붙는다** (2026-11-04, 관리자 결정 「넣기로」, 공식 클라에서 확인): `Unit.SwitchMode`가 옛 모드의
  능력(`UnitMode._InitAbilities`: `_generalAbilities` + `_combat` + `_attack`)을 `Ability.Detach`하고 새 모드의 것을 `Attach` → `Ability.DoAttach` →
  `Ability.Reset` = `PeriodicTimer.Reset(쿨다운, false)`(남은 0), 이어 `AbstractAnimatedAbility.DoAttach`의 `ResetButKeepPastTime`도 0. 공격 상태는 지금 모드의
  공격만 본다(`AttackState.OnTick` → `Character.get_attack` → `Ability.get_isReady`: 붙어 있고, 쿨다운 끝, 시전 중 아님) → 옛 모드의 쿨다운도, 옛 휘두름의
  후딜도 기다리지 않는다. 옛 휘두름은 그 능력의 `_interruptAbilityOnDetach`가 1이면 끊기고(`Ability.DoDetach` → `InterruptIfNot`: 타격 없음), 0이면 떼어진
  능력이 끝까지 친다 — 새 모드의 첫 휘두름과 나란히. 시뮬: `ai.js updateAlly`가 틱마다 지금 공격 기록(`attackClipOf` = 스킬 모드가 있는 스킬이 켜졌는지)을
  `u.atkMode`와 견줘, 바뀌면 `atkCd`·`castLeft`를 0으로, 휘두름은 `det`이면 끊고(`cutAllySwing`) 아니면 `u.swingOff`로 옮겨 그 휘두름을 시작한 프로필·대상으로
  치게 한다(`allyStrike` `off`: 대상 없음 환불은 떼어진 능력의 것이라 지금 쿨다운을 건드리지 않음). 휘두름을 시작할 때 그 모드를 적는다(공격 확인에서
  시전한 스킬이 모드를 바꾼 경우). 데이터: `tools/local-extract/attack_timing.py` `det`(`_interruptAbilityOnDetach`) → `attackAnim.*.det`(1일 때만) —
  풀 오퍼레이터의 Default 공격 163개 중 69개·다른 모드 공격 278개 중 134개가 1(EN·CN 클라; 에벤홀츠 `char_4046_ebnhlz` 전부 0, 왕·첸 더 던스트릭·로고스 1). 예: 에벤홀츠 S1은 시전 순간 돌던 Default
  쿨다운(최대 3 s)과 3 s 클립의 후딜을 기다리지 않고 S1 공격을 바로 휘두른다(이전: 기다렸다), 스킬이 끝나면 Default 공격도 바로.
  떼어진 능력의 휘두름은 기절·缴械에도 끊기지 않는다(2026-11-07, 공식 클라에서 확인): 상태를 나갈 때 끊는 것은 지금 모드의 공격뿐(`AttackState.OnExit`)이고 `Ability.DoDetach`는 `_interruptAbilityOnDetach`가 1일 때만 끊는다. 쓰러지거나 물러나면 없어진다(`battle/deploy.js`). [추정·엔진: 기절로 클립이 바뀐 뒤 OnAttack이 오는지, 휘두름 길이까지 기다리는지는 애니메이터의 몫이다. 시뮬은 제 시각에 친다]
  확인: `test/sim/attack-timing.test.js` 「a skill that switches the attack mode」·「a mode switch during a swing」·「a new attack interval re-times」.
- **끊긴 휘두름은 쿨다운을 돌려주지 않는다**: 기절·빙결·수면·浮空·失衡, 숨음(적), 缴械·恐惧·战栗(막힘), 퇴각 — `Ability.InterruptIfNot` =
  `FinishIfNot(INTERRUPTED, false)`, 쿨다운 그대로 → 끊긴 휘두름 시작부터 간격 한 번 뒤 다음 휘두름. 이전: 적은 기절이 풀리면 곧바로 새 휘두름.
- **쿨다운은 기절 중에도 흐른다(확정)**: `Entity.OnTick`은 `get_alive`(상태기계 동작 중 + HP > 0)일 때 능력마다(첫 캐스트 프레임만 빼고) 그 능력의
  `OnTick`을 부르고, `AbilityStandard.OnTick` → `Ability.OnTick` → `PeriodicTimer.Update`는 조건 없이 남은 시간을 줄인다
  (`Attributes.GetValue` 분기는 `m_epController` 트윈 속도 ← `EP_BREAK_RECOVER_SPEED`(0x23)만 정함 — 원소 막대 회복, 능력 틱을 막지 않음, 두 번째 확인). 오퍼레이터·적 모두 필드에 있으면(적은 숨지 않았으면) 기절 중에도 센다.
  이전: 오퍼레이터는 `canAct`일 때만, 적은 기절 중엔 멈춤.
- **대상이 휘두름 중 죽으면 헛휘두름**: 대상은 휘두름 시작에 정해지고(`CastToTarget`의 `m_inputTarget`), 타격 때 `AbilityStandard.DoCastOnTargets`가
  `ValidAndAlive`인 대상만 친다 → 아무도 없으면 피해 없음, 휘두름·후딜은 끝까지, 쿨다운 환불 없음(`_interuptIfTargetDead` 0 = 오퍼 480/481, 적 513/519).
  `_selectTargetTiming` 1(BEFORE_SPELL_START: 오퍼 97·적 41 능력)·3은 타격 순간 다시 고르고, 아무도 없으면 `FinishIfNot(TARGET_DEAD)` → 타격 전이라
  `Reset(false)` = 쿨다운 환불(바로 다시 휘두를 수 있음). 2(RESELECT_IF_TARGET_DEAD)는 첫 대상이 죽었을 때만 다시 고름. 사거리 밖으로 나가도 휘두름은
  끊기지 않는다(`AttackState.OnTick`에 사거리 검사 없음). 이전: 적은 매 틱 사거리 안 대상이 있어야 했고 타격 때 다시 골랐다([ASSUMED] 삭제).
- **麻痹**: 타격 순간 `Enemy.CanDoAbilitySpellOn`이 PALSY로 거부 → `FinishIfNot(PALSY, false)`: 피해 없음, 쿨다운은 휘두름 시작부터 그대로(이전: 타격
  시각부터 간격 한 번 다시).
- **휘두름 이벤트**: 휘두름을 시작하는 틱에 `['swing', unitId, windup, projKind]`(타격까지 게임 초, 그 타격 'atk'의 kind). 렌더는 이것으로 Spine 휘두름을
  공식 속도로 시작한다(`render.md` 「공격 모션」). fx 담당도 같은 이벤트를 쓴다.
- **재능이 고르는 공격** (2026-10-21, fx.md 「다른 필드 투사체」): 모드의 `Body/Talents/<n>`이 `_isModeTalent` 1·`_probKey`인 공격 능력이면 클라는 그
  확률로 공격 **대신** 그것을 시전한다 — 고르는 때는 시전(휘두름) 시작. 시뮬: 오퍼레이터 휘두름 시작에 훅 `swing` { unit, targets, isSkill, signal }
  (`ai.js updateAlly`)을 내고, 키트가 `signal`('T.<n>')을 정하면 'swing' 9번째 칸(앞 칸은 base·null·combat·first로 채움)·그 타격의 'atk' 5번째 칸
  (`performAttack` opts.signal, 圣约送葬人의 `forceAttack`과 같은 칸)·그 명중 피해의 `dmg.signal`에 실린다. 寒芒克洛丝 中的: 스킬 밖(`isSkill` 거짓)
  휘두름에서 prob를 굴려 'T.1', 명중 'hit'에서 `dmg.signal` 'T.1'이면 ×atk_scale·stun; 스킬 모드는 버프 템플릿 `kroos2_t_1[critical]`
  (ON_CALCULATE_DAMAGE Dice)이라 그대로 착탄 때 굴림(`dmg.isSkill`). 전엔 모든 공격을 착탄 때 굴렸다 — 맞히는 확률·배율은 같고 난수 순서만 바뀐다
  (그녀가 있는 golden 13개 시나리오가 움직임: roster 009·011·030, bonds arcane·mira·stead-low·swift, fields boss 2·4·6·hidden 8·10, matches
  coop2-NORMAL-70-diy). 대상이 쏜 뒤 죽으면 그 굴림은 버려진다(클라도 시전 때 고름).
- 휘두름 중 스킬 모드가 없는 스킬이 켜지거나 꺼져도 대상은 그대로다(2026-11-07, 공식 클라에서 확인): 타격은 능력의 `m_castTargets` 가운데 `ValidAndAlive`인 대상을 친다(`AbilityStandard.DoCastOnTargets`). 전에는 타격 때 다시 골랐다. 스킬 모드가 있는 스킬은 위 「모드가 바뀌면」대로 옛 휘두름이 제 프로필로 친다. 피해 프로필이 치료로, 치료가 피해로 바뀐 경우만(공식 능력이 아니라 키트의 프로필) 옛 대상을 쓸 수 없어 다시 고른다. 다음 공격을 바꾸는 스킬(`Character.RegisterReplacement`: 사리아 S1 치료, 矩 S1)이 휘두름 중에 켜지면 그 휘두름은 일반 공격으로 치고 충전을 쓰지 않는다. 전에는 대상을 다시 골라 그 휘두름이 스킬이 됐다. 클립 이름: `ThreePartOneshotAnimation`의 `_oneshotAnim`(`_beginAnim`은 아래 「첫 공격 begin」), 스킨 키 표로 푼 `clip`(「즉발 스킬의 시전」), 표에 없으면 `<key>_Loop`, 그래도 없으면
  렌더가 그 모드에 쓰는 클립(`anims.attack`/`anims.skills[i]`) — 왕 Default, 마운틴 S2·S3, 시·수르트·민트·플레임테일·파투스 스킬 모드 등 10개 능력. 적은 Default 모드의 능력 하나(형태별 클립은 기존 [ASSUMED]).
- **한 모드의 공격·저지 능력** (2026-11-07, 공식 클라에서 확인): 한 모드에 `_attack`과 `_combat`이 둘 다 있으면 쿨다운·클립이 따로다. 저지 대상을 찾는 `Character._FetchCombatTarget`은 `hasCombat`이 거짓이면 아무도 돌려주지 않으므로, 오퍼레이터 209명 대부분(`_attack`만)은 저지 중에도 공격 상태 그대로다. 둘 다 있는 오퍼레이터는 11명이다: 라플란드·실버애쉬·프로스트리프·레토·쏜즈·에이어스카르페·치우바이·이네스·Mon3tr(S3_Reborn)·토가와 사키코·로드·샤프(`attackAnim…combat`, `tools/local-extract/attack_timing.py`). 적은 공격·저지 능력이 다 있는 243종 중 원거리 27종이다(근접은 공격 상태에 들지 않음). `ai.js syncAllyCombat`·`enemyAttack`.
  오퍼레이터: 공격 상태에서 저지 대상이 생기면 곧바로 COMBAT으로 가고(`AttackState.OnTick` `_CheckSwitchToCombat`, 교체 스킬이 시전 중이면 안 감), `OnExit`가 돌던 공격을 끊는다(휘두름·후딜 모두, 쿨다운은 돌려주지 않음). COMBAT의 대상은 첫 저지 대상이고(`_GetTarget`) 그 능력의 쿨다운이 끝나 있으면 바로 휘두른다. 저지가 끝나면 그 시전이 끝난 뒤 나간다(`CombatState.OnTick`). 두 쿨다운은 늘 함께 흐른다. 전에는 쿨다운 하나에 공격 클립 시각을 썼다(쏜즈 `Attack_1`, 실버애쉬 `Combat` 타격 0.733초 등을 틀리게 잼).
  적: 공격 상태는 막혀도 끊기지 않고 시전을 끝낸다(`Enemy.States.AttackState.OnTick`). 그 뒤 `MoveState`가 COMBAT으로 보낸다. 클립은 그 능력의 `_animKey`, 모델에 없으면 공격 역할 클립.
- **스킬 중간 모드 전환** (2026-11-07, 공식 클라에서 확인): `shared/skill-modes.js SKILL_SUB_MODES`의 모드 가운데 도중에 바뀌는 셋은 제 공격 능력과 클립을 쓴다(`attackAnim.skills[i].sub`, 키트의 `u.atkSub`): 위셔델 S2 `S2_Overload`(`Skill_2_Overload_Loop` 1.4초)·크루스 더 킨 글린트 S2 `S2_Sub`(`Skill_Loop_2` 0.6초)·비비아나 S3 `S3_2`. 바뀌는 순간은 위 「모드가 바뀌면」과 같다: 새 능력은 준비된 채 붙고, 옛 휘두름은 `det`대로 끊기거나 끝까지 친다. 전에는 쿨다운을 그대로 두고 옛 모드 클립으로 쟀다. 【이동】이 내려놓는 모드(`teleport`·`anchor`)는 스킬 내내 그 모드의 능력이다(「어느 자식·어느 모드의 클립인가」). 키트가 직접 비우는 것은 첸 더 던스트릭 S3·페넌스 S1.
- **적의 모드 전환** (2026-11-07, 공식 클라에서 확인): 적도 `Unit.SwitchMode`로 새 모드의 공격·저지 능력이 준비된 채 붙고, 공격 능력·클립·시간은 그 모드의 것이다. 다른 점은 적의 공격·저지 상태가 지금 모드의 능력이 아니라 **마지막으로 시전한 능력**을 기다린다는 것이다(`Enemy.States.CombatState.OnTick`: `m_combatAbilityCasted.isCasting`이면 기다림, 공격 상태도 같음). 상태를 나갈 때도 그 능력을 끊는다(`OnExit` → `InterruptIfNot`). 그래서 돌던 휘두름은 타격 전이든 뒤의 후딜이든 둘 중 하나다. 전환 노드가 상태 기계를 다시 시작하면(`SwitchMode._restartFSM`, 대부분) 끊긴다. 떼어질 때 끊는 능력(`_interruptAbilityOnDetach`)이면 그것도 끊긴다. 그 밖에는 끝까지 치고, 적은 그것이 끝나기를 기다렸다가 새 모드의 공격을 곧바로 휘두른다(쿨다운 없음). 「공격 직전」(`ON_BEFORE_ATTACK`) 전환은 `Enemy.CombatWrapper._DoCast`가 `Enemy.OnBeforeAttack`을 부른 **뒤에** 이미 고른 옛 능력을 시전한다. 그래서 그 공격은 옛 모드로 치고, 다음 공격은 그 공격이 끝나자마자 나간다: 평범한·노련한·건장한·복서 죄수 리더·중범죄수·전설의 중범죄수의 경고(R)와 해방(L), 머드락의 중첩 1·2·3·5·6(Tier 1~5). 공격 능력이 없는 모드에서는 일반 공격도, 공격 차례의 스킬도 없다(`Unit.hasAttack`).
  데이터: `tools/local-extract/attack_timing.py`가 프리팹의 둘째 모드부터 공격·저지 능력을 모드의 `_replaceAnimPairs`로 이름을 바꿔 읽는다(`enemies[…].modes`, `mode0`). `tools/build-data.mjs enemyModeAnims`가 첫 모드와 다른 것만 `data/enemies.json` `attackAnim.modes`(`null` = 공격 능력 없음; 첫 모드에 없고 뒤 모드에 있으면 첫 모드도 `null`)에 싣는다. 모드가 둘 이상인 적은 73종이고, 그중 41종이 첫 모드와 다르다. 첫 모드의 클립도 능력이 이름 붙인 것을 쓴다(키는 아래 「적 클립의 키 표」로 클립 이름이 된다). 모델에 그 클립이 없을 때만 렌더용 공격 클립을 쓴다. 이 때문에 5종이 바뀌었다: 평범한·노련한 죄수(2026-11-14 키 표로 다시: 첫 모드 키 `Attack` = 클립 `Attack3`, `L` 모드 키 `Attack3` = 클립 `Attack`), 살카즈 본가드 고문관 원거리 `Attack` 2.167초 → `Attack_2` 1.667초, '거대하고 못생긴 것'·'제국의 갑옷' 원거리 `Attack_1`/`Attack_A` → `Attack_2`/`Attack_B`(길이 같음, 타격 프레임만).
  시뮬: `ai.js enemyMode(b, e, mode, restartFsm)`(키트는 `content/enemies/helpers.js mode`)는 공식이 전환하는 자리에서 부른다. 이어 둔 적: 부유의 표류체 `Normal`·양배추 씨앗 `OnFire`·원핵/이형의 악생자 `1`·간이 사육 원석충 `Run`·액젓 추천자 `M2`(첫 모드 M1에는 공격이 없음, 저지되면)·길조의 비린 `Stun`·살카즈 부패의 선봉/개척 선봉·'영장'·죄악/모독의 키메라 `Originium`·수둔 닌자 `M1`·죄수 여섯 `R`/`L`·축제 재즈 연주가 `Attack`(드러났을 때)·가상적: 골극 `Cute`·더블린 불꽃 전사 셋과 가상적: 재생 `Prop`(1초 재생 뒤)·무덤지기 석상 둘 `Stone`→`Fly`·폭탄새 `S1`·잠수부 `Swim`·래트킹 `NoShield`·머드락 `Tier 1~5`·제트맨 `Fly`·눈의 아이 `Unbalanced`·서리를 품은 파울비스트 `Speed`·변형의 베이스 α `ModeB`/`MoveC`/`ModeD`·'어벤져' `Default_Rush`/`Reborn`/`Reborn_Rush`·'거대하고 못생긴 것' `Bird`·제셀톤 윌리엄스 `R`·'즈자이'·데겐블레허 `Reborn`·자로 `M2`·가상적: 총 `S1`·'총을 부수는 리드' 셋 `MoveToHunter`. 잇지 않은 적: 전환 계기가 이 모드에 없음 — '완구 외발자전거'(보석 칸)·주인공/악역 진영 캐릭터(촬영 구역)·복핵의 해류사자·방문단 방패병·온순한 무장 대형 버든비스트·모험을 찾는 선원(장치)·'월장진'(계단 칸)·불안해하는 디자이너·동글이(얼굴 방향, 공격 없음). 공격이 같고 계기를 안 읽은 적: 스컬슈레더·'툼스톤' `Ignite`, W `T1`, 첸사·신싱, 검은 뿔의 루울 `Fail`, 살비엔토 주교 퀸투스 `G1`/`G2`, 알리스테어 `S1`, '염의 가호', '단현지음'/'열관지음', '갑주를 꿰뚫는 탄환' `Boom`. '갑주를 베는 검'·'갑주를 부수는 해머' `Skill`은 출격 중 이미 缴械라 잇지 않았다. 가상적: 정체는 공격 기록이 없어 잇지 않았다. 잠수부의 `Swim`은 전환을 무엇이 거는지(버프 템플릿에 없음) 읽지 않았다 [추정·미조사: 깊은 물에서 `Swim` 재능이 켜지는 자리로 봄]. 원핵의 악생자는 첫 모드에 공격이 없어, 피해를 받기 전에는 저지돼도 치지 않는다(다른 계기인 심해 껍질 장치는 이 모드에 없음).
  확인: `test/sim/enemy-mode.test.js`. 이전: 적은 모드를 몰랐고 첫 모드의 공격 하나로 쟀다. 재생·되살아남 일부만 키트가 쿨다운을 비웠다.
- **적 클립의 키 표** (2026-11-14, 공식 클라에서 확인): 적 능력의 `_animKey`(모드의 `_replaceAnimPairs`를 거친 것)는 키다. 적 프리팹 뿌리 유닛의 `_animator`(`SingleSpineAnimator` 등 `SpineAnimator`)
  `_animations` 표가 키를 모델의 클립 이름으로 바꾸고, 표에 없는 키는 아무 클립도 틀지 않는다(`SpineAnimator.GetAnimationData`가 null — 오퍼레이터 스킨의 키 표와 같은 길,
  아래 「즉발 스킬의 시전」 「클립을 키로 찾는 법」). `tools/local-extract/attack_timing.py anim_table`이 그 표로 푼 이름을 키 옆에 `clip`으로 적고(표에 없으면 `''`),
  `tools/build-data.mjs enemyClipName`이 공격(`attackAnim`)·스킬 시전(`skillCast`)을 그 클립으로 잰다. 전에는 키를 클립 이름으로 써서 능력 582개 중 35곳이 모델에 없는
  이름이었다 — 대부분은 모델의 공격 클립으로 대신해 같은 결과였고, 바뀐 것: 빅 밥 `Attack` → `Attack2`(1초 → 1.9초, 타격 0.167 → 0.733초), 평범한·노련한 죄수 첫 모드
  `Attack3`·`L` 모드 `Attack`, 스컬슈레더 막힘 공격 `Combat` → `Combat_NoPre`, 무덤지기 석상 둘 `Fly` 모드 `Attack_2`, 잠수부 `Swim` 모드 `Attack02`(새로 따로 잼),
  '단현지음'/'열관지음' `Depression` 모드 `Attack_B`(새로 따로 잼), 그리고 시전 길이가 0이던(`miss`) 스킬 다섯 — '갑주를 베는 검' `2` `Revive` 4.433초,
  양배추 씨앗 `onfire` `1to2` 0.667초, 서리를 품은 파울비스트 `switch` `Die_3` 1.667초, 가상적: 기계 둘 `SommonSquad` `A_Skill_1` 3.467초(타격 2초).
  키가 표에 없는 넷(디펜더-4·프로스트·배리어 둘)은 공격하지 않는 적이다. 채널 클립(`skillCast.chan`, 화면용)도 같은 표로 푼다: 자로, '늑대 군주' `FearCage`
  `Skill_Begin`/`_Loop`/`_End` → `A_Skill_*`, '즈자이' `ShieldBurst`·`ShieldBurstReborn`의 시작 키 `Skill_02`는 표에 없다(공식은 시작 클립을 안 틀 것이나 화면이 그 자리에 시작 이펙트를 묶어 두어 키를 그대로 둠 — 묶음 fx-F 채널 클립 줄). 화면의 공격 클립도 이 표를 따른다(2026-11-14, render.md
  「적 공격 클립은 키 표로」: 빅 밥·스컬슈레더 막힘·'단현지음' `Depression` 등 14종). 재발 방지: `test/content/enemy-clip-keys.test.js`, 화면 쪽 `test/render/enemy-attack-clip-keys.test.js`.
  **스킬 시전도 끊긴다**(2026-11-14, 공식 클라에서 확인): `AttackWrapper.Cast`는 시전한 능력(스킬을 골랐으면 그 스킬의 능력)을 돌려주고 공격 상태가 그것을
  `attackAbilityCasted`로 둔다(`AttackState.OnEnter`). 그래서 상태 기계를 다시 시작하는 전환(`_restartFSM`)은 시전 중인 적 스킬도 끊는다 — 끊긴 시전(`interruptEnemyCast`)이라 서 있던 것이
  풀리고 스킬 쿨이 그때 다시 돈다(`ai.js enemyMode`). 재시작이 없는 전환은 떼어지는 스킬 능력의 `_interruptAbilityOnDetach`가 정한다. 스킬이 어느 모드의 것인지는 데이터에 없어 키트가
  끊는다(축제 재즈 연주가, 아래 「투사체 채널 스킬」). 지금 golden의 키트 중 스킬 시전 중에 재시작 전환을 부르는 것은 없다(이 규칙으로 움직인 시나리오 없음).
- 아직 공식과 다른 것: 르무엔 S2의 `_interuptIfTargetDead` 1 — 모델 안 함. `_timeMode` 1·2(오퍼 9개, 적 7개)도 공격 간격으로 계산. `_escapeTime` = 대상이 없어진 뒤 공격 자세(Attack 상태)에 머무는 시간 — `AttackState.<_StartAttack>b__5_0`이 `fixedPlayTime + escapeTime`을
  적고 `_NextAttackOrExit`는 대상이 없으면 그 뒤에야 IDLE로; 다음 공격 조건(대상·쿨다운)은 같고, 시뮬은 아래 「첫 공격 begin」의 첫 공격 판정에만 쓴다(그 능력만 `esc`), 스킬 쪽
  `BasicSkill.get_escapeTime`은 `_useEscapeTime`이 1인 스킬만 — 우리 풀 296개에 없음. 소환물(token)은 데이터가
  없어 휘두름 시작에 바로 타격.
- 테스트: `test/sim/attack-timing.test.js`(오퍼레이터·데이터), `test/sim/feedback5-enemy-swing.test.js`(적: 끊김·헛휘두름·재선택·麻痹), `test/render/attack-swing.test.js`.
  일반 공격 시각이 바뀌어 golden 전부가 움직이고, 첫 공격·스킬 공격 시각을 같은 틱으로 보던 키트 테스트를 「타격까지 기다림」으로 고쳤다.
- **첫 공격 begin** (2026-10-14, 관리자 결정 「첫 공격 begin의 타격 지연을 공식대로」): 공격 능력 옆에 `ThreePartOneshotAnimation`이 있으면 그것이 클립을 틀고
  속도를 정한다 — `UpdatePlaybackSpeed`가 `InitAnimation`의 속도를 능력에 넘기고(참 반환), `InitAnimation`은 배율 = 공격 간격 ÷ (begin(첫 공격일
  때만, `_onlyPlayBeginAnimWhenFirstAttack`) + oneshot + end)를 **그 컴포넌트의** `_minAnimScale`·`_maxAnimScale`(−1 = 제한 없음)로 자른다. `DoPlayAnimation`이
  begin → oneshot 순으로 틀고 타격은 oneshot의 OnAttack을 기다리므로 첫 공격의 타격 = (begin + OnAttack) × 배율. 능력 자체엔 클립이 없어(`_animKey` 빈칸) 휘두름 길이는
  공격 간격 그대로(`AbstractAnimatedAbility.UpdatePlaybackSpeed`의 m_attackTime). 「첫 공격」 = 공격 상태에 들어간 뒤 첫 휘두름: `AttackState.OnEnter`·
  `CombatState.OnEnter`가 firstAttack 참으로, `_NextAttackOrExit`·`_NextCombatOrExit(false)`는 거짓으로 시전(`AbilityStandard.set_firstAttack`).
  시뮬(`ai.js` `attackTiming`·`endSpell`, 유닛 `atkSpell`): 공격(1)·저지(2) 상태가 바뀐 첫 휘두름, 또는 대상 없는 공격 판정이 지난 휘두름 끝 + `_escapeTime` 뒤에 온 뒤의
  첫 휘두름, 기절·缴械·공격 불가·Skill 상태·퇴각 뒤의 첫 휘두름. 'swing' 이벤트 8번째 칸 1 = begin을 붙인 휘두름(렌더가 begin 클립을 앞에 붙임, `render.md`
  「Spine 클립 커버리지」 C), 2 = begin 없는 첫 공격(2026-11-17, 렌더가 시전 이펙트의 `_delayIfFirstAttack`에 씀 — `fx.md` 「시전 이펙트 시점·붙는 대상」 ①).
  **저지 상태는 들어갈 때 준비돼 있어야 첫 공격**(2026-11-18, 2026-11-17 공식 클라에서 확인): `CombatState.OnEnter`는 전투 능력이 `isReady`일 때만 그 자리에서
  firstAttack 참으로 시전하고, 아니면 아무것도 안 해 다음 공격이 `OnTick`의 `_NextCombatOrExit(false)`다 — 쿨다운 중에 저지 상태로 들어간 첫 휘두름은 첫 공격이
  아니다. IDLE에서 COMBAT으로는 준비와 상관없이 넘어가므로 기절·스킬 상태·배치에서 돌아와 다시 들어갈 때도 같다. `AttackState` 쪽은 시전이 실패하면 IDLE로
  돌아가 다시 들어오므로 늘 첫 공격이다. 저지 상태가 있는 것은 저지 능력(`_combat`)이 있는 모드뿐이다(위 「한 모드의 공격·저지 능력」, `attackAnim…combat`).
  그 밖의 오퍼레이터는 저지한 적도 공격 상태에서 치므로, 주 대상이 저지한 적으로 바뀌어도 새 첫 공격이 아니다('swing' 7번째 칸은 그대로 1 — 렌더의 저지 클립).
  시뮬: `ai.js updateAlly`가 상태를 `u.atkCombat`(2)·아니면 1로 세고, 저지 상태에 든 틱에 쿨다운이나 휘두름이 남아 있으면 그 상태의 첫 공격을 쓴 것으로 둔다.
  전에는 상태가 바뀐 첫 휘두름을 모두 첫 공격으로 셌고, 저지 능력 없는 오퍼레이터도 저지한 적을 치기 시작하면 첫 공격(begin 클립·`_delayIfFirstAttack`)이었다
  (golden 43개 시나리오가 움직임). 재발 방지: `test/sim/attack-timing.test.js` 「a combat state entered with the combat ability ready」·「a unit without a combat ability」.
  데이터 `attackAnim.begin`(begin 클립 초 — 키가 골격에 없으면 렌더 역할의 begin: 텍사스 `Attack_Start`)·`esc`.
  해당 모드(EN 클라 전수 + CN 켈시 에스페란타): 텍사스·엑시아 더 뉴 커버넌트·실버애쉬 더 레인프로스트·리스캄·백파이프·인포서·르무엔·산크타 믹사파라토·
  스노우헌터·비질·인사이더·켈시 에스페란타 Default, 스카디 Default·S2·S3, 르무엔 S2, 送葬人 S2 — begin 0.033~0.667 s. 같은 컴포넌트의 상한으로 바뀐 것:
  실버애쉬 더 레인프로스트 Default 1, 리스캄 Default 2, 르무엔 S2 1(공격 능력의 −1이던 것), 백파이프·비질 Default·비질 S3 −1(1이던 것).
  쿨다운이 남은 채 상태에 들어가도 첫 휘두름은 첫 공격이다(2026-10-31 공식 클라에서 확인 — 시뮬과 같음): `AttackState.OnEnter`는 `attackTrigger.isReadyToTrig`이면
  `_StartAttack(true)`를 부르고, `AbilityStandard.CastToTarget`은 `isReady`가 아니면 거짓 → `OnEnter`가 IDLE로 바꾼다. `IdleState.OnTick`은 쿨다운을 보지 않고
  `_SearchAttackTarget`이 참이면 다시 ATTACK으로 → 쿨다운이 끝날 때까지 들어갈 때마다 `firstAttack` 참으로 시도하고, 처음 성공한 시전이 첫 공격이 된다.
  `_minAnimScale` −1(상한 없는 아래쪽)은 안 옮김(전원 −1, 0.1 아래로 갈 간격 없음). 스노우헌터 장전 중 공격(`ReloadAttack` begin `Reload_Break`)도 같은 0.167 s.
  golden 전부가 움직였다(위 오퍼레이터의 첫 타격이 수십~수백 ms 늦어짐 + 'swing' 칸).

### 사냥꾼 장전 (2026-11-05, 공식 클라에서 확인)

사냥꾼(`hunter`, 지금 명단에는 스노우헌터 `char_4211_snhunt`만)의 공격 묶음은 `AbilitySelectableGroup`으로 `Attack` → `ReloadAttack` → `Reload` 차례이고, 묶음이 준비될 때 `HunterBulletTrigger`를 처음 통과한 자식이 시전된다. 대상이 있고 탄이 있으면 공격한다. 그 밖에 탄이 덜 찼으면 `Reload`(`ReloadAnimatedAbility`, 대상 없이 시전)다. 표 문구 「不攻击时」와 같다.

- 주기: `_CalculateCooldown` = 표의 기본 공격 시간(`baseAttackTime`) + 특성 능력 블랙보드 `reload_interval`(없으면 0), 공속 100으로 계산. 공속 버프와 무관하다. 스노우헌터는 1.6초.
- 탄이 드는 때: `snhunt_tr_add`가 ON_SPELL_END에 붙고 `Reload_Loop`에는 `OnAttack`이 없으므로 대기 상한인 주기 끝이다. 시전마다 1발.
- 시전 중 나타난 대상은 그 시전이 끝난 뒤 공격한다(묶음의 쿨다운이 자식 쿨다운을 따름, `_updateCooldownBySubAbilityCooldownDuringCasting`).
- 기절·스킬 시전이 끊으면 그 탄은 없고 쿨다운은 그대로 돈다(`Ability.InterruptIfNot`).
- 탄이 0이고 대상이 있으면 장전 → 공격이 번갈아 나서 공격 빈도가 절반이 된다. 전에는 공격 사이에도 장전해 간격이 1초 넘으면 탄이 거의 줄지 않았다.

`server/sim/professions.js` `installHunter`, `test/sim/hunter-reload.test.js`. 스노우헌터가 약해지는 쪽의 변경이다. [화면 미확인]

## 오퍼레이터 키트 — 공식 클라·프리팹대로 (2026-10-10, 관리자 결정 「동작 변경 모두 공식이랑 동일하게」)
근거: EN 클라(2026-08) 프리팹 값과 공식 클라(레포에는 클래스·메서드 이름만). 켜진 Lua 핫픽스(`DefinedFix.lua` en_US·zh_CN)에 아래 메서드 없음.
- **跃跃(케이퍼, `char_4100_caper`) S2 乐趣加倍** (`chess_char_1_09-caper.js`): 공격마다 부메랑 `cnt`개 — 공격의 것(`projectile_chr_caper_s2`) 하나와,
  0.1 s 간격으로 같은 대상에 `cnt − 1`개 더(charpack `Modes/S2/Body/Attack` `_additionalTimes` 1, `_triggerDelta` 0.1, `_additionalProjectile`
  `projectile_chr_caper_s2_1` = `_inverseParacurve` 반대쪽 호). 각 1타(`_hitNumType` LIMITED, `_maxHitNum` 1), 각자 돌아오고, 다 돌아와야 다음 공격.
  총 spell 수 = 1 + `_additionalTimes`, 사이 `_triggerDelta`(공식 클라 `MultiRangedAttack.CheckAnotherSpell`: `spellCnt > _additionalTimes`면 끝).
  추가 부메랑은 같은 시전의 다음 spell이라 같은 대상(`_selectTargetTiming` 0)이고, 그때 죽은 대상에는 안 던짐(공식 클라 `AbilityStandard._DoCast`
  → `CheckAnotherSpell` → `OnWaitForTriggerDelta` → `OnSpellStart` → `DoCastOnTargets`는 살아 있는 대상만). 기절·퇴장 중이면 안 던짐 [추정: 상태 전환이 능력을 끊음].
  같은 공격(attackId)이다. 그 전(~2026-10-10): 부메랑 하나가 `cnt`타를 싣고 함께 날았다. 엔진은 `ai.js throwBoomerang`을 export만 했다(키트가 부름).
  화면: 두 번째 부메랑은 fx `caperBoomerang2` { id, tgt, n } — 아직 그리지 않음(`kinds.js` 'none'; 공격 'atk'의 부메랑만 보임). 풀의 回环射手는 跃跃뿐
  (`data/chess.json` loopshooter). 테스트 `test/content/kits_t1t2.test.js` 「1_09」.
- **缄默德克萨斯(텍사스 디 오메르토사, `char_1028_texas2`) S3 剑雨滂沱** (`chess_char_4_16-texas2.js`): 프리팹 `skchr_texas2_3`은 `AbilitySequenceGroup`
  (1Frame → AppearSwordRain → ModeWithSwordRain; 앞 능력이 끝나야 다음 — 공식 클라 `AbilitySequenceGroup._OnSubAbilityFinished` → `_MoveToNextActiveAbility`).
  배치 폭발 AppearSwordRain: `_preDelay` 0.6 s 뒤, 0.2 s 간격 2타(`_additionalTimes` 1, `_triggerDelta` 0.2), 타마다 대상 다시 고름(`_selectTargetTiming` 1)·
  기절(`_activeBuffs` stun). 그다음 ModeWithSwordRain이 검우 버프 `texas2_s_3[sword]`(`triggerability_tick_trigger`, `firstTriggerInterval` 0.4,
  `triggerInterval` 1, 수명 `duration`)를 붙인다 — AppearSwordRain의 시전(1 s, 둘째 타 뒤 후딜 0.2 s 포함 — 「오퍼레이터 스킬 발동 시점 묶음 C」)이 끝난 뒤 →
  첫 검우는 배치 1.4 s, 그 뒤 1 s마다. 검우 대상은 그 순간 고르고(EmitSword
  `_selectTargetTiming` 1, `max_target`), 검마다 `_randomDelayToBorn` 0–0.3 s(전투 난수 `battle.rng`; 클라 `Projectile._InitInline`은 0–최댓값 균등 지연 뒤 투사체를 탄생시킴, 난수는
  `randomTrivial`) 뒤 피해·기절(`projectile_chr_texas2_s3_sword_rain`).
  패시브 길이: 검우 버프부터 `duration` → 스킬 지속 = `duration` + 1 s(`texas2_s_3`·`[sword]` 버프(수명 `duration`)를 마지막 단계가 붙임) —
  검우 횟수는 그대로 `duration`번. [추정]: 1Frame 단계(1프레임)는 넣지 않음, 검이 생긴 뒤 `_lifeTime` 0.1 끝(`_alwaysHitTraceTargetInTheEnd`)에 맞는지는
  안 봄(생길 때 피해로 둠), AppearSwordRain `_preDelay`가 공속 배율을 받는지 안 봄(0.6 s 고정). 첫 처치 재시전(德克萨斯传统)은 남은 배치 타·검을 지우고
  새로 시작한다(배치 폭발 시전 1 s 안의 처치는 재시전 없음 — 「오퍼레이터 스킬 발동 시점 묶음 C」). 그 전: 배치 2타 동시, 첫 검우 1 s(배치 기준), 검 동시; 2026-10-29까지는 첫 검우 1.2 s·지속 + 0.8 s(능력이 마지막 타에서 끝난다고 봄).
  S2 阵雨连绵(같은 꼴 1Frame → `Damage` → `Duration`): 폭발은 `Damage` `_preDelay` 0.167 s 뒤(전: 시전 순간), `Duration`(`texas2_s_2`)은 `Damage` 시전 1 s 뒤부터
  `duration` → 스킬 지속 `duration` + 1 s(전: `duration`); 공격력·공격 모드(`texas2_s_2[atk]`, 스킬 루트 `switch_mode_restart_fsm`)는 스킬 내내.
  S1은 버프 능력 하나라 시전부터 `duration`(그대로). 테스트 `test/content/kits_t4.test.js`·`kits_alt_t4.test.js` 「缄默德克萨斯」.
- **歌蕾蒂娅 S3 缺水的碎漩狂舞 중 일반 공격 없음** (2026-10-14, 관리자 결정 「S3 중에는 일반 공격을 하지 않는다」; charpack `skchr_glady_3` `_switchToState` 1 =
  Skill 상태): 스킬 내내 `noAttack`(`chess_char_4_12-glady.js`), 모델은 `Skill_3_Chant`로 쉰다. 그 전엔 S3 중에도 평소 `Attack`으로 공격했다. 테스트
  `kits_alt_t4.test.js` 「歌蕾蒂娅 S3」.
- **글래디아 S3 시작 순서** (2026-10-29, 공식 클라 + 관리자가 공식 게임에서 확인): 스킬 능력은 순차 묶음(`AbilitySequenceGroup`) [`FinalAttack` → `Chant` →
  `SwitchMode` → `FinalAttack`] — 시작은 첫 능동(ACTIVE) 자식부터(`_MoveToNextActiveAbility`), 하나가 끝나면 다음. `FinalAttack`은 클립 없는 끌어당김 공격
  (투사체 `projectile_chr_glady_s3_3`: 지점에 붙는 두 단계 끌어당김, 수명 1.3초; 대상 출처 INPUT_POINT)이라 Spine `OnAttack` 이벤트를 기다리고(`EasyToStartAbility`
  선딜, 최대 시전 시간), 투사체가 끝난 뒤 애니 끝 이벤트를 최대 1초(`_minPostDelayWhenProjectileInvalid`) 더 기다린다. `Chant`(`Skill_3_Startup`)가 시작하자마자
  회오리 본체 `ChantAttack1`·`ChantAttack2`를 시전한다. 묶음 끝의 `FinalAttack`이 끝의 捕网.
  관리자 관찰: S3를 켜면 아주 약간 뒤 회오리가 생기면서 범위 주변 적을 끌어당긴다 — 끌어당김이 먼저. → sim: 시작 0.3초 뒤 회오리(묶기·회오리 fx·감속·맥동)가
  생기면서 반경 1.5 안 적을 중심으로 한 번 끌어당김(피해 없음 — 피해는 맥동, 맥동 간격은 그때부터), 끝의 捕网은 그대로(반경 1, 글래디아 앞으로).
  [추정·화면: 0.3초 — 관찰 「아주 약간의 지연」에 고른 값; `FinalAttack`의 `OnAttack` 대기를 무엇이 일찍 끝내는지는 안 읽음(스킬 상태 진입은 클립을 틀지 않음,
  `SkillState._StartSkill`)]. 그 전에는 묶기·회오리가 시전 순간. 테스트 `kits_t4.test.js` 「歌蕾蒂娅 S3」. 조사 기록은 관리자 노트.
- **글래디아 S3는 범위 안에 고를 적이 있어야 켜진다** (2026-11-16, 공식 클라에서 확인 — 관리자 제보: 등 뒤에서 막은 적에게 S3가 켜져 이펙트가 없고, 은신 장판 맵에서 피해가 없음):
  자동 조작은 발동 규칙(DEFAULT)과 별도로 `CastSkill.get_canCastCheck`를 묻는데, 스킬 프리팹 `skchr_glady_3`의 `_trigger`(`ChantAttack1`의 선택자: `SelectorTrigger`
  `_minTargetNum` 1, 지금 범위 상자, 적·지상과 공중)가 대상을 못 찾으면 거짓이다. 그래서 범위 밖에서 막은 적만 있으면 켜지지 않고 그 적을 일반 공격한다. 전에는
  막은 적 조건만으로 켜져 대상 없이 8초 동안 회오리·피해·일반 공격이 모두 없었다. sim: 처음엔 키트 `castCheck`로 넣었고, 2026-11-17부터 모든 스킬 프리팹의
  `_trigger`를 추출해 엔진이 찾는다(「스킬 범위 발동」 끝의 「스킬 프리팹의 대상 트리거」). 재발 방지: `test/sim/glady-s3-cast-check.test.js`.
- **산크타 믹사파라토 S3 반격 대상** (2026-11-16, 공식 클라에서 확인 — 관리자 제보: 뒤에서 막은 적이 때리면 탄만 줄고 반격 피해가 없음): 반격 `S3Attack`·`S3Attack_Zero`의
  선택자는 `BlockedOrAdvancedSelector`다. 자신이 막은 적(`Character.blockedEnemies`)을 범위와 상관없이 먼저 `max_target`(3)까지 넣고, 남는 자리만 범위 안 적으로 채운다.
  그래서 등 뒤에서 막은 공격자도 반격을 맞는다. 전에는 범위(3-13) 안 적만 골라 그런 공격자에게는 「대상 없는 반격」으로 탄만 썼다. sim: 키트 반격이 `blockedTargets`
  다음에 범위 안 적(때린 적 먼저). 재발 방지: `test/sim/rmixer-s3-counter-blocked.test.js`.
- **민트(오퍼레이터, `char_388_mint`) S2 「커뮬레이티브 볼텍스」(`skchr_mint_2`)는 `duration` − 4/3초에 끝나고, 끝 폭발은 그 0.6초 뒤 고정 범위 `x-1`** (2026-10-29,
  공식 클라 — 스킬 프리팹·버프 템플릿 + 함수): 스킬 루트의 세 단계 애니(`ThreePartChannelingAnimation`: `Skill_2_Begin` 0.5초 → `Skill_2_Loop` → `Skill_2_End` 4/3초)는
  능력 시간 안에 다 들어가고(`UpdatePlaybackSpeed`: 루프 = 시간 − 시작 − 끝, 시간이 모자랄 때만 배율 < 1 — S2는 늘 1), 끝 클립을 틀자마자 공격 끝 이벤트를
  낸다(`_fireAttackFinishEvent` 1·`_delayToFireAttackSkillEvent` 1·`_delaySecond` 0). 스킬의 `_earlySkillFinishAtAttackFinished` 1이면 `BasicSkill.OnSkillStart`가 그 이벤트를
  한 번 듣고 `_OnReceiveAttackFinishEvent`가 평소 스킬 끝(`Character.OnSkillFinish` + 스킬 끝 신호)을 그때 한다(`OnSkillEnd`는 이미 끝났으면 다시 안 함) → 스킬은
  끝 클립이 시작하는 `duration` − 4/3초(20초 → 18.667초)에 끝난다. 버프 템플릿 `mint_s_2`의 ON_SKILL_FINISH가 `FinalAttack`을 시전하고 무장 해제(DISARMED)
  버프 `mint_s_2[final]`을 붙인다(진법술사는 원래 스킬 밖에서 공격하지 않으므로 sim은 그대로). 풀에서 이 구조는 민트 S2와 노시스 S3뿐(노시스 S3는 이 모드
  기물이 안 씀). 끝 폭발은 스킬의 추가 능력 `FinalAttack`(근접 공격, 클립 없음 `_animKey ""`, `_waitForAttackEvent` 1, `_timeMode` 2 `_cooldown` 0.62초,
  `_atkScaleKey` atk_scale)이다. 클립이 없어 Spine `OnAttack`을 최대 시전 시간(0.62초)까지 기다리고(「글래디아 S3 시작 순서」의 `EasyToStartAbility` 선딜),
  그 `OnAttack`은 끝 클립 `Skill_2_End`의 0.6초 → sim은 스킬이 끝나고 0.6초 뒤 폭발한다(그 사이 그녀가 쓰러지면 안 남). 대상 고르기는 `ConstBoxRange` `_rangeId` x-1, `_extendable` 0이고
  `PhysicsRange.UpdateExtend`는 `extendable`이 거짓이면 사거리 증가를 적용하지 않는다(공식 클라에서 확인) → 그녀의 지금 공격 범위가 아니라 늘 x-1(사거리
  증가 맹약·장비를 받지 않음). 방어 유지(정예 모듈)·도발 −1은 스킬과 함께 끝나므로 폭발 전에 풀린다. 그 전: 스킬이 `duration`(20초) 내내, 끝나는 순간 그녀의
  지금 공격 범위에서 폭발. 소리는 폭발이 아니라 스킬 끝(`audio.md` 「스킬 시전 능력 소리」). 테스트 `kits_t3.test.js` 「3_08 薄绿」 둘.
- **傀儡师 전환 2 s** (2026-10-14, 클라 프리팹): 전환은 순차 능력(charpack `CommonAbilities` `kazema[switch2stand]`·`[switch2normal]`, 归溟幽灵鲨 `ghost2[…]`도
  같은 꼴) — SwitchBegin이 보호 버프(`*_switchbegin`: 무적·불사 등, INFINITY)를 걸고, 죽는 클립과 나오는 클립이 각각 제 길이(`_timeMode` 1, `_maxAnimScale` 1;
  风丸 `Die_2`→`Start_B`, 돌아올 때 `Die_B`→`Born`(=`Start`), 归溟幽灵鲨 `Die`→`Start_B`, `Die_B`→`Start_2`, 모두 1 s), 나오는 단계의 `BuffAfterAffecting`(OnEvent
  2 = 시전 시작에 표시, `OnTick`이 능력이 끝난 뒤 `AddBuff`)이 그 클립이 끝난 뒤 `*_switchend`(보호 버프를 지우는 ClearAllBuffs + SwitchMode)를 건다 →
  `professions.js DOLL_SWITCH` 2(전엔 추정 1 s). 몸을 바꾸는 오퍼레이터는 풀(선발 포함)에 이 둘(카제마루·스펙터 디 언체인드)뿐이고 둘 다 위 클립을 읽었다 — 파투스(远牙)의 주둔지 `garrison_108_a/b`는
  맹약 층만 주고 특질을 주지 않는다(2026-11-03 확인, 그 전에 추정으로 적었던 「远牙가 준 특질로 바뀌는 다른 오퍼레이터」는 해당 없음).
- **迷迭香 感知稳定은 오라** (2026-10-16, charpack `char_391_rosmon/Talents/2`): `_checker`(professionMask 32 = 术师, minCount 1)가 맞는 동안 붙는 Aura —
  术师 하나(`_maxNum` 1)와 그녀(`_selfOption`)가 `rosmon_t_2`를 지니고, 그 术师가 떠나면 빠지고 다른 术师가 받으며(`_removeBuffWhenTargetLeave`), 그녀가
  떠나면 모두 빠짐(`_removeBuffWhenAbilityDetached`); 그녀 뒤에 배치된 术师도 받는다. 그 전엔 배치 순간 한 번 골라 붙인 뒤 지우지 않아, 그녀가 떠나도
  남고 재배치마다 다른 术师에 쌓였다 → `chess_char_6_12-rosmon.js`(배치마다 0.25 s 확인). [ASSUMED: 새로 고를 때 무작위, 0.25 s 간격]. 테스트
  `kits_t6.test.js` 「感知稳定 is an aura」.
- **风笛 精密填弹은 타격마다 굴리는 추가 피해** (2026-10-16, 버프 템플릿 `bpipe_t_1`): ON_CALCULATE_DAMAGE마다(한 공격의 타격마다 — S2 2타·S3 3타가
  각각) `prob` → 그 타격 ×`atk_scale`(AtkScaleUp) + SplashDamage(: 그녀 공격의 대상 선택기로 맞은 적을 뺀 한 명, 물리·NORMAL 공격, 그녀 공격
  배율 ×`atk_scale`, `effect` `bpipe_attack_02_hit`; `avoid_dup_trigger_lock`으로 그 피해는 다시 안 굴림). 그 전엔 공격마다 한 번 굴려 둘째 적을 **공격 대상**에
  넣어 'atk'·일반 명중 이펙트까지 그 적에 나왔다 → `chess_char_4_07-bpipe.js`('hit' 우선순위 1: 모듈 115 %보다 먼저 원래 피해를 읽음, 추가 피해는 SP 없음).
  테스트 `kits_t4.test.js` 「风笛 S2」.
- **流明 应急处理는 배치마다 대기부터** (2026-10-24, 관리자 결정 「공식처럼」; charpack `char_4042_lumen` Talents/2, 버프 템플릿 `lumen_t_2[…]`): 능력의
  `_passiveBuffs` `lumen_t_2[cooldown]`(LIMITED, `durationKey` `duration`)이 배치 때 붙어 첫 치유는 배치 `duration` s(잠재·모듈에 따라 8~12) 뒤다.
  `[cooldown]`이 끝나면 `[enable]`(overrideEffectKey `lumen_buff_01_start` — 준비 빛)이 생기고, 범위 안 동료의 `lumen_t_2[listener]`는 그녀에게
  `[cooldown]`이 없을 때만 그 동료의 체력 비율이 `hp_ratio` 1.0 미만이면(가득 찬 동료는 안 침) 치유·`lumen_buff_01_hit`·`[enable]` 끝 → `[enable]`의 끝이
  `[cooldown]`을 다시 건다. 시뮬: 보이는 버프 `'lumen:ready'`(재배치·이동 배치마다 다시 대기). 그 전엔 배치 직후부터 치유했고 가득 찬 동료에게도 쿨다운을
  썼다 → `chess_char_6_14-lumen.js`. 골든 `roster-017`의 应急处理 9 → 8. 테스트 `kits_t6.test.js` 「流明 应急处理」.
- **오퍼레이터 공격 형태 — 스킬 모드의 공격 능력대로** (2026-11-03, 공식 클라 charpack `Modes/<모드>/Body/Attack`·`Body/Combat`):
  - **사리아(塞雷娅) S3 칼슘화(钙质化) 중 적 공격 없음**: S3 모드의 공격 능력은 하나뿐이고 그것이 치료 펄스다 — `Modes/S3/Body/Attack/Trigger._targetSide` 1(아군),
    대상 수 제한 없음(`_limitTargetNum` 0), `_timeMode` 2·`_cooldown` 1초, 명중 `common_heal_hit_01`. 첫 치료는 시작 1초 뒤다(2026-11-07, 공식 클라에서 확인): 모드 전환으로 붙은 공격 능력은 바로 준비되고(`Ability.DoAttach`), 클립이 없으니 `_waitForAttackEvent`가 공격 시간 1초를 다 기다린다(`_preDelay` 0.533은 안 쓴다). `Body/Combat`도 없다. 그래서 S3 동안 그녀는 막은 적도 치지
    않고, 범위 아군 치료(`attack@heal_scale` × 공격력, 1초마다)와 적 석회화(받는 마법 피해·이동 속도)만 한다 → `chess_char_5_11-demkni.js` S3 `attack: { noAttack: true }`.
    그 전엔 S3 중에도 기본 모드 공격으로 적을 쳤다. 렌더는 S3 중 공격 클립을 원래 안 튼다(render.md 「스킬 중 공격 클립」). 펄스의 첫 치료 시점은 그대로 시작 1초 뒤다(위).
    테스트 `test/content/attack-forms.test.js`.
  - **티피(蒂比) 일반 공격은 원거리**: 모든 모드의 공격이 투사체를 쏜다(`Modes/Default|S1|S2/Body/Attack` `_projectileKey` `projectile_chr_tippi`·`_s1`·`_s2`,
    TRACE 10), `Body/Combat`이 없어 막은 적에게도 쏜다. 시뮬은 특수 직군 기본값(근접, 투사체 없음)으로 쳐 「오퍼레이터 투사체」의 `shot`이 안 들어갔다 →
    키트 trait `attack: 'ranged', projectile: 'arrow'`(생성 데이터 `attackKind`는 그대로 melee — 배치 위치 MELEE). 피해는 투사체가 닿을 때, 'swing'·'atk'의
    kind가 'arrow'(소리는 착탄 신호가 도착 때). 테스트 `test/sim/op-shot.test.js`.
  - **혼(号角) S2 폭풍의 호령 중 저지한 적** (확인만, 코드 그대로): S2 모드에는 근접 능력이 없고 저지 중엔 `BlockedRangedAttack`(`Blocked Selector` 1명,
    클립 `Skill_2_A_Loop`, 신호 버프 `horn_s_2[signal_melee]`)이 `projectile_chr_horn_s2_melee`를 쏜다 — 이 투사체는 ATTACH·즉시(비행 없음)라 타격 순간
    맞고 폭발한다. 시뮬은 포트리스 규칙(저지 중 그 적 한 명, 'none' kind, 타격 순간, 폭발 포함)으로 이미 같다(렌더 A 클립·소리 근접 신호도). 저지 안 할 때는
    `RangedAttack`(`projectile_chr_horn_s2`, PARACURVE 5, 클립 `Skill_2_B_Loop`). 테스트 `attack-forms.test.js`(고정).
  - **포트리스(要塞)의 저지 중 근접 타격엔 폭발 없음** (2026-11-03): 혼 기본·S3 모드와 애쉬락(灰毫) 기본 모드의 저지 공격은 `MeleeAttack`·`BlockedMeleeAttack` —
    투사체·폭발 없는 근접 능력(생성 데이터 `shot.combat` 1, 위 「오퍼레이터 투사체」). 그래서 막은 적 한 명만 맞고 옆 적은 안 맞는다 → `ai.js performAttack`이
    그 타격만 폭발 반경 0으로 친다. 혼 S2(`combat` 0, 위 줄)는 투사체라 폭발 그대로; 혼 S1의 「원거리면 폭발 범위 확대」는 원래 막지 않을 때만(`hornFlare`).
    전에는 저지 중 근접 타격에도 반경 1.0 폭발이 붙었다. 테스트 `attack-forms.test.js` 「号角 (要塞) Default…」·「灰毫 (要塞) Default…」.
  - **위(余) S3 화염벽의 적 투사체 차단선은 그의 칸 앞 모서리**: `skchr_yu_3/Aura/EnemyAura` 범위는 줄 전체(`_isHorizontalInfinite`)·앞으로 `_horizonOffsetFront` 0.5칸·
    두께 `_horizonSize` 0.3, 들어온 적 투사체를 지운다(`_eliminateOnEnter`, `yu_skill3_annex_01`). 시뮬은 그의 칸 가운데 줄로 판정해, 그 줄 위에 선 그 자신을
    노린 원거리 공격은 막지 못했다 → 적 공격 판정만 앞 모서리(`yuWall.front`); 차단 이펙트 'firewallBlock'도 그 줄에. 아군 마법 피해에 붙는 화상(`AllyAura`,
    `yu_s_3[ally]`)도 같은 앞 모서리인데 격자 칸으로 잰다(2026-11-07, 공식 클라에서 확인: 버프의 `SwitchDirection` 아래 `CheckTargetGridPositionRowOrColWithBB`가 공격자와 대상의 칸을 그의 칸과 비교, 양쪽 방향 다). 그래서 그와 같은 열의 아군이 앞쪽 적을 치면 넘는 것이다(전에는 가운데 줄이라 안 넘음). 두께 0.3 안에 선 적은 따로 다루지 않음. 테스트 `kits_t6.test.js` 「余: S3 stops」.
  - **로드(领主) 분과의 저지 중 공격** (`Body/Combat`, 확인만): 기본 모드는 이미 같다 — `Combat`은 `_atkScale` 1(로드 원거리 0.8 감쇠 없음 = `professions.js lord`
    `dmgMul`의 저지 대상 1), 투사체 없음(`shot.combat` 1 → 즉시), 대상은 저지한 첫 적 한 명(`maxTargets` 1). 다중 대상 스킬 모드도 시뮬(저지한 적 + 범위의 다른 적,
    합쳐 스킬의 대상 수)과 같다 — 공식 클라에서 확인(2026-11-03): 능력의 대상은 `AbilityStandard.UpdateTargets`가 `_selectTargetSource`대로 고른다 — `INPUT_TARGET`(2)은
    입력 대상 자리에서 선택자로(선택자가 없으면 아무도 안 고름), `FROM_OWNER`(1)는 주인 자리에서 선택자로, 그 뒤 `_alwaysIncludeTarget`이면 입력 대상(전투 상태에선 저지한
    적)이 빠졌을 때 마지막 자리를 그것으로 바꾼다. 기본 모드 `Combat`(라플란드·로드·샤프·치우바이·실버애쉬)과 치우바이 S2 `Combat`은 선택자 없는 `INPUT_TARGET` → 저지한 적 하나.
    라플란드 S2 `Combat`은 S2 공격의 선택자(`_maxNum` 2)를 함께 쓰는 `FROM_OWNER`, 로드·샤프 S1 `Combat`은 자기 선택자(`_maxTargetKey` `max_target`)의 `FROM_OWNER` —
    `UnitMode.OnInit`이 모드의 `_combat`·`_attack`·공격 트리거에 같은 공격 블랙보드(스킬 블랙보드의 `attack@` 키, `BasicSkill.GetAttackBlackboard`)를 넣고
    `Ability.DoSetData` → 선택자 `AdvancedSelector.SetData`가 그 키를 읽으므로 저지 중에도 `attack@max_target`(2)명. 치우바이 S3·실버애쉬 S3 모드에는 `Combat`이 없어
    (`Character.get_hasCombat` = 지금 모드의 `_combat`이 있고 전율이 아님) 전투 상태에 안 들어가고, 티피처럼 막은 적도 공격 선택자(치우바이 `_maxNum` 3, 실버애쉬
    `max_target`)로 친다. 켜진 Lua 핫픽스에 이 메서드들 없음. 테스트 `attack-forms.test.js` 「拉普兰德」(고정).
- **카제마루(风丸) 재능 「折纸生花」은 지상 적만** (2026-11-03, 버프 템플릿 `kazema_standin[damage]`): <替身>이 나타날 때 붙는 이 버프는 `lifeTimeType` 0(즉시) —
  붙자마자 끝나며 ON_BUFF_FINISH `AOEDamage`(범위 `x-4` = 제 칸과 둘레 8칸, 마법, 버프 출처의 공격력 × `damage_scale`)를 낸다. 그 대상 옵션이
  `targetMotion` WALK_ONLY라 공중 적은 안 맞는다. 시점은 전과 같고(나타나는 순간), 전에는 공중 적도 맞혔다(PRTS에 대공 비고가 없어 그렇게 짐작했던 것). 테스트
  `kits_t1t2.test.js` 「2_11 风丸: the trait's <替身> hits air units…」의 소환 替身 부분.
- **실버애쉬 더 레인프로스트(凛御银灰) S2의 대기 오퍼 재배치 베기 시점** (2026-11-03, 덱 버프 `svash2_s_2[build]`): 재배치한 오퍼에 붙는 이 버프는 0.1초마다
  돌며(`triggerInterval` 0.1) `time` ≥ `first`면 벤다(스택 하나 줄고 `first` += `next`), 아니면 `time` += `interval` — `svash2_s_2[build_set]` 기본값
  `first` 1.0·`next` 0.4·`interval` 0.1. 그래서 두 번 쌓였으면 선 뒤 1.1초·1.6초에 벤다(그 사이 쓰러지거나 퇴각하면 남은 베기 없음). 전에는 서자마자
  한꺼번에 벴다. 베기 범위는 그대로: `AOEDamage`는 블랙보드 `range_id`가 있으면 `_rangeId`(여기 '0-1') 대신 그것을 쓰고(공식 클라에서 확인), 버프
  블랙보드는 스킬의 것이라 `range_id` 3-7(그 오퍼 칸·방향 기준). 테스트 `kits_t5.test.js` 「凛御银灰 S2: a waiting op left of the eye slashes…」.
- **뮤엘시스 유동체의 쓰러짐** (2026-11-16, 공식 클라에서 확인 — 토큰 프리팹 `token_10030_mlyss_wtrman`, 버프 템플릿 `mlyss_wtrman_t_1[listener]`·`[trigger]`·`[reborn*]`):
  유동체는 `RallyPoint`이고 살아 있는 모드(Default·Melee·Range·Range_S2·Melee_S3)마다 `Talents/1`에 `mlyss_wtrman_t_1[listener]`가 있다. 체력이 0이 되려는
  순간(`ON_BEFORE_TRY_SET_HP_ZERO`) 죽지 않고 전투 밖 분류로 바뀌어(`SwitchRallyPointCategory`) 모드 0 Recharge(물웅덩이)로 가고, 유동체 스킬을 끊고 SP를
  0으로 한다. 루트의 `_retainedBuffsWhenDead`가 복사 표시(`mlyss_wtrman_melee[mark]`·`range[mark]`), 훔친 공격력·방어력(`steal_attr_self[atk]`·`[def]`),
  분열 횟수(`mlyss_wtrman_t_2[range_cnt]`)를 남긴다. Recharge의 `mlyss_wtrman_t_1[trigger]`가 재능 `interval`(정예 단계별 30·28·25초) 뒤 `mlyss_wtrman_switch_melee`·
  `_range`(복사 전이면 `mlyss_wtrman_switch`)를 시전하고, 그 `_preDelay` 1초 뒤 부활 버프(`RallyPointReborn`, `hp_ratio` 1)가 복사한 모드로 되돌린다. 분열
  복제는 같은 `overrideKey`에 우선순위가 높은 `mlyss_wtrman_summon[override]`가 `[listener]`를 덮어 그대로 쓰러진다. → 키트(`chess_char_6_11-mlyss.js`)는
  쓰러진 유동체를 지우지 않고(`alive` 거짓·`removed` 거짓, 칸은 `Battle.isReservedTile`이 잡음) `interval` + 1초 뒤 그 칸에 체력 가득으로 다시 세운다 — 복사·
  훔친 값·분열 횟수 그대로, SP 0. 그녀가 서 있든 아니든 같다(타이머는 토큰 쪽 버프). 그동안 그녀가 다시 배치되면 쓰러진 유동체가 그대로 그녀의 지원군이다
  (`tokens.js ensureReinforcement`, 엔진의 일반 지원군도 만들지 않음 — `professions.js installTactician`은 `removed`가 아닌 지원군을 그녀의 것으로 본다). 전에는
  지우고 25초 뒤 새 유동체를 소환해 다시 복사했고(그녀가 서 있을 때만), 그녀가 쓰러져 있으면 되살리지 않았다. 키트 없는 일반 토큰 경로(`tokens.js manifold`,
  그녀 키트를 일반 키트로 바꾼 시험에서만)는 전처럼 복사 없이 되살린다. 시험 `tokens_summons.test.js` 「a fallen 流形 …」 둘·「a split clone alive …」,
  `kits_t6.test.js` 「缪尔赛思: a destroyed 流形 waits on its tile …」. 이펙트는 rules/fx.md 「뮤엘시스 유동체의 쓰러짐·모습 바뀜」.

## 적 스킬 = 일반 공격 차례 (2026-10-21, 관리자 제보 「퀸투스가 HP가 낮아지면 기억보다 너무 셈」, 관리자 결정 2026-10-21 「엔진 전체로」)
적 스킬(enemy_database `skills`)을 EN 공식 클라대로 일반 공격 **자리에서** 쓴다. 켜진 Lua 핫픽스(`DefinedFix.lua` en_US·zh_CN)에 아래 클래스 없음.
- **공식**: 적의 MOVE 상태가 틱마다 `Enemy._SearchAttackTarget` → `Enemy.AttackWrapper.SearchTarget`을 부른다. 일반 공격 능력이 `isReady`(쿨 끝)일
  때만 스킬들을 보고, `EnemySkill.CheckFamilyMask`(ATTACK)·`CheckAvailable`(켜짐·쿨·`_ignoreSilence` 아니면 침묵/기절 아님·`isSkillActivatable`·SP)을
  통과하고 대상을 찾은 스킬 중 `priority`가 가장 높은 것(같으면 `IBattleRandom.Uniform`)을 고른다. `AttackState.OnEnter` → `AttackWrapper.Cast`가 그 스킬을
  **일반 공격 대신** 시전하고(`EnemySkill.CastToTarget`), 시전한 능력이 일반 공격이 아니면 `mainAttack.ResetCooldown(true)` — 일반 공격 쿨이 처음부터 다시 돈다.
  막힌 근접 적의 Combat도 같은 구조(`CombatWrapper._PickAbility`: 우선순위·COMBAT 가족). 스킬 자신의 쿨은 시전 중 멈추고(`EnemySkill.OnTick`:
  `isCasting`이면 갱신 안 함) **시전이 끝날 때** 다시 시작한다(`_OnCastFinish`: `m_cooldownTimer.Reset`) → 다음 준비 = 시전 길이 + 쿨. 그 스킬의
  `_resetMainAbilityCdWhenCastEnd`면 그때 일반 공격 쿨도 `ResetCooldown(_resetCdWaitFirstPeriod)`. `Enemy.TriggerEnemySkill`은 강제 시전 경로로, 역시
  공격·전투 래퍼로 보낸다. 모드의 적 프리팹 스킬 126개는 모두 `_familyMask`에 ATTACK이나 COMBAT이 있다(3이 109개, 2가 9개, 1이 7개, 31이 1개).
- **우리**: `server/sim/ai.js` `enemyAttack`이 공격 차례(쿨 끝·지난 휘두름/시전 끝·麻痹震颤 아님, 恐惧·缴械·战栗(막힘) 아님)에 대상을 찾기 **전에** 훅
  `enemySkillSlot`을 내고(docs/SIM.md 훅 표), `server/sim/content/enemies.js` `onSkillSlot`이 준비된 스킬(`cond` = 대상 조건, `canCast`)을 위 규칙대로 하나 골라 시전한다:
  일반 공격 쿨 = 간격 전체(또는 `resetMain`이면 시전 끝 + 간격/0), `castLeft` = 시전 길이(그동안 일반 공격 없음, 「不停止移动」이 아니면 서 있음), 스킬 쿨 =
  쿨 + 시전 길이.
- **시전 길이** (2026-11-03, 공식 클라에서 확인): 스킬 능력이 클립을 맞추는 「공격 시간」은 그 능력의 `_timeMode`로 정해진다
  (`AbstractAnimatedAbility.get_cooldown`: 0 = 적의 공격 시간, 1 = 자기 클립 길이(`DoAttach`가 클립 길이를 `_cooldown`에 넣음), 2 = 프리팹 `_cooldown`,
  3 = 붙을 때 스킬 블랙보드의 `_cooldownKey`) → 시전 길이 = 클립 × clamp(공격 시간 ÷ 클립, 0.1, `_maxAnimScale`, −1이면 상한 없음; `UpdatePlaybackSpeed`).
  모드 적 스킬 능력은 1이 53개·0이 39개·2가 6개·3이 10개라, 대부분(1)은 **클립 그대로** 시전한다(이전: 모두 0으로 보고 적의 공격 간격에 맞춰 늘이거나 줄였음
  (가정이었음) — 살비엔토 주교 퀸투스 【末日】 3.5 → 4.467 s, '래트킹' 沙暴 3.4 → 1.333 s, 루시안, '블러드 다이아몬드' aoe 3.0 → 1.8 s 등 약 30개가 바뀜).
  **클립이 없는 스킬**(2026-11-07, 공식 클라에서 확인 — 이전: 모두 시전 길이 0 [가정이었음])은 능력 클래스가 길이를 정한다(`content/enemies.js castLength`):
  - 애니메이션 능력(근접·원거리 공격, `AnimatedActionTo*`, `GloballUniqueBuffAbility`)은 `_timeMode`의 공격 시간 그대로다: `UpdatePlaybackSpeed`는 클립이
    없으면(`GetAnimationTime` 실패) `m_attackTime` = 그 시간·배율 1로 두고, `EasyToStartAbility.OnCastStart`가 `m_cachedDuration` = `GetDuration` =
    `m_attackTime`, 후딜이 그 나머지를 기다린다. 채널(`ThreePartChannelingAnimation`)은 루프를 늘여 같은 길이를 채운다. 실제 판에서 공격 차례로 시전되는 것:
    강화 석궁 기습자 `CrossAttack` 2.5초(`_cooldown`), '즈자이' 방벽 `ShieldBurst` 15초·부패한 기사 `ChargeAttack` 4초·자로, '늑대 군주' `FearCage` 5초(`duration_s`)·
    가상적: 흑운 `KillOthers` 4초·검은 뿔의 루울 돌진 `skill` 8초(블랙보드). 그동안 서 있고 일반 공격이 없다 — 강화 석궁 기습자의 키트가 따로 붙이던 2.5초 정지·缴械 버프는 뺐다.
  - `ActiveBuffAbility`(크라운슬레이어·루시안, '블러드 다이아몬드'·데겐블레허의 순간이동 `Blink`, 제트맨 이륙 `TakeOff`, 가상적: 총 돌진 `1` — 이 모드엔 `_waitForCasting`인 것이 없음)는
    스펠 앞뒤로 고정 업데이트 한 번씩(`<OnWaitForPreDelay>`·`<OnWaitForPostDelay>`가 `sharedWaitForFixedUpdate`), 2틱.
  - 순차 묶음(`AbilitySequenceGroup`)은 자식을 차례로(`_MoveToNextActiveAbility`), 합: 가상적: 흑운 `FireWeapon` = 탄약 되돌리기 `ResetAmmoCount` 2틱 + `Fire`(클립 `Skill_2`) 2초.
  - 투사체가 사라질 때까지 기다리는 원거리 능력(`_waitForProjectileInvalid`, `skillCast` `proj` — 순차 묶음의 자식이어도)은 그 투사체가 살아 있는 동안 시전이다(2026-11-07,
    `RangedAttack.<OnWaitForPostDelay>`가 `_CheckProjectileValid` 동안 기다림, `_waitForAnimEndWhenProjectileInvalid`면 그 뒤 클립 나머지·`_minPostDelayWhenProjectileInvalid`도).
    키트가 투사체(채널)의 끝을 알려 주는 것만(`projAlive`, `content/enemies.js projCastOver`): 축제 재즈 연주가 `fire`·살카즈 왕정군 정예 캐스터 `DeathEye`(둘 다 끝 클립 기다림 없음) —
    「upstream 0.3.4 개발분 대조 이식 — 전투」, W `C4`·함락의 제사장 `ChainBuff`·'사미의 의지' `Lasso` — 아래 「투사체를 기다리는 적 스킬 넷」.
    투사체가 끝난 뒤에도 **능력 시간이 남았으면 그만큼 더 시전한다**: `_waitForAnimEndWhenProjectileInvalid`가 꺼져 있으면 `m_cachedDuration` − 시전 시작부터 지난 시간이
    양수일 때 그만큼 기다린 뒤 끝난다(`_minPostDelayWhenProjectileInvalid`는 그 플래그가 켜졌을 때만 읽힘; 2026-11-14 공식 클라에서 확인). 우리 값은 `castLength`
    (W `C4`는 클립 4.8초가 투사체 3.2초보다 길어 4.8초). 클립 없는 채널도 공격 시간만큼은 시전한다(2026-11-14, 공식 클라에서 확인: `RangedAttack.OnCastStart` →
    `AbstractBasicAttack` → `AbstractAnimatedAbility` → `EasyToStartAbility.OnCastStart`가 `AbilityStandard.OnCastStart`의 재생 속도 갱신 — 클립이 없으면 `m_attackTime` =
    공격 시간 — 뒤에 `m_cachedDuration` = `GetDuration` = `m_attackTime`; 이전 우리 값 0 [가정이었음]): 넷 다 `_timeMode` 0이라 적의 공격 간격 — 살카즈 왕정군 정예 캐스터
    `DeathEye` 4초·'사미의 의지' `Lasso` 6초·'염의 가호' 2.5초·축제 재즈 연주가 `fire` 1초. 채널(투사체)이 그보다 일찍 끝날 때만 차이 난다: 정예 캐스터의 대상이 죽거나
    철수하면 시전 시작 4초까지 서 있다. 시험 `test/content/enemy-skill-proj-wait.test.js` 「its target gone early」.
  - **[ASSUMED·미조사]** 0으로 남긴 것: 병렬·선택 묶음(`AbilityParallelGroup`·`AbilitySelectableGroup` — 끝나는 조건을 안 읽음; 공격 차례로 시전하는 키트 없음:
    살카즈 부패의 전차 `PollutedRangedAtk`·'제국의 갑옷' `Appear`·래트킹 `Mark`·'즈자이' `CrossAttackMarkReborn`·알리스테어, 제국의 여광 `store`). 투사체 기다림은
    모두 키트가 끝을 안다(2026-11-14 — 데이터의 `proj` 일곱 가운데 '염의 가호'는 아군 소환물 키트, 살카즈 후예 기술자 `charge_gunctrl`은 이 모드에 충전할 부포가 없어 시전 안 함).
  - **끊긴 시전**: 기절·빙결·수면·공중 띄우기·강제 이동(失衡)·공포·필드 이탈이 시전을 끊으면(`ai.js cutEnemySwing` → 훅 `enemySkillCut`) 그 스킬의 쿨이 그때 다시 돈다 — 클라의
    `AttackState.OnExit` → `InterruptIfNot` → `FinishIfNot(1)`이고 `EnemySkill._OnCastFinish`는 이유와 상관없이 `m_cooldownTimer.Reset`·(`resetMain`이면) 주 공격
    `ResetCooldown`을 한다(이전: 끊겨도 쿨 + 시전 길이 그대로). '즈자이' `ShieldBurst`는 방벽 마지막 층이 깨지면(`InterruptEnemyAbility`) 시전이 끝나고, 시전이 끊기면
    방벽(`BuffDuringCasting`)도 폭발 없이 사라진다. 무장 해제(缴械)·전율(战栗)은 일반 휘두름만 끊고 스킬 시전은 이어진다 [ASSUMED·미조사: 클라의 缴械가 스킬 능력의 시전을 끊는지 —
    키트가 제 채널 동안 缴械를 붙여 「그동안 일반 공격 없음」으로 쓴다: 부패한 기사 `ChargeAttack`·검은 뿔의 루울 `skill`].
  - 효과가 나는 때는 키트대로 시전 시작이다(클립이 있는 스킬도 같음): 공식은 능력이 기다리는 프레임(채널 클립의 `OnAttack`, 없으면 공격 시간 끝)이다 — 자로, '늑대 군주'
    `FearCage`는 끝 클립 `A_Skill_End`의 `OnAttack`(시전 4.37초째) [ASSUMED·미조사: 적 스킬 효과의 프레임은 키트마다 따로 옮겨야 함].
  적에게는 시간 늦추기
  (`SLOW_DOWN` 속성)가 이 모드에 없어(버프 템플릿·스킬 프리팹 어디에도 없음) `animSlowDown` 갈래는 해당 없음.
  데이터: `tools/local-extract/attack_timing.py`가 적 프리팹 `EnemySkill`(`_familyMask` 있는 MonoBehaviour)과 같은 GameObject의 애니메이션 능력(`_animKey`·`_maxAnimScale`·`_timeMode`
  ·`_cooldown`·`_cooldownKey`)을 `tools/assets/local-attack-timing.json` `enemies[…].skills`에 쓰고, `tools/build-data.mjs` `enemySkillCast`가 `data/enemies.json`
  `skillCast`(스킬 이름 소문자 → `family`·`clip`·`dur`·`max`·`time`·`cd`·`cdKey`·`resetMain`·`waitFirst`, 클립 길이는 `data/assets.json`)로 싣는다(`content/enemies.js castLength`).
  능력 클래스는 직렬화 필드로 가린다(`attack_timing.py cast_fields`): `kind` `buff`(`_waitForCasting`·`_buffs`, `wfc`)·`seq`/`par`/`sel`(`_alwaysNext`·`_finishAllAbilitiesIfOneFinish`·
  `_abilityConfigs`, 자식은 `subs`에 `_abilities` 차례로), `proj`(`_waitForProjectileInvalid`), `miss`(키 표로 푼 클립이 매니페스트에 없음 — 2026-11-14부터 없음, `test/content/enemy-clip-keys.test.js`).
  템플릿 `overrides.skills`도 같은 이름으로 찾는다.
  자기 공격 루프로 일반 공격을 하는 키트(가상적: 관·현, '사미의 의지' — `ab.ownAttack`)는 그 루프의 공격 차례에 같은 훅을 낸다(2026-10-29, 아래 「upstream 0.3.2–0.3.4
  대조 이식 — 적·보스」).
- **일반 공격이 없는 적** (2026-11-03, 공식 클라에서 확인): `AttackWrapper.SearchTarget`은 표가 아니라 `Unit.hasAttack`(= 지금 모드의 `_attack` 능력이 있는지)을
  묻는다. 그래서 ATK 0·`applyWay` NONE이어도 프리팹 모드에 공격 능력이 있는 적('산크타의 긍지' 祈祷邀约, 길조의 비린 — `data/enemies.json` `attackAbility`)은
  휘두르지 않고 공격 차례에만 스킬을 쓴다(`battle/spawns.js`가 그 적의 `profile.noAttack`을 켜지 않고, `ai.js enemyAttack`은 훅만 낸다). 공격 능력이 없는 적
  (문드러진 응집 사도·동글이·변형의 베이스 α, 전투 능력만 있는 '갑주를 꿰뚫는 탄환')은 공격 차례로 스킬을 쓰지 않으므로 키트 자체 타이머와 함께 예전처럼 제 쿨로 쏜다
  [ASSUMED·미조사: 클라에서 그 스킬을 무엇이 켜는지(재능·트리거·막혔을 때의 전투 래퍼)는 안 읽음]. 이전: 일반 공격이 없는 적은 모두 제 쿨(가정이었음).
  형태(프리팹 모드)가 바뀌면 일반 공격 쿨은 비워진다(2026-11-07, 공식 클라에서 확인, 「일반 공격 타이밍」 「적의 모드 전환」; 이전에는 가정으로 이어지게 했다). 클립이 매니페스트에 없다고 시전 길이 0이던 스킬 셋(`enemy_9014_acstma` `2`·`enemy_10065_ftzlc` `onfire`·
  `enemy_10141_xdpeng_2` `switch`)은 키가 프리팹 애니메이터의 키 표로 클립 이름이 되는 것이었다(2026-11-14, 「일반 공격 타이밍」 「적 클립의 키 표」).
- **막힘이 가족을 고른다** (2026-10-22, 제보 「강화 석궁 기습자가 저지됐을 때도 아군을 기절시킨다」, EN 공식 클라에서 직접 확인):
  `Enemy.States.MoveState.OnTick`은 `Enemy.get_blocker`가 있으면 `_SearchAttackTarget`을 부르기 **전에** COMBAT 상태(3)로 바꾼다 → 막힌 적은
  `CombatWrapper._PickAbility`(COMBAT 가족)만, 안 막힌 적은 `AttackWrapper.SearchTarget`(ATTACK 가족)만 스킬을 고른다(`EnemySkill.CheckFamilyMask`, `_familyMask`
  비트 1 ATTACK·2 COMBAT). 우리: `content/enemies.js onSkillSlot`이 `skillCast.family`를 `e.blockedBy`로 거른다. 이미 시작한 시전은 막혀도 계속된다
  (`AttackState.OnTick`에 막힘 검사 없음). 가족 1·2인 스킬 16개 중 동작이 바뀐 것은 重弩突袭者 直击 하나(가족 1: 이전엔 막은 유닛에도 쏴
  기절시켰다). “帝国的甲胄” MultiCombat(가족 2)은 키트도 이제 막혔을 때만 쓰지만, 전투에서는 전부터 `content/local-patch.js` chargedTriple(막혔을 때만)이
  대신하므로 그대로; 나머지(“复仇者” 冲锋·弑君者/锏/卢西恩 闪烁·喷气人 升空·乌顶巨角卢鲁 角力对决)는
  키트 `cond`가 이미 같은 조건이었고, 出场 애니(bornanim·recoveranim)는 키트 스킬이 아니다. 기절 스킬을 가진 다른 적(迷路的巨像·纠缠藤蔓·粉碎攻坚手 등)은
  가족 3이라 막혀도 쓴다(그대로). 테스트 `test/content/enemy-skill-attack-slot.test.js` 「the block picks the skill family」·「real match path: a 重弩突袭者」,
  `enemies_bosses.test.js` “帝国的甲胄”.
- **퀸투스(盐风主教昆图斯) 셋째 형태**: 공격 차례 3.5 s마다 하나 — 【大潮】(쿨 3.5 + 시전 1.667 = 5.167 s)가 차례를 하나 건너 7 s마다, 그 사이 차례는 일반
  공격, 【崩坍】(시전 3 s)·【断裂生殖】(2 s)는 차례 하나를 차지한다. 이전에는 3.5 s마다 일반 공격(2명 × ATK 100 % 물리 + 20 % 신경) **과** 【大潮】(전원 ×
  20 % 법술 + 20 % 신경)가 함께 나가 셋째 형태 출력이 공식의 두 배 가까이였다(첫째·둘째 형태는 스킬 쿨 35~40 s라 차이가 작음). upstream PR #799(열림)는
  퀸투스 스킬만 공격 쿨을 소모시키는 부분 수정이다.
- **휘두름 대신 시전하는 스킬의 클립** (2026-11-14, 공식 클라에서 확인): 키트가 일반 공격의 휘두름으로 스킬 효과를 내는 적은 그 휘두름을 스킬 능력의 클립으로 잰다 —
  키트가 `profile.swingClip`(그 스킬의 `skillCast` 기록)을 넘기면 `ai.js attackClipOf`가 그 휘두름의 타격·길이를 그것으로(`attackTiming`, 공격 시간에 맞춰 늘고 줆).
  액젓 추천자(`enemy_10044_wintun`)의 통 내려찍기: `Skills/BlockedBoom`(ATTACK·COMBAT 가족, `_timeMode` 1)의 `Attack` 1.467초 중 0.7초(이전: M2 `Combat`의
  `B_Attack` 1.2초 중 0.467초), 그 뒤 휘두름은 `B_Attack`. 시험 `test/content/enemies_bosses.test.js` 「the barrel smash swings…」.
- **모드가 꺼진 스킬의 쿨** (2026-11-14, 공식 클라에서 확인): `Enemy.OnSwitchMode`는 떠나는 모드의 스킬(루트가 아닌 `EnemySkill`)을 `Detach`(꺼짐), 들어가는
  모드의 것을 `Attach`하고, `Enemy.OnTick`은 켜진 스킬의 쿨만 센다 — 모드가 꺼진 동안 그 스킬의 쿨은 멈추고, 돌아와도 다시 세지 않는다(`EnemySkill.Init`은 등장·
  재생·`ReInitEnemySkillCoolDown` 노드에서만). 시전 중에 모드가 바뀌면 능력이 끊기고(`_interruptAbilityOnDetach`) 시전 끝(`_OnCastFinish`)의 `Reset(true)`로
  쿨이 한 주기 전체가 된다. 키트는 그 스킬에 `pause(b, e)`를 둔다(`content/enemies.js onTick`). 수둔 닌자(`enemy_10116_ymgtop`)의 `SwitchModeTrigger`(Default
  모드, 쿨 60·처음 10): 회전(M1, `rotate_duration` 60초)이 끝나거나 失衡으로 끊긴 뒤 60초 더 기다려 다시 돈다(이전: 쿨이 회전 중에도 흘러 회전이 끝나자마자 다시 돎).
  시험 같은 파일 「the next spin comes a full cooldown after…」.
- **옛 동작**: 스킬은 쿨이 차면 바로, 일반 공격과 따로(즉시) 나갔다. 테스트 `test/content/enemy-skill-attack-slot.test.js`, 고친 것:
  `hidden-gun-pursuit.test.js`(【末日布道】 = 준비 뒤 다음 공격 차례), `boss-patterns-real.test.js`(铳 휘두름 간격은 스킬이 끼지 않은 쌍),
  `feedback5-cb4-pins.test.js` item 52(공격 + 스킬 시전 = 공격 차례 수), `enemies_bosses.test.js`의 발동 시각.

## 적 투사체·공식 바인딩용 이벤트 필드 (관리자 결정 (2026-10-10) 「동작 변경 모두 공식이랑 동일하게」)
근거: EN 클라(2026-08) 적 프리팹 `battle/enm_pfb_*.ab`·투사체 `battle/prefabs/[uc]projectiles.ab`의 값과 공식 클라(EN 판, 레포에는 클래스·메서드 이름만). 켜진 Lua 핫픽스(`DefinedFix.lua` en_US·zh_CN)에 아래 클래스 없음. 렌더·소리(공식 이펙트·뱅크 바인딩)가 쓰는 계약이다.
- **적 투사체 데이터**: `tools/local-extract/enemy_projectiles.py` → `tools/assets/local-enemy-projectiles.json`(커밋) → `tools/build-data.mjs enemyProjectiles` →
  `data/enemies.json` `proj`·`projModes`·`skills[i].proj`/`projAlt`·`talentProj`(형식은 `docs/DATA.md` §enemies). 공격 능력(`Modes/<m>/Body/Attack`, 없으면
  `Combat`; 자식 능력이면 가장 얕은 것 — 假想敌：管 `Body/Attack/AttackEnemy`)의 `_projectileKey`·`_mountPointType`(Entity.MountPointType), 스킬은
  `Skills/<이름>`(gamedata prefabKey와 대소문자만 다름), 특성은 `Talents/<이름>`의 버프 블랙보드가 부르는 키. 투사체의 이동 behaviour는 직렬화 필드로 가림:
  AdvancedMovement(`_moveType`), ParacurveMovement(`_raiseHeight` → PARACURVE), HarpoonMovement(`_extendLenth` → HARPOON), AttachToTarget(`_immediatelyReach` →
  ATTACH). 적이 쓰는 83개 중 PARACURVE 14, HARPOON 6, ATTACH 12, 이동 behaviour 없음 2(`Talents/Boom`의 `projectile_bslime`·`projectile_snslime`), 나머지
  AdvancedMovement.
- **비행 시간**: TRACE_TARGET_WITH_SPEED는 대상을 쫓아 `_speed`(타일/초). PARACURVE는 공식 클라 `ParacurveMovement.Init`(`m_speed = _speed`)·
  `OnInit`(시간 = 수평 거리 ÷ `m_speed`, 높이는 중력 계산에만)·`_CalculateNextPosition`(매 틱 대상 현재 위치로 목표 갱신) → 우리 2D 추적
  투사체와 같은 시간. HARPOON은 대상까지 `_speed`로 뻗음(`_acceleration` 0). 그래서 sim은 셋 다 `speed`로 날린다(`server/sim/ai.js enemyShot`·`shotSpeed`).
  공격 능력에 투사체가 없으면(`proj: null`: 妖怪MKII, 萨卡兹百夫长, “邪魔的利刃”, 盐风主教昆图斯 …; 프리팹은 대상에 `hitEffects`만) 피해는 타격 순간 — 远程途径
  아님(`isProjectile` false), 'atk' kind `none`. 데이터에 없는 적(테스트 유닛 등)은 예전 `PROJECTILE_SPEEDS.enemy` 10.
  이전: 원거리 적 모두 10 — 바뀐 적(PARACURVE): 萨卡兹枯朽战车 ×2·高准度伦蒂尼姆城防自行炮·“帝国的甲胄”·集团军重型火炮 4, 烹泉·沏虹·灼热源石虫·炽焰源石虫·碎骨·W·
  “墓碑” 5, “庞贝” 6, 自制投石机 8; (TRACE) 法术大师A1·A2·陷落雪祀 15, “灵幛” 18; (HARPOON) “独轮车玩具” 30; 투사체 없는 원거리 적 40종은 즉시.
  모드별: 守墓石像 Fly 모드(`setForm` 'fly' ↔ `_modes` `Fly`).
- **콘텐츠 스킬 투사체**: 重弩突袭者 直击 12 → 5(`projectile_enemy_msnip`, FIXED_DIRECTION — 아래 「FIXED_DIRECTION 투사체」),
  迷路的巨像 StunAttack 8 → 10, 假想敌：蚀裂 사망 독구름 8 → 5(PARACURVE), 萨卡兹枯朽战车 秽蚀轰击 구역은 공격 순간 → 포탄 착지(공격 때 대상 위치,
  `projectile_enemy_nhtank_polluted` 4 타일/초; 착지 뒤 머무는 시간 `_delayTime` 20은 블랙보드 `projectile_delay_time`이 덮음 — 공식 클라 `ParacurveMovement.OnInit`이
  그 키를 읽음). 帝国炮火先兆者의 3초는 `projectile_enemy_emppnt` = AttachToTarget `_delayToStart` 3으로 확인(콘텐츠 그대로).
- **FIXED_DIRECTION 투사체** (관리자 결정 2026-10-10, EN 공식 클라): 적이 쓰는 것은 둘 — 重弩突袭者 直击 `projectile_enemy_msnip`, 萨米的意志 冰凌
  `projectile_enemy_smdeer`(아래). 둘 다 `FarthestPointMovement`(AdvancedMovement 하위). `AdvancedMovement.OnInit`의 moveType 분기에서
  FIXED_DIRECTION은 도착점을 두지 않아(`m_hasTarget` 0) `DoCheckReachedInternal`로 「도착」하지 않는다 — 대상 추적 없음. 방향은
  `FarthestPointMovement._SetTargetPosAndDirection`: `_useDirToTarget`이면 `MapUtil.NormalizeDirectionToFourWays(대상 − 출발)` = 가까운 네 방향
  축, `_useConstDirection`이면 고정 방향. 투사체는 `Projectile.OnTick`에서 수명(`_lifeTime`)이 다할 때만 멈추고(도착 처리
  `DealProjectileReached`는 멈추지 않음), 맞을 수(`_hitNumType` LIMITED·`_maxHitNum`)를 채우면 `_stopAfterMaxHit`로 멈춘다.
  - 重弩突袭者 直击(`enemies/invisible.js kitCrossbow` → `enemies/helpers.js lineShot`, 이전: 겨눈 대상에 유도): 1.4 s 충전 뒤 시전 때 겨눈 칸
    쪽 축으로 5 타일/초 직진, `SelectorHitBehaviour`(`_hitPasserby` 1, `_interval` 0.03 — 우리는 매 틱) 원 반경 0.3(Selector0/1의 CircleCollider2D)에
    충돌체(ALLY_COLLIDER_RADIUS 0.25)가 닿는 첫 아군 1명(`_maxHitNum` 1, `_stopAfterMaxHit` 1)에 법술 피해·기절 후 멈춤. 겨눈 대상이 사라지면 그 뒤의
    아군에, 축 위에 아무도 없으면 10 s(50타일) 날다 사라짐. 충돌 선택은 `areaSelectable`(투사체 충돌은 迷彩 무시 — Selector1 `_forceIgnoreCamouflage`).
    출발점 (2026-10-23, 클라 Spine·프리팹 확인): 투사체의 `_mountPointType` MUZZLE = Spine 뼈 `Muzzle`을 쏘는 순간에 — 직격은
    ThreePartChannelingAnimation이 방향(`Entity.get_direction`: 겨눈 칸 쪽 FOUR_WAYS 내적 최댓값, 같으면 UP·RIGHT·DOWN·LEFT 순)으로 `Skill_End`·
    `Skill_End_Down`·`_Up`을 고르고, 그 OnAttack(0.067 s)에서 뼈는 (212.74, 165.83)·(151.49, 19.99)·(153.57, 319.45)(스켈레톤 단위). × 0.01 ×
    Graphic 0.27을 Graphic의 X −30° 기울기로 판에 내리고 Graphic 자리 (0, −0.2, −0.06)를 더하면 옆 쏘기 앞 +0.574·위 +0.188칸, 아래 쏘기 앞 +0.409·
    아래 0.153칸, 위 쏘기 앞 +0.415·위 0.547칸(`CROSS_MUZZLE`; 이전: 몸 중심). 축도 그 점에서 겨눈 칸으로 잰다(`lineShot` `at`). 그래서 같은 줄 아군에게
    0.11 s 일찍 닿고, 위아래로 쏠 때 선이 0.41칸 옆으로 지난다. 위 「같은 줄」이 위로 0.5·아래로 0.1인 것과 같은 쪽(총구가 줄 위). [추정] 바로 위·아래를
    겨누면 모델이 오른쪽을 봄, 충전 중 겨눈 대상이 죽어도 쏨(스킬 `_allowNoTarget` 1), 끝 클립으로 섞이는 동안의 뼈는 안 봄, 투사체 축 고르기의
    동률(대각선 정확히 45°)은 가로. 사거리는 없다(2026-11-14, 공식 클라에서 확인 — 이전: 가정값 6칸): 아래 「스킬 대상 고르기」. golden: roster 017·022·033, matches coop2-HARD-4·coop8-HARD-3·
    coop2-NORMAL-14-standins, 이펙트 이벤트 roster-017·033. 확인 `test/content/enemies_bosses.test.js` 「重弩突袭者」 셋.
  - 스킬 대상 고르기 (2026-10-21, 공식 클라 `AdvancedSelectorWithTrapSheltr.OnPostFilter`, 프리팹 `Skills/CrossAttack/Selector` — 루트 자리):
    `_checkOnTheSameLine`이면 「자기 위치 − 후보 위치」의 x가 −0.5…0.5(`_offsetMinX/MaxX`)이거나 y가 −0.5…0.1(`_offsetMinY/MaxY`)인 후보만 남는다
    (`MathUtil.Between` = min − ε < v < max + ε). 그래서 같은 줄은 위로 0.5·아래로 0.1까지(이전: 위아래 ±0.5 미만). 범위는 같은 Selector의
    `CrossTileRange` — 자기 칸의 행·열 전체, 거리 제한 없음(2026-11-14, 공식 클라에서 확인 — `CheckTargetIn`이 같은 행이나 같은 열이면 참, 클래스에
    거리 필드 없음; 이전: 가정값 6칸). 규정 속사 경량·파워 석궁병, 마테오의 근위병과 같은 `enemies/helpers.js crossTargets`. `enemies/invisible.js kitCrossbow`.
    확인 `test/sim/enemy-buff-tags.test.js`, `test/content/enemies_bosses.test.js` 「重弩突袭者」 먼 줄.
- **萨米的意志 冰凌** (`content/bosses.js kitDeer`, 이전: 공격 순간 열 전체 즉시): 공격 능력은 `ProjectileToTileAbility`, 휘두름의 OnAttack 프레임
  (`_waitForAttackEvent`, `attackAnim.hit` 1 s — 'swing' 이벤트 냄, 쿨다운은 휘두름 시작부터, 타격 때 대상 다시 고름 `_selectTargetTiming` 1, 아무도
  없으면 쿨다운 돌려받음)에 열마다(최대 1, 체력 절반 아래 2) 냄. 타일 선택기 `SmdeerTileSelector._TryGetTile`은 대상 열의 **맨 위 칸**
  (GridPosition(row = Map.height − 1, col) — 공식 맵 19행이라 행 18). `projectile_enemy_smdeer`는 AttachToTarget(`_immediatelyReach`)로 그 칸에 놓이고
  FarthestPointMovement(고정 방향 DOWN, 5 타일/초)로 내려가며, `SmdeerAttackHitBehaviour`(Init, `_CheckDistanceToEmitProjectile`)가 맨
  위 칸에서 k·`dist`(블랙보드에 없음 → 1) 이상 내려오면 k번째 칸에 하위 투사체 `projectile_enemy_smdeer_2`를 놓고, 다음 칸이 맵 밖이면 멈춘다.
  하위 투사체: AttachToTarget 즉시, `_lifeTime` 1, `HitBehaviour` `_onlyCheckHitWhenStop` 1·원 0.25·`_maxHitNum` 1 → 놓인 뒤 1 s에 그 칸(중심에서
  0.25 + 아군 충돌체 0.25)의 아군 1명에 ATK × `atk_scale_2`(블랙보드에 없음 → 1) 물리. 그래서 행 r의 아군은 타격 뒤 (18 − r)/5 + 1 s에 맞고(보스
  전장 행 2–5: 3.6–4.2 s), 그때 그 칸에 선 아군이 맞는다. 본 투사체 자체는 아무도 안 맞힘(`_hitNumType` INFINITY, hit behaviour 없음). fx 'column'에
  `key`·`sub`·`r0`·`dir`·`speed`·`dist`·`life`를 실음(docs/SIM.md). [추정] 런타임 Map.height = 레벨 맵 19행(보스전도 같은 맵), 칸마다 시각을 k·dist/speed로
  계산(클라는 틱마다 한 칸까지라 5 타일/초에선 같음).
- **`stay`**(`_delayAfterReached`, 닿은 뒤 남는 시간 — `AdvancedMovement.DoCheckReached` → `Projectile.EnsureLifeTime`: 남은 수명을
  그 시간으로): 남아 있는 동안 같은 대상을 다시 맞히는 것은 `_keepAlreadyHitTime` > 0인 것뿐(`Projectile.CheckTargetAlreadyHit`: 기록값 < 0 =
  다시 안 맞음, 아니면 그 시각까지). 우리 적 중 해당: 萨卡兹枯朽战车 秽蚀轰击 `projectile_enemy_nhtank_polluted`(1 s)·假想敌：蚀裂 독구름
  `projectile_enemy_actoxi`(1 s) — 둘 다 이미 콘텐츠 구역(`enemies/dot.js` pollution·dmgZone, 1 s 간격)으로 구현. `projectile_enemy_actrpb`(0.7 s)는 stay
  0.01이라 한 번. 나머지(acstmk·acstmr·lrnazg·wintun_range)는 −1 → 반복 없음. 고칠 것 없음.
- **`moveScale`**(투사체 속도 배율): `Projectile.RegisterMoveScale`을 부르는 것은 `ProjectileMoveScaleBehaviour`(ProjectileAuraAbility)와
  이벤트 전용 `Act43sideMoveScaleBehaviour`뿐. 클라 묶음(charpack·enm_pfb·skills·traps·tokens) 중 그 오라는 로고스(`char_4133_logos`) S3(`skchr_logos_3`)뿐이다.
  - 엔진 `ProjectileSystem`의 투사체 필드 `moveScale`(기본 1): 공식 `Projectile.OnTick`은 수명 시계와 움직임 단계 모두 `movement.GetTimeScale()`(= 이동 배율) × dt로 흘린다(2026-11-04, 공식 클라에서 확인).
    그래서 늦춰진 탄은 비행뿐 아니라 수명도 같은 배율로 흐른다. 예전 키트는 `speed`와 `maxAge`를 고쳐 수명이 그대로 흘렀고, 약 9초 넘게 잡혔다 풀린 탄은 남은 거리와 상관없이 1초 뒤 착탄·소멸했다. 시험 `op_logos.test.js` 「a held shot lives」.
  - 두 로고스가 같은 탄을 잡으면 배율을 곱한다(2026-11-07, 공식 클라에서 확인: `BasicMovement._CalculateFinalMoveScale`이 등록된 배율을 모두 곱함). 전에는 하나만 걸렸다.
  - 늦출 수 있는 탄(2026-11-07, 공식 클라에서 확인): `Projectile._InitOuterAdjustableSettings`는 이동이 허락해야 하고(`get_movementAdjustable`: 추적·직진 `AdvancedMovement`와 포물선 `ParacurveMovement`는 참, 작살 `HarpoonMovement`와 부착 `AttachToTarget`은 거짓, 이동이 없으면 거짓), 그다음 `_movementAdjustableStatus`가 AUTOMATIC이면 본체 이펙트(`_mainEffect`)가 있어야 한다. `_eliminatableStatus` AUTOMATIC은 그 값을 따른다. 적 투사체 83개 중 25개가 늦출 수도 지울 수도 없다(`tools/local-extract/enemy_projectiles.py` `adjust`·`elim`): 부착 11개, 작살 6개, 이동 없는 2개, 본체 이펙트 없는 6개(`projectile_enemy_stmgun`·`projectile_enemy_nhtank_polluted`·`projectile_enemy_vtsk`·`projectile_enemy_acstmk`·`projectile_enemy_wintun_range`·`projectile_enemy_smdeer`). 공격·스킬 탄은 이 값을 `addProjectile` `fixed`·`noWipe`로 넘긴다. 시험 `op_logos.test.js`.
- **콘텐츠 스킬 투사체 2차** (`enemies/helpers.js shoot(b, from, t, shot, onHit)`: 위와 같은 비행 시간으로 `addProjectile`, 날지 않는 shot은 즉시; fx
  `enemyShot` { id, from?, tgt, key, move, speed, t }를 냄 — `kinds.js` 'none'): 데이터 `skills[i].proj`대로, 효과는 투사체가 닿을 때(이전: 시전 순간).
  - 假想敌：黑云 FireWeapon(`projectile_enemy_acfort_skill` 10): 연타마다 한 발, 닿을 때 피해. [추정] 연타 사이 간격은 안 읽음 — 모두 시전 때 출발.
  - 凋零骑士 TripleAttack(`projectile_enemy_dekght_s` 10): 화살이 닿은 대상의 칸에 표시, `interval` 뒤 십자 폭발. [추정] 지연은 착지부터 셈(`dekght_2[aoe]` 버프가
    맞은 대상에 붙는다고 봄).
  - 陷落雪祀 ChainBuff(`projectile_enemy_smsha_s` 15): 적마다 닿을 때 버프, 다음 도약은 거기서 그때 고름. [추정] 도약도 같은 투사체·속도.
  - 杰斯顿·威廉姆斯 IronSandStorm(`projectile_enemy_jakill_s1` 10): 대상마다 한 발, 닿을 때 기절(본 공격 피해는 엔진의 일반 공격 투사체 10).
  - “碎铳之簧” `1`: 元素护盾 탄(`projectile_enemy_actrpb` 15, 튕김은 `_speedAfterFirstReach` 6)은 닿을 때 피해·침식, 튕김은 맞은 대상에서 출발;
    频次护盾 十连击(`projectile_enemy_actrpc` 10)은 0.1 s 간격 열 발(아래 「“碎铳之簧”…」).
  - 假想敌：管 `1`(`projectile_enemy_acduml` 10): 0.25 s 간격 세 발이 余音에 닿을 때 폭발·余音 피격. 假想敌：弦 `1`(`projectile_enemy_acdumm` 10): 金 余音에
    닿을 때 폭발·暗 전환. 둘의 일반 공격도 공식 `proj`(같은 키, 10)로 날아 닿을 때 폭발(아래 「假想敌：管·弦 일반 공격…」).
- **'dmg' 이벤트 6번째 = 공격자 unit id** (`server/sim/damage.js attackerId`): 일반 공격, 키트가 `battle.dealDamage`로 넣는 스킬 피해('atk' 없음 — 키트
  약 60개), DoT(건 유닛), 소환물(자기 id). 무출처(원소 폭발, `periodicDamage`)·출처 없는 피해는 null — 다만 `showSource` 표시가 있는
  무출처(틴맨 연금 장판 틱)는 처치가 가는 유닛 id(`sim.md` 「틴맨 연금 장판의 피해는 무출처이고 회피할 수 있다」). 원소 게이지
  채움도 같은 자리(5번째는 0). 기존 원소 위치·뜻은 그대로.
- **'dmg' 이벤트 7번째 = 지속 피해 틱 1 / 아니면 0** (2026-10-11, `server/sim/damage.js dotFlag`, 사용자 제보 「아스카론 S2 지속 피해 소리가 공격 소리」):
  태그 `'dot'`(持续伤害 = 공식 attackType BUFF, 버프 그래프의 피해 노드)인 피해. 소리가 그 틱을 착탄으로 치지 않게 한다(`docs/rules/audio.md` 「지속 피해 틱」).
  이벤트 개수·전투 결과는 그대로(golden 무변화).
- **'dmg' 이벤트 8번째 = 공격의 타격 번호 / 아니면 null** (2026-10-16, `damage.js makeDamageInfo` `strike`): 여러 번 치는 공격(프로필 `hits`·`hitsFn`,
  `ai.js resolveHit`)의 0, 1 …번째 타격과 轰击术师 여진(`professions.js` `bombarder`, 1부터). 클라는 시전의 n번째 타격(`spellCnt`)마다 그 타격의
  명중(`MultiHitUberEffectEmitter`)·투사체(`MultiRangedAttack.GetProjectileKey`)를 고르므로 렌더가 이 번호로 맞춘다(`docs/rules/fx.md` 「타격별 명중」).
  재능의 추가 피해(伺夜 S3의 법술 피해 등)는 null. 'heal' 넷째 = 치료한 유닛 id(같은 날, `docs/rules/fx.md` 「치료 명중」). 둘 다 필드만 늘어 golden 그대로.
- **적 스킬 이벤트에 공식 능력 이름**: 콘텐츠의 쿨다운 스킬이 시전되면(`content/enemies.js onTick`) fx `enemySkill` `{ id, ability, n }`을 먼저 내고, 그 시전
  호출 안에서 나는 fx에는 `ability`·`caster`가 붙는다(`battle/events.js fx`; 나중 예약(`battle.after`)된 fx에는 없음). `ability` = gamedata 스킬
  `prefabKey`(`enemies/helpers.js abOf`의 `sk[*].name`; 보스 키트의 수동 능력 객체도 `name`). 렌더(`kinds.js` `enemySkill` 'none' — 그리지 않음)·소리가
  `enemy-bindings`의 `Skills/<이름>`·`ON_ABILITY_*.<신호>`를 대소문자 무시로 찾는다. 이름 없는 콘텐츠 능력(특성 반응, 일반 공격 변형)은 표시 없음.
- 테스트 `test/sim/official-event-fields.test.js`(`shoot` 포함), `enemies_bosses.test.js`의 黑云·凋零骑士·陷落雪祀·杰斯顿·碎铳之簧·管·弦 시각을 비행 시간만큼 늦춤. 투사체 속도로 적 원거리 피해 시각이 바뀌어 golden이 움직인다(roster 44·bonds 6·fields 20·matches 6·
  standins 5·diy 2 사례), `enemies_bosses.test.js`의 重弩突袭者·集团军重型火炮 시각을 공식 속도로 고침.

## 오퍼레이터 투사체 (관리자 결정 2026-10-16 「클라 값대로」 — 일반 공격 전부·치료·드론·스킬 모드)
근거: EN 클라 2026-10-14 판 charpack `Modes/<모드>/Body/Attack`(치료 `Body/Heal`, 요새 `Body/Attack/RangedAttack`, 荒芜拉普兰德 `Body/M0FunnelsNormalAttack`)의
`_projectileKey`, 투사체 `battle/prefabs/[uc]projectiles.ab`의 이동 behaviour(위 「적 투사체」와 같은 판독). 이전에는 종류별 공통값(`PROJECTILE_SPEEDS`: arrow 14·
bolt 11·bomb·lob 8·orb 10·drone 16)이었고 치료는 즉시였다.
- **데이터**: `tools/local-extract/op_projectiles.py` → `tools/assets/local-op-projectiles.json`(커밋) → `tools/build-data.mjs opShot` → `data/chess.json`·
  `backups.json` `shot` { base, skills }(`attackAnim`과 같은 모드 색인, 형식은 `docs/DATA.md` §2). 공격 능력에 투사체가 없으면 키 없는 `{ move: 'NONE', speed: 0 }`,
  모드의 저지 공격(`Body/Combat`, 요새 `BlockedMeleeAttack`)에 투사체가 없으면 `combat: 1`. 144명 읽음(EN 클라에 없는 予愿安洁莉娜·克莱门莎 빼고).
- **시뮬** (`server/sim/ai.js opShot`): 지금 공격하는 모드의 shot — 스킬이 켜져 있고 그 스킬에 모드가 있으면 그것, 아니면 Default(`attackClipOf`와 같은 선택).
  `speed` > 0이면 그 속도로 추적(PARACURVE는 수평 거리 ÷ 속도 — 위 「비행 시간」), 0이면 타격 순간(AttachToTarget은 `_delayToStart` 뒤). 저지 중인 적은
  `combat`이면 타격 순간. 데이터에 없는 유닛(토큰·장치·테스트 데이터)과 이동 behaviour를 못 읽은 투사체(`move` OTHER — 丰川祥子 음표 `projectile_chr_oblvns_*`,
  安洁莉娜 S2 `projectile_aglina_s2`: 루트에 이동 기본 클래스 필드 `_rotateToTarget`만 있음)는 예전 종류별 값. 'atk' kind(arrow·bolt …)는 그대로 — 렌더·소리 경로는 안 바뀐다.
- **모드 없는 스킬**: 자기 모드가 없고 표 지속 시간도 없는 스킬(다음 공격·탄약 — 能天使 S1 `projectile_angel` 30, 号角 S1, 锡人 S1·S2 PARACURVE 3 …)은
  스킬 프리팹(`[uc]skills.ab` `<prefabId>/…`)이 쏘는 가장 얕은 `_projectileKey`(End… 능력 빼고)를 그 공격에 쓴다 — 렌더의 스킬 꼬리(rules/fx.md 「모드 없는 스킬의
  투사체 꼬리」)와 같은 규칙. 지속 스킬의 스킬 투사체는 따로 도는 능력이라 안 쓴다. 공격 능력을 못 읽은 스킬 모드(灵知 S2)는 OTHER(예전 값).
- **스킬 모드 이름**: `shared/skill-modes.js skillModeIndex`가 대소문자를 무시한다 — 凯尔希·思衡托의 프리팹 모드가 `default`·`s1`·`s2`·`s3`라 지금까지 스킬이 모드에
  안 이어졌다. 이제 S2 의료 유닛이 `projectile_chr_kalts2_s2_dmg`(PARACURVE 12, 예전 orb 10 [ASSUMED])로 날고, S2·S3 공격 클립도 공식 모드의 것(`Skill_2_Attack`·
  `Skill_3_Attack`, `attackAnim`)이 된다(스킬 모드 이펙트·효과음 바인딩도 같은 함수). 다른 오퍼레이터는 해당 없음(소문자 모드는 그녀와 예비 오퍼레이터 Pith `char_612_accast`뿐,
  후자는 클립이 같아 동작 그대로).
- **치료**: 치료 모드의 shot이 날면(赫默 PARACURVE 5, 哈洛德·纯烬艾雅法拉 PARACURVE 7, 流明 PARACURVE 8, 莎草·录武官 TRACE 10) 닿을 때 회복, 그사이 대상이
  쓰러지면 회복 없음. 투사체 없는 치료(白面鸮·华法琳·调香师·瑰盐)는 예전처럼 즉시. 연쇄 치료의 튕김은 즉시 — 공식 클라에서 확인(2026-11-03): 파피루스(오퍼레이터) `projectile_chr_papyrs`의
  `ChainLightningHitBehaviour`(`_onlyCheckHitWhenReachTarget` 1·`_interval` 0, `ChainedSelector` `x-4`·최대 3)가 도착 때 한 번에 사슬 대상 전부를 치고 튕김마다
  `_atkScale` 0.75를 곱한다(= 감쇠 0.25), 그림은 선 이펙트뿐. 닿을 때의 처리는 공격 순간의 상태를
  따른다: 스킬의 `onHit`은 공격 때 스킬이 켜져 있었으면 부르고(`ai.js doHeal` `skillOn` — 流明 S1 沐雨의 비가 다음 치료 스킬이 끝난 뒤 닿아도 생김), 치료에
  `opts.isSkill`(스킬 프로필의 치료)을 실어 莎草 博览古卷 보호막의 스킬 배율이 붙는다. 流明 S3는 닿을 때 대상이 아직 이상 상태면 해제(공격의 플래그는 그때 이미 지워짐).
- **바뀐 값** (기본 모드, 3칸 기준): 투사체 없음 → 즉시 — 能天使(Default)·夕·莫斯提马·寒檀·莱恩哈特·雷蛇·送葬人·松果, 银灰 `projectile_svrash` NONE, 迷迭香
  `projectile_chr_rosmon_A` ATTACH; 대부분의 저격·근거리 원거리 14 → 10(隐现·空弦·雪猎·拉普兰德·断崖·仇白·崖心·歌蕾蒂娅·伺夜 …), 캐스터 11 → 10; 빠름: 深靛·格雷伊
  20, 新约能天使 30, 惊蛰·异客 15, 寒芒克洛丝 18, 蕾缪安 12; 느림: 初雪·巫恋 6, 灵知 9, PARACURVE 流星 6·缪尔赛思 7·锡人·号角·灰毫 5. 메카 캐스터는 본체 투사체
  (洛洛·至简·耶拉·荒芜拉普兰德 10). 전체 대조 표·측정 도구는 관리자 메모(오퍼레이터 투사체 속도 대조).
- **렌더** (`render/fx/speeds.js opProjSpeed`, `fx/projectiles.js shotSpeedOf`): 같은 shot으로 절차 투사체·공식 꼬리(`fxgame.js trailShot`)의 비행 시간을 맞추고,
  날지 않는 shot은 그리지 않는다. 모드는 렌더의 `_fxSkillOn`·`skillIndex`, 저지 대상은 그 휘두름의 `combat` 칸(주 대상을 자기가 저지 중, 시뮬 'swing' 일곱째)에 그 대상이 저지된 채 1.2칸 안일 때(2026-11-05): 시뮬은 대상별로 `blockedBy`를 보는데 렌더는 누가 막는지 몰라, 저지 중인 휘두름의 다른 대상을 옆 유닛이 1.2칸 안에서 막는 경우만 다르게 그린다. `FxSystem`에 `lookupDef`를
  넘김(`render/app.js`) — 2026-10-10부터 있던 절차 적 오브의 공식 속도(`enemyProjSpeed`)도 그동안 기록을 못 읽어 10으로 그려졌다. 화면 확인(2026-10-16, Windows
  Chrome 디버그 아레나, 샌드백 3칸): 隐现 절차 0.297 s·공식 꼬리 ≈ 0.29 s, 能天使 투사체 없음, 流星 0.50 s, 深靛 0.15 s, 오류 0. 실제 판 [화면 미확인].
- 로즈몬티스 S2·산탈라 S2의 AttachToTarget(`_immediatelyReach` 0)은 2026-10-31부터 공식 시점에 닿는다 — 아래 「오퍼레이터 시점·차례 묶음 B」 투사체. 시뮬 틱(1/30 s) 때문에 비행은 한 틱 일찍 닿을 수 있다
  (적 투사체와 같음).
- 키트가 직접 쏘는 투사체(스킬 'strike' 등)는 키트 값 그대로. 티피(스카이레인저)는 2026-11-03부터 원거리 — 「오퍼레이터 공격 형태」.
- 테스트 `test/sim/op-shot.test.js`(데이터·비행 시간·저지·렌더 짝·실제 판 경로의 치료 지연). 원거리 오퍼레이터 피해 시각이 바뀌어 golden이 움직인다.

## 작전 시작 차례 배치 (2026-10-10, 관리자 결정 「공식처럼 한 개씩, 部署 대사는 한 번」)
- 근거(공식 클라, 오디오 담당이 찾음 — `audio.md` 「전투 시작」): `MainGameInBattle._StartBattle`이 먼저 `_Prebuilt`를 끝까지 돌린다 — 말 하나마다
  `Deck.SpawnCharacterOrToken` 뒤 `WaitForFixedSeconds(0.2)`. 그 **뒤에** ON_BATTLE_STARTED(1211)를 쏘고 웨이브 스케줄러
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
  공식 클라 `Scheduler.SpawnSummonedEnemyWithBranchRoute`(`TryGetEnemyRouteFromBranch` → `Map.GetRouteOrNull`) → 웨이브 레벨의
  `branches.dragon` 출현 = `extraRoutes[routeIndex]`의 시작점. 버프 템플릿: 비공개 조사 기록(2026-10-10 buff templates).
- 값(`data/waves.json`): 일반·1인 联防(`escaped_single`) (행 11, 열 7) — 4줄 필드의 위에서 둘째 줄 가운데쯤; 2인 联防(`escaped_multi`) (11, 16)
  ±0.5(`spawnRandom`); 보스·숨은 핵심 (4, 10)(솔로 `h07_01_s` (4, 9), `h08_01_s` (4, 8); `h07_03`·`h08_03`은 routeIndex 1, 같은 (4, 10)). 관리자가
  기억한 아래 적 출입구 (9, 10)와는 다르다 — 등장 직후 위협도 높은 적을 쫓아가므로 아래 출입구로 들어오는 적 곁에 곧 가 있는 모습일 수 있다.
- 지금(`content/tokens.js yanyouSpawnPoint`): 전투의 웨이브 템플릿(`opts.waveId` — 매치가 넘김; 하네스는 `waveTemplate`)에서 위 점을 읽어 모든 炎佑를 거기에
  (두 번째는 옆에 떠 있음 `hoverDy`), 보스 짝의 반전된 오른쪽은 열을 뒤집음, `spawnRandom`은 전투 난수로 x·y 따로 ±범위 균등 — 공식 클라에서 확인(2026-11-03):
  모든 적의 `Enemy.Init`이 `Route.GetSpawnOffset` = `IBattleRandom.RandomVector2(spawnRandomRange)`(x·y 따로 `[−r, r]` 균등) + `spawnOffset`.
  템플릿이 없으면 예전 규칙(`airTile`: 반쪽 중앙의 배치 불가 칸, 대개 (10, 6)).
- 그 점에 오퍼레이터·소환물이 서 있어도 나온다(2026-10-12 관리자 제보 「모델이 아예 안 보여」): (11, 7)은 배치 칸이라 자주 차 있는데,
  `spawnToken`이 키트가 비행(`FLY`)으로 바꾸기 전에 빈 칸만 받아, 그 칸에 누가 서 있으면 炎佑가 통째로 빠졌다. 이제
  `force`로 넘기고 `Battle._deploy`의 비행 유닛 규칙(칸을 차지하지 않음)에 맡긴다 — 그 칸의 유닛은 그대로.
- 테스트 `test/content/yanyou-spawn.test.js`.

## 관리자 결정 2026-10-11 — 즉발 스킬의 시전 · 보스 포털 · 자작 원소 · 저항 · 麻痹震颤
근거: 공식 클라(EN 2026-08)와 스킬 프리팹(`battle/prefabs/[uc]skills.ab`).

### 즉발 스킬의 시전 (결정 1, GitHub #298)
- **규칙**: 자기 공격(`spec.attack`)이 없는 즉발·충전 스킬은 클라 스킬 클래스대로 시전한다 — 데이터 `skills[i].cast`
  (`tools/local-extract/skill_cast.py` → `tools/assets/local-skill-cast.json` → `tools/build-data.mjs skillCast`, 클립 길이는 `data/assets.json`).
  스킬 능력 = 루트의 애니 능력, 없으면 루트 묶음(`_abilities` 순서)의 첫 클립 자식, 그것도 없으면 경로 이름순 첫 능력 — 단 스킬의 `_extraAbilities`는 스킬 자기 버프(루트 능력과 루트 묶음 자식의 `_buffs`)의 템플릿이 스킬 시작(ON_BUFF_START·ON_SKILL_START)에 `TriggerAbility`로 트는 것만 든다(2026-11-11, 공식 클라에서 확인: `BasicSkill.OnBorn`이 배치 때 붙이는 따로인 능력이고 `get_ability`가 아니다. 끝·주기·피격·SPELL_ON에 트는 9개 — 에이어스카르페 S2·블레미샤인 S3·베토치키 S2·클레멘티아 S3·노시스 S3·하루카 S1·S2·민트 S2·쏜즈 S2 — 는 버프만 거는 시전이 됐고, 바뀐 것은 시전 때 돌아보기와 막대 사건의 시각뿐; 시작에 트는 필라에 S1·스펙터 디 언체인드 S1·벨로네 S3 등은 그대로; 체르니 S2의 손 목록 `LATER_ABILITIES`는 이 규칙으로 바뀜)(2026-10-29: 인포서 S2가 클립 없는
  `aura` 대신 `knock_back` `Skill` — 바뀐 것은 이 하나; 켈시 에스페란타 S1–S3의 시전 기록도 이때 들어감, golden은 바라보기 수만).
  - `replace` = `ReplacementSkill`(풀 49개; 공격 없는 것: 引星棘刺 S1·锡人 S1·伺夜 S1/S2·华法琳 S1): 시전 때 SP를 쓰고 **다음 공격이 스킬로 나간다** —
    그 주기에 일반 공격 없음, 스킬 자신의 대상 선택(적이 없어도 나감), 효과는 그 휘두름의 OnAttack 프레임, 다음 공격은 그 휘두름 시작부터 공격 간격 한 번 뒤.
    공식 클라 `ReplacementSkill.ApplyModification` → `Character.RegisterReplacement`, `Character.get_attack`,
    `Character._SearchAttackTarget` → `TryHookSearchTarget`, 공격 뒤 `ReplacementSkill.CancelAfterAttack` →
    `Character.ClearReplacement`(스킬 능력 쿨다운을 공격 능력으로). 구현: `skills.js activate`(`replacing`)·`fireReplacement`, `ai.js startReplacement`.
    휘두름이 끊기면(기절·缴械) 시전은 그 휘두름과 함께 소모된다(2026-10-25 정정 — 아래 「「다음 공격」 스킬은 그 휘두름이 끝나면 꺼짐」). 华法琳 S1 두 키트는 키트가 「막 나갈 치료」를 스킬 치료로 바꾸는 방식이라(대체되는 공격을 키트가
    직접 모델) SkillSpec `inAttack: true`로 엔진 대기를 끈다.
  - `state` = `CastSkill` `_switchToState` 1(풀 149개; 공격 없는 즉발 약 20개): 곧바로 시전하고 Skill 상태 — 진행 중 휘두름은 끊기고(쿨다운 유지,
    계속 흐름) 스킬 능력이 끝날 때까지(`unit.skillStateUntil`) 공격하지 않는다. 기절·빙결·수면은 상태를 끝낸다.
    공식 클라 `Character.States.SkillState._StartSkill`(`BasicSkill.Cast`의 끝 콜백 = 상태 끝), `SkillState.OnTick`.
    지속 스킬도 프리팹은 같다(2026-11-04): 유넥티스 S3(`Hensin` `Skill_2_Begin` 1.5초, 그 뒤 `SwitchMode` — 지속시간 31초는 시전 뒤부터, 끝은 32.5초 뒤)·벨로네 S3(`Skill_3_ReStart_Begin` 0.2초)·Mon3tr S3(`Skill_3_Begin` 0.667초)는 키트의 `castHolds`로 시전 동안 휘두름을 끊고 공격하지 않는다(유넥티스만 `durationAfterCast`). 유넥티스의 능력치 버프 `zumama_s_3[buff]`는 시전 시작에 붙는다: `Hensin`의 `BuffDuringCasting.OnCastStart`가 `zumama_s_3[hensin]`을 붙이고, 그 템플릿의 파생 아닌 `CreateBuff`가 만든 버프를 `zumama_s_3` 끝이 지운다.
    나머지 지속 스킬도 대조함(2026-11-04, 공식 클라 프리팹·버프 템플릿). `castHolds`만(지속시간은 시전부터): 필라에 S1(`philae_s_1`이 `SkillAnimation` `Skill_1` 1.667초를 부르고 그 `philae_s_1[animation]`이 `FORCE_DISARMED`)·울피아누스 S3(`BuffAbility` → `AOEAttack` `Skill_3_Begin` 1초)·스펙터 디 언체인드 S1(`ghost2_s_1` 모드 `Empty`에 `ExchangeHp` `Skill_1` 1초, 그 뒤 모드 `S1`)·위 S3(`CastAnimation` `Skill_3_Begin` 1.6초 → `Aura`; 스킬 시작부터 붙는 `yu_s_3[switch_mode]`가 끝나며 `Aura`를 끊음).
    `castHolds` + `durationAfterCast`(지속시간을 내는 버프가 순차 묶음의 클립 뒤): 벤델라 S2(`MaxHpMark` `Skill` 0.5초 → `ActiveBuff`)·블레미샤인 S2(`Sleep` `Skill_2` 1초 → `Switch`)·위 S2(`Tel` `Skill_2` 1.6초 → `Mode`)·리드 더 플레임 섀도우 S2(`Skill_2_FireBall` `Skill_2` 0.5초 → `ActiveBuff`)·치우바이 S2(`sword_split` `Skill_2` 1.167초 → `switch_mode`).
    `endHolds`: 데겐블레허 S3은 묶음이 `MultiAttack` → `EndAttack`(`Skill_3_End` 1.567초)이라 키트 지속시간이 끝난 뒤 그 클립 동안 공격하지 않는다.
    안 바꿈: 지마 더 레이징 타이드 S3은 스킬 시간이 곧 클립이고 내내 공격하지 않는다. 아이린 S3도 내내 공격하지 않고 PRTS 「고정 3.5초」대로 둔다: 클립 합계(`Skill_3_Start` 0.267초 + `Skill_3_Attack` 3.833초 = 4.1초)와 다르지만 관리자가 그대로 두기로 함(관리자 결정 2026-11-04).
    글래디아 S3은 내내 공격하지 않고, 끝난 뒤에도 끝의 `FinalAttack` 동안 2.667초 쉰다(`endHolds`, 관리자가 공식 게임에서 끝난 뒤 잠깐 쉬는 것을 봄 2026-11-04): `Skill_3_Begin`의 `OnAttack` 0.367초 + 끌어당김 투사체 수명 1.3초 + `_minPostDelayWhenProjectileInvalid` 1초 [추정·화면: 쉬는 길이는 재지 않았고 클라 값의 합이다. 같은 능력의 시작 쪽은 관찰상 훨씬 짧다(「글래디아 S3 시작 순서」)]. 화면은 끝 동작 세 클립을 차례로 튼다. 가운데 `Skill_3_Loop`는 클립 길이(1.333초)가 아니라 끌어당김 투사체가 끝날 때까지다(0.633 + 1.033 + 1.167 = 2.833초, render.md 「스킬 끝 채널의 루프」). 마지막 `Skill_3_End`는 공격이 끊는다. 효과가 나는 시점은 아래 「지속 스킬의 효과가 나는 시점」.
  - `free` = `_switchToState` 0(사일런스 S2·플레임테일 S1·와파린 S2·텍사스 S1 `skcom_charge_cost`): 곧바로 시전, 공격과 무관.
  - **다음 시전**: 스킬 능력이 다시 준비돼야 한다 — `CastSkill.IsAvailable` → `Ability.get_isReady`(쿨다운 타이머 + 시전 중 아님).
    능력 시간(`SkillRuntime.castTiming`): `AbstractAnimatedAbility.get_cooldown` — `_timeMode` 0 FROM_ATTACK_SPEED = 주인의 공격 간격,
    1 FROM_ANIMATION = `DoAttach`가 `_cooldown`에 쓰는 `Entity.GetAnimationTime(_animKey)`(클립 길이), 2 = `_cooldown`, 3 = 블랙보드 `_cooldownKey`;
    행동 길이 = `UpdatePlaybackSpeed` 배율(시간 ÷ 클립, [0.1, `_maxAnimScale`]) × 클립(골격에 클립이 없으면 그 시간 그대로).
    `state`는 행동 끝과 쿨다운 둘 다(`_resetAbilityCooldownWhenCastEnd` 1이면 `CastSkill.OnCastFinish`가 능력을 되돌려 행동 끝만), `free`는 쿨다운만.
    버프만 거는 능력(`ActiveBuffAbility`: 쿨다운 = `SetLifeTime`의 버프 수명, 여기 해당 스킬은 즉시형)은 SP만 기다린다.
  - 텍사스 S1(`skcom_charge_cost[3]`)은 프리팹 추출에서 찾음: `CastSkill` sw0 + `ActiveBuffAbility`(`charge_cost` 즉시 버프) → `free`, 간격 = SP뿐.
  - **지속 스킬의 효과가 나는 시점**(2026-11-04, 공식 클라 프리팹·버프 템플릿): 스킬 능력은 클립의 `OnAttack`을 기다리고(`_waitForAttackEvent`), 순차 묶음의 다음 능력은 클립 끝에 시작한다 → 키트 `onStrike`·`onCastEnd`(`skills.js _tickCast`). 대상은 `_selectTargetTiming`대로 고른다(0 = 시전 시작, 1 = 그 순간).
    - 벤델라 S2: 대상 고르기·도발·반격은 `OnAttack` 0.167초(`MaxHpMark`의 ON_SPELL_ON → `vendla_s_2[self]`). 그때부터 `duration`이라 스킬 끝보다 약 0.33초 먼저 끝난다.
    - 블레미샤인 S2: 수면은 `OnAttack` 0.5초(대상은 그 순간), 생명 회복은 클립 끝 1초(모드 S2의 `Body/Heal`, `Switch` 뒤).
    - 위 S2: 피해·이동은 `OnAttack` 0.5초(대상은 그 순간). 위 S3: 화염벽 그림은 시전 시작(`yu_s_3[effect]`, ON_CAST_START), 효과는 클립 끝 1.6초(`Aura`). 제2재능을 아군 전체에 주는 것은 모드 S3의 `Talents/2/GlobalArua`이고, 그 모드는 `CastAnimation`의 `BuffDuringCastingFixed`(`yu_s_3[mode_restart]`)가 끝날 때 켜진다(2026-11-05) → 클립 끝, 기절로 끊기면 그 순간(벽은 잃고 모드는 들어감, 키트 `onCastCut`). 시험: `test/content/yu_s3_mode.test.js`.
    - 리드 더 플레임 섀도우 S2: 불덩이는 `OnAttack` 0.167초(대상은 그 순간), 수명도 그때부터.
    - 치우바이 S2: 대상은 시전 시작, 피해 + 정지 1.2초(`sword_split` `_activeBuffs`)는 `OnAttack` 0.5초. 지속 정지와 끝의 물리 피해는 클립 끝 1.167초의 `switch_mode`에서 온다.
    - 울피아누스 S3: 닻 칸은 시전 시작, 던지기는 `OnAttack` 0.433초, 피해·기절은 닻이 닿을 때(`projectile_chr_ulpia_s3` 초속 15칸) [추정·엔진: 출발점을 탑재 위치가 아니라 그의 칸으로 셈], 【이동】은 클립 끝 1초 — 공식은 닻이 멈출 때(`_extraActionEvent` 3 = `ON_PROJECTILE_STOP`; 아래 「울피아누스 S3의 【이동】은 반드시 일어난다」 남은 차이).
    - 데겐블레허 S3: 마무리 타격은 `Skill_3_End`의 `OnAttack`, 스킬 시간 끝 0.333초 뒤(대상은 그 순간, 스킬 범위). 글래디아 S3: 끝의 捕网은 스킬 시간 끝 0.367초 뒤 [추정·화면: `endHolds`와 같은 이유로 길이를 재지 않음].
    - 안 옮김: 필라에 S1(시전 시작에 붙는 `philae_s_1`의 템플릿이 정화·방벽을 낸다), 스펙터 디 언체인드 S1(`_waitForAttackEvent` 0), 유넥티스 S3(옮길 효과 없음). 벨로네·Mon3tr S3은 아래.
    - 기절·빙결·수면은 Skill 상태를 끝낸다(`SkillState.OnTick` → `OnExit` → `BasicSkill.InterruptIfNot` → `Ability.InterruptIfNot`) — SP는 돌려받지 않음. 끊겨도 **스킬은 끝나지 않고 제 시간만큼 켜져 있다**(2026-11-05, 공식 클라에서 확인): `BasicSkill.OnTick`은 능력이 효과 중이 아닐 때 스킬을 끝내고, 순차 묶음은 `get_isAffecting`이 묶음 쿨다운 타이머가 도는 동안 참이다. 그 타이머는 시전 때 시작하고(`CastToTarget` → `ResetCooldown`) 끊겨도 건드리지 않는다(`FinishIfNot`은 `resetCd`일 때만). 길이는 자식 쿨다운의 합, `_useLongestAbilityCooldown`이면 가장 긴 것(`_UpdateCooldownFromSubAbilities`) → 끝나는 시각이 끊김으로 앞당겨지지 않는다(`durationAfterCast`는 끊겨도 클립 끝부터 잼). 끊긴 뒤 무엇이 남는지는 묶음 값이 정한다(`AbilitySequenceGroup.OnCastEnd`).
      - 진행 중 능력도 끊음(`_alsoInterruptCurrentSubAbility` 1, 그 순서가 `_interruptableSubAbilityIndice`에 있음): 아직 안 온 단계는 사라진다. 벤델라 S2·블레미샤인 S2·위 S2는 능력치와 공격(`modsAfterCast`)도 클립 뒤 능력의 것이라 잃고 스킬 시간만 흐른다. 위 S2는 묶음 시간이 가장 긴 능력의 것이라 끊기면 시전부터 `duration` 뒤에 끝난다(`durationFromCastWhenCut`). 위 S3·울피아누스 S3·Mon3tr S3은 능력치를 그대로 두고 뒤 단계만 잃는다(울피아누스·Mon3tr은 먼저 시전되는 `BuffAbility`가 능력치를 준다. 위 S3은 `yu_s_3[switch_mode]`가 스킬 시작부터 붙는다).
      - 진행 중 능력을 안 끊음(`_alsoInterruptCurrentSubAbility` 0, `castCarriesOn`): 리드 더 플레임 섀도우 S2·치우바이 S2·유넥티스 S3. `_DoCast`는 주인 상태를 묻지 않으니 단계가 그대로 온다. 기절이 클립을 끊으면 `OnAttack`이 오지 않아, 그 전이었던 타격은 대기 상한(클립 끝)에 나간다. 다음 능력도 클립 끝에 시전된다(`_stopMoveNextWhenNotCasting` 0).
      - 묶음 시간 (2026-11-05, 공식 클라에서 확인): `AbilitySequenceGroup.DoSetData`가 자식의 `get_cooldown`을 더해 한 번 정하고(`_updateCooldownAfterSubAbilitiesAttached` 0, 22개 묶음 전부), `_timeMode` 1 묶음은 공속 변화에도 다시 안 정한다. 설정은 붙이기보다 앞이다: `BasicSkill.AssignData`가 능력을 설정하며 `m_owner`를 쓰고, `CastSkill.OnInit`이 그 주인으로 붙인다. 그래서 `_timeMode` 1 자식은 클립 길이가 아니라 프리팹의 `_cooldown`이 더해지고(클립 길이는 `DoAttach`에서야 씀), `ActiveBuffAbility`는 버프의 지속시간이 더해진다(`SetLifeTime`; `durationKey`가 비면 `duration`, `Buff.FetchDuration`). 스킬은 묶음 타이머와 자식의 효과 중 늦은 쪽에 끝나고(`get_isAffecting`), 버프 자식은 시전이 시작된 뒤 제 시간만큼 효과 중이다.
        - 유넥티스 S3·블레미샤인 S2·위 S2·치우바이 S2: 첫 자식 `_cooldown` 0 → 타이머 = 지속시간, 자식이 끝나는 때 = 클립 + 지속시간 → 끝은 클립 + 지속시간. `durationAfterCast` 그대로 맞다.
        - 벤델라 S2 [추정·화면: `MaxHpMark`가 `_timeMode` 0이라 설정 순간의 공격 시간이 더해진다. 1.6초면 타이머 16.6초, 자식은 15.5초에 끝난다. 설정 순간에 공격 시간이 이미 채워져 있는지 안 봤고 공식 화면과 대조하지 못해 15.5초로 둔다]
        - 리드 더 플레임 섀도우 S2 [추정·화면: `Skill_2_FireBall` 프리팹의 `_cooldown`이 20이라 코드대로면 타이머 40초인데, 표의 지속시간은 20초이고 자식은 20.5초에 끝난다. 공식 화면과 대조하지 못해 20.5초로 둔다]
    - 벨로네 S3·Mon3tr S3의 이동은 시전 순간이 아니라 클립 끝이다(2026-11-05, 공식 클라에서 확인): `FlyToTarget`·`Respawn`은 `_waitForAttackEvent` 1이고 클립(`Skill_3_ReStart_Begin` 0.2초·`Skill_3_Begin` 0.667초)에 `OnAttack`이 없으니, 대기는 상한 `m_cachedDuration`에서 끝난다. `_End` 클립을 이어 트는지와 무관하다. 대상은 벨로네는 그 순간(`_selectTargetTiming` 1), Mon3tr은 시전 시작(0). Mon3tr은 끊기면(`_interruptableSubAbilityIndice` 1) 제자리에서 스킬만 흐른다. 유실은 착지부터라 끊기면 없다. 벨로네의 `FlyToTargetSecond`도 같은 클립·대기라 0.2초 뒤 이동한다. 스킬 상태 밖에서 버프가 트는 이 시전(`TriggerAbilityUseSelector` → `CastToTarget` → `StartCastingInternal` → `OnCastStart`)은 다른 능력을 끊지 않고 제 클립만 튼다(2026-11-11, 공식 클라에서 확인). 그 클립이 캐릭터 애니메이션을 차지하므로 진행 중인 주 공격은 제 클립의 `OnAttack`을 못 받고, 상한(`EasyToStartAbility.WaitForNextEvent`의 공격 시간 끝)에서야 친다. 그래서 0.2초 안에 올 타격은 오지 않고, 공격 시간이 0.2초 뒤까지 남았으면 이동이 휘두름을 끊는다(`op-demetr.js startFly`). 그 0.2초 동안 새 공격은 시작할 수 있다. [추정·CN: 이동 노드 `RespawnCharacter`는 CN 전용이라 새 배치처럼 휘두름을 끊는다고 둠]
      - 같은 꼴 훑기(2026-11-17, 공식 클라 프리팹·버프 템플릿에서 확인): 풀 키트의 버프 템플릿에 `TriggerAbility*` 노드가 167개 있고, 그것이 트는 능력 가운데 `_animKey`가 있는 것을 능력 프리팹(캐릭터·스킬·소환물)에서 골랐다. `_castDirectly`(`AbilityStandard.CastDirectly`)도 `StartCastingInternal` → `OnCastStart`를 거쳐 제 클립만 틀고 다른 능력을 끊지 않는다. 휘두름이 기다리는 `OnAttack`은 주인 엔티티의 이벤트 풀로 오므로(`<WaitForNextEvent>d__15`) 다른 능력 클립의 `OnAttack`도 받는다.
        - 체르니 S2 `FinalAttack`(`interval`마다, `pianst_s_2_buff_2`): 모드 `Empty` 전환은 S2 휘두름을 끊지 않는다(`det` 0, 다시 시작한 상태 기계는 새 모드의 공격만 끊음). 그래서 그 휘두름은 `Skill_2_End`의 `OnAttack`(0.533초)과 제 공격 시간 끝 가운데 먼저 오는 때에 친다(`op-pianst.js FINAL_EVENT`). 전에는 제 타격 시각에 쳤다.
        - 켈시 에스페란타 S3 `StartTransporting`(이륙)·`RespawnBorn`(착지)은 능력 옆의 `BuffDuringCastingFixed`가 시전 동안 FORCE_DISARMED를 건다(이륙은 INVINCIBLE도) → 휘두름이 끊기고 공격하지 않는다(rules/diy.md 「켈시 에스페란타 S3 운반 이륙」).
        - 겹칠 공격이 없는 것: 무에나 재능 `AnimAttack`(`mlynar_tr`, 공격하지 않는 Default 모드에서만), 유키 마코토 `Allout_LoopEnd`(공격 없는 `Switch2Normal` 모드), 스와이어 디 엘리건트 위트 S3 끝 `RandomGold`(이 모드에서는 S3가 끝나지 않음), 늑대 무리·유동체·지휘 센터의 `Recharge` 모드 능력, 블레미샤인 S1·S3 치료(클립 없음), 스킬 시작에 트는 것(필라에 S1·스펙터 디 언체인드 S1·벨로네 S3 `FlyToTarget` — 위 `_extraAbilities`).
        - 유동체의 복사(`mlyss_wtrman_s_begin` ON_ENTITY_WILL_OVERLAP → `SwitchToMelee`/`SwitchToRange` 클립 `Change_A`/`Change_B`)는 같은 노드가 먼저 `mlyss_wtrman_during_anim`(FORCE_DISARMED·SKILL_NOT_ACTIVATABLE·DISABLE_COMBAT, 기절·빙결 면역)을 건다. 그 버프는 복사 0.667초 뒤 풀린다(2026-11-18, 공식 클라에서 확인 — 토큰 프리팹과 버프 템플릿): 노드가 트는 `SwitchMeleeBegin`/`SwitchRangeBegin`은 버프 능력(`_waitForCasting` 0, 한 틱)이고 그 버프 `mlyss_wtrman_switch_*_trigger`가 `SwitchToMelee`/`SwitchToRange`를 튼다. 이 능력은 Recharge 모드의 되살림 시전과 같은 클래스(`_timeMode` 2, `_waitForAttackEvent` 0)라 `_preDelay` 0.667초(클립 `Change_A`/`_B` 길이와 같아 배율 1) 뒤 `_activeBuffs` `mlyss_wtrman_switch_melee`/`_range`를 걸고, 그것이 `SwitchStateEnd`를 틀어 `mlyss_wtrman_finish_switch_state`가 `during_anim`을 끝낸다(같은 자리에서 모드도 바꿈). 시뮬: 복사 순간(`tokens.js` 유동체 스킬 `autoTrigger`, 키트 복사와 기본 복사 둘 다) 0.667초 `mlyss:switching`(공격·스킬 막기)을 걸고, 그동안 기절·빙결을 받지 않는다. 남은 차이: 이미 걸린 기절·빙결을 그동안 누르는 `abnormalAntis`는 없다 — 엔진에 버프가 다른 상태를 누르는 길이 없고, 복사(`autoTrigger`)는 기절 중에도 일어난다(bundles sim-Z 「유동체 복사의 기절 누르기」 줄). 재발 방지: `test/content/kits_t6.test.js` 「缪尔赛思: the copy switches the 流形 for 0.667 s …」.
        - 시험: `test/content/op_pianst.test.js`(S2 `FinalAttack` 클립), `test/content/op_kalts2.test.js`(S3 이륙·착지).
    - `moveRedeploy`는 진행 중 휘두름을 없앤다(새 배치와 같음, 위 벨로네·Mon3tr·울피아누스 S3). 클립 끝 틱에는 공격을 시작하지 않는다: 스킬 틱이 공격 뒤라, 옛 칸에서 시작한 휘두름이 끼어들었다.
    - 시점이 옮겨진 피해의 대상 이펙트는 표시 사건 `['castHit', id, part?]`가 붙인다(render: `fxgame.js` `castHit` → `expect`).
  - **즉발·충전 `state` 스킬의 효과가 나는 시점**(2026-11-05, 공식 클라 프리팹): Skill 상태·SP·다음 시전 간격은 시전 순간 그대로이고, 효과만 스킬 능력이 기다리는 프레임에 난다(키트 `onStrike`, `skills.js _instantStrike`·`_tickCast`). 클립의 `OnAttack`이고, 텍사스 S2처럼 `_waitForAttackEvent` 0이면 `_preDelay`(0.5초)다. 대상은 `_selectTargetTiming`대로: 0이면 시전 시작에 골라 두고(`onStart`, `skill.castPick`) 그사이 범위를 벗어나도 맞으며 죽은 대상만 빠진다, 1이면 그 프레임에 고른다.
    - 대상 0: 블레이즈 디 이그나이팅 스파크 S1·인포서 S2(`knock_back`)·노시스 S2·아이린 S2·레온하르트 S2·루멘 S2·포덴코 S2·토스카 S1·불피스폴리아 S2·위디 S3, 쏜즈 더 로드스타 S2의 적(`Mark`; 적이 없으면 칸은 `Token`이 그 프레임에). 대상 1: 나머지(아르케토 S2·데겐블레허 S2·메테오 S2·프라마닉스 더 프레리타 S1·실버애쉬 더 레인프로스트 S2·에이야퍄들라 더 크비트 아스카 S2·토스카 S2·토가와 사키코 S1 등, 값은 각 키트 주석).
    - 시전 시작에 나는 것(`_runActionOnEvent` 2 ON_CAST_START): 플레임테일 S2의 DP(`flamtl_s_2[cost]`), 탈룰라 S2의 스택과 방어 구간. 텍사스 S2·불피스폴리아 S2의 DP는 ON_SPELL_ON(타격), 실버애쉬 더 레인프로스트 S1의 DP·덱은 ON_SPELL_END(타격 끝)이라 프레임에 난다.
    - 기절·빙결·수면이 그 전에 오면 효과는 사라지고 SP는 돌려받지 않는다(지속 스킬의 끊김과 같음, 스킬 능력이 그룹이 아니라 끊긴다). 화면의 스킬 켜짐(`['skill', id, 0]`)은 프레임까지 유지한다(타격음이 스킬의 것이다, `audio.js`). 프레임 동안 `skill.active`는 참이다(재능이 스킬 중인지 묻는다).
    - 클립을 다른 컴포넌트가 트는 능력(2026-11-07, 공식 클라에서 확인): `_animKey`가 빈 스킬의 클립은 옆의 `ThreePartChannelingAnimation`(`_default`)이나 `ThreePartOneshotAnimation`이 튼다. 클립의 `OnAttack`이 능력의 타격을 부른다. 시작·끝 클립(또는 시작·oneshot)이 능력 시간 안에 함께 줄고, 행동 길이는 능력 시간이다(`hold`). `skill_cast.py`가 클립을 스킨 키 표로 풀어 `cast`에 넣는다. 옮긴 키트 `onStrike`: 클리프하트 S2(`Skill_Start` 0.7·`Skill_End`), 울피아누스 S1(`Skill_1_Begin` 0.767), 스노우헌터 S2(`Skill_2_Begin` + `Skill_2_Loop` 0.033, 대상은 그 순간), 패신저 S3(`Skill3` 0.267, 대상은 시전 시작), 사리아 S2(`Attack_2`, 대상은 시전 시작). 모스티마 S2는 첫 펄스가 `Skill_Begin` 0.567초, 그 뒤 1초마다. 안 옮김: 로즈몬티스 S3·비즈왁스 S2는 첫 자식 소환 능력의 클립이 없고 쿨다운이 0이라 대기가 없어 지금처럼 바로 나온다. 호시구마 S3은 아래 「채널 공격」.
    - 채널 공격(`ChannelingMeleeAttack`, 2026-11-07, 공식 클라에서 확인, `shared/tier4.js channel`): 호시구마 S3·모스티마 S2의 스킬 능력이다. Skill 상태라 스킬 내내 일반 공격이 없다(모스티마도 전에는 쳤다). 첫 타는 능력이 기다리는 프레임(호시구마 `_preDelay` 0.4초, 모스티마 `Skill_Begin`의 `OnAttack` 0.567초), 그 뒤 `_triggerDelta` 1초마다다. 공격 속도와 상관없다(`DoSetData`·`OnWaitForTriggerDelta`). 타격 직후(`AbilityStandard._DoCast`) 남은 `duration`이 `_postDelayChecker`(호시구마 0.8, 모스티마 1)보다 크면 한 타 더 나간다. 그래서 호시구마는 25초에 25타(0.4초~24.4초)다. 호시구마 선택자는 `_limitTargetNum`이 꺼져 있어 대상 수 제한이 없고(`_maxNum` 1은 안 쓴다) `_selectTargetTiming` 1이라 타마다 범위를 다시 본다. 선택자라서 범위 밖의 저지 적은 맞지 않는다. 피해는 `_atkScale` 1·물리로 일반 공격의 한 번으로 센다(`Battle.forceAttack`). 전에는 공격 간격마다 일반 공격으로 쳤다. 기절·빙결·수면은 능력을 끊고, 능력이 곧 채널이라 효과 중이 아니게 되어 스킬이 그때 끝난다(`Ability.get_isAffecting` = `isCasting`, `BasicSkill.OnTick`; 순차 묶음과 다름). 시험 `test/content/kits_alt_t4.test.js`.
    - 클립을 키로 찾는 법(2026-11-07, 공식 클라에서 확인): 클라는 클립을 키로만 틀고, 스킨의 `SpineAnimator._animations` 키 표가 키를 클립 이름으로 바꾼다(`SpineAnimator.GetAnimationData`). 표에 없는 키는 데이터가 없고 `GetAnimationTime`이 거짓이다. 추출(`attack_timing.py`·`skill_cast.py`)이 이 표로 푼 `clip`을 적는다. 같은 능력 옆의 `UberAnimationEffectEmitter`가 `_sourceAnimKey`로 그 키를 받으면 시전마다 `_replaceGroup`의 한 묶음 `anim`을 대신 튼다(`OnCastStart`) — `attack_timing.py`는 그 첫 묶음을 키 표로 푼 것을 `clip`으로 적는다(2026-11-12, 외드레르 S2 `Attack` → `Skill_2_Loop_A`: 타격 0.7 → 0.767초, `Skill_2_Loop_B`와 길이·타격이 같음; 화면은 이미 그 클립 — rules/fx.md 「외드레르 S2 클립」, `test/sim/attack-clip-view.test.js`가 선발이 되며 잡음).
    - 안 옮김(이미 맞음): 첸 더 던스트릭 S2(공격 없고 사라지는 동작이 키트에 있음), 지마 더 레이징 타이드 S3(망치 프레임을 키트가 셈). 아이린 S3 첫 타는 `Skill_3_Start`의 `OnAttack` 0.133초로 옮김.
  - 데이터에 `cast`가 없는 스킬(클라 프리팹을 못 읽은 것)은 옛 규칙(틱 시전 뒤 공격 간격 한 번)을 쓴다.
  - 범위 밖: `spec.attack`이 있는 `CastSkill` sw1 4개(솔방울 S1·첼로 S1·머드락 S2·님프 S2)는 지금처럼 「다음 공격에 스킬 공격」.
  - **옛 동작**(2026-10-09 upstream #298 이식, [ASSUMED]): 모든 공격 없는 즉발이 틱 시전 뒤 `nextCastAt = now + 공격 간격`, 시전은 공격이 아니고 공격 리듬은
    그대로. 되돌리려면 `skills.js _paceInstant`에서 `this.cast` 갈래를 빼고(`!c` 갈래만), `_replacesAttack`이 false를 돌려주게 한다.
  - 테스트: `test/sim/instant-cast.test.js`(세 부류 + 실제 경기 경로 引星棘刺 S2), `test/content/bonds_addon.test.js` #298(迅捷 + 引星棘刺 S1 = 매 공격이 투척).

### 보스 포털 (결정 3)
- **규칙**: APPEAR가 없는 네 경로(act1autochess_h07_02 #4, act1autochess_h08_02 #5·#9, act2autochess_h07_05 #6)는 데이터 그대로 —
  DISAPPEAR → WAIT 3 → MOVE … 를 숨은 채로 가고, 경로 끝은 다른 경로 끝과 같다(누수). 숨은 적에는 우리 `portalPickup`(입구 끝 → 출구 3 s)도 적용하지 않는다.
  근거: 공식 클라에 위수 협의 포털 클래스가 없고(경로는 레벨 데이터의 체크포인트 형만으로 움직임) 그 네 경로의 레벨 파일에 APPEAR_AT_POS가 없다.
- **옛 동작**(upstream PR #337, 2026-10-09 이식): `simdata.js normalizeRoute`의 `portalAppear`가 DISAPPEAR(→WAIT) 다음 MOVE 앞에 그 MOVE 목표([5,10])로
  APPEAR를 넣었다(upstream 제보 「进传送门后被判定进蓝门，全程隐身」). 되돌리려면 그 함수(git 이력의 `portalAppear`)를 `normalizeRoute`의 두 반환 앞에
  다시 부르고 `ai.js portalPickup`의 `if (e.hidden) return false;`를 뺀다. 테스트: `test/sim/portal-appear.test.js`.

### 자작 원소 `necrosis` 삭제 (결정 4)
- 엔진이 만든 다섯 번째 원소(12 s 진실 100/s, ATK −20 %)는 공식에 없다(클라 `Torappu.ElementType` = SANITY·WATER·FIRE·DARK; 괴사 = `apoptosis`) — 거는 데이터·콘텐츠도
  없어 지웠다: `constants.js ELEMENTS`·`ELEMENT_ORDER`·`ELEMENT.necrosis`, `damage.js` 폭발 갈래, `buffs.js necrosisBurst`, 유닛 게이지, 원소 합계(锡人 凋敝魂灵 태그,
  哈洛德·纯烬艾雅法拉 합계), 렌더 막대 색·아이콘·링·피해 숫자 종류. 렌더 아이콘 아틀라스 키 `necrosis`(凋亡 아이콘 이름)는 그대로.

### 저항 대상 (결정 4 조사)
- **규칙**: 抵抗이 줄이는 상태 = 晕眩·冻结·寒冷·恐惧·诱导(`buffs.js RESIST_STATUSES`). 공식 클라 `Buff._InitIsStatusResistable`: 버프마다
  `statusResistable` NO/YES/AUTOMATIC, AUTOMATIC은 이상 플래그가 STUNNED·FROZEN·DOZE·ATTRACTED이면 저항 — 우리 풀 스킬 프리팹 버프 586개가 모두 AUTOMATIC.
  DB 상태(`loadFromDB`)는 공식 클라 버프 표의 행(2026-10-31 공식 클라에서 확인 — 이상 플래그는 `attributes.abnormalFlags`만 버프의 플래그 마스크로
  가고, `abnormalCombos`는 따로 콤보 마스크로 가서 AUTOMATIC 판정에 안 쓰인다): 한랭(寒冷, `c2e_cold`·`e2c_cold`)·공포(恐惧, `fear`) YES → 저항,
  기절(晕眩, `stun` STUNNED)·동결(冻结, `c2e_freeze[holder]`·`e2c_freeze` FROZEN) AUTOMATIC → 저항; 수면(沉睡, `sleep` — 플래그 없이 콤보 SLEEPING),
  정지(停顿, `sluggish` — 이동 속도 수정치뿐), 전율(战栗, `disarmed_combat` DISARMED_COMBAT), 침묵(沉默, `silence`), 마비(麻痹, `palsy[stack]`·`palsying`)는
  AUTOMATIC인데 그 넷이 아니라 저항 안 됨 — PRTS 「可抵抗状态」와 같다. 浮空·束缚·缴械·减速·缚地는
  플래그 없는 AUTOMATIC(데이터)이라 저항 안 됨. 티티 小睡(DOZE, 아군)는 키트의 `addBuff`라 저항 경로 밖(그대로).
- 감쇠: `Buff._PreprocessDeltaTime` = dt ÷ max(0.001, 1 − 저항) → 걸 때 지속 × max(0.001, 1 − 저항)과 같다(저항이 도중에 바뀌면 다름 — 작은 차이,
  그대로). `resistOf` 상한 0.95는 그대로 [ASSUMED].
- **옛 동작**: 14개(위 + 沉睡·战栗·浮空·束缚·沉默·缴械·停顿·减速·缚地) [ASSUMED 「키트가 주는 抵抗을 따름」]. 되돌리려면 그 Set에 다시 넣는다.

### 麻痹震颤 (결정 4 조사)
- **규칙**: 麻痹로 공격이 끊긴 적은 모두(막힘·근접·원거리·「不停止移动」) `PALSY_STOP` 0.5 s 동안 움직이지 않고 새 공격을 시작하지 않는다(`ai.js` `palsyUntil`·
  `atkStandUntil`); 기절·빙결·수면·浮空이 오면 끝. 공식 클라 `Enemy.OnTriggerPalsy` → `Enemy.States.PalsyState.OnTick`(`palsying` 버프가
  있는 동안 머묾). 0.5 s = 클라 버프 표(`dyn/gamedata/buff_table*.bytes`)의 `palsying` 행 blackboard `duration` 0.5(2026-10-31 공식 클라에서 확인; PRTS
  术语释义 麻痹 「进入0.5秒的麻痹震颤状态」과 같음; 이전엔 PRTS 근거의 추정). `_PlayShaking`의 5 s는 흔들림 연출 길이일 뿐.
- **옛 동작**: 막히지 않은 원거리 적만 `ATTACK_PAUSE` 0.35 s 섬. 되돌리려면 `ai.js enemyAttack`의 麻痹 갈래 두 줄을 옛 `atkStandUntil` 식으로.
- 미구현: PRTS 「或开始动作2秒时被打断」(선딜 2 s 넘는 공격의 2 s 시점 끊김).

### 战栗 면역 (2026-10-15)
- **규칙**: 战栗(`tremble`)은 적 데이터의 战栗 면역(`disarmedCombatImmune` → enemies.json `otherImmunities` 'disarmedCombat')이 막는다. 클라 버프
  템플릿이 战栗을 걸기 전에 `CheckAbnormalImmune(DISARMED_COMBAT)`로 거른다(예: `enemy_vtmstr_equip_B_attack_disarm[char]`). 대상: 折桠 S1·战栗维式重锤·
  冲击式施术单元(알리스테어 장비를 든 오퍼레이터).
- **옛 동작**(upstream부터): 恐惧 면역(`feared`)이 막았다 → 恐惧만 면역인 7종(假想敌：胄 ×2·管 ×2·弦·阿利斯泰尔·乌顶巨角卢鲁 `enemy_10144_xdelk_2`)이 战栗도 막았고, 战栗만 면역인
  愧悔魂灵圣杯는 걸렸다. 그중 胄·管·阿利斯泰尔은 자박·저지 불가라 战栗(저지당했을 때만 공격 못 함)이 걸려도 효과가 없다.

### 괴사 손상의 SP 감소와 지속형 스킬 (결정 4 조사, 동작 그대로)
- 공식 클라 `Entity.DoApplyModifier`의 SP 갈래: `SP_MODIFY_STOPPED`면 거부, `spRecoverStopped`(지속형 스킬 중 주인 플래그)는 **증가만** 막는다 →
  감소는 지속 중에도 들어가지만 깎이는 것은 남은 SP뿐이고 지속 시간은 능력 타이머라 줄지 않는다. 1회 충전 지속형은 시전 때 SP가 0이라 결과가 같다 —
  `damage.js`의 「지속 중엔 건너뜀」은 그대로(차이: 충전 2회 이상 지속형의 남은 충전, 스와이어 디 엘리건트 위트 스킬 중 `SP_MODIFY_STOPPED` — 미구현).


## 최종 공세·히든 코어 보스 패턴 (2026-10-14, 공식 클라 대조)

근거: 공식 클라(EN 2026-10-14 판)의 적 프리팹·투사체 프리팹·버프 템플릿과 그 판의 공식 클라.

### 假想敌：铳 공속 스택 (`kitGun`)
- **규칙**: 공격할 때마다, 대상이 마지막 대상과 다르면 스택을 비우고, 그다음 **항상** 1스택(+`2.attack_speed` 80, 최대 `2.max_stack_cnt` 5)을 더한다 →
  새 대상 첫 공격 뒤 공속 80, 같은 대상 n번째 공격 뒤 n스택. 공속 하한 20은 첫 공격 전에만 보인다. 공식 클라 `BrownbTalent_1.Apply`: 마지막
  대상과 다르면 `OverrideGroup.Clear` 뒤 대상 갱신, 이어서 무조건 `Entity.AddBuff(_stackBuff)`(프리팹 `Talents/2`, ATTACK_SPEED).
- 쿨다운 (2026-10-15): 스택은 공격이 대상에 시전되는 순간(`BrownbTalent_1.Apply`는 공격 어빌리티의 부착물 — 우리 'attack' 훅, 타격 순간) 붙고, 클라는
  공속이 바뀌면 도는 쿨다운의 진행 비율을 유지한다(`OnAttackTimeChanged`, 위 「일반 공격 타이밍」) → 휘두름에서 다음 휘두름까지
  t + (1 − t/T_old)·T_new(t = 휘두름 시작부터 타격까지, T = 4.5 × 100 / 공속). 우리 엔진은 남은 쿨다운에 T_new/T_old를 곱한다(2026-11-04부터 엔진 공통
  `units.js _recalc` — 키트는 공속만 바꾼다). 옛 추정 「그 공격의
  쿨다운을 휘두름 시작부터 새 공속으로 다시 잼」(새 대상 첫 공격 뒤 5.6 s)은 t = 0일 때만 같았다(관리자 노트의 공식 대조).
- **옛 동작**: 같은 대상일 때만 공격 **뒤** 1스택, 새 대상 첫 공격은 0스택 → 하한 20(다음 공격까지 22.5 s), 최대 스택이 한 타 늦음. 테스트
  `enemies_bosses.test.js` 「假想敌：铳: unblockable…」(3타 뒤 240, 휘두름 간격 = 위 식), 실제 판 경로 `boss-patterns-real.test.js` 「real boss_2 field…」.

### 假想敌：铳 【未尽的告解】 감쇠 대상 (`kitGun`, 2026-10-17)
- **규칙**: 히든 총은 나타난 뒤 **0.03 s에 한 번만** 동료 하나를 고르고, 감쇠(물리·법술 × `4.damage_scale` 0.2)는 **그 하나가 필드에 있는 동안만** 걸린다.
  고른 동료가 쓰러지면 다른 리드·총이 남아 있어도 영구히 풀리고, 다시 고르지 않는다. 0.03 s에 아무도 없으면 감쇠는 끝내 없다.
- 근거(EN 클라 2026-10-14 판): 공유 총 프리팹 `CommonAbilities/Ability0`의 `achunt_passive`(`triggerCnt` 1·`triggerInterval` 0.03) ON_BUFF_TRIGGER가
  총의 `BossSelector`(자기 진영, 버프 `achunt_mark` = 다른 총·“碎铳之簧” 셋, `_postFilter` HATRED_DES, 최대 1, 자신 제외)로 하나를 골라
  `achunt_mark_by_boss`를 주고, 그 버프의 ON_BUFF_START가 총에게 `achunt_summonee`를 **파생 버프**로 붙인다. `Buff.AddDerivedBuffSafe`가
  부모에 등록하고, 부모의 `OnFinish` → `ClearDerivedBuffsIfNot`이 파생 버프를 끝낸다. 감쇠 템플릿 `achunt_take_damage`(`Talents/4`)는
  총이 `achunt_summonee`를 가졌을 때만 `FilterDamageModifer`(PHYSICAL_AND_MAGICAL) → `ModifierScaleUp damage_scale`. HATRED_DES = 도발 × k − 출구까지
  남은 거리 → 도발이 같으면 출구에 가장 가까운 것(리드 피해 전달의 총 고르기와 같은 `hatredFirst`).
- 리드는 0 s, 총은 0.1 s(단독 판·2인 판 거울 총)·10 s(2인 판 첫 총)에 나오므로 보통 리드 하나(2인 판의 나중 총은 먼저 나온 총일 수도)가 골린다.
- 빼 둔 것: `achunt_passive` ON_OWNER_KILLED(`kill_achunt_mark_boss` = 선택기가 고른 하나 즉사). 총은 공유 풀이 0일 때만 쓰러지고 그때 모든 보스 필드가
  끝나므로 결과가 같다.
- **옛 동작**(upstream 이식 `708caf7d`, PRTS 문구 기준): 다른 총이나 리드 중 하나라도 살아 있으면 감쇠, 등장 첫 타부터. 테스트 `enemies_bosses.test.js`
  「隐秘核心 铳 未尽的告解…」 2건.
- **난이도별 차이 없음** (2026-10-17 확인): 총·리드는 enemy_database 레벨 0 하나뿐이고, 히든 템플릿 `h08_02`(협동)·`h08_02_s`(단독)를 일반·험지·초월이 같이
  쓴다(덮어쓰기도 같음 — 협동만 【最终之罚】 끔). 버프 템플릿 중 난이도 분기(`AutoChessCheckDifficulty`)는 `achunt_t_1`(FUNNY가 아니면 × `1.damage_scale` = 1,
  효과 없음)과 띠 효과 하나뿐. 난이도가 바꾸는 것은 수치뿐: 풀 크기(`bloodPoint`)와 라운드 적 효과(리드 HP·ATK, 총 ATK, 초월 이속 ×1.15).

### 假想敌：铳 【最终之罚】 돌진 속도·추적 (`kitGun`, 2026-10-18)
- **제보**: 총이 가끔 오퍼레이터를 향해 지나치게 빠르게 움직인다.
- **규칙**: 돌진은 적의 일반 이동이다(`ai.js updateEnemy`의 `e.trace`). 속도 = (기본 0.4 + `3.move_speed` 2) × 이동 배율 × 0.5칸/s — 상태가 없으면 1.2칸/s(평소의 6배),
  감속 50 % 0.6, 停顿 0.24, 束缚·失衡 중에는 멈춤. 일반 공격 없음.
  - 시전: Skills/1 선택기(아군 아무나, 비행 포함, 최소 1)가 있으면 쿨다운대로 쓴다. 대상 = 저지대·비행 아님·방어력 최고 하나(`TraceEnemy`); 없으면(비행 유닛뿐)
    곧바로 끝(쿨다운은 씀). 시전 때 공격 후 멈춤을 끊는다(모드 전환 `_restartFSM`).
  - 추적: 대상 칸까지 칸 길로 걷고, 그 칸에 길이 없으면 이웃 8칸 중 길이 가장 짧은 칸([ASSUMED] 같으면 위·아래·왼·오른·대각 순). 도착점 = 칸 중심 + 축마다
    ±0.4 균등 난수. 0.3 s마다 대상이 마지막 경로 때보다 √0.1칸 넘게 움직였으면 다시 길을 찾고(새 난수), 총이 그 칸 중심 0.4칸 안이면 돌진이 끝난다.
  - 대상이 필드를 떠나면(쓰러짐·철수) 추적만 끝난다: 돌진 상태(속도 +2, 공격 없음)는 속도 버프 15 s(`3.duration`)가 끝날 때까지 남고, 총은 그동안 자기 경로를 걷는다.
  - 화면 [실제 판 이상 없음 2026-10-28]: 돌진 중 모델은 `Skill_1` 클립으로 걷는다(form `charge`, `render/units.js` FORMS), 끝나면 fx `chargeEnd`(그림 없음)로 Default로 돌아간다.
- 근거(EN 클라 2026-10-14 판, Lua 핫픽스에 없음): 프리팹 `enm_pfb_28.ab` `enemy_9017_achunt` — `Skills/1`(버프 `achunt_s_1`: SwitchMode S1 →
  `TriggerAbilityUseSelector TraceEnemy`, 대상 없으면 SwitchMode 0), `Modes/S1/Body/Talents/3`의 패시브 버프 `achunt_s_1[speed]`(`attributeType` 6 MOVE_SPEED,
  `formulaItem` 0 = ADDITION, 블랙보드 값; `durationKey duration`; ON_BUFF_FINISH → SwitchMode 0), `_replaceAnimPairs` Move → Skill_1,
  `Modes/S1/Body/GeneralAbilities/TraceEnemy` = `SimpleTraceTargetAbility`(`_searchCoolDown` 0.3·`_traceRandomOffset` (0.4, 0.4)·`_updateDistSqrEps` 0.1·
  `_findNearbyReachableTile` 1·`_disableWhenReached` 1·`_reachedThreshold` 0.4·`_buffsWhenReachedTarget` `achunt_s_1[reached]` → SwitchMode 0). 공식 클라:
  `SimpleTraceTargetAbility.OnTick`(주기 타이머가 찰 때마다 `_UpdateTraceTarget` → `_CheckReached`), `_UpdateTraceTarget`(추적 대상이
  없거나 무효면 `_CleanTraceTarget`; 마지막 위치와 거리² > eps면 `_TryUpdateTraceTargetRoute`, 실패하면 Clean), `_CheckReached`(추적 **칸** 중심과의
  거리 ≤ 0.4 → 도착 버프 + Clean), `_TryUpdateTraceTargetRoute`(`Map.TryCalculatePathFindingDistance`, 안 되면 이웃 표 + `CheckGridValid`),
  `OnCastOnTarget`(길이 있으면 추적 켬, 없으면 Clean), `TracePositionCursor.ResetReachedOffset` → `RandomExtensions.RandomVector2`
  (축마다 −r + U·2r). ADDITION이 배율보다 먼저 더해지는 순서는 PRTS 「作战机制」 伤害计算 표(直接加算 → 直接乘算)와 같다.
- **옛 동작**: 시전 때 대상이 서 있던 점으로 직선으로 미끄러짐(칸 길·추적 없음, 막힌 칸에서 멈춤), 속도 = (감속이 걸린 이속 + 2) × 0.5 → 감속 50 %에서 1.1,
  停顿 1.04, 束缚 중에도 1.0칸/s(공식 0.6·0.24·0); 비행 유닛뿐이면 시전 안 함; 모델은 미끄러지는 동안 서 있는 자세.
- 테스트 `enemies_bosses.test.js` 「假想敌：铳 最终之罚…」 5건(속도·감속·停顿·束缚, 움직인 대상 추적·도착, 대상이 떠남, 비행 유닛뿐, 밟기 피해);
  골든 `boss-boss_2-solo`·`hidden-boss_9-solo`.

### “余音” 暗色 형태 이동 속도·【合奏】 (`setEchoForm`·`kitEcho`)
- **이동 속도**: 暗色(Depression) 형태는 이동 속도 **+20 %**(클라 프리팹 `Modes/Depression/Body/Talents/2`: MOVE_SPEED, MULTIPLIER +`2.move_speed` 0.2).
  옛 동작: −20 %.
- **【合奏】 규칙**: 余音의 SP = enemy_database spData `INCREASE_WHEN_TAKEN_DAMAGE`(피해 1회 +1, 최대 12, 시작 0) — 우리 `taken` 훅이 보는 피해 한 번
  (출처 무관, 원소 손상 제외)마다 +1. 余音마다 클라 프리팹 `Talents/4`(`acdums_skill_trigger`, 1 s 주기)가 **자기** SP를 검사해, 차 있으면 필드의 모든 余音에게
  `acdums_s_1[ability_trigger]`를 보내고 자기 SP를 비운다(`ClearEnemySp`). 받은 余音은 자기 형태의 합주를 하고 자기 SP를 비운다: 金 → `PassionSkill`(반경 0.8,
  凋亡 `4.ep_damage_ratio_passion`), 暗 → `DepassionSkill`(반경 1.6, `4.ep_damage_ratio_depassion`), 둘 다 ATK 100 % 법술. 시전 fx `enemySkill`의 `ability`가
  프리팹 능력 이름(렌더가 공식 이펙트를 붙임). enemy_database 스킬 `Skill`(쿨 5·첫 2)은 프리팹에 능력이 없어 쓰지 않는다.
- **행동 불능 余音** (2026-10-15): `[ability_trigger]`의 `TriggerAbilityUseSelectorMergeBB`(`_checkSrcCastable` 1)가 `Entity.inAbnormalState`(기절·빙결·수면)면
  false → 사슬이 멈춰 그 余音의 `ClearEnemySp`까지 가지 않는다(`IfElse`는 가지 결과를 그대로 돌려줌). 그래서 행동 불능인 余音은 합주하지 않고 **SP도 그대로**
  남아, 풀린 뒤 가득 차 있으면 1 s 안에 다시 전체 합주를 일으킨다. 발동시킨 余音(자기 주기 검사)은 행동 불능이어도 자기 SP가 비워진다(검사는 상태와 무관).
  옛 [ASSUMED]: 행동 불능 余音도 SP를 함께 비웠다. 테스트 「“余音” 【合奏】: an echo that cannot act…」.
- **옛 동작**: 余音마다 `Skill` 쿨다운(첫 2 s, 이후 5 s)으로 따로 합주. 테스트 `enemies_bosses.test.js` 「“余音” 【合奏】…」·「“余音”: 10-hit unit…」.
- SP 바 없음(2026-10-15 확인): 余音은 일반 등급(`rank` NORMAL)이라 공식도 일반 적 체력 바(`enemy_hp_slider`, SP 줄 없음)를 쓴다 — 보스 SP 바(`e.mem.lpSp`,
  render `hud-bars.js` 보스·거대 보스만)에 안 내보내는 지금이 공식과 같다.
- 피격 펄스(`echoHit`)는 그대로. 관·현의 일반 공격·스킬이 余音을 치는 것도 실제 피해 1회(2026-10-15, 아래 「假想敌：管·弦…」)라 SP·타수·형태 전환에 든다.

### 刺胄之弹 도착 장판 (`kitShell`·`shellZone`)
- **규칙**: 도착(죽음)하면 클라 투사체 `projectile_enemy_acstmr_s1`을 남긴다 — 수명 9.95 s, 범위 `x-4`(도착 칸 둘레 3×3), `_keepAlreadyHitTime` 1.0 s.
  그 안의 오퍼레이터(起飞 포함 — 탄은 비행, 迷彩 무시, 隐匿 제외: 다른 보스 범위 선택과 같은 `areaAlliesInTiles`)를 도착 즉시, 그 뒤 머무는 동안 유닛마다
  1 s마다 다시 친다: `killed.value` 400 무출처 물리(스플래시) + `killed.stun` 2.1 s 기절, 공로는 예전처럼 胄. 나중에 배치·이동해 들어온 유닛도 맞는다
  (머무는 유닛은 0·1·…·9 s에 10번). fx: 도착 `explode` + 장판 `zone`(kind `helmShell`, `dur` 9.95, `tiles` 'box'). 도착 `explode`는 쏜 보스가 살아
  있으면 `id`(보스)·`ability: '1'`(탄환을 태운 보스 스킬 투사체 `projectile_enemy_acstmr` — 렌더가 그 닿음 이펙트를 틂, rules/fx.md 「적 장판 — 污染秽蚀」).
- **비행 속도** (2026-10-31, 공식 클라에서 확인 — 작은 확인 넷): 탄환 적은 보스 스킬 `1`의 투사체 `projectile_enemy_acstmr`(`SummonEnemyBehaviour`)가
  소환한 `BObjectFollowerEnemy`이고 `_MoveByRoute`가 매 틱 주인 투사체의 자리를 그대로 받는다(주인이 없어지면 `Suicide`). 그래서 **투사체 속도
  0.45칸/s**(`TRACE_TARGET_WITH_SPEED`, `data/enemies.json` 스킬 `1`의 `proj.speed`)로 날고, 자기 이동 속도(0.5 × `MOVE_SCALE` = 0.25칸/s — 예전 sim)나
  감속은 쓰지 않는다. 투사체는 대상이 유효한 동안 대상 마운트 점을, 아니면 저장된 대상 자리를 쫓는다(`BasicMovement.GetTraceTargetMapPosition`) —
  오퍼레이터는 칸을 떠나지 않으니 쏠 때 대상 칸 그대로(`fireShell`). 골든: 필드 boss-boss_1-solo·pair, hidden-boss_8-solo·pair, 매치 coop4-ABYSS-7·
  coop2-NORMAL-8-serverrun(더 빨리 닿아 장판·격추 시점이 바뀜). 테스트 `boss-patterns-real.test.js`(실제 boss_1 판 0.45칸/s).
- **옛 동작**: 도착 순간 3×3에 있던 유닛만 `killed.duration` 10 s 기절 + 10회 DoT(`boss:helmShellDot`). 그 자리 유닛 기준 총 피해는 같았다.
- 斩胄之剑·破胄之锤의 돌진 폭발(`acstma_s_1[reach_target]`)은 공식도 도착 순간 스냅샷이라 그대로(`stunBlast`). 테스트 `enemies_bosses.test.js`
  「假想敌：胄 + 刺胄之弹…」.
- 【瘫痪】 뒤 '갑주를 베는 검'·'갑주를 부수는 해머' 복제는 공식에서 모드 2 `Back_End`(2026-11-03 프리팹 `enemy_9014_acstma`·`enemy_9015_acstmb`로 확인):
  첫 모드와 판정이 같다 — 패시브 `[unmovable]`(같은 이상 상태 플래그)·공격·掷剑(쿨다운 포함) 모두 같고, 등장 클립(`Back_End`, 대상 아닌 기본 방향)·시전 이펙트
  (`enemy_acstma_back_end`/`enemy_acstmb_back_end`)·소리만 다르다 → 시뮬은 복제를 첫 모드로 그대로 둔다(`bosses.js kitBlade`). 화면에는 복제가 이미 내던
  `kitHit`(`acstma:back`)에 형태 `backEnd`를 실어 알린다(2026-11-14, `setForm` — `e.form`은 그림 이름뿐이고 공격 시간은 `e.mode`라 판정·golden 그대로) →
  `fx.md` 「적 프리팹 모드별 능력 — 갑주 복제 Back_End」.

### 阿利斯泰尔 防护背心 방향 (`kitLion` 【莫非王土】)
- **규칙**: 조끼를 활성화할 때마다 막는 면이 번갈아 바뀐다(클라 버프 템플릿 `enemy_vtlionk_shld`의 `front` 토글) — 알리스테어 유닛마다 첫 조끼는 **앞면**(보스가
  바라보는 쪽), 그다음은 직전의 반대쪽. 5000 보호막이 남아 있는 동안 그 면에서 온 **물리·법술** 피해 ×(1 − `damage_resistance`).
- **면은 격자 열로** (2026-11-03): 공격자 칸의 열과 보스가 선 칸의 열을 비교하고, 같은 열이면 어느 면도 아니라 감쇠 없음. 진실 피해는 줄지 않는다(보호막은 그대로 깎임).
  근거: 템플릿 `enemy_vtlionk_shld` ON_TAKE_DAMAGE `CheckIfSourceGridPosFaceTargetGridPos`(`_targetColOffset` 0, `_faceIfSameCol` NONE) → `DamageScale`
  `_damageMask` PHYSICAL_AND_MAGICAL; 보호막 `BlockDamage`는 `_filterDamageType` false(모든 피해). 전에는 연속 x·모든 피해 종류였다. 테스트 「阿利斯泰尔 防护背心: the guarded side is by grid column…」.
- **첫 면 = 앞면** (관리자 결정 2026-10-15, 관리자 노트의 공식 대조): 보스 `CommonAbilities/Ability0`의 `enemy_vtlionk_unmove`에
  블랙보드가 없어 `front`가 0에서 시작 → 첫 조끼의 ON_BUFF_START가 1로 바꿈 → FRONT. 노드 `Execute`는 보스 `get_faceTo`를 4방향으로 맞춰 열을
  비교한다. 우리는 앞면 = 보스 경로가 처음 열을 바꾸는 쪽(`frontSide`): 공식 경로 (3,10) → (2,2)는 −x(열 번호가 작은 쪽). [ASSUMED] 출발점에서 기다리는
  동안 바라보는 방향 = 경로 방향(보통의 적과 같다고 봄, 공식 영상으로 확정 가능).
- **옛 동작**: 첫 조끼 +x([ASSUMED] 「오른쪽」, 2026-10-15까지), 그 전에는 조끼가 놓였던 칸이 보스의 어느 쪽인지로 면을 정했다. 테스트 `enemies_bosses.test.js`
  「阿利斯泰尔 防护背心…」, 실제 판 경로 `boss-patterns-real.test.js` 「real boss_6 field: the first 防护背心…」.

### 假想敌：管·弦 일반 공격·【裂管之奏】·회피 (`pipeCore`·`pipeBurst`·`kitPipe`·`kitString`, 2026-10-15)
- **일반 공격**: 사거리 전장 전체(PRTS 「攻击范围扩大至全场」). 클라 프리팹 `Modes/Default/Body/Attack`의 `_abilityConfigs` 둘을 차례로 시도 — 자기 형태
  余音(선택기 `_filterByEnemiesKey` enemy_9023_acdums, 관 `_enemyMode` 1 = 暗 / 현 0 = 金)이 있으면 그것(여럿이면 무작위, 예전 그대로), **없으면 오퍼레이터**
  (선택기 side ENEMY, `_postFilter` HATRED_DES — `aggroCmp`). 관은 세 발(`_additionalTimes` 2, `_triggerDelta` 0.25 s), 현은 한 발. 발마다 투사체가
  닿을 때 그 자리 반경 안 오퍼레이터에게 ATK 100 % 법술(凋亡 없음): 관 1.8(`projectile_enemy_acduml` CircleCollider2D), 현 1.6(`_acdumm`), 투사체
  `_hitNumType` INFINITY·`_onlyCheckHitWhenReachTarget`·`_ignoreCamouflage` → `areaAllies`. PRTS의 현 반경 3.0은 클라 값이 없다.
- **余音도 맞는다**: 투사체 `_alwaysHitTraceTargetInTheEnd` — 겨냥한 余音이 ATK 100 % 법술 피해 1회를 받는다(타수 1, 【合奏】 SP +1, 피격 펄스·형태
  전환 타수). 우리 `taken` 훅이 이 피해(태그 `echoStrike`)를 오퍼레이터 피해처럼 펄스로 센다. 그래서 관 혼자서도 暗 余音을 약 4번 공격(10타)이면 金으로
  바꾸고 그 뒤로는 다른 余音이나 오퍼레이터를 친다. 실제 판 14라운드(단독 험지) 余音은 17타 — SP 12를 채워 합주할 수 있다.
- **【裂管之奏】**: 暗 余音마다 세 발(0.25 s), 발마다 위 폭발(반경 1.8 법술 100 %, 余音 피격 포함) 뒤 스킬 `_activeBuffs` `acduml_s_1`이 맞은 유닛마다(余音 포함):
  `CreateBuffInCircleRange` 반경 블랙보드 `range_radius` 0.8(클라 `Execute`가 `GetFloatOrDefault("range_radius", 1.8)`) 안 오퍼레이터 모두(선택 가능 여부
  무관, PRTS 「无视其可选性」·「中点判定，可叠加」, 자기 포함)에게 凋亡 `ep_damage_ratio` 25 %, 그리고 그 유닛 자신에게 凋亡 25 %(`ApplyElementDamage`). 余音
  바로 위 오퍼레이터는 한 발에 凋亡 3번(余音 둘레·자기 둘레·자기). **余音 자신도 凋亡 25 %** (2026-10-15): `ApplyElementDamage.Execute`에 진영 검사가
  없고 余音의 `epResistance`·`epDamageResistance`는 0(공식 대조 4번; 모디파이어 적용 경로는 안 읽음). 余音의 凋亡 게이지·폭발은 엔진 일반 규칙(적 쪽 凋亡
  폭발: 虚弱 + 초당 元素伤害 — 그 피해 한 번이 타수 1·SP +1). 옛 [ASSUMED]: 余音은 凋亡 없음.
- **【断弦之奏】**: 金 余音마다 한 발, 위 폭발(반경 1.6, 余音 피격 포함) 뒤 `acdumm_s_1`: 맞은 유닛마다 凋亡 25 %(余音 포함 — 관과 같음, 2026-10-15), 余音은
  暗으로(`CheckEnemyId` → `SwitchMode` 1).
- **회피**: 관은 체력 50 % 미만일 때 물리·법술 회피 `1.prob` 10 %(템플릿 `acduml_t_1` `ON_TAKE_DAMAGE`: `FilterByTargetHpRatio` LT 0.5 → `Evade`
  PHYSICAL_AND_MAGICAL; PRTS 「自身生命值低于50%时，获得10%物理和法术闪避」). 매 틱 체력 비율로 `boss:evade`(`dodgePhys`·`dodgeArts`)를 켜고 끈다(卢西恩과 같은 방식).
- **옛 동작**: 일반 공격은 余音만 겨냥해 펄스만 냈다(관·현 자신의 피해 없음, 余音이 없으면 공격 안 함, 余音 타수·SP 안 셈); 【裂管之奏】은 0.4 s 간격, 폭발 반경
  0.8(블랙보드 값을 본 범위로 씀), 보조 凋亡 없음; 【断弦之奏】은 余音 피격 없음; 회피 없음. 테스트 `enemies_bosses.test.js` 「假想敌：管: whole-field…」·
  「假想敌：管 【裂管之奏】…」·「假想敌：管: below 50 %…」·「假想敌：弦: whole-field…」, 실제 판 경로 `boss-patterns-real.test.js` 「real boss_3 field…」.

### “碎铳之簧” 저지·조준·스킬·피해 전달 (`kitSpring`, 2026-10-15)
- **저지 불가**: 세 종류 모두 늘 저지 불가 — 클라 프리팹 `CommonAbilities/Ability0`의 `actrpa/b/c_passive`가 abnormalFlags [3] BLOCK_FREE(영구). 보호막과
  무관(PRTS 능력 문구 「护盾生效时，自身无法被阻挡」와 다르다). 영구 버프 `boss:unblockable`, 보호막 표시는 `boss:springShield`(플래그 없음).
- **조준**: 일반 공격과 스킬 `1`의 선택기가 `_postFilter` 8 DEF_DES — 사거리 안 방어력 최고, 같으면 `aggroCmp`(铳과 같음).
- **스킬이 일반 공격을 대신함**: SP = enemy_database spData `INCREASE_WHEN_ATTACK`(일반 공격 1회 +1, 최대 = spCost: 元素 4, 频次 2). SP가 차면 다음
  공격이 스킬 — 일반 공격 피해 없이 스킬만(엔진 `profile.deferHit`: 공격·쿨다운·'attack' 훅은 그대로, 'atk' 종류 `springSkill`은 렌더가 그리지 않음; 시전 fx
  `enemySkill` `ability` '1'). 그래서 元素는 4번 일반 공격 뒤 5번째, 频次는 2번 뒤 3번째가 스킬. 보호막이 깨지면 재생 버프 `actrpb/c_t_1[regenerate]`가 沉默을
  걸어 스킬이 안 나가고, 재생이 끝날 때 `ClearEnemySp` 뒤 보호막이 돌아온다 → 우리는 보호막이 있을 때만 스킬, 보호막이 돌아올 때 SP 0. 침묵(오퍼레이터)도 스킬을 막는다.
- **元素护盾 탄**: 스킬 프리팹 `Skills/1`(`_damageType` PHYSICAL, `_atkScale` 1, `_activeBuffs` `actrpb_s_1`) — 맞은 대상마다 ATK 100 % 물리 ×0.8^튕긴 횟수
  (투사체 `_atkScaleRatePerBounce`) + 침식 `ep_damage_ratio` 10 %(`actrpb_s_1` `ApplyElementDamage`, 감소 없음), 모두 `times` 4타. 튕김: 맞은 대상 둘레
  1.7(투사체 선택 원, `_ignoreRangeScale`) 안에서 0.7 s 안에 맞지 않은 다른 대상(`_keepAlreadyHitTime` 0.7), 없으면 같은 대상에게 다시(`_allowRepetitionIfNoTarget`).
  첫 발 15, 튕김 6 칸/s. 다음 대상은 선택기 `_postFilter` 0 ALL(정렬 없음)·최대 1 → 범위 조회의 첫 후보(2026-10-15, 옛 [ASSUMED] 가까운 순). [ASSUMED] 조회
  순서 = 필드의 아군 순서(`areaAllies` — 배치 순, 클라 범위 조회 순서는 못 읽음). 테스트 「“碎铳之簧” 元素护盾 bullet…」.
- **法术护盾 물리 감쇠·반격** (2026-10-15): 반격 템플릿 `actrpa_t_1` ON_TAKE_DAMAGE가 `FilterDamageModifer`(`_attackTypeFilter` NORMAL·`_damageMask`
  PHYSICAL)로 거른다 — 普通伤害 물리 피해만 ×`damage_scale` 0.1 + 그 출처에 무출처 물리 附加 `atk_scale`·침식 `ep_damage_ratio`. 스플래시(SPLASH 2)·
  附加(ADDITION 8)·상태 틱(BUFF 4)·무출처 피해의 물리는 그대로 들어가고 반격도 없다(클라 `Modifier.SourceAttackType`). 법술 흡수(`BlockDamage` MAGICAL)는
  공격 종류를 안 거른다. 엔진 대응은 맹약의 普通伤害와 같은 `damage.js isNormalDamage`(아래 「act2 맹약·장비 템플릿 대조」 공격 종류 거르기) — 일반 공격도
  스킬 타격도(공식 클라에서 확인 2026-11-03: 스킬 프리팹의 피해 노드 `_attackType`은 NORMAL 433·NONE 18·SPLASH 4·BUFF 3 — 공격이 아닌 스킬 피해도 NORMAL).
  이전(2026-11-03까지): `isAttack`이면서 `isSplash` 아님(가정) — 공격이 아닌 스킬의 물리 피해가 감쇠·반격 없이 들어갔다. 옛 동작: 모든 물리 피해 ×0.1 + 반격.
  테스트 「“碎铳之簧” 法术护盾 (9018)…」.
- **频次护盾은 모든 피해를 막는다** (2026-10-17): `actrpc_t_1`의 `BlockDamage`는 `_filterDamageType` false라 `_damageMask` PHYSICAL_AND_MAGICAL을 읽지
  않는다(`BlockDamage.Execute`: 취소되지 않은 피해 모디파이어면 종류 무관) → 물리·법술·진실·元素伤害를 가리지 않고 다섯 번 막고(막은 것마다 한 번) 깨진다.
  막힌 피해는 총에게 넘어가지 않는다. [ASSUMED] 원소 게이지 피해(元素损伤)는 피해 모디파이어가 아니라 세지 않는다(우리 엔진도 `hit` 전에 갈라짐).
  옛 동작: 물리·법술·진실만 막고 元素伤害는 통과·전달. 테스트 「“碎铳之簧” 频次护盾 (9020): every damage type…」; `playtest5_elements.test.js` 「a 无来源
  burst…」의 리드는 9018로 바꿈.
- **전달 몫도 공유 풀·限伤을 거친다** (2026-10-17 확인, 지금과 같음): 전달 노드 `FixedValueDamage`의 `_skipModifierEvent`는 `SKIP_MODIFIER_EVENT`를 세우지만
  `Entity.ApplyModifier`의 건너뜀 경로도 게임 모드 훅(`IGameMode` → 오토체스 보스 풀·限伤)을 지난다. 전달 몫은 PURE라 총의
  【未尽的告解】 감쇠를 받지 않는다 — 리드를 치면 총이 감쇠 없이 깎이는 것은 공식과 같다.
- **频次护盾 十连击**: `Skills/1` `_additionalTimes` 9·`_triggerDelta` 0.1 → 0.1 s 간격 열 발, 발마다 ATK × `atk_scale` 0.5 물리. 대상은 첫 발의 대상으로
  고정(`_selectTargetSource` INPUT_TARGET·`_selectTargetTiming` AT_BEGINING·`_interuptIfTargetDead` 0, `MultiRangedAttack.UpdateTargets`) — 도중에
  죽으면 남은 발은 버려진다(2026-10-15, 옛 [ASSUMED]: 다시 고름). 테스트 「“碎铳之簧” 频次护盾 十连击…」.
- **피해 전달**: `actrp*_passive`가 받은 피해(`hp_lose`)를 `BossSelector`(enemy_9017_achunt + `achunt_mark`, HATRED_DES, 최대 1)로 넘긴다(`actrpa_hp_trans`,
  PURE·무출처) — **총에게만**. 총이 둘이면(히든 2인 판 `boss_battle_multi_player`) HATRED_DES = 도발 × k − 출구까지 남은 거리(`Enemy.get_hatred`)라
  도발이 같으면 **출구에 가장 가까운** 총(2026-10-15, 옛 [ASSUMED]: 리드에게 가장 가까운 총; 동률은 먼저 나온 총). 히든 총 키: 클라 선택기는 적 키를
  정확히 비교하고(`LevelData.EnemyData.key`), 그 `key`는 enemy_database `prefabKey`에서 온다 — `enemy_9017_achunt_2`의 prefabKey = `enemy_9017_achunt`라
  맞는다(공식 대조 9번, 옛 「못 읽음」). 테스트 「“碎铳之簧”: with two 假想敌：铳…」.
- **옛 동작**: 보호막이 있을 때만 저지 불가, 조준 우선순위 없음; 스킬은 (spCost+1)번째 일반 공격에 **덧붙음**; 탄은 침식만 0.85씩 감소·반경 2·같은 대상
  재타격 없음; 十连击은 도착 때 한꺼번에 10타; 받은 피해는 총 + 다른 리드들에게 나눠(도감 문구 [ASSUMED]). 테스트 `enemies_bosses.test.js` 「“碎铳之簧”…」 8건,
  `feedback1e-healers.test.js` 「E2 audit…」(리드는 보호막이 깨져도 저지 안 됨), 실제 판 경로 `boss-patterns-real.test.js` 「real boss_9 field…」.

### 盐风主教昆图斯 【断裂生殖】 子代 (`kitBrood`, 2026-10-15)
- **무엇이 나오나**: 스킬 `SummonTentac`(블랙보드 `branch_id` `dslily_dstnta`)이 레벨 분기의 `ACTIVATE_PREDEFINED`대로 템플릿에 숨어 있던 장치
  子代 `trap_039_dstnta`를 켠다 — i번째 시전에 분기 i번째 단계(#1 → #2 → #3 → #4 → #4·#3 → #2·#1 → 넷 다), 여덟 번째 시전부터는 아무것도 켜지
  않는다(프리팹 `MoveNextLevelBranch` `_isLoop` false — 클라 `Scheduler.BranchRuntime.TryPickNextPhase`가 마지막 단계를 지나면 실패; 2026-10-15까지는
  마지막 단계를 계속 다시 켰음, 테스트 「断裂生殖 walks the branch…」). 장치 자리는 보스 몸 네 귀퉁이(레벨 5,9·5,11·3,9·3,11).
  이미 켜져 살아 있는 子代를 다시 켜면 **새 子代로 바뀐다** — `Scheduler.TryActivePredefined` → `BattleController._CreatePredefinedCharacter`가
  `CreateToken`으로 새로 만들고 `Tile.ClearCharacterIfExists`로 그 칸의 유닛을 지운 뒤 세운다 → 유체 12 s·수명 35 s를 다시(셋째 형태의 쿨 18 s가 수명보다
  짧아 생김; 2026-10-15, 옛 [ASSUMED]: 아무 일 없음, 테스트 「断裂生殖: switching on a 子代 that is still alive…」). 수치는 waves.json 템플릿 `devices[]`(build-data
  `templateDevice`: character_table HP 3000·ATK 150, 숨은 天赋 `1.grow_duration` 12·`1.duration` 35, 스킬 `sktok_dstnta` SP 1·`ep_damage_ratio` 1).
  적 진영 유닛(부품 `part`: 처치 수·LP·보상 없음, 시간 초과 때 누수 아님). 라운드 적 효과의 HP·ATK 배율은 **받지 않는다**: 룬 `enemy_attribute_mul`
  (`EAttribuesMul : BasicEnemyRune`, `RuneManager._RegisterRuneClasses`)은 `DoPreprocessEnemy(EnemyData, Enemy)`뿐 — 子代는 character_table 토큰
  (`Trap`)이다(2026-10-15, 옛: 다른 소환물처럼 `summonMods`; 急行军 이속은 정지 토큰이라 무관). 테스트 「the round's enemy HP / ATK effects do not reach…」.
- **유체**: 12 s 동안 隐匿(클라 토큰 프리팹 `Modes/Default/Body/Passive`: INVISIBLE, 기절·침묵·빙결 면역). PRTS의 10 s는 클라 값과 다르다. 그 뒤 Grow 능력
  (Start_02 1 s): 시작에 隐匿이 풀리고(`ON_CAST_START`) 끝에 GrowUp 모드(`ON_CAST_END`, 면역도 함께 사라짐). 오퍼레이터는 隐匿이 풀린 뒤 공격할 수 있다
  (character_table 「可以受到我方攻击」), 받은 피해는 보스에게 넘어가지 않는다.
- **摄食**: GrowUp에서 SP +1/s, 1이 차면(성장 끝 1 s 뒤) 자기 둘레 반경 1.0(스킬 Trigger CircleCollider2D — 자기 칸과 상하좌우, PRTS 「周围四格」) 안에서
  가장 가까운 오퍼레이터 1명(`DIST_TO_SOURCE_ASC`, 도발 무시)을 붙잡는다. 공격 이벤트를 기다려(`_waitForAttackEvent`: Attack_Begin 0.833 s + Attack_Loop
  0.1 s) 첫 타, 그 뒤 1 s마다(`_triggerDelta`) ATK 100 % 물리 + ATK × 1.0 신경 + 1 s 기절(`trap_tentac_s[stun]` — 그 `durationKey` `#duration`은 어느 블랙보드에도 없는 키라 버프 `lifeTime` 1 s, 공식 클라에서 확인 2026-11-03: 블랙보드
  조회는 키를 글자 그대로 비교). 능력이 `ChannelingMeleeAttack`이고
  `_selectTargetTiming` 1 = BEFORE_SPELL_START라 **매 타 전에 원 안 가장 가까운 오퍼레이터를 다시 고른다** — 더 가까운 오퍼레이터가 오면 갈아타고, 대상이
  떠나면 다음 타에 원 안의 다른 오퍼레이터(2026-10-15, 옛 [ASSUMED]: 처음 대상만, 반경 밖이면 끝). 대상이 죽거나(`_interuptIfTargetDead` 1, 철수 포함)
  子代가 기절·침묵되면(`_canSilenced`) 끝나고, [ASSUMED] 타 순간 원 안에 아무도 없어도 끝난다(기본 경로라 안 읽음) — SP 0부터 → 1 s 뒤 다시 고른다.
  테스트 「子代 摄食: every hit picks…」.
- **공격 속도 대조**(2026-10-16, 관리자 제보 「수정 뒤 공격이 너무 빨라진 느낌」; 본체 쪽 결론은 2026-10-21에 틀린 것으로 확인 — 공식은 보스 스킬이
  일반 공격 **대신** 나간다, 「적 스킬 = 일반 공격 차례」): 子代 쪽은 공식과 다른 곳 없음. 摄食 간격은 공격 속도를 받지
  않는다 — `ChannelingMeleeAttack.DoSetData`가 `m_triggerDelta`를 블랙보드 `interval`(이 스킬엔 없음)에서, 없으면 프리팹 `_triggerDelta` 1.0으로 정하고
  `OnWaitForTriggerDelta`는 그 값 그대로 `WaitForFixedSeconds`. 한 번 붙잡으면 계속 문다: `CheckAnotherSpell` = 남은 `m_duration` > `_postDelayChecker`(1.0),
  `m_duration`은 블랙보드 `duration`이고 `SkillData.InitIfNot`이 스킬 `duration`(999999)을 블랙보드 `duration`으로 넣는다(그래서 한 시전 한 타가 아님).
  퀸투스 본체의 일반 공격은 3.5 s마다 2명(enemy_database `baseAttackTime` 3.5·`attackSpeed` 100; `Attack` 클립 1.667 s라 `_maxAnimScale` 1로도 늘어나지
  않음)이고, 셋째 형태 【大潮】 쿨 3.5 s(`TidewaterG2`)도 표 그대로다. 실제 판 경로 240 s 측정에서 본체 간격은 이 수정 전후 모두 3.5 s뿐 —
  빨라 보이는 것은 1.4.4에서 새로 생긴 子代의 1 s 摄食(형태가 오를수록 동시에 최대 넷)이다.
- **철수**: 나타난 지 35 s에 스스로 사라진다(`trap_tentac[withdraw]` = `suicide_after_buff[switch_to_dead]`, 처치 아님).
- **그림**: 공식 토큰 모델(`pkgrps/btl_pfb_tokens_0`의 Spine, 로컬 추출 `spine/token/trap_039_dstnta`) — 형태 'larva'(Start_01 → Idle_01), 'grown'(Start_02 →
  Idle_02/Die_02), 'feed'(Attack_Begin → Attack_Loop), 'fed'(Attack_End → Idle_02). 공식 이펙트(탄생·대기·Grow·摄食)는 docs/rules/fx.md 「보스 토큰·장비 이펙트」.
- **옛 동작**: 장치 칸 반경 1 안 오퍼레이터에게 5 s 기절 한 번(피해 없음, 남는 유닛 없음, [ASSUMED] 값). 테스트 `enemies_bosses.test.js` 「子代…」 3건·
  「盐风主教昆图斯…」, 실제 판 경로 `boss-patterns-real.test.js` 「real boss_4 field…」.

### 阿利斯泰尔 王权号令 장비 줍기·【莫非王土】 黄金回响 (`kitLion`·`kitEquip`·`kitGolden`, 2026-10-15)
- **떨어지는 칸**: 【王权号令】 투사체 `projectile_enemy_vtlionk_s1`의 칸 선택기(`ACT37SIDE_EQUIP`)는 십자 다섯 칸 중 장비가 이미 놓인 칸(`act37side_equip`)과
  장비를 든 오퍼레이터의 칸(`enemy_vtmstr_equip_char[mark]`)만 뺀다 — **오퍼레이터가 선 칸에도** 떨어진다. 선택기 옵션(`TileSelector.Options.Verify`)은 높이를
  보지 않으므로 고지대 칸도 된다(장비 버프 `enemy_vtmstr_equip_tr`도 HIGHLAND 칸을 따로 다룸). 건설형·통행도 보지 않고(`allowNoneBuildableType` 1,
  `buildableType`·`passableMask` 0) 칸의 advanced 마스크에 DEFAULT(1)가 있어야 한다(`advancedBuildableMask` 1): `TileData` 기본값 1, 이 모드 타일 중
  `tile_deepsea`만 DEEP_SEA(2) → **深水区만 빠지고, 오퍼레이터가 설 수 없는 칸(`tile_forbidden`·`tile_fence_bound`)에도 떨어진다** — 관리자 결정 2026-10-15
  「공식대로」(공식 대조 13번). 그 장비는 아무도 못 줍고 남아 【莫非王土】 대상이 된다. 이 모드 지도에는 구멍·벽 칸이 없다. 옛 [ASSUMED](2026-10-15까지):
  유닛이 설 수 없는 칸(`groundPassable`도 원거리 `canStand`도 아님)은 뺐다. 테스트 「阿利斯泰尔 王权号令: a piece drops on a tile no operator can stand on…」.
- **줍기**: 장비마다 자기 칸(범위 `0-1`)에 오라(프리팹 `Talents/2`)가 있어, 그 칸에 선 오퍼레이터에게 `[char]` 버프를 준다 — 언제든(나중에 배치·재배치·이동해
  들어와도). 대상은 모든 직군의 오퍼레이터(직군 마스크 639: 소환물·장치 제외), 지상(`targetMotion` WALK_ONLY: 起飞 제외). 이미 장비를 든 오퍼레이터는 안 줍고
  장비는 그대로 남는다. 주우면 그 전투 동안 지니고 장비는 사라진다(InstantKill, 처치 아님) → 【莫非王土】의 활성화 대상이 준다.
  - 未装配刀片: ATK ×(1 + `2.atk` 0.3). 防护背心: DEF ×(1 + `2.def` 0.3).
  - 冲击式施术单元(`B_disarm[char]` → `B_attack_disarm[char]` → `B_instant[char]`): 스킬을 쓸 때마다 장전, 그 뒤 적에게 준 첫 피해가 `2.work_time` 0.1 s 창을
    열고, 그 피해와 창 안의 다른 피해마다 무출처 법술 `2.value` 800(`NoSourceDamage` `_multiplierByKey` false → `cnt`를 읽지 않음, ×1) + `2.not_combat` 10 s
    战栗. 800은 무출처라 다시 장전·창을 건드리지 않는다. 원소 손상은 이 「준 피해」에 들지 않는다(원소 피해는 `ON_AFTER_OUTPUT_ELEMENT_DAMAGE` 83만, 장비 템플릿은
    `ON_OUTPUT_DAMAGE` 11만 들음). 둘 다 공식 대조 14·15번(옛 [ASSUMED]).
- **黄金回响**: 【莫非王土】가 冲击式施术单元을 활성화하면 `enemy_vtlionk_s2`가 그 장비 칸에 `trap_185_vtlntw`(SpawnTokenOnTargetTile, 레벨 1 PHASE_0)를 놓고
  장비를 지운다. 적 진영 장치(토큰 프리팹 `_sideType` ENEMY, `pkgrps/btl_pfb_tokens_1`): HP 8000·ATK 425·DEF 150·RES 70(character_table), 일반 공격
  3.8 s마다 범위 `x-1`(자기 칸에서 맨해튼 2 이내 13칸) 오퍼레이터 1명(엔진 순서 저지자 → 도발 → 최근 배치 = HATRED_DES)에게 ATK 100 % 법술(Attack
  `_damageType` MAGICAL), 탄 `projectile_trap_vtlntw`(추적 10칸/s), 공격 클립 1.633 s·OnAttack 0.6 s(토큰 모델). 수명 없음 — 부서질 때까지 남는다(오퍼레이터가
  공격할 수 있음). 움직이지 않고 저지하지도 저지되지도 않는다. 부품(`part`: 처치 수·LP 없음, 시간 초과 때 누수 아님). 수치 경로: enemies.json 알리스테어
  `devices[]`(build-data `ENEMY_SKILL_DEVICES` — 연결은 클라 버프 템플릿에만 있음). 라운드 적 효과의 HP·ATK 배율은 子代처럼 **받지 않는다**(토큰 `Trap` — 적 룬은
  `Enemy`만; 2026-10-15, 옛 [ASSUMED]: `summonMods`로 받음).
  그림: 공식 토큰 모델(로컬 추출 `spine/token/trap_185_vtlntw`), 공식 이펙트와 장비 든 오퍼레이터의 버프 이펙트는 docs/rules/fx.md 「보스 토큰·장비 이펙트」.
- **옛 동작**: 빈 낮은 칸에만 떨어지고 아무도 줍지 않았다. 冲击式施术单元 활성화는 [黄金回响 대체] 보스의 다음 공격을 법술 + 3 s 缴械로 바꿨다. 테스트
  `enemies_bosses.test.js` 「阿利斯泰尔 冲击式施术单元…」 2건·「阿利斯泰尔 equipment…」·「阿利斯泰尔 王权号令: a piece may drop…」, 실제 판 경로
  `boss-patterns-real.test.js` 「real boss_6 field…」.
- **【莫非王土】 고르는 순서** (2026-10-15): 프리팹 `store`/`storeA`는 `AbilitySelectableGroup` — `_DoCastInternal`이 설정 순서대로 시전을 시도해 처음
  되는 갈래를 쓴다. 스킬 발동 조건(`GroupTrigger` AT_LEAST_ONE)은 「검(`enemy_vtmstr_mark[sword]`)이 있고 **그리고**(ALL) `hasSword` 원 안에 오퍼레이터」 또는
  「검이 아닌 장비(`mark[not_sword]`)가 있음」. ① `hasSword`(트리거 = 원 안 오퍼레이터, 반경 1 × `_scaleble` — [ASSUMED] 배율 = 보스 사거리 3.4, 검 탄이
  고르는 `s2range`와 같은 범위)는 놓인 장비 **아무거나**(`enemy_vtmstr_equip_tr`)를, ② 아니면 `noSword`가 조끼·冲击式施术单元(`mark[not_sword]`)을 고른다.
  배율 3.4 확인(공식 대조 11번): `EnemySkill.AssignData`가 스킬 블랙보드 `range_radius`, 없으면 `GetModeRangeRadius` = enemy_database
  `rangeRadius` 3.4 — `store`/`storeA`에 `range_radius` 없음.
  둘 다 HATRED_DES 최대 `max_target`(≤50 % 2) — 장비는 움직이지 않아(moveCursor 없음) 위협도가 모두 같고, 동률은 `WeightedTarget.CompareTo` →
  `Entity.CompareTo`(`instanceUid` 오름차순)라 **가장 오래된 장비 먼저**(2026-10-15, 옛 [ASSUMED]: 가장 최근 장비 먼저). 그래서 사거리 안에 아무도 없으면 검을
  건너뛰고 조끼·충격식을 쓰며, 검만 있으면 발동하지 않고 검은 남는다; 주기가 왔는데 고를 것이 없으면 고를 수 있게 되는 즉시 발동(클라는 트리거형)
  [ASSUMED 주기 자체는 그대로]. 옛 동작: 사거리와 무관하게 가장 최근 장비 — 아무도 없을 때 검이 헛돌고 사라졌다. 테스트 「阿利斯泰尔 莫非王土 order…」 2건.

## 캐주얼 규칙 모드의 리더 피해 상한 완화 (2026-10-15, 관리자 결정)
- 공식 限伤(보스전·숨겨진 핵심에서 리더에게 들어가는 `ceil(최종 피해) ≥ 300000`의 한 방은 통째로 무효, `server/sim/damage.js leaderHitLimit`, `docs/research/11-limits-official.md` §2)은 클래식 규칙 모드에서 그대로다.
  캐주얼 규칙 모드는 이 상한을 무효 대신 절삭으로 바꾼다(관리자 결정 2026-10-15, `ui.md` 「규칙 모드 — 클래식·캐주얼」; 공식에는 없는 규칙): 보스전 spec의 `flags.bossHitClamp`(`shared/ruleset.js simRuleFlags`)가 있으면 `leaderHitLimit`가 그런 한 방을 `min(피해, 300000)`으로 들여보낸다 — 리더 HP·공유 풀에 300,000이 들어가고 공로·BOSS_HIT 방송도 그 값으로 센다. 30만 아래의 한 방은 그대로, `ceil`이 선에 닿는 299999.2 같은 값도 올리지 않는다. 판정 위치는 클래식과 같다(모든 배율 뒤, 보호막 앞; 부위가 넘기는 `loseHp`도 같음, 胄 드론 연결 몫은 예외). 무효가 아니므로 `hitCap` fx는 보내지 않는다.
  같은 날 처음 구현은 상한을 아예 껐다(큰 한 방이 그대로 들어감); 관리자 결정으로 같은 릴리스 안에서 절삭으로 바꿨다.
- 플래그는 공식 값과 다를 때만 붙어 클래식 보스전의 spec은 바뀌지 않는다. 브라우저 전투(`clientCombat`)와 서버 검증이 같은 spec을 읽는다.
- 커스텀 규칙 모드(2026-10-18, 관리자 결정)는 상한 값(`flags.bossHitLimit`, 100,000–5,000,000)과 「제한 없음」(`bossHitLimit: 0`)을 더하고, 999중첩 상한도 풀 수 있다(`flags.noLayerCap`) — `shared/constants.js bossHitLimitOf`·`layerCapOf`, 규칙은 `ui.md` 「규칙 모드 — 커스텀」 전투.
- 확인: `test/match/ruleset-match.test.js`(실제 판, 999층 炎 보드 + 피해 ×2000: 최종 공세·숨겨진 핵심 모두 리더가 받은 가장 큰 한 방이 정확히 300000, 공유 풀 공로도 300000을 넘지 않고 `hitCap` 0), `test/sim/playtest6_limits.test.js` 「限伤 with the 休闲 ruleset's flags.bossHitClamp」(299999 그대로 · 299999.2 그대로 · 500만 → 300000 · `loseHp`도 절삭), 클래식은 그대로 `test/match/playtest6-limits.test.js`.

## 나무 버든비스트 승객 (2026-10-16, 관리자 제보, 클라 `DurbusAbility`)
- 대상: 일리온의 나무 버든비스트(伊利昂的木驮兽 `enemy_10159_mntrjn`, 엘리트·기계, 수배·특이 III `enemyeffect_16_8`). 도감 「无法被阻挡，可以装载最多5名乘客，
  每名乘客使移动速度下降一定比例」, 재능 블랙보드 `bus.max_cnt 5`·`bus.move_speed −0.2`·`bus.half_cnt 2`.
- 원본·옛 동작: 저지 불가만 있고 승객이 없었다(「passengers n/a」).
- 공식(EN 클라 프리팹 `Talents/bus` = `DurbusAbility`, 버프 템플릿 `enemy_mntrjn_add`·`_reduce`·`_mark`; 핫픽스 없음):
  - 탑승: `OnTick`이 버든비스트가 기절·빙결·부유·수면이 아닐 때 매 틱 `_SearchPassengers` — 승객이 `max_cnt` 미만이면 Selector
    (`CircleCollider2D` 반경 0.5, 같은 편, 자기 제외, `machine` 태그 제외, 선택 불가 제외)·TargetValidator(`_enemyLevelMask 3` = 일반·엘리트만,
    리더 제외; `_motionMask 1` = 지상만)로 고른 적을 태운다. 탄 적은 `SetDisappeared` — 필드에서 사라져 움직이지도 행동하지도 않는다.
  - 감속: 승객마다 `enemy_mntrjn_add` → `enemy_mntrjn_move[stack]`(MOVE_SPEED MULTIPLIER, 블랙보드 `move_speed`) 한 스택. MULTIPLIER는 더해지므로
    1 + n × (−0.2), 5명이면 0 → 속성 하한 0.1(PRTS 数值范围 MOVE_SPEED 최소 0.1).
  - 하차: 버든비스트가 필드를 떠날 때(`OnDetached` → `ReleaseAllPassengers`: 격파·도달·그 밖의 제거) 모든 승객이 그 위치 ± `_randomOffsetBound` 0.2
    (축마다 균등)에 내려 버든비스트의 경로를 그 진행 지점부터 잇는다(`_useHostRoute`, 경로 + `cursorIndex`). 도달했으면 출구에서 내려 곧 도달한다.
    하차마다 `enemy_mntrjn_reduce`가 감속 한 스택을 되돌린다. 탑승·하차 이펙트 없음(`_effectWhenAddPassenger`·`_effectOnPassengerWhenRelease` 빈 값).
  - 외형: `enemy_mntrjn_mark`가 스택 수로 스파인 스킨 `default` → `half`(`half_cnt` 2 이상) → `full`(`max_cnt`)을 고른다.
- 로컬(`server/sim/content/enemies/special.js` `kitBus`): 위 규칙 그대로. 승객은 `hidden`(스냅샷에서 빠짐)·`pauseUntil = ∞`로 멈추고, 하차 때 버든비스트의
  경로 구간(`legs`·`legIdx`·`waitLeft`)을 복사한다. 감속은 버프 `ab:bus` 하나(`moveMul = max(0, 1 + n × move_speed)`), 하한 0.1은 엔진 전역 하한
  (아래 「이동 속도 하한 0.1」)이 맡는다. 클라처럼 탄 채로 사라진 승객의 스택은 남는다.
  [추정] 원 안에 여럿이면 가까운 순(같으면 먼저 나온 적), 적의 판정 반경 없이 중심점 거리. 버든비스트가 숨어 있는 동안(DISAPPEAR 구간)은 태우지 않는다.
- 외형(로컬): 시뮬이 스택 수를 모델 형태 `half`(2 이상)·`full`(5)·없음으로 낸다(`e.form`, 소리·그림 없는 `phase` fx `kind: 'passengers'`; 스냅샷
  `UnitInfo.form`이라 나중에 만든 화면도 그 형태로 시작). 렌더는 `render/units.js` `SKIN_FORMS`로 그 형태를 같은 스켈레톤의 스파인 스킨으로 입힌다
  (`SpineActor.setSkin`: 기본 스킨 = 자전거와 운전자(GuysA), `Half` = 승객 둘(GuysB·GuysD), `Full` = 다섯(GuysB~GuysF); 클립은 그대로).
  격파·도달로 모두 내리면 기본 스킨으로 돌아간다([추정] 쓰러지는 동안 승객 모습이 사라짐 — 하차마다 스택이 줄고 `mark`가 스택 수로 스킨을 고르므로; 쓰러지는 중에도 `mark`가 도는지는 안 읽음).
- 확인: `test/content/enemies_bosses.test.js` 「enemy_10159_mntrjn …」 6건(탑승 대상·감속·최대 5명·기절 중 안 태움·격파 하차·도달 하차·형태),
  `test/sim/bus-passengers.test.js`(실제 판: 수배 카드 → 실제 웨이브에서 탑승·감속·격파 하차), `test/render/bus-skin.test.js`(실제 스켈레톤에서
  스킨별 승객 슬롯, 형태 fx → 스킨, 나중에 만든 화면). golden: 이 적이 나오는 roster-012·roster-033·standin-05가 움직였다(형태 fx 2개씩). [화면 미확인]

## 이동 속도 하한 0.1 (2026-10-16, PRTS 数值范围)
- 공식: PRTS 数值范围 MOVE_SPEED 최소 0.1, PRTS 游戏数据基础 移速의 이동 속도 하한 0.1. 감속·MULTIPLIER가 아무리
  겹쳐도 이동 속도 속성은 0.1 아래로 내려가지 않는다.
- 원본·옛 동작: 하한 없음(`moveSpeed = max(0, …)`): 停顿(×0.2)에 감속이 겹치거나 喷气人의 −90 % 제동이 걸리면 0.1보다 느리게 걸었다. 나무 버든비스트
  키트와 望의 连星 감속(`op-wang.js` `addWangSlow`)만 자기 감속에 하한을 따로 뒀다(望의 것은 그대로 둠: 엔진 하한과 결과가 같다).
- 로컬(`server/sim/units.js` `moveSpeedOf`, `constants.js` `MOVE_SPEED_MIN`): 기본 이동 속도가 0보다 큰 유닛의 최종 이동 속도를 0.1 이상으로 올린다.
  `noMove` 상태(束缚·地面束缚·형태 전환 정지)는 0 그대로 — 이동은 그 플래그에서 먼저 멈추고(`ai.js`), 키트의 「멈춰 있음」 판정이 0을 본다. 기본 0인
  고정 적은 0 그대로.
- 확인: `test/sim/playtest6-combat.test.js` 「移动速度 never drops below 0.1 …」. golden: roster-005·011·015·016·018·020·021·027·033·036·038·043·044·045·046,
  bond-deputShip-high·bond-swiftShip-low, fields 보스 13개(boss_1~6·hidden-boss_8~10), matches 8개, standin-04·05·08, diy-005·009가 움직였다
  (0.1 아래로 느려지던 적이 그만큼 빨라짐).

## upstream 0.2.5–0.3.1 버그 수정 이식 — 전투 (2026-10-17)

upstream v0.2.4 뒤 버그 수정 커밋 중 우리에게도 같은 버그가 있던 전투 쪽(관리자 결정 2026-10-17). 패치가 붙으면 그대로, 아니면 손으로 옮겼다.

### 忍冬 追凶은 첫 타에도 추가 피해 (upstream `b87fcb3a`)
- 문제: 忍冬(오퍼레이터) 재능 追凶이 적마다 첫 피해 순간을 기록만 하고 돌아가 첫 타에는 법술 추가 피해가 없었다.
- 근거: PRTS 忍冬 재능 备注(첫 피해도 추가 피해를 받음). 수치는 생성된 재능 블랙보드(`atk_scale` 0.3, `interval` 10) 그대로.
- 동작(upstream 그대로): `kits/ops/chess_char_3_18-vulpis.js` — 첫 피해에 시각을 기록하고 같은 순간 추가 피해까지 준다. 10초 창은 그 첫 피해부터 고정
  (다시 맞아도 늘지 않음), `vulpisHunt`·`addition` 태그와 재진입 가드는 그대로.
- 테스트 `test/content/vulpis-first-hit.test.js`(upstream 그대로: 두 형태·모듈·스킬 전부의 첫 타, 적별 창), `test/content/kits_t3.test.js`(频次형 적: 모든 공격에
  추가 1회). golden: roster-007·009·026·039, bond-soloShip-low·bond-yanShip-low, matches coop2-NORMAL-3·coop3-ABYSS-5·coop4-ABYSS-7·
  coop2-NORMAL-1-coverage-standins(忍冬이 나오는 판의 첫 타 피해가 늘어 처치·이후 선택이 바뀜).

### 风丸 <替身> 상태는 공중 적도 친다 (upstream `e54ac351` 중 风丸 부분)
- 문제: 风丸(오퍼레이터) 특성 <替身> 상태에서도 근접 프로필의 `canHitFly` false 그대로라 사거리 안 비행 적을 무시했다.
- 근거: PRTS 风丸 특성 备注 「<替身>状态下可对空，由技能产生的召唤物不可对空」. 归溟幽灵鲨의 替身은 평타가 없다(`dollNoAttack`, 그대로).
- 동작(upstream 그대로): 키트 `chess_char_2_11-kazema.js`의 `trait: { dollHitsFly: true }`, `targeting.js canTargetEnemy`가 그 플래그 + `unit.trait.doll`(替身
  상태)일 때 비행 적을 대상으로 둔다. 본체와 S2가 소환한 替身(자기 프로필을 가진 소환물)은 여전히 못 친다. upstream 같은 커밋의 보상 제안 유지 부분은 받지 않음
  (보류 — 관리자 결정 2026-10-17).
- 테스트 `test/content/kits_t1t2.test.js` 「2_11 风丸: the trait's <替身> hits air units …」(upstream 그대로). golden 변화 없음(风丸 替身이 비행 적을 만나는 판이 없음).

### detmath `powi`의 0 밑 부호 (upstream `ad7e3e98`)
- `server/sim/detmath.js powi`가 밑이 ±0일 때 `Math.pow`의 정확한 값을 돌려준다((−0)¹ = −0, (−0)⁻¹ = −∞ — 배정밀도 두 겹 합이 −0 부호를 잃던 것).
  실제 판에는 안 생긴다(호출부의 밑·지수가 음이 아님). 테스트 `test/sim/detmath.test.js`, golden 변화 없음.

### 점 적의 칸 = 짝수 쪽 반올림, 적은 필드 가장자리 2^-20 안쪽 (upstream `119a0488`)
- 문제: 점 적(거대 보스 아님)의 칸을 `Math.round`(.5는 올림)로 셌고, `_clampPos`가 적을 정확히 필드 가장자리(`c1 + 0.5`·`r1 + 0.5`)에 묶어, 오른쪽·아래
  가장자리로 밀린 적이 필드 밖 칸(열 `c1 + 1`·행 `r1 + 1`)으로 판정되어 범위 칸에서 빠졌다.
- 근거: PRTS 作战机制 「受击方坐标经round函数取整(四舍六入五成双)得到其所属格坐标」. 클라 `FP.Round`도 .5에서 짝수(위 「盟约·특질·장비·생성기 2라운드」의 탄 수 `RoundToInt` 항목).
- 동작(upstream 그대로): `detmath.roundHalfEven`을 `body.js`(`posKey`·`bodyOnTile`·`bodyTileReach`)·`battle/queries.js` 적 색인·`targeting.js tileKeyOf`에.
  `battle/spawns.js _clampPos`는 가장자리에서 `FIELD_EDGE_INSET`(2^-20칸, `constants.js`) 안쪽에 묶어 가장자리 적이 늘 가장자리 칸에 선다.
  `Math.round(x.x / x.y)`를 쓰는 다른 곳(ai·blocking·deploy·economy·devices·bosses·적 키트·오퍼레이터 키트 등 50곳 남짓, 아군·장치 칸이 대부분)은 upstream도
  바꾸지 않아 그대로 둔다.
- 테스트 `test/sim/hit-tile-round.test.js`(upstream 그대로), 필드 밖 좌표에 탐침을 두던 `test/content/kits_t6.test.js` 异客 S3 한 줄을 필드 안으로(upstream 그대로).
  golden: roster-035·standin-04(가장자리에 밀린 적이 이제 가장자리 칸에서 맞음).

### 적 충돌 반경 0.1 — 평타·스킬 공격 범위 (관리자 결정 2026-10-17, upstream `5bf337a5` + `cf229a9c` 각색)
- 규칙: 오퍼레이터의 **평타 범위와 스킬 공격 범위**(스킬이 치거나 고르는 칸, 특성·재능 범위, 범위 오라)는 적의 0.1 충돌 원이 범위 칸에 걸치면 든다 —
  중심이 칸 경계 밖 0.1 안이면 맞는다. MANUAL 스킬 **자동 발동의 rangeId 칸 검사**와, 클라가 적의 **지금 칸**으로 보는 **칸 규칙**(지형, 칸 리스너
  장판, 칸 선택기, 「所在格」)은 위치의 칸(점) 그대로. 칸에 놓인 효과라도 클라가 범위 선택기(물리 겹침)로 고르는 것은 충돌체(아래 「칸 효과」).
  저지·스플래시(중점 판정)와 이동은 그대로. 거대 보스는 히트 사각형이 충돌체(원 안 더함).
- 근거: PRTS 作战机制 「关于碰撞体积与远程索敌，碰撞箱碰撞是为最常用的方式，索敌抬手等均使用碰撞箱」. 공식 클라(관리자 노트): 적 프리팹 루트의
  `CircleCollider2D` 반경 0.1(트리거, ENEMY 층). 평타 탐색 `RangeSelector` → `PhysicsRange` → `Box2dPhysicsUtil._OverlapCollider` →
  `Physics2D.OverlapAreaNonAlloc`(범위 칸 상자 = 칸 경계 그대로) — 적 원이 상자에 걸치면 잡힌다. 탐색 때마다 그 목록의 첫째를 다시 고르고(`SelectorTrigger.Search`,
  EN 클라 오퍼레이터 공격 선택기의 `_keepTarget` 전부 0), 「놓을 때 점」 검사(`PhysicsRange.CheckTargetIn`)는 평타에 안 쓰인다 → 잡기·놓기 모두 충돌체.
  반면 위수협약 자동 조작의 rangeId 갈래(`_DefaultTriggerSkill` → `LitePhysicsUtil.FindTargetsInBox`)는 `_CheckContainsPosition`으로 적 위치 한 점의 칸만 본다.
  upstream은 발동 검사까지 충돌체로 바꿨다 — 그 부분은 받지 않음(공식과 다름).
- 동작:
  - `constants.js ENEMY_COLLIDER_RADIUS` 0.1(아군 `ALLY_COLLIDER_RADIUS` 옆). `body.js colliderKeys`·`bodyInRange`·`bodyInRangeTile`(충돌체), `bodyKeys`·
    `bodyInKeys`·`bodyOnTile`(점) 그대로. 틱마다 만드는 적 색인이 둘: 범위 버킷(충돌 원이 걸친 칸 모두, 한 적이 여러 칸이면 `_ebMulti`)과 칸 버킷(위치의 칸).
  - `Battle.enemiesInKeys`·`unitsInGrid` = 충돌체(평타 `ai.js acquireTargets`, 스킬·키트의 범위 선택, 범위 오라, 특성 범위). 새 `Battle.enemiesOnTiles`·
    `anyEnemyOnTiles` = 점. 반경 효과는 중심 거리 그대로이고, PRTS가 碰撞判定이라 적은 둘만 `foesInColliderRadius`(반경 + 0.1): 蕾缪安 포탄, 克莱门莎 S2 1.1 스플래시
    (`cf229a9c`).
  - `skills.js`: 기본 전략의 rangeId(`_autoDefault`)·키트 규칙 `CUSTOM_RANGE`·`SKILL_RANGE`·`ACTIVE_RANGE`의 발동 칸은 `enemiesOnTiles`/`anyEnemyOnTiles`(점).
    rangeId가 없는 기본 전략·SEARCH·TAKE_DAMAGE(공격 트리거 탐색 = 「공격 중」)와 내용물 발동 범위(`addTriggerRange`, 공격 범위의 연장)는 충돌체.
  - 키트: 공격 범위(`rangeKeySet`)·스킬 범위로 대상을 고르거나 거르는 곳은 `bodyInRange`(upstream이 바꾼 키트 + 우리 락락 S2 고정 대상·평타 방향 유지
    `ai.js holdFaceTarget`). 领主 원거리 80 %의 「자기 칸·앞 칸」 판정도 충돌체(`professions.js lord`, upstream 그대로).
  - **칸 효과**(관리자 결정 2026-10-17, 클라 프리팹 대조): 처음에 점으로 남긴 아홉 곳을 클라 프리팹·코드로 다시 봤다. 클라는 칸 효과를 두 길로 고른다 —
    범위 선택기(`SelectorTrigger`/`AdvancedSelector` + `ConstBoxRange`·`AutoLoadBoxRange` = `PhysicsRange`, 평타와 같은 물리 겹침)면 충돌체,
    적의 지금 칸(`Enemy._UpdateCurrentTile` → `Map.GetTile`(위치) → `Tile.AddEnemy`/`RemoveEnemy` → `OnEntityEnter`/`Leave` → `ITileListener`,
    `Tile.GetEnemies`/`GetEntities`)이나 `LitePhysicsUtil._CheckContainsPosition`이면 점.
    - 충돌체(`bodyInRangeTile`·`bodyInRange`·`enemiesInKeys`): 瑕光 S2 「자신이 선 칸」 수면(`skchr_blemsh_2/Sleep`: 선택기 + `ConstBoxRange`),
      琳琅诗怀雅 폭탄 칸 — 키트 폭탄과 소환물 키트 香槟 둘 다(`token_10031_swire2_gdtrap` 평타: 선택기 + `AutoLoadBoxRange`), 克莱门莎 S3 포격 5칸(CN 클라
      `projectile_chr_clemnt_s3`: 선택기 + `x-5` 상자 범위 — 클래스 이름은 필드로 맞춤), 望의 棋子 발동(`sktok_wang_1/2/3` `SkillTrigger`: `ConstBoxRange`
      `0-1`, S3 `x-1`)·폭발(`sktok_wang_2/3` 선택기 + `PhysicsRange`). 望의 跟子는 뿌리 칸 그대로(`WangStoneHitBehaviour._checkTargetRootTile`).
    - 점: 烛煌 S2 불붙은 칸(칸 리스너 `blaze2_s_2[on_tile]`/`[leave_tile]`), 圣聆初雪 눈 칸의 네 효과 모두 — 감속·들어설 때 피해·S2 초당 피해·떠날 때 寒冷과 눈
      지움(칸 리스너 `sbell2_t1[enemy_enter]`/`[enemy_leave]`), 乌尔比安 S3 닻 정지 칸(`TileSelector` 필터 `ULPIA_SKILL_3` → `Tile.GetEntities`; upstream도
      `enemiesOnTiles`), 突袭 맹약의 1-1 근접 판정(`CheckHasEnemyInRange` → `LitePhysicsUtil.CheckOverlapInBox` → `_CheckContainsPosition`).
- **[ASSUMED]**: 범위 오라·스킬 효과 칸·특성 범위가 평타처럼 프리팹 선택기(물리 겹침)를 탄다는 것(공식 클라에서는 평타 선택기만 직접 확인, 스킬 쪽은 일부만 따라감).
  PRTS가 碰撞判定이라 적지 않은 반경 효과는 중심 거리. `enm_pfb_0.ab` 밖 적 프리팹의 반경도 0.1이라고 봄.
- 테스트 `test/sim/collider-range.test.js`(새로: 기하, 저지자가 범위 끝 칸에 있을 때 막힌 적은 칸 밖이라 저격수가 못 침, 범위 끝에서 0.05 밖은 평타가 맞고 0.15
  밖은 안 맞음, **같은 적이 rangeId 스킬은 안 켬**(칸 안으로 0.1 들어오면 켬)·rangeId 없는 스킬은 켬, `foesInColliderRadius`, 색인 400자리, 실제 경로
  BattleSpec + 실제 웨이브(烛煌 S3): 충돌체로만 범위에 든 적을 잡아 치고, 자동 시전은 매번 rangeId 칸 위에 선 적이 있을 때). 기하가 0.1 움직인 테스트:
  `test/content/kits_t6.test.js`(异客 S3), `test/sim/feedback1-tank-triggers.test.js`(공격 범위는 충돌체·발동 칸은 점), `test/sim/feedback1e-skillrange.test.js`,
  `test/sim/feedback5-lemuen-s3-wait.test.js`, `test/sim/hit-tile-round.test.js`, `test/content/op_clemnt.test.js`, `test/local-patch-diy.test.js`(LOR-Y: 스킬을
  처음부터 켜서 원거리 타격이 생기게). golden: 6개 계열 전부(roster 49/49, bonds 46/46, fields 22/22, matches 20/20, standins 10/10, diy 11/11) — 범위 가장자리
  0.1 안의 적을 이제 치므로 모든 전투의 피해·처치가 바뀜. 칸 효과 다섯(`test/sim/collider-tile-effects.test.js`: 경계 0.05 밖은 효과, 0.15 밖은 없음, 望은
  모서리 대각선으로 跟子 칸을 피함): golden roster-006·008·039, bond-investShip·kjeragShip·victoriaShip-low(琳琅诗怀雅·瑕光), coop2-NORMAL-70-diy
  (琳琅诗怀雅·望), diy-010(克莱门莎).

### 驭械术师 평타 = 본체 한 방 + 부유 유닛 추가 피해, 재배치 때 램프 초기화, 洛洛 S2 고정 대상 (upstream `823e3d0a` `e0f37718` `a451ddcf` `7434e9ea` `f567e804`)
- 문제: 엔진이 驭械术师(메카 캐스터) 평타를 부유 유닛 램프(0.2 → +0.15 → 1.1배) 한 방으로 **대신**해, 본체의 100 % 공격이 없었다. 재배치해도 램프·대상별 배율이
  남았고(`installFunnel`이 한 번만), 洛洛 S2 「자부차액」의 고정 대상은 본체 사거리를 벗어나면 바뀌었고, 스킬 전에 쏜 탄이 풀린 부유 유닛 램프를 건드렸다.
- 근거: PRTS 分支特性信息 驭械术师 「额外伤害」(부유 유닛 피해는 공격에 더해지는 추가 피해), 재배치·대상 변경 때 램프 초기화(같은 문서). 洛洛 S2 문구
  「锁敌后直至敌人被击杀或技能结束」.
- 동작(upstream 그대로, 손 이식):
  - `ai.js resolveHit`: 프로필 `funnelMul`(부유 램프, `professions.js funnel`)이 있으면 본체 1.0배 `isAttack` 한 방 + 부유 유닛 추가 피해(`addition`·`funnel` 태그,
    `isAttack` 아님, 같은 `attackId`). `dmgMul`(至简 재능 등)은 둘 다에. 부유 유닛이 늘어도(`hits`) 본체는 하나, `funnelBodyHits` > 0이면 그만큼(至简 S2 두 방),
    0이면 부유만(荒芜拉普兰德 S2 — 본체는 그 공격의 첫 대상으로 따로, 아래 「荒芜拉普兰德 S2·S3 중에도 본체 평타」). **[ASSUMED]** 본체가 먼저, 같은 착탄 순간(부유 유닛의 따로 나는 탄·시간은 모델링 안 함), 한 일제 사격에 램프 한 칸.
  - `installFunnel`: 일반 배치(재배치·부활 포함)마다 대상·램프·대상별 맵 초기화, 자유 이동(`deploy`의 `move: true`)은 유지. 날아가는 탄은 착탄 때 램프를 계산.
  - 耶拉(두 형태) S2: 본체 평타는 사거리 안에서 그대로, 그동안 부유 추가 피해는 끔, `1 + attack@cnt`개의 풀린 부유 유닛이 적이 죽거나 스킬이 끝날 때까지
    고정해 스킬 피해(`kjera:drone`). 기본형은 대상별 램프를 이어 쓰고 되돌려 줌, 숨은 형태는 init부터·되돌리지 않음. **[ASSUMED]**(upstream): 풀린 부유 유닛도
    특성 램프, 비행 시간 없음, 선택 불가가 된 고정 대상은 놓고 다시 고름, 기절·무장 해제가 멈추지 않음.
  - 洛洛 S2: 풀린 부유 유닛 하나가 자기 틱으로(`rockr:drone`, 스킬 피해) 고정 대상을 침 — 살아 있고 선택 가능하면 본체 사거리 밖이어도 유지, 처치·스킬 끝에 돌아옴.
    램프는 유닛 자신이 들고 있어 스킬 전 탄이 바꾸지 못함. 스킬이 끝나면 램프를 특성에 돌려줌.
  - 荒芜拉普兰德 S1(토글)은 본체 + 두 부유 추가 피해, S3 드론은 자기 경로 그대로(S3 중 본체 평타는 아래 「荒芜拉普兰德 S3 중에도 본체 평타」). 澄闪 부분은 우리 풀에 없음.
- 테스트 `test/sim/funnel-body.test.js`(upstream에서: 일반·정예 5명, 洛洛 저항·횟수 체력·보호막, 至简 S2, 耶拉 S2, 荒芜拉普兰德 S1·S2, 장비·시라쿠사 굴림,
  처치; 澄闪 줄은 뺌, 우리 투사체 비행 시간에 맞춰 관찰 시간을 늘림; 새로 실제 경로 BattleSpec + 실제 웨이브에서 洛洛 일제 사격 = 본체 하나 + 추가 피해 하나),
  `test/sim/funnel-redeploy.test.js`, `test/content/rockrock-s2-lock.test.js`(첫 탄 대기를 우리 공격 타이밍에 맞춤), 키트 테스트 `kits_t1t2`·`kits_t3`·`kits_t4`·
  `kits_t6`·`kits_alt_t2`·`kits_alt_t6`. upstream의 `test/match/funnel-redeploy.test.js`(시드 8 상점에 맞춘 실제 판)는 우리 상점·데이터에서 그 판이 나오지 않아
  옮기지 않음 — 재배치 초기화는 `test/sim/funnel-redeploy.test.js`(자동 재배치·부활)가 본다. golden: roster 13, bonds 10, fields 4, matches 14 시나리오(메카 캐스터가
  나오는 판).

### 自制投石机(사제 투석기) 일제 사격 = 돌 3개 0.3 s 간격, 각각 물리 공격·반경 1.5 (upstream `31a172e2`)
- 문제: 3개가 한 순간에 맞고, 2·3번째는 `hurt()`(공격 아님)라 「매 공격」 효과(坚守 반사 등)·DEF·보호막이 한 번만 봤고, 튐 반경이 블랙보드 `projectile_range`
  0.5(입희 전용 값)였다. 첫 돌 뒤 대상이 죽으면 남은 돌도 없었다.
- 근거: PRTS 自制投石机 재능(물리 3회·반경 1.5·「不会因丢失目标而结束攻击」), 블랙보드 `Attack.attack@times` 3·`hit_interval` 0.3. 클라 확인은 없음.
- 동작: `content/enemies/special.js` `catapultVolley` — 키트가 공격을 맡음(`profile.deferHit`, ai.js의 'attack' 훅). 돌 i는 타격 순간에서 `hit_interval` × i 뒤에
  던져져 자기 투사체(데이터 `proj`, PARACURVE 8칸/s — 던질 때 조준점까지 거리 / 속도)로 날아가 떨어지고, 잠근 아군이 아직 선택 가능하면 그를 치고 착탄점 1.5 안의
  아군을 튐(`areaAllies`). 돌마다 따로 `isAttack` 물리 피해. 대상이 죽어도 남은 돌은 마지막 조준점에, 투석기가 죽어도 이미 던진·예약된 돌은 떨어진다.
  돌 셋 모두 첫 돌처럼 비행(관리자 결정 2026-10-17 — 공식 자료는 「3회·0.3 s」만 말함; upstream은 비행 없이 0.3 s 간격, 우리는 「적 투사체」 규칙의 비행 시간을
  유지), 'atk' 이벤트는 투사체 하나만 그림.
  입희(入戏) 무작위 조준(upstream 구현)은 이 모드 표에 없어 넣지 않음.
- 테스트 `test/sim/catapult-volley.test.js`(upstream에서: 0.3 s 간격·DEF·보호막·1.5 튐, 대상 상실·투석기 사망 뒤에도 계속, 坚守 반사 돌마다; 입희 사례 뺌),
  `test/content/enemies_bosses.test.js`(비행 시간만큼 관찰 늘림). golden: roster-013·roster-040·standin-06.

### “越长尘”(`enemy_1302_ymtro_2`) 승객 (upstream `18cb28fe` 중 “越长尘” 부분)
- 문제: 「passengers n/a」 — 저지 가중치 4만 있고 승객을 태우지 않았다. 같은 커밋의 나무 버든비스트는 우리가 먼저 고쳤다(위 「나무 버든비스트 승객」).
- 근거: 재능 블랙보드 `Bus.max_cnt` 4(공식 표, `data/enemies.json`), PRTS 天赋&能力(upstream이 읽은 것: 반경 0.5, 리더·기계 아닌 지상 적, 칸 중심에 내림). 클라 프리팹
  `Talents/Bus`는 로컬 추출에 없어 대조하지 않았다(다시 추출 안 함).
- 동작: `content/enemies/special.js kitBus(ab, { camel: false })` — 버든비스트와 같은 탑승 규칙으로 최대 `Bus.max_cnt`, 감속·모델 형태 없음, 저지 가중치 4 그대로.
  격파·도달로 필드를 떠나면 승객은 그 칸의 중심(위치를 짝수 반올림한 칸)에 내려 **자기** 남은 경로를 탄 지점부터 잇는다.
  **[ASSUMED]**(upstream): 승객 자기 경로 유지(PRTS가 이 적의 경로 교체를 적지 않음), 탑승 우선순위는 버든비스트와 같이 가까운 순. 云梯 조기 하차는 우리 스테이지에
  云梯가 없어 넣지 않음(upstream도 없음).
- 테스트 `test/content/enemies_bosses.test.js` 「enemy_1302_ymtro_2 …」 2건(최대 4명·감속 없음·형태 없음, 격파 하차 칸 중심·자기 경로). golden: roster-006·roster-039
  (이 적이 나오는 판).

## 님프 정예 모듈 판 窥心钥 공격 속도 = 10층부터 (2026-10-17, 관리자 지시)

- 기물 `chess_char_6_10_b` 2번째 재능 「全场有敌人凋亡损伤爆发时，攻击力+3%，最多可叠加12（+2）层，叠至10层后，攻击速度+12」(블랙보드 `max_stack_cnt` 12 ·
  `stack_cnt_check` 10 · `attack_speed` 12). 키트가 공격 속도를 최대 층(잠재가 있으면 12)에서야 켰다 → `stack_cnt_check`(10)부터. 클라 버프 템플릿
  `nymph_e_002_t_2`도 `FilterByBuffStackCount`(`stack_cnt_check`, GE) 뒤에 `nymph_e_002_t_2[atk_spd]`를 만든다. 잠재가 없으면 둘 다 10이라 그대로.
- 확인: `test/content/kits_t6.test.js` 「窥心钥 ASPD +12 from stack_cnt_check」(9층 0 → 10층 +12, 공격력은 12층에서 멈춤; 고치기 전 실패). 골든 그대로.

## 战场#06(上半) 沙尘暴 · 土石结构 (2026-10-18, 관리자 결정 「기믹을 구현한 뒤 커스텀에 m06」)

이번 시즌 풀에 없는(`active:false, weight:0`) 상반기 전장 #06을 커스텀 「收录上半战场」(`ui.md` 「규칙 모드 — 커스텀」)으로 쓰려고 sim에 넣었다. #05(涨潮/特制水上平台)·#07(树丛)은 보류.
- **근거(클라 데이터로 확인)**: 장치 `trap_036_storm` 스킬 `sktok_storm`(`[uc]skills.ab`) = 하위 능력 셋이 아군(EntityCategory DEFAULT)·적(DEFAULT)·장애물(OBSTACLE)에
  버프 `sand_storm[ally]`·`[enemy]`·`[trap]`을 블랙보드 `duration` 1500 s 동안 건다. 버프 템플릿(EN `buff_template_holder`, 참고 추출 「공식 버프 템플릿 추출」)은
  `ON_BUFF_TRIGGER`마다 `HasCertainCharacterInFrontOfMe(trap_032_mound)`로 가려졌는지 본다. 틱 간격 = 블랙보드 `interval` 2 s(`Buff.Reset`이 bb `interval`을
  `triggerInterval`보다 먼저 씀, 공식 클라로 확인), 아군·적은 붙자마자 첫 틱(`waitFirstTriggerInterval` false).
- **가려짐(공식 클라에서 확인)**: `HasCertainCharacterInFrontOfMe.Execute` — 유닛 칸에서 `InverseDirection(폭풍 방향)`으로 `GetGridPositionsAlongTheDirection`
  (자기 칸 빼고 맵 끝까지, 거리 제한 없음)의 칸 중 하나에 `trap_032_mound`가 서 있으면 가려짐. m06 폭풍 `#1`은 `DOWN` → 위쪽(행이 큰 쪽)에 토석 구조물이 있으면 가려진다.
  일반 판 윗줄은 (12,3)–(12,6) 4개((12,7)·(12,8)은 봉인 바닥 `trap_1107_acblock`이라 7·8열은 안 가려짐), 보스 필드 윗줄은 왼쪽 (5,3)–(5,8)·오른쪽 (5,12)–(5,17) 6개.
- **효과**: 안 가려진 오퍼레이터·소환물 → 틱마다 순수 100(`NoSourceDamage` PURE, 환경 피해, SP 안 참) 뒤 공격력 FINAL_SCALER ×(1 + `atk` −0.5) — 다음 틱에
  가려졌으면 풂. 안 가려진 적 → 이동 속도 ×(1 + `sand_storm[enemy].move_speed` −0.4)(피해 없음), 같은 식으로 틱에서만 붙고 풀림. 射击台·봉인 바닥·“双眼皮”는
  TRAP_OR_ITEM이라 영향 없음.
- **토석 구조물은 안 부서진다**(관리자 기억과 데이터 일치): `[trap]` 버프는 OBSTACLE을 치지만 `mound_s_1[strengthened]`이면 건너뛴다. m06 레벨 파일의
  토석 구조물 28개는 모두 `mainSkillLvl` 2 = 「风沙掩体」 2레벨(시작 SP 10 = 필요 SP 10) → 시작하자마자 강화. 그래서 지금처럼 HP 없는 지면 장애물(`_spawnStageDevices`)로 둔다.
- **맵 카드** 模拟战场演变·模式八(`map_m06_1`, `trap_036_storm#1/#2` 0): 폭풍 장치는 필드 밖 (18,0)이라 어느 절반에도 없으므로, 유닛이 선 절반의 플레이어 카드를 따른다
  (다른 맵 카드처럼 자기 절반만) **[ASSUMED]**.
- **[ASSUMED]**: 폭풍은 전투 첫 틱부터(장치 등장 시간 무시). 적 이동 속도 MULTIPLIER를 다른 감속과 곱으로 합침(`moveMul`). `sand_storm[ally]` `ON_OWNER_FINISH`의 카드
  버프(재배치 비용 계열)는 이 모드에 재배치가 없어 뺌. 연출(`map_desert_03_*`·`buff_desert_01`·`map_desert_02_*`·`screen_desert_*`)은 렌더 몫 → `fx.md` 「战场#06 沙尘暴 연출」
  (sim은 오퍼레이터 버프의 `fxTag`에 폭풍 방향, `fieldMeta().storm`에 폭풍이 부는 열 범위만 싣는다).
- 코드 `server/sim/content/devices.js`(`buildStorm`·`stormSheltered`·`tickStorm`). 테스트 `test/content/tokens_devices.test.js` 「沙尘暴」 2건,
  `test/match/custom-first-half.test.js`(실제 판 경로: 일반 필드 적 감속, 보스 필드 윗줄 6개). golden: 코퍼스가 모든 전장을 돌아가며 써서 m06 시나리오가
  움직임 — roster-006·roster-028, bond-indomShip-high·bond-miraShip-low·bond-skillfulShip-high·bond-visiShip-low, boss-boss_1-solo·boss-boss_7-pair,
  standin-06, diy-006(폭풍); 커스텀 판 custom-coop2-HARD-11-flow·custom-solo-ABYSS-12-battle-boosted는 규칙 기록에 `stages.firstHalf: false`만 늚.

## 突袭 AUTO 스킬도 준비되면 점프 (2026-10-19, 관리자 결정 「공식 녹화대로」)

제보: 기습 맹약에서 瑕光이 S1을 충전해 둬도 적 쪽으로 잘 안 움직인다. 원인: `raidPoll`의 「스킬 준비됨 + 범위에 적 없음」 경로가 MANUAL 스킬만 봤고,
AUTO 스킬은 스킬 시작(`[trig]`) 경로뿐이었다. 瑕光 S1(`skchr_blemsh_1`, AUTO·DEFAULT·「下次攻击」)은 공격하려는 순간에만 시작하고, 그때는 보통 이미 적을 막고 있어
`CheckBlocked`에 걸리므로 사실상 10초 무공격 경로로만 움직였다. 같은 처지의 기본 멤버 AUTO 스킬: 休谟斯·伊内丝·史尔特尔·仇白 S1(「下次攻击」), 耀骑士临光 S1(무한 지속).
- **근거(공식 녹화, 보스 라운드 卢西恩)**: 瑕光(정예2, S1 2회 충전)이 109초에 1회, 106초에 2회 충전된 채 집 칸에서 기다림(보스가 배치 불가 칸에 있어 착지 칸 없음) →
  卢西恩이 저지자를 뚫고 순간이동한 직후(104초) 다른 기습 멤버와 함께 점프, 착지 때 「SP 10」 표시(최대 SP로 채움 = 스킬 경로) → 0.7초 동안 충전 그대로(공격 없음) →
  다시 점프(「SP 10」 다시 표시)해 보스를 막고 그때부터 공격. 두 점프 모두 S1이 시작되기 전이라 스킬 시작 경로가 아니고, 10초 무공격 경로도 아니다.
  첫 착지 칸은 보스 칸(다른 멤버가 차지) 다음의 「멤버가 볼 때 적 뒤 칸」으로 `raidTile` 순서와 같았다.
- **변경**: AUTO 스킬도 MANUAL과 같이 준비됨·안 켜짐·자기 칸과 앞 칸에 적 없음이면 점프(`server/sim/content/bonds/addon/battle.js raidPoll`). 스킬 시작 `[trig]` 경로는 그대로 둠.
- **[ASSUMED]**: 두 번째 점프는 순간이동 뒤 저지 불가인 보스가 걸어서 瑕光의 앞 칸을 벗어났기 때문으로 읽음(녹화에서 보스가 약 1/3칸 이동). 판정이 무적 적을
  세지 않는 것일 수도 있으나 이 녹화로는 구분 안 됨 — 우리는 무적 적도 셈(`raidEnemyClose`). 공격하지 않은 이유는 순간이동 직후의 무적·저지 불가.
- 테스트 `test/content/bonds_addon.test.js` 「突袭: a ready AUTO skill …」 2건(충전되면 다음 폴링에 점프하고 적이 범위에 있으면 머묾 / 저지·대상 불가 적이
  상자를 벗어날 때마다 다시 점프, S1은 시작 안 함). golden: roster-027(瑕光 S1 + 斯卡蒂로 기습 2명) — 瑕光이 충전되자 뛰어 처치 42 → 37 등.

## 烛煌 绝处重燃 쓰러짐 중에는 스킬도 안 켜짐 (2026-10-19, 관리자 제보)

제보: 이격 블레이즈(烛煌, `chess_char_5_03`)가 재능 绝处重燃으로 쓰러져 있는 동안(공격 불가) S3가 발동한다.
- **원인**: 쓰러짐 버프 `blaze2:downed`가 `disarm`만 걸었다. `disarm`은 평타 루프(`ai.js updateAlly`)만 막고, 스킬은 그 밖에서 켜진다 — MANUAL S3는
  자동 조작(`Skill.autoTrigger`, rangeId 4-11 칸에 적만 있으면 됨), S2도 같은 길. 쓰러진 채 S3가 켜지면 초당 3% 체력 손실이 3% 재생과 상쇄돼 일어나지 못했다.
- **변경**: 쓰러짐 버프에 `silence`를 더함(`server/sim/content/kits/ops/chess_char_5_03-blaze2.js`) — 傀儡师 <替身>(`professions.js`, 「不进行普通攻击」)과 같은 꼴.
  쓰러지는 순간 켜져 있던 스킬은 예전처럼 끝냄. SP는 계속 참(PRTS 재능 문구에 SP 언급 없음) **[ASSUMED]**. 화면은 그대로(버프 플래그는 상태 아이콘에 안 실림 — `snapshot.js flagsOf`, `protocol.js`의 `silenced`는 적 카드만).
- 테스트 `test/sim/blaze2-downed-skill.test.js`(S1–S3: 쓰러진 동안 SP를 채워도 시전·공격 없음, 일어난 뒤 다시 시전; 고치기 전 S2·S3 실패).
  golden: roster-013(烛煌이 일어나 싸움). hidden-boss_9-solo는 「假想敌：铳 【最终之罚】 돌진 속도·추적」 수정 뒤의 판에서는 바뀌지 않음.

## 伺夜 S2 领袖的馈赠 회복은 물 때 (2026-10-21, 클라 버프 템플릿)

- **공식**(EN 버프 템플릿 `vigil_s_2` → 늑대 무리에 `vigil_wolf_s_2`): 회복(`HealViaMaxHpRatio`, `_ignoreHealFree`)과 `vigil_token_heal`은 늑대의 Attack 능력의
  ON_ABILITY_CAST_ON_TARGET — 선물을 받은 다음 물기(타격) 때다. 그때 `[mark_finish]`를 만들어 그 능력이 끝나면(ON_ABILITY_FINISH) 선물이 끝난다. 토큰
  Attack은 대상 하나에 한 번 시전하므로(`_additionalTimes` 없음 — 추가 늑대의 물기는 `vigil_wolf_t_1_enhance[damage]` 추가 피해) 회복도 한 번.
- **변경**: 시전 때 하던 회복을 선물을 쓰는 그 공격의 타격으로 옮김(`chess_char_3_19-vigil.js installGift`의 `beforeAttack` — 선물에 `hr`). 전술점 형태의 무리는
  돌아와 문 때 회복. DP·×atk_scale·처치 DP는 그대로.
- 테스트 `test/content/kits_alt_t3.test.js`(시전 때 회복 없음, 첫 물기에 hp_ratio, 둘째 물기엔 없음). golden: roster-039·040(선물 물기 전에 판이 끝나
  회복이 사라짐; 승패 그대로), 그 밖은 같은 날의 새 표시 이벤트 'wolfCount'·'wolfTacEnd' 수만(rules/fx.md 「伺夜 늑대 무리」).

## 리더 방벽 층 셋 — 층마다 블랙보드 양 전부 (2026-10-21, 관리자 결정 2026-10-21 「공식 클라에서 확인되면 시뮬을 맞춤」)

래트킹(`enemy_1509_mousek`), '즈자이' 破桎而出(`enemy_1517_xi`), 머드락(적)(`enemy_1511_mdrock`)의 방벽은 클라에서 방패 버프 셋이다(`mousek_shield[a/b/c]`,
`enemy_xi_s2[shield][a/b/c]`, `enemy_mdrock_s_2[shield_a/b/c]`). 전에는 셋을 한 방벽(블랙보드 `dynamic` 하나)으로 두었다.
- **공식 클라**(EN, 관리자 노트): 버프는 저마다 자기 블랙보드를 가지며 `Buff.Reset`이 그것을 비우고 넘겨받은 블랙보드·버프
  데이터 블랙보드의 값을 **복사**한다(`Blackboard.Assign(IList)`, 참조 공유 아님). 층을 만드는 쪽은 셋 다 같은 블랙보드를 넘긴다 — 래트킹
  `Talents/shield`(`PassiveBuffAbility`, `Ability.AddPassiveBuffs` → `owner.AddBuff(data, …, ability.blackboard)`), '즈자이' `BuffDuringCasting.OnCastStart`
  (`AddBuffsToIdList(…, ability.blackboard)`), 머드락(적) `[shield][refresh]`의 `CreateBuff`(새 `Blackboard(그 버프의 블랙보드)`). 층 버프 데이터는
  `stripBlackboardParamsWithBuffKey` 0·블랙보드 비어 있음(래트킹 c는 `mode` 1뿐). 각 층의 `BlockDamage`(`_useDynamicVar`)는 자기 블랙보드 `dynamic`에서
  min(피해, dynamic)을 빼 다시 쓰고(`_AssignDynamicVar`), 남은 피해를 modifier에 되써 다음 ON_TAKE_DAMAGE로 넘기며, 다 막으면 취소; `dynamic`이 0이 되면
  그 층만 끝남(`IsBlackboardZero` → `FinishBuff`). 층은 함께 붙어 있고(`disableOverride` 1, 수명 INFINITY) 버프 목록은 `onEventPriority`가 같으면 얻은
  순서(`SortedDoubleBufferedBuffList.Add`) → **a → b → c 순서로 깎이고 넘친 피해는 다음 층으로, 방벽 전체 = 3 × `dynamic`**. Lua 핫픽스 없음.
- **PRTS(2차 확인)**: 鼠王 「可吸收14001法术伤害的屏障」(4667×3, 레벨 1 22002 = 7334×3), “自在” 「可吸收7500物理/法术伤害的屏障」·둘째 형태 9000(2500×3·3000×3,
  레벨 1 10500·12000), 泥岩(敌方) 「可吸收16500法术伤害的屏障」(5500×3, 레벨 1 20001 = 6667×3).
- **변경**: `archetypes.js artsBarrier`에 `layers`(클라 층 버프 키) — 층마다 `amount` 전부, 차례로 깎고 넘침은 다음 층, 층마다 보이는 표시 버프
  `<키>[1..3]`(`fxTag` 'buff:<그 층 키>')가 그 층이 깨질 때 빠짐(렌더가 그 층 이펙트만 끔). 보너스 버프(래트킹 DEF, 머드락 HP·공속)는 이제 이펙트
  태그 없이 마지막 층까지. 머드락 刷新屏障은 세 층 모두 다시 채움. '즈자이'는 엔진 방벽 버프 셋 `ab:xiShield[a/b/c]`(각 `dynamic`, 붙인 순서로 흡수)이고
  **물리·법술만** 막음(클라 `_damageMask` PHYSICAL_AND_MAGICAL, PRTS 「物理/法术伤害」 — 전에는 진실 피해도 막았음). 폭발은 마지막 층 c가 지속 시간을
  버틸 때만(클라 `enemy_xi_s2[shield_last]`만 깨질 때 `InterruptEnemyAbility`) — a·b가 깨져도 c가 남으면 터짐. 파란 숫자 허용 키(`local-hud.js BLOCK_SHOWN`)에 세 층 키.
- 남은 것: 래트킹 마지막 층이 깨질 때의 `NoShield` 모드 전환(`mousek_shield_end` `SwitchMode`)·층 피격 이펙트는 fx 쪽 미구현 그대로.
- 테스트 `test/sim/leader-barrier-layers.test.js`(실제 매치 경로: 셋 다 3 × dynamic, 층 상태 셋·깨지는 순서, 래트킹 DEF는 마지막 층까지, '즈자이' 진실 피해 통과·
  c가 버티면 폭발 / c가 깨지면 없음, 머드락 갱신), `enemies_bosses.test.js`·`enemy-buff-tags.test.js` 고침. golden: roster-005(래트킹 — 판이 시간 초과·
  누출 1로 바뀜)·028(래트킹)·006·035(머드락(적))·011·040('즈자이')·matches coop8-HARD-3(피해 몇 점), fx 골든은 같은 판들의 게임 결과로 바뀐 줄만.

## 머드락(적) 공격 스택 — 층마다 블랙보드 값 전부 (2026-10-22, 관리자 결정 2026-10-21 「공식 클라에서 확인되면 시뮬을 맞춤」)

머드락(적)(`enemy_1511_mdrock`)의 「攻击时攻击力永久提升，最多六层」은 공격마다 클라 버프 `enemy_mdrock_s_1[charge]`를 한 번 만든다(재능 블랙보드
`charge.attack@enemy_mdrock_s_1[charge].atk` 0.6, 레벨 0·1 같음). 전에는 0.6을 6층 합으로 보고 층마다 0.1을 주었다(`[ASSUMED split]`).
- **클라 데이터**(EN 버프 템플릿): `[charge]`는 `overrideType` STACK·`maxStackCnt` 6·`maxValidStackCnt` −1·수명 INFINITY, 속성 수정
  ATK `MULTIPLIER`(`loadFromBlackboard` 1, `stripBlackboardParamsWithBuffKey` 1 → 블랙보드 `atk`). `[persistent]`는 층 수 1·2·3·5·6에서 모드만
  바꾼다(겉모습).
- **공식 클라**(EN, 관리자 노트): STACK 묶음은 버프 하나다 — 둘째부터 `OverrideGroup._DoAddInternal`이 새 버프를 넣지 않고 맨 앞
  버프의 `_AddStack`(층 수 +1, 남은 시간 max)을 부르며, 층이 `maxStackCnt`면 더하지 않는다. `_DoUpdateStack`은 `_LoadAttributesModifier(…, 층 수)`로
  수정값을 다시 읽고, 그 함수는 블랙보드 값에 **층 수를 곱해**(`FP.FastMul`) MULTIPLIER 칸에 더한다(첫 버프는 `Buff.Reset`이 층 수 1로 읽음). Lua
  핫픽스 없음. → **층마다 +60%, 6층 = +360%**(같은 단계 %는 합산 — 直接乘算).
- **PRTS**: 泥岩(敌方) 「攻击成功时获得1层攻击力+60%的永久增益…最多叠加6层」 — 같다.
- **변경**: `leaders.js` 머드락(적)의 `ab:rockCharge` 층 값 = 블랙보드 값 그대로(÷6 없앰). 층을 얻는 때(공격 훅, 타격 뒤)는 그대로.
- 테스트 `test/sim/leader-mdrock-charge.test.js`(실제 매치 경로: 막힌 머드락이 공격마다 1층, 6층에서 멈춤, ATK = 기본 × (1 + 0.6 × 층)), `enemies_bosses.test.js` 고침(2층 = +120%). golden: 움직인
  장면 없음(golden 판의 머드락(적)은 0층에서 한 번만 공격).

## 스와이어 디 엘리건트 위트 S1 동전 치유 = 그 공격 차례 (2026-10-22, 관리자 결정 2026-10-22 「공식대로 변경」)
- 증상: 동전 치유가 평타 타격 때 얹혀 나가고 그 평타도 적을 침(그래서 치유 클립 `Skill_1`이 평타 스윙 도중 타격 프레임부터).
- 공식(클라 charpack char_1033_swire2 모드 S1 + 코드): 공격 능력 `Body/Trigger` = `AbilitySelectableGroup`(`_selectAbilitySequentially` 0).
  `_DoCastInternal`이 공격 차례를 시작할 때 `_abilityConfigs`를 [0]부터 `AbilityConfigs.TryCastToTarget`해 처음 성공한 하나만
  시전. [0] `HealAlly`(트리거 `_checkType` 1 = 둘 다: 버프 `swire2_can_use_gold` + 선택기 x-4 아군 HP ≤ 0.7 한 명, `_animKey "Skill_1"`,
  `_waitForAttackEvent` 1 = OnAttack 때 치유, `_faceToTarget`), [1] `Attack`. → 동전과 다친 아군이 있으면 그 차례 전체가 치유이고 적은 안 맞는다.
- 구현(`kits/ops/chess_char_3_04-swire2.js installS1`): 치유가 시전 중이거나 줄 수 있으면 `canAttack`이 공격을 막고, 공격이 준비되면(`atkCd` 0) 'tick'
  훅이 시전 — 공격 간격을 쓰고(`atkCd`), 시전 대상 쪽으로 'face', fx 'swire2Heal' `{ signal: 'healAlly', t }`(렌더 `Skill_1` 한 번, rules/render.md
  「스킬 중 공격 클립」), 그녀의 평타 타격 시각(`ai.js attackTiming` — `Skill_1`과 `Attack`은 길이 1 s·OnAttack 0.2 s가 같음)에 동전을 쓰고 치유
  (시전 대상, 그때 대상이 아니면 다시 고름). 시전 중 기절·빙결·무장 해제면 취소, 동전 유지 [ASSUMED: 능력 중단 때 `_runActionOnEvent` 동작을 안 탐].
  적이 없을 때도 치유(2026-10-04 관리자 결정 — 공식 묶음은 적이 있어야 시전) 그대로. 예전의 「치유는 공격 주기마다 한 번」 타이머는 공격 간격 자체로 바뀜.
- 테스트 `test/content/swire2-heal-turn.test.js`(치유 차례에 스윙·타격 없음, 치유는 시전 뒤 타격 시각, 적 없을 때 치유, 기절 취소, 다친 아군 없으면 공격),
  `test/content/feedback5-swire2-self-heal.test.js`(자기 치유) 그대로 통과. golden: 아래 커밋 메시지.

## upstream 0.3.1·0.3.2 대조 이식 — 전투 (2026-10-22)

upstream `6ab24682` → master `c9d804f4`·dev `06a92237` 대조에서 받은 전투 수정(관리자 결정 2026-10-22). upstream 판정 목록은 `upstream.md`.

### 관통은 고정 먼저, 그다음 % (upstream PR #798)

- 규칙: 물리 `max(ATK×5%, ATK − max(0, DEF − 고정 관통) × (1 − % 관통))`, 법술
  `max(ATK×5%, ATK × max(0, 100 − max(0, RES − 고정 관통) × (1 − % 관통)) / 100)`(`server/sim/damage.js mitigate`). 전에는 % 먼저
  (`max(0, DEF × (1 − %) − 고정)`)라 둘을 함께 가진 공격이 공식보다 조금 더 셌다(DEF 300·고정 50·50% → 900, 공식 875).
- 근거: 공식 클라 `BattleFormula.CalculateDamageInternal`(EN 클라, 핫픽스 없음, 관리자 노트), PRTS 「游戏数据基础」 伤害公式도 같다.
  upstream PR #798(upstream 미병합)이 같은 순서로 고친다 — upstream 리팩터 위라 손으로.
- 그대로 둔 것: 피해 숫자의 크리 판정 기대 피해(`local-hud.js`, 관통 없이 셈). 스카디 더 커럽팅 하트 모듈 新生代의 물리 피해 감소는 고정 관통을 음수로
  더하는 방식이라 % 관통이 있는 공격이면 `30 × (1 − %)`만큼 준다.
- 테스트 `test/sim/core.test.js`(고정+% 동시, 고정 > 방어·저항이면 0 하한). golden: 고정·% 관통을 함께 쓰는 판(roster-003·017·018·037·045, standin-04·09,
  fields boss-boss_3-pair·boss-boss_5-pair·hidden-boss_9-pair, matches solo-ABYSS-2·coop4-FUNNY-6·coop8-HARD-3·coop2-ABYSS-10-boosted·
  coop2-NORMAL-14-standins·custom-solo-ABYSS-12-battle-boosted).

### `removeBuff`는 부른 순간 맞는 버프만, 하나씩 다시 찾아 지운다 (upstream `126f0bc0`)

- 규칙: 맞는 버프를 먼저 모아(뒤에서부터) 지금 목록에서 하나씩 찾아 지운다. 지우는 중 `onRemove`가 같은 유닛의 다른 버프를 지우면 그 버프는 건너뛰고, 콜백이
  더한 같은 키 버프는 다음 호출 몫(`server/sim/battle/status.js`). 전에는 목록 인덱스를 그대로 돌아 그런 콜백 뒤에 어긋났다(upstream: 萨尔贡 ATK 합산 버프의
  TypeError). 바닐라 호출자는 그 경로에 안 닿는다 — 방어 수정.
- 근거: 공식 클라 `BuffContainer.RemoveBuffs(key)`는 맞는 버프에 끝 표시만 하고 지우는 것은 다음 끝난 버프 확인이다(관리자 노트) — 그래서 클라에는 이 버그가
  없고, 지우는 대상은 이 수정과 같다. **[ASSUMED]** 우리는 그 자리에서 지우고 끝 처리를 한다(클라는 다음 확인 때). 그 차이가 판에 보이는지는 확인 안 함.
- 테스트 `test/sim/remove-buff.test.js`, `test/content/sargon-remove-buff.test.js`(upstream 그대로). golden 변화 없음.

### 凛御银灰(실버애쉬 더 레인프로스트) S3 变革已至는 공중 적도 친다 (upstream PR #749 일부)

- 규칙: S3 동안 공격이 공중 적을 고르고, 같은 줄 추가 대상도 공중 적을 넣는다(`kits/ops/chess_char_5_14-svash2.js` 스킬 `targeting.canHitFly`,
  `beforeAttack`의 줄 대상 프로필). 전에는 발동만 됐다 — 스킬 범위 발동은 이미 공중 적을 센다(`skills.js` `TRIGGER_PROFILE`) — 공중 적만 있으면 켜진 채
  아무도 못 쳤다.
- 근거: PRTS 凛御银灰 S3 备注 「可对空」. upstream PR #749의 트리거 범위 부분은 우리 「스킬 범위 발동」(위)과 겹쳐 안 받음.
- 테스트 `test/content/kits_alt_t5.test.js` 「凛御银灰 S3 变革已至 hits flying enemies」(공중 적 둘만: 켜지고 둘 다 맞음). golden: roster-043.

### 琳琅诗怀雅(스와이어 디 엘리건트 위트) S3 千金一掷는 닫히지 않는다 (관리자 결정 2026-10-22, upstream `4d11e97d`)

- 규칙: S3는 켜지면 그녀가 필드를 떠날 때까지 켜져 있다 — 이중 타격, 처치·특성 지불 금화(상한 10)는 그대로, 금화는 상한에서 멈춘다. 닫힐 때의 금화 사격
  (앞 2-4 범위와 막은 적에게 금화마다 물리 피해 + 작은 밀치기)은 판에서 나오지 않는다(`kits/ops/chess_char_3_04-swire2.js` S3 = `toggle` + `hits: 2`).
- 전에는 포크 전 upstream 관리자 결정(2026-10-04)을 물려받아 금화가 상한이고 스킬 공격 범위에 지상 적이 있으면 스스로 닫고 쐈다. 우리 관리자 결정이 아니었고,
  upstream도 플레이어 요청으로 철회했다.
- 근거: PRTS 卫戍协议/帮助 技能操作 「通常不会自动关闭技能」, 스킬 글은 「主动关闭」 때만 금화를 쓴다 — 이 모드에는 손으로 닫는 조작이 없다.
- 이펙트: S3 끝 동전·`S3_End` 렌더 연결은 남김(`fx.md`, 판에서는 안 나옴).
- 테스트 `test/sim/feedback3-swire-s3.test.js`(upstream 그대로: 적이 범위 안·밖·없음 모두 상한에서 안 닫힘, 사격·밀치기 없음, 퇴각에도 사격 없음),
  `kits_alt_t3.test.js` S3 사례(upstream 그대로). 사격·밀치기·동전 대상 사례는 지움(`feedback1-followups`·`feedback1b-displacement`·`feedback1d-push`
  ·`talent-shot-events`·`playtest5-targeting` 목록). golden: roster-039.

## upstream 0.3.2–0.3.4 대조 이식 — 피해 계산 (2026-10-29)

upstream master `c9d804f4`·dev `06a92237` → master `f07b8965`·dev `71b2363f` 대조에서 받은 피해 계산 수정 6건(관리자 결정 2026-10-29). upstream 0.3.2의 새
상해 판정 커널 위 코드라 모두 손 이식이고, 커널과 순서 모델 자체는 받지 않았다(보류). 6건 모두 우리 엔진에서 같은 증상을 먼저 재현했다(새 시험이 수정 전 코드에서 실패).
이름은 공식 한국어로 쓴다(관리자 결정 2026-10-29, 위 「쓰는 법」).

### 오퍼레이터가 받는 원소 폭발 피해는 회피할 수 있다 (upstream `6c2873eb`, `741428e3`)

- 규칙: 오퍼레이터 쪽 폭발 피해(소각 1200 마법, 침식 800 물리, 쇠약 초당 100 마법)는 다른 물리·마법 피해처럼 회피 판정을 거친다(`server/sim/damage.js resolveBurst`의
  `hit`에서 `canDodge: false`를 뺌). 무출처·처치 귀속은 그대로. 적 쪽 원소 대미지는 원래 회피가 없어 바뀌지 않는다. 신경 손상 폭발의 1000 트루 대미지도 회피 대상이 아니다.
- 근거: 공식 `buff_template_data` `ep_break_fire_char`·`ep_break_water_char`·`ep_break_anger_char`의 무출처 피해 노드 — `_ignoreCancelReasonMask` NONE(회피로
  취소되는 것을 막지 않음).
- 테스트 `test/sim/combat.test.js` 「element bursts on operators can be dodged」.

### 다기(적)는 마법·트루 대미지만 센다 (upstream `741428e3`)

- 규칙: `hitCountArts`(청자 다기 `enemy_1204_msfhu`·채색 다기 `enemy_1204_msfhu_2`)는 마법·트루 대미지 한 번에 1씩 준다. 물리와 원소 대미지는 0(`damage.js`의 빈도 갈래).
  전에는 원소 대미지도 1로 셌다. `hitCount`(다른 빈도 적)는 그대로 모든 종류.
- 근거: 적 표 문구 「마법 혹은 트루 대미지 4회 피격 시 쓰러진다」. 두 적 프리팹은 기물형 적(`PropLikeEnemy`)에 `_acceptSpecificDamageType` 1·`_acceptDamageType`
  MAGICAL이고, 그 적의 HP 조정값은 트루(PURE)와 `_acceptDamageType`만 받고 물리·원소(ELEMENT)는 거절한다(공식 클라에서 확인, 2026-10-29). 다른 빈도 적(`_acceptSpecificDamageType` 0)은 모든 종류를 1로 센다.
- 테스트 `test/content/enemies_bosses.test.js` 「茶器 (hitCountArts)」.

### 호시구마의 「전술 장갑」은 종류·출처를 가리지 않고 막는다 (upstream `741428e3`)

- 규칙: 호시구마(오퍼레이터)의 25 % 대미지 무효화가 모든 피해 한 번 — 트루 대미지, 무출처, 적이 아닌 출처 포함 — 에 걸린다(`kits/ops/chess_char_4_17-hsguma.js`).
  원소 게이지 채움(`element`)은 피해가 아니라 막지 않는다. 전에는 적이 낸 물리·마법만 막았다.
- 근거: 공식 `hsguma_e_002_t` BlockDamage `_filterDamageType` false. `docs/SIM.md` 원소 절의 무효화 문장도 고침.
- 테스트 `test/content/kits_alt_t4.test.js` 「星熊 战术装甲」.

### 틴맨 연금 장판의 피해는 무출처이고 회피할 수 있다 (upstream `aa74f76a`)

- 규칙: 틴맨(오퍼레이터) S1·S2 연금 장판의 초당 마법 피해는 `sourceless`(무출처)다. 그녀의 피해 증가 배율·관통이 안 붙고, 훅은 출처 없이 보며, 처치·통계는 `credit`으로 그녀에게
  간다. 회피 판정도 거친다(`canDodge: false`를 뺌). 재능 「쇠락의 영혼」 배율은 대상 쪽 훅이라 그대로 붙는다(`kits/ops/chess_char_1_16-tinman.js`·`chess_char_2_19-tinman.js`).
  `'dmg'` 이벤트의 공격자 칸(6번째)은 무출처면 null이지만, 이 피해만은 `showSource`로 그녀의 id를 남긴다. 클라가 장판의 틱 소리(`tinman_s_2[audio]`)를 그녀에게
  묶어 내기 때문이다(`damage.js attackerId`). 빼면 실제 판에서 틱 소리가 사라진다(`test/audio-skill-hit-signals.test.js` 실제 매치 경로).
- 근거: 공식 `tinman_s_1`·`tinman_s_2`의 무출처 마법 피해 노드, `_ignoreCancelReasonMask` NONE. 처치 귀속은 우리 엔진의 무출처가 이미 출처를 `credit`으로 남겨 깨지지 않는다.
- 테스트 `test/content/kits_t1t2.test.js` 「锡人 alchemy units」, 기존 틴맨 장판 시험은 `credit`으로 셈.

### 치우바이의 「빈틈 포착」은 맞힌 0.1초 뒤에 본다 (upstream `aa74f76a`)

- 규칙: 치우바이(오퍼레이터)의 공격이 맞으면 「낙화」(모듈 첫 타 3초 속박 또는 확률 속박)를 먼저 걸고, 「빈틈 포착」의 정지·속박 확인과 추가 마법 피해는 0.1초 뒤(`battle.after`)에
  한다. 그래서 같은 타격의 「낙화」 속박도 「빈틈 포착」을 부른다. 공격력은 그때 값(`kits/ops/chess_char_6_15-qiubai.js`).
- 근거: 공식 `qiubai_t_1`(모듈 `qiubai_e_002_t`) — 피해 계산 때 대상에 0.1초 버프를 걸고, 그 버프가 끝날 때 상태를 확인해 마법 피해를 준다.
- 그대로 둔 것: 「빈틈 포착」을 부르는 것은 일반 공격 타격(`afterHit`)뿐이다. upstream은 모든 피해 계산으로 넓혔지만 그것은 상해 판정 커널(보류) 쪽이다.
- 테스트 `test/content/kits_alt_t6.test.js` 「仇白 入隙 checks 0.1 s after the hit」.

### 약점 대미지는 이론 피해로만 종류를 고른다 (upstream `aa74f76a` 3)

- 규칙: 물리·마법 중 큰 쪽을 고를 때 관통 + 방어·마법 저항 공식만 본다. 공격자의 `physDealtMul`·`artsDealtMul`과 대상의 `physTakenMul`·`artsTakenMul`은 넣지 않는다
  (`server/sim/content/garrisons/effects/hits.js weaknessType`). 같으면 원래 종류. 그 앞 기본 우선순위 훅의 공격력 배율(바다 괴물 적 공격 시 공격력 200 % `garrison_18_b` 등)은
  이론 피해에 들어가는 공격력 배율이라 그대로 반영된다.
- 근거: 공식 클라 `WeakDamage`는 물리·마법으로 관통 + 기본 공식만 한 번씩 계산해 비교한다(공식 클라에서 확인). PRTS 용어 설명은 이론 피해에 공격력·공격력 배율·추가 공격력·
  % / 고정 관통·대상 방어·마법 저항만 넣고 「피해 판정 효과는 넣지 않는다」고 한다.
- 테스트 `test/content/garrisons_battle.test.js` 「弱点伤害 compares 理论伤害 only」.

golden: fields boss-boss_1-pair·boss-boss_2-pair·boss-boss_2-solo·boss-boss_3-pair·boss-boss_4-solo·boss-boss_5-pair·boss-boss_7-pair·hidden-boss_9-pair·
hidden-boss_10-pair·unite-2·unite-3-wide, matches coop2-NORMAL-3·coop8-HARD-3·coop2-NORMAL-14-standins·coop2-NORMAL-19-coverage-diy, roster-005·006·017·019·
029·036·037·046·047, 이펙트 golden(`fx-events.json`)은 그 판의 전투가 바뀐 만큼.

### 페가수스의 랜스 추가 트루 대미지는 원래 피해의 30 %, 무출처, 원래 피해보다 먼저 (upstream `741428e3` K10)

- 규칙: 페가수스의 랜스(아이템 `chess_item_6_01_e`)를 페가수스의 투구(`chess_item_5_09_e`)와 같이 들면, 그 오퍼레이터가 주는 부가 피해가 아닌 피해 한 번마다 그 피해의
  `atk_scale`(30 %)만큼 트루 대미지를 더 준다. 기준은 공격 배율까지 곱하고 방어·마법 저항과 피해 판정 효과(주는·받는 피해 배율)를 넣기 전의 값(`hit` 훅의 `dmg.amount`)이다.
  추가 피해는 무출처(`sourceless`, 처치·통계는 `credit`으로 그 오퍼레이터)이고 부가 피해(`addition` 태그)라서 다시 랜스를 부르지 않는다. 원래 피해보다 먼저 들어가므로
  그것만으로 적을 쓰러뜨리면 원래 피해는 들어가지 않는다(`server/sim/content/items/effects/bond.js`). 붙은 드론처럼 부가 피해로 치는 공격분에는 붙지 않는다.
  전에는 `damaged` 뒤에 공격력 × 30 %를 그 오퍼레이터 출처로 모든 피해(아이템 효과 피해만 빼고)에 붙였다.
- 무에나(오퍼레이터) 스킬의 「자기 일반 공격(과 그 공격에 딸린 피해)으로 쓰러뜨림」은 공격이 맞은 대상을 `hit` 때도 잡는다. 랜스 피해가 먼저 쓰러뜨려도 그의
  처치로 센다(`kits/ops/chess_char_5_19-mlynar.js ownKills`).
- 근거: PRTS 맹약 기록(하) 장비 데이터베이스의 페가수스의 랜스 비고 — 「仅在造成非附加伤害时额外造成无来源真伤附加伤害」, 「额外造成的伤害基于原伤害计算攻击倍率后、计算单位防御力/法术抗性以及
  所有伤判效果前的伤害数值，且先于原伤害处理完毕」. 공식 표의 값 키는 `act2autochess_equip_acarm117_global_buff` `atk_scale` 0.3.
  원래 피해가 회피돼도 추가 피해는 들어간다 — 템플릿 거르기에 `_filterModifierCancelled`가 없음(위 「act2 맹약·장비 템플릿 대조」, 2026-10-31).
- 테스트 `test/content/item-pegasus.test.js`(옛 코드에서 실패), `test/content/items.test.js` 「天马之盔 + 天马之枪」, `test/content/feedback1b_kits.test.js` 「B4 玛恩纳」, `test/sim/funnel-body.test.js` 「Pegasus riders」.
  golden: fields boss-boss_2-pair·boss-boss_3-solo·boss-boss_5-pair·hidden-boss_8-pair·hidden-boss_10-pair, 이펙트 golden boss-boss_5-pair·hidden-boss_10-pair.

## upstream 0.3.1·0.3.2 대조 이식 — 매치 (2026-10-22)

같은 대조에서 받은 매치 층 수정(관리자 결정 2026-10-22). upstream 판정 목록은 `upstream.md`.

### 凯瑟琳(전략) 【定向投放】의 突变细胞는 한 판에 한 번 (upstream #677, `f8bca717` `83ccfcd7`)

- 규칙: 凯瑟琳의 제시(위 「凯瑟琳 【定向投放】은 突变细胞도 준다」)에서 突变细胞를 **골라 손에 넣으면** 그 플레이어의 카운터
  `band:cathy:cellTaken`이 서고, 그 뒤 그녀의 제시는 突变细胞를 빼고 뽑는다(`bands/meta.js up_shop_add_special_goods` — 출처 `band:band_cathy`로
  표시). 이미 쌓여 있던 그녀의 제시에서도 突变细胞 칸만 빠지고 다른 칸은 다시 뽑지 않는다(`player/prep.js pickReward`, 칸이 다 빠진 제시는 사라짐).
  빼야 할 것이 있으면 뽑기 전에 후보에서 빼고 겹치지 않게 하나씩 뽑아(`spDraft.js rollItemId`·`rollPool`의 `exclude`), 남은 후보가 있는 한 칸이 모자라지
  않는다. 봇도 같은 `pickReward` 경로라 같은 제한.
- 근거: activity_table `aceffect_band_26`(count 3, choice 1, `pool_equip_kathe`)에는 횟수 제한이 없다. upstream 관리자의 공식 플레이 기억(2026-10-17)
  을 우리 관리자 결정 2026-10-22로 받음 — **[ASSUMED]**.
- **[ASSUMED]**: 보여 주기만 하고 안 고르거나 손이 차서 거절된 고름은 제한을 쓰지 않는다. 昆图斯(전략)의 3라운드 突变细胞(`aceffect_band_41`)는 따로
  — 그 지급은 제한을 안 쓰고, 제한이 선 뒤에도 그대로 받는다. 제한은 플레이어마다(협동에서 다른 플레이어의 凯瑟琳은 따로).
- upstream과 다른 점: 우리 풀은 효과 전용 장비를 `plus`로 적고(upstream `also`) `weighted` 풀에는 `plus`를 안 붙인다. 효과를 물려받는 전략
  (`effectRef`)이 우리에 없어 그 부분은 안 받음.
- 테스트 `test/match/catherine-cell.test.js`(upstream 파일을 우리 하네스로 — 11건, 옛 코드에서 10건 실패 확인), `feedback5-cathy-pool.test.js` 그대로.
  golden 변화 없음(凯瑟琳이 나오는 matches coop4-ABYSS-7은 突变细胞를 고르지 않음).

### 4인 보스전 짝은 보스 웨이브마다 새로 뽑는다 (upstream #845, 우리 구현)

- 규칙: 최종 공세·히든 코어(보스 웨이브)마다 살아 있는 플레이어를 섞어 둘씩 짝짓고, 홀수면 한 명 혼자(`finalAssault.js pairPlayers` — 매치의
  `rng('pairs')` 흐름 하나만 써서 다른 난수 순서는 그대로). 짝 안에서는 좌석이 앞인 쪽이 왼쪽 반, 필드 번호는 짝의 첫 좌석 순. 라운드 시작에 뽑아
  `bossWaves`에 두고(준비 미리보기·`bossMate`·배치 반쪽), 전투는 그 짝을 그대로 쓴다(`bossRounds.js` — 준비 중 누가 나가면 남은 사람끼리 다시
  뽑음, 전과 같음). 클라 준비 화면의 반쪽 카메라·팀 패널 녹색 테두리는 `m.public bossPairs`를 읽는다(`ui/gameLogic/camera.js bossPairOf`; 보내지
  않는 서버면 예전처럼 좌석 순). 전에는 늘 좌석 순 (1,2)·(3,4)였다.
- 근거: 공식 영상 BV1VCXyBjEN1 p1 40–45분 — 14웨이브 1-4·2-3, 15웨이브 1-2·3-4로 짝이 바뀐다(upstream #845 본문).
- **[ASSUMED]**: 섞는 방식(균등), 짝 안의 좌우(좌석 앞이 왼쪽), 혼자 남는 사람도 뽑기로 정함.
- 감사(`audit.js`): 「좌석 짝」 대신 필드 = 준비 때 뽑은 짝, 살아 있는 사람마다 한 번, 둘씩(홀수면 하나만 혼자), 짝 안 좌석 순.
- 테스트 `test/match/finalAssault.test.js`(뽑기: 같은 시드 같은 짝, 넷의 세 가지 짝이 모두 나옴, 홀수), `feedback5-boss-pair-prep.test.js`(시드 5101 —
  p_0·p_3 / p_1·p_2가 `bossMate`·배치 반쪽·`bossPairs`·클라 반쪽·녹색 테두리·전투 필드에 같고 감사 통과), `test/ui/gameLogic.test.js`(`bossPairs`의 반쪽·
  테두리). 좌석 짝을 전제한 기존 매치 테스트는 `m.rngPairs`를 좌석 순으로 고정. golden: matches coop4-FUNNY-6·coop8-HARD-3(보스 라운드에 셋 이상
  살아 있는 판).

### 联防에서 태어난 적(분열·소환)은 누수자 LP·×N에서 빠진다 (upstream PR #675, `fc9323c3` `212a796e`)

- 규칙: 联防 필드가 돌 때 새로 생긴 적 — 분열 자식(磨砻의 木制瑞印, 沉沙의 断刃), 소환물, 변신 사본, 보스 환영 — 은 태어날 때 `uniteRuntime`
  표시를 받는다(`battle/spawns.js spawnEnemy`: 필드 `kind === 'unite'`이고 스테이지 대기열(`_scheduled`)에서 나온 적이 아니면). 그 적은 누수자의
  LP(`unite.js uniteSurvivors`)와 ×N(`spec.js uniteLeft`)에서 빠진다 — 누수자의 문을 지난 적이 아니므로. 셈 표시일 뿐이라 `counted`(처치 수·
  `killed`·완벽 작전 판정)와 HUD 캡슐은 다른 필드와 같다. 누수자 **자기 전투에서** 분열해 그 자식이 새어 나갔다면 그 자식은 联防 웨이브에 그대로
  들어가 예전처럼 청구된다. 실시간 ×N 상한도 「보낸 수 + 자식 상한」에서 「보낸 수」로(`fields.js uniteBillBounds` = `keySourceCounts`).
- 클라 실행 결과 검증(`fields.js validateClientResult`): `uniteRuntime` 누수는 그 누수자가 보낸 부모의 자식 예산(`takeDerived` — 공식
  enemy_database `DeadSpawn.enemy_key`/`.cnt`)으로만 받고, 예산이 없으면 결과를 거절(`unite runtime`)해 서버가 다시 시뮬한다(`SP_VERIFY` 꺼짐에서도).
  표시는 그 뒤에만, 联防 사양에서만 남긴다(다른 필드의 위조 표시는 버림). `resultDigest`·`compactResult`·`shared/protocol.js isLeak`이 그 필드를 싣는다.
- 근거: NGA 실측 글(「队友协防时打爆，爆出来的次数怪进门不扣血」, upstream PR #675 인용), 공식 표에는 반대 근거 없음 — 관리자 결정 2026-10-22,
  **[ASSUMED]**.
- **[ASSUMED]** 남는 틈: 예산은 출처를 증명하지 못한다 — 스케줄된 몸이면서 다른 적의 자식이기도 한 키는 자식 예산 안에서 표시될 수 있고,
  `SP_VERIFY=all`만 닫는다.
- 테스트(upstream 것을 우리 파일에): `test/sim/hud-capsule-resolved.test.js`(联防/자기 필드 磨砻 분열 대조), `test/match/playtest6-matchflow.test.js`
  (×N이 분열로 오르지 않음, 상한 = 보낸 수), `test/match/clientCombat-review.test.js`(표시 왕복·자식 예산 초과 거절·위조 표시 버림·거절 뒤 서버 재시뮬).
  golden: matches coop8-HARD-3(`rounds[7]`의 联防부터 ai_1·ai_7이 각 2 LP 덜 잃음 — 끝 팀 LP 86 → 90).

## 荒芜拉普兰德 S2·S3 중에도 본체 평타 (2026-10-23, 버그 제보·관리자 결정 2026-10-23 「공식 클라대로」)

제보: 라플란드 더 데카덴차(荒芜拉普兰德, `chess_char_6_18`)가 S3 终幕·浩劫 동안 일반 공격을 하지 않는다.
- **공식**(EN 클라 캐릭터 프리팹 `char_1038_whitw2`, 공식 클라에서 확인): S3 모드에는 본체 공격 `Modes/S3/Body/Attack`이 따로 있다 — 클립 `Skill_3_Loop`,
  탄 `projectile_chr_whitw2_s3`, `_atkScale` 1.0, `_damageType` 2(법술), `_attackType` 1(일반), 선택기 `_maxNum` 1(자기 사거리), **`_funnelActions` 없음**.
  드론은 따로 있는 일반 능력 `GeneralAbilities/WolvesDispersed`(S3Funnel1–4)다. 기본 모드 `M0FunnelsNormalAttack`·S1/S2 모드 공격은 본체 탄 + `_funnelActions`.
  스킬 문구에도 공격을 멈춘다는 말이 없다.
- **원인**: S3 스펙이 `attack: { noAttack: true }`로 스킬 내내 본체 공격을 껐다(0.1.2 「드론이 전부 나가 있으니 본체 공격 없음」 추론, 0.2.0 item 46에서
  「버그 아님」으로 고정).
- **변경**(`server/sim/content/kits/ops/chess_char_6_18-whitw2.js` S3): `attack: { funnelMul: null, hits: 1 }` — S3 동안 본체 1.0배 법술 `isAttack` 한 방만,
  부유 유닛 추가 피해 없음(头狼 3단계의 `hits` +1도 이 공격엔 없음). 사거리·타이밍은 S3 모드 데이터 그대로(`attackAnim.skills[2]` `Skill_3_Loop`, `shot.skills[2]`).
  드론 비행·공격·장판은 그대로. 공격 덮어쓰기라 그 피해는 `isSkill`(S2와 같은 꼴; 이 키트에 `isSkill`을 읽는 곳 없음).
- 테스트 `test/sim/feedback2-whitw2-yu.test.js`(S3 ③: 본체 ATK×1.0 법술 한 방/공격, `funnel` 추가 피해 없음, 缴械면 멈춤; 드론 재등장 검사는 본체를 缴械로 묶음),
  `test/sim/feedback5-cb3-pins.test.js`(item 46: S3 중 공격 ≥ 20, 끝난 뒤 추가 피해 돌아옴), `test/content/kits_t6.test.js`(头狼 3단계 추가 피해는 스킬 밖 공격으로 봄).
  golden: roster-017·019, boss-boss_5-pair·boss_7-pair·hidden-boss_9-pair, solo-HARD-2, coop2-NORMAL-1-coverage-standins·unowned-roster,
  custom-solo-ABYSS-12-battle-boosted(그녀가 S3를 쓰는 판); fx golden 같은 판에 S3 본체 시전 `whitw2_skill_03_start_01`.
- **S2 逐猎狂飙도 같음**(같은 날, 관리자 결정 「공식 클라대로」): 스킬 문구는 부유 유닛만 말하지만(S1 문구도 같고 S1은 이미 본체 + 부유), 클라 S2 모드 공격
  `Modes/S2/Body/M2FunnelRemoteAttack`이 본체 탄 `projectile_chr_whitw2_s2`(`_atkScale` 1.0, 법술, 일반 공격)를 쏘고 그다음 부유 유닛을 푼다. 본체 대상은 자기
  선택기(`_maxNum` 1, `_postFilter` 4 — 기본·S1·S3 공격과 같은 정렬), 부유 유닛은 자기 선택기(`_alwaysUseFunnelSelector` 1, 각 `S2Funnel*/Selector`
  `_postFilter` 14). 본체 탄 프리팹의 타격 설정(타격 1회·추적 대상에 반드시 맞음·명중 `whitw2_hit_01`)은 기본·S1·S3 본체 탄과 같고 꼬리만 다르다.
  **[ASSUMED]** 실제 판 피해 숫자로는 안 봄.
  - 변경: S2 공격의 대상 = [본체 대상(엔진의 평소 선택, 없으면 스킬 범위에서 그녀의 우선순위 첫 적), 잠금 1 + `attack@cnt`(+头狼 3단계)개]. 첫 대상은
    1.0배(램프·공포 굴림 없음), 나머지는 예전 그대로(대상별 램프, `attack@prob` 공포, `isAttack`·`isSkill`). 엔진: 프로필 `funnelMul`이 4번째 인자로 그 타격의
    `info`(`index` 포함), `onEachHit` 컨텍스트에 `index`(`ai.js resolveHit`, 이전 키트는 안 읽음). 렌더 `fxgame.js atkPart`: 그녀의 S2 모드에서 한 순간의 첫 'atk'은
    본체 꼬리만, 나머지는 잠금 드론만(전에는 'atk'마다 본체 꼬리 + 드론).
  - 테스트 `test/sim/funnel-body.test.js`(S2: 한 일제 사격에 100% 본체 하나, 부착 추가 피해 없음), `test/content/kits_alt_t6.test.js`(대상 = 본체 + 4, 본체
    ATK×1.0, 잠금은 init부터). golden: roster-047(그녀가 S2).

## 「다음 공격」 스킬은 그 휘두름이 끝나면 꺼짐 (2026-10-25, 제보·관리자 결정 2026-10-25 「공식 클라 확인 후 수정」)

제보: 기습(突袭) 맹약의 瑕光(블레미샤인) S1 — SP줄이 스킬이 켜진 것처럼 주황으로 10초쯤 있다가, 공격하지 않아서 점프한다.
- **원인**: 「다음 공격」 스킬(`spec.attack`이 있는 즉발·충전 스킬, `replace` 시전)은 공격 직전에 켜지고(`pending`) 그 공격이 실제로 나가야 꺼졌다.
  휘두르는 도중 대상이 죽거나(아군 막타 — 기습 멤버가 한 적에게 몰리면 흔함) 휘두름이 끊기면 스킬은 켜진 채 다음 공격을 기다렸고, 주위에 적이 없으면
  그대로 남았다(주황 SP줄). 기습의 「스킬 준비됨」 점프는 「스킬이 안 켜짐」을 요구하고, 스킬 시작 점프는 시작할 때 적을 막고 있으면 없으므로, 10초 무공격
  점프(`no_attack_duration`)로만 움직였고 그 시전 몫 충전 1회도 잃었다.
- **공식**(EN 클라 스킬 프리팹·스킬 클래스, 공식 클라에서 확인): 瑕光 S1 `skchr_blemsh_1`은 `ReplacementSkill`(`_cancelIfSearchTargetFailed` 1,
  `_recoverSpIfTargetDead` 1), 그 공격 능력 `_selectTargetTiming` 0·`_interuptIfTargetDead` 0 — 대상이 죽어도 휘두름은 끝까지(헛스윙, 위 「일반 공격 타이밍」).
  공격 능력의 종료 콜백(`Character.States.AttackState`)은 **종료 이유와 상관없이**(정상·끊김·대상 사망) `Character.OnAfterAttack` → 스킬
  `NextAttackOrCombatSkill.OnAfterAttack` → `CancelAfterAttack`을 부르고, 끝난 능력이 그 스킬의 능력이면 등록을 지운다(`ReplacementSkill`:
  `Character.UnregisterReplacement`, `NextAtkAdditionSkill`: `Ability.Detach`) — 이유 검사 없음. SP 반환은 `ReplacementSkill.OnCastFinish` 하나:
  `_recoverSpIfTargetDead`이고 종료 이유가 `TARGET_DEAD`이고 아직 타격 전(`CheckAtPreCastPhase`)이며 그 스킬이 지금 등록된 대체일 때 `spCost` SP.
  풀의 `ReplacementSkill` 49개 중 48개가 `_recoverSpIfTargetDead` 1(0은 维娜·维多利亚 S1 `skchr_siege2_1`).
- **변경**(`server/sim/ai.js dropNextAttack`): 「다음 공격」 시전이 실린 휘두름(스킬 프로필로 시작한 휘두름, `replace` 휘두름)이 그 공격 없이 끝나면 —
  끊김(`cutAllySwing`: 기절·빙결·수면·缴械 등), 헛스윙(타격 때 대상이 모두 사라짐), 타격 때 다시 골라 아무도 없음 — 스킬을 끝낸다(`end('cancel')`).
  SP는 마지막 경우(`TARGET_DEAD`, 타격 전)만 충전 1회 돌려준다 **[ASSUMED: `_recoverSpIfTargetDead`를 데이터로 옮기지 않아 모두 1로 봄; 지금 데이터에서
  `replace` 시전 스킬은 모두 `_selectTargetTiming` 0이라 이 경우는 안 생김]**. 시전 전에 시작한 일반 휘두름(그 도중 TAKE_DAMAGE 시전)은 그 스킬의 것이
  아니라 시전은 다음 공격을 기다린다(`CancelAfterAttack`의 능력 비교). 위 「즉발 스킬의 시전」의 「휘두름이 끊기면 다음 공격을 기다린다」(2026-10-11 구현 가정)를 고침.
  이제 헛스윙 직후 瑕光은 S1이 꺼지고, 다른 적이 생기면 다음 폴링에 「스킬 준비됨」 점프로 간다.
- 테스트 `test/content/bonds_addon.test.js` 「突袭: 瑕光 S1 cast on an attack whose target dies in the wind-up is spent …」,
  `test/sim/instant-cast.test.js` 「'replace': a swing of the cast cut before its strike (stun) spends it …」.
  golden: 「다음 공격」 스킬이 헛스윙·끊김을 겪는 판 전부 — bonds 7(deputShip-low·kjeragShip-high·maniShip-low·miraShip-high·soloShip-high·steadShip-low·
  yanShip-high), diy-002·005, fields 6(boss_1-solo·boss_2/3/4-pair·hidden-boss_9-pair/solo), matches 11, roster 20.
- **[화면 미확인]** 실제 판·브라우저에서 기습 瑕光의 주황 SP줄이 헛스윙 뒤 바로 돌아오는지.

## 佩佩(전략) 【博学多通】 특별 갱신은 쌓이지 않는다 (2026-10-26, 공식 플레이 제보)

- 문제: 조달 센터를 2·4·6레벨로 올릴 때마다 대기 중인 특별 갱신(特殊刷新)이 하나씩 더해져(`band:pepe:special` += 1, upstream 그대로), 2레벨에서
  받은 것을 아껴 두고 4레벨까지 올리면 사르곤 우선 갱신을 두 번 쓸 수 있었다.
- 규칙: 대기 중인 특별 갱신은 많아야 1회. lvlist 레벨에 오르면 카운터를 1로 둔다(`bands/meta.js up_shop_next_refresh_must_present_bond_char`
  `onLevelUp` → `setCounter`). 수동 갱신 한 번이 그것을 쓰고, 가격은 전과 같이 평소 갱신 값(upstream #200).
- 근거: 공식 플레이 경험 제보(2026-10-26) — 2레벨의 특별 갱신을 아껴 두었다가 4레벨로 올려도 쓸 수 있는 것은 1회. 공식 클라에서 확인: 상점 정보의
  `specialRefresh`는 참/거짓이고, 플레이어 상태의 `speRefresh.cnt`를 어떻게 올리는지는 서버 판정이라 클라만으로는 정해지지 않는다. 테이블
  `aceffect_band_29`(`lvlist` "2,4,6", `cnt`·`price` 0)도 중첩을 적지 않는다. upstream에는 중첩을 다룬 이슈가 없다(#200 #508 #589는 모두 유료 여부).
- 테스트 `test/local-patch.test.js` 「佩佩 博学多通: special refreshes do not stack …」.

## 8인 협동 모드 (관리자 결정 2026-10-16·2026-10-19·2026-11-01, 공식에 없는 기능)

공식 방은 1–4명이고 8인용 데이터는 없다(`act2autochess`에는 난이도별 `bloodPoint*`와 단일·멀티 연합 방어 템플릿뿐). 아래 수치·규칙은 모두
**[ASSUMED]** — 원칙은 「1인당 체감을 4인 협동과 같게」(관리자 결정 2026-10-16).
- **규정**(관리자 요청 2026-11-16): 규정 시즌의 방도 8석을 연다. 수치는 아래와 같은 `eightPlayer`(시즌 설정에 같은 값), 맹약 밴은 그 시즌의 4인 표,
  규정만의 규칙(전투 중 정비 구역·보스전 층수 획득·연합 방어의 남은 재배치 시간 등)은 4인 판과 같이 자리마다 돈다. 실제 매치 경로 규정 8인 한 판:
  `test/eight-player.test.js`.
- **방·매칭** (`server/lobby.js`, `server/matchmaking.js`): 별도 방 크기 — `room.create { mode: 'coop', size: 8 }`, `room.state.size`. 대기실에서 방장이
  `room.setSize { size }`로 4인 ↔ 8인을 바꿀 수 있다(관리자 결정 2026-11-02; 판 시작 전만, 매칭 중이면 `ERR.MATCHING`): 8인으로 바꾸면 AI 좌석은 비우고
  사람은 자리 그대로, 4인으로는 앉은 사람(로컬 디버그의 AI 좌석 포함, 관전석 제외)이 5명 이상이면 거부(`ERR.ROOM_FULL`)하고 4명 이하면 자리 순서대로
  앞 네 자리로 옮긴다. 바꾸면 다른 박사의 준비가 풀린다(난이도·규칙 변경과 같음). 사람만 앉고(AI 좌석
  거부, 넘겨받은 AI 좌석은 버림) 박사 5명 이상이면 시작(`shared/constants.js LARGE_MIN_PLAYERS`, 모자라면 `ERR.SEATS_OPEN`, 코드 방 포함 —
  관리자 결정 2026-11-01; 그 전엔 8자리가 다 차야 시작, 2026-10-19). 재시작 투표·브리핑 「다시 뽑기」로 여는 새 판도 같은 조건 —
  판 중에 나가 5명 아래면 대기실로(관리자 결정 2026-11-02, `ui.md` 「게임 중 재시작 투표」). 예외는 시험용 로컬
  디버그 모드(`SP_DEBUG_PAGE=1`이나 `SP_DEBUG_FUNDS`, `server/local-patch.js largeBots`): 8석 방에도 AI 좌석을 받고 사람·AI 합쳐 5자리 이상이면 시작
  (`room.state.largeBots`, 방 화면의 「添加 AI 队友」). 배포 서버는 둘 다 꺼져 있어 위 규칙 그대로. 8인 전용 대기열(`room.queue { size: 8 }`,
  8석 방의 `room.queueRoom`)은 8명이 모이면 묶이고, 5명 이상 기다릴 때는 **바로 시작 투표**로 먼저 시작할 수 있다(관리자 결정 2026-11-02;
  `server/matchmaking.js` 머리말): 대기자 누구든 제안(`room.queueVote`, 4인 대기열은 `BAD_TARGET`) → 그 대기열의 대기자 전원이 15초 투표
  (`room.matchFound { vote, need, declined, no, by }`, 답은 `room.queueAccept`, 제안자는 찬성으로 셈) → 모두 답하거나 시간이 끝나면 찬성한 항목(방 항목은
  방 사람 모두 찬성일 때만)의 사람이 5명 이상이면 그 사람끼리 8석 방에서 시작(그룹 8명과 같은 `launch`), 나머지는 원래 순서로 대기열 앞에 남아 계속 8명을
  기다림(`room.queueState { vote: 'started', started }`). 찬성이 5명 미만이면 모두 남고(`vote: 'failed'`) 그 대기열은 30초 동안 새 제안을 안 받음
  (`ERR.RATE`). 반대·무응답은 대기열에서 빠지지 않고, 투표 중 나가는 사람(취소·방 인원 변동·재접속 창 만료)만 빠지며 투표는 그 사람 없이 계속.
  투표 중 새로 들어온 사람은 투표 밖에서 기다림. 화면은 `ui.md` 「8인 협동 모드 화면」. 시작 인원에 맞춘 수치는 아래 「수치」 그대로. 대기열 메시지에 `size: 8`, `lobby.queueCounts`에 `counts8`. 끊긴 사람은 4인처럼 AI 托管 없이
  전투만 서버가 이어 돌림(관리자 확인 2026-10-19, `server/match/match/platform.js onDisconnect`).
- **수치** (`data/config.json eightPlayer` ← `tools/build-data.mjs`, `server/match/gamedata.js` `large`): 상점 풀 솔로 ×4(4인 ×2), 장비 재고 ×2,
  맹약 밴은 4인과 같이 난이도별 표(NORMAL 이상 핵심 3·부가 4, FUNNY 0/1; 풀이 2배라 맹약마다 확률이 같음 — 관리자 결정 2026-10-22, 전엔 핵심 1·부가 2),
  보스 초과 시간 팀 LP 초당 2(4인 1), 숨겨진 핵심 조건 활성 층수 합 > 2400 고정(관리자 결정
  2026-10-19; 처음 안은 생존자 1인당 300), 리더 HP 인원 상한 8, 机变 카드 12장(R11 机密商店은 공식 6칸을 두 번 뽑아
  12장 — 6장이면 7·8번째가 못 고름, 관리자 결정 2026-10-22). 위 값은 8명일 때이고, **시작 인원 n(5–8)에 맞춰 4인 값과 8인 값 사이를
  직선으로** 잡는다(관리자 결정 2026-11-01; `gd.largeAt`, n이 정해지는 곳은 `Match`가 넘기는 좌석 수): 상점 풀 솔로 × n/2(오퍼레이터마다 반올림),
  장비 재고 × n/4(반올림), 숨겨진 핵심 300 × n, 보스 초과 시간 초당 n/4 반올림(5명 1, 6–8명 2), 연합 방어 도우미 n/2 내림(5명 2, 6–7명 3), 机变 카드
  1.5n 반올림(5명 8, 6명 9, 7명 11), 리더 HP 인원 상한 n. 이 값은 판 시작 때 정해져 **중간 탈락·퇴장으로 바뀌지 않는다** — 4인 판의 상점 풀 ×2가
  인원과 상관없이 그대로인 것과 같다(관리자 결정 2026-11-01). 리더 HP는 4인처럼 그 전투 시작 때 산 사람 수를 따른다. 맹약 밴은 인원과 상관없이
  4인 표. 보스 초과 시간의 초당 LP는 8석 판에서 `m.public.overtimeDrain`으로 보내 HUD 경고가 서버와 같은 값을 보인다(그 전엔 8인 판에서도 1로
  보였음). 최종 공세 120초·팀 LP(생존자 합)·턴 시간(전략 50초, 机变 30 + 16초)은
  4인 그대로(관리자 결정 2026-10-16). 근거와 비교표(맹약 밴 시뮬레이션 2000판 포함): 관리자 노트.
- **연합 방어 3–4인** (관리자 결정 2026-10-19 — 10-16의 「도우미 2명 유지」를 바꿈; `server/sim/wideStage.js`, `server/match/unite.js`,
  `server/match/waves.js buildUniteWave`): 도우미 최대 4명(순서 기준은 2명 때와 같음). 1명 = 자기 필드, 2명 = 지금 2인 필드, 3–4명 = **넓은 필드, 도우미
  한 명에 절반 하나**(전장 한 줄 = 9열 절반 둘을 8열 간격으로 이은 것): **3명 = 2인 필드 오른쪽에 1인 맵(절반 하나)을 붙임** — 열 11–18을 8열 오른쪽에
  되풀이해 29열, **4명 = 2인 필드를 가로로 두 벌** — 열 3–18을 16열 오른쪽에 되풀이해 37열(`GEO.WIDE_COLS`). 붙이는 쪽은 적이 들어오는 오른쪽(출구 열 2는
  그대로; 관리자 결정 2026-10-19). 옛 오른쪽 스폰(열 18)이 이음매가 되고, 되풀이하지 않는 왼쪽 열은 한 번, 열 19–20(벽)은 밀린 만큼 오른쪽으로. 장치·맵
  캐릭터는 되풀이한 열마다 둘. 도우미는 오른쪽 절반부터(1번이 적을 가장 먼저 만남) 열 오프셋 16·8·0 / 24·16·8·0 — 빈 절반 없음. 적은 맨 오른쪽(열 26 / 34)
  으로 들어와 붙인 절반의 경로 → 이음매 → 2인 필드의 경로로 같은 출구(`widenRoute`). 제한 시간은 그 라운드 전투 시간 × 절반 수 ÷ 2(경로 길이 비례 —
  3명 ×1.5, 4명 ×2; 관리자 결정 2026-10-19; 걷는 적 28.1초 → 42.1초 / 56.1초). 현상금·沙尘暴·비행 소환 칸의 「반쪽」은 열 오프셋으로 나눈 구간
  (`wideSpan`: 2인 필드의 ≤10 / ≥11과 같은 꼴).
- **보스 피해 알림**(관리자 결정 2026-10-19; `server/match/finalAssault.js bossHitSteps`): 공식 20/50/80%(`comment_boss_hit_1..3`)는 내 피해 ÷
  공유 풀이라 8인은 평균 기여 12.5%로 거의 안 뜸 → 보스 라운드 시작 때 산 사람이 4명을 넘으면 기준 × 4 ÷ 산 사람(8명 10/25/40%, 5명 16/40/64%).
  공식 문구는 숫자가 박혀 있어 그때는 우리 문구 「{이름} 박사님이 리더 적에게 입힌 대미지 N% 초과!」(같은 종류·우선순위 30, 방송 id 없음). 4명
  이하(4인·단독)는 공식 그대로. 확인 `test/match/bosshit-ticker.test.js`(8명 실제 매치 경로: 최종 공세 40%, 히든 코어 각자 10%).
- **방 트래픽**(관리자 요청 2026-10-19): `m.public` 방송은 인원만큼 커지고 인원 모두에게 가서 방 전체로 n². 방송 대부분이 앞 방송의 되풀이였다
  (맹약 줄만 8인 62%) → 판의 첫 방송 다음부터 바뀐 것만: `delta: true`, 바뀐 윗단 칸(`t`·`serverNow`·`players`는 늘)과 없어진 칸 `$rm`, `players[]`
  줄마다 `playerId`·바뀐 칸·`$rm`(`server/match/match/messaging.js _publicDelta`, 브라우저는 `shared/protocol.js mergePublic`으로 가진 것에 합침).
  바뀐 칸은 통째나, 그보다 짧을 때 그 칸만의 delta: 목록(`shared/protocol.js PUBLIC_LIST_KEYS` — 줄의 맹약 `bondId`, `fields`의 `fieldId`, 机变
  카드 `idx`)은 `{ $list }`로 안 바뀐 항목을 키로만, 객체(机变·전략 드래프트)는 `{ $d: 1 }`로 바뀐 칸만 — 맹약 하나가 움직여도 그 사람 맹약 목록이
  통째로, 机变을 고를 때마다 카드 12장이 통째로 가던 몫. 재접속·관전 입장의 한 사람 m.public(그 뒤 첫 방송도)·판의 마지막 방송은 전부. 전원 托管
  NORMAL seed 3 한 판: 8인 방송 1805 → 185 KB(10%, 방 전체 약 14.1 → 1.4 MB; 맹약 151 → 74 KB, 机变 131 → 16 KB), 4인 739 → 92 KB(12%).
  확인 `test/match/public-delta.test.js`(합친 방송 = 전체 view, 첫·마지막 방송 전부, 재접속 뒤 첫 방송 전부, 맹약 `$list`·机变 `$d`).
- **시뮬 격자**: 전투 격자 폭(`server/sim/constants.js COLS`)을 37로 넓힘 — 다른 필드는 그 안의 21열만 씀. 좌우 반전(최종 공세 오른쪽)은 전장 폭
  `STAGE_COLS`(21)로(`battle/players.js`, `content/tokens.js`, `match/finalAssault.js`, `match/board.js`). 넓힌 뒤 골든 161개 그대로, 실행 시간 같음.
- **규칙 모드**: 4인·8인 모두 클래식·캐주얼·커스텀을 고름(방 크기와 규칙은 따로; 공개 매칭은 클래식·캐주얼만, 크기별 대기열). 8석 방의 커스텀 설정 창·요약의
  「공식값」(맹약 밴)은 8인 값과 비교(`shared/ruleset.js officialBans`; 2026-10-22부터 4인과 같은 표), 8석 방에는 「AI 队友最后选择」를 안 보임(AI 좌석 없음; 관리자 결정 2026-10-19).
  8석 방에서도 커스텀을 막지 않고, 커스텀이 정한 값이 8인 수치 대신 쓰인다(맹약 밴 수 `gd.bans`; 상점 풀 %는 8인 수량에 곱함 — `ui.md` 「상점 풀」;
  관리자 결정 2026-10-20).
- **화면**: 29·37열 필드 그리기(넓힌 무대 기록 `shared/wideField.js`, 공식 3D 씬 사본, 카메라, ‹ › H0–H3)는 `render.md` 「8인 넓은 연합 방어 필드
  그리기」(화면 확인은 그쪽), 로비·방·본판 화면은 `ui.md` 「8인 협동 모드 화면」. 열 함수(`wideCols`·`widenRow`…)는 `shared/wideField.js`에 있고
  `server/sim/wideStage.js`가 다시 내보냄.
- 테스트 `test/queue-vote.test.js`(바로 시작 투표: 4인·5명 미만 거부, 6명 중 5명 찬성 시작·1명 남음, 실패·재제안 막힘, 무응답은 시간 끝에 찬성자끼리,
  투표 중 취소, 방 항목은 방 사람 모두 찬성일 때만), `test/eight-player.test.js`(수치, 5–7명의 직선 배율, 8석 방 5명 시작·대기열, 실제 매치 경로 5석 판(R3에 한 명 퇴장해도 수치 그대로), 실제 매치 경로 8인 한 판, 넓은 필드의 열·장치·경로, 걷는 적이 네 절반을 지나 2배 시간, 3–4명일 때만
  넓은 필드·시간 ×1.5 / ×2·오프셋, 8석 방의 공식 밴 기준·AI 옵션 숨김). golden: matches `coop8-HARD-3`, fields `unite-4-wide`·`unite-3-wide` 추가(다른
  시나리오는 그대로).

## upstream 0.3.2–0.3.4 대조 이식 — 적·보스 (2026-10-29)

같은 대조(위 「피해 계산」 절)에서 받은 적·보스 수정 5건(관리자 결정 2026-10-29, 묶음 B). 모두 손 이식이고, 5건 모두 우리 엔진에서 먼저 재현했다(새 시험이 수정 전 코드에서
실패). 시험은 모두 `test/content/enemies_bosses.test.js` 끝의 「upstream 0.3.2–0.3.4 comparison, enemies and leaders」.

### 자기 공격 루프 보스의 스킬도 공격 차례를 쓴다 (upstream `29dec9ba`, `b0faa58b` 일부, upstream #797)

- 규칙: 「적 스킬 = 일반 공격 차례」를 엔진 일반 공격이 아닌 자기 공격 루프로 공격하는 키트에도 건다. 가상적: 관·현(보스)의 전장 전체 공격(`bosses.js pipeCore`)과 '사미의 의지'(보스)의
  [고드름](`kitDeer`)은 공격 차례가 오면 먼저 `enemySkillSlot` 훅을 내고(`ownAttackTurn`), 엔진과 같은 `content/enemies.js onSkillSlot`이 준비된 표 스킬([열관의 연주]·[단현의 연주],
  [자연의 요동]·Doom)을 골라 그 공격 **대신** 시전한다. 다음 공격은 `atkCd` 뒤, 시전 클립(`data/enemies.json` `skillCast`)이 끝난 뒤. 이 키트는 `ab.ownAttack`을 켜서 스킬이
  제 쿨로 쏘지 않게 한다(`slotSkill`). 알리스테어, 제국의 여광(보스)의 [왕권 호령](`equip`·50 % 이하 `equipA`, 쿨 0)은 SP가 차면 바로 쏘지 않고 엔진 공격 차례를 기다려 공격 대신
  시전하고, 시전할 때 SP가 0으로 돌아간다. 전에는 넷 다 스킬이 공격과 따로(즉시) 나갔다.
- 근거: 공식 클라 `Enemy.AttackWrapper.SearchTarget`이 일반 공격 준비 때 SP 포함 `EnemySkill.CheckAvailable`을 통과한 스킬을 일반 공격 대신 시전(위 「적 스킬 = 일반 공격
  차례」, 공식 클라에서 확인). 네 스킬 모두 프리팹 가족 3(ATTACK·COMBAT). upstream의 `ATTACK_SKILL_CLIP` 상수는 받지 않았다 — 우리는 시전 길이를 이미 `skillCast` 데이터에서 읽는다.
- 그대로 둔 것: [자연의 요동]은 클립이 없어 시전 길이 0(`skillCast.lasso`에 `dur` 없음). 즈자이(적)의 대상 조건(upstream `b0faa58b` `leaders.js`)은 받지 않았다(클라 확인 필요).
- 테스트: 「假想敌：管: 【裂管之奏】 takes the turn…」, 「“萨米的意志”: 自然涌动 takes the turn…」, 「阿利斯泰尔: 王权号令 with full SP waits…」(공격 차례 사이가 공격 간격보다
  짧지 않음), 옛 시험은 「준비 뒤 다음 공격 차례」로 고침(관 [열관의 연주], '사미의 의지' [자연의 요동]·Doom; `test/local-patch-hud.test.js`의 관 SP 시험은 50초 전
  시전 없음만 봄).

### 퀸투스의 [생식 단절]은 소대 동작이 다 쓰이면 준비되지 않는다 (upstream `7c5bb9d2` 일부)

- 규칙: 살비엔토 주교 퀸투스(보스)의 [생식 단절](`SummonTentac`·`G1`·`G2`)은 레벨 분기 `dslily_dstnta`(공식 템플릿 7단계, 세 형태가 함께 씀)를 다 쓴 뒤에는 `cond`가 거짓이라
  공격 차례를 차지하지 않는다(`bosses.js kitQuintus`). 전에는 다 쓴 뒤에도 빈 시전이 공격 차례를 먹었다. 분기가 없는 템플릿(시험·도구)은 제한 없음.
- 근거: PRTS 퀸투스 「아직 실행하지 않은 소대 동작 명령이 있을 때만 발동」(「仅仍有未执行的小队动作指令时可触发」). 공식 `EnemySkill.isSkillActivatable` 재정의는 보지 않았다(선택 확인, 안 함).
- 테스트 「盐风主教昆图斯 【断裂生殖】: once the branch dslily_dstnta is spent…」.

### '총을 부수는 리드' 법술 쪽은 치료·원소 손상도 가상적: 총에게 넘긴다 (upstream `febeeae5` 일부)

- 규칙: '총을 부수는 리드'(적) 법술 방어 `enemy_9018_actrpa`의 [맹신의 서약] 전달은 받은 피해에 더해 받은 치료(자연 회복 제외, 최대 HP로 깎기 **전** 값)와 원소 손상(게이지)도
  같은 양을 가상적: 총의 무출처 HP 손실로 넘긴다(`bosses.js kitSpring` `pass`; `content/enemies.js`의 새 키트 훅 `healed`·`gauge`). 원소·횟수 방어 `9019`·`9020`은 받은
  피해만 — 그대로.
- 근거: 공식 `actrpa_passive`는 조정값이 적용될 때(ON_APPLIED_MODIFIER) 그 값을 블랙보드에 적어 넘기고, `actrpb_passive`·`actrpc_passive`는 피해를 받을 때(ON_TAKE_DAMAGE)다.
  PRTS 「조정값은 피해·치료·원소 손상을 포함」.
- 반격 (2026-10-29 후속): 법술 방어의 반격 물리 피해는 회피·막힘이 될 수 있고, 반격이 들어가지 않으면(회피·막힘·전부 흡수) 침식도 없다(`bosses.js kitSpring`,
  `hurt`의 `canDodge`와 결과 > 0). 근거: 공식 `actrpa_t_1`은 반격을 한 동작 목록(물리 피해 → 이펙트 → 소리 → 침식)으로 돌리고, 피해 노드는 `_ignoreMissFlag`·
  `_ignoreCancelReasonMask` NONE이다. 노드는 앞 노드가 성공했을 때만 돌고(기본 실행 조건 PREVIOUS_SUCCEED), 피해 노드는 조정값이 취소되면 실패한다(공식 클라에서 확인).
  upstream의 「반격이 성공했을 때만」과 같은 결론이다. 테스트 「“碎铳之簧” 法术护盾 (9018): the counter can be dodged…」. golden 이동 없음.
- 반격의 출처 (2026-11-06): 물리 피해는 무출처, 침식은 출처가 있다. 공식 `actrpa_t_1`의 피해 노드는 `AdvancedApplyDamage` `_noSource` 참·`_attackType` ADDITION이고, 침식 노드는 `ApplyElementDamage` `_noSource` 거짓이다(공식 클라에서 확인). 그래서 공격자를 보는 훅과 '총을 부수는 리드'의 피해 증가는 물리 반격에 닿지 않고, 전과 처치 기록은 그대로 리드에게 간다(`bosses.js kitSpring`, `hurt`의 `sourceless`). 테스트 「“碎铳之簧” 法术护盾 (9018): the counter's physical hit is 无来源…」.
- 테스트 「“碎铳之簧” 法术护盾 (9018) passes every adjustment to 铳…」.

### 블러드 앰버는 1초마다 최대 HP 10 %를 잃는다 (upstream `5f3a7492`, upstream #720)

- 규칙: 살카즈 본가드 고문관(적)이 남기는 블러드 앰버(`enemy_1367_dseed`)는 1초마다 최대 HP × `Passive.hp_ratio`(0.1)를 무출처 손실로 잃어 10초 안에 사라진다
  (`enemies/special.js`). 처치가 아니라 처치 수·보상 없음, 총수에 안 셈, 제자리·무공격은 그대로. 전에는 피의 부름 제단이 없는 이 모드에서 끝까지 남았다(`STATS_ONLY`에서 뺌).
- 근거: 적 표 `enemy_1367_dseed` 재능 `Passive` `hp_ratio` 0.1(제단이 없을 때의 생명 손실), upstream #720.
- 테스트 「血珀: loses 10 % of its max HP every second…」, 고문관 시험은 5초 뒤 제자리만 봄.

### 불안해하는 디자이너·동글이의 정면은 격자 열로 가린다

- 규칙: `archetypes.js frontGuard`(불안해하는 디자이너 `enemy_10097_crshd`, 동글이 `enemy_2085_skzjxd`·`_2`)는 공격자 칸의 열과 적이 선 칸의 열을 비교한다. 같은 열이면 정면이
  아니어서 감쇠 없음. 전에는 연속 x로 봐서 같은 칸 안의 오프셋도 앞뒤가 갈렸다. 방향 규칙(디자이너는 이동으로만, 동글이는 오퍼레이터가 많은 쪽)은 그대로.
- 근거: 공식 템플릿 `enemy_crshd_t[shield]`·`skzjxd_t[shield]` ON_TAKE_DAMAGE `CheckIfSourceGridPosFaceTargetGridPos` — `_faceType` FRONT, `_targetColOffset` 0,
  `_faceIfSameCol` NONE(둘 다 같음). upstream 대조 중 우리 쪽에서 찾은 차이(관리자 결정 2026-10-29).
- 알리스테어의 조끼 방향 감쇠(`kitLion hitIn`, 템플릿 `enemy_vtlionk_shld`도 같은 노드)도 2026-11-03부터 같은 열 비교 — 「阿利斯泰尔 防护背心 방향」 절.
- 테스트 「心虚设计师: front by grid column…」.


## upstream 0.3.2–0.3.4 대조 이식 — 엑시아 더 뉴 커버넌트의 「화력 무전」 (2026-10-29)

같은 대조(위 「피해 계산」 절)에서 받은 오퍼레이터 재능 수정(관리자 결정 2026-10-29, 묶음 C). upstream `706a35a0`·`6898da6e`·`d962a1de`(그 커밋의 「화력 무전」 부분)를
손 이식했다. 우리 엔진에서 먼저 재현했다(반경·사거리 시험 둘이 수정 전 코드에서 실패). 같은 키트의 S3 투하 좌표 포격 반경은 아래 「S3 투하 좌표 포격 반경 1.8」.

### S3 투하 좌표 포격 반경 1.8 (2026-10-29)

- 규칙: 엑시아 더 뉴 커버넌트 S3 「사명 완수!」(`skchr_angel2_3`) 시작의 투하 좌표 포격은 좌표 칸 중심 반경 **1.8** 안의 적을 모두 한 번 맞힌다(`AIRSTRIKE_RADIUS`).
  전에는 반경 1이었다(표에 값이 없어 둔 추정).
- 근거: 그녀의 S3 모드 공격 능력 `S3FireToToken`(공격 배율 `cannon_atk_scale`, 물리)이 투사체 `projectile_chr_angel2_s3_start`를 쏘고, 그 투사체 루트의
  `CircleCollider2D` 반경이 1.8, 맞히는 수 `_hitNumType` INFINITY, 멈출 때만 판정(`_onlyCheckHitWhenStop`), 위장 무시(공식 클라에서 확인, 2026-10-29). 판정 기준점은
  지금 구현(적 중심)을 그대로 둠.
- 테스트 `test/content/kits_alt_t6.test.js` 「新约能天使 S3: the 投递坐标 bombardment hits every enemy within 1.8」. golden: roster-047.

### 「화력 무전」 폭격은 한 번 소모에 한 라운드, 소모자의 자기 범위에서 대상 하나 (upstream `706a35a0`, `6898da6e`, `d962a1de`)

- 규칙: 엑시아 더 뉴 커버넌트(오퍼레이터, `char_1041_angel2`)의 재능 「화력 무전」(`kits/ops/chess_char_6_13-angel2.js`). 아군이 탄약을 쓸 때마다(`ammoUsed`) 회복과 확률 판정을
  한 발씩 하고, **같은 틱에 한 소모자가 쓴 탄약은 한 라운드**다. 라운드의 대상은 처음 성공할 때 한 번만, 그녀의 기본 색적(`sortEnemyTargets`를 그녀 기준으로)으로
  소모자의 **지금 공격 범위의 격자** 안의 적 중에서 고른다: 소모자 자신의 격자(`u.rangeGrid`; 모듈이나 키트가 격자 자체를 바꾼 것(`tier4 applyModuleRange`)도 포함),
  소모자가 자기 범위를 가진 스킬을 켜고 있으면 그 스킬의 격자(`targeting.rangeGrid`; 대상만 고르는 `showOwnRange` 스킬은 제외). 사거리 증감은 0 — 일시 증감도,
  모듈의 영구 「공격 거리 +N」(`s.baseRangeExtend`)도 넣지 않는다. 성공마다 폭격이 하나씩 늘고, 폭격은 0.1초 간격으로 **나가** 쏜 순간 대상이 선 자리에 고정되고
  (대상을 따라가지 않음), 그 자리에서 **0.3초 뒤** 반경 1.3(중점 판정)으로 터진다. 이미 쏜 폭격은 대상이나 그녀가 그 사이 죽어도 터지고, 대상이 죽은 뒤에는 그
  라운드의 남은 폭격이 나가지 않는다. 그녀가 라운드 도중 쓰러지면 그 뒤 차례의 폭격도 나가지 않는다(공식 클라에서 확인 2026-11-12: 폭격 차례마다 `AbilityStandard.OnSpellStart`가
  주인이 살아 있지 않으면 시전을 끝내고(`TalentBomb`에 `_ignoreIfOwnerDead` 없음), 쓰러짐(`Entity.OnFinish` → `ClearAbilities`)이 `TalentBomb`을 떼며 시전 코루틴을 멈춘다 —
  `_interruptAbilityOnDetach` 1·`Ability.CleanupForNextCast`). 피해는 라운드를 만들 때의 공격력으로 정한다.
  전에는 성공마다 소모자의 정렬로 소모자의 현재 범위(사거리 증감 포함)에서 대상을 다시 골랐고, 반경 1로 한꺼번에, 즉시 떨어졌다.
- 근거: PRTS 엑시아 더 뉴 커버넌트 재능 비고(2026-10-29 원문 확인, upstream 인용과 같음) — 「每轮轰炸仅选取一次目标，每次成功的概率判定都会增加一次本轮的轰炸」,
  「轰炸半径1.3，单轮多次轰炸之间间隔0.1s，造成预计算的物理普通伤害」, 「借用消耗者的攻击范围…始终使用默认索敌逻辑；这一行为不受对方的攻击距离增减」(예: 공격 범위 +1 스킬을 켠
  소모자가 원래 범위 밖의 적을 쏘면 폭격이 없음), 「附着型弹道」.
- 근거(공식 클라에서 확인, 2026-10-29, 관리자 결정 2026-10-29로 대조): 소모자에게 붙는 `angel2_t_1[target]`이 성공 수만큼 `times`를 세고 `CreateBuffInRange`
  (`_useAttackRange`·`_useTargetRangeInsteadOfSource`)로 소모자의 지금 공격 능력(`Unit.attack`)의 `rangeId` 상자 안 적에 표식 `angel2_t_1[target][mark]`을 단다 — 상자는
  `rangeId` 그대로라 공격 범위 연장 속성(모듈 「공격 거리 +1」은 `ability_range_forward_extend`, 예: 산크타 믹사파라토 SPT-Y)이 들어가지 않는다. 이어 그녀의 공통 능력
  `TalentBomb`(`MultiRangedAttack`, `_additionalTimes`·`_triggerDelta` 0.1, 선택자 = 표식 가진 적 1)을 그 선택자로 고른 적에게 시전하고, 시전 시작 때 `angel2_t_2[cleaner]`가
  모든 적의 표식을 지운다 — 다음 폭격은 처음 대상만 다시 넣고(`_alwaysIncludeTarget`), 그 대상이 없으면 나가지 않는다. 투사체 `projectile_chr_angel2_t1`: `AttachToTarget`
  (`_followTarget`·`_keepUpdate` 0, 생성 때 대상 자리에 한 번 놓음, `_stopIfTargetDead` 0), 수명 0.3초, 멈출 때만 명중(`_onlyCheckHitWhenStop`), 명중 범위 `CircleCollider2D`
  반경 1.3 — 투사체는 수명이 끝나면 멈추고, 멈출 때 그 원 안의 적을 친다(출처가 죽어도 멈추지 않는 설정). 스킬 범위: 클라는 지금 모드의 공격 능력 범위를 쓰고, 모드의
  범위는 그 모드가 스킬의 모드면 스킬 표 `rangeId`다(`UnitMode`가 `Character.GetModeRangeId`로 받아 공격 능력에 넣음) — 산크타 믹사파라토 S3 「은퇴 전 포교」 3-13,
  블레이즈 디 이그나이팅 스파크 S3 「만악의 소각장」 4-11. 정렬: 선택자 정렬은 `HATRED_DES`(각 적의 자기 `hatred`만, 정렬하는 쪽 위치는 안 씀)라 그녀 기준 기본 색적과 같다.
  다음 폭격에 대상을 다시 넣는 조건은 대상이 살아 있음(`Entity.alive`).
- **[추정·엔진: 그녀가 라운드 도중 죽으면 우리는 남은 폭격을 내지 않는다 — 클라는 폭격을 만든 뒤 주인이 죽었으면 시전을 끝내므로(`CheckFinished`) 죽은 뒤 첫 차례가 다시
  돈다면 한 발이 더 나간다. 그 차례가 도는지는 확인하지 않았다]**. 라운드 피해를 만들 때 정하는 것은 PRTS 비고가 근거다(공식 클라에서는 확인하지 않았다).
- 비고의 시야 가림(폭격이 시야를 막는 장치 너머의 적을 못 침)은 우리 엔진에 시야 가림이 없어 만들지 않았다. 버프 표의 `angel2_t_1[target][dmg]`(반경 0.9 피해)는
  `TalentBomb`이 쓰지 않는다.
- 이펙트 인자는 우리 것 그대로(`tgt` = 대상, render가 그 적에 `angel2_buff_01_trail_01`을 띄움 — 공식 `_hitEffects`처럼 터질 때), 반경만 1.3.
- 테스트 `test/content/kits_t6.test.js` 「新约能天使 火力电台」 다섯(라운드·간격·0.3초·반경·고정 피해, 영구 사거리 연장 제외, 모듈 격자 포함, 쏜 자리 고정·대상 죽으면 남은 폭격 없음,
  스킬 범위). 공식 클라 대조로 바뀐 세 가지(0.3초, 남은 폭격 없음, 스킬 범위)는 수정 전 코드에서 시험이 실패했다.


## upstream 0.3.2–0.3.4 대조 이식 — 매치 규칙 (2026-10-29)

같은 대조(위 「피해 계산」 절)에서 받은 매치 규칙 둘(관리자 결정 2026-10-29, 묶음 E). upstream `3eed0147`·`76e3813e`·`ebe339f0`·`d962a1de`(그 커밋의 특질 부분),
`2165fc0f` 일부를 손 이식했다. 둘 다 우리 엔진에서 먼저 재현했다(새 시험이 수정 전 서버 코드에서 실패).

### 「휴식 기간 진입 시」 효과는 결정 단계 뒤, 휴식 기간이 열릴 때 (upstream `3eed0147`·`76e3813e`·`ebe339f0`·`d962a1de` 일부, upstream #851)

- 규칙: 전략의 「휴식 기간 진입 시」 지급과 오퍼레이터 특질의 「휴식 기간 진입 시」(`SERVER_PREP_START`)를 라운드 시작(`onRoundStart`)이 아니라 휴식 기간이 열릴 때
  (`onPrepStart`, `match/prep.js enterPrep`)에 준다. 결정(机变) 단계가 있는 라운드에서는 그 단계가 끝난 뒤다. 옮긴 것: 리(전략, `band_lmlee`)의 R3 오퍼레이터,
  `preparation_start_*` 키 전부(저스틴·제시카·퀸투스·뮤엘시스 등의 정해진 라운드 지급, 도베르만(전략)의 교편), 마츠키리(전략)의 짝수 라운드 상점 오퍼레이터,
  나란투야(전략)의 짝수 라운드 장비 고르기, 특질은 `effectsMeta.js GARRISON_HOOK`. 같은 디스패치 안의 순서(전역 → 전략 → 맹약 → 특질)는 그대로.
  그대로 둔 것: 자금 지급·상점 갱신(라운드 시작, 결정 단계 앞), 「라운드 시작 시」 효과(위(전략)·스즈란(전략)), 해럴드(전략)의 오퍼레이터, 「휴식 기간 종료 시」.
  결정 단계가 없는 라운드는 지급 시점이 사실상 같다. 봇도 결정 단계에서 아직 받지 않은 오퍼레이터를 셈하지 않는다.
- 근거: 공식 클라의 게임 상태 순서 — 机变(`SP_PREPARE`) 다음 휴정기(`PREPARE`), 「휴식 기간 진입 시」는 휴정기로 들어갈 때(공식 클라에서 확인). upstream #851 제보(공식에서
  리 전략의 오퍼레이터를 결정 뒤에 받음). 자금은 결정 화면 뒤에 이미 보인다(공식 스크린샷, `docs/research/01-core-rules.md` §4.1).
- **[추정·서버: 지급은 서버 일이라 자금 → 결정 → 효과의 정확한 순서는 클라에서 안 보인다]**. 키 단위로 옮겨서 뮤엘시스(전략)의 「제1라운드 시작 시」와 시점을 적지 않은
  문구(도베르만 「2라운드마다」)도 휴식 기간에 받는다 — 같은 추정.
- 테스트 `test/match/prep-start-grants.test.js`(동맹 R3: 결정 중엔 없고 휴식 기간에 받음, 단독 R3, 특질, 봇의 결정 선택이 지급보다 먼저). 직접 `onRoundStart`를 부르던
  시험들은 `onPrepStart`로 고침. golden: matches만 이동(아래).

### 덕로드(전략) 교체 수는 라운드마다 한 번, 모두 같다 — 종류는 플레이어마다 하나 (upstream `2165fc0f` 일부, upstream #839)

- 규칙: `bands/meta.js duckGlobal`. 교체 수(0–2)는 라운드마다 한 번 굴려 덕로드 효과를 받는 모든 플레이어가 같다 — 매치 시드와 라운드로 만든 따로 흐름
  (`ctx.sharedRng('duck:<라운드>')`, 다른 흐름을 쓰지 않아 미리보기·봇 리허설도 같은 수). 종류(덕로드·고프닉·눈물 흘리는 사내·동글이)는 플레이어마다 하나를 굴려
  그 플레이어의 교체가 모두 그 종류다. 어느 적을 바꾸는지(시간 구간 `minweight`–`maxweight`, 지상, 리더·부품·현상금 제외), 연합 방어 제외, 짝 보스 필드의 반쪽 규칙은
  그대로 플레이어마다 고른다. 후보가 수보다 적은 플레이어는 그만큼 덜 바꾼다. 전에는 수·종류 모두 플레이어마다, 교체 한 마리마다 따로 굴렸다.
- 근거: 효과 키 `round_start_all_player_change_enemy_2`(min 0·max 2, `all_player`), PRTS 비고 「每回合将有0~2名敌人被替换为上述敌人之一」, upstream #839 제보자의 공식 영상 판독
  세 건(네 명 모두 같은 수·종류는 제각각, 연합 방어에 같은 종류 여섯 = 팀원 셋이 각 둘). upstream은 종류와 바꿀 적까지 모두 같게 했는데 영상과 달라 수만 받았다.
- **아래 길만** (2026-11-07, upstream `ded5f264` 일부, 관리자 결정 2026-11-07 「받음」): 후보는 경로가 아래 관문에서 시작하는 적뿐이다(`shared/constants.js gateOf` — 일반 필드는
  (9,10)에서 시작하는 길, (12,10)은 위 길; 보스·숨은 필드는 그 필드의 행). 경로를 모르면 전처럼 모든 길. 근거는 제보자의 공식 영상 세 건 판독(「总在下路」)과 upstream의 판단이고,
  공식 화면을 여기서 직접 본 것은 아니다. upstream의 「바꿀 적까지 모두 같게」는 받지 않는다(위).
- 테스트 `test/sim/feedback5-cb4-pins.test.js` 「item 35」(네 명이 같은 수, 플레이어 안에서는 한 종류, 플레이어끼리는 종류가 다른 라운드가 있음). 같은 라운드를 되풀이해
  0·1·2를 보던 시험(`bands.test.js`, `feedback1-ducklord.test.js`, `bot.test.js` 리허설)은 매치 시드를 바꿔 가며 본다.

## upstream 0.3.4 개발분 대조 이식 — 전투 (2026-11-07)

upstream 개발 브랜치(0.3.4 개발분)의 버그 수정 중 판정에서 받은 전투 수정. 모두 손 이식이고(패치가 안 붙거나 공식 클라와 달라), 새 시험이 수정 전 코드에서 실패하는 것을 확인했다. 뒤의 셋(묶음 C)은 upstream의 근거가 제보·추정이라 공식 클라를 먼저 읽고 넣었다.

### 【이동】은 원소 게이지와 폭발 잠금을 비운다 (upstream `7da8ff20`, upstream #903)

- 규칙: `Battle.moveRedeploy`(【이동】)가 배치처럼 원소 게이지 모두(灼燃·神经·凋亡·侵蚀, 적이면 狂躁도)를 0으로 하고, 원소 폭발 뒤 잠금 버프(`burstLock`)를 지운다. 다른 버프는 지금처럼 남는다(아래 옛 결정).
  울피아누스 S3의 이동과 【반환】, 켈시 에스페란타·안젤리나 더 멜로우 위시·벨로네·Mon3tr·첸 더 던스트릭, 「从不混淆的方向」 대체 복귀 등 【이동】을 쓰는 곳 모두. 전에는 일반 배치(`battle/deploy.js`)만 비웠다.
- 근거: PRTS 술어 「移动」 「本质上为一次特殊的撤退-再部署行为」, 공식 클라에서 【이동】은 퇴장 사유 `MOVE_LIKE_RESPAWN_SELF` 뒤 다시 태어나는 것(위 「누가 막나」의 새 유닛, `fx.md` 「모듈 장비 배치 이펙트」).
  upstream의 凋敝(`necrosis`)는 우리에 없어 뺐다. 버프를 남기는 것은 옛 관리자 결정(DESIGN §22.3, 공식은 스킬 진행·재능 2 층만 물려받음)이라 그대로다.
- 테스트 `test/sim/feedback3-ulpia-move.test.js` 「the 【移动】 and the 【返回】 empty his element gauges…」.

### 울피아누스 S3의 【이동】은 반드시 일어난다 — 제자리 【이동】 (upstream `fbc83fd7`, upstream #903)

- 규칙: 닻이 자기 칸에 떨어지거나(저지 중), 떨어진 칸과 그 **한 칸 앞(그에게 가까운 쪽)**이 모두 배치할 수 없으면, 시전 클립 끝에 **제자리 【이동】**을 한다: 그 칸에 다시 배치(게이지 비움, 배치 효과 다시,
  막던 적을 놓았다가 다시 막음), 클립 `Skill_3_ReStart_B`(`deploy` 이벤트의 `here`), 표식 「从不混淆的方向」 없음(`chess_char_5_05-ulpia.js onCastEnd`). 스킬이 끝나면
  **【반환】도 제자리에서** 한다(SP 비움, 배치 효과 다시, 클립 `back`). 전에는 둘 다 아무것도 안 했고, 자기 칸일 때만 닻을 던질 때 화면 클립을 다시 틀었다(`redeploy` fx — 뷰의 그 길은 지움).
  2026-11-17까지는 두 번째 칸을 떨어진 칸의 **한 칸 너머**로 봤고, 제자리 【이동】 뒤에는 【반환】이 없었다.
- 근거: PRTS 울피아누스 S3 비고 ③ 「船锚落点可部署地块>船锚落点后一格处可部署地块>自身所在地块」, 「该判断最终仍可选择自身所在地块…该【移动】也将必定执行」, 「若目标地块不为当前地块，
  会在原地部署一个从不混淆的方向，作为【返回】移动的标志」. 공식 클라에서 확인(2026-11-17):
  - 칸 고르기: 닻 투사체가 닿을 때(`ON_PROJECTILE_REACHED`) 재능 쪽 능력 `UlpiaS3Ability.OnProjectileReached`가 목표 칸을 공유 블랙보드 `ulpia_row`/`ulpia_col`에 적는다 —
    닿은 칸이 그가 다시 배치될 수 있는 칸(`Character.CheckRespawnSelfBuildable`)이면 그 칸, 아니면 `_TryGetTileSecond`: 닿은 칸이 그의 칸이면 바로 그의 칸(두 번째 칸을 안 봄),
    아니면 **닿은 칸 − 그가 보는 방향 한 칸**(`GridPosition.GRID_FOUR_WAYS[direction]`을 뺌, 그에게 한 칸 가까운 칸)이 배치될 수 있으면 그 칸, 아니면 그의 칸.
  - 이동과 클립: 스킬 프리팹 `skchr_ulpia_3`의 닻 능력(`ProjectileToTileWithExtraActionsAbility`)의 추가 동작 `CheckCharSkillAffecting` → `RespawnCharacter`(`_canRespawnInPlace`·
    `_forceRespawnInPlace` 1): 그 칸에 다시 배치, 그 칸이 거절되면(그의 칸은 그가 서 있어 거절) 그 자리에서 다시 배치하며 `ulpia_respawn_in_place` = 1. 성공하면 `SpawnTokenOnTargetTile`이
    처음 배치 칸에 표식을 세운다(제자리면 그 칸에 그가 서 있어 안 섬). 다시 태어날 때 `ulpia_s3_switch_mode[born]` `ON_OWNER_BORN`: `ulpia_respawn` > 0이면 `ulpia_respawn_in_place` > 0일 때
    `Born` → `Skill_3_ReStart_B`, 아니면 `Skill_3_ReStart_A`(둘 다 모드 3 `S3_Respawn_A`).
  - 제자리 【반환】: `RespawnCharacter`는 제자리여도 `ulpia_respawn`을 1로 적고, 새 유닛의 `UlpiaS3CastSkill.AssignData`가 그것을 읽어 「옮겨진 유닛」(`m_isCharacterResapwn`)이 된다.
    스킬 시간이 끝나면(`OnTick` → `InterruptIfNot`) `_RespawnToLocatedPos`가 처음 배치 칸(`ulpia_located_*`, 첫 `OnBorn`이 적음)을 보고 — 그가 그 칸에 서 있거나 그 칸에 그의 표식이
    있으면 — `ulpia_restore` = 1과 복귀 능력(`Skill_3_End`, `WithdrawTokens` → `RespawnCharacter`, 모드 4 `S3_Restore`의 `Born` → `Skill_3_Back`, `ulpia_s3_restore`가 SP를 비움)을 튼다.
- **남은 차이**: 닻 능력의 추가 동작은 `_extraActionEvent` 3 = `Projectile.Event.ON_PROJECTILE_STOP`(`GetProjectileActions`가 그 사건에만 붙임) — 공식 【이동】은 **닻이 멈출 때**이지
  시전 클립 끝(1초)이 아니다. 우리는 아직 클립 끝(남은 일: 옮기면 그 뒤 클립 `Skill_3_ReStart_*`와 시전 붙잡기 `castHolds`를 같이 맞춰야 함).
- 테스트 `test/sim/feedback3-ulpia-move.test.js` 「while he blocks: the 【移动】 still happens, where he stands…」·「no legal tile where the anchor fell nor one back from it…」, `test/content/kits_t5.test.js`
  「乌尔比安 S3 while he blocks…」·「lands one tile back from an occupied anchor tile, toward him…」(옛 코드에서 실패 확인).

### 후회하는 영혼의 성배는 곁의 적이 받는 피해를 5 %로 줄이고 나머지를 진짜 피해로 받는다 (upstream `0f88afbb`)

- 규칙: 후회하는 영혼의 성배(`enemy_1430_lrrook`) 반경 `takeDmg.range_radius`(1.7) 안의 지상 적은 받는 피해의 `takeDmg.damage_scale`(0.05)만 받고, 줄어든 몫은 성배가 **진짜 피해**로
  받는다(`content/enemies.js chaliceShare`). 斩杀 피해(로고스 S1 `execute`)는 나누지 않는다. 한 적은 처음 닿는 성배 하나만. 전에는 거꾸로 곁의 적이 95 %, 성배가 같은 종류로 5 %를 받았다.
- 근거: 공식 버프 `enemy_lrrook[dmgCore]` ON_TAKE_DAMAGE — `INSTANT_KILL_LIKE_DAMAGE`가 아니면 → 주인이 `WALK`인지 → `DamageScale`(`ANY_ATTACK`, 블랙보드 값을 곱하고 줄어든 양을
  `delta_damage`로) → 그 절댓값의 `FixedValueDamage` `PURE`를 성배에게(공식 클라 버프 템플릿에서 확인). PRTS 「受到的伤害降低至5%（优先级-3000，对斩杀伤害无效，不可对空），以此减少的伤害以真实伤害的形式由自身承担」.
- [추정·엔진: 나누는 때는 우리 `hit` 훅(방어·저항 전) — 회피·`DamageScale` 같은 다른 ON_TAKE_DAMAGE 노드와 같은 단계로 봄, PRTS의 우선순위 −3000은 안 따짐]. 「消失 상태가 아닐 때」는
  이 모드에 성배를 숨기는 수단이 없어 따로 두지 않음.
- 테스트 `test/content/enemies_bosses.test.js` 「愧悔魂灵圣杯: nearby ground enemies keep 5 %…」, `test/sim/playtest5_elements.test.js` 「a 无来源 burst still passes on…」.

### 투사체 채널 스킬은 채널 동안 시전이다 — 축제 재즈 연주가·살카즈 왕정군 정예 캐스터 (upstream `8540e569` `aa471815`, upstream #904)

- 규칙: 축제 재즈 연주가(`enemy_10034_cnvsax`)의 지속 시전 스킬 `fire`(狂欢式演奏)와 살카즈 왕정군 정예 캐스터(`enemy_1275_dwlock_2`)의 `DeathEye`(死亡之眼)는 **채널이 이어지는 동안
  시전 중**이다: 그동안 서 있고 일반 공격이 없으며, 스킬 쿨(10 s·24 s)은 **채널이 끝날 때** 다시 돈다(`content/enemies.js` `projAlive` → `projCastOver`, 아래 「적 스킬 = 일반
  공격 차례」 시전 길이). 기절·빙결·공중 띄우기·필드 이탈 등으로 시전이 끊기면 채널도 끝나고 쿨이 그때 돈다. 정예 캐스터의 채널은 **침묵에 끊기지 않는다**. 전에는 두 시전이 길이 0이라
  채널 중에도 걸었고(반은폐가 풀린 채 막히지 않은 재즈 연주가), 쿨이 시전 시작부터 돌아 재즈 연주가는 채널(10.5 s)이 끝나자마자 다시 시전했고, 침묵이 정예 캐스터의 채널을 끊었다.
- 근거(공식 클라에서 확인): 재즈 연주가 프리팹 `Modes/Attack/Body/Skills/fire`는 `RangedAttack`(`_waitForProjectileInvalid` 1, `_waitForAnimEndWhenProjectileInvalid` 0) — 시전은
  투사체가 유효한 동안 이어지고 끝나면 능력 시간의 남은 만큼 뒤에 끝난다(`RangedAttack.<OnWaitForPostDelay>`; 위 「시전 길이」), 채널 버프 `enemy_cnvsax[cd]`는 기절·빙결·공중 띄우기·침묵에 끊긴다. 정예 캐스터 `Skills/DeathEye`는
  순차 묶음 `LineAttack`(같은 투사체 기다림) → `ChargeAttack`(`_timeMode` 2, `_cooldown` 0)이고 두 능력이 시전 동안 `dwlock_skill_anti_flag[silence]`(침묵 반제)를 건다 — PRTS 「※技能期间，
  持有沉默反制」. 쿨은 `EnemySkill._OnCastFinish`가 시전 끝에 다시 시작한다. upstream은 제보로 같은 결론을 냈다.
- 테스트 `test/content/enemy-skill-proj-wait.test.js`, `test/content/enemies_bosses.test.js` 「节日爵士乐手: revealed (反隐) and not blocked…」(이제 첫 시전부터 서 있음).
- **은신으로 돌아가면 끊긴다**(2026-11-14, 사용자 제보: 여럿 나온 판에서 한 마리가 막던 오퍼레이터 칸에 반투명으로 겹쳐 멈춤): 재능 버프 `enemy_act38side[mode]`는 은신이면 모드 0(`Default`),
  아니면 1(`Attack`)로 바꾸고(`_restartFSM` 없음), `fire`는 `Attack` 모드의 스킬이라 은신이 돌아오면 떼어진다(`Enemy.OnSwitchMode` → `EnemySkill.Detach`). 그 `RangedAttack`은
  `_interruptAbilityOnDetach` 1이라 그 자리에서 끊기고, `RangedAttack.OnCastEnd`가 투사체를 기다리는 시전(`_waitForProjectileInvalid`, `_notClearProjectileWhenCastEnd` 0)의 투사체를 지워
  채널도 끝나며, 쿨은 시전 끝(`_OnCastFinish`)에 다시 돌고 떼어진 동안은 멈춘다(위 「모드가 꺼진 스킬의 쿨」; 모두 공식 클라에서 확인). 키트(`content/enemies/invisible.js kitJazz`)가 모드를
  되돌릴 때 시전을 끊고 `pause`를 둔다. 엔진도 고쳤다: 「일반 공격 안 함」(`profile.noAttack`, 공격 능력 없는 모드)은 일반 휘두름만 끊고 스킬 시전은 제 길(클립·투사체·끊김)로 끝나게 둔다
  (`ai.js enemyAttack` `cutNormalSwing`). 전에는 그 검사가 시전의 `castLeft`만 조용히 0으로 만들어, 열린 시전(`PROJ_WAIT_MAX` 60 s)의 선 채 버티기와 스킬 쿨(60 s 더)이 채널보다 오래
  남았다 — 막던 오퍼레이터가 철수하거나 은신이 돌아오면 최대 1분 동안 그 자리에 섰다. 확인: 같은 시험 파일 「its blocker retreats mid-channel…」·「its 隐匿 returns mid-channel…」(수정 전 코드에서
  실패 확인). golden: `roster` 010·023, `matches` solo-FUNNY-1, `act3-roster` 011·057, fx-events roster-010(`eskillEnd` 하나 적음 — 은신 동안 쿨이 멈춰 시전이 하나 줆; 모두 재즈 연주가가 나오는 시나리오).
- 화면(2026-11-14, 2026-11-15 엔진으로 옮김): 재즈 연주가의 `Skills/fire`에는 `ThreePartChannelingAnimation` `_default`(`Skill_Begin` → `Skill_Loop` → `Skill_End`, 아래·위 덮어쓰기 없음)가 함께 붙어 있다(공식 클라에서
  확인). 공식은 이 동작의 세 클립을 능력 시간(`get_cooldown`)에 맞추고(`UpdatePlaybackSpeed`: 시간 ≥ 시작+끝이면 시작·끝은 제 속도, 루프가 나머지), `_waitForAttachFinishEvent`이면 루프가
  능력의 공격 끝 신호까지(최대 360초) 이어진다(`DoPlayAnimation`; 둘 다 공식 클라에서 확인 — 민트 S2가 같은 동작). 재즈 연주가·정예 캐스터·'사미의 의지'·살카즈 후예 기술자의 채널이 그 표시를 가졌다.
  엔진이 이것을 그대로 알린다(`content/enemies.js castSkill`): 시전하는 스킬의 시전 기록(`skillCast.*`, 순차 묶음이면 그 자식)에 `chan`이 있으면 fx `enemySkill`에 `dur` = 그 능력의
  시전 길이(`castLength` — `_timeMode` 2·3이면 정한 값·블랙보드 값) 또는 `wait`이면 `hold` 1을 싣고, 키트의 `fire`가 대상 유닛을 돌려주면 그것을 `tgt`로(줄 투사체, 아래·위 세트 — 재즈 연주가·정예 캐스터만 돌려준다: `tgt`가 있으면 `fxgame.js eskillFx`가 시전 시작에 스킬 투사체의 꼬리도 띄우므로, 볼트를 1.4초 뒤에 쏘는 강화 석궁 기습자는 안 돌려주고 아래·위 세트를 걸어온 쪽으로 고른다 [추정·미조사: 공식은 `_faceToTarget`으로 대상 쪽]).
  시전이 끝나면 — 끊김, 투사체를 기다리는 시전의 끝(위 `projCastOver`), `hold` 시전의 시간 끝 — fx `enemySkillEnd`를 한 번 낸다(`chanEnd`). 렌더는 적 기록의 `chan`을 읽어 그
  길이에(`hold`면 끝 신호까지) 세 클립을 틀고(`units.js onEnemySkill` → `SpineActor.chant`/`chantCut`), 기절·쓰러짐은 전처럼 클립을 끊는다. 재즈 연주가는 채널(21틱 × 0.5 s =
  10.5 s)이 끝나 투사체가 사라질 때, 일찍 끝나면(대상이 사라짐·침묵·끊긴 시전) 그때와 능력 시간(공격 간격) 중 늦은 때에 `Skill_End`로 닫는다. 정예 캐스터도 같다(`dur` 8, 대상이
  쓰러지면 다음 1초 틱에 채널이 멈추고 능력 시간 4초에 끝). [추정·미조사: 공격 끝 신호를 시전 끝으로 봄 — `_fireAttackFinishWhenProjectileInvalid`가 없는 투사체 기다림 `RangedAttack`(재즈
  연주가·정예 캐스터)에서 그 신호를 무엇이 내는지 안 읽음] 전에는 키트 `castFx` 둘이 `dur`·`tgt`를 싣고 렌더의 손 표 `ESKILL_CLIPS`가 클립을
  되적었으며, 처음엔 그 표에 없어 채널 동안 루프 클립을 틀지 않았다(관리자 제보 2026-11-14: 한 번만 재생). 이 길로 손 표 없이 이어진 것(2026-11-15): 강화 석궁 기습자 `CrossAttack`(아래·위
  세트는 걸어온 쪽, `_timeMode` 2 → 2.5초)·부패한 기사 `ChargeAttack`·'즈자이' `ShieldBurst` 둘(시작 키 `Skill_02`는 모델에 없어 시작 클립 없이 루프부터 [추정·미조사: 공식이 시작을 건너뛰는지 안 읽음
 ])·'늑대 군주' 자로 `FearCage`·가상적: 흑운 `KillOthers`·가상적: 총 `2`·'사미의 의지' `Lasso`·검은 뿔의 루울 `skill`·응집된/분산된 영혼의 잔해 `Laser`.
  확인: `test/render/eskill-clip.test.js` 「节日爵士乐手 (real kit)…」·「萨卡兹王庭军精锐术师 (real kit)…」·「重弩突袭者 (real kit)…」. [화면 미확인 — `checks/arena.md`]
  재발 방지: 원인 제거 — 채널 클립은 추출 `tools/local-extract/attack_timing.py`(`chan`, `wait`)가 데이터 `skillCast.*.chan`에 두고 엔진 시전과 렌더가 그것만 읽는다(채널 손 표·키트 `castFx`·
  커버리지 시험과 예외 목록을 지움). 남은 손 표 `ESKILL_CLIPS`는 한 클립 스킬 셋(포트브레이커·살카즈 후예 처벌자/징벌자·복핵의 해류사자 — 데이터의 한 클립 `skillCast.*.clip` 전수는 묶음 fx-F)과
  제트 캐니스터 `Flame`(일반 공격의 채널: 그 능력이 `Body/Flame`에 있어 추출이 안 읽음). 키트가 엔진 시전 밖에서 제 타이머로 내는 채널은 클립이 없다. 「이 모드에서 시전 안 함」은 두 시험(줄 투사체·투사체 기다림)이
  함께 읽는 `test/content/enemy-not-cast-list.js` 한 곳에만 적고(2026-11-15 '늑대 군주' `WildCalling` 더함: 키트 `leaders.js kitWolfLord`가 그 능력을 만들지 않음 — 키트 머리 주석의 「Not modelled」), `test/content/enemy-not-cast.test.js`가 그 스킬이 데이터에 있고 적 키트가 그 이름의 능력을 만들지 않는지 본다.

### 투사체를 기다리는 적 스킬 넷 — W·함락의 제사장·'사미의 의지'·'염의 가호' (2026-11-14)

위 두 채널과 같은 길(`_waitForProjectileInvalid`): 시전은 스킬 투사체가 살아 있는 동안(그리고 능력 시간 동안) 이어지고, 쿨은 끝에서 다시 돌며, 시전이 끊기면
`RangedAttack.OnCastEnd`가 투사체를 지운다(`ClearProjectile` → `Projectile.Interrupt` → `StopMe`). 모두 공식 클라에서 확인(프리팹·`[uc]projectiles.ab`·능력과 투사체 코드).

- **W(`enemy_1504_cqbw`) `C4`**: 투사체 `projectile_enemy_cqbw_s1`(대상에 붙음, 수명 3.2초 = 데이터 `skills.C4.proj.life`)가 멈출 때 **그 대상만** 친다
  (`_alwaysHitTraceTargetInTheEnd`, 맞춤 1번, 범위 판정·충돌체 없음) — 그때 살아서 필드에 있으면 공격력 × `atk_scale` 물리. 시전은 클립 `Skill` 4.8초(투사체보다 김).
  **시전이 끊기면 폭탄이 그 자리에서 터진다**: 지워진 투사체도 멈출 때 대상을 친다(`Projectile.OnProjectileStop` → `_DealHitTraceTarget`). 대상: 모드 Default는 공격의
  대상 하나·지상만(모드 트리거 `_targetMotion` WALK_ONLY), HP 반 아래(재능 AtkUp → 모드 T1)는 T1 선택기의 최대 3(`_maxNum`, 블랙보드에 `max_target` 없음)·공중 포함
  (MotionMask ALL). 전에는 추정값으로 신관 1초·반경 1칸 폭발·반 HP 아래 2개였고, 끊겨도 폭탄이 남았다. T1으로의 전환 자체(`switch_mode_restart_fsm`)는 아직 안 돌린다(위 「적의
  모드 전환」 남은 것). W가 쓰러져도 우리 엔진은 시전을 끊지 않아(기절·필드 이탈·失衡만) 폭탄은 제때 터진다.
- **함락의 제사장(`enemy_2050_smsha`) `ChainBuff` 「반자연의 선물」**: 사슬 투사체(`ChainLightningHitBehaviour`)가 도약하는 동안 시전 — 도약은 0.1초대라 클립 안에서 끝나 시전 길이는
  그대로다. 끊긴 시전은 남은 도약을 지운다(이 투사체는 멈출 때 치지 않음). 기절 면역이라 실제로는 빙결·필드 이탈 등이 끊는다.
- **'사미의 의지'(`enemy_9033_acdeer`) `Lasso` 「자연의 요동」**: 대상마다 올가미 투사체 `projectile_enemy_smdeer_s`(수명 = 블랙보드 `projectile_life_time` 10초)가
  능력 버프 `enemy_smdeer_lasso_damage`(기절, 1초마다 법술 피해)를 살아 있는 동안만 싣는다 — 멈추면 `_detachAllBuffsWhenStopped`로 기절·피해가 같이 떨어진다. 멈추는 때:
  수명 끝, 대상이 쓰러지거나 필드를 떠남(`_stopIfTargetDead`·`_stopIfTargetDisappeared`), 보스가 쓰러짐(`_stopWhenSourceInvalid`), 시전이 끊김. **올가미가 있는 동안 보스는
  시전 중**이라 고드름(冰凌)도 다른 스킬도 없고, 60초 쿨은 마지막 올가미가 끝날 때 다시 돈다 — 올가미가 공격 간격(6초)보다 일찍 끝나면(대상 철수) 시전은 시전 시작 6초까지 이어진다(「적 스킬 = 일반 공격 차례」 시전 길이, 2026-11-14). 전에는 시전 길이 0이라 올가미 중에도 고드름을 쐈고 쿨이 시전 시작부터 돌았으며, 기절은
  대상이 철수해도 10초를 채웠다. 보스는 기절·빙결·공중 띄우기 면역이라 끊김은 실제로 드물다. 자기 공격 루프를 쓰는 보스라 `bosses.js ownAttackTurn`의 `engineCast`로 엔진의
  시전 기록(`castLeft`·선 채 버티기·끊김)을 쓴다. 화면의 3단 채널 클립(`Skill_01_Begin`/`_Loop`/`_End`)은 엔진 시전이 `hold`로 알리고 마지막 올가미가 사라져 시전이 끝날 때 닫는다(위 「화면」, 2026-11-15).
- **'염의 가호'(아군 소환물 `enemy_9012_acloon`) 「祛恶之焰」**: 선 투사체 `projectile_enemy_acloon_line`(`LassoProjectile`)의 길이는 블랙보드 `hit_duration`(없으면
  `_linkDuration` 7) — 지금 20초와 같다. 선은 시전자가 **침묵 또는 기절**이면 끊긴다(`_isSilenceable` → `LinkProjectile.OnTick`의 `isSilencedOrStunned`; 우리 기절 깃발 =
  빙결·공중 띄우기 포함). 고정은 대상이 살아 있고 필드에 있으며 OUT_OF_GROUND가 아닌 동안 이어진다(`_ValidForLassoProjectile`) — 대상이 은신·선택 불가가 되어도 안 풀린다.
  전에는 기절·빙결 중 고정을 쥔 채 피해만 멈췄고, 선택 불가가 되면 풀렸다. 구현 `content/tokens.js yanyouKit`.
- 테스트: `test/content/enemies_bosses.test.js` 「W: the charge hits its target alone…」·「W: below half HP…」·「陷落雪祀: 【反自然馈赠】 a freeze…」·「“萨米的意志” 自然涌动: casts while
  its lasso holds…」, `test/content/playtest4_summons.test.js` 「#12 祛恶之焰: a stun (or a freeze) ends it…」(모두 수정 전 코드에서 실패 확인). golden: `roster` 004·021(W)·030(함락의
  제사장), `act3-roster` 032(W), `fields` boss-boss_7-pair·solo('사미의 의지'), `matches` coop3-ABYSS-5(W·함락의 제사장 쪽 `leaders.js`).
- 빠짐 방지: `test/content/enemy-proj-wait-coverage.test.js`가 데이터(`skillCast.*.proj`, 묶음의 자식 포함, 모든 시즌)의 투사체 기다림 스킬마다 키트 능력에
  `projAlive`와 `onCut`이 있거나 `test/content/enemy-proj-wait-list.js`에 이유와 함께 있는지(시전 안 함 · 다른 키트가 돌림), `projAlive`가 기다림 없는 스킬에 붙지 않았는지 보고,
  이어진 스킬을 막힌 자리에서 실제로 시전시켜 열린 시전이 30초 안에 끝나는지(`PROJ_WAIT_MAX` 60초까지 서 있지 않는지) 본다. 2026-11-14 기준 9개 중 이은 것 5, 목록 4
  ('염의 가호' 둘 — 모드 2는 아군 소환물 키트, 모드 1은 시전 안 함; 살카즈 후예 기술자 둘 — 시전 안 함). 확인: W의 `projAlive`를 빼거나 재즈 연주가의 것을 늘 참으로 바꾸면 실패. 시전 안 함은 공용 목록 → 위 채널 클립 줄.

### 티티 S2 「밀봉 보호」의 HP 비율 동률은 위협도 순 (upstream `8668a9cd` `47c22d39`, upstream #906)

- 규칙: 티티(오퍼레이터) S2 「밀봉 보호」(`skchr_titi_2`)가 함께 재우는 오퍼레이터는 범위 안 HP 비율이 가장 낮은 하나, 같으면 **위협도(仇恨值)가 높은 쪽** — 도발 단계가 높은 쪽, 그다음
  늦게 배치한 쪽(`targeting.js aggroCmp`, 적이 노리는 순서). 전에는 유닛 번호가 작은 쪽(먼저 배치한 쪽).
- 근거(공식 클라에서 확인): 스킬 프리팹 `skchr_titi_2`의 능력 `GlobalUnique` 선택기 — 자신 제외, `_postFilter` 74 `HP_RATIO_ASC_HATRED_DES`, 최대 1. upstream은 제보자 기대로
  「늦게 배치한 쪽」을 넣었고, 클라 정렬도 같은 결론에 도발 단계가 먼저 온다.
- 테스트 `test/content/kits_alt_t5.test.js` 「缇缇 S2 封护: an HP-ratio tie goes to the higher 仇恨值…」.

### 같은 장비 둘은 둘 다 효과가 있다 — 덮어쓰기 묶음인 둘만 하나 (upstream `4505fb6f`, upstream #902)

- 규칙: 한 오퍼레이터가 같은 장비를 둘 가지면 둘 다 효과를 낸다(원암 용제 고급 둘 = 공격력 +60 % + 60 %, 초당 −120; 빅토리아 해머 둘도 겹침; `items/battle.js installItem`의 사본 키
  `item:<id>#n`). 단 두 효과는 **오퍼레이터마다 하나만** 켜진다: 사르곤 농차·패밀리 배지의 SP 자연 회복(같은 버프 — 둘을 함께 들어도 먼저 단 것 하나)과 해구 실험체의 고정 피해 감소
  (`OVERRIDE_GROUPED`; 먼저 단 것이 사라지면 다음 것이 켜짐). 해구 실험체의 에기르(맹약) 반격은 사본마다다. 전에는 같은 장비의 둘째가 첫째를 덮어써 하나만, 다른 장비끼리는 SP 회복도 겹쳤다.
- 근거(공식 클라에서 확인): 장비의 전역 버프 프리팹(`[uc]globalbuffs.ab`, 장비 표 `bbStr.key`)이 오퍼레이터에게 거는 버프는 모두 `disableOverride` 1(덮어쓰기 묶음 밖 — 사본마다
  따로)인데, `act1autochess_acarm050_global_buff`(SP 회복)과 `[g]halfidle_block_fixed_damage`만 0·`DEFAULT` — 같은 키의 버프는 줄을 서고 끝나지 않은 첫 것만 켜진다
  (`Buff.OverrideGroup`, 「버프 덮어쓰기 그룹」). `GlobalBuff.TryAddBuff`는 그 프리팹의 `_buffs`를 그대로 건다(장비 하나 = 전역 버프 하나, 횟수 제한은 그 전역 버프 안에서만).
  upstream은 사본 전부 겹침을 추정으로 넣었다(근거 없음 표시).
- [추정·미조사: 나란투야(전략)가 빌려 준 장비(`lendItemEffects`)가 자기 것과 같은 장비일 때 — 지금은 빌린 것도 따로 겹침, 덮어쓰기 묶음 둘은 같은 줄에 섬; 빌려 주기의 클라 경로를 안 읽음]
- 테스트 `test/content/items.test.js` 「two advanced 源石溶剂 on one operator…」·「override-grouped item buffs…」.

### 에기르(맹약) 부활은 공식 클라대로 — 쓰러질 때마다·쓰러진 차례로, 연합 방어에 쓰러진 채 든 구성원도 (upstream #882, 관리자 결정 2026-11-13)

- 규칙(`bonds/nation/egir.js installEgir`): 에기르 부활 단계(`max_free_respawn_cnt` 3; 기본 시즌 5명, 규정 6명)가 켜진 플레이어의 구성원이 쓰러지면 횟수가 남는 한 **그 자리에서 곧바로**
  무료 재배치된다(가득 찬 HP, SP 처음값). 같은 구성원도 부활한 뒤 다시 쓰러지면 횟수가 남는 한 또 부활한다. 전투 시작 삼키기로 쓰러진 구성원도 **쓰러진 차례**로 바로 횟수를 쓰고
  (남은 삼키기 표식은 취소), 불굴(맹약, 우선순위 10)은 에기르(11)가 이미 세운 구성원에는 굴리지 않는다. 쓰러지지 않은 구성원은 횟수를 안 쓰고, 자기 구원(키트·장비)이 막은 쓰러짐과
  자기 부활(M3 고치 갑옷·에르망가르드)이 받은 쓰러짐(`revivedBy`)도 안 쓴다(관리자 결정 2026-10-05 그대로).
  연합 방어에 쓰러진 채 들어온 구성원(`carryState.down`, 강제 퇴장 `FORCED_EXIT`)은 모든 삼키기가 끝난 뒤 남은 횟수로 처음 배치 차례(왼쪽 열부터, 열 안에서 위부터)대로 곧바로 부활하고,
  횟수가 없으면 쓰러진 자리에서 재배치 시간을 센다. 그 강제 퇴장은 쓰러짐이 아니라 쓰러짐 효과(불굴·스펙터 등)·쓰러짐 수는 없다.
  전에는 구성원당 첫 쓰러짐 한 번(관리자 결정 2026-10-05, 문구 「首次被击倒时」), 삼키기 부활은 삼키기가 끝난 뒤 좌하→우상 위치 스캔(커뮤니티 제보 2026-10-07; 0.2.0 전에는 쓰러진 차례),
  쓰러진 채 들어온 구성원은 횟수를 안 씀이었다. upstream은 #882를 `ae8ed5eb0`에서 고쳤지만 그 구성원들을 위치 스캔에 섞는다.
- 규정 `_2`(정비 구역 소환, `installEgirAct3`)도 삼키기로 쓰러진 구성원을 쓰러진 차례로 바로 처리한다(카운터가 `ON_OWNER_FINISH`에서 오름). 그쪽 첫 쓰러짐 표시(`egir_first_finish_flag`)는
  `ON_BUFF_START`가 되돌리지 않는 캐릭터 공유 블랙보드라 구성원당 한 번 그대로이고, 강제 퇴장(`OTHER`)은 HP_ZERO·HP_ZERO_WITH_NO_SOURCE·FALLDOWN이 아니라 소환하지 않는다.
- 근거(공식 클라에서 확인): 맹약 효과 `bondeffect_egir`는 전역 버프 룬 `env_gbuff_new`이고 `add_times`가 없어 추가 횟수 제한이 없다(`GlobalBuff.OnInit`·`TryAddBuff`). `Unit.OnBorn` →
  `BattleController.RegisterUnit`이 배치(탄생)마다 모든 전역 버프를 붙이고, `act1autochess_bond_eff_egir`의 `ON_BUFF_START`가 `reborn_mask`를 0으로 덮어쓴다 — 버프는 끝날 때 모두
  지워지므로(`Entity.OnFinish`) 다음 배치의 새 버프에서 다시 0. `ON_OWNER_FINISH`는 `MOVE_LIKE_RESPAWN_SELF`만 거르고 `reborn_mask` 0·인원·편별 횟수(`free_respawn_cnt_a/b` <
  `max_free_respawn_cnt`)를 보고 횟수를 올린 뒤 다음 배치를 즉시·무료로(`CreateCardBuff` UNTIL_NEXT_SPAWN) — 횟수는 끝나는 그 순간 오른다. 연합 방어 시작은
  `MainGameInBattle._StartBattle`: 배치(`_Prebuilt`) → `_OnAutoChessModeChanged`(삼키기 표시) → `MainGameInHelpBattle.StartMainBattle`: 한 틱 뒤 `_ApplyChessStatus`가 이어받을 상태가 없는
  유닛을 `Entity.FinishWithNoReason`(끝난 이유 `OTHER`)로 끝내고 한 틱 뒤 자동 시전·배치가 시작된다. `Entity.OnFinish`는 끝난 이유와 상관없이 `ON_OWNER_FINISH`를 돌린다(죽음 이유가
  아니라 `ON_OWNER_KILLED`·쓰러짐 수는 없음). upstream #882가 든 공식 일본 서버 녹화(제3자): 앞 전투에서 쓰러진 스펙터·스카디가 연합 방어 시작에 부활.
- [추정·엔진: 클라는 부활한 카드를 자동 배치가 시작될 때 내놓는다(삼키기 뒤) — 우리는 곧바로 세우고 남은 표식만 취소해 결과가 같게 둠; 삼키기 피해(`[eat_mark]` `ON_BUFF_LATE_ENABLE`)가
  강제 퇴장 제거보다 먼저인 것은 코루틴 yield와 늦은 틱의 차례; 쓰러진 채 든 구성원끼리는 캐릭터 목록(`UnorderedArray`) 차례인데 삼키기로 빠진 유닛이 목록을 섞을 수 있어 배치 차례로 둠]
- [추정·미조사: 클라의 `ON_OWNER_FINISH`는 철수류 끝남에도 돈다 — 우리는 쓰러짐('killed')과 연합 방어 강제 퇴장만 셈; 이 모드에서 스스로 철수하는 에기르 구성원은 없음. 연합 방어에서 두
  플레이어가 같은 편이면 클라 횟수(`free_respawn_cnt_a/b`)를 함께 쓸 수 있으나 우리는 플레이어마다 → bundles 줄]
- 테스트 `test/content/bonds_core.test.js` 「阿戈尔 5: in the fight…」·「…the battle-start devour's knock-outs take the slots at once, in knock-out order…」·「…the slots the devour leaves…」·
  「阿戈尔 5 slots in 联防…」, `feedback4-egir-unite.test.js` 「联防: a member a teammate's devour knocks out…」, `feedback3-egir-down.test.js`, `bonds_act3.test.js` 「阿戈尔 6 (_2): the devour's
  knock-outs call at once…」, `test/match/unitedown.test.js` 「…a 阿戈尔 member entering down…(upstream #882)」(실제 판 경로).

## upstream 0.3.4 개발분 대조 이식 — 매치·서버 (2026-11-07)

upstream 개발 브랜치의 매치·서버 버그 수정 둘(이식 묶음 D). 둘 다 손 이식이고 새 시험이 수정 전 코드에서 실패하는 것을 확인했다. golden은 그대로.

### 전략 선택 전에 나간 자리는 LP 0 그대로 (upstream `78f1e0ec`)

- 규칙: 브리핑(`INFO_CHECK`)에서 나간 자리(중도 퇴장 = 탈락, LP 0, `_quit`)의 차례에 기본 전략이 정해져도 그 전략의 시작 LP를 받지 않는다(`phases.js _applyBand`·
  `finishBandDraft`: 살아 있는 자리만). 팀 목록(`m.public`)과 결과에도 0. 판 점검(`audit.js` 'bands')도 나간 자리의 0을 기대한다. 전에는 「나감」 상태로 시작 LP가 다시 보였다.
  나간 자리의 기본 전략은 지금처럼 와파린(전략)이다(upstream `6dc796d1`의 AI 선택은 받지 않음, 관리자 결정 2026-11-07).
- 근거: 중도 퇴장 규칙(탈락, 목표 HP 0 — PRTS 卫戍协议/帮助), upstream 판단.
- 테스트 `test/match/connection.test.js` 「onLeave: a seat gone before the strategy draft keeps 0 LP…」.

### 판이 끝날 때 끊겨 있던 사람은 방이 사라져도 다시 들어오면 결과를 받는다 (upstream PR #912, upstream에 아직 병합 전)

- 규칙: 판이 끝날 때 연결이 끊긴 자리(나가지 않음)의 결과 프레임(마지막 `m.public`·`m.result`)을 그 세션에도 남긴다(`lobby.js onMatchEnd` → `session.pendingResult`).
  다시 들어오면(`onHello`) 방이 없으면 바로, 방이 있어도 방이 더는 그 사람에게 결과를 다시 보내지 않으면(리플레이가 없거나 그 사람 몫이 끝남) `room.state` 뒤에 보낸다 — 방이
  리플레이를 갖고 있으면 지금처럼 그쪽이 보내고 남긴 것은 버려 두 번 오지 않는다. 전에는 마지막 사람이 끊긴 채 끝나면 방이 바로 사라지면서(`empty`, 닫힘 알림 없음) 리플레이도
  사라져, 돌아온 사람이 멈춘 판 화면에 세션이 끝날 때까지 머물렀다.
- 테스트 `test/lobby.test.js` 「the last human away when the match ends still gets its m.result after the room is disposed」(PR의 시험), 같은 묶음의 리플레이 순서 시험들(방이 있을 때 한 번).

## 오퍼레이터 스킬 발동 시점 묶음 B (2026-10-29)

오퍼레이터 스킬이 언제 켜지는지의 남은 추정 가운데 오퍼레이터별 작은 것들. 모두 공식 클라에서 확인(프리팹·버프 템플릿·자동 조작 코드).

- **B1 사리아 S1 「응급처치」(`skchr_demkni_1`)**: 스킬 범위에 HP ≤ 절반인 치료 가능한 아군이 생기는 **그 틱에** 시전해 SP를 쓰고, 그녀의 **다음 공격**이
  그 아군 치료가 된다(전에는 공격하는 순간에 시전 — SP 시점이 공격 한 번 안쪽으로 달랐다). 기다리는 동안 그 조건이 깨지면(아군이 절반 위로 회복) 시전은
  사라지고 **SP는 돌려받지 않는다**(전에는 돌려받음). 휘두르던 일반 공격 중에 시전되면 그 휘두름은 일반 공격으로 끝나고 치료는 다음 공격. 2충전(정예)의
  두 번째 충전은 앞 치료가 나갈 때까지 쓰지 않는다(그대로). 근거: 프리팹 `skchr_demkni_1` — `ReplacementSkill` 꼴(`_cancelIfSearchTargetFailed` 1,
  `_recoverSpIfTargetDead` 1), 트리거 선택기 아군·`_maxHpRatio` 0.5(같음 포함). `NextAttackOrCombatSkill.DoTick`(AUTO: SP와 트리거 탐색만 보고
  `UseSkill`), `ReplacementSkill.TryHookSearchTarget`(탐색 실패면 대체 해제, SP 반환 없음), `OnCastFinish`(전딜 중 대상 사망만 SP 반환 — `ai.js
  dropNextAttack`). 구현 `skills.js` 틱(아군 규칙 DEFAULT), `ai.js allyStrike`(시전 전에 시작한 휘두름). 테스트 `test/content/heal-triggers-023.test.js`,
  `kits_alt_t5.test.js` 「号角 S1 / 塞雷娅 S1」, `test/sim/playtest6-skills.test.js` 「#16」.
- **B2 '염의 가호'(炎 맹약 소환물) 「祛恶之焰」(공식 한국어 이름 없음)**: 쿨다운은 채널이 끝난 뒤부터 다시 돈다 — 지금 구현과 같고 추정 표시만 근거로 바꿈. 근거: 적 프리팹
  `enemy_9012_acloon` `Modes/2/Body/Skills/Skill_2` = `EnemySkill`(`_resetMainAbilityCdWhenCastEnd` 0) + `RangedAttack` 능력
  (`_waitForProjectileInvalid` 1, `projectile_enemy_acloon_line`): `RangedAttack.OnWaitForPostDelay`가 투사체가 살아 있는 동안 시전을 이어 가고,
  `EnemySkill.OnTick`은 시전 중엔 쿨을 안 돌리며 `_OnCastFinish`가 쿨을 처음부터 다시(`content/tokens.js` 炎佑 머리 주석).
- **B3 스펙터 디 언체인드·카제마루의 替身 전환**: 전환(替身으로·본체로 둘 다)이 시작될 때 **SP를 비운다**. 替身 동안은 SP가 안 차므로(阻回) 어떤 발동
  규칙으로도 스킬이 안 켜진다 — 「替身 동안 S1 技能范围도 시전 안 함」 추정이 이것으로 정해짐. 전에는 SP가 그대로 남아, 본체로 돌아오자마자
  켜질 수 있었다. 근거: 버프 템플릿 `ghost2_switchbegin`·`kazema_switchbegin` ON_BUFF_START = ClearAllBuffs + InterruptCharacterSkill +
  **ClearCharacterSp**, 替身 모드 `ghost2_standin[switch]` abnormalFlags SP_RECOVER_STOPPED. 구현 `professions.js installDollkeeper startSwitch`.
  예외 없음: 스펙터 디 언체인드는 본체로 돌아온 뒤(`ghost2_switchend`) `switch_recover_sp`로 SP를 받지만, 그 양(`ghost2_e_t_10` `sp`)은 X 모듈
  (`uniequip_002_ghost2`) 2·3단계 재능의 8/15뿐이고 이 모드 정예는 1단계(`equipLevel` 1)라 0.
  테스트 `test/sim/feedback2-doll.test.js` A·D.
- **B4 토가와 사키코 S2 「满月的舞会」(공식 한국어 이름 없음)**: 공식은 자동 조작이 한 번만 켠다(피아노 → 오르간 뒤 그대로) — 확인했으나 **아직 안 바꿈**, `diy.md` 「사키코 S2」.
- **B5 프라마닉스 더 프레리타 S1**: 키트의 `trigger: 'DEFAULT'` 강제와 옛 추정 주석을 지우고 데이터의 SEARCH를 쓴다(2026-10-11부터 엔진 SEARCH =
  초기 공격 범위의 적, S1은 `rangeId`가 없어 DEFAULT와 같은 검사 — 동작 같음).
- golden(B1·B3): `roster` roster-004(카제마루)·014·033·034·043·048(사리아·스펙터 디 언체인드), `matches` 11개(봇 편성).

## 오퍼레이터 스킬 발동 시점 묶음 C (2026-10-29)

묶음 B 다음, §11에 있던 것 가운데 둘. 모두 공식 클라에서 확인(버프 템플릿·스킬 프리팹·자동 조작·능력 코드).

- **C1 텍사스 디 오메르토사(`char_1028_texas2`) 재능 「텍사스 전통」(德克萨斯传统) 재시전** (`chess_char_4_16-texas2.js`): 배치마다 첫 처치에서
  `texas2_recast_already`(배치당 한 번)와 검사 버프 `texas2_t_1[recast_after_born]`(INFINITY, 0.03 s 간격)이 생긴다. 검사 버프는 첫 트리거(처치 순간이 아니라
  그 버프의 첫 틱, `Buff.OnTick`)에서 `AlwaysNext`로 **늘 끝나고**, 그때 주인에게 `texas2_recast_not_valid`가 없을 때만 스킬을 재시전 대기로 둔다
  (`SetMultiAppearSkillPendingToCast`). 금지 버프는 S2 `Damage`·S3 `AppearSwordRain` 능력이 시전 동안 붙인다(`BuffDuringCasting`, `OnCastFinish`에 끝 표시 →
  `ContainsBuff`가 안 셈). 두 능력의 시전은 `_timeMode` 2·`_cooldown` 1·`_animKey` 없음 → 1 s(후딜 `EasyToStartAbility.get_postDelay` 포함) →
  **배치 뒤 1 s 안의 첫 처치(배치 폭발·등장 두 타 포함)는 재시전도 전체 회복도 없이 쓰인다.** 대기 재시전은 `MultiAppearSkill.OnTick`이 주인이 스킬을 쓸 수
  있을 때(`ownerCanUseSkill` — 기절이면 기다림) 지금 스킬을 끝내고 다시 쓰며, 전체 회복은 그 재시전의 시작에서 난다(`texas2_t_1[conditional_atk]` ON_SKILL_START,
  `texas2_recast_already`가 있으면 `HealViaMaxHpRatio`). 구현: 창 `BURST_CAST` 1 s, 재시전은 처치 다음 틱부터 `canAct`일 때, 회복도 그때. 전에는 처치 순간 회복하고
  같은 틱에 재시전했으며, 배치 폭발 처치도 재시전(동기 재진입)했다. S1(배치 폭발 없음)은 언제나 재시전. 최상위 `texas2_recast_not_valid`(템플릿
  `texas2_inturrput` = 공격 끊기)는 LIMITED, 버프 블랙보드 `_duration` 0.1 → 0.1 s(1 s 창 안). 테스트 `kits_t4.test.js`·`kits_alt_t4.test.js`
  「缄默德克萨斯」.
  - 같은 근거로 S2·S3 시전 시각도 클라대로(관리자 결정 2026-10-29 「공식대로 맞춰」): S3 첫 검우 1.4 s·지속 `duration` + 1 s, S2 폭발 0.167 s 뒤·지속
    `duration` + 1 s — 위 「缄默德克萨斯 S3 剑雨滂沱」.
- **C3 외근 의료(外勤医疗, 전략) 맵 캐릭터 Touch 「간절함의 복음」(恳切福音)**: 발동 = 데이터의 DEFAULT, 스킬 rangeId 5-2 상자 안의 **적**(선발 대타 Touch와
  같음). 근거: 자동 조작 `_TryTriggerAvailableSkills`가 `unitManager.characters` 전부(맵 캐릭터 포함)를 돌고, 카드가 없는 캐릭터의 형은
  `_GetAutoChessSkillTriggerType`이 act2autochess `skillTriggerDataList`에서 찾는데 Touch(의료·의사, `char_613_acmedc`)는 항목이 없어 DEFAULT. 전에는 키트가
  `ACTIVE_RANGE`(5-2 안의 부상 아군, upstream GitHub #260 / PR #278)로 덮어썼다. 구현 `content/tokens.js touchKit`. 테스트 `test/content/tokens_devices.test.js`
  「外勤医疗 Touch」.


## 오퍼레이터 시점·차례 묶음 B (2026-10-31)

남은 일 묶음 B의 줄들. 모두 공식 클라에서 확인(버프 템플릿 `buff_template_data`·스킬·투사체 프리팹·액션 노드·투사체 동작). 첫 공격 OnEnter 판정은 위
「일반 공격 타이밍」.

- **우타게(宴, `char_337_utage`) S2 「낙지참·파문」(落地斩·破门) `respawn_time 1`**: 스킬 프리팹의 상시 버프 `utage_s_2[respawn]`은 속성 수정 하나 —
  `RESPAWN_TIME`, 식 칸 `FINAL_SCALER`, 값은 블랙보드에서(`loadFromBlackboard`: 블랙보드[속성 이름] = `respawn_time`). 최종 배율 × 1이라 재배치 시간은
  그대로다(본편 skill_table도 10레벨 모두 1, 설명에 재배치 문구 없음). 그래서 키트에 넣지 않는다 — 구현 없음이 공식과 같다. 코드 변경 없음.
- **티피(蒂比, `char_4191_tippi`) 재능 「촬영장 업무 지침」(片场工作指南)** (`chess_char_2_13-tippi.js`): 공식 그래프 `tippi_t` / `tippi_t[timer]` /
  `tippi_t[evade]`대로.
  - `tippi_t`가 버프 시작(배치)에 타이머를 만든다. 타이머는 1초마다 `tippi_t[stack]` +1, `stack_time` 이상이면 `tippi_t[evade]`(이펙트 `tippi_buff_01`)를
    만들고 스택·자기를 끝낸다 → **배치 뒤 `stack_time` 초에 준비**(전: 배치 즉시 준비).
  - `tippi_t` ON_TAKE_DAMAGE: 타이머·스택을 끝내고, `[evade]`가 없을 때만 다시 시작 → 준비 전에는 피해마다 처음부터.
  - `tippi_t[evade]` ON_TAKE_DAMAGE: `FilterDamageModifer`(취소된 피해 거름) → `Evade`(물리·법술, 블랙보드 `prob`) → `tippi_t` 다시 시작 → 자기 끝.
    `Nodes.Evade`는 취소된 피해·물리/법술 밖의 피해·확률 실패면 실패하고, 동작 목록은 앞 노드가 실패하면 멈춘다 → **준비된 동안 순수 피해, S2가 먼저
    피한 피해(이미 취소), 확률에 진 피해에는 준비가 남고 타이머도 다시 안 돎**(전: 어떤 피해든 준비를 썼다).
  - 이동 재배치(`moveRedeploy`)도 배치 이벤트라 타이머가 다시 시작한다(공식 이동 = 퇴각 + 배치).
  - 테스트 `kits_t1t2.test.js` 「2_13 蒂比」(배치 직후·`stack_time` 전 미준비, 뒤 준비, 순수 피해에 남음, 첫 공격 회피·둘째 명중, S2 회피에 남음),
    `test/sim/stack-buff-fx-events.test.js` 「蒂比 T」. 골든: roster-004·006, 매치 coop3-ABYSS-5·coop8-HARD-3·coop2-NORMAL-1-coverage-standins·
    coop2-NORMAL-1-unowned-roster.
- **오퍼레이터 투사체 — 로즈몬티스(迷迭香) S2·산탈라(寒檀) S2가 닿는 때** (2026-10-31, 관리자 요청으로 확인): 투사체 프리팹 원본 값 + 공식 클라의
  `AttachToTarget.OnInit`·`OnTick`·`DoCheckReachedInternal`, `BasicMovement.CheckReached`·`DoCheckReachedInternal`, `Projectile.OnTick`·`EnsureLifeTime`·`StopMe`·
  `OnProjectileStop`.
  - `OnInit`이 대상 자리에 둔다. `_checkReached`일 때만 `OnTick`이 닿음을 본다(거리 0.1 안 → 첫 틱에 닿음), 닿은 뒤 `_delayAfterReached`면 남은 수명 =
    `_delayTime`(블랙보드 `projectile_delay_time`이 덮음) + 그만큼 뒤 멈춤. `_checkReached` 0이면 이동이 닿게 하지 않고, LIMITED 수명이 끝나 멈출 때
    `_alwaysReachInTheEnd`면 그때 닿는다. 명중 동작이 `_onlyCheckHitWhenStop`이면 멈출 때, `_onlyCheckHitWhenReachTarget`이면 닿을 때 친다.
  - 로즈몬티스 S2 `projectile_chr_rosmon_s2`: `_checkReached` 0·수명 1.2 s·`_alwaysReachInTheEnd` → **공격 1.2 s 뒤 명중**(기절 `rosmon_s2_stun_equip`도 그때).
    여진 `projectile_chr_rosmon_s2_after_shock`도 같은 1.2 s, 공격 능력 `_additionalTimes` 3·`_triggerDelta` 0.15 → 여진은 0.15 s 간격(모든 모드가 0.15 —
    전: 0.3 s). 스킬이 끝나기 전에 쏜 공격은 끝난 뒤 닿아도 S2 모양(확산 1.5·여진 3·기절 확률)을 지닌다(투사체가 제 명중 동작을 가짐): 늦게 닿는 샷은 쏠 때의
    프로필을 복사하고(`ai.js`), 기절은 스킬 동안 쏜 공격 id·여진 태그로 고른다(키트).
  - 산탈라 S2 `projectile_chr_sntlla_s2`: `_checkReached` 1·`_delayAfterReached`·`_delayTime` 0.6·명중은 멈출 때 → **고드름 표시 0.6 s 뒤 명중**(전: 근거 없이 고른 0.3 s;
    스킬 블랙보드에 `projectile_delay_time` 없음).
  - 데이터: 추출기 `attach_land` → `shot.land`(`docs/DATA.md`), 시뮬은 날지 않는 샷의 대기에 `land`를 먼저 씀. 다른 오퍼레이터의 ATTACH 샷은 모두 즉시(해당 없음).
    적 투사체 기록에도 `land`가 붙지만 적 경로는 읽지 않는다. 테스트 `kits_t6.test.js` 「迷迭香 S2 (client projectile_chr_rosmon_s2 …)」, `kits_t5.test.js`
    「寒檀 S2: ice spikes …」.
- **대상이 먼저 죽은 즉시 AttachToTarget 샷 — 블레이즈 디 이그나이팅 스파크(烛煌) S3·위셔델(维什戴尔) S2** (2026-10-31, 관리자 제보 「이격 블레이즈 S3가
  발사된 후 목표 적이 죽으면 타격 이펙트가 안 나옴」): 늦게 닿는 샷은 닿을 때 대상이 죽었거나 숨었으면 통째로 버려졌다(피해·확산·이펙트 모두 없음).
  - 공식(투사체 프리팹 원본 값 + 공식 클라에서 확인): `projectile_chr_blaze2_s3`·`projectile_chr_wisdel_s2`는 `_stopIfTargetDead` 0·`_stopIfTargetDisappeared` 0 —
    대상이 죽어도 멈추지 않고, `_keepUpdate`·`_followTarget` 0이라 쏠 때 놓인 자리에 남는다. 멈출 때 충돌체(`_rangeToLoad`) 안 적을 친다(`HitBehaviour`
    `_onlyCheckHitWhenStop`). 주 대상은 `_alwaysHitTraceTargetInTheEnd`로 따로 치지만 `Projectile._DealHitTraceTarget`이 `ValidAndAlive`일 때만 → 죽은 대상은 빠진다.
  - 고친 것(`ai.js`, 처음 23d7a6a05): 즉시 ATTACH 샷이고 확산이 있으면, 닿을 때 대상이 없으면 **쏜 순간의 대상 자리**에서 대상 없이 `resolveHit`(확산·키트의
    `onHit`/`afterHit`). 산탈라 S2는 키트가 칸에 떨어뜨려 대상과 무관.
- **늦게 닿는 ATTACH 샷의 충돌체는 쏜 자리에 — 로즈몬티스(迷迭香) S2 포함** (2026-10-31, 위 절의 남은 확인 둘, 관리자 승인):
  - 공식(프리팹 원본 값 + 공식 클라에서 확인): `projectile_chr_rosmon_s2`도 `_stopIfTargetDead` 0·`_attachToMountPoint` 1·`_keepUpdate` 0(쏠 때 대상의 마운트 점에
    한 번 놓임)이고, 닿을 때 `HitBehaviour.OnProjectileReached`(`_onlyCheckHitWhenReachTarget`)가 자기 충돌체(`GetComponentsInChildren<Collider2D>` →
    `Box2dPhysicsUtil.FindTargets`) 안 적을 친다 — 대상 생사를 보지 않는다. 충돌체는 루트의 `CircleCollider2D`: 烛煌 S3 1.7·위셔델 S2 0.9·로즈몬티스 S2 1.5
    (우리 확산 반경과 같음). 여진은 `_castToFirstRoundTargetLocationsAtProjectileBirth` 1이라 첫 샷 대상의 자리로 나간다. `_alwaysHitTraceTargetInTheEnd`·
    `…WhenReached`가 있는 것(烛煌 S3)만 주 대상을 충돌체 밖에서도 친다(살아 있을 때) — 로즈몬티스·위셔델은 대상이 충돌체를 벗어나면 못 맞힌다.
  - 고친 것: 추출기 `enemy_projectiles.py`가 ATTACH 투사체에 `trace` 1(위 두 필드)을 적고(`local-op-projectiles.json` → `shot.trace`, `simdata.js normOpShot`),
    `ai.js`는 확산 있는 ATTACH 샷을 **언제나 쏜 자리 중심**으로 친다(`resolveHit` `info.spot`): 대상은 살아 있고 `trace`이거나 그 자리 확산 안일 때만 주 대상,
    아니면 대상 없이(즉시·아님 구분 없음 — 23d7a6a05의 `instant` 조건은 뺌).
  - 화면: 烛煌 S3 타격 불길은 쏘는 순간 대상에 생긴다(대상이 그 뒤 죽어도 남) — rules/fx.md 「쏠 때 트는 타격 이펙트」. 투사체의 `_onlyPlayHitEffectOnTraceTarget`은
    `EffectBehaviour.OnHitTarget`에서 투사체 자기 `_effectsWhenHit`(이 샷은 비어 있음)만 거른다 — 2026-10-22 「텍스처 반복 방식」의 「주 대상만」 근거가 아님.
  - 테스트 `test/sim/attach-shot-dead-target.test.js`(로즈몬티스 대상 사망, 대상이 떠났을 때 烛煌은 맞히고 로즈몬티스는 못 맞힘). 골든: roster-013·017·018,
    boss-boss_3-solo, unite-2, 매치 coop4-FUNNY-6·coop8-HARD-3·coop2-ABYSS-10-boosted·coop2-NORMAL-14-standins, diy-001·002 (fx-events는 그 판들의 변화만).

## 버프 그래프 노드 본문 (2026-10-31)

남은 일 묶음 가·나: 버프 그래프 노드·카드 버프가 하는 일을 공식 클라에서 확인. 가(저항 대상)는 위 「저항 대상」.

- **`ModifySp` `_modifyByRatio`** (기습(突袭) `modify_sp[ratio]`): 더하는 SP = `RoundToInt(최대 SP × 블랙보드[_spString](없으면 _modifyRatio))`, SP 수정치로
  **더한다**(설정이 아님; `_modifyByRatioBasedOnCurSP`면 지금 SP 기준, `_isMinis`면 뺌). 스킬 경로(`sp` 1.0)는 가득 참 — 시뮬 `raidJump` `fullSp`와 같음.
  10초 무공격 경로는 뛰기 전 비율(`AssignCurSpToBB`)을 더해 SP 유지(PRTS 「保留技力」) — 시뮬 `keepSp`와 같음. 코드 변경 없음.
- **`CheckDistance`**: 두 대상의 맵 위치 사이 유클리드 거리, `d² ≤ r²`면 참(경계 포함; `_checkCertainPosition`이면 블랙보드 행·열과 맨해튼 거리).
  정밀 조준경(精准狙击镜, `act1autochess_acarm063_buff`)은 `CheckDistance radius 3` → `IfNot` → `DamageScale`이라 **정확히 3칸인 적은 보너스 없음**,
  3칸 넘는 적만 ×`damage_scale`(설명은 「3格及以上」). 2026-10-31부터 시뮬도 `> radius`(전: `≥ radius`). `items/effects/damage.js chess_item_3_02_e`.
- **`AutoChessAssignSameBondCharacterCntToBB`**: 주인과 같은 플레이어의, 전투 중인 캐릭터 말 가운데 맹약이 하나라도 겹치는 수(주인 포함). 주인에게
  맹약이 없으면 0. 신속 전투식량(迅捷作战粮, `act1autochess_acarm051_buff` ON_OWNER_LOCATE: SP = `sp_each_person` × 그 수)은 시뮬의 `each × (1 + 겹치는
  다른 오퍼레이터)`와 같고, **맹약 없는 오퍼레이터는 0**(전: `each`). `items/effects/resource.js chess_item_3_05_e`.
- **`AutoChessAssignGatheredAttributeToBlackboard`**: 필드의 모든 캐릭터(유닛 관리자 목록, 주인 플레이어로 거르지 않음) 가운데 `_filterByBondIds`가
  하나라도 겹치는 캐릭터의 속성 지금 값의 합 × 블랙보드[_scaleKey](없으면 `_scale`). 염의 가호(炎佑, 소환물 `enemy_9012_acloon`; `acloon_gather_attribute`, ON_BUFF_START, `scale_attribute`
  0.3, FINAL_ADDITION)는 **2인 필드에서 짝의 炎 오퍼레이터까지 더한다**(전: 부른 플레이어의 것만). `bonds/nation/yan.js installYan`.
- **카드 버프 재배치 시간 비율**(`Deck.Card.RuntimeRespawnTimeModifier`): 첫 단계에서 비율 아닌 값을 더하거나(덮어쓰기면 바꿈), 둘째 단계에서 비율
  수정치마다 재배치 시간 × `SharedUtils.ProcessFinalScaler(값)`(값 < 0이면 1 + 값). 엠퍼러(大帝) 「긴급 파견」(加急调派, `band16`) −0.5는 배치마다 ×0.5로
  **곱해 쌓인다** — 시뮬 0.5ⁿ과 같음, 코드 변경 없음.
- 테스트 `test/content/buff-node-items.test.js`.

## 진영 판정은 소속 태그 (2026-11-02)

오퍼레이터 재능·스킬의 「○○ 진영 오퍼레이터」(【拉特兰】干员, 卡西米尔干员 …)는 **맹약이 아니라 캐릭터의 소속 태그**로 판정한다(공식 클라에서 확인).

- 공식: 오퍼레이터 자신의 템플릿 `CheckCharacterGroupTag`, 프리팹 `FilterGroupTagTargetValidator`, 덱 선택기 `DeckSelector.filterTag`가 모두
  `BattleCharacterData.CheckGroupTag`로 거르고, 이것은 character_table의 `nationId`·`groupId`·`teamId`와 `subPower` 각 항목의 셋(텍사스:
  lungmen·penguin·siracusa)만 본다. 위수협의 기물 데이터는 일반 변환기로 만들어지고 태그를 더하는 룬도 위수협의 데이터에 없다 → 시즌이 맹약 구성을
  바꿔도 진영은 그대로다. 맹약 필터(`AutoChessFilterCharacterBondIds`)는 모드 자신의 템플릿(맹약 효과·장비·악단)만 쓴다.
- 해당 키트와 태그: 인사이더(`chess_char_1_01`)·이그제큐터 디 엑스 포에데레(`5_01`)·르무엔(`6_01`)·엑시아 더 뉴 커버넌트(`6_13`)·산크타
  믹사파라토(`4_01`) `laterano`, 티티(`5_02`) `sargon`·`minos`, 실버애쉬 더 레인프로스트(`5_14`)·노시스(`4_13`) `kjerag`, 무에나(`5_19`)·니어 더
  래디언트 나이트(`6_17`, 소환물 「耀阳」의 추가 타격도)·플레임테일(`4_19`) `kazimierz`, 라플란드 더 데카덴차(`6_18`) `siracusa`. 전에는 앞의 다섯 6티어·1티어 키트가 맹약만,
  5티어 넷이 맹약 또는 국적, 4티어 셋이 국적만 봤다.
- 구현: 데이터 `powers`(`tools/build-data.mjs powersOf` — `chess.json`·`backups.json units`, 선발 기물은 `shared/standIn.js`로 같이 옴)와
  `server/sim/content/kits/shared/powers.js hasPower`. 선발 오퍼레이터의 핵심 맹약도 같은 `powers`로 고른다(`diy.operators[].powers`).
- 지금 시즌에서 바뀐 것: 티티 재능2(精力充沛)가 퍼퓨머(`chess_char_2_14`, 국적 로도스·복수 소속 미노스, 사르곤 맹약 없음)에게도 붙는다. 노시스 재능2는
  해럴드(`chess_char_2_05`, 복수 소속 쉐라그), 플레임테일 재능1은 데겐블레허(`chess_char_6_19`, 복수 소속 카시미어)에게도 — 전에 국적만 봐서
  빠졌다. 장비가 주는
  맹약(`unitBonds`)은 전에도 지금도 진영을 바꾸지 않는다(공식과 같음).
- 2026-11-06 손으로 쓴 명단을 같은 태그로 옮김: 심해 사냥꾼 `abyssal`(글래디아·스카디·스카디 더 커럽팅 하트 재능·울피아누스·스펙터 디 언체인드), 라인 생명 `rhine`(뮤엘시스), 우르수스 학생 자치단 `student`(지마 더 레이징 타이드 `op-headb2`), 로도스 `rhodes`(켈시 에스페란타 재능 2). 공식 클라에서 확인: `kalts2_t_2[hp_recover]`·`skadi2_t_2`·`mlyss_e_003_t` 템플릿의 `CheckCharacterGroupTag`, 글래디아·울피아누스 프리팹의 태그.
  - 바뀐 것: 켈시 에스페란타 재능 2의 로도스 배율이 국적만 보던 것에서 복수 소속까지 본다 — 지금 시즌에서 카제마루·프틸롭시스·니어 더 래디언트 나이트(기물)와 첸 더 던스트릭·위셔델(선발)이 새로 받는다. golden 코퍼스는 그대로다. 나머지 셋의 명단은 지금 데이터와 결과가 같고, 숨은 시즌 `next`에서는 안드레아나(`char_218_cuttle`)가 심해 사냥꾼으로 잡힌다.
- 테스트 `test/content/kit-factions.test.js`(데이터·도우미·하네스·실제 매치 경로).
## 탄약 스킬의 탄 더하기와 되돌리기 (2026-11-06)

공식 클라에서 확인: 템플릿 노드 `AmmoSkillCountModifier`의 두 길이 다르다.

- `_modifyMaxCount`(`SetMaxAdditionCount`): 최대 탄과 남은 탄이 함께 는다. 라테라노 맹약, 인사이더·르무엔·이그제큐터 디 엑스 포에데레 재능, 엑시아 더 뉴 커버넌트 S2. 모두 스킬 시작 때라 그 순간 남은 탄 = 최대 탄이고, 우리 `SkillRuntime.addAmmo`의 결과와 같다.
- `_recoverEventCount`(`AbilityEventCounter.RecoverEventCount`): 쏜 탄을 되돌린다. 최대 탄은 그대로, 쏜 탄보다 많이 돌려주지 않고, `_recoverSkipLimitCheck`가 아니면 한 발동에 합쳐 최대 탄까지(`get_recoverCountLimit`, 스킬 프리팹에 `_overrideRecoverCountLimit`을 켠 것 없음). `SkillRuntime.recoverAmmo`: 산크타 믹사파라토 S1·S3, 장비 `chess_item_4_08_e`, 이그제큐터 디 엑스 포에데레 S2(제한 무시), 블레이즈 디 이그나이팅 스파크 S3(제한 무시). 전에는 이 탄도 최대 탄을 넘어 쌓였다.
- 따로 넣지 않음, 결과가 같음(2026-11-07, 공식 클라에서 확인): 인사이더 `inside_t_1[active]`·이그제큐터 재능·엑시아 S2의 `_restoreMaxCount`는 버프가 끝날 때 그 버프 몫을 0으로 적는다(`SetMaxAdditionCount`). `CastSkillWithLimitTimes`는 스킬이 효과 중이면 바뀐 몫을 바로 쓰지 않으므로 도는 스킬의 탄은 줄지 않고, 다음 시전에는 그 몫이 없다. 우리 `addAmmo`는 시전 때 주는 쪽이 있을 때만 더하고 시전마다 새로 시작하니 같다.
- 테스트 `test/ammo-recover.test.js`.

## 치료 금지와 孤立 — 공식 플래그는 하나씩 (2026-11-07, 공식 클라에서 확인)

공식 이상 상태에 「치료 금지」는 `HEAL_FREE`(7) 하나다. 에스텔 S2의 「다른 오퍼레이터의 치료 대상이 되지 않는다」(`skchr_estell_2`의 `estell_s_1`, `abnormalFlags` 7)도 같은 플래그다. 그래서 엔진 `noHeal` 깃발을 둘로 나누지 않고 이렇게 맞췄다.

- 치료 대상 검사(`TargetOptions._VerifyAdvanced`): 목적이 치료이고 `ignoreHealFree`가 꺼져 있으면 `HEAL_FREE`를 거른다. `ignoreAllyTargetFree`가 꺼져 있으면 같은 쪽의 `ALLY_TARGET_FREE`(孤立)를 거른다.
- `queries.js injuredAlliesInKeys`: 孤立 아군도 거른다(전에는 골랐다). 자기 자신과 `healThrough`(켈시 에스페란타의 Mon3tr)는 예외.
- `damage.js heal`·`ai.js chainHealNext`: `ignoreHealFree`면 `noHeal` 깃발도 넘는다. Mon3tr(선발) 연쇄 튕김(`JUMP_OPTS`)이 치료 금지 아군을 고르고 치료한다. 프로필의 `noHeal`(수확자·불굴자·무사 특성)은 무엇도 못 넘는다.
- 팔라스(선발) 재능 2: `pallas_t_2`의 `CreateBuffInRange`는 `purposeMask` HEAL에 `ignoreHealFree` 꺼짐이라 앞칸의 치료 금지 아군을 고르지 않는다. PRTS 비고 「무시하는 것은 자신이 받은 치료 금지」와 같다(전에는 앞칸 아군도 치료했다). 자신은 치료한다 [추정·화면: 같은 선택기가 자신도 거를 코드인데 PRTS 비고는 자신이 치료된다고 한다. 비고대로 둠].
- 시험: `test/sim/combat.test.js` 孤立, `test/content/op_monstr.test.js` 튕김, `test/content/op_pallas.test.js`.

## 규정 전장을 19×21 틀로 (2026-11-08)

규정(`act3autochess`)의 레벨은 지난 시즌과 다른 틀로 온다. 시뮬·서버 배치 지도·`stages.json`은 전장 하나를 19×21 맵 한 장(0행 = 아래)으로 읽으므로, 생성기가 규정 레벨을 그 틀로 다시 놓는다(`tools/level-fields.mjs`, `docs/DATA.md` 「Seasons」).

- **전장**: `level_act3autochess_m01` 같은 전장 레벨은 판 여러 벌을 한 장에 담은 36×55 씬이고, 전투 판은 하위 레벨 세 개(`level_<전장>/level_<전장>_sub_01…03`)다. `sub_01`(7×20)은 자기 판과 그 옆 적 칸, `sub_02`(6×21)는 판 둘을 나란히, `sub_03`(13×21)은 보스 판과 그 아래 적 대기 칸이다. 조각은 지난 시즌 틀의 블록 그대로다. 근거는 셋이다. ① 조각의 `configBlackBoard`가 지난 시즌 값이다(`leftBoss ((0,0),(6,10))`·`leftNormal ((6,0),(12,10))`·`enemy_place_rect ((14,7),(18,13))`·`player_map_ud_offset 7`, 19×21 틀의 좌표). ② `sub_01`과 `sub_02`의 자기 판은 전장 10개 모두 칸마다 같다. ③ 다시 놓은 m01이 지난 시즌 1기 `act1autochess_m01`과 칸마다 같다(다른 곳은 6행·13행 왼쪽이 통행 불가 대신 비행만, 오른쪽 판 정비 줄의 순간이동 입구 (8,11)뿐). 놓는 자리: 0–6행 = `sub_03` 0–6행, 7–13행 0–10열 = `sub_01`, 8–13행 11–20열 = `sub_02`, 14–18행 = `sub_03` 7–11행. 장치·숨은 캐릭터도 조각과 함께 옮긴다. `sub_02`에서는 10열의 둘째 플레이어 의료(`char_605_cmedic#2_multi_only`, 틀 (10,10))도 가져온다.
- **웨이브**: 웨이브 레벨의 맵은 그 판의 자리표시(판 하나 5×9, 보스 판 6×17, 联防 두 판 5×17)이고 경로도 그 좌표다. 순간이동 입구(`tile_telin`)가 있는 자리표시는 원점 (1,2), 없으면 (9,2)에 놓는다. 두 시즌에 다 있는 웨이브의 지난 시즌 경로가 규정 경로에 이만큼 더한 값으로 그대로 들어 있다(판 하나짜리 13개는 전부, 최종 보스·联防은 일부 경로가 바뀌었고 나머지는 같음). 모양만으로는 정하지 않는다: 판 하나짜리 자리표시는 보스 판 왼쪽 절반에도 들어맞는다.
- **칸**: 규정의 임시 정비 칸은 새 타일 `tile_acbag`(기호 `A`), 정비 칸은 `isValidHand`가 없는 `tile_achand`(기호 `a`)다. `tile_acbag`은 높은 칸·배치 ALL이라, 정비 칸으로 빼지 않으면 보스 판 원거리 칸으로 잘못 잡힌다(`grid.js HAND_TILES`). 습격(`raidBattlefield`)의 전장 칸에서도 정비 칸으로 친다 [추정·CN: 규정 클라의 칸 색인은 못 읽음, 지난 시즌 `tile_achand`가 있던 1행 자리]. 새 칸 둘은 공식 클라 칸 프리팹(CN `battle/prefabs/[uc]tiles.ab`, `BuffTile`)대로 지상(`targetMotion` WALK)의 양쪽 편 유닛에게 걸고 떠나면 끝난다(`_clearBuffsWhenLeft`, `devices.js`):
  - **가속 칸 `tile_speedup`(`u`, m12, 공식 한국어 이름 없음)**: 규정 표 템플릿 `tile_speedup` — 오퍼레이터·소환물(모든 직군)은 공격 속도 +칸 블랙보드 `attack_speed`(25, `ADDITION`), 적은 이동 속도 ×`move_speed`(1.5, `FINAL_SCALER`). 비행 유닛은 받지 않는다.
  - **초원 `tile_duel_grassland`(`G`, m09, 공식 한국어 이름 없음)**: 템플릿 `tile_duel_grassland` — 걷는 유닛은 은신(`INVISIBLE`, 배기 격자 칸과 같은 깃발)이다. 오퍼레이터는 배기 격자처럼 적 원거리 공격의 대상이 안 되고, 적은 저지된 동안만 보인다(`dule_grassland[invisible-enemy]`가 저지될 때 은신 면역을 걸고 저지가 바뀔 때 다시 판정 — 저지가 풀리면 바로 다시 은신, 보통 은신 적의 3초 없음).
- **장치**: 송풍기 `trap_013_blower`(m05)와 늪 조절 장치 `trap_098_mire`(m06, 조각마다 하나라 셋)는 지난 시즌(맹약 m01·m02)과 기록·수치·자리가 같아 그대로 돈다. 냉풍 장치 `trap_1112_acblzd`가 판 가장자리 줄에 넷(지난 시즌은 판 밖 하나)인 것은 플레이어마다 맵 컨트롤러가 하나라서다: 장치 자신의 스킬(`sktok_acblzd`)은 블랙보드가 비어 있고, 규정 표에서 이 장치를 쓰는 것은 맹약 효과(`trap_ac_controller_mark`로 맵 컨트롤러를 찾는 `act3autochess_bond_eff_kjerag_power`·시라쿠사·사르곤 등, 묶음 sim-K)뿐이다 — 시뮬에서는 지난 시즌처럼 장치 자체가 하는 일이 없다.
- **대포 「염괴포」**(盐坨子炮, `trap_196_cnnon`, m10 — 별칭 #1 (13,6)·#3 (13,14)는 자기 판·오른쪽 판 위 가장자리, #2 (6,6)·(6,14)는 보스 판 위 가장자리, 모두 아래를 봄)는 적 편 장치다(`devices.js` `tickCannon`). 근거는 공식 클라 토큰 프리팹(`trap_196_cnnon`)·스킬 프리팹 `sktok_cnnon`·포탄 `projectile_trap_cnnon_small_death`과 규정 표(`character_table`·`skill_table`·`buff_template_data`):
  - 스킬 `sktok_cnnon`(SP 6, 초당 1, 0부터)이 버프 `cnnon_s[enemy_canon]`을 걸고, 본편 보스 「아나스타시오, 속죄자」의 버프가 없는 이 모드에서는 늘 재능 `EnemyCannon00D`를 시전한다. 전투 판(하위 레벨 셋, 큰 씬이 아님)의 룬이 대포를 바꾼다: `char_attribute_add` 공격력 −400(최대 체력 +170000)·`char_skill_cd_mul` SP 비용 ×2 → **전투 시작 12초 뒤부터 12초마다 공격력 800 한 발**(2026-11-14 CN 플레이 제보 「대포가 너무 셈」; 큰 씬 레벨은 −300·×3이라 생성기가 조각 것을 씀 — `tools/level-fields.mjs composeStageLevel`). 룬의 `char` 문자열은 선택자 `charIdFilter`가 되어 `Entity.id` = 표의 캐릭터 키와 비교되므로 별칭 목록(`trap_196_cnnon#1|…|#4`) 줄은 아무 대포에도 안 맞고 키 줄만 한 번씩 적용된다(`RuneData._PopulateAdditionalFiltersFromBlackboard`·`Rune.Verify`·`Character._AssignData`·`CSkillCdMul` 비용 × scale 반올림, 공식 클라에서 확인 2026-11-14; `devices.js levelRunes`).
  - 표적: 유닛이 아니라 **칸**이다 — `ProjectileToTileAbility`의 `TileSelector` `_filterType` 12 `DIST_DES_IN_FRONT_LINE`이 범위(레벨 1의 `4-1`, 자기 칸과 앞 4칸)에서 보는 방향 줄의 칸만 남기고 가장 먼 칸을 고른다(`TileSelector._DoFilter`, 공식 클라에서 확인 2026-11-14). 그래서 늘 앞 4번째 칸(판 아래에서 한 칸 위)에 떨어지고, 그 칸에 아무도 없어도 쏘며, 대포 바로 앞 칸의 유닛은 노리지 않는다(같은 날 CN 플레이 제보와 같음; 전에는 그 줄의 위협도 최고 유닛을 노렸다). 포탄(속도 5)은 그 칸에 떨어져 3×3(`x-4`, 모든 이동 방식, 위장 무시) 안 유닛에 장치 공격력 ×1 물리 스플래시.
  - 삼키기(`Eat`, 나무 버든비스트와 같은 승객 능력): 장치 중심 반경 1(콜라이더) 안의 지상 적 중 무게 ≤ 3(`AdvancedSelectorWithMassRange`) 하나를 태워 둔다(숨김·멈춤). 쏠 때 태운 적을 포탄에 실어 떨어진 자리 ±0.2에 내려놓고(`DurBusAbilityReleasePassenger`), 그 적은 자기 경로를 그 자리부터 이어 간다. 포탄이 날아가는 동안에도 그 적은 대포의 승객이어서 다른 적을 태우지 않는다(`DurbusAbility._SearchPassengers`: 승객 수가 `m_maxCount`(`max_target` 1)면 찾지 않음, 공식 클라에서 확인 2026-11-12). 레벨의 `talent@branch_id`(`route_1_4` 등)는 이 모드 자료에서 경로를 못 찾고, 못 찾으면 공식 클라는 경로를 바꾸지 않는다(`DurbusAbility._DoReleasePassengers`; 관리자 결정 2026-11-11) [추정·자료 없음: 이 모드에서 스케줄러 분기와 맵 추가 경로를 어느 레벨이 채우는지 — EN 클라이언트에 규정이 없어 정할 자료가 없음, 전장 하위 레벨의 분기 번호 0~9에 추가 경로는 1~2개뿐].
  - [추정·엔진] 여럿이 반경 안이면 가장 가까운 적부터(선택자의 `HATRED_DES`를 적끼리 어떻게 세는지 안 읽음). (표적은 칸이라 늘 있다 — 위 「표적」.)
  - [추정·엔진] 장치는 유닛으로 세우지 않아 체력(30000, 방어력 3000, 도발 −1, 판 밖 배치 불가 칸)이 없고 맞지 않는다 — 판 내내 사는 적 편 유닛은 「적을 모두 쓰러뜨리면 끝」을 막는다. 장치가 쓰러질 때의 승객 내려놓기(`cnnon_t[death]`)도 그래서 없다. 장치 모델은 공식 모델이다(render.md 「규정 전장 공식 씬」). 이펙트는 fx.md 「규정 대포 「염괴포」」: 시뮬은 태우기·내려놓기·발사를 fx `cannon`으로, 착탄을 `explode` `cnnonShell`(맞은 유닛 `hit`)로 알린다.
  - 시험: `test/seasons-act3-stages.test.js` 「规程 盐坨子炮…」.
- **레벨 룬 전수 검사**(2026-11-14): 판에 나오는 전장(활성 + 커스텀 상반기 전장)의 전투 레벨 룬·전역 버프는 모두 시뮬이 적용하거나(`devices.js LEVEL_RUNES_READ` — 읽는 수치, 안 읽는 수치는 이유) 그 판에서 아무것도 안 바꾼다(칸 필터의 칸이 판에 없음, `char` 필터가 별칭뿐) — `content/coverage.js` 룬 줄, `node tools/season-coverage.mjs`, 시험 `test/content/coverage.test.js`. 지금: 규정 m10 대포 룬 넷(키 줄 둘 적용, 별칭 줄 둘 효과 없음), 지난 시즌 m03 갈대 칸 룬 `map_tile_blackb_assign`(판에 갈대 칸 없음). 판에 안 나오는 상반기 m07의 `env_system_new`(`disable_line`)는 안 읽는다. 생성기는 큰 씬과 전투 판(하위 레벨)이 룬·전역 버프·옵션·장치 값에서 다르면 경고한다(`level-fields.mjs levelDrift`, 지금은 m10 룬 하나).
- **칸 표적 선택자 전수 검사**(2026-11-14): 적·장치 프리팹 능력의 선택자가 칸을 고르면(`TileSelector`와 그 하위 클래스, `_filterType`) 바인딩 추출이 `sel`로 싣고(`tools/local-extract/enemy_bindings.py` → `tools/assets/local-enemy-bindings.json`), 시험 `test/content/tile-selectors.test.js`가 목록 `test/content/tile-selector-list.js`의 판정(시뮬도 칸 — 시험 이름과 함께 / 이 모드에서 안 돎 — 이유 / 유닛 표적 — 이유를 단 추정 표시)과 대조한다. 지금 18개: 염괴포 `EnemyCannon00D`·`SelectNormalTarget`(칸), '데몬의 칼날'(`enemy_2048_smgrd`)의 국도(칸)·'사미의 의지'(`enemy_9033_acdeer`)의 冰凌(칸), 가상적: 기계(`enemy_9029_acfnc`)의 【洪流攻势】(유닛 — `bosses.js`의 [추정·CN] 그대로), 염괴포의 나머지 재능 8개(이 모드에서 안 돎), 갈대 칸을 고르는 더블린 불꽃 전사 계열(`enemy_1288_duskls` 등)의 오라·나무를 고르는 '거대하고 못생긴 것'(`enemy_1512_mcmstr`)의 벌목(그 칸·장치가 어느 전장에도 없음).
- **장치 별칭**: 규정은 판마다 번호를 다시 쓰고 한 조각 안에서도 겹친다(m05 `sub_02`의 `trap_013_blower#001` 둘). 그래서 지난 시즌(`#001` 자기 판·`#101` 오른쪽·`#201`/`#301` 보스 판)과 달리 장치 하나를 가리키지 않는다. 규정 효과 중 별칭으로 장치를 켜고 끄는 것(`auto_chess_change_map`)은 없으므로 공식 별칭을 그대로 둔다.
- 어느 모드에 어느 조각이 보이는지(혼자 `sub_01`, 이웃과 `sub_02`)는 CN 클라라 읽지 않았다. 시뮬에는 차이가 없다: 자기 판의 칸·장치·경로가 둘에서 같다. 적 대기 칸이 판 옆에 있는 `sub_01`의 배치는 화면 몫이다(render.md 「규정 전장 공식 씬」).
- 시험: `test/seasons-act3-stages.test.js`(틀·m01 대조·경로·실제 판: 혼자 판이 규정 자기 전장·웨이브·적·보스로 최종 라운드까지; 송풍기·늪 기록 대조, 「规程 加速 tile…」·「规程 草地 tile…」).

## 규정 적·보스 (2026-11-08)

규정(`act3autochess`)의 적은 시즌 전용 `data/seasons/act3autochess/enemies.json`(규정 표의 `enemy_database`·`enemy_handbook_table`)으로 돌고, 키트는 지난 시즌과 같은 것(`content/enemies.js`·`bosses.js`)이 그 기록을 읽는다. 지난 시즌 적·보스 중 규정 표에서 동작에 닿게 바뀐 것은 가상적: 총뿐이다(나머지는 특수 적 종류 소속 `acTypes`, 이 모드에 없는 갈대 오라의 `aura.enemy_talent_disabled`, 무게·전투력).

- **가상적: 총 `enemy_9017_achunt`·`_2` 저지**: 지난 시즌은 늘 저지 불가, 규정은 【최종지벌】(最终之罚) 돌진 중에만 저지 불가이고 평소에는 저지되며, 저지되면 저지한 오퍼레이터를 쏜다(그 밖에는 지금처럼 사거리 안 방어력 최고). 근거: 표 — 지난 시즌은 능력 줄 「无法被阻挡」이 따로 있고, 규정(2.7.91 표)은 그 줄이 없고 【최종지벌】 줄에 「技能持续期间，无法被阻挡」, 무게 8 → 10. CN 클라 프리팹(`battle/enm_pfb_28.ab` 11-01 판) — `BLOCK_FREE`가 `CommonAbilities/Ability0`의 상시 버프에서 빠지고 `Modes/S1/Body/Talents/3`의 패시브 버프 `achunt_s_1[speed]`(`abnormalFlags` [3], 돌진 길이)로 옮겨 갔다. `Modes/Default/Body/Combat`이 새로 있다: 일반 공격과 같은 탄·시전 이펙트·`_alwaysIncludeTarget` 1·최대 1, 선택기 `_abnormalFlag` 46(일반 공격 42 — 이 차이는 안 읽음). 적이 저지됐을 때 쓰는 것이 `Combat`이고(`Character._FetchCombatTarget` = 첫 저지 대상), `Combat`이 없는 적은 저지되지 않는다(`Enemy.CheckBlockableWithoutCheckRange`의 `hasCombat`, 공식 클라에서 확인). 키트는 표의 「无法被阻挡」 줄 유무로 시즌을 가른다(`kitGun alwaysFree`).
- **양변지계(量变之械) `enemy_9028_acfncb`**(가상적 보스 `enemy_9029_acfnc`의 부품): 처음 내보내는 피해 한 번만 ×`FirstAtkDouble.damage_scale`(2). 침묵 중에 그 피해를 내면 배율 없이 사라진다. 근거: CN 프리팹 `Talents/FirstAtkDouble`의 버프 둘과 규정 표 `buff_template_data`의 템플릿 — `acfncb[first-atk-dmg-double]`(침묵 대상, `ON_OUTPUT_DAMAGE`: `DamageScale` → 자기 끝냄), `acfncb[remove-double-buff]`(침묵 대상 아님, `ON_AFTER_OUTPUT_DAMAGE`: 앞 버프와 자기 끝냄). 키트 `bosses.js kitFirstDouble`.
- **가상적: 기계·가상적: 고치의 피격 판정**(2026-11-13): 둘 다(`enemy_9029_acfnc`·`_2`, `enemy_9035_acspider`·`_2`) 가상적: 투구·관과 같은 거대 유닛이다 — 프리팹 뿌리의 BoxCollider2D가 4.95×2.95, 위로 1 치우침(공식 CN 클라 프리팹에서 확인), 그래서 `hitArea`가 5×3칸을 차지한다(`tools/build-data.mjs HIT_AREAS`). 그전에는 한 칸(점)이었다. 자리에 묶이고 저지되지 않는 것은 `SELF_BOUND`가 아니라 각자의 능력(아래)이다. 충격지계(`enemy_9027_acfnca`)도 프리팹 상자가 1×2.95인데, 움직이는 거대 유닛은 아직 다루지 않아 점으로 둔다 [추정·미조사: 움직이는 피격 상자 — 묶음 sim-D 줄]. 시험: `test/seasons-act3-enemies.test.js` 「…巨型单位…」.
- **가상적: 기계(假想敌：械) `enemy_9029_acfnc`(boss_11)·`_2`(boss_14 숨은 핵심)와 충격지계(冲击之械) `enemy_9027_acfnca`**(이름은 모두 공식 한국어 이름 없음, 비공식 풀이). 전장은 웨이브 `act3autochess_h07_08`(보스 (3,10), 가지 `acfnca`가 4행 8열·12열, 양변지계 가지 `left_acfncb`·`right_acfncb`). 키트 `bosses.js kitMachine`·`kitArmor`. 근거는 CN 프리팹(`battle/enm_pfb_36.ab` 11-08 판, 투사체 `battle/prefabs/[uc]projectiles.ab`)과 규정 표 `buff_template_data`의 `acfnc*`·`acfnca*` 템플릿:
  - 보스는 자기 자리에 묶인다(`CommonAbilities/Unmovable`: `UNMOVABLE` 束缚 + `BLOCK_FREE` + `UNBALANCE_IMMUNE`). 일반 공격은 전장 전체(표 사거리 −1)의 지상 오퍼레이터 하나(`HATRED_DES`, `_targetMotion` 1).
  - 내보내는 피해마다(`acfnc_t1`, `ON_AFTER_OUTPUT_DAMAGE`) 대상 둘레 3×3(`x-4`)에서 가장 가까운 지나갈 수 있는 칸에 양변지계 하나. 양변지계는 그 대상의 칸을 먼저 들르고(`acfnc[insert-cp]`, 갈 수 있을 때), 보스 기준 왼쪽이면(`SharedConsts.Direction` LEFT = 3) `left_acfncb`, 아니면 `right_acfncb`의 끝으로 간다.
  - 【홍류 공세】(洪流攻势, `SommonSquad` — boss_11은 SP 25, boss_14는 쿨타임 45): 저지 수가 가장 큰 오퍼레이터(`BLOCK_COUNT_DES` = 42)와 다른 플레이어의 그런 오퍼레이터의 네 옆 칸 중 지나갈 수 있는 칸마다 양변지계(`acfnc[skill]`, `cnt` 4). [추정·CN: 두 번째 선택기의 `_autoChessFilterType` 1은 EN 클라에 없는 필드 — 「다른 플레이어의 것」으로 읽고, 혼자면 하나]
  - 충격지계가 있는 동안(`acfnc[armor]` → 보스의 `acfnc[armor-damage-scale]`) 충격지계 너머(격자 열이 그 충격지계의 바깥쪽)에서 오는 피해 ×(1 − `Armor.damage_scale` 0.5). 충격지계와 같은 열이나 안쪽은 그대로(`CheckAxisRelativeDirection` `EQUAL_ALLOW_ZERO`의 부정). 원소 피해와 출처 없는 피해는 안 깎는다 [추정·CN: 노드에 피해 종류 필드가 없음]. boss_11은 체력 `Armor.hp_ratio` 0.5 이하에서 한 번(`acfnc_t2[summon]` 0.5초마다, `acfnc[finish_t2]`) 부르고 띄우지 않는다. 충격지계는 공격하지 않고, 【위광 충격】 전에는 무적·선택 불가(`Ability0`).
  - boss_14: 나오자마자 충격지계(`acfnc_t2[summon-immediately]`), `WithArmor` 모드에서만 `LaunchArmor`(쿨타임 10)로 띄우고 `Default`로 돌아간다(`acfnc[after-launch]`), SP 45의 【쇠퇴와 부흥】(衰颓与复兴, `SkSummonArmor`)이 옛 것을 없애고 다시 부른다. 일반 공격은 `attack@hit_times` 2번 맞고 다음 대상은 무작위(`RANDOM` = 14, 혼자면 같은 대상), 한 번 튈 때마다 ×0.8, 속도 4(`projectile_enemy_acfnc_2`); 튄 피해도 양변지계를 부른다. 충격지계가 보스에 닿으면 모두 사라진다(`KillArmorAura` → `acfnc[kill-too-close-armor]`).
  - 【위광 충격】(威光冲击): 띄운 충격지계는 이동 속도 ×`MoveSpeed.move_speed` 5(`FINAL_SCALER`)로 자기 가지 경로를 따라 바깥으로 날며, 지나간 오퍼레이터를 센다(`acfnca[pass-cnt]`, 그 오퍼레이터가 사라지면 빠짐). `Falldown.max_valid_stack_cnt` 5번째를 센 칸, 아니면 앞쪽 마지막 오퍼레이터를 지난 칸(`acfnca[no-char-executor]`), 아니면 경로 끝에서 내려와(`FalldownImpl`) 오퍼레이터 하나에 공격력 ×`atk_scale` 물리. 내려온 뒤에는 맞고, 받은 피해 `Init.damage_threshold` 500마다 보스 쪽으로 `Init.move_step` 0.05(초당 `Init.max_offset_per_second` 0.5까지). 먼저 내려온 것이 다른 하나에게 레이저(`projectile_enemy_acfnca`, `_laserWidth` 2.9)를 이어, 그 안의 오퍼레이터는 공격 속도 +`Bound.attack_speed`(−100, `ATTACK_SPEED` `ADDITION`).
  - [추정·CN: 프리팹에 범위가 없음] 날며 오퍼레이터를 세는 줄(레이저 폭과 같게 그 행 ±1), 낙하가 때리는 대상(한 칸 안 가장 가까운 하나), `KillArmorAura`의 거리(한 칸 — 두 칸 옆에서 태어남), 튕김 대상을 고르는 범위(전장 전체). 스킬은 「적 스킬 = 일반 공격 차례」대로 공격 차례에 일반 공격 대신 시전되고 끝나면 공격 쿨타임을 다시 센다(`resetMain`): boss_14는 첫 차례에 【홍류 공세】(쿨타임 45, 처음부터 준비), 10초 차례에 띄우기를 써 첫 탄은 20초, boss_11의 【홍류 공세】는 SP 25가 찬 뒤 다음 차례(아래 「공격·스킬 자료」).
  - 시험: `test/seasons-act3-enemies.test.js` 「假想敌：械…」 셋(규정 전장 m01·웨이브 h07_08 위에서).
- **가상적: 고치(假想敌：茧) `enemy_9035_acspider`(boss_12)·`_2`(boss_15 숨은 핵심)와 정체의 고치(淤困之茧) `enemy_9036_acweb`**(이름은 모두 공식 한국어 이름 없음, 비공식 풀이 — 淤困은 KR 표의 「가상적: 정체」를 따름). 전장은 웨이브 `act3autochess_h07_09`·`h08_05`(보스 (2,10) 자리표시, 둘이 하는 판에도 한 마리 — `boss_battle_multi_player` 가지 없음). 키트 `bosses.js kitSpider`·`kitWeb`. 근거는 CN 프리팹(`battle/enm_pfb_37.ab` 11-08 판, 투사체 `battle/prefabs/[uc]projectiles.ab`)과 규정 표 `buff_template_data`의 `acspider*`·`acspdier[evade]`·`acweb*` 템플릿:
  - 보스는 걷지 않는다(`Talents/Passive` `acspider[passive]`: `UNMOVABLE_PRIVATE` + `BLOCK_FREE` + `UNBALANCE_IMMUNE`). 일반 공격은 전장 전체(표 사거리 −1)에서 필드마다 현재 HP가 가장 높은(`_postFilter` HP_DES 15) 지상 유닛 `Passive.attack@max_target`(3, 숨은 핵심 4)명, 모두 합쳐 `batch_max_target`명에게 한 발씩(`projectile_enemy_acspider`·`_2`, TRACE 속도 10). 선택기가 둘이고 둘째에만 `_autoChessFilterType` 1이 있다 [추정·CN: 기계와 같이 「보스가 선 필드」와 「다른 플레이어의 필드」로 읽음, 혼자면 하나].
  - 숨은 핵심의 일반 공격은 `acspider[poison]`을 건다: `Poison.attack@duration`(5)초 동안 1초마다 `Poison.attack@damage`(50) 진짜 피해(보스가 출처).
  - 위장(`Talents/Evade` `acspider[evade-ticker]`, 받은 피해마다와 1초마다 확인): HP가 최대 HP의 `Evade.hp_ratio`(0.25) 단계(75·50·25 %) 아래로 내려갈 때마다 한 번씩 `Evade.duration`(15)초 동안 물리·마법 피해를 `Evade.prob`(0.5, 숨은 핵심 0.8)로 회피(`acspdier[evade]`의 `Evade` `PHYSICAL_AND_MAGICAL`). 한 확인에 한 단계.
  - 【정체 포식】(淤困捕食, `Skills/Net`, 쿨타임대로, `_ignoreSilence`): 필드마다 무작위(`_postFilter` RANDOM 14) 지상 오퍼레이터(`_professionMask` 639 — 소환물·장치 빼고) `max_target`명, 모두 합쳐 `batch_max_target`명에게 거미줄 탄(`projectile_enemy_acspider_web`, TRACE 10)이 날아가 맞은 오퍼레이터 칸에 정체의 고치를 부른다(`acspider[summon]` `SummonEnemyWithRuntimeRoute`, 가까운 지나갈 칸이 아니라 그 칸).
  - 정체의 고치: 공격하지 않고 움직이지 않으며 도발 1(「更容易受到攻击」). 자기 칸의 오퍼레이터를 묶는다(`acweb[bundling]`: `BLOCK_FREE` + `FORCE_DISARMED` + `SKILL_NOT_ACTIVATABLE` — 저지·공격·스킬 시작 불가, SP는 그대로 참). 그 오퍼레이터가 칸을 떠나면 풀리고(`_removeBuffWhenTargetLeave`), 죽거나 필드를 떠나면 고치가 죽는다(`ON_OWNER_FINISH` → 출처 `InstantKill`). 고치는 `Bundling.duration`(25)초 뒤 죽고(`acweb[existing]`), 1초마다 최대 HP의 `Bundling.hp_ratio`(4 %)를 잃는다(`acweb[bleeding]`, 출처 없음). 스킬 시작 불가는 엔진 깃발 `skillLock`(침묵과 달리 재능은 그대로).
  - 숨은 핵심의 【비참한 비】(悲惨之雨, `Skills/AcidRain`, 하위 능력 `Left`·`Right`를 차례로 — `_selectAbilitySequentially`; `Left`는 보스 필드의 지상 유닛, `Right`는 다른 플레이어 필드의 것, `_allowNoTarget`): `duration`(25)초 동안 그 필드의 모든 유닛(모든 이동 방식, `ignoreTargetFree`)이 공격 속도 `attack_speed`(−50), 0.5초마다 `damage`(75) 진짜 피해(`acspider[sk-poison-area]`). [추정·CN: 비가 덮는 칸은 프리팹에 없음(CN 전용 타일 리스너) — 도감의 「覆盖一片场地」대로 대상의 필드 전체로 읽음. 혼자 판의 `Right` 차례는 비가 내리지 않음]
  - 시험: `test/seasons-act3-enemies.test.js` 「假想敌：茧…」·「淤困之茧…」 넷(둘이 하는 기본 보스 판 위에서).
- **가상적: 지느러미(假想敌：鳍) `enemy_9037_aceel`(boss_13)·`_2`(boss_16 숨은 핵심)**(공식 한국어 이름 없음, 비공식 풀이). 전장은 웨이브 `act3autochess_h07_10`·`h08_06`(보스 판을 순찰, 둘이 하는 판은 `boss_battle_multi_player`로 플레이어마다 한 마리). 키트 `bosses.js kitEel`. 근거는 CN 프리팹(`battle/enm_pfb_37.ab` 11-08 판, 투사체 `battle/prefabs/[uc]projectiles.ab`)과 규정 표 `buff_template_data`의 `aceel*` 템플릿:
  - 근접(저지한 오퍼레이터만 침), 마법 피해에 공격력의 `Passive.attack@ep_damage_ratio`(0.4)만큼 신경 손상이 붙는다.
  - 보호막(`Talents/BlockedListener` `aceel[shield-provider]`, 0.1초마다): 저지되지 않았고(COMBAT 상태 아님) 보호막이 없으면 `ShieldGen` — `aceel[shield]`: 받는 물리·마법 피해 ×(1 − `damage_resistance`)(0.4, 숨은 핵심 0.7). `FilterDamageModifer`는 피해 종류로만 거른다(`_sharedFlag`는 `_filterSharedMask`일 때만 봄 — 공식 클라에서 확인). 저지되는 순간(`ON_OWNER_BLOCKEE_CHANGED` → `CheckBlocked`, 첫 공격보다 먼저) 보호막이 사라지고 `aceel[power-atk]`: 다음 공격(`PowerAtk`, `_castLikeAttack`) 피해 ×`damage_scale`(1.5, 숨은 핵심 1.75), 그 공격 뒤 끝(`ON_AFTER_ATTACK`).
  - 【이온 고리파】(离子环波, `Skills/Discharge`, 쿨타임대로, 침묵으로 막힘 — 도감 SILENCE 줄, 셋 중 이 스킬만 `_ignoreSilence` 없음): `range_radius`(1.5) 안 지상 유닛 모두에게 공격력 ×`atk_scale`(1.25) 마법 + `ep_damage_ratio` 신경 손상. [추정·CN: 범위의 중심이 프리팹에 없음 — 「对范围内所有我方单位」대로 지느러미 자신으로 읽음]
  - 숨은 핵심 `Talents/Charge`: 공격마다 맞은 유닛(`MAIN_TARGET`)에 `aceel[atk-stack]` 하나(최대 `Charge.max_stack_cnt` 5). 탄(`projectile_enemy_aceel`·`_pwratk`)의 피해 ×(1 + `Charge.atk` 0.2 × 그 유닛의 중첩, `aceel[self-stack]` `AtkScaleUp`), 맞은 유닛에서 `chain.max_target`(2) + 중첩 `stack_per_extra`(1)마다 `extra_per_stack`(1)명 더, 마지막에 맞은 유닛에서 `projectile_range`(1.5) 안 가장 가까운 지상 유닛으로 튄다(같은 유닛 다시 없음). 튈 때마다 ×`chain.atk_scale`(0.75)씩 더 곱한다. 강화 공격 배율도 튄 피해에 붙는다. [추정·CN: 중첩은 공격 한 번에 하나(`_onlyApplyOnFirstSpell`), 탄의 배율은 맞기 전 중첩·튀는 수는 맞은 뒤 중첩으로 읽음; 튈 때마다 0.75를 한 번 더 곱함]
  - 숨은 핵심 `Talents/Weather` 뇌우: 10초마다(`aceel[thurder-trigger]` `triggerInterval`, 첫 번은 10초 뒤) 자기 필드에서 자기 칸 + 둘레 8칸의 유닛이 가장 많은 오퍼레이터(Selector0 칸 가중치, 같으면 무작위) 하나에 벼락(`projectile_enemy_aceel_thurder`): 공격력 ×`Weather.atk_scale`(1) 마법 + `Weather.ep_damage_ratio`(0.4) 신경 손상. [추정·CN: Selector1의 `_autoChessFilterType` 3을 「자기 필드」로 읽음 — 플레이어마다 지느러미가 따로 있음; 표의 `Weather.interval` 30은 벼락 투사체의 `_intervalBbKey`(수명 3초라 한 번만 침)로 읽음]
  - 시험: `test/seasons-act3-enemies.test.js` 「假想敌：鳍…」 넷(기본 일반 판 위에서). 신경 손상이 차면 저지한 오퍼레이터가 기절해 저지가 풀린다(중첩 시험은 게이지를 비움).
- **쥐서우(矩兽) `enemy_2124_dyjsfg`**(boss_17, 본편 보스 — 공식 한국어 이름, KR 표). 전장은 웨이브 `act3autochess_h07_11`·`_s`(보스 판을 순찰, 둘이 하는 판은 `boss_battle_multi_player`로 플레이어 절반마다 한 마리, 웨이브 덮어쓰기로 공격력 655·피해 감소 0.2/0.5). 키트 `bosses.js kitJu`. 근거는 공식 클라 프리팹(`battle/enm_pfb_28.ab`, EN·CN 같음 — 엔진 필드 하나만 다름)과 표 `buff_template_data`의 `enemy_dyjsfg_t*` 템플릿, 노드는 EN 클라에서 확인:
  - 프리팹 `_blockVolume` 3(표 blockCnt는 1). `Combat`이 `EmptyAnimatedAbility`라 저지돼도 공격 피해가 없다(표 applyWay NONE도 같음) — 피해는 모두 재능에서 온다.
  - 【명력】(`Talents/Huge`, `enemy_dyjsfg_t` 0.1초마다): 저항 −`one_minus_status_resistance`(0.8, 속성 26). 멈춰 있으면(`Enemy.IsStayStill`: 이동 상태가 아님 — 저지·기절·대기, 순간이동·불균형·등장 중은 아님) `enemy_dyjsfg_low_damage_resistance`(0.35), 아니면 `_high`(0.9) — 템플릿 `damage_resistance`: 받는 물리·마법 피해 ×(1 − 값), 다른 하나는 끝냄.
  - 【상동】(`Talents/Trample`, 나타난 때부터): `Trample.interval`(2.5)초마다 — 버프 간격은 블랙보드 `interval`이 프리팹의 1초를 덮음(`Buff.Reset`, 공식 클라에서 확인), 첫 번은 한 간격 뒤 — `range_radius`(1.6) 안 플레이어 쪽 유닛 모두(`CreateBuffInRange`, 모든 이동 방식)에 공격력 ×`atk_scale`(1) 물리(`DamageViaAttr`, 출처의 공격력). 저지될 때마다(`ToggleablePassiveBuffAbility` + `BlockedToggleChecker` 최소 1: 토글이 켜질 때) `enemy_dyjsfg_t[trigger_aoe]`가 `Skills/CombatAoe`를 강제 시전(`TriggerEnemySkill`, `_interruptCurAbility`): 공격 이벤트에 그 `MeleeAttack`이 자기 대상 — 저지한 오퍼레이터(`_selectTargetSource` FROM_OWNER) — 에 공격력 ×1 물리, 자기에게 `[combat_damage]`를 걸어 0.5초 뒤 스킬 `range_radius`(1.6) 안 유닛 모두에 공격력 ×`combat_atk_scale`(2) 물리(`AOEDamage`, `_useDamageFromBB` 꺼짐 = 출처 공격력, `_excludeTarget`은 가운데의 보스만 뺌). 스킬은 클립 `Attack`(`_timeMode` 1: 클립 그대로 1.5초)을 틀고 그 OnAttack 프레임(0.6초, 모델 스켈레톤 — 시즌 자료 `skillCast.combataoe.hit`)에 공격 이벤트가 온다: 저지 0.6초 뒤 일격, 1.1초 뒤 광역. 그 전에 기절·빙결·수면·불균형·공포·은신이 오면 시전이 끊겨 둘 다 없다(적 공격이 끊기는 상태와 같음). 저지자가 그 전에 사라져도 둘 다 없다(`AbilityStandard.UpdateTargets`: 대상 0이고 `allowNoTarget`이 꺼져 있으면 시전 끝) [추정·엔진: CombatAoe의 `_allowNoTarget`이 꺼져 있는지는 안 읽음].
  - 【비명】(`Talents/Overload`, `HpRatioToggleChecker` `_maxHpRatio` 0.5 `_toggleOnce`): 처음 HP 절반에서 한 번 — 공격력 +`Overload.atk`(0.5, MULTIPLIER), 이동 속도 ×`move_speed`(2, FINAL_SCALER), 저지 무게 +`block_volume`(1). `AddEnemyBlockVolume`은 `Enemy.blockVolumeAddition`만 올리고, 저지자는 저지할 때 센 무게를 들고 있으므로(`BlockedEnemyManager.Add`) 지금 저지자는 그대로 막고 늘어난 무게는 다음 저지부터 센다(공식 클라에서 확인).
  - 【겸애】(`Talents/OutOfControll`, `enemy_dyjsfg_t[kill_all]` `ON_OWNER_FINISH` — 쓰러지거나 퇴각): 그때의 공격력을 담고(`AssignAttributeToBB`), 0.75초 뒤 장치·소환물과 허우서우(`enemy_2123_dyjsww`)를 뺀 모든 적이 쓰러지고(`InstantKill`, 출처 없음), 오퍼레이터·소환물 모두가 그 공격력 ×`OutOfControll.atk_scale`(2) 물리, 출처 없음(`FixedValueDamage` `_noSourceDamage`; `CreateBuffToCertainSideUnits`는 고르지 않으므로 은신도 맞음). 보스 판은 풀이 비는 순간 끝나므로(DESIGN §5.5) 실제 판에서는 전투가 이어질 때만 보인다.
  - 시험: `test/seasons-act3-enemies.test.js` 「矩兽…」 둘(기본 일반 판 위에서).
- **보스 웨이브의 새 적 넷**(모두 규정 표 기록 그대로, 지난 시즌 자료에는 없음). 키트는 `enemies/fly.js`·`enemies/special.js`:
  - **섬핵의 표류자(纤核漂游者) `enemy_1435_dsflys`**(웨이브 `h07_10`, 프리팹 `battle/enm_pfb_17.ab`): 비행, 원거리 물리. 공격 선택기 `_postFilter` HATRED_DES_HIGHLAND_FIRST(52) — 높은 칸 유닛 먼저, 그다음 위협도(「고지대 유닛 우선 공격」). 맞힐 때마다 공격력 ×`0.attack@ep_damage_ratio`(0.15) 신경 손상(재능의 공격 블랙보드가 능력의 `_epDamageRatio` 0.12를 덮음). 불균형 면역(`dsflys_immune`, 이상 깃발 8 UNBALANCE_IMMUNE).
  - **악성 분진 원석충(恶尘源石虫) `enemy_1424_lrboom`**(웨이브 `h07_09`, 프리팹 `battle/enm_pfb_16.ab`): 쓰러지면(`projectile_on_killed` → `projectile_lrboom`, 침묵이면 없음) 그 투사체가 쓰러진 자리에 1초(`_lifeTime`) 머문 뒤 반경 1.3(그 투사체의 `CircleCollider2D`) 안 지상 유닛에 공격력(쓰러질 때 값) ×`Boom.atk_scale`(3.5) 물리 스플래시(위장 무시) — 아래 「새 종류 정예」의 빙원 가드와 같은 읽기(2026-11-14, 공식 클라에서 확인: 이동 없음, `_alwaysReachInTheEnd`·`_onlyCheckHitWhenReachTarget`, `_hitNumType` INFINITY; 이전: 쓰러질 때 바로). 고에너지 원석충(`projectile_bslime` 1초·반경 1.25)·빙폭 원석충과 α(`projectile_snslime` 1초·1.65)·불붙은 양배추 씨앗(`projectile_enemy_ftzlc` 0.4초·1.25)의 사망 폭발도 같다 — `enemies/archetypes.js deathBoom` `delay`, 피해는 스플래시(`_attackType` SPLASH). 시험 `test/seasons-act3-enemies.test.js` 「恶尘源石虫…」·「雪怪小队…」. 「오리지늄 오염 구역 생성」은 발밑의 동적 `REED_TILE`을 바꾸는 것(`enemy_lrboom[triggerTile]`)이고 「활성 오리지늄 폭풍」은 스테이지 장치라, 규정 전장에는 둘 다 없어 일어나지 않는다.
  - **결사의 향유자(搏命享受者) `enemy_10196_ubba_2`**(웨이브 `h07_08`·`h08_04`, 프리팹 `battle/enm_pfb_30.ab`): `Talents/Talent1` 오라(`AuraAbility`, 반경 1.7 — 그 `CircleCollider2D`, 자기 편·모든 이동 방식) 안 적은 — 자신도 — 받는 물리·마법 피해 ×(1 − `Talent1.damage_resistance` 0.25)(`enemy_ubba_damage_resistance`, `disableOverride` — 향유자마다 따로라 둘이면 곱함). 자신이 드는 까닭(2026-11-12 공식 클라에서 확인, 그 전에는 자신을 뺐음): 오라의 `_selfOption`이 DEFAULT이고, 주인을 빼는 것은 EXCLUDE뿐이다(`AuraAbility.DealTargetTouched`; INCLUDE는 붙을 때 주인을 바로 넣음). 오라(`Talent1`)는 자기 강체(키네마틱 `Rigidbody2D`)를 따로 가져 주인의 충돌체도 다른 적처럼 만난다. 경보 모드(`Modes/Warning`: 빨라지고 경보를 울린 유닛을 쫓음)는 본편 감시탑이 거는 `ubtower_warning_mask[target]`이 있어야 시작되는데 규정 전장에는 감시탑이 없어 시작되지 않는다. 수배 카드의 결사의 부양자(搏命养家者) `enemy_10196_ubba`도 같은 프리팹 구조·같은 수치라 같은 키트(아래 「수배 카드가 부르는 본편 적」).
  - **가상적: 총생(假想敌：丛生) `enemy_9040_accrit`**(공식 한국어 이름 없음, 비공식 풀이; 규정 특수 적 종류 CRITIC, 웨이브 `h08_05`; CN 프리팹 `battle/enm_pfb_37.ab`, 규정 표 `accrit[critical-hit]`): 자기 표식(`accrit[critical-mark]`, 출처별)이 없는 유닛에 내는 피해(`ON_OUTPUT_DAMAGE`)는 ×`CriticalHit.damage_scale`(2), 그 유닛에 영구 표식과 `CriticalHit.duration`(5)초 치료 불가(`accrit[heal-free]`, HEAL_FREE). `Skills/Critical`은 표식 없는 저지 대상에게 클립만 바꿈(Attack_B).
  - 쉐라그 설산 거인 「不眠雪山」 `enemy_9024_acsgnt`는 모든 웨이브의 `acsgnt` 가지로 들어오는 아군 유닛 — 쉐라그 6명 맹약의 소환물이라 적 키트가 아니라 「규정 맹약」 쪽(`STATS_ONLY`에 그 이유)이다.
  - 시험: 같은 파일 「纤核漂游者…」·「恶尘源石虫…」·「搏命享受者…」·「假想敌：丛生…」.
- **공격·스킬 자료**(2026-11-10): 지금 시즌에 없는 규정 적 96종의 투사체(`proj`)와 스킬 시전 방식(`skillCast`: 가족·시간 모드·`resetMain`)은 공식 클라 프리팹에서 읽는다 — EN 클라에 있는 것은 EN, 없는 것(가상적 보스·부품 등 18~20종)은 CN(`tools/local-extract/attack_timing.py`·`enemy_projectiles.py --season-new`, 지금 시즌 줄은 그대로). 그래서 새 보스의 스킬도 자기 쿨타임이 아니라 공격 차례에 시전된다. 클립 길이와 OnAttack 프레임(`attackAnim`, `skillCast`의 `dur`·`hit`)은 모델 스켈레톤에서(`data/assets.json`, 2026-11-11): 웹 모델(`spine`)이 있는 78종은 그것, 로컬 클라에만 있는 규정 자신의 17종은 `spineLocal` — 적 모델이 둘 다 있으면 공식 모델인 `spineLocal`이 먼저다(`tools/build-data.mjs enemySpine`; 웹 쪽은 다른 적의 대역 — 지난 시즌에도 있는 작열 원석충·폭염 원석충(`enemy_1305_mhslim`·`_2`)은 웹 대역인 원석충 모델의 클립 0.767초 대신 자기 모델의 1초·타격 0.667초). 공격하는 새 적은 모두 클립이 있다(없는 셋은 applyWay NONE: 충격지계(冲击之械) `enemy_9027_acfnca`·정체의 고치(淤困之茧) `enemy_9036_acweb`·「모의 보물」(“模拟宝藏”, 공식 한국어 이름 없음, 비공식 풀이) `enemy_9038_achest`). 가상적: 기계의 `SommonSquad`가 부르는 `Skill_1`은 모델 애니메이터(`Graphic`)의 `_animations` 표가 `A_Skill_1`로 바꿔(`B` 모드는 `_replaceAnimPairs`로 `B_Skill_1`) 그 클립 3.467초 동안 시전한다(2026-11-14, 「일반 공격 타이밍」 「적 클립의 키 표」; 전에는 `miss`로 시전 길이 0).
- **근거 자료**: 규정 표(fexli 공개 표)의 `battle/buff_template_data.json`에 위수협의 새 템플릿이 들어 있어, 새 적 버프의 노드는 이 표로 확인한다(캐시 `.cache/gamedata-act3autochess/`).
- **새 종류 재생(REBORN, 특수 적 「特训敌人·复苏」(공식 한국어 이름 없음) — 「首次被击倒后会重生」) 중 살카즈 후예 무리**(2026-11-11). 키트 `content/enemies/reborn.js`. 이름은 KR 표(`enemy_handbook_table`), 기생자만 CN 전용이라 비공식 풀이. 근거는 공식 클라 프리팹(본편 적은 `battle/enm_pfb_10.ab`·`_14.ab`, EN·CN 같음; 기생자는 CN `battle/enm_pfb_36.ab`)과 표 `buff_template_data`의 템플릿:
  - **재생은 소환**: 살카즈 후예 전사·기술자·체인 캐스터·원한자(`enemy_1222_dpvt`·`1223_dmech`·`1225_dkmage`·`1226_dklord`와 `_2`)는 `enemy_vampires[bloodsucker_summon]`, 폭격자·처벌자(`1361_dthrow`·`1362_dfat`와 `_2`)는 `enemy_dthrow_summon[dzoms]` — 둘 다 쓰러질 때(`ON_OWNER_KILLED`, 추락 `FALLDOWN`은 아님) 그 자리에서 남은 경로를 따라 재능의 `enemy_key` 하나(`SummonEnemiesFollowMyRoute`, 블랙보드 `delay`가 `_delayTime`을 덮음 — 공식 클라에서 확인: 전사·기술자·체인 캐스터·원한자·폭격자 1초, 처벌자는 `delay`가 없어 바로). 침묵이어도 나온다(두 템플릿 모두 침묵을 안 봄). 전투는 그 소환을 기다린다. 자리(2026-11-12, 공식 클라에서 확인 — `SummonEnemiesFollowMyRoute`·`…WithBuff`, `Scheduler.SpawnSummonedEnemyTrackedInGameMode`): `_useMapPosition`이 꺼져 있으면 쓰러진 자리에서 가장 가까운 통행 칸(`LitePhysicsUtil.FindNearestPassableTile` — `_passableMask` WALK_ONLY는 걸을 수 있는 칸, NONE은 아무 칸, 같은 거리는 행 순서로 먼저 것)의 **중심**, 거기에 소환마다 x·y 따로 균등 흔들림 ±(블랙보드 `offset_bound`, 없으면 노드의 `_randomOffsetBound`)을 더하고(`_ignoreOffset` 꺼짐, x를 먼저 뽑음) 경로가 그 점에 닿을 수 있을 때만 그 점을 쓴다(`Route.CheckReachable`). 살카즈 후예·폭격자·처벌자의 소환과 혈박(血珀) 0.1, 기생자의 「대군의 선물」·거대 바위 거미의 `SummonToken`·사육자 0. [추정·엔진: 소환된 적의 `_delayToBorn`(재생 조물 1초 — `Enemy.States.BornState`가 그 시간 동안 머묾)은 안 옮김 — 웨이브 적까지 모든 적의 등장 규칙이라(`routePreview.js`) 이 묶음에서 바꾸지 않음]
  - **생귀나르의 손길·자비의 손길·생귀나르의 축복·관대의 축복**(`enemy_1220_dzoms`·`_2`·`1221_dzomg`·`_2`, 「재생 조물」(重生造物)): 받는 물리·마법 피해 ×(1 − `dmg_res.damage_resistance` 0.9)(`damage_resistance`). 저지되는 동안(`BlockedToggleChecker` 최소 1, `_buffsToBlockee` `enemy_bloodsucker_block_cnt[control]`) 저지한 쪽 저지 수 +`buff_to_blocker.block_cnt`(1), 재생 조물마다 하나씩 최대 `max_valid_stack_cnt`(6). 모두 `enemy_bloodsucker_mark`를 지닌다(`CommonAbility/mark`) — 아래 두 오라가 이 표식으로 고른다.
  - **살카즈 후예 보급차·개조 보급차**(`1224_dsuply`·`_2`, SILENCE 줄): 전장 전체(`GlobalAuraAbility`, 표식 있는 적만) 재생 조물에 보급차 수 n(종류마다 따로, 최대 `max_valid_stack_cnt` 5)만큼 공격력 ×(1 + `atk` 0.1 × n), 재생 조물이 내는 피해마다 공격력 × `ep_damage_ratio`(0.1) × n 쇠약 손상(`ApplyElementDamage` DARK, `_multiplyWithBuffValidStackCnt`). 침묵된 보급차는 빠진다(`SilenceableTalent`).
  - **살카즈 후예 원한자·분노자**(`1226_dklord`·`_2`): 전장의 재생 조물 하나마다 자신 공격력 +`aura.atk`(0.15·0.25), 최대 `aura.max_valid_stack_cnt`(6). 침묵과 무관(일반 재능, NORMAL 줄).
  - **살카즈 후예 체인 캐스터·리더**(`1225_dkmage`·`_2`): 마법 공격에 공격력 × `epdamage.attack@ep_damage_ratio`(0.3) 쇠약 손상, 모두 `max_target`(4)명까지 튄다 — 마지막에 맞은 유닛에서 `projectile_range`(1.6) 안 가장 가까운 유닛, 한 번 튈 때마다 ×`chain.atk_scale`(0.85). 공식 클라에서 확인(2026-11-12): 투사체 `projectile_enemy_dkmage`는 `ChainLightningHitBehaviour` + `ChainedSelector` — 맞은 자리에서 가장 가까운 유닛을 먼저, 그다음 마지막 대상에서 가장 가까운 아직 안 맞은 유닛을 `max_target`까지 한꺼번에 고르고(`DoFindTargets`), 둘째부터 배율에 `atk_scale`을 곱해 `Projectile.ApplyAtkScaleToDamageNode`(`alsoApplyToElementDamage` 참)로 걸고 친다 — 쇠약 손상도 같은 배율로 준다.
  - **살카즈 후예 폭격자·파멸자**(`1361_dthrow`·`_2`): 탄이 대상의 자리로 가서(`_projectileDestination` 1) `Attack.attack@projectile_delay_time`(4)초 놓였다가 터져 그 자리 `projectile_radius`(1.1) 안 유닛에 쏜 때의 공격력 ×1 물리. 맞은 순간에는 피해가 없다.
  - **살카즈 후예 처벌자·징벌자**(`1362_dfat`·`_2`, SILENCE 줄 `StunAttack`, `spCost` 3): 공격 3번 뒤 다음 공격 대신 저지자와 1칸 원(`Skills/StunAttack/Selector` CircleRange 1 — 범위 선택이라 유닛 충돌체가 원에 닿으면) 안 유닛 모두(`EnemyBlockerOrAdvancedSelector`: 저지자 먼저, 그다음 범위, `_limitTargetNum`이 꺼져 있어 수 제한 없음 — 공식 클라에서 확인)에 공격력 ×1 물리 + `stun`(4)초 기절. 이 공격은 스킬 시전이다(2026-11-12, 공식 프리팹 `Skills/StunAttack`: `MeleeAttack` `_animKey` Skill·`_waitForAttackEvent` 1·`_selectTargetSource` 1 FROM_OWNER): 일반 공격마다 SP 1, 3이 차면 다음 공격 차례에 일반 공격 대신 시전한다(「적 스킬 = 일반 공격 차례」, `skillCast` — 공격·전투 두 가족, `Skill` 클립 1.6초 그대로 서 있음). 대상은 시전을 시작할 때 고르고(그 사이 쓰러지거나 물러난 유닛은 빠짐), 피해와 기절은 클립의 공격 이벤트(0.567초)에 난다. 시전은 fx `enemySkill`(ability `StunAttack`)과 시전 끝까지의 `skillAnimUntil`로, 준비 표시(프리팹 `ReadyEnemySkillEffect` `enemy_dfat_skill_hint`)는 fx `enemySkillReady` — SP가 찰 때 켜고 시전이 끝나거나 끊길 때 끔(공식 클라에서 확인: `OnCastFinish`·`OnDetach`에 지우고, 시작에 지우는 `_stopBeforeCast`는 0) — 로 화면에 알린다(지금까지는 4번째 일반 공격에 얹어 그 공격 클립 안에서 바로 났다). 침묵이면 시전하지 않고 일반 공격만 한다. 침묵 중의 일반 공격도 SP를 채운다(2026-11-12, 공식 클라에서 확인: 공격마다 `Entity.OnOutputAttackOrHeal` → `SpController._RecoverMp`, 막는 것은 `spRecoverStopped` = 이상 상태 `SP_RECOVER_STOPPED`(1)뿐이고 침묵 `SILENCED`(12)는 아님 — 악단 무리의 SP 카운터도 같음) — 그래서 침묵이 풀린 뒤 첫 차례에 시전.
  - **살카즈 후예 기술자·리더**(`1223_dmech`·`_2`): `charge_gunctrl`(伦蒂尼姆城防副炮 충전)은 전장에서 `gunctrl` 꼬리표가 붙은 유닛만 고르는데(`AdvancedSelectorWithTagAndBuffKey`) 이 모드엔 그 장치가 없어 시전하지 않는다.
  - **신생 혈족**(`1360_dfello`): 마법, 피해 ×|`DamageUp.scale_ratio` 0.2 × 대상이 지금 저지한 적 수 + `add_on` 1|(`enemy_dfello_damge_up`), 준 피해 × `vampire.heal_scale`(2.2)만큼 자신 회복(`enemy_dslime_vampire` `HealViaDamage`), 쓰러지면 블러드 앰버 `Summon.cnt`(1)(`enemy_dfello_summon[dseed]`). 원거리 `Attack`은 `enemy_bmbcar1_passive`를 지닌 유닛만 골라 이 모드에선 저지한 쪽만 친다.
  - **살카즈 후예 기생자(萨卡兹子裔寄生者) `enemy_9030_acpara`**(규정 전용, SILENCE 줄): 오라(`AuraAbility`, 반경 `Aura.range_radius` 1.5, 자기 편·모든 이동, 자신 빼고 — `_selfOption` EXCLUDE —, 생귀나르의 손길 `enemy_1220_dzoms`도 빼고 — `SingleIdTargetValidator` `_reverse`, 블랙보드 아님) 안 적이 쓰러지면 바로 그 자리에서 그 적의 남은 경로로 생귀나르의 축복(`Aura.enemy_key`) 하나(`acpara[core]`). 쓰러진 것이 생귀나르의 축복이면 없다(템플릿 `FilterId`가 블랙보드 `enemy_key`로 거름). 침묵이면 없다.
  - 시험: `test/seasons-act3-enemies.test.js` 「萨卡兹子裔战士…」~「萨卡兹子裔寄生者…」 아홉(기제마다 되돌리면 실패).
- **재생(REBORN) 나머지: 변이 짐승·해양 생물·기사단**(2026-11-11). 키트 `content/enemies/reborn.js`(같은 종류 파일). 이름은 KR 표. 근거는 공식 클라 프리팹(`battle/enm_pfb_7.ab`·`_17.ab`·`_6.ab`, EN 클라)과 표 `buff_template_data`의 템플릿:
  - **변이된 샌드비스트·바위 거미·거대 바위 거미와 α**(`enemy_1131_sbeast`·`1132_sarchn`·`1133_harchn`와 `_2`, SILENCE 줄): 쓰러지면(`deathrattle_sum[walk_only]`: `ON_OWNER_KILLED`, 침묵이 아닐 때, 추락 `FALLDOWN`은 아님) `deathrattle.delay`(0.2)초 뒤 그 자리에서 남은 경로로 `deathrattle.enemy_key` `deathrattle.cnt`(2·3·4)마리 — 오리지뉴턴트 생물 `enemy_1137_plasm`(α는 오리지뉴턴트 악성 종양 `1138_tumor`). 날아가는 투사체(`projectile_enemy_sbeast` 등)는 그림뿐. 자리는 위 살카즈 후예 줄대로 그 칸의 중심 ± `deathrattle.offset_bound`(0.2), 마리마다 따로(2026-11-12, 공식 클라에서 확인; 이전: 0.2 간격으로 한 줄).
  - **변이된 거대 바위 거미·α**: 위에 더해 `SummonToken`(SILENCE 줄, `AlwaysTrigger`, 쿨타임 5초·처음 5초) — 공격 차례에 `Skill` 클립을 시전하고 그 클립의 공격 이벤트(`hit` 0.567초)에 자기 자리·경로로 `enemy_key` 하나(`harchn[sum_token]`). 이벤트 전에 끊기면(기절 등) 없다(`_waitForAttackEvent`).
  - **오리지뉴턴트 악성 종양**(`1138_tumor`): 저지되는 동안(`BlockedToggleChecker` 최소 1) 저지한 쪽 공격 속도 ×(1 + `atkSpeedDown.attack_speed` −0.8)(`tumor_t_buff_blocker`, ATTACK_SPEED MULTIPLIER — 엔진 `aspdPct`: (기본 + 더하기) × (1 + Σ)), 여럿이 막혀도 하나(최대 중첩 1). 재능은 `SilenceableTalent`이지만 침묵 면역이고 표의 줄이 NORMAL이라 늘 켜져 있다. 오리지뉴턴트 생물은 능력 없음(`STATS_ONLY` 'plain').
  - **소핵의 퇴적자**(`1434_dsshel`): 쓰러지면(`dsshel_t_1` `SpawnTokenOnTargetTileWithCondition`) 자기 칸에 증식 갑각(`trap_156_dsshell`, 아군 쪽 함정 — 공식 `character_table` 0단계 HP 3000·방어력 320·마법 저항 0·저지 수 20, 우리 자료에 없어 키트 상수)을 세운다 — 근접 배치 칸·저지대·이동 비용 1(장애물 아님)·출발/도착/텔레포트 칸 아님이고, 유닛이 서 있지 않을 때. 엔진의 장치 유닛(`spawnDevice`)이라 적을 저지하고 맞는다. 갑각의 칸은 나무 상자처럼 「장애물 같은 칸」이다(2026-11-12, 공식 클라에서 확인: 갑각 프리팹 `TrapMode`의 `_tileOptions.overrideObstacleLikeMoveCost` — 나무 상자 `trap_001_crate`와 같은 표시; 표 문구 「甲壳可以影响敌人移动」): 적은 이동 비용 1000으로 돌아가고 다른 길이 없을 때만 들어와 저지된다(`crate` 장애물, 부서지면 칸이 돌아옴). 저지 반경은 프리팹 `_blockRadiusSquare` 0.5 — 지상 저지와 같은 0.7071(장치 기본 0.4472가 아님, `spawnDevice` `blockRadiusSq`). 스킬(위에 원거리 오퍼레이터 배치, 부서지면 재배치 −35 %)은 전투 중 배치가 없는 이 모드에서 쓸 데가 없다.
  - **복핵의 해류사자**(`1438_dspred`, SILENCE 줄, 2026-11-12 — 이전: 「갑각 없음」 `STATS_ONLY`): 증식 갑각을 먹는다(프리팹 `Skills/0`·`1`, 공식 클라에서 확인). 스킬 `0`은 두 가족의 적 스킬로 `SelectorTrigger` — 상대편 증식 갑각(`trap_156_dsshell_passive`를 지닌 유닛) 하나가 그 원에 닿으면(`_scaleble` 원 1.5 × 블랙보드 `range_radius` 0.35 = 0.525, 갑각 충돌체 0.25까지 — 저지되기 직전 0.775부터); 쿨타임 1000000초·처음 0초라 한 번. 공격 차례에 시전하면 그 버프(`dspred_tr_1`, 먹은 표식이 없을 때)가 곧바로 그 갑각에 스킬 `1`을 시전한다(`dspred_tr_1[blockee]` `TriggerEnemySkill`, `_interruptCurAbility`). 스킬 `1`: `Skill` 클립(`_timeMode` 1, 2.6초) 동안 제자리, 클립에 공격 이벤트가 없어 효과는 클립 끝(집양자 줄과 같은 `WaitForNextEvent` 상한) — 갑각이 아직 있으면 곧바로 죽이고 먹은 표식(`dspred_tr_1[kill]`), 이어서(`BuffAfterAffecting` `dspred_tr_1[switch_mode_2]`) 모드 `1`(B_ 클립, 일반 근접 공격, 스킬 없음)과 영구 `dspred_tr_1[attribute]` — 최대 HP ×(1 + 0.6)·공격력 ×(1 + 0.4)(MULTIPLIER, HP 비율 유지). 배율은 블랙보드에서 속성 이름으로 찾는다(`Buff._LoadAttributesModifier`: `HGString.Enum2Str` = 열거 이름, 대소문자만 무시하고 같은 키 — `Blackboard._TryGetNumber`; 공식 클라에서 확인): `ATK`는 스킬의 `atk` 0.4를 찾지만 `MAX_HP`는 표가 `maxhp`로 적어 못 찾고 템플릿의 0.6을 쓴다(표의 0.7이 아님). 클립 끝 전에 끊기면(기절 등) 먹지 않고, 스킬 `1`은 한 번뿐(`_maxTriggerTime` 1)이라 다시 하지 않는다. 침묵이면 시전하지 않는다. 화면: fx `enemySkill` ability `0` 다음 곧바로 `1`, 시전 끝까지 `skillAnimUntil`, 먹을 때 `setForm` `1`(fx `phase`, 모드 `1`의 `B_*` 클립 — 2026-11-12), 버프 `fxTag` `buff:dspred_tr_1[attribute]`(이펙트 `enemy_dspred_buff_01`).
  - **원핵의 악생자·이형의 악생자**(`1439_dslntf`·`_2`, 2026-11-12 증식 갑각 몫, 공식 클라에서 확인): 임전 상태(`dslntf_tr_1`: 이동 속도 × `0.move_speed`, 모드 `1`, PlayAudio `Awake`)는 첫 피해에 더해 증식 갑각에 저지될 때도(`ON_OWNER_BLOCKEE_CHANGED`, 저지자가 `trap_156_dsshell[core]`를 지님) 들어간다. 모드 `1`의 재능 `3`(오라, 반경 `3.range_radius` 0.5 — 상대편 모든 종류·직군, 충돌체가 닿으면)이 닿은 증식 갑각마다 `dslntf_s_1[block]`: 자기 최대 HP × `3.hp_ratio`(0.2) 진실 피해(`DamageViaMaxHpRatio`가 블랙보드 `hp_ratio`를 읽음, `_multiplyByKey` 꺼짐)와 이펙트 `enemy_dslntf_buff_02`, 그 갑각은 곧바로 죽는다. 모드 0(잠든 상태)에서는 갑각 옆에 있어도 부수지 않는다. 화면·소리: 임전은 kitHit `dslntf:awake`와 `setForm` `1`(fx `phase`, 모드 `1`의 `Skill_*` 클립)·`ab:combat`의 `fxTag` `buff:dslntf_tr_1[aura_effect]`(2026-11-12), 부숨은 kitHit `dslntf:break`.
  - **온핵의 사육자·이형의 사육자**(`1437_dsfull`·`_2`): 나올 때(`dsfull_tr_1` `ON_BUFF_START`) 무엇을 낳을지 굴려 `dsfull_tr_1[derived][1]`·`[2]`·`[3]`을 자신에게 건다(이펙트 `enemy_dsfull_buff_01`·`_04`·없음 — 버프 `fxTag`로 화면에; 2026-11-12, 이전: 쓰러질 때 굴림), 쓰러지면(그 버프의 `ON_OWNER_KILLED`, 사망 이유를 안 거름) 그 칸의 중심에서 남은 경로로 그 한 마리 — `0.prob1`(0.2)이면 `0.enemy_1`(소핵의 퇴적자), 아니면 `0.prob2`(0.5·0.7)이면 `0.enemy_2`(궤핵의 집양자·이형의 집양자), 아니면 `0.enemy_3`(단핵의 포식자·이형의 포식자) — 겹친 `RandomAction`이라 실제 20 / 40 / 40 %(α 20 / 56 / 24 %). 나온 적은 이동 속도 ×(1 + `0.move_speed` 2) 영구(`dsfull_tr_1[speed_up]`, MOVE_SPEED MULTIPLIER).
  - **궤핵의 집양자·이형의 집양자**(`1436_dsdivi`·`_2`, SILENCE 줄): HP가 처음 `0.hp_ratio`(0.5) 아래로 내려가면(`dsdivi_tr_1[listener]` `ON_APPLIED_MODIFIER`; 침묵이면 아무것도 안 하고 기다림 — 다음 변화에서 다시 봄) 하던 시전을 끊고 스킬 `0`(`TriggerEnemySkill`, 쿨타임 없음 — `NeverTrigger`)을 시전한다: `Skill` 클립(1.833초) 동안 제자리(`BuffDuringCastingFixed` UNMOVABLE_PRIVATE), 그다음 자신의 복제(스킬 `enemy_key` = 자기 키) 하나가 자기 경로로 — HP 비율을 그대로 받고(`CopyHealth` 비율) 분열 표식(`dsdivi_tr_1[split_mark]`)이 있어 다시 갈라지지 않는다. 원본도 감시가 끝나 한 번뿐. 그 클립에는 공격 이벤트가 없어 복제는 클립이 끝날 때 나온다(2026-11-12, 공식 클라에서 확인: `AnimatedActionToTargetAbility` `_waitForAttackEvent` 1 → `EasyToStartAbility.WaitForNextEvent`의 대기 상한이 시전 길이 `m_cachedDuration`). 복제 자리는 위 살카즈 후예 줄대로 칸 중심 ± 스킬의 `offset_bound`(0.3).
  - **블러드보일 정예 기사단원**(`1103_wdkght_2`): 자기 편 전체(`GlobalAuraAbility`, `TargetValidator` `targetSide` 1, 모든 이동)에 거는 표식(`enemy_wdkght_t`)으로, 그 적이 쓰러질 때마다(`ON_OWNER_KILLED`) 자신에게 1중첩 — 공격력 ×(1 + `enhance.atk` 0.1 × n)(MULTIPLIER)·공격 속도 +`enhance.attack_speed` 5 × n(ADDITION), 최대 `enhance.max_stack_cnt`(10). 가득 차면 다음 공격 직전(`enemy_wdkght_t[switch_mode]` `ON_BEFORE_ATTACK`, 상태 기계 재시작 없음) 모드 `Rage`로 — 같은 근접 공격, `Skill` 클립. 중첩을 가득 채운 그 처치 때 `wdkght_t[effect]`(이펙트 `enemy_wdkght_skill_01_start_03`, 영구)도 건다(`enemy_wdkght_t`: `FilterByBuffStackCount` EQUALS `max_stack_cnt` 뒤 `CreateBuff`) — 버프 `fxTag`로 화면에(2026-11-12).
  - **블레이드헬멧 견습 기사단원·'좌완의 기사' 타이터스 토폴라**(`1104_lfkght`·`_3`): `AtkDesWeaken`(SILENCE 줄, 쿨타임 25·10초, 처음도 같음; 공격 차례에 `Skill_1` 클립) — 전장 전체(`GlobalRange`) 오퍼레이터 쪽, 모든 이동 방식에서 공격력이 가장 높은(`_postFilter` ATK_DES 17) 유닛 하나, 그 약화(`lfkght_s[weaken]`)가 이미 있는 유닛은 빼고(`_buffKeyExcluded`) — 클립 이벤트(0.4초)에 공격력 ×(1 + `atk` −0.5)(FINAL_SCALER) `duration`(25)초. 견습 기사단원은 쿨타임 + 시전이 약화보다 길어 다음 시전에 같은 유닛을 다시 고를 수 있다. **재생**(`RebornTalent`, 한 번): `reborn.duration`(5)초 뒤 HP 전부로 일어선다 — 블랙보드 `hp_ratio`가 없으면 1(공식 클라에서 확인: `RebornTalent.AssignData`의 기본값, `Unit.DoReborn`이 최대 HP × 그 비율). 프리팹의 `_hpRechargeRatio` 0.2는 그 비율이 아니다. 재생 모드 `_modeIndex` 1은 모드가 하나뿐이라 바뀌지 않는다.
  - 엔진: 공격 속도 곱(`aspdPct`, `buffs.js ADD_KEYS`·`units.js _recalc`)을 더함 — 지금까지 쓰는 버프가 없어 다른 판은 그대로.
  - 시험: `test/seasons-act3-enemies.test.js` 「变异沙地兽…」~「锋盔骑士团学徒 / “左手”泰特斯·白杨…」 여덟(기제마다 되돌리면 실패).
  - 시험(증식 갑각, 2026-11-12): 같은 파일 「赘生甲壳: an obstacle-like tile…」·「复核洋流使者…」 둘·「元核孽生者…」 둘(기제마다 되돌리면 실패).
- **새 종류 정예(CRITIC, 특수 적 「特训敌人·精锐」(공식 한국어 이름 없음)) 중 빙원 가드 무리·마테오 무리·패스파인더 무리·악단 무리·투석기 무리·영혼의 유해 무리**(2026-11-11·12). 키트 `content/enemies/critic.js`. 종류 자체에 걸린 규칙은 없다(`activity_table` `enemyInfoDict` CRITIC은 도감의 종류별 적 목록일 뿐). 이름은 KR 표. 근거는 공식 클라 프리팹(EN 클라 `battle/enm_pfb_9.ab`·`_10.ab`·`_15.ab`·`_16.ab`, 투사체 `battle/prefabs/[uc]projectiles.ab`)과 표 `buff_template_data`의 템플릿:
  - **빙원 가드·빙원 가디언**(`enemy_1191_krgrg`·`_2`, SILENCE 줄): 쓰러지면(`projectile_on_killed` → `projectile_enemy_krgrg`, 침묵이면 없음) 그 자리에 투사체가 놓이고, 이동이 없는 LIMITED 수명(`_lifeTime` 1.2초, `_alwaysReachInTheEnd`·`_onlyCheckHitWhenReachTarget` — 위 「오퍼레이터 투사체」의 로즈몬티스 S2와 같은 읽기)이 끝날 때 반경 1.65(그 투사체의 `CircleCollider2D`) 안 **양쪽** 지상 유닛(`HitBehaviour` `targetSide` 3 = `SideType` BOTH_ALLY_AND_ENEMY, `targetMotion` 1)에 공격력 ×`boom.atk_scale`(1.3·1.5) 마법 스플래시와 `boom.cold`(5)초 한기(`enemy_krgrg_boom`: 오퍼레이터에게 `e2c_cold`, 적에게 `c2e_cold` — 적의 두 번째 한기는 빙결). 전투는 그 폭발을 기다린다. 같은 편은 `TargetOptions._VerifyAdvanced`가 `isAllyTargetFree`(이상 상태 ALLY_TARGET_FREE)만 거른다 — 은신·무적 적도 든다(무적은 피해가 스스로 막힘; 2026-11-12, 공식 클라에서 확인 — 우리도 그대로). [추정·엔진: 엔진의 선택 불가(재생 중·공중의 리더)를 빼는 것 — 그 상태의 이상 플래그는 안 읽음] 실균형 중에는 `unbalanced_bleed.damage`(80·50)를 `interval`(0.066)초마다 잃는다 — 아크라이트 레인저와 같은 그래프(`enemy_krgrg_bleed` = `enemy_cbjedi_bleed`)라 같은 코드(`archetypes.js unbalancedBleed`). 실균형은 나온 때부터 1초마다 본다(2026-11-14, 공식 클라에서 확인: 특성 버프 `krgrg_t_1[bleed]`·`enemy_cbjedi_bleed`의 `triggerInterval` 1·`waitFirstTriggerInterval` — 이전: 매 틱): 확인 때 실균형이면 출혈 버프(`periodic_damage_without_modify`, 첫 피해는 `interval` 뒤)를 걸고(이미 있으면 그대로), 아니면 끝낸다. 그래서 출혈은 실균형보다 최대 1초 늦게 시작해 최대 1초 더 가고, 두 확인 사이에 끝나는 짧은 실균형(0.8초 밀기 등)은 피를 안 흘린다. 시험 `test/sim/unbalance.test.js` 「弧光锋卫 bleeds…」.
  - **전선 개척자**(`1406_chghmr`, SILENCE 줄): 나올 때와, 저지가 풀릴 때마다(`enemy_chghmr_t` `ON_OWNER_BLOCKEE_CHANGED`, 저지 안 됨) 표식(`enemy_chghmr_damage_up[mark]`)이 없으면 받는다. 표식이 있으면 스킬 `PowerHit`(`_familyMask` 3, 자기 표식을 보는 선택자)로 공격 대상 — 사거리가 없어 저지자, 없으면 시전 안 함 — 을 자기 클립(`Skill` 2.767초, 이벤트 1.9초)으로 치고, 시전 동안 공격력 ×(1 + `atk` 0.8)(`BuffToOwnerDuringAbility`, ATK MULTIPLIER), 이벤트에 표식을 지운다. 그래서 막힐 때마다 첫 공격이 강타다. 재능의 `sheltr_atk_scale`은 엄폐물(`trap_sheltr`) 상대로, 규정 전장에 없다.
  - **속사 경량 석궁병·속사 파워 석궁병**(`1403_gunsho`·`_2`, SILENCE 줄 `CrossAttack`, ATTACK 계열 — 저지 중엔 시작 안 함): 직격 — 자기 칸의 행·열 전체(`CrossTileRange`: 공식 클라에서 확인, `CheckTargetIn`이 같은 행이나 같은 열이면 참 — 거리 제한 없음)에서 중장 석궁 습격자와 같은 오프셋(X −0.5~0.5 / Y −0.5~0.1)으로 고른 가장 가까운 유닛에, 클립 이벤트(1.033초)부터 `_triggerDelta` 0.1초 간격으로 화살 1 + `_additionalTimes` 2 = 3발(블랙보드 `times` 없음). 화살은 `projectile_enemy_gunsho`(FIXED_DIRECTION, 처음 닿는 유닛에서 멈춤)로 물리 공격력 ×1. 화살은 MUZZLE에서 나간다(2026-11-12, 공식 클라에서 확인 — 이전: 몸 중심): 대상 쪽 방향이 고르는 클립(`Skill`·`Skill_Down`·`Skill_Up`, 가장 가까운 네 방향 축)의 1.033초(세 발 내내 같음) `Muzzle` 뼈를 Graphic(0, −0.2, −0.06)·0.27·X −30°로 판에 내린 자리 — 옆 0.603 앞·0.404 위, 아래 0.452·−0.126, 위 0.236·0.745칸(중장 석궁 습격자와 같은 Graphic, `critic.js GUNSHO_MUZZLE`).
  - **마테오의 근위병**(`1409_bdguad_2`): `CrossBomb`(SILENCE 줄, 쿨타임 10·처음 2초): 같은 직격 고르기로 폭탄 `times`(2)발 — 클립(`Skill_1`)의 공격 이벤트마다 하나(`_waitAttackEventForAllAttacks`; 이벤트 1.867·2.033·2.233초 중 앞 둘). 폭탄 `projectile_enemy_bdguad`(FIXED_DIRECTION, `BoomerHitBehaviour`: 처음 닿는 유닛 — 반경 0.3 — 에서 터짐)이 `projectile_range`(1.1) 안 유닛에 물리 공격력 ×`atk_scale`(0.5). 저지되지 않은 동안(`BlockedToggleChecker`) 받는 물리·마법 피해 ×(1 − `DmgResist.damage_resistance` 0.4). 폭발 중심은 폭탄이 멈춘 자리다(2026-11-12, 공식 클라에서 확인: `BoomerHitBehaviour.DoSelectTargetToHit`이 0.3 원에 처음 유닛이 들면 그 자리에서 `Reached`·`Stop`, 폭발은 `HitBehaviour.OnProjectileReached`가 폭탄 자신의 원으로 고름 — 이전: 닿은 유닛 중심; 스플래시라 중점 판정이어서 닿은 유닛 옆 줄의 유닛은 대개 1.1 밖). 폭탄은 `_mountPointGroup` [MUZZLE, SPECIAL_0]의 n번째에서 나간다 — 첫째 `Muzzle_1`, 둘째 `Muzzle_2`(2026-11-12, 공식 클라에서 확인: `MultiRangedAttack.CreateProjectile`이 시전 횟수로 고름; 이전: 몸 중심). 자리는 `Skill_1`·`_Down`·`_Up`의 1.867·2.033초 뼈를 위 석궁병 줄과 같이 내린 것(`critic.js BDGUAD_MUZZLES`). 그 능력은 `_emitToInputPosWhenTargetIsInvalid`가 켜져 있어 둘째 발의 대상이 없으면 입력 자리(처음 대상이 있던 곳)로 쏜다 — 우리도 그 자리로 쏨.
  - **용맹한 척탄병**(`1405_boomer_2`, SILENCE 줄): 저지되지 않고 침묵이 아닐 때 처음 피해를 받으면(`enemy_boomer_skill_trigger` `ON_TAKE_DAMAGE`) 모드 `D2L`(상태 기계 재시작)로 — 거기서 스킬 `Bomb`(`AlwaysTrigger`, 한 번, `_ignoreSilence`)이 `Skill_1` 클립 이벤트(0.567초)에 `projectile_enemy_boomer`를 오른쪽·위·왼쪽·아래 네 방향으로(`NoTargetRangedAttack` `_projectileNum` 4, 270°), 각각 처음 닿는 유닛에서 터져 `projectile_range`(1.1) 안에 물리 공격력 ×`atk_scale`(2). 시전이 끝나면(`enemy_boomer_switch2light`) 모드 `Light` — 이동 속도 +`Light.move_speed`(0.7)·무게 +`Light.mass_level`(−2)(둘 다 ADDITION), 자기 근접 공격. 폭발 중심은 폭탄이 멈춘 자리(마테오의 근위병 줄과 같은 `BoomerHitBehaviour`, 2026-11-12 공식 클라에서 확인).
  - **패스파인더 스나이퍼·패스파인더 진지 파괴자·패스파인더 전달자**(`1213_mtrsnp`·`1216_cansld`·`1219_mtrbty`, 도감 줄은 일반 — 침묵과 무관): 탄약 = SP(`spData` INCREASE_WITH_TIME, 증가 0 — 처음 `initSp` 1·2·1발, 이 모드에서는 다시 안 참; HUD는 탄환으로 `_showSpAsBulletMode`). 프리팹 모드 둘(`Default`·`HeadShot`)과 재능 `ShotBuff`의 버프가 오간다:
    - `enemy_spmode_check`(셋 다, `ON_BEFORE_ATTACK`): SP ≥ 1이고 첫 모드면 `HeadShot`, 아니고 `HeadShot`이면 첫 모드로 — 상태 기계를 다시 시작하지 않으므로 그 공격은 옛 모드로 치고 다음 공격이 곧바로 나간다(위 「적의 모드 전환」). 시뮬은 그 공격이 나갈 때(`attack` 갈고리) 그 공격이 시작될 때의 SP로 같은 전환을 한다. 그래서 **스나이퍼는 첫 공격이 보통, 그다음 `HeadShot` 둘(한 발로 — 둘째는 SP 0으로 시작했지만 이미 `HeadShot` 능력), 그 뒤 보통**이고, 진지 파괴자는 포탄 셋(두 발로)이다.
    - `enemy_melee_and_ranged_spmode_check`(진지 파괴자·전달자, 0.1초마다): 저지되지 않고 공격 상태가 아닐 때(`CheckUnitInAttackState` — 시뮬은 휘두름·시전 중이거나 쿨타임 중 사거리 안 대상이 있을 때를 공격 상태로 봄) SP ≥ 1·첫 모드면 `HeadShot`, SP < 1·`HeadShot`이면 첫 모드. 그래서 탄이 있으면 나오자마자 원거리로 쏘고, 다 쓰고 대상이 없으면 첫 모드로 걷는다.
    - `HeadShot` 공격 능력(`blackboardPrefix` headshot_)은 공격력 ×`shotbuff.attack@headshot_atk_scale`, 공격 이벤트에 SP `headshot_sp`(−1)(`BuffToOwner` `enemy_spmode_sp_reduce` → `ModifySp`). 첫 모드: 스나이퍼는 보통 원거리(`projectile_enemy_mtrsnp`)와 저지자 근접(`Attack_2`), 진지 파괴자·전달자는 `_combat` 근접뿐 — 저지자만 친다.
    - 스나이퍼: `projectile_enemy_mtrsnp_headshot` 물리 ×2. 진지 파괴자: `projectile_enemy_cansld`(PARACURVE 초속 4, 공격 때 대상 자리로)가 닿을 때 3 × 3 상자(그 투사체의 `BoxCollider2D`, `HitBehaviour` `targetMotion` 3 = 지상·공중, 위장 무시) 안 유닛 모두에 물리 ×1, 대상이 죽어도 떨어짐(`_alwaysHitTraceTargetInTheEnd`). 전달자: `projectile_enemy_mtrbty` 마법 ×1.5와 맞은 유닛에 버프 `disarmed_and_cant_use_skill`(공식 클라 버프 표: 버프 키 `disarmed`, 이상 플래그 DISARMED + SILENCED, 길이 `headshot_disarmed_duration` 15초) — 일반 공격도 스킬도 못 씀, 저항으로 줆. 고르기는 `SecondaryFilterAdvancedSelector`(`_buffKey` disarmed, `_withoutThisBuff`): 대상 하나일 때 `OnPostFilter`가 그 버프 없는 후보가 있으면 그것만 남기고, 없으면 그대로(공식 클라에서 확인).
    - 사거리는 표 `rangeRadius`(2·2.5·2.5): 공격 범위의 `CircleRange.InitCollidersIfNot`이 옵션의 `rangeRadius`(≥ 0)로 충돌체 반경을 덮어씀(공식 클라에서 확인; `_scaleble`이면 곱). 진지 파괴자 프리팹의 3.5·전달자의 2.0은 그 앞의 기본값이다.
    - 진지 파괴자·전달자의 `headshot_trapdamage`(고정 마법 피해)는 `TAG_TRAP_WPNSTS`(젤라토 머신 `trap_057_wpnsts`) 장치에만 — 규정 판에 없음.
  - **악단 무리 — 잔당 악단·위치킹 악단 호르니스트·클라리네티스트·드러머**(`1373_ltnhor`·`1375_ltnclr`·`1376_ltndru`와 `_2`): **변주(격앙 변주·침울 변주)는 이 모드에서 꺼져 있다.** 재능 `switchMode`(`PassiveBuffAbility`)가 거는 `enemy_act29side[siwtch_mode_enthu]`(호르니스트·드러머)·`[siwtch_mode_depressed]`(클라리네티스트)와 `[switchmode_buff_creator]`는 시작할 때 환경 시스템 `env_008_act29side_audio_type_switcher`를 찾고(`CheckContainsEnvSystem`), 없으면 그 자리에서 끝난다 — 모드 전환·`buff_enthu`/`buff_depressed` 수치(블랙보드 `switchMode.enemy_act29side[…]`)·변주 모드 능력이 없고, 앞의 것이 장식 `[enthu_fx_deco_only]`(이펙트 `common_radical_01`)·`[depressed_fx_deco_only]`(`common_gloomyl_01`)만 남긴다(파생 아님, 계속). 규정 전장 파일(`levels/activities/act1autochess`의 `level_act3autochess_*` 전부)과 `activity_table` act3autochess의 버프 어디에도 그 시스템이 없다. 시뮬은 그 장식을 버프(`fxTag` `buff:enemy_act29side[…]`)로만 낸다.
    - SP(호르니스트·드러머, `spData` maxSp 2): 일반 공격이 칠 때마다 +1 — 호르니스트는 `enemy_ltnhor[charge_sp]`(`Combat`·`Attack` 능력의 `BuffToOwner`, `ON_SPELL_ON`: `ModifySp` +1; spType INCREASE_WITH_TIME은 증가 0), 드러머는 INCREASE_WHEN_ATTACK. 스킬 시전은 세지 않는다. 스킬(`EnemySkill` `_familyMask` 3, 저지돼도)은 SP = `spCost`(2)에서 시전하며 쓴다 — 공격 둘, 그다음 스킬(KR 도감 「2회 공격 후, 다음 공격 시」).
    - 호르니스트(SILENCE 줄): `attackTwoTarget` — 사거리 1.5 안 대상이 있을 때(`SelectorTrigger`) `Attack` 클립의 `RangedAttack`으로 최대 2명(`BlockedOrAdvancedSelector` `_maxNum` 2: 저지자 먼저, 그다음 공격 순서), 각각 `projectile_enemy_ltnhor`로 클립 이벤트(0.667초)에 물리 공격력.
    - 클라리네티스트(근접 — `Combat` 능력뿐, 저지자만): 재능 `atkboostCore` — 저지되지 않은 동안(`atkboostChecker`의 `BlockedToggleChecker`가 거는 `enemy_ltnclr[blocked_flag]`가 없을 때) 0.5초마다(`enemy_ltnclr[boost_atk]` `triggerInterval`) `enemy_ltnclr[atk_boost_stack]` 하나 — 공격력 FINAL_ADDITION `atkboostCore.atk`(30), `max_stack_count`(30)까지. 공격이 끝날 때(`enemy_ltnclr[revert_atk]`, `ON_CAST_END`) 모두 지운다 — 걸어온 뒤 첫 공격이 그만큼 세다. `atkboostCore.attack@stun_duration`의 기절은 침울 변주 모드의 공격이라 여기서는 없다.
    - 드러머(원거리 마법): 표 `rangeRadius`가 −1이라 사거리는 프리팹의 1.5(`Combat`·`Attack`·`Skills/aoeAttack` 선택자의 `CircleRange` 충돌체 — `CircleRange.InitCollidersIfNot`은 음수면 원래 반경, 위 패스파인더 줄). SILENCE 줄 `aoeAttack`(`AlwaysTrigger`, `_allowNoTarget`): `Attack` 클립, 클립 이벤트에 `enemy_ltndru[AOE]`(수명 0.2초 — 블랙보드에 `duration_aoe` 없음)를 걸고 끝날 때(`ON_BUFF_FINISH`) `AOEDamage` `_radius` 2(블랙보드 `range_radius` 없음) 안 모든 유닛(지상·공중)에 마법 공격력. 그 0.2초 안에 드러머가 필드를 떠나면(쓰러짐·도달) 폭발은 그 순간 그 자리에서 난다(2026-11-12, 공식 클라에서 확인: 떠나는 적의 버프를 끝내는 `Enemy.FinishMe` → `Entity.OnFinish` → `BuffContainer.Clear` → `Buff.OnFinish`가 `ON_BUFF_FINISH`를 돌리고, `Buff._RunActions`는 주인이 살았는지를 칸 채우기에만 씀; 이전: 안 남).
  - **투석기 무리 — 투석기·유탄포**(`enemy_1388_wingnt`·`_2`, 도감 줄은 일반 — 침묵과 무관): 프리팹 모드 둘. `Default`의 능력은 하나(`_attack`·`_combat` 같음) — `A_Attack` 클립의 `RangedAttack`, 사거리는 표 `rangeRadius` 0(applyWay MELEE) 대신 `rawRangeRadius` 2.5(선택자 `CircleRange` × 그 값), 지상·공중, 저지자도 — 로 눈덩이 `projectile_enemy_wingnt`(PARACURVE 초속 4, 대상이 죽어도 떨어짐 `_alwaysHitTraceTargetInTheEnd`)를 던져, 닿을 때 그 투사체의 `BoxCollider2D` 둘(1 × 3·3 × 1, 십자 — 대상 칸과 옆 네 칸) 중 하나에 충돌체가 닿는 유닛 모두(`targetMotion` 3, 위장 무시)에 **마법** 공격력 ×`FirstAttack.attack@first_atk_scale`(1.5). 도감은 「물리」뿐이지만 그 `RangedAttack`의 `_damageType`이 MAGICAL(2)이고, PRTS도 「首次攻击…造成攻击力150%的法术伤害」(도감 누락을 보충한 문구) — 물리는 근접 쪽. `Normal` 모드(`B_*` 클립)는 저지자만 치는 물리 근접(`MeleeAttack`). 전환: 그 `RangedAttack`의 `BuffToOwner`가 `ON_SPELL_END`에 `enemy_wingnt_first_atk[succes_flag]`, `ON_CAST_END`에 `enemy_wingnt_t[check_mode]`를 걸고, 후자가 시작할 때 표식이 있으면 `Normal`로(`SwitchMode`, 상태 기계 재시작 없음) 바꾸고 표식을 지운다. `ON_CAST_END`는 시전이 어떻게 끝나든 난다(`AbilityStandard.OnCastEnd`가 끝난 이유와 상관없이 이벤트 3을 냄 — 공식 클라에서 확인) — 그래서 던진 뒤 기절해도 근접으로 바뀌고, 던지기 전에 끊기면 그대로 `Default`.
  - **제트 캐니스터·붐 캐니스터**(`enemy_1385_winbom`·`_2`): 일반 공격(`Default/Body/Flame`, `ThreePartChannelingAnimation`을 단 `MultiMeleeAttack`)은 `_timeMode` 3 — 공격 시간이 공격 간격이 아니라 재능 블랙보드 `Boom.attack@cooldown`(4초)(PRTS 「普通攻击不依赖攻击间隔」). `ThreePartChannelingAnimation.UpdatePlaybackSpeed`가 `Attack_Begin`(0.6초)·`Attack_End`(0.267초)를 그대로, 사이를 루프로 채우고(공식 클라에서 확인: 능력 시간이 두 클립 합보다 길면 배율 1, 루프 = 나머지), `_waitAttackEventForAllAttacks`라 `Attack_Loop`의 이벤트(0초)마다 한 번 — 사거리 1(지상·공중) 안 대상에게 0.6·1.6·2.6초에 `Boom.attack@times`(3)번 마법 공격력 ×1. 그동안 제자리. 시전이 끝날 때(`ON_CAST_END`, 끊겨도) `BuffToOwner` `enemy_winbom_attack_cd` — `Boom.attack@attack_cd`(3)초 缴械(이상 플래그 DISARMED). 그래서 다음 채널은 앞 채널 시작 7초 뒤(PRTS 「单次普通攻击持续4s…结束后进入3s冷却」); 1초에 끊기면 缴械 1~4초, 능력 쿨타임(시작부터 4초)과 같이 끝나 4초에. 둘째·셋째 타격도 채널을 시작한 대상만 — 그 대상이 쓰러지면 없음(2026-11-12, 공식 클라에서 확인: `Flame`의 `_selectTargetTiming`이 0 AT_BEGINING이라 `AbilityStandard._DoCast`가 타격마다 다시 고르지 않고, `_refreshInputTargetOnCheckSpell`도 꺼져 `MultiMeleeAttack.CheckAnotherSpell`이 입력 대상을 안 바꿈). 쓰러지면(`Talents/Boom` `BslimeTalent_1`의 `projectile_on_killed`, SILENCE 줄 — 침묵이면 없음) 그 자리에 `projectile_enemy_winbom`(이동 없는 LIMITED 수명 `_lifeTime` 1초, 위 빙원 가드와 같은 읽기)이 놓였다가 반경 1.55(`CircleCollider2D`) 안 **오퍼레이터 쪽** 지상 유닛(`HitBehaviour` `targetSide` 2, `targetMotion` 1)에 공격력 ×`Boom.atk_scale`(1) 마법 스플래시(`AdvancedApplyDamage` MAGICAL, SPLASH)와 `Boom.freeze`(10)초 한기(`_projectileBuffs` `e2c_cold`) — PRTS 「…半径1.55范围内的我方单位造成攻击力100%的法术溅射伤害与10s寒冷（可被沉默）」. 전투는 그 폭발을 기다린다. 함께 걸린 `enemy_winbom_t[extinguish]`는 3 × 3 안 비상 난방기(`trap_winfire`)를 끄는데 규정 전장에 그 장치가 없다. 화면 신호: 채널이 시작할 때 fx `enemySkill` { ability `Flame`, n, `dur` 채널 길이, `tgt` 대상 id — 방향별 클립용 }(2026-11-12 — 렌더가 `Attack_Begin` → `Attack_Loop` → `Attack_End`를 그 길이에 맞춤; 바인딩에 `sk` 소리가 없어 소리는 그대로).
  - **영혼의 유해 무리 — 마력이 주입된 영혼의 유해·순수한 그림자 영혼의 유해**(`enemy_1431_lrmzrd`·`_2`, 항목), 호위 **영혼의 소용돌이**(`1428_lrsoul`, N)·**응집된 영혼의 잔해·분산된 영혼의 잔해**(`1429_lrwzrd`·`_2`, E). 프리팹 EN 클라 `battle/enm_pfb_16.ab`, 도감 줄은 모두 일반(침묵과 무관).
    - 소용돌이는 근접 보행자일 뿐이고 표식 `enemy_lrsoul[mark]`(재능 `mark`, 지속 없음)을 지닌다.
    - 영혼 잡기(유해·잔해 둘 다, 재능 `CaptureSoul` — `AuraAbility`, 나타날 때부터): 자기 `CircleCollider2D` 반경 0.25가 표식 있는 자기 편 지상 유닛(`FilterBuffTargetValidator`)의 충돌체(소용돌이 뿌리 `CircleCollider2D` 0.25)에 닿으면 `enemy_lrmzrd[captureSoul]`/`enemy_lrwzrd[captureSoul]`: 영혼(`soulBuff`, STACK)이 이미 3 이상이면 아무것도 안 하고(`FinishBuff` — 소용돌이는 계속 걷는다), 아니면 영혼 +1(소리 신호 `enemy_lrmzrd_capture_soul`/`enemy_lrwzrd_capture_soul`)·소용돌이 즉사(`InstantKill` `_skipReborn`). 들어올 때 한 번이다 — `AuraAbility.OnTick`은 검증기의 `OnTick`과 들고 남 처리만 돌리고 `FilterBuffTargetValidator`에는 `OnTick`이 없다(공식 클라에서 확인). 그래서 영혼 3개 때 거절된 소용돌이는 영혼이 줄어도 나갔다 다시 들어오기 전엔 안 잡힌다.
    - 유해(근접 — `Attack`은 `NeverTrigger`, 저지자만 물리로 침): 스킬 `summonFireball`(`EnemySkill` `_familyMask` 3, 표 쿨타임 15·처음 0)은 영혼이 있고 `enemy_lrmzrd[lock_skill]`이 없을 때(`GroupTrigger` 그리고). `Skill` 클립(1.5초, `_timeMode` 1)의 공격 이벤트에 `RangedAttackWithProjectilesRotatingAround`가 영혼 화염구 `projectile_enemy_lrmzrd` 하나(`projectile_count_each_trigger` 1)를 띄우고, 같은 이벤트(`_runActionOnEvent` 4)에 `enemy_lrmzrd[clear_buff]`가 영혼 하나를 쓰고(`_decCntIfStack`) `[record_projectile_count]`가 화염구 수(`projectile_stack`)를 센다 — `max_projectile_count`(3)에 닿으면 `lock_skill`로 더 안 쓴다. 화염구는 유해가 바라보는 쪽 ±`_radius`(0.65)에서 나서(`_CalculateProjectileGeneratePos`), `RotateAroundMovement`(`_rotateAndMoving`)로 유해 자리에서 `_projectileAroundRadius` 0.9 떨어져 초당 `_aroundSpeed` 50도로 돈다(`Transform.RotateAround`, 앞 축 — 지도의 y가 위인 반시계; 공식 클라에서 확인). 충돌체(반경 0.45)에 처음 닿는 오퍼레이터 쪽 유닛 하나(`HitBehaviour` 지상·공중, 위장 무시, 벽 통과; `_maxHitNum` 1·`_stopAfterMaxHit`)에 **마법** 공격력 ×스킬 `atk_scale`(1·1.2)을 주고 사라지며, 그 유닛에 거는 `_activeBuffs` `enemy_lrmzrd[unlock_skill]`이 시전자의 화염구 수를 하나 빼고 잠금을 푼다. 수명은 맞을 때까지(`_lifeTimeType` 2), 유해가 쓰러지면 같이 사라진다(`_stopWhenSourceInvalid`, `OnDetached`가 끊음).
    - 잔해(원거리 마법, 표 그대로): 스킬 `Laser`(`EnemySkill` `_familyMask` 3, 표 쿨타임 15·처음 0)는 영혼이 있고 자기 칸의 행이나 열에 오퍼레이터 쪽 유닛(지상·공중, 거리 없음 — `GlobalRange` + `_postFilter` CROSS_ONLY_WITH_HATRED_DES: `FilterUtil._Filter_CrossOnlyWithHatredDes`가 후보의 칸 행이나 열이 시전자의 것과 같으면 참, 위협도 높은 순 — 공식 클라에서 확인)이 있을 때. `LrwzrdRangedAttack`(`_timeMode` 2, 8초 채널 `Skill_Begin`/`_Loop`/`_End`): 시전 동안 `BuffDuringCastingFixed` `enemy_lrwzrd[atk_boost]` — 시작할 때 영혼 수로 상한(`atk_ladder` × 영혼)을 정하고, 1초마다(첫 번째도 1초 뒤) 공격력 배율 +`atk_step`(상한까지), 시전이 끝나면 없어짐. `_preDelay` 0.2초 뒤 `enemy_lrwzrd[clear_buff]`가 영혼을 **모두** 쓰고(`_decCntIfStack` 없음) 레이저 하나가 나간다(`DoCastOnTargets`): 대상 쪽 지도 축(|dx| ≥ |dy|면 가로, 같은 자리면 오른쪽)으로 시전자 자리에서 지도 끝(x 0·폭 − 1, y 0·높이 − 1)까지. 레이저(`projectile_enemy_lrwzrd_right`/`_left`/`_up`/`_down`)는 폭 `_laserWidth` 0.65 상자(`LaserHitBehaviour.Init`이 상자 폭을, `_UpdateBoxCollider`가 길이를 시전자에서 끝점까지로 — 공식 클라에서 확인)에 충돌체가 닿는 오퍼레이터 쪽 유닛 모두(지상·공중, 위장 무시, 벽 통과)에 마법 공격력 ×스킬 `atk_scale`(0.4·0.5)을, 같은 유닛은 `_keepAlreadyHitTime` 1초마다 다시. 시전이 끝나거나 끊기면 같이 끝난다(`LrwzrdRangedAttack.OnCastEnd`가 투사체를 끊음; 수명 8초). 그래서 영혼 1개 응집된 잔해는 0.2·1.2…7.2초에 8번, 공격력 ×1 다음 ×1.25.
    - 화면 신호(규칙 불변): 영혼 수는 버프 `ab:soul`(중첩 = 영혼, `fxTag` `buff:enemy_lrmzrd[soulBuff]`/`buff:enemy_lrwzrd[soulBuff]` — 공식 `[fx_ctrl]`이 1~3개 장식 `enemy_v050[fx][stack_n]`), fx `capture`(잡을 때), `orbit`/`orbitEnd`(화염구 시작 각도·반경·각속도, 맞거나 사라질 때), `laser`/`laserEnd`(시작점·끝점·폭). 그림·소리는 fx-B·audio-A.
  - 공통: `content/enemies/helpers.js atCastEvent`(클립 이벤트에 효과, 끊기면 없음)를 재생 무리 파일에서 옮겨 같이 쓴다.
  - 화면 신호(규칙 불변): 전선 개척자의 표식은 버프 `ab:chghmrMark`(`fxTag` `buff:enemy_chghmr_damage_up[mark]` — 공식 표식의 이펙트 `enemy_chghmr_buff`가 표식 동안 붙음), 용맹한 척탄병의 `Light` 모드는 `setForm`(fx `phase`)으로 화면에 알린다.
  - 시험: `test/seasons-act3-enemies.test.js` 「冰原卫法者…」~「无畏掷弹兵…」 여섯, 「寻路者…」 셋, 「残党乐团…」 셋, 「“投石机”…」·「“喷射罐”…」, 「魂灵…」 셋(기제마다 되돌리면 실패).
- **은신·굴절 새 항목과 지난 종류 항목의 새 호위**(2026-11-12). 규정 전용 셋은 CN 프리팹(`enm_pfb_36`·`37`)과 규정 표 템플릿, 본편 다섯은 EN 프리팹으로. 공식 한국어 이름이 없는 셋은 비공식 풀이(「가상적: 경막」(镜膜)에 맞춘 한자 읽기).
  - **가상적: 영역(假想敌：影役) `enemy_9034_acblk`**(은신 항목, `enemies/invisible.js`): 은신(보통의 은신 — 저지되면 풀리고 3초 뒤 다시). 재능 `Aura`(도감 일반 줄 — 침묵과 무관, `AuraAbility`): 반경 `Aura.range_radius` 1.8 + 오퍼레이터 충돌체 0.25 안의 오퍼레이터(다른 적 오라와 같은 고르기 — 은신 오퍼레이터 빼고)에게 `acblk[aura-blockVolume]` — 저지 수(`BLOCK_CNT`) `Aura.block_cnt` −1. 키 하나·`maxStackCnt` 1이라 영역 몇이 닿아도 −1(「不可叠加」), 모든 오라를 벗어나거나 마지막 영역이 사라지면 돌아온다(`_removeBuffWhenTargetLeave`·`_removeBuffWhenAbilityDetached`). 저지 수가 줄어 넘친 적은 엔진의 「저지 수가 줄면」대로 놓인다. 일반 공격은 표대로(원거리 마법, 탄 `projectile_enemy_acblk`).
  - **가상적: 경안(假想敌：镜眼) `enemy_9039_acrefm`**(굴절 항목, `enemies/reflection.js`): 굴절(침묵 전까지 마법 저항 +`refracting.magic_resistance` 70). 굴절이 있는 동안 받는 마법 피해마다(`acrefm[refracting]` `ON_APPLIED_MODIFIER`: 피해이고 침묵 아님, `FilterDamageModifer` MAGICAL·출처 있음 — `_sharedFlag`·`_source`는 거르는 스위치가 꺼져 있어 안 봄) 피해의 출처에 `acrefm[atk-spd-down]`: 공격 속도 `refracting.attack_speed` −50, `refracting.duration` 3초, EXTEND(다시 맞으면 3초를 새로 채움). 편을 안 가린다 — 적이 준 마법 피해도 같다.
  - **가상적: 경파(假想敌：镜波) `enemy_9031_acrefd`**(경안의 호위 N, `enemies/reflection.js`): 굴절. 굴절이 있을 때 쓰러지면(`acrefd[refracting]` `ON_OWNER_KILLED`, 침묵 아님) `RandomBuff`를 바로: 자기 편·지상과 공중·적만·자기 빼고·반경 `refracting.range_radius` 1.2에서 마법 저항이 가장 낮은 적 하나(표 「周围法抗最低的敌人」; 선택자 `_postFilter` 79는 EN 클라에 없는 CN 전용 정렬 [추정·CN: 동률은 가까운 쪽]) — 쓰러진 자리에서 `projectile_enemy_acrefd`(PARACURVE 초속 4)를 던져, 맞으면 `acrefd[magic-resistance]` 마법 저항 +`refracting.acrefd[magic-resistance].magic_resistance` 10(INFINITY, `maxStackCnt` 1 — 다른 경파가 또 줘도 그대로). 닿을 적이 없거나 날아가는 동안 대상이 사라지면 없다. 경안의 호위 E 심해 방진 지휘관(`1169_duphlx_2`)은 지난 시즌 키트 그대로.
  - **눈의 악마 소대 `enemy_1064_snsbr`**(빙원 가드·가디언 항목의 호위 N, `enemies/special.js`): 동결된 대상을 치는 공격 ×`atkup.atk_scale` 1.5(템플릿 `e2c_frozen_atkscale` — 눈의 악마 쇄빙자 리더와 같은 키트). **빙폭 원석충 α `enemy_1067_snslime_2`**(같은 항목의 호위 E): 빙폭 원석충과 같은 `Boom`(쓰러지면 1초 뒤 반경 1.65 — `projectile_snslime`의 원, 공격 범위 1.9가 아님 — 물리 공격력 ×2 + 한기 10초, 침묵이면 없음; 이전: 쓰러질 때 바로 반경 1.9).
  - **살카즈 본가드 리더 `enemy_1363_spnshd_2`**(살카즈 후예 기생자 항목의 호위 E, `enemies/reborn.js`): 도발 2(표). 피해를 받을 때마다(`enemy_spnshd_atk_speed` `ON_TAKE_DAMAGE`, 출처가 다른 편) 출처에 공격 속도 `Summon.attack_speed` −40, `Summon.duration` 5초 — UNIQUE라 지니고 있는 동안은 새로 걸리지도 갱신되지도 않는다. 쓰러지면(추락 아님) 블러드 앰버 `Summon.cnt` 2(신생 혈족의 `enemy_dfello_summon[dseed]`). 반마법 변위 폭탄(`enemy_bmbcar1_passive`)을 멈추는 오라는 그 장치가 이 모드에 없어 아무 일도 안 한다.
  - **와일드 트리케라비스트 `enemy_1309_mhboar_2`**(가상적: 총생 항목의 호위 N, `enemies/critic.js`): 프리팹 `_blockVolume` 2(표 blockCnt는 1) — 저지 수가 2 남은 오퍼레이터만 막는다. 【돌진】(`Rush`, 리스너 다섯이 0.1초마다): 저지되지 않고 기절·속박(UNMOVABLE)·동결·부유가 아니며 돌진 중이 아니면 돌진을 시작 — `mhboar_t[trigger]`(INFINITY, 블랙보드 `trig_cnt` 35·`interval` 0.333이 BuffData를 덮어씀: `Buff.Reset`, 공식 클라에서 확인)와 `predelay` 3초 대기. 대기가 끝난 뒤의 발동마다 이동 속도 MULTIPLIER +0.333 한 층(층은 더해짐: ×(1 + 0.333 n), 앞의 9번은 대기 안이라 최대 26층). 저지돼도 안 끝나고, 기절·속박·동결·부유면 층과 함께 끝난다. `FirstAttack`: 돌진 중 공격이 맞으면 대상에 이동 속도 × 600 물리를 더하고 돌진을 끝낸다(`enemy_mhboar_t_atk` DamageViaAttr; PRTS 「成功造成该额外伤害后停止冲撞」). `Crash`(오라 반경 0.5 + 오퍼레이터 충돌체, 낮은 칸의 유닛 — 지상·공중): 스스로 걷는 동안(`IfEnemyIsMovingBySelf`) 들어온 유닛에 이동 속도 × 800 물리, 나갔다 다시 들어오기 전엔 한 번(`Crash.stun` 0이라 기절 없음). 누가 닿는지는 영역 선택(`areaAllies`) 공식 클라에서 확인(2026-11-12): `TargetRootTileValidator.Validate` = 서 있는 칸이 있고 기본 `TargetValidator.Validate`(진영 2·모든 이동·`targetCategory` 1, 고급 옵션은 켜졌지만 이상 상태 거르기·직업·용도 칸이 모두 기본값) 뒤 칸 옵션 `TileSelector.Options.Verify` — `checkHeightType` + `heightType` 0 LOWLAND만 정해져 있어(`tileTypesMask` 1은 `checkTileTypes`가 꺼져 안 씀) 낮은 칸이면 지상·공중 모두..
  - **용맹한 팔라둘리스 `enemy_10163_mnctur_2`**(가상적: 총생 항목의 호위 E, `enemies/critic.js`): 【돌격】(`Skills/rush`, ATTACK 계열 — 저지되지 않았을 때 공격 차례, 표 쿨타임 10·처음 5): 걷는 방향의 같은 행(좌우로 걸을 때)·열(위아래)의 앞쪽에 지상 오퍼레이터가 있으면(`CrossTileRangeWithDist` `_checkDirection`, 거리 없음, 위협도 높은 순) 하나를 표시하고 `Skill_Begin`(1초) — 시전이 끝나면 `Run` 모드로 그 칸 중앙까지 걷는다(`EnemyForceTracePosition`, 엔진의 trace — 자기 이동 속도 [추정·화면: 돌진 속도가 프리팹에도 PRTS에도 없음]; 그 칸에 설 수 없으면(높은 칸) 같은 줄에서 그 앞의 마지막 걸을 수 있는 칸 [추정·엔진]). `Run` 동안(공격 없음) `CollideChar` 오라(반경 0.45 + 오퍼레이터 충돌체, 지상)에 처음 닿은 유닛에 공격력 × `CollideChar.atk_scale_collide` 2 물리 한 번 → 추적을 멈추고 `rushEndNormal`(`Skill_End` 0.333초) 뒤 `Default`로. 아무도 못 만나고 그 자리에 닿아도 `rushEndNormal`. 걷다가 저지되면 그 저지자를 만난 것으로 친다 [추정·엔진: 우리 저지 접촉(0.707)이 오라 거리(0.70)보다 조금 멀어서 — 클라에선 오라가 먼저]. 시전이 끊기면(기절 등) 돌지 않는다. 입희(入戏, 무대 장치 `trap_pirene`의 버프 `trap_pirene_func[enemy][real]`)는 이 모드에 없어 `rushEndAdvance`(벽 충돌·진짜 피해·기절 15초)는 오지 않는다.
  - 화면 신호(규칙 불변): 버프 `fxTag` — `buff:acrefm[atk-spd-down]`·`buff:acrefd[magic-resistance]`·`buff:acblk[aura-blockVolume]`·`buff:enemy_spnshd_atkspeed[d]`·`buff:mhboar_t[core]`(경안·본가드 리더의 공격 속도 감소는 적용자 `source` — 그 적 — 를 실음); 경파의 탄은 `enemyShot`, 팔라둘리스는 `enemySkill`(`rush`·`rushEndNormal`)과 `setForm` `Run`; 트리케라비스트 충돌과 팔라둘리스 충돌은 그 피해 사건의 효과 순간(`damage.js hitFx` `buff:mhboar_crash`·`buff:enemy_mnctur_collide_char`). 그림 → fx.md 「규정 특수 적 항목·호위」.
  - 시험: `test/seasons-act3-enemies.test.js` 「假想敌：镜眼…」~「神勇的帕拉杜利斯…」 일곱(기제마다 되돌리면 실패).
- **수배 카드가 부르는 본편 적**(2026-11-12). 적 효과 「수배·…」(悬赏, `ENEMY_GAIN` `add_enemy_kill_gain_coin`: 「다음 N번 전투에 X 1마리, 쓰러뜨린 사람이 자금 N」 — 넣는 길은 `match/waves.js bountySpawns`)만 부르는 본편 적 아홉의 키트. 일곱은 새 파일 `content/enemies/bounty.js`, 결사의 부양자와 바운티 헌터 '기사'는 같은 무리 곁(`special.js`). 본편 적이라 EN 프리팹(`enm_pfb_0`·`2`·`16`·`27`·`29`·`30`), EN 클라에 없는 둘(聆风猎手·炫目刀技厨师)은 CN 프리팹(`enm_pfb_33`·`34`), 템플릿은 규정 표. 이름은 KR 표(`data/i18n/ko.json`), 둘은 공식 한국어 이름 없음.
  - **스카이브레이크 탄산음료(开天汽水瓶) `enemy_10146_nscola`**(비행): `enemy_nscola[passive]` — 0.1초마다 `Passive.fixed_value_damage` 120 × 0.1의 출처 없는 진실 피해(`NoSourceDamage`, `_damageWithoutModify`, SP 없음) = 초당 120 생명 유실. `enemy_nscola[speed]` — `interval` 0.5초마다: 속박(UNMOVABLE)·저지·기절(STUNNED)이면 횟수 0, 아니면 `max_time` 25까지 +1; 저지되지 않았으면 이동 속도 ×(1 + `move_speed` 0.3 × 횟수)(MULTIPLIER 하나를 고쳐 씀). 비행이라 저지는 없다 — 기절·속박만 처음부터. 공격 능력은 저지됐을 때의 근접(Combat) 하나뿐이라 공격하지 않는다.
  - **스카이베일 토스트기(遮天面包机) `enemy_10147_nsbomb`**(비행): `Passive.interval` 2.5초마다(처음도 2.5초 뒤), 저지되지 않았으면(`enemy_nsbomb[passive]` → `TriggerAbility` Bomb, `_castDirectly`) 자기 아래 바닥(`_projectileDestination` INPUT_VEC3_WITH_TILE_HEIGHT, `SelfSelector`)에 폭탄 — 0.5초 뒤(`_onlyReachedInTime`) 그 자리 반경 `Passive.range_radius` 1 안의 지상 오퍼레이터에 공격력 × `Passive.atk_scale` 2 물리(위장 무시). 대상이 없어도 떨어뜨린다. 일반 공격 없음(Combat만). 기절(빙결·실균형 등) 중에도 떨어뜨린다(2026-11-12, 공식 클라에서 확인: 노드의 `_checkCanUseAblityFlag`가 꺼져 `canUseAtkOrCbt`를 묻지 않고, `AbilityStandard.CastDirectly`·`_DoCast`에 기절 검사가 없으며 `Entity.OnTick`은 이상 상태와 상관없이 버프·능력을 돌림 — 적 스킬의 기절 검사 `EnemySkill.CheckAvailable`은 이 길에 없음; 이전: 기절 중엔 없음).
  - **炫目刀技厨师(공식 한국어 이름 없음, 「현란한 칼솜씨 요리사」) `enemy_10229_agactr_2`**: `Talents/AuraAttributeUp` 오라(반경 `range_radius` 2.5, 자기 편·지상) 안 적 — 자신도(`_selfOption` DEFAULT, 위 결사의 향유자) — 공격 속도 +`attack_speed` 50, 마법 저항 +`magic_resistance` 25(ADDITION, `def` 0). 요리사마다 따로(`disableOverride`).
  - **자동 배식기 베타 버전(内测版自助出餐终端) `enemy_10077_mpbarr`**: `Skills/Spawn`(Skill 클립, `AlwaysTrigger`, 쿨타임 5·처음 3, SILENCE 줄) — 클립 이벤트에 `enemy_key` 방황하는 수리 보조(`enemy_10073_mpcar`) 하나를 자기 자리·남은 경로에(`SummonEnemiesFollowMyRoute`, 주인이 죽으면 안 나옴). `Attack`은 발동하지 않는 빈 능력이라 저지되지 않으면 걷고 소환만, 저지되면 저지자를 친다. 소환물의 `enemy_mpbarr_summon`(`IgnoreAllButMoveCp`)은 규정 경로에 건너뛸 것이 없다.
  - **포트브레이커(破城者) `enemy_10123_uareap`**: `_blockVolume` 3 — 저지 수 3이 남은 오퍼레이터만 막는다(재능 `BlockMcreep`의 광부 유격대는 이 모드에 없음). 일반 공격은 단일 미사일(표대로, 범위 없음). `Skills/SkyProjectile`(쿨타임 10·처음 5, 사거리 안 지상 오퍼레이터가 있을 때): `uareap_s[assign_addition_cnt]`(블랙보드 `times` 3 — 지휘관의 `enemy_uacomd_extra_power`가 있으면 6, 규정에선 주는 적이 없음) 뒤 `F_Skill` 클립의 `MultiRangedAttack` — 첫 발은 클립 이벤트, 다음은 `_triggerDelta` 0.2초 간격, 발마다 이번 시전에서 아직 안 맞힌 사거리 안 지상 오퍼레이터 하나(`AdvancedSelectorWithExCludeWhenSucceeded`: 맞힌 대상을 후보에서 빼고 시전 시작 때 비움, 공식 클라에서 확인). 미사일은 0.6초 뒤 대상 자리에(`AttachToTarget` `_delayToStart`) 반경 1.1 안 지상 오퍼레이터 공격력 × `atk_scale` 0.7 물리(위장 무시). 사거리 안 오퍼레이터가 셋보다 적으면 남은 발은 아무것도 쏘지 않고 시전은 그대로 이어진다(2026-11-12, 공식 클라에서 확인: `_allowNoTarget`이라 `AbilityStandard.UpdateTargets`가 대상 없이도 참 → 그 발의 시전은 돌고 세어지며, `RangedAttack.DoCastOnTargets`는 `_emitToInputPosWhenTargetIsInvalid`·`_emitToInputRootTileWhenTargetIsInvalid`가 켜져야 입력 자리로 쏘는데 둘 다 꺼짐). 화면 신호: 시전 동안 `skillAnimUntil`은 시퀀스 끝(버프 2틱 + `F_Skill` 2.233초 — `F_Skill` 클립 하나 안에서 셋을 쏨)까지(2026-11-12; 이전: 0.5초). 렌더는 이 값이 아니라 fx `enemySkill`로 `F_Skill`을 한 번 틀고(`render/units.js` `ESKILL_CLIPS`), 그동안 미사일마다의 'atk' `uareapMissile`은 일반 공격 클립을 다시 틀지 않는다(rules/fx.md).
  - **聆风猎手(공식 한국어 이름 없음, 「바람을 듣는 사냥꾼」) `enemy_2135_shkrbt`**: `CommonAbilities/BlinkCheck`(`enemy_shkrbt_blink_check`, `ON_TAKE_DAMAGE`) — 저지되지 않고 대기 중이 아닐 때 오퍼레이터에게 피해를 받으면 그 공격자에게 `Skills/Blink`(`TriggerEnemySkill`, 하던 능력을 끊음): `enemy_shkrbt_blink`가 자기에게 `cooldown` 30초 대기를 걸고 공격자 칸 — 설 수 없는 칸(높은 칸)이면 가장 가까운 설 수 있는 칸, 출구 빼고(`AssignNearestReachableTileToBB` `_checkOnSameTile`·`tile_end`) — 으로 순간 이동(`BlinkNode`). `_resetMainAbilityCdWhenCastEnd`(첫 대기 없음)라 공격이 바로 준비된다. 공격은 사거리 1.1 안 지상 오퍼레이터, 저지와 무관(표대로). 기절한 사냥꾼은 뛰지 않는다(2026-11-12, 공식 클라에서 확인: `Enemy.TriggerEnemySkill`은 공격·전투 상태가 아니면 지금 상태의 `CheckSwitchOut`이 공격 상태(2)로 가게 할 때만 시전 — 기절 중의 `StunState`는 상태 5·8·9·10·14만 허락). [추정·CN: 가까운 칸이 여럿일 때의 순서와 경로가 닿는지를 묻는지 — `AssignNearestReachableTileToBB`는 EN 클라에 없는 노드이고 CN 코드는 못 읽음]
  - **폭주 식인꽃(暴走食人花) `enemy_10003_trwlpl_2`**: 공격력 0. `Attack`(공격·전투 같은 `MeleeAttack`, `_timeMode` 1 — `Attack_Begin` 클립 1.5초가 시간이자 쿨타임)은 저지와 무관하게 다음 중 처음 것: 반경 1 안 오퍼레이터(모든 이동 방식), 음식 장치(TRFOOD), `enemy_trtrsl_t`를 지닌 적 — 뒤의 둘은 이 모드에 없다. 무는 동안 서 있고 실균형 면역, 기절·부유·동결·수면 면역(`enemy_trwlpl_eat`). 클립 이벤트(0.8초, `enemy_trwlpl_on_eat`)에 아직 전장에 있는 오퍼레이터는 삼켜진다: `enemy_common[devour]` → `devour_holder` → `InstantKill`(본편은 배치 카드를 묶어 두지만 규정 전투엔 재배치가 없어 그대로 퇴장). 삼켰으면(`enemy_trwlpl_eat_success`) `Eat` 모드로 바꾸고 `Skills/Eat` — `duration` 20초 제자리 소화(`Attack_Idle` 뒤 `Attack_End`), 같은 면역 + 공포 면역(`enemy_trwlpl_s`), 공격 없음; 끝나면 `Default`. 소화 중 쓰러지면 `Attack_Die`, 먹은 음식의 토큰을 돌려주는데(`GainToken`) 이 모드엔 쓸모가 없다. 재능 `InitEat`(나오면서 40초 소화, 下脚料 2개)은 스테이지가 모드 블랙보드를 2로 줄 때만 시작한다(`enemy_trwlpl_eat` `ON_BUFF_FINISH`) — 여기서는 없어 시작하지 않는다.
  - **결사의 부양자(搏命养家者) `enemy_10196_ubba`**(수배 카드와 보스 웨이브 `h07_08`·`h08_04`): 결사의 향유자와 같은 키트(위). **바운티 헌터 '기사'(赏金猎人“骑士”) `enemy_1413_mmstck`**: 살카즈 랜서와 같은 돌진(`kitRush`) — 템플릿 `enemy_mmstck_t_listener[a]`·`[b]`·`enemy_mmstck_t[trigger]`·`enemy_mmstck_t_atk`이 같은 노드이고(리스너 [a]가 기절·속박을 `CheckAbnormalFlags`로 함께 봄), 다른 것은 추가 피해가 마법(`FirstAttack.atk_scale` 550, `_damageType` MAGICAL)이라는 것뿐. 밧줄 장치에 답하는 `RopeTriggerAbility`는 그 장치가 규정에 없어 아무 일도 안 한다.
  - 우리 편 단위 셋(라이타니엔 소환물 「한 마디」 `enemy_9025_aclts`·「한 악부」 `enemy_9026_acltm`, 액티브 전략 宝藏探机의 「모의 보물」 `enemy_9038_achest`)은 적 효과의 `enemy_exclude`에 이름만 있어 적 목록에 잡혔던 것 — 이미 맹약·전략 쪽에 있으니 `STATS_ONLY`에 까닭과 함께.
  - 화면 신호(규칙 불변): 토스트기 `telegraph`·`explode` kind `nsbomb`, 포트브레이커 `atk` `uareapMissile`·`explode` kind `uareap`, 사냥꾼 `teleport` kind `shkrbt`, 식인꽃 `swing`·`atk` `devour`·`enemySkill` `Eat`·`setForm` `eat`(모드 `Eat`). 그림·소리는 fx-B·audio-A.
  - 시험: `test/seasons-act3-enemies.test.js` 「开天汽水瓶…」~「赏金猎人“骑士”…」 아홉(기제마다 되돌리면 실패). 이것으로 규정 판에 나올 수 있는 적은 모두 키트가 있거나 까닭 있는 `STATS_ONLY`다 — 시험 「every enemy a 规程 match can spawn…」의 남은 목록은 모두 비었다.
- **라운드 적 효과(`ENEMY` 40개)**(2026-11-12). 규정 표의 같은 ID 여섯은 수치가 바뀌었다 — 공략 전술(攻坚装备, `aceffect_enemy_3`) 공격력 ×1.11·최대 HP ×1.2, 보급라인 II(`2_2`) ×1.3, 강행군(急行军, `1`) 이동 속도 +0.3. `tools/build-data.mjs enemySteps`가 이 값을 라운드 배율(`config.modes[m].enemyScale`)의 한 단계로 쓴다. 새 ID 34개(공략 전술 XIII~LVII `aceffect_enemy_6`~`36`, 보급라인 VI~VIII `2_3`~`2_5` — 공격 속도 +5·+10(`enemy_attribute_add`)을 더한 것, 공격력·HP를 따로 거는 것, −25 %까지 내리는 것)는 어느 모드·라운드에 붙는지가 클라 표에 없다(`modeDataDict`에는 `eventIds`·`difficultyDesc`(「模拟强度 +8」 등)뿐, PRTS 「卫戍协议·规程」에도 라운드 표 없음 — 2026-11-12 확인). 그래서 규정 판의 라운드 배율은 지난 시즌의 라운드별 단계 수(PRTS 맹약 하반기 표, `research 01 A3`)를 난이도(`modeDifficulty`)로 골라 새 단계 값으로 세운다 — 규정 등급 1~4는 1인 标准, 5~8은 险境, 9~14는 绝境, 15~20은 终极 표, 다인 넷은 다인 표. [추정·서버: 라운드마다 거는 적 효과는 서버가 정함 — 규정 판의 적 효과 목록(라운드 정보의 적 강화 칸)이 찍힌 공식 화면이 있으면 바꿈] 새 ID의 공격 속도 가산은 이 길에 없다.
  - **1인 표 잠정 조정**(2026-11-14, 관리자 결정: 잠정): 공식 CN 판 하나(등급 13, 绝境)에서 처음 맞는 적이 알려진 한 방을 맞았을 때 체력 막대로 잰 최대 체력 배율 — 1라운드 ≈ 0.79, 7라운드 ≈ 1.20, 12라운드 ≈ 1.39~1.52, 13라운드 ≈ 1.21. 지난 시즌 绝境 표(7라운드 0.96)보다 중반 오름이 두 라운드 이르다. `tools/build-data.mjs SEASON_ENEMY_MULTIPLIERS`·`pulled`: 1인 표마다 5~8라운드가 두 라운드 뒤의 공략 전술 겹을 쓰고 그 뒤로는 줄지 않는다 — 绝境 `[0,0,0,0,1,1,2,2,2,2,3,3,2,4]`(+ 12·13라운드 보급라인 ×1.08 → 체력 1.152(7) · 1.493(12) · 1.244(13)), 险境 `[0,0,0,1,1,2,2,2,2,2,3,4,5,5]`, 终极 `[1,2,2,2,3,3,3,4,4,4,5,5,6,7]`, 标准(모두 0)은 그대로. 绝境 13라운드는 잰 값대로 12라운드보다 낮다(관리자 결정 2026-11-15, 연합 방 배율과 견주어 봄; 규정의 공략 전술 변형에는 체력 −10~−25 %짜리가 있다 — 2026-11-14에는 지난 시즌 값으로 두었다가 되돌림). 이 낮춤 때문에 绝境 표만 「그 뒤로는 줄지 않는다」의 예외다. 아케인 맹약 추가 법술 피해는 숫자가 안 보여 체력에 안 들어간 것으로 셌다. [추정·서버: 판 하나·등급 하나만 잼 — 잰 라운드 밖, 공격력(같은 겹 수를 따름), 险境·终极 표는 같은 당김을 넣은 지난 시즌 값, 묶음 안 등급은 같은 표]
  - **보급라인이 빼는 적**: 규정의 보급라인·보급라인 II(그리고 VI~VIII)는 `enemy_exclude`에 보스 소환물 둘 — 가상적: 갑주의 '갑주를 꿰뚫는 탄환'(`enemy_9016_acstmr`)과 가상적: 관의 '단현지음'/'열관지음'(`enemy_9023_acdums`) — 을 더 넣었다(맹약 하반기 표에는 없음). 보스 소환물은 그 판의 보스 라운드 배율을 받으므로(`bosses.js summonMods`, PR #272), 두 소환물은 그 시즌의 보급라인 효과가 자기를 빼면 HP에서 보급라인 몫(`supplyHpMul`)을 다시 뺀다(`supplyExcluded`가 전투의 시즌 자료 `aceffect_enemy_2`·`2_2`를 읽음). 그 몫이 있는 판은 연합 초월 시뮬레이션(`mode_multi_abyss`)의 보스 라운드(14·15, ×1.8252). 맹약 하반기는 그대로, 요마(妖怪) 같은 다른 소환물은 그대로 받는다. 공략 전술·강행군의 `enemy_exclude`에 새로 든 넷(`9024_acsgnt`·`9025_aclts`·`9026_acltm`·`9038_achest`)은 우리 편 단위라 닿을 일이 없다.
  - 현상금(`ENEMY_GAIN` 135)·전술 결정(`BUFF_GAIN` 31)·정예화 보정(`CHAR_MAP` 4)은 새 ID·바뀐 ID 모두 지난 시즌과 같은 버프 키라 블랙보드대로 돈다(`content/choices.js`) — 현상금 적 키는 모두 규정 적 자료에 있고 키트가 있으며, 맹약 서약 카드의 맹약 ID도 모두 규정 맹약에 있다. 지난 시즌의 적 약화 카드 9장(排斥·责罚·裁决)은 규정에 없다.
  - 시험: 같은 파일 「规程 补给线 leaves the leaders' summons…」(두 시즌을 같이, 실제 보스 웨이브의 가지 생성으로).
- **적 종류 표(`enemyInfoDict`)**(2026-11-12 확인): 종류마다 소속 적 키의 목록일 뿐 규칙이 없다 — 규정에서 새 종류 정예(CRITIC 33)·재생(REBORN 32)이 생기고, 은신(INVISIBLE)·굴절(REFLECTION)은 새 항목 셋(가상적: 영역 `9034_acblk`, 경안 `9039_acrefm`·경파 `9031_acrefd`)이 더해졌을 뿐 종류 설명(`enemyTypeDatas`)은 그대로다. 새 두 종류의 설명(「此类敌人在特定条件下造成高额伤害」·「此类敌人首次被击倒后会重生」)은 소속 적의 키트가 하는 일을 적은 것이고, 종류에 거는 전역 버프는 규정 레벨(`globalBuffs` 없음)·표 어디에도 없다. 그래서 종류는 특수 적 뽑기(`factions.json types[*].pool`·`entries`)와 도감 표시에만 쓰이고, 재생 등 동작은 적마다 자기 프리팹대로(`enemies/critic.js`·`reborn.js`).
- 시험: 같은 파일 「规程 假想敌：铳 is blockable…」(지난 시즌 판도 같이: 늘 저지 불가·사거리 안 방어력 최고)·「量变之械…」·「规程 enemies with a kit: … SILENCE lines」.

### 규정 리더 적의 침식 (2026-11-15)
- **규칙**: 규정의 리더 적은 다른 적처럼 침식(侵蚀) 손상을 받는다 — 클레멘티아(`char_4231_clemnt`)의 침식이 보스에게도 쌓이고 폭발한다. 맹약은
  그대로 「最终攻势中，敌方领袖不会受到侵蚀损伤」(최종 공세에서 리더 적은 침식 손상을 받지 않음, 연구 06 §10.1): 리더 적에게 가는 침식은 취소한다.
- **근거**: 중국 서버(규정) 플레이 제보(2026-11-15) — 클레멘티아 S3로 보스에게 침식이 걸림. 우리 판(맹약 규칙을 두 시즌에 똑같이 씀)에서는 안 걸렸다.
  맹약 문구는 지금 PRTS 「卫戍协议：盟约」·「卫戍协议/帮助」에서 다시 찾지 못했고(2026-11-15), 표·프리팹에도 이 면역은 없다 — 맹약 쪽은 옛 인용대로 둔다.
- **코드**: 시즌 스위치 `shared/seasons.js leaderTakesErosion`(규정 켬) → `server/sim/content/bosses.js install`이 꺼진 시즌에서만 리더의 `elementHit` 침식을 취소.
- 재발 방지: `test/match/act3-unite-redeploy-erosion.test.js`

### 규정 연합 방어 — 남은 재배치 시간 (2026-11-15)
- **규칙**: 규정에서 자기 전투가 끝날 때 쓰러져 있던 오퍼레이터는 연합 방어(联防)에 들어가 곧바로 강제 퇴장한 뒤, 자기 전투에서 남은 재배치 시간만
  기다린다(그 전투에서 받은 재배치 시간 단축도 그대로 이어짐). 다 돌았으면 DP와 칸만 기다린다. 맹약은 그대로 재배치 시간 전체를 처음부터(위 「联防 전장」·
  docs/META.md §4).
- **근거**: PRTS 卫戍协议/帮助 §联防阶段 「自卫戍协议：规程·序列Ⅰ起，作战结束时为退场状态的干员在联防阶段将继承剩余再部署时间」(2026-11-15 확인) +
  중국 서버 플레이 제보(2026-11-15: 지난 시즌처럼 5초 남기고 넘어가면 다시 처음부터 기다리지 않음).
- **코드**: 시즌 스위치 `shared/seasons.js uniteKeepsRedeploy`(규정 켬). 전투 결과 `unitsEnd`가 쓰러진 오퍼레이터의 `respawnLeft`(남은 초, 켜진 시즌만 —
  맹약 결과·digest는 그대로)를 내고(`server/sim/battle/lifecycle.js _buildResult`; 클라 보고는 `shared/protocol.js isUnitEnd`·`server/match/fields.js`가
  0–10000초로 검사), `server/match/unite.js`가 `carryState { down: true, respawnLeft }`로 넘기며, `Battle._beginWave`가 그 값을 타이머로 쓴다.
  [추정·자료 없음: 연합 방어 전장의 재배치 시간 효과(机变 征召 −50 % 등)가 이어받은 나머지를 다시 줄이는지 — 지금은 줄이지 않음] 재배치 고리는 이어받은
  시간을 전체로 그린다(`b.snap down`의 전체 = `respawnAt − deathAt`).
- 재발 방지: `test/match/act3-unite-redeploy-erosion.test.js`

## 규정 맹약 (2026-11-10)

규정(`act3autochess`)의 맹약은 시즌 전용 `data/seasons/act3autochess/bonds.json`으로 돈다. 맹약 기록의 버프 템플릿 키(`bbStr.key ?? key`, `[…]` 하위 키는 부모 템플릿, `_power`는 따로)가 구현을 고른다(`content/bonds/dispatch.js`): 맹약별 파일 `bonds/nation/<맹약>.js`·`bonds/general/arcane.js`가 자기 템플릿(`TEMPLATES`)을 등록하고, 등록되지 않은 템플릿은 아무것도 안 돈다(`node tools/season-coverage.mjs`가 보여 줌). 지난 시즌 템플릿을 그대로 쓰는 맹약(빅토리아·에기르 — act1 키, 수치만 바뀜)은 그 설치 함수가, 사르곤·쉐라그의 act3 기본 템플릿은 지난 시즌과 같은 설치 함수가 6명 공격력·한풍 없이 돈다(6명 효과는 따로 `_power` 템플릿 — 아래). 근거는 모두 규정 표의 `battle/buff_template_data.json`(캐시 `.cache/gamedata-act3autochess/`)과 맹약 수치(`buffs[].bb`, 한 맹약의 버프들이 블랙보드 하나를 나눠 씀)다. 맹약 효과를 붙이는 CN 전용 노드(`AutoChessAddBondStackCount`, 런타임 능력 프리팹)는 EN 클라에 없어 읽지 못했다 — 아래 [추정·CN] 표시가 그것이다.

- **판마다 결석 맹약 수**(관리자 결정 2026-11-13, 공식 판에서 본 값): 험지·극한·초월 시뮬레이션과 규정 등급 5~20(난이도 NORMAL·HARD·ABYSS)에서 핵심 맹약 5개·부가 맹약 5개가 빠진다(지난 시즌 3·4). 표에 이 값이 없고(공식 서버가 뽑음) `tools/build-data.mjs seasonBans`가 시즌마다 정해 `config.json bans`에 쓴다. 규정의 핵심 10·부가 11개(가중치 0 빼고)에서 뽑으므로 각각 반, 반 가까이 빠진다. 표준 시뮬레이션·규정 등급 1~4(FUNNY)와 고속 시뮬레이션(FAST)은 핵심 0·부가 2(지난 시즌 FUNNY 0·1, 고속은 칸이 없어 0·0이었다). 근거는 공식 녹화 넷: 연합 표준 두 판 핵심 0/8·부가 2/10(BV11NW869ELq 3·4편), 연합 험지·극한 핵심 5/10·부가 5/16(같은 영상 5·10편), 연합 초월 브리핑 15번 모두 5/10·5/16(BV13LWM6BEvY), 단독 규정 등급 20 부가 5/16(BV12ZWP6pE7m), 단독 규정 등급 1 부가 2/10(BV1fnWn6QEf9), 고속 부가 2/10(BV1MyWn6TEBq). 녹화가 없는 등급 2~4·6~19는 같은 난이도의 값 [추정·자료 없음: 그 등급의 녹화 없음]. 단독의 핵심은 결석 수가 아니라 두 묶음 중 하나를 고르는 공식 규칙이다(아직 구현 전 — 지금 단독 FUNNY·FAST의 핵심 결석은 0). 커스텀 설정의 무작위 금지 수 범위는 시즌의 공식 범위다(`shared/ruleset.js customBanLimits`: 그 시즌 `config.json bans`의 최댓값까지 — 규정 핵심 0–5·부가 0–5, 맹약 0–3·0–4; 2026-11-15 규정 커스텀을 열 때 넓힘, docs/rules/ui.md 「규정 모드」).
- **임시 중첩(临时层数)**: 그 전투에만 있는 중첩(`AutoChessAddBondStackCount` `_isTemp`). 전투 안에서는 고정 중첩과 똑같이 세어 효과·맹약 줄에 반영되고(`Battle.addLayers` `temp`), 결과에는 따로 남는다(`tempLayerGains`). 정산(`settle`)에서 전투 끝 특질(`SERVER_BATTLE_FIN` → `onBattleResult`)이 일부를 고정 중첩으로 바꾸고(`ctx.convertTempLayers`) 나머지는 사라진다. 우쿠시크 특질(`garrison_21`, 「<进入休整期时>场上每有一名【乌萨斯】干员…」)은 판 위 [우르수스] 오퍼레이터 1명당 N층, 베토치키(`garrison_184`)는 N층. 근거: 장비·전략 문구 「临时层数+1（每场战斗最多叠加12层）」, 특질 문구. [추정·CN: 임시 중첩에도 `layerGain` 훅(魔王류 +1)과 999 상한이 그대로 걸림. 「场上」은 전투가 끝난 뒤의 정비 판(쓰러진 오퍼레이터도 다시 판 위). 바꾸기에 맹약 활성은 안 따짐(문구에 없음)] 클라 결과 검증은 고정 중첩과 합쳐 상한 안인지만 본다(처치마다 생기므로 평평한 상한이 없음).
  - **규정의 보스전(최종 공세·숨겨진 핵심)에서도 전투 중 층 증가가 쌓인다** (2026-11-13, 관리자 제보 + CN 서버 플레이어 증언): 공식 규정 최종 공세 녹화에서 [우르수스] 맹약 수가 노란 글자(임시 중첩 있음)로 바뀌고 맹약 줄에 「제한됨」 같은 표시가 없으며, CN 서버 플레이어에 따르면 전투 중 특질은 보스전에서도 모두 중첩된다. 공식 클라에서 확인: 맹약 하반기(EN 클라)는 특질·맹약의 전투 중 층 증가 전체를 자기 전투 상태(`inSelfBattleState`)일 때만 돌린다(보스·연합 방어에는 없음 — 지금 우리와 같음). 규정(CN 클라)에는 `AutoChessGarrisonManager`에 층 증가마다의 검사(`_CheckCanAddBond`)와 맹약 효과의 층 증가(`AddBondStackCount`)가, `ScenePlayerData`에 임시/고정 중첩을 나눠 세는 것(`GetBondStackTmpCount`·`GetBondStackPersistCount`)이 새로 있다(이름까지만 확인). 구현: 시즌 기능 `bossLayerGains`(규정만 켬, `shared/seasons.js`)가 보스 필드의 `flags.layerGainsEnabled`를 켠다(`bossRounds.js`, 전투 미리보기 `intents.js`) — 고정·임시 중첩 모두 그 전투 안에서 효과·맹약 줄(임시는 노란 합계)에 반영되고, 보스 정산(`_finishFinal`)이 일반 전투의 정산과 같은 `settle.js _battleResultLayers`로 고정 층을 남기고 임시 층은 전투 끝 특질의 전환 뒤 버린다(관리자 결정 2026-11-13: 「보스전도 일반 스테이지처럼 중첩되니 그 전투 이후에도 유지」). 그래서 최종 공세에서 얻은 층은 숨겨진 핵심 전투와 결과 화면에 남는다(숨겨진 핵심 조건의 층 합계는 지금처럼 보스 라운드 정비 끝에 잼). 연합 방어(联防)는 그대로 꺼짐(관리자 판단 2026-11-13 「아마 안 쌓임」). 시험: `test/match/finalAssault.test.js` 「boss field layer gains follow the season」(실제 판 경로: 규정 켬·맹약 하반기 꺼짐), `test/content/bonds_act3.test.js` 「规程 boss fields stack IN_BATTLE layers」.
- **염국 `bondeffect_yan_2`**: 구성원 공격력 +(`atk_base` + `atk_per_stack`·L)(MULTIPLIER = 직접 곱연산). 6명: 구성원이 입히는 피해(부가 피해 빼고 — 템플릿 `yan_power`의 `FilterDamageModifer` ADDITION 부정)마다 무작위 원소(`RandomSetter element_type` 1…5: 신경·침식·작열·괴사·광조) 손상 공격력 × min(`ex_atk_scale_max`, `ex_atk_scale_base` + per·L). 같은 필드의 모든 적은 폭발 냉각에서 ×(1 + min(max, `ep_break_recover_speed_base` + per·L)) 빨리 돌아온다(`yan[enemy]` `EP_BREAK_RECOVER_SPEED`, 필드에서 6명인 플레이어 중 가장 높은 염국 중첩). 5번 원소 **광조**(`ElementType` ANGER, CN 전용 — 엔진 `rampage`)는 적에게만 있다: 폭발(CN 템플릿 `ep_break_anger` → CN 클라 버프 표 행 `ep_break_anger_enemy`)은 15초(CN `ep_breakbuff_table` ANGER) 동안 공격 속도 +`attack_speed`(20)이고, 1초마다(첫 번은 1초 뒤) `anger_damage_accum`에 `anger_damage_step`(130)을 더한 뒤 (누적 + `anger_damage_base` 160) × 간격의 원소 피해(무출처, `BleedingDamagePerSec` — EN 클라에도 있는 노드, 공식 클라에서 확인) — n번째 초에 160 + 130·n, 15번째에 2110(용어 `ba.dt.rampage2` 「最多2110」과 같음). 이 표의 凋亡 행(800/초·15초·−50 %)이 우리 상수와 같아 읽기를 맞춰 봤다. 원형 바 색 `#ef2bcc`(CN `enemy_ep_slider`·`char_ep_slider`의 5번째 `_elementDatas`, 폭발 색도 같음). 오퍼레이터의 광조(`ep_break_anger_char`)는 아직 없어 오퍼레이터에게는 광조 게이지가 없다 — 이 모드에서 오퍼레이터에게 광조를 채우는 것은 새 시즌 특수 적뿐(묶음 sim-P).
- **우르수스 `bondeffect_ursus`**: 구성원 공격력·HP +(base + per·L). 구성원이 적을 쓰러뜨리면(`ON_TARGET_KILLED`) 임시 중첩 +`temp_bond_stack_cnt`(2, 6명이면 `[power]` 4). [추정·CN: 「其他单位」 = 그 구성원이 쓰러뜨린 적 — `ON_TARGET_KILLED`의 대상 종류는 CN 노드라 못 읽음] 6명: 1초마다(구성원이 나온 뒤 1초부터) 저지 중인 적 하나하나에 공격력 × (`atk_scale_base` + per·L) 마법(지속), 살아 있는 출처에게 받는 피해(진실·지속 빼고)를 ×(1 − min(1, `damage_one_minus_base` + per·L))로 깎고 깎인 만큼을 10초 동안 1초마다 1/10씩 진실 피해(그 출처가 낸 것)로 다시 잃는다. 출처가 쓰러지면 멈춘다. 맞을 때마다 따로(`disableOverride`). 처치당 임시 중첩을 늘리는 전역 블랙보드 `ursus_extra_bond_stack_cnt`는 자리만 있다(`ursusExtra`) — 그 값을 주는 것은 전략이 아니라 특질 `garrison_23`(`act3autochess_gar_effect_ursusexbondcnt`, 묶음 sim-N).
- **이베리아 `bondeffect_iberia`**: 템플릿은 적에게 붙는 `iberia[enemy]` 하나. 구성원이 적에게 입히는 피해(부가 피해 빼고)마다 — 적·구성원 쌍마다 0.2초에 한 번(`[enemy_cd]`) — 그 구성원의 지속 마법 피해 1중첩(`[enemy][dot]` STACK 최대 10, `independentCharacterSource`, 첫 중첩부터 10초, 10중첩일 때만 시간 갱신, 끝나면 모두 사라짐): 1초마다 공격력 × (`dot_atk_scale_base` + per·L) × 중첩. 6명: 그 2배, 맞을 때마다 이동 속도 −4 %(한 적에 하나, 최대 20중첩 −80 %, 10초), `prob_base` + per·L 확률로 그 피해가 대상 반경 1.0 안 다른 적 하나(무작위)에게 튀어 공격력 × `atk_scale`(3) 마법(스플래시). 튄 피해는 다시 튀지 않고(`iberia_p_damage`) 중첩은 붙인다. 출처가 사라지면 남은 틱은 마지막 공격력으로 출처 없는 피해. 「연금 유닛」은 맹약이 [이베리아]인 유닛 그대로(지금 소환물은 구성원이 아님).
- **시라쿠사 `bondeffect_siracusa_2`**: 배치 때 공격 속도(지난 시즌과 같음). 6명: 구성원 공격·스킬 피해(능력 계열 `ATTACK_OR_COMBAT`, 지속 빼고, 구성원마다 0.2초에 한 번)마다 `prob`(0.3)로 무작위 상태 이상 하나(`abnormal_buff[random_creator]`: 기절·공포·유인·한기·마비·속박) min(max, base + per·L)초. 1초마다 상태 이상을 2종 이상(`abnormal_buff[count]`, 한기와 동결은 하나) 가진 적은 자신과 반경 1.1 안 적에게 `damage_value_base` + per·L 진실(출처 없음). [추정·CN: 적 버프의 발동 간격(`siracusa_power[enemy]` ON_BUFF_TRIGGER)은 전역 버프 자료에 있어 문구 「每秒」대로 1초]
- **카시미어 `bondeffect_kazimierz_2`**: 배치마다 공격력(지난 시즌과 같은 필드 한 계수). 6명: 구성원의 배치·스킬 시전 뒤 `ex_damage_duration`(30)초 동안(`[ex_damage]` EXTEND) 입히는 피해(부가 피해 빼고)마다 공격력 × `ex_atk_scale_base`(0.65) 진실 부가 피해.
  - **6명 교대**(2026-11-11): 지상 배치 구성원(`[power]` ON_BUFF_START → `CheckBuildableType` MELEE `_checkOriginCondition`, 우리 `def.position` MELEE)이 쓰러지면(`[switch]` ON_OWNER_FINISH의 HP_ZERO·HP_ZERO_WITH_NO_SOURCE = 우리 'killed', 철수·강제 퇴장은 아님) 그 구성원은 떠나고(쓰러진 몸 없음·재배치 없음) 정비 구역 맨 오른쪽(`_selectType` RIGHT, 칸 번호가 큰 쪽 — 새 기물이 오른쪽부터 채우는 그 순서) [카시미어] 지상 배치 오퍼레이터(`_checkBond`·`_buildableType` MELEE)가 그 칸에 같은 방향으로 배치된다(`AutoChessMarkSwitchWithHand` `_putType` ORIGINAL). 들어온 오퍼레이터도 구성원이라 배치 수·`[ex_damage]`·자기 교대를 그대로 받고, 맹약 활성은 전투 입력 그대로(문구 「不改变当前盟约的激活状态」). 후보가 없으면 보통처럼 쓰러진다. 엔진: 전투 입력에 그 플레이어가 6명일 때만 정비 구역의 [카시미어](또는 조화) 지상 배치 오퍼레이터(`reserve`, 칸 번호와 로드아웃 — spec은 관전자에게도 가므로 나머지 정비 구역은 싣지 않음)가 실리고, 6명인 플레이어의 후보는 콘텐츠 설치 전에 「대기 유닛」(`battle.createReserveAlly`)으로 만들어져 맹약·장비·키트 훅을 보드 오퍼레이터처럼 받는다(docs/SIM.md §1.1).
  - [추정·CN: `AutoChessMarkSwitchWithHand`는 CN 전용 노드라 못 읽음 — 들어오는 칸은 쓰러진 구성원이 누운 칸(우리 `restTile`), 전투가 끝난 뒤 보드·정비 구역은 그대로(「Mark」가 정산에서 자리를 바꾸는지 모름), 한 번 들어온 후보는 다시 안 쓰고, 정비 구역은 전투 시작 때의 것(전투 중 구매가 있다면 반영 안 함)]
- **아케인(act3 템플릿)**: 구성원이 입히는 피해(부가·원소 빼고)마다 공격력 × (`atk_base` + per·L) 마법 부가 피해. 3명: 필드의 적은 피해(원소 빼고)를 받을 때마다 마법 저항 −1, 최저 `magic_res_max_base` + per·L(≥ `magic_res_max_min`). 또 3명(자기 플레이어의 수, 템플릿 ON_BUFF_START → 런타임 능력 `act3autochess_bond_mag_power[immune_invisible]`)이면 구성원 공격 범위 안 적의 은신이 꺼진다 — 같은 문구의 모듈 효과(「攻击范围内敌人的隐匿效果失效」, `kits/shared/tier4.js reveal`)대로 배치 중 0.2초마다 범위 위의 은신 적에게 짧은 반은신. [추정·CN: 능력 프리팹은 CN 전용 — 범위는 그 구성원의 현재 공격 범위, 갱신은 엔진의 오라 방식] 지난 시즌 아케인(act2 템플릿)은 그 시즌에서만 돈다(`addon/battle.js TEMPLATES`에 act3 템플릿이 없음).
- **취합(聚合, `docShip`, 공식 한국어 이름 없음) `bondeffect_doc`**: 구성원 공격 범위 안 아군은 초당 구성원 공격력 × (`heal_base` + per·L) HP 재생, × (`ep_heal_base` + per·L) 원소 손상 회복. 3명: 그들에게 비호 `damage_res_base` + per·L(`damage_resistance[inf]`). 구성원이 여럿이면 재생은 더하고 비호는 가장 큰 것.
- **라이타니엔 `bondeffect_lethania`**(`bonds/nation/lethania.js`): 구성원 공격력 +(base + per·L). 필드의 적이 쓰러지면(`[enemy]` ON_OWNER_FINISH: HP_ZERO·출처 없는 HP_ZERO·FALLDOWN — 우리 엔진의 `killed`) 그 자리에서 `[summoner]`: 그 플레이어의 살아 있는 소환물이 상한(필드에 6명인 플레이어가 있으면 `summon_cnt_max_2` 20, 아니면 `_1` 10) 아래면 min(max, `summon_prob_base` + per·L) 확률로(L = 필드에서 가장 높은 라이타니엔 중첩), 필드에 6명이 있고 min(max, `big_prob_base` 0.3 + 0.001·L) 확률이면 「한 악부」(`enemy_9026_acltm`), 아니면 「한 마디」(`enemy_9025_aclts`)를 가장 가까운 지상 칸에. 6명(자기 플레이어)이면 구성원이 쓰러질 때도 같은 소환(`_power`). 소환물은 공격력 +(base + per·L)(`[summoned]`, 필드 최고 중첩). 「한 악부」가 있는 동안 [라이타니엔] 오퍼레이터 공격 속도 +20(재능 `Aura.base_attack_speed`) — **악부마다** +20이라 둘이면 +40, 쓰러진 악부의 몫만 끝난다(규정 `buff_template_data` `acltm[atk-spd]`가 라이타니엔 오퍼레이터마다 파생 버프 `acltm[atk-spd-core]`를 `disableOverride`로 따로 걸고 끝날 때 `FinishDerivedBuff`, 재능의 `attack_speed_per_stack`은 0 — upstream PR #956과 같음), 공격 3번 뒤 다음 공격은 두 번 친다(Sk1, SP 공격마다 1, 최대 3).
  - 소환물은 적 자료를 그대로 쓴 **걷는 아군**(`bonds/walker.js`, 토큰 `walks`): 칸을 차지하지 않고(`battle/deploy.js`), 1초마다 필드 전체에서 대상을 골라 적과 같은 걸음(`walk.js walkCursor`, 적 자료 이동 속도)으로 다가가며, 저지할 때·공격 동작 중에는 선다. 저지는 자기 위치에서 오퍼레이터와 같은 접촉 규칙(`battle/blocking.js`, 자료 `blockCnt` — 한 마디 1, 한 악부 2), 공격은 적처럼 둥근 범위(`rangeRadius`, 0이면 저지한 적만). 禁疗(프리팹 공통 능력 `heal_free`, 이상 효과 HEAL_FREE), 재능 `Bleeding`: 1초 뒤부터 1초마다 최대 HP의 10 %를 출처 없이 잃음(`aclt[bleeding]` DamageViaMaxHpRatio PURE) — 10초 산다. 공식 클라에서 확인: 소환은 `SummonEnemyWithRuntimeRoute`(`_unharmful`, `_noEndPosition`), 「한 마디」 프리팹의 선택자는 모두 `_targetSide` ENEMY, 대상 추적 능력(`_enableTraceTarget`, `_searchCoolDown` 1). 공식 녹화: 소환물이 사거리 밖의 적에게 걸어가 싸운다(upstream PR #943이 든 BV1SgWV6jEfJ 14:22–14:25·16:30–16:34) — 쫓아가는 것 자체는 녹화로 확인, 아래 줄의 추정은 그 세부(대상 고르기·다시 고르는 때).
  - [추정·CN: 대상 추적 능력의 클래스(`_dontMarkReachedByInAttackRange` 등)와 소환 노드의 새 필드(`_summonOnNearestPassableTile`)는 CN 전용이라 못 읽음 — 대상은 가장 가까운 선택 가능한 적(근접인 한 마디는 지상만), 사라지면 바로·아니면 1초마다 다시 고름, 적이 없으면 제자리; 공격 범위 안의 적은 걸음을 멈추지 않음. 적 자료 유닛을 플레이어 편에 두는 방법도 CN 쪽이라 못 읽었다. 한 악부의 오라는 소환한 플레이어의 구성원에게(노드가 누구의 오퍼레이터인지 말하지 않음). Sk1 두 번째 타격은 첫 타격 0.234초 뒤(Skill 클립의 OnAttack 0.533·0.767초). 두 플레이어가 라이타니엔인 공유 필드에서 적의 소환은 먼저 설치된 플레이어 몫(`[enemy]` UNIQUE). 소환물 공격력은 중첩이 바뀔 때 다시 셈(공식은 0.3초마다)]
- **사르곤 6명 모래 늪 `act3autochess_bond_eff_sargon_power`**(`bonds/nation/sargon.js installSand`, 수치는 그 `[tile_listener]` 버프): 자기 플레이어의 사르곤 6명이면 구성원이 스킬을 켤 때마다 공격 범위 안에서 그 구성원과 가장 가까운 지상(WALK) 칸 중 아직 모래 늪이 아닌 칸에 모래 늪 하나(칸 리스너 `act3autochess_bond_sargon_tile_listener`는 플레이어마다 하나, 같은 칸에는 다시 달리지 않음 — EN 클라 `AttachListenerToTileAbility.AttachToTile`). 지금 칸(점)이 모래 늪인 지상 적: 迟钝 min(`slow_max`, `slow_base` + per·L), 스킬이 켜진 구성원의 공격 범위 안이면 2배(능력 `act3autochess_bond_sargon_range`, 스킬 시작~끝, `[aura_buff]`); 들어온 뒤 `interval`(5)초마다 束缚 `unmovable_duration`(1)초 → 마법 min(max, `magic_damage_base` + per·L)(출처 없음, 지속, 환경 피해); 그 범위 안이면 1초마다 `[mag_damage_2]` 마법 min(max, base + per·L). `[checker]`가 0.3초마다 보고 어느 모래 늪에도 없으면 모두 끝(이웃한 모래 늪으로 옮기면 시계가 이어짐). 비행 적은 안 걸림. [추정·CN: `FindNearestTileInRangeToBB`는 CN 전용 노드 — 범위 = 구성원 공격 범위, 이미 모래 늪인 칸은 건너뜀(노드의 칸 표시 `ac_bond_eff_sargon_power[sand]`), 거리는 구성원 칸에서; 2배 판정은 0.3초 갱신 대신 틱마다] 깐 칸은 전투 메타 `sand`로도 나간다(`sandView`: 늦게 들어온 화면이 다시 깔도록, 2026-11-16). 그림은 fx.md 「규정 사르곤 모래 늪」.
- **예견 `bond_goods_disc_tier2`**(`bonds/general/visi.js`): `layer_list` 80·150 단계를 처음 넘을 때마다 [예견] 오퍼레이터 구매가 −`discount`씩 영구(80층 −1, 150층 −2). 지난 시즌처럼 150층에 모든 오퍼레이터로 넓어지지 않는다(문구 「所有【远见】干员购买价格额外永久-1资金」). 단계는 맹약이 켜져 있을 때만 잠기고 밀린 것은 켜지는 즉시(지난 시즌 할인과 같은 규칙), 값은 0 아래로 안 내려감. 10층마다 2자금은 지난 시즌 그대로.
- **기적 `bond_layer_shop_same_tier`**(`bonds/general/mira.js`): 처음 100층에 닿은 뒤(켜져 있을 때 잠김) 새로고침한 상점의 오퍼레이터 칸에 조달 센터 등급과 같은 티어가 하나도 없으면 칸 하나를 그 티어로 다시 뽑는다(공용 풀, 사본 가중). 지난 시즌의 100층마다 20자금은 없음. 무료 새로고침 확률은 수치만 바뀜(0.18 + 0.0025·L). [추정·서버: 상점 뽑기는 서버 몫 — 수동 새로고침만(기적 무료 새로고침과 같은 「刷新」, 라운드 시작 뽑기 아님), 바꾸는 칸은 무작위 오퍼레이터 칸, 기적이 켜져 있을 때만]
- **빅토리아·에기르**: 템플릿은 지난 시즌 그대로, 수치만 시즌 것(빅토리아 장비당 0.4 + 승급 0.4, 에기르 부활 6명). 전략이 바꾸는 다른 방향(`_2`)은 규정 고유 템플릿이다:
  - **빅토리아 `bondeffect_victoria_2` → `act3autochess_bond_eff_victoria`**(2026-11-12, `bonds/nation/victoria.js installVictoriaAct3`, 락락 전략을 든 플레이어만): 장비 든 구성원 피해 배율은 같다. 6명: 전투 시작에 장비를 하나라도 든 구성원(`ON_BUFF_START`의 `equip_cnt` ≠ 0, 자기 플레이어 6명이면 `_power` 생성)이 스킬을 켤 때마다(`ON_SKILL_CAST_SUCCEED`) 둘레 3×3(`[share_equip]` `AutoChessShareEquipEffect`, 범위 `x-4`, 장비 티어 제한 없음 — 나란투야 사르곤의 `filter_item_level` 없음)의 오퍼레이터에게 자기가 든 장비 효과를 min(`share_equip_duration_max` 200, `share_equip_duration_base` 30 + `share_equip_duration_per_stack` 0.1·L)초 빌려준다(`items.js lendItemEffects`, 같은 장비를 다시 빌려주면 시간만 새로). `[share_equip]`는 EXTEND라 돌고 있는 동안의 재시전은 시간만 새로 채우고 받는 오퍼레이터는 첫 시전 때의 그대로다(대상 캐시 `_targetsCacheKey`; 덮어쓰기 그룹은 새 버프를 안 더하므로 `ON_BUFF_ENABLE`이 다시 안 돎 — 공식 클라에서 확인). 그 버프가 끝나면(빌려준 구성원이 쓰러지거나 철수해도) `ON_BUFF_DISABLE` `AutoChessRemoveEquipEffectByAlias`로 빌려준 효과를 바로 거둔다(`items.js endLentItems`). 지난 시즌 6명의 「장비당 공격력」은 없다. 시험 `bonds_act3.test.js` 「洛洛's 维多利亚 6 (_2)」.
  - **에기르 `bondeffect_egir_2` → `act3autochess_bond_eff_egir`**(2026-11-12, `bonds/nation/egir.js installEgirAct3`, 글래디아 전략을 든 플레이어만): 템플릿은 지난 시즌(`act1…`)과 HP(`[max_hp]`)·삼키기(`ON_AUTO_CHESS_MODE_CHANGED` 범위 `1-1` = 앞 칸, 표시된 구성원을 거쳐 `x-5`, `[eat_mark]` 같음)가 같고 `ON_OWNER_FINISH`만 다르다. 6명: 구성원이 쓰러지면(HP_ZERO·HP_ZERO_WITH_NO_SOURCE·FALLDOWN = 우리 'killed') 그 구성원의 **첫** 쓰러짐일 때만(`egir_first_finish_flag` — 아무도 안 와도 씀), 그 플레이어의 소환이 `switch_cnt_max`(3) 미만이면(AUTOCHESS 전역 `bond_eff_egir_switch_cnt_<편>`, 누가 왔을 때만 +1) 정비 구역 맨 오른쪽의 그 칸에 설 수 있는 [에기르] 오퍼레이터(`AutoChessCheckSwitchWithHand`·`AutoChessMarkSwitchWithHand`: `_selectType` RIGHT, `_putType` ORIGINAL, `_checkBond` egirShip, `_buildableType` NONE)가 그 칸에 같은 방향으로 들어오고 구성원은 쓰러진 몸 없이 떠난다(카시미어 6명 교대와 같은 엔진: 대기 유닛 `createReserveAlly`·`fieldReserve`). 들어온 오퍼레이터는 `[attr_extend]`로 떠난 구성원의 삼키기 몫(`egir_bond_atk`·`egir_bond_block_cnt` `[extend]` — 공격력 최종 가산·저지 수; 체력 몫은 전략 장비의 `egir_band_equip_extra`가 있을 때만이고 이 모드에는 없음)을 받고, 자기 첫 쓰러짐에 다시 부른다. 맹약 활성은 전투 입력 그대로(문구 「不改变场上的盟约激活状态」). 전투 입력에는 그 플레이어가 6명이고 이 방향일 때 정비 구역의 [에기르](조화 포함) 오퍼레이터가 배치 종류와 상관없이 실린다(`hand` 규칙 `position` null). 시험 「歌蕾蒂娅's 阿戈尔 6 (_2)」 셋(실제 판 경로 포함).
  - [추정·CN: 정비 구역 소환 노드는 CN 전용이라 못 읽음 — 「현재 위치에 배치 가능한」(문구 「可部署至当前位置的」)은 쓰러진 구성원과 같은 배치 종류(특질 소환 `garrisons/effects/switch.js`의 `_checkOriginBuildable`과 같게); 횟수는 플레이어마다(지난 시즌 부활과 같게); 소환은 다른 쓰러짐 처리기 뒤(우선순위 −1000, 카시미어 교대와 같게)라 구원·불굴이 먼저 답함]. 삼키기로 쓰러진 구성원은 쓰러진 차례로 바로(공식 클라 — 위 「에기르(맹약) 부활은 공식 클라대로」, 2026-11-13; 그 전에는 삼키기 뒤 보드 순서)
- **쉐라그 6명 설산 거인 `act3autochess_bond_eff_kjerag_power`**(`bonds/nation/kjerag.js` → `bonds/giant.js`, 2026-11-11): 자기 쉐라그 구성원이 6명(`power_bond_char_cnt`)인 플레이어마다 전투 시작에 「不眠雪山」(`enemy_9024_acsgnt`, 공식 한국어 이름 없음) 하나 — 그 플레이어의 마지막 쉐라그 오퍼레이터 칸과 상하좌우(`x-5`) 중 지상 칸, 없으면 가장 가까운 지상 칸(`FindNearestPassableTileForLastCharacter` → `SummonEnemyWithRuntimeRoute _summonOnNearestPassableTile`). 라이타니엔 소환물과 같은 **걷는 아군**(`bonds/walker.js`, 禁疗, 동결 면역은 적 자료대로). 수치는 CN 프리팹(`battle/enm_pfb_36.ab`)과 규정 표 템플릿 `acsgnt[…]`:
  - 맹약 버프(재능 `BondBuff`, 1초마다): n = ⌊그 플레이어의 쉐라그 중첩 ÷ `stackStep` 3⌋, 공격력 +(0.5 + 0.01·n)·최대 HP +(0 + 0.02·n)(둘 다 MULTIPLIER).
  - **거인 형태**(覆雪苏醒, 처음 형태 `Giant`): 걸어서 대상을 쫓고(라이타니엔 소환물과 같은 추적 능력), 저지 없음(`block_free`). 사거리 2.4 안의 지상·공중 적 하나에 투사체 `projectile_enemy_acsgnt` 마법 — 투사체가 닿으면 그 주변 반경 1.1(`CircleCollider2D`) 안 **지상** 적 모두에게도 같은 피해(`_hitNumType` INFINITY, `_exceptTraceTarget`·`_alwaysHitTraceTargetInTheEnd`, 위장 무시). 저지할 수 있는 지상 적(BLOCK_FREE·LEVITATE·ATTRACTED가 아닌)이 0.8 안에 오면 `Switch2Snowy`(A_Change 1초, 침묵 무시) → 설산 형태.
  - **설산 형태**(覆雪坐定, `SnowyMountain`): 서서(UNMOVABLE_PRIVATE) 3명 저지(`BlockEnemy.block_cnt`, BLOCK_CNT). 사거리 안 지상 적에 투사체 없는 마법, 대상 주변 반경 1.5(`BlockEnemy.attack@ability_range_radius` — 撼地者 특성이 스플래시 반경을 읽는 같은 키) 안 다른 지상 적에게 공격력 ×1 스플래시(`_splashAtkScale` 1, `atk_scale_2` 없음). 동결된 적에게는 피해 ×3.5(`FrozenBreak.atk_scale`, `acsgnt[frozen-break]` ON_CALCULATE_DAMAGE AtkScaleUp)이고 그 적의 동결이 모두 풀림. `PowerAttack`: 1.1 안의 동결된 지상 적을 먼저 친다. 처음 앉은 뒤나 마지막 공격 뒤 5초(`SwitchMode.interval`, `acsgnt[mode-timer]` ON_AFTER_ATTACK에서 다시 셈)가 지나면 `Switch2Giant`(B_Change 1초) → 거인 형태; 그때 행동할 수 없으면 0.1초마다 다시(`[keep-switch]`, 시전은 안 끊음).
  - **【神迹之声】**(`Attract`, 설산 형태의 스킬, 비공식 풀이 「신적의 소리」): SP 시간마다 1, 처음 10, 18에서(B_Skill 5초) 공격을 멈추고(FORCE_DISARMED) 반경 1.5 안 적 모두를 자기 칸으로 유인(`acsgnt[attract]` ATTRACTED, 엔진의 `attract` 상태) — 시전이 끝나거나 끊기거나 거인이 쓰러지면 유인도 끝.
  - 화면에는 형태 전환 시작에 fx `phase`(`form`), 유인에 `lure`와 `skill` 이벤트 — 아군 편 적 모델 그리기는 fx 쪽.
  - [추정·CN: 형태 전환·`PowerAttack`·`Attract`는 CN 전용 스킬이라 시전 조건을 「휘두르는 중·시전 중이 아닐 때」로(휘두르기를 끊지 않음), 전환 클립에 OnAttack 프레임이 없어 형태는 클립 끝에 바뀜, SP는 두 형태 모두에서 참, 유인은 공격 사거리 안에 적이 있을 때 시작하고 자기 칸으로 끔. 「마지막 오퍼레이터」는 가장 늦게 배치된 것. 투사체 반경 1.1은 적 중심으로 셈(엔진의 스플래시 규칙). 0.8에서 앉기 시작해도 전환 1초 사이 걸어가는 적은 접촉 저지 반경(√0.5) 밖으로 벗어날 수 있음 — 저지 반경은 우리 엔진의 아군 규칙]
- **쉐라그 100층마다 쉐라그 만년빙**: 빅토리아 해머와 같은 지급(`bonds/templates.js payHammers`, `bond_layer_added_reward_equip`, 맹약이 켜져 있을 때·밀린 것은 켜지는 즉시). 보상 풀 `pool_equip_kjeragbond2`는 표에 없어(서버 쪽) 생성기가 그 시즌의 쉐라그 만년빙 하나로 만든다(`tools/build-data.mjs`, [추정·서버]).
- 임시 중첩의 화면 표시(맹약 줄 노란 합계, 상세 창 「层数 고정 + 임시」)는 ui.md 「임시 중첩 표시」. 라테라노는 이 시즌 표에 없어 목록·맹약 줄에도 없다.
- **규정 핵심 맹약 금지**(2026-11-14, 관리자 결정 — CN 플레이 제보): 판마다 뽑힌 금지 맹약(+ 모드의 고정 비활성 맹약) 중 **핵심 맹약**이 꺼지면 그 맹약의 오퍼레이터는 부가 맹약이 남아 있어도 모두 금지(상점 풀·선발 재고 `diyBanned`·브리핑 금지 목록). 핵심 맹약이 둘 이상인 오퍼레이터(비비아나 = 카시미어 + 라이타니엔 등 6명)는 그 핵심 맹약이 모두 꺼질 때만. 핵심 맹약이 없는 오퍼레이터는 지난 시즌 규칙(맹약 전부가 꺼질 때) 그대로. 시즌 스위치 `coreBondBan`(`shared/seasons.js bondsOff`, `server/match/pool.js drawDisabledBonds`), 맹약(지난 시즌)은 바뀌지 않음. 공식 녹화 근거(BV1hmWL6fEmQ, upstream 1b18b60c·PR #928이 인용한 시각): 00:13 「确认本局信息」의 금지 목록에 쉐라그 오퍼레이터 9명(데겐블레허만 빠짐), 01:20 같은 판의 개요에 꺼진 핵심 맹약 빅토리아·쉐라그·시라쿠사·우르수스·이베리아와 부가 맹약 다섯, 켜진 부가 맹약에 협동방어 등 — 부가 맹약이 켜진 실버애쉬 더 레인프로스트·노시스·쉐라·프라마닉스·마터호른도 금지, 핵심 맹약 둘이 켜진 데겐블레허는 금지 아님. 처음엔 CN 플레이 제보로 정했다. 시험 `test/match/pool.test.js` 「规程 (coreBondBan)…」. AI 托管은 그 판에 꺼진 핵심 맹약을 모드가 끈 맹약처럼 본다 — 그 맹약에 기대는 전략을 고르지 않고(`botPickBand`), 주력·둘째 맹약·기물 점수에 넣지 않는다(`bot.js bondOff`, upstream `aeb68340`의 봇 부분; 맹약 시즌은 그대로). 시험 `test/match/bot-bond-off-act3.test.js`.
- 시험: `test/content/bonds_act3.test.js`(맹약마다 수치·6명 효과, 아케인 3명 은신 무효, 사르곤 6명 모래 늪, 임시 중첩의 실제 대전 정산, 쉐라그 만년빙, 예견 두 단계 할인, 기적 같은 티어 보장, 라이타니엔 소환·걷는 소환물·한 악부, 쉐라그 설산 거인의 소환·두 형태·동결 강타·유인·실제 대전, 카시미어 6명 정비 구역 교대·실제 대전).

## 장비 전투 효과는 아이템 ID가 아니라 버프 키로 (2026-11-11)

- 전투 쪽 장비 효과는 장비 기록이 가진 버프의 공식 키(`bbStr.key`)로 고른다: 스탯 버프, 버프 키마다의 동작(`server/sim/content/items/effects/*.js`, 계열마다 한 파일), 해머, 그리고 아이템 ID에 묶인 셋(듀얼 모드 기계팔은 수치가 없고, 증기의 마음·기사 계율은 버프 둘을 읽음 — `items/battle.js` `BY_ITEM`). 규정(`act3autochess`)은 지난 시즌의 아이템 ID를 다른 아이템에 다시 쓰므로(`handlerKey`), ID로 고르면 같은 버프를 가진 다른 ID의 아이템은 효과를 못 받았다.
- 바뀐 것(규정만, 기본 시즌은 그대로): 규정의 不退者之盾(`chess_item_3_16_e`, 공식 한국어 이름 없음 — 「물러서지 않는 자의 방패」)과 不退者卫护系统(`chess_item_6_06_e`, 공식 한국어 이름 없음 — 「물러서지 않는 자의 방호 체계」)이 농축 스멜링 솔트의 버프 `act1autochess_equip_acarm059_global_buff`(`hp_ratio` 0)를 가지고 있어, 남은 HP와 상관없이 기절·빙결 같은 특수 상태에 면역이 된다(설명 「免疫晕眩、冻结等特殊状态」과 같다. 전에는 효과 없음).
- 한 기록 안의 순서: 스탯 버프와 앞 단계 동작(버프 순서대로) → 해머 → 뒤 단계 동작(버프 순서대로) → 아이템 ID 동작. 뒤 단계 24개는 전에 아이템 ID로 돌던 것이라 훅 순서와 고정 시드 전투가 그대로다(기본 시즌 golden 그대로).
- 확인: `test/content/items.test.js` 「an item runs the behaviours of the buff keys it carries, whatever its id」(옛 코드에서 실패 확인), `node tools/season-coverage.mjs act3autochess`(장비 `wrong` 4 → 2: 페가수스의 투구·랜스 ID를 다시 쓰는 규정 장비에는 그 버프가 없어 이제 아무것도 돌지 않음), golden `act3-roster` 한 판(`roster-055`: 不退者之盾을 든 오퍼레이터가 빙결을 막음)만 바뀜 — 이 두 장비를 든 다른 판에는 막을 상태가 오지 않음.
- 준비 쪽도 같다(2026-11-11): 장비 사용·법술 처리(내장 `server/match/builtinMeta.js`와 `server/sim/content/items/meta.js` `PREP`)는 기록이 가진 버프 키로 등록된다. 규정이 같은 뜻으로 이름만 바꾼 키(같은 아이템·설명·수치, `server/sim/content/items/aliases.js`)는 지난 시즌 키로 읽는다: 긴급 차출권·신분인식표·돈독 오른 인형·인사부 파일·비콘 — 그래서 규정에서 신분인식표·돈독 오른 인형·인사부 파일·비콘이 처음으로 효과를 내고, 긴급 차출권은 고급의 2명을 제대로 받는다(전: 버프를 못 찾아 1명). 뜻이 바뀐 키는 별칭이 아니다: 규정의 호출 모듈은 「그 오퍼레이터의 첫 맹약」만 보므로(`use_equip_spe_goods_first_bond`) 이제 지난 시즌의 제안을 하지 않는다(처리기 없음), 간이 통신기(첫 맹약만)·의태 물질(같은 등급으로)도 마찬가지. 확인: `test/content/items.test.js` 「prep behaviours run by the buff keys an item carries」(옛 코드에서 실패 확인), 커버리지 장비 `wrong` 2 → 0, golden `act3-matches` 네 판 모두 바뀜(기본 시즌 그대로).

## 스킬 시작 클립 (2026-11-11, 관리자 결정 「풀 전체」)

- **규칙**(공식 클라에서 확인): 스킬 프리팹이 시작 클립을 트는(`_playSkillBeginAnim` 1, `_beginAnim`) `_switchToState` 1 시전은, 시전하면 바로 스킬 상태에 들어가 진행 중인 휘두름을 끊고 공격하지 않는다. 시작 클립 길이를 기다린 **뒤에** 스킬이 시작된다: 버프·수치, 키트의 `onStart`, `skillStart` 훅, 지속 시간, 스킬 능력. `SkillState.OnEnter` → `BasicSkill.OnBeforeSkillStart`가 `PlayBeginAnimation`을 띄우고, 이것이 클립 길이(`Character.PlayAnimation`이 돌려준 값)만큼 `AsyncUtil.WaitForFixedSeconds`로 기다린 뒤 `DoStartSkill`을 부른다. 모델에 그 클립이 없으면 기다리지 않는다. SP는 클립 **뒤** 스킬이 시작될 때 빠진다(2026-11-11 고침, 공식 클라에서 확인): `DoStartSkill` → `SkillState._StartSkill` → `BasicSkill.Cast`가 `CastSkill.DoCast`(`ReduceSp`)를 부르고, SP 회복을 멈추는 것도 그 뒤 `OnCastSucceed`다(`registeredAsModifier`; `UpdateSpRecovery`도 스킬 능력의 `isAffecting`으로 정함). 그래서 클립 동안 SP 막대는 찬 채로 있다.
- 그 사이 기절·빙결·수면이면 시전이 사라진다: 스킬 상태가 끝나며(`SkillState.OnTick` → `OnExit`) `BasicSkill.InterruptIfNot`이 `m_startSkill`을 비우고, `DoStartSkill`은 그것이 비어 있으면 아무것도 하지 않는다. `Cast`에 닿지 않았으니 SP는 그대로 남고(다음 시전 가능), 스킬의 끝 효과도 없다(오로라 S1의 자기 기절 없음).
- `_switchToState` 0 시전은 기다리지 않고 바로 시작한다(하이모어 S2, `diy.md` 「새 시즌 블루포이즌·하이모어·홈바운드·안드레아나」).
- 구현: `tools/local-extract/skill_cast.py`가 `begin`(클립 키, 아래 방향 배치의 `_beginAnimDown`은 `beginDown`)을 쓰고, `tools/build-data.mjs skillCast`가 그 길이를 스킬 기록의 `cast.begin`(초)에 넣는다(127개 프리팹 행, 풀 전체; 아래 방향 클립은 풀의 모든 모델에서 길이가 같아 따로 두지 않음). `server/sim/skills.js`: `beginTime`(틱 단위로 반올림), `_beginCast`(스킬 상태·휘두름 끊기·'skill' 켜짐 사건 — 5번째 필드의 [타격, 끝]은 클립 뒤로 민 시각), `_tickBegin`(유닛 공격 갱신 뒤, 클라 코루틴이 `SimulateTick`에서 이어지듯), `_startSkill`. `ai.js updateAlly`는 클립의 마지막 틱에도 공격을 시작하지 않는다.
- 시작 클립을 스스로 단계로 짠 키트는 `ownBegin`으로 엔진을 끈다: 첸 더 던스트릭 S3(`op-chen3.js`, 틱까지 맞춘 단계 — 위 「첸 S3」). 전에 키트가 따로 하던 우쿠시크 S1·안드레아나 S2·우요우 S2·오로라 S1/S2·바르카리스 S2는 엔진으로 옮겼다. 그 셋(우쿠시크·안드레아나·우요우)은 휘두름을 끊지 않았고, 우쿠시크·안드레아나는 지속 시간을 클립만큼 늘리지 않았다.
- 클립 동안 SP: 막대가 차 있어 회복할 것이 없다(충전이 여럿인 스킬은 다음 충전을 향해 계속 찬다 — 스킬 능력이 아직 시전 중이 아님). 전에는 시전 때 SP를 비우고 클립 동안 회복을 막았다(읽기 전의 가정) — 끝 상태는 같고, 막대 그림과 기절 때 SP가 달랐다.
- `OnBeforeSkillStart`의 다른 갈래(공식 클라에서 확인, 2026-11-11; 가상 슬롯 0x13 = `IsAvailable`, 0x38 = `CanCastCheckBeforeStart`, 0x42 = `PlayBeginEffectAndAudio`, 0x43 = `PlayBeginAnimation`):
  - `hasPlayedBeginAnim`이 참이면 아무것도 안 한다. 기반은 늘 거짓이고 `ToggleSkillWithEndAnimation`(토가와 사키코 S2 외 둘)만 덮어쓴다: 한 번 쓸 때 시작 클립을 튼 뒤 참, `UseSkill`·`OnSkillEnd`에서 거짓. 이 클래스는 켜진 동안 시작 클립 대신 `_endAnim`을 튼다(끄기 동작). 이 모드의 자동 조작은 켜진 토글을 다시 누르지 않으므로(`AutoChessBattleTrigger._CheckToggleSkill`) 두 갈래 모두 일어나지 않는다.
  - `IsAvailable` ∧ `CanCastCheckBeforeStart`가 아니면 클립 없이 바로 시작한다. `CastSkill`은 `_checkHasTargetBeforeDoCast`이고 `_trigger`가 있으면 그 대상 검사를 본다 — 풀에서 시작 클립이 있는 것은 데겐블레허 S3·리 S2뿐이고 둘 다 대상이 있을 때만 시전되므로 클립은 그대로 튼다.
  - 吟唱 스킬(`get_hasChant`: 루트의 `ChantBeforeSkill`)은 `PlayBeginAnimation` 대신 `ChantBeforeSkill.StartChant`를 띄운다: 그 행동의 시작·반복·끝 클립을 吟唱 시간(`m_totalDuration`) 안에 맞춰 틀고(클립 합이 더 길면 빠르게), 끝나면 吟唱 성공 처리 뒤 스킬을 시작한다. `_beginAnim`은 안 튼다. 풀에서는 안젤리나 더 멜로우 위시 S2 하나(`Skill_2_Takeoff_*`, 키트의 吟唱) — `skill_cast.py`가 吟唱 스킬에는 `begin`을 쓰지 않는다(2026-11-11 고침: 그 전날 시작 클립 `Skill_2_Begin` 1초를 吟唱 앞에 기다리게 했었다).
- 화면: 'skill' 켜짐 사건은 전처럼 시전 때 나가므로 렌더는 그때 시작 클립을 튼다. 스킬 버프의 이펙트는 이제 클립 뒤에 나온다.
- 확인: `test/skill-begin.test.js`(옛 코드에서 3건 모두 실패 확인; SP 두 줄은 2026-11-11 고친 뒤 옛 코드에서 2건 실패 확인).

## 규정 전략 (2026-11-11)

규정(`act3autochess`)의 전략 61개는 시즌 전용 `data/seasons/act3autochess/bands.json`으로 돈다. 처리기는 지난 시즌처럼 버프 키로 고른다(`content/bands/meta.js`·`bands/battle.js`). `node tools/season-coverage.mjs act3autochess`의 `bands` 줄이 키마다 처리 여부를 보여 준다(액티브 지령 말고는 모두 ok — 2026-11-12).

- **표의 새 모양**(`tools/build-data.mjs bandSeasonFields`): `bandType`(`GENERAL`·`BONDRELEVANT`), `relateBondIds`(표 `relateBondList`), `masterVictorCount`·`offseasonPriority`(판에는 안 씀), `skills` — 전략의 지령(指令) 단계를 `effectId`부터 잠금 해제 순서로: 스킬 종류(`PASSIVE`·`ACTIVE`·`NONE` = 잠김), 비용, `avail`(`ROUND_RESET`·`COOLDOWN`·`ALL_LIMIT`·`DEFAULT` + 횟수), 액티브의 대상(`target`), 그 단계 효과의 버프, `next`(다음 단계로 가는 조건 `unlockType` + 값, 마지막 단계는 null). 근거: 규정 표 `skillInfoDataDict` 74줄이 모두 어느 전략의 한 단계다. 지난 시즌 기록에는 이 필드가 없다(전과 같음).
- **맹약 전략**(`BONDRELEVANT` 17개): 문구가 맹약을 「【…】」로 써서 지난 시즌의 「<…>」 읽기(`shared/bandBonds.js`)가 못 잡던 넷(글래디아·쉐라·피구리노·쏜즈 더 로드스타)까지 표의 `relateBondList`를 `bondIds`에 넣는다 — 모드가 그 맹약을 끄면 전략 선택 화면에 本局禁用 안내가 뜨고 AI가 고르지 않는다. 선택 화면에 맹약 전략이 드는 조건은 지난 시즌과 같게 둔다(늘 나오고, 꺼진 맹약이면 안내만) [추정·화면: 규정 전략 선택에서 맹약 전략이 숨거나 회색이 되는지 공식 화면 미확인 — PRTS 규정 문서에도 없음(2026-11-11 확인)].
- **지령 단계**(`bands/meta.js bandStageIndex`): 플레이어의 현재 단계(카운터 `band:stage`, `skills`의 번호)의 효과만 돈다. 다음 단계 조건은 라운드(`band_skill_load_by_round`), 조달 센터 레벨(`…_by_shop_lv`), 그 판에 쓴 자금(`…_by_coin_cost`, 모든 지출 — `stats.gold`), 맹약의 활성 인원(`…_by_bond_act_count`, 「【伊比利亚】盟约激活人数达到4」). 그 전략의 준비 훅마다 먼저 조건을 보고 넘기므로 조건이 선 뒤 첫 훅(레벨 업·지출·라운드 시작·맹약 변화)에서 넘어가고 되돌아가지 않는다 [추정·화면: 공식 지령 칸이 단계를 바꾸는 순간 미확인]. 전투는 플레이어가 이른 단계의 버프를 돈다(전투 입력 `bandStage` — 0이면 안 실음, `bands/battle.js bandBattleBuffs`). 지금 전투 몫이 있는 패시브 단계는 모두 한 단계라 판은 그대로다.
- **와파린 집중 케어(`band_takecare`)**: 1·2·3단계(조달 센터 3·5레벨)에 +1·+2·+3층. 문구 「所属的**已激活**盟约层数」대로 활성 맹약만 받는다(지난 시즌 「所属盟约层数」는 활성 무관 — 단계 문구로 가름).
- **새 패시브**: 오다 전력 주조(`prep_start_random_equip_in_round`) — 3·6·9·12·14라운드 휴식 기간에 들어갈 때 조달 센터 레벨과 **같은** 티어의 상점 장비 하나. 리프레사 이중주(`promote_char_extra_award`) — 그 라운드 첫 승급(3장 합성)에 승급 보상 하나 더(효과로 정예가 되는 승화·박사 투영은 승급이 아니라 보상도 횟수도 없음 [추정·화면]). 나란투야 모래톱의 악몽(`gain_bond_cnt_shop_up_discount`) — [사르곤] 오퍼레이터를 얻을 때마다(구매·지급·합성 정예, 획득 한 번에 하나) 세고 3이 되면 지금 레벨의 레벨 업 비용 −3(0 밑으로 안 감), 레벨마다 한 번 — 이미 할인한 레벨에서 센 수는 다음 레벨로 넘어가 레벨 업 직후 적용 [추정·화면: 「{@tag}」 진행 표시 미확인]. 락락 자체 제작(`buy_bond_char_cnt_gain_equip`) — 판 전체에서 [빅토리아] 구매 3번째마다 티어 ≤ 조달 센터 레벨 장비 하나. 피구리노 맞춤 재단(`n_round_refresh_cnt_gain_coin`) — 라운드 첫 수동 갱신(무료 갱신 포함) 직후 자금 +1. 첸 장점 활용의 둘째 버프(`attr_common_global_buff`, `filter_autochess_golden`) — 정예 오퍼레이터 공격력 +16 %(직접 곱연산)·공격 속도 +16.
- **이름만 바뀐 키**: 무에나 `buy_bond_char_gain_coin`, 시우루스 `round_buy_bond_char_price`(`n` = 라운드에 싸게 사는 횟수 1), 샤마르 `sell_char_swap_shop_char`(전략 ID도 `band_substitute`), 페페 `shop_up_bond_refresh_once`는 지난 시즌 처리기 그대로(문구가 「被动效果」 말고 같음).
- **맹약 방향 바꾸기**(`auto_chess_effect_replace`, `content/bonds/dispatch.js swapBondRecord`): 전략 8개의 모든 단계에 `{ 맹약 효과: 다른 방향 }`이 있다 — 나란투야 사르곤 `_2` → 지난 시즌 방향, 쉐라 쉐라그 `_2` → 지난 시즌, 피구리노 시라쿠사·플레임테일 카시미어·왕 염국도 지난 시즌 방향으로, 락락 빅토리아 → `_2`, 글래디아 에기르 → `_2`. 어느 문구에도 없으니 전략을 든 것만으로 첫 라운드부터 걸린다고 본다. 그 플레이어의 전투는 다른 방향 효과의 전투 템플릿(그 기록의 수치; 지난 시즌 코드, 락락·글래디아의 `_2`는 규정 고유 템플릿 — 「규정 맹약」의 「빅토리아·에기르」)을 돈다 — 플레임테일이면 정비 구역 교대 후보도 싣지 않는다(`player/round.js`). 맹약의 준비 템플릿(층 보상)은 시즌 기록 것 그대로 [추정·서버: 층 보상은 서버 쪽이고, 지난 시즌 방향 쉐라그 효과 기록에는 보상 버프가 없지만 그 문구는 「每叠加100层获得1件谢拉格不融冰」]. 전투 템플릿이 없는 방향으로는 바꾸지 않는다 — 시즌 방향 그대로이고 커버리지 줄은 partial(2026-11-12부터 해당 없음: 빅토리아·에기르 `_2`도 씀).
- **왕(望) — 염의 가호 수**(2026-11-15, 플레이 제보 「왕 전략 선택 후 염국 1단계만 켜졌는데 염의 가호가 2마리」): 왕(`band_yan2`)이 바꾼 지난 시즌 방향 염국(`bondeffect_yan`)은 문구대로 6명에 '염의 가호'(`enemy_9012_acloon`) 하나, 9명에 둘(공격력 ×1.5, 받는 피해 ×0.1)이다. 규정 표의 그 효과는 소환 인원(`power_bond_char_cnt` 6·`ex_bond_char_cnt` 9)과 9명 수치를 하위 버프 `act1autochess_bond_eff_yan[spawn]`에 따로 둔다(지난 시즌 표는 한 버프). 설치기가 템플릿의 첫 버프만 읽어 인원 조건이 비었고, 3명부터 9명 단계로 둘이 나왔다(9명 배율도 빠짐). 하위 키 `[…]`는 부모 템플릿 것이므로 `bonds/shared.js templateBb`가 템플릿의 하위 키 버프까지 합쳐 읽는다 — 두 시즌의 맹약·효과 기록 중 여러 버프로 나뉜 전투 템플릿은 이것 말고 모두 이미 기록 전체를 읽음(2026-11-15 전수 확인), golden 변화 없음. 재발 방지: 원인 제거 — `templateBb`가 하위 키 버프를 읽음(`test/content/band-yan2-yanyou.test.js`가 3·6·9명 수를 봄).
- **액티브 지령 사용**(`g.bandSkill`, `server/match/match/bandSkill.js`): 지금 단계가 `ACTIVE`일 때 그 단계의 대상 하나로 쓴다 — 대상 없음(`NO_TARGET`, 「点击使用」), 내 오퍼레이터(`COMMON_CHESS` `CHAR` → `uid`, 전장 위·정비 구역 기물 — 공식 드래그 안내 「请指向战场或整备区的干员」(공식 화면으로 확인; 2026-11-08 관리자 잠정 결정과 같음)), 상점 칸(`SHOP_SLOT` `CHAR`·`EQUIP` → `slot`, 팔리지 않은 그 종류 칸), 내 전장의 칸(`MAP_TILE` → `row`·`col`, 보드 좌표: `PASSABLE`은 전장 표의 `groundPassable` 칸 중 적의 붉은·푸른 문(`tile_start`·`tile_end`)이 아닌 칸 — 공식 녹화에서 님프 「溃心领域」가 문 칸을 못 고름(upstream PR #951, 녹화는 그 PR이 가리킨 upstream PR #940 댓글), `PASSABLE_AND_BUILDABLE`은 거기에 `buildable`이 있고 기물이 없는 칸 — 관리자의 잠정 「지상 타일」(2026-11-08)). 단계가 묻지 않는 대상 필드는 거절. 쓰기 전에 단계를 먼저 올린다(`bandStageIndex`) — 잠긴 단계(`NONE`)는 거절. 비용은 `cost` + 카운터 `band:skill:cost`(비용 키 `skill_cost_*`가 쓸 자리), 효과가 선 뒤에 내고 지출로 센다(`onSpend` — 「最佳品味」(`band_rich`)처럼 쓴 자금으로 오르는 단계에 듦). 횟수: `ROUND_RESET` N은 라운드마다 N번, `ALL_LIMIT` N은 판에 N번, `COOLDOWN` N은 쓴 라운드 r에서 r + N 라운드에 다시 씀(처리기가 바꿀 수 있음 — 사모펀드 `band_fund` 「冷却回合数等同于获得资金」), `DEFAULT`는 제한 없음. `unusableAtSpecialRecruit` 단계는 보상 고르기가 상점 줄을 차지한 동안 거절(공식 클라에서 확인된 `isSpecialRecruit` — 같은 표시가 갱신·동결을 막는다). 효과는 그 전략 단계 처리기의 훅 `onBandSkill`(거절이면 바꾸기 전에 `ev.error`, 해냈으면 `ev.handled`), 쓴 뒤 `onBandSkillUsed`. 처리기가 없는 지령은 아무것도 바꾸지 않고 거절된다 — 지령 31개 모두 처리기가 있다(2026-11-12). 들어간 효과: 저스틴(`band_fund`) 「私募基金」(사모펀드, `skill_gain_gold_cd_by_gold {mingold 1, maxgold 6}`) — 쓰면 자금 1–6을 곧바로 얻고 얻은 만큼 라운드 쿨 [추정·서버: 1–6 고르게 굴림]. 클릭 지령 나머지(`content/bands/meta.js`, 2026-11-11):
  - **상점 오퍼레이터 가져오기**: 스와이어 디 엘리건트 위트(`band_rich`) 「最佳品味」(`skill_take_shop_char`)는 상점 오퍼레이터 카드 `count`장(1단계 1·2단계 2)을 무작위로, 바이슨(`band_closeout`) 「打包速递」(`skill_gain_all_shop_char`)는 상점 오퍼레이터 카드 전부를 공짜로 얻는다. 가져온 칸은 빈다(마츠키리 `band_makiri`와 같게). 보이는 카드라 구매처럼 남은 사본이 없어도 가져온다.
  - **맹약 오퍼레이터**(`skill_gain_bond_char`): 플레임테일(`band_kazimier`)·글래디아(`band_egir`)·`band_lethania`·지마 더 레이징 타이드(`band_ursus`) — 그 맹약 오퍼레이터 `count`명, 조달 센터 레벨 이하에서 공용 풀로(사본 가중, 상점과 같게).
  - **비용 키**(카운터 `band:skill:cost`, 비용은 0 밑으로 안 내려감): `skill_cost_round_grow_reset_on_use`(바이슨·플레임테일) 휴식 기간 끝마다 −`delta`, 쓰면 표의 비용으로. `skill_cost_grow_per_use`(`band_lethania`) 쓸 때마다 영구 +`count`. `skill_cost_reduce_on_buy_bond`(지마 더 레이징 타이드) 상점에서 우르수스 오퍼레이터를 살 때마다 −1(선물·지령으로 얻은 것은 구매가 아님), 쓰면 표의 비용으로.
  - **장비 할인**: `band_price` 「内部货源」(`skill_next_equip_buy_discount`) — 다음에 사는 장비 하나의 값 −1(0까지). 쓰지 않은 할인은 다음 라운드에도 남고, 여러 번 쓰면 장비 여러 개로 쌓인다 [추정·CN: 문구는 「下一件」뿐].
  - **새로 고침 셋**: `band_support` 「人才锁定」(`skill_refresh_shop_high_tier`)은 조달 센터 레벨 + `lv_up`(최대 6)단계 오퍼레이터를 1장 이상, 두요야(`band_yan`) 「广交豪杰」(인재 교류, `skill_refresh_shop_bond_char`)는 염국 오퍼레이터를 1장 이상(조달 센터 레벨 이하, 풀에 있을 때 — 지난 시즌 두요야 패시브와 같은 규칙), `band_high` 「专享情报」(`skill_refresh_shop_board_char`)는 오퍼레이터 카드를 모두 전장 위 오퍼레이터로(사본이 남는 동안) [추정·CN: 단계 제한 없음 — 문구는 배치한 오퍼레이터만 말함]. 셋 다 값 없는 수동 새로 고침이다(`PlayerState.effectRefresh`: 동결이 풀리고, 새로 고침 횟수와 `onRefresh`로 센다; 정한 카드는 `onRefresh` 전에 써 넣음) [추정·CN: 지령의 새로 고침이 특질·전략이 세는 「主动刷新」인지].
  - 메커니스트(`band_equipment`) 「精巧设计」(`skill_change_shop_equip`): 상점의 첫 장비 칸(팔렸어도)을 상점 뽑기의 다른 장비로 [추정·CN: 장비 칸이 둘일 때 어느 칸인지].
  - 산크타 믹사파라토(`band_protect`) 「献身护卫」(`skill_drop_hp_to_low_gain_coin`): 내 목표 HP를 가장 낮은 다른 플레이어의 것과 같게 내리고 잃은 만큼 자금(최대 `max_count` 10)을 얻으며, 그 휴식 기간 끝에 그 플레이어가 내가 잃은 만큼 회복한다. 더 낮은 플레이어가 없을 때, 동맹이 목표 HP 하나를 함께 쓰는 동안(최종 공세, 커스텀 「共享」)은 거절 [추정·CN: 「等额」 = 잃은 목표 HP(자금 상한이 아님), 동률이면 앞 자리].
  - **드래그 지령 — 정비 쪽**(「拖拽使用」, `content/bands/meta.js`, 2026-11-11): 내 오퍼레이터(전장 위·정비 구역)나 상점 오퍼레이터 카드 하나에 쓴다.
    - 왕(`band_yan2`) 「黑白相易」(`skill_remove_gain_bond_char` `in_shop 0`, 비용 1): 그 오퍼레이터를 없애고(판매 아님 — 자금·`onSold` 없음, 장비는 정비 구역으로, 사본은 풀로) 그 단계 이하 염국 오퍼레이터 하나를 얻는다(사본 가중, 정예는 자기 단계). 쏜즈 더 로드스타(`band_iberia`) 「出航时刻」(`in_shop 1`): 상점 카드를 그 카드 단계 이하 이베리아 오퍼레이터로 바꾼다(동결은 그대로).
    - 카제마루(`band_transfer`) 「纸片替身」(`skill_transform_char_same_tier`): 상점 카드를 같은 단계의 다른 오퍼레이터로(그 단계에 다른 오퍼레이터가 풀에 없으면 거절).
    - `band_jenga` 「条文修正」(`skill_act_bond_grow_garr_cnt`, 4라운드에 열림): 그 오퍼레이터가 세는 맹약(자기 맹약 + 장비가 주는 맹약) 중 활성인 것마다 `initial_count` 9층. 활성 맹약이 없으면 거절 [추정·CN: `delta_count`·`n`·`max_count`는 앞선 사용 `n`번마다 +`delta_count`, 최대 `max_count`로 읽음 — 표 값(0·1·9)으로는 늘 9].
    - `band_prepfin` 「强制休整」(`skill_garr_event_extra_exec`): 이번 휴식 기간 끝에 그 오퍼레이터의 `<休整期结束时>` 특질(`SERVER_PREP_FIN`)이 `count`번 더 돈다. 그 자리에서 돌 특질이 없으면 거절(전장 위에서만 도는 특질 `character_target_inboard`를 가진 정비 구역 기물) [추정·CN: 더 도는 차례는 전략 차례 — 디스패치 순서 band → 맹약 → 특질이라 특질 자신의 차례보다 먼저; 휴식 기간 끝 전에 팔리거나 합쳐지면 사라짐].
    - 스즈란(`band_gain`) 「御守之力」(수호의 힘, `skill_trigger_garr_event`): 그 오퍼레이터의 `<获得时>` 특질(`SERVER_GAIN`)을 지금 돌린다(`ctx.triggerGarrisons`, 투자자의 배수도 그대로). 없으면 거절.
    - 시(`band_copy`) 「幻画为真」(`skill_copy_char_with_equip`, 판에 1번): 그 오퍼레이터의 사본(정예면 정예, 재고를 넘어서도)을 다른 획득처럼 얻고, 장비마다 사본을 얻어 장착 효과 없이 끼운다 — 지난 시즌 복제 장치(`trap_copy_front_char`)와 같은 규칙 [추정·CN: 장비 사본도 공용 장비 재고를 씀; 합칠 수 있는 장비는 원래 것과 만나 다른 획득처럼 진급 장비가 되고 사본이 그것을 낀다].
    - 뮤엘시스(`band_upgrade`) 「至纯凝结」(순수한 결정, `skill_upgrade_char`, 판에 1번): 그 자리에서 정예로(`PlayerState.promote`, 승화처럼 — 합치기가 아니라 진급 보상 고르기 없음). 정예는 거절 [추정·CN: 이 「晋升」에 합치기 보상이 붙는지].
    - `band_sell` 「东之极道」(`skill_sell_char_bond_layer`): 판매 의도처럼 판다(판매가·`onSold`), 그 뒤 활성인 맹약마다 그 오퍼레이터 단계만큼 층 [추정·CN: 판 뒤의 활성 맹약 — 판매로 꺼진 맹약은 못 받음].
    - 퀸투스(`band_mess`) 「不稳定要素」(불안요소, `skill_transform_char_up_tier`, 4라운드에 열림): 돌연변이 세포의 변신(`PlayerState.transformChess`) — 그 오퍼레이터를 없애고 단계 min(6, 단계 + 1)의 무작위 일반 오퍼레이터를 정비 구역으로 얻는다 [추정·CN: 돌연변이 세포처럼 — 정예도 일반이 되고 칸은 빈다].
    - 시험 `test/content/band_skill_drag_act3.test.js` 9건.
  - **드래그 지령 — 다음 전투(표식)**(`content/bands/meta.js addMark` → `player/round.js battleInput` → `content/bands/battle.js`, 2026-11-12): 쓰면 그 라운드의 표식이 남는다 — 플레이어의 숨은 효과 `effect:band_mark`(`data` `{ round, effectId, uid | itemId, capAdd? }`), 다음 라운드 시작에 지워져 전투 한 번만. 그 라운드 전투(일반·보스)의 입력이 `bandMarks`로 싣는다. 표식 오퍼레이터가 전투 시작 때 전장에 없으면(팔림·합쳐짐·정비 구역) 아무것도 없다 [추정·CN]. 연합 방어(联防) 전장은 「다음 전투」가 아니라고 보고 싣지 않는다 [추정·CN]. 효과는 표식 효과의 버프 템플릿대로(규정 표 `buff_template_data` — 공식 클라의 템플릿; 그 버프가 표식 오퍼레이터에 걸린다는 것(`skill_target_chess`)만 CN 클래스라 [추정·CN]):
    - 가비알 디 인빈서블(`band_survive`) 「意志鼓舞」(`skill_mark_char_inst_tag` → `eff_band12`, `act3autochess_band12_buff`): 전투 시작(`ON_AUTO_CHESS_MODE_CHANGED`, `start_dead`)에 쓰러졌다가 그 자리에 곧바로 다시 선다(`[kill]` → `RebuildCharacterOnTileInRange`). 그 쓰러짐은 부활을 쓰지 않는다(`reborn_mask` 1 — 이 포크: 다른 `reviveNow`(에르망가르드·장비)가 가져가지 않음, `被击倒时` 효과는 돌고, 다른 `death` 처리기가 모두 돈 뒤 다시 배치 — `部署时` 효과, SP 초기화). 그 뒤 쓰러짐 `max_respawn_cnt`(2)번은 에르망가르드(`act1autochess_band28_buff`)와 같은 그래프로 그 자리에서 곧바로·무료로 부활(오퍼레이터마다 셈). [추정·CN: 시작 쓰러짐도 결과의 쓰러짐 수에 듦]
    - `band_evolve` 「全场聚焦」(`eff_band14`, `auto_chess_battle_chess_upgrade`, 비용 1, 표 `cond` "gold"): 그 오퍼레이터가 다음 전투에 정예로 싸운다 — 전투 입력이 정예 기물 ID로 싣고(로드아웃·장비 칸도 정예 것), 기물 자체는 그대로. 정예이거나 정예가 없는 오퍼레이터는 거절 [추정·CN: `cond` "gold"의 읽기].
    - 멀베리(`band_shield`) 「药枚实验」(약용 재갈 실험, 1단계 `eff_band17` 20 %·7라운드부터 2단계 `eff_band18` 35 %): 패시브 멀베리 전략과 같은 템플릿(`act1autochess_band17_buff`)이 표식 오퍼레이터에만 — `[self]`가 0.1초 뒤 플레이어의 유닛들에 `[check]`를 걸어 **더 오른쪽 열에 그 플레이어 유닛이 있으면 `[core]`가 빠진다**. 그래서 문구에 없지만 맨 앞 열일 때만 공격마다 확률로 보호막 1층(최대 1). 나중에 다시 배치되면 다시 판정.
    - Misery(`band_breakaway`) 「消解空间」(`eff_band22`, `act3autochess_band22_buff`): 피해를 받을 때(`ON_TAKE_DAMAGE`, 원소 손상 제외) 정비 구역에 오퍼레이터가 있으면(`AutoChessCheckSwitchWithHand` RIGHT·ORIGINAL — 직군·맹약 거름 없음) 쓰러지고(`InstantKill`, `reborn_mask` −1: 부활 없음) 정비 구역 **맨 오른쪽** 오퍼레이터가 그 칸에 같은 방향으로 들어온다(교대 특질과 같게 몸 없이 빠짐, `garrisons/effects/switch.js`). 정비 구역이 비었으면 아무것도 없고 다음 피해에 다시 본다. 표식이 전장 오퍼레이터에 있으면 전투 입력이 정비 구역 오퍼레이터를 모두 `reserve`로 싣는다.
    - 坚雷(`band_limit`) 「正直教官」(`skill_layer_limit_grow_round`): 다음 전투에서 그 오퍼레이터 특질의 판당 상한 + 쓴 라운드 수(`garrisons/effects/triggered.js addCapMod` → `capOf`).
    - `band_pudd` 「电气化！」(`skill_mark_shop_equip_tag` → `eff_band24` `auto_chess_battle_give_all_equip`, 비용 1, 보상 고르기 중 불가): 상점 장비 카드가 곧바로 사라지고(칸이 빔 — 사지 않은 카드라 재고는 그대로), 다음 전투 입력이 그 장비를 빈 칸이 있는(`gamedata equipSlotsOf`, 정예화한 기물이면 그 칸 수) 모든 전장 오퍼레이터에 더한다 — 전투가 끝나면 없음. 장착 때 사라지는 장비(`consume_on_equip…`, 「装备时销毁」)·장비가 아닌 것은 거절 [추정·CN: 같은 장비를 이미 낀 오퍼레이터도 받음; 맹약을 주는 장비라도 맹약 수는 정비 때 그대로].
    - 시험 `test/content/band_skill_marks_act3.test.js` 8건(변이 10개 — 잠금·맨 오른쪽·열 판정·빈 칸·정예화·지우기·상한·후보 없음·정예 거절·장착 소멸 거절 — 를 하나씩 넣어 모두 실패 확인).
  - **드래그 지령 — 지형 칸**(`MAP_TILE`, `content/bands/meta.js` → `content/bands/battle.js`, 2026-11-12): 칸 고르기는 위 「액티브 지령 사용」대로(보드 좌표, 전투가 기물처럼 자기 전장 칸으로 옮김 — `Battle.mapTile`).
    - 님프(`band_dance`) 「溃心领域」(`skill_mark_pos_grow_use_cnt` → `eff_band19`, 비용 0, 라운드마다 1번 — 4·8·12라운드에 단계가 올라 2·3·4번): 그 라운드 칸 표식(`effect:band_mark`의 `row`·`col`)을 남기고 그 라운드 전투가 `act3autochess_band19_buff`를 돈다. 공식 클라의 전역 버프 프리팹(`[uc]globalbuffs.ab` `act3autochess_band19_buff`, 공식 클라에서 확인: `targetSide` 2 = 적, `targetMotion` 3 = 지상·비행)이 적마다 템플릿을 주고, 템플릿은 `ON_OWNER_ROOT_TILE_CHANGED`에서 그 적의 위치를 표식 칸과 맞춰 보고(`AutoChessCheckPosition`) 자기 `triggered`가 0일 때만 `fear`를 주고 1로 둔다 — 그래서 **적마다 한 번**, 그 적의 칸이 처음 표식 칸이 될 때 공포 `fear`(3)초. 이 포크: 매 틱 이동 뒤 적의 칸(반올림 위치)을 보고, 적이 처음 보인 칸은 바뀜으로 안 센다 [추정·엔진: 클라의 첫 칸]; 공포는 출처 없이 건다(전역 버프의 출처) — 출처 없는 공포는 자기 칸 안에서 맴돈다(`sim/fear.js`) [추정·CN: 버프의 출처]. 같은 칸에 두 번 써도 거절하지 않는다 [추정·CN]. 칸 판정은 서버(`_bandSkillTile`, AI 托管도 이것으로 후보를 고름)와 드래그 강조(`gameLogic/placement.js bandSkillTiles`)가 같은 `shared/bandSkillTile.js`를 읽는다. 재발 방지: `test/content/band_skill_tiles_act3.test.js`(모든 전장의 문 칸 거절, 드래그 강조 = 서버 판정).
    - `band_treasure` 「宝藏探机」(`skill_add_pos_effect_enemy` `{ coin 1, enemy_id enemy_9038_achest }`, 비용 1, 3라운드 쿨, 대상 `PASSABLE_AND_BUILDABLE`): 그 칸에 「모의 보물」(`enemy_9038_achest`)을 둔다. 적 기록의 줄이 보물이 무엇인지 말한다 — 「友方单位」, 「只能部署在可通行地面，并使所在格无法部署」, 「被敌人触碰后永久消失」, 「战斗结束后提供1资金」 — 그리고 CN 프리팹(`enm_pfb_37.ab`)이 방식을: `achest[tile_buildable]`이 살아 있는 동안 그 칸을 배치 불가로 바꾸고, 반경 0.5 `AuraAbility`(대상 지상 적만, `targetMotion` 1)의 `achest[aura_enemy]`가 적이 들어오는 순간 보물을 없앤다(`InstantKill` `_killSource`·`_skipReborn`), `achest[unmovable]`은 `UNMOVABLE`·`HEAL_FREE`·`ALLY_TARGET_FREE`. 이 포크: 쓰면 플레이어의 숨은 효과 `effect:band_chest`(`data` `{ row, col, enemyId, coin }`)가 남고 **닿힐 때까지 판에서 판으로 남는다** — 그동안 그 칸에 기물을 둘 수 없고(`Match.deployMapFor`), 두 번째 보물도 못 둔다. 그 라운드 자기 전투(일반·보스)마다 입력 `bandChests`로 실려 그 칸에 공격 없는 아군 쪽 장치(`kind 'device'` — 적도 아군도 고르지 않음, 체력은 적 기록의 100)로 선다. 지상 적(숨지 않은)이 중심 0.5 안에 들면 사라진다 [추정·엔진: 적 충돌체 반경은 더하지 않음]. 전투가 끝날 때 서 있으면 자금 `coin`(`Battle.addCoins` — 현상금처럼 다음 정비에), 사라졌으면 결과의 `bandChestsGone`에 들고 정산(`onBattleResult`)이 효과를 지운다. 클라에서 돈 전투의 결과는 그 플레이어의 보물만·보물 수만큼의 자금만 받는다(`server/match/fields.js validateClientResult`). [추정·CN: 판에서 판으로 남는다는 것은 「永久消失」과 배치 불가 칸에서 읽음; 연합 방어 전투에는 안 나옴(표식과 같게); 보스 전장에서 그 칸이 지상 통로가 아니면 그 판만 빠짐]
    - 시험 `test/content/band_skill_tiles_act3.test.js` 7건(실제 판 한 라운드 — 보물이 길 위 칸이라 닿혀 지워짐 — 포함). 변이 19개 중 17개가 실패(남은 둘은 위의 엔진 추정: 첫 칸을 바뀜으로 셈, 보스 전장의 통로 검사 없앰).
  - **AI 팀원**(`server/match/bot.js useBandSkill`, 2026-11-12) [추정·자료 없음: 공식 봇이 없다 — 단순 규칙]: 정비 시작에 구매 전에 두 번 — 상점 쪽 지령(상점 카드를 더하거나 바꾸는 것, 자금을 주는 것, 「电气化！」은 상점에서 단계가 가장 높은 장비 카드), 그다음 오퍼레이터·칸 지령(지난 라운드 보드에서: 표식·「正直教官」·「条文修正」·「幻画为真」은 가장 강한 전장 오퍼레이터(봇의 기물 가치), 「全场聚焦」·「至纯凝结」은 정예가 될 수 있는 가장 강한 것, 「药枚实验」은 맨 앞 열, 「消解空间」은 정비 구역에 오퍼레이터가 있을 때 가장 약한 것, 「东之极道」(활성 맹약이 있을 때)·「不稳定要素」(6단계 미만)·「黑白相易」은 정비 구역의 가장 약한 것, 「溃心领域」은 기물을 둘 수 없는 길 칸의 앞쪽부터 라운드 횟수 모두, 「宝藏探机」은 남는 배치 칸이 둘 넘을 때 가장 뒤 열). 후보를 순서대로 써 보고 처리기가 받는 첫 것이 쓰임이다(거절은 비용 없음). 비용이 있으면 자금의 절반까지만, 상점 쪽 지령과 횟수 제한 없는 지령(`DEFAULT`)은 정비에 한 번(두 번째 새로 고침은 구매 전에 첫 번째가 가져온 카드를 버림), 오퍼레이터·칸 지령은 라운드 횟수만큼. 「献身护卫」(내 목표 HP를 깎음)·「出航时刻」·「纸片替身」(상점 카드 바꾸기 — 값 판단이 없음)은 쓰지 않는다. 시험 `test/match/bot-band-skill.test.js` 6건.
  - 공통 [추정·CN: 문구는 효과만 말함]: 할 것이 없는 지령(상점에 오퍼레이터 카드·장비 칸이 없음, 그 맹약 오퍼레이터가 풀에 없음)은 거절하고 비용을 받지 않는다. 지령으로 얻은 오퍼레이터는 다른 획득처럼 정비 구역, 차면 넘침으로 간다 — 정비 구역이 차도 거절하지 않는다.
  - 플레이어 보기 `m.private.bandSkill`: 단계·비용·남은 횟수·쿨·쓸 수 있는지(`usable`, 막힌 까닭 `blocked`), 이번 라운드 표식(`marks` `[{ effectId, uid | itemId | row, col }]` — 표식 이펙트 `skill_target_effect`·칸 이펙트 `effect`를 그릴 자리), 보드에 서 있는 「모의 보물」(`chests` `[{ row, col, enemyId }]`). [추정·CN: 지령 클래스(`AutoChessPlayerSkillStatus`·`AutoChessBattleSceneUsePlayerSkillUp`)는 CN 클라에만 있다 — 준비 단계에만, 준비 완료 뒤엔 안 됨, 쿨이 라운드 시작마다 하나씩 줄어 r + N에 풀림, 임시 정비 구역 기물은 대상 아님은 모두 이 포크의 읽기].
- **지령 바꾸기**(更换指令, 2026-11-12, `server/match/match/bandSkill.js offerBandSkillChoice`·`setBandCommand`): 표의 선택 사건 `skill_change_1`·`skill_change_2`(`choiceType SKILL_CHANGE`, `effectType BAND_SKILL`, 이름 「更换指令」). '추종자들'(`band_random`)의 패시브 「의뢰가 잔뜩!」(`gain_band_skill_from_pool_in_prep` `{ choice_event: skill_change_2 }`) — 휴식 기간에 들어갈 때마다(`onPrepStart`) 지령 2개 중 하나 — 과 장비 투기 주사위(`chess_item_5_06_e`, `equip_destory_skill_pool` `{ choice_event: skill_change_1 }`, 「装备时销毁，从3个指令中选择1个替换当前指令」 — 장착하면 파기되고 지령 3개 중 하나)가 연다. 몇 개인지는 문구의 「从N个」(블랙보드에 없음).
  - **고르기**: 교편(教鞭)의 개인 선택과 같은 자리(`ps.personalChoice`, `kind` `bandSkill`) — 그 플레이어의 `m.private`에만, `g.choice { idx, choiceId }`로 고르고, 열린 동안 준비 완료가 거절되며, 휴식 기간 마감은 무작위로, AI 팀원은 아래 규칙으로 고른다. 다른 개인 선택이 열려 있거나 풀이 비면 열리지 않는다 — 투기 주사위는 그때 장착이 거절되고 제자리에 남는다. 카드(`bandCommandCard`)는 그 지령의 전략·지금 받으면 될 단계의 이름과 문구.
  - **풀·바뀌는 것**: 표에 풀이 없어 서버가 뽑는다. ① 풀에는 패시브 지령도 든다(관리자 결정 2026-11-15 — 공식 스크린샷 9장: 「의뢰가 잔뜩!」 고르기에 나온 지령 13종 중 8종이 표의 `PASSIVE` 단계 — 이중주·일치단결·집중 케어·긴급 파견·집단 행동·설원의 선물·숭고한 희생·장점 활용, upstream PR #940 댓글; 2026-11-12의 「액티브만」을 바꿈): 이 모드가 내는 전략(`gd.bandIds`, `inactiveModeIds` 빠짐) 중 지령(`skills`)이 있는 것 모두, '추종자들' 자신과 지금 지령은 빠짐, 서로 다른 것을 메타 난수로 뽑는다. [추정·서버] 더 할 것이 없는 패시브 지령은 빠진다(`content/bands/meta.js commandStageActs`): 빈 것(골리앗 「금성철벽」 — 효과가 시작 목표 생명이라 정비·전투 버프가 없음)과 정해진 라운드 선물뿐인데 그 라운드가 다 지난 것(제시카·팽·오다·리·유넥티스·'다마즈티'…의 `round` — 고르기는 그 라운드 수입·라운드 시작·휴식 기간 시작 뒤에 열리므로 지금 라운드 것도 지남; 놓친 일회 보상은 늦게 주지 않는다). 팀에 하나만 도는 것(Touch 「외근 의료」, 덕로드 「'신비한 고객'」 — `TEAM_UNIQUE_KEYS`)은 살아 있는 팀원이 전략이나 받은 지령으로 이미 가지면 나오지 않는다 — 둘째 것은 더하는 것이 없다(관리자 결정 2026-11-15, upstream PR #952와 같게) [추정·서버]. ② 바뀌는 것은 지령 칸뿐: 자기 전략의 패시브 몫(「의뢰가 잔뜩!」 자체, 메커니스트 정교한 설계의 패시브, 맹약 방향 바꾸기)은 그대로 돈다(관리자 결정 2026-11-12) — 패시브 전략이면 자기 전략 전체. 그래서 액티브 단계가 있는 전략의 버프를 둘로 나눈다 — `onBandSkill`·`onBandSkillUsed`가 있는 처리기(효과와 비용 키)가 지령 몫(`band:<id>#command`), 나머지가 패시브 몫(`band:<id>#passive`); 패시브 전략은 전체가 지령 몫(`band:<id>#command`, '추종자들'은 없음). 지령을 받은 플레이어의 디스패치는 자기 전략의 패시브 몫(패시브 전략이면 전체) 다음에 받은 지령 몫을 그 전략의 것으로 돌린다(`effectsMeta.js`, 그 지령의 모든 훅 — 「内部货源」의 값 깎기도). 받은 패시브 지령은 그 전략처럼 돈다: 준비 훅 전부, 전투 버프(전투 입력 `bandCommand`·`bandCommandStage` → `content/bands/battle.js install`이 자기 전략 다음에 — 아미야·엠퍼러·칼라이샤·이올레타 로시·첸·클레멘티아), 팀 몫(Touch의 예비 의료 오퍼레이터는 `contentInfo.matchBands`·`prepMapChars`, 덕로드는 `commandBandId`로 팀원도 봄), 캔낫 「복리이자」의 남은 자금 이어받기(`player/round.js endPrep`·봇 `fundsReserve`). 맹약 방향 바꾸기(변약, `auto_chess_effect_replace` — 나란투야·락락·쉐라·피구리노)는 그 전략 주인 것만이라 받은 지령에는 없다 [추정·서버]. 액티브 지령의 전투 효과는 표식·보물로 따로 실린다(바꾼 뒤에도 남음). ③ 받은 지령의 단계는 판의 진행으로(라운드·쓴 자금·조달 센터 레벨·맹약 인원 — 처음부터 가졌던 것처럼, 카운터 `band:cmd:stage`에 0부터 `bandStageIndex`) — 자기 전략의 단계(와파린)는 그대로. 받은 지령의 사용 횟수·쿨·비용 변화는 새로 시작한다 [추정·서버]. 자기 전략의 지령을 다시 받으면 자기 것으로 돌아간다. 플레이어 보기 `m.private.bandSkill.commandBandId`(받은 지령의 전략, 자기 것이면 null) — 받은 지령이 패시브면 쓰기 버튼 없는 패시브 칸(`blocked` 'passive', 자기 패시브 전략과 같은 꼴)이고, 맹약 방향(`bondSwaps`)은 자기 전략 것. 고르기 카드의 패시브 지령은 비용 칸이 없다(`cost` null).
  - **AI 팀원**(`bot.js botPickBandCommand`) [추정·자료 없음]: 아래 「AI 팀원」 규칙이 쓰는 지령의 첫 카드(카드는 이미 섞여 옴), 없으면 첫 카드. 정비 시작에 고른 뒤 같은 정비에 쓴다.
  - 시험 `test/content/band_skill_change_act3.test.js` 17건(2026-11-12 변이 12개, 2026-11-15 패시브 지령 변이 16개 — 팀 유일 효과 거르기 둘(전략·받은 지령),액티브만 풀·더 할 것 없는 것 거르기·패시브 지령 키·자기 패시브 몫 나눔·캔낫 자금·전투 입력·전투 설치·팀 matchBands·덕로드·준비 화면 Touch·변약·카드 비용·패시브 칸 보기·'추종자들' 거절 — 를 하나씩 넣어 모두 실패 확인; 실제 판 경로 `buildBattleSpec → createBattleFromSpec`로 받은 첸 「장점 활용」 1건). 화면은 교편 고르기 창을 그대로 써 제목이 교편 것이다 — 지령 바꾸기 화면은 묶음 ui-I.
- 메커니스트 정교한 설계의 패시브 몫은 아래 「규정 장비」.
- 확인: `test/content/bands_act3.test.js`(「已激活」 줄을 되돌리면 와파린, 바꾸기를 끄면 방향 두 건이 실패하는 것 확인), `test/content/bands.test.js`(지난 시즌 그대로).

## 규정 장비 — 정비 쪽 (2026-11-11)

규정(`act3autochess`)의 장비 116개(`data/seasons/act3autochess/items.json`) 가운데 정비 쪽 규칙. 처리기는 버프 키로 고른다(`content/items/meta.js`, 지난 시즌과 같은 뜻으로 이름만 바뀐 키는 `items/aliases.js`). `node tools/season-coverage.mjs act3autochess`의 `items` 줄 중 `prep`은 모두 처리된다(투기 주사위 `equip_destory_skill_pool`은 위 「규정 전략」 「지령 바꾸기」, 2026-11-12). 전투 쪽 장비 효과와 특질은 묶음 sim-N의 다음 줄.

- **조합(组合)**(표 `trapChessDataDict`의 새 필드 `canFuse`·`fuseWith`·`fuseResult` → 기록의 `fuseWith`·`fuseResult`, `player/acquire.js _fuseItem`): 다섯 쌍 — 페가수스의 랜스 + 페가수스의 투구 → 「天马之耀」(`chess_item_6_12_e`), 「驱逐者警棍」 + 「驱逐者瓦斯」 → 「驱逐者防暴装备」(`6_05`), 「不退者之盾」 + 「不退者力场」 → 「不退者卫护系统」(`6_06`), 「动能加速器」 + 「动能单手弩」 → 「动能轰击弩」(`6_08`), 「汲取者之喙」 + 「汲取者之心」 → 「汲取者之镰」(`6_10`)(새 장비라 공식 한국어 이름 없음). 문구 「若与…同时持有则组合为…」. 둘을 함께 **가지면**(손·임시 칸·장착 어디든) 곧바로 결과 하나가 되어 정비 구역으로 가고, 장착돼 있던 쪽은 내려온다 — 같은 장비 2개의 진급 합성과 같은 꼴(PRTS 卫戍协议/帮助 「已拥有2件同一初始装备时…自动合并…发送至手牌区」). 결과는 두 부품이 쥐던 공유 재고 몫을 그대로 쥔다(진급 합성과 같음). 휴식 기간 끝에 받은 부품(`deferMerge`)은 진급 합성처럼 다음 준비 시작에 합친다. 조합은 진급 합성 수(「装备合并进阶」, `stats.itemMerges`)에는 안 들지만 메커니스트 정교한 설계 보상에는 든다(관리자 결정 2026-11-15 — upstream 관리자의 공식 시험판, upstream c5bf6c17·PR #944; 진급 합성과 같은 라운드 한 번) [추정·화면: 「持有」를 「가짐」으로 읽음(관리자 결정 2026-11-11, 잠정 — 공식 화면을 볼 때까지) — 정기 예금 통장의 「持有时每回合+1」이 손에 든 장비를 뜻하는 것과 같게. 한 오퍼레이터가 둘을 함께 장착할 때만 합쳐지는지는 PRTS(2026-11-11 확인)·CN 장비 칸 프리팹(`act3autochess_equip_slot_panel` — 좌우 2칸·가득 참 표시뿐)에 없음, 공식 화면 필요].
- **장비 칸**(표 `charChessDataDict.equipSlotNum` → 기물 기록 `equipSlots`, `gamedata equipSlotsOf`): 규정은 기물마다 칸 수를 적는다 — 308명이 2, 레이지 아이언하이드(`chess_char_5_22`)가 일반 4·정예 6. 칸이 다 차면 하나를 골라 파기하고 바꾸는 규칙은 그대로(CN 프리팹 `equip_multi_slot_replace_dialog` 「装备已满 / 是否选择已穿戴装备销毁并替换」). 화면의 교체 창도 그 기물의 칸 수로 연다(`public/js/ui/gameLogic/placement.js equipReplaces`). 지난 시즌 기록엔 이 필드가 없어 모두 2(`equipPerChess`). 화면은 그 칸 수만큼 그린다 — 정비 중 장비 바·끌기 팝업·교체 창·상세 카드(`rules/ui.md` 「장비 바 (정비 중)」, `rules/render.md` 「장비 장착 팝업」).
- **장착 때 파기되는 새 장비**: 연구 04에 항목이 없는 새 장비는 표의 `trapDuration` 0을 「装备时销毁」로 읽어 `kind: consume_on_equip`(정기 예금 통장 `3_15`·일회용 할인권 `4_15`·투기 주사위 `5_06`·인사부 기록 `5_09`·짐승 저금통 `3_11` — 모두 공식 한국어 이름 없음; 문구가 모두 「装备时销毁」). 처리기가 없는 장비는 장착이 거절되고 칸을 차지하지 않는다.
- **새 정비 키**(같은 장비라도 뜻이 바뀐 것): 간이 통신기 `equip_destory_first_bond_char` — 대상의 **첫 맹약**(기물 기록 `bonds[0]`) 오퍼레이터 하나(티어 ≤ 조달 센터 레벨), 그런 오퍼레이터가 공용 풀에 없으면 **대상 오퍼레이터 자신**(일반 등급) 하나, 진급판은 둘(관리자 결정 2026-11-14 — CN 플레이 제보와 CN 플레이 영상 https://www.bilibili.com/video/BV1GiWr6AEkS: 조달 센터 2레벨에서 “레이지 아이언하이드”(`chess_char_5_22`)·맹약·서포터 오퍼레이터(`chess_char_3_23`, 전략 피스)는 첫 맹약 협동방어(최저 3티어)·조화에 뽑을 오퍼레이터가 없어 자신, 전략 퀸투스의 Mon3tr(`chess_char_5_20`)는 진급판으로 자신 둘, 에단(`chess_char_3_18`)·오올헤약(`chess_char_4_18`)은 금지로 아케인 2티어 이하가 빠진 판에서 자신) [추정·서버: 뽑기는 서버 쪽 — 본 경우는 모두 그 판에 티어 ≤ 레벨인 첫 맹약 오퍼레이터가 아예 없는 것, 있지만 사본이 다 떨어진 경우는 미확인; 지난 시즌 간이 통신기는 그대로 아무것도 안 줌(관리자 결정 2026-10-07)]. 호출 모듈 `use_equip_spe_goods_first_bond` — 첫 맹약 오퍼레이터 최대 `option_count` 3명(서로 다름, 티어 ≤ 조달 센터 레벨) 중 하나 무료. 의태 물질 `use_equip_reward_same_tier` — 같은 오퍼레이터를 2명 이상 가졌으면 하나 더, 아니면 대상과 **같은 티어**의 오퍼레이터(지난 시즌은 같은 맹약). 정기 예금 통장 `equip_destory_gain_coin {value 0, n 1, delta 1}` — 가진 동안 `n` 라운드마다 `delta`씩 불어난 금액을 장착할 때 받음: 얻은 라운드부터 센다(`boughtRound`) [추정·화면: 카드의 「{showtag_value_1}」 숫자가 언제 오르는지 미확인]. 일회용 할인권 `use_equip_spe_goods_equip` — 상점 장비 3개(티어 ≤ 조달 센터 레벨) 중 하나 무료, 진급판은 6개 중 2개 [추정·화면: 3개씩 두 번 고르기로 함]. 인사부 기록 `equip_use_main_bond` — 상점 전체의 특수 새로 고침: 오퍼레이터 칸은 첫 맹약 오퍼레이터를 먼저(풀에 없으면 아무나, 같은 오퍼레이터는 남은 게 있는 한 두 번 안 나옴), 장비 칸도 상점의 장비 뽑기(레벨·공유 재고)로 다시 뽑고, 빈 칸·산 칸·동결 칸도 다시 뽑는다(공식 녹화, upstream 6efc0628). 무료이고 주동 새로 고침(主动刷新)으로 세지 않으며, 동결된 카드는 동결된 채. 위수 추천서(`chess_item_2_08_e`) `prep_end_act_bond` — 장착한 채로 휴식 기간이 끝나면 그 오퍼레이터의 **활성** 맹약마다 +`count`층(일반 1·진급 2).
- **특질이 쓰는 장비 풀**(`tools/build-data.mjs buildChoices`, 2026-11-11): 지난 시즌 이름으로 적은 풀 중 규정에 없는 장비·오퍼레이터를 가리키는 것은 규정 데이터에서 빠지고(build 경고), 규정 특질·맹약·전략이 부르는 풀은 모두 정의된다(시험이 지킴). 규정 새 풀 셋 — 캐서린(`chess_char_3_22`) `garrison_139_a` 「获得一件维式重锤，小概率获得特殊维式重锤」 `pool_equip_kathe_0` = 빅토리아 해머 90 · 특수 해머 다섯이 10을 나눔, 정예 `139_b` 「获得一件特殊维式重锤，小概率获得终极维式重锤」 `pool_equip_rockr`(지난 시즌 락락의 풀과 이름만 같음) = 특수 해머 다섯이 90 · 「终极维式重锤」 10, 패신저(`chess_char_4_24`) `garrison_161` `pool_equip_pasngr` = 맹약코인 45 · 사르곤 농차 45 · 의태 물질 10 [추정·서버: 풀과 가중치는 서버에 있다 — 「小概率」를 같은 말을 쓴 지난 시즌 페페 풀의 10 %로 읽음; 패신저 정예 문구도 「小概率」라 정예 가중치는 따로 두지 않음].
- **특수 해머 = 「终极维式重锤」의 `hammer_1`…`5`**: 그 설명 「每有一种带有特殊效果的维式重锤」과 빅토리아 맹약 「获得一件带有随机特殊效果的维式重锤」이 같은 말이라, 규정의 특수 해머는 그 목록의 다섯(불타는·견고한·가속의·전율의 + 「电流维式重锤」)이다(`specialHammerIds` — 지난 시즌은 증기의 마음의 넷, 데이터 그대로). 빅토리아 `pool_equip_vict`·캐서린 풀이 이 목록을 읽고, 규정 상점은 다섯을 팔지 않는다(`shopExcluded`) — 지난 시즌 넷의 플레이테스트 규칙을 다섯째에 이음(관리자 결정 2026-11-11) [추정·서버: 상점 풀은 서버에 있다]; 「终极维式重锤」은 상점에서 판다.
- **연구 04 항목이 없는 새 장비의 분류**: 서버에서 분류(`category`)를 읽는 곳은 봇이 `SURVIVAL` 장비를 저지 오퍼레이터에게 먼저 주는 판단 하나다. 새 장비는 설명에 「阻挡数+」가 있는 것(「乌萨斯呼吸器」·「不退者力场」)과 그 조합 짝(「不退者之盾」)만 `SURVIVAL`, 나머지는 빈칸(딜러 먼저)으로 둔다. 공유 재고의 오퍼레이터별 예외는 지난 시즌 영상의 표라 규정은 티어 표만 쓴다 [추정·자료 없음: 규정 재고 기록 없음].
- **메커니스트 정교한 설계의 패시브**(`band_equipment` `promote_equip_extra_award {n 1, count 3, select_count 1}`, `bands/meta.js`): 라운드 첫 장비 진급 합성(같은 장비 2개 → 진급판, `onMerge` kind item) 때 장비 `count` 3개 중 `select_count` 1개 무료 — 상점 장비 중 조달 센터 레벨보다 한 티어 위까지(최대 6), 공유 재고가 막는 것은 빠짐 [추정·화면: 「可能出现更高一阶的装备」의 확률 — 티어 상한만 하나 올림]. 조합도 센다(`_fuseItem`의 `onMerge` kind item, 관리자 결정 2026-11-15 — 위 「조합」), 라운드 한 번은 진급 합성과 함께. 액티브 몫(`skill_change_shop_equip`)은 묶음 sim-L.
- 확인: `test/content/items_act3.test.js`(14 — 수정 전 코드에서 12건 실패 확인, 남은 둘은 데이터·「안 합쳐짐」 시험), `test/content/bands_act3.test.js`·`coverage.test.js`(커버리지 줄), `test/content/pools_act3.test.js`(풀·특수 해머 5 — 수정 전 데이터에서 모두 실패 확인). 지난 시즌 데이터는 null 필드만 늘었다.

## 규정 장비 구역 (2026-11-11)

규정에서는 장비와 비술(秘术, `itemType` MAGIC)이 정비 구역을 쓰지 않고 **장비 구역(装备区) 5칸**에 따로 들어간다. 정비 구역 10칸에는 오퍼레이터와 소환물 묶음만 든다. 지난 시즌의 임시 정비 구역 5칸 자리가 장비 구역이 됐다.

- **근거**: 표 `constData.maxDeckEquipmentChessCnt` 5(지난 시즌 없음, `maxDeckChessCnt` 10은 그대로) → 경제 `equipHandSize`(`tools/build-data.mjs`, `GameData.equipHandSize`). 규정 전장 파일(`level_act3autochess_m01`~`m12`)은 플레이어 구역마다 정비 구역 줄 10칸이 `tile_achand`이고, 그 아래 4~8열 5칸 — 지난 시즌 전장 파일에서 `tile_achand`이던 임시 칸 — 이 새 칸 `tile_acbag`이다. 넘친 기물을 둘 칸은 맵에 없다. 공식 클라에서 확인: 손 구역이 오퍼레이터 영역(`CHAR_HAND_0`~`3`)과 장비 영역(`EQUIP_HAND_0`~`3`)으로 나뉘고, 셈도 `charOrTokenCountInHand`·`equipOrMagicCountInHand`(비술은 장비 쪽, 소환물은 오퍼레이터 쪽), 가득 참·넘침 표시도 구역마다 `isHandCharFull`·`isHandEquipFull`·`isHandCharOverflow`·`isHandEquipOverflow`, 상수 `MAX_HAND_CHAR_CNT`·`MAX_HAND_EQUIP_CNT`. 하단 안내 띠(`panel_bottom_tips` `_tipConfigs`)에 새 종류 5 `AUTO_CHESS_BATTLE_TIP_HAND_CHAR_FULL`·6 `…_HAND_EQUIP_FULL`(색·아이콘은 `HAND_FULL`과 같음)이 더해졌다. 사용자의 2026-11-03 추정(「임시 정비 구역 5칸에는 장비만」)과 같다.
- **구현**(`PlayerState.bagMode`, `player/basics.js`·`pieces.js _stowZone`·`_fillZones`): 우리 `temp`의 보이는 5칸이 장비 구역이다 — 같은 칸·같은 프로토콜 영역(`temp` idx 0~4)이라 그리기·끌기 길이 그대로 쓰인다. 장비 구역의 장비는 정비 구역의 기물처럼 기한이 없고(`_putTemp`가 기한을 적지 않음, `resolveTemp`가 건너뜀), 오른쪽부터 찬다 [추정·화면: 정비 구역과 같은 차는 순서로 함]. 상점 구매·보상 선택은 그 기물이 갈 구역이 차면 거절된다 — 오퍼레이터는 `HAND_FULL`, 장비는 `BAG_FULL`(「装备区已满」); 정비 구역이 가득이어도 장비는 사고, 장비 구역이 가득이어도 오퍼레이터는 산다. 장비는 정비 구역으로 옮길 수 없고(정비 구역의 오퍼레이터 위로 끌면 장착), 장비 구역 5칸 사이에서는 옮기거나 바꾼다(`g.move {to: {area: 'temp', idx}}`, 지난 시즌엔 `BAD_TARGET`). 정예화·장착 해제로 돌아온 장비도 장비 구역으로 간다(「干员晋级后已配发装备会回收至整备区」 — 같은 쌓기 길).
- **넘침** [추정·서버: 넘친 기물을 공식 서버가 어디에 두고 언제 처분하는지는 서버 규칙이라 클라에 없음 — 넘침 표시(`isHand…Overflow`)·준비 확인 창(`tab_pre_ready_tip_hand_overflow`)·팁 「处于临时整备区的调度资源，在进入下一回合后会自动销毁」이 남아 있어 지난 시즌 꼴로 둠]: 수동 획득(정예화 결과·지급·장비 반환)이 제 구역에 자리가 없으면 숨은 대기열(`temp[5…]`)에서 기다리고, 지난 시즌과 같은 기한에 처분된다(오퍼레이터는 되팔림, 장비는 파기). 제 구역에 빈칸이 나면 도착 순서대로 끌려 들어간다 — 오퍼레이터는 정비 구역, 장비는 장비 구역. 맵에 칸이 없으므로 대기열은 그리지 않고, 하단 띠 「整备区溢出」와 준비 확인 창만 그 수를 알린다(`m.private.bag` = 5, 클라 `gameLogic/shop.js overflowOf`).
- **하단 띠**: 준비 → 넘침 → 정비 구역 가득(`HAND_CHAR_FULL`) → 장비 구역 가득(`HAND_EQUIP_FULL`) 차례 [추정·CN: 두 「가득」의 차례는 CN 코드에만 있음]; 두 새 문구는 우리 것 [추정·자료 없음: 텍스트 키의 공식 문구가 우리 표에 없음]. 장비 구역 칸의 그림·이름표는 아직 지난 시즌 임시 칸 그대로(sim-N의 ui 줄).
- 봇: 장비 구매·보상 선택의 자리 판단이 장비 구역 기준이고(오퍼레이터를 팔아 장비 자리를 만들지 않음), 대기열의 장비는 파기한다(봇 자리의 돌연변이 세포만 장비 구역의 가장 싼 장비를 대신 파기) — `bot.js resolveQueuedItem`.
- 확인: `test/content/bag_act3.test.js`(9). 지난 시즌은 `equipHandSize`가 없어(0) 그대로 — 기본 시즌 golden 불변.

## 규정 장비 — 전투 쪽 (2026-11-11)

규정의 새 장비 버프 키는 `content/items/effects/<계열>.js`의 규정 항목(버프 키로 고름, 장비 ID와 상관없음). 숫자는 모두 기록의 `buffs[].bb`, 규칙은 규정 표(`gamedata-act3autochess` 버프 템플릿)의 그래프에서 읽었다. 이름은 공식 한국어 이름이 아직 없어 중국어 원문과 ID(`chess_item_<n>_e`)로 적는다. `node tools/season-coverage.mjs act3autochess` 장비 줄: 전투 쪽 남은 것 0, 정비 쪽 투기 주사위(`equip_destory_skill_pool`) 하나.

- **빅토리아 해머**: 규정에는 증기의 마음이 없고 해머 목록(`hammer_1`…`5`)을 「终极维式重锤」(`6_11`)이 같은 버프 키 `act1autochess_equip_acarm079_global_buff`로 갖는다 — 해머 목록은 그 키에 `hammer_N`을 가진 첫 기록에서 읽는다(`items/battle.js hammerListOf`; 기본 시즌은 그대로 증기의 마음). 그래서 불타는·견고한·가속의·전율의 빅토리아 해머의 특수 효과가 규정에서도 돈다. 「电流维式重锤」(`5_07`)은 다섯째 해머 종류 `palsy`: 피해(지속 피해 아님)마다 `palsy_prob` ⇒ 마비 1층, 마비된 적에게 주는 피해는 방어력·마법 저항 `def_penetrate`·`magic_resist_penetrate`만큼 무시(템플릿 `act3autochess_equip_acarm140_global_buff`).
- **「终极维式重锤」**: 버프 시작 때 `hammer_N`마다 `AutoChessCheckHasEquip` `_checkAllSamePlayerIndex` `_excludeTarget` — 같은 플레이어의 이번 전투 기물(필드 위든 아니든, 운반자 빼고)이 그 해머를 들었으면 그 해머의 특수 효과를 이 장비의 수치로 받는다(공식 클라에서 확인: 플레이어의 `isInBattle` 기물을 모두 훑는다). 운반자가 이미 가진 종류엔 더해지지 않는다(같은 키의 버프 하나). 공격력 +`atk_per_hammer` × (1 + 플레이어가 든 해머 종류 수, 운반자 포함) — 직접 곱셈. 맹약 조건·두 배는 없다(증기의 마음의 규칙).
- **상태**: 「雪祀之衣」(`1_07`) 저지 수 −1·도발 −1. 「驱逐者瓦斯」(`5_12`) 운반자 공격 범위 안 적에게 `ONE_MINUS_STATUS_RESISTANCE` +1 — 저항 대상 상태(기절·빙결·한기·공포·유인)의 시간이 dt ÷ (1 − 저항 + 더한 값)으로 흐르므로 그 동안 걸린 상태가 두 배 길다(`Battle.applyStatus statusTimeAdd`, 0.25초마다 갱신되는 오라). 「驱逐者防暴装备」(`6_05`) 스킬 동안 운반자가 범위 안 적에게 건 기절·공포·유인·한기·빙결·마비·지면 속박을 `prob`으로 그 적 1칸 안의 다른 적 하나에게 `ab_buff_duration`초 옮긴다(빙결은 한기로; 옮긴 상태의 출처는 그 적이라 더 옮지 않음). 「不退者卫护系统」(`6_06`) 스킬마다 운반자 `range_radius`(1.5) 안 적을 `attract_duration`초 유인(`CreateBuffInCircleRange`·`AOEDamage`는 블랙보드 `range_radius`를 먼저 읽는다 — 공식 클라에서 확인).
- **피해**: 「伊比利亚骨刺刀」(`3_14`) 부가·지속 피해가 아닌 피해마다 공격력 25 % 마법 피해 1번(정예 2번, 부가 피해). 「驱逐者警棍」(`4_12`) 저항 대상 상태인 적에게 ×1.3. 「动能单手弩」(`4_13`) 30 %로 그 피해의 공격 배율 ×1.3(방어 계산 전 수치). 「天马之耀」(`6_12`) 부가 아닌 피해마다 그 피해 수치 × 30 %의 무출처 고정 부가 피해, 초당 최대 체력 8 % 생명 회복. 「瓶装烈性反应」(`5_10`) 원소 폭발 회복 중인 적에게 ×1.3(정예 ×1.5). 배율·굴림은 아이템 추가 피해에도 걸린다(추가 피해가 다른 아이템을 다시 일으키지 않는다는 이 포크의 규칙은 효과 발동에만).
- **중첩**: 「灵巧涡轮手套」(`2_10`) 배치마다 1초마다 공격 속도 +2(정예 +3, 20층까지), 체력이 깎이는 첫 피해에 다음 배치까지 사라짐. 「乌萨斯呼吸器」(`3_12`) 이번 전투의 배치마다 1층(2층, 정예 3층) — 층마다 저지 수 +1·공격력 +20 %(정예 30 %). 「动能加速器」(`6_07`) 공격·치료·스킬 시작마다 공격 속도 +2(60층, 배치마다 새로). 「动能轰击弩」(`6_08`)은 60층부터 그런 시작마다(0.5초 쿨) 30 %로 범위 안 무작위 적 둘레 1.5에 공격력 100 % 물리 스플래시.
- **자원·맹약**: 「莱塔尼亚小鼓」(`4_09`) 운반자 범위 안 적이 쓰러질 때 SP +2(정예 +4). 「可靠怀表」(`4_11`) 오퍼레이터당 전투에 한 번 스킬 SP ×0.8(정예 ×0.6, 3 아래로는 안 내려가고 3 이하면 그대로), 스킬 동안 공격 속도 배율 −25 %(장비마다). 「多功能补剂」(`3_13`) 피해(지속 피해·아이템 추가 피해 아님)마다 자기 활성 맹약마다 임시 층수 +1(정예 +2), 오퍼레이터당 전투에 12(24)까지. 「佣兵名牌」(`5_08`) 배치마다 활성 맹약 수(8까지) × 공격력·최대 체력 +6 %(정예 12 %).
- **회복·체력**: 「虹彩活血饮料」(`1_06`) 치료 불가(자기 회복 속도는 됨) + 초당 75(정예 150) 회복. 「聚合急救箱」(`2_09`) 범위 안 아군이 처음 체력 50 % 아래로 내려가면 최대 체력 35 %(정예 50 %) 치료 — 그 아군당 전투에 한 번(플래그가 아군 쪽에 있어 운반자가 여럿이어도). 「不退者力场」(`5_11`) 저지 수 +2, 저지한 적마다 최대 체력·방어력 +20 %. 「汲取者之喙」(`4_14`) 준 피해의 5 % 자기 회복(치료 불가도 통과). 「汲取者之心」(`6_09`) 공격력 +30 %·공격 속도 +30, 초당 최대 체력 1 % 상실(1 아래로는 안 감). 「汲取者之镰」(`6_10`)은 스킬 동안 그 둘이 두 배이고 운반자는 치료 불가.
- **특질 `garrison_23`**(탈룰라 `chess_char_6_16`, `act3autochess_gar_effect_ursusexbondcnt`): 플레이어의 AUTOCHESS 전역 `ursus_extra_bond_stack_cnt`(·`[power]`)를 `ex_bond_cnt` 2(정예 4)로 올린다(더 높을 때만) — 우르수스 맹약이 쓰러뜨림마다 주는 임시 층수에 더해져 2 → 4, 6명일 때 4 → 6(정예 6·8). `bonds/nation/ursus.js raiseUrsusExtra`.
- [추정·CN: 장비의 동적 능력 프리팹(`act3autochess_equip_acarm134`·`136`·`143`·`145`·`151_ability`)은 CN에만 있다] 고르는 대상을 설명대로 운반자 공격 범위 안으로 읽음 — 작은 북은 적만, 급구상자는 아군만, 동능 스플래시의 기준 적은 범위 안 무작위. [추정·CN: 투사체 `projectile_ac_equip_acarm145_abbuff`의 비행 시간] 옮기는 상태는 바로 걸린다.
- 확인: `test/content/items_act3_battle.test.js`(22 — 수정 전 코드에서 모두 실패 확인), `coverage.test.js`. 화면은 안 봄(숨김 시즌).

## 규정 특질 — 전투 쪽 (2026-11-11)

규정(`act3autochess`) 특질 표(`data/seasons/act3autochess/garrisons.json`)의 전투 중(`IN_BATTLE`) 규칙. 처리기는 효과 키로 고른다(`content/garrisons/effects/*.js`). 규칙은 규정 표의 버프 템플릿(`gamedata-act3autochess` `buff_template_data`)에서 읽었고 숫자는 모두 기록의 `bb`. `node tools/season-coverage.mjs act3autochess`의 특질 전투 줄: 남은 것은 아래 「남은 것」 하나(가진 기물이 없는 키).

- **사건이 효과 특질을 부름**(`bbStr.garrison_type` `garrison_trigger_buff`, 24개): 사건 특질이 층을 주는 대신 같은 기물의 다른 특질(`garrison_trigger_buff_garrison_key`, 설명이 비기도 함)을 그 효과 키(`garrison_trigger_buff_key`)로 돌린다 — 클라의 `AutoChessTriggerGarrisonAbility`가 효과 특질 버프의 `ON_BUFF_TRIGGER`를 깨운다. 사건은 지난 시즌 것 그대로(스킬 시작·배치·쓰러짐·빙결 진입)거나 새 것. 효과 특질은 혼자서는 아무것도 안 한다(`effects/triggered.js`). 지금까지 이 24개는 돌기만 하고 아무 효과가 없었다(층 수 0).
  - SP(`act3autochess_gar_effect_addsp_inrange`): 범위 안 아군 오퍼레이터 SP +`sp` — 범위는 `use_global_range` > `use_attack_range` > `range_id` 차례(템플릿 순서), `bond_id`가 있으면 그 맹약 구성원만(조화 포함). 파피루스(`chess_char_2_04`) 스킬 시작마다 앞 1칸(`1-5`) +2(정예 +4), 스펙터 디 언체인드(`4_10`) 쓰러짐·교대마다 둘레 8칸(`x-4`)의 에기르 +5(+10), 프라마닉스 더 프레리타(`5_07`) 빙결 진입마다 자신 +1(+2), 아이린(`5_03`, 艾丽妮) 둘레 12칸(`x-1`)의 처치마다 자신 +3(+6).
  - 능력치(`…attrbybond_inrange`): 단계 = ⌊`bond_id` 층수 ÷ `denominator`⌋, 0보다 크면 범위(`x-5`, 자신과 둘레 4칸) 아군에게 `attr_duration`초 공격력·방어력·체력 ×(직접 곱셈) / 공격 속도·회복·마법 저항 +(템플릿의 `MULTIPLIER`·`ADDITION`) × 단계. 언더플로우(`3_10`) 배치마다 에기르 20층(정예 10층)마다 공격 속도 +1, 울피아누스(`5_10`) 공격력 +1 %, 30초.
  - 재배치 시간(`…minus_respawn`): 「整备区」와 공격 범위 — 재배치를 기다리는 플레이어의 오퍼레이터 남은 시간 −`remaining_respawn_time`초, `is_ratio`면 × 그 값(0.7 = 「−30%」). 파투스(`4_12`) 공격 범위 안 처치마다 −3초(정예 −6초), 历阵锐枪芬(`3_21`) 쓰러질 때 ×0.7(×0.4).
  - 叠层上限(`…bondstackmax`): 범위 안 오퍼레이터의 모든 특질의 전투당 상한(`max_add_count_per_battle`)에 + `max_add`·× (1 + `max_factor`)(캐릭터 공유 블랙보드 `max_add_count_per_battle_modify_add`·`_factor`), 이번 전투만. 대상 맹약은 자신의 맹약(`filter_bond_by_self`)이나 `filter_bond_ids`. 비비아나(`5_11`) 전투 시작에 필드 전체의 「其他」 같은 맹약 오퍼레이터 +7(+14), Mon3tr(`5_20`) 둘레 8칸 ×1.3(×1.6), 실버애쉬 더 레인프로스트(`5_08`) 앞 1칸의 쉐라그·기민 ×1.75(×2.5).
- **새 사건**(`effects/events.js`):
  - 범위 안 처치(`act1autochess_gar_event_enemykilled_inrange`): 범위(`range_id`, 없으면 공격 범위) 안의 적이 **누구에게든** 쓰러지면 센다(클라: 범위 안 적에게 붙인 `…enemykilledinrange[e]`의 `ON_OWNER_KILLED`가 주인의 `current_cnt`를 올리고 `kill_count`에서 발동·0으로). 어스스피릿(`1_19`)·에벤홀츠(`4_01`)·에이야퍄들라 더 크비트 아스카(`5_01`)·하루카(`6_11`)·토스카(`5_25`)의 층, 파투스·아이린의 효과 특질.
  - 전투 시작(`act3autochess_gar_event_battlestart`, `ON_AUTO_CHESS_MODE_CHANGED`): 레토(`1_16`, 烈夏) 우르수스 임시 층수 +4(+8, `bond_add_as_tmp`), 그리고 叠层上限 셋.
  - 원소 폭발(`act3autochess_gar_event_enemy_epbreak_inrange`, `ON_BEFORE_EP_BREAK_START`): 범위(위 `x-4`·블레이즈 디 이그나이팅 스파크 `6_02`는 공격 범위) 안 적의 어떤 원소든 폭발이 풀리기 전에.
  - 범위 안 배치(`act3autochess_gar_event_onstart_inrange`, `ON_OWNER_LOCATE`): 스카디 더 커럽팅 하트(`6_03`) 공격 범위 안 칸에 **다른** 오퍼레이터가 배치될 때마다 에기르 +2(+4) — 전투 시작의 배치(한 기씩 차례로 놓이므로 그녀보다 뒤에 놓인 것), 재배치, 기습 착지. 【이동】은 배치가 아니다.
- **피해를 줄 때**(`effects/hits.js`, 클라 `ON_OUTPUT_DAMAGE` — 원소 수치는 피해 출력이 아님): 마터호른(`1_06`) 적마다 첫 피해에 한기 2초(정예 4초) — 적 쪽에 그 주인별 표식(`…firstdamgecold[flag]` `independentCharacterSource`)이 남아 전투에 한 번. 미즈키(`4_11`) 자신과 둘레 4칸(`x-5`) 오퍼레이터의 피해마다 대상 이동 속도 × (1 − 0.01 × ⌊에기르 층수 ÷ 20(정예 10)⌋)(`FINAL_SCALER`) 3초.
- **침식 냉각**(`effects/stats.js`): 클레멘티아(`6_04`) — 필드의 모든 적이 `…block_eprecoverspeed`를 받고, 그 적이 **그녀에게 저지된 채** 침식(`ep_type` WATER) 폭발 중이면 `EP_BREAK_RECOVER_SPEED` × (1 + 0.01 × ⌊에기르 층수 ÷ 20(10)⌋) — 폭발 냉각(`damage.js`의 `erosionBurst`)이 그만큼 빨리 끝난다.
- **지난 키의 새 값**: 수면·기절 진입(`act2autochess_gar_event_allyenemy_sleepstun_inrange`) `range_id` `x-4`(둘레 8칸, 지금까지는 공격 범위만), `bond_type` `bond_allinrange` + `bond_range_id` `b-4`(`garrison_237` — 뒤 1칸 오퍼레이터의 활성 맹약, 주인 것은 아님).
- **적 이상 상태 진입**(`act1autochess_gar_event_enemy_abflag_inrange`)의 `check_ab_flag`는 클라 `AbnormalFlag` 값이다(공식 클라에서 확인): 16 FROZEN = 빙결, 33 FEARED = 공포. 님프(`chess_char_6_10`, char_4146_nymph) `garrison_99` 「攻击范围内每有一名敌人陷入恐惧使已激活的【迅捷】层数+4（每回合至多叠加20层）」(정예 +8·40) — 2026-11-14까지 처리기가 33을 몰라 빙결로 읽어 공포로는 층이 안 오름([#13](https://github.com/LazyDeltaLima/Myeongto-Replica/issues/13), 관리자 로컬 재현). 이제 모르는 값은 아무것도 안 보고(빙결로 떨어지지 않음), 시험이 모든 시즌 표의 값이 처리기에 있는지 본다. 공포도 새 진입만 센다(걸려 있는 공포의 갱신은 아님).
- **표 코드 전수 검사**(2026-11-14, 위 님프와 같은 종류): 처리기가 표의 숫자·문자 코드를 제 대응표로 읽는 곳은 모르는 값에서 **아무것도 안 한다** — 첫 경우나 「그럴 듯한」 값으로 떨어지지 않는다. 목록은 `server/sim/content/codes.js TABLE_CODES`(처리기·필드·아는 값): 적 이상 상태 진입 `check_ab_flag`(16 빙결·33 공포), 치우바이(`char_4082_qiubai`, `garrison_101`)의 `check_ab_flag` 13 UNMOVABLE = 속박(전엔 0이 아니면 무엇이든 속박으로 읽음), 클레멘티아(`char_4231_clemnt`, `garrison_65`)의 `ep_type`(WATER 침식·FIRE·NEURAL·DARK — 전엔 모르는 값이 침식), 층 사건 특질의 `bond_type`·`bond_add_type`·`conditionkey`·`garrison_type`·`range_id`(전엔 `bond_by_id`·`by_count`·조건 없음·층 더하기·자신으로 떨어짐), 정비 특질의 `add_method`·`dir`(전엔 모르는 값이 몸 앞)·`scope`(전엔 가장 오른쪽 위)·`event`·`conditionkey`(`character_target_inboard`, `SERVER_POOL_CHAR`·`SERVER_MOST_BOND`는 `character_same_row`도 — 다른 값의 특질은 돌지 않음), 전략 단계 `unlockType`·`event_type`·`event`·`cond`(전엔 모르는 조건을 무시)·터치 전략 「외근 의료」(`band_amedic`) `common_condition`·클레멘티아 전략 「숭고한 희생」 `bond_add_type`, 결정 카드(수배 등 효과)의 `enemy_level_type`. 값이 빠지면(필드 없음) 표의 기본 경우다. `content/coverage.js`의 `codes` 줄이 시즌 기록마다 모르는 값을 `partial`로(기록 id와 함께) 보고(`node tools/season-coverage.mjs`), 시험 `test/content/table-codes.test.js`가 모든 시즌 0건·각 목록이 실제 기록을 읽음·모르는 값에서 처리기가 아무것도 안 함(옛 기본값 코드에서 실패 확인)을 본다. 지금 두 시즌 모두 16줄 ok — 이 수정으로 바뀐 판 결과 없음.
- **쓰러짐 특질의 대역 교대**(`act1autochess_gar_event_selfdead`, 2026-11-14, 플레이 제보): 문구에 교대가 적힌 특질은 쓰러질 때와 함께 인형사의 대역 ⇄ 본체 교대가 **시작될 때마다** 발동한다 — 스펙터 디 언체인드(char_1023_ghost2)(`garrison_40` 「替身与本体进行切换」, 규정 `garrison_62` 「与替身发生替换」), 규정의 카제마루(`chess_char_3_24`, char_4016_kazema) `garrison_124` 「<战斗中>自身被击倒或与傀儡发生替换时使已激活的【不屈】层数+2（每回合至多叠加10层）」(정예 +4·20). 판정은 문구의 「替身」·「傀儡」(`effects/events.js countsSwaps`), 교대는 엔진의 `dollSwap`(대역으로 쓰러지는 것은 교대가 아님). 고친 것 둘: ① 카제마루 문구는 「傀儡」라 2026-11-14까지 교대로는 불굴 층이 안 올랐다(대역으로 쓰러질 때만); ② 교대를 틱마다 `unit.trait.doll`의 변화로 봐서, 대역으로 쓰러진 뒤 불굴이 바로 재배치하면 그 쓰러짐이 교대로 한 번 더 세어졌다(스펙터 디 언체인드도). 카제마루 S2가 소환하는 대역(토큰)은 교대가 아니라 안 셈. 모든 시즌의 쓰러짐 특질에서 「주인이 인형사 ⇔ 교대를 셈」을 전수 검사한다. 재발 방지: `test/content/garrisons_battle.test.js` 「selfdead sweep…」, `test/content/garrisons_act3.test.js` 「风丸 garrison_124…」(실제 카제마루 기물; 두 수정 모두 되돌리면 실패 확인).
- 범위 이름은 range_table 그대로(`garrisons/shared.js RANGE_GRIDS`): `x-4` 3 × 3, `x-5` 십자, `x-1` 반경 2 마름모(「周围12格」), `1-5` 앞 1칸, `1-1` 자신 + 앞, `b-4` 뒤 1칸 — 가운데 칸이 들어 있는 범위는 주인도 든다(「其他」라고 적힌 비비아나만 뺌).
- [추정·CN: 이 키들의 동적 능력 프리팹(`char_dynamic_ability_new`·`env_gbuff_new_with_verify` 룬)은 CN에만 있다] 범위 버프는 주인의 지금 범위를 따른다; `use_attack_range`·`bond_use_char_range`·`at_root`는 모두 공격 범위로 읽음; 단계는 **활성** 맹약 층수만(지난 시즌 층수 읽기와 같게, 연구 02 §5); 「整备区」는 재배치를 기다리는 오퍼레이터(전투에 오는 정비 구역 기물은 교대 후보뿐이고 재배치 타이머가 없음)이고 공격 범위 몫은 아무도 안 늘림(필드 위 오퍼레이터는 타이머가 없음), 사건을 일으킨 주인 자신(历阵锐枪芬 「被击倒时」)은 아직 거기 없음; 상한은 ⌊상한 × (1 + Σ factor)⌋ + Σ add(두 공유 값의 순서는 EN 클라에 없음); 스카디 더 커럽팅 하트 자신의 배치는 안 셈; 미즈키의 감속은 주인마다 하나를 새로 걸어 갱신.
- **정비 구역 교대**(`effects/switch.js`, 클라 `AutoChessMarkSwitchWithHand`: `_selectType` RIGHT·`_putType` ORIGINAL): 정비 구역의 맞는 오퍼레이터 중 맨 오른쪽 칸이 주인이 누운 칸에 주인 방향으로 들어오고, 주인은 몸 없이 떠난다(재배치 없음) — 카시미어 6명 교대(「규정 맹약」)와 같은 꼴이고 같은 대기 유닛을 쓴다(정비 구역 한 칸에 유닛 하나, `battle/players.js createReserveAlly`). 맞는 오퍼레이터 = `switch_bond_id`의 맹약 중 하나를 가진(조화 포함) 주인과 같은 배치 종류(`_checkOriginBuildable`, 들어올 칸). 전투 입력 `reserve`에는 보드 기물의 교대 특질이 부르는 정비 구역 기물만 실린다(`player/round.js battleInput`).
  - 니어 더 래디언트 나이트(`chess_char_6_05`) `garrison_58`(`act3autochess_gar_effect_switchhand_triggergar`, `switch_bond_id` 카시미어·기습): `ON_OWNER_FINISH`에서 이동 같은 퇴장(`MOVE_LIKE_RESPAWN_SELF`·`_EXTERNAL` — 우리 엔진의 기습 퇴장 `'raid'`, 바로 다시 배치)만 빼고 교대, 그 뒤(`AlwaysNext` — 후보가 없어도) 자신의 활성 맹약 +`bond_add_count`(6, 정예 12), 불려 온 오퍼레이터는 `act3autochess_gar_effect_common_triggergar`의 `ON_BUFF_START`로 **자기** 활성 맹약에 같은 수. 상한 `max_add_count_per_battle`(12·24)은 오퍼레이터마다.
  - 历阵锐枪芬(`chess_char_3_21`) `garrison_223`(쓰러짐 사건) → `224`(`…switchcharinhand[trigger]`, 카시미어): `AutoChessCheckSwitchWithHand`(후보가 없으면 아무것도 안 함) → 교대 → `InstantKill`(이미 쓰러진 주인). 층은 없음.
  - [추정·CN: 두 노드는 CN 전용] 쉼표로 둔 맹약은 「그중 하나」(이 표들의 다른 맹약 필터와 같게); `switch_buildable_type`·`switch_profession_mask`는 기록에 없어 검사 안 함; 이동 같은 퇴장 말고는 모두(쓰러짐·자기 효과의 강제 퇴장) 교대; 교대는 다른 'death' 처리 뒤(우선순위 −999), 카시미어 6명 교대(−1000)보다 먼저 — 한 번 쓰러지면 한 명만 불려 온다.
- **아미야**(`chess_char_5_26`) `garrison_114`(앞 1칸에게 부여) → `garrison_235`(`act3autochess_gar_effect_ex_bond_cnt`, 「通过卫戍能力或装备提升盟约层数时，每次提升的层数额外+1（不受叠层上限影响）」, 정예 +2, 2026-11-13): 받은 오퍼레이터 자신의 특질(`'garrison'`)·장비(`'item'`) 층 획득마다 맹약마다 +`extra_cnt` — 마왕(`garrison_59`)처럼 `layerGain` 훅이라 한 판 상한이 제 몫을 뗀 뒤에 붙어 상한에 안 셈(상한에 닿아 0이 된 획득에는 안 붙음). 전에는 이 키의 처리기가 없어 아미야 특질이 아무 일도 안 했다(「가진 기물이 없다」고 적었으나 11-09에 들어온 아미야가 부여한다). [추정·CN: 효과 프리팹이 CN에만 있음] 전략·맹약 자체(우르수스 처치 임시 층)·정비 쪽 획득은 안 늘림, 부여 사본마다 따로 더함.
- 확인: `test/content/garrisons_act3.test.js`(16 — 수정 전 코드에서 모두 실패 확인; 님프 공포 셋은 2026-11-14, 실제 님프 기물의 S2 포함, 수정 전 코드에서 모두 실패 확인), `coverage.test.js`(지난 시즌 데이터로 만든 「모르는 값」을 `bond_allinrange`에서 다른 값으로), 교대는 `test/content/garrisons_act3_switch.test.js`(5 — 실제 대전 경로 하나 포함, 수정 전 코드에서 모두 실패 확인). 화면은 안 봄(숨김 시즌).

## 규정 특질 — 정비 쪽 (2026-11-11)

규정의 새 `SERVER_*` 특질 키(`content/garrisons/prep/*.js`). 숫자는 기록의 `bb`.

- **자라는 값**(`prep/shared.js growingValue`): k번째 실행(0부터)이 `count` + `delta_count` × ⌊k ÷ `n`⌋, 많아야 `count` + `max_count`. 오로라(`chess_char_3_07`, 极光) 「<获得时>【谢拉格】层数+{showtag_value_1}（每次触发后升级，至多叠加12层）」 = 쉐라그 1, 2, … 12층(활성 맹약 필요 없음 — 문구에 「已激活」 없음), 불피스폴리아(`3_13`) 「获得{showtag_value_1}次免费刷新（触发2次后升级，至多获得3次）」 = 무료 새로 고침 1, 1, 2, 2, 3, 3. 실행 수는 플레이어·특질마다(일반·정예 기록이 하나를 같이 셈) [추정·화면: 카드의 「{showtag_value_1}」을 플레이어 전체 수로 읽음 — 팔았다 다시 산 같은 기물이 처음부터인지 미확인].
- **전투 끝의 생존자**(`SERVER_ADD_ACTIVATED_BOND_BY_ALIVE_CHAR`, `SERVER_BATTLE_FIN` → `onBattleResult`): 자기 일반 전투가 끝날 때 서 있는 오퍼레이터(결과 `unitsEnd`의 살아 있는 기물, 소환물 빼고) × `count`. 루멘(`4_06`) 이베리아·聚合(활성), 나이팅게일(`4_22`, 夜莺) `bond` `SELF` = 자기 활성 맹약, 한 번에 `max_count` 9(정예 18)까지.
- **장비 든 오퍼레이터**(`SERVER_ADD_BOND_BOARD_EQUIP_CHAR`, 휴식 끝): 제시카 더 리버레이티드(`4_14`) 보드에서 장비를 하나라도 든 기물마다(자신 포함) 빅토리아·고수 +2(정예 +4).
- **장비 진급**(`SERVER_UPGRADE_SELF_EQUIP`, 휴식 시작): 스테인리스(白铁, `4_15`) 자기 장비마다 정예판으로(`upgradeItem` — 공유 재고의 진급 문은 그대로), 진급한 장비는 그 조각 그대로 내려와 장비 구역으로 간다(가득 차면 다섯 칸 뒤 숨은 대기열, `ctx.unequipDirect`) — 공식 녹화 BV1egWJ66Ejp(upstream 7833db21·PR #937). 이미 정예인 장비는 그대로 든다.
- **무작위 장비**(`SERVER_GAIN_RANDOM_EQUIP`, 휴식 시작): 트라고디아(`6_07`) 조달 센터 레벨 이하 장비 1개, 정예는 2개 — 개수는 문구에만 있다(`bb` 비어 있음). 정예 기물은 같은 문구(「两件」)의 기록 둘(`158_b`·`159_b`)을 가져서 첫 것만 돈다(录武官(기본 시즌 숨김 `4_15`)의 겹친 기적과 같게) [추정·자료 없음: 표에 둘 다 있고 공식 서버가 하나만 돌린다는 근거는 없음 — 문구의 개수를 따름].
- **판매가**(`PlayerState.sellPriceOf`): 기물의 판매가 = 특질이 준 그 기물의 값(`piece.sellPrice`), 없으면 기물 기록의 값(`GameData.sellPrice`). 규정은 모든 기물이 1. 정비 화면은 기록과 다른 값을 기물 보기의 `sellPrice`로 받아 판매 단추·정예 판매 확인에 쓴다(`ui/facing.js`·`ui/detailPanel.js`).
  - 海沫(`chess_char_3_04`, 하이모어 `char_4066_highmo`, 공식 한국어 이름은 사전에 없음) `garrison_27`(`SERVER_SELF_SELL_PRICE_DELTA`, 휴식 끝): 보드에 있으면 자기 판매가 +`count`(1, 정예 2), 기록 값 + `max`까지(1 + 3 = 4, 1 + 7 = 8 — 문구의 「至多为4」「至多为8」) [추정·화면: 두 장이 정예로 합성되면 새 기물이라 기록 값에서 다시 시작 — 올린 값이 넘어가는지 미확인].
  - 위디(`chess_char_4_05`) `garrison_30`(`SERVER_SELF_SELL_PRICE_FIXED`, 획득 시): 판매가 3(정예 6) — 기물의 값으로 읽는다(`GameData.sellPrice`가 기록의 특질에서): 합성된 정예는 획득 시 특질이 돌지 않아도 6.
  - 旅骨(`chess_char_3_05`, 홈바운드) `garrison_28`(`SERVER_ADD_BOND_POSITION_COUNT_SELL_PRICE`, 휴식 끝): 자신과 앞 1칸 오퍼레이터(`SERVER_ADD_BOND_POSITION`과 같은 두 대상)의 활성 맹약에 각자의 판매가 × `multi`(1, 정예 2) [추정·화면: 「其售出价格」의 「其」를 각 오퍼레이터로 읽음 — 홈바운드 자신의 값이 아님; 규정에서 다른 것은 海沫·위디뿐].
  - 쏜즈(`chess_char_5_04`) `garrison_32`(`SERVER_ADD_BOND_BOARD_SELL_PRICE`, 휴식 끝): 활성 이베리아 + 보드 기물 판매가 합 × `multi`(1, 정예 2), 많아야 `max`(12·24) — 한 라운드에 한 번이라 그대로 상한. 정비 구역·소환물은 안 셈.
- **「每回合至多叠加N层」**(2026-11-13): 휴식 끝에 한 번 도는 특질의 `max`는 한 번에 맹약마다 주는 층의 상한 — 쏜즈와 같게. 타락사쿰(`chess_char_3_06`) `garrison_36`·클로저(`5_21`) `125`·시(`6_17`) `128`(`SERVER_ADD_BOND_METHOD` `round_gain_char`, 이번 라운드 획득 오퍼레이터 × `multi`: 16·32 / 16·32 / 24·48), 아스트젠 더 라이트체이서(`5_18`) `121`(`SERVER_ADD_BOND_ROUND_COIN_COST`, 소모 자금 ÷ 3 × `layer`: 18·36). 전에는 `max`를 읽지 않아 상한 없이 쌓였다. 안젤리나(`4_25`) `91`·`236`의 `max_layer`는 전부터 지켰다.
  - 휴식 끝 특질끼리의 차례는 보드 차례(`boardOrder`) — 海沫가 쏜즈보다 먼저면 오른 값이 그 라운드에 셈 [추정·화면].
- **가장 많은 맹약의 오퍼레이터**(`SERVER_MOST_BOND`, 2026-11-14 CN 플레이 제보): 에단(`chess_char_3_18`, `char_355_ethan`) `garrison_200` 「<售出时>随机获得一名当前人数最多盟约的干员（不高于当前调度中心等级；无法获得自身）」 = 판 뒤 구성원이 가장 많은 맹약의 오퍼레이터를 조달 센터 레벨 이하 티어에서, 에단 자신(같은 `charId`)은 빼고 하나. 두 조건은 문구에만 있다(`bb` 비어 있음) — 처리기가 문구를 읽는다. 전에는 6티어까지 뽑아 2레벨에 6티어가 나왔다(제보). 같은 키의 지난 시즌 위(余 `garrison_37`)·규정 `garrison_174`(휴식 시작)는 문구에 조건이 없어 그대로 모든 티어. 셋 모두 구성원 오퍼레이터가 없는 맹약(궁극기 `suntShip` — 보드의 정예를 모두 셈)은 후보에서 뺀다: 정예가 많아 궁극기가 가장 크면 아무것도 안 주던 것(upstream 7f698e80·PR #931 — 공식 판매 화면: 정예 3·조력 2명에서 조력 오퍼레이터).
- **특수 새로 고침**(노시스 `chess_char_4_09` `garrison_55`, `SERVER_GAIN_SPECIAL_REFRESH_BOND_CHAR`, 획득 시): 페페의 특수 새로 고침(`bands/meta.js`, 「규정 전략」)과 같이 플레이어의 **다음 수동 새로 고침**(값은 평소대로 — 문구에 「免费」 없음)이 끝난 뒤 쉐라그 오퍼레이터가 `count`(1, 정예 2) 장 이상이 되게 한다: 쉐라그가 아닌 오퍼레이터 칸을 왼쪽부터 쉐라그(조달 센터 레벨 이하)로 다시 뽑음. 플레이어 쪽 훅(`global:garrison_special_refresh`)이라 노시스를 먼저 팔아도 남는다. 둘이 쌓이지 않고 큰 수가 남는다(페페의 특수 새로 고침이 안 쌓이는 것과 같게) [추정·화면: 어느 칸을 다시 뽑는지, 쌓이는지].
- **남은 것**: 없음(정비 쪽 `SERVER_*` 키는 모두 처리기가 있다 — `node tools/season-coverage.mjs act3autochess`). 2026-11-13 점검: 정비 쪽 처리기마다 기록의 `bb`·`bbStr` 키를 읽는지, 문구의 숫자가 `bb`(또는 부여·연결 특질의 `bb`)에 있는지 334개 기록 전부 — 어긋난 것은 위 `max` 넷과 전투 쪽 아미야 `garrison_235`뿐이었다(읽지 않는 나머지 키는 같은 값을 다른 곳에서 읽거나 — 위디 `price`는 판매가, `pool1…6`은 `max_pool`과 같은 풀 — 이 문서에 적은 해석: `at_root`·`bond_use_char_range`·`use_to_attackrange`).
- 확인: `test/content/garrisons_act3_meta.test.js`(6), 판매가·특수 새로 고침·에단은 `test/content/garrisons_act3_sell.test.js`(6) — 둘 다 수정 전 코드에서 모두 실패 확인. 화면은 안 봄(숨김 시즌).

## 부여된 특질은 받은 만큼 겹친다 (2026-11-11, 플레이 제보, 공식 클라에서 확인)

- **규칙**: 특질이 다른 오퍼레이터에게 주는 특질(`give_garrison_id`)은 줄 때마다 사본 하나다. 같은 등급 와파린(`chess_char_4_26`) 둘이 한 오퍼레이터를 보면
  그 오퍼레이터는 `garrison_95`를 둘 갖고 스킬을 켤 때마다 +1 +1(정예 +2 +2)을 얻는다. 한 판 상한(`max_add_count_per_battle`)은 오퍼레이터와 특질 id마다 하나로
  사본이 함께 쓴다 — 와파린 둘이어도 7(정예 14)에서 멈춘다. 일반과 정예는 id가 달라(`_a`·`_b`) 상한도 따로다(7 + 14). 파투스(`chess_char_4_20`) 둘이 같은 줄
  맨 오른쪽에게 주는 `garrison_108`(배치·몸 바꿈마다 +4, 24까지)도, 니어 더 래디언트 나이트(`chess_char_6_17`) 둘이 앞뒤로 서서 앞 사람이 받는 144·159(자기 것 +
  뒤 사람이 준 것)도 같다. 전에는 같은 id의 둘째 부여를 버려 늘 한 사본이었다(제보 「와파린 2명이 봐도 1명분」).
- **대상은 룬 키로 고른다**: 앞 칸(`give_garrison_to_front`) · 뒤 칸(`give_garrison_to_back`) · 같은 줄 맨 오른쪽(`give_garrison_to_most_right`) · 내 오퍼레이터
  전부, 자신 포함(`give_garrison_to_all`), 모두 같은 플레이어의 오퍼레이터이고 `check_bond_id`가 있으면 그 맹약 구성원만. 「자신」을 주는 갈래는 없다: 니어 더 래디언트
  나이트의 「자신과 앞 1칸에게」는 앞 1칸에게 주고, 자신의 몫은 그녀가 원래 가진 144·159다(전엔 설명 문구로 대상을 골라 자신에게도 주고 중복이라 버렸다).
- 근거(공식 클라에서 확인): 전투 데이터를 읽을 때 부여 특질은 대상의 룬 목록에 새 룬 묶음으로 덧붙고(`AutoChessBattleDataModel._GrantGarrisonToInst` →
  `AdvancedRuneHolder.AddPackedRuneData`, 이미 가졌는지 보지 않음), 부여 대상은 `_ParseGrantGarrison`이 위 네 룬 키로 고른다. 이 특질들의 전역 버프 프리팹
  (`[uc]globalbuffs.ab`의 `act1autochess_gar_*`·`act2autochess_gar_*` 10개)과 `garrison_29`의 능력 프리팹(`[uc]dynamicabilities.ab`)은 모두 `disableOverride` 1이라
  덮어쓰기 묶음 밖 — 사본마다 켜진다(sim.md 「같은 장비 둘은 둘 다 효과가 있다」와 같은 구조). 층 상한은 `AutoChessGarrisonManager`가 받은 오퍼레이터에 특질의
  `garrison_key`로 누적을 적어 두고 남은 만큼만 준다.
- [추정·CN: 규정의 `garrison_235`(「앞 1칸 오퍼레이터가 층을 올릴 때마다 +1」, `act3autochess_gar_effect_ex_bond_cnt`)는 프리팹이 CN 클라에만 있어 덮어쓰기 묶음
  여부를 못 봄 — 다른 특질처럼 사본마다로 둠]
- 코드: `content/garrisons/battle.js` `add`(부여 사본마다 인스턴스, 버프 키 `gar:<id>`·`gar:<id>#2`…, 상한 키는 공유), `effects/grants.js grantTargets`,
  `effects/stats.js`(사본마다 버프). 테스트 `test/content/garrisons_battle.test.js` 「华法琳 72 ×2 on one operator…」·「耀骑士临光 ×2 in a row…」,
  `test/content/fartooth-doll-swap.test.js` 「two 远牙 give a dollkeeper two copies…」 — 셋 다 수정 전 코드에서 실패 확인.

## 규정 机变 결정 카드 표 (2026-11-15, upstream 270cb7b1)

- **무엇**: 규정 시즌의 현상금 결정(悬赏决策) R3·R9·R11, 기밀 상점(机密商店)·전술 결정(战术决策) R11은 규정 공식 판 15개(연합 초월 `mode_multi_abyss`, bilibili BV13LWM6BEvY, 2026-11-10·11 녹화)에서 읽은 규정 자기 표로 뽑는다. 전에는 규정도 맹약 하반기 표(22판 스크린숏)로 지어져, 맹약 목록에 없는 규정 카드 6장(`enemyeffect_17_7`·`18_7`·`12_9`·`13_9`·`20_7`·`16_13`)이 결정에 나오지 않았고, 규정 R9 보스 현상금 셋(凋零骑士 `b_6`·扎罗 `b_16`·迷路的巨像 `b_18`)은 「안 본 카드」로 빠져 있었다.
- **표**: `tools/build-data.mjs ACT3_DRAFTS`(시즌별 `DRAFT_TABLES`, 표가 없는 시즌은 생성기가 멈춤), 읽은 값 `test/fixtures/official-regulation-drafts.json`. R3 목록 7개 본 것(17·18 계열과 섞인 두 목록은 7장이고 화면엔 6장, 19 계열은 6장 전부), 안 본 3개 사건은 규칙(등급 I I I II II III III, 한 계열 2장까지, III은 아무 화면에도 없던 `11_6`·`12_6`·`15_6`·`20_6`에서); R9 6묶음(나온 판 수로 고름 — 같은 리더 「假想敌：胄」 두 판이 다른 묶음); R11 현상금 5목록(한 목록에 III 둘, 13 계열 둘이 화면 그대로); 기밀 상점 6칸 = VI 고정·V 고정·나머지 넷(VI 3·V 3·IV 4·III 4·맹약의 동전 2); 전술 결정은 아군 카드만, 본 횟수 가중. 맹약 시즌 `choices.json`은 바이트 그대로.
- [추정·자료 없음: 판 15개가 정하지 못하는 것 — 안 본 R3 사건 3개의 규칙, 한 번 본 목록은 화면의 6장, 1·9판을 한 R9 묶음으로, R11 목록 수 = 본 5개, 카드 가중치 1 + 나온 횟수, 기밀 상점 칸 나누기, 전술 결정의 칸 구조 없음; 줄마다 `choices.json`의 `assumed`에 적힘]
- 시험: `test/match/regulation-drafts.test.js`(공식 화면 45장이 모두 표에서 뽑힐 수 있음, 6장이 실제로 나옴, 실제 판 경로 R3). 재발 방지: `test/match/regulation-drafts.test.js` — 시즌이 다른 시즌의 표로 지어지면 「never came」으로 실패.

## 진행 보고가 끊긴 담당 브라우저 — 서버가 일찍 넘겨받음 (2026-11-16, 플레이 제보)

- 제보: 「전투가 끝났는데 라운드가 안 끝나서 서버가 이상하다」(관전 방과 실제 판 모두). 전장마다 그 전장의 가장 낮은 자리의 접속한 사람
  브라우저가 전투를 계산하고(`clientCombat.js _authorityFor`) 일반·연합 방어 전장은 결과가 올 때까지 서버가 기다린다. 전에는 접속이 살아
  있는 담당이 보고를 멈추면 시간 제한 + 15초(`_armDeadline`, `RESULT_GRACE_MS`)까지 기다려, 자기 전투가 끝난 다른 사람들이 최대 1분쯤
  「현재 단계 종료를 기다리는 중」에 멈췄다. 보고가 멈추는 경우: 휴대폰 화면 잠금·다른 앱으로 전환(페이지는 멈추지만 WebSocket ping은
  브라우저가 받아 서버는 끊김을 못 봄), 시뮬레이션 모듈을 못 받았거나 전투를 만들다 실패한 페이지(보고도 결과도 안 보냄).
- 고침: 일반·연합 방어 전장도 보스 전장처럼 침묵 감시를 둔다 — 담당이 `b.progress`를 12초(`fields.js FIELD_SILENCE_MS`, 첫 보고 전에는 맡긴
  때부터) 안 보내면 서버가 그 전장을 넘겨받는다(`_armSilence` → `_runOnServer(f, 'silent')`). 브라우저는 전투가 도는 동안 숨은 탭에서도
  약 1초마다 보고하므로(`battle/runner.js`) 정상 담당은 걸리지 않는다. 느렸을 뿐인 페이지를 넘겨받아도 서버 결과는 같은 전투(결정적)이고,
  전투가 원래 끝날 때 풀린다. 일시정지(솔로)는 감시를 멈추고 푼 뒤 정지 시간만큼 미룬다(`pause.js`).
- 재발 방지: `test/match/clientCombat.test.js` 「a connected client that stops reporting」(감시를 끄면 60초 뒤에야 넘겨받아 실패), 기한 쪽은
  같은 파일 「keeps reporting progress but never sends its result」·`test/match/leftovers.test.js` 「solo pause」.
