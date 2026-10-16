# 우리 규칙과 근거 (docs/rules)

이 포크가 원본(`upstream` = sganggs/Stronghold-Protocol)과 다르게 정한 규칙·기능과 그 **근거**(공식 테이블·EN 클라이언트 데이터·PRTS·관리자 결정과 날짜·[추정] 표시·측정)를 적는 곳이다.
2026-10-09까지는 `docs/LOCAL-PATCH.md` 한 파일이었고, 하드 포크(2026-10-07) 뒤 영역별 파일로 나눴다. `docs/LOCAL-PATCH.md`는 코드·테스트 주석에 남은 옛 참조(「LOCAL-PATCH.md 「절 이름」」)를 지금 파일·절로 이어 주는 **색인**이다.

- **관리자**: 이 문서들에서 「관리자」는 이 포크를 운영하는 사람이다. 관리자 결정·요청은 날짜와 함께 적고, 관리자 제보(플레이하며 발견한 문제)는 날짜만 적는다.
- **비공개 조사 기록**: 근거가 된 캡처·녹화·조사 메모 가운데 저장소에 없는 것은 「(비공개 조사 기록)」·「(비공개 녹화)」로만 적는다. 날짜 없는 `docs/research/NN-…`은 이 저장소에 있는 조사 문서다.
- 이 저장소의 파일에는 홈 폴더 절대 경로(`/home/…`, `C:\Users\…`)·관리자 노트 폴더의 경로와 PC 계정 이름을 쓰지 않는다(`test/public-repo.test.js`).

| 파일 | 영역 |
|---|---|
| `README.md` | 이 안내, 원칙, 기능별 목록, 버전 표기, **테스트(실패 0 기준선)** |
| `sim.md` | 전투·경기 규칙: 게임 수치 수정, 상점 칸·보스전 시간, 적 비행 공격, 전투 버그 수정, 스킬 범위 발동(미확정), upstream 0.2.1·0.2.2 이식(전투·경기) |
| `diy.md` | 선발 오퍼레이터 — **「새 선발 오퍼레이터 키트 체크리스트」** |
| `ui.md` | 화면 UI: 디버그 패널, 정비 화면 HUD, 상점, 휴식 진입·현상 수배·전투 종료 화면, 배치 UI, 전투 화면 UI, 위장 아이콘, 초대 링크, 휴대폰, 서버 재시작 예고, 무중단 배포(서버 세대), 결산 화면 피드백, 로비 업데이트 소식, 규칙 모드(클래식·캐주얼) |
| `render.md` | 보드·유닛 렌더링·연출: 공식 맵, 공식 스테이지 3D 씬, 배치 낙하, 유닛 모델 크기, 적 경로 미리보기(전투 시작), 보스 경로 미리보기, 성능 표시, 3D 보드 첫 그리기 미리 준비 |
| `fx.md` | 공식 전투 이펙트: 추출·재생기·붙는 자리·마운트·방향·정예 금빛·제보별 수정 |
| `audio.md` | 소리·음성: 오퍼레이터 음성, 스킬 효과음·믹서, 작전 종료 효과음, 배치 효과음, 랜덤 매칭·방 알림음, 카운트다운 경고음, 채팅 알림음, 맹약 층 효과음 |
| `upstream.md` | upstream과의 관계: 0.2.0 병합(옛 경로 대응표 포함), 0.2.0 전에 미리 가져온 원본 수정, upstream에서 이식할 때 비교할 우리 패치 |

