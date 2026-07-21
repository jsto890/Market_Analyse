"use client";
import PageHeader from "@/components/ui/PageHeader";

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

function verdictChip(verdict: string | undefined): React.ReactNode {
  if (!verdict) return <span className="text-muted">—</span>;
  const cls =
    verdict === "LONG"
      ? "bg-pos/10 text-pos border border-pos/40"
      : verdict === "SHORT"
      ? "bg-neg/10 text-neg border border-neg/50"
      : "bg-warn/10 text-warn border border-warn/40";
  return (
    <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${cls}`}>
      {verdict}
    </span>
  );
}

function scoreClass(s: number | undefined): string {
  if (s == null) return "text-muted";
  if (s > 0) return "text-pos";
  if (s < 0) return "text-neg";
  return "text-muted";
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
  const pinned = wl?.watchlist ?? [];

  const rows = isList(data) ? data : [];
  const offline = !isList(data) || isErrorSentinel(rows);
  const liveOffline = rows.some((r) => r.ibkr_offline);
  const positions = offline ? [] : rows;
  const isEmpty = !isLoading && isList(data) && !offline && positions.length === 0;

  return (
    <div className="min-h-screen bg-bg text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <PageHeader title="Portfolio" subtitle="Paper account · IBKR Gateway 4002" />

        {isLoading && <p className="text-xs font-mono text-muted">Loading…</p>}

        {!isLoading && offline && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded border border-line bg-surface px-4 py-2.5">
              <p className="text-sm font-semibold text-foreground">IBKR Gateway Offline</p>
              <p className="text-xs text-muted">
                Connect IBKR Gateway on port 4002 (paper) to see live positions.
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
                  Showing your pinned watchlist ({pinned.length}) while the gateway is offline
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
                  watchlist fallback (IBKR offline)
                </span>
              )}
            </div>
            <div className="bg-surface border border-line rounded p-4 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs text-muted border-b border-line">
                    <th className="pb-1.5 pr-4 font-medium">Symbol</th>
                    <th className="pb-1.5 pr-4 font-medium text-right">Position</th>
                    <th className="pb-1.5 pr-4 font-medium text-right">Avg Cost</th>
                    <th className="pb-1.5 pr-4 font-medium">Argus</th>
                    <th className="pb-1.5 pr-4 font-medium text-right">Score</th>
                    <th className="pb-1.5 pr-4 font-medium">Edge</th>
                    <th className="pb-1.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos, i) => {
                    const rowBg = i % 2 === 0 ? "" : "bg-white/[0.02]";
                    const posClass =
                      pos.position == null
                        ? "text-muted"
                        : pos.position > 0
                        ? "text-pos"
                        : pos.position < 0
                        ? "text-neg"
                        : "text-muted";
                    return (
                      <tr
                        key={pos.symbol}
                        className={`${rowBg} hover:bg-elevated/30 transition-colors`}
                      >
                        <td className="py-1.5 pr-4 font-mono font-semibold text-foreground">
                          {pos.symbol}
                        </td>
                        <td className={`py-1.5 pr-4 text-right tabular-nums font-mono ${posClass}`}>
                          {pos.position == null ? "—" : pos.position}
                        </td>
                        <td className="py-1.5 pr-4 text-right tabular-nums text-foreground font-mono">
                          {pos.avg_cost == null ? "—" : `$${pos.avg_cost.toFixed(2)}`}
                        </td>
                        <td className="py-1.5 pr-4">{verdictChip(pos.verdict)}</td>
                        <td className={`py-1.5 pr-4 text-right tabular-nums font-mono ${scoreClass(pos.score)}`}>
                          {pos.score == null ? "—" : pos.score.toFixed(2)}
                        </td>
                        <td className="py-1.5 pr-4 font-mono text-xs text-muted">
                          {pos.edge ?? "—"}
                        </td>
                        <td className="py-1.5">
                          <button
                            onClick={() => router.push(`/t/${pos.symbol}`)}
                            className="text-xs text-accent hover:text-accent font-mono"
                          >
                            ›
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
