/**
 * E-tax invoice (전자세금계산서) issuance via Popbill. Real call when configured;
 * deterministic mock otherwise. Failures return a retryable error so the caller
 * can queue/retry (tax_invoices.status = 'failed').
 */
import { popbillConfigured, popbillLinkId, popbillSecretKey } from "@/lib/env";
import { type Result, ok, err } from "@/lib/utils";

export interface IssueInvoiceInput {
  settlementId: string;
  contractorBizNo: string;
  supplyAmount: number; // 공급가액
  taxAmount: number; // 세액 (VAT 10%)
  itemName: string;
}

export interface IssuedInvoice {
  provider: string;
  providerInvoiceId: string;
  status: "issued";
  pdfUrl: string;
  mock: boolean;
}

/** Split a VAT-inclusive total into supply + tax (10% VAT, Korea). */
export function splitVat(totalInclusive: number): {
  supply: number;
  tax: number;
} {
  const supply = Math.round(totalInclusive / 1.1);
  return { supply, tax: totalInclusive - supply };
}

const POPBILL_URL = "https://popbill.linkhub.co.kr/Taxinvoice/Issue";

export async function issueTaxInvoice(
  input: IssueInvoiceInput,
  now: string,
): Promise<Result<IssuedInvoice>> {
  if (!popbillConfigured()) {
    // Mock issuance — deterministic, no network.
    return ok({
      provider: "popbill-mock",
      providerInvoiceId: `MOCK-${input.settlementId.slice(0, 8)}-${now.slice(0, 10)}`,
      status: "issued",
      pdfUrl: `https://example.invalid/invoices/${input.settlementId}.pdf`,
      mock: true,
    });
  }

  try {
    const res = await fetch(POPBILL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pb-link-id": popbillLinkId() ?? "",
        Authorization: `Bearer ${popbillSecretKey() ?? ""}`,
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      return err(`전자세금계산서 발행 실패 (${res.status})`);
    }
    const data = (await res.json()) as { ntsConfirmNum?: string; url?: string };
    return ok({
      provider: "popbill",
      providerInvoiceId: data.ntsConfirmNum ?? `PB-${input.settlementId.slice(0, 8)}`,
      status: "issued",
      pdfUrl: data.url ?? "",
      mock: false,
    });
  } catch (e) {
    return err(`전자세금계산서 발행 오류: ${(e as Error).message}`);
  }
}
