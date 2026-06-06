import { describe, it, expect } from "vitest";
import {
  generateBomDeterministic,
  matchBomToProducts,
  BomInputSchema,
} from "@/lib/ai-quote";
import type { BomInput } from "@/lib/types";
import { makeProduct } from "../fixtures";

const input: BomInput = {
  projectType: "apartment_remodel",
  areaPyeong: 24,
  dimensions: { bathroomCount: 2 },
  specLevel: "standard",
};

describe("generateBomDeterministic", () => {
  it("produces a multi-category itemized BOM with a positive total", () => {
    const bom = generateBomDeterministic(input);
    expect(bom.source).toBe("fallback");
    expect(bom.lines.length).toBeGreaterThanOrEqual(8);
    expect(bom.estTotal).toBeGreaterThan(0);
    // spans both finishing and structural categories
    const slugs = new Set(bom.lines.map((l) => l.categorySlug));
    expect(slugs.has("flooring")).toBe(true);
    expect(slugs.has("gypsum-board")).toBe(true);
    // every line has qty>=1 and estPrice = unit*qty
    for (const l of bom.lines) {
      expect(l.qty).toBeGreaterThanOrEqual(1);
      expect(l.estPrice).toBe(l.estUnitPrice * l.qty);
    }
  });

  it("scales total with area and spec level", () => {
    const small = generateBomDeterministic({ ...input, areaPyeong: 10 });
    const big = generateBomDeterministic({ ...input, areaPyeong: 40 });
    expect(big.estTotal).toBeGreaterThan(small.estTotal);

    const economy = generateBomDeterministic({ ...input, specLevel: "economy" });
    const premium = generateBomDeterministic({ ...input, specLevel: "premium" });
    expect(premium.estTotal).toBeGreaterThan(economy.estTotal);
  });

  it("uses bathroom count for bathroom-driven items", () => {
    const one = generateBomDeterministic({
      ...input,
      dimensions: { bathroomCount: 1 },
    });
    const three = generateBomDeterministic({
      ...input,
      dimensions: { bathroomCount: 3 },
    });
    const toiletOne = one.lines.find((l) => l.categorySlug === "sanitaryware")!;
    const toiletThree = three.lines.find(
      (l) => l.categorySlug === "sanitaryware",
    )!;
    expect(toiletThree.qty).toBeGreaterThan(toiletOne.qty);
  });
});

describe("matchBomToProducts", () => {
  it("matches each line to the cheapest approved in-stock product in its category", () => {
    const catBySlug = new Map([
      ["flooring", "cat-floor"],
      ["paint", "cat-paint"],
    ]);
    const cheap = makeProduct({
      id: "floor-cheap",
      category_id: "cat-floor",
      supplier_id: "s2",
      unit_price: 30000,
      stock: 1000,
    });
    const dear = makeProduct({
      id: "floor-dear",
      category_id: "cat-floor",
      supplier_id: "s3",
      unit_price: 50000,
      stock: 1000,
    });
    const paint = makeProduct({
      id: "paint-1",
      category_id: "cat-paint",
      supplier_id: "s3",
      unit_price: 40000,
      stock: 100,
    });

    const bom = generateBomDeterministic({
      projectType: "kitchen",
      areaPyeong: 6,
      specLevel: "standard",
    });
    const matched = matchBomToProducts(bom, [cheap, dear, paint], catBySlug);
    const floorLine = matched.lines.find((l) => l.categorySlug === "flooring");
    expect(floorLine?.productId).toBe("floor-cheap");
    expect(floorLine?.supplierId).toBe("s2");
    expect(floorLine?.estUnitPrice).toBe(30000);
  });

  it("leaves a line unmatched when no product/category exists", () => {
    const bom = generateBomDeterministic(input);
    const matched = matchBomToProducts(bom, [], new Map());
    expect(matched.lines.every((l) => l.productId === undefined)).toBe(true);
  });
});

describe("BomInputSchema", () => {
  it("rejects invalid input", () => {
    expect(BomInputSchema.safeParse({}).success).toBe(false);
    expect(
      BomInputSchema.safeParse({
        projectType: "apartment_remodel",
        areaPyeong: -5,
        specLevel: "standard",
      }).success,
    ).toBe(false);
  });

  it("accepts valid input", () => {
    expect(BomInputSchema.safeParse(input).success).toBe(true);
  });
});
