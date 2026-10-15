# i18n — 내부 구조

[CLAUDE.md](../CLAUDE.md)의 보충. 그룹 모델, 변수 식별, 정리 보고서, CSV 스키마의 세부 동작.

## 그룹 모델

- `getGroupPath(node)` (code.js): 조상을 위에서 아래로 훑어 `SECTION` 이름 최대 3개 + 첫 비섹션 레이어를 모아
  `section-A/section-B/layer-C` 같은 경로를 만든다 (페이지 자체는 제외).
  각 세그먼트는 `buildSegment`가 `section-` / `layer-` 접두어를 붙이고 `dashClean`으로 정리한다.
- `masterKey(groupPath)` = 경로의 첫 세그먼트 (가장 바깥 섹션, 섹션이 없으면 레이어 자체).
  변수를 연결/교체할 때 "이 그룹"은 정확한 레이어 그룹이 아니라 이것을 뜻한다 — 너무 좁게 걸러지는 것을 막기 위함.
  "이 그룹 밖에서 검색"은 전체 변수로 넓힌다.
- 변수 **이름**은 `그룹/리프` 형식으로 그룹을 담는다 (`splitName`).
- `dashClean`: 허용 목록 정규식. 실제 문자(라틴·그리스·키릴·아랍·태국·한글·가나·한자)의 글자·숫자와 `-`만 남기고
  공백·문장부호·화살표·이모지를 제거한다. 섹션 이름의 장식 기호는 URL 인코딩이 아니라 아예 사라져야 한다.

## 변수 식별과 키 레이어

- 각 변수는 소문자·숫자 6자 ID(`genId`)를 받아 이름의 리프로 저장한다.
  plugin data `idAssigned`로 마이그레이션 완료를 표시해, 정리를 다시 실행해도 ID를 재생성하지 않는다.
- plugin data `keyNodeId` + `keyPageId`가 변수를 그 변수를 "소유"하는 텍스트 레이어(키 레이어)에 고정한다.
  정리는 현재 페이지만 검사하므로 페이지별로 저장한다.
- `WARN`(`⚠️`): 키 레이어를 잃은 변수의 리프 앞에 붙는 표시.
- `MISSING`(`--`): 미번역 모드 값을 나타내는 표시값.

## 정리 보고서 (가장 복잡한 UI 흐름)

`handleCleanup()` (code.js)이 현재 페이지를 검사해 세 범주를 돌려주고, `ui.html`의 `renderReportView`가 한 화면에 보여 준다.

1. 키 레이어가 없는 변수 — 기록된 key 레이어가 이 페이지에 없으면 표시. 다른 사용처를 key로 자동 채택하지 않는다(사용자 결정)
2. 변수 연결이 끊긴 텍스트 레이어
3. 미번역 모드 값이 있는 변수

각 범주는 정리를 다시 실행하거나 보고서를 잃지 않고 그 자리에서 해결할 수 있다.

- **키 레이어 재지정** — `renderRelocate()` 하위 화면. 보고서(표시된 변수)와 일반 편집 화면 양쪽에서 쓰며
  `relocOrigin`으로 구분한다. 캔버스에서 텍스트 레이어를 고른 뒤 확인.
- **끊긴 연결에 변수 지정** — `renderAssignBroken()` 하위 화면. 일반 연결 목록과 같은 "+ 새 변수" /
  "이 그룹 밖에서 검색"을 가진 보고서 내 변수 선택기로, 캔버스 선택과 무관하게 특정 node id에 연결한다.
- **미번역 값 편집** — `renderMissingEdit()` 하위 화면. 일반 편집과 같은 모드별 textarea지만
  현재 선택이 아니라 변수 id로 저장한다 (`handleSaveMissing`).

세 하위 화면 모두 `S.reportOpen`을 유지하고, 취소·뒤로·성공 시 `renderReportView()`로 돌아가며
해결된 항목을 `S.reportFlagged` / `S.reportBroken` / `S.reportMissing`에서 제자리 제거한다.
보고서에는 각 변수가 페이지에서 처음 쓰인 레이어로 이동하는 링크(`usageByVar`, `navigate-to-node`)가 있다.

## CSV 스키마

`generateCSV` (ui.html) 열 순서: `1st Section`, `2nd Section`, `3rd Section`, `Layer Name`, `Variable Name`,
`Description`, 이후 모드별 1열.

`handleImportCsv` (code.js):

- 행을 `Variable Name` 열(6자 ID)로 변수에 매칭한다.
- 설명 열은 인덱스가 아니라 **헤더 이름**(`DESC_HEADER_KEY`)으로 찾는다. 그래서 설명 열이 생기기 전 CSV도
  설명을 건드리지 않고 가져올 수 있다. 결과적으로 `Description`은 예약된 헤더다 — 그 이름의 모드는 설명 열에 먹힌다.
- 설명 칸이 있는데 비어 있으면 설명을 지우고, 열 자체가 없으면 그대로 둔다.
- 인덱스 5 이후 `Description`이 아닌 헤더는 모드이며, 없는 모드는 새로 만든다.

