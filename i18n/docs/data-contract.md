# i18n — 데이터 계약

플러그인 밖의 도구(다른 플러그인, Figma API로 실행하는 스크립트, Claude의 `use_figma`)가 language 토큰과 번역 테이블을
만들 때 지켜야 할 형식. 이대로 만들면 플러그인으로 만든 것과 구별되지 않는다 — 정리·key 레이어·테이블 동기화가 똑같이 동작한다.
[CLAUDE.md](../CLAUDE.md) · [architecture.md](architecture.md)의 보충.

## 저장 위치

- 모든 기록은 **Figma 파일 안**에 있다. 변수·테이블 instance·`figma.root`의 **shared plugin data**, namespace **`cg_i18n`**.
  다른 곳(워크스페이스, 별도 캐시)에 사본을 두지 않는다.
- 플러그인은 `pdGet`/`pdSet`(code.js)으로 읽고 쓴다: 읽기는 shared 먼저, 비어 있으면 예전 private plugin data.
  쓰기는 shared와 private 둘 다(이전 빌드 호환). 외부 도구는 private 칸에 접근할 수 없으므로 **shared만** 쓴다.
- 예전 파일은 플러그인이 처음 실행될 때 private → shared로 한 번 복사된다(`migrateToShared`, 지우지 않음).
  완료 표시: `figma.root` shared `sharedMigrated` = `"1"`.

## 키

| 대상 | 키 | 값 |
|---|---|---|
| 변수 | `idAssigned` | `"1"` — 이름 끝 6자 ID가 확정됨 |
| 변수 | `keyNodeId` | key 레이어 node id (아래 「key 레이어」) |
| 변수 | `keyPageId` | key 레이어가 있는 페이지 id |
| `figma.root` | `i18nTables` | JSON `{ 테이블 instance id: { "p": 페이지 id, "s": 원본 레이어 id } }` |
| `figma.root` | `i18nTplTable` / `i18nTplRow` | `i18n-table` / `i18n-row` 템플릿 component id |
| `figma.root` | `i18nTplSig` | 템플릿 열 서명 — 외부 도구는 쓰지 않는다 |
| 테이블 instance | `i18nSig` | 행 서명 — 외부 도구는 쓰지 않는다(비어 있으면 플러그인이 다시 맞춘다) |

## 토큰 만들기 — `handleCreate`와 같은 결과

1. 컬렉션 `language`에 STRING 변수를 만든다.
2. **key 레이어** = 값이 보이는 TEXT 노드.
   instance의 TEXT 속성이면 instance 안의 그 TEXT 노드(id가 `I…;…`)다. instance id로 두면 속성이 여럿인 instance에서
   정리가 key를 찾지 못한다(`resolveBinding`은 instance에서 첫 TEXT 속성만 본다).
3. **이름** = `getGroupPath(key 레이어)` + `/` + ID.
   ID는 `genId` — 소문자·숫자 6자, 기존 변수 이름 끝(⚠️ 제거, `stripWarn`)과 겹치지 않게.
4. **값**: 모든 모드에 넣는다. 기본 모드는 필수, 비어 있는 모드는 `--`(미번역).
5. **연결**: TEXT 노드는 `setBoundVariable("characters", 변수)`, instance 속성은
   `instance.setProperties({ [속성 키]: figma.variables.createVariableAlias(변수) })`.
6. **기록**: 변수에 shared `idAssigned` = `"1"`, `keyNodeId`, `keyPageId`.

이미 있는 토큰을 다른 레이어에 연결(재사용)할 때는 5번만 한다 — 그 토큰의 key 레이어는 바꾸지 않는다.

## 함수는 복사하지 말고 원본을 읽는다

이름 규칙이 플러그인과 어긋나지 않도록, 외부 도구는 쓸 때마다 이 폴더의 `code.js`에서 다음 함수를 **그대로** 가져와 쓴다:
`dashClean`, `buildSegment`, `getGroupPath`, `splitName`, `stripWarn`, `genId`(+ `ID_CHARS`, `WARN`).
문서나 다른 저장소에 사본을 두지 않는다 — 플러그인을 고치면 외부 도구도 자동으로 따라간다.

## 번역 테이블 만들기 — `handleCreateTable`과 같은 결과

1. 템플릿: `figma.root` shared `i18nTplTable`의 component(없으면 이름 `i18n-table`로 찾는다)의 instance를 만든다.
   이름은 `i18n-table`.
2. 위치: `topLevelAncestor(원본)`과 같은 부모, 그 오른쪽 `TABLE_GAP`(100), 원본과 같은 높이. 다른 테이블과 겹치면 오른쪽으로.
3. **등록**: `figma.root` shared `i18nTables`를 읽어(JSON) 항목 `{ p, s }`를 **더해서** 다시 쓴다. 덮어쓰지 않는다.
4. 행: 만들지 않아도 된다. `i18nSig`가 비어 있으므로 그 페이지에서 플러그인이 실행될 때 `syncTable`이 원본이 쓰는 토큰으로
   행을 만든다. 직접 만들 때는 `i18n-slot` > `i18n-rows` 안에 `i18n-row` instance를 두고 `value` 속성에 변수를 연결한다.

## 플러그인 밖에서 기록 없이 만들어진 토큰

Figma 변수 패널에서 직접 만드는 등 기록이 없는 토큰도 깨지지 않는다:

- 이름 끝이 이미 6자 ID 형식이고 다른 토큰과 겹치지 않으면 정리가 **그 ID를 유지**한다(번역 키가 바뀌지 않음).
  그렇지 않으면 새 ID를 받는다.
- key 레이어 기록이 없는데 현재 페이지에서 쓰이고 있으면 정리 보고서의 **key 레이어 없음**에 나온다. key 레이어는
  보고서에서 지정한다(자동 지정하지 않음).
