import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({
  spendCap: z.number().nonnegative(),
  supplierAllowlist: z.array(z.string()),
  maxPo: z.number().nonnegative(),
  escalationThreshold: z.number().nonnegative(),
  enabled: z.boolean(),
});

/** Upsert the contractor's autonomy policy (incl. kill-switch via `enabled`). */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "정책 값이 올바르지 않습니다." }, { status: 400 });

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { error } = await sb.from("agent_policies").upsert(
      {
        contractor_id: user.id,
        spend_cap: parsed.data.spendCap,
        supplier_allowlist: parsed.data.supplierAllowlist,
        max_po: parsed.data.maxPo,
        escalation_threshold: parsed.data.escalationThreshold,
        enabled: parsed.data.enabled,
      },
      { onConflict: "contractor_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Kill-switch toggle (PATCH enabled). */
export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = z.object({ enabled: z.boolean() }).safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    await sb
      .from("agent_policies")
      .update({ enabled: parsed.data.enabled })
      .eq("contractor_id", user.id);
    return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
