import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAuthedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const sb = createServerSupabase();
  const { data: row } = await sb
    .from("interior_estimates")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!row) {
    return NextResponse.json(
      { error: "견적서를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    id: row.id,
    contractorId: row.contractor_id,
    customerName: row.customer_name,
    transcript: row.transcript,
    brief: row.brief,
    floorPlan: row.floor_plan,
    bom: row.bom,
    totalKRW: row.total_krw,
    status: row.status,
    createdAt: row.created_at,
  });
}
