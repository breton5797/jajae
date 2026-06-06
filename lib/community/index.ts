/**
 * lib/community — review aggregation/summary, anti-spam, referral rewards.
 * Pure; depends on lib/types + lib/utils. (AI summary is optional in ./ai.)
 */
import type { ReviewAggregate } from "@/lib/types";
import { won, type Result, ok, err } from "@/lib/utils";

export function aggregateReviews(
  reviews: Array<{ rating: number }>,
): { count: number; avg: number; distribution: number[] } {
  const distribution = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const r of reviews) {
    const idx = Math.min(5, Math.max(1, Math.round(r.rating))) - 1;
    distribution[idx] = (distribution[idx] ?? 0) + 1;
    sum += r.rating;
  }
  const count = reviews.length;
  return {
    count,
    avg: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
    distribution,
  };
}

/** Deterministic review summary (offline fallback for the Claude path). */
export function summarizeReviews(
  reviews: Array<{ rating: number; body: string }>,
): ReviewAggregate {
  const agg = aggregateReviews(reviews);
  if (agg.count === 0) {
    return {
      count: 0,
      avg: 0,
      distribution: agg.distribution,
      summary: "아직 등록된 리뷰가 없습니다.",
      summarySource: "fallback",
    };
  }
  const positive = reviews.filter((r) => r.rating >= 4).length;
  const negative = reviews.filter((r) => r.rating <= 2).length;
  const sentiment =
    positive >= negative * 2
      ? "대체로 만족"
      : negative > positive
        ? "불만 의견 다수"
        : "의견이 갈림";
  const summary = `총 ${agg.count}개 리뷰 · 평균 ${agg.avg}점 (${sentiment}). 긍정 ${positive}건 / 부정 ${negative}건.`;
  return { ...agg, summary, summarySource: "fallback" };
}

export interface ReviewInput {
  rating: number;
  body: string;
}

/** Anti-spam / abuse gate for review submission. */
export function validateReview(
  input: ReviewInput,
  opts: { recentCountByUser?: number } = {},
): Result<true> {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return err("평점은 1~5 사이여야 합니다.");
  }
  if (input.body.trim().length < 5) {
    return err("리뷰는 최소 5자 이상 작성해주세요.");
  }
  if ((opts.recentCountByUser ?? 0) >= 5) {
    return err("단시간에 너무 많은 리뷰를 작성했습니다. 잠시 후 다시 시도하세요.");
  }
  return ok(true);
}

/* ---------- referral ---------- */

export function validateReferral(
  inviterId: string,
  inviteeId: string,
): Result<true> {
  if (!inviterId || !inviteeId) return err("초대 정보가 올바르지 않습니다.");
  if (inviterId === inviteeId) {
    return err("본인을 추천할 수 없습니다.");
  }
  return ok(true);
}

export const REFERRAL_RATE = 0.02;
export const REFERRAL_CAP = 50_000;

/** Reward credit for a successful referral, capped. */
export function computeReferralReward(
  firstOrderAmount: number,
  rate: number = REFERRAL_RATE,
  cap: number = REFERRAL_CAP,
): number {
  return won(Math.min(firstOrderAmount * rate, cap));
}
