import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Referral } from "@/lib/types";

export interface ReferralOverview {
  authed: boolean;
  referrals: Referral[];
  totalReward: number;
  rewardedCount: number;
}

const EMPTY: ReferralOverview = {
  authed: false,
  referrals: [],
  totalReward: 0,
  rewardedCount: 0,
};

export async function loadReferralOverview(): Promise<ReferralOverview> {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return EMPTY;

    const { data } = await sb
      .from("referrals")
      .select("*")
      .eq("inviter_id", user.id)
      .order("created_at", { ascending: false });
    const referrals = (data ?? []) as Referral[];
    const rewarded = referrals.filter((r) => r.status === "rewarded");
    return {
      authed: true,
      referrals,
      totalReward: rewarded.reduce((s, r) => s + r.reward, 0),
      rewardedCount: rewarded.length,
    };
  } catch {
    return EMPTY;
  }
}
