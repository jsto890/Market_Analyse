"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The right end of the nav: Learn, the one clock, the palette. Nothing else —
 *  every other status fact now lives behind the clock, and help keeps its `?`
 *  binding without also keeping a button. */
export default function NavActions({ children }: { children?: ReactNode }) {
  const onLearn = (usePathname() ?? "").startsWith("/learn");

  function openCommandK() {
    window.dispatchEvent(new CustomEvent("commandk:open"));
  }

  return (
    <div className="flex flex-shrink-0 items-center gap-[14px]">
      <Link
        href="/learn"
        aria-current={onLearn ? "page" : undefined}
        className={`text-body font-medium transition-colors hover:text-foreground ${
          onLearn ? "text-foreground" : "text-muted"
        }`}
      >
        Learn
      </Link>
      {children}
      <button
        onClick={openCommandK}
        className="rounded border border-line px-1.5 py-0.5 font-mono text-micro tracking-normal text-muted transition-colors hover:border-line-strong hover:text-foreground"
        aria-label="Open command palette"
      >
        ⌘K
      </button>
    </div>
  );
}
