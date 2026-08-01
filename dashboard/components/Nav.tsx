import NavLinks from "@/components/NavLinks";
import NavActions from "@/components/NavActions";
import { ReactNode } from "react";

interface NavProps {
  contextStrip: ReactNode;
}

export default function Nav({ contextStrip }: NavProps) {
  return (
    <nav className="sticky top-0 z-40 flex h-nav items-center gap-[20px] overflow-x-auto border-b border-line bg-surface px-[16px]">
      <span className="flex flex-shrink-0 select-none items-center gap-2">
        <span className="h-3.5 w-1 rounded-sm bg-accent" />
        <span className="text-title font-bold tracking-[0.14em] text-foreground">ARGUS</span>
      </span>

      <NavLinks />

      <div className="ml-auto flex flex-shrink-0 items-center">
        <NavActions>{contextStrip}</NavActions>
      </div>
    </nav>
  );
}
