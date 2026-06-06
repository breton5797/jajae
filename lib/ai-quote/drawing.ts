/**
 * Drawing (floor plan) analysis via Claude vision, with a manual-rooms fallback.
 * Returns null from vision (→ caller falls back) when no key or on any error.
 * Not exercised in tests (no network); kept defensive.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  DrawingAnalysisInput,
  DrawingAnalysisResult,
  RoomArea,
  RoomType,
} from "@/lib/types";
import { anthropicApiKey } from "@/lib/env";
import { bomFromRooms, totalArea } from "./rooms-bom";
import { RoomsSchema } from "./schema";

const VALID_ROOM_TYPES: RoomType[] = [
  "living",
  "room",
  "bathroom",
  "kitchen",
  "balcony",
  "entrance",
  "other",
];

const VISION_PROMPT = `이 평면도(도면)를 분석하여 각 공간(방)의 이름, 용도, 면적(㎡)을 추정하세요.
반드시 아래 JSON으로만 답하세요. 설명/마크다운 금지.
{"rooms":[{"name":"거실","type":"living|room|bathroom|kitchen|balcony|entrance|other","areaM2":숫자}]}`;

export async function extractRoomsWithVision(
  imageBase64: string,
  mimeType: string,
): Promise<RoomArea[] | null> {
  const key = anthropicApiKey();
  if (!key) return null;

  try {
    const client = new Anthropic({ apiKey: key });
    const isPdf = mimeType === "application/pdf";

    const mediaBlock = isPdf
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: imageBase64,
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mimeType as "image/png" | "image/jpeg" | "image/webp",
            data: imageBase64,
          },
        };

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            mediaBlock,
            { type: "text", text: VISION_PROMPT },
          ] as Anthropic.MessageParam["content"],
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;

    const parsed = RoomsSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    if (!parsed.success) return null;

    return parsed.data.rooms.map((r) => ({
      name: r.name,
      type: (VALID_ROOM_TYPES as string[]).includes(r.type)
        ? (r.type as RoomType)
        : "other",
      areaM2: Math.max(0, r.areaM2),
    }));
  } catch {
    return null;
  }
}

/**
 * Analyze a drawing into rooms + BOM. Uses manual rooms if provided, else Claude
 * vision; throws a Korean error if neither yields usable room data.
 */
export async function analyzeDrawing(
  input: DrawingAnalysisInput,
): Promise<DrawingAnalysisResult> {
  let rooms: RoomArea[] | null =
    input.rooms && input.rooms.length > 0 ? input.rooms : null;
  let source: "ai" | "manual" = "manual";

  if (!rooms && input.imageBase64) {
    const v = await extractRoomsWithVision(
      input.imageBase64,
      input.mimeType ?? "image/png",
    );
    if (v && v.length > 0) {
      rooms = v;
      source = "ai";
    }
  }

  if (!rooms || rooms.length === 0) {
    throw new Error(
      "도면에서 공간 정보를 추출하지 못했습니다. 방 정보를 직접 입력해주세요.",
    );
  }

  return {
    rooms,
    totalAreaM2: totalArea(rooms),
    bom: bomFromRooms(rooms, input.specLevel, input.projectType),
    source,
  };
}
