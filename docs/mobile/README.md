# 자재 모바일 앱 빌드 가이드

## 개요

자재 모바일 앱은 **Capacitor 8 원격 URL 모드**를 사용해 기존 Next.js 풀스택 웹앱을 iOS·Android 네이티브 셸로 래핑한다.

### 핵심 동작 원리

- 앱은 별도의 정적 번들 없이, **호스팅된 자재 웹앱 URL**을 네이티브 WebView에 로드한다.
- SSR·API·미들웨어를 그대로 사용하므로 **인터넷 연결이 반드시 필요**하다.
- `CAP_SERVER_URL` 환경변수가 설정되어 있으면 해당 URL을 로드하고, 미설정 시 `mobile/www/index.html` 스플래시 화면을 표시한다.

---

## 사전 요구사항

| 항목 | iOS | Android |
|---|---|---|
| Node.js | 18+ | 18+ |
| Xcode | 15+ (App Store에서 설치) | 불필요 |
| iOS Simulator / 실기기 | 필요 | 불필요 |
| CocoaPods | **불필요** (Capacitor 8은 SPM 사용) | 불필요 |
| Android Studio | 불필요 | 필요 |
| Android SDK (`ANDROID_HOME`) | 불필요 | **필요** |

> **현재 개발 머신 상태**: Android SDK 미설치(`ANDROID_HOME` 미설정), CocoaPods 미설치. Xcode CLT만 설치된 상태.
> iOS 빌드는 가능하나, Android 빌드는 Android Studio + Android SDK 설치 후 진행해야 한다.

> **Capacitor 8 iOS**: CocoaPods 대신 **Swift Package Manager(Package.swift)**를 사용한다. `pod install`은 필요 없다.

---

## 환경변수 설정

### `CAP_SERVER_URL`

Capacitor가 WebView에서 로드할 자재 웹앱의 URL을 지정한다.

```bash
# 프로덕션 환경
CAP_SERVER_URL=https://jajae.example.com

# 로컬 개발 (같은 네트워크의 개발 PC LAN IP 사용)
CAP_SERVER_URL=http://192.168.1.100:3000
```

> **주의**: 실기기에서 로컬 테스트 시 `localhost` 대신 **개발 PC의 LAN IP**를 사용해야 한다.
> (`ifconfig | grep "inet "` 또는 시스템 환경설정 → 네트워크에서 확인)

### 로컬 개발 테스트 절차

1. 개발 PC에서 웹 서버 실행:

   ```bash
   npm run dev  # 기본 포트 3000
   ```

2. 개발 PC의 LAN IP 확인:

   ```bash
   # macOS
   ipconfig getifaddr en0
   ```

3. `CAP_SERVER_URL` 설정 후 sync:

   ```bash
   CAP_SERVER_URL=http://<개발PC_LAN_IP>:3000 npm run cap:sync
   ```

4. 이후 기기/시뮬레이터에서 앱 실행 (아래 명령어 참조).

---

## 명령어 레퍼런스

### 의존성 설치

```bash
npm install
```

### Capacitor 동기화

네이티브 프로젝트에 플러그인·설정 변경사항을 반영한다. **코드 변경 후 항상 실행**해야 한다.

```bash
npm run cap:sync
# 내부적으로: cap sync
```

### 상태 점검

```bash
npm run cap:doctor
# 내부적으로: cap doctor
```

iOS·Android 환경 요구사항, 플러그인 설치 현황 등을 점검한다.

### iOS (Xcode 열기)

```bash
npm run cap:ios
# 내부적으로: cap open ios
```

Xcode가 열리면:
1. 시뮬레이터 또는 연결된 실기기 선택
2. ▶ Run 버튼 클릭

### Android (Android Studio 열기)

```bash
npm run cap:android
# 내부적으로: cap open android
```

Android Studio가 열리면:
1. Gradle sync 완료 대기
2. 에뮬레이터 또는 연결된 실기기 선택
3. ▶ Run 버튼 클릭

> **Android SDK 미설치 시**: `ANDROID_HOME` 환경변수가 설정되지 않으면 `cap open android`가 실패하거나 Android Studio가 SDK를 찾지 못한다.
> Android Studio를 설치하고, SDK Manager에서 Android SDK를 설치한 뒤 `ANDROID_HOME`을 설정해야 한다.

---

## 릴리스 빌드

> **사전 조건**: Apple Developer Program 계정(iOS), Google Play Console 계정(Android) 및 서명 인증서가 필요하다.
> 서명 인증서 발급·관리는 이 저장소의 범위 밖이다.

### Android (서명된 APK / AAB)

1. Android Studio에서 프로젝트 오픈
2. **Build → Generate Signed Bundle / APK** 선택
3. 키스토어 파일 및 서명 정보 입력
4. Release 빌드 타입 선택 후 빌드

### iOS (Archive 배포)

1. Xcode에서 프로젝트 오픈
2. **Product → Archive** 선택
3. Organizer에서 **Distribute App** 선택
4. App Store Connect 또는 Ad Hoc 배포 방식 선택
5. 서명 인증서(Distribution Certificate) 및 프로비저닝 프로파일 적용 후 업로드

---

## 플러그인 목록

| 플러그인 | 버전 | 용도 |
|---|---|---|
| `@capacitor/app` | v8 | 앱 생명주기 이벤트 처리 (백그라운드, 포그라운드 전환) |
| `@capacitor/status-bar` | v8 | iOS·Android 상태 바 색상·스타일 제어 |
| `@capacitor/splash-screen` | v8 | 앱 시작 시 스플래시 화면 표시 (1200ms, 배경색 `#1A56DB`) |
| `@capacitor/camera` | v8 | 카메라 접근 (도면·자재 사진 촬영, 갤러리 선택) |

---

## 트러블슈팅

### Android SDK 미설치 오류

```
ANDROID_HOME is not set
```

**해결**: [Android Studio 설치](https://developer.android.com/studio) → SDK Manager에서 원하는 API Level SDK 설치 → `~/.zshrc` 또는 `~/.bash_profile`에 추가:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$ANDROID_HOME/platform-tools
```

### HTTP cleartext 경고 (로컬 개발)

`capacitor.config.ts`에서 `CAP_SERVER_URL`이 `http://`로 시작할 때 자동으로 `cleartext: true`가 활성화된다.

> **주의**: cleartext(비암호화 HTTP)는 **로컬 개발 전용**이다. 프로덕션 `CAP_SERVER_URL`은 반드시 `https://`를 사용해야 한다.

### 실기기에서 로컬 서버에 연결 안 됨

- `localhost`가 아닌 **LAN IP**로 `CAP_SERVER_URL`을 설정했는지 확인
- 개발 PC 방화벽에서 포트 3000이 열려 있는지 확인
- 기기와 개발 PC가 **같은 Wi-Fi 네트워크**에 연결되어 있는지 확인

### iOS SPM 의존성 해결 실패

Xcode에서 SPM 패키지를 찾지 못할 경우:

```bash
npm run cap:sync  # 재동기화
```

이후 Xcode에서 **File → Packages → Reset Package Caches** 실행.
