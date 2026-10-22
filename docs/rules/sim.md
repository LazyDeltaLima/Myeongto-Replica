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
    싱글/협동·인원 구분이 없다. 풀은 서버 값이라 클라 코드로는 확정할 수 없다(클라에는 `ActAutochessBossEntry` 필드만). 인원 비례
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
| 假想敌：铳 `enemy_9017_achunt` 【最终之罚】 | `TraceEnemy` `_targetMotion 1`, `tileOptions heightType 0`(저지대); 돌진 접촉 피해 `targetMotion 3`; 시전 선택기 `Skills/1` `targetMotion 3` | 「位于低地且防御力最高…（不会选择飞行单位…）」「（包括飞行单位）」 | 추적 대상 아님(비행 유닛뿐이면 시전만 하고 돌진 없음, 2026-10-18), 접촉 피해는 맞음 | `groundTargets`·`areaAllies` — 맞음 |
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
켜진 맹약 조건)과 플레이어 결정 대기(전략 차례 50 s 등)는 뺐다.
- **`708caf7d` 중 전투 4건 + 문구** (PRTS 근거, upstream 설계 기록 28.25):
  - 「N번째 공격마다 기절」 적(粉碎攻坚手·码头水手, `archetypes.js nthAttackStatus`)이 그 타격으로 쓰러져 곧바로 다시 배치된 오퍼레이터(不屈·M3茧甲)에는 기절을 걸지 않는다 —
    `ai.js enemyAttack`이 `attack` 훅에 `targetDeployments`(타격 순간의 `deploySeq`)를 넘김.
  - 음유시인 지속 회복(`professions.js installBard`, 浊心斯卡蒂 키트의 특성 전환)은 기절 중에도 계속된다(오라). 클라 근거: 회복은 프리팹 능력
    `AuraAbility`가 붙이는 버프이고, `Entity.OnTick`·`AuraAbility.OnTick`에 기절 검사가 없다(비공개 디컴파일 기록, 가상 호출 2개는 이름 미확인).
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
  upstream v0.2.4는 표시 부분만 받고 「어그로 순서는 그대로」였다 — 관리자 결정 2026-10-11로 PR 원본을 받음. 클라 근거(EN 클라, 레포에는 이름만): 이 둘은 레벨
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
  - 선발(自选) 슬롯의 개인 재고: 협동에서 공용 풀과 같이 ×2 = 16/10(관리자 결정 2026-10-11, PR #477과 같음 — 처음 이식은 v0.2.4대로 8/5였음).
    공용 풀만 ×2면 협동 상점에서 선발 몫이 솔로의 약 절반이 되므로, 선발 몫을 솔로와 같게 둔다. 영상 표에는 선발 행이 없고(upstream 0.2.4 기록 §29.8),
    공식 클라에도 풀·재고 수가 없다(상점은 서버, `GetChessSquad(chessId, playerIndex)` 0x84ED70은 플레이어별 오퍼 대응만) → **[ASSUMED]**(선발 재고 자체가 원래 [ASSUMED], `diy.md`).
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
- **[ASSUMED]**(PR): 면제 장비끼리만 합친 고급이 면제를 이어받고, 산 것과 섞어 합치면 재고를 센다 — 산 것의 몫만(1칸, 고급 말의 `poolHeld`,
  `SharedItemPool.copiesOf`; 2026-10-22까지는 2칸이라 재고 상한 1인 맞춤 규칙 판(`custom-pool.test.js` 협동 판, 谢拉格不融冰)에서 상한을 넘었다).
  면제 장비의 整备는 두 번째 재고 칸을 기다리지 않는다.
- 풀에서 뽑는 특질(洛洛 91 `SERVER_POOL_EQUIP`, 焰尾 149 `SERVER_POOL_CHAR`)과 R11 상점 이벤트의 盟约之币 칸 등 다른 경로는 그대로 재고에 묶인다(PR 그대로).
- 테스트 `test/match/shared-stock.test.js`(PR의 셋 + 다섯 오퍼레이터가 바닥난 재고에서 각자 장비를 받음). golden 변화 없음.

### 상점에 이미 뜬 오퍼레이터 카드는 재고가 0이어도 산다 (관리자 결정 2026-10-11, GitHub #498)
- 근거: 영상 ~2:55 — 넷이 함께 한 상점 갱신 실험에서 星源(오퍼레이터) 카드가 아홉 장 동시에 떴고 모두 사서 팀이 13장 이상을 가졌다(재고를 넘음).
  재고는 상점이 새로 뽑는 것만 거르고, 이미 뜬 카드의 구매는 막지 않는 것으로 읽음. 공식 표·클라 코드에 재고가 없다(서버 규칙, 위 D8).
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
- 동작: `items/battle.js chess_item_5_02_e`가 `onAttackEnemies`(평타 대상마다) 대신 `onDamageEnemies`(피해 한 번마다 — 평타·스킬·범위 피해의 대상마다·지속 피해,
  元素损伤·아이템 발동 피해·처치타는 빼는 우리 공용 도우미, 催泪瓦斯·突袭手雷와 같음)로 굴린다. 확률·寒冷 시간(일반 12 % / 1.5 s, 고급 20 %)은 그대로.
  회피된 평타는 피해가 없으니 이제 안 굴림.
- 테스트 `test/content/items.test.js`(「every damage instance procs」에 일반·고급 추가 — 평타 없이 스킬 범위 피해 두 번에 寒冷). golden은 이 장비를 든 전투가 움직임
  (커밋 메시지·보고에 사례 목록). 그중 roster-047(仇白이 일반·고급 둘 다 듦)은 초반 37 s의 동결 한 번에서 갈라져 판이 뒤집힌다(처치 140 → 77) — 장비 동작의
  오류가 아니라 같은 시드의 연쇄 차이로 확인(寒冷 적용 10 → 23회, 동결 적 시간 0.4 s → 7 s).

### 白面鸮(프틸롭시스)가 복사한 歌蕾蒂娅·余의 준비 시작 증정은 「같은 줄 세 명」을 건너뜀 (GitHub #473, upstream `6bfc0827`)
- 근거: 제보자의 공식 플레이 영상(bilibili BV1XJSoBzEFB 2:30–2:38)을 upstream 관리자가 확인 — 白面鸮가 앞 칸 歌蕾蒂娅(오퍼레이터)·余(오퍼레이터)의 특질을
  복사하면, 白面鸮 줄에도 원래 오퍼레이터 줄에도 세 명이 없는데 증정이 나온다.
- 동작(upstream 그대로): 디스패처가 복사 실행에 `copiedFrom`(원래 오퍼레이터의 말)을 기록하고, `garrisons/meta.js rowCondition`은 「복사한 쪽이 白面鸮,
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
  경우가 실패함을 확인), `test/match/meta.test.js`(`onRefresh`는 특질 먼저, `onPrepEnd`·`onRoundStart`는 전역 → 전략 → 맹약 → 특질). golden 변화 없음.

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
- 테스트 `test/content/enemies_bosses.test.js`(PR 테스트: 접촉 지점 → 저지자 칸 중심·자박·teleport fx·퇴각 뒤 다시 걸음; + 실제 경기 경로 Match 판 → `buildBattleSpec` →
  `createBattleFromSpec`, 角峰이 저지 → 칸 중심·3초 동안 그 자리에서 피해·퇴각 뒤 걸음 — 고치기 전에는 칸 중심 확인이 실패).

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
  죽은 플레이어·떨어진 사본에는 안 보냄. `bonds/core.js HAMMER_HOOKS`·`bonds/addon/meta.js SETTLE_HOOKS`가 이 훅을 들어 밀린 이정표를 바로 정산하고,
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
  넣고, 빈 칸이 없으면 지우지도 알리지도 않고 위치 없이 둔다(다음 갱신에 다시). 넘친 기물을 지우는 클라 코드·「파기됨」 토스트 키는 없다.
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

