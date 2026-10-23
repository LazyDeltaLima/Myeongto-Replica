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
  알려진 차이: “双眼皮” 포탑은 절차 상자 그대로. 土石结构(act1 m06 `trap_032_mound`)는 2026-10-18부터 공식 모델 — `fx.md` 「战场#06 沙尘暴 연출」.
- 받기 (2026-10-17, 관리자 제보: 기기 모델을 다시 추출한 뒤 공식 씬 맵에서 `unDzs` RangeError): `scene.json`과 `geom.bin`은 둘 다 `cache: 'no-cache'`로
  받는다(`official.js fetchJson`·`fetchBin`). 서버는 `geom.bin`을 `max-age=86400`으로 보내고 서비스 워커는 `.bin`을 다루지 않아, `geom.bin`만 HTTP 캐시에서
  오면 새 `scene.json`의 범위가 옛 버퍼 밖을 가리켰다(`scene/devices`에 배 모델이 더해져 2 → 3기기). 바뀌지 않았으면 304 한 번.
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

## 모델 위치값·그림자 — 望 놓은 棋子 (2026-10-22, 관리자 결정 2026-10-17 「바둑돌 먼저, 다음에 오퍼레이터·토큰 전부」)
- 계기: 관리자 확인 2026-10-22 「이펙트 작업 뒤 재능(跟子) 바둑돌이 낮아진 것 같다」. 跟子는 바뀌지 않았다 — 같은 추출 프리팹을 1.4.9·10-22 이펙트
  커밋 전·지금의 재생기로 돌려도 공(`wang_passive_01_buff`의 `qizi (1)`)은 칸 점(+0–0.04칸 흔들림), 그림자 `andi`는 화면 0.155칸 아래로 같고,
  다시 뽑은 추출물도 위치값은 같다(`face.hold`만 더해짐). 낮아 보인 것은 놓은 棋子와 나란히 볼 때다: 놓은 棋子는 공이 칸 점 위 0.18칸에 떠 있었다.
- 근거(EN 클라 토큰 프리팹 `pkgrps/btl_pfb_tokens_4.ab` `token_10064_wang_stone1`): 모델 `Graphic/DefaultSkin/FaceSwitcher` 위치 (0, −0.16, −0.1)·
  배율 0.27, 그림자 `Others/Shadow/Sprite` 위치 (0, −0.17, 0)·배율 0.12(`sprite_shadow` 507×162 px, 100 px = 1단위 → 판 위 0.608 × 0.194칸, 알파 0.5).
  `Graphic`은 X축 −30°(「캐릭터 그림의 기울기」, fx.md)라 FaceSwitcher 값은 기운 판 기준이고, `Others`는 안 기울어 판 위 값이다. 왕 본인
  (`chararts/char_2027_wang.ab`)과 같은 묶음의 다른 토큰·장치도 같은 값이다. 우리 렌더러는 어느 유닛에도 이 위치값을 안 쓰고(모델 뿌리 = 유닛 점),
  그림자는 모든 유닛 폭 0.95칸(보스 1.6)이었다 — upstream 첫 코드부터의 값, 공식 근거 없음.
- 공식 캡처(비공개 조사 기록 2026-10-07, 바둑돌 둘): 공 중심이 칸 중심 근처, 그림자 진한 폭 0.55–0.59칸·세로/가로 약 0.25 — 위 값으로 계산한 모습과 맞다.
- 적용: `fxpoints.js` 표(처음엔 바둑돌 하나, 2026-10-23부터 `STANDARD_PLACE`·`modelPlace` — 아래 절)·`modelOffset`(−30° 기울기를 풀어 판 위 열·행·높이로:
  (0, −0.16, −0.1) → 카메라 쪽 0.189행, 0.007 위). `units.js`가 몸을 그 자리에(`modelDY`·`modelDZ`, `MODEL_SHIFT`의 `modelDX`와 같은 길), 그림자를
  프리팹 자리·크기로(가로 0.608칸, 세로는 판 위 0.194칸을 카메라로 투영 — 화면 비율 약 0.28) 그린다. 跟子가 품질 낮음에서 모델로 돌아와도 같은 키라 같이 맞는다.
  바둑돌 이펙트의 공(`fxgame.js ballAt`: 활성 이펙트·연결선 끝)은 옮긴 모델 뿌리에서 `STONE_BALL` 0.18칸 위 — 하드코딩 0.18을 바꾸지 않고 뿌리를 옮겼다.
- 화면: 기운 판 안의 −0.16은 화면에서도 0.16칸이고, 카메라 쪽 −0.1은 원근 시차를 더해 모델이 가까운 줄 약 0.21칸 ~ 먼 줄 0.15칸 내려간다(같은 공식 카메라라
  공식도 같다). 그래서 공은 칸 점 ±0.05칸 — 跟子의 `qizi (1)`과 같은 높이다. 덤: 바둑돌 활성 이펙트 `token_wang_01_buff`와 탄생 `token_wang_birth_01_buff`는
  클라에서 `_spawnLocation` 5(GROUND_CENTER, 엔티티 땅 점)인데 공식 캡처에선 공을 감쌌다 — 공이 땅 점에 있으니 둘 다 맞았던 것이다.
- 그대로 둔 것: 유닛 점 기준인 선택 영역(`bounds`)·충전 표시·HUD(바둑돌은 HP 바 없음), 발·땅 이펙트(FOOT·GROUND_CENTER는 `Graphic`·엔티티 점이라 맞음).
  다른 오퍼레이터·토큰은 다음 절(「오퍼레이터·토큰 전부」).
- 확인: `test/render/model-place.test.js`(프리팹 값, −30° 변환, 바둑돌 뷰의 몸·그림자 자리·크기와 다른 유닛은 그대로, 공이 칸 점 ±0.05칸),
  `model-shift.test.js`. Windows Chrome 디버그 아레나(望 S1, 자동 棋子, 전·후 서버 나란히): 전 — 놓은 棋子 몸·그림자 0·폭 0.95, 공이 같은 줄 跟子보다 약
  0.18칸 위; 후 — 몸 0.155–0.168칸·그림자 0.138–0.154칸 아래, 그림자 0.61 × 0.16–0.18칸, 같은 줄 두 돌의 공이 같은 높이. [화면 미확인: 실제 판]

## 모델 위치값·그림자 — 오퍼레이터·토큰 전부 (2026-10-23, 위 절의 다음 단계)
- 근거(EN 클라 + EN에 없는 셋은 CN 클라, 오퍼레이터 146(풀·선발·预备) + 소환물 24 전수): 오퍼레이터는 `chararts/<charId>.ab` `DefaultSkin/FaceSwitcher`, 그림자는
  `charpack/<charId>.ab` `Others/Shadow/Sprite`; 토큰은 `pkgrps/btl_pfb_tokens_*.ab` 프리팹의 `Graphic` 아래 스켈레톤 노드(FaceSwitcher·`Spine`)와 같은
  그림자. 대부분 바둑돌과 같은 값 — 모델 (0, −0.16, −0.1)·배율 0.27, 그림자 (0, −0.17)·배율 0.12 — 이고 다른 것은 27(아래 25 + 다음 항목의 CN·적 프리팹 소환물 둘):
  좌우 위치 −0.06(5명)·−0.03(3명)·+0.03(2명), 배율 0.26(3명), 锏 그림자가 발밑 (0, 0); 토큰은 医疗探机·诅咒娃娃 배율 0.4·
  `Graphic` 자체가 0.2 위·그림자 배율 0.06, 沙之碑·迷迭香的战术装备 그림자 (0, −0.2)·세로 0.06, “小自在” 모델 −0.15·그림자 −0.16·0.10,
  香槟炸弹·风雪之眼 배율 0.25, 风雪之眼은 그림자 `Sprite`에 SpriteRenderer가 없어 그림자를 안 그림, 스켈레톤 없는 둘(`EmptyAnimator`:
  `token_10039_ulpia_block`·`token_10058_sbell2_icetgt`)은 노드 (0, −0.2, −0.06)이고 앞의 것은 그림자도 없음. 스킨 루트(`DefaultSkin`)의 자기 위치는 쓰지 않는다
  (阿罗玛 −1.895처럼 저장값이 있어도 게임 화면은 칸에 있음 [ASSUMED: 스킨을 붙일 때 루트를 원점에 둠]).
- 적용: 표준값은 `fxpoints.js STANDARD_PLACE`, 유닛별 값은 로컬 추출 표 `tools/local-extract/model_place.py` → `public/assets/local/fx/places.json`(git 밖,
  배포 서버에도 같은 파일; 관리자 결정 2026-10-22 「클라 전용 추출 표는 공개 저장소에 새로 두지 않음」). `modelPlace`가 키(`diy.charId`·`spine`·`defId`)로
  표를 찾고 없으면 표준값(표가 없는 컴퓨터도). EN 클라에 없는 予愿安洁莉娜·克莱门莎·予愿安洁莉娜의 소환물은 CN 클라에서 읽음(앞 둘은 표준값,
  소환물은 스켈레톤 없는 노드·그림자 없음); 적 프리팹인 “炎佑”는 `battle/enm_pfb_*.ab`에서 — 위치값 (0, −0.2, −0.06)과 배율 0.27이 `Graphic` 자체에
  있고(판 위 값, 비행 적과 같은 꼴) 그림자는 `Shadow/Sprite`. 표가 늦게 오면 뷰가
  다시 읽는다(`placesVersion`). `units.js`가 몸을 그 자리(`faceDX`·`modelDY`·`modelDZ`: 몸만, `modelDX`는 유닛 전체)에, 배율을 노드 배율/0.27(`modelK`,
  표가 없으면 `TOKEN_MODEL_K`)로, 그림자를 프리팹 자리·크기로 그리고, 그림자 없는 프리팹은 그림자를 끈다. 적은 그대로(자기 데이터 경로가 따로).
- 따라가는 것과 아닌 것(공식 기준):
  - HP 바·HUD는 **유닛 점에 그대로**: 공식 `UIUnitHUD.Attach`가 `hud_unit`을 유닛의 `_uiMountPoint`에 붙이는데 오퍼레이터 프리팹은 비어 있어
    `Unit.OnAwake`가 유닛 자신의 transform으로 채운다(ui.md 「뜨는 높이」) — 모델 노드가 아니다. 우리 `HUD_ANCHOR`(발 위 24.5)도 유닛 점 기준으로
    캡처에 맞춘 값이라 이중 보정이 아니다.
  - 충전 표시는 모델을 따라감: 공식 `_FollowPosition`이 `FaceSwitcher/HeadPoint`를 따르고, 우리 `headPointY`가 `root`(옮긴 몸)에서 잰다.
    좌우 위치(±0.06)는 표식 x에 안 넣었다(머리 점의 x도 안 씀).
  - 모델 점 이펙트(총구·피격·머리·특수 점, `points.json`)는 `root`에서 재므로 따라감. 점 표가 없는 유닛의 몸·머리 높이(`fx/camera.js bodyZ`: 투사체 출발·조준,
    `SPAWN_FRAC`)는 `modelDrop`(모델 발이 유닛 점보다 화면에서 내려간 칸)만큼 내려 모델을 따라감. 발·바닥 이펙트(FOOT·GROUND_CENTER = `Graphic`·엔티티
    점)는 유닛 점 그대로.
  - 그대로 둔 것: 툴팁 사각형(`bounds`), 바둑돌 이펙트의 공 올림(`STONE_BALL` — 땅 점으로 둘지는 화면 비교 뒤), 적.
- 확인: `test/render/model-place.test.js`(표준값·−30° 변환·`Graphic` 올림, 표 항목·키 순서·그림자 없음, 오퍼레이터·토큰 몸·그림자 자리, HUD는 유닛 점,
  표가 늦게 와도 다시 읽음, `bodyZ`가 모델을 따라감), `feedback3-shot-height`·`model-shift`. Windows Chrome 디버그 아레나: 薄绿(char_388_mint) 몸 0.068칸 왼쪽·
  0.161칸 아래, 그림자 0.148칸 아래·0.61 × 0.17칸; 赫默의 医疗探机 몸 0.081칸 아래(0.2 올림 − 0.16)·그림자 0.31칸·배율 ×1.48; 발이 칸 앞쪽 끝·HP 바가 바로 밑으로
  공식 PC 캡처(관리자 제공 2026-10-07, 8라운드)와 같은 모양. [화면 미확인: 실제 판에서 공식 캡처와 나란히 — 오퍼레이터 발·HP 바·그림자, 风雪之眼 그림자 없음]

## 로컬 추출 Spine 페이지의 알파 — bleed 페이지 (2026-10-23, upstream PR #668의 증상)
- 계기: upstream PR #668(「추출 페이지를 straight alpha로, atlas에 `pma` 안 씀」)이 반투명 가장자리가 칙칙하다고 보고. 우리 추출(`extract.py`)도
  8모델에서 같은 증상이었으나 원인과 고칠 곳이 PR과 다르다.
- 근거(EN 클라): 추출하는 토큰·적 모델 머티리얼은 모두 셰이더 `Torappu/Spine/Skeleton-AlphaSplit (Z-Distorted)`(블렌드 One, OneMinusSrcAlpha → 출력은
  premultiplied). 이 셰이더는 키워드 `_USEBLEED_ON`(머티리얼 `_UseBleed 1`)일 때만 RGB에 A를 곱하고, 없으면 텍스처 RGB를 그대로 낸다. 즉
  `_USEBLEED_ON` 페이지 = straight(투명 텍셀에 색이 번져 있음), 나머지(`[alpha]` 분리 페이지) = 이미 premultiplied. 예전 판정에 쓰던
  `_StraightAlphaInput`은 이 셰이더의 속성이 아니라(남은 직렬화 값, 늘 0이거나 없음) 아무것도 가르지 못했다.
- 증상: straight 페이지도 분리 페이지처럼 `min(RGB, A)`로 잘라, 어두운 채널은 그대로 두고 밝은 채널만 A로 잘린 반투명 가장자리가 밝고 회색이었다
  (风雪之眼 파란 가장자리가 회색·약 4배 밝음, 战术锚点 반투명 평균 오차 54).
- 적용: `extract.py material_straight` — `_USEBLEED_ON`(유효 키워드 목록·문자열) 또는 `_UseBleed 1`이면 straight → 페이지 RGB × A. 모든 페이지가
  premultiplied + `pma: true`로 남아 atlas·메타데이터 형식은 그대로다. 다시 뽑은 것: 그 8모델 — 魂灵之影 `token_10035_wisdel_wward`·防护单元
  `token_10041_cathy_catsld`·风雪之眼 3종 `token_10057_svash2_eagle1–3`·棋子 `token_10064_wang_stone1`·战术锚点 `token_10068_kalts2_mtship`·
  `trap_185_vtlntw`(페이지만 바뀌고 skel·atlas·manifest는 같음). 분리 페이지 둘(香槟炸弹·`trap_039_dstnta`)과 적 원석충은 바이트까지 같다.
- PR #668을 그대로 받지 않은 까닭: 분리 페이지는 이미 premultiplied라 `pma`를 빼면 업로드 때 한 번 더 곱해져 가장자리가 어두워진다(원석충·香槟炸弹이
  틀어짐). PR의 「알파를 두 번 곱한다」는 설명도 우리 코드(`pma: true` 페이지는 다시 안 곱함)에는 맞지 않는다.
- 그대로 둔 것: 분리 페이지의 `min` 클램프(클라는 RGB > A를 그대로 더해 발광처럼 보임; 원석충 0.6 % 픽셀, 최대 63 차이) — 압축 번짐인지 의도된
  발광인지 모름 [ASSUMED].
- 확인: `test/local-extract.test.js`(`material_straight`, `merge_alpha` straight 곱하기), 다시 뽑은 페이지의 반투명 픽셀 중 RGB = A(잘린 흔적)
  风雪之眼 66 → 1.9 %·战术锚点 90 → 2.7 %, 香槟炸弹 2.8 % 그대로. [화면 미확인: 风雪之眼·战术锚点 가장자리가 회색 테 없이 원래 색, 원석충은 그대로]

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
  [화면 미확인]

