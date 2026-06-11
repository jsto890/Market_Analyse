"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import Panel from "@/components/ui/Panel";
import DataTable, { Column } from "@/components/ui/DataTable";
import StatChip from "@/components/ui/StatChip";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";

// ── Types ────────────────────────────────────────────────────────────────────

interface WatchlistEntry {
  ticker: string;
  pinned_at: string;
  price_at_pin: number | null;
}

interface RecentFlag {
  ticker: string;
  first_date: string;
  first_group: string;
  entry_at_flag: number | null;
  last_date: string;
}

interface HistoryBar {
  ts: string;
  close: number;
}

interface HistoryResult {
  lastClose: number | null;
  close5Back: number | null;
  close21Back: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function parseBars(data: unknown): HistoryBar[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.bars)) return [];
  return (d.bars as Record<string, unknown>[]).map((b) => ({
    ts: String(b.ts ?? ""),
    close: Number(b.close ?? 0),
  }));
}

function extractHistory(bars: HistoryBar[]): HistoryResult {
  if (bars.length === 0) return { lastClose: null, close5Back: null, close21Back: null };
  const lastClose = bars[bars.length - 1].close;
  const close5Back = bars.length > 5 ? bars[bars.length - 1 - 5].close : null;
  const close21Back = bars.length > 21 ? bars[bars.length - 1 - 21].close : null;
  return { lastClose, close5Back, close21Back };
}

function lastCloseFromBars(bars: HistoryBar[]): number | null {
  if (bars.length === 0) return null;
  return bars[bars.length - 1].close;
}

function sincePercent(base: number | null, now: number | null): number | null {
  if (base == null || now == null || base === 0) return null;
  return Math.round(((now - base) / base) * 1000) / 10;
}

function fmtPct(v: number | null): React.ReactNode {
  if (v === null) return <span className="text-muted">—</span>;
  const cls = v >= 0 ? "text-pos" : "text-neg";
  return (
    <span className={`tabular-nums ${cls}`}>
      {v >= 0 ? "+" : ""}{v.toFixed(1)}%
    </span>
  );
}

function fmtPrice(v: number | null): React.ReactNode {
  if (v === null) return <span className="text-muted">—</span>;
  return <span className="tabular-nums">${v.toFixed(2)}</span>;
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const now = Date.now();
  return Math.floor((now - d.getTime()) / 86400000);
}

const CONCURRENCY = 5;

