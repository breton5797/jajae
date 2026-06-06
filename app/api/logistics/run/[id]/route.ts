import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({
  status: z.enum(["planned", "confirmed", "dispatched", "completed"]),
});

const TRACK: Record<string, string | null> = {
  dispatched: "dispatched",
  completed: "delivered",
};

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (user.role !== "admin" && user.role !== "supplier")
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "상태가 올바르지 않습니다." }, { status: 400 });

  try {
    const sb = createServiceSupabase();
    await sb
      .from("delivery_runs")
      .update({ status: parsed.data.status })
      .eq("id", params.id);

    // propagate per-PO tracking status to the contractor dashboard/site timeline
    const track = TRACK[parsed.data.status];
    if (track) {
      const { data: rps } = await sb
        .from("run_pos")
        .select("po_id")
        .eq("run_id", params.id);
      const poIds = ((rps ?? []) as Array<{ po_id: string }>).map((r) => r.po_id);
      if (poIds.length > 0) {
        await sb.from("purchase_orders").update({ track_status: track }).in("id", poIds);
        if (track === "delivered") {
          await sb
            .from("deliveries")
            .update({ status: "delivered" })
            .in("po_id", poIds);
        } else {
          await sb
            .from("deliveries")
            .update({ status: "in_transit" })
            .in("po_id", poIds);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
