# 자재(Jajae) 즉석 인테리어 제안 생성기 — 설계 스펙

> 작성일 2026-06-29 · 상태: **승인 대기(Draft)** · 승인 후 writing-plans(태스크 분해) → team-orchestrator 실행
> 전제: 견적 엔진(0016)·스튜디오 3D 엔진(A~D)을 **소비자 대면 "즉석 제안" 프레젠테이션 레이어**로 합성.

## 목표

시공사가 **소비자와의 상담 결과(음성 STT 또는 요약 텍스트)** 를 입력하면 →
(1) 레퍼런스 이미지 #2와 같은 **라벨링된 2D 평면도 시트**와
(2) 레퍼런스 이미지 #1과 같은 **3D 렌더 + 자재 디테일 + 예산 제안서 시트**를
**즉석에서** 생성해 소비자에게 보여주고(태블릿 풀스크린), PNG/PDF로 내보내거나 공유 링크로 전달한다.

핵심: 기존 견적 엔진이 이미 만드는 데이터(브리프·평면도·BOM·총액) 위에 **프레젠테이션 레이어**를 얹는다. 엔진 재작성이 아니라 **출력 고도화**.

## 결정사항 (대표님 승인 — 2026-06-29, 본 세션)

| 항목 | 결정 |
|---|---|
| 3D 제안 렌더(이미지 #1) | **three.js 실시간 렌더** (스튜디오 엔진/에셋 재사용 → 스냅샷). 실제 평면도에 정확, 즉석/무비용/결정론. AI 포토리얼은 제외(후속) |
| 2D 평면도(이미지 #2) | **템플릿 라이브러리** — 평형 + 방/욕실 수로 표준 한국 아파트 평면도 매칭 → 라벨/치수 자동 주석 |
| 자재 디테일 패널 | **큐레이트 마감재 카탈로그**(신규) — 카테고리 × 티어 × 브랜드 × 스왓치. 예산이 티어를 결정 |
| 전달 방식 | **화면 프레젠테이션 + PNG/PDF + 공유 링크** (3종 모두) |
| 스튜디오 관계 | **병존** — `/studio` 에디터 유지, `/proposal`은 신규 소비자 플로우로 내부 재사용 |
| 진행 | 스펙 승인 → writing-plans → 오케스트레이션 (HARD-GATE 준수) |

## 비목표 (이번 범위 제외)

- AI 포토리얼(디퓨전) 렌더 — three.js 렌더 채택. 후속 "원탭 뷰티파이"로 분리 가능(스튜디오 `ai-render` 기반).
- 절차적 임의 평면도 생성 — 템플릿 라이브러리 채택. 템플릿 미스 시 최근접 + 라벨 재배치까지만.
- 사용자 드래그 2D/3D 에디터(그건 `/studio`가 담당) — `/proposal`은 생성·프레젠테이션 전용.
- 실시간 마이크 스트리밍 STT, 화자 분리 — 오디오 업로드/텍스트 입력(기존).
- 실측·법규 수준 도면, 공급가 정산/발주 연동.

---

## 재사용 자산 (이미 존재 — 검증 완료)

| 자산 | 위치 | 재사용 |
|---|---|---|
| Whisper STT | `lib/stt/whisper.ts`, `/api/estimate/transcribe` | 그대로 |
| 브리프 추출(Claude+폴백) | `lib/estimate/brief.ts` | 그대로 (평형/방/욕실/예산/specLevel/선호) |
| BOM + 제품 매칭 | `lib/ai-quote/*`, `match.ts` | 공정/시공 BOM·총액 산출에 재사용 |
| 3D 엔진/에셋/스냅샷 | `lib/studio/{scene,assets,presets}`, `export/snapshot.ts` | 가구 배치 씬 + PNG 스냅샷 |
| 견적 저장/RLS | `interior_estimates` (0016) | 제안의 기반 견적으로 참조 |
| 타입 | `lib/types.ts` (`EstimateBrief`,`FloorPlan`,`BomResult`,`DesignScene`,`StudioAsset`…) | 가산 |

**신규 리스크(실제 새 코드):** 마감재 카탈로그(데이터) · 평면도 템플릿(데이터+매칭) · FloorPlan→가구 배치 3D 변환 · 제안서 합성 UI · 공유 링크.

---

## 아키텍처

```
[음성 업로드 → Whisper | 또는 요약 텍스트 직접 입력]
   → /api/estimate/transcribe (재사용)            → transcript
[transcript] → /api/estimate/brief (재사용)        → EstimateBrief{평형,방/욕실,budget,specLevel,...}
   (브리프 단계 = 신뢰 경계: 사용자 확정·편집)
[brief] → /api/proposal (신규 오케스트레이션):
   ├ lib/proposal/templates  matchTemplate(brief)         → ApartmentTemplate (방 슬롯·가구·치수)
   ├ lib/proposal/floorplan-svg  renderPlanSvg(template)  → 라벨링 2D SVG (이미지 #2)
   ├ lib/proposal/materials  selectFinishes(brief,catalog)→ FinishSelection[카테고리별 브랜드/티어/가격]
   ├ lib/ai-quote (재사용)    BOM·총액                     → 공정 견적 합계
   ├ lib/studio/from-floorplan  toFurnishedScene(template,finishes) → DesignScene
   │     → components/proposal 3D 캔버스 → export/snapshot  → 3D 렌더 PNG (이미지 #1 hero)
   └ persist → proposals (0018, RLS) + estimate(0016) 참조
[결과] → app/proposal 프레젠테이션 뷰
   → 화면(풀스크린) · PNG/PDF(인쇄 최적화) · 공유 링크(/p/[token], 공개 RPC)
```

도메인 경계(기존 규칙): 순수 로직 `lib/*`, IO는 API 라우트/`lib/data`, AI/외부 키 없으면 폴백.

---

## 데이터 모델

### 신규 타입 (`lib/types.ts` 가산)

```ts
export type FinishTier = "economy" | "standard" | "premium"; // SpecLevel과 동치 매핑

export type FinishCategory =
  | "flooring" | "window" | "door" | "wardrobe" | "sink"
  | "wall" | "bath_tile" | "balcony_tile" | "lighting" | "molding";

export interface FinishMaterial {
  id: string;
  category: FinishCategory;
  tier: FinishTier;
  label: string;        // "강화마루 오크색"
  brand: string;        // "노바마루" · "LG하우시스" · "영림도어" · "한샘" · "보루네오"
  unitPrice: number;    // 대표가(원) — 후속 실공급가 교체
  swatchUrl: string;    // /swatches/flooring-oak.jpg (정적 에셋)
  spec?: string;        // "300×600 포세린 (그레이톤)"
}

export interface FinishSelection {
  category: FinishCategory;
  material: FinishMaterial;       // 예산/티어로 선택된 1개
  downgraded: boolean;            // 예산 부족으로 티어 강등됐는지
}

export interface RoomSlot { name: string; type: RoomType; x: number; y: number; w: number; h: number; }
export interface ApartmentTemplate {
  id: string;                     // "apt-25py-3room-2bath"
  pyeong: number;                 // 평형(공급면적 기준)
  exclusiveM2: number;            // 전용면적
  supplyM2: number;               // 공급면적
  bedrooms: number; bathrooms: number;
  rooms: RoomSlot[];              // 배치된 방 + 발코니
  furniture: { assetId: string; roomName: string; transform: Transform3D }[]; // 가구 배치(3D/2D 공용)
}

export interface Proposal {
  id: string;
  estimateId: string;             // interior_estimates FK
  contractorId: string;
  customerName?: string;
  templateId: string;
  finishes: FinishSelection[];
  snapshotUrl?: string;           // 3D 렌더 PNG(스토리지) 또는 dataURL 캐시
  totalKRW: number;
  status: "draft" | "shared";
  shareToken?: string;            // 공개 링크용
  createdAt: string;
}
```

### DB 마이그레이션 (ADDITIVE, 다음 가용 번호)

**`0017_finish_materials.sql`** — 큐레이트 마감재 카탈로그 + 시드
- `finish_materials(id, category text check(...), tier text check(...), label, brand, unit_price numeric, swatch_url, spec, sort int, created_at)`
- 시드: 10개 카테고리 × 3티어 ≈ 30~40행(노바마루/동화자연마루, LG하우시스/KCC, 영림도어/예림도어, 한샘/리바트, 보루네오/에넥스 등 대표 브랜드·대표가).
- **RLS**: 카탈로그는 인증 사용자 read-only(`authenticated select`), 쓰기는 admin/service만. anon revoke.

**`0018_proposals.sql`** — 제안 산출물
- `proposals(id, estimate_id uuid → interior_estimates(id), contractor_id uuid → profiles(id), customer_name, template_id text, finishes jsonb, snapshot_url text, total_krw bigint, status text check('draft','shared'), share_token text unique, created_at)`
- **RLS**: contractor 본인/admin select·insert·update(`contractor_id = auth.uid()`), service_role 신뢰, anon revoke. (0016 패턴 동일)
- 공개 공유: `get_shared_proposal(token text)` **SECURITY DEFINER** RPC — `status='shared'`인 행만 안전 컬럼 반환(RLS를 넓히지 않음).

> 스튜디오 영속(design_scenes)은 본 제안 플로우에 불필요(씬은 인메모리 생성→스냅샷). 충돌 없음.

---

## 모듈 & 인터페이스

### 순수 로직 (`lib/proposal/`)
| 파일 | 함수 | 폴백 | 테스트 |
|---|---|---|---|
| `templates/index.ts` | `matchTemplate(brief): ApartmentTemplate` — 평형+방/욕실 최근접 매칭 | 미스 시 최근접 평형 + 라벨 재배치 | **단위(핵심)** |
| `templates/data.ts` | `APARTMENT_TEMPLATES[]` — 18평/25평/33평… 표준 평면(방 슬롯+가구) | 데이터 | 단위(무결성) |
| `floorplan-svg.ts` | `renderPlanSvg(template): string` — 라벨/가구/발코니/면적주석 SVG | 순수 | 단위(스냅샷) |
| `materials.ts` | `selectFinishes(brief, catalog): FinishSelection[]` — 예산/specLevel→카테고리별 티어, 부족 시 강등 | 결정론 | **단위(핵심)** |
| `index.ts` | `buildProposal(brief, catalog): {template,finishes,scene,bom,totalKRW}` | 재사용 조합 | 단위 |

**티어 선택(`selectFinishes`)**: specLevel→기본 티어(economy/standard/premium) 매핑 후, Σ(카테고리 대표가 × 수량근사) ≤ budget 검증. 초과 시 우선순위(저영향 카테고리부터) 티어 강등 + `downgraded=true` 플래그. 100% 순수·결정론.
수량근사는 템플릿 면적 기반(예: flooring=바닥면적, door/wardrobe=침실 수, bath_tile=욕실 수×벽면적). 카테고리별 규칙은 plan에서 상세화.

**총액(`totalKRW`) 구성**: `Σ 선택 마감재 가격(finish catalog)` **＋** `공정/시공 BOM(lib/ai-quote 재사용)`. 패널에는 자재 합계·공정 합계·총액을 분리 표기(투명성). 마감재 카테고리는 BOM과 중복 계상하지 않도록 BOM에서 해당 마감 항목은 제외(매핑 테이블로 분리).

### 3D 브리지 (`lib/studio/from-floorplan.ts` — 신규, 스튜디오 영역)
- `toFurnishedScene(template, finishes): DesignScene` — 방 슬롯 → 바닥+벽 SceneObject, `template.furniture` → 에셋 배치, `finishes`(마루/벽/도어색) → 머티리얼 틴트. 기존 `lib/studio/assets.ts` 에셋 재사용. **순수** → 단위테스트.
- 렌더: `components/proposal` 캔버스에서 `DesignScene` 렌더 → `lib/studio/export/snapshot.ts`(기존)로 PNG.

### UI (`components/proposal/`, 클라이언트)
| 컴포넌트 | 역할 |
|---|---|
| `floorplan-sheet.tsx` | 이미지 #2 — SVG 평면도 + 제목/면적 주석 |
| `material-panel.tsx` | 이미지 #1 우측 — 자재 디테일(스왓치+브랜드) + 추가 사양 + 예산 요약 |
| `proposal-sheet.tsx` | 이미지 #1 합성 — 3D 캔버스(hero) + `material-panel` + 하단 특징 4컷 |
| `presentation-view.tsx` | 풀스크린 프레젠테이션(평면도 ↔ 제안서 토글, 태블릿 친화) |

3D 캔버스는 `next/dynamic ssr:false`. 인쇄 최적화 CSS(@media print) → 브라우저 PDF.

---

## API 라우트 (기존 컨벤션: json → zod safeParse → 도메인 → 한국어 에러)

- `POST /api/estimate/transcribe` — (재사용) 오디오→transcript
- `POST /api/estimate/brief` — (재사용) transcript→EstimateBrief
- `POST /api/proposal` — `{brief, customerName?}` → `buildProposal` 조립 + estimate·proposal persist → `{proposalId, template, finishes, floorPlanSvg, totalKRW, sceneSnapshot}`
- `GET  /api/proposal/[id]` — 소유자/admin (RLS)
- `POST /api/proposal/[id]/share` — `status='shared'` + `share_token` 발급
- `GET  /p/[token]` (페이지) — 공개 RPC `get_shared_proposal`로 읽기 전용 제안 표시

## 페이지 `/proposal` (즉석 제안 플로우)

1. **상담 입력** — 오디오 업로드 또는 요약 텍스트 직접 입력 → transcript
2. **브리프 확인** — 평형/방/욕실/예산/specLevel 편집(신뢰 경계)
3. **즉석 제안** — `presentation-view`: ① 평면도 시트(이미지 #2) ② 제안서 시트(이미지 #1) 토글
4. **내보내기/공유** — PNG/PDF(인쇄), 공유 링크 발급, `proposals` 저장

헤더 NAV/푸터에 `/proposal` 링크 가산. 견적 결과 화면에 "제안서로 보기" 버튼(선택).

---

## 정적 에셋 (신규)

- `public/swatches/*.jpg` — 마감재 스왓치 썸네일(카테고리×티어). 1차 대표 이미지(저작권 무관 자체/플레이스홀더), 후속 실제품 교체.
- 가구 아이콘(2D 평면도용)은 SVG 인라인 또는 기존 스튜디오 프리미티브 투영.

## 환경변수

신규 없음. 기존 `OPENAI_API_KEY`(STT), `ANTHROPIC_API_KEY`(브리프) — 미설정 시 각각 수동 입력/결정론 폴백.

---

## 단계적 구현 (writing-plans에서 태스크화)

| Phase | 내용 | 검증 |
|---|---|---|
| A | 타입 가산 + `0017_finish_materials`(테이블+시드+RLS) + `lib/proposal/materials.ts`(티어 선택) | **단위(티어/강등)**·db RLS·typecheck |
| B | `lib/proposal/templates/`(데이터+매칭) + `floorplan-svg.ts`(이미지 #2) | **단위(매칭·SVG)** |
| C | `lib/studio/from-floorplan.ts`(가구 배치 씬) + 스냅샷 재사용 + `lib/proposal/index.ts` | 단위(변환)·build |
| D | `components/proposal/*`(material-panel·proposal-sheet·floorplan-sheet·presentation-view) + `/proposal` 페이지 | build·수동 시각 |
| E | `/api/proposal`·`[id]`·share + `0018_proposals`(+RPC) + `/p/[token]` + PNG/PDF | db RLS·E2E |
| F | NAV/푸터·견적 연동 버튼 + 스왓치 에셋 + 4게이트 회귀 | 전체 게이트 |

---

## 테스트 전략 (기존 DoD 준수)

- **순수 로직**(`matchTemplate`, `selectFinishes`+강등, `renderPlanSvg` 스냅샷, `toFurnishedScene`) → vitest 단위(핵심 커버리지).
- **RLS** `finish_materials`(read-only)·`proposals`(소유자 격리)·`get_shared_proposal` RPC(shared만 노출) → PGlite db 테스트.
- **카탈로그 시드 무결성**(10 카테고리×3 티어 누락 없음) → 단위.
- **3D/캔버스/PDF** → jsdom 부적합 → `npm run build` 게이트 + 수동 시각.
- 게이트: typecheck 0 / lint 0 / test 전부 / build exit 0. 기존 페이즈 회귀 0.

---

## 리스크 & 완화

| 리스크 | 완화 |
|---|---|
| 고객 평형/방수가 템플릿에 없음 | 최근접 매칭 + 라벨/치수 재주석, "개략 배치" 라벨 |
| 예산 < 최저 티어 합 | 카테고리별 순차 강등 + 패널에 강등 표시(투명성) |
| 마감재 대표가 ≠ 실공급가 | "대표가" 라벨, 후속 실공급가 연동(products 매칭) 경로 열어둠 |
| 스왓치 이미지 품질/저작권 | 1차 자체/플레이스홀더 스왓치, 실제품은 운영 단계 교체 |
| three.js + jsdom 테스트 난이도 | 변환은 순수 함수 단위, 렌더는 build+수동 게이트 |
| 공유 링크 노출 | SECURITY DEFINER RPC로 `shared`·안전 컬럼만, 토큰 추측 방지(랜덤 토큰) |
| 신규 외부 키 의존 | STT/브리프 키 없으면 수동 입력/결정론 폴백으로 기능 유지 |

---

## 수용 기준 (Definition of Done)

1. 음성(또는 요약 텍스트) 입력 → 브리프 자동 추출·편집
2. 브리프 확정 시 **이미지 #2 평면도 시트** + **이미지 #1 제안서 시트**(3D 렌더 + 자재 디테일 + 예산) 즉석 생성
3. 예산이 자재 티어를 결정(강등 시 표시), 큐레이트 카탈로그 브랜드/스왓치 노출
4. 화면 프레젠테이션 + PNG/PDF 내보내기 + 공유 링크(공개 읽기) 동작
5. `proposals`/`finish_materials` RLS 증명, 키 미설정에도 빌드·테스트 통과
6. 4게이트(typecheck/lint/test/build) 통과 + 기존 회귀 0

---

## 오케스트레이션 계획 (승인 후)

팀(Lead+3):
- **Backend**: `lib/types`·`lib/proposal/{templates,materials,index,floorplan-svg}`·`lib/studio/from-floorplan`·`app/api/proposal/*`·`0017`/`0018` 마이그레이션+RPC
- **Frontend**: `app/proposal`·`app/p/[token]`·`components/proposal/*`·NAV/푸터·견적 연동·스왓치 에셋
- **QA**: 매칭/티어/SVG/변환 단위 · finish_materials·proposals·RPC RLS · build 게이트

파일 소유권 분리: `lib/*`+`app/api/*`+migration+`types.ts` → Backend / `app/proposal`+`app/p`+`components/proposal`+`public/swatches` → Frontend / `tests/*` → QA.
의존성: A(타입·카탈로그·티어) → B(템플릿·SVG) → C(3D 변환·조립) → D(UI) → E(API·persist·공유) → F(연동·게이트).
