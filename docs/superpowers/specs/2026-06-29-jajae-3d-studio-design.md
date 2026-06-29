# 자재(Jajae) 3D 스튜디오 — 설계 스펙 (스케치업형 씬 컴포저)

> 작성일 2026-06-29 · 상태: **승인 대기(Draft)** · 승인 후 plan → team-orchestrator
> 전제: 견적 3D(정적 벽 압출)를 **편집 가능한 3D 씬 + 에셋 + 표준 익스포트 + AI 실사 프리뷰** 엔진으로 확장.

## 목표

하나의 웹 3D 엔진으로 여러 도메인을 "스케치업처럼" 다룬다: 씬을 구성·편집하고 → **표준 포맷으로 내보내 외부 렌더러가 실사화**하거나 → **AI 이미지로 즉석 실사 프리뷰**한다.

## 결정사항 (대표님 승인 — 2026-06-29)

| 항목 | 결정 |
|---|---|
| 실사 렌더 | **익스포트(glTF/OBJ) + AI 이미지 프리뷰 둘 다** (인앱 렌더 엔진 자체 구현 ✕) |
| 1차 도메인 | 인테리어/건축 · 조경 · 웹툰배경(3D→2D) · 무대/세트·간판·가구·3D프린트 |
| 진행 | 스펙 승인 → plan → 오케스트레이션 (HARD-GATE) |

## 핵심 설계 원칙

**도메인은 별도 앱이 아니라 한 엔진의 "프리셋 + 에셋팩 + 익스포트 타깃"이다.** 엔진(씬 모델·에디터·익스포트·AI)은 1개, 도메인은 그 위의 설정으로 수렴시킨다. → 새 도메인 추가 = 에셋팩/프리셋 추가(엔진 재작성 아님).

## 비목표 (제외/후순위)

- **엔지니어링(STEP/CAD 정밀·DXF)** — Three.js 영역 밖, 별도 트랙. 이번 제외.
- **인앱 포토리얼 렌더 엔진** 자체 구현 — 비현실적. 실사는 익스포트/AI로.
- **고품질 에셋 제작** — 콘텐츠 파이프라인 문제. 1차는 절차적(저폴리) 플레이스홀더, 고품질팩은 지속 과제.
- 협업(멀티유저 동시편집), 물리 시뮬레이션.

---

## 기술 스택 (신규 의존성 없음)

three 0.169(내장 `GLTFExporter`/`OBJExporter`/`STLExporter`/`OrbitControls`/`TransformControls`) · @react-three/fiber 8 · @react-three/drei 9 · Next 14 · Supabase · zod. AI 렌더만 외부 이미지 API(키, provider-agnostic).

---

## 데이터 모델 (`lib/types.ts` 가산)

```ts
export type StudioDomain =
  | "interior" | "architecture" | "landscape"
  | "webtoon_bg" | "stage" | "signage" | "furniture";

export interface Transform3D { position: [number,number,number]; rotation: [number,number,number]; scale: [number,number,number]; }

export interface SceneObject {
  id: string;
  assetId: string;            // 에셋 라이브러리 키
  name: string;
  transform: Transform3D;
  color?: string;             // 머티리얼 틴트
  params?: Record<string, number>; // 파라메트릭(폭/높이 등)
}

export interface DesignScene {
  id: string;
  domain: StudioDomain;
  objects: SceneObject[];
  ground: { type: "floor" | "terrain" | "none"; sizeM: number };
  camera: { position: [number,number,number]; target: [number,number,number] };
}
```

### DB 마이그레이션 `supabase/migrations/0017_design_scene.sql` (ADDITIVE)

- `design_scenes`: `id`, `owner_id uuid → profiles(id)`, `domain text check(...)`, `scene jsonb`, `name text`, `thumbnail_url text`, `created_at`. (0016 패턴·RLS 동일: owner/admin/service, `revoke from anon`.)

---

## 모듈 & 인터페이스

### 엔진 — 순수 로직 (`lib/studio/`)
| 파일 | 역할 | 테스트 |
|---|---|---|
| `scene.ts` | `createObject`/`moveObject`/`removeObject`/`updateTransform` — **불변** 씬 조작 | 단위(핵심) |
| `presets.ts` | 도메인별 프리셋(기본 카메라·지면·에셋팩·익스포트 기본값) | 단위 |
| `assets.ts` | 에셋 카탈로그(절차적 저폴리: box/plane primitives, 가구·나무·세트피스·간판). 각 항목 → three 지오메트리 빌더 | 단위(메타) |
| `from-floorplan.ts` | `FloorPlan → DesignScene`(룸→바닥+벽 SceneObject) — 견적 연동 | 단위 |
| `schema.ts` | zod: `DesignSceneSchema`, `StudioRenderSchema` | 단위 |

### 익스포트 (`lib/studio/export/`) — 클라이언트, three 씬그래프 대상
- `gltf.ts`(GLTFExporter→.glb), `obj.ts`(OBJExporter), `stl.ts`(STLExporter, 3D프린팅), `snapshot.ts`(렌더러 캔버스→PNG, 웹툰배경). 각 함수: `(threeScene) → Blob/string` + 다운로드 트리거.

### AI 실사 프리뷰
- `lib/studio/ai-render.ts`: `renderPhotoreal(pngBase64, prompt, domain): Promise<string|null>` — provider-agnostic(env `STUDIO_RENDER_API_KEY`/`STUDIO_RENDER_PROVIDER`). 구조 보존 img2img(depth/edge 조건). **키 없으면 null → 원본 스냅샷 + "AI 렌더 미설정" 폴백.**
- `app/api/studio/render/route.ts` POST `{imageBase64, prompt?, domain}` → `{imageUrl, provider, mock}` (drawing 라우트 컨벤션).

