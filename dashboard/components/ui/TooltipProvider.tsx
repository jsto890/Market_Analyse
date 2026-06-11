"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { ReactNode } from "react";

export default function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={300}>{children}</Tooltip.Provider>
  );
}
