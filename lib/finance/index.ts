/**
 * lib/finance — monthly settlement + credit (여신) ledger. Pure; lib/types + utils.
 */
import type {
  CreditAccount,
  CreditStatus,
  EarlyPayout,
  MonthlySettlementResult,
  RepaymentNetResult,
} from "@/lib/types";
import { won, type Result, ok, err } from "@/lib/utils";

export interface SettlementOrderInput {
  id: string;
  subtotal: number;
  platform_fee: number;
  total: number;
}

/**
 * Aggregate a contractor's (already delivered) orders for a period into a
 * settlement statement. gross = supply value, fee = platform fee, net = total billed.
 */
export function buildMonthlySettlement(
  period: string,
  orders: SettlementOrderInput[],
): MonthlySettlementResult {
  const gross = orders.reduce((s, o) => s + o.subtotal, 0);
  const fee = orders.reduce((s, o) => s + o.platform_fee, 0);
  const net = orders.reduce((s, o) => s + o.total, 0);
  return {
    period,
    gross: won(gross),
    fee: won(fee),
    net: won(net),
    orderIds: orders.map((o) => o.id),
  };
}

/* ---------- credit (여신) ---------- */

export function creditStatus(account: CreditAccount): CreditStatus {
  const available = account.limit_amount - account.used_amount;
  const overdue = account.overdue_amount;
  let blocked = false;
  let reason: string | null = null;
  if (overdue > 0) {
    blocked = true;
    reason = `연체 금액 ${won(overdue)}원이 있어 여신 주문이 제한됩니다.`;
  } else if (available <= 0) {
    blocked = true;
    reason = "여신 한도가 모두 소진되었습니다.";
  }
  return {
    limit: account.limit_amount,
    used: account.used_amount,
    available,
    overdue,
    blocked,
    reason,
  };
}

/** Gate a new credit order: blocked by overdue, then by remaining limit. */
export function canPlaceCreditOrder(
  account: CreditAccount,
  amount: number,
): Result<{ remaining: number }> {
  if (account.overdue_amount > 0) {
    return err(
      `연체 금액(${won(account.overdue_amount)}원) 정산 후 여신 주문이 가능합니다.`,
    );
  }
  const available = account.limit_amount - account.used_amount;
  if (amount > available) {
    return err(
      `여신 한도를 초과했습니다. 잔여 한도 ${won(available)}원, 요청 ${won(amount)}원`,
    );
  }
  return ok({ remaining: available - amount });
}

export function applyCreditCharge<T extends Pick<CreditAccount, "used_amount">>(
  account: T,
  amount: number,
): T {
  return { ...account, used_amount: account.used_amount + amount };
}

/** Apply a payment: clears overdue first, then reduces used. Immutable. */
export function applyCreditPayment<
  T extends Pick<CreditAccount, "used_amount" | "overdue_amount">,
>(account: T, amount: number): T {
  const towardOverdue = Math.min(account.overdue_amount, amount);
  const remainder = amount - towardOverdue;
  return {
    ...account,
    overdue_amount: account.overdue_amount - towardOverdue,
    used_amount: Math.max(0, account.used_amount - remainder),
  };
}

/** Is the account overdue as of a given date (YYYY-MM-DD)? */
export function isOverdue(
  account: Pick<CreditAccount, "due_date" | "used_amount">,
  asOf: string,
): boolean {
  if (!account.due_date || account.used_amount <= 0) return false;
  return asOf > account.due_date;
}

/* ---------- Phase 6: embedded finance (early settlement / financing) ---------- */

/** Early-settlement (선정산) advance on a receivable: fee = receivable × rate. */
export function computeEarlyPayout(receivable: number, rate: number): EarlyPayout {
  const fee = won(receivable * rate);
  return { receivable: won(receivable), rate, fee, advance: won(receivable) - fee };
}

/**
 * Gate a finance request by the score-derived limit and account health.
 * Over-limit or overdue/default blocks new financing.
 */
export function canRequestFinance(
  amount: number,
  opts: { limit: number; outstanding: number; overdue: boolean; eligible: boolean },
): Result<{ remaining: number }> {
  if (!opts.eligible) return err("신용 등급이 금융 이용 기준에 미달합니다.");
  if (opts.overdue) return err("연체/미상환 잔액이 있어 신규 금융이 제한됩니다.");
  const remaining = opts.limit - opts.outstanding;
  if (amount > remaining) {
    return err(
      `금융 한도를 초과했습니다. 잔여 한도 ${won(remaining)}원, 요청 ${won(amount)}원`,
    );
  }
  return ok({ remaining: remaining - amount });
}

/** Outstanding balance of a finance request = principal + fee - repayments. */
export function financeOutstanding(
  amount: number,
  fee: number,
  repayments: number[],
): number {
  const repaid = repayments.reduce((s, r) => s + r, 0);
  return Math.max(0, won(amount + fee - repaid));
}

/**
 * Net a settlement against an outstanding finance balance. Repayment is capped
 * at the balance (repayment-exceeds-balance edge → remainder returned to payee).
 */
export function netRepayment(
  balance: number,
  settlementAmount: number,
): RepaymentNetResult {
  const applied = Math.min(Math.max(0, balance), Math.max(0, settlementAmount));
  const remainingBalance = won(balance - applied);
  return {
    applied: won(applied),
    remainingBalance,
    settlementRemainder: won(settlementAmount - applied),
    fullyRepaid: remainingBalance === 0,
  };
}