## 卫戍协议 버프 그래프·클라 코드 맞춤 (2026-10-10, 관리자 결정 「동작 변경 모두 공식이랑 동일하게」)
출처: EN 클라(2026-08) 버프 템플릿 `config/buff_template_holder.ab`의 그래프와 클라 코드(디컴파일, RVA는 EN 판). 핫픽스(DefinedFix.lua en/zh)에 아래 메서드 없음.
- **기습(突袭 `raidShip`)** — 그래프 `act1autochess_bond_eff_raid`(+`[attack]`·`[trig]`·`[skill]`·`[all]`), 착지 노드 `AutoChessRebuildCharacterOnTile.Execute`(0xB4FF20).
  코드 `server/sim/content/bonds/addon/battle.js` 「突袭 relocation」. 뛰는 경우 넷:
  - PASSIVE 스킬 멤버: `[spawn]` 표시가 없으면(아무 점프나 붙임) 범위와 상관없이 → 배치마다 한 번(缄默德克萨斯의 배치 후 스킬은 표에서 PASSIVE).
    `[spawn]`은 durable 버프라 점프 자체(MoveLikeRespawnSelf)에서는 남고, 멤버가 다른 이유로 필드를 떠나면 지움 **[ASSUMED]**(2026-10-06 제보 44 「부활하면 바로 突袭」과 맞춤).
  - MANUAL·AUTO 스킬: 스킬 준비됨(CheckCharSkillAvailable)·안 켜짐·자기 칸과 앞 칸에 적 없음(`CheckHasEnemyInRange` 0xB8C7F0: `_useAttackRange` false면 범위 `1-1`, 적이면 은신·비행 가리지 않고 셈). `[spawn]`과 무관해 적이 그 칸을 벗어나면 또 뜀. AUTO는 2026-10-19부터(아래 「突袭 AUTO 스킬도 준비되면 점프」).
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
- **재능이 고르는 공격** (2026-10-21, fx.md 「다른 필드 투사체」): 모드의 `Body/Talents/<n>`이 `_isModeTalent` 1·`_probKey`인 공격 능력이면 클라는 그
  확률로 공격 **대신** 그것을 시전한다 — 고르는 때는 시전(휘두름) 시작. 시뮬: 오퍼레이터 휘두름 시작에 훅 `swing` { unit, targets, isSkill, signal }
  (`ai.js updateAlly`)을 내고, 키트가 `signal`('T.<n>')을 정하면 'swing' 9번째 칸(앞 칸은 base·null·combat·first로 채움)·그 타격의 'atk' 5번째 칸
  (`performAttack` opts.signal, 圣约送葬人의 `forceAttack`과 같은 칸)·그 명중 피해의 `dmg.signal`에 실린다. 寒芒克洛丝 中的: 스킬 밖(`isSkill` 거짓)
  휘두름에서 prob를 굴려 'T.1', 명중 'hit'에서 `dmg.signal` 'T.1'이면 ×atk_scale·stun; 스킬 모드는 버프 템플릿 `kroos2_t_1[critical]`
  (ON_CALCULATE_DAMAGE Dice)이라 그대로 착탄 때 굴림(`dmg.isSkill`). 전엔 모든 공격을 착탄 때 굴렸다 — 맞히는 확률·배율은 같고 난수 순서만 바뀐다
  (그녀가 있는 golden 13개 시나리오가 움직임: roster 009·011·030, bonds arcane·mira·stead-low·swift, fields boss 2·4·6·hidden 8·10, matches
  coop2-NORMAL-70-diy). 대상이 쏜 뒤 죽으면 그 굴림은 버려진다(클라도 시전 때 고름).
- [추정] 휘두름 중 스킬이 켜지거나 꺼지면(공격 프로필이 바뀜) 타격 때 대상을 다시 고른다 — 클라는 모드를 바꾸고 새 모드의 공격 능력이 따로 대상·쿨다운을
  가진다(아래 차이). [추정] 클립 이름: `ThreePartOneshotAnimation`의 `_oneshotAnim`(`_beginAnim`은 아래 「첫 공격 begin」), 골격에 없는 `_animKey`는 `<key>_Loop`, 그래도 없으면
  렌더가 그 모드에 쓰는 클립(`anims.attack`/`anims.skills[i]`) — 왕 Default, 마운틴 S2·S3, 시·수르트·민트·플레임테일·파투스 스킬 모드 등 10개 능력. 적은 Default 모드의 능력 하나(형태별 클립은 기존 [ASSUMED]).
- 아직 공식과 다른 것: 공속이 바뀔 때 쿨다운 진행 비율 유지(`OnAttackTimeChanged` → `ResetButKeepProgress`) — 우리 `atkCd`는 남은 초 그대로. 모드·능력마다 따로인
  쿨다운(적 Combat/Attack, 스킬 모드) — 우리는 유닛당 하나. 저지가 생기면 오퍼레이터의 Attack 상태가 COMBAT으로 바뀌며 휘두름이 끊기는 것(`AttackState.OnTick`)과
  르무엔 S2의 `_interuptIfTargetDead` 1 — 모델 안 함. `_timeMode` 1·2(오퍼 9개, 적 7개)도 공격 간격으로 계산. `_escapeTime` = 대상이 없어진 뒤 공격 자세(Attack 상태)에 머무는 시간 — `AttackState.<_StartAttack>b__5_0`(0x71ADA0)이 `fixedPlayTime + escapeTime`을
  적고 `_NextAttackOrExit`(0x71B210)는 대상이 없으면 그 뒤에야 IDLE로; 다음 공격 조건(대상·쿨다운)은 같고, 시뮬은 아래 「첫 공격 begin」의 첫 공격 판정에만 쓴다(그 능력만 `esc`), 스킬 쪽
  `BasicSkill.get_escapeTime`(0x63CF80)은 `_useEscapeTime`이 1인 스킬만 — 우리 풀 296개에 없음. 소환물(token)은 데이터가
  없어 휘두름 시작에 바로 타격.
- 테스트: `test/sim/attack-timing.test.js`(오퍼레이터·데이터), `test/sim/feedback5-enemy-swing.test.js`(적: 끊김·헛휘두름·재선택·麻痹), `test/render/attack-swing.test.js`.
  일반 공격 시각이 바뀌어 golden 전부가 움직이고, 첫 공격·스킬 공격 시각을 같은 틱으로 보던 키트 테스트를 「타격까지 기다림」으로 고쳤다.
