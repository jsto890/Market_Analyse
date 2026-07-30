"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import Panel from "@/components/ui/Panel";
import DataTable, { Column } from "@/components/ui/DataTable";
import StatChip from "@/components/ui/StatChip";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import PinToggle from "@/components/ui/PinToggle";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { heatBg } from "@/lib/heat";
import { price, pct, relativeAge } from "@/lib/format";
import { WATCHLIST_STATUS_LABEL } from "@/lib/labels";

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
    <span
      className={`inline-block rounded px-1.5 py-0.5 tabular-nums ${cls}`}
      style={{ backgroundColor: heatBg(v) }}
    >
      {pct(v, "percent")}
    </span>
  );
}

function fmtPrice(v: number | null): React.ReactNode {
  if (v === null) return <span className="text-muted">—</span>;
  return <span className="tabular-nums">{price(v)}</span>;
}

function fmtDate(v: string): React.ReactNode {
  return v.slice(0, 10);
}

function fmtLoading(): React.ReactNode {
  return <span className="text-muted text-[12px]">Loading…</span>;
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
  now: number | null | undefined;
  sincePin: number | null | undefined;
  ret1w: number | null;
  ret1m: number | null;
  todayBadge: string | null;
  lastSignal: string | null;
}

function PinnedSection({
  entries,
  onAdded,
}: {
  entries: WatchlistEntry[];
  onAdded: () => void;
}) {
  const router = useRouter();
  const { data: bridgeData } = useSWR<{ signals: Array<{ ticker: string; action_label: string }> }>(
    "/api/bridge",
    fetcher
  );

  const [histMap, setHistMap] = useState<Map<string, HistoryResult>>(new Map());
  const [lastSigMap, setLastSigMap] = useState<Map<string, string>>(new Map());
  const [addInput, setAddInput] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);

  const tickers = entries.map((e) => e.ticker);
  const tickersKey = tickers.join(",");

  // Fetch histories for pinned tickers
  useEffect(() => {
    if (tickers.length === 0) return;
    let cancelled = false;
    const results = new Map<string, HistoryResult>();
    fetchHistoriesWithConcurrency(tickers, (ticker, bars) => {
      if (cancelled) return;
      results.set(ticker, extractHistory(bars));
      setHistMap(new Map(results));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey]);

  // Fetch last signal for each pinned ticker
  useEffect(() => {
    if (tickers.length === 0) return;
    let cancelled = false;
    const sigMap = new Map<string, string>();
    async function fetchLastSignals() {
      let idx = 0;
      async function worker() {
        while (idx < tickers.length) {
          const ticker = tickers[idx++];
          try {
            const r = await fetch(`/api/signals/history?ticker=${ticker}`);
            const rows: Array<{ date: string }> = await r.json();
            if (!cancelled && rows && rows.length > 0) {
              const maxDate = rows.reduce((m, row) => (row.date > m ? row.date : m), "");
              sigMap.set(ticker, maxDate);
            }
          } catch {
            // ignore
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
      if (!cancelled) setLastSigMap(new Map(sigMap));
    }
    fetchLastSignals();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey]);

  const bridgeMap = new Map(
    (bridgeData?.signals ?? []).map((s) => [s.ticker, s.action_label])
  );

  const rows: PinnedRowEnriched[] = entries.map((e) => {
    const hist = histMap.get(e.ticker);
    const now = hist ? hist.lastClose : undefined;
    const sincePin = hist ? sincePercent(e.price_at_pin, hist.lastClose) : undefined;
    return {
      ...e,
      now,
      sincePin,
      ret1w: hist ? sincePercent(hist.close5Back, hist.lastClose) : null,
      ret1m: hist ? sincePercent(hist.close21Back, hist.lastClose) : null,
      todayBadge: bridgeMap.get(e.ticker) ?? null,
      lastSignal: lastSigMap.get(e.ticker) ?? null,
    };
  });

  // Summary strip
  const withSince = rows.filter((r) => r.sincePin != null).map((r) => r.sincePin!);
  const medianSince =
    withSince.length > 0
      ? [...withSince].sort((a, b) => a - b)[Math.floor(withSince.length / 2)]
      : null;
  const best = rows.reduce<PinnedRowEnriched | null>(
    (m, r) => (r.sincePin != null && (m === null || r.sincePin > m.sincePin!)) ? r : m,
    null
  );
  const worst = rows.reduce<PinnedRowEnriched | null>(
    (m, r) => (r.sincePin != null && (m === null || r.sincePin < m.sincePin!)) ? r : m,
    null
  );

  async function handleAdd() {
    const ticker = addInput.trim().toUpperCase();
    if (!ticker) return;
    setAddError(null);
    setConfirmMsg(null);
    setAdding(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAddError(body?.error ?? `Failed to add ${ticker}`);
      } else {
        const body = await res.json().catch(() => ({}));
        const price = typeof body?.price_at_pin === "number" ? ` @ ${body.price_at_pin.toFixed(2)}` : "";
        setConfirmMsg(`${ticker} pinned${price}`);
        setAddInput("");
        onAdded();
        setTimeout(() => setConfirmMsg((m) => (m === `${ticker} pinned${price}` ? null : m)), 4000);
      }
    } catch {
      setAddError("Network error — could not reach the watchlist API");
    } finally {
      setAdding(false);
    }
  }

  const columns: Column<PinnedRowEnriched>[] = [
    {
      key: "ticker",
      header: "Ticker",
      width: "80px",
      render: (r) => <span className="font-mono font-medium">{r.ticker}</span>,
    },
    {
      key: "pinned_at",
      header: "Pinned",
      width: "84px",
      render: (r) => <span className="text-muted text-[12px]">{fmtDate(r.pinned_at)}</span>,
    },
    {
      key: "price_at_pin",
      header: "Pin price",
      width: "76px",
      align: "right",
      render: (r) => fmtPrice(r.price_at_pin),
    },
    {
      key: "now",
      header: "Now",
      width: "76px",
      align: "right",
      render: (r) => (r.now === undefined ? fmtLoading() : fmtPrice(r.now)),
    },
    {
      key: "sincePin",
      header: "Since pin",
      width: "88px",
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.sincePin ?? -Infinity) - (b.sincePin ?? -Infinity),
      render: (r) => (r.sincePin === undefined ? fmtLoading() : fmtPct(r.sincePin)),
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
      render: (r) => <PinToggle symbol={r.ticker} variant="text" />,
    },
  ];

  return (
    <Panel title="Pinned" persistKey="watchlist-pinned">
      {/* Add bar */}
      <div className="flex items-center gap-2 mb-3">
        <Input
          value={addInput}
          onChange={(e) => setAddInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="Add ticker…"
          className="w-36"
        />
        <Button onClick={handleAdd} disabled={adding || !addInput.trim()} loading={adding}>
          Pin
        </Button>
        {confirmMsg && <span className="text-[12px] text-pos">{confirmMsg}</span>}
        {addError && (
          <span className="flex items-center gap-1.5 text-[12px] text-neg">
            {addError}
            <button
              type="button"
              onClick={() => setAddError(null)}
              className="text-muted hover:text-foreground"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </span>
        )}
      </div>

      {/* Summary strip */}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <StatChip label="pinned" value={rows.length} />
          {medianSince !== null && (
            <StatChip
              label="median since-pin"
              value={pct(medianSince, "percent")}
              tone={medianSince >= 0 ? "pos" : "neg"}
            />
          )}
          {best && best.sincePin != null && (
            <StatChip
              label={`best (${best.ticker})`}
              value={pct(best.sincePin, "percent")}
              tone="pos"
            />
          )}
          {worst && worst.sincePin != null && worst.ticker !== best?.ticker && (
            <StatChip
              label={`worst (${worst.ticker})`}
              value={pct(worst.sincePin, "percent")}
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
          onOpen={(r) => router.push(`/t/${r.ticker}`)}
        />
      )}
    </Panel>
  );
}

// ── Recent picks section ─────────────────────────────────────────────────────

interface RecentFlagEnriched extends RecentFlag {
  now: number | null | undefined;
  sinceFlag: number | null | undefined;
  ageSeconds: number;
  stillIn: boolean | null;
}

function RecentPicksSection({ medianDaysToPeak }: { medianDaysToPeak: number }) {
  const router = useRouter();
  const { data: recentData } = useSWR<RecentFlag[]>("/api/signals/recent?days=14", fetcher);
  const { data: datesData } = useSWR<Array<{ date: string }>>("/api/signals/dates", fetcher);

  const latestDate = datesData?.[0]?.date ?? null;

  const [nowMap, setNowMap] = useState<Map<string, number | null>>(new Map());

  const tickers = (recentData ?? []).map((r) => r.ticker);
  const tickersKey = tickers.join(",");

  useEffect(() => {
    if (tickers.length === 0) return;
    let cancelled = false;
    const results = new Map<string, number | null>();
    fetchHistoriesWithConcurrency(tickers, (ticker, bars) => {
      if (cancelled) return;
      results.set(ticker, lastCloseFromBars(bars));
      setNowMap(new Map(results));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey]);

  const rows: RecentFlagEnriched[] = (recentData ?? []).map((r) => {
    const now = nowMap.get(r.ticker);
    return {
      ...r,
      now,
      sinceFlag: now === undefined ? undefined : sincePercent(r.entry_at_flag, now),
      ageSeconds: Math.floor(
        (Date.now() - new Date(r.first_date + "T00:00:00Z").getTime()) / 1000
      ),
      stillIn: latestDate !== null ? r.last_date === latestDate : null,
    };
  });

  const columns: Column<RecentFlagEnriched>[] = [
    {
      key: "ticker",
      header: "Ticker",
      width: "80px",
      render: (r) => (
        <span className={`font-mono font-medium ${r.stillIn === false ? "text-muted" : ""}`}>
          {r.ticker}
        </span>
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
      header: "Flag price",
      align: "right",
      render: (r) => fmtPrice(r.entry_at_flag),
    },
    {
      key: "now",
      header: "Now",
      width: "76px",
      align: "right",
      render: (r) => (r.now === undefined ? fmtLoading() : fmtPrice(r.now)),
    },
    {
      key: "sinceFlag",
      header: "Since flag",
      width: "88px",
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.sinceFlag ?? -Infinity) - (b.sinceFlag ?? -Infinity),
      render: (r) => (r.sinceFlag === undefined ? fmtLoading() : fmtPct(r.sinceFlag)),
    },
    {
      key: "ageSeconds",
      header: "Age",
      align: "right",
      render: (r) => <span className="tabular-nums text-muted">{relativeAge(r.ageSeconds)}</span>,
    },
    {
      key: "stillIn",
      header: "In today's report",
      render: (r) => {
        if (r.stillIn === null) return <span className="text-muted">—</span>;
        return r.stillIn ? (
          <span className="text-pos text-[12px]">{WATCHLIST_STATUS_LABEL.in}</span>
        ) : (
          <span className="text-muted text-[12px]">{WATCHLIST_STATUS_LABEL.out}</span>
        );
      },
    },
  ];

  return (
    <Panel
      title="Recent picks (auto)"
      subtitle={`aligned / pullback / tech_fund first-flagged last 14 days · typical peak ~${medianDaysToPeak}d`}
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
          onOpen={(r) => router.push(`/t/${r.ticker}`)}
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
      Promise.allSettled(
        tickers
          .filter(Boolean)
          .map((t) =>
            fetch("/api/watchlist", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ticker: t }),
            }).then((r) => { if (!r.ok) throw new Error(r.statusText); })
          )
      ).then((results) => {
        const allOk = results.every((r) => r.status === "fulfilled");
        if (allOk) localStorage.removeItem("argus_watchlist");
        mutate();
      });
    } catch {
      localStorage.removeItem("argus_watchlist");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <PageHeader title="Watchlist" subtitle="Pinned names + auto-flagged recent picks" />
      <PinnedSection entries={entries} onAdded={mutate} />
      <RecentPicksSection medianDaysToPeak={medianDaysToPeak} />
    </main>
  );
}
