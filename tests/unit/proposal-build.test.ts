import { describe, it, expect } from "vitest";
import { buildProposal } from "@/lib/proposal";
import type { EstimateBrief, FinishMaterial } from "@/lib/types";

const finishes: FinishMaterial[] = [
  { id: "f-e", category: "flooring", tier: "economy", brandId: "b", label: "f-e", unitPrice: 38000, priceStatus: "estimated" },
  { id: "f-s", category: "flooring", tier: "standard", brandId: "b", label: "f-s", unitPrice: 62000, priceStatus: "estimated" },
  { id: "f-p", category: "flooring", tier: "premium", brandId: "b", label: "f-p", unitPrice: 135000, priceStatus: "estimated" },
  { id: "d-e", category: "door", tier: "economy", brandId: "b", label: "d-e", unitPrice: 120000, priceStatus: "estimated" },
  { id: "d-s", category: "door", tier: "standard", brandId: "b", label: "d-s", unitPrice: 190000, priceStatus: "estimated" },
  { id: "d-p", category: "door", tier: "premium", brandId: "b", label: "d-p", unitPrice: 300000, priceStatus: "estimated" },
  { id: "k-e", category: "kitchen", tier: "economy", brandId: "b", label: "k-e", unitPrice: 1500000, priceStatus: "estimated" },
  { id: "k-s", category: "kitchen", tier: "standard", brandId: "b", label: "k-s", unitPrice: 3200000, priceStatus: "estimated" },
  { id: "k-p", category: "kitchen", tier: "premium", brandId: "b", label: "k-p", unitPrice: 6500000, priceStatus: "estimated" },
];

const base: EstimateBrief = {
  projectType: "apartment_remodel",
  specLevel: "standard",
  pyeong: 25,
  rooms: [
    { name: "거실", type: "living", widthM: 5, lengthM: 4 },
    { name: "안방", type: "room", widthM: 3.5, lengthM: 3.5 },
    { name: "방2", type: "room", widthM: 3, lengthM: 3 },
    { name: "방3", type: "room", widthM: 3, lengthM: 3 },
    { name: "욕실", type: "bathroom", widthM: 2, lengthM: 2 },
    { name: "욕실2", type: "bathroom", widthM: 2, lengthM: 2 },
  ],
};
const cat = { categories: [], products: [], finishes };

describe("buildProposal", () => {
  it("25평 매칭 + 총액 = 자재비 + 시공비, 시공비 현실적(>1000만)", async () => {
    const p = await buildProposal({ ...base, budgetKRW: 100_000_000 }, cat);
    expect(p.template.pyeongBand).toBe(20);
    expect(p.totalKRW).toBe(p.materialsKRW + p.constructionKRW);
    expect(p.constructionKRW).toBeGreaterThan(10_000_000);
  });

  it("예산을 조이면 시공비를 감안해 자재가 강등된다", async () => {
    const generous = await buildProposal({ ...base, budgetKRW: 100_000_000 }, cat);
    const tight = await buildProposal({ ...base, budgetKRW: 28_000_000 }, cat);
    expect(tight.materialsKRW).toBeLessThan(generous.materialsKRW);
  });
});
