import { ReactElement, ReactNode } from "react";
import { render as rtlRender, type RenderOptions } from "@testing-library/react";
import { SWRConfig } from "swr";
import TooltipProvider from "@/components/ui/TooltipProvider";
import UndoToastProvider from "@/components/ui/UndoToastProvider";

function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <TooltipProvider>
        <UndoToastProvider>{children}</UndoToastProvider>
      </TooltipProvider>
    </SWRConfig>
  );
}

function render(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return rtlRender(ui, { wrapper: Providers, ...options });
}

export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
export { render };
