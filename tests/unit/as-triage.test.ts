import { describe, it, expect } from "vitest";
import { decideAsTriage, classifyAsRequestFallback } from "@/lib/triage/as";
import type { ReturnClassification, AsTriagePolicy } from "@/lib/types";

const policy = (over: Partial<AsTriagePolicy> = {}): AsTriagePolicy => ({
  id: "pol",
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

describe("decideAsTriage", () => {
  it("공급사 귀책 + 고신뢰 → auto_schedule", () => {
    expect(decideAsTriage(cls(), policy()).outcome).toBe("auto_schedule");
  });
  it("배송 귀책도 자동 예약 대상", () => {
    expect(decideAsTriage(cls({ responsibility: "delivery" }), policy()).outcome).toBe("auto_schedule");
  });
  it("시공사 귀책 → escalate", () => {
    expect(decideAsTriage(cls({ responsibility: "contractor" }), policy()).outcome).toBe("escalate");
  });
  it("모호 책임 → escalate", () => {
    expect(decideAsTriage(cls({ responsibility: "ambiguous" }), policy()).outcome).toBe("escalate");
  });
  it("approve 아님 → escalate", () => {
    expect(decideAsTriage(cls({ decision: "ambiguous" }), policy()).outcome).toBe("escalate");
  });
  it("신뢰도 임계 미만 → escalate", () => {
    expect(decideAsTriage(cls({ confidence: 0.79 }), policy({ min_confidence: 0.8 })).outcome).toBe("escalate");
  });
  it("킬스위치 → escalate", () => {
    expect(decideAsTriage(cls(), policy({ enabled: false })).outcome).toBe("escalate");
  });
});

describe("classifyAsRequestFallback", () => {
  it("명백한 결함 신호 → approve, 신뢰도 ≥ 0.8", () => {
    const r = classifyAsRequestFallback("타일 누수 하자 발생");
    expect(r.decision).toBe("approve");
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });
  it("신호 없음 → ambiguous, 저신뢰", () => {
    const r = classifyAsRequestFallback("문의드립니다");
    expect(r.decision).toBe("ambiguous");
    expect(r.confidence).toBeLessThan(0.8);
  });
});
