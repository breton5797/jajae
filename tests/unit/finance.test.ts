import { describe, it, expect } from "vitest";
import {
  buildMonthlySettlement,
  creditStatus,
  canPlaceCreditOrder,
  applyCreditCharge,
  applyCreditPayment,
  isOverdue,
} from "@/lib/finance";
import { splitVat } from "@/lib/finance/popbill";
import type { CreditAccount } from "@/lib/types";

describe("buildMonthlySettlement", () => {
  it("aggregates delivered orders into gross/fee/net", () => {
    const r = buildMonthlySettlement("2026-05", [
      { id: "o1", subtotal: 1_000_000, platform_fee: 30_000, total: 1_030_000 },
      { id: "o2", subtotal: 500_000, platform_fee: 15_000, total: 515_000 },
    ]);
    expect(r.gross).toBe(1_500_000);
    expect(r.fee).toBe(45_000);
    expect(r.net).toBe(1_545_000);
    expect(r.orderIds).toEqual(["o1", "o2"]);
  });
});

function account(over: Partial<CreditAccount>): CreditAccount {
  return {
    id: "ca",
    contractor_id: "c",
    limit_amount: over.limit_amount ?? 10_000_000,
    used_amount: over.used_amount ?? 0,
    overdue_amount: over.overdue_amount ?? 0,
    due_date: over.due_date ?? null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("credit ledger", () => {
  it("reports available and blocks on overdue", () => {
    const s = creditStatus(account({ used_amount: 4_000_000, overdue_amount: 1_000_000 }));
    expect(s.available).toBe(6_000_000);
    expect(s.blocked).toBe(true);
    expect(s.reason).toContain("연체");
  });

  it("blocks when limit is fully used", () => {
    const s = creditStatus(account({ used_amount: 10_000_000 }));
    expect(s.blocked).toBe(true);
    expect(s.available).toBe(0);
  });

  it("canPlaceCreditOrder enforces overdue then limit", () => {
    expect(canPlaceCreditOrder(account({ overdue_amount: 1 }), 100).ok).toBe(false);
    expect(canPlaceCreditOrder(account({ used_amount: 9_000_000 }), 2_000_000).ok).toBe(false);
    const okRes = canPlaceCreditOrder(account({ used_amount: 1_000_000 }), 2_000_000);
    expect(okRes.ok).toBe(true);
    if (okRes.ok) expect(okRes.value.remaining).toBe(7_000_000);
  });

  it("charges and pays immutably; payment clears overdue first", () => {
    const a = account({ used_amount: 5_000_000, overdue_amount: 1_000_000 });
    const charged = applyCreditCharge(a, 2_000_000);
    expect(charged.used_amount).toBe(7_000_000);
    expect(a.used_amount).toBe(5_000_000); // original unchanged

    const paid = applyCreditPayment(a, 1_500_000);
    expect(paid.overdue_amount).toBe(0);
    expect(paid.used_amount).toBe(4_500_000); // 500k after clearing 1M overdue
  });

  it("isOverdue compares due date and outstanding usage", () => {
    expect(isOverdue({ due_date: "2026-05-31", used_amount: 100 }, "2026-06-07")).toBe(true);
    expect(isOverdue({ due_date: "2026-06-30", used_amount: 100 }, "2026-06-07")).toBe(false);
    expect(isOverdue({ due_date: "2026-05-31", used_amount: 0 }, "2026-06-07")).toBe(false);
  });
});

describe("splitVat", () => {
  it("splits a VAT-inclusive total into supply + 10% tax", () => {
    const { supply, tax } = splitVat(1_100_000);
    expect(supply).toBe(1_000_000);
    expect(tax).toBe(100_000);
    expect(supply + tax).toBe(1_100_000);
  });
});
