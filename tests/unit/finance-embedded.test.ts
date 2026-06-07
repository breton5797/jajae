import { describe, it, expect } from "vitest";
import {
  computeEarlyPayout,
  canRequestFinance,
  financeOutstanding,
  netRepayment,
} from "@/lib/finance";

describe("computeEarlyPayout (선정산)", () => {
  it("advances the receivable minus a discount fee", () => {
    const p = computeEarlyPayout(10_000_000, 0.02);
    expect(p.fee).toBe(200_000);
    expect(p.advance).toBe(9_800_000);
  });
});

describe("canRequestFinance", () => {
  const base = { limit: 30_000_000, outstanding: 5_000_000, overdue: false, eligible: true };
  it("allows within remaining limit", () => {
    const r = canRequestFinance(10_000_000, base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.remaining).toBe(15_000_000);
  });
  it("blocks ineligible, overdue, or over-limit", () => {
    expect(canRequestFinance(10_000_000, { ...base, eligible: false }).ok).toBe(false);
    expect(canRequestFinance(10_000_000, { ...base, overdue: true }).ok).toBe(false);
    expect(canRequestFinance(30_000_000, base).ok).toBe(false);
  });
});

describe("financeOutstanding + netRepayment", () => {
  it("computes outstanding = principal + fee - repayments", () => {
    expect(financeOutstanding(10_000_000, 200_000, [3_000_000])).toBe(7_200_000);
  });

  it("nets a settlement against the balance, capping at the balance", () => {
    const partial = netRepayment(7_200_000, 5_000_000);
    expect(partial.applied).toBe(5_000_000);
    expect(partial.remainingBalance).toBe(2_200_000);
    expect(partial.fullyRepaid).toBe(false);

    // settlement exceeds balance → remainder returned to payee
    const over = netRepayment(2_200_000, 5_000_000);
    expect(over.applied).toBe(2_200_000);
    expect(over.settlementRemainder).toBe(2_800_000);
    expect(over.fullyRepaid).toBe(true);
  });
});
