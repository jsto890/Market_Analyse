"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import type { BridgeRow } from "@/types/bridge";

interface WatchlistEntry {
  ticker: string;
  pinned_at?: string;
}

interface ResultItem {
  ticker: string;
  group?: string;
  tier?: string;
  source: "bridge" | "watchlist" | "raw";
}

function isEditableTarget(): boolean {
  const tag = (document.activeElement?.tagName ?? "").toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    !!(document.activeElement as HTMLElement)?.isContentEditable
  );
}

function readWatchlist(): string[] {
  try {
    const raw = localStorage.getItem("argus_watchlist");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchlistEntry[] | string[];
    return parsed.map((e) => (typeof e === "string" ? e : e.ticker)).filter(Boolean);
  } catch {
    return [];
  }
}

function matchQuery(query: string, ticker: string): boolean {
  return ticker.toUpperCase().includes(query.toUpperCase());
}

function buildResults(
  query: string,
  bridgeRows: BridgeRow[],
  watchlist: string[]
): ResultItem[] {
  const q = query.toUpperCase().trim();
  if (!q) return [];

  const seen = new Set<string>();
  const results: ResultItem[] = [];

  for (const row of bridgeRows) {
    if (matchQuery(q, row.ticker)) {
      seen.add(row.ticker);
      results.push({
        ticker: row.ticker,
        group: row.trade_style,
        tier: row.action_label,
        source: "bridge",
      });
    }
  }

  for (const ticker of watchlist) {
    if (matchQuery(q, ticker) && !seen.has(ticker)) {
      seen.add(ticker);
      results.push({ ticker, source: "watchlist" });
    }
  }

  if (results.length === 0 && /^[A-Z]{1,5}$/.test(q)) {
    results.push({ ticker: q, source: "raw" });
  }

  return results.slice(0, 12);
}

export default function CommandK() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [bridgeRows, setBridgeRows] = useState<BridgeRow[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIdx(0);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const cmdK = (e.key === "k" && (e.metaKey || e.ctrlKey));
      const bareG = e.key === "g" && !e.metaKey && !e.ctrlKey && !e.altKey;

      if (cmdK) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }

      if (bareG && !isEditableTarget()) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }

      if (e.key === "Escape") {
        close();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);

  useEffect(() => {
    if (open) {
      setSelectedIdx(0);
      const id = setTimeout(() => inputRef.current?.focus(), 10);
      if (!loadedRef.current) {
        loadedRef.current = true;
        fetch("/api/bridge")
          .then((r) => r.json())
          .then((d: { signals: BridgeRow[] }) => setBridgeRows(d.signals ?? []))
          .catch(() => {});
      }
      return () => clearTimeout(id);
    }
  }, [open]);

  const watchlist = open ? readWatchlist() : [];
  const results = buildResults(query, bridgeRows, watchlist);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const item = results[selectedIdx];
      if (item) {
        router.push(`/t/${item.ticker}`);
        close();
      }
    } else if (e.key === "Escape") {
      close();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-start justify-center pt-[15vh] z-50"
      onClick={close}
    >
      <div
        className="bg-elevated border border-line rounded-lg w-[480px] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-line px-3 py-2 gap-2">
          <span className="text-muted text-[13px]">⌘K</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search ticker…"
            className="flex-1 bg-transparent text-[13px] text-white placeholder:text-muted outline-none font-mono"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        {results.length > 0 && (
          <ul className="py-1 max-h-64 overflow-y-auto">
            {results.map((item, i) => (
              <li
                key={`${item.source}-${item.ticker}`}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer text-[13px] ${
                  i === selectedIdx ? "bg-accent/10 text-white" : "text-white/70 hover:bg-elevated"
                }`}
                onMouseEnter={() => setSelectedIdx(i)}
                onClick={() => {
                  router.push(`/t/${item.ticker}`);
                  close();
                }}
              >
                <span className="font-mono font-medium">{item.ticker}</span>
                <span className="flex items-center gap-1.5 text-[11px]">
                  {item.source === "bridge" && item.tier && (
                    <Badge variant="tier" value={item.tier} />
                  )}
                  {item.source === "watchlist" && (
                    <span className="text-muted">watchlist</span>
                  )}
                  {item.source === "raw" && (
                    <span className="text-muted">Open {item.ticker} →</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {query.length > 0 && results.length === 0 && (
          <div className="px-3 py-3 text-[13px] text-muted">No matches</div>
        )}
      </div>
    </div>
  );
}
