# Config Manager

UI의 단일 진실 원천(SSOT)을 **preset**과 **config**로 관리하는 Figma 플러그인. 모든 데이터는 Figma 기본 **변수**에 저장되므로,
플러그인이 만든 것은 Figma 변수 테이블에서도 그대로 편집할 수 있다.

## 목적

두 가지 용도를 함께 지원한다.

1. **일괄 mode 전환 미리보기** — 서버·지역·언어 같은 "상황"마다 여러 preset(언어, 서체 …)의 mode를 한꺼번에 바꿔
   현재 페이지를 그 상황으로 미리 본다.
2. **핸드오프 문서화** — 각 config·preset이 어떤 값을 쓰는지 캔버스 위 **표 component**로 만들어 두고, 변수가 바뀌면 표가 자동 갱신된다.

## 개념

| 개념 | Figma 대응 |
|---|---|
| preset | 플러그인이 만든(또는 연결한) collection — 이름을 바꿔도 유지 — 과, 변수 테이블에서 만든 것 중 이름이 `preset-`로 시작하는 collection. **component 하나에 연결**된다 |
| key component | preset이 속한 component(또는 component set). i18n의 key 레이어에 해당 |
| preset mode | 그 collection의 mode |
| preset token / token ID | 그 collection의 변수 / 변수 이름. component **속성 하나에 연결**되고, 이름은 속성 이름 |
| config | 플러그인이 만든 collection(이름을 바꿔도 유지)과, 변수 테이블에서 만든 것 중 이름이 `config-`로 시작하는 collection |
| config 행 | collection 이름을 딴 STRING 변수. preset이 아닌 collection도 쓸 수 있다 |
| config mode(열) | config collection의 mode. 각 칸에는 사용할 **preset mode 이름**이 들어간다 |

예: `config-server`의 mode가 `Server A`, `Server B`. 행 `preset-language`는 Server A에서 `en`, Server B에서 `ko`.
행 `preset-typeface`는 Server A에서 `latin`, Server B에서 `hangul`.

config에는 preset이 아닌 collection도 행으로 넣을 수 있다 (component 연결은 preset에만 해당).

## 기능

### config 탭

- **새 config**: 입력한 mode들로 `config-<이름>` collection 생성.
- 목록 위 도구 줄은 preset 탭과 같다: **검색**(config·preset 이름), **편집**(여러 개 체크해 한 번에 삭제), **Config 정리 · 파일 전체**, *+ 새 config*.
- **Config 정리**: 모든 config를 변수 테이블만으로 검사한다(캔버스를 읽지 않으므로 페이지 단위가 아니고, 보고서는 실시간).
  preset 행이 없음, collection을 찾을 수 없는 행, STRING이 아닌 행, preset mode가 아닌 값, 문제가 있는 preset 사용을 config별로 보여 준다.
  항목을 누르면 config가 열리고 *정리 결과로 돌아가기*로 돌아온다. preset의 component 문제는 마지막 Preset 정리 기준.
- 목록에서 문제가 있는 preset(component 없음·삭제됨·정리 필요)을 쓰는 config에 *Preset 문제 N개* 배지,
  config 표에서는 해당 preset 행 이름 옆에 ⚠ (마지막 정리 또는 preset을 열었을 때의 검사 결과 기준).
- **preset 추가**(표 마지막 행): 변수가 1개 이상 있는 collection을 검색 메뉴로 선택. preset이 먼저, 그다음 기타 collection.
- 각 칸은 해당 preset mode를 고르는 드롭다운. 변수 테이블에서 직접 입력한 잘못된 값 등은 ⚠로 표시.
- **페이지 적용 바**(표 위, KO: *“…” 페이지에 다음 config 적용*, EN: *Configure “…” page to*): 열을 고르면 config의 모든 preset을 그 열의 mode로 **현재 페이지**에 적용.
  선택한 열은 표에서 색이 칠해지고 *페이지 적용 중* 태그가 붙는다. 바는 페이지 상태를 그대로 반영하므로 Figma 패널에서
  바꾼 mode도 보이며, 어떤 열과도 맞지 않으면 *사용자 지정*으로 표시.
