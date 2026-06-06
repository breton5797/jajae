import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadSitesWithBudget } from "@/lib/data/projects";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await loadSitesWithBudget();
  return NextResponse.json(data);
}

const CreateSiteSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  budget: z.number().nonnegative().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = CreateSiteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "현장 정보가 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const { data, error } = await sb
      .from("sites")
      .insert({
        contractor_id: user.id,
        name: parsed.data.name,
        address: parsed.data.address ?? "",
        budget: parsed.data.budget ?? 0,
        start_date: parsed.data.start_date ?? null,
        end_date: parsed.data.end_date ?? null,
      })
      .select("id")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "현장 생성 실패" }, { status: 500 });
    }
    return NextResponse.json({ id: data.id });
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
