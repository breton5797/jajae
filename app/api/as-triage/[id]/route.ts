import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({ action: z.enum(["schedule", "reject", "reverse"]) });

function mapRpcError(message: string): { status: number; error: string } {
  if (/unauthorized/i.test(message)) return { status: 403, error: "권한이 없습니다." };
  if (/not found/i.test(message)) return { status: 404, error: "AS 요청을 찾을 수 없습니다." };
  if (/cannot reverse/i.test(message))
    return { status: 409, error: "진행/완료된 AS는 되돌릴 수 없습니다." };
  if (/no active resolution/i.test(message))
    return { status: 409, error: "되돌릴 처리 내역이 없습니다." };
  if (/not actionable/i.test(message)) return { status: 409, error: "이미 처리된 AS 요청입니다." };
  if (/not configured/i.test(message))
    return { status: 422, error: "AS 트리아지 정책이 없습니다." };
  return { status: 500, error: "처리 중 오류가 발생했습니다." };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { action } = parsed.data;
    if (action === "reverse") {
      const { error } = await sb.rpc("as_triage_reverse", { p_as_request_id: params.id });
      if (error) {
        const m = mapRpcError(error.message);
        return NextResponse.json({ error: m.error }, { status: m.status });
      }
      return NextResponse.json({ status: "reversed" });
    }

    const { error } = await sb.rpc("as_triage_admin_resolve", {
      p_as_request_id: params.id,
      p_decision: action,
    });
    if (error) {
      const m = mapRpcError(error.message);
      return NextResponse.json({ error: m.error }, { status: m.status });
    }
    return NextResponse.json({ status: action === "schedule" ? "scheduled" : "rejected" });
  } catch (e) {
    console.error("as-triage action failed:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
