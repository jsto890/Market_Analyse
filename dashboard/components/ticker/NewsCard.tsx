"use client";

import useSWR from "swr";
import Panel from "@/components/ui/Panel";
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

  if (error || !data) return null;

  const items = data.items.slice(0, 8);

  return (
    <Panel title="News">
      {items.length === 0 ? (
        <p className="text-[12px] text-muted">No recent news</p>
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
                    className="text-[13px] text-foreground hover:underline"
                  >
                    {item.headline}
                  </a>
                ) : (
                  <span className="text-[13px] text-foreground">{item.headline}</span>
                )}
                {subLine && (
                  <p className="text-[11px] text-muted">{subLine}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
