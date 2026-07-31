"use client";

import { LeftRail } from "./LeftRail";
import { RightRail } from "./RightRail";

export default function RailShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-row h-[calc(100vh-var(--nav-h))] bg-bg">
      {/* Content is first in the DOM (keyboard/screen-reader order) but sits
       * visually between the rails via order-2; LeftRail/RightRail carry
       * order-1/order-3 on their own <aside> roots (G-11, A11Y-05). */}
      {/* div, not <main>: 4 of 7 pages already render their own <main>; nested <main> is invalid HTML */}
      <div id="main" tabIndex={-1} className="order-2 flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
      <LeftRail />
      <RightRail />
    </div>
  );
}
