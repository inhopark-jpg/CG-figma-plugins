# Sync Icon Colors

UI가 없는 Figma 플러그인. 선택한 main component(또는 component set)의 `icon-frame` 하위 트리의 `fills`/`strokes`를
파일 안의 **모든 instance**에 다시 동기화한다.

## 해결하는 문제

디자이너가 `icon-frame` 안의 아이콘을 instance 교체(instance swap)로 바꾸면, 교체된 중첩 노드 하나의 이름만 바뀐다
(예: `.sprout` → `.arrow-left`). 그러면 Figma의 오버라이드 전파가 그 노드를 "같은 노드"로 보지 않아,
이후 main component의 `icon-frame` 색을 바꿔도 그 instance에는 반영되지 않는다.
이 플러그인은 양쪽 트리를 걸으며 색을 직접 다시 적용한다.

## 매칭 방식

- 모든 레벨에서 자식을 **이름으로** 짝짓는다.
- 양쪽에 남은 짝 없는 노드는 **순서대로** 짝짓는다 — 바로 이 지점이 교체 경계다.
- `INSTANCE` 노드를 특별 취급하지 않고, 중첩 instance의 main component 안으로 들어가지도 않는다.

## 범위 (건드리지 않는 것)

- 매칭된 `icon-frame` 하위 트리 **안쪽** 노드만 수정한다. 텍스트, 버튼 배경, 테두리는 절대 바꾸지 않는다.
- `resetOverrides()` / `removeOverrides()`를 호출하지 않는다. 실제로 다른 `fills`/`strokes` 배열만 덮어쓴다.

### icon-frame 이름 규칙

컨테이너 layer 이름이 `icon-frame` 이거나 `icon-frame-<맥락>`(예: `icon-frame-standalone`, `icon-frame-body`,
`icon-frame-display`, `icon-frame-magazine`, `icon-frame-headline`)이면 매칭된다 (`code.ts`의 `isIconFrameName`).
`icon-frame` 뒤에 아무것도 없거나 `-`가 와야 한다. `icon-framework`는 매칭되지 않는다.

## 사용법

1. 노드를 **정확히 하나** 선택한다: 메인 `COMPONENT` 또는 `COMPONENT_SET`.
   - component set는 모든 variant로 확장된다.
   - 그 외(instance, frame, 다중 선택)는 토스트로 거부된다.
2. 실행: **Plugins → Development → Sync Icon Colors**, 또는 Quick Actions(`Cmd-/`)에서 "Sync Icon Colors".
   UI 없는 일반 메뉴 명령이라 나중에 macOS 앱 단축키로 연결할 수 있다.
3. 페이지를 하나씩 로드하며 선택한 소스 component의 모든 instance를 찾아 `icon-frame`을 동기화한다.
4. 결과 토스트 예: `5개 페이지의 instance 340개 중 12개 동기화 (이미 일치 326, 제외 2, 오류 0)`

## 언어

UI가 없어 언어를 고를 방법이 없으므로 **토스트는 한국어로만** 표시한다. 콘솔 로그는 디버깅용으로 영어를 유지한다.

## 콘솔 읽기

실행 전에 **Plugins → Development → Open console**을 연다. 모든 줄 앞에 `[sync-icon-colors]`가 붙는다.

- 소스 세트 크기와 선택 노드 타입
- instance별: instance 쪽과 소스 쪽에서 찾은 `icon-frame` 수. 수가 다르면 `console.warn` — 남는 것은 추측하지 않고 건너뜀
- `icon-frame` 쌍별: `name-matched cleanly (no swap detected)` 또는
  `positional fallback used for N node(s) (swap boundary detected)` — 교체 경계를 제대로 찾는지 확인하는 방법
- 페이지별: matched / updated / already matching / exempt / error 수

실제 오류는 `console.error`로 남기고 삼키지 않는다. 실패한 페이지·instance는 세고 계속 진행한다.

## 제외하기 (`colorSyncExempt`)

plugin data 키 `colorSyncExempt`가 문자열 `"true"`인 노드는 하위 트리 전체와 함께 건너뛴다.
plugin data는 플러그인 id(`sync-icon-colors`)별로 분리되므로 이 플러그인이 써야 한다.
가장 간단한 방법은 `code.ts`에 다음 줄을 잠시 넣어 선택한 노드에 실행한 뒤 지우는 것이다.

```js
figma.currentPage.selection[0].setPluginData("colorSyncExempt", "true");
```

해제하려면 빈 문자열로 설정한다.

```js
figma.currentPage.selection[0].setPluginData("colorSyncExempt", "");
```

## 색상 변수

소스 paint가 색상 변수에 연결되어 있으면, 원본 색을 복사하는 대신 대상 paint를 `figma.variables.setBoundVariableForPaint`로
**같은 변수**에 다시 연결한다. 비교 시에도 연결된 paint를 변수 id로 정규화하므로, instance에 남은 오래된 계산 색이
가짜 차이로 잡히지 않는다. 변수를 더 이상 해석할 수 없으면 오래된 연결을 버리고 원본 색을 복사한다.

## 설치·빌드

```bash
npm install
```

```bash
npm run build
```

`npm run watch`(저장 시 빌드), `npm run typecheck`(타입만 검사)도 있다.
`manifest.json`의 `main`은 `code.js`를 가리키며 **컴파일 결과물**이다. 직접 고치지 말고 `code.ts`를 고친 뒤 빌드한다.
Figma 데스크톱 → Plugins → Development → Import plugin from manifest… → `manifest.json`.
