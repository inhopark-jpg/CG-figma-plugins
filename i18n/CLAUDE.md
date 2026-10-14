# CLAUDE.md — i18n

`language` 컬렉션의 번역용 STRING 변수를 관리하는 Figma 플러그인. 기능은 [README.md](README.md),
내부 구조 상세는 [docs/architecture.md](docs/architecture.md), 공통 규칙은 [../CLAUDE.md](../CLAUDE.md).

## 실행·검증

- 빌드·린트·테스트 없음. `code.js`, `ui.html` 두 파일을 Figma가 직접 로드한다.
- 설치: Figma 데스크톱 → Plugins → Development → Import plugin from manifest… → `manifest.json`.
- 수정 후 Figma에서 플러그인을 다시 실행해야 반영된다 (핫 리로드 없음).
- **넘기기 전 문법 검사** (Figma 샌드박스가 없으므로 API 실행은 불가, 문법만):
  `node -c code.js`, 그리고 `ui.html`의 `<script>` 블록을 추출해 `node -c`.
- 상위 폴더 저장소(CG-figma-plugins)의 일부다. 이 폴더에 따로 저장소를 만들지 않는다. 커밋은 사용자가 요청할 때만.
- `xlsx.full.min.js`(gitignore)는 현재 **로드되지 않는** 보관용 서드파티 라이브러리다. CSV는 `ui.html`의
  `parseCSV`/`generateCSV`가 직접 처리한다. 수정하지 말 것.

## 구조 요약

- `code.js` — Figma main 스레드(QuickJS). 모든 변수·노드 변경의 주체이자 진실의 원천. 현재 페이지만 다룬다.
  `pushState()`가 선택 상태를 `{ type: "state" }`로 보낸다. 메시지는 `figma.ui.onmessage`의 `msg.type` 분기.
- `ui.html` — 패널. 상태는 전역 `S` 하나, `innerHTML` 재구성으로 렌더. `post({ type })`로 main에 요청하고,
  `*-result` 메시지를 기다리거나 `{ type: "refresh" }`로 state를 다시 받는다.
- 보고서/키 레이어 재지정 중(`S.reportOpen`, `S.relocating`)에는 들어오는 `state`를 무시한다.

## 키 레이어·연결 해제·삭제

- `pushState`가 선택마다 `keyLayerStatus`로 키 레이어 상태(`current` / `elsewhere` / `missing` / `none`)를 계산해
  `variable.keyStatus`로 보낸다. 키 노드가 없거나 더 이상 그 변수에 연결되지 않았으면 `missing`.
- `unlinkBinding(b)`는 보이는 텍스트를 유지한 채 연결만 끊는다(property 종류는 현재 값을 문자열로 넣음).
- `handleDeleteVar`는 항상 `unlinkUsagesOnPage`로 **현재 페이지**의 사용처(번역 테이블 행 제외)를 먼저 해제한 뒤 삭제한다.
  다른 페이지의 사용처는 그 페이지의 정리에서 끊긴 연결로 잡힌다(페이지 단위 원칙).
- 편집 화면(`renderEdit`): 값 편집 아래 패널 3개 — 토큰(교체) / Key 레이어(상태·이동·지정) / 연결(해제·삭제).
  아이콘은 `ICON` + `ico()` / `ibtn()`. key 레이어면 `토큰 삭제`(두 번 클릭), 아니면 `해당 레이어에서 연결 해제`.
  정리 보고서의 key 없는 토큰에는 `usageCount` 기반 배지, 사용 중인 토큰의 삭제는 두 번 클릭.
- 토큰 없는 레이어: `renderPrimary`는 "연결된 토큰 없음" 안내 + `토큰 생성하기` 버튼만 보여 주고, 눌러야 `renderCreate`
  (돌아가기는 `S.createOrigin`). 값은 `S.draft`(노드별)에 유지.
- 토큰 정리는 **key 레이어를 자동 지정하지 않는다**(예전 backfill 제거 — 사용자 결정).
- 보고서 항목 클릭 = "peek": `navigate-to-usage`(key 레이어 → 없으면 화면 중앙에서 가장 가까운 사용처 선택) →
  `navigate-usage-result` → 이어지는 state로 일반 편집 화면. `S.reportPeek` 동안 state를 받고 모든 화면 위에
  `정리 결과로 돌아가기` 바(`render()` 래퍼). 돌아갈 때 `leavePeek`가 해결된 항목을 목록에서 뺀다.
  현재 페이지에 사용처가 없으면 `selectUsageOnOtherPage`가 다른 페이지를 차례로 `loadAsync`해 찾고(key 레이어의 기록 페이지부터)
  페이지를 전환한다 — 명시적 클릭에서만. 파일 어디에도 없으면 `renderMissingEdit`(값+설명, `save-missing`이 description도 저장).
  `다른 토큰 값 가져오기` = 목록 `listMode: "import"` → 선택한 토큰의 값만 draft에 복사(연결하지 않음).
