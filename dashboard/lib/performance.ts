import fs from "fs";
import path from "path";
import Papa from "papaparse";

export interface PerfRow {
  ticker: string;
  obsidian: string;
  first_said: string;
  entry: number;
  peak_date: string;
  peak: number;
  "peak_gain_%": number;
  days_to_peak: number;
}

export interface PerfStats {
  n: number;
  medianPeak: number;
  meanPeak: number;
  reached10: { count: number; eligible: number; total: number };
  reached25: { count: number; eligible: number; total: number };
  reached50: { count: number; eligible: number; total: number };
  medianDaysToPeak: number;
  day0Count: number;
}

// Count weekdays (Mon-Fri) between two dates, inclusive of neither endpoint.
// This matches the spec: C @ 1 calendar day excluded, A/B @ ~24/23 calendar days included.
export function weekdaysBetween(from: string, asOf: Date): number {
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(
    `${asOf.getUTCFullYear()}-${String(asOf.getUTCMonth() + 1).padStart(2, "0")}-${String(asOf.getUTCDate()).padStart(2, "0")}T00:00:00Z`
  );
  let count = 0;
  const cur = new Date(start);
  // advance past start day
  cur.setUTCDate(cur.getUTCDate() + 1);
  while (cur < end) {
    const dow = cur.getUTCDay();
    if (dow >= 1 && dow <= 5) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2 * 10) / 10;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export function perfStats(rows: PerfRow[], asOf: Date): PerfStats {
  const n = rows.length;
  const peaks = rows.map((r) => r["peak_gain_%"]);

  // Eligible = ≥10 trading days old
  const eligibleRows = rows.filter((r) => weekdaysBetween(r.first_said, asOf) >= 10);

  const reached10 = {
    count: eligibleRows.filter((r) => r["peak_gain_%"] >= 10).length,
    eligible: eligibleRows.length,
    total: n,
  };
  const reached25 = {
    count: eligibleRows.filter((r) => r["peak_gain_%"] >= 25).length,
    eligible: eligibleRows.length,
    total: n,
  };
  const reached50 = {
    count: eligibleRows.filter((r) => r["peak_gain_%"] >= 50).length,
    eligible: eligibleRows.length,
    total: n,
  };

  // Day-0 peaks: peaked same day as first_said (all rows, not just eligible)
  const day0Count = rows.filter((r) => r.days_to_peak === 0).length;

  // Median days-to-peak: eligible rows only, excluding day-0
  // (day-0 picks flagged at/after the move; censored picks not yet peaked meaningfully)
  const nonDay0DaysToPeak = eligibleRows
    .filter((r) => r.days_to_peak > 0)
    .map((r) => r.days_to_peak);

  return {
    n,
    medianPeak: median(peaks),
    meanPeak: mean(peaks),
    reached10,
    reached25,
    reached50,
    medianDaysToPeak: median(nonDay0DaysToPeak),
    day0Count,
  };
}

// CSV path is relative to the dashboard package root (one level up from here)
const CSV_PATH = path.join(process.cwd(), "..", "reports", "selection_performance.csv");

function loadCsvRows(): PerfRow[] {
  try {
    const raw = fs.readFileSync(CSV_PATH, "utf-8");
    const result = Papa.parse<Record<string, string>>(raw, {
      header: true,
      skipEmptyLines: true,
    });
    return result.data.map((r) => ({
      ticker: r.ticker,
      obsidian: r.obsidian ?? "",
      first_said: r.first_said,
      entry: parseFloat(r.entry),
      peak_date: r.peak_date ?? "",
      peak: parseFloat(r.peak),
      "peak_gain_%": parseFloat(r["peak_gain_%"]),
      days_to_peak: parseInt(r.days_to_peak, 10),
    }));
  } catch {
    return [];
  }
}

// Module-load constants — computed from the real CSV at server startup.
// Falls back to placeholder values when the CSV is absent.
const _rows = loadCsvRows();
const _stats = _rows.length > 0 ? perfStats(_rows, new Date()) : null;

export const MEDIAN_PEAK_PCT: number = _stats?.medianPeak ?? 23;
export const MEDIAN_DAYS_TO_PEAK: number = _stats?.medianDaysToPeak ?? 7;

export function getPerfRows(): PerfRow[] {
  return _rows;
}
