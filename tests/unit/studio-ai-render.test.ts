import { describe, it, expect, vi, afterEach } from "vitest";
import { renderStudioPhotoreal, STUDIO_DOMAIN_PROMPTS } from "@/lib/studio/ai-render";
import type { StudioDomain } from "@/lib/types";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ALL_DOMAINS: StudioDomain[] = [
  "interior", "architecture", "landscape", "webtoon_bg", "stage", "signage", "furniture",
];

describe("renderStudioPhotoreal", () => {
  it("7개 도메인 모두 프롬프트가 정의돼 있다", () => {
    for (const d of ALL_DOMAINS) {
      expect(STUDIO_DOMAIN_PROMPTS[d]).toBeTruthy();
    }
  });

  it("키 미설정 → mock 폴백(원본 스냅샷 그대로 + 안내)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("STUDIO_RENDER_API_KEY", "");
    vi.stubEnv("STUDIO_RENDER_PROVIDER", "");
    const input = "data:image/png;base64,AAAA";
    const r = await renderStudioPhotoreal(input, "interior");
    expect(r.mock).toBe(true);
    expect(r.imageUrl).toBe(input);
    expect(r.provider).toBe("none");
    expect(r.note).toBeTruthy();
  });

  it("OpenAI 경로: 선택 도메인의 프롬프트로 요청한다", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("STUDIO_RENDER_API_KEY", "");
    let captured: { init: RequestInit } | null = null;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      captured = { init };
      return { ok: true, json: async () => ({ data: [{ b64_json: "QQ==" }] }) } as Response;
    });

    const r = await renderStudioPhotoreal("data:image/png;base64,AAAA", "signage");

    expect(r.mock).toBe(false);
    expect(r.provider).toBe("openai");
    const form = captured!.init.body as FormData;
    expect(String(form.get("prompt"))).toBe(STUDIO_DOMAIN_PROMPTS.signage);
  });

  it("OpenAI 실패(non-200) → mock 폴백", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("STUDIO_RENDER_API_KEY", "");
    vi.stubGlobal("fetch", async () => ({ ok: false, json: async () => ({}) }) as Response);
    const input = "data:image/png;base64,AAAA";
    const r = await renderStudioPhotoreal(input, "furniture");
    expect(r.mock).toBe(true);
    expect(r.imageUrl).toBe(input);
  });
});
