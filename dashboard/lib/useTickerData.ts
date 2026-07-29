import useSWR from "swr";
import type { ActionCardData, FundamentalsData, QuoteData } from "@/types/argus";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export function useTickerData(ticker: string) {
  const quote = useSWR<QuoteData>(`/api/argus/quote/${ticker}`, fetcher, {
    refreshInterval: 10000,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });

  // Auto-retry once, but only on a scoring timeout (504) — not a true outage.
  // Keeps last-good data on screen while it retries.
  const actionCard = useSWR<ActionCardData>(`/api/argus/action_card/${ticker}`, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: true,
    errorRetryCount: 1,
    onErrorRetry: (err, _key, _config, revalidate, { retryCount }) => {
      if ((err as Error)?.message !== "504" || retryCount > 1) return;
      setTimeout(() => revalidate({ retryCount }), 1500);
    },
  });

  const fundamentals = useSWR<FundamentalsData>(`/api/argus/fundamentals/${ticker}`, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  return { quote, actionCard, fundamentals };
}
