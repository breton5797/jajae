import { NextResponse } from "next/server";
import { SaveScenePayloadSchema } from "@/lib/studio/schema";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAuthedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 썸네일은 제안서와 동일한 공개 버킷을 재사용(소유자 폴더 RLS).
const SNAPSHOT_BUCKET = "proposal-snapshots";

/** 씬 스냅샷 dataURL을 Storage에 올리고 public URL 반환(실패 시 null, best-effort). */
async function uploadThumbnail(
  sb: ReturnType<typeof createServerSupabase>,
  ownerId: string,
  sceneId: string,
  snapshotDataUrl: string,
): Promise<string | null> {
  const b64 = snapshotDataUrl.replace(/^data:image\/\w+;base64,/, "");
  if (!b64) return null;
  const bytes = Buffer.from(b64, "base64");
  const path = `${ownerId}/studio-${sceneId}.png`;
  const { error } = await sb.storage
    .from(SNAPSHOT_BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: true });
  if (error) return null;
  return sb.storage.from(SNAPSHOT_BUCKET).getPublicUrl(path).data.publicUrl;
}

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
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
  }

  // 썸네일 업로드(best-effort) — 실패해도 저장 자체는 성공으로 둔다.
  let thumbnailUrl: string | null = null;
  if (parsed.data.snapshot) {
    thumbnailUrl = await uploadThumbnail(sb, user.id, data.id, parsed.data.snapshot);
    if (thumbnailUrl) {
      await sb.from("design_scenes").update({ thumbnail_url: thumbnailUrl }).eq("id", data.id);
    }
  }

  return NextResponse.json({ id: data.id, thumbnailUrl });
}
