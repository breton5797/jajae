/**
 * Anthropic 기반 반품 분류. 키 미설정/오류 시 null을 반환해 호출자가 결정론 폴백으로
 * 투명하게 넘어가게 한다. 테스트에서 실행하지 않음(무네트워크) — 격리·방어적.
 */
import Anthropic from "@anthropic-ai/sdk";
import { anthropicApiKey } from "@/lib/env";
import type { ReturnClassification } from "@/lib/types";
import { ReturnClassificationSchema } from "./schema";

const SYSTEM_PROMPT = `당신은 한국 B2B 건축자재 플랫폼의 반품 분쟁 분류 전문가입니다.
반품 사유와 정보를 받아 책임 소재와 처리 제안을 판단합니다.
반드시 아래 JSON 스키마로만 답하세요. 설명/마크다운 금지.
{"responsibility":"supplier|delivery|contractor|ambiguous","decision":"approve|reject|ambiguous","confidence":0과1사이숫자,"rationale":"한 줄 근거"}
- supplier=공급사 귀책(불량/하자), delivery=배송 귀책(파손/오배송), contractor=시공사 귀책(단순변심/주문실수), ambiguous=불명확
- decision=approve는 명백한 환불 사유일 때만. 불명확하면 ambiguous(거부는 사람이 판단).`;

export async function classifyReturnWithAI(input: {
  reason: string;
  productName: string;
  qty: number;
  refundAmount: number;
}): Promise<ReturnClassification | null> {
  const apiKey = anthropicApiKey();
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(input) }],
    });
    const block = response.content[0];
    if (!block || block.type !== "text") return null;
    const parsed = ReturnClassificationSchema.safeParse(JSON.parse(block.text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
