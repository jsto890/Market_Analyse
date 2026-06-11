import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import {
  AccountStat,
  AccountsData,
  AccountTier,
  TIER_ORDER,
} from "@/types/accounts";

const CSV_PATH = path.join(
  "/Users/josephstorey/Market_Review/reports/account_backtest.csv"
);

function parseNullableFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return isNaN(n) ? null : n;
}

export async function GET(): Promise<NextResponse> {
  const raw = fs.readFileSync(CSV_PATH, "utf-8");

  const { data } = Papa.parse<Record<string, unknown>>(raw, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  const accounts: AccountStat[] = data.map((row) => {
    const topTickersRaw =
      typeof row.top_tickers === "string" ? row.top_tickers : "";
    const top_tickers = topTickersRaw
      .split(";")
      .map((t) => t.trim())
      .filter(Boolean);

    return {
      account: String(row.account ?? ""),
      account_tier: row.account_tier as AccountTier,
      signal_count: Number(row.signal_count ?? 0),
      actionable_count: Number(row.actionable_count ?? 0),
      complete_1d_count: Number(row.complete_1d_count ?? 0),
      complete_5d_count: Number(row.complete_5d_count ?? 0),
      hit_rate_1d: parseNullableFloat(row.hit_rate_1d),
      hit_rate_5d: parseNullableFloat(row.hit_rate_5d),
      avg_ret_1d: parseNullableFloat(row.avg_ret_1d),
      avg_excess_ret_1d: parseNullableFloat(row.avg_excess_ret_1d),
      trust_score: Number(row.trust_score ?? 0),
      trust_label: String(row.trust_label ?? ""),
      evidence_status: String(row.evidence_status ?? ""),
      top_tickers,
    };
  });

  accounts.sort((a, b) => b.trust_score - a.trust_score);

  const by_tier = Object.fromEntries(
    TIER_ORDER.map((tier) => [
      tier,
      accounts
        .filter((a) => a.account_tier === tier)
        .sort((a, b) => b.trust_score - a.trust_score),
    ])
  ) as Record<AccountTier, AccountStat[]>;

  const payload: AccountsData = { accounts, by_tier };

  return NextResponse.json(payload);
}
