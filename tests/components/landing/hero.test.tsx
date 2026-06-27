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

import { Hero } from "@/components/landing/hero";

afterEach(cleanup);

describe("Hero", () => {
  it("renders the h1 headline", () => {
    render(<Hero />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("현장 자재");
    expect(h1).toHaveTextContent("한 번에.");
  });

  it("links the primary CTAs to the right routes", () => {
    render(<Hero />);
    expect(screen.getByRole("link", { name: /카탈로그 둘러보기/ })).toHaveAttribute(
      "href",
      "/catalog",
    );
    expect(screen.getByRole("link", { name: /AI 견적 받기/ })).toHaveAttribute(
      "href",
      "/ai-quote",
    );
    expect(screen.getByRole("link", { name: /사업자 인증/ })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
