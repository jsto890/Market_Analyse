import CandleChart, { type Bar, type Level, type Marker } from "@/components/charts/CandleChart";
import Panel from "@/components/ui/Panel";
import Header from "@/components/ticker/Header";
import LevelsCard from "@/components/ticker/LevelsCard";
import WhyPanel from "@/components/ticker/WhyPanel";
import CatalystsCard from "@/components/ticker/CatalystsCard";
import SentimentCard from "@/components/ticker/SentimentCard";
import HistoryCard from "@/components/ticker/HistoryCard";
import OptionsPanel from "@/components/ticker/OptionsPanel";
import AiPanel from "@/components/ticker/AiPanel";
import { loadBridgeSignals } from "@/lib/bridge";
import { signalHistory } from "@/lib/signals";
import { MEDIAN_PEAK_PCT, MEDIAN_DAYS_TO_PEAK } from "@/lib/perf-constants";

async function fetchHistory(ticker: string): Promise<Bar[]> {
  try {
    const res = await fetch(
      `http://127.0.0.1:8088/api/history/${encodeURIComponent(ticker)}?period=2y`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { bars: Bar[] };
    return json.bars ?? [];
  } catch {
    return [];
  }
}

export default async function TickerPage({
  params,
}: {
  params: { ticker: string };
}) {
  const ticker = params.ticker.toUpperCase();

  // Run independent fetches in parallel
  const [bars, bridgeRow, history] = await Promise.all([
    fetchHistory(ticker),
    Promise.resolve((() => {
      try {
        const rows = loadBridgeSignals();
        return rows.find((r) => r.ticker.toUpperCase() === ticker) ?? null;
      } catch {
        return null;
      }
    })()),
    Promise.resolve((() => {
      try {
        return signalHistory(ticker) as {
          date: string;
          report_group: string | null;
          action_label: string | null;
          combined_score: number | null;
          entry: number | null;
        }[];
      } catch {
        return [];
      }
    })()),
  ]);

  // Last close from history bars (same-basis as chart)
  const lastClose = bars.length > 0 ? bars[bars.length - 1].close : null;

  // Last-seen social signal date (max date in SQLite rows; null when none)
  const lastSeen =
    history.length > 0 ? history[history.length - 1].date : null;

  // Chart levels from bridge row
  const levels: Level[] = (() => {
    if (!bridgeRow) return [];
    const l: Level[] = [];
    if (Number.isFinite(bridgeRow.entry) && bridgeRow.entry !== null) l.push({ price: bridgeRow.entry, kind: "entry" });
    if (Number.isFinite(bridgeRow.stop) && bridgeRow.stop !== null) l.push({ price: bridgeRow.stop, kind: "stop" });
    if (Number.isFinite(bridgeRow.target) && bridgeRow.target !== null) l.push({ price: bridgeRow.target, kind: "target" });
    return l;
  })();

  // Chart markers from signal history — no text labels to avoid glyph spam
  const markers: Marker[] = history.map((row) => ({
    date: row.date,
    label: "",
  }));

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-4 space-y-4">
      {/* Header: server-rendered shell, client SWR for quote */}
      <section className="rounded-lg border border-line bg-surface">
        <Header
          ticker={ticker}
          bridgeRow={bridgeRow}
          signalHistory={history}
          lastClose={lastClose}
          medianPeakPct={MEDIAN_PEAK_PCT}
          medianDaysToPeak={MEDIAN_DAYS_TO_PEAK}
        />
      </section>

      {/* Two-column layout */}
      <div className="grid grid-cols-[62fr_38fr] gap-4 max-[1100px]:grid-cols-1">
        {/* Left: chart + options */}
        <div className="space-y-4">
          <div className="min-h-[420px] 2xl:min-h-[560px]">
            <Panel title="Chart">
              <CandleChart
                ticker={ticker}
                initialBars={bars}
                initialPeriod="6M"
                levels={levels}
                markers={markers}
                height={420}
                className="min-h-[420px] 2xl:min-h-[560px]"
              />
            </Panel>
          </div>
          <OptionsPanel ticker={ticker} />
        </div>

        {/* Right: Levels → Why → Catalysts → Sentiment → History → AI */}
        <div className="space-y-4">
          {bridgeRow && <LevelsCard ticker={ticker} bridgeRow={bridgeRow} />}
          <WhyPanel ticker={ticker} />
          <CatalystsCard ticker={ticker} bridgeRow={bridgeRow} />
          <SentimentCard bridgeRow={bridgeRow} lastSeen={lastSeen} />
          <HistoryCard rows={history} lastClose={lastClose} />
          <AiPanel ticker={ticker} />
        </div>
      </div>
    </main>
  );
}
