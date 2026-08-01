"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import type { BridgeRow } from "@/types/bridge";
import { tierSort } from "@/lib/groups";
import DataTable, { Column } from "@/components/ui/DataTable";
import Empty from "@/components/ui/Empty";
import ReadThis from "@/components/ui/ReadThis";
import ActionBar from "@/components/ui/ActionBar";
import { heatBg } from "@/lib/heat";
import Badge, { BADGE_LABEL } from "@/components/ui/Badge";
import ConvictionDot from "@/components/ui/ConvictionDot";
import MicroBar from "@/components/ui/MicroBar";
import Sparkline from "@/components/ui/Sparkline";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import InfoTip from "@/components/ui/InfoTip";
import Gloss from "@/components/ui/Gloss";
import Loading from "@/components/ui/Loading";
import Button from "@/components/ui/Button";
import { setTickerNav } from "@/lib/tickerNav";
import { catalystText, parseCatalysts } from "@/lib/catalysts";

const FILTERS_KEY = "dash:today:filters";

// ---------- shared history cache (TD-08) ----------
// Page-lifetime cache keyed by fetch symbol; intentionally not persisted to
// localStorage — this is request de-duplication, not a user preference.
type HistoryEntry = number[] | "failed" | "pending";
const historyCache = new Map<string, HistoryEntry>();

function fetchHistoryFor(symbol: string): Promise<number[] | "failed"> {
  const cached = historyCache.get(symbol);
  if (cached && cached !== "pending") return Promise.resolve(cached);
  if (cached === "pending") {
    return new Promise((resolve) => {
      const check = () => {
        const c = historyCache.get(symbol);
        if (c === "pending") setTimeout(check, 50);
        else resolve((c ?? "failed") as number[] | "failed");
      };
      check();
    });
  }
  historyCache.set(symbol, "pending");
  return fetch(`/api/argus/history/${symbol}?period=3mo`)
    .then((r) => r.json())
    .then((data) => {
      const raw = Array.isArray(data?.bars) ? data.bars : [];
      const closes = raw
        .map((b: { close: number }) => b.close)
        .filter((c: number) => Number.isFinite(c));
      const result: number[] | "failed" = closes.length >= 2 ? closes : "failed";
      historyCache.set(symbol, result);
      return result;
    })
    .catch(() => {
      historyCache.set(symbol, "failed");
      return "failed" as const;
    });
}

interface GroupedRows {
  aligned: BridgeRow[];
  pullback: BridgeRow[];
  tech_fund: BridgeRow[];
  other: BridgeRow[];
}

interface Filters {
  search: string;
  hcOnly: boolean;
  conviction: string; // "" | "high" | "med" | "low"
  sector: string; // "" | sector name
}

const DEFAULT_FILTERS: Filters = { search: "", hcOnly: false, conviction: "", sector: "" };

const GROUP_META: { key: keyof GroupedRows; title: string; rationale: string }[] = [
  {
    key: "aligned",
    title: "Aligned",
    rationale: "Sentiment, technical and fundamental all bullish.",
  },
  {
    key: "pullback",
    title: "Pulling back",
    rationale: "Strong chatter and a catalyst, sentiment dipping — watch for the turn.",
  },
  {
    key: "tech_fund",
    title: "Tech + fund",
    rationale: "Near-aligned: sentiment just below the 0.30 bar.",
  },
  {
    key: "other",
    title: "Everything else",
    rationale: "Mixed or partial-agreement signals that cleared none of the three bars.",
  },
];

export const CAVEAT_LINE =
  "Levels are indicative, not orders — score magnitude does not predict returns (r≈0), and high conviction means consensus, not edge.";

/** The active group's top names, in full. Below the cards the same rows stay
 *  tabular: three stacked tables meant the third was never read. */
const CARD_COUNT = 3;

// ---------- cell components ----------

function TickerCell({ row, isNew }: { row: BridgeRow; isNew: boolean }) {
  return (
    <Link
      href={`/t/${row.ticker}`}
      onClick={(e) => e.stopPropagation()}
      className="text-data font-medium text-accent hover:underline"
    >
      {row.ticker}
      {isNew && <sup className="ml-0.5 text-micro font-semibold text-warn">NEW</sup>}
    </Link>
  );
}

