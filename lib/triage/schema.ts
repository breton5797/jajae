import { z } from "zod";

/** Claude가 반환해야 하는 분류 형태; 신뢰 전에 검증한다. */
export const ReturnClassificationSchema = z.object({
  responsibility: z.enum(["supplier", "delivery", "contractor", "ambiguous"]),
  decision: z.enum(["approve", "reject", "ambiguous"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

export type ReturnClassificationParsed = z.infer<typeof ReturnClassificationSchema>;
