import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { mockFetchJson } from "@/test/fetchMock";
import RotationView from "../RotationView";
import type { RotationRow } from "@/components/today/RotationPanel";

const rows: RotationRow[] = [
  { industry: "Energy", quadrant: "leading", rs_ratio: 105, rs_mom: 102, breadth: 60, n: 30, r1w: 1, r1m: 2, r3m: 3, rank: 1, drank: 0 },
  { industry: "Utilities", quadrant: "lagging", rs_ratio: 95, rs_mom: 90, breadth: 20, n: 25, r1w: -1, r1m: -2, r3m: -3, rank: 2, drank: 0 },
];

const names = { Energy: [{ ticker: "XOM" }] };

beforeEach(() => {
  mockFetchJson(() => []);
});

describe("RotationView — the table is the chart's legend", () => {
  it("names each sector exactly once on the page", () => {
    render(<RotationView rows={rows} namesBySector={names} />);
    expect(screen.getAllByText("Energy")).toHaveLength(1);
    expect(screen.getAllByText("Utilities")).toHaveLength(1);
  });

  it("prints the plot index in front of each industry so a point resolves to a row", () => {
    render(<RotationView rows={rows} namesBySector={names} />);
    const energyCell = screen.getByText("Energy").closest("td")!;
    expect(energyCell.textContent).toBe("1Energy");
    expect(screen.getByText("Utilities").closest("td")!.textContent).toBe("2Utilities");
  });

  it("highlights the picked row", async () => {
    const user = userEvent.setup();
    render(<RotationView rows={rows} namesBySector={names} />);
    const energyRow = screen.getByText("Energy").closest("tr")!;
    expect(energyRow.className).not.toMatch(/ring-accent/);
    await user.click(screen.getByText("Energy"));
    expect(energyRow.className).toMatch(/ring-accent/);
  });
});

const trailRows: RotationRow[] = [
  { industry: "Uranium", quadrant: "leading", rs_ratio: 103.2, rs_mom: 102.4,
    breadth: 60, n: 25, r1w: 1.2, r1m: 4.8, r3m: 9.0, rank: 1, drank: 4 },
  { industry: "Software—Application", quadrant: "lagging", rs_ratio: 97.1, rs_mom: 98.2,
    breadth: 30, n: 40, r1w: -0.4, r1m: -2.1, r3m: -5.0, rank: 2, drank: -3 },
];

const trailHistory = {
  "2026-06-08": { Uranium: [101.0, 100.2] as [number, number] },
  "2026-06-15": { Uranium: [101.6, 100.9] as [number, number] },
  "2026-07-13": { Uranium: [102.4, 101.5] as [number, number] },
  "2026-07-20": { Uranium: [102.8, 101.9] as [number, number] },
  "2026-08-03": { Uranium: [103.2, 102.4] as [number, number] },
};

describe("RotationView — trail length", () => {
  it("offers 4w, 8w and Off, defaulting to 8w", () => {
    render(<RotationView rows={trailRows} history={trailHistory} />);
    const control = screen.getByRole("radiogroup", { name: /trail/i });
    expect(control).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "8w" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "4w" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Off" })).toBeInTheDocument();
  });

  it("stops announcing tails once they are off", async () => {
    const user = userEvent.setup();
    render(<RotationView rows={trailRows} history={trailHistory} />);
    expect(screen.getByText(/week tails/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Off" }));
    expect(screen.queryByText(/week tails/)).not.toBeInTheDocument();
  });
});
