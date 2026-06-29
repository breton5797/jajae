import { describe, it, expect, vi, afterEach } from "vitest";
import { renderPhotoreal } from "@/lib/proposal/ai-render";

afterEach(() => vi.unstubAllEnvs());

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
});
