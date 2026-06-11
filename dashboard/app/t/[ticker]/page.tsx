import Panel from "@/components/ui/Panel";
import CandleChart, { type Bar, type Level } from "@/components/charts/CandleChart";
import { loadBridgeSignals } from "@/lib/bridge";

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

function bridgeLevels(ticker: string): Level[] {
  try {
    const rows = loadBridgeSignals();
    const row = rows.find(
      (r) => r.ticker.toUpperCase() === ticker.toUpperCase()
    );
    if (!row) return [];
    const levels: Level[] = [];
    if (row.entry) levels.push({ price: row.entry, kind: "entry" });
    if (row.stop) levels.push({ price: row.stop, kind: "stop" });
    if (row.target) levels.push({ price: row.target, kind: "target" });
    return levels;
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
  const [bars, levels] = await Promise.all([
    fetchHistory(ticker),
    Promise.resolve(bridgeLevels(ticker)),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-3xl font-bold text-white tracking-tight">{ticker}</h1>
      <Panel title="Signal">
        <p className="text-sm text-muted">Under construction</p>
      </Panel>
      <Panel title="Options Flow">
        <p className="text-sm text-muted">Under construction</p>
      </Panel>
      <Panel title="Catalyst">
        <p className="text-sm text-muted">Under construction</p>
      </Panel>
      <Panel title="Chart">
        <CandleChart
          ticker={ticker}
          initialBars={bars}
          initialPeriod="6M"
          levels={levels}
        />
      </Panel>
    </main>
  );
}
