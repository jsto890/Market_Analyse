import { type Bar } from "@/components/charts/CandleChart";

/**
 * Four outcomes, not two. The ticker page says something different for each —
 * a slow Argus, a symbol with no bars and a broken request all used to collapse
 * into one blank chart, which is why they are discriminated here rather than
 * behind a `Bar[] | null`.
 */
export type HistoryResult =
  | { status: "ok"; bars: Bar[] }
  | { status: "timeout" }
  | { status: "no-data" }
  | { status: "error" };

export async function fetchHistory(ticker: string): Promise<HistoryResult> {
  try {
    const res = await fetch(
      `http://127.0.0.1:8088/api/history/${encodeURIComponent(ticker)}?period=2y`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return { status: "error" };
    const json = (await res.json()) as { bars: Bar[] };
    const bars = json.bars ?? [];
    return bars.length > 0 ? { status: "ok", bars } : { status: "no-data" };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") return { status: "timeout" };
    return { status: "error" };
  }
}
