import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format an integer KRW amount, e.g. 1234000 -> "1,234,000원". */
export function formatKRW(amount: number): string {
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

/** Round to integer won (KRW has no minor unit in this domain). */
export function won(amount: number): number {
  return Math.round(amount);
}

/**
 * Validate a Korean business registration number (사업자등록번호) checksum.
 * Accepts "###-##-#####" or 10 raw digits.
 */
export function isValidBizNo(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  if (digits.length !== 10) return false;
  const nums = digits.split("").map((d) => Number(d));
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (nums[i] ?? 0) * (weights[i] ?? 0);
  }
  sum += Math.floor(((nums[8] ?? 0) * 5) / 10);
  const check = (10 - (sum % 10)) % 10;
  return check === nums[9];
}

/** Normalize a biz_no to "###-##-#####" if 10 digits, else return trimmed input. */
export function formatBizNo(input: string): string {
  const d = input.replace(/\D/g, "");
  if (d.length !== 10) return input.trim();
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/** Add N days to an ISO date (date-only) and return YYYY-MM-DD. Pure, UTC-safe. */
export function addDays(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  const s = base.toISOString();
  return s.slice(0, 10);
}

/** Stable, dependency-free id for client-side optimistic rows / tests. */
export function shortId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
