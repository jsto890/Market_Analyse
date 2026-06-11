import Database from "better-sqlite3";
import path from "path";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = path.join(process.cwd(), "..", "argus.db");
  db = new Database(dbPath);

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
  `);

  return db;
}
