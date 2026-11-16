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
    전투 화면이 바뀌면(다음 전투·연합 방어·다른 플레이어 필드) 밟은 유닛 목록을 비운다(2026-11-03, 관리자 제보 「전투 중에 칸을 지나간 적이 연합 방어에서도
    계속 표시」 — 전투마다 유닛 번호가 1부터 다시 매겨져, 정비 없이 이어진 다음 전투의 같은 번호 유닛에 표시가 붙었음; `createInfectionTouches`,
    테스트 `test/render/infection-touches.test.js`). 관전석·다른 플레이어 보드 정찰의 정비 시간(전투 화면 `prep: true`)은 정비와 같이 지금 그 칸에 선 기물만
    (같은 날 관리자 제보 「관전으로 볼 때 한 번이라도 장판 위에 있었던 오퍼레이터는 계속 표식」 — 전투 규칙을 따랐음).
    [추정] `_spawnLocation 4` = 유닛 머리 위, 크리스탈 같은 반짝임은 데이터에 없어 오퍼레이터 스킬로 봄.
  - 텍스처 추출: `.venv-extract/bin/python -I tools/local-extract/boardfx_extract.py` → `public/assets/local/board/fx/`(4장) + manifest `board/fx`.
- **외곽 하늘색 점선**(`_buildEdges`): 클라이언트에 해당 오브젝트가 없고 캡처에도 없다 → 공식 씬에서는 그리지 않는다(절차 보드는 원본 그대로).
- **공격·방어 포인트**: 클라이언트가 쓰는 건 `tile.ab`의 `tile_start`/`tile_end`(우리가 읽는 `[pack]map.ab` start_box/end_box는 그림만). tile_start는
  Start_up을 가산 + 알파 블렌드로 두 번, tile_end는 Start_up1을 둘 다, 둘 다 _TintColor 1·색 애니메이션 없음 → 알파 블렌드 패스 추가, 맥동 제거
  (`GATE_ADD` start 0.2 / end 0.5 [추정 — 캡처에 맞춤]). 캡처의 시작 상자는 경고 삼각형·모서리 점선까지 빨강이라(텍스처 변형은 모두 흰색) 붉은 틴트
  `GATE_START_TINT` (1, .22, .25) [추정]. 이전: 시작 = 분홍빛 흰색 255,180,200, 끝 = 진한 파랑 53,162,254 / 공식 229,63,60 · 136,226,249.
- **밝기**: 같은 스테이지 영역 비교에서 중간 톤은 같고(모래 0.964) 밝은 모래 윗면이 하얗게 날아감(R ≥ 250 픽셀 13.6 % vs 공식 5 %) →
  `official.js OFFICIAL_LIGHTING` directGain 0.9·lmGain 0.97 [추정·미조사: 씬의 `AE_Survivaloasis` 프로필을 아직 안 읽음]. 내 캡처 기준 날아간 픽셀 7.9 → 3.9 %.
- **드래그 중 벤치 틴트**: `screens/game.js`가 드래그 시작 때 필드 칸만으로 하이라이트를 덮어써서 벤치가 빠져 있었다 → 놓을 수 있는 벤치 칸(자기 칸 포함)도 넣는다.
  벤치는 청록 2× 곱하기 `tileOverlay.js BENCH_TINT` (0.29, 0.55, 0.65) — 클라이언트 상수 `AUTOCHESS_VALID_HANDTILE_CUSTOM_HIGHLIGHT`의 값을
  아직 안 읽어 [추정·미조사], 관리자 캡처(아이템 드래그 중 벤치 전체가 청록: 판자 245,198,138 → 140,215,177)에 맞춤. `app.js syncOverlay3d`가 7·8행(일반 정비)을 벤치 틴트로 보낸다.
- **장비 장착 팝업** (`ui/equipHover.js`, `css/equip-hover.css`): 아이템을 장착 가능한 오퍼레이터 위로 끌면 뜨는 2칸 알약 — 프리팹
  `act1autochess_equip_slot_panel`(UIAutoChessDragEquipPanel; 두 시즌의 `act2`·`act3autochess_equip_slot_panel`도 CN 클라에서 같은 값) 그대로: 루트 배율 .8, 알약 334×152가 기준점 120단위 위, 칸마다 #1e1e1e 상자·아이템 아이콘·
  흰 테두리(`img_EquipSlot_frame2` 9-slice), 아이템이 들어갈 칸(= 장착 수 번째)은 `frame3` + `SlotGlow` × #55ffeb 가산 맥동(1 ↔ .4, .7초), 두 칸 다
  차면 빨간 괄호(`frame1_red`) + 붉은 막(`img_EquipSlot_glow` α.71) + 교체 아이콘 + 「장비 교체」(문구는 실행 중에 정해져 데이터에 없음 [추정]) → 놓으면
  기존 교체 창. 등장(.333초)·닫힘(.4초)·장착 플래시(칸 1.333배 튐 + 청록 채움, .417초)는 프리팹 클립 값. [추정] 기준점 = 칸 화면 깊이의 .7(캡처: 알약 아래 ≈ 칸 뒤쪽 가장자리).
  크기(2026-11-11): 공식 CN 1080p 캡처(장비를 필드 오퍼레이터 위로 끄는 장면)에서 칸 간격(108단위)이 83 px — 1080p에서 1단위 ≈ 1 px, HUD 단위(`--ui-u`, 기본 UI 크기에서 공식 HUD와 같음)의 .72배다. 그래서 `--eh` = `--ui-u` × .72 × .8(전에는 × .8만이라 1.4배 컸다). 다른 해상도·UI 크기에서도 HUD 단위를 따라간다 [추정·화면: 패널이 실행 중에 붙는 캔버스의 배율은 클라에서 안 읽음, 1080p 캡처 하나로 맞춤].
  그림은 `ui/battle` 그룹(extract.py 기존 추출)이고 없으면 팝업 없음(원본 그대로). 정비 중 기물 위 장비 바(`hud-bars.js EquipBar`, `ui.md` 「전투 화면 UI」)와는 별개.
  장비 칸이 둘보다 많은 기물(규정 레이지 아이언하이드 4·6칸)은 알약을 칸 하나(108단위)씩 넓히고 칸마다 테두리를 두어 칸 수만큼 그리며, 다 찬 상태도 그 칸 수로 판단한다
  (관리자 결정 2026-11-12). 교체 창은 「(n/n)」으로 칸 수를 쓰고, 고를 장비가 5·6개면 3열이다 [추정·화면: CN 클라의 규정 팝업 프리팹은 여전히 2칸이고, 따로 「가득 참」
  알약(`act3autochess_spequip_slot_panel`)과 카드 격자 교체 창(`equip_multi_slot_replace_dialog`·`spequipment_item`)이 있어 칸 많은 기물은 그쪽을 쓰는 것으로 보이나
  어느 때 쓰는지는 공식 화면을 못 봄].
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
  (필드 meta·spec·`publicView()` 모두 경기 stageId), 브라우저 `test/e2e/coop.e2e.mjs`(`SP_E2E=1`, 联防 필드가 경기 맵을 그림) [실제 판 이상 없음 2026-10-28].
- 알려진 차이: 공식 물 셰이더는 근사(깊은 색 하나 — 공식은 해안 근처가 깊이에 따라 청록으로 얕아짐, 거품·커스틱·하늘 반사 없음), m04 밀물 연출 미구현, `_HG_VERTEX_COLOR_BLEND`의 노이즈 항(`_BlendNoiseStrength`·`_BlendMaskNoiseSkew`)은 읽지 않음.

## 규정 전장 공식 씬 (2026-11-11, 공식 클라에서 확인)

- **구조**: 규정(`act3autochess`)의 스테이지 씬(`scenes/activities/act3autochess/level_<전장>.ab`)에는 36×55 논리 맵의 칸 오브젝트와 렌더러 하나뿐이다. 전투가 그리는 지형은 하위 레벨마다 하나인 레벨 프리팹 셋(`battle/prefabs/levelprefabs/activities/act3autochess/level_<전장>/level_<전장>_sub_01…03`)에 있다: 테마 메시, 프리팹 자신의 라이트맵·섀도마스크(`PrefabLightmapData` — 렌더러마다 라이트맵 번호와 배율·오프셋), 주광, `MapGraphic`(테마, `highlandHeight` 0.4). 프리팹 공간은 그 하위 레벨의 칸 좌표다(칸 (r, c) = 루트에서 (c, r, −높이)).
- **붙이기**: 시뮬이 읽는 19×21 틀에 칸을 놓는 방식(`tools/level-fields.mjs` `STAGE_PIECES`, sim.md 「규정 전장을 19×21 틀로」)과 똑같이 프리팹 지형을 잘라 옮긴다(`scene_extract.py` `FRAME_PIECES`): `sub_03`의 6행 이하(보스 판과 그 아래)는 그대로, 7행 이상(적 대기 칸과 그 위)은 7행 위로, `sub_01`의 10열 이하(자기 판·정비 줄과 그 왼쪽 섬)는 7행 위로, `sub_02`의 11열 이상(오른쪽 판과 그 오른쪽 섬, 정비 줄 아래 한 줄 포함)은 8행 위로. 자르는 선을 지나는 삼각형은 잘라서 속성을 보간한다. 그래서 자른 선을 가로지르는 바위·턱이 선에서 끊겨 보인다. 공식 클라는 판마다 그 하위 레벨 하나만 보여 준다(어느 모드에 어느 조각인지는 화면 몫, 아래).
- **테마**: 사막 `map_autochesssand`(m01–m04·m06), 도시 `map_survivaloasis_city`(m05), 얼음 `map_icewild`(m09·m11, `Torappu/Scene/Standard-Ice`), `map_ltny2`(m10·m12, `StandardBloom`). 얼음·블룸 셰이더도 `official.js`의 Standard 길로 그린다(얼음 반사·블룸 [추정·화면: 공식 화면과 나란히 보지 않음]). 불투명 재질은 알파 1을 쓴다(얼음 텍스처의 알파는 투명도가 아니라 데이터라, 알파가 있는 캔버스인 맵 미리보기에 구멍이 났다).
- **CN 텍스처는 따로**: CN 클라에서 뽑은 텍스처는 `scene/tex/cn/`에 둔다(`scene_extract.py --cn`, CAB 색인 `.cache/scene-cab-index-cn.json`). 두 클라가 같은 이름의 테마 텍스처를 다르게 싣고 있어서다(압축이 달라 픽셀이 최대 74/255 다르고, `TX_Survivaloasis_E`는 한 영역의 내용이 다름) — 한 쪽 추출이 다른 쪽 씬이 확인받은 텍스처를 바꾸면 안 된다.
- **새 타일**: 가속 칸(`tile_speedup`, 기호 `u`)·초원(`tile_duel_grassland`, `G`)·임시 정비 칸(`tile_acbag`)·늪(`tile_mire`)·벽(`tile_wall`)의 클라 타일 프리팹에는 렌더러가 없다 — 그림은 레벨 프리팹 지형에 들어 있어 공식 씬과 함께 그려진다. 공식 씬이 없을 때의 절차 판에서는 `u`·`G`를 보통 길(`r`)로 그린다(`style.js TILEKEY_GLYPH`; 모르는 기호의 줄무늬 길 대신). 초원·늪 타일 프리팹의 `_effect`(타일 위 맵 이펙트 `mapeff_079_dikuai_01`·`mapeff_mud_ground_01`)는 이펙트 층이 칸마다 깐다(2026-11-12, 늪은 프리팹을 뽑은 뒤) — fx.md 「규정 전장의 화면·맵 이펙트」.
- **염괴포 모델**(`trap_196_cnnon`, m10): 시뮬 역할 없이 키로 도는 적 편 장치라 3D 보드가 키로 찾아(`layout.js DEVICE_KEY_KINDS` → `cannon`) 공식 모델(EN `pkgrps/btl_pfb_tokens_2.ab`의 `Graphic/Mesh/trap_196_cnnon`, `scene_extract.py --devices`)을 그 칸에 세운다. 모델은 포신이 아래(−행)를 보는 방향으로 나오고 m10의 넷도 모두 DOWN이다. 이펙트(대기·등장·발사·포탄·착탄·승객 표시)는 fx.md 「규정 대포 「염괴포」」.
- **증식 갑각 모델**(`trap_156_dsshell`, 2026-11-12): 소핵의 퇴적자가 쓰러진 칸에 전투 중 생기는 장치라 3D 보드의 전투 장치 손잡이(`scene.js _createOfficialDevice`)가 장치 키(`units.js DeviceView`의 `key`)로 공식 모델을 고른다 — EN `pkgrps/btl_pfb_tokens_1.ab`의 `Graphic/Mesh/trap_156_dsshell/group1/Part1~10`(`MultiMeshTileGraphic`, `scene_extract.py --devices`). 다른 전투 장치는 전처럼(`crateTop` 상자만 阻隔工事 모델, 나머지는 절차 상자). **클립**(2026-11-12, 공식 클라에서 확인): 프리팹 `MeshAnimator` `_animations`가 `Born` = 레거시 클립 `Appear`, `Die` = `Break`(둘 다 1.25초, 24fps, `Animation` 컴포넌트는 `Graphic/Mesh/trap_156_dsshell`). `Appear`는 `group1`이 크기 0.001에서 1로 자라며 위에서 떨어져 튀고, `Break`는 조각 10개 중 8개(Part4·Part9 빼고)가 위치·회전·크기 곡선으로 흩어져 떨어진다(일부는 바닥 아래 0.18칸까지). `scene_extract.py`가 두 클립의 에르미트 곡선을 30fps로 뽑아 조각마다 쉬는 자세에서의 보드 공간 변화 행렬(3×4)로 `devices.trap_156_dsshell.clips`에 적고, 움직이는 렌더러는 서 있는 모델(재질마다 메시 하나) 옆에 조각별 그룹(`part`)으로 따로 둔다. 화면은 장치 손잡이가 클립 동안만 조각 메시로 바꿔 그리고(`official.js pose` — 프레임 사이 보간, 서 있을 때는 전과 같은 메시 하나), `DeviceView`가 생길 때 `Born`을 튼다. 쓰러질 때는 공식 `Character.States.DeadState`대로(공식 클라에서 확인): `_useSpecificDeadAnim`이 꺼져 있어 `m_delayToRecycle`은 기본 1초 그대로이고 `Die`를 클립 길이 ÷ 1초 배속(1.25배)으로 그 1초에 맞춰 튼 뒤 거둔다; `_showDeadTweenColor` 1이라 그 1초를 셋으로 나눈 색 트윈 — 기다림, 색 × 1→0(검게), 알파 1→0(`units.js deviceDeath`, 셰이더 `uTint`). 크기는 줄지 않고 일반 장치 부서짐(줄어듦 + `crateBreak` 파편)은 클립이 없는 장치에만. [추정·엔진: 세 토막의 ease — DOTween 기본값 OutQuad로 둠] [화면 미확인 — `checks/arena.md`]
- **맵 미리보기**: 브리핑 카드의 미리보기는 지금까지처럼 우리 3D 보드로 찍는다(`tools/map-previews.mjs --season act3autochess`, 1024×448). 공식 클라에도 이번 시즌부터 하위 레벨마다 512×512 미리보기(`arts/ui/stage/mappreviews/act3autochess_<전장>_sub_0N`)가 있지만, 카드 모양(넓은 띠, 관리자 결정 2026-10-11)과 달라 쓰지 않았다.
- **화면 몫** [추정·화면: 공식 화면으로 확인 전]: 혼자 판의 조각 `sub_01`은 적 대기 칸이 자기 판 오른쪽(12–18열)이다. 우리 틀은 지난 시즌처럼 판 위(14–18행, `sub_03`의 적 칸)에 둔다. 혼자 판에서 공식 화면이 적을 어디에 세우고 카메라가 어디를 보는지는 공식 화면으로 정한다(프리팹 `StoreValueComponent`의 `camera_offset`은 세 조각 모두 (5.5, −2.6, −9.78), 초점은 프리팹 루트).
- 시험: `test/render/board3d-official.test.js` 「clip_rect…」·「규정 (act3autochess) board」·「extracted 规程 scenes」.

## 배치 낙하 (2026-10-07)
- 관리자 제보(공식 화면 캡처 프레임 시트·Start 클립 조사, 비공개 조사 기록). 낙하는 코드가 아니라 각 모델의 Spine `Start` 클립이다(143명 중 103명: 몸 높이 0.6–7배 위에서, 착지 중앙값 0.2초, 가속·튐 없음,
  `OnStart` 이벤트 = 착지). 나머지 40명(赤刃明霄陈·蕾缪安 등)은 자기 등장 동작.
- 원본도 배치 때 `Start`를 틀었지만 가려졌다: 0.25초 투명도 페이드, 전투 시작처럼 모델이 로드되기 전에 'deploy'가 오면 `Start`를 건너뜀(그냥 Idle로
  서 있음), 새 모델 0.2초 크로스페이드, impostor 슬롯이 서 있는 자세 크기, `fx.deploy` 민트 기둥·링·입자.
- 고친 것(아군 + Spine 모델이 있는 유닛만, `UnitView.onDeploy`가 true를 돌려줌 → `bornOfficial`): 페이드 없음, 기둥 없음, 로드 전 배치는 로드되면 그만큼
  지난 시점부터 `Start` 재생(크로스페이드 없이), 클리핑 없는 모델은 낙하 중 impostor를 쓰지 않음(클리핑 모델은 위로 7배 넓힌 슬롯), 첫 0.1초 RGB×0.6
  [추정: 캡처 첫 프레임이 어둡다(≤66ms) — 근거는 캡처뿐. 예전에 든 클라 `_disableBornTweenColor`는 적(`Enemy`)·적 소환 노드에만 있는 필드라 오퍼 근거가 못 된다
  (공식 클라 2026-10-10: `Character`에는 born 색 트윈 필드가 없고 `_showDeadTweenColor`·`_useRealBornTimeFromAnim`만; `Consts.CHARACTER_BORN_TIME` = 1초)]. 정비 단계: 보드 배치·벤치 도착(구매·반환)·보드→벤치 복귀 모두 낙하, 목표 칸으로
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
  바로 떨어진다(`units.js onDeploy()`). 녹화의 약 0.12초(실시간) 간격은 공식 클라의 0.2게임초와 맞는다 — 전투 배속 `GAME_SPEED` 2라 0.2게임초 = 0.1실시간초(오디오 담당 확인). 배치
  효과음·部署 대사의 시점은 `audio.md`(오디오 담당).
  착지 이펙트(2026-10-11, 공식 클라 확인): 'deploy'마다 공식 배치 이펙트(프리팹 `_startEffect`, 없으면 `common_char_birth_01`·토큰 `common_call_start_01`)를
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
  표가 없으면 `TOKEN_MODEL_K`)로, 그림자를 프리팹 자리·크기로 그리고, 그림자 없는 프리팹은 그림자를 끈다. 적은 다음 절(2026-10-24).
- 따라가는 것과 아닌 것(공식 기준):
  - HP 바·HUD는 **유닛 점에 그대로**: 공식 `UIUnitHUD.Attach`가 `hud_unit`을 유닛의 `_uiMountPoint`에 붙이는데 오퍼레이터 프리팹은 비어 있어
    `Unit.OnAwake`가 유닛 자신의 transform으로 채운다(ui.md 「뜨는 높이」) — 모델 노드가 아니다. 그래서 `hud_unit` 중심도 **유닛 점 위 0**
    (`units.js hudAnchor`): 처음(77c99b5a)엔 `HUD_ANCHOR`(점 위 24.5)를 남겨 두었는데, 그 24.5는 모델이 점에 서 있을 때 캡처의 「신발 아래 약 30단위」에
    맞춘 값이라 내려간 모델과 이중 보정이 되어 바가 신발에 붙었다(관리자 제보 2026-10-23, 배포 서버). 공식 PC 캡처(관리자 제공 2026-10-23, 赤刃明霄陈):
    HP 바 225px = 125단위, 신발 밑 → HP 중심 약 29단위; 우리 점 위 0이면 54.5 − 모델 내려감(공식 카메라 약 0.16칸 ≈ 26단위) ≈ 28단위.
    `HUD_ANCHOR`는 모델이 점에 서 있는 유닛(장치)에만 남는다 — 적은 모델 위치값을 그리며 함께 0으로(다음 절, ui.md 「① 아군 바」).
  - 충전 표시는 모델을 따라감: 공식 `_FollowPosition`이 `FaceSwitcher/HeadPoint`를 따르고, 우리 `headPointY`가 `root`(옮긴 몸)에서 잰다.
    좌우 위치(±0.06)는 표식 x에 안 넣었다(머리 점의 x도 안 씀).
  - 모델 점 이펙트(총구·피격·머리·특수 점, `points.json`)는 `root`에서 재므로 따라감. 점 표가 없는 유닛의 몸·머리 높이(`fx/camera.js bodyZ`: 투사체 출발·조준,
    `SPAWN_FRAC`)는 `modelDrop`(모델 발이 유닛 점보다 화면에서 내려간 칸)만큼 내려 모델을 따라감. 0 NONE·바닥(GROUND_CENTER 5·7 = 엔티티 점)
    이펙트는 유닛 점 그대로.
  - **발 이펙트(1 FOOT_POINT)도 모델을 따라감** (2026-10-23, 공식 클라에서 확인 + 공식 녹화): 위치는 `Entity.footMountPoint` = `Unit.get_footPoint`
    → 애니메이터의 `footTransform`이고, 이것이 `CharacterAnimator`·`MultiSpineAnimator`는 활성 얼굴의 `skeleton` 노드, `SingleSpineAnimator`는
    `_skeleton` 노드, `EmptyAnimator`는 자기 노드 — 곧 프리팹 위치값으로 옮겨진 모델 자체다(회전만 `graphicFootTransform` = `Graphic`, fx.md
    「캐릭터 그림의 기울기」). 처음(77c99b5a)엔 FOOT를 `Graphic` 점으로 보아 유닛 점에 두었고, 그래서 '위'(余) S3 버프 `yu_skill3_buff_01`(FOOT,
    붙들림)이 내려간 발보다 약 0.16칸 위에 떠 보였다(관리자 제보 2026-10-23). 공식 녹화(관리자 제공 2026-10-23)는 그 구체가 몸 전체를 감싸고 아래 불꽃
    고리가 신발 높이다. → `fxgame.js followed`의 발 갈래가 몸과 같은 오프셋(`faceDX`·`modelDY`·`modelDZ`)을 더함(이륙·비행 갈래 포함; 적도
    2026-10-24부터 같은 오프셋이라 이 갈래로 따라감 — 다음 절). 확인: `test/render/model-place.test.js`, Windows Chrome 디버그 아레나 '위' S3 「지금 발동」
    전·후(전: 구체 밑으로 발이 나옴, 후: 발까지 감쌈).
    상태 이펙트(`fxstatus.js`)의 높이 0 항목도 프리팹이 FOOT(1)이면 같은 갈래를 탄다(2026-10-24, 관리자 제보): `playStatus`가 0을 유닛 점에 두어
    머드락(泥岩) 재능 층 `mudrok_buff_0N_start`가 '위'와 똑같이 떠 보였다. 같은 경로였던 것: 니어 더 래디언트 나이트 S2 층, 엑시아 더 뉴 커버넌트·
    실버애쉬 더 레인프로스트 배리어, 아군 은신, 둔화·냉동 같은 공용 상태(오퍼레이터에 걸릴 때). 바닥 프리팹(5, `common_levitate_01`)은 유닛 점 그대로.
  - 그대로 둔 것: 툴팁 사각형(`bounds`), 바둑돌 이펙트의 공 올림(`STONE_BALL` — 땅 점으로 둘지는 화면 비교 뒤).
- 확인: `test/render/model-place.test.js`(표준값·−30° 변환·`Graphic` 올림, 표 항목·키 순서·그림자 없음, 오퍼레이터·토큰 몸·그림자 자리, HUD는 유닛 점,
  표가 늦게 와도 다시 읽음, `bodyZ`가 모델을 따라감), `feedback3-shot-height`·`model-shift`. Windows Chrome 디버그 아레나: 薄绿(char_388_mint) 몸 0.068칸 왼쪽·
  0.161칸 아래, 그림자 0.148칸 아래·0.61 × 0.17칸; 赫默의 医疗探机 몸 0.081칸 아래(0.2 올림 − 0.16)·그림자 0.31칸·배율 ×1.48; 발이 칸 앞쪽 끝·HP 바가 바로 밑으로
  공식 PC 캡처(관리자 제공 2026-10-07, 8라운드)와 같은 모양. [화면 미확인: 실제 판에서 공식 캡처와 나란히 — 오퍼레이터 발·HP 바·그림자, 风雪之眼 그림자 없음]

## 모델 위치값·그림자 — 적 전부 (2026-10-24, 위 절의 다음 단계)
- 근거(EN 클라 `battle/enm_pfb_*.ab`, `data/enemies.json`의 249 프리팹(`spine`) 전수): 적 프리팹은 자리와 크기를 **`Graphic` 자체**에 둔다 — `Graphic`은
  X −30°로 기울었고 그 위치는 루트 기준(안 기울어짐, 판 위 값), 그 아래 `FaceSwitcher`·`Spine`은 모두 위치 0·배율 1이다. 그림자는 `Shadow/Sprite`
  (몇은 `Others/Shadow/Sprite`, 부모의 위치·배율을 더하고 곱함). 값: `Graphic` 위치 (0, −0.2, −0.06) 184 · (0, −0.2016, 0) 25 · (0, −0.2, 0) 17 ·
  0 11(비행 적 전부) · 크게 내려선 장식 적(铜矛头·铁灯盘 등 −0.33 넷, 青铜镜·茶器 등 −0.45 넷) · 源石虫 무리 셋 x +0.01; 그림자 배율 0.12가 가장 많고
  0.14 · 0.10 · 0.16–0.2, 장식 적 0.05, 비행 적 0.06(先兆者 둘 0.15)·자리 (0, 0), 扎罗 0.3 × 0.2, “越长尘” 0.3 × 0.14. `Graphic` 없는 刺胄之弹
  (`enemy_9016_acstmr`)은 루트의 `EmptyAnimator`가 (0, −0.2, −0.06)이고 그림자가 없다. 비행 적의 `Shadow`는 루트에서 1.2 아래 — 그림자가 땅에
  있다는 뜻이라 높이는 안 쓰고 지금처럼 밑 칸 위에 눕힌다(`shadowZ`).
- 적용: 표준값 `fxpoints.js ENEMY_PLACE`(걷는 적·비행 적 둘), 적마다의 값은 오퍼레이터와 같은 로컬 추출 표 `model_place.py` → `places.json`
  (프리팹 이름이 키; 표가 없으면 표준값). `units.js`가 몸을 `Graphic` 위치(`modelOffset`의 `graphic` — 안 기울여 판 위 열·행·높이)에, 그림자를
  프리팹 자리·크기로 그린다(예전 폭 0.95칸, 보스 1.6칸 — 근거 없던 값). 크기는 그대로 `enemies.json modelScale`(같은 `Graphic` 배율에서 나온 값;
  표의 `scale`은 안 씀 — 木制瑞印의 음수 x는 `mirrorX`). 화면에서 걷는 적은 약 0.15칸, 장식 적(−0.45)은 약 0.37칸 내려선다.
- 따라가는 것: 앞 절과 같다 — HUD는 유닛 점(`hudAnchor` 0: 공식 적 프리팹도 `_uiMountPoint`가 비어 유닛 transform, ui.md 「뜨는 높이」), 발 이펙트
  (`fxgame.js followed` 발 갈래), 점 표 없는 몸·머리 높이(`modelDrop`). 거대 보스 패널(`GIANT_BOSS` 칸 오프셋, 프리팹 `_bossHudOffset`)과
  `MODEL_SHIFT`(유닛 전체)는 유닛 점 기준이라 그대로.
