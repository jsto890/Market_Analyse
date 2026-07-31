"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import SymbolSwitcher from "@/components/odte/SymbolSwitcher";
import InfoTip from "@/components/ui/InfoTip";
import Toggle from "@/components/ui/Toggle";
import { odteBadge, useOdteSymbol, type OdteHealth } from "@/lib/odte";
import { companionSymbol, isProxied } from "@/lib/odteCompanion";
import { OPTIONS_TABS, OptionsUiProvider, useOptionsUi } from "@/lib/optionsUi";

const fetcher = (u: string) => fetch(u, { cache: "no-store" }).then((r) => r.json());

const toneClass: Record<string, string> = {
  live: "bg-teal/15 text-teal",
  warn: "bg-warn/15 text-warn",
  down: "bg-neg/15 text-neg",
};

export default function OptionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <OptionsUiProvider>
      <OptionsChrome>{children}</OptionsChrome>
    </OptionsUiProvider>
  );
}

function OptionsChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [activeSymbol, switchSymbol] = useOdteSymbol();
  const { live, setLive } = useOptionsUi();
  const { data, error } = useSWR<OdteHealth>("/api/odte/health", fetcher, {
    refreshInterval: 5000,
    shouldRetryOnError: false,
  });
  const badge = odteBadge(error ? null : data);

  return (
    <div className="flex h-full flex-col">
      {/* Chrome, not content: `h-full` on the column makes every child
       * shrinkable by default, which squeezed these two rows and clipped their
       * text once the type scale grew. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-[var(--page-x)] py-2">
        <h1 className="text-body font-semibold">
          Options · {activeSymbol}
          {isProxied(activeSymbol) && (
            <span className="ml-1.5 text-data font-normal text-muted">
              (via {companionSymbol(activeSymbol)})
            </span>
          )}
        </h1>
        <div className="overflow-x-auto">
          <SymbolSwitcher active={activeSymbol} onChange={switchSymbol} />
        </div>
        {/* One live control for every tab, with its name and its state both in
           text — the bare switch said neither (OPT-03). */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="eyebrow">Live ladder</span>
          <Toggle checked={live} onChange={setLive} label="Live ladder" />
          <span
            className={`w-6 text-data ${live ? "text-teal" : "text-muted"}`}
            aria-hidden
          >
            {live ? "on" : "off"}
          </span>
          <p role="status" aria-live="polite" className="sr-only">
            Live ladder {live ? "on — streaming quotes and greeks" : "off — showing the daily snapshot"}
          </p>
          <span className={`rounded px-2 py-0.5 text-micro ${toneClass[badge.tone]}`}>{badge.label}</span>
          <InfoTip
            label="What does this status mean?"
            content="Connection status polls the backend every 5s and won't retry automatically on failure — if IBKR drops mid-session this badge can sit stale until the next scheduled poll succeeds."
          />
        </div>
      </div>

      <nav
        aria-label="Options sections"
        className="flex shrink-0 gap-4 overflow-x-auto border-b border-line px-[var(--page-x)] py-1.5"
      >
        {OPTIONS_TABS.map((t) => {
          const active = t.href === "/options" ? pathname === "/options" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap border-b-2 pb-1 text-body font-medium transition-colors ${
                active
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
        {/* The active tab's blurb, inline — a native title per tab put the
         * explanation behind a hover on a link, reachable by mouse only. */}
        <span className="self-center text-body text-2">
          {OPTIONS_TABS.find((t) =>
            t.href === "/options" ? pathname === "/options" : pathname.startsWith(t.href)
          )?.blurb}
        </span>
      </nav>

      {children}
    </div>
  );
}
