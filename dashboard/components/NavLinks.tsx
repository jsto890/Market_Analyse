"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Nine equal-weight links in one row made you read the whole list to find any
 * of them. They are not equals: three are the daily loop, four are the context
 * you consult while deciding, two are your own book, and one explains the rest.
 * Same links, same order — a rule between the groups is the entire change.
 */
const GROUPS = [
  [
    { href: "/", label: "Today" },
    { href: "/watchlist", label: "Watchlist" },
    { href: "/screener", label: "Screener" },
  ],
  [
    { href: "/options", label: "Options" },
    { href: "/rotation", label: "Rotation" },
    { href: "/macro", label: "Macro" },
    { href: "/calendar", label: "Calendar" },
  ],
  [
    { href: "/portfolio", label: "Portfolio" },
    { href: "/alerts", label: "Alerts" },
  ],
  [{ href: "/learn", label: "Learn" }],
] as const;

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="flex h-full items-stretch">
      {GROUPS.map((group, i) => (
        <div key={i} className="flex h-full items-stretch gap-0.5">
          {i > 0 && <span aria-hidden className="my-2.5 ml-1.5 mr-2.5 w-px bg-line" />}
          {group.map(({ href, label }) => {
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
      ))}
    </div>
  );
}