### UI (`components/studio/`, 클라이언트)
- `scene-canvas.tsx` — r3f `<Canvas>` + 오브젝트 렌더 + `TransformControls`(이동/회전/스케일) + `OrbitControls`. `next/dynamic ssr:false`.
- `asset-palette.tsx` — 도메인 에셋팩에서 클릭→씬에 추가.
- `object-inspector.tsx` — 선택 오브젝트 transform/색/파라미터 편집·삭제.
- `toolbar.tsx` — 도메인 전환, 익스포트(glTF/OBJ/STL/PNG), AI 실사 버튼, 저장.

### 라우트/페이지
- `app/studio/page.tsx` — 스튜디오(에디터). `?from=estimate&id=...`로 견적 평면도 시드.
- `app/api/studio/render` (위), `app/api/studio/scenes`(POST 저장)·`scenes/[id]`(GET, RLS).
- 견적 결과 단계에 **"3D 스튜디오에서 편집"** 버튼 → `from-floorplan`으로 씬 생성.
- 헤더/푸터에 `/studio` 링크 가산.

---

## 도메인 매핑 (한 엔진 → 7영역)

| 도메인 | 프리셋/에셋 | 실사 경로 |
|---|---|---|
| 인테리어/건축 | 룸+가구+자재, 건물 매스 | glTF→외부렌더 / AI 프리뷰 |
| 조경 | 지형(terrain)+나무·잔디 에셋 | 미팅 즉석 + glTF/AI |
| 웹툰배경 | 건물·거리 프리셋 | **PNG 스냅샷**(카메라 앵글) |
| 무대/세트 | 무대 바닥+세트피스 | 프리뷰 + glTF |
| 간판/가구 | 파라메트릭 박스/판재 | glTF / **STL** |
| 3D프린팅 | 모든 도메인 | **STL**(watertight 주의) |

---

## 환경변수 (신규)
```
STUDIO_RENDER_PROVIDER=    # fal | replicate | openai | stability (택1)
STUDIO_RENDER_API_KEY=     # 미설정 시 AI 렌더 비활성(원본 스냅샷 폴백)
```
> go-live 런북·`.env.example` 갱신 대상.

---

## 단계적 구현 (plan에서 태스크화)

| Phase | 내용 | 검증 |
|---|---|---|
| A | 타입+`schema`+`scene.ts`(불변 조작)+`from-floorplan`+마이그레이션 0017 | 단위·typecheck |
| B | 스튜디오 엔진: `scene-canvas`(배치/이동/회전, Orbit+Transform) + `/studio` 셸 | build·수동 |
| C | `assets`+`presets`(절차적 에셋팩·도메인) + `asset-palette`·`object-inspector`·`toolbar` | 단위(메타)·build |
| D | 익스포트 glTF/OBJ/STL/PNG + 다운로드 | 단위(직렬화)·수동 |
| E | AI 실사: `ai-render`+`/api/studio/render`(provider-agnostic, 폴백) + UI | 폴백 단위 |
| F | 견적→스튜디오 시드 + 저장/로드(design_scenes) + nav | db RLS·E2E |

---

## 테스트 전략
- **순수 로직**(scene 조작·from-floorplan·presets·export 직렬화) → vitest 단위(핵심). three 익스포터는 node에서 알려진 씬 입력으로 glTF JSON/OBJ/STL 문자열 산출 검증.
- **RLS** design_scenes → PGlite db 테스트.
- **AI/PNG/캔버스** → 키 없는 폴백 단위 + `npm run build` 게이트 + 수동 시각(r3f/three는 jsdom 부적합).
- 게이트: typecheck 0 / lint 0 / test 전부 / build exit 0. 기존 회귀 0.

---

## 리스크 & 완화
| 리스크 | 완화 |
|---|---|
| 에셋 품질(절차적 ≠ 실사) | 1차 저폴리 플레이스홀더로 "배치·논의·익스포트" 가치 우선. 고품질팩은 후속 콘텐츠 트랙(별도). |
| AI 실사 품질/비용 | 구조보존 img2img·도메인 프롬프트, best-effort 명시. 키 없으면 폴백. |
| STL watertight(3D프린팅) | 절차적 프리미티브는 watertight. 합성 씬은 오브젝트별 단일메시 익스포트 + "프린팅 검증 필요" 라벨. |
| r3f/three 테스트 난이도 | 로직 순수분리 단위 + build/수동 게이트. |
| 과대 범위 | 엔진+익스포트(A~D) 먼저 출시, 도메인 에셋팩·AI는 점진. 엔지니어링 제외. |

## 수용 기준 (DoD)
1. `/studio`에서 오브젝트 배치/이동/회전, 도메인 프리셋 전환
2. glTF·OBJ·STL·PNG 익스포트 다운로드
3. AI 실사 프리뷰(키 있으면 실사, 없으면 원본 폴백)
4. 견적 평면도 → 스튜디오 시드, 씬 저장/로드(RLS 격리)
5. 키 미설정에도 빌드·테스트 통과, 4게이트 + 회귀 0

## 오케스트레이션 계획 (승인 후)
- **Backend**: `lib/types`·`lib/studio/{scene,presets,assets,from-floorplan,schema,export/*,ai-render}`·`app/api/studio/*`·`0017` 마이그레이션
- **Frontend**: `app/studio`·`components/studio/*`·견적 연동 버튼·nav
- **QA**: scene/convert/preset/export 단위 · design_scenes RLS · build
- 의존성: A → B → C → D/E → F. 파일 소유권: lib+api+migration+types=Backend / app+components=Frontend / tests=QA.
