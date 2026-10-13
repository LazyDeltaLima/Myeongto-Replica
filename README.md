# 명토 레플리카 · Myeongto Replica

명일방주의 별도 게임 모드 「위수 협의: 맹약」(卫戍协议：盟约 · _Stronghold Protocol: Alliance_, 유저들이 부르는 이름은 「명토체스」)을 **인게임과 최대한 같게** 브라우저에서 재현하는 비공식 팬 프로젝트입니다. 혼자(단독 시뮬레이션) 또는 1–4인 협동(연합 시뮬레이션)으로 플레이합니다.

[sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol) v0.2.0에서 갈라져 나온 **한국어 하드 포크**입니다.

![version](https://img.shields.io/badge/version-1.4.2-2ea44f)
![license](https://img.shields.io/badge/code%20license-GPL--3.0--or--later-blue)
![node](https://img.shields.io/badge/node-22%20%7C%2024-339933)

English summary: [below](#english) · 中文说明：[见下](#中文)

## 고지

> [!IMPORTANT]
>
> - 이 프로젝트는 유저가 만든 **비공식 팬 작품**입니다. Hypergryph, Yostar 및 관계사와 **아무 관계가 없고**, 허가나 승인을 받지 않았습니다.
> - 명일방주와 「위수 협의」에 관련된 이름, 캐릭터, 그림, 음악, 효과음, 텍스트, 데이터의 저작권은 원 권리자에게 있습니다. 이 소재에는 GPL-3.0이 **적용되지 않으며**, GPL은 이 프로젝트가 직접 작성한 코드에만 적용됩니다.
> - 학습과 개인적인 비상업 용도로만 쓸 수 있습니다. 판매, 유료 배포, 유료 서버, 광고·후원·멤버십 등 **어떤 형태의 수익화도 금지**합니다.
> - 이 저장소에는 게임에서 추출한 그림·소리 파일이 없습니다. 공식 데이터 테이블로 만든 데이터(`data/`), 스크린샷 몇 장, 유저 이모티콘 그림만 있으며 이것들도 GPL 대상이 아닙니다.
> - **공식 전투 이펙트와 스테이지 3D 씬 같은 클라이언트 소재는 제공하지 않습니다.** 쓰려면 본인 PC에 설치한 게임 클라이언트에서 직접 추출해야 합니다([클라이언트에서 추출하는 소재](#클라이언트에서-추출하는-소재-선택)). 추출한 파일을 다시 배포하지 마세요.
> - 권리자께서 권리 침해라고 판단하시면 Issue로 연락해 주세요. **바로 삭제**하겠습니다.
> - 있는 그대로 제공하며 **어떤 보증도 하지 않습니다**. 전체 조항은 [NOTICE.md](NOTICE.md)(원본에서 가져온 중국어 문서)에 있습니다.

## 원본과 다른 점

- **목표는 인게임 재현입니다.** 규칙·수치·화면·연출을 공식 데이터 테이블 → 글로벌(EN) 클라이언트 데이터 → PRTS → 나무위키·커뮤니티 순서로 확인하고, 근거를 찾지 못한 것은 `[추정]`으로 표시합니다. 원본과 다르게 정한 것과 그 근거는 [docs/rules/](docs/rules/README.md)에 영역별로 적습니다.
- **한국어가 기본입니다.** 공식 한국 서버 문구와 직접 다듬은 UI 번역, 오퍼레이터 음성 언어 선택(한국어/일본어/끄기), 협동 방 채팅이 있습니다.
- **공식 화면과 연출.** 정비 화면 HUD, 상점, 배치 UI, 전투 HUD, 라운드 배너를 클라이언트 프리팹의 좌표와 그림 그대로 재현합니다. 클라이언트에서 추출한 전투 이펙트 프리팹을 그대로 재생하는 이펙트 플레이어와 스테이지별 공식 3D 씬도 있습니다(둘 다 직접 추출해야 보입니다).
- **선발 오퍼레이터**는 키트를 구현하고 공식 동작과 대조한 8명만 고를 수 있습니다: 왕, 첸 더 던스트릭, 위셔델, 토가와 사키코, 아스카론, 켈시 에스페란타, 클레멘티아, 안젤리나 더 멜로우 위시(뒤의 세 이름은 한국 서버 출시 전이라 비공식 번역).
- **원본과의 관계.** 2026-10-07에 v0.2.0을 병합한 것이 마지막입니다. 그 뒤로는 원본의 버그 수정과 기능을 골라서 손으로 옮겨 옵니다([docs/rules/upstream.md](docs/rules/upstream.md)).

현재 버전은 **1.4.2**이며 타이틀 화면 아래에 `v1.4.2 · WEB SIMULATION`으로 표시됩니다. 버전 번호는 이 저장소가 따로 매깁니다. 완성본 zip(Releases)은 배포하지 않으므로 소스에서 실행합니다.

## 실행하기

필요한 것: [Node.js](https://nodejs.org/) 22 또는 24(LTS), Git, WebGL을 지원하는 최신 브라우저(PC·휴대폰·태블릿, 가로 화면 권장).

```bash
git clone https://github.com/LazyDeltaLima/Myeongto-Replica.git
cd Myeongto-Replica
npm install        # 의존성 설치 (postinstall이 pixi / preact / three를 public/vendor로 복사)
npm run setup      # 환경 점검 + 공개 커뮤니티 미러에서 그림·소리 약 460 MB 받기 (중단해도 다음에 이어받음)
npm start          # http://localhost:3000
```

브라우저에서 `http://localhost:3000`을 열면 처음에는 한국어로 나옵니다. 언어는 타이틀 화면이나 설정에서 바꿀 수 있습니다.

| 환경 변수       | 기본값    | 설명                                                                               |
| --------------- | --------- | ---------------------------------------------------------------------------------- |
| `PORT`          | `3000`    | 리스닝 포트 (`PORT=8080 npm start`)                                                |
| `HOST`          | `0.0.0.0` | 리스닝 주소 (`127.0.0.1` = 이 PC에서만, 리버스 프록시 뒤에 둘 때)                  |
| `SP_MAX_BOTS`   | 제한 없음 | 협동 방 하나에 넣을 수 있는 AI 팀원 수                                             |
| `SP_MAX_BOTS_TOTAL` | 제한 없음 | 서버 전체 AI 팀원 수. 연결된 사람이 앉아 있는 방의 AI만 센다 |
| `SP_MAX_BOTS_PER_ADDR` | 제한 없음 | 같은 네트워크에서 만든 방들의 AI 팀원 수 (세는 방식은 위와 같음, 로컬·LAN 접속은 제외) |
| `SP_BOT_EMOTES` | 켜짐      | 사람과 AI가 섞인 판에서 AI 팀원의 표정 반응. `0`이면 끔                            |
| `SP_COMBAT`     | `client`  | `client`: 각 플레이어 브라우저가 자기 전투를 계산 / `server`: 서버가 계산해서 보냄 |
| `SP_VERIFY`     | `off`     | 클라이언트가 보낸 전투 결과를 서버가 다시 계산: `off` / `sample`(약 1/8) / `all`   |

**친구와 같이 하기**: 「연합 시뮬레이션」 → 「방 만들기」 → 4글자 「초대 코드」나 「링크 복사」로 받은 `?room=코드` 주소를 보냅니다. 같은 공유기에 연결된 친구는 서버를 켠 창에 나오는 `http://192.168.x.x:3000` 주소로 들어오면 됩니다. 외부에서 접속하게 하려면 [docs/DEPLOY.md](docs/DEPLOY.md)(중국어 문서)를 참고하세요. 방과 판은 서버 메모리에만 있어서 **서버를 다시 켜면 진행 중인 판이 모두 끝납니다**.

## 클라이언트에서 추출하는 소재 (선택)

아래 소재는 이 저장소에도, `npm run setup`이 쓰는 미러에도 없습니다. 본인 PC에 설치한 명일방주 클라이언트에서 직접 추출해야 합니다(Python 3.8 이상, 의존성은 프로젝트 안 `.venv-extract`에 설치). 개발 중에는 글로벌(EN) PC 클라이언트로 확인하고 있습니다. `tools/local-extract/`의 추출 도구는 클라이언트의 `Arknights_Data` 폴더를 이 순서로 찾습니다: 환경 변수 `SP_CLIENT` → 저장소 `.env` 파일의 `SP_CLIENT=…` 줄 → 저장소 안 `.client/Arknights_Data`(설치 폴더를 가리키는 링크). `.env`와 `.client`는 git에서 제외되고, 명령마다 `--client`로 바꿀 수도 있습니다.

| 소재                                              | 추출 방법                                                                                                     | 없을 때                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 3D 보드, 일부 공식 UI 아이콘, 소환물·일부 적 모델 | `node tools/setup.mjs --local`                                                                                | 2D 보드, 비슷한 대체 그림, 소환물은 초상화 |
| 스테이지별 공식 3D 씬                             | `tools/local-extract/scene_extract.py` ([docs/rules/render.md](docs/rules/render.md) 「공식 스테이지 3D 씬」) | 공통 3D 보드(위 추출이 없으면 2D 보드)     |
| 공식 전투 이펙트                                  | `tools/local-extract/fx_extract.py` (사용법은 파일 머리말, [docs/rules/fx.md](docs/rules/fx.md))              | 직접 그린 기본 이펙트                      |

추출한 파일은 `public/assets/local/` 아래에 생기고 git에서 제외됩니다. 커밋하거나 다시 배포하지 마세요.

## 개발

```bash
node --test                                          # 전체 테스트 (브라우저 테스트는 자동으로 건너뜀) — 기준선은 실패 0
node --test test/local-patch-diy.test.js             # 파일 하나
npm run lint && npm run check:imports && npm run typecheck
npm run golden                                       # 결정론 전투 결과 전체 비교
```

- 코드 지도: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)(영어)
- 원본과 다르게 정한 규칙과 근거: [docs/rules/](docs/rules/README.md)(한국어)
- 그 밖의 `docs/` 문서 대부분은 원본에서 온 중국어·영어 문서입니다.

## 기여

Issue와 Pull Request를 환영합니다. **한국어로** 써 주세요.

- 공식과 다르게 동작하는 부분을 제보할 때는 근거(공식 플레이 영상·스크린샷·PRTS 문서 등)를 함께 주시면 가장 빨리 고칠 수 있습니다.
- 오류가 났을 때는 게임의 설정 → 「문제 제보」 → 「진단 정보 복사」로 복사한 내용을 Issue에 붙여 주세요.
- 코드와 주석은 영어, 커밋 제목은 `type(area): …` 형식입니다. 자세한 안내는 [CONTRIBUTING.md](CONTRIBUTING.md)에 있습니다.
- 게임 소재 파일은 커밋하지 마세요(`public/assets/`는 `.gitignore`로 제외).
- 광고·결제·후원 등 수익화 기능은 받지 않습니다.
- 제출한 코드는 GPL-3.0-or-later로 공개됩니다.

## 라이선스

- **코드**: 이 프로젝트가 직접 쓴 코드는 **GPL-3.0-or-later**입니다([LICENSE](LICENSE)). pixi-spine에 들어 있는 Spine Runtimes와 함께 배포할 수 있도록 GPL 제7조 추가 허가가 붙어 있습니다([NOTICE.md](NOTICE.md)).
- **게임 소재는 제외**: 명일방주 관련 그림·음악·효과음·텍스트·데이터는 원래 권리자의 것이며 GPL이 적용되지 않습니다. 사용 제한은 위의 [고지](#고지)와 [NOTICE.md](NOTICE.md)를 따릅니다.
- **제3자 구성 요소**는 각자의 라이선스를 따릅니다: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## 출처와 감사

- 원본: [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol)과 기여자분들 — 이 프로젝트 코드의 바탕입니다.
- 한국어 포크: [Gyeongdeock-Seo/Stronghold-Protocol_Ko](https://github.com/Gyeongdeock-Seo/Stronghold-Protocol_Ko) — 한국어 번역의 출발점입니다.
- 유저 이모티콘 그림 36장: [moring-m/Stronghold-Protocol_Ko_Arca](https://github.com/moring-m/Stronghold-Protocol_Ko_Arca).
- 게임 데이터: [Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData), [Kengxxiao/ArknightsGameData_YoStar](https://github.com/Kengxxiao/ArknightsGameData_YoStar).
- 소재 미러: [yuanyan3060/ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource), [fexli/ArknightsResource](https://github.com/fexli/ArknightsResource), [isHarryh/Ark-Models](https://github.com/isHarryh/Ark-Models), [ArknightsAssets/ArknightsAssets2](https://github.com/ArknightsAssets/ArknightsAssets2). 글꼴: [TimWangZi/The-font-of-Arknights](https://github.com/TimWangZi/The-font-of-Arknights), Google Fonts(Noto Sans SC). 자세한 목록은 [docs/ASSETS.md](docs/ASSETS.md).
- 규칙 확인: [PRTS](https://prts.wiki/), [나무위키](https://namu.wiki/).
- 클라이언트 추출: [isHarryh/Ark-Unpacker](https://github.com/isHarryh/Ark-Unpacker)(LZ4AK 해제, BSD-3-Clause), [UnityPy](https://github.com/K0lb3/UnityPy)(MIT).
- 라이브러리: [PixiJS](https://pixijs.com/), [pixi-spine](https://github.com/pixijs/spine)(안의 Spine Runtime은 [Spine Runtimes License](https://esotericsoftware.com/spine-runtimes-license)), [three.js](https://threejs.org/), [Preact](https://preactjs.com/) + [htm](https://github.com/developit/htm), [ws](https://github.com/websockets/ws).

이 프로젝트들을 만들고 관리하는 분들, 그리고 이 게임을 만든 Hypergryph에 감사드립니다.

---

## English

An **unofficial, non-commercial fan remake** of Arknights' standalone game mode _Stronghold Protocol: Alliance_ (卫戍协议：盟约; Korean players call it 「명토체스」), played in the browser solo or in 1–4 player co-op. It is a Korean **hard fork** of [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol) at v0.2.0 whose goal is to match the in-game behaviour as closely as possible; rules and their evidence are in [docs/rules/](docs/rules/README.md) (Korean).

- **Run:** Node.js 22 or 24, then `npm install && npm run setup && npm start` and open <http://localhost:3000>. `setup` downloads ~460 MB of art from public community mirrors. There are no release bundles.
- **Client-only assets are not provided:** the official battle effects, per-stage 3D scenes and a few models are extracted from your own installed client (`node tools/setup.mjs --local`, `tools/local-extract/scene_extract.py`, `tools/local-extract/fx_extract.py`). Without them the game falls back to the 2D board and its own effects. Do not redistribute extracted files.
- **Disclaimer:** not affiliated with or endorsed by Hypergryph or Yostar. All Arknights names, art, audio, text and data are © their respective owners and are **not** covered by this project's GPL licence. For study and personal non-commercial use only — no selling, paid distribution, paid servers or monetisation of any kind. Content will be removed on request of the rights holders. Provided "as is", without warranty.
- **License:** code GPL-3.0-or-later ([LICENSE](LICENSE), with the Spine Runtimes permission in [NOTICE.md](NOTICE.md)); game assets excluded.
- **Contributing:** issues and pull requests are welcome; this fork works in Korean, but English reports are fine too.

## 中文

本仓库是 [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol)（《明日方舟》「卫戍协议：盟约」非官方同人复刻）在 v0.2.0 之后分出的**韩语硬分叉**，目标是尽量还原游戏内的规则、画面与演出，不再与原仓库合并，只按需移植修复。与原仓库同样是非官方、非商业的同人作品，与鹰角网络 / Yostar 无关；游戏素材版权归原权利人，不适用 GPL。本仓库不提供官方战斗特效、关卡 3D 场景等客户端素材，需要从自己安装的客户端提取。运行方法：`npm install && npm run setup && npm start`。Issue 和 PR 请尽量使用韩语；原版的问题请到原仓库反馈。
