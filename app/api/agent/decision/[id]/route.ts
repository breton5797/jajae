import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({ action: z.enum(["approve", "reject"]) });

/** Map an agent RPC error to a friendly status + message (no raw DB leak). */
function mapRpcError(message: string): { status: number; error: string } {
  if (/unauthorized/i.test(message)) return { status: 403, error: "권한이 없습니다." };
  if (/not found/i.test(message)) return { status: 404, error: "결정을 찾을 수 없습니다." };
  if (/not actionable/i.test(message)) return { status: 409, error: "이미 처리된 결정입니다." };
  if (/spend_cap/i.test(message))
    return { status: 422, error: "지출 한도를 초과합니다. 한도를 올리거나 수동 발주하세요." };
  if (/not configured/i.test(message))
    return { status: 422, error: "자율 운영 정책이 없습니다." };
  if (/max_po|allowlist|kill-switch/i.test(message))
    return { status: 422, error: "정책 위반으로 실행할 수 없습니다." };
  return { status: 500, error: "처리 중 오류가 발생했습니다." };
}

/**
 * Human-in-the-loop: approve (execute) or reject an escalated agent decision.
 * Delegates to the atomic plpgsql RPCs so the whole order+PO+action either
 * commits together or rolls back (no orphan rows, no bricked decision).
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    if (parsed.data.action === "reject") {
      const { error } = await sb.rpc("agent_reject_decision", { p_decision_id: params.id });
      if (error) {
        const m = mapRpcError(error.message);
        return NextResponse.json({ error: m.error }, { status: m.status });
      }
      return NextResponse.json({ status: "rejected" });
    }

    const { data, error } = await sb.rpc("agent_approve_decision", {
      p_decision_id: params.id,
      p_reversible_until: new Date(Date.now() + 86_400_000).toISOString(),
    });
    if (error) {
      const m = mapRpcError(error.message);
      return NextResponse.json({ error: m.error }, { status: m.status });
    }
    return NextResponse.json({ status: "approved", poId: data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
