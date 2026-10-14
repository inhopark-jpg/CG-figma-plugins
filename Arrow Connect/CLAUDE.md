# CLAUDE.md — Arrow Connect

기능 설명은 [README.md](README.md). 공통 규칙은 [../CLAUDE.md](../CLAUDE.md).

## 빌드·검증

- `npm run build` — esbuild로 `src/code.ts` → `dist/code.js` (gitignore). `npm run watch` 가능.
- `npm run typecheck` — `tsc --noEmit`. 변경 후 둘 다 통과해야 한다.
- UI(`src/ui.html`)는 빌드 없이 매니페스트가 직접 가리킨다. `<html>`/`<head>` 없는 조각 파일이다 (Figma가 감싼다).
  문법 확인은 `<script>`를 추출해 `node -c`.

## 구조

- `src/code.ts`
  - 화살표 데이터는 그룹의 plugin data(`KEY`)에 `Conn`(fromId, toId, 면, 색, label)으로 저장.
  - 복제: plugin data는 복제본에도 따라가므로 복제 화살표는 원본 layer를 가리킨다. `Conn.selfId`(쓴 그룹 ID)가 그룹 ID와 다르면 복제본 →
    `redrawArrow()`가 `adoptCopy()`로 끝마다 `findCopy()`(같은 종류·크기·이름, 원본 위치 + 화살표 이동 거리)를 찾아 다시 연결.
    거리 계산은 그릴 때마다 저장하는 `Conn.snap`(그룹 위치, 양 끝 layer의 bounds·이름·종류)을 쓴다. `selfId`/`snap` 없는 옛 화살표는 연결 유지.
  - `findParts()`가 **layer 이름**으로 파츠를 찾는다 → layer 이름은 절대 번역·변경 금지.
  - `postState()`가 UI에 `{ type: 'state', mode: 'idle'|'ready'|'arrows', …, lang }`을 보낸다.
  - UI 메시지: `connect`, `style`, `text`, `swap`, `detach`, `refresh`, `live`, `resize`, `lang`.
  - `figma.command === 'refresh'`(relaunch 버튼)이면 UI 없이 다시 그리고 종료.
  - 토스트·relaunch 설명 문자열은 `MSG` + `M()`. 언어는 `clientStorage`의 `lang`(기본 `ko`).
- `src/ui.html`
  - `I18N` + `t()`, `applyLang()`이 `data-i18n` 정적 label·툴팁·토글을 갱신, `render()`가 state를 그린다.
  - `fitHeight()`가 footer 하단까지 높이를 재서 `resize` 메시지로 창 높이를 맞춘다.
  - 면 선택기·label 스위치의 강조색 `--accent`는 **화살표 색**(JS가 설정)이다. brand 색이 아님.

## UI 규칙 (이 플러그인)

- 공유 디자인 시스템 사용 (`@ds` 블록은 생성물). 고유 CSS: section·카드·면 선택기(`.picker`)·색 견본(`.swatch`)·footer.
- 색 견본의 hex(`COLORS`)는 캔버스에 쓰이는 데이터라 하드코딩 허용. 그 외 UI 색은 token만.
- 폭 280px이 좁으므로 새 문구는 한국어·영어 모두 한 줄에 들어가는지 확인한다.
- 렌더 함수 안에서 지역 변수 이름으로 `t`를 쓰지 말 것 (번역 함수 `t`를 가린다).
