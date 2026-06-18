# schedule-assistant-ai

AI 기반 일정 비서 앱. **macOS 메인 타겟**, 전역 단축키로 플로팅 입력창을 열어 자연어로 일정을 등록하고
Google Calendar / Microsoft Todo와 연동한다.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 데스크톱 쉘 | **Tauri v2** (Rust 백엔드, 시스템 WebView) |
| 프론트엔드 | **Next.js 16** (App Router, `output: "export"` 정적 빌드) + TypeScript |
| 스타일링 | **CSS Modules** (`.module.css`) — Tailwind 사용 **절대 금지** |
| 상태 관리 | Zustand |
| AI | Claude API (Rust `reqwest` 경유, CORS 우회) |
| 캘린더 | Google Calendar REST API (직접 fetch) |
| 할일 | Microsoft Graph REST API (직접 fetch) |
| 로컬 저장소 | `tauri-plugin-store` (`LazyStore`) — DB 없음, Google Calendar가 source of truth |
| OAuth | `@fabianlars/tauri-plugin-oauth` (`start()` + `onUrl()` 패턴) |
| 알림 | `tauri-plugin-notification` + JS setTimeout |
| 단축키 | `tauri-plugin-global-shortcut` |
| 패키지 매니저 | **Bun** (npm/yarn/pnpm 사용 **절대 금지**) |

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
bun run dev              # Next.js 개발 서버만 (브라우저 UI 확인용)
bun run dev:tauri        # Tauri + Next.js 동시 실행 (메인 개발 방식)

# 빌드
bun run build            # Next.js 정적 빌드 → out/ 폴더
bun run build:tauri      # Tauri 앱 패키징 (macOS: .dmg, Windows: .exe)

# 코드 품질
bun run typecheck        # TypeScript 타입 체크 (tsc --noEmit)
bun run lint             # ESLint
```

> **Windows에서 `cargo` 사용 시**: PATH에 Rust toolchain 추가 필요
> ```bash
> export PATH="/c/Users/Administrator/.cargo/bin:$PATH"
> ```

---

## 프로젝트 구조

```
schedule-assistant-ai/
├── src-tauri/                   # Rust 백엔드 (edition 2024)
│   ├── src/
│   │   ├── main.rs              # 진입점
│   │   ├── lib.rs               # run() 빌더 (setup·invoke_handler·run-event)
│   │   ├── claude.rs            # call_claude / stream_chat
│   │   ├── oauth.rs             # Google/Microsoft 토큰 교환·갱신
│   │   ├── floating_macos.rs    # 플로팅 창 (NSPanel) + 전역 단축키
│   │   └── error.rs             # auth_error/oauth_error 문자열 헬퍼
│   ├── capabilities/
│   │   └── default.json         # 플러그인 권한 설정
│   ├── icons/                   # 앱 아이콘 (ICO, PNG, ICNS)
│   ├── Cargo.toml
│   └── tauri.conf.json          # Tauri 설정 (창 구성, frontendDist 등)
├── src/
│   ├── app/
│   │   ├── (main)/              # 메인 앱 UI
│   │   │   ├── schedule/        # Google Calendar 일정 (컨테이너 page.tsx)
│   │   │   │   ├── calendar-utils.ts  # 달력 그리드 계산 + 일정 폼 타입/상수 (schedule 로컬)
│   │   │   │   ├── hooks/       # use-today-info / use-side-panel-width / use-event-drag
│   │   │   │   └── components/  # calendar-grid, event-list, todo-groups, *-modal
│   │   │   ├── chat/            # Claude AI 채팅 + 브리핑
│   │   │   ├── todo/            # Microsoft Todo 할일 목록
│   │   │   └── settings/        # OAuth 연동, 테마, 단축키 설정
│   │   ├── floating/            # 플로팅 입력창 전용 라우트
│   │   ├── layout.tsx           # 루트 레이아웃 (Providers 포함)
│   │   └── globals.css          # CSS 변수 정의
│   ├── components/
│   │   ├── Sidebar/             # 사이드바 네비게이션
│   │   ├── ThemeApplier/        # CSS 변수 동적 설정 (테마)
│   │   ├── TauriInit/           # 전역 단축키 등록
│   │   ├── Providers/           # QueryClient + ThemeApplier + TauriInit
│   │   └── icons.tsx            # 공통 아이콘 컴포넌트 (평탄화)
│   ├── hooks/                   # 페이지 간 공유 훅
│   │   ├── use-todo-actions.ts  # MS Todo CRUD 핸들러 (토큰 resolver 주입)
│   │   └── use-oauth-connection.ts # OAuth 연결 상태/흐름
│   ├── lib/
│   │   ├── claude.ts            # Claude API (invoke "call_claude" / "stream_chat")
│   │   ├── google-calendar.ts   # Google Calendar REST API + buildEventFromParsed
│   │   ├── microsoft-todo.ts    # Microsoft Graph REST API (직접 fetch)
│   │   ├── todo-form.ts         # 할일 폼 상태/빌더 (TodoFormState·buildTodoTaskFromForm 등, 공유)
│   │   ├── event-match.ts       # 이벤트 자동완성·매칭 (matchEventsByText·parseDateHint·matchCalendar, 공유)
│   │   ├── dev-mock.ts          # 개발용 더미데이터 (NEXT_PUBLIC_MOCK=1)
│   │   ├── oauth.ts             # Google/Microsoft OAuth 흐름 (provider 팩토리)
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
│       ├── auth.ts              # Google/Microsoft 토큰 (Zustand, createTokenRefresh)
│       ├── events.ts            # 캘린더 이벤트 캐시 + 알림 스케줄
│       ├── todos.ts            # Microsoft Todo 할일 캐시 (Zustand)
│       ├── toast.ts            # 토스트 알림 상태 (Zustand)
│       └── theme.ts             # 테마 색상 (Zustand + localStorage)
├── next.config.ts               # output: "export", distDir: "out"
├── package.json
├── AGENTS.md                    # → CLAUDE.md 심볼릭 링크
└── CLAUDE.md
```

---

## 핵심 아키텍처

### 1. 정적 빌드 + Tauri WebView
- `output: "export"` → Next.js가 완전한 정적 HTML/CSS/JS를 `out/` 폴더에 생성
- Tauri가 `out/`을 WebView에 직접 서빙 (`frontendDist: "../out"`)
- **API Routes 사용 불가** — 모든 서버 로직은 Rust commands로 처리

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

### 5. OAuth 흐름 (Google / Microsoft)
```
start() → 로컬 OAuth 서버 시작 (포트 자동 할당)
onUrl(callback) → 콜백 URL 리스너 등록
open(authUrl) → 시스템 브라우저에서 OAuth 인증
  → localhost:{port}/?code=xxx 리다이렉트
  → invoke("exchange_google_token" | "exchange_microsoft_token")  # Rust에서 토큰 교환 (client_secret 보호)
  → useAuthStore.setGoogleTokens() / setMicrosoftTokens()
  → storeSet("google.tokens" | "microsoft.tokens")
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

