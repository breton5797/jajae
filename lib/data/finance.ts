import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { creditStatus } from "@/lib/finance";
import type {
  ContractorSettlement,
  CreditAccount,
  CreditStatus,
  TaxInvoice,
} from "@/lib/types";

export interface FinanceOverview {
  authed: boolean;
  credit: CreditStatus | null;
  settlements: ContractorSettlement[];
  invoices: TaxInvoice[];
}

const EMPTY: FinanceOverview = {
  authed: false,
  credit: null,
  settlements: [],
  invoices: [],
};

export async function loadFinanceOverview(): Promise<FinanceOverview> {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return EMPTY;

    const [{ data: account }, { data: settlements }, { data: invoices }] =
      await Promise.all([
        sb.from("credit_accounts").select("*").eq("contractor_id", user.id).maybeSingle(),
        sb
          .from("contractor_settlements")
          .select("*")
          .order("period", { ascending: false }),
        sb.from("tax_invoices").select("*"),
      ]);

    return {
      authed: true,
      credit: account ? creditStatus(account as CreditAccount) : null,
      settlements: (settlements ?? []) as ContractorSettlement[],
      invoices: (invoices ?? []) as TaxInvoice[],
    };
  } catch {
    return EMPTY;
  }
}
