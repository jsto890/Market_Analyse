import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import { render, screen } from "@/test/render";
import RotationPage from "../page";

describe("RotationPage header (RO-08)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a page title and the rotation file's last-modified time", () => {
    const rows = [
      { industry: "Energy", quadrant: "leading", rs_ratio: 105, rs_mom: 102, breadth: 60, n: 30, r1w: 1, r1m: 2, r3m: 3, rank: 1, drank: 0 },
    ];
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(rows));
    vi.spyOn(fs, "statSync").mockReturnValue({ mtime: new Date("2026-07-28T21:00:00Z") } as fs.Stats);

    render(<RotationPage />);

    expect(screen.getByText("Sector Rotation")).toBeInTheDocument();
    expect(screen.getByText(/as of/)).toBeInTheDocument();
    expect(screen.getByText(/run_daily/)).toBeInTheDocument();
  });

  it("shows the warn banner and no timestamp when the rotation file is missing", () => {
    vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw new Error("ENOENT");
    });
    vi.spyOn(fs, "statSync").mockImplementation(() => {
      throw new Error("ENOENT");
    });

    render(<RotationPage />);

    expect(screen.getByText("Sector Rotation")).toBeInTheDocument();
    expect(screen.getByText("no timestamp")).toBeInTheDocument();
    expect(screen.getByText("No rotation data")).toBeInTheDocument();
    expect(screen.getByText(/run_daily rotation job may have failed/)).toBeInTheDocument();
  });
});
