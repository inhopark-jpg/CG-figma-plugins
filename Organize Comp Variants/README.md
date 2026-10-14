# Organize Comp Variants

Variant가 많은 component set을 캔버스에서 한눈에 읽을 수 있게 정리하는 플러그인.
선택한 set의 variant를 행·열 grid로 다시 배치하고, X축(위)과 Y축(왼쪽)에 브래킷 instance로
`속성:\n값` label을 단다. 지금까지 손으로 하던 spec documentation을 한 번의 실행으로 대신한다.

## 설치

```bash
npm install
```

```bash
npm run build
```

Figma 데스크톱 → Plugins → Development → Import plugin from manifest… → `manifest.json`.

## 사용법

1. component set(또는 그 안의 variant)을 선택한다. 여러 set을 한꺼번에 선택해도 된다.
2. 플러그인을 실행하면 정리가 한 번 실행되고, 결과가 토스트로 표시된 뒤 끝난다. **UI는 없다.**
3. 다시 정리하려면 set을 선택하고 오른쪽 패널의 relaunch 버튼 **Update documentation**을 누르거나 플러그인을 다시 실행한다.
   이전 브래킷은 **같은 그룹을 가리키면 그대로 다시 쓰고**, 맞는 그룹이 없는 것만 지운다 ([기존 브래킷 재사용](#기존-브래킷-재사용)).

### 축과 중첩 순서는 현재 배치에서 읽는다

- variant 속성마다 값이 **가로로 바뀌는지 세로로 바뀌는지** 보고 X축/Y축을 정한다.
- 한 축에 속성이 여러 개면 **값이 덜 자주 바뀌는 속성이 바깥** 그룹이 된다 (예: 버튼 X축 `loading` > `state`).
- 값의 순서도 지금 캔버스에 놓인 순서를 따른다. 그룹마다 순서가 달라도 그대로 유지된다.
- 원하는 구조가 있으면 variant를 대략 그 모양으로 끌어다 놓고 실행하면 된다. 결과를 다시 실행해도 바뀌지 않는다.
- 판단이 애매하면(새로 합친 set 등) 값이 많은 속성부터 X축에 둔다.
- 값이 하나뿐인 속성은 label을 달지 않는다.

### 배치 규칙

| 항목 | 값 |
|---|---|
| set padding | 20px |
| cell | 열 폭 = 그 열 variant의 최대 폭, 행 높이 = 그 행의 최대 높이. variant는 cell 가운데 |
| cell 사이 간격 | 가장 안쪽 40px, 한 단계 바깥으로 갈 때마다 +40px |
| 브래킷 길이 | 덮는 cell보다 양쪽 8px 길게. label이 더 길면 cell 간격을 넓혀 겹치지 않게 함 |
| 브래킷 위치 | set 가장자리에서 20px, 바깥 단계는 8px씩 더 바깥 |

- 없는 속성 조합은 빈 cell로 남는다. 같은 조합의 variant가 둘 이상이면 겹치므로 토스트로 알린다.
- set의 왼쪽 위 모서리는 그대로 두고 크기만 바뀐다. set에 auto layout이 있었다면 해제된다.
- set이 section 안에 있으면 브래킷이 들어가도록 section을 넓힌다 (줄이지는 않는다).
- 브래킷은 set과 같은 부모에 놓인다.
- 같은 부모 안에 이미 있던 브래킷(수작업으로 달았거나 플러그인 도입 전 것)도 정리한다.
  브래킷 component의 instance이면서 set의 **왼쪽 띠 또는 위쪽 띠**에 있고, 같은 부모의 다른 component set보다
  **이 set에 더 가까운** 것만 정리 대상이다(재사용하거나 지움). 오른쪽·아래·대각선 바깥에 있는 브래킷과 다른 set의 브래킷은 남는다.

## 기존 브래킷 재사용

브래킷 label layer에 단 **Figma 어노테이션**(예: `liquid-glass: false` → "floating: false의 경우 …")이 다시 실행해도 남도록,
기존 브래킷 instance를 지우지 않고 새 그룹에 다시 쓴다 (사용자 요청, 2026-10-15).

- 정리 **전** 위치에서 기존 브래킷마다 방향(X/Y), label, 덮고 있는 variant를 읽는다.
- 새 그룹마다 방향과 label(공백 무시)이 같고, 덮는 variant가 가장 많이 겹치는 기존 브래킷을 고른다.
  같은 label이 여러 개인데(예: floating별 `liquid-glass: false`) 어느 것도 이 그룹을 덮지 않으면 새로 만든다.
- 고른 instance의 label을 `속성:\n값`으로 맞추고 위치·길이만 바꾼다. 어노테이션·노드 ID·layer 순서가 유지된다.
- 짝이 없는 기존 브래킷은 지운다. 그중 어노테이션이 있던 것이 있으면 토스트로 개수를 알린다.
- 그룹 구조가 바뀌면(속성 값 추가·삭제, 축 변경) 해당 그룹의 어노테이션은 옮겨지지 않을 수 있다.

## 속성 값 순서 (property panel)

정리한 배치에 맞춰 Figma 속성 패널(Edit variant property)의 **값 순서**도 바꾼다.
열은 왼쪽 → 오른쪽, 행은 위 → 아래 순서이고, 그룹마다 순서가 다른 안쪽 속성은 첫 그룹의 순서를 따른다.

- Plugin API에는 값 순서를 정하는 기능이 없다. layer 순서를 바꾸거나 값 이름을 바꿔도 순서는 그대로다.
- 대신 값을 가진 마지막 variant가 set을 떠나면 그 값이 지워지고, 돌아오면 **맨 뒤에** 다시 붙는다.
  그래서 플러그인은 variant를 잠깐 set 밖으로 빼 두었다가, 모든 속성의 순서가 한 번에 맞는 차례로 다시 넣는다.
  그 뒤 layer 순서를 원래대로 되돌린다.
- 노드 ID, 기존 instance 연결과 override, 기본 variant는 그대로 유지된다 (Rider-App 테스트 set으로 확인).
- 순서가 이미 맞는 속성은 건드리지 않는다. 맞추지 못한 속성이 있으면 토스트에 이름을 표시한다.
- **slot 속성이 있는 set은 값 순서를 바꾸지 않는다.** variant가 set 밖에 나갔다 들어오면 slot 속성이 합쳐지지 않고
  중복으로 생겨 set이 오류 상태가 되기 때문이다 (Rider-App `.skeleton/marker-general`에서 확인). 배치·브래킷은 정상 실행되고 토스트로 알린다.
- variant를 옮기려면 그 안 텍스트의 폰트가 필요해서 먼저 불러온다. 설치되지 않은 폰트가 있으면 값 순서 맞추기만 건너뛴다.

## 브래킷 component

- 파일에서 처음 실행할 때 이름이 `section-indicator`인 component set이 있으면 그것을 쓴다. 없으면 **현재 페이지**에 새로 만든다.
- 이후에는 ID로 기억하므로 **이름·색상·폰트 등 디자인을 바꿔도 된다.**
- 플러그인이 쓰는 것: `right` 방향 variant(Y축), `bottom` 방향 variant(X축), 각 variant의 text layer에 연결된 text 속성.
  `show-text` Boolean이 연결돼 있으면 켠다.
- 문제가 생기면 그때만 패널이 열린다 ([패널](#패널)).
  - **삭제됨**: 실행 취소, 또는 남은 브래킷 instance를 선택해 Restore component로 복원한 뒤 **다시 실행**. 또는 **새로 만들고 계속**.
  - **구조가 바뀜** (`right`/`bottom` variant나 text 속성 연결이 없어짐): 빠진 요소를 보여 주고, 되돌린 뒤 다시 실행하거나 새로 만들 수 있다.

## 패널

- 오류가 있을 때만 열린다. 헤더: 제목, 언어 토글(`한국어 | EN`, 기본 한국어)
- 문제 설명, 해결 방법 카드(복원/되돌리기 · 새로 만들기), 닫기. 창 높이는 내용에 맞춰 조절된다 (폭 360px).
- 토스트도 패널에서 고른 언어를 따른다 (기본 한국어).

## 파일

| 파일 | 역할 |
|---|---|
| `src/code.ts` | main 스레드: 브래킷 component 찾기·검사·생성, set 정리, 오류 패널, 토스트(`MSG`) |
| `src/layout.ts` | 축 추론·중첩 순서·cell 크기 계산 (figma API 없음, 테스트 대상) |
| `src/ui.html` | 오류 패널 UI (공유 디자인 시스템 + 한국어/영어). 빌드 없이 그대로 로드 |
| `test/layout.test.mjs` | 실제 예시(버튼·배지·지도 마커·스낵바) 배치·기존 브래킷 위치로 `layout.ts` 검증 |
| `dist/code.js` | **생성물** (`npm run build`, esbuild) |
