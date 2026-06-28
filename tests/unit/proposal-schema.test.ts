import { describe, it, expect } from "vitest";
import {
  ProposalInputSchema,
  ShareInputSchema,
  SharedAccessSchema,
} from "@/lib/proposal/schema";

const VALID_BRIEF = {
  projectType: "apartment_remodel",
  specLevel: "standard",
  rooms: [{ name: "거실", type: "living", widthM: 5, lengthM: 4 }],
  pyeong: 25,
};

describe("proposal zod schemas", () => {
  it("ProposalInputSchema: 유효 브리프 통과", () => {
    const r = ProposalInputSchema.safeParse({ brief: VALID_BRIEF, customerName: "홍길동" });
    expect(r.success).toBe(true);
  });

  it("ProposalInputSchema: 빈 rooms 거부", () => {
    const r = ProposalInputSchema.safeParse({ brief: { ...VALID_BRIEF, rooms: [] } });
    expect(r.success).toBe(false);
  });

  it("ShareInputSchema: 비밀번호 4자 미만 거부", () => {
    expect(ShareInputSchema.safeParse({ password: "12", expiresInDays: 7 }).success).toBe(false);
    expect(ShareInputSchema.safeParse({ password: "1234", expiresInDays: 7 }).success).toBe(true);
  });

  it("SharedAccessSchema: 비밀번호 필수", () => {
    expect(SharedAccessSchema.safeParse({}).success).toBe(false);
    expect(SharedAccessSchema.safeParse({ password: "1234" }).success).toBe(true);
  });
});
