"use client";

import { useState, useRef } from "react";
import useSWR from "swr";
import Panel from "@/components/ui/Panel";
import DataTable, { Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";

interface SignalRow {
  date: string;
  ticker: string;
  action_label: string;
  combined_score: number;
  entry: number;
  combo: string;
  report_group: string;
}

interface HistoryBar {
  ts: string;
  close: number;
}

interface ReturnResult {
  fwdReturn: number | null;
  spyReturn: number | null;
}

type ReturnMap = Map<string, ReturnResult>;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Parse bars from /api/argus/history/{ticker}?period=1y response
function parseBars(data: unknown): HistoryBar[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.bars)) return [];
  return (d.bars as Record<string, unknown>[]).map((b) => ({
    ts: String(b.ts ?? ""),
    close: Number(b.close ?? 0),
  }));
}

// Find the first bar on or after targetDate (YYYY-MM-DD) in a sorted bar array
function findBarOnOrAfter(bars: HistoryBar[], targetDate: string): HistoryBar | null {
  for (const bar of bars) {
    const barDate = bar.ts.slice(0, 10);
    if (barDate >= targetDate) return bar;
  }
  return null;
}

// Compute pct return from 'then' close to 'now' (last bar)
function computeReturn(bars: HistoryBar[], flagDate: string): number | null {
  if (bars.length === 0) return null;
  const thenBar = findBarOnOrAfter(bars, flagDate);
  if (!thenBar) return null;
  const nowBar = bars[bars.length - 1];
  if (thenBar === nowBar) return null; // only one point — not meaningful
  return Math.round(((nowBar.close - thenBar.close) / thenBar.close) * 1000) / 10;
}

const CONCURRENCY = 5;

async function computeReturns(
  rows: SignalRow[],
  flagDate: string,
  onProgress: (ticker: string, result: ReturnResult) => void
): Promise<void> {
  // Fetch SPY once
  const spyRes = await fetch("/api/argus/history/SPY?period=1y");
  const spyData = await spyRes.json();
  const spyBars = parseBars(spyData);
  const spyReturn = computeReturn(spyBars, flagDate);

  // Fetch tickers with concurrency limit
  const tickers = rows.map((r) => r.ticker);
  let idx = 0;

  async function worker() {
    while (idx < tickers.length) {
      const ticker = tickers[idx++];
      try {
        const res = await fetch(`/api/argus/history/${ticker}?period=1y`);
        const data = await res.json();
        const bars = parseBars(data);
        const fwdReturn = computeReturn(bars, flagDate);
        onProgress(ticker, { fwdReturn, spyReturn });
      } catch {
        onProgress(ticker, { fwdReturn: null, spyReturn });
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);
}

function fmtReturn(val: number | null): React.ReactNode {
  if (val === null) return <span className="text-muted">—</span>;
  const cls = val >= 0 ? "text-pos" : "text-neg";
  return (
    <span className={`tabular-nums ${cls}`}>
      {val >= 0 ? "+" : ""}{val.toFixed(1)}%
    </span>
  );
}

export default function HistoryBrowser() {
  const { data: dates } = useSWR<{ date: string }[]>("/api/signals/dates", fetcher);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [computing, setComputing] = useState(false);
  const [returns, setReturns] = useState<ReturnMap>(new Map());
  const returnsRef = useRef<ReturnMap>(new Map());

  const activeDate = selectedDate || (dates?.[0]?.date ?? "");
  const { data: signals } = useSWR<SignalRow[]>(
    activeDate ? `/api/signals/by-date?date=${activeDate}` : null,
    fetcher
  );

  // Clear returns when date changes
  function handleDateChange(date: string) {
    setSelectedDate(date);
    returnsRef.current = new Map();
    setReturns(new Map());
  }

  async function handleComputeReturns() {
    if (!signals || signals.length === 0 || !activeDate) return;
    setComputing(true);
    returnsRef.current = new Map();
    setReturns(new Map());

    await computeReturns(
      signals,
      activeDate,
      (ticker, result) => {
        returnsRef.current = new Map(returnsRef.current).set(ticker, result);
        setReturns(new Map(returnsRef.current));
      }
    );

    setComputing(false);
  }

  const columns: Column<SignalRow>[] = [
    {
      key: "ticker",
      header: "Ticker",
      width: "80px",
      render: (r) => <span className="font-mono font-medium">{r.ticker}</span>,
    },
    {
      key: "action_label",
      header: "Action",
      render: (r) => r.action_label ? <Badge variant="tier" value={r.action_label} /> : <span className="text-muted">—</span>,
    },
    {
      key: "combo",
      header: "Combo",
      render: (r) => <span className="font-mono text-[12px] text-muted">{r.combo ?? "—"}</span>,
    },
    {
      key: "combined_score",
      header: "Score",
      align: "right",
      sortable: true,
      sortFn: (a, b) => a.combined_score - b.combined_score,
      render: (r) =>
        r.combined_score != null ? (
          <span className="tabular-nums">{r.combined_score.toFixed(2)}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "entry",
      header: "Entry",
      align: "right",
      render: (r) =>
        r.entry != null ? (
          <span className="tabular-nums">${r.entry.toFixed(2)}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "report_group",
      header: "Group",
      render: (r) => <span className="text-[12px] text-muted">{r.report_group ?? "—"}</span>,
    },
    {
      key: "fwdReturn" as keyof SignalRow,
      header: "→now",
      align: "right",
      render: (r) => fmtReturn(returns.get(r.ticker)?.fwdReturn ?? null),
    },
    {
      key: "spyReturn" as keyof SignalRow,
      header: "SPY",
      align: "right",
      render: (r) => {
        const entry = returns.get(r.ticker);
        // SPY return is same for all rows once any one resolves — show when available
        if (!entry) return <span className="text-muted">—</span>;
        return fmtReturn(entry.spyReturn);
      },
    },
  ];

  return (
    <Panel
      title="History Browser"
      subtitle="selections only — not the screened universe; no survivorship correction"
      collapsible
      defaultOpen
      persistKey="perf-history"
    >
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <label className="text-[12px] text-muted" htmlFor="history-date">Date</label>
        <select
          id="history-date"
          value={activeDate}
          onChange={(e) => handleDateChange(e.target.value)}
          className="rounded border border-line bg-elevated px-2 py-1 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {(dates ?? []).map((d) => (
            <option key={d.date} value={d.date}>
              {d.date}
            </option>
          ))}
        </select>
        <button
          onClick={handleComputeReturns}
          disabled={computing || !signals || signals.length === 0}
          className="rounded border border-line bg-elevated px-3 py-1 text-[12px] text-foreground hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {computing ? "Computing…" : "Compute returns"}
        </button>
        {computing && (
          <span className="text-[11px] text-muted">
            {returns.size}/{signals?.length ?? 0} resolved
          </span>
        )}
      </div>

      {!signals || signals.length === 0 ? (
        <EmptyState message="No signals for this date" />
      ) : (
        <DataTable
          columns={columns}
          rows={signals}
          rowKey={(r) => r.ticker}
          defaultSort={{ key: "combined_score", dir: "desc" }}
          persistKey="perf-history-table"
        />
      )}
    </Panel>
  );
}
