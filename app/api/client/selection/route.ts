import { NextResponse } from "next/server";
import { z } from "zod";
import { validateOptionSet } from "@/lib/client-portal";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ClientSelectionOption } from "@/lib/types";

export const dynamic = "force-dynamic";

const Schema = z.object({
  siteId: z.string().uuid(),
  title: z.string().min(1),
  optionSet: z
    .array(
      z.object({
        id: z.string(),
        productId: z.string().uuid(),
        label: z.string().min(1),
        unitPrice: z.number().nonnegative(),
        imageUrl: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .min(1),
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
    return NextResponse.json({ error: "옵션 정보가 올바르지 않습니다." }, { status: 400 });

  const check = validateOptionSet(parsed.data.optionSet as ClientSelectionOption[]);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 422 });

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    // RLS (clientsel_cwrite) ensures only the site-owning contractor can insert.
    const { data, error } = await sb
      .from("client_selections")
      .insert({
        site_id: parsed.data.siteId,
        title: parsed.data.title,
        option_set: parsed.data.optionSet,
        status: "open",
      })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: "생성 실패" }, { status: 500 });
    return NextResponse.json({ id: data.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
