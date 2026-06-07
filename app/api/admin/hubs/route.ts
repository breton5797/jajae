import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("hub"),
    name: z.string().min(1),
    location: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    capacity: z.number().int().nonnegative().optional(),
  }),
  z.object({
    action: z.literal("inventory"),
    hubId: z.string().uuid(),
    productId: z.string().uuid(),
    qty: z.number().int().nonnegative(),
  }),
]);

export async function POST(req: Request) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "허브 정보가 올바르지 않습니다." }, { status: 400 });

  try {
    const sb = createServiceSupabase();
    if (parsed.data.action === "hub") {
      const { data, error } = await sb
        .from("hubs")
        .insert({
          name: parsed.data.name,
          location: parsed.data.location ?? "",
          lat: parsed.data.lat ?? null,
          lng: parsed.data.lng ?? null,
          capacity: parsed.data.capacity ?? 0,
        })
        .select("id")
        .single();
      if (error || !data) return NextResponse.json({ error: "허브 생성 실패" }, { status: 500 });
      return NextResponse.json({ id: data.id });
    }
    await sb.from("hub_inventory").upsert(
      { hub_id: parsed.data.hubId, product_id: parsed.data.productId, qty: parsed.data.qty },
      { onConflict: "hub_id,product_id" },
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
