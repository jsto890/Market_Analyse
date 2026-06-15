"use client";

import { useEffect, useState } from "react";

const LS_KEY = "rail-right-collapsed";

export function RightRail() {
  // Start expanded SSR; sync from localStorage on mount to avoid hydration mismatch
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

  // ── Minimised strip (36px) per spec §6.2 ─────────────────────────────────
  if (collapsed) {
    return (
      <aside className="w-9 flex-shrink-0 flex flex-col items-center py-1 border-l border-line bg-surface sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] font-mono">
        {/* Expand button — top, per spec §6.2 */}
        <button
          onClick={toggle}
          aria-label="Expand news rail"
          className="w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated"
        >
          <span className="text-[14px] leading-none select-none">‹</span>
        </button>
        {/* Rotated "NEWS" label per spec §6.2 */}
        <span
          className="text-[9px] font-mono font-medium uppercase tracking-[0.12em] text-muted mt-4"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          NEWS
        </span>
      </aside>
    );
  }

  // ── Expanded shell per spec §7.1 ──────────────────────────────────────────
  return (
    <aside className="w-[260px] flex-shrink-0 bg-surface border-l border-line font-mono sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] overflow-y-auto">
      {/* Header row per spec §7.1 */}
      <div className="h-[24px] flex items-center justify-between px-3 border-b border-line">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted font-mono leading-none">
          NEWS
        </span>
        <span className="text-[10px] font-mono text-muted opacity-50 leading-none">
          WS-3
        </span>
      </div>

      {/* Placeholder bars — static (no pulse), simulate headlines per spec §7.1 / §10 */}
      <div className="px-3 pt-4 flex flex-col gap-2">
        <div className="h-2 rounded bg-elevated opacity-50" style={{ width: "60%" }} />
        <div className="h-2 rounded bg-elevated opacity-50" style={{ width: "75%" }} />
        <div className="h-2 rounded bg-elevated opacity-50" style={{ width: "55%" }} />
      </div>

      {/* Explanatory text per spec §7.1 */}
      <p className="text-[11px] font-mono text-muted opacity-60 px-3 pt-3 leading-relaxed">
        Live feed and macro sentiment arrive with WS-3.
      </p>

      {/* Collapse button per spec §8.5 — right rail: expanded shows › (push outward = collapse) */}
      <button
        onClick={toggle}
        aria-label="Collapse news rail"
        className="w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated"
      >
        <span className="text-[14px] leading-none select-none">›</span>
      </button>
    </aside>
  );
}
