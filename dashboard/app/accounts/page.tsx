"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import type { AccountsData, AccountStat, WatchlistEntry } from "@/types/accounts";
import { TIER_ORDER, TIER_LABEL } from "@/types/accounts";
import type { BridgeRow } from "@/types/bridge";
import { ALIGNMENT_COLOR } from "@/types/bridge";

const WATCHLIST_KEY = "argus_watchlist";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ── colour helpers ──────────────────────────────────────────────────────────

function hitRateColor(v: number | null): string {
  if (v === null) return "text-gray-500";
  if (v >= 0.65) return "text-green-400";
  if (v >= 0.45) return "text-amber-400";
  return "text-red-400";
}

function retColor(v: number | null): string {
  if (v === null) return "text-gray-500";
  return v >= 0 ? "text-green-400" : "text-red-400";
}

function nColor(n: number): string {
  return n < 10 ? "text-amber-400" : "text-gray-400";
}

function fmtPct(v: number | null, decimals = 1): string {
  if (v === null) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(decimals)}%`;
}

// ── Account Trust table ─────────────────────────────────────────────────────

function TierTable({ accounts }: { accounts: AccountStat[] }) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-left text-xs text-gray-500 border-b border-[#30363d]">
          <th className="pb-1 pr-3 font-medium">Account</th>
          <th className="pb-1 pr-3 font-medium text-right">N (1d)</th>
          <th className="pb-1 pr-3 font-medium text-right">Hit Rate 1d</th>
          <th className="pb-1 pr-3 font-medium text-right">Avg Ret 1d</th>
          <th className="pb-1 pr-3 font-medium text-right">Excess Ret</th>
          <th className="pb-1 pr-3 font-medium text-right">Trust</th>
          <th className="pb-1 font-medium">Top Tickers</th>
        </tr>
      </thead>
      <tbody>
        {accounts.map((a, i) => {
          const handle = a.account.replace("@", "");
          const rowBg = i % 2 === 0 ? "" : "bg-white/[0.02]";
          return (
            <tr
              key={a.account}
              className={`${rowBg} hover:bg-gray-800/30 transition-colors`}
            >
              <td className="py-1.5 pr-3">
                <a
                  href={`https://x.com/${handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  {a.account}
                </a>
              </td>
              <td className={`py-1.5 pr-3 text-right tabular-nums ${nColor(a.complete_1d_count)}`}>
                {a.complete_1d_count}
              </td>
              <td className={`py-1.5 pr-3 text-right tabular-nums ${hitRateColor(a.hit_rate_1d)}`}>
                {a.hit_rate_1d === null ? "—" : `${(a.hit_rate_1d * 100).toFixed(1)}%`}
              </td>
              <td className={`py-1.5 pr-3 text-right tabular-nums ${retColor(a.avg_ret_1d)}`}>
                {fmtPct(a.avg_ret_1d)}
              </td>
              <td className={`py-1.5 pr-3 text-right tabular-nums ${retColor(a.avg_excess_ret_1d)}`}>
                {fmtPct(a.avg_excess_ret_1d)}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-white">
                {a.trust_score.toFixed(1)}
              </td>
              <td className="py-1.5">
                {a.top_tickers.slice(0, 5).map((t) => (
                  <span
                    key={t}
                    className="inline-block px-1 py-0.5 bg-gray-800 text-gray-400 text-xs rounded mr-0.5"
                  >
                    {t}
                  </span>
                ))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Watchlist card ──────────────────────────────────────────────────────────

function WatchlistCard({
  entry,
  signal,
  onUnpin,
}: {
  entry: WatchlistEntry;
  signal: BridgeRow | undefined;
  onUnpin: (ticker: string) => void;
}) {
  const gutterColor = signal
    ? ALIGNMENT_COLOR[signal.alignment] ?? "#30363d"
    : "#30363d";

  return (
    <div
      className="bg-[#161b22] border border-[#30363d] rounded p-3 relative"
      style={{ borderLeft: `4px solid ${gutterColor}` }}
    >
      {/* header row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white text-sm">{entry.ticker}</span>
        </div>
        <button
          onClick={() => onUnpin(entry.ticker)}
          className="text-gray-600 hover:text-gray-400 text-xs leading-none"
          aria-label={`Unpin ${entry.ticker}`}
        >
          Unpin ×
        </button>
      </div>

      {signal ? (
        <>
          <div className="text-xs text-gray-400 mb-1">
            <span className="text-gray-300">{signal.setup_label}</span>
            {"  ·  "}
            <span>Score: {signal.combined_score.toFixed(3)}</span>
          </div>
          <div className="text-xs text-gray-500 tabular-nums mb-1">
            E {signal.entry.toFixed(2)}{"  "}
            S {signal.stop.toFixed(2)}{"  "}
            T {signal.target.toFixed(2)}
          </div>
        </>
      ) : (
        <div className="text-xs text-gray-600">No signal today</div>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const { data: accountsData, isLoading: accountsLoading } =
    useSWR<AccountsData>("/api/accounts", fetcher);

  const { data: signalsData } =
    useSWR<{ signals: BridgeRow[] }>("/api/watchlist-signals", fetcher);

  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [tickerInput, setTickerInput] = useState("");

  // SSR-safe localStorage load
  useEffect(() => {
    try {
      const stored = localStorage.getItem(WATCHLIST_KEY);
      if (stored) {
        const entries = (JSON.parse(stored) as unknown[]).map((e) =>
          typeof e === "string" ? { ticker: e, pinned_at: "" } : (e as WatchlistEntry)
        );
        setWatchlist(entries);
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  function persist(next: WatchlistEntry[]) {
    setWatchlist(next);
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }

  function handlePin() {
    const ticker = tickerInput.toUpperCase().trim();
    if (!ticker) return;
    if (watchlist.some((e) => e.ticker === ticker)) {
      setTickerInput("");
      return;
    }
    persist([...watchlist, { ticker, pinned_at: new Date().toISOString() }]);
    setTickerInput("");
  }

  function handleUnpin(ticker: string) {
    persist(watchlist.filter((e) => e.ticker !== ticker));
  }

  const signalMap = new Map<string, BridgeRow>(
    (signalsData?.signals ?? []).map((s) => [s.ticker, s])
  );

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-10">
      {/* ── Watchlist ── */}
      <section>
        <h2 className="text-base font-semibold text-white mb-3">Watchlist</h2>

        {/* Add ticker */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handlePin();
            }}
            placeholder="Add ticker…"
            className="bg-[#161b22] border border-[#30363d] rounded px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 w-40"
          />
          <button
            onClick={handlePin}
            className="bg-[#21262d] hover:bg-[#30363d] text-gray-300 text-sm px-3 py-1.5 rounded border border-[#30363d] transition-colors"
          >
            Pin
          </button>
        </div>

        {watchlist.length === 0 ? (
          <p className="text-sm text-gray-600">
            Pin tickers from the signal list to track them here.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {watchlist.map((entry) => (
              <WatchlistCard
                key={entry.ticker}
                entry={entry}
                signal={signalMap.get(entry.ticker)}
                onUnpin={handleUnpin}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Account Trust ── */}
      <section>
        <h2 className="text-base font-semibold text-white mb-3">Account Trust</h2>

        {accountsLoading && (
          <p className="text-sm text-gray-600">Loading…</p>
        )}

        {accountsData &&
          TIER_ORDER.map((tier) => {
            const rows = accountsData.by_tier[tier];
            if (!rows || rows.length === 0) return null;
            return (
              <div key={tier}>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-6 mb-2 pb-1 border-b border-[#30363d]">
                  {TIER_LABEL[tier]}
                </div>
                <TierTable accounts={rows} />
              </div>
            );
          })}
      </section>
    </main>
  );
}
