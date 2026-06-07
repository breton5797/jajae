/**
 * lib/policy — autonomy guardrails. Server-side enforcement (NOT prompt-only):
 * a proposed plan item only auto-executes if it passes every policy check; the
 * DB trigger `enforce_agent_policy` re-checks on write as defense-in-depth.
 * Pure; depends on lib/types only.
 */
import type {
  AgentPolicy,
  PlanItem,
  PolicyDecision,
  PolicyEval,
  PolicyEvalResult,
} from "@/lib/types";

export function isKillSwitched(policy: Pick<AgentPolicy, "enabled">): boolean {
  return !policy.enabled;
}

function evalItem(
  item: PlanItem,
  policy: AgentPolicy,
  runningSpend: number,
): { decision: PolicyDecision; reasons: string[] } {
  const reasons: string[] = [];

  if (
    policy.supplier_allowlist.length > 0 &&
    !policy.supplier_allowlist.includes(item.supplierId)
  ) {
    reasons.push("승인되지 않은 공급사");
    return { decision: "reject", reasons };
  }

  if (item.amount > policy.max_po) {
    reasons.push(`자동발주 한도(${policy.max_po}) 초과`);
    return { decision: "escalate", reasons };
  }

  if (item.categoryId) {
    const limit = policy.category_limits[item.categoryId];
    if (typeof limit === "number" && item.amount > limit) {
      reasons.push("카테고리 한도 초과");
      return { decision: "escalate", reasons };
    }
  }

  if (
    policy.escalation_threshold > 0 &&
    item.amount > policy.escalation_threshold
  ) {
    reasons.push("에스컬레이션 임계값 초과");
    return { decision: "escalate", reasons };
  }

  if (runningSpend + item.amount > policy.spend_cap) {
    reasons.push(`누적 지출 한도(${policy.spend_cap}) 초과`);
    return { decision: "escalate", reasons };
  }

  reasons.push("정책 범위 내 자동 승인");
  return { decision: "auto", reasons };
}

/**
 * Evaluate a plan against a policy. Kill-switch (enabled=false) halts everything.
 * Spend cap is applied cumulatively across auto-approved items.
 */
export function evaluatePlan(
  items: PlanItem[],
  policy: AgentPolicy,
  alreadySpent = 0,
): PolicyEvalResult {
  if (isKillSwitched(policy)) {
    return {
      evals: items.map((item) => ({
        item,
        decision: "halt" as const,
        reasons: ["자율 운영 중지(킬스위치)"],
      })),
      autoItems: [],
      escalateItems: [],
      rejectedItems: [],
      totalAuto: 0,
      halted: true,
    };
  }

  const evals: PolicyEval[] = [];
  let runningSpend = alreadySpent;

  for (const item of items) {
    const { decision, reasons } = evalItem(item, policy, runningSpend);
    if (decision === "auto") runningSpend += item.amount;
    evals.push({ item, decision, reasons });
  }

  const autoItems = evals.filter((e) => e.decision === "auto").map((e) => e.item);
  const escalateItems = evals
    .filter((e) => e.decision === "escalate")
    .map((e) => e.item);
  const rejectedItems = evals
    .filter((e) => e.decision === "reject")
    .map((e) => e.item);

  return {
    evals,
    autoItems,
    escalateItems,
    rejectedItems,
    totalAuto: autoItems.reduce((s, i) => s + i.amount, 0),
    halted: false,
  };
}

/**
 * Net autonomous spend already committed in the cap window, from agent audit
 * entries: auto-executed POs add, reversals subtract, human-approved spend is
 * NOT counted (it is a human decision, outside the autonomy cap). Floored at 0.
 * Feed this as `alreadySpent` so the spend cap holds ACROSS runs, not per-run.
 */
export function sumNetAutoSpend(
  entries: ReadonlyArray<{ action: string; amount: number }>,
): number {
  const net = entries.reduce((sum, e) => {
    if (e.action === "auto_po") return sum + Number(e.amount);
    if (e.action === "reversal") return sum - Number(e.amount);
    return sum;
  }, 0);
  return Math.max(0, net);
}

/** Single-item server gate used right before executing an auto-PO. */
export function assertWithinPolicy(
  item: PlanItem,
  policy: AgentPolicy,
  alreadySpent: number,
): boolean {
  if (isKillSwitched(policy)) return false;
  return evalItem(item, policy, alreadySpent).decision === "auto";
}
