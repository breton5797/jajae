/**
 * Centralized env access. Reads are lazy so a missing var never crashes the
 * build or a test run — only the code path that truly needs it throws.
 */

export const PLATFORM_FEE_RATE = (() => {
  const raw = process.env.PLATFORM_FEE_RATE;
  const n = raw ? Number(raw) : 0.03;
  return Number.isFinite(n) && n >= 0 && n < 1 ? n : 0.03;
})();

export function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
}

export function supabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "anon-key-placeholder";
}

export function supabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return key;
}

export function anthropicApiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY ?? null;
}

export function tossSecretKey(): string | null {
  return process.env.TOSS_SECRET_KEY ?? null;
}

export function tossClientKey(): string {
  // Toss public test client key (safe to expose).
  return (
    process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "test_ck_docs_placeholder_000000"
  );
}

export function popbillLinkId(): string | null {
  return process.env.POPBILL_LINK_ID ?? null;
}

export function popbillSecretKey(): string | null {
  return process.env.POPBILL_SECRET_KEY ?? null;
}

export function popbillConfigured(): boolean {
  return Boolean(popbillLinkId() && popbillSecretKey());
}

export function openaiApiKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null;
}

export function studioRenderProvider(): string | null {
  return process.env.STUDIO_RENDER_PROVIDER ?? null;
}

export function studioRenderApiKey(): string | null {
  return process.env.STUDIO_RENDER_API_KEY ?? null;
}

export function studioRenderModel(): string {
  return process.env.STUDIO_RENDER_MODEL ?? "gpt-image-1";
}

export function studioRenderQuality(): string {
  return process.env.STUDIO_RENDER_QUALITY ?? "high";
}
