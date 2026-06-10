/**
 * lib/triage/as — AS요청 트리아지 결정 규칙. 순수; lib/types에만 의존.
 * 분류기(AI/폴백)는 제안만. 유일한 자동 결과는 auto_schedule이고, 그 외(시공사귀책·모호·
 * 비-approve·저신뢰·킬스위치)는 escalate. 분류기 출력 형태는 8-1의 ReturnClassification 재사용.
 */
import type { ReturnClassification, AsTriageEval, AsTriagePolicy } from "@/lib/types";

/** 자동 예약 허용 책임소재(공급사·배송 귀책만). 시공사 귀책/모호는 자동 제외. */
const AUTO_RESPONSIBILITIES: readonly string[] = ["supplier", "delivery"];

export function decideAsTriage(
  c: ReturnClassification,
  policy: Pick<AsTriagePolicy, "enabled" | "min_confidence">,
): AsTriageEval {
  const reasons: string[] = [];
  if (!policy.enabled) {
    reasons.push("AS 트리아지 자동화 중지(킬스위치)");
    return { outcome: "escalate", reasons };
  }
  if (c.decision !== "approve") {
    reasons.push("명백한 결함성 AS가 아님 — 사람 검토 필요");
    return { outcome: "escalate", reasons };
  }
  if (!AUTO_RESPONSIBILITIES.includes(c.responsibility)) {
    reasons.push("공급사/배송 귀책이 아님 — 자동 예약 제외");
    return { outcome: "escalate", reasons };
  }
  if (c.confidence < policy.min_confidence) {
    reasons.push(`신뢰도(${c.confidence})가 임계값(${policy.min_confidence}) 미만`);
    return { outcome: "escalate", reasons };
  }
  reasons.push("정책 범위 내 자동 예약");
  return { outcome: "auto_schedule", reasons };
}

const AS_SIGNALS = [
  "불량", "하자", "파손", "오작동", "누수", "균열", "소음", "고장", "작동", "결함",
];

/** 키 없음/AI 오류 시 결정론 폴백. 보수적: 명백한 결함 신호만 approve, 그 외 ambiguous. 절대 throw 안 함. */
export function classifyAsRequestFallback(issue: string): ReturnClassification {
  const text = issue.trim();
  const hit = AS_SIGNALS.find((s) => text.includes(s));
  if (hit) {
    return {
      responsibility: "supplier",
      decision: "approve",
      confidence: 0.8,
      rationale: `AS 사유에 명백한 결함 신호("${hit}") 포함 — 폴백 분류`,
    };
  }
  return {
    responsibility: "ambiguous",
    decision: "ambiguous",
    confidence: 0.3,
    rationale: "명백한 결함 신호 없음 — 사람 검토 필요(보수적 폴백)",
  };
}
