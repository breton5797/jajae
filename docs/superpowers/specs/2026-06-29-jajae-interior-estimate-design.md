# 자재(Jajae) 인테리어 견적서 자동 생성 — 설계 스펙

> 작성일 2026-06-29 · 상태: **승인 대기(Draft)** · 승인 후 plan(태스크 분해) → team-orchestrator 실행

## 목표

시공사가 **소비자와의 상담 대화(음성)** 를 입력하면 → STT 전사 → 구조화된 견적 브리프 →
**스키매틱 평면도(2D) + 자재 선택(BOM) + 3D 미리보기**를 자동 생성해 고객에게 즉시 보여주고,
하나의 **인테리어 견적서**로 저장·공유한다.

## 결정사항 (대표님 승인 — 2026-06-29)

| 항목 | 결정 |
|---|---|
| STT | **오디오 업로드 + Whisper** (실시간 아님). 키 없으면 수동 전사 입력 폴백 |
| 평면도 | **스키매틱 자동배치** (치수 기반 직사각형, SVG). 개략 도면임을 명시 |
| 3D | **Three.js 벽 압출** + 자재 텍스처 (인터랙티브, 클라이언트) |
| 진행 | **스펙 승인 → plan → 오케스트레이션** (HARD-GATE 준수) |

## 비목표 (이번 범위 제외)

- 실시간 마이크 스트리밍 STT, 화자 분리 고도화
- 건축 도면 수준(실측·법규) 평면도, 사용자 드래그 2D 에디터
- AI 포토리얼 렌더(디퓨전) — 후속 Phase로 분리
- 모바일(Capacitor) 네이티브 녹음 — 웹 우선, 모바일은 원격 URL로 동작(후속 검증)

---

## 재사용 자산 (이미 존재)

`lib/ai-quote/`: `bomFromRooms`·`roomsToBomInput`·`totalArea`(룸→BOM), `matchBomToProducts`(BOM→카탈로그),
`generateBom`(AI+결정론 폴백), Claude **JSON 추출 + 폴백 패턴**(`drawing.ts`), zod 스키마,
`SpecLevel`/`ProjectType`/`RoomArea`/`RoomType`/`BomResult` 타입. → **자재 선택·BOM은 50%+ 기존 재사용**.

진짜 신규 리스크: **STT · 평면도 좌표 생성 · 3D**.

---

## 아키텍처

```
[오디오 업로드] → /api/estimate/transcribe → lib/stt (Whisper|수동)
      → transcript(text)
[transcript] → /api/estimate/brief → lib/estimate/brief (Claude|폴백)
      → EstimateBrief{projectType, specLevel, rooms[name,type,widthM,lengthM], budget?, materialPrefs?, notes?}
[brief(편집본)] → /api/estimate → 조립:
      lib/floorplan/layout (순수)  → FloorPlan{rooms[x,y,w,h], bounds}   ← 2D SVG 렌더
      lib/ai-quote (재사용)        → BomResult → matchBomToProducts → 자재+견적 총액
      persist → interior_estimates (RLS)
[FloorPlan + 자재] → components/estimate/floorplan-3d (Three.js, ssr:false) → 3D 미리보기
```

도메인 경계는 기존 규칙 준수: 순수 로직은 `lib/*`, IO는 API 라우트/`lib/data`, AI/외부는 키 없으면 폴백.

---

## 데이터 모델

### 신규 타입 (`lib/types.ts` 가산)

```ts
export interface EstimateRoom {
  name: string;
  type: RoomType;          // 기존 enum 재사용
  widthM: number;          // 평면도 배치용 (없으면 area에서 정사각 근사)
  lengthM: number;
}
export interface EstimateBrief {
  projectType: ProjectType;
  specLevel: SpecLevel;
  rooms: EstimateRoom[];
  budgetKRW?: number;
  materialPrefs?: string[];   // 자유 텍스트 선호("화이트 톤 타일")
  notes?: string;
}
export interface FloorPlanRoom { name: string; type: RoomType; x: number; y: number; w: number; h: number; }
export interface FloorPlan { rooms: FloorPlanRoom[]; widthM: number; lengthM: number; }
export interface InteriorEstimate {
  id: string;
  contractorId: string;
  customerName?: string;
  transcript: string;
  brief: EstimateBrief;
  floorPlan: FloorPlan;
  bom: BomResult;
  totalKRW: number;
  status: "draft" | "shared";
  createdAt: string;
}
```

### DB 마이그레이션 `supabase/migrations/0016_interior_estimate.sql` (ADDITIVE)

- `interior_estimates`: 위 필드(jsonb: brief/floor_plan/bom), `contractor_id uuid` FK.
- **RLS**: contractor 본인 행만 select/insert/update(`contractor_id = auth.uid()`), admin 전체, service_role 신뢰. 기존 0002/0012 패턴 따름.
- `shared` 상태 공유 링크는 후속(이번엔 상태 필드만).

---

## 모듈 & 인터페이스

| 모듈 | 함수 | 폴백 | 테스트 |
|---|---|---|---|
| `lib/stt/whisper.ts` | `transcribeAudio(b64, mime): Promise<string\|null>` | 키 없으면 null→수동 전사 | mock(키없음) |
| `lib/estimate/brief.ts` | `extractBrief(transcript): Promise<EstimateBrief>` | Claude 실패 시 결정론 키워드 추출 | 폴백 단위테스트 |
| `lib/estimate/schema.ts` | zod: `BriefSchema`,`TranscribeSchema`,`EstimateInputSchema` | — | 단위 |
| `lib/floorplan/layout.ts` | `layoutRooms(rooms): FloorPlan` **순수** | 결정론(AI 없음) | **단위(핵심)** |
| `lib/estimate/index.ts` | `buildEstimate(brief, catalog): {floorPlan,bom,totalKRW}` | 재사용 조합 | 단위 |
| `components/estimate/floorplan-2d.tsx` | SVG 렌더(서버) | — | jsdom |
| `components/estimate/floorplan-3d.tsx` | Three.js(클라이언트, `dynamic ssr:false`) | reduced-motion 정적 | build 게이트 |

