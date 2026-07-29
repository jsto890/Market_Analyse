"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import type { BridgeRow } from "@/types/bridge";
import { tierSort } from "@/lib/groups";
import DataTable, { Column } from "@/components/ui/DataTable";
import Panel from "@/components/ui/Panel";
import { heatBg } from "@/lib/heat";
import Badge from "@/components/ui/Badge";
import ConvictionDot from "@/components/ui/ConvictionDot";
import MicroBar from "@/components/ui/MicroBar";
import Sparkline from "@/components/ui/Sparkline";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import InfoTip from "@/components/ui/InfoTip";
import Button from "@/components/ui/Button";

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
    title: "ALIGNED",
    rationale: "sentiment + technical + fundamental all bullish",
  },
  {
    key: "pullback",
    title: "HIGH CONVICTION, PULLING BACK",
    rationale: "strong chatter + catalyst, sentiment dipping — watch for the turn",
  },
  {
    key: "tech_fund",
    title: "TECHNICAL + FUNDAMENTAL",
    rationale: "near-aligned: sentiment just below the 0.30 bar",
  },
];

const CAVEAT_LINE =
  "Levels are indicative, not orders. Score magnitude does not predict returns (r≈0). High conviction means consensus, not edge.";

// ---------- cell components ----------

function TickerCell({ row, isNew }: { row: BridgeRow; isNew: boolean }) {
  return (
    <Link
      href={`/t/${row.ticker}`}
      onClick={(e) => e.stopPropagation()}
      className="font-mono font-medium text-accent hover:underline"
    >
      {row.ticker}
      {isNew && <sup className="ml-0.5 text-[9px] font-semibold text-warn">NEW</sup>}
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
    return <span className="font-mono tabular-nums text-muted">—</span>;
  }
  const sign = v >= 0 ? "+" : "";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 font-mono tabular-nums ${
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
        <span className="rounded border border-line px-1 py-px text-[11px] text-muted">ext</span>
      )}
      {showEarn && (
        <InfoTip
          content={`earnings in ${earnDays}d — inside typical hold window`}
          label={`Earnings in ${earnDays} days`}
        >
          <span className="rounded border border-warn/50 bg-warn/10 px-1 py-px text-[11px] font-medium text-warn">
            E{earnDays}d
          </span>
        </InfoTip>
      )}
    </span>
  );
}

function splitCatalysts(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[+;]/)
    .map((s) => s.replace(/["]/g, "").trim())
    .filter(Boolean);
}

function CatalystCount({ value }: { value: string | null }) {
  const list = splitCatalysts(value);
  if (list.length === 0) return <span className="text-muted">—</span>;
  return (
    <InfoTip
      content={
        <ul className="space-y-0.5">
          {list.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      }
      label={`${list.length} catalysts`}
    >
      <span className="inline-flex cursor-default items-center rounded border border-line px-1.5 py-px font-mono text-[11px] tabular-nums text-muted">
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
    <div className="space-y-1.5 py-3 font-mono text-[13px] text-muted">
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
          comb {fmtScore(row.combined_score)}{" "}
          <InfoTip content="magnitude does not predict returns (r≈0)" label="What does comb mean?" />
        </span>
        <span className="text-muted">·</span>
        <span>quality {fmtNum(row.quality_score, 1)}</span>
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
            <span className="inline-block h-[32px] w-[120px] animate-pulse rounded bg-elevated" />
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
            content="The three legs of the signal — Sentiment (X chatter), Technical (indicator ensemble), Fundamental (catalyst/valuation). Fuller green bars are stronger; all three lit = aligned."
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
    return <p className="px-1 py-2 text-[13px] text-muted">none today</p>;
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

  const onOpen = (r: BridgeRow) => router.push(`/t/${r.ticker}`);

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
            className={`inline-flex h-8 items-center gap-1 rounded border px-2.5 text-[12px] font-medium transition-colors ${
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

      {GROUP_META.map((g) => {
        const shown = sorted[g.key].length;
        const total = groups[g.key].length;
        const hidden = total - shown;
        const title =
          hidden > 0
            ? `${g.title}  (${shown} shown · ${hidden} hidden by filters)`
            : `${g.title}  (${shown})`;
        return (
          <Panel key={g.key} title={title} subtitle={g.rationale}>
            {sorted[g.key].length > 0 && <p className="mb-2 border-b border-line pb-2 text-[12px] text-muted">{CAVEAT_LINE}</p>}
            <GroupTable
              rows={sorted[g.key]}
              newSet={newSet}
              onOpen={onOpen}
              persistKey={`today-${g.key}`}
            />
          </Panel>
        );
      })}

      <Panel
        title={`Everything else  (${sorted.other.length})`}
        subtitle="didn't clear the bar for ALIGNED, PULLING BACK or TECHNICAL+FUNDAMENTAL — mixed or partial-agreement signals"
        collapsible
        defaultOpen={false}
        persistKey="today-other"
      >
        {sorted.other.length > 0 && <p className="mb-2 border-b border-line pb-2 text-[12px] text-muted">{CAVEAT_LINE}</p>}
        <GroupTable
          rows={sorted.other}
          newSet={newSet}
          onOpen={onOpen}
          persistKey="today-other-table"
        />
      </Panel>
    </div>
  );
}
