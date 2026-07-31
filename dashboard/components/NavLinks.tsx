"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/options", label: "Options" },
  { href: "/rotation", label: "Rotation" },
  { href: "/macro", label: "Macro" },
  { href: "/calendar", label: "Calendar" },
  { href: "/screener", label: "Screener" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/alerts", label: "Alerts" },
] as const;

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="flex h-full items-stretch gap-0.5">
      {LINKS.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center px-2.5 text-body font-medium transition-colors ${
              active ? "text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {label}
            <span
              className={`absolute inset-x-1.5 -bottom-px h-0.5 rounded-t-sm bg-accent transition-opacity ${
                active ? "opacity-100" : "opacity-0"
              }`}
            />
          </Link>
        );
      })}
    </div>
  );
}
