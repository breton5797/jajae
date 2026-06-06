import { describe, it, expect } from "vitest";
import {
  aggregateReviews,
  summarizeReviews,
  validateReview,
  validateReferral,
  computeReferralReward,
  REFERRAL_CAP,
} from "@/lib/community";

describe("aggregateReviews", () => {
  it("computes count, avg, and 5-bucket distribution", () => {
    const agg = aggregateReviews([
      { rating: 5 },
      { rating: 4 },
      { rating: 5 },
      { rating: 1 },
    ]);
    expect(agg.count).toBe(4);
    expect(agg.avg).toBe(3.8);
    expect(agg.distribution).toEqual([1, 0, 0, 1, 2]); // ratings 1..5
  });
});

describe("summarizeReviews", () => {
  it("summarizes sentiment deterministically", () => {
    const s = summarizeReviews([
      { rating: 5, body: "아주 좋아요 튼튼합니다" },
      { rating: 4, body: "괜찮습니다 추천" },
      { rating: 5, body: "재구매 의사 있음" },
    ]);
    expect(s.count).toBe(3);
    expect(s.summary).toContain("대체로 만족");
    expect(s.summarySource).toBe("fallback");
  });

  it("handles no reviews", () => {
    const s = summarizeReviews([]);
    expect(s.count).toBe(0);
    expect(s.summary).toContain("아직");
  });
});

describe("validateReview", () => {
  it("accepts a valid review", () => {
    expect(validateReview({ rating: 5, body: "튼튼하고 좋아요" }).ok).toBe(true);
  });
  it("rejects bad rating / too-short body / rate-limit (spam)", () => {
    expect(validateReview({ rating: 6, body: "좋아요123" }).ok).toBe(false);
    expect(validateReview({ rating: 5, body: "짧음" }).ok).toBe(false);
    expect(
      validateReview({ rating: 5, body: "정상 리뷰입니다" }, { recentCountByUser: 5 }).ok,
    ).toBe(false);
  });
});

describe("referral", () => {
  it("blocks self-referral fraud", () => {
    expect(validateReferral("u1", "u1").ok).toBe(false);
    expect(validateReferral("u1", "u2").ok).toBe(true);
  });

  it("computes a capped reward credit", () => {
    expect(computeReferralReward(1_000_000)).toBe(20_000); // 2%
    expect(computeReferralReward(10_000_000)).toBe(REFERRAL_CAP); // capped at 50k
  });
});