async function fetchHistoriesWithConcurrency(
  tickers: string[],
  onResult: (ticker: string, bars: HistoryBar[]) => void
): Promise<void> {
  let idx = 0;
  async function worker() {
    while (idx < tickers.length) {
      const ticker = tickers[idx++];
      try {
        const res = await fetch(`/api/argus/history/${ticker}?period=6mo`);
        const data = await res.json();
        onResult(ticker, parseBars(data));
      } catch {
        onResult(ticker, []);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
}

// ── Pinned section ───────────────────────────────────────────────────────────

interface PinnedRowEnriched extends WatchlistEntry {
  now: number | null;
  sincePin: number | null;
  ret1w: number | null;
  ret1m: number | null;
  todayBadge: string | null;
  lastSignal: string | null;
}

function PinnedSection({
  entries,
  onUnpin,
}: {
  entries: WatchlistEntry[];
  onUnpin: (ticker: string) => Promise<void>;
}) {
  const { data: bridgeData } = useSWR<{ signals: Array<{ ticker: string; action_label: string }> }>(
    "/api/bridge",
    fetcher
  );

  const [histMap, setHistMap] = useState<Map<string, HistoryResult>>(new Map());
  const [lastSigMap, setLastSigMap] = useState<Map<string, string>>(new Map());
  const [addInput, setAddInput] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const tickers = entries.map((e) => e.ticker);
  const tickersKey = tickers.join(",");

  // Fetch histories for pinned tickers
  useEffect(() => {
    if (tickers.length === 0) return;
    const results = new Map<string, HistoryResult>();
    fetchHistoriesWithConcurrency(tickers, (ticker, bars) => {
      results.set(ticker, extractHistory(bars));
      setHistMap(new Map(results));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey]);

  // Fetch last signal for each pinned ticker
  useEffect(() => {
    if (tickers.length === 0) return;
    const sigMap = new Map<string, string>();
    let resolved = 0;
    for (const ticker of tickers) {
      fetch(`/api/signals/history?ticker=${ticker}`)
        .then((r) => r.json())
        .then((rows: Array<{ date: string }>) => {
          if (rows && rows.length > 0) {
            const maxDate = rows.reduce((m, r) => (r.date > m ? r.date : m), "");
            sigMap.set(ticker, maxDate);
          }
        })
        .catch(() => {})
        .finally(() => {
          resolved++;
          if (resolved === tickers.length) setLastSigMap(new Map(sigMap));
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey]);

  const bridgeMap = new Map(
    (bridgeData?.signals ?? []).map((s) => [s.ticker, s.action_label])
  );

  const rows: PinnedRowEnriched[] = entries.map((e) => {
    const hist = histMap.get(e.ticker);
    const now = hist?.lastClose ?? null;
    return {
      ...e,
      now,
      sincePin: sincePercent(e.price_at_pin, now),
      ret1w: sincePercent(hist?.close5Back ?? null, now),
      ret1m: sincePercent(hist?.close21Back ?? null, now),
      todayBadge: bridgeMap.get(e.ticker) ?? null,
      lastSignal: lastSigMap.get(e.ticker) ?? null,
    };
  });

  // Summary strip
  const withSince = rows.filter((r) => r.sincePin !== null).map((r) => r.sincePin!);
  const medianSince =
    withSince.length > 0
      ? [...withSince].sort((a, b) => a - b)[Math.floor(withSince.length / 2)]
      : null;
  const best = rows.reduce<PinnedRowEnriched | null>(
    (m, r) => (r.sincePin !== null && (m === null || r.sincePin > m.sincePin!)) ? r : m,
    null
  );
  const worst = rows.reduce<PinnedRowEnriched | null>(
    (m, r) => (r.sincePin !== null && (m === null || r.sincePin < m.sincePin!)) ? r : m,
    null
  );

  async function handleAdd() {
    const ticker = addInput.trim().toUpperCase();
    if (!ticker) return;
    setAddError(null);
    setAdding(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAddError(body?.error ?? "Failed to add ticker");
      } else {
        setAddInput("");
      }
    } catch {
      setAddError("Network error");
    } finally {
      setAdding(false);
    }
  }

  const columns: Column<PinnedRowEnriched>[] = [
    {
      key: "ticker",
      header: "Ticker",
      width: "80px",
      render: (r) => (
        <a href={`/t/${r.ticker}`} className="font-mono font-medium hover:text-accent">
          {r.ticker}
        </a>
      ),
    },
    {
      key: "pinned_at",
      header: "Pinned",
      render: (r) => <span className="text-muted text-[12px]">{fmtDate(r.pinned_at)}</span>,
    },
    {
      key: "price_at_pin",
      header: "@pin",
      align: "right",
      render: (r) => fmtPrice(r.price_at_pin),
    },
    {
      key: "now",
      header: "Now",
      align: "right",
      render: (r) => fmtPrice(r.now),
    },
    {
      key: "sincePin",
      header: "Since pin",
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.sincePin ?? -Infinity) - (b.sincePin ?? -Infinity),
      render: (r) => fmtPct(r.sincePin),
    },
    {
      key: "todayBadge",
      header: "Today",
      render: (r) =>
        r.todayBadge ? (
          <Badge variant="tier" value={r.todayBadge} />
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "lastSignal",
      header: "Last signal",
      render: (r) =>
        r.lastSignal ? (
          <span className="text-[12px] text-muted">{r.lastSignal}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "ret1w",
      header: "1W",
      align: "right",
      render: (r) => fmtPct(r.ret1w),
    },
    {
      key: "ret1m",
      header: "1M",
      align: "right",
      render: (r) => fmtPct(r.ret1m),
    },
    {
      key: "unpin",
      header: "",
      render: (r) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUnpin(r.ticker);
          }}
          className="text-[11px] text-muted hover:text-neg px-1"
          aria-label={`Unpin ${r.ticker}`}
        >
          unpin
        </button>
      ),
    },
  ];

  return (
    <Panel title="Pinned" persistKey="watchlist-pinned">
      {/* Add bar */}
      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          value={addInput}
          onChange={(e) => { setAddInput(e.target.value); setAddError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="Add ticker…"
          className="rounded border border-line bg-elevated px-3 py-1.5 text-[13px] text-foreground placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent w-36"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !addInput.trim()}
          className="rounded border border-line bg-elevated px-3 py-1.5 text-[12px] text-foreground hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {adding ? "Adding…" : "Pin"}
        </button>
        {addError && (
          <span className="text-[12px] text-neg">{addError}</span>
        )}
      </div>

      {/* Summary strip */}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <StatChip label="pinned" value={rows.length} />
          {medianSince !== null && (
            <StatChip
              label="median since-pin"
              value={`${medianSince >= 0 ? "+" : ""}${medianSince.toFixed(1)}%`}
              tone={medianSince >= 0 ? "pos" : "neg"}
            />
          )}
          {best && best.sincePin !== null && (
            <StatChip
              label={`best (${best.ticker})`}
              value={`+${best.sincePin.toFixed(1)}%`}
              tone="pos"
            />
          )}
          {worst && worst.sincePin !== null && worst.ticker !== best?.ticker && (
            <StatChip
              label={`worst (${worst.ticker})`}
              value={`${worst.sincePin >= 0 ? "+" : ""}${worst.sincePin.toFixed(1)}%`}
              tone={worst.sincePin < 0 ? "neg" : "muted"}
            />
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState message="No pinned tickers yet — add one above" />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.ticker}
          defaultSort={{ key: "sincePin", dir: "desc" }}
          persistKey="watchlist-pinned-table"
        />
      )}
    </Panel>
  );
}

// ── Recent picks section ─────────────────────────────────────────────────────

interface RecentFlagEnriched extends RecentFlag {
  now: number | null;
  sinceFlag: number | null;
  ageDays: number;
  stillIn: boolean | null;
}

function RecentPicksSection({ medianDaysToPeak }: { medianDaysToPeak: number }) {
  const { data: recentData } = useSWR<RecentFlag[]>("/api/signals/recent?days=14", fetcher);
  const { data: datesData } = useSWR<Array<{ date: string }>>("/api/signals/dates", fetcher);

  const latestDate = datesData?.[0]?.date ?? null;

  const [nowMap, setNowMap] = useState<Map<string, number | null>>(new Map());

  const tickers = (recentData ?? []).map((r) => r.ticker);
  const tickersKey = tickers.join(",");

  useEffect(() => {
    if (tickers.length === 0) return;
    const results = new Map<string, number | null>();
    fetchHistoriesWithConcurrency(tickers, (ticker, bars) => {
      results.set(ticker, lastCloseFromBars(bars));
      setNowMap(new Map(results));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey]);

  const rows: RecentFlagEnriched[] = (recentData ?? []).map((r) => {
    const now = nowMap.get(r.ticker) ?? null;
    return {
      ...r,
      now,
      sinceFlag: sincePercent(r.entry_at_flag, now),
      ageDays: daysSince(r.first_date),
      stillIn: latestDate !== null ? r.last_date === latestDate : null,
    };
  });

  const columns: Column<RecentFlagEnriched>[] = [
    {
      key: "ticker",
      header: "Ticker",
      width: "80px",
      render: (r) => (
        <a
          href={`/t/${r.ticker}`}
          className={`font-mono font-medium hover:text-accent ${r.stillIn === false ? "text-muted" : ""}`}
        >
          {r.ticker}
        </a>
      ),
    },
    {
      key: "first_date",
      header: "First flagged",
      render: (r) => <span className="text-[12px] text-muted">{r.first_date}</span>,
    },
    {
      key: "first_group",
      header: "Group",
      render: (r) => <span className="font-mono text-[12px] text-muted">{r.first_group}</span>,
    },
    {
      key: "entry_at_flag",
      header: "@flag",
      align: "right",
      render: (r) => fmtPrice(r.entry_at_flag),
    },
    {
      key: "now",
      header: "Now",
      align: "right",
      render: (r) => fmtPrice(r.now),
    },
    {
      key: "sinceFlag",
      header: "Since flag",
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.sinceFlag ?? -Infinity) - (b.sinceFlag ?? -Infinity),
      render: (r) => fmtPct(r.sinceFlag),
    },
    {
      key: "ageDays",
      header: "Age (d)",
      align: "right",
      render: (r) => <span className="tabular-nums text-muted">{r.ageDays}</span>,
    },
    {
      key: "stillIn",
      header: "Still in?",
      render: (r) => {
        if (r.stillIn === null) return <span className="text-muted">—</span>;
        return r.stillIn ? (
          <span className="text-pos text-[12px]">yes</span>
        ) : (
          <span className="text-muted text-[12px]">dropped</span>
        );
      },
    },
    {
      key: "context",
      header: "Context",
      render: (r) => (
        <span className="text-[12px] text-muted">
          typical peak ~{medianDaysToPeak}d
        </span>
      ),
    },
  ];

  return (
    <Panel
      title="Recent picks (auto)"
      subtitle="aligned / pullback / tech_fund first-flagged last 14 days"
      persistKey="watchlist-recent"
    >
      {!recentData ? (
        <p className="text-[13px] text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState message="No tickers first-flagged in the last 14 days" />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.ticker}
          defaultSort={{ key: "sinceFlag", dir: "desc" }}
          persistKey="watchlist-recent-table"
        />
      )}
    </Panel>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

export default function WatchlistClient({
  medianDaysToPeak,
}: {
  medianDaysToPeak: number;
}) {
  const { data: watchlistData, mutate } = useSWR<{ watchlist: WatchlistEntry[] }>(
    "/api/watchlist",
    fetcher
  );

  const entries = watchlistData?.watchlist ?? [];

  // One-time migration from old localStorage format
  useEffect(() => {
    const raw = localStorage.getItem("argus_watchlist");
    if (!raw) return;
    try {
      const tickers = (JSON.parse(raw) as unknown[]).map((e) =>
        typeof e === "string" ? e : (e as { ticker?: string }).ticker
      );
      Promise.all(
        tickers
          .filter(Boolean)
          .map((t) =>
            fetch("/api/watchlist", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ticker: t }),
            })
          )
      ).then(() => {
        localStorage.removeItem("argus_watchlist");
        mutate();
      });
    } catch {
      localStorage.removeItem("argus_watchlist");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUnpin = useCallback(
    async (ticker: string) => {
      await fetch("/api/watchlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      mutate();
    },
    [mutate]
  );

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-2xl font-bold">Watchlist</h1>
      <PinnedSection entries={entries} onUnpin={handleUnpin} />
      <RecentPicksSection medianDaysToPeak={medianDaysToPeak} />
    </main>
  );
}
