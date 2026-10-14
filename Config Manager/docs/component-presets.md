# component 연결 preset

[README](../README.md)의 보충. preset을 component에 묶는 규칙과, 사용자가 Figma에서 component를 직접 바꿨을 때의 처리.
코드는 `src/code.ts`의 "Key components" section, UI는 `src/ui.html`의 `selectionCard` / `presetDetail`.

## 원칙

- 플러그인이 만들고 관리하는 preset은 **component 하나**에 속한다 (i18n에서 token이 key 레이어 없이 존재할 수 없는 것과 같음).
  - component set이면 set 전체. variant 하나나 instance를 선택해도 set(instance는 main component)으로 해석한다.
  - component 하나에 preset 하나. 라이브러리(remote) component는 속성을 바꿀 수 없어 지원하지 않는다.
- preset 이름은 생성 시 `preset-<component 이름>`, mode는 `mode 1` 하나로 시작한다(추가하면 `mode 2` …). 이후 이름은 자유롭게 바꿀 수 있다.
- 플러그인이 만들거나 연결한 preset에는 `cm-preset` 표시가 붙어, 변수 테이블에서 이름을 바꿔도(`preset-` 없이도) preset으로 남는다
  (`config-`로 바꿔도 config가 되지 않는다). 표시가 없는 collection은 이름이 `preset-`로 시작할 때만 preset이다.
- token 하나 = component 속성 하나. token 이름 = 속성 이름(`#id` 제외). 모든 token은 **반드시 속성에 연결**된다
  (연결에 실패하면 만든 변수를 지우고 오류를 낸다). 직접 token을 만드는 버튼은 없다.
- config는 이 규칙과 무관하다. config에는 preset이 아닌 collection도 행으로 넣을 수 있다.

## 데이터 (plugin data)

| 키 | 위치 | 내용 |
|---|---|---|
| `cm-config` | config collection | `1` = 플러그인이 만든(또는 행을 추가한) config. 이름에 `config-`가 없어도 config |
| `cm-preset` | preset collection | `1` = 플러그인이 관리하는 preset (이름과 무관하게 preset) |
| `cm-issues` | preset collection | 마지막 component 검사 결과 `{ n, missing }` — 목록·config 배지용 |
| `cm-component` | preset collection | key component(또는 set) id |
| `cm-component-name` | preset collection | 마지막으로 본 component 이름 (삭제된 뒤 표시용) |
| `cm-component-page` | preset collection | component가 마지막으로 확인된 페이지 (정리 범위 판단용) |
| `cm-prop` | token 변수 | 속성 참조. Boolean·텍스트는 키의 `#id` 부분(이름을 바꿔도 유지), variant는 `variant:<이름>` |
| `cm-vb` | instance | 플러그인이 이 instance에 연결한 variant token id 목록(JSON) |

## 속성 type과 연결 방식

| 속성 | token type | 값 편집기 | 연결 위치 |
|---|---|---|---|
| Boolean | BOOLEAN | 스위치 | main component의 속성 **기본값** (`editComponentProperty`) |
| 텍스트 | STRING | 텍스트 입력 | main component의 속성 기본값 (참조하는 text layer의 font를 먼저 load) |
| variant | STRING | 옵션 메뉴 (옵션 외 값은 거부) | **instance마다** (`setProperties`) — set에는 연결할 기본값이 없음 |
| instance swap · slot | — | 표시 안 함 | 변수 연결 불가 |

- 기본값 연결이므로 그 속성을 직접 override한 instance는 token을 따라가지 않는다.
- variant 연결 시점: 플러그인 실행(`ready`), 페이지 이동(`currentpagechange`)마다 **현재 페이지**의 instance 전체,
  그리고 선택 변경 시 선택된 instance(새로 놓은 instance는 선택 상태이므로 여기서 연결됨). 폴링에서는 하지 않는다.
  instance 안에 중첩된 instance는 그 main component를 따르므로 건너뛴다.

## 추가 전 → token 생성

- 상세 화면은 속성마다 한 행. token이 없는 속성은 **추가 전**(흐린 행)이며 component 기본값을 보여 준다.
- 어느 mode든 값을 바꾸면 `addPropToken`: 그 mode = 입력값, 나머지 mode = component 기본값으로 token을 만들고 연결한다.
- 행의 `+` 버튼(hover)은 기본값 그대로 token을 만든다 (텍스트는 같은 값을 다시 입력해도 변경이 없어 생성되지 않으므로).
- 속성이 이미 **다른 변수**에 연결돼 있으면 행에 ⚠ 표시. 값을 입력하면 이 preset의 token으로 바뀐다.

## 충돌 처리 — 자동으로 고치지 않는다

사용자가 Figma에서 바꾼 것은 되돌리지 않는다. 열려 있는 preset은 상세 화면 위 경고 줄로, 나머지는 **Preset 정리** 보고서로 알린다
(판정은 main의 `componentDetail()`이 `issues`로 만든다).

