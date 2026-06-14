"use client";

import { useEffect, useState } from "react";
import { useRailQuotes, RAIL_LABEL, type RailQuote } from "@/lib/rail-quotes";
import { usMarketState, STATE_LABEL } from "@/lib/market-clock";
import { forexSessions, type FxSession } from "@/lib/forex-session";
import { QuoteRow } from "./QuoteRow";

// ─── Session badge helpers ────────────────────────────────────────────────────

/** Equity session badge per spec §3.2 */
function EquityBadge() {
  const state = usMarketState();
  const label = STATE_LABEL[state];
  const cls =
    state === "pre"
      ? "bg-accent/15 text-accent"
      : state === "regular"
      ? "bg-accent/25 text-accent"
      : state === "after"
      ? "bg-accent/10 text-accent/70"
      : "bg-warn/10 text-warn"; // closed
  return (
    <span className={`rounded px-1.5 py-px text-[10px] font-medium font-mono leading-none ${cls}`}>
      {label}
    </span>
  );
}

/** FX session chip per spec §3.3, handling ALL four states. */
function FxChip() {
  const { active, closed } = forexSessions();

  if (closed) {
    // Weekend / Friday-after-21:00 UTC
    return (
      <span className="rounded px-1.5 py-px text-[9px] font-mono font-medium leading-none bg-warn/10 text-warn">
        CLOSED
      </span>
    );
  }

  if (active.length === 0) {
    // Weekday open-between-sessions (after 21:00 UTC before ASIA opens next cycle)
    // This state is real — must not crash or render blank
    return (
      <span className="rounded px-1.5 py-px text-[9px] font-mono font-medium leading-none bg-elevated text-muted">
        OPEN
      </span>
    );
  }

  if (active.length > 1) {
    // Overlap — teal per spec §3.3, §8.3
    return (
      <span className="rounded px-1.5 py-px text-[9px] font-mono font-medium leading-none bg-teal/15 text-teal">
        {active.join("·")}
      </span>
    );
  }

  // Single session
  const session = active[0] as FxSession;
  const cls =
    session === "NY"
      ? "bg-elevated text-accent"
      : session === "LDN"
      ? "bg-elevated text-accent/80"
      : "bg-elevated text-muted"; // ASIA
  return (
    <span className={`rounded px-1.5 py-px text-[9px] font-mono leading-none ${cls}`}>
      {session}
    </span>
  );
}

// ─── Block sub-component ──────────────────────────────────────────────────────

interface BlockProps {
  label: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  /** Whether to apply a top border separator (all blocks except the first). */
  separator?: boolean;
}

function Block({ label, badge, children, separator }: BlockProps) {
  return (
    <div className={separator ? "border-t border-line" : undefined}>
      {/* Block header §4.3 / §8.2 */}
      <div className="h-[24px] flex items-center justify-between px-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted font-mono leading-none">
          {label}
        </span>
        {badge}
      </div>
      {children}
    </div>
  );
}

// ─── Skeleton counts per block ────────────────────────────────────────────────

// Static basket sizes used while data is loading — must show symbol labels.
const SKELETON_SYMBOLS: Record<"futures" | "indices" | "forex", string[]> = {
  futures: ["ES=F", "NQ=F", "YM=F", "RTY=F", "^VIX", "CL=F", "BTC-USD"],
  indices: ["SPY", "QQQ", "IWM", "DIA"],
  forex: ["EURUSD=X", "USDJPY=X", "GBPUSD=X", "AUDUSD=X"],
};

// ─── Minimised strip items ────────────────────────────────────────────────────

interface MiniItemProps {
  symbol: string;
  changePct?: number;
}

