# 공유 디자인 시스템

이 폴더의 플러그인 중 UI가 있는 것이 모두 같은 시각 언어를 쓰도록 하는 단일 원본이다.
Dev Inspector의 UI에서 추출했고, 이후 Config Manager·i18n·Arrow Connect·Change Marker에
필요한 component(입력창, 알림, 토스트, 다이얼로그, 메뉴, 스위치 등)를 추가했다.

## 파일

| 파일 | 내용 |
|---|---|
| `tokens.css` | 색상 token(전부 Figma의 `--figma-color-*` 테마 변수에 매핑), 폰트, 스크롤바·기본 리셋 |
| `components.css` | 모든 공유 component class |
| `example.html` | component를 실제로 렌더링한 레퍼런스 페이지 (브라우저로 열기) |
| `components.md` | token·component 카탈로그 — 어떤 상황에 어떤 class를 쓰는지 |

## 동작 방식

Figma는 플러그인 UI를 **하나의 HTML 문자열**로 로드하므로 `<link rel="stylesheet">`로 공유 파일을 참조할 수 없다.
그래서 CSS를 각 플러그인 UI에 **복사해 넣는다**.

| 플러그인 | 주입 방식 |
|---|---|
| Dev Inspector, i18n, Arrow Connect, Config Manager, Organize Comp Variants, Organize Sections | `<style>` 안의 `/* @ds:begin */ … /* @ds:end */` 마커 사이를 `scripts/sync-ds.mjs`가 교체 |
| Change Marker | `build.js`가 `src/ui.html`의 `<!-- @inline-css: ../doc/design-system/... -->`를 빌드 시 인라인 |

```bash
node scripts/sync-ds.mjs
```

```bash
node scripts/sync-ds.mjs --check
```

`--check`는 파일을 쓰지 않고, 최신이 아닌 플러그인이 있으면 exit 1.
Config Manager는 sync 후 `npm run build`(src → dist), Change Marker는 `npm run build`가 필요하다.

## 디자인 시스템을 수정하는 순서

1. `tokens.css` / `components.css` 수정 (플러그인 html 안의 마커 블록은 절대 직접 수정하지 않음)
2. `example.html`에 새 component 예시 추가, `components.md` 카탈로그 갱신
3. `node scripts/sync-ds.mjs` → Change Marker·Config Manager `npm run build`
4. 영향받는 플러그인 확인 (Dev Inspector는 `sh "Dev Inspector/test/run.sh"`)

## 규칙 (요약)

- **색상은 token만.** UI 크롬에 hex를 직접 쓰지 않는다. 필요한 색이 없으면 `tokens.css`에 token을 추가한다.
  예외: Figma 에디터 고유 색(`--figma-component-purple`, `--figma-slot-pink`), 투명 체커보드, 다크 메뉴 배경,
  그리고 캔버스에 쓰이는 데이터 색상(화살표 색, 코멘트 그룹 색 — 인라인 style로 지정).
- **타이포:** Inter(`--font-ui`), 기본 12px / 패널 제목 13px / 보조·메타 11px. **10px는 쓰지 않는다**
  (예외: 기존 Dev Inspector 배지·탭 카운트 등 `components.css`에 이미 있는 10px 대문자 태그).
  굵기 400 본문, 500 인터랙티브 label, 600 강조.
- **값(token 이름, 수치, 코드)은 `--mono`**, label은 기본 폰트.
- **라운드:** 4px(xs 컨트롤·태그), 6px(기본: 버튼·카드·입력창·다이얼로그), 10px(pill 배지), 50%(원형 버튼).
- **보더:** 거의 모든 곳에 `1px solid var(--border)`. 그림자는 떠 있는 layer(툴팁·메뉴·다이얼로그)에만 `--shadow-float`.
- **상태 색 면:** `--red-bg` / `--warn-bg`는 Figma의 `bg-*-secondary` 토큰이 다크 테마에서 진한 단색이라 쓰지 않고,
  상태 텍스트 색을 `--bg`에 12–14% 섞어 만든다. 상태 알림(`.notice.err/.warn/.info`)은 본문을 `--text`로, 색은 왼쪽 막대와 아이콘으로만 표시한다.
- **상태:** hover = `var(--bg-hover)` 배경, 선택 = `var(--bg-sel)` + `var(--brand)` 보더, 비활성 = `opacity .35–.4`,
  포커스 = 보더를 `var(--brand)`로.
- **간격:** 2px 배수 위주. 패널 padding 12px, 행 세로 padding 5–7px.
- **언어 토글:** 최상단 행(header/navbar/탭 바) 오른쪽 끝, `한국어 | EN` 순서, 컴팩트 크기(11px). → [../i18n.md](../i18n.md)
- **전역 요소 style 주의:** `components.css`는 `button`, `input`, `select`, `header`, `main`, `body`를 직접 style한다.
  플러그인에서 다른 layout이 필요하면 마커 블록 뒤에서 덮어쓴다
  (예: i18n·Config Manager는 `main { display: block; overflow-y: auto; padding: 12px; }`).
  아이콘 전용 버튼 등에서 공유 `button` hover 배경이 거슬리면 `X:hover:not(:disabled)`까지 같이 재정의한다.

## 플러그인 고유 CSS를 쓸 때

- 마커 블록 **뒤**, `/* ---- <플러그인> only ---- */` 주석 아래에 둔다.
- 공유 class로 표현 가능한지 먼저 [components.md](components.md)에서 확인한다.
- 2개 이상 플러그인에서 필요해지면 `components.css`로 승격한다.

## 새 플러그인에 적용하기

1. UI html의 `<style>` 맨 앞에 `/* @ds:begin */` 과 `/* @ds:end */` 두 줄을 넣는다.
2. `scripts/sync-ds.mjs`의 `TARGETS` 배열에 경로를 추가하고 실행한다.
3. `figma.showUI(__html__, { themeColors: true })` 로 띄워야 라이트/다크 테마가 자동 반영된다.
4. 헤더는 `header > .hrow > .title + .hactions(… + .lang-toggle)` 구조를 따른다.
