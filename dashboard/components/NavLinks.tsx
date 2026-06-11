"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/performance", label: "Performance" },
  { href: "/sources", label: "Sources" },
  { href: "/screener", label: "Screener" },
] as const;

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-4">
      {LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`text-sm font-medium transition-colors ${
            pathname === href ? "text-white" : "text-muted hover:text-white"
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
