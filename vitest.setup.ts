import { beforeAll } from "vitest";

beforeAll(() => {
  // Deterministic test environment: force AI/payment fallbacks unless explicitly set.
  process.env.TZ = "Asia/Seoul";
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
});
