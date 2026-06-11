"use client";

import useSWR from "swr";
import Panel from "@/components/ui/Panel";
import type { OptionsFlowData } from "@/types/argus";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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
  oi?: unknown;
  type?: unknown;
  [key: string]: unknown;
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
            <th className="pb-1 pr-3 font-medium">Expiry</th>
            <th className="pb-1 pr-3 font-medium text-right">Vol</th>
            <th className="pb-1 pr-3 font-medium text-right">OI</th>
            <th className="pb-1 font-medium">Type</th>
          </tr>
        </thead>
        <tbody>
          {valid.map((row, i) => (
            <tr key={i} className="border-t border-line">
              <td className="py-1 pr-3 text-foreground">{String(row.strike ?? "—")}</td>
              <td className="py-1 pr-3 text-muted">{String(row.expiry ?? "—")}</td>
              <td className="py-1 pr-3 text-right text-muted">
                {typeof row.vol === "number" ? row.vol.toLocaleString() : String(row.vol ?? "—")}
              </td>
              <td className="py-1 pr-3 text-right text-muted">
                {typeof row.oi === "number" ? row.oi.toLocaleString() : String(row.oi ?? "—")}
              </td>
              <td className="py-1 text-muted">{String(row.type ?? "—")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ApiResponse = OptionsFlowData | { error: string };

function isErrorResponse(r: ApiResponse): r is { error: string } {
  return "error" in r && !("symbol" in r);
}

export default function OptionsPanel({ ticker }: { ticker: string }) {
  const upper = ticker.toUpperCase();

  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(
    `/api/argus/flow/${upper}`,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  const offline = error != null || (data != null && isErrorResponse(data));

  if (isLoading) {
    return (
      <Panel title="Options" collapsible defaultOpen persistKey="ticker-options">
        <p className="font-mono text-[12px] text-muted">Loading…</p>
      </Panel>
    );
  }

  if (offline) {
    return (
      <Panel title="Options" collapsible defaultOpen={false} persistKey="ticker-options">
        <div className="flex items-center gap-2 font-mono text-[12px] text-muted">
          <span>IBKR offline</span>
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

  if (!data || isErrorResponse(data)) return null;

  return (
    <Panel
      title="Options"
      subtitle={`${data.expiration}`}
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
