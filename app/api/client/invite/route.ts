import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({
  siteId: z.string().uuid(),
  clientUserId: z.string().uuid(),
  role: z.enum(["viewer", "selector"]).default("viewer"),
});

/** Contractor invites an (already-registered) end client to a project. */
export async function POST(req: Request) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (user.role !== "contractor" && user.role !== "admin")
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "초대 정보가 올바르지 않습니다." }, { status: 400 });

  try {
    const sb = createServerSupabase();
    // RLS (projclients_write) ensures only the site-owning contractor/admin can insert.
    const { error } = await sb.from("project_clients").upsert(
      {
        site_id: parsed.data.siteId,
        client_user_id: parsed.data.clientUserId,
        role: parsed.data.role,
      },
      { onConflict: "site_id,client_user_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
