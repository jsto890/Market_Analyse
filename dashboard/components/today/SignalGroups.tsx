"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import type { BridgeRow } from "@/types/bridge";
import { tierSort } from "@/lib/groups";
import DataTable, { Column } from "@/components/ui/DataTable";
import Panel from "@/components/ui/Panel";
import Badge from "@/components/ui/Badge";
import ConvictionDot from "@/components/ui/ConvictionDot";
import MicroBar from "@/components/ui/MicroBar";
import Sparkline from "@/components/ui/Sparkline";

const FILTERS_KEY = "dash:today:filters";

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
    <span className={`font-mono tabular-nums ${v >= 0 ? "text-pos" : "text-neg"}`}>
      {sign}
      {v.toFixed(1)}
    </span>
  );
}

function ChipTooltip({ label, tone, tooltip }: { label: string; tone: string; tooltip: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span
          className={`inline-flex cursor-default items-center rounded border px-1 py-px text-[10px] font-medium leading-tight ${tone}`}
        >
          {label}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="max-w-xs rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
          sideOffset={4}
        >
          {tooltip}
          <Tooltip.Arrow className="fill-elevated" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function RowFlags({ ext, earnDays }: { ext: boolean; earnDays: number | null }) {
  const showEarn = earnDays !== null && Number.isFinite(earnDays) && earnDays <= 10;
  if (!ext && !showEarn) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {ext && <span className="rounded border border-line px-1 py-px text-[10px] text-muted">ext</span>}
      {showEarn && (
        <ChipTooltip
          label={`E${earnDays}d`}
          tone="border-warn/50 text-warn bg-warn/10"
          tooltip={`earnings in ${earnDays}d — inside typical hold window`}
        />
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
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span className="inline-flex cursor-default items-center rounded border border-line px-1.5 py-px font-mono text-[11px] tabular-nums text-muted">
          {list.length}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="max-w-xs rounded bg-elevated px-2 py-1.5 text-[12px] text-muted shadow-lg border border-line z-50"
          sideOffset={4}
        >
          <ul className="space-y-0.5">
            {list.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <Tooltip.Arrow className="fill-elevated" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span className="inline-flex cursor-default text-muted">
          <Info size={12} />
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="max-w-xs rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
          sideOffset={4}
        >
          {text}
          <Tooltip.Arrow className="fill-elevated" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
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

function fmtRet(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}`;
}

function ExpandedRow({ row }: { row: BridgeRow }) {
  const [bars, setBars] = useState<number[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/argus/history/${row.fetch_symbol || row.ticker}?period=3mo`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const raw = Array.isArray(data?.bars) ? data.bars : [];
        const closes = raw
          .map((b: { close: number }) => b.close)
          .filter((c: number) => Number.isFinite(c));
        if (closes.length >= 2) setBars(closes);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [row.fetch_symbol, row.ticker]);

  const accts = (row.top_accounts ?? "")
    .split(";")
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <div className="space-y-1.5 py-3 font-mono text-[13px] text-muted">
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
          comb {fmtScore(row.combined_score)} <InfoTip text="magnitude does not predict returns (r≈0)" />
        </span>
        <span className="text-muted">·</span>
        <span>quality {fmtNum(row.quality_score, 1)}</span>
        <span className="text-muted">·</span>
        <span>n_eff {fmtNum(row.n_eff, 1)}</span>
        <span className="text-muted">·</span>
        <span>regime {row.ticker_regime || "—"}</span>
        <span className="text-muted">·</span>
        <span>
          1W/6M/1Y {fmtRet(row.ret_5d)}/{fmtRet(row.ret_126d)}/{fmtRet(row.ret_252d)}
        </span>
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
      key: "conv",
      header: "C",
      align: "center",
      render: (r) => <ConvictionDot value={r.conviction} />,
    },
    {
      key: "legs",
      header: "Sent · Tech · Fund",
      render: (r) => <LegBars s={r.sentiment_score} t={r.tech_score} f={r.catalyst_score} />,
    },
    {
      key: "industry",
      header: "Sector",
      render: (r) => <span className="text-muted">{r.industry || "—"}</span>,
    },
    {
      key: "r1d",
      header: "1D",
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.ret_1d ?? -Infinity) - (b.ret_1d ?? -Infinity),
      render: (r) => <Ret v={r.ret_1d} />,
    },
    {
      key: "r1m",
      header: "1M",
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.ret_20d ?? -Infinity) - (b.ret_20d ?? -Infinity),
      render: (r) => <Ret v={r.ret_20d} />,
    },
    {
      key: "flags",
      header: "⚑",
      render: (r) => <RowFlags ext={r.is_extended} earnDays={r.earnings_in_days} />,
    },
    {
      key: "cat",
      header: "Cat",
      render: (r) => <CatalystCount value={r.catalysts} />,
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
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(FILTERS_KEY, JSON.stringify(next));
      return next;
    });
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
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={active.search}
          onChange={(e) => update({ search: e.target.value })}
          placeholder="search…"
          className="w-44 rounded border border-line bg-surface px-2.5 py-1 text-[13px] text-foreground placeholder-muted focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={() => update({ hcOnly: !active.hcOnly })}
          className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[12px] ${
            active.hcOnly ? "border-accent text-accent" : "border-line text-muted"
          }`}
        >
          HC
          <InfoTip text="consensus, not edge" />
        </button>
        <select
          value={active.conviction}
          onChange={(e) => update({ conviction: e.target.value })}
          className="rounded border border-line bg-surface px-2 py-1 text-[13px] text-foreground focus:border-accent focus:outline-none"
        >
          <option value="">conviction</option>
          <option value="high">high</option>
          <option value="med">med</option>
          <option value="low">low</option>
        </select>
        <select
          value={active.sector}
          onChange={(e) => update({ sector: e.target.value })}
          className="rounded border border-line bg-surface px-2 py-1 text-[13px] text-foreground focus:border-accent focus:outline-none"
        >
          <option value="">sector</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {GROUP_META.map((g) => (
        <Panel
          key={g.key}
          title={`${g.title}  (${sorted[g.key].length})`}
          subtitle={g.rationale}
        >
          <GroupTable
            rows={sorted[g.key]}
            newSet={newSet}
            onOpen={onOpen}
            persistKey={`today-${g.key}`}
          />
        </Panel>
      ))}

      <Panel
        title={`Everything else  (${sorted.other.length})`}
        collapsible
        defaultOpen={false}
        persistKey="today-other"
      >
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
