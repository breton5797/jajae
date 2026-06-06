/**
 * Match BOM lines to real catalog products so the list can be added to cart.
 * Pure: takes products + a slug→categoryId index, returns an enriched BomResult.
 */
import type { BomLine, BomResult, Product } from "@/lib/types";
import { won } from "@/lib/utils";

export function matchBomToProducts(
  result: BomResult,
  products: Product[],
  categoryIdBySlug: Map<string, string>,
): BomResult {
  const lines: BomLine[] = result.lines.map((line) => {
    const categoryId = categoryIdBySlug.get(line.categorySlug);
    if (!categoryId) return line;

    const candidates = products.filter(
      (p) =>
        p.category_id === categoryId &&
        p.status === "approved" &&
        p.stock > 0,
    );
    if (candidates.length === 0) return line;

    const best = candidates.reduce((lo, p) =>
      p.unit_price < lo.unit_price ? p : lo,
    );

    return {
      ...line,
      productId: best.id,
      supplierId: best.supplier_id,
      matchedProductName: best.name,
      estUnitPrice: best.unit_price,
      estPrice: won(best.unit_price * line.qty),
    };
  });

  const estTotal = lines.reduce((s, l) => s + l.estPrice, 0);
  return { ...result, lines, estTotal };
}
