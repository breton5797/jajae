import { NextResponse } from "next/server";
import { batchPosIntoRuns } from "@/lib/logistics";
import { getAuthedUser } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase/server";
import { loadOpenPosForBatching } from "@/lib/data/logistics";

export const dynamic = "force-dynamic";

/** Admin: propose + persist batched delivery runs from open POs. */
export async function POST() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  try {
    const openPos = await loadOpenPosForBatching();
    const runs = batchPosIntoRuns(openPos);
    const sb = createServiceSupabase();

    let created = 0;
    for (const run of runs) {
      const { data: row } = await sb
        .from("delivery_runs")
        .insert({
          region: run.region,
          run_date: run.date,
          route: { stops: run.stops },
          status: "planned",
        })
        .select("id")
        .single();
      if (!row) continue;
      created += 1;
      for (const stop of run.stops) {
        await sb
          .from("run_pos")
          .insert({ run_id: row.id, po_id: stop.poId, sequence: stop.sequence });
      }
    }

    return NextResponse.json({ created, runs });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
