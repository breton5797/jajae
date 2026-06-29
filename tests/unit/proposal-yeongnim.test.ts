import { describe, it, expect } from "vitest";
import { groupYeongnimColors, type YeongnimRow } from "@/lib/proposal/yeongnim";

const rows: YeongnimRow[] = [
  { series: "소프 포슬린", patternGroup: "솔리드", category: "kitchen", modelCode: "SF-01" },
  { series: "소프 포슬린", patternGroup: "솔리드", category: "door", modelCode: "AP-18S" },
  { series: "루나 라이트스톤", patternGroup: "스톤마블", category: "film", modelCode: "PX451-1" },
  { series: "루나 라이트스톤", patternGroup: "스톤마블", category: "flooring", modelCode: "YMQ(W)-304" },
  { series: "발코니 베이직", patternGroup: "PVC 이중창", category: "window", modelCode: "BF-Y230BE" }, // 제외 대상
];

describe("groupYeongnimColors", () => {
  it("컬러별 그룹 + 창호(window) 제외", () => {
    const colors = groupYeongnimColors(rows);
    expect(colors.map((c) => c.series)).toEqual(["루나 라이트스톤", "소프 포슬린"]); // 스톤마블 먼저
    expect(colors.find((c) => c.series === "발코니 베이직")).toBeUndefined();
  });

  it("아이템은 카테고리 순서(마루→도어→키친…)대로 정렬", () => {
    const luna = groupYeongnimColors(rows).find((c) => c.series === "루나 라이트스톤")!;
    expect(luna.items.map((i) => i.category)).toEqual(["flooring", "film"]);
    expect(luna.items[0]!.modelCode).toBe("YMQ(W)-304");
  });

  it("패턴그룹 순서(스톤마블 < 솔리드)", () => {
    const colors = groupYeongnimColors(rows);
    expect(colors[0]!.patternGroup).toBe("스톤마블");
    expect(colors[1]!.patternGroup).toBe("솔리드");
  });
});
