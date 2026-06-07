import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { scoreToFinanceOffer } from "@/lib/scoring";
import type {
  CreditScore,
  FinanceOffer,
  FinanceRequest,
  ScoreResult,
} from "@/lib/types";

export interface FinancingOverview {
  authed: boolean;
  score: CreditScore | null;
  offer: FinanceOffer | null;
  requests: FinanceRequest[];
}

const EMPTY: FinancingOverview = {
  authed: false,
  score: null,
  offer: null,
  requests: [],
};

export async function loadFinancingOverview(): Promise<FinancingOverview> {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return EMPTY;

    const [{ data: scoreRow }, { data: requests }] = await Promise.all([
      sb.from("credit_scores").select("*").eq("contractor_id", user.id).maybeSingle(),
      sb
        .from("finance_requests")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    const score = (scoreRow as CreditScore) ?? null;
    const offer = score
      ? scoreToFinanceOffer({
          score: score.score,
          grade: score.grade as ScoreResult["grade"],
          factors: score.factors,
          coldStart: score.grade === "NEW",
        })
      : null;

    return {
      authed: true,
      score,
      offer,
      requests: (requests ?? []) as FinanceRequest[],
    };
  } catch {
    return EMPTY;
  }
}
