"use client";

import { usePathname } from "next/navigation";
import { LeftRail } from "./LeftRail";
import { RightRail } from "./RightRail";

export default function RailShell({ children }: { children: React.ReactNode }) {
  /* Today is the only screen the rails belong to: it is the one you keep open,
   * and the tape and the news are what you keep it open for. Every other route
   * is a page you navigated to on purpose, so both rails go to 36px strips and
   * the content centres. */
  const dense = usePathname() !== "/";

  return (
    <div className="flex flex-row h-[calc(100vh-var(--nav-h))] bg-bg">
      {/* Content is first in the DOM (keyboard/screen-reader order) but sits
       * visually between the rails via order-2; LeftRail/RightRail carry
       * order-1/order-3 on their own <aside> roots (G-11, A11Y-05). */}
      {/* div, not <main>: 4 of 7 pages already render their own <main>; nested <main> is invalid HTML */}
      <div id="main" tabIndex={-1} className="order-2 flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
      <LeftRail dense={dense} />
      <RightRail dense={dense} />
    </div>
  );
}
