# Dev Inspector

Figma 기본 Inspect 패널(Dev Mode)이 보여 주지 않거나 찾기 어려운 정보를 채워 주는 **읽기 전용** 인스펙터.
문서를 절대 수정하지 않는다. 대상 사용자는 **디자이너와 개발자 모두**:
개발자는 핸드오프 정보를 정확히 읽고, 디자이너는 넘기기 전에 token·번역·아이콘을 검수한다.

Dev Mode와 일반 에디터 양쪽에서 실행된다 (`editorType: ["dev", "figma"]`).

## Dev Mode 대비 채워 주는 것

| Dev Mode의 빈틈 | 이 플러그인 |
|---|---|
| 말줄임(Truncate)은 에디터에서만 보임 | 모든 텍스트 layer의 `truncate` + `maxLines` 표시 (설정 시 강조) |
| grid 간격에 token 정보 없음 | 열/행 간격, gutter, 여백, cell 크기 + 연결된 변수 |
| effect는 선택한 layer 것만 | 하위 트리 전체 effect를 layer별로 묶어 표시, 클릭하면 이동 |
| 텍스트 스펙이 통째로 나옴 | style 이름만(복사 가능), 클릭하면 상세 수치 |
| 중첩 component가 안 보임 | 선택 layer **안쪽** component 트리 (기본 접힘), thumbnail 포함 |
| component 설명이 묻혀 있음 | component(또는 세트) 설명을 헤더에 표시 |
| 아이콘은 선택해야만 내보내기 가능 | 선택·부모·하위에서 아이콘을 구조적으로 찾아(작고 단순한 vector 컨테이너, 또는 이름 `icon-frame`) Figma식 Export 행 제공. 기본 SVG, 래퍼가 아닌 **에셋 자체**를 내보냄 |
| 중첩 layer로 가려면 찾아 헤매야 함 | 아이콘·effect·색·구조 행을 클릭하면 캔버스에서 그 layer 선택 (패널 위치 유지) |
| — | **선택 영역 색상**: 사용된 모든 색을 변수/style별로 묶음. 견본 클릭 시 그 색을 쓴 layer 전부 선택 |
| 번역 현황을 볼 수 없음 | **언어 탭**: 선택 영역의 문자열 변수를 변수 × 언어 표로, 미번역 칸 표시. component 속성으로 들어간 텍스트도 텍스트 layer를 가리킴 |
| layout이 평평한 목록 | 에디터의 auto layout 패널처럼 그림 (auto layout / grid / 절대 위치 대응), 3×3 정렬 컨트롤 포함 |
| 크기 변수 | 너비/높이 변수와 min/max 표시·복사 |
| 위치 | X/Y + 부모 각 변까지의 거리 |
| 절대 위치 layer가 "Fixed"로 보임 | 제약(constraints: `Left and right`, `Scale` …)으로 크기 동작을 읽음 |
| 스트로크가 평평한 목록 | 에디터처럼 layer 속성 → **Fill** → **Stroke**(위치·두께·변별 두께·대시·끝 모양) |
| 명시적 변수 mode가 안 보임 | 디자이너가 직접 지정한 mode(`explicitVariableModes`)를 **속성 탭의 첫 section**에 표시. 선택한 layer뿐 아니라 가장 가까운 부모·하위 layer에 지정된 mode도 보여 주고, **Layer로 이동** 버튼으로 그 layer를 선택한다 |
| Code 뷰 | 제거됨 |

모든 값과 token 이름은 클릭하면 복사된다. token 이름 표시 형식(`group.sub.token` / `group/sub/token`)을 고를 수 있다.

## 패널 구조

- **헤더**: 제목, 새로고침(↻), 언어 토글(`한국어 | EN`).
- **내비 바**: ← / → (브라우저처럼 살펴본 layer 기록을 한 단계씩 이동, 선택 해제 시 기록 초기화), 현재 layer 이름.
- **component 트리**: 탭 위에 고정 높이 스크롤 영역. 아래 그립으로 높이 조절(저장됨). thumbnail on/off·크기 조절.
  - instance thumbnail은 **main component(해당 variant)** 기준.
  - slot에 들어간 component는 분홍 **In Slot** 배지, 다른 파일 소속은 **External source** 배지.
  - 더블클릭 또는 캐럿으로 펼치기/접기, hover 시 **Go to Main Component**.
