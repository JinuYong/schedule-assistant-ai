# schedule-assistant-ai

AI 기반 일정 비서 앱. **macOS 메인 타겟**, 전역 단축키로 플로팅 입력창을 열어 자연어로 일정을 등록하고
Google Calendar와 연동한다. 할일은 Cali 서버(apps/server)에 저장한다.

---

## 모노레포 (Bun workspaces)

```
apps/app/          Tauri 앱 (src, src-tauri, scripts, index.html, vite.config.ts, .env.local …)
apps/server/       API 서버 (Hono + Bun + Drizzle/MySQL, https://cali-api.jinu.io)
packages/shared/   앱·서버 공용 요청·응답 형식 (zod)
```

- **이 문서의 `src/`·`src-tauri/`·`scripts/`·`.env.local`·`out/` 경로는 모두 `apps/app/` 기준이다** (서버 절은 `apps/server/` 기준).
- `bun install`은 루트에서 한 번(lockfile도 루트 `bun.lock` 하나, Bun isolated 설치라 패키지는 각 폴더 `node_modules`에 링크). 루트 스크립트 `dev`·`dev:web`·`dev:tauri`·`build`·`dev:server`는 해당 앱으로 넘기고, `typecheck`·`lint`·`test`는 모든 패키지에서 돈다.
- 패키지 이름은 `@cali/app`·`@cali/server`·`@cali/shared`. 앱은 서버 코드 타입(Hono RPC)을 가져오지 않는다 — 앱 타입 검사가 서버 쪽(Bun·Drizzle) 타입까지 끌어오지 않게 형식은 `@cali/shared`에만 둔다.
- Rust `target/`에는 절대 경로가 박혀 있어 폴더를 옮기면 `cargo clean`이 필요하다(`failed to read plugin permissions …` 오류).

## 서버 (apps/server)

```bash
bun run dev:server                          # 로컬 서버 http://localhost:8787 (apps/server/.env.local을 Bun이 읽음)
bun run --cwd apps/server db:generate       # schema.ts 바꾼 뒤 → drizzle/에 마이그레이션 SQL
bun run --cwd apps/server db:migrate        # 마이그레이션만 적용 (서버는 뜰 때 자동 적용)
```

