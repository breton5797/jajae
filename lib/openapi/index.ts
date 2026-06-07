/**
 * lib/openapi — API-key issuance, scopes, rate limiting, HMAC webhooks, retry.
 * Pure logic over node:crypto. Depends on lib/types + lib/utils only.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  ApiKeyPair,
  RateLimitResult,
  WebhookEventPayload,
  WebhookEventType,
} from "@/lib/types";
import { API_SCOPES } from "@/lib/api-scopes";

export { API_SCOPES };

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Generate an API key + its stored hash + a display prefix. */
export function generateApiKey(prefix = "jck_live"): ApiKeyPair {
  const secret = randomBytes(24).toString("hex");
  const key = `${prefix}_${secret}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, prefix.length + 7) };
}

export function verifyApiKey(key: string, storedHash: string): boolean {
  const a = Buffer.from(hashApiKey(key));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Mask a key for display: prefix…last4. */
export function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

export function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required);
}

/** Fixed-window rate limit check given the count already used in the window. */
export function checkRateLimit(
  usedInWindow: number,
  limit: number,
): RateLimitResult {
  const remaining = Math.max(0, limit - usedInWindow);
  return { allowed: usedInWindow < limit, remaining, limit };
}

/* ---------- webhooks ---------- */

export function signWebhook(payloadJson: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadJson).digest("hex");
}

export function verifyWebhookSignature(
  payloadJson: string,
  secret: string,
  signature: string,
): boolean {
  const expected = Buffer.from(signWebhook(payloadJson, secret));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export function buildWebhookEvent(
  event: WebhookEventType,
  id: string,
  ts: string,
  data: Record<string, unknown>,
): WebhookEventPayload {
  return { event, id, ts, data };
}

export const MAX_WEBHOOK_ATTEMPTS = 5;

/** Exponential backoff (seconds) for retry attempt N (1-based). */
export function nextRetryDelaySeconds(attempt: number): number {
  const base = 30;
  return Math.min(base * 2 ** Math.max(0, attempt - 1), 3600);
}

export function shouldDeadLetter(
  attempts: number,
  max = MAX_WEBHOOK_ATTEMPTS,
): boolean {
  return attempts >= max;
}
