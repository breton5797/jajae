/**
 * Toss Payments confirm. Real API when TOSS_SECRET_KEY is set; deterministic
 * sandbox/mock otherwise so checkout + tests work offline.
 */
import { tossSecretKey } from "@/lib/env";
import { type Result, ok, err } from "@/lib/utils";

export interface TossConfirmInput {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export interface TossPayment {
  paymentKey: string;
  orderId: string;
  amount: number;
  status: "DONE";
  method: "escrow";
  approvedAt: string;
  mock: boolean;
}

const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";

export async function confirmTossPayment(
  input: TossConfirmInput,
  now: string,
): Promise<Result<TossPayment>> {
  const secret = tossSecretKey();

  if (!secret) {
    // Sandbox/mock path — no network, deterministic.
    return ok({
      paymentKey: input.paymentKey,
      orderId: input.orderId,
      amount: input.amount,
      status: "DONE",
      method: "escrow",
      approvedAt: now,
      mock: true,
    });
  }

  try {
    const res = await fetch(TOSS_CONFIRM_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const detail = await res.text();
      return err(`Toss 결제 승인 실패 (${res.status}): ${detail}`);
    }
    const data = (await res.json()) as { approvedAt?: string };
    return ok({
      paymentKey: input.paymentKey,
      orderId: input.orderId,
      amount: input.amount,
      status: "DONE",
      method: "escrow",
      approvedAt: data.approvedAt ?? now,
      mock: false,
    });
  } catch (e) {
    return err(`Toss 결제 승인 중 오류: ${(e as Error).message}`);
  }
}
