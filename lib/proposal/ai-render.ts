/**
 * lib/proposal/ai-render.ts
 * 3D 스냅샷(PNG dataURL) → AI 포토리얼 변환 (provider-agnostic).
 * 우선순위: STUDIO_RENDER_API_KEY(+STUDIO_RENDER_PROVIDER) → OPENAI_API_KEY.
 * 키 미설정 또는 실패 시 mock 폴백(원본 3D 렌더 그대로 반환) — 기능은 항상 동작.
 */
import {
  openaiApiKey, studioRenderApiKey, studioRenderModel,
  studioRenderProvider, studioRenderQuality,
} from "@/lib/env";

export type RenderKind = "interior" | "floorplan";

export interface RenderResult {
  imageUrl: string; // dataURL 또는 원격 URL
  provider: string;
  mock: boolean;
  note?: string;
}

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

function resolveProvider(): { provider: string; key: string } | null {
  const explicitKey = studioRenderApiKey();
  if (explicitKey) return { provider: studioRenderProvider() ?? "openai", key: explicitKey };
  const oa = openaiApiKey();
  if (oa) return { provider: "openai", key: oa };
  return null;
}

/** AI 렌더 키가 설정돼 실제 생성이 가능한지(클라이언트 auto-run 판단용). */
export function renderAvailable(): boolean {
  return resolveProvider() !== null;
}

/**
 * OpenAI 이미지 편집(img2img) — gpt-image-1 계열. 실패 시 null.
 * 스펙(POST /v1/images/edits) 준수:
 *  - 멀티파트 필드는 `image[]`(배열), 모델은 gpt-image-1 계열.
 *  - `input_fidelity=high`로 입력 3D 렌더의 구도/배치를 보존(구조 보존 핵심).
 *  - gpt-image-1은 b64_json을 기본 반환(response_format 미전송).
 *  - size는 4:3 hero에 맞춰 가로형 1536x1024.
 */
async function openaiEdit(
  dataUrl: string, prompt: string, key: string,
): Promise<string | null> {
  const b64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  const bytes = Buffer.from(b64, "base64");
  const form = new FormData();
  form.append("model", studioRenderModel());
  form.append("image[]", new Blob([bytes], { type: "image/png" }), "scene.png");
  form.append("prompt", prompt);
  form.append("size", "1536x1024");
  form.append("input_fidelity", "high");
  form.append("quality", studioRenderQuality());

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const first = json.data?.[0];
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
  if (first?.url) return first.url;
  return null;
}

export async function renderPhotoreal(
  imageDataUrl: string,
  opts?: { prompt?: string; kind?: RenderKind },
): Promise<RenderResult> {
  const kind: RenderKind = opts?.kind ?? "interior";
  const prompt = opts?.prompt ?? PROMPTS[kind];
  const cfg = resolveProvider();
  if (!cfg) {
    return {
      imageUrl: imageDataUrl,
      provider: "none",
      mock: true,
      note: `AI 렌더 키 미설정 — ${FALLBACK_NOTE[kind]}`,
    };
  }
  try {
    if (cfg.provider === "openai") {
      const out = await openaiEdit(imageDataUrl, prompt, cfg.key);
      if (out) return { imageUrl: out, provider: "openai", mock: false };
    }
    return {
      imageUrl: imageDataUrl,
      provider: cfg.provider,
      mock: true,
      note: `AI 렌더를 사용할 수 없어 ${FALLBACK_NOTE[kind]}`,
    };
  } catch {
    return {
      imageUrl: imageDataUrl,
      provider: cfg.provider,
      mock: true,
      note: `AI 렌더 처리 중 오류 — ${FALLBACK_NOTE[kind]}`,
    };
  }
}
