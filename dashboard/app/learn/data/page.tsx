import { loadBridgeSignals } from "@/lib/bridge";
import SourcesTable from "@/components/sources/SourcesTable";
import Panel from "@/components/ui/Panel";
import type { BridgeRow } from "@/types/bridge";
import Page from "@/components/ui/Page";

export const dynamic = "force-dynamic";

/** Every number on the dashboard, traced to the process that produced it. Each
 *  row is read off the code path that serves that surface — not a description of
 *  what the pipeline is meant to do. */
const FEEDS: { surface: string; feed: string; cadence: string }[] = [
  {
    surface: "Today · Screener · ticker verdict",
    feed: "reports/bridge_latest.csv — X/Twitter chatter crossed with the technical ensemble",
    cadence: "One nightly run",
  },
  {
    surface: "Quote rail (futures, index, FX)",
    feed: "yfinance daily bars, whole basket in one download",
    cadence: "Last close, not a live tick",
  },
  {
    surface: "Chatter & Flow rail",
    feed: "news_items — Discord channel ingest, plus whale prints over $250k premium",
    cadence: "As each item lands",
  },
  {
    surface: "Macro sentiment",
    feed: "FinBERT scoring of those same items, weighted by recency",
    cadence: "Aggregated every 20 minutes",
  },
  {
    surface: "Options ladder · gamma · flow · greeks",
    feed: "IBKR TWS option chain via the 0DTE backend",
    cadence: "Live while TWS is connected",
  },
  {
    surface: "Portfolio",
    feed: "IBKR account summary and positions on TWS port 7496",
    cadence: "Live while TWS is connected",
  },
  {
    surface: "Sector rotation",
    feed: "reports/rotation_latest.json — relative strength by industry group",
    cadence: "One nightly run",
  },
  {
    surface: "Calendar",
    feed: "A curated macro-release seed plus yfinance earnings dates",
    cadence: "Seed is fixed; earnings refresh on a job",
  },
];

export default function DataPage({
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
    <Page width="wide">
      <Page.Header
        breadcrumb={[{ href: "/learn", label: "Learn" }]}
        title="Where the data comes from"
        subtitle="Which process produced each number, and how old it can be before you should distrust it."
      />

      <Panel title="Feed by feed">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-1.5 pr-4 eyebrow font-normal">Surface</th>
                <th className="py-1.5 pr-4 eyebrow font-normal">Feed</th>
                <th className="py-1.5 eyebrow font-normal">How fresh</th>
              </tr>
            </thead>
            <tbody>
              {FEEDS.map((f) => (
                <tr key={f.surface} className="border-b border-line/50 last:border-0 align-top">
                  <td className="py-1.5 pr-4 text-foreground">{f.surface}</td>
                  <td className="py-1.5 pr-4 text-2">{f.feed}</td>
                  <td className="py-1.5 text-2">{f.cadence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Page.Section>
        <h2 className="text-title text-foreground">Who flagged today&rsquo;s names</h2>
        <p className="text-body text-2">
          Chatter is pulled from X/Twitter accounts tracked by a companion process, then
          cross-referenced against a ~70-agent technical ensemble before a ticker reaches the
          Today page — sentiment alone never promotes anything. "Source score" reflects how
          concentrated today's mentions were for a ticker; "mentions" and "accounts" are raw
          counts, not weighted by follower count or historical accuracy.
        </p>
        <p className="rounded-md border border-warn/50 bg-warn/10 px-3 py-2 text-body text-warn">
          What this page can't show: there is no calibrated win-rate or follow-quality score
          per account — that data doesn't exist yet. "Tickers today" counts how many tickers an
          account was attached to in today's report, nothing more. Treat an account chip as
          "who flagged this," not "who to trust."
        </p>
      </Page.Section>
      <SourcesTable rows={rows} initialTicker={(searchParams.ticker ?? "").toUpperCase()} />
    </Page>
  );
}
