import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Map an agent RPC error to a friendly status + message (no raw DB leak). */
function mapRpcError(message: string): { status: number; error: string } {
  if (/unauthorized/i.test(message)) return { status: 403, error: "권한이 없습니다." };
  if (/not found/i.test(message)) return { status: 404, error: "액션을 찾을 수 없습니다." };
  if (/already reversed/i.test(message)) return { status: 409, error: "이미 취소된 액션입니다." };
  if (/window passed/i.test(message)) return { status: 409, error: "취소 가능 시간이 지났습니다." };
  if (/dispatched/i.test(message)) return { status: 409, error: "이미 출고되어 취소할 수 없습니다." };
  return { status: 500, error: "처리 중 오류가 발생했습니다." };
}

/**
 * Reverse a reversible auto-PO within its window. The atomic RPC cancels the PO,
 * marks the action reversed, and records the reversed amount in the audit log so
 * the server-side spend gate frees the same room the DB trigger does.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { error } = await sb.rpc("agent_reverse_action", { p_action_id: params.id });
    if (error) {
      const m = mapRpcError(error.message);
      return NextResponse.json({ error: m.error }, { status: m.status });
    }
    return NextResponse.json({ reversed: true });
  } catch (e) {
    console.error("agent reverse failed:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