- 확인: `test/render/model-place.test.js`(표준값·표 항목·그림자 없음, 적 몸·그림자 자리, HUD 점, `modelScale` 유지), `local-extract.test.js`
  (`shadow_of`), `local-patch-hud.test.js`(적 바가 점 아래 55.3단위). Windows Chrome 디버그 아레나 전·후(텍사스 옆 샌드백): 源石虫 몸 0.145칸·그림자
  0.148칸 아래·폭 0.51칸, HP 바가 텍사스 바와 같은 높이(점 아래 0.40칸, 전에는 0.23칸); 妖怪 그림자 0.28칸(전 0.95); 扎罗 그림자 1.53 × 0.28칸;
  青铜镜 몸 0.37칸 아래·그림자 0.26칸. [화면 미확인: 실제 판에서 공식 캡처와 나란히 — 적 발·HP 바·그림자]

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
  틀어짐). PR의 「알파를 두 번 곱한다」는 설명은 이때 우리 코드에 맞지 않는다고 봤으나, 게임의 로더 경로에서는 `pma: true` 페이지도 두 번
  곱해지고 있었다(2026-11-01, 다음 절 「로더」).
- 그대로 둔 것: 분리 페이지의 `min` 클램프(클라는 RGB > A를 그대로 더해 발광처럼 보임; 원석충 0.6 % 픽셀, 최대 63 차이) — 압축 번짐인지 의도된
  발광인지 모름 [ASSUMED].
- 확인: `test/local-extract.test.js`(`material_straight`, `merge_alpha` straight 곱하기), 다시 뽑은 페이지의 반투명 픽셀 중 RGB = A(잘린 흔적)
  风雪之眼 66 → 1.9 %·战术锚点 90 → 2.7 %, 香槟炸弹 2.8 % 그대로. [화면 미확인: 风雪之眼·战术锚点 가장자리가 회색 테 없이 원래 색, 원석충은 그대로]

## 오퍼레이터·소환물 Spine 페이지의 알파 (2026-11-01, 관리자 제보 「스즈란·수르트 얼굴 눈 주변에 외곽선이 보인다」)
- 증상: 스즈란(`char_358_lisa`)·수르트(`char_350_surtr`)의 눈 둘레에 어두운 고리. 두 모델은 흰자(`F_Face_Default_l`·`m`) 위에 구멍 뚫린
  피부 조각 메시(`F_Face_Default_h`·`i`)를 덮어 눈 모양을 만드는데, 그 조각의 반투명 가장자리가 어둡게 그려졌다.
- 원인: 웹에서 받는 오퍼레이터·소환물 모델(atlas에 `pma` 줄 없음)을 모두 straight로 읽었다(`tools/assets/plan.mjs` `pma: false`). 페이지는 두 종류다 — 앞 절의
  셰이더 규칙 그대로 `_UseBleed` 페이지는 straight(투명 텍셀에 색이 번져 있음), 나머지(`[alpha]` 분리 페이지를 합친 것)는 이미 premultiplied(A가 0인
  곳은 검정, 반투명 가장자리는 RGB ≤ A). premultiplied 페이지를 straight로 올리면 업로드 때 A를 한 번 더 곱해 반투명 가장자리가 A²로 어두워진다.
  흰자 위에 놓인 피부색 가장자리라 이 두 모델에서 눈에 띄었을 뿐, 같은 종류의 페이지를 쓰는 모델 전부가 그랬다.
- 판정(페이지 픽셀): 오퍼레이터 295쪽 중 170쪽이 premultiplied(색 있는 투명 텍셀 ≤ 0.5 %, A보다 밝은 반투명 텍셀 ≤ 5.5 % — 엑시아 `char_103_angel`의 빛),
  125쪽이 straight(색 있는 투명 텍셀 ≥ 9.8 %). 한 모델 안에서 두 종류가 섞인 것은 없다. 소환물은 8모델이 premultiplied(메딕프로브 `token_10000_silent_healrb`·저주인형·종이 인형·늑대 무리 등). `tools/assets/spine.mjs premultipliedPage`가 경계
  2 %·10 %로 가르고, premultiplied 페이지만 atlas에 `pma: true`를 붙인다(pixi-spine이 `ALPHA_MODES.PMA`로 올림). manifest `pma`는 모든 페이지가
  `pma: true`인지.
- 로더(같은 날, 관리자 재제보 「로컬 디버그 아레나와 인게임에서 이전과 똑같다」): atlas의 `pma: true`만으로는 게임에서 아무것도 바뀌지 않았다.
  게임은 모델을 `PIXI.Assets.load(skel)`로 올리고(`public/js/assets.js loadSpineData`), pixi-spine의 atlas 파서가 페이지를 PIXI 로더에 맡기는데,
  PIXI 이미지 로더(`loadTextures`)는 모든 페이지를 옵션 없는 `createImageBitmap`으로 디코드한다 — 브라우저가 이때 A를 곱하고, WebGL은
  ImageBitmap에 언팩 플래그를 쓰지 않는다. 그래서 `ALPHA_MODES.PMA`는 블렌드만 바꾸고, premultiplied 페이지는 그대로 두 번 곱해졌다. 이는 적
  (모든 적 페이지가 premultiplied: 243쪽)과 클라에서 뽑은 모델에도 처음부터 그랬다. 고침: `loadSpineData`가 manifest `pma` 모델을 pixi-spine
  `imageMetadata`에 표시해 올리고, 그 표시가 붙은 페이지는 전용 로드 파서(`PMA_PAGE_PARSER`, `loadTextures`보다 앞)가 `ImageBitmapResource`
  (`alphaMode` PMA → `premultiplyAlpha: 'none'`)로 있는 그대로 디코드한다. 한 atlas 안에서 페이지 종류가 섞인 것은 없어(309개 atlas) 모델 단위 표시로 충분하다.
- 확인: `test/assets.test.js`(페이지 판정, 페이지별 `pma`, 디스크의 모든 오퍼레이터·소환물 atlas가 픽셀 판정과 같은지), `test/render/assets.test.js`
  (`pma` 모델의 로드 인자, 파서 한 번 등록·고르는 조건·`alphaMode`). 얼굴 메시를 CPU로 그려 비교 — A를 두 번 곱하면 두 모델 모두 눈 둘레에 어두운
  고리, 한 번이면 없음. Windows Chrome(GPU): 게임 로더(`loadSpineData`)로 그린 얼굴이 고치기 전에는 straight로 읽은 그림과 같고(최대 차 1–3/255),
  고친 뒤에는 `pma: true`를 지킨 그림과 같다(최대 차 1). 게임 로더 고치기 전·후(Idle 첫 프레임): 스즈란 1223픽셀·수르트 285·W(`enemy_1504_cqbw`)
  1520이 8 넘게 다름(눈·볼 둘레 어두운 선이 사라짐), 원석충은 1픽셀. `RENDER_E2E` `eyemask.browser.test.js`(에이야퍄들라 더 크비트 아스카, `pma`
  모델을 실제 서버 페이지에서) 통과. 관리자가 디버그 아레나와 실제 판에서 스즈란·수르트 눈 둘레를 확인(2026-11-01, 다음 절까지 적용한 뒤).
  [화면 미확인: 실제 판에서 적과 다른 오퍼레이터·소환물의 반투명 가장자리]

## 오퍼레이터 전투 텍스처는 로컬 클라이언트 것 (2026-11-01, 관리자 재제보 「파이어폭스로 보는데 여전히 똑같다」 → 관리자 결정 「클라이언트 텍스처로 바꾼다」)
- 증상: 앞 절의 로더 수정 뒤에도 스즈란·수르트 눈 둘레에 옅은 외곽선이 남았다 — 어두운 고리는 사라졌지만, 눈 모양을 만드는 피부 조각
  (`F_Face_Default_h`·`i`) 테두리를 따라 밝은 선과 점.
- 원인: 웹 오퍼레이터 모델(fexli/ArknightsResource)의 페이지는 클라이언트 텍스처를 따로 다시 압축한 사본이라, 반투명 가장자리의 색·알파가
  클라와 어긋난다(스즈란 앞면: 반투명 텍셀 중 RGB > A + 12가 웹 78 / 클라 11, 피부 조각 가장자리 알파가 클라 86에 웹 107처럼 최대 ~80 차이).
  공식 클라에서 확인: 스즈란의 전투 머티리얼은 `_UseAlphaTex 1`·`_UseBleed 0`(색 텍스처 + `[alpha]` 텍스처, 이미 premultiplied), 셰이더는
  RGB × 정점색, A는 `[alpha]`에서 — 다시 곱하지 않고 알파 컷오프도 없다(`discard`는 `_UseDither`일 때의 화면 디더뿐). 즉 앞 절 수정 뒤 우리 그리기는
  공식과 같고, 차이는 데이터뿐이다. 같은 얼굴을 클라 텍스처로 그리면 외곽선이 없다(Windows Firefox, 8배·1.2배). 웹 페이지의 RGB를 A로
  깎아 봐도(`min(RGB, A)`) 점만 줄고 선은 남았다. skel은 클라와 바이트까지 같고 atlas는 우리가 붙이는 머리 줄만 다르다.
- 적용: 페이지만 클라 것으로 — `tools/local-extract/extract.py OP_PAGE_SUB`가 `data/assets.json` chars의 웹 모델마다 전투 번들
  (`chararts/<charId>.ab` `defaultskin.prefab`의 Front·Back 렌더러, 방향이 없는 모델은 `Spine` 하나)에서 페이지를 적 모델처럼 합쳐(premultiplied)
  `public/assets/local/spine/op/<charId>/<side>/`에 웹 atlas의 페이지 이름으로 쓴다 — 두 atlas의 페이지·영역이 같고 크기가 맞을 때만.
  `assets.js spineEntry`(`localPagesEntry`)는 웹 skel·atlas를 그대로 쓰고 페이지만 그것으로(`pages`, 전용 로드 파서가 premultiplied로 디코드), 한
  페이지가 안 오면 그 페이지만 웹 것으로. 첫 추출(EN 클라): 149명 중 145명·289쪽·32.8 MB(웹 42.0 MB). 탈룰라(`char_4247_oxi`)·토스카
  (`char_4244_tocka`)·`char_1015_aglna2`·`char_4231_clemnt`는 EN 클라에 전투 번들이 없어 웹 페이지 그대로였다.
- CN 클라에서 (2026-11-10): EN에 전투 번들이 없는 넷은 CN 클라의 `chararts/<charId>.ab`에서 같은 방법으로 뽑는다(`--game`을 CN의 번들 폴더로,
  `--only spine/op/<charId>`) — 토스카·안젤리나 더 멜로우 위시·클레멘티아는 기본 설치본(`StreamingAssets`), 레이지 아이언하이드(`char_618_acrbot`, 규정 숨김
  기물)는 핫업데이트본에만 있어 그것으로, 올가(`char_4245_alga`, 규정 기물)는 핫업데이트본으로. 탈룰라는 핫업데이트본(11-08) 앞면 atlas의 영역이 웹 것과 달라(웹 모델은 그 전 판) 앞뒤 모두 기본 설치본에서 —
  웹 skel에 맞는 페이지여야 하므로 영역이 같은 판을 쓴다. 여섯 모두 앞뒤 페이지가 맞음. 레이지 아이언하이드의 `chararts` 번들에는 전투 모델만 있고 일러스트
  (`<charId>_1`·`_2`)가 없어(공식 클라에서 확인) 카드 그림은 웹 초상 그대로.
- 소재 경로: 클라 페이지는 로컬 추출물이라 늘 이 서버가 내준다(배포 때 `deploy.sh`가 복사). 같은 날 함께 고친 다운로드 기록(fetch-assets가 디스크에
  있던 파일의 원천을 기록하지 않아 GitHub 소재 대부분도 이 서버가 내주던 것)은 docs/ASSETS.md(유지되는 파일의 기록) 참고.
- 확인: `test/render/assets.test.js`(`localPagesEntry`, 로컬 페이지·실패 시 웹 페이지 종류별 디코드), `test/local-extract.test.js`(`atlas_regions`·
  `atlas_page_sizes`·작업 목록, 이 컴퓨터의 추출물이 웹 모델 페이지와 이름·개수가 같은지). Windows Firefox 디버그 아레나(직접 띄운 서버): 스즈란·수르트
  페이지가 `/assets/local/spine/op/…`에서 전용 파서로 올라오고, 스즈란 눈·볼 둘레 선이 고치기 전 코드보다 사라짐. 관리자가 디버그 아레나와
  실제 판에서 스즈란·수르트 눈 둘레의 선이 모두 사라진 것을 확인(2026-11-01). [화면 미확인: 실제 판에서 다른 오퍼레이터의 얼굴·반투명 가장자리]

## 적 경로 미리보기 (2026-10-10, 관리자 결정 「공식 卫戍协议에서는 라운드 작전이 시작될 때 적 경로가 실제로 표시됐다」 → 공식대로)
- 공식(EN 공식 클라 — 레벨 데이터 액션이 아니라 SPAWN 액션의 플래그):
  - `Scheduler._DealAction`: SPAWN 액션에 `autoPreviewRoute`(ActionData)가 있으면 PREVIEW_CURSOR(ActionType 1) 액션을 새로 만들어
    같은 경로(`routeIndex`, `useExtraRoute` = 분기에서 왔는지)에 건다 — 시각 = SPAWN 시각(조각 preDelay + 액션 preDelay − 적 `delayToBorn`, 0 미만이면 0)
    − 3초(`PREVIEW_CURSOR_PRE_DELAY`), `count` 2 · `interval` 0.3초(`PREVIEW_CURSOR_COUNT`·`_INTERVAL`) → 아이템 하나 = 커서 하나.
  - 조각의 액션 큐는 시각순 정렬(`_DealFragment` MoveNext, `LegacySort`)되고 `DefaultWaveHandler.ExecuteActionQueue`(MoveNext)가
    「지금까지 지난 시각보다 늦으면 그만큼 기다렸다가」 실행 → 0 이하인 커서는 전투 시작에 바로(두 커서가 겹침).
  - 실행: `Scheduler._DoPreviewCursor`(MoveNext, 커서를 만들고 바로 끝남 — 큐를 막지 않음) → `BattleController.CreatePreviewCursor`:
    경로의 이동 방식으로 `BattleFactory.CreatePreviewCursor`(WalkPreviewCursor/FlyPreviewCursor 프리팹) → `PreviewCursor.Spawn` → 이벤트 `ON_PREVIEW_CURSOR_SPAWND`(24).
    커서는 한 번 달리고 끝(프리팹 `_times` 1) — 반복 없음.
  - 卫戍协议: 라운드 액션은 서버가 보낸 적 목록으로 클라가 만든다(`AutoChessLevelEnemyManager.GenerateSelfBattleEnemyData`,
    `_GenerateActionFromEnemyInfo`, 보스전 `GenerateBossBattleEnemyData`, 联防 `GenerateHelpBattleEnemyData`):
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
  `_DoReplaceLevelDataClient`가 같은 LevelData의 isValid를 끄는 경우까지는 안 봄). ② 적 `delayToBorn`(프리팹 `_delayToBorn`, 0이 아닌 적 5종)은
  우리 스폰 시각에 없으므로 커서도 SPAWN 시각 기준. ③ DISAPPEAR/APPEAR가 있는 경로에서 커서가 어떻게 가는지(보스 경로뿐이라 卫戍协议 일반 라운드엔 없음) —
  선을 거기서 끊는다. ④ 전투의 0초 = 공식 웨이브·조각 시작(둘 다 preDelay 0).
- 확인: `test/match/route-preview.test.js` — 데이터 표시, 커서 시각, 실제 매치 경로(4라운드 `act1autochess_04`: 액션 3 → 0·0.3초, 액션 0 → 9·9.3초)에서 적의 매 틱
  위치가 미리보기 선에서 0.02칸 안, 계획을 읽은 전투와 안 읽은 전투가 매 틱 같음; 联防 1인/2인; 브라우저 커서(한 번씩, 늦게 들어온 화면).
  [실제 판 이상 없음 2026-10-28]

## 보스 경로 미리보기 (2026-10-08, 관리자 제보 → 관리자 요청 「실제 루트를 알 수 없으니 준비기간에 경로를 표시」)
- 2026-10-15부터 **캐주얼 규칙 모드에서만**(관리자 결정, `ui.md` 「규칙 모드 — 클래식·캐주얼」): 클래식 판은 서버가 리더 항목에 `paths`를 싣지 않는다(`server/match/match/views.js nextEnemiesFor`).
- 조사(공식 데이터): 걷는 보스는 가상적: 총(boss_2·9)과 루시안(boss_5)뿐(나머지는 自缚). 경로는 보스 레벨 파일의 체크포인트뿐이고
  (`level_act1autochess_h07_02`·`h08_02` route 6/0, `act2autochess_h07_05` route 8: 출발 (4,10) → 순찰 (3,9) → (2,3) → (5,9), 2인 복제본 (3,11) → (2,17) → (5,11);
  루시안은 같은 세 점 ×5 사이에 MOVE (5,9)), **전장마다 같다**. 칸 사이 길은 그 판 전장의 보스 구역 지형(울타리·벽·늪·상자·토석·나무…) 위에서 클라이언트
  길찾기가 계산한다 — 맵별 경로 표는 클라이언트 표·레벨 파일·PRTS(「卫戍协议：盟约/战场一览」은 전장 그림뿐) 어디에도 없다. 순찰 반복 규칙(PATROL_MOVE)도
  메타데이터 이름(`PatrolMoveCheckpoint`, `IsValidPatrolCheckPoint`, 「PatrolMoveCheckpoint in dead loop」)까지만 봤고 로직은 아직 안 읽음 →
  우리 `bosses.js patrolLoop`(마지막 지점 뒤 첫 구간으로)는 [추정·미조사]. 원본 커뮤니티 제보 29번(`docs/history/0.2.0.md` §25.18.9)은 걸을 수 있는 칸·순서만 확인했다.
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
  공식이 아니라 관리자가 원한 기능)이라 간격은 우리 값이고 맞출 공식 값이 없다(공식 클라 2026-10-10: `ROUTE_SHOWN_INTERVAL` 1.2는 다른 게임 모드
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
- 위 항목들은 [실제 판 이상 없음 2026-10-28].

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
- 위 항목들은 [실제 판 이상 없음 2026-10-28]. 브라우저 테스트 `RENDER_E2E=1 test/render/initialization.browser.test.js`·`SP_E2E=1 test/e2e/coop.e2e.mjs`(联防 필드가 경기 맵을 그림)로 확인한다.

## 공격 모션 (2026-10-10, 관리자 결정 「동작 변경 모두 공식이랑 동일하게」)
근거: 공식 클라 `AbstractAnimatedAbility.UpdatePlaybackSpeed`(재생 속도 = 1 / 클립 배율, 배율 ∈ [0.1, `_maxAnimScale`]) — 규칙과 sim 쪽은 `sim.md` 「일반 공격 타이밍」.
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
    갱신), `test/render/attack-alts.test.js`(아스카론 'swing' 없는 차례 클립). [실제 판 이상 없음 2026-10-28]
- 'swing'은 `interp.js COSMETIC_EVENTS`(늦으면 버림), `shared/protocol.js EV.SWING`. 칸: `['swing', id, windup, kind, base?, face?, combat?]`(docs/SIM.md).
- 테스트: `test/render/attack-swing.test.js`(가짜 PIXI). [실제 판 이상 없음 2026-10-28]
- **요새 근접·원거리 클립** (관리자 제보 2026-10-10: 号角이 원거리 공격에도 저지 시 모션을 씀): 클라 프리팹 `<id>/Modes/<mode>/Body/Attack/`의
  MeleeAttack·BlockedMeleeAttack·BlockedRangedAttack과 RangedAttack은 다른 클립 — 号角 Default `Attack_A`/`Attack_B`, S2 `Skill_2_A_Loop`/`Skill_2_B_Loop`,
  S3 `Skill_3_A_Loop`/`Skill_3_B_Loop`(아래로 배치하면 S3(D) 모드의 원거리 `Skill_Down_3_Loop` — 아래 「아래 방향」), 灰毫 Default `Attack02`/`Attack01`
  (반대로 저지 중에도 원거리 Attack01이었음). 역할 추출(`anim-roles.mjs`)은 첫 클립 하나만 고르므로 `units.js FORTRESS_CLIPS`([근접, 원거리] 쌍)를
  두고, 'swing'·'atk'의 kind(sim `ai.js`: 저지 중이면 'none')로 `spine.js _loopOf`가 고른다. 시뮬의 타격 시점도 같은 구분을 따른다(2026-11-05, `sim.md` 「일반 공격 타이밍」). 혼 S1도 같은 나눔이다(2026-11-05, 공식 클라에서 확인): 스킬 프리팹 `skchr_horn_1`의 MeleeAttack·BlockedMeleeAttack `Skill_1_A`, `RangedAttackGroup/RangedAttack` `Skill_1_B`(아래를 보면 `Skill_Down_1`).
  테스트 `test/render/fortress-clips.test.js`. [실제 판 이상 없음 2026-10-28]

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
- 확인: `test/render/board3d-official-retry.test.js`. [실제 판 이상 없음 2026-10-28] 실제 휴대폰에서 요청 차단 → 절차형 보드 → 공식 씬 복귀.
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

## 이펙트 셰이더 유지 (2026-10-27, 관리자 제보 「전투 중 끊김」, Windows Firefox · GTX 980 · 품질 높음)
- 증상: `?perf=1` 로그에서 평균 fps는 120–160인데 거의 모든 구간에 한 프레임 JS 255–319 ms(`peak js`), 그 몫이 이펙트 층(`fx`). Firefox 프로파일러:
  30초 기록의 100 ms 넘는 멈춤 8번 모두 three.js `onFirstUse`의 `getProgramInfoLog` — 방금 링크한 셰이더 프로그램을 기다림(88–98%).
- 원인: 이펙트는 끝날 때 재질을 dispose하고(`fxplayer.js FxInstance.dispose`), three.js는 마지막 재질이 사라진 프로그램(`WebGLPrograms.releaseProgram`)과
  셰이더 소스 항목(`WebGLShaderCache.remove` — 다음 재질은 새 id를 받아 프로그램 키가 바뀜)을 지운다. 그래서 화면에 이펙트가 없던 순간 다음의 이펙트는
  같은 이펙트 셰이더를 다시 컴파일·링크했다. Chrome은 GPU 프로세스의 프로그램 캐시로 거의 공짜지만 Firefox(ANGLE / D3D11)는 매번 100–300 ms.
- 처리: `fxgame.js ensure` — 변형 목록(`fxplayer.js programVariants`)의 첫 장면(양면 사각형: 빌보드·꼬리·선)을 렌더러 2개가 `compile()`(링크만
  걸어 둠, 기다리지 않음)하고 그 재질들은 버리지 않음(소스 항목 id 유지); `keepPrograms` — 층이 쓴 프로그램마다 사용 횟수를 하나 더해 렌더러가 끝날 때까지 남김.
- 변형: three.js는 재질의 면(`meshSide`: 양면·앞면·뒷면)·스킨 메시(`SkinnedMesh`)·노멀 있는 지오메트리(Rim 셰이더 — `useMeshAttrs`, 정의 `HAS_NORMAL`)마다
  프로그램을 따로 만든다 — 조합은 12개지만 추출된 이펙트가 쓰는 것은 6개(`fxplayer.js PROGRAM_VARIANTS`; 2026-11-16 여섯째 — 테리토리야 범위 구의
  `AlphaBlend(ZWrite)` 림, 양면 + 노멀, 판정 `fxplayer.js meshNormals`): 양면 사각형(197묶음 3,052 프리팹),
  앞면만(21묶음 56 — 적 `pfx_enemy_4·7·11·13·16`, 맵 효과 `pfx_mapeff_7`, 공용 `common_darkdamage_hit` 포함), 뒷면만(9묶음 36), 양면 스킨 메시(6묶음 9:
  글래디아·호시구마·스즈란·미즈키·스카디·스카디 더 커럽팅 하트), Rim 앞면(11묶음 20, 다섯 묶음에 실린 공용 `common_ignite_defense` 포함). 메시 입자도 센 수
  (렌더러 `mode` 4). 처음 쓸 때마다 링크(Chrome 아레나 138–181 ms, 빈 캐시). `test/render/fx-program-variants.test.js`가 추출물 전부를 이 목록과 대조 —
  새 추출에서 다른 조합이 나오면 실패(목록에 더하면 링크 둘 더).
- 준비 단계 미리 링크(`fxgame.js prewarm`, `app.js enterPrepMode`): 층을 준비 단계에서 만들고 나머지 10개(변형 5 × 렌더러 2, 2026-11-16부터)를 0.4 s마다 하나씩 링크
  (`gl.flush()`로 바로 보냄). 전투 중 새 링크 0(Chrome·Firefox; 스킨·Rim·앞면·뒷면 이펙트 각각 확인). **Firefox는 링크 하나가 곧 화면 한 번 멈춤**: WebGL을
  한 스레드에서 처리해 판(Pixi·3D 보드)이 링크를 기다림 — 간격을 둬도 링크당 110–140 ms 프레임, `flush` 없이는 링크가 몰려 540 ms로 뭉침. 그래서 첫 준비
  단계에서 약 3 s 동안 8번 끊김(12개 전부일 때는 9 s 동안 22번) → 배치한 기물·다음 적이 쓰는 변형만 링크하도록 더 좁힐지는 §11 ③. 모두 미리 하면 첫 이펙트가
  그 줄 끝까지 기다림(아레나 로드 1.2 s) — 준비 단계에 둔 까닭.
- 가림 메시도 미리 링크(2026-10-28): 3D 보드의 가림 메시(`fxgame.js makeOccluders`, 깊이만 쓰는 `MeshBasicMaterial`)는 이펙트 셰이더와 다른 프로그램인데
  미리 링크 목록에 없어, 높은 타일·장치 상자가 있는 판에서 층의 첫 이펙트 때(대개 첫 전투, 정예 기물 빛이나 보스 경로 미리보기가 있으면 준비 단계) 렌더러마다
  한 번 링크됐다. 이제 변형 다음 단계 둘(렌더러마다 하나)로 링크(`programs` 12). three.js는 지오메트리에 `position`이 있는지를 프로그램 키에 넣으므로, 만든
  직후의 빈 지오메트리에 자리표시 `position`을 넣어 둔다 — 없으면 미리 링크한 것이 상자가 생긴 뒤 첫 그리기와 키가 달라 한 번 더 링크(측정). 확인: Windows
  Chrome D3D11, 진짜 `createFxLayer`에 높은 타일 하나인 3D 보드 호스트(조사 노트의 `fixcheck.mjs`) — 고치기 전 미리 링크 10 뒤 이펙트 첫 그리기에 새 링크 1,
  고친 뒤 미리 링크 12 뒤 0. 이 링크의 Chrome 비용은 링크당 1–4 ms(이펙트 셰이더 115–138 ms)라 Firefox 끊김도 작을 것으로 보지만 재지 않음 **[화면 미확인]**.
- 스킨 메시 첫 그리기(2026-10-27 고침): 변형을 다 링크해 둬도 스킨 메시 이펙트 첫 그리기가 렌더러마다 한 번 175–188 ms(Firefox; Chrome 144–150)였다.
  원인은 뼈 번호 속성 `skinIndex`가 정수 버퍼(`Uint16BufferAttribute`)인데 three.js 셰이더는 `vec4`(실수)로 읽는 것 — 메시 로더(`FxLibrary.mesh`)가
  `Float32BufferAttribute`로 주자 같은 그리기가 Firefox 11 ms·Chrome 7–8 ms(같은 날 같은 측정으로 되돌려 188 ms 재현). 뼈 번호는 작은 정수라 실수로 정확.
  [추정·엔진: 브라우저 내부라 측정으로 원인 속성만 확정] ANGLE(D3D11)이 정수 입력을 실수로 바꾸는 정점 셰이더를 첫 그리기 때 따로 만드는 것으로 보임 —
  그래서 이펙트 메시 속성은 모두 실수로 둔다(`test/render/fx-program-variants.test.js`가 확인).
