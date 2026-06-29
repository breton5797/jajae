/**
 * lib/proposal/ai-render.ts
 * 3D 스냅샷/평면도(PNG dataURL) → AI 포토리얼 변환 (제안서용 프롬프트).
 * 렌더 코어/키 해석은 lib/render/image-edit 공유 모듈에 위임한다.
 * 키 미설정 또는 실패 시 mock 폴백(원본 그대로 반환) — 기능은 항상 동작.
 */
import { runPhotoreal, renderAvailable, type RenderResult } from "@/lib/render/image-edit";

export type RenderKind = "interior" | "floorplan";
export type { RenderResult };
export { renderAvailable };

/** 종류별 프롬프트 — interior(3D 돌하우스→실내사진), floorplan(도식 평면도→실사 평면도). */
const PROMPTS: Record<RenderKind, string> = {
  interior:
    "Transform this 3D dollhouse floor-plan render into a photorealistic interior " +
    "photograph. Preserve the exact same room layout, wall positions, and furniture " +
    "placement. Warm natural daylight, premium modern Korean apartment finishes, " +
    "wood flooring, soft realistic shadows, architectural-visualization quality, " +
    "clean and bright. Keep the same elevated angled viewpoint.",
  floorplan:
    "Convert this schematic top-down 2D apartment floor plan into a photorealistic " +
    "architectural floor-plan illustration, top-down view. Keep the EXACT same room " +
    "layout, walls, proportions, and the Korean room-name labels. Add realistic " +
    "light wood-tone flooring, dark walls, furnishings (beds with bedding, sofa, " +
    "dining table with chairs, kitchen counter with sink and cooktop, bathroom " +
    "fixtures, wardrobes), area rugs, and a few potted plants — like a premium " +
    "Korean apartment floor-plan rendering.",
};

const FALLBACK_NOTE: Record<RenderKind, string> = {
  interior: "원본 3D 렌더를 표시합니다.",
  floorplan: "도식 평면도를 표시합니다.",
};

export async function renderPhotoreal(
  imageDataUrl: string,
  opts?: { prompt?: string; kind?: RenderKind },
): Promise<RenderResult> {
  const kind: RenderKind = opts?.kind ?? "interior";
  const prompt = opts?.prompt ?? PROMPTS[kind];
  return runPhotoreal(imageDataUrl, prompt, {
    unset: `AI 렌더 키 미설정 — ${FALLBACK_NOTE[kind]}`,
    unavailable: `AI 렌더를 사용할 수 없어 ${FALLBACK_NOTE[kind]}`,
    error: `AI 렌더 처리 중 오류 — ${FALLBACK_NOTE[kind]}`,
  });
}
