import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

import HomePage from "@/app/page";

afterEach(cleanup);

describe("HomePage", () => {
  it("assembles all premium landing sections", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "한 번에.",
    );
    expect(screen.getByText("01")).toBeInTheDocument(); // capability list
    expect(screen.getByText(/BOM 산출 결과/)).toBeInTheDocument(); // ai-quote spotlight
    expect(
      screen.getByRole("heading", { name: /공급사별 발주서로 자동 분할/ }),
    ).toBeInTheDocument(); // po-split
    expect(
      screen.getByRole("heading", { name: /지금 바로 견적을 받아보세요/ }),
    ).toBeInTheDocument(); // closing
  });
});