function LegBars({ s, t, f }: { s: number; t: number; f: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <MicroBar value={s} />
      <MicroBar value={t} />
      <MicroBar value={f} />
    </span>
  );
}

function Ret({ v }: { v: number | null }) {
  if (v === null || !Number.isFinite(v)) {
    return <span className="text-data text-muted">—</span>;
  }
  const sign = v >= 0 ? "+" : "";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-data ${
        v >= 0 ? "text-pos" : "text-neg"
      }`}
      style={{ backgroundColor: heatBg(v) }}
    >
      {sign}
      {v.toFixed(1)}
    </span>
  );
}

function RowFlags({ ext, earnDays }: { ext: boolean; earnDays: number | null }) {
  const showEarn = earnDays !== null && Number.isFinite(earnDays) && earnDays <= 10;
  if (!ext && !showEarn) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {ext && (
        <span className="rounded border border-line px-1 py-px text-micro text-muted">ext</span>
      )}
      {showEarn && (
        <InfoTip
          content={`earnings in ${earnDays}d — inside typical hold window`}
          label={`Earnings in ${earnDays} days`}
        >
          <span className="rounded border border-warn/50 bg-warn/10 px-1 py-px text-micro font-medium text-warn">
            E{earnDays}d
          </span>
        </InfoTip>
      )}
    </span>
  );
}

function CatalystCount({ value }: { value: string | null }) {
  const list = parseCatalysts(value);
  if (list.length === 0) return <span className="text-muted">—</span>;
  return (
    <InfoTip
      content={
        <ul className="space-y-0.5">
          {list.map((c) => (
            <li key={c.label}>{catalystText(c)}</li>
          ))}
        </ul>
      }
      label={`${list.length} catalysts`}
    >
      <span className="inline-flex cursor-default items-center rounded border border-line px-1.5 py-px font-mono text-micro tabular-nums text-muted">
        {list.length}
      </span>
    </InfoTip>
  );
}

// ---------- expanded row ----------

function fmtScore(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}`;
}

function fmtNum(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toFixed(dp);
}

