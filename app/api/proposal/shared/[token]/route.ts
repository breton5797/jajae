// app/api/proposal/shared/[token]/route.ts
import { NextResponse } from "next/server";
import { SharedAccessSchema } from "@/lib/proposal/schema";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { token: string } },
) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = SharedAccessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "비밀번호를 입력하세요." },
      { status: 400 },
    );
  }
  const sb = createServerSupabase();
  const { data, error } = await sb.rpc("get_shared_proposal", {
    p_token: params.token,
    p_password: parsed.data.password,
  });
  if (error || !data) {
    return NextResponse.json(
      { error: "비밀번호가 틀렸거나 만료된 링크입니다." },
      { status: 403 },
    );
  }
  return NextResponse.json(data);
}
