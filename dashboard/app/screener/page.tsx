"use client";
import PageHeader from "@/components/ui/PageHeader";
import SkeletonTable from "@/components/ui/SkeletonTable";

import { useState } from "react";
import { Search, ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ScreenerResult } from "@/types/argus";
import DataTable, { Column } from "@/components/ui/DataTable";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import PinToggle from "@/components/ui/PinToggle";
import InfoTip from "@/components/ui/InfoTip";
import { HEADER_GLOSS } from "@/lib/labels";
import { pctWhole } from "@/lib/format";

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
      render: (r) => <Badge variant="verdict" value={r.verdict} />,
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
      header: <InfoTip content={HEADER_GLOSS.L} label="Long votes info">L</InfoTip>,
      align: "right",
      render: (r) => <span className="text-pos">{r.long_votes}</span>,
    },
    {
      key: "short_votes",
      header: <InfoTip content={HEADER_GLOSS.S} label="Short votes info">S</InfoTip>,
      align: "right",
      render: (r) => <span className="text-neg">{r.short_votes}</span>,
    },
    {
      key: "wait_votes",
      header: <InfoTip content={HEADER_GLOSS.W} label="Wait votes info">W</InfoTip>,
      align: "right",
      render: (r) => <span className="text-warn">{r.wait_votes}</span>,
    },
    {
      key: "agreement_pct",
      header: <InfoTip content={HEADER_GLOSS["Agree%"]} label="Agreement info">Agree%</InfoTip>,
      align: "right",
      sortable: true,
      sortFn: (a, b) => a.agreement_pct - b.agreement_pct,
      render: (r) => <span className="text-foreground">{pctWhole(r.agreement_pct, "percent")}</span>,
    },
    {
      key: "high_conviction",
      header: <InfoTip content={HEADER_GLOSS.HC} label="High conviction info">HC</InfoTip>,
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
      header: <InfoTip content={HEADER_GLOSS["R:R"]} label="Risk:reward info">R:R</InfoTip>,
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
      render: (r) => <PinToggle symbol={r.symbol} variant="chip" />,
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
          <Input
            type="text"
            icon={<Search size={14} />}
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Filter tickers — AAPL, TSLA, NVDA…"
            className="w-64"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted">
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
