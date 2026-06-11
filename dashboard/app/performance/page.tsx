import fs from "fs";
import path from "path";
import Papa from "papaparse";
import Panel from "@/components/ui/Panel";
import StatChip from "@/components/ui/StatChip";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";
import { getPerfRows, perfStats } from "@/lib/performance";
import { getDb } from "@/lib/db";
import { comboClass } from "@/lib/groups";
import MfeHistogram from "./MfeHistogram";
import HistoryBrowser from "./HistoryBrowser";

// ── Types ────────────────────────────────────────────────────────────────────

interface TierRow {
  action_label: string;
  n: number;
  medianPeak: number;
  meanPeak: number;
  reach10Pct: number | null;
  eligible: number;
}

interface ComboRow {
  comboClass: string;
  n: number;
  medianPeak: number;
  meanPeak: number;
  reach10Pct: number | null;
  eligible: number;
}

interface LabelRow {
  label: string;
  n: number;
  medianF5: number | null;
  medianF10: number | null;
  medianF20: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2 * 10) / 10;
}

function mean(vals: number[]): number {
  if (vals.length === 0) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

// Count weekdays between first_said and asOf (exclusive of both endpoints)
function weekdaysBetween(from: string, asOf: Date): number {
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(
    `${asOf.getUTCFullYear()}-${String(asOf.getUTCMonth() + 1).padStart(2, "0")}-${String(asOf.getUTCDate()).padStart(2, "0")}T00:00:00Z`
  );
  let count = 0;
  const cur = new Date(start);
  cur.setUTCDate(cur.getUTCDate() + 1);
  while (cur < end) {
    const dow = cur.getUTCDay();
    if (dow >= 1 && dow <= 5) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

// ── Data loading ─────────────────────────────────────────────────────────────

function loadLabelEfficacy(): LabelRow[] | null {
  const dir = path.join(process.cwd(), "..", "docs", "label_efficacy");
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".csv")).sort().reverse();
    if (files.length === 0) return null;
    const raw = fs.readFileSync(path.join(dir, files[0]), "utf-8");
    const result = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });

    // Group by label
    const byLabel = new Map<string, { f5: number[]; f10: number[]; f20: number[] }>();
    for (const row of result.data) {
      const lbl = row.label;
      if (!lbl) continue;
      if (!byLabel.has(lbl)) byLabel.set(lbl, { f5: [], f10: [], f20: [] });
      const g = byLabel.get(lbl)!;
      if (row.f5 !== "" && row.f5 != null) g.f5.push(parseFloat(row.f5));
      if (row.f10 !== "" && row.f10 != null) g.f10.push(parseFloat(row.f10));
      if (row.f20 !== "" && row.f20 != null) g.f20.push(parseFloat(row.f20));
    }

    return Array.from(byLabel.entries())
      .map(([label, g]) => ({
        label,
        n: g.f5.length + g.f10.length > 0 ? Math.max(g.f5.length, g.f10.length, g.f20.length) : 0,
        medianF5: g.f5.length > 0 ? Math.round(median(g.f5) * 10) / 10 : null,
        medianF10: g.f10.length > 0 ? Math.round(median(g.f10) * 10) / 10 : null,
        medianF20: g.f20.length > 0 ? Math.round(median(g.f20) * 10) / 10 : null,
      }))
      .sort((a, b) => (b.medianF10 ?? -999) - (a.medianF10 ?? -999));
  } catch {
    return null;
  }
}

