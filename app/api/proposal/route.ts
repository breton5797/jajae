import { NextResponse } from "next/server";
import { ProposalInputSchema } from "@/lib/proposal/schema";
import { buildProposal } from "@/lib/proposal";
import { fetchFinishCatalog } from "@/lib/data/finish-materials";
import { insertProposalRow } from "@/lib/data/proposals";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAuthedUser } from "@/lib/auth";
import type { Category, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = ProposalInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { brief, customerName } = parsed.data;
  const sb = createServerSupabase();
  const [{ data: cats }, { data: prods }, finishes] = await Promise.all([
    sb.from("categories").select("*"),
    sb.from("products").select("*").eq("status", "approved"),
    fetchFinishCatalog(),
  ]);

  const built = await buildProposal(brief, {
    categories: (cats ?? []) as Category[],
    products: (prods ?? []) as Product[],
    finishes,
  }).catch((): null => null);
  if (!built) {
    return NextResponse.json(
      { error: "제안 생성에 실패했습니다." },
      { status: 422 },
    );
  }

  // 기반 견적 저장(0016) → estimate_id 확보
  const { data: est, error: estErr } = await sb
    .from("interior_estimates")
    .insert({
      contractor_id: user.id,
      customer_name: customerName ?? null,
      transcript: "",
      brief,
      floor_plan: {
        rooms: built.template.rooms,
        widthM: built.furnishedScene.widthM,
        lengthM: built.furnishedScene.lengthM,
      },
      bom: built.bom,
      total_krw: built.totalKRW,
      status: "draft",
    })
    .select("id")
    .single();
  if (estErr || !est) {
    return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
  }

  const proposalId = await insertProposalRow({
    estimateId: est.id,
    contractorId: user.id,
    customerName,
    templateId: built.template.id,
    finishes: built.finishes,
    materialsKRW: built.materialsKRW,
    constructionKRW: built.constructionKRW,
    totalKRW: built.totalKRW,
  });
  if (!proposalId) {
    return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({
    proposalId,
    template: built.template,
    finishes: built.finishes,
    floorPlanSvg: built.floorPlanSvg,
    furnishedScene: built.furnishedScene,
    materialsKRW: built.materialsKRW,
    constructionKRW: built.constructionKRW,
    totalKRW: built.totalKRW,
  });
}
