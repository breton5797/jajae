# 3D 스튜디오 (Phase A~D: 엔진+익스포트) — Implementation Plan

> 스펙: `docs/superpowers/specs/2026-06-29-jajae-3d-studio-design.md` (승인됨 2026-06-29, 범위 A~D).
> 이번 범위: **편집 가능한 3D 씬 + 에셋/프리셋 + glTF/OBJ/STL/PNG 익스포트.**
> 제외(다음 라운드 E/F): AI 실사 프리뷰, design_scenes 저장/RLS, 견적→스튜디오 연동, from-floorplan 와이어링.
> 각 에이전트는 **스펙을 먼저 읽을 것.**

## Global Constraints
- 신규 npm 의존성 **없음**. 익스포터는 `three/examples/jsm/exporters/{GLTFExporter,OBJExporter,STLExporter}.js`, 컨트롤은 `@react-three/drei`(OrbitControls/TransformControls) 사용.
- 불변 패턴(씬 조작은 새 객체 반환, 변이 금지), `console.log` 금지, 하드코딩 시크릿 금지, zod 경계 검증.
- three/r3f는 클라이언트 전용: 캔버스/에디터는 `"use client"`, 페이지에서 `next/dynamic({ssr:false})`로 로드.
- 게이트: `npm run typecheck`(0) · `npm run lint`(0) · `npm test`(전부) · `npm run build`(exit 0). 기존 회귀 0.
- 파일 소유권: **Backend** = `lib/types.ts`, `lib/studio/{scene,schema,assets,presets}.ts` · **Frontend** = `app/studio/**`, `components/studio/**`, `lib/studio/export/**`(three 씬 결합), `components/site-header.tsx`, `components/site-footer.tsx` · **QA** = `tests/**`.

---

## Phase A — Foundation (Backend, 선행)
- **A1** `lib/types.ts` 가산: `StudioDomain`, `Transform3D`, `SceneObject`, `DesignScene` (스펙 데이터모델). 기존 타입 변경 금지.
- **A2** `lib/studio/schema.ts`: zod `DesignSceneSchema`, `SceneObjectSchema`, `Transform3DSchema`.
- **A3** `lib/studio/scene.ts`: **순수·불변** 조작 — `emptyScene(domain)`, `addObject(scene, assetId, name, transform?)`, `removeObject(scene, id)`, `updateObject(scene, id, patch)`, `moveObject(scene,id,position)`. spread/map만, 변이 금지. id는 호출자 주입 또는 인덱스 기반(결정론, Math.random 금지 — `obj-${scene.objects.length+1}` 식).
- 검증: typecheck. (QA가 scene 단위테스트 작성)

## Phase B — 스튜디오 엔진/에디터 (Frontend, A 이후)
- **B1** `components/studio/scene-canvas.tsx` (`"use client"`): r3f `<Canvas>` + `DesignScene.objects` 렌더(각 SceneObject → mesh, assetId별 지오메트리는 C 전까지 기본 box 폴백 허용) + `<OrbitControls>` + 선택 시 `<TransformControls>`(이동/회전/스케일 모드). 선택/변경 콜백으로 상위에 scene 업데이트 전달. three 씬 ref를 상위에서 받을 수 있게 노출(D 익스포트용, 예: `onSceneReady(scene: THREE.Scene)`).
- **B2** `app/studio/page.tsx` (`"use client"`): 에디터 셸. 인메모리 `DesignScene` 상태(useState, `lib/studio/scene` 불변 조작 사용), `next/dynamic(()=>import scene-canvas,{ssr:false})`. 빈 씬에서 시작, 기본 도메인 `interior`. (저장은 이번 범위 외 — 인메모리.)
- 검증: `npm run build` exit 0(3D/SSR 경계).

## Phase C — 에셋/프리셋 + 팔레트/인스펙터/툴바 (Backend lib + Frontend UI, B 이후)
- **C1**(Backend) `lib/studio/assets.ts`: 에셋 카탈로그(절차적 저폴리). 각 항목 `{id, label, domain[], kind, build(params)→지오메트리 스펙}` — 가구(소파/테이블/의자), 나무/관목, 세트피스, 간판판, 기본 프리미티브(box/plane/cylinder). three 의존 없이 "지오메트리 기술(spec)"만 반환(예: `{geo:'box', size:[...]}`) → 캔버스가 해석. **순수.**
- **C2**(Backend) `lib/studio/presets.ts`: 도메인별 프리셋 `{domain, camera, ground, assetIds[]}` (interior/architecture/landscape/webtoon_bg/stage/signage/furniture). **순수.**
- **C3**(Frontend) `components/studio/asset-palette.tsx`(도메인 에셋 클릭→addObject), `object-inspector.tsx`(선택 오브젝트 transform/color/삭제), `toolbar.tsx`(도메인 전환 셀렉트 + 익스포트 버튼 자리). 캔버스는 C1 지오메트리 스펙을 해석하도록 갱신.
- 검증: 단위(assets/presets 메타)·build.

## Phase D — 익스포트 (Frontend, C 이후)
- **D1** `lib/studio/export/gltf.ts`(GLTFExporter→.glb Blob), `obj.ts`(OBJExporter→string), `stl.ts`(STLExporter→string/Blob), `snapshot.ts`(`gl.domElement.toDataURL('image/png')`→PNG). 각: `(threeScene|gl) → Blob/string`.
- **D2** `components/studio/toolbar.tsx`에 익스포트 버튼 4종 와이어링 + 브라우저 다운로드(`URL.createObjectURL`+a[download]). PNG는 캔버스 스냅샷.
- **D3** 헤더 NAV + 푸터에 `/studio`("3D 스튜디오") 링크 가산(기존 링크 무손상).
- 검증: 단위(가능 범위 — glTF/OBJ/STL 직렬화는 알려진 three 씬으로 node 검증)·build·수동.

## Phase QA — 테스트 + 게이트 (QA, A~D 산출물 대상)
- `tests/unit/studio-scene.test.ts`(scene 불변 조작), `tests/unit/studio-presets.test.ts`(프리셋·에셋 메타 유효성), `tests/unit/studio-export.test.ts`(OBJ/STL/glTF 직렬화가 알려진 씬에서 비어있지 않은 유효 출력 — three를 node에서 import).
- 4게이트(typecheck/lint/test/build) + `git diff main --stat` 회귀 범위 점검.

## 의존성 그래프
```
A(types/schema/scene) → B(canvas/page) → C(assets/presets+UI) → D(export+nav)
                                   └────────────→ QA(tests/gates) ← A,C,D
```

## DoD (스펙 §수용기준 1·2·5 한정 — AI/저장 제외)
1. /studio에서 오브젝트 배치/이동/회전 + 도메인 프리셋 전환
2. glTF·OBJ·STL·PNG 익스포트 다운로드
3. 키 무관 빌드·테스트 통과, 4게이트 + 회귀 0
