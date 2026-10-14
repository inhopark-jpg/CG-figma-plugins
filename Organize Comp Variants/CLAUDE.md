# CLAUDE.md — Organize Comp Variants

기능 설명은 [README.md](README.md). 공통 규칙은 [../CLAUDE.md](../CLAUDE.md).

## 빌드·검증

- `npm run build` — esbuild로 `src/code.ts` → `dist/code.js` (gitignore).
- `npm run typecheck` — `tsc --noEmit`.
- `npm test` — `test/layout.test.mjs`가 `src/layout.ts`를 esbuild로 묶어 Node에서 실행한다.
  예시 4개(Rider-App의 버튼·배지·지도 마커·스낵바) 좌표로 축·중첩·순서, 재실행 시 불변, 브래킷 겹침 없음,
  버튼의 수작업 브래킷 17개 판정·이웃 set 브래킷 보존을 검사.
- 변경 후 세 가지 모두 통과해야 한다. UI(`src/ui.html`) 문법은 `<script>`를 추출해 `node --check`.

## 구조

- `src/layout.ts` — **순수 함수만** (figma API 금지 — 테스트가 Node에서 돈다).
  `assignAxes`(η²로 축 결정) → `nestingOrder`(값 변화 횟수 적은 속성이 바깥) → `buildTree`(평균 위치순 그룹) →
  `measure`/`place`. `plan()`이 전부 묶고 (`strayBrackets()`는 기존 브래킷 판정), 그룹마다 `label(n, axis)` 콜백으로 label 길이를 받는다.
- `src/code.ts`
  - `resolveBracket()`: `figma.root` plugin data `bracketRef`(set·variant ID) → 없거나 지워졌으면 이름으로 찾기
    (`ref.name`, `section-indicator`) → 그래도 없으면 ref가 있었으면 `deleted` 문제, 처음이면 `createBracketSet()`.
  - `inspect()`: `right`/`bottom` variant(ID 우선, 없으면 variant 값으로)와 text 속성 연결 확인. 실패 시 `broken` + `missing`.
  - `documentSet()`: `oldBrackets()`로 기존 브래킷 수집(추적 목록 + `strayBrackets()`, set 크기를 바꾸기 전 위치 기준. 축·label·덮는 variant) →
    `plan()`(콜백에서 `layout.ts`의 `takeOld()`로 짝을 찾아 `makeBracket`이 재사용하거나 새로 생성·label 측정) → 짝 없는 기존 브래킷 삭제 →
    variant 이동·set 크기 → 브래킷 길이(`stretch`)·위치 → section 확장(`growSection`).
  - `syncValueOrder()`: 속성 값 순서(`variantOptions`)를 `valueOrder(plan)`에 맞춤. `layout.ts`의 `appendSequence()`가
    "모든 속성의 새 값이 각각 다음 차례인" variant 순서를 greedy로 만들고, 첫 variant만 남긴 채 나머지를 page로 뺐다가
    그 순서로 다시 넣는다. 남은 불일치는 값별 out/in 최대 3회. 끝나면 layer 순서 복원. variant 이동 **전에** 실행.
  - 생성 브래킷 추적: instance plugin data `docFor` = set ID, set plugin data `docBrackets` = instance ID 목록.
    **둘 다 맞을 때만 재사용·삭제 대상** — 복제된 set/브래킷이 서로를 가져가거나 지우지 않게.
  - 오류 패널: `showProblem()` → UI `state { kind, missing, lang, located?, retried? }`.
    UI 메시지: `lang`, `resize`, `close`, `locate`, `retry`, `create`.
- `src/ui.html` — `I18N` + `t()`, `render()`가 state를 그림, `fitHeight()`로 창 높이 맞춤.

## 규칙

- 정상 실행은 UI 없이 토스트 후 `closePlugin`. 패널은 브래킷 component 문제일 때만 연다 (사용자 결정).
- 토스트는 `MSG` + `M()`, 언어는 `clientStorage`의 `lang`(기본 `ko`).
- **번역하지 않는 것**: 브래킷 label(`속성:\n값`, variant 속성명·값 그대로), 브래킷 set 이름 `section-indicator`,
  variant 이름 `bracket-direction=…`, 속성명 `text`/`show-text`, layer 이름 `bracket`/`text`, plugin data 키.
