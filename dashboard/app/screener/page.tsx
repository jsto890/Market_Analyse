"use client";

import { useMemo, useState } from "react";
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
          ? "border-amber-400 text-warn bg-amber-400/10"
          : "border-[var(--border)] text-muted hover:border-gray-400 hover:text-foreground",
      ].join(" ")}
      aria-label={pinned ? `Unpin ${symbol}` : `Pin ${symbol}`}
    >
      {pinned ? "Pinned" : "Pin"}
    </button>
  );
}

type ApiResponse = { results: ScreenerResult[] } | { error: string };

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
        <span className="font-mono font-semibold text-white">{r.symbol}</span>
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

  async function runScreener(tickers: string[] | null) {
    setLoading(true);
    setError(null);
    try {
      let res: Response;
      if (tickers === null) {
        res = await fetch("/api/argus/screener");
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
    <div className="min-h-screen bg-[var(--bg)] text-white">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-base font-semibold text-white">Screener</h1>

        {/* Controls */}
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="AAPL, TSLA, NVDA…"
            className="bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 w-60"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Min score
            <input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              step="0.05"
              min="0"
              max="1"
              className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-white w-16 focus:outline-none focus:border-gray-500"
            />
          </label>
          <button
            onClick={handleRun}
            disabled={loading}
            className="bg-accent hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors"
          >
            {loading ? "Running…" : "Run ›"}
          </button>
          <button
            onClick={() => {
              setTickerInput("");
              void runScreener(null);
            }}
            disabled={loading}
            className="bg-elevated hover:bg-elevated/70 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors"
          >
            {loading ? "Running…" : "Run default universe"}
          </button>
        </div>

        {/* States */}
        {loading && (
          <p className="text-xs font-mono text-muted">Running agents… (may take 10–30s)</p>
        )}

        {error && (
          <div className="bg-neg/10 border border-neg/50 rounded px-3 py-2 text-sm text-neg">
            {error}
          </div>
        )}

        {!loading && !error && results === null && (
          <p className="text-sm text-muted">Enter tickers or run the default universe</p>
        )}

        {!loading && !error && results !== null && (
          <>
            <p className="text-xs text-muted font-mono">
              {results.length} signal{results.length !== 1 ? "s" : ""} found
            </p>
            {results.length === 0 ? (
              <p className="text-sm text-muted">No results above threshold.</p>
            ) : (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
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