- **첫 공격 begin** (2026-10-14, 관리자 결정 「첫 공격 begin의 타격 지연을 공식대로」): 공격 능력 옆에 `ThreePartOneshotAnimation`이 있으면 그것이 클립을 틀고
  속도를 정한다 — `UpdatePlaybackSpeed`(0xAEC7B0)가 `InitAnimation`(0xAEC030)의 속도를 능력에 넘기고(참 반환), `InitAnimation`은 배율 = 공격 간격 ÷ (begin(첫 공격일
  때만, `_onlyPlayBeginAnimWhenFirstAttack`) + oneshot + end)를 **그 컴포넌트의** `_minAnimScale`·`_maxAnimScale`(−1 = 제한 없음)로 자른다. `DoPlayAnimation`이
  begin → oneshot 순으로 틀고 타격은 oneshot의 OnAttack을 기다리므로 첫 공격의 타격 = (begin + OnAttack) × 배율. 능력 자체엔 클립이 없어(`_animKey` 빈칸) 휘두름 길이는
  공격 간격 그대로(`AbstractAnimatedAbility.UpdatePlaybackSpeed`의 m_attackTime). 「첫 공격」 = 공격 상태에 들어간 뒤 첫 휘두름: `AttackState.OnEnter`(0x71A720)·
  `CombatState.OnEnter`(0x71C7F0)가 firstAttack 참으로, `_NextAttackOrExit`·`_NextCombatOrExit(false)`는 거짓으로 시전(`AbilityStandard.set_firstAttack`).
  시뮬(`ai.js` `attackTiming`·`endSpell`, 유닛 `atkSpell`): 공격(1)·저지(2) 상태가 바뀐 첫 휘두름, 또는 대상 없는 공격 판정이 지난 휘두름 끝 + `_escapeTime` 뒤에 온 뒤의
  첫 휘두름, 기절·缴械·공격 불가·Skill 상태·퇴각 뒤의 첫 휘두름. 'swing' 이벤트 8번째 칸 1 = begin을 붙인 휘두름(렌더가 begin 클립을 앞에 붙임, `render.md`
  「Spine 클립 커버리지」 C). 데이터 `attackAnim.begin`(begin 클립 초 — 키가 골격에 없으면 렌더 역할의 begin: 텍사스 `Attack_Start`)·`esc`.
  해당 모드(EN 클라 전수 + CN 켈시 에스페란타): 텍사스·엑시아 더 뉴 커버넌트·실버애쉬 더 레인프로스트·리스캄·백파이프·인포서·르무엔·산크타 믹사파라토·
  스노우헌터·비질·인사이더·켈시 에스페란타 Default, 스카디 Default·S2·S3, 르무엔 S2, 送葬人 S2 — begin 0.033~0.667 s. 같은 컴포넌트의 상한으로 바뀐 것:
  실버애쉬 더 레인프로스트 Default 1, 리스캄 Default 2, 르무엔 S2 1(공격 능력의 −1이던 것), 백파이프·비질 Default·비질 S3 −1(1이던 것).
  [ASSUMED] 쿨다운이 남은 채 상태에 들어가면 클라는 OnEnter의 시전이 실패하고 다음 시전이 firstAttack 거짓일 수 있다(읽지 않음) — 시뮬은 그 상태의 첫 휘두름을 첫 공격으로 본다.
  `_minAnimScale` −1(상한 없는 아래쪽)은 안 옮김(전원 −1, 0.1 아래로 갈 간격 없음). 스노우헌터 장전 중 공격(`ReloadAttack` begin `Reload_Break`)도 같은 0.167 s.
  golden 전부가 움직였다(위 오퍼레이터의 첫 타격이 수십~수백 ms 늦어짐 + 'swing' 칸).

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
- **歌蕾蒂娅 S3 缺水的碎漩狂舞 중 일반 공격 없음** (2026-10-14, 관리자 결정 「S3 중에는 일반 공격을 하지 않는다」; charpack `skchr_glady_3` `_switchToState` 1 =
  Skill 상태): 스킬 내내 `noAttack`(`chess_char_4_12-glady.js`), 모델은 `Skill_3_Chant`로 쉰다. 그 전엔 S3 중에도 평소 `Attack`으로 공격했다. 테스트
  `kits_alt_t4.test.js` 「歌蕾蒂娅 S3」.
- **傀儡师 전환 2 s** (2026-10-14, 클라 프리팹): 전환은 순차 능력(charpack `CommonAbilities` `kazema[switch2stand]`·`[switch2normal]`, 归溟幽灵鲨 `ghost2[…]`도
  같은 꼴) — SwitchBegin이 보호 버프(`*_switchbegin`: 무적·불사 등, INFINITY)를 걸고, 죽는 클립과 나오는 클립이 각각 제 길이(`_timeMode` 1, `_maxAnimScale` 1;
  风丸 `Die_2`→`Start_B`, 돌아올 때 `Die_B`→`Born`(=`Start`), 归溟幽灵鲨 `Die`→`Start_B`, `Die_B`→`Start_2`, 모두 1 s), 나오는 단계의 `BuffAfterAffecting`(OnEvent
  2 = 시전 시작에 표시, `OnTick`이 능력이 끝난 뒤 `AddBuff`)이 그 클립이 끝난 뒤 `*_switchend`(보호 버프를 지우는 ClearAllBuffs + SwitchMode)를 건다 →
  `professions.js DOLL_SWITCH` 2(전엔 1 s [ASSUMED]). 远牙가 준 특질로 바뀌는 다른 오퍼레이터도 같은 2 s([ASSUMED]: 그들의 클립은 안 봄).
- **迷迭香 感知稳定은 오라** (2026-10-16, charpack `char_391_rosmon/Talents/2`): `_checker`(professionMask 32 = 术师, minCount 1)가 맞는 동안 붙는 Aura —
  术师 하나(`_maxNum` 1)와 그녀(`_selfOption`)가 `rosmon_t_2`를 지니고, 그 术师가 떠나면 빠지고 다른 术师가 받으며(`_removeBuffWhenTargetLeave`), 그녀가
  떠나면 모두 빠짐(`_removeBuffWhenAbilityDetached`); 그녀 뒤에 배치된 术师도 받는다. 그 전엔 배치 순간 한 번 골라 붙인 뒤 지우지 않아, 그녀가 떠나도
  남고 재배치마다 다른 术师에 쌓였다 → `chess_char_6_12-rosmon.js`(배치마다 0.25 s 확인). [ASSUMED: 새로 고를 때 무작위, 0.25 s 간격]. 테스트
  `kits_t6.test.js` 「感知稳定 is an aura」.
- **风笛 精密填弹은 타격마다 굴리는 추가 피해** (2026-10-16, 버프 템플릿 `bpipe_t_1`): ON_CALCULATE_DAMAGE마다(한 공격의 타격마다 — S2 2타·S3 3타가
  각각) `prob` → 그 타격 ×`atk_scale`(AtkScaleUp) + SplashDamage(RVA 0xDA29F0: 그녀 공격의 대상 선택기로 맞은 적을 뺀 한 명, 물리·NORMAL 공격, 그녀 공격
  배율 ×`atk_scale`, `effect` `bpipe_attack_02_hit`; `avoid_dup_trigger_lock`으로 그 피해는 다시 안 굴림). 그 전엔 공격마다 한 번 굴려 둘째 적을 **공격 대상**에
  넣어 'atk'·일반 명중 이펙트까지 그 적에 나왔다 → `chess_char_4_07-bpipe.js`('hit' 우선순위 1: 모듈 115 %보다 먼저 원래 피해를 읽음, 추가 피해는 SP 없음).
  테스트 `kits_t4.test.js` 「风笛 S2」.

## 적 스킬 = 일반 공격 차례 (2026-10-21, 관리자 제보 「퀸투스가 HP가 낮아지면 기억보다 너무 셈」, 관리자 결정 2026-10-21 「엔진 전체로」)
적 스킬(enemy_database `skills`)을 EN 클라 코드대로 일반 공격 **자리에서** 쓴다. 켜진 Lua 핫픽스(`DefinedFix.lua` en_US·zh_CN)에 아래 클래스 없음.
- **공식**: 적의 MOVE 상태가 틱마다 `Enemy._SearchAttackTarget` → `Enemy.AttackWrapper.SearchTarget`(RVA 0x81CCE0)을 부른다. 일반 공격 능력이 `isReady`(쿨 끝)일
  때만 스킬들을 보고, `EnemySkill.CheckFamilyMask`(ATTACK)·`CheckAvailable`(0x3A03FC0: 켜짐·쿨·`_ignoreSilence` 아니면 침묵/기절 아님·`isSkillActivatable`·SP)을
  통과하고 대상을 찾은 스킬 중 `priority`가 가장 높은 것(같으면 `IBattleRandom.Uniform`)을 고른다. `AttackState.OnEnter` → `AttackWrapper.Cast`(0x81C8A0)가 그 스킬을
  **일반 공격 대신** 시전하고(`EnemySkill.CastToTarget`), 시전한 능력이 일반 공격이 아니면 `mainAttack.ResetCooldown(true)` — 일반 공격 쿨이 처음부터 다시 돈다.
  막힌 근접 적의 Combat도 같은 구조(`CombatWrapper._PickAbility` 0x8216B0: 우선순위·COMBAT 가족). 스킬 자신의 쿨은 시전 중 멈추고(`EnemySkill.OnTick` 0x3A04B20:
  `isCasting`이면 갱신 안 함) **시전이 끝날 때** 다시 시작한다(`_OnCastFinish` 0x3A05480: `m_cooldownTimer.Reset`) → 다음 준비 = 시전 길이 + 쿨. 그 스킬의
  `_resetMainAbilityCdWhenCastEnd`면 그때 일반 공격 쿨도 `ResetCooldown(_resetCdWaitFirstPeriod)`. `Enemy.TriggerEnemySkill`(0x80E320)은 강제 시전 경로로, 역시
  공격·전투 래퍼로 보낸다. 모드의 적 프리팹 스킬 126개는 모두 `_familyMask`에 ATTACK이나 COMBAT이 있다(3이 109개, 2가 9개, 1이 7개, 31이 1개).
