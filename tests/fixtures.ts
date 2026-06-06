import type { Product, ResolvedCartLine } from "@/lib/types";

let n = 0;
export function makeProduct(over: Partial<Product> = {}): Product {
  n += 1;
  return {
    id: over.id ?? `prod-${n}`,
    supplier_id: over.supplier_id ?? "sup-1",
    category_id: over.category_id ?? "cat-1",
    name: over.name ?? `상품 ${n}`,
    brand: over.brand ?? "브랜드",
    spec: over.spec ?? {},
    unit: over.unit ?? "ea",
    unit_price: over.unit_price ?? 1000,
    stock: over.stock ?? 100,
    lead_time_days: over.lead_time_days ?? 3,
    spec_sheet_url: over.spec_sheet_url ?? null,
    status: over.status ?? "approved",
    created_at: over.created_at ?? "2026-01-01T00:00:00.000Z",
  };
}

export function line(product: Product, qty: number): ResolvedCartLine {
  return { product, requestedQty: qty };
}
