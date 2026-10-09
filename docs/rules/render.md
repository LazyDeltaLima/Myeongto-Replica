# 보드·유닛 렌더링·연출

원래 `docs/LOCAL-PATCH.md` 한 파일이던 것을 2026-10-09에 영역별로 나눴다(내용은 그대로 옮김, 색인은 `docs/LOCAL-PATCH.md`). 본문의 「아래」「위」는 옛 한 파일 기준이라 다른 파일에 있을 수 있다 — 절 이름으로 `docs/LOCAL-PATCH.md` 색인이나 `grep -rn "<이름>" docs/rules/`로 찾는다.

## 공식 맵 렌더링 (2026-10-07)
사용자 제보(KR 캡처 7장: `research/2026-10-07-map-render/`). 근거는 EN 클라이언트
(`battle/prefabs/effects/map.ab`·`common.ab`·`tile.ab`, 셰이더 `[uc]shaders.ab` 바이트코드, `ui/autochess/[uc]autochessbattle.ab`)와 캡처 numpy 측정.
- **활성 오리지늄**(`tile_infection`, act1 m04의 8칸): 바닥은 보통 모래 칸이고 데칼(테두리·점선 원호·결정·WARNING 스티커)은 씬의 `S_patch_hide*` 쿼드라
  이미 그려지고 있었다 → 공식 씬에서는 원본의 절차 크러스트(`infectionMaterial`)를 덧그리지 않는다(`board3d/scene.js _buildTerrain({ infection: false })`).
  - 타일 이펙트 `map_promote_01`(Tile `_effect`): 칸 둘레에 선 쿼드 4장, 머티리얼 `map_promote_04`(Dissolve 셰이더: 붉은 줄 `flow_26`이 벽을 타고 흐름,
    `mask_123`로 위가 사라짐) → `board3d/infection.js`(수치는 파일 머리말). [추정] 늘 켜져 있음(게이트처럼 Tile `_effect`).
  - 버프 표시 `common_acute_infection_buff_01`(타일 버프의 overrideEffectKey): 머리 위 붉은 「!!!」(`kuangre_01` + `star_02` 빛, 0.667초 맥동) →
    `render/infectionMark.js`(Pixi, 유닛 위 `layers.bars`). 사용자 제보. 시뮬레이션은 이 버프를 클라이언트에 알리지
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
- **联防 화면** (2026-10-09, 사용자 제보): 0.2.0(upstream `8a436249`)부터
  联防은 템플릿 레벨 `act1autochess_escaped_single/_multi`에서 진행되는데, 클라이언트에 이 레벨의 씬이 없어(`scenes/activities/…/level_*`은 일반 11개뿐)
  절차 보드로 떨어졌다. **사용자 결정 2026-10-09**: 공식 联防 화면은 그 판 맵 그대로(장애물·물 포함).
  처음(`50e1c83f`)에는 템플릿 맵에 `sceneId` = 라운드 맵을 붙여 씬만 바꿨다(칸·경로는 템플릿 그대로라 유닛이 장애물 그림 위에 설 수 있었다).
  지금은 联防 자체가 그 라운드 전장에서 진행된다(upstream `75202776`, sim-2 `998ec978` — 지형·상자·물·기기 포함, `docs/rules/sim.md`
  「upstream 이식 sim-2」): 필드 meta의 stageId가 경기 stageId라 보드는 일반 판과 같은 `ownStage`/`baseStage`·공식 씬을 그리고, 칸·경로·배치도 그 맵의 것이다.
  그래서 render-2(2026-10-09)에서 우회를 걷어냈다 — `screens/game.js` `fieldStage`(upstream 75202776의 game.js hunk 그대로), `render/app.js setStage`의
  `roundSceneId`, `board3d/scene.js`의 `sceneId` 키·`_officialFor`, 그 테스트. 실제 경기 경로: `test/match/feedback5-unite-map.test.js`
  (필드 meta·spec·`publicView()` 모두 경기 stageId), 브라우저 `test/e2e/coop.e2e.mjs`(`SP_E2E=1`, 联防 필드가 경기 맵을 그림 — 화면 확인 목록).
- 남은 것: 공식 물 셰이더는 근사(깊은 색 하나 — 공식은 해안 근처가 깊이에 따라 청록으로 얕아짐, 거품·커스틱·하늘 반사 없음), m04 밀물 연출 미구현, `_HG_VERTEX_COLOR_BLEND`의 노이즈 항(`_BlendNoiseStrength`·`_BlendMaskNoiseSkew`)은 읽지 않음.