**평면도 배치 알고리즘**(`layoutRooms`): 행(shelf) 패킹 — 방을 면적 내림차순 정렬 후 최대폭 기준 줄바꿈 배치, 좌표·전체 bounds 산출. 치수 없으면 `sqrt(areaM2)` 정사각 근사. 100% 순수·결정론 → 단위테스트 용이.

**3D**(`floorplan-3d`): `@react-three/fiber`+`drei`. 각 `FloorPlanRoom`을 바닥 평면 + 4벽(높이 기본 2.4m) 압출, 자재 카테고리→색/텍스처 매핑, OrbitControls. `next/dynamic`으로 `ssr:false`.

---

## API 라우트 (기존 컨벤션: json parse → zod safeParse → 도메인 호출 → 한국어 에러)

- `POST /api/estimate/transcribe` — `{audioBase64, mimeType}` → `{transcript, source:"whisper"|"manual"}`
- `POST /api/estimate/brief` — `{transcript}` → `EstimateBrief` (프론트에서 편집)
- `POST /api/estimate` — `{brief, customerName?}` → 조립 결과 + persist → `{id, floorPlan, bom, totalKRW}`
- `GET  /api/estimate/[id]` — 소유자/admin만 (RLS)

## 페이지 `/estimate` (4단계 위저드)

1. **상담 입력** — 오디오 업로드(또는 전사 직접 입력) → transcribe
2. **브리프 검토** — 추출된 룸/치수/자재선호/예산 편집(신뢰 경계: 사용자 확정)
3. **결과** — 2D 평면도 + 3D 미리보기 + 자재 리스트 + 견적 총액
4. **저장/공유** — `interior_estimates` 저장, 상태 표시

헤더 NAV/푸터에 `/estimate` 링크 추가(기존 site-header/footer 가산).

---

## 환경변수 (신규)

```
OPENAI_API_KEY=        # Whisper STT. 미설정 시 수동 전사 입력 폴백.
```

> go-live 관점: STT는 신규 외부 키(비용). `lib/env.ts`에 lazy getter 추가, `docs/go-live.md`·`.env.example` 갱신.

---

## 단계적 구현 (plan에서 태스크로 분해)

| Phase | 내용 | 검증 |
|---|---|---|
| A | 타입+스키마+`lib/stt`+`lib/estimate/brief`+transcribe/brief API | 단위(폴백)·typecheck |
| B | `lib/floorplan/layout`(순수)+`buildEstimate`+`/api/estimate`+2D SVG+자재 | **단위(레이아웃)**·db RLS |
| C | 3D Three.js 컴포넌트 + `/estimate` 위저드 조립 | build·수동 시각 |
| D | `0016` 마이그레이션+persist+GET+NAV/푸터 링크 | db 테스트·E2E |

---

## 테스트 전략 (기존 DoD 준수)

- **순수 로직**(`layoutRooms`, brief 결정론 폴백, 총액/VAT) → vitest 단위 (핵심 커버리지)
- **RLS** `interior_estimates` → PGlite db 테스트(소유자 격리·admin·service_role)
- **AI/STT** → 키 없는 폴백 경로로 오프라인 통과(기존 패턴)
- **컴포넌트** 2D SVG → jsdom / 3D → jsdom 부적합, `npm run build` 게이트 + 수동 시각
- 게이트: typecheck 0 / lint 0 / test 전부 / build exit 0

---

## 리스크 & 완화

| 리스크 | 완화 |
|---|---|
| 면적만 있고 치수 없으면 평면도 부정확 | 정사각 근사 + "개략 평면도" 라벨, 브리프 단계서 치수 편집 유도 |
| Three.js + jsdom 테스트 난이도 | 3D는 build 게이트 + 수동 검증, 로직은 순수 함수로 분리해 단위테스트 |
| Whisper 25MB/긴 상담 | 1차 파일 크기 제한+안내, 청킹은 후속 |
| 신규 OpenAI 키 비용/의존 | 키 없으면 수동 전사 폴백으로 기능 유지(목 경로) |
| 브리프 오추출(신뢰 경계) | LLM 결과는 항상 사용자 편집·확정 후 진행, zod 검증 |

---

## 수용 기준 (Definition of Done)

1. 오디오 업로드(또는 수동 전사) → 브리프 자동 추출·편집 가능
2. 브리프 확정 시 2D 평면도 + 3D 미리보기 + 자재 BOM + 견적 총액 생성
3. 견적이 `interior_estimates`에 저장되고 소유자/admin만 조회(RLS 증명)
4. 키(OpenAI/Anthropic) 미설정에도 폴백으로 빌드·테스트 통과
5. 4개 게이트 통과 + 기존 페이즈 회귀 없음

---

## 오케스트레이션 계획 (승인 후)

팀(Lead+3): **Backend**(lib/stt·estimate·floorplan, API, 0016 마이그레이션, types) ·
**Frontend**(/estimate 위저드, 2D/3D 컴포넌트) · **QA**(단위·RLS·컴포넌트·검증).
파일 소유권 분리: `lib/*`+`app/api/*`+migration+`types.ts`→Backend / `app/estimate`+`components/estimate`→Frontend / `tests/*`→QA.
의존성: A(타입/스키마) → B(레이아웃/조립) → C(3D/위저드) → D(persist/링크).
