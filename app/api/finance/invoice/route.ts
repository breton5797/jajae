import { NextResponse } from "next/server";
import { z } from "zod";
import { issueTaxInvoice, splitVat } from "@/lib/finance/popbill";
import { getAuthedUser } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase/server";
import type { ContractorSettlement } from "@/lib/types";

export const dynamic = "force-dynamic";

const Schema = z.object({ settlementId: z.string().uuid() });

export async function POST(req: Request) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "정산 ID가 필요합니다." }, { status: 400 });

  try {
    const sb = createServiceSupabase();
    const { data: settlement } = await sb
      .from("contractor_settlements")
      .select("*")
      .eq("id", parsed.data.settlementId)
      .maybeSingle();
    if (!settlement)
      return NextResponse.json({ error: "정산 내역을 찾을 수 없습니다." }, { status: 404 });

    const s = settlement as ContractorSettlement;
    const { data: profile } = await sb
      .from("profiles")
      .select("biz_no")
      .eq("id", s.contractor_id)
      .maybeSingle();
    const { supply, tax } = splitVat(s.net);

    const issued = await issueTaxInvoice(
      {
        settlementId: s.id,
        contractorBizNo: (profile?.biz_no as string) ?? "",
        supplyAmount: supply,
        taxAmount: tax,
        itemName: `${s.period} 자재 정산`,
      },
      new Date().toISOString(),
    );

    const status = issued.ok ? "issued" : "failed";
    await sb.from("tax_invoices").insert({
      settlement_id: s.id,
      provider: issued.ok ? issued.value.provider : "popbill",
      provider_invoice_id: issued.ok ? issued.value.providerInvoiceId : null,
      status,
      pdf_url: issued.ok ? issued.value.pdfUrl : null,
    });

    if (!issued.ok) {
      return NextResponse.json({ error: issued.error, status }, { status: 502 });
    }
    return NextResponse.json({ status, invoice: issued.value });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
