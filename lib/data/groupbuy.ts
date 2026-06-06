import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { priceForQty } from "@/lib/groupbuy";
import type { GroupBuy, GroupBuyJoin, GroupBuyTier } from "@/lib/types";

function asTiers(raw: unknown): GroupBuyTier[] {
  return Array.isArray(raw) ? (raw as GroupBuyTier[]) : [];
}

export interface GroupBuyView extends GroupBuy {
  currentPrice: number;
  basePrice: number;
}

function toView(gb: GroupBuy): GroupBuyView {
  const tiers = asTiers(gb.tiers);
  return {
    ...gb,
    tiers,
    currentPrice: priceForQty(gb.joined_qty, tiers),
    basePrice: tiers[0]?.unitPrice ?? 0,
  };
}

export async function loadGroupBuys(): Promise<GroupBuyView[]> {
  try {
    const sb = createServerSupabase();
    const { data } = await sb
      .from("group_buys")
      .select("*")
      .order("created_at", { ascending: false });
    return ((data ?? []) as GroupBuy[]).map(toView);
  } catch {
    return [];
  }
}

export interface GroupBuyDetail {
  groupBuy: GroupBuyView | null;
  myJoin: GroupBuyJoin | null;
  joinCount: number;
}

export async function loadGroupBuy(id: string): Promise<GroupBuyDetail> {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();

    const { data: gb } = await sb
      .from("group_buys")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!gb) return { groupBuy: null, myJoin: null, joinCount: 0 };

    const { data: joins } = await sb
      .from("group_buy_joins")
      .select("*")
      .eq("group_buy_id", id);
    const joinRows = (joins ?? []) as GroupBuyJoin[];

    return {
      groupBuy: toView(gb as GroupBuy),
      myJoin: user ? joinRows.find((j) => j.contractor_id === user.id) ?? null : null,
      joinCount: joinRows.length,
    };
  } catch {
    return { groupBuy: null, myJoin: null, joinCount: 0 };
  }
}
