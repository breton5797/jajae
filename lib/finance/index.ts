/**
 * lib/finance — monthly settlement + credit (여신) ledger. Pure; lib/types + utils.
 */
import type {
  CreditAccount,
  CreditStatus,
  MonthlySettlementResult,
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
