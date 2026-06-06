/**
 * lib/settlement — money movement for a split order.
 *
 * Model: the buyer pays `total = subtotal + platformFee` (service fee on top,
 * held in escrow). Supplier payout (net) = subtotal. Platform revenue = fee.
 * Invariant: gross - platform_fee = net.
 *
 * Depends only on lib/types and lib/utils (boundary-enforced).
 */
import type {
  PaymentStatus,
  Profile,
  SettlementStatus,
} from "@/lib/types";
import { addDays, won, type Result, ok, err } from "@/lib/utils";

export interface SettlementAmounts {
  gross: number;
  platformFee: number;
  net: number;
}

/** Per-PO settlement amounts from a supplier subtotal and the platform fee rate. */
export function computeSettlement(
  subtotal: number,
  feeRate: number,
): SettlementAmounts {
  const platformFee = won(subtotal * feeRate);
  const gross = subtotal + platformFee;
  const net = gross - platformFee; // === subtotal
  return { gross, platformFee, net };
}

/* ---------- Escrow state machine ---------- */

export interface EscrowState {
  paymentStatus: PaymentStatus;
  settlementStatus: SettlementStatus;
  releasedAt: string | null;
}

/** Buyer paid via escrow → funds held. */
export function holdEscrow(): EscrowState {
  return { paymentStatus: "held", settlementStatus: "held", releasedAt: null };
}

/** Delivery confirmed → release funds to supplier. */
export function releaseEscrow(
  state: EscrowState,
  onDate: string,
): Result<EscrowState> {
  if (state.paymentStatus !== "held") {
    return err(`Cannot release escrow from status '${state.paymentStatus}'`);
  }
  return ok({
    paymentStatus: "released",
    settlementStatus: "released",
    releasedAt: onDate,
  });
}

/** Refund a held escrow (e.g. cancellation / approved full return). */
export function refundEscrow(state: EscrowState): Result<EscrowState> {
  if (state.paymentStatus !== "held") {
    return err(`Cannot refund from status '${state.paymentStatus}'`);
  }
  return ok({
    paymentStatus: "refunded",
    settlementStatus: "pending",
    releasedAt: null,
  });
}

/* ---------- Credit term (외상/여신) ---------- */

/** A verified firm may use credit if remaining limit covers the amount. */
export function canUseCredit(
  profile: Pick<
    Profile,
    "role" | "biz_status" | "credit_limit" | "credit_used"
  >,
  amount: number,
): Result<{ remaining: number }> {
  if (profile.role !== "contractor") {
    return err("여신은 시공사 계정만 사용할 수 있습니다.");
  }
  if (profile.biz_status !== "verified") {
    return err("사업자 인증이 완료된 계정만 여신을 사용할 수 있습니다.");
  }
  const remaining = profile.credit_limit - profile.credit_used;
  if (amount > remaining) {
    return err(
      `여신 한도를 초과했습니다. 잔여 한도: ${won(remaining)}원, 요청: ${won(amount)}원`,
    );
  }
  return ok({ remaining: remaining - amount });
}

/** Immutably apply a credit charge to a profile. */
export function applyCreditUsage<T extends Pick<Profile, "credit_used">>(
  profile: T,
  amount: number,
): T {
  return { ...profile, credit_used: profile.credit_used + amount };
}

export interface CreditInvoice {
  orderId: string;
  amount: number;
  issueDate: string;
  dueDate: string;
  status: "issued" | "paid" | "overdue";
}

export function buildCreditInvoice(
  orderId: string,
  amount: number,
  issueDate: string,
  dueDays = 30,
): CreditInvoice {
  return {
    orderId,
    amount,
    issueDate,
    dueDate: addDays(issueDate, dueDays),
    status: "issued",
  };
}
