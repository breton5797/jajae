# 자재(Jajae) 운영 전환(Go-Live) 런북

> 목적: 목/폴백으로 동작하는 자재 웹앱을 **실 서비스**로 전환한다.
> 핵심: **코드 변경은 필요 없다.** 모든 외부 연동(`lib/env.ts`)은 키가 주입되면
> 자동으로 실제 모드로 전환된다. 이 문서는 **설정 + 키 주입 + 검증** 절차다.

상태 표기: ☐ 미완료 · 🔑 대표님(키 발급권자) 액션 필요 · 🛠 개발자 액션

---

## 0. 전제 — 어떤 키가 무엇을 켜는가

| 환경변수 | 미설정 시 동작 | 실 키 주입 시 | 코드 위치 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` / `SERVICE_ROLE_KEY` | 로컬 placeholder (운영 불가) | 클라우드 DB·Auth·RLS | `lib/supabase/*` |
| `ANTHROPIC_API_KEY` | 결정론적 BOM 폴백 + 견적서 브리프 폴백 | 실제 Claude 견적/검색/상담 브리프 추출 | `lib/ai-quote/anthropic.ts` · `lib/estimate/brief.ts` |
| `OPENAI_API_KEY` | STT 비활성(수동 전사 폴백) + AI 실사 미설정(원본 스냅샷 폴백) | Whisper STT + 제안서/스튜디오 AI 포토리얼(gpt-image-1) | `lib/stt/whisper.ts` · `lib/render/image-edit.ts` |
| `STUDIO_RENDER_*` (선택) | 미설정 시 `OPENAI_API_KEY` 사용 | AI 렌더 provider/키/모델/품질 오버라이드 | `lib/env.ts` · `lib/render/image-edit.ts` |
| `TOSS_SECRET_KEY` / `NEXT_PUBLIC_TOSS_CLIENT_KEY` | 목 결제(`mock:true`) | 실 결제/에스크로 | `lib/payments/toss.ts` |
| `POPBILL_LINK_ID` + `POPBILL_SECRET_KEY` | 목 세금계산서 | 실 전자세금계산서 | `lib/finance/popbill.ts` |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 지도 그레이스풀 폴백 | 카카오맵 | 클라이언트 |
| `PLATFORM_FEE_RATE` | `0.03` | 지정 수수료율 | `lib/env.ts` |

> `mock: true` 필드가 결제/세금계산서 응답에 남아 있으면 **아직 실 연동 전**이라는 신호다.

---

## 1. Supabase 클라우드 프로젝트 🔑🛠

- ☐ 🔑 [supabase.com](https://supabase.com)에서 프로젝트 생성 (리전: **Seoul `ap-northeast-2`** 권장 — Vercel `icn1`과 일치)
- ☐ 🔑 프로젝트 API 키 3종 확보: Project URL · `anon` key · `service_role` key
- ☐ 🛠 로컬에서 클라우드 프로젝트 연결 후 마이그레이션 push:

  ```bash
  supabase login
  supabase link --project-ref <PROJECT_REF>
  supabase migration list      # 원격 적용 상태 먼저 확인(운영 기준선: 0016까지 적용됨)
  supabase db push             # supabase/migrations/0001 → 0021 누적(미적용분만 적용)
  ```

  > 0017~0021은 전부 **additive**(material_catalog·proposals·yeongnim·design_scenes). 파괴적 DDL 없음.
  > 0018은 pgcrypto(공유 비밀번호 bcrypt)를 DO 블록으로 감싸 자동 생성한다.

- ☐ 🛠 **Storage 버킷/정책 적용** — `supabase db push`는 `migrations/`만 적용하므로 `supabase/storage.sql`은 **별도 1회 실행**(멱등 — 재실행 안전):
  - Supabase 대시보드 → SQL Editor에 `supabase/storage.sql` 내용 붙여넣기 실행, 또는
  - `psql "$DATABASE_URL" -f supabase/storage.sql`
  - 생성 버킷: `drawings`·`site-docs`(비공개) · `proposal-snapshots`(공개 — 제안서 3D 스냅샷 공유 링크용)
- ☐ 🛠 시드 데이터 정책 결정:
  - `supabase/seed.sql`은 **로컬 개발/테스트용 더미 데이터**다. 운영 DB에 그대로 넣지 말 것.
  - 단, 마이그레이션 0019/0020(영림 e카탈로그·샘플단가)은 **카탈로그 reference 데이터**라 db push로 함께 적용된다(시드 아님).
  - 운영은 실제 카탈로그/공급사 데이터로 별도 적재. (필요 시 시드에서 카테고리·관리자 계정만 발췌)
- ☐ 🛠 마이그레이션 적용 확인: Supabase 대시보드 → Database → 신규 테이블 존재 확인 — `material_brands`·`finish_materials`(0017), `proposals`(0018), `material_catalog_items`(0019), `design_scenes`(0021), 트리거(`enforce_agent_policy` 등)

---

## 2. 인증 — 카카오 OAuth 🔑🛠

실 로그인은 카카오 OAuth(Supabase Auth provider 경유)다. `app/auth/callback/route.ts`가 콜백을 처리한다.

- ☐ 🔑 [Kakao Developers](https://developers.kakao.com)에서 앱 생성 → REST API 키 + Client Secret 발급
- ☐ 🔑 카카오 앱 Redirect URI 등록: `https://<SUPABASE_URL>/auth/v1/callback`
- ☐ 🛠 Supabase 대시보드 → Authentication → Providers → **Kakao** 활성화 + 키 입력
- ☐ 🛠 Supabase → Authentication → URL Configuration → **Site URL** = `https://jajae.vercel.app` (+ 커스텀 도메인 시 Redirect URLs 추가)
- ☐ 🛠 최초 관리자 계정 승격: 카카오 로그인 1회 → `profiles.role`을 `admin`으로 수동 UPDATE (SQL editor)

> ⚠️ 운영에서는 `DEV_LOGIN`을 **절대 설정하지 말 것**. dev-login 라우트는 `NODE_ENV==='production'`에서 자동 404이지만, 이중 안전을 위해 prod env에 `DEV_LOGIN`/`DEV_ADMIN_*`를 두지 않는다.

---

## 3. 결제 — Toss Payments 🔑

- ☐ 🔑 Toss Payments 가맹 계약 + 사업자 심사 (실 결제는 심사 통과 필요)
- ☐ 🔑 `TOSS_SECRET_KEY`(서버) + `NEXT_PUBLIC_TOSS_CLIENT_KEY`(클라이언트) 확보
- ☐ 🛠 Vercel env 주입 후 **소액 실결제 → 취소** 1건으로 에스크로 흐름 검증 (응답 `mock:false` 확인)

## 4. 전자세금계산서 — Popbill 🔑

- ☐ 🔑 Popbill(링크허브) 계정 + 연동회원 등록
- ☐ 🔑 `POPBILL_LINK_ID` + `POPBILL_SECRET_KEY` 확보 (**둘 다** 있어야 실모드)
- ☐ 🛠 테스트 정산 1건으로 발행 확인 (`provider:"popbill"`, `mock:false`)

## 5. 기타 키 🔑

- ☐ 🔑 `ANTHROPIC_API_KEY` — AI 견적 품질 + 인테리어 견적서 상담 브리프 추출 (없으면 폴백으로도 동작하나 정밀도↓)
- ☐ 🔑 `OPENAI_API_KEY` — (1) 견적서(`/estimate`) 상담 음성 STT(Whisper, `whisper-1`). 미설정 시 수동 전사 폴백. (2) **제안서(`/proposal`)·스튜디오(`/studio`) AI 포토리얼 실사**(`gpt-image-1` img2img, `lib/render/image-edit.ts`). 미설정 시 원본 스냅샷 폴백. **비용 발생**, 고품질은 90~165초/장 → Vercel Pro(maxDuration 300s) 필요. `STUDIO_RENDER_QUALITY=medium`(기본)으로 단축 가능.
- ☐ 🔑 `STUDIO_RENDER_PROVIDER`/`STUDIO_RENDER_API_KEY`/`STUDIO_RENDER_MODEL`/`STUDIO_RENDER_QUALITY` (선택) — AI 렌더 오버라이드. 미설정 시 `OPENAI_API_KEY`+gpt-image-1+medium 사용.
- ☐ 🔑 `NEXT_PUBLIC_KAKAO_MAP_KEY` — 현장 지도

---

## 6. Vercel 배포 설정 🛠

`vercel.json`은 이미 구성됨(리전 `icn1`, main 자동 배포).

- ☐ 🛠 Vercel 프로젝트 → Settings → Environment Variables에 **Production** 스코프로 위 키 전부 주입
  - `NEXT_PUBLIC_*`는 클라이언트 노출됨(정상). `SUPABASE_SERVICE_ROLE_KEY`·`TOSS_SECRET_KEY`·`POPBILL_*`·`ANTHROPIC_API_KEY`는 **서버 전용 — 절대 `NEXT_PUBLIC_` 접두사 금지**
- ☐ 🛠 `DEV_LOGIN`/`DEV_ADMIN_*`는 **주입하지 않음**
- ☐ 🛠 (선택) 커스텀 도메인 연결 → 도메인 변경 시 §2의 Supabase Site URL·카카오 Redirect URI도 갱신
- ☐ 🛠 재배포 트리거 후 빌드 로그 확인

---

## 7. 출시 전 검증 게이트 🛠

```bash
npm run typecheck   # 0 errors
npm run lint        # 0 warnings/errors
npm test            # 83 files / 448 tests
npm run build       # exit 0
```

배포 후 운영 스모크(수동):

- ☐ 카카오 로그인 → 세션 유지(새로고침 후 유지) 확인
- ☐ 사업자 인증 흐름(`/login`) 동작
- ☐ 카탈로그 조회 → 장바구니 → 체크아웃 **실결제→취소** 1건 (`mock:false`)
- ☐ 정산 → 세금계산서 발행 1건 (`mock:false`)
- ☐ 관리자 콘솔(`/admin`) 접근이 admin 외 차단되는지(RLS/`requireAdmin`) 확인
- ☐ AI 견적(`/ai-quote`) 실제 응답 확인
- ☐ 비로그인 상태로 타 테넌트 데이터 접근 불가(테넌트 격리) 스팟 확인

---

## 8. 롤백 / 안전장치

- 결제·세금계산서는 **키만 제거하면 즉시 목 모드로 안전 폴백**된다(코드 변경 불필요).
- DB 마이그레이션은 additive·데이터 보존 설계. 단, `supabase db push`는 운영 DB를 변경하므로 push 전 **스테이징 프로젝트에서 1회 리허설** 권장.
- Vercel은 이전 배포로 즉시 롤백 가능(Deployments → Promote).

---

## 부록: 책임 분리 요약

| 트랙 | 🔑 대표님(키/계약) | 🛠 개발자(설정/검증) |
|---|---|---|
| Supabase | 프로젝트 생성·키 | link·db push·관리자 승격 |
| 카카오 OAuth | 앱·키·Redirect | Provider 설정·Site URL |
| Toss | 가맹 계약·키 | env 주입·실결제 스모크 |
| Popbill | 연동회원·키 | env 주입·발행 스모크 |
| Vercel | — | env 주입·도메인·배포 |
