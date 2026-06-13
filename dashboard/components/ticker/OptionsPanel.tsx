"use client";

import useSWR from "swr";
import Panel from "@/components/ui/Panel";
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
  type?: unknown;
  lastPrice?: unknown;
  bid?: unknown;
  ask?: unknown;
  percentChange?: unknown;
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

  return (
    <div>
      <p className="text-[11px] font-medium text-muted uppercase tracking-wide mb-1.5">
        {label}
      </p>
      <table className="w-full font-mono text-[12px] tabular-nums border-collapse">
        <thead>
          <tr className="text-left text-muted text-[11px] border-b border-line">
            <th className="pb-1 pr-3 font-medium">Strike</th>
            <th className="pb-1 pr-3 font-medium text-right">Last</th>
            <th className="pb-1 pr-3 font-medium text-right">Bid×Ask</th>
            <th className="pb-1 pr-3 font-medium text-right">Δ%</th>
            <th className="pb-1 pr-3 font-medium text-right">Vol</th>
            <th className="pb-1 pr-3 font-medium text-right">OI</th>
            <th className="pb-1 font-medium">Type</th>
          </tr>
        </thead>
        <tbody>
          {valid.map((row, i) => {
            const last = num(row.lastPrice);
            const bid = num(row.bid);
            const ask = num(row.ask);
            const chg = num(row.percentChange);
            const vol = num(row.vol) ?? num(row.volume);
            const oi = num(row.oi) ?? num(row.openInterest);
            return (
              <tr key={i} className="border-t border-line">
                <td className="py-1 pr-3 text-foreground">{String(row.strike ?? "—")}</td>
                <td className="py-1 pr-3 text-right text-foreground">{last !== null ? last.toFixed(2) : "—"}</td>
                <td className="py-1 pr-3 text-right text-muted">
                  {bid !== null && ask !== null ? `${bid.toFixed(2)}×${ask.toFixed(2)}` : "—"}
                </td>
                <td className={`py-1 pr-3 text-right ${chg === null ? "text-muted" : chg >= 0 ? "text-pos" : "text-neg"}`}>
                  {chg !== null ? `${chg >= 0 ? "+" : ""}${chg.toFixed(0)}%` : "—"}
                </td>
                <td className="py-1 pr-3 text-right text-muted">{vol !== null ? vol.toLocaleString() : "—"}</td>
                <td className="py-1 pr-3 text-right text-muted">{oi !== null ? oi.toLocaleString() : "—"}</td>
                <td className="py-1 text-muted">{String(row.type ?? "—")}</td>
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
        <p className="font-mono text-[12px] text-muted">Loading…</p>
      </Panel>
    );
  }

  if (argusDown) {
    return (
      <Panel title="Options" collapsible defaultOpen={false} persistKey="ticker-options">
        <div className="flex items-center gap-2 font-mono text-[12px] text-muted">
          <span>Argus API offline</span>
          <span>·</span>
          <button
            type="button"
            onClick={() => void mutate()}
            className="text-accent border border-accent/40 rounded px-2 py-0.5 hover:bg-accent/10 transition-colors"
          >
            Retry
          </button>
        </div>
      </Panel>
    );
  }

  if (noChain) {
    return (
      <Panel title="Options" collapsible defaultOpen={false} persistKey="ticker-options">
        <p className="font-mono text-[12px] text-muted">
          no options chain for {upper} (source: yfinance)
        </p>
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
        <div className="font-mono text-[13px] tabular-nums">
          <span className="text-muted">spot </span>
          <span className="text-foreground">${data.spot.toFixed(2)}</span>
        </div>

        {/* Flags */}
        {data.flags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.flags.map((flag) => (
              <span
                key={flag}
                className="inline-flex items-center rounded border border-warn/50 bg-warn/10 px-1.5 py-px font-mono text-[10px] text-warn"
              >
                {flag}
              </span>
            ))}
          </div>
        )}

        {/* P/C summary table */}
        <table className="w-full font-mono text-[12px] tabular-nums border-collapse">
          <thead>
            <tr className="text-left text-[11px] text-muted border-b border-line">
              <th className="pb-1 font-medium" />
              <th className="pb-1 pr-4 font-medium text-right text-pos">Calls</th>
              <th className="pb-1 font-medium text-right text-neg">Puts</th>
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
            <tr className="border-t border-line">
              <td className="py-1 text-muted">P/C OI</td>
              <td className="py-1 pr-4 text-right text-muted">—</td>
              <td className="py-1 text-right text-foreground">{data.summary.pcr_oi.toFixed(2)}</td>
            </tr>
            <tr className="border-t border-line">
              <td className="py-1 text-muted">P/C Vol</td>
              <td className="py-1 pr-4 text-right text-muted">—</td>
              <td className="py-1 text-right text-foreground">{data.summary.pcr_vol.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        {/* IV row */}
        <div className="flex flex-wrap gap-4 font-mono text-[12px] tabular-nums border-t border-line pt-2">
          <span>
            <span className="text-muted">ATM IV c </span>
            <span className="text-pos">{fmtPct(data.iv_atm_call)}</span>
          </span>
          <span>
            <span className="text-muted">p </span>
            <span className="text-neg">{fmtPct(data.iv_atm_put)}</span>
          </span>
          <span>
            <span className="text-muted">skew </span>
            <span
              className={
                data.iv_skew == null
                  ? "text-muted"
                  : data.iv_skew > 0
                  ? "text-pos"
                  : data.iv_skew < 0
                  ? "text-neg"
                  : "text-foreground"
              }
            >
              {data.iv_skew == null
                ? "—"
                : `${data.iv_skew >= 0 ? "+" : ""}${data.iv_skew.toFixed(3)}`}
            </span>
          </span>
        </div>

        {/* Unusual activity */}
        {(data.unusual_calls_top.length > 0 || data.unusual_puts_top.length > 0) ? (
          <div className="space-y-3 border-t border-line pt-2">
            <UnusualTable rows={data.unusual_calls_top} label="Unusual Calls" />
            <UnusualTable rows={data.unusual_puts_top} label="Unusual Puts" />
          </div>
        ) : state === "closed" ? (
          <p className="font-mono text-[11px] text-muted border-t border-line pt-2">
            unusual-activity lists rebuild from live volume during US hours; overnight
            recaps land with WS-1 snapshots
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