- **탭** (선택이 바뀌어도 현재 탭 유지, 탭마다 빈 상태 표시):
  - **정보** — 이름, 배지, 설명, component 속성(View all), Go to Main Component
  - **속성** — token 형식 → 변수 mode → 스크롤 동작 → layout → 타이포 → 콘텐츠 → 외형 → 선택 영역 색상 → effect → layout grid
  - **언어** — 번역 표 (열 너비 드래그 조절)
  - **아이콘** — 아이콘 내보내기 카드
  - **내보내기** — Figma Export 패널의 복제: 배율/형식 행, 접미사, 색 프로필, 이미지 resampling(기본 Basic),
    겹친 layer 무시, 미리보기. layer의 기존 `exportSettings`로 시작.
    - **Restore stroke widths**(SVG 기본 on): 그룹 내보내기 시 Figma가 stroke-width를 빠뜨리는 버그를 보정
    - **Add fill / stroke class**(기본 on): 분리된 path에 `class="fill"` / `class="stroke"` 부여
  - **디자인 토큰** — 선택과 무관하게 파일의 로컬 변수를 DTCG `design-tokens.json`으로 내보낸다.
    트리는 rikaride-riderapp의 `tokens/extract/to-dtcg.mjs`와 같지만 더 간결하다 (그 프로젝트 json을 대신하지 못함):
    파일 머리(`$description`·`$generatedAt`), `com.figma.variableId`, token 설명이 없고, mode 목록
    (`com.figma.modes`·`defaultMode`·`modeValues`)은 내보내는 mode가 2개 이상일 때만 쓴다.
    리터럴 색은 `$value`에 hex, `$alpha`에 불투명도(불투명이면 `1.0`). 참조(`{a.b}`)에는 `$alpha`가 없다.
    - 변수가 있는 collection만 체크 목록에 나온다 (변수 0개인 칸막이 collection은 표시하지 않음).
    - 체크된 collection이 참조하는 collection은 잠겨서 뺄 수 없다 (참조를 끝까지 따라감, `참조: …` 배지).
      체크하면 그 아래 사슬이 함께 체크된다. **Text style**·**Paint style**(gradient) 행도 같은 규칙이고,
      쓰는 collection을 `사용: …` 배지로 보여 준다.
    - 맨 위 **Collection 전체**는 내보낼 수 있는 collection을 모두 체크/해제한다 (style 행은 제외,
      해제해도 체크된 항목이 참조하는 collection은 남음).
    - mode가 여러 개인 collection은 체크하면 바로 아래 한 줄에 mode 칩이 나온다 (켜짐/꺼짐 토글, 줄바꿈).
      기본 mode 칩은 `$value`라 잠겨 있다. 끝의 **전체 / 기본만** 버튼으로 나머지 mode를 한 번에 켜고 끈다.
    - 파일 밖(라이브러리·삭제된 변수)을 참조하는 collection과 그것에 기대는 collection은 내보낼 수 없다.
    - 처음엔 `ui.html`의 `TOK_DEFAULT`(rikaride의 token collection 8개와 두 style)만 체크된다.
      선택은 collection 이름 기준, mode 선택은 collection·mode 이름 기준으로 저장된다.

## 내비게이션 동작

- 트리·아이콘 카드 클릭은 layer를 선택하되 **카메라를 움직이지 않는다** (화면 밖이어도).
- 예외: **Go to Main Component**와 **← / →** 는 뷰포트를 부드럽게 이동(`CFG.FOCUS_MS` 동안 트윈). 페이지가 바뀌면 즉시 이동.
- 트리는 선택한 layer를 루트로 그 내용만 보여 준다. 트리 안의 행을 클릭할 때는 트리를 유지하고 강조만 옮긴다.
- 행에 hover하면 캔버스에서 잠시 그 layer를 선택해 보여 준다(실제 선택 교체 → hover 종료 시 복원).
  같이 보고 있는 협업자에게는 선택이 잠깐 깜빡여 보일 수 있다.

## 설치

Figma → Plugins → Development → Import plugin from manifest… → 이 폴더의 `manifest.json`.
Dev Mode에서 Plugins → Dev Inspector. 배포 전에는 `manifest.json`의 `"id"`를 Figma가 발급한 id로 바꾼다.

## 설정 (`code.js` 상단 `CFG`)

| 키 | 의미 |
|---|---|
| `ICON_FRAME` | 항상 아이콘 래퍼로 취급할 이름 (`"icon-frame"`) |
| `ICON_MAX_PX`, `ICON_MAX_NODES` | 구조적 아이콘 감지 기준 |
| `LANGUAGE_COLLECTION` | mode가 언어인 변수 collection 이름 (`"language"`) |
| `MAX_TRANSLATIONS` | 번역 표 행 상한 |
| `MAX_TREE_DEPTH`, `MAX_TREE_NODES` | component 트리 한도 |
| `MAX_EFFECT_NODES`, `MAX_ICONS`, `MAX_SEGMENTS`, `MAX_PATH` | 기타 한도 |
| `FOCUS_MS`, `THUMB_PX` | 카메라 이동 시간, thumbnail 내보내기 크기 |

## 파일

- `manifest.json` — 매니페스트 (`capabilities: ["inspect"]`, 네트워크 없음)
- `code.js` — main 스레드: 노드 읽기, 변수/style 해석, 내보내기
- `ui.html` — 패널 UI (공유 디자인 시스템, 한국어/영어)
- `test/` — Node 기반 테스트 묶음 (`sh test/run.sh`)
- `docs/notes.md` — 구현 메모·알려진 한계
