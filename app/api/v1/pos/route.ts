import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { filterPosForErp } from "@/lib/erp";
import { createServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Open API / ERP outbound: a partner-supplier pulls its assigned POs. Scope: pos:read. */
export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req, "pos:read", "/api/v1/pos");
  if (!auth.ok) return auth.response;

  const since = new URL(req.url).searchParams.get("since") ?? undefined;

  try {
    const sb = createServiceSupabase();
    // scope to the supplier owned by this partner
    const { data: supplier } = await sb
      .from("suppliers")
      .select("id")
      .eq("owner_id", auth.client.partner_id)
      .maybeSingle();
    if (!supplier) return NextResponse.json({ data: [] });

    const { data: pos } = await sb
      .from("purchase_orders")
      .select("id, supplier_id, order_id, status, subtotal, created_at, expected_ship_date");
    const scoped = filterPosForErp(
      (pos ?? []) as Array<{ supplier_id: string; created_at: string }>,
      (supplier as { id: string }).id,
      since,
    );
    return NextResponse.json({ data: scoped });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
