# CLAUDE.md — Config Manager

기능 설명은 [README.md](README.md). 공통 규칙은 [../CLAUDE.md](../CLAUDE.md).

## 빌드·검증

- `npm run build` — `build.mjs`: esbuild로 `src/code.ts` → `dist/code.js`, `src/ui.html` → `dist/ui.html` 복사. `npm run watch` 가능.
- `npm run typecheck` — 변경 후 통과해야 한다.
- 공유 디자인 시스템을 바꾼 뒤에는 루트에서 `node scripts/sync-ds.mjs` → 여기서 `npm run build`.
- UI 시각 확인: `node dev-harness/serve.mjs` → http://localhost:5178 (`harness.html`이 목 state를 iframe에 보냄).
  `.claude/launch.json`의 `ui-harness`도 같은 서버.

## 구조

- `src/code.ts` (main)
  - 데이터는 전부 변수: preset = `preset-` collection, config = `config-` collection. plugin data 키는 상단 `PD_*` 상수.
  - UI 요청은 `handle(msg)`의 `switch`에서 처리, `enqueue()`로 직렬화(폴링과 사용자 동작이 섞이지 않게).
    결과는 `{ type: 'result', requestId, ok, message?, warnings?, error? }`. `message`는 `figma.notify`로도 표시.
  - 폴링(setTimeout 자기 예약: 최소 1.5초, 직전 소요의 5배, 최대 30초)으로 변수 테이블 편집을 감지해 UI와 캔버스 표를 동기화.
    변수 1000개×4모드에서 1회 약 0.26초(상태 JSON 160KB).
  - **페이지 단위 동기화**: 컬렉션 plugin data `cm-table-page`에 표가 있는 페이지를 기록한다(`findTable`이 갱신).
    다른 페이지의 표는 폴링에서 불러오지도 다시 그리지도 않고(`tableOnOtherPage`), `currentpagechange` 때 `pushState(true)`로 맞춘다.
    폴링 경로에 다른 페이지 노드를 읽는 코드를 넣지 말 것.
  - 사용자에게 보이는 메시지(오류·토스트·경고)는 `MSG` + `M()`. 언어는 `clientStorage`의 `lang`(기본 `ko`),
    UI가 `setLang`으로 바꾸고, `ready` 때 `{ type: 'lang' }`으로 알려 준다.
  - 그 외 `clientStorage`: `cm-size`(창 크기), `cm-col-widths`(열 너비).
  - **Key components** section: preset ↔ component(`cm-component`), token ↔ 속성(`cm-prop`), instance의 variant 연결 표시(`cm-vb`).
    규칙·충돌 처리·정리는 [docs/component-presets.md](docs/component-presets.md). 선택은 `selection` 메시지로 UI에 보낸다.
    **폴링은 component 노드를 읽지 않는다** — 열린 preset 하나(`watchPreset`)와 정리(현재 페이지)만 읽는다.
  - **Showcase tables** section: 칸 = 템플릿 instance + 변수 연결 + 칸별 explicit mode. 지문(`cm-table-sig`)은 구조만 담는다
    (`layout` 바뀌면 본문 재생성, `rows` 바뀌면 행 맞춤). 템플릿 id는 `figma.root`의 `cm-templates`. 상세는 [docs/tables.md](docs/tables.md).
- `src/ui.html` (UI)
  - `h(tag, attrs, ...children)` DOM 헬퍼, `btn(label, onclick, cls)` → `<button class="btn …">`.
  - 상태: `state`(main에서 받은 데이터), `applied`(페이지 적용 상태), `ui`(탭·선택·생성 중).
  - 화면: `configList`, `configDetail`, `presetList`(+ `selectionCard`), `presetDetail`(+ `componentBar`, `presetIssues`, `propEditor`).
    `render()`는 입력 중이면 보류.
  - 공용: `openMenu()`(다크 드롭다운), `dialog()`/`confirmAction()`/`promptText()`(Figma iframe은 confirm/prompt 차단),
    `showToast()`, `gridTable()` + `resizer()`(열 크기 조절).
  - 다국어: `I18N` + `t()`, `applyLang()`이 탭 이름·토글을 갱신.

## UI 규칙 (이 플러그인)

- 공유 디자인 시스템 사용 (`@ds` 블록은 생성물). class 이름(`.btn`, `.seg button.on`, `.item`, `.page-bar`,
  `table.grid` …)은 JS가 쓰므로 유지하고, 고유 CSS에서 공유 값(token·라운드 6·12px)에 맞춰 둔다.
  - `.btn` = 공유 `button`의 컴팩트 크기(≈ `.sm`), `.btn.sm` ≈ `.xs`, `.btn.icon` = 정사각 아이콘 버튼.
  - 메뉴·다이얼로그·토스트·스위치·리사이즈 그립은 공유 component(`.menu`, `.overlay/.dialog`, `.toast`, `.switch`, `.resize-grip`).
- 이 플러그인은 `main`이 통째로 스크롤 → 공유 `main` layout을 `display:block; overflow:auto`로 덮어씀.
- 지역 변수·콜백 인자 이름으로 `t`를 쓰지 말 것 (번역 함수 `t`를 가린다. token 반복은 `tk`).

## 번역하지 않는 것 (캔버스·문서 데이터)

표의 `token ID` 헤더, component 속성 `Show location` / `Location`, component·변수 설명, 표 이름 `config-table/…`,
템플릿 이름 `config-manager-table-…`과 그 `value` 속성·`value`/`swatch` layer 이름, 새 config mode 기본값 `Default`, 새 preset mode 이름 `mode N`, 빈 표 문구.
속성·layer 이름을 바꾸면 이미 배치된 instance나 템플릿 인식이 깨진다.

## 주의

- `src/binding.ts`는 보류 기능으로 어디서도 import하지 않는다. 되살릴 때까지 건드리지 않는다.
- mode 수 제한(요금제)으로 mode 추가가 실패하면 경고로 돌려준다 — 예외로 중단하지 않는다.
