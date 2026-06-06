import { describe, it, expect } from "vitest";
import {
  isValidBizNo,
  formatBizNo,
  formatKRW,
  addDays,
  won,
} from "@/lib/utils";

describe("isValidBizNo", () => {
  it("accepts valid Korean business numbers", () => {
    expect(isValidBizNo("220-81-62517")).toBe(true);
    expect(isValidBizNo("124-81-00998")).toBe(true);
    expect(isValidBizNo("1208147521")).toBe(true);
  });

  it("rejects invalid numbers / wrong length", () => {
    expect(isValidBizNo("101-81-00000")).toBe(false);
    expect(isValidBizNo("123-45-67890")).toBe(false);
    expect(isValidBizNo("123")).toBe(false);
    expect(isValidBizNo("")).toBe(false);
  });
});

describe("formatBizNo", () => {
  it("formats 10 digits as ###-##-#####", () => {
    expect(formatBizNo("2208162517")).toBe("220-81-62517");
  });
});

describe("formatKRW / won", () => {
  it("formats integer KRW", () => {
    expect(formatKRW(1234000)).toBe("1,234,000원");
    expect(won(1000.6)).toBe(1001);
  });
});

describe("addDays", () => {
  it("adds days across month boundaries (UTC-safe)", () => {
    expect(addDays("2026-06-07", 30)).toBe("2026-07-07");
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01"); // 2026 not leap
    expect(addDays("2024-02-27", 2)).toBe("2024-02-29"); // 2024 leap
  });
});