- 브래킷 색 `PURPLE`·text 검정은 캔버스 데이터라 하드코딩 허용. UI 색은 token만.
- 수작업 브래킷(plugin data 없는 instance)도 정리한다 (사용자 결정, 처음엔 '무시'였다가 변경).
  `oldBrackets()`가 같은 부모의 직계 자식 중 브래킷 set의 instance를 모으고, 판단은 `layout.ts`의 `strayBrackets()`:
  set의 왼쪽/위쪽 띠 + 다른 component set보다 이 set에 가까움. 다른 set의 생성 브래킷(`docFor` 있음)은 대상 아님.
- **기존 브래킷은 재사용한다** (사용자 요청 2026-10-15: label layer의 Figma 어노테이션이 지워지지 않게).
  짝 찾기는 `takeOld()`(축 + 공백 무시 label + 덮는 variant 수). 테스트 `takeOld matches…`가 버튼의 `liquid-glass: false` 두 개로 검증.
  실제 Figma: `btn-primary` 복제본에 두 번 실행 → 17개 모두 재사용, 어노테이션 3개 유지 (MCP에선 private plugin data를
  쓸 수 없어 테스트 묶음만 shared plugin data로 치환해 실행, 복제본·테스트 데이터는 삭제).
- 새 브래킷 component는 **현재 페이지**에 만든다 (Utility 페이지가 없는 파일도 있으므로 — 사용자 결정).
- 간격 상수: `layout.ts`의 `OVERSHOOT`/`GAP`/`STEP`, `code.ts`의 `PAD`/`OFFSET`/`STACK`.
  바꾸면 README의 배치 규칙 표도 고친다. 테스트의 `apply()`는 `PAD` 20을 가정한다.

## Figma 동작 메모 (2026-10 Rider-App 실험)

- `variantOptions` 순서: set 생성 시 layer 순서로 정해지고 이후 **따로 저장**된다.
  layer 순서 변경(`insertChild`)·값 이름 변경으로는 안 바뀌고, `editComponentProperty`는 `variantOptions` 키를 거부한다.
- 값을 가진 마지막 variant가 set을 떠나면 값이 사라지고, 다시 들어오면 맨 뒤에 추가된다 → `syncValueOrder()`의 근거.
- 값별 out/in만 쓰면 속성끼리 서로 순서를 망가뜨린다 (예: `loading=true`가 `state=default`에만 있을 때). 그래서 `appendSequence()`로 한 번에 맞춘다.
- 기본 variant는 layer 순서를 복원하면 유지된다. instance 연결·override도 유지됐다.
- out/in 후에도 set·variant의 노드 ID와 component **key**가 그대로였다. 단, set이 비면 Figma가 set을 지우고
  재결합 시 새 set(새 ID·key)이 되므로 `cycle()`은 set을 절대 비우지 않는다.
- 다이얼로그에서 손으로 끌어 바꾼 순서도 같은 방식으로 바뀌는지는 아직 확인하지 않았다.
- **SLOT 속성은 out/in을 견디지 못한다** (2026-10-15, `.skeleton/marker-general`): set 밖의 variant는 자기 속성(`extra-info-slot#491:2` 등)을
  갖게 되고, 다시 넣으면 slot이 합쳐지지 않아 `componentPropertyDefinitions`가 "Component set has existing errors"를 던진다
  (사용자에겐 '속성 2개가 새로 생김'으로 보임). TEXT·BOOLEAN은 이름으로 합쳐져 문제없다. → `safeValueOrder()`가 SLOT이 있으면 건너뜀.
- out/in(`appendChild`)은 variant 안 텍스트의 폰트가 로드돼 있어야 한다 ("unloaded font"). `safeValueOrder()`가 먼저 전부 로드,
  실패하면 건너뜀. 이전에는 브래킷 폰트만 로드해서 Pretendard를 쓰는 set에서 실행 자체가 실패했다.
