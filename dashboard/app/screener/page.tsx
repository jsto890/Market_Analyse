"use client";
import Loading from "@/components/ui/Loading";

import { useRef, useState } from "react";
import Link from "next/link";
import { Search, ArrowRight, Loader2, Filter, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ScreenerResult } from "@/types/argus";
import DataTable, { Column } from "@/components/ui/DataTable";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import PinToggle from "@/components/ui/PinToggle";
import ActionBar from "@/components/ui/ActionBar";
import Gloss from "@/components/ui/Gloss";
import Empty from "@/components/ui/Empty";
import Failed from "@/components/ui/Failed";
import Stale from "@/components/ui/Stale";
import VoteBar from "@/components/ui/VoteBar";
import { pctWhole, pct } from "@/lib/format";
import { STATIC_KEYS } from "@/lib/storageKeys";
import Page from "@/components/ui/Page";

type ApiResponse =
  | { results: ScreenerResult[]; as_of?: string; cached?: boolean }
  | { error: string };

function isErrorResponse(r: ApiResponse): r is { error: string } {
  return "error" in r;
}

/** A named ticker list plus the cutoff you read it at. */
interface SavedScreen {
  name: string;
  tickers: string;
  minScore: number;
}

function loadScreens(): SavedScreen[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STATIC_KEYS.screenerSavedScreens);
    return raw ? (JSON.parse(raw) as SavedScreen[]) : [];
  } catch {
    return [];
  }
}

/**
 * The top of the list, in full. A card can carry the vote split, the agreement
 * and the returns at a size you can read without tracking across a row — and
 * the five names you are actually going to act on are worth that space.
 */
function ResultCard({ r }: { r: ScreenerResult }) {
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <Link href={`/t/${r.symbol}`} className="text-data text-title font-medium text-accent hover:underline">
          {r.symbol}
        </Link>
        <Badge variant="verdict" value={r.verdict} />
        {r.high_conviction && <span className="text-micro font-bold text-model">HC</span>}
      </div>

      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-data text-title text-model">{r.score.toFixed(3)}</span>
        <span className="text-body text-muted">
          score · {pctWhole(r.agreement_pct, "percent")} agree
        </span>
      </div>

      <div className="mt-2">
        <VoteBar long={r.long_votes} short={r.short_votes} wait={r.wait_votes} className="w-full" />
        <p className="mt-1 text-micro text-muted">
          {r.long_votes}L · {r.short_votes}S · {r.wait_votes}W
        </p>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-x-3 border-t border-line pt-2 text-body">
        <div className="flex items-baseline gap-1.5">
          <span className="eyebrow">R:R</span>
          <span className="text-data text-foreground">{r.risk_reward.toFixed(1)}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="eyebrow">1d</span>
          <span className={`text-data ${r.ret_1d === null ? "text-muted" : r.ret_1d >= 0 ? "text-pos" : "text-neg"}`}>
            {pct(r.ret_1d, "fraction")}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="eyebrow">5d</span>
          <span className={`text-data ${r.ret_5d === null ? "text-muted" : r.ret_5d >= 0 ? "text-pos" : "text-neg"}`}>
            {pct(r.ret_5d, "fraction")}
          </span>
        </div>
      </div>

      {/* No Compare: this page is the comparison. */}
      <ActionBar symbol={r.symbol} actions={["pin", "alert", "options", "copy"]} className="mt-2" />
    </div>
  );
}

