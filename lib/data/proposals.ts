// lib/data/proposals.ts
import { createServerSupabase } from "@/lib/supabase/server";

export interface InsertProposalArgs {
  estimateId: string;
  contractorId: string;
  customerName?: string;
  templateId: string;
  finishes: unknown;
  materialsKRW: number;
  constructionKRW: number;
  totalKRW: number;
}

export async function insertProposalRow(
  a: InsertProposalArgs,
): Promise<string | null> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("proposals")
    .insert({
      estimate_id: a.estimateId,
      contractor_id: a.contractorId,
      customer_name: a.customerName ?? null,
      template_id: a.templateId,
      finishes: a.finishes,
      materials_krw: a.materialsKRW,
      construction_krw: a.constructionKRW,
      total_krw: a.totalKRW,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id as string;
}

export async function getProposalRow(id: string) {
  const sb = createServerSupabase();
  const { data } = await sb.from("proposals").select("*").eq("id", id).single();
  return data;
}

const SNAPSHOT_BUCKET = "proposal-snapshots";

/** 3D 스냅샷 dataURL을 Storage에 올리고 public URL 반환(실패 시 null, best-effort). */
async function uploadSnapshot(
  sb: ReturnType<typeof createServerSupabase>,
  contractorId: string,
  id: string,
  snapshotDataUrl: string,
): Promise<string | null> {
  const b64 = snapshotDataUrl.replace(/^data:image\/\w+;base64,/, "");
  if (!b64) return null;
  const bytes = Buffer.from(b64, "base64");
  const path = `${contractorId}/${id}.png`;
  const { error } = await sb.storage
    .from(SNAPSHOT_BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: true });
  if (error) return null;
  return sb.storage.from(SNAPSHOT_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function shareProposalRow(
  id: string,
  contractorId: string,
  password: string,
  expiresInDays: number,
  snapshotDataUrl?: string,
): Promise<{ token: string; expiresAt: string } | null> {
  const sb = createServerSupabase();

  // 3D 스냅샷 업로드(best-effort) → snapshot_url 갱신. 실패해도 공유는 진행.
  if (snapshotDataUrl) {
    const url = await uploadSnapshot(sb, contractorId, id, snapshotDataUrl);
    if (url) {
      await sb
        .from("proposals")
        .update({ snapshot_url: url })
        .eq("id", id)
        .eq("contractor_id", contractorId);
    }
  }

  const token = globalThis.crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(
    Date.now() + expiresInDays * 86400000,
  ).toISOString();
  // 비번 해시는 DB의 crypt() 사용 — RPC로 처리
  const { error } = await sb.rpc("set_proposal_share", {
    p_id: id,
    p_owner: contractorId,
    p_token: token,
    p_password: password,
    p_expires: expiresAt,
  });
  if (error) return null;
  return { token, expiresAt };
}
