import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAuthedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 단건 로드(본인 소유). RLS가 타인 행을 숨김 → 없으면 404. */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const sb = createServerSupabase();
  const { data: row } = await sb
    .from("design_scenes")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "씬을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    id: row.id,
    name: row.name,
    domain: row.domain,
    scene: row.scene,
    thumbnailUrl: row.thumbnail_url,
    createdAt: row.created_at,
  });
}

/** 본인 씬 삭제. RLS가 타인 행 삭제를 무효화. */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const sb = createServerSupabase();
  const { error } = await sb.from("design_scenes").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
