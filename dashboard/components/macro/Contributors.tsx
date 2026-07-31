"use client";

import Link from "next/link";
import Panel from "@/components/ui/Panel";
import Empty from "@/components/ui/Empty";
import Failed from "@/components/ui/Failed";
import Loading from "@/components/ui/Loading";
import { relativeAge } from "@/lib/format";
import { scopeLabel, signed, toneClass, useMacroContributors } from "@/lib/macro";

function ageOf(ts: string): string {
  const at = new Date(ts.endsWith("Z") || ts.includes("+") ? ts : `${ts}Z`).getTime();
  if (!Number.isFinite(at)) return "—";
  return relativeAge((Date.now() - at) / 1000);
}

/**
 * The headlines behind the selected gauge, ranked by weighted share — and the
 * tickers they name, which is the only path from a sector score to something
 * tradeable (MAC-09, MAC-12).
 */
export default function Contributors({ scope, window }: { scope: string; window: string }) {
  const { data, error, isLoading } = useMacroContributors(scope, window);

  return (
    <Panel title={`What moved ${scopeLabel(scope)}`}>
      {isLoading && !data && (
        <Loading className="px-3 py-2" count={4} label="Loading contributors" />
      )}
      {error && (
        <Failed
          className="m-3"
          title="Contributors unavailable"
          message="The Argus API isn't answering, so the headlines behind this gauge could not be listed."
        />
      )}
      {data && data.items.length === 0 && (
        <Empty message="No scored headlines rolled into this scope during the lookback." />
      )}
      {data && data.items.length > 0 && (
        <>
          <p className="px-3 pb-1 pt-2 text-body text-2">
            {data.n} scored {data.n === 1 ? "headline" : "headlines"} · share is each item&rsquo;s
            weight after recency decay, so score × share sums to the gauge.
          </p>
          <ul className="divide-y divide-line">
            {data.items.map((c, i) => (
              <li key={`${c.ts}-${i}`} className="flex items-baseline gap-2 px-3 py-1.5">
                <span className={`w-12 shrink-0 text-data ${toneClass(c.score)}`}>
                  {signed(c.score)}
                </span>
                <span className="w-10 shrink-0 text-data text-muted">
                  {(c.share * 100).toFixed(0)}%
                </span>
                {c.ticker && (
                  <Link
                    href={`/t/${c.ticker}`}
                    className="shrink-0 text-data text-accent hover:underline"
                  >
                    {c.ticker}
                  </Link>
                )}
                <span className="min-w-0 flex-1 text-body text-foreground">
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noreferrer" className="hover:text-accent">
                      {c.headline}
                    </a>
                  ) : (
                    c.headline
                  )}
                </span>
                <span className="shrink-0 text-data text-muted">{ageOf(c.ts)}</span>
              </li>
            ))}
          </ul>
          {data.tickers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2">
              <span className="eyebrow">names driving this scope</span>
              {data.tickers.map((t) => (
                <Link
                  key={t.ticker}
                  href={`/t/${t.ticker}`}
                  className="rounded border border-line px-1.5 py-px font-mono text-micro text-accent hover:bg-elevated"
                >
                  {t.ticker} <span className="text-muted">×{t.n}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
