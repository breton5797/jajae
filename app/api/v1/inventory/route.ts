import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { validateErpStockPayload, reconcileStockUpdate } from "@/lib/erp";
import { createServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Open API / ERP inbound: push stock + price (idempotent by version). Scope: inventory:write. */
export async function POST(req: Request) {
  const auth = await authenticateApiRequest(req, "inventory:write", "/api/v1/inventory");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = validateErpStockPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const update = parsed.value;

  try {
    const sb = createServiceSupabase();
    const { data: syncRows } = await sb
      .from("erp_syncs")
      .select("id, version")
      .eq("external_id", update.externalId)
      .limit(1);
    const sync = (syncRows ?? [])[0] as { id: string; version: number } | undefined;
    const { data: product } = await sb
      .from("products")
      .select("id, stock, unit_price")
      .eq("id", update.productId)
      .maybeSingle();
    if (!product) return NextResponse.json({ error: "unknown product" }, { status: 404 });

    const recon = reconcileStockUpdate(
      {
        version: sync ? Number(sync.version) : 0,
        stock: Number((product as { stock: number }).stock),
        unit_price: Number((product as { unit_price: number }).unit_price),
      },
      update,
    );

    if (!recon.apply) {
      return NextResponse.json({ applied: false, reason: recon.reason });
    }

    await sb
      .from("products")
      .update({ stock: recon.next!.stock, unit_price: recon.next!.unit_price })
      .eq("id", update.productId);

    if (sync) {
      await sb
        .from("erp_syncs")
        .update({
          version: recon.next!.version,
          status: "synced",
          last_sync: new Date().toISOString(),
        })
        .eq("id", sync.id);
    }

    return NextResponse.json({ applied: true, version: recon.next!.version });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
