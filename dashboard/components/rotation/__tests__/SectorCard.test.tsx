import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import SectorCard from "@/components/rotation/SectorCard";
import type { RotationRow } from "@/components/today/RotationPanel";

const row: RotationRow = {
  industry: "Uranium", quadrant: "leading", rs_ratio: 103.2, rs_mom: 102.4,
  breadth: 60, n: 25, r1w: 1.2, r1m: 4.8, r3m: 9.0, rank: 1, drank: 4,
};

describe("SectorCard", () => {
  it("names the sector, its quadrant and its three numbers", () => {
    render(<SectorCard row={row} names={[]} />);
    expect(screen.getByText("Uranium")).toBeInTheDocument();
    expect(screen.getByText("Leading")).toBeInTheDocument();
    expect(screen.getByText("103.2")).toBeInTheDocument();
    expect(screen.getByText("102.4")).toBeInTheDocument();
    expect(screen.getByText("+4.8%")).toBeInTheDocument();
    expect(screen.getByText("103.2").previousElementSibling).toHaveTextContent("RS-Ratio");
    expect(screen.getByText("102.4").previousElementSibling).toHaveTextContent("RS-Mom");
  });

  it("links the names this sector put on today's list", () => {
    render(<SectorCard row={row} names={[{ ticker: "CCJ" }, { ticker: "UEC" }]} />);
    expect(screen.getByRole("link", { name: "CCJ" })).toHaveAttribute("href", "/t/CCJ");
    expect(screen.getByRole("link", { name: "UEC" })).toHaveAttribute("href", "/t/UEC");
  });

  it("says the rotation is there and the setups are not, rather than showing an empty row", () => {
    render(<SectorCard row={row} names={[]} />);
    expect(screen.getByText(/Nothing from this sector made today/)).toBeInTheDocument();
  });

  it("omits the 1M figure entirely when the feed has none", () => {
    render(<SectorCard row={{ ...row, r1m: null }} names={[]} />);
    expect(screen.queryByText("1M")).not.toBeInTheDocument();
  });

  it("marks the names you already hold", () => {
    const held = new Map([["CCJ", 100]]);
    render(
      <SectorCard row={row} names={[{ ticker: "CCJ" }, { ticker: "UEC" }]} held={held} />
    );
    expect(screen.getByText("you hold")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CCJ +100" })).toHaveAttribute("href", "/portfolio");
  });

  it("marks nothing held when no held map is passed", () => {
    render(<SectorCard row={row} names={[{ ticker: "CCJ" }, { ticker: "UEC" }]} />);
    expect(screen.queryByText("you hold")).not.toBeInTheDocument();
  });
});
