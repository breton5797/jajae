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

import { ClosingCta } from "@/components/landing/closing-cta";

afterEach(cleanup);

describe("ClosingCta", () => {
  it("renders heading and both CTAs", () => {
    render(<ClosingCta />);
    expect(
      screen.getByRole("heading", { name: /지금 바로 견적을 받아보세요/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /AI 견적 받기/ })).toHaveAttribute(
      "href",
      "/ai-quote",
    );
    expect(
      screen.getByRole("link", { name: /카탈로그 둘러보기/ }),
    ).toHaveAttribute("href", "/catalog");
  });
});
