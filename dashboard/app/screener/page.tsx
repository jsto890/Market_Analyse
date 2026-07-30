"use client";
import PageHeader from "@/components/ui/PageHeader";
import SkeletonTable from "@/components/ui/SkeletonTable";

import { useMemo, useState } from "react";
import { Search, ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import type { ScreenerResult } from "@/types/argus";
import DataTable, { Column } from "@/components/ui/DataTable";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function verdictColor(v: string): string {
  if (v === "LONG") return "text-pos";
  if (v === "SHORT") return "text-neg";
  return "text-warn";
}

function scoreColor(s: number): string {
  if (s >= 0.7) return "text-pos";
  if (s >= 0.5) return "text-warn";
  return "text-muted";
}

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
}

function RetCell({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted">—</span>;
  const cls = v >= 0 ? "text-pos" : "text-neg";
  return <span className={cls}>{fmtPct(v)}</span>;
}

function PinCell({
  symbol,
  pinned,
  onToggle,
}: {
  symbol: string;
  pinned: boolean;
  onToggle: (symbol: string, pinned: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(symbol, pinned);
      }}
      className={[
        "px-1.5 py-0.5 rounded border text-[11px] font-mono transition-colors",
        pinned
          ? "border-warn text-warn bg-warn/10"
          : "border-line text-muted hover:border-line-strong hover:text-foreground",
      ].join(" ")}
      aria-label={pinned ? `Unpin ${symbol}` : `Pin ${symbol}`}
    >
      {pinned ? "Pinned" : "Pin"}
    </button>
  );
}

type ApiResponse =
  | { results: ScreenerResult[]; as_of?: string; cached?: boolean }
  | { error: string };

function isErrorResponse(r: ApiResponse): r is { error: string } {
  return "error" in r;
}

