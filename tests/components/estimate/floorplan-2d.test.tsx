import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { FloorPlan2D } from "@/components/estimate/floorplan-2d";
import type { FloorPlan } from "@/lib/types";

afterEach(cleanup);

const PLAN: FloorPlan = {
  widthM: 8,
  lengthM: 6,
  rooms: [
    { name: "거실", type: "living", x: 0, y: 0, w: 4, h: 3 },
    { name: "주방", type: "kitchen", x: 4, y: 0, w: 2, h: 2 },
  ],
};

describe("FloorPlan2D", () => {
  it("renders an accessible SVG with each room name", () => {
    render(<FloorPlan2D plan={PLAN} />);
    expect(screen.getByRole("img", { name: /개략 평면도/ })).toBeInTheDocument();
    expect(screen.getByText("거실")).toBeInTheDocument();
    expect(screen.getByText("주방")).toBeInTheDocument();
  });

  it("labels each room with its dimensions", () => {
    render(<FloorPlan2D plan={PLAN} />);
    expect(screen.getByText("4.0×3.0m")).toBeInTheDocument();
    expect(screen.getByText("2.0×2.0m")).toBeInTheDocument();
  });

  it("shows the schematic disclaimer", () => {
    render(<FloorPlan2D plan={PLAN} />);
    expect(screen.getByText(/개략 평면도 \(치수 기반 자동 배치\)/)).toBeInTheDocument();
  });

  it("renders an empty-state message when there are no rooms", () => {
    render(<FloorPlan2D plan={{ widthM: 0, lengthM: 0, rooms: [] }} />);
    expect(screen.getByText("평면도 데이터가 없습니다")).toBeInTheDocument();
  });
});