export default function ScreenerPage() {
  const router = useRouter();
  // `?symbols=` seeds the box — the ticker page's Compare action arrives here
  // with the name you came from, ready for you to add its peers. Read off
  // `location` rather than `useSearchParams` so the page needs no Suspense
  // boundary, matching how this component already reads localStorage.
  const [tickerInput, setTickerInput] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("symbols") ?? "")
  );
  // The cutoff filters here, not at Argus: the run scores the whole universe
  // either way, so keeping every card client-side is what lets the slider say
  // how many names it is about to drop before you let go of it.
  const [minScore, setMinScore] = useState(0.3);
  const [screens, setScreens] = useState<SavedScreen[]>(loadScreens);
  const [naming, setNaming] = useState(false);
  const [screenName, setScreenName] = useState("");
  const [results, setResults] = useState<ScreenerResult[] | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STATIC_KEYS.screenerLastResult);
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { results: ScreenerResult[] }).results ?? null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STATIC_KEYS.screenerLastResult);
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { as_of: string | null }).as_of ?? null;
    } catch {
      return null;
    }
  });
  const [cached, setCached] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const columns: Column<ScreenerResult>[] = [
    {
      key: "symbol",
      header: "Ticker",
      render: (r) => (
        <span className="text-data font-semibold text-foreground">{r.symbol}</span>
      ),
    },
    {
      key: "verdict",
      header: "Verdict",
      render: (r) => <Badge variant="verdict" value={r.verdict} />,
    },
    {
      key: "score",
      header: "Score",
      align: "right",
      sortable: true,
      sortFn: (a, b) => a.score - b.score,
      render: (r) => <span className="text-data text-model">{r.score.toFixed(3)}</span>,
    },
    {
      key: "votes",
      header: <Gloss term="Votes" />,
      width: "76px",
      sortable: true,
      sortFn: (a, b) => a.long_votes - b.long_votes,
      render: (r) => (
        <VoteBar long={r.long_votes} short={r.short_votes} wait={r.wait_votes} className="w-14" />
      ),
    },
    {
      key: "agreement_pct",
      header: <Gloss term="Agree%" />,
      align: "right",
      sortable: true,
      sortFn: (a, b) => a.agreement_pct - b.agreement_pct,
      render: (r) => <span className="text-data text-model">{pctWhole(r.agreement_pct, "percent")}</span>,
    },
    {
      key: "high_conviction",
      header: <Gloss term="HC" />,
      align: "center",
      render: (r) =>
        r.high_conviction ? (
          <span className="text-body font-bold text-model">HC</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "risk_reward",
      header: <Gloss term="R:R" />,
      align: "right",
      sortable: true,
      sortFn: (a, b) => a.risk_reward - b.risk_reward,
      render: (r) => <span className="text-data text-foreground">{r.risk_reward.toFixed(1)}</span>,
    },
    {
      key: "ret_1d",
      header: "1d%",
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.ret_1d ?? -Infinity) - (b.ret_1d ?? -Infinity),
      render: (r) => (
        <span className={`text-data ${r.ret_1d === null ? "text-muted" : r.ret_1d >= 0 ? "text-pos" : "text-neg"}`}>
          {pct(r.ret_1d, "fraction")}
        </span>
      ),
    },
    {
      key: "ret_5d",
      header: "5d%",
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.ret_5d ?? -Infinity) - (b.ret_5d ?? -Infinity),
      render: (r) => (
        <span className={`text-data ${r.ret_5d === null ? "text-muted" : r.ret_5d >= 0 ? "text-pos" : "text-neg"}`}>
          {pct(r.ret_5d, "fraction")}
        </span>
      ),
    },
    {
      key: "pin",
      header: "",
      render: (r) => <PinToggle symbol={r.symbol} variant="chip" />,
    },
  ];

  async function runScreener(tickers: string[] | null, refresh = false) {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let res: Response;
      if (tickers === null) {
        const params = new URLSearchParams();
        params.set("min_conviction", "0");
        if (refresh) params.set("refresh", "1");
        res = await fetch(`/api/argus/screener?${params.toString()}`, { signal: controller.signal });
      } else {
        res = await fetch("/api/argus/screener", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ universe: tickers, min_conviction: 0 }),
          signal: controller.signal,
        });
      }
      const data = (await res.json()) as ApiResponse;
      if (isErrorResponse(data)) {
        setError(data.error);
        setResults(null);
      } else {
        setResults(data.results);
        setAsOf(data.as_of ?? null);
        setCached(data.cached ?? false);
        window.localStorage.setItem(
          STATIC_KEYS.screenerLastResult,
          JSON.stringify({ results: data.results, as_of: data.as_of ?? null, cached: data.cached ?? false })
        );
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : "Network error");
        setResults(null);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  function handleRun() {
    const tickers = tickerInput
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    void runScreener(tickers.length > 0 ? tickers : null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleRun();
  }

  function persistScreens(next: SavedScreen[]) {
    setScreens(next);
    window.localStorage.setItem(STATIC_KEYS.screenerSavedScreens, JSON.stringify(next));
  }

  function saveScreen() {
    const name = screenName.trim();
    if (!name) return;
    // Same name overwrites — a screen you re-save is the same screen.
    persistScreens([
      ...screens.filter((s) => s.name !== name),
      { name, tickers: tickerInput, minScore },
    ]);
    setScreenName("");
    setNaming(false);
  }

  function applyScreen(s: SavedScreen) {
    setTickerInput(s.tickers);
    setMinScore(s.minScore);
    const tickers = s.tickers
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    void runScreener(tickers.length > 0 ? tickers : null);
  }

  const shown = results === null ? null : results.filter((r) => Math.abs(r.score) >= minScore);
  const lead = shown?.slice(0, 5) ?? [];
  const rest = shown?.slice(5) ?? [];

  return (
    <Page width="wide">
        <Page.Header title="Screener" subtitle="Agent-ranked long candidates" />

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-elevated px-3 py-2.5">
          <Input
            type="text"
            icon={<Search size={14} />}
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Filter tickers — AAPL, TSLA, NVDA…"
            className="w-64"
          />
          <label className="flex items-center gap-1.5 text-body text-muted">
            Min score
            <input
              type="range"
              aria-label="Min score"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              step="0.05"
              min="0"
              max="1"
              className="w-28"
              style={{ accentColor: "var(--accent)" }}
            />
            <span className="text-data text-model">{minScore.toFixed(2)}</span>
          </label>
          {/* The count the cutoff is about to produce, while you are still
              dragging it — the number was only ever discoverable by running. */}
          {results !== null && (
            <span className="text-body text-muted">
              {shown!.length} of {results.length} above {minScore.toFixed(2)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="primary"
              onClick={handleRun}
              disabled={loading}
              loading={loading}
              icon={<ArrowRight size={14} />}
            >
              Run
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setTickerInput("");
                void runScreener(null);
              }}
              disabled={loading}
            >
              Full universe
            </Button>
          </div>
        </div>

        {/* A screen is the ticker list and the cutoff together — re-typing both
            from memory was the only way to come back to one. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">Screens</span>
          {screens.map((s) => (
            <span
              key={s.name}
              className="inline-flex items-center rounded border border-line bg-surface text-body"
            >
              <button
                type="button"
                onClick={() => applyScreen(s)}
                className="px-2 py-0.5 text-foreground hover:text-accent"
              >
                {s.name}
              </button>
              <button
                type="button"
                aria-label={`Delete screen ${s.name}`}
                onClick={() => persistScreens(screens.filter((x) => x.name !== s.name))}
                className="border-l border-line px-1.5 py-1 text-muted hover:text-neg"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {naming ? (
            <Input
              type="text"
              autoFocus
              value={screenName}
              onChange={(e) => setScreenName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveScreen();
                if (e.key === "Escape") setNaming(false);
              }}
              onBlur={saveScreen}
              placeholder="Name this screen…"
              aria-label="Name this screen"
              className="w-40"
            />
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setNaming(true)}>
              Save screen
            </Button>
          )}
        </div>

        {/* States */}
        {loading && (
          <p className="flex items-center gap-1.5 text-body text-2">
            <Loader2 size={12} className="animate-spin" /> Running agent ensemble… (10–30s)
            <Button variant="ghost" size="sm" onClick={handleCancel}>Cancel</Button>
          </p>
        )}

        {error && (
          <Failed
            title="Screener didn’t run"
            message="Nothing was scored. Adjust the filters above and run again."
            detail={error}
          />
        )}

        {!loading && !error && results === null && (
          <div className="rounded-md border border-dashed border-line bg-elevated/40 px-6 py-8 text-center">
            <p className="text-title text-foreground">Rank long candidates with the agent ensemble</p>
            <p className="mx-auto mt-1.5 max-w-md text-body text-2">
              Enter tickers to score a shortlist, or run the full universe. Sort any column, click
              a row to open the ticker, and pin candidates to your watchlist.
            </p>
          </div>
        )}

        {loading && (
          <Loading
            variant="rows"
            headers={["Ticker", "Verdict", "Score", "Votes", "Agree%", "R:R", "1d%", "5d%"]}
            count={6}
          />
        )}

        {!loading && !error && results !== null && shown !== null && (
          <>
            {/* No count here — the cutoff control already says how many names
                it keeps, and saying it twice was the §3.2 duplication again. */}
            <div className="flex flex-wrap items-center gap-2 text-body text-muted">
              {asOf && <Stale asOf={asOf} source={cached ? "cached" : "fresh"} variant="line" />}
              {asOf && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void runScreener(null, true)}
                  className="ml-auto"
                >
                  Re-run (~30s)
                </Button>
              )}
            </div>
            {shown.length === 0 ? (
              <Empty
                fill
                icon={<Filter size={26} strokeWidth={1.5} />}
                title="No signals above threshold"
                message={
                  results.length === 0
                    ? "Nothing scored. Widen the universe, then re-run."
                    : `All ${results.length} scanned symbols scored below ${minScore.toFixed(2)}. Drag the cutoff down to see them.`
                }
              />
            ) : (
              <>
                {/* Top five in full, the tail in a table. The names you act on
                    and the names you scan are not the same reading job. */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {lead.map((r) => (
                    <ResultCard key={r.symbol} r={r} />
                  ))}
                </div>
                {rest.length > 0 && (
                  <div className="bg-surface border border-line rounded p-4">
                    <DataTable
                      columns={columns}
                      rows={rest}
                      rowKey={(r) => r.symbol}
                      persistKey="screener-table"
                      caption="Screener results ranked below the top five"
                      onOpen={(r) => router.push(`/t/${r.symbol}`)}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
    </Page>
  );
}
