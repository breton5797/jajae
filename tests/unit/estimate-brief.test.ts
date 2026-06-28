/**
 * 결정론적 키워드 추출기 단위 테스트.
 *
 * 예산/방개수 정규식은 한국어의 자연스러운 표현을 모두 지원한다:
 * - 예산: "5억"(×1e8) · "5천만원"(×1e7) · "5000만원"(×1e4) 모두 매칭.
 * - 방 개수: "3방"/"3룸"/"3침실"(숫자 선행) 및 "방 3개"(숫자 후행) 모두 매칭.
 */
import { describe, it, expect } from "vitest";
import { extractBriefDeterministic } from "@/lib/estimate/brief";

describe("extractBriefDeterministic", () => {
  it("30평 전체 리모델링 3방 고급 5000만원 → premium / apartment_remodel / 거실·주방·화장실 포함 / 5천만원 예산", () => {
    const brief = extractBriefDeterministic(
      "30평 아파트 전체 리모델링 3방 고급 자재 5000만원",
    );
    expect(brief.specLevel).toBe("premium");
    expect(brief.projectType).toBe("apartment_remodel");
    expect(brief.rooms.length).toBeGreaterThan(0);
    const names = brief.rooms.map((r) => r.name);
    expect(names).toContain("거실");
    expect(names).toContain("주방");
    expect(names.some((n) => n.includes("화장실"))).toBe(true);
    expect(brief.budgetKRW).toBe(50_000_000);
  });

  it("상가 인테리어 기본 사양 → commercial_interior / economy", () => {
    const brief = extractBriefDeterministic("상가 인테리어 기본 사양");
    expect(brief.projectType).toBe("commercial_interior");
    expect(brief.specLevel).toBe("economy");
  });

  it("빈 문자열 → 유효한 EstimateBrief (기본값: apartment_remodel / standard / rooms 비어 있지 않음 / budgetKRW undefined)", () => {
    let brief: ReturnType<typeof extractBriefDeterministic> | undefined;
    expect(() => {
      brief = extractBriefDeterministic("");
    }).not.toThrow();
    expect(brief).toBeDefined();
    expect(brief!.projectType).toBe("apartment_remodel");
    expect(brief!.specLevel).toBe("standard");
    expect(brief!.rooms.length).toBeGreaterThan(0);
    expect(brief!.budgetKRW).toBeUndefined();
  });

  it("가비지 입력 → 유효한 EstimateBrief, 예외 없음", () => {
    let brief: ReturnType<typeof extractBriefDeterministic> | undefined;
    expect(() => {
      brief = extractBriefDeterministic("!@#$%^&* ??? 알 수 없는 입력");
    }).not.toThrow();
    expect(brief).toBeDefined();
    expect(["economy", "standard", "premium"]).toContain(brief!.specLevel);
    expect([
      "apartment_remodel",
      "bathroom",
      "kitchen",
      "commercial_interior",
      "new_build",
    ]).toContain(brief!.projectType);
  });

  it("'5천만원' → budgetKRW 50,000,000", () => {
    const brief = extractBriefDeterministic("30평 아파트 예산 5천만원");
    expect(brief.budgetKRW).toBe(50_000_000);
  });

  it("'방 3개' (숫자 후행) → 침실 3개 생성", () => {
    const brief = extractBriefDeterministic("32평 아파트 방 3개 리모델링");
    expect(brief.rooms.filter((r) => r.type === "room").length).toBe(3);
  });

  it("'5억' 패턴 → budgetKRW 500,000,000", () => {
    const brief = extractBriefDeterministic("30평 아파트 예산 5억");
    expect(brief.budgetKRW).toBe(500_000_000);
  });

  it("'5000만원' 패턴 → budgetKRW 50,000,000", () => {
    const brief = extractBriefDeterministic("25평 예산 5000만원");
    expect(brief.budgetKRW).toBe(50_000_000);
  });
});
