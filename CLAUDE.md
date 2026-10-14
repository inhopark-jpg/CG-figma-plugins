# CLAUDE.md — Figma Plugins 모음

이 폴더는 서로 독립된 Figma 플러그인 8개와, 그 플러그인들이 공유하는 디자인 시스템·문서로 구성된다.
작업 전 이 파일을 읽고, 필요한 세부 문서는 아래 포인터를 따라간다.

## 플러그인 목록

| 폴더 | 플러그인 이름 (manifest, 폴더명과 동일) | 한 줄 요약 | UI | 문서 |
|---|---|---|---|---|
| `Change Marker/` | Change Marker | 변경된 layer에 만료일이 있는 Figma 코멘트를 달고, 만료되면 자동 삭제 | 있음 (340×560) | [README](Change%20Marker/README.md) · [CLAUDE](Change%20Marker/CLAUDE.md) |
| `Dev Inspector/` | Dev Inspector | Dev Mode 기본 Inspect 패널이 놓치는 정보를 보여주는 읽기 전용 인스펙터 | 있음 (460×740) | [README](Dev%20Inspector/README.md) · [CLAUDE](Dev%20Inspector/CLAUDE.md) |
| `Sync Icon Colors/` | Sync Icon Colors | main component의 `icon-frame` 색상을 모든 instance에 다시 동기화 | 없음 (메뉴 명령) | [README](Sync%20Icon%20Colors/README.md) · [CLAUDE](Sync%20Icon%20Colors/CLAUDE.md) |
| `i18n/` | i18n | `language` collection의 번역 문자열 변수를 편집·연결·정리·CSV 입출력 | 있음 (380×660) | [README](i18n/README.md) · [CLAUDE](i18n/CLAUDE.md) |
| `Arrow Connect/` | Arrow Connect | 두 layer를 잇고 layer를 따라 움직이는 `point-indicator` 화살표 | 있음 (280×자동) | [README](Arrow%20Connect/README.md) · [CLAUDE](Arrow%20Connect/CLAUDE.md) |
| `Config Manager/` | Config Manager | component에 연결된 preset·config를 Figma 변수로 관리하고, 페이지 mode 일괄 전환 + 캔버스 표 생성 | 있음 (760×680, 크기 조절) | [README](Config%20Manager/README.md) · [CLAUDE](Config%20Manager/CLAUDE.md) |
| `Organize Comp Variants/` | Organize Comp Variants | 선택한 component set의 variant를 grid로 정리하고 X·Y축에 브래킷 label을 달아 spec 문서화 | 오류 시에만 (360×자동) | [README](Organize%20Comp%20Variants/README.md) · [CLAUDE](Organize%20Comp%20Variants/CLAUDE.md) |
| `Organize Sections/` | Organize Sections | 선택한 section tree를 정리: padding·배경색 번갈아 칠하기, 페이지 layout(화면·sub page·building-block), component layout(pattern·template·skeleton) | 있음 (320×자동) | [README](Organize%20Sections/README.md) · [CLAUDE](Organize%20Sections/CLAUDE.md) |

## 공통 문서

- [doc/design-system/README.md](doc/design-system/README.md) — 공유 디자인 시스템 사용법, 동기화 스크립트, 규칙
- [doc/design-system/components.md](doc/design-system/components.md) — token·component 카탈로그 (class명 → 용도)
- [doc/design-system/example.html](doc/design-system/example.html) — 브라우저로 열어 보는 시각 레퍼런스
- [doc/i18n.md](doc/i18n.md) — 한국어/영어 지원 규칙과 구현 패턴

## 반드시 지킬 규칙

