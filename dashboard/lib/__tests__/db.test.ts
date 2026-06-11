import { describe, it, expect } from "vitest";
import { openDb } from "@/lib/db";
import fs from "fs";
import os from "os";
import path from "path";

it("creates schema with new columns and watchlist table", () => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "db-")), "t.db");
  const db = openDb(p);
  const cols = db.prepare("PRAGMA table_info(signals)").all().map((r: any) => r.name);
  for (const c of ["report_group", "action_label", "n_eff", "next_earnings_date"])
    expect(cols).toContain(c);
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name='watchlist'").get()).toBeTruthy();
});
