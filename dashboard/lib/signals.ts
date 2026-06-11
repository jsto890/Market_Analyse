import { getDb } from "@/lib/db";

export const signalHistory = (t: string) =>
  getDb()
    .prepare(
      `SELECT date, report_group, action_label, combined_score, entry
         FROM signals WHERE ticker=? ORDER BY date ASC`
    )
    .all(t.toUpperCase());

export const reportDates = () =>
  getDb()
    .prepare(`SELECT DISTINCT date FROM signals ORDER BY date DESC`)
    .all();

export const byDate = (d: string) =>
  getDb()
    .prepare(`SELECT * FROM signals WHERE date=? ORDER BY combined_score DESC`)
    .all(d);

export const recentFirstFlags = (days: number) =>
  getDb()
    .prepare(
      `WITH agg AS (
         SELECT ticker, MIN(date) AS first_date, MAX(date) AS last_date
           FROM signals
          WHERE report_group IN ('aligned','pullback','tech_fund')
          GROUP BY ticker
         HAVING first_date >= date('now', ?)
       )
       SELECT a.ticker, a.first_date,
              f.report_group AS first_group,
              f.entry AS entry_at_flag,
              a.last_date
         FROM agg a
         JOIN signals f ON f.ticker=a.ticker AND f.date=a.first_date
            AND f.report_group IN ('aligned','pullback','tech_fund')
            AND f.rowid = (
              SELECT MIN(rowid) FROM signals
               WHERE ticker=a.ticker AND date=a.first_date
                 AND report_group IN ('aligned','pullback','tech_fund')
            )
        ORDER BY a.first_date DESC`
    )
    .all(`-${days} days`);
