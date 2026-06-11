import NavLinks from "@/components/NavLinks";
import NavActions from "@/components/NavActions";
import { ReactNode } from "react";

interface NavProps {
  contextStrip: ReactNode;
  statusDot: ReactNode;
}

export default function Nav({ contextStrip, statusDot }: NavProps) {
  return (
    <nav className="sticky top-0 z-40 bg-surface border-b border-line h-nav flex items-center px-4 gap-4 overflow-x-auto">
      <span className="text-sm font-semibold text-white tracking-tight flex-shrink-0">
        ARGUS
      </span>

      <NavLinks />

      <div className="ml-auto flex items-center gap-3 flex-shrink-0">
        {contextStrip}
        <NavActions statusDot={statusDot} />
      </div>
    </nav>
  );
}
