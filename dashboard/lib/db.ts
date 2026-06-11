import Database from "better-sqlite3";
import path from "path";

declare global { var __argusDb: Database.Database | undefined }

export const NEW_COLS: Record<string, string> = {
  ret_126d: "REAL", ret_252d: "REAL",
  conviction: "TEXT", action_label: "TEXT", trade_style: "TEXT", combo: "TEXT",
  ticker_regime: "TEXT", n_eff: "REAL", report_group: "TEXT", near_aligned: "INTEGER",
  sector: "TEXT", industry: "TEXT", theme: "TEXT", mentions: "INTEGER",
  accounts: "INTEGER", top_accounts: "TEXT", setup_label: "TEXT", next_earnings_date: "TEXT",
};

export function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY,
      date TEXT, ticker TEXT, alignment TEXT, argus_verdict TEXT,
      combined_score REAL, tech_score REAL, sentiment_score REAL,
      quality_score REAL, agreement_pct REAL, high_conviction INTEGER,
      entry REAL, stop REAL, target REAL, risk_reward REAL,
      entry_quality TEXT, stop_anchor TEXT,
      catalysts TEXT, ret_1d REAL, ret_5d REAL, ret_20d REAL,
      ret_126d REAL, ret_252d REAL,
      UNIQUE(date, ticker)
    );
    CREATE TABLE IF NOT EXISTS watchlist (
      ticker TEXT PRIMARY KEY, pinned_at TEXT NOT NULL, price_at_pin REAL
    );
  `);
  const existing = new Set(
    db.prepare("PRAGMA table_info(signals)").all().map((r) => (r as { name: string }).name)
  );
  for (const [c, t] of Object.entries(NEW_COLS))
    if (!existing.has(c)) db.exec(`ALTER TABLE signals ADD COLUMN ${c} ${t}`);
  return db;
}

export function getDb(): Database.Database {
  if (globalThis.__argusDb) return globalThis.__argusDb;
  const p = process.env.ARGUS_DB ?? path.join(process.cwd(), "..", "argus.db");
  globalThis.__argusDb = openDb(p);
  return globalThis.__argusDb;
}
