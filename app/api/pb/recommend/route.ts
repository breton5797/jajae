import { NextResponse } from "next/server";
import { loadPbCandidates } from "@/lib/data/pb";

export const dynamic = "force-dynamic";

export async function GET() {
  const candidates = await loadPbCandidates();
  return NextResponse.json({ candidates });
}