1. **UI는 공유 디자인 시스템만 사용한다.** 원본은 `doc/design-system/tokens.css`, `components.css`.
   - 각 플러그인 UI html의 `/* @ds:begin */ … /* @ds:end */` 블록은 **생성물**이다. 직접 고치지 말 것.
   - 디자인 시스템을 수정했다면 루트에서 `node scripts/sync-ds.mjs` 실행 → Change Marker·Config Manager는 이후 각자 `npm run build`.
   - 플러그인 고유 CSS는 마커 블록 **뒤**에 두고, 색은 token(`var(--bg)`, `var(--text-2)` …)만 쓴다. hex 하드코딩 금지
     (예외: 캔버스에 쓰이는 데이터 색상 — Arrow Connect 화살표 색, Change Marker 그룹 색).
   - 새 component가 2개 이상 플러그인에 필요하면 플러그인이 아니라 `components.css`에 추가한다.
2. **모든 UI 플러그인은 한국어/영어를 지원한다.** 기본값은 한국어.
   언어 토글(`한국어 | EN`)은 최상단 행(header 또는 navbar)의 **오른쪽 끝**. 자세한 규칙은 [doc/i18n.md](doc/i18n.md).
   - 예외: Sync Icon Colors는 UI가 없으므로 토스트를 **한국어로만** 표시한다 (사용자 결정).
3. **UI 리터치 작업에서 기능·UX 동작을 바꾸지 않는다.** style·문구만 다룬다.
4. **캔버스/문서에 쓰이는 문자열은 번역하지 않는다** (layer 이름, component 속성명, 변수 설명 등). 코드가 이름으로 찾기 때문.
5. **문서는 한국어로, 파일당 200줄 이하.** 넘치면 `docs/` 하위 문서로 나누고 포인터를 남긴다.

## 빌드 요약

| 플러그인 | 빌드 | 편집 대상 → 생성물 |
|---|---|---|
| Change Marker | `npm run build` (`build.js`) | `src/*` + `../doc/design-system/*` → `ui.html` |
| Dev Inspector | 없음 | `ui.html`, `code.js` 직접 편집. 테스트: `sh test/run.sh` |
| Sync Icon Colors | `npm run build` (tsc) | `code.ts` → `code.js` |
| i18n | 없음 | `ui.html`, `code.js` 직접 편집 |
| Arrow Connect | `npm run build` (esbuild), `npm run typecheck` | `src/code.ts` → `dist/code.js`, UI는 `src/ui.html` 그대로 로드 |
| Config Manager | `npm run build` (`build.mjs`), `npm run typecheck` | `src/*` → `dist/*`. UI 미리보기: `node dev-harness/serve.mjs` → http://localhost:5178 |
| Organize Comp Variants | `npm run build` (esbuild), `npm run typecheck`, `npm test` | `src/code.ts` + `src/layout.ts` → `dist/code.js`, UI는 `src/ui.html` 그대로 로드 |
| Organize Sections | `npm run build` (esbuild), `npm run typecheck`, `npm test` | `src/code.ts` + `src/apply.ts` + `src/layout.ts` → `dist/code.js`, UI는 `src/ui.html` 그대로 로드 |

설치는 모두 동일: Figma 데스크톱 → Plugins → Development → Import plugin from manifest… → 각 폴더의 `manifest.json`.

## 폴더 구조

```
CLAUDE.md                 ← 이 파일 (인덱스)
doc/design-system/        공유 token·component (원본), example.html, 문서 2개
doc/i18n.md               다국어 규칙
scripts/sync-ds.mjs       디자인 시스템을 각 플러그인 UI에 주입 (--check 로 드리프트 검사)
<플러그인 폴더>/README.md   목적·기능 (사람용)
<플러그인 폴더>/CLAUDE.md   작업 가이드 (Claude Code용)
```

## git 저장소

- 이 폴더 **전체가 하나의 저장소**다: [inhopark-jpg/CG-figma-plugins](https://github.com/inhopark-jpg/CG-figma-plugins) (`main`).
  플러그인 폴더 안에 따로 저장소를 만들지 않는다 (i18n도 예전엔 별도 저장소였으나 2026-10-15 합침).
- `node_modules/`, `dist/`, `.DS_Store`는 커밋하지 않는다 (루트 `.gitignore`). clone 후 빌드가 있는 플러그인은
  `npm install` → `npm run build`를 해야 Figma에서 import할 수 있다.
- 커밋·push는 사용자가 요청할 때만.
