import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { resetLocalStorage } from "@/test/localStorage";
import DataTable, { type Column } from "@/components/ui/DataTable";

interface Row {
  id: string;
  symbol: string;
  score: number;
}

const ROWS: Row[] = [
  { id: "a", symbol: "AAPL", score: 0.8 },
  { id: "b", symbol: "TSLA", score: 0.4 },
];

const COLUMNS: Column<Row>[] = [
  { key: "symbol", header: "Symbol", render: (r) => r.symbol },
  { key: "score", header: "Score", sortable: true, sortFn: (a, b) => a.score - b.score, render: (r) => r.score.toFixed(2) },
];

beforeEach(() => resetLocalStorage());

describe("DataTable", () => {
  it("does not set outline-none on the scrollable container (UI-07)", () => {
    const { container } = render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    const scrollDiv = container.querySelector("[tabindex='0']") as HTMLElement;
    expect(scrollDiv.className).not.toMatch(/(?<!:)outline-none/);
  });

  it("gives the first column an explicit (not bg-inherit) sticky background per zebra row (UI-06)", () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    const evenCell = screen.getByText("AAPL").closest("td") as HTMLElement;
    const oddCell = screen.getByText("TSLA").closest("td") as HTMLElement;
    expect(evenCell.className).not.toMatch(/bg-inherit/);
    expect(oddCell.className).not.toMatch(/bg-inherit/);
    expect(evenCell.className).toMatch(/bg-surface/);
    expect(oddCell.className).toMatch(/bg-bg/);
  });

  it("renders a visually-hidden caption when supplied (A11Y-06)", () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} caption="Screener results" />);
    expect(screen.getByText("Screener results").tagName).toBe("CAPTION");
  });

  it("renders no caption element when omitted, so existing call sites are unaffected", () => {
    const { container } = render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    expect(container.querySelector("caption")).toBeNull();
  });

  it("sets scope=col on every header cell (A11Y-06)", () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    expect(screen.getByRole("columnheader", { name: "Symbol" })).toHaveAttribute("scope", "col");
    expect(screen.getByRole("columnheader", { name: /Score/ })).toHaveAttribute("scope", "col");
  });

  it("expands a row via grid-template-rows, not a fixed max-height (UI-04)", async () => {
    const { container } = render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        expandedRender={(r) => <div>{r.symbol} detail</div>}
      />
    );
    await userEvent.click(screen.getByText("AAPL"));
    const detailWrapper = screen.getByText("AAPL detail").closest("div[style]") as HTMLElement;
    expect(detailWrapper.style.gridTemplateRows).toBe("1fr");
    expect(container.innerHTML).not.toMatch(/max-height/);
  });
});