- **우리**: `server/sim/ai.js` `enemyAttack`이 공격 차례(쿨 끝·지난 휘두름/시전 끝·麻痹震颤 아님, 恐惧·缴械·战栗(막힘) 아님)에 대상을 찾기 **전에** 훅
  `enemySkillSlot`을 내고(docs/SIM.md 훅 표), `server/sim/content/enemies.js` `onSkillSlot`이 준비된 스킬(`cond` = 대상 조건, `canCast`)을 위 규칙대로 하나 골라 시전한다:
  일반 공격 쿨 = 간격 전체(또는 `resetMain`이면 시전 끝 + 간격/0), `castLeft` = 시전 길이(그동안 일반 공격 없음, 「不停止移动」이 아니면 서 있음), 스킬 쿨 =
  쿨 + 시전 길이. 시전 길이 = 스킬 능력 클립 × clamp(공격 간격 ÷ 클립, 0.1, `_maxAnimScale`) **[ASSUMED: 스킬 능력도 적의 공격 간격을 공격 시간으로 읽음]**.
  데이터: `tools/local-extract/attack_timing.py`가 적 프리팹 `EnemySkill`(`_familyMask` 있는 MonoBehaviour)과 같은 GameObject의 애니메이션 능력(`_animKey`·`_maxAnimScale`)을
  `tools/assets/local-attack-timing.json` `enemies[…].skills`에 쓰고, `tools/build-data.mjs` `enemySkillCast`가 `data/enemies.json` `skillCast`(스킬 이름 소문자 →
  `family`·`clip`·`dur`·`max`·`resetMain`·`waitFirst`, 클립 길이는 `data/assets.json`)로 싣는다. 템플릿 `overrides.skills`도 같은 이름으로 찾는다.
  **[ASSUMED]**: 일반 공격이 없는 적(`noAttack`·`none`·ATK 0)과 키트 자체 타이머(표에 없는 이름)는 예전처럼 제 쿨로 쏜다(공식은 그런 적에게도 공격·전투 능력이
  있다 — 우리가 그리지 않을 뿐); ATTACK·COMBAT 가족을 막힘 여부로 나누지 않음(가족 1·2인 16개는 키트 `cond`가 대신함); 스킬 쿨에 `slowDown`을 곱하지 않음
  (`OnTick`은 곱함); 형태가 바뀌어도 일반 공격 쿨은 이어짐; 클립이 매니페스트에 없는 스킬 3개(`enemy_9014_acstma` `2`·`enemy_10065_ftzlc` `onfire`·
  `enemy_10141_xdpeng_2` `switch`)는 시전 길이 0.
- **퀸투스(盐风主教昆图斯) 셋째 형태**: 공격 차례 3.5 s마다 하나 — 【大潮】(쿨 3.5 + 시전 1.667 = 5.167 s)가 차례를 하나 건너 7 s마다, 그 사이 차례는 일반
  공격, 【崩坍】(시전 3 s)·【断裂生殖】(2 s)는 차례 하나를 차지한다. 이전에는 3.5 s마다 일반 공격(2명 × ATK 100 % 물리 + 20 % 신경) **과** 【大潮】(전원 ×
  20 % 법술 + 20 % 신경)가 함께 나가 셋째 형태 출력이 공식의 두 배 가까이였다(첫째·둘째 형태는 스킬 쿨 35~40 s라 차이가 작음). upstream PR #799(열림)는
  퀸투스 스킬만 공격 쿨을 소모시키는 부분 수정이다.
- **옛 동작**: 스킬은 쿨이 차면 바로, 일반 공격과 따로(즉시) 나갔다. 테스트 `test/content/enemy-skill-attack-slot.test.js`, 고친 것:
  `hidden-gun-pursuit.test.js`(【末日布道】 = 준비 뒤 다음 공격 차례), `boss-patterns-real.test.js`(铳 휘두름 간격은 스킬이 끼지 않은 쌍),
  `feedback5-cb4-pins.test.js` item 52(공격 + 스킬 시전 = 공격 차례 수), `enemies_bosses.test.js`의 발동 시각.

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
    [추정] 충전 중 겨눈 대상이 죽어도 쏨(스킬 `_allowNoTarget` 1), 출발점은 몸 중심(MUZZLE 높이 무시 — 2026-10-21: 클라 Graphic은 x축 −30° 기울고
    0.27배라 MUZZLE의 높이가 맵 y로도 옮겨진다; 셋업 포즈로는 앞 +0.57·위 +0.19칸이지만 쏘는 프레임의 뼈 위치를 안 읽어 그대로), 축 고르기의 동률(대각선
    정확히 45°)은 가로. 사거리 CROSS_REACH 6 [ASSUMED]은 그대로.
  - 스킬 대상 고르기 (2026-10-21, 클라 코드 `AdvancedSelectorWithTrapSheltr.OnPostFilter` RVA 0x77BD70, 프리팹 `Skills/CrossAttack/Selector` — 루트 자리):
    `_checkOnTheSameLine`이면 「자기 위치 − 후보 위치」의 x가 −0.5…0.5(`_offsetMinX/MaxX`)이거나 y가 −0.5…0.1(`_offsetMinY/MaxY`)인 후보만 남는다
    (`MathUtil.Between` = min − ε < v < max + ε). 그래서 같은 줄은 위로 0.5·아래로 0.1까지(이전: 위아래 ±0.5 미만). `enemies/invisible.js kitCrossbow`.
    확인 `test/sim/enemy-buff-tags.test.js`.
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
  - “碎铳之簧” `1`: 元素护盾 탄(`projectile_enemy_actrpb` 15, 튕김은 `_speedAfterFirstReach` 6)은 닿을 때 피해·침식, 튕김은 맞은 대상에서 출발;
    频次护盾 十连击(`projectile_enemy_actrpc` 10)은 0.1 s 간격 열 발(아래 「“碎铳之簧”…」).
  - 假想敌：管 `1`(`projectile_enemy_acduml` 10): 0.25 s 간격 세 발이 余音에 닿을 때 폭발·余音 피격. 假想敌：弦 `1`(`projectile_enemy_acdumm` 10): 金 余音에
    닿을 때 폭발·暗 전환. 둘의 일반 공격도 공식 `proj`(같은 키, 10)로 날아 닿을 때 폭발(아래 「假想敌：管·弦 일반 공격…」).
- **'dmg' 이벤트 6번째 = 공격자 unit id** (`server/sim/damage.js attackerId`): 일반 공격, 키트가 `battle.dealDamage`로 넣는 스킬 피해('atk' 없음 — 키트
  약 60개), DoT(건 유닛), 소환물(자기 id). 无来源(원소 폭발, `periodicDamage`)·출처 없는 피해는 null. 원소 게이지
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
  쓰러지면 회복 없음. 투사체 없는 치료(白面鸮·华法琳·调香师·瑰盐)는 예전처럼 즉시. 연쇄 치료의 튕김은 예전처럼 즉시 [추정]. 닿을 때의 처리는 공격 순간의 상태를
  따른다: 스킬의 `onHit`은 공격 때 스킬이 켜져 있었으면 부르고(`ai.js doHeal` `skillOn` — 流明 S1 沐雨의 비가 다음 치료 스킬이 끝난 뒤 닿아도 생김), 치료에
  `opts.isSkill`(스킬 프로필의 치료)을 실어 莎草 博览古卷 보호막의 스킬 배율이 붙는다. 流明 S3는 닿을 때 대상이 아직 이상 상태면 해제(공격의 플래그는 그때 이미 지워짐).
