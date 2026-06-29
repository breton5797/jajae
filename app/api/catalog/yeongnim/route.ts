import { NextResponse } from "next/server";
import { fetchYeongnimColors } from "@/lib/data/yeongnim";
import { getAuthedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const colors = await fetchYeongnimColors();
  return NextResponse.json({ colors });
}
