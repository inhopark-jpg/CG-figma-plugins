# CLAUDE.md — Organize Sections

기능 설명은 [README.md](README.md). 공통 규칙은 [../CLAUDE.md](../CLAUDE.md).
배치 규칙의 근거는 rikaride 룰북 `/Users/park/Desktop/rikaride/docs/design-system-rule/component-structure-rule.md`
(skeleton/template/pattern, building-block 플래그, 패밀리 페이지에서 building-block을 모으는 규칙). 내용을 복사하지 말고 경로로 참조한다.

## 빌드·검증

- `npm run build` — esbuild로 `src/code.ts` → `dist/code.js` (gitignore).
- `npm run typecheck` — `tsc --noEmit`.
- `npm test` — `test/layout.test.mjs`가 `src/layout.ts`를 esbuild로 묶어 Node에서 실행한다.
  Rider-App Feature 페이지 예시 2개(일부러 흐트러뜨린 페이지 예시 + 투명 메모, component-A)와 Button 페이지 일부로
  padding·겹침 없음·재실행 불변·간격 유지·띠 위치·배경색 순서·메모 처리를 검사.
- 변경 후 세 가지 모두 통과해야 한다. UI(`src/ui.html`) 문법은 `<script>`를 추출해 `node --check`.
- 실제 Figma 확인(2026-10): `src/apply.ts`를 iife로 묶어 Figma MCP `use_figma`로 예시 **복제본**에 실행 →
  세 명령 모두 정상, 두 번째 실행 시 변경 0. Button 페이지 `button` 복제본에서 투명 예시 section 8개가 투명·점선 그대로,
  component set과의 거리 그대로인 것 확인. 복제본은 지웠다. 원본은 건드리지 않는다.
  (복제 전 text의 폰트를 `loadFontAsync`로 불러야 한다 — Pretendard.)

## 구조

- `src/layout.ts` — **순수 함수만** (figma API 금지). 입력은 `Item` tree(section·일반 노드, 부모 기준 rect, `tone`, 바로 안 component 이름 `comps`).
  - `organize(root, mode)` → `{ tree, tones }`. 루트의 x·y는 되돌려 고정, 배경색은 `paint()`가 `nextTone()`으로 계산.
  - `tidy()`(기본 정리): 자식 먼저 → `solve()`로 축마다 위치 재계산 → `separate()` → `wrap()`으로 PAD 감싸기.
    `solve()`는 **정리 후 크기**(fitted)로 "앞에 있는"(그 축에서 앞 + 다른 축에서 겹침) 가장 가까운 형제를 찾는다.
    둘 다 색 있는 section(`block`)이면 GAP, 아니면 그려진 간격 유지. 두 축 모두 겹치면 덜 겹친 축에서만 앞뒤.
    정리 전 크기로 판단하면 두 번째 실행에서 이웃이 달라져 결과가 또 바뀌었다 (component-A 예시).
    `separate()`는 두 축을 따로 풀어서 생긴 새 겹침(대각선 이웃)을 아래로 밀어 해소.
    앞 형제가 없으면 자기 위치(`wrap`이 frame만 옮긴 위치)를 유지.
  - `arrange()`(페이지/component): 자식 먼저 → `role()`(사용 관계 → 이름)로 above/main/stack/below 분류 → 띠별 배치.
    일반 노드와 메모(`isNote()`: 루트가 아닌 투명 section, 안쪽은 `tidy()`)는 `bounds()` 한 덩어리로 이동.
    `row()`가 가로 한 줄, 높이 맞춤은 페이지 layout에서만(`same`).
    below가 하나면 `widen()`으로 전체 폭, `spanning` WeakMap으로 그 안의 전체 폭 자식까지 같이 늘린다.
    단 component layout은 main(template)이 위에 있을 때만 — 공유 skeleton 표시 (사용자 결정, Map Overlay 피드백).
- `src/apply.ts` — `read()`(SectionNode → Item, 일반 노드는 `absoluteBoundingBox`를 정수로 바깥쪽 반올림),
  `write()`(section은 x·y·`resizeWithoutConstraints`, 일반 노드는 x·y 차이만큼 이동), `organizeSections()`.