## 쓰는 법
- 규칙을 바꾸거나 새 기능을 넣으면 그 영역 파일의 해당 절에 적는다: 무엇을, 근거(어느 데이터·문서로 확인했는지 / 추론이면 `[추정]`), 관리자 결정·요청은 날짜와 원문, 확인 방법(실제 판·디버그 아레나·단위 테스트·Chrome).
- 관리자 제보는 문장을 인용하지 않고 「관리자 제보」와 날짜만 적는다(관리자 결정 2026-10-09). 무엇이 틀렸는지는 우리 말로 쓴다.
- 작업 과정은 적지 않는다: 작업 세션 이름, 확인용 스크립트 이름·인자·포트, 캡처 파일 이름, 배포 절차, 제보·결정의 내부 번호. 확인은 「실제 솔로 판에서 확인」처럼 방법과 결과만. `test/public-repo.test.js`(`tools/public-scan.mjs`)가 「사용자/user 결정」 표현·세션 이름·결정 번호를 잡는다.
- 아직 안 끝난 일·화면으로 확인하지 못한 것은 해당 줄에 `[화면 미확인]`·`[브라우저 미확인]`(소리)처럼 표시만 하고, 할 일 목록은 이 문서에 두지 않는다. 확인이 끝나 관리자 노트의 확인 줄을 지울 때 그 표시도 같이 지우거나 「실제 판 확인 YYYY-MM-DD」로 바꾼다(2026-10-12).
- 배포 상태(「미배포」, 배포 때 필요한 옵션)는 적지 않는다 — git 태그와 배포 스크립트가 안다(관리자 결정 2026-10-12).
- 새 절(`##`)을 만들거나 절 이름을 바꾸면 `docs/LOCAL-PATCH.md` 색인도 고친다.
- 다른 파일의 절은 `sim.md 「절 이름」`처럼 파일 이름과 함께 가리킨다.

## 원칙
**2026-10-07부터 하드 포크**: upstream v0.2.0 병합이 마지막이다(관리자 결정 2026-10-07). 그래서 예전의
병합용 규칙(원본 파일에는 연결 한 줄만, 원본 테스트는 고치지 않기, 의도된 실패 목록 유지)은 풀었다.
- 원본 파일도 필요한 만큼 고친다. 새 기능은 여전히 따로 된 파일이 읽기 쉬우면 새 파일에 둔다.
- `// local patch` 주석은 새로 달 필요가 없다. 이미 있는 것은 그대로 두거나, 그 줄을 다시 고칠 때 지운다(관리자 결정의 근거 같은 설명은 남긴다).
- 원본 테스트도 우리 것이다. 우리 동작과 다르면 고치거나 지우고, 의도된 실패 목록을 늘리지 않는다.
- upstream의 버그 수정은 골라서 이식한다(`git cherry-pick -x` 또는 손으로, `upstream.md`). 이 문서는 우리가 원본과 다르게 정한 것과 그 근거를 적는 곳이다.

## 기능별 목록

