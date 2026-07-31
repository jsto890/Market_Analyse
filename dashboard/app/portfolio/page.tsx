"use client";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { Column } from "@/components/ui/DataTable";
import Badge from "@/components/ui/Badge";
import StatChip from "@/components/ui/StatChip";
import InfoTip from "@/components/ui/InfoTip";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import { PlugZap, Briefcase } from "lucide-react";
import { signedCurrency, price as fmtPrice } from "@/lib/format";
import { PORTFOLIO_EDGE_LABEL } from "@/lib/labels";

import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import PageShell from "@/components/PageShell";

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
      render: (r) =>
        r.edge ? (
          <span className="inline-flex items-center gap-1">
            <Badge variant="edge" value={r.edge} />
            <InfoTip
              content={PORTFOLIO_EDGE_LABEL[r.edge] ?? "No explanation available for this edge value."}
              label="Edge explanation"
            />
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
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
    <PageShell width="standard">
        <PageHeader title="Portfolio" subtitle="TWS · port 7496 · live" />

        {account && (
          <div className="flex flex-wrap gap-2">
            <StatChip label="NLV" value={signedCurrency(Number(account.NetLiquidation))} />
            <StatChip label="Cash" value={signedCurrency(Number(account.TotalCashValue))} />
            <StatChip label="Buying power" value={signedCurrency(Number(account.BuyingPower))} />
          </div>
        )}

        {isLoading && <p className="text-micro font-mono text-muted">Loading…</p>}

        {/* Offline with nothing to fall back on: one honest empty state that
         * fills the column, instead of a banner stacked on a ghost table
         * header listing columns that will never have rows. */}
        {!isLoading && offline && pinned.length === 0 && (
          <EmptyState
            fill
            icon={<PlugZap size={26} strokeWidth={1.5} />}
            title="IBKR Gateway offline"
            message="Connect TWS on port 7496 (live) to see positions, cost basis and Argus edge. Pin tickers on the watchlist for a price-only fallback."
            action={
              <Button variant="secondary" onClick={() => void mutate()}>
                Retry connection
              </Button>
            }
          />
        )}

        {!isLoading && offline && pinned.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded border border-line bg-surface px-4 py-2.5">
              <p className="text-body font-semibold text-foreground">IBKR Gateway Offline</p>
              <p className="text-micro text-muted">
                Connect TWS on port 7496 (live) to see positions.
              </p>
              <button
                onClick={() => void mutate()}
                className="ml-auto text-micro bg-elevated hover:bg-raised border border-line text-foreground px-3 py-1 rounded transition-colors"
              >
                Retry
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-micro font-mono text-warn/80">
                TWS is offline — showing your pinned watchlist instead of live positions ({pinned.length}).
              </p>
              <div className="bg-surface border border-line rounded p-2 overflow-x-auto">
                <table className="w-full text-body border-collapse">
                  <tbody>
                    {pinned.map((p) => (
                      <tr key={p.ticker} className="border-b border-[var(--elevated)] last:border-0">
                        <td className="py-1.5 px-2">
                          <Link href={`/t/${p.ticker}`} className="font-mono text-accent hover:underline">
                            {p.ticker}
                          </Link>
                        </td>
                        <td className="py-1.5 px-2 text-right text-micro text-muted font-mono">
                          pinned {new Date(p.pinned_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!isLoading && isEmpty && (
          <EmptyState
            fill
            icon={<Briefcase size={26} strokeWidth={1.5} />}
            title="No open positions"
            message="TWS is connected but the account holds no equity positions. Candidates from the screener and watchlist will show their Argus edge here once you're filled."
            action={
              <Button variant="secondary" onClick={() => router.push("/screener")}>
                Open screener
              </Button>
            }
          />
        )}

        {!isLoading && !offline && positions.length > 0 && (
          <>
            <div className="flex items-center gap-3">
              <p className="text-micro text-muted font-mono">
                {positions.length} position{positions.length !== 1 ? "s" : ""}
              </p>
              {liveOffline && (
                <span className="text-micro font-mono text-warn/80">
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
      </PageShell>
    
  );
}
