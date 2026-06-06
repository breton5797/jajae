import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({
  type: z.enum(["thread", "qna", "notice"]).default("thread"),
  title: z.string().min(1),
  body: z.string().default(""),
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
    return NextResponse.json({ error: "제목을 입력하세요." }, { status: 400 });

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { data, error } = await sb
      .from("community_posts")
      .insert({
        contractor_id: user.id,
        type: parsed.data.type,
        title: parsed.data.title,
        body: parsed.data.body,
      })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: "작성 실패" }, { status: 500 });
    return NextResponse.json({ id: data.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
