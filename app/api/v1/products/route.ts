import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { createServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Open API: list approved products. Scope: products:read. */
export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req, "products:read", "/api/v1/products");
  if (!auth.ok) return auth.response;

  const sb = createServiceSupabase();
  const { data } = await sb
    .from("products")
    .select("id, name, brand, unit, unit_price, stock, lead_time_days, category_id")
    .eq("status", "approved")
    .limit(100);

  return NextResponse.json({ data: data ?? [] });
}
