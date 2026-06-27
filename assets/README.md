# 앱 아이콘 · 스플래시 소스

`@capacitor/assets`가 이 폴더의 소스 이미지로 네이티브 아이콘/스플래시를 생성합니다.

| 파일 | 크기 | 용도 |
|---|---|---|
| `icon.png` | 1024×1024 | 앱 아이콘 (현재: 브랜드 블루 `#1A56DB` + "자" **플레이스홀더**) |
| `splash.png` | 2732×2732 | 스플래시 (라이트) |
| `splash-dark.png` | 2732×2732 | 스플래시 (다크) |

## 교체 방법

실제 아트워크로 위 3개 파일을 교체한 뒤:

```bash
npm run cap:assets   # android/ios 네이티브 리소스 재생성
npx cap sync
```

플레이스홀더를 다시 만들려면: `node scripts/gen-mobile-assets.mjs`
