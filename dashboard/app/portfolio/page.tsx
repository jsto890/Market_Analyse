"use client";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { Column } from "@/components/ui/DataTable";
import Badge from "@/components/ui/Badge";
import StatChip from "@/components/ui/StatChip";
import { signedCurrency, price as fmtPrice } from "@/lib/format";

import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface PositionRow {
  symbol: string;
  position: number | null;
  avg_cost: number | null;
  verdict?: string;
  score?: number;
  edge?: string;
  market_value?: number | null;
  unrealized_pnl?: number | null;
  high_conviction?: boolean;
  ibkr_offline?: boolean;
  error?: string;
}

// /api/portfolio returns a bare list. When IBKR is unreachable and the yf
// fallback also yields nothing, it returns [{ error, ibkr_offline }].
type ApiResponse = PositionRow[] | { error: string };

function isList(r: ApiResponse | undefined): r is PositionRow[] {
  return Array.isArray(r);
}

function isErrorSentinel(rows: PositionRow[]): boolean {
  return rows.length === 1 && rows[0].error != null && rows[0].symbol == null;
}

export default function PortfolioPage() {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<ApiResponse>(
    "/api/argus/portfolio",
    fetcher,
    { refreshInterval: 60000 }
  );
  const { data: wl } = useSWR<{ watchlist: { ticker: string; pinned_at: string }[] }>(
    "/api/watchlist",
    fetcher
  );
  const { data: account } = useSWR<Record<string, string>>("/api/argus/account", fetcher);
  const pinned = wl?.watchlist ?? [];

  const rows = isList(data) ? data : [];
  const offline = !isList(data) || isErrorSentinel(rows);
  const liveOffline = rows.some((r) => r.ibkr_offline);
  const positions = offline ? [] : rows;
  const isEmpty = !isLoading && isList(data) && !offline && positions.length === 0;

  const columns: Column<PositionRow>[] = [
    {
      key: "symbol",
      header: "Symbol",
      render: (r) => <span className="font-mono font-semibold text-foreground">{r.symbol}</span>,
    },
    {
      key: "position",
      header: "Position",
      align: "right",
      render: (r) => {
        if (r.position == null) return <span className="text-muted">—</span>;
        const cls = r.position > 0 ? "text-pos" : r.position < 0 ? "text-neg" : "text-muted";
        return <span className={cls}>{r.position}</span>;
      },
    },
    {
      key: "avg_cost",
      header: "Avg Cost",
      align: "right",
      render: (r) => <span className="text-foreground">{r.avg_cost == null ? "—" : `$${r.avg_cost.toFixed(2)}`}</span>,
    },
    {
      key: "verdict",
      header: "Argus",
      render: (r) => (r.verdict ? <Badge variant="verdict" value={r.verdict} /> : <span className="text-muted">—</span>),
    },
    {
      key: "score",
      header: "Score",
      align: "right",
      render: (r) => (
        <span className={r.score == null ? "text-muted" : r.score > 0 ? "text-pos" : r.score < 0 ? "text-neg" : "text-muted"}>
          {r.score == null ? "—" : r.score.toFixed(2)}
        </span>
      ),
    },
    {
      key: "edge",
      header: "Edge",
      render: (r) => <span className="font-mono text-xs text-muted">{r.edge ?? "—"}</span>,
    },
    {
      key: "market_value",
      header: "Mkt Value",
      align: "right",
      render: (r) => <span className="text-foreground">{fmtPrice(r.market_value ?? null)}</span>,
    },
    {
      key: "unrealized_pnl",
      header: "Unrl. P&L",
      align: "right",
      render: (r) => {
        if (r.unrealized_pnl == null) return <span className="text-muted">—</span>;
        const cls = r.unrealized_pnl >= 0 ? "text-pos" : "text-neg";
        return <span className={cls}>{signedCurrency(r.unrealized_pnl)}</span>;
      },
    },
  ];

  return (
    <div className="min-h-screen bg-bg text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <PageHeader title="Portfolio" subtitle="TWS · port 7496 · live" />

        {account && (
          <div className="flex flex-wrap gap-2">
            <StatChip label="NLV" value={signedCurrency(Number(account.NetLiquidation))} />
            <StatChip label="Cash" value={signedCurrency(Number(account.TotalCashValue))} />
            <StatChip label="Buying power" value={signedCurrency(Number(account.BuyingPower))} />
          </div>
        )}

        {isLoading && <p className="text-xs font-mono text-muted">Loading…</p>}

        {!isLoading && offline && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded border border-line bg-surface px-4 py-2.5">
              <p className="text-sm font-semibold text-foreground">IBKR Gateway Offline</p>
              <p className="text-xs text-muted">
                Connect TWS on port 7496 (live) to see positions.
              </p>
              <button
                onClick={() => void mutate()}
                className="ml-auto text-xs bg-elevated hover:bg-raised border border-line text-foreground px-3 py-1 rounded transition-colors"
              >
                Retry
              </button>
            </div>

            {pinned.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] font-mono text-warn/80">
                  TWS is offline — showing your pinned watchlist instead of live positions ({pinned.length}).
                </p>
                <div className="bg-surface border border-line rounded p-2 overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <tbody>
                      {pinned.map((p) => (
                        <tr key={p.ticker} className="border-b border-[var(--elevated)] last:border-0">
                          <td className="py-1.5 px-2">
                            <Link href={`/t/${p.ticker}`} className="font-mono text-accent hover:underline">
                              {p.ticker}
                            </Link>
                          </td>
                          <td className="py-1.5 px-2 text-right text-[11px] text-muted font-mono">
                            pinned {new Date(p.pinned_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted">No pinned watchlist tickers to fall back to.</p>
            )}

            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted/60">
                Positions (connect TWS to populate)
              </p>
              <div className="rounded border border-line bg-surface/40 px-3 py-2 text-[11px] text-muted/60">
                Symbol · Position · Avg Cost · Argus · Score · Edge
              </div>
            </div>
          </div>
        )}

        {!isLoading && isEmpty && (
          <p className="text-sm text-muted">No open positions.</p>
        )}

        {!isLoading && !offline && positions.length > 0 && (
          <>
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted font-mono">
                {positions.length} position{positions.length !== 1 ? "s" : ""}
              </p>
              {liveOffline && (
                <span className="text-[10px] font-mono text-warn/80">
                  Price-only preview from your pinned watchlist — TWS positions unavailable
                </span>
              )}
            </div>
            <div className="bg-surface border border-line rounded p-4">
              <DataTable
                columns={columns}
                rows={positions}
                rowKey={(r) => r.symbol}
                persistKey="portfolio-table"
                onOpen={(r) => router.push(`/t/${r.symbol}`)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
