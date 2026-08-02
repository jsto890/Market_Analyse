import DataTable, { type Column } from "@/components/ui/DataTable";
import Panel from "@/components/ui/Panel";
import { ReadThisTerm } from "@/components/ui/ReadThis";
import { compactNumber } from "@/lib/format";

/**
 * A row of `/api/unusual/{symbol}`. Wider than `UnusualRow` in
 * `lib/odteCompanion`, which stops at the fields the summary card uses — this
 * table also needs `last` (to approximate premium) and `expiry`.
 */
export interface UnusualPrint {
  contract: string;
  side: string;
  expiry: string;
  strike: number;
  score: number;
  vol: number | null;
  oi: number | null;
  last: number | null;
  persistence: number;
}

export interface UnusualFlowPayload {
  symbol: string;
  as_of: string;
  rows: UnusualPrint[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isCall(side: string): boolean {
  return side.toUpperCase().startsWith("C");
}

/**
 * Size against the open interest already standing at that contract. Above 1 the
 * print is larger than the whole book behind it, so it opened positioning
 * rather than recycling it. `0` open interest means the strike had no book at
 * all; `null` means the feed did not carry one.
 */
export function vsOi(row: UnusualPrint): number | null {
  if (row.vol == null || row.oi == null || row.oi === 0) return null;
  return row.vol / row.oi;
}

export function strikeLabel(strike: number): string {
  return Number.isInteger(strike) ? String(strike) : strike.toFixed(1);
}

function expiryLabel(expiry: string, asOf?: string): string {
  if (asOf && expiry === asOf) return "0DTE";
  const [, m, d] = expiry.split("-").map(Number);
  if (!m || !d || m < 1 || m > 12) return expiry;
  return `${d} ${MONTHS[m - 1]}`;
}

/** Last price × size × 100. The feed carries a last price, not the price each print traded at. */
function approxPremium(row: UnusualPrint): number | null {
  if (row.last == null || row.vol == null) return null;
  return row.last * row.vol * 100;
}

/** What the print looks like, from size against the book and whether it is a repeat. */
function read(row: UnusualPrint): string {
  const side = isCall(row.side) ? "call" : "put";
  const ratio = vsOi(row);
  if (row.oi === 0) return "Opens a strike that had no book";
  if (ratio == null) return `Unusual ${side} size`;
  if (ratio >= 1) {
    return row.persistence > 0
      ? `Building ${side} positioning, second day`
      : `New ${side} positioning`;
  }
  if (ratio >= 0.4) return `Heavy ${side} volume against a thin book`;
  return row.persistence > 0
    ? `Repeat ${side} churn on a deep book`
    : `${side === "call" ? "Call" : "Put"} churn on a deep book`;
}

function ratioTone(ratio: number | null, oi: number | null): string {
  if (oi === 0) return "text-warn";
  if (ratio != null && ratio >= 1) return "text-warn";
  return "text-3";
}

export default function UnusualPrintsTable({
  rows,
  asOf,
  limit = 8,
}: {
  rows: UnusualPrint[];
  asOf?: string;
  limit?: number;
}) {
  const shown = rows.slice(0, limit);

  const columns: Column<UnusualPrint>[] = [
    {
      key: "contract",
      header: "Contract",
      width: "132px",
      render: (r) => (
        <span className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className={`font-mono tabular-nums ${isCall(r.side) ? "text-call" : "text-put"}`}>
            {strikeLabel(r.strike)}
            {isCall(r.side) ? "C" : "P"}
          </span>
          <span className="font-mono text-micro text-muted">{expiryLabel(r.expiry, asOf)}</span>
        </span>
      ),
    },
    {
      key: "size",
      header: "Size",
      width: "70px",
      align: "right",
      render: (r) => <span className="text-data text-2">{compactNumber(r.vol)}</span>,
    },
    {
      key: "premium",
      header: "Premium ≈",
      width: "78px",
      align: "right",
      render: (r) => {
        const p = approxPremium(r);
        return (
          <span className="text-data text-foreground">
            {p == null ? <span className="text-muted-2">—</span> : `$${compactNumber(p)}`}
          </span>
        );
      },
    },
    {
      key: "vsoi",
      header: "vs OI",
      width: "92px",
      align: "right",
      render: (r) => {
        const ratio = vsOi(r);
        return (
          <span className={`text-data ${ratioTone(ratio, r.oi)}`}>
            {ratio != null ? `${ratio.toFixed(2)}×` : r.oi === 0 ? "new" : <span className="text-muted-2">—</span>}
          </span>
        );
      },
    },
    {
      key: "read",
      header: "Read",
      render: (r) => <span className="text-label text-3">{read(r)}</span>,
    },
  ];

  return (
    <Panel
      title="Unusual prints"
      subtitle="ranked by volume against similar-moneyness strikes"
      readThis={
        <>
          <ReadThisTerm>vs OI</ReadThisTerm> separates new positioning from churn: a print larger than
          the open interest already at that contract is someone opening, not closing. Premium is
          approximate — the feed carries the contract&apos;s last price, not the price each print
          traded at. It carries no bid/ask at the time of the trade either, so whether a print was
          buyer- or seller-initiated cannot be shown here.
        </>
      }
    >
      <DataTable
        columns={columns}
        rows={shown}
        rowKey={(r) => r.contract}
        caption="Unusual option prints, largest volume anomaly first"
        emptyMessage="No print today is unusual against its own strike neighbourhood."
      />
    </Panel>
  );
}
