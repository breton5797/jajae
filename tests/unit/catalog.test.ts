import { describe, it, expect } from "vitest";
import {
  buildCategoryTree,
  expandCategoryIds,
  flattenTree,
  filterProducts,
  mapNaturalLanguageToFilter,
} from "@/lib/catalog";
import type { Category } from "@/lib/types";
import { makeProduct } from "../fixtures";

const cats: Category[] = [
  { id: "tile", parent_id: null, kind: "interior", name: "타일", slug: "tile", level: 0, sort: 1 },
  { id: "bath", parent_id: "tile", kind: "interior", name: "욕실타일", slug: "bathroom-tile", level: 1, sort: 1 },
  { id: "floor-tile", parent_id: "tile", kind: "interior", name: "바닥타일", slug: "floor-tile", level: 1, sort: 2 },
  { id: "paint", parent_id: null, kind: "interior", name: "페인트", slug: "paint", level: 0, sort: 2 },
];

describe("category tree", () => {
  it("builds a nested forest sorted by sort", () => {
    const tree = buildCategoryTree(cats);
    expect(tree).toHaveLength(2);
    expect(tree[0]!.slug).toBe("tile");
    expect(tree[0]!.children.map((c) => c.slug)).toEqual([
      "bathroom-tile",
      "floor-tile",
    ]);
  });

  it("expands a category to include all descendants", () => {
    const ids = expandCategoryIds(cats, "tile");
    expect(ids).toEqual(new Set(["tile", "bath", "floor-tile"]));
  });

  it("flattens a tree depth-first", () => {
    const flat = flattenTree(buildCategoryTree(cats));
    expect(flat.map((c) => c.slug)).toEqual([
      "tile",
      "bathroom-tile",
      "floor-tile",
      "paint",
    ]);
  });
});

describe("filterProducts", () => {
  const p1 = makeProduct({ id: "p1", category_id: "tile", brand: "아이존", unit_price: 29000, spec: { 용도: "욕실", 기능: "방수" } });
  const p2 = makeProduct({ id: "p2", category_id: "paint", brand: "KCC", unit_price: 43000, spec: { 등급: "친환경" } });
  const p3 = makeProduct({ id: "p3", category_id: "tile", brand: "대동", unit_price: 80000, status: "pending" });
  const all = [p1, p2, p3];

  it("only lists approved products by default", () => {
    expect(filterProducts(all).map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("filters by category id set", () => {
    expect(filterProducts(all, { categoryIds: ["tile"] }).map((p) => p.id)).toEqual(["p1"]);
  });

  it("filters by brand, price range, and spec", () => {
    expect(filterProducts(all, { brand: "KCC" }).map((p) => p.id)).toEqual(["p2"]);
    expect(filterProducts(all, { maxPrice: 30000 }).map((p) => p.id)).toEqual(["p1"]);
    expect(filterProducts(all, { specs: { 용도: "욕실" } }).map((p) => p.id)).toEqual(["p1"]);
  });

  it("free-text query is AND over terms across name/brand/spec", () => {
    expect(filterProducts(all, { query: "방수 욕실" }).map((p) => p.id)).toEqual(["p1"]);
    expect(filterProducts(all, { query: "친환경" }).map((p) => p.id)).toEqual(["p2"]);
  });
});

describe("mapNaturalLanguageToFilter", () => {
  const idBySlug = new Map([
    ["tile", "tile-id"],
    ["waterproofing", "wp-id"],
  ]);

  it("maps '방수 잘되는 욕실 타일' to tile category + bathroom/waterproof specs", () => {
    const f = mapNaturalLanguageToFilter("방수 잘되는 욕실 타일", idBySlug);
    expect(f.categoryIds).toContain("tile-id");
    expect(f.specs?.["용도"]).toBe("욕실");
    expect(f.specs?.["기능"]).toBe("방수");
    expect(f.query).toBe("방수 잘되는 욕실 타일");
  });

  it("returns just a query when nothing matches", () => {
    const f = mapNaturalLanguageToFilter("아무거나", idBySlug);
    expect(f.categoryIds).toBeUndefined();
  });
});
