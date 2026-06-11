"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ApiStatus from "@/components/ApiStatus";

export default function Nav() {
  const pathname = usePathname();

  const linkClass = (href: string) =>
    `text-sm font-medium transition-colors ${
      pathname === href ? "text-white" : "text-gray-400 hover:text-gray-200"
    }`;

  return (
    <nav className="sticky top-0 z-40 bg-[#0d1117] border-b border-[#30363d] px-4 py-2 flex items-center gap-4 overflow-x-auto">
      <Link href="/" className={linkClass("/")}>
        Signals
      </Link>
      <Link href="/accounts" className={linkClass("/accounts")}>
        Accounts
      </Link>
      <Link href="/screener" className={linkClass("/screener")}>
        Screener
      </Link>
      <Link href="/portfolio" className={linkClass("/portfolio")}>
        Portfolio
      </Link>
      <Link href="/agents" className={linkClass("/agents")}>
        Agents
      </Link>
      <div className="ml-auto flex items-center flex-shrink-0">
        <ApiStatus />
      </div>
    </nav>
  );
}