function ExpandedRow({ row }: { row: BridgeRow }) {
  const symbol = row.fetch_symbol || row.ticker;
  const cached = historyCache.get(symbol);
  const [bars, setBars] = useState<number[] | null>(
    cached && cached !== "pending" && cached !== "failed" ? cached : null
  );
  const [failed, setFailed] = useState(cached === "failed");

  useEffect(() => {
    if (bars !== null || failed) return; // cache hit at mount, or hover-prefetch already resolved it
    let cancelled = false;
    fetchHistoryFor(symbol).then((result) => {
      if (cancelled) return;
      if (result === "failed") setFailed(true);
      else setBars(result);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, bars, failed]);

  const accts = (row.top_accounts ?? "")
    .split(";")
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 3);

  const showEarn =
    row.earnings_in_days !== null &&
    row.earnings_in_days !== undefined &&
    Number.isFinite(row.earnings_in_days) &&
    row.earnings_in_days <= 10;

  return (
    <div className="space-y-1.5 py-3 text-data text-muted">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1">
          Conviction <ConvictionDot value={row.conviction} />
        </span>
        <span className="text-muted">·</span>
        <span className="inline-flex items-center gap-1">
          Catalysts <CatalystCount value={row.catalysts} />
        </span>
        {(row.is_extended || showEarn) && (
          <>
            <span className="text-muted">·</span>
            <span className="inline-flex items-center gap-1">
              Flags <RowFlags ext={row.is_extended} earnDays={row.earnings_in_days} />
            </span>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          E {fmtNum(row.entry)} <span className="text-muted">S</span> {fmtNum(row.stop)}{" "}
          <span className="text-muted">T</span> {fmtNum(row.target)}
        </span>
        <span className="text-muted">·</span>
        <span>R {fmtNum(row.risk_reward, 1)}x (indicative)</span>
        {row.ret_1d != null && isFinite(row.ret_1d) && (
          <>
            <span className="text-muted">·</span>
            <span>
              ~{row.ret_1d >= 0 ? "+" : ""}{row.ret_1d.toFixed(1)}% vs entry (1d)
            </span>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1">
          <Gloss term="comb">magnitude does not predict returns (r≈0)</Gloss>{" "}
          <span className="text-model">{fmtScore(row.combined_score)}</span>
        </span>
        <span className="text-muted">·</span>
        <span>
          quality <span className="text-model">{fmtNum(row.quality_score, 1)}</span>
        </span>
        <span className="text-muted">·</span>
        <span>n_eff {fmtNum(row.n_eff, 1)}</span>
        <span className="text-muted">·</span>
        <span>regime {row.ticker_regime || "—"}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="text-muted">1W</span>
        <Ret v={row.ret_5d} />
        <span className="text-muted">6M</span>
        <Ret v={row.ret_126d} />
        <span className="text-muted">1Y</span>
        <Ret v={row.ret_252d} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-foreground">
          {failed || (bars && bars.length < 2) ? (
            <span className="text-muted">no chart</span>
          ) : bars ? (
            <Sparkline values={bars} />
          ) : (
            <Loading variant="lines" count={1} label="Loading chart" className="w-[120px]" />
          )}
        </span>
        <span>{row.mentions} mentions</span>
        <span className="text-muted">·</span>
        <span>
          {row.accounts} accts{accts.length > 0 ? `: ${accts.join(" ")}` : ""}
        </span>
        {row.next_earnings_date && (
          <>
            <span className="text-muted">·</span>
            <span>earnings {row.next_earnings_date}</span>
          </>
        )}
        <span className="text-muted">·</span>
        <Link
          href={`/t/${row.ticker}`}
          onClick={(e) => e.stopPropagation()}
          className="text-accent hover:underline"
        >
          Open {row.ticker} →
        </Link>
      </div>
    </div>
  );
}

// ---------- cards ----------

/** The top names of the active group, read in full instead of squeezed into a
 *  table row. Everything on the card comes off the bridge row — there is no
 *  per-name narrative feed, so the card says nothing where the mock has prose. */
function SignalCard({
  row,
  isNew,
  onOpen,
}: {
  row: BridgeRow;
  isNew: boolean;
  onOpen: () => void;
}) {
  const catalysts = parseCatalysts(row.catalysts);
  return (
    <article className="flex flex-col gap-2 rounded-md border border-line bg-raised px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-2">
          <Link href={`/t/${row.ticker}`} className="text-title text-accent hover:underline">
            {row.ticker}
          </Link>
          {isNew && <span className="eyebrow text-warn">new</span>}
          {row.industry && <span className="truncate text-body text-3">{row.industry}</span>}
        </span>
        <Badge variant="tier" value={row.action_label} label={BADGE_LABEL[row.action_label]} />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="flex items-baseline gap-1.5">
          <span className="text-headline font-mono text-model">{fmtNum(row.combined_score)}</span>
          <span className="eyebrow">score</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <LegBars s={row.sentiment_score} t={row.tech_score} f={row.catalyst_score} />
          <span className="eyebrow">sent · tech · fund</span>
        </span>
        <Ret v={row.ret_1d} />
        <RowFlags ext={row.is_extended} earnDays={row.earnings_in_days} />
      </div>

      {catalysts.length > 0 && (
        <p className="text-body text-2">
          {catalysts.slice(0, 3).map(catalystText).join(" · ")}
        </p>
      )}

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-data">
        <span>
          <span className="text-muted">E</span> {fmtNum(row.entry)}
        </span>
        <span>
          <span className="text-muted">S</span> {fmtNum(row.stop)}
        </span>
        <span>
          <span className="text-muted">T</span> {fmtNum(row.target)}
        </span>
        <span className="text-2">{fmtNum(row.risk_reward, 1)}x</span>
      </div>

      <ActionBar symbol={row.ticker} onOpen={onOpen} fill />
    </article>
  );
}

// ---------- main ----------

function loadFilters(): Filters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  try {
    const stored = localStorage.getItem(FILTERS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<Filters>;
      return { ...DEFAULT_FILTERS, ...parsed };
    }
  } catch {
    // ignore
  }
  return DEFAULT_FILTERS;
}

function matchesFilters(row: BridgeRow, f: Filters): boolean {
  if (f.hcOnly && !row.high_conviction) return false;
  if (f.conviction && row.conviction !== f.conviction) return false;
  if (f.sector && (row.industry ?? "") !== f.sector) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = `${row.ticker} ${row.industry ?? ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function columnsFor(newSet: Set<string>): Column<BridgeRow>[] {
  return [
    {
      key: "ticker",
      header: "Ticker",
      render: (r) => <TickerCell row={r} isNew={newSet.has(r.ticker)} />,
    },
    {
      key: "tier",
      header: "Signal",
      render: (r) => <Badge variant="tier" value={r.action_label} />,
    },
    {
      key: "legs",
      header: (
        <span className="inline-flex items-center gap-1">
          Sent · Tech · Fund
          <InfoTip
            content="The three legs of the signal — Sentiment (X chatter), Technical (indicator ensemble), Fundamental (catalyst/valuation). Fuller bars are stronger; all three lit = aligned."
            label="What is Sent · Tech · Fund?"
          />
        </span>
      ),
      render: (r) => <LegBars s={r.sentiment_score} t={r.tech_score} f={r.catalyst_score} />,
    },
    {
      key: "industry",
      header: "Sector",
      render: (r) => <span className="text-muted">{r.industry || "—"}</span>,
    },
    {
      key: "r1d",
      header: (
        <span className="inline-flex items-center gap-1">
          1D
          <InfoTip content="1-day % price change." label="What is 1D?" />
        </span>
      ),
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.ret_1d ?? -Infinity) - (b.ret_1d ?? -Infinity),
      render: (r) => <Ret v={r.ret_1d} />,
    },
    {
      key: "r1m",
      header: (
        <span className="inline-flex items-center gap-1">
          1M
          <InfoTip content="~20 trading-day (~1 month) % price change." label="What is 1M?" />
        </span>
      ),
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.ret_20d ?? -Infinity) - (b.ret_20d ?? -Infinity),
      render: (r) => <Ret v={r.ret_20d} />,
    },
  ];
}

function GroupTable({
  rows,
  newSet,
  onOpen,
  persistKey,
}: {
  rows: BridgeRow[];
  newSet: Set<string>;
  onOpen: (r: BridgeRow) => void;
  persistKey: string;
}) {
  const columns = useMemo(() => columnsFor(newSet), [newSet]);
  if (rows.length === 0) {
    return <p className="px-1 py-2 text-body text-muted">none today</p>;
  }
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.ticker}
      persistKey={persistKey}
      onOpen={onOpen}
      onRowHover={(r) => {
        fetchHistoryFor(r.fetch_symbol || r.ticker);
      }}
      expandedRender={(r) => <ExpandedRow row={r} />}
    />
  );
}

export default function SignalGroups({
  groups,
  newTickers,
  sectors,
}: {
  groups: GroupedRows;
  newTickers: string[];
  sectors: string[];
}) {
  const router = useRouter();
  const newSet = useMemo(() => new Set(newTickers), [newTickers]);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFilters(loadFilters());
    setHydrated(true);
  }, []);

  function update(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    localStorage.setItem(FILTERS_KEY, JSON.stringify(next));
  }

  const active = hydrated ? filters : DEFAULT_FILTERS;

  const sorted = useMemo(() => {
    const apply = (arr: BridgeRow[]) =>
      arr.filter((r) => matchesFilters(r, active)).slice().sort(tierSort);
    return {
      aligned: apply(groups.aligned),
      pullback: apply(groups.pullback),
      tech_fund: apply(groups.tech_fund),
      other: apply(groups.other),
    };
  }, [groups, active]);

  const onOpen = (r: BridgeRow, group: string, rows: BridgeRow[]) => {
    setTickerNav(group, rows.map((row) => row.ticker.toUpperCase()));
    router.push(`/t/${r.ticker}`);
  };

  const [tab, setTab] = useState<keyof GroupedRows>("aligned");
  const meta = GROUP_META.find((g) => g.key === tab) ?? GROUP_META[0];
  const rows = sorted[tab];
  const hidden = groups[tab].length - rows.length;
  const cards = rows.slice(0, CARD_COUNT);
  const rest = rows.slice(CARD_COUNT);

  return (
    <div className="space-y-3">
      {/* Filters toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-elevated px-3 py-2">
        <Input
          icon={<Search size={13} />}
          type="text"
          value={active.search}
          onChange={(e) => update({ search: e.target.value })}
          placeholder="Search ticker…"
          className="w-52"
        />
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => update({ hcOnly: !active.hcOnly })}
            aria-pressed={active.hcOnly}
            className={`inline-flex h-8 items-center gap-1 rounded border px-2.5 text-body font-medium transition-colors ${
              active.hcOnly
                ? "border-accent bg-accent-dim text-accent"
                : "border-line bg-raised text-muted hover:text-foreground"
            }`}
          >
            HC only
          </button>
          <InfoTip content="High-conviction — ≥75% indicator agreement. Consensus, not edge." label="Conviction filter info" />
        </span>
        <Select
          aria-label="Filter by conviction"
          value={active.conviction}
          onChange={(e) => update({ conviction: e.target.value })}
          className="w-32"
          options={[
            { value: "", label: "All conviction" },
            { value: "high", label: "High" },
            { value: "med", label: "Med" },
            { value: "low", label: "Low" },
          ]}
        />
        <Select
          aria-label="Filter by sector"
          value={active.sector}
          onChange={(e) => update({ sector: e.target.value })}
          className="w-40"
          options={[
            { value: "", label: "All sectors" },
            ...sectors.map((s) => ({ value: s, label: s })),
          ]}
        />
        {(active.search || active.hcOnly || active.conviction || active.sector) && (
          <Button variant="ghost" size="sm" icon={<X size={12} />} onClick={() => update({ search: "", hcOnly: false, conviction: "", sector: "" })}>
            Clear filters
          </Button>
        )}
      </div>

      <section className="rounded-md border border-line bg-elevated">
        {/* Four stacked tables meant the third was never scrolled to. */}
        <div role="tablist" aria-label="Signal groups" className="flex flex-wrap gap-1 px-2 pt-2">
          {GROUP_META.map((g) => {
            const selected = g.key === tab;
            return (
              <button
                key={g.key}
                type="button"
                role="tab"
                id={`signals-tab-${g.key}`}
                aria-selected={selected}
                aria-controls={`signals-panel-${g.key}`}
                onClick={() => setTab(g.key)}
                className={`flex items-baseline gap-1.5 rounded-t border-b-2 px-3 py-1.5 text-body transition-colors ${
                  selected
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {g.title}
                <span className="font-mono text-micro tabular-nums text-muted">
                  {sorted[g.key].length}
                </span>
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`signals-panel-${tab}`}
          aria-labelledby={`signals-tab-${tab}`}
          className="border-t border-line px-4 py-3"
        >
          <p className="text-body text-2">
            {meta.rationale}
            {hidden > 0 && (
              <span className="text-3"> {hidden} hidden by filters.</span>
            )}
          </p>

          {rows.length === 0 ? (
            <Empty
              title="Nothing in this group"
              message={
                hidden > 0
                  ? "Every name here is filtered out. Clear the filters to see them."
                  : "No name cleared this group's bar in today's run."
              }
            />
          ) : (
            <>
              {cards.length > 0 && (
                <div className="mt-3 grid gap-2 lg:grid-cols-3">
                  {cards.map((r) => (
                    <SignalCard
                      key={r.ticker}
                      row={r}
                      isNew={newSet.has(r.ticker)}
                      onOpen={() => onOpen(r, meta.title, rows)}
                    />
                  ))}
                </div>
              )}
              {rest.length > 0 && (
                <div className="mt-3">
                  <GroupTable
                    rows={rest}
                    newSet={newSet}
                    onOpen={(r) => onOpen(r, meta.title, rows)}
                    persistKey={`today-${tab}`}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Printed once. It used to print above all four tables. */}
        <ReadThis>{CAVEAT_LINE}</ReadThis>
      </section>
    </div>
  );
}
