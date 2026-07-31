import { loadBridgeSignals } from "@/lib/bridge";
import SourcesTable from "@/components/sources/SourcesTable";
import type { BridgeRow } from "@/types/bridge";
import PageShell from "@/components/PageShell";

export const dynamic = "force-dynamic";

export default function SourcesPage({
  searchParams,
}: {
  searchParams: { ticker?: string };
}) {
  let rows: BridgeRow[] = [];
  try {
    rows = loadBridgeSignals();
  } catch {
    rows = [];
  }

  return (
    <PageShell width="standard">
      <div className="space-y-3">
        <h1 className="text-title font-semibold">Sources</h1>
        <p className="text-body text-muted">
          Chatter is pulled from X/Twitter accounts tracked by a companion process, then
          cross-referenced against a ~70-agent technical ensemble before a ticker reaches the
          Today page — sentiment alone never promotes anything. "Source score" reflects how
          concentrated today's mentions were for a ticker; "mentions" and "accounts" are raw
          counts, not weighted by follower count or historical accuracy.
        </p>
        <p className="rounded-md border border-warn/50 bg-warn/10 px-3 py-2 text-dense text-warn">
          What this page can't show: there is no calibrated win-rate or follow-quality score
          per account — that data doesn't exist yet. "Tickers today" counts how many tickers an
          account was attached to in today's report, nothing more. Treat an account chip as
          "who flagged this," not "who to trust."
        </p>
      </div>
      <SourcesTable rows={rows} initialTicker={(searchParams.ticker ?? "").toUpperCase()} />
    </PageShell>
  );
}
