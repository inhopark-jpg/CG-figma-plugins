# Dev Inspector — 구현 메모와 알려진 한계

[README](../README.md)의 보충. 동작을 바꾸기 전에 읽을 것.

## 알려진 한계

- effect는 아래쪽(하위)으로만 수집한다. **조상**의 배경 블러는 아직 표시하지 않는다.
- 크기 제약(Resize constraints)과 `layoutGrow`는 표시하지 않는다. 크기 mode와 min/max로 같은 정보를 더 쉽게 보여 준다.
- layer 크기는 layout section의 너비/높이(`120 · Hug`)로 표시한다. 별도 "부모 layout 내" section은 없다.
- `colorProfile` / `imageResampling`은 일부 Figma 빌드에서 받지 않으므로, 첫 내보내기에서 넣어 보고 실패하면
  빼고 다시 시도하며 그 결과를 기억한다.

## 렌더링과 스크롤

- 패널은 `innerHTML` 교체로 다시 그린다. 스크롤 위치는 매 렌더 전후로 저장·복원한다.
- 탭 본문(`.tabbody`)만 스크롤한다. 탭 안 스크롤이 패널 전체를 끌지 않도록.
- **hover 중이거나 스크롤 중에는 다시 그리지 않는다.** 들어온 state는 큐에 쌓았다가 조용해지면 적용한다.
  - 스크롤 중 `innerHTML`을 바꾸면 관성 스크롤이 끊기고 scrollTop 복원이 그것과 싸워 화면이 튄다.
  - 커서 아래 DOM을 바꾸면 브라우저가 `mouseenter`를 다시 발생시켜 hover가 스스로 반복되고 캔버스가 깜빡인다.

## hover 미리보기

- Dev Mode Plugin API에는 별도 "강조" 기능이 없어, hover 미리보기는 실제 선택을 잠시 바꾸는 방식이다.
- hover가 끝나면 이전 선택을 즉시 복원하고, 명시적 클릭이 항상 우선하며, 페이지를 넘나들지 않는다.
- hover가 진행 중일 때는 **모든** 선택 변경을 플러그인이 만든 것으로 간주한다. Figma가 지정한 선택을 정규화하므로
  (instance 안 layer 등) id 비교로는 사용자의 실제 선택과 구분할 수 없기 때문.
- 행 클릭은 hover를 복원 요청 **없이** 종료하고, 포인터가 실제로 움직일 때까지 hover를 잠근다.
  `hover-end`와 `nav-node`가 비동기라 함께 보내면 복원이 클릭 뒤에 도착하기 때문.
- 부작용: 파일을 함께 보는 협업자에게는 hover 중인 layer로 선택이 잠깐 바뀌어 보인다.

## thumbnail

- component당 한 번 `CFG.THUMB_PX`(최대 표시 크기의 2배)로 내보내 CSS로 축소한다. 크기 슬라이더는 재내보내기를 유발하지 않는다.
- 화면에 보이는 행만 요청한다.
- main component가 로드되지 않은 페이지에 있어 id로 못 찾으면 instance를 통해 해석하고, 그래도 안 되면 instance 자체를 쓴다.
- 아이콘 thumbnail은 필요할 때 PNG 2×로 내보내 세션 동안 캐시한다.

## 표시 규칙

- label은 줄이지 않고 풀어 쓴다. padding은 에디터의 변 아이콘을 쓰고, 축별로 접되 양쪽 값이 다르면 나눈다.
- 그라디언트는 모든 스톱을 불투명도·연결 변수와 함께 표시한다 (외형, 선택 영역 색상 모두).
- 노드 타입별로 예외를 던지는 속성은 section 단위로 잡아 패널 아래에 `⚠` 줄로 표시한다. UI 전체가 비지 않도록.
- component 트리는 일반 frame/그룹을 평탄화해 component 구성으로 읽히게 한다.
- instance 교체 속성 값은 `importComponentByKeyAsync`로 해석하고, 접근할 수 없는 라이브러리는 원래 key를 보여 준다.

## 내보내기: 스트로크 두께 복원

그룹을 SVG로 내보내면 Figma가 fill과 stroke를 별도 path로 나누면서 stroke 쪽 `stroke-width`를 빠뜨려
SVG 기본값 1이 된다. 플러그인은 `SVG_STRING`으로 내보낸 뒤 `id` 속성으로 요소와 layer를 맞춰
실제 두께와 불투명도를 다시 써 넣는다. layer id는 바꾸지 않고, fill·stroke를 모두 가진 단일 vector에는
`class="fill stroke"`를 붙여 `.stroke` 선택자가 계속 동작하게 한다.

## 다국어

UI 사전 3종: `T`(일반 문구), `L`(속성 label), `V`(값 번역, 한국어만). main의 토스트는 `code.js`의 `MSG`.
테스트(`test/harness.js`)는 영어 문구를 검증하므로 state에 `lang: "en"`을 넣어 실행한다.
