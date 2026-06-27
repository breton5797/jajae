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

import { AiQuoteSpotlight } from "@/components/landing/ai-quote-spotlight";

afterEach(cleanup);

describe("AiQuoteSpotlight", () => {
  it("renders heading, BOM mock and CTA", () => {
    render(<AiQuoteSpotlight />);
    expect(
      screen.getByRole("heading", {
        name: /평수만 입력하면, AI가 물량을 산출합니다/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/BOM 산출 결과/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /AI 견적 받기/ })).toHaveAttribute(
      "href",
      "/ai-quote",
    );
  });
});