## 노드 지원

- 일반 텍스트 레이어: `setBoundVariable('characters', …)`.
- TEXT 컴포넌트 속성으로 텍스트가 들어간 인스턴스: 속성을 통해 연결(`setProperties` + `createVariableAlias`).
  텍스트 레이어나 인스턴스 어느 쪽을 선택해도 해석한다 (`findInstanceForProp` / `resolveBinding`).
- 섹션 구성은 사용자가 캔버스에서 관리한다. 플러그인은 `SECTION` 조상을 읽기만 한다.

## 다국어 저장

`clientStorage` 키: `language_vars_recent`(최근 사용 변수), `language_vars_lang`(언어, 기본 `ko`).

## 번역 테이블

- **템플릿**: `getTemplates(searchFile)` — 저장된 id → 현재 페이지에서 이름 검색 → (사용자 동작일 때만) 전체 페이지 이름 검색.
  상태는 `ok` / `missing`(저장된 적 있는데 삭제됨) / `none`(처음). 10초 캐시. 없으면 `buildTemplates`가 참조 디자인
  (Rider-App › Utility의 i18n-table/i18n-row)과 같은 스타일로 현재 페이지에 만든다.
- **열**: `syncTemplateColumns`가 두 템플릿의 `language-N` 열 수를 모드 수에 맞춘다(마지막 열 복제, 왼쪽 테두리 0).
  모드가 많아도 `TABLE_MAX_COLUMNS`(3)개까지만 — `tableModes(ctx)` = 컬렉션 순서의 앞 3개 모드.
  너비는 `TABLE_WIDTH`(1500) 고정 — 각 열을 `columnWidth(i, n)`으로 균등 분할(남는 px는 앞 열). 서명(`i18nTplSig`)에 너비가 들어 있다.
  헤더 텍스트 = 모드 이름, row 템플릿의 각 열에 `setExplicitVariableModeForCollection(language, 모드)` —
  instance가 이 모드를 물려받아 열마다 해당 언어 값이 보인다. 메인 컴포넌트 수정이므로 모든 instance에 즉시 전파된다.
- **행**: `syncTable` — 원본 레이어 하위의 TEXT/INSTANCE 중 **그 토큰의 key 레이어인 노드**(`keyNodeId` 일치, 컴포넌트 속성이면
  instance id 일치)의 토큰만 문서 순서·중복 없이 모은다(`collectSourceVars`). key 레이어가 바뀌면 다음 동기화에서 행이 따라간다.
  서명 해시(`버전·템플릿 id·모드 id·변수 id`)가 같으면 아무것도 하지 않는다. 다르면 `i18n-rows` 안의 기존 행 중 유지할 것(`value` 속성의
  변수가 아직 원본에 있음)은 남기고 순서를 맞추며, 없는 행만 만들고 나머지는 지운다. 새 행이 100개를 넘거나 `i18n-rows`가 없으면
  `buildRowsFrame`으로 새 프레임을 통째로 만들어 교체한다.
- **value 속성**: `ensureRowProperty`가 row 템플릿에 TEXT 속성 `value`를 만들고 모든 열 텍스트가 참조하게 한다(열 복제 시 참조가
  빠지므로 열 수를 바꾼 뒤 다시 붙인다). 행은 `setProperties`로 이 속성에 변수를 연결 → 언어 열이 늘어도 행별 작업이 없다.
  이전 버전 행(텍스트에 직접 연결)은 속성 연결이 없어 다시 만들어진다(`TABLE_RENDER_VERSION` 2).
- **템플릿 교체**: 테이블의 메인이 현재 템플릿과 다르면(복구 후 등) `swapComponent` 후 행을 다시 만든다.
- **부하**: 레지스트리로 현재 페이지의 테이블만 찾는다(페이지 전체 탐색 없음). 테이블이 없는 페이지에서는 폴링이 즉시 끝난다.
  폴링은 setTimeout 자기 예약 방식: 최소 2초, 직전 소요의 5배, 최대 30초. 작업 큐(`withTableLock`)로 테이블 작업·CSV 가져오기·
  정리가 차례로 실행되고, 폴링은 큐에 뭔가 있으면 건너뛴다.
- **측정값 (변수 1000개, 언어 4개, plugin-test-field 파일)**:
  | 작업 | 시간 |
  |---|---|
  | 1000행 테이블 새로 만들기 | 약 6.7초 (슬롯에 직접 넣으면 45초 이상) |
  | 변경 없는 폴링 1회 | 0.16초 |
  | 원본에서 변수 3개 제거 + 1개 추가 | 약 1.6초 |
  | 언어(모드) 추가 → 열 추가 | 0.3초 (행별 작업 없음) |
  | 값 1000개×2언어 일괄 변경 (CSV와 동일) | 약 11초 — Figma가 연결된 텍스트 ~4400개를 갱신하는 시간 |
- **정리 검사 제외**: `scanCurrentPage`는 최상위 조상이 레지스트리의 테이블인 노드를 건너뛴다.