- **바뀐 값** (기본 모드, 3칸 기준): 투사체 없음 → 즉시 — 能天使(Default)·夕·莫斯提马·寒檀·莱恩哈特·雷蛇·送葬人·松果, 银灰 `projectile_svrash` NONE, 迷迭香
  `projectile_chr_rosmon_A` ATTACH; 대부분의 저격·근거리 원거리 14 → 10(隐现·空弦·雪猎·拉普兰德·断崖·仇白·崖心·歌蕾蒂娅·伺夜 …), 캐스터 11 → 10; 빠름: 深靛·格雷伊
  20, 新约能天使 30, 惊蛰·异客 15, 寒芒克洛丝 18, 蕾缪安 12; 느림: 初雪·巫恋 6, 灵知 9, PARACURVE 流星 6·缪尔赛思 7·锡人·号角·灰毫 5. 메카 캐스터는 본체 투사체
  (洛洛·至简·耶拉·荒芜拉普兰德 10). 전체 대조 표·측정 도구는 관리자 메모(오퍼레이터 투사체 속도 대조).
- **렌더** (`render/fx/speeds.js opProjSpeed`, `fx/projectiles.js shotSpeedOf`): 같은 shot으로 절차 투사체·공식 꼬리(`fxgame.js trailShot`)의 비행 시간을 맞추고,
  날지 않는 shot은 그리지 않는다. 모드는 렌더의 `_fxSkillOn`·`skillIndex`, 저지 대상은 「저지된 적이 1.2칸 안」으로 짐작 [추정]. `FxSystem`에 `lookupDef`를
  넘김(`render/app.js`) — 2026-10-10부터 있던 절차 적 오브의 공식 속도(`enemyProjSpeed`)도 그동안 기록을 못 읽어 10으로 그려졌다. 화면 확인(2026-10-16, Windows
  Chrome 디버그 아레나, 샌드백 3칸): 隐现 절차 0.297 s·공식 꼬리 ≈ 0.29 s, 能天使 투사체 없음, 流星 0.50 s, 深靛 0.15 s, 오류 0. 실제 판 [화면 미확인].
- [추정] 로즈몬티스 S2·산탈라 S2의 AttachToTarget은 `_immediatelyReach` 0(닿는 시점이 다른 신호)인데 즉시로 둔다. 시뮬 틱(1/30 s) 때문에 비행은 한 틱 일찍 닿을 수 있다
  (적 투사체와 같음).
- 안 한 것: 蒂比(스카이레인저)는 시뮬이 근접(투사체 없음)으로 다뤄 클라 TRACE 10이 안 들어감. 키트가 직접 쏘는 투사체(스킬 'strike' 등)는 키트 값 그대로.
- 테스트 `test/sim/op-shot.test.js`(데이터·비행 시간·저지·렌더 짝·실제 판 경로의 치료 지연). 원거리 오퍼레이터 피해 시각이 바뀌어 golden이 움직인다.

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
- 그 점에 오퍼레이터·소환물이 서 있어도 나온다(2026-10-12 관리자 제보 「모델이 아예 안 보여」): (11, 7)은 배치 칸이라 자주 차 있는데,
  `spawnToken`이 키트가 비행(`FLY`)으로 바꾸기 전에 빈 칸만 받아, 그 칸에 누가 서 있으면 炎佑가 통째로 빠졌다. 이제
  `force`로 넘기고 `Battle._deploy`의 비행 유닛 규칙(칸을 차지하지 않음)에 맡긴다 — 그 칸의 유닛은 그대로.
- 테스트 `test/content/yanyou-spawn.test.js`.

## 관리자 결정 2026-10-11 — 즉발 스킬의 시전 · 보스 포털 · 자작 원소 · 저항 · 麻痹震颤
근거: 클라 코드(EN 클라 2026-08, Il2CppDumper 덤프)와 스킬 프리팹(`battle/prefabs/[uc]skills.ab`).

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

### 战栗 면역 (2026-10-15)
- **규칙**: 战栗(`tremble`)은 적 데이터의 战栗 면역(`disarmedCombatImmune` → enemies.json `otherImmunities` 'disarmedCombat')이 막는다. 클라 버프
  템플릿이 战栗을 걸기 전에 `CheckAbnormalImmune(DISARMED_COMBAT)`로 거른다(예: `enemy_vtmstr_equip_B_attack_disarm[char]`). 대상: 折桠 S1·战栗维式重锤·
  冲击式施术单元(알리스테어 장비를 든 오퍼레이터).
- **옛 동작**(upstream부터): 恐惧 면역(`feared`)이 막았다 → 恐惧만 면역인 7종(假想敌：胄 ×2·管 ×2·弦·阿利斯泰尔·乌顶巨角卢鲁 `enemy_10144_xdelk_2`)이 战栗도 막았고, 战栗만 면역인
  愧悔魂灵圣杯는 걸렸다. 그중 胄·管·阿利斯泰尔은 자박·저지 불가라 战栗(저지당했을 때만 공격 못 함)이 걸려도 효과가 없다.

### 괴사 손상의 SP 감소와 지속형 스킬 (결정 4 조사, 동작 그대로)
- 클라 코드 `Entity.DoApplyModifier`(0x35F6B50)의 SP 갈래: `SP_MODIFY_STOPPED`면 거부, `spRecoverStopped`(지속형 스킬 중 주인 플래그)는 **증가만** 막는다 →
  감소는 지속 중에도 들어가지만 깎이는 것은 남은 SP뿐이고 지속 시간은 능력 타이머라 줄지 않는다. 1회 충전 지속형은 시전 때 SP가 0이라 결과가 같다 —
  `damage.js`의 「지속 중엔 건너뜀」은 그대로(차이: 충전 2회 이상 지속형의 남은 충전, 스와이어 디 엘리건트 위트 스킬 중 `SP_MODIFY_STOPPED` — 미구현).


## 최종 공세·히든 코어 보스 패턴 (2026-10-14, 공식 클라 대조)

근거: 공식 클라(EN 2026-10-14 판)의 적 프리팹·투사체 프리팹·버프 템플릿과 그 판의 클라 코드. 번호(RVA)는 그 판 기준.

### 假想敌：铳 공속 스택 (`kitGun`)
- **규칙**: 공격할 때마다, 대상이 마지막 대상과 다르면 스택을 비우고, 그다음 **항상** 1스택(+`2.attack_speed` 80, 최대 `2.max_stack_cnt` 5)을 더한다 →
  새 대상 첫 공격 뒤 공속 80, 같은 대상 n번째 공격 뒤 n스택. 공속 하한 20은 첫 공격 전에만 보인다. 클라 코드 `BrownbTalent_1.Apply`(0xC547E0): 마지막
  대상과 다르면 `OverrideGroup.Clear` 뒤 대상 갱신, 이어서 무조건 `Entity.AddBuff(_stackBuff)`(프리팹 `Talents/2`, ATTACK_SPEED).
- 쿨다운 (2026-10-15): 스택은 공격이 대상에 시전되는 순간(`BrownbTalent_1.Apply`는 공격 어빌리티의 부착물 — 우리 'attack' 훅, 타격 순간) 붙고, 클라는
  공속이 바뀌면 도는 쿨다운의 진행 비율을 유지한다(`OnAttackTimeChanged`, 위 「일반 공격 타이밍」) → 휘두름에서 다음 휘두름까지
  t + (1 − t/T_old)·T_new(t = 휘두름 시작부터 타격까지, T = 4.5 × 100 / 공속). 우리 엔진은 남은 쿨다운에 T_new/T_old를 곱한다. 옛 [ASSUMED] 「그 공격의
  쿨다운을 휘두름 시작부터 새 공속으로 다시 잼」(새 대상 첫 공격 뒤 5.6 s)은 t = 0일 때만 같았다(공식 대조 research/sim/2026-10-15-boss-assumed-check 1번).
