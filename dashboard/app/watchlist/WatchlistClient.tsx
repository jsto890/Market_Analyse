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
import PinToggle from "@/components/ui/PinToggle";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useUndoAction } from "@/components/ui/UndoToastProvider";
import { useCalendar } from "@/lib/calendar";
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

function fmtLoading(): React.ReactNode {
  return <Loading variant="lines" count={1} />;
}

// ── Pinned section ───────────────────────────────────────────────────────────

interface PinnedRowEnriched extends WatchlistEntry {
  now: number | null | undefined;
  sincePin: number | null | undefined;
  /** Last twelve closes, oldest first — the card's sparkline. */
  spark: number[];
  /** Latest close against the one before it. Same series as the sparkline, so
   *  the live bar's colour and the printed change can never disagree. */
  dayPct: number | null;
  todayBadge: string | null;
  /** Sessions until this name's next print, when the calendar carries one. */
  earningsIn: number | null;
}

type Filter = "all" | "earnings";

/** Two of the summary chips are counts you can act on; the other three are
 *  read-outs. A chip that isolates nothing is not a control. */
const MATCHES: Record<Filter, (r: PinnedRowEnriched) => boolean> = {
  all: () => true,
  earnings: (r) => r.earningsIn !== null && r.earningsIn <= EARNINGS_SOON_DAYS,
};

const EARNINGS_SOON_DAYS = 5;
/** A print you would hold something into, rather than one you have time to plan
 *  around — this is the one that takes the card's badge slot. */
const EARNINGS_IMMINENT_DAYS = 1;

/** Twelve closes as twelve bars. Deliberately not a chart library: at 34px tall
 *  with no axis, no tooltip and no time scale there is nothing for recharts to
 *  do that twelve divs do not already do, and it costs a client bundle. */
function Sparkbars({ closes, up }: { closes: number[]; up: boolean }) {
  if (closes.length < 2) return null;
  const lo = Math.min(...closes);
  const span = Math.max(...closes) - lo || 1;
  const last = closes.length - 1;
  return (
    <div aria-hidden className="mt-2 flex h-[34px] items-end gap-[2px]">
      {closes.map((c, i) => (
        <span
          key={i}
          className={`flex-1 rounded-[1px] ${
            i === last
              ? up
                ? "bg-pos"
                : "bg-neg"
              : i < last / 3
              ? "bg-elevated"
              : i < (last * 2) / 3
              ? "bg-line"
              : "bg-line-strong"
          }`}
          // Floored at 12%: a flat fortnight is still twelve bars, not twelve
          // slivers of nothing.
          style={{ height: `${12 + ((c - lo) / span) * 88}%` }}
        />
      ))}
    </div>
  );
}

/** "31 Jul" — the pin date reads as a date, not as a sort key. */
function pinDay(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : iso.slice(0, 10);
}

