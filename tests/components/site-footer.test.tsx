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

import { SiteFooter } from "@/components/site-footer";

afterEach(cleanup);

describe("SiteFooter", () => {
  it("renders product links and copyright", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "카탈로그" })).toHaveAttribute(
      "href",
      "/catalog",
    );
    expect(screen.getByRole("link", { name: "공동구매" })).toHaveAttribute(
      "href",
      "/group-buy",
    );
    expect(screen.getByRole("link", { name: "사업자 인증" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.getByText(/자재\. 인테리어·건축자재 통합 플랫폼/),
    ).toBeInTheDocument();
  });
});
