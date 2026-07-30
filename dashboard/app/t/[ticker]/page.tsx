import { type Bar, type Marker } from "@/components/charts/CandleChart";
import Panel from "@/components/ui/Panel";
import ChartInfoStrip from "@/components/ticker/ChartInfoStrip";
import Header from "@/components/ticker/Header";
import LevelsCard from "@/components/ticker/LevelsCard";
import TickerChartSection from "@/components/ticker/TickerChartSection";
import WhyPanel from "@/components/ticker/WhyPanel";
import CatalystsCard from "@/components/ticker/CatalystsCard";
import SentimentCard from "@/components/ticker/SentimentCard";
import HistoryCard from "@/components/ticker/HistoryCard";
import OptionsPanel from "@/components/ticker/OptionsPanel";
import GexCard from "@/components/ticker/GexCard";
import AiPanel from "@/components/ticker/AiPanel";
import CatalystStrip from "@/components/ticker/CatalystStrip";
import NewsCard from "@/components/ticker/NewsCard";
import TickerSubNav from "@/components/ticker/TickerSubNav";
import TickerNav from "@/components/ticker/TickerNav";
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

  // Chart markers from signal history — no text labels to avoid glyph spam
  const markers: Marker[] = history.map((row) => ({
    date: row.date,
    label: "",
  }));

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-4 space-y-4">
      <TickerNav ticker={ticker} />
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
        <CatalystStrip ticker={ticker} />
      </section>

      <TickerSubNav />

      {/* Two-column layout */}
      <div className="grid grid-cols-[62fr_38fr] gap-4 max-[1100px]:grid-cols-1">
        {/* Left: chart + options */}
        <div className="space-y-4 max-[1100px]:order-2">
          <div className="min-h-[420px] 2xl:min-h-[560px]">
            <Panel title="Chart">
              <TickerChartSection
                ticker={ticker}
                bridgeRow={bridgeRow}
                initialBars={bars}
                markers={markers}
                height={420}
                className="min-h-[420px] 2xl:min-h-[560px]"
              />
              <ChartInfoStrip ticker={ticker} bars={bars} />
            </Panel>
          </div>
          <OptionsPanel ticker={ticker} />
          {["SPY", "QQQ", "IWM", "DIA"].includes(ticker.toUpperCase()) && (
            <GexCard ticker={ticker} />
          )}
        </div>

        {/* Right: Levels → Why → Catalysts → Sentiment → History → AI */}
        <div className="space-y-4 max-[1100px]:order-1">
          <div id="levels" className="scroll-mt-[calc(var(--nav-h)+44px)]">
            {bridgeRow && <LevelsCard ticker={ticker} bridgeRow={bridgeRow} />}
          </div>
          <div id="why" className="scroll-mt-[calc(var(--nav-h)+44px)]">
            <WhyPanel ticker={ticker} />
          </div>
          <div id="catalysts" className="scroll-mt-[calc(var(--nav-h)+44px)]">
            <CatalystsCard ticker={ticker} bridgeRow={bridgeRow} />
          </div>
          <div id="news" className="scroll-mt-[calc(var(--nav-h)+44px)]">
            <NewsCard ticker={ticker} />
          </div>
          <div id="sentiment" className="scroll-mt-[calc(var(--nav-h)+44px)]">
            <SentimentCard bridgeRow={bridgeRow} lastSeen={lastSeen} />
          </div>
          <div id="history" className="scroll-mt-[calc(var(--nav-h)+44px)]">
            <HistoryCard rows={history} lastClose={lastClose} />
          </div>
          <div id="ai" className="scroll-mt-[calc(var(--nav-h)+44px)]">
            <AiPanel ticker={ticker} />
          </div>
        </div>
      </div>
    </main>
  );
}
