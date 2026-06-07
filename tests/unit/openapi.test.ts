import { describe, it, expect } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  hasScope,
  checkRateLimit,
  signWebhook,
  verifyWebhookSignature,
  nextRetryDelaySeconds,
  shouldDeadLetter,
  maskKey,
} from "@/lib/openapi";

describe("API keys", () => {
  it("generates a key whose hash verifies (and rejects wrong keys)", () => {
    const pair = generateApiKey();
    expect(pair.key).toMatch(/^jck_live_/);
    expect(pair.hash).toBe(hashApiKey(pair.key));
    expect(verifyApiKey(pair.key, pair.hash)).toBe(true);
    expect(verifyApiKey("jck_live_wrong", pair.hash)).toBe(false);
  });

  it("masks keys for display", () => {
    expect(maskKey("jck_live_abcdef123456")).toContain("…");
  });
});

describe("scopes + rate limit", () => {
  it("checks scopes", () => {
    expect(hasScope(["products:read"], "products:read")).toBe(true);
    expect(hasScope(["products:read"], "orders:read")).toBe(false);
  });

  it("enforces a fixed-window rate limit", () => {
    expect(checkRateLimit(5, 10)).toEqual({ allowed: true, remaining: 5, limit: 10 });
    expect(checkRateLimit(10, 10).allowed).toBe(false);
    expect(checkRateLimit(12, 10).remaining).toBe(0);
  });
});

describe("webhook HMAC + retry", () => {
  it("signs and verifies; tampering fails", () => {
    const payload = JSON.stringify({ event: "order.created", id: "1" });
    const sig = signWebhook(payload, "whsec_123");
    expect(verifyWebhookSignature(payload, "whsec_123", sig)).toBe(true);
    expect(verifyWebhookSignature(payload + "x", "whsec_123", sig)).toBe(false);
    expect(verifyWebhookSignature(payload, "wrong", sig)).toBe(false);
  });

  it("backs off exponentially and dead-letters after max attempts", () => {
    expect(nextRetryDelaySeconds(1)).toBe(30);
    expect(nextRetryDelaySeconds(2)).toBe(60);
    expect(nextRetryDelaySeconds(3)).toBe(120);
    expect(nextRetryDelaySeconds(99)).toBe(3600); // capped
    expect(shouldDeadLetter(4)).toBe(false);
    expect(shouldDeadLetter(5)).toBe(true);
  });
});
