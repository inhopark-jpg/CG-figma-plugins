# i18n — 데이터 계약 (버전 1)

플러그인 밖의 도구(Figma API 스크립트, 다른 플러그인)가 language 토큰과 번역 테이블을 만들 때 지켜야 할 형식.
이대로 만들면 플러그인으로 만든 것과 구별되지 않는다 — 정리·key 레이어·테이블 동기화가 똑같이 동작한다.
[CLAUDE.md](../CLAUDE.md) · [architecture.md](architecture.md)의 보충.

## 저장 위치 — 칸 하나

- 모든 기록은 **Figma 파일 안**, **shared plugin data** namespace **`cg_i18n`** 한 칸에만 있다 (`pdGet`/`pdSet`).
  다른 곳(워크스페이스, 별도 캐시)에 사본을 두지 않는다.
- 공유 칸 이전 파일의 기록(이 플러그인의 private plugin data)은 `migrateToShared`가 한 번 옮긴다(지우지 않음).
  완료 표시 `figma.root` `sharedMigrated` = `"1"`. 그전까지만 읽기가 private을 참고한다.

## 계약 버전

- `figma.root` `contractVersion` = 이 파일을 편집한 플러그인의 가장 높은 `CONTRACT_VERSION` (code.js). 현재 **1**.
- 플러그인은 시작할 때 파일 값이 자기보다 낮으면 올리고, **높으면 읽기 전용**으로 열려 업데이트를 요청한다.
  그래서 팀원 컴퓨터의 오래된 플러그인이 새 형식의 데이터를 덮어쓰지 못한다.
- **저장 형식이나 이름 규칙(`getGroupPath`, `genId` 등)을 바꾸면 `CONTRACT_VERSION`을 올리고 이 문서를 고친다.**
- 외부 도구는 쓰기 전에 파일의 `contractVersion`이 자기가 아는 버전과 **같은지** 확인하고, 다르면 쓰지 않는다
  (비어 있으면 아직 이 버전 이상의 플러그인이 파일을 연 적이 없다는 뜻 — 플러그인을 한 번 실행한 뒤 다시 확인).
  외부 도구는 `contractVersion`을 쓰지 않는다.

## 키

| 대상 | 키 | 값 |
|---|---|---|
| 변수 | `idAssigned` | `"1"` — 이름 끝 6자 ID가 확정됨 |
| 변수 | `keyNodeId` | key 레이어 node id (아래 「토큰 만들기」 2) |
| 변수 | `keyPageId` | key 레이어가 있는 페이지 id |
| `figma.root` | `table:{테이블 instance id}` | JSON `{ "p": 페이지 id, "s": 원본 레이어 id }` — 테이블 하나에 키 하나 |
| `figma.root` | `i18nTplTable` / `i18nTplRow` | `i18n-table` / `i18n-row` 템플릿 component id |
| `figma.root` | `i18nTplSig`, `contractVersion`, `sharedMigrated` | 플러그인 전용 — 외부 도구는 쓰지 않는다 |
| 테이블 instance | `i18nSig` | 행 서명 — 외부 도구는 쓰지 않는다(비어 있으면 플러그인이 다시 맞춘다) |

테이블마다 키가 따로라서, 두 사람이 동시에 테이블을 만들어도 서로의 항목을 덮어쓰지 않는다.

## 토큰 만들기 — `handleCreate`와 같은 결과

1. 컬렉션 `language`에 STRING 변수를 만든다.
2. **key 레이어** = 값이 보이는 TEXT 노드. instance의 TEXT 속성이면 instance 안의 그 TEXT 노드(id가 `I…;…`).
   instance id로 두면 속성이 여럿인 instance에서 정리가 key를 찾지 못한다(`resolveBinding`은 instance에서 첫 TEXT 속성만 본다).
3. **이름** = `getGroupPath(key 레이어)` + `/` + ID. ID는 `genId` — 소문자·숫자 6자, 기존 변수 이름 끝(`stripWarn`)과 겹치지 않게.
4. **값**: 모든 모드에 넣는다. 기본 모드는 필수, 비어 있는 모드는 `--`(미번역).
5. **연결**: TEXT 노드는 `setBoundVariable("characters", 변수)`, instance 속성은
   `instance.setProperties({ [속성 키]: figma.variables.createVariableAlias(변수) })`.
6. **기록**: 변수에 `idAssigned` = `"1"`, `keyNodeId`, `keyPageId`.

이미 있는 토큰을 다른 레이어에 연결(재사용)할 때는 5번만 한다 — 그 토큰의 기록은 건드리지 않는다.
이름 함수(`dashClean`, `buildSegment`, `getGroupPath`, `splitName`, `stripWarn`, `genId` + `ID_CHARS`, `WARN`)는 code.js와
똑같아야 한다. 외부 도구가 사본을 가진다면 계약 버전으로 어긋남을 막는다(위 「계약 버전」).

## 번역 테이블 만들기 — `handleCreateTable`과 같은 결과

1. 템플릿: `figma.root` `i18nTplTable`의 component instance를 만든다. 이름 `i18n-table`.
2. 위치: `topLevelAncestor(원본)`과 같은 부모, 그 오른쪽 `TABLE_GAP`(100), 원본과 같은 높이. 다른 테이블과 겹치면 오른쪽으로.
3. **등록**: `figma.root`에 `table:{instance id}` = `{ "p", "s" }` 한 키를 쓴다.
4. 행: 만들지 않아도 된다(그 페이지에서 플러그인이 실행되면 `syncTable`이 만든다). 직접 만들 때는 `i18n-slot` > `i18n-rows`
   (auto layout 세로, 간격 0, fill 없음) 안에 원본이 쓰는 토큰마다 `i18n-row` instance를 두고 `value` 속성에 변수를 연결한다.

## 기록 없이 만들어진 토큰

Figma 변수 패널에서 직접 만드는 등 기록이 없는 토큰도 깨지지 않는다:

- 이름 끝이 이미 6자 ID 형식이고 다른 토큰과 겹치지 않으면 정리가 **그 ID를 유지**한다(번역 키가 바뀌지 않음).
- key 레이어 기록이 없는데 현재 페이지에서 쓰이고 있으면 정리 보고서의 **key 레이어 없음**에 나온다. 보고서에서 지정한다.
