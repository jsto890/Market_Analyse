"use client";

import { Zap } from "lucide-react";
import Panel from "@/components/ui/Panel";
import Loading from "@/components/ui/Loading";
import type { BridgeRow } from "@/types/bridge";
import { useTickerData } from "@/lib/useTickerData";
import { parseCatalysts, type Catalyst } from "@/lib/catalysts";

const NEG_TOKENS = ["downgrade", "miss", "dilution", "cut", "warn", "lawsuit", "fraud"];

/** The feed states the direction in the token's suffix; the word list is only
 *  the fallback for the tokens that arrive unsigned. */
function isNegative(c: Catalyst): boolean {
  if (c.direction) return c.direction === "down";
  const t = c.label.toLowerCase();
  return NEG_TOKENS.some((n) => t.includes(n));
}

function CatalystRow({ catalyst }: { catalyst: Catalyst }) {
  const neg = isNegative(catalyst);
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className="self-stretch w-0.5 shrink-0 rounded-full"
        style={{ background: neg ? "var(--red)" : "var(--green)" }}
        aria-hidden="true"
      />
      <Zap size={12} className={neg ? "text-neg shrink-0" : "text-pos shrink-0"} />
      <span className="text-data text-foreground">{catalyst.label}</span>
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
  const tokens = parseCatalysts(bridgeRow.catalysts);

  return (
    <div className="space-y-3">
      {tokens.length > 0 ? (
        <div className="space-y-0">
          {tokens.map((c) => (
            <CatalystRow key={c.label} catalyst={c} />
          ))}
        </div>
      ) : (
        <p className="text-body text-muted">No catalyst tokens today</p>
      )}

      {/* Vote ticks */}
      <div className="flex items-center gap-3 border-t border-line pt-2 flex-wrap">
        <span className="text-micro text-muted">votes</span>
        {VOTE_LABELS.map(({ key, label }) => (
          <span
            key={key}
            className="inline-flex items-center gap-1 text-data"
          >
            <VoteTick value={Number(bridgeRow[key])} />
            <span className="text-micro text-muted">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function OffBridgeCatalysts({ ticker }: { ticker: string }) {
  const {
    fundamentals: { data, error, isLoading },
  } = useTickerData(ticker);

  if (isLoading) {
    return <Loading variant="lines" count={2} label="Loading fundamentals" />;
  }

  const offline = error != null || data == null || data.error != null;
  if (offline) {
    return <p className="text-body text-muted">No fundamental data available</p>;
  }

  const fields: { label: string; value: string }[] = [];
  if (data.revenue_ttm != null) fields.push({ label: "rev ttm", value: fmtPct(data.revenue_ttm) });
  if (data.pe_ratio != null) fields.push({ label: "P/E", value: data.pe_ratio.toFixed(1) });
  if (data.eps_ttm != null) fields.push({ label: "EPS", value: data.eps_ttm.toFixed(2) });
  if (data.analyst_target != null) fields.push({ label: "target", value: fmtMoney(data.analyst_target) });
  if (data.analyst_rating != null) fields.push({ label: "rating", value: data.analyst_rating });
  if (data.short_pct_float != null) fields.push({ label: "short", value: fmtPct(data.short_pct_float) });

  if (fields.length === 0) {
    return <p className="text-body text-muted">No fundamental data available</p>;
  }

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-data">
      {fields.map((f) => (
        <span key={f.label}>
          <span className="text-muted text-micro">{f.label} </span>
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
