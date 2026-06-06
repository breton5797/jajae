/**
 * lib/ai-quote — AI quote / BOM (자재 물량 산출) public surface.
 * generateBom() tries Claude, falls back to the deterministic estimator.
 */
import type { BomInput, BomResult } from "@/lib/types";
import { generateBomDeterministic } from "./bom";
import { generateBomWithAI } from "./anthropic";

export async function generateBom(input: BomInput): Promise<BomResult> {
  const ai = await generateBomWithAI(input).catch(() => null);
  return ai ?? generateBomDeterministic(input);
}

export { generateBomDeterministic } from "./bom";
export { matchBomToProducts } from "./match";
export { BomInputSchema, type BomInputParsed } from "./schema";
