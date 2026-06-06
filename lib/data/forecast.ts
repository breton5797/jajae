import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { computeReorderSuggestion } from "@/lib/forecast";
import type { Forecast, Product, ReorderRule, ReorderSuggestion } from "@/lib/types";

export interface ReorderRow extends ReorderSuggestion {
  name: string;
  unitPrice: number;
  predictedQty: number;
}

export interface ForecastOverview {
  authed: boolean;
  rows: ReorderRow[];
}

export async function loadReorderOverview(): Promise<ForecastOverview> {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return { authed: false, rows: [] };

    const [{ data: rules }, { data: forecasts }, { data: products }] =
      await Promise.all([
        sb.from("reorder_rules").select("*").eq("enabled", true),
        sb.from("forecasts").select("*"),
        sb.from("products").select("id, name, unit_price, stock"),
      ]);

    // latest forecast per product
    const fByProduct = new Map<string, number>();
    for (const f of (forecasts ?? []) as Forecast[]) {
      fByProduct.set(f.product_id, Number(f.predicted_qty));
    }
    const pById = new Map(
      ((products ?? []) as Array<Pick<Product, "id" | "name" | "unit_price" | "stock">>).map(
        (p) => [p.id, p],
      ),
    );

    const rows: ReorderRow[] = ((rules ?? []) as ReorderRule[]).map((rule) => {
      const product = pById.get(rule.product_id);
      const predicted = fByProduct.get(rule.product_id) ?? 0;
      const suggestion = computeReorderSuggestion(
        rule,
        predicted,
        product?.stock ?? 0,
      );
      return {
        ...suggestion,
        name: product?.name ?? rule.product_id,
        unitPrice: product?.unit_price ?? 0,
        predictedQty: predicted,
      };
    });

    return { authed: true, rows };
  } catch {
    return { authed: false, rows: [] };
  }
}