| 기능 | 주요 파일 | 자세히 |
|---|---|---|
| 한국어 번역 (UI·데이터·공식 문구) | `public/js/i18n/*`, `public/i18n/ko/*`, `tools/i18n/*` | — |
| 협동 방 채팅, 채팅 맹약 (8개국, 맹약 아이콘) | `server/local-patch.js`, `shared/local.js`, `public/js/ui/chat.js`, `public/js/ui/faction.js`, `public/css/chat.css` | — |
| 채팅 알림음 (다른 참가자의 새 채팅에 이모티콘 효과음, 설정에서 끄기·볼륨·간격·맹약 선택 알림) | `public/js/audio.js` `chatNotification`, `public/js/ui/chat.js`, `public/js/ui/settings.js` | `audio.md` 「채팅 알림음」 |
| 로비 업데이트 소식 (작전 팁 칸의 「업데이트」 탭 + 「업데이트 소식」 창, 원문 `CHANGELOG.md`) | `server/http/changelog.js`, `public/js/ui/patchNotes.js`, `public/js/screens/lobby.js`, `test/changelog.test.js` | `ui.md` 「로비 업데이트 소식」 |
| 서버 재시작 예고 (배포 전 카운트다운, 마지막 5분 판 시작 거부) | `server/local-restart.js`, `public/js/ui/restartNotice.js`, `test/local-restart.test.js` | `ui.md` 「서버 재시작 예고」 |
| 무중단 배포: 서버 세대(`SP_GEN`, accept·drain·standby, `sp_gen` 쿠키, `/healthz/accept`), 드레인 중 새 방·참가·판 시작 거부, 옛 서버 스스로 종료(최대 3시간), 페이지 옮겨 가기(3초·판 끝·다른 탭) | `server/local-generation.js`, `public/js/ui/generation.js`, `test/local-generation.test.js` | `ui.md` 「무중단 배포 — 서버 세대」 |
| `SP_MAX_BOTS` (방마다 AI 팀원 한도), `SP_MAX_BOTS_TOTAL`·`SP_MAX_BOTS_PER_ADDR` (서버 전체·네트워크별 AI 팀원 한도, 연결된 사람이 앉은 방의 AI만 셈, 거절은 `BOT_LIMIT`) | `server/local-patch.js` `botCap` | — |
| AI 팀원 표정 반응 (`SP_BOT_EMOTES=0`이면 끔, upstream 0.2.3) | `server/match/botEmotes.js` | `ui.md` 「upstream 0.2.3 이식 — UI」 |
| 닫은 창의 판 복구 (타이틀·로비 「이 기기의 판 복구」, 같은 브라우저 토큰, upstream 0.2.3) | `public/js/net.js` `createIdentity`, `public/js/ui/resumeMatch.js`, `server/net.js` (`SESSION_IN_USE`) | `ui.md` 「upstream 0.2.3 이식 — UI」 |
| 이모티콘 공식/유저 탭 | `shared/emote-art.js`, `public/img/emotes/*`, `public/js/ui/emotes.js` | — |
| 코드 주소에 빌드 태그 (`/b/<tag>/r/…`, 배포 사이 코드·CSS 영구 캐시, 재방문 때 모듈마다 확인 요청 없음; `node --watch`·`SP_VERSIONED_URLS=0`이면 끔. upstream은 모든 코드 `no-cache`) | `server/http/buildTag.js`, `server/http/static.js`, `server/http/files.js`, `test/lobby.test.js` | — |
| 리소스 미리 받기 (음성 언어 선택 포함) | `public/js/resources.js`, `public/resource-worker.js`, `tools/build-browser-resources.mjs`, `public/css/resources.css` | — |
| 오퍼레이터 음성 언어 선택(한국어/일본어/끄기)과 정비 단계 대사(선택·배치) — 원본 #73 「干员战斗语音」 위에 | `tools/assets/voice.mjs`, `public/js/voice.js`, `public/js/voicePolicy.js` | `audio.md` 「음성」 |
| 선발 오퍼레이터 (0.2.0부터 upstream 自选 틀, 후보 = 望·赤刃明霄陈·维什戴尔·丰川祥子·阿斯卡纶) | `shared/local-diy.js`, `server/sim/content/kits/ops/op-{wang,chen3,wisdel,oblvns,ascln}.js`, `tools/build-data.mjs DIY_LOCAL_INCLUDED` | `diy.md` |
| 선발 소환물 모델 (望 바둑돌·维什戴尔 혼령의 그림자: 웹 미러에 모델이 없어 클라이언트에서 추출) | `tools/local-extract/extract.py TOKEN_SPINES` → `public/assets/local/spine/token/<id>/`, `node tools/fetch-assets.mjs --local-spines` → `tools/assets/local-token-spines.json` | `diy.md` 「소환물 모델」 |
| 함정형 소환물 표시 (望 바둑돌은 HP 바 없음, 望 바둑돌·사일런스 의료 드론은 방향 선택 없이 바로 배치) | `shared/trap-tokens.js` | — |
| 정비 화면 HUD 공식 모양 (라운드 띠·맹약 원·준비 완료 버튼·카운트다운·플레이어 목록·맹약 팝업·기물 정보 창) | `public/js/ui/hudArt.js`, `public/js/ui/detailArt.js`, `public/css/hud-art.css` | `ui.md` 「정비 화면 HUD」 |
| 상점 화면 공식 모양 (카드·버튼·자금·접기·승급·가격, 카드 워터마크 = 特质 유형 아이콘) | `public/js/ui/shopArt.js`, `public/css/shop-art.css` | `ui.md` 「상점」 |
| 배치 UI 공식 모양 (배치 가능 칸 틴트, 공격 범위 줄무늬, 배치 중 반투명, 공식 방향 선택기) | `public/js/render/board3d/tileOverlay.js`, `public/js/ui/placeArt.js`, `public/css/place-art.css`, `test/render/placement-ui.test.js` | `ui.md` 「배치 UI」 |
| 전투 화면 UI 공식 모양 (아군 체력·SP·탄환 바와 레벨 칩, 적·보스 HP 바, 배치 방향 표시, 원소 원형 바, 데미지·회복 숫자, 상태 이펙트, 정비 중 장비 바) | `public/js/render/hud-bars.js`, `public/js/render/facing.js`, `public/js/render/num-official.js`, `public/js/render/number-style.js`, `public/js/render/fxstatus.js`, `public/js/ui/numberStyleSetting.js`, `server/sim/local-hud.js`, `test/local-patch-hud.test.js` | `ui.md` 「전투 화면 UI」 |
| 휴식 진입·현상 수배·전투 종료 화면 공식 모양 (라운드 시작 배너, 机变/悬赏 선택 화면, 전투 종료 배너) | `public/js/ui/phaseArt.js`, `public/css/phase-art.css` | `ui.md` |
| 공식 전투 이펙트 (클라이언트에서 추출한 이펙트 프리팹 재생) | `tools/local-extract/fx_extract.py` → `public/assets/local/fx/**`, `public/js/render/fxplayer.js`·`fxgame.js`·`fxmap.js` | `fx.md` |
| 스킬 중 매 공격 이펙트(공식 모드 바인딩)·이펙트 배속·투사체 꼬리·시전자 이펙트는 유닛 아래 | `shared/skill-modes.js`, `tools/local-extract/char_modes.py` → `public/assets/local/fx/modes.json`(git 밖), `test/local-patch-fxmodes.test.js` | `fx.md` |
| 공식 스테이지 3D 씬 (스테이지별 사막·카시미어·시라쿠사 씬, 라이트맵, 필드별 숨김 세트) | `tools/local-extract/scene_extract.py` → `public/assets/local/scene/**`, `public/js/render/board3d/official.js`, `test/render/board3d-official.test.js` | `render.md` 「공식 스테이지 3D 씬」 |
| 오퍼레이터 배치 낙하 연출 (각 모델의 Start 클립으로 하늘에서 떨어짐) | `public/js/render/units.js` `onDeploy` | `render.md` 「배치 낙하」 |
| 성능 표시 `?perf=1` (fps·시뮬레이션·그리기·이펙트·3D 드로우콜, 멈춤·한 프레임 최대·설명 안 되는 시간, 진단 정보의 라운드별 `perf:` 줄) | `public/js/ui/perfHud.js`, `public/js/diag.js setPerfSource`, `public/js/render/app.js takePeaks`, `test/ui/perf-hud.test.js` | `render.md` 「성능 표시」 |
| 3D 보드 첫 그리기 미리 준비 (셰이더 컴파일·텍스처 업로드를 보이기 전에: 새 3D 보드는 스테이지로 준비될 때까지 2D, 공식 씬은 화면 밖에서 지어 준비 뒤 교체) | `public/js/render/board3d/scene.js _prepare·warm·_warmOfficial`, `public/js/render/app.js warm3d`, `test/render/board3d-official-retry.test.js` | `render.md` 「3D 보드 첫 그리기 미리 준비」 |
| 심해 구역의 지상 적을 0.7칸(잠수원 0.2칸) 내려 그리고 수면 아래 몸을 물빛으로 칠함 (공식 `trap_sea_drown[enemy]`·물 셰이더) | `public/js/render/units.js deepSink`, `test/render/deep-sink.test.js` | `render.md` 「심해 구역 잠김」 |
| 적 경로 미리보기 (공식: 전투 시작에 표시된 레벨 액션의 경로를 커서 2개가 달림, 첫 유닛 3초 전 — 행동개시 대사가 여기서 남) | `server/sim/routePreview.js`, `public/js/battle/runner.js`, `public/js/render/fxroute.js createBattleCursors`, `test/match/route-preview.test.js` | `render.md` 「적 경로 미리보기」 |
| 규칙 모드 클래식·캐주얼 (방마다: 클래식 = 공식 그대로, 캐주얼 = 브리핑 전장 카드·다시 뽑기·보스 경로 미리보기를 켜고 리더 피해 상한을 무효 대신 30만 절삭으로; 옵션 표 하나; 랜덤 매칭 큐도 규칙 모드별, 로비에 큐별 대기 인원) | `shared/ruleset.js`, `server/lobby.js setRuleset`, `server/matchmaking.js counts`, `public/js/ui/ruleset.js`, `public/js/screens/room.js`, `public/js/screens/lobby.js`, `public/js/screens/briefing.js`, `test/ruleset.test.js`, `test/lobby-ruleset.test.js` | `ui.md` 「규칙 모드 — 클래식·캐주얼」 |
| 보스 경로 미리보기 (공식에 없는 편의 기능, 캐주얼 규칙 모드만: 최종 공세·숨겨진 핵심 준비 단계에서 걷는 보스의 이번 판 경로, 대사 없음) | `server/match/bossPath.js`, `public/js/render/fxroute.js`, `tools/boss-route-map.mjs`, `test/match/boss-path.test.js` | `render.md` 「보스 경로 미리보기」 |
| 스킬 효과음 보강 (ON_SKILL_START가 없는 스킬은 ON_ABILITY_START/ON_CUSTOM_TRIGGER [start]/ON_ABILITY_ON/HIT 뱅크) | `tools/assets/skill-sfx.mjs` | `audio.md` |
| 스킬 모드 공격·타격음 + 공식 믹서 그룹 볼륨 + 믹서 스냅샷 | `public/js/audioOfficial.js`, `public/js/audioSnapshot.js`, `tools/assets/skill-mode-sfx.mjs`, `test/local-patch-audio.test.js`, `test/local-patch-skill-music.test.js`, `test/local-patch-skill-snapshot.test.js` | `audio.md` |
| 더빙 효과음 (浊心斯卡蒂: 음성 언어의 더빙판 배치·스킬 시작음에 대사가 섞여 있음 — 공식 `soundFxVoiceLang`; 그 스킬은 작전중 대사 없음 `charWord: false`) | `tools/assets/skill-mode-sfx.mjs dubbedSfx`, `public/js/audio.js unitDub`, `public/js/voicePolicy.js`, `tools/local-extract/skill_cast.py`, `test/audio-dub.test.js` | `audio.md` 「더빙 효과음」 |
| 라운드 작전 종료 효과음 (내 일반 전투 결과에 공식 `ui.ON_ACT1AUTOCHESS_BATTLEOVER_*`) | `public/js/audioOfficial.js battleOverOf` | `audio.md` 「작전 종료 효과음」 |
| 랜덤 매칭 성사·실패·취소음, 방 입장음, 대기 중 숨은 탭에서도 소리 유지 + 탭 제목 깜빡임 | `public/js/ui/matchQueue.js queueCue`, `public/js/screens/room.js joinedDoctors`, `public/js/audio.js keepAwake` | `audio.md` 「랜덤 매칭·방 알림음」 |
| 카운트다운 경고음을 공식대로 주황이 되는 순간 1회 (단계별 공식 경고 시간) | `public/js/ui/gameLogic/phases.js countdownWarnAt`, `public/js/ui/components.js Countdown onWarn` | `audio.md` 「카운트다운 경고음」 |
| 갱신 버튼 강조 (전략이 다음 수동 갱신에 작용할 때 테두리가 빛남: 두요야 라운드 첫 2회, 梓兰 매번, 佩佩 특수 갱신 대기, 贾维 N번째 갱신 직전) | `server/local-patch.js refreshBoost`, `public/css/refresh-boost.css` | — |
| 얼린 상점에서 특수 갱신이 바꾼 칸도 얼림 유지 (원본은 `setShopSlot`이 항상 `frozen: false` → 佩佩·杜遥夜가 넣은 칸이 전투 시작 때 사라짐) | `server/match/effectsMeta.js setShopSlot` | — |
| 디버그용 재화 고정 (`SP_DEBUG_FUNDS=<0..999>`이면 사람 플레이어 재화가 그 값으로 고정, 봇은 그대로) | `server/local-patch.js debugFunds` | `ui.md` 「디버그 패널」 |
| 게임 내 디버그 패널 (로컬 디버그 모드만: 재화 고정, 모든 오퍼레이터·선발 추가(맹약·티어·이름 필터), 다음 전투 추가 적, F2 숨기기, 결산 화면 바로 보기) | `server/local-patch.js` `debugMode`·`debugIntent`·`debugView`, `public/js/ui/debugPanel.js`, `public/css/debug-panel.css` | `ui.md` 「디버그 패널」 |
| 이펙트·사운드 디버그 페이지 = 샌드백 아레나 (`SP_DEBUG_PAGE=1`일 때만, 그 밖에는 404 — `/js/debug/*` 포함) | `public/debug.html`, `public/js/debug.js`, `public/js/debug/arena.js`·`sandbag.js`, `server/local-patch.js debugPageHidden`, `test/local-patch-debug.test.js` | — |
| `/healthz` 축소 (프록시를 거친 요청은 `ok`·`version`·`app`·`build`만, 접속자·방 수는 서버 안에서만) | `server/local-patch.js proxiedRequest` | — |
| 방별 진행 상황 (내부 `GET /healthz/rooms`: 방 코드·모드·난이도·단계·라운드·사람/접속/봇 수·끊긴 뒤 지난 분, 프록시 경유는 404) | `server/local-rooms.js`, `test/local-patch-rooms.test.js` | `ui.md` 「서버 재시작 예고」 |
| 게임 결과 통계 로그 (판이 끝날 때마다 `[stats] {JSON}` 한 줄 — 모드·난이도·스테이지·보스·승패·도달 라운드·시간, 플레이어별 닉네임·봇 여부·라운드·LP·편성·맹약·전투 통계. playerId·시드는 뺌) | `server/local-stats.js`, `test/local-patch-stats.test.js` | — |
| 결산 화면 피드백 보내기 (버그·제안을 서버 `SP_FEEDBACK_DIR`에 보관, `SP_FEEDBACK_REPO`가 있으면 relay가 GitHub issue로 등록) | `server/local-feedback.js`, `server/feedback-relay.js`, `public/js/ui/feedback.js`, `public/css/feedback.css`, `test/local-feedback.test.js`, `test/feedback-relay.test.js` | `ui.md` 「결산 화면 피드백 보내기」 |
| 스킬 범위 발동 — **확정**(관리자 결정 2026-10-11): 클라 `AutoChessBattleTrigger` 그대로(0.2 s 패스·패스당 한 번·2.2 s 블록, rangeId 상자의 적). 옛 `ACTIVE_RANGE`(2026-10-07)는 되돌리기 기록만 | `tools/build-data.mjs resolveTrigger`, `server/sim/skills.js autoTrigger`, `server/sim/battle/lifecycle.js _autoTriggerPass`, `server/sim/content/kits/README.md` 「5. Auto-cast trigger」 | `sim.md` 「스킬 범위 발동」 |
| iframe 차단 헤더 | `server/http/common.js setSecurityHeaders` | — |
| 나가기 창에서 「暂离（AI 托管）」 숨김 — 나가면 자리를 포기한다 | `public/js/ui/matchChrome.js` (`AWAY_OPTION = false`) | — |
| 맹약 스택 세 자리 줄바꿈 수정 | `public/i18n/ko/ko.css` | — |
| 제국의 갑주 등장 폭격·3연타 PRTS 수치, 성당 검사(圣堂剑士) 탄약 소모 스킬·탄약 표시, 더블린 그림자 캐스터(·리더) 외 27종은 비행 아군을 공격하지 않음(자로는 2형태만) | `server/sim/content/local-patch.js` (`NO_AIR_KEYS`, `NO_AIR_FORMS`, `beforeAttack` 재필터) | `sim.md` |
| 频次(특수 HP, "N회 피해로 격파") 적에게 隐德来希 효과가 한 번에 여러 칸을 깎던 것: 萃血 최대 HP 흡수는 频次 적에게 안 걸림(PRTS 萃血 비고 「无法对…拥有特殊生命值机制的敌人…生效」), 心烛가 받은 피해를 원래 적에게 넘길 때 频次 적이면 출처 없는 진실 피해 1회(=1)(PRTS 비고 「无来源真实伤害…如特殊生命值机制」) | `server/sim/content/kits/ops/chess_char_5_06-etlchi.js` | — |

