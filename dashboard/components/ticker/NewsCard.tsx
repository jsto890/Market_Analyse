"use client";

import useSWR from "swr";
import Panel from "@/components/ui/Panel";
import Empty from "@/components/ui/Empty";
import Failed from "@/components/ui/Failed";
import Loading from "@/components/ui/Loading";
import { relTime } from "@/lib/news";

interface TickerNewsItem {
  headline: string;
  source: string;
  url: string | null;
  ts: string | null;
  provider: string | null;
  ticker: string | null;
  body: string | null;
}

interface TickerNewsResponse {
  symbol: string;
  items: TickerNewsItem[];
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json() as Promise<TickerNewsResponse>;
  });

export default function NewsCard({ ticker }: { ticker: string }) {
  const { data, error } = useSWR<TickerNewsResponse>(
    `/api/argus/news/${ticker}`,
    fetcher,
    { shouldRetryOnError: false }
  );

  if (error)
    return (
      <Panel title="News">
        <Failed title="News feed unavailable" message="The headline feed didn’t answer." />
      </Panel>
    );
  if (!data)
    return (
      <Panel title="News">
        <Loading variant="lines" count={4} label="Loading news" />
      </Panel>
    );

  const items = data.items.slice(0, 8);

  return (
    <Panel title="News">
      {items.length === 0 ? (
        <Empty title="No recent news" message={`Nothing filed for ${ticker} in the feed window.`} />
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => {
            const label = item.provider ?? item.source;
            const time = item.ts ? relTime(item.ts) : null;
            const subLine = [label, time].filter(Boolean).join(" · ");

            return (
              <div key={i} className="space-y-0.5">
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-body text-foreground hover:underline"
                  >
                    {item.headline}
                  </a>
                ) : (
                  <span className="text-body text-foreground">{item.headline}</span>
                )}
                {subLine && (
                  <p className="text-data text-muted">{subLine}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
