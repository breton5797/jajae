import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase/server";
import { loadLiveAnalytics } from "@/lib/data/analytics";

export const dynamic = "force-dynamic";

const Schema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });

/** Owner/admin: compute + persist an analytics snapshot for a period. */
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
    return NextResponse.json({ error: "기간 형식이 올바르지 않습니다." }, { status: 400 });

  try {
    const a = await loadLiveAnalytics(parsed.data.period);
    const sb = createServiceSupabase();
    await sb.from("analytics_snapshots").upsert(
      {
        period: a.period,
        gmv: a.gmv,
        margin: a.margin,
        pb_share: a.pbShare,
        repeat_rate: a.repeatRate,
        forecast_accuracy: a.forecastAccuracy,
        data: { supplierPerf: a.supplierPerf },
      },
      { onConflict: "period" },
    );
    return NextResponse.json(a);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
