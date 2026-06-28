import { NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/stt/whisper";
import { TranscribeSchema } from "@/lib/estimate/schema";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = TranscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const transcript = await transcribeAudio(
    parsed.data.audioBase64,
    parsed.data.mimeType,
  );

  if (transcript === null) {
    // API 키 미설정 또는 오류 — UI가 수동 입력으로 전환하도록 안내
    return NextResponse.json({ transcript: "", source: "manual" });
  }

  return NextResponse.json({ transcript, source: "whisper" });
}