- **옛 동작**: 같은 대상일 때만 공격 **뒤** 1스택, 새 대상 첫 공격은 0스택 → 하한 20(다음 공격까지 22.5 s), 최대 스택이 한 타 늦음. 테스트
  `enemies_bosses.test.js` 「假想敌：铳: unblockable…」(3타 뒤 240, 휘두름 간격 = 위 식), 실제 판 경로 `boss-patterns-real.test.js` 「real boss_2 field…」.

### 假想敌：铳 【未尽的告解】 감쇠 대상 (`kitGun`, 2026-10-17)
- **규칙**: 히든 총은 나타난 뒤 **0.03 s에 한 번만** 동료 하나를 고르고, 감쇠(물리·법술 × `4.damage_scale` 0.2)는 **그 하나가 필드에 있는 동안만** 걸린다.
  고른 동료가 쓰러지면 다른 리드·총이 남아 있어도 영구히 풀리고, 다시 고르지 않는다. 0.03 s에 아무도 없으면 감쇠는 끝내 없다.
- 근거(EN 클라 2026-10-14 판): 공유 총 프리팹 `CommonAbilities/Ability0`의 `achunt_passive`(`triggerCnt` 1·`triggerInterval` 0.03) ON_BUFF_TRIGGER가
  총의 `BossSelector`(자기 진영, 버프 `achunt_mark` = 다른 총·“碎铳之簧” 셋, `_postFilter` HATRED_DES, 최대 1, 자신 제외)로 하나를 골라
  `achunt_mark_by_boss`를 주고, 그 버프의 ON_BUFF_START가 총에게 `achunt_summonee`를 **파생 버프**로 붙인다. `Buff.AddDerivedBuffSafe`(0x39A9560)가
  부모에 등록하고, 부모의 `OnFinish`(0x39ADE40) → `ClearDerivedBuffsIfNot`(0x39A9BC0)이 파생 버프를 끝낸다. 감쇠 템플릿 `achunt_take_damage`(`Talents/4`)는
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
  - 화면 [화면 미확인]: 돌진 중 모델은 `Skill_1` 클립으로 걷는다(form `charge`, `render/units.js` FORMS), 끝나면 fx `chargeEnd`(그림 없음)로 Default로 돌아간다.
- 근거(EN 클라 2026-10-14 판, Lua 핫픽스에 없음): 프리팹 `enm_pfb_28.ab` `enemy_9017_achunt` — `Skills/1`(버프 `achunt_s_1`: SwitchMode S1 →
  `TriggerAbilityUseSelector TraceEnemy`, 대상 없으면 SwitchMode 0), `Modes/S1/Body/Talents/3`의 패시브 버프 `achunt_s_1[speed]`(`attributeType` 6 MOVE_SPEED,
  `formulaItem` 0 = ADDITION, 블랙보드 값; `durationKey duration`; ON_BUFF_FINISH → SwitchMode 0), `_replaceAnimPairs` Move → Skill_1,
  `Modes/S1/Body/GeneralAbilities/TraceEnemy` = `SimpleTraceTargetAbility`(`_searchCoolDown` 0.3·`_traceRandomOffset` (0.4, 0.4)·`_updateDistSqrEps` 0.1·
  `_findNearbyReachableTile` 1·`_disableWhenReached` 1·`_reachedThreshold` 0.4·`_buffsWhenReachedTarget` `achunt_s_1[reached]` → SwitchMode 0). 클라 코드:
  `SimpleTraceTargetAbility.OnTick`(0xC977F0: 주기 타이머가 찰 때마다 `_UpdateTraceTarget` → `_CheckReached`), `_UpdateTraceTarget`(0xC984D0: 추적 대상이
  없거나 무효면 `_CleanTraceTarget`; 마지막 위치와 거리² > eps면 `_TryUpdateTraceTargetRoute`, 실패하면 Clean), `_CheckReached`(0xC97A20: 추적 **칸** 중심과의
  거리 ≤ 0.4 → 도착 버프 + Clean), `_TryUpdateTraceTargetRoute`(0xC98010: `Map.TryCalculatePathFindingDistance`, 안 되면 이웃 표 + `CheckGridValid`),
  `OnCastOnTarget`(0xC976B0: 길이 있으면 추적 켬, 없으면 Clean), `TracePositionCursor.ResetReachedOffset`(0x6427F0) → `RandomExtensions.RandomVector2`
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
  (머무는 유닛은 0·1·…·9 s에 10번). fx: 도착 `explode` + 장판 `zone`(kind `helmShell`, `dur` 9.95, `tiles` 'box').
- **옛 동작**: 도착 순간 3×3에 있던 유닛만 `killed.duration` 10 s 기절 + 10회 DoT(`boss:helmShellDot`). 그 자리 유닛 기준 총 피해는 같았다.
- 斩胄之剑·破胄之锤의 돌진 폭발(`acstma_s_1[reach_target]`)은 공식도 도착 순간 스냅샷이라 그대로(`stunBlast`). 테스트 `enemies_bosses.test.js`
  「假想敌：胄 + 刺胄之弹…」.

### 阿利斯泰尔 防护背心 방향 (`kitLion` 【莫非王土】)
- **규칙**: 조끼를 활성화할 때마다 막는 면이 번갈아 바뀐다(클라 버프 템플릿 `enemy_vtlionk_shld`의 `front` 토글) — 알리스테어 유닛마다 첫 조끼는 **앞면**(보스가
  바라보는 쪽), 그다음은 직전의 반대쪽. 5000 보호막이 남아 있는 동안 그 면(공격자의 칸 위치)에서 온 피해 ×(1 − `damage_resistance`).
- **첫 면 = 앞면** (관리자 결정 2026-10-15, 공식 대조 research/sim/2026-10-15-boss-assumed-check 3번): 보스 `CommonAbilities/Ability0`의 `enemy_vtlionk_unmove`에
  블랙보드가 없어 `front`가 0에서 시작 → 첫 조끼의 ON_BUFF_START가 1로 바꿈 → FRONT. 노드 `Execute`(0xD805F0)는 보스 `get_faceTo`를 4방향으로 맞춰 열을
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
  바로 위 오퍼레이터는 한 발에 凋亡 3번(余音 둘레·자기 둘레·자기). **余音 자신도 凋亡 25 %** (2026-10-15): `ApplyElementDamage.Execute`(0xD928F0)에 진영 검사가
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
  PHYSICAL)로 거른다 — 공격의 주 대상 물리 피해만 ×`damage_scale` 0.1 + 그 출처에 무출처 물리 附加 `atk_scale`·침식 `ep_damage_ratio`. 스플래시(SPLASH 2)·
  附加(ADDITION 8)·상태 틱(BUFF 4)·키트 자체 피해의 물리는 그대로 들어가고 반격도 없다(클라 `Modifier.SourceAttackType`). 법술 흡수(`BlockDamage` MAGICAL)는
  공격 종류를 안 거른다. [ASSUMED] 엔진 대응: NORMAL = `isAttack`이면서 `isSplash` 아님(일반 공격·공격형 스킬의 주 대상, 연쇄 튕김 포함) — 공격이 아닌 스킬
  피해 중 클라가 NORMAL로 내는 것도 있으나 우리 엔진은 구분하지 않는다. 옛 동작: 모든 물리 피해 ×0.1 + 반격. 테스트 「“碎铳之簧” 法术护盾 (9018)…」.
- **频次护盾은 모든 피해를 막는다** (2026-10-17): `actrpc_t_1`의 `BlockDamage`는 `_filterDamageType` false라 `_damageMask` PHYSICAL_AND_MAGICAL을 읽지
  않는다(`BlockDamage.Execute` 0xD949D0: 취소되지 않은 피해 모디파이어면 종류 무관) → 물리·법술·진실·元素伤害를 가리지 않고 다섯 번 막고(막은 것마다 한 번) 깨진다.
  막힌 피해는 총에게 넘어가지 않는다. [ASSUMED] 원소 게이지 피해(元素损伤)는 피해 모디파이어가 아니라 세지 않는다(우리 엔진도 `hit` 전에 갈라짐).
  옛 동작: 물리·법술·진실만 막고 元素伤害는 통과·전달. 테스트 「“碎铳之簧” 频次护盾 (9020): every damage type…」; `playtest5_elements.test.js` 「a 无来源
  burst…」의 리드는 9018로 바꿈.
