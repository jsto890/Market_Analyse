"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";

/** The right end of the nav: Learn, the one clock, reload, the palette. Nothing
 *  else — every other status fact now lives behind the clock, and help keeps
 *  its `?` binding without also keeping a button. */
export default function NavActions({ children }: { children?: ReactNode }) {
  const onLearn = (usePathname() ?? "").startsWith("/learn");

  function openCommandK() {
    window.dispatchEvent(new CustomEvent("commandk:open"));
  }

  /** The desktop shell has no browser chrome, so there is no ⌘R and no address
   *  bar behind it. A full reload rather than a router refresh: this is also
   *  the way back when the server has been rebuilt under an open window and its
   *  cached chunks no longer exist. */
  function reload() {
    window.location.reload();
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
        onClick={reload}
        title="Reload"
        aria-label="Reload"
        className="rounded border border-line p-1 text-muted transition-colors hover:border-line-strong hover:text-foreground"
      >
        <RotateCw size={12} strokeWidth={2} aria-hidden />
      </button>
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