export default function ScreenerPage() {
  const router = useRouter();
  const [tickerInput, setTickerInput] = useState("");
  const [minScore, setMinScore] = useState("0.3");
  const [results, setResults] = useState<ScreenerResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  const { data: watchlistData, mutate: mutateWatchlist } = useSWR<{
    watchlist: { ticker: string }[];
  }>("/api/watchlist", fetcher, { revalidateOnFocus: false });

  const pinnedSet = useMemo(
    () => new Set((watchlistData?.watchlist ?? []).map((w) => w.ticker)),
    [watchlistData]
  );

  async function togglePin(symbol: string, pinned: boolean) {
    mutateWatchlist(
      (prev) => {
        if (!prev) return prev;
        const wl = pinned
          ? prev.watchlist.filter((w) => w.ticker !== symbol)
          : [...prev.watchlist, { ticker: symbol }];
        return { watchlist: wl };
      },
      false
    );
    try {
      await fetch("/api/watchlist", {
        method: pinned ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: symbol }),
      });
    } catch {
      mutateWatchlist();
    }
  }

  const columns: Column<ScreenerResult>[] = [
    {
      key: "symbol",
      header: "Ticker",
      render: (r) => (
        <span className="font-mono font-semibold text-foreground">{r.symbol}</span>
      ),
    },
    {
      key: "verdict",
      header: "Verdict",
      render: (r) => (
        <span className={`font-mono font-semibold ${verdictColor(r.verdict)}`}>
          {r.verdict}
        </span>
      ),
    },
    {
      key: "score",
      header: "Score",
      align: "right",
      sortable: true,
      sortFn: (a, b) => a.score - b.score,
      render: (r) => (
        <span className={`font-mono ${scoreColor(r.score)}`}>{r.score.toFixed(3)}</span>
      ),
    },
    {
      key: "long_votes",
      header: "L",
      align: "right",
      render: (r) => <span className="text-pos">{r.long_votes}</span>,
    },
    {
      key: "short_votes",
      header: "S",
      align: "right",
      render: (r) => <span className="text-neg">{r.short_votes}</span>,
    },
    {
      key: "wait_votes",
      header: "W",
      align: "right",
      render: (r) => <span className="text-warn">{r.wait_votes}</span>,
    },
    {
      key: "agreement_pct",
      header: "Agree%",
      align: "right",
      sortable: true,
      sortFn: (a, b) => a.agreement_pct - b.agreement_pct,
      render: (r) => <span className="text-foreground">{r.agreement_pct.toFixed(0)}%</span>,
    },
    {
      key: "high_conviction",
      header: "HC",
      align: "center",
      render: (r) =>
        r.high_conviction ? (
          <span className="text-warn font-bold">HC</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "risk_reward",
      header: "R:R",
      align: "right",
      sortable: true,
      sortFn: (a, b) => a.risk_reward - b.risk_reward,
      render: (r) => <span className="text-foreground">{r.risk_reward.toFixed(1)}</span>,
    },
    {
      key: "ret_1d",
      header: "1d%",
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.ret_1d ?? -Infinity) - (b.ret_1d ?? -Infinity),
      render: (r) => <RetCell v={r.ret_1d} />,
    },
    {
      key: "ret_5d",
      header: "5d%",
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.ret_5d ?? -Infinity) - (b.ret_5d ?? -Infinity),
      render: (r) => <RetCell v={r.ret_5d} />,
    },
    {
      key: "pin",
      header: "",
      render: (r) => (
        <PinCell symbol={r.symbol} pinned={pinnedSet.has(r.symbol)} onToggle={togglePin} />
      ),
    },
  ];

  async function runScreener(tickers: string[] | null, refresh = false) {
    setLoading(true);
    setError(null);
    try {
      let res: Response;
      if (tickers === null) {
        const params = new URLSearchParams({ min_conviction: minScore });
        if (refresh) params.set("refresh", "1");
        res = await fetch(`/api/argus/screener?${params.toString()}`);
      } else {
        res = await fetch("/api/argus/screener", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            universe: tickers,
            min_conviction: parseFloat(minScore),
          }),
        });
      }
      const data = (await res.json()) as ApiResponse;
      if (isErrorResponse(data)) {
        setError(data.error);
        setResults(null);
      } else {
        setResults(data.results);
        setAsOf(data.as_of ?? null);
        setCached(data.cached ?? false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  function handleRun() {
    const tickers = tickerInput
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    void runScreener(tickers.length > 0 ? tickers : null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleRun();
  }

  return (
    <div className="min-h-screen bg-bg text-foreground">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <PageHeader title="Screener" subtitle="Agent-ranked long candidates" />

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-elevated px-3 py-2.5">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Filter tickers — AAPL, TSLA, NVDA…"
              className="h-9 w-64 rounded border border-line bg-raised pl-8 pr-3 text-sm text-foreground placeholder-muted focus:border-accent focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Min score
            <input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              step="0.05"
              min="0"
              max="1"
              className="h-9 w-16 rounded border border-line bg-raised px-2 text-sm text-foreground focus:border-accent focus:outline-none"
            />
          </label>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleRun}
              disabled={loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Running…
                </>
              ) : (
                <>
                  Run <ArrowRight size={14} />
                </>
              )}
            </button>
            <button
              onClick={() => {
                setTickerInput("");
                void runScreener(null);
              }}
              disabled={loading}
              className="inline-flex h-9 items-center rounded-md border border-line bg-raised px-4 text-sm font-medium text-foreground transition-colors hover:border-line-strong disabled:opacity-50"
            >
              Full universe
            </button>
          </div>
        </div>

        {/* States */}
        {loading && (
          <p className="flex items-center gap-1.5 text-xs font-mono text-muted">
            <Loader2 size={12} className="animate-spin" /> Running agent ensemble… (10–30s)
          </p>
        )}

        {error && (
          <div className="rounded-md border border-neg/50 bg-neg/10 px-3 py-2 text-sm text-neg">
            {error}
          </div>
        )}

        {!loading && !error && results === null && (
          <div className="rounded-md border border-dashed border-line bg-elevated/40 px-6 py-8 text-center">
            <p className="text-sm text-foreground">Rank long candidates with the agent ensemble</p>
            <p className="mx-auto mt-1.5 max-w-md text-xs text-muted">
              Enter tickers to score a shortlist, or run the full universe. Sort any column, click
              a row to open the ticker, and pin candidates to your watchlist.
            </p>
          </div>
        )}

        {loading && (
          <SkeletonTable
            headers={["Ticker", "Verdict", "Score", "Agree%", "R:R", "1d%", "5d%"]}
            rows={6}
          />
        )}

        {!loading && !error && results !== null && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-muted">
              <span>
                {results.length} signal{results.length !== 1 ? "s" : ""} found
              </span>
              {asOf && (
                <span className="text-muted/70">
                  · {cached ? "cached" : "fresh"} {new Date(asOf).toLocaleString()}
                </span>
              )}
              {cached && (
                <button
                  onClick={() => void runScreener(null, true)}
                  className="ml-auto inline-flex items-center gap-1 rounded border border-line px-2 py-0.5 text-muted transition-colors hover:border-line-strong hover:text-foreground"
                >
                  Re-run (~30s)
                </button>
              )}
            </div>
            {results.length === 0 ? (
              <p className="text-sm text-muted">No results above threshold.</p>
            ) : (
              <div className="bg-surface border border-line rounded p-4">
                <DataTable
                  columns={columns}
                  rows={results}
                  rowKey={(r) => r.symbol}
                  persistKey="screener-table"
                  onOpen={(r) => router.push(`/t/${r.symbol}`)}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
