import { NextResponse } from "next/server";
import { z } from "zod";
import { applyClientChoice } from "@/lib/client-portal";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ClientSelection, ClientSelectionOption } from "@/lib/types";

export const dynamic = "force-dynamic";

const Schema = z.object({ chosen: z.array(z.string()) });

/** Invited client records their material choice (RLS scopes to invited sites). */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "선택 정보가 올바르지 않습니다." }, { status: 400 });

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { data: sel } = await sb
      .from("client_selections")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (!sel) return NextResponse.json({ error: "선택지를 찾을 수 없습니다." }, { status: 404 });

    const selection = sel as ClientSelection;
    const result = applyClientChoice(
      { option_set: selection.option_set as ClientSelectionOption[] },
      parsed.data.chosen,
    );

    const { error } = await sb
      .from("client_selections")
      .update({ chosen: result.chosen, status: result.status })
      .eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ status: result.status, chosen: result.chosen });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
