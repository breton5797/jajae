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

import { PoSplitSpotlight } from "@/components/landing/po-split-spotlight";

afterEach(cleanup);

describe("PoSplitSpotlight", () => {
  it("renders heading, PO split copy and CTA", () => {
    render(<PoSplitSpotlight />);
    expect(
      screen.getByRole("heading", {
        name: /한 번의 주문, 공급사별 발주서로 자동 분할/,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/발주서/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: /카탈로그 둘러보기/ }),
    ).toHaveAttribute("href", "/catalog");
  });
});