function PinnedCard({ r, lead }: { r: PinnedRowEnriched; lead: boolean }) {
  const imminent = r.earningsIn !== null && r.earningsIn <= EARNINGS_IMMINENT_DAYS;
  const sinceCls =
    r.sincePin == null ? "text-muted" : r.sincePin >= 0 ? "text-pos" : "text-neg";
  return (
    // The grid is ordered by since-pin, so the first card is the best-performing
    // name — it gets the lifted border and surface, the rest recede.
    <div
      className={`rounded-md border p-3 ${
        lead ? "border-line-strong bg-elevated" : "border-line bg-surface"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <Link
          href={`/t/${r.ticker}`}
          className="font-mono text-headline font-semibold text-accent hover:underline"
        >
          {r.ticker}
        </Link>
        {/* Unpin sits with the fact it undoes, not in the verb row: every name
            here is pinned, so a pin chip beside Alert would say nothing three
            names out of three. */}
        <PinToggle symbol={r.ticker} variant="text" />
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <span className="truncate text-label text-3">
          pinned {pinDay(r.pinned_at)}
          {r.price_at_pin !== null && ` @ ${r.price_at_pin.toFixed(2)}`}
        </span>
        <span className="flex shrink-0 items-baseline gap-1.5">
          {r.now === undefined ? (
            fmtLoading()
          ) : (
            <>
              <span className="font-mono text-title tabular-nums">
                {r.now === null ? "—" : price(r.now)}
              </span>
              {r.dayPct !== null && (
                <span
                  className={`font-mono text-label tabular-nums ${
                    r.dayPct >= 0 ? "text-pos" : "text-neg"
                  }`}
                >
                  {pct(r.dayPct, "percent")}
                </span>
              )}
            </>
          )}
        </span>
      </div>
      <Sparkbars closes={r.spark} up={(r.dayPct ?? 0) >= 0} />
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
        <span className="flex items-baseline gap-1.5">
          <span className="text-label text-3">since pin</span>
          {r.sincePin === undefined ? (
            fmtLoading()
          ) : (
            <span className={`font-mono text-title font-semibold tabular-nums ${sinceCls}`}>
              {r.sincePin === null ? "—" : pct(r.sincePin, "percent")}
            </span>
          )}
        </span>
        {imminent ? (
          <span className="shrink-0 rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-label text-warn">
            earnings {r.earningsIn === 0 ? "today" : "tomorrow"}
          </span>
        ) : (
          r.todayBadge && <Badge variant="tier" value={r.todayBadge} />
        )}
      </div>
      <ActionBar
        symbol={r.ticker}
        actions={["alert", "options", "open"]}
        fill
        className="mt-2"
      />
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
  const { data: calData } = useCalendar(30);

  const bridgeMap = new Map(
    (bridgeData?.signals ?? []).map((s) => [s.ticker, s.action_label])
  );

  // Sessions-to-print per ticker, nearest first. The calendar is the one
  // earnings feed on the page, so the chip and the count cannot disagree.
  const earningsIn = new Map<string, number>();
  const calToday = calData?.today ?? null;
  if (calToday) {
    const t0 = new Date(calToday + "T00:00:00").getTime();
    for (const ev of calData?.events ?? []) {
      if (ev.category !== "earnings" || !ev.ticker) continue;
      const days = Math.round(
        (new Date(ev.date + "T00:00:00").getTime() - t0) / 86_400_000
      );
      if (days < 0) continue;
      const key = ev.ticker.toUpperCase();
      if (!earningsIn.has(key) || days < earningsIn.get(key)!) earningsIn.set(key, days);
    }
  }

  const rows: PinnedRowEnriched[] = entries.map((e) => {
    const hist = enriched?.[e.ticker];
    const spark = hist?.spark ?? [];
    return {
      ...e,
      now: hist ? hist.last : undefined,
      sincePin: hist ? sincePercent(e.price_at_pin, hist.last) : undefined,
      spark,
      dayPct:
        spark.length >= 2 ? sincePercent(spark[spark.length - 2], spark[spark.length - 1]) : null,
      todayBadge: bridgeMap.get(e.ticker) ?? null,
      earningsIn: earningsIn.get(e.ticker.toUpperCase()) ?? null,
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

  // Best and worst are the ends of the since-pin ordering, so they are read off
  // the grid rather than recomputed.
  const ranked = rows.filter((r) => r.sincePin != null);
  const best = ranked[0] ?? null;
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;
  const earningsSoon = rows.filter((r) => MATCHES.earnings(r)).length;
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
    <section className="flex flex-col gap-[var(--stack-tight)]">
      {/* Adding a name is the section's verb, so it rides the title row rather
          than sitting in a box of its own under the heading. */}
      <div className="flex items-end justify-between gap-4 border-b border-line pb-2">
        <h2 className="text-title text-foreground">Pinned</h2>
        <div className="flex shrink-0 items-center gap-2">
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
        </div>
      </div>

      {(confirmMsg || addError) && (
        <div role="status" className="flex items-center gap-1.5">
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
      )}

      {/* What the list adds up to, before the list itself. Only the two counts
          isolate anything, so only those two are buttons. */}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <StatChip
            label="pinned"
            value={rows.length}
            variant="lead"
            onClick={() => setFilter("all")}
            pressed={filter === "all"}
          />
          {medianSince !== null && (
            <StatChip
              label="median since pin"
              value={pct(medianSince, "percent")}
              tone={medianSince >= 0 ? "pos" : "neg"}
            />
          )}
          {best && (
            <StatChip
              label={`best · ${best.ticker}`}
              value={pct(best.sincePin!, "percent")}
              tone={best.sincePin! >= 0 ? "pos" : "neg"}
            />
          )}
          {worst && (
            <StatChip
              label={`worst · ${worst.ticker}`}
              value={pct(worst.sincePin!, "percent")}
              tone={worst.sincePin! >= 0 ? "pos" : "neg"}
            />
          )}
          {earningsSoon > 0 && (
            <StatChip
              label={`earnings ≤ ${EARNINGS_SOON_DAYS}d`}
              value={earningsSoon}
              tone="warn"
              variant="warn"
              onClick={() => setFilter("earnings")}
              pressed={filter === "earnings"}
            />
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <Empty message="No pinned tickers yet — add one above" />
      ) : shown.length === 0 ? (
        <Empty message="No pinned names match that filter" />
      ) : (
        // Three columns whatever the count: one pin fills a third and the two
        // empty cells stay empty, rather than the card shrink-wrapping.
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((r, i) => (
            <PinnedCard key={r.ticker} r={r} lead={i === 0 && filter === "all"} />
          ))}
        </div>
      )}
    </section>
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
  // Text only. The bar shared the cell with the figure it duplicated, and a bar
  // narrow enough to fit beside it read the same at 2 days and at 6.
  return (
    <span className="whitespace-nowrap text-data text-muted">
      {days > median ? `past ~${median}d` : `${days}d / ~${median}d`}
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
