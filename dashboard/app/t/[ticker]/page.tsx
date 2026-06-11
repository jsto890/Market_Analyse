import CandleChart, { type Bar, type Level, type Marker } from "@/components/charts/CandleChart";
import Panel from "@/components/ui/Panel";
import Header from "@/components/ticker/Header";
import LevelsCard from "@/components/ticker/LevelsCard";
import { loadBridgeSignals } from "@/lib/bridge";
import { signalHistory } from "@/lib/signals";

async function fetchHistory(ticker: string): Promise<Bar[]> {
  try {
    const res = await fetch(
      `http://127.0.0.1:8088/api/history/${encodeURIComponent(ticker)}?period=6mo`,
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

  // Server data
  const [bars] = await Promise.all([fetchHistory(ticker)]);

  const bridgeRow = (() => {
    try {
      const rows = loadBridgeSignals();
      return rows.find((r) => r.ticker.toUpperCase() === ticker) ?? null;
    } catch {
      return null;
    }
  })();

  const history = (() => {
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
  })();

  // Last close from history bars (same-basis as chart)
  const lastClose = bars.length > 0 ? bars[bars.length - 1].close : null;

  // Chart levels from bridge row
  const levels: Level[] = (() => {
    if (!bridgeRow) return [];
    const l: Level[] = [];
    if (bridgeRow.entry) l.push({ price: bridgeRow.entry, kind: "entry" });
    if (bridgeRow.stop) l.push({ price: bridgeRow.stop, kind: "stop" });
    if (bridgeRow.target) l.push({ price: bridgeRow.target, kind: "target" });
    return l;
  })();

  // Chart markers from signal history
  const markers: Marker[] = history.map((row) => ({
    date: row.date,
    label: row.report_group ?? row.action_label ?? "",
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
        />
      </section>

      {/* Two-column layout */}
      <div className="grid grid-cols-[62fr_38fr] gap-4 max-[1100px]:grid-cols-1">
        {/* Left: chart */}
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

        {/* Right: levels + scaffold panels */}
        <div className="space-y-4">
          {bridgeRow && <LevelsCard bridgeRow={bridgeRow} />}

          <Panel title="Signal">
            <p className="text-[12px] text-muted">Under construction</p>
          </Panel>
          <Panel title="Options Flow">
            <p className="text-[12px] text-muted">Under construction</p>
          </Panel>
          <Panel title="Catalyst">
            <p className="text-[12px] text-muted">Under construction</p>
          </Panel>
        </div>
      </div>
    </main>
  );
}
