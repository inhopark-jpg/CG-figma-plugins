# CLAUDE.md — Sync Icon Colors

기능 설명은 [README.md](README.md). 공통 규칙은 [../CLAUDE.md](../CLAUDE.md).

## 빌드

- `code.ts`만 편집 → `npm run build`(tsc)로 `code.js` 생성. `code.js`는 직접 수정 금지.
- `npm run typecheck`로 타입만 검사.

## 구조

- 단일 파일 `code.ts`. `main()`이 선택 검증 → 소스 component 목록 → 페이지를 하나씩 `loadAsync` →
  instance별로 `icon-frame` 쌍을 찾아 색 동기화 → 요약 토스트 후 `figma.closePlugin()`.
- `isIconFrameName`: 컨테이너 이름 규칙. 매칭: 이름 우선, 남은 것은 위치순.
- 제외: plugin data `colorSyncExempt === "true"`.

## UI·언어 규칙

- UI가 없다(`manifest.json`에 `ui` 없음). 공유 디자인 시스템 대상이 아니다.
- **토스트(`figma.notify`)는 한국어로만** 작성한다 (사용자 결정 — 언어를 고를 UI가 없음).
- `console.log`/`warn`/`error`는 `[sync-icon-colors]` 접두어 + 영어 유지 (개발자용).

## 주의

- 텍스트·버튼 배경·테두리는 범위 밖이다. `icon-frame` 하위만 수정한다.
- `resetOverrides()`/`removeOverrides()`를 쓰지 않는다. 달라진 `fills`/`strokes` 배열만 덮어쓴다.
- 문서 데이터 키(`colorSyncExempt`)와 layer 이름 규칙(`icon-frame`)은 번역·변경 금지.
