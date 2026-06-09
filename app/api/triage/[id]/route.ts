import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({ action: z.enum(["approve", "reject", "reverse"]) });

/** 트리아지 RPC 에러를 친화 상태/메시지로 매핑(원문 DB 누출 방지). */
function mapRpcError(message: string): { status: number; error: string } {
  if (/unauthorized/i.test(message)) return { status: 403, error: "권한이 없습니다." };
  if (/not found/i.test(message)) return { status: 404, error: "반품을 찾을 수 없습니다." };
  if (/already completed/i.test(message))
    return { status: 409, error: "완료된 반품은 되돌릴 수 없습니다." };
  if (/no active resolution/i.test(message))
    return { status: 409, error: "되돌릴 처리 내역이 없습니다." };
  if (/not actionable/i.test(message)) return { status: 409, error: "이미 처리된 반품입니다." };
  if (/not configured/i.test(message))
    return { status: 422, error: "트리아지 정책이 없습니다." };
  return { status: 500, error: "처리 중 오류가 발생했습니다." };
}

/** 사람 개입: escalate된(또는 requested) 반품을 관리자가 승인/거부/가역. */
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
      const { error } = await sb.rpc("triage_reverse_resolution", { p_return_id: params.id });
      if (error) {
        const m = mapRpcError(error.message);
        return NextResponse.json({ error: m.error }, { status: m.status });
      }
      return NextResponse.json({ status: "reversed" });
    }

    const { error } = await sb.rpc("triage_admin_resolve_return", {
      p_return_id: params.id,
      p_decision: action,
    });
    if (error) {
      const m = mapRpcError(error.message);
      return NextResponse.json({ error: m.error }, { status: m.status });
    }
    return NextResponse.json({ status: action === "approve" ? "approved" : "rejected" });
  } catch (e) {
    console.error("triage action failed:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
