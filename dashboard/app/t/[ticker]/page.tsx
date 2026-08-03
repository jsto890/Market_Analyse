import { type Bar, type Marker } from "@/components/charts/CandleChart";
import ChartInfoStrip from "@/components/ticker/ChartInfoStrip";
import Header from "@/components/ticker/Header";
import TickerChartSection from "@/components/ticker/TickerChartSection";
import WhyPanel from "@/components/ticker/WhyPanel";
import CatalystsCard from "@/components/ticker/CatalystsCard";
import SentimentCard from "@/components/ticker/SentimentCard";
import HistoryCard from "@/components/ticker/HistoryCard";
import OptionsPanel from "@/components/ticker/OptionsPanel";
import GexCard from "@/components/ticker/GexCard";
import AiPanel from "@/components/ticker/AiPanel";
import NewsCard from "@/components/ticker/NewsCard";
import SectionRail from "@/components/ticker/SectionRail";
import TickerNav from "@/components/ticker/TickerNav";
import { fetchHistory } from "@/lib/history";
import { loadBridgeSignals } from "@/lib/bridge";
import { signalHistory } from "@/lib/signals";
import { MEDIAN_PEAK_PCT, MEDIAN_DAYS_TO_PEAK } from "@/lib/perf-constants";
import Page from "@/components/ui/Page";

const INDEX_ETFS = ["SPY", "QQQ", "IWM", "DIA"];

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
      {/* Header: server-rendered shell, client SWR for quote. It draws its own
          card — the three bands are one surface, so the page must not wrap it in
          a second one. */}
      <Header
        ticker={ticker}
        bridgeRow={bridgeRow}
        signalHistory={history}
        lastClose={lastClose}
        dayHigh={lastBar?.high ?? null}
        dayLow={lastBar?.low ?? null}
        medianPeakPct={MEDIAN_PEAK_PCT}
        medianDaysToPeak={MEDIAN_DAYS_TO_PEAK}
      />

      {/* The rail indexes both bands, so it sits beside all of the content
          rather than beside one column of it. */}
      <div className="flex gap-3">
        <SectionRail hasGamma={INDEX_ETFS.includes(ticker)} />

        {/* Above the fold: chart beside the two panels the design puts there.
            Below it: everything else, full width. No `order` overrides anywhere —
            below 1100px the columns stack in document order, so reading order,
            tab order and the rail agree (TN-03). */}
        <div className="min-w-0 flex-1 space-y-4">
        <div className="grid grid-cols-[62fr_38fr] gap-4 max-[1100px]:grid-cols-1">
        {/* Left: chart + options */}
        <div className="space-y-4">
          <div id="chart" className="min-h-[420px] scroll-mt-[calc(var(--nav-h)+12px)] 2xl:min-h-[560px]">
            {/* The panel is inside `TickerChartSection` — the range switch is a
                header action, so the header has to be where the period state is. */}
            <TickerChartSection
              ticker={ticker}
              bridgeRow={bridgeRow}
              initialBars={bars}
              initialStatus={historyResult.status}
              markers={markers}
              height={420}
              className="min-h-[420px] 2xl:min-h-[560px]"
            >
              <ChartInfoStrip ticker={ticker} bars={bars} />
            </TickerChartSection>
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

        {/* Right: Why → Catalysts, the two panels the design draws beside the
            chart. Entry, stop and target are drawn on the chart now, so there is
            no levels card and no `#levels` anchor. */}
        <div className="space-y-4">
          <div id="why" className="scroll-mt-[calc(var(--nav-h)+12px)]">
            <WhyPanel ticker={ticker} />
          </div>
          <div id="catalysts" className="scroll-mt-[calc(var(--nav-h)+12px)]">
            <CatalystsCard ticker={ticker} bridgeRow={bridgeRow} />
          </div>
        </div>
        </div>

        {/* Below the fold: the rest of the dossier at full width. These were a
            300px stack running off the bottom of a 900px window; two wide
            columns give the news list and the track record their own room and
            halve the scroll. Document order still matches the rail. */}
        <div className="grid grid-cols-2 gap-4 max-[1100px]:grid-cols-1">
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
