# 보드·유닛 렌더링·연출

옛 `docs/LOCAL-PATCH.md`에서 2026-10-09에 나눈 파일이다. 옛 절 이름은 `docs/LOCAL-PATCH.md` 색인에서 찾는다.

## 공식 맵 렌더링 (2026-10-07)
관리자 제보(공식 KR 화면 캡처 7장, 비공개 조사 기록). 근거는 EN 클라이언트
(`battle/prefabs/effects/map.ab`·`common.ab`·`tile.ab`, 셰이더 `[uc]shaders.ab` 바이트코드, `ui/autochess/[uc]autochessbattle.ab`)와 캡처 numpy 측정.
- **활성 오리지늄**(`tile_infection`, act1 m04의 8칸): 바닥은 보통 모래 칸이고 데칼(테두리·점선 원호·결정·WARNING 스티커)은 씬의 `S_patch_hide*` 쿼드라
  이미 그려지고 있었다 → 공식 씬에서는 원본의 절차 크러스트(`infectionMaterial`)를 덧그리지 않는다(`board3d/scene.js _buildTerrain({ infection: false })`).
  - 타일 이펙트 `map_promote_01`(Tile `_effect`): 칸 둘레에 선 쿼드 4장, 머티리얼 `map_promote_04`(Dissolve 셰이더: 붉은 줄 `flow_26`이 벽을 타고 흐름,
    `mask_123`로 위가 사라짐) → `board3d/infection.js`(수치는 파일 머리말). [추정] 늘 켜져 있음(게이트처럼 Tile `_effect`).
  - 버프 표시 `common_acute_infection_buff_01`(타일 버프의 overrideEffectKey): 머리 위 붉은 「!!!」(`kuangre_01` + `star_02` 빛, 0.667초 맥동) →
    `render/infectionMark.js`(Pixi, 유닛 위 `layers.bars`). 관리자 제보. 시뮬레이션은 이 버프를 클라이언트에 알리지
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
  값이 없어, 관리자 캡처(아이템 드래그 중 벤치 전체가 청록: 판자 245,198,138 → 140,215,177)에 맞춤. `app.js syncOverlay3d`가 7·8행(일반 정비)을 벤치 틴트로 보낸다.
- **장비 장착 팝업** (`ui/equipHover.js`, `css/equip-hover.css`): 아이템을 장착 가능한 오퍼레이터 위로 끌면 뜨는 2칸 알약 — 프리팹
  `act1autochess_equip_slot_panel`(UIAutoChessDragEquipPanel) 그대로: 루트 배율 .8, 알약 334×152가 기준점 120단위 위, 칸마다 #1e1e1e 상자·아이템 아이콘·
  흰 테두리(`img_EquipSlot_frame2` 9-slice), 아이템이 들어갈 칸(= 장착 수 번째)은 `frame3` + `SlotGlow` × #55ffeb 가산 맥동(1 ↔ .4, .7초), 두 칸 다
  차면 빨간 괄호(`frame1_red`) + 붉은 막(`img_EquipSlot_glow` α.71) + 교체 아이콘 + 「장비 교체」(문구는 실행 중에 정해져 데이터에 없음 [추정]) → 놓으면
  기존 교체 창. 등장(.333초)·닫힘(.4초)·장착 플래시(칸 1.333배 튐 + 청록 채움, .417초)는 프리팹 클립 값. [추정] 기준점 = 칸 화면 깊이의 .7(캡처: 알약 아래 ≈ 칸 뒤쪽 가장자리).
  그림은 `ui/battle` 그룹(extract.py 기존 추출)이고 없으면 팝업 없음(원본 그대로). 정비 중 기물 위 장비 바(`hud-bars.js EquipBar`, `ui.md` 「전투 화면 UI」)와는 별개.
- 확인: Chrome `public/dev/game-mock.html?stage=act1autochess_m04`(대기·오퍼레이터 드래그·아이템 드래그 4가지 대상·놓기·「!!!」), 테스트
  `test/local-patch-map.test.js`. 미확인: 전투 중 「!!!」(실제 대전), 시작 상자 삼각형·점선 색(캡처 해상도 한계), 공식 「장비 교체」 문구.
- git 밖 생성물: `public/assets/local/board/fx/`, `data/local-assets.json`(바뀌면 `node tools/build-browser-resources.mjs`).