- 확인: Windows Chrome·Firefox(puppeteer, 디버그 아레나) `linkProgram` 횟수 — 고치기 전 같은 이펙트를 다시 틀 때마다 +5–10, Firefox 최악 프레임 125–131 ms /
  고친 뒤 +0, 6–13 ms. 실제 판 확인 2026-10-27(관리자 로컬 Firefox 프로파일: 셰이더 대기가 30초에 8번 → 전투 진입 2번(166·157 ms), 그 뒤 없음; 진입 몫은
  준비 단계 미리 링크 전). 미리 링크·5개 변형·실수 뼈 번호 뒤 실제 판(관리자 Firefox 프로파일 89 s, 전투 둘·준비 단계 둘): 셰이더 대기 0, 전투 진입 끊김 없음,
  50 ms 넘는 프레임은 준비 단계로 넘어갈 때 GC 67 ms 하나, 평균 131–151 fps. 스킨 메시 이펙트 실제 판(관리자 Firefox 프로파일 95 s, 스즈란·미즈키·스카디·
  스카디 더 커럽팅 하트, 전투 둘): 스킨 이펙트가 18번 이상 만들어지고 그려졌는데 그 둘레 최악 프레임 6–22 ms, 기록 전체에 50 ms 넘는 프레임 0, 평균
  153–159 fps. 첫 준비 단계(미리 링크 8번)는 두 기록 모두 버퍼 앞부분이 잘려 없음(아레나 측정만).

## 블레이즈 디 이그나이팅 스파크(烛煌) S3 자세 (2026-10-10, 사용자 제보 「S3 켜진 동안 지금의 공격 모션을 계속 유지」)
- 원인: S3 클립 묶음(Skill_3_Begin / Skill_3_Loop / Skill_3_End, 자기 Idle 없음)에서 렌더가 Skill_3_Loop을 공격 클립으로 써서 공격마다 처음부터
  한 번 틀고, 공격 사이(`attackUntil` 뒤)는 기본 Idle로, 클립 끝(`clip.end` = Skill_3_End)도 공격마다 틀었다 — 첫 공격 뒤 S3 자세가 사라짐.
- 공식(클라 charpack `char_1040_blaze2/Modes/S3`): `_replaceAnimPairs` Idle → Skill_3_Loop, 공격 능력 `_animKey ""`(`local-attack-timing.json` S3 anim "",
  wait 0) — S3 동안 Skill_3_Loop이 자세로 계속 돌고 공격은 클립을 바꾸지 않는다.
- 고친 것: `spine.js _stance()`: 스킬이 켜져 있으면 쉬는 클립 = 스킬 루프, 공격 클립 없음
  (swing / windUp / attack이 클립을 안 건드림). 시작 Skill_3_Begin, 끝 Skill_3_End는 그대로. 테스트 `test/render/stance-skill.test.js`. [실제 판 이상 없음 2026-10-28]
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
    폭탄이 클립 없이 지나감). 테스트 `test/render/swire2-signal-clips.test.js`. [실제 판 이상 없음 2026-10-28]
  - 모드 키 = Default 키(평타 클립) + 스킬 클립이 Begin·idle 없는 한 개 → 그 클립은 시전 한 번(스킬 프리팹 시전 능력 `local-skill-cast.json`:
    블레미샤인 S2 `Skill_2`, 스펙터 S1 `Skill_1`, 치우바이 S2 `Skill_2`, 데겐블레허 S1 `Skill_1`(ReplacementSkill), 필라에 S1 `Skill_1`), 공격은 평타 클립.
  - 리드 더 플레임 섀도우 S2는 모드가 없음(공격 = Default `Attack`); 스킬 프리팹 능력이 `Skill_2`를 지속마다 한 번(`cd 20`, `cdKey duration`) — 손 목록.
  - 니어 더 래디언트 나이트 S2: 모드 공격 `Attack_Loop`(Default와 같음), `_replaceAnimPairs` Die → Skill_2_Die(Stun → Die는 안 그림), 스킬 프리팹에
    시전 클립 없음 → 스킬 클립 = 평타(`via: 'attack'`) + `die: 'Skill_2_Die'`.
- 뺀 것: 歌蕾蒂娅(글래디아) S2(모드 `""`이지만 자기 공격 채널 Skill_2_Begin/_Loop/_End로 침, `FIRST_ATTACK_BEGIN`), 모드 키가 평타인 Begin/Loop/End 스킬(울피아누스 S3, 이그제큐터 S1, 우타게 S1) [ASSUMED: 스킬 프리팹이 루프를 채널로 잡음 — 제보 때 확인],
  키 이름이 스킨 키 표로 바뀌는 모드(시 S3 `Skill_3_Attack` → 클립 `Skill3_Attack` 등)는 지금 역할 그대로.
- 구현: `tools/assets/anim-overrides.mjs applyModeAttacks`(fetch-assets가 `data/assets.json` 스킬 역할에 `stance` / `plainAttack`을 닮;
  `MODE_ATTACK_KEEP` 뺄 것, `PLAIN_ATTACK` 모드 없는 것) → `render/spine.js _stance` / `_attackClip`. 테스트 `test/render/stance-skill.test.js`.
  [실제 판 이상 없음 2026-10-28]
- 평타 클립으로 치는 스킬이 공격 중에 끝날 때(2026-11-03, 관리자 제보 「엑시아 S1 사용 시 스탠딩 모션으로 돌아간다」): 엑시아 S1은 다음 공격 한 번이
  스킬인 즉발 스킬이라 그 공격의 타격과 같은 묶음에서 스킬이 꺼진다. 스킬 역할이 평타 `Attack`(`via: 'attack'`)이고 End 클립이 없는데도 `setSkill(false)`가
  기본 클립을 틀어 공격이 타격 순간 Idle로 잘렸다. 지금은 공격 클립을 끝까지 틀고 쉰다(`render/spine.js setSkill`); 자기 End가 있는 스킬은 그대로 End로 닫는다.
  테스트 `test/render/plain-attack-skill-end.test.js`.

## 가상적: 관(假想敌：管) 숨겨진 핵심 모델 위치 (2026-10-10, 사용자 제보 「일반 관은 맞는데 숨겨진 핵심의 관은 왼쪽으로 치우쳐 보인다」, 공식 캡처 없음)
- 찾은 것: 숨겨진 핵심 레벨(act1autochess_h08_03 / _s)은 관(`enemy_9021_acduml_2`)과 가상적: 현을 둘 다 (행 3, 열 9)에 세운다 — 일반 관(h07_03)은 열 10(필드 가운데).
  숨겨진 관 프리팹(enm_pfb_29)은 피격 상자 BoxCollider2D `m_Offset` x 1(일반 0)과 보스 HP 바 `_bossHudOffset` x 1.4(일반 0)만 다르고, Spine 데이터
  (같은 skeletonDataAsset), Graphic 노드(0, −0.2, −0.06 / 0.27), 루트 EnemyGiantBoss의 나머지 값, 레벨 지도(19×21)·카메라 플러그인(없음)은 같다.
  클라에서 모델을 옮기는 장치는 못 찾음(EnemyGiantBoss `_bossHudOffset`은 HUD만).
- [ASSUMED] 사용자 관찰대로 숨겨진 관의 몸·그림자를 한 열 오른쪽(피격 상자 자리, 열 10)에 그린다 — `units.js MODEL_SHIFT`(적 키 → 열 수, 지금 이 하나).
  유닛 위치·HP 바(자기 1.4 오프셋)·선택 영역은 그대로. 현은 같은 경우가 아님(오프셋 없음) — 그대로. 이 모델에 붙는 이펙트·그 모델에서 나가고
  들어오는 궤적·버프 선 끝도 그린 열을 따른다(`fxgame.js mx`; 모델 점 `specialPoint`는 원래 그린 몸을 따름). 테스트 `test/render/model-shift.test.js`. [실제 판 이상 없음 2026-10-28]

## upstream 0.2.3 이식 — 렌더 (2026-10-11)
- **외근 의료(外勤医疗, 전략)의 예비 오퍼레이터-메딕(预备干员-医疗)을 준비 단계에 표시** (upstream PR #451 by @YinqiMargatroid, `9db9f3ce`·`996fede8`; v0.2.4
  `6bfc0827`도 같은 코드): 살아 있는 플레이어 누구든 외근 의료를 가지면 모든 살아 있는 플레이어의 준비 화면·보스전 짝 화면·정찰 화면에 스테이지 자리의
  예비 메딕을 읽기 전용으로 그린다(`m.private.prepMapChars` — `server/match/match/views.js prepMapChars`, `_prepBoardUnits`; 끌기·판매 불가인 `m:<uid>` 뷰,
  `render/app.js`는 그 목록을 보스전 짝 말과 함께 `syncMates`로 넘기기만 함 — app.js 변경 최소, DOM 대체 화면은 `ui/fallbackField.js`). Touch로 바뀌는 것은 전투
  시작 때뿐. 클라 근거: `aceffect_band_61` = `auto_chess_change_map` 두 개(정예 ≤1 → `char_605_cmedic#*` 켬, ≥2 → `char_613_acmedc#*`)가 스테이지의 미리 놓인
  캐릭터(predefine)를 켜고 끄고, `AutoChessBattleDataModel.PrepareForPrepareState`가 말 목록을 비운 뒤 효과를 적용하므로 준비 화면은 늘 예비 메딕,
  `_PrepareForBattleState`가 실제 출전 말로 다시 센다(관리자 노트). 어그로 순서는 `sim.md` 「upstream 0.2.3 이식」. 테스트
  `test/match/touch-prep.test.js`(PR). **[실제 판 이상 없음 2026-10-28]** 준비·보스전 준비(오른쪽 플레이어 거울)·정찰·대체 화면에서 예비 메딕 위치·방향.
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
  `test/render/held-pose.browser.test.js`(RENDER_E2E). **[실제 판 이상 없음 2026-10-28]** 쓰러짐·재배치·빙결·확대·마스크 전환·跃跃 부메랑·DPR 변경·컨텍스트 소실 복구.

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
- 근거: 클라는 이륙을 비행 단위처럼 다룬다 [추정·미조사: 비행 높이 로직을 아직 안 읽음]. 안젤리나 더 멜로우 위시 S3 범위 원(`aglna2_skill_03_range_01`,
  발밑 FOOT 마운트)의 `static_offset`이 (0, −0.414, +0.666) — 발밑에서 0.666칸 아래(바닥 밑), 0.414칸 앞 — 으로, 발이 땅에 있으면 원이 한 칸 아래에 보이고
  (관리자 제보 「원형 이펙트가 약 한 칸 아래 타일에」), 비행 높이에서 시작하면 그녀 칸에 온다(디버그 아레나 확인). 다른 발밑 이펙트의 오프셋은 거의 0이다.
- 코드: 스냅숏 비트 `shared/local.js UF_LIFTOFF`(2048, `server/sim/snapshot.js flagsOf`), `render/units.js` `liftoff` → `hover`, `render/fxgame.js lifted()`의
  발밑 기준점이 이륙한 오퍼레이터면 그 높이를 탄다. (2026-10-21) 비행 적(`units.js flying`: UnitInfo `motion` FLY 또는 스냅숏 UF.FLYING)도 같다 —
  클라의 FOOT·NONE은 엔티티 자리라 비행 높이를 포함하는데 우리는 그 아래 길에 두었다(`test/render/fly-feet-fx.test.js`). [실제 판 이상 없음 2026-10-28]
- golden: 결과는 그대로, 이륙 유닛이 있는 시나리오의 스냅숏 해시만(roster-004·006·025, diy-009·011).

