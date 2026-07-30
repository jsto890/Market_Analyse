import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import RotationPanel, { type RotationRow } from "../RotationPanel";

const rows: RotationRow[] = [
  { industry: "Utilities", quadrant: "lagging", rs_ratio: 95, rs_mom: 90, breadth: 20, n: 25, r1w: -1, r1m: -2, r3m: -3, rank: 2, drank: 0 },
  { industry: "Energy", quadrant: "leading", rs_ratio: 105, rs_mom: 102, breadth: 60, n: 30, r1w: 1, r1m: 2, r3m: 3, rank: 1, drank: 0 },
];

describe("RotationPanel table", () => {
  it("renders every row's industry and RS-Ratio/RS-Mom values", () => {
    render(<RotationPanel rows={rows} />);
    expect(screen.getByText("Energy")).toBeInTheDocument();
    expect(screen.getByText("Utilities")).toBeInTheDocument();
    expect(screen.getByText("105.0")).toBeInTheDocument();
    expect(screen.getByText("90.0")).toBeInTheDocument();
  });

  it("defaults to rank order, not input order", () => {
    render(<RotationPanel rows={rows} />);
    const cells = screen.getAllByRole("cell").map((c) => c.textContent);
    const energyIdx = cells.findIndex((t) => t === "Energy");
    const utilitiesIdx = cells.findIndex((t) => t === "Utilities");
    expect(energyIdx).toBeGreaterThan(-1);
    expect(energyIdx).toBeLessThan(utilitiesIdx);
  });

  it("renders all ten column headers", () => {
    render(<RotationPanel rows={rows} />);
    ["Industry", "Δrank", "◉", "RS-Ratio", "RS-Mom", "Breadth", "n", "1W", "1M", "3M"].forEach((h) => {
      expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();
    });
  });
});

describe("DRank (RO-02)", () => {
  it("shows the signed value, muted, instead of hiding it behind a bare dot when below the noise threshold", () => {
    const belowThreshold: RotationRow[] = [
      { ...rows[0], industry: "Materials", drank: 1 },
    ];
    render(<RotationPanel rows={belowThreshold} />);
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.queryByText("•")).not.toBeInTheDocument();
  });

  it("still shows an em dash when drank is null", () => {
    const noDrank: RotationRow[] = [{ ...rows[0], industry: "Materials", drank: null }];
    render(<RotationPanel rows={noDrank} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
