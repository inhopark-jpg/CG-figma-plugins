# CLAUDE.md — Dev Inspector

기능 설명은 [README.md](README.md), 구현 메모·한계는 [docs/notes.md](docs/notes.md). 공통 규칙은 [../CLAUDE.md](../CLAUDE.md).

## 실행·검증

- 빌드 없음. `code.js`, `ui.html`을 Figma가 직접 로드한다.
- **변경 후 반드시** `sh test/run.sh` — 모든 테스트 묶음 + `code.js` 문법 + `ui.html` 스크립트 파싱을 확인한다.
  마지막 줄이 `all suites green`이어야 한다.
- 테스트 구조: `test/mock.js`가 가짜 `figma` 객체로 `code.js`를 실행해 state JSON을 만들고,
  `test/harness.js`의 `boot()`가 `ui.html`의 `<script>`를 vm에서 실행한다 (`domshim.js`가 최소 DOM).
  새 기능을 넣으면 같은 방식으로 `test/<이름>.js`를 추가한다 (`run.sh`가 자동으로 포함).

## 구조

- `code.js` (main): 상단 `CFG` 설정, `figma.ui.onmessage`의 `switch(msg.type)`로 UI 요청 처리
  (`ready`, `set-lang`, `set-prefs`, `nav-node`, `hover-*`, `export*`, `notify` …), `push()`가 state를 보낸다.
  토스트 문자열은 `MSG` + `M(key)`.
- `ui.html` (UI): 전역 상태 `S`, `render()`가 `innerHTML`로 다시 그림. `renderNavbar()`가 내비 바와
  헤더의 언어 토글(`#langtoggle`)을 그린다. 사전은 `T`/`L`/`V`, 조회는 `t()`/`lbl()`/`val()`.
- 저장(`clientStorage`): `lang`, `prefs`(패널 높이·thumbnail·열 너비·token 형식, 구 `panelHeights` 키는 마이그레이션).

## UI 규칙 (이 플러그인)

- 이 플러그인이 공유 디자인 시스템의 원본이었다. 지금은 **`doc/design-system/`이 원본**이고 `ui.html`의
  `@ds` 블록은 생성물이다. 공유 style은 거기서 고치고 `node scripts/sync-ds.mjs`.
- 이 플러그인 전용 CSS는 `@ds:end` 뒤의 몇 줄(`.hp`, `.hp-body`, `.style-pill .sp-toggle`)뿐이다. 늘리지 말고
  가능하면 공유 class를 쓴다.
- 새 UI 문자열은 `T.en`과 `T.ko` 양쪽에 추가. 속성 label은 `L`, 값 번역은 `V.ko`.

## 주의

- 읽기 전용 플러그인이다. 문서를 수정하는 코드를 넣지 않는다 (선택 변경·뷰포트 이동만 허용).
- hover/스크롤 중 렌더 보류, hover 선택 교체 로직은 미묘하다. 바꾸기 전에 [docs/notes.md](docs/notes.md) 참고.
- `test/varianttest.js`는 `.tvariant`가 component 보라색(`#8a38f5` 또는 `var(--figma-component-purple)`)인지 CSS를 검사한다.