- `src/code.ts` — 패널(`showUI` 320px, `themeColors`), `selectionchange`/`currentpagechange` → `state`,
  `run` → `organizeSections()` → `figma.commitUndo()` → `result`.
- `src/ui.html` — `I18N` + `t()`. 결과·오류 문구도 UI가 만든다 (main은 데이터만 보냄).
  메시지: main→UI `state { lang, count, name, other }`, `result { ok, mode, sections, changed, recolored | code, detail }`;
  UI→main `run { mode }`, `lang`, `resize { height }`.

## 규칙

- 사용자 결정:
  - 실행 방식은 **패널**(메뉴 명령 아님).
  - 배경색 순서 **투명 → 흰색 → `#F2F2F2` → `#E6E6E6` → `#F2F2F2` …**, 선택한 section 색은 유지하고 자식부터.
  - Component layout은 **배치만** — section 생성, component를 다른 section으로 옮기기 없음.
  - Component layout의 section은 **자기 내용 높이로 감싼다** (형제 높이 맞춤 없음). 페이지 layout은 예시대로 높이를 맞춘다.
  - 선택 안쪽의 **투명 section은 메모**(예시·설명, 보통 점선) — sub page·building-block 등으로 판정하지 않고 색도 칠하지 않는다.
    점선이 없어도 투명이면 메모. 점선이지만 색이 있는 경우는 아직 규칙 없음(일반 section으로 처리).
  - 기본 정리는 padding + **가장 가까운 section끼리 간격 100** (2026-10-15 변경, 처음엔 간격 유지였음).
    component·브래킷·메모와의 간격은 유지.
- 판정은 **사용 관계 먼저, 이름은 fallback** (2026-10-15 사용자 요청). `role()` = `usage()` ?? `byName()`.
  - `apply.ts`의 `read(…, usage)`가 일반 노드마다 `comp`·`defs`(variant는 set 이름)·`uses`(직속 instance의 main component, instance 안은 안 봄)를 채운다.
    `getMainComponentAsync`가 instance 수만큼 돌므로 page/component layout에서만 읽는다.
  - `usage()`: 자식이 부모 component를 씀 → above(component layout만). 자식의 정의가 자식 바깥(선택 루트 안)에서 쓰임 → below,
    단 component layout은 쓰이는 것이 모두 `.` 이름일 때만 (composite가 옆 그룹 template을 쓰는 경우 제외). 사용자 집계는 `tally()`, 루트 전체는 `tallyAll()` 캐시.
  - 쓰는 쪽: component layout은 component 정의만, page layout은 모든 내용(화면 frame).
  - Map Overlay를 이름 없이 계산해도 판정 동일(혼자 있는 pattern의 above/main 차이는 위치가 같음). `pin-stop-connector-line-dot`만 `.`이 없어 이름으로 판정.
- 이름 규칙을 바꾸면 `layout.ts`의 `BUILDING_BLOCK`/`SKELETON`/`PATTERN`, README 표, 테스트 `roles by name`을 같이 고친다.
- 간격 상수 `PAD`/`GAP`/`PAGE_BAND`/`COMP_BAND`(`layout.ts`)를 바꾸면 README 간격 표·패널 문구(`pageDesc`의 1000px, `basicDesc`의 100px)도 고친다.
- 배경색 hex(`apply.ts`의 `TONE_RGB`)는 캔버스 데이터라 하드코딩 허용. UI 색은 token만.
- **번역하지 않는 것**: section 이름(`building-block`, `pattern`, `.skeleton/` 판정에 쓰임), layer 이름.
- 토스트는 쓰지 않는다. 모든 문구는 패널에 표시.

## 알려진 한계

- 선택한 section의 바깥(부모·이웃)은 고치지 않는다.
- 기본 정리에서 원래 대각선으로 떨어져 있던 두 요소는 서로 간격 제약이 없어, 크기 변화가 크면 겹칠 수 있다.
- 빈 section은 크기를 줄이지 않으므로, 높이 맞춤으로 한 번 커진 빈 section은 다음 실행에서도 그 크기를 유지한다.
- 회전된 노드는 bounding box 기준으로 이동한다.
