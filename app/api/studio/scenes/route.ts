import { NextResponse } from "next/server";
import { SaveScenePayloadSchema } from "@/lib/studio/schema";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAuthedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 본인 씬 목록(최근순). RLS가 소유자 행만 반환. */
export async function GET() {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const sb = createServerSupabase();
  const { data } = await sb
    .from("design_scenes")
    .select("id, name, domain, thumbnail_url, created_at")
    .order("created_at", { ascending: false });

  return NextResponse.json({ scenes: data ?? [] });
}

/** 씬 저장(본인 소유). RLS with check가 owner_id = 본인을 강제. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = SaveScenePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });
  }

  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("design_scenes")
    .insert({
      owner_id: user.id,
      domain: parsed.data.domain,
      name: parsed.data.name,
      scene: parsed.data.scene,
      thumbnail_url: parsed.data.thumbnailUrl ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
