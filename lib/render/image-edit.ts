/**
 * lib/render/image-edit.ts
 * 공유 AI 이미지 편집(img2img) 코어 — 제안서·스튜디오 공통.
 * provider-agnostic 키 해석(STUDIO_RENDER_API_KEY → OPENAI_API_KEY 폴백) +
 * OpenAI gpt-image-1 edits. 키 미설정/실패 시 호출자가 mock 폴백을 받는다.
 */
import {
  openaiApiKey, studioRenderApiKey, studioRenderModel,
  studioRenderProvider, studioRenderQuality,
} from "@/lib/env";

export interface RenderResult {
  imageUrl: string; // dataURL 또는 원격 URL
  provider: string;
  mock: boolean;
  note?: string;
}

/** 도메인별 폴백 안내 문구(키 미설정 / 사용 불가 / 오류). */
export interface FallbackNotes {
  unset: string;
  unavailable: string;
  error: string;
}

function resolveProvider(): { provider: string; key: string } | null {
  const explicitKey = studioRenderApiKey();
  if (explicitKey) return { provider: studioRenderProvider() ?? "openai", key: explicitKey };
  const oa = openaiApiKey();
  if (oa) return { provider: "openai", key: oa };
  return null;
}

/** AI 렌더 키가 설정돼 실제 생성이 가능한지(클라이언트 auto-run/버튼 판단용). */
export function renderAvailable(): boolean {
  return resolveProvider() !== null;
}

/**
 * OpenAI 이미지 편집(img2img) — gpt-image-1 계열. 실패 시 null.
 * 스펙(POST /v1/images/edits) 준수:
 *  - 멀티파트 필드는 `image[]`(배열), 모델은 gpt-image-1 계열.
 *  - `input_fidelity=high`로 입력 렌더의 구도/배치를 보존(구조 보존 핵심).
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

/**
 * 공유 실행: 키 해석 → provider별 편집 → RenderResult.
 * 폴백 note는 호출자(도메인)별로 주입한다. 기능은 항상 동작(키 없으면 원본 반환).
 */
export async function runPhotoreal(
  imageDataUrl: string, prompt: string, notes: FallbackNotes,
): Promise<RenderResult> {
  const cfg = resolveProvider();
  if (!cfg) {
    return { imageUrl: imageDataUrl, provider: "none", mock: true, note: notes.unset };
  }
  try {
    if (cfg.provider === "openai") {
      const out = await openaiEdit(imageDataUrl, prompt, cfg.key);
      if (out) return { imageUrl: out, provider: "openai", mock: false };
    }
    return { imageUrl: imageDataUrl, provider: cfg.provider, mock: true, note: notes.unavailable };
  } catch {
    return { imageUrl: imageDataUrl, provider: cfg.provider, mock: true, note: notes.error };
  }
}
