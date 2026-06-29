/**
 * lib/studio/ai-render.ts
 * 스튜디오 뷰포트 스냅샷(PNG dataURL) → AI 포토리얼 프리뷰 (도메인별 프롬프트).
 * 렌더 코어/키 해석은 lib/render/image-edit 공유 모듈에 위임한다.
 * 키 미설정 또는 실패 시 mock 폴백(원본 스냅샷 그대로) — 기능은 항상 동작.
 */
import { runPhotoreal, renderAvailable, type RenderResult } from "@/lib/render/image-edit";
import type { StudioDomain } from "@/lib/types";

export type { RenderResult };
export { renderAvailable };

const STRUCTURE = "Preserve the exact same composition, proportions, object placement and camera angle.";

/** 도메인별 실사화 프롬프트 — 절차적 저폴리 씬을 도메인 맞춤 포토리얼로 변환. */
export const STUDIO_DOMAIN_PROMPTS: Record<StudioDomain, string> = {
  interior:
    "Transform this low-poly 3D interior scene into a photorealistic interior " +
    "photograph: warm natural daylight, premium modern Korean apartment finishes, " +
    `wood flooring, soft realistic shadows, architectural-visualization quality. ${STRUCTURE}`,
  architecture:
    "Transform this massing model into a photorealistic architectural exterior " +
    "rendering: realistic facade materials, glazing, sky and context, golden-hour " +
    `lighting, architectural-visualization quality. ${STRUCTURE}`,
  landscape:
    "Transform this 3D landscape layout into a photorealistic garden / landscape " +
    "rendering: lush planting, realistic grass, trees, paving, natural daylight and " +
    `soft shadows. ${STRUCTURE}`,
  webtoon_bg:
    "Turn this 3D scene into a clean webtoon / manhwa background illustration: crisp " +
    "line art, flat cel-shaded coloring, bright ambient lighting, suitable as a comic " +
    `panel background. ${STRUCTURE}`,
  stage:
    "Transform this 3D set into a photorealistic theatrical stage rendering: dramatic " +
    "stage lighting, realistic set-piece materials, depth and atmosphere. " +
    `${STRUCTURE}`,
  signage:
    "Transform this 3D layout into a photorealistic signage mockup: realistic " +
    "illuminated sign materials (acrylic, metal, LED channel letters), mounted in a " +
    `believable storefront context, studio-quality lighting. ${STRUCTURE}`,
  furniture:
    "Transform this 3D model into a photorealistic furniture product render: studio " +
    "lighting, realistic wood / fabric / metal materials, clean neutral backdrop, " +
    `catalog-quality. ${STRUCTURE}`,
};

const FALLBACK_NOTE = "원본 3D 스냅샷을 표시합니다.";

/** 스튜디오 뷰포트 스냅샷을 도메인 맞춤 포토리얼로 변환. 키 없으면 원본 폴백. */
export async function renderStudioPhotoreal(
  imageDataUrl: string,
  domain: StudioDomain,
): Promise<RenderResult> {
  return runPhotoreal(imageDataUrl, STUDIO_DOMAIN_PROMPTS[domain], {
    unset: `AI 렌더 키 미설정 — ${FALLBACK_NOTE}`,
    unavailable: `AI 렌더를 사용할 수 없어 ${FALLBACK_NOTE}`,
    error: `AI 렌더 처리 중 오류 — ${FALLBACK_NOTE}`,
  });
}
