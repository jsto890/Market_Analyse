"use client";

import Link from "next/link";
import { ReactNode } from "react";

interface NavActionsProps {
  statusDot: ReactNode;
}

export default function NavActions({ statusDot }: NavActionsProps) {
  function openCommandK() {
    window.dispatchEvent(new CustomEvent("commandk:open"));
  }

  return (
    <div className="flex items-center gap-3 flex-shrink-0">
      <a
        href="http://127.0.0.1:5173"
        target="_blank"
        rel="noreferrer"
        className="text-[13px] text-muted hover:text-white transition-colors"
      >
        0DTE↗
      </a>
      <Link
        href="/portfolio"
        className="text-[13px] text-muted hover:text-white transition-colors"
      >
        Portfolio
      </Link>
      <button
        onClick={openCommandK}
        className="text-[13px] text-muted hover:text-white transition-colors font-mono"
        aria-label="Open command palette"
      >
        ⌘K
      </button>
      {statusDot}
    </div>
  );
}
