import { NextResponse } from "next/server";
import { z } from "zod";
import { isValidBizNo, formatBizNo } from "@/lib/utils";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({ bizNo: z.string().min(10) });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "사업자번호를 입력하세요." }, { status: 400 });
  }

  if (!isValidBizNo(parsed.data.bizNo)) {
    return NextResponse.json(
      { ok: false, error: "유효하지 않은 사업자등록번호입니다." },
      { status: 422 },
    );
  }

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const { error } = await sb
      .from("profiles")
      .update({
        biz_no: formatBizNo(parsed.data.bizNo),
        biz_status: "verified",
      })
      .eq("id", user.id);
    if (error) {
      return NextResponse.json({ error: "인증 처리 실패" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, bizNo: formatBizNo(parsed.data.bizNo) });
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
