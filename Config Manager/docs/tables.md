# 캔버스 표와 템플릿

[README](../README.md)의 보충. 코드는 `src/code.ts`의 "Showcase tables" section.

## 원칙 — 값은 쓰지 않고 연결한다

예전 표는 값을 텍스트로 써 넣었기 때문에 값 하나가 바뀔 때마다 표 전체를 다시 그렸다.
이제는 i18n 표처럼 **각 칸이 변수에 연결된 템플릿 instance**라 Figma가 값을 직접 갱신한다.
플러그인은 **구조**가 바뀔 때만 표를 고친다.

- 칸마다 그 열의 mode를 `setExplicitVariableModeForCollection`으로 지정한다 (config 표는 config collection, preset 표는 preset collection).
  main component 안에서 지정한 mode는 배치된 instance에도 그대로 유지되므로, 페이지에 적용한 config와 관계없이 열마다 고정된 mode의 값을 보여 준다.
- 별칭(alias) 값은 연결된 변수를 따라가 실제 값으로 보인다.

## 템플릿

처음 표를 만들 때 현재 페이지의 모든 layer 오른쪽에 세로로 놓는다 (section으로 묶지 않음).
이전 이름(`cm-table/…`)인 템플릿을 찾으면 새 이름으로 바꾼다 (사용자가 이름을 바꾼 경우는 그대로 둠).
id는 `figma.root` plugin data `cm-templates`에 저장하고, 못 찾으면 현재 페이지에서 이름으로 찾는다.

| 템플릿 | 플러그인이 쓰는 것 (지우거나 이름을 바꾸면 안 됨) | 연결 |
|---|---|---|
| `config-manager-table-title` | TEXT 속성 `value` | 표 제목, 위치 행의 `location` label |
| `config-manager-table-header` | TEXT 속성 `value` | `token ID`/`preset` 헤더와 mode 이름 |
| `config-manager-table-label` | TEXT 속성 `value` | 행 이름(token / preset 이름), 빈 표 문구 |
| `config-manager-table-value-text` | TEXT 속성 `value` | STRING 변수 (속성에 연결) |
| `config-manager-table-value-number` | `value`라는 이름의 text layer | FLOAT 변수 (layer의 텍스트에 직접 연결 — TEXT 속성은 숫자를 받지 않음) |
| `config-manager-table-value-boolean` | BOOLEAN 속성 `value` | BOOLEAN 변수. `true` layer가 `false` layer를 덮고, 속성이 `true` layer의 표시를 켠다 |
| `config-manager-table-value-color` | `swatch`라는 이름의 layer(fill) | COLOR 변수 (fill에 연결) |

- 모양(색·글꼴·padding·스위치 디자인 등)은 자유롭게 바꿔도 된다. 모든 표에 바로 반영된다.
- Boolean 템플릿을 고칠 때: `true` layer는 불투명 배경으로 `false` layer를 완전히 덮어야 한다 (변수는 반전할 수 없어 속성 하나로 겹쳐 표시).
- 색상 칸은 견본만 보여 준다. hex 문자열은 색 변수에 연결할 수 없다.

## 너비

표는 mode 수와 관계없이 **1500px**(`TABLE_W`)다. label 열은 350px(`LABEL_W`), 나머지 1150px를 mode 열이 균등하게 나눈다
(`colWidths`, 남는 px는 앞 열). mode가 많으면 열이 좁아진다. 렌더 버전 6부터 적용 — 기존 표는 첫 동기화 때 다시 그려진다.

## 표 component 구조

```
preset-table/<collection>  (component, 이것의 instance를 배치해 쓴다)
├─ title     config-manager-table-title instance
├─ location  (preset만) location label + Location slot, Show location 속성으로 표시
└─ grid
   ├─ header  config-manager-table-header × (1 + mode 수)
   └─ row/<이름> × 변수 수   config-manager-table-label + 값 템플릿 × mode 수   (행 frame plugin data cm-row = 변수 id)
```

title·location은 유지되고 grid만 고친다 → 배치된 instance의 slot 내용·속성 값은 유지된다.
템플릿 이전 버전으로 만든 표는 첫 동기화 때 title·location label을 템플릿 instance로 바꾸고 grid를 새로 만든다 (slot은 유지).

## 언제 무엇을 다시 만드나

collection plugin data `cm-table-sig` = `{ layout, rows }` 지문. **값은 어느 쪽에도 없다.**

| 바뀐 것 | 처리 |
|---|---|
| 값 (플러그인·변수 테이블 어디서든) | 아무것도 안 함 — Figma가 갱신 |
| 행: token/preset 추가·삭제·이름 변경·순서 (`rows`) | 기존 행 유지, 새 행만 만들고 나머지는 제거·이동·label 변경 |
| 열: mode 추가·삭제·이름 변경, 제목, 템플릿 교체, 렌더 버전 (`layout`) | grid 전체를 화면 밖에서 auto layout 끈 채 만든 뒤 교체 |
| *표 다시 그리기* (⋯ 메뉴) | 항상 전체 재생성 |

- 폴링은 지문만 비교하므로 값 편집에는 노드를 읽지 않는다. 다른 페이지의 표는 기존처럼 그 페이지를 열 때 맞춘다.
- 큰 표: 100행마다 `breathe()`로 Figma에 양보한다. grid는 `children`을 한 번만 읽는다 (루프 안에서 읽으면 이차 시간).

## 템플릿이 지워졌을 때

- 구조 변경이 생겼는데 템플릿이 없으면 동기화를 멈추고 state의 `templatesMissing`을 켠다 → 상세 화면에 *템플릿 다시 만들기*.
- 자동으로 다시 만들지 않는다 (사용자가 일부러 지웠을 수 있음). *캔버스에 표 추가*·*표 다시 그리기*도 그때는 오류로 막힌다.
- 다시 만들면 새 id가 `layout` 지문에 들어가므로 각 표가 (페이지별로) 새 템플릿으로 다시 만들어진다.
- 이미 그려진 칸은 원본 템플릿이 지워져도 Figma가 instance를 유지하므로 값은 계속 갱신된다.
