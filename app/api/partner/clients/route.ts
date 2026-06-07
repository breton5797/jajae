import { NextResponse } from "next/server";
import { z } from "zod";
import { generateApiKey, API_SCOPES } from "@/lib/openapi";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.enum(API_SCOPES)).min(1),
  rateLimit: z.number().int().positive().optional(),
});

/** Create an API client; returns the plaintext key ONCE (store only the hash). */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "클라이언트 정보가 올바르지 않습니다." }, { status: 400 });

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const pair = generateApiKey();
    const { data, error } = await sb
      .from("api_clients")
      .insert({
        partner_id: user.id,
        name: parsed.data.name,
        key_hash: pair.hash,
        key_prefix: pair.prefix,
        scopes: parsed.data.scopes,
        rate_limit: parsed.data.rateLimit ?? 1000,
      })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: "생성 실패" }, { status: 500 });

    // key returned once — never retrievable again
    return NextResponse.json({ id: data.id, apiKey: pair.key, prefix: pair.prefix });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
