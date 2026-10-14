# token·component 카탈로그

`tokens.css` / `components.css`에 정의된 것을 "언제 무엇을 쓰는가" 기준으로 정리했다.
시각 확인은 [example.html](example.html). 규칙은 [README.md](README.md).

## 색상 token

| token | Figma 변수 | 용도 |
|---|---|---|
| `--bg` | `bg` | 패널 배경 |
| `--bg-2` | `bg-secondary` | 들어간 면: section 헤더, 표 헤더, 코드 박스, 안내 박스 |
| `--bg-3` | `bg-tertiary` | pill, 스위치 트랙, 카운트 배지 |
| `--bg-hover` | `bg-hover` | hover 배경 |
| `--bg-sel` | `bg-selected` | 선택된 행/카드 배경 |
| `--border` | `border` | 모든 기본 보더 |
| `--text` / `--text-2` / `--text-3` | `text` / `text-secondary` / `text-tertiary` | 본문 / label·힌트 / 접두어·placeholder·비활성 |
| `--brand` | `bg-brand` | 주요 버튼, 활성 탭 밑줄, 포커스, 선택 보더 |
| `--brand-text` | `text-onbrand` | brand 배경 위 글자 (**brand 색 글자가 아님**) |
| `--text-brand` | `text-brand` | 일반 배경 위 brand 색 글자 (링크, alias) |
| `--red` / `--red-bg` / `--red-solid` | `text-danger` / `bg-danger-secondary` / `bg-danger` | 오류 글자 / 연한 오류 면 / 파괴적 버튼 채움 |
| `--warn` / `--warn-bg` | `text-warning` / `bg-warning-secondary` | 경고 글자 / 경고 면 |
| `--success` | `icon-success` | "Live" 등 정상 상태 점 |
| `--shadow-float`, `--scrim` | — | 떠 있는 layer 그림자, 모달 뒤 반투명 막 |
| `--font-ui`, `--mono` | — | 기본 폰트, 값 표시용 고정폭 폰트 |

## layout 셸

| class/요소 | 용도 |
|---|---|
| `body` | `flex column; height 100vh` — 헤더 고정 + 본문 스크롤 구조 |
| `header` > `.hrow` > `.title` + `.hactions` | 최상단 행. 제목 왼쪽, 액션·언어 토글 오른쪽 (`.hactions`는 `margin-left:auto`) |
| `.navbar` > `.navbtn` + `.trail` | 뒤로/앞으로 + 경로 표시 바 (하위 화면의 최상단 행으로도 사용) |
| `main` > `.top-fixed` + `.tabbody` | 탭 구조일 때 `.tabbody`만 스크롤. 탭이 없는 플러그인은 `main`을 덮어써 스크롤 |
| `.tabs` > `.tab`(.active) > `.tb` | 탭 바, 활성 탭은 brand 밑줄. `.tb`는 카운트 pill |
| `.sec` > `.sec-head`(.closed) + `.sec-body` | 접히는 section (sticky 헤더) |
| `.foot` | 하단 고정 안내 바 |
| `.center-msg`, `.empty`(.empty-t), `.empty-pane` | 빈 상태 / 안내 메시지 |

## 버튼

| class | 용도 |
|---|---|
| `button` | 기본 (7px 12px, 12px/500, radius 6) |
| `.primary` | 주요 동작 (brand 채움) |
| `.ghost` | 보조, 테두리 없음 |
| `.danger` / `.danger-fill` | 파괴적 동작 — 빨간 글자 / 빨간 채움(확인 다이얼로그) |
| `.selected` | 눌린 상태 표시 (`--bg-sel` + `--text-brand`) |
| `.full` / `.sm` / `.xs` | 전체 폭 / 작게(4px 8px) / 더 작게(3px 7px, 11px, radius 4) |
| `button .scope` | 버튼 안 보조 문구(동작 범위 등). 앞에 `· `가 붙음. 예: *토큰 정리 · 현재 페이지* |
| `.icon-btn`, `.navbtn` | 아이콘 전용 버튼 / 원형 내비 버튼 |
| `.lang-toggle` > `.lang-btn`(.active) | 언어 토글 (header·navbar 안에서 자동으로 컴팩트) |
| `.seg` > `.seg-btn`(.active) | 세그먼트 컨트롤 (기본은 mono 11px — 값 선택용) |