## 공식 스테이지 3D 씬 (2026-10-06)
- 3D 보드는 원래 시즌 1 아틀라스(`map_autochess`)로 모든 스테이지를 그렸다. 지금 클라이언트는 스테이지마다 완성된 씬(`scenes/activities/act*autochess/level_*`)과 라이트맵을 갖고 있고, 테마는 사막(`map_autochesssand`), 카시미어(`map_kxmr`), 시라쿠사 지하철(`map_syracuse_metro`)이다. 자세한 내용은 docs/local/official-scenes.md.
- 추출: `.venv-extract/bin/python tools/local-extract/scene_extract.py` (클라이언트 위치는 `tools/local-extract/client_path.py` — `SP_CLIENT`·`.env`·`.client`, 또는 `--client`; `--stage`로 일부만) → `public/assets/local/scene/**`, `data/local-assets.json`의 `scene/*` 그룹. CAB 색인은 `.cache/scene-cab-index.json`에 캐시(`--rebuild-index`).
- WebP (2026-10-06, upstream #186과 같은 방식): 텍스처·라이트맵마다 PNG 옆에 WebP를 쓰고 manifest가 WebP를 가리킨다. 컬러 맵(머티리얼의 `_MainTex`)만 손실 q95, 노멀·러프니스·발광·RGBM 라이트맵·섀도마스크는 무손실(43MB → 26MB). 클라이언트 없이 기존 PNG에서 만들려면 `scene_extract.py --webp`, 끄려면 `--no-webp`.
- 지오메트리 압축 (2026-10-06, `geom.bin` 버전 2): 위치는 씬 하나에 공통 격자 u16(`quant.pos`, 축 하나의 span이라 메시 행렬이 균일 배율 → 법선 그대로, 그룹 사이 같은 정점은 같은 점 → 틈 없음), 법선 i8×4, uv0·uv1은 그룹별 범위 u16(`q.uv0`·`q.uv1`, 그룹 재질의 `uMainST`·`uUv1ST`에 합침), 색이 하나인 그룹은 `colConst`, 정점 65,536개 이하면 인덱스 u16. pos·uv1·idx는 델타+지그재그+바이트 셔플(`quant.dzs`, `official.js unDzs`)이라 크기는 같고 gzip이 잘 줄인다. 11개 스테이지 37.2 → 18.2MB, gzip 10.8 → 3.8MB(act2 m01 8.1 → 4.1MB, gzip 2.1 → 0.71MB). 디코드 오차 위치 ≤ 0.0006칸·법선 0.4°·uv 5e-5, 시간 고정 headless 비교에서 평균 픽셀 차이 0.16~0.49(가장자리 1px·비스듬한 줄무늬 샘플링만). 읽는 쪽은 버전 1(f32·u32)도 그대로 읽는다. 기존 추출물 변환은 클라이언트 없이 `python3 tools/local-extract/scene_extract.py --requantize`(버전 1만 다시 쓰고 manifest `geom` bytes 갱신). act2 m01이 큰 것은 지하철 씬이 정점 157k로 원래 촘촘해서다(LOD 없음, 중복 정점 0.5% 미만).
- 그리기: `public/js/render/board3d/official.js`. 공식 씬이 있으면 절차 타일·배경·물 대신 그리고, 게이트·기기·지형 효과는 그대로 쓴다(필드 테두리와 활성 오리지늄 크러스트는 2026-10-07부터 안 그림 — 「공식 맵 렌더링」). 필드별 숨김 세트(HIDDEN@1/2/3)는 현재 영역에 맞춰 켠다. `?officialBoard=0`이면 예전 보드.
- 색 (2026-10-06, 관리자 제보: 사막 모래가 어둡고 주황·물이 너무 청록): 클라이언트는 **Gamma 색공간** 프로젝트다(globalgamemanagers PlayerSettings `m_ActiveColorSpace` 0). 그래서 셰이더도 텍스처·재질 색·빛 색을 저장된 값 그대로 쓰고(sRGB→선형 변환 없음) 결과를 변환 없이 쓴다. 라이트맵은 LightmapRGBM(`m_LightmapFormat` 2)이라 감마식 5·a·rgb로 푼다(선형식 34.49·a^2.2였음). 씬 셰이더(`Torappu/Scene/StandardRealtimeShadow` 등)는 Unity Standard 속성 세트라 BRDF1 감마판을 따른다: 확산 ×0.779, 유전체 정반사 0.2209, 직접광 정반사, 반사 프로브. 반사는 `scene.json reflection`이다(섬의 ReflectionProbe, 없으면 생성된 스카이박스 반사 × `m_ReflectionIntensity`, 면별 평균색). `_HG_VERTEX_COLOR_BLEND_ON`은 정점색만큼 `_BlendColor`로 **덮는다**(× 2 틴트였음): 정점에 칠한 모래라서 바닥 무늬 타일이 반쯤 모래에 덮인다. 물은 `_DeepWaterColor` × `_WaterColor` × `_WaterColorIntensity`, 알파는 깊은 색의 a(0.672). act1 m03을 같은 카메라의 한국 서버 전투 화면(관리자 캡처)과 비교한 평균 RGB: 보도 191/180/167(공식 191/179/166), 바닥 216/186/139(208/176/132), 바위 블록 192/149/103(200/153/106), 먼 바다 34/61/71(38/61/73). 수정 전에는 바위 150/108/64, 보도 143/134/123, 물 43/106/100이었다. 기존 추출물에 반사를 넣으려면 `scene_extract.py --reflections`(클라이언트 필요, 지오메트리·텍스처는 그대로, scene.json만 바뀜). 반사가 없는 예전 scene.json은 주변광 하늘색으로 대신한다.
- 높이: 공식 씬의 `highlandHeight`(사막 0.4, 카시미어 0.3)를 HIGH 타일 전부에 쓴다(`style.js tileTop`). 공식 씬이 없으면 예전 `TILE_H`.
- 기기 모델 (2026-10-06, 관리자 제보: act1 m03의 사격대 칸이 펜스 친 지상 칸·배치 불가 칸처럼 보임): 씬에는 기기의 자리(빈 틀, 지그재그 표시)만 있고,
  클라이언트는 레벨의 함정 기기를 실행 중에 프리팹으로 올린다(`pkgrps/btl_pfb_tokens_*.ab`의 `trap_1106_achplat` 射击台·`trap_1105_accrate` 阻隔工事,
  메시·텍스처는 `arts/maps/common/trap`). 공식 씬을 그릴 때는 절차 보드 메시(사격대 판이 들어 있던)를 그리지 않아서 사격대가 빠져 있었다.
  `scene_extract.py --devices` → `scene/devices/scene.json`·`geom.bin` + `scene/tex/TX_trap_*`(전체 추출 때도 함께), `official.js`가 모든 스테이지와 함께
  읽어 `built.devices`로 만들고, `board3d/scene.js`가 활성 사격대 칸마다 사격대 모델, 정적·전투 阻隔工事에 공식 상자 모델을 놓는다. 조명은
  Torappu/Scene/Trap/Shadow 머티리얼 값(`_Ambient`·`_Diffuse` × 주광 N·L, 라이트맵 없음 — 셰이더 원문은 못 읽어 [추정]). 사격대 위 유닛은 판 높이
  0.393에 선다(`stage.platformHeight` → `style.js tileTop('platform')`). 공식 캡처와 같은 회색 금속 판 + 2×2 격자 모양, 판 평균색 공식 128,124,112 ↔ 우리 129,130,124.
  알려진 차이: 土石结构(act1 m06 `trap_032_mound`)와 “双眼皮” 포탑은 절차 상자 그대로.
- **联防 화면** (2026-10-09, 관리자 제보): 0.2.0(upstream `8a436249`)부터
  联防은 템플릿 레벨 `act1autochess_escaped_single/_multi`에서 진행되는데, 클라이언트에 이 레벨의 씬이 없어(`scenes/activities/…/level_*`은 일반 11개뿐)
  절차 보드로 떨어졌다. **관리자 결정 2026-10-09**: 공식 联防 화면은 그 판 맵 그대로(장애물·물 포함).
  처음(`187ec1bf`)에는 템플릿 맵에 `sceneId` = 라운드 맵을 붙여 씬만 바꿨다(칸·경로는 템플릿 그대로라 유닛이 장애물 그림 위에 설 수 있었다).
  지금은 联防 자체가 그 라운드 전장에서 진행된다(upstream `75202776`, 이식 `f5293092` — 지형·상자·물·기기 포함, `sim.md`
  「upstream 0.2.1·0.2.2 이식」): 필드 meta의 stageId가 경기 stageId라 보드는 일반 판과 같은 `ownStage`/`baseStage`·공식 씬을 그리고, 칸·경로·배치도 그 맵의 것이다.
  그래서 이식(2026-10-09)에서 우회를 걷어냈다 — `screens/game.js` `fieldStage`(upstream 75202776의 game.js hunk 그대로), `render/app.js setStage`의
  `roundSceneId`, `board3d/scene.js`의 `sceneId` 키·`_officialFor`, 그 테스트. 실제 경기 경로: `test/match/feedback5-unite-map.test.js`
  (필드 meta·spec·`publicView()` 모두 경기 stageId), 브라우저 `test/e2e/coop.e2e.mjs`(`SP_E2E=1`, 联防 필드가 경기 맵을 그림) [화면 미확인].
- 알려진 차이: 공식 물 셰이더는 근사(깊은 색 하나 — 공식은 해안 근처가 깊이에 따라 청록으로 얕아짐, 거품·커스틱·하늘 반사 없음), m04 밀물 연출 미구현, `_HG_VERTEX_COLOR_BLEND`의 노이즈 항(`_BlendNoiseStrength`·`_BlendMaskNoiseSkew`)은 읽지 않음.

## 배치 낙하 (2026-10-07)
- 관리자 제보(공식 화면 캡처 프레임 시트·Start 클립 조사, 비공개 조사 기록). 낙하는 코드가 아니라 각 모델의 Spine `Start` 클립이다(143명 중 103명: 몸 높이 0.6–7배 위에서, 착지 중앙값 0.2초, 가속·튐 없음,
  `OnStart` 이벤트 = 착지). 나머지 40명(赤刃明霄陈·蕾缪安 등)은 자기 등장 동작.
- 원본도 배치 때 `Start`를 틀었지만 가려졌다: 0.25초 투명도 페이드, 전투 시작처럼 모델이 로드되기 전에 'deploy'가 오면 `Start`를 건너뜀(그냥 Idle로
  서 있음), 새 모델 0.2초 크로스페이드, impostor 슬롯이 서 있는 자세 크기, `fx.deploy` 민트 기둥·링·입자.
- 고친 것(아군 + Spine 모델이 있는 유닛만, `UnitView.onDeploy`가 true를 돌려줌 → `bornOfficial`): 페이드 없음, 기둥 없음, 로드 전 배치는 로드되면 그만큼
  지난 시점부터 `Start` 재생(크로스페이드 없이), 클리핑 없는 모델은 낙하 중 impostor를 쓰지 않음(클리핑 모델은 위로 7배 넓힌 슬롯), 첫 0.1초 RGB×0.6
  [추정: 캡처 첫 프레임이 어둡다(≤66ms) — 근거는 캡처뿐. 예전에 든 클라 `_disableBornTweenColor`는 적(`Enemy`)·적 소환 노드에만 있는 필드라 오퍼 근거가 못 된다
  (디컴파일 2026-10-10: `Character`에는 born 색 트윈 필드가 없고 `_showDeadTweenColor`·`_useRealBornTimeFromAnim`만; `Consts.CHARACTER_BORN_TIME` = 1초)]. 정비 단계: 보드 배치·벤치 도착(구매·반환)·보드→벤치 복귀 모두 낙하, 목표 칸으로
  미끄러지지 않고 그 자리에서. 보드→보드 이동은 예전처럼 미끄러짐(캡처에서 높은 낙하는 안 보였다 — 카메라 이동 중이라 불확실). 적·모델 없는 마름모는 원본 그대로.
- 확인: Chrome 디버그 아레나(재시작 직후 연속 캡처) — 텍사스가 타일 위에서 떨어짐, 품질 high·low 모두. 원본은 같은 자리에 민트 기둥 + 이미 선 모델. 단위 테스트 `test/render/local-deploy-drop.test.js`.
- 라운드 시작 (2026-10-07 후속): 실제 솔로 판 1라운드를 재 보니(autoplay, CDP 스크린캐스트,
  UnitView 훅 로그) 전투 시작 때 'deploy'가 온 뒤 모델이 0.17–0.31초 늦게 들어왔고(뷰마다 SpineActor를 새로 만듦), 클립을 그만큼 따라잡아 대부분 이미
  착지한 채 나타났다(낙하 안 보임). → 모델이 없을 때 배치되면 링(방향 표시)·그림자만 먼저, 몸·마름모·바는 감춘 채 최소 `BORN_LEAD_S` 0.1초 + 모델이
  들어올 때까지 기다렸다가 `Start`를 처음부터(1초 안에 안 오면 예전처럼 마름모). 모델이 이미 보이는 배치(정비 배치·재배치)는 바로 떨어진다.
  다시 잰 결과: 그림자 0.09초, 몸 0.23–0.41초(클립 0.02–0.07초 지점부터) — 공식 캡처(링 → 약 0.1초 뒤 몸)보다 링이 먼저 보이는 시간이 모델 준비만큼
  길다. 공식 캡처의 0.1초도 실제로는 배너 뒤·화면 밖의 낙하 앞부분일 수 있다(링 → 착지 170ms ≈ 클립 착지 시간).
- 전투 시작 낙하 (관리자 제보 2026-10-08): 여기서는 재현 안 됨 — 솔로·협동 봇 3, 1·2라운드, 품질 high·low, 1280×720·1920×1080에서
  모두 몸이 클립 0.01초 지점부터 보이고 프레임에 낙하가 찍힘. 낙하를 삼킬 수 있는 길을 막음 [추정: 관리자 화면의 원인]: 긴 프레임(전투 전환)이 기다림(`_bornWait`, 한 프레임 최대
  0.25초)을 다 쓰거나 `Start`를 건너뛰지 않게 낙하 중에는 한 프레임 최대 1/30초(`DEPLOY_MAX_STEP_S`), 화면 밖에 있던 시간(`_offDt`)도 낙하 중에는 더하지 않음.
  단위 테스트 「a long frame (the battle switch) …」(수정 전 실패 확인).
- 처음 나타날 때 검은 실루엣인 오퍼레이터(아스카론·赤刃明霄陈 등)는 `Start` 클립 자체의 슬롯 색이 검정 → 원래 색이다(0초 0.0, 0.3초 0.78) — 공식 등장 연출.
- 작전 시작 낙하가 한 명씩 (관리자 제보 2026-10-08: 낙하는 보이지만 공식보다 빠름; 관리자 결정 2026-10-08: 화면만):
  공식 플레이 녹화(비공개 녹화, 30fps 실시간 — 전투 카운트다운이 정확히 30프레임마다 바뀜)의 전투 시작에서
  오퍼레이터는 **차례로** 내려온다: 링이 나타나는 프레임 204·207·211·215·219·222·…·230 = **약 0.12초 간격**, 9명에 약 0.9초, 한 명의 낙하는
  약 0.17–0.2초. 우리는 모두 같은 순간에 배치되고 `Start`가 전투 배속으로 정확히 2배(실제 판 계측:
  6.25ms 프레임마다 클립 0.0125초) → 낙하 전체가 약 0.1초에 끝났다. 클립 배속 자체는 공식 望(검은 실루엣 → 색 0.69–0.83초)으로 재면 약 1.6배지만
  녹화에 같은 프레임이 최대 4장 반복돼(게임 끊김) 1.3–2.0배까지 범위가 넓어 판정 못 함 → **2배 그대로**.
  고친 것: `render/app.js` 전투 'deploy'가 전투 시계 1초 안(`OPENING_DROP_GT`)의 아군(정탐 보드·장치 제외)에 차례 번호(`openingDrops`)를 매기고,
  `units.js onDeploy({ order })`가 번호 × `BORN_STAGGER_S` 0.12초 동안 링·그림자·몸·바를 모두 숨겼다가(`_bornHold`, 긴 프레임은 한 번에 최대 0.25초)
  보통 낙하를 시작한다. 배치 효과음도 같은 간격으로 미룬다(행동출발은 위수협약에서 나오지 않음 — `audio.md` 「오퍼레이터 음성」)(`audio.js OPENING_DEPLOY_STAGGER_MS`; 필드의 첫 deploy부터
  0.4초 안, 첫 전투 이벤트 atk·dmg·heal·die·leak 전까지 — 한 번에 들어오는 따라잡기 묶음의 나중 소환은 미루지 않음; 새 필드면 남은 차례 취소).
  시뮬레이션은 그대로라 숨어 있는 동안(최대 약 1초) 유닛이 이미 행동할 수 있다 — 시뮬레이션 차례 배치는 별도 항목. 차례 = 시뮬레이션의 배치 순서
  [추정: 공식 순서는 놓은 순서도 왼쪽→오른쪽도 아닌 것으로 보였다]. 확인: 실제 솔로 판 COMBAT:2에서
  말 4개의 몸이 배치 후 +96/+114/+233/+353ms, 차례 낙하가 프레임에 찍힘. 단위 `test/render/local-deploy-drop.test.js` 「one by one」,
  `test/local-patch-audio.test.js` 「opening deployment sounds one by one」.
  **2026-10-10 저녁: 화면 차례는 뺐다** — 시뮬레이션이 공식대로 0.2게임초마다 한 개씩 배치한다(`sim.md` 「작전 시작 차례 배치」, 관리자 결정
  2026-10-10). 그대로 두면 지연이 두 번 걸리므로 `openingDrops`·`OPENING_DROP_GT`·`BORN_STAGGER_S`·`_bornHold`를 지우고, 'deploy' 이벤트마다 그 말이
  바로 떨어진다(`units.js onDeploy()`). 녹화의 약 0.12초(실시간) 간격은 클라 코드의 0.2게임초와 맞는다 — 전투 배속 `GAME_SPEED` 2라 0.2게임초 = 0.1실시간초(오디오 담당 확인). 배치
  효과음·部署 대사의 시점은 `audio.md`(오디오 담당).
  착지 이펙트(2026-10-11, 디컴파일 2라운드): 'deploy'마다 공식 배치 이펙트(프리팹 `_startEffect`, 없으면 `common_char_birth_01`·토큰 `common_call_start_01`)를
  그 말 위에 튼다 — `fx.md` 「입력 대상·루프 타격·클립별 이펙트·배치 이펙트」 ⑤. 낙하 중이면 말을 따라간다 [추정: 공식은 착지 자리].
- 알려진 차이: 착지 전에 시뮬레이션이 이미 공격하는 것(텍사스가 공중에서 첫 공격 — 공식은 `CHARACTER_BORN_TIME` 동안 못 하는 듯 [추정], 시뮬레이션
  변경이라 따로 — 위 차례 배치도 시뮬레이션에서 하면 같이), 배치 효과음 시점(캡처에 소리 없음).

## 유닛 모델 크기 (2026-10-08, 관리자 제공 공식 PC 캡처)
- 근거(클라이언트 EN): 오퍼레이터 전투 스킨 `chararts/<char>.ab defaultskin.prefab` FaceSwitcher 스케일 0.27 × SkeletonDataAsset 0.01(호시구마·첸 등
  확인), 적도 같은 0.27 표준(`enemy_scales.py`), 타일 = Unity 1단위. 캐릭터 프리팹 `Graphic`이 X축 −30°로 기울어 30° 카메라(`projection.js OFFICIAL`)를 정면으로
  보므로 화면에서 스켈레톤 1단위 = 발 위치의 타일당 px × 0.0027. 원본은 `UNIT.modelScale` 1/320(≈ 16 % 큼) → **0.0027**(`style.js`),
  머리 높이 `UNIT.headroom` 1.18 → 1.02(같은 비율; 이펙트 head/body 앵커·숫자 위치가 따라감).
- 소환물: 프리팹마다 곱이 달라(`pkgrps/btl_pfb_tokens_*.ab`) 적처럼 0.27 대비 계수 `units.js TOKEN_MODEL_K`: 医疗探机·诅咒娃娃 0.4, 香槟炸弹·
  银灰(svash2) 독수리 3종 0.25, 나머지 0.27(tokens.json 전부 확인; char_605/613·acloon은 프리팹 못 찾음 → 1).
- 화면 대조(타일 폭 대비 키, 머리 끝~발): 琳琅诗怀雅 공식(공식 PC 캡처, 공격 중) 1.14 · 수정 전 1.24 · 수정 후 1.08;
  赤刃明霄陈 S3 공식 녹화 1.07 · 수정 전 아레나 1.35 · 수정 후 ≈ 1.17(계산). 자세가 달라 ±8 % 오차 [추정] — 판단은 클라이언트 수치로 했다.
  공식 이펙트(월드 단위)는 바뀌지 않으므로 모델 대비 이펙트 크기도 공식에 가까워진다(첸 S3 용 머리가 몸에 가리던 것).
- 확인: Chrome 디버그 아레나(m03)·game-mock 정비 화면 캡처, `unitview.test.js` 머리 높이 기대값 1.02.

## 적 경로 미리보기 (2026-10-10, 관리자 결정 「공식 卫戍协议에서는 라운드 작전이 시작될 때 적 경로가 실제로 표시됐다」 → 공식대로)
- 공식(클라 코드, EN 클라 il2cpp — 레벨 데이터 액션이 아니라 SPAWN 액션의 플래그):
  - `Scheduler._DealAction`(RVA 0x629EE0): SPAWN 액션에 `autoPreviewRoute`(ActionData +0x35)가 있으면 PREVIEW_CURSOR(ActionType 1) 액션을 새로 만들어
    같은 경로(`routeIndex`, `useExtraRoute` = 분기에서 왔는지)에 건다 — 시각 = SPAWN 시각(조각 preDelay + 액션 preDelay − 적 `delayToBorn`, 0 미만이면 0)
    − 3초(.rdata 0x185D65030 = 3.0, `PREVIEW_CURSOR_PRE_DELAY`), `count` 2 · `interval` 0.3초(`PREVIEW_CURSOR_COUNT`·`_INTERVAL`) → 아이템 하나 = 커서 하나.
  - 조각의 액션 큐는 시각순 정렬(`_DealFragment` MoveNext RVA 0x630740, `LegacySort`)되고 `DefaultWaveHandler.ExecuteActionQueue`(MoveNext RVA 0x62E0A0)가
    「지금까지 지난 시각보다 늦으면 그만큼 기다렸다가」 실행 → 0 이하인 커서는 전투 시작에 바로(두 커서가 겹침).
  - 실행: `Scheduler._DoPreviewCursor`(MoveNext RVA 0x632000, 커서를 만들고 바로 끝남 — 큐를 막지 않음) → `BattleController.CreatePreviewCursor`(RVA 0x3544C60):
    경로의 이동 방식으로 `BattleFactory.CreatePreviewCursor`(WalkPreviewCursor/FlyPreviewCursor 프리팹) → `PreviewCursor.Spawn` → 이벤트 `ON_PREVIEW_CURSOR_SPAWND`(24).
    커서는 한 번 달리고 끝(프리팹 `_times` 1) — 반복 없음.
  - 卫戍协议: 라운드 액션은 서버가 보낸 적 목록으로 클라가 만든다(`AutoChessLevelEnemyManager.GenerateSelfBattleEnemyData` RVA 0x82F740,
    `_GenerateActionFromEnemyInfo` RVA 0x8313F0, 보스전 `GenerateBossBattleEnemyData` RVA 0x82EAC0, 联防 `GenerateHelpBattleEnemyData` RVA 0x82EFC0):
    적 한 마리 = 액션 하나(count 1), 레벨 액션(같은 actionIndex)마다 **처음 만든 액션만** 원래 액션의 `autoPreviewRoute`를 복사 → 표시된 레벨 액션마다
    미리보기 한 번, 그 액션의 첫 유닛 3초 전. 플래그가 있는 레벨: 일반 라운드 `act1autochess_01·03–07·h01–h06`(액션 1–4개), `tr01`, 联防 2인 `escaped_multi`(7개);
    `02`, 1인 `escaped_single`, 보스·숨겨진 핵심 템플릿(h07·h08, act2)은 없음 → 그 전투에는 커서가 없다. 웨이브 액션 종류는 51개 레벨 모두 SPAWN뿐이라
    PREVIEW_CURSOR 액션·`ROUTE_SHOWN_INTERVAL`(1.2초, 다른 모드 `GameCityModeConsts`)은 卫戍协议과 무관.
  - 핫픽스: en_US·zh_CN `DefinedFix.lua`에 `Scheduler`·`AutoChessLevelEnemyManager`·`BattleController.CreatePreviewCursor` 없음
    (zh_CN `SchedulerHotfixer.lua`는 목록에 없는 꺼진 패치, DIALOG만).
- 우리: `tools/build-data.mjs`가 `autoPreviewRoute`를 `data/waves.json spawns[i].previewRoute`로 옮기고, 스폰 명세는 레벨 액션을 `actionIndex`로 가리킨다
  (`server/match/waves.js` — 현상금 유닛도 붙는 액션의 번호). `server/sim/routePreview.js routePreviewPlan(battle, spec)`: 표시된 액션마다 가장 이른 유닛의
  시각 t·경로로 커서 `max(0, t − 3)`·`max(0, t − 2.7)`, 선은 그 경로를 이 전투의 격자에서 적이 걷는 길(`ai.js planLeg`와 같은 흐름장 사슬, 비행은 체크포인트 직선).
  전투 상태를 읽기만 해서(흐름장은 격자 버전별 캐시·순수) 결정성·golden은 그대로 — 서버·프로토콜 변경 없음. 브라우저 `battle/runner.js`가 전투를 만든 직후
  (첫 스텝 전) 한 번 계산해 m.field `routeCursors`로 넘기고 `render/fxroute.js createBattleCursors`가 전투 시계(게임 시간 — 배속이 커서도 빠르게)로 각 커서를
  한 번 달린다(속도 8칸/초, 높이 0.3/1.2, 끝나면 트레일이 사라짐). 중간에 들어온 화면(관전·다시 그린 화면)은 이미 끝난 커서를 건너뛰고 달리는 중인 것은 그 자리부터.
- 커서가 생길 때마다 `onSpawn` → `'routePreview'` → `screens/game.js`(자기가 낀 필드일 때만) → `voice.js voiceForRoutePreview`. 클라는 이때 행동개시를 말하지만
  카드 목록(CARD_LIST)이 켜져 있을 때만이고 위수협약은 그것을 끄므로 나오지 않는다(2026-10-10 `6f88741e`) — `audio.md` 「오퍼레이터 음성」.
- [추정] 남김: ① 플레이스홀더가 다른 이동 방식이라 유닛이 하나도 안 나오는 표시된 액션은 미리보기도 없음(클라가 그 액션을 안 만듦 — 클라 쪽 미리보기 계산
  `_DoReplaceLevelDataClient` RVA 0x839FC0가 같은 LevelData의 isValid를 끄는 경우까지는 안 봄). ② 적 `delayToBorn`(프리팹 `_delayToBorn`, 0이 아닌 적 5종)은
  우리 스폰 시각에 없으므로 커서도 SPAWN 시각 기준. ③ DISAPPEAR/APPEAR가 있는 경로에서 커서가 어떻게 가는지(보스 경로뿐이라 卫戍协议 일반 라운드엔 없음) —
  선을 거기서 끊는다. ④ 전투의 0초 = 공식 웨이브·조각 시작(둘 다 preDelay 0).
- 확인: `test/match/route-preview.test.js` — 데이터 표시, 커서 시각, 실제 매치 경로(4라운드 `act1autochess_04`: 액션 3 → 0·0.3초, 액션 0 → 9·9.3초)에서 적의 매 틱
  위치가 미리보기 선에서 0.02칸 안, 계획을 읽은 전투와 안 읽은 전투가 매 틱 같음; 联防 1인/2인; 브라우저 커서(한 번씩, 늦게 들어온 화면).
  화면 확인은 아직(메인 세션).

## 보스 경로 미리보기 (2026-10-08, 관리자 제보 → 관리자 요청 「실제 루트를 알 수 없으니 준비기간에 경로를 표시」)
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
  경로마다 커서를 달리고, 끝나면 0.5초 + `ROUTE_GAP_S` 1.5초 뒤 다시 — **공식에 없는 관리자 편의 기능**(관리자 말 2026-10-10: 보스 준비 화면의 경로 표시는
  공식이 아니라 관리자가 원한 기능)이라 간격은 우리 값이고 맞출 공식 값이 없다(디컴파일 2026-10-10: `ROUTE_SHOWN_INTERVAL` 1.2는 다른 게임 모드
  `GameCityModeConsts`의 C# 상수, 공식 전투 시작 커서는 위 「적 경로 미리보기」 — 보스 템플릿에는 표시된 액션이 없다). 커서 프리팹·속도·높이만 공식 것.
  행동개시 대사는 붙이지 않는다(관리자 결정 (2026-10-10): 「보스 경로 미리보기에는 행동개시 음성을 넣지 마」 — 공식 대사는 전투 시작 커서에만). 공식 이펙트를 못 쓰면(품질 낮음·미추출·WebP 없음)
  `render/fx.js`의 빨간 입자 꼬리로 같은 길을 달린다. `fxgame.js playFree` = 호출자가 움직이는 점에 붙는 자유 인스턴스(`alive()`로 clear·개수 상한 탈락 확인).
- `fx_extract.py --pack` 버그: 의존 번들 중 같은 이름(`[pack]common.ab`)이 있으면 마지막 것을 본 번들로 잡아 루트 0개 → 이름이 맞는 **첫** 파일.
- 경로 지도: `node tools/boss-route-map.mjs` → `.cache/boss-routes-<날짜>/index.html`(인자로 바꿀 수 있음; 전장 11개 × 총(최종 공세·숨겨진 핵심)·루시안, 2인 두 복제본,
  보스 구역 타일·장치). 1인 템플릿 경로 = 2인 왼쪽 복제본(33/33). 인게임 영상과 대조할 때 쓴다.
- 확인(2026-10-08, Chrome, 실제 서버 + 보스 라운드를 2라운드로 당긴 테스트 서버(`SP_START_ROUND`), 전장 #01·루시안): 준비 화면에서 `WalkPreviewCursor`가 약 4.9초마다
  재생되고 경로(상자를 피해 5행으로 돌아 (2,3)까지, 다시 (5,9) → (3,9))를 달림. 공식 리본은 옅고 빨라 한눈에 잘 안 띈다(데이터대로) — 대체 입자 꼬리가 더 잘 보임.
  **관리자 결정 2026-10-08: 공식 그대로**(고정 경로선 추가·속도/진하기 조절 안 함).
  미확인: 인게임 경로 대조(영상). 숨겨진 핵심의 '총을 부수는 리드'(부속, 순찰 경로)는 **표시하지 않는다 — 보스 경로만(관리자 결정 2026-10-08)**.

## upstream 0.2.1·0.2.2 이식 — 렌더 (2026-10-09)

upstream v0.2.0 이후 렌더 수정(비공개 비교 기록). 근거는 upstream 커밋이고
(재현·측정은 upstream 몫), 우리 코드의 같은 줄을 읽어 같은 버그를 확인했다. 우리 규칙과 맞물리는 것만 적는다.
- 눈꺼풀(`e4006998` ← `1e78648a`), 비행 적 고도(`4bae8cc6` ← `14df10a5`, 적 비행체는 늘 z 0 위 `FLY_HOVER`, 그림자만 아래 칸 높이 — 그림자 쪽은 upstream도 [ASSUMED]),
  가상적: 골극(적) 폼(`2f9a8b6d` ← `bfef34ff`), impostor 갱신 순번(`9ee0096d` ← `bc11c0d6`), 쉐라그(맹약) 寒风 눈보라(`187f1dee` ← `7c56335c`)는 그대로.
  쉐라그 寒风은 절차 이펙트지만 장치에 공식 이펙트가 없어 `fx.md` 「공용(절차) 이펙트 제거」(공식 번들 있는 오퍼레이터만 절차 대체 금지)과 충돌하지 않는다. 노시스(오퍼레이터) S3의 자기 냉기(`id` 있음)는 가벼운 그대로.
- 늦게 본 공격의 와인드업(`24651207` ← `6326dd4d`, 중범죄수 철구): upstream 조건 `per`는 우리에게 로컬 strike 스킬 클립(머드락 S2 `Skill_1`, sim.md
  「스킬 클립·스킬 모드 번호 교정」)도 포함하므로 `this.clipPerAttack &&`로 좁혔다 — 적만 전체 클립, strike 스킬 클립은 타격 프레임부터(`test/local-patch-skill-clips.test.js`).
- 샴페인 폭탄(스와이어 디 엘리건트 위트의 소환물) HP 바 숨김(`c5672804` ← `dd23572b`, **관리자 결정 2026-10-09**): PRTS 香槟炸弹 备注
  「即使自身生命值未满，模型下方也不会显示生命值槽」. `shared/trap-tokens.js NO_HP_TOKENS`에 한 줄 — HP 바만 숨기고 피해·치유는 그대로.
  upstream의 무적 `5f98baec`은 그때 받지 않았다가 2026-10-11 관리자 결정으로 받았다(`sim.md` 「upstream 0.2.3 이식」 — HP 손실 없음·禁疗·아군 선택 제외).
- 드래그 중 놓을 수 있는 칸에 서기(`18c6fa79` ← `9405aae6`, **관리자 결정 2026-10-09**): 끄는 오퍼레이터는 놓을 수 있는 칸(보드·대기석) 위에서는 그 칸에
  서고(`render/drag.js dragStandTile` → `boardWorld`, 드롭 트윈과 같은 점), 그 밖(놓을 수 없는 칸·상점 띠)에서는 포인터 아래 `DRAG_HOLD_TILES`.
  근거는 upstream 주인의 공식 녹화(2026-10-09, upstream PR #403 제보). 픽·강조·`tileHover`·방향 선택·드롭은 여전히 포인터 칸.
  우리 배치 중 반투명(`GHOST_ALPHA`, ui.md)은 그대로 겹친다. 아이템 판은 늘 포인터 위.
- 위 항목들은 [화면 미확인].

### sim 수정에 기대는 렌더 수정
근거는 upstream 커밋(재현·측정은 upstream 몫).
- 공격 후딜 서 있기(`511b9db6` ← `8a64edc9`, PR #381): 스냅샷 `stand`·`standCut`(표시용, golden 그대로), `interp.js`가 후딜 끝까지 위치를 잡고 남은 구간만 보간.
  sim 부분(events.js·ai.js·deploy.js·displacement.js·spawns.js)도 같은 커밋 — `_unbalance`에 `_cutAttackStand` 복귀.
  우리에게 온디(温蒂) 키트가 없어 테스트의 밀어 죽이기는 같은 移动创伤 메커니즘을 테스트 안에 둠.
- 밀림 슬라이드·비행 적 사망·긴 Die(`8f76a2d0` ← `2669b6ab`, `795b5e85` ← `7a33bc7e`) → 슬라이드 시간 = sim 失衡 시간(`f989dc29` ← `cdf2bd5c` 렌더 hunk,
  fx `dur` ÷ `ctx.animRate`; `dur` 없는 옛 녹화만 √D 대체 [ASSUMED]). `syncBattle`의 미리보기는 우리 개시 낙하 카운터(「배치 낙하」) 위에 둠.
- 적 애니메이션(`49247223` ← `76a2db7d`, PR #275): 빠른 적(moveSpeed > 1 [ASSUMED])의 Run 순환, `Stun_1`·`Dizzy_*` 기절 클립, 거대하고 못생긴 것(적)·
  自在(적) 重生의 Revive. **`cast`는 안 받음** — upstream·우리 sim 모두 `cast` 이벤트가 없어 `case 'cast'`·`setSkillSlot`·적 `anims.skills`(numberedSkills)는
  읽는 곳이 없다. `data/assets.json` 오프라인 재생성(적 6 run·3 stun, 그 밖 변화 없음).
- 联防 sceneId 우회 정리(`640ddd93`): 위 「공식 스테이지 3D 씬」의 「联防 화면」.
- 렌더러 타임아웃(`0f6b25b9` ← `030d0a29`, PR #302): `createFieldView({signal})`·`mountFieldView`. 우리 자원 중 빌드 중에 만들어지는
  공식 이펙트 층(`fxGame`)·보스 준비 경로 커서(`routeCursors`)도 중단 정리(`setupCleanup`)에 등록. 보드 아트·3D 보드 대기는 view 객체 뒤로 옮겨졌지만
  여전히 `return` 전이라 호출자(공식 씬 `setStage`, 개시 낙하)가 보는 순서는 같다 [코드 읽기로 확인, 화면 미확인].
- 위 항목들은 [화면 미확인]. 브라우저 테스트 `RENDER_E2E=1 test/render/initialization.browser.test.js`·`SP_E2E=1 test/e2e/coop.e2e.mjs`(联防 필드가 경기 맵을 그림)로 확인한다.

## 공격 모션 (2026-10-10, 관리자 결정 「동작 변경 모두 공식이랑 동일하게」)
근거: 클라 코드 `AbstractAnimatedAbility.UpdatePlaybackSpeed`(재생 속도 = 1 / 클립 배율, 배율 ∈ [0.1, `_maxAnimScale`]) — 규칙과 sim 쪽은 `sim.md` 「일반 공격 타이밍」.
- sim이 휘두름을 시작하는 틱에 `['swing', id, windup, kind]`를 낸다. `render/app.js`가 받으면 `units.js onSwing` → `spine.js swing(windup)`: 공격 클립을
  **첫 프레임부터 한 번** 재생하고, 속도 = 클립의 OnAttack 프레임 ÷ windup(`swingSpeed`, OnAttack이 없는 클립은 클립 끝 ÷ windup) — 곧 공식 1/배율이라 타격
  프레임이 'atk' 이벤트와 같은 때 온다. 그 타격의 'atk'(대상이 여럿이면 여러 개)와 휘두름 중의 다른 공격은 클립을 건드리지 않는다(`_swinging`). 클립이 끝나면 0.1
  게임 초(`SWING_HOLD`) 마지막 프레임을 쥐고 쉬는 상태로 — 상한 1인 클립은 제 속도로 휘두르고 간격의 나머지는 대기(이전: 오퍼레이터는 클립을 간격에 맞춰 0.35×까지
  늘려 반복 재생 — 그레이·레온하르트·와파린·미즈키 등이 느린 동작으로 보였다).
- 이전 방식(보간 지연 ≈0.2 게임 초 앞을 보는 'atk' 미리보기 → `windUpPlan`, 전딜을 `MAX_WIND_SPEEDUP` 2.5배속까지 감음)은 'swing'이 없거나 windup이 0인
  공격(클립 모르는 유닛, 강제 공격, 적 치유)에만 남는다 — `app.js windUpAttacks`는 'swing'이 예고한 타격의 'atk'를 미리보기에서 뺀다(`swingStrikes`).
- 'swing'은 `interp.js COSMETIC_EVENTS`(늦으면 버림), `shared/protocol.js EV.SWING`.
- 테스트: `test/render/attack-swing.test.js`(가짜 PIXI). [화면 미확인] — 메인 세션의 Windows Chrome 확인 대기.
- **요새 근접·원거리 클립** (관리자 제보 2026-10-10: 号角이 원거리 공격에도 저지 시 모션을 씀): 클라 프리팹 `<id>/Modes/<mode>/Body/Attack/`의
  MeleeAttack·BlockedMeleeAttack·BlockedRangedAttack과 RangedAttack은 다른 클립 — 号角 Default `Attack_A`/`Attack_B`, S2 `Skill_2_A_Loop`/`Skill_2_B_Loop`,
  S3 `Skill_3_A_Loop`/`Skill_3_B_Loop`(S3 아래 방향 원거리 `Skill_Down_3_Loop`은 우리가 아래 방향 클립을 안 써서 제외), 灰毫 Default `Attack02`/`Attack01`
  (반대로 저지 중에도 원거리 Attack01이었음). 역할 추출(`anim-roles.mjs`)은 첫 클립 하나만 고르므로 `units.js FORTRESS_CLIPS`([근접, 원거리] 쌍)를
  두고, 'swing'·'atk'의 kind(sim `ai.js`: 저지 중이면 'none')로 `spine.js _loopOf`가 고른다. 号角 `Skill_1_A`/`_B`는 쓰는 능력이 프리팹에 없음 [추정: 같은 나눔].
  테스트 `test/render/fortress-clips.test.js`. [화면 미확인]

## 모바일 3D 보드 복구 (2026-10-10, 관리자 제보 「모바일에서 간헐적으로 3D 렌더링이 안 된다」 → 관리자 요청 「진단 정보에 3D 상태를 넣고 1·2번부터」)
- 진단(코드): 한 번의 실패가 그 판(또는 페이지) 끝까지 2D로 남겼다 — ① 판을 띄울 때 GPU 검사(`webgl2Available`)를 한 번만 하고, 실패하면 three.js를
  안 불러 복구 경로가 없었다 ② `loadBoardPack`·`loadThree`·`assets.image()`·`assets.local()`이 실패(null)를 페이지 끝까지 캐시 — 모바일 통신에서
  요청 하나가 끊기면 새로고침 전까지 2D ③ 컨텍스트 소실 복구가 `[1200, 4000, 12000]` 3번 뒤 영구 포기(10초 안에 다시 잃으면 실패로 셈 — 메모리 부족
  으로 잃은 휴대폰은 다시 만들자마자 또 잃기 쉽다). 휴대폰 공통(iPhone만이 아님): 기기 판별 없이 모든 브라우저가 같은 경로.
- 처리: 3D를 띄우는 모든 시도(시작 GPU 검사, three.js·보드 아트 받기, 소실 뒤 재구성)가 한 일정(`render/app/retry3d.js`, `app.js try3d`)을 탄다.
  지연은 그대로 `BOARD3D_RETRY_MS`; 다 쓰면 페이지가 다시 보일 때(`visibilitychange` → `retry3d.wake`) 처음부터 다시 — 다른 앱에 갔다 온 휴대폰이
  그 판 끝까지 2D로 남지 않는다. 숨은 동안 돌아온 시도는 보일 때까지 기다렸다가 첫 지연 뒤에(복귀 직후 GPU가 아직 재시작 중일 수 있음).
  다시 받기: `loadBoard3d(assets, { retry })`(`board3d/load.js`) — 실패한 것만 다시(`loadThree` 다른 URL `?retry=N`, `loadBoardPack`, `assets.image(u,
  { retry: true })`, `assets.local({ retry: true })`); 인자 없는 호출은 실패를 그대로 캐시(없는 그림을 매 프레임 요청하지 않게). 보드 아트가 없는 서버
  (매니페스트에 아틀라스 없음)는 `never` — 재시도 안 함.
- 진단 정보(`diag.js`): `render:` 줄(보기 종류 engine/fallback, 3D 켜짐·꺼짐과 이유, 재시도 대기, 컨텍스트 소실 횟수)과 `render events:` 줄(최근
  12개: `3d on`·`3d failed (이유)`·`3d lost`·`3d waits`·`3d retry`·`simplified view`) — `noteRender`, `renderStatus`(`__SP_VIEW__`).
- 확인: `test/render/board3d-retry.test.js`(일정·다시 받기·진단 줄). Windows Chrome `dev/render-demo.html`(실제 `createFieldView`): 10초 안에
  4번 연달아 잃음 → 3번 재구성 뒤 2D·「waits」 → `visibilitychange` → 3D 복귀; 처음 `TX_autochessi_D` 요청 하나 차단 → 「board art failed to load」 2D
  → 재시도로 3D. `[ASSUMED]` 실제 휴대폰(iOS·Android)에서의 효과는 미확인 — 다음 제보의 진단 정보로 원인(소실·받기 실패·GPU 검사·간이 보기)을 가른다.
- 안 한 것(관리자 결정 대기): 휴대폰 GPU 메모리 상한(무대 텍스처 ~90 MB·품질 기본 high). (`fxgame.js destroy`의 `forceContextLoss`는
  아래 「이펙트 렌더러 정리」에서 넣음.)
- 간이 보기 재시도(upstream 0.2.4 `6bfc0827`, 사용자 결정 2026-10-11): `ui/fieldHost.js`가 12초 시간 초과·엔진 오류로 간이 보기(DOM)에 떨어진 뒤,
  `online`·`visibilitychange`(페이지가 다시 보일 때)에 엔진을 처음부터 다시 띄운다 — 연달아 최대 2번(엔진이 뜨면 횟수 0으로), 오프라인·숨김·
  `?render=fallback`이면 안 함. 위 3D 재시도(`retry3d`)는 **엔진 안에서** 보드만 다시 시도하는 것이라 겹치지 않는다(이쪽은 엔진 자체가 실패했을 때).
  새 엔진은 새 view 객체라 `screens/game.js`가 그 view에서 정비 카메라·전투를 다시 들어간다(`enteredViewRef` — 판을 다시 시작하지 않음: 로컬 전투는
  `battleRunner.reshow()`, 서버 전투·관전은 `g.watch`로 새 메타를 받아 버퍼된 재진입 경로로). 진단 `render events:`에 `engine retry n/2`.
  [화면 미확인] 실제 휴대폰에서 간이 보기 → 복귀.

## 공식 스테이지 씬 텍스처 받기 실패 (2026-10-11, 관리자 제보 「일부 유저가 게임 중 3D 렌더링이 제대로 안 된다」)
- 원인(코드): `board3d/official.js loadOfficialScene`이 스테이지마다 이미지 약 21장(텍스처 17 + 라이트맵 4, act1autochess_m01)을 받는데,
  한 장이 실패해도 씬을 성공으로 페이지 끝까지 캐시했고(`assets.image`도 실패를 캐시), 그 재질의 텍스처 자리는 three.js의 빈 텍스처
  (0,0,0,0)를 읽었다 — 불투명 부분은 검게, 알파 테스트·반투명 부분은 사라지고, 라이트맵이 빠지면 구운 조명 없이 그려진다. 컨텍스트 소실 뒤
  보드를 다시 만들어도 같은 캐시라 그대로. 휴대폰 통신에서 요청 하나만 끊겨도 생긴다.
- 처리: `loadOfficialScene(assets, id, { retry, partial })`은 하나라도 빠지면(scene.json·geom.bin·이미지·`scene/devices`) reject하고
  `retry`면 실패한 것만 다시 받는다(받은 이미지는 캐시 그대로). `scene.js _loadOfficial`은 그동안 절차형 보드를 그리고
  `OFFICIAL_RETRY_MS`(2·6·15·30초) 뒤 다시 시도, 마지막 시도는 `partial`(매니페스트에는 있는데 서버에 없는 파일은 영영 안 오므로 예전처럼
  받은 것만으로 그림). 진단 `render events:`에 `3d scene retry`(스테이지·몇 번째·빠진 것).
- 확인: `test/render/board3d-official-retry.test.js`. [화면 미확인] 실제 휴대폰에서 요청 차단 → 절차형 보드 → 공식 씬 복귀.
- 관리자 제보의 「2D 판으로 뜬다」는 이 결함이 아니다(이건 3D 보드 안에서 섬 일부가 검게·빠지게 그려짐). 2D 판이 되는 경로는 위
  「모바일 3D 보드 복구」의 GPU 검사(`failIfMajorPerformanceCaveat`: 하드웨어 가속 꺼짐·소프트웨어 GPU면 의도대로 2D)·보드 아트 받기 실패·
  컨텍스트 연속 소실(휴대폰 메모리 — 상한은 보류) — 진단 정보 `render:` 줄로 가른다.

## 이펙트 렌더러 정리 (2026-10-10, 관리자 요청 「측정 후 고치기」)
- 측정(Windows Chrome render-demo, 공속 +0/+100/+200 녹화, WebGL 호출 집계 — 자세한 표는 관리자 노트): 판 끝 `view.destroy()` 뒤 이펙트 컨텍스트 2개가
  끊기지 않고 텍스처를 쥔 채 남았다 — 후반 R13 약 45 MB(156~167장), 보스 135~171 MB(362~461장), 강제 GC 3번에도 그대로(옛 view → fxGame의
  `lib` → THREE.Texture 'dispose' 리스너 → 렌더러 → 컨텍스트). 보드(`scene.js destroy` `forceContextLoss`)·Pixi(`releaseGl` + `loseContext`)는 바로 끊김.
  공격속도는 양을 거의 안 바꿈(텍스처는 프리팹 이름별 캐시, 동시 이펙트 24개 상한).
- 처리: `fxgame.js destroy` — `lib.dispose()`(`fxplayer.js FxLibrary.dispose`: 텍스처·메시 dispose, 캐시 비움; `lib` 자체는 남겨 늦게 끝난 로드가
  오류를 내지 않음), 가림 메시(occluder) geometry·material dispose, 그다음 렌더러 2개 `dispose()` + `forceContextLoss()`. 기기 구분 없음(데스크탑 포함).
- 확인: 같은 측정으로 destroy 직후 이펙트 컨텍스트 2개 모두 lost, 남은 텍스처 0(보스·후반 × 공속 3단계, 페이지 오류 없음). `test/render/board3d-retry.test.js`
  FxLibrary.dispose.

## 블레이즈 디 이그나이팅 스파크(烛煌) S3 자세 (2026-10-10, 사용자 제보 「S3 켜진 동안 지금의 공격 모션을 계속 유지」)
- 원인: S3 클립 묶음(Skill_3_Begin / Skill_3_Loop / Skill_3_End, 자기 Idle 없음)에서 렌더가 Skill_3_Loop을 공격 클립으로 써서 공격마다 처음부터
  한 번 틀고, 공격 사이(`attackUntil` 뒤)는 기본 Idle로, 클립 끝(`clip.end` = Skill_3_End)도 공격마다 틀었다 — 첫 공격 뒤 S3 자세가 사라짐.
- 공식(클라 charpack `char_1040_blaze2/Modes/S3`): `_replaceAnimPairs` Idle → Skill_3_Loop, 공격 능력 `_animKey ""`(`local-attack-timing.json` S3 anim "",
  wait 0) — S3 동안 Skill_3_Loop이 자세로 계속 돌고 공격은 클립을 바꾸지 않는다.
- 고친 것: `units.js STANCE_SKILLS`(Spine id → 스킬 번호, 지금 烛煌 S3만) → `spine.js _stance()`: 스킬이 켜져 있으면 쉬는 클립 = 스킬 루프, 공격 클립 없음
  (swing / windUp / attack이 클립을 안 건드림). 시작 Skill_3_Begin, 끝 Skill_3_End는 그대로. 테스트 `test/render/stance-skill.test.js`. [화면 미확인]
- 같은 꼴(모드 공격 `_animKey ""`)은 `local-attack-timing.json`에 23개 더 있으나 대부분 여러 능력 묶음의 빈 부모라 제보된 烛煌만 넣음 — 다른 오퍼레이터는 제보 때 확인.

## 가상적: 관(假想敌：管) 숨겨진 핵심 모델 위치 (2026-10-10, 사용자 제보 「일반 관은 맞는데 숨겨진 핵심의 관은 왼쪽으로 치우쳐 보인다」, 공식 캡처 없음)
- 찾은 것: 숨겨진 핵심 레벨(act1autochess_h08_03 / _s)은 관(`enemy_9021_acduml_2`)과 가상적: 현을 둘 다 (행 3, 열 9)에 세운다 — 일반 관(h07_03)은 열 10(필드 가운데).
  숨겨진 관 프리팹(enm_pfb_29)은 피격 상자 BoxCollider2D `m_Offset` x 1(일반 0)과 보스 HP 바 `_bossHudOffset` x 1.4(일반 0)만 다르고, Spine 데이터
  (같은 skeletonDataAsset), Graphic 노드(0, −0.2, −0.06 / 0.27), 루트 EnemyGiantBoss의 나머지 값, 레벨 지도(19×21)·카메라 플러그인(없음)은 같다.
  클라에서 모델을 옮기는 장치는 못 찾음(EnemyGiantBoss `_bossHudOffset`은 HUD만).
- [ASSUMED] 사용자 관찰대로 숨겨진 관의 몸·그림자를 한 열 오른쪽(피격 상자 자리, 열 10)에 그린다 — `units.js MODEL_SHIFT`(적 키 → 열 수, 지금 이 하나).
  유닛 위치·HP 바(자기 1.4 오프셋)·선택 영역은 그대로. 현은 같은 경우가 아님(오프셋 없음) — 그대로. 이 모델에 붙는 이펙트·그 모델에서 나가고
  들어오는 궤적·버프 선 끝도 그린 열을 따른다(`fxgame.js mx`; 모델 점 `specialPoint`는 원래 그린 몸을 따름). 테스트 `test/render/model-shift.test.js`. [화면 미확인]

## upstream 0.2.3 이식 — 렌더 (2026-10-11)
- **외근 의료(外勤医疗, 전략)의 예비 오퍼레이터-메딕(预备干员-医疗)을 준비 단계에 표시** (upstream PR #451 by @YinqiMargatroid, `9db9f3ce`·`996fede8`; v0.2.4
  `6bfc0827`도 같은 코드): 살아 있는 플레이어 누구든 외근 의료를 가지면 모든 살아 있는 플레이어의 준비 화면·보스전 짝 화면·정찰 화면에 스테이지 자리의
  예비 메딕을 읽기 전용으로 그린다(`m.private.prepMapChars` — `server/match/match/views.js prepMapChars`, `_prepBoardUnits`; 끌기·판매 불가인 `m:<uid>` 뷰,
  `render/app.js`는 그 목록을 보스전 짝 말과 함께 `syncMates`로 넘기기만 함 — app.js 변경 최소, DOM 대체 화면은 `ui/fallbackField.js`). Touch로 바뀌는 것은 전투
  시작 때뿐. 클라 근거: `aceffect_band_61` = `auto_chess_change_map` 두 개(정예 ≤1 → `char_605_cmedic#*` 켬, ≥2 → `char_613_acmedc#*`)가 스테이지의 미리 놓인
  캐릭터(predefine)를 켜고 끄고, `AutoChessBattleDataModel.PrepareForPrepareState`(0x843AC0)가 말 목록을 비운 뒤 효과를 적용하므로 준비 화면은 늘 예비 메딕,
  `_PrepareForBattleState`(0x847B30)가 실제 출전 말로 다시 센다(비공개 디컴파일 기록). 어그로 순서는 `sim.md` 「upstream 0.2.3 이식」. 테스트
  `test/match/touch-prep.test.js`(PR). **[화면 미확인]** 준비·보스전 준비(오른쪽 플레이어 거울)·정찰·대체 화면에서 예비 메딕 위치·방향.
- **멈춘 자세는 다시 계산·다시 그리지 않음 + 재배치 링 글자 공유** (upstream PR #434 by @Cloudnyco, `2fdc565c` cherry-pick, 브라우저 테스트 후속 `584cedc1`·
  `6036e6a4`; 관리자 결정 2026-10-11 전부 이식): `SpineActor.poseHeld()`(render/spine.js)는 얼어붙은 모델(`frozen`)이나 죽은 모델의 track 0 하나가 반복·믹스
  없이 끝까지 재생됐을 때(Die 마지막 프레임, Die 없는 골격은 timeScale 0의 Idle) 참 — 단 `update()`가 현재 클립·현재 tint를 한 번 반영한 뒤에만, 폼 마무리 클립·
  윈드업 대기 중엔 거짓. 그동안 `render/units.js`는 골격을 다시 계산하지 않고(`clock`만 감) impostor 슬롯도 다시 그리지 않는다(새 클립·재배치·눈꺼풀 마스크
  켜짐↔꺼짐·12% 넘는 확대·축소면 다시). 링 숫자·`DP`·`!`는 링마다 `PIXI.Text` 대신 (글자·색·해상도)별 공유 텍스처(`render/textures.js downLabel`, 웹 폰트가 늦게
  오면 `refreshDownLabels`). 공식 동작과는 무관한 성능 변경(같은 픽셀). 충돌 해결: 우리 「낙하 중 클리핑 없는 모델은 impostor 안 씀」(`a8277c09`, 위 「배치 낙하」)
  조건을 그대로 두고 upstream `held`를 더함 — 낙하 중엔 `mode 'deploy'`라 `poseHeld()`가 어차피 거짓. upstream의 `_wolfPips`·`ammoCuts`(R22-HUD, 우리 미이식)는
  넣지 않음. 우리 쪽 보강 2개(upstream에 없음): ① 跃跃(回环射手, 오퍼레이터)의 손 부메랑(`render/boomerang.js syncHeldWeapon`)이 스킨을 바꾸면
  `_applied = false` — 쓰러져 Die가 끝난 뒤 날던 부메랑이 돌아와도 손의 바퀴가 다시 그려진다(pixi-spine은 스킨 변경을 update에서 반영; 얼어붙은 모델은
  `update()`가 골격을 안 움직이므로 전과 같이 안 보임). ② 멈춘 자세의 impostor 슬롯도 `HELD_REDRAW_FRAMES`(240프레임, 60 fps에서 ~4초)마다 한 번은 다시 그림 —
  슬롯 픽셀은 RenderTexture에 있어 WebGL 컨텍스트를 잃었다 되찾으면(휴대폰 메모리 부족·탭 전환) 비어 돌아오는데, 우리 Pixi 쪽엔 복구 처리가 없어 쓰러진
  오퍼가 재배치까지 빈 칸으로 남을 수 있었다. 테스트 `test/render/held-pose.test.js`(upstream 9건 + 보강 2건), `test/render/downring.test.js`,
  `test/render/held-pose.browser.test.js`(RENDER_E2E). **[화면 미확인]** 쓰러짐·재배치·빙결·확대·마스크 전환·跃跃 부메랑·DPR 변경·컨텍스트 소실 복구.

## 이륙 높이 (2026-10-11, 관리자 결정 「이륙 중 모델을 띄움」)
- 이륙(起飞, 시뮬 플래그 `liftoff`: 안젤리나 더 멜로우 위시 S1~S3, 켈시 에스페란타 재능(배치 내내), 蒂比 등)한 오퍼레이터를 비행 적과 같은 높이(`FLY_HOVER` 1.3칸)로
  그린다 — 몸·HP 바·발밑 이펙트가 함께 뜨고, 그림자와 방향 표시는 칸에 남는다. 내려앉으면(이륙 해제) 다시 내려온다.
- 근거: 클라는 이륙을 비행 단위처럼 다룬다 [추정: 비행 높이 로직은 네이티브라 못 읽음]. 안젤리나 더 멜로우 위시 S3 범위 원(`aglna2_skill_03_range_01`,
  발밑 FOOT 마운트)의 `static_offset`이 (0, −0.414, +0.666) — 발밑에서 0.666칸 아래(바닥 밑), 0.414칸 앞 — 으로, 발이 땅에 있으면 원이 한 칸 아래에 보이고
  (관리자 제보 「원형 이펙트가 약 한 칸 아래 타일에」), 비행 높이에서 시작하면 그녀 칸에 온다(디버그 아레나 확인). 다른 발밑 이펙트의 오프셋은 거의 0이다.
- 코드: 스냅숏 비트 `shared/local.js UF_LIFTOFF`(2048, `server/sim/snapshot.js flagsOf`), `render/units.js` `liftoff` → `hover`, `render/fxgame.js lifted()`의
  발밑 기준점이 이륙한 오퍼레이터면 그 높이를 탄다(비행 적의 발밑 이펙트는 그대로 — 클라의 FOOT·NONE도 비행 높이를 포함하지만 이번에 바꾸지 않음).
- golden: 결과는 그대로, 이륙 유닛이 있는 시나리오의 스냅숏 해시만(roster-004·006·025, diy-009·011).

## upstream 0.2.4 이식 — 렌더 (2026-10-11)
- **琳琅诗怀雅(오퍼레이터) 스킬 금화 = 공식 탄환 칸** (upstream PR #450 by @IceCodeNew, `6bfc0827`의 금화 표시를 공식대로 바꿈; 관리자 결정 2026-10-11 「공식대로」):
  1차 이식의 금색 숫자 줄(`CoinPurse`, `[ASSUMED]` 모양)은 걷어냈다. 금화는 그녀의 SP이고 클라는 그 SP를 HP 바 아래 탄환 칸(`char_bullet_bar`)으로 그린다
  (스킬 프리팹 `_showSpAsBulletMode`) — 규칙·근거·칸 수는 `docs/rules/ui.md` 「탄환형 스킬」. upstream의 숫자 줄은 두지 않는다(클라에 그런 표시 없음).
- **샴페인 폭탄(香槟炸弹, 琳琅诗怀雅의 소환물) 원래 스킨 모델** (upstream `6bfc0827`; 관리자 결정 2026-10-11 「받음」): 웹 덤프에는 스킨
  `ambienceSynesthesia_4`뿐이라 그동안 그 스킨으로 그렸다. 로컬 클라의 전투 소환물 팩(`pkgrps/btl_pfb_tokens_0.ab`, Front 렌더러)에서 원래 모델을 뽑아
  `tools/local-extract/extract.py TOKEN_SPINES`에 더하고(`--only spine/token/token_10031_swire2_gdtrap`, EN 클라), `fetch-assets --local-spines`로
  `tools/assets/local-token-spines.json`·`data/assets.json tokens[id].spineLocal`에 실음(메타데이터는 upstream 것과 같음). 웹 스킨은 그대로 두어
  `spineEntry`의 `fallback` — 로컬 그림이 없거나 못 읽으면 지금처럼 웹 스킨. 크기는 전과 같이 `TOKEN_MODEL_K` 0.25/0.27. 테스트
  `test/local-token-models.test.js`·`test/local-extract.test.js`(8개). **[화면 미확인]** 설치·공격·소멸 클립과 크기.
