"use client";

import { useEffect, useState } from "react";
import { useRailQuotes, RAIL_LABEL, type RailQuote } from "@/lib/rail-quotes";
import { pickChangeBasis } from "@/lib/change-basis";
import { STATE_LABEL } from "@/lib/market-clock";
import { useMarketClock } from "@/lib/useMarketClock";
import { forexSessions, type FxSession } from "@/lib/forex-session";
import { useMacro } from "@/lib/macro";
import { useCalendar } from "@/lib/calendar";
import { QuoteRow } from "./QuoteRow";
import { MacroGauges } from "./MacroGauges";
import { EconCalendar } from "./EconCalendar";

// ─── Session badge helpers ────────────────────────────────────────────────────

/** Equity session badge per spec §3.2 */
function EquityBadge() {
  const { us: state } = useMarketClock();
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

/** Collapsed-strip glyphs for blocks the 36px strip otherwise drops entirely
 * (LR-04) — one dot each for FX session, next calendar event, macro sentiment. */
function HiddenBlockGlyphs() {
  const { active, closed } = forexSessions();
  const fxLabel = closed
    ? "FX: closed"
    : active.length > 1
    ? `FX: ${active.join("/")} overlap`
    : active.length === 1
    ? `FX: ${active[0]}`
    : "FX: between sessions";
  const fxClass = closed ? "bg-warn" : active.length > 1 ? "bg-teal" : active.length === 1 ? "bg-accent" : "bg-muted";

  const { data: macroData } = useMacro();
  const globalGauge = (macroData?.gauges ?? []).find((g) => g.scope === "global" && g.window === "1d");
  const macroLabel = globalGauge
    ? `Macro: ${globalGauge.score >= 0 ? "+" : ""}${globalGauge.score.toFixed(2)}`
    : "Macro: —";
  const macroClass = !globalGauge
    ? "bg-muted"
    : globalGauge.score > 0.05
    ? "bg-pos"
    : globalGauge.score < -0.05
    ? "bg-neg"
    : "bg-muted";

  const { data: calData } = useCalendar(1);
  const nextEvent = calData?.events?.[0];
  const calLabel = nextEvent ? `Next: ${nextEvent.event}` : "No events today";
  const calClass = nextEvent ? "bg-accent" : "bg-muted";

  return (
    <div className="flex flex-col items-center gap-1.5 py-1.5 border-t border-line w-full">
      <span aria-label={fxLabel} title={fxLabel} className={`w-1.5 h-1.5 rounded-full ${fxClass}`} />
      <span aria-label={calLabel} title={calLabel} className={`w-1.5 h-1.5 rounded-full ${calClass}`} />
      <span aria-label={macroLabel} title={macroLabel} className={`w-1.5 h-1.5 rounded-full ${macroClass}`} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const LS_KEY = "rail-left-collapsed";
const NARROW_QUERY = "(max-width: 1279px)";

export function LeftRail() {
  // Start expanded SSR; reconcile from localStorage/viewport on mount to avoid hydration mismatch
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const readStored = (): string | null => {
      try {
        return window.localStorage.getItem(LS_KEY);
      } catch {
        return null;
      }
    };

    const stored = readStored();
    if (stored === "1") setCollapsed(true);
    else if (stored === "0") setCollapsed(false);
    else setCollapsed(window.innerWidth < 1280);

    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(NARROW_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      // Explicit stored preference always wins over the media query.
      if (readStored() !== null) return;
      setCollapsed(e.matches);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
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
      <aside className="w-9 flex-shrink-0 order-1 flex flex-col items-center py-1 gap-0 border-r border-line bg-surface sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] overflow-y-auto font-mono">
        <MiniItem symbol="SPY" changePct={spyQ?.change_pct} />
        <MiniItem symbol="QQQ" changePct={qqqQ?.change_pct} />
        <MiniItem symbol="^VIX" changePct={vixQ?.change_pct} />
        <HiddenBlockGlyphs />
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
    if (error) return null;
    if (isLoading) {
      // Skeleton rows per spec §5.3 / §8.8 — symbol labels stay, bars pulse
      return SKELETON_SYMBOLS[group].map((sym) => (
        <QuoteRow key={sym} symbol={sym} price={0} changePct={0} skeleton />
      ));
    }
    // Live data. Server pct is price vs last real close — correct while the
    // market is open (live vs settle) AND while closed (last session's move,
    // since the newest print IS the last close). The basis only labels it.
    const basis = pickChangeBasis({ group });
    return groupQuotes(group).map((q) => (
      <QuoteRow
        key={q.symbol}
        symbol={q.symbol}
        price={q.price}
        changePct={q.change_pct}
        prevBasis={basis === "prev"}
      />
    ));
  }

  return (
    <aside
      className="w-[200px] flex-shrink-0 order-1 bg-surface border-r border-line font-mono sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] flex flex-col"
    >
      <div className="pt-1 flex-1 min-h-0 overflow-y-auto">
        {error && (
          <div className="mx-3 mt-1 mb-0.5 px-2 py-1.5 rounded border border-warn/30 bg-warn/10 text-warn text-[10px] font-mono leading-snug">
            QUOTE FEED OFFLINE
          </div>
        )}

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

        {/* What's-next economic calendar — WS-3c */}
        <EconCalendar days={7} />
      </div>

      {/* Non-scrolling footer — always visible, no matter the viewport height (LR-05) */}
      <div className="flex-shrink-0">
        <MacroGauges window="1d" />

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
