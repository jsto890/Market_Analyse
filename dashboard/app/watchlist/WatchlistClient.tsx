"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import Panel from "@/components/ui/Panel";
import DataTable, { Column } from "@/components/ui/DataTable";
import StatChip from "@/components/ui/StatChip";
import Badge from "@/components/ui/Badge";
import Empty from "@/components/ui/Empty";
import Loading from "@/components/ui/Loading";
import ActionBar from "@/components/ui/ActionBar";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useUndoAction } from "@/components/ui/UndoToastProvider";
import { heatBg } from "@/lib/heat";
import { price, pct } from "@/lib/format";
import { WATCHLIST_STATUS_LABEL } from "@/lib/labels";
import { STATIC_KEYS } from "@/lib/storageKeys";
import type { EnrichedTicker } from "@/app/api/watchlist/enrich/route";
import Page from "@/components/ui/Page";

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

// ── Helpers ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * Prices (and, when asked, last-report dates) for a whole list in one request.
 * The per-ticker fan-out Argus forces lives in `/api/watchlist/enrich`, so both
 * sections share one code path instead of keeping a concurrency loop each.
 */
function useEnriched(tickers: string[], withSignals = false) {
  const key = tickers.length
    ? `/api/watchlist/enrich?tickers=${tickers.join(",")}${withSignals ? "&signals=1" : ""}`
    : null;
  return useSWR<Record<string, EnrichedTicker>>(key, fetcher).data;
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
      className={`inline-block rounded px-1.5 py-0.5 text-data ${cls}`}
      style={{ backgroundColor: heatBg(v) }}
    >
      {pct(v, "percent")}
    </span>
  );
}

function fmtPrice(v: number | null): React.ReactNode {
  if (v === null) return <span className="text-muted">—</span>;
  return <span className="text-data">{price(v)}</span>;
}

function fmtDate(v: string): React.ReactNode {
  return v.slice(0, 10);
}

function fmtLoading(): React.ReactNode {
  return <Loading variant="lines" count={1} />;
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

type Filter = "all" | "up" | "down" | "today";

/** The strip counts the same four things whether or not you act on them, so
 *  each count is also the filter that isolates it. */
const MATCHES: Record<Filter, (r: PinnedRowEnriched) => boolean> = {
  all: () => true,
  up: (r) => (r.sincePin ?? 0) > 0,
  down: (r) => (r.sincePin ?? 0) < 0,
  today: (r) => Boolean(r.todayBadge),
};

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="eyebrow">{label}</span>
      {children}
    </div>
  );
}

function PinnedCard({ r }: { r: PinnedRowEnriched }) {
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <Link href={`/t/${r.ticker}`} className="text-data text-title font-medium text-accent hover:underline">
          {r.ticker}
        </Link>
        {r.todayBadge && <Badge variant="tier" value={r.todayBadge} />}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        {r.sincePin === undefined ? fmtLoading() : fmtPct(r.sincePin)}
        <span className="text-body text-muted">since {fmtDate(r.pinned_at)}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-line pt-2 text-body">
        <Meta label="1W">{fmtPct(r.ret1w)}</Meta>
        <Meta label="1M">{fmtPct(r.ret1m)}</Meta>
        <Meta label="Pin">{fmtPrice(r.price_at_pin)}</Meta>
        <Meta label="Now">{r.now === undefined ? fmtLoading() : fmtPrice(r.now)}</Meta>
      </div>
      {/* No feed, no line: a name that has never made a report says nothing
          here rather than showing a dash. */}
      {r.lastSignal && (
        <p className="mt-1.5 text-body text-muted">Last on a report {r.lastSignal}</p>
      )}
      <ActionBar symbol={r.ticker} className="mt-2" />
    </div>
  );
}

