import { NextResponse } from "next/server";
import { StudioRenderSchema } from "@/lib/studio/schema";
import { renderStudioPhotoreal, renderAvailable } from "@/lib/studio/ai-render";
import { getAuthedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
// AI 이미지 생성은 90~165초까지 걸림(고품질). Vercel Pro 한도 300s. Hobby(60s)면 타임아웃 →
// STUDIO_RENDER_QUALITY=medium/low 로 단축 권장.
export const maxDuration = 300;

/** AI 렌더 가능 여부(키 설정) — 클라이언트 버튼 활성 판단용. */
export async function GET() {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  return NextResponse.json({ available: renderAvailable() });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = StudioRenderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });
  }

  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const result = await renderStudioPhotoreal(parsed.data.imageBase64, parsed.data.domain);
  return NextResponse.json(result);
}
