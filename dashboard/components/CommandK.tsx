"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import { deriveGroup, GROUP_LABEL } from "@/lib/groups";
import { STATIC_KEYS } from "@/lib/storageKeys";
import type { BridgeRow } from "@/types/bridge";

interface WatchlistEntry {
  ticker: string;
  pinned_at?: string;
}

interface ResultItem {
  ticker: string;
  group?: string;
  tier?: string;
  source: "bridge" | "watchlist" | "raw" | "recent" | "action";
  label?: string;
  href?: string;
}

const ACTIONS: { id: string; label: string; href: string }[] = [
  { id: "today", label: "Go to Today", href: "/" },
  { id: "watchlist", label: "Go to Watchlist", href: "/watchlist" },
  { id: "options", label: "Go to Options", href: "/odte" },
  { id: "rotation", label: "Go to Rotation", href: "/rotation" },
  { id: "macro", label: "Go to Macro", href: "/macro" },
  { id: "screener", label: "Go to Screener", href: "/screener" },
  { id: "portfolio", label: "Go to Portfolio", href: "/portfolio" },
  { id: "alerts", label: "Go to Alerts", href: "/alerts" },
];

function loadRecentTickers(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STATIC_KEYS.commandkRecent);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function recordRecentTicker(ticker: string): string[] {
  const next = [ticker, ...loadRecentTickers().filter((t) => t !== ticker)].slice(0, 5);
  try {
    window.localStorage.setItem(STATIC_KEYS.commandkRecent, JSON.stringify(next));
  } catch {
    // ignore quota/privacy-mode failures
  }
  return next;
}

function buildDefaultResults(recents: string[]): ResultItem[] {
  const recentItems: ResultItem[] = recents.slice(0, 5).map((ticker) => ({ ticker, source: "recent" }));
  const actionItems: ResultItem[] = ACTIONS.map((a) => ({
    ticker: a.id,
    label: a.label,
    href: a.href,
    source: "action",
  }));
  return [...recentItems, ...actionItems].slice(0, 12);
}

export function isEditableTarget(): boolean {
  const tag = (document.activeElement?.tagName ?? "").toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    !!(document.activeElement as HTMLElement)?.isContentEditable
  );
}

async function fetchWatchlistTickers(): Promise<string[]> {
  try {
    const r = await fetch("/api/watchlist");
    if (!r.ok) return [];
    const data: { watchlist: WatchlistEntry[] } = await r.json();
    return (data.watchlist ?? []).map((e) => e.ticker).filter(Boolean);
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
  watchlist: string[],
  recents: string[]
): ResultItem[] {
  const q = query.toUpperCase().trim();
  if (!q) return buildDefaultResults(recents);

  const seen = new Set<string>();
  const results: ResultItem[] = [];

  for (const row of bridgeRows) {
    if (matchQuery(q, row.ticker)) {
      seen.add(row.ticker);
      const group = deriveGroup(row);
      results.push({
        ticker: row.ticker,
        group,
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

  for (const action of ACTIONS) {
    if (action.label.toUpperCase().includes(q)) {
      results.push({ ticker: action.id, label: action.label, href: action.href, source: "action" });
    }
  }

  return results.slice(0, 12);
}

export default function CommandK() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [bridgeRows, setBridgeRows] = useState<BridgeRow[]>([]);
  const [watchlistTickers, setWatchlistTickers] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>(() => loadRecentTickers());
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
      const cmdK = e.key === "k" && (e.metaKey || e.ctrlKey);

      if (cmdK && !isEditableTarget()) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }

      if (e.key === "Escape") {
        close();
      }
    }

    function onOpen() {
      setOpen((v) => !v);
    }

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("commandk:open", onOpen);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("commandk:open", onOpen);
    };
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
      fetchWatchlistTickers().then(setWatchlistTickers).catch(() => {});
      setRecents(loadRecentTickers());
      return () => clearTimeout(id);
    }
  }, [open]);

  const results = buildResults(query, bridgeRows, watchlistTickers, recents);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  function activate(item: ResultItem) {
    if (item.source === "action" && item.href) {
      router.push(item.href);
    } else {
      setRecents(recordRecentTicker(item.ticker));
      router.push(`/t/${item.ticker}`);
    }
    close();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const item = results[selectedIdx];
      if (item) activate(item);
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
          <span className="text-muted text-body">⌘K</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search ticker…"
            className="flex-1 bg-transparent text-body text-foreground placeholder:text-muted outline-none font-mono"
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
                className={`flex items-center justify-between px-3 py-2 cursor-pointer text-body ${
                  i === selectedIdx ? "bg-accent/10 text-foreground" : "text-foreground/70 hover:bg-elevated"
                }`}
                onMouseEnter={() => setSelectedIdx(i)}
                onClick={() => activate(item)}
              >
                <span className="font-mono font-medium">
                  {item.source === "action" ? item.label : item.ticker}
                </span>
                <span className="flex items-center gap-1.5">
                  {item.source === "bridge" && item.group && (
                    <span className="eyebrow">{GROUP_LABEL[item.group as keyof typeof GROUP_LABEL]}</span>
                  )}
                  {item.source === "bridge" && item.tier && (
                    <Badge variant="tier" value={item.tier} />
                  )}
                  {item.source === "watchlist" && (
                    <span className="text-muted">watchlist</span>
                  )}
                  {item.source === "recent" && <span className="text-muted">recent</span>}
                  {item.source === "raw" && (
                    <span className="text-muted">Open {item.ticker} →</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {query.length > 0 && results.length === 0 && (
          <div className="px-3 py-3 text-body text-muted">No matches</div>
        )}
      </div>
    </div>
  );
}
