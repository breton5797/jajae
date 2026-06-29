import { describe, it, expect, vi, afterEach } from "vitest";
import { renderPhotoreal } from "@/lib/proposal/ai-render";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("renderPhotoreal", () => {
  it("키 미설정 → mock 폴백(원본 3D 렌더 그대로 + 안내)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("STUDIO_RENDER_API_KEY", "");
    vi.stubEnv("STUDIO_RENDER_PROVIDER", "");
    const input = "data:image/png;base64,AAAA";
    const r = await renderPhotoreal(input);
    expect(r.mock).toBe(true);
    expect(r.imageUrl).toBe(input);
    expect(r.provider).toBe("none");
    expect(r.note).toBeTruthy();
  });

  it("OpenAI 경로: /v1/images/edits 스펙대로 요청 + b64 응답 파싱", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("STUDIO_RENDER_API_KEY", "");
    vi.stubEnv("STUDIO_RENDER_PROVIDER", "");
    let captured: { url: string; init: RequestInit } | null = null;
    const fakeB64 = "QUJD";
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      captured = { url, init };
      return { ok: true, json: async () => ({ data: [{ b64_json: fakeB64 }] }) } as Response;
    });

    const r = await renderPhotoreal("data:image/png;base64,AAAA", { prompt: "테스트 프롬프트" });

    expect(r.mock).toBe(false);
    expect(r.provider).toBe("openai");
    expect(r.imageUrl).toBe(`data:image/png;base64,${fakeB64}`);

    // 요청이 스펙(gpt-image-1 images/edits)을 따르는지 검증
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe("https://api.openai.com/v1/images/edits");
    expect((captured!.init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const form = captured!.init.body as FormData;
    expect(form.get("model")).toBe("gpt-image-1");
    expect(form.get("prompt")).toBe("테스트 프롬프트");
    expect(form.get("size")).toBe("1536x1024");
    expect(form.get("input_fidelity")).toBe("high"); // 구조 보존
    expect(form.get("image[]")).toBeTruthy(); // 배열 필드명
  });

  it("kind=floorplan → 평면도 프롬프트로 요청", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("STUDIO_RENDER_API_KEY", "");
    let captured: { init: RequestInit } | null = null;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      captured = { init };
      return { ok: true, json: async () => ({ data: [{ b64_json: "QQ==" }] }) } as Response;
    });
    await renderPhotoreal("data:image/png;base64,AAAA", { kind: "floorplan" });
    const form = captured!.init.body as FormData;
    expect(String(form.get("prompt"))).toContain("floor plan");
  });

  it("OpenAI 실패(non-200) → mock 폴백", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("STUDIO_RENDER_API_KEY", "");
    vi.stubGlobal("fetch", async () => ({ ok: false, json: async () => ({}) }) as Response);
    const input = "data:image/png;base64,AAAA";
    const r = await renderPhotoreal(input);
    expect(r.mock).toBe(true);
    expect(r.imageUrl).toBe(input);
  });
});