`server/sim/content/local-patch.js`는 시뮬레이션 모듈이라 서버와 브라우저(클라이언트가 돌리는 보스·히든 전투) 양쪽에서 실행된다.
`server/local-patch.js`는 서버 전용이다.

## 버전 표기 (2026-10-06, 관리자 결정; 2026-10-09 하나로 합침)
- 이 포크는 **자체 버전**(semver)을 쓴다. 1.0.0부터(공식 화면 재현판이 첫 정식판).
- **1.2.0부터 버전은 하나**(관리자 결정 2026-10-09): 하드 포크로 원본 기반 숫자가 0.2.0에 멈췄고(0.2.1·0.2.2 수정은 이미 옮겨 와서 오히려
  틀린 정보), 그래서 `shared/constants.js APP_VERSION` 자체를 우리 버전으로 쓴다. `package.json`·`package-lock.json`·`CHANGELOG.md` 첫 항목이 같은 값
  (`test/version.test.js`). `localVersion()`(`shared/local.js`)은 `APP_VERSION`을 그대로 돌려주며, 호환을 위해 `/healthz`·피드백 기록의 `local` 칸에 남는다.
  언어 팩의 `app` 범위 `>=0.2.0`은 1.2.0도 만족하므로 그대로 둔다.
- 올리는 규칙(관리자 결정 2026-10-12, 2026-10-13 고침 — 그 전에는 `feat` 커밋이 하나라도 있으면 가운데 자리였고, 10-12~10-13에는 새 화면·모드도 가운데 자리였다):
  - **끝자리(1.x.y)가 기본.** 공식 재현 수정, 이펙트·소리, 운영·진단 기능, UI 편의, 그리고 새 화면·모드·설정(연합 매칭, 업데이트 소식,
    대국 복구 급)도 끝자리다. upstream에서 옮겨 온 수정 묶음도 아래 목록에 들지 않으면 끝자리.
  - **가운데 자리(1.x.0)는 게임 자체가 넓어지거나 바뀔 때만**: ① 선발 오퍼레이터·전장·적처럼 고를 수 있는 콘텐츠가 늘어남
    ② 전투·경기 규칙 체계를 통째로 교체(스킬 발동 판정, 카드·장비 재고 체계 급) ③ 관리자가 큰 판으로 정한 묶음.
    판별법: 이번 판을 한 줄로 소개할 때 주어가 「새 콘텐츠」나 「바뀐 규칙 체계」이면 가운데, 화면·편의·모드이면 끝자리.
  - `CHANGELOG.md`의 `### 새 기능` 절은 버전 자리와 상관없다. 끝자리 판에도 새로 생긴 기능이 있으면 쓴다(관리자 결정 2026-10-13).
  - **앞자리**는 큰 방향 전환(새 시즌 데이터 등)이고 관리자만 정한다.
  - 버전은 배포 횟수와 무관하다. 커밋 종류(`feat`/`fix`)의 정의는 그대로이고 버전 판정에만 쓰지 않는다.
