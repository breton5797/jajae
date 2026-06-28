// app/api/proposal/[id]/route.ts
import { NextResponse } from "next/server";
import { getProposalRow } from "@/lib/data/proposals";
import { getAuthedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const row = await getProposalRow(params.id); // RLS가 소유자/admin만 반환
  if (!row) {
    return NextResponse.json(
      { error: "제안을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  return NextResponse.json(row);
}
