import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export interface AuthedUser {
  id: string;
  role: UserRole;
  bizStatus: string;
}

/** Resolve the current user + role, or null. Server-only. */
export async function getAuthedUser(): Promise<AuthedUser | null> {
  const sb = createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data: profile } = await sb
    .from("profiles")
    .select("role, biz_status")
    .eq("id", user.id)
    .maybeSingle();
  return {
    id: user.id,
    role: (profile?.role as UserRole) ?? "contractor",
    bizStatus: (profile?.biz_status as string) ?? "pending",
  };
}