- **없음**: 플러그인이 적용하기 전 페이지의 mode로 되돌린다. 플러그인이 적용한 게 아니면 config의 mode를 제거한다.
  뒤로 가기 화살표나 config 탭 더블클릭으로 나갈 때도 같은 처리를 자동으로 한다 (그 사이 손으로 mode를 바꿨다면 제외).
- mode 이름 변경·삭제, config 이름 변경은 모두 인라인.

### preset 탭

자세한 규칙은 [docs/component-presets.md](docs/component-presets.md).

- **component 선택 → preset 생성**: 캔버스에서 component·component set·variant·instance(→ main component)를 선택하면
  목록 위 카드에 *preset-<component 이름> 만들기* / *기존 preset 연결*이 나온다. 이미 preset이 있으면 *열기*,
  preset 탭에서는 선택만으로 그 preset이 열린다. component 하나에 preset 하나. 라이브러리 component는 불가.
  새 preset의 mode는 `mode 1`, `+`로 추가하면 `mode 2`, `mode 3` …으로 바로 생기고 이름을 이어서 고칠 수 있다.
- 플러그인이 만든 preset은 변수 테이블에서 이름을 바꿔도(`preset-`를 빼도) 계속 preset으로 인식된다.
  플러그인 밖에서 만든 collection은 이름이 `preset-`로 시작할 때만 인식된다.
- **속성 = 행**: 상세 화면은 component의 Boolean·텍스트·variant 속성마다 한 행(instance swap·slot은 변수를 연결할 수 없어 제외).
  첫 열 헤더는 *속성*(Properties). 처음엔 모두 흐린 **추가 전** 상태이고 행마다 *추가* 버튼이 있다(component 기본값으로 생성).
  값을 하나 입력해도 token이 만들어진다(그 mode는 입력값, 나머지는 component 기본값). 둘 다 바로 속성에 연결된다.
  값 편집기는 속성 type을 따른다: Boolean 스위치 / 텍스트 입력 / variant 옵션 메뉴.
- token 삭제 시 속성 연결을 먼저 해제한다(속성은 현재 값으로 남음). 직접 token을 만드는 버튼은 없다.
- **Preset 정리**(목록 위 버튼 *Preset 정리 · 현재 페이지*, i18n의 token 정리와 같은 방식): 변수 테이블 + **현재 페이지**의 component만 검사해 보고서를 띄운다.
  component 없음·삭제됨, 연결 해제·다른 변수에 연결됨·속성 이름 변경·속성 삭제·variant 옵션 아님을 찾고,
  다른 페이지의 component는 목록만 보여 준다(그 페이지에서 다시 실행). 항목을 누르면 preset 상세로 가서
  *다시 연결* / *Token 이름 맞추기* / *Token 삭제*로 고친다. 자동으로 고치지 않는다. 열린 preset은 상세 화면에도 같은 경고가 뜬다.
- **component 위치 찾기**: 상세 화면 *Component* 버튼 → 다른 페이지여도 이동해 선택.
- mode 추가·이름 변경·삭제, 검색(preset·token 이름). preset이나 그 mode의 이름을 바꾸면 참조하는 config가 자동 갱신된다.
- 다른 변수를 별칭(alias)으로 참조하는 값은 `→ 이름`으로 표시(편집은 변수 테이블에서).

### 캔버스 표 (쇼케이스)

- **캔버스에 표 추가**(상세 화면 오른쪽 위): 제목 → (preset 표만) 위치 행 → 헤더(`token ID`/`preset` + mode) → 행 구조의
  component(`preset-table/…`, `config-table/…`)를 현재 페이지에 배치. instance를 원하는 곳에 배치해 쓴다.
- **값은 변수에 연결된다** (i18n 표와 같은 방식). 각 칸은 **표 템플릿 component**의 instance이고, 열의 mode가 칸에 명시 지정돼
  변수 값이 Figma에 의해 바로 표시된다. 값 편집으로는 표를 다시 그리지 않는다.
  - 템플릿(`config-manager-table-title`, `-header`, `-label`, `-value-text`, `-value-number`, `-value-boolean`, `-value-color`)은
    처음 표를 만들 때 현재 페이지 오른쪽 빈 곳에 세로로 생긴다(section 없음). 템플릿을 고치면 모든 표에 반영된다.
  - Boolean은 스위치 + true/false, 색상은 견본, 숫자·문자열은 텍스트로 보인다. 자세한 규칙은 [docs/tables.md](docs/tables.md).
