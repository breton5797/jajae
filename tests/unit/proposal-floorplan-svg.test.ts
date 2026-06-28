import { describe, it, expect } from "vitest";
import { renderPlanSvg } from "@/lib/proposal/floorplan-svg";
import { APARTMENT_TEMPLATES } from "@/lib/proposal/templates";

const T = APARTMENT_TEMPLATES.find((x) => x.pyeongBand === 20)!;

describe("renderPlanSvg", () => {
  it("svg 문자열 + 모든 방 라벨 포함", () => {
    const svg = renderPlanSvg(T, { title: "25평 평면도" });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
    for (const r of T.rooms) expect(svg).toContain(r.name);
  });
  it("전용/공급 면적 주석 포함", () => {
    const svg = renderPlanSvg(T);
    expect(svg).toContain("전용면적");
    expect(svg).toContain(`${T.exclusiveM2}`);
    expect(svg).toContain("공급면적");
  });
});
