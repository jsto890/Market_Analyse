"use client";

import { useState, useEffect, useRef, useCallback, useMemo, KeyboardEvent, Fragment, type ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronRight } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";

export interface Column<T> {
  key: string;
  header: ReactNode;
  width?: string;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  sortFn?: (a: T, b: T) => number;
  render: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  expandedRender?: (row: T) => React.ReactNode;
  persistKey?: string;
  onOpen?: (row: T) => void;
  onRowHover?: (row: T) => void;
  /** Visually-hidden <caption> giving the table an accessible name. Optional for backward compat; new/touched tables should always pass one. */
  caption?: string;
  /** Shown in place of the body when `rows` is empty. The header stays, so the
   * reader can still see what the table *would* have contained. */
  emptyMessage?: string;
  emptyAction?: ReactNode;
}

interface SortState {
  key: string;
  dir: "asc" | "desc";
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  defaultSort,
  expandedRender,
  persistKey,
  onOpen,
  onRowHover,
  caption,
  emptyMessage = "No rows match the current filters.",
  emptyAction,
}: DataTableProps<T>) {
  const storageKey = persistKey ? `dash:table:${persistKey}:sort` : null;

  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);
  const [hydrated, setHydrated] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        try {
          const parsed = JSON.parse(stored) as SortState;
          if (parsed.key && (parsed.dir === "asc" || parsed.dir === "desc")) {
            setSort(parsed);
          }
        } catch {
        }
      }
    }
    setHydrated(true);
  }, [storageKey]);

  const activeSort = hydrated ? sort : (defaultSort ?? null);

  const sortedRows = useMemo(() => {
    if (!activeSort) return rows;
    const col = columns.find((c) => c.key === activeSort.key && c.sortable);
    if (!col || !col.sortFn) return rows;
    const multiplier = activeSort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => col.sortFn!(a, b) * multiplier);
  }, [rows, columns, activeSort]);

  // Scroll focused row into view whenever focusedKey changes
  useEffect(() => {
    if (focusedKey === null) return;
    const el = rowRefs.current.get(focusedKey);
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [focusedKey]);

  const updateScrollFade = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollFade();
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => updateScrollFade();
    el.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [updateScrollFade, sortedRows.length]);

  function handleHeaderClick(col: Column<T>) {
    if (!col.sortable) return;
    setSort((prev) => {
      const next: SortState =
        prev && prev.key === col.key
          ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
          : { key: col.key, dir: "asc" };
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(next));
      }
      return next;
    });
  }

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const handleContainerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (isEditable(e.target)) return;

      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const currentIndex = focusedKey
          ? sortedRows.findIndex((r) => rowKey(r) === focusedKey)
          : -1;
        const max = sortedRows.length - 1;
        let nextIndex: number;
        if (e.key === "j") {
          nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, max);
        } else {
          nextIndex = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0);
        }
        const nextRow = sortedRows[nextIndex];
        if (nextRow) setFocusedKey(rowKey(nextRow));
        return;
      }

      if (focusedKey === null) return;
      const focusedIndex = sortedRows.findIndex((r) => rowKey(r) === focusedKey);
      const row = focusedIndex >= 0 ? sortedRows[focusedIndex] : null;
      if (!row) return;

      if (e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        if (expandedRender) toggleExpand(focusedKey);
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        onOpen?.(row);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setExpandedKeys(new Set());
        setFocusedKey(null);
        return;
      }
    },
    [focusedKey, sortedRows, rowKey, expandedRender, onOpen]
  );

  const alignClass = (align?: "left" | "right" | "center") => {
    if (align === "right") return "text-right";
    if (align === "center") return "text-center";
    return "text-left";
  };

  return (
    <div className="relative">
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleContainerKeyDown}
        className="overflow-x-auto focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
      >
        {/* border-separate, not border-collapse: a collapsed table refuses to
         * paint a background on <thead>/<tr>, so the sticky header was
         * transparent and the first data rows scrolled through it. Sticky and
         * background both live on the <th> cells now. */}
        <table className="w-full border-separate border-spacing-0 text-body">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((col, ci) => (
                <th
                  key={col.key}
                  scope="col"
                  style={{ width: col.width }}
                  className={[
                    "sticky top-0 z-20 bg-surface px-3 py-2 font-medium text-muted border-b border-line whitespace-nowrap",
                    alignClass(col.align),
                    ci === 0
                      ? "sticky left-0 z-30 border-r border-line"
                      : "",
                    col.sortable ? "cursor-pointer select-none hover:text-[var(--text)]" : "",
                  ].join(" ")}
                  onClick={() => handleHeaderClick(col)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && activeSort?.key === col.key ? (
                      activeSort.dir === "asc" ? (
                        <ChevronUp size={12} className="text-accent shrink-0" />
                      ) : (
                        <ChevronDown size={12} className="text-accent shrink-0" />
                      )
                    ) : null}
                  </span>
                </th>
              ))}
              {expandedRender && (
                <th scope="col" className="sticky top-0 z-20 w-8 bg-surface border-b border-line">
                  <span className="sr-only">Details</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (expandedRender ? 1 : 0)}
                  className="border-b border-line bg-surface"
                >
                  <EmptyState message={emptyMessage} action={emptyAction} />
                </td>
              </tr>
            )}
            {sortedRows.map((row, ri) => {
              const key = rowKey(row);
              const isExpanded = expandedKeys.has(key);
              const isFocused = focusedKey === key;
              const isEven = ri % 2 === 0;
              const stickyBg = isEven ? "bg-surface" : "bg-bg";

              return (
                <Fragment key={key}>
                  <tr
                    ref={(el) => {
                      if (el) rowRefs.current.set(key, el);
                      else rowRefs.current.delete(key);
                    }}
                    onMouseEnter={() => onRowHover?.(row)}
                    onClick={() => {
                      // Open wins over expand, matching the keyboard model
                      // (Enter opens, Space expands). Expandable rows used to
                      // swallow the click, so a row painted with the accent
                      // "openable" edge could never actually be opened.
                      setFocusedKey(key);
                      if (onOpen) onOpen(row);
                      else if (expandedRender) toggleExpand(key);
                    }}
                    className={[
                      "cursor-pointer transition-colors hover:bg-raised scroll-mt-[var(--nav-h)]",
                      onOpen ? "hover:shadow-[inset_2px_0_0_0_var(--accent)]" : "",
                      isEven ? "bg-surface" : "bg-bg",
                      isFocused ? "bg-elevated ring-1 ring-inset ring-accent" : "",
                    ].join(" ")}
                  >
                    {columns.map((col, ci) => (
                      <td
                        key={col.key}
                        className={[
                          "px-3 py-2 border-b border-line",
                          alignClass(col.align),
                          col.align === "right" ? "tabular-nums" : "",
                          ci === 0
                            ? `sticky left-0 ${stickyBg} border-r border-line`
                            : "",
                        ].join(" ")}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                    {expandedRender && (
                      <td className="w-8 border-b border-line px-1 py-2 text-right">
                        <button
                          type="button"
                          aria-label={isExpanded ? "Hide details" : "Show details"}
                          aria-expanded={isExpanded}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFocusedKey(key);
                            toggleExpand(key);
                          }}
                          className="rounded p-0.5 text-muted hover:bg-raised hover:text-foreground"
                        >
                          <ChevronRight
                            size={13}
                            className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          />
                        </button>
                      </td>
                    )}
                  </tr>
                  {expandedRender && isExpanded && (
                    <tr>
                      <td colSpan={columns.length + 1} className="border-b border-line bg-elevated">
                        <div className="px-3">{expandedRender(row)}</div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {canScrollLeft && (
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-surface to-transparent" />
      )}
      {canScrollRight && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-surface to-transparent" />
      )}
    </div>
  );
}
