"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useRailQuotes, RAIL_LABEL, type RailQuote } from "@/lib/rail-quotes";
import { STATE_LABEL } from "@/lib/market-clock";
import { useMarketClock } from "@/lib/useMarketClock";
import { forexSessions } from "@/lib/forex-session";
import { useMacro } from "@/lib/macro";
import { useCalendar } from "@/lib/calendar";
import InfoTip from "@/components/ui/InfoTip";
import Failed from "@/components/ui/Failed";
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
    <span className={`rounded px-1.5 py-px text-micro font-medium font-mono leading-none ${cls}`}>
      {label}
    </span>
  );
}

/** FX session chip: single label pattern, one tone, per LR-08. */
function FxChip() {
  const { active, closed } = forexSessions();
  const state = closed ? "CLOSED" : active.length === 0 ? "OPEN" : active.join("·");
  return (
    <span className="rounded px-1.5 py-px text-micro font-mono font-medium leading-none bg-elevated text-muted">
      FX · {state}
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
    <div className={separator ? "border-t border-line-strong pt-0.5" : undefined}>
      {/* Block header §4.3 / §8.2 */}
      <div className="h-[24px] flex items-center justify-between px-3">
        <span className="eyebrow leading-none">{label}</span>
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
  // One decimal, not two: at 11px mono `+0.72%` is six characters in a 36px
  // strip and the `%` falls off the edge. The strip is a glance, not a quote.
  const pctStr =
    changePct !== undefined
      ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%`
      : "—";

  return (
    <div className="w-full flex flex-col items-center py-1.5 gap-0.5 hover:bg-elevated cursor-default">
      <span className="eyebrow leading-none">{label}</span>
      <span className={`text-micro font-mono font-medium tabular-nums leading-none ${pctCls}`}>
        {pctStr}
      </span>
    </div>
  );
}

/** Collapsed-strip glyphs for blocks the 36px strip otherwise drops entirely
 * (LR-04) — one dot each for FX session, next calendar event, macro sentiment.
 * The macro dot goes when the macro page is already on screen: a compressed
 * restatement of the same score is still the same score said twice. */
function HiddenBlockGlyphs({ showMacro }: { showMacro: boolean }) {
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
  // Macro sentiment is model output, so it takes --model, never P&L green/red.
  const macroClass = globalGauge && Math.abs(globalGauge.score) > 0.05 ? "bg-model" : "bg-muted";

  const { data: calData } = useCalendar(1);
  const nextEvent = calData?.events?.[0];
  const calLabel = nextEvent ? `Next: ${nextEvent.event}` : "No events today";
  const calClass = nextEvent ? "bg-accent" : "bg-muted";

  return (
    <div className="flex flex-col items-center gap-1.5 py-1.5 border-t border-line w-full">
      {/* InfoTip, not `title`: these are 6px dots, so the label is the only way
       * to read them — and a native title is mouse-only. */}
      <InfoTip label={fxLabel} content={fxLabel}>
        <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${fxClass}`} />
      </InfoTip>
      <InfoTip label={calLabel} content={calLabel}>
        <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${calClass}`} />
      </InfoTip>
      {showMacro && (
        <InfoTip label={macroLabel} content={macroLabel}>
          <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${macroClass}`} />
        </InfoTip>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const LS_KEY = "rail-left-collapsed";
const NARROW_QUERY = "(max-width: 1279px)";

export function LeftRail({ dense = false }: { dense?: boolean }) {
  // Start expanded SSR; reconcile from localStorage/viewport on mount to avoid hydration mismatch
  const [collapsed, setCollapsed] = useState(false);
  // The macro page shows every gauge in full; the rail's copy of the global
  // one sits ~900px away saying the same thing. The rail is the one that loses.
  const onMacroPage = (usePathname() ?? "").startsWith("/macro");

  useEffect(() => {
    // Off Today the rail is a strip, whatever was stored: those routes centre a
    // single column and the tape is furniture beside it, not the subject.
    if (dense) {
      setCollapsed(true);
      return;
    }

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
  }, [dense]);

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
      <aside className="w-[var(--rail-collapsed)] flex-shrink-0 order-1 flex flex-col items-center py-1 gap-0 border-r border-line bg-surface sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] overflow-y-auto font-mono">
        <MiniItem symbol="SPY" changePct={spyQ?.change_pct} />
        <MiniItem symbol="QQQ" changePct={qqqQ?.change_pct} />
        <MiniItem symbol="^VIX" changePct={vixQ?.change_pct} />
        <HiddenBlockGlyphs showMacro={!onMacroPage} />
        {/* Expand button — bottom */}
        <button
          onClick={toggle}
          aria-label="Expand quote rail"
          className="mt-auto w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated"
        >
          <span className="text-body leading-none select-none">›</span>
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
    // since the newest print IS the last close).
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
      className="w-[var(--rail-l)] flex-shrink-0 order-1 bg-surface border-r border-line font-mono sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] flex flex-col"
    >
      <div className="pt-1 flex-1 min-h-0 overflow-y-auto">
        {error && (
          <Failed
            title="Quote feed offline"
            message="Futures, index and FX quotes are unavailable."
            className="mx-3 mt-1 mb-0.5"
          />
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
        {!onMacroPage && <MacroGauges window="1d" />}

        {/* Collapse button per spec §8.5 */}
        <button
          onClick={toggle}
          aria-label="Collapse quote rail"
          className="w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated"
        >
          <span className="text-body leading-none select-none">‹</span>
        </button>
      </div>
    </aside>
  );
}
