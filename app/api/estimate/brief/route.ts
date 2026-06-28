import { NextResponse } from "next/server";
import { z } from "zod";
import { extractBrief } from "@/lib/estimate/brief";

export const dynamic = "force-dynamic";

const InputSchema = z.object({
  transcript: z.string().min(1),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const brief = await extractBrief(parsed.data.transcript);
  return NextResponse.json(brief);
}