| 상황 | 감지 | 해결 버튼 |
|---|---|---|
| preset에 component가 없음 (예전 preset, `preset-`으로 이름만 바꾼 collection) | `cm-component` 없음 | component 선택 후 *연결* |
| component 삭제 | 노드 없음 / 캔버스 밖 | 다른 component 연결, 또는 preset 삭제 |
| 속성 기본값 연결이 풀림 (Figma에서 값을 직접 입력 등) | 기본값 binding 없음 | *다시 연결* |
| 속성이 다른 변수에 연결됨 | 다른 변수 id | *다시 연결* (덮어씀) |
| 속성 이름 변경 | token 이름 ≠ 속성 이름 | *Token 이름 맞추기* |
| 속성 삭제 (variant 속성 이름 변경 포함) | `cm-prop`에 맞는 속성 없음 | *Token 삭제* |
| variant 옵션 삭제·이름 변경 | 값이 옵션 목록에 없음 | 칸에서 옵션 다시 선택 |

- instance에서 사용자가 variant 연결을 해제하거나 다른 변수로 바꾸면, `cm-vb`에 기록이 남아 있으므로 다시 연결하지 않는다.
  *다시 연결*은 현재 페이지 instance를 강제로 다시 연결한다.
- token 삭제·preset 삭제 시 먼저 연결을 해제한다: 기본값은 기본 mode의 값으로, variant instance(현재 페이지)는 현재 값으로 남긴다.
  다른 페이지 instance의 variant 연결은 변수 삭제와 함께 끊긴다(Figma가 마지막 값을 유지).

## 기존 preset 연결

선택한 component에 preset이 없을 때 *기존 preset 연결* → component가 없거나 삭제된 preset 목록.
연결하면 이름·type이 속성과 같은 token을 그 속성에 연결하고, 나머지 token은 "속성 없음"으로 정리 대상에 남는다.
다른 component로 다시 연결하면 이전 component의 연결은 해제된다.

## Preset 정리 (i18n의 token 정리와 같은 방식)

preset 목록의 **Preset 정리** 버튼 → `cleanupPresets()` → 보고서 화면(`reportView`).

- **변수 테이블**(모든 preset, 노드를 읽지 않음): component가 없는 preset.
- **현재 페이지**: `cm-component-page`가 현재 페이지(또는 미기록)인 component만 읽어 검사한다.
  - 노드가 없으면 *Component 삭제됨*. 다른 페이지로 옮겨졌으면 페이지를 갱신하고 "다른 페이지"로 분류.
  - 속성 연결·이름·삭제·variant 옵션 문제는 *정리가 필요한 preset*.
- **다른 페이지의 component**는 검사하지 않고 목록만 보여 준다. 누르면 그 페이지로 이동해 component를 선택 → 거기서 다시 실행.
- 현재 페이지 instance의 variant 연결도 함께 수행하고 개수를 요약에 표시한다.
- 보고서 항목을 누르면 preset 상세가 열리고(상단에 *정리 결과로 돌아가기*), 돌아가면 정리를 다시 실행한다.
  고치는 동작은 상세 화면의 버튼으로만 한다.

## 목록·config의 문제 표시

component 검사(정리, 또는 preset을 열어 둔 동안)마다 결과를 `cm-issues`에 저장한다. 폴링은 이것만 읽으므로
preset 목록의 *정리 필요 N개*·*Component 삭제됨*, config 목록의 *Preset 문제 N개*, config 표의 ⚠는
**마지막 검사 기준**이다. *Component 없음*은 변수 테이블만으로 알 수 있어 항상 최신이다.

## 성능 — 폴링이 하지 않는 것

- 폴링(`computeState`)은 component 노드를 **읽지 않는다**. preset의 component 정보는 plugin data(id·이름·페이지)뿐이다.
  목록 배지도 그 범위(*Component 없음*)만 표시한다.
- 노드를 읽는 경우는 셋뿐: (1) **열려 있는 preset 하나**(`watchPreset` → 매 상태 갱신마다 `pushComponentDetail`),
  (2) 정리 실행 시 현재 페이지의 component, (3) 사용자 동작(연결·token 추가·삭제 등).
- 페이지 전체 instance를 훑는 variant 연결은 실행·페이지 이동·정리 때만 하며, 200개마다 `breathe()`로 양보해 에디터가 멈추지 않게 한다.
- 따라서 여러 페이지에 걸친 component가 한꺼번에 바뀌어도 폴링 비용은 늘지 않는다. 그 변화는 각 페이지에서 정리할 때 드러난다.

## 선택 → UI

main이 선택 변경 때 `{ type: 'selection', component }`를 보낸다
(`{ id, name, presetName, presetId, fromInstance }`, 라이브러리면 `{ library: true, name }`, 그 외 `null`).
preset 탭에서 연결된 component를 선택하면 그 preset이 열린다 (config 탭에서는 이동하지 않음).