## upstream 0.2.4 이식 — 렌더 (2026-10-11)
- **琳琅诗怀雅(오퍼레이터) 스킬 금화 = 공식 탄환 칸** (upstream PR #450 by @IceCodeNew, `6bfc0827`의 금화 표시를 공식대로 바꿈; 관리자 결정 2026-10-11 「공식대로」):
  1차 이식의 금색 숫자 줄(`CoinPurse`, `[ASSUMED]` 모양)은 걷어냈다. 금화는 그녀의 SP이고 클라는 그 SP를 HP 바 아래 탄환 칸(`char_bullet_bar`)으로 그린다
  (스킬 프리팹 `_showSpAsBulletMode`) — 규칙·근거·칸 수는 `docs/rules/ui.md` 「탄환형 스킬」. upstream의 숫자 줄은 두지 않는다(클라에 그런 표시 없음).
- **샴페인 폭탄(香槟炸弹, 琳琅诗怀雅의 소환물) 원래 스킨 모델** (upstream `6bfc0827`; 관리자 결정 2026-10-11 「받음」): 웹 자료에는 스킨
  `ambienceSynesthesia_4`뿐이라 그동안 그 스킨으로 그렸다. 로컬 클라의 전투 소환물 팩(`pkgrps/btl_pfb_tokens_0.ab`, Front 렌더러)에서 원래 모델을 뽑아
  `tools/local-extract/extract.py TOKEN_SPINES`에 더하고(`--only spine/token/token_10031_swire2_gdtrap`, EN 클라), `fetch-assets --local-spines`로
  `tools/assets/local-token-spines.json`·`data/assets.json tokens[id].spineLocal`에 실음(메타데이터는 upstream 것과 같음). 웹 스킨은 그대로 두어
  `spineEntry`의 `fallback` — 로컬 그림이 없거나 못 읽으면 지금처럼 웹 스킨. 크기는 전과 같이 `TOKEN_MODEL_K` 0.25/0.27. 테스트
  `test/local-token-models.test.js`·`test/local-extract.test.js`(8개). **[실제 판 이상 없음 2026-10-28]** 설치·공격·소멸 클립과 크기.

## Spine 클립 커버리지 (2026-10-12, 관리자 결정 「선발뿐 아니라 기존 오퍼레이터의 누락도 잡게」)
- 배경: 안젤리나 더 멜로우 위시 S2의 `Skill_2_Takeoff_*`가 한 번도 안 틀렸다(`diy.md` 「S2 활공 모션」). 렌더는 모델의 역할(`anims`)과 아래 표에 이름으로
  적힌 클립만 틀고, 그 밖의 클립은 누가 코드에 적기 전에는 영영 안 나온다. 키트 체크리스트(`diy.md` 「연출 대조」, kits README 12번)는 키트를 만지는
  사람만 보므로, 모든 오퍼레이터 모델을 테스트로 전수 대조한다.
- 테스트 `test/render/clip-coverage.test.js`: `data/assets.json chars`의 **모든 오퍼레이터**(상점 기물·예비 오퍼레이터·선발, 146명) 앞·뒤 모델의 클립마다
  렌더가 트는지 본다. 트는 것 = 역할 `idle`·`deploy`·`die`·`attack`·`move`·`stun`·`run`·`skill`/`skills[i]`의 begin·loop·end·idle(`tools/assets/anim-roles.mjs`
  + `anim-overrides.mjs`, 대체 `Idle`·`Die`) + `render/units.js`의 `FORMS[charId]`(형태 전환·替身)·`FORTRESS_CLIPS[charId]`(要塞 근접/원거리 짝).
  나머지는 `test/render/clip-coverage-list.js UNPLAYED`에 상태와 함께 있어야 통과하고, 목록에 있는데 이제 틀거나 없어진 클립도 실패한다(지울 것).
  - 상태: `render: <public/js 아래 파일> <방법>`(역할 밖에서 이름으로 틂 — 그 파일에 클립 이름이 있어야 함, 예: 안젤리나 S2 `UnitView.glide`),
    `none: <근거>`(공식이 이 모드에서 안 틂 / 그릴 필요 없음 — 프리팹 필드·클라 메서드·녹화를 적음), `todo: <묶음> — <자리>`(공식은 트는데 렌더가 아직 안 틂, 아래 묶음 글자).
  - 새 모델·새 키트·매니페스트 재생성(`fetch-assets`)으로 새 클립이 생기면 실패한다 → 공식에서 언제 트는지 찾아 연결하거나(역할·`anim-overrides.mjs`·
    `FORMS`·키트 연출), 근거와 함께 `none`으로 적는다. 찾는 곳과 필드는 `diy.md` 「새 선발 오퍼레이터 키트 체크리스트」 **연출 대조**(선발이 아니어도 같음).
  - 「어느 키도 안 부름」을 생성기가 적어 자동 예외로 두지 않는다(관리자 결정 2026-11-15): 목록의 `none: no client key names it` 45줄은 키 표(능력·모드 짝·스킬 프리팹·스킨 키 표)에
    실제로 없지만, 이 시험을 만든 안젤리나 S2 `Skill_2_Takeoff_*` 셋도 키 표에 없는데 공식은 튼다(吟唱 끝 클립 — 키 표가 공식이 클립을 트는 길을 다 담지 않음). 자동으로 빼면
    그 버그를 숨긴다. 그래서 새 클립은 사람이 근거를 읽고 적는다.
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
- 도중 모드 전환 (2026-11-04, 관리자 제보 「Mon3tr S3는 모델이 바뀌는데 그대로」): Mon3tr S3는 【이동】 착지 때 `monstr_s_3[route]`가 모드 4 `S3_Reborn`
  (`_replaceAnimPairs` Born → `Skill_3_ReStart`, Idle → `Skill_3_Idle`, Die → `Skill_3_End`; 공격·`_combat` `Skill_3_Loop`)으로 바꾸고
  `ForceCharacterAnimatorFaceFront`로 앞모델을 쓴다(뒷모델엔 그 클립이 없음). 키 해석(`anim-keys.mjs`)은 `<모드>_Respawn…`만 이동 뒤 모드로 알아 S3 역할이
  `Skill_3_End`(시작)·`Skill_3_Begin`(공격)이었다 → `<모드>_Reborn…`도 같은 규칙, 이동 뒤 모드의 Born·Die·Stun 짝이 스킬 `deploy`·`die`(스킬 모드가 프리팹
  기본 모드라 `held`여도). 복귀는 같은 버프의 `ModifyAnimatorHookerReplacePair` Born → `Skill_3_Back`(모드 3 `S3_Restore`, 키에 없음 → `SKILL_STATE_CLIPS`
  `deploys.back`). 시뮬은 두 이동에 배치 키 `reborn`·`back`을 붙이고, `units.js FACE_FRONT_DEPLOYS`가 `reborn` 배치부터 스킬이 끝날 때까지 앞모델.
  같은 점검에서 벨로네 S3도: 프리팹 `demetr_s3[switch_mode]`가 모드 3 `S3_Resapwn`(클라 철자)을 고르는데 이름 규칙은 `S3`라 공격이 FlyToTarget의
  `Skill_3_ReStart_Begin`이었다 → 스킬 프리팹의 모드가 `<이름 규칙 모드>_…`(끝·착지·복귀·아래 모드 말고)이면 그것이 이동 뒤 모드, 스킬 능력 클립이
  이동 동작이면 공격 아님(`cast = move`) → 착지 `Skill_3_ReStart_End`, 공격 `Skill_3_Loop_A`/`_B`(직전과 다르게), 대기 `Skill_3_Idle`. 【복귀】 클립은 키의
  `<모드>_Restore` Born 짝이 스킬 `deploys.back`(벨로네·울피아누스 `Skill_3_Back`; 시뮬 배치 키 `back` — 벨로네에 새로).
  시험 `anim-keys.test.js`·`skill-mode-clips.test.js` Mon3tr·벨로네 줄, 목록에서 Mon3tr `Skill_3_Back`·`_Idle`·`_Loop`·`_ReStart`, 벨로네 `Skill_3_Back`·
  `_Idle`·`_Loop_A`·`_Loop_B`·`_ReStart_End` 지움(이 검사는 스킬 역할의 `deploy`도 트는 것으로 셈). 이펙트 쪽과 재발 방지 검사는 fx.md 「선발 벨로네·비이·
  Mon3tr 키트 순간 이펙트」. [화면 미확인]
- 첫 목록(2026-10-12): 46명·105개 `todo`. 힌트는 10-07 EN 클라 추출(스킬 프리팹 anim 컴포넌트·`_animKey`, charpack 모드별 클립 — 관리자 노트)로 붙였다:
  `official <스킬 id | 모드>` 58개(공식이 그 클립을 가리킴 — 누락 가능성 높음, 먼저 볼 것), `no official reference` 38개(버프 템플릿·공식 클라로 찾을 것),
  `CN only` 9개(EN에 없는 오퍼레이터 — CN 필드만, [추정]). 처음부터 `none`으로 확정한 것은 없다.
- 판정(2026-10-14, 관리자 노트 — EN·CN 클라 프리팹·버프 템플릿·클라 메서드): 105개 = 연결 94·`none` 11. `none`은 근거와 함께 목록에 적었고, 역할이 다른
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
    2026-10-21 고르는 법 공식 클라 확인(fx.md 「능력 묶음의 자식·COMBAT 상태 공격」): 维什戴尔·迷迭香은 `_diffFromLastOneIfNotFirst`라 `other`(전엔 `random`),
    AbilityRandomGroup Loop(阿斯卡纶·隐德来希 S3)는 `m_loopIndex`를 먼저 +1 해 읽고 붙을 때마다 0으로 돌아가므로 두 번째 클립부터(`from: 1`), 스킬이
    켜지거나 꺼질 때(모드 전환) 차례를 처음부터 [추정: 모드를 안 바꾸는 스킬도 처음부터]. 伺夜 S3(AbilitySelectableGroup 순차)는 첫 클립부터 그대로;
    望·圣聆初雪 S3(UberAnimationEffectEmitter LOOP)는 2026-10-21 공식 클라: `_CalculatePlayIndex`가 `m_currentIndex`를
    먼저 +1 하고 묶음 수에 닿으면 0, 생성자·`SetData`가 −1로 두므로 첫 시전은 첫 묶음 — 지금 `loop`(`from` 없음) 그대로 맞음. `SetData`가
    언제 다시 불리는지(스킬마다?)는 안 봄 [추정: 렌더처럼 역할 클립이 바뀔 때 처음부터].
  - **C** 첫 공격 begin·공격 end: `ThreePartOneshotAnimation`(`_onlyPlayBeginAnimWhenFirstAttack`, `_endAnimKey`). 공식 클라(2026-10-14, 관리자 노트):
    `InitAnimation`이 배율 = 공격 시간 ÷ (begin(첫 공격일 때만) + oneshot + end)로 셋을 함께 늘이고(`UpdatePlaybackSpeed`가 그 재생 속도를 능력에 줌), 코루틴
    `DoPlayAnimation`이 begin → oneshot 순으로 틀며, 타격은 oneshot 클립의 OnAttack 이벤트를 기다린다 → **첫 공격의 타격은 begin만큼 늦다**. 로스터의 ThreePart
    공격 12명은 모두 첫 공격만 begin(EN charpack 전수, 관리자 노트 `three_part.py`). 구현(같은 날, 렌더만): `anim-overrides.mjs FIRST_ATTACK_BEGIN` → 공격 역할 `firstBegin`
    (斯卡蒂·伺夜는 begin·end도 채움), 스킬 역할 `attackBegin`/`attackEnd`(歌蕾蒂娅 S2 모드의 공격 채널 `Skill_2_Begin`/`_End`, 伺夜 S3 `Skill3_ABC_Idle_Into`).
    `spine.js swing`이 begin을 앞에 붙여 둘을 시뮬의 전딜 안에 함께 압축한다. 첫 공격인지는 시뮬이 정한다(2026-10-14, 관리자 결정 「공식대로 늦춰」):
    시뮬이 그 휘두름의 전딜에 begin을 더하고 'swing' 이벤트 8번째 칸 1로 알린다(`sim.md` 「일반 공격 타이밍」 첫 공격 begin) → `units.js onSwing` → `swing(…, first)`.
    알림이 있으면 스킬 클립의 `firstAttackBegin`(送葬人 S2 모드 `Skill_Right_Begin`), 공격 역할의 `firstBegin` begin, `attackBegin` 순. 시뮬이 시간을 모르는 공격
    채널(歌蕾蒂娅 S2 `attackBegin`)만 예전처럼 공격 모드가 끝난 지 `FIRST_ATTACK_GAP` 0.35 s 넘은 휘두름에 [추정]. 켈시 에스페란타(CN) Default도 목록에. [화면 미확인]
    雪猎 장전(charpack `Attack/Reload` `Reload_Begin`→`Reload_Loop`, 장전 중 공격은 `ReloadAttack` `Reload_Break`→`Attack_Loop`, 다 차면 스킨 믹스 `Reload_End`):
    시뮬의 猎手 장전 상태(`professions.js installHunter`, sim.md 「사냥꾼 장전」)를 형태 `reload`로(fx 'hunterReload', 덜 찬 채 끝나면 `cut` — 猎手 전원,
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
    (`anim-overrides.mjs SKILL_STATE_CLIPS`, `spine.js deploy(key)`) — 乌尔比安 S3 닻으로 `Skill_3_ReStart_A`, 【返回】 `Skill_3_Back`, 닻이 자기 칸이거나 옮길 칸이 없으면
    제자리 【이동】의 `here` → `Skill_3_ReStart_B`(2026-11-07부터 시전 끝의 'deploy' 이벤트로, 전에는 닻을 던질 때 'anchor' fx의 `redeploy`; 어느 노드가 트는지 [추정·미조사: 클라 노드 안 읽음]). 赤刃明霄陈 S2(`_animKey "Skill_2_Begin"`·`_endAnimKey "Skill_2_Disappear"`, 재등장 모드
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
  - **H** 무에나(char_4064_mlynar) 해방자: 기본 모드의 공격 능력이 피해 없는 `Body/AnimAttack`(`_animKey "Idle_2"`)이지만, 공식 판에서는 스킬 밖이면 사거리에 적이
    들어와도 서 있는 `Idle` 그대로다(관리자 제보 2026-10-30). 그래서 스킬 밖 대상 유무로 `Idle_2`를 되풀이하던 형태 `watch`(`ai.js watchForm`, fx 'watch')를
    지웠다 — `Idle_2`는 `clip-coverage-list.js`의 `none`. 이 모드에서 그 능력이 왜 돌지 않는지는 클라에서 보지 않았다.
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
    배열 — 2026-11-16부터 손 표가 아니라 키에서, 아래 「스킬 끝 채널의 루프」). 끝의 당김은 시뮬이 스킬 끝 순간에 하고 렌더는 그때 세 클립을 시작한다
    [추정·화면: 끝 묶음이 스킬 끝 순간에 시작하는지 공식 화면과 나란히 안 봄]. S3 중엔 일반 공격이 없다(2026-10-14 관리자 결정, `sim.md` 「歌蕾蒂娅 S3」) —
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
    모드의 `FirstAttack`(베토치키 S2, 통째로 다른 첫 공격)은 역할의 `signals`로, 시뮬이 그 신호로 알린 휘두름 전체가 그 클립이다(`spine.js swing`, 2026-11-07; 시전 begin 없음, 신호 클립을 휘두름 처음부터 트는 것은 무스 재능 `Attack_2`도 같음, `sim.md` 「일반 공격 타이밍」); `_animKey ""`인 공격 능력이 모드에 그것뿐이면 자세(信仰搅拌机 Sk3).
    시전 begin도 고유 Idle도 없이 모드 공격 클립으로 공격하는 스킬(역할 `modeAttack`, 34개 — 에벤홀츠 S3 `Skill_3_A`·실버애쉬 S3 `Skill` 등)은 시전 순간 클립을 틀지 않고 첫 공격을 기다린다(2026-11-07, `spine.js setSkill`; 전에는 적이 없어도 공격 클립을 한 번 틂. 공식 클라에서 확인: 그 모드 프리팹에 시작 클립 없음, 공식 화면 대조 안 함). 즉발 스킬이 자기 클립을 한 번 트는 것은 그대로.
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
    공격이 이름 추측과 같은 클립일 때만 얹는다 — 다른 것은 기본 모드에 공격이 없는 阵法术师 6명(키는 공격 없음, 역할은 스킬 클립 대체)·玛恩纳 `Idle_2`(공식은 `Idle` 그대로,
    위 H)·丰川祥子 `Combat`(그래서 `COMBAT_CLIPS` 그 줄은 남김)·灰毫 근접/원거리 짝(FORTRESS)뿐이고, 같은 곳은 begin·loop·end가 모두 같다.
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
    유넥티스(선발, 2026-11-04, 공식 클라에서 확인): S3 `skchr_zumama_3`는 `Hensin`(`Skill_2_Begin` 1.5초)을 시작 동작으로 한 번, 공격은 모드 S3의 `Skill_2_Loop`(아래쪽 `Skill_2_Loop_Down`). 전에는 `Skill_2_Begin`을 공격마다 틀었다(`anim-keys.mjs`: `_endAnimKey` 없는 시전도 시작 동작). 평소·S1·S2는 기본 `Idle`(본인)로 쉬고, 로봇 클립(`Skill_2_Idle`·`Skill_2_Loop`, 로봇 `S_*` 슬롯만 보임)은 S3 `Hensin` 뒤에만 — 모드 S3의 애니메이터 훅이 `Idle`→`Skill_2_Idle`, 끝은 스킨 전환 `Skill_2_Idle`→`Idle` = `Skill_2_End`. 2026-11-14 CN 플레이 제보(필드에서 “레이지 아이언하이드” 모습)로 고침: 기본 모드 오브젝트에도 `Idle`→`Skill_2_Idle` 훅 컴포넌트가 있지만 `UnitMode._animatorHooker`가 비어 있어 안 쓰인다 — 공식 클라에서 확인(`Unit.get_animatorHooker`는 지금 모드의 그 필드만 읽음). 추출이 모드 오브젝트의 모든 훅을 읽어 평소 쉬기가 로봇이었다; 이제 모드가 가리키는 훅만(산 `char_264_f12yin` 기본 모드의 빈 `_excludeAnimKeys`도 같은 꼴, 그림은 그대로). 시험 `test/render/spine-idle-slots.test.js`(모든 오퍼레이터·소환물의 쉬는 클립이 배치·공격 클립과 슬롯 절반 이상을 같이 그리는지). [화면 미확인]
    뮤엘시스(`char_249_mlyss`)의 유동체(`token_10030_mlyss_wtrman`, 소환물, 2026-11-14, 공식 클라에서 확인): 토큰 프리팹의 모드 여섯 — 0 Recharge(쓰러진 뒤의 물웅덩이, `Idle`→`Idle_2`) · 1 Default(`Idle`→`Idle_1`, `Die`→`Stun`) · 2 Melee(`A_Idle`·`A_Attack`·저지한 적 `A_Combat`·`A_Stun`) · 3 Range(`B_Idle`·`B_Attack`·`B_Combat`·`B_Stun`·`B_Die`) · 4 Range_S2(공격만 `B_Attack_2`) · 5 Melee_S3(Melee와 같음). 배치는 Recharge에서 나서 `mlyss_wtrman_t_1[trigger]`가 `mlyss_wtrman_switch`(`ReBorn` = 스킨 표 `Start`, 1초)를 시전하고 그 버프가 블랙보드 `mode` 1로 Default로 바꾼다 — 그래서 복사 전에는 `Start` 뒤 `Idle_1`로 쉬고 `Attack`으로 공격한다. 전투 중 복사는 `SwitchToMelee`·`SwitchToRange`(`Change_A`·`Change_B` 0.667초) 뒤 모드 2·3(그녀가 S3·S2 버프를 가지고 있으면 5·4, `mlyss_wtrman_switch_melee`·`_range`), 분열 복제는 `mlyss_wtrman_range[mark]`를 받고 나서 Recharge의 `mlyss_wtrman_switch_range`(`B_Start`)로 Range에 든다. 쓰러짐은 스킨 전환(`_mixSettings`)의 그 모드 쉬기 → `Idle_2` 클립(`Die`·`A_Die`·`B_Die`). 전에는 클립 이름 추측이 Melee의 `A_Idle`을 평소 쉬기로 골라 배치·공격(`Start`·`Attack`, 물 모습)과 다른 몸을 그렸고 복사 뒤에도 클립이 그대로였다. 이제 `anim_keys.py`가 소환물 프리팹의 모드·훅 짝·공격/저지 키·모드 전환 능력과 스킨 표를 읽고(`tokens`), `anim-keys.mjs tokenKeyRoles`가 기본 모드의 `idle`과 나머지 모드의 클립 묶음(`anims.tmodes`: 전환 클립 `change`, 처음 모드에서 드는 클립 `deploy`, 쓰러짐 `die`)을 만들어, `units.js setTokenMode`가 사건 `copy`(전환 클립 뒤)·`split`(곧바로, 태어나는 클립 `B_Start`)에 그 모드를 폼으로 그리고 그녀의 스킬이 도는 동안 `<모드>_S<n>`이 있으면 그것으로(전환 클립 없이) 바꾼다. 분열 복제의 공격 이펙트도 원본 모드로(`fxgame.js copyMode`). 모델이 있는 소환물 13개 중 나머지 12개는 모드가 없거나 모드끼리 그림이 같아 그대로. 키가 없는 기계(클라우드)는 커밋된 `tmodes`를 그대로 둔다. 시험 `test/render/token-modes.test.js`, `spine-idle-slots.test.js`(모드마다 쉬기 ↔ 태어나는·공격 클립). 공식과 다른 점(알고 둠): 2026-11-16부터 시뮬은 쓰러진 유동체를 칸에 남겨 같은 복사로 다시 세우지만(rules/sim.md 「뮤엘시스 유동체의 쓰러짐」, 이펙트는 rules/fx.md 「뮤엘시스 유동체의 쓰러짐·모습 바뀜」), 뷰는 쓰러질 때 사라졌다가 다시 설 때 배치처럼 나타난다 — 공식의 물웅덩이 몸(`Idle_2`)과 `A_Start`·`B_Start` 부활 클립은 아직 안 그림. [화면 미확인]
    비비아나(선발, 2026-11-04, 공식 클라에서 확인): S1 `skchr_vvana_1`은 시작 클립이 없고(`_playSkillBeginAnim` 0), 보통 시전 `S1_Attack2`는 공격 클립(`Attack`, 아래쪽 `Attack_Down`), 충전 둘을 쓰는 시전 `S1_Attack`은 `Skill_1_Attack`(변형 `charged`, 공격이 틂). 모드 `S1`의 `Idle`→`Skill_1_Idle`은 蓄力 상태라 키트 fx `vvanaCharge`의 형태 `charged`로 그린다(들어갈 때 `Skill_1_Begin`). 길이·타격은 세 클립이 같아 전투는 그대로. [화면 미확인]
    비비아나(선발, 2026-11-03): S3의 `vvana_s_3`가 배치 뒤 둘째 시전부터(`vvana_s_3[check]`의 `vvana_s_3_enhance_mark`) 모드 4 S3_2(Attack→`Skill_3_Attack_B`,
    Idle→`Skill_3_Idle_B`, 스킨 믹스로 끝 `Skill_3_End_B`)로, 그 시전은 교체 짝 `Skill_3_Begin_A`→`Skill_3_Begin_B` — 키트 `castVariant` `'later'` + `SKILL_VARIANTS`
    `later`(D의 `_B` 넷 todo를 지움). 이펙트는 `fx.md` 「선발 페넌스·로고스·비비아나 키트 순간 이펙트」. [화면 미확인]
  - **G** 蕾缪安 S2 조준(2026-10-23, 클라 `skchr_lemuen_2` `_playSkillBeginAnim` 0·charpack `Modes/S2/Body/M2Attack` = `Normal` ThreePart `Attack_Begin`/`Attack_Loop` +
    `Aim` 채널 `_default {Skill_2_Begin, Skill_2_Idle, Skill_2_End}`): 시전 클립 없음, 공격은 평소 클립(`'attack'`), 조준 동안만 채널 — 키트가 조준 시작·끝(사격이든 대상을
    잃었든)에 그리지 않는 fx 'lemuenAim' `{ signal: 'aim', on: 1 | 0 }`(골든 fx 개수만 움직임) → `units.js onSignal` → `spine.js holdSignal`(켜면 begin 뒤 loop 유지, 끄면
    end를 스킬 End처럼 끝까지). 역할은 `anim-overrides.mjs SIGNAL_CLIPS`의 값이 `{ begin, loop, end }`인 신호. 그동안은 시전에 `Skill_2_Begin`, 공격마다 `Skill_2_Idle`이었다. [화면 미확인]
  - 평타로 싸우는 스킬(`via: 'attack'`)은 시전·끝 클립이 없다(2026-10-23): 역할이 평타 역할에서 물려받은 begin/end(`Attack_Begin`·`Attack_End`)를 `spine.js _castOf`가
    시전·끝 클립으로 치지 않는다 — 耀骑士临光 S2·远牙 S1/S2·凯尔希·思衡托 S1·蕾缪安 S2가 시전 순간 `Attack_Begin`, 끝에 `Attack_End`를 틀었다(넷 다 스킬 프리팹에
    클립을 트는 능력·`_beginAnim`이 없음). 자기 begin이 따로 있는 `via: 'attack'`(歌蕾蒂娅 S3 `Skill_3_Startup`)은 그대로. [화면 미확인]
  - 데겐블레허 S3 베기 중 모델이 사라지는 것(2026-11-05 확인): 렌더 오류가 아니라 클립 자료다. 클라 능력 `MultiAttack/Damage`·`Pull`이 부르는 `Skill_3_Loop`는 앞·뒤 모델 모두 몸 슬롯을 전부 숨기고 `C_EX_Skill` 슬롯 하나만 남긴다. 디버그 아레나 2배속에서 재생 중 보이는 슬롯을 세면 앞 모델 `Skill_3_Begin` 61~65개, `Skill_3_Loop` 0~1개, `Skill_3_End`에서 다시 65개까지다(뒤 모델 42개 → 0~1개 → 42개). [화면 미확인: 공식 화면과 나란히]
  - **U** 위 방향 `*_Up`: `AbstractAnimatedAbility.GetAnimKey` — 아래·위·기본 순(`_faceToTarget`이면 바라보는 방향, 아니면 배치 방향). 아래 방향 공백과 같은 계열.
    구현(2026-10-14): `*_Up`은 뒷모델에만 있고 렌더는 위를 볼 때만 뒷모델을 쓰므로, `anim-overrides.mjs UP_CLIPS`가 뒷모델 역할에 `up`을 달고 `spine.js _loopOf`
    (즉발 스킬 클립도)가 그것을 튼다 — 送葬人·诗怀雅 `Attack_Up`, 松果 S1 `Skill_1_Up`·S2 `Skill_2_Up`. 아래 방향(`*_Down`, 앞모델)은 위 「아래 방향」(2026-10-23). [화면 미확인]
  - 첫 목록의 `todo`는 2026-10-14에 모두 정리됐다(연결 또는 근거 있는 `none`). 아래 방향 공백도 2026-10-23에 닫음. C의 시뮬 첫 타격 지연은 같은 날 들어감.
- **선발 클립 판정**(2026-11-06): 키트를 더할 때 `todo`로 남긴 18개를 공식 클라의 키(능력·모드 짝·스킬 프리팹·스킨 키 표·믹스·버프 템플릿)로 판정했다. 남은 `todo`는 이네스 `Start_Skill`(보류)뿐이다.
- **필드에 남는 소환물 모드**(2026-11-07, 공식 클라에서 확인, 새 시즌 미틈·로베르타): 체리 3호의 `FORMS`. 전술 포인트(Reborn)는 `Idle` → `Idle_2`, 스킨의 믹스대로 `Die`를 거쳐 들어가며 모델이 그 칸에 남는다(`stands`: 사라지지 않고, 그 모드가 복귀 없이 끝나면 그때 사라짐). 복귀는 `ReBorn` = `Start` 1초이고 그것이 복귀 동작이라 배치 클립을 다시 안 튼다(`quiet`). 잔해(Trash)는 `Idle`·`Start` → `Waste`, `Stun` → `Stun_3`, `Die` 없음. S2(Skill)는 `Idle` → `Skill_Loop`, 믹스 `Skill_Begin`·`Skill_End`. 전자동 스타일러는 평소 `Idle` → `Default`, 대상에게 방어력 버프가 있는 동안 `Idle`(Running), `Die` = `End`. 시험 `test/render/stands-form.test.js`.
- **스킬 끝·대기 클립 추가 판정**(2026-11-06, 공식 클라에서 확인):
  - 체르니 S2 `Skill_2_End`는 스킬 끝이 아니라 `FinalAttack`의 클립이다. `interval`(18.6)초에 키트 신호 `final`(`SIGNAL_CLIPS`)로 튼다. 역할의 `end`는 비운다.
  - 브리지드 S2 `Skill_2_Idle`은 모드 표가 아니라 버프 `brigid_m2_a[init_animation]`의 교체 쌍이다. 아래 방향 `Skill_Down_2_Idle`은 배치 방향(`CheckCharacterDefaultDirection`)으로 고르고, 공격 클립은 바라보는 방향으로 고른다(`down.deployClips`).
  - 클로저 S2·S3 끝은 스킨 전환 표에 아래 방향 쌍(`Skill_Down_2_Idle → Idle = Skill_Down_2_End` 등)만 있다. 아래를 볼 때만 튼다(역할 `endDown`, `anim-keys.mjs`). 오른쪽 `Skill_2_End`·`Skill_3_End`는 어느 키에도 없어 `none`이다.
  - W `Attack_Down`은 어느 키에도 없어 `none`이다.
  - **없는 클립을 찾으면**(공식 클라에서 확인): 클립은 키 표의 이름 그대로 찾는다(`SkeletonData.FindAnimation`은 대소문자까지 같아야 함). 그 모델에 없으면 `SpineAnimator.UpdateAnimationData`가 그 키를 무효로 두고 `PlayAnimation`은 아무것도 안 튼다. 앞·뒷모델은 키 표 하나를 함께 쓴다. 그래서 뒷모델의 다른 철자 `Skill_2_start`(리)·`Skill_3_Restart_Begin`·`_End`(벨로네)는 어느 키도 안 부르고, 그 키를 뒷모델에서 부르면 클립이 안 바뀐다. 렌더의 `has`도 같다.
  - **연결 5명**:
    - 쏜즈: 키 `Attack`이 `Attack_2`, 저지한 적의 `Combat`이 `Attack_1`. 이름 규칙이 번호 순서로 `Attack_1`을 골라 원거리에도 저지 클립을 틀었다. 키에 `Combat` 줄이 있고 이름 규칙이 `attackAny`이면 키의 공격을 쓴다(`anim-keys.mjs overlayKeyRoles`; 시간은 둘 다 1.2초·타격 0.5초로 같아 전투는 안 움직임).
    - 아이린 S3: 순차 묶음 `StartAttack` `Skill_3_Start`(0.267초, 키트의 첫 타격) → `MultiAttack` `Skill_3_Attack`(3.833초). 시뮬의 스킬은 3.5초라 `Skill_3_Attack`은 마지막 타격(3초 프레임) 뒤에 끊긴다.
    - 에벤홀츠: 모드별 `_chargeAnimKey` `Attack_Charge`·`Skill_1_Charge`·`Skill_3_Charge`를 `mysticStore` 신호로(비이와 같은 길).
    - 슈 S3: 적이 없을 때의 공격은 `Heal` 능력 `Skill_3_Attack_2`. 키트의 `performAttack`이 `atk` 신호 `Heal`을 보내고, 렌더는 미리 감기(`windUp`)부터 그 클립을 튼다.
    - 제시카 더 리버레이티드 S3: 포탄 `ExtraBomb` `Skill_3_Skill`(모드 `S3[D]`는 `Skill_Down_3_Skill`). `bombardShell`의 `t`는 비행 시간이라 `attackTurn`을 달아 공격 간격에 맞춘다. 키트가 포탄 뒤 공격 대기를 바로 비우므로 적이 있으면 다음 휘두름이 곧 이 클립을 끊는다. 공식도 그런지는 화면으로 안 봤다. [화면 미확인]
  - **`none` 8개**: 스킨 키 표에만 있고 아무것도 안 부름 — 지마 더 레이징 타이드 `Skill_2_Die`, Mon3tr `Skill_2_End`, 리 `Skill_2_Attack`·`Skill_3_End`(믹스는 모델에 없는 `Skill_End`를 부르고 S3는 퇴장 때까지 감), 유넥티스 `Attack_Down`. 키 표에도 없음 — 쏜즈 `Skill2_1`, 파죰카 `Skill_1_End`(뒷모델 전용). 믹스만 부름 — 벨로네 `Skill_3_End`(S3는 `RespawnEnd`로 날아가 `S3_Restore`의 `Skill_3_Back`으로 돌아오므로 `Skill_3_Idle`에서 `Idle`로 바로 가지 않음). 쏜즈 S3 `Skill2_2`는 앞모델에만 있으나 공격이 `_faceToFront`라 뒷모델을 안 그린다. 시험 `test/render/pick-signal-clips.test.js`. 아레나 2배속으로 쏜즈 원거리·아이린·에벤홀츠 셋·슈 치유·제시카 포탄을 봄. 쏜즈 저지 `Attack_1`은 아레나에서 못 만들어 실제 사건 재생 시험으로만 봄. [화면 미확인]

## 공격 방향 (2026-10-12, 관리자 요청 「공격·스킬 범위 안의 적을 향해 돌아서 공격, 최대 저지 수를 넘겨 뒤에 걸린 적은 뒤를 보며 공격 — 공식 로직대로」)
- 이전: 오퍼레이터는 배치 방향만 봤다(`units.js onAttack` 「operators keep their deploy direction」, research 09 §1.2의 배치 모습을 전투 내내 적용).
  뒤에 걸려 저지된 적도 등을 진 채 쳤고, 이펙트도 배치 방향으로 나갔다.
- 공식(EN 공식 클라, 관리자 노트):
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
    이 모드는 결정론 모드라(`AutoChessUtil._StartBattle`의 GameModeMeta `isDeterministic`) 배속과 상관없이 늘 전투 트윈판(`FaceSwitcher.HardCoded_InternalSwitchAnimation_BattleTweenVersion`)으로 돈다: 0→1 직선 트윈 위의 `Quaternion.Lerp`라 각도가 정규화 보간을 따른다(`turnWidth`). 2배속 이상 + `BattleOptions.IS_LIMIT_FPS`에서 끝으로 건너뛰는 분기는 결정론이 아닌 모드에만 있어 여기서는 돌지 않는다(2026-11-05, 공식 클라에서 확인).
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
    공격이 잡을 대상 [추정·미조사: 키트가 스킬 효과에서 대상을 따로 고르고, 공식은 스킬 능력이 시전 때 찾음].
  - 렌더 `render/face-turn.js`(위 규칙 그대로), `units.js turnToward/turnTo/faceDeploy`, 상태 `view.face {lr, ud, dir4}`: 반전 = `lr`,
    Back 모델 = `ud === 'UP'`(`_wantsBack`), 재배치 때 배치 방향으로 초기화. `app.js faceEvent`가 이벤트의 **이펙트보다 먼저** 돌린다(시전 이펙트가 돈
    방향을 씀 — `fxgame.js facingDir`이 `face.dir4`). 'swing'·시전 'face' 없이 온 'atk'(키트가 따로 내는 공격)는 타격 때 그 대상으로 돈다. 키트의 공격은 시전과 타격이 같은 틱이라, `_faceToTarget`인 능력(모든 키트 공격의 대부분)은 공식과 같다(2026-11-07, 공식 클라에서 확인: `forceAttack`의 능력과 풀 전체 재능·`GeneralAbilities`·`Trigger` 능력 플래그를 훑음). 다른 것은 `forceAttack`의 `face`로 알린다: 이그제큐터 디 엑스 포에데레 재능 1 `Body/Talents/1`과 산크타 믹사파라토 S3 반격 `S3Attack`은 배치 방향, 호시구마 S3 `ChannelingMeleeAttack`은 돌지 않음. 재능 능력 중 나머지 하나 카넬리안 `Talents/1`은 플래그가 모두 0이지만 키트가 'atk'을 내지 않는다. 앞/뒤 모델 교체는 비동기라 휘두르던 클립을 새 모델이 이어 받는다(`spine.js swingElapsed`).
    도는 모습: `units.js turnTo` → `turnS`, `update`가 전투 시간(`animRate`)으로 진행하며 반전 배율에 `face-turn.js turnWidth`(각도의 cos)를 곱하고 절반에서
    `_showFace`(반전·`faceUd` → `_wantsBack`). 논리 방향 `face`(이펙트의 `dir4`)는 공식 `Entity.faceDirection`처럼 돌기 시작할 때 바뀐다. 모델이 아직 안 그려졌으면 즉시.
- 남은 차이: `Entity.FaceTo`는 `isStunned`·`UNMOVABLE`(13)·`UNMOVABLE_PRIVATE`(22)·`isFrozen`·`isLevitate`면 돌지 않는다(2026-11-07, 공식 클라에서 확인). 기절·빙결은 공격이 끊겨 돌 일이 없고 부유는 적만 받는다. `UNMOVABLE`이 오퍼레이터에 걸리는 경우는 [추정·미조사: 버프 템플릿 83개 중 오퍼레이터에 걸리는 것을 안 가림]. 반전 방향 이펙트(`U_OR_D`·`UD_OR_LR`·`FOUR_DIR_FIXED`)는 2026-11-07부터 공식처럼 보이는 모델(`faceToBack`)로 고른다 → fx.md 「이펙트 방향」. 스킬 시전의 대상은 위 스킬 능력 줄의 표시대로다.
  알고 둔 근사: 도는 모습은 세로축 회전을 2D에서 너비(cos)로만 그린다(원근 차이 없음).
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
  「타일이 위에 그려진다」로 보였다(다른 오퍼레이터에게 보였던 같은 증상도 이것으로 본다 [추정·화면: 그 제보들의 화면은 다시 안 봄]).
  고침: 클립마다 첫 재생 동안(최대 6초) 임포스터를 다시 그릴 때 경계를 재서 상자를 넓힌다(줄이지 않음, 모델이 바뀌면 처음부터). 낙하 `Start`는 안 잼(낙하 높이는
  `_renderImpostor`의 배치 여유). 비용: 클립당 첫 재생 동안만 `getLocalBounds`.
- 확인: `test/render/model-point-impostor.test.js`(화면 끝에서도 점이 그 자리로 돌아옴·옛 변환은 0.1칸 넘게 어긋남, 상자가 스킬 자세로 넓어짐·같은 클립은 다시 안 잼·낙하는 안 넓힘),
  실제 판 화면(사막 스테이지, 화면 왼쪽): 청록 불꽃이 얼굴 → 지팡이 머리, 이륙 자세도 상자 안. 디버그 아레나 왼쪽 보기도 지팡이 쪽.

## 아군 기절 모션 (2026-10-14, 관리자 제보 「아군 오퍼레이터가 기절하면 기절 이펙트만 뜨고 모션이 멈춘다」)
근거: 공식 클라 `Character.States.StunState.OnEnter` — 모델에 `"Stun"` 클립이 있으면(`Unit.ContainsAnimation`) 그것을, 없으면 `"Die"`를
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
- 자기 `Stun` 클립의 반복(2026-11-03, 관리자 제보 「버블이 기절하면 특정 모션을 반복한다」): `Unit.PlayAnimation`은 반복 여부를 인자로 받지 않고
  모델 프리팹 `SpineAnimator._animations`의 클립 항목 `loop`을 따른다. 공식 클라에서 확인한 값: `Stun_Begin`이 없는 `Stun`은 `loop` 0 — 버블·위셔델·
  쏜즈 더 로드스타·켈시 에스페란타·로즈몬티스(`Stun`·`Stun_Skill_3`), `Stun_Begin` 뒤의 `Stun`은 `loop` 1 — 스카디 더 커럽팅 하트·시빌라이트 에테르나.
  이전에는 오퍼레이터의 `Stun`을 늘 반복해 버블은 0.87초짜리 쓰러지는 동작을 되풀이했다. 지금 오퍼레이터의 기절은 Begin 없는 `Stun`을 한 번 틀고
  마지막 프레임에 머문다(`spine.js _stunLoops`). 적의 기절 클립은 그대로 반복한다(적 프리팹 값은 안 읽음).
- 테스트: `test/render/stun-fall.test.js`(가짜 PIXI). 화면: 렌더 데모(Windows Chrome)에서 오른쪽을 보는 오퍼레이터 3명이 기절 동안 Die 끝 자세로
  눕고 풀리면 Idle로 섬. 위를 보는 오퍼레이터(앞모습 모델로 바꿈)와 실제 판의 기절은 [실제 판 이상 없음 2026-10-28].

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
- [추정·미조사: 클라 값을 아직 안 읽음] 내려가고 올라오는 속도(발 높이 보간과 같게), HP 바와 몸에 붙는 이펙트도 함께 내려감(비행 `hover`와 같은 처리).
- 물빛 칠(2026-10-14, 관리자 요청 「물빛 칠까지 넣어」): 심해 씬의 모든 Spine은 `Torappu/Spine/Skeleton-AlphaSplit-Water (Z-Distorted)`로 그려진다
  (씬 `HGSceneWaterEffect`, 프로필 `WE_Static_WEProfiles` — act2 m04·act1 m05 같음). 픽셀 셰이더(클라 셰이더): 픽셀의 월드 깊이 z를 모델 기준선 쪽으로
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
  → **판단 (관리자 결정 2026-10-28): WASM으로 옮기지 않는다.** iPhone 12 Pro 솔로 초월 두 판(아래 「진단 보강 2·3」의 로그)에서 시뮬은 실행기
  프레임당 식었을 때 0.1–0.3 ms, 뜨거운 보스전 1.4–2.4 ms로 프레임 간격의 1–5 %다. 나머지(유닛 갱신·이펙트·Pixi 그리기·UI·GPU)는 WebGL·DOM을
  부르는 일이라 WASM으로 옮길 수 없고, 시뮬을 옮기면 서버의 결과 검증(같은 시뮬을 JS로 다시 돌림)과 golden이 JS·WASM 부동소수 결과의 비트 단위
  일치에 걸린다. 메인 스레드에서 시뮬을 빼야 할 때는 같은 JS 코드를 Web Worker에서 돌린다(우선순위는 UI 다시 그리기·유닛 갱신 뒤).
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
- **진단 보강 2** (2026-10-28, 관리자 iPhone 12 Pro 1.5.7 솔로 초월 R1–R15 로그: 준비 단계 `js`가 유닛 수 그대로인데 R10 → R15 3배, `other`가
  R6부터 14–23 ms로 평평 — 무엇이 늘었는지 로그로 못 가름): `perf:` 줄에 넷을 더한다. ① `parts …`: 필드 프레임 JS를 구간별로(보기
  `stats().parts`, `cpuMs`와 같은 이동 평균) — `misc`(카메라·HUD 확대·경로 커서), `b3`(3D 보드 그리기), `tiles`(타일 투영·배경·타일 애니메이션),
  `ev`(전투 이벤트·스냅숏 동기화), `units`(유닛 보기 갱신, 임포스터 그리기 포함), `inf`(活性源石 「!!!」 표시), `hud`(피해 숫자), `status`
  (`syncStatusFx`+`syncGoldenFx`), `fx`(`fxGame.update` 전체), `imp`(임포스터 아틀라스 flush); 합이 `js`보다 작은 몫은 그 앞의 일.
  ② `ui X ms/s (N/s)`: UI 다시 그리기(Preact 묶음 렌더, 켜져 있을 때만 `options.debounceRendering`을 감싸 잼)의 초당 메인 스레드 시간.
  ③ `msg X ms/s (N/s, K kB/s)`: 서버 메시지 처리(`net.js` `rx`: 파싱과 저장소의 동기 리스너)의 초당 시간·개수·크기. 브라우저의 스타일·
  배치·칠하기는 여전히 `other`. ④ `held …`(줄의 마지막 표본, 10초마다): 페이지가 들고 있는 것 — PIXI 표시 객체 수(그려지는 것), 텍스처
  캐시(Texture/BaseTexture), ticker 리스너, 문서 요소 수, 보기 맵(유닛/적 미리 보기/전투에서 사라진 것), 이펙트 층(살아 있는 것/노트/궤적);
  판 동안 줄지 않고 늘기만 하면 누수(보기 `census()`). 그리고 `imp a–b`(임포스터 간격 범위). 글자 표시엔 `ui …ms/s · msg …ms/s` 한 줄.
  측정 기능이지 동작 변경 없음(프레임당 `performance.now()` 12번 더). 테스트 `test/ui/perf-hud.test.js`.
- **진단 보강 3** (2026-10-28, 같은 iPhone의 보강 2 로그: 보스전 마지막 공세 js 28.8 ms 중 이펙트 층 12.6·유닛 갱신 9.6, UI가 전투 중 초당
  13–18번 다시 그림, `other`가 일이 거의 없는 프레임에서도 15 ms 안팎): ① `lost X ms/f @NHz` — 평균 프레임 간격 − 화면 주기(페이지가 열린 뒤
  본 꾸준한 10초 창 — p95 < 중앙값 × 1.25 — 의 중앙값 중 가장 짧은 것; 처음엔 10백분위를 썼는데 iPhone의 프레임 시각이 15·17 ms로 흔들려
  60 Hz를 63–71 Hz로 읽어 `lost`가 1–3 ms 부풀었다, 2026-10-28 2차 로그). `other`는 화면 주기를 기다린 시간까지 포함하므로(60 Hz에서 일이 2 ms인 프레임도 16.7 ms),
  화면이 새 그림을 못 받은 시간은 `lost`로 읽는다. ② `js … (fx X: upd U draw D)` — 이펙트 층을 플레이어 갱신(입자 계산)과 three.js 그리기로
  나눔(`fxGame.stats()`의 두 값, 0.5 ms 미만이면 생략). ③ `ui …: 이름 ms/s/회/s, …` — 다시 그리기 묶음의 뿌리 컴포넌트(자기 상태가 바뀌어 다시
  그려진 컴포넌트, 하위 포함 시간) 상위 3개: Preact의 `options.__b`(내장본의 `_diff`)·`diffed` 훅을 기존 훅(preact/hooks) 앞뒤로 이어 깊이 0의
  컴포넌트를 잼. ④ `top units id [boss] [imp] ms, …` — 10초 동안 `update()`가 가장 오래 걸린 유닛 보기 3개(프레임당 ms, 보스·impostor로 그림 여부),
  `top fx 이름 ms ×개수` — 플레이어 갱신이 가장 오래 걸린 이펙트 3개(프레임당 ms, 프레임당 인스턴스 수; `fxGame.perfTop()`). 측정 기능이지 동작
  변경 없음(유닛·이펙트마다 `performance.now()` 두 번). Windows Chrome 솔로 R1–R2 확인: `ui …: MatchScreen 8.1/4.7, GameScreen 2.4/0.4,
  Countdown 0.7/4`, `top units chess_char_1_12_a 0.2, …`, `top fx … ×0.6`, `lost 0.4 ms/f @161Hz`. 테스트 `test/ui/perf-hud.test.js`.
- **진단 보강 4** (2026-10-30, 관리자 제보: PC 「높음」에서 협동 보스전 이펙트가 기본(절차) 이펙트로 보이고 유닛 움직임이 끊김 — 적응 부하 단계
  2·3(유닛 2프레임에 한 번, 이펙트 「중간」 경로, 단계 3은 일반 공격 공식 이펙트 생략·궤적 절차 탄)과 맞는데 단계가 왜·언제 올랐는지, 공식
  이펙트가 무엇 때문에 빠졌는지 로그로 못 가름): 보기 `census()`(10초마다)에 셋을 더하고 `perf:` 줄에 찍는다. ① `lod a–b (s 0/1/2/3)` — 단계별로
  머문 초(`adaptLoad`가 세는 프레임만: 숨은 페이지·250 ms 넘는 프레임 제외). ② `lod steps 0→1 hh:mm:ss (M ms, worst W ms, N views, battle), …` —
  단계가 바뀐 시각(UTC), 그때의 평균 간격(올림은 약 1초·내림은 약 2초 평균, 「적응 부하 단계」)·올릴 때의 보기의 일 평균(`work`), 올린 느린 구간의 가장 긴 프레임(내릴 때는 없음), 보기 수, 준비/전투; 줄마다 6개까지(`+n`),
  10초에 12개까지. 긴 프레임 몇 개로 오른 것(이펙트 파일·텍스처 첫 올리기)과 계속 느려서 오른 것을 가른다. ③ `fx skip off B, trail C ·
  files F (wait S ms, max X) · lost L · first R · layer 상태 (n tries)`(`first`는 2026-10-31: 꼬리 프리팹이 아직 안 받아져 절차 탄으로 쏜 수 — 일반 공격·스킬
  탄·적, 0이면 안 찍음; rules/fx.md 「보스 정비 때 미리 받기」) — 공식 이펙트가 있는 유닛(오퍼레이터 묶음·적)의 일반 공격 중 이펙트 층이 아직 없을 때 온 것(불러오는 중이면 늦게, 실패·컨텍스트 잃음이면 절차), `MAX_TRAILS`(12) 때문에 절차 탄이 된 궤적,
  처음 받은 이펙트 파일 수와 기다린 시간 합·최대, 잃은 WebGL 컨텍스트, 줄 끝의 층 상태(`on`·`loading`·`off`·`nowebp`·`none`)와 이 페이지의 불러오기
  시도 수(`fxGame.perfSkips()`). 측정 기능이지 동작 변경 없음(궤적 상한 검사가 `trailFull()`로 셈, 공격 이벤트마다 비교 몇 번). Windows Chrome 1600×900
  솔로 R4 전투 CPU ×12 확인: `lod 0–3 (s 15/1/1/14) | lod steps 0→1 … (59 ms, worst 88 ms, 14 views, battle), 1→2 … , 2→3 … | fx skip lod3 17, off 0,
  trail 0 · files 7 (wait 1393 ms, max 303) · layer on (1 tries)`. 테스트 `test/ui/perf-hud.test.js`.
- **진단 보강 5** (2026-10-31, 관리자 iPhone 12 Pro 1.5.10 솔로 「높음」 고정 한 판 로그: 후반 `other` 14–23 ms, 46분 쉬고 이어 해도 그대로 —
  관리자 질문 「GC가 안 돼 쌓이는 이펙트 데이터가 프레임을 떨어뜨리나」를 `held`로는 못 가림): `held`가 세지 않는 GPU 메모리를 `census()`에 더하고
  `perf:` 줄에 `gpu 3d T/G (drawn P %), fx T/G, fxlib T/M/D, spine N (W MB, idle I)`로 찍는다 — 3D 보드 renderer의 GL 텍스처·지오메트리 수와 그 줄
  동안 실제로 그린 프레임 비율(아래 「3D 보드 그대로면 다시 그리지 않기」), 이펙트 층 두 renderer의 GL 텍스처·지오메트리(라이브러리 텍스처 하나가
  두 층에 올라가면 둘), 이펙트 라이브러리(`FxLibrary`: 텍스처·메시·정의 — 판 동안 쌓이고 보기를 부술 때 비움), 스파인 LRU의 골격 수와 추정 무게
  (`spineDataWeight`, idle = 놓았지만 다시 쓸까 남긴 것). `held`처럼 판 동안 한 방향으로만 늘면 누수. 그 판 로그 판단: `held`의 표시 객체·이펙트
  인스턴스·보기·DOM은 단계마다 돌아오고(누수 없음), `other`가 프레임마다 고르게 커서 GC 멈춤(튀는 긴 프레임)이 아니라 GPU 몫 [추정·화면: Safari는
  JS 힙·GPU 시간을 못 읽음]. 측정 기능이지 동작 변경 없음. 테스트 `test/ui/perf-hud.test.js`.

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

## 3D 보드 그대로면 다시 그리지 않기 (2026-10-31, 관리자 iPhone 12 Pro 「높음」 고정 로그: 후반 준비·전투가 GPU 몫(`other`)으로 31–45 fps)
- 3D 보드는 매 프레임 화면 전체(높음: 배율 2, 그림자·환경광·안개)를 다시 그렸다. 이제 `board3d/scene.js render()`가 보드가 보여 주는 것이 바뀔 수
  있을 때만 그리고, 아니면 캔버스가 마지막 그림을 그대로 보인다(WebGL 캔버스는 다시 그리지 않으면 마지막으로 낸 그림을 계속 보임). 그리는 때:
  카메라(`version`)·크기 변화, 다시 짓기(`setStage`·`setArea`·`setBattleRect`·`setQuality`·공식 씬 교체 → `_touch`), 초점 밝기 이동(목표에
  0.002칸 안이면 목표로 맞추고 멈춤), 누출 깜빡임(0으로 돌아온 한 프레임 포함), 그림자 맵 다시 그리기, 전투 장치(`createDevice` 상자 — 매 프레임
  움직임), 배치 색·범위 줄무늬 변화(`TileOverlay.rev`)·활성 오리지늄 이펙트 변화(`InfectionFx.rev`), 그리고 움직이는 재질이 화면에 있을 때(물·늪·
  감염·연무 타일, 공식 씬의 물 `StylizedWater` — `official.js animated`, 범위 줄무늬, 활성 오리지늄 이펙트) 매 프레임. 그래도 1초(`BOARD_REDRAW_MAX_S`,
  그리기 시계)마다 한 번은 그린다 — 검사가 놓친 변화가 있어도 늦어야 1초.
- 효과는 스테이지에 달림: 움직이는 재질이 없는 스테이지(렌더 데모에선 act2autochess_m01)에서 보드 GPU 일이 거의 없어지고, 공식 씬에 물이 있는
  스테이지(act1 전부·act2 m02·m04)와 움직이는 타일이 있는 스테이지(데모의 act2 m03)는 그대로 매 프레임. 같은 그림이 목표: Windows Chrome(GPU) 렌더 데모 act2autochess_m01 준비 1280×720에서 1초에
  1번 그림(나머지 약 150프레임은 그대로). 배율 1(데스크톱)에선 남긴 그림과 새로 그린 그림이 게이트 상자에서 6–17 픽셀·1단계 다르지만, 같은 시각으로 두 번 그려도
  그만큼 다름 — 보드의 MSAA(배율 < 2에서만 켬, `render/app.js` antialias)가 게이트 상자의 겹친 투명 면(가산·알파)을 그릴 때마다 조금 다르게 섞음(MSAA 없는
  배율 2에선 매번 같고, 디더링을 꺼도 그대로). 배율 2(폰과 같은 조건, MSAA 없음)에선 남긴 그림 = 새로 그린 그림(바이트까지 같음).
  보고서 `gpu 3d … (drawn P %)`로 폰에서 비율을 본다. 테스트 `test/render/board3d.test.js`(그대로면 안 그림·바뀌면 그림, 움직이는 재질은 매 프레임).
  [화면 미확인] iPhone Safari에서 `other`가 줄었는지(물 없는 스테이지 준비 단계).

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
  테스트 `test/render/forms.test.js`(PR: A_Idle → setForm 뒤 B_Idle·B_Move·B_Attack·B_Die, 늦은 관전자는 처음부터 B). [실제 판 이상 없음 2026-10-28] 침묵 뒤 B 모델·침묵이 끝나도
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
  [실제 판 이상 없음 2026-10-28] 淤困이 막은 오퍼레이터 칸 중심에 미끄러지지 않고 붙으며 Parasitic 동작 뒤 Idle_2, 막기가 끝나면 Idle·Move.

## upstream 0.2.5–0.3.1 버그 수정 이식 — 렌더 (2026-10-17, 관리자 결정)
upstream v0.2.4 → 0.3.1 사이 버그 수정 커밋 중 우리에게도 있던 렌더 결함.
- **원점이 몸 가운데인 적의 HP바** (upstream `7b4f512c`): 적 HP바·이름표 높이를 setup-pose 상자의 높이(`actor.height` = `bounds.height`)로 잡아, 원점이
  몸 가운데인 모델은 보이는 머리보다 한참 위에 바가 떴다. 이제 원점 위로 뻗은 길이(`bounds.y + bounds.height`, 20…900으로 자름)로 잡는다
  (`render/units.js headTilesForUnit`). 발 기준 모델(y ≈ 0, 대부분)은 거의 안 바뀐다. 우리 `UNIT.modelScale`은 0.0027(upstream 1/320)이라 칸 수가
  upstream 숫자의 0.864배: 롯체이서(逐腐兽)·광기의 롯체이서 1.60 → 0.70칸, 데겐블레허(锏, 보스) 2.20 → 0.96칸, 사냥개 Pro·빅 밥은 변화 0.01칸 미만.
  확인: `test/render/bar-head.test.js`(upstream 판을 실제 `assets.json` 상자·우리 배율로), `test/render/playtest6-enemies.test.js`(합성 상자 높이 390 → 520:
  우리 배율로는 위 240단위면 모든 바가 하한 0.55에 걸려 비교가 안 됨). [실제 판 이상 없음 2026-10-28] 롯체이서의 HP바가 머리 바로 위.
- **처음 그리기 전 기물의 화면 사각형** (upstream `1df530f2`): `view.pieceScreenRect`가 이번 프레임에 만든 유닛의 아직 투영 안 된 (0, 0) 기록으로 사각형을 돌려줘,
  보충(替补) 표시(`screens/game/standInTags.js`)가 한 프레임 캔버스 모서리에 뜰 수 있고 브라우저 시험이 그 자리를 잡았다. 이제 뷰마다 첫 `update`의 투영에서
  `placed`를 켜고(`render/units.js` UnitView·ItemView·DeviceView), 그 전에는 `null`(`render/app.js`). 시험 쪽 `piecePoint`(`test/e2e/client.mjs`,
  `test/ui/real.e2e.test.js`)는 그려지고 멈춘 기물을 2.5 s까지 기다린다. 확인: `test/render/unitview.test.js` 「no screen rect before the first draw」.
  [실제 판 이상 없음 2026-10-28] 보충 오퍼레이터를 사서 벤치에 놓는 순간 「替补」 표시가 모서리에 깜빡이지 않음.
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
  [실제 판 이상 없음 2026-10-28] 전장 #05 공식 씬에서 수상 플랫폼 배가 물에 떠 있고 그 위 오퍼레이터의 발이 갑판에 닿음; 전장 #06의 봉인된 지면 4칸이 공식 씬에 어떻게 보이는지
  (씬 자체 표시가 있는지).
- **스텐실 없을 때 영역 눈알·가는 눈꺼풀** (upstream `43a5b571`, upstream #647): 스텐실 마스크가 꺼지면(붐비는 판·고화질 미만, `render/app.js pickClipping`) 눈꺼풀
  대체 처리(`render/spine.js SpineActor._eyeMaskFallback`, upstream #177 이식 — 위 「upstream 0.2.1·0.2.2 이식 — 렌더」 눈꺼풀)가 가린 슬롯의 중심이 클립 다각형 밖일 때만
  숨겼는데, 영역(region) 눈알은 pixi-spine 본에 없는 `bone.a…d`·`worldX`를 읽어 아예 못 쟀고, 틈처럼 닫히는 눈꺼풀은 중심을 지나 메시 눈알도 남았다 — 에이야퍄들라
  더 크비트 아스카의 깜빡임·S3에서 감은 눈 위로 눈알이 비쳤다. 이제 그린 면적 중 다각형 안 몫으로 정한다(`clipHides`: 1/4 미만이면 숨김, 1/2 이상이면 둠, 그 사이는
  중심; 영역은 `bone.matrix`로 잼; 오목한 클립 안에 통째로 든 슬롯은 둠 — 안젤리나 더 멜로우 위시의 무기 빛). [ASSUMED] 두 몫(1/4·1/2)은 upstream 값, 슬롯
  단위 전부/전무도 그대로 근사. 페페 쓰러짐은 0.13 s → 0.10 s부터 숨김(upstream 기대값 그대로 통과). 확인: `test/render/eyemask.test.js`(합성 골격 — 늘 돎 —, 실제 골격:
  에이야퍄들라 더 크비트 아스카·페페 등, 16건 통과), `test/render/eyemask.browser.test.js`(RENDER_E2E, 스텐실 켬/끔 픽셀 비교 — 안 돌림).
  [실제 판 이상 없음 2026-10-28] 고화질 미만에서 에이야퍄들라 더 크비트 아스카가 깜빡일 때와 S3 동안 눈이 감겨 보임.

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

## 제보 #10 조사 중 찾은 이펙트 계층·리소스 캐시 버그 (2026-10-28, 관리자 요청 「원인과 별개로 확정된 버그 수정」)
제보 #10(보스 전투 흰 화면, 1.5.7)의 원인을 찾다 확정된 버그들. 흰 화면 원인은 아직 모름 — 아래는 그와 별개로 코드·재현으로 확정된 것만.
- **리소스 워커가 캐시의 옛 판을 내줌**: `resource-worker.js answer()`는 캐시에 있으면 목록 해시와 비교하지 않고 내줬고, 옛 항목을 지우는 것은 페이지의
  `resources.js reconcile()`(페이지 시작 뒤 비동기)뿐이었다 → 추출물이 바뀐 배포 뒤 첫 로드에 옛 이펙트 JSON이 나갈 수 있었다. 워커는 새로고침에도
  살아 있고 목록 사본은 최대 5분 옛것이라, 목록 해시를 보는 것만으로도 모자랐다. 이제: 캐시 항목의 `X-SP-Hash`가 목록의 해시와 같을 때만 캐시로
  답하고(다르면 목록대로 다시 받아 캐시를 바꿈, 목록에 없으면 서버로), 페이지 로드(내비게이션)마다 목록을 다시 확인하며 그 확인이 끝날 때까지 캐시 답을
  기다린다(같은 ETag면 다시 읽지 않음). 목록이 없을 때(오프라인·서버에 목록 없음)는 예전처럼 캐시를 내준다. 확인: `test/local-patch.test.js`
  「resource worker: …」(워커를 vm에서 돌림: 옛 판 → 새로 받음, 목록 유효 시간 안엔 마지막 목록, 페이지 로드 뒤 다음 배포의 파일).
- **끝난 이펙트가 공용 버퍼를 지움**(르무엔 일반 공격 꼬리부터 WebGL `INVALID_OPERATION: drawElementsInstanced: no buffer is bound to enabled attribute`,
  S3 중 수백 번 — 그 그리기는 건너뜀 = 이펙트 일부가 안 보임): 입자 시스템의 인스턴스 지오메트리는 공용 사각형 `QUAD`(또는 라이브러리 메시)의 인덱스·위치·uv를
  빌려 쓰는데, three.js는 지오메트리를 dispose하면 그 모든 속성의 GL 버퍼를 지운다 → 시스템 하나가 끝날 때마다 살아 있는 다른 이펙트의 정점 배열 객체가 지워진
  버퍼를 가리켰다. 10-05부터 있던 구조라 1.5.7만의 것은 아님. 이제 `fxplayer.js disposeOwn`이 빌린 속성을 떼고 dispose한다(입자 시스템·추가 메시, 그리고
  dispose하지 않아 새던 메시 노드 지오메트리도). 확인: `test/render/fx-shared-buffers.test.js`, Windows Chrome D3D11 디버그 아레나 르무엔 S3 96 s — WebGL 경고
  515건(고치기 전, Chrome이 「too many errors」로 끊음) → 0건(셰이더 컴파일 경고 1건만).
- **이펙트 계층 내리기 한 곳으로**(`fxgame.js teardown`: 살아 있는 이펙트·텍스처·메시·가림 메시를 풀고 두 컨텍스트를 끊고 캔버스를 뺌). 아래 넷이 이것을 쓴다.
  - **로드 중 `destroy()` → 캔버스 2개·WebGL2 컨텍스트 2개가 샘**: 모듈 로드가 끝나면 계층이 이미 없어도 만들었다(1.5.7부터 준비 단계 `prewarm`이
    `ensure()`를 불러 창이 넓어짐). 이제 내릴 때마다 세대(`gen`)가 바뀌고, 끝난 로드는 세대가 다르면 아무것도 만들지 않는다.
  - **품질 「낮음」이 만든 계층을 안 끔**: `ensure()`가 `if (mod) return true`를 `q() === 'low'`보다 먼저 봤고, 이미 뜬 이펙트·캔버스도 남았다 → 새로고침
    해야 꺼졌다. 이제 「낮음」을 먼저 보고, `update()`가 「낮음」인 동안 계층을 내린다(컨텍스트까지). 다시 높이면 다음 이펙트·준비 단계가 새로 만든다.
  - **이펙트 컨텍스트 손실 처리 없음**(3D 보드만 있었음): 잃은 컨텍스트는 three.js가 복원을 기다리며 아무것도 안 그렸다. 이제 두 캔버스 중 하나라도
    `webglcontextlost`면 계층을 내리고 절차형 이펙트(`render/fx.js`)로 — 3D 보드가 2D 보드로 가는 것과 같은 방향. 복원을 기다리지 않고 다음 준비 단계에
    새로 만드는 쪽은 구현 선택(복원이 안 오는 손실 — 브라우저 컨텍스트 한도 — 도 같은 길로).
  - **로드 한 번 실패 → 그 판 내내 공식 이펙트 꺼짐**(`failed = true`): 이제 실패한 로드는 만든 것을 내리고, 다음 준비 단계(`prewarm`)가 다시 해 본다 —
    컨텍스트 손실과 함께 페이지당 로드 3번까지(`MAX_TRIES`). WebP 없는 브라우저는 그대로 끔. 렌더러가 만들어지기 전에는 캔버스를 DOM에 넣지 않는다.
  - 확인: Windows Chrome D3D11, 빈 호스트에 `createFxLayer`(조사 노트의 `fxfix10.mjs`) — 고치기 전/뒤: `prewarm` 뒤 400 ms에 `destroy()` 남은 컨텍스트 2 → 0
    (300–700 ms 12점 모두 0), 「낮음」 뒤 캔버스 2 → 0(다시 「높음」이면 2), 컨텍스트 하나를 잃게 하면 계속 `loaded`(산 컨텍스트 1) → 내려가고 다음
    준비 단계에 2개 새로, 첫 로드 실패 뒤 다음 준비 단계 다시 시도 안 함 → 됨. `test/render/*.test.js` 1196 통과.
- **관전석은 이펙트 셰이더 미리 링크가 없었음**: 미리 링크(`prewarm`)는 `setPrep` → `enterPrepMode`에서만 불렸는데, 관전석은 `m.private`가 없어 `setPrep`이
  안 불리고 준비 단계를 첫 플레이어의 정찰 보드(`enterBattle`의 `meta.prep`)로 본다 → 전투마다 첫 이펙트 때 링크(Firefox에서 끊김, 184 ms 관찰). 이제
  정찰 보드에 들어갈 때도 `fxGame.prewarm()`(이미 끝났으면 바로 끝남). 판 중간 합류·새로고침은 그대로 첫 사용 때 링크. `stats().fxGame.programs` = 두 렌더러가
  링크한 프로그램 수. 확인: Windows Chrome, 협동 방(나 + AI) + 다른 브라우저 컨텍스트의 관전석(조사 노트의 `spec10.mjs`) — 고치기 전 R1 준비 단계 내내
  `programs` 0, 고친 뒤 라운드 시작~준비 단계에 10(변형 5 × 렌더러 2)까지 400 ms 간격(가림 메시가 더해진 뒤로는 12). Windows Firefox 끊김 재측정은 안 함 **[화면 미확인]**.

## 배포 직후 리소스 캐시 정리·다시 받기와 판 진입 (2026-10-28, 관리자 제공 iPhone 12 Pro 캐시 전환 시험 로그)
관찰: 이펙트 추출물이 바뀐 배포(1.5.6 → 1.5.7, 바뀐 항목 2,961개) 직후 새로고침하고 11 s 뒤 판에 들어가자 그림 도착 14.7 s·필드 표시 15.1 s
(캐시가 따뜻한 판은 2.6 s·6.7 s). 그 판 진입에서 페이지가 받은 것은 0.5 MB뿐이고 오퍼레이터 그림은 두 판이 같은 파일 — 내려받기 크기가 아니라 같은 때 돌던
`resources.js reconcile()`(캐시 키 1만 7천여 개를 대조하며 바뀐 항목을 하나씩 `cache.delete`)과 다시 받기가 같은 Cache Storage를 쓴 탓으로 보인다.
iOS에서 그 경합이 얼마인지는 이 로그로 못 가른다 — 그래서 진단을 먼저 넣고, 화질과 상관없는 쪽만 바꾼다.
- **삭제를 대조에서 뗌**: `reconcile()`은 지울 항목(목록에서 해시가 바뀌었거나 빠진 것)만 모으고, 지우기는 `cleanup()`이 뒤에서 50개씩 100 ms 쉬어 가며 한다.
  판 화면(`selectRoute` = `game`) 동안은 멈춘다. 늦게 지워도 옛 판이 나가지 않는 것은 워커가 목록 해시와 같은 항목만 캐시로 답하기 때문(위 「리소스 워커가
  캐시의 옛 판을 내줌」). 지우기 직전에 다시 본다: 그새 다시 받기가 목록 해시로 바꿨거나(`state`) 워커가 목록 해시로 새로 넣은 항목(`X-SP-Hash`)은 지우지 않고
  받아들인다 — 예전에는 워커가 새로 받은 항목을 옛 `state`만 보고 지워 다시 받았다. 다 못 지운 채 페이지가 닫히면 다음 방문의 대조가 다시 모은다.
- **목록이 그대로면 대조 건너뜀**(2026-10-28, 관리자 제공 iPhone 12 Pro 재측정 로그: 지울 것이 없는데 키 15,207개 대조에 27.5 s): 대조는 페이지를 열 때마다
  캐시 키를 전부 훑는다. 정리가 그 대조의 지울 항목을 다 지우면 목록 판(`browser-resources.json`의 `version` = 목록 전체의 해시)과 음성 언어를 캐시의 표시 항목
  (`/__sp_res_clean__`)에 적고, 다음 로드의 목록 판·음성 언어가 같으면 훑기 없이 `state`만으로 받을 목록을 만든다 — 그새 생길 수 있는 지울 항목이 없으므로.
  대조를 새로 할 때 표시를 먼저 지우므로 정리가 다 못 끝난 채 닫힌 페이지는 다음에 다시 훑는다. 워커가 그때그때 받아 둔 항목은 다시 받기의 첫 확인
  (`fetchOne`의 `X-SP-Hash`)이 받아들인다. `version`이 없는 목록(예전 서버)은 늘 훑는다. 보고서는 `reconcile … (list unchanged)`.
- **원본이 바뀐 외부 파일은 다시 시도하지 않음**(2026-11-15, 관리자 제보: Firefox에서 리소스를 지우고 다시 받자 `[resources] … hash mismatch` 경고 9줄 —
  `ui/bondBoardIcon/4_1.png`, 탈룰라 `char_4247_oxi` 정면·뒷면 등. 목록의 `u`는 브랜치 머리(`@cn`, `main`)라 원본 저장소가 그 경로의 파일을 바꾸면 우리 파일과
  달라진다; 무작위 300개는 모두 같았다). 목록에 `u`가 있는 파일은 미리 받기가 이 서버에서 받지 않는다(그대로). 그 대신 모든 원본이 응답했는데 바이트가 다른
  파일은 캐시 항목 `/__sp_res_differ__`에 목록 해시와 시각을 적고, 목록이 그 파일에 다른 해시를 적거나 7일이 지날 때까지 받을 목록에서 뺀다 — 예전에는 방문마다
  외부에서 받았다 버리고 경고를 다시 찍었다. 한 원본이라도 네트워크로 실패했거나 이 서버 파일(`u` 없음)이 다르면 적지 않고 다음 방문에 다시 시도한다. 게임이 그 파일을
  쓰면 워커가 jsDelivr → GitHub raw → 이 서버 순으로 받아 캐시에 넣는다(그대로). 보고서 `resources:` 줄에 `N changed in asset repo (skipped)`.
  확인: `test/local-patch.test.js` 「resources: an upstream file every source serves with other bytes …」.
- **다시 받기 동시 개수**: 필드를 불러오는 동안 0(`diag.js fieldLoading()`: 가장 최근 필드 마운트가 시작된 지 60 s 안이고, 필드가 아직 안 보였고, 취소되지
  않음 — 간이 보기로 진 경주도 엔진을 계속 받으니 포함), 판 화면의 나머지 1(예전 2), 그 밖 4. 판에 필요한 파일은 어차피 워커가 그때그때 받는다.
- **진단**(설정 → 문제 보고의 보고서):
  - `resources:` 줄 — 마지막 대조의 시각·걸린 시간·키 수·지울 항목·받아들인 항목, 다시 받기 상태(`held (field loading)` / `1 at a time (match)`), 정리(지운 수·남은 수·판 동안 멈춤),
    워커가 답한 수(캐시로 / 캐시에 다른 해시가 있어 다시 받음 / 받음과 MB / 서버로 넘김, 마지막으로 물은 시각). 워커 수는 페이지가 `sp-res-stats` 메시지로
    묻는다(`resources.js askWorker`, 워커가 처음 뜬 뒤 누적). 튕긴 페이지 기록(`prev …`)에도 같은 줄.
  - `mount:` 줄 끝 `res …` — 마운트 시작 때 대조 중인지·다시 받기 대기 수·지울 항목 수, 그리고 시작부터 필드가 보일 때까지(엔진이 지면 그때까지) 워커가 답한 수의
    차이. 예전 `net`은 페이지의 Resource Timing이라 워커가 대신 받은 것은 안 잡혔다.
- 확인: `test/diag.test.js` 「the resource cache …」(줄 모양, 마운트 앞뒤 차이, `fieldLoading`), `test/local-patch.test.js` 「resources: reconcile lists the stale
  entries …」(가짜 Cache Storage: 대조는 안 지움, 판 동안 정리 멈춤, 바뀐·빠진 항목만 지우고 워커가 바꾼 항목은 받아들임), 「resources: a load with the list …」
  (같은 목록은 안 훑음, 배포로 목록이 바뀌면 훑고 정리가 끝날 때까지 표시 없음, `version` 없는 목록은 늘 훑음)와 「resource worker …」 끝의 응답 수.
- **[화면 미확인]**: 폰에서 배포 직후 첫 판 진입의 그림 도착이 줄었는지 — 이펙트 추출물이 바뀐 다음 배포(또는 시험 주소의 판 전환) 뒤 같은 경로(새로고침 → 바로 판)로
  보고서의 `resources:`·`mount: … res` 줄과 `arrived: art` 시간을 본다.

## 적응 부하 단계 (2026-10-30, 관리자 제보: PC Firefox 「높음」 협동 보스전에서 이펙트가 기본 이펙트로, 유닛 움직임이 끊김)
필드 보기가 프레임을 못 따라갈 때 일을 줄이는 단계 0–3(`render/app.js adaptLoad`, 판정은 `render/load-level.js`). 단계 ≥ 1: 작고 먼 유닛 2프레임에 한 번,
≥ 2: Spine 유닛 impostor 기준이 낮아지고(`pickImpostorInterval`, 기준 = 품질 기준 ÷ (1 + 단계), 간격 최대 6) 이펙트 「높음」이 「중간」 경로,
3: impostor 기준이 한 번 더 낮아지고 절차 입자 상한이 품질 상한의 40 %(`render/fx/particles.js LOAD_PARTICLES`), 이펙트 층을 두 프레임에 한 번 갱신·그리기
(아래 「단계 3 = 이펙트 층 격프레임」), 20 s 이어지면 자동 화면 품질이 「중간」(아래).
어느 단계도 공식 이펙트를 빼지 않는다(관리자 결정 2026-11-14, 아래 「단계 3도 공식 이펙트를 빼지 않음」 — 그 전의 단계 3은 일반 공격의 공식 이펙트를
건너뛰고 공식 궤적 대신 절차 탄을 쏘았다). 공식에 없는 우리 장치다.
- **판정을 시간 기준으로**(2026-10-30): 예전엔 보기의 프레임 간격 이동 평균(프레임 10개, `frameMs`)이 19.5 ms를 넘는 시간이 1초면 올리고, 17.6 ms 밑이
  `6 × 단계`초 끊김 없이 이어지면 내렸다. 프레임 10개는 60 Hz에서 0.17 s지만 160 Hz에서 0.06 s라 긴 프레임 몇 개로도 넘고, 넘을 때마다 내림 셈이 0으로
  돌아갔다 — 관리자 PC(2560×1307 @1.5x, 160 Hz) Firefox에서 카시미어(맹약) 최대 협동 보스전이 전투 시작 4–5초에 3초 만에 0 → 3, 그 뒤 평균 86–108 fps인데도
  결과 화면까지 3·간격 3(64–86 fps에서 애니메이션 초당 약 21–29번), 일반 공격 141번이 기본 이펙트였다(같은 판 Chrome은 가장 느린 1초 77 fps로 단계 0).
  이제 올림은 최근 약 1초의 평균 간격(`meanWindow(1)`: 프레임마다 개수와 길이를 e^(−dt/τ)로 잊는 프레임 평균 — 긴 프레임도 한 번만 셈)이 19.5 ms를 넘는
  시간이 `upAfter[단계]` = 1·2·3초, 내림은 최근 약 2초 평균(`meanWindow(2)`)이 17.6 ms 밑인 시간이 `6 × 단계`초(보기 8개 이하면 2초)일 때다. 짧은 튐은 1초
  평균을 19.5 ms 위로 못 올리므로 내림 셈을 지우지 않는다. 숨은 페이지·250 ms 넘는 프레임은 예전처럼 안 셈. 숫자는 우리가 정한 값(관리자 결정 2026-10-30).
- **보기 자신의 일이 느림의 몫일 때만 올림**(2026-10-30, 같은 PC Firefox 재측정: 마지막 공세는 단계 0이었는데, 끝난 직후 R15 시작과 결과 화면에서
  프레임 26–43 ms인데 필드 JS 2.8–3.7 ms뿐인 구간이 단계를 2·3으로 올림 — 브라우저 가비지 수거로 보임 [추정·화면]): 단계는 보기의 일(유닛 갱신·일반 공격
  이펙트·impostor)만 줄이므로, 느린 구간은 최근 약 1초의 「보기의 일」 평균(직전 프레임의 필드 JS + PIXI 그리기, `meanOf(1)`)이 평균 간격의
  `workShare` = 40 % 이상일 때만 센다. 느린데 보기의 일이 그보다 작으면 셈을 처음부터(관리자 결정 2026-10-30). 숨은 핵심 첫 몰림(JS 16.9 / 34 ms)처럼
  우리 일이 큰 느림은 그대로 올린다. 뜨거운 폰은 JS 몫이 커서 그대로; GPU에 묶인 폰(JS 4–5 ms에 `other` 12–15 ms)은 덜 오른다 — 그 경우는 원래 단계가
  효과가 없었다(관리자 iPhone 联防 관전 측정: 부하 단계 3 고정에도 GPU 몫 그대로). 보고서 `lod steps`의 올림에 `work M ms`.
- **폰에서 달라지는 것**: 계속 느린 기기(60 Hz 30 fps)는 단계 1까지 약 1–1.5초(예전 1초), 3까지 약 6–7초(예전 3초). 자동 화면 품질(아래)의 판정은 그대로
  보기의 `frameMs`·`cpuMs`와 이 단계를 쓴다.
- 확인: `test/render/load-level.test.js`(60·160 Hz 같은 평균, 30 fps 폰 1·2·3초 간격, 160 Hz 86–108 fps + 초당 긴 프레임 3개는 단계 0, 전투 시작 3초 몰림은 1단계 뒤
  복귀, 단계 3에서 86 fps로 회복하면 0까지 내려옴, 유닛 적은 필드). Windows Chrome 협동 보스(카시미어 최대) 판 단계 0 유지. **[화면 미확인]**: 관리자 PC
  Firefox의 같은 판 — `lod steps`가 몰림에서 1단계 이하, 숨은 핵심·결과 화면에서 단계 0인지(A만 넣은 재측정: 마지막 공세 0,
  R15 시작·결과 화면 2–3 → 위 「보기 자신의 일」로 고침).
- **단계 3이 빼는 것은 일반 공격 것뿐 — 오퍼레이터 관문 전수**(2026-11-14, [#13](https://github.com/LazyDeltaLima/Myeongto-Replica/issues/13) 뒤; 같은 날 아래 줄로 관문이 모두 없어짐): 이펙트
  층(`fxgame.js`)에 처음 단계 3을 넣을 때(일반 공격의 시작·타격만)와 달리, 그 뒤 붙은 스킬 경로 여럿이 `level() >= 3`만 보고 스킬 것까지 건너뛰었다 —
  길고 붐비는 보스 라운드는 단계 3에 머물러 그때의 시전이 안 보인다(탈룰라 S3 簇火가 #13). 오퍼레이터 쪽 관문을 전부 보고 나눴다:
  스킬 전용이라 관문을 뺀 곳 — `svashBird`(실버애쉬 더 레인프로스트 S3 독수리), `chainFx`(패신저 S3 폭풍의 사슬 `'lightning'`), `skillShotOut`(스킬 자신의
  탄: 메테오 S2 `'volley'` 등), `caperSecond`(케이퍼 S2의 두 번째 부메랑), `planShots`(키트 계획의 날아가는 탄: 토스카 S3·로고스 S1·
  비이 저장 에너지 — 특성·재능 것도 있으나 절차 대체가 없어 빼면 아무것도 안 보이므로 늘 그림); 일반 공격과 스킬 공격이 같이 지나가 스킬 중(`_fxSkillOn`)이면
  그리게 한 곳 — `beginCast`(공격의 시전 이펙트, 스킬 모드 것과 `skillCastTgtFx`가 여기 `skip`을 따름), `trailShot`(공격 탄의 공식 궤적), `droneShot`(드론 탄·
  고정 드론 타격: 쉐라 S2 등), 연쇄 공격의 줄(`chainHop`). 처음부터 맞던 곳: `attackHit`·`shotHitFx`·`shotStartFx`·`countSkip`. 확인:
  `test/render/lod3-skill-fx.test.js`(단계 0과 3이 같은 프리팹 — 고치기 전 코드에서 여섯 다 실패 확인).
- **단계 3도 공식 이펙트를 빼지 않음**(관리자 결정 2026-11-14, 관리자의 부하 측정): 단계 3에서 일반 공격의 공식 이펙트를 빼서 얻는 것이 거의 없었다.
  렌더 데모의 붐비는 보스전 녹화(살아 있는 이펙트 약 55개·그리기 약 275번, Windows Chrome 휴대폰 화면 844×390 @3x, 품질 「높음」)에서 빼면 새로 생기는
  이펙트는 31 % 줄지만(초당 36 → 25개) 살아 있는 이펙트 5 %·그리기 호출 3 %·입자 4 %만 줄고, CPU에 묶인 조건(CPU 스로틀 ×3)에서 이펙트 층 −3 %, 프레임 JS
  80.5 대 80.7 ms(차이 없음) — 일반 공격 이펙트는 짧고 가벼우며 무거운 것은 스킬 이펙트다. 일반 공격이 많은 일반 라운드도 프레임 JS 0.1 ms. 그래서 이펙트 층
  (`fxgame.js`)의 단계 관문을 오퍼레이터·적 모두 없앴다: 오퍼레이터의 `beginCast`·`trailShot`·`droneShot`·`chainHop`·`attackHit`·`shotHitFx`·`shotStartFx`·
  토가와 사키코의 음표(`notesOn`), 적의 일반 공격 타격(`a.epart`)·탄(`eshotFx`·`eshotBlast`·`elineFx`·`emortarFx`·`dshellFx`·`beam` 대체)·능력(`eskillHit`·
  `espellBlast`·`eblinkFx`·`ebreathFx`·`eshellRide`·`soulFx`·`acBossFx`·`eprojTelegraph`·`ekitHitFx`·`esplitFx`·쓰러짐 `FORM_HELD_SKILLS`), 스테이지 장치
  (`cannonBlast`·대포 탄). 이제 이펙트 층이 단계를 보는 곳은 단계 ≥ 2의 「중간」 경로 하나다. 절차 탄은 꼬리 파일을 받는 동안과 `MAX_TRAILS` 초과 때만 남는다.
  `perf:` 줄의 `fx skip`에서 `lod3` 수가 빠졌다(늘 0). 확인: `test/render/lod3-skill-fx.test.js`(일반 공격도 단계 0과 3이 같은 프리팹·같은 꼬리, 이펙트 층이
  단계를 「중간」 경로에만 씀)·`test/render/cannon-fx.test.js`(대포의 시전·탄·폭발·타격이 단계 0과 3에서 같음) — 고치기 전 코드에서 셋 다 실패 확인.
  [화면 미확인] 휴대폰 보스전 `perf:` 줄의 `fx upd/draw`가 늘었는지(측정으로는 이펙트 층 +3 % 안팎).

- **단계 3 = 이펙트 층 격프레임**(관리자 결정 2026-11-14, 잠정 — 관리자가 화면을 본 뒤 정함): 이펙트 층 시간의 약 70 %가 three.js의 그리기 제출이라
  (붐비는 보스전 한 프레임에 이펙트 그리기 약 275번, 프레임 전체 그리기의 88 %) 그림을 빼지 않고 줄일 길은 그리는 횟수다. 단계 3이면 이펙트 층
  (`fxgame.js update`: 단계 함수·입자 갱신·그리기)이 두 프레임에 한 번 돌고, 건너뛴 프레임의 시간을 합쳐 한 번에 나아간다(`fxFrameGate`) — 이펙트는 전부
  나오고 입자 수도 그대로, 움직임만 화면 주사율의 절반(60 Hz 폰이면 30번). 건너뛴 프레임엔 이펙트 캔버스가 직전 그림을 그대로 보인다(WebGL 캔버스는
  다시 그리지 않으면 마지막 그림을 유지). 그래서 걷는 유닛에 붙은 이펙트가 한 프레임 늦게 따라간다. 카메라(`Camera.version`)나 화면 크기가 바뀐 프레임은
  바로 그린다 — 끌어 옮기거나 확대하는 동안 이펙트가 보드와 미끄러지지 않게. 이펙트 층의 시계(`clockS`)는 건너뛴 프레임에도 나아간다: 두 그림 사이에 온
  사건이 제 틱을 갖도록(폭발 틱의 'dmg', 같은 틱의 탄생). `clear()`가 판정을 새로 만들고, 시험용 `dry` 층은 늘 매 프레임. 성능 표시의 `fx upd/draw`는
  건너뛴 프레임을 0으로 세는 프레임 평균. 측정(Windows Chrome, 렌더 데모 보스전 녹화 `boss-m02` 게임 시각 20–36 s, 휴대폰 화면 844×390 @3x, 「높음」,
  CPU 스로틀 ×3, 같은 사본 두 벌을 번갈아 두 바퀴 — 바퀴마다 PC 부하가 달라 같은 바퀴의 단계 0과 견줌): 단계 3 ÷ 단계 0이 이펙트 층 0.82·0.76 → 0.41·0.41
  (약 −48 %), 프레임 JS 0.78·0.69 → 0.50·0.47(약 −34 %), fps 배수 1.47·1.71 → 2.22·2.31. 확인: `test/render/fx-frame-gate.test.js`(단계 0–2는 매 프레임,
  단계 3은 둘에 하나를 합친 시간으로·잃는 시간 없음, 카메라·크기 변화는 바로, 단계가 내려가도 건너뛴 시간 유지, 시계는 판정 전에 매 프레임).
  [화면 미확인] 탄 궤적·빠른 타격이 끊겨 보이는지 — 끊겨 보이면 갱신만 격프레임(그리기는 매 프레임)이나 단계 3이 20초 이어질 때만으로 좁힐 수 있다.

## 이펙트 그리기 전용 경로 (2026-11-15, 관리자 요청 「그림을 빼지 않고 부하 줄이기」의 부하 연구 C, 공식에 없는 우리 장치)
이펙트 캔버스 둘(`fxgame.js`의 아래·위 층)의 그리기를 three.js의 범용 경로(`renderer.render`) 대신 `render/fxsubmit.js FxSubmit`이 제출한다. 그림은 같다
(아래 확인 — 픽셀 0 차이가 조건). 붐비는 보스전에서 이펙트 층은 한 프레임에 약 300번 그리고 그리기마다 재질이 따로라, three.js가 그리기마다 재질의 uniform
약 55개를 훑고(`WebGLUniforms.upload`, `setProgram` 시간의 75 %) 프로그램 키·정점 묶음을 다시 확인했다 — 이펙트 층 시간의 약 70 %, 그중 WebGL 호출 자체는 13 %.
- **프로그램**: three.js가 이 렌더러에 컴파일한 이펙트 프로그램(`PROGRAM_VARIANTS`)의 원문을 컨텍스트에서 읽어(`getShaderSource`) 재질의 일반 uniform
  (행렬 빼고)만 std140 블록 `FxDraw` 하나로 옮겨 다시 링크(`blockSource`). 한 패스가 모든 그리기의 블록을 버퍼 하나에 채워 올리고, 그리기는 제 범위만 묶는다.
  샘플러는 고정 단위의 uniform, **행렬(`modelMatrix`·`modelViewMatrix`·`normalMatrix`·재질 `uSys`)은 일반 uniform**으로 그리기마다(값이 바뀔 때만) —
  블록에 넣으면 셰이더 계산이 달라졌다(Windows Chrome ANGLE/D3D11: 프레임마다 몇 픽셀 1–4/255; 블록 없이 같은 원문이면 0, 행렬만 빼면 0, 물체 mat4 둘을
  다시 넣으면 다시 1/255). 면(`FLIP_SIDED`·`DOUBLE_SIDED`)은 셰이더가 읽지 않아(원문으로 확인, 읽게 되면 three.js로) 프로그램 둘(노멀 없음·있음) + 가림 메시용 하나.
- **그리기 목록은 three.js의 것 그대로**: 같은 순회(visible·layers·frustum), 같은 정렬(`WebGLRenderList`의 `painterSortStable`·`reversePainterSortStable`,
  깊이 `z`는 물체 자신의 경계구가 있으면 그것(스킨 메시) 아니면 지오메트리의 것), 불투명(가림 메시) 다음 투명, 양면 투명 재질은 뒷면 패스 → 앞면 패스
  (`renderObject`), `onBeforeRender`도 같은 때. 정점 버퍼·VAO는 이 모듈 것(three.js는 제 것을 감춤)이고 올리는 규칙은 `WebGLAttributes`대로(통째, 또는 합친
  `updateRanges`), 텍스처는 three.js 것(`properties`·`initTexture`), GL 상태는 three.js의 상태 캐시(`state.setMaterial`·`useProgram`·`bindTexture`)로.
- **스킨 메시**는 three.js가 그 자리에서 혼자 그린다(`drawThree`: 자식을 잠시 떼고 `renderer.render(object)`), 앞뒤로 상태 캐시를 맞춤. 이 모듈이 못 그리는
  것(다른 재질·선·인스턴스 메시·아직 링크 안 된 프로그램)이 있는 패스는 그 프레임만 통째로 three.js. 이 모듈이 그린 뒤 three.js를 부를 때는 먼저
  `resetState`(three.js는 여기서 묶은 VAO를 모름).
- **미리 링크**: `prewarm`이 three.js 변형·가림 메시 다음에 이 모듈의 프로그램을 렌더러마다 한 단계에 하나씩(Firefox는 링크 하나 = 화면 한 번 멈춤, 위 「이펙트
  셰이더 유지」). 준비 단계 없이 들어온 판은 첫 그리기 때 링크하고 그동안 three.js로 그린다(Chrome은 병렬 링크라 안 멈춤; Firefox는 three.js 자신의 첫 사용과 같음).
- **개발 스위치** `globalThis.__SP_FX_SUBMIT__`: `false` = three.js로(예전 그대로, 비교용), `'check'` = 패스마다 three.js와 이 모듈로 각각 지운 캔버스에 그려
  픽셀 비교(`view.stats().fxGame.submit[].checks`). `stats().fxGame.submit`에 캔버스별 직접 그린 패스·three.js로 간 패스와 까닭.
- **재발 방지**: `test/render/fx-submit.browser.test.js`(RENDER_E2E, Windows Chrome) — 추출 기본 스킨 이펙트 전부를 세 프레임씩 three.js와 이 모듈로 그려 픽셀
  0 차이, 실제로 이 모듈이 그렸는지·스킨 메시가 제자리 경로로 갔는지도 확인. 2026-11-15 이펙트 3,866개·포착 11,598번 0 차이(스킨 메시의 깊이를 지오메트리
  경계구로 잡았을 때는 호시구마 S3·미즈키 S2·에단 공격 버프의 포착 11번이 달랐다 — 이 시험이 잡음). `test/render/fx-submit.test.js`(원문 고쳐 쓰기).
  게임 경로: 렌더 데모 보스전(`boss-m02` 게임 시각 20–28 s, 휴대폰 화면 @3x 「높음」) `'check'`로 캔버스마다 약 350–550 패스 0 차이.
- **절약**(같은 장면, Windows Chrome, 데스크톱 CPU, 스위치로 번갈아 3바퀴 평균): CPU에 묶인 조건(CPU 스로틀 ×3)에서 이펙트 층 단계 0 −24 %, 단계 3 −26 %
  (13.0 → 9.7 ms, 프레임 JS −18 %, fps +21 %); 스로틀 없이 −15 ~ −17 %. 연구의 어림(−40 ~ −48 %)에 못 미친다 — 남은 몫은 그리기마다 블록 채우기·행렬
  uniform·VAO 확인·버퍼 올리기와 장면 행렬 갱신(three.js도 하던 것), 그리고 입자 갱신(그리기 밖, 이펙트 층의 약 30 %).
  위 「단계 3 = 이펙트 층 격프레임」과 함께(같은 측정): 단계 3 이펙트 층 13.0(둘 다 없음) → 7.3(격프레임만) → 5.3 ms(둘 다, −59 %; 격프레임만보다 −27 %),
  프레임 JS 20.9 → 14.2 → 11.8 ms, fps 42.7 → 61.5 → 72.7; 스로틀 없이 2.42 → 1.37 → 1.15 ms.
- [화면 미확인] 휴대폰(iOS Metal·안드로이드 GL 드라이버)에서도 0 차이인지 — 확인은 D3D11뿐. 행렬처럼 다른 백엔드에서 블록이 계산을 바꾸면 그림이 몇 픽셀
  1–4/255 다를 수 있다(폰에서 원격 개발자 도구로 `__SP_FX_SUBMIT__ = 'check'`).

## 프레임 상한 (관리자 결정 2026-11-06, 공식에 없는 설정)

- 설정 → 화면 「帧率上限」(없음·30·60·120, 기본 없음; `FRAME_LIMITS`, `frameLimit`). 필드 보기의 `app.ticker.maxFPS`만 바꾼다(`render/app.js setFrameLimit`). 전투는 자기 시계로 돌므로(`battle/runner.js`) 그려지는 횟수만 달라지고 결과는 같다.
- 60 미만 상한은 판정선을 함께 옮긴다(`render/load-level.js frameScale`: 30이면 2배): 적응 부하 단계의 `slowMs`·`fastMs`, 자동 화면 품질의 `calmFrameMs`. 이것이 없으면 30을 잘 지키는 기기가 「느린 기기」가 되어 단계가 오르고, 자동 품질이 `높음`으로 돌아오지 못한다. 60 이상은 그대로. `calmJsMs`는 옮기지 않는다(프레임의 JS 시간은 상한과 무관).
- 측정(Windows Chrome GPU, 160 Hz 모니터): 없음 약 160 fps, 30 → 29.5–29.8, 60 → 58.1–59.6. 30 상한의 정비와 전투 모두 부하 단계 0 유지.
- 출처: xinhai 포크 `frameRate.js`의 생각(ticker.maxFPS, 60 기준 예산). 코드는 새로 썼다.

## 자동 화면 품질 (관리자 결정 2026-10-28, 공식에 없는 설정)
계기: 관리자 제공 iPhone 12 Pro 로그 — 솔로 한 판 35분에서 판 24분쯤부터 기기가 뜨거워져 UI까지 전부 약 3배 느려졌다(「성능 표시」의 보고서). 일 줄이기와 함께
쓰는 발열 대책으로, 설정 → 화면 「画面质量」에 `自动`(자동)을 더했다(`QUALITIES` = auto·high·medium·low, `render/auto-quality.js`).
- **동작**: 자동은 `높음`으로 시작한다. 필드의 적응 부하 단계(`render/app.js adaptLoad`, 위 「성능 표시」의 `lod`)가 3에 20 s 이어지면 `중간` **설정 전체**로
  내린다 — Pixi 배율 2 → 1.5, 3D 보드 2 → 1.25(`app/host.js QUALITY_RES`·`BOARD_RES`), 이펙트 「중간」 경로, 유닛 impostor 기준·눈꺼풀 clip(`pickImpostorInterval`·
  `pickClipping`). 「한가한」 프레임이 120 s 쌓이면 `높음`으로 돌아온다. 다시 내려갈 때마다 돌아오는 기다림이 두 배(최대 600 s): 바꿀 때마다 캔버스를 다시 잡아 잠깐
  멈추므로 오르내림을 되풀이하지 않게. `낮음`까지는 내리지 않는다(관리자 결정: 중간 설정 전체로).
- **「한가함」 = 부하가 있는데 여유가 있는 프레임**(관리자 결정 2026-10-28, 아래 실제 판 확인의 복귀 문제): 보기가 8개 넘고(`adaptLoad`의 `busy`) 부하 단계 0이며
  프레임 간격 이동 평균 < 17.6 ms(약 57 fps)이고 필드 프레임 JS 이동 평균(`cpuMs`) ≤ 8 ms(60 Hz 예산의 절반)일 때만 센다. 보기가 많은데 이 중 하나라도
  어기면 처음부터, 보기가 8개 이하인 동안은 쌓지도 비우지도 않는다 — 유닛이 적으면 느린 프레임도 부하 0이 되어 여유를 말해 주지 않고, 뜨거운 폰은 `중간`에서
  fps가 나와도 같은 JS가 몇 배로 느려져 있으므로. 판정은 이미 매 프레임 재는 이동 평균을 비교만 한다. 숫자 20·120·600 s·17.6·8 ms는 우리가 정한 값이다(`AUTO_STEP`).
- 단계는 페이지가 열려 있는 동안 공유된다: 다음 판은 지난 판이 끝난 단계에서 시작한다(뜨거운 폰은 그대로 뜨겁다). 판 중에 자동을 고르면 그 단계로 바로 바뀐다.
- **기본값**: 터치 전용 기기(굵은 포인터만 있고 정밀 포인터 없음 — 단축키 탭의 `touchUi`와 같은 판정)는 `자동`, 컴퓨터는 `높음`. 설정은 통째로 저장되어
  예전 기본값으로 남은 `높음`과 고른 `높음`을 가를 수 없으므로, 터치 전용 기기의 저장된 `높음`은 한 번만 `자동`으로 옮긴다(`sp.pref.qualityAuto` 표시,
  `ui/settings.js initialSettings`). 그 뒤 고른 `높음`·`중간`·`낮음`은 그대로 둔다.
- **표시**: 자동을 고르면 그 줄 밑에 「현재: 중간 · 자동: 화면이 계속 끊기면 …」(지금 쓰는 단계가 앞, 굵게). 보고서(`settings:` 줄, `perf:` 줄의 `q`)는
  `auto:medium`처럼 고른 것과 쓰는 단계를 같이 적는다(`qualityInEffect`).
- 확인: `test/ui/auto-quality.test.js`(내림·올림 시간, 기다림 두 배와 상한, 「한가함」 조건 — 유닛 적은 판 초반·JS가 부푼 59 fps·57 fps 밑, 판 사이 공유, 보고서 표기, 저장값 옮기기 6경우). Windows Chrome 844×390 @3x
  솔로 자동 진행 R3 전투에서 CPU ×12로 부하 단계 3 → 25 s 뒤 `중간`(캔버스 1688 → 1266 / 보드 1688 → 1055), 풀고 144 s 뒤 `높음`; 설정 화면 폰·데스크톱.
- **실제 판 확인 2026-10-28**(아이폰 12 Pro 솔로 초월 한 판 + 이어서 새 판, `?perf=1`): 판 16분 전투에서 부하 단계 3이 20 s → `중간`, 판 끝까지 유지,
  보스전 말고는 후반도 50–60 fps. 같은 페이지의 새 판에선 유닛이 적은 R1–R2(부하 단계 0)로 120 s를 채워 `높음`으로 돌아갔다가 R3 전투에서 ~30 s 뒤
  다시 `중간` — 보기가 8개 이하면 느린 프레임도 부하 0이라 뜨거운 폰에서도 복귀함(→ 위 「한가함」으로 고침). 바꿀 때의 멈칫은 따로 안 보임.
- **[화면 미확인]**: 「한가함」 조건으로 바꾼 뒤의 폰 — 뜨거운 폰으로 이어 한 새 판 초반에 `중간`에 머무는지, 식은 폰 긴 판에서 `높음`으로 돌아오는지.

## 빈 Die로 끝나는 쓰러짐 — 시빌라이트 에테르나 (2026-10-31, 관리자 제보 「시빌라이트 에테르나가 퇴각했을 때 아무런 모델링이 안 나온다」)

- **원인**: 쓰러져 재배치를 기다리는 오퍼레이터는 Die 클립의 마지막 프레임을 쥔다(위 「멈춘 자세」). 시빌라이트 에테르나(오퍼레이터, `char_4134_cetsyr`)의
  `Die`(1 s)는 0.13 s에 몸 슬롯을 모두 끄고 먼지(`C_Eff_*`)만 남겼다가 1 s에 그것도 끈다 — 마지막 프레임에 그리는 슬롯이 0개라 재배치 링만 남았다.
  `data/assets.json`의 오퍼레이터·소환물 모델 152개(앞·뒤)를 Die 끝 프레임에서 세어 보면 이런 것은 이 하나뿐.
- **고침**: `SpineActor.holdBody`(render/spine.js) — 쓰러진 동안(`units.js` `down`) Die가 끝까지 재생됐고 그 끝에 그리는 영역·메시 슬롯(알파 > 0.02)이 하나도
  없으면, Die 없는 골격처럼 Idle 첫 프레임을 timeScale 0으로 쥐고(`_holdIdle`) 몸을 0.25 s에 걸쳐 다시 보인다(`UnitView._holdIn`). Die 연출(먼지로 흩어짐)은
  그대로 다 나오고, 쓰러진 회색·알파(`DOWN_LOOK`)도 같다. 재배치 없이 떠나는 죽음(`down` 없음)은 전처럼 Die 뒤 사라진다. 끝난 클립 하나는 한 번만 본다.
  [추정·화면: 공식 卫戍协议에서 끝 프레임이 빈 Die의 쓰러진 모습 — 기록 없음]
- 확인: `test/render/die-empty-hold.test.js`(가짜 골격 4건 + 실제 골격: Die 끝 0개·Idle 첫 프레임 > 20개). **디버그 아레나 확인 2026-10-31**(관리자):
  쓰러진 시빌라이트 에테르나의 회색 몸이 보임. 재배치는 다른 오퍼레이터와 같은 길(`revive`)이다.

## 규정 새 적 모델 (2026-11-10, 공식 클라에서 확인)

새 시즌 「규정」의 적 중 지금 `data/assets.json`에 없던 96종(시즌 표 `data/seasons/act3autochess/enemies.json`)을 넣었다. `fetch-assets.mjs`가 시즌마다의 적 표도 읽고(`seasonEnemyIds`), 78종은 다른 적처럼 웹 모델(Ark-Models). 규정 자신의 적 18종(`enemy_9024`–`9040`)은 웹에 없고 EN 클라에도 없어 CN 클라 핫업데이트본의 `refs/arts/enm_art_30.ab`에서 뽑는다(`extract.py ENEMY_SPINES`, 15종) — 로컬 추출물이 없으면 아이콘. 가상적: 기계(`enemy_9029_acfnc_2`)·지느러미 숨은 핵심(`enemy_9037_aceel_2`)은 프리팹의 Spine이 바탕 적의 스켈레톤을 읽어 바탕 적의 로컬 모델을 쓴다(`plan.mjs`). 정체의 고치(`enemy_9036_acweb`)는 프리팹에 Spine이 없다(CN `battle/enm_pfb_37.ab`: `EmptyAnimator`). 그림은 묶인 오퍼레이터 위 거미줄 이펙트(fx.md 「규정 보스 고치·지느러미의 이펙트」)이고, 모델도 아이콘 마름모도 그리지 않는다(`shared/trap-tokens.js EMPTY_BODY_UNITS`, 2026-11-12). 안젤리나 더 멜로우 위시 S3의 표식(`token_10071_aglna2_agairp`)처럼 몸 없는 소환물(`BODYLESS_TOKENS`)과 달리 프리팹에 그림자(켜진 SpriteRenderer, 알파 0.5)와 UI 자리(`UIMountPoint`, `_alwaysHideHp` 없음)가 있어 그림자와 체력 바는 다른 적처럼 둔다 [추정·엔진: `ShadowController`가 몸 없는 적의 그림자 크기를 어떻게 정하는지 안 읽음 — 다른 적의 기본 크기]. 시험 `test/render/empty-body.test.js`.
- 확인: `test/feedback1d-models.test.js`(커밋된 메타데이터·`_2`의 바탕 모델·웹 모델 없음). [화면 미확인: 클립 역할(`anims` — `A_`/`B_` 형태가 있는 적, 공격 클립이 `Idle`로 잡힌 `acfnca`·`achest`)과 크기·위치는 아레나·실제 판에서 안 봄]

## 손 칸 장비 모델 (2026-11-11, 관리자 요청 「장비를 2D 아이콘 대신 모델로, 두 시즌 같이」)

손 칸·임시 칸·관전 판의 장비는 아이콘 판 대신 공식 클라의 장비 모델을 그린다. 공식 클라는 장비를 장치(trap) 캐릭터로 만들고, 그 전투 프리팹(소환물과 같은 `pkgrps/btl_pfb_tokens_*.ab`)은 `Graphic/DefaultSkin` → `FaceSwitcher/Front`의 SkeletonAnimation 하나로 Spine 모델을 그린다(공식 클라에서 확인).
- 목록은 두 시즌 장비 표의 `trapId` 전부(`extract.py item_spine_ids`, 91개). 지금 시즌 59개는 EN 클라, 규정 32개는 CN 클라 핫업데이트본 `btl_pfb_tokens_6.ab`에만 있어 `--game` 루트에 없는 것은 CN 클라(`SP_CLIENT_CN`)에서 찾는다. 프리팹이 다른 장비의 스켈레톤을 그리는 경우가 많다(빅토리아 해머 `trap_1041_acarm041` → `trap_1024_acarm024`의 것, 같은 묶음 안 사본) — 장치 ID가 아니라 프리팹의 SkeletonDataAsset을 따른다.
- 마법 아이템 '신비한 고객'(`chess_item_6_01_m`)·두루마리(`_6_02_m`)·교편(`_6_03_m`)은 프리팹에 Spine이 없다(빈 Graphic) → 아이콘 판 그대로.
- 모델 88개는 모두 클립이 하나(`Default`, 하나는 `animation`)이고 길이 0초다: 프리팹의 SkeletonAnimation도 `Default`를 반복 없이 튼다 → 정지 자세. 그래서 장비마다 살아 있는 스켈레톤을 두지 않고, 모델마다 한 번 공유 렌더 텍스처 칸(`render/item-models.js`, 128 CSS px 칸, 1 타일 = 128 px로 그림)에 그려 같은 모델의 장비는 그 칸의 Sprite로 그린다. WebGL 컨텍스트가 돌아오면 칸을 다시 그린다.
- 크기는 프리팹의 표준 캐릭터 배율 0.27(`FaceSwitcher` scale) = `UNIT.modelScale`, 소환물과 같은 규칙. 칸보다 큰 모델은 칸에 맞춰 작게 그리고 그만큼 키워 보인다(지금 시즌 56개 중 4개).
- 재기(`bench/draw` 장면 `items`·`items-live`, Windows Chrome GPU): 장비 40개 — 아이콘 판 3회·0.026–0.046 ms, 스냅숏 1회·0.039–0.046 ms, 장비마다 스켈레톤 3회·0.077 ms; 80개 — 판 5회·0.052 ms, 스냅숏 1회·0.060 ms, 스켈레톤 5회·0.133 ms.
- 높이·움직임: 모델은 칸 바닥에 서고(프리팹의 그림이 바닥 높이 0) 위아래로 흔들리지 않는다 — 공식 CN 정비 화면 캡처에서 손 칸 장비가 바닥에 섬, 정지는 관리자 확인 2026-11-11.
- 끌 때(2026-11-11, 공식 CN 정비 화면 캡처 둘): 원래 장비는 제자리에 남아 청록 윤곽선(`COLORS.heldOutline` = 102,240,212, 캡처 ≈ 100,225,200)이 둘리고, 윤곽선 없는 사본이 포인터를 따라간다 — 포인터 끝이 사본 모델 상자의 오른쪽 아래(오른쪽 끝·바닥)에 오고, 사본 밑 바닥 점에 그림자, 사본은 다른 유닛 위에 그린다(`ItemView.holdAt`·`endHold`, `render/app.js moveDragVisual`). 놓을 칸에 놓으면 장비가 사본 자리에서 그 칸으로 날아가고, 아니면 사본만 사라진다. 윤곽선은 모델마다 처음 끌 때 한 번 그리는 작은 텍스처(`item-models.js outline`: 스냅숏을 원 둘레 12곳에 2 px 밀어 그린 뒤 색을 SRC_IN으로 채움 — 필터·매 프레임 다시 그리기 없음). 아이콘 판(마법 아이템 셋)은 윤곽선 없이 사본만. 장비를 끄는 동안 필드는 오퍼레이터가 선 칸만 초록이고 손 칸 줄은 청록 — 원래 그렇게 그리고 있었다(실제 판 화면에서 확인). 공식 끌기 설정 `AutoChessDragState._touchOffset` (0, 0.03)·`_overlapOffset` (0, 0, −0.45)가 있지만 어디에 쓰이는지는 확인하지 않았다 — 사본 자리는 캡처에 맞춤 [추정·화면: 캡처 두 장의 포인터 자리로 맞춤, 공식 클라에서 사본을 놓는 곳은 미확인].
- 확인: `test/item-models.test.js`(두 시즌 장비 전부 모델 또는 마법 아이템 셋, 0초 클립, 공유 스켈레톤, `itemSpines` = 커밋된 메타데이터, 스냅숏 칸 공유·가득 찬 칸 넘겨주기·컨텍스트 복구, `ItemView` 모델·판, EN 다음 CN 찾기). 렌더 데모(손·임시 칸에 15개씩)에서 지금 시즌 56개·규정 27개(황금 아닌 것)가 모두 모델로 그려짐을 봄. 끌기는 `test/item-models.test.js`(윤곽선 텍스처, 제자리·사본·포인터 오른쪽 아래), `test/render/unitview.test.js`(아이콘 판)와 Windows Chrome 실제 판(1920×1080, 규정·맹약: 손 칸에 윤곽선, 사본이 포인터 왼쪽 위, 오퍼레이터 위에서 장착 칸 팝업).

## 유키 마코토 페르소나 클립 (2026-11-12, 공식 클라에서 확인)

선발 유키 마코토(`char_4217_makoto`)의 <대역>은 스펙터 디 언체인드·카제마루의 `*_B` 클립이 아니라 고른 스킬의 페르소나 모드 클립이다(CN charpack 각
모드의 `SimpleUnitAnimatorHooker` `_replaceAnimPairs`, `makoto[switch*]` 순서의 `_animKey`). `units.js FORMS` `char_4217_makoto`: form 'doll'은 스킬
번호(`UnitInfo skillIndex`)로 고르는 `bySkill`, S3 치명상 뒤의 form 'orpheus'(키트 fx `persona`).

- 들어갈 때: 본체 `SwitchOut`(1초) → `Doll_Skill_<n>_SwitchIn`(S3은 `Doll_Skill_3_P1_SwitchIn`, 1초) — 공용 교체 2초와 같다.
- 페르소나: S1 오르페우스 `Doll_Skill_1_Idle`·`_Attack`(치료·공격 같은 클립)·`_Die`·`_Stun`; S2 타나토스 `Doll_Skill_2_Loop`(그 `MeleeAttack`에는
  `_animKey`가 없어 대기 클립 위에서 `_preDelay` 0.8초 뒤 침 — 공격 클립 없음)·`_Die`·`_Stun`; S3 타나토스 `Doll_Skill_3_P1_Idle`·`_Stun`, 공격은
  `Doll_Skill_3_P1_Attack_A`/`_B` 차례(본체 공격처럼 `_replaceGroup`); S3 오르페우스 `ChangeBegin`(0.5초) → `ChangeEnd`(1초) → `Doll_Skill_3_P2_Loop`
  (공격 없음)·`_Die`·`_Stun`.
- 돌아올 때: `makoto[switch2normal_allout]` — 그 페르소나의 `SwitchOut`(모드의 짝 `Doll_Skill_<n>_SwitchOut`, 1초) → `Switch2Normal` 모드(Idle →
  `Skill_AllOutAttack_Loop`) → `Allout_LoopEnd` `Skill_AllOutAttack_End`(1.433초) → 본체. [추정·CN: 그 모드를 잡는 길이(`enter_normal_duration`)에
  값이 없어 루프는 한 번 — 마무리 클립이 1.6초째 총공격에 걸침; 시뮬의 돌아오는 교체는 공용 2초라 그 뒤 공격하면 마무리가 끊김]
- 뒤쪽 스켈레톤에는 대기·공격 클립뿐이라 나머지는 건너뛴다(앞 모델의 쓰러짐은 스펙터와 같은 길).
- 확인: `test/render/makoto-persona.test.js`(스킬별 교체·공격·복귀·쓰러짐, 실제 S3 키트 → 뷰), `clip-coverage`(todo 26줄 지움). [화면 미확인]

## 규정 전투 중 정비 구역 (2026-11-12, 관리자 제공 공식 CN 화면)

규정(`act3autochess`)의 공식 전투는 정비 구역에서 기다리는 오퍼레이터를 맹약과 상관없이 모두 정비 줄에 제자리에 선 정지 모션으로 그린다 — 자기 전투도, 관전하는 남의 전투도 같다(관리자 제공 공식 화면, 2026-11-12: 9라운드 전투 중 정비 구역 4명, 카시미어 아님). 지난 시즌(맹약)은 공식도 전투 중 정비 구역이 비어 있어 그대로 둔다(관리자 확인 2026-11-12).
- **시즌 스위치**: `shared/seasons.js` `benchInBattle`(규정만 켬).
- **서버**: 필드가 시작할 때 그 필드 플레이어들의 정비 구역 기물을 `b.start`(서버가 돌리는 필드는 `m.field`)의 `bench`로 보낸다(`server/match/match/views.js battleBench`). 준비 단계 정찰이 보내는 정비 구역 기물과 같은 UnitInfo(`_benchUnit` — 정비 줄 7행, 열 = 정비 칸 번호, `area` 'hand')라 관전석에도 같은 것이 간다. 장비(장비 구역)는 싣지 않는다. 전투 중에는 정비 구역이 바뀌지 않으므로 필드마다 한 번 만들어 다시 보낼 때도 같은 목록이다. 보스·숨겨진 핵심 필드에서는 보스 준비 정찰처럼 그 플레이어의 반쪽으로 옮긴다(`_onBossHalf`), 연합 방어 필드에는 없다.
- **그리기**: 3D 보드(`render/app.js setBattleBench`)는 기물마다 `b:<uid>` 뷰를 전투 뷰 옆에 두고 스냅숏 밖에서 산다(`syncBattle`이 지우지 않음) — 대기 자세만 도는 저부하 뷰(`lod: 'idle'`), 체력 막대·티어 표시 없음(`UnitView` `chip: false`). 쓰러진 오퍼레이터처럼 회색(`DOWN_LOOK.tint`)으로 그리고, 대기 클립을 돌리지 않고 첫 프레임에 멈춰 세운다(`still` → `SpineActor.standStill`, 다시 포즈를 잡지 않음 — 관리자 제보 2026-11-13: 공식은 퇴각한 것처럼 음영, 스탠딩에서 멈춤; 그 전에는 대기 클립이 원래 색으로 계속 돌았다). 시험: `test/render/held-pose.test.js` 「a still bench view」(고치기 전 실패 확인). 대체 필드(`ui/fallbackField.js`)는 보통 필드 아래에 정비 줄을 한 줄 더 그린다.
- **교대**: 카시미어 6명 교대·정비 구역 교대 특질·소멸 공간으로 필드에 나간 기물은 그 전투 유닛의 `spawn`이 같은 `uid`를 실어 오므로 그때 정비 줄에서 뺀다(`dropBenchOf`). 전투 도중 들어온 화면은 이미 필드에 있는 uid를 빼고 그린다. 교대 순간의 공식 연출은 아직 없다(쓰러짐 'die'와 배치 'deploy'만 — 묶음 sim-K).
- [추정·화면: 보스 필드의 자리는 맞음(아래 「규정 전투 카메라」) — 숨겨진 핵심 필드, 정비 구역의 소환물 묶음, 정비 구역 기물이 보는 방향(오른쪽으로 둠), 정예 기물의 빛은 미확인]
- **카메라**: 맹약의 전투 카메라로는 정비 줄이 화면 아래에 걸려 머리만 보인다 — 규정은 공식 화면에 맞춘 전투 카메라를 쓴다(아래 「규정 전투 카메라」).
- 시험: `test/match/battle-bench.test.js`(규정 `b.start`의 `bench` — 칸·행·비공개 키 없음·다시 보낼 때 같은 목록, 맹약은 없음; 스위치를 끄면 실패 확인). 화면: Windows Chrome 실제 규정 판(1600×900) — 3D 보드·대체 필드에 정비 구역 5명, 교대 `spawn`을 넣으면 그 기물만 빠짐.

## 규정 전투 카메라 (2026-11-12, 관리자 제공 공식 CN 화면에 맞춤)

공식 규정 전투는 정비 줄까지 다 보이게 비춘다(관리자 제공 공식 화면 둘: 일반 전투 m03, 보스 필드 「전경」 m02 — 보스는 가상적: 갑주; 카메라는 고정 — 관리자 확인 2026-11-12). 규정 레벨의 카메라 값은 맹약 레벨과 모두 같고(`left_battle_camera_param` (−4, 1.91, −0.6, 1) 등), 공식 클라는 규정에서 카메라 플러그인의 설정 방식을 바꿨지만 그 값은 프리팹에 없다(공식 클라에서 확인). 그래서 그 화면들에 맞춘 컨트롤러 위치를 쓴다.
- `render/projection.js SEASON_CAMERA_PARAMS`: 규정(`act3autochess_`로 시작하는 전장)의 `left_battle_camera_param` **(−5.4, 0.8, −1.52, 1)**(맹약 값 (−4, 1.91, −0.6))과 `mid_boss_battle_camera_param` **(0, −7.49, −4.01, 1)**(맹약 값 (0, −7.95, −4.22)). 숨겨진 핵심 필드는 보스 필드라 같은 「전경」 키를 쓴다. 보스 반쪽(‹ ›)도 공식 화면 둘(m02, 자기 반쪽·관전 반쪽)에 맞춤: 왼쪽 `left_boss_battle_camera_param` **(−5.4, −6.2, −1.52, 1)**·오른쪽 `right_boss_battle_camera_param` **(5.6, −6.2, −1.52, 1)**(맹약 값 (∓4, −5.54, −0.6)) — 거울이 아니라 행·높이가 같고 x만 −5.4 / 5.6, 왼쪽은 일반 전투와 x·높이가 같다. 연합 방어 반쪽(‹ ›)은 공식 화면(m05, 오른쪽 반쪽 관전)에 맞추니 **(5.6, 1.8, −1.02, 1)**로 일반 전투 값의 거울과 다르다(98 px) — 그래서 반쪽은 키를 따로 둔다(`right_unite_camera_param`·`left_unite_camera_param`, 레벨에 없으니 레벨의 `right/left_battle_camera_param`으로 물러남: `CAMERA_KEY_FALLBACK`); 왼쪽 반쪽은 보스 반쪽의 짝처럼 **(−5.4, 1.8, −1.02, 1)**. 연합 방어 「전경」은 화면 없이 레벨 값의 짝을 따라 옮김(관리자 판단 2026-11-12 「연합 방어 가운데·숨겨진 핵심은 보스와 같을 것」): `mid_battle_camera_param` **(0, 0.46, −4.01, 1)**(레벨 값은 보스 「전경」 + (0, 7.95, 0)이라 보스 맞춤의 보정 (0, +0.46, +0.21)을 그대로). 나머지 키(준비·상점·적 미리보기)는 레벨 값 그대로(`stageCameraConfig` — 3D 보드의 카메라가 레벨 설정 대신 이것을 읽음).
- 맞춤: 같은 전장을 우리 카메라로 찍은 화면과 공식 화면의 바닥 대응점(일반 305개, 보스 「전경」 402개, 보스 반쪽 240·170개, 연합 방어 오른쪽 751개)으로 공식 카메라 모형(X −30°, 화각 40°)의 컨트롤러 위치를 맞춤 — 새 값으로 다시 찍은 화면과의 오차는 둘 다 약 1 px, 각도·화각까지 풀어도 30.0~30.1°·39.9~40.0°라 모형은 공식 그대로 맞다. 맹약 값과의 오차는 일반 205 px·보스 37 px.
- 보스 필드 정비 줄: 공식 「전경」 화면의 정비 구역 오퍼레이터 한 명(발 ≈ (830, 915))이 우리 보스 필드의 왼쪽 정비 줄 9번 칸 자리(`bossFieldPlacement` 7행 → 0행, 투영 (835, 920))에 선다 — 보스 필드에서도 정비 구역을 그 플레이어의 반쪽 정비 줄에 세우는 것이 맞다.
- [추정·화면: 일반·보스 「전경」·보스 반쪽 좌우·연합 방어 오른쪽 반쪽은 화면 하나씩(보스 오른쪽은 조금 흐린 프레임); 연합 방어 왼쪽 반쪽·「전경」은 화면 없이 짝으로 옮김; 레벨의 `battle_pos_x/y`·`battle_size` 키와 이 값들의 관계는 모름]
- 시험: `test/render/season-camera.test.js`(규정 전장만 바뀜, 일반 전투 정비 줄 발 ≈ 공식 화면의 1020 px, 보스 「전경」 정비 줄 9번 칸 ≈ (830, 915), 맹약 값으로는 둘 다 어긋남 — 덮어쓰기를 빼면 실패 확인). 맞춤 도구·화면 → 관리자 노트. 화면: Windows Chrome 실제 규정 판 1920×1080.

## 적 프리팹 모드의 클립 — 액젓 추천자·수둔 닌자 (2026-11-14, GitHub #14, 공식 클라에서 확인)

적의 프리팹 모드가 바뀌면(`Unit.SwitchMode`) 그 모드의 `SimpleUnitAnimatorHooker` `_replaceAnimPairs`가 대기·이동·사망 클립을 바꾸고, 공격 클립은 그 모드의 능력이 정한다. 시뮬은 모드를 바꾸지만(`content/enemies/*` `mode`) 화면은 키트가 형태를 알릴 때(`setForm` → fx `phase` `form`)만 `render/units.js FORMS`의 클립 세트로 바뀐다. 둘 중 하나가 빠지면 모델은 첫 모드 클립을 계속 튼다.
- **액젓 추천자**(`enemy_10044_wintun`): 막히면 M2로 영구 전환(시뮬은 전부터 맞음). M2의 훅은 `Idle`·`Move`·`Die`·`Default` → `B_*`, 첫 공격은 스킬 `Skills/BlockedBoom`(클립 `Attack`, 통 내려찍기), 그 뒤는 `Combat`(`B_Attack`, 맨손). 이전에는 형태를 안 알려 통을 든 `Idle`·`Move`와 매 공격 `Attack`을 틀었다(제보 「내려찍은 뒤 공격할 때마다 통이 리필됨」). 이제 형태 `M2boom`(`B_*` 대기·이동·사망 + 공격 `Attack`)으로 막힌 순간부터, 내려찍기의 타격(통이 사라짐) 뒤 `M2`(공격 `B_Attack`). 침묵이면 `BlockedBoom`을 못 써서 `Combat`의 `B_Attack`(형태 `M2`, 통은 남음), 침묵이 끝나면 다시 `M2boom`. 휘두르던 클립은 형태가 바뀌어도 끝까지 간다(전환 클립 없음).
- **수둔 닌자**(`enemy_10116_ymgtop`): 회전(M1)은 `Skills/BeginAnim`의 `Skill_Begin`(→ 끝 `Skill_Loop`)으로 시작하고, M1의 훅이 `Idle`·`Move`·`Default` → `Skill_Loop`(공격 능력 없음), 첫 모드로 돌아올 때 `Default`의 `Skills/EndAnim` `Skill_End`. 형태 `M1`(전환 `Skill_Begin`, 나갈 때 `Skill_End`). 이전에는 회전 중에도 평소 `Idle`·`Move`로 걸었다.
- **같은 꼴 아홉**(2026-11-14, 다중 모드 프리팹 전수에서 시뮬은 바꾸는데 화면이 안 따라가던 것): 형태 이름은 프리팹 모드 이름, 클립은 그 모드 훅의 `_replaceAnimPairs`를 Graphic 표(animKey → 클립)로 푼 것.
  - **양배추 씨앗**(`enemy_10065_ftzlc`): 불타는 덩굴의 첫 공격에 붙으면 `OnFire` — 전환 `Skills/onfire`의 `Skill` = `1to2`, 그 뒤 `2_Idle`·`2_Move`·`2_Die`·`2_Attack`(형태는 점화 fx `ignite`에 실림).
  - **서리를 품은 파울비스트**(`enemy_10141_xdpeng_2`): 처음 失衡되면 `Speed` — 전환 `Skills/switch`의 `Skill` = `Die_3`(알이 깨짐), 그 뒤 `Idle_2`·`Move_2`·`Die_2`(공격 없음).
  - **블러드보일 정예 기사단원**(`enemy_1103_wdkght_2`): 쓰러진 적 10명을 채운 뒤 다음 공격부터 `Rage` — 그 모드 `Combat`의 `_animKey` `Skill`.
  - **잠수부**(`enemy_1158_divman`): 깊은 물에서 `Swim` — `Attack02`·`Idle02`·`Move02`(사망은 그대로), 나오면 첫 모드.
  - **머드락**(`enemy_1511_mdrock`): 충전 5·6중첩에서 `Tier 4`·`Tier 5` — 그 모드 `Combat`의 `Attack_2`(`Tier 1`–`3`은 `Attack_1` 그대로). 전환은 공격 직전(ON_BEFORE_ATTACK)이라 그 휘두름은 옛 `Attack_1`로 끝나고 다음 휘두름부터 `Attack_2`.
  - **제트맨**(`enemy_2004_balloon`): 이륙한 동안 `Fly` — `Move`→`Move_02`, `Die`→`Die_02`(대기는 그대로). 모델의 `Take off`·`Land`는 트는 곳이 없다(`enemy_balloon_s[trigger]`·`[fly]`는 모드 전환과 이펙트만).
  - **눈의 아이**(`enemy_10138_xdsnow`): 失衡 동안 `Unbalanced` — `Die`→`Die_2`.
  - **간이 사육 원석충**(`enemy_10001_trslim`): 체력 절반 아래에서 영구히 `Run` — 전환 스킬 `Skills/StartRun`의 `Skill_Begin`(이 스킬 클립은 형태의 전환 클립으로 틂), 그 뒤 `Idle_B`·`Move_B`·`Die_B`·`Attack_B`.
  - **죄악의 키메라·모독의 키메라**(`enemy_1425_lrcmra`·`_2`): 원석 오염 지대(源石污染区)에 닿아 깨어나면 `Originium` — `Skills/triggerAnim`의 `Skill`, 그 뒤 `Idle_2`·`Move_2`·`Die_2`·`Attack_2`.
- **가상적: 정체**(`enemy_9007_acelem`)의 시전: 막히면 기본 모드 `Combat`(`_animKey` `Parasitic`, 1.2초)을 시전하는 동안 형태 `cast`로 `Parasitic`을 틀고(끊기면 형태를 되돌림), 부착 때 모드 `Parasitic`의 `Anim`이 `Parasitic`을 한 번 더 튼 뒤 `Idle_2`(형태 `parasitic`). 이전에는 시전 중에는 `Idle`이고 부착 때 한 번만 틀었다.
- 근거: 모드별 능력·클립(적 바인딩 추출 `tools/assets/local-enemy-bindings.json`), 모드의 `_replaceAnimPairs`·능력 `_animKey`(공격 시간 조사의 프리팹 필드), 모델 클립은 `data/assets.json`. 첫 내려찍기 시간도 공식대로 `BlockedBoom`의 `Attack`(1.467초 중 0.7초 타격, 공격 시간에 맞춰 늘고 줆; 2026-11-14 — 이전: 시뮬이 M2 `B_Attack` 1.2초 중 0.467초로 재고 화면이 `Attack`의 타격 프레임을 그 시각에 맞춤): 키트가 그 휘두름의 클립을 `profile.swingClip`으로 엔진에 넘긴다(`ai.js attackClipOf`, sim.md 「적 스킬 = 일반 공격 차례」). 수둔 닌자의 다음 회전은 돌아온 뒤 쿨 60초 전체(sim.md 같은 절 「모드가 꺼진 스킬의 쿨」).
- 시험 `test/render/enemy-mode-forms.test.js`(실제 키트의 사건을 실제 `UnitView`에: 막힘·첫 내려찍기·맨손, 침묵, 회전 시작·회전·失衡으로 끝) — `units.js`·`special.js`를 각각 되돌리면 셋 다 실패. 같은 꼴 아홉과 정체 시전 12건도 같은 파일(수정 전 코드에서 모두 실패). [화면 미확인]

## 적 공격 클립은 키 표로 (2026-11-14, 공식 클라에서 확인)

적 능력의 `_animKey`는 키이고, 적 프리팹 뿌리 유닛 `_animator`의 `_animations` 표가 그것을 모델 클립 이름으로 바꾼다(sim.md 「일반 공격 타이밍」 「적 클립의 키 표」 — 시뮬은 이 클립으로 휘두름을 잰다). 화면의 적 모델 역할은 클립 이름으로 짐작했다(`tools/assets/anim-roles.mjs`). 그래서 두 시즌의 적 모델 302개 중 14종이 시뮬과 다른 클립을 틀었고, 막힘 공격(`_combat`)의 클립은 어느 적도 따로 틀지 않았다.
- 이제 `tools/fetch-assets.mjs`가 매니페스트를 만들 때 `data/enemies.json`(두 시즌)의 `attackAnim.clip`·`attackAnim.combat.clip`을 그 적의 자기 모델(대역이 아닌 웹 모델, 로컬 공식 모델)에 얹는다(`tools/assets/spine.mjs overlayEnemyAttackKeys` → `anim-overrides.mjs putEnemyAttackKeys`). 주 클립이 다르면 공격 역할의 루프를 바꾸고 짐작의 시작·끝·대체 표시(`via`)는 버린다. 막힘 클립이 다르면 역할의 `combat`에 넣는다. 골격에 없는 클립은 얹지 않는다. 데이터의 클립 이름은 이 역할에 기대지 않으므로(골격에 그 클립이 없을 때만 렌더 역할로 대신함) 순서를 바꿔 다시 만들어도 같다.
- 막힘 공격: 시뮬의 적 `swing`이 막힘 능력(`atkCombat`)으로 휘두를 때 아군처럼 7번째 칸에 1을 싣고(`ai.js enemyAttack`), 화면은 역할의 `combat` 클립을 튼다(`render/spine.js _swingClip`). 적이 나온 틱에 시작한 첫 휘두름은 막힘이 잡히기 전이라 공격 능력 것이다(시뮬도 그렇게 잰다).
- 바뀐 것: 빅 밥 `Attack` → `Attack2`(1.9초 휘두름에 1초 클립을 틀었다), 신생 혈족(근접) `Attack` → `Combat`, 폭주 식인꽃 `Attack_Begin`(짐작은 `Attack_Begin`+`Attack_Die`+`Attack_End`로 휘두를 때마다 쓰러지는 클립을 틀었다), 원거리·막힘이 다른 셋 — 살카즈 본가드 고문관 `Attack_2`/막힘 `Attack`, '거대하고 못생긴 것' `Attack_2`/`Attack_1`, '제국의 갑옷' `Attack_B`/`Attack_A` —, 막힘 클립만 다른 여덟 — 살카즈 부패의 전차 둘 `Attack2`, 스컬슈레더 `Combat_NoPre`, '버림받은 자' `Attack_2`, '툼스톤' `Attack_3`, '데몬의 칼날' `Combat`, 패스파인더 스나이퍼 `Attack_2`, 포트브레이커 `F_Combat`.
- **'단현지음'/'열관지음'**(`enemy_9023_acdums`)의 어두운 형태: 프리팹 모드 `Depression`의 훅이 `Idle`·`Move`·`Die` → `Idle_2`·`Move_2`·`Die_2`, `Combat`의 `_animKey` `Attack_2`, 키 표가 이것을 `Idle_B`·`Move_B`·`Die_B`·`Attack_B`로 튼다. 키트 `bosses.js setEchoForm`이 이미 내던 `phase` fx에 형태 `Depression`(금빛이면 `null`)을 실어 `render/units.js FORMS`의 그 세트로 바뀐다. 이전에는 어두운 형태에서도 `*_A`를 틀었다. 표의 `A-B`(0.033초)를 트는 노드는 읽지 않았고 틀지 않는다. 시뮬의 모드 전환(`enemyMode`)은 아직 안 하지만 두 모드의 공격 클립은 길이·타격(1초·0.2초)이 같다(묶음 sim-D 「모드 클립 ②」 줄).
- 대조 밖: 이름이 프리팹 모드와 다른 형태(죄수의 `warning`·`liberty` 등)의 공격 클립은 시험이 모드와 짝을 모른다 — 모드 이름 형태만 본다. '즈자이' `ShieldBurst`의 시작 키 `Skill_02`가 표에 없는 것은 채널 클립 줄(sim.md 같은 절)에 그대로 둔다.
- 재발 방지: `test/render/enemy-attack-clip-keys.test.js`(두 시즌 모든 적 × 자기 모델의 공격·막힘 클립, 모드 이름 형태, 막힌 스컬슈레더의 `swing`, '단현지음' 형태) — 옛 `data/assets.json`·`ai.js`·`units.js`로 되돌리면 각각 실패. [화면 미확인]
### 스킬 끝 채널의 루프 (2026-11-16, 공식 클라에서 확인)

- 글래디아 S3 `skchr_glady_3/FinalAttack`: 끝 묶음의 채널(`ThreePartChannelingAnimation`)이 `_waitForAttachFinishEvent`이면 루프 클립을 `m_loopTime`이 아니라 주인의 공격 끝 사건(엔티티 사건 ON_ATTACK_FINISH)까지 튼다(`DoPlayAnimation`: 시작 클립 → 사건까지 최대 360초 → 끝 클립 → `_fireAnimEndEvent`면 애니 끝 사건). 같은 오브젝트의 `RangedAttack`이 `_waitForProjectileInvalid`·`_fireAttackFinishWhenProjectileInvalid`이면 그 사건은 투사체가 끝날 때 난다(`OnWaitForPostDelay`). 글래디아: `Skill_3_Begin`의 `OnAttack`(0.367초)에 捕网 `projectile_chr_glady_s3_3`(LIMITED 수명 1.3초 = `_firstPartTime` 0.3 + `_secondPartTime` 1, `_stopAfterSecondPulledBack`)을 던지므로 `Skill_3_Loop`는 0.633초부터 1.667초까지(1.033초), `Skill_3_End`(1.167초)가 2.833초까지. 전에는 루프를 클립 길이 1.333초 틀어 끝 동작이 0.3초 늦었다.
  - 추출·생성: `anim_keys.py`가 채널에 `wait`, 그 옆 `RangedAttack`의 투사체를 `fin { proj, life }`(수명은 투사체 프리팹의 `_lifeTime`, `enemy_projectiles.projectiles`)로 적고, `anim-keys.mjs keyRoles`가 이름이 끝 능력(`FinalAttack`·`…End…`)인 채널을 스킬 역할 `end` 세 클립 + `endProj`(초)로 만든다. `spine.js _skillEnd`는 루프를 시작 클립의 `OnAttack`(`hits`) + `endProj`까지 돌린다. 손 표 `SKILL_CLIP_OVERRIDES` 글래디아 줄의 `end`는 지움(`end`를 안 적은 줄은 키의 `end`·`endProj`를 그대로 둠). 기다리는데 투사체 수명을 모르면 추출도 생성도 멈춘다. 채널은 끝 능력만 이렇게 읽는다 — 같은 `wait`인 다른 채널(글래디아 S1·S2, 울피아누스 S1, 클리프하트 S1·S2, Miss.Christine S2, 르무엔 조준)은 스킬·신호 사건이 루프를 끝내므로 그대로.
  - 공식과 다른 점: 능력은 투사체가 끝난 뒤 애니 끝 사건을 max(남은 시간, `_minPostDelayWhenProjectileInvalid` 1초)만 기다려 2.667초에 끝나고(시뮬 `endHolds`, `sim.md` 「즉발 스킬의 시전」), 끝 클립은 2.833초까지다. 그 0.167초에 공식이 끝 클립을 끊는지는 안 읽었다 — 렌더는 다음 공격이 끊을 때까지 튼다. 공격 속도가 올라 공격 시간이 1.8초(시작 + 끝 클립)보다 짧으면 채널의 `UpdatePlaybackSpeed`가 시작·끝 클립을 그만큼 빨리 트는데(`_timeMode` 0), 시뮬도 화면도 1배로 둔다(공식과 다름, 남은 일은 관리자 노트). 재발 방지: `test/render/anim-keys.test.js` 「a closing channel …」(생성기 멈춤 포함), `test/sim/attack-clip-view.test.js` 「歌蕾蒂娅 S3 …」. [화면 미확인]

## 스킨 모델 소재 (2026-11-16, 관리자 결정 「스킨 소재는 전부」)

- 무엇: 우리 오퍼레이터(`data/assets.json chars`, 전투 모델이 있는 221명)와 소환물(`tokens`, 그리고 오퍼레이터 스킨의 `tokenSkinMap`이 입히는
  소환물)의 공식 스킨 전부의 전투 Spine 모델. 목록은 공식 스킨 표(`excel/skin_table.json` `charSkins`)에서 `battleSkin.skinOrPrefabId`가 자기 프리팹인
  것이다(`DefaultSkin`·null은 기본 모델). 2026-11-16 기준 오퍼레이터 스킨 266벌(178명), 소환물 스킨 49벌. 오퍼레이터 스킨은 `tokenSkinMap`(소환물 →
  소환물 스킨 키)을 같이 적는다.
- 어디서: `skinpack/<주인 ID>.ab`의 `dyn/battle/prefabs/skins/character/<주인 ID>/<프리팹 ID 소문자>.prefab`. EN 클라(핫 업데이트 묶음 먼저) → 없으면 CN
  클라. 오퍼레이터는 Front·Back 렌더러(방향 없는 모델은 `Spine` 하나 = 앞), 소환물은 기본 소환물 모델처럼 Front(또는 하나뿐인) 렌더러. 페이지는 적·소환물 모델처럼
  premultiplied로 합친다.
- 파일 이름: 공식 ID에 `#`이 있다(`char_202_demkni_boc#1`). URL에서 `#`은 조각(fragment)의 시작이라 그 경로로는 파일을 받을 수 없고, 리소스 목록도 그런
  경로를 거부한다(`public/js/resources.js` `PATH_RE`, 그대로 둠). 그래서 추출기의 이름 함수 하나(`file_name`)가 모든 폴더·파일 이름을 만든다: `#` → `-`.
  공식 스킨·골격·페이지 이름에는 `-`가 없어 두 이름이 하나로 겹치지 않는다. 그 밖에 `[A-Za-z0-9_.]` 아닌 글자는 추출을 멈춘다. 아틀라스의 페이지 줄도 바꾼
  이름으로 고쳐 쓴다(영역 이름은 파일이 아니라 그대로).
- 어디에: `public/assets/local/spine/skin/<주인>/<프리팹>/<front|back>/<프리팹>.skel|.atlas|<페이지>.png`, 목록은 같은 폴더의 `skins.json`
  (`{ skins: { <스킨 키>: { owner, prefab, client, front, back?, tokens? } }, missing }`). `data/local-assets.json`에 넣지 않는다 — 그 목록은 모든
  페이지가 받고, 스킨은 스킨 데이터를 고른 사람만 받는다. 이 추출 모델은 클립 길이·키 표 대조용이고 브라우저에는 가지 않는다(아래 「받는 곳」).
- 받는 곳(2026-11-16, 관리자 결정): 스킨 전투 모델은 이 서버가 보내지 않고 `fexli/ArknightsResource`에서 받는다. `tools/fetch-skin-models.mjs`가
  `skins.json`의 스킨마다 그 저장소의 `spine/<주인>/<프리팹, # → _>/`(대소문자 무시, `Front`·`Back` 또는 한 면 `Spine`)를 찾아 skel·atlas·atlas가 적은
  페이지를 한 번 받아 `.cache/skin-models/`에 두고(저장소 트리의 git blob id로 확인, 바뀐 것만 다시 받음), 목록 항목 `{ p, s, h, u }`를 `models.json`
  (같은 폴더)에 쓴다. `h`·`s`는 그 저장소 파일의 것, `u`는 그때의 커밋에 고정한 GitHub raw 주소(jsDelivr가 먼저, `resources.js sourcesOf`) — 저장소가
  나중에 파일을 바꿔도 해시가 어긋나지 않는다. 목록 경로는 `/assets/spine/skin/<주인>/<저장소 폴더>/<front|back>/<저장소 파일 이름>`이라 atlas가 적은 페이지
  이름이 옆 파일과 맞고, 그 경로에는 서버에 아무 파일도 없다. 저장소가 다른 이름으로 둔 스킨(2026-11-16에 4벌: 사일런스 소환물 메딕 드론 `winter#1` →
  `winter_2`, 실버애쉬 더 레인프로스트 소환물 셋의 `sale#20` → 한 폴더 `token_10057_svash2_eagle_sale_20`)은 주인 폴더 안에서 글자(숫자·`_`·`#` 뺌)와 skel
  크기가 추출 모델과 같은 폴더로 찾고(주인의 기본 모델 폴더는 빼고), 그런 폴더가 둘이면 멈춘다. 못 찾은 스킨은 `missing`에 적고 기본 모습으로 그린다
  (2026-11-16에 1벌: 메딕 드론 `sweep#1`). 결과 311벌·1,713파일·275 MB.
- 리소스 목록의 묶음(2026-11-16): 스킨 데이터는 `browser-resources.json`의 `packs.skin`(경로 머리 `/assets/spine/skin/`·`/assets/local/spine/skin/`,
  시즌 구분 없음)이다. `tools/build-browser-resources.mjs`가 `models.json`·`art.json`의 항목을 싣고 추출본(`local/spine/skin/<주인>/<프리팹>/
  front|back|avatar|portrait/`)은 빼며, 일러스트·`skins.json`·`models.json`·`art.json`은 이 서버 것으로 싣는다. 두 색인이 같은 경로를 적으면 멈춘다. `resources.js`는 받을 목록과 지울 목록을 나눈다: 묶음 파일은 그 묶음을 고른 사람만 받고
  (`resourceWanted`, 선택은 `sp.pref.resourcePacks`, 미리 받기 동의 없이도 고른 묶음은 받음), 캐시에서 지우는 것은 사용자가 그 묶음을 껐을 때뿐이다
  (`resourceKept`, `setResourcePack(name, false)`). 고른 적 없는 묶음의 파일이 목록 해시대로 캐시에 있으면 그대로 둔다 — 받기 필터를 지우기에도 쓰면 게임이
  그때그때 받아 둔 파일을 매번 지운다. 받는 중에 끄면 남은 차례는 건너뛰고 끝난 뒤 다시 맞춘다. 배포에서도 추출 모델 폴더(`front/`·`back/`)는 서버에
  올리지 않는다(아바타·초상화 폴더도). 워커는 목록에 있으면 무엇이든 받으므로 남의 스킨을 막는 것은 렌더 쪽이다(아래 「스킨 렌더 게이트」).
- 그림(2026-11-16): 스킨 고르기 타일·미리 보기용으로 스킨 기록의 `avatarId`(1:1, 180 px)·`portraitId`(1:2, 180×360)·`illustId`(일러스트)를 같은
  추출기가 뽑는다(`--only art`는 그림만). 아바타·초상화는 클라의 이름 → 경로 표(`arts/charavatars/avatar_hub.ab`·`arts/charportraits/portraits_hub.ab`,
  대소문자 무시)가 가리키는 스프라이트 묶음(`spritepack/ui_char_avatar_*`·`char_portrait_*`)에서, 일러스트는 주인 `skinpack`의 `illust_<스킨>` 프리팹에서
  읽는다 — Image 스프라이트의 텍스처 캔버스 전체와 RectTransform 틀(기본 일러스트 `chararts`와 같은 틀). 알파는 대개 스프라이트에 없고 Image의
  재질(`illust_<스킨>_material`)의 `_AlphaTex`에 있다(불투명 텍스처 위에 그 알파를 씌움). 재질이 없으면 텍스처 자기 알파. 재질을 안 읽으면 흰·검은 네모
  위의 그림이 된다. UnityPy의 `Sprite.image`는 메시 경계로 잘라 틀과 안 맞으므로 쓰지 않는다. 출력은 그 스킨 폴더의 `avatar/`·`portrait/`(PNG, 클라 크기 그대로)·
  `illust/`(webp q85, 긴 변 1024)이고 이름도 `file_name`을 거친다. `skins.json`의 각 스킨에 `avatar`·`portrait`(`{ path, w, h }`)·`illust`(+ `frame`)가
  붙고, 클라에 없는 그림은 `artMissing`에 적는다. 모델이 없는 스킨은 그림도 뽑지 않는다(고르기에 안 나옴). 소환물 스킨 기록에는 아바타만 있고, 그것도 클라에
  없는 소환물이 있다(그때는 기본 아바타). 움직이는 일러스트(`dynIllustId`)는 뽑지 않는다. 그림도 스킨 폴더 안이라 스킨 데이터 묶음에 든다.
- 그림을 받는 곳(2026-11-16, 관리자 결정): 아바타·초상화는 이 서버가 보내지 않고 `yuanyan3060/ArknightsGameResource`에서 받는다(위 추출본은 대조용,
  배포에 안 감). `tools/fetch-skin-art.mjs`가 `skins.json`의 스킨마다 공식 스킨 표 기록의 `avatarId`·`portraitId`로 그 저장소의 `avatar/<id>.png`·
  `portrait/<id>.png`(`#` 그대로, 대소문자 무시 — 대소문자만 다른 파일이 둘이면 멈춤)를 찾아 한 번 받아 `.cache/skin-art/`에 두고(트리 git blob id로 확인),
  `art.json`(같은 폴더: `skins`의 `{ avatar?, portrait? }` = `{ path, w, h }`, 목록 항목 `files`, `missing`)을 쓴다. 목록 경로는 추출기가 같은 그림에
  주는 경로를 `/assets/spine/skin/` 아래로 옮긴 것이다(`#` → `-`, 서버에 파일 없음). `u`는 커밋에 고정한 GitHub raw 주소이고 이름의 `#`은 `%23`이다(jsDelivr도
  그 주소로 받음). 스킨 고르기 화면은 그림 경로를 `skins.json`이 아니라 `art.json` `skins`에서 읽는다. 2026-11-16 결과: 아바타 305(오퍼레이터 265·소환물 40 —
  클라 추출에 없던 소환물 둘, 비즈왁스의 사막의 오벨리스크 `summer#11`·카제마루의 종이 인형 `witch#3` 포함)·초상화 265, 570파일·47.5 MB. 없는 7벌(소환물 스킨 아바타)은 `missing` →
  기본 아바타. 일러스트는 그대로 이 서버가 보낸다(webp q85).
- 표시 전용: 전투 판정은 기본 모델 기준이다. 스킨 모델의 클립 길이는 시뮬레이션에 들어가지 않는다(시뮬레이션은 `data/assets.json`의 기본 모델만 읽음).
- 아직 없는 것: 스킨 모델 항목의 그리기 필드(페이지 종류 `pma`, 키 표·클립 길이·타격·부착점) — 아래 「스킨 렌더 게이트」가 그것을 기다린다.
- 재발 방지: 원인 제거 — `tools/local-extract/skin_extract.py` `file_name`이 모든 출력 이름을 만들고 모르는 글자에서 멈춤; 저장소 폴더는
  `tools/fetch-skin-models.mjs`가 트리에서 찾고 모르는 경우(후보 둘)에 멈춤(손 별칭 표 없음); 그림 파일은 `tools/fetch-skin-art.mjs`가 스킨 표의 id로 트리에서
  찾고 모르는 스킨·이름 규칙 없는 글자·대소문자만 다른 두 파일에서 멈춤. 목록 생성(추출 모델·아바타·초상화 빼기·`models.json`·`art.json` 싣기·두 번 적힌
  경로에 멈춤·`packs`)과 일러스트 알파(뽑힌 일러스트 전부가 투명 화소를 가짐)는 `test/local-extract-skins.test.js`, 받을 목록·지울 목록 나누기와 폴더·그림 찾기는
  `test/resource-packs.test.js`.

## 스킨 렌더 게이트 (2026-11-16 — 스킨은 표시 전용, 받지 않은 사용자에게는 남의 스킨도 기본 모습)

- 무엇: 아군 유닛이 플레이어가 고른 스킨(`UnitInfo.skin`·정비 `pieceView.skin`, 소환물은 주인 오퍼레이터의 스킨 ID)으로 그려질지를 모델을 받기 전에
  정한다(`public/js/render/skin-gate.js`, `render/units.js UnitView._skinModel`). 리소스 워커는 목록에 있는 파일이면 무엇이든 받으므로, 막는 곳은 워커가
  아니라 모델 로더 앞이다 — 게이트를 통과하지 못한 스킨의 파일은 아무도 요청하지 않는다.
- 스킨으로 그리는 조건(모두): ① 이 플레이어가 스킨 데이터를 골랐고(`resources.js resourcePacks().skin`) 두 목록 `local/spine/skin/models.json`·`skins.json`이
  캐시에 있다. ② 자기 유닛이거나(`ownerId`가 자기 플레이어 ID, 정비 구역 말은 `mine`) 설정 「다른 플레이어 스킨」(`otherSkins`, 기본 켬)이 켜져 있다. 정찰한
  팀원 보드와 전투의 팀원 유닛은 남의 유닛이다. ③ 그 유닛이 그 스킨을 입는다: 스킨의 `owner`가 그리는 몸(`spine`, 없으면 `defId` — 보충 대체 몸·선발 고른
  오퍼레이터)이거나, 소환물이면 스킨의 `tokens[소환물 ID]`가 가리키는 소환물 스킨. ④ 모델 기록이 다 있다: 있는 면(Front, Back)마다 페이지, 페이지 종류
  `pma`, 그 스킨 자기 키 표 `anims`. ⑤ 두 면의 skel·atlas·페이지가 모두 목록 해시대로 캐시에 있다(`resources.js resourceCached`). 하나라도 아니면 기본 모델.
- 장면 단위: 판단은 장면(정비, 전투, 정찰한 보드 — `render/app.js`가 `enterPrepMode`·`enterBattle`에서 `scene()`)이 시작될 때의 목록·설정·캐시로 하고,
  한 유닛은 한 번만 판단한다(앞·뒤 모델 바꾸기·다시 받기에도 그대로). 전투 도중 받기가 끝나거나 설정을 바꾸면 다음 장면부터. 정비 구역에서 자기 말의 스킨을
  바꾸면 그 말을 다시 만든다(prep 서명에 `skin`).
- 스킨 모델이 받기에 실패하면 그 면의 기본 모델로 그린다(항목의 `fallback`). 스킨에 Back 모델이 없으면(312벌 중 52) 위를 봐도 스킨 Front로 그린다(기본 모델의
  Back 없는 오퍼레이터와 같은 규칙). 쓰러짐 길이·소환물 모드 표도 그린 모델의 항목에서 읽는다.
- 모델 기록의 형식: `models.json skins[스킨 키].front|back` = `{ skel, atlas, pages, pma, anims, animations, events, hits, bounds }`, 필드는
  `data/assets.json` 모델 항목과 같은 뜻. 2026-11-16 지금 `models.json`에는 경로(`skel`·`atlas`·`pages`)만 있어 **어느 스킨도 그려지지 않는다**. 채울 것:
  `pma` — fexli 페이지는 두 종류가 섞여 있다(311벌 571쪽 중 premultiplied 291·straight 280, `tools/assets/spine.mjs premultipliedPage`로 잼), 그래서 페이지
  픽셀 판정을 생성 단계가 적어야 한다; `anims`·`animations`·`hits`·`events`·`bounds` — 그 스킨 자기 골격과 키 표(키 표가 기본과 다른 스킨 15벌,
  관리자 노트의 클립 길이 대조). fexli atlas에 `size:` 줄이 없는 것은 pixi-spine의 atlas 읽기가 페이지 텍스처 크기로 채운다.
- 재발 방지: `test/render/skin-gate.test.js`(고르지 않음·설정 끔에서 스킨 파일을 묻지 않음, 파일 하나 빠지면 기본, 도중에 받아도 다음 장면부터, 기록이
  모자라면 기본, 소환물 스킨, 유닛이 게이트의 모델을 받고 실패하면 기본으로, 디스크 목록의 소환물 스킨·파일이 서로 맞음).

## 함정 (2026-11-14, 관리자 결정 「회귀 방지」)

유닛·HUD·보드를 그리는 코드(`public/js/render/`)를 고치기 전에 읽는 목록. 쓰는 법은 `fx.md` 「함정」과 같다.

- **매 프레임 그리기**(관리자 결정 2026-10-31): `render/units.js`의 갱신, HUD, 이펙트 플레이어는 첫 판부터 가장 나쁜 경우(8인 전장, 여러 유닛이 같은 것을 띄움, 폰)를 기준으로 쓴다.
  - 입력이 안 바뀐 프레임에는 아무것도 다시 만들거나 할당하거나 래스터화하지 않는다: 마지막 값을 들고 있다가 건너뛴다(`RadialFill`, `downLabel`).
  - 여러 유닛이 한꺼번에 띄울 수 있는 것은 유닛마다 스텐실 마스크·필터·`Graphics` 다시 그리기·`Text`를 쓰지 않는다: 같이 쓰는 텍스처의 스프라이트, 아틀라스(`hudRings`), 작은 메시(정점 100개 미만, 스프라이트와 같이 배치됨)로 그린다.
  - 새로 쓰기 전에 있는 부품부터 찾는다: `hud-bars.js`의 `RadialFill`·`texOf`, `textures.js`의 `hudRings`·`ringArc`·`downLabel`.
  - 매 프레임 그리는 길을 바꾸면 화면에 여러 개를 띄워 앞뒤를 잰다(GPU에서 프레임당 그리기 호출 수와 ms). 그림을 그대로 두려는 수정은 앞 판과 픽셀 단위로 견준다. 수치는 커밋 메시지에 적는다(재배치 카운트다운을 스텐실 마스크로 그렸을 때 오퍼레이터 12명에 그리기 호출 36번, 배치되는 메시로는 1번).
- 시뮬이 공격 시점을 재는 클립과 화면이 트는 클립은 두 곳에서 읽는다. 둘이 다른 클립이면 휘두름·타격·시전 이펙트가 서로 다른 시계로 돈다 → `sim.md` 「일반 공격 타이밍」. 재발 방지: `test/sim/attack-clip-view.test.js`(전 오퍼레이터 × 모드), 적은 `test/render/enemy-attack-clip-keys.test.js`(「적 공격 클립은 키 표로」 — 적 역할을 손으로 고치지 말고 `data/assets.json`을 다시 만든다).
- 오퍼레이터의 Spine 클립 누락 → 「Spine 클립 커버리지」. 재발 방지: `test/render/clip-coverage.test.js`.