- 구조: `src/app.ts`(라우트 조립, 의존성 주입) · `src/index.ts`(진입: DB 연결 → 마이그레이션 → 서빙) · `src/env.ts`(zod) · `src/db/`(schema·연결·migrate) · `src/auth/` · `src/todos/` · `src/memos/`
- 환경 변수: `DATABASE_URL`(mysql://…), `GOOGLE_CLIENT_IDS`(id_token `aud`로 받을 OAuth 클라이언트 ID, 쉼표로 여럿 — 앱 `VITE_GOOGLE_CLIENT_ID`와 같은 값, 안드로이드 추가 시 덧붙임), `PORT`(8787), `CORS_ORIGINS`(기본: Tauri 창 출처 + 개발 `http://localhost:3100`)
- **로그인**: 앱이 Google OAuth(scope `openid email profile` + 캘린더)로 받은 `id_token`을 `POST /auth/google`로 보내면 서버가 Google 공개키로 검증(`auth/google.ts`: 발급자·aud·만료·`email_verified`)하고 사용자를 만들거나 갱신(Google `sub` 기준)한 뒤 세션 토큰을 준다. 이후 요청은 `Authorization: Bearer`. DB엔 토큰의 SHA-256만, 90일 안 쓰면 만료(쓰면 하루 단위로 연장). 가입은 Google 계정이면 누구나.
- **할일**: `todo_lists`·`todos`·`todo_checklist_items`. 저장소(`todos/store.ts`의 `TodoStore`, 테스트는 `memory-store.ts`)는 통째로 쓰기만 하고, 합치기·기본값·반복은 `todos/routes.ts`. 반복 할일은 완료할 때 서버가 다음 회차를 같은 트랜잭션에서 만들고(`packages/shared/src/recurrence.ts`를 앱과 같이 씀, 없는 날은 말일로), 완료한 쪽은 반복을 비운다. 완료한 할일은 지우지 않고 `completedAt`으로 보관(`GET /todos/completed`). 목록이 없으면 `GET /todos`가 "할일" 목록을 만든다. 체크리스트는 저장할 때마다 다시 넣어 항목 id가 바뀐다
- **메모**: `memo_properties`(사용자마다 하나의 속성 정의 — 모든 메모가 같은 속성) · `memos`(제목, BlockNote 블록 JSON `content`, 본문 평문 `content_text`, 속성 값 `property_values` = `{ [속성 id]: 값 }`). 평문은 저장할 때 서버가 블록에서 뽑고(`extractMemoText`), 속성 값은 저장·응답 때 지금 정의로 거른다(`normalizeMemoValues`, 둘 다 shared) — 지운 속성·선택지의 값은 DB에 남아도 안 보인다. 검색은 서버(`GET /memos?q=`, 제목·평문 LIKE), 거르기·정렬은 앱(`lib/memo-query.ts`). 속성 종류는 만든 뒤 못 바꾼다. 이미지·파일 블록은 서버 파일 저장소가 없어 뺐다
- 로컬에서 `db:generate`로 마이그레이션을 새로 만들면 `bun --watch`가 `drizzle/`을 안 봐서 `db:migrate`를 직접 돌려야 한다
- 인증 저장은 `AuthStore` 인터페이스(`auth/store.ts` DB, `auth/memory-store.ts` 테스트) — 라우트 테스트는 DB 없이 돈다. 테스트는 `bun test`.
- 시각은 `datetime(3)` UTC, 값은 앱에서 넣는다(`$defaultFn`, mysql2 `timezone: "Z"`). ID는 `bigint unsigned` 자동 증가(`serial`은 UNIQUE 인덱스를 하나 더 만들어 안 씀).
- 마이그레이션은 **서버가 뜰 때 자동 적용**(push = 배포 = 스키마 반영). MySQL DDL은 되돌릴 수 없으니 칸 삭제·이름 변경은 그 칸을 안 쓰는 코드를 먼저 배포한 뒤 다음 배포에서.
- 앱 쪽: 서버 호출은 `src/lib/api.ts` 한 곳(`VITE_API_URL`, 없으면 개발 `http://localhost:8787`·배포 `https://cali-api.jinu.io`), 세션은 `src/store/account.ts`(tauri-store `server.session`). Google 연결 = Cali 계정이라 연결 해제하면 서버에서도 로그아웃.

### 서버 배포

개인 OCI 서버(ARM, `ssh oci`, red-shoes·make-post-together와 같은 서버)의 `~/cali`에서 Docker Compose(루트 `compose.yaml`, 이미지 `apps/server/Dockerfile`)로 돈다. HTTPS는 서버 공용 Caddy(`~/proxy/sites/cali-api.caddy` → `cali-api:8787`, 네트워크 `web`), DNS는 Cloudflare `cali-api.jinu.io` A 레코드(DNS만). DB는 같은 VCN의 MySQL HeatWave에 DB `cali` + 전용 계정 `cali`.

- **자동 배포**: `apps/server/**`·`packages/shared/**`·`compose.yaml`·`bun.lock` 등이 바뀐 main push면 `.github/workflows/deploy-server.yml`이 검사 → rsync → 서버에서 `docker compose up -d --build` → 컨테이너 안에서 `/health` 확인, 실패하면 `cali-api:prev`로 되돌린다. 앱 릴리스(`release.yml`)와 따로 돈다. 저장소 secrets `SSH_KEY`·`SSH_HOST`·`SSH_USER`.
- 비밀값은 서버 `~/cali/.env`에만(`DATABASE_URL`, `GOOGLE_CLIENT_IDS`). rsync가 `.env*`를 빼고 보낸다.
- **앱이 운영 서버를 부르므로, 서버가 먼저 떠 있어야 한다.** 서버 없이 앱을 릴리스하면 캘린더는 되지만 설정에 "Cali 서버에 로그인하지 못했습니다"가 뜬다.

---

## 기술 스택

| 영역          | 기술                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| 데스크톱 쉘   | **Tauri v2** (Rust 백엔드, 시스템 WebView)                                                                         |
| 프론트엔드    | **Vite** + React 19 + TypeScript, 라우팅은 **TanStack Router**(코드 기반, `src/router.tsx`)                        |
| 스타일링      | **CSS Modules** (`.module.css`) — Tailwind 사용 **절대 금지**                                                      |
| 상태 관리     | Zustand                                                                                                            |
| AI            | Claude API (Rust `reqwest` 경유, CORS 우회)                                                                        |
| 캘린더        | Google Calendar REST API (직접 fetch)                                                                              |
| 할일          | Cali 서버 `/todos`·`/todo-lists` (`src/lib/api.ts`, 세션 Bearer)                                                   |
| 메모          | Cali 서버 `/memos`·`/memo-properties`, 본문 편집기 **BlockNote**(`@blocknote/mantine`, 코드 블록 강조 `@blocknote/code-block`, 메모 화면과 함께 지연 로드) |
| 로컬 저장소   | `tauri-plugin-store` (`LazyStore`) — DB 없음, Google Calendar가 source of truth                                    |
| OAuth         | `@fabianlars/tauri-plugin-oauth` (`start()` + `onUrl()` 패턴)                                                      |
| 알림          | `tauri-plugin-notification` + JS setTimeout                                                                        |
| 단축키        | `tauri-plugin-global-shortcut`                                                                                     |
| 패키지 매니저 | **Bun** (npm/yarn/pnpm 사용 **절대 금지**)                                                                         |

### 도구 버전 (가능한 최신으로 유지)

- **Bun**: 루트 `package.json`의 `packageManager`(CI는 `bun-version-file`로 읽음). 올리면 `apps/server/Dockerfile`의 `oven/bun:*-slim`도 같이.
- **Node**: `.node-version`(fnm `--use-on-cd`가 자동 전환, 릴리스 CI는 `setup-node`). Vite·Tauri CLI·Vitest가 Node로 돈다. `@types/node`도 같은 메이저.
- **타입 검사는 `bun check`**(Bun 내장, tsc와 같은 오류, 패키지마다 0.1초 안팎). `tsc`는 쓰지 않는다.
- **포맷은 `bun fmt`**(Bun 내장, Prettier 기본 규칙). 루트 `bun run format`·`format:check`, 무시 목록은 루트 `.prettierignore`(`src-tauri/`는 릴리스 스크립트가 jq·sed로 고쳐 써서 제외, Rust는 `cargo fmt`). package.json에 `fmt`라는 스크립트를 만들지 않는다 — `bun fmt`가 그 스크립트를 대신 실행한다.
- **린트는 ESLint + typescript-eslint**(Bun에 린터가 없다). ESLint가 TS를 읽으려면 typescript-eslint 파서가 필요하고, 그 파서가 `typescript` 패키지를 import하므로 `typescript`는 typescript-eslint가 지원하는 최신(지금 `~6.0`)으로 둔다. TS 7은 아직 JS API가 없어 typescript-eslint가 못 쓴다.
- **Rust**: stable 최신(`rustup update`, 릴리스 CI는 `dtolnay/rust-toolchain@stable`). 크레이트는 `cargo update` + 메이저는 crates.io 확인.

---

## 패키지 매니저

**반드시 Bun을 사용한다.**

```bash
bun install              # 의존성 설치
bun add <package>        # 패키지 추가
bun run <script>         # 스크립트 실행
bunx <cli>               # npx 대신
```

Windows 환경에서는 SSL 인증서 이슈가 있을 수 있음:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 bun install
```

---

## 빌드 및 실행 명령어

```bash
# 개발
bun run dev              # Vite 개발 서버 + 더미데이터 (VITE_MOCK=1, 로그인 없이 브라우저 UI 확인용)
bun run dev:web          # Vite 개발 서버 (더미데이터 없이)
bun run dev:tauri        # Tauri + Vite 동시 실행 (메인 개발 방식)

# 빌드
bun run build            # 타입체크 + Vite 빌드 → out/ 폴더 (dist/는 릴리스가 dmg를 모으는 곳이라 안 씀)
bun run build:tauri      # Tauri 앱 패키징 (macOS: .dmg, Windows: .exe)

# 코드 품질
bun run typecheck        # 타입 검사 (bun check, 모든 패키지)
bun run lint             # ESLint
bun run format           # 포맷 (bun fmt, 검사만은 format:check)
```

> **Windows에서 `cargo` 사용 시**: PATH에 Rust toolchain 추가 필요
>
> ```bash
> export PATH="/c/Users/Administrator/.cargo/bin:$PATH"
> ```

---

## 프로젝트 구조

```
apps/app/
├── src-tauri/                   # Rust 백엔드 (edition 2024)
│   ├── src/
│   │   ├── main.rs              # 진입점
│   │   ├── lib.rs               # run() 빌더 (setup·invoke_handler·run-event)
│   │   ├── claude.rs            # call_claude / stream_chat
│   │   ├── oauth.rs             # Google 토큰 교환·갱신
│   │   ├── places.rs           # NAVER API HUB 지역검색 (장소명 → 주소, 인증키 컴파일 타임 주입)
│   │   ├── floating_macos.rs    # 플로팅 창 (NSPanel) + 전역 단축키
│   │   └── error.rs             # auth_error/oauth_error 문자열 헬퍼
│   ├── capabilities/
│   │   └── default.json         # 플러그인 권한 설정
│   ├── icons/                   # 앱 아이콘 (ICO, PNG, ICNS)
│   ├── build.rs                 # tauri_build + NAVER 인증키 컴파일 타임 주입
│   ├── Cargo.toml
│   └── tauri.conf.json          # Tauri 설정 (창 구성, frontendDist 등)
├── src/
│   ├── main.tsx                 # 메인 창 진입 (Providers + RouterProvider)
│   ├── router.tsx               # 라우트 트리: / → /schedule, 레이아웃 아래 schedule·todo·memo(지연 로드)·chat·settings
│   ├── globals.css              # CSS 변수 정의
│   ├── routes/                  # 메인 창 화면 (화면마다 page.tsx)
│   │   ├── main-layout.tsx      # 사이드바 + <Outlet /> + 토스트
│   │   ├── schedule/            # Google Calendar 일정 (컨테이너 page.tsx)
│   │   │   ├── calendar-utils.ts  # 달력 그리드 계산 + 일정 폼 타입/상수 (schedule 로컬)
│   │   │   ├── hooks/           # use-today-info / use-event-drag
│   │   │   └── components/      # calendar-grid, event-list, todo-groups, *-modal
│   │   ├── chat/                # Claude AI 채팅 + 브리핑
│   │   ├── todo/                # 할일 목록 (components/: 목록 머리·이름 입력·완료됨)
│   │   ├── memo/                # 메모: 왼쪽 목록(검색 + 거르기·정렬 팝오버) + 오른쪽 편집기(노션식 속성 행·BlockNote). 팝오버는 components/popover.tsx. router.tsx에서 지연 로드
│   │   └── settings/            # OAuth 연동, 테마, 단축키 설정
│   ├── floating/                # 플로팅 입력창 (main.tsx 진입, layout·page)
│   ├── components/
│   │   ├── Sidebar/             # 사이드바 네비게이션
│   │   ├── ThemeApplier/        # CSS 변수 동적 설정 (테마)
│   │   ├── TauriInit/           # 전역 단축키 등록
│   │   ├── Providers/           # QueryClient + ThemeApplier + TauriInit
│   │   └── icons.tsx            # 공통 아이콘 컴포넌트 (평탄화)
│   ├── hooks/                   # 페이지 간 공유 훅
│   │   ├── use-todo-actions.ts  # 할일 행 동작(완료·중요·삭제·체크리스트, schedule·todo 공용)
│   │   ├── use-resizable-width.ts # 끌어서 패널 넓이 조절(일정 오른쪽 패널·메모 목록, localStorage 기억)
│   │   └── use-oauth-connection.ts # OAuth 연결 상태/흐름
│   ├── lib/
│   │   ├── claude.ts            # Claude API (invoke "call_claude" / "stream_chat")
│   │   ├── google-calendar.ts   # Google Calendar REST API + buildEventFromParsed
│   │   ├── api.ts               # Cali 서버 호출 단일 진입점 (로그인·할일)
│   │   ├── todo-form.ts         # 할일 폼 상태/빌더 (TodoFormState·buildTodoBody 등, 공유)
│   │   ├── event-match.ts       # 이벤트 자동완성·매칭 (matchEventsByText·parseDateHint·matchCalendar, 공유)
│   │   ├── location.ts          # 장소 라벨·지도 가능 판별·네이버지도 열기
│   │   ├── open-url.ts          # 주소를 시스템 브라우저로(plugin-shell)
│   │   ├── memo-query.ts        # 메모 거르기·정렬(순수 함수)
│   │   ├── naver-place.ts       # NAVER API HUB 지역검색 래퍼 (invoke "search_places")
│   │   ├── dev-mock.ts          # 개발용 더미데이터 (VITE_MOCK=1)
│   │   ├── oauth.ts             # Google OAuth 흐름 (provider 팩토리)
│   │   ├── authenticated-fetch.ts # 공통 인증 fetch 골격 (401 재시도·429 처리)
│   │   ├── api-errors.ts        # AuthError / RateLimitError
│   │   ├── promise-cache.ts     # createSingleFlight (인플라이트 Promise 공유)
│   │   ├── tauri-store.ts       # LazyStore 래퍼 (storeGet/storeSet/storeDelete)
│   │   ├── notifications.ts     # 알림 스케줄링 (setTimeout + tauri-plugin-notification)
│   │   ├── hotkey.ts            # 전역 단축키 등록/해제
│   │   ├── date-utils.ts        # 날짜 포맷/계산 유틸
│   │   └── floating-window.ts   # 플로팅 창 토글
│   ├── types/
│   │   └── tokens.ts            # BaseTokens
│   └── store/
│       ├── auth.ts              # Google 토큰 (Zustand, createTokenRefresh)
│       ├── account.ts           # Cali 서버 세션 (SignInGate가 봄)
│       ├── events.ts            # 캘린더 이벤트 캐시 + 알림 스케줄
│       ├── todos.ts             # 할일·목록·완료됨 (서버 응답 반영, 알림 재예약)
│       ├── memos.ts             # 메모·속성, 자동 저장(입력 멈추고 0.7초, 못 보낸 건 localStorage `memo.unsaved`에 백업 → 다음 조회 때 재전송)
│       ├── toast.ts            # 토스트 알림 상태 (Zustand)
│       └── theme.ts             # 테마 색상 (Zustand + localStorage)
├── index.html                   # 메인 창 진입 HTML → src/main.tsx
├── floating.html                # 플로팅 창 진입 HTML → src/floating/main.tsx
├── vite.config.ts               # 진입점 둘, @ 별칭, 포트 3100 고정, outDir out
├── scripts/                     # 릴리스 버전 계산·반영 (next-version.sh, bump-version.sh)
└── package.json                 # @cali/app
```

(루트에는 `package.json`(workspaces)·`bun.lock`·`CLAUDE.md`·`AGENTS.md`(→ CLAUDE.md 심볼릭 링크)·`docs/`·`.github/`)

---

## 핵심 아키텍처

### 1. 정적 빌드 + Tauri WebView

- Vite가 정적 HTML/CSS/JS를 `out/` 폴더에 생성, Tauri가 WebView에 직접 서빙 (`frontendDist: "../out"`)
- 창마다 진입점이 따로다: 메인 창 `index.html`(라우터), 플로팅 창 `floating.html`(라우터 없음, 메인 화면 코드를 안 실음). 둘 다 `Providers`로 감싼다
- 없는 경로는 Tauri가 `index.html`로 돌려주므로(tauri `manager/mod.rs`) `/todo`에서 새로 고쳐도 그대로 열린다
- 서버 렌더링이 없으므로 `localStorage` 같은 브라우저 값은 `useState` 초기화 함수에서 바로 읽는다(마운트 뒤 effect로 복원할 필요 없음)
- 모든 서버 로직은 Rust commands로 처리

### 2. 플로팅 창 메커니즘

- `tauri.conf.json`에 두 개의 창 정의: `main` (1200×800) + `floating` (620×64, alwaysOnTop, transparent)
- `TauriInit.tsx` → `tauri-plugin-global-shortcut`으로 단축키 등록
- 단축키 트리거 → `floating-window.ts`의 `WebviewWindow.getByLabel("floating")`으로 토글

### 3. 자연어 → 일정 파이프라인

```
플로팅창 입력
  → invoke("call_claude", { apiKey, body })   # Rust로 Claude API 호출 (CORS 우회)
  → Claude structured output (일정 정보 추출)
  → createEvent() → Google Calendar REST API
  → useEventsStore.fetchEvents() → 캐시 갱신 + 알림 재스케줄
```

### 4. Claude 스트리밍 채팅

```
streamChat() 호출
  → listen("chat-chunk") / listen("chat-done") 리스너 등록
  → invoke("stream_chat", ...) 비동기 실행 (await 없이)
  → Rust SSE 파싱 → window.emit("chat-chunk", text) per delta
  → 프론트엔드에서 실시간으로 메시지 누적
```

### 5. OAuth 흐름 (Google)

```
start() → 로컬 OAuth 서버 시작 (포트 자동 할당)
onUrl(callback) → 콜백 URL 리스너 등록
open(authUrl) → 시스템 브라우저에서 OAuth 인증
  → localhost:{port}/?code=xxx 리다이렉트
  → invoke("exchange_google_token")  # Rust에서 토큰 교환 (client_secret 보호)
  → useAuthStore.setGoogleTokens() → storeSet("google.tokens")
  → id_token으로 Cali 서버 로그인 (store/account.ts)
```

### 6. 테마 시스템

- `THEME_COLORS` 배열에 5가지 색상 정의 (핑크, 퍼플, 로즈, 골드, 시안)
- `ThemeApplier.tsx`가 `document.documentElement.style.setProperty`로 CSS 변수 동적 설정:
  - `--color-accent` (메인 색상)
  - `--color-accent-hover` (호버 색상)
  - `--color-accent-soft` (rgba 15% — 사이드바 active 배경)
  - `--color-accent-ultra-soft` (rgba 8% — 사이드바 hover 배경)
- localStorage + tauri-store 양쪽에 저장

### 7. 알림 시스템

- `fetchEvents()` 호출 시 `scheduleEventNotifications()` 자동 실행
- 각 이벤트 시작 **15분 전** setTimeout 등록
- Tauri 환경에서 `sendNotification()` (tauri-plugin-notification) 실행
- 비-Tauri(브라우저 개발) 환경에서는 `isTauri()` 체크로 무시

---

## Rust commands (src-tauri/src/, 모듈별)

| 커맨드                  | 모듈              | 역할                                                                        |
| ----------------------- | ----------------- | --------------------------------------------------------------------------- |
| `call_claude`           | claude.rs         | Claude API 비스트리밍 호출 (일정 파싱용)                                    |
| `stream_chat`           | claude.rs         | Claude SSE 스트리밍 → `chat-chunk` / `chat-done` Tauri 이벤트 emit          |
| `exchange_google_token` | oauth.rs          | Google OAuth code → tokens 교환                                             |
| `refresh_google_token`  | oauth.rs          | Google access token 갱신                                                    |
| `show_floating`         | floating_macos.rs | 플로팅 창 표시 (macOS NSPanel: orderFrontRegardless + makeKeyAndOrderFront) |
| `hide_floating`         | floating_macos.rs | 플로팅 창 숨김 (`restore` 인자로 이전 앱 복원 여부 결정)                    |
| `set_global_shortcut`   | floating_macos.rs | 전역 단축키 동적 재등록                                                     |
| `search_places`         | places.rs         | NAVER API HUB 지역검색 (상호명 → 주소, CORS 우회 + 인증키 내장)             |

---

## tauri-store 키 목록

| 키                         | 내용                                                             |
| -------------------------- | ---------------------------------------------------------------- |
| `anthropic.apiKey`         | Claude API 키                                                    |
| `google.clientId`          | Google OAuth Client ID                                           |
| `google.clientSecret`      | Google OAuth Client Secret                                       |
| `google.tokens`            | Google 액세스/리프레시 토큰                                      |
| `server.session`           | Cali 서버 세션 `{ token, user }` (`store/account.ts`)            |
| `google.defaultCalendarId` | 기본 캘린더 ID (모달 기본 선택·자연어 추가 폴백, 없으면 primary) |
| `hotkey`                   | 플로팅 창 단축키 문자열                                          |
| `theme.accent`             | 저장된 테마 색상                                                 |
| `events.cache`             | 마지막으로 fetch한 이벤트 캐시                                   |

---

## 컴패니언 윈도우 (floating) — macOS NSPanel 구현 핵심 지식

> 수많은 시행착오 끝에 확립된 규칙들. 변경 시 반드시 이 섹션 숙지.

### ✅ 최종 작동 구조 (`show_floating`)

```
orderFrontRegardless       → 전체화면 포함 모든 Space에 창 표시
makeKeyAndOrderFront:nil   → 앱 활성화 + IMK 초기화 + key window 설정
```

### ❌ 절대 하면 안 되는 것

| 금지                                         | 이유                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `activateIgnoringOtherApps:YES`              | 같은 Space의 다른 앱(Calendar 등)을 강제로 앞으로 끌어내는 부작용 발생. `makeKeyAndOrderFront:`가 내부적으로 앱 활성화를 처리하므로 불필요 |
| `makeKeyWindow` 단독 사용                    | IMK(Input Method Kit)를 초기화하지 않아 키보드 입력 불가                                                                                   |
| `object_setClass(ns_win, NSPanel)` 단독 사용 | `canBecomeKeyWindow`가 NO를 반환 → `makeKeyAndOrderFront:`가 무시됨                                                                        |
| NSTextField를 `contentView`에 `addSubview:`  | `contentView` = WKWebView → 이벤트 모두 차단됨                                                                                             |

### NSPanel 서브클래스 (KeyablePanel)

`canBecomeKeyWindow`를 YES로 오버라이드해야 `makeKeyAndOrderFront:`가 실제로 동작한다.

```rust
extern "C" fn panel_can_become_key(_: *const c_void, _: *const c_void) -> bool { true }

// setup에서:
let kp_cls = objc_allocateClassPair(ns_panel_cls, b"KeyablePanel\0".as_ptr(), 0);
class_addMethod(kp_cls, sel_cbkw, panel_can_become_key as *const c_void, b"B@:\0".as_ptr());
objc_registerClassPair(kp_cls);
object_setClass(ns_win, kp_cls);  // NSPanel 대신 KeyablePanel 사용
```

### 텍스트 입력: HTML `<input>` 방식

NSTextField native overlay는 WKWebView가 이벤트를 가로채서 불가. HTML `<input>` + JS `focus()` + `window.addEventListener("focus", ...)` 조합을 사용한다.

### ESC 닫기 시 Space 전환 방지

창을 열 때 이전 frontmost 앱을 `retain`해서 `PREV_APP`에 저장, ESC 닫기 시 `activateWithOptions:0`으로 복원.

- `hide_floating(restore: true)` → ESC: 이전 앱 활성화 후 숨김
- `hide_floating(restore: false)` → 클릭아웃: 그냥 숨김 (이미 다른 앱이 포커스를 받았음)

### 포커스 타이밍

`Focused(true)` Tauri 이벤트 = 창이 실제 key window가 된 시점 → 이때 `eval("input.focus()")` 호출이 가장 신뢰할 수 있는 방법.

표시 직후(포커스 후 300ms 안) 직전 앱(Finder 등)이 key를 도로 가져가 `Focused(false)`가 온다(비활성화 패널이라 앱이 활성화되지 않음). 이때 입력란 포커스는 남아 있어도 창이 key가 아니라 타이핑이 안 된다 → `on_floating_unfocused`가 숨기지 않고 `makeKeyAndOrderFront:`를 **한 번만** 다시 부른다(`FLOATING_REKEYED`, 계속 부르면 그 앱과 key를 서로 뺏음).

---

## 코딩 컨벤션

- TypeScript strict 모드
- 컴포넌트: PascalCase, 파일명: kebab-case
- 스타일: CSS Modules (`ComponentName.module.css`), **Tailwind 금지**
- `isTauri()` 체크로 Tauri/브라우저 환경 분기
- `LazyStore` 생성자에 옵션 객체 전달하지 않음: `new LazyStore("app-store.json")`
- Google Calendar API는 브라우저 fetch로 직접 호출 (CORS 지원)
- Claude API / OAuth 토큰 교환은 Rust command 경유 (CORS 차단 + 보안)

---

## ⚠️ macOS 이전 시 필요한 작업

**이 프로젝트는 Windows에서 개발되었으며, macOS에서 최종 빌드 및 배포가 필요합니다.**

### 1단계: macOS 개발 환경 설정

```bash
# Xcode Command Line Tools (필수)
xcode-select --install

# Rust 설치
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Bun 설치
curl -fsSL https://bun.sh/install | bash
```

### 2단계: 프로젝트 준비

```bash
# 프로젝트 클론
git clone <repo-url> schedule-assistant-ai
cd schedule-assistant-ai

# 의존성 설치
bun install

# Rust 빌드 도구 확인
cargo --version
```

### 3단계: 아이콘 재생성 (중요)

현재 `src-tauri/icons/icon.icns`는 **빈 파일(placeholder)**입니다.
macOS 앱 빌드 전 반드시 실제 ICNS 파일로 교체해야 합니다.

```bash
# 1024x1024 PNG 소스 이미지 준비 후:
bunx tauri icon <path/to/icon-1024.png>
# → src-tauri/icons/ 아래 모든 아이콘 형식 자동 생성
```

### 4단계: 개발 서버 실행

```bash
# Tauri 개발 모드 (macOS 앱 창이 열림)
bun run dev:tauri
```

### 5단계: macOS 앱 빌드

```bash
bun run build:tauri
# → apps/app/src-tauri/target/release/bundle/macos/ 에 .app 생성
# → apps/app/src-tauri/target/release/bundle/dmg/ 에 .dmg 생성
```

### macOS 전용 주의사항

- **권한 설정**: `tauri.conf.json`의 `capabilities`에 macOS 알림 권한 동의 필요
- **공증(Notarization)**: App Store 외 배포 시 Apple 공증 필요 (`tauri.conf.json` → `bundle.macOS.signingIdentity`)
- **전역 단축키**: macOS에서 접근성 권한 요청 팝업이 뜰 수 있음 (시스템 설정 → 개인 정보 보호 → 손쉬운 사용)

---

## 릴리스 (자동화)

**main에 push하면 끝이다.** 버전 상승·빌드·릴리스가 전부 자동으로 진행된다
(`.github/workflows/release.yml`).

```bash
git push origin main    # → 버전 자동 상승 + dmg 빌드 + 릴리스 발행 (약 15분)
```

### 커밋 단위가 아니라 push 단위다

GitHub Actions는 push 이벤트마다 1회 실행된다. 커밋 5개를 모아 한 번에 push하면
워크플로도 1번 돌고 버전도 **한 칸만** 오른다. 상승 폭은 커밋 개수가 아니라
그 push에 포함된 커밋 중 가장 높은 등급의 타입으로 정해진다.

| push에 포함된 커밋                    | 상승 폭                | 예시          |
| ------------------------------------- | ---------------------- | ------------- |
| `feat:` 가 하나라도 있음              | minor                  | 0.2.0 → 0.3.0 |
| `fix:` / `design:` / `refactor:` 등만 | patch                  | 0.2.0 → 0.2.1 |
| `feat!:` 또는 `BREAKING CHANGE`       | minor (0.x 구간이므로) | 0.2.0 → 0.3.0 |

계산 로직은 `apps/app/scripts/next-version.sh`에 있고 로컬에서도 미리 확인할 수 있다.
앱 경로(`apps/app`·`packages/shared`)를 건드린 커밋만 센다 — 서버만 고친 `feat:`로 앱 minor가 오르지 않는다.

```bash
apps/app/scripts/next-version.sh          # 다음 버전이 무엇이 될지 출력
apps/app/scripts/next-version.sh minor    # 강제 지정했을 때의 값
```

### 릴리스가 나가지 않는 경우

- **앱과 상관없는 push** — `apps/app/**`·`packages/shared/**`가 바뀐 push만 릴리스한다(`paths`). 서버·문서·워크플로만 바뀐 push, 그리고 그 안에서도 `**.md`·`apps/app/scripts/**`만 바뀐 push는 무시된다
- **워크플로가 만든 버전 커밋** — `chore: 버전 x.y.z` 로 시작하는 커밋은 건너뛴다 (무한 루프 방지)
- **검증 실패** — typecheck / lint / test 중 하나라도 깨지면 빌드 전에 중단

연달아 push하면 이전 빌드는 취소되고(`cancel-in-progress`) 마지막 것만 릴리스된다.

### 버전을 직접 고르고 싶을 때

Actions → release → **Run workflow** → `bump`에서 `patch` / `minor` / `major` 선택.

### 워크플로 순서

1. main 최신 상태 checkout (전체 이력 — 마지막 태그 이후 커밋을 읽어야 함)
2. OAuth 시크릿 존재 확인
3. 다음 버전 계산
4. typecheck / lint / test
5. 버전을 파일 3곳에 반영 (앱에 표시되는 버전과 릴리스를 일치시키기 위해 **빌드 전**)
6. `tauri build --target universal-apple-darwin` (Intel + Apple Silicon 통합)
7. dmg를 **`Cali.dmg`로 리네임** + 버전이 박힌 사본 + `SHA256SUMS.txt`
8. **빌드 성공 후에야** `chore: 버전 x.y.z` 커밋 + 태그를 push
9. `gh release create --latest`

8번을 마지막에 두는 이유: 빌드가 실패했는데 태그만 남는 상황을 막기 위해서다.

### ⚠️ 에셋 이름을 `Cali.dmg`로 고정하는 이유

포트폴리오 사이트(`portfolio/src/data/portfolio.ts`)가 아래 URL을 직접 링크한다.

```
https://github.com/JinuYong/schedule-assistant-ai/releases/latest/download/Cali.dmg
```

`/releases/latest/download/`는 최신 릴리스를 자동으로 따라가므로 **포트폴리오 코드는 수정할 필요가 없다.**
단, 다음 조건이 깨지면 링크가 404가 된다.

- 에셋 파일명이 정확히 `Cali.dmg`가 아님 (tauri 기본 출력은 `Cali_0.2.0_universal.dmg`)
- 릴리스가 draft 또는 pre-release 상태 (latest로 잡히지 않음)

### 버전 파일은 워크플로가 단독으로 관리한다

`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` 세 곳의 버전을
**로컬에서 직접 올리지 않는다.** 로컬에서 `chore: 버전 …` 커밋을 만들어 push하면
재트리거 가드에 걸려 릴리스가 아예 나가지 않는다.
`scripts/bump-version.sh`는 파일만 고치고 커밋/태그는 하지 않으며, 워크플로가 호출한다.

### 필요한 리포지토리 시크릿

Settings → Secrets and variables → Actions

| 시크릿                                          | 필수 | 용도                                                                                   |
| ----------------------------------------------- | ---- | -------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`                  | ✅   | 워크플로가 `VITE_GOOGLE_CLIENT_ID`로 넘겨 번들에 주입 (시크릿 이름은 Next 시절 그대로) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_SECRET`              | ✅   | 〃                                                                                     |
| `NAVER_SEARCH_CLIENT_ID`                        | ✅   | 장소 검색 인증키 (Rust 바이너리에 주입)                                                |
| `NAVER_SEARCH_CLIENT_SECRET`                    | ✅   | 〃                                                                                     |
| `APPLE_CERTIFICATE`                             | ⬜   | Developer ID 인증서(.p12) base64                                                       |
| `APPLE_CERTIFICATE_PASSWORD`                    | ⬜   | 〃 비밀번호                                                                            |
| `APPLE_SIGNING_IDENTITY`                        | ⬜   | 예: `Developer ID Application: Name (TEAMID)`                                          |
| `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` | ⬜   | 공증(notarization)용                                                                   |

필수 시크릿이 하나라도 비면 워크플로가 빌드 전에 중단된다
(`src/lib/oauth.ts`가 빌드 타임 env를 정적 번들에 굽기 때문에, 비면 로그인 불가 앱이 배포됨.
`NAVER_SEARCH_*`도 마찬가지로 비면 장소 검색이 죽은 앱이 나가므로 `build.rs`가 빌드를 끊는다).
`APPLE_*`가 없으면 서명 단계를 건너뛰고 **서명 없는 dmg**가 나오며,
(Tauri 기본 ad-hoc 서명뿐, 공증 없음). Gatekeeper가 "악성 코드가 없음을 확인할 수 없습니다"로 막고
macOS 15부터는 우클릭 → 열기 우회도 없어졌다. 받은 사람은 한 번 열어 본 뒤 **시스템 설정 → 개인정보 보호 및 보안 →
"그래도 열기"**를 누르거나, 터미널에서 `xattr -dr com.apple.quarantine /Applications/Cali.app`을 실행해야 한다.
업데이트할 때마다 반복된다 — 없애려면 Apple Developer Program(연 $99)으로 `APPLE_*`를 채운다.

---

## 환경 변수

OAuth credentials는 `.env.local`에 설정하며 `bun run build` 시 정적 번들에 포함됩니다.
`.env.example`을 복사해서 `.env.local`을 만들고 실제 값을 입력하세요.

```env
# Google OAuth (GCP Console → 데스크톱 앱 타입)
VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx

# NAVER API HUB 지역검색 (ncloud.com → NAVER API HUB → 인증키)
# VITE_ 접두사가 없다 — JS 번들이 아니라 Rust 바이너리에 구워진다
NAVER_SEARCH_CLIENT_ID=xxxxxxxxxxxxxxxxxxxx
NAVER_SEARCH_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### NAVER 인증키를 Rust에 굽는 이유

장소 검색 키는 **사용자에게 입력받지 않는다.** 사용자에게 ncloud 가입과 API 신청을 시키는 건
"장소 자동완성" 하나에 비해 대가가 너무 커서, OAuth credentials와 같이 개발자 키 하나로 전체
사용자를 커버한다.

`src-tauri/build.rs`가 빌드 시점에 환경변수 또는 `.env.local`을 읽어
`cargo:rustc-env`으로 주입하고, `places.rs`가 `env!()`로 받는다.
`VITE_*`(JS 번들 평문)보다 노출이 덜하지만 **`strings`로 추출 가능한 건 마찬가지다.**
숨겨진 비밀이 아니라 "유출되면 호출량이 소진되는 값"으로 취급하고,
**ncloud 콘솔에서 호출량 임계치를 걸어 손실 상한을 고정해 둔다.**

**키가 비어 있으면 `build.rs`가 빌드를 실패시킨다.** 사용자가 키를 입력할 통로가 없으므로,
키 없이 빌드하면 장소 검색이 조용히 죽은 앱이 배포된다. 릴리스 워크플로도 빌드 전에
시크릿 존재를 먼저 확인한다.

---

## Agent skills

### Issue tracker

이슈와 스펙은 GitHub Issues(`JinuYong/schedule-assistant-ai`)에서 `gh` CLI로 관리한다. See `docs/agents/issue-tracker.md`.

### Triage labels

기본 라벨 5개를 그대로 쓴다(`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

single-context: 루트 `GLOSSARY.md` 하나와 `docs/adr/`. See `docs/agents/domain.md`.
