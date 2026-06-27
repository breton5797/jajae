# 자재(jajae) Android/iOS 앱 — Capacitor 래핑 설계 스펙

- 작성일: 2026-06-28
- 상태: 승인됨 (접근방식·범위 사용자 승인)
- 브랜치: `feat/mobile-capacitor` (main 분기, 홈페이지 PR #4와 독립)

## 1. 목표 (결론 먼저)

기존 Next.js 풀스택 웹앱(SSR + `app/api/*` + middleware + Supabase SSR)을 **Capacitor 원격 URL 모드**로 래핑하여 Android/iOS 네이티브 셸 앱으로 만든다. 웹 자산을 100% 재사용하고, 네이티브 플러그인(앱/상태바/스플래시/카메라)을 추가한다.

### 핵심 제약
- 이 앱은 **정적 export 불가**(API 라우트·미들웨어·SSR 의존). 따라서 Capacitor는 `server.url`로 **호스팅된 웹앱을 로드**하는 원격 모드로 동작한다(네이티브 셸로 감싼 온라인 웹앱).

### 이번 세션 범위 (정직한 경계)
- ✅ Capacitor 설치·초기화, `capacitor.config.ts`, `mobile/www` 스플래시, `android/`·`ios/` 프로젝트 생성, `cap sync`, 기본 플러그인, npm 스크립트, 빌드 문서
- ⚠️ 제외: 서명된 스토어 바이너리(APK/IPA) — Android SDK·CocoaPods·개발자 계정/인증서 필요(이 환경 미설치). 프로젝트는 "툴체인 보유 시 빌드 가능" 상태까지.

## 2. 기술 구성

- 패키지: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios` + 플러그인 `@capacitor/app`, `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/camera`
- `capacitor.config.ts`:
  - `appId: "com.jajae.app"`, `appName: "자재"`, `webDir: "mobile/www"`
  - `server`: `process.env.CAP_SERVER_URL` 있으면 `{ url, cleartext: true }`, 없으면 번들 스플래시(`mobile/www`) 로드
  - `plugins.SplashScreen` 기본 구성
- `mobile/www/index.html`: 스플래시 + (server.url 미설정 시) 안내. webDir 빈 디렉터리 방지용.
- npm 스크립트: `cap:sync`, `cap:android`(open), `cap:ios`(open), `cap:doctor`
- `.gitignore`: 네이티브 빌드 산출물(`ios/App/Pods`, `ios/App/build`, `android/.gradle`, `android/app/build`, `android/build`, `*.xcworkspace/xcuserdata` 등) 제외. (Capacitor가 플랫폼별 .gitignore 일부 생성)

## 3. 파일 변경/생성

- 신규: `capacitor.config.ts`, `mobile/www/index.html`, `android/**`(생성), `ios/**`(생성), `docs/mobile/README.md`
- 수정: `package.json`(deps + scripts), 루트 `.gitignore`(필요 시)
- **웹 코드(app/components/lib) 변경 없음** — 회귀 위험 최소.

## 4. 검증
- `npx cap sync` 성공(android). iOS는 CocoaPods 미설치 시 pod 단계 경고 — 프로젝트 생성 자체는 확인.
- 웹앱 회귀 게이트: `npm run typecheck` / `lint` / `test` / `build` 영향 없음(전부 통과 유지).
- `docs/mobile/README.md`에 빌드/실행(시뮬레이터/기기, `CAP_SERVER_URL` 설정, dev 서버 IP) 문서화.

## 5. 오케스트레이션 (team-orchestrator, 2인 순차)

| 역할(subagent) | 소유 파일 | 의존 |
|---|---|---|
| Mobile Setup (general-purpose) | capacitor 설치·init·`capacitor.config.ts`·`mobile/www`·`cap add`·플러그인·`package.json` 스크립트·native 생성 | — |
| Docs & Verify (general-purpose) | `docs/mobile/README.md`·`cap sync` 검증·웹앱 회귀 스모크 | Setup 완료 후(blockedBy) |

- Lead(메인)는 조율·집계·git 커밋만. 팀원은 커밋하지 않음(공유 파일 경합 방지).

## 6. 수용 기준
- [ ] `capacitor.config.ts` + `mobile/www` + `android/` + `ios/` 생성
- [ ] 플러그인 설치 + `cap sync`(android) 성공
- [ ] npm 스크립트 + `docs/mobile/README.md`
- [ ] 웹앱 게이트 4종 무영향
- [ ] 미설치 툴체인(Android SDK/CocoaPods) 한계가 문서에 정직히 기록