- **전달 몫도 공유 풀·限伤을 거친다** (2026-10-17 확인, 지금과 같음): 전달 노드 `FixedValueDamage`의 `_skipModifierEvent`는 `SKIP_MODIFIER_EVENT`를 세우지만
  `Entity.ApplyModifier`(0x3A17E00)의 건너뜀 경로도 게임 모드 훅(`IGameMode` 슬롯 0x53 → 오토체스 보스 풀·限伤)을 지난다. 전달 몫은 PURE라 총의
  【未尽的告解】 감쇠를 받지 않는다 — 리드를 치면 총이 감쇠 없이 깎이는 것은 공식과 같다.
- **频次护盾 十连击**: `Skills/1` `_additionalTimes` 9·`_triggerDelta` 0.1 → 0.1 s 간격 열 발, 발마다 ATK × `atk_scale` 0.5 물리. 대상은 첫 발의 대상으로
  고정(`_selectTargetSource` INPUT_TARGET·`_selectTargetTiming` AT_BEGINING·`_interuptIfTargetDead` 0, `MultiRangedAttack.UpdateTargets` 0xBF5E50) — 도중에
  죽으면 남은 발은 버려진다(2026-10-15, 옛 [ASSUMED]: 다시 고름). 테스트 「“碎铳之簧” 频次护盾 十连击…」.
- **피해 전달**: `actrp*_passive`가 받은 피해(`hp_lose`)를 `BossSelector`(enemy_9017_achunt + `achunt_mark`, HATRED_DES, 최대 1)로 넘긴다(`actrpa_hp_trans`,
  PURE·무출처) — **총에게만**. 총이 둘이면(히든 2인 판 `boss_battle_multi_player`) HATRED_DES = 도발 × k − 출구까지 남은 거리(`Enemy.get_hatred` 0x815180)라
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
  이미 켜져 살아 있는 子代를 다시 켜면 **새 子代로 바뀐다** — `Scheduler.TryActivePredefined` → `BattleController._CreatePredefinedCharacter`(0x3987750)가
  `CreateToken`으로 새로 만들고 `Tile.ClearCharacterIfExists`로 그 칸의 유닛을 지운 뒤 세운다 → 유체 12 s·수명 35 s를 다시(셋째 형태의 쿨 18 s가 수명보다
  짧아 생김; 2026-10-15, 옛 [ASSUMED]: 아무 일 없음, 테스트 「断裂生殖: switching on a 子代 that is still alive…」). 수치는 waves.json 템플릿 `devices[]`(build-data
  `templateDevice`: character_table HP 3000·ATK 150, 숨은 天赋 `1.grow_duration` 12·`1.duration` 35, 스킬 `sktok_dstnta` SP 1·`ep_damage_ratio` 1).
  적 진영 유닛(부품 `part`: 처치 수·LP·보상 없음, 시간 초과 때 누수 아님). 라운드 적 효과의 HP·ATK 배율은 **받지 않는다**: 룬 `enemy_attribute_mul`
  (`EAttribuesMul : BasicEnemyRune`, `RuneManager._RegisterRuneClasses` 0xA01CE0)은 `DoPreprocessEnemy(EnemyData, Enemy)`뿐 — 子代는 character_table 토큰
  (`Trap`)이다(2026-10-15, 옛: 다른 소환물처럼 `summonMods`; 急行军 이속은 정지 토큰이라 무관). 테스트 「the round's enemy HP / ATK effects do not reach…」.
- **유체**: 12 s 동안 隐匿(클라 토큰 프리팹 `Modes/Default/Body/Passive`: INVISIBLE, 기절·침묵·빙결 면역). PRTS의 10 s는 클라 값과 다르다. 그 뒤 Grow 능력
  (Start_02 1 s): 시작에 隐匿이 풀리고(`ON_CAST_START`) 끝에 GrowUp 모드(`ON_CAST_END`, 면역도 함께 사라짐). 오퍼레이터는 隐匿이 풀린 뒤 공격할 수 있다
  (character_table 「可以受到我方攻击」), 받은 피해는 보스에게 넘어가지 않는다.
- **摄食**: GrowUp에서 SP +1/s, 1이 차면(성장 끝 1 s 뒤) 자기 둘레 반경 1.0(스킬 Trigger CircleCollider2D — 자기 칸과 상하좌우, PRTS 「周围四格」) 안에서
  가장 가까운 오퍼레이터 1명(`DIST_TO_SOURCE_ASC`, 도발 무시)을 붙잡는다. 공격 이벤트를 기다려(`_waitForAttackEvent`: Attack_Begin 0.833 s + Attack_Loop
  0.1 s) 첫 타, 그 뒤 1 s마다(`_triggerDelta`) ATK 100 % 물리 + ATK × 1.0 신경 + 1 s 기절(`trap_tentac_s[stun]`). 능력이 `ChannelingMeleeAttack`이고
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
  배율 3.4 확인(공식 대조 11번): `EnemySkill.AssignData`(0x3A033B0)가 스킬 블랙보드 `range_radius`, 없으면 `GetModeRangeRadius` = enemy_database
  `rangeRadius` 3.4 — `store`/`storeA`에 `range_radius` 없음.
  둘 다 HATRED_DES 최대 `max_target`(≤50 % 2) — 장비는 움직이지 않아(moveCursor 없음) 위협도가 모두 같고, 동률은 `WeightedTarget.CompareTo`(0x4A5EAA0) →
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
  - 탑승: `OnTick`(0xC38A90)이 버든비스트가 기절·빙결·부유·수면이 아닐 때 매 틱 `_SearchPassengers`(0xC3A120) — 승객이 `max_cnt` 미만이면 Selector
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
- 근거: PRTS 作战机制 「关于碰撞体积与远程索敌，碰撞箱碰撞是为最常用的方式，索敌抬手等均使用碰撞箱」. 클라 역어셈(관리자 노트): 적 프리팹 루트의
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
- **[ASSUMED]**: 범위 오라·스킬 효과 칸·특성 범위가 평타처럼 프리팹 선택기(물리 겹침)를 탄다는 것(역어셈은 평타 선택기만 직접 확인, 스킬 쪽은 일부만 따라감).
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
    0이면 부유만(荒芜拉普兰德 S2). **[ASSUMED]** 본체가 먼저, 같은 착탄 순간(부유 유닛의 따로 나는 탄·시간은 모델링 안 함), 한 일제 사격에 램프 한 칸.
  - `installFunnel`: 일반 배치(재배치·부활 포함)마다 대상·램프·대상별 맵 초기화, 자유 이동(`deploy`의 `move: true`)은 유지. 날아가는 탄은 착탄 때 램프를 계산.
  - 耶拉(두 형태) S2: 본체 평타는 사거리 안에서 그대로, 그동안 부유 추가 피해는 끔, `1 + attack@cnt`개의 풀린 부유 유닛이 적이 죽거나 스킬이 끝날 때까지
    고정해 스킬 피해(`kjera:drone`). 기본형은 대상별 램프를 이어 쓰고 되돌려 줌, 숨은 형태는 init부터·되돌리지 않음. **[ASSUMED]**(upstream): 풀린 부유 유닛도
    특성 램프, 비행 시간 없음, 선택 불가가 된 고정 대상은 놓고 다시 고름, 기절·무장 해제가 멈추지 않음.
  - 洛洛 S2: 풀린 부유 유닛 하나가 자기 틱으로(`rockr:drone`, 스킬 피해) 고정 대상을 침 — 살아 있고 선택 가능하면 본체 사거리 밖이어도 유지, 처치·스킬 끝에 돌아옴.
    램프는 유닛 자신이 들고 있어 스킬 전 탄이 바꾸지 못함. 스킬이 끝나면 램프를 특성에 돌려줌.
  - 荒芜拉普兰德 S1(토글)은 본체 + 두 부유 추가 피해, S3는 자기 경로 그대로. 澄闪 부분은 우리 풀에 없음.
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
  `Talents/Bus`는 로컬 추출에 없어 대조하지 않았다(재덤프 안 함).
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
  버프 `sand_storm[ally]`·`[enemy]`·`[trap]`을 블랙보드 `duration` 1500 s 동안 건다. 버프 템플릿(EN `buff_template_holder`, 참고 덤프 「공식 버프 템플릿 추출」)은
  `ON_BUFF_TRIGGER`마다 `HasCertainCharacterInFrontOfMe(trap_032_mound)`로 가려졌는지 본다. 틱 간격 = 블랙보드 `interval` 2 s(`Buff.Reset`이 bb `interval`을
  `triggerInterval`보다 먼저 씀, 디컴파일로 확인), 아군·적은 붙자마자 첫 틱(`waitFirstTriggerInterval` false).