- 선택 없음: `renderHome` — 토큰 검색, 클릭 시 `keyNodeId`(serializeVar가 포함)로 이동.
- UI 용어: variable = **토큰 / token**, key layer = **key 레이어 / key layer**, "이 레이어" 대신 **"해당 레이어"**.
  CSV 헤더(`Variable Name` 등)와 Figma 용어 "variable collection"은 데이터·고유명이라 그대로 둔다.

## 번역 테이블 (code.js "Translation tables" 섹션)

- 진입점: `handleCreateTable`, `handleUpdateTable`, `handleRestoreTemplates` (UI 메시지 `table-create` / `table-update` / `table-restore`),
  2초 폴링 `syncCurrentPageTables`, 선택 정보 `tableInfoFor` → state `table-source` / `table-table`.
- 저장(plugin data, `figma.root`): 템플릿 id `i18nTplTable` / `i18nTplRow`, 템플릿 열 서명 `i18nTplSig`,
  테이블 레지스트리 `i18nTables` = `{ 테이블 instance id: { p: 페이지 id, s: 원본 레이어 id } }`. 테이블 instance에는 `i18nSig`.
- 행은 `i18n-slot` > `i18n-rows` 프레임 안에 있고, row 템플릿의 TEXT 속성 `value`(모든 열 텍스트가 참조)에 변수를 연결한다.
  행 식별도 이 속성의 연결로 한다. 템플릿 구조는 이름으로 찾는다: 열 = `language-N` 프레임, 슬롯 = SLOT 노드.
- **성능 규칙 (1000개 변수로 측정)**: 슬롯에 행을 하나씩 넣지 말 것(행이 늘수록 느려짐) — 큰 묶음은 `buildRowsFrame`으로
  auto layout을 끈 채 만든 뒤 한 번에 넣는다. 루프 안에서 `node.children`을 반복해 읽지 말 것(매번 새 배열 → O(n²)).
  행별 `await`(getMainComponentAsync 등)는 명시적 업데이트에서만.
- **페이지 단위 원칙**: 폴링·동기화는 현재 페이지의 레지스트리 항목만 다룬다. 다른 페이지 노드를 불러오는 코드를 폴링에 넣지 말 것.
  `figma.loadAllPagesAsync()`는 템플릿을 처음 찾을 때(사용자 동작)만 쓴다.
- 동시 실행 방지: 사용자 동작은 `withTableLock`, 폴링은 잠금 중이면 건너뛴다.
- 구조를 바꾸면 `TABLE_RENDER_VERSION`을 올려 기존 테이블이 한 번 다시 만들어지게 한다. 상세: [docs/architecture.md](docs/architecture.md).

## QuickJS 제약 (code.js만)

- 스프레드, `for...of`, `new Set()` 금지. `var`와 인덱스 `for` 사용. `Object.assign`은 가능.
- 유니코드 속성 이스케이프(`\p{L}`, `u` 플래그) 금지 → `\uXXXX` 범위로 (`dashClean` 참고).
- `getVariableByIdAsync(id)`는 로컬에서 삭제된 변수도 캐시된 데이터를 돌려준다. 존재 확인은
  `getLocalVariablesAsync("STRING")` 결과에 있거나 `variable.remote === true`일 때만 유효 (`scanCurrentPage` 참고).

## UI 규칙 (이 플러그인)

- 공유 디자인 시스템 사용 (`@ds` 블록은 생성물). 고유 CSS는 블록 뒤: `.list-*`, `.report-*`, `.error-banner`,
  `.mode-tag`, `.key-current`, `.view-title` 등. 글자 크기는 12/13/11px만 (10px 금지).
- 이 플러그인은 `main`이 통째로 스크롤한다 → 공유 `main` 레이아웃을 `display:block; overflow-y:auto`로 덮어씀.
- 헤더: 제목(`language`) 행 오른쪽 끝에 언어 토글, 아래에 CSV·정리 버튼 행.

## 다국어

- UI: `I18N = { en, ko }` + `t(key)`. main: `STRINGS` + `L(key)` (`figma.notify`용).
- 저장 키 `language_vars_lang` (기본 `ko`), 메시지 `set-lang`. 새 문자열은 두 파일의 두 언어 모두에 추가.
- 검색 등 즉시 반응 입력은 IME 안전 패턴(`compositionstart/compositionend` + `composing` 플래그)을 따른다.

## 주의

- 확인 대화상자에 `window.confirm()`을 쓰고 있다(CSV 가져오기, 변수 정리). Config Manager 쪽 주석에는
  "Figma 플러그인 iframe이 confirm/prompt를 막는다"고 되어 있으니, 동작이 이상하면 이 부분을 먼저 의심할 것.
  바꾸려면 공유 `.overlay` + `.dialog`를 쓴다 (기능 변경이므로 사용자 확인 후).
