"use client";

import Link from "next/link";
import useSWR from "swr";
import { Zap } from "lucide-react";
import Panel from "@/components/ui/Panel";
import Loading from "@/components/ui/Loading";
import type { BridgeRow } from "@/types/bridge";
import { useTickerData } from "@/lib/useTickerData";
import { parseCatalysts, type Catalyst } from "@/lib/catalysts";

const NEG_TOKENS = ["downgrade", "miss", "dilution", "cut", "warn", "lawsuit", "fraud"];

/** The dated half of the catalysts endpoint. `next_earnings` is deliberately not
 *  read here — the header owns the earnings countdown off this same SWR key, so
 *  the fetch dedupes and the two can never state a different date (TH-03). */
interface DatedFeed {
  last_earnings: { date: string; surprise_pct: number | null; reaction_pct: number | null } | null;
  analyst: { date: string; firm: string; to: string; action: string }[];
}

const datedFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

function fmtDay(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

const ACTION_ARROW: Record<string, string> = { up: "↑", down: "↓" };

/** One dated fact: when it happened in a fixed 58px slot, what happened beside
 *  it, so the dates form a column rather than a ragged prefix (K-13). */
function DatedRow({ when, children }: { when: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="w-[58px] shrink-0 text-data text-muted">{when}</span>
      <span className="min-w-0 text-body text-2">{children}</span>
    </div>
  );
}

/** The two dated facts the strip under the header used to carry. They moved into
 *  this card when that strip went; the header only took the earnings countdown,
 *  so without this the last-earnings reaction and the analyst action would have
 *  left the page entirely. */
function DatedCatalysts({ ticker }: { ticker: string }) {
  const { data } = useSWR<DatedFeed>(`/api/argus/catalysts/${ticker}`, datedFetcher, {
    refreshInterval: 3_600_000,
    shouldRetryOnError: false,
  });

  const rows: React.ReactNode[] = [];

  const last = data?.last_earnings ?? null;
  if (last) {
    const r = last.reaction_pct;
    rows.push(
      <DatedRow key="earnings" when={fmtDay(last.date)}>
        Last earnings
        {r !== null && (
          <>
            {" · stock "}
            <span className={r >= 0 ? "text-pos" : "text-neg"}>
              {r >= 0 ? "+" : ""}
              {r.toFixed(1)}%
            </span>
            {" on the release"}
          </>
        )}
      </DatedRow>
    );
  }

  const a = data?.analyst?.[0];
  if (a) {
    rows.push(
      <DatedRow key="analyst" when={fmtDay(a.date)}>
        {a.firm} {ACTION_ARROW[a.action] ?? "→"} {a.to}
      </DatedRow>
    );
  }

  // No dated feed means no block — not an empty slot where two rows would be.
  if (rows.length === 0) return null;
  return <div className="flex flex-col gap-2 border-b border-line pb-3">{rows}</div>;
}

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

/** Absolute dollars at revenue/market-cap scale — $2.4B, not $2400000000.00. */
function fmtBig(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
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
            <span className="text-label text-muted">{label}</span>
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
  if (data.revenue_ttm != null) fields.push({ label: "rev ttm", value: fmtBig(data.revenue_ttm) });
  if (data.revenue_growth_pct != null)
    fields.push({ label: "rev growth", value: fmtPct(data.revenue_growth_pct) });
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
          <span className="text-muted text-label">{f.label} </span>
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
    <Panel
      title="Catalysts & Fundamentals"
      actions={
        // Out of the card and onto another page, so the arrow is `→`. `›` is the
        // product's mark for more of the same list in place.
        <Link href="/calendar" className="text-label text-accent hover:underline">
          Calendar →
        </Link>
      }
    >
      <div className="space-y-3">
        <DatedCatalysts ticker={ticker} />
        {bridgeRow ? (
          <BridgeCatalysts bridgeRow={bridgeRow} />
        ) : (
          <OffBridgeCatalysts ticker={ticker} />
        )}
      </div>
    </Panel>
  );
}
