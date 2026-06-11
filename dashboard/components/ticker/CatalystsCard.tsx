"use client";

import useSWR from "swr";
import { Zap } from "lucide-react";
import Panel from "@/components/ui/Panel";
import Skeleton from "@/components/ui/Skeleton";
import type { BridgeRow } from "@/types/bridge";
import type { FundamentalsData } from "@/types/argus";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json() as Promise<FundamentalsData>;
  });

const NEG_TOKENS = ["downgrade", "miss", "dilution", "cut", "warn", "lawsuit", "fraud"];

function splitCatalysts(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[+;]/)
    .map((s) => s.replace(/["]/g, "").trim())
    .filter(Boolean);
}

function humanize(token: string): string {
  return token.replace(/_/g, " ");
}

function isNegative(token: string): boolean {
  const t = token.toLowerCase();
  return NEG_TOKENS.some((n) => t.includes(n));
}

function CatalystRow({ token }: { token: string }) {
  const neg = isNegative(token);
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className="self-stretch w-0.5 shrink-0 rounded-full"
        style={{ background: neg ? "var(--red)" : "var(--green)" }}
        aria-hidden="true"
      />
      <Zap size={12} className={neg ? "text-neg shrink-0" : "text-pos shrink-0"} />
      <span className="font-mono text-[13px] text-foreground">{humanize(token)}</span>
    </div>
  );
}

const VOTE_LABELS: { key: keyof BridgeRow; label: string }[] = [
  { key: "vote_event_catalyst", label: "event" },
  { key: "vote_earnings_proximity", label: "earnings" },
  { key: "vote_squeeze_setup", label: "squeeze" },
  { key: "vote_growth_profitability", label: "growth" },
  { key: "vote_analyst_upside", label: "upside" },
];

function VoteTick({ value }: { value: number }) {
  if (!Number.isFinite(value) || value === 0) {
    return <span className="text-muted">—</span>;
  }
  if (value > 0) return <span className="text-pos">✓</span>;
  return <span className="text-neg">✗</span>;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function BridgeCatalysts({ bridgeRow }: { bridgeRow: BridgeRow }) {
  const tokens = splitCatalysts(bridgeRow.catalysts);

  return (
    <div className="space-y-3">
      {tokens.length > 0 ? (
        <div className="space-y-0">
          {tokens.map((t) => (
            <CatalystRow key={t} token={t} />
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-muted">No catalyst tokens today</p>
      )}

      {/* Vote ticks */}
      <div className="flex items-center gap-3 border-t border-line pt-2 flex-wrap">
        <span className="text-[11px] text-muted font-mono">votes</span>
        {VOTE_LABELS.map(({ key, label }) => (
          <span
            key={key}
            className="inline-flex items-center gap-1 font-mono text-[13px] tabular-nums"
            title={label}
          >
            <VoteTick value={Number(bridgeRow[key])} />
            <span className="text-[10px] text-muted">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function OffBridgeCatalysts({ ticker }: { ticker: string }) {
  const { data, error, isLoading } = useSWR<FundamentalsData>(
    `/api/argus/fundamentals/${ticker}`,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton width="80%" height={10} />
        <Skeleton width="60%" height={10} />
      </div>
    );
  }

  const offline = error != null || data == null || data.error != null;
  if (offline) {
    return <p className="text-[12px] text-muted">No fundamental data — IBKR offline</p>;
  }

  const fields: { label: string; value: string }[] = [];
  if (data.revenue_ttm != null) fields.push({ label: "rev ttm", value: fmtPct(data.revenue_ttm) });
  if (data.pe_ratio != null) fields.push({ label: "P/E", value: data.pe_ratio.toFixed(1) });
  if (data.eps_ttm != null) fields.push({ label: "EPS", value: data.eps_ttm.toFixed(2) });
  if (data.analyst_target != null) fields.push({ label: "target", value: fmtMoney(data.analyst_target) });
  if (data.analyst_rating != null) fields.push({ label: "rating", value: data.analyst_rating });
  if (data.short_pct_float != null) fields.push({ label: "short", value: fmtPct(data.short_pct_float) });

  if (fields.length === 0) {
    return <p className="text-[12px] text-muted">No fundamental data available</p>;
  }

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[13px] tabular-nums">
      {fields.map((f) => (
        <span key={f.label}>
          <span className="text-muted text-[11px]">{f.label} </span>
          <span className="text-foreground">{f.value}</span>
        </span>
      ))}
    </div>
  );
}

interface CatalystsCardProps {
  ticker: string;
  bridgeRow: BridgeRow | null;
}

export default function CatalystsCard({ ticker, bridgeRow }: CatalystsCardProps) {
  return (
    <Panel title="Catalysts & Fundamentals">
      {bridgeRow ? (
        <BridgeCatalysts bridgeRow={bridgeRow} />
      ) : (
        <OffBridgeCatalysts ticker={ticker} />
      )}
    </Panel>
  );
}
