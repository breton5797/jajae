import { describe, it, expect } from "vitest";
import {
  computeSettlement,
  holdEscrow,
  releaseEscrow,
  refundEscrow,
  canUseCredit,
  applyCreditUsage,
  buildCreditInvoice,
} from "@/lib/settlement";

describe("computeSettlement", () => {
  it("keeps gross - fee = net (supplier payout = subtotal)", () => {
    const s = computeSettlement(1_000_000, 0.03);
    expect(s.platformFee).toBe(30_000);
    expect(s.gross).toBe(1_030_000);
    expect(s.net).toBe(1_000_000);
    expect(s.gross - s.platformFee).toBe(s.net);
  });
});

describe("escrow state machine", () => {
  it("holds then releases on delivery confirm", () => {
    const held = holdEscrow();
    expect(held.paymentStatus).toBe("held");
    const released = releaseEscrow(held, "2026-06-20");
    expect(released.ok).toBe(true);
    if (released.ok) {
      expect(released.value.paymentStatus).toBe("released");
      expect(released.value.releasedAt).toBe("2026-06-20");
    }
  });

  it("refuses to release when not held", () => {
    const r = releaseEscrow(
      { paymentStatus: "released", settlementStatus: "released", releasedAt: "x" },
      "2026-06-20",
    );
    expect(r.ok).toBe(false);
  });

  it("refunds a held escrow", () => {
    const r = refundEscrow(holdEscrow());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.paymentStatus).toBe("refunded");
  });
});

describe("credit term", () => {
  const verified = {
    role: "contractor" as const,
    biz_status: "verified" as const,
    credit_limit: 5_000_000,
    credit_used: 1_000_000,
  };

  it("allows credit within remaining limit", () => {
    const r = canUseCredit(verified, 3_000_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.remaining).toBe(1_000_000);
  });

  it("blocks when exceeding credit limit", () => {
    const r = canUseCredit(verified, 5_000_000);
    expect(r.ok).toBe(false);
  });

  it("blocks unverified businesses", () => {
    const r = canUseCredit({ ...verified, biz_status: "pending" }, 100);
    expect(r.ok).toBe(false);
  });

  it("applies credit usage immutably", () => {
    const p = { credit_used: 1000 };
    const next = applyCreditUsage(p, 500);
    expect(next.credit_used).toBe(1500);
    expect(p.credit_used).toBe(1000); // original unchanged
  });

  it("builds an invoice with a due date", () => {
    const inv = buildCreditInvoice("ord-1", 2_000_000, "2026-06-07", 30);
    expect(inv.dueDate).toBe("2026-07-07");
    expect(inv.amount).toBe(2_000_000);
    expect(inv.status).toBe("issued");
  });
});