| 커맨드 | 모듈 | 역할 |
|--------|------|------|
| `call_claude` | claude.rs | Claude API 비스트리밍 호출 (일정 파싱용) |
| `stream_chat` | claude.rs | Claude SSE 스트리밍 → `chat-chunk` / `chat-done` Tauri 이벤트 emit |
| `exchange_google_token` | oauth.rs | Google OAuth code → tokens 교환 |
| `refresh_google_token` | oauth.rs | Google access token 갱신 |
| `exchange_microsoft_token` | oauth.rs | Microsoft OAuth code → tokens 교환 |
| `refresh_microsoft_token` | oauth.rs | Microsoft access token 갱신 |
| `show_floating` | floating_macos.rs | 플로팅 창 표시 (macOS NSPanel: orderFrontRegardless + makeKeyAndOrderFront) |
| `hide_floating` | floating_macos.rs | 플로팅 창 숨김 (`restore` 인자로 이전 앱 복원 여부 결정) |
| `set_global_shortcut` | floating_macos.rs | 전역 단축키 동적 재등록 |

---

## tauri-store 키 목록

| 키 | 내용 |
|----|------|
| `anthropic.apiKey` | Claude API 키 |
| `google.clientId` | Google OAuth Client ID |
| `google.clientSecret` | Google OAuth Client Secret |
| `google.tokens` | Google 액세스/리프레시 토큰 |
| `microsoft.clientId` | Microsoft OAuth Client ID |
| `microsoft.clientSecret` | Microsoft OAuth Client Secret |
| `microsoft.tokens` | Microsoft 액세스/리프레시 토큰 |
| `hotkey` | 플로팅 창 단축키 문자열 |
| `theme.accent` | 저장된 테마 색상 |
| `events.cache` | 마지막으로 fetch한 이벤트 캐시 |

---

## 컴패니언 윈도우 (floating) — macOS NSPanel 구현 핵심 지식

> 수많은 시행착오 끝에 확립된 규칙들. 변경 시 반드시 이 섹션 숙지.

### ✅ 최종 작동 구조 (`show_floating`)

```
orderFrontRegardless       → 전체화면 포함 모든 Space에 창 표시
makeKeyAndOrderFront:nil   → 앱 활성화 + IMK 초기화 + key window 설정
```

