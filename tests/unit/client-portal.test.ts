import { describe, it, expect } from "vitest";
import {
  containsPricingInternals,
  scrubBomForClient,
  validateOptionSet,
  applyClientChoice,
  selectionToCartLines,
  validatePhoneLogin,
} from "@/lib/client-portal";
import type { ClientSelectionOption } from "@/lib/types";

describe("pricing-internal scrubbing (hide cost/margin from clients)", () => {
  it("detects internal pricing fields", () => {
    expect(containsPricingInternals({ cost: 100 })).toBe(true);
    expect(containsPricingInternals({ margin_rate: 0.2 })).toBe(true);
    expect(containsPricingInternals({ supplier_id: "s1" })).toBe(true);
    expect(containsPricingInternals({ item: "타일", clientPrice: 30000 })).toBe(false);
  });

  it("scrubBomForClient strips all internal fields", () => {
    const safe = scrubBomForClient([
      { category: "타일", item: "욕실 타일", qty: 10, unit: "m2", clientPrice: 31000 },
    ]);
    expect(safe).toHaveLength(1);
    expect(containsPricingInternals(safe[0])).toBe(false);
    expect(safe[0]).not.toHaveProperty("cost");
    expect(safe[0]?.clientPrice).toBe(31000);
  });
});

describe("option set + client choice", () => {
  const options: ClientSelectionOption[] = [
    { id: "o1", productId: "p1", label: "화이트 타일", unitPrice: 30000 },
    { id: "o2", productId: "p2", label: "그레이 타일", unitPrice: 32000 },
  ];

  it("validates option sets and rejects empty/internal-leaking ones", () => {
    expect(validateOptionSet(options).ok).toBe(true);
    expect(validateOptionSet([]).ok).toBe(false);
    const leaky = [{ ...options[0]!, cost: 20000 } as unknown as ClientSelectionOption];
    expect(validateOptionSet(leaky).ok).toBe(false);
  });

  it("applies a client's choice (chosen vs declined)", () => {
    expect(applyClientChoice({ option_set: options }, ["o2"])).toEqual({
      chosen: ["o2"],
      status: "chosen",
    });
    expect(applyClientChoice({ option_set: options }, ["bogus"]).status).toBe("declined");
    expect(applyClientChoice({ option_set: options }, []).status).toBe("declined");
  });

  it("flows the client's choice back into contractor cart lines", () => {
    const lines = selectionToCartLines(
      { option_set: options, chosen: ["o2"] },
      { o2: 12 },
    );
    expect(lines).toEqual([{ productId: "p2", qty: 12 }]);
  });
});

describe("validatePhoneLogin (B2B2C lightweight auth + abuse cap)", () => {
  it("accepts valid KR mobile numbers", () => {
    expect(validatePhoneLogin("010-1234-5678").ok).toBe(true);
    expect(validatePhoneLogin("01098765432").ok).toBe(true);
  });
  it("rejects bad formats and excessive attempts", () => {
    expect(validatePhoneLogin("02-123-4567").ok).toBe(false);
    expect(validatePhoneLogin("010-1234-5678", 5).ok).toBe(false);
  });
});
