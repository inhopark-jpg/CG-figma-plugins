# CLAUDE.md — Change Marker

기능 설명은 [README.md](README.md). 공통 규칙은 [../CLAUDE.md](../CLAUDE.md).

## 빌드

- `npm run build` → `build.js`가 `src/ui.html`의 placeholder를 채워 루트 `ui.html`을 만든다.
  - `<!-- @inline-css: ../doc/design-system/tokens.css, ../doc/design-system/components.css, src/ui.css -->`
  - `<!-- @inline-js: src/api.js, src/i18n.js, src/ui.js -->`
- **`ui.html`은 생성물.** 항상 `src/`를 고치고 빌드한다. 공유 디자인 시스템을 바꿨을 때도 다시 빌드.
- 문법 확인: `node -c code.js`, 그리고 빌드된 `ui.html`의 `<script>`를 추출해 `node -c`.

## 구조

- `code.js` (샌드박스): `handlers` 객체가 UI 메시지 타입별 처리기. `init`이 entries·token·fileKey·today·lang을 보낸다.
  `placementNow`로 게시 직전 핀 위치를 계산. 샌드박스 토스트 문자열은 상단 `L` 표.
- `src/ui.js` (UI): 전역 상태 `S`(view: `setup|list|detail|form`), `render()`가 `innerHTML`을 통째로 다시 그린다.
  클릭은 `data-act` 속성 → `actions` 객체로 위임. 화면 함수: `viewSetup`, `viewList`, `viewDetail`, `viewForm`.
- `src/api.js`: REST 호출. 오류는 `err.code`로 i18n 키(`errOffline`, `err403` …)에 매핑된다.
- 저장: 그룹은 `figma.root` plugin data(파일별), token·언어는 `clientStorage`(`lang` 키).

## UI 규칙 (이 플러그인)

- 공유 디자인 시스템 사용. `src/ui.css`에는 이 플러그인 전용(그룹 색 견본 `.esw`, 팔레트 `.pal`, 코멘트 행 `.mrow`,
  미리보기 `.preview`, 로딩 막 `.veil`, `.big-add`, `.detail-actions`)만 둔다.
- 입력창은 공유 전역 `input` style + `class="wide"`(폭 100%). 예전 `exp-suffix field` 조합은 쓰지 않는다.
- 언어 토글 `langToggle()`은 모든 뷰의 최상단 행 마지막에 넣는다 (목록: header `.hactions`, 그 외: `.navbar`).
- 그룹 색(`PALETTE`)은 데이터라 인라인 hex 허용.

## 주의

- 코멘트 본문 형식(`TAG_RE`, `LEGACY_MARK`)을 바꾸면 기존 코멘트를 못 찾는다. 이전 형식 인식을 유지할 것.
- `'Canvas'`는 code.js → ui.js로 넘어오는 "빈 캔버스" 표시 값이다 (번역 대상 아님).
- `manifest.json`의 `enablePrivatePluginApi: true`는 `figma.fileKey` 때문. 없으면 파일 링크를 입력받는다.
- `archive/`는 참고용 이전 구현. 빌드·배포 대상 아님.
