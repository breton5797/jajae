import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Kakao OAuth (PKCE) callback — exchanges the code for a session, then redirects. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (code) {
    try {
      const supabase = createServerSupabase();
      await supabase.auth.exchangeCodeForSession(code);
    } catch {
      return NextResponse.redirect(new URL("/login?error=auth", url.origin));
    }
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