function getFirstFlags(): Map<string, { action_label: string; combo: string }> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ticker, action_label, combo
         FROM signals
        WHERE rowid IN (
          SELECT MIN(rowid) FROM signals GROUP BY ticker
        )`
    )
    .all() as { ticker: string; action_label: string; combo: string }[];
  const map = new Map<string, { action_label: string; combo: string }>();
  for (const r of rows) map.set(r.ticker, { action_label: r.action_label, combo: r.combo });
  return map;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const rows = getPerfRows();
  const asOf = new Date();

  if (rows.length === 0) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-white mb-2">Performance</h1>
        <EmptyState message="No performance data yet" />
      </main>
    );
  }

  const stats = perfStats(rows, asOf);
  const firstFlags = getFirstFlags();

  // Histogram buckets (10%-wide)
  const buckets: { label: string; count: number }[] = [];
  for (let lo = -10; lo <= 160; lo += 10) {
    const hi = lo + 10;
    buckets.push({
      label: `${lo}–${hi}%`,
      count: rows.filter((r) => r["peak_gain_%"] >= lo && r["peak_gain_%"] < hi).length,
    });
  }
  // Trim trailing empty buckets
  while (buckets.length > 1 && buckets[buckets.length - 1].count === 0) buckets.pop();

  // By action_label
  const tierMap = new Map<string, typeof rows>();
  for (const r of rows) {
    const ff = firstFlags.get(r.ticker);
    const lbl = ff?.action_label ?? "UNKNOWN";
    if (!tierMap.has(lbl)) tierMap.set(lbl, []);
    tierMap.get(lbl)!.push(r);
  }

  const tierRows: TierRow[] = Array.from(tierMap.entries())
    .map(([lbl, rs]) => {
      const eligible = rs.filter((r) => weekdaysBetween(r.first_said, asOf) >= 10);
      return {
        action_label: lbl,
        n: rs.length,
        medianPeak: median(rs.map((r) => r["peak_gain_%"])),
        meanPeak: mean(rs.map((r) => r["peak_gain_%"])),
        reach10Pct: eligible.length > 0
          ? Math.round((eligible.filter((r) => r["peak_gain_%"] >= 10).length / eligible.length) * 1000) / 10
          : null,
        eligible: eligible.length,
      };
    })
    .sort((a, b) => b.medianPeak - a.medianPeak);

  // By combo class
  const ccMap = new Map<string, typeof rows>();
  for (const r of rows) {
    const ff = firstFlags.get(r.ticker);
    const cc = comboClass(ff?.combo);
    if (!ccMap.has(cc)) ccMap.set(cc, []);
    ccMap.get(cc)!.push(r);
  }

  const comboRows: ComboRow[] = Array.from(ccMap.entries())
    .map(([cc, rs]) => {
      const eligible = rs.filter((r) => weekdaysBetween(r.first_said, asOf) >= 10);
      return {
        comboClass: cc,
        n: rs.length,
        medianPeak: median(rs.map((r) => r["peak_gain_%"])),
        meanPeak: mean(rs.map((r) => r["peak_gain_%"])),
        reach10Pct: eligible.length > 0
          ? Math.round((eligible.filter((r) => r["peak_gain_%"] >= 10).length / eligible.length) * 1000) / 10
          : null,
        eligible: eligible.length,
      };
    })
    .sort((a, b) => b.medianPeak - a.medianPeak);

  const labelEfficacy = loadLabelEfficacy();

  const insufficientNote = "n < 5 — insufficient sample";

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-2xl font-bold text-white">Performance</h1>

      {/* Caveat banner */}
      <div className="rounded border border-warn/40 bg-warn/5 px-4 py-3 text-[13px] text-warn leading-relaxed">
        Peak (MFE), not realised P&L — mechanical exits captured ~0% of this in backtest; the edge
        is in selection. n={stats.n} selections, single bull regime (May–Jun 2026). Recent picks are
        right-censored: peaks may not have occurred yet.
      </div>

      {/* KPI row */}
      <Panel title="Summary Statistics">
        <div className="flex flex-wrap gap-2">
          <StatChip
            label="median peak"
            value={`+${fmt(stats.medianPeak)}%`}
            tone="pos"
            tooltip="Median MFE across all selections"
          />
          <StatChip
            label="mean peak"
            value={`+${fmt(stats.meanPeak)}%`}
            tone="pos"
            tooltip="Mean MFE — skewed upward by outliers"
          />
          <StatChip
            label="reached +10%"
            value={`${stats.reached10.count}/${stats.reached10.eligible} eligible`}
            tone="pos"
            tooltip={`${stats.reached10.eligible} picks ≥10 trading days old; younger picks excluded (right-censored)`}
          />
          <StatChip
            label="reached +25%"
            value={`${stats.reached25.count}/${stats.reached25.eligible} eligible`}
            tone="pos"
          />
          <StatChip
            label="reached +50%"
            value={`${stats.reached50.count}/${stats.reached50.eligible} eligible`}
            tone="pos"
          />
          <StatChip
            label="median days-to-peak"
            value={`${fmt(stats.medianDaysToPeak, 0)}d`}
            tooltip="Eligible picks only (≥10 trading days), day-0 peaks excluded"
          />
          <StatChip
            label="day-0 peaks"
            value={`${stats.day0Count}/${stats.n}`}
            tone="warn"
            tooltip="Peaked same day as flagged — likely flagged at/after the move"
          />
        </div>
      </Panel>

      {/* MFE Histogram */}
      <Panel title="Peak Gain Distribution (MFE)" subtitle="10%-wide bins">
        <MfeHistogram buckets={buckets} medianPeak={stats.medianPeak} />
      </Panel>

      {/* By action_label */}
      <Panel title="By Action Label" subtitle="first-flag label per ticker">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="px-3 py-2 text-left font-medium text-muted">Label</th>
                <th className="px-3 py-2 text-right font-medium text-muted">n</th>
                <th className="px-3 py-2 text-right font-medium text-muted">Median Peak</th>
                <th className="px-3 py-2 text-right font-medium text-muted">Mean Peak</th>
                <th className="px-3 py-2 text-right font-medium text-muted">Reached +10%</th>
              </tr>
            </thead>
            <tbody>
              {tierRows.map((r) => {
                const dim = r.n < 5;
                return (
                  <tr key={r.action_label} className="border-b border-line hover:bg-elevated">
                    <td className="px-3 py-2">
                      {r.action_label === "UNKNOWN" ? (
                        <span className="text-muted">unknown</span>
                      ) : (
                        <Badge variant="tier" value={r.action_label} />
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${dim ? "text-muted" : ""}`}>
                      {r.n}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${dim ? "text-muted" : "text-pos"}`}>
                      {dim ? (
                        <span title={insufficientNote}>+{fmt(r.medianPeak)}%</span>
                      ) : (
                        `+${fmt(r.medianPeak)}%`
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${dim ? "text-muted" : ""}`}>
                      +{fmt(r.meanPeak)}%
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted text-[12px]">
                      {r.reach10Pct != null
                        ? `${r.reach10Pct}% (${r.eligible} elig.)`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* By combo class */}
      <Panel title="By Combo Class" subtitle="LSNS/LNLL/LSNL = strong; LNNL/LLNL = weak">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="px-3 py-2 text-left font-medium text-muted">Class</th>
                <th className="px-3 py-2 text-right font-medium text-muted">n</th>
                <th className="px-3 py-2 text-right font-medium text-muted">Median Peak</th>
                <th className="px-3 py-2 text-right font-medium text-muted">Mean Peak</th>
                <th className="px-3 py-2 text-right font-medium text-muted">Reached +10%</th>
              </tr>
            </thead>
            <tbody>
              {comboRows.map((r) => {
                const dim = r.n < 5;
                const classColor =
                  r.comboClass === "strong"
                    ? "text-pos"
                    : r.comboClass === "weak"
                    ? "text-neg"
                    : "text-muted";
                return (
                  <tr key={r.comboClass} className="border-b border-line hover:bg-elevated">
                    <td className={`px-3 py-2 font-medium ${classColor}`}>
                      {r.comboClass}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${dim ? "text-muted" : ""}`}>
                      {r.n}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${dim ? "text-muted" : "text-pos"}`}>
                      {dim ? (
                        <span title={insufficientNote}>+{fmt(r.medianPeak)}%</span>
                      ) : (
                        `+${fmt(r.medianPeak)}%`
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${dim ? "text-muted" : ""}`}>
                      +{fmt(r.meanPeak)}%
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted text-[12px]">
                      {r.reach10Pct != null
                        ? `${r.reach10Pct}% (${r.eligible} elig.)`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Label efficacy */}
      {labelEfficacy && (
        <Panel title="Label Efficacy" subtitle="forward returns by signal label; latest file">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-3 py-2 text-left font-medium text-muted">Label</th>
                  <th className="px-3 py-2 text-right font-medium text-muted">n</th>
                  <th className="px-3 py-2 text-right font-medium text-muted">Median f5</th>
                  <th className="px-3 py-2 text-right font-medium text-muted">Median f10</th>
                  <th className="px-3 py-2 text-right font-medium text-muted">Median f20</th>
                </tr>
              </thead>
              <tbody>
                {labelEfficacy.map((r) => {
                  const dim = r.n < 5;
                  const fmtReturn = (v: number | null) =>
                    v == null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span className={dim ? "text-muted" : v >= 0 ? "text-pos" : "text-neg"}>
                        {v >= 0 ? "+" : ""}{fmt(v)}%
                      </span>
                    );
                  return (
                    <tr key={r.label} className="border-b border-line hover:bg-elevated">
                      <td className={`px-3 py-2 font-mono ${dim ? "text-muted" : ""}`}>
                        {dim ? <span title={insufficientNote}>{r.label}</span> : r.label}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${dim ? "text-muted" : ""}`}>
                        {r.n}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtReturn(r.medianF5)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtReturn(r.medianF10)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtReturn(r.medianF20)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* History browser (client island) */}
      <HistoryBrowser />
    </main>
  );
}
