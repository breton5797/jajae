import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({
  clientId: z.string().uuid(),
  event: z.enum(["order.created", "po.fulfilled", "settlement.closed"]),
  url: z.string().url(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "웹훅 정보가 올바르지 않습니다." }, { status: 400 });

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const secret = `whsec_${randomBytes(16).toString("hex")}`;
    // RLS (webhooks_all via owns_api_client) ensures only the owning partner can insert.
    const { data, error } = await sb
      .from("webhooks")
      .insert({
        client_id: parsed.data.clientId,
        event: parsed.data.event,
        url: parsed.data.url,
        secret,
      })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: "생성 실패" }, { status: 500 });
    return NextResponse.json({ id: data.id, secret });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
