"use client";

import useSWR from "swr";
import Panel from "@/components/ui/Panel";
import Empty from "@/components/ui/Empty";
import Failed from "@/components/ui/Failed";
import InfoTip from "@/components/ui/InfoTip";
import Loading from "@/components/ui/Loading";
import type { OptionsFlowData } from "@/types/argus";
import { usMarketState } from "@/lib/market-clock";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

function fmt(n: number): string {
  return n.toLocaleString();
}

function fmtPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

interface UnusualRow {
  strike?: unknown;
  expiry?: unknown;
  vol?: unknown;
  volume?: unknown;        // yfinance field name
  oi?: unknown;
  openInterest?: unknown;  // yfinance field name
  lastPrice?: unknown;
  score?: unknown;
  basis?: unknown;
  [key: string]: unknown;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isUnusualRow(v: unknown): v is UnusualRow {
  return typeof v === "object" && v !== null;
}

function UnusualTable({ rows, label }: { rows: unknown[]; label: string }) {
  const valid = rows.filter(isUnusualRow);
  if (valid.length === 0) return null;

  const hasScores = valid.some((row) => num(row.score) !== null);

  return (
    <div>
      <p className="eyebrow mb-1.5">{label}</p>
      <table className="w-full text-data border-collapse">
        <thead>
          <tr className="text-left text-muted text-micro border-b border-line">
            {hasScores && <th className="pb-1 pr-3 font-medium">σ</th>}
            <th className="pb-1 pr-3 font-medium">Strike</th>
            <th className="pb-1 pr-3 font-medium text-right">Last</th>
            <th className="pb-1 pr-3 font-medium text-right">Vol</th>
            <th className="pb-1 font-medium text-right">OI</th>
          </tr>
        </thead>
        <tbody>
          {valid.map((row, i) => {
            const last = num(row.lastPrice);
            const vol = num(row.vol) ?? num(row.volume);
            const oi = num(row.oi) ?? num(row.openInterest);
            const score = num(row.score);
            return (
              <tr key={i} className="border-t border-line">
                {hasScores && (
                  <td className="py-1 pr-3 text-muted">
                    {score !== null && row.basis ? (
                      <InfoTip content={String(row.basis)} label="How this score was reached">
                        <span className="text-data text-muted">{score.toFixed(1)}</span>
                      </InfoTip>
                    ) : (
                      score?.toFixed(1) ?? "—"
                    )}
                  </td>
                )}
                <td className="py-1 pr-3 text-foreground">{String(row.strike ?? "—")}</td>
                <td className="py-1 pr-3 text-right text-foreground">{last !== null ? last.toFixed(2) : "—"}</td>
                <td className="py-1 pr-3 text-right text-muted">{vol !== null ? vol.toLocaleString() : "—"}</td>
                <td className="py-1 text-right text-muted">{oi !== null ? oi.toLocaleString() : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type ApiResponse = OptionsFlowData | { error: string };

function isErrorResponse(r: ApiResponse): r is { error: string } {
  return "error" in r && !("summary" in r);
}

export default function OptionsPanel({ ticker }: { ticker: string }) {
  const upper = ticker.toUpperCase();

  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(
    `/api/argus/flow/${upper}`,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  const argusDown = error != null; // proxy 503/504 → fetcher threw
  const noChain = data != null && isErrorResponse(data); // flow returned {error: "no chain"}

  const state = usMarketState();
  const stateLabel =
    state === "regular" ? "live" : state === "pre" ? "pre-market" : state === "after" ? "after-hours" : "US closed — last session";

  if (isLoading) {
    return (
      <Panel title="Options" collapsible defaultOpen persistKey="ticker-options">
        <Loading variant="rows" count={4} label="Loading options" />
      </Panel>
    );
  }

  if (argusDown) {
    return (
      <Panel title="Options" collapsible defaultOpen={false} persistKey="ticker-options">
        <Failed
          title="Options feed offline"
          message="The Argus API didn’t answer, so the chain summary below is missing. Nothing else on this page depends on it."
          action={
            <button
              type="button"
              onClick={() => void mutate()}
              className="rounded border border-accent/40 px-2 py-0.5 text-data text-accent transition-colors hover:bg-accent/10"
            >
              Retry
            </button>
          }
        />
      </Panel>
    );
  }

  if (noChain) {
    return (
      <Panel title="Options" collapsible defaultOpen={false} persistKey="ticker-options">
        <Empty
          title="No options chain"
          message={`yfinance lists no tradeable contracts for ${upper}.`}
        />
      </Panel>
    );
  }

  if (!data || isErrorResponse(data)) return null;

  return (
    <Panel
      title="Options"
      subtitle={`${data.expiration} · ${stateLabel}`}
      collapsible
      defaultOpen={false}
      persistKey="ticker-options"
    >
      <div className="space-y-3">
        {/* Spot */}
        <div className="text-data">
          <span className="text-muted">spot </span>
          <span className="text-foreground">${data.spot.toFixed(2)}</span>
        </div>

        {/* Flags */}
        {data.flags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.flags.map((flag) => (
              <span
                key={flag}
                className="inline-flex items-center rounded border border-warn/50 bg-warn/10 px-1.5 py-px text-micro text-warn"
              >
                {flag}
              </span>
            ))}
          </div>
        )}

        {/* P/C summary table */}
        <div>
          <p className="eyebrow mb-1.5">P/C Summary</p>
          <table className="w-full text-data border-collapse">
          <thead>
            <tr className="text-left text-micro text-muted border-b border-line">
              <th className="pb-1 font-medium" />
              <th className="pb-1 pr-4 font-medium text-right text-call">Calls</th>
              <th className="pb-1 font-medium text-right text-put">Puts</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-line">
              <td className="py-1 text-muted">OI</td>
              <td className="py-1 pr-4 text-right text-foreground">{fmt(data.summary.call_oi)}</td>
              <td className="py-1 text-right text-foreground">{fmt(data.summary.put_oi)}</td>
            </tr>
            <tr className="border-t border-line">
              <td className="py-1 text-muted">Volume</td>
              <td className="py-1 pr-4 text-right text-foreground">{fmt(data.summary.call_vol)}</td>
              <td className="py-1 text-right text-foreground">{fmt(data.summary.put_vol)}</td>
            </tr>
          </tbody>
          </table>
          {/* Ratios, not per-side figures. Inside the Calls/Puts grid each one
              had to print a dash on the call side, which reads as a missing
              number rather than as a ratio of the two columns above. */}
          <div className="mt-2 flex flex-wrap gap-4 text-data">
            <span>
              <span className="text-muted">P/C OI </span>
              <span className="text-foreground">{data.summary.pcr_oi.toFixed(2)}</span>
            </span>
            <span>
              <span className="text-muted">P/C vol </span>
              <span className="text-foreground">{data.summary.pcr_vol.toFixed(2)}</span>
            </span>
          </div>
        </div>

        {/* IV row */}
        <div className="border-t border-line pt-2">
          <p className="eyebrow mb-1.5">Implied Volatility</p>
          <div className="flex flex-wrap gap-4 text-data">
            <span>
              <span className="text-muted">ATM IV c </span>
              <span className="text-call">{fmtPct(data.iv_atm_call)}</span>
            </span>
            <span>
              <span className="text-muted">p </span>
              <span className="text-put">{fmtPct(data.iv_atm_put)}</span>
            </span>
            <span>
              <span className="text-muted">skew </span>
              <span
                className={
                  data.iv_skew == null
                    ? "text-muted"
                    : data.iv_skew > 0
                    ? "text-call"
                    : data.iv_skew < 0
                    ? "text-put"
                    : "text-foreground"
                }
              >
                {data.iv_skew == null
                  ? "—"
                  : `${data.iv_skew >= 0 ? "+" : ""}${data.iv_skew.toFixed(3)}`}
              </span>
            </span>
          </div>
        </div>

        {/* Unusual activity */}
        {data.unusual_as_of ? (
          <p className="border-t border-line pt-2 text-body text-muted">
            as of {data.unusual_as_of} close (US) — robust-score (beta), validation pending
          </p>
        ) : state === "closed" ? (
          <p className="border-t border-line pt-2 text-body text-muted">
            unusual-activity lists rebuild from live volume during US hours; overnight
            recaps land with WS-1 snapshots
          </p>
        ) : null}
        {(data.unusual_calls_top.length > 0 || data.unusual_puts_top.length > 0) && (
          <div className="space-y-3 border-t border-line pt-2">
            <UnusualTable rows={data.unusual_calls_top} label="Unusual Calls" />
            <UnusualTable rows={data.unusual_puts_top} label="Unusual Puts" />
          </div>
        )}
      </div>
    </Panel>
  );
}
