import { NextResponse } from "next/server";
import { RenderInputSchema } from "@/lib/proposal/schema";
import { renderPhotoreal } from "@/lib/proposal/ai-render";
import { getAuthedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // AI 이미지 생성 지연 허용

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = RenderInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });
  }

  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const result = await renderPhotoreal(parsed.data.imageBase64, parsed.data.prompt);
  return NextResponse.json(result);
}