function MiniItem({ symbol, changePct }: MiniItemProps) {
  const label = RAIL_LABEL[symbol] ?? symbol;
  const pctCls =
    changePct === undefined || Math.abs(changePct) < 0.05
      ? "text-muted"
      : changePct > 0
      ? "text-pos"
      : "text-neg";
  const pctStr =
    changePct !== undefined
      ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`
      : "—";

  return (
    <div className="w-full flex flex-col items-center py-1.5 gap-0.5 hover:bg-elevated cursor-default">
      <span className="text-[9px] font-mono text-muted leading-none uppercase">{label}</span>
      <span className={`text-[11px] font-mono font-medium tabular-nums leading-none ${pctCls}`}>
        {pctStr}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const LS_KEY = "rail-left-collapsed";

export function LeftRail() {
  // Collapse state — start expanded to avoid hydration mismatch, sync from localStorage on mount
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LS_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      // localStorage unavailable (private browsing, SSR guard)
    }
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(LS_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  const { data, error } = useRailQuotes();

  // ── Minimised strip (36px) per spec §6.1 / §8.4 / §8.5 ──────────────────
  if (collapsed) {
    const spyQ = data?.quotes.find((q) => q.symbol === "SPY");
    const qqqQ = data?.quotes.find((q) => q.symbol === "QQQ");
    const vixQ = data?.quotes.find((q) => q.symbol === "^VIX");

    return (
      <aside className="w-9 flex-shrink-0 flex flex-col items-center py-1 gap-0 border-r border-line bg-surface sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] overflow-y-auto font-mono">
        <MiniItem symbol="SPY" changePct={spyQ?.change_pct} />
        <MiniItem symbol="QQQ" changePct={qqqQ?.change_pct} />
        <MiniItem symbol="^VIX" changePct={vixQ?.change_pct} />
        {/* Expand button — bottom */}
        <button
          onClick={toggle}
          aria-label="Expand quote rail"
          className="mt-auto w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated"
        >
          <span className="text-[14px] leading-none select-none">›</span>
        </button>
      </aside>
    );
  }

  // ── Expanded rail ─────────────────────────────────────────────────────────

  // Helper: get quotes for a group
  function groupQuotes(group: "futures" | "indices" | "forex"): RailQuote[] {
    return (data?.quotes ?? []).filter((q) => q.group === group);
  }

  const isLoading = !data && !error;

  function renderRows(group: "futures" | "indices" | "forex") {
    if (error) {
      // Offline banner per spec §5.5 / §8.6
      return (
        <div className="mx-3 my-1 px-2 py-1.5 rounded border border-warn/30 bg-warn/10 text-warn text-[10px] font-mono leading-snug">
          QUOTE FEED OFFLINE
        </div>
      );
    }
    if (isLoading) {
      // Skeleton rows per spec §5.3 / §8.8 — symbol labels stay, bars pulse
      return SKELETON_SYMBOLS[group].map((sym) => (
        <QuoteRow key={sym} symbol={sym} price={0} changePct={0} skeleton />
      ));
    }
    // Live data
    return groupQuotes(group).map((q) => (
      <QuoteRow
        key={q.symbol}
        symbol={q.symbol}
        price={q.price}
        changePct={q.change_pct}
      />
    ));
  }

  return (
    <aside
      className="w-[200px] flex-shrink-0 bg-surface border-r border-line font-mono sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] overflow-y-auto"
    >
      <div className="pt-1 flex flex-col h-full">
        {/* FUTURES block — no badge */}
        <Block label="Futures">
          {renderRows("futures")}
        </Block>

        {/* US EQUITY block — session badge */}
        <Block label="US Equity" badge={<EquityBadge />} separator>
          {renderRows("indices")}
        </Block>

        {/* FOREX block — FX session chip */}
        <Block label="Forex" badge={<FxChip />} separator>
          {renderRows("forex")}
        </Block>

        {/* Footnote zone per spec §8.10 */}
        <div className="mt-auto px-3 py-2 border-t border-line">
          <p className="text-[10px] font-mono text-muted opacity-60 leading-relaxed">
            macro gauges · market blurb · today&rsquo;s events&thinsp;&mdash;&thinsp;land with WS-3
          </p>
        </div>

        {/* Collapse button per spec §8.5 */}
        <button
          onClick={toggle}
          aria-label="Collapse quote rail"
          className="w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated"
        >
          <span className="text-[14px] leading-none select-none">‹</span>
        </button>
      </div>
    </aside>
  );
}
