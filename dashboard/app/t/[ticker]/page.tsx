import Panel from "@/components/ui/Panel";

export default function TickerPage({ params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase();

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
        <p className="text-sm text-muted">Under construction</p>
      </Panel>
    </main>
  );
}
