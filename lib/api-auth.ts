import "server-only";
import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { hashApiKey, hasScope, checkRateLimit } from "@/lib/openapi";
import type { ApiClient, ApiScope } from "@/lib/types";

export type ApiAuthResult =
  | { ok: true; client: ApiClient }
  | { ok: false; response: NextResponse };

function deny(status: number, error: string): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

/**
 * Authenticate an Open-API request: x-api-key → client lookup → status/scope →
 * fixed-window rate limit → audit log. Returns the client or an error response.
 */
export async function authenticateApiRequest(
  req: Request,
  scope: ApiScope,
  endpoint: string,
): Promise<ApiAuthResult> {
  const key = req.headers.get("x-api-key") ?? "";
  if (!key) return deny(401, "API 키가 필요합니다 (x-api-key).");

  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("api_clients")
      .select("*")
      .eq("key_hash", hashApiKey(key))
      .maybeSingle();
    const client = data as ApiClient | null;
    if (!client || client.status !== "active") {
      return deny(401, "유효하지 않은 API 키입니다.");
    }
    if (!hasScope(client.scopes, scope)) {
      return deny(403, `필요한 스코프가 없습니다: ${scope}`);
    }

    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await sb
      .from("api_logs")
      .select("*", { count: "exact", head: true })
      .eq("client_id", client.id)
      .gte("ts", since);
    const rl = checkRateLimit(count ?? 0, client.rate_limit);

    await sb.from("api_logs").insert({
      client_id: client.id,
      endpoint,
      method: req.method,
      status: rl.allowed ? 200 : 429,
    });

    if (!rl.allowed) {
      return deny(429, "요청 한도를 초과했습니다.");
    }
    return { ok: true, client };
  } catch (e) {
    return deny(500, (e as Error).message);
  }
}