- 표를 다시 만드는 경우는 **구조** 변경뿐이다: token·preset 행 추가·삭제·이름 변경·순서, mode 추가·삭제·이름 변경, 템플릿 교체.
  행 변경은 기존 행을 유지한 채 맞추고, 열(mode)·템플릿 변경 때만 표 본문 전체를 새로 만든다. instance의 slot 내용과 속성 값은 유지된다.
- 템플릿을 지우면 표 갱신이 멈추고 상세 화면에 *템플릿 다시 만들기*가 나온다 (자동으로 다시 만들지 않음).
- **표 보기**: 캔버스에서 표를 선택(버튼이 *표 선택됨*으로 바뀜). 반대로 표·instance·그 안의 layer를 선택하면
  플러그인이 해당 config/preset을 연다.
- **⋯** 메뉴: 표 다시 그리기, 캔버스에서 표 제거, collection 자체 삭제.
- 표 component를 캔버스에서 지우면 플러그인이 감지하고 다시 *캔버스에 표 추가*를 제안한다.
- preset 표의 위치 행에는 `Location` slot이 있어, instance마다 그 UI가 있는 곳을 가리키는 링크 component 등을 넣는다.
  `Show location` Boolean 속성으로 행을 보이거나 숨긴다.

> Figma 플러그인은 열려 있을 때만 실행된다. 표 동기화는 Config Manager가 열려 있는 동안과 실행할 때 일어난다.
> 부하를 줄이기 위해 구조가 바뀐 **현재 페이지의 표만** 다시 그린다. 다른 페이지의 표는 그 페이지를 열 때 갱신된다
> (그 페이지에 놓인 instance도 그때 함께 갱신된다).

### 기타

- 창 오른쪽 아래 그립으로 크기 조절(크기 기억). 표 열은 헤더 경계를 드래그해 조절(더블클릭으로 초기화).
- 언어 토글: 탭 바 오른쪽 끝 `한국어 | EN` (기본 한국어).

## 참고·한계

- config 칸은 preset mode를 **이름**으로 참조해 변수 테이블에서 읽기 쉽다. config 변수는 연결된 preset id도 저장하므로 preset 이름을 바꿔도 연결이 유지된다.
- preset을 지우면 config의 해당 행도 지워진다.
- mode 수는 Figma 요금제에 따라 제한된다. mode를 추가할 수 없으면 경고를 보여 준다.
- 로컬 collection만 관리한다. 라이브러리 collection은 목록에 나오지 않는다.
- 변수 테이블에서의 편집은 문서 이벤트가 없어 1.5초마다 폴링한다.
- variant 속성 token은 component에 기본값 연결이 없어 **instance마다** 연결한다: 플러그인 실행 시·페이지 이동 시 현재 페이지의
  instance, 그리고 선택한 instance(새로 놓은 instance 포함). 다른 페이지 instance는 그 페이지를 열 때 연결된다.
- Boolean·텍스트 token은 main component의 속성 기본값에 연결되므로, 그 속성을 직접 바꾼(override) instance는 따라가지 않는다.
- **보류 기능**: 예전 "선택 영역 연결(Link selection)" 코드는 `src/binding.ts`에 보관(빌드에 포함 안 됨).

## 설치·개발

```bash
npm install
```

```bash
npm run build
```

Figma 데스크톱 → Plugins → Development → Import plugin from manifest… → `manifest.json`. 편집 중에는 `npm run watch`.
UI 미리보기: `node dev-harness/serve.mjs` → http://localhost:5178 (목 데이터로 `dist/ui.html` 표시).

## 파일

```
manifest.json        매니페스트 (dist/ 를 가리킴)
src/code.ts          main 스레드: 변수·config·표·key component 연결
src/binding.ts       보류된 Link selection 기능 (번들 안 됨)
src/ui.html          UI (바닐라 JS, 공유 디자인 시스템 + 한국어/영어)
build.mjs            esbuild 번들 + UI를 dist/로 복사
dev-harness/         브라우저 미리보기용 목 호스트
docs/                component-presets.md (component 연결 preset), tables.md (캔버스 표·템플릿)
```
