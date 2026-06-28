/**
 * EstimateBrief extraction from a consultation transcript.
 * Primary path: Claude JSON extraction (same pattern as ai-quote/drawing.ts).
 * Fallback: deterministic keyword extractor — 100% offline, unit-testable.
 * Never throws; always returns a valid EstimateBrief.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  EstimateBrief,
  EstimateRoom,
  ProjectType,
  RoomType,
  SpecLevel,
} from "@/lib/types";
import { anthropicApiKey } from "@/lib/env";
import { BriefSchema } from "./schema";

const PYEONG_TO_M2 = 3.305;

const BRIEF_SYSTEM_PROMPT = `당신은 한국 인테리어 상담 전사문에서 공사 정보를 추출하는 전문가입니다.
반드시 아래 JSON 스키마로만 답하세요. 설명/마크다운 금지.
{"projectType":"apartment_remodel|bathroom|kitchen|commercial_interior|new_build","specLevel":"economy|standard|premium","rooms":[{"name":"방이름","type":"living|room|bathroom|kitchen|balcony|entrance|other","widthM":숫자,"lengthM":숫자}],"budgetKRW":숫자_또는_생략,"materialPrefs":["선호자재"],"notes":"기타_또는_생략"}`;

async function extractBriefWithClaude(
  transcript: string,
): Promise<EstimateBrief | null> {
  const key = anthropicApiKey();
  if (!key) return null;

  try {
    const client = new Anthropic({ apiKey: key });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: BRIEF_SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;

    const parsed = BriefSchema.safeParse(
      JSON.parse(text.slice(start, end + 1)),
    );
    if (!parsed.success) return null;

    return parsed.data;
  } catch {
    return null;
  }
}

// ── Deterministic helpers ──────────────────────────────────────────────────

function extractProjectType(text: string): ProjectType {
  if (/상가|사무실|카페|매장|상업/.test(text)) return "commercial_interior";
  if (/신축|신건축/.test(text)) return "new_build";
  if (/화장실|욕실|욕조|샤워/.test(text) && !/전체|아파트/.test(text))
    return "bathroom";
  if (/주방|부엌/.test(text) && !/전체|아파트/.test(text)) return "kitchen";
  return "apartment_remodel";
}

function extractSpecLevel(text: string): SpecLevel {
  if (/고급|프리미엄|럭셔리|최고급/.test(text)) return "premium";
  if (/기본|이코노미|저가|실속|저예산/.test(text)) return "economy";
  return "standard";
}

function extractBudgetKRW(text: string): number | undefined {
  const matchEok = text.match(/(\d+(?:\.\d+)?)\s*억/);
  if (matchEok?.[1]) return Math.round(Number(matchEok[1]) * 100_000_000);
  // "5천만원" → 5 × 1e7. Must precede the plain 만원 branch (천만 ≠ 만).
  const matchCheonman = text.match(/(\d+(?:\.\d+)?)\s*천만\s*원?/);
  if (matchCheonman?.[1]) return Math.round(Number(matchCheonman[1]) * 10_000_000);
  const matchMan = text.match(/(\d+(?:\.\d+)?)\s*만\s*원/);
  if (matchMan?.[1]) return Math.round(Number(matchMan[1]) * 10_000);
  return undefined;
}

function extractRoomCount(text: string): number {
  // Matches both "방 3개" (number after noun) and "3방"/"3개의 방" (number before).
  const m =
    text.match(/(?:방|룸|침실)\s*(\d+)\s*개/) ??
    text.match(/(\d+)\s*(?:개의?\s*)?(?:방|룸|침실)/);
  const raw = m?.[1];
  return raw ? Math.min(Math.max(Number(raw), 1), 5) : 2;
}

function sq(areaM2: number): number {
  return Math.round(Math.sqrt(Math.max(1, areaM2)) * 100) / 100;
}

function buildRooms(pyeong: number, roomCount: number): EstimateRoom[] {
  const totalM2 = pyeong * PYEONG_TO_M2;
  const livingM2 = totalM2 * 0.3;
  const kitchenM2 = totalM2 * 0.12;
  const bathM2 = 4.5;
  const bathroomCount = roomCount >= 3 ? 2 : 1;
  const remainingM2 = Math.max(
    0,
    totalM2 - livingM2 - kitchenM2 - bathM2 * bathroomCount,
  );
  const roomM2 = roomCount > 0 ? remainingM2 / roomCount : 0;

  const baseRooms: EstimateRoom[] = [
    { name: "거실", type: "living" as RoomType, widthM: sq(livingM2 * 1.4), lengthM: sq(livingM2 / 1.4) },
    { name: "주방", type: "kitchen" as RoomType, widthM: sq(kitchenM2), lengthM: sq(kitchenM2) },
  ];

  const bedRooms: EstimateRoom[] = Array.from(
    { length: roomCount },
    (_, i) => ({
      name: i === 0 ? "안방" : `방${i + 1}`,
      type: "room" as RoomType,
      widthM: sq(roomM2),
      lengthM: sq(roomM2),
    }),
  );

  const bathRooms: EstimateRoom[] = Array.from(
    { length: bathroomCount },
    (_, i) => ({
      name: i === 0 ? "화장실" : `화장실${i + 1}`,
      type: "bathroom" as RoomType,
      widthM: sq(bathM2),
      lengthM: sq(bathM2),
    }),
  );

  return [...baseRooms, ...bedRooms, ...bathRooms];
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Deterministic keyword-based extractor. Exported for offline unit tests.
 * Parses 평형/평수, 방 개수, spec level keywords, and budget from the transcript.
 */
export function extractBriefDeterministic(transcript: string): EstimateBrief {
  const pyeongMatch = transcript.match(/(\d+(?:\.\d+)?)\s*평/);
  const pyeong = pyeongMatch?.[1] ? Number(pyeongMatch[1]) : 25;
  const roomCount = extractRoomCount(transcript);

  return {
    projectType: extractProjectType(transcript),
    specLevel: extractSpecLevel(transcript),
    rooms: buildRooms(pyeong, roomCount),
    budgetKRW: extractBudgetKRW(transcript),
  };
}

/**
 * Extract EstimateBrief from a consultation transcript.
 * Tries Claude first; falls back to deterministic extractor on any failure.
 * Never throws.
 */
export async function extractBrief(
  transcript: string,
): Promise<EstimateBrief> {
  const ai = await extractBriefWithClaude(transcript).catch(() => null);
  return ai ?? extractBriefDeterministic(transcript);
}