### ❌ 절대 하면 안 되는 것

| 금지 | 이유 |
|------|------|
| `activateIgnoringOtherApps:YES` | 같은 Space의 다른 앱(Calendar 등)을 강제로 앞으로 끌어내는 부작용 발생. `makeKeyAndOrderFront:`가 내부적으로 앱 활성화를 처리하므로 불필요 |
| `makeKeyWindow` 단독 사용 | IMK(Input Method Kit)를 초기화하지 않아 키보드 입력 불가 |
| `object_setClass(ns_win, NSPanel)` 단독 사용 | `canBecomeKeyWindow`가 NO를 반환 → `makeKeyAndOrderFront:`가 무시됨 |
| NSTextField를 `contentView`에 `addSubview:` | `contentView` = WKWebView → 이벤트 모두 차단됨 |

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
# → src-tauri/target/release/bundle/macos/ 에 .app 생성
# → src-tauri/target/release/bundle/dmg/ 에 .dmg 생성
```

### macOS 전용 주의사항

- **권한 설정**: `tauri.conf.json`의 `capabilities`에 macOS 알림 권한 동의 필요
- **공증(Notarization)**: App Store 외 배포 시 Apple 공증 필요 (`tauri.conf.json` → `bundle.macOS.signingIdentity`)
- **전역 단축키**: macOS에서 접근성 권한 요청 팝업이 뜰 수 있음 (시스템 설정 → 개인 정보 보호 → 손쉬운 사용)

---

## 환경 변수

OAuth credentials는 `.env.local`에 설정하며 `bun run build` 시 정적 번들에 포함됩니다.
`.env.example`을 복사해서 `.env.local`을 만들고 실제 값을 입력하세요.

```env
# Google OAuth (GCP Console → 데스크톱 앱 타입)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx

# Microsoft OAuth (Azure Portal → 앱 등록)
NEXT_PUBLIC_MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
NEXT_PUBLIC_MICROSOFT_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Azure Portal 앱 등록 가이드 (Microsoft OAuth)

> Microsoft To-Do 연동을 위한 OAuth 앱 설정 방법.
> Azure Portal은 개인 Microsoft 계정으로도 접속 가능하며, Microsoft OAuth의 유일한 설정 창구입니다.

### 1단계: 앱 등록

1. [portal.azure.com](https://portal.azure.com) 접속 → Microsoft 계정 로그인
2. 상단 검색창에 **"앱 등록"** 검색 → 클릭
3. **"+ 새 등록"** 클릭
4. 양식 입력:
    - **이름**: `Schedule Assistant AI`
    - **지원되는 계정 유형**: **"모든 Microsoft Entra ID 테넌트의 계정 및 개인 Microsoft 계정(예: Skype, Xbox)"** 선택
    - **리디렉션 URI**: 비워두기
5. **"등록"** 클릭

### 2단계: Application ID 복사

등록 완료 후 개요 페이지에서:
- **애플리케이션(클라이언트) ID** 복사 → `.env.local`의 `NEXT_PUBLIC_MICROSOFT_CLIENT_ID`에 입력

### 3단계: 공용 클라이언트 허용

왼쪽 메뉴 → **"인증"** 클릭

1. **"+ 플랫폼 추가"** → **"모바일 및 데스크톱 애플리케이션"** 선택
2. 리디렉션 URI 목록에서 아무것도 선택 안 하고 **"구성"** 클릭
3. **고급 설정** → **"공용 클라이언트 흐름 허용"** → **"예"**
4. 상단 **"저장"** 클릭

### 4단계: API 권한 추가

왼쪽 메뉴 → **"API 권한"** → **"+ 권한 추가"** → **"Microsoft Graph"** → **"위임된 권한"**

아래 권한 검색 후 체크:

| 권한 | 용도 |
|------|------|
| `Tasks.ReadWrite` | To-Do 읽기/쓰기 |
| `User.Read` | 사용자 정보 조회 |
| `offline_access` | 토큰 자동 갱신 |

**"권한 추가"** 클릭

### 5단계: 클라이언트 암호 생성

왼쪽 메뉴 → **"인증서 및 암호"** → **"클라이언트 암호"** 탭 → **"+ 새 클라이언트 암호"**

1. **설명**: `schedule-assistant-ai`
2. **만료**: 24개월 권장
3. **"추가"** 클릭

> ⚠️ 생성 직후에만 **"값"** 열에서 확인 가능. 페이지를 벗어나면 다시 볼 수 없으니 즉시 복사.

복사한 **값** → `.env.local`의 `NEXT_PUBLIC_MICROSOFT_CLIENT_SECRET`에 입력

### 6단계: 빌드

```bash
bun run build:tauri
```