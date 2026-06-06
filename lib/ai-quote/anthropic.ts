/**
 * Anthropic-backed BOM generation. Returns null when no API key is configured
 * or on any error, so callers transparently fall back to the deterministic path.
 * Not exercised in tests (no network) — kept isolated and defensive.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { BomInput, BomLine, BomResult, ProductUnit } from "@/lib/types";
import { anthropicApiKey } from "@/lib/env";
import { won } from "@/lib/utils";
import { AiBomSchema } from "./schema";

const VALID_UNITS: ProductUnit[] = [
  "ea",
  "box",
  "sheet",
  "roll",
  "can",
  "bag",
  "ton",
  "m",
  "m2",
  "pallet",
];

const SYSTEM_PROMPT = `당신은 한국 인테리어·건축 자재 물량 산출(BOM) 전문가입니다.
프로젝트 정보를 받아 필요한 자재를 카테고리별로 산출합니다.
반드시 아래 JSON 스키마로만 답하세요. 설명/마크다운 금지.
{"lines":[{"category":"한글 카테고리명","categorySlug":"flooring|wallpaper|paint|tile|sanitaryware|lighting|gypsum-board|insulation|waterproofing|cement|rebar|lumber|hardware|kitchen|door|window","item":"품목명","qty":숫자,"unit":"ea|box|sheet|roll|can|bag|ton|m|m2|pallet","estUnitPrice":원단위숫자}]}`;

export async function generateBomWithAI(
  input: BomInput,
): Promise<BomResult | null> {
  const apiKey = anthropicApiKey();
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const userMsg = JSON.stringify(input);

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;

    const parsed = AiBomSchema.safeParse(
      JSON.parse(text.slice(jsonStart, jsonEnd + 1)),
    );
    if (!parsed.success) return null;

    const lines: BomLine[] = parsed.data.lines.map((l) => {
      const unit = (VALID_UNITS as string[]).includes(l.unit)
        ? (l.unit as ProductUnit)
        : "ea";
      const qty = Math.max(1, Math.ceil(l.qty));
      const estUnitPrice = won(l.estUnitPrice);
      return {
        category: l.category,
        categorySlug: l.categorySlug,
        item: l.item,
        qty,
        unit,
        estUnitPrice,
        estPrice: won(estUnitPrice * qty),
      };
    });

    const estTotal = lines.reduce((s, l) => s + l.estPrice, 0);
    return { lines, estTotal, source: "ai" };
  } catch {
    return null;
  }
}
