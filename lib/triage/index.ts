/**
 * lib/triage — 반품 트리아지 결정 규칙. 순수; lib/types에만 의존.
 * 분류기(AI/폴백)는 *제안*만 한다. 이 모듈과 DB RPC(triage_auto_resolve_return)가
 * 동일한 게이트를 각자 강제한다(defense in depth). 유일한 자동 결과는 auto_approve이고,
 * 그 외(reject/ambiguous/저신뢰/상한초과/킬스위치)는 모두 escalate 한다.
 */
import type { ReturnClassification, TriageEval, TriagePolicy } from "@/lib/types";

export function computeRefundAmount(qty: number, unitPriceSnapshot: number): number {
  return qty * unitPriceSnapshot;
}

export function decideTriage(
  c: ReturnClassification,
  refundAmount: number,
  policy: Pick<TriagePolicy, "enabled" | "min_confidence" | "auto_approve_cap">,
): TriageEval {
  const reasons: string[] = [];
  if (!policy.enabled) {
    reasons.push("트리아지 자동화 중지(킬스위치)");
    return { outcome: "escalate", reasons };
  }
  if (c.decision !== "approve") {
    reasons.push("명백한 환불 승인이 아님 — 사람 검토 필요");
    return { outcome: "escalate", reasons };
  }
  if (c.confidence < policy.min_confidence) {
    reasons.push(`신뢰도(${c.confidence})가 임계값(${policy.min_confidence}) 미만`);
    return { outcome: "escalate", reasons };
  }
  if (refundAmount > policy.auto_approve_cap) {
    reasons.push(`환불액(${refundAmount})이 자동승인 상한(${policy.auto_approve_cap}) 초과`);
    return { outcome: "escalate", reasons };
  }
  reasons.push("정책 범위 내 자동 승인");
  return { outcome: "auto_approve", reasons };
}

const APPROVE_SIGNALS = [
  "불량", "파손", "하자", "오배송", "깨짐", "누락", "오염", "고장",
];

/**
 * 키 없음/AI 오류 시의 결정론 폴백. 보수적: 명백한 하자 신호가 있을 때만 approve,
 * 그 외는 ambiguous(저신뢰)로 두어 기본 에스컬레이션을 유도한다. 절대 throw 안 함.
 */
export function classifyReturnFallback(
  reason: string,
  _refundAmount: number,
): ReturnClassification {
  const text = reason.trim();
  const hit = APPROVE_SIGNALS.find((s) => text.includes(s));
  if (hit) {
    return {
      responsibility: "supplier",
      decision: "approve",
      confidence: 0.8,
      rationale: `사유에 명백한 하자 신호("${hit}") 포함 — 폴백 자동 분류`,
    };
  }
  return {
    responsibility: "ambiguous",
    decision: "ambiguous",
    confidence: 0.3,
    rationale: "명백한 하자 신호 없음 — 사람 검토 필요(보수적 폴백)",
  };
}
