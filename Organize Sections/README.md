# Organize Sections

Section으로 정리하는 Figma 파일(Rider-App 방식)에서, 대충 만들어 둔 section 구조를 한 번에 깔끔하게 맞추는 플러그인.
선택한 section과 **그 안의 모든 section**을 정리한다. 명령은 세 가지이고, 패널에서 고른다.

## 설치

```bash
npm install
```

```bash
npm run build
```

Figma 데스크톱 → Plugins → Development → Import plugin from manifest… → `manifest.json`.

## 사용법

1. 정리할 section을 선택한다 (여러 개 가능. 선택한 section 안에 있는 다른 선택은 무시).
2. 패널에서 **기본 정리 / 페이지 layout 정리 / Component layout 정리** 중 하나의 **정리**를 누른다.
3. 결과가 패널 아래에 표시된다. 한 번의 실행이 실행 취소(⌘Z / Ctrl+Z) 한 번으로 되돌아간다.

- 선택한 section의 **왼쪽 위 위치는 그대로**이고 크기만 바뀐다. 안쪽이 움직인다.
- Section이 아닌 내용(frame, component, 브래킷 instance, text …)은 **크기를 바꾸지 않는다.**
- 다시 실행해도 결과가 바뀌지 않는다 (Rider-App 예시로 확인).
- 선택한 section이 커져서 바깥의 이웃과 겹치는 것은 처리하지 않는다. 바깥 section을 선택해 다시 실행한다.

## 투명 section = 메모 (세 명령 공통)

