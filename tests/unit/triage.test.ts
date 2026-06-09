import { describe, it, expect } from "vitest";
import {
  decideTriage,
  computeRefundAmount,
  classifyReturnFallback,
} from "@/lib/triage";
import type { ReturnClassification, TriagePolicy } from "@/lib/types";

const policy = (over: Partial<TriagePolicy> = {}): TriagePolicy => ({
  id: "pol",
  auto_approve_cap: over.auto_approve_cap ?? 1_000_000,
  min_confidence: over.min_confidence ?? 0.8,
  enabled: over.enabled ?? true,
  created_at: "2026-01-01T00:00:00Z",
});

const cls = (over: Partial<ReturnClassification> = {}): ReturnClassification => ({
  responsibility: over.responsibility ?? "supplier",
  decision: over.decision ?? "approve",
  confidence: over.confidence ?? 0.9,
  rationale: over.rationale ?? "불량",
});

describe("computeRefundAmount", () => {
  it("환불액 = 수량 × 스냅샷 단가", () => {
    expect(computeRefundAmount(3, 50_000)).toBe(150_000);
  });
});

describe("decideTriage", () => {
  it("정책 범위 내 명백 승인 → auto_approve", () => {
    const r = decideTriage(cls(), 1_000_000, policy());
    expect(r.outcome).toBe("auto_approve");
  });
  it("상한 초과 → escalate", () => {
    const r = decideTriage(cls(), 1_000_001, policy({ auto_approve_cap: 1_000_000 }));
    expect(r.outcome).toBe("escalate");
  });
  it("상한 경계값(정확히 상한) → auto_approve", () => {
    const r = decideTriage(cls(), 1_000_000, policy({ auto_approve_cap: 1_000_000 }));
    expect(r.outcome).toBe("auto_approve");
  });
  it("신뢰도 임계 미만 → escalate", () => {
    const r = decideTriage(cls({ confidence: 0.79 }), 100, policy({ min_confidence: 0.8 }));
    expect(r.outcome).toBe("escalate");
  });
  it("approve 아님(ambiguous/reject) → escalate", () => {
    expect(decideTriage(cls({ decision: "ambiguous" }), 100, policy()).outcome).toBe("escalate");
    expect(decideTriage(cls({ decision: "reject" }), 100, policy()).outcome).toBe("escalate");
  });
  it("킬스위치(enabled=false) → escalate", () => {
    expect(decideTriage(cls(), 100, policy({ enabled: false })).outcome).toBe("escalate");
  });
});

describe("classifyReturnFallback", () => {
  it("명백한 하자 신호 → approve, 신뢰도 ≥ 0.8", () => {
    const r = classifyReturnFallback("타일 불량으로 반품합니다", 100_000);
    expect(r.decision).toBe("approve");
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });
  it("신호 없음 → ambiguous, 저신뢰(보수적)", () => {
    const r = classifyReturnFallback("그냥 마음이 바뀌었어요", 100_000);
    expect(r.decision).toBe("ambiguous");
    expect(r.confidence).toBeLessThan(0.8);
  });
});