## 보스 경로 미리보기 (2026-10-08, 관리자 제보 → 관리자 요청 「실제 루트를 알 수 없으니 준비기간에 경로를 표시」)
- 2026-10-15부터 **캐주얼 규칙 모드에서만**(관리자 결정, `ui.md` 「규칙 모드 — 클래식·캐주얼」): 클래식 판은 서버가 리더 항목에 `paths`를 싣지 않는다(`server/match/match/views.js nextEnemiesFor`).
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
- **'swing' 없는 공격도 공격마다 클립 한 번** (upstream #506, upstream `221e6b8d`의 `render/spine.js` 부분을 손으로 이식, 2026-10-15): 위 'atk' 길
  (`windUp`·`attack`, 모델이 늦게 떠서 'swing'을 못 받은 때·늦어 버려진 'swing'도 여기로)에서 오퍼레이터 클립이 마지막 공격 뒤에도 간격 ×1.4(최소 0.45초)
  동안 반복돼 공격 없는 휘두름이 한 번 더 보였다. 이제 적처럼 공격마다 클립을 한 번만 틀고 끝나면(남은 클립 길이 = `attackUntil`) end 클립·쉬는 상태로.
  오퍼레이터의 리듬 배속(`loopDur / interval`, 0.35–4)과 감아 둔 클립의 타격 프레임 맞추기(re-phase)는 그대로, 반복 재생만 없앴다. 앞 공격의 회복 중에 온
  다음 공격은 새 와인드업·새 클립으로 시작하고, 차례 클립 역할(`alts`)은 감지 않은 공격마다 다음 클립(감은 공격은 `windUp`에서 이미 넘김). 스킬 전용 idle
  (그 idle로 바로)·`clipPerAttack`(적)·`once` 캐스트·strike 스킬 클립 규칙은 그대로.
  - 근거: upstream 관리자의 재현(upstream #506 「공격 뒤 한 번 더 휘두름」). **[ASSUMED]** 공식에서 연속 공격 사이에 대기 자세로 돌아가는지는 공식 녹화로 확인
    필요 — 우리 'swing' 길(위)도 클립이 끝나고 0.1초 뒤 쉬는 상태라 같은 가정이다.
  - 확인: `test/render/feedback2-enemy-attack-clip.test.js`(upstream 판 — 오퍼레이터 한 번·회복 중 다음 공격·프로방스 간격 0.08/1.6/8·실제 Spine 런타임의 묶음
    갱신), `test/render/attack-alts.test.js`(아스카론 'swing' 없는 차례 클립). [화면 미확인]
- 'swing'은 `interp.js COSMETIC_EVENTS`(늦으면 버림), `shared/protocol.js EV.SWING`. 칸: `['swing', id, windup, kind, base?, face?, combat?]`(docs/SIM.md).
- 테스트: `test/render/attack-swing.test.js`(가짜 PIXI). [화면 미확인]
- **요새 근접·원거리 클립** (관리자 제보 2026-10-10: 号角이 원거리 공격에도 저지 시 모션을 씀): 클라 프리팹 `<id>/Modes/<mode>/Body/Attack/`의
  MeleeAttack·BlockedMeleeAttack·BlockedRangedAttack과 RangedAttack은 다른 클립 — 号角 Default `Attack_A`/`Attack_B`, S2 `Skill_2_A_Loop`/`Skill_2_B_Loop`,
  S3 `Skill_3_A_Loop`/`Skill_3_B_Loop`(아래로 배치하면 S3(D) 모드의 원거리 `Skill_Down_3_Loop` — 아래 「아래 방향」), 灰毫 Default `Attack02`/`Attack01`
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
- 간이 보기 재시도(upstream 0.2.4 `6bfc0827`, 관리자 결정 2026-10-11): `ui/fieldHost.js`가 12초 시간 초과·엔진 오류로 간이 보기(DOM)에 떨어진 뒤,
  `online`·`visibilitychange`(페이지가 다시 보일 때)에 엔진을 처음부터 다시 띄운다 — 연달아 최대 2번(엔진이 뜨면 횟수 0으로), 오프라인·숨김·
  `?render=fallback`이면 안 함. 위 3D 재시도(`retry3d`)는 **엔진 안에서** 보드만 다시 시도하는 것이라 겹치지 않는다(이쪽은 엔진 자체가 실패했을 때).
  새 엔진은 새 view 객체라 `screens/game.js`가 그 view에서 정비 카메라·전투를 다시 들어간다(`enteredViewRef` — 판을 다시 시작하지 않음: 로컬 전투는
  `battleRunner.reshow()`, 서버 전투·관전은 `g.watch`로 새 메타를 받아 버퍼된 재진입 경로로). 진단 `render events:`에 `engine retry n/2`.
  [화면 미확인] 실제 휴대폰에서 간이 보기 → 복귀.
- 시간 초과 예산·시간 재시도 (2026-10-12, 관리자 제보 「iOS Safari 탭에서 필드가 2D, 홈 화면 앱은 정상」 → 관리자 요청 「1·2번 같이」):
  진단 정보 `render: view fallback`·`simplified view (createFieldView timed out)` — 3D 보드가 아니라 엔진 전체가 12초 경쟁에서 졌다. 원인(코드):
  `createFieldView`의 선택 대기(매니페스트 4초·폰트 1.5초·보드 아트 2.5초·3D 보드 6초 = 14초 + Pixi 받기)가 바깥 12초보다 길어, 빈 캐시에서 3D
  보드가 느리면 멀쩡한 엔진까지 버렸다. Safari 탭만인 이유(추정): iOS 홈 화면 앱은 Safari와 저장소(서비스 워커 캐시)가 따로라 탭 쪽이 빈 캐시.
  처리: ① `fieldHost.js`가 `deadline`(epoch ms)을 넘기고 `createFieldView`의 선택 대기는 모두 `capWait`(`render/app/host.js`)로 마감 500 ms
  전까지로 줄인다 — 늦은 보드 아트·3D 보드는 엔진이 뜬 뒤 붙는다 ② 간이 보기로 떨어진 뒤 페이지가 보이는 중이면 5초 뒤(`FALLBACK_RETRY_MS`)
  엔진을 다시 띄운다(연달아 2번 한도를 같이 씀; 진단 `engine retry n/2 timer|online|visibilitychange`).
  확인: `test/render/mount-deadline.test.js`, `test/ui/fieldHost-lifecycle.test.js`; Windows Chrome 하네스(관리자 노트의 mount-deadline.mjs, 서비스
  워커 우회 + 요청 지연): Pixi 6초·보드 아트·three.js 8초 → 11.8초에 엔진, 31초에 3D 붙음(이전 코드라면 6 + 2.5 + 6초 > 12초로 간이 보기);
  첫 Pixi 14초 → 12.2초 간이 보기 → 17.3초 시간 재시도 → 18.1초 엔진 + 3D. [화면 미확인] 실제 iPhone Safari 탭.
- 필드 로딩 단계 시간 (2026-10-12, 관리자 질문 「모바일은 wifi인데도 필드 진입이 느림 — 기기 성능?」 → 관리자 요청 「추가해」): 진단 정보에
  `mount:` 줄(최근 4번) — `diag.js mountTimer`를 `fieldHost`가 만들어 `createFieldView`에 `timing`으로 넘긴다. 단계: `store`·`engine`(모듈
  import)·`pixi`·`manifests`·`fonts`·`setup`·`art`·`3d`(초; 마감으로 끊긴 대기는 `cut`), 결과 `engine`/`fallback`/`cancelled`, `arrived:`(판 그림·
  3D 보드·공식 씬이 도착한 시각, 마운트 시작부터), `net`(그 구간의 Resource Timing: 파일 수·전송 MB·전송 0인 캐시 파일 수). `device:` 줄에
  `home-screen app`(iOS standalone)·`resource worker`(서비스 워커가 페이지를 맡음). 받기 대 디코딩·설정을 가르는 용도 — 측정 기능이지 동작 변경 없음.
  확인: `test/diag.test.js` 3, lifecycle 1; Windows Chrome 하네스에서 slow3d `engine in 11.7 s | … pixi 6.1, … art 2.5 cut, 3d 2.8 cut | arrived: art
  14.6 s, 3d 31.3 s | net 99 files, 3.1 MB`, slowpixi `fallback in 12.2 s | store 0.0, engine 0.2` 다음 줄 `engine in 1.0 s`.

## 필드 진입 미리 받기·늦은 엔진 이어받기 (2026-10-14, 관리자 제보 「모바일에서 인게임 진입 시 3D 불러오기가 2번 실패해 로딩 이미지가 2번 뜬 뒤 3D가 뜸」 → 관리자 결정 「개선안 A–C 모두」)
- 진단 정보·서버 접근 기록(iPhone 홈 화면 앱, Wi‑Fi, 배포 뒤 첫 접속): `simplified view (render engine import timed out)` → 재시도 →
  `simplified view (createFieldView timed out)` → 재시도 → 3D, 첫 시도부터 약 65초. 서버는 모든 파일을 바로 보냈고 같은 시각 다른 접속자는
  정상 — 그 회선이 요청마다 몇 초씩 멈췄다. 회선 탓만이 아니라 구조가 그 느림을 실패로 바꿨다(원인, 코드):
  ① 렌더 엔진·브라우저 전투 시뮬·three.js·Pixi를 경기 화면이 마운트될 때에야 받기 시작했다. 모듈은 앞 모듈이 와야 다음 import가 보여 약
  15단계로 차례차례 요청되고, 회선이 단계마다 0.5–3.5초 멈추자 단계만으로 12초를 넘겼다. index.html의 `rel="prefetch"`(Pixi·three.js)는
  Safari가 무시한다.
  ② 12초를 넘기면 엔진 시도를 버리고 5초 뒤 처음부터 다시 — 그때마다 로딩 화면이 다시 떴다.
  ③ 브라우저 전투 시뮬(`battle/runner.js loadBrowserSim`)이 경기 화면이 이미 받은 데이터 11개(약 350 KB)를 따로 다시 받아 엔진과 회선을
  다퉜다(2차 시도는 이 받기 뒤에 밀린 Pixi 때문에 넘김).
- 처리:
  A. `GET /preload.json`(`server/http/preload.js`): 엔진·시뮬·three.js의 모듈 그래프를 서버가 디스크에서 한 번 따라가 평탄한 목록으로 준다
  (`public/js/` 기준 상대 경로 — `/shared/`는 버전 URL `/b/<tag>/`에서 한 단계 위, 페이지의 import와 같은 URL; 실행 중 경로를 만드는 import는
  `RUNTIME_DIRS`). Pixi 두 클래식 스크립트는 따로. `public/js/preload.js`가 로비 진입 때(방 입장 때도, 페이지당 한 번) 모듈을 모두
  `<link rel="modulepreload">`로 한꺼번에 요청하고(받고 파싱만, 실행은 안 함), 그것을 모르는 브라우저와 Pixi는 `fetch`로 HTTP 캐시만 데운다
  (버전 URL은 immutable). 방 입장 때 미리 받는 데이터에 시뮬 전용 파일(`waves`)도 넣었다.
  B. `ui/fieldHost.js mountFieldView({ late: true })`(경기 화면의 `useFieldView`만): 12초 시간 초과(엔진 오류가 아님)면 간이 보기를 띄우되
  엔진 시도는 계속한다 — 간이 보기는 위 층(`.fh-fallback`), 그동안 엔진의 캔버스·이펙트 층은 숨김(`.fh-late`, `css/screens/game.css`).
  엔진이 오면 새 view로 바꾸고(`screens/game.js`가 새 view로 다시 들어감; 간이 보기는 `SWAP_HOLD_MS` 150 ms 더 위에 있다가 제거) 로딩 화면은
  다시 뜨지 않는다. 엔진이 실패하거나 `LATE_MAX_MS` 60초 안에 오지 않으면 위의 재시도(5초 뒤, 연달아 2번)로. `[ASSUMED]` 60초. 이어받는
  동안은 「간이 보기로 전환」 토스트를 띄우지 않는다. 진단: `render events:`에 `simplified view (…; the engine keeps loading)` → `engine late`,
  `mount:` 줄 `arrived: engine n s`(경쟁에서 진 뒤의 엔진 단계는 단계 시간에 넣지 않음).
  C. `loadBrowserSim`이 데이터를 `data.js` 저장소에서 받아 자기 사본은 `structuredClone` 뒤 얼린다(저장소의 기록은 얼리지 않음). 저장소가
  앞서 포기한 파일만 다시 받는다(`invalidate`).
- 안 한 것: 모듈 묶기(번들러). 빌드 단계, 공유 모듈 한 벌 보장, 브라우저 테스트를 다시 맞춰야 하는 데 비해 효과는 회선이 나쁠 때뿐이고, 그
  단계 대기는 평탄한 목록 미리 받기로 대부분 사라진다(관리자 결정 2026-10-14).
- 확인: `test/preload.test.js`(목록 범위, 모든 항목이 버전·일반 URL 모두에서 200, 링크를 한꺼번에), `test/ui/fieldHost-lifecycle.test.js`
  (늦은 엔진 넘겨받기, 시간 초과된 import 뒤 새 예산, 취소·실패 4종), `test/match/clientCombat-review.test.js`(시뮬이 저장소 사본을 씀, 다시
  요청 0). [화면 미확인] 느린 회선: 로비에서 기다린 뒤 진입 → 바로 엔진; 진입 직후 → 간이 보기 → 엔진(로딩 화면 한 번).

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
- 고친 것: `spine.js _stance()`: 스킬이 켜져 있으면 쉬는 클립 = 스킬 루프, 공격 클립 없음
  (swing / windUp / attack이 클립을 안 건드림). 시작 Skill_3_Begin, 끝 Skill_3_End는 그대로. 테스트 `test/render/stance-skill.test.js`. [화면 미확인]
- 2026-10-22: 손 목록 `units.js STANCE_SKILLS`는 없어지고 클라 데이터 규칙(아래 「스킬 중 공격 클립」)이 烛煌 S3를 포함한 18개 스킬에 `stance`를 단다.

## 스킬 중 공격 클립 (2026-10-22, upstream `2b461767` `60d182c3` `ad9aa983` `72cb65a6`의 증상 — 우리 방식)
- 증상(가짜 PIXI 실행, upstream 대조 2026-10-21 기록): ① begin/loop/end에 자기 idle 없는 지속 스킬이 공격(치유)마다 Loop → End → Idle로 일어섬
  (프틸롭시스 S2·사리아 S3·인디고 S1/S2 …), ② 클립 하나뿐인 지속 스킬이 공격마다 그 스킬 클립을 틂(블레미샤인 S2 `Skill_2`, 스펙터 디 언체인드 S1
  `Skill_1`, 리드 더 플레임 섀도우 S2 `Skill_2`), ③ 니어 더 래디언트 나이트 S2의 스킬 클립이 이름 추측으로 `Skill_2_Die`(죽는 클립)였음.
- 공식(클라 charpack 직접, 2026-10-22): 스킬이 바꾸는 모드의 공격 능력 `Body/Attack`(또는 `Body/Heal`) `_animKey`(모드의 `_replaceAnimPairs` 적용 뒤,
  `tools/assets/local-attack-timing.json`)를 Default 모드와 비교.
  - 모드 `""` + Default에 키 있음 + 그 아래·옆에 키 가진 능력 없음 → 공격은 클립을 안 틀고 스킬 루프(모드가 Idle을 짝지으면 그 클립)가 자세로 계속:
    프틸롭시스 S2(`Body/Heal`), 사리아 S3, 인디고 S1·S2, 블레이즈 디 이그나이팅 스파크 S3,
    쿠오라 S2, 프라마닉스 S1·S2(모드 S1-2), 어스스피릿 S2, 시 S2, 노시스 S3, 안젤리나 S2·S3, 버블 S2, 로즈몬티스 S3, 파피루스 S2, 필라에 S2,
    르무엔 S3(Idle → Skill_3_Idle). 민트 S2도(모드 `""`, Default는 공격이 없어 비교 불가 — 관리자 확인 2026-10-22 「S2 중에는 공격 클립 재생이 원래 안 됨」,
    손 목록 `MODE_STANCE`). 산크타 믹사파라토 S3도(관리자 제보 2026-10-22 「공격 받을 때마다 대기모션으로 돌아갔다가 스킬 자세로 돌아옴」:
    반격마다 `Skill_3_Idle`을 공격 클립으로 틀고 `Skill_3_End` → Idle; 모드 Sk3 / Sk3_Zero의 반격 능력은 `Body/Attack`이 아닌
    `Body/S3Attack` / `Body/S3Attack_Zero` `_animKey ""`라 타이밍 표에 없음 — 손 목록 `MODE_STANCE`). 그레인버즈 S2도 같은 틈(수면 뒤 공격 = 모드 S2의
    `Body/S2`, 투사체 `projectile_chr_grabds_s2`, `_animKey ""` — 공격마다 Skill_2_Loop → Skill_2_End로 빠졌음, `MODE_STANCE`).
  - 타이밍 표에 `Body/Attack`이 없는 다른 스킬 점검(2026-10-22, 실제 시뮬 이벤트를 가짜 PIXI 액터에 이벤트 순서대로 재생): 스카디 더 커럽팅 하트 S1–3·
    첸 더 던스트릭 S2·왕 S3·비르투오사 S3·산탈라 S2·스즈란 S3·엔텔레키아 S2·시빌라이트 에테르나 S1–3·캐서린 S2·글래디아 S3는 스킬 중 공격 이벤트가 없음
    (공격 중지 스킬이거나 평타 없음), 노시스 S2는 충전형(시전마다 `Skill_2` 한 번), 스와이어 디 엘리건트 위트 S1·S2는 상시 스킬이라 렌더에서 스킬이 안 켜지고
    공격은 평타 `Attack`(클라 모드도 공격 `Attack`). 자세가 깨지는 것은 위 둘뿐.
  - 스와이어 디 엘리건트 위트 S1·S2의 치유·샴페인 폭탄 클립(관리자 요청 2026-10-22): 모드의 `Body/Trigger` 묶음이 Attack 대신 `HealAlly`
    `_animKey "Skill_1"`(동전 치유) / `SpawnToken` `_animKey "Skill_2"`(폭탄 던지기)를 고름 → 키트가 fx 'swire2Heal' `{ signal: 'healAlly', t }`
    / 'swire2Throw' `{ signal: 'spawnToken' }`을 보내고 평타 역할 `signals`(`SIGNAL_CLIPS`)가 그 클립을 틂.
    치유는 그 공격 차례 전체(관리자 결정 2026-10-22 「공식대로 변경」, 클라 근거·시뮬은 rules/sim.md 「스와이어 디 엘리건트 위트 S1 동전 치유 = 그 공격
    차례」) — fx 'swire2Heal' `{ signal: 'healAlly', t }`로 `Skill_1`을 처음부터 한 번. `signalSwing`은 타격이 지난 스윙의 꼬리를 끊고 들어감(새 스윙처럼; 그 전엔 거절해 평타 직후 던진
    폭탄이 클립 없이 지나감). 테스트 `test/render/swire2-signal-clips.test.js`. [화면 미확인]
  - 모드 키 = Default 키(평타 클립) + 스킬 클립이 Begin·idle 없는 한 개 → 그 클립은 시전 한 번(스킬 프리팹 시전 능력 `local-skill-cast.json`:
    블레미샤인 S2 `Skill_2`, 스펙터 S1 `Skill_1`, 치우바이 S2 `Skill_2`, 데겐블레허 S1 `Skill_1`(ReplacementSkill), 필라에 S1 `Skill_1`), 공격은 평타 클립.
  - 리드 더 플레임 섀도우 S2는 모드가 없음(공격 = Default `Attack`); 스킬 프리팹 능력이 `Skill_2`를 지속마다 한 번(`cd 20`, `cdKey duration`) — 손 목록.
  - 니어 더 래디언트 나이트 S2: 모드 공격 `Attack_Loop`(Default와 같음), `_replaceAnimPairs` Die → Skill_2_Die(Stun → Die는 안 그림), 스킬 프리팹에
    시전 클립 없음 → 스킬 클립 = 평타(`via: 'attack'`) + `die: 'Skill_2_Die'`.
- 뺀 것: 歌蕾蒂娅(글래디아) S2(모드 `""`이지만 자기 공격 채널 Skill_2_Begin/_Loop/_End로 침, `FIRST_ATTACK_BEGIN`), 모드 키가 평타인 Begin/Loop/End 스킬(울피아누스 S3, 이그제큐터 S1, 우타게 S1) [ASSUMED: 스킬 프리팹이 루프를 채널로 잡음 — 제보 때 확인],
  키 이름이 스킨 키 표로 바뀌는 모드(시 S3 `Skill_3_Attack` → 클립 `Skill3_Attack` 등)는 지금 역할 그대로.
- 구현: `tools/assets/anim-overrides.mjs applyModeAttacks`(fetch-assets가 `data/assets.json` 스킬 역할에 `stance` / `plainAttack`을 닮;
  `MODE_ATTACK_KEEP` 뺄 것, `PLAIN_ATTACK` 모드 없는 것) → `render/spine.js _stance` / `_attackClip`. 테스트 `test/render/stance-skill.test.js`.
  [화면 미확인]

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
  넣지 않음. 우리 쪽 보강 2개(upstream에 없음): ① 跃跃(回环射手, 오퍼레이터)의 손 부메랑(`render/heldWheel.js syncHeldWeapon`)이 스킨을 바꾸면
  `_applied = false` — 쓰러져 Die가 끝난 뒤 날던 부메랑이 돌아와도 손의 바퀴가 다시 그려진다(pixi-spine은 스킨 변경을 update에서 반영; 얼어붙은 모델은
  `update()`가 골격을 안 움직이므로 전과 같이 안 보임). ② 멈춘 자세의 impostor 슬롯도 `HELD_REDRAW_FRAMES`(240프레임, 60 fps에서 ~4초)마다 한 번은 다시 그림 —
  슬롯 픽셀은 RenderTexture에 있어 WebGL 컨텍스트를 잃었다 되찾으면(휴대폰 메모리 부족·탭 전환) 비어 돌아오는데, 우리 Pixi 쪽엔 복구 처리가 없어 쓰러진
  오퍼가 재배치까지 빈 칸으로 남을 수 있었다. 테스트 `test/render/held-pose.test.js`(upstream 9건 + 보강 2건), `test/render/downring.test.js`,
  `test/render/held-pose.browser.test.js`(RENDER_E2E). **[화면 미확인]** 쓰러짐·재배치·빙결·확대·마스크 전환·跃跃 부메랑·DPR 변경·컨텍스트 소실 복구.

## 이륙 높이 (2026-10-11, 관리자 결정 「이륙 중 모델을 띄움」)
- 이륙(起飞, 시뮬 플래그 `liftoff`: 안젤리나 더 멜로우 위시 S1~S3, 켈시 에스페란타 재능(배치 내내), 蒂比 등)한 오퍼레이터를 비행 적과 같은 높이(`FLY_HOVER` 1.3칸)로
  그린다 — 몸·HP 바·발밑 이펙트가 함께 뜨고, 그림자와 방향 표시는 칸에 남는다. 내려앉으면(이륙 해제) 다시 내려온다.
- (2026-10-12, 관리자 제보 「안젤리나 더 멜로우 위시가 돌아왔을 때 이륙 고도가 지금보다 낮다」) 캐릭터 데이터가 자기 이륙 높이를 가진 오퍼레이터는 그 값을 쓴다
  (`render/units.js LIFTOFF_HEIGHT`): 안젤리나 더 멜로우 위시 = 특성 블랙보드 `height_offset` 0.8칸(character_table; 버프 노드 ModifyGraphicHolderHeight가
  그림 높이를 그 값으로 옮김 — `aglna2_s_2[chant_end]`, `aglna2_s_3[mode]`는 고지대 칸이면 0.4 → S3 고지대 0.4). [추정] 그 값이 칸(월드) 단위. 아레나에서
  S3 범위 원이 그녀 칸에 그대로 있음. 켈시 에스페란타 = 0(관리자 요청 「인게임 데이터와 같은지」 2026-10-12): 그녀의 charpack·`kalts2_*` 버프 템플릿 28개 어디에도
  ModifyGraphicHolderHeight가 없고 `_motionMode` 0(지상) — 재능의 이륙(`kalts2_t_1`)은 저지 모드만 바꾼다 → 클라는 그녀를 칸 위에 그린다(떠 보이는 것은 Spine
  그림 자체). 아레나에서 발이 칸 중심. 티피 = 0.8(관리자 결정 2026-10-12): `tippi_height_ctrl[tween]`이 두 스킬 블랙보드의 `attack@height_offset` 0.8로 그림 높이를
  올림(고지대 분기 없음), 아레나 S1에서 확인. 이 셋 밖의 이륙 오퍼레이터는 1.3 그대로(지금 풀에는 없음 — 이륙 플래그를 쓰는 키트는 안젤리나·켈시·티피뿐).
- 근거: 클라는 이륙을 비행 단위처럼 다룬다 [추정: 비행 높이 로직은 네이티브라 못 읽음]. 안젤리나 더 멜로우 위시 S3 범위 원(`aglna2_skill_03_range_01`,
  발밑 FOOT 마운트)의 `static_offset`이 (0, −0.414, +0.666) — 발밑에서 0.666칸 아래(바닥 밑), 0.414칸 앞 — 으로, 발이 땅에 있으면 원이 한 칸 아래에 보이고
  (관리자 제보 「원형 이펙트가 약 한 칸 아래 타일에」), 비행 높이에서 시작하면 그녀 칸에 온다(디버그 아레나 확인). 다른 발밑 이펙트의 오프셋은 거의 0이다.
- 코드: 스냅숏 비트 `shared/local.js UF_LIFTOFF`(2048, `server/sim/snapshot.js flagsOf`), `render/units.js` `liftoff` → `hover`, `render/fxgame.js lifted()`의
  발밑 기준점이 이륙한 오퍼레이터면 그 높이를 탄다. (2026-10-21) 비행 적(`units.js flying`: UnitInfo `motion` FLY 또는 스냅숏 UF.FLYING)도 같다 —
  클라의 FOOT·NONE은 엔티티 자리라 비행 높이를 포함하는데 우리는 그 아래 길에 두었다(`test/render/fly-feet-fx.test.js`). [화면 미확인]
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

## Spine 클립 커버리지 (2026-10-12, 관리자 결정 「선발뿐 아니라 기존 오퍼레이터의 누락도 잡게」)
- 배경: 안젤리나 더 멜로우 위시 S2의 `Skill_2_Takeoff_*`가 한 번도 안 틀렸다(`diy.md` 「S2 활공 모션」). 렌더는 모델의 역할(`anims`)과 아래 표에 이름으로
  적힌 클립만 틀고, 그 밖의 클립은 누가 코드에 적기 전에는 영영 안 나온다. 키트 체크리스트(`diy.md` 「연출 대조」, kits README 12번)는 키트를 만지는
  사람만 보므로, 모든 오퍼레이터 모델을 테스트로 전수 대조한다.
- 테스트 `test/render/clip-coverage.test.js`: `data/assets.json chars`의 **모든 오퍼레이터**(상점 기물·예비 오퍼레이터·선발, 146명) 앞·뒤 모델의 클립마다
  렌더가 트는지 본다. 트는 것 = 역할 `idle`·`deploy`·`die`·`attack`·`move`·`stun`·`run`·`skill`/`skills[i]`의 begin·loop·end·idle(`tools/assets/anim-roles.mjs`
  + `anim-overrides.mjs`, 대체 `Idle`·`Die`) + `render/units.js`의 `FORMS[charId]`(형태 전환·替身)·`FORTRESS_CLIPS[charId]`(要塞 근접/원거리 짝).
  나머지는 `test/render/clip-coverage-list.js UNPLAYED`에 상태와 함께 있어야 통과하고, 목록에 있는데 이제 틀거나 없어진 클립도 실패한다(지울 것).
  - 상태: `render: <public/js 아래 파일> <방법>`(역할 밖에서 이름으로 틂 — 그 파일에 클립 이름이 있어야 함, 예: 안젤리나 S2 `UnitView.glide`),
    `none: <근거>`(공식이 이 모드에서 안 틂 / 그릴 필요 없음 — 프리팹 필드·디컴파일 메서드·녹화를 적음), `todo: <묶음> — <자리>`(공식은 트는데 렌더가 아직 안 틂, 아래 묶음 글자).
  - 새 모델·새 키트·매니페스트 재생성(`fetch-assets`)으로 새 클립이 생기면 실패한다 → 공식에서 언제 트는지 찾아 연결하거나(역할·`anim-overrides.mjs`·
    `FORMS`·키트 연출), 근거와 함께 `none`으로 적는다. 찾는 곳과 필드는 `diy.md` 「새 선발 오퍼레이터 키트 체크리스트」 **연출 대조**(선발이 아니어도 같음).
  - **아래 방향** 클립(이름에 `Down`: `Attack_Down`, `Skill_Down_2_Loop`, `Skill_1_Loop_Down` …, 앞모델 41명 129개, 2026-10-23): 전엔 렌더가 하나도 안 그려
    목록에서 통째로 뺐다(`DOWN_FAMILY`, 이제 없음). 공식 클라가 고르는 곳 넷(공식 클라에서 확인):
    - 능력의 `_downAnimKey`·`_downEndAnimKey`: `AbstractAnimatedAbility.GetAnimKey`가 아래·위·기본 키 순으로, 끝은 `OnCastEnd`가 같은 순으로(`_endAnimKey`가 있을 때).
      아래 판정 `CheckDownAttack` = `_faceToTarget`이면 지금 바라보는 4방향(`Entity.faceDirection`)이 아래, 아니면 배치 방향(`Entity.direction`)이 아래; 그 밖에
      `_faceToFirstCastTarget`+`_checkFaceToFirstCastTargetDownAttack`이면 바라보는 방향도(켈시 에스페란타 S3).
    - ThreePart 공격(`ThreePartOneshotAnimation._GetAnimBundle`): `_overrideDownAnimation`이면 `_down` 묶음(begin·oneshot·end), 판정은 그 컴포넌트의 `_faceToTarget`으로 위와 같음.
      ThreePart 채널(`ThreePartChannelingAnimation._GetAnimBundle`): `_overrideDownAnimation`이고 배치 방향이 아래면 `_down`(울피아누스 S1·호시구마 S3).
    - 스킬 시작 클립: `BasicSkill.get_beginAnim` — `_beginAnimDown`이 있고 배치 방향이 아래면 그것.
    - 스킬 버프가 아래 모드로 바꿈: 버프 템플릿의 IfElse(`CheckCharacterDefaultDirection` = 배치 방향, `CheckFaceDirection` = 버프 시작 때 바라보는 방향, `_direction` DOWN)
      → `SwitchMode` — 엑시아 더 뉴 커버넌트 S2(배치)·S3(바라봄), 혼 S3 `S3(D)`, 케이퍼 S2·언더플로우 S2·클레멘티아 S2/S3(배치), 불피스폴리아 S3(바라봄), 애쉬락 S2 `S2(D)`.
      그 모드의 공격·Idle 짝·믹스가 스킬 클립이 된다.
    - 세 번째 면(`ThreeFaceAnimator._down`)은 아님: 이 서버의 오퍼레이터 chararts 애니메이터는 모두 `_front`/`_back` 둘뿐이다(EN 전부, CN 전용 둘 포함).
    구현: 추출(`anim_keys.py`)이 능력 `dby`('face'/'deploy'/'deploy+face')·`three.down`·`chan.down`·스킬 `downMode`/`downBy`(공개 버프 템플릿에서)를 읽고, `anim-keys.mjs`가
    역할에 `down: { by, map: { 클립: 아래 클립 } }`(그 모드·스킬 능력 전부, 아래 루프의 Idle 믹스까지)·스킬 `beginDown`·`downMode`(아래 모드로 다시 계산한 역할 필드 +
    능력 경로별 `swap` — 혼 S3(D) 원거리처럼 역할이 이름 안 부르는 要塞 짝)를 단다. `spine.js _dn`이 클립을 틀 때(휘두름·첫 begin·끝·스킬 idle·시전·끝) 그 유닛의
    `downs()`(`units.js`: 배치 방향 `dir`, 지금 `face.dir4` — 휘두름 전에 돈 방향)로 바꾸고, `setSkill`이 시전 순간 `downMode` 조건을 보고 역할에 겹친다(다음 시전까지).
    클라 데이터가 그대로라 그대로 따른 것: 엑시아 더 뉴 커버넌트 S2 아래 모드의 끝은 스킨 믹스가 `Skill_Down_3_End`(`Skill_Down_2_End`는 안 틂), 클레멘티아 S3 아래
    모드의 끝은 `Skill_3_End`. 아무 키도 안 부르는 12개는 목록 `none`(스킨 키 표에 이름만 있거나 그마저 없음). 뒷모델(위를 볼 때)엔 아래 클립이 없어 그대로. [화면 미확인]
- 첫 목록(2026-10-12): 46명·105개 `todo`. 힌트는 10-07 EN 클라 추출(스킬 프리팹 anim 컴포넌트·`_animKey`, charpack 모드별 클립 — 관리자 노트)로 붙였다:
  `official <스킬 id | 모드>` 58개(공식이 그 클립을 가리킴 — 누락 가능성 높음, 먼저 볼 것), `no official reference` 38개(버프 템플릿·디컴파일로 찾을 것),
  `CN only` 9개(EN에 없는 오퍼레이터 — CN 필드만, [추정]). 처음부터 `none`으로 확정한 것은 없다.
- 판정(2026-10-14, 관리자 노트 — EN·CN 클라 프리팹·버프 템플릿·디컴파일): 105개 = 연결 94·`none` 11. `none`은 근거와 함께 목록에 적었고, 역할이 다른
  스킬의 클립을 틀던 다섯 명은 `anim-overrides.mjs`로 고쳤다 — 灵知 S3 `Skill_4_*`(그동안 S2 충전 모드의 `Skill_3`), 歌蕾蒂娅 S2 시작 `Skill_2_Startup`
  (`Skill_2_Begin`은 S2 모드 공격 채널의 시작), 伊内丝 S3 시작 `Start_Skill`(→ 공식은 배치 뒤 안 나와 목록 `todo` 보류, 아래 E), 缄默德克萨斯 S2·S3 시작 `Start_2`·`Start_3`(배치 일격, 모드 Born 짝), 银灰 S2 공격
  `Combat`(그동안 S3의 `Skill`). [화면 미확인] 남은 `todo`는 클립을 트는 클라 구조로 묶었다(묶음 하나 = 렌더 고칠 자리 하나):
  - **A** 저지 대상 공격: 모드 `UnitMode._combat` — `Character._FetchCombatTarget`이 저지 중인 적 중 첫 적을 고를 때(要塞 `FORTRESS_CLIPS`의 일반형). 구현(같은 날):
    시뮬 `ai.js`가 주 대상이 자기가 저지한 적이면 'swing' 7번째 칸 1 → `units.js onSwing` → `spine.js combatHit`, 역할 클립의 `combat`(`anim-overrides.mjs COMBAT_CLIPS`,
    `{loop, alts?, pick?}`)을 `_swingClip`이 고른다. 拉普兰德(기본·S2)·银灰·断崖·伊内丝(S2는 `Skill_2_Combat`)·丰川祥子(기본)·仇白(`Combat_A/B` 무작위)·予愿安洁莉娜 S3·
    领主·Sharp. 领主·Sharp는 클립만 — 저지 중 근접 공격이라는 판정(시뮬 `professions.js` lord)은 그대로. 테스트 `test/render/attack-alts.test.js`·`test/sim/attack-timing.test.js`. [화면 미확인]
  - **B** 대체 공격 클립: `AbilityRandomGroup`(무작위/차례)·`UberAnimationEffectEmitter._replaceGroup`·순차 묶음 — 휘두를 때마다 고름. 구현(같은 날):
    `anim-overrides.mjs ATTACK_ALTS` → 역할 클립 `alts`·`pick`(차례 `loop`·무작위 `random`·「직전과 다르게」 `other` = `_diffFromLastOneIfNotFirst`), `spine.js _nextAlt`가
    휘두름마다 고르고 모델이 바뀌어도(앞/뒤) 그 휘두름의 클립을 잇는다. 11명(维什戴尔·迷迭香·阿斯卡纶·隐德来希 S3·望 기본·S3·维娜·维多利亚·凛御银灰·
    圣聆初雪 S3·伺夜 S3·山). 'swing' 이벤트는 뷰가 이펙트보다 먼저 받는다(`app.js processEvents`, 이펙트 묶음이 고른 클립을 따름). [화면 미확인]
    2026-10-21 고르는 법 디컴파일(fx.md 「능력 묶음의 자식·COMBAT 상태 공격」): 维什戴尔·迷迭香은 `_diffFromLastOneIfNotFirst`라 `other`(전엔 `random`),
    AbilityRandomGroup Loop(阿斯卡纶·隐德来希 S3)는 `m_loopIndex`를 먼저 +1 해 읽고 붙을 때마다 0으로 돌아가므로 두 번째 클립부터(`from: 1`), 스킬이
    켜지거나 꺼질 때(모드 전환) 차례를 처음부터 [추정: 모드를 안 바꾸는 스킬도 처음부터]. 伺夜 S3(AbilitySelectableGroup 순차)는 첫 클립부터 그대로;
    望·圣聆初雪 S3(UberAnimationEffectEmitter LOOP)는 2026-10-21 디컴파일: `_CalculatePlayIndex`(10-14 덤프 RVA 0xCD3970)가 `m_currentIndex`(0x78)를
    먼저 +1 하고 묶음 수에 닿으면 0, 생성자·`SetData`(0xCD37F0)가 −1로 두므로 첫 시전은 첫 묶음 — 지금 `loop`(`from` 없음) 그대로 맞음. `SetData`가
    언제 다시 불리는지(스킬마다?)는 안 봄 [추정: 렌더처럼 역할 클립이 바뀔 때 처음부터].
  - **C** 첫 공격 begin·공격 end: `ThreePartOneshotAnimation`(`_onlyPlayBeginAnimWhenFirstAttack`, `_endAnimKey`). 클라 코드(2026-10-14, 관리자 노트):
    `InitAnimation`이 배율 = 공격 시간 ÷ (begin(첫 공격일 때만) + oneshot + end)로 셋을 함께 늘이고(`UpdatePlaybackSpeed`가 그 재생 속도를 능력에 줌), 코루틴
    `DoPlayAnimation`이 begin → oneshot 순으로 틀며, 타격은 oneshot 클립의 OnAttack 이벤트를 기다린다 → **첫 공격의 타격은 begin만큼 늦다**. 로스터의 ThreePart
    공격 12명은 모두 첫 공격만 begin(EN charpack 전수, 관리자 노트 `three_part.py`). 구현(같은 날, 렌더만): `anim-overrides.mjs FIRST_ATTACK_BEGIN` → 공격 역할 `firstBegin`
    (斯卡蒂·伺夜는 begin·end도 채움), 스킬 역할 `attackBegin`/`attackEnd`(歌蕾蒂娅 S2 모드의 공격 채널 `Skill_2_Begin`/`_End`, 伺夜 S3 `Skill3_ABC_Idle_Into`).
    `spine.js swing`이 begin을 앞에 붙여 둘을 시뮬의 전딜 안에 함께 압축한다. 첫 공격인지는 시뮬이 정한다(2026-10-14, 관리자 결정 「공식대로 늦춰」):
    시뮬이 그 휘두름의 전딜에 begin을 더하고 'swing' 이벤트 8번째 칸 1로 알린다(`sim.md` 「일반 공격 타이밍」 첫 공격 begin) → `units.js onSwing` → `swing(…, first)`.
    알림이 있으면 스킬 클립의 `firstAttackBegin`(送葬人 S2 모드 `Skill_Right_Begin`), 공격 역할의 `firstBegin` begin, `attackBegin` 순. 시뮬이 시간을 모르는 공격
    채널(歌蕾蒂娅 S2 `attackBegin`)만 예전처럼 공격 모드가 끝난 지 `FIRST_ATTACK_GAP` 0.35 s 넘은 휘두름에 [추정]. 켈시 에스페란타(CN) Default도 목록에. [화면 미확인]
    雪猎 장전(charpack `Attack/Reload` `Reload_Begin`→`Reload_Loop`, 장전 중 공격은 `ReloadAttack` `Reload_Break`→`Attack_Loop`, 다 차면 스킨 믹스 `Reload_End`):
    시뮬의 猎手 장전 상태(`professions.js installHunter`: 마지막 공격 1 s 뒤부터 탄 1/s)를 형태 `reload`로(fx 'hunterReload', 공격으로 끊기면 `cut` — 猎手 전원,
    골든 fx 개수만 움직임) → `FORMS.char_4211_snhunt`(대기 `Reload_Loop`, 나갈 때 `Reload_End`, 공격 역할의 첫 공격 begin `Reload_Break`). [화면 미확인]
  - **D** 스킬이 켜는 하위 모드의 `_replaceAnimPairs`(크루스 S2_Sub, 위셔델 과부하, 사키코 음색 등). **E** 장착 스킬의 기본 모드: `Character._GetDefaultModeIndex`
    (전투에 든 스킬의 `_defaultModeIndex`가 재능 값을 덮음) → `Unit.OnInit` `SwitchMode` — 배치부터 그 모드(Born→`Start_n`·Idle 짝). 구현(같은 날):
    `anim-overrides.mjs EQUIP_ROLES` → `anims.equip[스킬]` `{deploy, idle, attack}`, `spine.js setSkillIndex`가 그 스킬을 들면 쉬는 클립으로 — 引星棘刺 S3
    (`Start_2`·`Skill_3_Idle`), 望 S2(`Start_2`·`Idle_2`·공격 `Attack_2_A/B` 차례), 安洁莉娜 S2·S3(`Idle_Charge`). 予愿安洁莉娜 S1 시작 `Start_2`(스킨 키 `Skill_1_Begin`)는
    스킬 클립 덮어쓰기. [화면 미확인] 배치하자마자 시전되는 스킬(spType `ON_DEPLOY`)은 시전과 함께 그 모드에 들어가 모드의 Born 짝이 배치 클립이 된다(2026-10-14,
    관리자 제보 「이격 텍사스 S2는 사선으로 배치」): 缄默德克萨斯 S2 `Start_2`(뒤 위에서 사선으로 — 클립 첫 프레임 몸 위치 뒤 −638·위 −425)·S3 `Start_3`(제자리 도약) —
    `skchr_texas2_2/Damage`·`_3/AppearSwordRain`이 시전 시작에 `Start_n`을 처음부터 틀고(`forceFromStart`), 모드 S2·S3이 Born→`Start_n`. `_defaultModeIndex` −1이라
    시전 전(정비 판)은 `Start`. 구현: `anim-overrides.mjs SKILL_STATE_CLIPS`의 `deploy` → 스킬 역할 `deploy`, `spine.js deploy`가 스킬이 켜져 있으면 그것(시뮬은 시전이
    'deploy' 이벤트보다 먼저지만 순서가 바뀌어도 같은 클립). 디버그 아레나(Windows Chrome, 0.25배속)로 S2 사선·S3 도약 확인. 歌蕾蒂娅의 뒤에서 미끄러져 들어오는 배치는
    `Start` 클립 자체(첫 프레임 뒤 −975, 높이 0)라 원래 그렇게 그려진다(같은 아레나로 확인). 전수(같은 날, 관리자 노트): 오퍼레이터 146명의 `Start`는 수직 95·사선 11·수평 13·제자리 27이고
    렌더가 그대로 틀며, 스킨 키 표 Born은 전원 `Start`, 모드 Born 짝은 위 E의 여섯 명뿐. 배치 발동 스킬 중 시전 클립이 있는 다른 하나 伊内丝 S3
    `Start_Skill`(`skchr_ines_3/First _animKey`)은 공식에서 배치 뒤에 안 나온다(관리자 확인 2026-10-14). S3는 배치 때만 시전되므로
    S3 역할을 클립 없음(`'attack'`)으로 바꾸고 `Start_Skill`은 목록 `todo` 보류(관리자 2026-10-14 「로직을 확실히 아는 건 아니니」 — 클라가 언제 트는지 미확인) — 그동안 시뮬이 배치 다음에 시전하면 낙하를 끊고 `Start_Skill`이 나왔다(한때 착지 뒤에 잇게 했다가 되돌림). 予愿安洁莉娜 S1은 기본 모드
    S1_TakeOff(`_defaultModeIndex` 5)로 배치부터 이륙(관리자 결정 2026-10-14) — E `equip` 배치 클립 `Start_2`(위에서 내려와 떠 있음; 땅 배치 `Start`는 뒤에서 휘어 들어옴).
    아레나로 둘 다 확인. 스킬이 일으킨 【移动】의 배치 클립(같은 날): `Battle.moveRedeploy({ clip })` → 'deploy' 이벤트 4번째 칸 → 역할 `deploys`
    (`anim-overrides.mjs SKILL_STATE_CLIPS`, `spine.js deploy(key)`) — 乌尔比安 S3 닻으로 `Skill_3_ReStart_A`, 【返回】 `Skill_3_Back`, 닻이 자기 칸이면 이동 없이
    'anchor' fx의 `redeploy` → `Skill_3_ReStart_B`(어느 노드가 트는지 [추정]). 赤刃明霄陈 S2(`_animKey "Skill_2_Begin"`·`_endAnimKey "Skill_2_Disappear"`, 재등장 모드
    S2Respawn Born→`Start_2`): 키트 새 fx 'chen3Vanish'·'chen3Respawn'의 `form` → `FORMS` `vanish`(변환 클립 두 개 뒤 마지막 프레임 유지 `hold`, 나갈 때 `Start_2`),
    S2 역할은 평소 `Attack`(그동안 재등장 뒤 6초 공격이 `Skill_2_Disappear`였음). 새 fx 두 종은 골든 fx 개수만 움직임. [화면 미확인]
  - **F** 모드의 `Die` 짝: 스킬이 바꾼 모드가 `Die`를 제 클립과 짝지음 → 그 스킬 중 쓰러지면 그 클립. 구현(2026-10-14): `anim-overrides.mjs SKILL_STATE_CLIPS` →
    스킬 역할의 `die`, `spine.js dieClip`이 스킬 모드 중(켜짐·吟唱·End 클립, 그리고 시뮬이 'die' 바로 앞에 스킬을 끄므로 같은 프레임에 꺼진 것)이면 그것.
    위를 보던 오퍼레이터가 앞 모델로 바뀌어 쓰러질 때는 `units.js _dieSkill`이 넘김. 予愿安洁莉娜 S1·S2·S3 `Skill_n_Die`, 乌尔比安 S2 `Skill_2_Die`, 缇比 S1·S2 `Die_2`.
    같은 표의 `stun`: 迷迭香 S3 중 기절 = `Stun_Skill_3`(모드 S3의 animator hooker만 Stun을 바꿈). [화면 미확인]
  - **D** 구현(2026-10-14): 스킬 도중 바뀌는 모드는 키트가 그 순간 fx에 `form`을 싣고(`unit.form`도) `FORMS`가 스킬 역할을 그 모드의 클립으로 바꾸며, `endsWithSkill`이면
    스킬이 꺼질 때 뷰가 형태를 지운다(End 클립은 그 모드 것으로 고른 뒤; 시뮬은 fx 없이 `unit.form`만 지움). 寒芒克洛丝 S2 40타 뒤 4연사(기존 'quadShot' → 모드 S2_Sub
    `Skill_Loop_2`), 维什戴尔 S2 과부하(새 fx 'wisdelOverload': 모드 S2_Overload — `Skill_2_Overload_Begin`을 전환 클립으로, `_Idle`·`_Loop`, 스킬 끝은 `_End` — I의 믹스 두 줄을 이렇게
    대신함), 佩佩 S3 사거리 최대(새 fx 'rangeMax': `Skill_3_Loop_A`→`_B`, 버프 `pepe_s3_range_max`의 `_hookSettings`). 새 fx 두 종은 골든의 fx 개수만 움직임.
    시전 순간에 정해지는 변형은 'skill' 이벤트 4번째 칸(키트 `castVariant`, `skills.js _evOn`) → 역할 `variants`(`anim-overrides.mjs SKILL_VARIANTS`): 灵知 S2를 충전을
    다 모아 쓰면 `Skill_3`(모드 S2+), 缄默德克萨斯 S3 재시전(德克萨斯传统)은 `Start_3_2`. 丰川祥子 S2: 장착하면 피아노 모드 S2_Atk(`_defaultModeIndex` 2, E의 `equip`:
    `Skill_2_Start`·`_Idle_A`·`_Loop_A`, 저지 공격도 그것), 오르간은 키트 'spGain' fx의 `form` `'organ'`(`_Idle_B`·`_Loop_B`), 시전 클립은 `_beginAnim "Skill_2_Trans_B"` —
    피아노 모드가 `Trans_A`로 바꾸므로 피아노에서 `Trans_A`, 오르간에서(변형 `fromOrgan`) `Trans_B`. [화면 미확인]
    모드의 재능 능력: 시뮬이 'atk' 5번째 칸으로 알리는 다른 능력의 공격(`Battle.forceAttack({ signal })`, 재능 'T.1') → 역할 `signals`(`anim-overrides.mjs SIGNAL_CLIPS`,
    `spine.js _signalStrike`: 그 클립을 타격 프레임부터 한 번, 휘두름 위에) — 圣约送葬人 受选之人 추가 사격 `Attack_B`(S2·S3 `Skill_n_Attack_B`, charpack
    `Modes/*/Body/Talents/1`). [화면 미확인]
  - **H** 深靛 秘术师 저장(대상이 없어 공격 대신 에너지 하나): 기본 모드 공격 행동의 `Attack_Charge` — 시뮬이 저장마다 fx 'mysticStore' `{ signal: 'store' }`(秘术师 전원,
    골든 fx 개수만 움직임) → `units.js onSignal` → `spine.js signalSwing`(역할 `signals.store` 클립을 공격 간격에 맞춰 한 번). [화면 미확인]
  - **H+J** 焰尾 S3 중 前锋剑术(회피 뒤 강화 일격): 모드 S3 공격 트리거 묶음의 재능 공격 키 `Skill_3_Attack_2` = 스킨 키 표의 클립 `Skill_2_Attack_2` — 키트 'riposte' fx에
    `signal: 'riposte', strike: 1`(타격 순간, 이벤트 수 그대로) → 그 클립을 타격 프레임부터(`_signalStrike`). 기본 모드의 같은 공격은 `Attack`이라 그대로. [화면 미확인]
  - **H** 玛恩纳 解放者: 기본 모드의 공격 능력이 피해 없는 `Body/AnimAttack`(`_animKey "Idle_2"`, 쿨다운 = 클립 길이) — 스킬 밖에서 사거리에 대상이 있으면 그 클립을
    되풀이한다. 시뮬은 스킬 밖 해방자의 대상 유무를 형태 `watch`로(`ai.js watchForm`, 바뀔 때마다 fx 'watch', 골든 fx 개수만 움직임), `FORMS`가 대기 클립을
    `Idle_2`로. 경계 자세라는 뜻은 [추정]. [화면 미확인]
  - **G** 新约能天使 S3 시작 포격 `Skill_3_Skill`(모드 S3 공격 트리거 묶음의 S3FireToToken): 키트 'airstrike' fx에 `signal: 'fireToToken'`(이벤트 수 그대로) →
    같은 `signalSwing`, 스킬 begin이 끝난 뒤. `Skill_1_Close`(S1 수동 정지 뒤의 몰아 쏘기)는 `none` — 이 모드엔 수동 정지가 없음(스킬을 멈추는 클라 메시지 없음,
    `skills.js stop()` 호출처 없음). [화면 미확인]
  - **G** 凯尔希·思衡托 S3 운반(CN 클라): 이륙 `Skill_3_Restart_Begin`(1 s)의 OnAttack(0.667 s)에서 비행 투사체가 나간다 → 시뮬도 운반 시작 뒤 `TAKEOFF_PRE` 0.667 s
    동안 제자리(공격 없음 [추정])에서 이륙 클립(fx 'kalts2Takeoff' `{ signal: 'takeoff', t: 1 }` — fx의 `t`는 그 행동 시간, 여기선 클립 제 속도), 그 뒤 숨고 비행
    (그동안은 즉시 숨었음, 키트 [ASSUMED]였던 부분). 착지는 【移动】 클립 키 `land` → `Skill_3_Restart_End`. 골든 변화 없음(코퍼스에 닻과 함께 S3 쓰는 시나리오 없음). [화면 미확인]
  - **G** 予愿安洁莉娜 S3가 처음 칸 밖에서 끝나면 복귀 비행(Comback)이 `Skill_3_Restart_Begin`으로 시작 [추정: 어느 노드가 트는지] — 키트 'aglnaFlight' 켜짐 fx의
    `signal: 'comeback'`, 스킬이 끝나는 그 프레임의 신호 클립이 `Skill_3_End`를 대신한다(`spine.js setSkill`). [화면 미확인]
  - **G** 스킬 프리팹 연출. 泥岩 S3 휴면(`skchr_mudrok_3/SleepAura` `_default {Skill_2_Begin, Skill_2_Sleep, Skill_2_Awake}`): 키트 'stone'·'rockfall' fx에
    `form`(`'dormant'`/null) → `FORMS.char_311_mudrok`(뒤 모델엔 세 클립이 없어 `Skill_2_Idle`로 잠듦 — 형태 `idle`은 클립 목록 중 그 골격에 있는 첫 것).
    歌蕾蒂娅 S3(`skchr_glady_3` 순차 능력: Chant `Skill_3_Startup` → 모드 S3 Idle→`Skill_3_Chant` → FinalAttack `_default {Skill_3_Begin, _Loop, _End}`):
    역할 begin `Skill_3_Startup`·idle `Skill_3_Chant`·공격은 평소 `Attack`(`via: 'attack'`)·end는 FinalAttack 세 클립을 차례로(`spine.js _skillEnd`, 역할 `end`가
    배열). 끝의 당김은 시뮬이 스킬 끝 순간에 하고 렌더는 그때 세 클립을 시작한다 [추정]. S3 중엔 일반 공격이 없다(2026-10-14 관리자 결정, `sim.md` 「歌蕾蒂娅 S3」) —
    `Skill_3_Startup` 뒤 `Skill_3_Chant`가 스킬 끝까지. [화면 미확인]
  - **H** 재능·특성 상태. 风丸 傀儡师: 替身으로 바뀔 때 `Die_2`→`Start_B`, 돌아올 때 `Die_B`→`Start`(charpack `CommonAbilities` `kazema[switch2stand]`·
    `[switch2normal]` 순차 묶음) — `FORMS`의 `change`·`leave`가 클립 배열이면 차례로 튼다(`spine.js _change`). 시뮬 전환(`professions.js DOLL_SWITCH`)도 두 클립 길이인
    2 s(`sim.md` 「傀儡师 전환 2 s」). 归溟幽灵鲨도 같은 모양(2026-10-22): 바뀔 때 `Die`→`Start_B`, 돌아올 때 `Die_B`→`Start_2`(charpack `CommonAbilities` `ghost2[switch2stand]` Die2Stand·StandBorn, `[switch2normal]` Die2Normal·StandBorn의 `_animKey`) — 전엔 `Start_B` 하나에 `Die_B`를 替身 끝 1초에 뒀다(GitHub #44 때 모양). 늦게 받은 전환 fx는 이미 끝났을 클립을 앞에서부터 뺀다(`units.js setForm`). 부활로 替身이 끝날 때도 `Die_B`→`Start_2` [추정]. 烛煌 绝处重燃: 쓰러짐 `Revive_Begin`→`Revive_Idle`, 일어남 `Revive_End` — 키트의 'downed'·'revive' fx에
    `form`(`'downed'`/null)을 실어 `FORMS.char_1040_blaze2`로(이벤트 수는 그대로), 쓰러진 채 쓰러지면(`endsOnDeath`) 형태가 끝나고 `Die`. [화면 미확인]
  - **I** 믹스 전환: chararts `SpineAnimator._mixSettings` — 클립 A→B 사이에 끼우는 클립.
  - **J** 스킨 키 표: chararts `SpineAnimator._animations`(키 → 클립 이름). 클라는 능력·모드의 **키**로만 튼다(`PlayAnimationInternal` → `GetAnimationData`).
    역할 추출(`anim-roles.mjs`, 이름 추측)은 이 표를 안 읽는다. 안젤리나·焰尾(`skills[]`가 한 칸 밀려 주 스킬 S3가 일반 공격 클립)·塞雷娅(S1·S2가 S3 钙质化
    클립)는 `anim-overrides.mjs`로 고쳤다 [화면 미확인]. 전 오퍼레이터 EN 표에서 `Born`→`Start` 말고 이름이 바뀌는 모델은 18명인데, 이름 추측을 키 이름에 돌리고 표로 바꾸는
    방식은 焰尾만 맞고 德克萨斯·雷蛇·艾丝黛尔·幽灵鲨·望 등을 틀리게 해(키 자체가 스킬 번호와 어긋난 모델도 있음 — 안젤리나 S2 키 `Skill_1_*`) 버렸다.
    근본 해결은 역할을 클라의 키(스킬 `_default`·`_animKey`·모드 짝)에서 읽고 이 표로 클립 이름을 얻는 추출이다(관리자 노트 2026-10-14).
    추출(2026-10-23, 진행 중): `tools/local-extract/anim_keys.py`가 오퍼레이터마다 스킨 키 표·믹스, 모드의 짝·`_combat`·능력 키(`_animKey`·`_endAnimKey`·위/아래,
    ThreePart begin/oneshot/end, 채널 `_default`, `AnimationEmitBehaviour`), 스킬 프리팹의 `_beginAnim`·`_defaultModeIndex`·switch_mode를 읽어
    `.cache/anim-keys.json`에 쓴다 — 클라 전용 표라 추적하지 않는다(관리자 결정 2026-10-22). `tools/assets/anim-keys.mjs keyRoles`가 그 키로 역할을 만든다(규칙은
    파일 머리, 테스트 `test/render/anim-keys.test.js`). 지금 역할과 대조(146명 289모델): 대기·배치·쓰러짐·공격은 거의 같고, 차이는 스킬에 몰린다 — 가장 큰
    무리는 클라 프리팹에 클립을 트는 능력이 없는 공용·버프 스킬(白面鸮 S1 `skcom_heal_up`·德克萨斯 S1 `skcom_charge_cost`·星熊 S1/S2·蛇屠箱 S1 `skcom_def_up` 등)에
    이름 추측이 다른 스킬의 클립을 준 것이다.
    매니페스트 첫 단계(2026-10-23): `spine.mjs`가 오퍼레이터 모델에 `overlayKeyRoles`를 얹는다 — 대기·배치·쓰러짐, 그리고 **클립이 확실히 없는 스킬**(시작 클립·클립 있는
    자기 능력이 없고, 모드가 없거나 평타 키로 공격하며 Idle 짝이 없음)을 평타 역할(`via: 'attack'`)로. 22명이 바뀜: 德克萨斯·雷蛇·白面鸮·星熊(S1·S2)·拉普兰德·蛇屠箱·
    银灰·地灵·莫斯提马·风笛·送葬人·泥岩·寒檀·莱恩哈特·泡泡·耶拉·洛洛·跃跃·录武官·灰毫·水月·刺玫의 S1 — 모두 지금까지 다른 스킬(대개 S2·S3)의 클립을 틀었다
    (관리자 결정: 차이가 나면 클라 데이터 기준). 그 밖의 스킬은 이름 추측 + 손 표 그대로이고, 손 표가 그 뒤에 적용된다. 판정하며 고친 하나: 水月은 모드가
    [Default, T1, S1, S2]라 S2 = 모드 `S1`의 공격 `Skill_1`(공격마다, `strike`), S3 = 모드 `S2`(`Skill_2_Start`·`_Loop`·`_Idle`·`_End`) — 그동안 S2가 `Skill_2_*`, S3가
    클립 없음이었다(`anim-overrides.mjs`). 키 표가 없는 곳(클라 없는 클라우드·기여자)에서는 `fetch-assets`가 오퍼레이터 역할을 커밋된 `data/assets.json`에서 그대로
    가져와 같은 바이트를 만든다(관리자 결정 2026-10-23) — 그래서 손 표·키 규칙의 변경은 키 표가 있는 곳에서 다시 만들어야 매니페스트에 들어간다. [화면 미확인]
    둘째 단계(2026-10-23): 모든 스킬을 키로 얹는다(`KEY_ROLE_HOLD`만 이름 추측 + 손 표: 乌尔比安 S3 부활 모드, 予愿安洁莉娜 S3 `RestoreAbility`, 卡涅利安 충전 단계별
    `_Enhance` 모드). 키 규칙에 더한 것: 모드 ThreePart의 begin은 첫 공격에만(`firstAttackBegin`), 그 `_endAnimKey`는 스킬 idle이 있으면 공격 묶음 끝(`attackEnd`)·
    없으면 `end`; 스킬 자신의 ThreePart begin이 시전 begin(信仰搅拌机 S1·雪猎 S2); 이름이 `…End…`인 능력이 스킬 끝(锏 S3 `EndAttack`); 모드 Idle 짝으로 끝나는 한 번
    시전 뒤 자기 클립으로 공격하는 모드면 시전이 begin(余 S3 `CastAnimation`); 모드 Idle 짝을 붙드는 채널 + 클립 있는 다른 능력이면 채널이 자세·그 능력이 공격(望 S3
    `SpawnAnim`); `_defaultModeIndex`가 자기 모드인 스킬은 그 모드가 배치부터의 상태(E `equip`)라 스킬 클립이 아님(望 S2·琳琅诗怀雅 S1/S2·引星棘刺 S3);
    `AnimationEmitBehaviour`가 시작에 트는 클립이 begin(缄默德克萨斯 `Start_n`); 방향별 모드(灰毫 `S2(U)/(D)/(LR)`)는 이 뼈대에 공격 클립이 있는 것 — 앞 `(LR)`·뒤 `(U)`;
    모드의 `FirstAttack`(折桠 S2, 통째로 다른 첫 공격 — 시뮬에 없음)은 시전 begin으로 [추정]; `_animKey ""`인 공격 능력이 모드에 그것뿐이면 자세(信仰搅拌机 Sk3).
    이걸로 바뀐 것(앞·뒤 각 9~10모델, 클라 기준 — 관리자 결정): 风笛 S2 = `Skill` 한 번·S3 = 모드 공격 `Skill_2_Loop`(그동안 뒤바뀜, `Skill_2_Begin/End`는 어떤 키도
    부르지 않음); 琳琅诗怀雅 S1·S2 시전 클립 없음(치유·소환 때 `Skill_1`·`Skill_2`는 공격 신호 그대로); 送葬人 S2 시전 begin 없음(첫 공격만 `Skill_Right_Begin`);
    어떤 키도 부르지 않는 begin/end를 지움 — 维什戴尔 S2 end·海霓 S2·哈洛德 S2 end·异客 S2·菲莱 S2 begin(뒤)(버프 템플릿 `PlayUnitAnimation` 13개도 Idle·Default뿐);
    引星棘刺 S3 스킬 idle(배치부터의 equip idle과 같은 클립). 키와 같아진 손 표 `SKILL_CLIP_OVERRIDES` 줄 — 宴 S2·莫斯提马·灵知 S3·焰影苇草 S3·缄默德克萨斯·银灰 S2·
    安洁莉娜·焰尾·予愿安洁莉娜 S1·塞雷娅·耀骑士临光 S2·水月 S3 — 과 `FIRST_ATTACK_BEGIN` 送葬人 줄은 지웠다(지워도 매니페스트 같음). [화면 미확인]
    셋째 단계(2026-10-23): 나머지 손 표도 키에서(`anim-keys.mjs keyTables` → `anim-overrides.mjs`의 같은 적용 함수 `put*`, 손 줄은 그 뒤). 추출이 능력 묶음을 더
    읽는다 — `AbilityRandomGroup`(`_abilities`·`_selectMethod`·`_diffFromLastOneIfNotFirst`), 순차 `AbilitySelectableGroup`(`_abilityConfigs`·`_selectAbilitySequentially`),
    `UberAnimationEffectEmitter._replaceGroup`·`_loopType`(0 LOOP·1 RANDOM). 규칙: B 차례 = 공격 능력이 든 묶음(무작위 0 → `random`, 「직전과 다르게」면 `other`;
    Loop 1 → `loop` `from: 1`; 순차 → `loop`) 또는 그 능력의 `_replaceGroup`(같은 클립이 두 번이면 한 번으로 — 山); A `combat` = 모드 `_combat` 능력의 클립이 그 모드
    공격과 다를 때(묶음이면 자식들 — 仇白); U `up` = 공격·스킬 능력의 `_upAnimKey`; E `equip` = `_defaultModeIndex` 모드의 Born·Idle 짝과 공격(이륙 모드 `…_TakeOff`면
    그 한 번 공격이 배치 클립 — 予愿安洁莉娜 S1); F = 스킬 모드의 Die·Stun·Born 짝(Stun→Die 짝은 안 그림 — 耀骑士临光 S2); C 공격 역할 `firstBegin` = 기본 모드
    ThreePart의 첫 공격 begin; 자세 = 스킬 자신의 채널 옆에서도 모드 공격이 `_animKey ""`이면(薄绿 S2·小满 S2 — `MODE_STANCE`가 하던 것). 공격 역할 쪽 줄은 키의
    공격이 이름 추측과 같은 클립일 때만 얹는다 — 다른 것은 기본 모드에 공격이 없는 阵法术师 6명(키는 공격 없음, 역할은 스킬 클립 대체)·玛恩纳 `Idle_2`(units.js
    watch)·丰川祥子 `Combat`(그래서 `COMBAT_CLIPS` 그 줄은 남김)·灰毫 근접/원거리 짝(FORTRESS)뿐이고, 같은 곳은 begin·loop·end가 모두 같다.
    손 표에서 지운 것: `ATTACK_ALTS` 11명·`UP_CLIPS` 3명·`EQUIP_ROLES` 6줄·`MODE_STANCE` 3명 전부, `COMBAT_CLIPS` 丰川祥子 말고 전부, `SKILL_STATE_CLIPS`의
    die·stun·deploy(남은 것은 시뮬 키의 【移动】 `deploys` — 乌尔比安 S3·凯尔希·思衡托 S3), `FIRST_ATTACK_BEGIN` 歌蕾蒂娅 S2 말고 전부(그 S2는 `SKILL_CLIP_OVERRIDES`
    손 줄이 키 역할을 통째로 바꾸므로). 지운 뒤 매니페스트에서 바뀐 것(클라 기준, 결정 4): 引星棘刺 S3를 들면 배치부터 공격이 `Skill_3_Loop`(모드 S3 `Body/Attack`
    — 스킬 밖에서도), 予愿安洁莉娜 S1 스킬 역할 `deploy` `Start_2`(S1 모드 Born 짝, 배치 클립은 전부터 equip `Start_2`), 평타 대체 스킬 伊内丝 S3·蕾缪安 S2가
    공격 역할의 `combat`·`firstBegin`을 복사로 함께 가짐(렌더는 `via: 'attack'`을 공격 역할로 그리므로 화면 같음). [화면 미확인]
    `KEY_ROLE_HOLD`도 비웠다(같은 날): 이름이 `Restore…`인 능력은 시전이 아니다(予愿安洁莉娜 S3 `RestoreAbility` = 복귀 비행, G의 신호 클립) — 모드 S3 공격과 이륙·착지
    모드로 지금 클립 그대로; 스킬 모드 옆 `<모드>_Respawn…` 모드(乌尔比安 S3 `S3_Respawn_A`, 스킬의 【移动】이 넣는 모드 — 어느 스킬도 이름으로 부르지 않음)가 그 스킬의
    공격·Idle 모드이고 그 앞의 한 번 시전(`AOEAttack`)이 begin — 역시 지금 클립 그대로. 卡涅利安: 스킬 버프 `billro_s_N`이 `billro_talent_enhance_mark`가 있으면
    모드 `SN_Enhance`, 없으면 `SN`으로 바꾸고, 그 표식은 `billro_talent_enhance_judge`가 쓸 수 있는 충전 ≥ 2(`maxChargeTime` 2 — 다 모음)일 때 준다 = 시뮬의 「충전
    다 모아 시전」(키트 `isCharged`). 키트가 그 시전에 `castVariant` `'charged'`를 내고(이벤트 칸만 — 골든 그대로), 역할은 키의 `SN`(`Skill_Idle`·`Skill_Loop`·
    `Skill_End`) + `anim-overrides.mjs SKILL_VARIANTS` `charged`(`Skill_2_Idle`·`_Loop`·`_End`). 그동안은 S1·S3 = `Skill_*`, S2 = `Skill_2_*`로 충전과 상관없었고,
    `Skill_Begin`·`Skill_2_Begin`(어떤 키도 안 부름, 믹스는 Idle로 가는 것뿐)을 시전에 틀었다 — 이제 목록 `none`. [화면 미확인]
  - **G** 蕾缪安 S2 조준(2026-10-23, 클라 `skchr_lemuen_2` `_playSkillBeginAnim` 0·charpack `Modes/S2/Body/M2Attack` = `Normal` ThreePart `Attack_Begin`/`Attack_Loop` +
    `Aim` 채널 `_default {Skill_2_Begin, Skill_2_Idle, Skill_2_End}`): 시전 클립 없음, 공격은 평소 클립(`'attack'`), 조준 동안만 채널 — 키트가 조준 시작·끝(사격이든 대상을
    잃었든)에 그리지 않는 fx 'lemuenAim' `{ signal: 'aim', on: 1 | 0 }`(골든 fx 개수만 움직임) → `units.js onSignal` → `spine.js holdSignal`(켜면 begin 뒤 loop 유지, 끄면
    end를 스킬 End처럼 끝까지). 역할은 `anim-overrides.mjs SIGNAL_CLIPS`의 값이 `{ begin, loop, end }`인 신호. 그동안은 시전에 `Skill_2_Begin`, 공격마다 `Skill_2_Idle`이었다. [화면 미확인]
  - 평타로 싸우는 스킬(`via: 'attack'`)은 시전·끝 클립이 없다(2026-10-23): 역할이 평타 역할에서 물려받은 begin/end(`Attack_Begin`·`Attack_End`)를 `spine.js _castOf`가
    시전·끝 클립으로 치지 않는다 — 耀骑士临光 S2·远牙 S1/S2·凯尔希·思衡托 S1·蕾缪安 S2가 시전 순간 `Attack_Begin`, 끝에 `Attack_End`를 틀었다(넷 다 스킬 프리팹에
    클립을 트는 능력·`_beginAnim`이 없음). 자기 begin이 따로 있는 `via: 'attack'`(歌蕾蒂娅 S3 `Skill_3_Startup`)은 그대로. [화면 미확인]
  - **U** 위 방향 `*_Up`: `AbstractAnimatedAbility.GetAnimKey` — 아래·위·기본 순(`_faceToTarget`이면 바라보는 방향, 아니면 배치 방향). 아래 방향 공백과 같은 계열.
    구현(2026-10-14): `*_Up`은 뒷모델에만 있고 렌더는 위를 볼 때만 뒷모델을 쓰므로, `anim-overrides.mjs UP_CLIPS`가 뒷모델 역할에 `up`을 달고 `spine.js _loopOf`
    (즉발 스킬 클립도)가 그것을 튼다 — 送葬人·诗怀雅 `Attack_Up`, 松果 S1 `Skill_1_Up`·S2 `Skill_2_Up`. 아래 방향(`*_Down`, 앞모델)은 위 「아래 방향」(2026-10-23). [화면 미확인]
  - 첫 목록의 `todo`는 2026-10-14에 모두 정리됐다(연결 또는 근거 있는 `none`). 아래 방향 공백도 2026-10-23에 닫음. C의 시뮬 첫 타격 지연은 같은 날 들어감.

## 공격 방향 (2026-10-12, 관리자 요청 「공격·스킬 범위 안의 적을 향해 돌아서 공격, 최대 저지 수를 넘겨 뒤에 걸린 적은 뒤를 보며 공격 — 공식 로직대로」)
- 이전: 오퍼레이터는 배치 방향만 봤다(`units.js onAttack` 「operators keep their deploy direction」, research 09 §1.2의 배치 모습을 전투 내내 적용).
  뒤에 걸려 저지된 적도 등을 진 채 쳤고, 이펙트도 배치 방향으로 나갔다.
- 공식(EN 클라 디컴파일, 관리자 노트의 디컴파일 기록):
  - 공격 능력이 시전을 시작할 때 `AbstractAnimatedAbility.OnCastStart` → `DealWithFaceDirection`: 능력 프리팹의 플래그를 이 순서로 본다 —
    `_faceToTarget` 주 대상(`Entity.FaceToTarget` → `FaceTo(대상 − 자기 위치)`, 0.2칸 안이면 안 돎), `_faceToDefault` 배치 방향(`FaceToDirection`),
    `_faceToFront` 앞(배치 방향×0.5 + 아래), `_faceToFirstCastTarget` 첫 시전 대상. 넷 다 0이면 돌지 않는다. `Entity.FaceTo`는 기절·빙결·부유 중엔 안 돎.
  - 모델: `CharacterAnimator.OnFaceChanged` → `FaceSwitcher.StartSwitch(lOrR, fourDir)` — 좌우 반전은 `MapUtil.ParseDirection(방향, 0)`이 좌/우면 그쪽,
    아니면 x가 ±0.2(`TOLERANCE_L_OR_R_DIRECTION`)를 넘는 쪽, 아니면 그대로. 앞/뒤 모델은 fourDir = `ParseDirection(방향, 0.25)`(좌우에 +0.25,
    `ADDON_TO_L_OR_R_DIRECTION`)로 `_TryUpdateDirection`: 위면 Back, 공격이 아래면 Front, 좌우면 그대로(돌아갈 때 idle은 위가 아니면 Front).
  - 대상이 없어지면 `CombatState`(대상이 있는 동안 유지) → `IdleState.OnEnter` → `Character.TryFaceToIdleDirection`: **저지 중인 적이 없을 때만**
    `FaceToDirection(idle)`로 배치 방향. 저지 중이면 돈 채로 둔다.
  - 이펙트가 쓰는 4방향 = `Entity.faceDirection` = `ParseDirection(faceTo, 0)`.
  - 도는 모습(2차, 같은 날 관리자 요청 「즉시 도는 것·스킬 능력 플래그·공격 대신 스킬의 도는 시점도 공식대로」): `FaceSwitcher._DoSwitchFaceInternal` — 모델을
    세로축으로 `_switchTime`의 절반 동안 0°→±90°(선형, `SetEase` 1), 옆으로 선 그 순간 `onSwitchFace`로 반전·앞/뒤 모델을 바꾸고, ∓90°→0°로 나머지 절반.
    `_switchTime` = 0.15초(클래스 기본값이자 EN 오퍼레이터 모델 143개 `chararts` 전부). 전투 시간 기준(`BattleUtil.Deprecated_PlayTweenInBattle`).
    강제(`StartSwitch(immediately)` = `OnFaceChanged(force)`, 배치 때)와 첫 번째는 즉시, 도는 중에 새로 돌면 앞의 것을 끝까지 보낸 뒤(`_KillLastTween` → `Kill(true)`) 새로 돈다.
  - 스킬 능력도 같은 `DealWithFaceDirection`: 공격을 대신하는 스킬(`ReplacementSkill`)은 그 공격이 스킬 능력으로 나가므로 **휘두르기 시작할 때** 그 능력의 플래그로,
    `CastSkill`은 능력을 바로 시전하므로 **발동할 때** 돈다.
- 데이터: `tools/local-extract/attack_timing.py`가 공격 능력의 네 플래그를 `face`(1 대상·2 배치 방향·3 앞·4 첫 시전 대상·0 없음)로 읽고
  (EN 143명 + CN 3명 — 켈시 에스페란타·클레멘티아·안젤리나 더 멜로우 위시는 CN 실행에서 합침), `build-data.mjs abilityFace`가 1이 아닐 때만
  `attackAnim.base/skills[i].face`로 싣는다(chess 128·backups 7). 대상(1): 대부분. 없음(0): 범위 전체를 치는 공격 — 莫斯提马·诗怀雅·白面鸮 등 43모드.
  배치 방향(2): 赤刃明霄陈 S3, 丰川祥子 전 모드, 史尔特尔 S2 등 43모드. 첫 시전 대상(4): 焰尾·凯尔希·思衡托 5모드.
  스킬 능력: `tools/local-extract/skill_cast.py`가 같은 네 플래그를 `ability.face`로 읽고(EN, 293개 중 능력 있는 113개), `build-data.mjs skillCast`가 1이 아닐 때
  스킬 기록의 `cast.face`로 싣는다(chess 70). 없음(0) 15개(德克萨斯 S2, 泥岩 S2, 阿罗玛 S1 등), 배치 방향(2) 10개(余 S3, 莫斯提马 S2, 凛御银灰 S2·S3,
  锏 S1·S2 등), 첫 시전 대상(4) 1개(归溟幽灵鲨 S1).
- 구현:
  - sim `ai.js updateAlly`: 'swing'에 여섯째 값 — 주 대상 id(`face` 1·4, 값이 없는 능력도 [추정] 대상), `'D'`(2), `'F'`(3), 없음(0). 다섯째 값은 기본 클립
    플래그(0/1). 대상이 사라지면(죽음·이탈·범위 밖이고 저지 안 함) 다른 대상이 있으면 그것으로, 없고 저지 중이 아니면 `['face', id]`(`faceIdle`).
    다음 공격이 준비됐는데 대상이 없을 때도 같다. 전투 결과에는 영향 없음(골든은 이벤트 수만 바뀜).
    스킬 능력(`ai.js castFace`): 'replace' 시전의 공격이 시작될 때(`startReplacement`, 공격 덮어쓰기 키트는 `swingFace`가 스킬 능력 플래그를 씀)와
    `CastSkill`이 능력을 시전할 때(`skills.js activate`, 능력 없는 버프 시전은 안 돎) `['face', id, 돌 곳]`(값은 'swing'의 여섯째와 같음). 대상은 그 순간
    공격이 잡을 대상 [추정: 키트가 스킬 효과에서 대상을 따로 고르고, 공식은 스킬 능력이 시전 때 찾음].
  - 렌더 `render/face-turn.js`(위 규칙 그대로), `units.js turnToward/turnTo/faceDeploy`, 상태 `view.face {lr, ud, dir4}`: 반전 = `lr`,
    Back 모델 = `ud === 'UP'`(`_wantsBack`), 재배치 때 배치 방향으로 초기화. `app.js faceEvent`가 이벤트의 **이펙트보다 먼저** 돌린다(시전 이펙트가 돈
    방향을 씀 — `fxgame.js facingDir`이 `face.dir4`). 'swing'·시전 'face' 없이 온 'atk'(키트가 따로 내는 공격)는 타격 때 그 대상으로 돈다
    [추정: 공식은 그 능력 시전 때, 그 플래그는 안 읽음]. 앞/뒤 모델 교체는 비동기라 휘두르던 클립을 새 모델이 이어 받는다(`spine.js swingElapsed`).
    도는 모습: `units.js turnTo` → `turnS`, `update`가 전투 시간(`animRate`)으로 진행하며 반전 배율에 `face-turn.js turnWidth`(각도의 cos)를 곱하고 절반에서
    `_showFace`(반전·`faceUd` → `_wantsBack`). 논리 방향 `face`(이펙트의 `dir4`)는 공식 `Entity.faceDirection`처럼 돌기 시작할 때 바뀐다. 모델이 아직 안 그려졌으면 즉시.
- [추정] 남은 차이: 부유·이상 플래그 13/22 검사 없음, 반전 방향 이펙트 `U_OR_D`는 `faceToBack`이 아니라 4방향으로 고름(뒤 모델로 옆을 칠 때만 다름),
  도는 모습은 세로축 회전을 2D에서 너비(cos)로만 그림(원근 차이 없음), 공식 옵션(`BattleOptions` +0xAB)과 2배속 이상에서 트윈을 건너뛰는 분기는 안 따름,
  키트가 따로 내는 공격(재능·스킬 효과의 추가 타격)은 그 능력 플래그를 안 읽고 타격 때 대상으로 돎.
- 연결된 일: 아래 방향 클립 — `_faceToTarget`인 능력은 돈 방향(`view.face.dir4`), 아니면 배치 방향으로 고른다(「Spine 클립 커버리지」 아래 방향, 2026-10-23).
- 테스트: `test/render/face-turn.test.js`(도는 너비·절반에서 바뀜·도는 중 새로 돌기), `test/sim/attack-timing.test.js`(대상 id·뒤에 저지된 적·`face` 이벤트·'D'/없음·
  스킬 능력 시전의 `face`). **[화면 미확인]**

## 모델 점 위치·임포스터 상자 (2026-10-12, 관리자 제보 「안젤리나 더 멜로우 위시 S2 무기 이펙트가 오퍼 본인에 겹쳐 나오고, 오른쪽 위 언덕 타일에 무기가 잘린다 — 디버그 아레나에선 재현 안 됨」)
- 실제 판(솔로 판 정비에 디버그로 넣고 전투, Windows Chrome)에서 재현. 둘 다 공식 동작이 아니라 우리 렌더 코드의 계산 오류다.
- **무기 이펙트 위치**: `aglna2_skill_02_buff_weapon_01/02`(FollowMountPoint SPECIAL_2·3 = `F_Wepaon_I`·`F_Wepaon_Bb`, 지팡이)는 본을 제대로 찾고 있었다.
  틀린 것은 화면 위치 → 월드 위치 변환(`fxgame.js specialPoint`): 높이는 `liftFor`로 정확히 풀면서 가로는 **발 위치의 배율**로 나눴다. 카메라가 원근이라
  들린 점은 화면 가운데에서 바깥으로 밀린다 — 아레나는 오퍼레이터가 화면 가운데라 거의 0, 실제 판은 화면 왼쪽 끝(본은 몸에서 84 px 오른쪽인데 이펙트는 23 px)이라
  얼굴 위에 떴다. 고침: `fxpoints.js liftedPoint` — 푼 높이에서 그 점 자체의 투영·배율로 가로를 푼다(이 카메라에서 정확: 같은 행·높이에서 화면 x는 열에 대해 선형).
  모델 점(`_spawnLocation` 3·6·8~25, FollowMountPoint)을 쓰는 모든 이펙트·투사체 출발점·선 이펙트 끝에 같이 적용된다.
- 같이 고친 것: 임포스터로 그릴 때(클리핑 마스크가 있는 모델은 늘, 붐비는 판은 모두) `ImpostorAtlas.draw`가 스켈레톤 배율을 좌우 반전 없이(개인 렌더 타깃이면 1로)
  덮어써서, 본 위치에 곱하던 `spine.scale`이 틀릴 수 있었다 → 뷰가 그리는 배율을 `units.js modelSX`·`modelSY`(반전 포함)로 남기고 그것을 쓴다.
- **무기가 잘림**: 3D 보드는 유닛 캔버스 **아래**라 타일이 모델 위에 그려질 수는 없다. 잘린 것은 임포스터 슬롯 — 상자(`_impBox`)를 첫 자세의 경계로 한 번만 정해서,
  그보다 멀리 뻗는 자세(그녀의 S2 지팡이, `Skill_2_Takeoff_End` 경계 x 275~703 vs 상자 끝 292)가 상자 끝에서 곧은 선으로 잘렸다. 그 선이 타일 모서리와 겹쳐
  「타일이 위에 그려진다」로 보였다(다른 오퍼레이터에게 보였던 같은 증상도 이것으로 본다 [추정: 그 제보들의 화면은 다시 안 봄]).
  고침: 클립마다 첫 재생 동안(최대 6초) 임포스터를 다시 그릴 때 경계를 재서 상자를 넓힌다(줄이지 않음, 모델이 바뀌면 처음부터). 낙하 `Start`는 안 잼(낙하 높이는
  `_renderImpostor`의 배치 여유). 비용: 클립당 첫 재생 동안만 `getLocalBounds`.
- 확인: `test/render/model-point-impostor.test.js`(화면 끝에서도 점이 그 자리로 돌아옴·옛 변환은 0.1칸 넘게 어긋남, 상자가 스킬 자세로 넓어짐·같은 클립은 다시 안 잼·낙하는 안 넓힘),
  실제 판 화면(사막 스테이지, 화면 왼쪽): 청록 불꽃이 얼굴 → 지팡이 머리, 이륙 자세도 상자 안. 디버그 아레나 왼쪽 보기도 지팡이 쪽.

## 아군 기절 모션 (2026-10-14, 관리자 제보 「아군 오퍼레이터가 기절하면 기절 이펙트만 뜨고 모션이 멈춘다」)
근거: 클라 코드 `Character.States.StunState.OnEnter` — 모델에 `"Stun"` 클립이 있으면(`Unit.ContainsAnimation`) 그것을, 없으면 `"Die"`를
`Unit.PlayAnimation`(속도 1, 처음부터 강제 아님)으로 튼다. `OnExit`은 클립을 안 틀고 다음 상태(대기 등)가 제 클립을 튼다 — 일어나는 클립은 따로 없다.
적(`Enemy.States.StunState.OnEnter`)은 `"Stun"`만 보고 `"Die"`로 대신 틀지 않는다. 빙결·수면은 다른 상태(`FreezeState`·`DozeState`)다.
- 이전: 기절 클립이 없으면 지금 클립을 멈췄다(`frozen`). 오퍼레이터 모델 앞모습 145개 중 `Stun` 클립이 있는 것은 7개(浊心斯卡蒂·维什戴尔·引星棘刺·
  凯尔希·思衡托·泡泡·迷迭香·魔王)뿐이라 거의 모두가 멈춰 보였다.
- 지금: 오퍼레이터의 기절(스냅숏 `UF.STUNNED` — 빙결·수면이 아님, `units.js _stunFalls`)은 `spine.js _enterStun`에서 `Stun` 클립(돌고 있는 스킬 모드의 것이 먼저),
  없으면 `Die` 클립(스킬 모드의 Die 짝이 먼저, `dieClip`)을 한 번 틀고 마지막 프레임에 누워 있다가, 기절이 풀리면 바로 기본 클립으로 돌아간다.
  적의 기절과 빙결·수면은 그대로 지금 클립을 멈춘다.
- 위를 보는 오퍼레이터는 쓰러진 오퍼레이터(「Front/Back」, `_wantsBack`)와 같이 기절 동안 앞모습 모델로 눕고 일어나면 뒷모습으로 돌아온다
  [추정: 뒷모습 모델에서 공식이 무엇을 트는지는 안 읽음 — 뒷모습 스켈레톤 대부분에 Die가 없다].
- 기절해 누운 채 쓰러지면 Die를 처음부터 다시 틀지 않고 이어 간다, 누운 채 빙결·수면이 겹치면 누운 자세로 멈추고 풀리면 다시 넘어지지 않는다 [추정].
- 테스트: `test/render/stun-fall.test.js`(가짜 PIXI). 화면: 렌더 데모(Windows Chrome)에서 오른쪽을 보는 오퍼레이터 3명이 기절 동안 Die 끝 자세로
  눕고 풀리면 Idle로 섬. 위를 보는 오퍼레이터(앞모습 모델로 바꿈)와 실제 판의 기절은 [화면 미확인].

## 심해 구역 잠김 (2026-10-14, 관리자 제보 「심해 구역에 들어가면 z축이 상당히 아래로 내려가야 하는데 일반 타일과 똑같다」)
근거: 공식 버프 템플릿 `trap_sea_drown[enemy]`(buff_template_data — 涨潮控制 장치의 `sea_drown[enemy]` 버프, 이 포크의 深水区 수몰 `devices.js`)가
ON_BUFF_START에 `AddHeightOffsetToSpine`(그래픽 홀더 높이 이동, `_instant` 거짓)으로 −0.7칸, 대상에 `buff_swim`이 있으면 −0.2칸을 옮기고,
ON_BUFF_FINISH에 대상이 살아 있을 때만(`IfTarget _checkTargetAlive`) +0.7 / +0.2로 되돌린다. 칸 자체는 내려가지 않는다: 스테이지 씬
(act2 m04·act1 m05)의 `tile_deepsea` 타일 `_height`·`_locateHeightOffset`은 0, 타일 그래픽은 지면 바로 아래(0.02)의 물 평면이고 타일이 주는
버프 `under_sea[tile]`(템플릿 empty)은 모터보트류 적 4종의 헤엄 이펙트 조건으로만 쓰인다.
- 이전: 적은 어느 칸에서든 도로 높이(z 0)에 그렸다.
- 지금: 지상 적이 반올림한 칸이 심해 구역이면(시뮬의 수몰 판정 `devices.js terrainFor`와 같은 규칙 — 비행·이륙·아군은 제외) 몸을 0.7칸, 잠수원
  (`buff_swim` — enemy_database에서 Swim 재능을 가진 적은 잠수원 두 종뿐 [추정: 그 재능이 `buff_swim`을 붙임])은 0.2칸 내려 그린다. 육지로 나오면
  다시 올라오고, 심해에서 쓰러진 적은 잠긴 채 사라진다. 그림자는 잠긴 동안 숨긴다(아래). 코드: `render/units.js deepSink`·`DEEP_SINK`,
  타일 재질은 `render/app.js` ctx `terrainAt`.
- [추정] 내려가고 올라오는 속도(발 높이 보간과 같게 — 클라 값은 네이티브라 안 읽음), HP 바와 몸에 붙는 이펙트도 함께 내려감(비행 `hover`와 같은 처리).
- 물빛 칠(2026-10-14, 관리자 요청 「물빛 칠까지 넣어」): 심해 씬의 모든 Spine은 `Torappu/Spine/Skeleton-AlphaSplit-Water (Z-Distorted)`로 그려진다
  (씬 `HGSceneWaterEffect`, 프로필 `WE_Static_WEProfiles` — act2 m04·act1 m05 같음). 픽셀 셰이더(DXBC): 픽셀의 월드 깊이 z를 모델 기준선 쪽으로
  `spineHeightTeak` 0.8배 눌러(z' = 기준 + (z − 기준) × 0.8) 수면(`_waterSurfaceTransform` z 0.1409 − `spineHeightOffset` 0)보다 깊으면 색을
  mix(색, 물빛 × α, 물빛.a) — 물빛 (0, 0.543, 0.772, a 0.547) — 로, 그중 수면 바로 아래 0.03 × 0.8 띠는 수면선의 (0.7, 0.8, 0.9) × α에서 물빛으로 흐려진다.
  알파는 그대로. 우리: `units.js _updateWater`가 잠긴 몸(`body`)에 화면 공간 필터(`WATER_FRAG`)를 걸고, 수면선은 발에서
  `waterLineAbove(깊이)` = (깊이 − 0.1409) / 0.8 위 지점을 투영한 화면 높이 — 0.7칸 잠긴 적이면 0.699칸 위, 즉 화면에서 도로·수면 높이에 온다
  (잠수원은 0.074칸, 발목). 띠는 그 아래 0.03칸. [추정] 기준선이 잠긴 발(AddHeightOffsetToSpine이 「스파인 셰이더를 다시 맞춤」), 깊이를 화면에 곧게 선
  모델 위로 잰다(우리 모델은 2D로 서 있음), 수면 높이는 `_HGWaterSurfaceZ` 전역이 그 변환의 z라는 것(설정하는 코드는 안 읽음).
- 그림자(2026-10-14, 관리자 결정 「그림자는 숨기게」): 물 위(z 0)에 두면 잠긴 몸보다 화면 위쪽에 떠 보여서, 가라앉는 첫 0.1칸 동안 흐려져 사라지고
  올라올 때 다시 나타난다(`DEEP_SHADOW_FADE`, 잠수원 0.2칸도 숨김). 클라가 그림자를 어떻게 두는지는 안 읽음.
- 테스트: `test/render/deep-sink.test.js`(가짜 PIXI — 필터 자체는 안 돎). 실제 판 확인 2026-10-14: 로컬 서버에서 솔로 일반 act2 m04, 보드를 비우고
  전투 — 적(원석충·평범한 죄수)이 (10,6)·(11,6) 심해 칸에서 z −0.7·그림자 0·필터 켜짐, (11,5)로 나오면 z 0·필터 꺼짐. Windows Chrome 캡처에서 수면선 아래 몸이
  물빛, 수면 위로 나온 가시 끝은 원래 색(필터 끔/켬 비교), 그림자 알파 0(같은 판 다시). 잠수원은 화면 미확인.

## 성능 표시 `?perf=1` (2026-10-15, 관리자 제보 「iPhone 12 Pro로 숨겨진 핵심까지 해 보니 중후반에 프레임이 밀린다」 → 관리자 요청 「측정 표시 추가」)
- 측정 기능이지 동작 변경 없음. 주소에 `?perf=1`이면 켜지고 기억한다(`sp.pref.perf`: 홈 화면 앱은 주소를 못 바꾸므로), `?perf=0`이면 끄고 잊는다.
  꺼져 있으면 아무것도 설치하지 않는다(`public/js/ui/perfHud.js`, `main.js` boot에서 한 줄).
- 왼쪽 위 글자 표시(입력은 통과, 1초마다): 자체 animation frame 간격으로 fps·p95·최악·긴 프레임 수(34 ms 이상 = 60 Hz에서 한 프레임 이상 놓침),
  전투 실행기 `stats()` 차이로 실행기 프레임당 시뮬레이션 ms·초당 틱, 필드 보기 `stats()`의 프레임 JS(`cpuMs`)·PIXI 그리기(`renderMs`)·
  이펙트 층(`fxGame` update+render ms, 드로우콜, 입자, 살아 있는 수)·3D 보드(드로우콜, ms, 텍스처 수)·유닛 수·부하 단계·임포스터 간격·품질·DPR,
  라운드·단계·페이지 연 뒤 시간(Chrome이면 JS 힙).
- 필드가 화면에 있는 동안 10초마다 표본(최대 2시간)을 남기고, 진단 정보(`diag.js setPerfSource`)에 같은 라운드·단계끼리 묶은 `perf:` 줄(최근 40개:
  시각 구간, 평균·최저 fps, 평균 p95, 긴 프레임 합, 평균 비용, 최대 드로우콜·유닛, 부하 단계 범위)을 붙인다. 한 판 전체의 추이로 「화면에 그릴 것이
  늘어서」(유닛·드로우콜이 같이 오름)와 「기기가 달아서」(일은 같은데 프레임 시간만 오름)를 가르는 용도.
- 측정 배경(관리자 노트의 WebAssembly 포팅 검토): 봇 대전을 숨겨진 핵심까지 돌린 데스크톱 Node 측정에서 시뮬레이션은 틱당 평균 0.01–0.06 ms
  (4인 협동 ABYSS 숨겨진 핵심 0.058, 최대 1.57)라 휴대폰에서도 프레임 예산의 몇 %다. WASM 전환 판단은 이 표시로 실기기 수치를 받은 뒤.
- 확인: `test/ui/perf-hud.test.js` 4, `test/diag.test.js` 1; Windows Chrome(844×390 @3x) 실제 솔로 대전: 제목 화면부터 표시, 전투 중
  `sim … (60 t/s) · js 0.9 · draw 0.3`, `3d 20 calls`, 진단에 `perf: R1 COMBAT …` 줄, 주소 없이 다시 열어도 켜짐, `?perf=0`으로 꺼짐.
  실제 iPhone Safari 확인 2026-10-16(관리자의 홈 화면 앱 관전 로그 두 개에 `perf:` 줄 18개).
- **보고서 보강** (2026-10-16, 관리자 제공 iPhone 12 Pro 관전 로그 두 개: 품질 높음 → 중간에 중, 어느 쪽이 병목인지 로그만으로 가를 수
  없었음): `perf:` 줄의 시각은 다른 줄과 같은 UTC 벽시계(`15:31:07–15:32:19`) — 휴대폰은 앱이 멈춘 동안 `performance.now()`가 서서
  페이지 기준 시계가 `mount:`·`render events:`와 2분 넘게 어긋났다. 품질·렌더 해상도(`q high res 2/2` = PIXI/3D 보드, 3D 없으면 `-`)가
  바뀌면 줄을 나눈다. `worst`(가장 긴 프레임 간격), `stalls N (max X s)`(페이지가 보이는 채로 1초 넘게 프레임이 없던 것 — 숨은 페이지와
  구분, fps에서 뺌), `no frames N`(프레임 없는 표본, fps·p95에서 뺌), `js X (3d …, fx …)`(js 안의 3D 보드 CPU·이펙트 몫),
  `other X ms`(55 fps 밑 표본에서 프레임 − js − draw − sim: GPU·합성 또는 프레임 밖 메인 스레드 일), `peak js …, draw …, 3d … ms`(한 프레임
  최대값: 보기 `takePeaks()`, 1초마다 비움). 테스트 `test/ui/perf-hud.test.js`.

## 3D 보드 첫 그리기 미리 준비 (2026-10-16, 관리자 제공 iPhone 12 Pro 로그 「필드가 뜬 직후 한 표본이 프레임 0, PIXI 그리기 평균 277 ms」)
- 측정 기능의 `perf:` 줄로 본 멈춤은 필드 진입 직후(엔진 마운트가 끝나고 3D 보드·공식 씬이 막 도착한 구간)였다. Windows Chrome에서 같은
  순간을 재면(렌더 데모, 844×390 @3x) 두 프레임이 길었다: ① 새 3D 보드의 첫 그리기 160–250 ms — 게임은 마운트 **뒤에** 스테이지를 넣으므로
  (`screens/game.js`) 보드 메시의 셰이더 7–8개가 그 프레임에 한꺼번에 컴파일됨 ② 공식 씬이 도착해 절차적 보드를 바꾸는 프레임 260–290 ms —
  섬 전체의 셰이더 컴파일·텍스처 업로드·그림자 맵이 한 프레임에.
- 이제 둘 다 화면에 넣기 전에 준비한다(`board3d/scene.js`): `_prepare`가 `renderer.compileAsync`(브라우저에 KHR_parallel_shader_compile이
  있으면 메인 스레드를 막지 않음)로 프로그램을 컴파일하고 텍스처를 프레임당 하나씩 `initTexture`, 최대 `WARM_MAX_MS`(8초) 뒤엔 그대로 진행.
  공식 씬은 화면 밖에서 지어 준비한 뒤 바꾸고(`_warmOfficial`, 그동안 절차적 보드 유지·다시 받지 않음), 새 3D 보드(`render/app.js` `warm3d`)는
  캔버스를 숨기고 그리지 않은 채 2D 보드를 보이다가 **스테이지가 들어와 그 스테이지로 준비가 끝나면** 3D로 바꾼다(스테이지 없는 보드는 숨긴 채
  기다림, `setStage`가 다시 준비). 그래서 진입 직후 2D 보드가 잠깐(준비 시간만큼) 보일 수 있다 — 멈춘 화면 대신.
- 측정(Windows Chrome, 같은 장면 A/B): 3D 보드 첫 그리기 160–250 → 8–13 ms, 공식 씬 교체 프레임 260–290 → 11–28 ms. 남은 긴 프레임은 3D 보드를
  만드는 순간(로딩 중)뿐. 테스트 `test/render/board3d-official-retry.test.js`(준비 중엔 절차적 보드·한 번만 받음·준비 끝나면 교체, compileAsync
  없는 렌더러는 바로 교체, 준비 중 파기). [화면 미확인] iPhone Safari에서 진입 직후 멈춤이 사라졌는지(`perf:` 줄 `stalls`·`peak draw`),
  Safari의 KHR_parallel_shader_compile 지원 여부(없으면 `compileAsync`도 준비 단계에서 메인 스레드를 막는다 — 멈춤이 3D가 보이기 전으로 옮겨질 뿐이고,
  텍스처를 나눠 올리는 몫만 남음).

## 필드 첫 프레임 미리 올리기·튕긴 페이지 기록 (2026-10-17, 관리자 제공 iPhone 홈 화면 앱 관전 로그 두 개, 품질 중, 4인 협동 ABYSS)
- 로그: 8라운드까지 관전하다 페이지가 통째로 다시 열렸다(`page open 0m 37s` — 소켓만 끊긴 게 아님). 성능 표본·오류 기록은 메모리에만 있어
  그 전 라운드의 수치가 모두 사라졌다. 남은 37초: `mount:` `engine in 12.5 s`(그중 `setup` 9.5 s — 동기 구간이라 안쪽을 몰랐음), 이어
  `stalls`가 두 표본에 걸친 하나의 멈춤(14 s + 11.2 s: 그 사이 프레임 하나, 그 프레임의 PIXI 그리기 11 s — `draw 1107.5` = 지수 평균 0.1 × 11075)
  — 로딩 화면은 DOM이지만 지우는 것도 다음 화면 갱신이라 약 25초 그대로 떠 있었다. 다시 관전한 R8–R10은 품질 중에서 57–60 fps(js 3–5 ms).
  JS가 짧은데 그리기가 길어 GPU 쪽(첫 그리기의 텍스처 업로드·셰이더 컴파일)으로 봤으나, 같은 때 3D 보드도 준비 중이라 그 GPU 일을 기다린
  몫일 수도 있다 — 아래 계측으로 가른다.
- 처리 ① 필드 첫 프레임(`render/app.js` 「first frame」): 마운트가 끝나도 view가 준비될 때까지 world 층을 그리지 않고(`renderable`), 프레임마다
  화면에 걸린 base texture 중 아직 GPU에 없는 것을 `UPLOAD_MS` 6 ms 안에서(최소 하나) `renderer.texture.bind`로 올린다. 스테이지나 모드가
  들어오고, 불러오는 유닛 모델(`_spineBusy`)이 없고, 올릴 텍스처가 두 프레임 연속 없으면 world를 한 프레임 그리고 그 뒤 `ready`를 낸다
  (`view.isReady()`). 마운트 뒤 `READY_MAX_MS` 6초면 그대로 연다(남은 것은 예전처럼 그 프레임에). `[ASSUMED]` 6 ms·6초. 경기 화면
  (`screens/game.js`)은 `ready`까지 로딩 화면·`LOADING FIELD`를 유지한다 — 멈춘 필드 대신 움직이는 로딩 화면, 대신 유닛 모델이 다 올 때까지
  (최대 6초) 로딩 화면이 더 길 수 있다. 간이 보기(DOM)는 바로 준비, 간이 보기에서 넘겨받는 늦은 엔진도 로딩 화면을 다시 띄우지 않는다.
- 처리 ② 계측: `mount:` 줄의 `setup`이 부분을 나열한다(`setup 9.5 (app …, fx layer …, backdrop …, tiles …, effects …, 3d …, fonts …, input …,
  layout …, rest …)`, 0.05초 미만은 생략; `diag.js mountTimer` `part`). `arrived:`에 `frame n s (js, draw ms)`(마운트 시작 뒤 첫 PIXI 그리기 —
  world는 아직 안 그림)와 `shown n s (텍스처 n개 n s, 가장 긴 한 개 ms, 보인 프레임 js·draw ms[, cut at 6 s][, 3d still warming])`.
  이펙트 층 비용(`fx`)의 지수 평균이 이펙트 없는 프레임에서 서 있던 것도 고쳤다 — 이제 그 프레임은 0으로 섞인다(이전 로그의 `js 3 (fx 24.6)`처럼
  js보다 큰 값이 나왔음).
- 처리 ③ 앞 페이지 기록(`diag.js installPageRecord`, `main.js` boot): 이 페이지의 보고서 줄(`render events:`·`mount:`·`perf:`·최근 오류 10개)을
  localStorage `sp.diag.page`에 둔다 — 보이는 동안 10초마다, 오류·렌더 사건·마운트 단계 1초 뒤, 숨김·닫힘 때 바로. 다음 페이지의 진단 정보 끝에
  `previous page:` 줄(열린 구간, 버전, 끝난 방식: `closed`(pagehide) / `ended in the background, hidden since …` / `on screen at its last record`
  (튕김 또는 화면에 있는 채 시스템이 끝냄))과 `prev …` 줄. 6시간 넘은 기록은 안 붙인다. 브라우저당 한 기록이라 탭 둘이면 서로 덮어쓴다.
  이름 가리기는 보고서 전체에 그대로 적용.
- 확인: `test/diag.test.js`(부분·도착 설명, 앞 페이지 줄 3종, 이름 가리기), `test/diag-page.test.js`(읽기·쓰기·숨김·닫힘·뒤로 가기 캐시),
  `test/render/fieldview.browser.test.js` 「first frame」(Windows Chrome 렌더 데모: 텍스처 51개를 올린 뒤 2.6 s에 보임, 상한 안 닿음).
  iPhone 홈 화면 앱(1.4.6 관전 로그, 2026-10-17): 11 s 멈춤은 줄지 않고 텍스처 한 개의 bind로 옮겨 갔고(아래 「2D 판 타일 아틀라스」),
  `setup`의 부분은 `tiles 7.3`, 앞 페이지 `previous page:`·`prev perf:`는 붙었다.

## 2D 판 타일 아틀라스·첫 텍스처 이름 (2026-10-17, 관리자 제공 iPhone 홈 화면 앱 관전 로그, 1.4.6, 품질 높음)
- 로그: 진입이 간이 보기 → 늦은 엔진 → 3D(마운트 41.8 s 뒤) 순서라 그동안 2D 판이 화면에 있었다. `setup 7.6 (tiles 7.3, …)`,
  `frame 12.6 s (js 7, draw 4501 ms)`, `shown … 2 textures up in 11.1 s, longest 11075 ms, cut at 6 s` — 위 「필드 첫 프레임」의 미리 올리기는
  멈춤을 없애지 못하고 텍스처 하나의 `bind` 안으로 옮겼다(6초 상한은 bind가 돌아온 뒤에야 본다). 같은 로그의 앞 페이지는 3D가 먼저 떠
  `5 textures up in 0.0 s`. 앞 로그(위 절)도 11075 ms였다(지수 평균 1107.5) — 같은 값이 두 번이라 실제 일보다 고정된 대기 시간 초과처럼 보인다.
- `tiles` 7.3 s는 `TileField` 생성자의 `tileAtlas()`(2048² 캔버스에 재질 칸 64개)다. 칸마다 거터를 늘리는 `drawImage`가 아틀라스 캔버스를
  **자기 자신에** 그렸고(칸당 4번, 256번), WebKit은 캔버스를 자기에게 그릴 때 원본 버퍼 전체(16 MB)를 복사한다 [추정: WebKit 소스 기억, iPhone
  실측 없음]. 이제 칸을 CELL²(256²) 작업 캔버스에 그리고 거터를 늘린 뒤 아틀라스에 한 번 복사한다(`textures.js tileAtlas`). Windows Chrome A/B:
  픽셀은 반투명 픽셀의 반올림 ±1(절차적 840바이트·판 그림 34바이트 / 16 MB)만 다르고 UV 같음; 시간은 Chrome에선 차이 없음(자기 복사가 싸다).
- 11 s 텍스처가 무엇인지는 아직 모른다 [추정: 이 2D 판 아틀라스]. 보고서에 이름을 남긴다: `shown`의 `longest n ms (canvas 2048×2048)`(원본 종류
  `canvas`/`img`/`bitmap`/`other`와 크기), `frame`의 `n new textures, largest …`(첫 PIXI 그리기 직전에 그 그리기가 올릴 텍스처, world 층 제외).
- 확인: `test/render/fieldview.browser.test.js` 「first frame」(두 메모 형식), `test/render/originium-cell.e2e.test.js`,
  `test/render/feedback1f-down-tile.browser.test.js`. [화면 미확인] iPhone 관전 진단에서 `tiles`가 줄었는지, `shown`·`frame`이 이름 짓는 텍스처.

## upstream 버그 이슈 이식 — 렌더 (2026-10-15)
upstream 새 버그 이슈의 수정 PR 중 sim 수정에 기대는 렌더 쪽(관리자 결정 2026-10-15). sim 쪽 근거는 `sim.md` 「upstream 버그 이슈 이식 (2026-10-15)」.
- **假想敌：镜膜 멈춘 팬**(upstream #481, upstream PR #613): sim이 첫 침묵에 폼 `stopped`를 낸다 → `units.js FORMS.enemy_9011_acrefr.stopped` =
  `B_Idle`/`B_Move`/`B_Die`/`B_Attack`(모델의 A_*·B_* 두 클립 묶음 중 B, 전환 클립 없음). 늦게 들어온 관전자는 UnitInfo `form`으로 처음부터 B 모델.
  **[추정]**(PR 그대로): B 묶음이 팬이 멈춘 모습이라는 것은 클립 이름과 upstream PR뿐(클라 Graphic 표는 대조 안 함).
  그 순간의 fx `phase`(kind `stopped`)는 `fx/kinds.js SILENT_PHASES`에 넣어 대체 이펙트(보라색 사라짐)를 그리지 않는다 — 모델이 바뀌는 것으로 보이고,
  공식에 그 순간 이펙트가 있다는 근거가 없다 **[추정]**(upstream은 대체 이펙트를 그림).
  테스트 `test/render/forms.test.js`(PR: A_Idle → setForm 뒤 B_Idle·B_Move·B_Attack·B_Die, 늦은 관전자는 처음부터 B). [화면 미확인] 침묵 뒤 B 모델·침묵이 끝나도
  HP 바 상한 그대로·늦은 관전자.
- **假想敌：淤困 부착 闪现**(upstream #600, upstream PR #559): sim이 부착 순간 적을 접촉 지점(저지자 앞 약 0.7칸)에서 저지자 칸 중심으로 옮기고 fx `teleport`
  `{ id, fromX, fromY, kind: 'parasite' }`를 낸다. `interp.js SnapshotBuffer`는 이 fx(`kind: 'parasite'`, 유닛 id 있음)만 거리와 상관없이 위치 끊기로 쓴다 — 그 사이
  구간은 fx 시각까지 접촉 지점에 있다가 끊고, 그 구간에서 걸음 외삽도 안 한다. fx가 연출용으로 소비·폐기돼도 시각 목록(`parasiteBlinkTimes`, 가장 오래된 스냅샷
  뒤만 남김, `reset`에서 비움)으로 남는다. 다른 teleport fx는 기존 규칙(2.5칸 넘으면 끊기, 아니면 보간) 그대로.
  그 순간의 모습은 클라 프리팹대로(관리자 결정 2026-10-15 「공식대로」): `enemy_9007_acelem` 프리팹에는 闪现 이펙트가 없고, 천부(`Talents/1`)의
  `enemy_acelem[to_parasitic]`이 모드 Parasitic으로 바꾼다 — 그 모드의 Anim 능력이 `Parasitic`(1.2 s)을 한 번, `_replaceAnimPairs` Idle → `Idle_2`(부착 동안).
  그래서 sim은 부착 때 폼 `parasitic`(teleport fx에 `form`), 막기가 끝나면 폼 null(조용한 `phase` kind `detached`)을 내고, `units.js FORMS.enemy_9007_acelem.parasitic`
  = change `Parasitic`, idle `Idle_2`; `fx/kinds.js`는 teleport kind `parasite`와 phase `detached`에 대체 이펙트를 그리지 않는다. 막기가 끝나면 Default 모드로
  돌아가는 것은 **[ASSUMED]**(부착 버프가 막기와 함께 풀림, PRTS 「附着效果在解除阻挡时解除」). 프리팹의 `_attachOffset`·`_easeType`은 그림자(ShadowController) 값이라
  붙는 움직임과 무관하다. 클라 프리팹은 EN 번들 `battle/enm_pfb_28.ab`에서 읽음. golden: roster-019의 fx 수만(`detached` 13개).
  테스트 `test/render/interp.test.js`(PR 두 개: 짧은 parasite blink는 끊기·외삽 없음, 다른 짧은 teleport는 보간; + 실제 sim 스냅샷·fx를 버퍼에 넣는 경우). PR의
  `test/render/browser.test.js` 브라우저 경우는 충돌·브라우저 필요로 안 가져왔다. `test/render/forms.test.js` 「淤困」(Parasitic → Idle_2 → Idle, 늦은 관전자, 대체 이펙트 없음).
  [화면 미확인] 淤困이 막은 오퍼레이터 칸 중심에 미끄러지지 않고 붙으며 Parasitic 동작 뒤 Idle_2, 막기가 끝나면 Idle·Move.

## upstream 0.2.5–0.3.1 버그 수정 이식 — 렌더 (2026-10-17, 관리자 결정)
upstream v0.2.4 → 0.3.1 사이 버그 수정 커밋 중 우리에게도 있던 렌더 결함.
- **원점이 몸 가운데인 적의 HP바** (upstream `7b4f512c`): 적 HP바·이름표 높이를 setup-pose 상자의 높이(`actor.height` = `bounds.height`)로 잡아, 원점이
  몸 가운데인 모델은 보이는 머리보다 한참 위에 바가 떴다. 이제 원점 위로 뻗은 길이(`bounds.y + bounds.height`, 20…900으로 자름)로 잡는다
  (`render/units.js headTilesForUnit`). 발 기준 모델(y ≈ 0, 대부분)은 거의 안 바뀐다. 우리 `UNIT.modelScale`은 0.0027(upstream 1/320)이라 칸 수가
  upstream 숫자의 0.864배: 롯체이서(逐腐兽)·광기의 롯체이서 1.60 → 0.70칸, 데겐블레허(锏, 보스) 2.20 → 0.96칸, 사냥개 Pro·빅 밥은 변화 0.01칸 미만.
  확인: `test/render/bar-head.test.js`(upstream 판을 실제 `assets.json` 상자·우리 배율로), `test/render/playtest6-enemies.test.js`(합성 상자 높이 390 → 520:
  우리 배율로는 위 240단위면 모든 바가 하한 0.55에 걸려 비교가 안 됨). [화면 미확인] 롯체이서의 HP바가 머리 바로 위.
- **처음 그리기 전 기물의 화면 사각형** (upstream `1df530f2`): `view.pieceScreenRect`가 이번 프레임에 만든 유닛의 아직 투영 안 된 (0, 0) 기록으로 사각형을 돌려줘,
  보충(替补) 표시(`screens/game/standInTags.js`)가 한 프레임 캔버스 모서리에 뜰 수 있고 브라우저 시험이 그 자리를 잡았다. 이제 뷰마다 첫 `update`의 투영에서
  `placed`를 켜고(`render/units.js` UnitView·ItemView·DeviceView), 그 전에는 `null`(`render/app.js`). 시험 쪽 `piecePoint`(`test/e2e/client.mjs`,
  `test/ui/real.e2e.test.js`)는 그려지고 멈춘 기물을 2.5 s까지 기다린다. 확인: `test/render/unitview.test.js` 「no screen rect before the first draw」.
  [화면 미확인] 보충 오퍼레이터를 사서 벤치에 놓는 순간 「替补」 표시가 모서리에 깜빡이지 않음.
- **공식 씬 위 특제 수상 플랫폼** (upstream `205f3bb7`의 장치 부분): 공식 씬은 절차 보드 메시(장치 판이 들어 있던)를 대신하는데, 공식 장치 모델은 사격대
  (`trap_1106_achplat`, 위 「공식 스테이지 3D 씬」 기기 모델)만 놓아 전장 #05(`act1autochess_m05`)의 특제 수상 플랫폼 64칸이 빈 물로 보였다. upstream은 절차 판을
  씬 위에 다시 그리지만, 우리는 사격대와 같은 방식으로 클라 프리팹을 하나만 추출해 놓는다: `scene_extract.py` `DEVICE_KEYS`에 `trap_040_canoe`
  (`pkgrps/btl_pfb_tokens_0.ab`, 배 + 반투명 그림자 판 `MT_shadow_boat`, 갑판 0.133·테두리 0.153·선체 바닥 −0.079 — 물 위 0.1409가 심해 씬 수면),
  `official.js OFFICIAL_DEVICE.waterPlatform`, `board3d/scene.js _buildDevices`가 활성 수상 플랫폼 칸마다. 그 위 유닛은 갑판에 선다
  (`scene.js waterPlatformFor` → `app.js` 스테이지 `waterPlatformHeight` → `tiles.js` devH; 절차 판은 그대로 0.2) [ASSUMED: 공식 유닛 높이는 안 읽음 — 사격대처럼 판 위].
  봉인된 지면(`trap_1107_acblock`, 전장 #06)은 클라 프리팹에 렌더러가 없다(Graphic이 비어 있고 칸 옵션만 정한 뒤 스스로 사라짐 — EN 클라 `btl_pfb_tokens_4.ab`
  확인 2026-10-17) — 공식 씬에서도 장치가 그리는 것이 없으므로 안 그린다(upstream은 절차 판). 추출하지 않은 서버(모델 없음)는 예전처럼 수상 플랫폼을 안 그린다.
  확인: `test/render/board3d-official-devices.test.js`(배치·한 칸 한 번·갑판 높이·2D 칸 높이; 실제 추출물 사례는 추출이 있을 때만). 추출 확인 2026-10-17:
  EN 클라에서 `--devices`를 임시 폴더로 돌려 장치 3개·그룹 4개·텍스처 2개(`TX_boat_trap`, `TX_supplyshadow`), 배 메시는 불투명 표준 재질, 그림자는 UNLIT 반투명.
  [화면 미확인] 전장 #05 공식 씬에서 수상 플랫폼 배가 물에 떠 있고 그 위 오퍼레이터의 발이 갑판에 닿음; 전장 #06의 봉인된 지면 4칸이 공식 씬에 어떻게 보이는지
  (씬 자체 표시가 있는지).
- **스텐실 없을 때 영역 눈알·가는 눈꺼풀** (upstream `43a5b571`, upstream #647): 스텐실 마스크가 꺼지면(붐비는 판·고화질 미만, `render/app.js pickClipping`) 눈꺼풀
  대체 처리(`render/spine.js SpineActor._eyeMaskFallback`, upstream #177 이식 — 위 「upstream 0.2.1·0.2.2 이식 — 렌더」 눈꺼풀)가 가린 슬롯의 중심이 클립 다각형 밖일 때만
  숨겼는데, 영역(region) 눈알은 pixi-spine 본에 없는 `bone.a…d`·`worldX`를 읽어 아예 못 쟀고, 틈처럼 닫히는 눈꺼풀은 중심을 지나 메시 눈알도 남았다 — 에이야퍄들라
  더 크비트 아스카의 깜빡임·S3에서 감은 눈 위로 눈알이 비쳤다. 이제 그린 면적 중 다각형 안 몫으로 정한다(`clipHides`: 1/4 미만이면 숨김, 1/2 이상이면 둠, 그 사이는
  중심; 영역은 `bone.matrix`로 잼; 오목한 클립 안에 통째로 든 슬롯은 둠 — 안젤리나 더 멜로우 위시의 무기 빛). [ASSUMED] 두 몫(1/4·1/2)은 upstream 값, 슬롯
  단위 전부/전무도 그대로 근사. 페페 쓰러짐은 0.13 s → 0.10 s부터 숨김(upstream 기대값 그대로 통과). 확인: `test/render/eyemask.test.js`(합성 골격 — 늘 돎 —, 실제 골격:
  에이야퍄들라 더 크비트 아스카·페페 등, 16건 통과), `test/render/eyemask.browser.test.js`(RENDER_E2E, 스텐실 켬/끔 픽셀 비교 — 안 돌림).
  [화면 미확인] 고화질 미만에서 에이야퍄들라 더 크비트 아스카가 깜빡일 때와 S3 동안 눈이 감겨 보임.

## 8인 넓은 연합 방어 필드 그리기 (관리자 결정 2026-10-19, 공식에 없는 기능)

도우미 3명(29열)·4명(37열)의 넓은 연합 방어 필드(`sim.md` 「8인 협동 모드」)를 브라우저가 그린다. 공식에 없는 화면이라 모양은 모두 **[추정]**.
- **무대**: 전투 메타 `m.field.wide`(3 | 4, `Battle.fieldMeta`, 넓은 필드에서만)가 있으면 `render/app.js`가 무대 기록을 넓혀 그린다
  (`shared/wideField.js widenStageData` — 시뮬과 같은 열 규칙: 연합 방어 줄 6–13만 넓히고 나머지 줄(벤치·보스 필드·적 대기 칸)은 금지 칸으로 채워 대기 칸이
  두 번 안 그려짐, 되풀이 열의 장치는 둘(`~w`)). 정비·다른 필드로 가면 원래 무대로. 2D 타일(`tiles.js`)·3D 보드(`board3d/layout.js`)의 격자 폭은 무대 줄
  길이를 따름(21 / 29 / 37), 지어지는 3D 영역은 그 줄의 끝 열까지(`app/view.js boardArea`, 대기 칸 없음). 칸 집기·화면 사각형(`projection.js normRect`)·투사체
  끝·余 S3 벽·沙尘暴 표시도 전투 격자 37열 안.
- **공식 3D 씬**: 섬 한 벌을 오른쪽으로 8열(3명)·16열(4명) 옮긴 사본을 더해 그린다(`board3d/official.js setWide`: 지오메트리는 같이 쓰고 재질은 자르기
  값만 따로). 원래 씬은 x ≤ 18.5(옛 오른쪽 스폰, 붙인 절반이 끝나는 곳)까지, 사본은 그 오른쪽만(셰이더 `uClipX` discard). 사본의 숨김 묶음(HIDDEN@n)은
  사본 아래 무대 칸 기준. 섬 둘레 배경까지 그 선에서 자르면 바위 더미·절벽이 반쪽씩 붙어 어색했다(관리자 화면 확인 2026-10-20) → 씬을 삼각형이
  이어진 덩어리(같은 정점이나 같은 위치)로 나눠, 연합 방어 줄(8.5–12.5)에 안 걸치고 폭 14칸 이하인 덩어리는 중심이 이음매 어느 쪽이냐로 한쪽이 통째로
  그린다(`official.js WIDE_KEY`·`wideKeys`, 정점 속성 `aKey`, 사본은 `uKeyShift`). 필드·벽·모래 바닥·바다는 그대로 18.5에서 자름. **[ASSUMED]**
  덩어리 기준은 우리가 정함(한쪽 덩어리가 이음매 너머로 조금 겹치거나 빈자리가 날 수 있음).
- **카메라**: 넓은 필드의 全景은 필드 전체에 맞춘 카메라(공식 mid 카메라는 21열용 — `presetCamera`가 c1 > 20인 연합 방어 사각형을 맞춤 경로로),
  절반 보기는 공식 왼쪽 절반 카메라(`left_battle_camera_param`)를 그 절반의 열 오프셋(0·8·16·24)만큼 옮긴 것(`halfOffset`). 세로 화면은 그 절반 11열에 맞춤.
- **‹ › 전환**: 도우미마다 절반 하나 — 왼쪽부터 `H0`…`H3`(열 오프셋 ÷ 8; 첫 도우미가 맨 오른쪽), 가운데에 全景(4명 H0 H1 全景 H2 H3, 3명 H0 全景 H1 H2;
  `battle/observe.js cameraLayers·halfSide·layerCamera`). 前往查看·맹약 줄도 그 절반을 따름(`ui/watchBonds.js`). 2명 필드는 L / 全景 / R 그대로.
- **유닛 HUD 크기**: 공식 HUD(HP·SP 막대, 적 HP, 원소 고리 — `render/hud-bars.js`)는 카메라와 상관없이 화면에 고정된 크기라, 全景처럼 카메라가
  멀어지면 작아진 유닛에 비해 너무 크다(관리자 화면 확인 2026-10-20). 넓은 필드가 화면에 있는 동안 `render/app.js updateHudZoom`이 지금 카메라의 타일
  크기를 공식 2인 연합 방어 카메라의 타일 크기로 나눈 비율(최대 1, 최소 0.45)만큼 HUD 단위를 줄인다(`units.js hudU`). 절반 보기는 공식 배율이라 1.
  피해 숫자(`num-official.js`)는 그대로. **[ASSUMED]** 공식에 넓은 필드가 없어 비율 기준은 우리가 정함.
- **간이 보기**(`ui/fallbackField.js`): 같은 넓힌 무대, 타일은 12 px까지 줄여 화면 안에.
- 확인: `test/render/wide-field.test.js`(넓힌 무대 기록·장치 사본, 2D·3D 격자 폭, 3D 영역, 全景이 양 끝을 담음·절반 카메라 = 공식 왼쪽 절반 + 오프셋,
  ‹ › 층, 前往查看·맹약 줄, `fieldMeta.wide`, 공식 씬 사본의 위치·자르기·숨김 묶음 — 합성 지오메트리). 클라우드 헤드리스 Chromium으로는 간이 보기만 봄
  (3·4명 필드의 출구 하나·스폰 셋/넷이 8열 간격으로 나옴; Pixi 2D와 3D 보드는 그림 자산이 없어 안 그려짐).
- **[화면 미확인]**: Pixi 2D 판·절차형 3D 보드·全景/절반 카메라 구도·휴대폰 가로에서 37열이 읽히는지 — 로컬 Windows Chrome에서(공식 3D 씬 이음매와 全景의 유닛 HUD 크기는 2026-10-20 관리자 화면 확인).
