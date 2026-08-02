import { describe, it, expect } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import SectorStrip from "../SectorStrip";
import type { RotationRow } from "../RotationPanel";

function row(industry: string, r1w: number | null, quadrant = "leading"): RotationRow {
  return {
    industry,
    quadrant,
    rs_ratio: 101,
    rs_mom: 101,
    breadth: 50,
    n: 30,
    r1w,
    r1m: 2,
    r3m: 3,
    rank: 1,
    drank: 0,
  };
}

const rows: RotationRow[] = [
  row("Utilities", -1.1, "lagging"),
  row("Semiconductors", 1.2),
  row("Software - Infrastructure", 0.4, "improving"),
];

describe("SectorStrip layout (T-17)", () => {
  it("lays the sectors out in one fixed eleven-column row, strongest first", () => {
    const { container } = render(<SectorStrip rows={rows} />);
    const grid = container.querySelector("div.grid-cols-11") as HTMLElement;
    expect(grid.className).toMatch(/\bgrid-cols-11\b/);
    expect(grid.className).toMatch(/\bgap-1\b/);

    const cells = Array.from(grid.children).map((c) => c.textContent);
    expect(cells).toEqual([
      "Semiconductors+1.2%",
      "Software - Infrastructure+0.4%",
      "Utilities-1.1%",
    ]);
  });

  it("gives each cell radius 4 and the mock's 7px/4px padding, centred", () => {
    const { container } = render(<SectorStrip rows={rows} />);
    const cell = container.querySelector("div.grid-cols-11 a") as HTMLElement;
    expect(cell.className).toMatch(/rounded-\[4px\]/);
    expect(cell.className).toMatch(/p-\[7px_4px\]/);
    expect(cell.className).toMatch(/text-center/);
  });

  it("keeps the heat tint behind each cell", () => {
    const { container } = render(<SectorStrip rows={rows} />);
    const [first] = Array.from(container.querySelectorAll("div.grid-cols-11 a")) as HTMLElement[];
    expect(first.style.backgroundColor).not.toBe("");
  });

  it("renders no value at all — not a dash — when the week's return is missing", () => {
    const { container } = render(<SectorStrip rows={[row("Uranium", null)]} />);
    const cell = container.querySelector("div.grid-cols-11 a") as HTMLElement;
    expect(cell.textContent).toBe("Uranium");
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  // The mock's eleven GICS sectors are a fixed set; the rotation job emits a
  // variable industry list, and twelve of them wrapped onto a second line with
  // one orphan cell. Eleven columns is the floor, not the cap.
  it("stays one row when the feed emits more industries than the mock's eleven", () => {
    const many = Array.from({ length: 14 }, (_, i) => row(`Industry ${i}`, 14 - i));
    const { container } = render(<SectorStrip rows={many} />);
    const grid = container.querySelector("div.grid-cols-11") as HTMLElement;
    expect(grid.children.length).toBe(14);
    expect(grid.style.gridTemplateColumns).toBe("repeat(14, minmax(0,1fr))");
  });

  it("leaves the eleven-column track alone when the feed fits inside it", () => {
    const { container } = render(<SectorStrip rows={rows} />);
    const grid = container.querySelector("div.grid-cols-11") as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("");
  });
});

describe("SectorStrip tooltip (T-17)", () => {
  it("never uses a title attribute", () => {
    const { container } = render(<SectorStrip rows={rows} />);
    expect(container.querySelectorAll("[title]").length).toBe(0);
  });

  it("defers the full industry name and its quadrant to a hover tooltip", async () => {
    render(<SectorStrip rows={rows} />);
    await userEvent.hover(screen.getByRole("link", { name: /Semiconductors/ }));
    expect((await screen.findAllByText("Semiconductors · Leading")).length).toBeGreaterThan(0);
  });
});

describe("SectorStrip links (T-18)", () => {
  it("deep-links each cell to its own sector and wraps the band in no second link", () => {
    const { container } = render(<SectorStrip rows={rows} />);
    const grid = container.querySelector("div.grid-cols-11") as HTMLElement;
    expect(grid.closest("a")).toBeNull();

    const cellLinks = Array.from(grid.querySelectorAll("a"));
    expect(cellLinks).toHaveLength(rows.length);
    expect(cellLinks.map((a) => a.getAttribute("href"))).toEqual([
      "/rotation?sector=Semiconductors",
      "/rotation?sector=Software%20-%20Infrastructure",
      "/rotation?sector=Utilities",
    ]);
  });

  it("heads the band with an eyebrow and a Full RRG link in accent", () => {
    render(<SectorStrip rows={rows} />);
    expect(screen.getByText("Sector rotation")).toHaveClass("eyebrow");
    const rrg = screen.getByRole("link", { name: "Full RRG →" });
    expect(rrg).toHaveAttribute("href", "/rotation");
    expect(rrg.className).toMatch(/\btext-label\b/);
    expect(rrg.className).toMatch(/\btext-accent\b/);
  });
});
