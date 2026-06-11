import { describe, it, expect } from "vitest";
import { openDb, NEW_COLS } from "@/lib/db";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

it("creates schema with new columns and watchlist table", () => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "db-")), "t.db");
  const db = openDb(p);
  const cols = db.prepare("PRAGMA table_info(signals)").all().map((r) => (r as { name: string }).name);
  for (const c of ["report_group", "action_label", "n_eff", "next_earnings_date"])
    expect(cols).toContain(c);
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name='watchlist'").get()).toBeTruthy();
  db.close();
});

it("migrates a baseline db by adding all 16 new columns and watchlist table", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "db-migrate-"));
  const p = path.join(dir, "migrate.db");

  // Create baseline db with the pre-migration schema (no new columns, no watchlist)
  const seed = new Database(p);
  seed.exec(`
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
  seed.close();

  // openDb should run the additive migration
  const db = openDb(p);

  const cols = db.prepare("PRAGMA table_info(signals)").all().map((r) => (r as { name: string }).name);
  for (const c of Object.keys(NEW_COLS))
    expect(cols).toContain(c);

  expect(db.prepare("SELECT name FROM sqlite_master WHERE name='watchlist'").get()).toBeTruthy();
  db.close();
});
