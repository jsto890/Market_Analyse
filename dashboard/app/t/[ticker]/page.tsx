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
import SectionRail from "@/components/ticker/SectionRail";
import TickerNav from "@/components/ticker/TickerNav";
import { range52w } from "@/lib/bar-stats";
import { loadBridgeSignals } from "@/lib/bridge";
import { signalHistory } from "@/lib/signals";
import { MEDIAN_PEAK_PCT, MEDIAN_DAYS_TO_PEAK } from "@/lib/perf-constants";
import Page from "@/components/ui/Page";

const INDEX_ETFS = ["SPY", "QQQ", "IWM", "DIA"];

type HistoryResult =
  | { status: "ok"; bars: Bar[] }
  | { status: "timeout" }
  | { status: "no-data" }
  | { status: "error" };

async function fetchHistory(ticker: string): Promise<HistoryResult> {
  try {
    const res = await fetch(
      `http://127.0.0.1:8088/api/history/${encodeURIComponent(ticker)}?period=2y`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return { status: "error" };
    const json = (await res.json()) as { bars: Bar[] };
    const bars = json.bars ?? [];
    return bars.length > 0 ? { status: "ok", bars } : { status: "no-data" };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") return { status: "timeout" };
    return { status: "error" };
  }
}

export default async function TickerPage({
  params,
}: {
  params: { ticker: string };
}) {
  const ticker = params.ticker.toUpperCase();

  // Run independent fetches in parallel
  const [historyResult, bridgeRow, history] = await Promise.all([
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

  const bars = historyResult.status === "ok" ? historyResult.bars : [];

  // Last close from history bars (same-basis as chart)
  const lastBar = bars.length > 0 ? bars[bars.length - 1] : null;
  const lastClose = lastBar?.close ?? null;
  const bars52w = range52w(bars);

  // Last-seen social signal date (max date in SQLite rows; null when none)
  const lastSeen =
    history.length > 0 ? history[history.length - 1].date : null;

  // Chart markers from signal history — no text labels to avoid glyph spam
  const markers: Marker[] = history.map((row) => ({
    date: row.date,
    label: "",
  }));

  return (
    <Page width="full">
      <TickerNav ticker={ticker} />
      {/* Header: server-rendered shell, client SWR for quote */}
      <section className="rounded-lg border border-line bg-surface">
        <Header
          ticker={ticker}
          bridgeRow={bridgeRow}
          signalHistory={history}
          lastClose={lastClose}
          dayHigh={lastBar?.high ?? null}
          dayLow={lastBar?.low ?? null}
          week52LowBars={bars52w?.lo ?? null}
          week52HighBars={bars52w?.hi ?? null}
          medianPeakPct={MEDIAN_PEAK_PCT}
          medianDaysToPeak={MEDIAN_DAYS_TO_PEAK}
        />
        <CatalystStrip ticker={ticker} />
      </section>

      {/* The rail indexes both columns, so it sits beside the grid rather than
          above one of them. */}
      <div className="flex gap-3">
        <SectionRail hasGamma={INDEX_ETFS.includes(ticker)} />

        {/* Two-column layout. No `order` overrides: below 1100px the columns stack
            in document order, so reading order, tab order and the rail agree (TN-03). */}
        <div className="grid min-w-0 flex-1 grid-cols-[62fr_38fr] gap-4 max-[1100px]:grid-cols-1">
        {/* Left: chart + options */}
        <div className="space-y-4">
          <div id="chart" className="min-h-[420px] scroll-mt-[calc(var(--nav-h)+12px)] 2xl:min-h-[560px]">
            <Panel title="Price & signals">
              <TickerChartSection
                ticker={ticker}
                bridgeRow={bridgeRow}
                initialBars={bars}
                initialStatus={historyResult.status}
                markers={markers}
                height={420}
                className="min-h-[420px] 2xl:min-h-[560px]"
              />
              <ChartInfoStrip ticker={ticker} bars={bars} />
            </Panel>
          </div>
          <div id="options" className="scroll-mt-[calc(var(--nav-h)+12px)]">
            <OptionsPanel ticker={ticker} />
          </div>
          {INDEX_ETFS.includes(ticker.toUpperCase()) && (
            <div id="gamma" className="scroll-mt-[calc(var(--nav-h)+12px)]">
              <GexCard ticker={ticker} />
            </div>
          )}
        </div>

        {/* Right: Levels → Why → Catalysts → Sentiment → History → AI */}
        <div className="space-y-4">
          <div id="levels" className="scroll-mt-[calc(var(--nav-h)+12px)]">
            {bridgeRow && <LevelsCard ticker={ticker} bridgeRow={bridgeRow} />}
          </div>
          <div id="why" className="scroll-mt-[calc(var(--nav-h)+12px)]">
            <WhyPanel ticker={ticker} />
          </div>
          <div id="catalysts" className="scroll-mt-[calc(var(--nav-h)+12px)]">
            <CatalystsCard ticker={ticker} bridgeRow={bridgeRow} />
          </div>
          <div id="news" className="scroll-mt-[calc(var(--nav-h)+12px)]">
            <NewsCard ticker={ticker} />
          </div>
          <div id="sentiment" className="scroll-mt-[calc(var(--nav-h)+12px)]">
            <SentimentCard bridgeRow={bridgeRow} lastSeen={lastSeen} />
          </div>
          <div id="history" className="scroll-mt-[calc(var(--nav-h)+12px)]">
            <HistoryCard rows={history} lastClose={lastClose} />
          </div>
          <div id="ai" className="scroll-mt-[calc(var(--nav-h)+12px)]">
            <AiPanel ticker={ticker} />
          </div>
        </div>
        </div>
      </div>
    </Page>
  );
}
