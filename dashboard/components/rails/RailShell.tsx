"use client";

import { LeftRail } from "./LeftRail";
import { RightRail } from "./RightRail";

export default function RailShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-row h-[calc(100vh-var(--nav-h))] bg-bg">
      <LeftRail />
      {/* div, not <main>: 4 of 7 pages already render their own <main>; nested <main> is invalid HTML */}
      <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
      <RightRail />
    </div>
  );
}
