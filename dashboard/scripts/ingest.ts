import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { openDb } from "../lib/db";
import { latestPerDay, rowToSignal, type SignalRecord } from "../lib/ingest";

const BRIDGE_DIR = process.env.BRIDGE_DIR ?? path.join(process.cwd(), "..", "reports");
const DB_PATH = process.env.ARGUS_DB ?? path.join(process.cwd(), "..", "argus.db");

const allFiles = fs.readdirSync(BRIDGE_DIR).filter((f) => /^bridge_\d{8}_\d{4}\.csv$/.test(f));

const latest = latestPerDay(allFiles);

const db = openDb(DB_PATH);

const tableColSet = new Set(
  db.prepare("PRAGMA table_info(signals)").all().map((r) => (r as { name: string }).name)
);

const allCols: (keyof Omit<SignalRecord, "date" | "ticker">)[] = [
  "alignment", "argus_verdict", "combined_score", "tech_score", "sentiment_score",
  "quality_score", "agreement_pct", "high_conviction", "entry", "stop", "target",
  "risk_reward", "entry_quality", "stop_anchor", "catalysts",
  "ret_1d", "ret_5d", "ret_20d", "ret_126d", "ret_252d",
  "conviction", "action_label", "trade_style", "combo", "ticker_regime",
  "n_eff", "report_group", "near_aligned", "sector", "industry", "theme",
  "mentions", "accounts", "top_accounts", "setup_label", "next_earnings_date",
];

const cols = allCols.filter((c) => tableColSet.has(c));

const colList = cols.join(",");
const paramList = cols.map((c) => `@${c}`).join(",");
const updateList = cols.map((c) => `${c}=excluded.${c}`).join(",");

const stmt = db.prepare(
  `INSERT INTO signals (date,ticker,${colList}) VALUES (@date,@ticker,${paramList})
   ON CONFLICT(date,ticker) DO UPDATE SET ${updateList}`
);

const tx = db.transaction((rows: SignalRecord[]) => rows.forEach((r) => stmt.run(r)));

let totalRows = 0;
let totalRejects = 0;
let daysWithRows = 0;

for (const [date, filename] of Array.from(latest)) {
  const content = fs.readFileSync(path.join(BRIDGE_DIR, filename), "utf-8");
  const parsed = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    transform: (v: string) => (v === "True" ? true : v === "False" ? false : v),
  });

  const rows: SignalRecord[] = [];
  let rejects = 0;
  for (const row of parsed.data) {
    const signal = rowToSignal(row, date);
    if (signal) {
      rows.push(signal);
    } else {
      rejects++;
    }
  }

  tx(rows);
  totalRows += rows.length;
  totalRejects += rejects;
  if (rows.length > 0) daysWithRows++;
}

console.log(`ingested ${daysWithRows} days, ${totalRows} rows, ${totalRejects} rejected`);