## 배치 낙하 (2026-10-07)
- 사용자 제보. 조사 `research/2026-10-07-deploy-drop/`(사용자 캡처 프레임 시트,
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
- 전투 시작 낙하 (사용자 제보 2026-10-08): 여기서는 재현 안 됨 — `roundstart.mjs` 계열
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

## 보스 경로 미리보기 (2026-10-08, 사용자 제보 → 「실제 루트를 알 수 없으니 준비기간에 경로를 표시」)
- 조사(공식 데이터): 걷는 보스는 가상적: 총(boss_2·9)과 루시안(boss_5)뿐(나머지는 自缚). 경로는 보스 레벨 파일의 체크포인트뿐이고
  (`level_act1autochess_h07_02`·`h08_02` route 6/0, `act2autochess_h07_05` route 8: 출발 (4,10) → 순찰 (3,9) → (2,3) → (5,9), 2인 복제본 (3,11) → (2,17) → (5,11);
  루시안은 같은 세 점 ×5 사이에 MOVE (5,9)), **전장마다 같다**. 칸 사이 길은 그 판 전장의 보스 구역 지형(울타리·벽·늪·상자·토석·나무…) 위에서 클라이언트
  길찾기가 계산한다 — 맵별 경로 표는 클라이언트 표·레벨 파일·PRTS(「卫戍协议：盟约/战场一览」은 전장 그림뿐) 어디에도 없다. 순찰 반복 규칙(PATROL_MOVE)도
  메타데이터 이름(`PatrolMoveCheckpoint`, `IsValidPatrolCheckPoint`, 「PatrolMoveCheckpoint in dead loop」)뿐, 로직은 네이티브라 못 읽음 →
  우리 `bosses.js patrolLoop`(마지막 지점 뒤 첫 구간으로)는 [추정]. 원본 커뮤니티 제보 29번(`docs/history/0.2.0.md` §25.18.9)은 걸을 수 있는 칸·순서만 확인했다.
- 경로: `server/match/bossPath.js` — 조작원 없이 그 필드의 지도자 출현만 넣은 헤드리스 보스전을 돌려(2인 필드는 분기 `boss_battle_multi_player`의 복제본도)
  매 틱 위치를 기록, 첫 체크포인트에 두 번째 도착하면 끝(가는 길 + 순찰 한 바퀴, 루시안의 5바퀴는 1바퀴로). Douglas–Peucker 0.02칸. 10초 동안 출발점을 못 벗어나면
  걷지 않는 보스로 보고 제외. 전장 × 템플릿 × 인원 × 장치 덮어쓰기로 캐시(64개). 매치의 전투 팩토리(`Match.newBattle`)가 아니라 시뮬 `Battle`을 직접 만든다
  (테스트가 가짜 전투를 넣고 개수를 센다). `nextEnemiesFor`가 보스 항목에 `paths`(복제본마다 [[row, col], …], 필드 좌표)를 붙인다 — 2인이면 두 사람 모두 두 경로.
  계산 비용: 루시안 2인 필드 ≈ 50 ms(처음 한 번), 55판 전부 0.6초.
- 표시: `render/fxroute.js` — 공식 경로 미리보기 커서(일반 스테이지에서 적 출현 전 경로를 달리는 표시; 메타데이터 `CreatePreviewCursor`·`ShowRoutePreviewCursor`,
  프리팹 `WalkPreviewCursor`·`FlyPreviewCursor` = EN `battle/[pack]common.ab`, `fx_extract.py --bundle route_cursor --pack 'battle/[pack]common.ab' --match 'PreviewCursor$'`).
  컨트롤러 값 `_moveSpeed` 8칸/초, `_height` 0.3(지상)/1.2(공중), `_times` 1, `_delayToRecycle` 0.5초. 모양은 빨간 리본 트레일(0.25초, 폭 0.4, AlphaBlend 틴트 α 0.178)
  + 가는 가산 트레일(0.5초, 폭 0.1) + 불티(`lizi`); `weiyi` 노드의 파티클은 방출·렌더러가 꺼진 운반 노드(데이터). 보스 구역 준비 카메라에서 지도자가 보일 때만
  경로마다 커서를 달리고, 끝나면 0.5초 + `ROUTE_GAP_S` 1.5초 [추정: `ROUTE_SHOWN_INTERVAL` 값은 네이티브] 뒤 다시. 공식 이펙트를 못 쓰면(품질 낮음·미추출·WebP 없음)
  `render/fx.js`의 빨간 입자 꼬리로 같은 길을 달린다. `fxgame.js playFree` = 호출자가 움직이는 점에 붙는 자유 인스턴스(`alive()`로 clear·개수 상한 탈락 확인).
- `fx_extract.py --pack` 버그: 의존 번들 중 같은 이름(`[pack]common.ab`)이 있으면 마지막 것을 본 번들로 잡아 루트 0개 → 이름이 맞는 **첫** 파일.
- 경로 지도: `node tools/boss-route-map.mjs` → `research/<날짜>-boss-routes/index.html`(전장 11개 × 총(최종 공세·숨겨진 핵심)·루시안, 2인 두 복제본,
  보스 구역 타일·장치). 1인 템플릿 경로 = 2인 왼쪽 복제본(33/33). 인게임 영상과 대조할 때 쓴다.
- 확인(2026-10-08, Windows Chrome, 실제 서버 + 확인용 런처로 보스 라운드를 2라운드로 당김, 전장 #01·루시안): 준비 화면에서 `WalkPreviewCursor`가 약 4.9초마다
  재생되고 경로(상자를 피해 5행으로 돌아 (2,3)까지, 다시 (5,9) → (3,9))를 달림. 공식 리본은 옅고 빨라 한눈에 잘 안 띈다(데이터대로) — 대체 입자 꼬리가 더 잘 보임.
  **사용자 결정 2026-10-08: 공식 그대로**(고정 경로선 추가·속도/진하기 조절 안 함).
  남은 일: 인게임 경로 대조(영상), `ROUTE_SHOWN_INTERVAL` 값. 숨겨진 핵심의 '총을 부수는 리드'(부속, 순찰 경로)는 **표시하지 않는다 — 보스 경로만(사용자 결정 2026-10-08)**.

## upstream 이식 render-1 (2026-10-09)

upstream v0.2.0 이후 렌더 수정 8건(`research/2026-10-09-upstream-compare/render.md`, 기록 `upstream/ISSUES.md` 「이식함」). 근거는 upstream 커밋이고
(재현·측정은 upstream 몫), 우리 코드의 같은 줄을 읽어 같은 버그를 확인했다. 우리 규칙과 맞물리는 것만 적는다.
- 눈꺼풀(`66e5048f` ← `1e78648a`), 비행 적 고도(`96fa58f5` ← `14df10a5`, 적 비행체는 늘 z 0 위 `FLY_HOVER`, 그림자만 아래 칸 높이 — 그림자 쪽은 upstream도 [ASSUMED]),
  가상적: 골극(적) 폼(`e02cf650` ← `bfef34ff`), impostor 갱신 순번(`4cd525ec` ← `bc11c0d6`), 쉐라그(맹약) 寒风 눈보라(`1274d5b3` ← `7c56335c`)는 그대로.
  쉐라그 寒风은 절차 이펙트지만 장치에 공식 이펙트가 없어 fx.md 「7.」(공식 번들 있는 오퍼레이터만 절차 대체 금지)과 충돌하지 않는다. 노시스(오퍼레이터) S3의 자기 냉기(`id` 있음)는 가벼운 그대로.
- 늦게 본 공격의 와인드업(`7c647b2f` ← `6326dd4d`, 중범죄수 철구): upstream 조건 `per`는 우리에게 로컬 strike 스킬 클립(머드락 S2 `Skill_1`, sim.md
  「스킬 클립·스킬 모드 번호 교정」)도 포함하므로 `this.clipPerAttack &&`로 좁혔다 — 적만 전체 클립, strike 스킬 클립은 타격 프레임부터(`test/local-patch-skill-clips.test.js`).
- 샴페인 폭탄(스와이어 디 엘리건트 위트의 소환물) HP 바 숨김(`ec0ee77e` ← `dd23572b`, **사용자 결정 2026-10-09**): PRTS 香槟炸弹 备注
  「即使自身生命值未满，模型下方也不会显示生命值槽」. `shared/trap-tokens.js NO_HP_TOKENS`에 한 줄 — HP 바만 숨기고 피해·치유는 그대로.
  upstream의 무적 `5f98baec`은 받지 않는다(우리는 공식대로 HP 손실·禁疗 있음).
- 드래그 중 놓을 수 있는 칸에 서기(`3a6ae540` ← `9405aae6`, **사용자 결정 2026-10-09** 16): 끄는 오퍼레이터는 놓을 수 있는 칸(보드·대기석) 위에서는 그 칸에
  서고(`render/drag.js dragStandTile` → `boardWorld`, 드롭 트윈과 같은 점), 그 밖(놓을 수 없는 칸·상점 띠)에서는 포인터 아래 `DRAG_HOLD_TILES`.
  근거는 upstream 주인의 공식 녹화(2026-10-09, upstream PR #403 제보). 픽·강조·`tileHover`·방향 선택·드롭은 여전히 포인터 칸.
  우리 배치 중 반투명(`GHOST_ALPHA`, ui.md)은 그대로 겹친다. 아이템 판은 늘 포인터 위.
- 화면 확인은 안 함 — 목록은 `research/2026-10-09-upstream-compare/render.md` 「4. 화면 확인 목록」 1·2·5·6·7·8 + 드래그 스냅(STRONGHOLD.md §11).

## upstream 이식 render-2 (2026-10-09)

sim에 기대는 렌더 수정(`research/2026-10-09-upstream-compare/render.md` 표 3·4·5·10, sim-2 뒤). 근거는 upstream 커밋(재현·측정은 upstream 몫).
- 공격 후딜 서 있기(`90bfe9f4` ← `8a64edc9`, PR #381): 스냅샷 `stand`·`standCut`(표시용, golden 그대로), `interp.js`가 후딜 끝까지 위치를 잡고 남은 구간만 보간.
  sim hunk(events.js·ai.js·deploy.js·displacement.js·spawns.js)는 sim-3(stronghold-6b) 허락 받고 같은 커밋에 — `_unbalance`에 `_cutAttackStand` 복귀.
  우리에게 온디(温蒂) 키트가 없어 테스트의 밀어 죽이기는 같은 移动创伤 메커니즘을 테스트 안에 둠.
- 밀림 슬라이드·비행 적 사망·긴 Die(`e8de9006` ← `2669b6ab`, `2572b608` ← `7a33bc7e`) → 슬라이드 시간 = sim 失衡 시간(`f6d2f8e3` ← `cdf2bd5c` 렌더 hunk,
  fx `dur` ÷ `ctx.animRate`; `dur` 없는 옛 녹화만 √D 대체 [ASSUMED]). `syncBattle`의 미리보기는 우리 개시 낙하 카운터(「배치 낙하」) 위에 둠.
- 적 애니메이션(`33b2c8e8` ← `76a2db7d`, PR #275): 빠른 적(moveSpeed > 1 [ASSUMED])의 Run 순환, `Stun_1`·`Dizzy_*` 기절 클립, 거대하고 못생긴 것(적)·
  自在(적) 重生의 Revive. **`cast`는 안 받음** — upstream·우리 sim 모두 `cast` 이벤트가 없어 `case 'cast'`·`setSkillSlot`·적 `anims.skills`(numberedSkills)는
  읽는 곳이 없다. `data/assets.json` 오프라인 재생성(적 6 run·3 stun, 그 밖 변화 없음) → **배포 때 `--assets`**.
- 联防 sceneId 우회 정리(`ef7517a9`): 위 「联防 화면」.
- 렌더러 타임아웃(`0bbb1832` ← `030d0a29`, PR #302): `createFieldView({signal})`·`mountFieldView`. 우리 자원 중 빌드 중에 만들어지는
  공식 이펙트 층(`fxGame`)·보스 준비 경로 커서(`routeCursors`)도 중단 정리(`setupCleanup`)에 등록. 보드 아트·3D 보드 대기는 view 객체 뒤로 옮겨졌지만
  여전히 `return` 전이라 호출자(공식 씬 `setStage`, 개시 낙하)가 보는 순서는 같다 [코드 읽기로 확인, 화면 미확인].
- 화면 확인은 안 함 — `research/2026-10-09-upstream-compare/render.md` 「4. 화면 확인 목록」 3·4·9·10 + 联防 씬(STRONGHOLD.md §11 「upstream render-2」).
  브라우저 테스트 `RENDER_E2E=1 test/render/initialization.browser.test.js`·`SP_E2E=1 test/e2e/coop.e2e.mjs`(联防 필드가 경기 맵을 그림)도 그때.
