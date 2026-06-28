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

export async function shareProposalRow(
  id: string,
  contractorId: string,
  password: string,
  expiresInDays: number,
): Promise<{ token: string; expiresAt: string } | null> {
  const sb = createServerSupabase();
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
