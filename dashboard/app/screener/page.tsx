"use client";
import Loading from "@/components/ui/Loading";

import { useRef, useState } from "react";
import { Search, ArrowRight, Loader2, Filter } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ScreenerResult } from "@/types/argus";
import DataTable, { Column } from "@/components/ui/DataTable";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import PinToggle from "@/components/ui/PinToggle";
import Gloss from "@/components/ui/Gloss";
import Empty from "@/components/ui/Empty";
import Failed from "@/components/ui/Failed";
import Stale from "@/components/ui/Stale";
import { pctWhole, pct } from "@/lib/format";
import { STATIC_KEYS } from "@/lib/storageKeys";
import Page from "@/components/ui/Page";

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
  const [results, setResults] = useState<ScreenerResult[] | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STATIC_KEYS.screenerLastResult);
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { results: ScreenerResult[] }).results ?? null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STATIC_KEYS.screenerLastResult);
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { as_of: string | null }).as_of ?? null;
    } catch {
      return null;
    }
  });
  const [cached, setCached] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const columns: Column<ScreenerResult>[] = [
    {
      key: "symbol",
      header: "Ticker",
      render: (r) => (
        <span className="text-data font-semibold text-foreground">{r.symbol}</span>
      ),
    },
    {
      key: "verdict",
      header: "Verdict",
      render: (r) => <Badge variant="verdict" value={r.verdict} />,
    },
    {
      key: "score",
      header: "Score",
      align: "right",
      sortable: true,
      sortFn: (a, b) => a.score - b.score,
      render: (r) => <span className="text-data text-model">{r.score.toFixed(3)}</span>,
    },
    {
      key: "long_votes",
      header: <Gloss term="L" />,
      align: "right",
      render: (r) => <span className="text-data text-model">{r.long_votes}</span>,
    },
    {
      key: "short_votes",
      header: <Gloss term="S" />,
      align: "right",
      render: (r) => <span className="text-data text-model">{r.short_votes}</span>,
    },
    {
      key: "wait_votes",
      header: <Gloss term="W" />,
      align: "right",
      render: (r) => <span className="text-data text-model">{r.wait_votes}</span>,
    },
    {
      key: "agreement_pct",
      header: <Gloss term="Agree%" />,
      align: "right",
      sortable: true,
      sortFn: (a, b) => a.agreement_pct - b.agreement_pct,
      render: (r) => <span className="text-data text-model">{pctWhole(r.agreement_pct, "percent")}</span>,
    },
    {
      key: "high_conviction",
      header: <Gloss term="HC" />,
      align: "center",
      render: (r) =>
        r.high_conviction ? (
          <span className="text-body font-bold text-model">HC</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "risk_reward",
      header: <Gloss term="R:R" />,
      align: "right",
      sortable: true,
      sortFn: (a, b) => a.risk_reward - b.risk_reward,
      render: (r) => <span className="text-data text-foreground">{r.risk_reward.toFixed(1)}</span>,
    },
    {
      key: "ret_1d",
      header: "1d%",
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.ret_1d ?? -Infinity) - (b.ret_1d ?? -Infinity),
      render: (r) => (
        <span className={`text-data ${r.ret_1d === null ? "text-muted" : r.ret_1d >= 0 ? "text-pos" : "text-neg"}`}>
          {pct(r.ret_1d, "fraction")}
        </span>
      ),
    },
    {
      key: "ret_5d",
      header: "5d%",
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.ret_5d ?? -Infinity) - (b.ret_5d ?? -Infinity),
      render: (r) => (
        <span className={`text-data ${r.ret_5d === null ? "text-muted" : r.ret_5d >= 0 ? "text-pos" : "text-neg"}`}>
          {pct(r.ret_5d, "fraction")}
        </span>
      ),
    },
    {
      key: "pin",
      header: "",
      render: (r) => <PinToggle symbol={r.symbol} variant="chip" />,
    },
  ];

  async function runScreener(tickers: string[] | null, refresh = false) {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let res: Response;
      if (tickers === null) {
        const params = new URLSearchParams();
        params.set("min_conviction", String(parseFloat(minScore) || 0));
        if (refresh) params.set("refresh", "1");
        res = await fetch(`/api/argus/screener?${params.toString()}`, { signal: controller.signal });
      } else {
        res = await fetch("/api/argus/screener", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            universe: tickers,
            min_conviction: parseFloat(minScore),
          }),
          signal: controller.signal,
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
        window.localStorage.setItem(
          STATIC_KEYS.screenerLastResult,
          JSON.stringify({ results: data.results, as_of: data.as_of ?? null, cached: data.cached ?? false })
        );
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : "Network error");
        setResults(null);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
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
    <Page width="wide">
        <Page.Header title="Screener" subtitle="Agent-ranked long candidates" />

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-elevated px-3 py-2.5">
          <Input
            type="text"
            icon={<Search size={14} />}
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Filter tickers — AAPL, TSLA, NVDA…"
            className="w-64"
          />
          <label className="flex items-center gap-1.5 text-body text-muted">
            Min score
            <Input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              step="0.05"
              min="0"
              max="1"
              className="w-16"
            />
          </label>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="primary"
              onClick={handleRun}
              disabled={loading}
              loading={loading}
              icon={<ArrowRight size={14} />}
            >
              Run
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setTickerInput("");
                void runScreener(null);
              }}
              disabled={loading}
            >
              Full universe
            </Button>
          </div>
        </div>

        {/* States */}
        {loading && (
          <p className="flex items-center gap-1.5 text-body text-2">
            <Loader2 size={12} className="animate-spin" /> Running agent ensemble… (10–30s)
            <Button variant="ghost" size="sm" onClick={handleCancel}>Cancel</Button>
          </p>
        )}

        {error && (
          <Failed
            title="Screener didn’t run"
            message="Nothing was scored. Adjust the filters above and run again."
            detail={error}
          />
        )}

        {!loading && !error && results === null && (
          <div className="rounded-md border border-dashed border-line bg-elevated/40 px-6 py-8 text-center">
            <p className="text-title text-foreground">Rank long candidates with the agent ensemble</p>
            <p className="mx-auto mt-1.5 max-w-md text-body text-2">
              Enter tickers to score a shortlist, or run the full universe. Sort any column, click
              a row to open the ticker, and pin candidates to your watchlist.
            </p>
          </div>
        )}

        {loading && (
          <Loading
            variant="rows"
            headers={["Ticker", "Verdict", "Score", "Agree%", "R:R", "1d%", "5d%"]}
            count={6}
          />
        )}

        {!loading && !error && results !== null && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-body text-muted">
              <span>
                {results.length} signal{results.length !== 1 ? "s" : ""} found
              </span>
              {asOf && <Stale asOf={asOf} source={cached ? "cached" : "fresh"} variant="line" />}
              {asOf && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void runScreener(null, true)}
                  className="ml-auto"
                >
                  Re-run (~30s)
                </Button>
              )}
            </div>
            {results.length === 0 ? (
              <Empty
                fill
                icon={<Filter size={26} strokeWidth={1.5} />}
                title="No signals above threshold"
                message="Every scanned symbol scored below the current cutoff. Lower the score threshold or widen the universe, then re-run."
              />
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
    </Page>
  );
}