- **가려짐(코드로 확인)**: `HasCertainCharacterInFrontOfMe.Execute`(RVA 0xE0A970) — 유닛 칸에서 `InverseDirection(폭풍 방향)`으로 `GetGridPositionsAlongTheDirection`
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

## 리더 방벽 층 셋 — 층마다 블랙보드 양 전부 (2026-10-21, 관리자 결정 2026-10-21 「클라 코드가 확인하면 시뮬을 맞춤」)

래트킹(`enemy_1509_mousek`), '즈자이' 破桎而出(`enemy_1517_xi`), 머드락(적)(`enemy_1511_mdrock`)의 방벽은 클라에서 방패 버프 셋이다(`mousek_shield[a/b/c]`,
`enemy_xi_s2[shield][a/b/c]`, `enemy_mdrock_s_2[shield_a/b/c]`). 전에는 셋을 한 방벽(블랙보드 `dynamic` 하나)으로 두었다.
- **클라 코드**(EN 클라 역어셈, 관리자 노트): 버프는 저마다 자기 블랙보드를 가지며 `Buff.Reset`이 그것을 비우고 넘겨받은 블랙보드·버프
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

## 머드락(적) 공격 스택 — 층마다 블랙보드 값 전부 (2026-10-22, 관리자 결정 2026-10-21 「클라 코드가 확인하면 시뮬을 맞춤」)

머드락(적)(`enemy_1511_mdrock`)의 「攻击时攻击力永久提升，最多六层」은 공격마다 클라 버프 `enemy_mdrock_s_1[charge]`를 한 번 만든다(재능 블랙보드
`charge.attack@enemy_mdrock_s_1[charge].atk` 0.6, 레벨 0·1 같음). 전에는 0.6을 6층 합으로 보고 층마다 0.1을 주었다(`[ASSUMED split]`).
- **클라 데이터**(EN 버프 템플릿): `[charge]`는 `overrideType` STACK·`maxStackCnt` 6·`maxValidStackCnt` −1·수명 INFINITY, 속성 수정
  ATK `MULTIPLIER`(`loadFromBlackboard` 1, `stripBlackboardParamsWithBuffKey` 1 → 블랙보드 `atk`). `[persistent]`는 층 수 1·2·3·5·6에서 모드만
  바꾼다(겉모습).
- **클라 코드**(EN 클라 역어셈, 관리자 노트): STACK 묶음은 버프 하나다 — 둘째부터 `OverrideGroup._DoAddInternal`이 새 버프를 넣지 않고 맨 앞
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
  `_DoCastInternal`(RVA 0xC49C50)이 공격 차례를 시작할 때 `_abilityConfigs`를 [0]부터 `AbilityConfigs.TryCastToTarget`(0xC481F0)해 처음 성공한 하나만
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
- 근거: 클라 코드 `BattleFormula.CalculateDamageInternal`(EN 클라, 핫픽스 없음, 관리자 노트), PRTS 「游戏数据基础」 伤害公式도 같다.
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
- 근거: 클라 코드 `BuffContainer.RemoveBuffs(key)`는 맞는 버프에 끝 표시만 하고 지우는 것은 다음 끝난 버프 확인이다(관리자 노트) — 그래서 클라에는 이 버그가
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

## 8인 협동 모드 (관리자 결정 2026-10-16·2026-10-19, 공식에 없는 기능)

공식 방은 1–4명이고 8인용 데이터는 없다(`act2autochess`에는 난이도별 `bloodPoint*`와 단일·멀티 연합 방어 템플릿뿐). 아래 수치·규칙은 모두
**[ASSUMED]** — 원칙은 「1인당 체감을 4인 협동과 같게」(관리자 결정 2026-10-16).
- **방·매칭** (`server/lobby.js`, `server/matchmaking.js`): 별도 방 크기 — `room.create { mode: 'coop', size: 8 }`, `room.state.size`. 사람만 앉고(AI 좌석
  거부, 넘겨받은 AI 좌석은 버림) 8자리가 다 차야 시작(`ERR.SEATS_OPEN`, 코드 방 포함 — 관리자 결정 2026-10-19). 예외는 시험용 로컬
  디버그 모드(`SP_DEBUG_PAGE=1`이나 `SP_DEBUG_FUNDS`, `server/local-patch.js largeBots`): 8석 방에도 AI 좌석을 받고 사람·AI 합쳐 8자리면 시작
  (`room.state.largeBots`, 방 화면의 「添加 AI 队友」). 배포 서버는 둘 다 꺼져 있어 위 규칙 그대로. 8인 전용 대기열(`room.queue { size: 8 }`,
  8석 방의 `room.queueRoom`)은 정확히 8명으로만 묶이고, 대기열 메시지에 `size: 8`, `lobby.queueCounts`에 `counts8`. 끊긴 사람은 4인처럼 AI 托管 없이
  전투만 서버가 이어 돌림(관리자 확인 2026-10-19, `server/match/match/platform.js onDisconnect`).
- **수치** (`data/config.json eightPlayer` ← `tools/build-data.mjs`, `server/match/gamedata.js` `large`): 상점 풀 솔로 ×4(4인 ×2), 장비 재고 ×2,
  맹약 밴 핵심 1·부가 2(NORMAL 이상; FUNNY 0/1 그대로), 보스 초과 시간 팀 LP 초당 2(4인 1), 숨겨진 핵심 조건 활성 층수 합 > 2400 고정(관리자 결정
  2026-10-19; 처음 안은 생존자 1인당 300), 리더 HP 인원 상한 8, 机变 카드 12장. 최종 공세 120초·팀 LP(생존자 합)·턴 시간(전략 50초, 机变 30 + 16초)은
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
  「공식값」(맹약 밴)은 8인 값과 비교(`shared/ruleset.js officialBans`), 8석 방에는 「AI 队友最后选择」를 안 보임(AI 좌석 없음; 관리자 결정 2026-10-19).
  8석 방에서도 커스텀을 막지 않고, 커스텀이 정한 값이 8인 수치 대신 쓰인다(맹약 밴 수 `gd.bans`; 상점 풀 %는 8인 수량에 곱함 — `ui.md` 「상점 풀」;
  관리자 결정 2026-10-20).
- **화면**: 29·37열 필드 그리기(넓힌 무대 기록 `shared/wideField.js`, 공식 3D 씬 사본, 카메라, ‹ › H0–H3)는 `render.md` 「8인 넓은 연합 방어 필드
  그리기」(화면 확인은 그쪽), 로비·방·본판 화면은 `ui.md` 「8인 협동 모드 화면」. 열 함수(`wideCols`·`widenRow`…)는 `shared/wideField.js`에 있고
  `server/sim/wideStage.js`가 다시 내보냄.
- 테스트 `test/eight-player.test.js`(수치, 8석 방·대기열, 실제 매치 경로 8인 한 판, 넓은 필드의 열·장치·경로, 걷는 적이 네 절반을 지나 2배 시간, 3–4명일 때만
  넓은 필드·시간 ×1.5 / ×2·오프셋, 8석 방의 공식 밴 기준·AI 옵션 숨김). golden: matches `coop8-HARD-3`, fields `unite-4-wide`·`unite-3-wide` 추가(다른
  시나리오는 그대로).