## 입력

| class/요소 | 용도 |
|---|---|
| `input`(text·password·number·search·date·타입 없음), `textarea` | 공통 style 자동 적용. 포커스 시 brand 보더 |
| `input.invalid` | 오류 보더 |
| `input.bare` | 평소엔 테두리 없음 → hover 시 보더 (인라인 이름 변경) |
| `select`, `.exp-num`, `.exp-suffix` | cell렉트 / 좁은 숫자 입력 |
| `.field` > `label`(또는 `.lbl`) + 컨트롤, `.field-err` | label이 위에 있는 입력 묶음, 오류 문구 |
| `.switch` (`<input type=checkbox class=switch>`) | 토글 스위치 (`.on` class로도 동작) |
| `.hcheck`(.on) > `.box`, `.lp-check` | 작은 커스텀 체크박스 |
| `.thumb-size` | 범위 슬라이더 |

## 표시 요소

| class | 용도 |
|---|---|
| `.card`(.clickable, .own) > `.card-head` > `.ch-name` + `.ch-sub` | 목록 카드 |
| `.picked` | 클릭으로 선택된 카드/행 강조 |
| `.var-head` > `.leaf` + `.grp` + `.desc` | 선택 대상의 요약 블록 (회색 박스) |
| `.badges` > `.badge`(.b-main, .warn, .danger, .link) | pill 배지 |
| `.tok`, `.tok-none` | 변수/token 이름 pill (mono), 없음 표시 |
| `.tslot`, `.tvariant`, `.text-badge` | 10px 대문자 카테고리 태그 (slot 핑크, component 보라, 중립) |
| `.prow` > `.pk` + `.pv` | label/값 한 줄 |
| `.copy`, `.mono` | 클릭 복사 가능한 값, 고정폭 |
| `.sw`, `.sc-sw`, `.checker` | 색 견본, 체커보드 배경 |
| `.trow`(.self, .origin, .current) + `.tkids`, `.tcaret` | 트리 행 |
| `.tr-wrap` > `.tr-table` (`.tr-name`, `.colres`) | 데이터 표, 열 크기 조절 핸들 |
| `.content-box`, `.detail-box` | 코드/텍스트 미리보기, 들여쓴 상세 |
| `.pager` | 페이지 넘김 바 |

## 피드백·오버레이

| class | 용도 |
|---|---|
| `.notice`(.info, .warn, .err) | 본문 안 안내 줄. 기본은 점선 보더, 오른쪽에 `button.xs` 배치 가능 |
| `.toast`(.show, .warn) | 패널 하단 고정 토스트 (기본 = 오류색) |
| `.overlay` > `.dialog` > 내용 + `.dialog-actions` | 확인/입력 모달. Figma iframe은 `window.confirm/prompt`를 막으므로 이것을 쓴다 |
| `.menu` > `input` + `.menu-list` > `.menu-group` / `.menu-item`(.active, .danger) > `.meta`, `.check`, `.menu-sep`, `.menu-empty` | Figma style 다크 드롭다운 (네이티브 select 팝업은 Figma 안에서 너무 작음) |
| `.tip`, `.tinfo` | 떠 있는 툴팁, 정보 아이콘 |
| `.spin` | 로딩 스피너 |
| `.resize-grip` | 창 크기 조절 그립 (오른쪽 아래, `figma.ui.resize`와 함께) |
| `.rbox` + `.rhandle` | 높이 조절 가능한 내부 패널 |

## Dev Inspector 전용으로 시작했지만 공유 파일에 있는 것

`.lp*`(layout 필드), `.al-*`(auto layout 정렬 위젯), `.exp-*`(Export 패널), `.style-pill`, `.eff-*`(effect), `.tthumb`, `.icon-prev`, `.subsec`.
다른 플러그인에서 비슷한 UI가 필요하면 새로 만들지 말고 이것을 재사용한다.

## 마크업 예시: 표준 헤더

```html
<header>
  <div class="hrow">
    <div class="title">Plugin name</div>
    <div class="hactions">
      <button class="ghost sm">↻</button>
      <div class="lang-toggle">
        <button class="lang-btn active" data-lang="ko">한국어</button>
        <button class="lang-btn" data-lang="en">EN</button>
      </div>
    </div>
  </div>
</header>
```