선택한 section **안쪽의 배경이 투명한 section**(보통 점선 테두리 — 예: `btn-primary` 안의 ["색상 모드별 적용 예시"](https://www.figma.com/design/1ga1MZBmvVR9fybjbr1W0a/Rider-App?node-id=877-8078))은
예시·메모로 본다. **sub page·building-block·pattern·template으로 판정하지 않는다** (사용자 결정).

- 배경색을 칠하지 않는다 (투명·점선 유지). 그 안의 section은 메모를 건너뛰고 바깥 색 순서를 이어 간다.
- 자기 안쪽은 100px padding으로 정리한다.
- 페이지/component layout에서는 section이 아닌 내용(화면, component set, 브래킷)과 **한 덩어리**로 움직여 서로 위치가 유지된다.
- 선택한 section 자신은 투명이어도 메모가 아니다 (예: `button`, `component-A`).

## 배경색 (세 명령 공통)

부모 다음 단계 색을 자식에게 칠한다: **투명 → 흰색 → 밝은 회색 `#F2F2F2` → 어두운 회색 `#E6E6E6` → 밝은 회색 …**

- 선택한 section 자신의 색은 그대로 두고, 바로 안쪽부터 칠한다.
  예: 투명을 선택하면 자식은 흰색, 흰색을 선택하면 자식은 밝은 회색, 밝은 회색이면 어두운 회색.
- 위 네 가지가 아닌 색(다른 색, 반투명, 그라디언트)인 section의 자식은 밝은 회색이 된다.
- 안쪽의 투명 section은 칠하지 않는다 ([투명 section = 메모](#투명-section--메모-세-명령-공통)).
- 이미 맞는 색이면 건드리지 않는다. Stroke는 바꾸지 않는다.

## 1. 기본 정리

모든 section이 내용을 **100px padding**으로 감싸게 맞추고, **가장 가까운 section끼리의 간격을 100px**로 맞춘다.
배치(어느 section이 어느 section의 오른쪽·아래에 있는지)는 그린 그대로 둔다.

- 안쪽 section부터 크기를 맞춘 뒤, 각 section을 바로 왼쪽·위의 가장 가까운 section에서 100px 떨어뜨린다 (사용자 결정).
- 가장 가까운 이웃이 section이 아닌 것(component, 브래킷, 텍스트)이나 투명 메모 section이면 **그 간격은 그대로** 둔다.
  예: pattern section과 building-block 사이에 component set이 있으면, building-block은 component set과의 간격을 유지한다.
- 대각선으로 떨어져 있던 둘이 간격을 줄이다 겹치게 되면 아래쪽 것을 밀어 낸다.
- 정리 중 커져서 옆 section과 겹치게 된 경우, 덜 겹친 방향으로 앞뒤를 정해 100px 떨어뜨린다.
- 빈 section은 크기를 그대로 둔다.

## 2. 페이지 layout 정리

[예시: Rider-App › Feature › "for example, settings page"](https://www.figma.com/design/1ga1MZBmvVR9fybjbr1W0a/Rider-App?node-id=1253-2043).
Section 하나를 "페이지"로 보고 아래처럼 놓는다. 안쪽 section도 같은 규칙으로 재귀 정리한다.

```
┌ page ────────────────────────────────────────────────┐
│ [화면들]  ←1000→  [sub page] [sub page] …             │
│                     ↕ 1000                             │
│ [building-block 줄 ───────────── 하나면 전체 폭 ────] │
└──────────────────────────────────────────────────────┘
```

| 자식 | 판정 | 위치 |
|---|---|---|
| section이 아닌 것 (화면 frame 등), 투명 section | 이 페이지의 화면·메모 | 왼쪽 위, 한 덩어리로 이동 (서로 위치 유지) |
| 화면(또는 다른 section)이 쓰는 component가 있는 section, 그런 게 없으면 이름이 비었거나(`""`, `" "`) `building-block`이 들어간 section (투명 제외) | building-block 묶음 | 맨 아래 한 줄. 하나뿐이면 페이지 폭에 맞게 늘림 |
| 그 밖의 section (투명 제외) | sub page | 화면 오른쪽 한 줄, **높이를 맞춤** |

- building-block 묶음 안의 building-block section들도 같은 규칙으로 한 줄로 놓인다.

## 3. Component layout 정리

[예시: Rider-App › Feature › "component-A"](https://www.figma.com/design/1ga1MZBmvVR9fybjbr1W0a/Rider-App?node-id=2465-20081).
rikaride 룰북(`component-structure-rule.md`)의 skeleton / template / pattern 구조를 **"쓰는 쪽이 위, 재료가 아래"** 로 놓는다.

```
┌ template section ───────────────────┐
│ [pattern] [pattern] …               │  ← 이 template을 쓰는 pattern
│              ↕ 200                   │
│ [template component + 브래킷 + 투명 예시 section] │
│              ↕ 200                   │
│ [building-block] (자기 폭)           │  ← 재료
└─────────────────────────────────────┘
```

투명 section은 아래 판정에서 빠지고 내용과 함께 움직인다. 각 section은 **자기 내용 높이로 감싼다** (형제끼리 높이를 맞추지 않음 — 사용자 결정).

### 판정 ① component 사용 관계 (먼저)

얼마나 많이 쓰이는지가 아니라 **누가 누구를 쓰는지(방향)** 로 판단한다 (사용자 요청, 2026-10-15).
"쓴다" = component 정의 안에 그 component의 instance가 들어 있음 (instance 안쪽까지는 보지 않음).

| 자식 section | 조건 | 위치 |
|---|---|---|
| pattern | 자식 section의 component가 **부모 section의 component를 씀** (template을 고정한 것) | 맨 위 한 줄 |
| skeleton / building-block | 자식 section의 component가 **그 section 바깥(선택한 section 안 어디든)에서 쓰이고**, 쓰이는 것이 모두 `.`으로 시작 (룰북의 building-block 표기) | 맨 아래 한 줄 |

- template이 pattern 여러 개에 쓰여도 skeleton이 되지 않는다. pattern은 template section **안**에서 부모를 쓰는 쪽이기 때문이다.
- `btn-layout`(composite template)이 옆 그룹의 `btn-primary`를 써도, `btn-primary`는 `.`이 없으므로 아래로 가지 않는다.
- 조부모가 쓰는 경우도 잡는다 (예: `pattern-transit-route-path` > `building-block` > `.pattern-direction-triangle`).
- 예시 frame·투명 메모 속 instance는 "쓴다"로 치지 않는다 (component 정의만).
- Rider-App Map Overlay에서 이름을 모두 지우고 계산해도 skeleton·building-block·pattern 판정이 같았다.

### 판정 ② section 이름 (사용 관계로 알 수 없을 때)

| 자식 section | 이름 조건 | 위치 |
|---|---|---|
| building-block / skeleton | 이름에 `building-block`, 또는 바로 안에 `.skeleton/…` component | 맨 아래 한 줄 |
| pattern | 이름에 `pattern` 단어, 또는 바로 안의 component가 모두 `pattern` 이름 | 맨 위 한 줄 |
| 그 밖 (template, 그룹) | 부모에 component가 있으면 → component 밑에 세로로 쌓음 / 없으면 → 가로 한 줄 | 가운데 |

- 예: `pattern-connector-line` > `building-block`의 `pin-stop-connector-line-dot`은 쓰이지만 `.`이 없어 ①로 정하지 않고, 이름으로 아래에 둔다.
  `.pin-stop-connector-line-dot`으로 이름을 바꾸면 이름과 관계없이 잡힌다.
- 비어 있는 예시용 section(component 없음)도 이름으로 판정한다.

- 예: `button` > 흰색 그룹 > `btn-primary`·`btn-ghost`(가로 한 줄, 각자 높이) + `building-block`(아래, 전체 폭).
- **전체 폭으로 늘리는 것은 "위의 template들이 함께 쓰는 skeleton"뿐이다** (사용자 결정). 맨 아래 section이 하나이고
  위에 template section이 나란히 있을 때만 늘려서, 이 skeleton을 위 template 전부가 쓴다는 것을 보여 준다.
  한 template의 building-block, skeleton section 안의 building-block은 자기 내용 폭으로 감싼다.
- Section이 아닌 내용(component set, 브래킷, address-platter …)은 **한 덩어리로** 움직여 서로 위치가 유지된다.
- Section을 새로 만들거나 component를 다른 section으로 옮기지 않는다 (사용자 결정: 배치만).

## 간격

| 항목 | 값 |
|---|---|
| section padding | 100px |
| 형제 section 사이 | 100px |
| 페이지 layout: 화면 ↔ sub page, 위 ↔ building-block 줄 | 1000px |
| Component layout: pattern ↔ template ↔ building-block 띠 | 200px |

## 패널

- 헤더: 제목, 언어 토글(`한국어 | EN`, 기본 한국어). 폭 320px, 높이는 내용에 맞춤.
- 선택 상태(선택한 section 이름 / 개수 / 선택 필요 안내), 명령 카드 3개, 배경색 규칙, 실행 결과.

## 파일

| 파일 | 역할 |
|---|---|
| `src/layout.ts` | 정리 계산 (figma API 없음, 테스트 대상) |
| `src/apply.ts` | 캔버스 → Item tree 읽기, 결과 쓰기, 배경색 |
| `src/code.ts` | 패널, 선택, 메시지, 언어 저장 |
| `src/ui.html` | 패널 UI (공유 디자인 시스템 + 한국어/영어). 빌드 없이 그대로 로드 |
| `test/layout.test.mjs` | Rider-App 예시 구조로 `layout.ts` 검증 |
| `dist/code.js` | **생성물** (`npm run build`, esbuild) |
