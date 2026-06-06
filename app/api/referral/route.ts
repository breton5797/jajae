import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Create a referral invite code for the current contractor. */
export async function POST() {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const code = `INV-${user.id.slice(0, 6).toUpperCase()}-${crypto
      .randomUUID()
      .slice(0, 6)
      .toUpperCase()}`;

    const { data, error } = await sb
      .from("referrals")
      .insert({ inviter_id: user.id, code, status: "invited" })
      .select("code")
      .single();
    if (error || !data) return NextResponse.json({ error: "초대 코드 생성 실패" }, { status: 500 });
    return NextResponse.json({ code: data.code });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
