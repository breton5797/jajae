import { NextResponse } from "next/server";
import { buildReorderDraft } from "@/lib/forecast";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadReorderOverview } from "@/lib/data/forecast";

export const dynamic = "force-dynamic";

/** One-click: turn reorder suggestions into draft cart lines for approval. */
export async function POST() {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const overview = await loadReorderOverview();
    const draft = buildReorderDraft(overview.rows);
    for (const line of draft) {
      await sb.from("cart_items").upsert(
        { contractor_id: user.id, product_id: line.productId, qty: line.qty },
        { onConflict: "contractor_id,product_id" },
      );
    }
    return NextResponse.json({ added: draft.length, lines: draft });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
