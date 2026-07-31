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

  it("picks the sector from its table row and names that sector's candidates", async () => {
    const user = userEvent.setup();
    render(<RotationView rows={rows} namesBySector={names} />);
    await user.click(screen.getByText("Energy"));
    expect(screen.getByText(/Energy · on today/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "XOM" })).toHaveAttribute("href", "/t/XOM");
  });

  it("says which of the sector's candidates you already hold", async () => {
    mockFetchJson({ "/api/argus/portfolio": [{ symbol: "XOM", position: 200 }] });
    const user = userEvent.setup();
    render(<RotationView rows={rows} namesBySector={names} />);
    await user.click(screen.getByText("Energy"));
    expect(await screen.findByText("you hold")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /XOM \+200/ })).toHaveAttribute("href", "/portfolio");
  });

  it("says nothing about holdings for a sector none of whose candidates you own", async () => {
    mockFetchJson({ "/api/argus/portfolio": [{ symbol: "NVDA", position: 200 }] });
    const user = userEvent.setup();
    render(<RotationView rows={rows} namesBySector={names} />);
    await user.click(screen.getByText("Energy"));
    await screen.findByText(/Energy · on today/);
    expect(screen.queryByText("you hold")).not.toBeInTheDocument();
  });

  it("releases the pick when the same row is clicked again", async () => {
    const user = userEvent.setup();
    render(<RotationView rows={rows} namesBySector={names} />);
    await user.click(screen.getByText("Energy"));
    await user.click(screen.getByText("Energy"));
    expect(screen.queryByText(/on today/)).not.toBeInTheDocument();
  });
});
