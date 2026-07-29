import { describe, it, expect } from "vitest";
import { sortNewsByTs, type NewsItem } from "@/lib/news";

function mk(id: number, ts: string): NewsItem {
  return { id, ts, source: "yf", ticker: null, headline: `h${id}`, body: null, url: null, is_breaking: 0 };
}

describe("sortNewsByTs", () => {
  it("sorts newest-first by default, regardless of input order", () => {
    const items = [mk(1, "2026-07-28 10:00:00"), mk(2, "2026-07-28 12:00:00"), mk(3, "2026-07-28 11:00:00")];
    expect(sortNewsByTs(items).map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it("sorts oldest-first when order is 'asc'", () => {
    const items = [mk(1, "2026-07-28 10:00:00"), mk(2, "2026-07-28 12:00:00")];
    expect(sortNewsByTs(items, "asc").map((i) => i.id)).toEqual([1, 2]);
  });

  it("does not mutate the input array", () => {
    const items = [mk(1, "2026-07-28 10:00:00"), mk(2, "2026-07-28 12:00:00")];
    sortNewsByTs(items);
    expect(items.map((i) => i.id)).toEqual([1, 2]);
  });
});
