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

/** The headline's own clock, local — the metadata rail sits beside the chart's
 * x-axis, so a relative "3h ago" here would not line up with it. */
function clockOf(ts: string): string {
  const at = new Date(ts.endsWith("Z") || ts.includes("+") ? ts : `${ts}Z`);
  if (!Number.isFinite(at.getTime())) return "—";
  return at.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * The headlines behind the selected gauge, ranked by weighted share (MAC-09).
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
              <li key={`${c.ts}-${i}`} className="px-3 py-1.5">
                <div className="flex items-baseline gap-2">
                  <span className={`w-12 shrink-0 text-data ${toneClass(c.score)}`}>
                    {signed(c.score)}
                  </span>
                  <span className="min-w-0 flex-1 text-body text-foreground">
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-accent"
                      >
                        {c.headline}
                      </a>
                    ) : (
                      c.headline
                    )}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 pl-14 text-data text-muted">
                  <span>w {c.weight.toFixed(2)}</span>
                  <span>·</span>
                  <span>{clockOf(c.ts)}</span>
                  {c.source && (
                    <>
                      <span>·</span>
                      <span>{c.source}</span>
                    </>
                  )}
                  <span>·</span>
                  <span>{(c.share * 100).toFixed(0)}% share</span>
                  {c.ticker && (
                    <Link href={`/t/${c.ticker}`} className="text-accent hover:underline">
                      {c.ticker}
                    </Link>
                  )}
                  <span className="ml-auto">{ageOf(c.ts)}</span>
                </div>
              </li>
            ))}
          </ul>
        {/* The names driving the scope moved to ScopeBand, which sets them
            beside your holdings and the next dated event — one band, not a
            ticker strip stranded at the foot of the headline list. */}
        </>
      )}
    </Panel>
  );
}
