"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ActionCardData } from "@/types/argus";
import VoteMatrix from "@/components/VoteMatrix";
import FamilyRings from "@/components/FamilyRings";
import AgreeDissentList from "@/components/AgreeDissentList";

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<ActionCardData>);

const VERDICT_BG: Record<ActionCardData["verdict"], string> = {
  LONG: "bg-green-600",
  SHORT: "bg-red-600",
  WAIT: "bg-amber-500",
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.abs(score) * 50;
  const isPositive = score > 0;
  const isZero = score === 0;

  return (
    <div className="w-full h-2 bg-gray-800 rounded relative">
      <div
        className="absolute top-0 h-2 rounded"
        style={{
          left: isPositive ? "50%" : `${50 - pct}%`,
          width: `${pct}%`,
          backgroundColor: isZero ? "#6b7280" : isPositive ? "#22c55e" : "#ef4444",
        }}
      />
      <div className="absolute top-0 left-1/2 w-px h-2 bg-gray-600" />
    </div>
  );
}

function fmt(n: number | null, digits = 2) {
  if (n === null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}`;
}

export default function ActionCardPage({
  params,
}: {
  params: { ticker: string };
}) {
  const { ticker } = params;
  const router = useRouter();
  const { data, error, isLoading } = useSWR<ActionCardData>(
    `/api/argus/action_card/${ticker}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <p className="text-gray-400 font-mono animate-pulse text-sm">
          Running agents…
        </p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center gap-3 px-4">
        <p className="text-red-400 font-mono text-sm">
          Argus API offline — is the API running?
        </p>
        <p className="text-gray-500 font-mono text-xs">
          Start with: <code className="text-gray-300">python argus/api.py</code>
        </p>
      </main>
    );
  }

  const {
    symbol,
    verdict,
    score,
    high_conviction,
    entry,
    stop,
    target,
    risk_reward,
    long_votes,
    short_votes,
    wait_votes,
    agreement_pct,
    ret_1d,
    ret_5d,
    ret_20d,
    is_extended,
    votes,
    agreed,
    dissented,
    notes,
  } = data;

  function handlePinWatchlist() {
    const raw = localStorage.getItem("argus_watchlist");
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    if (!list.some((e) => (typeof e === "string" ? e === ticker : (e as { ticker: string }).ticker === ticker))) {
      list.push({ ticker, pinned_at: new Date().toISOString() });
      localStorage.setItem("argus_watchlist", JSON.stringify(list));
    }
  }

  return (
    <main className="min-h-screen bg-[#0d1117] text-gray-100 px-4 py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link
          href="/"
          className="text-sm font-mono text-gray-400 hover:text-gray-200 transition-colors"
        >
          ← Signals
        </Link>
        <span className="text-xl font-mono font-bold tracking-wide">
          {symbol}
        </span>
        <span
          className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${VERDICT_BG[verdict]}`}
        >
          {verdict}
        </span>
        {high_conviction && (
          <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-yellow-500 text-black">
            ⚡ HC
          </span>
        )}
      </div>

      {/* Score bar */}
      <div className="mb-4">
        <ScoreBar score={score} />
        <div className="flex gap-4 mt-2 text-xs font-mono text-gray-400">
          <span>
            L:<span className="text-green-400">{long_votes}</span>
          </span>
          <span>
            S:<span className="text-red-400">{short_votes}</span>
          </span>
          <span>
            W:<span className="text-gray-500">{wait_votes}</span>
          </span>
          <span className="ml-auto">
            Agreement:{" "}
            <span className="text-gray-200">{agreement_pct.toFixed(0)}%</span>
          </span>
        </div>
      </div>

      {/* Trade levels */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex gap-4 text-sm font-mono">
          <span>
            E <span className="text-gray-100">{entry.toFixed(2)}</span>
          </span>
          <span>
            S <span className="text-red-400">{stop.toFixed(2)}</span>
          </span>
          <span>
            T <span className="text-green-400">{target.toFixed(2)}</span>
          </span>
          <span>
            R{" "}
            <span className="text-gray-100">{risk_reward.toFixed(1)}x</span>
          </span>
        </div>
        {is_extended && (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-orange-700 text-orange-100">
            EXTENDED
          </span>
        )}
      </div>

      {/* Momentum */}
      <div className="text-xs font-mono text-gray-400 mb-4">
        Momentum: 1d{" "}
        <span
          className={
            ret_1d !== null && ret_1d >= 0 ? "text-green-400" : "text-red-400"
          }
        >
          {fmt(ret_1d)}%
        </span>{" "}
        5d{" "}
        <span
          className={
            ret_5d !== null && ret_5d >= 0 ? "text-green-400" : "text-red-400"
          }
        >
          {fmt(ret_5d)}%
        </span>{" "}
        20d{" "}
        <span
          className={
            ret_20d !== null && ret_20d >= 0
              ? "text-green-400"
              : "text-red-400"
          }
        >
          {fmt(ret_20d)}%
        </span>
      </div>

      {/* Notes */}
      {notes && notes.trim().length > 0 && (
        <div className="mb-6 p-3 rounded bg-[#161b22] border border-[#30363d] text-xs font-mono text-gray-300 whitespace-pre-wrap">
          {notes}
        </div>
      )}

      {/* Vote Matrix */}
      <section className="mb-6">
        <div className="text-[10px] font-mono text-gray-500 mb-2 flex items-center gap-2">
          <span className="flex-1 border-t border-[#30363d]" />
          Vote Matrix
          <span className="flex-1 border-t border-[#30363d]" />
        </div>
        <VoteMatrix votes={votes} />
      </section>

      {/* Family Conviction */}
      <section className="mb-6">
        <div className="text-[10px] font-mono text-gray-500 mb-2 flex items-center gap-2">
          <span className="flex-1 border-t border-[#30363d]" />
          Family Conviction
          <span className="flex-1 border-t border-[#30363d]" />
        </div>
        <FamilyRings votes={votes} verdict={verdict} />
      </section>

      {/* Agent Detail */}
      <section className="mb-6">
        <div className="text-[10px] font-mono text-gray-500 mb-2 flex items-center gap-2">
          <span className="flex-1 border-t border-[#30363d]" />
          Agent Detail
          <span className="flex-1 border-t border-[#30363d]" />
        </div>
        <AgreeDissentList agreed={agreed} dissented={dissented} votes={votes} />
      </section>

      {/* Watchlist */}
      <section>
        <div className="text-[10px] font-mono text-gray-500 mb-2 flex items-center gap-2">
          <span className="flex-1 border-t border-[#30363d]" />
          Watchlist
          <span className="flex-1 border-t border-[#30363d]" />
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handlePinWatchlist}
            className="px-4 py-2 rounded text-sm font-mono text-gray-300 bg-[#161b22] border border-[#30363d] hover:border-gray-500 transition-colors"
          >
            Pin to Watchlist
          </button>
        </div>
      </section>
    </main>
  );
}
