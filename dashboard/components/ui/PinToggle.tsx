// dashboard/components/ui/PinToggle.tsx
"use client";
import useSWR from "swr";
import { useUndoAction } from "./UndoToastProvider";

export interface PinToggleProps {
  symbol: string;
  /** "chip" (bordered pill, Screener/Watchlist table cells) or "text" (inline link, ticker header). Default: "chip". */
  variant?: "chip" | "text";
  className?: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function PinToggle({ symbol, variant = "chip", className }: PinToggleProps) {
  const { data, mutate } = useSWR<{ watchlist: { ticker: string }[] }>("/api/watchlist", fetcher, {
    revalidateOnFocus: false,
  });
  const pinned = data?.watchlist?.some((w) => w.ticker === symbol) ?? false;
  const { run } = useUndoAction();

  function toggle() {
    const wasPinned = pinned;
    let removedEntry: { ticker: string } | undefined;
    mutate(
      (prev) => {
        if (!prev) return prev;
        if (wasPinned) {
          removedEntry = prev.watchlist.find((w) => w.ticker === symbol);
          return { watchlist: prev.watchlist.filter((w) => w.ticker !== symbol) };
        }
        return { watchlist: [...prev.watchlist, { ticker: symbol }] };
      },
      false
    );
    run({
      label: wasPinned ? `Removed ${symbol} from watchlist` : `Added ${symbol} to watchlist`,
      commit: () =>
        fetch("/api/watchlist", {
          method: wasPinned ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: symbol }),
        }),
      onError: () => mutate(),
      undo: () =>
        mutate(
          (prev) => {
            if (!prev) return prev;
            const wl = wasPinned
              ? [...prev.watchlist, removedEntry ?? { ticker: symbol }]
              : prev.watchlist.filter((w) => w.ticker !== symbol);
            return { watchlist: wl };
          },
          false
        ),
    });
  }

  if (variant === "text") {
    return (
      <button
        type="button"
        onClick={toggle}
        className={["text-body underline-offset-2 hover:underline", pinned ? "text-warn" : "text-muted", className ?? ""].join(" ")}
        aria-pressed={pinned}
        aria-label={pinned ? `Unpin ${symbol}` : `Pin ${symbol}`}
      >
        {pinned ? "Unpin" : "Pin"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${symbol}` : `Pin ${symbol}`}
      className={[
        "rounded-[5px] border px-2 py-[5px] text-label transition-colors",
        pinned ? "border-warn text-warn bg-warn/10" : "border-line text-3 hover:border-line-strong hover:text-foreground",
        className ?? "",
      ].join(" ")}
    >
      {pinned ? "Pinned" : "Pin"}
    </button>
  );
}