- 보이는 곳: 타이틀 `v1.2.0 · WEB SIMULATION`(title.js 1줄, 영어 — 관리자 결정), `/healthz`의 `app`·`local`, 서버 시작 로그.
- **버전 올리는 법:** `APP_VERSION`, `package.json`·`package-lock.json`의 version, `CHANGELOG.md` 첫 항목(`## x.y.z — 날짜`), 저장소 `README.md`의 버전 배지와
  `v… · WEB SIMULATION` 문구를 함께 고쳐 커밋한다(`test/version.test.js`가 확인. README에 배포 버전을 쓰기로 한 관리자 결정 2026-10-09).

## 테스트
- 전체 `node --test`: **실패 0이 기준.** 하드 포크부터 upstream 테스트도 우리 것이라, 로컬 동작 변경으로 깨지던 원본 테스트는 「의도한 실패」로
  두지 않고 고쳤다. 고친 곳마다 `local patch` 주석이 근거 절을 가리킨다:
  - 동작 변경에 맞춘 것: `render/unitview` 등급 칩(전투 중 없음), `render/playtest6_elembar`(원소 줄은 공식 발밑 바 `lpBars` 아래),
    `render/feedback3-leader-prep`(보스는 `lpBars`), `sim/battle` 'dmg' 5번째 칸(숫자 플래그), `content/enemies_bosses` 管·弦 첫 발동(공식 SP
    50초 / 25초, `firstCast`), `sim/feedback1f-liftoff` 제국의 갑주 포격(1.33초부터 0.53초 간격, 5.5초 동안 8발), `docs-consistency` 음성 경로
    `/voice/kr/`·결산 대사 보관(`holdResultVoice`), `asset-network` 음성 기본 `kr`, `version` 자체 버전 표기, `ui/feedback3-audio-mix`
    공식 믹서 게인(`officialGain`), `ui/standin-ui` 모델 서명 뒤 소환물 칩, `docs-paths`(옛 설계 문서 15.1절 인용을 문장으로).
  - EN 클라이언트에 없는 것 허용: `ui/emotes`·`ui/localArt`(愚人节 이모티콘 테마 — fooldoctor 등 — `emoticon_foolsday_*` 번들이 EN에 없음: 추출 안 된
    테마는 건너뜀), `ui/moduleIcons`(INC-Y 아이콘이 EN `ui_equip_type_hub_h2_0.ab`·`ui_equip_type_direction_hub_h2_0.ab`에 없고 `inc-x`만 있음 →
    글자 타일), `render/board3d-extract` 立绘(`chararts`는 WebP만 — `ui.md` 「정비 화면 HUD」의 立绘 추출). fooldoctor·INC-Y는 CN 클라이언트가 있어야 뽑을 수 있다.
  - 고친 버그: `render/board3d-extract` 노멀 맵 — EN 클라이언트의 `TX_autochessi_N`은 Unity DXT5nm(R=1, X는 A, Y는 G)인데 BC5(R=X)로 읽어
    파생 노멀이 평평했다(z 평균 128). `tools/local-extract/extract.py derive_normal_rg`가 R이 전부 255이면 A를 X로 쓴다(다시 파생한 노멀 맵은
    B 평균 249); 기존 PNG에서 다시 파생(`run_derived` + `run_webp`, 클라이언트 불필요).
  - 가끔 시간 문제로만 실패(단독 실행은 통과): `lobby` 「solo resume window」, `lobby-integration` 재접속, `match/realtime` 「real-time co-op over websockets」.
  - golden 다이제스트는 전투 규칙을 바꾸면 `npm run golden:update`로 다시 만든다(바뀐 결과가 의도한 것인지 먼저 확인).
- 영역별 테스트 예: `test/local-patch.test.js`(서버 쪽 로컬 기능), `test/local-patch-battle.test.js`(전투 버그: 우타게 S2 그림·저지, 魔王 S3 재분배,
  은신·위장 vs 스플래시, 污染秽蚀 vs 은신), `test/local-patch-camou.test.js`(위장 아이콘 `UF_CAMOU`), `test/local-patch-status-boomerang.test.js`
  (상태 이펙트 중첩, 回环射手 부메랑), `test/local-patch-hud.test.js`(전투 화면 UI: 화면 고정 단위, 아군 바 위치·색, 탄환 칸, 정비 칩, 장비 바, 적·보스 바,
  보스 SP, 원소 링, 공식 숫자, 상태 이펙트, 방향 표시).
