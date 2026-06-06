/**
 * lib/groupbuy — 공동구매 tiered pricing & close. Pure; lib/types + utils.
 * closeGroupBuy returns per-contractor order INTENTS (the caller persists via
 * lib/orders) — no cross-module dependency.
 */
import type {
  GroupBuyCloseResult,
  GroupBuyOrderIntent,
  GroupBuyTier,
} from "@/lib/types";
import { won } from "@/lib/utils";

export function sortTiers(tiers: GroupBuyTier[]): GroupBuyTier[] {
  return [...tiers].sort((a, b) => a.minQty - b.minQty);
}

/** The lowest-price tier unlocked at a given aggregate quantity (null if below first). */
export function currentTier(
  joinedQty: number,
  tiers: GroupBuyTier[],
): GroupBuyTier | null {
  const sorted = sortTiers(tiers);
  let best: GroupBuyTier | null = null;
  for (const tier of sorted) {
    if (joinedQty >= tier.minQty) best = tier;
  }
  return best;
}

/** Effective unit price at an aggregate quantity (base = first tier if not yet unlocked). */
export function priceForQty(joinedQty: number, tiers: GroupBuyTier[]): number {
  const tier = currentTier(joinedQty, tiers);
  if (tier) return tier.unitPrice;
  const sorted = sortTiers(tiers);
  return sorted[0]?.unitPrice ?? 0;
}

export interface JoinState {
  contractorId: string;
  qty: number;
}

export interface ApplyJoinResult {
  joins: JoinState[];
  joinedQty: number;
  unitPrice: number;
  unlockedTier: GroupBuyTier | null;
}

/** Immutably add/replace a contractor's join and recompute aggregate + price. */
export function applyJoin(
  joins: JoinState[],
  contractorId: string,
  qty: number,
  tiers: GroupBuyTier[],
): ApplyJoinResult {
  const others = joins.filter((j) => j.contractorId !== contractorId);
  const next =
    qty > 0 ? [...others, { contractorId, qty }] : others;
  const joinedQty = next.reduce((s, j) => s + j.qty, 0);
  return {
    joins: next,
    joinedQty,
    unitPrice: priceForQty(joinedQty, tiers),
    unlockedTier: currentTier(joinedQty, tiers),
  };
}

/**
 * Close a campaign. min met → per-contractor orders at the final tier price;
 * min not met → cancelled (caller refunds any holds).
 */
export function closeGroupBuy(
  campaign: { minQty: number; tiers: GroupBuyTier[] },
  joins: JoinState[],
): GroupBuyCloseResult {
  // Aggregate by contractor (defensive against duplicates).
  const byContractor = new Map<string, number>();
  for (const j of joins) {
    byContractor.set(j.contractorId, (byContractor.get(j.contractorId) ?? 0) + j.qty);
  }
  const totalQty = [...byContractor.values()].reduce((s, q) => s + q, 0);

  if (totalQty < campaign.minQty) {
    return {
      status: "cancelled",
      finalUnitPrice: null,
      totalQty,
      reason: `최소 수량(${campaign.minQty}) 미달로 자동 취소되었습니다.`,
      orders: [],
    };
  }

  const finalUnitPrice = priceForQty(totalQty, campaign.tiers);
  const orders: GroupBuyOrderIntent[] = [...byContractor.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([contractorId, qty]) => ({
      contractorId,
      qty,
      unitPrice: finalUnitPrice,
      amount: won(finalUnitPrice * qty),
    }));

  return { status: "closed", finalUnitPrice, totalQty, orders };
}
