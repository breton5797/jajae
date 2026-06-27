import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CapabilityList } from "@/components/landing/capability-list";

afterEach(cleanup);

describe("CapabilityList", () => {
  it("renders the four numbered capabilities", () => {
    render(<CapabilityList />);
    ["01", "02", "03", "04"].forEach((n) =>
      expect(screen.getByText(n)).toBeInTheDocument(),
    );
    expect(screen.getByText("전 카테고리 자재")).toBeInTheDocument();
    expect(screen.getByText("AI 자재 물량산출")).toBeInTheDocument();
    expect(screen.getByText("다중 공급사 통합주문")).toBeInTheDocument();
    expect(screen.getByText("현장별 통합 관리")).toBeInTheDocument();
  });
});
