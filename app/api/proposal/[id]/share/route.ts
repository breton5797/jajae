// app/api/proposal/[id]/share/route.ts
import { NextResponse } from "next/server";
import { ShareInputSchema } from "@/lib/proposal/schema";
import { shareProposalRow } from "@/lib/data/proposals";
import { getAuthedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = ShareInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "비밀번호는 4자 이상이어야 합니다." },
      { status: 400 },
    );
  }
  const res = await shareProposalRow(
    params.id,
    user.id,
    parsed.data.password,
    parsed.data.expiresInDays,
    parsed.data.snapshot,
  );
  if (!res) {
    return NextResponse.json(
      { error: "공유 설정에 실패했습니다." },
      { status: 500 },
    );
  }
  return NextResponse.json({
    shareUrl: `/p/${res.token}`,
    expiresAt: res.expiresAt,
  });
}