function PinnedSection({
  entries,
  onAdded,
}: {
  entries: WatchlistEntry[];
  onAdded: () => void;
}) {
  const { data: bridgeData } = useSWR<{ signals: Array<{ ticker: string; action_label: string }> }>(
    "/api/bridge",
    fetcher
  );

  const [addInput, setAddInput] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const enriched = useEnriched(entries.map((e) => e.ticker), true);

  const bridgeMap = new Map(
    (bridgeData?.signals ?? []).map((s) => [s.ticker, s.action_label])
  );

  const rows: PinnedRowEnriched[] = entries.map((e) => {
    const hist = enriched?.[e.ticker];
    return {
      ...e,
      now: hist ? hist.last : undefined,
      sincePin: hist ? sincePercent(e.price_at_pin, hist.last) : undefined,
      ret1w: hist ? sincePercent(hist.w5, hist.last) : null,
      ret1m: hist ? sincePercent(hist.m21, hist.last) : null,
      todayBadge: bridgeMap.get(e.ticker) ?? null,
      lastSignal: hist?.lastSignal ?? null,
    };
  });
  // Best and worst read straight off the ends of a since-pin-ordered grid, so
  // the strip doesn't need to name them.
  rows.sort((a, b) => (b.sincePin ?? -Infinity) - (a.sincePin ?? -Infinity));

  const withSince = rows.filter((r) => r.sincePin != null).map((r) => r.sincePin!);
  const medianSince =
    withSince.length > 0
      ? [...withSince].sort((a, b) => a - b)[Math.floor(withSince.length / 2)]
      : null;

  const counts = {
    all: rows.length,
    up: rows.filter((r) => (r.sincePin ?? 0) > 0).length,
    down: rows.filter((r) => (r.sincePin ?? 0) < 0).length,
    today: rows.filter((r) => r.todayBadge).length,
  };
  const shown = rows.filter((r) => MATCHES[filter](r));

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

  return (
    <Panel
      title="Pinned"
      count={rows.length || undefined}
      subtitle={
        medianSince !== null ? `median since pin ${pct(medianSince, "percent")}` : undefined
      }
      persistKey="watchlist-pinned"
    >
      {/* Summary strip — above the add bar, because it describes what is
          already here rather than what you are about to add. */}
      {rows.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <StatChip
            label="pinned"
            value={counts.all}
            onClick={() => setFilter("all")}
            pressed={filter === "all"}
          />
          {counts.up > 0 && (
            <StatChip
              label="up since pin"
              value={counts.up}
              tone="pos"
              onClick={() => setFilter("up")}
              pressed={filter === "up"}
            />
          )}
          {counts.down > 0 && (
            <StatChip
              label="down since pin"
              value={counts.down}
              tone="neg"
              onClick={() => setFilter("down")}
              pressed={filter === "down"}
            />
          )}
          {counts.today > 0 && (
            <StatChip
              label="on today's list"
              value={counts.today}
              onClick={() => setFilter("today")}
              pressed={filter === "today"}
            />
          )}
        </div>
      )}

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
        {confirmMsg && <span className="text-body text-pos">{confirmMsg}</span>}
        {addError && (
          <span className="flex items-center gap-1.5 text-body text-neg">
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

      {rows.length === 0 ? (
        <Empty message="No pinned tickers yet — add one above" />
      ) : shown.length === 0 ? (
        <Empty message="No pinned names match that filter" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => (
            <PinnedCard key={r.ticker} r={r} />
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── Recent picks section ─────────────────────────────────────────────────────

interface RecentFlagEnriched extends RecentFlag {
  now: number | null | undefined;
  sinceFlag: number | null | undefined;
  ageDays: number;
  stillIn: boolean | null;
}

/**
 * How far through the typical window this pick is. The cohort's median days to
 * peak is the only thing that makes an age meaningful — 4 days old is early or
 * late depending entirely on it, and the bare number said neither.
 */
function WindowProgress({ days, median }: { days: number; median: number }) {
  const past = days > median;
  const frac = median > 0 ? Math.max(0, Math.min(1, days / median)) : 0;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative inline-block h-1.5 w-8 shrink-0 overflow-hidden rounded-sm bg-elevated">
        <span
          className="absolute left-0 top-0 h-full"
          style={{ width: `${frac * 100}%`, background: past ? "var(--muted)" : "var(--model)" }}
        />
      </span>
      <span className="whitespace-nowrap text-data text-muted">
        {past ? `past ~${median}d` : `${days}d / ~${median}d`}
      </span>
    </span>
  );
}

function RecentPicksSection({ medianDaysToPeak }: { medianDaysToPeak: number }) {
  const router = useRouter();
  const { data: recentData } = useSWR<RecentFlag[]>("/api/signals/recent?days=14", fetcher);
  const { data: datesData } = useSWR<Array<{ date: string }>>("/api/signals/dates", fetcher);

  const latestDate = datesData?.[0]?.date ?? null;

  const enriched = useEnriched((recentData ?? []).map((r) => r.ticker));

  const rows: RecentFlagEnriched[] = (recentData ?? []).map((r) => {
    const now = enriched?.[r.ticker]?.last;
    return {
      ...r,
      now,
      sinceFlag: now === undefined ? undefined : sincePercent(r.entry_at_flag, now),
      ageDays: Math.floor(
        (Date.now() - new Date(r.first_date + "T00:00:00Z").getTime()) / 86_400_000
      ),
      stillIn: latestDate !== null ? r.last_date === latestDate : null,
    };
  });

  const columns: Column<RecentFlagEnriched>[] = [
    {
      key: "ticker",
      header: "Ticker",
      width: "68px",
      render: (r) => (
        <span className={`text-data font-medium ${r.stillIn === false ? "text-muted" : ""}`}>
          {r.ticker}
        </span>
      ),
    },
    {
      key: "first_date",
      header: "First flagged",
      render: (r) => <span className="text-data text-muted">{r.first_date}</span>,
    },
    {
      key: "first_group",
      header: "Group",
      render: (r) => <span className="text-data text-muted">{r.first_group}</span>,
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
      key: "ageDays",
      header: "Window",
      width: "108px",
      render: (r) => <WindowProgress days={r.ageDays} median={medianDaysToPeak} />,
    },
    {
      key: "stillIn",
      header: "In today's report",
      render: (r) => {
        if (r.stillIn === null) return <span className="text-muted">—</span>;
        return r.stillIn ? (
          <span className="text-body text-model">{WATCHLIST_STATUS_LABEL.in}</span>
        ) : (
          <span className="text-body text-muted">{WATCHLIST_STATUS_LABEL.out}</span>
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
        <Loading
          variant="rows"
          headers={["Ticker", "Flagged", "Group", "Flag price", "Now", "Since flag", "Window", "In today's report"]}
          count={4}
        />
      ) : rows.length === 0 ? (
        <Empty message="No tickers first-flagged in the last 14 days" />
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

  const { notify } = useUndoAction();

  // One-time migration from old localStorage format
  useEffect(() => {
    const alreadyRan = window.localStorage.getItem(STATIC_KEYS.watchlistMigrationResult) !== null;
    const raw = window.localStorage.getItem("argus_watchlist");
    if (alreadyRan || !raw) return;
    let cancelled = false;
    (async () => {
      let tickers: string[] = [];
      try {
        tickers = ((JSON.parse(raw) as unknown[]) ?? [])
          .map((e) => (e as { ticker?: string }).ticker)
          .filter((t): t is string => typeof t === "string" && t.length > 0);
      } catch {
        tickers = [];
      }
      const results = await Promise.allSettled(
        tickers.map((t) =>
          fetch("/api/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticker: t }),
          }).then((r) => {
            if (!r.ok) throw new Error(r.statusText);
          })
        )
      );
      if (cancelled) return;
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - ok;
      window.localStorage.setItem(
        STATIC_KEYS.watchlistMigrationResult,
        JSON.stringify({ ok, failed })
      );
      window.localStorage.removeItem("argus_watchlist");
      // Announced once, when it happens. The stored result still guards the
      // re-run; it no longer redraws a banner on every later visit.
      notify(
        `Migrated ${ok} of ${ok + failed} ticker${ok + failed === 1 ? "" : "s"} from your old watchlist` +
          (failed > 0 ? ` — ${failed} failed, re-add manually.` : "."),
        8000
      );
      mutate();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Page width="wide">
      <Page.Header title="Watchlist" subtitle="Pinned names + auto-flagged recent picks" />
      <PinnedSection entries={entries} onAdded={mutate} />
      <RecentPicksSection medianDaysToPeak={medianDaysToPeak} />
    </Page>
  );
}
