import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { reportDates, byDate } from "@/lib/signals";
import { latestPerDay } from "@/lib/ingest";

const ACTIONABLE = new Set(["aligned", "pullback", "tech_fund"]);

export interface DiffRow {
  ticker: string;
  report_group: string;
  sentiment_score: number;
}

export interface DiffResult {
  newTickers: Set<string>;
  dropped: { ticker: string; group: string }[];
  groupMoves: { ticker: string; from: string; to: string }[];
  sentimentTurns: Set<string>;
}

export function diffReports(today: DiffRow[], yesterday: DiffRow[]): DiffResult {
  const todayMap = new Map<string, DiffRow>();
  for (const row of today) {
    if (ACTIONABLE.has(row.report_group)) todayMap.set(row.ticker, row);
  }

  const yesterdayMap = new Map<string, DiffRow>();
  for (const row of yesterday) {
    if (ACTIONABLE.has(row.report_group)) yesterdayMap.set(row.ticker, row);
  }

  const newTickers = new Set<string>();
  const dropped: { ticker: string; group: string }[] = [];
  const groupMoves: { ticker: string; from: string; to: string }[] = [];
  const sentimentTurns = new Set<string>();

  for (const ticker of Array.from(todayMap.keys())) {
    const todayRow = todayMap.get(ticker)!;
    if (!yesterdayMap.has(ticker)) {
      newTickers.add(ticker);
    } else {
      const yRow = yesterdayMap.get(ticker)!;
      if (yRow.report_group !== todayRow.report_group) {
        groupMoves.push({ ticker, from: yRow.report_group, to: todayRow.report_group });
      }
      if (yRow.report_group === "pullback" && todayRow.sentiment_score - yRow.sentiment_score >= 0.15) {
        sentimentTurns.add(ticker);
      }
    }
  }

  for (const ticker of Array.from(yesterdayMap.keys())) {
    const yRow = yesterdayMap.get(ticker)!;
    if (!todayMap.has(ticker)) {
      dropped.push({ ticker, group: yRow.report_group });
    }
  }

  return { newTickers, dropped, groupMoves, sentimentTurns };
}

function resolveReportsDir(): string {
  return process.env.BRIDGE_DIR ?? path.join(process.cwd(), "..", "reports");
}

function loadCsvRows(filePath: string): DiffRow[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const result = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    transform: (v) => (v === "True" ? true : v === "False" ? false : v === "nan" ? null : v),
  });

  const rows: DiffRow[] = [];
  for (const raw of result.data) {
    const ticker = raw["ticker"];
    if (!ticker || typeof ticker !== "string") continue;
    const rg = raw["report_group"];
    const report_group = typeof rg === "string" && rg ? rg : deriveGroupFromCsvRow(raw);
    const ss = raw["sentiment_score"];
    const sentiment_score = typeof ss === "number" && isFinite(ss) ? ss : 0;
    rows.push({ ticker: String(ticker).toUpperCase(), report_group, sentiment_score });
  }
  return rows;
}

function deriveGroupFromCsvRow(row: Record<string, unknown>): string {
  const g1 = row["group1"];
  const g2 = row["group2"];
  const conviction = row["conviction"];
  const ss = row["sentiment_score"];
  const sentimentScore = typeof ss === "number" && isFinite(ss) ? ss : null;
  if (g1 === true || g1 === 1 || g1 === "True" || g1 === "1") return "aligned";
  if (
    (g2 === true || g2 === 1 || g2 === "True" || g2 === "1") &&
    conviction === "high" &&
    sentimentScore !== null &&
    sentimentScore < 0.2
  )
    return "pullback";
  if (g2 === true || g2 === 1 || g2 === "True" || g2 === "1") return "tech_fund";
  return "other";
}

export async function loadYesterdayRows(todayDate?: string): Promise<DiffRow[]> {
  const rawDates = reportDates() as { date: string }[];

  if (rawDates.length >= 2) {
    let targetDate: string;
    if (todayDate) {
      const before = rawDates.filter((r) => r.date < todayDate).sort((a, b) => b.date.localeCompare(a.date));
      if (before.length === 0) return [];
      targetDate = before[0].date;
    } else {
      const sorted = rawDates.sort((a, b) => b.date.localeCompare(a.date));
      targetDate = sorted[1].date;
    }

    const dbRows = byDate(targetDate) as Array<Record<string, unknown>>;
    return dbRows.map((r) => {
      const rg = r["report_group"];
      const report_group =
        typeof rg === "string" && rg ? rg : deriveGroupFromCsvRow(r);
      const ss = r["sentiment_score"];
      const sentiment_score =
        typeof ss === "number" && isFinite(ss) ? ss : 0;
      return {
        ticker: String(r["ticker"]).toUpperCase(),
        report_group,
        sentiment_score,
      };
    });
  }

  const reportsDir = resolveReportsDir();
  let names: string[];
  try {
    names = fs
      .readdirSync(reportsDir)
      .filter((f) => /^bridge_\d{8}_\d{4}\.csv$/.test(f));
  } catch {
    return [];
  }

  if (names.length === 0) return [];

  const perDay = latestPerDay(names);
  const sortedDates = Array.from(perDay.keys()).sort().reverse();

  let targetDay: string;
  if (todayDate) {
    const before = sortedDates.filter((d) => d < todayDate);
    if (before.length === 0) return [];
    targetDay = before[0];
  } else {
    if (sortedDates.length < 2) return [];
    targetDay = sortedDates[1];
  }

  const fileName = perDay.get(targetDay);
  if (!fileName) return [];

  try {
    return loadCsvRows(path.join(reportsDir, fileName));
  } catch {
    return [];
  }
}
